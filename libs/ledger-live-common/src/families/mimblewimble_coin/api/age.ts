import Ed25519 from "@nicolasflamel/ed25519";
import X25519 from "@nicolasflamel/x25519";
import Crypto from "./crypto";
import hkdf from "futoin-hkdf";
import chacha from "chacha";
import createHmac from "create-hmac";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Common from "./common";
import { Account } from "@ledgerhq/types-live";
import MimbleWimbleCoin from "../hw-app-mimblewimble-coin";
import Uint64Array from "./uint64Array";
import BigNumber from "bignumber.js";

export default class Age {
  public static readonly FILE_KEY_LENGTH = 16;
  private static readonly HEADER_VERSION_LINE = "age-encryption.org/v1";
  private static readonly HEADER_STANZA_LINE_PREFIX = "->";
  private static readonly HEADER_MAC_LINE_PREFIX = "---";
  private static readonly STANZA_WRAPPED_BODY_LENGTH = 64;
  private static readonly X25519_RECIPIENT_STANZA_NUMBER_OF_ARGUMENTS = 2;
  private static readonly X25519_RECIPIENT_STANZA_FIRST_ARGUMENT = "X25519";
  private static readonly SCRYPT_RECIPIENT_STANZA_FIRST_ARGUMENT = "scrypt";
  public static readonly PAYLOAD_NONCE_LENGTH = 16;
  private static readonly MAXIMUM_PAYLOAD_CHUNK_LENGTH = Math.pow(2, 16);
  private static readonly MAC_LENGTH = 32;

  private constructor() {}

