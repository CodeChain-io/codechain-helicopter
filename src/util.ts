import { BigNumber } from "bignumber.js";
import { H256 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset, Transaction } from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";
import * as request from "request-promise-native";

export async function calculateSeq(sdk: SDK, payer: string): Promise<number> {
    const prevSeq = await sdk.rpc.chain.getSeq(payer);
    const pendingTransactions = await sdk.rpc.chain.getPendingTransactions();
    const payerTransactions = pendingTransactions.transactions.filter(
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
    fee: number,
    transaction: Transaction
): Promise<H256> {
    const signedTransaction = await sdk.key.signTransaction(transaction, {
        account,
        keyStore,
        fee,
        seq,
        passphrase
    });
    return await sdk.rpc.chain.sendSignedTransaction(signedTransaction);
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

interface Account {
    address: string;
    balance: BigNumber;
}

function getRandomAccount(accounts: Account[]): string {
    const totalBalance = accounts.reduce(
        (acc, account) => account.balance.plus(acc),
        new BigNumber(0)
    );
    const random = new BigNumber(Math.random()).multipliedBy(totalBalance);
    let sum = new BigNumber(0);

    for (const account of accounts) {
        sum = sum.plus(account.balance);
        if (random.isLessThan(sum)) {
            return account.address;
        }
    }
    throw new Error("unreachable");
}

async function fetchAccounts(): Promise<Account[]> {
    const indexerUrl = getConfig<string>("indexer_url");
    const accountsUrl = `${indexerUrl}/api/account`;
    const items: { address: string; balance: string }[] = await request({
        url: accountsUrl,
        json: true
    });

    return items.map(item => {
        const address = item.address;
        const balance = new BigNumber(item.balance, 10);
        return { address, balance };
    });
}

export async function chooseAccount(
    excludedAccountList: string[]
): Promise<string> {
    const accounts = (await fetchAccounts()).filter(
        account =>
            !account.balance.isZero() &&
            excludedAccountList.indexOf(account.address) === -1
    );
    return getRandomAccount(accounts);
}

export async function containsTransaction(
    sdk: SDK,
    txHash: H256
): Promise<boolean> {
    return sdk.rpc.chain.containsTransaction(txHash);
}

export class PayerInfo {
    constructor(
        private sdk: SDK,
        private payer: string,
        private payerPassPhrase: string,
        private keyStore: KeyStore
    ) {}
    public async sendTransaction(
        transaction: Transaction,
        fee: number
    ): Promise<H256> {
        const seq = await calculateSeq(this.sdk, this.payer);
        return sendTransaction(
            this.sdk,
            this.payer,
            this.payerPassPhrase,
            this.keyStore,
            seq,
            fee,
            transaction
        );
    }
}

async function fetchOilTracker(
    owner: string,
    assetType: string
): Promise<H256> {
    const indexerUrl = getConfig<string>("indexer_url");
    const oilUtxoUrl = `${indexerUrl}/api/utxo?address=${owner}&assetType=${assetType}`;
    const utxos: { transactionTracker: string }[] = await request({
        url: oilUtxoUrl,
        json: true
    });
    return new H256(utxos[0].transactionTracker);
}

export async function getOilFromConfig(
    sdk: SDK
): Promise<{
    tracker: H256;
    owner: string;
    passphrase: string;
    asset: Asset;
} | null> {
    if (haveConfig("oil.owner") && haveConfig("oil.asset_type")) {
        const owner = getConfig<string>("oil.owner");
        const passphrase = getConfig<string>("oil.passphrase");
        const assetType = getConfig<string>("oil.asset_type");
        const tracker = await fetchOilTracker(owner, assetType);
        const asset = await sdk.rpc.chain.getAsset(tracker, 0, 0);
        if (!asset) {
            throw new Error("Cannot get an oil asset");
        }
        return {
            tracker,
            owner,
            passphrase,
            asset
        };
    }
    return null;
}
