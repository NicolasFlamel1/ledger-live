import React, { useCallback } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import type { AccountLike } from "@ledgerhq/types-live";
import { Transaction, TransactionStatus } from "@ledgerhq/live-common/generated/types";
import { Trans, useTranslation } from "react-i18next";
import { getAccountCurrency } from "@ledgerhq/live-common/account/index";
import { useNavigation, useTheme } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import SummaryRow from "../../screens/SendFunds/SummaryRow";
import LText from "../../components/LText";
import CurrencyUnitValue from "../../components/CurrencyUnitValue";
import CounterValue from "../../components/CounterValue";
import { ScreenName } from "../../const";
import { useAccountUnit } from "~/hooks/useAccountUnit";

const styles = StyleSheet.create({
  amountContainer: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  valueText: {
    fontSize: 16,
  },
  counterValueText: {
    fontSize: 12,
  },
  customizeBaseFeeButton: {
    flex: 0,
    padding: 8,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
  },
});

export default ({
  account,
  transaction,
  status,
}: {
  account: AccountLike;
  transaction: Transaction;
  status: TransactionStatus | undefined;
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const unit = useAccountUnit(account);
  const currency = getAccountCurrency(account);
  const navigation = useNavigation();
  const onCustomizeBaseFeePress = useCallback(() => {
    (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
      ScreenName.MimbleWimbleCoinEditBaseFee,
      {
        account,
        transaction,
      },
    );
  }, [navigation, account, transaction]);
  return status ? (
    <>
      <SummaryRow title={<Trans i18nKey="send.fees.title" />}>
        <View style={styles.amountContainer}>
          <LText style={styles.valueText} semiBold>
            <CurrencyUnitValue unit={unit} value={status.estimatedFees} disableRounding />
          </LText>
          <LText style={styles.counterValueText} color="grey" semiBold>
            <CounterValue before="≈ " value={status.estimatedFees} currency={currency} showCode />
          </LText>
        </View>
      </SummaryRow>
      <TouchableOpacity
        style={[styles.customizeBaseFeeButton, { backgroundColor: colors.lightLive }]}
        onPress={onCustomizeBaseFeePress}
      >
        <LText semiBold color="live">
          {t("mimblewimble_coin.customizeBaseFee")}
        </LText>
      </TouchableOpacity>
    </>
  ) : null;
};
