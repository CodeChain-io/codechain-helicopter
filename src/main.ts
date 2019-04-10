import { H256 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { TransferAsset } from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as sleep from "sleep";
import { airdropCCCTransaction } from "./airdropCCC";
import { airdropOilTransaction, handlePendingInfos } from "./airdropOil";
import { unwrapCCCTransaction } from "./unwrapCCC";
import { containsTransaction, PayerInfo } from "./util";
import { wrapCCCTransaction } from "./wrapCCC";

export async function main(
    sdk: SDK,
    keyStore: KeyStore,
    params: {
        cccRecipient: string | null;
        excludedAccountList: string[];
        dropInterval: number;
        reward: number;
        payerPassphrase: string;
        payer: string;
        oil: {
            tracker: H256;
            owner: string;
            passphrase: string;
            asset: Asset;
        } | null;
    }
) {
    const {
        cccRecipient,
        excludedAccountList,
        dropInterval,
        reward,
        payerPassphrase,
        payer,
        oil
    } = params;

    const payerInfo = new PayerInfo(sdk, payer, payerPassphrase, keyStore);

    let pendingOilInfos = [];
    let lastSuccessfulAsset: Asset | undefined;

    while (true) {
        try {
            const transaction = await airdropCCCTransaction(
                sdk,
                excludedAccountList,
                reward
            );
            await payerInfo.sendTransaction(transaction, 100);
            console.log("CCC is airdropped");
        } catch (err) {
            console.error(err);
        }
        sleep.sleep(dropInterval);

        if (cccRecipient) {
            try {
                const wrapCCC = await wrapCCCTransaction(
                    sdk,
                    payer,
                    reward,
                    cccRecipient
                );
                const wrapTxHash = await payerInfo.sendTransaction(
                    wrapCCC,
                    100000
                );
                console.log(
                    `CCC is wrapped with transaction hash ${wrapTxHash}`
                );
                sleep.sleep(dropInterval);

                const unwrapCCC = await unwrapCCCTransaction(
                    sdk,
                    wrapCCC,
                    payer
                );
                const unwrapTxHash = await payerInfo.sendTransaction(
                    unwrapCCC,
                    100
                );
                console.log(
                    `CCC is unwrapped with transaction hash ${unwrapTxHash}`
                );
            } catch (err) {
                console.error(err);
            }
            sleep.sleep(dropInterval);
        }

        if (oil) {
            if (Math.random() < 0.1) {
                continue;
            }
            try {
                if (lastSuccessfulAsset === undefined) {
                    lastSuccessfulAsset = oil.asset;
                }
                const handlingResult = await handlePendingInfos(
                    sdk,
                    pendingOilInfos,
                    lastSuccessfulAsset
                );

                lastSuccessfulAsset = handlingResult.lastSuccessfulAsset;
                if (handlingResult.resetAsset) {
                    oil.asset = lastSuccessfulAsset;
                    pendingOilInfos = [];
                }

                const [oilTransaction, newOilAsset]: [
                    TransferAsset,
                    Asset
                ] = await airdropOilTransaction(
                    sdk,
                    oil.asset,
                    oil.owner,
                    oil.passphrase,
                    keyStore,
                    dropInterval
                );
                const sentOilTransactionHash = await payerInfo.sendTransaction(
                    oilTransaction,
                    100
                );
                console.log(
                    `Oil transaction with hash ${sentOilTransactionHash.toEncodeObject()} has been sent`
                );
                console.log(
                    `Oil is airdropped: ${oil.asset.outPoint.tracker.toEncodeObject()} => ${newOilAsset.outPoint.tracker.toEncodeObject()}`
                );

                oil.asset = newOilAsset;
                sleep.sleep(dropInterval);

                const invoice = await containsTransaction(
                    sdk,
                    sentOilTransactionHash
                );
                const isTrasnactionCompleted = invoice;
                const isTransactionNotCompleted = !invoice;

                if (isTrasnactionCompleted) {
                    lastSuccessfulAsset = newOilAsset;
                    pendingOilInfos = [];
                } else if (isTransactionNotCompleted) {
                    const info: { txHash: H256; oilAsset: Asset } = {
                        txHash: sentOilTransactionHash,
                        oilAsset: newOilAsset
                    };
                    pendingOilInfos.push(info);
                } else {
                    // the transaction failed
                    oil.asset = lastSuccessfulAsset;
                }
            } catch (err) {
                console.error(err);
                sleep.sleep(dropInterval);
            }
        }
    }
}
