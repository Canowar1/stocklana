"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardHeader, EmptyState, Button } from "./ui";
import { IconPositions, IconArrowRight } from "./icons";

const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-11 w-36 rounded-lg bg-bg-tertiary" /> },
);

export function PositionsScreen() {
  const { connected } = useWallet();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Positions</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          Calls you have written and calls you have bought, with the settlement receipt for each
          one that has closed.
        </p>
      </div>

      <Card as="section">
        <CardHeader
          title="Open and settled"
          description="A settled position keeps its receipt on-chain: the price used, the strike after any corporate-action adjustment, when that price was published, and how wide its confidence band was."
        />
        {connected ? (
          <EmptyState
            icon={<IconPositions className="h-8 w-8" />}
            title="Nothing written yet"
            body="Positions appear here once you write a call or take one from the offer book."
            action={
              <Link href="/">
                <Button variant="secondary">
                  Browse markets <IconArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<IconPositions className="h-8 w-8" />}
            title="Connect a wallet"
            body="Positions are read from the chain by owner, so nothing is shown until a wallet is connected."
            action={<WalletButton />}
          />
        )}
      </Card>
    </div>
  );
}
