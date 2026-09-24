"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { shortAddressSafe } from "@/lib/ui-helpers";

/**
 * Wallet Standard wallets only. No Reown or Privy project: those kits need an
 * account and, in the common modal, list Ethereum wallets. This dialog lists
 * whatever Solana wallet the browser already has.
 */
export function ConnectButton({ className = "" }: { className?: string }) {
  const { wallets, wallet, publicKey, connected, connecting, select, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const pending = useRef<WalletName | null>(null);

  useEffect(() => {
    if (!pending.current || wallet?.adapter.name !== pending.current) return;
    pending.current = null;
    connect().catch(() => {});
  }, [wallet, connect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed);
  const rest = wallets.filter((w) => w.readyState !== WalletReadyState.Installed);

  function choose(name: WalletName) {
    pending.current = name;
    select(name);
    setOpen(false);
  }

  if (connected && publicKey) {
    const label = shortAddressSafe(publicKey.toBase58());
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          className={`inline-flex h-11 max-w-[12.5rem] items-center rounded-lg bg-bg-tertiary px-3 text-sm font-medium text-ink-primary ${className}`}
        >
          <span className="tnum truncate">{label}</span>
        </button>
        {menu && (
          <div className="absolute right-0 z-40 mt-1 min-w-[10rem] rounded-lg border border-line-secondary bg-bg-secondary p-1 shadow-lg">
            <button
              type="button"
              onClick={() => { setMenu(false); disconnect().catch(() => {}); }}
              className="flex min-h-[44px] w-full items-center rounded-md px-3 text-left text-sm text-ink-primary hover:bg-bg-tertiary"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={connecting}
        className={`inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-ink-onBrand transition-colors hover:bg-brand-hover disabled:opacity-60 ${className}`}
      >
        {connecting ? "Connecting" : "Connect wallet"}
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-title"
            className="grid w-full max-w-xl overflow-hidden rounded-xl border border-line-secondary bg-bg-secondary shadow-xl sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line-secondary p-4 sm:border-b-0 sm:border-r">
              <h2 id="connect-title" className="text-base font-semibold text-ink-primary">
                Connect a wallet
              </h2>
              <p className="mt-3 text-2xs font-medium uppercase tracking-wide text-ink-muted">
                Installed
              </p>
              <ul className="mt-2 space-y-1">
                {installed.length === 0 && (
                  <li className="px-2 py-3 text-xs leading-relaxed text-ink-secondary">
                    No Solana wallet in this browser. Install Phantom, Solflare, or Backpack, then reload.
                  </li>
                )}
                {installed.map((w) => (
                  <li key={w.adapter.name}>
                    <button
                      type="button"
                      onClick={() => choose(w.adapter.name)}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-ink-primary hover:bg-bg-tertiary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" className="h-6 w-6 rounded-md" />
                      {w.adapter.name}
                    </button>
                  </li>
                ))}
              </ul>
              {rest.length > 0 && (
                <p className="mt-4 px-2 text-2xs text-ink-muted">
                  {rest.length} more will appear here once installed.
                </p>
              )}
            </div>
            <div className="p-5">
              <p className="text-sm font-medium text-ink-primary">What connecting does</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                The wallet only signs. Locking stock or bidding USDC happens after you approve a transaction. Nothing moves when you connect.
              </p>
              <p className="mt-4 text-xs leading-relaxed text-ink-secondary">
                A covered call caps the upside above the strike. The shares in the vault are the most a buyer can receive.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-5 text-xs text-ink-muted hover:text-ink-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
