/**
 * Runs one full lifecycle on devnet with two wallets, so the deployed program
 * and the interface can be checked against real positions rather than an empty
 * database. Writes a call, has a second wallet bid, accepts the bid, waits for
 * expiry and settles.
 *
 *   ./scripts/devnet-smoke.sh
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent, mintTo, getAccount,
} from "@solana/spl-token";
import { Stocklana } from "../target/types/stocklana";
import * as fs from "fs";

const SYMBOL = process.env.SMOKE_SYMBOL ?? "TSLAx";
const SIZE = 10;
const PREMIUM = 40;
const LIFETIME_SECS = Number(process.env.SMOKE_LIFETIME ?? 90);

const cfg = JSON.parse(fs.readFileSync("config/markets.devnet.json", "utf8"));
const market = cfg.markets.find((m: any) => m.symbol === SYMBOL);
if (!market) throw new Error(`no ${SYMBOL} market configured for devnet`);

const pdaOf = (seeds: (Buffer | Uint8Array)[], pid: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, pid)[0];

(async () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(base.connection.rpcEndpoint, "confirmed"), base.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(provider);
  const program = anchor.workspace.Stocklana as anchor.Program<Stocklana>;
  const conn = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // The writer is the deployer. The buyer is a throwaway, disclosed as the
  // seeded counterparty it is.
  const buyerPath = "keys/devnet-demo-buyer.json";
  const buyer = fs.existsSync(buyerPath)
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(buyerPath, "utf8"))))
    : (() => { const k = Keypair.generate();
        fs.writeFileSync(buyerPath, JSON.stringify(Array.from(k.secretKey)), { mode: 0o600 });
        return k; })();

  console.log(`market   ${SYMBOL}`);
  console.log(`writer   ${authority.publicKey.toBase58()}`);
  console.log(`buyer    ${buyer.publicKey.toBase58()}\n`);

  if ((await conn.getBalance(buyer.publicKey)) < 0.05 * LAMPORTS_PER_SOL) {
    const tx = new anchor.web3.Transaction().add(SystemProgram.transfer({
      fromPubkey: authority.publicKey, toPubkey: buyer.publicKey,
      lamports: 0.15 * LAMPORTS_PER_SOL,
    }));
    await anchor.web3.sendAndConfirmTransaction(conn, tx, [authority], { commitment: "confirmed" });
    console.log("  funded the buyer with 0.15 SOL for fees");
  }

  const underlying = new PublicKey(market.underlyingMint);
  const premiumMint = new PublicKey(cfg.premiumMint);

  const writerUnderlying = await createAssociatedTokenAccountIdempotent(
    conn, authority, underlying, authority.publicKey, {}, TOKEN_2022_PROGRAM_ID);
  await mintTo(conn, authority, underlying, writerUnderlying, authority,
    BigInt(SIZE * 4) * 10n ** 8n, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);

  const buyerPremium = await createAssociatedTokenAccountIdempotent(
    conn, authority, premiumMint, buyer.publicKey, {}, TOKEN_PROGRAM_ID);
  await mintTo(conn, authority, premiumMint, buyerPremium, authority,
    BigInt(PREMIUM * 10) * 10n ** 6n, [], { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
  const feeDestination = await createAssociatedTokenAccountIdempotent(
    conn, authority, premiumMint, authority.publicKey, {}, TOKEN_PROGRAM_ID);
  console.log("  minted test balances\n");

  const feedId = Buffer.from(market.feedId, "hex");
  const marketPda = pdaOf([Buffer.from("market"), underlying.toBuffer(), feedId], program.programId);
  const config = pdaOf([Buffer.from("config")], program.programId);

  const slot = await conn.getSlot("confirmed");
  const chainNow = (await conn.getBlockTime(slot))!;
  const expiry = chainNow + LIFETIME_SECS;
  const offerId = new anchor.BN(Math.floor(Math.random() * 2 ** 40));
  const offer = pdaOf(
    [Buffer.from("offer"), marketPda.toBuffer(), authority.publicKey.toBuffer(),
     offerId.toArrayLike(Buffer, "le", 8)], program.programId);
  const vault = pdaOf([Buffer.from("vault"), offer.toBuffer()], program.programId);

  const feed = await conn.getAccountInfo(new PublicKey(market.feedAccount), "confirmed");
  const spot = Number(feed!.data.readBigInt64LE(73)) / 1e8;
  const strike = Math.round(spot * 0.9 * 1e8);
  console.log(`  oracle ${spot.toFixed(2)}, writing a ${(strike / 1e8).toFixed(2)} strike (in the money at expiry)`);

  await program.methods.writeCall(offerId, new anchor.BN(SIZE * 1e8), new anchor.BN(strike),
      new anchor.BN(expiry), new anchor.BN(PREMIUM * 1e6 / 2))
    .accountsPartial({ writer: authority.publicKey, config, market: marketPda,
      underlyingMint: underlying, offer, vault, writerTokenAccount: writerUnderlying,
      tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .rpc();
  console.log(`  wrote offer ${offer.toBase58()}`);

  const bid = pdaOf([Buffer.from("bid"), offer.toBuffer(), buyer.publicKey.toBuffer()], program.programId);
  const bidVault = pdaOf([Buffer.from("bid_vault"), offer.toBuffer(), buyer.publicKey.toBuffer()], program.programId);
  await program.methods.placeBid(new anchor.BN(PREMIUM * 1e6))
    .accountsPartial({ bidder: buyer.publicKey, market: marketPda, offer, premiumMint,
      bid, bidVault, bidderTokenAccount: buyerPremium,
      premiumTokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .signers([buyer]).rpc();
  console.log(`  buyer bid ${PREMIUM} USDC`);

  const writerPremium = await createAssociatedTokenAccountIdempotent(
    conn, authority, premiumMint, authority.publicKey, {}, TOKEN_PROGRAM_ID);
  await program.methods.acceptBid()
    .accountsPartial({ writer: authority.publicKey, config, market: marketPda, offer,
      bid, bidVault, premiumMint, writerPremiumAccount: writerPremium,
      feeDestination, premiumTokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("  writer accepted it, premium settled immediately\n");

  if (process.env.SMOKE_SETTLE === "0") {
    console.log(`  leaving it live; it expires in ${LIFETIME_SECS}s`);
    return;
  }

  process.stdout.write(`  waiting ${LIFETIME_SECS}s for expiry`);
  for (;;) {
    const s = await conn.getSlot("confirmed");
    const t = (await conn.getBlockTime(s))!;
    if (t >= expiry) break;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("\n");

  const buyerAta = PublicKey.findProgramAddressSync(
    [buyer.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), underlying.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID)[0];

  await program.methods.settle()
    .accountsPartial({ cranker: authority.publicKey, market: marketPda, offer,
      underlyingMint: underlying, feedAccount: new PublicKey(market.feedAccount), vault,
      buyer: buyer.publicKey, buyerTokenAccount: buyerAta,
      writer: authority.publicKey, writerTokenAccount: writerUnderlying,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId })
    .rpc();

  const done: any = await program.account.offer.fetch(offer);
  const S = Number(done.settledPrice) / 1e8, K = Number(done.settledStrike) / 1e8;
  console.log(`  settled at $${S.toFixed(2)} against a $${K.toFixed(2)} strike`);
  console.log(`  buyer  ${(Number(done.payoutAmount) / 1e8).toFixed(8)} ${SYMBOL}`);
  console.log(`  writer ${((SIZE * 1e8 - Number(done.payoutAmount)) / 1e8).toFixed(8)} ${SYMBOL} plus the premium`);
  console.log(`  buyer balance ${(Number((await getAccount(conn, buyerAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount) / 1e8).toFixed(8)}`);
})().catch((e) => { console.error(e); process.exit(1); });
