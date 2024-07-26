import { BigNumber } from "bignumber.js";
import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import type { Transaction } from "@ledgerhq/live-common/families/mimblewimble_coin/types";
import { validateBaseFee } from "@ledgerhq/live-common/families/mimblewimble_coin/react";
import { Account } from "@ledgerhq/types-live";
import { StackNavigationProp } from "@react-navigation/stack";
import Button from "../../components/Button";
import KeyboardView from "../../components/KeyboardView";
import LText from "../../components/LText";
import CurrencyInput from "../../components/CurrencyInput";
import TranslatedError from "../../components/TranslatedError";
import { ScreenName } from "../../const";
import { BaseNavigation } from "../../components/RootNavigator/types/helpers";
import { useAccountUnit } from "~/hooks/useAccountUnit";

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inputBox: {
    justifyContent: "center",
    padding: 7,
    paddingHorizontal: 16,
  },
  body: {
    flexDirection: "column",
    flex: 1,
  },
  currency: {
    fontSize: 32,
  },
  buttonContainer: {
    marginHorizontal: 16,
  },
  flex: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "flex-end",
    paddingBottom: 16,
  },
  error: {
    fontSize: 14,
  },
});

type Props = {
  navigation: BaseNavigation;
  route: {
    params: RouteParams;
  };
};

type RouteParams = {
  account: Account;
  transaction: Transaction;
};

function MimbleWimbleCoinEditBaseFee({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { account, transaction } = route.params;
  const cryptoUnit = useAccountUnit(account);
  const [baseFee, setBaseFee] = useState(transaction.baseFee.toFixed());
  const [error, setError] = useState<undefined | Error>(undefined);
  const onChangeBaseFee = useCallback((baseFee: BigNumber) => {
    setBaseFee(baseFee.toFixed());
    setError(validateBaseFee(baseFee.toFixed()));
  }, []);
  const onApplyBaseFee = useCallback(() => {
    const bridge = getAccountBridge(account);
    (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
      ScreenName.SendSummary,
      {
        ...route.params,
        accountId: account.id,
        transaction: bridge.updateTransaction(transaction, {
          useDefaultBaseFee: false,
          baseFee: new BigNumber(baseFee),
        }),
      },
    );
  }, [account, route.params, navigation, transaction, baseFee]);
  return (
    <SafeAreaView style={styles.root}>
      <KeyboardView style={[styles.body, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="always">
          <View style={styles.inputBox}>
            <CurrencyInput
              isActive={true}
              onChange={onChangeBaseFee}
              unit={cryptoUnit}
              value={transaction.baseFee}
              renderRight={
                <LText style={styles.currency} semiBold color="grey">
                  {cryptoUnit.code}
                </LText>
              }
              hasError={!!error}
            />
            <LText style={styles.error} color={"alert"} numberOfLines={2}>
              <TranslatedError error={error} />
            </LText>
          </View>
          <View style={styles.flex}>
            <Button
              event="MimbleWimbleCoinEditBaseFeeContinue"
              type="primary"
              title={t("common.continue")}
              onPress={onApplyBaseFee}
              containerStyle={styles.buttonContainer}
              disabled={!!error}
            />
          </View>
        </ScrollView>
      </KeyboardView>
    </SafeAreaView>
  );
}

const options = {
  title: i18next.t("mimblewimble_coin.baseFee"),
  headerLeft: null,
};

export { MimbleWimbleCoinEditBaseFee as component, options };
