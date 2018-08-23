import { SDK } from "codechain-sdk";
import * as sleep from "sleep";
import * as request from "request";
import { U256 } from "codechain-sdk/lib/core/U256";

const options = {
    url: 'https://husky.codechain.io/explorer/api/accounts',
    json: true
}

let max: number = 0;
let accounts: string[] = [];
let weights: number[] = [];

const payer: string = '';
const payer_passphrase: string = '';
const payer_secret_code: string = '';
const is_signed: boolean = false;

function getRandomAccount(accounts: string[], weights: number[]): string {
    const random: number = Math.floor(Math.random() * max),
        lastIndex: number = weights.length - 1;
    let sum: number = 0;

    for (var i = 0; i < lastIndex; i++) {
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
                for (var i = 0; i < body.length; i++) {
                    const address = body[i]['address'];
                    const balance = parseInt(body[i]['balance'], 10);
                    if (address == payer) {
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

if (typeof require != 'undefined' && require.main == module) {
    const sdk = new SDK({
        server: "http://52.79.108.1:8080"
    });

    (async(): Promise<void> => {
        while (true) {
            const winner = await getAccount()
            
            const parcel = sdk.core.createPaymentParcel({
                recipient: winner,
                amount: 1
            });

            const nonce = await sdk.rpc.chain.getNonce(payer) as U256;

            try {

                if (is_signed) {
                    await sdk.rpc.chain.sendParcel(parcel, {
                        account: payer,
                        passphrase: payer_passphrase,
                        fee: 20,
                        nonce
                    });
                } else {
                    await sdk.rpc.chain.sendSignedParcel(parcel.sign({
                        secret: payer_secret_code,
                        fee: 10,
                        nonce
                    }));
                }
                console.log(winner + ' have won the lottery!')
            
            } catch (err) {
                console.error(err);
            }

            sleep.sleep(5)
        }
    })().catch(console.error);
}
