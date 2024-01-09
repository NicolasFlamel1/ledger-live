import type { Operation, ScanAccountEvent } from "@ledgerhq/types-live";
import { encodeOperationId } from "../../../operation";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";
import Identifier from "./identifier";
import RecentHeight from "./recentHeight";
import Consensus from "./consensus";
import Node from "./node";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import ProofBuilder from "./proofBuilder";
import Common from "./common";
import { Subscriber } from "rxjs";
import Crypto from "./crypto";
import type { MimbleWimbleCoinOperationExtra } from "../types";

export default class Sync {
  private static readonly MAXIMUM_NUMBER_OF_RECENT_HEIGHTS = 13;

  private constructor() {}

  public static async sync(
    cryptocurrency: CryptoCurrency,
    rootPublicKey: Buffer,
    operations: Operation[],
    pendingOperations: Operation[],
    recentHeights: RecentHeight[],
    accountHeight: BigNumber,
    nextIdentifier: Identifier,
    accountId: string,
    o?: Subscriber<ScanAccountEvent>,
  ): Promise<{
    newOperations: Operation[];
    newRecentHeights: RecentHeight[];
    newAccountHeight: BigNumber;
    newNextIdentifier: Identifier;
    balanceChange: BigNumber;
    spendableBalanceChange: BigNumber;
  }> {
    let balanceChange: BigNumber = new BigNumber(0);
    let spendableBalanceChange: BigNumber = new BigNumber(0);
    const tempRecentHeights: RecentHeight[] = recentHeights.map(
      (recentHeight: RecentHeight): RecentHeight => {
        return new RecentHeight(recentHeight.height, recentHeight.hash);
      },
    );
    const { tipHeight, tipHash } = await Node.getTip(cryptocurrency);
    if (
      !tipHeight.isZero() &&
      (!tempRecentHeights.length || tipHeight.isGreaterThanOrEqualTo(tempRecentHeights[0].height))
    ) {
      if (
        tempRecentHeights.length &&
        (!tempRecentHeights[0].height.isEqualTo(tipHeight) ||
          !tempRecentHeights[0].hash.equals(tipHash))
      ) {
        while (tempRecentHeights.length) {
          const { hash } = await Node.getHeader(cryptocurrency, tempRecentHeights[0].height);
          if (tempRecentHeights[0].hash.equals(hash)) {
            break;
          }
          tempRecentHeights.shift();
        }
      }
      const startHeight = BigNumber.minimum(
        tempRecentHeights.length
          ? tempRecentHeights[0].height.plus(1)
          : Consensus.getHardwareWalletStartingHeight(cryptocurrency),
        accountHeight.plus(1),
      );
      if (tipHeight.isGreaterThanOrEqualTo(startHeight)) {
        const proofBuilder = new ProofBuilder(rootPublicKey);
        let highestIdentifier: Identifier | undefined;
        const newOperations: Operation[] = [];
        const { startIndex, endIndex } = await Node.getPmmrIndices(
          cryptocurrency,
          startHeight,
          tipHeight,
        );
        if (startIndex.isLessThanOrEqualTo(endIndex)) {
          let lastSyncedPercent = 0;
          let getOutputs: Promise<{
            highestIndex: BigNumber;
            lastRetrievedIndex: BigNumber;
            outputs: {
              commitment: string;
              proof: string;
              type: string;
              height: number;
            }[];
          }> = Node.getOutputs(cryptocurrency, startIndex, endIndex, Sync.getOutputsGroupSize());
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { highestIndex, lastRetrievedIndex, outputs } = await getOutputs;
            if (highestIndex.isGreaterThan(lastRetrievedIndex)) {
              getOutputs = Node.getOutputs(
                cryptocurrency,
                lastRetrievedIndex.plus(1),
                endIndex,
                Sync.getOutputsGroupSize(),
              );
            }
            for (const output of outputs) {
              if (o) {
                const syncedPercent = tipHeight.minus(startHeight).isZero()
                  ? 100
                  : Math.min(
                      Math.floor(
                        BigNumber.maximum(new BigNumber(output.height).minus(startHeight), 0)
                          .dividedBy(tipHeight.minus(startHeight))
                          .multipliedBy(100)
                          .toNumber(),
                      ),
                      100,
                    );
                if (syncedPercent !== lastSyncedPercent) {
                  o.next({
                    type: "synced-percent",
                    percent: syncedPercent,
                  });
                  lastSyncedPercent = syncedPercent;
                }
              }
              let rewindNonce: Buffer;
              const outputCommitment = Buffer.from(output.commitment, "hex");
              try {
                rewindNonce = await proofBuilder.getRewindNonce(outputCommitment);
              } catch (error: any) {
                continue;
              }
              const outputProof = Buffer.from(output.proof, "hex");
              const bulletproof = await Common.resolveIfPromise(
                Secp256k1Zkp.rewindBulletproof(outputProof, outputCommitment, rewindNonce),
              );
              if (bulletproof !== Secp256k1Zkp.OPERATION_FAILED) {
                const amount = new BigNumber(bulletproof["Value"]);
                const message = Buffer.from(bulletproof["Message"]);
                let messageComponents: {
                  identifier: Identifier;
                  switchType: number;
                };
                try {
                  messageComponents = ProofBuilder.decodeMessage(message);
                } catch (error: any) {
                  continue;
                }
                if (
                  await Common.resolveIfPromise(
                    Secp256k1Zkp.verifyBulletproof(outputProof, outputCommitment, Buffer.alloc(0)),
                  )
                ) {
                  if (messageComponents.switchType !== Crypto.SwitchType.NONE) {
                    const outputHeight = new BigNumber(output.height);
                    let identifierHeight: BigNumber | null =
                      messageComponents.identifier.getHeight(cryptocurrency);
                    if (identifierHeight) {
                      identifierHeight = identifierHeight.plus(
                        outputHeight
                          .dividedBy(Identifier.MAXIMUM_HEIGHT + 1)
                          .decimalPlaces(0, BigNumber.ROUND_HALF_CEIL)
                          .multipliedBy(Identifier.MAXIMUM_HEIGHT + 1),
                      );
                      if (
                        identifierHeight
                          .minus(outputHeight)
                          .isGreaterThan(
                            Sync.getIdentifierHeightOverageThreshold(cryptocurrency),
                          ) &&
                        identifierHeight.isGreaterThanOrEqualTo(Identifier.MAXIMUM_HEIGHT + 1)
                      ) {
                        identifierHeight = identifierHeight.minus(Identifier.MAXIMUM_HEIGHT + 1);
                      }
                      if (
                        outputHeight
                          .minus(identifierHeight)
                          .isGreaterThan(Sync.getReplayDetectionThreshold(cryptocurrency))
                      ) {
                        continue;
                      }
                    }
                    if (!highestIdentifier) {
                      highestIdentifier = new Identifier();
                    }
                    if (messageComponents.identifier.includesValue(highestIdentifier)) {
                      highestIdentifier = messageComponents.identifier.removeExtras(cryptocurrency);
                    }
                    const { hash, timestamp } = await Node.getHeader(cryptocurrency, outputHeight);
                    newOperations.unshift({
                      id: encodeOperationId(accountId, output.commitment, "IN"),
                      hash: "",
                      type: output.type === "Coinbase" ? "COINBASE_REWARD" : "IN",
                      value: amount,
                      fee: new BigNumber(-1),
                      senders: [],
                      recipients: [],
                      blockHeight: output.height,
                      blockHash: hash.toString("hex"),
                      accountId,
                      date: timestamp,
                      extra: {
                        outputCommitment,
                        identifier: messageComponents.identifier,
                        switchType: messageComponents.switchType,
                        spent: false,
                        kernelExcess: null,
                        kernelOffset: null,
                        recipientPaymentProofSignature: null,
                      },
                    });
                  }
                }
              }
            }
            if (highestIndex.isLessThanOrEqualTo(lastRetrievedIndex)) {
              break;
            }
          }
        }
        const newNextIdentifier =
          highestIdentifier && highestIdentifier.includesValue(nextIdentifier)
            ? highestIdentifier.getNext()
            : nextIdentifier;
        const tempOperations: Operation[] = operations.map((operation: Operation): Operation => {
          return {
            ...operation,
            extra: {
              ...(operation.extra as MimbleWimbleCoinOperationExtra),
            },
          };
        });
        for (let i: number = tempOperations.length - 1; i >= 0; --i) {
          if (
            tempOperations[i].type !== "OUT" &&
            tempOperations[i].blockHeight !== null &&
            !(tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent &&
            startHeight.isGreaterThan(tempOperations[i].blockHeight!)
          ) {
            const { height } = await Node.getOutput(
              cryptocurrency,
              (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).outputCommitment!,
            );
            if (height && height.isEqualTo(tempOperations[i].blockHeight!)) {
              break;
            } else {
              balanceChange = balanceChange.minus(tempOperations[i].value);
              if (
                tempOperations[i].type !== "COINBASE_REWARD" ||
                accountHeight.isGreaterThanOrEqualTo(
                  new BigNumber(tempOperations[i].blockHeight!)
                    .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                    .minus(1),
                )
              ) {
                spendableBalanceChange = spendableBalanceChange.minus(tempOperations[i].value);
              }
              (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent = true;
            }
          }
        }
        const checkedOperations: { [key: string]: Operation } = {};
        for (let i = 0; i < newOperations.length; ++i) {
          if (newOperations[i].id in checkedOperations) {
            newOperations.splice(i--, 1);
          } else {
            balanceChange = balanceChange.plus(newOperations[i].value);
            if (
              newOperations[i].type !== "COINBASE_REWARD" ||
              tipHeight.isGreaterThanOrEqualTo(
                new BigNumber(newOperations[i].blockHeight!)
                  .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                  .minus(1),
              )
            ) {
              spendableBalanceChange = spendableBalanceChange.plus(newOperations[i].value);
            }
            checkedOperations[newOperations[i].id] = newOperations[i];
          }
        }
        for (let i = 0; i < tempOperations.length; ++i) {
          if (tempOperations[i].id in checkedOperations) {
            if (
              tempOperations[i].blockHeight !== null ||
              (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent
            ) {
              balanceChange = balanceChange.minus(tempOperations[i].value);
              if (
                (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent ||
                tempOperations[i].type !== "COINBASE_REWARD" ||
                accountHeight.isGreaterThanOrEqualTo(
                  new BigNumber(tempOperations[i].blockHeight!)
                    .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                    .minus(1),
                )
              ) {
                spendableBalanceChange = spendableBalanceChange.minus(tempOperations[i].value);
              }
            }
            checkedOperations[tempOperations[i].id].hash = tempOperations[i].hash;
            checkedOperations[tempOperations[i].id].type = tempOperations[i].type;
            checkedOperations[tempOperations[i].id].fee = tempOperations[i].fee;
            checkedOperations[tempOperations[i].id].date = tempOperations[i].date;
            checkedOperations[tempOperations[i].id].senders = tempOperations[i].senders;
            checkedOperations[tempOperations[i].id].recipients = tempOperations[i].recipients;
            (
              checkedOperations[tempOperations[i].id].extra as MimbleWimbleCoinOperationExtra
            ).spent = (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent;
            (
              checkedOperations[tempOperations[i].id].extra as MimbleWimbleCoinOperationExtra
            ).kernelExcess = (
              tempOperations[i].extra as MimbleWimbleCoinOperationExtra
            ).kernelExcess;
            (
              checkedOperations[tempOperations[i].id].extra as MimbleWimbleCoinOperationExtra
            ).kernelOffset = (
              tempOperations[i].extra as MimbleWimbleCoinOperationExtra
            ).kernelOffset;
            (
              checkedOperations[tempOperations[i].id].extra as MimbleWimbleCoinOperationExtra
            ).recipientPaymentProofSignature = (
              tempOperations[i].extra as MimbleWimbleCoinOperationExtra
            ).recipientPaymentProofSignature;
            delete checkedOperations[tempOperations[i].id];
            tempOperations.splice(i--, 1);
          } else if (tempOperations[i].blockHeight !== null) {
            if (startHeight.isLessThanOrEqualTo(tempOperations[i].blockHeight!)) {
              if (tempOperations[i].type !== "OUT") {
                if (!(tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent) {
                  const { height, proof } = await Node.getOutput(
                    cryptocurrency,
                    (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).outputCommitment!,
                  );
                  let ownsOutput = false;
                  if (height) {
                    try {
                      const rewindNonce = await proofBuilder.getRewindNonce(
                        (tempOperations[i].extra as MimbleWimbleCoinOperationExtra)
                          .outputCommitment!,
                      );
                      const bulletproof = await Common.resolveIfPromise(
                        Secp256k1Zkp.rewindBulletproof(
                          proof,
                          (tempOperations[i].extra as MimbleWimbleCoinOperationExtra)
                            .outputCommitment,
                          rewindNonce,
                        ),
                      );
                      if (bulletproof !== Secp256k1Zkp.OPERATION_FAILED) {
                        const amount = new BigNumber(bulletproof["Value"]);
                        const message = Buffer.from(bulletproof["Message"]);
                        const { identifier, switchType } = ProofBuilder.decodeMessage(message);
                        if (
                          amount.isEqualTo(tempOperations[i].value) &&
                          identifier
                            .serialize()
                            .equals(
                              (
                                tempOperations[i].extra as MimbleWimbleCoinOperationExtra
                              ).identifier!.serialize(),
                            ) &&
                          switchType ===
                            (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).switchType
                        ) {
                          if (
                            await Common.resolveIfPromise(
                              Secp256k1Zkp.verifyBulletproof(
                                proof,
                                (tempOperations[i].extra as MimbleWimbleCoinOperationExtra)
                                  .outputCommitment,
                                Buffer.alloc(0),
                              ),
                            )
                          ) {
                            ownsOutput = true;
                          }
                        }
                      }
                    } catch (error: any) {
                      // eslint-disable-next-line no-empty
                    }
                  }
                  if (ownsOutput) {
                    const { hash } = await Node.getHeader(cryptocurrency, height!);
                    if (
                      tempOperations[i].type === "COINBASE_REWARD" &&
                      accountHeight.isGreaterThanOrEqualTo(
                        new BigNumber(tempOperations[i].blockHeight!)
                          .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                          .minus(1),
                      )
                    ) {
                      spendableBalanceChange = spendableBalanceChange.minus(
                        tempOperations[i].value,
                      );
                    }
                    tempOperations[i].blockHeight = height!.toNumber();
                    tempOperations[i].blockHash = hash.toString("hex");
                    if (
                      tempOperations[i].type === "COINBASE_REWARD" &&
                      tipHeight.isGreaterThanOrEqualTo(
                        new BigNumber(tempOperations[i].blockHeight!)
                          .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                          .minus(1),
                      )
                    ) {
                      spendableBalanceChange = spendableBalanceChange.plus(tempOperations[i].value);
                    }
                  } else {
                    balanceChange = balanceChange.minus(tempOperations[i].value);
                    if (
                      tempOperations[i].type !== "COINBASE_REWARD" ||
                      accountHeight.isGreaterThanOrEqualTo(
                        new BigNumber(tempOperations[i].blockHeight!)
                          .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                          .minus(1),
                      )
                    ) {
                      spendableBalanceChange = spendableBalanceChange.minus(
                        tempOperations[i].value,
                      );
                    }
                    if ((tempOperations[i].extra as MimbleWimbleCoinOperationExtra).kernelExcess) {
                      const { height } = await Node.getKernel(
                        cryptocurrency,
                        (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).kernelExcess!,
                        BigNumber.maximum(
                          new BigNumber(tempOperations[i].blockHeight!).minus(
                            Sync.getKernelHeightVariationThreshold(cryptocurrency),
                          ),
                          0,
                        ),
                        BigNumber.minimum(
                          new BigNumber(tempOperations[i].blockHeight!).plus(
                            Sync.getKernelHeightVariationThreshold(cryptocurrency),
                          ),
                          tipHeight,
                        ),
                      );
                      if (height) {
                        const { hash } = await Node.getHeader(cryptocurrency, height);
                        (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent = true;
                        tempOperations[i].blockHeight = height.toNumber();
                        tempOperations[i].blockHash = hash.toString("hex");
                      } else {
                        tempOperations[i].blockHeight = null;
                        tempOperations[i].blockHash = null;
                      }
                    } else {
                      tempOperations[i].blockHeight = null;
                      tempOperations[i].blockHash = null;
                    }
                  }
                } else if (
                  (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).kernelExcess
                ) {
                  const { height } = await Node.getKernel(
                    cryptocurrency,
                    (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).kernelExcess!,
                    BigNumber.maximum(
                      new BigNumber(tempOperations[i].blockHeight!).minus(
                        Sync.getKernelHeightVariationThreshold(cryptocurrency),
                      ),
                      0,
                    ),
                    BigNumber.minimum(
                      new BigNumber(tempOperations[i].blockHeight!).plus(
                        Sync.getKernelHeightVariationThreshold(cryptocurrency),
                      ),
                      tipHeight,
                    ),
                  );
                  if (height) {
                    const { hash } = await Node.getHeader(cryptocurrency, height);
                    tempOperations[i].blockHeight = height.toNumber();
                    tempOperations[i].blockHash = hash.toString("hex");
                  } else {
                    tempOperations[i].blockHeight = null;
                    tempOperations[i].blockHash = null;
                  }
                }
              } else {
                const { height } = await Node.getKernel(
                  cryptocurrency,
                  (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).kernelExcess!,
                  BigNumber.maximum(
                    new BigNumber(tempOperations[i].blockHeight!).minus(
                      Sync.getKernelHeightVariationThreshold(cryptocurrency),
                    ),
                    0,
                  ),
                  BigNumber.minimum(
                    new BigNumber(tempOperations[i].blockHeight!).plus(
                      Sync.getKernelHeightVariationThreshold(cryptocurrency),
                    ),
                    tipHeight,
                  ),
                );
                if (height) {
                  const { hash } = await Node.getHeader(cryptocurrency, height);
                  tempOperations[i].blockHeight = height.toNumber();
                  tempOperations[i].blockHash = hash.toString("hex");
                } else {
                  tempOperations[i].blockHeight = null;
                  tempOperations[i].blockHash = null;
                }
              }
            } else if (
              !(tempOperations[i].extra as MimbleWimbleCoinOperationExtra).spent &&
              tempOperations[i].type === "COINBASE_REWARD" &&
              accountHeight.isLessThan(
                new BigNumber(tempOperations[i].blockHeight!)
                  .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                  .minus(1),
              ) &&
              tipHeight.isGreaterThanOrEqualTo(
                new BigNumber(tempOperations[i].blockHeight!)
                  .plus(Consensus.getCoinbaseMaturity(cryptocurrency))
                  .minus(1),
              )
            ) {
              spendableBalanceChange = spendableBalanceChange.plus(tempOperations[i].value);
            }
          } else if (tempOperations[i].type === "OUT") {
            const { height } = await Node.getKernel(
              cryptocurrency,
              (tempOperations[i].extra as MimbleWimbleCoinOperationExtra).kernelExcess!,
              startHeight,
              tipHeight,
            );
            if (height) {
              const { hash } = await Node.getHeader(cryptocurrency, height);
              tempOperations[i].blockHeight = height.toNumber();
              tempOperations[i].blockHash = hash.toString("hex");
            }
          }
        }
        for (const pendingOperation of pendingOperations) {
          if (pendingOperation.id in checkedOperations) {
            if (pendingOperation.type === "NONE") {
              balanceChange = balanceChange.minus(pendingOperation.value);
            }
            checkedOperations[pendingOperation.id].hash = pendingOperation.hash;
            checkedOperations[pendingOperation.id].type = pendingOperation.type;
            checkedOperations[pendingOperation.id].fee = pendingOperation.fee;
            checkedOperations[pendingOperation.id].date = pendingOperation.date;
            checkedOperations[pendingOperation.id].senders = pendingOperation.senders;
            checkedOperations[pendingOperation.id].recipients = pendingOperation.recipients;
            (checkedOperations[pendingOperation.id].extra as MimbleWimbleCoinOperationExtra).spent =
              (pendingOperation.extra as MimbleWimbleCoinOperationExtra).spent;
            (
              checkedOperations[pendingOperation.id].extra as MimbleWimbleCoinOperationExtra
            ).kernelExcess = (
              pendingOperation.extra as MimbleWimbleCoinOperationExtra
            ).kernelExcess;
            (
              checkedOperations[pendingOperation.id].extra as MimbleWimbleCoinOperationExtra
            ).kernelOffset = (
              pendingOperation.extra as MimbleWimbleCoinOperationExtra
            ).kernelOffset;
            (
              checkedOperations[pendingOperation.id].extra as MimbleWimbleCoinOperationExtra
            ).recipientPaymentProofSignature = (
              pendingOperation.extra as MimbleWimbleCoinOperationExtra
            ).recipientPaymentProofSignature;
          }
          if (pendingOperation.type === "OUT") {
            let pendingOperationExists = false;
            for (const operation of tempOperations) {
              if (pendingOperation.id === operation.id) {
                pendingOperationExists = true;
                break;
              }
            }
            if (!pendingOperationExists) {
              const { height } = await Node.getKernel(
                cryptocurrency,
                (pendingOperation.extra as MimbleWimbleCoinOperationExtra).kernelExcess!,
                startHeight,
                tipHeight,
              );
              if (height) {
                const { hash } = await Node.getHeader(cryptocurrency, height);
                newOperations.unshift({
                  id: pendingOperation.id,
                  hash: pendingOperation.hash,
                  type: pendingOperation.type,
                  value: pendingOperation.value,
                  fee: pendingOperation.fee,
                  senders: pendingOperation.senders,
                  recipients: pendingOperation.recipients,
                  blockHeight: height.toNumber(),
                  blockHash: hash.toString("hex"),
                  accountId: pendingOperation.accountId,
                  date: pendingOperation.date,
                  extra: {
                    kernelExcess: (pendingOperation.extra as MimbleWimbleCoinOperationExtra)
                      .kernelExcess,
                    recipientPaymentProofSignature: (
                      pendingOperation.extra as MimbleWimbleCoinOperationExtra
                    ).recipientPaymentProofSignature,
                  },
                });
                balanceChange = balanceChange.minus(
                  pendingOperation.value.plus(pendingOperation.fee),
                );
              }
            }
          }
        }
        newOperations.sort((first: Operation, second: Operation): number => {
          return second.date.valueOf() - first.date.valueOf();
        });
        for (let i: number = newOperations.length - 1; i >= 0 && tempOperations.length; --i) {
          while (
            tempOperations.length &&
            tempOperations[tempOperations.length - 1].date.valueOf() <=
              newOperations[i].date.valueOf()
          ) {
            newOperations.splice(i + 1, 0, tempOperations.pop()!);
          }
        }
        while (tempOperations.length) {
          newOperations.splice(0, 0, tempOperations.pop()!);
        }
        const newRecentHeights: RecentHeight[] = [new RecentHeight(tipHeight, tipHash)];
        for (
          let i: number = newRecentHeights.length;
          i < Sync.MAXIMUM_NUMBER_OF_RECENT_HEIGHTS;
          ++i
        ) {
          const minimumAge = Sync.getMinimumAgeForRecentHeight(cryptocurrency, i - 1);
          const maximumAge = Sync.getMinimumAgeForRecentHeight(cryptocurrency, i) - 1;
          const idealHeight = BigNumber.maximum(
            tipHeight.minus(Math.ceil(minimumAge / Consensus.getBlockTimeSeconds(cryptocurrency))),
            0,
          );
          if (tempRecentHeights.length) {
            for (let j = 0; j < tempRecentHeights.length; ++j) {
              const age = tipHeight
                .minus(tempRecentHeights[j].height)
                .multipliedBy(Consensus.getBlockTimeSeconds(cryptocurrency));
              if (
                (age.isGreaterThanOrEqualTo(minimumAge) && age.isLessThanOrEqualTo(maximumAge)) ||
                (idealHeight.isZero() && tempRecentHeights[j].height.isZero())
              ) {
                newRecentHeights.push(
                  new RecentHeight(tempRecentHeights[j].height, tempRecentHeights[j].hash),
                );
                break;
              } else if (j === tempRecentHeights.length - 1) {
                const { hash } = await Node.getHeader(cryptocurrency, idealHeight);
                newRecentHeights.push(new RecentHeight(idealHeight, hash));
              }
            }
          } else {
            const { hash } = await Node.getHeader(cryptocurrency, idealHeight);
            newRecentHeights.push(new RecentHeight(idealHeight, hash));
          }
          if (idealHeight.isZero()) {
            break;
          }
        }
        if (o) {
          o.next({
            type: "synced-percent",
            percent: 100,
          });
        }
        return {
          newOperations,
          newRecentHeights,
          newAccountHeight: BigNumber.maximum(tipHeight, accountHeight),
          newNextIdentifier,
          balanceChange,
          spendableBalanceChange,
        };
      }
    }
    if (o) {
      o.next({
        type: "synced-percent",
        percent: 100,
      });
    }
    return {
      newOperations: operations,
      newRecentHeights: tempRecentHeights,
      newAccountHeight: BigNumber.maximum(tipHeight, accountHeight),
      newNextIdentifier: nextIdentifier,
      balanceChange,
      spendableBalanceChange,
    };
  }

  private static getIdentifierHeightOverageThreshold(cryptocurrency: CryptoCurrency): number {
    return Consensus.getBlockHeightWeek(cryptocurrency);
  }

  private static getReplayDetectionThreshold(cryptocurrency: CryptoCurrency): number {
    return Consensus.getBlockHeightWeek(cryptocurrency);
  }

  private static getOutputsGroupSize(): number {
    return Common.isLowMemoryDevice() ? 250 : 1000;
  }

  private static getMinimumAgeForRecentHeight(
    cryptocurrency: CryptoCurrency,
    index: number,
  ): number {
    return (
      Math.pow(index > 2 ? 3 : 2, index > 2 ? index - 1 : index) *
      Consensus.getBlockTimeSeconds(cryptocurrency)
    );
  }

  private static getKernelHeightVariationThreshold(cryptocurrency: CryptoCurrency): number {
    return Consensus.getBlockHeightWeek(cryptocurrency);
  }
}
