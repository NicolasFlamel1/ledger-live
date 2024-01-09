import BigNumber from "bignumber.js";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import blake2b from "blake2b";
import Common from "./common";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Slate from "./slate";
import BitReader from "./bitReader";
import BitWriter from "./bitWriter";
import SlateUtils from "./slateUtils";
import Crypto from "./crypto";

export default class SlateParticipant {
  public id: BigNumber;
  public publicBlindExcess: Buffer;
  public publicNonce: Buffer;
  public partialSignature: Buffer | null;
  public message: string | null;
  public messageSignature: Buffer | null;

  public static readonly SENDER_ID = new BigNumber(0);

  public constructor(
    id: BigNumber,
    publicBlindExcess: Buffer,
    publicNonce: Buffer,
    partialSignature: Buffer | null = null,
    message: string | null = null,
    messageSignature: Buffer | null = null,
  ) {
    this.id = id;
    this.publicBlindExcess = publicBlindExcess;
    this.publicNonce = publicNonce;
    this.partialSignature = partialSignature;
    this.message = message;
    this.messageSignature = messageSignature;
  }

  public async serialize(
    slate: Slate,
    bitWriter: BitWriter | null = null,
  ): Promise<{ [key: string]: any } | undefined> {
    switch (
      Common.isBigNumber(slate.version) ? (slate.version as BigNumber).toFixed() : slate.version
    ) {
      case "2":
      case "3":
        return {
          id: this.id.toFixed(),
          public_blind_excess: this.publicBlindExcess.toString("hex"),
          public_nonce: this.publicNonce.toString("hex"),
          message: this.message,
          part_sig: this.partialSignature ? this.partialSignature.toString("hex") : null,
          message_sig: this.messageSignature ? this.messageSignature.toString("hex") : null,
        };
      case "SP":
        SlateUtils.compressSecp256k1PublicKey(bitWriter!, this.publicBlindExcess);
        SlateUtils.compressSecp256k1PublicKey(bitWriter!, this.publicNonce);
        if (this.partialSignature) {
          SlateUtils.compressBoolean(bitWriter!, true);
          SlateUtils.compressSingleSignerSignature(bitWriter!, this.partialSignature);
        } else {
          SlateUtils.compressBoolean(bitWriter!, false);
        }
        if (this.message !== null && this.messageSignature) {
          SlateUtils.compressBoolean(bitWriter!, true);
          await SlateUtils.compressParticipantMessage(bitWriter!, this.message);
          SlateUtils.compressSingleSignerSignature(bitWriter!, this.messageSignature);
        } else {
          SlateUtils.compressBoolean(bitWriter!, false);
        }
        break;
      case "4":
        if (bitWriter) {
          SlateUtils.writeUint8(bitWriter, this.isComplete() ? 1 : 0);
          bitWriter.setBytes(this.publicBlindExcess);
          bitWriter.setBytes(this.publicNonce);
          if (this.isComplete()) {
            const partialSignature = await Common.resolveIfPromise(
              Secp256k1Zkp.uncompactSingleSignerSignature(this.partialSignature!),
            );
            if (partialSignature === Secp256k1Zkp.OPERATION_FAILED) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid slate participant partial signature",
              );
            }
            SlateUtils.compressSingleSignerSignature(bitWriter, partialSignature);
          }
        } else {
          let serializedSlateParticipant: { [key: string]: any } = {
            xs: this.publicBlindExcess.toString("hex"),
            nonce: this.publicNonce.toString("hex"),
          };
          if (this.isComplete()) {
            serializedSlateParticipant = {
              ...serializedSlateParticipant,
              part: this.partialSignature!.toString("hex"),
            };
          }
          return serializedSlateParticipant;
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
  }

  public isSender(): boolean {
    return this.id.isEqualTo(SlateParticipant.SENDER_ID);
  }

  public isComplete(): boolean {
    return !!this.partialSignature;
  }

