import { BigNumber } from "bignumber.js";
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
import { calculateSeq, getConfig, haveConfig, sendTransaction } from "./util";

const airdropOilWaitingLimit = 10;

interface Account {
    address: string;
    balance: BigNumber;
}

function getRandomAccount(accounts: Account[]): string {
    const totalBalance = accounts.reduce(
        (acc, account) => account.balance.plus(acc),
        new BigNumber(0)
    );
    const random = new BigNumber(Math.random()).multipliedBy(totalBalance);
    let sum = new BigNumber(0);

    for (const account of accounts) {
        sum = sum.plus(account.balance);
        if (random.isLessThan(sum)) {
            return account.address;
        }
    }
    throw new Error("unreachable");
}

async function fetchAccounts(): Promise<Account[]> {
    const items: { address: string; balance: string }[] = await request({
        url: getConfig<string>("accounts_url").toString(),
        json: true
    });

    return items.map(item => {
        const address = item.address;
        const balance = new BigNumber(item.balance, 10);
        return { address, balance };
    });
}

async function chooseAccount(
    payer: string,
    excludedAccountList: string[]
): Promise<string> {
    const accounts = (await fetchAccounts()).filter(
        account =>
            account.address !== payer &&
            !account.balance.isZero() &&
            excludedAccountList.indexOf(account.address) === -1
    );
    return getRandomAccount(accounts);
}

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

async function getOilFromConfig(sdk: SDK) {
    if (haveConfig("oil.tx")) {
        const tx = new H256(getConfig<string>("oil.tx"));
        const owner = getConfig<string>("oil.owner");
        const passphrase = getConfig<string>("oil.passphrase");
        const asset = await sdk.rpc.chain.getAsset(tx, 0, 0);
        if (!asset) {
            throw new Error("Cannot get an oil asset");
        }
        return {
            tx,
            owner,
            passphrase,
            asset
        };
    }
    return null;
}

async function getInvoice(sdk: SDK, txHash: H256): Promise<boolean | null> {
    return sdk.rpc.chain.getInvoice(txHash);
}

async function handlePendingInfos(
    sdk: SDK,
    pendingOilInfos: { txHash: H256; oilAsset: Asset }[],
    prevLastSuccessful: Asset
) {
    let lastSuccessfulAsset = prevLastSuccessful;
    while (pendingOilInfos.length !== 0) {
        const info = pendingOilInfos[0];
        const invoice = await getInvoice(sdk, info.txHash);

        const ifExpirationLimitExceeded =
            invoice === null && pendingOilInfos.length > airdropOilWaitingLimit;
        const ifFailsInTheMiddle = invoice === false;

        if (!invoice) {
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
    const reward = getConfig<number>("reward");

    const dropInterval = getConfig<number>("drop_interval");
    const excludedAccountList = getConfig<string[]>("exclude");

    const oil = await getOilFromConfig(sdk);

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
            const seq = await calculateSeq(sdk, payer);
            await sendTransaction(
                sdk,
                payer,
                payerPassphrase,
                keyStore,
                seq,
                transaction
            );
            console.log("CCC is airdropped");
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
                const seq = await calculateSeq(sdk, payer);
                const sentOilTransactionHash = await sendTransaction(
                    sdk,
                    payer,
                    payerPassphrase,
                    keyStore,
                    seq,
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

                const invoice = await getInvoice(sdk, sentOilTransactionHash);
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
