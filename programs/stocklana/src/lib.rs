//! Stocklana: a covered-call market for tokenized equity on Solana.
//!
//! A holder locks a Token-2022 equity token and writes one call against it.
//! Anyone can escrow a USDC premium bid. The writer accepts one. At expiry the
//! program reads a Pyth price account and splits the locked collateral, paying
//! the buyer in the underlying itself.
//!
//! Collateral is the stock, so the writer monetises a position they already
//! hold rather than posting new capital, and the payout is provably bounded by
//! the collateral at every price. See `docs/ARCHITECTURE.md`.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

pub mod errors;
pub mod math;
pub mod mint_ext;
pub mod oracle;
pub mod state;

use errors::StocklanaError;
use state::*;

declare_id!("EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ");

/// The settlement split is a ratio, `collateral * (S - K) / S`, so it is
/// dimensionless and correct for any mint decimals. Only `transfer_checked`
/// cares, and it reads the mint. The cap exists so an absurd mint cannot
/// overflow the u128 intermediates.
pub const MAX_UNDERLYING_DECIMALS: u8 = 18;

#[program]
pub mod stocklana {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        fee_bps: u16,
        min_duration: i64,
    ) -> Result<()> {
        require!(fee_bps <= 10_000, StocklanaError::FeeTooHigh);
        require!(min_duration > 0, StocklanaError::ExpiryTooSoon);
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.fee_bps = fee_bps;
        c.fee_destination = ctx.accounts.fee_destination.key();
        c.min_duration = min_duration;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Registers an underlying and its oracle. The feed account is verified
    /// here so that `settle` can trust the market record later.
    pub fn add_market(
        ctx: Context<AddMarket>,
        feed_id: [u8; 32],
        max_staleness_secs: u32,
    ) -> Result<()> {
        require!(
            ctx.accounts.underlying_mint.decimals <= MAX_UNDERLYING_DECIMALS,
            StocklanaError::BadMintDecimals
        );
        require!(max_staleness_secs > 0, StocklanaError::StaleOracle);

        // Verifies owner, feed id and exponent. Staleness is deliberately
        // waived here: a market for an equity may legitimately be registered
        // over a weekend, when the feed is 32 hours old.
        let now = Clock::get()?.unix_timestamp;
        let _ = oracle::read_price(&ctx.accounts.feed_account, &feed_id, u32::MAX, now)?;

        let m = &mut ctx.accounts.market;
        m.underlying_mint = ctx.accounts.underlying_mint.key();
        m.premium_mint = ctx.accounts.premium_mint.key();
        m.feed_account = ctx.accounts.feed_account.key();
        m.feed_id = feed_id;
        m.max_staleness_secs = max_staleness_secs;
        m.enabled = true;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn set_market_enabled(ctx: Context<SetMarketEnabled>, enabled: bool) -> Result<()> {
        ctx.accounts.market.enabled = enabled;
        Ok(())
    }

    /// Locks collateral and writes one call against it.
    pub fn write_call(
        ctx: Context<WriteCall>,
        offer_id: u64,
        collateral_amount: u64,
        strike_usd: u64,
        expiry_ts: i64,
        min_premium: u64,
    ) -> Result<()> {
        require!(ctx.accounts.market.enabled, StocklanaError::MarketDisabled);
        require!(collateral_amount > 0, StocklanaError::ZeroCollateral);
        require!(strike_usd > 0, StocklanaError::ZeroStrike);

        let now = Clock::get()?.unix_timestamp;
        require!(expiry_ts > now, StocklanaError::ExpiryInPast);
        require!(
            expiry_ts
                .checked_sub(now)
                .ok_or(StocklanaError::MathOverflow)?
                >= ctx.accounts.config.min_duration,
            StocklanaError::ExpiryTooSoon
        );

        mint_ext::require_not_paused(&ctx.accounts.underlying_mint.to_account_info())?;
        let multiplier =
            mint_ext::effective_multiplier(&ctx.accounts.underlying_mint.to_account_info(), now)?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.writer_token_account.to_account_info(),
                    mint: ctx.accounts.underlying_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.writer.to_account_info(),
                },
            ),
            collateral_amount,
            ctx.accounts.underlying_mint.decimals,
        )?;

        let o = &mut ctx.accounts.offer;
        o.market = ctx.accounts.market.key();
        o.writer = ctx.accounts.writer.key();
        o.offer_id = offer_id;
        o.collateral_amount = collateral_amount;
        o.strike_usd = strike_usd;
        o.expiry_ts = expiry_ts;
        o.min_premium = min_premium;
        o.multiplier_at_write = multiplier.to_bits();
        o.state = OfferState::Open;
        o.buyer = Pubkey::default();
        o.premium_paid = 0;
        o.settled_price = 0;
        o.settled_strike = 0;
        o.payout_amount = 0;
        o.bump = ctx.bumps.offer;
        o.vault_bump = ctx.bumps.vault;

        emit!(CallWritten {
            offer: o.key(),
            market: o.market,
            writer: o.writer,
            collateral_amount,
            strike_usd,
            expiry_ts,
            multiplier: o.multiplier_at_write,
        });
        Ok(())
    }

    /// Escrows a USDC premium bid against an open offer.
    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.offer.state == OfferState::Open,
            StocklanaError::BadOfferState
        );
        require!(
            amount >= ctx.accounts.offer.min_premium,
            StocklanaError::BelowMinPremium
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now < ctx.accounts.offer.expiry_ts, StocklanaError::NotExpired);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.premium_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bidder_token_account.to_account_info(),
                    mint: ctx.accounts.premium_mint.to_account_info(),
                    to: ctx.accounts.bid_vault.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.premium_mint.decimals,
        )?;

        let b = &mut ctx.accounts.bid;
        b.offer = ctx.accounts.offer.key();
        b.bidder = ctx.accounts.bidder.key();
        b.amount = amount;
        b.state = BidState::Active;
        b.created_at = now;
        b.bump = ctx.bumps.bid;
        b.vault_bump = ctx.bumps.bid_vault;

        emit!(BidPlaced {
            offer: b.offer,
            bidder: b.bidder,
            amount
        });
        Ok(())
    }

    /// The writer takes one bid. Premium settles immediately, minus the fee.
    pub fn accept_bid(ctx: Context<AcceptBid>) -> Result<()> {
        require!(
            ctx.accounts.offer.state == OfferState::Open,
            StocklanaError::BadOfferState
        );
        require!(
            ctx.accounts.bid.state == BidState::Active,
            StocklanaError::BadBidState
        );
        require!(
            ctx.accounts.bid.amount >= ctx.accounts.offer.min_premium,
            StocklanaError::BelowMinPremium
        );

        let amount = ctx.accounts.bid.amount;
        let (to_writer, fee) = math::premium_split(amount, ctx.accounts.config.fee_bps)?;

        let offer_key = ctx.accounts.offer.key();
        let bidder_key = ctx.accounts.bid.bidder;
        let vault_bump = ctx.accounts.bid.vault_bump;
        let seeds: &[&[u8]] = &[
            b"bid_vault",
            offer_key.as_ref(),
            bidder_key.as_ref(),
            &[vault_bump],
        ];
        let signer: &[&[&[u8]]] = &[seeds];
        let decimals = ctx.accounts.premium_mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.premium_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bid_vault.to_account_info(),
                    mint: ctx.accounts.premium_mint.to_account_info(),
                    to: ctx.accounts.writer_premium_account.to_account_info(),
                    authority: ctx.accounts.bid_vault.to_account_info(),
                },
                signer,
            ),
            to_writer,
            decimals,
        )?;

        if fee > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.premium_token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.bid_vault.to_account_info(),
                        mint: ctx.accounts.premium_mint.to_account_info(),
                        to: ctx.accounts.fee_destination.to_account_info(),
                        authority: ctx.accounts.bid_vault.to_account_info(),
                    },
                    signer,
                ),
                fee,
                decimals,
            )?;
        }

        ctx.accounts.bid.state = BidState::Won;
        let o = &mut ctx.accounts.offer;
        o.state = OfferState::Filled;
        o.buyer = bidder_key;
        o.premium_paid = amount;

        emit!(BidAccepted {
            offer: offer_key,
            buyer: bidder_key,
            premium: amount,
            fee
        });
        Ok(())
    }

    /// Withdraws an escrowed bid that has not been accepted.
    pub fn cancel_bid(ctx: Context<RefundBid>) -> Result<()> {
        require!(
            ctx.accounts.bid.state == BidState::Active,
            StocklanaError::BadBidState
        );
        require!(
            ctx.accounts.offer.state == OfferState::Open,
            StocklanaError::BadOfferState
        );
        refund(&ctx)?;
        ctx.accounts.bid.state = BidState::Cancelled;
        Ok(())
    }

    /// Refunds a losing bid once the offer has been filled, or any active bid
    /// after expiry.
    pub fn refund_bid(ctx: Context<RefundBid>) -> Result<()> {
        require!(
            ctx.accounts.bid.state == BidState::Active,
            StocklanaError::BadBidState
        );
        let now = Clock::get()?.unix_timestamp;
        let offer_settled = ctx.accounts.offer.state != OfferState::Open;
        require!(
            offer_settled || now >= ctx.accounts.offer.expiry_ts,
            StocklanaError::BadOfferState
        );
        refund(&ctx)?;
        ctx.accounts.bid.state = BidState::Refunded;
        Ok(())
    }

    /// Settles an accepted call after expiry. Permissionless on purpose: if
    /// only the buyer could call this, an out-of-the-money buyer would simply
    /// never call it and the writer's collateral would stay locked forever.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.offer.state == OfferState::Filled,
            StocklanaError::BadOfferState
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.offer.expiry_ts, StocklanaError::NotExpired);

        mint_ext::require_not_paused(&ctx.accounts.underlying_mint.to_account_info())?;

        let market = &ctx.accounts.market;
        let price = oracle::read_price(
            &ctx.accounts.feed_account,
            &market.feed_id,
            market.max_staleness_secs,
            now,
        )?;

        let mult_now =
            mint_ext::effective_multiplier(&ctx.accounts.underlying_mint.to_account_info(), now)?;
        let mult_at_write = f64::from_bits(ctx.accounts.offer.multiplier_at_write);
        let strike = math::adjust_strike(ctx.accounts.offer.strike_usd, mult_at_write, mult_now)?;

        let (payout, remainder) =
            math::settlement_split(ctx.accounts.offer.collateral_amount, price.price, strike)?;

        let offer_key = ctx.accounts.offer.key();
        let vault_bump = ctx.accounts.offer.vault_bump;
        let seeds: &[&[u8]] = &[b"vault", offer_key.as_ref(), &[vault_bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        let decimals = ctx.accounts.underlying_mint.decimals;

        if payout > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.underlying_mint.to_account_info(),
                        to: ctx.accounts.buyer_token_account.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer,
                ),
                payout,
                decimals,
            )?;
        }

        if remainder > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.underlying_mint.to_account_info(),
                        to: ctx.accounts.writer_token_account.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer,
                ),
                remainder,
                decimals,
            )?;
        }

        let o = &mut ctx.accounts.offer;
        o.state = OfferState::Settled;
        o.settled_price = price.price;
        o.settled_strike = strike;
        o.payout_amount = payout;

        emit!(Settled {
            offer: offer_key,
            settle_price: price.price,
            adjusted_strike: strike,
            publish_time: price.publish_time,
            confidence: price.conf,
            payout_to_buyer: payout,
            returned_to_writer: remainder,
        });
        Ok(())
    }

    /// Returns collateral to the writer when the offer expired without a buyer.
    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        require!(
            ctx.accounts.offer.state == OfferState::Open,
            StocklanaError::BadOfferState
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.offer.expiry_ts, StocklanaError::NotExpired);
        mint_ext::require_not_paused(&ctx.accounts.underlying_mint.to_account_info())?;

        let offer_key = ctx.accounts.offer.key();
        let vault_bump = ctx.accounts.offer.vault_bump;
        let seeds: &[&[u8]] = &[b"vault", offer_key.as_ref(), &[vault_bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        let amount = ctx.accounts.offer.collateral_amount;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.underlying_mint.to_account_info(),
                    to: ctx.accounts.writer_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            amount,
            ctx.accounts.underlying_mint.decimals,
        )?;

        ctx.accounts.offer.state = OfferState::Reclaimed;
        Ok(())
    }
}

