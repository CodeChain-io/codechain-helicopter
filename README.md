# codechain-helicopter [![Build Status](https://travis-ci.org/kseo/codechain-helicopter.svg?branch=master)](https://travis-ci.org/kseo/codechain-helicopter)

codechain-helicopter is a tool for airdropping CCC(CodeChain Coin) at the specified interval.

![helicopter](https://raw.githubusercontent.com/CodeChain-io/codechain-helicopter/master/resource/helicopter.png)

# Getting Started

## Clone the source code

```
git@github.com:CodeChain-io/codechain-helicopter.git
```

## Install dependencies

```
cd codechain-helicopter && yarn install
```

## Modify the config file

Open `config/default.json` file and fill `payer`, `payer_passphrase` and `rpc_url` fields.

- payer: the account who gives away CCC
- payer_passphrase: the passphrase of the payer account.
- rpc_url: CodeChain RPC URL

You can also adjsut `reward` and `drop_interval`.

## Run

```
yarn start
```
