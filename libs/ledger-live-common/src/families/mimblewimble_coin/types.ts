import {
  Account,
  AccountRaw,
  Operation,
  OperationRaw,
  TransactionCommon,
  TransactionCommonRaw,
  TransactionStatusCommon,
  TransactionStatusCommonRaw,
} from "@ledgerhq/types-live";
import RecentHeight from "./api/recentHeight";
import Identifier from "./api/identifier";
import BigNumber from "bignumber.js";

export type MimbleWimbleCoinResources = {
  rootPublicKey: Buffer;
  recentHeights: RecentHeight[];
  nextIdentifier: Identifier;
  nextTransactionSequenceNumber: number;
};

export type MimbleWimbleCoinResourcesRaw = {
  rootPublicKey: string;
  recentHeights: {
    height: string;
    hash: string;
  }[];
  nextIdentifier: string;
  nextTransactionSequenceNumber: number;
};

export type Transaction = TransactionCommon & {
  family: "mimblewimble_coin";
  sendAsFile: boolean;
  height: BigNumber | undefined;
  id: string | undefined;
  offset: Buffer | undefined;
  proof: Buffer | undefined;
  privateNonceIndex: number | undefined;
  transactionResponse: string | undefined;
  useDefaultBaseFee: boolean;
  baseFee: BigNumber;
  networkInfo: object;
};

export type TransactionRaw = TransactionCommonRaw & {
  family: "mimblewimble_coin";
  sendAsFile: boolean;
  height: string | undefined;
  id: string | undefined;
  offset: string | undefined;
  proof: string | undefined;
  privateNonceIndex: number | undefined;
  transactionResponse: string | undefined;
  useDefaultBaseFee: boolean;
  baseFee: string;
  networkInfo: object;
};

export type MimbleWimbleCoinAccount = Account & {
  mimbleWimbleCoinResources: MimbleWimbleCoinResources;
};

export type MimbleWimbleCoinAccountRaw = AccountRaw & {
  mimbleWimbleCoinResources: MimbleWimbleCoinResourcesRaw;
};

export type TransactionStatus = TransactionStatusCommon;

export type TransactionStatusRaw = TransactionStatusCommonRaw;

export type MimbleWimbleCoinOperationExtra = {
  outputCommitment?: Buffer;
  identifier?: Identifier;
  switchType?: number;
  spent?: boolean;
  kernelExcess?: Buffer | null;
  kernelOffset?: Buffer | null;
  recipientPaymentProofSignature?: Buffer | null;
};

export type MimbleWimbleCoinOperationExtraRaw = {
  outputCommitment?: string;
  identifier?: string;
  switchType?: number;
  spent?: boolean;
  kernelExcess?: string | null;
  kernelOffset?: string | null;
  recipientPaymentProofSignature?: string | null;
};

export type MimbleWimbleCoinOperation = Operation<MimbleWimbleCoinOperationExtra>;

export type MimbleWimbleCoinOperationRaw = OperationRaw<MimbleWimbleCoinOperationExtraRaw>;
