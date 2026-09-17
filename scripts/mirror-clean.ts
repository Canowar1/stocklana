import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
(async () => {
  const b = anchor.AnchorProvider.env();
  const p = new anchor.AnchorProvider(
    new anchor.web3.Connection(b.connection.rpcEndpoint, "confirmed"), b.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(p);
  const prog = anchor.workspace.StocklanaMirror as anchor.Program<any>;
  const authority = p.wallet.publicKey;
  const programData = PublicKey.findProgramAddressSync(
    [prog.programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];

  const accts = await p.connection.getProgramAccounts(prog.programId);
  for (const a of accts) {
    // Leave the IDL account alone; it belongs to Anchor, not to the mirror.
    if (a.account.data.length > 500) { console.log("  skipping idl", a.pubkey.toBase58()); continue; }
    await prog.methods.adminClose()
      .accountsPartial({ authority, target: a.pubkey, program: prog.programId, programData })
      .rpc();
    console.log(`  closed ${a.pubkey.toBase58()} (${a.account.data.length} bytes)`);
  }
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
