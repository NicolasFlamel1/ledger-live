import {
  MimbleWimbleCoinOperation,
  Transaction,
  TransactionStatus,
} from "@ledgerhq/live-common/families/mimblewimble_coin/types";
import { LLDCoinFamily } from "../types";
import { Account } from "@ledgerhq/types-live";
import operationDetails from "./operationDetails";
import StepImport from "./StepImport";
import sendAmountFields from "./SendAmountFields";
import getTransactionExplorer from "./getTransactionExplorer";
import ReceiveStepConnectDevice from "./ReceiveStepConnectDevice";
import sendRecipientFields from "./SendRecipientFields";
import transactionConfirmFields from "./TransactionConfirmFields";
import StepReceiveFunds from "./StepReceiveFunds";
import SendStepConnectDevice from "./SendStepConnectDevice";

const family: LLDCoinFamily<Account, Transaction, TransactionStatus, MimbleWimbleCoinOperation> = {
  operationDetails,
  StepImport,
  sendAmountFields,
  getTransactionExplorer,
  ReceiveStepConnectDevice,
  sendRecipientFields,
  transactionConfirmFields,
  StepReceiveFunds,
  SendStepConnectDevice,
};

export default family;
