import BigNumber from "bignumber.js";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { v4 as uuidv4 } from "uuid";
import SlateInput from "./slateInput";
import SlateOutput from "./slateOutput";
import SlateKernel from "./slateKernel";
import SlateParticipant from "./slateParticipant";
import Crypto from "./crypto";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import Consensus from "./consensus";
import Common from "./common";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Tor from "./tor";
import Mqs from "./mqs";
import Slatepack from "./slatepack";
import BitReader from "./bitReader";
import BitWriter from "./bitWriter";
import SlateUtils from "./slateUtils";
import Ed25519 from "@nicolasflamel/ed25519";
import Uint64Array from "./uint64Array";

export default class Slate {
  public cryptocurrency: CryptoCurrency;
  public amount: BigNumber;
  public fee: BigNumber;
  public height: BigNumber | null;
  public id: string;
  public version: BigNumber | string;
  public originalVersion: BigNumber | string;
  public headerVersion: number;
  public numberOfParticipants: BigNumber;
  public lockHeight: BigNumber;
  public relativeHeight: BigNumber | null;
  public timeToLiveCutOffHeight: BigNumber | null;
  public senderPaymentProofAddress: string | null;
  public recipientPaymentProofAddress: string | null;
  public recipientPaymentProofSignature: Buffer | null;
  public offset: Buffer;
  public inputs: SlateInput[];
  public outputs: SlateOutput[];
  public kernels: SlateKernel[];
  public participants: SlateParticipant[];

  public static readonly Purpose = {
    SEND_INITIAL: 0,
    SEND_RESPONSE: 1,
  };

