"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardHeader, EmptyState, Badge } from "./ui";
import { IconActivity, IconWarning } from "./icons";
import { MARKETS } from "@/lib/config";
import { useOracles } from "@/lib/useOracles";
import { useOffers } from "@/lib/useOffers";
import { useMarketIndex } from "@/lib/markets";
import { formatTimestamp, formatAge, formatUsd, formatAmount } from "@/lib/format";
import { oracleStatus } from "@/lib/pyth";
import { useMirrorHeartbeats } from "@/lib/useMirror";

export function ActivityScreen() {
  const { publicKey } = useWallet();
  const { reads, now, loading } = useOracles(MARKETS.map((m) => m.feedAccount));
  const { offers, bids, loading: offersLoading } = useOffers();
  const heartbeats = useMirrorHeartbeats();
  const { byAddress } = useMarketIndex();
  const me = publicKey?.toBase58() ?? null;

  const mine = useMemo(() => {
    if (!me) return [];
    return offers
      .filter((o) => o.writer === me || o.buyer === me || bids.some((b) => b.bidder === me && b.offer === o.address))
      .sort((a, b) => b.expiryTs - a.expiryTs);
  }, [offers, bids, me]);

  const settled = useMemo(
    () => offers.filter((o) => o.state === "settled").sort((a, b) => b.expiryTs - a.expiryTs).slice(0, 8),
    [offers],
  );

  const blocked = MARKETS.filter((m) => {
    const s = oracleStatus(reads[m.feedAccount] ?? null, now, m.maxStalenessSecs, m.maxConfBps);
    return !loading && !s.ok;
  });

  const rows = me ? mine : settled;
  const emptyTitle = me ? "Nothing of yours yet" : "No settlements yet";
  const emptyBody = me
    ? "Write or bid on a market and it shows up here."
    : "Closed calls across the protocol will list here.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Activity</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {me ? "Your calls and bids." : "Recent settlements. Connect to see yours."}
        </p>
      </div>

      {blocked.length > 0 && (
        <Card className="flex items-start gap-3 border-state-warning/30 px-5 py-4">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" />
          <p className="text-xs text-ink-secondary">
            <span className="font-medium text-ink-primary">{blocked.length} cannot settle.</span>{" "}
            {blocked.map((m) => m.symbol).join(", ")}
          </p>
        </Card>
      )}

      <Card as="section">
        <CardHeader
          title={me ? "Yours" : "Recent settlements"}
          action={
            me ? (
              <span className="text-2xs text-ink-muted">{mine.length}</span>
            ) : null
          }
        />
        {offersLoading && rows.length === 0 ? (
          <div className="space-y-2 px-5 py-6">
            {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-tertiary" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconActivity className="h-8 w-8" />}
            title={emptyTitle}
            body={emptyBody}
          />
        ) : (
          <ul className="divide-y divide-line-secondary">
            {rows.map((o) => {
              const m = byAddress.get(o.market);
              const role = me && o.writer === me ? "wrote" : me && o.buyer === me ? "bought" : o.state;
              return (
                <li key={o.address} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={m ? `/markets/${m.symbol}` : "/"} className="text-sm font-medium text-ink-primary hover:text-brand">
                        {m?.symbol ?? "—"}
                      </Link>
                      <Badge tone={o.state === "settled" && o.payoutAmount > 0n ? "success" : "neutral"}>
                        {me ? role : o.payoutAmount > 0n ? "ITM" : "OTM"}
                      </Badge>
                    </div>
                    <p className="tnum mt-0.5 text-xs text-ink-muted">
                      {formatAmount(o.collateralAmount, 8)} at {formatUsd(o.strikeUsd)}
                      {" · "}
                      {formatTimestamp(o.expiryTs)}
                    </p>
                  </div>
                  <div className="tnum text-right text-xs text-ink-secondary">
                    {o.state === "settled" ? (
                      <>
                        <div>{formatUsd(o.settledPrice)}</div>
                        <div className="text-ink-muted">{formatAmount(o.payoutAmount, 8)} to buyer</div>
                      </>
                    ) : (
                      <div className="capitalize">{o.state}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card as="section">
        <CardHeader title="Feeds" />
        <div className="grid gap-px sm:grid-cols-3">
          {MARKETS.map((m) => {
            const read = reads[m.feedAccount] ?? null;
            const s = oracleStatus(read, now, m.maxStalenessSecs, m.maxConfBps);
            const hb = heartbeats[m.symbol];
            const mirrorStalled = s.isMirror && hb && now - hb.lastPushedAt > 15 * 60;
            return (
              <div key={m.symbol} className="px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-primary">{m.symbol}</span>
                  {s.isMirror && <Badge tone="warning">Mirrored</Badge>}
                </div>
                <div className={`tnum mt-0.5 text-xs ${s.ok && !mirrorStalled ? "text-ink-muted" : "text-state-warning"}`}>
                  {loading && !read
                    ? "…"
                    : s.ok
                      ? `${formatAge(s.ageSecs)} · ±${s.confBps} bps`
                      : s.reason}
                  {mirrorStalled && hb ? ` · mirror ${formatAge(now - hb.lastPushedAt)}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
