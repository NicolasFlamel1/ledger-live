import type { CurrenciesData } from "@ledgerhq/types-live";
import type { Transaction, MimbleWimbleCoinAccountRaw } from "../types";
import { fromTransactionRaw } from "../transaction";
import {
  AmountRequired,
  NotEnoughBalance,
  RecipientRequired,
  InvalidAddress,
} from "@ledgerhq/errors";
import {
  MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient,
  MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress,
  MimbleWimbleCoinTorRequired,
  MimbleWimbleCoinInvalidBaseFee,
} from "../errors";
import scanAccounts1 from "./epic_cash.scanAccounts.1";

export default {
  scanAccounts: [scanAccounts1],
  accounts: [
    {
      raw: {
        id: "js:2:epic_cash:096fe43a17434bb1d42a09142faeb5a5cf5a28f25c716e9b64b702a6e67dd5684c98d02fef8a7c969856225caef3e2c8b4b1a3a2b0dc2ef432ea36561e75fdd1:",
        seedIdentifier: "",
        xpub: "096fe43a17434bb1d42a09142faeb5a5cf5a28f25c716e9b64b702a6e67dd5684c98d02fef8a7c969856225caef3e2c8b4b1a3a2b0dc2ef432ea36561e75fdd1",
        derivationMode: "",
        index: 0,
        freshAddress:
          "htpob76thyhuc7zcfu3fm5rvii6um3v5vb7qtjubgqoryz6j6lb4txqd",
        freshAddressPath: "44'/23000'/0'/0/0",
        freshAddresses: [
          {
            address: "htpob76thyhuc7zcfu3fm5rvii6um3v5vb7qtjubgqoryz6j6lb4txqd",
            derivationPath: "44'/23000'/0'/0/0",
          },
        ],
        name: "Epic Cash 1",
        balance: "0",
        spendableBalance: "0",
        blockHeight: 0,
        operationsCount: 0,
        currencyId: "epic_cash",
        operations: [],
        pendingOperations: [],
        unitMagnitude: 9,
        lastSyncDate: "",
        mimbleWimbleCoinResources: {
          rootPublicKey:
            "031d11847503f131f736448684c97fb743ea6324b1e02e4a963c0016e3b4f50674",
          recentHeights: [],
          nextIdentifier: "0300000000000000000000000000000000",
          nextTransactionSequenceNumber: 0,
        },
      } as MimbleWimbleCoinAccountRaw,
      transactions: [
        {
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {
              amount: new AmountRequired(),
            },
            warnings: {},
          },
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {
              amount: new NotEnoughBalance(),
            },
            warnings: {},
          },
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {
              recipient: new RecipientRequired(),
            },
            warnings: {},
          },
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {
              recipient: new InvalidAddress(),
            },
            warnings: {},
          },
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {},
            warnings: {
              recipient:
                new MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient(),
            },
          },
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {},
            warnings: {
              recipient:
                new MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress(),
            },
          },
        },
        {
          name: "Tor required",
          transaction: fromTransactionRaw({
            family: "mimblewimble_coin",
            amount: "0",
            recipient:
              "kw4fmy7fwzlbigxpmq5q5refz4nrqeitpvc47nl4igv3fo3jgdq7u3yd",
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {},
            warnings: {
              recipient: new MimbleWimbleCoinTorRequired(),
            },
          },
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
            networkInfo: {},
          }),
          expectedStatus: {
            errors: {
              baseFee: new MimbleWimbleCoinInvalidBaseFee(),
            },
            warnings: {},
          },
        },
      ],
    },
  ],
} as CurrenciesData<Transaction>;
