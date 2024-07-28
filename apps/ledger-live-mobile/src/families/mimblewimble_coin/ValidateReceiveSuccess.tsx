import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { IconsLegacy, IconBox, Text, Flex, Log } from "@ledgerhq/native-ui";
import { StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import type { Account } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { useSelector } from "react-redux";
import CopyLink from "../../components/CopyLink";
import getWindowDimensions from "../../logic/getWindowDimensions";
import { localeSelector } from "../../reducers/settings";
import NavigationScrollView from "../../components/NavigationScrollView";
import { useAccountUnit } from "~/hooks/useAccountUnit";

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
});

export default function ValidateReceiveSuccess({
  transactionResponse,
  useTransactionResponseQrCode,
  operationAmount,
  mainAccount,
}: {
  transactionResponse: string;
  useTransactionResponseQrCode: boolean;
  operationAmount: string;
  mainAccount: Account;
}) {
  const { t } = useTranslation();
  const { width } = getWindowDimensions();
  const qRSize = Math.round(width / 1.2 - 15);
  const locale = useSelector(localeSelector);
  const formattedAmount = formatCurrencyUnit(
    useAccountUnit(mainAccount),
    new BigNumber(operationAmount),
    {
      disableRounding: true,
      alwaysShowSign: false,
      showCode: true,
      locale,
    },
  );
  return (
    <NavigationScrollView
      style={[styles.container, { flex: 1 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Flex flex={1} flexDirection="column" justifyContent="center" alignItems="center">
        <IconBox
          Icon={IconsLegacy.CheckAloneMedium}
          color={"success.c100"}
          boxSize={64}
          iconSize={24}
        />
        <Flex py={8}>
          <Log>
            <Trans i18nKey="mimblewimble_coin.fundsReceived" />
          </Log>
        </Flex>
      </Flex>
      <Text variant="body" fontWeight="medium" color="neutral.c70" mt={4} mb={6} textAlign="center">
        <Trans i18nKey="mimblewimble_coin.receivedAmount" values={{ amount: formattedAmount }} />
      </Text>
      <Text variant="body" fontWeight="medium" color="neutral.c70" textAlign="center">
        {t("mimblewimble_coin.transactionResponse")}
      </Text>
      {useTransactionResponseQrCode ? (
        <Flex alignItems="center" mt={3}>
          <Flex
            p={6}
            borderRadius={24}
            position="relative"
            bg="constant.white"
            borderWidth={1}
            borderColor="neutral.c40"
          >
            <QRCode size={qRSize} value={transactionResponse} ecl="L" />
          </Flex>
        </Flex>
      ) : null}
      <Flex
        mt={5}
        bg={"neutral.c30"}
        borderRadius={8}
        p={6}
        flexDirection="row"
        width="100%"
        justifyContent={"space-between"}
      >
        <Text numberOfLines={useTransactionResponseQrCode ? 4 : 8} flex={1} fontWeight="semiBold">
          {transactionResponse}
        </Text>
        <CopyLink
          string={transactionResponse}
          replacement={<Trans i18nKey="transfer.receive.addressCopied" />}
        >
          {t("transfer.receive.copyAddress")}
        </CopyLink>
      </Flex>
      <Text variant="body" fontWeight="medium" color="neutral.c70" mt={6} textAlign="center">
        <Trans i18nKey="send.validation.confirm" />
      </Text>
    </NavigationScrollView>
  );
}
