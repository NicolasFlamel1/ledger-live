import React from "react";
import { Flex } from "@ledgerhq/native-ui";
import {
  MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient,
  MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress,
} from "@ledgerhq/live-common/families/mimblewimble_coin/errors";
import type { TransactionStatus } from "@ledgerhq/live-common/families/mimblewimble_coin/types";
import styled from "styled-components/native";
import { useTranslation } from "react-i18next";
import Alert from "../../components/Alert";

const FooterContainer = styled(Flex).attrs({
  padding: 16,
})``;

const Footer = ({ status }: { status: TransactionStatus }) => {
  const { t } = useTranslation();
  return (
    <FooterContainer>
      <Alert type="help">
        {t(
          status.warnings.recipient instanceof
            MimbleWimbleCoinTransactionWontHavePaymentProofNoRecipient ||
            (status.warnings.recipient as object) instanceof
              MimbleWimbleCoinTransactionWontHavePaymentProofInapplicableAddress
            ? "mimblewimble_coin.noPaymentProof"
            : "mimblewimble_coin.verifyRecipientPaymentProofAddress",
        )}
      </Alert>
    </FooterContainer>
  );
};

const fieldComponents = {};

export default {
  footer: Footer,
  fieldComponents,
};
