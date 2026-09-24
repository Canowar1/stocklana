# Stocklana — Build Plan v1

Companion to the Build Contract. Everything below is either a **verified fact** (probed today, with the command to reproduce it) or a **decision** that supersedes an open point in the contract. Anything still open is listed in §8 with a default.

Probed: 13 September 2026, ~20:25 UTC. Deadline: **25 September 2026, 16:00 ET**, extended from 18 September.

---

## 1. What the research changed

Eight things in the contract are now either wrong, settled, or cheaper than assumed.

### 1.1 Pyth Hermes is no longer a free public API — but you do not need it

`https://hermes.pyth.network/v2/updates/price/latest` returns **401 `unauthorized`** for every feed id, including SOL/USD. The legacy `/api/latest_price_feeds` route returns 401 too. The metadata route `/v2/price_feeds?query=…` is still open.

This does not matter, because the **sponsored push feed already lives on-chain and is free to read**:

| Feed | Solana account | Owner |
|---|---|---|
| `Crypto.TSLAX/USD` | `GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY` | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` |
| `Crypto.NVDAX/USD` | `6TPsjFigUaMFanRCsxQ4WbmG215xhRBXsb5y5Cn5L6eE` | same |

Both are `PriceUpdateV2` accounts, 134 bytes, shard 0, derived as `findProgramAddress([u16_le(shard), feed_id_32], pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT)`. Derivation verified against the known SOL/USD account `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE`.

**Consequence, and it is a large one.** The program reads a Solana account. There is no Hermes call, no VAA, no price-update posting instruction, no keeper, no API key in the demo. A whole workstream disappears. Settlement becomes a single atomic transaction.

### 1.2 Oracle staleness over the weekend is real and measured

The TSLAX feed's last print was **2026-09-12 12:18:54 UTC**. Measured against 2026-09-13 20:40 UTC, that is **32.3 hours stale**. Every one of the 14 live xStocks feeds carries the identical publish time, so the whole equity feed set goes quiet together.

The contract's §8 listed this as a risk to test "first weekend." It is now tested. It is not a risk, it is a specification input, and §6 is written against this number.

### 1.3 The xStocks price endpoint does not work

`GET /public/assets/{symbol}/price-data` returns `{"quote": null}` after **21 seconds**. It is not a price source. Do not put it on the critical path.

What does work, unauthenticated: `/public/assets`, `/public/assets/{symbol}`, `/public/oracles/{symbol}`, `/public/system/status/{symbol}`, `/public/assets/{symbol}/multiplier`, `/public/corporate-actions/{history,upcoming}`, `/public/proof-of-reserves`. Base URL is `https://api.xstocks.fi/api/v2`. Full spec: `https://docs.xstocks.fi/_bundle/apis/@v2/openapi.json?download`.

### 1.4 The Token Extensions smoke test is done — results below

The contract reserved build hour 1 for this. Here it is, for the TSLAx mint `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` (Token-2022, 8 decimals):

| Extension | State | What it means for the build |
|---|---|---|
| `transferHook` | authority set, **programId `null`** | No hook runs today. Collateral locking works with plain Token-2022 transfers. The authority can add one later. |
| `permanentDelegate` | `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq` | **The issuer can move tokens out of the vault PDA at any time.** This is the honest answer to "who eats the loss." |
| `pausableConfig` | `paused: false` | The issuer can freeze all transfers, which would block settlement. Needs a stated fallback. |
| `defaultAccountState` | `initialized` | No manual thaw step. Good. |
| `scaledUiAmountConfig` | multiplier `1` for TSLAx, **`1.0017` for NVDAx** | See §1.5. This is the sharpest correctness detail in the whole build. |
| `confidentialTransferMint` | present, auto-approve off | Irrelevant here. |
| freeze authority | `JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs` | Individual accounts can be frozen. |

Nothing here blocks collateral locking. The contract's fallback ("cash settlement, collateral in USDC") is not needed for this reason.

### 1.5 The multiplier is the corporate-action mechanism, and it breaks naive strikes

