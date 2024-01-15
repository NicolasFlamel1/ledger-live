import React from "react";
import { TransactionStatus } from "@ledgerhq/live-common/families/mimblewimble_coin/types";
import WarnBox from "~/renderer/components/WarnBox";
import { Trans } from "react-i18next";
import {
  MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient,
  MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress,
} from "@ledgerhq/live-common/families/mimblewimble_coin/errors";

const Warning = ({ status }: { status: TransactionStatus }) => {
  return (
    <WarnBox>
      {(status.warnings.recipient as unknown) instanceof
        MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient ||
      (status.warnings.recipient as unknown) instanceof
        MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress ? (
        <Trans i18nKey="families.mimblewimble_coin.noPaymentProof" />
      ) : (
        <Trans i18nKey="families.mimblewimble_coin.verifyRecipientPaymentProofAddress" />
      )}
    </WarnBox>
  );
};

export default {
  warning: Warning,
};
