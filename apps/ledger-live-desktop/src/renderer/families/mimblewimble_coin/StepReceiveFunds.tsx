import invariant from "invariant";
import React, { PureComponent } from "react";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import TrackPage from "~/renderer/analytics/TrackPage";
import ErrorDisplay from "~/renderer/components/ErrorDisplay";
import { Trans } from "react-i18next";
import styled from "styled-components";
import useTheme from "~/renderer/hooks/useTheme";
import { urls } from "~/config/urls";
import { openURL } from "~/renderer/linking";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import Text from "~/renderer/components/Text";
import Ellipsis from "~/renderer/components/Ellipsis";
import ReadOnlyAddressField from "~/renderer/components/ReadOnlyAddressField";
import LinkWithExternalIcon from "~/renderer/components/LinkWithExternalIcon";
import LinkShowQRCode from "~/renderer/components/LinkShowQRCode";
import SuccessDisplay from "~/renderer/components/SuccessDisplay";
import { renderVerifyUnwrapped } from "~/renderer/components/DeviceAction/rendering";
import { StepProps } from "~/renderer/modals/Receive/Body";
import { Account, AccountLike, Address, OperationRaw } from "@ledgerhq/types-live";
import Modal from "~/renderer/components/Modal";
import ModalBody from "~/renderer/components/Modal/ModalBody";
import QRCode from "~/renderer/components/QRCode";
import AccountTagDerivationMode from "~/renderer/components/AccountTagDerivationMode";
import StepProgress from "~/renderer/components/StepProgress";
import DeviceAction from "~/renderer/components/DeviceAction";
import { createAction } from "@ledgerhq/live-common/hw/actions/app";
import {
  validateTransactionData,
  addReceivedTransactionToAccount,
} from "@ledgerhq/live-common/families/mimblewimble_coin/react";
import TextAreaTransaction from "./components/TextAreaTransaction";
import ReadOnlyTransactionField from "./components/ReadOnlyTransactionField";
import Label from "~/renderer/components/Label";
import qrcode from "qrcode";
import { toAccountRaw } from "@ledgerhq/live-common/account/serialization";
import { updateAccountWithUpdater } from "~/renderer/actions/accounts";
import { connect } from "react-redux";
import { OperationDetails } from "~/renderer/drawers/OperationDetails";
import { setDrawer } from "~/renderer/drawers/Provider";
import { localeSelector } from "~/renderer/reducers/settings";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import BigNumber from "bignumber.js";
import WarnBox from "~/renderer/components/WarnBox";
import TransactionConfirmField from "~/renderer/components/TransactionConfirm/TransactionConfirmField";
import FormattedVal from "~/renderer/components/FormattedVal";
import connectApp from "@ledgerhq/live-common/hw/connectApp";
import getTransactionResponse from "@ledgerhq/live-common/families/mimblewimble_coin/getTransactionResponse";
import { Subscription } from "rxjs";
import { useAccountUnit } from "~/renderer/hooks/useAccountUnit";
import { getDefaultAccountName } from "@ledgerhq/live-wallet/accountName";

const action = createAction(connectApp);

const Separator = styled.div`
  border-top: 1px solid ${p => p.theme.colors.palette.divider};
  margin-top: 24px;
  margin-bottom: 24px;
`;

const QRCodeWrapper = styled.div`
  border: 24px solid white;
  background: white;
  display: flex;
`;

const Container = styled(Box).attrs(() => ({
  alignItems: "center",
  fontSize: 4,
  pb: 4,
}))``;

const Info = styled(Box).attrs(() => ({
  ff: "Inter|SemiBold",
  color: "palette.text.shade100",
  mb: 4,
  px: 5,
}))`
  text-align: center;
`;

const FieldText = styled(Text).attrs(() => ({
  ml: 1,
  ff: "Inter|Medium",
  color: "palette.text.shade80",
  fontSize: 3,
}))`
  word-break: break-all;
  text-align: right;
  max-width: 50%;
`;

