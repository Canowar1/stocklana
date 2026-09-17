/**
 * The two settlement paths that only ever ran in isolation.
 *
 * The confidence gate and the corporate-action adjustment both had unit tests
 * for their arithmetic and neither had ever executed against a real mint on a
 * real chain. These run against a Token-2022 mint created here with the same
 * extension set the xStocks mints carry, so the test controls every authority
 * and can actually pause it and move its multiplier.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType, AccountState, getMintLen,
  createInitializeMintInstruction, createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializePausableConfigInstruction,
  createInitializeTransferHookInstruction,
  createUpdateMultiplierDataInstruction, createPauseInstruction, createResumeInstruction,
  createAssociatedTokenAccountIdempotent, mintTo,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, TokenMetadata } from "@solana/spl-token-metadata";
import { Stocklana } from "../target/types/stocklana";
import { assert } from "chai";

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TSLAX_FEED = new PublicKey("GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY");
const FEED_ID = Buffer.from(
  "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362", "hex");
const WIDE_WINDOW = 90 * 24 * 3600;

const E8 = (n: number) => new BN(Math.round(n * 1e8));
const E6 = (n: number) => new BN(Math.round(n * 1e6));

describe("token-2022 settlement paths", () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(base.connection.rpcEndpoint, "confirmed"), base.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(provider);
  const program = anchor.workspace.Stocklana as Program<Stocklana>;
  const conn = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const writer = Keypair.generate();
  const buyer = Keypair.generate();
  const RUN = Math.floor(Math.random() * 1e6);

  let config: PublicKey, feeDest: PublicKey, oraclePrice: number;

  const chainTime = async () =>
    (await conn.getBlockTime(await conn.getSlot("confirmed")))!;
  const waitUntil = async (ts: number) => {
    for (;;) { if ((await chainTime()) >= ts) return; await new Promise((r) => setTimeout(r, 500)); }
  };

  /** A replica of an xStocks mint whose every authority is the test payer. */
  async function makeMint(multiplier: number): Promise<PublicKey> {
    const mint = Keypair.generate();
    const authority = payer.publicKey;
    const metadata: TokenMetadata = {
      mint: mint.publicKey, name: "Extension Test xStock", symbol: "EXTx",
      uri: "https://example.invalid/metadata.json", additionalMetadata: [],
      updateAuthority: authority,
    };
    const extensions = [
      ExtensionType.MetadataPointer, ExtensionType.PermanentDelegate,
      ExtensionType.DefaultAccountState, ExtensionType.ScaledUiAmountConfig,
      ExtensionType.PausableConfig, ExtensionType.TransferHook,
    ];
    const mintLen = getMintLen(extensions);
    const lamports = await conn.getMinimumBalanceForRentExemption(
      mintLen + pack(metadata).length + 4 + 64);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority, newAccountPubkey: mint.publicKey,
        space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeMetadataPointerInstruction(
        mint.publicKey, authority, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializePermanentDelegateInstruction(mint.publicKey, authority, TOKEN_2022_PROGRAM_ID),
      createInitializeDefaultAccountStateInstruction(
        mint.publicKey, AccountState.Initialized, TOKEN_2022_PROGRAM_ID),
      createInitializeScaledUiAmountConfigInstruction(
        mint.publicKey, authority, multiplier, TOKEN_2022_PROGRAM_ID),
      createInitializePausableConfigInstruction(mint.publicKey, authority, TOKEN_2022_PROGRAM_ID),
      createInitializeTransferHookInstruction(
        mint.publicKey, authority, PublicKey.default, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, 8, authority, authority, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID, mint: mint.publicKey, metadata: mint.publicKey,
        name: metadata.name, symbol: metadata.symbol, uri: metadata.uri,
        mintAuthority: authority, updateAuthority: authority }),
    );
    await sendAndConfirmTransaction(conn, tx, [payer, mint], { commitment: "confirmed" });
    return mint.publicKey;
  }

  const marketPda = (mint: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer(), FEED_ID], program.programId)[0];
  const offerPda = (market: PublicKey, id: BN) => PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), market.toBuffer(), writer.publicKey.toBuffer(),
     id.toArrayLike(Buffer, "le", 8)], program.programId)[0];
  const vaultPda = (offer: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), offer.toBuffer()], program.programId)[0];
  const bidPda = (offer: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("bid"), offer.toBuffer(), buyer.publicKey.toBuffer()], program.programId)[0];
  const bidVaultPda = (offer: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("bid_vault"), offer.toBuffer(), buyer.publicKey.toBuffer()], program.programId)[0];

  /** Writes a call, takes a bid, and returns the accounts needed to settle. */
  async function openPosition(mint: PublicKey, market: PublicKey, id: number, strike: number, lifetime: number) {
    const offerId = new BN(RUN * 100 + id);
    const offer = offerPda(market, offerId);
    const vault = vaultPda(offer);
    const writerAta = await createAssociatedTokenAccountIdempotent(
      conn, payer, mint, writer.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    await mintTo(conn, payer, mint, writerAta, payer, 50e8, [], {}, TOKEN_2022_PROGRAM_ID);

    const expiry = (await chainTime()) + lifetime;
    await program.methods.writeCall(offerId, E8(10), E8(strike), new BN(expiry), E6(1))
      .accountsPartial({ writer: writer.publicKey, config, market, underlyingMint: mint,
        offer, vault, writerTokenAccount: writerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([writer]).rpc();

    const buyerUsdc = await createAssociatedTokenAccountIdempotent(
      conn, payer, USDC, buyer.publicKey, {}, TOKEN_PROGRAM_ID);
    await mintTo(conn, payer, USDC, buyerUsdc, payer, 100e6, [], {}, TOKEN_PROGRAM_ID);
    await program.methods.placeBid(E6(5))
      .accountsPartial({ bidder: buyer.publicKey, market, offer, premiumMint: USDC,
        bid: bidPda(offer), bidVault: bidVaultPda(offer), bidderTokenAccount: buyerUsdc,
        premiumTokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([buyer]).rpc();

    const writerUsdc = await createAssociatedTokenAccountIdempotent(
      conn, payer, USDC, writer.publicKey, {}, TOKEN_PROGRAM_ID);
    await program.methods.acceptBid()
      .accountsPartial({ writer: writer.publicKey, config, market, offer,
        bid: bidPda(offer), bidVault: bidVaultPda(offer), premiumMint: USDC,
        writerPremiumAccount: writerUsdc, feeDestination: feeDest,
        premiumTokenProgram: TOKEN_PROGRAM_ID })
      .signers([writer]).rpc();

    return { offer, vault, writerAta, expiry };
  }

  function settleIx(mint: PublicKey, market: PublicKey, offer: PublicKey, vault: PublicKey, writerAta: PublicKey) {
    const buyerAta = PublicKey.findProgramAddressSync(
      [buyer.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID)[0];
    return program.methods.settle().accountsPartial({
      cranker: payer.publicKey, market, offer, underlyingMint: mint, feedAccount: TSLAX_FEED,
      vault, buyer: buyer.publicKey, buyerTokenAccount: buyerAta,
      writer: writer.publicKey, writerTokenAccount: writerAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId });
  }

  before(async () => {
    for (const k of [writer, buyer]) {
      await conn.confirmTransaction(
        await conn.requestAirdrop(k.publicKey, 3 * LAMPORTS_PER_SOL), "confirmed");
    }
    feeDest = await createAssociatedTokenAccountIdempotent(
      conn, payer, USDC, payer.publicKey, {}, TOKEN_PROGRAM_ID);
    config = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];

    if (!(await conn.getAccountInfo(config))) {
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
      await program.methods.initConfig(50, new BN(1))
        .accountsPartial({ authority: payer.publicKey, config, feeDestination: feeDest,
          program: program.programId, programData, systemProgram: SystemProgram.programId })
        .rpc();
    }
    const raw = await conn.getAccountInfo(TSLAX_FEED);
    oraclePrice = Number(raw!.data.readBigInt64LE(73)) / 1e8;
  });

  it("refuses to settle while the mint is paused, then settles once it resumes", async () => {
    const mint = await makeMint(1);
    const market = marketPda(mint);
    await program.methods.addMarket([...FEED_ID], WIDE_WINDOW, 100)
      .accountsPartial({ authority: payer.publicKey, config, market, underlyingMint: mint,
        premiumMint: USDC, feedAccount: TSLAX_FEED, systemProgram: SystemProgram.programId })
      .rpc();

    const p = await openPosition(mint, market, 1, oraclePrice * 0.9, 4);
    await waitUntil(p.expiry);

    await sendAndConfirmTransaction(conn,
      new Transaction().add(createPauseInstruction(mint, payer.publicKey, [], TOKEN_2022_PROGRAM_ID)),
      [payer], { commitment: "confirmed" });

    try {
      await settleIx(mint, market, p.offer, p.vault, p.writerAta).rpc();
      assert.fail("a paused mint must not settle");
    } catch (e: any) {
      assert.include(e.toString(), "MintPaused");
    }

    // The refusal leaves everything exactly where it was, and is retryable.
    const still = await program.account.offer.fetch(p.offer);
    assert.deepEqual(still.state, { filled: {} });
    assert.equal(
      Number((await conn.getTokenAccountBalance(p.vault, "confirmed")).value.amount), 10e8);

    await sendAndConfirmTransaction(conn,
      new Transaction().add(createResumeInstruction(mint, payer.publicKey, [], TOKEN_2022_PROGRAM_ID)),
      [payer], { commitment: "confirmed" });

    await settleIx(mint, market, p.offer, p.vault, p.writerAta).rpc();
    const done = await program.account.offer.fetch(p.offer);
    assert.deepEqual(done.state, { settled: {} });
    console.log(`      paused settle refused, resumed settle paid ${Number(done.payoutAmount) / 1e8}`);
  });

  it("adjusts the strike when the multiplier moves between writing and settlement", async () => {
    const mint = await makeMint(1);
    const market = marketPda(mint);
    await program.methods.addMarket([...FEED_ID], WIDE_WINDOW, 100)
      .accountsPartial({ authority: payer.publicKey, config, market, underlyingMint: mint,
        premiumMint: USDC, feedAccount: TSLAX_FEED, systemProgram: SystemProgram.programId })
      .rpc();

    const writtenStrike = oraclePrice * 1.2;
    const p = await openPosition(mint, market, 2, writtenStrike, 4);

    // A two-for-one split: the multiplier doubles, so one raw token comes to
    // represent two shares and the strike has to halve with it.
    await sendAndConfirmTransaction(conn,
      new Transaction().add(createUpdateMultiplierDataInstruction(
        mint, payer.publicKey, 2, BigInt(0), [], TOKEN_2022_PROGRAM_ID)),
      [payer], { commitment: "confirmed" });

    await waitUntil(p.expiry);
    await settleIx(mint, market, p.offer, p.vault, p.writerAta).rpc();

    const done = await program.account.offer.fetch(p.offer);
    const written = Number(done.strikeUsd), settled = Number(done.settledStrike);
    assert.approximately(settled, written / 2, 2, "the strike should halve with the multiplier");

    // Written out of the money at 1.2x spot; after halving it is in the money,
    // and the payout proves the adjustment reached the split and not just the
    // stored field.
    assert.isAbove(Number(done.payoutAmount), 0);
    const expected = Math.floor((10e8 * (Number(done.settledPrice) - settled)) / Number(done.settledPrice));
    assert.equal(Number(done.payoutAmount), expected);
    console.log(`      strike ${(written / 1e8).toFixed(2)} became ${(settled / 1e8).toFixed(2)} after a 2:1 split`);
  });

  it("refuses to settle when the confidence band is wider than the market allows", async () => {
    const mint = await makeMint(1);
    const market = marketPda(mint);
    // The real feed publishes a band of roughly 2 bps. A one-basis-point
    // ceiling is therefore genuinely exceeded by genuine data, rather than by
    // a number invented for the test.
    await program.methods.addMarket([...FEED_ID], WIDE_WINDOW, 1)
      .accountsPartial({ authority: payer.publicKey, config, market, underlyingMint: mint,
        premiumMint: USDC, feedAccount: TSLAX_FEED, systemProgram: SystemProgram.programId })
      .rpc();

    const p = await openPosition(mint, market, 3, oraclePrice * 0.9, 4);
    await waitUntil(p.expiry);

    const raw = await conn.getAccountInfo(TSLAX_FEED);
    const price = raw!.data.readBigInt64LE(73), conf = raw!.data.readBigUInt64LE(81);
    const bps = Number((conf * 10_000n) / price);

    try {
      await settleIx(mint, market, p.offer, p.vault, p.writerAta).rpc();
      assert.fail(`a ${bps} bps band must not settle under a 1 bps ceiling`);
    } catch (e: any) {
      assert.include(e.toString(), "OracleConfidenceTooWide");
    }
    console.log(`      refused a ${bps} bps band against a 1 bps ceiling`);
  });

  it("keeps a settled receipt readable until the archive window passes", async () => {
    const mint = await makeMint(1);
    const market = marketPda(mint);
    await program.methods.addMarket([...FEED_ID], WIDE_WINDOW, 100)
      .accountsPartial({ authority: payer.publicKey, config, market, underlyingMint: mint,
        premiumMint: USDC, feedAccount: TSLAX_FEED, systemProgram: SystemProgram.programId })
      .rpc();

    const p = await openPosition(mint, market, 4, oraclePrice * 0.9, 4);
    await waitUntil(p.expiry);
    await settleIx(mint, market, p.offer, p.vault, p.writerAta).rpc();

    // The receipt survives settlement. Closing it immediately would let a
    // writer erase the record a counterparty is still reading.
    const receipt = await program.account.offer.fetch(p.offer);
    assert.deepEqual(receipt.state, { settled: {} });

    try {
      await program.methods.closeOffer()
        .accountsPartial({ writer: writer.publicKey, offer: p.offer })
        .signers([writer]).rpc();
      assert.fail("closing inside the archive window should be refused");
    } catch (e: any) {
      assert.include(e.toString(), "ArchiveWindowOpen");
    }
    assert.isNotNull(await conn.getAccountInfo(p.offer), "the receipt must still be there");

    // And only its writer may ever close it.
    try {
      await program.methods.closeOffer()
        .accountsPartial({ writer: buyer.publicKey, offer: p.offer })
        .signers([buyer]).rpc();
      assert.fail("only the writer may close the receipt");
    } catch (e: any) {
      assert.match(e.toString(), /Unauthorized|ConstraintHasOne/);
    }
    console.log("      receipt held, close refused inside the window and refused to the buyer");
  });

  it("lets the authority repoint the fee destination and change the fee", async () => {
    const replacement = Keypair.generate();
    const newFeeDest = await createAssociatedTokenAccountIdempotent(
      conn, payer, USDC, replacement.publicKey, {}, TOKEN_PROGRAM_ID);

    await program.methods.updateConfig(25, new BN(2), null)
      .accountsPartial({ authority: payer.publicKey, config, feeDestination: newFeeDest })
      .rpc();

    let c = await program.account.config.fetch(config);
    assert.equal(c.feeBps, 25);
    assert.equal(c.minDuration.toNumber(), 2);
    assert.equal(c.feeDestination.toBase58(), newFeeDest.toBase58());

    // Omitted fields are left alone rather than reset.
    await program.methods.updateConfig(50, null, null)
      .accountsPartial({ authority: payer.publicKey, config, feeDestination: null })
      .rpc();
    c = await program.account.config.fetch(config);
    assert.equal(c.feeBps, 50);
    assert.equal(c.feeDestination.toBase58(), newFeeDest.toBase58());
    assert.equal(c.minDuration.toNumber(), 2);

    // And nobody else can do any of it.
    try {
      await program.methods.updateConfig(0, null, null)
        .accountsPartial({ authority: writer.publicKey, config, feeDestination: null })
        .signers([writer]).rpc();
      assert.fail("only the authority may update the config");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }

    await program.methods.updateConfig(null, new BN(1), null)
      .accountsPartial({ authority: payer.publicKey, config, feeDestination: feeDest })
      .rpc();
  });
});
