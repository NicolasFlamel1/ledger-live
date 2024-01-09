import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import type {
  Account,
  AccountBridge,
  AccountLike,
  CurrencyBridge,
  ScanAccountEvent,
  ScanAccountEventRaw,
  TransactionCommon,
} from "@ledgerhq/types-live";
import { fromAccountRaw, toAccountRaw } from "../account";
import * as impl from "./impl";
export type Proxy = {
  getAccountBridge: typeof getAccountBridge;
  getCurrencyBridge: typeof getCurrencyBridge;
};
let proxy: Proxy | null | undefined;
export const setBridgeProxy = (p: Proxy | null | undefined): void => {
  if (p && p.getAccountBridge === getAccountBridge) {
    throw new Error("setBridgeProxy can't be called with same bridge functions!");
  }

  proxy = p;
};
export const getCurrencyBridge = (currency: CryptoCurrency): CurrencyBridge =>
  (proxy || impl).getCurrencyBridge(currency);
export const getAccountBridge = <T extends TransactionCommon = any>(
  account: AccountLike,
  parentAccount?: Account | null | undefined,
): AccountBridge<T> => (proxy || impl).getAccountBridge(account, parentAccount);
export function fromScanAccountEventRaw(raw: ScanAccountEventRaw): ScanAccountEvent {
  switch (raw.type) {
    case "discovered":
      return {
        type: raw.type,
        account: fromAccountRaw(raw.account),
      };

    case "device-root-public-key-requested":
      return {
        type: raw.type,
        index: raw.index,
      };

    case "device-root-public-key-granted":
      return {
        type: raw.type,
      };

    case "synced-percent":
      return {
        type: raw.type,
        percent: raw.percent,
      };

    default:
      throw new Error("unsupported ScanAccountEvent " + (raw as ScanAccountEventRaw).type);
  }
}
export function toScanAccountEventRaw(e: ScanAccountEvent): ScanAccountEventRaw {
  switch (e.type) {
    case "discovered":
      return {
        type: e.type,
        account: toAccountRaw(e.account),
      };

    case "device-root-public-key-requested":
      return {
        type: e.type,
        index: e.index,
      };

    case "device-root-public-key-granted":
      return {
        type: e.type,
      };

    case "synced-percent":
      return {
        type: e.type,
        percent: e.percent,
      };

    default:
      throw new Error("unsupported ScanAccountEvent " + (e as ScanAccountEvent).type);
  }
}
