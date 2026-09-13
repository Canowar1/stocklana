# Stocklana — Program Architecture

Companion to `BUILD_PLAN.md`. This document exists so that blocks B through E are transcription rather than design. Account layout is the irreversible decision; changing it after block C means rewriting the tests and the client.

Anchor 0.32.1, Rust 1.93, underlying is Token-2022 via `anchor_spl::token_interface`.

---

## 1. Accounts

### `Config` — one per deployment
```
seeds = [b"config"]
authority:       Pubkey    // admin, can add markets and pause
fee_bps:         u16       // charged on accepted premium only
fee_destination: Pubkey    // USDC token account
min_duration:    i64       // seconds between write and expiry; 60 on devnet, 3600 on mainnet
bump:            u8
```

### `Market` — one per (underlying, feed)
```
seeds = [b"market", underlying_mint, feed_id]
underlying_mint:     Pubkey   // Token-2022 mint, 8 decimals
premium_mint:        Pubkey   // USDC, 6 decimals
feed_account:        Pubkey   // Pyth PriceUpdateV2, owner must be the receiver program
feed_id:             [u8; 32]
max_staleness_secs:  u32      // 3600
enabled:             bool
bump:                u8
```
Adding a market is an admin instruction, not a program upgrade. This is what makes the 14-market list from §1.8 of the plan cost an hour instead of a day.

### `Offer` — one per written call
```
seeds = [b"offer", market, writer, offer_id_le_u64]
market:              Pubkey
writer:              Pubkey
collateral_amount:   u64      // raw base units of the underlying, 8 dp
strike_usd:          u64      // USD per UI unit, 8 dp, same scale as the Pyth exponent
expiry_ts:           i64
min_premium:         u64      // USDC base units, 6 dp
multiplier_at_write: u64      // f64 bits of the mint's effective scaledUiAmount multiplier
state:               u8       // 0 Open, 1 Filled, 2 Settled, 3 Reclaimed
buyer:               Pubkey   // default() while Open
premium_paid:        u64
settled_price:       u64      // written at settle, for the UI and for auditability
bump:                u8
```

### `Bid` — one per bidder per offer
```
seeds = [b"bid", offer, bidder]
offer, bidder:  Pubkey
amount:         u64   // USDC base units
state:          u8    // 0 Active, 1 Cancelled, 2 Won, 3 Refunded
bump:           u8
```

### Token accounts
```
collateral vault:  seeds = [b"vault", offer]      authority = Offer PDA, mint = underlying (Token-2022)
bid escrow:        seeds = [b"bid_vault", offer, bidder]   authority = Bid PDA, mint = USDC
```
The collateral vault must be created through `token_interface`, not the legacy SPL token program, or it will fail on a mint that carries extensions.

---

## 2. Instructions

| # | Name | Signer | Effect |
|---|---|---|---|
| 1 | `init_config` | authority | Sets fee, fee destination, min duration |
| 2 | `add_market` | authority | Registers a mint and its feed account after verifying both |
| 3 | `write_call` | writer | Locks collateral, records strike, expiry, min premium, live multiplier |
| 4 | `place_bid` | bidder | Escrows USDC into the bid vault |
| 5 | `cancel_bid` | bidder | Refunds escrow while the offer is still Open |
| 6 | `accept_bid` | writer | Premium minus fee to writer, fee to destination, offer becomes Filled |
| 7 | `refund_bid` | bidder | Refunds a losing bid once the offer is Filled, or any bid after expiry |
| 8 | `settle` | permissionless | After expiry: reads the oracle, splits the collateral |
| 9 | `reclaim` | writer | After expiry with state still Open: returns all collateral |

`settle` being permissionless matters. If only the buyer can settle, an out-of-the-money buyer simply never calls it and the writer's collateral is stuck. Anyone paying the fee can push it through.

---

## 3. Settlement math

All prices are USD with 8 decimals, matching the Pyth exponent of -8. Intermediates in `u128`.

**Step 1, adjust the strike for any corporate action that happened after the write.**
```
adjusted_strike = strike_usd * multiplier_at_write / multiplier_now
```

**Step 2, split the collateral.**
```
if S <= adjusted_strike:
    payout_raw = 0
else:
    payout_raw = collateral_amount * (S - adjusted_strike) / S
remainder_raw = collateral_amount - payout_raw
```
`payout_raw` goes to the buyer, `remainder_raw` to the writer, both in the underlying token.

**Why this is always fully collateralized.** `(S - K) / S < 1` for every `S > K`, so `payout_raw < collateral_amount` always. There is no price at which the vault owes more than it holds. That single line is the reason the product cannot be liquidated, and it belongs in the README.