  public isEqualTo(slateParticipant: SlateParticipant): boolean {
    if (!this.id.isEqualTo(slateParticipant.id)) {
      return false;
    }
    if (!this.publicBlindExcess.equals(slateParticipant.publicBlindExcess)) {
      return false;
    }
    if (!this.publicNonce.equals(slateParticipant.publicNonce)) {
      return false;
    }
    if (this.message !== slateParticipant.message) {
      return false;
    }
    if (
      (!this.partialSignature && slateParticipant.partialSignature) ||
      (this.partialSignature && !slateParticipant.partialSignature) ||
      (this.partialSignature && !this.partialSignature.equals(slateParticipant.partialSignature!))
    ) {
      return false;
    }
    if (
      (!this.messageSignature && slateParticipant.messageSignature) ||
      (this.messageSignature && !slateParticipant.messageSignature) ||
      (this.messageSignature && !this.messageSignature.equals(slateParticipant.messageSignature!))
    ) {
      return false;
    }
    return true;
  }

  public static async unserialize(
    serializedSlateParticipant: { [key: string]: any } | BitReader,
    slate: Slate,
  ): Promise<SlateParticipant> {
    const slateParticipant = Object.create(SlateParticipant.prototype);
    switch (
      Common.isBigNumber(slate.version) ? (slate.version as BigNumber).toFixed() : slate.version
    ) {
      case "2":
      case "3":
        if (!Common.isPureObject(serializedSlateParticipant)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participant");
        }
        if (
          !("id" in serializedSlateParticipant) ||
          !Common.isNumberString(serializedSlateParticipant.id) ||
          !new BigNumber(serializedSlateParticipant.id).isInteger() ||
          new BigNumber(serializedSlateParticipant.id).isLessThan(SlateParticipant.SENDER_ID)
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participant ID");
        }
        slateParticipant.id = new BigNumber(serializedSlateParticipant.id);
        if (
          !("public_blind_excess" in serializedSlateParticipant) ||
          !Common.isHexString(serializedSlateParticipant.public_blind_excess) ||
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.isValidPublicKey(
              Buffer.from(serializedSlateParticipant.public_blind_excess, "hex"),
            ),
          ))
        ) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public blind excess",
          );
        }
        slateParticipant.publicBlindExcess = await Common.resolveIfPromise(
          Secp256k1Zkp.publicKeyFromData(
            Buffer.from(serializedSlateParticipant.public_blind_excess, "hex"),
          ),
        );
        if (slateParticipant.publicBlindExcess === Secp256k1Zkp.OPERATION_FAILED) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public blind excess",
          );
        }
        if (
          !("public_nonce" in serializedSlateParticipant) ||
          !Common.isHexString(serializedSlateParticipant.public_nonce) ||
          !(await Common.resolveIfPromise(
            Secp256k1Zkp.isValidPublicKey(
              Buffer.from(serializedSlateParticipant.public_nonce, "hex"),
            ),
          ))
        ) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public nonce",
          );
        }
        slateParticipant.publicNonce = await Common.resolveIfPromise(
          Secp256k1Zkp.publicKeyFromData(
            Buffer.from(serializedSlateParticipant.public_nonce, "hex"),
          ),
        );
        if (slateParticipant.publicNonce === Secp256k1Zkp.OPERATION_FAILED) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public nonce",
          );
        }
        if (
          !("message" in serializedSlateParticipant) ||
          (serializedSlateParticipant.message !== null &&
            typeof serializedSlateParticipant.message !== "string")
        ) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant message",
          );
        }
        slateParticipant.message = serializedSlateParticipant.message;
        if (
          !("part_sig" in serializedSlateParticipant) ||
          (serializedSlateParticipant.part_sig !== null &&
            (!Common.isHexString(serializedSlateParticipant.part_sig) ||
              !(await Common.resolveIfPromise(
                Secp256k1Zkp.isValidSingleSignerSignature(
                  Buffer.from(serializedSlateParticipant.part_sig, "hex"),
                ),
              ))))
        ) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant partial signature",
          );
        }
        if (serializedSlateParticipant.part_sig !== null) {
          slateParticipant.partialSignature = await Common.resolveIfPromise(
            Secp256k1Zkp.singleSignerSignatureFromData(
              Buffer.from(serializedSlateParticipant.part_sig, "hex"),
            ),
          );
          if (slateParticipant.partialSignature === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant partial signature",
            );
          }
        } else {
          slateParticipant.partialSignature = null;
        }
        if (
          !("message_sig" in serializedSlateParticipant) ||
          (serializedSlateParticipant.message_sig === null && slateParticipant.message !== null) ||
          (serializedSlateParticipant.message_sig !== null &&
            (!Common.isHexString(serializedSlateParticipant.message_sig) ||
              !(await Common.resolveIfPromise(
                Secp256k1Zkp.isValidSingleSignerSignature(
                  Buffer.from(serializedSlateParticipant.message_sig, "hex"),
                ),
              )) ||
              slateParticipant.message === null))
        ) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant message signature",
          );
        }
        if (serializedSlateParticipant.message_sig !== null) {
          slateParticipant.messageSignature = await Common.resolveIfPromise(
            Secp256k1Zkp.singleSignerSignatureFromData(
              Buffer.from(serializedSlateParticipant.message_sig, "hex"),
            ),
          );
          if (slateParticipant.messageSignature === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant message signature",
            );
          }
        } else {
          slateParticipant.messageSignature = null;
        }
        break;
      case "SP": {
        if (!(serializedSlateParticipant instanceof BitReader)) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participant");
        }
        const bitReader = serializedSlateParticipant;
        slateParticipant.id = new BigNumber(slate.participants.length);
        const publicBlindExcess = SlateUtils.uncompressSecp256k1PublicKey(bitReader);
        if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidPublicKey(publicBlindExcess)))) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public blind excess",
          );
        }
        slateParticipant.publicBlindExcess = await Common.resolveIfPromise(
          Secp256k1Zkp.publicKeyFromData(publicBlindExcess),
        );
        if (slateParticipant.publicBlindExcess === Secp256k1Zkp.OPERATION_FAILED) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public blind excess",
          );
        }
        const publicNonce = SlateUtils.uncompressSecp256k1PublicKey(bitReader);
        if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidPublicKey(publicNonce)))) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public nonde",
          );
        }
        slateParticipant.publicNonce = await Common.resolveIfPromise(
          Secp256k1Zkp.publicKeyFromData(publicNonce),
        );
        if (slateParticipant.publicNonce === Secp256k1Zkp.OPERATION_FAILED) {
          throw new MimbleWimbleCoinInvalidParameters(
            "Invalid serialized slate participant public nonce",
          );
        }
        if (SlateUtils.uncompressBoolean(bitReader)) {
          const partialSignature = SlateUtils.uncompressSingleSignerSignature(bitReader);
          if (
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidSingleSignerSignature(partialSignature),
            ))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant partial signature",
            );
          }
          slateParticipant.partialSignature = await Common.resolveIfPromise(
            Secp256k1Zkp.singleSignerSignatureFromData(partialSignature),
          );
          if (slateParticipant.partialSignature === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant partial signature",
            );
          }
        } else {
          slateParticipant.partialSignature = null;
        }
        if (SlateUtils.uncompressBoolean(bitReader)) {
          slateParticipant.message = await SlateUtils.uncompressParticipantMessage(bitReader);
          const messageSignature = SlateUtils.uncompressSingleSignerSignature(bitReader);
          if (
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidSingleSignerSignature(messageSignature),
            ))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant message signature",
            );
          }
          slateParticipant.messageSignature = await Common.resolveIfPromise(
            Secp256k1Zkp.singleSignerSignatureFromData(messageSignature),
          );
          if (slateParticipant.messageSignature === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant message signature",
            );
          }
        } else {
          slateParticipant.message = null;
          slateParticipant.messageSignature = null;
        }
        break;
      }
      case "4":
        slateParticipant.id = new BigNumber(slate.participants.length);
        slateParticipant.message = null;
        slateParticipant.messageSignature = null;
        if (serializedSlateParticipant instanceof BitReader) {
          const bitReader = serializedSlateParticipant;
          const hasPartialSignature = SlateUtils.readUint8(bitReader);
          const publicBlindExcess = bitReader.getBytes(Crypto.SECP256K1_PUBLIC_KEY_LENGTH);
          if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidPublicKey(publicBlindExcess)))) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public blind excess",
            );
          }
          slateParticipant.publicBlindExcess = await Common.resolveIfPromise(
            Secp256k1Zkp.publicKeyFromData(publicBlindExcess),
          );
          if (slateParticipant.publicBlindExcess === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public blind excess",
            );
          }
          const publicNonce = bitReader.getBytes(Crypto.SECP256K1_PUBLIC_KEY_LENGTH);
          if (!(await Common.resolveIfPromise(Secp256k1Zkp.isValidPublicKey(publicNonce)))) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public nonce",
            );
          }
          slateParticipant.publicNonce = await Common.resolveIfPromise(
            Secp256k1Zkp.publicKeyFromData(publicNonce),
          );
          if (slateParticipant.publicNonce === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public nonce",
            );
          }
          if (hasPartialSignature) {
            slateParticipant.partialSignature = await Common.resolveIfPromise(
              Secp256k1Zkp.compactSingleSignerSignature(
                SlateUtils.uncompressSingleSignerSignature(bitReader),
              ),
            );
            if (
              slateParticipant.partialSignature === Secp256k1Zkp.OPERATION_FAILED ||
              !(await Common.resolveIfPromise(
                Secp256k1Zkp.isValidSingleSignerSignature(slateParticipant.partialSignature),
              ))
            ) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate participant partial signature",
              );
            }
          } else {
            slateParticipant.partialSignature = null;
          }
        } else if (Common.isPureObject(serializedSlateParticipant)) {
          if (
            !("xs" in serializedSlateParticipant) ||
            !Common.isHexString(serializedSlateParticipant.xs) ||
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidPublicKey(Buffer.from(serializedSlateParticipant.xs, "hex")),
            ))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public blind excess",
            );
          }
          slateParticipant.publicBlindExcess = await Common.resolveIfPromise(
            Secp256k1Zkp.publicKeyFromData(Buffer.from(serializedSlateParticipant.xs, "hex")),
          );
          if (slateParticipant.publicBlindExcess === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public blind excess",
            );
          }
          if (
            !("nonce" in serializedSlateParticipant) ||
            !Common.isHexString(serializedSlateParticipant.nonce) ||
            !(await Common.resolveIfPromise(
              Secp256k1Zkp.isValidPublicKey(Buffer.from(serializedSlateParticipant.nonce, "hex")),
            ))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public nonce",
            );
          }
          slateParticipant.publicNonce = await Common.resolveIfPromise(
            Secp256k1Zkp.publicKeyFromData(Buffer.from(serializedSlateParticipant.nonce, "hex")),
          );
          if (slateParticipant.publicNonce === Secp256k1Zkp.OPERATION_FAILED) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant public nonce",
            );
          }
          if (
            "part" in serializedSlateParticipant &&
            serializedSlateParticipant.part !== null &&
            (!Common.isHexString(serializedSlateParticipant.part) ||
              !(await Common.resolveIfPromise(
                Secp256k1Zkp.isValidSingleSignerSignature(
                  Buffer.from(serializedSlateParticipant.part, "hex"),
                ),
              )))
          ) {
            throw new MimbleWimbleCoinInvalidParameters(
              "Invalid serialized slate participant partial signature",
            );
          }
          if ("part" in serializedSlateParticipant && serializedSlateParticipant.part !== null) {
            slateParticipant.partialSignature = await Common.resolveIfPromise(
              Secp256k1Zkp.singleSignerSignatureFromData(
                Buffer.from(serializedSlateParticipant.part, "hex"),
              ),
            );
            if (slateParticipant.partialSignature === Secp256k1Zkp.OPERATION_FAILED) {
              throw new MimbleWimbleCoinInvalidParameters(
                "Invalid serialized slate participant partial signature",
              );
            }
          } else {
            slateParticipant.partialSignature = null;
          }
        } else {
          throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate participant");
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid slate version");
    }
    if (slateParticipant.messageSignature) {
      if (!(await slateParticipant.verifyMessageSignature())) {
        throw new MimbleWimbleCoinInvalidParameters(
          "Invalid serialized slate participant message signature",
        );
      }
    }
    return slateParticipant;
  }

  private async verifyMessageSignature(): Promise<boolean> {
    const messageHash = Buffer.from(
      blake2b(blake2b.BYTES).update(Buffer.from(this.message!)).digest(),
    );
    return await Common.resolveIfPromise(
      Secp256k1Zkp.verifySingleSignerSignature(
        this.messageSignature,
        messageHash,
        Secp256k1Zkp.NO_PUBLIC_NONCE,
        this.publicBlindExcess,
        this.publicBlindExcess,
        false,
      ),
    );
  }
}
