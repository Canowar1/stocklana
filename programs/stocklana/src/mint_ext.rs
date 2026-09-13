//! Token-2022 extension reads on the underlying mint.
//!
//! Two extensions on the xStocks mints change how this program has to behave.
//!
//! `scaledUiAmountConfig` is how the issuer applies corporate actions. The
//! effective multiplier is not the `multiplier` field on its own: once
//! `new_multiplier_effective_timestamp` has passed, `new_multiplier` is the one
//! in force. NVDAx already sits at 1.0017, so treating raw amounts as share
//! counts is wrong today, not hypothetically.
//!
//! `pausableConfig` lets the issuer stop all transfers. Settlement has to fail
//! cleanly and stay retryable rather than half-execute.

use crate::errors::StocklanaError;
use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        pausable::PausableConfig, scaled_ui_amount::ScaledUiAmountConfig, BaseStateWithExtensions,
        StateWithExtensions,
    },
    state::Mint as SplMint,
};

/// Effective scaledUiAmount multiplier at `now`. Returns 1.0 when the mint
/// carries no such extension.
pub fn effective_multiplier(mint_ai: &AccountInfo, now: i64) -> Result<f64> {
    let data = mint_ai.try_borrow_data()?;
    let state = StateWithExtensions::<SplMint>::unpack(&data)
        .map_err(|_| error!(StocklanaError::BadMintDecimals))?;
    let m = match state.get_extension::<ScaledUiAmountConfig>() {
        Ok(cfg) => {
            let effective_ts: i64 = cfg.new_multiplier_effective_timestamp.into();
            let value: f64 = if now >= effective_ts {
                cfg.new_multiplier.into()
            } else {
                cfg.multiplier.into()
            };
            value
        }
        Err(_) => 1.0,
    };
    require!(m > 0.0 && m.is_finite(), StocklanaError::MathOverflow);
    Ok(m)
}

/// Fails if the mint's pausable extension is engaged.
pub fn require_not_paused(mint_ai: &AccountInfo) -> Result<()> {
    let data = mint_ai.try_borrow_data()?;
    let state = StateWithExtensions::<SplMint>::unpack(&data)
        .map_err(|_| error!(StocklanaError::BadMintDecimals))?;
    if let Ok(cfg) = state.get_extension::<PausableConfig>() {
        require!(!bool::from(cfg.paused), StocklanaError::MintPaused);
    }
    Ok(())
}
