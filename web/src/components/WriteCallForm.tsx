"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { MarketConfig } from "@/lib/config";
import { formatUsd, formatAmount } from "@/lib/format";
import { useProgram } from "@/lib/program";
import { useTokenBalance } from "@/lib/useBalance";
import { writeCall, readableError } from "@/lib/actions";
import { Field, Input, Button, Card } from "./ui";
import { IconWarning } from "./icons";
import { TxFeedback, TxState } from "./TxFeedback";

const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-11 w-36 rounded-lg bg-bg-tertiary" /> },
);

const MARKET_OPEN_UTC = 13 * 60 + 30;
const MARKET_CLOSE_UTC = 20 * 60;

function isUsMarketHours(d: Date) {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= MARKET_OPEN_UTC && mins <= MARKET_CLOSE_UTC;
}

function toBaseUnits(value: string, decimals: number): bigint | null {
  if (!/^\d*\.?\d*$/.test(value.trim()) || value.trim() === "") return null;
  const [whole = "0", frac = ""] = value.trim().split(".");
  if (frac.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac || "0").padEnd(decimals, "0"));
}

export function WriteCallForm({ market, marketAddress, oraclePrice, onWritten }: {
  market: MarketConfig;
  marketAddress: string | null;
  oraclePrice: bigint | null;
  onWritten: () => void;
}) {
  const { connected, publicKey } = useWallet();
  const program = useProgram();
  const { balance } = useTokenBalance(market.underlyingMint);
  const { balance: premiumBalance } = useTokenBalance(undefined);

  const spot = oraclePrice ? Number(oraclePrice) / 1e8 : null;
  const [size, setSize] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [minPremium, setMinPremium] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });

  const decimals = balance?.decimals ?? 8;

  const moneyness = useMemo(() => {
    const k = parseFloat(strike);
    if (!spot || !Number.isFinite(k) || k <= 0) return null;
    return ((k - spot) / spot) * 100;
  }, [strike, spot]);

  const expiryDate = expiry ? new Date(expiry) : null;
  const expiryValid = expiryDate && !Number.isNaN(expiryDate.valueOf());
  const expiryOutsideHours = expiryValid && !isUsMarketHours(expiryDate!);
  const expiryInPast = expiryValid && expiryDate!.getTime() <= Date.now();

  const sizeUnits = toBaseUnits(size, decimals);
  const overBalance = sizeUnits !== null && balance !== null && sizeUnits > balance.raw;
  const sizeNumber = parseFloat(size);

  const canSubmit =
    !!program && !!publicKey && !!marketAddress &&
    sizeUnits !== null && sizeUnits > 0n && !overBalance &&
    parseFloat(strike) > 0 && !!expiryValid && !expiryInPast &&
    tx.kind !== "signing" && tx.kind !== "confirming";

  async function submit() {
    if (!program || !publicKey || !marketAddress) return;
    const collateral = toBaseUnits(size, decimals);
    const strikeScaled = toBaseUnits(strike, 8);
    const premium = toBaseUnits(minPremium || "0", 6);
    if (collateral === null || strikeScaled === null || premium === null || !expiryDate) return;

    setTx({ kind: "signing" });
    try {
      const signature = await writeCall({
        program, writer: publicKey,
        marketAddress: new PublicKey(marketAddress),
        underlyingMint: new PublicKey(market.underlyingMint),
        collateralAmount: collateral, strikeUsd: strikeScaled,
        expiryTs: Math.floor(expiryDate.getTime() / 1000), minPremium: premium,
      });
      setTx({
        kind: "done", signature,
        message: `Locked ${size} ${market.symbol}. The offer is now in the book for anyone to bid on.`,
      });
      setSize(""); setStrike(""); setExpiry(""); setMinPremium("");
      onWritten();
    } catch (e) {
      setTx({ kind: "error", message: readableError(e) });
    }
  }

  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-xs leading-relaxed text-ink-secondary">
        Your collateral is the underlying itself, not USDC. You keep the position and sell the
        upside above your strike.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Size (${market.symbol})`} htmlFor="size"
          error={overBalance ? "More than your balance" : undefined}
          hint={
            balance
              ? `Balance ${formatAmount(balance.raw, balance.decimals)}`
              : connected ? "No balance on this network" : "Locked until settlement or expiry"
          }
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
          error={
            expiryInPast ? "Expiry is already in the past"
            : expiryOutsideHours ? "Outside US market hours, when the feed does not print"
            : undefined
          }
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

      {Number.isFinite(sizeNumber) && sizeNumber > 0 && (
        <Card className="space-y-2 bg-bg-tertiary px-4 py-3 text-xs">
          <p className="font-medium text-ink-primary">What you are agreeing to</p>
          <ul className="space-y-1.5 text-ink-secondary">
            <li>
              Above your strike the buyer takes a share of the position. The most they can ever
              receive is{" "}
              <span className="tnum text-ink-primary">
                {sizeNumber.toLocaleString("en-US")} {market.symbol}
              </span>
              , and only as the price approaches infinity.
            </li>
            <li>Below your strike you keep the entire position and the premium.</li>
            <li>There is no liquidation price. Your collateral covers every outcome.</li>
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

      <TxFeedback state={tx} />

      {connected ? (
        <Button disabled={!canSubmit} onClick={submit} className="w-full sm:w-auto">
          {tx.kind === "signing" || tx.kind === "confirming" ? "Locking collateral" : "Lock collateral and write"}
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
