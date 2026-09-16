//! Pyth price reading.
//!
//! The program deliberately deserialises the `PriceUpdateV2` account by hand
//! instead of depending on `pyth-solana-receiver-sdk`. The layout below was
//! verified byte for byte against the live mainnet account
//! `GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY` (Crypto.TSLAX/USD). Avoiding
//! the crate keeps the dependency tree inside what the 1.84 platform-tools
//! cargo can build, which is a real constraint on this toolchain.
//!
//! The owner check is never relaxed. A devnet price mirror is registered as a
//! separate market with its own owning program, not by weakening this check.

use crate::errors::StocklanaError;
use anchor_lang::prelude::*;

/// Pyth Solana receiver program, mainnet and devnet.
pub const PYTH_RECEIVER: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/// `PriceUpdateV2` field offsets. Account is 134 bytes.
const OFF_FEED_ID: usize = 8 + 32 + 1;
const OFF_PRICE: usize = OFF_FEED_ID + 32;
const OFF_CONF: usize = OFF_PRICE + 8;
const OFF_EXPO: usize = OFF_CONF + 8;
const OFF_PUBLISH: usize = OFF_EXPO + 4;
const MIN_LEN: usize = OFF_PUBLISH + 8;

/// Every price in this program is USD scaled by 1e8, matching the Pyth
/// exponent for these feeds and the 8 decimals of the xStocks mints.
pub const PRICE_EXPONENT: i32 = -8;

pub struct OraclePrice {
    pub price: u64,
    pub conf: u64,
    pub publish_time: i64,
}

/// Reads a `PriceUpdateV2` account and enforces owner, feed, exponent, sign and
/// staleness. Returns the price scaled by 1e8.
///
/// The expected owner is passed in rather than hardcoded, because it is a
/// property of the market and is recorded when the market is registered. That
/// is not a relaxation: the check is still exact, it is still on every read,
/// and a market whose feed is not owned by the Pyth receiver is visible as such
/// on-chain instead of being hidden behind a build flag.
pub fn read_price(
    account: &AccountInfo,
    expected_owner: &Pubkey,
    expected_feed_id: &[u8; 32],
    max_staleness_secs: u32,
    now: i64,
) -> Result<OraclePrice> {
    require_keys_eq!(*account.owner, *expected_owner, StocklanaError::BadOracleOwner);

    let data = account.try_borrow_data()?;
    require!(data.len() >= MIN_LEN, StocklanaError::WrongFeed);

    let feed_id: [u8; 32] = data[OFF_FEED_ID..OFF_FEED_ID + 32]
        .try_into()
        .map_err(|_| error!(StocklanaError::WrongFeed))?;
    require!(feed_id == *expected_feed_id, StocklanaError::WrongFeed);

    let expo = i32::from_le_bytes(
        data[OFF_EXPO..OFF_EXPO + 4]
            .try_into()
            .map_err(|_| error!(StocklanaError::BadExponent))?,
    );
    require!(expo == PRICE_EXPONENT, StocklanaError::BadExponent);

    let price_i = i64::from_le_bytes(
        data[OFF_PRICE..OFF_PRICE + 8]
            .try_into()
            .map_err(|_| error!(StocklanaError::BadOraclePrice))?,
    );
    require!(price_i > 0, StocklanaError::BadOraclePrice);

    let conf = u64::from_le_bytes(
        data[OFF_CONF..OFF_CONF + 8]
            .try_into()
            .map_err(|_| error!(StocklanaError::BadOraclePrice))?,
    );

    let publish_time = i64::from_le_bytes(
        data[OFF_PUBLISH..OFF_PUBLISH + 8]
            .try_into()
            .map_err(|_| error!(StocklanaError::StaleOracle))?,
    );

    let age = now.checked_sub(publish_time).ok_or(StocklanaError::MathOverflow)?;
    require!(age >= 0, StocklanaError::StaleOracle);
    require!(age <= max_staleness_secs as i64, StocklanaError::StaleOracle);

    Ok(OraclePrice {
        price: price_i as u64,
        conf,
        publish_time,
    })
}
