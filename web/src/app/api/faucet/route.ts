/**
 * Devnet faucet.
 *
 * Mints replica underlying and test USDC so a visitor arrives with a balance
 * instead of a dead end. This runs on the server because it signs with the
 * mint authority; that key never reaches the browser.
 *
 * Rate limited per wallet and per address. A faucet drained during a demo is
 * an avoidable failure, and the limit is the whole point of the route rather
 * than an afterthought.
 */
import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent, mintTo, getMint,
} from "@solana/spl-token";
import replicas from "../../../../../config/replica-mints.json";
import devnetMarkets from "../../../../../config/markets.devnet.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const UNDERLYING_UNITS = 100;
const USDC_UNITS = 5_000;

/** Per-process, which is enough for a single deployment and has no dependency. */
const lastClaim = new Map<string, number>();

function authority(): Keypair | null {
  const raw = process.env.FAUCET_AUTHORITY_SECRET;
  if (!raw) return null;
  try {
    const parsed = raw.trim().startsWith("[")
      ? (JSON.parse(raw) as number[])
      : Array.from(bs58Decode(raw.trim()));
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

function bs58Decode(s: string): Uint8Array {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of s) {
    const i = A.indexOf(c);
    if (i < 0) throw new Error("not base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

export async function POST(req: NextRequest) {
  const signer = authority();
  if (!signer) {
    return NextResponse.json(
      { error: "The faucet is not configured on this deployment." }, { status: 503 });
  }

  let owner: PublicKey;
  try {
    const body = await req.json();
    owner = new PublicKey(String(body.wallet));
  } catch {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const key = owner.toBase58();
  const previous = lastClaim.get(key);
  if (previous && Date.now() - previous < COOLDOWN_MS) {
    const hours = Math.ceil((COOLDOWN_MS - (Date.now() - previous)) / 3_600_000);
    return NextResponse.json(
      { error: `Already claimed. Try again in about ${hours} hour${hours === 1 ? "" : "s"}.` },
      { status: 429 });
  }

  const conn = new Connection(RPC, "confirmed");
  const minted: { symbol: string; amount: number; mint: string }[] = [];

  try {
    for (const [symbol, mintStr] of Object.entries(replicas.mints as Record<string, string>)) {
      const mint = new PublicKey(mintStr);
      const info = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      const ata = await createAssociatedTokenAccountIdempotent(
        conn, signer, mint, owner, {}, TOKEN_2022_PROGRAM_ID);
      const amount = BigInt(UNDERLYING_UNITS) * 10n ** BigInt(info.decimals);
      await mintTo(conn, signer, mint, ata, signer, amount, [], {}, TOKEN_2022_PROGRAM_ID);
      minted.push({ symbol, amount: UNDERLYING_UNITS, mint: mintStr });
    }

    const usdcMint = new PublicKey(devnetMarkets.premiumMint);
    const usdcInfo = await conn.getAccountInfo(usdcMint);
    if (usdcInfo) {
      const program = usdcInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const mintInfo = await getMint(conn, usdcMint, "confirmed", program);
      if (mintInfo.mintAuthority?.equals(signer.publicKey)) {
        const ata = await createAssociatedTokenAccountIdempotent(
          conn, signer, usdcMint, owner, {}, program);
        const amount = BigInt(USDC_UNITS) * 10n ** BigInt(mintInfo.decimals);
        await mintTo(conn, signer, usdcMint, ata, signer, amount, [], {}, program);
        minted.push({ symbol: "USDC", amount: USDC_UNITS, mint: usdcMint.toBase58() });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The faucet transaction failed." },
      { status: 500 });
  }

  lastClaim.set(key, Date.now());
  return NextResponse.json({ minted });
}
