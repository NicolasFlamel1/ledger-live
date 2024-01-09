import Transport from "@ledgerhq/hw-transport";
import type { AccountRaw, Operation } from "@ledgerhq/types-live";
import { fromAccountRaw } from "../../account/serialization";
import type {
  MimbleWimbleCoinAccount,
  TransactionRaw,
  MimbleWimbleCoinOperationExtra,
} from "./types";
import { fromTransactionRaw } from "./transaction";
import BigNumber from "bignumber.js";
import JSONBigNumber from "json-bignumber";
import Slate from "./api/slate";
import Consensus from "./api/consensus";
import Node from "./api/node";
import {
  MimbleWimbleCoinInvalidParameters,
  MimbleWimbleCoinUnsupportedResponseFromNode,
  MimbleWimbleCoinCreatingSlateFailed,
} from "./errors";
import MimbleWimbleCoin from "./hw-app-mimblewimble-coin";
import SlateInput from "./api/slateInput";
import SlateOutput from "./api/slateOutput";
import SlateParticipant from "./api/slateParticipant";
import Crypto from "./api/crypto";
import Identifier from "./api/identifier";
import Tor from "./api/tor";
import Slatepack from "./api/slatepack";

export default async (
  accountRaw: AccountRaw,
  transport: Transport,
  transactionRaw: TransactionRaw,
): Promise<{
  transactionData: string;
  height: string;
  id: string;
  offset: string;
  proof: string | undefined;
  privateNonceIndex: number;
}> => {
  const account = fromAccountRaw(accountRaw);
  const transaction = fromTransactionRaw(transactionRaw);
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
            Slate.getRequiredFee(account.currency, inputs.length, 2, 1, transaction.baseFee),
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
  switch (account.currency.id) {
    case "mimblewimble_coin":
    case "mimblewimble_coin_floonet":
    case "epic_cash":
    case "epic_cash_floonet":
      try {
        Tor.torAddressToPublicKey(recipient);
        usePaymentProof = true;
      } catch (error: any) {
        usePaymentProof = false;
      }
      break;
    case "grin":
    case "grin_testnet":
      try {
        Slatepack.slatepackAddressToPublicKey(recipient, account.currency);
        usePaymentProof = true;
      } catch (error: any) {
        usePaymentProof = false;
      }
      break;
    default:
      usePaymentProof = false;
      break;
  }
  const slate = new Slate(
    account.currency,
    transaction.amount,
    fee,
    tipHeight.plus(1),
    new BigNumber(0),
    null,
    usePaymentProof ? account.freshAddresses[0].address : null,
    usePaymentProof ? recipient : null,
    null,
  );
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
  let currentIdentifier: Identifier = (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
    .nextIdentifier;
  if (!change.isZero()) {
    commitment = await mimbleWimbleCoin.getCommitment(
      account.freshAddresses[0].derivationPath,
      currentIdentifier.withHeight(account.currency, slate.height!),
      change,
      Crypto.SwitchType.REGULAR,
    );
    for (let uniqueCommitment = false; !uniqueCommitment; ) {
      uniqueCommitment = true;
      for (const pendingOperation of account.pendingOperations) {
        if (
          pendingOperation.type !== "OUT" &&
          (pendingOperation.extra as MimbleWimbleCoinOperationExtra).outputCommitment!.equals(
            commitment,
          )
        ) {
          uniqueCommitment = false;
          currentIdentifier = currentIdentifier.getNext();
          commitment = await mimbleWimbleCoin.getCommitment(
            account.freshAddresses[0].derivationPath,
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
          (operation.extra as MimbleWimbleCoinOperationExtra).outputCommitment!.equals(commitment)
        ) {
          uniqueCommitment = false;
          currentIdentifier = currentIdentifier.getNext();
          commitment = await mimbleWimbleCoin.getCommitment(
            account.freshAddresses[0].derivationPath,
            currentIdentifier.withHeight(account.currency, slate.height!),
            change,
            Crypto.SwitchType.REGULAR,
          );
          break;
        }
      }
    }
    const proof = await mimbleWimbleCoin.getProof(
      (account as MimbleWimbleCoinAccount).mimbleWimbleCoinResources.rootPublicKey,
      account.freshAddresses[0].derivationPath,
      currentIdentifier.withHeight(account.currency, slate.height!),
      change,
      Crypto.SwitchType.REGULAR,
      MimbleWimbleCoin.MessageType.SENDING_TRANSACTION,
    );
    if (!slate.addOutputs([new SlateOutput(SlateOutput.Features.PLAIN, commitment, proof)])) {
      throw new MimbleWimbleCoinCreatingSlateFailed("Failed adding output to slate");
    }
  }
  await slate.createOffset();
  for (let uniqueKernelOffset = false; !uniqueKernelOffset; ) {
    uniqueKernelOffset = true;
    let kernelOffset: Buffer;
    try {
      kernelOffset = await slate.getOffsetExcess();
    } catch (error: any) {
      throw new MimbleWimbleCoinCreatingSlateFailed("Failed getting slate's kernel offset");
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
        (operation.extra as MimbleWimbleCoinOperationExtra).kernelOffset!.equals(kernelOffset)
      ) {
        uniqueKernelOffset = false;
        await slate.createOffset();
        break;
      }
    }
  }
  await mimbleWimbleCoin.startTransaction(
    account.freshAddresses[0].derivationPath,
    change,
    inputAmount.minus(fee),
    fee,
    0,
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
  const privateNonceIndex = (await mimbleWimbleCoin.applyOffsetToTransaction(
    slate.offset,
  )) as number;
  const publicBlindExcess = await mimbleWimbleCoin.getTransactionPublicKey();
  const publicNonce = await mimbleWimbleCoin.getTransactionPublicNonce();
  slate.addParticipant(
    new SlateParticipant(SlateParticipant.SENDER_ID, publicBlindExcess, publicNonce),
  );
  const serializedSlate = await slate.serialize(Slate.Purpose.SEND_INITIAL, true);
  return {
    transactionData:
      serializedSlate instanceof Buffer
        ? await Slatepack.encode(
            account,
            serializedSlate,
            mimbleWimbleCoin,
            slate.recipientPaymentProofAddress,
          )
        : JSONBigNumber.stringify(serializedSlate),
    height: slate.height!.toFixed(),
    id: slate.id,
    offset: slate.offset.toString("hex"),
    proof: slate.outputs.length ? slate.outputs[0].proof.toString("hex") : undefined,
    privateNonceIndex,
  };
};
