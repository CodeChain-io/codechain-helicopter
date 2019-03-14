import { H256 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { TransferAsset } from "codechain-sdk/lib/core/classes";
import * as sleep from "sleep";
import { airdropCCCTransaction } from "./airdropCCC";
import { airdropOilTransaction, handlePendingInfos } from "./airdropOil";
import { unwrapCCCTransaction } from "./unwrapCCC";
import {
    getConfig,
    getOilFromConfig,
    getTransactionResult,
    PayerInfo
} from "./util";
import { wrapCCCTransaction } from "./wrapCCC";

export async function main() {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });
    const keyStore = await sdk.key.createLocalKeyStore();
    const payer = getConfig<string>("payer.payer");
    const payerPassphrase = getConfig<string>("payer.passphrase");

    const payerInfo = new PayerInfo(sdk, payer, payerPassphrase, keyStore);
    const reward = getConfig<number>("reward");

    const dropInterval = getConfig<number>("drop_interval");
    const excludedAccountList = getConfig<string[]>("exclude");

    const oil = await getOilFromConfig(sdk);
    const cccRecipient = getConfig<string>("ccc_recipient");

    let pendingOilInfos = [];
    let lastSuccessfulAsset: Asset | undefined;

    while (true) {
        try {
            const transaction = await airdropCCCTransaction(
                sdk,
                payer,
                excludedAccountList,
                reward
            );
            await payerInfo.sendTransaction(transaction);
            console.log("CCC is airdropped");
        } catch (err) {
            console.error(err);
        }
        sleep.sleep(dropInterval);

        try {
            const wrapCCC = await wrapCCCTransaction(
                sdk,
                payer,
                reward,
                cccRecipient
            );
            const wrapTxHash = await payerInfo.sendTransaction(wrapCCC);
            console.log(`CCC is wrapped with transaction hash ${wrapTxHash}`);
            sleep.sleep(dropInterval);

            const unwrapCCC = await unwrapCCCTransaction(
                sdk,
                wrapCCC,
                payer,
                networkId
            );
            const unwrapTxHash = await payerInfo.sendTransaction(unwrapCCC);
            console.log(
                `CCC is unwrapped with transaction hash ${unwrapTxHash}`
            );
        } catch (err) {
            console.error(err);
        }
        sleep.sleep(dropInterval);

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
                    oilTransaction
                );
                console.log(
                    `Oil transaction with hash ${sentOilTransactionHash.toEncodeObject()} has been sent`
                );
                console.log(
                    `Oil is airdropped: ${oil.asset.outPoint.tracker.toEncodeObject()} => ${newOilAsset.outPoint.tracker.toEncodeObject()}`
                );

                oil.asset = newOilAsset;
                sleep.sleep(dropInterval);

                const invoice = await getTransactionResult(
                    sdk,
                    sentOilTransactionHash
                );
                const isTrasnactionCompleted = invoice === true;
                const isTransactionNotCompleted = invoice === null;

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
