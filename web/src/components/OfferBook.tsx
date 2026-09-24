"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { MarketConfig } from "@/lib/config";
import { Offer, Bid, bidsFor } from "@/lib/useOffers";
import { formatUsd, formatAmount, formatCountdown, formatTimestamp } from "@/lib/format";
import { useProgram, pda } from "@/lib/program";
import { placeBid, acceptBid, cancelOrRefundBid, settle, reclaim, readableError } from "@/lib/actions";
import { Badge, Button, EmptyState, Input, AddressLink } from "./ui";
import { IconEmptyBook } from "./icons";
import { TxFeedback, TxState } from "./TxFeedback";

export function OfferBook({
  market, marketAddress, offers, bids, now, feeDestination, onChanged,
}: {
  market: MarketConfig;
  marketAddress: string | null;
  offers: Offer[];
  bids: Bid[];
  now: number;
  feeDestination: string | null;
  onChanged: () => void;
}) {
  const live = offers.filter((o) => o.state === "open" || o.state === "filled");

  if (live.length === 0) {
    return (
      <EmptyState
        icon={<IconEmptyBook className="h-8 w-8" />}
            title="No open offers"
            body="Write a call and it appears here."
      />
    );
  }

  return (
    <div className="divide-y divide-line-secondary">
      {live.map((offer) => (
        <OfferRow
          key={offer.address} offer={offer} market={market} marketAddress={marketAddress}
          bids={bidsFor(bids, offer.address)} now={now}
          feeDestination={feeDestination} onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function OfferRow({
  offer, market, marketAddress, bids, now, feeDestination, onChanged,
}: {
  offer: Offer; market: MarketConfig; marketAddress: string | null;
  bids: Bid[]; now: number; feeDestination: string | null; onChanged: () => void;
}) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });

  const me = publicKey?.toBase58();
  const isWriter = me === offer.writer;
  const myBid = bids.find((b) => b.bidder === me);
  const best = bids[0];
  const expired = now >= offer.expiryTs;

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

  const ctx = program && publicKey && marketAddress
    ? { program, me: publicKey, market: new PublicKey(marketAddress), offer: new PublicKey(offer.address) }
    : null;

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-sm font-medium text-ink-primary">
              {formatAmount(offer.collateralAmount, 8)} {market.symbol}
            </span>
            <span className="text-xs text-ink-muted">at</span>
            <span className="tnum text-sm font-medium text-ink-primary">
              {formatUsd(offer.strikeUsd)}
            </span>
            {offer.state === "filled"
              ? <Badge tone="brand">Filled</Badge>
              : <Badge tone="neutral">Open</Badge>}
            {isWriter && <Badge tone="neutral">Yours</Badge>}
          </div>
          <p className="tnum text-xs text-ink-secondary">
            Expires {formatTimestamp(offer.expiryTs)} · {formatCountdown(offer.expiryTs - now)}
          </p>
          <p className="text-xs text-ink-muted">
            Writer <AddressLink address={offer.writer} />
            {offer.state === "filled" && offer.buyer && (
              <> · buyer <AddressLink address={offer.buyer} /></>
            )}
          </p>
        </div>

        <div className="text-right">
          <div className="text-2xs uppercase tracking-wide text-ink-muted">
            {offer.state === "filled" ? "Premium paid" : "Best bid"}
          </div>
          <div className="tnum text-base font-semibold text-ink-primary">
            {offer.state === "filled"
              ? formatAmount(offer.premiumPaid, 6)
              : best ? formatAmount(best.amount, 6) : "—"}
            <span className="ml-1 text-xs font-normal text-ink-muted">USDC</span>
          </div>
          <div className="tnum text-2xs text-ink-muted">
            min {formatAmount(offer.minPremium, 6)}
            {bids.length > 0 && offer.state === "open" && ` · ${bids.length} bid${bids.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      {offer.state === "open" && bids.length > 0 && (
        <ul className="space-y-1.5 rounded-lg bg-bg-tertiary px-3 py-2.5">
          {bids.map((b) => (
            <li key={b.address} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-secondary">
                <AddressLink address={b.bidder} />
                {b.bidder === me && <span className="ml-1.5 text-ink-muted">you</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="tnum font-medium text-ink-primary">
                  {formatAmount(b.amount, 6)} USDC
                </span>
                {isWriter && ctx && feeDestination && (
                  <Button
                    variant="secondary"
                    className="!h-8 !min-h-0 !px-2.5 !text-xs"
                    onClick={() => run(
                      () => acceptBid(ctx.program, ctx.me, ctx.market, ctx.offer,
                        new PublicKey(b.bidder), new PublicKey(feeDestination)),
                      `Accepted ${formatAmount(b.amount, 6)} USDC. The premium is yours now, whatever happens at expiry.`)}
                  >
                    Accept
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <TxFeedback state={tx} />

      {/* Actions, narrowed to what this wallet can actually do right now. */}
      <div className="flex flex-wrap items-center gap-2">
        {offer.state === "open" && !expired && !isWriter && ctx && !myBid && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              className="!h-10 w-full sm:w-40" inputMode="decimal"
              placeholder={`min ${formatAmount(offer.minPremium, 6)}`}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              aria-label="Bid amount in USDC"
            />
            <Button
              className="!h-10 !min-h-0"
              disabled={!(parseFloat(amount) > 0)}
              onClick={() => {
                const [w = "0", f = ""] = amount.split(".");
                const units = BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, "0").slice(0, 6) || "0");
                return run(
                  () => placeBid(ctx.program, ctx.me, ctx.market, ctx.offer, units),
                  `Bid ${amount} USDC. It is held in escrow until the writer accepts or you withdraw it.`);
              }}
            >
              Place bid
            </Button>
          </div>
        )}

        {myBid && offer.state === "open" && ctx && (
          <Button
            variant="secondary" className="!h-10 !min-h-0"
            onClick={() => run(
              () => cancelOrRefundBid(ctx.program, ctx.me, ctx.market, ctx.offer, "cancel"),
              "Bid withdrawn and your USDC returned.")}
          >
            Withdraw my bid
          </Button>
        )}

        {myBid && offer.state === "filled" && ctx && (
          <Button
            variant="secondary" className="!h-10 !min-h-0"
            onClick={() => run(
              () => cancelOrRefundBid(ctx.program, ctx.me, ctx.market, ctx.offer, "refund"),
              "Refunded. Another bid was accepted.")}
          >
            Refund my losing bid
          </Button>
        )}

        {offer.state === "filled" && expired && ctx && offer.buyer && (
          <Button
            className="!h-10 !min-h-0"
            onClick={() => run(
              () => settle(ctx.program, ctx.me, ctx.market, ctx.offer,
                new PublicKey(market.underlyingMint), new PublicKey(market.feedAccount),
                new PublicKey(offer.buyer!), new PublicKey(offer.writer)),
              "Settled. The collateral has been split against the oracle price.")}
          >
            Settle
          </Button>
        )}

        {offer.state === "open" && expired && isWriter && ctx && (
          <Button
            variant="secondary" className="!h-10 !min-h-0"
            onClick={() => run(
              () => reclaim(ctx.program, ctx.me, ctx.market, ctx.offer,
                new PublicKey(market.underlyingMint)),
              "Collateral returned. Nobody took this offer before it expired.")}
          >
            Reclaim collateral
          </Button>
        )}

        {offer.state === "filled" && !expired && (
          <p className="text-xs text-ink-muted">
            Settles after expiry. Anyone can trigger it, so an out-of-the-money buyer cannot
            strand the writer&apos;s collateral by doing nothing.
          </p>
        )}
      </div>
    </div>
  );
}
