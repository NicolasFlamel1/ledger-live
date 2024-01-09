import type Transport from "@ledgerhq/hw-transport";
import BIPPath from "bip32-path";
import { UserRefusedAddress, UserRefusedOnDevice } from "@ledgerhq/errors";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";
import Crypto from "../api/crypto";
import Identifier from "../api/identifier";
import ProofBuilder from "../api/proofBuilder";
import SlateKernel from "../api/slateKernel";
import Secp256k1Zkp from "@nicolasflamel/secp256k1-zkp";
import { MimbleWimbleCoinInvalidParameters } from "../errors";
import Age from "../api/age";
import Common from "../api/common";
import Uint64Array from "../api/uint64Array";

export default class MimbleWimbleCoin {
  private transport: Transport;
  private cryptocurrency: CryptoCurrency;

  private static readonly CLASS = 0xc7;
  private static readonly Instruction = {
    GET_ROOT_PUBLIC_KEY: 0x00,
    GET_ADDRESS: 0x01,
    GET_SEED_COOKIE: 0x02,
    GET_COMMITMENT: 0x03,
    GET_BULLETPROOF_COMPONENTS: 0x04,
    VERIFY_ROOT_PUBLIC_KEY: 0x05,
    VERIFY_ADDRESS: 0x06,
    START_ENCRYPTING_SLATE: 0x07,
    CONTINUE_ENCRYPTING_SLATE: 0x08,
    FINISH_ENCRYPTING_SLATE: 0x09,
    START_DECRYPTING_SLATE: 0x0a,
    CONTINUE_DECRYPTING_SLATE: 0x0b,
    FINISH_DECRYPTING_SLATE: 0x0c,
    START_TRANSACTION: 0x0d,
    CONTINUE_TRANSACTION_INCLUDE_OUTPUT: 0x0e,
    CONTINUE_TRANSACTION_INCLUDE_INPUT: 0x0f,
    CONTINUE_TRANSACTION_APPLY_OFFSET: 0x10,
    CONTINUE_TRANSACTION_GET_PUBLIC_KEY: 0x11,
    CONTINUE_TRANSACTION_GET_PUBLIC_NONCE: 0x12,
    CONTINUE_TRANSACTION_GET_MESSAGE_SIGNATURE: 0x13,
    FINISH_TRANSACTION: 0x14,
    GET_MQS_CHALLENGE_SIGNATURE: 0x15,
    GET_LOGIN_CHALLENGE_SIGNATURE: 0x16,
  };
  private static readonly Status = {
    UNKNOWN_CLASS: 0xb100,
    UNKNOWN_INSTRUCTION: 0xb101,
    MALFORMED_REQUEST: 0xb102,
    USER_REJECTED: 0xb103,
    INTERNAL_ERROR: 0xb104,
    INVALID_PARAMETERS: 0xd100,
    INVALID_STATE: 0xd101,
    DEVICE_LOCKED: 0xd102,
    SUCCESS: 0x9000,
    OPERATING_SYSTEM_LOCKED: 0x5515,
  };
  private static readonly NO_PARAMETER = 0;
  private static readonly STATUS_LENGTH = 2;
  private static readonly AddressType = {
    MQS: 0,
    TOR: 1,
    SLATEPACK: 2,
  };
  public static readonly MessageType = {
    SENDING_TRANSACTION: 0,
    RECEIVING_TRANSACTION: 1,
    CREATING_COINBASE: 2,
  };
  private static readonly MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH = 64;
  private static readonly SLATE_DECRYPTED_CHUNK_DECRYPTION_ALGORITHM = "AES-256-CBC";
  private static readonly SLATE_DECRYPTED_CHUNK_DECRYPTION_INITIALIZATION_VECTOR = Buffer.alloc(16);
  private static readonly RESEND_ON_LOCK_DELAY_MILLISECONDS = 300;

  public constructor(transport: Transport, cryptocurrency: CryptoCurrency) {
    this.transport = transport;
    this.cryptocurrency = cryptocurrency;
    this.transport.decorateAppAPIMethods(this, ["getAddress"], "MWC");
  }

