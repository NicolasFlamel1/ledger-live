import SpeculosTransportHttp from "@ledgerhq/hw-transport-node-speculos-http";
import Exchange, { ExchangeTypes, PartnerKeyInfo } from "./Exchange";
import Transport from "@ledgerhq/hw-transport";
import { randomBytes, subtle } from "crypto";
import secp256k1 from "secp256k1";
import protobuf from "protobufjs";
import BigNumber from "bignumber.js";

describe("Check SWAP until payload signature", () => {
  let transport: Transport;

  beforeAll(async () => {
    transport = await SpeculosTransportHttp.open({});
  });
  afterAll(async () => {
    transport.close();
  });

  it("Legacy SWAP", async () => {
    // Given
    const exchange = new Exchange(transport, ExchangeTypes.Swap);

    // When
    const transactionId = await exchange.startNewTransaction();

    // Then
    expect(transactionId).toEqual(expect.any(String));
    expect(transactionId).toHaveLength(10);

    const { partnerInfo, partnerSigned, partnerPrivKey } =
      await appExchangeDatasetTest(legacySignFormat);
    await exchange.setPartnerKey(partnerInfo);

    await exchange.checkPartner(partnerSigned);

    const amount = new BigNumber(100000);
    const amountToWallet = new BigNumber(1000);
    const encodedPayload = await generateSwapPayloadProtobuf({
      payinAddress: "0xd692Cb1346262F584D17B4B470954501f6715a82",
      refundAddress: "0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D",
      payoutAddress: "bc1qer57ma0fzhqys2cmydhuj9cprf9eg0nw922a8j",
      currencyFrom: "ETH",
      currencyTo: "BTC",
      amountToProvider: Buffer.from(amount.toString(16), "hex"),
      amountToWallet: Buffer.from(amountToWallet.toString(16), "hex"),
      deviceTransactionId: transactionId,
    });
    const estimatedFees = new BigNumber(0);
    await exchange.processTransaction(encodedPayload, estimatedFees);

    const payloadSignature = await signMessage(encodedPayload, partnerPrivKey, "der");
    await exchange.checkTransactionSignature(payloadSignature);
  });

  it("NG SWAP", async () => {
    // Given
    const exchange = new Exchange(transport, ExchangeTypes.SwapNg);

    // When
    const transactionId = await exchange.startNewTransaction();

    // Then
    expect(transactionId).toEqual(expect.any(String));
    expect(transactionId).toHaveLength(64);

    const { partnerInfo, partnerSigned, partnerPrivKey } =
      await appExchangeDatasetTest(ngSignFormat);
    await exchange.setPartnerKey(partnerInfo);

    await exchange.checkPartner(partnerSigned);

    const amount = new BigNumber(100_000);
    const amountToWallet = new BigNumber(100_000_000_000);
    let encodedPayload = await generateSwapPayloadProtobuf({
      payinAddress: "0xd692Cb1346262F584D17B4B470954501f6715a82",
      refundAddress: "0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D",
      payoutAddress: "bc1qer57ma0fzhqys2cmydhuj9cprf9eg0nw922a8j",
      currencyFrom: "ETH",
      currencyTo: "BTC",
      amountToProvider: Buffer.from(amount.toString(16), "hex"),
      amountToWallet: Buffer.from(amountToWallet.toString(16), "hex"),
      deviceTransactionIdNg: Buffer.from(transactionId.padStart(32, "0"), "hex"),
    });
    encodedPayload = convertToJWSPayload(encodedPayload);

    const estimatedFees = new BigNumber(0);
    await exchange.processTransaction(encodedPayload, estimatedFees, "jws");

    const payloadSignature = await signMessage(encodedPayload, partnerPrivKey, "rs");
    await exchange.checkTransactionSignature(payloadSignature);
  });

  it("NG SWAP with more than 255 bytes in process transaction", async () => {
    // Given
    const exchange = new Exchange(transport, ExchangeTypes.SwapNg);

    // When
    const transactionId = await exchange.startNewTransaction();

    // Then
    expect(transactionId).toEqual(expect.any(String));
    expect(transactionId).toHaveLength(64);

    const { partnerInfo, partnerSigned, partnerPrivKey } =
      await appExchangeDatasetTest(ngSignFormat);
    await exchange.setPartnerKey(partnerInfo);

    await exchange.checkPartner(partnerSigned);

    const amount = new BigNumber(100_000);
    const amountToWallet = new BigNumber(100_000_000_000);
    // Extra properties have a limited size of 20 (i.e. app-exchange/src/proto/protocol.options)
    let encodedPayload = await generateSwapPayloadProtobuf({
      payinAddress: "0xd692Cb1346262F584D17B4B470954501f6715a82",
      payinExtraId: '{ extraInfo: "Go" }',
      refundAddress: "0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D",
      refundExtraId: '{ extraInfo: "Go" }',
      payoutAddress: "bc1qer57ma0fzhqys2cmydhuj9cprf9eg0nw922a8j",
      payoutExtraId: "bc1qer57ma0fzhqys2c",
      currencyFrom: "ETH",
      currencyTo: "BTC",
      amountToProvider: Buffer.from(amount.toString(16), "hex"),
      amountToWallet: Buffer.from(amountToWallet.toString(16), "hex"),
      deviceTransactionIdNg: Buffer.from(transactionId.padStart(32, "0"), "hex"),
    });
    encodedPayload = convertToJWSPayload(encodedPayload);

    const estimatedFees = new BigNumber(0);
    await exchange.processTransaction(encodedPayload, estimatedFees, "jws");

    const payloadSignature = await signMessage(encodedPayload, partnerPrivKey, "rs");
    await exchange.checkTransactionSignature(payloadSignature);
  });

  it("NG SWAP with prepared data", async () => {
    // Given
    const exchange = new Exchange(transport, ExchangeTypes.SwapNg);

    // When
    const transactionId = await exchange.startNewTransaction();

    // Then
    expect(transactionId).toEqual(expect.any(String));
    expect(transactionId).toHaveLength(64);

    const { partnerInfo, partnerSigned } = await appExchangeDataset(ngSignFormat);
    await exchange.setPartnerKey(partnerInfo);

    await exchange.checkPartner(partnerSigned);

    const encodedPayload = Buffer.from(
      ".CipiYzFxYXIwc3Jycjd4Zmt2eTVsNjQzbHlkbnc5cmU1OWd0enp3ZjVtZHEaKmJjMXFhcjBzcnJyN3hma3Z5NWw2NDNseWRudzlyZTU5Z3R6endmNHRlcSoqMHhiNzk0ZjVlYTBiYTM5NDk0Y2U4Mzk2MTNmZmZiYTc0Mjc5NTc5MjY4OgNCVENCA0JBVEoCBH5SBgV0-95gAGIgNQrqDJf3R_HQ92CBRhSkdSOAGxrrfQvLuqKk9Gv4GEs=",
    );

    const estimatedFees = new BigNumber(0);
    await exchange.processTransaction(encodedPayload, estimatedFees, "jws");

    // const payloadSignature = await signMessage(encodedPayload, partnerPrivKey, "rs");
    const payloadSignature = Buffer.from(
      "zGcNUYKM8sLxvT7zPU1C8vrMmanVlUroELnAeil4weo1LCk0zUBRse5-3Acv7I7II90xVTIxm26BnxRbZvVmTQ==",
      "base64url",
    );
    await exchange.checkTransactionSignature(payloadSignature);
  });

  it("NG Sell", async () => {
    // Given
    const exchange = new Exchange(transport, ExchangeTypes.SellNg);

    // When
    const transactionId = await exchange.startNewTransaction();

    // Then
    expect(transactionId).toEqual(expect.any(String));
    expect(transactionId).toHaveLength(64);

    const { partnerInfo, partnerSigned, partnerPrivKey } =
      await appExchangeSellDataset(ngSignFormat);
    await exchange.setPartnerKey(partnerInfo);
    console.log("DEBUG - Sell partner info:", partnerInfo);
    console.log("DEBUG - Sell partner info:", partnerInfo.publicKey.toString("hex"));
    console.log("DEBUG - Sell partner signed:", Buffer.from(partnerSigned).toString("hex"));

    await exchange.checkPartner(partnerSigned);

    const amount = new BigNumber(100_000);
    let encodedPayload = await generateSellPayloadProtobuf({
      traderEmail: "test@ledger.fr",
      inCurrency: "ETH",
      inAmount: Buffer.from(amount.toString(16), "hex"),
      inAddress: "0xd692Cb1346262F584D17B4B470954501f6715a82",
      outCurrency: "EUR",
      outAmount: {
        coefficient: Buffer.from("1", "hex"),
        exponent: 1,
      },
      deviceTransactionId: Buffer.from(transactionId.padStart(32, "0"), "hex"),
    });
    encodedPayload = convertToJWSPayload(encodedPayload);

    const estimatedFees = new BigNumber(0);
    await exchange.processTransaction(encodedPayload, estimatedFees, "jws");

    const payloadSignature = await signMessage(encodedPayload, partnerPrivKey, "rs");
    await exchange.checkTransactionSignature(payloadSignature);
  });
});

