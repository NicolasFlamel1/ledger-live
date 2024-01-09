import axios from "axios";
import httpAdapter from "axios/lib/adapters/http";
import JSONBigNumber from "json-bignumber";
import { SocksProxyAgent } from "socks-proxy-agent";
import http from "http";
import https from "https";
import Common from "./common";
import { getEnv } from "@ledgerhq/live-env";

export default class JsonRpc {
  private static readonly TIMEOUT_SECONDS = 5 * Common.SECONDS_IN_A_MINUTE;

  private constructor() {}

  public static async sendRequest(
    url: string,
    noResponseError: Error,
    invalidResponseError: Error,
    allowInternalErrorString: boolean,
    method: string,
    parameters: any[] = [],
    parser: (string) => { [key: string]: any } = JSONBigNumber.parse,
  ): Promise<{ [key: string]: any }> {
    const torAgent = new SocksProxyAgent(getEnv("TOR_SOCKS_PROXY"));
    let useTor = false;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname.endsWith(".onion")) {
        useTor = true;
      }
    } catch (error: any) {
      // eslint-disable-next-line no-empty
    }
    let response: {
      data: any;
    };
    let platformSettings: { [key: string]: any } = {};
    if (!Common.isReactNative()) {
      platformSettings = {
        httpAgent: useTor ? torAgent : new http.Agent(),
        httpsAgent: useTor ? torAgent : new https.Agent(),
        adapter: httpAdapter,
      };
    }
    try {
      response = await axios({
        url: `${url}/v2/foreign`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip",
        },
        timeout: JsonRpc.TIMEOUT_SECONDS * Common.MILLISECONDS_IN_A_SECOND,
        data: JSONBigNumber.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: parameters,
        }),
        transformResponse: (response: string): { [key: string]: any } | null => {
          try {
            return parser(response);
          } catch (error: any) {
            return null;
          }
        },
        ...platformSettings,
      });
    } catch (error: any) {
      throw error.response || error.status ? invalidResponseError : noResponseError;
    }
    if (
      !Common.isPureObject(response.data) ||
      "error" in response.data ||
      !("result" in response.data)
    ) {
      throw invalidResponseError;
    }
    if (
      allowInternalErrorString &&
      Common.isPureObject(response.data.result) &&
      "Err" in response.data.result &&
      Common.isPureObject(response.data.result.Err) &&
      "Internal" in response.data.result.Err &&
      typeof response.data.result.Err.Internal === "string"
    ) {
      throw response.data.result.Err.Internal;
    }
    return Common.isPureObject(response.data.result) && "Ok" in response.data.result
      ? Array.isArray(response.data.result.Ok)
        ? response.data.result.Ok.length
          ? response.data.result.Ok[0]
          : undefined
        : response.data.result.Ok
      : undefined;
  }
}
