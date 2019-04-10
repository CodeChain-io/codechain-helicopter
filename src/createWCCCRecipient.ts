import { AssetAddress } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { getConfig } from "./util";

export async function createWCCCRecipient(sdk: SDK): Promise<AssetAddress> {
    return await sdk.key.createAssetAddress({
        type: "P2PKHBurn"
    });
}

async function main(): Promise<string> {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });
    const addr = await createWCCCRecipient(sdk);
    return addr.toString();
}

if (require.main === module) {
    main()
        .then(addr => {
            console.log(`WCCC recipient: ${addr}`);
        })
        .catch(err => console.error(err));
}
