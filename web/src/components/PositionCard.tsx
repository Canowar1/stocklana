"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { MarketConfig } from "@/lib/config";
import { Offer, Bid } from "@/lib/useOffers";
import { formatUsd, formatAmount, formatTimestamp, formatCountdown } from "@/lib/format";
import { useProgram } from "@/lib/program";
import { settle, reclaim, cancelOrRefundBid, readableError } from "@/lib/actions";
import { Badge, Button, AddressLink } from "./ui";
import { TxFeedback, TxState } from "./TxFeedback";

export type Role = "writer" | "buyer" | "bidder";

const stateTone = {
  open: "neutral", filled: "brand", settled: "success", reclaimed: "neutral",
} as const;

export function PositionCard({
  offer, market, marketAddress, role, myBid, now, onChanged, wallet,
}: {
  offer: Offer;
  market: MarketConfig | undefined;
  marketAddress: string;
  role: Role;
  myBid?: Bid;
  now: number;
  onChanged: () => void;
  wallet: PublicKey | null;
}) {
  const program = useProgram();
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const expired = now >= offer.expiryTs;
  const settled = offer.state === "settled";

  // A settled strike that differs from the written one means the mint's
  // multiplier moved between the two, which is how a corporate action reaches
  // this position. Surfacing it is the difference between a receipt and a
  // number nobody can check.
  const strikeAdjusted =
    settled && offer.settledStrike > 0n && offer.settledStrike !== offer.strikeUsd;

  const writerKept = settled ? offer.collateralAmount - offer.payoutAmount : 0n;

  async function run(fn: () => Promise<string>, message: string) {
    setTx({ kind: "signing" });
    try {
      const signature = await fn();
      setTx({ kind: "done", signature, message });
      onChanged();
    } catch (e) {
      setTx({ kind: "error", message: readableError(e) });
    }
  }

  const ctx = program && wallet && market
    ? {
        program, me: wallet,
        market: new PublicKey(marketAddress),
        offer: new PublicKey(offer.address),
        mint: new PublicKey(market.underlyingMint),
        feed: new PublicKey(market.feedAccount),
      }
    : null;

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-primary">
              {market?.symbol ?? "Unknown market"}
            </span>
            <Badge tone={stateTone[offer.state]}>{offer.state}</Badge>
            <Badge tone="neutral">
              {role === "writer" ? "You wrote this" : role === "buyer" ? "You bought this" : "Your bid"}
            </Badge>
          </div>
          <p className="tnum text-xs text-ink-secondary">
            {formatAmount(offer.collateralAmount, 8)} {market?.symbol ?? ""} at{" "}
            {formatUsd(offer.strikeUsd)}
          </p>
          <p className="tnum text-xs text-ink-muted">
            {expired ? "Expired" : "Expires"} {formatTimestamp(offer.expiryTs)}
            {!expired && ` · ${formatCountdown(offer.expiryTs - now)}`}
          </p>
        </div>

        <div className="text-right">
          <div className="text-2xs uppercase tracking-wide text-ink-muted">
            {settled ? "Settled at" : role === "bidder" ? "Your bid" : "Premium"}
          </div>
          <div className="tnum text-base font-semibold text-ink-primary">
            {settled
              ? formatUsd(offer.settledPrice)
              : role === "bidder" && myBid
                ? `${formatAmount(myBid.amount, 6)} USDC`
                : offer.premiumPaid > 0n
                  ? `${formatAmount(offer.premiumPaid, 6)} USDC`
                  : "—"}
          </div>
        </div>
      </div>

      {/* The receipt. Everything that decided the outcome, so it can be checked
          rather than trusted. */}
      {settled && (
        <dl className="grid gap-x-8 gap-y-1.5 rounded-lg bg-bg-tertiary px-4 py-3 text-xs sm:grid-cols-2">
          <Row label="Settlement price">{formatUsd(offer.settledPrice)}</Row>
          <Row label="Strike used">
            {formatUsd(offer.settledStrike)}
            {strikeAdjusted && (
              <span className="ml-1.5 text-state-warning">adjusted</span>
            )}
          </Row>
          <Row label="To the buyer">
            {formatAmount(offer.payoutAmount, 8)} {market?.symbol ?? ""}
          </Row>
          <Row label="Returned to the writer">
            {formatAmount(writerKept, 8)} {market?.symbol ?? ""}
          </Row>
          {strikeAdjusted && (
            <div className="sm:col-span-2 text-2xs text-state-warning">
              Strike adjusted {formatUsd(offer.strikeUsd)} → {formatUsd(offer.settledStrike)}
            </div>
          )}
        </dl>
      )}

      <p className="text-xs text-ink-muted">
        Writer <AddressLink address={offer.writer} />
        {offer.buyer && <> · buyer <AddressLink address={offer.buyer} /></>}
      </p>

      <TxFeedback state={tx} />

      <div className="flex flex-wrap gap-2">
        {offer.state === "filled" && expired && ctx && offer.buyer && (
          <Button
            className="!h-10 !min-h-0"
            onClick={() => run(
              () => settle(ctx.program, ctx.me, ctx.market, ctx.offer, ctx.mint, ctx.feed,
                new PublicKey(offer.buyer!), new PublicKey(offer.writer)),
              "Settled. The collateral has been split against the oracle price.")}
          >
            Settle
          </Button>
        )}
        {offer.state === "open" && expired && role === "writer" && ctx && (
          <Button
            variant="secondary" className="!h-10 !min-h-0"
            onClick={() => run(
              () => reclaim(ctx.program, ctx.me, ctx.market, ctx.offer, ctx.mint),
              "Collateral returned. Nobody took this offer before it expired.")}
          >
            Reclaim collateral
          </Button>
        )}
        {role === "bidder" && myBid?.state === "active" && ctx && (
          <Button
            variant="secondary" className="!h-10 !min-h-0"
            onClick={() => run(
              () => cancelOrRefundBid(ctx.program, ctx.me, ctx.market, ctx.offer,
                offer.state === "open" ? "cancel" : "refund"),
              offer.state === "open"
                ? "Bid withdrawn and your USDC returned."
                : "Refunded. Another bid was accepted.")}
          >
            {offer.state === "open" ? "Withdraw my bid" : "Refund my losing bid"}
          </Button>
        )}
        {offer.state === "filled" && !expired && (
          <p className="text-xs text-ink-muted">
            Settles after expiry. Anyone can trigger it.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tnum text-right text-ink-primary">{children}</dd>
    </div>
  );
}