  public static async encrypt(data: Buffer, recipientEd25519PublicKey: Buffer): Promise<Buffer> {
    const recipientX25519PublicKey = await Common.resolveIfPromise(
      X25519.publicKeyFromEd25519PublicKey(recipientEd25519PublicKey),
    );
    if (recipientX25519PublicKey === X25519.OPERATION_FAILED) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid recipient Ed25519 public key");
    }
    if (recipientX25519PublicKey.equals(Buffer.alloc(Crypto.X25519_PUBLIC_KEY_LENGTH))) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid recipient Ed25519 public key");
    }
    let ephemeralX25519PublicKey: Buffer;
    let sharedSecret: Buffer;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ephemeralEd25519SecretKey = await Crypto.randomBytes(Crypto.ED25519_PRIVATE_KEY_LENGTH);
      const ephemeralX25519SecretKey = await Common.resolveIfPromise(
        X25519.secretKeyFromEd25519SecretKey(ephemeralEd25519SecretKey),
      );
      if (ephemeralX25519SecretKey === X25519.OPERATION_FAILED) {
        continue;
      }
      const ephemeralEd25519PublicKey = await Common.resolveIfPromise(
        Ed25519.publicKeyFromSecretKey(ephemeralEd25519SecretKey),
      );
      if (ephemeralEd25519PublicKey === Ed25519.OPERATION_FAILED) {
        continue;
      }
      ephemeralEd25519SecretKey.fill(0);
      ephemeralX25519PublicKey = await Common.resolveIfPromise(
        X25519.publicKeyFromEd25519PublicKey(ephemeralEd25519PublicKey),
      );
      if (ephemeralX25519PublicKey === X25519.OPERATION_FAILED) {
        continue;
      }
      sharedSecret = await Common.resolveIfPromise(
        X25519.sharedSecretKeyFromSecretKeyAndPublicKey(
          ephemeralX25519SecretKey,
          recipientX25519PublicKey,
        ),
      );
      if (sharedSecret === X25519.OPERATION_FAILED) {
        continue;
      }
      ephemeralX25519SecretKey.fill(0);
      if (
        Common.arraysAreEqualTimingSafe(
          sharedSecret,
          Buffer.alloc(Crypto.X25519_PRIVATE_KEY_LENGTH),
        )
      ) {
        continue;
      }
      break;
    }
    const salt = Buffer.alloc(ephemeralX25519PublicKey.length + recipientX25519PublicKey.length);
    ephemeralX25519PublicKey.copy(salt, 0);
    recipientX25519PublicKey.copy(salt, ephemeralX25519PublicKey.length);
    const wrapKey = hkdf(sharedSecret, 32, {
      salt,
      info: "age-encryption.org/v1/X25519",
      hash: "SHA-256",
    });
    sharedSecret.fill(0);
    const cipher = chacha.createCipher(
      wrapKey,
      Buffer.alloc(Crypto.CHACHA20_POLY1305_NONCE_LENGTH),
    );
    const fileKey = await Crypto.randomBytes(Age.FILE_KEY_LENGTH);
    const encryptedFileKeyStart = cipher.update(fileKey);
    const encryptedFileKeyEnd = cipher.final();
    const encryptedFileKeyTag = cipher.getAuthTag();
    const encryptedFileKey = Buffer.alloc(
      encryptedFileKeyStart.length + encryptedFileKeyEnd.length + encryptedFileKeyTag.length,
    );
    encryptedFileKeyStart.copy(encryptedFileKey, 0);
    encryptedFileKeyEnd.copy(encryptedFileKey, encryptedFileKeyStart.length);
    encryptedFileKeyTag.copy(
      encryptedFileKey,
      encryptedFileKeyStart.length + encryptedFileKeyEnd.length,
    );
    let ageHeader = `${Age.HEADER_VERSION_LINE}\n${Age.HEADER_STANZA_LINE_PREFIX} ${
      Age.X25519_RECIPIENT_STANZA_FIRST_ARGUMENT
    } ${ephemeralX25519PublicKey.toString("base64").replace(/=+$/u, "")}\n${encryptedFileKey
      .toString("base64")
      .replace(/=+$/u, "")}\n${Age.HEADER_MAC_LINE_PREFIX}`;
    const hmacKey = hkdf(fileKey, 32, {
      info: "header",
      hash: "SHA-256",
    });
    const mac = createHmac("sha256", hmacKey).update(ageHeader).digest();
    const nonce = await Crypto.randomBytes(Age.PAYLOAD_NONCE_LENGTH);
    const payloadKey = hkdf(fileKey, 32, {
      salt: nonce,
      info: "payload",
      hash: "SHA-256",
    });
    fileKey.fill(0);
    ageHeader += ` ${mac.toString("base64").replace(/=+$/u, "")}\n`;
    let agePayload: Buffer = nonce;
    for (
      let i = 0;
      i < Math.max(Math.ceil(data.length / Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH), 1);
      ++i
    ) {
      if (i === Number.MAX_SAFE_INTEGER) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid data");
      }
      const chunk = Common.subarray(
        data,
        i * Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH,
        (i + 1) * Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH,
      );
      const nonce = Buffer.alloc(Crypto.CHACHA20_POLY1305_NONCE_LENGTH);
      Uint64Array.writeBigEndian(
        nonce,
        new BigNumber(i),
        Crypto.CHACHA20_POLY1305_NONCE_LENGTH - 1 - Uint64Array.BYTES_PER_ELEMENT,
      );
      nonce.writeUInt8(
        i === Math.max(Math.ceil(data.length / Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH), 1) - 1 ? 1 : 0,
        Crypto.CHACHA20_POLY1305_NONCE_LENGTH - 1,
      );
      const cipher = chacha.createCipher(payloadKey, nonce);
      const encryptedChunkStart = chunk.length ? cipher.update(chunk) : Buffer.alloc(0);
      const encryptedChunkEnd = cipher.final();
      const encryptedChunkTag = cipher.getAuthTag();
      const temp = Buffer.alloc(
        agePayload.length +
          encryptedChunkStart.length +
          encryptedChunkEnd.length +
          encryptedChunkTag.length,
      );
      agePayload.copy(temp, 0);
      encryptedChunkStart.copy(temp, agePayload.length);
      encryptedChunkEnd.copy(temp, agePayload.length + encryptedChunkStart.length);
      encryptedChunkTag.copy(
        temp,
        agePayload.length + encryptedChunkStart.length + encryptedChunkEnd.length,
      );
      agePayload = temp;
    }
    const ageFile = Buffer.alloc(ageHeader.length + agePayload.length);
    ageFile.write(ageHeader, 0);
    agePayload.copy(ageFile, ageHeader.length);
    return ageFile;
  }

  public static async decrypt(
    account: Account,
    ageFile: Buffer,
    mimbleWimbleCoin: MimbleWimbleCoin,
  ): Promise<Buffer> {
    let endOfHeaderIndex = -1;
    for (
      let newlineIndex: number = ageFile.indexOf("\n".charCodeAt(0));
      newlineIndex !== -1;
      newlineIndex = ageFile.indexOf("\n".charCodeAt(0), newlineIndex + "\n".length)
    ) {
      if (
        Common.subarray(
          ageFile,
          newlineIndex,
          newlineIndex + `\n${Age.HEADER_MAC_LINE_PREFIX} `.length,
        ).equals(Buffer.from(`\n${Age.HEADER_MAC_LINE_PREFIX} `))
      ) {
        endOfHeaderIndex = ageFile.indexOf(
          "\n".charCodeAt(0),
          newlineIndex + `\n${Age.HEADER_MAC_LINE_PREFIX} `.length,
        );
        break;
      }
    }
    if (endOfHeaderIndex === -1) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    for (let i = 0; i < endOfHeaderIndex; ++i) {
      if (
        !Common.isPrintableCharacter(ageFile.readUInt8(i)) &&
        ageFile.readUInt8(i) !== "\n".charCodeAt(0)
      ) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
    }
    const ageHeader = Common.subarray(ageFile, 0, endOfHeaderIndex + "\n".length).toString();
    const agePayload = Common.subarray(ageFile, endOfHeaderIndex + "\n".length);
    if (!ageHeader.startsWith(`${Age.HEADER_VERSION_LINE}\n${Age.HEADER_STANZA_LINE_PREFIX} `)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    const stanzas: {
      ephemeralX25519PublicKey: Buffer;
      encryptedFileKey: Buffer;
    }[] = [];
    let startOfLine = `${Age.HEADER_VERSION_LINE}\n`.length;
    while (
      ageHeader.substring(startOfLine, startOfLine + `${Age.HEADER_STANZA_LINE_PREFIX} `.length) ===
      `${Age.HEADER_STANZA_LINE_PREFIX} `
    ) {
      let endOfLine: number = ageHeader.indexOf("\n", startOfLine);
      if (endOfLine === -1) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
      const stanzaArguments = ageHeader
        .substring(startOfLine + `${Age.HEADER_STANZA_LINE_PREFIX} `.length, endOfLine)
        .split(" ");
      if (!stanzaArguments.length) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
      if (stanzaArguments[0] === Age.SCRYPT_RECIPIENT_STANZA_FIRST_ARGUMENT) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
      let stanzaBody = "";
      for (startOfLine = endOfLine + "\n".length; ; startOfLine = endOfLine + "\n".length) {
        endOfLine = ageHeader.indexOf("\n", startOfLine);
        if (endOfLine === -1) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
        }
        stanzaBody += ageHeader.substring(startOfLine, endOfLine);
        if (endOfLine - startOfLine > Age.STANZA_WRAPPED_BODY_LENGTH) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
        } else if (endOfLine - startOfLine < Age.STANZA_WRAPPED_BODY_LENGTH) {
          startOfLine = endOfLine + "\n".length;
          break;
        }
      }
      if (stanzaBody.endsWith(Crypto.BASE64_PADDING_CHARACTER)) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
      if (
        stanzaArguments.length === Age.X25519_RECIPIENT_STANZA_NUMBER_OF_ARGUMENTS &&
        stanzaArguments[0] === Age.X25519_RECIPIENT_STANZA_FIRST_ARGUMENT
      ) {
        if (stanzaArguments[1].endsWith(Crypto.BASE64_PADDING_CHARACTER)) {
          continue;
        }
        if (!/^[a-z0-9+/]+$/iu.test(stanzaArguments[1]) || !/^[a-z0-9+/]+$/iu.test(stanzaBody)) {
          continue;
        }
        const ephemeralX25519PublicKey = Buffer.from(stanzaArguments[1], "base64");
        const encryptedFileKey = Buffer.from(stanzaBody, "base64");
        if (
          ephemeralX25519PublicKey.length === Crypto.X25519_PUBLIC_KEY_LENGTH &&
          encryptedFileKey.length === Age.FILE_KEY_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH
        ) {
          stanzas.push({
            ephemeralX25519PublicKey,
            encryptedFileKey,
          });
        }
      }
    }
    if (
      ageHeader.substring(startOfLine, startOfLine + `${Age.HEADER_MAC_LINE_PREFIX} `.length) !==
      `${Age.HEADER_MAC_LINE_PREFIX} `
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    const endOfLine = ageHeader.indexOf("\n", startOfLine);
    if (endOfLine === -1 || endOfLine + "\n".length !== ageHeader.length) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    const encodedMac = ageHeader.substring(
      startOfLine + `${Age.HEADER_MAC_LINE_PREFIX} `.length,
      endOfLine,
    );
    if (encodedMac.endsWith(Crypto.BASE64_PADDING_CHARACTER)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    if (!/^[a-z0-9+/]+$/iu.test(encodedMac)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    const mac = Buffer.from(encodedMac, "base64");
    if (mac.length !== Age.MAC_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    if (stanzas.length !== 1) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid number of stanzas");
    }
    if (agePayload.length < Age.PAYLOAD_NONCE_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
    }
    const payloadNonce = Common.subarray(agePayload, 0, Age.PAYLOAD_NONCE_LENGTH);
    let data: Buffer = Buffer.alloc(0);
    for (
      let i = 0;
      i <
      Math.ceil(
        (agePayload.length - Age.PAYLOAD_NONCE_LENGTH) /
          (Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH),
      );
      ++i
    ) {
      if (i === Number.MAX_SAFE_INTEGER) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
      const chunk = Common.subarray(
        agePayload,
        Age.PAYLOAD_NONCE_LENGTH +
          i * (Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH),
        Age.PAYLOAD_NONCE_LENGTH +
          (i + 1) * (Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH),
      );
      if (chunk.length < Crypto.CHACHA20_POLY1305_TAG_LENGTH) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      } else if (chunk.length === Crypto.CHACHA20_POLY1305_TAG_LENGTH && i) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid age file");
      }
      const nonce = Buffer.alloc(Crypto.CHACHA20_POLY1305_NONCE_LENGTH);
      Uint64Array.writeBigEndian(
        nonce,
        new BigNumber(i),
        Crypto.CHACHA20_POLY1305_NONCE_LENGTH - 1 - Uint64Array.BYTES_PER_ELEMENT,
      );
      nonce.writeUInt8(
        i ===
          Math.ceil(
            (agePayload.length - Age.PAYLOAD_NONCE_LENGTH) /
              (Age.MAXIMUM_PAYLOAD_CHUNK_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH),
          ) -
            1
          ? 1
          : 0,
        Crypto.CHACHA20_POLY1305_NONCE_LENGTH - 1,
      );
      const decryptedChunk = await mimbleWimbleCoin.decryptAgeChunk(
        account.freshAddressPath,
        stanzas[0].ephemeralX25519PublicKey,
        stanzas[0].encryptedFileKey,
        payloadNonce,
        nonce,
        chunk,
      );
      const temp = Buffer.alloc(data.length + decryptedChunk.length);
      data.copy(temp, 0);
      decryptedChunk.copy(temp, data.length);
      data = temp;
    }
    return data;
  }
}
