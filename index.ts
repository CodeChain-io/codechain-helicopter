import { SDK } from "codechain-sdk";

import { main } from "./src/main";
import { getConfig, getOilFromConfig, haveConfig } from "./src/util";

if (require.main === module) {
    (async () => {
        const rpcUrl = getConfig<string>("rpc_url");
        const networkId = getConfig<string>("network_id");
        const sdk = new SDK({ server: rpcUrl, networkId });

        const payer = getConfig<string>("payer.payer");
        const payerPassphrase = getConfig<string>("payer.passphrase");
        const reward = getConfig<number>("reward");
        const dropInterval = getConfig<number>("drop_interval");
        const excludedAccountList = getConfig<string[]>("exclude")
            .concat((await sdk.rpc.chain.getGenesisAccounts()).map(account => account.value));
        excludedAccountList.push(payer);

        const keyStore = await sdk.key.createLocalKeyStore();

        const cccRecipient = (haveConfig("ccc_recipient"))
            ? getConfig<string>("ccc_recipient")
            : null;

        const oil = await getOilFromConfig(sdk);

        await main(sdk, keyStore, { payer, payerPassphrase, reward, dropInterval, excludedAccountList, cccRecipient, oil });
    })();
}
