import BigNumber from "bignumber.js";
import { MimbleWimbleCoinInvalidParameters } from "../errors";

export default class Uint64Array {
  public static readonly BYTES_PER_ELEMENT = 8;

  public static writeBigEndian(buffer: Buffer, value: BigNumber, offset = 0) {
    if (value.isNaN() || value.isLessThan(0) || value.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid value");
    }
    buffer.writeUInt32BE(value.dividedToIntegerBy(0x100000000).toNumber(), offset);
    buffer.writeUInt32BE(value.mod(0x100000000).toNumber(), offset + Uint32Array.BYTES_PER_ELEMENT);
  }

  public static writeLittleEndian(buffer: Buffer, value: BigNumber, offset = 0) {
    if (value.isNaN() || value.isLessThan(0) || value.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid value");
    }
    buffer.writeUInt32LE(value.mod(0x100000000).toNumber(), offset);
    buffer.writeUInt32LE(
      value.dividedToIntegerBy(0x100000000).toNumber(),
      offset + Uint32Array.BYTES_PER_ELEMENT,
    );
  }

  public static readBigEndian(buffer: Buffer, offset = 0): BigNumber {
    return new BigNumber(buffer.readUInt32BE(offset))
      .multipliedBy(0x100000000)
      .plus(buffer.readUInt32BE(offset + Uint32Array.BYTES_PER_ELEMENT));
  }

  public static readLittleEndian(buffer: Buffer, offset = 0): BigNumber {
    return new BigNumber(buffer.readUInt32LE(offset + Uint32Array.BYTES_PER_ELEMENT))
      .multipliedBy(0x100000000)
      .plus(buffer.readUInt32LE(offset));
  }
}