// Those information comes from dataset test of app-exchange (i.e. check signing_authority.py file).
// The public key is bundle with DEBUG version of app-exchange.
const LEDGER_FAKE_PRIVATE_KEY = Buffer.from(
  "b1ed47ef58f782e2bc4d5abe70ef66d9009c2957967017054470e0f3e10f5833",
  "hex",
);

type PartnerSignFormat = (PartnerKeyInfo) => Buffer;
const legacySignFormat: PartnerSignFormat = (info: PartnerKeyInfo) => {
  return Buffer.concat([
    Buffer.from([info.name.length]),
    Buffer.from(info.name, "ascii"),
    info.publicKey,
  ]);
};
const ngSignFormat: PartnerSignFormat = (info: PartnerKeyInfo) => {
  return Buffer.concat([
    Buffer.from([info.name.length]),
    Buffer.from(info.name, "ascii"),
    Buffer.from([0x00]),
    info.publicKey,
  ]);
};
async function appExchangeDatasetTest(signFormat: PartnerSignFormat) {
  // Generate random provider key
  let privKey;
  do {
    privKey = randomBytes(32);
  } while (!secp256k1.privateKeyVerify(privKey));
  // The expected public should not be compressed and be a full 64 length (with R and S)
  const isCompressed = false;
  const pubKey = secp256k1.publicKeyCreate(privKey, isCompressed);

  const partnerInfo = {
    name: "SWAP_TEST",
    curve: "secp256k1",
    publicKey: pubKey,
  };
  const msg = signFormat(partnerInfo);

  const sig = await signMessage(msg, LEDGER_FAKE_PRIVATE_KEY, "der");

  return {
    partnerInfo,
    partnerSigned: sig,
    partnerPrivKey: privKey,
  };
}
async function appExchangeDataset(signFormat: PartnerSignFormat) {
  const pubKey = Buffer.from(
    "0478d5facdae2305f48795d3ce7d9244f5060d2f800901da5746d1f4177ae8d7bbe63f3870efc0d36af8f91962811e1d8d9df91ce3b3ea2cd9f550c7d465f8b7b3",
    "hex",
  );
  secp256k1.publicKeyVerify(pubKey);

  const partnerInfo = {
    name: "SWAP_TEST",
    curve: "secp256k1",
    publicKey: pubKey,
  };
  const msg = signFormat(partnerInfo);

  const sig = await signMessage(msg, LEDGER_FAKE_PRIVATE_KEY, "der");

  return {
    partnerInfo,
    partnerSigned: sig,
  };
}
async function appExchangeSellDataset(signFormat: PartnerSignFormat) {
  const privKey = Buffer.from(
    "308f6a5369aea611d89abf937d0ffaf0b43b457d42cbf0cf754786b3088f17ae",
    "hex",
  );
  const pubKey = Buffer.from(
    "0478d5facdae2305f48795d3ce7d9244f5060d2f800901da5746d1f4177ae8d7bbe63f3870efc0d36af8f91962811e1d8d9df91ce3b3ea2cd9f550c7d465f8b7b3",
    "hex",
  );
  secp256k1.publicKeyVerify(pubKey);

  const partnerInfo = {
    name: "SELL_TEST",
    curve: "secp256k1",
    publicKey: pubKey,
  };
  const msg = signFormat(partnerInfo);

  const sig = await signMessage(msg, LEDGER_FAKE_PRIVATE_KEY, "der");

  return {
    partnerInfo,
    partnerSigned: sig,
    partnerPrivKey: privKey,
  };
}
type SwapPayloadCore = {
  payinAddress: string;
  payinExtraId?: string;
  refundAddress: string;
  refundExtraId?: string;
  payoutAddress: string;
  payoutExtraId?: string;
  currencyFrom: string;
  currencyTo: string;
  amountToProvider: Buffer;
  amountToWallet: Buffer;
};
type SwapPayloadLegacy = SwapPayloadCore & {
  deviceTransactionId?: string;
};
type SwapPayloadNg = SwapPayloadCore & {
  deviceTransactionIdNg?: Buffer;
};
type SwapPayload = SwapPayloadLegacy | SwapPayloadNg;
async function generateSwapPayloadProtobuf(payload: SwapPayload): Promise<Buffer> {
  const root = await protobuf.load("protocol.proto");
  const TransactionResponse = root.lookupType("ledger_swap.NewTransactionResponse");
  const err = TransactionResponse.verify(payload);
  if (err) {
    throw Error(err);
  }
  const message = TransactionResponse.create(payload);
  const messageEncoded = TransactionResponse.encode(message).finish();

  return Buffer.from(messageEncoded);
}

