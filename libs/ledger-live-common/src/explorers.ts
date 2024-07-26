import type { CryptoCurrency, ExplorerView } from "@ledgerhq/types-cryptoassets";
import type { TokenAccount, Account, Operation } from "@ledgerhq/types-live";
import type { MimbleWimbleCoinOperationExtra } from "./families/mimblewimble_coin/types";

export const getDefaultExplorerView = (currency: CryptoCurrency): ExplorerView | undefined => {
  return currency.explorerViews ? currency.explorerViews[0] : undefined;
};

export const getTransactionExplorer = (
  explorerView: ExplorerView | undefined,
  txHash: string,
): string | undefined => {
  return explorerView?.tx?.replace("$hash", txHash);
};

export const getAddressExplorer = (
  explorerView: ExplorerView | undefined,
  address: string,
): string | undefined => {
  return explorerView?.address?.replace("$address", address);
};

export const getAccountContractExplorer = (
  explorerView: ExplorerView | undefined,
  account: TokenAccount,
  parentAccount: Account,
): string | undefined => {
  return explorerView?.token
    ?.replace("$contractAddress", account.token.contractAddress)
    .replace("$address", parentAccount.freshAddress);
};

export const getOperationExplorer = (
  currency: CryptoCurrency,
  operation: Operation,
): string | null | undefined => {
  const explorerView = getDefaultExplorerView(currency);
  switch (currency.family) {
    case "mimblewimble_coin":
      return (explorerView &&
        explorerView.custom &&
        operation.extra &&
        (operation.extra as MimbleWimbleCoinOperationExtra).kernelExcess &&
        explorerView.custom.replace(
          "$kernelExcess",
          (operation.extra as MimbleWimbleCoinOperationExtra).kernelExcess!.toString("hex"),
        )) as string | null | undefined;
  }
};

export const getStakePoolExplorer = (
  explorerView: ExplorerView | undefined,
  poolId: string,
): string | undefined => {
  return explorerView?.stakePool?.replace("$poolId", poolId);
};
