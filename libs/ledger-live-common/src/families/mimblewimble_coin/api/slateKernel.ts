import BigNumber from "bignumber.js";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import blake2b from "blake2b";
import Crypto from "./crypto";
import Common from "./common";
import Consensus from "./consensus";
import Slate from "./slate";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import BitReader from "./bitReader";
import BitWriter from "./bitWriter";
import SlateUtils from "./slateUtils";
import Uint64Array from "./uint64Array";

export default class SlateKernel {
  public features: number;
  public fee: BigNumber;
  public lockHeight: BigNumber;
  public relativeHeight: BigNumber | null;
  public excess: Buffer;
  public signature: Buffer;

  public static readonly Features = {
    PLAIN: 0,
    COINBASE: 1,
    HEIGHT_LOCKED: 2,
    NO_RECENT_DUPLICATE: 3,
  };

  public constructor(
    features: number,
    fee: BigNumber,
    lockHeight: BigNumber,
    relativeHeight: BigNumber | null,
  ) {
    this.features = features;
    this.fee = fee;
    this.lockHeight = lockHeight;
    this.relativeHeight = relativeHeight;
    this.excess = Buffer.alloc(Crypto.COMMITMENT_LENGTH);
    this.signature = Buffer.alloc(Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH);
  }

  public serialize(
    slate: Slate,
    bitWriter: BitWriter | null = null,
  ): { [key: string]: any } | undefined {
    switch (
      Common.isBigNumber(slate.version) ? (slate.version as BigNumber).toFixed() : slate.version
    ) {
      case "2":
      case "3":
        switch (this.features) {
          case SlateKernel.Features.COINBASE:
            return {
              features: this.getFeaturesAsText(),
              excess: this.excess.toString("hex"),
              excess_sig: this.signature.toString("hex"),
              fee: "0",
              lock_height: "0",
            };
          case SlateKernel.Features.PLAIN:
            return {
              features: this.getFeaturesAsText(),
              excess: this.excess.toString("hex"),
              excess_sig: this.signature.toString("hex"),
              fee: this.fee.toFixed(),
              lock_height: "0",
            };
          case SlateKernel.Features.HEIGHT_LOCKED:
            return {
              features: this.getFeaturesAsText(),
              excess: this.excess.toString("hex"),
              excess_sig: this.signature.toString("hex"),
              fee: this.fee.toFixed(),
              lock_height: this.lockHeight.toFixed(),
            };
          case SlateKernel.Features.NO_RECENT_DUPLICATE:
            return {
              features: this.getFeaturesAsText(),
              excess: this.excess.toString("hex"),
              excess_sig: this.signature.toString("hex"),
              fee: this.fee.toFixed(),
              relative_height: this.relativeHeight!.toFixed(),
            };
          default:
            throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel features");
        }
      case "SP":
        switch (this.features) {
          case SlateKernel.Features.PLAIN:
            SlateUtils.compressUint64(bitWriter!, this.fee, true);
            break;
          default:
            throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel features");
        }
        SlateUtils.compressCommitment(bitWriter!, this.excess);
        SlateUtils.compressSingleSignerSignature(bitWriter!, this.signature);
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
  }

  public getTransaction(): {
    excess: string;
    excess_sig: string;
    features: { [key: string]: any };
  } {
    switch (this.features) {
      case SlateKernel.Features.COINBASE:
        return {
          excess: this.excess.toString("hex"),
          excess_sig: this.signature.toString("hex"),
          features: {
            [this.getFeaturesAsText()]: {},
          },
        };
      case SlateKernel.Features.PLAIN:
        return {
          excess: this.excess.toString("hex"),
          excess_sig: this.signature.toString("hex"),
          features: {
            [this.getFeaturesAsText()]: {
              fee: this.fee,
            },
          },
        };
      case SlateKernel.Features.HEIGHT_LOCKED:
        return {
          excess: this.excess.toString("hex"),
          excess_sig: this.signature.toString("hex"),
          features: {
            [this.getFeaturesAsText()]: {
              fee: this.fee,
              lock_height: this.lockHeight,
            },
          },
        };
      case SlateKernel.Features.NO_RECENT_DUPLICATE:
        return {
          excess: this.excess.toString("hex"),
          excess_sig: this.signature.toString("hex"),
          features: {
            [this.getFeaturesAsText()]: {
              fee: this.fee,
              relative_height: this.relativeHeight,
            },
          },
        };
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel features");
  }

  public async setSignature(signature: Buffer): Promise<boolean> {
    this.signature = signature;
    return await this.verifySignature();
  }

  public getHash(): Buffer {
    const data = Buffer.alloc(
      Uint8Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Crypto.COMMITMENT_LENGTH +
        Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH,
    );
    switch (this.features) {
      case SlateKernel.Features.COINBASE:
        data.writeUInt8(this.features, 0);
        Uint64Array.writeBigEndian(data, new BigNumber(0), Uint8Array.BYTES_PER_ELEMENT);
        Uint64Array.writeBigEndian(
          data,
          new BigNumber(0),
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        this.excess.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT,
        );
        this.signature.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Crypto.COMMITMENT_LENGTH,
        );
        break;
      case SlateKernel.Features.PLAIN:
        if (this.fee.isLessThan(0) || this.fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel fee");
        }
        data.writeUInt8(this.features, 0);
        Uint64Array.writeBigEndian(data, this.fee, Uint8Array.BYTES_PER_ELEMENT);
        Uint64Array.writeBigEndian(
          data,
          new BigNumber(0),
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        this.excess.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT,
        );
        this.signature.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Crypto.COMMITMENT_LENGTH,
        );
        break;
      case SlateKernel.Features.HEIGHT_LOCKED:
        if (this.fee.isLessThan(0) || this.fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel fee");
        }
        if (this.lockHeight.isLessThan(0) || this.lockHeight.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel lock height");
        }
        data.writeUInt8(this.features, 0);
        Uint64Array.writeBigEndian(data, this.fee, Uint8Array.BYTES_PER_ELEMENT);
        Uint64Array.writeBigEndian(
          data,
          this.lockHeight,
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        this.excess.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT,
        );
        this.signature.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Crypto.COMMITMENT_LENGTH,
        );
        break;
      case SlateKernel.Features.NO_RECENT_DUPLICATE:
        if (this.fee.isLessThan(0) || this.fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel fee");
        }
        if (
          this.relativeHeight!.isLessThan(0) ||
          this.relativeHeight!.isGreaterThan("0xFFFFFFFFFFFFFFFF")
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel relative height");
        }
        data.writeUInt8(this.features, 0);
        Uint64Array.writeBigEndian(data, this.fee, Uint8Array.BYTES_PER_ELEMENT);
        Uint64Array.writeBigEndian(
          data,
          this.relativeHeight!,
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        this.excess.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT,
        );
        this.signature.copy(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Crypto.COMMITMENT_LENGTH,
        );
        break;
    }
    return Buffer.from(blake2b(blake2b.BYTES).update(data).digest());
  }

  public isEqualTo(slateKernel: SlateKernel): boolean {
    if (this.features !== slateKernel.features) {
      return false;
    }
    if (!this.fee.isEqualTo(slateKernel.fee)) {
      return false;
    }
    if (!this.lockHeight.isEqualTo(slateKernel.lockHeight)) {
      return false;
    }
    if (
      (!this.relativeHeight && slateKernel.relativeHeight) ||
      (this.relativeHeight && !slateKernel.relativeHeight) ||
      (this.relativeHeight && !this.relativeHeight.isEqualTo(slateKernel.relativeHeight!))
    ) {
      return false;
    }
    if (!this.signature.equals(slateKernel.signature)) {
      return false;
    }
    if (!this.excess.equals(slateKernel.excess)) {
      return false;
    }
    return true;
  }

  public isComplete(): boolean {
    return !this.signature.equals(Buffer.alloc(Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH));
  }

  public static signatureMessage(
    features: number,
    fee: BigNumber,
    lockHeight: BigNumber,
    relativeHeight: BigNumber | null,
  ): Buffer {
    let data: Buffer;
    switch (features) {
      case SlateKernel.Features.COINBASE:
        data = Buffer.alloc(Uint8Array.BYTES_PER_ELEMENT);
        data.writeUInt8(features, 0);
        break;
      case SlateKernel.Features.PLAIN:
        if (fee.isLessThan(0) || fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid fee");
        }
        data = Buffer.alloc(Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT);
        data.writeUInt8(features, 0);
        Uint64Array.writeBigEndian(data, fee, Uint8Array.BYTES_PER_ELEMENT);
        break;
      case SlateKernel.Features.HEIGHT_LOCKED:
        if (fee.isLessThan(0) || fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid fee");
        }
        if (lockHeight.isLessThan(0) || lockHeight.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid lock height");
        }
        data = Buffer.alloc(
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT,
        );
        data.writeUInt8(features, 0);
        Uint64Array.writeBigEndian(data, fee, Uint8Array.BYTES_PER_ELEMENT);
        Uint64Array.writeBigEndian(
          data,
          lockHeight,
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        break;
      case SlateKernel.Features.NO_RECENT_DUPLICATE:
        if (fee.isLessThan(0) || fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid fee");
        }
        if (relativeHeight!.isLessThan(0) || relativeHeight!.isGreaterThan("0xFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid relative height");
        }
        data = Buffer.alloc(
          Uint8Array.BYTES_PER_ELEMENT +
            Uint64Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT,
        );
        data.writeUInt8(features, 0);
        Uint64Array.writeBigEndian(data, fee, Uint8Array.BYTES_PER_ELEMENT);
        data.writeUInt16BE(
          relativeHeight!.toNumber(),
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        break;
    }
    return Buffer.from(blake2b(blake2b.BYTES).update(data!).digest());
  }

  public static async unserialize(
    serializedSlateKernel: { [key: string]: any } | BitReader,
    slate: Slate,
  ): Promise<SlateKernel> {
    const slateKernel = Object.create(SlateKernel.prototype);
    switch (
      Common.isBigNumber(slate.version) ? (slate.version as BigNumber).toFixed() : slate.version
    ) {
      case "2":
      case "3":
        if (!Common.isPureObject(serializedSlateKernel)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel");
        }
        if (
          !("features" in serializedSlateKernel) ||
          SlateKernel.getTextAsFeatures(serializedSlateKernel.features) ===
            SlateKernel.Features.COINBASE
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel features");
        }
        slateKernel.features = SlateKernel.getTextAsFeatures(serializedSlateKernel.features);
        switch (slateKernel.features) {
          case SlateKernel.Features.PLAIN:
            if (
              !("fee" in serializedSlateKernel) ||
              !Common.isNumberString(serializedSlateKernel.fee) ||
              !new BigNumber(serializedSlateKernel.fee).isInteger() ||
              new BigNumber(serializedSlateKernel.fee).isLessThan(1)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel fee");
            }
            slateKernel.fee = new BigNumber(serializedSlateKernel.fee);
            slateKernel.lockHeight = new BigNumber(0);
            slateKernel.relativeHeight = null;
            break;
          case SlateKernel.Features.HEIGHT_LOCKED:
            if (
              !("fee" in serializedSlateKernel) ||
              !Common.isNumberString(serializedSlateKernel.fee) ||
              !new BigNumber(serializedSlateKernel.fee).isInteger() ||
              new BigNumber(serializedSlateKernel.fee).isLessThan(1)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel fee");
            }
            slateKernel.fee = new BigNumber(serializedSlateKernel.fee);
            if (
              !("lock_height" in serializedSlateKernel) ||
              !Common.isNumberString(serializedSlateKernel.lock_height) ||
              !new BigNumber(serializedSlateKernel.lock_height).isInteger() ||
              new BigNumber(serializedSlateKernel.lock_height).isLessThan(0)
            ) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate kernel lock height",
              );
            }
            slateKernel.lockHeight = new BigNumber(serializedSlateKernel.lock_height);
            slateKernel.relativeHeight = null;
            break;
          case SlateKernel.Features.NO_RECENT_DUPLICATE:
            if (!Consensus.isNoRecentDuplicateKernelsEnabled(slate.cryptocurrency)) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate kernel features",
              );
            }
            if (
              !("fee" in serializedSlateKernel) ||
              !Common.isNumberString(serializedSlateKernel.fee) ||
              !new BigNumber(serializedSlateKernel.fee).isInteger() ||
              new BigNumber(serializedSlateKernel.fee).isLessThan(1)
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel fee");
            }
            slateKernel.fee = new BigNumber(serializedSlateKernel.fee);
            if (
              !("relative_height" in serializedSlateKernel) ||
              !Common.isNumberString(serializedSlateKernel.relative_height) ||
              !new BigNumber(serializedSlateKernel.relative_height).isInteger() ||
              new BigNumber(serializedSlateKernel.relative_height).isLessThan(1) ||
              new BigNumber(serializedSlateKernel.relative_height).isGreaterThan(
                Consensus.getMaximumRelativeHeight(slate.cryptocurrency),
              )
            ) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate kernel relative height",
              );
            }
            slateKernel.relativeHeight = new BigNumber(serializedSlateKernel.relative_height);
            slateKernel.lockHeight = new BigNumber(0);
            break;
          default:
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel features");
        }
        if (
          !("excess_sig" in serializedSlateKernel) ||
          !Common.isHexString(serializedSlateKernel.excess_sig) ||
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.isValidSingleSignerSignature(
              Buffer.from(serializedSlateKernel.excess_sig, "hex"),
            ),
          ))
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel signature");
        }
        {
          slateKernel.signature = await Common.resolveIfPromise(
            Secp256k1Zkp.singleSignerSignatureFromData(
              Buffer.from(serializedSlateKernel.excess_sig, "hex"),
            ),
          );
          if (slateKernel.signature === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate kernel signature",
            );
          }
        }
        if (
          !("excess" in serializedSlateKernel) ||
          !Common.isHexString(serializedSlateKernel.excess) ||
          (!Buffer.from(serializedSlateKernel.excess, "hex").equals(
            Buffer.alloc(Crypto.COMMITMENT_LENGTH),
          ) &&
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidCommit(Buffer.from(serializedSlateKernel.excess, "hex")),
            )))
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel excess");
        }
        slateKernel.excess = Buffer.from(serializedSlateKernel.excess, "hex");
        break;
      case "SP": {
        if (!(serializedSlateKernel instanceof BitReader)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel");
        }
        slateKernel.features = SlateKernel.Features.PLAIN;
        slateKernel.lockHeight = new BigNumber(0);
        slateKernel.relativeHeight = null;
        const bitReader = serializedSlateKernel;
        const fee = SlateUtils.uncompressUint64(bitReader, true);
        if (fee.isLessThan(1)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel fee");
        }
        slateKernel.fee = fee;
        const excess = SlateUtils.uncompressCommitment(bitReader);
        if (
          !excess.equals(Buffer.alloc(Crypto.COMMITMENT_LENGTH)) &&
          !(await Common.resolveIfPromise(Secp256k1Zkp.isValidCommit(excess)))
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel excess");
        }
        slateKernel.excess = excess;
        {
          const signature = SlateUtils.uncompressSingleSignerSignature(bitReader);
          if (
            !(await Common.resolveIfPromise(Secp256k1Zkp.isValidSingleSignerSignature(signature)))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate kernel signature",
            );
          }
          slateKernel.signature = await Common.resolveIfPromise(
            Secp256k1Zkp.singleSignerSignatureFromData(signature),
          );
        }
        if (slateKernel.signature === Secp256k1Zkp.OPERATION_FAILED) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel signature");
        }
        break;
      }
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
    if (slateKernel.isComplete()) {
      if (!(await slateKernel.verifySignature())) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate kernel signature");
      }
    }
    return slateKernel;
  }

  private async verifySignature(): Promise<boolean> {
    let message: Buffer;
    try {
      message = SlateKernel.signatureMessage(
        this.features,
        this.fee,
        this.lockHeight,
        this.relativeHeight,
      );
    } catch (error: any) {
      return false;
    }
    const publicKey = await Common.resolveIfPromise(
      Secp256k1Zkp.pedersenCommitToPublicKey(this.excess),
    );
    if (publicKey === Secp256k1Zkp.OPERATION_FAILED) {
      return false;
    }
    return await Common.resolveIfPromise(
      Secp256k1Zkp.verifySingleSignerSignature(
        this.signature,
        message,
        Secp256k1Zkp.NO_PUBLIC_NONCE,
        publicKey,
        publicKey,
        false,
      ),
    );
  }

  private getFeaturesAsText(): string {
    switch (this.features) {
      case SlateKernel.Features.PLAIN:
        return "Plain";
      case SlateKernel.Features.COINBASE:
        return "Coinbase";
      case SlateKernel.Features.HEIGHT_LOCKED:
        return "HeightLocked";
      case SlateKernel.Features.NO_RECENT_DUPLICATE:
        return "NoRecentDuplicate";
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid slate kernel features");
  }

  private static getTextAsFeatures(text: string): number {
    switch (text) {
      case "Plain":
        return SlateKernel.Features.PLAIN;
      case "Coinbase":
        return SlateKernel.Features.COINBASE;
      case "HeightLocked":
        return SlateKernel.Features.HEIGHT_LOCKED;
      case "NoRecentDuplicate":
        return SlateKernel.Features.NO_RECENT_DUPLICATE;
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid text");
  }
}
