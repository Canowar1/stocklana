//! A devnet-only price mirror.
//!
//! Pyth's sponsored equity feeds exist on Solana mainnet and not on devnet, so
//! there is no honest way to demonstrate an equity market on devnet against a
//! real feed. This program holds an account laid out exactly like a Pyth
//! `PriceUpdateV2` and a relayer copies the bytes of a real mainnet feed into
//! it.
//!
//! Two things make this a disclosure rather than a disguise.
//!
//! The account is owned by *this* program, not by the Pyth receiver. Stocklana
//! records a market's feed owner when the market is registered and re-checks it
//! on every settlement, so a mirrored market is identifiably mirrored on-chain
//! and the interface labels it. Nothing about the verification in the main
//! program is weakened.
//!
//! The mirrored values carry the source feed id and the source publish time
//! unchanged, so the staleness and confidence guards behave exactly as they
//! would against the real feed. A mirror of a stale price is still stale.

use anchor_lang::prelude::*;

declare_id!("DrPTosRsyyhxFgyLotPuRgpTjAD1gGoHRmAkwMDPTLNP");

/// Byte-for-byte the layout Stocklana reads, so the mirrored account is
/// indistinguishable in shape from the real thing.
pub const PRICE_UPDATE_V2_LEN: usize = 134;

#[program]
pub mod stocklana_mirror {
    use super::*;

    pub fn init_feed(ctx: Context<InitFeed>, feed_id: [u8; 32]) -> Result<()> {
        let f = &mut ctx.accounts.feed;
        f.authority = ctx.accounts.authority.key();
        f.feed_id = feed_id;
        f.last_pushed_at = 0;
        f.bump = ctx.bumps.feed;
        Ok(())
    }

    /// Empties an account this program owns, returning its rent.
    ///
    /// Needed because a `MirrorFeed` written under an older layout cannot be
    /// loaded by any typed instruction, which is exactly the account that most
    /// needs clearing. Authorised by the upgrade authority, which grants no
    /// power that authority did not already have, and touches nothing but this
    /// program's own accounts.
    pub fn admin_close(ctx: Context<AdminCloseAccounts>) -> Result<()> {
        let target = &ctx.accounts.target;
        let dest = &ctx.accounts.authority;
        let lamports = target.lamports();
        **target.try_borrow_mut_lamports()? = 0;
        **dest.try_borrow_mut_lamports()? = dest
            .lamports()
            .checked_add(lamports)
            .ok_or(MirrorError::BadPrice)?;
        let mut data = target.try_borrow_mut_data()?;
        for byte in data.iter_mut().take(8) {
            *byte = 0;
        }
        Ok(())
    }

    /// Copies one observation from a source feed. The relayer passes the values
    /// it read from mainnet; it cannot invent a feed id, because the id is
    /// fixed when the feed account is created and is checked here.
    pub fn push_price(
        ctx: Context<PushPrice>,
        feed_id: [u8; 32],
        price: i64,
        conf: u64,
        exponent: i32,
        publish_time: i64,
        prev_publish_time: i64,
        ema_price: i64,
        ema_conf: u64,
    ) -> Result<()> {
        require!(feed_id == ctx.accounts.feed.feed_id, MirrorError::WrongFeed);
        require!(price > 0, MirrorError::BadPrice);

        // A mirror must never look fresher than its source. Refusing to move
        // backwards also stops a stale replay from reopening a closed window.
        require!(
            publish_time >= ctx.accounts.feed.last_publish_time,
            MirrorError::PublishTimeWentBackwards
        );
        require!(
            publish_time <= Clock::get()?.unix_timestamp + 60,
            MirrorError::PublishTimeInFuture
        );

        let f = &mut ctx.accounts.feed;
        f.last_publish_time = publish_time;
        f.last_pushed_at = Clock::get()?.unix_timestamp;
        f.updates = f.updates.saturating_add(1);

        let mut data = ctx.accounts.price_account.try_borrow_mut_data()?;
        require!(data.len() >= PRICE_UPDATE_V2_LEN, MirrorError::BadAccountSize);

        // Discriminator and write authority are left as written at creation;
        // only the message body is refreshed.
        let mut o = 8 + 32 + 1;
        data[o..o + 32].copy_from_slice(&feed_id);           o += 32;
        data[o..o + 8].copy_from_slice(&price.to_le_bytes()); o += 8;
        data[o..o + 8].copy_from_slice(&conf.to_le_bytes());  o += 8;
        data[o..o + 4].copy_from_slice(&exponent.to_le_bytes()); o += 4;
        data[o..o + 8].copy_from_slice(&publish_time.to_le_bytes()); o += 8;
        data[o..o + 8].copy_from_slice(&prev_publish_time.to_le_bytes()); o += 8;
        data[o..o + 8].copy_from_slice(&ema_price.to_le_bytes()); o += 8;
        data[o..o + 8].copy_from_slice(&ema_conf.to_le_bytes());

        emit!(PriceMirrored {
            feed_id, price, conf, publish_time,
            pushed_at: f.last_pushed_at,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct AdminCloseAccounts<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: must be owned by this program; emptied and its discriminator
    /// wiped. Guarded by the upgrade-authority constraint below.
    #[account(mut, owner = crate::ID @ MirrorError::Unauthorized)]
    pub target: UncheckedAccount<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, program::StocklanaMirror>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key())
            @ MirrorError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,
}

#[account]
#[derive(InitSpace)]
pub struct MirrorFeed {
    pub authority: Pubkey,
    pub feed_id: [u8; 32],
    /// Publish time of the source observation, copied from mainnet.
    pub last_publish_time: i64,
    /// When the relayer last pushed, by this chain's clock. Distinct from the
    /// field above and the distinction is the whole point: a source that has
    /// not printed since Friday and a relayer that died on Saturday look
    /// identical from the price alone. This is the relayer's heartbeat.
    pub last_pushed_at: i64,
    pub updates: u64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct InitFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + MirrorFeed::INIT_SPACE,
        seeds = [b"feed", feed_id.as_ref()],
        bump
    )]
    pub feed: Account<'info, MirrorFeed>,
    /// The mirrored account itself. Owned by this program and shaped like a
    /// `PriceUpdateV2`.
    #[account(
        init,
        payer = authority,
        space = PRICE_UPDATE_V2_LEN,
        seeds = [b"price", feed_id.as_ref()],
        bump
    )]
    /// CHECK: written as raw bytes in the Pyth layout, never deserialised here.
    pub price_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct PushPrice<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"feed", feed_id.as_ref()],
        bump = feed.bump,
        has_one = authority @ MirrorError::Unauthorized
    )]
    pub feed: Account<'info, MirrorFeed>,
    #[account(mut, seeds = [b"price", feed_id.as_ref()], bump)]
    /// CHECK: written as raw bytes in the Pyth layout.
    pub price_account: UncheckedAccount<'info>,
}

#[event]
pub struct PriceMirrored {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub publish_time: i64,
    pub pushed_at: i64,
}

#[error_code]
pub enum MirrorError {
    #[msg("Feed id does not match this mirror feed")]
    WrongFeed,
    #[msg("Only the feed authority may push")]
    Unauthorized,
    #[msg("Mirrored price must be positive")]
    BadPrice,
    #[msg("Publish time is older than the last mirrored one")]
    PublishTimeWentBackwards,
    #[msg("Publish time is in the future")]
    PublishTimeInFuture,
    #[msg("Price account is smaller than a PriceUpdateV2")]
    BadAccountSize,
}
