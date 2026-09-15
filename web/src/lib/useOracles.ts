"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { readOracles, OracleRead } from "./pyth";

/**
 * Polls the oracle accounts the markets settle against. Ten seconds is chosen
 * against the data, not for effect: Pyth's own publish cadence on these feeds
 * is slower than that, so a tighter loop would only add RPC traffic.
 */
export function useOracles(feedAccounts: string[], intervalMs = 10_000) {
  const { connection } = useConnection();
  const [reads, setReads] = useState<Record<string, OracleRead | null>>({});
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = feedAccounts.join(",");

  useEffect(() => {
    let cancelled = false;
    const accounts = key ? key.split(",").map((a) => new PublicKey(a)) : [];

    async function tick() {
      if (accounts.length === 0) { setLoading(false); return; }
      try {
        const results = await readOracles(connection, accounts);
        if (cancelled) return;
        const next: Record<string, OracleRead | null> = {};
        accounts.forEach((a, i) => { next[a.toBase58()] = results[i]; });
        setReads(next);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not reach the RPC endpoint");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    const poll = setInterval(tick, intervalMs);
    // The age of a print changes every second even when the print does not.
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => { cancelled = true; clearInterval(poll); clearInterval(clock); };
  }, [connection, key, intervalMs]);

  return { reads, now, loading, error };
}
