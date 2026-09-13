# Stocklana — Execution Checklist

Stable task ids. Any environment or session can pick this up, find the first unchecked box, and continue. Update the status line at the top of the block when you finish one.

**Deadline** 18 Sep 2026 16:00 ET. **Assets 5 to 7 deadline** 18 Sep 08:00 ET.
**Status** Block A done except the devnet airdrop (A4). Next: B1.

Legend: `[ ]` open, `[x]` done, `[~]` in progress, `[-]` cut.

---

## Block A — Ground. Target: tonight, 13 Sep

Gate: `anchor build` succeeds and a local validator boots with the real TSLAx mint visible. **Build gate passed**, `target/deploy/stocklana.so` is 190,760 bytes. Two toolchain traps were hit and are documented in `CLAUDE.md`: a root-owned `~/.cache` and `edition2024` dependencies against the 1.84 platform-tools cargo. Always build with `./scripts/build.sh`.

- [x] **A1** Put the Solana CLI on PATH. Binary is at `~/.local/share/solana/install/active_release/bin`, currently not on PATH. Add to `~/.zshrc`, confirm `solana --version` reports 2.3.13.
- [x] **A2** `git init`, add a `.gitignore` for `target/`, `node_modules/`, `.anchor/`, `test-ledger/`, `*.env`.
- [ ] **A3** `anchor init stocklana --no-git` into the repo, pin Anchor 0.32.1 in `Anchor.toml`.
- [~] **A4** Devnet keypair and airdrop. Address is `2NwenGGqW1qJBJiGSH7FvtboZFhymZqrAnpXpYhgfW58`, balance 0. **The public RPC airdrop is rate limited and refused every attempt.** Use https://faucet.solana.com in a browser with that address, or `./scripts/airdrop.sh` to retry. This blocks devnet deployment in block F, nothing before it.
- [x] **A5** Fork script `scripts/fork.sh` with the `solana-test-validator --clone` line from `BUILD_PLAN.md` §4. Confirm the cloned TSLAx mint shows its extensions under `spl-token display`.
- [x] **A6** Run `docs/verify_constants.sh` once and commit the output as `docs/probe-YYYYMMDD.txt`. Every number in the plan should be re-derivable, not remembered.

## Block B — Collateral. Target: 14 Sep morning

Gate: a locked position exists on the fork and the writer can get it back.

- [ ] **B1** `Config` and `Market` accounts plus `init_config` and `add_market`, per `ARCHITECTURE.md` §1 and §2.
- [ ] **B2** `add_market` verifies the feed account owner is the Pyth receiver and the feed id matches before storing.
- [ ] **B3** `Offer` account and `write_call`. Collateral moves into the vault PDA through `token_interface`, not the legacy token program.
- [ ] **B4** Read the mint's `ScaledUiAmountConfig` and store the effective multiplier in `Offer.multiplier_at_write`. Use the `new_multiplier_effective_timestamp` rule from `ARCHITECTURE.md` §5, not the raw field.
- [ ] **B5** `reclaim` returns all collateral after expiry while the offer is still Open.
- [ ] **B6** Test: write then reclaim, on the fork, against the real TSLAx mint. This is the first real proof the extension set does not block anything.

## Block C — Oracle. **Go/no-go, gate at 14 Sep end of day**

Gate: the program prints the live TSLAX price, read from the real Pyth account, inside a test.

- [ ] **C1** Try `pyth-solana-receiver-sdk` with Anchor 0.32.1. Timebox this to 90 minutes.
- [ ] **C2** If C1 fights the toolchain, hand-deserialize using the verified 134-byte layout in `ARCHITECTURE.md` §4. Do not spend a third hour on the crate.
- [ ] **C3** Staleness guard and `BadExponent` check. Test that a stale account makes the instruction fail rather than settle wrong.
- [ ] **C4** Test reading the cloned `GpoWLTd6…` account on the fork and the live `7UVim…` SOL/USD account on devnet. Both paths, same code.
- [ ] **C5** **Decision point.** If C4 does not pass tonight, cut Block D to a single-taker fill tomorrow morning and record that in this file. Do not carry the full book into day 3 on hope.

## Block D — The market. Target: 15 Sep

Gate: premium lands with the writer and losing bidders get their money back.