`scaledUiAmountConfig.multiplier` is how the issuer applies splits and similar events. NVDAx already sits at **1.001701196801074**, not 1. The raw on-chain token amount is therefore **not** the economic share count.

A covered call whose strike is defined against raw amounts is wrong the moment the multiplier moves. The fix is cheap and almost nobody else will do it:

- Store strike as **USD per UI unit**, 8 decimals, matching the Pyth exponent.
- Convert raw to UI at settlement by reading the mint's live multiplier.
- Read `newMultiplier` and `newMultiplierEffectiveTimestamp` to detect a pending change, and surface it in the UI.

This is the answer to the judge question "what happens on a stock split," and it is worth about two hours.

### 1.6 Devnet has the oracle machinery but neither the asset nor the equity feeds

Measured on devnet: the Pyth receiver program is deployed, the **SOL/USD feed is live and fresh**, the NVDAx feed account exists but is **962 hours stale**, and the TSLAx feed plus the other twelve are **absent**. No xStocks mint exists there at all.

So devnet cannot host the real asset priced by a real equity feed. It can host the real *mechanism*. §4 turns that into a decision rather than a blocker.

### 1.7 "24/7" is half true — say it precisely

`trading.tradingHoursMode` for TSLAx is **`TwentyFourFive`**, `currentPeriod` was `closed` at probe time with `nextChangeAt: 2026-09-14T00:00:00Z`. The issuance and redemption rail is 24/5. The AMM pools are 24/7. The oracle prints on the equity schedule. Claiming "24/7 equity exposure" without that distinction is the kind of thing a judge catches.

Liquidity, from Jupiter Price v3 (unauthenticated, works): TSLAx ~**$1.25M**, NVDAx ~**$1.85M**. Enough for a real demo-sized position, not enough for size.

### 1.8 Oracle coverage is the multi-market ceiling — and it is 14, not 1

This is the answer to "what actually stops us from listing many markets." Nothing in the program does. The census:

| Layer | Count |
|---|---|
| xStocks tokens deployed on Solana | **828** |
| ...with a Pyth oracle record in the xStocks API | 51 |
| ...whose oracle record carries a `hermesId` (required to derive the feed account) | 15 |
| ...whose derived push feed account **actually exists on mainnet** | **14** |

The 36 symbols with `hermesId: null` cannot be priced on-chain today. `AMBRx` has an id but no deployed account.

The 14 that work, with the price and confidence read from their accounts at probe time:

| | | | | |
|---|---|---|---|---|
| AAPLx $334.09 | COINx $176.19 | CRCLx $91.67 | GLDx $398.63 | GOOGLx $339.94 |
| HOODx $112.31 | MCDx $258.95 | METAx $649.62 | MSTRx $131.27 | NFLXx $77.98 |
| NVDAx $219.52 | QQQx $717.39 | SPYx $769.91 | TSLAx $365.23 | |

Note what is *not* on that list: MSFTx, AMZNx, AMDx, PLTRx. The obvious names are partly absent, which is itself worth saying out loud in the pitch.

**Consequence for scope.** A market is `(mint, feed_account, strike, expiry)`. Listing 14 of them is a config array and a dropdown, not a code change — roughly an hour of frontend. The contract's §6 cut line ("one underlying only") was written when multi-market looked expensive. It is not. Keep one strike and one expiry per market, but ship the list.

Feed accounts for all 14 are saved in `docs/feed_accounts.json`, derivable from scratch with `docs/derive_pyth_feed_account.py`.

---

## 2. The contradiction nobody named

The pitch is: *holders of idle tokenized equity earn premium on what they already hold.*

The contract's §11 default is: *cash settlement, collateral held in USDC.*

**These two cannot both be true.** If the writer must post USDC, they are not monetizing an idle stock position, they are writing a cash-secured call with capital they had to bring. The story collapses into a different product, and the "covered" framing has to go — which the contract honestly admits, without noticing that the user disappears with it.

There is a third option the contract does not list, and it dominates both.

---

## 3. Decision — settlement

