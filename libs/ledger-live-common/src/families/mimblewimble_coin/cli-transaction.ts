import type { AccountLike } from "@ledgerhq/types-live";
import type { Transaction } from "../../generated/types";
import invariant from "invariant";
import flatMap from "lodash/flatMap";
import Consensus from "./api/consensus";
import { getMainAccount } from "../../account";

const inferTransactions = (
  transactions: {
    account: AccountLike;
    transaction: Transaction;
  }[],
): Transaction[] => {
  return flatMap(
    transactions,
    ({ account, transaction }: { account: AccountLike; transaction: Transaction }): Transaction => {
      invariant(transaction.family === "mimblewimble_coin", "mimblewimble_coin family");
      const mainAccount = getMainAccount(account, undefined);
      return {
        ...transaction,
        family: "mimblewimble_coin",
        sendAsFile: false,
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
        useDefaultBaseFee: true,
        baseFee: Consensus.getDefaultBaseFee(mainAccount.currency),
        networkInfo: {},
      };
    },
  );
};

export default {
  inferTransactions,
};
