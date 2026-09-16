"use client";

import { useId } from "react";
import { formatUsd } from "@/lib/format";

/**
 * The payoff of a covered call, drawn.
 *
 * Every competitor that sells options has one of these, and none of the perp
 * venues do. The reason is that a capped payoff is a shape, and the shape
 * explains in a glance what "collateral × (S − K) ÷ S" takes a paragraph to
 * say. Two lines are drawn: what the position is worth if the call is written,
 * and what simply holding the asset would have been worth. The gap between
 * them above the strike is the thing being sold.
 */
export function PayoffChart({ spot, strike, size, premium, symbol }: {
  spot: number | null;
  strike: number | null;
  size: number;
  premium: number;
  symbol: string;
}) {
  const id = useId();
  if (!spot || !strike || strike <= 0 || size <= 0) return null;

  const W = 520, H = 190, PAD_L = 8, PAD_R = 8, PAD_T = 14, PAD_B = 26;
  const xMin = 0;
  const xMax = Math.max(strike * 1.9, spot * 1.6);
  const yMaxHold = size * xMax;
  const yMax = yMaxHold * 1.02;

  const px = (p: number) => PAD_L + ((p - xMin) / (xMax - xMin)) * (W - PAD_L - PAD_R);
  const py = (v: number) => H - PAD_B - (v / yMax) * (H - PAD_T - PAD_B);

  // Holding: value rises with price forever.
  const holdPath = `M ${px(0)} ${py(0)} L ${px(xMax)} ${py(yMaxHold)}`;

  // Written: identical below the strike, then flat at the strike value, plus
  // the premium at every price.
  const capped = size * strike;
  const writtenPath =
    `M ${px(0)} ${py(premium)}` +
    ` L ${px(strike)} ${py(capped + premium)}` +
    ` L ${px(xMax)} ${py(capped + premium)}`;

  const giveUp =
    `M ${px(strike)} ${py(capped + premium)}` +
    ` L ${px(xMax)} ${py(capped + premium)}` +
    ` L ${px(xMax)} ${py(yMaxHold)} Z`;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={
          `Payoff for a ${size} ${symbol} covered call at a ${formatUsd(strike)} strike. ` +
          `Below the strike the position tracks the asset. Above it the value is capped at ` +
          `${formatUsd(capped + premium)}, so the buyer receives everything beyond that.`
        }
      >
        <defs>
          <linearGradient id={`${id}-gap`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--status-warning)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--status-warning)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B}
          stroke="var(--border-secondary)" strokeWidth="1" />

        {/* The upside handed to the buyer. */}
        <path d={giveUp} fill={`url(#${id}-gap)`} />

        <path d={holdPath} fill="none" stroke="var(--text-muted)"
          strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={writtenPath} fill="none" stroke="var(--brand-primary)"
          strokeWidth="2.5" strokeLinejoin="round" />

        {/* Strike and spot, marked where they actually fall. */}
        <line x1={px(strike)} y1={PAD_T} x2={px(strike)} y2={H - PAD_B}
          stroke="var(--status-warning)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={px(strike)} y={H - 9} textAnchor="middle"
          fill="var(--status-warning)" fontSize="10" className="tnum">
          strike {formatUsd(strike)}
        </text>

        <line x1={px(spot)} y1={PAD_T} x2={px(spot)} y2={H - PAD_B}
          stroke="var(--text-secondary)" strokeWidth="1" />
        <text x={px(spot)} y={PAD_T - 3} textAnchor="middle"
          fill="var(--text-secondary)" fontSize="10" className="tnum">
          spot {formatUsd(spot)}
        </text>
      </svg>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-brand" /> With the call written
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded border-t border-dashed border-ink-muted" /> Holding alone
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-state-warningBg" /> Upside sold
        </span>
      </figcaption>
    </figure>
  );
}
