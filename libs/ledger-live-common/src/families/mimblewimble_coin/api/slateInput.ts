import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import blake2b from "blake2b";
import Crypto from "./crypto";
import Common from "./common";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Slate from "./slate";
import BigNumber from "bignumber.js";
import BitReader from "./bitReader";
import BitWriter from "./bitWriter";
import SlateUtils from "./slateUtils";

export default class SlateInput {
  public features: number;
  public commitment: Buffer;

  public static readonly Features = {
    PLAIN: 0,
    COINBASE: 1,
  };

  public constructor(features: number, commitment: Buffer) {
    this.features = features;
    this.commitment = commitment;
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
        return {
          features: this.getFeaturesAsText(),
          commit: this.commitment.toString("hex"),
        };
      case "4":
        if (bitWriter) {
          SlateUtils.writeUint8(bitWriter, this.features);
          SlateUtils.compressCommitment(bitWriter, this.commitment);
        } else {
          let serializedSlateInput: { [key: string]: any } = {
            c: this.commitment.toString("hex"),
          };
          if (this.features !== SlateInput.Features.PLAIN) {
            serializedSlateInput = {
              ...serializedSlateInput,
              f: this.features,
            };
          }
          return serializedSlateInput;
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
  }

  public getTransaction(): {
    features: string;
    commit: string;
  } {
    return {
      features: this.getFeaturesAsText(),
      commit: this.commitment.toString("hex"),
    };
  }

  public getHash(): Buffer {
    if (this.features < 0 || this.features > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid slate features");
    }
    const data = Buffer.alloc(Uint8Array.BYTES_PER_ELEMENT + Crypto.COMMITMENT_LENGTH);
    data.writeUInt8(this.features, 0);
    this.commitment.copy(data, Uint8Array.BYTES_PER_ELEMENT);
    return Buffer.from(blake2b(blake2b.BYTES).update(data).digest());
  }

  public isEqualTo(slateInput: SlateInput): boolean {
    if (this.features !== slateInput.features) {
      return false;
    }
    if (!this.commitment.equals(slateInput.commitment)) {
      return false;
    }
    return true;
  }

  public static async unserialize(
    serializedSlateInput: { [key: string]: any } | BitReader,
    slate: Slate,
  ): Promise<SlateInput> {
    const slateInput = Object.create(SlateInput.prototype);
    switch (
      Common.isBigNumber(slate.version) ? (slate.version as BigNumber).toFixed() : slate.version
    ) {
      case "2":
      case "3":
        if (!Common.isPureObject(serializedSlateInput)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate input");
        }
        if (!("features" in serializedSlateInput)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate input features");
        }
        slateInput.features = SlateInput.getTextAsFeatures(serializedSlateInput.features);
        if (
          !("commit" in serializedSlateInput) ||
          !Common.isHexString(serializedSlateInput.commit) ||
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.isValidCommit(Buffer.from(serializedSlateInput.commit, "hex")),
          ))
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate input commitment");
        }
        slateInput.commitment = Buffer.from(serializedSlateInput.commit, "hex");
        break;
      case "4":
        if (serializedSlateInput instanceof BitReader) {
          const bitReader = serializedSlateInput;
          const features = SlateUtils.readUint8(bitReader);
          if (features < SlateInput.Features.PLAIN || features > SlateInput.Features.COINBASE) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate input features");
          }
          slateInput.features = features;
          const commitment = SlateUtils.uncompressCommitment(bitReader);
          if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidCommit(commitment)))) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate input commitment",
            );
          }
          slateInput.commitment = commitment;
        } else if (Common.isPureObject(serializedSlateInput)) {
          if (
            "f" in serializedSlateInput &&
            (!Common.isBigNumber(serializedSlateInput.f) ||
              serializedSlateInput.f.isLessThan(SlateInput.Features.PLAIN) ||
              serializedSlateInput.f.isGreaterThan(SlateInput.Features.COINBASE))
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate input features");
          }
          slateInput.features =
            "f" in serializedSlateInput
              ? serializedSlateInput.f.toNumber()
              : SlateInput.Features.PLAIN;
          if (
            !("c" in serializedSlateInput) ||
            !Common.isHexString(serializedSlateInput.c) ||
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidCommit(Buffer.from(serializedSlateInput.c, "hex")),
            ))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate input commitment",
            );
          }
          slateInput.commitment = Buffer.from(serializedSlateInput.c, "hex");
        } else {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate input");
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
    return slateInput;
  }

  private getFeaturesAsText(): string {
    switch (this.features) {
      case SlateInput.Features.PLAIN:
        return "Plain";
      case SlateInput.Features.COINBASE:
        return "Coinbase";
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid slate input features");
  }

  private static getTextAsFeatures(text: string): number {
    switch (text) {
      case "Plain":
        return SlateInput.Features.PLAIN;
      case "Coinbase":
        return SlateInput.Features.COINBASE;
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid text");
  }
}
