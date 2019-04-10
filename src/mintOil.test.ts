import { expect } from "chai";
import { SDK } from "codechain-sdk";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import "mocha";
import { tmpdir } from "os";
import * as randomstring from "randomstring";
import { createMintOilTx, sendMintOilTx } from "./mintOil";
import { getConfig } from "./util";

export const faucetSecret =
    "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
export const faucetAccointId = SDK.util.getAccountIdFromPrivate(faucetSecret); // 6fe64ffa3a46c074226457c90ccb32dc06ccced1
export const faucetAddress = SDK.Core.classes.PlatformAddress.fromAccountId(
    faucetAccointId,
    { networkId: "tc" }
); // tccq9h7vnl68frvqapzv3tujrxtxtwqdnxw6yamrrgd

const dbPath = `${tmpdir()}/${randomstring.generate({
    length: 12,
    charset: "alphabetic"
})}`;
const rpcUrl = getConfig<string>("rpc_url");
const networkId = getConfig<string>("network_id");
const sdk = new SDK({ server: rpcUrl, networkId });

describe("mint oil", async function() {
    let keyStore: KeyStore;
    let passphrase: string;
    let payer: string;

    before(async function() {
        keyStore = await sdk.key.createLocalKeyStore(dbPath);
        passphrase = "pass";
        payer = (await sdk.key.createPlatformAddress({ keyStore, passphrase }))
            .value;

        const seq = await sdk.rpc.chain.getSeq(faucetAddress);
        const pay = sdk.core
            .createPayTransaction({ recipient: payer, quantity: 300000 })
            .sign({ secret: faucetSecret, seq, fee: 10 });
        await sdk.rpc.chain.sendSignedTransaction(pay);
    });

    it("Mint", async function() {
        const oilOwner = (await sdk.key.createAssetAddress({
            keyStore,
            passphrase: "pass"
        })).toString();
        const mintOilTx = createMintOilTx(sdk, oilOwner);

        expect(
            await sdk.rpc.chain.getAssetSchemeByType(
                mintOilTx.getAssetType(),
                0
            )
        ).is.null;

        const oil = await sendMintOilTx(sdk, {
            payer,
            passphrase,
            keyStore,
            mintOilTx
        });
        expect(mintOilTx.getAssetType().value).equal(oil.assetType.value);

        expect(await sdk.rpc.chain.getAssetSchemeByType(oil.assetType, 0)).is
            .not.null;
    });
});
