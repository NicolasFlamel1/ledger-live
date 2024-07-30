import type {
  MimbleWimbleCoinAccount,
  MimbleWimbleCoinAccountRaw,
  MimbleWimbleCoinResources,
  MimbleWimbleCoinResourcesRaw,
  MimbleWimbleCoinOperationExtra,
  MimbleWimbleCoinOperationExtraRaw,
} from "./types";
import RecentHeight from "./api/recentHeight";
import Identifier from "./api/identifier";
import BigNumber from "bignumber.js";
import { Account, AccountRaw, OperationExtra, OperationExtraRaw } from "@ledgerhq/types-live";

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

export const fromOperationExtraRaw = (extraRaw: OperationExtraRaw): OperationExtra => {
  const extra: MimbleWimbleCoinOperationExtra = {};
  if ((extraRaw as MimbleWimbleCoinOperationExtraRaw).outputCommitment !== undefined) {
    extra.outputCommitment = Buffer.from(
      (extraRaw as MimbleWimbleCoinOperationExtraRaw).outputCommitment!,
      "hex",
    );
  }
  if ((extraRaw as MimbleWimbleCoinOperationExtraRaw).identifier !== undefined) {
    extra.identifier = new Identifier(
      Buffer.from((extraRaw as MimbleWimbleCoinOperationExtraRaw).identifier!, "hex"),
    );
  }
  if ((extraRaw as MimbleWimbleCoinOperationExtraRaw).switchType !== undefined) {
    extra.switchType = (extraRaw as MimbleWimbleCoinOperationExtraRaw).switchType;
  }
  if ((extraRaw as MimbleWimbleCoinOperationExtraRaw).spent !== undefined) {
    extra.spent = (extraRaw as MimbleWimbleCoinOperationExtraRaw).spent;
  }
  if ((extraRaw as MimbleWimbleCoinOperationExtraRaw).kernelExcess !== undefined) {
    extra.kernelExcess = (extraRaw as MimbleWimbleCoinOperationExtraRaw).kernelExcess
      ? Buffer.from((extraRaw as MimbleWimbleCoinOperationExtraRaw).kernelExcess!, "hex")
      : null;
  }
  if ((extraRaw as MimbleWimbleCoinOperationExtraRaw).kernelOffset !== undefined) {
    extra.kernelOffset = (extraRaw as MimbleWimbleCoinOperationExtraRaw).kernelOffset
      ? Buffer.from((extraRaw as MimbleWimbleCoinOperationExtraRaw).kernelOffset!, "hex")
      : null;
  }
  if (
    (extraRaw as MimbleWimbleCoinOperationExtraRaw).recipientPaymentProofSignature !== undefined
  ) {
    extra.recipientPaymentProofSignature = (extraRaw as MimbleWimbleCoinOperationExtraRaw)
      .recipientPaymentProofSignature
      ? Buffer.from(
          (extraRaw as MimbleWimbleCoinOperationExtraRaw).recipientPaymentProofSignature!,
          "hex",
        )
      : null;
  }
  return extra;
};

export const toOperationExtraRaw = (extra: OperationExtra): OperationExtraRaw => {
  const extraRaw: MimbleWimbleCoinOperationExtraRaw = {};
  if ((extra as MimbleWimbleCoinOperationExtra).outputCommitment !== undefined) {
    extraRaw.outputCommitment = (
      extra as MimbleWimbleCoinOperationExtra
    ).outputCommitment!.toString("hex");
  }
  if ((extra as MimbleWimbleCoinOperationExtra).identifier !== undefined) {
    extraRaw.identifier = (extra as MimbleWimbleCoinOperationExtra)
      .identifier!.serialize()
      .toString("hex");
  }
  if ((extra as MimbleWimbleCoinOperationExtra).switchType !== undefined) {
    extraRaw.switchType = (extra as MimbleWimbleCoinOperationExtra).switchType;
  }
  if ((extra as MimbleWimbleCoinOperationExtra).spent !== undefined) {
    extraRaw.spent = (extra as MimbleWimbleCoinOperationExtra).spent;
  }
  if ((extra as MimbleWimbleCoinOperationExtra).kernelExcess !== undefined) {
    extraRaw.kernelExcess = (extra as MimbleWimbleCoinOperationExtra).kernelExcess
      ? (extra as MimbleWimbleCoinOperationExtra).kernelExcess!.toString("hex")
      : null;
  }
  if ((extra as MimbleWimbleCoinOperationExtra).kernelOffset !== undefined) {
    extraRaw.kernelOffset = (extra as MimbleWimbleCoinOperationExtra).kernelOffset
      ? (extra as MimbleWimbleCoinOperationExtra).kernelOffset!.toString("hex")
      : null;
  }
  if ((extra as MimbleWimbleCoinOperationExtra).recipientPaymentProofSignature !== undefined) {
    extraRaw.recipientPaymentProofSignature = (extra as MimbleWimbleCoinOperationExtra)
      .recipientPaymentProofSignature
      ? (extra as MimbleWimbleCoinOperationExtra).recipientPaymentProofSignature!.toString("hex")
      : null;
  }
  return extraRaw;
};
