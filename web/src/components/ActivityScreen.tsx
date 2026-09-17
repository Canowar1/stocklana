"use client";

import { useMemo } from "react";
import { Card, CardHeader, EmptyState, Badge, AddressLink, Stat } from "./ui";
import { IconActivity, IconWarning } from "./icons";
import { MARKETS } from "@/lib/config";
import { useOracles } from "@/lib/useOracles";
import { useOffers } from "@/lib/useOffers";
import { useMarketIndex } from "@/lib/markets";
import { formatTimestamp, formatAge, formatUsd, formatAmount } from "@/lib/format";
import { oracleStatus } from "@/lib/pyth";
import { useMirrorHeartbeats } from "@/lib/useMirror";

export function ActivityScreen() {
  const { reads, now, loading } = useOracles(MARKETS.map((m) => m.feedAccount));
  const { offers, loading: offersLoading } = useOffers();
  const heartbeats = useMirrorHeartbeats();
  const { byAddress } = useMarketIndex();

  const settled = useMemo(
    () => offers.filter((o) => o.state === "settled").sort((a, b) => b.expiryTs - a.expiryTs),
    [offers],
  );

  const totals = useMemo(() => {
    const written = offers.length;
    const live = offers.filter((o) => o.state === "open" || o.state === "filled").length;
    const premium = offers.reduce((s, o) => s + o.premiumPaid, 0n);
    return { written, live, premium };
  }, [offers]);

  const blocked = MARKETS.filter((m) => {
    const s = oracleStatus(reads[m.feedAccount] ?? null, now, m.maxStalenessSecs, m.maxConfBps);
    return !loading && !s.ok;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Activity</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          Every settlement across the protocol, and the state of the price feeds those settlements
          depend on.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <Stat label="Calls written" value={String(totals.written)} sub="since deployment" />
        </Card>
        <Card className="px-5 py-4">
          <Stat label="Live positions" value={String(totals.live)} sub="open or filled" />
        </Card>
        <Card className="px-5 py-4">
          <Stat
            label="Premium paid" value={`${formatAmount(totals.premium, 6)} USDC`}
            sub="to writers, across every accepted bid"
          />
        </Card>
      </div>

      {blocked.length > 0 && (
        <Card className="flex items-start gap-3 border-state-warning/30 px-5 py-4">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" />
          <p className="text-xs leading-relaxed text-ink-secondary">
            <span className="font-medium text-ink-primary">
              {blocked.length} market{blocked.length === 1 ? "" : "s"} cannot settle right now.
            </span>{" "}
            The program refuses a price it does not trust rather than executing against it, so a
            position waits instead of closing at the wrong number.
          </p>
        </Card>
      )}

      <Card as="section">
        <CardHeader
          title="Feed health"
          description="Settlement is refused while a feed is outside its market's limits. This is where to look when a position will not close."
        />
        <div className="divide-y divide-line-secondary">
          {MARKETS.map((m) => {
            const read = reads[m.feedAccount] ?? null;
            const s = oracleStatus(read, now, m.maxStalenessSecs, m.maxConfBps);
            return (
              <div key={m.symbol} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-primary">{m.symbol}</span>
                    {s.isMirror && <Badge tone="warning" title={m.mocks}>Mirrored</Badge>}
                  </div>
                  <div className="tnum mt-0.5 text-xs text-ink-secondary">
                    {read
                      ? `${formatUsd(read.price)} · last print ${formatTimestamp(read.publishTime)}`
                      : "no feed account on this network"}
                  </div>
                  {/* For a mirrored feed, when the relayer last ran is a
                      different fact from when the source last printed, and only
                      one of them means something is broken. */}
                  {s.isMirror && (() => {
                    const hb = heartbeats[m.symbol];
                    if (!hb) {
                      return (
                        <div className="tnum mt-0.5 text-xs text-ink-muted">
                          mirror heartbeat unknown
                        </div>
                      );
                    }
                    const since = now - hb.lastPushedAt;
                    const stalled = since > 15 * 60;
                    return (
                      <div
                        className={`tnum mt-0.5 text-xs ${stalled ? "text-state-error" : "text-ink-muted"}`}
                      >
                        {stalled ? "mirror has not pushed for " : "mirror last pushed "}
                        {formatAge(since)}
                        {` · ${hb.updates.toLocaleString("en-US")} pushes`}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${s.ok ? "text-state-success" : "text-state-warning"}`}>
                    {loading && !read ? "…" : s.ok ? "Settleable" : s.reason}
                  </div>
                  <div className="tnum mt-0.5 text-xs text-ink-muted">
                    {read
                      ? `${formatAge(s.ageSecs)} old, limit ${m.maxStalenessSecs}s · ±${s.confBps} bps, limit ±${m.maxConfBps}`
                      : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card as="section">
        <CardHeader
          title="Settlements"
          description="The price that decided each one, read from the market's oracle account at the moment it closed."
        />
        {offersLoading && settled.length === 0 ? (
          <div className="space-y-2 px-5 py-6">
            {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-tertiary" />)}
          </div>
        ) : settled.length === 0 ? (
          <EmptyState
            icon={<IconActivity className="h-8 w-8" />}
            title="No settlements yet"
            body="Every settled position is recorded on-chain with the exact price that decided it. They will be listed here as they happen."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-secondary text-2xs uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-5 py-3 text-left font-medium">Market</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Expired</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Strike</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Settled at</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">To buyer</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">To writer</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((o) => {
                  const m = byAddress.get(o.market);
                  const adjusted = o.settledStrike > 0n && o.settledStrike !== o.strikeUsd;
                  const itm = o.payoutAmount > 0n;
                  return (
                    <tr key={o.address} className="border-b border-line-secondary/60 last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink-primary">{m?.symbol ?? "—"}</span>
                          <Badge tone={itm ? "success" : "neutral"}>
                            {itm ? "in the money" : "expired worthless"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-ink-muted">
                          <AddressLink address={o.writer} /> to{" "}
                          {o.buyer ? <AddressLink address={o.buyer} /> : "—"}
                        </div>
                      </td>
                      <td className="tnum px-5 py-3 text-xs text-ink-secondary">
                        {formatTimestamp(o.expiryTs)}
                      </td>
                      <td className="tnum px-5 py-3 text-right">
                        {formatUsd(o.settledStrike)}
                        {adjusted && (
                          <div
                            className="text-2xs text-state-warning"
                            title={`Written at ${formatUsd(o.strikeUsd)}, adjusted by the mint's multiplier`}
                          >
                            adjusted
                          </div>
                        )}
                      </td>
                      <td className="tnum px-5 py-3 text-right text-ink-primary">
                        {formatUsd(o.settledPrice)}
                      </td>
                      <td className="tnum px-5 py-3 text-right">
                        {formatAmount(o.payoutAmount, 8)}
                      </td>
                      <td className="tnum px-5 py-3 text-right">
                        {formatAmount(o.collateralAmount - o.payoutAmount, 8)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
