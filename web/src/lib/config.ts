/**
 * Deployment configuration. Everything here comes from the environment or from
 * config/markets.<cluster>.json in the repo root, so the interface never
 * hardcodes an address the program does not also know about.
 */
import devnetMarkets from "../../../config/markets.devnet.json";
import mainnetMarkets from "../../../config/markets.mainnet.json";
import localnetMarkets from "../../../config/markets.localnet.json";

export type Cluster = "localnet" | "devnet" | "mainnet";

export type MarketConfig = {
  symbol: string;
  label: string;
  underlyingMint: string;
  feedAccount: string;
  feedId: string;
  maxStalenessSecs: number;
  maxConfBps: number;
  /** "none" when nothing on this market is mocked. Anything else is shown. */
  mocks: string;
};

type MarketFile = { premiumMint: string; markets: MarketConfig[] };

const FILES: Record<Cluster, MarketFile> = {
  localnet: localnetMarkets as MarketFile,
  devnet: devnetMarkets as MarketFile,
  mainnet: mainnetMarkets as MarketFile,
};

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER as Cluster) ?? "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  {
    localnet: "http://127.0.0.1:8899",
    devnet: "https://api.devnet.solana.com",
    mainnet: "https://api.mainnet-beta.solana.com",
  }[CLUSTER];

export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ";

export const MARKETS: MarketConfig[] = FILES[CLUSTER].markets;
export const PREMIUM_MINT = FILES[CLUSTER].premiumMint;

/** Markets configured for mainnet but not deployed on the current cluster. */
export const OTHER_MARKETS: MarketConfig[] =
  CLUSTER === "mainnet" ? [] : (FILES.mainnet.markets as MarketConfig[]);

export const EXPLORER = (addr: string, kind: "address" | "tx" = "address") => {
  const suffix =
    CLUSTER === "mainnet"
      ? ""
      : CLUSTER === "devnet"
        ? "?cluster=devnet"
        : "?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899";
  return `https://explorer.solana.com/${kind}/${addr}${suffix}`;
};
