// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from "react";
import { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { ReceiveFundsStackParamList } from "~/components/RootNavigator/types/ReceiveFundsNavigator";
import { ScreenName } from "~/const";
import type { Account, TokenAccount } from "@ledgerhq/types-live";

type ScreenProps = BaseComposite<
  StackNavigatorProps<ReceiveFundsStackParamList, ScreenName.ReceiveConfirmation>
>;

type Props = {
  account?: TokenAccount | Account;
  parentAccount?: Account;
  readOnlyModeEnabled?: boolean;
} & ScreenProps;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ReceiveConfirmation({ navigation }: Props) {
  return null;
}