const Receive1ShareAddress = ({
  account,
  name,
  address,
  showQRCodeModal,
}: {
  account: AccountLike;
  name: string;
  address: string;
  showQRCodeModal: () => void;
}) => {
  return (
    <>
      <Box horizontal alignItems="center" flow={2} mb={4}>
        <Text style={{ flex: 1 }} ff="Inter|SemiBold" color="palette.text.shade100" fontSize={4}>
          {name ? (
            <Box horizontal alignItems="center" flexWrap="wrap">
              <Ellipsis>
                <Trans i18nKey="currentAddress.for">
                  {"Address for "}
                  <strong>{name}</strong>
                </Trans>
              </Ellipsis>
              <AccountTagDerivationMode account={account} />
            </Box>
          ) : (
            <Trans i18nKey="currentAddress.title" />
          )}
        </Text>
        <LinkShowQRCode onClick={showQRCodeModal} address={address} />
      </Box>
      <ReadOnlyAddressField address={address} />
    </>
  );
};

const Receive2Device = ({ name, device }: { name: string; device: Device }) => {
  const type = useTheme().colors.palette.type;
  return (
    <>
      <Box horizontal alignItems="center" flow={2}>
        <Text
          style={{ flexShrink: "unset" }}
          ff="Inter|SemiBold"
          color="palette.text.shade100"
          fontSize={4}
        >
          <span style={{ marginRight: 10 }}>
            <Trans i18nKey="currentAddress.messageIfUnverified" values={{ name }} />
          </span>
          <LinkWithExternalIcon
            style={{ display: "inline-flex" }}
            onClick={() => openURL(urls.recipientAddressInfo)}
            label={<Trans i18nKey="common.learnMore" />}
          />
        </Text>
      </Box>
      {renderVerifyUnwrapped({ modelId: device.modelId, type })}
    </>
  );
};

const ApproveReceivingTransaction = ({
  account,
  device,
  amount,
  fee,
  senderPaymentProofAddress,
}: {
  account: Account;
  device: Device;
  amount: string;
  fee: string;
  senderPaymentProofAddress: string | null;
}) => {
  const unit = useAccountUnit(account);
  const type = useTheme().colors.palette.type;
  return (
    <Container>
      {senderPaymentProofAddress === null ? (
        <WarnBox>
          <Trans i18nKey="families.mimblewimble_coin.noPaymentProof" />
        </WarnBox>
      ) : null}
      <Info mt={senderPaymentProofAddress === null ? 6 : 0}>
        <Trans i18nKey="TransactionConfirm.title" />
      </Info>
      <Box style={{ width: "100%" }} px={30} mb={20}>
        <TransactionConfirmField label={"Account Index"}>
          <FieldText>{account.index.toFixed()}</FieldText>
        </TransactionConfirmField>
        <TransactionConfirmField label={"Amount"}>
          <FormattedVal
            color={"palette.text.shade80"}
            unit={unit}
            val={new BigNumber(amount)}
            fontSize={3}
            inline
            showCode
            alwaysShowValue
            disableRounding
          />
        </TransactionConfirmField>
        <TransactionConfirmField label={"Fee"}>
          <FormattedVal
            color={"palette.text.shade80"}
            unit={unit}
            val={new BigNumber(fee)}
            fontSize={3}
            inline
            showCode
            alwaysShowValue
            disableRounding
          />
        </TransactionConfirmField>
        <TransactionConfirmField label={"Kernel Features"}>
          <FieldText>{"Plain"}</FieldText>
        </TransactionConfirmField>
        <TransactionConfirmField label={"Sender Payment Proof Address"}>
          <FieldText>
            {senderPaymentProofAddress !== null ? senderPaymentProofAddress.trim() : "N/A"}
          </FieldText>
        </TransactionConfirmField>
      </Box>
      {renderVerifyUnwrapped({ modelId: device.modelId, type })}
    </Container>
  );
};

