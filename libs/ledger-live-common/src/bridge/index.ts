import type { ScanAccountEvent, ScanAccountEventRaw } from "@ledgerhq/types-live";
import { fromAccountRaw, toAccountRaw } from "../account";
export { getCurrencyBridge, getAccountBridge } from "./impl";

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
