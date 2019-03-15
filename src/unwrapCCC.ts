import { SDK } from "codechain-sdk";
import { UnwrapCCC, WrapCCC } from "codechain-sdk/lib/core/classes";

export async function unwrapCCCTransaction(
    sdk: SDK,
    prevWrapped: WrapCCC,
    receiver: string
): Promise<UnwrapCCC> {
    const unwrapCCCTx = sdk.core.createUnwrapCCCTransaction({
        burn: prevWrapped.getAsset(),
        receiver,
        networkId: sdk.networkId
    });
    await sdk.key.signTransactionBurn(unwrapCCCTx, 0);
    return unwrapCCCTx;
}
