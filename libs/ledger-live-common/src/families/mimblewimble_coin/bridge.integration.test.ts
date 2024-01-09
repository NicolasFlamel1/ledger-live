import "../../__tests__/test-helpers/setup";
import { testBridge } from "../../__tests__/test-helpers/bridge";
import type { DatasetTest } from "@ledgerhq/types-live";
import type { Transaction } from "./types";
import mimblewimble_coin from "./datasets/mimblewimble_coin";
import mimblewimble_coin_floonet from "./datasets/mimblewimble_coin_floonet";
import grin from "./datasets/grin";
import grin_testnet from "./datasets/grin_testnet";
import epic_cash from "./datasets/epic_cash";
import epic_cash_floonet from "./datasets/epic_cash_floonet";

const dataset: DatasetTest<Transaction> = {
  implementations: ["js"],
  currencies: {
    mimblewimble_coin,
    mimblewimble_coin_floonet,
    grin,
    grin_testnet,
    epic_cash,
    epic_cash_floonet,
  },
};

testBridge(dataset);
