import React, { useEffect, useRef, useCallback, PureComponent } from "react";
import styled from "styled-components";
import { Trans } from "react-i18next";
import { concat, from, Subscription } from "rxjs";
import { ignoreElements, filter, map } from "rxjs/operators";
import { Account } from "@ledgerhq/types-live";
import { isAccountEmpty } from "@ledgerhq/live-common/account/index";
import { DeviceShouldStayInApp } from "@ledgerhq/errors";
import { getCurrencyBridge } from "@ledgerhq/live-common/bridge/index";
import uniq from "lodash/uniq";
import { urls } from "~/config/urls";
import logger from "~/renderer/logger";
import { prepareCurrency } from "~/renderer/bridge/cache";
import TrackPage from "~/renderer/analytics/TrackPage";
import RetryButton from "~/renderer/components/RetryButton";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import CurrencyBadge from "~/renderer/components/CurrencyBadge";
import AccountsList, { AccountListProps } from "~/renderer/components/AccountsList";
import Spinner from "~/renderer/components/Spinner";
import Text from "~/renderer/components/Text";
import ErrorDisplay from "~/renderer/components/ErrorDisplay";
import { StepProps } from "~/renderer/modals/AddAccounts";
import { CryptoOrTokenCurrency } from "@ledgerhq/types-cryptoassets";
import { groupAddAccounts } from "@ledgerhq/live-wallet/addAccounts";
import { getDefaultAccountName } from "@ledgerhq/live-wallet/accountName";
import { renderVerifyUnwrapped } from "~/renderer/components/DeviceAction/rendering";
import useTheme from "~/renderer/hooks/useTheme";
import { useDeviceBlocked } from "~/renderer/components/DeviceAction/DeviceBlocker";
import { DeviceModelId } from "@ledgerhq/types-devices";

type Props = AccountListProps & {
  defaultSelected: boolean;
  currency: CryptoOrTokenCurrency;
};