  public async getRootPublicKey(path: string): Promise<Buffer> {
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    const buffer = Buffer.alloc(Uint32Array.BYTES_PER_ELEMENT);
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    const getRootPublicKeyResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.GET_ROOT_PUBLIC_KEY,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [
        MimbleWimbleCoin.Status.USER_REJECTED,
        MimbleWimbleCoin.Status.DEVICE_LOCKED,
        MimbleWimbleCoin.Status.SUCCESS,
        MimbleWimbleCoin.Status.OPERATING_SYSTEM_LOCKED,
      ],
    );
    const status = getRootPublicKeyResponse.readUInt16BE(
      getRootPublicKeyResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    if (status === MimbleWimbleCoin.Status.USER_REJECTED) {
      throw new UserRefusedOnDevice();
    } else if (
      status === MimbleWimbleCoin.Status.DEVICE_LOCKED ||
      status === MimbleWimbleCoin.Status.OPERATING_SYSTEM_LOCKED
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, MimbleWimbleCoin.RESEND_ON_LOCK_DELAY_MILLISECONDS),
      );
      return await this.getRootPublicKey(path);
    }
    const rootPublicKey = Common.subarray(
      getRootPublicKeyResponse,
      0,
      getRootPublicKeyResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    return rootPublicKey;
  }

  public async getAddress(path: string, verify = false): Promise<string> {
    let addressType: number;
    switch (this.cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "epic_cash":
      case "epic_cash_floonet":
        addressType = MimbleWimbleCoin.AddressType.TOR;
        break;
      case "grin":
      case "grin_testnet":
        addressType = MimbleWimbleCoin.AddressType.SLATEPACK;
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    const buffer = Buffer.alloc(Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT);
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    buffer.writeUInt32LE(
      bipPath.length <= Crypto.BIP44_PATH_INDEX_INDEX
        ? Crypto.BIP44_PATH_DEFAULT_INDEX
        : bipPath[Crypto.BIP44_PATH_INDEX_INDEX],
      Uint32Array.BYTES_PER_ELEMENT,
    );
    const getAddressResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.GET_ADDRESS,
      addressType,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const address = Common.subarray(
      getAddressResponse,
      0,
      getAddressResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    ).toString();
    if (verify) {
      const verifyAddressResponse = await this.transport.send(
        MimbleWimbleCoin.CLASS,
        MimbleWimbleCoin.Instruction.VERIFY_ADDRESS,
        addressType,
        MimbleWimbleCoin.NO_PARAMETER,
        buffer,
        [
          MimbleWimbleCoin.Status.USER_REJECTED,
          MimbleWimbleCoin.Status.DEVICE_LOCKED,
          MimbleWimbleCoin.Status.SUCCESS,
          MimbleWimbleCoin.Status.OPERATING_SYSTEM_LOCKED,
        ],
      );
      const status = verifyAddressResponse.readUInt16BE(
        verifyAddressResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
      );
      if (status === MimbleWimbleCoin.Status.USER_REJECTED) {
        throw new UserRefusedAddress();
      } else if (
        status === MimbleWimbleCoin.Status.DEVICE_LOCKED ||
        status === MimbleWimbleCoin.Status.OPERATING_SYSTEM_LOCKED
      ) {
        await new Promise(resolve =>
          setTimeout(resolve, MimbleWimbleCoin.RESEND_ON_LOCK_DELAY_MILLISECONDS),
        );
        return await this.getAddress(path, verify);
      }
    }
    return address;
  }

  public async getCommitment(
    path: string,
    identifier: Identifier,
    amount: BigNumber,
    switchType: number,
  ): Promise<Buffer> {
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    if (amount.isLessThan(0) || amount.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
    }
    if (switchType < 0 || switchType > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid switch type");
    }
    const buffer = Buffer.alloc(
      Uint32Array.BYTES_PER_ELEMENT +
        Identifier.LENGTH +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint8Array.BYTES_PER_ELEMENT,
    );
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    identifier.serialize().copy(buffer, Uint32Array.BYTES_PER_ELEMENT);
    Uint64Array.writeLittleEndian(
      buffer,
      amount,
      Uint32Array.BYTES_PER_ELEMENT + Identifier.LENGTH,
    );
    buffer.writeUInt8(
      switchType,
      Uint32Array.BYTES_PER_ELEMENT + Identifier.LENGTH + Uint64Array.BYTES_PER_ELEMENT,
    );
    const getCommitmentResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.GET_COMMITMENT,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const commitment = Common.subarray(
      getCommitmentResponse,
      0,
      getCommitmentResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    return commitment;
  }

  public async getProof(
    rootPublicKey: Buffer,
    path: string,
    identifier: Identifier,
    amount: BigNumber,
    switchType: number,
    messageType: number,
  ): Promise<Buffer> {
    if (rootPublicKey.length !== Crypto.SECP256K1_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid root public key");
    }
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    if (amount.isLessThan(0) || amount.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
    }
    if (switchType < 0 || switchType > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid switch type");
    }
    if (
      messageType < MimbleWimbleCoin.MessageType.SENDING_TRANSACTION ||
      messageType > MimbleWimbleCoin.MessageType.CREATING_COINBASE
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid message type");
    }
    const buffer = Buffer.alloc(
      Uint32Array.BYTES_PER_ELEMENT +
        Identifier.LENGTH +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint8Array.BYTES_PER_ELEMENT,
    );
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    identifier.serialize().copy(buffer, Uint32Array.BYTES_PER_ELEMENT);
    Uint64Array.writeLittleEndian(
      buffer,
      amount,
      Uint32Array.BYTES_PER_ELEMENT + Identifier.LENGTH,
    );
    buffer.writeUInt8(
      switchType,
      Uint32Array.BYTES_PER_ELEMENT + Identifier.LENGTH + Uint64Array.BYTES_PER_ELEMENT,
    );
    const getBulletproofComponentsResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.GET_BULLETPROOF_COMPONENTS,
      messageType,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const tauX = Common.subarray(getBulletproofComponentsResponse, 0, Crypto.TAU_X_LENGTH);
    const tOne = Common.subarray(
      getBulletproofComponentsResponse,
      Crypto.TAU_X_LENGTH,
      Crypto.TAU_X_LENGTH + Crypto.SECP256K1_PUBLIC_KEY_LENGTH,
    );
    const tTwo = Common.subarray(
      getBulletproofComponentsResponse,
      Crypto.TAU_X_LENGTH + Crypto.SECP256K1_PUBLIC_KEY_LENGTH,
      Crypto.TAU_X_LENGTH + Crypto.SECP256K1_PUBLIC_KEY_LENGTH + Crypto.SECP256K1_PUBLIC_KEY_LENGTH,
    );
    const commitment = await this.getCommitment(path, identifier, amount, switchType);
    const proofBuilder = new ProofBuilder(rootPublicKey);
    const rewindNonce = await proofBuilder.getRewindNonce(commitment);
    const message = ProofBuilder.encodeMessage(identifier, switchType);
    const proof = await Common.resolveIfPromise(
      Secp256k1Zkp.createBulletproofBlindless(
        tauX,
        tOne,
        tTwo,
        commitment,
        amount.toFixed(),
        rewindNonce,
        Buffer.alloc(0),
        message,
      ),
    );
    if (
      proof === Secp256k1Zkp.OPERATION_FAILED ||
      !(await Common.resolveIfPromise(
        Secp256k1Zkp.verifyBulletproof(proof, commitment, Buffer.alloc(0)),
      ))
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid proof");
    }
    return proof;
  }

  public async startTransaction(
    path: string,
    output: BigNumber,
    input: BigNumber,
    fee: BigNumber,
    privateNonceIndex: number,
    recipientOrSenderPaymentProofAddress: string | null,
  ) {
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    if (output.isLessThan(0) || output.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid output");
    }
    if (input.isLessThan(0) || input.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid input");
    }
    if (fee.isLessThan(0) || fee.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid fee");
    }
    if (privateNonceIndex < 0 || privateNonceIndex > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid private nonce index");
    }
    if (recipientOrSenderPaymentProofAddress !== null && !recipientOrSenderPaymentProofAddress) {
      throw new MimbleWimbleCoinInvalidParameters(
        "Invalid recipient or sender payment proof address",
      );
    }
    const buffer = Buffer.alloc(
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint8Array.BYTES_PER_ELEMENT +
        (recipientOrSenderPaymentProofAddress !== null
          ? recipientOrSenderPaymentProofAddress.length
          : 0),
    );
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    buffer.writeUInt32LE(
      bipPath.length <= Crypto.BIP44_PATH_INDEX_INDEX
        ? Crypto.BIP44_PATH_DEFAULT_INDEX
        : bipPath[Crypto.BIP44_PATH_INDEX_INDEX],
      Uint32Array.BYTES_PER_ELEMENT,
    );
    Uint64Array.writeLittleEndian(
      buffer,
      output,
      Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT,
    );
    Uint64Array.writeLittleEndian(
      buffer,
      input,
      Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
    );
    Uint64Array.writeLittleEndian(
      buffer,
      fee,
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT,
    );
    buffer.writeUInt8(
      privateNonceIndex,
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT +
        Uint64Array.BYTES_PER_ELEMENT,
    );
    if (recipientOrSenderPaymentProofAddress !== null) {
      buffer.write(
        recipientOrSenderPaymentProofAddress,
        Uint32Array.BYTES_PER_ELEMENT +
          Uint32Array.BYTES_PER_ELEMENT +
          Uint64Array.BYTES_PER_ELEMENT +
          Uint64Array.BYTES_PER_ELEMENT +
          Uint64Array.BYTES_PER_ELEMENT +
          Uint8Array.BYTES_PER_ELEMENT,
      );
    }
    await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.START_TRANSACTION,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
  }

  public async includeOutputInTransaction(
    amount: BigNumber,
    identifier: Identifier,
    switchType: number,
  ) {
    if (amount.isLessThan(0) || amount.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
    }
    if (switchType < 0 || switchType > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid switch type");
    }
    const buffer = Buffer.alloc(
      Identifier.LENGTH + Uint64Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
    );
    identifier.serialize().copy(buffer, 0);
    Uint64Array.writeLittleEndian(buffer, amount, Identifier.LENGTH);
    buffer.writeUInt8(switchType, Identifier.LENGTH + Uint64Array.BYTES_PER_ELEMENT);
    await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.CONTINUE_TRANSACTION_INCLUDE_OUTPUT,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
  }

  public async includeInputInTransaction(
    amount: BigNumber,
    identifier: Identifier,
    switchType: number,
  ) {
    if (amount.isLessThan(0) || amount.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid amount");
    }
    if (switchType < 0 || switchType > 0xff) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid switch type");
    }
    const buffer = Buffer.alloc(
      Identifier.LENGTH + Uint64Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT,
    );
    identifier.serialize().copy(buffer, 0);
    Uint64Array.writeLittleEndian(buffer, amount, Identifier.LENGTH);
    buffer.writeUInt8(switchType, Identifier.LENGTH + Uint64Array.BYTES_PER_ELEMENT);
    await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.CONTINUE_TRANSACTION_INCLUDE_INPUT,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
  }

  public async applyOffsetToTransaction(offset: Buffer): Promise<number | null> {
    if (offset.length !== Crypto.SECP256K1_PRIVATE_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid offset");
    }
    const applyOffsetResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.CONTINUE_TRANSACTION_APPLY_OFFSET,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      offset,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    return applyOffsetResponse.length > MimbleWimbleCoin.STATUS_LENGTH
      ? applyOffsetResponse.readUInt8(0)
      : null;
  }

  public async getTransactionPublicKey(): Promise<Buffer> {
    const getTransactionPublicKeyResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.CONTINUE_TRANSACTION_GET_PUBLIC_KEY,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      undefined,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const transactionPublicKey = Common.subarray(
      getTransactionPublicKeyResponse,
      0,
      getTransactionPublicKeyResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    return transactionPublicKey;
  }

  public async getTransactionPublicNonce(): Promise<Buffer> {
    const getTransactionPublicNonceResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.CONTINUE_TRANSACTION_GET_PUBLIC_NONCE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      undefined,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const transactionPublicNonce = Common.subarray(
      getTransactionPublicNonceResponse,
      0,
      getTransactionPublicNonceResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    return transactionPublicNonce;
  }

  public async getTransactionSignature(
    publicNonceSum: Buffer,
    publicBlindExcessSum: Buffer,
    kernelFeatures: number,
    lockHeight: BigNumber,
    relativeHeight: BigNumber | null,
    excess: Buffer | null,
    recipientPaymentProofSignature: Buffer | null,
  ): Promise<{
    partialSignature: Buffer;
    paymentProofSignature: Buffer | null;
  }> {
    if (publicNonceSum.length !== Crypto.SECP256K1_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid public nonce sum");
    }
    if (publicBlindExcessSum.length !== Crypto.SECP256K1_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid public blind excess sum");
    }
    let addressType: number;
    switch (this.cryptocurrency.id) {
      case "mimblewimble_coin":
      case "mimblewimble_coin_floonet":
      case "epic_cash":
      case "epic_cash_floonet":
        addressType = MimbleWimbleCoin.AddressType.TOR;
        break;
      case "grin":
      case "grin_testnet":
        addressType = MimbleWimbleCoin.AddressType.SLATEPACK;
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid cryptocurrency");
    }
    let kernelInformation: Buffer;
    switch (kernelFeatures) {
      case SlateKernel.Features.COINBASE:
      case SlateKernel.Features.PLAIN:
        kernelInformation = Buffer.alloc(Uint8Array.BYTES_PER_ELEMENT);
        kernelInformation.writeUInt8(kernelFeatures, 0);
        break;
      case SlateKernel.Features.HEIGHT_LOCKED:
        if (lockHeight.isLessThan(0) || lockHeight.isGreaterThan("0xFFFFFFFFFFFFFFFF")) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid lock height");
        }
        kernelInformation = Buffer.alloc(
          Uint8Array.BYTES_PER_ELEMENT + Uint64Array.BYTES_PER_ELEMENT,
        );
        kernelInformation.writeUInt8(kernelFeatures, 0);
        Uint64Array.writeLittleEndian(kernelInformation, lockHeight, Uint8Array.BYTES_PER_ELEMENT);
        break;
      case SlateKernel.Features.NO_RECENT_DUPLICATE:
        if (
          !relativeHeight ||
          relativeHeight.isLessThan(0) ||
          relativeHeight.isGreaterThan("0xFFFF")
        ) {
          throw new MimbleWimbleCoinInvalidParameters("Invalid relative height");
        }
        kernelInformation = Buffer.alloc(
          Uint8Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT,
        );
        kernelInformation.writeUInt8(kernelFeatures, 0);
        kernelInformation.writeUInt16LE(relativeHeight.toNumber(), Uint8Array.BYTES_PER_ELEMENT);
        break;
      default:
        throw new MimbleWimbleCoinInvalidParameters("Invalid kernel features");
    }
    if (excess && excess.length !== Crypto.COMMITMENT_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid excess");
    }
    if (
      recipientPaymentProofSignature &&
      recipientPaymentProofSignature.length !== Crypto.ED25519_SIGNATURE_LENGTH
    ) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid recipient payment proof signature");
    }
    const buffer = Buffer.alloc(
      Crypto.SECP256K1_PUBLIC_KEY_LENGTH +
        Crypto.SECP256K1_PUBLIC_KEY_LENGTH +
        kernelInformation.length +
        (excess ? Crypto.COMMITMENT_LENGTH : 0) +
        (recipientPaymentProofSignature ? Crypto.ED25519_SIGNATURE_LENGTH : 0),
    );
    publicNonceSum.copy(buffer, 0);
    publicBlindExcessSum.copy(buffer, Crypto.SECP256K1_PUBLIC_KEY_LENGTH);
    kernelInformation.copy(
      buffer,
      Crypto.SECP256K1_PUBLIC_KEY_LENGTH + Crypto.SECP256K1_PUBLIC_KEY_LENGTH,
    );
    if (excess) {
      excess.copy(
        buffer,
        Crypto.SECP256K1_PUBLIC_KEY_LENGTH +
          Crypto.SECP256K1_PUBLIC_KEY_LENGTH +
          kernelInformation.length,
      );
    }
    if (recipientPaymentProofSignature) {
      recipientPaymentProofSignature.copy(
        buffer,
        Crypto.SECP256K1_PUBLIC_KEY_LENGTH +
          Crypto.SECP256K1_PUBLIC_KEY_LENGTH +
          kernelInformation.length +
          (excess ? Crypto.COMMITMENT_LENGTH : 0),
      );
    }
    const finishTransactionResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.FINISH_TRANSACTION,
      addressType,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [
        MimbleWimbleCoin.Status.USER_REJECTED,
        MimbleWimbleCoin.Status.DEVICE_LOCKED,
        MimbleWimbleCoin.Status.SUCCESS,
        MimbleWimbleCoin.Status.OPERATING_SYSTEM_LOCKED,
      ],
    );
    const status = finishTransactionResponse.readUInt16BE(
      finishTransactionResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    if (status === MimbleWimbleCoin.Status.USER_REJECTED) {
      throw new UserRefusedOnDevice();
    } else if (
      status === MimbleWimbleCoin.Status.DEVICE_LOCKED ||
      status === MimbleWimbleCoin.Status.OPERATING_SYSTEM_LOCKED
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, MimbleWimbleCoin.RESEND_ON_LOCK_DELAY_MILLISECONDS),
      );
      return await this.getTransactionSignature(
        publicNonceSum,
        publicBlindExcessSum,
        kernelFeatures,
        lockHeight,
        relativeHeight,
        excess,
        recipientPaymentProofSignature,
      );
    }
    const partialSignature = Common.subarray(
      finishTransactionResponse,
      0,
      Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH,
    );
    let paymentProofSignature: Buffer | null;
    if (
      finishTransactionResponse.length - MimbleWimbleCoin.STATUS_LENGTH >
      Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH
    ) {
      paymentProofSignature = Common.subarray(
        finishTransactionResponse,
        Crypto.SINGLE_SIGNER_SIGNATURE_LENGTH,
        finishTransactionResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
      );
    } else {
      paymentProofSignature = null;
    }
    return {
      partialSignature,
      paymentProofSignature,
    };
  }

  public async encryptSlatepackData(
    path: string,
    slatepackData: Buffer,
    recipientAddress: string,
  ): Promise<{
    nonce: Buffer;
    encryptedSlatepackData: Buffer;
  }> {
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    if (!slatepackData.length) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid Slatepack data");
    }
    if (!recipientAddress) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid recipient address");
    }
    const buffer = Buffer.alloc(
      Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT + recipientAddress.length,
    );
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    buffer.writeUInt32LE(
      bipPath.length <= Crypto.BIP44_PATH_INDEX_INDEX
        ? Crypto.BIP44_PATH_DEFAULT_INDEX
        : bipPath[Crypto.BIP44_PATH_INDEX_INDEX],
      Uint32Array.BYTES_PER_ELEMENT,
    );
    buffer.write(recipientAddress, Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT);
    const startEncryptingSlateResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.START_ENCRYPTING_SLATE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const nonce = Common.subarray(
      startEncryptingSlateResponse,
      0,
      Crypto.CHACHA20_POLY1305_NONCE_LENGTH,
    );
    let encryptedSlatepackData: Buffer = Buffer.alloc(0);
    for (
      let i = 0;
      i <
      Math.ceil(slatepackData.length / MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH);
      ++i
    ) {
      const decryptedChunk = Common.subarray(
        slatepackData,
        i * MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH,
        Math.min(
          slatepackData.length,
          (i + 1) * MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH,
        ),
      );
      const continueEncryptingSlateResponse = await this.transport.send(
        MimbleWimbleCoin.CLASS,
        MimbleWimbleCoin.Instruction.CONTINUE_ENCRYPTING_SLATE,
        MimbleWimbleCoin.NO_PARAMETER,
        MimbleWimbleCoin.NO_PARAMETER,
        decryptedChunk,
        [MimbleWimbleCoin.Status.SUCCESS],
      );
      const encryptedChunk = Common.subarray(
        continueEncryptingSlateResponse,
        0,
        continueEncryptingSlateResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
      );
      const temp = Buffer.alloc(encryptedSlatepackData.length + encryptedChunk.length);
      encryptedSlatepackData.copy(temp, 0);
      encryptedChunk.copy(temp, encryptedSlatepackData.length);
      encryptedSlatepackData = temp;
    }
    const finishEncryptingSlateResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.FINISH_ENCRYPTING_SLATE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      undefined,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const tag = Common.subarray(
      finishEncryptingSlateResponse,
      0,
      Crypto.CHACHA20_POLY1305_TAG_LENGTH,
    );
    const temp = Buffer.alloc(encryptedSlatepackData.length + tag.length);
    encryptedSlatepackData.copy(temp, 0);
    tag.copy(temp, encryptedSlatepackData.length);
    encryptedSlatepackData = temp;
    return {
      nonce,
      encryptedSlatepackData,
    };
  }

  public async decryptSlatepackData(
    path: string,
    nonce: Buffer,
    encryptedSlatepackData: Buffer,
    senderAddress: string,
  ): Promise<Buffer> {
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    if (nonce.length !== Crypto.CHACHA20_POLY1305_NONCE_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid nonce");
    }
    if (encryptedSlatepackData.length <= Crypto.CHACHA20_POLY1305_TAG_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid encrypted Slatepack data");
    }
    if (!senderAddress) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid sender address");
    }
    const buffer = Buffer.alloc(
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        nonce.length +
        senderAddress.length,
    );
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    buffer.writeUInt32LE(
      bipPath.length <= Crypto.BIP44_PATH_INDEX_INDEX
        ? Crypto.BIP44_PATH_DEFAULT_INDEX
        : bipPath[Crypto.BIP44_PATH_INDEX_INDEX],
      Uint32Array.BYTES_PER_ELEMENT,
    );
    nonce.copy(buffer, Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT);
    buffer.write(
      senderAddress,
      Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT + nonce.length,
    );
    await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.START_DECRYPTING_SLATE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const encryptedData = Common.subarray(
      encryptedSlatepackData,
      0,
      encryptedSlatepackData.length - Crypto.CHACHA20_POLY1305_TAG_LENGTH,
    );
    const tag = Common.subarray(
      encryptedSlatepackData,
      encryptedSlatepackData.length - Crypto.CHACHA20_POLY1305_TAG_LENGTH,
    );
    const decryptedChunks: Buffer[] = [];
    for (
      let i = 0;
      i <
      Math.ceil(encryptedData.length / MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH);
      ++i
    ) {
      const encryptedChunk = Common.subarray(
        encryptedData,
        i * MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH,
        Math.min(
          encryptedData.length,
          (i + 1) * MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH,
        ),
      );
      const continueDecryptingSlateResponse = await this.transport.send(
        MimbleWimbleCoin.CLASS,
        MimbleWimbleCoin.Instruction.CONTINUE_DECRYPTING_SLATE,
        MimbleWimbleCoin.NO_PARAMETER,
        MimbleWimbleCoin.NO_PARAMETER,
        encryptedChunk,
        [MimbleWimbleCoin.Status.SUCCESS],
      );
      const decryptedChunk = Common.subarray(
        continueDecryptingSlateResponse,
        0,
        continueDecryptingSlateResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
      );
      decryptedChunks.push(decryptedChunk);
    }
    const finishDecryptingSlateResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.FINISH_DECRYPTING_SLATE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      tag,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const key = Common.subarray(
      finishDecryptingSlateResponse,
      0,
      finishDecryptingSlateResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    let slatepackData: Buffer = Buffer.alloc(0);
    for (const decryptedChunk of decryptedChunks) {
      const chunk = await Crypto.aesDecrypt(
        MimbleWimbleCoin.SLATE_DECRYPTED_CHUNK_DECRYPTION_ALGORITHM,
        key,
        MimbleWimbleCoin.SLATE_DECRYPTED_CHUNK_DECRYPTION_INITIALIZATION_VECTOR,
        decryptedChunk,
      );
      const temp = Buffer.alloc(slatepackData.length + chunk.length);
      slatepackData.copy(temp, 0);
      chunk.copy(temp, slatepackData.length);
      slatepackData = temp;
    }
    return slatepackData;
  }

  public async decryptAgeChunk(
    path: string,
    ephemeralX25519PublicKey: Buffer,
    encryptedFileKey: Buffer,
    payloadKeyNonce: Buffer,
    nonce: Buffer,
    encryptedAgeData: Buffer,
  ): Promise<Buffer> {
    const bipPath = BIPPath.fromString(path).toPathArray();
    if (!this.verifyBipPath(bipPath)) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid path");
    }
    if (ephemeralX25519PublicKey.length !== Crypto.X25519_PUBLIC_KEY_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid ephemeral X25519 public key");
    }
    if (encryptedFileKey.length !== Age.FILE_KEY_LENGTH + Crypto.CHACHA20_POLY1305_TAG_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid encrypted file key");
    }
    if (payloadKeyNonce.length !== Age.PAYLOAD_NONCE_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid payload nonce");
    }
    if (nonce.length !== Crypto.CHACHA20_POLY1305_NONCE_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid nonce");
    }
    if (encryptedAgeData.length <= Crypto.CHACHA20_POLY1305_TAG_LENGTH) {
      throw new MimbleWimbleCoinInvalidParameters("Invalid encrypted age data");
    }
    const buffer = Buffer.alloc(
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        nonce.length +
        ephemeralX25519PublicKey.length +
        encryptedFileKey.length +
        payloadKeyNonce.length,
    );
    buffer.writeUInt32LE(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & ~Crypto.HARDENED_PATH_MASK, 0);
    buffer.writeUInt32LE(
      bipPath.length <= Crypto.BIP44_PATH_INDEX_INDEX
        ? Crypto.BIP44_PATH_DEFAULT_INDEX
        : bipPath[Crypto.BIP44_PATH_INDEX_INDEX],
      Uint32Array.BYTES_PER_ELEMENT,
    );
    nonce.copy(buffer, Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT);
    ephemeralX25519PublicKey.copy(
      buffer,
      Uint32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT + nonce.length,
    );
    encryptedFileKey.copy(
      buffer,
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        nonce.length +
        ephemeralX25519PublicKey.length,
    );
    payloadKeyNonce.copy(
      buffer,
      Uint32Array.BYTES_PER_ELEMENT +
        Uint32Array.BYTES_PER_ELEMENT +
        nonce.length +
        ephemeralX25519PublicKey.length +
        encryptedFileKey.length,
    );
    await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.START_DECRYPTING_SLATE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      buffer,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const encryptedData = Common.subarray(
      encryptedAgeData,
      0,
      encryptedAgeData.length - Crypto.CHACHA20_POLY1305_TAG_LENGTH,
    );
    const tag = Common.subarray(
      encryptedAgeData,
      encryptedAgeData.length - Crypto.CHACHA20_POLY1305_TAG_LENGTH,
    );
    const decryptedChunks: Buffer[] = [];
    for (
      let i = 0;
      i <
      Math.ceil(encryptedData.length / MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH);
      ++i
    ) {
      const encryptedChunk = Common.subarray(
        encryptedData,
        i * MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH,
        Math.min(
          encryptedData.length,
          (i + 1) * MimbleWimbleCoin.MAXIMUM_ENCRYPT_AND_DECRYPT_CHUNK_LENGTH,
        ),
      );
      const continueDecryptingSlateResponse = await this.transport.send(
        MimbleWimbleCoin.CLASS,
        MimbleWimbleCoin.Instruction.CONTINUE_DECRYPTING_SLATE,
        MimbleWimbleCoin.NO_PARAMETER,
        MimbleWimbleCoin.NO_PARAMETER,
        encryptedChunk,
        [MimbleWimbleCoin.Status.SUCCESS],
      );
      const decryptedChunk = Common.subarray(
        continueDecryptingSlateResponse,
        0,
        continueDecryptingSlateResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
      );
      decryptedChunks.push(decryptedChunk);
    }
    const finishDecryptingSlateResponse = await this.transport.send(
      MimbleWimbleCoin.CLASS,
      MimbleWimbleCoin.Instruction.FINISH_DECRYPTING_SLATE,
      MimbleWimbleCoin.NO_PARAMETER,
      MimbleWimbleCoin.NO_PARAMETER,
      tag,
      [MimbleWimbleCoin.Status.SUCCESS],
    );
    const key = Common.subarray(
      finishDecryptingSlateResponse,
      0,
      finishDecryptingSlateResponse.length - MimbleWimbleCoin.STATUS_LENGTH,
    );
    let ageData: Buffer = Buffer.alloc(0);
    for (const decryptedChunk of decryptedChunks) {
      const chunk = await Crypto.aesDecrypt(
        MimbleWimbleCoin.SLATE_DECRYPTED_CHUNK_DECRYPTION_ALGORITHM,
        key,
        MimbleWimbleCoin.SLATE_DECRYPTED_CHUNK_DECRYPTION_INITIALIZATION_VECTOR,
        decryptedChunk,
      );
      const temp = Buffer.alloc(ageData.length + chunk.length);
      ageData.copy(temp, 0);
      chunk.copy(temp, ageData.length);
      ageData = temp;
    }
    return ageData;
  }

  private verifyBipPath(bipPath: number[]): boolean {
    if (
      bipPath.length < Crypto.BIP44_PATH_PURPOSE_INDEX + 1 ||
      !(bipPath[Crypto.BIP44_PATH_PURPOSE_INDEX] & Crypto.HARDENED_PATH_MASK) ||
      (bipPath[Crypto.BIP44_PATH_PURPOSE_INDEX] & ~Crypto.HARDENED_PATH_MASK) !==
        Crypto.BIP44_PATH_DEFAULT_PURPOSE
    ) {
      return false;
    }
    if (
      bipPath.length < Crypto.BIP44_PATH_COIN_TYPE_INDEX + 1 ||
      !(bipPath[Crypto.BIP44_PATH_COIN_TYPE_INDEX] & Crypto.HARDENED_PATH_MASK) ||
      (bipPath[Crypto.BIP44_PATH_COIN_TYPE_INDEX] & ~Crypto.HARDENED_PATH_MASK) !==
        this.cryptocurrency.coinType
    ) {
      return false;
    }
    if (
      bipPath.length < Crypto.BIP44_PATH_ACCOUNT_INDEX + 1 ||
      !(bipPath[Crypto.BIP44_PATH_ACCOUNT_INDEX] & Crypto.HARDENED_PATH_MASK)
    ) {
      return false;
    }
    if (
      bipPath.length >= Crypto.BIP44_PATH_CHANGE_INDEX + 1 &&
      bipPath[Crypto.BIP44_PATH_CHANGE_INDEX] !== Crypto.BIP44_PATH_DEFAULT_CHANGE
    ) {
      return false;
    }
    for (const path of bipPath) {
      if (path < 0 || path > 0xffffffff) {
        return false;
      }
    }
    return true;
  }
}
