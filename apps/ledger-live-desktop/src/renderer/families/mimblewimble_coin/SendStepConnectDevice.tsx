import React, { PureComponent } from "react";
import invariant from "invariant";
import { StepProps } from "~/renderer/modals/Send/types";
import TrackPage from "~/renderer/analytics/TrackPage";
import { Trans } from "react-i18next";
import { Device } from "@ledgerhq/live-common/hw/actions/types";
import DeviceAction from "~/renderer/components/DeviceAction";
import StepProgress from "~/renderer/components/StepProgress";
import { createAction as createTransactionAction } from "@ledgerhq/live-common/hw/actions/transaction";
import { createAction as createOpenAction } from "@ledgerhq/live-common/hw/actions/app";
import { Account, Operation, SignedOperation } from "@ledgerhq/types-live";
import { DeviceBlocker } from "~/renderer/components/DeviceAction/DeviceBlocker";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { updateAccountWithUpdater } from "~/renderer/actions/accounts";
import { connect } from "react-redux";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { execAndWaitAtLeast } from "@ledgerhq/live-common/promise";
import { toAccountRaw } from "@ledgerhq/live-common/account/serialization";
import { toTransactionRaw } from "@ledgerhq/live-common/transaction/index";
import qrcode from "qrcode";
import Box from "~/renderer/components/Box";
import Text from "~/renderer/components/Text";
import LinkShowQRCode from "~/renderer/components/LinkShowQRCode";
import ReadOnlyTransactionField from "./components/ReadOnlyTransactionField";
import TextAreaTransaction from "./components/TextAreaTransaction";
import Label from "~/renderer/components/Label";
import StepRecipientSeparator from "~/renderer/components/StepRecipientSeparator";
import Modal from "~/renderer/components/Modal";
import ModalBody from "~/renderer/components/Modal/ModalBody";
import QRCode from "~/renderer/components/QRCode";
import styled from "styled-components";
import Button from "~/renderer/components/Button";
import {
  validateTransactionResponse,
  addSentTransactionToAccount,
} from "@ledgerhq/live-common/families/mimblewimble_coin/react";
import BigNumber from "bignumber.js";
import connectApp from "@ledgerhq/live-common/hw/connectApp";
import prepareTransaction from "@ledgerhq/live-common/families/mimblewimble_coin/prepareTransaction";
import { withDevice } from "@ledgerhq/live-common/hw/deviceAccess";
import { from, Subscription } from "rxjs";
import {
  Transaction,
  TransactionRaw,
} from "@ledgerhq/live-common/families/mimblewimble_coin/types";

const transactionAction = createTransactionAction(connectApp);

const openAction = createOpenAction(connectApp);

const QRCodeWrapper = styled.div`
  border: 24px solid white;
  background: white;
  display: flex;
`;

type State = {
  currentDevice: Device | null;
  transactionData: string | null;
  useTransactionDataQrCode: boolean;
  modalVisible: boolean;
  disableContinue: boolean;
  finalizingTransaction: boolean;
  transactionResponse: string | null;
  transactionResponseError: Error | undefined;
  transactionResponseWarning: Error | undefined;
};

type Props = {
  updateAccountWithUpdater: (b: string, a: (a: Account) => Account) => void;
} & StepProps;

const mapDispatchToProps = {
  updateAccountWithUpdater,
};

class StepConnectDevice extends PureComponent<Props, State> {
  private prepareTransactionSubscription: Subscription | null;

  constructor(props: Props) {
    super(props);
    this.state = {
      currentDevice: null,
      transactionData: null,
      useTransactionDataQrCode: true,
      modalVisible: false,
      disableContinue: true,
      finalizingTransaction: false,
      transactionResponse: null,
      transactionResponseError: undefined,
      transactionResponseWarning: undefined,
    };
    this.prepareTransactionSubscription = null;
  }

  componentDidMount() {
    invariant(setFooterState, "Footer doesn't exist");
    setFooterState({
      ...this.state,
      stepConnectDevice: this,
    });
  }

  componentWillUnmount() {
    const { account, parentAccount, transaction, onChangeTransaction } = this.props;
    this.unsubscribe();
    if (!account) {
      return;
    }
    const bridge = getAccountBridge(account, parentAccount);
    onChangeTransaction(
      bridge.updateTransaction(transaction, {
        height: undefined,
        id: undefined,
        offset: undefined,
        proof: undefined,
        privateNonceIndex: undefined,
        transactionResponse: undefined,
      }),
    );
  }

