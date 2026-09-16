"use client";

import { Badge } from "./ui";
import { IconWarning, IconCheck, IconClock } from "./icons";
import { formatAge, formatTimestamp, formatUsd } from "@/lib/format";
import { OracleRead, oracleStatus } from "@/lib/pyth";

/**
 * A price is never shown on its own here. The age of the print and the width of
 * the confidence band decide whether the program will accept it, so they travel
 * with the number everywhere it appears.
 */
export function OraclePrice({ read, now, maxStaleness, maxConfBps, size = "md", expectedOwner }: {
  read: OracleRead | null;
  now: number;
  maxStaleness: number;
  maxConfBps: number;
  size?: "sm" | "md" | "lg";
  expectedOwner?: string;
}) {
  const s = oracleStatus(read, now, maxStaleness, maxConfBps, expectedOwner);
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";

  if (!read) {
    return <span className={`${cls} text-ink-muted`}>No feed</span>;
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`tnum font-semibold ${cls} ${s.ok ? "text-ink-primary" : "text-ink-secondary"}`}>
        {formatUsd(read.price)}
      </span>
      <span
        className="tnum text-2xs text-ink-muted"
        title={`Published ${formatTimestamp(read.publishTime)}`}
      >
        ±{s.confBps} bps · {formatAge(s.ageSecs)} old
      </span>
    </div>
  );
}

export function OracleStatusBadge({ read, now, maxStaleness, maxConfBps, loading, expectedOwner }: {
  read: OracleRead | null; now: number; maxStaleness: number; maxConfBps: number;
  loading?: boolean; expectedOwner?: string;
}) {
  // Before the first read lands there is nothing to judge. Saying "Blocked"
  // here would report a fault that has not been observed.
  if (loading && !read) {
    return <span className="inline-block h-5 w-20 animate-pulse rounded-md bg-bg-tertiary" />;
  }
  const s = oracleStatus(read, now, maxStaleness, maxConfBps, expectedOwner);
  if (s.ok) {
    return (
      <Badge tone="success" title="The program would accept this print for settlement">
        <IconCheck className="h-3 w-3" /> Settleable
      </Badge>
    );
  }
  const stale = s.reason?.includes("older");
  return (
    <Badge tone={stale ? "warning" : "error"} title={s.reason ?? undefined}>
      {stale ? <IconClock className="h-3 w-3" /> : <IconWarning className="h-3 w-3" />}
      {stale ? "Stale" : "Blocked"}
    </Badge>
  );
}
