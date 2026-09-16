use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    /// Basis points taken from an accepted premium.
    pub fee_bps: u16,
    /// USDC token account that receives the fee.
    pub fee_destination: Pubkey,
    /// Minimum seconds between writing a call and its expiry.
    pub min_duration: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Token-2022 mint of the underlying, 8 decimals.
    pub underlying_mint: Pubkey,
    /// Mint the premium is paid in, USDC, 6 decimals.
    pub premium_mint: Pubkey,
    /// Pyth `PriceUpdateV2` account, owned by the receiver program.
    pub feed_account: Pubkey,
    pub feed_id: [u8; 32],
    /// The program that owned the feed account when this market was registered.
    /// Recorded rather than assumed, and re-checked on every settlement, so a
    /// feed cannot change hands underneath a live position. On a real Pyth
    /// market this is the receiver program; anything else is a mirror and the
    /// interface says so.
    pub feed_owner: Pubkey,
    pub max_staleness_secs: u32,
    /// Ceiling on the oracle's confidence interval as a fraction of the price,
    /// in basis points. A settlement price whose band is wider than this is
    /// refused. Pyth publishes confidence for a reason and a wide band means
    /// the publishers disagree.
    pub max_conf_bps: u16,
    /// Offers written against this market that have not yet settled or been
    /// reclaimed. A market cannot be closed while any are outstanding, because
    /// closing it would make their collateral unrecoverable.
    pub open_offers: u32,
    pub enabled: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OfferState {
    Open,
    Filled,
    Settled,
    Reclaimed,
}

#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub market: Pubkey,
    pub writer: Pubkey,
    pub offer_id: u64,
    /// Raw base units of the underlying locked in the vault.
    pub collateral_amount: u64,
    /// USD per UI unit, scaled by 1e8.
    pub strike_usd: u64,
    pub expiry_ts: i64,
    /// USDC base units.
    pub min_premium: u64,
    /// f64 bits of the mint's effective scaledUiAmount multiplier at write time.
    /// Used to adjust the strike if a corporate action moves the multiplier.
    pub multiplier_at_write: u64,
    pub state: OfferState,
    pub buyer: Pubkey,
    pub premium_paid: u64,
    /// Oracle price used at settlement, scaled by 1e8. Zero until settled.
    pub settled_price: u64,
    /// Strike after the multiplier adjustment, written at settlement.
    pub settled_strike: u64,
    pub payout_amount: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum BidState {
    Active,
    Cancelled,
    Won,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub offer: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub state: BidState,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}
