import { genAccount } from "@ledgerhq/coin-framework/mocks/account";
import { getDerivationModesForCurrency } from "@ledgerhq/coin-framework/derivation";
import { DeviceModelId } from "@ledgerhq/devices";
import { listCryptoCurrencies } from "@ledgerhq/cryptoassets/index";
import { setSupportedCurrencies } from "@ledgerhq/coin-framework/currencies/index";
import { accountDataToAccount, accountToAccountData, encode, decode } from "./cross";
import { Account } from "@ledgerhq/types-live";
import { accountUserDataExportSelector, initialState } from "../store";

setSupportedCurrencies(["ethereum", "ethereum_classic"]);

test("accountDataToAccount / accountToAccountData", () => {
  listCryptoCurrencies().forEach(currency => {
    getDerivationModesForCurrency(currency).forEach(derivationMode => {
      const account = genAccount(`${currency.id}_${derivationMode}`, { currency });
      const walletState = initialState;
      const data = accountToAccountData(
        account,
        accountUserDataExportSelector(walletState, { account }),
      );
      expect(accountToAccountData(...accountDataToAccount(data))).toMatchObject(data);
    });
  });
});
test("encode/decode", () => {
  const accounts = listCryptoCurrencies().reduce(
    (acc: Account[], currency) =>
      acc.concat(
        getDerivationModesForCurrency(currency).map(derivationMode => {
          const account = genAccount(`${currency.id}_${derivationMode}`, {
            currency,
          });
          return account;
        }),
      ),
    <Account[]>[],
  );
  const walletState = initialState;
  const data = {
    walletState,
    accounts,
    settings: {
      currenciesSettings: {},
      pairExchanges: {},
    },
    exporterName: "test你好👋",
    exporterVersion: "0.0.0",
    modelId: DeviceModelId.nanoX,
    modelIdList: [DeviceModelId.nanoX],
  };
  const exp = decode(encode(data));
  expect(exp.meta.exporterName).toEqual(data.exporterName);
  expect(exp.accounts.length).toEqual(data.accounts.length);
  expect(exp.accounts).toMatchObject(
    data.accounts.map(a =>
      accountToAccountData(a, accountUserDataExportSelector(walletState, { account: a })),
    ),
  );
  expect(exp.meta.modelId).toEqual("nanoX");
  expect(exp.meta.modelIdList).toEqual(["nanoX"]);
});
test("encode/decode", () => {
  const accounts = Array(3)
    .fill(null)
    .map((_, i) => genAccount("export_" + i));
  const walletState = {
    ...initialState,
    accountNames: new Map([
      [accounts[0].id, "uuwygRL0AmMrs9riAlv1"],
      [accounts[1].id, "4GEb2iRQXlUt6X1jviKzSz4umwWj"],
      [accounts[2].id, "tzPbPqv6XS7BabfsuJff"],
    ]),
  };
  const arg = {
    walletState,
    accounts,
    settings: {
      counterValue: "USD",
      pairExchanges: {
        BTC_USD: "KRAKEN",
      },
      currenciesSettings: {
        bitcoin: {
          confirmationsNb: 3,
        },
      },
      blacklistedTokenIds: ["tokenid1", "tokenid2"],
    },
    exporterName: "test",
    exporterVersion: "0.0.0",
    chunkSize: 100,
  };
  const data = encode(arg);
  const res = decode(data);
  expect(res.accounts).toMatchObject(
    accounts.map(a => ({
      balance: a.balance.toString(),
      currencyId: a.currency.id,
      id: a.id,
      index: a.index,
    })),
  );
  expect(res.settings).toMatchObject({
    counterValue: "USD",
    pairExchanges: {
      BTC_USD: "KRAKEN",
    },
    currenciesSettings: {
      bitcoin: {
        confirmationsNb: 3,
      },
    },
    blacklistedTokenIds: ["tokenid1", "tokenid2"],
  });
  expect(res.settings).not.toMatchObject({
    counterValue: "USD",
    pairExchanges: {
      BTC_USD: "KRAKEN",
    },
    currenciesSettings: {
      bitcoin: {
        confirmationsNb: 3,
      },
    },
    blacklistedTokenIds: ["tokenid3"],
  });
  expect(res.meta.modelId).toBeUndefined();
  expect(res.meta.modelIdList).toBeUndefined();
  expect(res).toMatchSnapshot();
});
