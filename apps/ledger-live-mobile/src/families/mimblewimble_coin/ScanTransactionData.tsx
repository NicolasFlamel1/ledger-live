import React, { useCallback } from "react";
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
    params: object;
  };
};

function MimbleWimbleCoinScanTransactionData({ navigation, route }: Props) {
  const onResult = useCallback(
    (result: string) => {
      (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
        ScreenName.ReceiveConfirmation,
        {
          ...route.params,
          transactionData: result,
        },
      );
    },
    [route.params, navigation],
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

export { MimbleWimbleCoinScanTransactionData as component, options };
