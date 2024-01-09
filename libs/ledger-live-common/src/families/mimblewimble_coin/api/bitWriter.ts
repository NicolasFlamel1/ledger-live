import Common from "./common";
import { MimbleWimbleCoinInvalidParameters } from "../errors";

export default class BitWriter {
  private buffer: Buffer;
  private byteIndex: number;
  private bitIndex: number;

  public constructor() {
    this.buffer = Buffer.alloc(0);
    this.byteIndex = 0;
    this.bitIndex = 0;
  }

  public setBits(value: number, numberOfBits: number) {
    let remainingBits: number = numberOfBits;
    while (remainingBits > Common.BITS_IN_A_BYTE) {
      this.setBits(
        value >>>
          (Common.BITS_IN_A_BYTE * (Math.floor(remainingBits / Common.BITS_IN_A_BYTE) - 1) +
            (remainingBits % Common.BITS_IN_A_BYTE)),
        Math.min(remainingBits, Common.BITS_IN_A_BYTE),
      );
      remainingBits -= Common.BITS_IN_A_BYTE;
    }
    if (!remainingBits) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid bits");
    }
    if (!this.bitIndex || this.bitIndex + remainingBits > Common.BITS_IN_A_BYTE) {
      const temp = Buffer.alloc(this.buffer.length + 1);
      this.buffer.copy(temp);
      this.buffer = temp;
    }
    if (this.bitIndex + remainingBits > Common.BITS_IN_A_BYTE) {
      this.buffer.writeUInt8(
        (this.buffer.readUInt8(this.byteIndex) |
          (value >>> (this.bitIndex + remainingBits - Common.BITS_IN_A_BYTE))) &
          0xff,
        this.byteIndex,
      );
      this.buffer.writeUInt8(
        (this.buffer.readUInt8(this.byteIndex + 1) |
          (value << (Common.BITS_IN_A_BYTE * 2 - (this.bitIndex + remainingBits)))) &
          0xff,
        this.byteIndex + 1,
      );
    } else {
      this.buffer.writeUInt8(
        (this.buffer.readUInt8(this.byteIndex) |
          (value << (Common.BITS_IN_A_BYTE - (this.bitIndex + remainingBits)))) &
          0xff,
        this.byteIndex,
      );
    }
    this.bitIndex += remainingBits;
    if (this.bitIndex >= Common.BITS_IN_A_BYTE) {
      ++this.byteIndex;
      this.bitIndex %= Common.BITS_IN_A_BYTE;
    }
  }

  public setBytes(bytes: Buffer) {
    for (let i = 0; i < bytes.length; ++i) {
      this.setBits(bytes.readUInt8(i), Common.BITS_IN_A_BYTE);
    }
  }

  public getBytes(): Buffer {
    return this.buffer;
  }
}
