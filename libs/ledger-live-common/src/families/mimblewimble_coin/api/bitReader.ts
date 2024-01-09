import Common from "./common";
import { MimbleWimbleCoinInvalidParameters } from "../errors";

export default class BitReader {
  private buffer: Buffer;
  private byteIndex: number;
  private bitIndex: number;

  public constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.byteIndex = 0;
    this.bitIndex = 0;
  }

  public getBits(numberOfBits: number): number {
    if (numberOfBits > Common.BITS_IN_A_BYTE) {
      let bits = 0;
      for (let i: number = numberOfBits; i > 0; i -= Common.BITS_IN_A_BYTE) {
        bits <<= Math.min(i, Common.BITS_IN_A_BYTE);
        bits |= this.getBits(Math.min(i, Common.BITS_IN_A_BYTE));
      }
      return bits;
    } else {
      if (
        !numberOfBits ||
        this.byteIndex === this.buffer.length ||
        (this.byteIndex === this.buffer.length - 1 &&
          this.bitIndex + numberOfBits > Common.BITS_IN_A_BYTE)
      ) {
        throw new MimbleWimbleCoinInvalidParameters("Invalid bits");
      }
      let bits: number = this.buffer.readUInt8(this.byteIndex) << Common.BITS_IN_A_BYTE;
      if (this.bitIndex + numberOfBits > Common.BITS_IN_A_BYTE) {
        bits |= this.buffer.readUInt8(this.byteIndex + 1);
      }
      bits &= (1 << (Common.BITS_IN_A_BYTE * 2 - this.bitIndex)) - 1;
      bits >>>= Common.BITS_IN_A_BYTE * 2 - (this.bitIndex + numberOfBits);
      this.bitIndex += numberOfBits;
      if (this.bitIndex >= Common.BITS_IN_A_BYTE) {
        ++this.byteIndex;
        this.bitIndex %= Common.BITS_IN_A_BYTE;
      }
      return bits;
    }
  }

  public getBytes(numberOfBytes: number): Buffer {
    const bytes = Buffer.alloc(numberOfBytes);
    for (let i = 0; i < numberOfBytes; ++i) {
      bytes.writeUInt8(this.getBits(Common.BITS_IN_A_BYTE), i);
    }
    return bytes;
  }
}
