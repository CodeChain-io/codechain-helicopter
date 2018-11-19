import { SDK } from "codechain-sdk";
import { AssetMintTransaction } from "codechain-sdk/lib/core/transaction/AssetMintTransaction";
import { calculateSeq, getConfig, sendParcel } from "./util";

function createMintOilTx(sdk: SDK, oilOwner: string): AssetMintTransaction {
    const assetAcheme = sdk.core.createAssetScheme({
        shardId: 0,
        metadata: JSON.stringify({
            name: "petrol",
            description: "A helicopter needs petrol",
            icon_url:
                "https://cdn.pixabay.com/photo/2013/07/12/12/52/oil-146440_960_720.png"
        }),
        amount: 1e10
    });
    return sdk.core.createAssetMintTransaction({
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

    const mintParcel = sdk.core.createAssetTransactionParcel({
        transaction: mintOilTx
    });

    const seq = await calculateSeq(sdk, payer);

    const keyStore = await sdk.key.createLocalKeyStore();
    await sendParcel(sdk, payer, payerPassphrase, keyStore, seq, mintParcel);

    console.log(`oil: ${mintOilTx.hash().toEncodeObject()}`);
}

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
