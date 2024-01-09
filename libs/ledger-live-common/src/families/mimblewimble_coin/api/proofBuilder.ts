import blake2b from "blake2b";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import Crypto from "./crypto";
import Identifier from "./identifier";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Common from "./common";

export default class ProofBuilder {
  private rewindHash: Buffer;

  private static readonly MESSAGE_START = Buffer.from([0, 0]);
  private static readonly MESSAGE_SWITCH_TYPE_INDEX = ProofBuilder.MESSAGE_START.length;
  private static readonly MESSAGE_IDENTIFIER_INDEX = ProofBuilder.MESSAGE_SWITCH_TYPE_INDEX + 1;
  private static readonly MESSAGE_LENGTH =
    ProofBuilder.MESSAGE_IDENTIFIER_INDEX + Identifier.LENGTH;

  public constructor(rootPublicKey: Buffer | Uint8Array) {
    this.rewindHash = Buffer.from(blake2b(blake2b.BYTES).update(rootPublicKey).digest());
  }

  public async getRewindNonce(commitment: Buffer | Uint8Array): Promise<Buffer> {
    const rewindNonce = Buffer.from(
      blake2b(blake2b.BYTES, commitment).update(this.rewindHash).digest(),
    );
    if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidSecretKey(rewindNonce)))) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid commitment");
    }
    return rewindNonce;
  }

  public static decodeMessage(message: Buffer): {
    identifier: Identifier;
    switchType: number;
  } {
    if (
      message.length !== ProofBuilder.MESSAGE_LENGTH ||
      !Common.subarray(message, 0, ProofBuilder.MESSAGE_START.length).equals(
        ProofBuilder.MESSAGE_START,
      )
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid message");
    }
    const switchType = message.readUInt8(ProofBuilder.MESSAGE_SWITCH_TYPE_INDEX);
    if (switchType !== Crypto.SwitchType.NONE && switchType !== Crypto.SwitchType.REGULAR) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid message switch type");
    }
    const identifier = new Identifier(
      Common.subarray(message, ProofBuilder.MESSAGE_IDENTIFIER_INDEX),
    );
    return {
      identifier,
      switchType,
    };
  }

  public static encodeMessage(identifier: Identifier, switchType: number): Buffer {
    if (switchType < 0 || switchType > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid switchType");
    }
    const message = Buffer.alloc(ProofBuilder.MESSAGE_LENGTH);
    message.writeUInt8(switchType, ProofBuilder.MESSAGE_SWITCH_TYPE_INDEX);
    identifier.serialize().copy(message, ProofBuilder.MESSAGE_IDENTIFIER_INDEX);
    return message;
  }
}
