import React from "react";
import TrackPage from "~/renderer/analytics/TrackPage";
import GenericStepConnectDevice from "./GenericStepConnectDevice";
import { StepProps } from "../types";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import invariant from "invariant";
import { getLLDCoinFamily } from "~/renderer/families";
export default function StepConnectDevice(props: StepProps) {
  const {
    account,
    parentAccount,
    transaction,
    status,
    transitionTo,
    onOperationBroadcasted,
    onTransactionError,
    setSigned,
    isNFTSend,
    onConfirmationHandler,
    onFailHandler,
    currencyName,
  } = props;
  const mainAccount = account ? getMainAccount(account, parentAccount) : null;
  invariant(account && mainAccount, "No account given");

  // custom family UI for StepConnectDevice
  const CustomStepConnectDevice = getLLDCoinFamily(
    mainAccount.currency.family,
  ).SendStepConnectDevice;
  if (CustomStepConnectDevice) {
    const CustomStepConnectDeviceStepConnectDevice = (
      CustomStepConnectDevice as { StepConnectDevice?: React.ComponentClass<StepProps> }
    ).StepConnectDevice;
    if (CustomStepConnectDeviceStepConnectDevice) {
      return <CustomStepConnectDeviceStepConnectDevice {...props} />;
    }
    const CustomStepConnectDeviceDefault =
      CustomStepConnectDevice as React.ComponentClass<StepProps>;
    if (React.isValidElement(CustomStepConnectDeviceDefault)) {
      return <CustomStepConnectDeviceDefault {...props} />;
    }
  }

  return (
    <>
      <TrackPage
        category="Send Flow"
        name="Step ConnectDevice"
        currencyName={currencyName}
        isNFTSend={isNFTSend}
      />
      <GenericStepConnectDevice
        account={account}
        parentAccount={parentAccount}
        transaction={transaction}
        status={status}
        transitionTo={transitionTo}
        onOperationBroadcasted={onOperationBroadcasted}
        onTransactionError={onTransactionError}
        setSigned={setSigned}
        onConfirmationHandler={onConfirmationHandler}
        onFailHandler={onFailHandler}
      />
    </>
  );
}

export function StepConnectDeviceFooter(props: StepProps) {
  const { account, parentAccount } = props;
  const mainAccount = account ? getMainAccount(account, parentAccount) : null;
  invariant(account && mainAccount, "No account given");

  // custom family UI for StepConnectDeviceFooter
  const CustomStepConnectDevice = getLLDCoinFamily(
    mainAccount.currency.family,
  ).SendStepConnectDevice;
  if (CustomStepConnectDevice) {
    const CustomStepConnectDeviceStepConnectDeviceFooter = (
      CustomStepConnectDevice as { StepConnectDeviceFooter?: React.ComponentClass<StepProps> }
    ).StepConnectDeviceFooter;
    if (CustomStepConnectDeviceStepConnectDeviceFooter) {
      return <CustomStepConnectDeviceStepConnectDeviceFooter {...props} />;
    }
  }

  return null;
}
