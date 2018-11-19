import { SDK } from "codechain-sdk";
import { Parcel } from "codechain-sdk/lib/core/Parcel";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";

export async function calculateSeq(sdk: SDK, payer: string): Promise<number> {
    const prevSeq = await sdk.rpc.chain.getSeq(payer);
    const pendingParcels = await sdk.rpc.chain.getPendingParcels();
    const payerParcels = pendingParcels.filter(
        parcel =>
            parcel.getSignerAccountId().value ===
            SDK.Core.classes.PlatformAddress.ensure(payer).accountId.value
    );

    if (payerParcels.length === 0) {
        return await sdk.rpc.chain.getSeq(payer);
    }
    return prevSeq + payerParcels.length;
}

export async function sendParcel(
    sdk: SDK,
    account: string,
    passphrase: string,
    keyStore: KeyStore,
    seq: number,
    parcel: Parcel
): Promise<void> {
    const signedParcel = await sdk.key.signParcel(parcel, {
        account,
        keyStore,
        fee: 10,
        seq,
        passphrase
    });
    await sdk.rpc.chain.sendSignedParcel(signedParcel);
}

export function getConfig<T>(field: string): T {
    const c = config.get<T>(field);
    if (c == null) {
        throw new Error(`${field} is not specified`);
    }
    return c;
}

export function haveConfig(field: string): boolean {
    return !!config.has(field) && config.get(field) != null;
}
