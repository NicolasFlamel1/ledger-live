import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";
import Common from "./common";
import { MimbleWimbleCoinInvalidParameters } from "../errors";

export default class Consensus {
  private constructor() {}

  public static getBlockTimeSeconds(cryptocurrency: CryptoCurrency): number {
    return cryptocurrency.blockAvgTime!;
  }

  public static getBlockHeightMinute(cryptocurrency: CryptoCurrency): number {
    return Math.floor(Common.SECONDS_IN_A_MINUTE / Consensus.getBlockTimeSeconds(cryptocurrency));
  }

  public static getBlockHeightHour(cryptocurrency: CryptoCurrency): number {
    return Common.MINUTES_IN_AN_HOUR * Consensus.getBlockHeightMinute(cryptocurrency);
  }

  public static getBlockHeightDay(cryptocurrency: CryptoCurrency): number {
    return Common.HOURS_IN_A_DAY * Consensus.getBlockHeightHour(cryptocurrency);
  }

  public static getBlockHeightWeek(cryptocurrency: CryptoCurrency): number {
    return Common.DAYS_IN_A_WEEK * Consensus.getBlockHeightDay(cryptocurrency);
  }

  public static getBlockHeightYear(cryptocurrency: CryptoCurrency): number {
    return Common.WEEKS_IN_A_YEAR * Consensus.getBlockHeightWeek(cryptocurrency);
  }

  public static getDefaultBaseFee(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        return new BigNumber(`1E${cryptocurrency.units[0].magnitude.toFixed()}`).dividedToIntegerBy(
          1000,
        ).dividedToIntegerBy(1000);
      case "grin":
      case "grin_testnet":
        return new BigNumber(`1E${cryptocurrency.units[0].magnitude.toFixed()}`)
          .dividedToIntegerBy(100)
          .dividedToIntegerBy(20);
      case "epic_cash":
      case "epic_cash_floonet":
        return new BigNumber(`1E${cryptocurrency.units[0].magnitude.toFixed()}`).dividedToIntegerBy(
          1000,
        );
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getCoinbaseMaturity(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
      case "epic_cash":
      case "epic_cash_floonet":
        return Consensus.getBlockHeightDay(cryptocurrency);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getBlockOutputWeight(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
      case "epic_cash":
      case "epic_cash_floonet":
        return 21;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }
  public static getBlockKernelWeight(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
      case "epic_cash":
      case "epic_cash_floonet":
        return 3;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getBlockInputWeight(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
      case "epic_cash":
      case "epic_cash_floonet":
        return 1;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getMaximumBlockWeight(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
      case "epic_cash":
      case "epic_cash_floonet":
        return 40000;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getHeaderVersion(cryptocurrency: CryptoCurrency, height: BigNumber): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
        if (height.isLessThan(Consensus.getC31HardForkHeight(cryptocurrency))) {
          return 1;
        } else {
          return 2;
        }
      case "grin":
        return BigNumber.minimum(
          height.dividedToIntegerBy(Consensus.getHardForkInterval(cryptocurrency)).plus(1),
          Consensus.getMaximumHeaderVersion(cryptocurrency),
        ).toNumber();
      case "grin_testnet":
        if (height.isLessThan(Consensus.getFirstHardForkHeight(cryptocurrency))) {
          return 1;
        } else if (height.isLessThan(Consensus.getSecondHardForkHeight(cryptocurrency))) {
          return 2;
        } else if (height.isLessThan(Consensus.getThirdHardForkHeight(cryptocurrency))) {
          return 3;
        } else if (height.isLessThan(Consensus.getFourthHardForkHeight(cryptocurrency))) {
          return 4;
        } else {
          return 5;
        }
      case "epic_cash":
      case "epic_cash_floonet":
        if (height.isLessThan(Consensus.getFirstHardForkHeight(cryptocurrency))) {
          return 6;
        } else {
          return 7;
        }
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static isNoRecentDuplicateKernelsEnabled(cryptocurrency: CryptoCurrency): boolean {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin_floonet":
      case "grin_testnet":
        return true;
      case "mimblewimble_coin":
      case "grin":
      case "epic_cash":
      case "epic_cash_floonet":
        return false;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getMaximumRelativeHeight(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
        return Consensus.getBlockHeightWeek(cryptocurrency);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getBodyWeightOutputFactor(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "epic_cash":
      case "epic_cash_floonet":
        return 4;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getMaximumFee(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "epic_cash":
      case "epic_cash_floonet":
        return Number.POSITIVE_INFINITY;
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
        return Math.pow(2, 40) - 1;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getNodeName(cryptocurrency: CryptoCurrency): string {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
        return "MimbleWimble Coin";
      case "mimblewimble_coin_floonet":
        return "MimbleWimble Coin floonet";
      case "grin":
        return "Grin";
      case "grin_testnet":
        return "Grin testnet";
      case "epic_cash":
        return "Epic Cash";
      case "epic_cash_floonet":
        return "Epic Cash floonet";
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  public static getHardwareWalletStartingHeight(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
        return new BigNumber(1239928);
      case "mimblewimble_coin_floonet":
        return new BigNumber(1115028);
      case "grin":
        return new BigNumber(1687446);
      case "grin_testnet":
        return new BigNumber(1195819);
      case "epic_cash":
        return new BigNumber(1943415);
      case "epic_cash_floonet":
        return new BigNumber(0);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getC31HardForkHeight(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
        return new BigNumber(202500);
      case "mimblewimble_coin_floonet":
        return new BigNumber(270000);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getHardForkInterval(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "grin":
        return Math.floor(Consensus.getBlockHeightYear(cryptocurrency) / 2);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getMaximumHeaderVersion(cryptocurrency: CryptoCurrency): number {
    switch (cryptocurrency.id) {
      case "grin":
        return 5;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getFirstHardForkHeight(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "grin_testnet":
        return new BigNumber(185040);
      case "epic_cash":
        return new BigNumber(9000000);
      case "epic_cash_floonet":
        return new BigNumber(25800);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getSecondHardForkHeight(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "grin_testnet":
        return new BigNumber(298080);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getThirdHardForkHeight(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "grin_testnet":
        return new BigNumber(552960);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getFourthHardForkHeight(cryptocurrency: CryptoCurrency): BigNumber {
    switch (cryptocurrency.id) {
      case "grin_testnet":
        return new BigNumber(642240);
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }
}
