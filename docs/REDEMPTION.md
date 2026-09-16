# Instant redemption, and whether we solve it

Short answer: **no, and the pitch must not say otherwise.** We build something that works without the redemption rail. That is a different and smaller claim, and it is defensible. Claiming to solve redemption is not.

Measured from the issuer's own API on 16 September 2026.

---

## 1. What the problem is

A tokenized stock is a claim on a share an issuer holds. Redemption turns the token back into cash or the share itself. The token trades on-chain continuously; the underlying equity does not. So when a holder wants out at a moment the equity market is shut, the issuer cannot sell the hedge, and it must either refuse, charge for the risk, or carry inventory.

That is the instant redemption problem: **the promise of a 24/7 asset resting on a rail that is not open 24/7.** Without a working redemption arbitrage the token can drift from the value of the thing it represents, and the drift is worst exactly when the market is closed.

## 2. What xStocks actually does about it

`GET /public/assets/TSLAx` returns `tradingHoursMode: TwentyFourFive` and a per-period limit table. These are the issuer's own numbers:

| Period | Minimum order | Maximum order |
|---|---:|---:|
| Market hours | $1,000 | $100,000,000 |
| Extended | $1,000 | $100,000,000 |
| Overnight | $1,000 | $20,000,000 |
| **Closed** | $1,000 | **$0** |

Identical for NVDAx, SPYx and GLDx, so this is the policy rather than a quirk of one asset.

Three facts fall out of that table.

**Redemption stops completely when the market is closed.** A maximum order of zero is not a wide spread or a long settlement time. It is shut. Weekends and holidays, there is no redemption at any size.

**Overnight is throttled to a fifth of the daytime cap.** $20M against $100M. The issuer is pricing the risk of being unable to hedge, and doing it by rationing size rather than by widening a spread.

**There is a $1,000 floor at every hour of every day.** This is the part that matters most for our user and it gets the least attention. A holder with $400 of TSLAx cannot redeem during market hours either. For them the redemption rail does not exist at all, and the only exit is an AMM pool holding $1.25M against $83.9M outstanding.

So "instant redemption" is doing a great deal of work as a phrase. The accurate description is redemption during US market hours, above $1,000, subject to an overnight cap.

## 3. What we actually do about it

**We never touch the rail.** Settlement reads a Pyth account, computes the split, and pays the buyer in the underlying token itself. No issuance, no redemption, no atomic swap, no issuer API. A closed redemption window does not block a Stocklana settlement.

**Our payout can never require sourcing anything.** `payout = collateral × (S − K) ÷ S` is strictly below the collateral at every price, so the vault always already holds what it owes. The protocol never hedges, never carries inventory, and never needs the underlying market to be open in order to pay.

That is a real structural property. It is not a solution to redemption.

## 4. Where we inherit the same root cause anyway

Being honest about this is worth more than the claim we would give up.

The equity market being shut does not stop our settlement through the redemption desk. It stops it through the **price feed**. Pyth's equity feeds go quiet when the market does: the measurement in `docs/BUILD_PLAN.md` §1.2 found the TSLAX feed 32.3 hours stale on a Sunday evening, and every one of the fourteen live feeds carried the identical publish time.

So Stocklana has a market-hours dependency too. It arrives through the oracle instead of the issuer, and the program handles it by refusing to settle rather than settling on a stale print. Different mechanism, same underlying calendar.

**This is why the pitch cannot say "24/7 equity exposure."** The AMM pools are 24/7. The redemption rail is 24/5 above $1,000. The oracle is on the equity calendar. Three different clocks, and the product is bounded by the slowest one that it depends on.

## 5. The honest claim, in one sentence

Someone holding a tokenized stock they cannot redeem, either because it is the weekend or because the position is under $1,000, can turn it into cash income without selling it and without touching the redemption rail at all.

That is narrower than solving redemption. It is also true, and it survives the question a judge who knows RWA will ask: *how does your protocol source the underlying at 2am on a Sunday?* The answer is that it never needs to, and saying so upfront is the difference between a good answer and a fatal one.

## 6. The second-order effect we should name before someone else does

At settlement an in-the-money buyer receives the underlying token. If they want cash they face the same two walls: the $1,000 redemption floor, and an AMM pool holding roughly 1.9% of outstanding supply across the fourteen markets.

So **Stocklana adds sell pressure to a thin pool at predictable moments**, since expiries cluster. At today's size this is negligible. At scale it is a real effect on the thing we depend on, and it is the kind of thing that should be in the risk section rather than discovered by a user.

Two mitigations exist and neither is built. Expiries could be staggered rather than aligned to a common calendar. Settlement could offer the buyer a cash leg funded by the writer instead of tokens, which moves the problem to the writer who is better placed to hold. Both are post-hackathon, and listing them is not the same as having them.
