"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CLUSTER, PROGRAM_ID, EXPLORER } from "@/lib/config";
import { IconMarkets, IconPositions, IconActivity, IconSun, IconMoon } from "./icons";

const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-11 w-36 rounded-lg bg-bg-tertiary" /> },
);

const NAV = [
  { href: "/", label: "Markets", Icon: IconMarkets },
  { href: "/positions", label: "Positions", Icon: IconPositions },
  { href: "/activity", label: "Activity", Icon: IconActivity },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") setTheme(t);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("stocklana-theme", next); } catch {}
  };
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-bg-tertiary hover:text-ink-primary"
    >
      {theme === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
    </button>
  );
}

/**
 * The network is stated once, in the chrome, the way a product marks a test
 * environment. It is not apologised for in body copy on every screen.
 */
function NetworkTag() {
  if (CLUSTER === "mainnet") return null;
  return (
    // Always visible, including on a phone. Which network someone is signing
    // against is never a detail to hide at a narrow width.
    <span
      title={`Connected to ${CLUSTER}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-state-warningBg px-2 py-1 text-2xs font-medium uppercase tracking-wide text-state-warning"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-state-warning" />
      <span className="hidden sm:inline">{CLUSTER}</span>
      <span className="sm:hidden">{CLUSTER.slice(0, 3)}</span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line-secondary bg-bg-primary/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden focusable="false">
              <rect width="28" height="28" rx="7" fill="var(--brand-primary)" />
              <path d="M8 18.5 12 12l3.4 3.2L20 8.5" stroke="var(--text-button)"
                strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="text-[15px] font-semibold tracking-tight text-ink-primary">
              Stocklana
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map(({ href, label, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-bg-tertiary text-ink-primary"
                      : "text-ink-secondary hover:bg-bg-tertiary hover:text-ink-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NetworkTag />
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>

        {/* Below md the same destinations sit in a row under the header rather
            than behind a menu, so nothing is one tap further away on a phone. */}
        <nav className="flex border-t border-line-secondary md:hidden" aria-label="Primary mobile">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 text-xs font-medium transition-colors ${
                  active
                    ? "border-b-2 border-brand text-ink-primary"
                    : "border-b-2 border-transparent text-ink-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-line-secondary">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-4 py-5 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Covered calls on tokenized equity, settled against a Pyth price on-chain.</p>
          <a
            href={EXPLORER(PROGRAM_ID)}
            target="_blank"
            rel="noreferrer noopener"
            className="tnum transition-colors hover:text-brand"
          >
            Program {PROGRAM_ID.slice(0, 6)}…{PROGRAM_ID.slice(-6)}
          </a>
        </div>
      </footer>
    </div>
  );
}
