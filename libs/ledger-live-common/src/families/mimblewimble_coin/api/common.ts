import os from "os";
import BigNumber from "bignumber.js";

export default class Common {
  public static readonly MILLISECONDS_IN_A_SECOND = 1000;
  public static readonly SECONDS_IN_A_MINUTE = 60;
  public static readonly MINUTES_IN_AN_HOUR = 60;
  public static readonly HOURS_IN_A_DAY = 24;
  public static readonly DAYS_IN_A_WEEK = 7;
  public static readonly WEEKS_IN_A_YEAR = 52;
  public static readonly BITS_IN_A_BYTE = 8;
  public static readonly BYTES_IN_A_KILOBYTE = 1024;
  public static readonly KILOBYTES_IN_A_MEGABYTE = 1024;
  public static readonly MEGABYTES_IN_A_GIGABYTE = 1024;
  private static readonly HIGH_MEMORY_DEVICE_RAM_THRESHOLD_GIGABYTES = 4;
  public static readonly UUID_DATA_VARIANT_OFFSET = 8;
  public static readonly UUID_VARIANT_TWO_BITMASK = 0b1110;
  public static readonly UUID_VARIANT_TWO_BITMASK_RESULT = 0b1100;
  public static readonly UUID_FIRST_SECTION_SERIALIZED_LENGTH = 4;
  public static readonly UUID_SECOND_SECTION_SERIALIZED_LENGTH = 2;
  public static readonly UUID_THIRD_SECTION_SERIALIZED_LENGTH = 2;
  public static readonly UUID_FOURTH_SECTION_SERIALIZED_LENGTH = 2;
  public static readonly UUID_FIFTH_SECTION_SERIALIZED_LENGTH = 6;

  private constructor() {}

  public static isHexString(string: string): boolean {
    if (typeof string !== "string") {
      return false;
    }
    return /^(?:[0-9A-F]{2})+$/iu.test(string);
  }

  public static isNumberString(string: string): boolean {
    if (typeof string !== "string") {
      return false;
    }
    return /^[+-]?(?:0(?:\.\d+)?|[1-9]\d*(?:\.\d+)?|\.\d+)$/u.test(string);
  }

  public static isLowMemoryDevice(): boolean {
    return (
      os.totalmem() /
        Common.BYTES_IN_A_KILOBYTE /
        Common.KILOBYTES_IN_A_MEGABYTE /
        Common.MEGABYTES_IN_A_GIGABYTE <
      Common.HIGH_MEMORY_DEVICE_RAM_THRESHOLD_GIGABYTES
    );
  }

  public static isUuidString(string: string): boolean {
    if (typeof string !== "string") {
      return false;
    }
    return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/iu.test(string);
  }

  public static isRandomUuid(uuid: string): boolean {
    return uuid[14] === "4";
  }

  public static isPureObject(value: any): boolean {
    try {
      return Object.getPrototypeOf(value).constructor.name === "Object";
    } catch (error: any) {
      return false;
    }
  }

  public static isPrintableCharacter(character: number): boolean {
    return character >= " ".charCodeAt(0) && character <= "~".charCodeAt(0);
  }

  public static isReactNative(): boolean {
    return typeof navigator !== "undefined" && navigator.product === "ReactNative";
  }

  public static subarray(buffer: Buffer, start = 0, end?: number): Buffer {
    const result = buffer.subarray(start, end);
    return result instanceof Buffer || (!Common.isPureObject(result) && Buffer.isBuffer(result))
      ? result
      : Buffer.from(result);
  }

  public static async resolveIfPromise(value: any): Promise<any> {
    const result: any = value instanceof Promise ? await value : value;
    return result instanceof Uint8Array &&
      !(result instanceof Buffer) &&
      (Common.isPureObject(result) || !Buffer.isBuffer(result))
      ? Buffer.from(result)
      : result;
  }

  public static isBigNumber(value: any): boolean {
    return (
      value instanceof BigNumber || (!Common.isPureObject(value) && BigNumber.isBigNumber(value))
    );
  }

  public static arraysAreEqualTimingSafe(arrayOne: Buffer, arrayTwo: Buffer): boolean {
    let result: number = arrayOne.length === arrayTwo.length ? 0 : 1;
    for (let i = 0; i < arrayOne.length; ++i) {
      const arrayOneValue = arrayOne[i];
      const arrayTwoValue = i < arrayTwo.length ? arrayTwo[i] : 0;
      result |= arrayOneValue === arrayTwoValue ? 0 : 1;
    }
    return result === 0;
  }
}