fn refund(ctx: &Context<RefundBid>) -> Result<()> {
    let offer_key = ctx.accounts.offer.key();
    let bidder_key = ctx.accounts.bid.bidder;
    let vault_bump = ctx.accounts.bid.vault_bump;
    let seeds: &[&[u8]] = &[
        b"bid_vault",
        offer_key.as_ref(),
        bidder_key.as_ref(),
        &[vault_bump],
    ];
    let signer: &[&[&[u8]]] = &[seeds];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.premium_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.bid_vault.to_account_info(),
                mint: ctx.accounts.premium_mint.to_account_info(),
                to: ctx.accounts.bidder_token_account.to_account_info(),
                authority: ctx.accounts.bid_vault.to_account_info(),
            },
            signer,
        ),
        ctx.accounts.bid.amount,
        ctx.accounts.premium_mint.decimals,
    )
}

// ---------------------------------------------------------------- contexts

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub fee_destination: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct AddMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ StocklanaError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", underlying_mint.key().as_ref(), feed_id.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub underlying_mint: InterfaceAccount<'info, Mint>,
    pub premium_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: owner, feed id and exponent are verified in `oracle::read_price`.
    pub feed_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetMarketEnabled<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ StocklanaError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct WriteCall<'info> {
    #[account(mut)]
    pub writer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        has_one = underlying_mint @ StocklanaError::WrongFeed,
        constraint = market.enabled @ StocklanaError::MarketDisabled
    )]
    pub market: Account<'info, Market>,
    pub underlying_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = writer,
        space = 8 + Offer::INIT_SPACE,
        seeds = [b"offer", market.key().as_ref(), writer.key().as_ref(), &offer_id.to_le_bytes()],
        bump
    )]
    pub offer: Account<'info, Offer>,
    #[account(
        init,
        payer = writer,
        seeds = [b"vault", offer.key().as_ref()],
        bump,
        token::mint = underlying_mint,
        token::authority = vault,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = writer_token_account.mint == underlying_mint.key() @ StocklanaError::WrongFeed,
        constraint = writer_token_account.owner == writer.key() @ StocklanaError::Unauthorized
    )]
    pub writer_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(has_one = premium_mint @ StocklanaError::WrongFeed)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market @ StocklanaError::BadOfferState)]
    pub offer: Account<'info, Offer>,
    pub premium_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = bidder,
        space = 8 + Bid::INIT_SPACE,
        seeds = [b"bid", offer.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    #[account(
        init,
        payer = bidder,
        seeds = [b"bid_vault", offer.key().as_ref(), bidder.key().as_ref()],
        bump,
        token::mint = premium_mint,
        token::authority = bid_vault,
        token::token_program = premium_token_program
    )]
    pub bid_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = bidder_token_account.mint == premium_mint.key() @ StocklanaError::WrongFeed,
        constraint = bidder_token_account.owner == bidder.key() @ StocklanaError::Unauthorized
    )]
    pub bidder_token_account: InterfaceAccount<'info, TokenAccount>,
    pub premium_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptBid<'info> {
    #[account(mut)]
    pub writer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = premium_mint @ StocklanaError::WrongFeed)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market @ StocklanaError::BadOfferState,
        has_one = writer @ StocklanaError::Unauthorized
    )]
    pub offer: Account<'info, Offer>,
    #[account(
        mut,
        has_one = offer @ StocklanaError::BadBidState,
        seeds = [b"bid", offer.key().as_ref(), bid.bidder.as_ref()],
        bump = bid.bump
    )]
    pub bid: Account<'info, Bid>,
    #[account(
        mut,
        seeds = [b"bid_vault", offer.key().as_ref(), bid.bidder.as_ref()],
        bump = bid.vault_bump
    )]
    pub bid_vault: InterfaceAccount<'info, TokenAccount>,
    pub premium_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = writer_premium_account.mint == premium_mint.key() @ StocklanaError::WrongFeed,
        constraint = writer_premium_account.owner == writer.key() @ StocklanaError::Unauthorized
    )]
    pub writer_premium_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        address = config.fee_destination @ StocklanaError::Unauthorized
    )]
    pub fee_destination: InterfaceAccount<'info, TokenAccount>,
    pub premium_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RefundBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(has_one = market @ StocklanaError::BadOfferState)]
    pub offer: Account<'info, Offer>,
    #[account(
        mut,
        has_one = offer @ StocklanaError::BadBidState,
        has_one = bidder @ StocklanaError::Unauthorized,
        seeds = [b"bid", offer.key().as_ref(), bidder.key().as_ref()],
        bump = bid.bump
    )]
    pub bid: Account<'info, Bid>,
    #[account(
        mut,
        seeds = [b"bid_vault", offer.key().as_ref(), bidder.key().as_ref()],
        bump = bid.vault_bump
    )]
    pub bid_vault: InterfaceAccount<'info, TokenAccount>,
    pub premium_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = bidder_token_account.mint == premium_mint.key() @ StocklanaError::WrongFeed,
        constraint = bidder_token_account.owner == bidder.key() @ StocklanaError::Unauthorized
    )]
    pub bidder_token_account: InterfaceAccount<'info, TokenAccount>,
    pub premium_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Anyone may push settlement through. They pay for the buyer's token
    /// account if it does not exist yet.
    #[account(mut)]
    pub cranker: Signer<'info>,
    #[account(
        has_one = underlying_mint @ StocklanaError::WrongFeed,
        has_one = feed_account @ StocklanaError::WrongFeed
    )]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market @ StocklanaError::BadOfferState)]
    pub offer: Account<'info, Offer>,
    pub underlying_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: verified against `market.feed_id` inside `oracle::read_price`.
    pub feed_account: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault", offer.key().as_ref()],
        bump = offer.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: only used as the ATA owner, matched against `offer.buyer`.
    #[account(address = offer.buyer @ StocklanaError::Unauthorized)]
    pub buyer: UncheckedAccount<'info>,
    /// `init_if_needed` is safe here: the address is constrained to the
    /// canonical associated token account for this mint and authority, so
    /// there is no account an attacker could substitute, and a token account
    /// cannot be re-initialised to reset state.
    #[account(
        init_if_needed,
        payer = cranker,
        associated_token::mint = underlying_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: only used as the ATA owner, matched against `offer.writer`.
    #[account(address = offer.writer @ StocklanaError::Unauthorized)]
    pub writer: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = cranker,
        associated_token::mint = underlying_mint,
        associated_token::authority = writer,
        associated_token::token_program = token_program
    )]
    pub writer_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(mut)]
    pub writer: Signer<'info>,
    #[account(has_one = underlying_mint @ StocklanaError::WrongFeed)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market @ StocklanaError::BadOfferState,
        has_one = writer @ StocklanaError::Unauthorized
    )]
    pub offer: Account<'info, Offer>,
    pub underlying_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", offer.key().as_ref()],
        bump = offer.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = writer_token_account.mint == underlying_mint.key() @ StocklanaError::WrongFeed,
        constraint = writer_token_account.owner == writer.key() @ StocklanaError::Unauthorized
    )]
    pub writer_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ------------------------------------------------------------------ events

#[event]
pub struct CallWritten {
    pub offer: Pubkey,
    pub market: Pubkey,
    pub writer: Pubkey,
    pub collateral_amount: u64,
    pub strike_usd: u64,
    pub expiry_ts: i64,
    pub multiplier: u64,
}

#[event]
pub struct BidPlaced {
    pub offer: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BidAccepted {
    pub offer: Pubkey,
    pub buyer: Pubkey,
    pub premium: u64,
    pub fee: u64,
}

#[event]
pub struct Settled {
    pub offer: Pubkey,
    pub settle_price: u64,
    pub adjusted_strike: u64,
    pub publish_time: i64,
    pub confidence: u64,
    pub payout_to_buyer: u64,
    pub returned_to_writer: u64,
}
