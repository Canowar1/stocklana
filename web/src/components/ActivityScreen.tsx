"use client";

import { Card, CardHeader, EmptyState } from "./ui";
import { IconActivity } from "./icons";
import { MARKETS } from "@/lib/config";
import { useOracles } from "@/lib/useOracles";
import { formatTimestamp, formatAge } from "@/lib/format";
import { oracleStatus } from "@/lib/pyth";

export function ActivityScreen() {
  const { reads, now } = useOracles(MARKETS.map((m) => m.feedAccount));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Activity</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          Every settlement across the protocol, and the state of the price feeds those
          settlements depend on.
        </p>
      </div>

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
                <div>
                  <div className="text-sm font-medium text-ink-primary">{m.symbol}</div>
                  <div className="tnum mt-0.5 text-xs text-ink-secondary">
                    {read ? `last print ${formatTimestamp(read.publishTime)}` : "no feed account"}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${s.ok ? "text-state-success" : "text-state-warning"}`}>
                    {s.ok ? "Settleable" : s.reason}
                  </div>
                  <div className="tnum mt-0.5 text-xs text-ink-muted">
                    {read ? `${formatAge(s.ageSecs)} old · ±${s.confBps} bps` : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card as="section">
        <CardHeader title="Settlements" />
        <EmptyState
          icon={<IconActivity className="h-8 w-8" />}
          title="No settlements yet"
          body="Every settled position is recorded on-chain with the exact price that decided it. They will be listed here as they happen."
        />
      </Card>
    </div>
  );
}
