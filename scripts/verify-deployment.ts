/**
 * Reads back what is actually deployed on the cluster named in .env: the
 * config account, every registered market, and the live price in each
 * market's oracle account beside the staleness the program will enforce.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Stocklana } from "../target/types/stocklana";
(async () => {
  const b = anchor.AnchorProvider.env();
  const p = new anchor.AnchorProvider(
    new anchor.web3.Connection(b.connection.rpcEndpoint, "confirmed"), b.wallet,
    { commitment: "confirmed" });
  anchor.setProvider(p);
  const prog = anchor.workspace.Stocklana as anchor.Program<Stocklana>;
  const cfg = PublicKey.findProgramAddressSync([Buffer.from("config")], prog.programId)[0];
  const c: any = await prog.account.config.fetch(cfg);
  console.log(`config   ${cfg.toBase58()}`);
  console.log(`         authority ${c.authority.toBase58()}  fee ${c.feeBps} bps  minDuration ${c.minDuration}s`);
  for (const m of await prog.account.market.all()) {
    const d: any = m.account;
    console.log(`market   ${m.publicKey.toBase58()}`);
    console.log(`         underlying ${d.underlyingMint.toBase58()}`);
    console.log(`         feed ${d.feedAccount.toBase58()}  maxStaleness ${d.maxStalenessSecs}s  enabled ${d.enabled}`);
    const ai = await p.connection.getAccountInfo(d.feedAccount);
    const px = Number(ai!.data.readBigInt64LE(73)) / 1e8;
    const t = Number(ai!.data.readBigInt64LE(93));
    console.log(`         live oracle $${px.toFixed(2)}  age ${Math.round(Date.now() / 1000 - t)}s  (guard allows ${d.maxStalenessSecs}s)`);
  }
})();
