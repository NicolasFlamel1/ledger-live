import React from "react";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Account, AccountLike } from "@ledgerhq/types-live";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { Device } from "@ledgerhq/live-common/hw/actions/types";
import { getDeviceModel } from "@ledgerhq/devices";
import { useTheme } from "@react-navigation/native";
import styled from "styled-components/native";
import { Flex } from "@ledgerhq/native-ui";
import { BigNumber } from "bignumber.js";
import Alert from "../../components/Alert";
import { DataRowUnitValue, TextValueField } from "../../components/ValidateOnDeviceDataRow";
import Animation from "../../components/Animation";
import { getDeviceAnimation } from "../../helpers/getDeviceAnimation";
import { TitleText } from "../../components/DeviceAction/rendering";
import { useAccountUnit } from "~/hooks/useAccountUnit";

function AmountField({
  account,
  parentAccount,
  amount,
}: {
  account: AccountLike;
  parentAccount: Account | undefined | null;
  amount: string;
}) {
  const mainAccount = getMainAccount(account, parentAccount);
  const unit = useAccountUnit(mainAccount);
  return <DataRowUnitValue label={"Amount"} unit={unit} value={new BigNumber(amount)} />;
}

function FeesField({
  account,
  parentAccount,
  fee,
}: {
  account: AccountLike;
  parentAccount: Account | undefined | null;
  fee: string;
}) {
  const mainAccount = getMainAccount(account, parentAccount);
  const feesUnit = useAccountUnit(mainAccount);
  return <DataRowUnitValue label={"Fee"} unit={feesUnit} value={new BigNumber(fee)} />;
}

function TextField({ label, value }: { label: string; value: string }) {
  return <TextValueField label={label} value={value} />;
}

export default function ValidateReceiveOnDevice({
  account,
  parentAccount,
  device,
  amount,
  fee,
  senderPaymentProofAddress,
}: {
  account: AccountLike;
  parentAccount: Account | undefined | null;
  device: Device;
  amount: string;
  fee: string;
  senderPaymentProofAddress: string | null;
}) {
  const { dark } = useTheme();
  const { t } = useTranslation();
  const mainAccount = getMainAccount(account, parentAccount);
  return (
    <RootContainer>
      <ScrollContainer
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        <InnerContainer>
          <AnimationContainer>
            <Animation
              source={getDeviceAnimation({
                device,
                key: "sign",
                theme: dark ? "dark" : "light",
              })}
            />
          </AnimationContainer>
          <TitleText>{t("ValidateOnDevice.title.send", getDeviceModel(device.modelId))}</TitleText>
          <DataRowsContainer>
            <TextField label={"Account Index"} value={mainAccount.index.toFixed()} />
            <AmountField account={account} parentAccount={parentAccount} amount={amount} />
            <FeesField account={account} parentAccount={parentAccount} fee={fee} />
            <TextField label={"Kernel Features"} value={"Plain"} />
            <TextField
              label={"Sender Payment Proof Address"}
              value={senderPaymentProofAddress !== null ? senderPaymentProofAddress.trim() : "N/A"}
            />
          </DataRowsContainer>
        </InnerContainer>
      </ScrollContainer>
      {senderPaymentProofAddress === null ? (
        <FooterContainer>
          <Alert type="help">{t("mimblewimble_coin.noPaymentProof")}</Alert>
        </FooterContainer>
      ) : null}
    </RootContainer>
  );
}

const RootContainer = styled(Flex).attrs({
  flex: 1,
})``;

const DataRowsContainer = styled(Flex).attrs({
  marginVertical: 24,
  alignSelf: "stretch",
})``;

const InnerContainer = styled(Flex).attrs({
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: 1,
})``;

const FooterContainer = styled(Flex).attrs({
  padding: 16,
})``;

const AnimationContainer = styled(Flex).attrs({
  marginTop: 5,
  marginBottom: 35,
})``;

const ScrollContainer = styled(ScrollView)`
  flex: 1;
`;
