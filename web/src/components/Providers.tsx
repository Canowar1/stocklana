"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_URL } from "@/lib/config";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Anza Wallet Adapter with an empty adapter list. Wallet Standard wallets
 * (Phantom, Solflare, Backpack, and any other installed extension) register
 * themselves. On mobile web, WalletProvider injects Mobile Wallet Adapter.
 * Do not pass named adapters from `@solana/wallet-adapter-wallets`; that
 * bundle hides Standard wallets and is the old kit.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
