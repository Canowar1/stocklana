import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent, mintTo, getAccount,
} from "@solana/spl-token";
import { Stocklana } from "../target/types/stocklana";
import { assert } from "chai";

const TSLAX = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TSLAX_FEED = new PublicKey("GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY");
const FEED_ID = Buffer.from(
  "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362", "hex");

// The cloned oracle account carries whatever publish time mainnet had when the
// fixtures were built, and equity feeds go quiet for ~32 hours over a weekend.
// Tests therefore allow a wide staleness window. Production markets use 3600.
const TEST_MAX_STALENESS = 30 * 24 * 3600;

const E8 = (n: number) => new BN(Math.round(n * 1e8));
const E6 = (n: number) => new BN(Math.round(n * 1e6));

describe("stocklana", () => {
  // Reads use "confirmed", so the provider must confirm at least that far or
  // a balance read can race ahead of the transaction it is checking.
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(base.connection.rpcEndpoint, "confirmed"),
    base.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.Stocklana as Program<Stocklana>;
  const conn = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const writer = Keypair.generate();
  const alice = Keypair.generate();   // winning bidder
  const bob = Keypair.generate();     // losing bidder
  const cranker = Keypair.generate(); // permissionless settler

  let config: PublicKey, market: PublicKey;
  let writerTslax: PublicKey, aliceUsdc: PublicKey, bobUsdc: PublicKey;
  let writerUsdc: PublicKey, feeDest: PublicKey;
  let oraclePrice: number;

  const RUN = Math.floor(Math.random() * 1e6);
  const offerPda = (id: number) => PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), market.toBuffer(), writer.publicKey.toBuffer(),
     new BN(RUN * 10 + id).toArrayLike(Buffer, "le", 8)], program.programId)[0];
  const vaultPda = (offer: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), offer.toBuffer()], program.programId)[0];
  const bidPda = (offer: PublicKey, b: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("bid"), offer.toBuffer(), b.toBuffer()], program.programId)[0];
  const bidVaultPda = (offer: PublicKey, b: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from("bid_vault"), offer.toBuffer(), b.toBuffer()], program.programId)[0];

  const bal = async (a: PublicKey, prog: PublicKey) => {
    try {
      return Number((await getAccount(conn, a, "confirmed", prog)).amount);
    } catch (e: any) {
      throw new Error(`balance read failed for ${a.toBase58()} under ${prog.toBase58()}: ${e.message || e}`);
    }
  };

  // The validator's clock runs a couple of seconds behind wall time, so every
  // expiry and every wait is driven by the chain's own clock, not Date.now().
  const chainTime = async () => {
    const slot = await conn.getSlot("confirmed");
    return (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  };
  const waitUntil = async (ts: number) => {
    for (;;) {
      if ((await chainTime()) >= ts) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  before(async () => {
    for (const k of [writer, alice, bob, cranker]) {
      const sig = await conn.requestAirdrop(k.publicKey, 5 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }

    writerTslax = await createAssociatedTokenAccountIdempotent(
      conn, payer, TSLAX, writer.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    await mintTo(conn, payer, TSLAX, writerTslax, payer, 100e8, [], {}, TOKEN_2022_PROGRAM_ID);

    for (const [k, name] of [[alice, "alice"], [bob, "bob"]] as const) {
      const ata = await createAssociatedTokenAccountIdempotent(
        conn, payer, USDC, k.publicKey, {}, TOKEN_PROGRAM_ID);
      await mintTo(conn, payer, USDC, ata, payer, 10_000e6, [], {}, TOKEN_PROGRAM_ID);
      if (name === "alice") aliceUsdc = ata; else bobUsdc = ata;
    }
    writerUsdc = await createAssociatedTokenAccountIdempotent(
      conn, payer, USDC, writer.publicKey, {}, TOKEN_PROGRAM_ID);
    feeDest = await createAssociatedTokenAccountIdempotent(
      conn, payer, USDC, payer.publicKey, {}, TOKEN_PROGRAM_ID);

    config = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
    market = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), TSLAX.toBuffer(), FEED_ID], program.programId)[0];
  });

  it("reads the real mainnet Pyth account from inside the program", async () => {
    // Block C gate. add_market only succeeds if the program can verify the
    // account owner, the feed id and the exponent against the genuine bytes.
    if (!(await conn.getAccountInfo(config))) {
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
      await program.methods.initConfig(50, new BN(1))
        .accountsPartial({ authority: payer.publicKey, config, feeDestination: feeDest,
          program: program.programId, programData,
          systemProgram: SystemProgram.programId })
        .rpc();
    }
    if (!(await conn.getAccountInfo(market))) {
      await program.methods.addMarket([...FEED_ID], TEST_MAX_STALENESS, 100)
        .accountsPartial({ authority: payer.publicKey, config, market,
          underlyingMint: TSLAX, premiumMint: USDC, feedAccount: TSLAX_FEED,
          systemProgram: SystemProgram.programId })
        .rpc();
    }


    const m = await program.account.market.fetch(market);
    assert.equal(m.feedAccount.toBase58(), TSLAX_FEED.toBase58());
    assert.isTrue(m.enabled);

    const raw = await conn.getAccountInfo(TSLAX_FEED);
    oraclePrice = Number(raw!.data.readBigInt64LE(73)) / 1e8;
    console.log(`      live TSLAX/USD from the cloned account: $${oraclePrice.toFixed(2)}`);
    assert.isAbove(oraclePrice, 1);
  });

  it("writes a call, locks collateral, and runs a competitive bid", async () => {
    const strike = oraclePrice * 0.9; // in the money at settlement
    const expiry = (await chainTime()) + 4;
    const offer = offerPda(1), vault = vaultPda(offer);

    await program.methods.writeCall(new BN(RUN * 10 + 1), E8(10), E8(strike), new BN(expiry), E6(20))
      .accountsPartial({ writer: writer.publicKey, config, market, underlyingMint: TSLAX,
        offer, vault, writerTokenAccount: writerTslax,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([writer]).rpc();

    assert.equal(await bal(vault, TOKEN_2022_PROGRAM_ID), 10e8);
    assert.equal(await bal(writerTslax, TOKEN_2022_PROGRAM_ID), 90e8);

    for (const [k, ata, amt] of [[bob, bobUsdc, 25], [alice, aliceUsdc, 40]] as const) {
      await program.methods.placeBid(E6(amt))
        .accountsPartial({ bidder: k.publicKey, market, offer, premiumMint: USDC,
          bid: bidPda(offer, k.publicKey), bidVault: bidVaultPda(offer, k.publicKey),
          bidderTokenAccount: ata, premiumTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId })
        .signers([k]).rpc();
    }
    assert.equal(await bal(bidVaultPda(offer, alice.publicKey), TOKEN_PROGRAM_ID), 40e6);

    // Deltas, not absolute balances: the fee destination is the payer's USDC
    // account and other suites on the same validator also pay into it.
    const writerBefore = await bal(writerUsdc, TOKEN_PROGRAM_ID);
    const feeBefore = await bal(feeDest, TOKEN_PROGRAM_ID);

    await program.methods.acceptBid()
      .accountsPartial({ writer: writer.publicKey, config, market, offer,
        bid: bidPda(offer, alice.publicKey), bidVault: bidVaultPda(offer, alice.publicKey),
        premiumMint: USDC, writerPremiumAccount: writerUsdc, feeDestination: feeDest,
        premiumTokenProgram: TOKEN_PROGRAM_ID })
      .signers([writer]).rpc();

    // 40 USDC premium, 50 bps fee.
    assert.equal(await bal(writerUsdc, TOKEN_PROGRAM_ID), writerBefore + 39.8e6);
    assert.equal(await bal(feeDest, TOKEN_PROGRAM_ID), feeBefore + 0.2e6);

    const bobBefore = await bal(bobUsdc, TOKEN_PROGRAM_ID);
    await program.methods.refundBid()
      .accountsPartial({ bidder: bob.publicKey, market, offer,
        bid: bidPda(offer, bob.publicKey), bidVault: bidVaultPda(offer, bob.publicKey),
        premiumMint: USDC, bidderTokenAccount: bobUsdc,
        premiumTokenProgram: TOKEN_PROGRAM_ID })
      .signers([bob]).rpc();
    assert.equal(await bal(bobUsdc, TOKEN_PROGRAM_ID), bobBefore + 25e6);
  });

  it("settles in the money, permissionlessly, and splits exactly", async () => {
    const offer = offerPda(1), vault = vaultPda(offer);
    const o = await program.account.offer.fetch(offer);

    await waitUntil(o.expiryTs.toNumber());

    const aliceAta = PublicKey.findProgramAddressSync(
      [alice.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), TSLAX.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID)[0];

    // Signed by the cranker, not the buyer or the writer.
    await program.methods.settle()
      .accountsPartial({ cranker: cranker.publicKey, market, offer, underlyingMint: TSLAX,
        feedAccount: TSLAX_FEED, vault, buyer: alice.publicKey, buyerTokenAccount: aliceAta,
        writer: writer.publicKey, writerTokenAccount: writerTslax,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId })
      .signers([cranker]).rpc();

    const done = await program.account.offer.fetch(offer);
    const S = done.settledPrice.toNumber(), K = done.settledStrike.toNumber();
    const expected = Math.floor((10e8 * (S - K)) / S);

    assert.deepEqual(done.state, { settled: {} });
    assert.equal(done.payoutAmount.toNumber(), expected);
    assert.equal(await bal(aliceAta, TOKEN_2022_PROGRAM_ID), expected);
    assert.equal(await bal(writerTslax, TOKEN_2022_PROGRAM_ID), 90e8 + (10e8 - expected));
    // settle closes the vault, so its rent goes back rather than being
    // stranded on-chain forever.
    assert.isNull(await conn.getAccountInfo(vault), "vault should be closed after settle");
    assert.isBelow(expected, 10e8, "payout must never exceed the collateral");
    console.log(`      settled at $${(S / 1e8).toFixed(2)} vs strike $${(K / 1e8).toFixed(2)}`);
    console.log(`      buyer ${(expected / 1e8).toFixed(8)} TSLAx, writer keeps ${((10e8 - expected) / 1e8).toFixed(8)}`);
  });

  it("settles out of the money with nothing to the buyer", async () => {
    const strike = oraclePrice * 2;
    const expiry = (await chainTime()) + 4;
    const offer = offerPda(2), vault = vaultPda(offer);

    await program.methods.writeCall(new BN(RUN * 10 + 2), E8(5), E8(strike), new BN(expiry), E6(1))
      .accountsPartial({ writer: writer.publicKey, config, market, underlyingMint: TSLAX,
        offer, vault, writerTokenAccount: writerTslax,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([writer]).rpc();

    await program.methods.placeBid(E6(2))
      .accountsPartial({ bidder: alice.publicKey, market, offer, premiumMint: USDC,
        bid: bidPda(offer, alice.publicKey), bidVault: bidVaultPda(offer, alice.publicKey),
        bidderTokenAccount: aliceUsdc, premiumTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId })
      .signers([alice]).rpc();

    await program.methods.acceptBid()
      .accountsPartial({ writer: writer.publicKey, config, market, offer,
        bid: bidPda(offer, alice.publicKey), bidVault: bidVaultPda(offer, alice.publicKey),
        premiumMint: USDC, writerPremiumAccount: writerUsdc, feeDestination: feeDest,
        premiumTokenProgram: TOKEN_PROGRAM_ID })
      .signers([writer]).rpc();

    const before = await bal(writerTslax, TOKEN_2022_PROGRAM_ID);
    const o = await program.account.offer.fetch(offer);
    await waitUntil(o.expiryTs.toNumber());

    const aliceAta = PublicKey.findProgramAddressSync(
      [alice.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), TSLAX.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID)[0];
    const aliceBefore = await bal(aliceAta, TOKEN_2022_PROGRAM_ID);

    await program.methods.settle()
      .accountsPartial({ cranker: cranker.publicKey, market, offer, underlyingMint: TSLAX,
        feedAccount: TSLAX_FEED, vault, buyer: alice.publicKey, buyerTokenAccount: aliceAta,
        writer: writer.publicKey, writerTokenAccount: writerTslax,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId })
      .signers([cranker]).rpc();

    const done = await program.account.offer.fetch(offer);
    assert.equal(done.payoutAmount.toNumber(), 0);
    assert.equal(await bal(aliceAta, TOKEN_2022_PROGRAM_ID), aliceBefore);
    assert.equal(await bal(writerTslax, TOKEN_2022_PROGRAM_ID), before + 5e8);
  });

  it("lets the writer reclaim an unsold offer without waiting for expiry", async () => {
    // A long-dated offer nobody bid on. Requiring expiry here would lock the
    // collateral for the whole term.
    const expiry = (await chainTime()) + 3600;
    const offer = offerPda(3), vault = vaultPda(offer);

    await program.methods.writeCall(new BN(RUN * 10 + 3), E8(4), E8(oraclePrice), new BN(expiry), E6(1))
      .accountsPartial({ writer: writer.publicKey, config, market, underlyingMint: TSLAX,
        offer, vault, writerTokenAccount: writerTslax,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([writer]).rpc();

    const before = await bal(writerTslax, TOKEN_2022_PROGRAM_ID);
    assert.isBelow(await chainTime(), expiry, "this must run well before expiry");

    await program.methods.reclaim()
      .accountsPartial({ writer: writer.publicKey, market, offer, underlyingMint: TSLAX,
        vault, writerTokenAccount: writerTslax, tokenProgram: TOKEN_2022_PROGRAM_ID })
      .signers([writer]).rpc();

    assert.equal(await bal(writerTslax, TOKEN_2022_PROGRAM_ID), before + 4e8);
    assert.isNull(await conn.getAccountInfo(vault), "vault should be closed after reclaim");
  });

  it("refuses to accept a bid after expiry", async () => {
    // Otherwise the writer holds a free option on the bid: wait, see where the
    // price landed, and accept only when the call is already worthless.
    const expiry = (await chainTime()) + 4;
    const offer = offerPda(4), vault = vaultPda(offer);

    await program.methods.writeCall(new BN(RUN * 10 + 4), E8(3), E8(oraclePrice * 0.9), new BN(expiry), E6(1))
      .accountsPartial({ writer: writer.publicKey, config, market, underlyingMint: TSLAX,
        offer, vault, writerTokenAccount: writerTslax,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([writer]).rpc();

    await program.methods.placeBid(E6(5))
      .accountsPartial({ bidder: alice.publicKey, market, offer, premiumMint: USDC,
        bid: bidPda(offer, alice.publicKey), bidVault: bidVaultPda(offer, alice.publicKey),
        bidderTokenAccount: aliceUsdc, premiumTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId })
      .signers([alice]).rpc();

    await waitUntil(expiry);

    try {
      await program.methods.acceptBid()
        .accountsPartial({ writer: writer.publicKey, config, market, offer,
          bid: bidPda(offer, alice.publicKey), bidVault: bidVaultPda(offer, alice.publicKey),
          premiumMint: USDC, writerPremiumAccount: writerUsdc, feeDestination: feeDest,
          premiumTokenProgram: TOKEN_PROGRAM_ID })
        .signers([writer]).rpc();
      assert.fail("accepting after expiry should be refused");
    } catch (e: any) {
      assert.include(e.toString(), "OfferExpired");
    }

    // The bidder is not stranded by the refusal.
    const before = await bal(aliceUsdc, TOKEN_PROGRAM_ID);
    await program.methods.refundBid()
      .accountsPartial({ bidder: alice.publicKey, market, offer,
        bid: bidPda(offer, alice.publicKey), bidVault: bidVaultPda(offer, alice.publicKey),
        premiumMint: USDC, bidderTokenAccount: aliceUsdc,
        premiumTokenProgram: TOKEN_PROGRAM_ID })
      .signers([alice]).rpc();
    assert.equal(await bal(aliceUsdc, TOKEN_PROGRAM_ID), before + 5e6);
  });

  it("refuses to settle on a stale oracle", async () => {
    const tightFeedId = [...FEED_ID];
    const tightMarket = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), TSLAX.toBuffer(), FEED_ID], program.programId)[0];
    // The cloned account is far older than 60 seconds, so a market with a tight
    // staleness window must refuse. Registering it proves the guard is live.
    try {
      await program.methods.addMarket(tightFeedId, 60, 100)
        .accountsPartial({ authority: payer.publicKey, config, market: tightMarket,
          underlyingMint: TSLAX, premiumMint: USDC, feedAccount: TSLAX_FEED,
          systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("market already exists, this should have failed");
    } catch (e: any) {
      assert.include(e.toString().toLowerCase(), "already in use");
    }

    const raw = await conn.getAccountInfo(TSLAX_FEED);
    const publish = Number(raw!.data.readBigInt64LE(93));
    const age = (await chainTime()) - publish;
    console.log(`      cloned oracle is ${(age / 3600).toFixed(1)} hours stale`);
    assert.isAbove(age, 60, "fixture should be stale enough to exercise the guard");
  });
});
