import bech32 from "bech32";
import Crypto from "./crypto";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import bs58 from "bs58";
import shajs from "sha.js";
import CRC32 from "crc-32";
import { Account } from "@ledgerhq/types-live";
import Tor from "./tor";
import MimbleWimbleCoin from "../hw-app-mimblewimble-coin";
import Age from "./age";
import Common from "./common";
import Uint64Array from "./uint64Array";
import BigNumber from "bignumber.js";

export default class Slatepack {
  private static readonly DATA_CHECKSUM_LENGTH = 4;
  private static readonly WORD_LENGTH = 15;
  private static readonly WORDS_PER_LINE = 200;
  private static readonly TransferMode = {
    PLAIN_TEXT: 0,
    AGE_ENCRYPTED: 1,
  };

  private constructor() {}

  public static slatepackAddressToPublicKey(
    slatepackAddress: string,
    cryptocurrency: CryptoCurrency,
  ): Buffer {
    const decodedAddress = bech32.decode(slatepackAddress);
    const bytes = bech32.fromWords(decodedAddress.words);
    if (bytes.length !== Crypto.ED25519_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack address");
    }
    if (decodedAddress.prefix !== Slatepack.getAddressHumanReadablePart(cryptocurrency)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack address");
    }
    return Buffer.from(bytes);
  }

  public static publicKeyToSlatepackAddress(
    publicKey: Buffer,
    cryptocurrency: CryptoCurrency,
  ): string {
    if (publicKey.length !== Crypto.ED25519_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid public key");
    }
    return bech32.encode(
      Slatepack.getAddressHumanReadablePart(cryptocurrency),
      bech32.toWords(publicKey),
    );
  }