// TODO: This Error return type is just wrong…
const remapTransportError = (err: unknown, appName: string): Error => {
  if (!err || typeof err !== "object") return err as Error;
  const { name, statusCode } = err as { name: string; statusCode: number };
  const errorToThrow =
    name === "BtcUnmatchedApp" || statusCode === 0x6982 || statusCode === 0x6700
      ? new DeviceShouldStayInApp(undefined, {
          appName,
        })
      : err;
  return errorToThrow as Error;
};
const LoadingRow = styled(Box).attrs(() => ({
  horizontal: true,
  borderRadius: 1,
  px: 3,
  alignItems: "center",
  justifyContent: "center",
  mt: 1,
}))`
  height: 48px;
  border: 1px dashed ${p => p.theme.colors.palette.text.shade60};
`;
const SectionAccounts = ({ defaultSelected, ...rest }: Props) => {
  // componentDidMount-like effect
  useEffect(() => {
    if (defaultSelected && rest.onSelectAll) {
      rest.onSelectAll(rest.accounts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AccountsList {...rest} />;
};

const Separator = styled.div`
  border-top: 1px solid ${p => p.theme.colors.palette.divider};
  margin-top: 24px;
  margin-bottom: 24px;
`;

const ApproveExportRootPublicKeyOnDevice = ({
  modelId,
  accountIndex,
}: {
  modelId: DeviceModelId;
  accountIndex: number;
}) => {
  const type = useTheme().colors.palette.type;
  return (
    <>
      <Separator />
      <Box horizontal alignItems="center" flow={2}>
        <Text
          style={{ flexShrink: "unset" }}
          ff="Inter|SemiBold"
          color="palette.text.shade100"
          fontSize={4}
        >
          <Trans
            i18nKey="families.mimblewimble_coin.approveExportingRootPublicKey"
            values={{ accountIndex: accountIndex.toFixed() }}
          />
        </Text>
      </Box>
      {renderVerifyUnwrapped({ modelId, type })}
    </>
  );
};

type State = {
  modelId?: DeviceModelId | undefined;
  accountIndex?: number | undefined;
  percentComplete: number;
};

class StepImport extends PureComponent<StepProps, State> {
  constructor(props: StepProps) {
    super(props);
    this.state = {
      percentComplete: 0,
    };
  }

  componentDidMount() {
    this.props.setScanStatus("scanning");
  }

  componentDidUpdate(prevProps: StepProps) {
    const didStartScan =
      prevProps.scanStatus !== "scanning" && this.props.scanStatus === "scanning";
    const didFinishScan =
      prevProps.scanStatus !== "finished" && this.props.scanStatus === "finished";

    // handle case when we click on retry sync
    if (didStartScan) {
      this.startScanAccountsDevice();
    }

    // handle case when we click on stop sync
    if (didFinishScan) {
      this.unsub();
    }
  }

  componentWillUnmount() {
    this.unsub();
  }

  scanSubscription: Subscription | null = null;
  unsub = () => {
    if (this.scanSubscription) {
      this.scanSubscription.unsubscribe();
    }
  };

  startScanAccountsDevice() {
    this.unsub();
    const { currency, device, setScanStatus, setScannedAccounts, blacklistedTokenIds } = this.props;
    this.setState({
      percentComplete: 0,
    });
    if (!currency || !device) return;
    const mainCurrency = currency.type === "TokenCurrency" ? currency.parentCurrency : currency;
    try {
      const bridge = getCurrencyBridge(mainCurrency);

      // will be set to false if an existing account is found
      let onlyNewAccounts = true;
      const syncConfig = {
        paginationConfig: {
          operations: 20,
        },
        blacklistedTokenIds,
      };
      this.scanSubscription = concat(
        from(prepareCurrency(mainCurrency)).pipe(ignoreElements()),
        bridge.scanAccounts({
          currency: mainCurrency,
          deviceId: device.deviceId,
          syncConfig,
        }),
      )
        .pipe(
          filter(
            e =>
              e.type === "discovered" ||
              e.type === "device-root-public-key-requested" ||
              e.type === "device-root-public-key-granted" ||
              e.type === "synced-percent",
          ),
          map(e => e),
        )
        .subscribe({
          next: event => {
            switch (event.type) {
              case "discovered": {
                const { account } = event;
                const { scannedAccounts, checkedAccountsIds, existingAccounts } = this.props;
                const hasAlreadyBeenScanned = !!scannedAccounts.find(a => account.id === a.id);
                const hasAlreadyBeenImported = !!existingAccounts.find(a => account.id === a.id);
                const isNewAccount = isAccountEmpty(account);
                if (!isNewAccount && !hasAlreadyBeenImported) {
                  onlyNewAccounts = false;
                }
                if (!hasAlreadyBeenScanned) {
                  setScannedAccounts({
                    scannedAccounts: [...scannedAccounts, account],
                    checkedAccountsIds: onlyNewAccounts
                      ? hasAlreadyBeenImported || checkedAccountsIds.length > 0
                        ? checkedAccountsIds
                        : [account.id]
                      : !hasAlreadyBeenImported && !isNewAccount
                      ? uniq([...checkedAccountsIds, account.id])
                      : checkedAccountsIds,
                  });
                }
                this.setState({
                  percentComplete: 0,
                });
                break;
              }
              case "device-root-public-key-requested":
                this.setState({
                  modelId: device.modelId,
                  accountIndex: event.index,
                });
                break;
              case "device-root-public-key-granted":
                this.setState({
                  modelId: undefined,
                  accountIndex: undefined,
                });
                break;
              case "synced-percent":
                this.setState({
                  percentComplete: event.percent,
                });
                break;
            }
          },
          complete: () => {
            this.setState({
              modelId: undefined,
              accountIndex: undefined,
            });
            setScanStatus("finished");
          },
          error: err => {
            this.setState({
              modelId: undefined,
              accountIndex: undefined,
            });
            logger.critical(err);
            const error = remapTransportError(err, currency.name);
            setScanStatus("error", error);
          },
        });
    } catch (err) {
      setScanStatus("error", err as Error);
    }
  }

  handleRetry = () => {
    this.unsub();
    this.props.resetScanState();
    this.startScanAccountsDevice();
  };

  handleToggleAccount = (account: Account) => {
    const { checkedAccountsIds, setScannedAccounts } = this.props;
    const isChecked = checkedAccountsIds.find(id => id === account.id) !== undefined;
    if (isChecked) {
      setScannedAccounts({
        checkedAccountsIds: checkedAccountsIds.filter(id => id !== account.id),
      });
    } else {
      setScannedAccounts({
        checkedAccountsIds: [...checkedAccountsIds, account.id],
      });
    }
  };

  handleSelectAll = (accountsToSelect: Account[]) => {
    const { setScannedAccounts, checkedAccountsIds } = this.props;
    setScannedAccounts({
      checkedAccountsIds: uniq(checkedAccountsIds.concat(accountsToSelect.map(a => a.id))),
    });
  };

  handleUnselectAll = (accountsToRemove: Account[]) => {
    const { setScannedAccounts, checkedAccountsIds } = this.props;
    setScannedAccounts({
      checkedAccountsIds: checkedAccountsIds.filter(id => !accountsToRemove.some(a => id === a.id)),
    });
  };

  render() {
    const {
      scanStatus,
      currency,
      err,
      scannedAccounts,
      checkedAccountsIds,
      existingAccounts,
      setAccountName,
      editedNames,
      t,
    } = this.props;
    const { modelId, accountIndex, percentComplete } = this.state;
    if (!currency) return null;
    const mainCurrency = currency.type === "TokenCurrency" ? currency.parentCurrency : currency;

    // Find accounts that are (scanned && !existing && !used)
    const newAccountSchemes = scannedAccounts
      .filter(a1 => !existingAccounts.map(a2 => a2.id).includes(a1.id) && !a1.used)
      .map(a => a.derivationMode);
    const preferredNewAccountScheme =
      newAccountSchemes && newAccountSchemes.length > 0 ? newAccountSchemes[0] : undefined;
    if (err) {
      const errorHandled =
        ["UserRefusedOnDevice", "DisconnectedDevice", "DisconnectedDeviceDuringOperation"].indexOf(
          err.name,
        ) !== -1;
      return (
        <ErrorDisplay
          error={err}
          withExportLogs={!errorHandled}
          supportLink={errorHandled ? undefined : urls.syncErrors}
        />
      );
    }
    const currencyName = mainCurrency ? mainCurrency.name : "";
    const { sections, alreadyEmptyAccount } = groupAddAccounts(existingAccounts, scannedAccounts, {
      scanning: scanStatus === "scanning",
      preferredNewAccountSchemes: [preferredNewAccountScheme!],
    });
    let creatable;
    if (alreadyEmptyAccount) {
      creatable = (
        <Trans i18nKey="addAccounts.createNewAccount.noOperationOnLastAccount" parent="div">
          {" "}
          <Text ff="Inter|SemiBold" color="palette.text.shade100">
            {getDefaultAccountName(alreadyEmptyAccount)}
          </Text>{" "}
        </Trans>
      );
    } else {
      creatable = (
        <Trans i18nKey="addAccounts.createNewAccount.noAccountToCreate" parent="div">
          {" "}
          <Text ff="Inter|SemiBold" color="palette.text.shade100">
            {currencyName}
          </Text>{" "}
        </Trans>
      );
    }
    const emptyTexts = {
      importable: t("addAccounts.noAccountToImport", {
        currencyName,
      }),
      creatable,
    };
    return (
      <>
        <TrackPage category="AddAccounts" name="Step3" currencyName={currencyName} />
        <Box data-test-id={"add-accounts-step-import-accounts-list"} mt={-4}>
          {sections.map(({ id, selectable, defaultSelected, data, supportLink }, i) => {
            return (
              <SectionAccounts
                currency={currency}
                defaultSelected={defaultSelected}
                key={id}
                title={t(`addAccounts.sections.${id}.title`, {
                  count: data.length,
                })}
                emptyText={emptyTexts[id as keyof typeof emptyTexts]}
                accounts={data}
                autoFocusFirstInput={selectable && i === 0}
                hideAmount={id === "creatable"}
                supportLink={supportLink}
                checkedIds={!selectable ? undefined : checkedAccountsIds}
                onToggleAccount={!selectable ? undefined : this.handleToggleAccount}
                setAccountName={!selectable ? undefined : setAccountName}
                editedNames={!selectable ? {} : editedNames}
                onSelectAll={!selectable ? undefined : this.handleSelectAll}
                onUnselectAll={!selectable ? undefined : this.handleUnselectAll}
              />
            );
          })}

          {scanStatus === "scanning" ? (
            <LoadingRow>
              <Spinner color="palette.text.shade60" size={16} />
              <Box ml={2} ff="Inter|Regular" color="palette.text.shade60" fontSize={4}>
                {t("families.mimblewimble_coin.syncing", {
                  percentComplete: percentComplete.toFixed(),
                })}
              </Box>
            </LoadingRow>
          ) : null}
        </Box>
        {modelId !== undefined && accountIndex !== undefined ? (
          <ApproveExportRootPublicKeyOnDevice modelId={modelId} accountIndex={accountIndex} />
        ) : null}
      </>
    );
  }
}

const StepImportFooter = (props: StepProps) => {
  const {
    transitionTo,
    setScanStatus,
    scanStatus,
    onClickAdd,
    onCloseModal,
    resetScanState,
    checkedAccountsIds,
    scannedAccounts,
    currency,
    t,
    device,
  } = props;
  const initialDevice = useRef(device);
  const willCreateAccount = checkedAccountsIds.some(id => {
    const account = scannedAccounts.find(a => a.id === id);
    return account && isAccountEmpty(account);
  });
  const willAddAccounts = checkedAccountsIds.some(id => {
    const account = scannedAccounts.find(a => a.id === id);
    return account && !isAccountEmpty(account);
  });
  const count = checkedAccountsIds.length;
  const willClose = !willCreateAccount && !willAddAccounts;
  const ctaWording =
    scanStatus === "scanning"
      ? t("common.sync.syncing")
      : willClose
      ? t("common.close")
      : t("addAccounts.cta.add", {
          count,
        });
  const onClick = willClose
    ? onCloseModal
    : async () => {
        await onClickAdd();
        transitionTo("finish");
      };
  const onRetry = useCallback(() => {
    resetScanState();
    if (device !== initialDevice.current) {
      transitionTo("connectDevice");
    } else {
      setScanStatus("scanning");
    }
  }, [resetScanState, device, transitionTo, setScanStatus]);
  if (useDeviceBlocked()) {
    return null;
  }
  return (
    <>
      <Box grow>{currency && <CurrencyBadge currency={currency} />}</Box>
      {scanStatus === "error" ? (
        <RetryButton data-test-id={"add-accounts-import-retry-button"} primary onClick={onRetry} />
      ) : null}
      {scanStatus === "scanning" ? (
        <Button
          data-test-id={"add-accounts-import-stop-button"}
          onClick={() => setScanStatus("finished")}
        >
          {t("common.stop")}
        </Button>
      ) : null}
      {scanStatus === "error" ? null : (
        <Button
          data-test-id={"add-accounts-import-add-button"}
          primary
          disabled={scanStatus !== "finished"}
          onClick={onClick}
        >
          {ctaWording}
        </Button>
      )}
    </>
  );
};

export default {
  StepImport,
  StepImportFooter,
};