  componentDidUpdate(previousProps: Props, previousState: State) {
    const {
      account,
      parentAccount,
      transaction,
      onFailHandler,
      onTransactionError,
      transitionTo,
      closeModal,
      onChangeTransaction,
    } = this.props;
    if (!account) {
      return;
    }
    const { currentDevice } = this.state;
    const mainAccount = getMainAccount(account, parentAccount);
    if (!previousState.currentDevice && currentDevice) {
      this.unsubscribe();
      let transactionDataReceived = false;
      this.prepareTransactionSubscription = withDevice(currentDevice.deviceId)(transport =>
        from(
          prepareTransaction(
            toAccountRaw(mainAccount),
            transport,
            toTransactionRaw(transaction!) as TransactionRaw,
          ),
        ),
      ).subscribe({
        next: ({
          transactionData,
          height,
          id,
          offset,
          proof,
          privateNonceIndex,
        }: {
          transactionData: string;
          height: string;
          id: string;
          offset: string;
          proof: string | undefined;
          privateNonceIndex: number;
        }) => {
          transactionDataReceived = true;
          qrcode.toString(
            transactionData,
            {
              errorCorrectionLevel: "L",
            },
            (error: Error | null | undefined) => {
              if (this.prepareTransactionSubscription) {
                this.updateState({
                  transactionData,
                  useTransactionDataQrCode: !error,
                  currentDevice: null,
                });
                const bridge = getAccountBridge(account, parentAccount);
                onChangeTransaction(
                  bridge.updateTransaction(transaction, {
                    height: new BigNumber(height),
                    id,
                    offset: Buffer.from(offset, "hex"),
                    proof: proof !== undefined ? Buffer.from(proof, "hex") : undefined,
                    privateNonceIndex,
                  }),
                );
              }
            },
          );
        },
        error: (error: Error) => {
          if (!transactionDataReceived) {
            this.updateState({
              currentDevice: null,
            });
            if (!onFailHandler) {
              onTransactionError(error);
              transitionTo("confirmation");
            } else {
              closeModal();
              onFailHandler(error);
            }
          }
        },
      });
    } else if (previousState.currentDevice && !currentDevice) {
      this.unsubscribe();
    }
  }

