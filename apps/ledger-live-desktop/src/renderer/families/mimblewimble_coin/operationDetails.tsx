import React from "react";
import { Trans } from "react-i18next";
import {
  OpDetailsTitle,
  OpDetailsData,
  OpDetailsSection,
  GradientHover,
  B,
} from "~/renderer/drawers/OperationDetails/styledComponents";
import CopyWithFeedback from "~/renderer/components/CopyWithFeedback";
import { Account } from "@ledgerhq/types-live";
import Box from "~/renderer/components/Box";
import { getOperationConfirmationDisplayableNumber } from "@ledgerhq/live-common/operation";
import {
  isCoinbaseRewardMature,
  getRequiredCoinbaseRewardMaturityConfirmations,
} from "@ledgerhq/live-common/families/mimblewimble_coin/react";
import Ellipsis from "~/renderer/components/Ellipsis";
import { MimbleWimbleCoinOperation } from "@ledgerhq/live-common/families/mimblewimble_coin/types";

const OperationDetailsExtra = ({
  operation,
  type,
  account,
}: {
  operation: MimbleWimbleCoinOperation;
  type: string;
  account: Account;
}) => {
  const isMature = isCoinbaseRewardMature(account, operation);
  const confirmationsString = getOperationConfirmationDisplayableNumber(operation, account);
  const { extra } = operation;
  return (
    <>
      {type === "COINBASE_REWARD" ? (
        <OpDetailsSection>
          <OpDetailsTitle>
            <Trans i18nKey="families.mimblewimble_coin.maturityStatus" />
          </OpDetailsTitle>
          <OpDetailsData color={isMature ? "positiveGreen" : "alertRed"} horizontal flow={1}>
            <Box>
              <Trans
                i18nKey={
                  isMature
                    ? "families.mimblewimble_coin.matureStatus"
                    : "families.mimblewimble_coin.immatureStatus"
                }
                values={{
                  numberOfConfirmations: confirmationsString || "0",
                  requiredNumberOfConfirmations:
                    getRequiredCoinbaseRewardMaturityConfirmations(account).toFixed(),
                }}
              />
            </Box>
          </OpDetailsData>
        </OpDetailsSection>
      ) : null}
      {extra.outputCommitment ? (
        <OpDetailsSection>
          <OpDetailsTitle>
            <Trans i18nKey="families.mimblewimble_coin.outputCommitment" />
          </OpDetailsTitle>
          <OpDetailsData>
            <Ellipsis ml={2}>{extra.outputCommitment.toString("hex")}</Ellipsis>
            <GradientHover>
              <CopyWithFeedback text={extra.outputCommitment.toString("hex")} />
            </GradientHover>
          </OpDetailsData>
        </OpDetailsSection>
      ) : null}
      {extra.kernelExcess ? (
        <OpDetailsSection>
          <OpDetailsTitle>
            <Trans i18nKey="families.mimblewimble_coin.kernelExcess" />
          </OpDetailsTitle>
          <OpDetailsData>
            <Ellipsis ml={2}>{extra.kernelExcess.toString("hex")}</Ellipsis>
            <GradientHover>
              <CopyWithFeedback text={extra.kernelExcess.toString("hex")} />
            </GradientHover>
          </OpDetailsData>
        </OpDetailsSection>
      ) : null}
      {extra.recipientPaymentProofSignature ? (
        <OpDetailsSection>
          <OpDetailsTitle>
            <Trans i18nKey="families.mimblewimble_coin.recipientPaymentProofSignature" />
          </OpDetailsTitle>
          <OpDetailsData>
            <Ellipsis ml={2}>{extra.recipientPaymentProofSignature.toString("hex")}</Ellipsis>
            <GradientHover>
              <CopyWithFeedback text={extra.recipientPaymentProofSignature.toString("hex")} />
            </GradientHover>
          </OpDetailsData>
        </OpDetailsSection>
      ) : null}
      {type === "COINBASE_REWARD" ||
      extra.outputCommitment ||
      extra.kernelExcess ||
      extra.recipientPaymentProofSignature ? (
        <B />
      ) : null}
    </>
  );
};

export default {
  OperationDetailsExtra,
  operationDetailsExtraIncludesLineBreak: true,
};
