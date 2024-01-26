// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { memo } from "react";
import { StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { ReceiveFundsStackParamList } from "~/components/RootNavigator/types/ReceiveFundsNavigator";
import { ScreenName } from "~/const";

type Props = StackNavigatorProps<ReceiveFundsStackParamList, ScreenName.ReceiveAddAccount>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AddAccountsAccounts(props: Props) {
  return null;
}

export default memo(AddAccountsAccounts);
