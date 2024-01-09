import type { AccountBridge, CurrencyBridge } from "@ledgerhq/types-live";
import type { Transaction } from "../types";
import getTransactionStatus from "../js-getTransactionStatus";
import estimateMaxSpendable from "../js-estimateMaxSpendable";
import signOperation from "../js-signOperation";
import broadcast from "../js-broadcast";
import { scanAccounts, sync } from "../js-synchronisation";
import { createTransaction, updateTransaction, prepareTransaction } from "../js-transaction";
import { makeAccountBridgeReceive } from "../../../bridge/jsHelpers";
import { assignFromAccountRaw, assignToAccountRaw } from "../serialization";

const getPreloadStrategy = (): any => {};

const preload = async (): Promise<any> => {};

const hydrate = (): void => {};

const currencyBridge: CurrencyBridge = {
  getPreloadStrategy,
  preload,
  hydrate,
  scanAccounts,
};

const receive = makeAccountBridgeReceive();

const accountBridge: AccountBridge<Transaction> = {
  estimateMaxSpendable,
  createTransaction,
  updateTransaction,
  getTransactionStatus,
  prepareTransaction,
  sync,
  receive,
  signOperation,
  broadcast,
  assignFromAccountRaw,
  assignToAccountRaw,
};

export default {
  currencyBridge,
  accountBridge,
};
