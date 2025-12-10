import JsonRpc from "./jsonRpc";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import {
  MimbleWimbleCoinNoResponseFromRecipient,
  MimbleWimbleCoinUnsupportedResponseFromRecipient,
} from "../errors";
import Common from "./common";

export default class WalletApi {
  private static readonly FOREIGN_API_VERSION = 2;

  private constructor() {}

  public static async getSupportedSlateVersions(url: string): Promise<string[]> {
    const { foreign_api_version, supported_slate_versions } = await JsonRpc.sendRequest(
      url,
      WalletApi.getNoResponseError(),
      WalletApi.getInvalidResponseError(),
      false,
      "check_version",
    );
    if (
      !Common.isBigNumber(foreign_api_version) ||
      !foreign_api_version.isEqualTo(WalletApi.FOREIGN_API_VERSION)
    ) {
      throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
        "Unsupported foreign API version from recipient",
      );
    }
    if (!Array.isArray(supported_slate_versions)) {
      throw new MimbleWimbleCoinUnsupportedResponseFromRecipient(
        "Invalid supported slate versions from recipient",
      );
    }
    const slatepackVersionIndex = supported_slate_versions.indexOf("SP");
    if (slatepackVersionIndex !== -1) {
      let removeSlatepackVersionSupport = false;
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname === "mwc.hotbit.io") {
          removeSlatepackVersionSupport = true;
        }
      } catch (error: any) {
        // eslint-disable-next-line no-empty
      }
      if (removeSlatepackVersionSupport) {
        supported_slate_versions.splice(slatepackVersionIndex, 1);
      }
    }
    return supported_slate_versions;
  }

  public static async getSerializedSlateResponse(
    cryptocurrency: CryptoCurrency,
    url: string,
    serializedSlate: { [key: string]: any } | string,
  ): Promise<{ [key: string]: any } | string> {
    let parameters: Array<any>;
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "grin":
      case "grin_testnet":
        parameters = [serializedSlate, null, null];
        break;
      case "epic_cash":
      case "epic_cash_floonet":
        parameters = [serializedSlate, null, null, null];
        break;
    }
    const serializedSlateResponse = await JsonRpc.sendRequest(
      url,
      WalletApi.getNoResponseError(),
      WalletApi.getInvalidResponseError(),
      false,
      "receive_tx",
      parameters,
    );
    return serializedSlateResponse;
  }

  private static getNoResponseError(): Error {
    return new MimbleWimbleCoinNoResponseFromRecipient("No response from recipient");
  }

  private static getInvalidResponseError(): Error {
    return new MimbleWimbleCoinUnsupportedResponseFromRecipient("Invalid response from recipient");
  }
}
