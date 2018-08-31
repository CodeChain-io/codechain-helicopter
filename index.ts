import { BigNumber } from "bignumber.js";
import { SDK } from "codechain-sdk";
import { U256 } from "codechain-sdk/lib/core/U256";
import * as config from "config";
import * as request from "request-promise-native";
import * as sleep from "sleep";

interface Account {
    address: string;
    balance: BigNumber;
}

async function calculateNonce(sdk: SDK, payer: string): Promise<U256> {
    const prevNonce = await sdk.rpc.chain.getNonce(payer);
    const pendingParcels = await sdk.rpc.chain.getPendingParcels();
    const payerParcels = pendingParcels.filter(
        parcel => parcel.getSignerAddress().value === payer
    );

    if (payerParcels.length === 0) {
        return await sdk.rpc.chain.getNonce(payer);
    }
    return new U256(prevNonce.value.plus(payerParcels.length));
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

async function main() {
    const rpcUrl = config.get<string>("rpc_url");
    if (!rpcUrl) {
        console.error("rpc_url is not specified");
        process.exit(-1);
    }
    const sdk = new SDK({ server: rpcUrl });

    const keyStore = await sdk.key.createLocalKeyStore();

    const payer = config.get<string>("payer.payer");
    if (!payer) {
        console.error("payer.payer is not specified");
        process.exit(-1);
    }

    const payerPassphrase = config.get<string>("payer.payer_passphrase");
    if (!payerPassphrase) {
        console.error("payer.payer_passphrase is not specified");
        process.exit(-1);
    }

    const reward = config.get<number>("reward");
    if (!reward) {
        console.error("reward is not specified");
        process.exit(-1);
    }
    const dropInterval = config.get<number>("drop_interval");
    const excludedAccountList = config.get<string[]>("exclude");
    while (true) {
        try {
            const winner = await chooseAccount(payer, excludedAccountList);

            const parcel = sdk.core.createPaymentParcel({
                recipient: winner,
                amount: reward
            });

            const nonce = await calculateNonce(sdk, payer);

            const signedParcel = await sdk.key.signParcel(parcel, {
                account: payer,
                keyStore,
                fee: 10,
                nonce,
                passphrase: payerPassphrase
            });
            await sdk.rpc.chain.sendSignedParcel(signedParcel);
            console.log(winner + " has won the lottery!");
        } catch (err) {
            console.error(err);
        }

        sleep.sleep(dropInterval);
    }
}

main();
