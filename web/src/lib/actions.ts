"use client";

import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Stocklana } from "@/idl/stocklana-types";
import { BN, pda, PREMIUM_MINT_KEY } from "./program";

/**
 * Which token program owns a mint decides how its accounts are derived. The
 * underlying here is Token-2022 and the premium mint may be either, so it is
 * looked up rather than assumed.
 */
export async function tokenProgramFor(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error(`Mint ${mint.toBase58()} does not exist on this network`);
  return info.owner;
}

export function ataFor(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
}

async function ensureAta(
  conn: Connection, mint: PublicKey, owner: PublicKey, payer: PublicKey, tokenProgram: PublicKey,
) {
  const ata = ataFor(mint, owner, tokenProgram);
  const info = await conn.getAccountInfo(ata, "confirmed");
  const ix = info
    ? null
    : createAssociatedTokenAccountInstruction(payer, ata, owner, mint, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  return { ata, ix };
}

export type WriteCallArgs = {
  program: Program<Stocklana>;
  writer: PublicKey;
  marketAddress: PublicKey;
  underlyingMint: PublicKey;
  /** Raw base units. */
  collateralAmount: bigint;
  /** USD per UI unit, scaled by 1e8. */
  strikeUsd: bigint;
  expiryTs: number;
  /** Premium mint base units. */
  minPremium: bigint;
};

export async function writeCall(a: WriteCallArgs): Promise<string> {
  const conn = a.program.provider.connection;
  const tokenProgram = await tokenProgramFor(conn, a.underlyingMint);
  // A random id keeps two offers from the same writer on the same market from
  // colliding, and keeps the address unguessable before it exists.
  const offerId = new BN(Math.floor(Math.random() * 2 ** 48));
  const offer = pda.offer(a.marketAddress, a.writer, offerId);

  return a.program.methods
    .writeCall(offerId, new BN(a.collateralAmount.toString()), new BN(a.strikeUsd.toString()),
      new BN(a.expiryTs), new BN(a.minPremium.toString()))
    .accountsPartial({
      writer: a.writer, config: pda.config(), market: a.marketAddress,
      underlyingMint: a.underlyingMint, offer, vault: pda.vault(offer),
      writerTokenAccount: ataFor(a.underlyingMint, a.writer, tokenProgram),
      tokenProgram, systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function placeBid(
  program: Program<Stocklana>, bidder: PublicKey, marketAddress: PublicKey,
  offer: PublicKey, amount: bigint,
): Promise<string> {
  const conn = program.provider.connection;
  const tokenProgram = await tokenProgramFor(conn, PREMIUM_MINT_KEY);
  return program.methods
    .placeBid(new BN(amount.toString()))
    .accountsPartial({
      bidder, market: marketAddress, offer, premiumMint: PREMIUM_MINT_KEY,
      bid: pda.bid(offer, bidder), bidVault: pda.bidVault(offer, bidder),
      bidderTokenAccount: ataFor(PREMIUM_MINT_KEY, bidder, tokenProgram),
      premiumTokenProgram: tokenProgram, systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function acceptBid(
  program: Program<Stocklana>, writer: PublicKey, marketAddress: PublicKey,
  offer: PublicKey, bidder: PublicKey, feeDestination: PublicKey,
): Promise<string> {
  const conn = program.provider.connection;
  const tokenProgram = await tokenProgramFor(conn, PREMIUM_MINT_KEY);
  const { ata, ix } = await ensureAta(conn, PREMIUM_MINT_KEY, writer, writer, tokenProgram);
  const builder = program.methods
    .acceptBid()
    .accountsPartial({
      writer, config: pda.config(), market: marketAddress, offer,
      bid: pda.bid(offer, bidder), bidVault: pda.bidVault(offer, bidder),
      premiumMint: PREMIUM_MINT_KEY, writerPremiumAccount: ata,
      feeDestination, premiumTokenProgram: tokenProgram,
    });
  return ix ? builder.preInstructions([ix]).rpc() : builder.rpc();
}

export async function cancelOrRefundBid(
  program: Program<Stocklana>, bidder: PublicKey, marketAddress: PublicKey,
  offer: PublicKey, kind: "cancel" | "refund",
): Promise<string> {
  const conn = program.provider.connection;
  const tokenProgram = await tokenProgramFor(conn, PREMIUM_MINT_KEY);
  const accounts = {
    bidder, market: marketAddress, offer,
    bid: pda.bid(offer, bidder), bidVault: pda.bidVault(offer, bidder),
    premiumMint: PREMIUM_MINT_KEY,
    bidderTokenAccount: ataFor(PREMIUM_MINT_KEY, bidder, tokenProgram),
    premiumTokenProgram: tokenProgram,
  };
  return kind === "cancel"
    ? program.methods.cancelBid().accountsPartial(accounts).rpc()
    : program.methods.refundBid().accountsPartial(accounts).rpc();
}

export async function settle(
  program: Program<Stocklana>, cranker: PublicKey, marketAddress: PublicKey,
  offer: PublicKey, underlyingMint: PublicKey, feedAccount: PublicKey,
  buyer: PublicKey, writer: PublicKey,
): Promise<string> {
  const conn = program.provider.connection;
  const tokenProgram = await tokenProgramFor(conn, underlyingMint);
  return program.methods
    .settle()
    .accountsPartial({
      cranker, market: marketAddress, offer, underlyingMint, feedAccount,
      vault: pda.vault(offer), buyer,
      buyerTokenAccount: ataFor(underlyingMint, buyer, tokenProgram),
      writer, writerTokenAccount: ataFor(underlyingMint, writer, tokenProgram),
      tokenProgram, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function reclaim(
  program: Program<Stocklana>, writer: PublicKey, marketAddress: PublicKey,
  offer: PublicKey, underlyingMint: PublicKey,
): Promise<string> {
  const conn = program.provider.connection;
  const tokenProgram = await tokenProgramFor(conn, underlyingMint);
  return program.methods
    .reclaim()
    .accountsPartial({
      writer, market: marketAddress, offer, underlyingMint, vault: pda.vault(offer),
      writerTokenAccount: ataFor(underlyingMint, writer, tokenProgram),
      tokenProgram,
    })
    .rpc();
}

/**
 * Anchor errors arrive wrapped in several layers of noise. The program's own
 * message is the only part a person can act on.
 */
export function readableError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const anchor = msg.match(/Error Message: ([^.\n]+)/);
  if (anchor) return anchor[1].trim() + ".";
  if (msg.includes("User rejected")) return "You declined the transaction.";
  if (msg.includes("insufficient funds") || msg.includes("Insufficient"))
    return "Not enough balance for this transaction.";
  if (msg.includes("blockhash")) return "The transaction expired before it was signed. Try again.";
  return msg.split("\n")[0];
}
