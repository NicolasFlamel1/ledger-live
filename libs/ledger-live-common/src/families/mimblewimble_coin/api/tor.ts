import base32 from "hi-base32";
import Crypto from "./crypto";
import { SHA3 } from "sha3";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Common from "./common";

export default class Tor {
  public static readonly ADDRESS_LENGTH = 56;
  private static readonly ADDRESS_CHECKSUM_LENGTH = 2;
  private static readonly ADDRESS_CHECKSUM_SEED = ".onion checksum";
  private static readonly ADDRESS_VERSION = 3;

  private constructor() {}

  public static torAddressToPublicKey(torAddress: string): Buffer {
    if (!/^[a-z0-9]+$/u.test(torAddress)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Tor address");
    }
    const decodedAddress = Buffer.from(base32.decode.asBytes(torAddress.toUpperCase()));
    if (
      decodedAddress.length !==
      Crypto.ED25519_PUBLIC_KEY_LENGTH + Tor.ADDRESS_CHECKSUM_LENGTH + Uint8Array.BYTES_PER_ELEMENT
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Tor address");
    }
    const buffer = Buffer.alloc(
      Tor.ADDRESS_CHECKSUM_SEED.length +
        Crypto.ED25519_PUBLIC_KEY_LENGTH +
        Uint8Array.BYTES_PER_ELEMENT,
    );
    buffer.write(Tor.ADDRESS_CHECKSUM_SEED, 0);
    decodedAddress.copy(
      buffer,
      Tor.ADDRESS_CHECKSUM_SEED.length,
      0,
      Crypto.ED25519_PUBLIC_KEY_LENGTH,
    );
    buffer.writeUInt8(
      Tor.ADDRESS_VERSION,
      Tor.ADDRESS_CHECKSUM_SEED.length + Crypto.ED25519_PUBLIC_KEY_LENGTH,
    );
    const checksum = new SHA3(256).update(buffer).digest();
    if (
      !Common.subarray(checksum, 0, Tor.ADDRESS_CHECKSUM_LENGTH).equals(
        Common.subarray(
          decodedAddress,
          Crypto.ED25519_PUBLIC_KEY_LENGTH,
          Crypto.ED25519_PUBLIC_KEY_LENGTH + Tor.ADDRESS_CHECKSUM_LENGTH,
        ),
      )
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Tor address");
    }
    if (
      decodedAddress.readUInt8(Crypto.ED25519_PUBLIC_KEY_LENGTH + Tor.ADDRESS_CHECKSUM_LENGTH) !==
      Tor.ADDRESS_VERSION
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Tor address");
    }
    return Common.subarray(decodedAddress, 0, Crypto.ED25519_PUBLIC_KEY_LENGTH);
  }

  public static publicKeyToTorAddress(publicKey: Buffer): string {
    if (publicKey.length !== Crypto.ED25519_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid public key");
    }
    const checksumBuffer = Buffer.alloc(
      Tor.ADDRESS_CHECKSUM_SEED.length +
        Crypto.ED25519_PUBLIC_KEY_LENGTH +
        Uint8Array.BYTES_PER_ELEMENT,
    );
    checksumBuffer.write(Tor.ADDRESS_CHECKSUM_SEED, 0);
    publicKey.copy(checksumBuffer, Tor.ADDRESS_CHECKSUM_SEED.length);
    checksumBuffer.writeUInt8(
      Tor.ADDRESS_VERSION,
      Tor.ADDRESS_CHECKSUM_SEED.length + Crypto.ED25519_PUBLIC_KEY_LENGTH,
    );
    const checksum = new SHA3(256).update(checksumBuffer).digest();
    const addressBuffer = Buffer.alloc(
      Crypto.ED25519_PUBLIC_KEY_LENGTH + Tor.ADDRESS_CHECKSUM_LENGTH + Uint8Array.BYTES_PER_ELEMENT,
    );
    publicKey.copy(addressBuffer, 0);
    checksum.copy(addressBuffer, Crypto.ED25519_PUBLIC_KEY_LENGTH, 0, Tor.ADDRESS_CHECKSUM_LENGTH);
    addressBuffer.writeUInt8(
      Tor.ADDRESS_VERSION,
      Crypto.ED25519_PUBLIC_KEY_LENGTH + Tor.ADDRESS_CHECKSUM_LENGTH,
    );
    return base32.encode(addressBuffer).toLowerCase();
  }
}
