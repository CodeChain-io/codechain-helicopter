import { SDK } from "codechain-sdk";
import * as sleep from "sleep";
import * as request from "request";
import { U256 } from "codechain-sdk/lib/core/U256";
import * as config from "config";

const options = {
    url: config.get('accounts_url').toString(),
    json: true
};

let max = 0;
const accounts: string[] = [];
const weights: number[] = [];

const payer = config.get('payer.payer').toString();
const is_signed = false;

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
        server: config.get('rpc_url').toString(),
    });

    (async (): Promise<void> => {
        while (true) {
            const winner = await getAccount();

            const parcel = sdk.core.createPaymentParcel({
                recipient: winner,
                amount: 1
            });

            let nonce = await sdk.rpc.chain.getNonce(payer) as U256;

            try {

                if (is_signed) {
                    if (!config.has('payer.payer_passphrase')) {
                        console.log("Define payer.payer_passphrase for sending parcel");
                        process.exit(-1);
                    }
                    const payer_passphrase = config.get('payer.payer_passphrase').toString();

                    await sdk.rpc.chain.sendParcel(parcel, {
                        account: payer,
                        passphrase: payer_passphrase,
                        fee: 10,
                        nonce
                    });
                } else {
                    if (!config.has('payer.payer_secret_code')) {
                        console.log("Define payer.payer_secret_code for signing the parcel");
                        process.exit(-1);
                    }
                    const payer_secret_code = config.get('payer.payer_secret_code').toString();
                    await sdk.rpc.chain.sendSignedParcel(parcel.sign({
                        secret: payer_secret_code,
                        fee: 30,
                        nonce
                    }));
                }
                console.log(winner + " have won the lottery!");

            } catch (err) {
                console.error(err);
            }

            sleep.sleep(120);
        }
    })().catch(console.error);
}
