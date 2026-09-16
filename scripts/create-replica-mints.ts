/**
 * Creates devnet stand-ins for the xStocks mints.
 *
 * The real tokens are not deployed on devnet, so a demo there has to mint its
 * own. Rather than a plain SPL token, each replica carries the *exact*
 * Token-2022 extension set the real mint carries, verified against mainnet:
 * a permanent delegate, a pausable config, a scaled UI amount config, a default
 * account state, a null-program transfer hook, a metadata pointer and inline
 * metadata, at 8 decimals.
 *
 * That matters because those extensions are what make this asset awkward. A
 * replica without them would prove the program works on an easy token and say
 * nothing about the hard one.
 *
 *   ./scripts/replica-mints.sh
 */
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, ExtensionType, AccountState,
  getMintLen, createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializePausableConfigInstruction,
  createInitializeTransferHookInstruction,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, TokenMetadata } from "@solana/spl-token-metadata";
import * as fs from "fs";
import * as path from "path";

const DECIMALS = 8;

type Spec = { symbol: string; name: string; uri: string; multiplier: number };

const SPECS: Spec[] = [
  { symbol: "TSLAx", name: "Tesla xStock (devnet replica)",
    uri: "https://xstocks-metadata.backed.fi/tokens/Solana/TSLAx/metadata.json", multiplier: 1 },
  // NVDAx carries a multiplier that is not 1 on mainnet, so the replica does
  // too. It is the only way to exercise the corporate-action path end to end.
  { symbol: "NVDAx", name: "NVIDIA xStock (devnet replica)",
    uri: "https://xstocks-metadata.backed.fi/tokens/Solana/NVDAx/metadata.json",
    multiplier: 1.001701196801074 },
];

function loadKeypair(p: string) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

async function createMint(conn: Connection, payer: Keypair, spec: Spec): Promise<PublicKey> {
  const mint = Keypair.generate();
  const authority = payer.publicKey;

  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    name: spec.name,
    symbol: spec.symbol,
    uri: spec.uri,
    additionalMetadata: [],
    updateAuthority: authority,
  };

  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
    ExtensionType.DefaultAccountState,
    ExtensionType.ScaledUiAmountConfig,
    ExtensionType.PausableConfig,
    ExtensionType.TransferHook,
  ];
  const mintLen = getMintLen(extensions);
  const metadataLen = pack(metadata).length + 4 + 64;
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metadataLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority, newAccountPubkey: mint.publicKey,
      space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey, authority, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializePermanentDelegateInstruction(
      mint.publicKey, authority, TOKEN_2022_PROGRAM_ID),
    createInitializeDefaultAccountStateInstruction(
      mint.publicKey, AccountState.Initialized, TOKEN_2022_PROGRAM_ID),
    createInitializeScaledUiAmountConfigInstruction(
      mint.publicKey, authority, spec.multiplier, TOKEN_2022_PROGRAM_ID),
    createInitializePausableConfigInstruction(
      mint.publicKey, authority, TOKEN_2022_PROGRAM_ID),
    // The real mints declare the hook extension and set no program, so
    // transfers are ordinary today and the authority could add one later.
    // The default public key is how "no program" is encoded on-chain.
    createInitializeTransferHookInstruction(
      mint.publicKey, authority, PublicKey.default, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(
      mint.publicKey, DECIMALS, authority, authority, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, mint: mint.publicKey, metadata: mint.publicKey,
      name: metadata.name, symbol: metadata.symbol, uri: metadata.uri,
      mintAuthority: authority, updateAuthority: authority,
    }),
  );

  await sendAndConfirmTransaction(conn, tx, [payer, mint], { commitment: "confirmed" });
  return mint.publicKey;
}

(async () => {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const payer = loadKeypair(process.env.ANCHOR_WALLET ?? "keys/devnet-deployer.json");
  const conn = new Connection(rpc, "confirmed");
  const outPath = path.join(__dirname, "..", "config", "replica-mints.json");

  const existing: Record<string, string> = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, "utf8")).mints ?? {}
    : {};

  console.log(`rpc      ${rpc}`);
  console.log(`payer    ${payer.publicKey.toBase58()}\n`);

  for (const spec of SPECS) {
    if (existing[spec.symbol] && (await conn.getAccountInfo(new PublicKey(existing[spec.symbol])))) {
      console.log(`  ${spec.symbol.padEnd(8)} already exists  ${existing[spec.symbol]}`);
      continue;
    }
    const mint = await createMint(conn, payer, spec);
    existing[spec.symbol] = mint.toBase58();
    console.log(`  ${spec.symbol.padEnd(8)} created  ${mint.toBase58()}  multiplier ${spec.multiplier}`);
  }

  fs.writeFileSync(outPath, JSON.stringify({
    _note: "Devnet stand-ins for the xStocks mints, carrying the same Token-2022 extension set as the real ones. Created by scripts/create-replica-mints.ts. These are mocks and are labelled as such wherever they appear.",
    mints: existing,
  }, null, 1));
  console.log(`\nwrote ${path.relative(process.cwd(), outPath)}`);
})().catch((e) => { console.error(e); process.exit(1); });
