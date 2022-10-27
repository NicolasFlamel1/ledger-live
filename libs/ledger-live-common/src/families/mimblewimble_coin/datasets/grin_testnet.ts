import type { CurrenciesData } from "@ledgerhq/types-live";
import type { Transaction, MimbleWimbleCoinAccountRaw } from "../types";
import { fromTransactionRaw } from "../transaction";
import { AmountRequired, NotEnoughBalance, RecipientRequired, InvalidAddress } from "@ledgerhq/errors";
import scanAccounts1 from "./grin_testnet.scanAccounts.1";

export default {
  scanAccounts: [scanAccounts1],
  accounts: [{
    raw: {
      id: "js:2:grin_testnet:2d4844e2f8aa56a6a41c56fc89a685a5b65a53ee88e57d90d9da35acb57860c0c05f33206382ccbcd04094d5c7651016b4e3997bdf4ff97e4fbe41178f0376fe:",
      seedIdentifier: "",
      xpub: "2d4844e2f8aa56a6a41c56fc89a685a5b65a53ee88e57d90d9da35acb57860c0c05f33206382ccbcd04094d5c7651016b4e3997bdf4ff97e4fbe41178f0376fe",
      derivationMode: "",
      index: 0,
      freshAddress: "tgrin1txasfcykjh7vk47tadwy24x2wqhexkjk3e93nx7kuah8q87arlqsa3cnlw",
      freshAddressPath: "44'/1'/0'/0/0",
      freshAddresses: [{
        address: "tgrin1txasfcykjh7vk47tadwy24x2wqhexkjk3e93nx7kuah8q87arlqsa3cnlw",
        derivationPath: "44'/1'/0'/0/0"
      }],
      name: "Grin Testnet 1",
      balance: "0",
      spendableBalance: "0",
      blockHeight: 0,
      operationsCount: 0,
      currencyId: "grin_testnet",
      operations: [],
      pendingOperations: [],
      unitMagnitude: 9,
      lastSyncDate: "",
      mimbleWimbleCoinResources: {
        rootPublicKey: "036bf8b1016cfb395b5ef06a503c7c06742685ed0e8214bc02f6d6de44acc5f8e1",
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
        encryptedSecretNonce: undefined,
        address: undefined,
        identifier: undefined,
        freshAddress: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "500000",
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
        encryptedSecretNonce: undefined,
        address: undefined,
        identifier: undefined,
        freshAddress: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "500000",
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
        encryptedSecretNonce: undefined,
        address: undefined,
        identifier: undefined,
        freshAddress: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "500000",
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
        recipient: "localhost",
        useAllAmount: false,
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        encryptedSecretNonce: undefined,
        address: undefined,
        identifier: undefined,
        freshAddress: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: "500000",
        networkInfo: {}
      }),
      expectedStatus: {
        errors: {
          recipient: new InvalidAddress()
        },
        warnings: {}
      }
    }]
  }]
} as CurrenciesData<Transaction>;
