# Side tracks

Assessed 15 September 2026. One fits and costs nothing. Four do not. The deadline has since moved to 25 September, which does not change any verdict below: the four declines are about product shape and principle, not about time.

---

## Claim: Best use of Pyth market data

Pyth is not an integration in this product, it is the settlement mechanism. `settle` reads a `PriceUpdateV2` account, verifies the owner program, the feed id and the exponent, enforces a staleness window, and computes the entire payout from that price. Remove Pyth and there is no product. The track asks how central the data is; here the program refuses to execute without it.

Three things already in the build support the claim, at zero additional cost:

- The `Settled` event carries `settle_price`, `adjusted_strike`, `publish_time` and `confidence`. Every settlement leaves an auditable receipt of exactly which print decided it.
- The staleness guard is a hard failure, not a warning. A settlement on a bad print is impossible rather than discouraged.
- The market account stores the feed account and feed id, so which feed settles a market is explicit on-chain rather than a backend decision.

### What the measurement found, and why the naive version of this track is a trap

The track names three feed families for the same underlying. All three resolve in Pyth's metadata. On Solana mainnet they are not equivalent:

| Feed | On-chain account | Price | Staleness at 15 Sep 21:11 UTC |
|---|---|---:|---:|
| `Crypto.TSLAX/USD` | `GpoWLTd6…` | $365.23 | 80.9 h |
| `Crypto.AAPLX/USD` | `Gs4DVtiG…` | $334.09 | 80.9 h |
| `Crypto.NVDAX/USD` | `6TPsjFig…` | $219.52 | 80.9 h |
| `Equity.US.TSLA/USD` | `E8WFH8br…` | $365.28 | 93.2 h |
| `Equity.US.NVDA/USD` | `2w1Tg1XT…` | $211.02 | 485.3 h |
| `Equity.US.AAPL/USD` | `DJ2FyTgU…` | $305.92 | 769.2 h |
| `Crypto.TSLAON/USD` | — | — | **not deployed** |
| `Crypto.AAPLON/USD` | — | — | **not deployed** |
| `Crypto.NVDAON/USD` | — | — | **not deployed** |
| `Crypto.TSLAX/TSLA.RR` | `4a4TAWMi…` | 1.0000 | 1377 h |

Two conclusions follow, and the second is the interesting one.

**The Ondo feeds have Hermes ids but no Solana accounts.** A product that reads them on-chain gets nothing. Only the xStocks family is coherently maintained across the set.

**Naively differencing the two live families produces a number that looks like a basis and is not one.** Subtracting the AAPL equity print from the AAPLx print gives +921 bps. That is not a premium on the tokenized asset. It is a 32-day-old equity print compared against an 81-hour-old token print. NVDA gives +403 bps for the same reason. TSLA, whose two feeds are only 12 hours apart, gives −1.2 bps, which is the only one of the three that is plausibly a real basis at all.

This is exactly the failure a price-comparison surface invites, and it is exactly what the program's staleness guard exists to prevent. A covered call settled against an AAPL equity feed that last printed a month ago would pay out on a price that no longer exists. Saying this out loud, with the numbers, is a better submission than a chart that quietly draws the artifact.

### What to build for it, if there is time after Block F

One panel, not a feature. The position card already has to show the settlement price. Show beside it: the feed the market settles against, its publish time, its confidence interval, and the equity reference feed with its own publish time. When the reference is stale, say so rather than drawing a basis. Roughly two hours in Block F, and it is already close to task F8.

**Do not** add a second oracle to the program. The settlement feed stays one account per market. The comparison is a display, not a settlement input.

---

## Decline: Meteora DBC, Clawpump, PreStocks, Tessera

**Meteora DBC** and **Clawpump** both require launching a token. This product has no token and the cut line says so deliberately. Qualifying would mean inventing one in two days with no reason for it to exist, which is the surface-area anti-pattern. The thin-liquidity problem DBC targets is real here, and the measurement supports it. NFLXx carries $5,566 of pool liquidity against $12.1M outstanding. But a bonding curve for thinly traded tokenized equity is a different product, not an extension of this one.

**PreStocks** and **Tessera** are declined on a principle rather than on time. Pre-IPO tokens have no Pyth feed, which is the same constraint already measured across xStocks: 14 of 828 tokens have a live on-chain price account. Settling against a vendor's REST API means a trusted off-chain party pushing prices, which directly contradicts the answer to "why Solana" that the rest of this design earns: collateral, oracle and settlement in one atomic transaction with no trusted third party. Taking that prize would cost the argument.

---

## The schedule reality

With the deadline at 25 September there is room for the Pyth display panel, which was already close to task F8. There is still not room for a second product, and the reasons for declining the other four were never primarily about time. An unfinished main submission wins nothing in any track.
