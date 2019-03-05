import { H160, H256, U64 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { Pay, TransferAsset } from "codechain-sdk/lib/core/classes";
import { Script } from "codechain-sdk/lib/core/Script";
import { AssetTransferOutput } from "codechain-sdk/lib/core/transaction/AssetTransferOutput";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import { blake160 } from "codechain-sdk/lib/utils";
import * as request from "request-promise-native";
import * as sleep from "sleep";
import { unwrapCCCTransaction } from "./unwrapCCC";
import { chooseAccount, getConfig, haveConfig, PayerInfo } from "./util";
import { wrapCCCTransaction } from "./wrapCCC";

const airdropOilWaitingLimit = 10;

async function airdropCCCTransaction(
    sdk: SDK,
    payer: string,
    excludedAccountList: string[],
    quantity: number
): Promise<Pay> {
    const recipient = await chooseAccount(payer, excludedAccountList);

    console.log(`${recipient} has won the lottery!`);

    return sdk.core.createPayTransaction({
        recipient,
        quantity
    });
}

function transferOutput(
    sdk: SDK,
    assetType: H256,
    script: Buffer,
    shardId: number
): AssetTransferOutput {
    return new sdk.core.classes.AssetTransferOutput({
        lockScriptHash: H160.ensure(blake160(script)),
        parameters: [],
        assetType,
        shardId,
        quantity: new U64(Math.min(10, -Math.floor(Math.log(Math.random()))))
    });
}
function burnOutput(
    sdk: SDK,
    assetType: H256,
    shardId: number
): AssetTransferOutput {
    const burnScript = Buffer.from([Script.Opcode.BURN]);
    return transferOutput(sdk, assetType, burnScript, shardId);
}
function freeOutput(
    sdk: SDK,
    assetType: H256,
    shardId: number
): AssetTransferOutput {
    const freeScript = Buffer.from([Script.Opcode.PUSHB, 1]);
    return transferOutput(sdk, assetType, freeScript, shardId);
}

function addOutput(tx: TransferAsset, output: AssetTransferOutput) {
    if (!output.quantity.isEqualTo(0)) {
        tx.addOutputs(output);
    }
}

async function airdropOilTransaction(
    sdk: SDK,
    oilAsset: Asset,
    oilOwner: string,
    oilPassphrase: string,
    keyStore: KeyStore,
    dropInterval: number
): Promise<[TransferAsset, Asset]> {
    const transaction = sdk.core.createTransferAssetTransaction({
        burns: [],
        inputs: [],
        outputs: [],
        expiration: dropInterval * airdropOilWaitingLimit + Date.now()
    });
    transaction.addInputs(oilAsset);

    const burn = burnOutput(sdk, oilAsset.assetType, oilAsset.shardId);
    const free = freeOutput(sdk, oilAsset.assetType, oilAsset.shardId);

    transaction.addOutputs({
        recipient: oilOwner,
        quantity: U64.minus(
            U64.minus(oilAsset.quantity, burn.quantity),
            free.quantity
        ),
        assetType: oilAsset.assetType,
        shardId: oilAsset.shardId
    });
    if (Math.random() < 0.5) {
        addOutput(transaction, burn);
        addOutput(transaction, free);
    } else {
        addOutput(transaction, free);
        addOutput(transaction, burn);
    }

    await sdk.key.signTransactionInput(transaction, 0, {
        keyStore,
        passphrase: oilPassphrase
    });
    return [transaction, transaction.getTransferredAsset(0)];
}

async function fetchOilTracker(
    owner: string,
    assetType: string
): Promise<H256> {
    const indexerUrl = getConfig<string>("indexer_url");
    const oilUtxoUrl = `${indexerUrl}/api/utxo?address=${owner}&assetType=${assetType}`;
    const utxos: { transactionTracker: string }[] = await request({
        url: oilUtxoUrl,
        json: true
    });
    return new H256(utxos[0].transactionTracker);
}

async function getOilFromConfig(sdk: SDK) {
    if (haveConfig("oil.owner") && haveConfig("oil.asset_type")) {
        const owner = getConfig<string>("oil.owner");
        const passphrase = getConfig<string>("oil.passphrase");
        const assetType = getConfig<string>("oil.asset_type");
        const tracker = await fetchOilTracker(owner, assetType);
        const asset = await sdk.rpc.chain.getAsset(tracker, 0, 0);
        if (!asset) {
            throw new Error("Cannot get an oil asset");
        }
        return {
            tracker,
            owner,
            passphrase,
            asset
        };
    }
    return null;
}

async function getTransactionResult(
    sdk: SDK,
    txHash: H256
): Promise<boolean | null> {
    return sdk.rpc.chain.getTransactionResult(txHash);
}

async function handlePendingInfos(
    sdk: SDK,
    pendingOilInfos: { txHash: H256; oilAsset: Asset }[],
    prevLastSuccessful: Asset
) {
    let lastSuccessfulAsset = prevLastSuccessful;
    while (pendingOilInfos.length !== 0) {
        const info = pendingOilInfos[0];
        const result = await getTransactionResult(sdk, info.txHash);

        const ifExpirationLimitExceeded =
            result === null && pendingOilInfos.length > airdropOilWaitingLimit;
        const ifFailsInTheMiddle = result === false;

        if (!result) {
            if (ifExpirationLimitExceeded || ifFailsInTheMiddle) {
                return {
                    resetAsset: true,
                    lastSuccessfulAsset
                };
            }
            break;
        }
        lastSuccessfulAsset = info.oilAsset;
        pendingOilInfos.shift();
    }
    return {
        resetAsset: false,
        lastSuccessfulAsset
    };
}

async function main() {
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

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
