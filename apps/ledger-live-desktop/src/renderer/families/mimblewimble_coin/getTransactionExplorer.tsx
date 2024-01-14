import { ExplorerView } from "@ledgerhq/types-cryptoassets";
import { Operation } from "@ledgerhq/types-live";
import { MimbleWimbleCoinOperationExtra } from "@ledgerhq/live-common/families/mimblewimble_coin/types";

const getTransactionExplorer = (
  explorerView: ExplorerView | null | undefined,
  operation: Operation,
): string | null | undefined =>
  (explorerView &&
    explorerView.custom &&
    operation.extra &&
    (operation.extra as MimbleWimbleCoinOperationExtra).kernelExcess &&
    explorerView.custom.replace(
      "$kernelExcess",
      (operation.extra as MimbleWimbleCoinOperationExtra).kernelExcess!.toString("hex"),
    )) as string | null | undefined;

export default getTransactionExplorer;
