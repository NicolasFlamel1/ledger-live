import { Account, Operation, SignedOperation } from "@ledgerhq/types-live";
import JSONBigNumber from "json-bignumber";
import Node from "./api/node";

export default async ({
  account,
  signedOperation,
}: {
  account: Account;
  signedOperation: SignedOperation;
}): Promise<Operation> => {
  const { broadcastData } = JSON.parse(signedOperation.signature);
  await Node.broadcastTransaction(account.currency, JSONBigNumber.parse(broadcastData));
  return signedOperation.operation;
};