type UDecimal = {
  coefficient: Buffer;
  exponent: number;
};
type SellPayload = {
  traderEmail: string;
  inCurrency: string;
  inAmount: Buffer;
  inAddress: string;
  outCurrency: string;
  outAmount: UDecimal;
  deviceTransactionId: Buffer;
};
async function generateSellPayloadProtobuf(payload: SellPayload): Promise<Buffer> {
  const root = await protobuf.load("protocol.proto");
  const SellResponse = root.lookupType("ledger_swap.NewSellResponse");
  const err = SellResponse.verify(payload);
  if (err) {
    throw Error(err);
  }
  const message = SellResponse.create(payload);
  const messageEncoded = SellResponse.encode(message).finish();

  return Buffer.from(messageEncoded);
}

type SigFormat = "der" | "rs";
// Sign message in ECDSA-SHA256 with secp256k1 curve and returnsa DER format signature
async function signMessage(
  message: Buffer,
  privKey: Buffer,
  sigFormat: SigFormat,
): Promise<Buffer> {
  const hashBuffer = await subtle.digest("SHA-256", message);
  const hash = new Uint8Array(hashBuffer);

  const sig = secp256k1.ecdsaSign(hash, privKey).signature;
  if (sigFormat === "der") {
    return convertSignatureToDER(sig);
  }
  return sig;
}

function convertSignatureToDER(sig: Uint8Array): Buffer {
  return secp256k1.signatureExport(sig);
}

// Convert raw buffer to a JWS compatible one: '.'+base64Url(raw)
function convertToJWSPayload(raw: Buffer): Buffer {
  return Buffer.from("." + raw.toString("base64url"));
}
