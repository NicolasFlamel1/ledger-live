#!/usr/bin/env zx
import "zx/globals";
import rimraf from "rimraf";

const basePath = path.join(__dirname, "..", "src");
const generatedPath = path.join(basePath, "generated");

await new Promise((resolve, reject) => {
  rimraf(generatedPath, e => {
    if (e) {
      echo(chalk.red(e));
      return reject(e);
    }
    return resolve(fs.promises.mkdir(generatedPath));
  });
});

const dirContent = await fs.promises.readdir(path.join(basePath, "families"), {
  withFileTypes: true,
});

const families = dirContent
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

const targets = [
  "operationDetails",
  "accountActions",
  "TransactionConfirmFields",
  "AccountHeader",
  "AccountBodyHeader",
  "AccountSubHeader",
  "SendAmountFields",
  "screens",
  "SendRowsCustom",
  "SendRowsFee",
  "AccountBalanceSummaryFooter",
  "SubAccountList",
  "Confirmation",
  "ConnectDevice",
  "NoAssociatedAccounts",
  "AddAccountsAccounts",
  "SendRecipientFields",
  "SendFundsConnectDevice",
  "ReceiveFundsAddAccount",
];

async function genTarget(target) {
  let imports = ``;
  let exprts = `export default {`;
  const outpath = path.join(generatedPath, `${target}.ts`);

  for (const family of families) {
    const f = path.join(basePath, "families", family);
    const filesEnt = await fs.promises.readdir(f, { withFileTypes: true });
    const files = filesEnt
      .filter(ent => !ent.isDirectory())
      .map(ent => ent.name);
    const file = files.find(f => f.startsWith(target));
    if (file) {
      imports += `import ${family} from "../families/${family}/${target}";
`;
      exprts += `
  ${family},`;
    }
  }

  exprts += `
};
`;

  const str = `${imports}
${exprts}`;

  await fs.promises.writeFile(outpath, str, "utf8");
}

targets.map(genTarget);