  public static isSlatepack(slatepack: string, cryptocurrency: CryptoCurrency): boolean {
    if (typeof slatepack !== "string") {
      return false;
    }
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        if (
          (slatepack.startsWith("BEGINSLATE_BIN. ") && slatepack.endsWith(". ENDSLATE_BIN.")) ||
          (slatepack.startsWith("BEGINSLATEPACK. ") && slatepack.endsWith(". ENDSLATEPACK."))
        ) {
          return true;
        }
        break;
      case "grin":
      case "grin_testnet":
        if (slatepack.startsWith("BEGINSLATEPACK. ") && slatepack.endsWith(". ENDSLATEPACK.")) {
          return true;
        }
        break;
    }
    return false;
  }

  public static async decode(
    account: Account,
    slatepack: string,
    mimbleWimbleCoin: MimbleWimbleCoin,
    encryptionExpected: boolean | null = null,
  ): Promise<{
    serializedSlate: Buffer;
    senderAddress: string | null;
  }> {
    if (typeof slatepack !== "string") {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
    }
    let payload: string;
    let isEncrypted: boolean;
    switch (account.currency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        if (slatepack.startsWith("BEGINSLATE_BIN. ") && slatepack.endsWith(". ENDSLATE_BIN.")) {
          if (encryptionExpected === true) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          payload = slatepack
            .substring("BEGINSLATE_BIN. ".length, slatepack.length - ". ENDSLATE_BIN.".length)
            .replace(/[ \n\r]/gu, "");
          isEncrypted = false;
        } else if (
          slatepack.startsWith("BEGINSLATEPACK. ") &&
          slatepack.endsWith(". ENDSLATEPACK.")
        ) {
          if (encryptionExpected === false) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          payload = slatepack
            .substring("BEGINSLATEPACK. ".length, slatepack.length - ". ENDSLATEPACK.".length)
            .replace(/[ \n\r]/gu, "");
          isEncrypted = true;
        } else {
          throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
        }
        break;
      case "grin":
      case "grin_testnet":
        if (slatepack.startsWith("BEGINSLATEPACK. ") && slatepack.endsWith(". ENDSLATEPACK.")) {
          payload = slatepack
            .substring("BEGINSLATEPACK. ".length, slatepack.length - ". ENDSLATEPACK.".length)
            .replace(/[ \n\r]/gu, "");
        } else {
          throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
        }
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
    const decodedPayload = bs58.decode(payload);
    if (decodedPayload.length < Slatepack.DATA_CHECKSUM_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
    }
    const dataChecksum = Common.subarray(decodedPayload, 0, Slatepack.DATA_CHECKSUM_LENGTH);
    const data = Common.subarray(decodedPayload, Slatepack.DATA_CHECKSUM_LENGTH);
    const expectedDataChecksum = Common.subarray(
      new shajs.sha256().update(new shajs.sha256().update(data).digest()).digest(),
      0,
      Slatepack.DATA_CHECKSUM_LENGTH,
    );
    if (!dataChecksum.equals(expectedDataChecksum)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
    }
    switch (account.currency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        if (isEncrypted!) {
          if (
            data.length <
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH +
              Uint16Array.BYTES_PER_ELEMENT
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const version = data.readUInt8(0);
          const senderPublicKey = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT,
            Uint8Array.BYTES_PER_ELEMENT + Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          let senderAddress: string;
          try {
            senderAddress = Tor.publicKeyToTorAddress(senderPublicKey);
          } catch (error: any) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const recipientPublicKey = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT + Crypto.ED25519_PUBLIC_KEY_LENGTH,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          let recipientAddress: string;
          try {
            recipientAddress = Tor.publicKeyToTorAddress(recipientPublicKey);
          } catch (error: any) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          if (recipientAddress !== account.freshAddresses[0].address) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const nonce = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH,
          );
          const length = data.readUInt16BE(
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH,
          );
          if (
            length !==
            data.length -
              Uint8Array.BYTES_PER_ELEMENT -
              Crypto.ED25519_PUBLIC_KEY_LENGTH -
              Crypto.ED25519_PUBLIC_KEY_LENGTH -
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH -
              Uint16Array.BYTES_PER_ELEMENT
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const encryptedSlatepackData = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH +
              Uint16Array.BYTES_PER_ELEMENT,
          );
          const decryptedSlatepackData = await mimbleWimbleCoin.decryptSlatepackData(
            account.freshAddresses[0].derivationPath,
            nonce,
            encryptedSlatepackData,
            senderAddress,
          );
          if (decryptedSlatepackData.length < Int32Array.BYTES_PER_ELEMENT) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const expectedChecksum = decryptedSlatepackData.readInt32BE(
            decryptedSlatepackData.length - Int32Array.BYTES_PER_ELEMENT,
          );
          const serializedSlate = Common.subarray(
            decryptedSlatepackData,
            0,
            decryptedSlatepackData.length - Int32Array.BYTES_PER_ELEMENT,
          );
          const buffer = Buffer.alloc(
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              serializedSlate.length,
          );
          buffer.writeUInt8(version, 0);
          senderPublicKey.copy(buffer, Uint8Array.BYTES_PER_ELEMENT);
          recipientPublicKey.copy(
            buffer,
            Uint8Array.BYTES_PER_ELEMENT + Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          serializedSlate.copy(
            buffer,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          const checksum = CRC32.buf(buffer);
          if (expectedChecksum !== checksum) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          return {
            serializedSlate,
            senderAddress,
          };
        } else {
          if (data.length < Uint8Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const length = data.readUInt16BE(Uint8Array.BYTES_PER_ELEMENT);
          if (
            length !==
            data.length - Uint8Array.BYTES_PER_ELEMENT - Uint16Array.BYTES_PER_ELEMENT
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const serializedSlate = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
          );
          return {
            serializedSlate,
            senderAddress: null,
          };
        }
      case "grin":
      case "grin_testnet": {
        if (
          data.length <
          Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT +
            Uint32Array.BYTES_PER_ELEMENT
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
        }
        const transferMode = data.readUInt8(
          Uint8Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
        );
        switch (transferMode) {
          case Slatepack.TransferMode.PLAIN_TEXT:
            if (encryptionExpected === true) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
            }
            isEncrypted = false;
            break;
          case Slatepack.TransferMode.AGE_ENCRYPTED:
            if (encryptionExpected === false) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
            }
            isEncrypted = true;
            break;
          default:
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
        }
        const optionalFieldsLength = data.readUInt32BE(
          Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT,
        );
        if (
          data.length <
          Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT +
            Uint32Array.BYTES_PER_ELEMENT +
            optionalFieldsLength +
            Uint64Array.BYTES_PER_ELEMENT
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
        }
        const length = Uint64Array.readBigEndian(
          data,
          Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint8Array.BYTES_PER_ELEMENT +
            Uint16Array.BYTES_PER_ELEMENT +
            Uint32Array.BYTES_PER_ELEMENT +
            optionalFieldsLength,
        );
        if (
          !length.isEqualTo(
            data.length -
              Uint8Array.BYTES_PER_ELEMENT -
              Uint8Array.BYTES_PER_ELEMENT -
              Uint8Array.BYTES_PER_ELEMENT -
              Uint16Array.BYTES_PER_ELEMENT -
              Uint32Array.BYTES_PER_ELEMENT -
              optionalFieldsLength -
              Uint64Array.BYTES_PER_ELEMENT,
          )
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
        }
        if (isEncrypted) {
          const ageFile = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint16Array.BYTES_PER_ELEMENT +
              Uint32Array.BYTES_PER_ELEMENT +
              optionalFieldsLength +
              Uint64Array.BYTES_PER_ELEMENT,
          );
          const ageData = await Age.decrypt(account, ageFile, mimbleWimbleCoin);
          if (ageData.length < Uint32Array.BYTES_PER_ELEMENT) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const metadataLength = ageData.readUInt32BE(0);
          if (ageData.length < Uint32Array.BYTES_PER_ELEMENT + metadataLength) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const metadata = Common.subarray(
            ageData,
            Uint32Array.BYTES_PER_ELEMENT,
            Uint32Array.BYTES_PER_ELEMENT + metadataLength,
          );
          if (metadata.length < Uint16Array.BYTES_PER_ELEMENT) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const optionalFields = metadata.readUInt16BE(0);
          if (!(optionalFields & 0b00000001)) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          if (metadata.length < Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const senderAddressLength = metadata.readUInt8(Uint16Array.BYTES_PER_ELEMENT);
          if (
            metadata.length <
            Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT + senderAddressLength
          ) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          for (let i = 0; i < senderAddressLength; ++i) {
            if (
              !Common.isPrintableCharacter(
                metadata.readUInt8(
                  Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT + i,
                ),
              )
            ) {
              throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
            }
          }
          const senderAddress = Common.subarray(
            metadata,
            Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
            Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT + senderAddressLength,
          ).toString();
          try {
            Slatepack.slatepackAddressToPublicKey(senderAddress, account.currency);
          } catch (error: any) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack");
          }
          const serializedSlate = Common.subarray(
            ageData,
            Uint32Array.BYTES_PER_ELEMENT + metadataLength,
          );
          return {
            serializedSlate,
            senderAddress,
          };
        } else {
          const serializedSlate = Common.subarray(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint16Array.BYTES_PER_ELEMENT +
              Uint32Array.BYTES_PER_ELEMENT +
              optionalFieldsLength +
              Uint64Array.BYTES_PER_ELEMENT,
          );
          return {
            serializedSlate,
            senderAddress: null,
          };
        }
      }
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static async encode(
    account: Account,
    serializedSlate: Buffer,
    mimbleWimbleCoin: MimbleWimbleCoin,
    recipientAddress: string | null,
  ): Promise<string> {
    if (!(serializedSlate instanceof Buffer)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
    }
    if (recipientAddress !== null) {
      switch (account.currency.id) {
        case "mimblewimble_coin":
        case "mimblewimble_coin_floonet": {
          let recipientPublicKey: Buffer;
          try {
            recipientPublicKey = Tor.torAddressToPublicKey(recipientAddress);
          } catch (error: any) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          const senderAddress = account.freshAddresses[0].address;
          let senderPublicKey: Buffer;
          try {
            senderPublicKey = Tor.torAddressToPublicKey(senderAddress);
          } catch (error: any) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          const buffer = Buffer.alloc(
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              serializedSlate.length,
          );
          buffer.writeUInt8(Slatepack.getSlatepackVersion(account.currency), 0);
          senderPublicKey.copy(buffer, Uint8Array.BYTES_PER_ELEMENT);
          recipientPublicKey.copy(
            buffer,
            Uint8Array.BYTES_PER_ELEMENT + Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          serializedSlate.copy(
            buffer,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          const checksum = CRC32.buf(buffer);
          const slatepackData = Buffer.alloc(serializedSlate.length + Int32Array.BYTES_PER_ELEMENT);
          serializedSlate.copy(slatepackData, 0);
          slatepackData.writeInt32BE(checksum, serializedSlate.length);
          const { nonce, encryptedSlatepackData } = await mimbleWimbleCoin.encryptSlatepackData(
            account.freshAddresses[0].derivationPath,
            slatepackData,
            recipientAddress,
          );
          if (encryptedSlatepackData.length > 0xffff) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          const data = Buffer.alloc(
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH +
              Uint16Array.BYTES_PER_ELEMENT +
              encryptedSlatepackData.length,
          );
          data.writeUInt8(Slatepack.getSlatepackVersion(account.currency), 0);
          senderPublicKey.copy(data, Uint8Array.BYTES_PER_ELEMENT);
          recipientPublicKey.copy(
            data,
            Uint8Array.BYTES_PER_ELEMENT + Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          nonce.copy(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH,
          );
          data.writeUInt16BE(
            encryptedSlatepackData.length,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH,
          );
          encryptedSlatepackData.copy(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.ED25519_PUBLIC_KEY_LENGTH +
              Crypto.CHACHA20_POLY1305_NONCE_LENGTH +
              Uint16Array.BYTES_PER_ELEMENT,
          );
          const dataChecksum = Common.subarray(
            new shajs.sha256().update(new shajs.sha256().update(data).digest()).digest(),
            0,
            Slatepack.DATA_CHECKSUM_LENGTH,
          );
          const decodedPayload = Buffer.alloc(Slatepack.DATA_CHECKSUM_LENGTH + data.length);
          dataChecksum.copy(decodedPayload, 0);
          data.copy(decodedPayload, Slatepack.DATA_CHECKSUM_LENGTH);
          const payload = bs58.encode(decodedPayload);
          return `BEGINSLATEPACK. ${Slatepack.formatOutput(payload)}. ENDSLATEPACK.`;
        }
        case "grin":
        case "grin_testnet": {
          let recipientPublicKey: Buffer;
          try {
            recipientPublicKey = Slatepack.slatepackAddressToPublicKey(
              recipientAddress,
              account.currency,
            );
          } catch (error: any) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          if (account.freshAddresses[0].address.length > 0xff) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          const metadata = Buffer.alloc(
            Uint16Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              account.freshAddresses[0].address.length,
          );
          metadata.writeUInt16BE(0b00000001, 0);
          metadata.writeUInt8(
            account.freshAddresses[0].address.length,
            Uint16Array.BYTES_PER_ELEMENT,
          );
          metadata.write(
            account.freshAddresses[0].address,
            Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
          );
          if (metadata.length > 0xffffffff) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          const ageData = Buffer.alloc(
            Uint32Array.BYTES_PER_ELEMENT + metadata.length + serializedSlate.length,
          );
          ageData.writeUInt32BE(metadata.length, 0);
          metadata.copy(ageData, Uint32Array.BYTES_PER_ELEMENT);
          serializedSlate.copy(ageData, Uint32Array.BYTES_PER_ELEMENT + metadata.length);
          const ageFile = await Age.encrypt(ageData, recipientPublicKey);
          if (new BigNumber(ageFile.length).isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          const data = Buffer.alloc(
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint16Array.BYTES_PER_ELEMENT +
              Uint32Array.BYTES_PER_ELEMENT +
              Uint64Array.BYTES_PER_ELEMENT +
              ageFile.length,
          );
          data.writeUInt8(Slatepack.getSlatepackMajorVersion(account.currency), 0);
          data.writeUInt8(
            Slatepack.getSlatepackMinorVersion(account.currency),
            Uint8Array.BYTES_PER_ELEMENT,
          );
          data.writeUInt8(
            Slatepack.TransferMode.AGE_ENCRYPTED,
            Uint8Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
          );
          data.writeUInt16BE(
            0,
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT,
          );
          data.writeUInt32BE(
            0,
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint16Array.BYTES_PER_ELEMENT,
          );
          Uint64Array.writeBigEndian(
            data,
            new BigNumber(ageFile.length),
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint16Array.BYTES_PER_ELEMENT +
              Uint32Array.BYTES_PER_ELEMENT,
          );
          ageFile.copy(
            data,
            Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint8Array.BYTES_PER_ELEMENT +
              Uint16Array.BYTES_PER_ELEMENT +
              Uint32Array.BYTES_PER_ELEMENT +
              Uint64Array.BYTES_PER_ELEMENT,
          );
          const dataChecksum = Common.subarray(
            new shajs.sha256().update(new shajs.sha256().update(data).digest()).digest(),
            0,
            Slatepack.DATA_CHECKSUM_LENGTH,
          );
          const decodedPayload = Buffer.alloc(Slatepack.DATA_CHECKSUM_LENGTH + data.length);
          dataChecksum.copy(decodedPayload, 0);
          data.copy(decodedPayload, Slatepack.DATA_CHECKSUM_LENGTH);
          const payload = bs58.encode(decodedPayload);
          return `BEGINSLATEPACK. ${Slatepack.formatOutput(payload)}. ENDSLATEPACK.`;
        }
        default:
          throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
      }
    } else {
      switch (account.currency.id) {
        case "mimblewimble_coin":
        case "mimblewimble_coin_floonet":
          if (serializedSlate.length > 0xffff) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          {
            const data = Buffer.alloc(
              Uint8Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT + serializedSlate.length,
            );
            data.writeUInt8(Slatepack.getSlatepackVersion(account.currency), 0);
            data.writeUInt16BE(serializedSlate.length, Uint8Array.BYTES_PER_ELEMENT);
            serializedSlate.copy(
              data,
              Uint8Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
            );
            const dataChecksum = Common.subarray(
              new shajs.sha256().update(new shajs.sha256().update(data).digest()).digest(),
              0,
              Slatepack.DATA_CHECKSUM_LENGTH,
            );
            const decodedPayload = Buffer.alloc(Slatepack.DATA_CHECKSUM_LENGTH + data.length);
            dataChecksum.copy(decodedPayload, 0);
            data.copy(decodedPayload, Slatepack.DATA_CHECKSUM_LENGTH);
            const payload = bs58.encode(decodedPayload);
            return `BEGINSLATE_BIN. ${Slatepack.formatOutput(payload)}. ENDSLATE_BIN.`;
          }
        case "grin":
        case "grin_testnet":
          if (new BigNumber(serializedSlate.length).isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
            throw new MimbleWimbleCoinInvalidParameters("Invalid serialized slate");
          }
          {
            const data = Buffer.alloc(
              Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint16Array.BYTES_PER_ELEMENT +
                Uint32Array.BYTES_PER_ELEMENT +
                Uint64Array.BYTES_PER_ELEMENT +
                serializedSlate.length,
            );
            data.writeUInt8(Slatepack.getSlatepackMajorVersion(account.currency), 0);
            data.writeUInt8(
              Slatepack.getSlatepackMinorVersion(account.currency),
              Uint8Array.BYTES_PER_ELEMENT,
            );
            data.writeUInt8(
              Slatepack.TransferMode.PLAIN_TEXT,
              Uint8Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
            );
            data.writeUInt16BE(
              0,
              Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT,
            );
            data.writeUInt32BE(
              0,
              Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint16Array.BYTES_PER_ELEMENT,
            );
            Uint64Array.writeBigEndian(
              data,
              new BigNumber(serializedSlate.length),
              Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint16Array.BYTES_PER_ELEMENT +
                Uint32Array.BYTES_PER_ELEMENT,
            );
            serializedSlate.copy(
              data,
              Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint8Array.BYTES_PER_ELEMENT +
                Uint16Array.BYTES_PER_ELEMENT +
                Uint32Array.BYTES_PER_ELEMENT +
                Uint64Array.BYTES_PER_ELEMENT,
            );
            const dataChecksum = Common.subarray(
              new shajs.sha256().update(new shajs.sha256().update(data).digest()).digest(),
              0,
              Slatepack.DATA_CHECKSUM_LENGTH,
            );
            const decodedPayload = Buffer.alloc(Slatepack.DATA_CHECKSUM_LENGTH + data.length);
            dataChecksum.copy(decodedPayload, 0);
            data.copy(decodedPayload, Slatepack.DATA_CHECKSUM_LENGTH);
            const payload = bs58.encode(decodedPayload);
            return `BEGINSLATEPACK. ${Slatepack.formatOutput(payload)}. ENDSLATEPACK.`;
          }
        default:
          throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
      }
    }
  }

  private static getAddressHumanReadablePart(cryptocurrency: CryptoCurrency): string {
    switch (cryptocurrency.id) {
      case "grin":
        return "grin";
      case "grin_testnet":
        return "tgrin";
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static formatOutput(payload: string): string {
    let result = "";
    for (let i = 0; i < payload.length; ++i) {
      if (i && !(i % Slatepack.WORD_LENGTH)) {
        if (!(i % (Slatepack.WORD_LENGTH * Slatepack.WORDS_PER_LINE))) {
          result += "\n";
        } else {
          result += " ";
        }
      }
      result += payload[i];
    }
    return result;
  }

  private static getSlatepackVersion(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        return 0;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getSlatepackMajorVersion(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "grin":
      case "grin_testnet":
        return 1;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getSlatepackMinorVersion(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "grin":
      case "grin_testnet":
        return 0;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }
}
