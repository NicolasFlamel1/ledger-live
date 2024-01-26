import React, { useCallback } from "react";
import type { Transaction } from "@ledgerhq/live-common/families/mimblewimble_coin/types";
import { Account } from "@ledgerhq/types-live";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import i18next from "i18next";
import { useTheme } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { ScreenName } from "../../const";
import Scanner from "../../components/Scanner";
import { NavigationHeaderCloseButtonAdvanced } from "../../components/NavigationHeaderCloseButton";
import TransparentHeaderNavigationOptions from "../../navigation/TransparentHeaderNavigationOptions";
import { BaseNavigation } from "../../components/RootNavigator/types/helpers";

const HeaderRight = () => {
  const { colors } = useTheme();
  return <NavigationHeaderCloseButtonAdvanced color={colors.white} preferDismiss={false} />;
};

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

function MimbleWimbleCoinScanTransactionResponse({ navigation, route }: Props) {
  const { account, transaction } = route.params;
  const onResult = useCallback(
    (result: string) => {
      const bridge = getAccountBridge(account);
      (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
        ScreenName.SendConnectDevice,
        {
          ...route.params,
          accountId: account.id,
          transaction: bridge.updateTransaction(transaction, {
            transactionResponse: result,
          }),
        },
      );
    },
    [account, route.params, navigation, transaction],
  );
  return <Scanner onResult={onResult} />;
}

const options = {
  ...TransparentHeaderNavigationOptions,
  title: i18next.t("send.scan.title"),
  headerRight: () => {
    return <HeaderRight />;
  },
  headerLeft: null,
};

export { MimbleWimbleCoinScanTransactionResponse as component, options };
