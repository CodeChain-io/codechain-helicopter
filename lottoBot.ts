import { SDK } from "codechain-sdk";
import * as sleep from "sleep";
import * as request from "request";
import * as config from "config";

const options = {
    url: config.get("accounts_url").toString(),
    json: true
};

let max = 0;
const accounts: string[] = [];
const weights: number[] = [];

const payer = config.get("payer.payer").toString();
if (payer === "undefined") {
    console.log("Define payer for sending parcel");
    process.exit(-1);
}

function getRandomAccount(accounts: string[], weights: number[]): string {
    const random: number = Math.floor(Math.random() * max),
        lastIndex: number = weights.length - 1;
    let sum = 0;

    for (let i = 0; i < lastIndex; i++) {
        sum += weights[i];
        if (random < sum) {
            return accounts[i];
        }
    }
    return accounts[lastIndex];
}

function getAccount(): Promise<string> {
    return new Promise(function(resolve, reject) {
        request(options, function(error, _response, body) {
            if (error) reject(new Error(error));
            else {
                for (let i = 0; i < body.length; i++) {
                    const address = body[i]["address"];
                    const balance = parseInt(body[i]["balance"], 10);
                    if (address === payer) {
                        continue;
                    }

                    max += balance;
                    accounts.push(address);
                    weights.push(balance);
                }

                const winner: string = getRandomAccount(accounts, weights);
                resolve(winner);
            }
        });
    });
}

if (typeof require !== "undefined" && require.main === module) {
    const sdk = new SDK({
        server: config.get("rpc_url").toString(),
    });

    (async (): Promise<void> => {
        const keyStore = await sdk.key.createLocalKeyStore();

        const payerPassphrase = config.get("payer.payer_passphrase").toString();

        if (payerPassphrase === "undefined") {
            console.log("Define payer.payer_passphrase for sending parcel");
            process.exit(-1);
        }

        while (true) {
            const winner = await getAccount();

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
                console.log(winner + " have won the lottery!");

            } catch (err) {
                console.error(err);
            }

            sleep.sleep(120);
        }
    })().catch(console.error);
}
