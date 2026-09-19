# Stocklana

Covered calls on tokenized equity that already sits in a Solana wallet. The writer locks the stock token, any wallet bids USDC premium, and at expiry the program splits the same tokens against an on-chain Pyth price. The payout cannot exceed the collateral, so there is no liquidation.

Devnet program: [`EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ`](https://explorer.solana.com/address/EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ?cluster=devnet)

A hosted Demo URL is not up yet. Local run is below. When the URL exists it will be linked here first.

---

## The four things this is judged on

**The user.** Someone holding tokenized Tesla or NVIDIA on Solana, bought months ago, doing nothing with it. On 14 September 2026 the fourteen xStocks with a live on-chain Pyth feed were worth **$743M** at those feed prices. About **5%** of that was in AMM pools or Kamino. The rest sat in wallets. On Kamino’s xStocks market, nine of ten equity reserves paid **0.00%** supply APY. Lending does not work here: nobody is borrowing the token to short it, so utilization is near zero and the rate is zero. Selling the position, or earning nothing, are the two options today.

**The path.** Connect a wallet → write a call against a balance you already hold (strike, expiry, size, floor premium) → collateral locks in a vault PDA → a second wallet escrows a USDC bid → the writer accepts and takes premium immediately → after expiry anyone can call `settle`, which reads the Pyth account and splits the stock. The buyer receives shares worth `(S − K) × N` dollars, or nothing if the call expired out of the money. The writer keeps the rest, and kept the premium either way.

**Why Solana.** The collateral mint, the oracle account and the settlement instruction live in the same account space. `settle` reads a `PriceUpdateV2` account and moves Token-2022 balances in one transaction. No bridge, no keeper posting a price, no off-chain signature. Anywhere that does not have both a continuously pushed equity feed and the tokenized asset itself, that settlement needs a trusted third party.

**What was cut, on purpose.** One instrument per market: a strike and an expiry the writer chooses, an escrowed bid book, no ladder, no implied volatility, no greeks, no token, no governance. Fourteen underlyings have live Pyth accounts on mainnet; they are a config list, not a rewrite. The derivatives surface is what costs days, so it is what was cut.

---

## Try it locally

The interface talks to **devnet**. Point Phantom at Devnet before connecting.

```bash
git clone https://github.com/Canowar1/stocklana.git
cd stocklana

# Program tests (no wallet needed)
./scripts/test-unit.sh          # settlement math, including property tests
# ./scripts/test-fork.sh        # 12 integration tests; needs a mainnet RPC that can clone accounts

# Interface
cp web/.env.example web/.env.local
# set NEXT_PUBLIC_CLUSTER=devnet
# NEXT_PUBLIC_PROGRAM_ID is already the deployed id
cd web && npm install && npm run dev
```

Open `http://localhost:3000`. The faucet button mints replica TSLAx / NVDAx and test USDC to the connected wallet. It is rate limited per wallet. It only works when `FAUCET_AUTHORITY_SECRET` is set on the server; without it the button says so instead of failing oddly.

A full write → bid → accept → wait → settle cycle against the live program:

```bash
cp .env.example .env            # CLUSTER=devnet, a funded DEPLOYER_KEYPAIR
./scripts/devnet-smoke.sh       # SMOKE_SETTLE=0 leaves the position live for the screens
```

The buyer in that script is a seeded keypair at `keys/devnet-demo-buyer.json`. It is a counterparty we control. Say so if you show the book.

---

## What is mocked, and what is not

Undisclosed mocking is a fail. Everything below is labelled in the interface at the point of use as well.

| Piece | Status |
|---|---|
| **SOL/USD market** | Real devnet Pyth feed `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE`. Nothing in its price path is mocked. |
| **TSLAx and NVDAx prices** | Mirrored from the mainnet Pyth accounts (`GpoWLTd6…`, `6TPsjFig…`). Publish time and confidence are copied unchanged. The program records the feed account’s owner at registration and re-checks it on every settlement, so a mirror is identifiable on-chain. The owner check was never relaxed. |
| **TSLAx and NVDAx mints** | Replica Token-2022 mints on devnet with the real extension set (permanent delegate, pausable, scaled UI amount — NVDAx at the real 1.0017 multiplier — null-program transfer hook). Not the issuer’s mints. |
| **Premium mint** | Test USDC created for this demo. Devnet’s well-known USDC mint is authority-held by someone else, so no test balance of it can be handed out. |
| **Seeded counterparty** | The smoke-script buyer. A writer can also bid on their own offer; blocking `bidder == writer` would not stop a second wallet. |
| **Time at expiry** | The program uses the chain clock. The demo script can wait out a short `min_duration` (60 seconds on devnet). We do not warp a public cluster. |
| **Mainnet proof** | `./scripts/test-fork.sh` runs the same program against a validator that cloned the real TSLAx mint `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` and the real Pyth account. That is the technical video’s settlement, not the clickable demo. |

---

## How settlement works

Collateral is the stock token. Payout is the stock token. Premium is USDC, paid when a bid is accepted.

```
payout  = max(0, S − K) / S × N     → buyer
kept    = N − payout                → writer
```

`S` and `K` are USD per UI unit, 8 decimals, matching Pyth’s exponent. `N` is the locked amount. `(S − K) / S` is always less than one, so the buyer cannot be paid more than the vault holds. That is why there is no liquidation price.

If a corporate action moves the mint’s `scaledUiAmount` multiplier between write and expiry, the strike is adjusted by the same ratio. An extreme ratio that would truncate the strike to zero is refused (`StrikeAdjustedToZero`) rather than turning a covered call into a transfer of the whole vault.

If the feed is stale past the market’s window, if its confidence band is wider than `max_conf_bps`, or if the issuer has paused the mint, `settle` fails and stays retryable. Collateral does not move.

---

## Markets on this deployment

Devnet, three markets:

| Market | Oracle | Mock |
|---|---|---|
| SOL/USD | Live Pyth | None in the price path |
| TSLAx | Mirror of mainnet `GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY` | Replica mint + mirrored feed |
| NVDAx | Mirror of mainnet `6TPsjFigUaMFanRCsxQ4WbmG215xhRBXsb5y5Cn5L6eE` | Replica mint + mirrored feed |

The other twelve names with live mainnet feeds (AAPLx, COINx, CRCLx, GLDx, GOOGLx, HOODx, MCDx, METAx, MSTRx, NFLXx, QQQx, SPYx) show in the UI as mainnet-only. They are config, not code.

---

## What this reuses

Building on these is expected. They are not this project’s work.

- [Anchor](https://www.anchor-lang.com/) 0.32.1
- [Pyth Solana receiver](https://docs.pyth.network/) `PriceUpdateV2` accounts (read on-chain; Hermes is not used)
- [SPL Token-2022](https://spl.solana.com/token-2022) via `anchor_spl::token_interface`
- [xStocks public API](https://docs.xstocks.fi/) for mint metadata, multipliers, trading hours (not for the settlement price)
- [Jupiter Price v3](https://dev.jup.ag/) was used to measure AMM liquidity while writing `docs/MARKET_GAP.md`; it is not on the settlement path

---

## Repository layout

```
programs/stocklana/     on-chain program (offers, bids, settlement)
programs/stocklana-mirror/   devnet price-mirror program, own accounts, own owner
web/                    Next.js interface
config/                 markets.<cluster>.json — markets are data
scripts/                build, deploy, fork, mirror, faucet-adjacent setup
tests/                  fork integration tests, including Token-2022 extensions
docs/                   plan, architecture, probes, review
.github/workflows/      unit math, fork tests, web typecheck and build
```

Start with `docs/BUILD_PLAN.md` if you want the decisions, `docs/ARCHITECTURE.md` if you want the accounts, `docs/REVIEW.md` if you want what a review already found and fixed.

---

## Tests and build

Always `./scripts/build.sh`, never bare `anchor build`. The script handles a machine-specific `~/.cache` permission trap; on CI it uses the real cargo cache.

```bash
./scripts/test-unit.sh    # math + nine proptest properties, no Solana toolchain
./scripts/test-fork.sh    # twelve tests on a mainnet-forked validator
cd web && npx tsc --noEmit && npm run build
```

The property tests found a real bug the hand-written cases missed: `adjust_strike` could truncate a small strike to zero under an extreme multiplier ratio, and a zero strike pays the buyer the entire collateral. The program now refuses. Keep those tests in any change to `programs/stocklana/src/math.rs`.

Instruction-surface fuzzing (Trident) is not done. That is the testing gap that remains.

---

## Honest limitations

- The xStocks issuer holds `permanentDelegate` and can pause the mint. Neither is guardable by this program. Both are true of every xStocks balance, in or out of this product. A paused mint makes `settle` fail cleanly; a drained vault makes it fail cleanly. Retryable, not partial.
- Equity Pyth feeds go quiet for about 32 hours over a weekend (measured). Settlement refuses a stale print. The UI does not offer weekend expiries.
- Rounding on the split favours the writer by less than one base unit (1e−8 of a share at 8 decimals).
- Upgrade authority on the current deploy is a single key. That is fine for a hackathon demo and not how a mainnet deployment should look.
- The hosted frontend, websocket subscriptions, and a durable faucet store for a multi-instance host are still open. The program on devnet is current.

---

## License

ISC. See [LICENSE](LICENSE).
