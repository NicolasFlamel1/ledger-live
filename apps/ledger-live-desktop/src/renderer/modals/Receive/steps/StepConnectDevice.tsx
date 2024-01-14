import React, { useMemo } from "react";
import { getMainAccount } from "@ledgerhq/live-common/account/helpers";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import DeviceAction from "~/renderer/components/DeviceAction";
import { createAction } from "@ledgerhq/live-common/hw/actions/app";
import CurrencyDownStatusAlert from "~/renderer/components/CurrencyDownStatusAlert";
import TrackPage from "~/renderer/analytics/TrackPage";
import connectApp from "@ledgerhq/live-common/hw/connectApp";
import { StepProps } from "../Body";
import { mockedEventEmitter } from "~/renderer/components/debug/DebugMock";
import { getEnv } from "@ledgerhq/live-env";
import { getLLDCoinFamily } from "~/renderer/families";
const action = createAction(getEnv("MOCK") ? mockedEventEmitter : connectApp);
export default function StepConnectDevice(props: StepProps) {
  const { account, parentAccount, token, transitionTo } = props;
  const mainAccount = account ? getMainAccount(account, parentAccount) : null;
  const tokenCurrency = (account && account.type === "TokenAccount" && account.token) || token;
  const request = useMemo(
    () => ({
      account: mainAccount || undefined,
      tokenCurrency: tokenCurrency || undefined,
    }),
    [mainAccount, tokenCurrency],
  );

  // custom family UI for StepConnectDevice
  if (mainAccount) {
    const CustomStepConnectDevice = getLLDCoinFamily(
      mainAccount.currency.family,
    ).ReceiveStepConnectDevice;
    if (CustomStepConnectDevice) {
      const CustomStepConnectDeviceStepConnectDevice = (
        CustomStepConnectDevice as { StepConnectDevice?: React.ComponentClass<StepProps> }
      ).StepConnectDevice;
      if (CustomStepConnectDeviceStepConnectDevice) {
        return <CustomStepConnectDeviceStepConnectDevice {...props} />;
      }
      const CustomStepConnectDeviceDefault =
        CustomStepConnectDevice as React.ComponentClass<StepProps>;
      return <CustomStepConnectDeviceDefault {...props} />;
    }
  }

  return (
    <>
      {mainAccount ? <CurrencyDownStatusAlert currencies={[mainAccount.currency]} /> : null}
      <DeviceAction
        action={action}
        request={request}
        onResult={() => transitionTo("receive")}
        analyticsPropertyFlow="receive"
      />
    </>
  );
}
export function StepConnectDeviceFooter(props: StepProps) {
  const { account, parentAccount, t, onSkipConfirm, eventType, currencyName } = props;
  const mainAccount = account ? getMainAccount(account, parentAccount) : null;

  // custom family UI for StepConnectDeviceFooter
  if (mainAccount) {
    const CustomStepConnectDevice = getLLDCoinFamily(
      mainAccount.currency.family,
    ).ReceiveStepConnectDevice;
    if (CustomStepConnectDevice) {
      const CustomStepConnectDeviceStepConnectDeviceFooter = (
        CustomStepConnectDevice as { StepConnectDeviceFooter?: React.ComponentClass<StepProps> }
      ).StepConnectDeviceFooter;
      if (CustomStepConnectDeviceStepConnectDeviceFooter) {
        return <CustomStepConnectDeviceStepConnectDeviceFooter {...props} />;
      }
    }
  }

  return (
    <Box horizontal flow={2}>
      <TrackPage
        category={`Receive Flow${eventType ? ` (${eventType})` : ""}`}
        name="Step 2"
        currencyName={currencyName}
      />
      <Button
        event="Receive Flow Without Device Clicked"
        data-test-id="receive-connect-device-skip-device-button"
        onClick={onSkipConfirm}
      >
        {t("receive.steps.connectDevice.withoutDevice")}
      </Button>
    </Box>
  );
}
