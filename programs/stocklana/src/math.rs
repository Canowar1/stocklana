//! Settlement arithmetic. Every intermediate is u128.
//!
//! A covered call's payout, expressed in the underlying itself, is
//!
//!     payout = collateral * (S - K) / S
//!
//! which is strictly less than `collateral` for every `S > K`, because
//! `(S - K) / S < 1`. The vault therefore can never owe more than it holds.
//! That is the structural reason this position cannot be liquidated.

use crate::errors::StocklanaError;
use anchor_lang::prelude::*;

/// Adjusts a strike for a corporate action that moved the mint's
/// scaledUiAmount multiplier between write and settlement.
///
/// A 2-for-1 split doubles the multiplier, so one raw token comes to represent
/// two shares and the per-share oracle price halves. The strike has to halve
/// with it or the position silently reprices by the split ratio.
pub fn adjust_strike(strike: u64, mult_at_write: f64, mult_now: f64) -> Result<u64> {
    require!(mult_now > 0.0, StocklanaError::MathOverflow);
    require!(mult_at_write > 0.0, StocklanaError::MathOverflow);
    if mult_at_write == mult_now {
        return Ok(strike);
    }
    let ratio = mult_at_write / mult_now;
    let adjusted = (strike as f64) * ratio;
    require!(
        adjusted.is_finite() && adjusted >= 0.0 && adjusted <= u64::MAX as f64,
        StocklanaError::MathOverflow
    );
    Ok(adjusted as u64)
}

/// Splits the collateral between buyer and writer at settlement.
/// Returns `(payout_to_buyer, remainder_to_writer)` in raw base units.
pub fn settlement_split(collateral: u64, settle_price: u64, strike: u64) -> Result<(u64, u64)> {
    require!(settle_price > 0, StocklanaError::BadOraclePrice);
    if settle_price <= strike {
        return Ok((0, collateral));
    }
    let intrinsic = (settle_price as u128)
        .checked_sub(strike as u128)
        .ok_or(StocklanaError::MathOverflow)?;
    let payout = (collateral as u128)
        .checked_mul(intrinsic)
        .ok_or(StocklanaError::MathOverflow)?
        .checked_div(settle_price as u128)
        .ok_or(StocklanaError::MathOverflow)?;
    let payout = u64::try_from(payout).map_err(|_| error!(StocklanaError::MathOverflow))?;
    // Invariant: a covered call never owes more than the collateral.
    require!(payout <= collateral, StocklanaError::MathOverflow);
    let remainder = collateral
        .checked_sub(payout)
        .ok_or(StocklanaError::MathOverflow)?;
    Ok((payout, remainder))
}

/// Rejects a price whose confidence band is wider than `max_conf_bps` of the
/// price itself. Pyth widens the band when its publishers disagree, which is
/// exactly when a settlement should not be forced through.
pub fn require_confidence(price: u64, conf: u64, max_conf_bps: u16) -> Result<()> {
    if max_conf_bps == 0 {
        return Ok(());
    }
    require!(price > 0, StocklanaError::BadOraclePrice);
    let bps = (conf as u128)
        .checked_mul(10_000)
        .ok_or(StocklanaError::MathOverflow)?
        .checked_div(price as u128)
        .ok_or(StocklanaError::MathOverflow)?;
    require!(
        bps <= max_conf_bps as u128,
        StocklanaError::OracleConfidenceTooWide
    );
    Ok(())
}

/// Splits an accepted premium into the writer's share and the protocol fee.
pub fn premium_split(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    require!(fee_bps <= 10_000, StocklanaError::FeeTooHigh);
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(StocklanaError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StocklanaError::MathOverflow)?;
    let fee = u64::try_from(fee).map_err(|_| error!(StocklanaError::MathOverflow))?;
    let to_writer = amount.checked_sub(fee).ok_or(StocklanaError::MathOverflow)?;
    Ok((to_writer, fee))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn in_the_money_matches_the_worked_example() {
        // 10 TSLAx at 8 decimals, strike $400, settle $500.
        let (payout, rest) = settlement_split(10_00000000, 500_00000000, 400_00000000).unwrap();
        assert_eq!(payout, 2_00000000);
        assert_eq!(rest, 8_00000000);
    }

    #[test]
    fn out_of_the_money_returns_everything_to_the_writer() {
        let (payout, rest) = settlement_split(10_00000000, 380_00000000, 400_00000000).unwrap();
        assert_eq!(payout, 0);
        assert_eq!(rest, 10_00000000);
    }

    #[test]
    fn at_the_money_pays_nothing() {
        let (payout, rest) = settlement_split(10_00000000, 400_00000000, 400_00000000).unwrap();
        assert_eq!(payout, 0);
        assert_eq!(rest, 10_00000000);
    }

    #[test]
    fn payout_never_exceeds_collateral_even_at_absurd_prices() {
        let collateral = 10_00000000u64;
        for settle in [401_00000000u64, 10_000_00000000, u64::MAX / 2] {
            let (payout, rest) = settlement_split(collateral, settle, 400_00000000).unwrap();
            assert!(payout < collateral, "payout {payout} >= collateral");
            assert_eq!(payout + rest, collateral);
        }
    }

    #[test]
    fn two_for_one_split_preserves_economics() {
        // Written at multiplier 1.0 with a $450 strike, settled after a 2:1
        // split at multiplier 2.0 with the oracle at $300 per post-split share.
        let adjusted = adjust_strike(450_00000000, 1.0, 2.0).unwrap();
        assert_eq!(adjusted, 225_00000000);
        let (payout, rest) = settlement_split(10_00000000, 300_00000000, adjusted).unwrap();
        assert_eq!(payout, 2_50000000);
        assert_eq!(rest, 7_50000000);
        // Each raw token is worth 2 * $300. Buyer receives 2.5 * $600 = $1500.
        // Pre-split coordinates: S=$600, K=$450, payout = 10*150/600 = 2.5
        // tokens at $600 each, the same $1500.
        let pre = settlement_split(10_00000000, 600_00000000, 450_00000000).unwrap();
        assert_eq!(pre.0, payout);
    }

    #[test]
    fn confidence_gate_accepts_a_tight_band_and_rejects_a_wide_one() {
        // TSLAX at probe time: $365.23 with a $0.0853 band, about 2.3 bps.
        assert!(require_confidence(365_23000000, 8_533118, 100).is_ok());
        // A band ten percent of the price is refused at a 1% ceiling.
        assert!(require_confidence(365_23000000, 36_523000000, 100).is_err());
        // Zero disables the gate.
        assert!(require_confidence(365_23000000, 36_523000000, 0).is_ok());
    }

    #[test]
    fn settlement_rounding_favours_the_writer_by_at_most_one_base_unit() {
        // Integer division truncates, so the buyer can be short by up to one
        // base unit. At 8 decimals that is 1e-8 of a share.
        let (payout, rest) = settlement_split(10_00000000, 365_23000000, 328_70700000).unwrap();
        let exact = 10_00000000f64 * (365.23 - 328.707) / 365.23;
        assert!((exact - payout as f64) < 1.0);
        assert_eq!(payout + rest, 10_00000000);
    }

    #[test]
    fn premium_fee_is_taken_from_the_premium_only() {
        let (writer, fee) = premium_split(1_000_000, 50).unwrap(); // 1 USDC, 0.5%
        assert_eq!(fee, 5_000);
        assert_eq!(writer, 995_000);
        assert_eq!(writer + fee, 1_000_000);
    }
}
