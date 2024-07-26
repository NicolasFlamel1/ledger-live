import Transport from "@ledgerhq/hw-transport";
import BIPPath from "bip32-path";
import type {
  Account,
  AccountRaw,
  DeviceId,
  Address,
  Operation,
  OperationRaw,
} from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import JSONBigNumber from "json-bignumber";
import MimbleWimbleCoin from "./hw-app-mimblewimble-coin";
import Crypto from "./api/crypto";
import Slate from "./api/slate";
import SlateParticipant from "./api/slateParticipant";
import SlateKernel from "./api/slateKernel";
import SlateOutput from "./api/slateOutput";
import type { MimbleWimbleCoinAccount, MimbleWimbleCoinOperationExtra } from "./types";
import { fromAccountRaw } from "../../account/serialization";
import Node from "./api/node";
import {
  MimbleWimbleCoinInvalidParameters,
  MimbleWimbleCoinUnsupportedTransactionData,
  MimbleWimbleCoinUnsupportedSlate,
  MimbleWimbleCoinAddingToSlateFailed,
  MimbleWimbleCoinUnsupportedResponseFromNode,
} from "./errors";
import { toOperationRaw } from "../../account";
import { encodeOperationId } from "../../operation";
import Identifier from "./api/identifier";
import Consensus from "./api/consensus";
import Slatepack from "./api/slatepack";
import { withDevice } from "../../hw/deviceAccess";
import { Observable, Subscriber } from "rxjs";