const ReceivedAmount = ({
  mainAccount,
  operationAmount,
  locale,
}: {
  mainAccount: Account;
  operationAmount: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locale: any;
}) => {
  const formattedAmount = formatCurrencyUnit(
    useAccountUnit(mainAccount),
    new BigNumber(operationAmount !== null ? operationAmount : 0),
    {
      disableRounding: true,
      alwaysShowSign: false,
      showCode: true,
      locale,
    },
  );
  return (
    <Trans
      i18nKey="families.mimblewimble_coin.receivedAmount"
      values={{ amount: formattedAmount }}
    />
  );
};

type State = {
  modalVisible: boolean;
  transactionData: string;
  transactionDataError: Error | undefined;
  transactionDataWarning: Error | undefined;
  connectingToDevice: boolean;
  processingTransactionError: Error | null;
  transactionResponse: string | null;
  currentDevice: Device | null;
  initialDevice: Device;
  disableContinue: boolean;
  useTransactionResponseQrCode: boolean;
  operationId: string | null;
  operationAmount: string | null;
  operationFee: string | null;
  operationSenderPaymentProofAddress: string | null;
  signatureRequested: boolean;
  signatureReceived: boolean;
};

type Props = {
  updateAccountWithUpdater: (b: string, a: (a: Account) => Account) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locale: any;
} & StepProps;

const mapDispatchToProps = {
  updateAccountWithUpdater,
  locale: localeSelector,
};

class StepReceiveFunds extends PureComponent<Props, State> {
  private processTransactionSubscription: Subscription | null;

  constructor(props: Props) {
    super(props);
    const { device } = props;
    this.state = {
      modalVisible: false,
      transactionData: "",
      transactionDataError: undefined,
      transactionDataWarning: undefined,
      connectingToDevice: false,
      processingTransactionError: null,
      transactionResponse: null,
      currentDevice: null,
      initialDevice: device!,
      disableContinue: true,
      useTransactionResponseQrCode: true,
      operationId: null,
      operationAmount: null,
      operationFee: null,
      operationSenderPaymentProofAddress: null,
      signatureRequested: false,
      signatureReceived: false,
    };
    this.processTransactionSubscription = null;
  }

  componentDidMount() {
    invariant(setFooterState, "Footer doesn't exist");
    setFooterState({
      ...this.state,
      stepReceiveFunds: this,
    });
  }

  componentWillUnmount() {
    const { onChangeOnBack } = this.props;
    onChangeOnBack(undefined);
    this.unsubscribe();
  }

  componentDidUpdate(previousProps: Props, previousState: State) {
    const {
      account,
      parentAccount,
      onChangeAddressVerified,
      onChangeOnBack,
      updateAccountWithUpdater,
    } = this.props;
    if (!account) {
      return;
    }
    const { transactionData, currentDevice } = this.state;
    const mainAccount = getMainAccount(account, parentAccount);
    if (!previousState.currentDevice && currentDevice) {
      this.unsubscribe();
      let transactionResponseReceived = false;
      this.processTransactionSubscription = getTransactionResponse(
        toAccountRaw(mainAccount),
        currentDevice.deviceId,
        transactionData,
      ).subscribe({
        next: ({
          type,
          transactionResponse,
          freshAddress,
          nextIdentifier,
          operation,
        }: {
          type: string;
          transactionResponse?: string;
          freshAddress?: Address;
          nextIdentifier?: string;
          operation?: OperationRaw;
        }) => {
          switch (type) {
            case "device-signature-requested":
              this.updateState({
                signatureRequested: true,
                operationAmount: operation!.value,
                operationFee: operation!.fee,
                operationSenderPaymentProofAddress: operation!.senders.length
                  ? operation!.senders[0]
                  : null,
              });
              break;
            case "device-signature-granted":
              this.updateState({
                signatureReceived: true,
              });
              break;
            case "signed":
              transactionResponseReceived = true;
              qrcode.toString(
                transactionResponse!,
                {
                  errorCorrectionLevel: "L",
                },
                (error: Error | null | undefined) => {
                  if (this.processTransactionSubscription) {
                    this.updateState({
                      transactionResponse: transactionResponse!,
                      useTransactionResponseQrCode: !error,
                      currentDevice: null,
                      operationId: operation!.id,
                      operationAmount: operation!.value,
                    });
                    onChangeOnBack(undefined);
                    updateAccountWithUpdater(mainAccount.id, (account: Account) => {
                      return addReceivedTransactionToAccount(
                        account,
                        freshAddress!,
                        nextIdentifier!,
                        operation!,
                      );
                    });
                  }
                },
              );
              break;
          }
        },
        error: (error: Error) => {
          if (!transactionResponseReceived) {
            this.updateState({
              processingTransactionError: error,
              currentDevice: null,
            });
            onChangeAddressVerified(true, error);
          }
        },
      });
    } else if (previousState.currentDevice && !currentDevice) {
      this.unsubscribe();
    }
  }

