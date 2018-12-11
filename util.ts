import { SDK } from "codechain-sdk";
import { Transaction } from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";

export async function calculateSeq(sdk: SDK, payer: string): Promise<number> {
    const prevSeq = await sdk.rpc.chain.getSeq(payer);
    const pendingTransactions = await sdk.rpc.chain.getPendingTransactions();
    const payerTransactions = pendingTransactions.filter(
        transaction =>
            transaction.getSignerAccountId().value ===
            SDK.Core.classes.PlatformAddress.ensure(payer).accountId.value
    );

    if (payerTransactions.length === 0) {
        return await sdk.rpc.chain.getSeq(payer);
    }
    return prevSeq + payerTransactions.length;
}

export async function sendTransaction(
    sdk: SDK,
    account: string,
    passphrase: string,
    keyStore: KeyStore,
    seq: number,
    transaction: Transaction
): Promise<void> {
    const signedTransaction = await sdk.key.signTransaction(transaction, {
        account,
        keyStore,
        fee: 10,
        seq,
        passphrase
    });
    await sdk.rpc.chain.sendSignedTransaction(signedTransaction);
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
