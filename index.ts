import { BigNumber } from "bignumber.js";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { H256 } from "codechain-sdk/lib/core/H256";
import { Parcel } from "codechain-sdk/lib/core/Parcel";
import { Script } from "codechain-sdk/lib/core/Script";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import { blake256 } from "codechain-sdk/lib/utils";
import * as request from "request-promise-native";
import * as sleep from "sleep";
import { calculateNonce, getConfig, sendParcel } from "./util";

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

async function airdropCCCParcel(
    sdk: SDK,
    payer: string,
    excludedAccountList: string[],
    amount: number
): Promise<Parcel> {
    const recipient = await chooseAccount(payer, excludedAccountList);

    console.log(`${recipient} has won the lottery!`);

    return sdk.core.createPaymentParcel({
        recipient,
        amount
    });
}

async function airdropOilParcel(
    sdk: SDK,
    oilAsset: Asset,
    oilOwner: string,
    oilPassphrase: string,
    keyStore: KeyStore
): Promise<[Parcel, Asset]> {
    const tx = sdk.core.createAssetTransferTransaction();
    tx.addInputs(oilAsset);

    const burnScript = Buffer.from([Script.Opcode.BURN]);
    tx.addOutputs(
        {
            recipient: oilOwner,
            amount: oilAsset.amount - 1,
            assetType: oilAsset.assetType
        },
        new sdk.core.classes.AssetTransferOutput({
            lockScriptHash: H256.ensure(blake256(burnScript)),
            parameters: [],
            assetType: oilAsset.assetType,
            amount: 1
        })
    );

    await sdk.key.signTransactionInput(tx, 0, {
        keyStore,
        passphrase: oilPassphrase
    });
    return [
        sdk.core.createAssetTransactionGroupParcel({
            transactions: [tx]
        }),
        tx.getTransferredAsset(0)
    ];
}

async function main() {
    const rpcUrl = getConfig<string>("rpc_url");

    const sdk = new SDK({ server: rpcUrl });

    const keyStore = await sdk.key.createLocalKeyStore();

    const payer = getConfig<string>("payer.payer");

    const payerPassphrase = getConfig<string>("payer.passphrase");
    const reward = getConfig<number>("reward");

    const dropInterval = getConfig<number>("drop_interval");
    const excludedAccountList = getConfig<string[]>("exclude");

    let nonce = await calculateNonce(sdk, payer);

    const oilTx = new H256(getConfig<string>("oil.tx"));
    const oilOwner = getConfig<string>("oil.owner");
    const oilPassphrase = getConfig<string>("oil.passphrase");

    let oilAsset = await sdk.rpc.chain.getAsset(oilTx, 0);
    if (!oilAsset) {
        throw new Error("Cannot get an oil asset");
    }

    while (true) {
        try {
            const parcel = await airdropCCCParcel(
                sdk,
                payer,
                excludedAccountList,
                reward
            );
            nonce = await sendParcel(
                sdk,
                payer,
                payerPassphrase,
                keyStore,
                nonce,
                parcel
            );
            console.log("CCC is airdropped");
        } catch (err) {
            console.error(err);
        }

        try {
            const [oilParcel, newOilAsset]: [
                Parcel,
                Asset
            ] = await airdropOilParcel(
                sdk,
                oilAsset,
                oilOwner,
                oilPassphrase,
                keyStore
            );
            nonce = await sendParcel(
                sdk,
                payer,
                payerPassphrase,
                keyStore,
                nonce,
                oilParcel
            );
            console.log(
                `Oil is airdropped: ${oilAsset.outPoint.transactionHash.toEncodeObject()} => ${newOilAsset.outPoint.transactionHash.toEncodeObject()}`
            );
            oilAsset = newOilAsset;
        } catch (err) {
            console.error(err);
        }

        sleep.sleep(dropInterval);
    }
}

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