- [ ] **D1** `Bid` account, bid escrow PDA, `place_bid`.
- [ ] **D2** `cancel_bid` while the offer is Open.
- [ ] **D3** `accept_bid`. Premium minus fee to the writer, fee to the destination. Enforce `min_premium`.
- [ ] **D4** `refund_bid` for losers after the offer is filled, and for anyone after expiry.
- [ ] **D5** Test: two bidders compete, the writer accepts one, the loser is made whole.
- [ ] **D6** Fee is in the program from this block, even at zero bps. It is the day-31 answer and retrofitting it later touches every account.

## Block E — Settlement. Target: 16 Sep

Gate: the full lifecycle passes in one test file, in the money and out of the money.

- [ ] **E1** `settle`, permissionless, with the split from `ARCHITECTURE.md` §3 and `u128` intermediates.
- [ ] **E2** Strike adjustment by the multiplier ratio. Test it by changing the multiplier on a mint you control between write and settle.
- [ ] **E3** Buyer ATA creation on settle with `init_if_needed`, payer is the caller.
- [ ] **E4** `MintPaused` path: pause a mint you control, assert `settle` fails cleanly and the collateral stays put.
- [ ] **E5** End-to-end test, in the money: write, two bids, accept, warp past expiry, settle, assert both balances against the worked example.
- [ ] **E6** End-to-end test, out of the money: assert the buyer gets nothing and the writer gets everything back.
- [ ] **E7** Same two tests on the mainnet fork against the real TSLAx mint and the real oracle account.

## Block F — Front end and deployment. Target: 17 Sep

Gate: a stranger with a wallet can complete the path on devnet without being told anything.

- [ ] **F1** Next.js app, wallet adapter, Anchor client from the generated IDL.
- [ ] **F2** Devnet replica mint: Token-2022 with the exact extension set from `BUILD_PLAN.md` §1.4, 8 decimals.
- [ ] **F3** Faucet button with a per-wallet cap. A faucet drained during judging is an avoidable death.
- [ ] **F4** Devnet mirror program for the TSLAx price, plus a relayer script copying the mainnet account bytes. Label it as a mirror in the UI and show the mainnet source address beside it.
- [ ] **F5** Market list from `docs/constants.json`. Two markets live on devnet, the other twelve visible and marked mainnet-only.
- [ ] **F6** One screen: idle position, write form, offer book, bid form, position card.
- [ ] **F7** Expiry picker restricted to US equity market hours. This is where the calendar rule lives, since the program only guards staleness.
- [ ] **F8** Surface the oracle publish time, the confidence interval, and any pending multiplier change on the position card.
- [ ] **F9** Deploy the program to devnet, deploy the front end, confirm the Demo URL works from a browser that has never seen it.

## Block G — Submission. **Hard deadline 18 Sep 08:00 ET**

- [ ] **G1** README. Open with the four judged items. Disclose every mock: the mirrored devnet price, the replica mint, the seeded counterparty, the time compression at expiry.
- [ ] **G2** Disclose reused components: Anchor, Pyth receiver, SPL Token-2022, the xStocks public API, Jupiter Price v3.
- [ ] **G3** Pitch video. The user's problem and the working path. Not the architecture.
- [ ] **G4** Technical video. The architecture and a settlement transaction landing on-chain, recorded against the mainnet fork with the real mint and the real oracle.
- [ ] **G5** Project name, short description, full description.
- [ ] **G6** Submit. Do not leave this to the last hour.

---

## Cut order, if the schedule slips

Apply in this order and write the date next to whichever you invoke.

1. Block D collapses to a single-taker fill. The two-sided claim leaves the pitch with it, so say so honestly rather than keeping the old wording.
2. The bid form leaves the front end and bids are placed by script in the demo.
3. The market list drops to one, and the other thirteen become a roadmap line.
4. The mainnet fork recording is dropped and the technical video uses devnet.

The demo survives all four. It does not survive cutting `settle`, the staleness guard, or the disclosure in G1.

---

## Open inputs

- [ ] Project name, needed for G5.
- [ ] The real user, named, with the moment. `BUILD_PLAN.md` §9 has a draft to correct.
- [ ] Whether any funded mainnet wallet exists. Default is no, and nothing deploys to mainnet.
