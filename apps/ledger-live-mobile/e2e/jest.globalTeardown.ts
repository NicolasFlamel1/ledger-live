const detoxGlobalTeardown = require("detox/runners/jest/globalTeardown");
import { promises as fs } from "fs";
import { getEnvs, getFlags } from "./bridge/server";
import { formatFlagsData, formatEnvData } from "@ledgerhq/live-common/e2e/index";
import { launchApp } from "./helpers";
import detox from "detox/internals";
import { Application } from "./page";
import { close as closeBridge } from "./bridge/server";

const environmentFilePath = "artifacts/environment.properties";
const shouldManageDetox = detox.getStatus() === "inactive";

export default async () => {
  if (process.env.CI) {
    try {
      await initDetox();
      await launchApp();
      const app = await Application.init("1AccountBTC1AccountETHReadOnlyFalse");
      await app.portfolio.waitForPortfolioPageToLoad();
      const flagsData = formatFlagsData(JSON.parse(await getFlags()));
      const envsData = formatEnvData(JSON.parse(await getEnvs()));
      await fs.appendFile(environmentFilePath, flagsData + envsData);
      closeBridge();
      await cleanupDetox();
    } catch (e) {
      console.error("Error during global setup", e);
      await cleanupDetox();
    }
  }
  await detoxGlobalTeardown();
};

async function initDetox() {
  if (detox.session.unsafe_earlyTeardown) {
    throw new Error("Detox halted test execution due to an early teardown request");
  }

  const opts = {
    workerId: `w${process.env.JEST_WORKER_ID}`,
  };

  if (shouldManageDetox) {
    await detox.init(opts);
  } else {
    await detox.installWorker(opts);
  }

  return detox.worker;
}

async function cleanupDetox() {
  if (shouldManageDetox) {
    await detox.cleanup();
  } else {
    await detox.uninstallWorker();
  }
}
