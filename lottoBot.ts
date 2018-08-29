import { SDK } from "codechain-sdk";
import * as sleep from "sleep";
import * as request from "request-promise-native";
import * as config from "config";

const DROP_INTERVAL = 120; // seconds

interface Account {
    address: string,
    balance: number
};

function getRandomAccount(accounts: Account[], totalBalance: number): string {
    const random: number = Math.floor(Math.random() * totalBalance);
    const lastIndex: number = accounts.length - 1;
    let sum = 0;

    for (let i = 0; i < lastIndex; i++) {
        sum += accounts[i].balance;
        if (random < sum) {
            return accounts[i].address;
        }
    }
    return accounts[lastIndex].address;
}

async function fetchAccounts(): Promise<Account[]> {
    const items: [{ address: string, balance: string }] = await request({
        url: config.get("accounts_url").toString(),
        json: true
    });

    return items.map((item) => {
        const address = item["address"];
        const balance = parseInt(item["balance"], 10);
        return { address, balance };
    });
}

async function chooseAccount(payer: string): Promise<string> {
    const accounts = (await fetchAccounts()).filter((account) => account.address !== payer);
    let totalBalance = accounts.reduce((acc, account) => acc + account.balance, 0);
    return getRandomAccount(accounts, totalBalance);
}

if (typeof require !== "undefined" && require.main === module) {
    const sdk = new SDK({
        server: config.get("rpc_url").toString(),
    });

    (async (): Promise<void> => {
        const keyStore = await sdk.key.createLocalKeyStore();

        const payer = config.get("payer.payer").toString();
        if (payer === "undefined") {
            console.log("payer.payer is not specified");
            process.exit(-1);
        }

        const payerPassphrase = config.get("payer.payer_passphrase").toString();
        if (payerPassphrase === "undefined") {
            console.log("payer.payer_passphrase is not specified");
            process.exit(-1);
        }

        while (true) {
            const winner = await chooseAccount(payer);

            const parcel = sdk.core.createPaymentParcel({
                recipient: winner,
                amount: 1
            });

            const nonce = await sdk.rpc.chain.getNonce(payer);

            if (nonce === null) {
                throw Error("Unreachable");
            }

            try {
                const signedParcel = await sdk.key.signParcel(parcel, {
                    account: payer,
                    keyStore,
                    fee: 10,
                    nonce,
                    passphrase: payerPassphrase,
                });
                await sdk.rpc.chain.sendSignedParcel(signedParcel);
                console.log(winner + " has won the lottery!");

            } catch (err) {
                console.error(err);
            }

            sleep.sleep(DROP_INTERVAL);
        }
    })().catch(console.error);
}
