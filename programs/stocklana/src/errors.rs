use anchor_lang::prelude::*;

#[error_code]
pub enum StocklanaError {
    #[msg("Oracle price is older than the market's max staleness")]
    StaleOracle,
    #[msg("Oracle account feed id does not match the market")]
    WrongFeed,
    #[msg("Oracle exponent is not -8")]
    BadExponent,
    #[msg("Oracle account is not owned by the Pyth receiver program")]
    BadOracleOwner,
    #[msg("Oracle price is not positive")]
    BadOraclePrice,
    #[msg("Oracle confidence interval is wider than the market allows")]
    OracleConfidenceTooWide,
    #[msg("Offer has not reached its expiry yet")]
    NotExpired,
    #[msg("Offer has already expired")]
    OfferExpired,
    #[msg("Offer is not in the required state for this instruction")]
    BadOfferState,
    #[msg("Bid is not in the required state for this instruction")]
    BadBidState,
    #[msg("Bid amount is below the offer's minimum premium")]
    BelowMinPremium,
    #[msg("Expiry is sooner than the configured minimum duration")]
    ExpiryTooSoon,
    #[msg("Expiry is already in the past")]
    ExpiryInPast,
    #[msg("The underlying mint is paused, transfers cannot settle")]
    MintPaused,
    #[msg("Market is disabled by the authority")]
    MarketDisabled,
    #[msg("Market still has outstanding offers and cannot be closed")]
    MarketHasOpenOffers,
    #[msg("Market must be disabled before it can be closed")]
    MarketStillEnabled,
    #[msg("Signer is not authorised for this action")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("The corporate-action adjustment would reduce the strike to zero")]
    StrikeAdjustedToZero,
    #[msg("Collateral amount must be greater than zero")]
    ZeroCollateral,
    #[msg("Strike must be greater than zero")]
    ZeroStrike,
    #[msg("Fee in basis points exceeds 100%")]
    FeeTooHigh,
    #[msg("Underlying mint has more decimals than the program supports")]
    BadMintDecimals,
}
