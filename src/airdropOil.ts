import { H160, H256, U64 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { TransferAsset } from "codechain-sdk/lib/core/classes";
import { Script } from "codechain-sdk/lib/core/Script";
import { AssetTransferOutput } from "codechain-sdk/lib/core/transaction/AssetTransferOutput";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import { blake160 } from "codechain-sdk/lib/utils";
import { containsTransaction } from "./util";

const airdropOilWaitingLimit = 10;

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

export async function airdropOilTransaction(
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

export async function handlePendingInfos(
    sdk: SDK,
    pendingOilInfos: { txHash: H256; oilAsset: Asset }[],
    prevLastSuccessful: Asset
) {
    let lastSuccessfulAsset = prevLastSuccessful;
    while (pendingOilInfos.length !== 0) {
        const info = pendingOilInfos[0];
        const result = await containsTransaction(sdk, info.txHash);

        if (!result) {
            const ifExpirationLimitExceeded =
                pendingOilInfos.length > airdropOilWaitingLimit;
            if (ifExpirationLimitExceeded) {
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
