import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Linking, Share, View, StyleSheet, Platform, BackHandler } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import QRCode from "react-native-qrcode-svg";
import { useTranslation, Trans } from "react-i18next";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import type {
  Account,
  TokenAccount,
  Address,
  AccountLike,
  OperationRaw,
} from "@ledgerhq/types-live";
import type { CryptoOrTokenCurrency, TokenCurrency, Currency } from "@ledgerhq/types-cryptoassets";
import {
  makeEmptyTokenAccount,
  getMainAccount,
  getAccountCurrency,
} from "@ledgerhq/live-common/account/index";
import { getCurrencyColor } from "@ledgerhq/live-common/currencies/color";
import { useToasts } from "@ledgerhq/live-common/notifications/ToastProvider/index";
import { useTheme } from "styled-components/native";
import { Flex, Text, IconsLegacy, Box, BannerCard, Icons } from "@ledgerhq/native-ui";
import { useRoute, useTheme as useThemeNative } from "@react-navigation/native";
import getWindowDimensions from "~/logic/getWindowDimensions";
import { accountScreenSelector } from "~/reducers/accounts";
import CurrencyIcon from "~/components/CurrencyIcon";
import NavigationScrollView from "~/components/NavigationScrollView";
import ReceiveSecurityModal from "~/screens/ReceiveFunds/ReceiveSecurityModal";
import { addOneAccount } from "~/actions/accounts";
import { ScreenName } from "~/const";
import { track, TrackScreen } from "~/analytics";