**Collateral is the stock token. Settlement is cash-computed, paid in the stock token.**

The writer locks `N` TSLAx in a vault PDA. At expiry the program reads the Pyth account, and:

```
payout_shares = max(0, S - K) / S * N      paid to the buyer
remainder     = N - payout_shares          released to the writer
```

where `S` is the oracle settlement price and `K` the strike, both USD per UI unit.

Why this wins:

- **The writer story survives.** Idle stock is the collateral. No new capital.
- **It is always fully collateralized.** `payout_shares < N` for every `S`, because `(S-K)/S < 1`. This is the structural reason a covered call cannot be liquidated, and it is provable in one line in the README.
- **The buyer's payoff is exactly a call.** They receive stock worth `(S - K) * N` USD and can sell it on Jupiter immediately.
- **No issuer mechanics.** No redemption, no issuance, no atomic swap, no API key.
- **Only the collateral leg is asset-specific.** The settlement math is oracle-based, so adding a second issuer later costs a mint whitelist entry, not a rewrite. The contract wanted reversibility; this has it.

Premium is paid in USDC to the writer at acceptance.

The honest caveat for the README: the issuer's `permanentDelegate` means custody is ultimately the issuer's, on this and on every other xStocks product. State it; do not hide it.

---

## 4. Decision — network

**Devnet is the demo. A mainnet-forked validator is the proof. Both ship.**

This reverses the earlier fork-only recommendation, for a reason that outranks fidelity: **submission asset 5 is a Demo URL, and a judge has to be able to click it.** A local validator is not reachable. Devnet is. That constraint decides it.

What devnet actually has, measured:

| | Devnet status |
|---|---|
| Pyth receiver program `rec5EK…` | **Present** |
| SOL/USD feed `7UVim…` | **Present and live** (fresh at probe time) |
| NVDAx feed | Present but **962 hours stale** — abandoned, unusable |
| TSLAx feed and the other 12 | **Absent** |
| Any xStocks mint | **Absent** |

So devnet ships two markets, and the split between them is the honesty story:

1. **SOL/USD market — zero mocks in the price path.** Live Pyth feed, strict owner and feed-id verification, real staleness guard. A judge can run the entire lifecycle against a genuinely live oracle. The asset is a placeholder; the mechanism is not.
2. **TSLAx market — mirrored price.** A small relayer copies the bytes of the real mainnet `GpoWLTd6…` account into a devnet account on the same layout. This proves the equity path, the 8-decimal strike math and the multiplier handling. It is labeled in the UI and in the README as a mirror, with the mainnet account address shown next to it so anyone can verify the source.

The underlying token on devnet is a Token-2022 mint we create that **replicates TSLAx's exact extension set** — `permanentDelegate`, `pausableConfig`, `scaledUiAmountConfig`, `defaultAccountState`, a null-program `transferHook`, token metadata, 8 decimals. Plus a faucet button, so a judge arrives with a balance instead of a dead end. This is the single highest-leverage hour in the front end.

The mainnet fork stays, but its job is narrowed to the technical video: same program, real `XsDoVfqe…` mint, real `GpoWLTd6…` oracle, one settlement landing on-chain.

```bash
solana-test-validator --url https://api.mainnet-beta.solana.com \
  --clone XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB \
  --clone GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY \
  --clone EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --clone-upgradeable-program rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ --reset
```

**The one thing to get right.** The oracle owner check must stay strict in the program. The devnet mirror is handled by making the *feed account address* a market parameter and deploying a devnet-only mirror program that owns the mirrored account — not by weakening verification behind a feature flag. A relaxed owner check is precisely what a technical judge looks for, and it would undo the credibility the rest of this design buys.

## 5. Decision — scope of the market

**Escrowed-bid offer book. Not a continuous auction, not a single-taker limit offer.**

Instruction set, seven total:

