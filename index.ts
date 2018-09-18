import { BigNumber } from "bignumber.js";
import { SDK } from "codechain-sdk";
import { Parcel } from "codechain-sdk/lib/core/Parcel";
import * as config from "config";
import * as request from "request-promise-native";
import * as sleep from "sleep";
import { calculateNonce, sendParcel } from "./util";

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
        url: config.get("accounts_url").toString(),
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

async function main() {
    const rpcUrl = config.get<string>("rpc_url");
    if (!rpcUrl) {
        throw new Error("rpc_url is not specified");
    }
    const sdk = new SDK({ server: rpcUrl });

    const keyStore = await sdk.key.createLocalKeyStore();

    const payer = config.get<string>("payer.payer");
    if (!payer) {
        throw new Error("payer.payer is not specified");
    }

    const payerPassphrase = config.get<string>("payer.payer_passphrase");
    if (!payerPassphrase) {
        throw new Error("payer.payer_passphrase is not specified");
    }

    const reward = config.get<number>("reward");
    if (!reward) {
        throw new Error("reward is not specified");
    }
    const dropInterval = config.get<number>("drop_interval");
    const excludedAccountList = config.get<string[]>("exclude");

    let nonce = await calculateNonce(sdk, payer);

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

        sleep.sleep(dropInterval);
    }
}

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
