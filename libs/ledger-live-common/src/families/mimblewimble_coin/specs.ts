import type { AppSpec, MutationSpec } from "../../bot/types";
import type { Transaction } from "./types";
import { DeviceModelId } from "@ledgerhq/devices";
import { getCryptoCurrencyById } from "../../currencies";

const mimbleWimbleCoinLikeMutations = (): MutationSpec<Transaction>[] => [];

const mimblewimble_coin: AppSpec<Transaction> = {
  name: "MimbleWimble Coin",
  currency: getCryptoCurrencyById("mimblewimble_coin"),
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "MimbleWimble Coin",
  },
  mutations: mimbleWimbleCoinLikeMutations(),
} as any;

const mimblewimble_coin_floonet: AppSpec<Transaction> = {
  name: "MimbleWimble Coin Floonet",
  currency: getCryptoCurrencyById("mimblewimble_coin_floonet"),
  dependency: "MimbleWimble Coin",
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "MimbleWimble Coin Floonet",
  },
  mutations: mimbleWimbleCoinLikeMutations(),
} as any;

const grin: AppSpec<Transaction> = {
  name: "Grin",
  currency: getCryptoCurrencyById("grin"),
  dependency: "MimbleWimble Coin",
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "Grin",
  },
  mutations: mimbleWimbleCoinLikeMutations(),
} as any;

const grin_testnet: AppSpec<Transaction> = {
  name: "Grin Testnet",
  currency: getCryptoCurrencyById("grin_testnet"),
  dependency: "MimbleWimble Coin",
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "Grin Testnet",
  },
  mutations: mimbleWimbleCoinLikeMutations(),
} as any;

const epic_cash: AppSpec<Transaction> = {
  name: "Epic Cash",
  currency: getCryptoCurrencyById("epic_cash"),
  dependency: "MimbleWimble Coin",
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "Epic Cash",
  },
  mutations: mimbleWimbleCoinLikeMutations(),
} as any;

const epic_cash_floonet: AppSpec<Transaction> = {
  name: "Epic Cash Floonet",
  currency: getCryptoCurrencyById("epic_cash_floonet"),
  dependency: "MimbleWimble Coin",
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "Epic Cash Floonet",
  },
  mutations: mimbleWimbleCoinLikeMutations(),
} as any;

export default {
  mimblewimble_coin,
  mimblewimble_coin_floonet,
  grin,
  grin_testnet,
  epic_cash,
  epic_cash_floonet,
};
