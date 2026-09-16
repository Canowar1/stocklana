"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useOffers } from "@/lib/useOffers";
import { useMarketIndex } from "@/lib/markets";
import { useOracles } from "@/lib/useOracles";
import { MARKETS } from "@/lib/config";
import { formatAmount, formatUsd } from "@/lib/format";
import { Card, CardHeader, EmptyState, Button, Stat } from "./ui";
import { PositionCard, Role } from "./PositionCard";
import { IconPositions, IconArrowRight, IconWarning } from "./icons";

const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-11 w-36 rounded-lg bg-bg-tertiary" /> },
);

export function PositionsScreen() {
  const { connected, publicKey } = useWallet();
  const { offers, bids, loading, error, refresh } = useOffers();
  const { byAddress } = useMarketIndex();
  const { now } = useOracles(MARKETS.map((m) => m.feedAccount));

  const me = publicKey?.toBase58() ?? null;

  const mine = useMemo(() => {
    if (!me) return { active: [], closed: [], stats: null };
    const myBids = bids.filter((b) => b.bidder === me && b.state === "active");
    const rows: { offer: (typeof offers)[number]; role: Role; myBid?: (typeof bids)[number] }[] = [];

    for (const offer of offers) {
      if (offer.writer === me) rows.push({ offer, role: "writer" });
      else if (offer.buyer === me) rows.push({ offer, role: "buyer" });
      else {
        const b = myBids.find((x) => x.offer === offer.address);
        if (b) rows.push({ offer, role: "bidder", myBid: b });
      }
    }

    const active = rows.filter((r) => r.offer.state === "open" || r.offer.state === "filled");
    const closed = rows.filter((r) => r.offer.state === "settled" || r.offer.state === "reclaimed");

    // Only what the chain can actually answer. No unrealised profit and loss:
    // that would need a mark for a position that has no secondary market.
    const lockedByMe = active
      .filter((r) => r.role === "writer")
      .reduce((s, r) => s + r.offer.collateralAmount, 0n);
    const premiumTaken = rows
      .filter((r) => r.role === "writer" && r.offer.premiumPaid > 0n)
      .reduce((s, r) => s + r.offer.premiumPaid, 0n);
    const escrowed = myBids.reduce((s, b) => s + b.amount, 0n);

    return { active, closed, stats: { lockedByMe, premiumTaken, escrowed } };
  }, [offers, bids, me]);

  const needsAction = mine.active.filter(
    (r) =>
      (r.offer.state === "filled" && now >= r.offer.expiryTs) ||
      (r.offer.state === "open" && now >= r.offer.expiryTs && r.role === "writer"),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Positions</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          Calls you have written, calls you have bought, and bids you are holding, with the
          settlement receipt for each one that has closed.
        </p>
      </div>

      {!connected ? (
        <Card>
          <EmptyState
            icon={<IconPositions className="h-8 w-8" />}
            title="Connect a wallet"
            body="Positions are read from the chain by owner, so nothing is shown until a wallet is connected."
            action={<WalletButton />}
          />
        </Card>
      ) : (
        <>
          {mine.stats && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="px-5 py-4">
                <Stat
                  label="Collateral locked" sub="across your open and filled offers"
                  value={`${formatAmount(mine.stats.lockedByMe, 8)}`}
                />
              </Card>
              <Card className="px-5 py-4">
                <Stat
                  label="Premium taken" sub="already yours, whatever expiry does"
                  tone={mine.stats.premiumTaken > 0n ? "success" : undefined}
                  value={`${formatAmount(mine.stats.premiumTaken, 6)} USDC`}
                />
              </Card>
              <Card className="px-5 py-4">
                <Stat
                  label="Bids in escrow" sub="withdrawable until a writer accepts"
                  value={`${formatAmount(mine.stats.escrowed, 6)} USDC`}
                />
              </Card>
            </div>
          )}

          {needsAction.length > 0 && (
            <Card className="flex items-start gap-3 border-state-warning/30 px-5 py-4">
              <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" />
              <p className="text-xs leading-relaxed text-ink-secondary">
                <span className="font-medium text-ink-primary">
                  {needsAction.length} position{needsAction.length === 1 ? "" : "s"} past expiry.
                </span>{" "}
                Settlement is permissionless, so anyone can close them, but nothing happens on its
                own. Until someone triggers it the collateral stays locked.
              </p>
            </Card>
          )}

          {error && (
            <Card className="px-5 py-4 text-xs text-state-error">{error}</Card>
          )}

          <Card as="section">
            <CardHeader
              title="Open" description="Written or bought and not yet closed."
            />
            {loading && mine.active.length === 0 ? (
              <div className="space-y-2 px-5 py-6">
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-tertiary" />
                ))}
              </div>
            ) : mine.active.length === 0 ? (
              <EmptyState
                icon={<IconPositions className="h-8 w-8" />}
                title="Nothing open"
                body="Positions appear here once you write a call, bid on one, or take one from the offer book."
                action={
                  <Link href="/">
                    <Button variant="secondary">
                      Browse markets <IconArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-line-secondary">
                {mine.active.map((r) => (
                  <PositionCard
                    key={r.offer.address + r.role} offer={r.offer} role={r.role} myBid={r.myBid}
                    market={byAddress.get(r.offer.market)} marketAddress={r.offer.market}
                    now={now} onChanged={refresh} wallet={publicKey}
                  />
                ))}
              </div>
            )}
          </Card>

          {mine.closed.length > 0 && (
            <Card as="section">
              <CardHeader
                title="Closed"
                description="Each one keeps the price that decided it, the strike after any corporate-action adjustment, and how the collateral was split."
              />
              <div className="divide-y divide-line-secondary">
                {mine.closed.map((r) => (
                  <PositionCard
                    key={r.offer.address + r.role} offer={r.offer} role={r.role} myBid={r.myBid}
                    market={byAddress.get(r.offer.market)} marketAddress={r.offer.market}
                    now={now} onChanged={refresh} wallet={publicKey}
                  />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
