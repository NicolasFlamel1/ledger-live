import semver from "semver";
import { shouldUseTrustedInputForSegwit } from "@ledgerhq/hw-app-btc/shouldUseTrustedInputForSegwit";
import { getDependencies } from "./polyfill";
import { getEnv } from "../env";

export function shouldUpgrade(appName: string, appVersion: string): boolean {
  if (getEnv("DISABLE_APP_VERSION_REQUIREMENTS")) return false;
  const deps = getDependencies(appName);

  if (
    (deps.includes("Bitcoin") &&
      shouldUseTrustedInputForSegwit({
        name: appName,
        version: "1.4.0",
      })) ||
    appName === "Bitcoin"
  ) {
    // https://donjon.ledger.com/lsb/010/
    return !semver.satisfies(appVersion || "", ">= 1.4.0", {
      includePrerelease: true, // this will allow pre-release tags that would otherwise return false. E.g. 1.0.0-dev
    });
  }

  return false;
}
const appVersionsRequired = {
  Cosmos: ">= 2.34.4",
  Algorand: ">= 1.2.9",
  MultiversX: ">= 1.0.18",
  Polkadot: ">= 20.9370.0",
  Ethereum: ">= 1.10.1-0",
  Solana: ">= 1.2.0",
  Celo: ">= 1.1.8",
  "Cardano ADA": ">= 4.1.0",
  Zcash: "> 2.0.6",
  "MimbleWimble Coin": ">= 6.0.1",
  "MimbleWimble Coin Floonet": ">= 6.0.1",
  Grin: ">= 6.0.1",
  "Grin Testnet": ">= 6.0.1",
  "Epic Cash": ">= 7.1.0",
  "Epic Cash Floonet": ">= 7.1.0",
  NEAR: ">= 1.2.1",
};
export function mustUpgrade(appName: string, appVersion: string): boolean {
  if (getEnv("DISABLE_APP_VERSION_REQUIREMENTS")) return false;
  const range = appVersionsRequired[appName];

  if (range) {
    return !semver.satisfies(appVersion || "", range, {
      includePrerelease: true, // this will allow pre-release tags that would otherwise return false. E.g. 1.0.0-dev
    });
  }

  return false;
}
