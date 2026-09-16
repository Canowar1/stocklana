"use client";

import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { MARKETS, MarketConfig } from "./config";
import { pda } from "./program";

/**
 * Offers store their market by address. Everything the interface wants to say
 * about a position, starting with which symbol it is, lives in the market
 * config, so the two are joined here once rather than in every component.
 */
export function useMarketIndex() {
  return useMemo(() => {
    const byAddress = new Map<string, MarketConfig>();
    const addressOf = new Map<string, string>();
    for (const m of MARKETS) {
      const address = pda
        .market(new PublicKey(m.underlyingMint), Buffer.from(m.feedId, "hex"))
        .toBase58();
      byAddress.set(address, m);
      addressOf.set(m.symbol, address);
    }
    return { byAddress, addressOf, all: MARKETS };
  }, []);
}
