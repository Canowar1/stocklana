/**
 * Registers the config account and every market listed in
 * config/markets.<cluster>.json. Idempotent: an account that already exists is
 * left alone, so this is safe to re-run after adding a market to the config.
 *
 * Driven entirely by .env. See .env.example.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
  getMint, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { Stocklana } from "../target/types/stocklana";

const CLUSTER = process.env.CLUSTER ?? "localnet";
const FEE_BPS = Number(process.env.FEE_BPS ?? 50);
const MIN_DURATION = Number(process.env.MIN_DURATION_SECS ?? 60);

type MarketCfg = {
  symbol: string; label: string; underlyingMint: string;
  feedAccount: string; feedId: string;
  maxStalenessSecs: number; maxConfBps: number; mocks: string;
};

/// The upgrade authority is the only account allowed to create the config, so
/// the address has to be passed and proved.
const programDataAddress = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];

(async () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(base.connection.rpcEndpoint, "confirmed"),
    base.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.Stocklana as anchor.Program<Stocklana>;
  const conn = provider.connection;
  const signer = provider.wallet.publicKey;

  const cfgPath = path.join(__dirname, "..", "config", `markets.${CLUSTER}.json`);
  if (!fs.existsSync(cfgPath)) throw new Error(`no market config at ${cfgPath}`);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const premiumMint = new PublicKey(cfg.premiumMint);

  console.log(`cluster   ${CLUSTER}`);
  console.log(`rpc       ${conn.rpcEndpoint}`);
  console.log(`signer    ${signer.toBase58()}`);
  console.log(`program   ${program.programId.toBase58()}`);
  console.log();

  // Which token program owns the premium mint decides the fee account's shape.
  const premiumInfo = await conn.getAccountInfo(premiumMint);
  if (!premiumInfo) throw new Error(`premium mint ${premiumMint.toBase58()} not found on ${CLUSTER}`);
  const premiumProgram = premiumInfo.owner;

  const feeDestination = await createAssociatedTokenAccountIdempotent(
    conn, (provider.wallet as anchor.Wallet).payer, premiumMint, signer, {}, premiumProgram);
  console.log(`fee dest  ${feeDestination.toBase58()}`);

  const config = PublicKey.findProgramAddressSync(
    [Buffer.from("config")], program.programId)[0];

  if (await conn.getAccountInfo(config)) {
    const c = await program.account.config.fetch(config);
    console.log(`config    exists, fee ${c.feeBps} bps, min duration ${c.minDuration}s`);
  } else {
    await program.methods.initConfig(FEE_BPS, new BN(MIN_DURATION))
      .accountsPartial({ authority: signer, config, feeDestination,
        program: program.programId, programData: programDataAddress(program.programId),
        systemProgram: SystemProgram.programId })
      .rpc();
    console.log(`config    created, fee ${FEE_BPS} bps, min duration ${MIN_DURATION}s`);
  }
  console.log();

  for (const m of cfg.markets as MarketCfg[]) {
    const feedId = Buffer.from(m.feedId, "hex");
    if (feedId.length !== 32) { console.log(`  ${m.symbol.padEnd(8)} SKIP, feed id is not 32 bytes`); continue; }
    const underlying = new PublicKey(m.underlyingMint);
    const market = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), underlying.toBuffer(), feedId], program.programId)[0];

    if (await conn.getAccountInfo(market)) {
      console.log(`  ${m.symbol.padEnd(8)} already registered  ${market.toBase58()}`);
      continue;
    }
    const mintInfo = await conn.getAccountInfo(underlying);
    if (!mintInfo) { console.log(`  ${m.symbol.padEnd(8)} SKIP, mint not on ${CLUSTER}`); continue; }
    const feedInfo = await conn.getAccountInfo(new PublicKey(m.feedAccount));
    if (!feedInfo) { console.log(`  ${m.symbol.padEnd(8)} SKIP, feed account not on ${CLUSTER}`); continue; }

    try {
      await program.methods.addMarket([...feedId], m.maxStalenessSecs, m.maxConfBps ?? 100)
        .accountsPartial({ authority: signer, config, market,
          underlyingMint: underlying, premiumMint,
          feedAccount: new PublicKey(m.feedAccount),
          systemProgram: SystemProgram.programId })
        .rpc();
      const decimals = (await getMint(conn, underlying, "confirmed", mintInfo.owner)).decimals;
      console.log(`  ${m.symbol.padEnd(8)} registered  ${market.toBase58()}  ${decimals}dp  ` +
        `staleness ${m.maxStalenessSecs}s  conf<=${m.maxConfBps ?? 100}bps  mocks: ${m.mocks}`);
    } catch (e: any) {
      console.log(`  ${m.symbol.padEnd(8)} FAILED  ${e.message ?? e}`);
    }
  }
  console.log("\ndone");
})().catch((e) => { console.error(e); process.exit(1); });
