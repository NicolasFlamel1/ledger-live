import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import JSONBigNumber from "json-bignumber";
import { Account, SignedOperation, Address, Operation, OperationRaw } from "@ledgerhq/types-live";
import { fromOperationRaw } from "../../account";
import type { MimbleWimbleCoinAccount, MimbleWimbleCoinOperationExtra } from "./types";
import Consensus from "./api/consensus";
import BigNumber from "bignumber.js";
import {
  MimbleWimbleCoinInvalidTransactionData,
  MimbleWimbleCoinInvalidTransactionResponse,
  MimbleWimbleCoinInvalidBaseFee,
} from "./errors";
import { addPendingOperation } from "../../account";
import Identifier from "./api/identifier";
import Common from "./api/common";
import Slatepack from "./api/slatepack";

export const validateTransactionData = (
  cryptocurrency: CryptoCurrency,
  transactionData: string,
): {
  error: Error | undefined;
  warning: Error | undefined;
} => {
  let error: Error | undefined;
  let warning: Error | undefined;
  const transaction = transactionData.trim();
  if (!Slatepack.isSlatepack(transaction, cryptocurrency)) {
    try {
      const parsedTransactionData = JSONBigNumber.parse(transaction);
      if (!Common.isPureObject(parsedTransactionData)) {
        error = new MimbleWimbleCoinInvalidTransactionData("Invalid transaction data");
      }
    } catch (parseError: any) {
      error = new MimbleWimbleCoinInvalidTransactionData("Invalid transaction data");
    }
  }
  return {
    error,
    warning,
  };
};

export const validateTransactionResponse = (
  cryptocurrency: CryptoCurrency,
  transactionResponse: string,
): {
  error: Error | undefined;
  warning: Error | undefined;
} => {
  let error: Error | undefined;
  let warning: Error | undefined;
  const response = transactionResponse.trim();
  if (!Slatepack.isSlatepack(response, cryptocurrency)) {
    try {
      const parsedTransactionResponse = JSONBigNumber.parse(response);
      if (!Common.isPureObject(parsedTransactionResponse)) {
        error = new MimbleWimbleCoinInvalidTransactionResponse("Invalid transaction response");
      }
    } catch (parseError: any) {
      error = new MimbleWimbleCoinInvalidTransactionResponse("Invalid transaction response");
    }
  }
  return {
    error,
    warning,
  };
};

export const addReceivedTransactionToAccount = (
  account: Account,
  freshAddress: Address,
  nextIdentifier: string,
  operation: OperationRaw,
): Account => {
  return addPendingOperation(
    {
      ...account,
      freshAddresses: [freshAddress],
      freshAddress: freshAddress.address,
      freshAddressPath: freshAddress.derivationPath,
      mimbleWimbleCoinResources: {
        ...(account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources,
        nextIdentifier: new Identifier(Buffer.from(nextIdentifier, "hex")),
        nextTransactionSequenceNumber:
          (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
            .nextTransactionSequenceNumber + 1,
      },
    } as Account,
    fromOperationRaw(operation, account.id),
  );
};

export const addSentTransactionToAccount = (
  account: Account,
  signedOperation: SignedOperation,
): Account => {
  const { changeOperation, inputsSpent, freshAddress, nextIdentifier } = JSON.parse(
    signedOperation.signature,
  );
  let newSpendableBalance: BigNumber = new BigNumber(account.spendableBalance);
  for (let i = 0, j = 0; i < account.operations.length && j < inputsSpent.length; ++i) {
    if (inputsSpent.indexOf(account.operations[i].id) !== -1) {
      if (!(account.operations[i].extra as MimbleWimbleCoinOperationExtra).spent) {
        newSpendableBalance = newSpendableBalance.minus(account.operations[i].value);
      }
      ++j;
    }
  }
  if (changeOperation) {
    return addPendingOperation(
      {
        ...account,
        spendableBalance: newSpendableBalance,
        freshAddresses: [freshAddress],
        freshAddress: freshAddress.address,
        freshAddressPath: freshAddress.derivationPath,
        operations: account.operations.map((operation: Operation): Operation => {
          if (
            inputsSpent.indexOf(operation.id) !== -1 &&
            !(operation.extra as MimbleWimbleCoinOperationExtra).spent
          ) {
            return {
              ...operation,
              extra: {
                ...(operation.extra as MimbleWimbleCoinOperationExtra),
                spent: true,
              },
            };
          } else {
            return operation;
          }
        }),
        mimbleWimbleCoinResources: {
          ...(account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources,
          nextIdentifier: new Identifier(Buffer.from(nextIdentifier, "hex")),
          nextTransactionSequenceNumber:
            (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
              .nextTransactionSequenceNumber + 2,
        },
      } as Account,
      fromOperationRaw(changeOperation, account.id),
    );
  } else {
    return {
      ...account,
      spendableBalance: newSpendableBalance,
      freshAddresses: [freshAddress],
      freshAddress: freshAddress.address,
      freshAddressPath: freshAddress.derivationPath,
      operations: account.operations.map((operation: Operation): Operation => {
        if (
          inputsSpent.indexOf(operation.id) !== -1 &&
          !(operation.extra as MimbleWimbleCoinOperationExtra).spent
        ) {
          return {
            ...operation,
            extra: {
              ...(operation.extra as MimbleWimbleCoinOperationExtra),
              spent: true,
            },
          };
        } else {
          return operation;
        }
      }),
      mimbleWimbleCoinResources: {
        ...(account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources,
        nextIdentifier: new Identifier(Buffer.from(nextIdentifier, "hex")),
        nextTransactionSequenceNumber:
          (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
            .nextTransactionSequenceNumber + 1,
      },
    } as Account;
  }
};

export const isCoinbaseRewardMature = (account: Account, operation: Operation): boolean => {
  return (
    operation.blockHeight !== null &&
    new BigNumber(account.blockHeight).isGreaterThanOrEqualTo(
      new BigNumber(operation.blockHeight!)
        .plus(Consensus.getCoinbaseMaturity(account.currency))
        .minus(1),
    )
  );
};

export const getRequiredCoinbaseRewardMaturityConfirmations = (account: Account): number => {
  return Consensus.getCoinbaseMaturity(account.currency);
};

export const validateBaseFee = (baseFee: string): Error | undefined => {
  const baseFeeNumber = new BigNumber(baseFee);
  if (baseFeeNumber.isNaN() || baseFeeNumber.isLessThanOrEqualTo(0)) {
    return new MimbleWimbleCoinInvalidBaseFee();
  }
};
