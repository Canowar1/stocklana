"use client";

import Link from "next/link";
import { MARKETS, OTHER_MARKETS, CLUSTER } from "@/lib/config";
import { useOracles } from "@/lib/useOracles";
import { Card, CardHeader, Badge, EmptyState, AddressLink } from "./ui";
import { OraclePrice, OracleStatusBadge } from "./OracleCell";
import { IconEmptyBook, IconArrowRight, IconWarning } from "./icons";

export function MarketsScreen() {
  const { reads, now, loading, error } = useOracles(MARKETS.map((m) => m.feedAccount));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Markets</h1>
        <p className="text-sm text-ink-secondary">
          Sell capped upside on a tokenized stock you already hold, or bid USDC for that upside.
        </p>
      </div>

      {error && (
        <Card className="flex items-start gap-3 px-5 py-4">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-error" />
          <div>
            <p className="text-sm font-medium text-ink-primary">Prices are not loading</p>
            <p className="mt-0.5 text-xs text-ink-secondary">{error}</p>
          </div>
        </Card>
      )}

      <Card as="section">
        <CardHeader title="Live markets" />

        {MARKETS.length === 0 ? (
          <EmptyState
            icon={<IconEmptyBook className="h-8 w-8" />}
            title="No markets on this network"
            body="Markets are registered by the protocol authority. Run the market setup script against this cluster to add one."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-secondary text-2xs uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-4 py-3 text-left font-medium sm:px-5">Market</th>
                  <th scope="col" className="hidden px-5 py-3 text-left font-medium md:table-cell">Underlying</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium sm:px-5">Price</th>
                  <th scope="col" className="hidden px-5 py-3 text-right font-medium lg:table-cell">Limits</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium sm:px-5">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium sr-only sm:px-5">Open</th>
                </tr>
              </thead>
              <tbody>
                {MARKETS.map((m) => {
                  const read = reads[m.feedAccount] ?? null;
                  return (
                    <tr
                      key={m.symbol}
                      className="group border-b border-line-secondary/60 transition-colors last:border-0 hover:bg-bg-tertiary/60"
                    >
                      <td className="px-5 py-4">
                        <Link href={`/markets/${m.symbol}`} className="block">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-primary">{m.symbol}</span>
                            {m.mocks !== "none" && (
                              <Badge tone="warning" title={m.mocks}>Mirrored</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-secondary">{m.label}</div>
                        </Link>
                      </td>
                      <td className="hidden px-5 py-4 md:table-cell">
                        <AddressLink address={m.underlyingMint} />
                      </td>
                      <td className="px-4 py-4 text-right sm:px-5">
                        {loading && !read ? (
                          <div className="ml-auto h-5 w-24 animate-pulse rounded bg-bg-tertiary" />
                        ) : (
                          <OraclePrice
                            read={read} now={now}
                            maxStaleness={m.maxStalenessSecs} maxConfBps={m.maxConfBps}
                          />
                        )}
                      </td>
                      <td className="tnum hidden px-5 py-4 text-right text-xs text-ink-secondary lg:table-cell">
                        <div>{m.maxStalenessSecs}s staleness</div>
                        <div className="text-ink-muted">±{m.maxConfBps} bps confidence</div>
                      </td>
                      <td className="px-4 py-4 text-right sm:px-5">
                          <OracleStatusBadge
                            read={read} now={now} loading={loading}
                            maxStaleness={m.maxStalenessSecs} maxConfBps={m.maxConfBps}
                          />
                      </td>
                      <td className="px-4 py-4 text-right sm:px-5">
                        <Link
                          href={`/markets/${m.symbol}`}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
                        >
                          Open <IconArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {CLUSTER !== "mainnet" && OTHER_MARKETS.length > 0 && (
        <Card as="section">
          <CardHeader title={`${OTHER_MARKETS.length} more on mainnet`} />
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {OTHER_MARKETS.map((m) => (
              <span
                key={m.symbol}
                title={`${m.label} · feed ${m.feedAccount}`}
                className="rounded-md border border-line-secondary px-2.5 py-1 text-xs text-ink-secondary"
              >
                {m.symbol}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