  unsubscribe() {
    if (this.processTransactionSubscription) {
      this.processTransactionSubscription.unsubscribe();
      this.processTransactionSubscription = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateState(newState: { [key: string]: any }) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.setState(newState);
    if (setFooterState) {
      setFooterState(newState);
    }
  }

  hideQRCodeModal = () => {
    this.updateState({
      modalVisible: false,
    });
  };

  showQRCodeModal = () => {
    this.updateState({
      modalVisible: true,
    });
  };

  onVerify = () => {
    const { isAddressVerified, transitionTo, onChangeAddressVerified, onResetSkip, device } =
      this.props;
    const { initialDevice } = this.state;
    if (device !== initialDevice || !isAddressVerified) {
      transitionTo("device");
    } else {
      this.updateState({
        transactionData: "",
        transactionDataError: undefined,
        transactionDataWarning: undefined,
        disableContinue: true,
      });
    }
    onChangeAddressVerified(null);
    onResetSkip();
  };

  onTransactionDataChange = (transactionData: string) => {
    const { account, parentAccount } = this.props;
    if (!account) {
      return;
    }
    const mainAccount = getMainAccount(account, parentAccount);
    if (transactionData) {
      const { error, warning } = validateTransactionData(mainAccount.currency, transactionData);
      if (error) {
        this.updateState({
          transactionDataError: error,
          disableContinue: true,
        });
      } else {
        this.updateState({
          transactionDataError: undefined,
          disableContinue: false,
        });
      }
      if (warning) {
        this.updateState({
          transactionDataWarning: warning,
        });
      } else {
        this.updateState({
          transactionDataWarning: undefined,
        });
      }
    } else {
      this.updateState({
        transactionDataError: undefined,
        transactionDataWarning: undefined,
        disableContinue: true,
      });
    }
    this.updateState({
      transactionData,
    });
  };

  onContinue = () => {
    const { onChangeOnBack } = this.props;
    this.updateState({
      connectingToDevice: true,
    });
    onChangeOnBack(() => {
      this.onRetry(true);
    });
  };

  onDeviceConnected = ({ device }: { device: Device }) => {
    this.updateState({
      currentDevice: device,
    });
  };

  onRetry = (forceDisconnectFromDevice = false) => {
    const { onChangeAddressVerified, onChangeOnBack } = this.props;
    const { processingTransactionError } = this.state;
    if (forceDisconnectFromDevice === true) {
      this.updateState({
        connectingToDevice: false,
      });
      onChangeOnBack((props: StepProps) => {
        const { transitionTo, onChangeAddressVerified, onResetSkip } = props;
        transitionTo("account");
        onChangeAddressVerified(null);
        onResetSkip();
      });
    } else if (processingTransactionError) {
      const errorHandled =
        ["DisconnectedDevice", "DisconnectedDeviceDuringOperation", "CantOpenDevice"].indexOf(
          processingTransactionError.name,
        ) !== -1;
      if (!errorHandled) {
        this.updateState({
          connectingToDevice: false,
        });
        onChangeOnBack((props: StepProps) => {
          const { transitionTo, onChangeAddressVerified, onResetSkip } = props;
          transitionTo("account");
          onChangeAddressVerified(null);
          onResetSkip();
        });
      }
    }
    this.updateState({
      processingTransactionError: null,
      currentDevice: null,
      signatureRequested: false,
      signatureReceived: false,
    });
    onChangeAddressVerified(true, null);
  };

  render() {
    const {
      isAddressVerified,
      account,
      parentAccount,
      device,
      verifyAddressError,
      token,
      eventType,
      currencyName,
      locale,
    } = this.props;
    const {
      modalVisible,
      transactionData,
      transactionDataError,
      transactionDataWarning,
      connectingToDevice,
      processingTransactionError,
      transactionResponse,
      useTransactionResponseQrCode,
      operationAmount,
      operationFee,
      operationSenderPaymentProofAddress,
      signatureRequested,
      signatureReceived,
    } = this.state;

    const mainAccount = account ? getMainAccount(account, parentAccount) : null;
    invariant(account && mainAccount, "No account given");
    const name = token ? token.name : getDefaultAccountName(account);
    const address = mainAccount.freshAddress;

    return (
      <>
        <Box px={transactionResponse !== null || (device && isAddressVerified !== true) ? 2 : 0}>
          <TrackPage
            category={`Receive Flow${eventType ? ` (${eventType})` : ""}`}
            name="Step 3"
            currencyName={currencyName}
          />
          {transactionResponse !== null ? (
            <Box alignItems="center">
              <SuccessDisplay
                title={<Trans i18nKey="families.mimblewimble_coin.fundsReceived" />}
                description={
                  <>
                    <Text mb={2}>
                      <ReceivedAmount
                        mainAccount={mainAccount}
                        operationAmount={operationAmount}
                        locale={locale}
                      />
                    </Text>
                    <Box style={{ display: "block" }} textAlign="left" horizontal flow={2} mb={4}>
                      <Text
                        style={{ flex: 1 }}
                        ff="Inter|SemiBold"
                        color="palette.text.shade100"
                        fontSize={4}
                      >
                        <Trans i18nKey="families.mimblewimble_coin.transactionResponse" />
                      </Text>
                      {useTransactionResponseQrCode ? (
                        <Box style={{ float: "right", marginLeft: 10 }}>
                          <LinkShowQRCode
                            onClick={this.showQRCodeModal}
                            address={transactionResponse}
                          />
                        </Box>
                      ) : null}
                    </Box>
                    <ReadOnlyTransactionField transactionData={transactionResponse} allowSave />
                    <Text mt={4}>
                      <Trans i18nKey="send.steps.confirmation.success.text" />
                    </Text>
                  </>
                }
              ></SuccessDisplay>
            </Box>
          ) : processingTransactionError ? (
            <ErrorDisplay
              error={processingTransactionError}
              withExportLogs={
                ["DisconnectedDevice", "DisconnectedDeviceDuringOperation"].indexOf(
                  processingTransactionError.name,
                ) === -1
              }
              onRetry={this.onRetry}
            />
          ) : signatureReceived ? (
            <StepProgress />
          ) : signatureRequested ? (
            <ApproveReceivingTransaction
              account={mainAccount}
              device={device!}
              amount={operationAmount!}
              fee={operationFee!}
              senderPaymentProofAddress={operationSenderPaymentProofAddress}
            />
          ) : connectingToDevice ? (
            <DeviceAction
              action={action}
              request={{
                account: mainAccount,
              }}
              Result={() => {
                return <StepProgress />;
              }}
              onResult={this.onDeviceConnected}
              analyticsPropertyFlow="receive"
            />
          ) : verifyAddressError ? (
            <ErrorDisplay error={verifyAddressError} onRetry={this.onVerify} />
          ) : isAddressVerified === true ? (
            <>
              <Label mb={5}>
                <Trans i18nKey="families.mimblewimble_coin.transactionToReceive" />
              </Label>
              <TextAreaTransaction
                value={transactionData}
                onChange={this.onTransactionDataChange}
                error={transactionDataError}
                warning={transactionDataWarning}
              />
            </>
          ) : device ? (
            <>
              <Receive1ShareAddress
                account={mainAccount}
                name={name}
                address={address}
                showQRCodeModal={this.showQRCodeModal}
              />
              <Separator />
              <Receive2Device device={device!} name={name} />
            </>
          ) : null}
        </Box>
        <Modal isOpened={modalVisible} onClose={this.hideQRCodeModal} centered width={460}>
          <ModalBody
            onClose={this.hideQRCodeModal}
            render={() => (
              <Box alignItems="center">
                <QRCodeWrapper>
                  <QRCode
                    size={transactionResponse !== null ? 372 : 160}
                    data={transactionResponse !== null ? transactionResponse : address}
                    errorCorrectionLevel={transactionResponse !== null ? "L" : "Q"}
                  />
                </QRCodeWrapper>
                <Box mt={6}>
                  {transactionResponse !== null ? (
                    <ReadOnlyTransactionField transactionData={transactionResponse} />
                  ) : (
                    <ReadOnlyAddressField address={address} />
                  )}
                </Box>
              </Box>
            )}
          />
        </Modal>
      </>
    );
  }
}

export interface FooterState extends State {
  stepReceiveFunds: StepReceiveFunds | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setFooterState: ((state: { [key: string]: any }) => void) | undefined;

class StepReceiveFundsFooter extends PureComponent<StepProps, FooterState> {
  constructor(props: StepProps) {
    super(props);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.state = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFooterState = (state: { [key: string]: any }) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.setState(state);
    };
  }