const buildOptimisticOperation = async (
  account: Account,
  slate: Slate,
  kernelOffset: Buffer,
  commitment: Buffer,
  identifier: Identifier,
  switchType: number,
): Promise<Operation> => {
  let kernelExcess: Buffer;
  try {
    kernelExcess = await slate.getExcess();
  } catch (error: any) {
    throw new MimbleWimbleCoinAddingToSlateFailed("Failed getting slate's kernel excess");
  }
  return {
    id: encodeOperationId(account.id, commitment.toString("hex"), "IN"),
    hash: slate.id,
    type: "IN",
    value: slate.amount,
    fee: slate.fee,
    senders: slate.senderPaymentProofAddress !== null ? [slate.senderPaymentProofAddress] : [],
    recipients: [account.freshAddress],
    blockHash: null,
    blockHeight: null,
    accountId: account.id,
    date: new Date(),
    transactionSequenceNumber: (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
      .nextTransactionSequenceNumber,
    extra: {
      outputCommitment: commitment,
      identifier,
      switchType,
      spent: false,
      kernelExcess,
      kernelOffset,
      recipientPaymentProofSignature: slate.recipientPaymentProofSignature,
    },
  };
};

export default (
  accountRaw: AccountRaw,
  deviceId: DeviceId,
  transactionData: string,
): Observable<{
  type: string;
  transactionResponse?: string;
  freshAddress?: Address;
  nextIdentifier?: string;
  operation?: OperationRaw;
}> =>
  withDevice(deviceId)((transport: Transport) => {
    return new Observable(
      (
        subscriber: Subscriber<{
          type: string;
          transactionResponse?: string;
          freshAddress?: Address;
          nextIdentifier?: string;
          operation?: OperationRaw;
        }>,
      ) => {
        (async () => {
          try {
            const account = fromAccountRaw(accountRaw);
            const mimbleWimbleCoin = new MimbleWimbleCoin(transport, account.currency);
            const transaction = transactionData.trim();
            let serializedSlate: { [key: string]: any } | Buffer;
            let senderAddress: string | null;
            if (Slatepack.isSlatepack(transaction, account.currency)) {
              try {
                ({ serializedSlate, senderAddress } = await Slatepack.decode(
                  account,
                  transaction,
                  mimbleWimbleCoin,
                ));
              } catch (error: any) {
                if (
                  !(error instanceof Error) ||
                  Object.getPrototypeOf(error).constructor.name === Error.constructor.name ||
                  error instanceof MimbleWimbleCoinInvalidParameters
                ) {
                  throw new MimbleWimbleCoinUnsupportedTransactionData("Invalid transaction");
                }
                throw error;
              }
            } else {
              try {
                serializedSlate = JSONBigNumber.parse(transaction);
                senderAddress = null;
              } catch (error: any) {
                throw new MimbleWimbleCoinUnsupportedTransactionData("Invalid transaction");
              }
            }
            let slate: Slate;
            try {
              slate = await Slate.unserialize(
                serializedSlate,
                account.currency,
                Slate.Purpose.SEND_INITIAL,
              );
            } catch (error: any) {
              throw new MimbleWimbleCoinUnsupportedTransactionData("Invalid transaction");
            }
            if (!slate.numberOfParticipants.isEqualTo(2)) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate number of participants");
            }
            if (slate.numberOfParticipants.isLessThanOrEqualTo(slate.participants.length)) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate number of participants");
            }
            if (!slate.getParticipant(SlateParticipant.SENDER_ID)) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate participants");
            }
            if (slate.getParticipant(SlateParticipant.SENDER_ID)!.isComplete()) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate participants");
            }
            if (slate.kernels.length !== 1) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate kernels");
            }
            if (slate.kernels[0].isComplete()) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate kernels");
            }
            if (
              slate.recipientPaymentProofAddress !== null &&
              slate.recipientPaymentProofAddress !== account.freshAddress
            ) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate payment proof");
            }
            if (slate.recipientPaymentProofSignature) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate payment proof");
            }
            if (
              slate.senderPaymentProofAddress !== null &&
              senderAddress !== null &&
              slate.senderPaymentProofAddress !== senderAddress
            ) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate payment proof");
            }
            if (slate.getKernelFeatures() !== SlateKernel.Features.PLAIN) {
              throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate kernels");
            }
            const { tipHeight } = await Node.getTip(account.currency);
            if (tipHeight.isZero()) {
              throw new MimbleWimbleCoinUnsupportedResponseFromNode("Unknown current height", {
                nodeName: Consensus.getNodeName(account.currency),
              });
            }
            if (
              slate.timeToLiveCutOffHeight &&
              slate.timeToLiveCutOffHeight.isLessThanOrEqualTo(tipHeight)
            ) {
              throw new MimbleWimbleCoinUnsupportedSlate(
                "Invalid slate time to live cut off height",
              );
            }
            for (const pendingOperation of account.pendingOperations) {
              if (pendingOperation.hash === slate.id) {
                throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate ID");
              }
            }
            for (const operation of account.operations) {
              if (operation.hash === slate.id) {
                throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate ID");
              }
            }
            const offset = slate.offset;
            let kernelOffset: Buffer;
            for (let uniqueKernelOffset = false; !uniqueKernelOffset; ) {
              uniqueKernelOffset = true;
              if (slate.isCompact()) {
                await slate.createOffset();
              }
              try {
                kernelOffset = await slate.getOffsetExcess();
              } catch (error: any) {
                throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate offset");
              }
              for (const pendingOperation of account.pendingOperations) {
                if (
                  pendingOperation.type !== "OUT" &&
                  (pendingOperation.extra as MimbleWimbleCoinOperationExtra).kernelOffset &&
                  (pendingOperation.extra as MimbleWimbleCoinOperationExtra).kernelOffset!.equals(
                    kernelOffset,
                  )
                ) {
                  uniqueKernelOffset = false;
                  break;
                }
              }
              if (uniqueKernelOffset) {
                for (const operation of account.operations) {
                  if (
                    operation.type !== "OUT" &&
                    (operation.extra as MimbleWimbleCoinOperationExtra).kernelOffset &&
                    (operation.extra as MimbleWimbleCoinOperationExtra).kernelOffset!.equals(
                      kernelOffset,
                    )
                  ) {
                    uniqueKernelOffset = false;
                    break;
                  }
                }
              }
              if (!uniqueKernelOffset && !slate.isCompact()) {
                throw new MimbleWimbleCoinUnsupportedSlate("Invalid slate offset");
              }
            }
            let commitment: Buffer = await mimbleWimbleCoin.getCommitment(
              account.freshAddressPath,
              (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
              slate.amount,
              Crypto.SwitchType.REGULAR,
            );
            for (let uniqueCommitment = false; !uniqueCommitment; ) {
              uniqueCommitment = true;
              for (const pendingOperation of account.pendingOperations) {
                if (
                  pendingOperation.type !== "OUT" &&
                  (
                    pendingOperation.extra as MimbleWimbleCoinOperationExtra
                  ).outputCommitment!.equals(commitment)
                ) {
                  uniqueCommitment = false;
                  (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier = (
                    account as MimbleWimbleCoinAccount
                  ).mimbleWimbleCoinResources.nextIdentifier.getNext();
                  commitment = await mimbleWimbleCoin.getCommitment(
                    account.freshAddressPath,
                    (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
                    slate.amount,
                    Crypto.SwitchType.REGULAR,
                  );
                  break;
                }
              }
              if (!uniqueCommitment) {
                continue;
              }
              for (const operation of account.operations) {
                if (
                  operation.type !== "OUT" &&
                  (operation.extra as MimbleWimbleCoinOperationExtra).outputCommitment!.equals(
                    commitment,
                  )
                ) {
                  uniqueCommitment = false;
                  (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier = (
                    account as MimbleWimbleCoinAccount
                  ).mimbleWimbleCoinResources.nextIdentifier.getNext();
                  commitment = await mimbleWimbleCoin.getCommitment(
                    account.freshAddressPath,
                    (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
                    slate.amount,
                    Crypto.SwitchType.REGULAR,
                  );
                  break;
                }
              }
            }
            const proof = await mimbleWimbleCoin.getProof(
              (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.rootPublicKey,
              account.freshAddressPath,
              (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
              slate.amount,
              Crypto.SwitchType.REGULAR,
              MimbleWimbleCoin.MessageType.RECEIVING_TRANSACTION,
            );
            if (
              !slate.addOutputs([new SlateOutput(SlateOutput.Features.PLAIN, commitment, proof)])
            ) {
              throw new MimbleWimbleCoinAddingToSlateFailed("Failed adding output to slate");
            }
            await mimbleWimbleCoin.startTransaction(
              account.freshAddressPath,
              slate.amount,
              new BigNumber(0),
              slate.fee,
              0,
              slate.senderPaymentProofAddress,
            );
            await mimbleWimbleCoin.includeOutputInTransaction(
              slate.amount,
              (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
              Crypto.SwitchType.REGULAR,
            );
            if (slate.isCompact()) {
              await mimbleWimbleCoin.applyOffsetToTransaction(slate.offset);
            }
            const publicBlindExcess = await mimbleWimbleCoin.getTransactionPublicKey();
            const publicNonce = await mimbleWimbleCoin.getTransactionPublicNonce();
            slate.addParticipant(
              new SlateParticipant(
                SlateParticipant.SENDER_ID.plus(1),
                publicBlindExcess,
                publicNonce,
              ),
            );
            if (slate.isCompact()) {
              if (!(await slate.combineOffsets(offset))) {
                throw new MimbleWimbleCoinAddingToSlateFailed(
                  "Failed combining offset with the slate's offset",
                );
              }
            }
            let publicNonceSum: Buffer;
            try {
              publicNonceSum = await slate.getPublicNonceSum();
            } catch (error: any) {
              throw new MimbleWimbleCoinAddingToSlateFailed(
                "Failed getting slate's public nonce sum",
              );
            }
            let publicBlindExcessSum: Buffer;
            try {
              publicBlindExcessSum = await slate.getPublicBlindExcessSum();
            } catch (error: any) {
              throw new MimbleWimbleCoinAddingToSlateFailed(
                "Failed getting slate's public blind excess sum",
              );
            }
            let excess: Buffer | null = null;
            if (slate.hasPaymentProof()) {
              try {
                excess = await slate.getExcess();
              } catch (error: any) {
                throw new MimbleWimbleCoinAddingToSlateFailed("Failed getting slate's excess");
              }
            }
            subscriber.next({
              type: "device-signature-requested",
              operation: toOperationRaw(
                await buildOptimisticOperation(
                  account,
                  slate,
                  kernelOffset!,
                  commitment,
                  (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
                  Crypto.SwitchType.REGULAR,
                ),
              ),
            });
            const { partialSignature, paymentProofSignature } =
              await mimbleWimbleCoin.getTransactionSignature(
                publicNonceSum,
                publicBlindExcessSum,
                slate.getKernelFeatures(),
                slate.lockHeight,
                slate.relativeHeight,
                excess,
                null,
              );
            subscriber.next({
              type: "device-signature-granted",
            });
            slate.getParticipant(SlateParticipant.SENDER_ID.plus(1))!.partialSignature =
              partialSignature;
            if (!(await slate.verifyPartialSignatures())) {
              throw new MimbleWimbleCoinAddingToSlateFailed(
                "Failed setting slate participant's partial signature",
              );
            }
            if (slate.hasPaymentProof()) {
              if (!(await slate.setRecipientPaymentProofSignature(paymentProofSignature!))) {
                throw new MimbleWimbleCoinAddingToSlateFailed(
                  "Failed setting slate's recipient payment proof signature",
                );
              }
            }
            const bipPath = BIPPath.fromString(account.freshAddressPath).toPathArray();
            ++bipPath[Crypto.BIP44_PATH_INDEX_INDEX];
            const newDerivationPath = BIPPath.fromPathArray(bipPath).toString(true);
            const newAddress = await mimbleWimbleCoin.getAddress(newDerivationPath);
            const serializedSlateResponse = await slate.serialize(
              Slate.Purpose.SEND_RESPONSE,
              Slatepack.isSlatepack(transaction, account.currency),
            );
            subscriber.next({
              type: "signed",
              transactionResponse:
                serializedSlateResponse instanceof Buffer
                  ? await Slatepack.encode(
                      account,
                      serializedSlateResponse,
                      mimbleWimbleCoin,
                      senderAddress,
                    )
                  : JSONBigNumber.stringify(serializedSlateResponse),
              freshAddress: {
                address: newAddress,
                derivationPath: newDerivationPath,
              },
              nextIdentifier: (
                account as MimbleWimbleCoinAccount
              ).mimbleWimbleCoinResources.nextIdentifier
                .getNext()
                .serialize()
                .toString("hex"),
              operation: toOperationRaw(
                await buildOptimisticOperation(
                  account,
                  slate,
                  kernelOffset!,
                  commitment,
                  (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.nextIdentifier,
                  Crypto.SwitchType.REGULAR,
                ),
              ),
            });
            subscriber.complete();
          } catch (error: any) {
            subscriber.error(error);
          }
        })();
      },
    );
  });
