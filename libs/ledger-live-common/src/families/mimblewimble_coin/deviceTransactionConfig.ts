import type { Transaction, TransactionStatus } from "./types";
import type { DeviceTransactionField } from "../../transaction";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import { getMainAccount } from "../../account";
import {
  MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient,
  MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress,
} from "./errors";

export default ({
  account,
  parentAccount,
  transaction,
  status,
}: {
  account: AccountLike;
  parentAccount: Account | null | undefined;
  transaction: Transaction;
  status: TransactionStatus;
}): DeviceTransactionField[] => {
  const mainAccount = getMainAccount(account, parentAccount);
  const fields: DeviceTransactionField[] = [];
  fields.push({
    type: "text",
    label: "Account Index",
    value: mainAccount.index.toFixed(),
  });
  fields.push({
    type: "amount",
    label: "Amount",
  });
  fields.push({
    type: "fees",
    label: "Fee",
  });
  fields.push({
    type: "text",
    label: "Kernel Features",
    value: "Plain",
  });
  fields.push({
    type: "text",
    label: "Recipient Payment Proof Address",
    value:
      (status.warnings.recipient as any) instanceof
        MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient ||
      (status.warnings.recipient as any) instanceof
        MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress
        ? "N/A"
        : transaction.recipient.trim(),
  });
  return fields;
};
