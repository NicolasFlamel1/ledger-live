import type { Transaction, TransactionStatus, MimbleWimbleCoinOperationExtra } from "./types";
import type { Account } from "@ledgerhq/types-live";
import {
  AmountRequired,
  NotEnoughBalance,
  RecipientRequired,
  InvalidAddress,
} from "@ledgerhq/errors";
import Slate from "./api/slate";
import Consensus from "./api/consensus";
import BigNumber from "bignumber.js";
import {
  MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient,
  MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress,
  MimbleWimbleCoinTorRequired,
  MimbleWimbleCoinCanOnlySendAsFile,
  MimbleWimbleCoinMaxFeeExceeded,
  MimbleWimbleCoinInvalidBaseFee,
} from "./errors";
import Tor from "./api/tor";
import Slatepack from "./api/slatepack";
import Common from "./api/common";

export default async (account: Account, transaction: Transaction): Promise<TransactionStatus> => {
  const errors: { [key: string]: Error } = {};
  const warnings: { [key: string]: Error } = {};
  const recipient = transaction.recipient.trim();
  if (!recipient) {
    if (!transaction.sendAsFile) {
      errors.recipient = new RecipientRequired();
    } else {
      warnings.recipient = new MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient();
    }
  } else {
    try {
      const parsedUrl = new URL(recipient);
      if (
        (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
        parsedUrl.hostname.endsWith(".onion")
      ) {
        errors.recipient = new InvalidAddress("", {
          currencyName: account.currency.name,
        });
      } else {
        warnings.recipient =
          new MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress();
      }
    } catch (error: any) {
      switch (account.currency.id) {
        case "mimblewimble_coin":
        case "mimblewimble_coin_floonet":
        case "epic_cash":
        case "epic_cash_floonet":
          try {
            Tor.torAddressToPublicKey(recipient);
            if (!transaction.sendAsFile) {
              if (Common.isReactNative()) {
                errors.recipient = new MimbleWimbleCoinCanOnlySendAsFile();
              } else {
                warnings.recipient = new MimbleWimbleCoinTorRequired();
              }
            }
          } catch (error: any) {
            errors.recipient = new InvalidAddress("", {
              currencyName: account.currency.name,
            });
          }
          break;
        case "grin":
        case "grin_testnet":
          try {
            Slatepack.slatepackAddressToPublicKey(recipient, account.currency);
            if (!transaction.sendAsFile) {
              if (Common.isReactNative()) {
                errors.recipient = new MimbleWimbleCoinCanOnlySendAsFile();
              } else {
                warnings.recipient = new MimbleWimbleCoinTorRequired();
              }
            }
          } catch (error: any) {
            errors.recipient = new InvalidAddress("", {
              currencyName: account.currency.name,
            });
          }
          break;
      }
    }
  }
  let numberOfInputs = 0;
  let inputAmount: BigNumber = new BigNumber(0);
  for (let i: number = account.operations.length - 1; i >= 0; --i) {
    if (
      !transaction.useAllAmount &&
      (transaction.amount.isZero() ||
        inputAmount.isEqualTo(
          transaction.amount.plus(
            Slate.getRequiredFee(account.currency, numberOfInputs, 1, 1, transaction.baseFee),
          ),
        ) ||
        inputAmount.isGreaterThan(
          transaction.amount.plus(
            Slate.getRequiredFee(account.currency, numberOfInputs, 2, 1, transaction.baseFee),
          ),
        ))
    ) {
      break;
    }
    if (
      account.operations[i].type !== "OUT" &&
      !(account.operations[i].extra as MimbleWimbleCoinOperationExtra).spent &&
      account.operations[i].blockHeight !== null &&
      (account.operations[i].type !== "COINBASE_REWARD" ||
        new BigNumber(account.blockHeight).isGreaterThanOrEqualTo(
          new BigNumber(account.operations[i].blockHeight!)
            .plus(Consensus.getCoinbaseMaturity(account.currency))
            .minus(1),
        ))
    ) {
      ++numberOfInputs;
      inputAmount = inputAmount.plus(account.operations[i].value);
    }
  }
  const estimatedFees =
    transaction.useAllAmount ||
    inputAmount.isLessThanOrEqualTo(
      transaction.amount.plus(
        Slate.getRequiredFee(
          account.currency,
          Math.max(numberOfInputs, 1),
          1,
          1,
          transaction.baseFee,
        ),
      ),
    )
      ? Slate.getRequiredFee(
          account.currency,
          Math.max(numberOfInputs, 1),
          1,
          1,
          transaction.baseFee,
        )
      : Slate.getRequiredFee(
          account.currency,
          Math.max(numberOfInputs, 1),
          2,
          1,
          transaction.baseFee,
        );
  if (estimatedFees.isGreaterThan(Consensus.getMaximumFee(account.currency))) {
    errors.amount = new MimbleWimbleCoinMaxFeeExceeded();
  }
  if (transaction.baseFee.isZero()) {
    errors.baseFee = new MimbleWimbleCoinInvalidBaseFee();
  }
  const amount = transaction.useAllAmount
    ? BigNumber.maximum(inputAmount.minus(estimatedFees), 0)
    : transaction.amount;
  const totalSpent = amount.plus(estimatedFees);
  if (!transaction.useAllAmount && transaction.amount.isZero()) {
    errors.amount = new AmountRequired();
  } else if (account.spendableBalance.isLessThan(totalSpent) || amount.isZero()) {
    errors.amount = new NotEnoughBalance();
  }
  return {
    errors,
    warnings,
    estimatedFees:
      (transaction.useAllAmount && amount.isZero()) ||
      (!transaction.useAllAmount && transaction.amount.isZero())
        ? new BigNumber(0)
        : estimatedFees,
    amount,
    totalSpent,
  };
};
