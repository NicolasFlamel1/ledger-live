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

export default class SlateOutput {
  public features: number;
  public commitment: Buffer;
  public proof: Buffer;

  public static readonly Features = {
    PLAIN: 0,
    COINBASE: 1,
  };

  public constructor(features: number, commitment: Buffer, proof: Buffer) {
    this.features = features;
    this.commitment = commitment;
    this.proof = proof;
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
          proof: this.proof.toString("hex"),
        };
      case "SP":
        SlateUtils.compressCommitment(bitWriter!, this.commitment);
        SlateUtils.compressProof(bitWriter!, this.proof);
        break;
      case "4":
        if (bitWriter) {
          SlateUtils.writeUint8(bitWriter, this.features);
          SlateUtils.compressCommitment(bitWriter, this.commitment);
          SlateUtils.writeUint64(bitWriter, new BigNumber(this.proof.length));
          bitWriter.setBytes(this.proof);
        } else {
          let serializedSlateOutput: { [key: string]: any } = {
            c: this.commitment.toString("hex"),
            p: this.proof.toString("hex"),
          };
          if (this.features !== SlateOutput.Features.PLAIN) {
            serializedSlateOutput = {
              ...serializedSlateOutput,
              f: this.features,
            };
          }
          return serializedSlateOutput;
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
  }

  public getTransaction(): {
    features: string;
    commit: string;
    proof: string;
  } {
    return {
      features: this.getFeaturesAsText(),
      commit: this.commitment.toString("hex"),
      proof: this.proof.toString("hex"),
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

  public isEqualTo(slateOutput: SlateOutput): boolean {
    if (this.features !== slateOutput.features) {
      return false;
    }
    if (!this.commitment.equals(slateOutput.commitment)) {
      return false;
    }
    if (!this.proof.equals(slateOutput.proof)) {
      return false;
    }
    return true;
  }

  public static async unserialize(
    serializedSlateOutput: { [key: string]: any } | BitReader,
    slate: Slate,
  ): Promise<SlateOutput> {
    const slateOutput = Object.create(SlateOutput.prototype);
    switch (
      Common.isBigNumber(slate.version) ? (slate.version as BigNumber).toFixed() : slate.version
    ) {
      case "2":
      case "3":
        if (!Common.isPureObject(serializedSlateOutput)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output");
        }
        if (
          !("features" in serializedSlateOutput) ||
          SlateOutput.getTextAsFeatures(serializedSlateOutput.features) ===
            SlateOutput.Features.COINBASE
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output features");
        }
        slateOutput.features = SlateOutput.getTextAsFeatures(serializedSlateOutput.features);
        if (
          !("commit" in serializedSlateOutput) ||
          !Common.isHexString(serializedSlateOutput.commit) ||
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.isValidCommit(Buffer.from(serializedSlateOutput.commit, "hex")),
          ))
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output commitment");
        }
        slateOutput.commitment = Buffer.from(serializedSlateOutput.commit, "hex");
        if (
          !("proof" in serializedSlateOutput) ||
          !Common.isHexString(serializedSlateOutput.proof) ||
          Buffer.from(serializedSlateOutput.proof, "hex").length !== Crypto.BULLETPROOF_LENGTH
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output proof");
        }
        slateOutput.proof = Buffer.from(serializedSlateOutput.proof, "hex");
        break;
      case "SP": {
        if (!(serializedSlateOutput instanceof BitReader)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output");
        }
        slateOutput.features = SlateOutput.Features.PLAIN;
        const bitReader = serializedSlateOutput;
        const commitment = SlateUtils.uncompressCommitment(bitReader);
        if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidCommit(commitment)))) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output commitment");
        }
        slateOutput.commitment = commitment;
        const proof = SlateUtils.uncompressProof(bitReader);
        if (proof.length !== Crypto.BULLETPROOF_LENGTH) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output proof");
        }
        slateOutput.proof = proof;
        break;
      }
      case "4":
        if (serializedSlateOutput instanceof BitReader) {
          const bitReader = serializedSlateOutput;
          const features = SlateUtils.readUint8(bitReader);
          if (features !== SlateOutput.Features.PLAIN) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output features");
          }
          slateOutput.features = features;
          const commitment = SlateUtils.uncompressCommitment(bitReader);
          if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidCommit(commitment)))) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate output commitment",
            );
          }
          slateOutput.commitment = commitment;
          const proofLength = SlateUtils.readUint64(bitReader);
          if (!proofLength.isEqualTo(Crypto.BULLETPROOF_LENGTH)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output proof");
          }
          slateOutput.proof = bitReader.getBytes(proofLength.toNumber());
        } else if (Common.isPureObject(serializedSlateOutput)) {
          if (
            "f" in serializedSlateOutput &&
            (!Common.isBigNumber(serializedSlateOutput.f) ||
              !serializedSlateOutput.f.isEqualTo(SlateOutput.Features.PLAIN))
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output features");
          }
          slateOutput.features =
            "f" in serializedSlateOutput
              ? serializedSlateOutput.f.toNumber()
              : SlateOutput.Features.PLAIN;
          if (
            !("c" in serializedSlateOutput) ||
            !Common.isHexString(serializedSlateOutput.c) ||
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidCommit(Buffer.from(serializedSlateOutput.c, "hex")),
            ))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate output commitment",
            );
          }
          slateOutput.commitment = Buffer.from(serializedSlateOutput.c, "hex");
          if (
            !("p" in serializedSlateOutput) ||
            !Common.isHexString(serializedSlateOutput.p) ||
            Buffer.from(serializedSlateOutput.p, "hex").length !== Crypto.BULLETPROOF_LENGTH
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output proof");
          }
          slateOutput.proof = Buffer.from(serializedSlateOutput.p, "hex");
        } else {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output");
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
    if (!(await slateOutput.verifyProof())) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate output proof");
    }
    return slateOutput;
  }

  private async verifyProof(): Promise<boolean> {
    return await Common.resolveIfPromise(
      Secp256k1Zkp.verifyBulletproof(this.proof, this.commitment, Buffer.alloc(0)),
    );
  }

  private getFeaturesAsText(): string {
    switch (this.features) {
      case SlateOutput.Features.PLAIN:
        return "Plain";
      case SlateOutput.Features.COINBASE:
        return "Coinbase";
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid slate output features");
  }

  private static getTextAsFeatures(text: string): number {
    switch (text) {
      case "Plain":
        return SlateOutput.Features.PLAIN;
      case "Coinbase":
        return SlateOutput.Features.COINBASE;
    }
    throw new MimbleWimbleCoinInvalidParameters("Invalid text");
  }
}
