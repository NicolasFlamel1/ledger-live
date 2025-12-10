import { Account, DeviceId, Operation, SignOperationEvent } from "@ledgerhq/types-live";
import { Observable, Subscriber } from "rxjs";
import type { MimbleWimbleCoinAccount, Transaction, MimbleWimbleCoinOperationExtra } from "./types";
import { encodeOperationId } from "../../operation";
import { withDevice } from "../../hw/deviceAccess";
import { toOperationRaw } from "../../account";
import type Transport from "@ledgerhq/hw-transport";
import BIPPath from "bip32-path";
import BigNumber from "bignumber.js";
import JSONBigNumber from "json-bignumber";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import Slate from "./api/slate";
import Consensus from "./api/consensus";
import MimbleWimbleCoin from "./hw-app-mimblewimble-coin";
import Crypto from "./api/crypto";
import Node from "./api/node";
import Identifier from "./api/identifier";
import WalletApi from "./api/walletApi";
import SlateInput from "./api/slateInput";
import SlateOutput from "./api/slateOutput";
import SlateKernel from "./api/slateKernel";
import SlateParticipant from "./api/slateParticipant";
import {
  MimbleWimbleCoinInvalidParameters,
  MimbleWimbleCoinUnsupportedResponseFromNode,
  MimbleWimbleCoinUnsupportedResponseFromRecipient,
  MimbleWimbleCoinCreatingSlateFailed,
  MimbleWimbleCoinFinalizingSlateFailed,
} from "./errors";
import Tor from "./api/tor";
import Slatepack from "./api/slatepack";
import Common from "./api/common";