### Worked example, no corporate action
```
collateral 10.00000000 TSLAx   strike 400.00000000   settle S = 500.00000000
payout_raw    = 10 * (500 - 400) / 500 = 2.00000000 TSLAx   -> worth $1000
remainder_raw = 8.00000000 TSLAx                            -> worth $4000
```
The buyer's $1000 equals `(S - K) * N = 100 * 10`. Exactly a call payoff.

### Worked example, 2-for-1 split between write and expiry
```
at write:  multiplier 1.0, strike 450.00000000, collateral 10 raw
split:     issuer sets multiplier 2.0, so 1 raw token now represents 2 shares and S halves
at settle: multiplier_now 2.0, S = 300.00000000
adjusted_strike = 450 * 1.0 / 2.0 = 225.00000000
payout_raw = 10 * (300 - 225) / 300 = 2.50000000 raw
```
Each raw token is worth `2 * 300 = $600`, so the buyer receives $1500. Pre-split coordinates give `S = 600`, `K = 450`, `payout = 10 * 150 / 600 = 2.5` tokens at $600 each, the same $1500. The economics survive the split.

**Do not skip this.** Without the adjustment a split silently moves every strike by the split ratio, and whoever is on the wrong side of it loses real money. It is roughly twenty lines.

---

## 4. Oracle verification

Preferred path, `pyth-solana-receiver-sdk`:
```rust
let feed: Account<PriceUpdateV2> = ...;              // owner check is the account constraint
let p = feed.get_price_no_older_than(
    &Clock::get()?, market.max_staleness_secs as u64, &market.feed_id)?;
```
Three checks come free: the account is owned by `rec5EK…`, the feed id matches the market, and the price is inside the staleness window.

**Fallback if the crate fights Anchor 0.32.** Deserialize by hand. The layout is verified and the account is a fixed 134 bytes:
```
offset  0   8   anchor discriminator
offset  8  32   write_authority
offset 40   1   verification_level
offset 41  32   feed_id
offset 73   8   price            i64  LE
offset 81   8   conf             u64  LE
offset 89   4   exponent         i32  LE
offset 93   8   publish_time     i64  LE
offset 101  8   prev_publish_time
offset 109  8   ema_price
offset 117  8   ema_conf
```
Assert `account.owner == rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`, the feed id, `exponent == -8`, and `clock.unix_timestamp - publish_time <= max_staleness_secs`. The manual path is about thirty lines and removes a dependency risk on the one block that has no fallback.

**Never relax the owner check.** The devnet mirror described in the plan's §4 is a separate mirror program that owns its own account, registered as a distinct market. The verification code is identical on both networks.

---

## 5. Reading the multiplier

The effective multiplier is not simply `multiplier`:
```
effective(t) = if t >= new_multiplier_effective_timestamp { new_multiplier } else { multiplier }
```
Read it through `StateWithExtensions::<Mint>::unpack` and `get_extension::<ScaledUiAmountConfig>()`. Store the `f64` bits in `Offer.multiplier_at_write`.

The UI must surface a pending change. `newMultiplierEffectiveTimestamp` falling between write and expiry means the position's economics will shift, and the writer deserves to see that before signing.

---

## 6. Errors

```
StaleOracle          price older than max_staleness_secs
WrongFeed            feed id does not match the market
BadExponent          oracle exponent is not -8
NotExpired           settle or reclaim called before expiry_ts
AlreadySettled       offer state is not what the instruction requires
OfferNotOpen         bid or accept on a filled offer
BelowMinPremium      accept_bid on a bid under min_premium
ExpiryTooSoon        expiry_ts - now < config.min_duration
MintPaused           the underlying's pausable extension is engaged
MarketDisabled       admin has turned the market off
Unauthorized         signer is not the writer or the authority
MathOverflow         u128 intermediate overflowed
```

`MintPaused` is not decoration. The issuer can pause transfers, and a `settle` that cannot move tokens must fail cleanly and stay retryable rather than half-execute.

---

## 7. What the program does not guard, and who eats it

Stated plainly, because the plan's §5 requires it and because a judge will ask.

| Risk | Guarded by the program | Who bears it |
|---|---|---|
| Oracle stale at expiry | Yes, `settle` fails and retries | Nobody, settlement waits |
| Weekend or holiday expiry | No, the UI restricts the picker | The writer, if the UI is bypassed |
| Issuer pauses the mint | Yes, fails cleanly | Both, until the pause lifts |
| Issuer uses `permanentDelegate` on the vault | **No. Cannot be guarded.** | The writer and the buyer |
| Stock split during the position | Yes, §3 adjusts the strike | Nobody |
| Thin pool when the buyer sells the payout | No | The buyer |

The `permanentDelegate` row is the honest one. The issuer can move tokens out of any account holding this asset, including our vault. That is true of every xStocks position, in this product or outside it, and the README says so rather than implying a custody guarantee that does not exist.