  unsubscribe() {
    if (this.prepareTransactionSubscription) {
      this.prepareTransactionSubscription.unsubscribe();
      this.prepareTransactionSubscription = null;
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

  broadcast = async (signedOperation: SignedOperation): Promise<Operation> => {
    const { account, parentAccount } = this.props;
    const mainAccount = account ? getMainAccount(account, parentAccount) : null;
    invariant(account && mainAccount, "No account given");
    const bridge = getAccountBridge(account, parentAccount);
    return execAndWaitAtLeast(3000, (): Promise<Operation> => {
      return bridge.broadcast({
        account: mainAccount,
        signedOperation,
      });
    });
  };

  onTransactionResponseChange = (transactionResponse: string) => {
    const { account, parentAccount, transaction, onChangeTransaction } = this.props;
    if (!account) {
      return;
    }
    const mainAccount = getMainAccount(account, parentAccount);
    if (transactionResponse) {
      const { error, warning } = validateTransactionResponse(
        mainAccount.currency,
        transactionResponse,
      );
      if (error) {
        this.updateState({
          transactionResponseError: error,
          disableContinue: true,
        });
      } else {
        this.updateState({
          transactionResponseError: undefined,
          disableContinue: false,
        });
      }
      if (warning) {
        this.updateState({
          transactionResponseWarning: warning,
        });
      } else {
        this.updateState({
          transactionResponseWarning: undefined,
        });
      }
    } else {
      this.updateState({
        transactionResponseError: undefined,
        transactionResponseWarning: undefined,
        disableContinue: true,
      });
    }
    this.updateState({
      transactionResponse,
    });
    const bridge = getAccountBridge(account, parentAccount);
    onChangeTransaction(
      bridge.updateTransaction(transaction, {
        transactionResponse,
      }),
    );
  };

  onContinue = () => {
    this.updateState({
      finalizingTransaction: true,
    });
  };

  onDeviceConnected = ({ device }: { device: Device }) => {
    this.updateState({
      currentDevice: device,
    });
  };

  onTransactionSigned = ({
    signedOperation,
    transactionSignError,
  }: {
    signedOperation?: SignedOperation | undefined | null;
    transactionSignError?: Error | undefined;
  }) => {
    const {
      account,
      parentAccount,
      setSigned,
      onConfirmationHandler,
      onOperationBroadcasted,
      transitionTo,
      closeModal,
      onFailHandler,
      onTransactionError,
      updateAccountWithUpdater,
    } = this.props;
    if (signedOperation) {
      setSigned(true);
      this.broadcast(signedOperation).then(
        (operation: Operation) => {
          if (!onConfirmationHandler) {
            onOperationBroadcasted(operation);
          }
          const mainAccount = account ? getMainAccount(account, parentAccount) : null;
          invariant(account && mainAccount, "No account given");
          updateAccountWithUpdater(mainAccount.id, (account: Account) => {
            return addSentTransactionToAccount(account, signedOperation);
          });
          if (!onConfirmationHandler) {
            transitionTo("confirmation");
          } else {
            closeModal();
            onConfirmationHandler(operation);
          }
        },
        (error: Error) => {
          if (!onFailHandler) {
            onTransactionError(error);
            transitionTo("confirmation");
          } else {
            closeModal();
            onFailHandler(error);
          }
        },
      );
    } else if (transactionSignError) {
      if (!onFailHandler) {
        onTransactionError(transactionSignError);
        transitionTo("confirmation");
      } else {
        closeModal();
        onFailHandler(transactionSignError);
      }
    }
  };

  render() {
    const { account, parentAccount, transaction, status, isNFTSend, currencyName } = this.props;
    const {
      transactionData,
      useTransactionDataQrCode,
      modalVisible,
      finalizingTransaction,
      transactionResponse,
      transactionResponseError,
      transactionResponseWarning,
    } = this.state;

    const mainAccount = account ? getMainAccount(account, parentAccount) : null;
    invariant(account && mainAccount, "No account given");
    const tokenCurrency = account && account.type === "TokenAccount" && account.token;

    if (!transaction || !account) {
      return null;
    }

    return (
      <>
        <Box px={transactionData !== null && !finalizingTransaction ? 2 : 0}>
          <TrackPage
            category="Send Flow"
            name="Step ConnectDevice"
            currencyName={currencyName}
            isNFTSend={isNFTSend}
          />
          {!(transaction as Transaction).sendAsFile || finalizingTransaction ? (
            <DeviceAction
              action={transactionAction}
              request={{
                tokenCurrency: tokenCurrency ? tokenCurrency : undefined,
                parentAccount,
                account,
                transaction,
                status,
              }}
              Result={(
                props:
                  | {
                      signedOperation: SignedOperation | undefined | null;
                      device: Device;
                    }
                  | {
                      transactionSignError: Error;
                    },
              ) => {
                if (!("signedOperation" in props)) return null;
                return (
                  <StepProgress>
                    <DeviceBlocker />
                    <Trans i18nKey="send.steps.confirmation.pending.title" />
                  </StepProgress>
                );
              }}
              onResult={this.onTransactionSigned}
              analyticsPropertyFlow="send"
            />
          ) : transactionData !== null ? (
            <>
              <Box flow={1} mb={4}>
                <Box style={{ display: "block" }} horizontal flow={2} mb={3}>
                  <Text
                    style={{ flex: 1 }}
                    ff="Inter|SemiBold"
                    color="palette.text.shade100"
                    fontSize={4}
                  >
                    <Trans i18nKey="families.mimblewimble_coin.transactionRequest" />
                  </Text>
                  {useTransactionDataQrCode ? (
                    <Box style={{ float: "right", marginLeft: 10 }}>
                      <LinkShowQRCode onClick={this.showQRCodeModal} address={transactionData} />
                    </Box>
                  ) : null}
                </Box>
                <ReadOnlyTransactionField transactionData={transactionData} allowSave />
              </Box>
              <StepRecipientSeparator />
              <Label mb={5} mt={20}>
                <Trans i18nKey="families.mimblewimble_coin.transactionResponseReceived" />
              </Label>
              <TextAreaTransaction
                value={transactionResponse || ""}
                onChange={this.onTransactionResponseChange}
                error={transactionResponseError}
                warning={transactionResponseWarning}
              />
            </>
          ) : (
            <DeviceAction
              action={openAction}
              request={{
                account: mainAccount,
              }}
              Result={() => {
                return <StepProgress />;
              }}
              onResult={this.onDeviceConnected}
              analyticsPropertyFlow="send"
            />
          )}
        </Box>
        <Modal isOpened={modalVisible} onClose={this.hideQRCodeModal} centered width={460}>
          <ModalBody
            onClose={this.hideQRCodeModal}
            render={() => (
              <Box alignItems="center">
                <QRCodeWrapper>
                  <QRCode size={372} data={transactionData!} errorCorrectionLevel={"L"} />
                </QRCodeWrapper>
                <Box mt={6}>
                  <ReadOnlyTransactionField transactionData={transactionData!} />
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
  stepConnectDevice: StepConnectDevice | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setFooterState: ((state: { [key: string]: any }) => void) | undefined;

class StepConnectDeviceFooter extends PureComponent<StepProps, FooterState> {
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
    const { transaction } = this.props;
    const { transactionData, disableContinue, stepConnectDevice, finalizingTransaction } =
      this.state;

    if (!stepConnectDevice || !transaction) {
      return null;
    }

    return (
      <>
        {(transaction as Transaction).sendAsFile &&
        !finalizingTransaction &&
        transactionData !== null ? (
          <Button
            data-testid="modal-continue-button"
            primary
            disabled={disableContinue}
            onClick={stepConnectDevice.onContinue}
          >
            <Trans i18nKey="common.continue" />
          </Button>
        ) : null}
      </>
    );
  }
}

export default {
  StepConnectDevice: connect(null, mapDispatchToProps)(StepConnectDevice),
  StepConnectDeviceFooter,
};
