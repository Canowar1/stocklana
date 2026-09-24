"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketConfig } from "@/lib/config";
import { useOracles } from "@/lib/useOracles";
import { oracleStatus } from "@/lib/pyth";
import { formatUsd, formatTimestamp, formatAge } from "@/lib/format";
import { Card, CardHeader, Badge, Stat, AddressLink } from "./ui";
import { OracleStatusBadge } from "./OracleCell";
import { WriteCallForm } from "./WriteCallForm";
import { OfferBook } from "./OfferBook";
import { TitleTicker } from "./TitleTicker";
import { useOffers } from "@/lib/useOffers";
import { pda } from "@/lib/program";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useMemo } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { IconWarning } from "./icons";

export function MarketDetail({ market }: { market: MarketConfig }) {
  const { reads, now, loading } = useOracles([market.feedAccount]);
  const read = reads[market.feedAccount] ?? null;
  const [feedOwner, setFeedOwner] = useState<string | undefined>(undefined);
  const status = oracleStatus(read, now, market.maxStalenessSecs, market.maxConfBps, feedOwner);
  const [tab, setTab] = useState<"write" | "book">("book");
  const { connection } = useConnection();
  const [feeDestination, setFeeDestination] = useState<string | null>(null);

  const marketAddress = useMemo(
    () => pda.market(new PublicKey(market.underlyingMint), Buffer.from(market.feedId, "hex")).toBase58(),
    [market.underlyingMint, market.feedId],
  );
  const { offers, bids, refresh } = useOffers(marketAddress);
  const openCount = offers.filter((o) => o.state === "open").length;
  const filledCount = offers.filter((o) => o.state === "filled").length;
  const liveCount = openCount + filledCount;
  const lockedRaw = offers
    .filter((o) => o.state === "open" || o.state === "filled")
    .reduce((sum, o) => sum + o.collateralAmount, 0n);

  // The fee destination is set once when the protocol config is created, so it
  // is read from the chain rather than configured in the interface.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await connection.getAccountInfo(pda.config(), "confirmed").catch(() => null);
      if (cancelled || !info) return;
      setFeeDestination(new PublicKey(info.data.subarray(8 + 32 + 2, 8 + 32 + 2 + 32)).toBase58());
    })();
    return () => { cancelled = true; };
  }, [connection]);

  // The owner the market recorded at registration. The program re-checks it on
  // every settlement, so the interface checks the same thing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await connection
        .getAccountInfo(new PublicKey(marketAddress), "confirmed").catch(() => null);
      if (cancelled || !info) return;
      const off = 8 + 32 + 32 + 32 + 32; // underlying, premium, feedAccount, feedId
      setFeedOwner(new PublicKey(info.data.subarray(off, off + 32)).toBase58());
    })();
    return () => { cancelled = true; };
  }, [connection, marketAddress]);

  return (
    <div className="space-y-6">
      <TitleTicker price={read ? Number(read.price) / 1e8 : null} symbol={market.symbol} />

      <nav className="flex items-center gap-1.5 text-xs text-ink-muted" aria-label="Breadcrumb">
        <Link href="/" className="transition-colors hover:text-brand">Markets</Link>
        <span aria-hidden>/</span>
        <span className="text-ink-secondary">{market.symbol}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary">
              {market.symbol}
            </h1>
            <OracleStatusBadge
              read={read} now={now} loading={loading} expectedOwner={feedOwner}
              maxStaleness={market.maxStalenessSecs} maxConfBps={market.maxConfBps}
            />
            {status.isMirror && <Badge tone="warning" title={market.mocks}>Mirrored price</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-secondary">{market.label}</p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-muted">
            The call sells the upside above a strike. The locked shares are the most that can be paid out.
          </p>
        </div>
        <div className="text-right">
          {loading && !read ? (
            <div className="ml-auto h-9 w-32 animate-pulse rounded bg-bg-tertiary" />
          ) : read ? (
            <>
              <div className="tnum text-3xl font-semibold text-ink-primary">
                {formatUsd(read.price)}
              </div>
              <div className="tnum mt-1 text-xs text-ink-secondary">
                ±{status.confBps} bps · published {formatTimestamp(read.publishTime)}
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-muted">No feed on this network</div>
          )}
        </div>
      </div>

      {!loading && !status.ok && status.reason && (
        <Card className="flex items-start gap-3 border-state-warning/30 px-5 py-4">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" />
          <div>
            <p className="text-sm font-medium text-ink-primary">
              Positions on this market cannot settle right now
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
              {status.reason}. Writing and bidding still work.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="px-5 py-4">
          <Stat label="Oracle age" value={read ? formatAge(status.ageSecs) : "—"}
            sub={`limit ${market.maxStalenessSecs}s`}
            tone={status.ageSecs > market.maxStalenessSecs ? "warning" : undefined} />
        </Card>
        <Card className="px-5 py-4">
          <Stat
            label="Live offers" value={String(liveCount)}
            sub={
              liveCount === 0
                ? "none yet"
                : openCount === 0
                  ? `${filledCount} filled`
                  : `${openCount} taking bids${filledCount ? `, ${filledCount} filled` : ""}`
            }
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card as="section">
          <div className="grid gap-px border-b border-line-secondary bg-line-secondary sm:grid-cols-2" role="tablist" aria-label="Strategy">
            {([
              ["write", "Sell the upside", "You hold the stock. Lock it, pick a strike, and take USDC for everything above it."],
              ["book", "Buy capped upside", "You do not hold it. Bid USDC. If it finishes below the strike you lose the premium, and nothing else."],
            ] as const).map(([t, title, body]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-[48px] cursor-pointer px-5 py-4 text-left transition-colors ${
                  tab === t ? "bg-bg-tertiary" : "bg-bg-secondary hover:bg-bg-tertiary/70"
                }`}
              >
                <span className={`block text-sm font-medium ${tab === t ? "text-ink-primary" : "text-ink-secondary"}`}>
                  {title}
                </span>
                <span className="mt-1 block text-xs font-normal leading-relaxed text-ink-muted">
                  {body}
                </span>
              </button>
            ))}
          </div>

          {tab === "write" ? (
            <WriteCallForm
              market={market} marketAddress={marketAddress}
              oraclePrice={read?.price ?? null} onWritten={refresh}
              lockedRaw={lockedRaw}
            />
          ) : (
            <OfferBook
              market={market} marketAddress={marketAddress}
              offers={offers} bids={bids} now={now}
              feeDestination={feeDestination} onChanged={refresh}
            />
          )}
        </Card>

        <div className="space-y-4">
          <Card as="section">
            <CardHeader title="Accounts" />
            <dl className="space-y-3 px-5 py-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Mint</dt>
                <dd><AddressLink address={market.underlyingMint} /></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Oracle</dt>
                <dd><AddressLink address={market.feedAccount} /></dd>
              </div>
            </dl>
            {market.mocks !== "none" && (
              <p className="border-t border-line-secondary px-5 py-3 text-xs text-state-warning">
                Mirrored price. Owner check is still enforced on-chain.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
