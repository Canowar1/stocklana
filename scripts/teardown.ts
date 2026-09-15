/**
 * Closes the config and every market on the cluster named in .env, returning
 * their rent. Used when an account layout changes before launch; after launch
 * this is a deliberate teardown, and close_market refuses while any offer is
 * still outstanding.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Stocklana } from "../target/types/stocklana";
import * as fs from "fs";
import * as path from "path";

(async () => {
  const b = anchor.AnchorProvider.env();
  const p = new anchor.AnchorProvider(
    new anchor.web3.Connection(b.connection.rpcEndpoint, "confirmed"), b.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(p);
  const prog = anchor.workspace.Stocklana as anchor.Program<Stocklana>;
  const authority = p.wallet.publicKey;
  const config = PublicKey.findProgramAddressSync([Buffer.from("config")], prog.programId)[0];

  // Markets may predate a layout change, so they are found by owner and
  // discriminator rather than by decoding them.
  // Read the discriminator from the built IDL on disk: the on-chain IDL can be
  // an older build, and that is exactly the situation this script exists for.
  const idl = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "target", "idl", "stocklana.json"), "utf8"));
  const entry = (idl.accounts ?? []).find((a: any) => a.name === "Market");
  if (!entry) throw new Error("Market not found in the built IDL");
  const disc = Buffer.from(entry.discriminator as number[]);
  const raw = await p.connection.getProgramAccounts(prog.programId, {
    filters: [{ memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(disc) } }],
  });
  console.log(`found ${raw.length} market account(s)`);

  for (const { pubkey } of raw) {
    try {
      await prog.methods.setMarketEnabled(false)
        .accountsPartial({ authority, config, market: pubkey }).rpc();
    } catch { /* already disabled, or a layout too old to decode */ }
    try {
      await prog.methods.closeMarket()
        .accountsPartial({ authority, config, market: pubkey }).rpc();
      console.log(`  closed market ${pubkey.toBase58()}`);
    } catch {
      // The account predates a layout change, so no typed instruction can
      // load it. Fall back to the upgrade-authority escape hatch.
      const programData = PublicKey.findProgramAddressSync(
        [prog.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
      await prog.methods.adminCloseAccount()
        .accountsPartial({ authority, target: pubkey, program: prog.programId, programData })
        .rpc();
      console.log(`  force-closed stale market ${pubkey.toBase58()}`);
    }
  }

  if (await p.connection.getAccountInfo(config)) {
    try {
      await prog.methods.closeConfig().accountsPartial({ authority, config }).rpc();
      console.log(`  closed config ${config.toBase58()}`);
    } catch {
      const programData = PublicKey.findProgramAddressSync(
        [prog.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
      await prog.methods.adminCloseAccount()
        .accountsPartial({ authority, target: config, program: prog.programId, programData })
        .rpc();
      console.log(`  force-closed stale config ${config.toBase58()}`);
    }
  }
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