const buildOptimisticOperation = async (
  account: Account,
  transaction: Transaction,
  slate: Slate,
  timestamp: Date,
): Promise<Operation> => {
  let kernelExcess: Buffer;
  try {
    kernelExcess = await slate.getExcess();
  } catch (error: any) {
    throw new MimbleWimbleCoinFinalizingSlateFailed(
      "Failed getting finalized slate's kernel excess",
    );
  }
  return {
    id: encodeOperationId(account.id, slate.id, "OUT"),
    hash: slate.id,
    type: "OUT",
    value: slate.amount,
    fee: slate.fee,
    senders: [account.freshAddress],
    recipients: [transaction.recipient.trim()],
    blockHash: null,
    blockHeight: null,
    accountId: account.id,
    date: timestamp,
    transactionSequenceNumber: (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
      .nextTransactionSequenceNumber,
    extra: {
      kernelExcess,
      recipientPaymentProofSignature: slate.recipientPaymentProofSignature,
    },
  };
};

const buildChangeOperation = async (
  account: Account,
  slate: Slate,
  kernelOffset: Buffer,
  amount: BigNumber,
  commitment: Buffer | undefined,
  identifier: Identifier,
  switchType: number,
  timestamp: Date,
): Promise<Operation | null> => {
  let kernelExcess: Buffer;
  try {
    kernelExcess = await slate.getExcess();
  } catch (error: any) {
    throw new MimbleWimbleCoinFinalizingSlateFailed(
      "Failed getting finalized slate's kernel excess",
    );
  }
  return amount.isZero()
    ? null
    : {
        id: encodeOperationId(account.id, commitment!.toString("hex"), "IN"),
        hash: "",
        type: "NONE",
        value: amount,
        fee: new BigNumber(-1),
        senders: [],
        recipients: [],
        blockHeight: null,
        blockHash: null,
        accountId: account.id,
        date: timestamp,
        transactionSequenceNumber:
          (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
            .nextTransactionSequenceNumber + 1,
        extra: {
          outputCommitment: commitment,
          identifier,
          switchType,
          spent: false,
          kernelExcess,
          kernelOffset,
          recipientPaymentProofSignature: null,
        },
      };
};

export default ({
  account,
  deviceId,
  transaction,
}: {
  account: Account;
  deviceId: DeviceId;
  transaction: Transaction;
}): Observable<SignOperationEvent> =>
  withDevice(deviceId)((transport: Transport) => {
    return new Observable((subscriber: Subscriber<SignOperationEvent>) => {
      (async () => {
        try {
          const inputs: Operation[] = [];
          let inputAmount: BigNumber = new BigNumber(0);
          for (let i: number = account.operations.length - 1; i >= 0; --i) {
            if (
              !transaction.useAllAmount &&
              (inputAmount.isEqualTo(
                transaction.amount.plus(
                  Slate.getRequiredFee(account.currency, inputs.length, 1, 1, transaction.baseFee),
                ),
              ) ||
                inputAmount.isGreaterThan(
                  transaction.amount.plus(
                    Slate.getRequiredFee(
                      account.currency,
                      inputs.length,
                      2,
                      1,
                      transaction.baseFee,
                    ),
                  ),
                ))
            ) {
              break;
            }
            if (
              account.operations[i].type !== "OUT" &&
              !(account.operations[i].extra as MimbleWimbleCoinOperationExtra).spent &&
              account.operations[i].blockHeight !== null &&
              (account.operations[i].type !== "COINBASE_REWARD" ||
                new BigNumber(account.blockHeight).isGreaterThanOrEqualTo(
                  new BigNumber(account.operations[i].blockHeight!)
                    .plus(Consensus.getCoinbaseMaturity(account.currency))
                    .minus(1),
                ))
            ) {
              inputAmount = inputAmount.plus(account.operations[i].value);
              inputs.push(account.operations[i]);
            }
          }
          const fee =
            transaction.useAllAmount ||
            inputAmount.isEqualTo(
              transaction.amount.plus(
                Slate.getRequiredFee(account.currency, inputs.length, 1, 1, transaction.baseFee),
              ),
            )
              ? Slate.getRequiredFee(account.currency, inputs.length, 1, 1, transaction.baseFee)
              : Slate.getRequiredFee(account.currency, inputs.length, 2, 1, transaction.baseFee);
          const { tipHeight } = await Node.getTip(account.currency);
          if (tipHeight.isZero()) {
            throw new MimbleWimbleCoinUnsupportedResponseFromNode("Unknown current height", {
              nodeName: Consensus.getNodeName(account.currency),
            });
          }
          if (transaction.amount.isZero()) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
          }
          if (fee.isZero() || fee.isGreaterThan(Consensus.getMaximumFee(account.currency))) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid fee");
          }
          if (transaction.baseFee.isZero()) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid base fee");
          }
          const recipient = transaction.recipient.trim();
          let usePaymentProof: boolean;
          let recipientAddress: string;
          switch (account.currency.id) {
            case "mimblewimble_coin":
            case "mimblewimble_coin_floonet":
            case "epic_cash":
            case "epic_cash_floonet":
              try {
                Tor.torAddressToPublicKey(recipient);
                usePaymentProof = true;
                recipientAddress = `http://${recipient}.onion`;
              } catch (error: any) {
                usePaymentProof = false;
                recipientAddress = recipient;
              }
              break;
            case "grin":
            case "grin_testnet":
              try {
                const recipientPublicKey = Slatepack.slatepackAddressToPublicKey(
                  recipient,
                  account.currency,
                );
                usePaymentProof = true;
                recipientAddress = `http://${Tor.publicKeyToTorAddress(recipientPublicKey)}.onion`;
              } catch (error: any) {
                usePaymentProof = false;
                recipientAddress = recipient;
              }
              break;
            default:
              usePaymentProof = false;
              recipientAddress = recipient;
              break;
          }
          let supportedSlateVersions: string[] | null;
          if (transaction.sendAsFile) {
            supportedSlateVersions = null;
          } else {
            supportedSlateVersions = await WalletApi.getSupportedSlateVersions(recipientAddress);
          }
          const slate = new Slate(
            account.currency,
            transaction.amount,
            fee,
            transaction.sendAsFile ? transaction.height! : tipHeight.plus(1),
            new BigNumber(0),
            null,
            usePaymentProof ? account.freshAddress : null,
            usePaymentProof ? recipient : null,
            supportedSlateVersions,
          );
          if (transaction.sendAsFile) {
            slate.id = transaction.id!;
          } else {
            if (
              supportedSlateVersions!.indexOf(
                Common.isBigNumber(slate.version)
                  ? `V${(slate.version as BigNumber).toFixed()}`
                  : (slate.version as string),
              ) === -1
            ) {
              throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
                "No supported recipient slate versions",
              );
            }
            for (let uniqueId = false; !uniqueId; ) {
              uniqueId = true;
              for (const pendingOperation of account.pendingOperations) {
                if (pendingOperation.hash === slate.id) {
                  uniqueId = false;
                  slate.changeId();
                  break;
                }
              }
              if (!uniqueId) {
                continue;
              }
              for (const operation of account.operations) {
                if (operation.hash === slate.id) {
                  uniqueId = false;
                  slate.changeId();
                  break;
                }
              }
            }
          }
          const change = inputAmount.minus(transaction.amount.plus(fee));
          const numberOfOutputs = change.isZero() ? 1 : 2;
          if (
            !slate.addInputs(
              inputs.map((operation: Operation): SlateInput => {
                return new SlateInput(
                  operation.type === "COINBASE_REWARD"
                    ? SlateInput.Features.COINBASE
                    : SlateInput.Features.PLAIN,
                  (operation.extra as MimbleWimbleCoinOperationExtra).outputCommitment!,
                );
              }),
              numberOfOutputs,
            )
          ) {
            throw new MimbleWimbleCoinCreatingSlateFailed("Failed adding input(s) to slate");
          }
          let commitment: Buffer | undefined;
          const mimbleWimbleCoin = new MimbleWimbleCoin(transport, account.currency);
          let currentIdentifier: Identifier = (account as MimbleWimbleCoinAccount)
            .mimbleWimbleCoinResources.nextIdentifier;
          if (!change.isZero()) {
            commitment = await mimbleWimbleCoin.getCommitment(
              account.freshAddressPath,
              currentIdentifier.withHeight(account.currency, slate.height!),
              change,
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
                  currentIdentifier = currentIdentifier.getNext();
                  commitment = await mimbleWimbleCoin.getCommitment(
                    account.freshAddressPath,
                    currentIdentifier.withHeight(account.currency, slate.height!),
                    change,
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
                  currentIdentifier = currentIdentifier.getNext();
                  commitment = await mimbleWimbleCoin.getCommitment(
                    account.freshAddressPath,
                    currentIdentifier.withHeight(account.currency, slate.height!),
                    change,
                    Crypto.SwitchType.REGULAR,
                  );
                  break;
                }
              }
            }
            let proof: Buffer;
            if (transaction.sendAsFile) {
              proof = transaction.proof!;
            } else {
              proof = await mimbleWimbleCoin.getProof(
                (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.rootPublicKey,
                account.freshAddressPath,
                currentIdentifier.withHeight(account.currency, slate.height!),
                change,
                Crypto.SwitchType.REGULAR,
                MimbleWimbleCoin.MessageType.SENDING_TRANSACTION,
              );
            }
            if (
              !slate.addOutputs([new SlateOutput(SlateOutput.Features.PLAIN, commitment, proof)])
            ) {
              throw new MimbleWimbleCoinCreatingSlateFailed("Failed adding output to slate");
            }
          }
          let kernelOffset: Buffer;
          if (transaction.sendAsFile) {
            slate.offset = transaction.offset!;
            try {
              kernelOffset = await slate.getOffsetExcess();
            } catch (error: any) {
              throw new MimbleWimbleCoinFinalizingSlateFailed(
                "Failed getting slate's kernel offset",
              );
            }
          } else {
            await slate.createOffset();
            for (let uniqueKernelOffset = false; !uniqueKernelOffset; ) {
              uniqueKernelOffset = true;
              try {
                kernelOffset = await slate.getOffsetExcess();
              } catch (error: any) {
                throw new MimbleWimbleCoinCreatingSlateFailed(
                  "Failed getting slate's kernel offset",
                );
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
                  await slate.createOffset();
                  break;
                }
              }
              if (!uniqueKernelOffset) {
                continue;
              }
              for (const operation of account.operations) {
                if (
                  operation.type !== "OUT" &&
                  (operation.extra as MimbleWimbleCoinOperationExtra).kernelOffset &&
                  (operation.extra as MimbleWimbleCoinOperationExtra).kernelOffset!.equals(
                    kernelOffset,
                  )
                ) {
                  uniqueKernelOffset = false;
                  await slate.createOffset();
                  break;
                }
              }
            }
          }
          let privateNonceIndex: number;
          if (transaction.sendAsFile) {
            privateNonceIndex = transaction.privateNonceIndex!;
          } else {
            privateNonceIndex = 0;
          }
          await mimbleWimbleCoin.startTransaction(
            account.freshAddressPath,
            change,
            inputAmount.minus(fee),
            fee,
            privateNonceIndex,
            slate.recipientPaymentProofAddress,
          );
          if (!change.isZero()) {
            await mimbleWimbleCoin.includeOutputInTransaction(
              change,
              currentIdentifier.withHeight(account.currency, slate.height!),
              Crypto.SwitchType.REGULAR,
            );
          }
          for (const operation of inputs) {
            await mimbleWimbleCoin.includeInputInTransaction(
              operation.value,
              (operation.extra as MimbleWimbleCoinOperationExtra).identifier!,
              (operation.extra as MimbleWimbleCoinOperationExtra).switchType!,
            );
          }
          if (transaction.sendAsFile) {
            await mimbleWimbleCoin.applyOffsetToTransaction(slate.offset);
          } else {
            privateNonceIndex = (await mimbleWimbleCoin.applyOffsetToTransaction(
              slate.offset,
            )) as number;
          }
          const publicBlindExcess = await mimbleWimbleCoin.getTransactionPublicKey();
          const publicNonce = await mimbleWimbleCoin.getTransactionPublicNonce();
          slate.addParticipant(
            new SlateParticipant(SlateParticipant.SENDER_ID, publicBlindExcess, publicNonce),
          );
          let serializedSlateResponse: { [key: string]: any } | Buffer;
          if (transaction.sendAsFile) {
            const response = transaction.transactionResponse!.trim();
            if ((await slate.serialize(Slate.Purpose.SEND_INITIAL, true)) instanceof Buffer) {
              try {
                let senderAddress: string | null;
                ({ serializedSlate: serializedSlateResponse, senderAddress } =
                  await Slatepack.decode(
                    account,
                    response,
                    mimbleWimbleCoin,
                    slate.hasPaymentProof(),
                  ));
                if (
                  slate.recipientPaymentProofAddress !== null &&
                  senderAddress !== null &&
                  slate.recipientPaymentProofAddress !== senderAddress
                ) {
                  throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
                    "Invalid serialized slate response from recipient",
                  );
                }
              } catch (error: any) {
                if (
                  !(error instanceof Error) ||
                  Object.getPrototypeOf(error).constructor.name === Error.constructor.name ||
                  error instanceof MimbleWimbleCoinInvalidParameters
                ) {
                  throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
                    "Invalid serialized slate response from recipient",
                  );
                }
                throw error;
              }
            } else {
              try {
                serializedSlateResponse = JSONBigNumber.parse(response);
              } catch (error: any) {
                throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
                  "Invalid serialized slate response from recipient",
                );
              }
            }
          } else {
            const serializedSlate = await slate.serialize(Slate.Purpose.SEND_INITIAL, false);
            if (serializedSlate instanceof Buffer) {
              const response = await WalletApi.getSerializedSlateResponse(
                account.currency,
                recipientAddress,
                await Slatepack.encode(
                  account,
                  serializedSlate,
                  mimbleWimbleCoin,
                  slate.recipientPaymentProofAddress,
                ),
              );
              try {
                let senderAddress: string | null;
                ({ serializedSlate: serializedSlateResponse, senderAddress } =
                  await Slatepack.decode(
                    account,
                    typeof response === "string"
                      ? response.trim()
                      : (response as unknown as string),
                    mimbleWimbleCoin,
                    slate.hasPaymentProof(),
                  ));
                if (
                  slate.recipientPaymentProofAddress !== null &&
                  senderAddress !== null &&
                  slate.recipientPaymentProofAddress !== senderAddress
                ) {
                  throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
                    "Invalid serialized slate response from recipient",
                  );
                }
              } catch (error: any) {
                if (
                  !(error instanceof Error) ||
                  Object.getPrototypeOf(error).constructor.name === Error.constructor.name ||
                  error instanceof MimbleWimbleCoinInvalidParameters
                ) {
                  throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
                    "Invalid serialized slate response from recipient",
                  );
                }
                throw error;
              }
            } else {
              serializedSlateResponse = (await WalletApi.getSerializedSlateResponse(
                account.currency,
                recipientAddress,
                serializedSlate,
              )) as { [key: string]: any };
            }
          }
          await mimbleWimbleCoin.startTransaction(
            account.freshAddressPath,
            change,
            inputAmount.minus(fee),
            fee,
            privateNonceIndex,
            slate.recipientPaymentProofAddress,
          );
          if (!change.isZero()) {
            await mimbleWimbleCoin.includeOutputInTransaction(
              change,
              currentIdentifier.withHeight(account.currency, slate.height!),
              Crypto.SwitchType.REGULAR,
            );
          }
          for (const operation of inputs) {
            await mimbleWimbleCoin.includeInputInTransaction(
              operation.value,
              (operation.extra as MimbleWimbleCoinOperationExtra).identifier!,
              (operation.extra as MimbleWimbleCoinOperationExtra).switchType!,
            );
          }
          await mimbleWimbleCoin.applyOffsetToTransaction(slate.offset);
          let slateResponse: Slate;
          try {
            slateResponse = await Slate.unserialize(
              serializedSlateResponse,
              slate.cryptocurrency,
              Slate.Purpose.SEND_RESPONSE,
              slate,
            );
          } catch (error: any) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Invalid serialized slate response from recipient",
            );
          }
          if (!slate.isEqualTo(slateResponse)) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Altered slate response from recipient",
            );
          }
          if (slateResponse.outputs.length <= slate.outputs.length) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Invalid slate response outputs",
            );
          }
          if (!slateResponse.numberOfParticipants.isEqualTo(slateResponse.participants.length)) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Invalid slate response participants",
            );
          }
          if (!slateResponse.getParticipant(SlateParticipant.SENDER_ID.plus(1))) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Invalid slate response participants",
            );
          }
          if (!slateResponse.getParticipant(SlateParticipant.SENDER_ID.plus(1))!.isComplete()) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Invalid slate response participants",
            );
          }
          if (slateResponse.hasPaymentProof() && !slateResponse.recipientPaymentProofSignature) {
            throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
              "Invalid slate response payment proof",
            );
          }
          if (slate.isCompact()) {
            if (!(await slateResponse.combineOffsets(slate.offset))) {
              throw new MimbleWimbleCoinFinalizingSlateFailed(
                "Failed combining slate response's offset with the slate's offset",
              );
            }
          }
          let publicNonceSum: Buffer;
          try {
            publicNonceSum = await slateResponse.getPublicNonceSum();
          } catch (error: any) {
            throw new MimbleWimbleCoinFinalizingSlateFailed(
              "Failed getting slate response's public nonce sum",
            );
          }
          let publicBlindExcessSum: Buffer;
          try {
            publicBlindExcessSum = await slateResponse.getPublicBlindExcessSum();
          } catch (error: any) {
            throw new MimbleWimbleCoinFinalizingSlateFailed(
              "Failed getting slate response's public blind excess sum",
            );
          }
          let excess: Buffer | null = null;
          if (slateResponse.hasPaymentProof()) {
            try {
              excess = await slateResponse.getExcess();
            } catch (error: any) {
              throw new MimbleWimbleCoinFinalizingSlateFailed(
                "Failed getting slate response's excess",
              );
            }
          }
          subscriber.next({
            type: "device-signature-requested",
          });
          const { partialSignature } = await mimbleWimbleCoin.getTransactionSignature(
            publicNonceSum,
            publicBlindExcessSum,
            slateResponse.getKernelFeatures(),
            slateResponse.lockHeight,
            slateResponse.relativeHeight,
            excess,
            slateResponse.recipientPaymentProofSignature,
          );
          subscriber.next({
            type: "device-signature-granted",
          });
          slateResponse.getParticipant(SlateParticipant.SENDER_ID)!.partialSignature =
            partialSignature;
          if (!(await slateResponse.verifyPartialSignatures())) {
            throw new MimbleWimbleCoinFinalizingSlateFailed(
              "Invalid partial signature(s) in slate response",
            );
          }
          const partialSignatures: Buffer[] = [];
          for (const participant of slateResponse.participants) {
            if (participant.isComplete()) {
              partialSignatures.push(participant.partialSignature!);
            } else {
              throw new MimbleWimbleCoinFinalizingSlateFailed(
                "Missing partial signature(s) in slate response",
              );
            }
          }
          const finalSignature = await Common.resolveIfPromise(
            Secp256k1Zkp.addSingleSignerSignatures(partialSignatures, publicNonceSum),
          );
          if (finalSignature === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinFinalizingSlateFailed("Failed creating final signature");
          }
          const message = SlateKernel.signatureMessage(
            slateResponse.getKernelFeatures(),
            slateResponse.fee,
            slateResponse.lockHeight,
            slateResponse.relativeHeight,
          );
          if (
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.verifySingleSignerSignature(
                finalSignature,
                message,
                Secp256k1Zkp.NO_PUBLIC_NONCE,
                publicBlindExcessSum,
                publicBlindExcessSum,
                false,
              ),
            ))
          ) {
            throw new MimbleWimbleCoinFinalizingSlateFailed("Invalid final signature");
          }
          if (!(await slateResponse.setFinalSignature(finalSignature, transaction.baseFee))) {
            throw new MimbleWimbleCoinFinalizingSlateFailed(
              "Failed setting slate response's final signature",
            );
          }
          const timestamp = new Date();
          const operation = await buildOptimisticOperation(
            account,
            transaction,
            slateResponse,
            timestamp,
          );
          const changeOperation = await buildChangeOperation(
            account,
            slateResponse,
            kernelOffset!,
            change,
            commitment,
            currentIdentifier.withHeight(account.currency, slateResponse.height!),
            Crypto.SwitchType.REGULAR,
            timestamp,
          );
          const bipPath = BIPPath.fromString(account.freshAddressPath).toPathArray();
          ++bipPath[Crypto.BIP44_PATH_INDEX_INDEX];
          const newDerivationPath = BIPPath.fromPathArray(bipPath).toString(true);
          const newAddress = await mimbleWimbleCoin.getAddress(newDerivationPath);
          subscriber.next({
            type: "signed",
            signedOperation: {
              operation,
              signature: JSON.stringify({
                changeOperation: changeOperation ? toOperationRaw(changeOperation) : null,
                inputsSpent: inputs.map((operation: Operation): string => {
                  return operation.id;
                }),
                freshAddress: {
                  address: newAddress,
                  derivationPath: newDerivationPath,
                },
                nextIdentifier: currentIdentifier.getNext().serialize().toString("hex"),
                broadcastData: JSONBigNumber.stringify(slateResponse.getTransaction()),
              }),
            },
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.error(error);
        }
      })();
    });
  });
