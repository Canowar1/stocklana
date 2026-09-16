"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

/** Raw balance plus decimals, so callers never guess the scale. */
export function useTokenBalance(mint?: string) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<{ raw: bigint; decimals: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mint || !publicKey) { setState(null); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const mintKey = new PublicKey(mint);
        const mintInfo = await connection.getAccountInfo(mintKey, "confirmed");
        if (!mintInfo) { if (!cancelled) setState(null); return; }
        const ata = getAssociatedTokenAddressSync(
          mintKey, publicKey, false, mintInfo.owner, ASSOCIATED_TOKEN_PROGRAM_ID);
        const bal = await connection.getTokenAccountBalance(ata, "confirmed").catch(() => null);
        if (cancelled) return;
        setState(bal
          ? { raw: BigInt(bal.value.amount), decimals: bal.value.decimals }
          : { raw: 0n, decimals: mintInfo.data[44] ?? 0 });
      } catch {
        if (!cancelled) setState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [connection, publicKey, mint]);

  return { balance: state, loading };
}
