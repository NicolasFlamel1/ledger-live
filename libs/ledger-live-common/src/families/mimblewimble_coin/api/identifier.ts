import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";

export default class Identifier {
  public depth: number;
  public paths: Uint32Array;

  private static readonly MAX_DEPTH = 4;
  public static readonly LENGTH =
    Uint8Array.BYTES_PER_ELEMENT + Identifier.MAX_DEPTH * Uint32Array.BYTES_PER_ELEMENT;
  private static readonly DEPTH_INDEX = 0;
  private static readonly PATHS_INDEX = Identifier.DEPTH_INDEX + Uint8Array.BYTES_PER_ELEMENT;
  private static readonly HEIGHT_PATH_INDEX = 3;
  public static readonly MAXIMUM_HEIGHT = 0xffffffff;

  public constructor(
    serializedIdentifier: Buffer = Buffer.from("0300000000000000000000000000000000", "hex"),
  ) {
    this.depth = Math.min(
      serializedIdentifier.readUInt8(Identifier.DEPTH_INDEX),
      Identifier.MAX_DEPTH,
    );
    this.paths = new Uint32Array(Identifier.MAX_DEPTH);
    for (let i = 0; i < this.paths.length; ++i) {
      this.paths[i] = serializedIdentifier.readUInt32BE(
        Identifier.PATHS_INDEX + i * Uint32Array.BYTES_PER_ELEMENT,
      );
    }
  }

  public serialize(): Buffer {
    const buffer = Buffer.alloc(Identifier.LENGTH);
    buffer.writeUInt8(this.depth, Identifier.DEPTH_INDEX);
    for (let i = 0; i < this.paths.length; ++i) {
      buffer.writeUInt32BE(
        this.paths[i],
        Identifier.PATHS_INDEX + i * Uint32Array.BYTES_PER_ELEMENT,
      );
    }
    return buffer;
  }

  public getHeight(cryptocurrency: CryptoCurrency): BigNumber | null {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet": {
        const height = new BigNumber(this.paths[Identifier.HEIGHT_PATH_INDEX]);
        return height.isZero() ? null : height;
      }
    }
    return null;
  }

  public includesValue(value: Identifier): boolean {
    return this.depth === value.depth && this.getLastPath() >= value.getLastPath();
  }

  public removeExtras(cryptocurrency: CryptoCurrency): Identifier {
    const plainIdentifier = new Identifier(this.serialize());
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        plainIdentifier.paths[Identifier.HEIGHT_PATH_INDEX] = 0;
        break;
    }
    return plainIdentifier;
  }

  public getNext(): Identifier {
    const nextIdentifier = new Identifier(this.serialize());
    ++nextIdentifier.paths[nextIdentifier.depth - 1];
    return nextIdentifier;
  }

  public withHeight(cryptocurrency: CryptoCurrency, height: BigNumber): Identifier {
    const identifierWithHeight = this.removeExtras(cryptocurrency);
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        identifierWithHeight.paths[Identifier.HEIGHT_PATH_INDEX] = Math.max(
          height.modulo(Identifier.MAXIMUM_HEIGHT + 1).toNumber(),
          1,
        );
        break;
    }
    return identifierWithHeight;
  }

  private getLastPath(): number {
    return this.depth ? this.paths[this.depth - 1] : 0;
  }
}
