import React, { useCallback } from "react";
import Box from "~/renderer/components/Box";
import Text from "~/renderer/components/Text";
import { useSelector } from "react-redux";
import { accountsSelector } from "~/renderer/reducers/accounts";
import { getAccountCurrency } from "@ledgerhq/live-common/account/index";
import { Trans } from "react-i18next";
import Button from "~/renderer/components/Button";
import CurrencyBadge from "~/renderer/components/CurrencyBadge";
import FormattedVal from "~/renderer/components/FormattedVal";
import CryptoCurrencyIcon from "~/renderer/components/CryptoCurrencyIcon";
import { getCryptoCurrencyById } from "@ledgerhq/live-common/currencies/index";
import Input from "~/renderer/components/Input";
import InfoCircle from "~/renderer/icons/InfoCircle";
import ToolTip from "~/renderer/components/Tooltip";
import { FullNodeSteps } from "..";
import styled from "styled-components";
import { useMaybeAccountUnit } from "~/renderer/hooks/useAccountUnit";
import { walletSelector } from "~/renderer/reducers/wallet";
import { accountNameWithDefaultSelector } from "@ledgerhq/live-wallet/store";

const Row = styled(Box).attrs(() => ({
  horizontal: true,
  alignItems: "center",
  bg: "palette.background.default",
  px: 2,
  mb: 2,
  flow: 3,
}))`
  height: 40px;
  border-radius: 4px;
`;
const Accounts = ({
  numberOfAccountsToScan,
  setNumberOfAccountsToScan,
}: {
  numberOfAccountsToScan: number | undefined | null;
  setNumberOfAccountsToScan: (a?: number | null) => void;
}) => {
  const walletState = useSelector(walletSelector);

  // FIXME Not using the AccountList component because styles differ quite a bit, we should unify.
  const accounts = useSelector(accountsSelector);
  const currency = getCryptoCurrencyById("bitcoin");

  const bitcoinAccounts = accounts.filter(a => getAccountCurrency(a) === currency);
  const firstNonFalsyAccount = bitcoinAccounts.find(account => !!account);
  const unit = useMaybeAccountUnit(firstNonFalsyAccount);

  const onUpdateNumberOfAccountsToScan = useCallback(
    (value: string) => {
      if (value) {
        let newNumberOfAccounts = parseInt(value, 10) || 1;
        if (
          newNumberOfAccounts < 0 ||
          Number.isNaN(newNumberOfAccounts) ||
          !Number.isFinite(newNumberOfAccounts)
        ) {
          newNumberOfAccounts = 1;
        }
        setNumberOfAccountsToScan(newNumberOfAccounts);
      } else {
        setNumberOfAccountsToScan();
      }
    },
    [setNumberOfAccountsToScan],
  );
  return (
    <Box>
      <Text
        ff="Inter|ExtraBold"
        color="palette.text.shade100"
        fontSize={2}
        style={{
          textTransform: "uppercase",
        }}
        mb={1}
      >
        <Trans i18nKey="fullNode.modal.steps.accounts.toScan" />
      </Text>
      <Box horizontal alignItems={"center"}>
        <Box horizontal alignItems={"center"} flex={1}>
          <Text ff="Inter|Medium" color="palette.text.shade100" mr={2} fontSize={4}>
            <Trans i18nKey="fullNode.modal.steps.accounts.toScanDescription" />
          </Text>
          <ToolTip content={<Trans i18nKey="fullNode.modal.steps.accounts.toScanTooltip" />}>
            <Box color={"palette.text.shade50"}>
              <InfoCircle size={13} />
            </Box>
          </ToolTip>
        </Box>
        <Input
          style={{
            width: 40,
            textAlign: "center",
          }}
          placeholder="10"
          maxLength={3}
          onChange={onUpdateNumberOfAccountsToScan}
          value={numberOfAccountsToScan?.toString()}
        />
      </Box>

      {bitcoinAccounts.length ? (
        <>
          <Text
            ff="Inter|ExtraBold"
            color="palette.text.shade100"
            fontSize={2}
            style={{
              textTransform: "uppercase",
            }}
            mb={1}
            mt={5}
          >
            <Trans i18nKey="fullNode.modal.steps.accounts.existing" />
          </Text>
          <>
            {bitcoinAccounts.map(account => (
              <Row key={account.id}>
                <CryptoCurrencyIcon size={16} currency={account.currency} />
                <Box
                  ml={2}
                  shrink
                  grow
                  ff="Inter|SemiBold"
                  color="palette.text.shade40"
                  fontSize={3}
                >
                  <Text>{accountNameWithDefaultSelector(walletState, account)}</Text>
                </Box>
                <FormattedVal
                  ff="Inter|Regular"
                  val={account.balance}
                  unit={unit}
                  style={{
                    textAlign: "right",
                    width: "auto",
                  }}
                  showCode
                  fontSize={3}
                  color="palette.text.shade40"
                />
              </Row>
            ))}
          </>
        </>
      ) : null}
    </Box>
  );
};
export const StepAccountsFooter = ({
  numberOfAccountsToScan,
  onStepChange,
}: {
  numberOfAccountsToScan: number | undefined | null;
  onStepChange: (a: FullNodeSteps) => void;
}) => {
  const currency = getCryptoCurrencyById("bitcoin");
  const goToDeviceStep = useCallback(() => onStepChange("device"), [onStepChange]);
  return (
    <>
      <CurrencyBadge currency={currency} />
      <Button disabled={!numberOfAccountsToScan} primary onClick={goToDeviceStep}>
        <Trans i18nKey="common.continue" />
      </Button>
    </>
  );
};
export default Accounts;
