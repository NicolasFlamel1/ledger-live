import type {
  MimbleWimbleCoinAccount,
  MimbleWimbleCoinAccountRaw,
  MimbleWimbleCoinResources,
  MimbleWimbleCoinResourcesRaw,
} from "./types";
import RecentHeight from "./api/recentHeight";
import Identifier from "./api/identifier";
import BigNumber from "bignumber.js";
import { Account, AccountRaw } from "@ledgerhq/types-live";

export const toMimbleWimbleCoinResourcesRaw = (
  mimbleWimbleCoinResources: MimbleWimbleCoinResources,
): MimbleWimbleCoinResourcesRaw => {
  const { rootPublicKey, recentHeights, nextIdentifier, nextTransactionSequenceNumber } =
    mimbleWimbleCoinResources;
  return {
    rootPublicKey: rootPublicKey.toString("hex"),
    recentHeights: recentHeights.map(
      (
        recentHeight: RecentHeight,
      ): {
        height: string;
        hash: string;
      } => {
        return {
          height: recentHeight.height.toFixed(),
          hash: recentHeight.hash.toString("hex"),
        };
      },
    ),
    nextIdentifier: nextIdentifier.serialize().toString("hex"),
    nextTransactionSequenceNumber,
  };
};

export const fromMimbleWimbleCoinResourcesRaw = (
  mimbleWimbleCoinResources: MimbleWimbleCoinResourcesRaw,
): MimbleWimbleCoinResources => {
  const { rootPublicKey, recentHeights, nextIdentifier, nextTransactionSequenceNumber } =
    mimbleWimbleCoinResources;
  return {
    rootPublicKey: Buffer.from(rootPublicKey, "hex"),
    recentHeights: recentHeights.map(
      ({ height, hash }: { height: string; hash: string }): RecentHeight => {
        return new RecentHeight(new BigNumber(height), Buffer.from(hash, "hex"));
      },
    ),
    nextIdentifier: new Identifier(Buffer.from(nextIdentifier, "hex")),
    nextTransactionSequenceNumber,
  };
};

export function assignToAccountRaw(account: Account, accountRaw: AccountRaw) {
  const mimbleWimbleCoinAccount = account as MimbleWimbleCoinAccount;
  if (mimbleWimbleCoinAccount.mimbleWimbleCoinResources)
    (accountRaw as MimbleWimbleCoinAccountRaw).mimbleWimbleCoinResources =
      toMimbleWimbleCoinResourcesRaw(mimbleWimbleCoinAccount.mimbleWimbleCoinResources);
}

export function assignFromAccountRaw(accountRaw: AccountRaw, account: Account) {
  const mimbleWimbleCoinResourcesRaw = (accountRaw as MimbleWimbleCoinAccountRaw)
    .mimbleWimbleCoinResources;
  if (mimbleWimbleCoinResourcesRaw)
    (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources =
      fromMimbleWimbleCoinResourcesRaw(mimbleWimbleCoinResourcesRaw);
}
