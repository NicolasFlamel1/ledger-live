import type Transport from "@ledgerhq/hw-transport";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import MimbleWimbleCoin from "./hw-app-mimblewimble-coin";

export default async (
  transport: Transport,
  {
    currency,
    path,
    verify,
  }: {
    currency: CryptoCurrency;
    path: string;
    verify: boolean;
  },
): Promise<{
  address: string;
  path: string;
}> => {
  const mimbleWimbleCoin = new MimbleWimbleCoin(transport, currency);
  const address = await mimbleWimbleCoin.getAddress(path, verify);
  return {
    address,
    path,
  };
};
