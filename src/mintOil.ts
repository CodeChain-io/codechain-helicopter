import { SDK } from "codechain-sdk";
import { Asset, MintAsset } from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import { calculateSeq, getConfig, sendTransaction } from "./util";

export function createMintOilTx(sdk: SDK, oilOwner: string): MintAsset {
    const scheme = sdk.core.createAssetScheme({
        shardId: 0,
        metadata: JSON.stringify({
            name: "petrol",
            description: "A helicopter needs petrol",
            icon_url:
                "https://cdn.pixabay.com/photo/2013/07/12/12/52/oil-146440_960_720.png",
            minted_at: Date().toString()
        }),
        supply: 1e10
    });
    return sdk.core.createMintAssetTransaction({
        scheme,
        recipient: oilOwner
    });
}

export async function sendMintOilTx(
    sdk: SDK,
    params: {
        payer: string;
        passphrase: string;
        keyStore: KeyStore;
        mintOilTx: MintAsset;
    }
): Promise<Asset> {
    const { payer, passphrase, keyStore, mintOilTx } = params;

    const seq = await calculateSeq(sdk, payer);

    await sendTransaction(
        sdk,
        payer,
        passphrase,
        keyStore,
        seq,
        100000,
        mintOilTx
    );

    return mintOilTx.getMintedAsset();
}

async function main() {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });

    const oilOwner = getConfig<string>("oil.owner");
    const payer = getConfig<string>("payer.payer");
    const payerPassphrase = getConfig<string>("payer.passphrase");

    const keyStore = await sdk.key.createLocalKeyStore();
    const mintOilTx = createMintOilTx(sdk, oilOwner);
    const mintedOil = await sendMintOilTx(sdk, {
        payer,
        passphrase: payerPassphrase,
        keyStore,
        mintOilTx
    });

    console.log(`Asset type of oil: ${mintedOil.assetType.toEncodeObject()}`);
}

if (require.main === module) {
    main()
        .then(() => console.log("finish"))
        .catch(err => console.error(err));
}
