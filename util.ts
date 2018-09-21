import { SDK } from "codechain-sdk";
import { Parcel } from "codechain-sdk/lib/core/Parcel";
import { U256 } from "codechain-sdk/lib/core/U256";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";

export async function calculateNonce(sdk: SDK, payer: string): Promise<U256> {
    const prevNonce = await sdk.rpc.chain.getNonce(payer);
    const pendingParcels = await sdk.rpc.chain.getPendingParcels();
    const payerParcels = pendingParcels.filter(
        parcel => parcel.getSignerAddress().value === payer
    );

    if (payerParcels.length === 0) {
        return await sdk.rpc.chain.getNonce(payer);
    }
    return new U256(prevNonce.value.plus(payerParcels.length));
}

export async function sendParcel(
    sdk: SDK,
    account: string,
    passphrase: string,
    keyStore: KeyStore,
    nonce: U256,
    parcel: Parcel
): Promise<U256> {
    const signedParcel = await sdk.key.signParcel(parcel, {
        account,
        keyStore,
        fee: 10,
        nonce,
        passphrase
    });
    await sdk.rpc.chain.sendSignedParcel(signedParcel);
    return nonce.increase();
}

export function getConfig<T>(field: string): T {
    const c = config.get<T>(field);
    if (c == null) {
        throw new Error(`${field} is not specified`);
    }
    return c;
}

export function haveConfig(field: string): boolean {
    return !!config.has(field);
}
