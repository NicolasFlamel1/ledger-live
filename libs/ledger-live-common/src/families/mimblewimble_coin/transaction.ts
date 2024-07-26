import type { Transaction, TransactionRaw } from "./types";
import { formatTransactionStatus } from "@ledgerhq/coin-framework/formatters";
import {
  fromTransactionCommonRaw,
  fromTransactionStatusRawCommon as fromTransactionStatusRaw,
  toTransactionCommonRaw,
  toTransactionStatusRawCommon as toTransactionStatusRaw,
} from "@ledgerhq/coin-framework/serialization";
import type { Account } from "@ledgerhq/types-live";
import { getAccountCurrency } from "../../account";
import { formatCurrencyUnit } from "../../currencies";
import BigNumber from "bignumber.js";

export const formatTransaction = (transaction: Transaction, account: Account): string => {
  return `SEND ${
    transaction.useAllAmount
      ? "MAX"
      : formatCurrencyUnit(getAccountCurrency(account).units[0], transaction.amount, {
          showCode: true,
          disableRounding: true,
        })
  } TO ${transaction.recipient.trim()}`;
};

export const fromTransactionRaw = (transaction: TransactionRaw): Transaction => {
  const common = fromTransactionCommonRaw(transaction);
  return {
    ...common,
    family: transaction.family,
    sendAsFile: transaction.sendAsFile,
    height: transaction.height !== undefined ? new BigNumber(transaction.height) : undefined,
    id: transaction.id,
    offset: transaction.offset !== undefined ? Buffer.from(transaction.offset, "hex") : undefined,
    proof: transaction.proof !== undefined ? Buffer.from(transaction.proof, "hex") : undefined,
    privateNonceIndex: transaction.privateNonceIndex,
    transactionResponse: transaction.transactionResponse,
    useDefaultBaseFee: transaction.useDefaultBaseFee,
    baseFee: new BigNumber(transaction.baseFee),
    networkInfo: transaction.networkInfo,
  };
};

export const toTransactionRaw = (transaction: Transaction): TransactionRaw => {
  const common = toTransactionCommonRaw(transaction);
  return {
    ...common,
    family: transaction.family,
    sendAsFile: transaction.sendAsFile,
    height: transaction.height !== undefined ? transaction.height.toFixed() : undefined,
    id: transaction.id,
    offset: transaction.offset !== undefined ? transaction.offset.toString("hex") : undefined,
    proof: transaction.proof !== undefined ? transaction.proof.toString("hex") : undefined,
    privateNonceIndex: transaction.privateNonceIndex,
    transactionResponse: transaction.transactionResponse,
    useDefaultBaseFee: transaction.useDefaultBaseFee,
    baseFee: transaction.baseFee.toFixed(),
    networkInfo: transaction.networkInfo,
  };
};

export default {
  formatTransaction,
  fromTransactionRaw,
  toTransactionRaw,
  fromTransactionStatusRaw,
  toTransactionStatusRaw,
  formatTransactionStatus,
};