| # | Instruction | Does |
|---|---|---|
| 1 | `write_call` | Writer locks `N` in vault PDA; sets strike, expiry, min premium |
| 2 | `place_bid` | Bidder escrows USDC in a per-bid PDA |
| 3 | `cancel_bid` | Bidder withdraws before acceptance |
| 4 | `accept_bid` | Writer takes premium; position assigned to that bidder |
| 5 | `settle` | After expiry: read Pyth, split collateral per §3 |
| 6 | `reclaim` | Writer withdraws collateral if no bid was accepted by expiry |
| 7 | `refund_losing_bid` | Losing bidders recover escrow after acceptance |

This keeps the two-sided claim honest — the demo shows two bids competing and one winning — without the state machine of a time-boxed auction. A single-taker limit offer would be one instruction cheaper and would delete the thing the contract says is the whole point.

---

## 6. Settlement rules, written before the code

These exist because §1.2 measured the staleness, not because they sound careful.

1. **Expiry timestamps are restricted to US equity market hours.** The UI does not offer a weekend expiry.
2. **Max staleness at settlement: 3600 seconds.** If the feed is older, `settle` fails and can be retried. It never settles on a bad print.
3. **If the feed is stale past a grace window, settlement uses the last valid print and the UI says so before the position is opened.** The rule is visible at write time, not discovered at expiry.
4. **If the mint is paused at expiry, `settle` fails and collateral stays locked** until the pause lifts. Nobody is made whole by a transfer that cannot execute.
5. **If a multiplier change activates between write and expiry,** the strike is interpreted per UI unit and converted at the live multiplier. The position card shows the pending change.
6. **Confidence interval is read and displayed.** Settlement does not silently use a price with a wide band.

---

## 7. Build order

The dependency that kills you is the Anchor program. Everything else has a degraded mode; the program does not.

| Block | Work | Gate |
|---|---|---|
| **A** | Repo, Anchor workspace, forked validator script, cloned-account fixtures | Validator boots with a real TSLAx mint visible |
| **B** | `write_call` + `reclaim`, with a raw Token-2022 transfer into the vault PDA | A locked position exists on the fork |
| **C** | Pyth `PriceUpdateV2` deserialization and staleness guard, as a standalone test | Program prints the real TSLAX price from the cloned account |
| **D** | `place_bid` / `cancel_bid` / `accept_bid` / `refund_losing_bid` | Premium lands with the writer |
| **E** | `settle` with the §3 split and the §6 rules | Full lifecycle passes in one test file |
| **F** | Front end: one screen, write form, offer list, bid form, position card | Demo path clickable end to end |
| **G** | README with every mock disclosed, both videos, submission text | Assets 5–7 done 12 hours before close |

**Last safe moment to change direction is the end of block C.** After that, the settlement design is baked into the account layout.

If the schedule slips, cut in this order: (1) block D collapses to a single-taker fill, (2) the front end loses the bid form and bids are placed by script, (3) NVDAx as a second market is never added. The demo survives all three. It does not survive cutting `settle`.

---

## 8. Answered, and what is still open

Answered this session:

| Question | Answer | What it changes |
|---|---|---|
| Settlement | **Stock collateral, stock payout** (§3) | Writer story intact, always fully collateralized |
| Capacity | **Solo, 30+ hours, new to Anchor** | See the revised order below |
| Network | **Devnet demo + mainnet fork proof** (§4) | Clickable Demo URL exists |
| Markets | **Ship the list, ceiling is 14** (§1.8) | Cut line moves from "one underlying" to "one strike, one expiry" |

**The capacity answer changes the build order, and this is the important part.** New to Anchor plus a 5-day clock means the risk is not the design, it is the first time an account-constraint error eats four hours. Two consequences:

- **Block C is the go/no-go.** If the program cannot read the real Pyth account and print the TSLAX price by the end of day 2, the escrowed-bid book (block D) is cut to a single-taker fill that same hour. Do not discover this on day 4.
- **Write the tests before the front end, not after.** A `settle` that has never run past expiry in a test is a demo that fails on camera.

Still open, with defaults that take effect automatically:

