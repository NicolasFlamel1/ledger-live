import { createCustomErrorClass } from "@ledgerhq/errors";

export const MimbleWimbleCoinInvalidParameters = createCustomErrorClass(
  "MimbleWimbleCoinInvalidParameters",
);

export const MimbleWimbleCoinNoResponseFromNode = createCustomErrorClass(
  "MimbleWimbleCoinNoResponseFromNode",
);

export const MimbleWimbleCoinUnsupportedResponseFromNode = createCustomErrorClass(
  "MimbleWimbleCoinUnsupportedResponseFromNode",
);

export const MimbleWimbleCoinNoResponseFromRecipient = createCustomErrorClass(
  "MimbleWimbleCoinNoResponseFromRecipient",
);

export const MimbleWimbleCoinUnsupportedResponseFromRecipient = createCustomErrorClass(
  "MimbleWimbleCoinUnsupportedResponseFromRecipient",
);

export const MimbleWimbleCoinCreatingSlateFailed = createCustomErrorClass(
  "MimbleWimbleCoinCreatingSlateFailed",
);

export const MimbleWimbleCoinFinalizingSlateFailed = createCustomErrorClass(
  "MimbleWimbleCoinFinalizingSlateFailed",
);

export const MimbleWimbleCoinBroadcastingTransactionFailed = createCustomErrorClass(
  "MimbleWimbleCoinBroadcastingTransactionFailed",
);

export const MimbleWimbleCoinBroadcastingTransactionFailedUnknownReason = createCustomErrorClass(
  "MimbleWimbleCoinBroadcastingTransactionFailedUnknownReason",
);

export const MimbleWimbleCoinInvalidTransactionData = createCustomErrorClass(
  "MimbleWimbleCoinInvalidTransactionData",
);

export const MimbleWimbleCoinInvalidTransactionResponse = createCustomErrorClass(
  "MimbleWimbleCoinInvalidTransactionResponse",
);

export const MimbleWimbleCoinUnsupportedTransactionData = createCustomErrorClass(
  "MimbleWimbleCoinUnsupportedTransactionData",
);

export const MimbleWimbleCoinUnsupportedSlate = createCustomErrorClass(
  "MimbleWimbleCoinUnsupportedSlate",
);

export const MimbleWimbleCoinAddingToSlateFailed = createCustomErrorClass(
  "MimbleWimbleCoinAddingToSlateFailed",
);

export const MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient = createCustomErrorClass(
  "MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient",
);

export const MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress =
  createCustomErrorClass("MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress");

export const MimbleWimbleCoinTorRequired = createCustomErrorClass("MimbleWimbleCoinTorRequired");

export const MimbleWimbleCoinCanOnlySendAsFile = createCustomErrorClass(
  "MimbleWimbleCoinCanOnlySendAsFile",
);

export const MimbleWimbleCoinMaxFeeExceeded = createCustomErrorClass(
  "MimbleWimbleCoinMaxFeeExceeded",
);

export const MimbleWimbleCoinInvalidBaseFee = createCustomErrorClass(
  "MimbleWimbleCoinInvalidBaseFee",
);