  public constructor(
    cryptocurrency: CryptoCurrency,
    amount: BigNumber,
    fee: BigNumber,
    height: BigNumber,
    lockHeight: BigNumber,
    relativeHeight: BigNumber | null,
    senderPaymentProofAddress: string | null,
    recipientPaymentProofAddress: string | null,
    recipientSupportedVersions: string[] | null,
  ) {
    this.cryptocurrency = cryptocurrency;
    this.amount = amount;
    this.fee = fee;
    this.height = height;
    this.headerVersion = Consensus.getHeaderVersion(this.cryptocurrency, this.height);
    this.numberOfParticipants = new BigNumber(2);
    this.lockHeight = lockHeight;
    this.relativeHeight = relativeHeight;
    this.timeToLiveCutOffHeight = null;
    this.senderPaymentProofAddress = senderPaymentProofAddress;
    this.recipientPaymentProofAddress = recipientPaymentProofAddress;
    this.recipientPaymentProofSignature = null;
    this.id = uuidv4();
    this.offset = Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH);
    this.inputs = [];
    this.outputs = [];
    this.kernels = [
      new SlateKernel(this.getKernelFeatures(), this.fee, this.lockHeight, this.relativeHeight),
    ];
    this.participants = [];
    this.version = this.getMinimimCompatibleVersion(recipientSupportedVersions);
    this.originalVersion = this.version;
  }

  public async serialize(
    purpose: number,
    preferBinary: boolean,
  ): Promise<{ [key: string]: any } | Buffer> {
    switch (
      Common.isBigNumber(this.version) ? (this.version as BigNumber).toFixed() : this.version
    ) {
      case "2":
      case "3": {
        let serializedSlate: { [key: string]: any } = {
          amount: this.amount.toFixed(),
          fee: this.fee.toFixed(),
          height: this.height!.toFixed(),
          id: this.id,
          lock_height: this.lockHeight.toFixed(),
          num_participants: this.numberOfParticipants,
          participant_data: await Promise.all(
            this.participants.map(
              async (
                participant: SlateParticipant,
              ): Promise<{ [key: string]: any } | undefined> => {
                return await participant.serialize(this);
              },
            ),
          ),
          tx: {
            body: {
              inputs: this.inputs.map((input: SlateInput): { [key: string]: any } => {
                return input.serialize(this) as { [key: string]: any };
              }),
              kernels: this.kernels.map(
                (kernel: SlateKernel): { [key: string]: any } | undefined => {
                  return kernel.serialize(this);
                },
              ),
              outputs: this.outputs.map(
                (output: SlateOutput): { [key: string]: any } | undefined => {
                  return output.serialize(this);
                },
              ),
            },
            offset: this.offset.toString("hex"),
          },
          version_info: {
            block_header_version: this.headerVersion,
            orig_version: this.originalVersion as BigNumber,
            version: this.version as BigNumber,
          },
        };
        if ((this.version as BigNumber).isGreaterThanOrEqualTo(3)) {
          serializedSlate = {
            ...serializedSlate,
            ttl_cutoff_height: this.timeToLiveCutOffHeight
              ? this.timeToLiveCutOffHeight.toFixed()
              : null,
          };
          switch (this.cryptocurrency.id) {
            case "mimblewimble_coin":
            case "mimblewimble_coin_floonet":
              serializedSlate = {
                ...serializedSlate,
                payment_proof: this.hasPaymentProof()
                  ? {
                      receiver_address: this.recipientPaymentProofAddress,
                      receiver_signature: this.recipientPaymentProofSignature
                        ? this.recipientPaymentProofSignature.toString("hex")
                        : null,
                      sender_address: this.senderPaymentProofAddress,
                    }
                  : null,
                coin_type: Slate.getCoinType(this.cryptocurrency),
                network_type: Slate.getNetworkType(this.cryptocurrency),
              };
              break;
            case "epic_cash":
            case "epic_cash_floonet":
              serializedSlate = {
                ...serializedSlate,
                payment_proof: this.hasPaymentProof()
                  ? {
                      receiver_address: Tor.torAddressToPublicKey(
                        this.recipientPaymentProofAddress as string,
                      ).toString("hex"),
                      receiver_signature: this.recipientPaymentProofSignature
                        ? this.recipientPaymentProofSignature.toString("hex")
                        : null,
                      sender_address: Tor.torAddressToPublicKey(
                        this.senderPaymentProofAddress as string,
                      ).toString("hex"),
                    }
                  : null,
              };
              break;
            default:
              throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
          }
        }
        return serializedSlate;
      }
      case "SP": {
        const bitWriter = new BitWriter();
        SlateUtils.compressPurpose(bitWriter, purpose);
        SlateUtils.compressId(bitWriter, this.id);
        switch (this.cryptocurrency.id) {
          case "mimblewimble_coin":
            SlateUtils.compressBoolean(bitWriter, true);
            break;
          case "mimblewimble_coin_floonet":
            SlateUtils.compressBoolean(bitWriter, false);
            break;
          default:
            throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
        }
        if (purpose === Slate.Purpose.SEND_INITIAL) {
          SlateUtils.compressUint64(bitWriter, this.amount, true);
          SlateUtils.compressUint64(bitWriter, this.fee, true);
        }
        SlateUtils.compressUint64(bitWriter, this.height!, false);
        SlateUtils.compressUint64(bitWriter, this.lockHeight, false);
        if (this.timeToLiveCutOffHeight) {
          SlateUtils.compressBoolean(bitWriter, true);
          SlateUtils.compressUint64(bitWriter, this.timeToLiveCutOffHeight, false);
        } else {
          SlateUtils.compressBoolean(bitWriter, false);
        }
        if (purpose === Slate.Purpose.SEND_INITIAL) {
          await this.getParticipant(SlateParticipant.SENDER_ID)!.serialize(this, bitWriter);
          if (this.hasPaymentProof()) {
            SlateUtils.compressBoolean(bitWriter, true);
            await SlateUtils.compressPaymentProofAddress(
              bitWriter,
              this.senderPaymentProofAddress as string,
              this.cryptocurrency,
            );
            await SlateUtils.compressPaymentProofAddress(
              bitWriter,
              this.recipientPaymentProofAddress as string,
              this.cryptocurrency,
            );
          } else {
            SlateUtils.compressBoolean(bitWriter, false);
          }
        } else if (purpose === Slate.Purpose.SEND_RESPONSE) {
          SlateUtils.compressOffset(bitWriter, this.offset);
          for (let i = 0; i < this.outputs.length; ++i) {
            this.outputs[i].serialize(this, bitWriter);
            if (i !== this.outputs.length - 1) {
              SlateUtils.compressBoolean(bitWriter, true);
            } else {
              SlateUtils.compressBoolean(bitWriter, false);
            }
          }
          for (let i = 0; i < this.kernels.length; ++i) {
            this.kernels[i].serialize(this, bitWriter);
            if (i !== this.kernels.length - 1) {
              SlateUtils.compressBoolean(bitWriter, true);
            } else {
              SlateUtils.compressBoolean(bitWriter, false);
            }
          }
          await this.getParticipant(SlateParticipant.SENDER_ID.plus(1))!.serialize(this, bitWriter);
          if (this.hasPaymentProof()) {
            SlateUtils.compressBoolean(bitWriter, true);
            await SlateUtils.compressPaymentProofAddress(
              bitWriter,
              this.senderPaymentProofAddress as string,
              this.cryptocurrency,
            );
            await SlateUtils.compressPaymentProofAddress(
              bitWriter,
              this.recipientPaymentProofAddress as string,
              this.cryptocurrency,
            );
            if (this.recipientPaymentProofSignature) {
              SlateUtils.compressBoolean(bitWriter, true);
              SlateUtils.compressPaymentProofSignature(
                bitWriter,
                this.recipientPaymentProofSignature as Buffer,
              );
            } else {
              SlateUtils.compressBoolean(bitWriter, false);
            }
          } else {
            SlateUtils.compressBoolean(bitWriter, false);
            SlateUtils.compressBoolean(bitWriter, false);
          }
        }
        return bitWriter.getBytes();
      }
      case "4":
        if (preferBinary) {
          const bitWriter = new BitWriter();
          SlateUtils.writeUint16(bitWriter, (this.version as BigNumber).toNumber());
          SlateUtils.writeUint16(bitWriter, this.headerVersion);
          SlateUtils.compressId(bitWriter, this.id);
          SlateUtils.writeUint8(bitWriter, purpose + 1);
          SlateUtils.compressOffset(
            bitWriter,
            purpose === Slate.Purpose.SEND_INITIAL
              ? Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH)
              : this.offset,
          );
          let optionalFields = 0;
          if (!this.numberOfParticipants.isEqualTo(2)) {
            optionalFields |= 0b00000001;
          }
          if (purpose === Slate.Purpose.SEND_INITIAL) {
            if (!this.amount.isZero()) {
              optionalFields |= 0b00000010;
            }
            if (!this.fee.isZero()) {
              optionalFields |= 0b00000100;
            }
          }
          if (this.getKernelFeatures() !== SlateKernel.Features.PLAIN) {
            optionalFields |= 0b00001000;
          }
          if (this.timeToLiveCutOffHeight) {
            optionalFields |= 0b00010000;
          }
          SlateUtils.writeUint8(bitWriter, optionalFields);
          if (optionalFields & 0b00000001) {
            SlateUtils.writeUint8(bitWriter, this.numberOfParticipants.toNumber());
          }
          if (optionalFields & 0b00000010) {
            SlateUtils.writeUint64(bitWriter, this.amount);
          }
          if (optionalFields & 0b00000100) {
            SlateUtils.writeUint64(bitWriter, this.fee);
          }
          if (optionalFields & 0b00001000) {
            SlateUtils.writeUint8(bitWriter, this.getKernelFeatures());
          }
          if (optionalFields & 0b00010000) {
            SlateUtils.writeUint64(bitWriter, this.timeToLiveCutOffHeight as BigNumber);
          }
          SlateUtils.writeUint8(bitWriter, 1);
          if (purpose === Slate.Purpose.SEND_INITIAL) {
            await this.getParticipant(SlateParticipant.SENDER_ID)!.serialize(this, bitWriter);
          } else {
            await this.getParticipant(SlateParticipant.SENDER_ID.plus(1))!.serialize(
              this,
              bitWriter,
            );
          }
          let componentFields = 0;
          if (purpose === Slate.Purpose.SEND_RESPONSE) {
            if (this.inputs.length + this.outputs.length) {
              componentFields |= 0b00000001;
            }
          }
          if (this.hasPaymentProof()) {
            componentFields |= 0b00000010;
          }
          SlateUtils.writeUint8(bitWriter, componentFields);
          if (componentFields & 0b00000001) {
            SlateUtils.writeUint16(bitWriter, this.inputs.length + this.outputs.length);
            for (const input of this.inputs) {
              SlateUtils.writeUint8(bitWriter, 0);
              input.serialize(this, bitWriter);
            }
            for (const output of this.outputs) {
              SlateUtils.writeUint8(bitWriter, 1);
              output.serialize(this, bitWriter);
            }
          }
          if (componentFields & 0b00000010) {
            bitWriter.setBytes(
              Slatepack.slatepackAddressToPublicKey(
                this.senderPaymentProofAddress as string,
                this.cryptocurrency,
              ),
            );
            bitWriter.setBytes(
              Slatepack.slatepackAddressToPublicKey(
                this.recipientPaymentProofAddress as string,
                this.cryptocurrency,
              ),
            );
            if (this.recipientPaymentProofSignature) {
              SlateUtils.writeUint8(bitWriter, 1);
              bitWriter.setBytes(this.recipientPaymentProofSignature);
            } else {
              SlateUtils.writeUint8(bitWriter, 0);
            }
          }
          switch (this.getKernelFeatures()) {
            case SlateKernel.Features.PLAIN:
              break;
            case SlateKernel.Features.HEIGHT_LOCKED:
              SlateUtils.writeUint64(bitWriter, this.lockHeight);
              break;
            default:
              throw new MimbleWimbleCoinInvalidParameters("Invalid slate features");
          }
          return bitWriter.getBytes();
        } else {
          let serializedSlate: { [key: string]: any } = {
            id: this.id,
            sta: Slate.getPurposeAsText(purpose),
            ver: `${(this.version as BigNumber).toFixed()}:${this.headerVersion.toFixed()}`,
          };
          if (!this.numberOfParticipants.isEqualTo(2)) {
            serializedSlate = {
              ...serializedSlate,
              num_parts: this.numberOfParticipants,
            };
          }
          if (this.timeToLiveCutOffHeight) {
            serializedSlate = {
              ...serializedSlate,
              ttl: this.timeToLiveCutOffHeight.toFixed(),
            };
          }
          switch (this.getKernelFeatures()) {
            case SlateKernel.Features.PLAIN:
              break;
            case SlateKernel.Features.HEIGHT_LOCKED:
              serializedSlate = {
                ...serializedSlate,
                feat: this.getKernelFeatures(),
                feat_args: {
                  lock_hgt: this.lockHeight.toFixed(),
                },
              };
              break;
            default:
              throw new MimbleWimbleCoinInvalidParameters("Invalid slate features");
          }
          if (this.hasPaymentProof()) {
            serializedSlate = {
              ...serializedSlate,
              proof: {
                raddr: Slatepack.slatepackAddressToPublicKey(
                  this.recipientPaymentProofAddress as string,
                  this.cryptocurrency,
                ).toString("hex"),
                saddr: Slatepack.slatepackAddressToPublicKey(
                  this.senderPaymentProofAddress as string,
                  this.cryptocurrency,
                ).toString("hex"),
              },
            };
            if (this.recipientPaymentProofSignature) {
              serializedSlate = {
                ...serializedSlate,
                proof: {
                  ...serializedSlate.proof,
                  rsig: this.recipientPaymentProofSignature.toString("hex"),
                },
              };
            }
          }
          if (purpose === Slate.Purpose.SEND_INITIAL) {
            serializedSlate = {
              ...serializedSlate,
              amt: this.amount.toFixed(),
              fee: this.fee.toFixed(),
              sigs: [await this.getParticipant(SlateParticipant.SENDER_ID)!.serialize(this)],
            };
          } else if (purpose === Slate.Purpose.SEND_RESPONSE) {
            const inputsAndOutputs: { [key: string]: any }[] = [];
            for (const input of this.inputs) {
              inputsAndOutputs.push(input.serialize(this) as { [key: string]: any });
            }
            for (const output of this.outputs) {
              inputsAndOutputs.push(output.serialize(this) as { [key: string]: any });
            }
            serializedSlate = {
              ...serializedSlate,
              off: this.offset.toString("hex"),
              sigs: [
                await this.getParticipant(SlateParticipant.SENDER_ID.plus(1))!.serialize(this),
              ],
              coms: inputsAndOutputs,
            };
          }
          return serializedSlate;
        }
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
  }

  public getTransaction(): {
    body: {
      inputs: { [key: string]: any }[];
      kernels: { [key: string]: any }[];
      outputs: { [key: string]: any }[];
    };
    offset: string;
  } {
    return {
      body: {
        inputs: this.inputs.map((input: SlateInput): { [key: string]: any } => {
          return input.getTransaction();
        }),
        kernels: this.kernels.map((kernel: SlateKernel): { [key: string]: any } => {
          return kernel.getTransaction();
        }),
        outputs: this.outputs.map((output: SlateOutput): { [key: string]: any } => {
          return output.getTransaction();
        }),
      },
      offset: this.offset.toString("hex"),
    };
  }

  public changeId() {
    this.id = uuidv4();
  }

  public async setRecipientPaymentProofSignature(signature: Buffer): Promise<boolean> {
    this.recipientPaymentProofSignature = signature;
    return await this.verifyRecipientPaymentProofSignature();
  }

  public getParticipant(participantId: BigNumber): SlateParticipant | null {
    for (const participant of this.participants) {
      if (participant.id.isEqualTo(participantId)) {
        return participant;
      }
    }
    return null;
  }

  public addOutputs(outputs: SlateOutput[], updateKernel = true): boolean {
    if (updateKernel) {
      this.updateKernel();
    }
    for (const output of outputs) {
      this.outputs.push(output);
    }
    if (!this.sort()) {
      return false;
    }
    if (!this.verifyWeight()) {
      return false;
    }
    if (!this.verifySortedAndUnique()) {
      return false;
    }
    if (!this.verifyNoCutThrough()) {
      return false;
    }
    return true;
  }

  public addInputs(
    inputs: SlateInput[],
    expectedNumberOfOutputs: number,
    updateKernel = true,
  ): boolean {
    if (updateKernel) {
      this.updateKernel();
    }
    for (const input of inputs) {
      this.inputs.push(input);
    }
    if (!this.sort()) {
      return false;
    }
    if (!this.verifyWeight(expectedNumberOfOutputs)) {
      return false;
    }
    if (!this.verifySortedAndUnique()) {
      return false;
    }
    if (!this.verifyNoCutThrough()) {
      return false;
    }
    return true;
  }

  public async createOffset() {
    do {
      this.offset = await Crypto.randomBytes(Crypto.SECP256K1_PRIVATE_KEY_LENGTH);
    } while (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidSecretKey(this.offset))));
  }

  public async combineOffsets(offset: Buffer): Promise<boolean> {
    const combinedOffset = await Common.resolveIfPromise(
      Secp256k1Zkp.blindSum([this.offset, offset], []),
    );
    if (combinedOffset === Secp256k1Zkp.OPERATION_FAILED) {
      return false;
    }
    if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidSecretKey(combinedOffset)))) {
      return false;
    }
    this.offset = combinedOffset;
    return true;
  }

  public addParticipant(participant: SlateParticipant) {
    this.participants.push(participant);
  }

  public async getPublicBlindExcessSum(): Promise<Buffer> {
    const publicBlindExcessSum = await Common.resolveIfPromise(
      Secp256k1Zkp.combinePublicKeys(
        this.participants.map((participant: SlateParticipant): Buffer => {
          return participant.publicBlindExcess;
        }),
      ),
    );
    if (publicBlindExcessSum === Secp256k1Zkp.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid slate participants");
    }
    return publicBlindExcessSum;
  }

  public async getPublicNonceSum(): Promise<Buffer> {
    const publicNonceSum = await Common.resolveIfPromise(
      Secp256k1Zkp.combinePublicKeys(
        this.participants.map((participant: SlateParticipant): Buffer => {
          return participant.publicNonce;
        }),
      ),
    );
    if (publicNonceSum === Secp256k1Zkp.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid slate participants");
    }
    return publicNonceSum;
  }

  public async getOffsetExcess(): Promise<Buffer> {
    const offsetExcess = await Common.resolveIfPromise(
      Secp256k1Zkp.pedersenCommit(this.offset, "0"),
    );
    if (offsetExcess === Secp256k1Zkp.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid slate offset");
    }
    return offsetExcess;
  }

  public async getExcess(): Promise<Buffer> {
    if (this.isCompact()) {
      const publicBlindExcessSum = await this.getPublicBlindExcessSum();
      const excess = await Common.resolveIfPromise(
        Secp256k1Zkp.publicKeyToPedersenCommit(publicBlindExcessSum),
      );
      if (excess === Secp256k1Zkp.OPERATION_FAILED) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate public blind excess sum");
      }
      return excess;
    } else {
      const offsetExcess = await this.getOffsetExcess();
      const transactionExcess = await this.getCommitmentsSum();
      const excess = await Common.resolveIfPromise(
        Secp256k1Zkp.pedersenCommitSum([transactionExcess], [offsetExcess]),
      );
      if (excess === Secp256k1Zkp.OPERATION_FAILED) {
        throw new MimbleWimbleCoinInvalidParameters(
          "Invalid slate transaction excess and/or slate offset excess",
        );
      }
      return excess;
    }
  }

  public isEqualTo(slate: Slate): boolean {
    if (this.id !== slate.id) {
      return false;
    }
    if (!this.amount.isEqualTo(slate.amount)) {
      return false;
    }
    if (!this.fee.isEqualTo(slate.fee)) {
      return false;
    }
    if (!this.lockHeight.isEqualTo(slate.lockHeight)) {
      return false;
    }
    if (
      (!this.relativeHeight && slate.relativeHeight) ||
      (this.relativeHeight && !slate.relativeHeight) ||
      (this.relativeHeight && !this.relativeHeight.isEqualTo(slate.relativeHeight!))
    ) {
      return false;
    }
    if (
      (!this.height && slate.height) ||
      (this.height && !slate.height) ||
      (this.height && !this.height.isEqualTo(slate.height!))
    ) {
      return false;
    }
    if (
      (!this.timeToLiveCutOffHeight && slate.timeToLiveCutOffHeight) ||
      (this.timeToLiveCutOffHeight && !slate.timeToLiveCutOffHeight) ||
      (this.timeToLiveCutOffHeight &&
        !this.timeToLiveCutOffHeight.isEqualTo(slate.timeToLiveCutOffHeight!))
    ) {
      return false;
    }
    if (!this.numberOfParticipants.isEqualTo(slate.numberOfParticipants)) {
      return false;
    }
    if (!this.isCompact()) {
      if (!this.offset.equals(slate.offset)) {
        return false;
      }
    } else {
      if (this.offset.equals(slate.offset)) {
        return false;
      }
    }
    if (this.headerVersion !== slate.headerVersion) {
      return false;
    }
    if (
      (Common.isBigNumber(this.originalVersion) &&
        (!Common.isBigNumber(slate.originalVersion) ||
          !(this.originalVersion as BigNumber).isEqualTo(slate.originalVersion))) ||
      (typeof this.originalVersion === "string" &&
        (typeof slate.originalVersion !== "string" ||
          this.originalVersion !== slate.originalVersion))
    ) {
      if (
        !Common.isBigNumber(this.originalVersion) ||
        !Common.isBigNumber(slate.originalVersion) ||
        !(this.originalVersion as BigNumber).isEqualTo(2) ||
        !(slate.originalVersion as BigNumber).isEqualTo(3)
      ) {
        return false;
      }
    }
    if (
      (Common.isBigNumber(this.version) &&
        (!Common.isBigNumber(slate.version) ||
          (this.version as BigNumber).isLessThan(slate.version))) ||
      (typeof this.version === "string" &&
        (typeof slate.version !== "string" || this.version !== slate.version))
    ) {
      return false;
    }
    if (this.recipientPaymentProofAddress !== slate.recipientPaymentProofAddress) {
      return false;
    }
    if (this.senderPaymentProofAddress !== slate.senderPaymentProofAddress) {
      return false;
    }
    if (this.inputs.length !== slate.inputs.length) {
      return false;
    }
    for (let i = 0; i < this.inputs.length; ++i) {
      if (!this.inputs[i].isEqualTo(slate.inputs[i])) {
        return false;
      }
    }
    if (this.kernels.length !== slate.kernels.length) {
      return false;
    }
    for (let i = 0; i < this.kernels.length; ++i) {
      if (!this.kernels[i].isEqualTo(slate.kernels[i])) {
        return false;
      }
    }
    for (const output of this.outputs) {
      let outputFound = false;
      for (const otherOutput of slate.outputs) {
        if (output.isEqualTo(otherOutput)) {
          outputFound = true;
          break;
        }
      }
      if (!outputFound) {
        return false;
      }
    }
    for (const participant of this.participants) {
      let participantFound = false;
      for (const otherParticipant of slate.participants) {
        if (participant.isEqualTo(otherParticipant)) {
          participantFound = true;
          break;
        }
      }
      if (!participantFound) {
        return false;
      }
    }
    return true;
  }

  public isCompact(): boolean {
    switch (this.cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        return this.version === "SP";
      case "grin":
      case "grin_testnet":
        return (this.version as BigNumber).isGreaterThanOrEqualTo(4);
      case "epic_cash":
      case "epic_cash_floonet":
        return false;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public getKernelFeatures(): number {
    if (!this.lockHeight.isEqualTo(0)) {
      return SlateKernel.Features.HEIGHT_LOCKED;
    }
    if (this.relativeHeight) {
      return SlateKernel.Features.NO_RECENT_DUPLICATE;
    }
    return SlateKernel.Features.PLAIN;
  }

  public async verifyPartialSignatures(): Promise<boolean> {
    let message: Buffer;
    try {
      message = SlateKernel.signatureMessage(
        this.getKernelFeatures(),
        this.fee,
        this.lockHeight,
        this.relativeHeight,
      );
    } catch (error: any) {
      return false;
    }
    let publicNonceSum: Buffer;
    try {
      publicNonceSum = await this.getPublicNonceSum();
    } catch (error: any) {
      return false;
    }
    let publicBlindExcessSum: Buffer;
    try {
      publicBlindExcessSum = await this.getPublicBlindExcessSum();
    } catch (error: any) {
      return false;
    }
    for (const participant of this.participants) {
      if (participant.isComplete()) {
        if (
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.verifySingleSignerSignature(
              participant.partialSignature,
              message,
              publicNonceSum,
              participant.publicBlindExcess,
              publicBlindExcessSum,
              true,
            ),
          ))
        ) {
          return false;
        }
      }
    }
    return true;
  }

  public async setFinalSignature(finalSignature: Buffer, baseFee: BigNumber): Promise<boolean> {
    if (this.kernels.length !== 1) {
      return false;
    }
    if (this.kernels[0].isComplete()) {
      return false;
    }
    try {
      this.kernels[0].excess = await this.getExcess();
    } catch (error: any) {
      return false;
    }
    if (!(await this.kernels[0].setSignature(finalSignature))) {
      return false;
    }
    if (!this.sort()) {
      return false;
    }
    if (!this.verifyWeight()) {
      return false;
    }
    if (!this.verifySortedAndUnique()) {
      return false;
    }
    if (!this.verifyNoCutThrough()) {
      return false;
    }
    if (!this.verifyFees(baseFee)) {
      return false;
    }
    if (!this.kernels[0].isComplete()) {
      return false;
    }
    if (!(await this.verifyKernelSums())) {
      return false;
    }
    if (this.hasPaymentProof() && !this.recipientPaymentProofSignature) {
      return false;
    }
    if (!(await this.verifyRecipientPaymentProofSignature())) {
      return false;
    }
    if (!this.verifyNoRecentDuplicateKernels()) {
      return false;
    }
    return true;
  }

  public hasPaymentProof(): boolean {
    return this.recipientPaymentProofAddress !== null && this.senderPaymentProofAddress !== null;
  }

  public static getRequiredFee(
    cryptocurrency: CryptoCurrency,
    numberOfInputs: number,
    numberOfOutputs: number,
    numberOfKernels: number,
    baseFee: BigNumber,
  ): BigNumber {
    let bodyWeight: BigNumber;
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "epic_cash":
      case "epic_cash_floonet":
        bodyWeight = BigNumber.maximum(
          new BigNumber(numberOfOutputs)
            .multipliedBy(Consensus.getBodyWeightOutputFactor(cryptocurrency))
            .plus(Math.max(numberOfKernels, 1))
            .minus(numberOfInputs),
          1,
        );
        break;
      case "grin":
      case "grin_testnet":
        bodyWeight = Slate.getWeight(
          cryptocurrency,
          numberOfInputs,
          numberOfOutputs,
          numberOfKernels,
        );
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
    return bodyWeight.multipliedBy(BigNumber.maximum(baseFee, 1));
  }

  public static async unserialize(
    serializedSlate: { [key: string]: any } | Buffer,
    cryptocurrency: CryptoCurrency,
    purpose: number,
    initialSendSlate: Slate | null = null,
  ): Promise<Slate> {
    const detectedVersion = Slate.detectVersion(serializedSlate, cryptocurrency);
    if (
      detectedVersion === null ||
      Slate.getSupportedVersions(cryptocurrency).indexOf(detectedVersion) === -1
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
    const slate = Object.create(Slate.prototype);
    slate.cryptocurrency = cryptocurrency;
    switch (detectedVersion) {
      case "2":
      case "3":
        slate.relativeHeight = null;
        if (!Common.isPureObject(serializedSlate)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
        }
        if (
          !("version_info" in serializedSlate) ||
          !Common.isPureObject(serializedSlate.version_info)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate version info");
        }
        if (
          !("version" in serializedSlate.version_info) ||
          !Common.isBigNumber(serializedSlate.version_info.version) ||
          !serializedSlate.version_info.version.isInteger() ||
          serializedSlate.version_info.version.isLessThan(1)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate version");
        }
        slate.version = serializedSlate.version_info.version;
        if (
          !("num_participants" in serializedSlate) ||
          !Common.isBigNumber(serializedSlate.num_participants) ||
          !serializedSlate.num_participants.isInteger() ||
          serializedSlate.num_participants.isLessThan(2)
        ) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate number of participants",
          );
        }
        slate.numberOfParticipants = serializedSlate.num_participants;
        if (
          !("amount" in serializedSlate) ||
          !Common.isNumberString(serializedSlate.amount) ||
          !new BigNumber(serializedSlate.amount).isInteger() ||
          new BigNumber(serializedSlate.amount).isLessThan(1)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate amount");
        }
        slate.amount = new BigNumber(serializedSlate.amount);
        if (
          !("fee" in serializedSlate) ||
          !Common.isNumberString(serializedSlate.fee) ||
          !new BigNumber(serializedSlate.fee).isInteger() ||
          new BigNumber(serializedSlate.fee).isLessThan(1)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate fee");
        }
        slate.fee = new BigNumber(serializedSlate.fee);
        if (
          !("height" in serializedSlate) ||
          !Common.isNumberString(serializedSlate.height) ||
          !new BigNumber(serializedSlate.height).isInteger() ||
          new BigNumber(serializedSlate.height).isNegative()
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate height");
        }
        slate.height = new BigNumber(serializedSlate.height);
        if (
          !("lock_height" in serializedSlate) ||
          !Common.isNumberString(serializedSlate.lock_height) ||
          !new BigNumber(serializedSlate.lock_height).isInteger() ||
          new BigNumber(serializedSlate.lock_height).isNegative()
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate lock height");
        }
        slate.lockHeight = new BigNumber(serializedSlate.lock_height);
        if (
          !("orig_version" in serializedSlate.version_info) ||
          !Common.isBigNumber(serializedSlate.version_info.orig_version) ||
          !serializedSlate.version_info.orig_version.isInteger() ||
          serializedSlate.version_info.orig_version.isLessThan(1)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate original version");
        }
        slate.originalVersion = serializedSlate.version_info.orig_version;
        if (
          !("block_header_version" in serializedSlate.version_info) ||
          !Common.isBigNumber(serializedSlate.version_info.block_header_version) ||
          !serializedSlate.version_info.block_header_version.isEqualTo(
            Consensus.getHeaderVersion(slate.cryptocurrency, slate.height),
          )
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate header version");
        }
        slate.headerVersion = serializedSlate.version_info.block_header_version.toNumber();
        if (
          !("id" in serializedSlate) ||
          !Common.isUuidString(serializedSlate.id) ||
          !Common.isRandomUuid(serializedSlate.id)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate ID");
        }
        slate.id = serializedSlate.id;
        if (!("tx" in serializedSlate) || !Common.isPureObject(serializedSlate.tx)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate transaction");
        }
        if (!("body" in serializedSlate.tx) || !Common.isPureObject(serializedSlate.tx.body)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate transaction body");
        }
        if (
          !("inputs" in serializedSlate.tx.body) ||
          !Array.isArray(serializedSlate.tx.body.inputs)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate inputs");
        }
        slate.inputs = await Promise.all(
          serializedSlate.tx.body.inputs.map(
            async (input: { [key: string]: any }): Promise<SlateInput> => {
              return await SlateInput.unserialize(input, slate);
            },
          ),
        );
        if (!slate.inputs.length) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate inputs");
        }
        if (
          !("outputs" in serializedSlate.tx.body) ||
          !Array.isArray(serializedSlate.tx.body.outputs)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate outputs");
        }
        slate.outputs = await Promise.all(
          serializedSlate.tx.body.outputs.map(
            async (output: { [key: string]: any }): Promise<SlateOutput> => {
              return await SlateOutput.unserialize(output, slate);
            },
          ),
        );
        if (
          !("kernels" in serializedSlate.tx.body) ||
          !Array.isArray(serializedSlate.tx.body.kernels)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernels");
        }
        slate.kernels = await Promise.all(
          serializedSlate.tx.body.kernels.map(
            async (kernel: { [key: string]: any }): Promise<SlateKernel> => {
              return await SlateKernel.unserialize(kernel, slate);
            },
          ),
        );
        if (
          !("offset" in serializedSlate.tx) ||
          !Common.isHexString(serializedSlate.tx.offset) ||
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.isValidSecretKey(Buffer.from(serializedSlate.tx.offset, "hex")),
          ))
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate offset");
        }
        slate.offset = Buffer.from(serializedSlate.tx.offset, "hex");
        if (
          !("participant_data" in serializedSlate) ||
          !Array.isArray(serializedSlate.participant_data) ||
          slate.numberOfParticipants.isLessThan(serializedSlate.participant_data.length)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participants");
        }
        slate.participants = await Promise.all(
          serializedSlate.participant_data.map(
            async (participant: { [key: string]: any }): Promise<SlateParticipant> => {
              return await SlateParticipant.unserialize(participant, slate);
            },
          ),
        );
        if (slate.version.isGreaterThanOrEqualTo(3)) {
          if (
            !("ttl_cutoff_height" in serializedSlate) ||
            (serializedSlate.ttl_cutoff_height !== null &&
              (!Common.isNumberString(serializedSlate.ttl_cutoff_height) ||
                !new BigNumber(serializedSlate.ttl_cutoff_height).isInteger() ||
                new BigNumber(serializedSlate.ttl_cutoff_height).isLessThanOrEqualTo(
                  slate.height,
                ) ||
                new BigNumber(serializedSlate.ttl_cutoff_height).isLessThan(slate.lockHeight)))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate time to live cut off height",
            );
          }
          slate.timeToLiveCutOffHeight =
            serializedSlate.ttl_cutoff_height !== null
              ? new BigNumber(serializedSlate.ttl_cutoff_height)
              : null;
          if (
            !("payment_proof" in serializedSlate) ||
            (serializedSlate.payment_proof !== null &&
              !Common.isPureObject(serializedSlate.payment_proof))
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
          }
          if (serializedSlate.payment_proof !== null) {
            if (
              !("receiver_address" in serializedSlate.payment_proof) ||
              typeof serializedSlate.payment_proof.receiver_address !== "string"
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            switch (slate.cryptocurrency.id) {
              case "mimblewimble_coin":
              case "mimblewimble_coin_floonet":
                if (serializedSlate.payment_proof.receiver_address.length !== Tor.ADDRESS_LENGTH) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                try {
                  Tor.torAddressToPublicKey(serializedSlate.payment_proof.receiver_address);
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                slate.recipientPaymentProofAddress = serializedSlate.payment_proof.receiver_address;
                break;
              case "epic_cash":
              case "epic_cash_floonet":
                if (
                  !Common.isHexString(serializedSlate.payment_proof.receiver_address) ||
                  Buffer.from(serializedSlate.payment_proof.receiver_address, "hex").length !==
                    Crypto.ED25519_PUBLIC_KEY_LENGTH
                ) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                try {
                  slate.recipientPaymentProofAddress = Tor.publicKeyToTorAddress(
                    Buffer.from(serializedSlate.payment_proof.receiver_address, "hex"),
                  );
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                break;
              default:
                throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
            }
            if (
              !("receiver_signature" in serializedSlate.payment_proof) ||
              (serializedSlate.payment_proof.receiver_signature !== null &&
                (!Common.isHexString(serializedSlate.payment_proof.receiver_signature) ||
                  Buffer.from(serializedSlate.payment_proof.receiver_signature, "hex").length !==
                    Crypto.ED25519_SIGNATURE_LENGTH))
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            slate.recipientPaymentProofSignature =
              serializedSlate.payment_proof.receiver_signature !== null
                ? Buffer.from(serializedSlate.payment_proof.receiver_signature, "hex")
                : null;
            if (
              !("sender_address" in serializedSlate.payment_proof) ||
              typeof serializedSlate.payment_proof.sender_address !== "string"
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            switch (slate.cryptocurrency.id) {
              case "mimblewimble_coin":
              case "mimblewimble_coin_floonet":
                switch (serializedSlate.payment_proof.sender_address.length) {
                  case Mqs.ADDRESS_LENGTH:
                    try {
                      await Mqs.mqsAddressToPublicKey(
                        serializedSlate.payment_proof.sender_address,
                        slate.cryptocurrency,
                      );
                    } catch (error: any) {
                      throw new MimbleWimbleCoinInvalidParameters(
                        "Invalid serialized slate payment proof",
                      );
                    }
                    break;
                  case Tor.ADDRESS_LENGTH:
                    try {
                      Tor.torAddressToPublicKey(serializedSlate.payment_proof.sender_address);
                    } catch (error: any) {
                      throw new MimbleWimbleCoinInvalidParameters(
                        "Invalid serialized slate payment proof",
                      );
                    }
                    break;
                  default:
                    throw new MimbleWimbleCoinInvalidParameters(
                      "Invalid serialized slate payment proof",
                    );
                }
                slate.senderPaymentProofAddress = serializedSlate.payment_proof.sender_address;
                break;
              case "epic_cash":
              case "epic_cash_floonet":
                if (
                  !Common.isHexString(serializedSlate.payment_proof.sender_address) ||
                  Buffer.from(serializedSlate.payment_proof.sender_address, "hex").length !==
                    Crypto.ED25519_PUBLIC_KEY_LENGTH
                ) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                try {
                  slate.senderPaymentProofAddress = Tor.publicKeyToTorAddress(
                    Buffer.from(serializedSlate.payment_proof.sender_address, "hex"),
                  );
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                break;
              default:
                throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
            }
          } else {
            slate.recipientPaymentProofAddress = null;
            slate.recipientPaymentProofSignature = null;
            slate.senderPaymentProofAddress = null;
          }
        } else {
          slate.timeToLiveCutOffHeight = null;
          slate.recipientPaymentProofAddress = null;
          slate.recipientPaymentProofSignature = null;
          slate.senderPaymentProofAddress = null;
        }
        break;
      case "SP": {
        if (!(serializedSlate instanceof Buffer)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
        }
        slate.relativeHeight = null;
        const bitReader = new BitReader(serializedSlate as Buffer);
        slate.version = "SP";
        slate.originalVersion = slate.version;
        if (SlateUtils.uncompressPurpose(bitReader) !== purpose) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate purpose");
        }
        const id = SlateUtils.uncompressId(bitReader);
        if (!Common.isUuidString(id) || !Common.isRandomUuid(id)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate ID");
        }
        slate.id = id;
        const isMainnet = SlateUtils.uncompressBoolean(bitReader);
        switch (slate.cryptocurrency.id) {
          case "mimblewimble_coin":
            if (!isMainnet) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate is mainnet");
            }
            break;
          case "mimblewimble_coin_floonet":
            if (isMainnet) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate is mainnet");
            }
            break;
          default:
            throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
        }
        if (purpose === Slate.Purpose.SEND_INITIAL) {
          const amount = SlateUtils.uncompressUint64(bitReader, true);
          if (amount.isLessThan(1)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate amount");
          }
          slate.amount = amount;
          const fee = SlateUtils.uncompressUint64(bitReader, true);
          if (fee.isLessThan(1)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate fee");
          }
          slate.fee = fee;
        }
        const height = SlateUtils.uncompressUint64(bitReader, false);
        if (height.isNegative()) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate height");
        }
        slate.height = height;
        slate.headerVersion = Consensus.getHeaderVersion(slate.cryptocurrency, slate.height);
        const lockHeight = SlateUtils.uncompressUint64(bitReader, false);
        if (lockHeight.isNegative()) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate lock height");
        }
        slate.lockHeight = lockHeight;
        if (SlateUtils.uncompressBoolean(bitReader)) {
          const timeToLiveCutOffHeight = SlateUtils.uncompressUint64(bitReader, false);
          if (
            timeToLiveCutOffHeight.isLessThanOrEqualTo(slate.height) ||
            timeToLiveCutOffHeight.isLessThan(slate.lockHeight)
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate time to live cut off height",
            );
          }
          slate.timeToLiveCutOffHeight = timeToLiveCutOffHeight;
        } else {
          slate.timeToLiveCutOffHeight = null;
        }
        if (purpose === Slate.Purpose.SEND_INITIAL) {
          slate.numberOfParticipants = new BigNumber(2);
          slate.offset = Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH);
          slate.inputs = [];
          slate.outputs = [];
          slate.participants = [];
          slate.participants.push(await SlateParticipant.unserialize(bitReader, slate));
          if (SlateUtils.uncompressBoolean(bitReader)) {
            const senderPaymentProofAddress = await SlateUtils.uncompressPaymentProofAddress(
              bitReader,
              slate.cryptocurrency,
            );
            switch (senderPaymentProofAddress.length) {
              case Mqs.ADDRESS_LENGTH:
                try {
                  await Mqs.mqsAddressToPublicKey(senderPaymentProofAddress, slate.cryptocurrency);
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                break;
              case Tor.ADDRESS_LENGTH:
                try {
                  Tor.torAddressToPublicKey(senderPaymentProofAddress);
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                break;
              default:
                throw new MimbleWimbleCoinInvalidParameters(
                  "Invalid serialized slate payment proof",
                );
            }
            slate.senderPaymentProofAddress = senderPaymentProofAddress;
            const recipientPaymentProofAddress = await SlateUtils.uncompressPaymentProofAddress(
              bitReader,
              slate.cryptocurrency,
            );
            if (recipientPaymentProofAddress.length !== Tor.ADDRESS_LENGTH) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            try {
              Tor.torAddressToPublicKey(recipientPaymentProofAddress);
            } catch (error: any) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            slate.recipientPaymentProofAddress = recipientPaymentProofAddress;
            slate.recipientPaymentProofSignature = null;
          } else {
            slate.recipientPaymentProofAddress = null;
            slate.recipientPaymentProofSignature = null;
            slate.senderPaymentProofAddress = null;
          }
          slate.kernels = [
            new SlateKernel(
              slate.getKernelFeatures(),
              slate.fee,
              slate.lockHeight,
              slate.relativeHeight,
            ),
          ];
        } else if (purpose === Slate.Purpose.SEND_RESPONSE) {
          slate.numberOfParticipants = initialSendSlate!.numberOfParticipants;
          slate.amount = initialSendSlate!.amount;
          slate.fee = initialSendSlate!.fee;
          slate.inputs = initialSendSlate!.inputs.map((input: SlateInput): SlateInput => {
            return new SlateInput(input.features, input.commitment);
          });
          slate.outputs = initialSendSlate!.outputs.map((output: SlateOutput): SlateOutput => {
            return new SlateOutput(output.features, output.commitment, output.proof);
          });
          slate.participants = initialSendSlate!.participants.map(
            (participant: SlateParticipant): SlateParticipant => {
              return new SlateParticipant(
                participant.id,
                participant.publicBlindExcess,
                participant.publicNonce,
                participant.partialSignature,
                participant.message,
                participant.messageSignature,
              );
            },
          );
          const offset = SlateUtils.uncompressOffset(bitReader);
          if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidSecretKey(offset)))) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate offset");
          }
          slate.offset = offset;
          const outputs: SlateOutput[] = [];
          do {
            outputs.push(await SlateOutput.unserialize(bitReader, slate));
          } while (SlateUtils.uncompressBoolean(bitReader));
          slate.kernels = [];
          slate.addOutputs(outputs, false);
          do {
            slate.kernels.push(await SlateKernel.unserialize(bitReader, slate));
          } while (SlateUtils.uncompressBoolean(bitReader));
          slate.participants.push(await SlateParticipant.unserialize(bitReader, slate));
          if (SlateUtils.uncompressBoolean(bitReader)) {
            const senderPaymentProofAddress = await SlateUtils.uncompressPaymentProofAddress(
              bitReader,
              slate.cryptocurrency,
            );
            switch (senderPaymentProofAddress.length) {
              case Mqs.ADDRESS_LENGTH:
                try {
                  await Mqs.mqsAddressToPublicKey(senderPaymentProofAddress, slate.cryptocurrency);
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                break;
              case Tor.ADDRESS_LENGTH:
                try {
                  Tor.torAddressToPublicKey(senderPaymentProofAddress);
                } catch (error: any) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate payment proof",
                  );
                }
                break;
              default:
                throw new MimbleWimbleCoinInvalidParameters(
                  "Invalid serialized slate payment proof",
                );
            }
            slate.senderPaymentProofAddress = senderPaymentProofAddress;
            const recipientPaymentProofAddress = await SlateUtils.uncompressPaymentProofAddress(
              bitReader,
              slate.cryptocurrency,
            );
            if (recipientPaymentProofAddress.length !== Tor.ADDRESS_LENGTH) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            try {
              Tor.torAddressToPublicKey(recipientPaymentProofAddress);
            } catch (error: any) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            slate.recipientPaymentProofAddress = recipientPaymentProofAddress;
          } else {
            slate.recipientPaymentProofAddress = null;
            slate.senderPaymentProofAddress = null;
          }
          if (SlateUtils.uncompressBoolean(bitReader)) {
            if (!slate.hasPaymentProof()) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            const recipientPaymentProofSignature =
              SlateUtils.uncompressPaymentProofSignature(bitReader);
            if (recipientPaymentProofSignature.length !== Crypto.ED25519_SIGNATURE_LENGTH) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            slate.recipientPaymentProofSignature = recipientPaymentProofSignature;
          } else {
            slate.recipientPaymentProofSignature = null;
          }
        }
        break;
      }
      case "4":
        slate.version = new BigNumber(4);
        slate.originalVersion = slate.version;
        slate.relativeHeight = null;
        if (serializedSlate instanceof Buffer) {
          const bitReader = new BitReader(serializedSlate);
          SlateUtils.readUint16(bitReader);
          slate.headerVersion = SlateUtils.readUint16(bitReader);
          const id = SlateUtils.uncompressId(bitReader);
          if (!Common.isUuidString(id) || !Common.isRandomUuid(id)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate ID");
          }
          slate.id = id;
          if (SlateUtils.readUint8(bitReader) !== purpose + 1) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate purpose");
          }
          const offset = SlateUtils.uncompressOffset(bitReader);
          if (
            (purpose === Slate.Purpose.SEND_INITIAL &&
              !offset.equals(Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH)) &&
              !(await Common.resolveIfPromise(Secp256k1Zkp.isValidSecretKey(offset)))) ||
            (purpose === Slate.Purpose.SEND_RESPONSE &&
              !(await Common.resolveIfPromise(Secp256k1Zkp.isValidSecretKey(offset))))
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate offset");
          }
          slate.offset = offset;
          const optionalFields = SlateUtils.readUint8(bitReader);
          let numberOfParticipants: BigNumber;
          if (optionalFields & 0b00000001) {
            numberOfParticipants = new BigNumber(SlateUtils.readUint8(bitReader));
          } else {
            numberOfParticipants = new BigNumber(2);
          }
          if (numberOfParticipants.isLessThan(2)) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate number of participants",
            );
          }
          slate.numberOfParticipants = numberOfParticipants;
          let amount: BigNumber;
          if (optionalFields & 0b00000010) {
            amount = SlateUtils.readUint64(bitReader);
          } else {
            amount =
              purpose === Slate.Purpose.SEND_INITIAL ? new BigNumber(0) : initialSendSlate!.amount;
          }
          if (amount.isLessThan(1)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate amount");
          }
          slate.amount = amount;
          let fee: BigNumber;
          if (optionalFields & 0b00000100) {
            fee = SlateUtils.readUint64(bitReader);
          } else {
            fee = purpose === Slate.Purpose.SEND_INITIAL ? new BigNumber(0) : initialSendSlate!.fee;
          }
          if (fee.isLessThan(1)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate fee");
          }
          slate.fee = fee;
          let features: number;
          if (optionalFields & 0b00001000) {
            features = SlateUtils.readUint8(bitReader);
          } else {
            features = 0;
          }
          let timeToLiveCutOffHeight: BigNumber | null;
          if (optionalFields & 0b00010000) {
            timeToLiveCutOffHeight = SlateUtils.readUint64(bitReader);
          } else {
            timeToLiveCutOffHeight = null;
          }
          slate.timeToLiveCutOffHeight = timeToLiveCutOffHeight;
          const participantsLength = SlateUtils.readUint8(bitReader);
          if (purpose === Slate.Purpose.SEND_RESPONSE) {
            slate.participants = initialSendSlate!.participants.map(
              (participant: SlateParticipant): SlateParticipant => {
                return new SlateParticipant(
                  participant.id,
                  participant.publicBlindExcess,
                  participant.publicNonce,
                  participant.partialSignature,
                  participant.message,
                  participant.messageSignature,
                );
              },
            );
          } else {
            slate.participants = [];
          }
          if (
            slate.numberOfParticipants.isLessThan(participantsLength + slate.participants.length)
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participants");
          }
          for (let i = 0; i < participantsLength; ++i) {
            slate.participants.push(await SlateParticipant.unserialize(bitReader, slate));
          }
          const componentFields = SlateUtils.readUint8(bitReader);
          if (purpose === Slate.Purpose.SEND_RESPONSE) {
            slate.inputs = initialSendSlate!.inputs.map((input: SlateInput): SlateInput => {
              return new SlateInput(input.features, input.commitment);
            });
            slate.outputs = initialSendSlate!.outputs.map((output: SlateOutput): SlateOutput => {
              return new SlateOutput(output.features, output.commitment, output.proof);
            });
          } else {
            slate.inputs = [];
            slate.outputs = [];
          }
          if (componentFields & 0b00000001) {
            const inputs: SlateInput[] = [];
            const outputs: SlateOutput[] = [];
            const inputsAndOutputsLength = SlateUtils.readUint16(bitReader);
            for (let i = 0; i < inputsAndOutputsLength; ++i) {
              if (SlateUtils.readUint8(bitReader)) {
                outputs.push(await SlateOutput.unserialize(bitReader, slate));
              } else {
                inputs.push(await SlateInput.unserialize(bitReader, slate));
              }
            }
            if (purpose === Slate.Purpose.SEND_RESPONSE) {
              slate.kernels = [];
              slate.addInputs(inputs, outputs.length, false);
              slate.addOutputs(outputs, false);
            }
          }
          if (componentFields & 0b00000010) {
            try {
              slate.senderPaymentProofAddress = Slatepack.publicKeyToSlatepackAddress(
                bitReader.getBytes(Crypto.ED25519_PUBLIC_KEY_LENGTH),
                slate.cryptocurrency,
              );
            } catch (error: any) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            try {
              slate.recipientPaymentProofAddress = Slatepack.publicKeyToSlatepackAddress(
                bitReader.getBytes(Crypto.ED25519_PUBLIC_KEY_LENGTH),
                slate.cryptocurrency,
              );
            } catch (error: any) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            if (SlateUtils.readUint8(bitReader)) {
              slate.recipientPaymentProofSignature = bitReader.getBytes(
                Crypto.ED25519_SIGNATURE_LENGTH,
              );
            } else {
              slate.recipientPaymentProofSignature = null;
            }
          } else {
            slate.recipientPaymentProofAddress = null;
            slate.recipientPaymentProofSignature = null;
            slate.senderPaymentProofAddress = null;
          }
          switch (features) {
            case SlateKernel.Features.PLAIN:
              slate.lockHeight = new BigNumber(0);
              break;
            case SlateKernel.Features.HEIGHT_LOCKED:
              slate.lockHeight = SlateUtils.readUint64(bitReader);
              break;
            default:
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate features");
          }
          if (
            slate.timeToLiveCutOffHeight &&
            slate.timeToLiveCutOffHeight.isLessThan(slate.lockHeight)
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate time to live cut off height",
            );
          }
          if (purpose === Slate.Purpose.SEND_RESPONSE) {
            slate.height = initialSendSlate!.height;
          } else {
            slate.height = null;
          }
          slate.kernels = [
            new SlateKernel(
              slate.getKernelFeatures(),
              slate.fee,
              slate.lockHeight,
              slate.relativeHeight,
            ),
          ];
        } else if (Common.isPureObject(serializedSlate)) {
          if (
            !("sta" in serializedSlate) ||
            serializedSlate.sta !== Slate.getPurposeAsText(purpose)
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate purpose");
          }
          if (
            "num_parts" in serializedSlate &&
            (!Common.isBigNumber(serializedSlate.num_parts) ||
              !serializedSlate.num_parts.isInteger() ||
              serializedSlate.num_parts.isLessThan(2))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate number of participants",
            );
          }
          slate.numberOfParticipants =
            "num_parts" in serializedSlate ? serializedSlate.num_parts : new BigNumber(2);
          if (
            !("id" in serializedSlate) ||
            !Common.isUuidString(serializedSlate.id) ||
            !Common.isRandomUuid(serializedSlate.id)
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate ID");
          }
          slate.id = serializedSlate.id;
          if (
            !("ver" in serializedSlate) ||
            typeof serializedSlate.ver !== "string" ||
            !/^(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/u.test(serializedSlate.ver) ||
            new BigNumber(serializedSlate.ver.split(":")[1]).isGreaterThan(Number.MAX_SAFE_INTEGER)
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate version");
          }
          slate.headerVersion = parseInt(serializedSlate.ver.split(":")[1]);
          if ("feat" in serializedSlate) {
            if (
              !Common.isBigNumber(serializedSlate.feat) ||
              serializedSlate.feat.isGreaterThan(Number.MAX_SAFE_INTEGER)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate features");
            }
            switch (serializedSlate.feat.toNumber()) {
              case SlateKernel.Features.PLAIN:
                slate.lockHeight = new BigNumber(0);
                break;
              case SlateKernel.Features.HEIGHT_LOCKED:
                if (
                  !("feat_args" in serializedSlate) ||
                  serializedSlate.feat_args === null ||
                  !Common.isPureObject(serializedSlate.feat_args) ||
                  !("lock_hgt" in serializedSlate.feat_args) ||
                  !Common.isNumberString(serializedSlate.feat_args.lock_hgt) ||
                  !new BigNumber(serializedSlate.feat_args.lock_hgt).isInteger() ||
                  new BigNumber(serializedSlate.feat_args.lock_hgt).isNegative()
                ) {
                  throw new MimbleWimbleCoinInvalidParameters(
                    "Invalid serialized slate lock height",
                  );
                }
                slate.lockHeight = new BigNumber(serializedSlate.feat_args.lock_hgt);
                break;
              default:
                throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate features");
            }
          } else {
            if ("feat_args" in serializedSlate && serializedSlate.feat_args !== null) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate features");
            }
            slate.lockHeight = new BigNumber(0);
          }
          if (
            "ttl" in serializedSlate &&
            serializedSlate.ttl !== null &&
            (!Common.isNumberString(serializedSlate.ttl) ||
              !new BigNumber(serializedSlate.ttl).isInteger() ||
              new BigNumber(serializedSlate.ttl).isLessThan(slate.lockHeight))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate time to live cut off height",
            );
          }
          slate.timeToLiveCutOffHeight =
            "ttl" in serializedSlate && serializedSlate.ttl !== null
              ? new BigNumber(serializedSlate.ttl)
              : null;
          if (purpose === Slate.Purpose.SEND_RESPONSE) {
            slate.participants = initialSendSlate!.participants.map(
              (participant: SlateParticipant): SlateParticipant => {
                return new SlateParticipant(
                  participant.id,
                  participant.publicBlindExcess,
                  participant.publicNonce,
                  participant.partialSignature,
                  participant.message,
                  participant.messageSignature,
                );
              },
            );
          } else {
            slate.participants = [];
          }
          if (
            !("sigs" in serializedSlate) ||
            !Array.isArray(serializedSlate.sigs) ||
            slate.numberOfParticipants.isLessThan(
              serializedSlate.sigs.length + slate.participants.length,
            )
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participants");
          }
          for (const serializedSlateParticipant of serializedSlate.sigs) {
            slate.participants.push(
              await SlateParticipant.unserialize(serializedSlateParticipant, slate),
            );
          }
          if ("proof" in serializedSlate && serializedSlate.proof !== null) {
            if (!Common.isPureObject(serializedSlate.proof)) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            if (
              !("raddr" in serializedSlate.proof) ||
              !Common.isHexString(serializedSlate.proof.raddr) ||
              Buffer.from(serializedSlate.proof.raddr, "hex").length !==
                Crypto.ED25519_PUBLIC_KEY_LENGTH
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            try {
              slate.recipientPaymentProofAddress = Slatepack.publicKeyToSlatepackAddress(
                Buffer.from(serializedSlate.proof.raddr, "hex"),
                slate.cryptocurrency,
              );
            } catch (error: any) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            if (
              "rsig" in serializedSlate.proof &&
              serializedSlate.proof.rsig !== null &&
              (!Common.isHexString(serializedSlate.proof.rsig) ||
                Buffer.from(serializedSlate.proof.rsig, "hex").length !==
                  Crypto.ED25519_SIGNATURE_LENGTH)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            slate.recipientPaymentProofSignature =
              "rsig" in serializedSlate.proof && serializedSlate.proof.rsig !== null
                ? Buffer.from(serializedSlate.proof.rsig, "hex")
                : null;
            if (
              !("saddr" in serializedSlate.proof) ||
              !Common.isHexString(serializedSlate.proof.saddr) ||
              Buffer.from(serializedSlate.proof.saddr, "hex").length !==
                Crypto.ED25519_PUBLIC_KEY_LENGTH
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
            try {
              slate.senderPaymentProofAddress = Slatepack.publicKeyToSlatepackAddress(
                Buffer.from(serializedSlate.proof.saddr, "hex"),
                slate.cryptocurrency,
              );
            } catch (error: any) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
            }
          } else {
            slate.recipientPaymentProofAddress = null;
            slate.recipientPaymentProofSignature = null;
            slate.senderPaymentProofAddress = null;
          }
          if (purpose === Slate.Purpose.SEND_INITIAL) {
            slate.offset = Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH);
            slate.inputs = [];
            slate.outputs = [];
            slate.height = null;
            if ("coms" in serializedSlate && serializedSlate.coms !== null) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate inputs and outputs",
              );
            }
            if (
              !("amt" in serializedSlate) ||
              !Common.isNumberString(serializedSlate.amt) ||
              !new BigNumber(serializedSlate.amt).isInteger() ||
              new BigNumber(serializedSlate.amt).isLessThan(1)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate amount");
            }
            slate.amount = new BigNumber(serializedSlate.amt);
            if (
              !("fee" in serializedSlate) ||
              !Common.isNumberString(serializedSlate.fee) ||
              !new BigNumber(serializedSlate.fee).isInteger() ||
              new BigNumber(serializedSlate.fee).isLessThan(1)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate fee");
            }
            slate.fee = new BigNumber(serializedSlate.fee);
            if (
              "off" in serializedSlate &&
              (!Common.isHexString(serializedSlate.off) ||
                !Buffer.from(serializedSlate.off, "hex").equals(
                  Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH),
                ))
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate offset");
            }
          } else if (purpose === Slate.Purpose.SEND_RESPONSE) {
            slate.height = initialSendSlate!.height;
            slate.inputs = initialSendSlate!.inputs.map((input: SlateInput): SlateInput => {
              return new SlateInput(input.features, input.commitment);
            });
            slate.outputs = initialSendSlate!.outputs.map((output: SlateOutput): SlateOutput => {
              return new SlateOutput(output.features, output.commitment, output.proof);
            });
            if (
              !("coms" in serializedSlate) ||
              serializedSlate.coms === null ||
              !Array.isArray(serializedSlate.coms)
            ) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate inputs and outputs",
              );
            }
            const inputs: SlateInput[] = [];
            const outputs: SlateOutput[] = [];
            for (const inputOrOutput of serializedSlate.coms) {
              if (!Common.isPureObject(inputOrOutput)) {
                throw new MimbleWimbleCoinInvalidParameters(
                  "Invalid serialized slate inputs and outputs",
                );
              }
              if ("p" in inputOrOutput && inputOrOutput["p"] !== null) {
                outputs.push(await SlateOutput.unserialize(inputOrOutput, slate));
              } else {
                inputs.push(await SlateInput.unserialize(inputOrOutput, slate));
              }
            }
            slate.kernels = [];
            slate.addInputs(inputs, outputs.length, false);
            slate.addOutputs(outputs, false);
            if (
              "amt" in serializedSlate &&
              (!Common.isNumberString(serializedSlate.amt) ||
                !new BigNumber(serializedSlate.amt).isInteger() ||
                new BigNumber(serializedSlate.amt).isLessThan(1))
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate amount");
            }
            slate.amount =
              "amt" in serializedSlate
                ? new BigNumber(serializedSlate.amt)
                : initialSendSlate!.amount;
            if (
              "fee" in serializedSlate &&
              ((!Common.isNumberString(serializedSlate.fee) &&
                !Common.isBigNumber(serializedSlate.fee)) ||
                !new BigNumber(serializedSlate.fee).isInteger() ||
                new BigNumber(serializedSlate.fee).isLessThan(1))
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate fee");
            }
            slate.fee =
              "fee" in serializedSlate ? new BigNumber(serializedSlate.fee) : initialSendSlate!.fee;
            if (
              !("off" in serializedSlate) ||
              !Common.isHexString(serializedSlate.off) ||
              !(await Common.resolveIfPromise(
                Secp256k1Zkp.isValidSecretKey(Buffer.from(serializedSlate.off, "hex")),
              ))
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate offset");
            }
            slate.offset = Buffer.from(serializedSlate.off, "hex");
          }
          slate.kernels = [
            new SlateKernel(
              slate.getKernelFeatures(),
              slate.fee,
              slate.lockHeight,
              slate.relativeHeight,
            ),
          ];
        } else {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
    const participantIds: Set<string> = new Set();
    let senderParticipantExists = false;
    for (const participant of slate.participants) {
      if (participantIds.has(participant.id.toFixed())) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participants");
      }
      participantIds.add(participant.id.toFixed());
      if (participant.isSender()) {
        senderParticipantExists = true;
      }
    }
    if (!senderParticipantExists) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participants");
    }
    if (!(await slate.verifyPartialSignatures())) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate partial signature(s)");
    }
    if (!(await slate.verifyRecipientPaymentProofSignature())) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate payment proof");
    }
    if (!slate.verifyWeight()) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate weight");
    }
    if (!slate.verifyNoRecentDuplicateKernels()) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernels");
    }
    if (!slate.verifySortedAndUnique()) {
      throw new MimbleWimbleCoinInvalidParameters(
        "Invalid serialized slate inputs, outputs, and/or kernels",
      );
    }
    if (!slate.verifyNoCutThrough()) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate inputs and/or outputs");
    }
    if (!slate.kernels.length) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernels");
    }
    if (slate.getKernelFeatures() !== slate.kernels[0].features) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernels");
    }
    if (slate.kernels[0].isComplete()) {
      if (!(await slate.verifyKernelSums())) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel sums");
      }
    }
    return slate;
  }

  private getMinimimCompatibleVersion(
    recipientSupportedVersions: string[] | null,
  ): BigNumber | string {
    switch (this.cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        if (
          recipientSupportedVersions &&
          recipientSupportedVersions.indexOf("SP") !== -1 &&
          this.getKernelFeatures() === SlateKernel.Features.PLAIN
        ) {
          return "SP";
        }
        if (this.timeToLiveCutOffHeight || this.hasPaymentProof()) {
          return new BigNumber(3);
        }
        if (recipientSupportedVersions && recipientSupportedVersions.indexOf("V2") === -1) {
          return new BigNumber(3);
        }
        return new BigNumber(2);
      case "grin":
      case "grin_testnet":
        return new BigNumber(4);
      case "epic_cash":
      case "epic_cash_floonet":
        if (this.timeToLiveCutOffHeight || this.hasPaymentProof()) {
          return new BigNumber(3);
        }
        if (recipientSupportedVersions && recipientSupportedVersions.indexOf("V2") === -1) {
          return new BigNumber(3);
        }
        return new BigNumber(2);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private async getPaymentProofMessage(): Promise<Buffer> {
    const excess = await this.getExcess();
    switch (this.cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        return Buffer.from(
          `${excess.toString("hex")}${this.senderPaymentProofAddress}${this.amount.toFixed()}`,
        );
      case "grin":
      case "grin_testnet": {
        if (this.amount.isLessThan(0) || this.amount.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
        }
        const senderPaymentProofPublicKey = Slatepack.slatepackAddressToPublicKey(
          this.senderPaymentProofAddress as string,
          this.cryptocurrency,
        );
        const buffer = Buffer.alloc(
          Uint64Array.BYTES_PER_ELEMENT +
            Crypto.COMMITMENT_LENGTH +
            Crypto.ED25519_PUBLIC_KEY_LENGTH,
        );
        Uint64Array.writeBigEndian(buffer, this.amount, 0);
        excess.copy(buffer, Uint64Array.BYTES_PER_ELEMENT);
        senderPaymentProofPublicKey.copy(
          buffer,
          Uint64Array.BYTES_PER_ELEMENT + Crypto.COMMITMENT_LENGTH,
        );
        return buffer;
      }
      case "epic_cash":
      case "epic_cash_floonet": {
        if (this.amount.isLessThan(0) || this.amount.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
        }
        const senderPaymentProofPublicKey = Tor.torAddressToPublicKey(
          this.senderPaymentProofAddress as string,
        );
        const buffer = Buffer.alloc(
          Uint64Array.BYTES_PER_ELEMENT +
            Crypto.COMMITMENT_LENGTH +
            Crypto.ED25519_PUBLIC_KEY_LENGTH,
        );
        Uint64Array.writeBigEndian(buffer, this.amount, 0);
        excess.copy(buffer, Uint64Array.BYTES_PER_ELEMENT);
        senderPaymentProofPublicKey.copy(
          buffer,
          Uint64Array.BYTES_PER_ELEMENT + Crypto.COMMITMENT_LENGTH,
        );
        return buffer;
      }
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private verifyWeight(expectedNumberOfOutputs = 0): boolean {
    const coinbaseWeight =
      Consensus.getBlockOutputWeight(this.cryptocurrency) +
      Consensus.getBlockKernelWeight(this.cryptocurrency);
    const maximumTransactionWeight = Math.max(
      Consensus.getMaximumBlockWeight(this.cryptocurrency) - coinbaseWeight,
      0,
    );
    return Slate.getWeight(
      this.cryptocurrency,
      this.inputs.length,
      this.outputs.length + expectedNumberOfOutputs,
      this.kernels.length,
    ).isLessThanOrEqualTo(maximumTransactionWeight);
  }

  private verifyNoRecentDuplicateKernels(): boolean {
    if (Consensus.isNoRecentDuplicateKernelsEnabled(this.cryptocurrency)) {
      const noRecentDuplicateKernelExcesses: Set<string> = new Set();
      for (const kernel of this.kernels) {
        if (kernel.features === SlateKernel.Features.NO_RECENT_DUPLICATE) {
          const excess = kernel.excess.toString("hex");
          if (noRecentDuplicateKernelExcesses.has(excess)) {
            return false;
          }
          noRecentDuplicateKernelExcesses.add(excess);
        }
      }
    }
    return true;
  }

  private verifySortedAndUnique(): boolean {
    if (
      !Slate.isSortedAndUnique(
        this.inputs.map((input: SlateInput): Buffer => {
          return input.getHash();
        }),
      )
    ) {
      return false;
    }
    if (
      !Slate.isSortedAndUnique(
        this.outputs.map((output: SlateOutput): Buffer => {
          return output.getHash();
        }),
      )
    ) {
      return false;
    }
    try {
      if (
        !Slate.isSortedAndUnique(
          this.kernels.map((kernel: SlateKernel): Buffer => {
            return kernel.getHash();
          }),
        )
      ) {
        return false;
      }
    } catch (error: any) {
      return false;
    }
    return true;
  }

  private verifyNoCutThrough(): boolean {
    const hashes: Set<string> = new Set();
    for (const input of this.inputs) {
      const hash = input.getHash().toString("hex");
      if (hashes.has(hash)) {
        return false;
      }
      hashes.add(hash);
    }
    for (const output of this.outputs) {
      const hash = output.getHash().toString("hex");
      if (hashes.has(hash)) {
        return false;
      }
      hashes.add(hash);
    }
    return true;
  }

  private verifyFees(baseFee: BigNumber): boolean {
    const transactionFee = Slate.getRequiredFee(
      this.cryptocurrency,
      this.inputs.length,
      this.outputs.length,
      this.kernels.length,
      baseFee,
    );
    if (transactionFee.isGreaterThan(this.getOverage())) {
      return false;
    }
    if (transactionFee.isGreaterThan(this.amount.plus(this.fee))) {
      return false;
    }
    if (transactionFee.isLessThan(1)) {
      return false;
    }
    return true;
  }

  private async verifyKernelSums(): Promise<boolean> {
    const kernelExcesses = this.kernels.map((kernel: SlateKernel): Buffer => {
      return kernel.excess;
    });
    for (let i = 0; i < kernelExcesses.length; ++i) {
      if (kernelExcesses[i].equals(Buffer.alloc(Crypto.COMMITMENT_LENGTH))) {
        kernelExcesses.splice(i--, 1);
      }
    }
    const kernelsSum = await Common.resolveIfPromise(
      Secp256k1Zkp.pedersenCommitSum(kernelExcesses, []),
    );
    if (kernelsSum === Secp256k1Zkp.OPERATION_FAILED) {
      return false;
    }
    const kernelCommits: Buffer[] = [kernelsSum];
    let offsetExcess: Buffer;
    try {
      offsetExcess = await this.getOffsetExcess();
    } catch (error: any) {
      return false;
    }
    kernelCommits.push(offsetExcess);
    const kernelsSumWithOffset = await Common.resolveIfPromise(
      Secp256k1Zkp.pedersenCommitSum(kernelCommits, []),
    );
    if (kernelsSumWithOffset === Secp256k1Zkp.OPERATION_FAILED) {
      return false;
    }
    let commitmentsSum: Buffer;
    try {
      commitmentsSum = await this.getCommitmentsSum();
    } catch (error: any) {
      return false;
    }
    return commitmentsSum.equals(kernelsSumWithOffset);
  }

  private getOverage(): BigNumber {
    let overage = new BigNumber(0);
    for (const kernel of this.kernels) {
      switch (kernel.features) {
        case SlateKernel.Features.PLAIN:
        case SlateKernel.Features.HEIGHT_LOCKED:
        case SlateKernel.Features.NO_RECENT_DUPLICATE:
          overage = overage.plus(kernel.fee);
          break;
      }
    }
    return overage;
  }

  private async getCommitmentsSum(): Promise<Buffer> {
    const inputCommitments = this.inputs.map((input: SlateInput): Buffer => {
      return input.commitment;
    });
    const outputCommitments = this.outputs.map((output: SlateOutput): Buffer => {
      return output.commitment;
    });
    const overage = this.getOverage();
    if (!overage.isZero()) {
      const overCommitment = await Common.resolveIfPromise(
        Secp256k1Zkp.pedersenCommit(
          Buffer.alloc(Crypto.SECP256K1_PRIVATE_KEY_LENGTH),
          overage.absoluteValue().toFixed(),
        ),
      );
      if (overCommitment === Secp256k1Zkp.OPERATION_FAILED) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate overage");
      }
      if (overage.isNegative()) {
        inputCommitments.push(overCommitment);
      } else {
        outputCommitments.push(overCommitment);
      }
    }
    for (let i = 0; i < inputCommitments.length; ++i) {
      if (inputCommitments[i].equals(Buffer.alloc(Crypto.COMMITMENT_LENGTH))) {
        inputCommitments.splice(i--, 1);
      }
    }
    for (let i = 0; i < outputCommitments.length; ++i) {
      if (outputCommitments[i].equals(Buffer.alloc(Crypto.COMMITMENT_LENGTH))) {
        outputCommitments.splice(i--, 1);
      }
    }
    const commitmentsSum = await Common.resolveIfPromise(
      Secp256k1Zkp.pedersenCommitSum(outputCommitments, inputCommitments),
    );
    if (commitmentsSum === Secp256k1Zkp.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters(
        "Invalid slate output commitments and/or slate input commitments",
      );
    }
    return commitmentsSum;
  }

  private updateKernel() {
    this.kernels.length = 0;
    switch (this.getKernelFeatures()) {
      case SlateKernel.Features.PLAIN:
        this.kernels.push(
          new SlateKernel(SlateKernel.Features.PLAIN, this.fee, new BigNumber(0), null),
        );
        break;
      case SlateKernel.Features.HEIGHT_LOCKED:
        this.kernels.push(
          new SlateKernel(SlateKernel.Features.HEIGHT_LOCKED, this.fee, this.lockHeight, null),
        );
        break;
      case SlateKernel.Features.NO_RECENT_DUPLICATE:
        this.kernels.push(
          new SlateKernel(
            SlateKernel.Features.NO_RECENT_DUPLICATE,
            this.fee,
            new BigNumber(0),
            this.relativeHeight,
          ),
        );
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel features");
    }
  }

  private sort(): boolean {
    this.inputs.sort((inputOne: SlateInput, inputTwo: SlateInput): number => {
      return inputOne.getHash().compare(inputTwo.getHash());
    });
    this.outputs.sort((outputOne: SlateOutput, outputTwo: SlateOutput): number => {
      return outputOne.getHash().compare(outputTwo.getHash());
    });
    try {
      this.kernels.sort((kernelOne: SlateKernel, kernelTwo: SlateKernel): number => {
        return kernelOne.getHash().compare(kernelTwo.getHash());
      });
    } catch (error: any) {
      return false;
    }
    return true;
  }

  private async verifyRecipientPaymentProofSignature(): Promise<boolean> {
    if (this.recipientPaymentProofSignature) {
      let message: Buffer;
      try {
        message = await this.getPaymentProofMessage();
      } catch (error: any) {
        return false;
      }
      let recipientPaymentProofPublicKey: Buffer;
      switch (this.cryptocurrency.id) {
        case "mimblewimble_coin":
        case "mimblewimble_coin_floonet":
        case "epic_cash":
        case "epic_cash_floonet":
          try {
            recipientPaymentProofPublicKey = Tor.torAddressToPublicKey(
              this.recipientPaymentProofAddress as string,
            );
          } catch (error: any) {
            return false;
          }
          break;
        case "grin":
        case "grin_testnet":
          try {
            recipientPaymentProofPublicKey = Slatepack.slatepackAddressToPublicKey(
              this.recipientPaymentProofAddress as string,
              this.cryptocurrency,
            );
          } catch (error: any) {
            return false;
          }
          break;
        default:
          return false;
      }
      return await Common.resolveIfPromise(
        Ed25519.verify(
          message,
          this.recipientPaymentProofSignature,
          recipientPaymentProofPublicKey,
        ),
      );
    }
    return true;
  }

  private static getWeight(
    cryptocurrency: CryptoCurrency,
    numberOfInputs: number,
    numberOfOutputs: number,
    numberOfKernels: number,
  ): BigNumber {
    const inputsWeight = new BigNumber(numberOfInputs).multipliedBy(
      Consensus.getBlockInputWeight(cryptocurrency),
    );
    const outputsWeight = new BigNumber(numberOfOutputs).multipliedBy(
      Consensus.getBlockOutputWeight(cryptocurrency),
    );
    const kernelsWeight = new BigNumber(Math.max(numberOfKernels, 1)).multipliedBy(
      Consensus.getBlockKernelWeight(cryptocurrency),
    );
    return inputsWeight.plus(outputsWeight).plus(kernelsWeight);
  }

  private static isSortedAndUnique(hashes: Buffer[]): boolean {
    for (let i = 1; i < hashes.length; ++i) {
      if (hashes[i].compare(hashes[i - 1]) !== 1) {
        return false;
      }
    }
    return true;
  }

  private static getCoinType(cryptocurrency: CryptoCurrency): string {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        return "mwc";
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getNetworkType(cryptocurrency: CryptoCurrency): string {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
        return "mainnet";
      case "mimblewimble_coin_floonet":
        return "floonet";
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getSupportedVersions(cryptocurrency: CryptoCurrency): string[] {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        return ["2", "3", "SP"];
      case "grin":
      case "grin_testnet":
        return ["4"];
      case "epic_cash":
      case "epic_cash_floonet":
        return ["2", "3"];
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static detectVersion(
    serializedSlate: { [key: string]: any } | Buffer,
    cryptocurrency: CryptoCurrency,
  ): string | null {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        if (serializedSlate instanceof Buffer) {
          return "SP";
        }
        if (!Common.isPureObject(serializedSlate)) {
          return null;
        }
        if (
          "coin_type" in serializedSlate &&
          serializedSlate.coin_type !== null &&
          serializedSlate.coin_type !== Slate.getCoinType(cryptocurrency)
        ) {
          return null;
        }
        if (
          "network_type" in serializedSlate &&
          serializedSlate.network_type !== null &&
          serializedSlate.network_type !== Slate.getNetworkType(cryptocurrency)
        ) {
          return null;
        }
        if (
          "version_info" in serializedSlate &&
          Common.isPureObject(serializedSlate.version_info) &&
          "version" in serializedSlate.version_info &&
          Common.isBigNumber(serializedSlate.version_info.version) &&
          serializedSlate.version_info.version.isInteger() &&
          serializedSlate.version_info.version.isPositive()
        ) {
          return serializedSlate.version_info.version.toFixed();
        }
        break;
      case "grin":
      case "grin_testnet":
        if (
          Common.isPureObject(serializedSlate) &&
          "ver" in serializedSlate &&
          typeof serializedSlate.ver === "string" &&
          /^(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/u.test(serializedSlate.ver)
        ) {
          return serializedSlate.ver.split(":")[0];
        }
        if (
          serializedSlate instanceof Buffer &&
          serializedSlate.length >= Uint16Array.BYTES_PER_ELEMENT
        ) {
          return serializedSlate.readUInt16BE(0).toFixed();
        }
        break;
      case "epic_cash":
      case "epic_cash_floonet":
        if (!Common.isPureObject(serializedSlate)) {
          return null;
        }
        if (
          "version_info" in serializedSlate &&
          Common.isPureObject(serializedSlate.version_info) &&
          "version" in serializedSlate.version_info &&
          Common.isBigNumber(serializedSlate.version_info.version) &&
          serializedSlate.version_info.version.isInteger() &&
          serializedSlate.version_info.version.isPositive()
        ) {
          return serializedSlate.version_info.version.toFixed();
        }
        break;
    }
    return null;
  }

  private static getPurposeAsText(purpose: number): string {
    switch (purpose) {
      case Slate.Purpose.SEND_INITIAL:
        return "S1";
      case Slate.Purpose.SEND_RESPONSE:
        return "S2";
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid purpose");
    }
  }
}
