import BigNumber from "bignumber.js";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import type { Transaction, MimbleWimbleCoinOperationExtra } from "./types";
import { getMainAccount } from "../../account";
import Slate from "./api/slate";
import Consensus from "./api/consensus";

export default async ({
  account,
  parentAccount,
  transaction,
}: {
  account: AccountLike;
  parentAccount?: Account | null | undefined;
  transaction?: Transaction | null | undefined;
}): Promise<BigNumber> => {
  const mainAccount = getMainAccount(account, parentAccount);
  let numberOfInputs = 0;
  for (const operation of mainAccount.operations) {
    if (
      operation.type !== "OUT" &&
      !(operation.extra as MimbleWimbleCoinOperationExtra).spent &&
      operation.blockHeight !== null &&
      (operation.type !== "COINBASE_REWARD" ||
        new BigNumber(mainAccount.blockHeight).isGreaterThanOrEqualTo(
          new BigNumber(operation.blockHeight!)
            .plus(Consensus.getCoinbaseMaturity(mainAccount.currency))
            .minus(1),
        ))
    ) {
      ++numberOfInputs;
    }
  }
  const fee = Slate.getRequiredFee(
    mainAccount.currency,
    numberOfInputs,
    1,
    1,
    transaction ? transaction.baseFee : Consensus.getDefaultBaseFee(mainAccount.currency),
  );
  return BigNumber.maximum(mainAccount.spendableBalance.minus(fee), 0);
};
