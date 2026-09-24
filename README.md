# Thales

Covered calls on tokenized equity you already hold. Writers lock the stock token and take USDC premium. Buyers pay for capped upside with no liquidation. At expiry the program reads an on-chain Pyth price and splits the same tokens.

**Devnet program:** [`EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ`](https://explorer.solana.com/address/EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ?cluster=devnet)

Repo: [github.com/Canowar1/stocklana](https://github.com/Canowar1/stocklana). A hosted Demo URL is not up yet; local run is below.

---

## Why we built this

Someone holding TSLAx or NVDAx on Solana today can sell it, or they can earn nothing. On 14 September 2026 the fourteen xStocks with a live on-chain Pyth feed were worth **$743M**. About **5%** sat in AMM pools or Kamino. On Kamino’s xStocks market, nine of ten equity reserves paid **0.00%** supply APY. Nobody is borrowing the token to short it, so lending is not a yield strategy. The option surface on that stock is zero instruments.

We wanted the missing third action: keep the shares, sell the upside, get paid in USDC.

## Market

Solana already has ~$800M in derivatives infrastructure, almost all perpetual futures on crypto (Jupiter Perps alone ~$748M at the same probe). The options category is a graveyard: Friktion peaked at $164M and is at $0. Those were crypto-underlying vaults with hidden pricing. Tokenized equity at this scale did not exist in 2022.

Colosseum Copilot’s nearest matches (20 Sep 2026) are **optmachine** (covered-call minting on crypto, Cypherpunk, similarity 0.08) and **xVaultFi** (lending on xStocks). Nothing in the corpus is a two-sided covered-call book on tokenized equity. Similarity below 0.4 is a weak match; these are neighbours, not duplicates.

The load-bearing assumption we are not pretending to have proven: buyers who already pay for leveraged *crypto* longs will pay premium for capped *equity* longs. The writer-side problem is measured. The buyer-side is the company.

## How it works

1. Writer locks the stock in a vault, sets strike, expiry, floor premium.
2. Any wallet escrows a USDC bid. The writer picks one. Premium lands immediately.
3. After expiry, anyone calls `settle`. The program reads the market’s Pyth account and pays `max(0, S − K) / S × N` of the stock to the buyer. The writer keeps the rest, and kept the premium either way.

`(S − K) / S` is always less than one, so the vault cannot owe more than it holds. There is no liquidation price.

## Try it

Point a Wallet Standard wallet (Phantom, Solflare, Backpack, …) at **devnet**.

```bash
git clone https://github.com/Canowar1/stocklana.git
cd stocklana/web
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Markets: SOL/USD (live Pyth, no mock in the price path), TSLAx and NVDAx (mirrored mainnet prices on replica Token-2022 mints).

```bash
./scripts/test-unit.sh     # settlement math, including property tests
./scripts/devnet-smoke.sh  # write → bid → accept → settle on the live program
```

The smoke-script buyer is a seeded keypair. Disclose it if you show that book.

## Team

Solo. [Caner Budak](https://github.com/Canowar1).

## What’s next

Ship a clickable Demo URL. Seed a live book a stranger can bid into. Then talk to xStocks holders — the people sitting on the 95% that does nothing — rather than inventing a token or a vault APY.

---

## What is mocked

Undisclosed mocking is a fail. Labelled in the UI at the point of use.

| Piece | Status |
|---|---|
| **SOL/USD** | Real devnet Pyth feed. Nothing in its price path is mocked. |
| **TSLAx / NVDAx prices** | Mirrored from mainnet Pyth (`GpoWLTd6…`, `6TPsjFig…`). Publish time and confidence copied unchanged. Feed owner is recorded at registration and re-checked on every settlement. The owner check was never relaxed. |
| **TSLAx / NVDAx mints** | Replica Token-2022 with the real extension set, including NVDAx’s 1.0017 multiplier. Not the issuer’s mints. |
| **Premium mint** | Test USDC. Devnet’s Circle mint cannot be funded for a demo. |
| **Seeded counterparty** | Smoke-script buyer. A writer can bid on their own offer from a second wallet. |
| **Expiry in the demo script** | Chain clock. Devnet `min_duration` is 60 seconds. We do not warp a public cluster. |
| **Mainnet proof** | `./scripts/test-fork.sh` against the real TSLAx mint and the real Pyth account. That is the technical video, not the clickable demo. |

## Settlement math

```
payout  = max(0, S − K) / S × N     → buyer
kept    = N − payout                → writer
```

`S` and `K` are USD per UI unit, 8 decimals. A multiplier change adjusts the strike by the same ratio. A ratio that would truncate the strike to zero is refused (`StrikeAdjustedToZero`). Stale feed, wide confidence, or a paused mint: `settle` fails and stays retryable.

## Reused

Anchor 0.32.1, Pyth `PriceUpdateV2` on-chain (not Hermes), SPL Token-2022 via `token_interface`, xStocks public API for metadata (not settlement), Jupiter Price v3 only for the liquidity probe in `docs/MARKET_GAP.md`.

## Layout

```
programs/stocklana/          offers, bids, settlement
programs/stocklana-mirror/   devnet price mirror, own owner
web/                         Next.js interface
config/                      markets are data
docs/                        plan, architecture, probes, review
```

`docs/BUILD_PLAN.md` for decisions, `docs/ARCHITECTURE.md` for accounts, `docs/REVIEW.md` for what a review already found.

Always `./scripts/build.sh`. Property tests in `math.rs` found a real zero-strike hazard; keep them.

## Limits we are not hiding

Issuer `permanentDelegate` and pause are unguardable. Equity feeds go quiet ~32 hours over a weekend. Rounding favours the writer by less than one base unit. Upgrade authority is a single key on this deploy.

## License

ISC. See [LICENSE](LICENSE).
