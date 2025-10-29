use anchor_lang::prelude::*;
use anchor_spl::token::{
    self, Mint, Token, TokenAccount, Transfer, CloseAccount,
};

declare_id!("RoREscrow1111111111111111111111111111111111"); // beim Deploy ersetzen

const FEE_BPS: u16 = 1200; // 12% Plattform-Fee (Basis 10000)
const THREAD_SEED: &[u8] = b"thread";
const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod ror_escrow {
    use super::*;

    pub fn initialize_thread(
        ctx: Context<InitializeThread>,
        amount: u64,
        deadline_ts: i64,
    ) -> Result<()> {
        require!(amount > 0, RorError::InvalidAmount);
        require!(deadline_ts > Clock::get()?.unix_timestamp, RorError::InvalidDeadline);

        // setze state
        let state = &mut ctx.accounts.thread_state;
        state.fan = ctx.accounts.fan.key();
        state.creator = ctx.accounts.creator.key();
        state.platform = ctx.accounts.platform.key();
        state.mint = ctx.accounts.mint.key();
        state.amount = amount;
        state.deadline_ts = deadline_ts;
        state.answered = false;

        // pull USDC vom Fan in den Vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.fan_ata.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.fan.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    pub fn reply_and_release(ctx: Context<ReplyAndRelease>) -> Result<()> {
        // nur Creator darf auslösen & nur vor Refund
        require!(!ctx.accounts.thread_state.answered, RorError::AlreadyAnswered);
        require!(
            Clock::get()?.unix_timestamp <= ctx.accounts.thread_state.deadline_ts,
            RorError::TooLate
        );
        require_keys_eq!(ctx.accounts.creator.key(), ctx.accounts.thread_state.creator);

        // berechne Fee/Payout
        let amount = ctx.accounts.thread_state.amount;
        let fee = amount.saturating_mul(FEE_BPS as u64) / 10_000;
        let to_creator = amount.saturating_sub(fee);

        let seeds = &[
            THREAD_SEED,
            ctx.accounts.thread_state.fan.as_ref(),
            ctx.accounts.thread_state.creator.as_ref(),
            ctx.accounts.mint.key().as_ref(),
            &[ctx.accounts.thread_state.bump],
        ];
        let signer = &[&seeds[..]];

        // payout an creator
        {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.creator_ata.to_account_info(),
                authority: ctx.accounts.thread_state.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            );
            token::transfer(cpi_ctx, to_creator)?;
        }
        // fee an platform
        {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.platform_ata.to_account_info(),
                authority: ctx.accounts.thread_state.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            );
            token::transfer(cpi_ctx, fee)?;
        }

        // markiere beantwortet
        ctx.accounts.thread_state.answered = true;

        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        require!(!ctx.accounts.thread_state.answered, RorError::AlreadyAnswered);
        require!(
            Clock::get()?.unix_timestamp > ctx.accounts.thread_state.deadline_ts,
            RorError::TooEarly
        );

        let seeds = &[
            THREAD_SEED,
            ctx.accounts.thread_state.fan.as_ref(),
            ctx.accounts.thread_state.creator.as_ref(),
            ctx.accounts.mint.key().as_ref(),
            &[ctx.accounts.thread_state.bump],
        ];
        let signer = &[&seeds[..]];

        // zurück an Fan
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.fan_ata.to_account_info(),
            authority: ctx.accounts.thread_state.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, ctx.accounts.thread_state.amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, deadline_ts: i64)]
pub struct InitializeThread<'info> {
    #[account(mut)]
    pub fan: Signer<'info>,
    /// CHECK: off-chain verified creator wallet
    pub creator: UncheckedAccount<'info>,
    /// CHECK: platform fee wallet
    pub platform: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>, // USDC mint

    #[account(
        init,
        payer = fan,
        seeds = [THREAD_SEED, fan.key().as_ref(), creator.key().as_ref(), mint.key().as_ref()],
        bump,
        space = 8 + ThreadState::SIZE
    )]
    pub thread_state: Account<'info, ThreadState>,

    #[account(
        init_if_needed,
        payer = fan,
        seeds = [VAULT_SEED, thread_state.key().as_ref(), mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = thread_state
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fan_ata: Account<'info, TokenAccount>, // fan USDC

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ReplyAndRelease<'info> {
    pub creator: Signer<'info>,

    #[account(mut)]
    pub thread_state: Account<'info, ThreadState>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [VAULT_SEED, thread_state.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator_ata: Account<'info, TokenAccount>,

    /// CHECK: platform fee wallet
    pub platform: UncheckedAccount<'info>,
    #[account(mut)]
    pub platform_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    /// anyone can trigger; or keep as signer to fan
    #[account(mut)]
    pub thread_state: Account<'info, ThreadState>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [VAULT_SEED, thread_state.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fan_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct ThreadState {
    pub fan: Pubkey,
    pub creator: Pubkey,
    pub platform: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub deadline_ts: i64,
    pub answered: bool,
    pub bump: u8,
}
impl ThreadState {
    pub const SIZE: usize = 32+32+32+32 + 8 + 8 + 1 + 1;
}

#[error_code]
pub enum RorError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid deadline")]
    InvalidDeadline,
    #[msg("Thread already answered")]
    AlreadyAnswered,
    #[msg("Deadline passed")]
    TooLate,
    #[msg("Deadline not reached")]
    TooEarly,
}
