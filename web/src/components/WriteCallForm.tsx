"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MarketConfig } from "@/lib/config";
import { formatUsd } from "@/lib/format";
import { Field, Input, Button, Card } from "./ui";
import { IconWarning } from "./icons";

const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-11 w-36 rounded-lg bg-bg-tertiary" /> },
);

/** Market hours in New York, where the equity feeds actually print. */
const MARKET_OPEN_UTC = 13 * 60 + 30;
const MARKET_CLOSE_UTC = 20 * 60;

function isUsMarketHours(d: Date) {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= MARKET_OPEN_UTC && mins <= MARKET_CLOSE_UTC;
}

export function WriteCallForm({ market, oraclePrice, connected }: {
  market: MarketConfig; oraclePrice: bigint | null; connected: boolean;
}) {
  const spot = oraclePrice ? Number(oraclePrice) / 1e8 : null;
  const [size, setSize] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [minPremium, setMinPremium] = useState("");

  const moneyness = useMemo(() => {
    const k = parseFloat(strike);
    if (!spot || !Number.isFinite(k) || k <= 0) return null;
    return ((k - spot) / spot) * 100;
  }, [strike, spot]);

  const expiryDate = expiry ? new Date(expiry) : null;
  const expiryOutsideHours =
    expiryDate && !Number.isNaN(expiryDate.valueOf()) && !isUsMarketHours(expiryDate);

  const maxPayout = useMemo(() => {
    const n = parseFloat(size);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [size]);

  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-xs leading-relaxed text-ink-secondary">
        Your collateral is the underlying itself, not USDC. You keep the position and sell the
        upside above your strike.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Size (${market.symbol})`} htmlFor="size"
          hint="Locked in the vault until settlement or expiry"
        >
          <Input id="size" inputMode="decimal" placeholder="10.00000000"
            value={size} onChange={(e) => setSize(e.target.value)} />
        </Field>

        <Field
          label="Strike (USD)" htmlFor="strike"
          hint={
            spot === null ? "No oracle price available"
            : moneyness === null ? `Spot is ${formatUsd(spot)}`
            : `${moneyness >= 0 ? "+" : ""}${moneyness.toFixed(1)}% against spot`
          }
        >
          <Input id="strike" inputMode="decimal"
            placeholder={spot ? (spot * 1.1).toFixed(2) : "0.00"}
            value={strike} onChange={(e) => setStrike(e.target.value)} />
        </Field>

        <Field
          label="Expiry" htmlFor="expiry"
          error={expiryOutsideHours ? "Outside US market hours, when the feed does not print" : undefined}
          hint="Weekdays 13:30 to 20:00 UTC"
        >
          <Input id="expiry" type="datetime-local"
            value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>

        <Field
          label="Minimum premium (USDC)" htmlFor="premium"
          hint="Bids below this are refused by the program"
        >
          <Input id="premium" inputMode="decimal" placeholder="20.00"
            value={minPremium} onChange={(e) => setMinPremium(e.target.value)} />
        </Field>
      </div>

      {/* What the writer is actually agreeing to, before they sign, rather than
          after. */}
      {maxPayout !== null && (
        <Card className="space-y-2 bg-bg-tertiary px-4 py-3 text-xs">
          <p className="font-medium text-ink-primary">What you are agreeing to</p>
          <ul className="space-y-1.5 text-ink-secondary">
            <li>
              Above your strike, the buyer takes a share of the position. The most they can ever
              receive is{" "}
              <span className="tnum text-ink-primary">
                {maxPayout.toLocaleString("en-US")} {market.symbol}
              </span>
              , and only as the price approaches infinity.
            </li>
            <li>
              Below your strike, you keep the entire position and the premium.
            </li>
            <li>
              There is no liquidation price. Your collateral covers every outcome by
              construction.
            </li>
          </ul>
        </Card>
      )}

      {expiryOutsideHours && (
        <div className="flex items-start gap-2.5 rounded-lg bg-state-warningBg px-4 py-3">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" />
          <p className="text-xs leading-relaxed text-ink-secondary">
            Equity feeds stop printing outside market hours, and the last print can be more than a
            day old over a weekend. An expiry there cannot settle until the feed resumes.
          </p>
        </div>
      )}

      {connected ? (
        <Button
          disabled={!size || !strike || !expiry || !!expiryOutsideHours}
          className="w-full sm:w-auto"
        >
          Review and lock collateral
        </Button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <WalletButton />
          <span className="text-xs text-ink-muted">Connect a wallet to write a call</span>
        </div>
      )}
    </div>
  );
}
