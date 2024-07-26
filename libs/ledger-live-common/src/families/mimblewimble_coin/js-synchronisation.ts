import {
  GetAccountShape,
  AccountShapeInfo,
  makeSync,
  makeScanAccounts,
} from "../../bridge/jsHelpers";
import { encodeAccountId } from "../../account";
import type { MimbleWimbleCoinAccount } from "./types";
import { Account, Address } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import BIPPath from "bip32-path";
import shajs from "sha.js";
import Sync from "./api/sync";
import MimbleWimbleCoin from "./hw-app-mimblewimble-coin";
import { DisconnectedDevice } from "@ledgerhq/errors";
import RecentHeight from "./api/recentHeight";
import Identifier from "./api/identifier";
import Crypto from "./api/crypto";
import Consensus from "./api/consensus";
import { withDevice } from "../../hw/deviceAccess";
import type Transport from "@ledgerhq/hw-transport";
import { from } from "rxjs";

const getAccountShape: GetAccountShape = async (
  info: AccountShapeInfo,
): Promise<Partial<Account>> => {
  const { currency, derivationMode, address, initialAccount, deviceId, derivationPath, o } = info;
  async function main(transport: Transport | undefined = undefined): Promise<Partial<Account>> {
    const cacheCleared =
      initialAccount && initialAccount.lastSyncDate.valueOf() === new Date(0).valueOf();
    let rootPublicKey: Buffer;
    let recentHeights: RecentHeight[];
    let nextIdentifier: Identifier;
    if (initialAccount) {
      rootPublicKey = (initialAccount as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
        .rootPublicKey;
      recentHeights = (initialAccount as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
        .recentHeights;
      nextIdentifier = (initialAccount as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
        .nextIdentifier;
    } else {
      if (transport) {
        const mimbleWimbleCoin = new MimbleWimbleCoin(transport, currency);
        if (o) {
          const bipPath = BIPPath.fromString(derivationPath).toPathArray();
          o.next({
            type: "device-root-public-key-requested",
            index: bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK,
          });
        }
        rootPublicKey = await mimbleWimbleCoin.getRootPublicKey(derivationPath);
        if (o) {
          o.next({
            type: "device-root-public-key-granted",
          });
        }
        recentHeights = [];
        nextIdentifier = new Identifier();
      } else {
        throw new DisconnectedDevice();
      }
    }
    const seedCookie = new shajs.sha512().update(rootPublicKey).digest("hex");
    const accountId = encodeAccountId({
      type: "js",
      version: "2",
      currencyId: currency.id,
      xpubOrAddress: seedCookie,
      derivationMode,
    });
    const {
      newOperations,
      newRecentHeights,
      newAccountHeight,
      newNextIdentifier,
      balanceChange,
      spendableBalanceChange,
    } = await Sync.sync(
      currency,
      rootPublicKey,
      initialAccount?.operations || [],
      initialAccount?.pendingOperations || [],
      cacheCleared ? [] : recentHeights,
      initialAccount
        ? new BigNumber(initialAccount.blockHeight)
        : Consensus.getHardwareWalletStartingHeight(currency),
      nextIdentifier,
      accountId,
      o,
    );
    const freshAddresses: Address[] = [
      {
        address: initialAccount?.freshAddress || address,
        derivationPath: initialAccount?.freshAddressPath || derivationPath,
      },
    ];
    if (!initialAccount && newOperations.length) {
      if (transport) {
        const bipPath = BIPPath.fromString(derivationPath).toPathArray();
        bipPath[Crypto.BIP44_PATH_INDEX_INDEX] = newOperations.length;
        const newDerivationPath = BIPPath.fromPathArray(bipPath).toString(true);
        const mimbleWimbleCoin = new MimbleWimbleCoin(transport, currency);
        const newAddress = await mimbleWimbleCoin.getAddress(newDerivationPath);
        freshAddresses.length = 0;
        freshAddresses.push({
          address: newAddress,
          derivationPath: newDerivationPath,
        });
      } else {
        throw new DisconnectedDevice();
      }
    }
    return {
      id: accountId,
      xpub: seedCookie,
      balance: initialAccount ? initialAccount.balance.plus(balanceChange) : balanceChange,
      spendableBalance: initialAccount
        ? initialAccount.spendableBalance.plus(spendableBalanceChange)
        : spendableBalanceChange,
      operations: newOperations,
      operationsCount: newOperations.length,
      freshAddress: freshAddresses[0].address,
      freshAddressPath: freshAddresses[0].derivationPath,
      blockHeight: newAccountHeight.toNumber(),
      mimbleWimbleCoinResources: {
        rootPublicKey,
        recentHeights: newRecentHeights,
        nextIdentifier: newNextIdentifier,
        nextTransactionSequenceNumber: initialAccount
          ? (initialAccount as MimbleWimbleCoinAccount).mimbleWimbleCoinResources
              .nextTransactionSequenceNumber
          : 0,
      },
    } as Partial<Account>;
  }
  if (!initialAccount) {
    if (deviceId !== undefined) {
      return (await withDevice(deviceId)((transport: Transport) =>
        from(main(transport)),
      ).toPromise()) as Partial<Account>;
    } else {
      throw new DisconnectedDevice();
    }
  } else {
    return await main();
  }
};

export const scanAccounts = makeScanAccounts({
  getAccountShape,
});

export const sync = makeSync({
  getAccountShape,
  shouldMergeOps: false,
});