| # | Question | Cheapest test | Default if unanswered |
|---|---|---|---|
| 1 | Project name | — | **Thales**. Crate, program id, and GitHub remain `stocklana`. |
| 2 | Is there a funded mainnet wallet at all | `solana balance` | No. The mainnet fork covers the technical video; nothing is deployed to mainnet |
| 3 | The real user, named, with the moment | Answer it | §9 draft stands |
| 4 | Does the devnet faucet mint need a rate limit | 10 minutes of thought | Yes, per-wallet cap. A drained faucet during judging is an avoidable death |

## 9. Draft answers to the four judged items

**The user and the moment.** Someone holding ~$4k of TSLAx on Solana, bought months ago, doing nothing with it. They check the position on a Sunday, see it flat, and have exactly two options today: sell it, or lend it on Kamino for a rate that sits below the cost of the leverage they would need for it to matter. They want income without giving up the position and without a liquidation price. Today they do nothing, which is the honest answer.

**The end-to-end path.** Connect wallet → see the idle TSLAx position → write one call, strike and expiry and size, collateral locks on-chain → offer appears in the book → a second wallet escrows a USDC bid → writer accepts, premium settles immediately → at expiry `settle` reads the Pyth account and splits the collateral in one transaction. Mocked and labeled: the second wallet, the injected fork balance, and time compression at expiry.

**Why Solana, as a property.** The collateral, the oracle and the settlement live in the same account space. The program reads `GpoWLTd6…` and moves the Token-2022 mint `XsDoVfqe…` in one atomic transaction, with no bridge, no keeper posting a price and no off-chain signature. Anywhere without both a continuously-pushed sponsored equity feed and the tokenized asset itself, settlement requires a trusted third party. That is the property.

**The cut line.** One strike and one expiry per market. No ladder, no term structure, no rollover, no epochs, no governance, no portfolio view, no mobile. The market list is not cut, because §1.8 showed it costs an hour; the derivatives surface is, because it costs days. A book with 14 live underlyings, one instrument each, and a real counterparty proves more than a strike ladder with no bids.

**Day 31.** A fee in basis points on accepted premium. It is the only revenue line and it should be in the program from block D, even at zero.

---

## 10. Reproduce the facts

All probes in this document are unauthenticated and re-runnable:

```bash
# Token-2022 extensions on TSLAx
curl -s https://api.mainnet-beta.solana.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",{"encoding":"jsonParsed"}]}'

# Live TSLAX oracle account (settlement source)
curl -s https://api.mainnet-beta.solana.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY",{"encoding":"base64"}]}'

# Multiplier, trading status, corporate actions
curl -s https://api.xstocks.fi/api/v2/public/assets/NVDAx/multiplier?network=Solana
curl -s https://api.xstocks.fi/api/v2/public/system/status/TSLAx
curl -s "https://api.xstocks.fi/api/v2/public/corporate-actions/upcoming?symbol=TSLAx"
```

Local toolchain, verified: `anchor-cli 0.32.1`, `rustc 1.93.0`, `node v20.20.1`, `solana-cli 2.3.13` (installed at `~/.local/share/solana/install/active_release/bin`, **not on PATH** — fix before block A). Working directory is empty and **not a git repository**.

---

## 11. The next four hours

In order. Nothing here depends on an unanswered question.

1. **Put `solana` on PATH** and point the CLI at devnet. The binary is at `~/.local/share/solana/install/active_release/bin`. Confirm `solana --version` and `solana balance` before anything else.
2. **`git init`** and scaffold the Anchor workspace. The working directory is empty and untracked today.
3. **Airdrop devnet SOL** and create the replica Token-2022 mint with the full extension set from §1.4. Getting `scaledUiAmountConfig` and `permanentDelegate` onto a mint you control is the cheapest possible rehearsal for the real thing.
4. **Write the `PriceUpdateV2` deserializer and read the live devnet SOL/USD account from inside the program.** This is block C, pulled forward. It is the one piece that has no fallback, and it is small enough to finish tonight.

If step 4 works before you sleep, the schedule holds with room. If it does not, the scope cut in §8 happens tomorrow morning rather than on day 4.
