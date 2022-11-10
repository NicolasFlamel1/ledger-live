import React, { useCallback } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import type { AccountLike } from "@ledgerhq/types-live";
import type { Transaction, TransactionStatus } from "@ledgerhq/live-common/families/mimblewimble_coin/types";
import { Trans, useTranslation } from "react-i18next";
import { getAccountUnit, getAccountCurrency } from "@ledgerhq/live-common/account/index";
import SummaryRow from "../../screens/SendFunds/SummaryRow";
import LText from "../../components/LText";
import CurrencyUnitValue from "../../components/CurrencyUnitValue";
import CounterValue from "../../components/CounterValue";
import { useNavigation, useTheme } from "@react-navigation/native";
import { ScreenName } from "../../const";

const styles = StyleSheet.create({
  amountContainer: {
    flexDirection: "column",
    alignItems: "flex-end"
  },
  valueText: {
    fontSize: 16
  },
  counterValueText: {
    fontSize: 12
  },
  customizeBaseFeeButton: {
    flex: 0,
    padding: 8,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16
  }
});

export default (
  {
    account,
    transaction,
    status
  }: {
    account: AccountLike;
    transaction: Transaction;
    status: TransactionStatus;
  }
) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const unit = getAccountUnit(account);
  const currency = getAccountCurrency(account);
  const navigation = useNavigation();
  const onCustomizeBaseFeePress = useCallback(() => {
    navigation.navigate(ScreenName.MimbleWimbleCoinEditBaseFee, {
      account,
      transaction
    });
  }, [navigation, account, transaction]);
  return (
    <>
      <SummaryRow title={<Trans i18nKey="send.fees.title" />} >
        <View style={styles.amountContainer}>
          <LText style={styles.valueText} semiBold>
            <CurrencyUnitValue unit={unit} value={status.estimatedFees.toFixed()} disableRounding />
          </LText>
          <LText style={styles.counterValueText} color="grey" semiBold>
            <CounterValue before="≈ " value={status.estimatedFees.toFixed()} currency={currency} showCode />
          </LText>
        </View>
      </SummaryRow>
      <TouchableOpacity style={[styles.customizeBaseFeeButton, { backgroundColor: colors.lightLive }]} onPress={onCustomizeBaseFeePress}>
        <LText semiBold color="live">
          {t("mimblewimble_coin.customizeBaseFee")}
        </LText>
      </TouchableOpacity>
    </>
  );
}
