import { SDK } from "codechain-sdk";
import { MintAsset } from "codechain-sdk/lib/core/classes";
import { calculateSeq, getConfig, sendTransaction } from "./util";

function createMintOilTx(sdk: SDK, oilOwner: string): MintAsset {
    const assetAcheme = sdk.core.createAssetScheme({
        shardId: 0,
        metadata: JSON.stringify({
            name: "petrol",
            description: "A helicopter needs petrol",
            icon_url:
                "https://cdn.pixabay.com/photo/2013/07/12/12/52/oil-146440_960_720.png"
        }),
        supply: 1e10
    });
    return sdk.core.createMintAssetTransaction({
        scheme: assetAcheme,
        recipient: oilOwner
    });
}

async function main() {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });

    const oilOwner = getConfig<string>("oil.owner");
    const payer = getConfig<string>("payer.payer");
    const payerPassphrase = getConfig<string>("payer.passphrase");

    const mintOilTx = createMintOilTx(sdk, oilOwner);

    const seq = await calculateSeq(sdk, payer);

    const keyStore = await sdk.key.createLocalKeyStore();
    await sendTransaction(
        sdk,
        payer,
        payerPassphrase,
        keyStore,
        seq,
        mintOilTx
    );

    console.log(`oil: ${mintOilTx.hash().toEncodeObject()}`);
}

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
