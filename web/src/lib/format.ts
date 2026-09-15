/**
 * Number formatting. Two rules run through all of it.
 *
 * Nothing is rounded away that the chain actually recorded: a payout of
 * 0.99999999 is a real number with a real reason, and showing "1.00" hides the
 * rounding rule that produced it.
 *
 * Every figure that sits in a column is tabular, so rows stay comparable.
 */

/** Oracle prices and strikes are USD scaled by 1e8, matching the Pyth exponent. */
export const PRICE_SCALE = 100_000_000n;

/**
 * `bigint` means a raw 1e8-scaled oracle value and is divided down. `number`
 * means plain USD and is used as is. The two are never interchangeable, and
 * mixing them silently produced a price nine orders of magnitude too large
 * before this note existed.
 */
export function formatUsd(scaled: bigint | number, opts: { decimals?: number } = {}) {
  const v = typeof scaled === "bigint" ? Number(scaled) / 1e8 : scaled;
  const decimals = opts.decimals ?? 2;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Token amounts keep every decimal the mint actually has. */
export function formatAmount(raw: bigint | number, decimals: number) {
  const n = typeof raw === "bigint" ? raw : BigInt(Math.round(raw));
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, "0");
  return `${whole.toLocaleString("en-US")}.${frac}`;
}

export function formatBps(bps: number) {
  return `${bps} bps`;
}

/** Confidence as a fraction of price, which is how the program judges it. */
export function confidenceBps(price: bigint, conf: bigint): number {
  if (price === 0n) return 0;
  return Number((conf * 10_000n) / price);
}

/**
 * Age of an oracle print. Deliberately not "2 hours ago": the exact distance
 * matters because it is compared against a hard limit in the program.
 */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function shortAddress(a: string, size = 4) {
  return `${a.slice(0, size)}…${a.slice(-size)}`;
}

export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "expired";
  return formatAge(secondsLeft);
}
