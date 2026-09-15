# Security and correctness review

Run 16 September 2026 against `programs/stocklana/src/` at commit time, using the `review-and-iterate` rubric. Six findings, all fixed in the same pass. Every fix is covered by a test.

**Security: B+ → A−.** **Quality: A−.** **Ready for mainnet: not yet**, and §7 says what is still missing.

---

## Findings

### 1. The config was front-runnable on a fresh deploy — P1, fixed

`init_config` created the protocol authority PDA and accepted whoever signed first. Anyone watching for the deploy transaction could have claimed the authority before the deployer did, and the authority registers markets and sets the fee destination.

Fixed by requiring the signer to be the program's own upgrade authority:

```rust
#[account(constraint = program.programdata_address()? == Some(program_data.key()))]
pub program: Program<'info, program::Stocklana>,
#[account(
    constraint = program_data.upgrade_authority_address == Some(authority.key())
        @ StocklanaError::Unauthorized
)]
pub program_data: Account<'info, ProgramData>,
```

### 2. The oracle confidence interval was read and then ignored — P1, fixed

`docs/BUILD_PLAN.md` §6 rule 6 says settlement must not silently use a price with a wide band. The program read `conf`, emitted it in the `Settled` event, and gated nothing on it. A price Pyth itself flagged as uncertain would have settled a position at full confidence.

`Market` now carries `max_conf_bps` and `settle` enforces it:

```rust
pub fn require_confidence(price: u64, conf: u64, max_conf_bps: u16) -> Result<()> {
    if max_conf_bps == 0 { return Ok(()); }
    let bps = (conf as u128).checked_mul(10_000)?.checked_div(price as u128)?;
    require!(bps <= max_conf_bps as u128, StocklanaError::OracleConfidenceTooWide);
    Ok(())
}
```

TSLAX publishes a band around 2.3 bps, so the configured ceiling of 100 bps is generous and still catches a genuinely disputed price.

### 3. Rent was stranded forever — P2, fixed

No account was ever closed. Every settled position left its collateral vault on-chain holding roughly 0.002 SOL of rent that nobody could recover. `settle` and `reclaim` now close the vault and return the rent, and the integration tests assert the account is gone rather than merely empty.

The `Offer` account is deliberately **not** closed. It is the settlement receipt: the price used, the adjusted strike and the payout stay readable on-chain.

### 4. There was no way to close a market, and no migration path — P2, fixed

Nothing could close a `Market`, and an account written under an older layout cannot be loaded by any typed instruction at all, so it could not even be cleaned up. This was not hypothetical: adding `max_conf_bps` made the already-deployed devnet market undeserializable, and the deployment could not be repaired.

Three additions:

- `close_market`, which refuses unless the market is disabled **and** `open_offers == 0`. `Market` now tracks `open_offers`, incremented by `write_call` and decremented by `settle` and `reclaim`. Closing a market with live offers would make their collateral unreachable.
- `close_config`.
- `admin_close_account`, an escape hatch for an account whose layout no longer matches. It is authorised by the **upgrade authority**, not by the config, so it still works when the config itself is the stale account. It grants no new power, since anyone who can replace the program can already do anything to its accounts, and it moves no tokens: collateral lives in SPL token accounts owned by vault PDAs, which it cannot touch.

### 5. Settlement rounding always favours the writer — P3, documented and tested

Integer division truncates, so the buyer can be short by up to one base unit, which is 1e-8 of a share at 8 decimals. This is the difference between the 0.99999999 TSLAx the test observes and a round 1.00000000. It is bounded, it is in the writer's favour every time, and it is now asserted in a test rather than discovered by a user.

### 6. The strike adjustment uses f64 — P3, accepted with a reason

`adjust_strike` multiplies by the ratio of two `f64` multipliers, because Token-2022 stores `scaledUiAmountConfig.multiplier` as an `f64`. The float is therefore unavoidable at the boundary. For strikes below about 9e15 base units an `f64` mantissa is exact, which covers every realistic price, and the result is bounds-checked before the cast. Moving to fixed-point would be an improvement and is not a correctness bug today.

---

## What the review did not find

Stated because a review that only lists problems is not informative:

- Every instruction that moves value checks its signer. `settle` is permissionless on purpose, and that is the safe direction: if only the buyer could settle, an out-of-the-money buyer could strand the writer's collateral by never calling it.
- Every PDA is derived with seeds that Anchor verifies, and every vault's authority is the PDA itself.
- All settlement arithmetic uses `u128` intermediates with `checked_*`, and the payout is additionally asserted to be at most the collateral before any transfer.
- The oracle account's owner, feed id and exponent are verified on every read, and the owner check is never relaxed for devnet.
- `init_if_needed` appears only on associated token accounts, where the address is constrained to the canonical ATA, so there is no account an attacker could substitute.
- The `Settled` event records the price, the adjusted strike, the publish time and the confidence, so every settlement is auditable after the fact.

---

## Not fixed, and why

**The writer can bid on their own offer and accept it.** The only cost is the protocol fee. This is wash trading, it inflates any premium statistic computed from on-chain data, and it cannot be prevented outright because a writer can always use a second wallet. The honest response is to not publish a premium statistic that assumes arm's-length counterparties, and to disclose the seeded counterparty in the demo. Blocking `bidder == writer` would be security theatre.

**The issuer's `permanentDelegate` can empty the vault.** Unguardable at the program level, and true of every xStocks position in or out of this product. If it happens, `settle` fails cleanly and stays retryable rather than half-executing. Disclosed in `docs/ARCHITECTURE.md` §7.

---

## Before mainnet

1. Fuzz `settlement_split` and `adjust_strike` with Trident across the full `u64` range.
2. Have the upgrade authority be a multisig, not a single key. The current devnet deployer is a single key whose secret was pasted into a chat, so it must not be reused on mainnet.
3. Decide whether the upgrade authority is retained or burned. Retaining it means users trust the holder; burning it means no bug can ever be fixed.
4. Re-check `max_conf_bps` and `max_staleness_secs` per market against the real feed behaviour rather than the single value used everywhere today.
