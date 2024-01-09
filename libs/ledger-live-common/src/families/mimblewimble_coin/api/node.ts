import { getEnv } from "@ledgerhq/live-env";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";
import JsonRpc from "./jsonRpc";
import Consensus from "./consensus";
import {
  MimbleWimbleCoinInvalidParameters,
  MimbleWimbleCoinNoResponseFromNode,
  MimbleWimbleCoinUnsupportedResponseFromNode,
  MimbleWimbleCoinBroadcastingTransactionFailed,
  MimbleWimbleCoinBroadcastingTransactionFailedUnknownReason,
} from "../errors";

export default class Node {
  private constructor() {}

  public static async getTip(cryptocurrency: CryptoCurrency): Promise<{
    tipHeight: BigNumber;
    tipHash: Buffer;
  }> {
    const { height, last_block_pushed } = await JsonRpc.sendRequest(
      Node.getNodeUrl(cryptocurrency),
      Node.getNoResponseError(cryptocurrency),
      Node.getInvalidResponseError(cryptocurrency),
      false,
      "get_tip",
    );
    return {
      tipHeight: height,
      tipHash: Buffer.from(last_block_pushed, "hex"),
    };
  }

  public static async getHeader(
    cryptocurrency: CryptoCurrency,
    height: BigNumber,
  ): Promise<{
    hash: Buffer;
    timestamp: Date;
  }> {
    const { hash, timestamp } = await JsonRpc.sendRequest(
      Node.getNodeUrl(cryptocurrency),
      Node.getNoResponseError(cryptocurrency),
      Node.getInvalidResponseError(cryptocurrency),
      false,
      "get_header",
      [height, null, null],
    );
    return {
      hash: Buffer.from(hash, "hex"),
      timestamp: new Date(timestamp),
    };
  }

  public static async getPmmrIndices(
    cryptocurrency: CryptoCurrency,
    startHeight: BigNumber,
    endHeight: BigNumber,
  ): Promise<{
    startIndex: BigNumber;
    endIndex: BigNumber;
  }> {
    const { last_retrieved_index, highest_index } = await JsonRpc.sendRequest(
      Node.getNodeUrl(cryptocurrency),
      Node.getNoResponseError(cryptocurrency),
      Node.getInvalidResponseError(cryptocurrency),
      false,
      "get_pmmr_indices",
      [startHeight, endHeight],
    );
    return {
      startIndex: last_retrieved_index,
      endIndex: highest_index,
    };
  }

  public static async getOutputs(
    cryptocurrency: CryptoCurrency,
    startIndex: BigNumber,
    endIndex: BigNumber,
    groupSize: number,
  ): Promise<{
    highestIndex: BigNumber;
    lastRetrievedIndex: BigNumber;
    outputs: {
      commitment: string;
      proof: string;
      type: string;
      height: number;
    }[];
  }> {
    const { highest_index, last_retrieved_index, outputs } = await JsonRpc.sendRequest(
      Node.getNodeUrl(cryptocurrency),
      Node.getNoResponseError(cryptocurrency),
      Node.getInvalidResponseError(cryptocurrency),
      false,
      "get_unspent_outputs",
      [BigNumber.maximum(startIndex, 1), BigNumber.maximum(endIndex, 1), groupSize, true],
      JSON.parse,
    );
    return {
      highestIndex: new BigNumber(highest_index),
      lastRetrievedIndex: new BigNumber(last_retrieved_index),
      outputs: outputs.map(
        ({
          commit,
          proof,
          output_type,
          block_height,
        }: {
          commit: string;
          proof: string;
          output_type: string;
          block_height: number;
        }): {
          commitment: string;
          proof: string;
          type: string;
          height: number;
        } => {
          return {
            commitment: commit,
            proof,
            type: output_type,
            height: block_height,
          };
        },
      ),
    };
  }

  public static async getOutput(
    cryptocurrency: CryptoCurrency,
    commitment: Buffer,
  ): Promise<{
    height: BigNumber | null;
    proof: Buffer | null;
  }> {
    const response = await JsonRpc.sendRequest(
      Node.getNodeUrl(cryptocurrency),
      Node.getNoResponseError(cryptocurrency),
      Node.getInvalidResponseError(cryptocurrency),
      false,
      "get_outputs",
      [[commitment.toString("hex")], null, null, true, false],
    );
    return {
      height: response ? response.block_height : null,
      proof: response ? Buffer.from(response.proof, "hex") : null,
    };
  }

  public static async getKernel(
    cryptocurrency: CryptoCurrency,
    excess: Buffer,
    startHeight: BigNumber,
    endHeight: BigNumber,
  ): Promise<{
    height: BigNumber | null;
  }> {
    const response = await JsonRpc.sendRequest(
      Node.getNodeUrl(cryptocurrency),
      Node.getNoResponseError(cryptocurrency),
      Node.getInvalidResponseError(cryptocurrency),
      false,
      "get_kernel",
      [excess.toString("hex"), startHeight, endHeight],
    );
    return {
      height: response ? response.height : null,
    };
  }

  public static async broadcastTransaction(
    cryptocurrency: CryptoCurrency,
    transaction: { [key: string]: any },
  ) {
    let response: any;
    try {
      response = await JsonRpc.sendRequest(
        Node.getNodeUrl(cryptocurrency),
        Node.getNoResponseError(cryptocurrency),
        Node.getInvalidResponseError(cryptocurrency),
        true,
        "push_transaction",
        [transaction, false],
      );
    } catch (error: any) {
      if (typeof error === "string") {
        throw new MimbleWimbleCoinBroadcastingTransactionFailed(
          "Failed to broadcast transaction to node",
          {
            reason: error,
          },
        );
      } else {
        throw error;
      }
    }
    if (response !== null) {
      throw new MimbleWimbleCoinBroadcastingTransactionFailedUnknownReason(
        "Failed to broadcast transaction to node",
      );
    }
  }

  private static getNodeUrl(cryptocurrency: CryptoCurrency): string {
    switch (cryptocurrency.id) {
      case "mimblewimble_coin":
        return getEnv("API_MIMBLEWIMBLE_COIN_NODE");
      case "mimblewimble_coin_floonet":
        return getEnv("API_MIMBLEWIMBLE_COIN_FLOONET_NODE");
      case "grin":
        return getEnv("API_GRIN_NODE");
      case "grin_testnet":
        return getEnv("API_GRIN_TESTNET_NODE");
      case "epic_cash":
        return getEnv("API_EPIC_CASH_NODE");
      case "epic_cash_floonet":
        return getEnv("API_EPIC_CASH_FLOONET_NODE");
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
  }

  private static getNoResponseError(cryptocurrency: CryptoCurrency): Error {
    return new MimbleWimbleCoinNoResponseFromNode("No response from node", {
      nodeName: Consensus.getNodeName(cryptocurrency),
    });
  }

  private static getInvalidResponseError(cryptocurrency: CryptoCurrency): Error {
    return new MimbleWimbleCoinUnsupportedResponseFromNode("Invalid response from node", {
      nodeName: Consensus.getNodeName(cryptocurrency),
    });
  }
}
