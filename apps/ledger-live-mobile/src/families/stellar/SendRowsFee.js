/* @flow */
import React from "react";
import type { AccountLike, Account } from "@ledgerhq/live-common/types/index";
import type { Transaction } from "@ledgerhq/live-common/families/stellar/types";
import StellarFeeRow from "./StellarFeeRow";

type Props = {
  account: AccountLike,
  transaction: Transaction,
  parentAccount: Account,
  navigation: any,
  route: { params: any },
  setTransaction: Function,
};

export default function StellarSendRowsFee({ account, ...props }: Props) {
  return <StellarFeeRow {...props} account={account} />;
}
