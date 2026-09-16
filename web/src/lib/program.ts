"use client";

import { useMemo } from "react";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet, AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "@/idl/stocklana.json";
import type { Stocklana } from "@/idl/stocklana-types";
import { PROGRAM_ID, PREMIUM_MINT } from "./config";

export { BN, PublicKey, SystemProgram, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

export function useProgram(): Program<Stocklana> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed", preflightCommitment: "confirmed",
    });
    return new Program(idl as Idl, provider) as unknown as Program<Stocklana>;
  }, [connection, wallet]);
}

/** Read-only client for pages that show data before a wallet is connected. */
export function useReadProgram(): Program<Stocklana> {
  const { connection } = useConnection();
  return useMemo(() => {
    const provider = new AnchorProvider(connection, {} as AnchorWallet, {
      commitment: "confirmed",
    });
    return new Program(idl as Idl, provider) as unknown as Program<Stocklana>;
  }, [connection]);
}

function useAnchorWallet(): AnchorWallet | undefined {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  return useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return undefined;
    return { publicKey, signTransaction, signAllTransactions } as AnchorWallet;
  }, [publicKey, signTransaction, signAllTransactions]);
}

const programId = new PublicKey(PROGRAM_ID);

export const pda = {
  config: () => PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0],
  market: (mint: PublicKey, feedId: Buffer) =>
    PublicKey.findProgramAddressSync([Buffer.from("market"), mint.toBuffer(), feedId], programId)[0],
  offer: (market: PublicKey, writer: PublicKey, id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), market.toBuffer(), writer.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      programId)[0],
  vault: (offer: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), offer.toBuffer()], programId)[0],
  bid: (offer: PublicKey, bidder: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("bid"), offer.toBuffer(), bidder.toBuffer()], programId)[0],
  bidVault: (offer: PublicKey, bidder: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("bid_vault"), offer.toBuffer(), bidder.toBuffer()], programId)[0],
};

export const PREMIUM_MINT_KEY = new PublicKey(PREMIUM_MINT);

/** Offer state as the program writes it, flattened for the interface. */
export type OfferState = "open" | "filled" | "settled" | "reclaimed";

export function offerStateOf(raw: Record<string, unknown>): OfferState {
  const k = Object.keys(raw)[0]?.toLowerCase();
  return (k as OfferState) ?? "open";
}
