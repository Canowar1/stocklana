"use client";

import { useEffect } from "react";
import { APP_NAME } from "@/lib/brand";

/**
 * Puts the live price in the tab title, the way the trading venues do. A tab
 * left open in the background becomes a ticker, which costs nothing and is the
 * reason people keep those tabs open.
 */
export function TitleTicker({ price, symbol }: { price: number | null; symbol: string }) {
  useEffect(() => {
    const base = `${symbol} · ${APP_NAME}`;
    document.title = price
      ? `${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ${base}`
      : base;
    return () => { document.title = APP_NAME; };
  }, [price, symbol]);
  return null;
}
