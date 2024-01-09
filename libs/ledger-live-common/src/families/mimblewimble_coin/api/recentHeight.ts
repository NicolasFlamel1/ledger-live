import BigNumber from "bignumber.js";

export default class RecentHeight {
  public height: BigNumber;
  public hash: Buffer;

  public constructor(height: BigNumber, hash: Buffer) {
    this.height = height;
    this.hash = hash;
  }
}
