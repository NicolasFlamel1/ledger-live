import type { Operation } from "@ledgerhq/types-live";
import Identifier from "./api/identifier";
import type { MimbleWimbleCoinOperationExtra, MimbleWimbleCoinOperationExtraRaw } from "./types";

const formatOperationSpecifics = (operation: Operation): string => {
  const { outputCommitment } = operation.extra as MimbleWimbleCoinOperationExtra;
  return outputCommitment ? `\n  Output Commitment: ${outputCommitment.toString("hex")}` : "";
};

export const fromOperationExtraRaw = (
  extraRaw: MimbleWimbleCoinOperationExtraRaw,
): MimbleWimbleCoinOperationExtra => {
  const extra: MimbleWimbleCoinOperationExtra = {};
  if (extraRaw.outputCommitment !== undefined) {
    extra.outputCommitment = Buffer.from(extraRaw.outputCommitment, "hex");
  }
  if (extraRaw.identifier !== undefined) {
    extra.identifier = new Identifier(Buffer.from(extraRaw.identifier, "hex"));
  }
  if (extraRaw.switchType !== undefined) {
    extra.switchType = extraRaw.switchType;
  }
  if (extraRaw.spent !== undefined) {
    extra.spent = extraRaw.spent;
  }
  if (extraRaw.kernelExcess !== undefined) {
    extra.kernelExcess = extraRaw.kernelExcess ? Buffer.from(extraRaw.kernelExcess, "hex") : null;
  }
  if (extraRaw.kernelOffset !== undefined) {
    extra.kernelOffset = extraRaw.kernelOffset ? Buffer.from(extraRaw.kernelOffset, "hex") : null;
  }
  if (extraRaw.recipientPaymentProofSignature !== undefined) {
    extra.recipientPaymentProofSignature = extraRaw.recipientPaymentProofSignature
      ? Buffer.from(extraRaw.recipientPaymentProofSignature, "hex")
      : null;
  }
  return extra;
};

export const toOperationExtraRaw = (
  extra: MimbleWimbleCoinOperationExtra,
): MimbleWimbleCoinOperationExtraRaw => {
  const extraRaw: MimbleWimbleCoinOperationExtraRaw = {};
  if (extra.outputCommitment !== undefined) {
    extraRaw.outputCommitment = extra.outputCommitment.toString("hex");
  }
  if (extra.identifier !== undefined) {
    extraRaw.identifier = extra.identifier.serialize().toString("hex");
  }
  if (extra.switchType !== undefined) {
    extraRaw.switchType = extra.switchType;
  }
  if (extra.spent !== undefined) {
    extraRaw.spent = extra.spent;
  }
  if (extra.kernelExcess !== undefined) {
    extraRaw.kernelExcess = extra.kernelExcess ? extra.kernelExcess.toString("hex") : null;
  }
  if (extra.kernelOffset !== undefined) {
    extraRaw.kernelOffset = extra.kernelOffset ? extra.kernelOffset.toString("hex") : null;
  }
  if (extra.recipientPaymentProofSignature !== undefined) {
    extraRaw.recipientPaymentProofSignature = extra.recipientPaymentProofSignature
      ? extra.recipientPaymentProofSignature.toString("hex")
      : null;
  }
  return extraRaw;
};

export default {
  formatOperationSpecifics,
  fromOperationExtraRaw,
  toOperationExtraRaw,
};
