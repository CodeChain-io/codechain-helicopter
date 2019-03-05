import { SDK } from "codechain-sdk";
import { WrapCCC } from "codechain-sdk/lib/core/classes";

export async function wrapCCCTransaction(
    sdk: SDK,
    payer: string,
    quantity: number,
    recipient: string
): Promise<WrapCCC> {
    const shardId = 0;
    return sdk.core.createWrapCCCTransaction({
        shardId,
        recipient,
        quantity,
        payer
    });
}
