"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { MARKETS } from "./config";

/**
 * The mirror relayer's heartbeat, read from the chain.
 *
 * A price that has not moved since Friday and a relayer that died on Saturday
 * look identical from the price alone. The mirror program records when it last
 * pushed, separately from the publish time it copied, so the two can be told
 * apart without anyone watching a terminal.
 */
export const MIRROR_PROGRAM = new PublicKey("DrPTosRsyyhxFgyLotPuRgpTjAD1gGoHRmAkwMDPTLNP");

// MirrorFeed: 8 discriminator, 32 authority, 32 feed id, then the two i64s.
const OFF_LAST_PUBLISH = 8 + 32 + 32;
const OFF_LAST_PUSHED = OFF_LAST_PUBLISH + 8;
const OFF_UPDATES = OFF_LAST_PUSHED + 8;

export type MirrorHeartbeat = {
  lastPublishTime: number;
  lastPushedAt: number;
  updates: number;
};

function feedPda(feedId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("feed"), Buffer.from(feedId, "hex")], MIRROR_PROGRAM)[0];
}

export function useMirrorHeartbeats(intervalMs = 30_000) {
  const { connection } = useConnection();
  const [beats, setBeats] = useState<Record<string, MirrorHeartbeat>>({});

  useEffect(() => {
    const mirrored = MARKETS.filter((m) => m.mocks !== "none");
    if (mirrored.length === 0) return;
    let cancelled = false;

    async function tick() {
      try {
        const infos = await connection.getMultipleAccountsInfo(
          mirrored.map((m) => feedPda(m.feedId)), "confirmed");
        if (cancelled) return;
        const next: Record<string, MirrorHeartbeat> = {};
        infos.forEach((info, i) => {
          if (!info || info.data.length < OFF_UPDATES + 8) return;
          const d = info.data;
          next[mirrored[i].symbol] = {
            lastPublishTime: Number(d.readBigInt64LE(OFF_LAST_PUBLISH)),
            lastPushedAt: Number(d.readBigInt64LE(OFF_LAST_PUSHED)),
            updates: Number(d.readBigUInt64LE(OFF_UPDATES)),
          };
        });
        setBeats(next);
      } catch {
        // A heartbeat that cannot be read is not worth surfacing as an error;
        // the absence already shows as "unknown" beside the feed.
      }
    }

    tick();
    const t = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [connection, intervalMs]);

  return beats;
}