import { ReceiveFundsStackParamList } from "~/components/RootNavigator/types/ReceiveFundsNavigator";
import { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import styled, { BaseStyledProps } from "@ledgerhq/native-ui/components/styled";
import Clipboard from "@react-native-clipboard/clipboard";
import { BankMedium } from "@ledgerhq/native-ui/assets/icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hasClosedWithdrawBannerSelector } from "~/reducers/settings";
import { setCloseWithdrawBanner } from "~/actions/settings";
import * as Animatable from "react-native-animatable";
import { urls } from "~/utils/urls";
import { useMaybeAccountName } from "~/reducers/wallet";
import { createAction } from "@ledgerhq/live-common/hw/actions/app";
import connectApp from "@ledgerhq/live-common/hw/connectApp";
import Icon from "react-native-vector-icons/FontAwesome";
import { DeviceModelId } from "@ledgerhq/types-devices";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import { StackNavigationProp } from "@react-navigation/stack";
import { Subscription } from "rxjs";
import {
  validateTransactionData,
  addReceivedTransactionToAccount,
} from "@ledgerhq/live-common/families/mimblewimble_coin/react";
import getTransactionResponse from "@ledgerhq/live-common/families/mimblewimble_coin/getTransactionResponse";
// @ts-expect-error no declaration file
import qrcode from "qrcode";
import { updateAccountWithUpdater } from "../../actions/accounts";
import { renderLoading } from "../../components/DeviceAction/rendering";
import { toAccountRaw } from "@ledgerhq/live-common/account/serialization";
import PreventNativeBack from "../../components/PreventNativeBack";
import DeviceAction from "../../components/DeviceAction";
import logger from "../../logger";
import ValidateError from "../../components/ValidateError";
import SkipLock from "../../components/behaviour/SkipLock";
import { HeaderBackButton } from "@react-navigation/elements";
import StepHeader from "../../components/StepHeader";
import { SyncSkipUnderPriority } from "@ledgerhq/live-common/bridge/react/index";
import ValidateReceiveOnDevice from "./ValidateReceiveOnDevice";
import ValidateReceiveSuccess from "./ValidateReceiveSuccess";
import { navigateToSelectDevice } from "../../screens/ConnectDevice";
import KeyboardView from "../../components/KeyboardView";
import LText from "../../components/LText";
import RecipientInput from "../../components/RecipientInput";
import TranslatedError from "../../components/TranslatedError";
import { NavigationHeaderCloseButtonAdvanced } from "../../components/NavigationHeaderCloseButton";
import Button from "~/components/Button";

const AnimatedView = Animatable.View;

const openAction = createAction(connectApp);

const IconQRCode = ({ size = 16, color }: { size?: number; color?: string }) => (
  <Icon name="qrcode" size={size} color={color} />
);

const styles = StyleSheet.create({
  separatorContainer: {
    marginTop: 32,
    flexDirection: "row",
    alignItems: "center",
  },
  separatorLine: {
    flex: 1,
    borderBottomWidth: 1,
    marginHorizontal: 8,
  },
  inputWrapper: {
    marginTop: 32,
    flexDirection: "row",
    alignItems: "center",
  },
  container: {
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  warningBox: {
    marginTop: 8,
    ...Platform.select({
      android: {
        marginLeft: 6,
      },
    }),
  },
});

type ScreenProps = BaseComposite<
  StackNavigatorProps<ReceiveFundsStackParamList, ScreenName.ReceiveConfirmation>
>;

type Props = {
  account?: TokenAccount | Account;
  parentAccount?: Account;
  readOnlyModeEnabled?: boolean;
} & ScreenProps;

type ParamList = {
  account?: AccountLike;
  accountId: string;
  parentId?: string;
  modelId?: DeviceModelId;
  verified?: boolean;
  wired?: boolean;
  device?: Device;
  currency?: Currency;
  createTokenAccount?: boolean;
  onSuccess?: (_?: string) => void;
  onError?: () => void;
  transactionData?: string;
};

const StyledTouchableHightlight = styled.TouchableHighlight<BaseStyledProps>``;
const StyledTouchableOpacity = styled.TouchableOpacity<BaseStyledProps>``;

export default function ReceiveConfirmation({ navigation }: Props) {
  const route = useRoute<ScreenProps["route"]>();
  const { account, parentAccount } = useSelector(accountScreenSelector(route));

  return account ? (
    <ReceiveConfirmationInner
      navigation={navigation}
      route={route}
      account={account as Account | TokenAccount}
      parentAccount={parentAccount ?? undefined}
    />
  ) : null;
}

function ReceiveConfirmationInner({ navigation, route, account, parentAccount }: Props) {
  const { colors } = useTheme();
  const themeNative = useThemeNative();
  const { t } = useTranslation();
  useEffect(() => {
    if (!route.params.verified) {
      let selectAccountRoute: number | undefined;
      for (let i = 0; i < navigation.getState().routes.length; ++i) {
        if (navigation.getState().routes[i].name === ScreenName.ReceiveSelectAccount) {
          selectAccountRoute = i;
          break;
        }
      }
      if (navigation.getState().routes[0].name === ScreenName.ReceiveSelectCrypto) {
        if (selectAccountRoute !== undefined) {
          (navigation as StackNavigationProp<{ [key: string]: object }>).reset({
            index: 2,
            routes: [
              (navigation as StackNavigationProp<{ [key: string]: object }>).getState().routes[0],
              (navigation as StackNavigationProp<{ [key: string]: object }>).getState().routes[
                selectAccountRoute
              ],
              {
                name: ScreenName.ReceiveConnectDevice,
                params: {
                  ...route.params,
                  notSkippable: true,
                  transactionData: undefined,
                },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          });
        } else {
          (navigation as StackNavigationProp<{ [key: string]: object }>).reset({
            index: 1,
            routes: [
              (navigation as StackNavigationProp<{ [key: string]: object }>).getState().routes[0],
              {
                name: ScreenName.ReceiveConnectDevice,
                params: {
                  ...route.params,
                  notSkippable: true,
                  transactionData: undefined,
                },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          });
        }
      } else if (selectAccountRoute !== undefined) {
        (navigation as StackNavigationProp<{ [key: string]: object }>).reset({
          index: 1,
          routes: [
            (navigation as StackNavigationProp<{ [key: string]: object }>).getState().routes[
              selectAccountRoute
            ],
            {
              name: ScreenName.ReceiveConnectDevice,
              params: {
                ...route.params,
                notSkippable: true,
                transactionData: undefined,
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any,
        });
      } else {
        (navigation as StackNavigationProp<{ [key: string]: object }>).reset({
          index: 0,
          routes: [
            {
              name: ScreenName.ReceiveConnectDevice,
              params: {
                ...route.params,
                notSkippable: true,
                transactionData: undefined,
              },
            },
          ],
        });
      }
    }
  }, [navigation, route.params]);
  if (!route.params.verified) {
    navigation.setOptions({
      headerLeft: undefined,
      headerRight: undefined,
      headerTitle: "",
      gestureEnabled: false,
    });
  }
  const { pushToast } = useToasts();
  const verified = route.params?.verified ?? false;
  const [isModalOpened, setIsModalOpened] = useState(true);
  const [hasAddedTokenAccount, setHasAddedTokenAccount] = useState(false);
  const [hasCopied, setCopied] = useState(false);
  const [enterTransaction, setEnterTransaction] = useState(
    (route.params as ParamList).transactionData !== undefined,
  );
  const [transactionData, setTransactionData] = useState("");
  const [transactionDataError, setTransactionDataError] = useState<undefined | Error>(undefined);
  const [transactionDataWarning, setTransactionDataWarning] = useState<undefined | Error>(
    undefined,
  );
  const [finalizeTransaction, setFinalizeTransaction] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<null | Device>(null);
  const getTransactionResponseSubscription = useRef<null | Subscription>(null);
  const [processingTransactionError, setProcessingTransactionError] = useState<null | Error>(null);
  const [useTransactionResponseQrCode, setUseTransactionResponseQrCode] = useState(true);
  const [operationAmount, setOperationAmount] = useState<null | string>(null);
  const [operationFee, setOperationFee] = useState<null | string>(null);
  const [operationSenderPaymentProofAddress, setOperationSenderPaymentProofAddress] = useState<
    null | string
  >(null);
  const [signatureRequested, setSignatureRequested] = useState(false);
  const [signatureReceived, setSignatureReceived] = useState(false);
  const [transactionResponse, setTransactionResponse] = useState<null | string>(null);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const hasClosedWithdrawBanner = useSelector(hasClosedWithdrawBannerSelector);
  const [displayBanner, setBanner] = useState(!hasClosedWithdrawBanner);

  const onRetry = useCallback(() => {
    track("button_clicked", {
      button: "Verify address",
      page: "Receive Account Qr Code",
    });
    const params = { ...route.params, notSkippable: true };
    setIsModalOpened(false);
    navigation.navigate(ScreenName.ReceiveConnectDevice, params);
  }, [navigation, route.params]);

  const { width } = getWindowDimensions();
  const QRSize = Math.round(width / 1.8 - 16);
  const QRContainerSize = QRSize + 16 * 4;

  const mainAccount = account && getMainAccount(account, parentAccount);
  const currency = route.params?.currency || (account && getAccountCurrency(account));

  const network = useMemo(() => {
    if (currency && currency.type === "TokenCurrency") {
      return currency.parentCurrency?.name;
    }
  }, [currency]);

  const hideBanner = useCallback(() => {
    track("button_clicked", {
      button: "How to withdraw from exchange",
      page: "Receive Account Qr Code",
    });
    dispatch(setCloseWithdrawBanner(true));
    setBanner(false);
  }, [dispatch]);

  const clickLearn = () => {
    track("button_clicked", {
      button: "How to withdraw from exchange",
      type: "card",
      page: "Receive Account Qr Code",
    });
    Linking.openURL(urls.withdrawCrypto);
  };
  useEffect(() => {
    if (!route.params.verified) {
      return;
    }
    if (route.params?.createTokenAccount && !hasAddedTokenAccount) {
      const newMainAccount = { ...mainAccount };
      if (
        !newMainAccount.subAccounts ||
        !newMainAccount.subAccounts.find(
          acc => (acc as TokenAccount)?.token?.id === (currency as CryptoOrTokenCurrency).id,
        )
      ) {
        const emptyTokenAccount = makeEmptyTokenAccount(
          newMainAccount as Account,
          currency as TokenCurrency,
        );
        newMainAccount.subAccounts = [...(newMainAccount.subAccounts || []), emptyTokenAccount];

        dispatch(addOneAccount(newMainAccount as Account));
        setHasAddedTokenAccount(true);
      }
    }
  }, [
    currency,
    route.params?.createTokenAccount,
    mainAccount,
    dispatch,
    hasAddedTokenAccount,
    route.params?.verified,
  ]);

  useEffect(() => {
    if (!route.params.verified) {
      return;
    }
    if (verified && currency) {
      track("Verification Success", {
        asset: currency.name,
        page: "Receive Account Qr Code",
      });
    }
  }, [verified, currency, route.params?.verified]);

  const triggerSuccessEvent = useCallback(() => {
    track("receive_done", {
      asset: currency?.name,
      network,
      page: "Receive Account Qr Code",
    });
  }, [network, currency?.name]);

  const onShare = useCallback(() => {
    track("button_clicked", {
      button: "Share address",
      page: "Receive Account Qr Code",
    });
    if (mainAccount?.freshAddress) {
      Share.share({ message: mainAccount?.freshAddress });
    }
  }, [mainAccount?.freshAddress]);

  const onCopyAddress = useCallback(
    (eventName: string) => {
      if (!mainAccount?.freshAddress) return;
      Clipboard.setString(mainAccount.freshAddress);
      setCopied(true);
      track("button_clicked", {
        button: eventName,
        page: "Receive Account Qr Code",
      });
      const options = {
        enableVibrateFallback: false,
        ignoreAndroidSystemSettings: false,
      };

      setTimeout(() => {
        setCopied(false);
      }, 3000);

      ReactNativeHapticFeedback.trigger("soft", options);
      pushToast({
        id: `copy-receive`,
        type: "success",
        icon: "success",
        title: t("transfer.receive.addressCopied"),
      });
    },
    [mainAccount?.freshAddress, pushToast, t],
  );

  const onContinue = useCallback(() => {
    setEnterTransaction(true);
  }, [setEnterTransaction]);
  const onFinalize = useCallback(() => {
    setFinalizeTransaction(true);
  }, [setFinalizeTransaction]);
  const onPressScan = useCallback(() => {
    (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
      ScreenName.MimbleWimbleCoinScanTransactionData,
      route.params,
    );
  }, [navigation, route.params]);
  const onChangeTransactionData = useCallback(
    (transactionData: string) => {
      if (transactionData) {
        const { error, warning } = validateTransactionData(
          (account as Account).currency,
          transactionData,
        );
        setTransactionDataError(error);
        setTransactionDataWarning(warning);
      } else {
        setTransactionDataError(undefined);
        setTransactionDataWarning(undefined);
      }
      setTransactionData(transactionData);
    },
    [account, setTransactionDataError, setTransactionDataWarning, setTransactionData],
  );
  useEffect(() => {
    if (!route.params.verified) {
      return;
    }
    if ((route.params as ParamList).transactionData !== undefined) {
      setTransactionData((route.params as ParamList).transactionData || "");
      onChangeTransactionData((route.params as ParamList).transactionData!);
    }
  }, [setTransactionData, route.params, onChangeTransactionData, route.params?.verified]);
  const onDeviceConnected = useCallback(
    ({ device }: { device: Device }) => {
      setCurrentDevice(device);
      return renderLoading({ t });
    },
    [setCurrentDevice, t],
  );
  useEffect(() => {
    if (!route.params.verified) {
      return;
    }
    if (currentDevice) {
      unsubscribe();
      let transactionResponseReceived = false;
      getTransactionResponseSubscription.current = getTransactionResponse(
        toAccountRaw(account as Account),
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
              setOperationAmount((operation as OperationRaw).value);
              setOperationFee((operation as OperationRaw).fee);
              setOperationSenderPaymentProofAddress(
                (operation as OperationRaw).senders.length
                  ? (operation as OperationRaw).senders[0]
                  : null,
              );
              setSignatureRequested(true);
              break;
            case "device-signature-granted":
              setSignatureReceived(true);
              break;
            case "signed":
              transactionResponseReceived = true;
              qrcode.toString(
                transactionResponse,
                {
                  errorCorrectionLevel: "L",
                },
                (error: Error | null) => {
                  if (getTransactionResponseSubscription.current) {
                    dispatch(
                      updateAccountWithUpdater({
                        accountId: (mainAccount as Account).id,
                        updater: (account: Account) => {
                          return addReceivedTransactionToAccount(
                            account,
                            freshAddress as Address,
                            nextIdentifier as string,
                            operation as OperationRaw,
                          );
                        },
                      }),
                    );
                    setUseTransactionResponseQrCode(!error);
                    setCurrentDevice(null);
                    setOperationAmount((operation as OperationRaw).value);
                    setTransactionResponse(transactionResponse as string);
                  }
                },
              );
              break;
            default:
              break;
          }
        },
        error: (error: Error) => {
          if (!transactionResponseReceived) {
            setProcessingTransactionError(error);
            setCurrentDevice(null);
            logger.critical(error);
          }
        },
      });
    } else {
      unsubscribe();
    }
    // eslint-disable-next-line consistent-return
    return () => {
      unsubscribe();
    };
  }, [currentDevice, account, dispatch, mainAccount, transactionData, route.params?.verified]);
  const unsubscribe = () => {
    if (getTransactionResponseSubscription.current) {
      getTransactionResponseSubscription.current.unsubscribe();
      getTransactionResponseSubscription.current = null;
    }
  };
  const retry = useCallback(() => {
    (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
      ScreenName.ReceiveConfirmation,
      {
        ...route.params,
        verified: false,
        transactionData: undefined,
      },
    );
  }, [navigation, route.params]);
  const close = useCallback(() => {
    (navigation.getParent() as StackNavigationProp<{ [key: string]: object }>).pop();
  }, [navigation]);
  const share = useCallback(() => {
    Share.share({ message: transactionResponse || "" });
  }, [transactionResponse]);
  useEffect(() => {
    if (!route.params.verified) {
      return;
    }
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!signatureRequested || processingTransactionError) {
        (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
          ScreenName.ReceiveConfirmation,
          {
            ...route.params,
            verified: false,
            transactionData: undefined,
          },
        );
      }
      return true;
    });
    if (!signatureRequested) {
      navigation.setOptions({
        headerLeft: () => (
          <HeaderBackButton
            onPress={() =>
              (navigation as StackNavigationProp<{ [key: string]: object }>).navigate(
                ScreenName.ReceiveConfirmation,
                {
                  ...route.params,
                  verified: false,
                  transactionData: undefined,
                },
              )
            }
          />
        ),
        headerRight: () => <NavigationHeaderCloseButtonAdvanced />,
        headerTitle: () => (
          <StepHeader
            subtitle={t("transfer.receive.stepperHeader.range", {
              currentStep: "3",
              totalSteps: 3,
            })}
            title={t("mimblewimble_coin.receiveFunds")}
          />
        ),
        gestureEnabled: Platform.OS === "ios",
      });
    } else {
      navigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle:
          processingTransactionError || transactionResponse !== null
            ? ""
            : () => (
                <StepHeader
                  subtitle={t("transfer.receive.stepperHeader.range", {
                    currentStep: "3",
                    totalSteps: 3,
                  })}
                  title={t("mimblewimble_coin.receiveFunds")}
                />
              ),
        gestureEnabled: false,
      });
    }
    // eslint-disable-next-line consistent-return
    return () => backHandler.remove();
  }, [
    signatureRequested,
    signatureReceived,
    processingTransactionError,
    transactionResponse,
    navigation,
    route.params,
    t,
    route.params?.verified,
  ]);

  const mainAccountName = useMaybeAccountName(mainAccount);

  if (!route.params.verified) {
    return null;
  }

  if (!account || !currency || !mainAccount) return null;

  return (
    <Flex flex={1} mb={insets.bottom}>
      <PreventNativeBack />
      <SyncSkipUnderPriority priority={100} />
      {transactionResponse !== null ? (
        <>
          <ValidateReceiveSuccess
            transactionResponse={transactionResponse}
            useTransactionResponseQrCode={useTransactionResponseQrCode}
            operationAmount={operationAmount || ""}
            mainAccount={mainAccount}
          />
          <View style={[styles.container, { paddingVertical: 16 }]}>
            <Button
              event="ReceiveConfirmationShare"
              type="tertiary"
              title={<Trans i18nKey={"mimblewimble_coin.shareResponse"} />}
              onPress={share}
            />
            <View style={[{ marginTop: 16 }]} />
            <Button
              event="ReceiveConfirmationClose"
              type="primary"
              title={<Trans i18nKey={"common.close"} />}
              onPress={close}
            />
          </View>
        </>
      ) : processingTransactionError ? (
        <ValidateError error={processingTransactionError} onRetry={retry} onClose={close} />
      ) : signatureReceived ? (
        <>{renderLoading({ t })}</>
      ) : signatureRequested ? (
        <>
          <SkipLock />
          <ValidateReceiveOnDevice
            account={account}
            parentAccount={parentAccount}
            device={route.params.device}
            amount={operationAmount || ""}
            fee={operationFee || ""}
            senderPaymentProofAddress={operationSenderPaymentProofAddress}
          />
        </>
      ) : finalizeTransaction ? (
        <Flex style={[styles.container, { flex: 1 }]}>
          <DeviceAction
            action={openAction}
            request={{
              account: account as Account,
            }}
            device={route.params.device}
            onSelectDeviceLink={() =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              navigateToSelectDevice(navigation as any, route as any)
            }
            renderOnResult={onDeviceConnected}
          />
        </Flex>
      ) : enterTransaction ? (
        <KeyboardView style={{ flex: 1 }}>
          <NavigationScrollView
            style={[styles.container, { flex: 1 }]}
            keyboardShouldPersistTaps="handled"
          >
            <TrackScreen category="Receive" name="Enter Transaction" currency={currency.name} />
            <Text variant="body" fontWeight="medium" color="neutral.c70" textAlign="center" mt={4}>
              {t("mimblewimble_coin.transactionToReceive")}
            </Text>
            <Button
              mt={3}
              event="SendConnectDeviceQR"
              type="tertiary"
              title={<Trans i18nKey="send.recipient.scan" />}
              IconLeft={IconQRCode}
              onPress={onPressScan}
            />
            <View style={styles.separatorContainer}>
              <View
                style={[styles.separatorLine, { borderBottomColor: themeNative.colors.lightFog }]}
              />
              <LText color="grey">{<Trans i18nKey="common.or" />}</LText>
              <View
                style={[styles.separatorLine, { borderBottomColor: themeNative.colors.lightFog }]}
              />
            </View>
            <View style={styles.inputWrapper}>
              <RecipientInput
                onPaste={async () => {
                  const transactionData = await Clipboard.getString();
                  onChangeTransactionData(transactionData);
                }}
                onChangeText={onChangeTransactionData}
                value={transactionData}
                placeholder={t("mimblewimble_coin.enterTransaction")}
              />
            </View>
            {transactionDataError || transactionDataWarning ? (
              <LText
                style={styles.warningBox}
                color={
                  transactionDataError ? "alert" : transactionDataWarning ? "orange" : "darkBlue"
                }
              >
                <TranslatedError error={transactionDataError || transactionDataWarning} />
              </LText>
            ) : null}
          </NavigationScrollView>
          <Flex m={6}>
            <Button
              event="ReceiveConfirmationFinalize"
              type="primary"
              title={<Trans i18nKey={"common.continue"} />}
              disabled={!!(!transactionData || transactionDataError)}
              onPress={onFinalize}
            />
          </Flex>
        </KeyboardView>
      ) : (
        <>
          <NavigationScrollView style={{ flex: 1 }}>
            <TrackScreen
              category="Deposit"
              name="Receive Account Qr Code"
              asset={currency.name}
              network={network}
            />
            <Flex p={0} alignItems="center" justifyContent="center">
              <StyledTouchableHightlight
                activeOpacity={1}
                underlayColor={colors.palette.opacityDefault.c10}
                alignItems="center"
                justifyContent="center"
                width={QRContainerSize}
                p={6}
                mt={10}
                bg={"opacityDefault.c05"}
                borderRadius={2}
                onPress={() => onCopyAddress("Qr code copy address")}
              >
                <View>
                  <Box mb={6}>
                    <Text
                      variant={"body"}
                      fontWeight={"semiBold"}
                      textAlign={"center"}
                      numberOfLines={1}
                      testID={"receive-account-name-" + mainAccountName}
                    >
                      {mainAccountName}
                    </Text>
                  </Box>
                  <Flex
                    p={6}
                    borderRadius={24}
                    position="relative"
                    bg="constant.white"
                    borderWidth={1}
                    borderColor="neutral.c40"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <QRCode size={QRSize} value={mainAccount.freshAddress} ecl="H" />
                    <Flex
                      alignItems="center"
                      justifyContent="center"
                      width={QRSize * 0.3}
                      height={QRSize * 0.3}
                      bg="constant.white"
                      position="absolute"
                    >
                      <CurrencyIcon
                        currency={currency}
                        color={colors.constant.white}
                        bg={getCurrencyColor(currency) || colors.constant.black}
                        size={48}
                        circle
                      />
                    </Flex>
                  </Flex>
                  <Text
                    testID="receive-fresh-address"
                    variant={"body"}
                    fontWeight={"medium"}
                    textAlign={"center"}
                    mt={6}
                  >
                    {mainAccount.freshAddress}
                  </Text>
                </View>
              </StyledTouchableHightlight>
              <Flex width={QRContainerSize} flexDirection="row" mt={6}>
                <StyledTouchableOpacity
                  p={4}
                  bg={"opacityDefault.c05"}
                  borderRadius={2}
                  mr={4}
                  onPress={onShare}
                >
                  <IconsLegacy.ShareMedium size={20} />
                </StyledTouchableOpacity>
                <StyledTouchableOpacity
                  p={4}
                  bg={"opacityDefault.c05"}
                  justifyContent={"center"}
                  alignItems={"center"}
                  flexDirection="row"
                  flex={1}
                  borderRadius={2}
                  onPress={() => onCopyAddress("Copy address")}
                >
                  {hasCopied ? (
                    <>
                      <Icons.Check color="success.c70" size="S" />
                      <Text variant={"body"} fontWeight={"medium"} pl={3}>
                        {t("transfer.receive.receiveConfirmation.addressCopied")}
                      </Text>
                    </>
                  ) : (
                    <>
                      <IconsLegacy.CopyMedium size={20} />
                      <Text variant={"body"} fontWeight={"medium"} pl={3}>
                        {t("transfer.receive.receiveConfirmation.copyAdress")}
                      </Text>
                    </>
                  )}
                </StyledTouchableOpacity>
                <Button
                  event="ReceiveConfirmationContinue"
                  type="primary"
                  title={<Trans i18nKey={"common.continue"} />}
                  onPress={onContinue}
                />
              </Flex>
              <Flex px={6}>
                <Text
                  variant="small"
                  fontWeight="medium"
                  color="neutral.c70"
                  mt={6}
                  mb={4}
                  textAlign="center"
                >
                  {t("transfer.receive.receiveConfirmation.sendWarning", {
                    network: network || currency.name,
                  })}
                </Text>
              </Flex>
            </Flex>
          </NavigationScrollView>
          <Flex m={6}>
            <Flex>
              <Button
                type="main"
                size="large"
                onPress={onRetry}
                testID="button-receive-confirmation"
              >
                {t("transfer.receive.receiveConfirmation.verifyAddress")}
              </Button>

              {displayBanner ? (
                <AnimatedView animation="fadeInUp" delay={50} duration={300}>
                  <WithdrawBanner hideBanner={hideBanner} onPress={clickLearn} />
                </AnimatedView>
              ) : (
                <AnimatedView animation="fadeOutDown" delay={50} duration={300}>
                  <WithdrawBanner hideBanner={hideBanner} onPress={clickLearn} />
                </AnimatedView>
              )}
            </Flex>
          </Flex>
          {verified ? null : isModalOpened ? (
            <ReceiveSecurityModal
              onVerifyAddress={onRetry}
              triggerSuccessEvent={triggerSuccessEvent}
            />
          ) : null}
        </>
      )}
    </Flex>
  );
}

type BannerProps = {
  hideBanner: () => void;
  onPress: () => void;
};

const WithdrawBanner = ({ onPress, hideBanner }: BannerProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Flex pb={insets.bottom} mt={6}>
      <BannerCard
        typeOfRightIcon="close"
        title={t("transfer.receive.receiveConfirmation.bannerTitle")}
        LeftElement={<BankMedium />}
        onPressDismiss={hideBanner}
        onPress={onPress}
      />
    </Flex>
  );
};
