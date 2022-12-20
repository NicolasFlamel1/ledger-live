import type { CurrenciesData } from "@ledgerhq/types-live";
import type { Transaction, MimbleWimbleCoinAccountRaw } from "../types";
import { fromTransactionRaw } from "../transaction";
import { AmountRequired, NotEnoughBalance, RecipientRequired, InvalidAddress } from "@ledgerhq/errors";
import { MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient, MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress, MimbleWimbleCoinTorRequired, MimbleWimbleCoinInvalidBaseFee } from "../errors";
import scanAccounts1 from "./mimblewimble_coin_floonet.scanAccounts.1";

export default {
  scanAccounts: [scanAccounts1],
  accounts: [{
    raw: {
      id: "js:2:mimblewimble_coin_floonet:fe30f5f7b405c4475289105d1326dded1b8d5a6b1315da4f70ef69a00d28609f18cafa041d44f3388162ef452f53bf1ba5b08f449c95f96362896f1124b207b6:",
      seedIdentifier: "",
      xpub: "fe30f5f7b405c4475289105d1326dded1b8d5a6b1315da4f70ef69a00d28609f18cafa041d44f3388162ef452f53bf1ba5b08f449c95f96362896f1124b207b6",
      derivationMode: "",
      index: 0,
      freshAddress: "7rgrlqdcygvsyjlrawpidkyy4bys67t343kh7knshea2gyld6gz67fid",
      freshAddressPath: "44'/1'/0'/0/0",
      freshAddresses: [{
        address: "7rgrlqdcygvsyjlrawpidkyy4bys67t343kh7knshea2gyld6gz67fid",
        derivationPath: "44'/1'/0'/0/0"
      }],
      name: "MimbleWimble Coin Floonet 1",
      balance: "0",
      spendableBalance: "0",
      blockHeight: 0,
      operationsCount: 0,
      currencyId: "mimblewimble_coin_floonet",
      operations: [],
      pendingOperations: [],
      unitMagnitude: 9,
      lastSyncDate: "",
      mimbleWimbleCoinResources: {
        rootPublicKey: "035c1b539dec12322947c8dc091f2303ed7552d138790147677d87c3f1679eb192",
        recentHeights: [],
        nextIdentifier: "0300000000000000000000000000000000",
        nextTransactionSequenceNumber: 0
      }
    } as MimbleWimbleCoinAccountRaw,
    transactions: [{
      name: "Amount required",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "http://localhost",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {
          amount: new AmountRequired()
        },
        warnings: {}
      }
    },
    {
      name: "Not enough balance",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "1",
        recipient: "http://localhost",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {
          amount: new NotEnoughBalance()
        },
        warnings: {}
      }
    },
    {
      name: "Recipient required",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {
          recipient: new RecipientRequired()
        },
        warnings: {}
      }
    },
    {
      name: "Invalid address",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "ftp://localhost",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {
          recipient: new InvalidAddress()
        },
        warnings: {}
      }
    },
    {
      name: "No payment proof without recipient",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "",
        useAllAmount: false,
        sendAsFile: true,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {},
        warnings: {
          recipient: new MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient()
        }
      }
    },
    {
      name: "No payment proof with recipient",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "http://localhost",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {},
        warnings: {
          recipient: new MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress()
        }
      }
    },
    {
      name: "Tor required",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "7kocn4akrycb3ih5c4lmjrjiqwhpspwa7oz7di3uaqsjbxjcr2mhrmyd",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "1000000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {},
        warnings: {
          recipient: new MimbleWimbleCoinTorRequired()
        }
      }
    },
    {
      name: "Invalid base fee",
      transaction: fromTransactionRaw({
        family: "mimblewimble_coin",
        amount: "0",
        recipient: "http://localhost",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: false,
        baseFee: "0",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {
          baseFee: new MimbleWimbleCoinInvalidBaseFee()
        },
        warnings: {}
      }
    }]
  }]
} as CurrenciesData<Transaction>;
