import type { Operation } from "@ledgerhq/types-live";
import type { MimbleWimbleCoinOperationExtra } from "./types";

const formatOperationSpecifics = (operation: Operation): string => {
  const { outputCommitment } = operation.extra as MimbleWimbleCoinOperationExtra;
  return outputCommitment ? `\n  Output Commitment: ${outputCommitment.toString("hex")}` : "";
};

export default {
  formatOperationSpecifics,
};