  componentWillUnmount() {
    setFooterState = undefined;
  }

  render() {
    const { account, parentAccount, isAddressVerified, closeModal } = this.props;
    const {
      connectingToDevice,
      transactionResponse,
      disableContinue,
      stepReceiveFunds,
      operationId,
    } = this.state;

    if (!stepReceiveFunds) {
      return null;
    }

    return (
      <>
        {transactionResponse !== null ? (
          <Button
            data-test-id="modal-continue-button"
            primary
            onClick={() => {
              closeModal();
              if (account) {
                setDrawer(OperationDetails, {
                  operationId: operationId!,
                  accountId: account.id,
                  parentId: parentAccount && parentAccount.id,
                });
              }
            }}
          >
            <Trans i18nKey="send.steps.confirmation.success.cta" />
          </Button>
        ) : !connectingToDevice && isAddressVerified === true ? (
          <Box horizontal alignItems="center" justifyContent="space-between" grow>
            <Button
              event="Page Receive Step 3 Re-verify"
              outlineGrey
              onClick={stepReceiveFunds.onVerify}
            >
              <Trans i18nKey="common.reverify" />
            </Button>
            <Button
              data-test-id="modal-continue-button"
              primary
              disabled={disableContinue}
              onClick={stepReceiveFunds.onContinue}
            >
              <Trans i18nKey="common.continue" />
            </Button>
          </Box>
        ) : null}
      </>
    );
  }
}

const StepReceiveFundsOnBack = (props: StepProps) => {
  const { transitionTo, onChangeAddressVerified, onResetSkip } = props;
  transitionTo("account");
  onChangeAddressVerified(null);
  onResetSkip();
};

export default {
  StepReceiveFunds: connect(null, mapDispatchToProps)(StepReceiveFunds),
  StepReceiveFundsFooter,
  StepReceiveFundsOnBack,
};
