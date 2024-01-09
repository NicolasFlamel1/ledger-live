import Common from "./common";
import BitReader from "./bitReader";
import BitWriter from "./bitWriter";
import BigNumber from "bignumber.js";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import Mqs from "./mqs";
import Tor from "./tor";
import Crypto from "./crypto";
import Smaz from "@nicolasflamel/smaz";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Uint64Array from "./uint64Array";

export default class SlateUtils {
  private static readonly COMPRESSED_PURPOSE_LENGTH = 3;
  private static readonly COMPRESSED_ID_LENGTH = 16 * Common.BITS_IN_A_BYTE;
  private static readonly COMPRESSED_BOOLEAN_LENGTH = 1;
  private static readonly COMPRESSED_NUMBER_OF_HUNDREDS_LENGTH = 3;
  private static readonly COMPRESSED_NUMBER_OF_DIGITS_LENGTH = 6;
  private static readonly COMPRESSED_HUNDREDS_SCALING_FACTOR = 100;
  private static readonly COMPRESSED_SECP256K1_PUBLIC_KEY_NUMBER_OF_BYTES_LENGTH = 7;
  private static readonly COMPRESSED_PARTICIPANT_MESSAGE_NUMBER_OF_BYTES_LENGTH = 16;
  private static readonly COMPRESSED_PAYMENT_PROOF_SIGNATURE_NUMBER_OF_BYTES_LENGTH = 4;
  private static readonly COMPRESSED_PROOF_NUMBER_OF_BYTES_LENGTH = 10;

  private constructor() {}

  public static uncompressPurpose(bitReader: BitReader): number {
    return bitReader.getBits(SlateUtils.COMPRESSED_PURPOSE_LENGTH);
  }

  public static compressPurpose(bitWriter: BitWriter, purpose: number) {
    if (purpose >= Math.pow(2, SlateUtils.COMPRESSED_PURPOSE_LENGTH)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid purpose");
    }
    bitWriter.setBits(purpose, SlateUtils.COMPRESSED_PURPOSE_LENGTH);
  }

  public static uncompressId(bitReader: BitReader): string {
    const data = bitReader.getBytes(SlateUtils.COMPRESSED_ID_LENGTH / Common.BITS_IN_A_BYTE);
    const variant = data.readUInt8(Common.UUID_DATA_VARIANT_OFFSET) >>> 4;
    if ((variant & Common.UUID_VARIANT_TWO_BITMASK) === Common.UUID_VARIANT_TWO_BITMASK_RESULT) {
      data.subarray(0, Uint32Array.BYTES_PER_ELEMENT).reverse();
      data
        .subarray(
          Uint32Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
        )
        .reverse();
      data
        .subarray(
          Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT,
        )
        .reverse();
    }
    return `${Common.subarray(data, 0, Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH).toString(
      "hex",
    )}-${Common.subarray(
      data,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH + Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH,
    ).toString("hex")}-${Common.subarray(
      data,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH + Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH +
        Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH +
        Common.UUID_THIRD_SECTION_SERIALIZED_LENGTH,
    ).toString("hex")}-${Common.subarray(
      data,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH +
        Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH +
        Common.UUID_THIRD_SECTION_SERIALIZED_LENGTH,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH +
        Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH +
        Common.UUID_THIRD_SECTION_SERIALIZED_LENGTH +
        Common.UUID_FOURTH_SECTION_SERIALIZED_LENGTH,
    ).toString("hex")}-${Common.subarray(
      data,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH +
        Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH +
        Common.UUID_THIRD_SECTION_SERIALIZED_LENGTH +
        Common.UUID_FOURTH_SECTION_SERIALIZED_LENGTH,
      Common.UUID_FIRST_SECTION_SERIALIZED_LENGTH +
        Common.UUID_SECOND_SECTION_SERIALIZED_LENGTH +
        Common.UUID_THIRD_SECTION_SERIALIZED_LENGTH +
        Common.UUID_FOURTH_SECTION_SERIALIZED_LENGTH +
        Common.UUID_FIFTH_SECTION_SERIALIZED_LENGTH,
    ).toString("hex")}`;
  }

