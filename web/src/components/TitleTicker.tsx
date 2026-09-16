"use client";

import { useEffect } from "react";

/**
 * Puts the live price in the tab title, the way the trading venues do. A tab
 * left open in the background becomes a ticker, which costs nothing and is the
 * reason people keep those tabs open.
 */
export function TitleTicker({ price, symbol }: { price: number | null; symbol: string }) {
  useEffect(() => {
    const base = `${symbol} · Stocklana`;
    document.title = price
      ? `${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ${base}`
      : base;
    return () => { document.title = "Stocklana"; };
  }, [price, symbol]);
  return null;
}
