"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CLUSTER } from "@/lib/config";
import { Card, CardHeader, Button } from "./ui";
import { IconCheck, IconWarning } from "./icons";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; minted: { symbol: string; amount: number }[] }
  | { kind: "error"; message: string };

/**
 * Test balances on devnet. A visitor who arrives with an empty wallet can do
 * nothing here, and asking them to find a faucet elsewhere is where most test
 * deployments lose people.
 */
export function Faucet() {
  const { publicKey } = useWallet();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (CLUSTER === "mainnet") return null;

  async function claim() {
    if (!publicKey) return;
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The faucet request failed.");
      setState({ kind: "done", minted: body.minted ?? [] });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "The faucet request failed." });
    }
  }

  return (
    <Card as="section">
      <CardHeader
        title="Test balances"
        description="This is a test network. Claim replica tokens and test USDC so you can write a call and bid on one."
      />
      <div className="space-y-3 px-5 py-4">
        {state.kind === "done" ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-state-successBg px-3 py-2.5">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-state-success" />
            <div className="text-xs leading-relaxed text-ink-primary">
              <p>Sent to your wallet:</p>
              <ul className="tnum mt-1 space-y-0.5 text-ink-secondary">
                {state.minted.map((m) => (
                  <li key={m.symbol}>{m.amount.toLocaleString("en-US")} {m.symbol}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : state.kind === "error" ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-state-errorBg px-3 py-2.5">
            <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-error" />
            <p className="text-xs leading-relaxed text-ink-primary">{state.message}</p>
          </div>
        ) : null}

        <Button
          variant="secondary"
          className="w-full"
          disabled={!publicKey || state.kind === "working"}
          onClick={claim}
        >
          {state.kind === "working" ? "Sending" : publicKey ? "Claim test balances" : "Connect a wallet first"}
        </Button>
        <p className="text-2xs leading-relaxed text-ink-muted">
          Once every six hours per wallet. Devnet SOL for fees comes from
          faucet.solana.com, not from here.
        </p>
      </div>
    </Card>
  );
}
