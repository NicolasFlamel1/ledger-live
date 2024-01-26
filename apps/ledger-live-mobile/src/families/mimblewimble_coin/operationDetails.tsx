import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@react-navigation/native";
import type { Account, Operation } from "@ledgerhq/types-live";
import { getOperationConfirmationDisplayableNumber } from "@ledgerhq/live-common/operation";
import {
  isCoinbaseRewardMature,
  getRequiredCoinbaseRewardMaturityConfirmations,
} from "@ledgerhq/live-common/families/mimblewimble_coin/react";
import { Buffer } from "buffer";
import Section, { styles } from "../../screens/OperationDetails/Section";
import LText from "../../components/LText";

const OperationDetailsExtra = ({
  operation,
  extra,
  type,
  account,
}: {
  operation: Operation;
  extra: {
    outputCommitment?: Buffer;
    kernelExcess?: Buffer;
    recipientPaymentProofSignature?: Buffer;
  };
  type: string;
  account: Account;
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isMature = isCoinbaseRewardMature(account, operation);
  const confirmationsString = getOperationConfirmationDisplayableNumber(operation, account);
  return (
    <>
      {type === "COINBASE_REWARD" ? (
        <View style={styles.wrapper}>
          <View style={styles.titleWrapper}>
            <LText style={styles.title} color="grey">
              {t("mimblewimble_coin.maturityStatus")}
            </LText>
          </View>
          <LText style={{ color: isMature ? colors.green : colors.alert }} semiBold>
            {t(isMature ? "mimblewimble_coin.matureStatus" : "mimblewimble_coin.immatureStatus", {
              numberOfConfirmations: confirmationsString || "0",
              requiredNumberOfConfirmations:
                getRequiredCoinbaseRewardMaturityConfirmations(account).toFixed(),
            })}
          </LText>
        </View>
      ) : null}
      {extra.outputCommitment ? (
        <Section
          title={t("mimblewimble_coin.outputCommitment")}
          value={extra.outputCommitment.toString("hex")}
        />
      ) : null}
      {extra.kernelExcess ? (
        <Section
          title={t("mimblewimble_coin.kernelExcess")}
          value={extra.kernelExcess.toString("hex")}
        />
      ) : null}
      {extra.recipientPaymentProofSignature ? (
        <Section
          title={t("mimblewimble_coin.recipientPaymentProofSignature")}
          value={extra.recipientPaymentProofSignature.toString("hex")}
        />
      ) : null}
    </>
  );
};

export default {
  OperationDetailsExtra,
};
