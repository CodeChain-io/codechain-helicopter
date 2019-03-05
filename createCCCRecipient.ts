import { AssetTransferAddress } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { getConfig } from "./util";

async function main() {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });
    const cccRecipient = await sdk.key
        .createAssetTransferAddress({
            type: "P2PKHBurn"
        })
        .then((value: AssetTransferAddress) => value.toString());

    console.log(`ccc recipient: ${cccRecipient}`);
}

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