  public static compressId(bitWriter: BitWriter, id: string) {
    const data = Buffer.from(id.replaceAll("-", ""), "hex");
    if (data.length !== SlateUtils.COMPRESSED_ID_LENGTH / Common.BITS_IN_A_BYTE) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid ID");
    }
    const variant = data.readUInt8(Common.UUID_DATA_VARIANT_OFFSET) >>> 4;
    if ((variant & Common.UUID_VARIANT_TWO_BITMASK) === Common.UUID_VARIANT_TWO_BITMASK_RESULT) {
      data.subarray(0, Uint32Array.BYTES_PER_ELEMENT).reverse();
      data
        .subarray(
          Uint32Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
        )
        .reverse();
      data
        .subarray(
          Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT,
        )
        .reverse();
    }
    bitWriter.setBytes(data);
  }

  public static uncompressBoolean(bitReader: BitReader): boolean {
    return !!bitReader.getBits(SlateUtils.COMPRESSED_BOOLEAN_LENGTH);
  }

  public static compressBoolean(bitWriter: BitWriter, value: boolean) {
    bitWriter.setBits(value ? 1 : 0, SlateUtils.COMPRESSED_BOOLEAN_LENGTH);
  }

  public static uncompressUint64(bitReader: BitReader, hasHundreds: boolean): BigNumber {
    const numberOfhundreds = hasHundreds
      ? bitReader.getBits(SlateUtils.COMPRESSED_NUMBER_OF_HUNDREDS_LENGTH)
      : 0;
    const numberOfDigits = bitReader.getBits(SlateUtils.COMPRESSED_NUMBER_OF_DIGITS_LENGTH) + 1;
    const digitBytes = Buffer.alloc(1 + Math.floor((numberOfDigits - 1) / Common.BITS_IN_A_BYTE));
    for (let i = 0, j: number = numberOfDigits; j > 0; ++i, j -= Common.BITS_IN_A_BYTE) {
      digitBytes.writeUInt8(bitReader.getBits(Math.min(j, Common.BITS_IN_A_BYTE)), i);
    }
    if (numberOfDigits > Common.BITS_IN_A_BYTE && numberOfDigits % Common.BITS_IN_A_BYTE) {
      for (let i: number = digitBytes.length - 1; i >= 0; --i) {
        if (i !== digitBytes.length - 1) {
          digitBytes.writeUInt8(
            digitBytes.readUInt8(i) >>>
              (Common.BITS_IN_A_BYTE - (numberOfDigits % Common.BITS_IN_A_BYTE)),
            i,
          );
        }
        if (i) {
          digitBytes.writeUInt8(
            (digitBytes.readUInt8(i) |
              (digitBytes.readUInt8(i - 1) << numberOfDigits % Common.BITS_IN_A_BYTE)) &
              0xff,
            i,
          );
        }
      }
    }
    let result: BigNumber = new BigNumber(`0x${digitBytes.toString("hex")}`);
    for (let i = 0; i < numberOfhundreds; ++i) {
      result = result.multipliedBy(SlateUtils.COMPRESSED_HUNDREDS_SCALING_FACTOR);
    }
    return result;
  }

  public static compressUint64(bitWriter: BitWriter, value: BigNumber, hasHundreds: boolean) {
    let reducedValue = new BigNumber(value);
    let numberOfhundreds = 0;
    if (hasHundreds) {
      while (
        reducedValue.modulo(SlateUtils.COMPRESSED_HUNDREDS_SCALING_FACTOR).isZero() &&
        numberOfhundreds < Math.pow(2, SlateUtils.COMPRESSED_NUMBER_OF_HUNDREDS_LENGTH) - 1
      ) {
        reducedValue = reducedValue.dividedToIntegerBy(
          SlateUtils.COMPRESSED_HUNDREDS_SCALING_FACTOR,
        );
        ++numberOfhundreds;
      }
    }
    let numberOfDigits = 1;
    for (
      let i: BigNumber = new BigNumber(1);
      numberOfDigits < Math.pow(2, SlateUtils.COMPRESSED_NUMBER_OF_DIGITS_LENGTH) &&
      i.isLessThan(reducedValue);
      i = i.multipliedBy(2)
    ) {
      ++numberOfDigits;
    }
    if (hasHundreds) {
      bitWriter.setBits(numberOfhundreds, SlateUtils.COMPRESSED_NUMBER_OF_HUNDREDS_LENGTH);
    }
    bitWriter.setBits(numberOfDigits - 1, SlateUtils.COMPRESSED_NUMBER_OF_DIGITS_LENGTH);
    if (reducedValue.isLessThan(0) || reducedValue.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid uint64 value");
    }
    let bytes: Buffer = Buffer.alloc(Uint64Array.BYTES_PER_ELEMENT);
    Uint64Array.writeBigEndian(bytes, reducedValue, 0);
    bytes = Common.subarray(
      bytes,
      bytes.length - Math.ceil(numberOfDigits / Common.BITS_IN_A_BYTE),
    );
    for (let i = 0; i < bytes.length; ++i) {
      if (numberOfDigits % Common.BITS_IN_A_BYTE) {
        if (i !== bytes.length - 1) {
          bytes.writeUInt8(
            (bytes.readUInt8(i) <<
              (Common.BITS_IN_A_BYTE - (numberOfDigits % Common.BITS_IN_A_BYTE))) &
              0xff,
            i,
          );
          bytes.writeUInt8(
            bytes.readUInt8(i) |
              (bytes.readUInt8(i + 1) >>> numberOfDigits % Common.BITS_IN_A_BYTE),
            i,
          );
          bitWriter.setBits(bytes.readUInt8(i), Common.BITS_IN_A_BYTE);
        } else {
          bitWriter.setBits(bytes.readUInt8(i), numberOfDigits % Common.BITS_IN_A_BYTE);
        }
      } else {
        bitWriter.setBits(bytes.readUInt8(i), Common.BITS_IN_A_BYTE);
      }
    }
  }

  public static async uncompressPaymentProofAddress(
    bitReader: BitReader,
    cryptocurrency: CryptoCurrency,
  ): Promise<string> {
    if (SlateUtils.uncompressBoolean(bitReader)) {
      return await Mqs.publicKeyToMqsAddress(
        SlateUtils.uncompressSecp256k1PublicKey(bitReader),
        cryptocurrency,
      );
    } else {
      return Tor.publicKeyToTorAddress(bitReader.getBytes(Crypto.ED25519_PUBLIC_KEY_LENGTH));
    }
  }

  public static async compressPaymentProofAddress(
    bitWriter: BitWriter,
    paymentProofAddress: string,
    cryptocurrency: CryptoCurrency,
  ) {
    switch (paymentProofAddress.length) {
      case Mqs.ADDRESS_LENGTH:
        SlateUtils.compressBoolean(bitWriter, true);
        SlateUtils.compressSecp256k1PublicKey(
          bitWriter,
          await Mqs.mqsAddressToPublicKey(paymentProofAddress, cryptocurrency),
        );
        break;
      case Tor.ADDRESS_LENGTH:
        SlateUtils.compressBoolean(bitWriter, false);
        bitWriter.setBytes(Tor.torAddressToPublicKey(paymentProofAddress));
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid payment proof address");
    }
  }

  public static uncompressSecp256k1PublicKey(bitReader: BitReader): Buffer {
    const numberOfBytes = bitReader.getBits(
      SlateUtils.COMPRESSED_SECP256K1_PUBLIC_KEY_NUMBER_OF_BYTES_LENGTH,
    );
    return bitReader.getBytes(numberOfBytes);
  }

  public static compressSecp256k1PublicKey(bitWriter: BitWriter, publicKey: Buffer) {
    if (
      publicKey.length >=
      Math.pow(2, SlateUtils.COMPRESSED_SECP256K1_PUBLIC_KEY_NUMBER_OF_BYTES_LENGTH)
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid secp256k1 public key");
    }
    bitWriter.setBits(
      publicKey.length,
      SlateUtils.COMPRESSED_SECP256K1_PUBLIC_KEY_NUMBER_OF_BYTES_LENGTH,
    );
    bitWriter.setBytes(publicKey);
  }

  public static uncompressSingleSignerSignature(bitReader: BitReader): Buffer {
    return bitReader.getBytes(Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH);
  }

  public static compressSingleSignerSignature(bitWriter: BitWriter, singleSignerSignature: Buffer) {
    if (singleSignerSignature.length !== Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid single-signer signature");
    }
    bitWriter.setBytes(singleSignerSignature);
  }

  public static async uncompressParticipantMessage(bitReader: BitReader): Promise<string> {
    const numberOfBytes = bitReader.getBits(
      SlateUtils.COMPRESSED_PARTICIPANT_MESSAGE_NUMBER_OF_BYTES_LENGTH,
    );
    const message = await Common.resolveIfPromise(
      Smaz.decompress(bitReader.getBytes(numberOfBytes)),
    );
    if (message === Smaz.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid participant message");
    }
    return message.toString();
  }

  public static async compressParticipantMessage(bitWriter: BitWriter, message: string) {
    const compressedMessage = await Common.resolveIfPromise(Smaz.compress(Buffer.from(message)));
    if (compressedMessage === Smaz.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid participant message");
    }
    if (
      compressedMessage.length >=
      Math.pow(2, SlateUtils.COMPRESSED_PARTICIPANT_MESSAGE_NUMBER_OF_BYTES_LENGTH)
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid participant message");
    }
    bitWriter.setBits(
      compressedMessage.length,
      SlateUtils.COMPRESSED_PARTICIPANT_MESSAGE_NUMBER_OF_BYTES_LENGTH,
    );
    bitWriter.setBytes(compressedMessage);
  }

  public static uncompressOffset(bitReader: BitReader): Buffer {
    return bitReader.getBytes(Crypto.SECP256K1_PRIVATE_KEY_LENGTH);
  }

  public static compressOffset(bitWriter: BitWriter, offset: Buffer) {
    if (offset.length !== Crypto.SECP256K1_PRIVATE_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid offset");
    }
    bitWriter.setBytes(offset);
  }

  public static uncompressPaymentProofSignature(bitReader: BitReader): Buffer {
    const numberOfBytes =
      bitReader.getBits(SlateUtils.COMPRESSED_PAYMENT_PROOF_SIGNATURE_NUMBER_OF_BYTES_LENGTH) +
      Crypto.ED25519_SIGNATURE_LENGTH;
    return bitReader.getBytes(numberOfBytes);
  }

  public static compressPaymentProofSignature(bitWriter: BitWriter, paymentProofSignature: Buffer) {
    if (
      paymentProofSignature.length < Crypto.ED25519_SIGNATURE_LENGTH ||
      paymentProofSignature.length - Crypto.ED25519_SIGNATURE_LENGTH >=
        Math.pow(2, SlateUtils.COMPRESSED_PAYMENT_PROOF_SIGNATURE_NUMBER_OF_BYTES_LENGTH)
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid payment proof signature");
    }
    bitWriter.setBits(
      paymentProofSignature.length - Crypto.ED25519_SIGNATURE_LENGTH,
      SlateUtils.COMPRESSED_PAYMENT_PROOF_SIGNATURE_NUMBER_OF_BYTES_LENGTH,
    );
    bitWriter.setBytes(paymentProofSignature);
  }

  public static uncompressCommitment(bitReader: BitReader): Buffer {
    return bitReader.getBytes(Crypto.COMMITMENT_LENGTH);
  }

  public static compressCommitment(bitWriter: BitWriter, commitment: Buffer) {
    if (commitment.length !== Crypto.COMMITMENT_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid commitment");
    }
    bitWriter.setBytes(commitment);
  }

  public static uncompressProof(bitReader: BitReader): Buffer {
    const numberOfBytes = bitReader.getBits(SlateUtils.COMPRESSED_PROOF_NUMBER_OF_BYTES_LENGTH);
    return bitReader.getBytes(numberOfBytes);
  }

  public static compressProof(bitWriter: BitWriter, proof: Buffer) {
    if (proof.length >= Math.pow(2, SlateUtils.COMPRESSED_PROOF_NUMBER_OF_BYTES_LENGTH)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid proof");
    }
    bitWriter.setBits(proof.length, SlateUtils.COMPRESSED_PROOF_NUMBER_OF_BYTES_LENGTH);
    bitWriter.setBytes(proof);
  }

  public static readUint8(bitReader: BitReader): number {
    return bitReader.getBits(Common.BITS_IN_A_BYTE);
  }

  public static writeUint8(bitWriter: BitWriter, value: number) {
    if (value < 0 || value > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid uint8 value");
    }
    bitWriter.setBits(value, Common.BITS_IN_A_BYTE);
  }

  public static readUint16(bitReader: BitReader): number {
    return bitReader.getBytes(Uint16Array.BYTES_PER_ELEMENT).readUInt16BE(0);
  }

  public static writeUint16(bitWriter: BitWriter, value: number) {
    if (value < 0 || value > 0xffff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid uint16 value");
    }
    const buffer = Buffer.alloc(Uint16Array.BYTES_PER_ELEMENT);
    buffer.writeUInt16BE(value, 0);
    bitWriter.setBytes(buffer);
  }

  public static readUint32(bitReader: BitReader): number {
    return bitReader.getBytes(Uint32Array.BYTES_PER_ELEMENT).readUInt32BE(0);
  }

  public static writeUint32(bitWriter: BitWriter, value: number) {
    if (value < 0 || value > 0xffffffff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid uint32 value");
    }
    const buffer = Buffer.alloc(Uint32Array.BYTES_PER_ELEMENT);
    buffer.writeUInt32BE(value, 0);
    bitWriter.setBytes(buffer);
  }

  public static readUint64(bitReader: BitReader): BigNumber {
    return Uint64Array.readBigEndian(bitReader.getBytes(Uint64Array.BYTES_PER_ELEMENT));
  }

  public static writeUint64(bitWriter: BitWriter, value: BigNumber) {
    if (value.isLessThan(0) || value.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid uint64 value");
    }
    const buffer = Buffer.alloc(Uint64Array.BYTES_PER_ELEMENT);
    Uint64Array.writeBigEndian(buffer, value, 0);
    bitWriter.setBytes(buffer);
  }
}
