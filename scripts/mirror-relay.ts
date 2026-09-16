/**
 * Copies real Pyth observations from mainnet into the devnet mirror.
 *
 * Nothing here invents a price. Each push carries the source feed id, the
 * source publish time and the source confidence band unchanged, so a mirrored
 * market behaves under the staleness and confidence guards exactly as the real
 * one would. A mirror of a stale price stays stale.
 *
 *   npx ts-node -P tsconfig.json scripts/mirror-relay.ts          # one pass
 *   npx ts-node -P tsconfig.json scripts/mirror-relay.ts --watch  # keep going
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { StocklanaMirror } from "../target/types/stocklana_mirror";
import * as fs from "fs";
import * as path from "path";

const MAINNET = process.env.MIRROR_SOURCE_RPC ?? "https://api.mainnet-beta.solana.com";
const INTERVAL_MS = Number(process.env.MIRROR_INTERVAL_MS ?? 60_000);
const WATCH = process.argv.includes("--watch");

const OFF = { feedId: 41, price: 73, conf: 81, expo: 89, publish: 93, prevPublish: 101, ema: 109, emaConf: 117 };

type Source = { symbol: string; account: string; feedId: string };

function sources(): Source[] {
  const cfgPath = path.join(__dirname, "..", "config", "mirror-sources.json");
  return JSON.parse(fs.readFileSync(cfgPath, "utf8")).sources as Source[];
}

function decode(data: Buffer) {
  return {
    feedId: Buffer.from(data.subarray(OFF.feedId, OFF.feedId + 32)),
    price: data.readBigInt64LE(OFF.price),
    conf: data.readBigUInt64LE(OFF.conf),
    exponent: data.readInt32LE(OFF.expo),
    publishTime: data.readBigInt64LE(OFF.publish),
    prevPublishTime: data.readBigInt64LE(OFF.prevPublish),
    emaPrice: data.readBigInt64LE(OFF.ema),
    emaConf: data.readBigUInt64LE(OFF.emaConf),
  };
}

async function pass(
  program: anchor.Program<StocklanaMirror>,
  authority: PublicKey,
  mainnet: Connection,
) {
  const list = sources();
  const infos = await mainnet.getMultipleAccountsInfo(
    list.map((s) => new PublicKey(s.account)), "confirmed");

  for (let i = 0; i < list.length; i++) {
    const src = list[i];
    const info = infos[i];
    if (!info) { console.log(`  ${src.symbol.padEnd(8)} source account not found`); continue; }

    const m = decode(Buffer.from(info.data));
    const feedId = [...Buffer.from(src.feedId, "hex")];
    if (!m.feedId.equals(Buffer.from(src.feedId, "hex"))) {
      console.log(`  ${src.symbol.padEnd(8)} source feed id does not match config, skipped`);
      continue;
    }

    const feed = PublicKey.findProgramAddressSync(
      [Buffer.from("feed"), Buffer.from(src.feedId, "hex")], program.programId)[0];
    const priceAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("price"), Buffer.from(src.feedId, "hex")], program.programId)[0];

    if (!(await program.provider.connection.getAccountInfo(feed))) {
      await program.methods.initFeed(feedId)
        .accountsPartial({ authority, feed, priceAccount, systemProgram: SystemProgram.programId })
        .rpc();
      console.log(`  ${src.symbol.padEnd(8)} created mirror ${priceAccount.toBase58()}`);
    }

    const age = Math.floor(Date.now() / 1000) - Number(m.publishTime);
    try {
      await program.methods.pushPrice(
        feedId, new anchor.BN(m.price.toString()), new anchor.BN(m.conf.toString()),
        m.exponent, new anchor.BN(m.publishTime.toString()),
        new anchor.BN(m.prevPublishTime.toString()),
        new anchor.BN(m.emaPrice.toString()), new anchor.BN(m.emaConf.toString()),
      ).accountsPartial({ authority, feed, priceAccount }).rpc();
      const px = Number(m.price) * 10 ** m.exponent;
      console.log(`  ${src.symbol.padEnd(8)} $${px.toFixed(2)}  ±${Number((m.conf * 10000n) / (m.price > 0n ? m.price : 1n))} bps  source print ${age}s old`);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      if (msg.includes("PublishTimeWentBackwards")) {
        console.log(`  ${src.symbol.padEnd(8)} unchanged since last pass`);
      } else {
        console.log(`  ${src.symbol.padEnd(8)} push failed: ${msg.split("\n")[0]}`);
      }
    }
  }
}

(async () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(base.connection.rpcEndpoint, "confirmed"), base.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(provider);
  const program = anchor.workspace.StocklanaMirror as anchor.Program<StocklanaMirror>;
  const mainnet = new Connection(MAINNET, "confirmed");

  console.log(`mirror   ${program.programId.toBase58()}`);
  console.log(`target   ${provider.connection.rpcEndpoint}`);
  console.log(`source   ${MAINNET}\n`);

  do {
    console.log(new Date().toISOString());
    await pass(program, provider.wallet.publicKey, mainnet);
    if (WATCH) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  } while (WATCH);
})().catch((e) => { console.error(e); process.exit(1); });
