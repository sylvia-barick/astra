//! Dharma Yuddha — hidden-move warrior duels on MagicBlock Private Ephemeral Rollups.
//!
//! Two players pick a warrior of the epic's armies (never the revered central
//! figures) and stake SOL. Each beat both secretly lock in a move — Strike,
//! Heavy, Guard, Evade or Astra — inside the TEE, where neither the opponent
//! nor the RPC can read it. `reveal_beat` resolves both moves on-chain, then
//! the browser plays the exchange in 3D. Spectators back a side in a
//! pari-mutuel pool that closes when the duel is delegated to the rollup.
//! A VRF "omen" grants one side bonus prana at the start.
//!
//! Layering (same pattern as MagicBlock's private Rock-Paper-Scissors):
//!   base layer : create_duel, join_duel, place_bet, begin (+ delegate), claim_pot, claim_bet, cancel_duel
//!   rollup (ER): init_permission, request_omen/callback_omen, make_choice, reveal_beat, next_beat,
//!                claim_timeout, undelegate_all
//!
//! The rules in `resolve_beat` are mirrored in `src/duel/rules.js` (keep in sync).

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::access_control::instructions::{
    CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi,
};
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, EphemeralPermission, Member, AUTHORITY_FLAG, TX_LOGS_FLAG,
};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_scoped_randomness_ix, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;

declare_id!("CKEg1c51J8rK8pr3Ka8hNNMkarmUPjTf5UcHAH5THwnu");

pub const DUEL_SEED: &[u8] = b"duel";
pub const MOVE_SEED: &[u8] = b"beat_move";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POOL_SEED: &[u8] = b"pool";
pub const BET_VAULT_SEED: &[u8] = b"bet_vault";
pub const BET_SEED: &[u8] = b"bet";

// ---- Rules (mirror of src/duel/rules.js) ----
pub const STRIKE: u8 = 0;
pub const HEAVY: u8 = 1;
pub const GUARD: u8 = 2;
pub const EVADE: u8 = 3;
pub const ASTRA: u8 = 4;
pub const NONE: u8 = 255;
pub const DRAW: u8 = 2;

pub const START_PRANA: u8 = 20;
pub const OMEN_PRANA: u8 = 25;
pub const BEAT_PRANA: u16 = 15;
pub const STALL_PRANA: u16 = 10;
pub const MAX_BEATS: u8 = 40;
pub const BEAT_TIMEOUT_SECS: i64 = 90;
/// Ashoka Vatika, Lanka, Ayodhya (Ram Setu is deliberately excluded).
pub const NUM_ARENAS: u8 = 3;

#[derive(Clone, Copy)]
pub struct FighterStats {
    pub hp: u16,
    pub strike: u16,
    pub heavy: u16,
    pub parry: u16,
    pub counter: u16,
    pub astra: u16,
    pub cost: u8,
}

/// 0 Angada, 1 Neela (Vanara Sena) · 2 Indrajit, 3 Kumbhakarna (Rakshasa Sena)
pub const FIGHTER_STATS: [FighterStats; 4] = [
    FighterStats { hp: 110, strike: 11, heavy: 18, parry: 10, counter: 6, astra: 26, cost: 60 },
    FighterStats { hp: 100, strike: 12, heavy: 17, parry: 7, counter: 9, astra: 26, cost: 50 },
    FighterStats { hp: 95, strike: 10, heavy: 16, parry: 7, counter: 7, astra: 32, cost: 50 },
    FighterStats { hp: 130, strike: 10, heavy: 23, parry: 8, counter: 4, astra: 28, cost: 70 },
];

/// Damage dealt by fighter `f` playing move `m` against opponent move `t`.
pub fn dealt(f: &FighterStats, m: u8, t: u8) -> u16 {
    match m {
        STRIKE => match t {
            HEAVY | EVADE => f.strike,
            STRIKE => f.strike / 2,
            _ => 0,
        },
        HEAVY => match t {
            GUARD => f.heavy,
            HEAVY => f.heavy / 2,
            _ => 0,
        },
        GUARD => if t == STRIKE { f.parry } else { 0 },
        EVADE => if t == HEAVY || t == ASTRA { f.counter } else { 0 },
        ASTRA => match t {
            STRIKE | HEAVY => f.astra,
            GUARD | ASTRA => f.astra / 2,
            _ => 0,
        },
        _ => 0,
    }
}

fn is_stall(m: u8) -> bool {
    m == GUARD || m == EVADE
}

/// Applies one beat to the duel. Prana for an astra must already be checked.
pub fn resolve_beat(d: &mut Duel, m1: u8, m2: u8) {
    let f1 = FIGHTER_STATS[d.fighter1 as usize];
    let f2 = FIGHTER_STATS[d.fighter2 as usize];
    if m1 == ASTRA { d.prana1 = d.prana1.saturating_sub(f1.cost); }
    if m2 == ASTRA { d.prana2 = d.prana2.saturating_sub(f2.cost); }
    let taken1 = dealt(&f2, m2, m1);
    let taken2 = dealt(&f1, m1, m2);
    d.hp1 = d.hp1.saturating_sub(taken1);
    d.hp2 = d.hp2.saturating_sub(taken2);
    let stall = if is_stall(m1) && is_stall(m2) { STALL_PRANA } else { 0 };
    d.prana1 = (d.prana1 as u16 + BEAT_PRANA + taken1 / 2 + stall).min(100) as u8;
    d.prana2 = (d.prana2 as u16 + BEAT_PRANA + taken2 / 2 + stall).min(100) as u8;
    d.last_move1 = m1;
    d.last_move2 = m2;
    d.last_taken1 = taken1;
    d.last_taken2 = taken2;
    d.beat = d.beat.saturating_add(1);
    d.winner = if d.hp1 == 0 && d.hp2 == 0 {
        DRAW
    } else if d.hp1 == 0 {
        1
    } else if d.hp2 == 0 {
        0
    } else if d.beat >= MAX_BEATS {
        if d.hp1 == d.hp2 { DRAW } else if d.hp1 > d.hp2 { 0 } else { 1 }
    } else {
        NONE
    };
}

#[ephemeral]
#[program]
pub mod dharma_yuddha {
    use super::*;

    // ---------------- Base layer ----------------

    /// Create a duel, pick a warrior and stake SOL (0 = friendly). Pre-funds the
    /// rent the Duel and the creator's move PDA need for their TEE permissions.
    /// `session` is a short-lived key the wallet authorises to sign moves on the
    /// rollup, so the player approves one wallet popup instead of one per beat.
    pub fn create_duel(ctx: Context<CreateDuel>, game_id: u64, stake: u64, fighter: u8, session: Pubkey) -> Result<()> {
        require!((fighter as usize) < FIGHTER_STATS.len(), DuelError::BadFighter);
        let sys = ctx.accounts.system_program.key();
        let p1 = ctx.accounts.player1.to_account_info();
        transfer(
            CpiContext::new(sys, Transfer { from: p1.clone(), to: ctx.accounts.duel.to_account_info() }),
            ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(0) as u32),
        )?;
        transfer(
            CpiContext::new(sys, Transfer { from: p1.clone(), to: ctx.accounts.player_move.to_account_info() }),
            ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(1) as u32),
        )?;
        if stake > 0 {
            transfer(CpiContext::new(sys, Transfer { from: p1, to: ctx.accounts.vault.to_account_info() }), stake)?;
        }

        let d = &mut ctx.accounts.duel;
        d.game_id = game_id;
        d.player1 = ctx.accounts.player1.key();
        d.player2 = None;
        d.session1 = session;
        d.session2 = Pubkey::default();
        d.fighter1 = fighter;
        d.fighter2 = 0;
        d.stake = stake;
        d.paid = false;
        d.started = false;
        d.winner = NONE;
        d.omen = NONE;
        d.arena = (game_id % NUM_ARENAS as u64) as u8;
        d.last_move1 = NONE;
        d.last_move2 = NONE;

        let pool = &mut ctx.accounts.pool;
        pool.game_id = game_id;
        pool.total1 = 0;
        pool.total2 = 0;
        pool.bettors = 0;
        pool.settled = false;
        pool.winner = NONE;

        let mv = &mut ctx.accounts.player_move;
        mv.game_id = game_id;
        mv.player = d.player1;
        mv.choice = None;
        msg!("Duel {} created: fighter {} stake {}", game_id, fighter, stake);
        Ok(())
    }

    /// Second player joins with their own warrior and matches the stake.
    pub fn join_duel(ctx: Context<JoinDuel>, game_id: u64, fighter: u8, session: Pubkey) -> Result<()> {
        require!((fighter as usize) < FIGHTER_STATS.len(), DuelError::BadFighter);
        let player = ctx.accounts.player.key();
        let sys = ctx.accounts.system_program.key();
        {
            let d = &ctx.accounts.duel;
            require!(!d.paid, DuelError::Settled);
            require!(d.player1 != player, DuelError::CannotJoinOwn);
            require!(d.player2.is_none(), DuelError::Full);
        }
        transfer(
            CpiContext::new(sys, Transfer { from: ctx.accounts.player.to_account_info(), to: ctx.accounts.player_move.to_account_info() }),
            ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(1) as u32),
        )?;
        let stake = ctx.accounts.duel.stake;
        if stake > 0 {
            transfer(
                CpiContext::new(sys, Transfer { from: ctx.accounts.player.to_account_info(), to: ctx.accounts.vault.to_account_info() }),
                stake,
            )?;
        }
        let d = &mut ctx.accounts.duel;
        d.player2 = Some(player);
        d.session2 = session;
        d.fighter2 = fighter;
        let mv = &mut ctx.accounts.player_move;
        mv.game_id = game_id;
        mv.player = player;
        mv.choice = None;
        msg!("{} joined duel {} with fighter {}", player, game_id, fighter);
        Ok(())
    }

    /// Spectator backs side 0 (player 1) or 1 (player 2). Only while the duel
    /// is still on the base layer and not begun — delegating it closes betting.
    pub fn place_bet(ctx: Context<PlaceBet>, _game_id: u64, side: u8, amount: u64) -> Result<()> {
        require!(side <= 1, DuelError::BadSide);
        require!(amount > 0, DuelError::ZeroBet);
        let d = &ctx.accounts.duel;
        require!(d.player2.is_some(), DuelError::MissingOpponent);
        require!(!d.started && !d.paid, DuelError::BettingClosed);
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer { from: ctx.accounts.bettor.to_account_info(), to: ctx.accounts.bet_vault.to_account_info() },
            ),
            amount,
        )?;
        let pool = &mut ctx.accounts.pool;
        if side == 0 { pool.total1 = pool.total1.checked_add(amount).ok_or(DuelError::Overflow)?; }
        else { pool.total2 = pool.total2.checked_add(amount).ok_or(DuelError::Overflow)?; }
        pool.bettors = pool.bettors.saturating_add(1);
        let bet = &mut ctx.accounts.bet;
        bet.game_id = d.game_id;
        bet.bettor = ctx.accounts.bettor.key();
        bet.side = side;
        bet.amount = amount;
        bet.claimed = false;
        msg!("Bet {} lamports on side {}", amount, side);
        Ok(())
    }

    /// Either player starts the war: locks bets and sets health/prana. The client
    /// sends `delegate_pda(Duel)` in the same transaction.
    pub fn begin_duel(ctx: Context<BeginDuel>) -> Result<()> {
        let d = &mut ctx.accounts.duel;
        require!(d.player2.is_some(), DuelError::MissingOpponent);
        require!(d.side_of(&ctx.accounts.payer.key()).is_some(), DuelError::NotAPlayer);
        require!(!d.started, DuelError::AlreadyStarted);
        d.started = true;
        d.hp1 = FIGHTER_STATS[d.fighter1 as usize].hp;
        d.hp2 = FIGHTER_STATS[d.fighter2 as usize].hp;
        d.prana1 = START_PRANA;
        d.prana2 = START_PRANA;
        d.beat = 0;
        d.revealed = false;
        d.beat_started_at = Clock::get()?.unix_timestamp;
        msg!("Duel {} begins", d.game_id);
        Ok(())
    }

    /// Base layer, after `undelegate_all`: pay the winner the pot (or refund both
    /// on a draw) and settle the spectator pool. Anyone may trigger it.
    pub fn claim_pot(ctx: Context<ClaimPot>) -> Result<()> {
        let d = &mut ctx.accounts.duel;
        require!(d.winner != NONE, DuelError::NotDecided);
        require!(!d.paid, DuelError::AlreadyPaid);
        let p2 = d.player2.ok_or(DuelError::MissingOpponent)?;
        require!(ctx.accounts.player1.key() == d.player1, DuelError::WrongPlayer);
        require!(ctx.accounts.player2.key() == p2, DuelError::WrongPlayer);
        d.paid = true;
        let pool = &mut ctx.accounts.pool;
        pool.settled = true;
        pool.winner = d.winner;

        if d.stake > 0 {
            let id = d.game_id.to_le_bytes();
            let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &id, &[ctx.bumps.vault]]];
            let vault = &ctx.accounts.vault;
            let sys = &ctx.accounts.system_program;
            let pot = d.stake.checked_mul(2).ok_or(DuelError::Overflow)?;
            match d.winner {
                0 => pay_from_vault(vault, &ctx.accounts.player1.to_account_info(), pot, sys, seeds)?,
                1 => pay_from_vault(vault, &ctx.accounts.player2.to_account_info(), pot, sys, seeds)?,
                _ => {
                    pay_from_vault(vault, &ctx.accounts.player1.to_account_info(), d.stake, sys, seeds)?;
                    pay_from_vault(vault, &ctx.accounts.player2.to_account_info(), d.stake, sys, seeds)?;
                }
            }
        }
        msg!("Duel {} settled, winner {}", d.game_id, d.winner);
        Ok(())
    }

    /// Spectator collects: stake back plus a pro-rata share of the losing side.
    /// Draws, or a side nobody backed, refund every bet.
    pub fn claim_bet(ctx: Context<ClaimBet>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(pool.settled, DuelError::NotDecided);
        let bet = &mut ctx.accounts.bet;
        require!(!bet.claimed, DuelError::AlreadyPaid);
        bet.claimed = true;
        let (win_total, lose_total) = match pool.winner {
            0 => (pool.total1, pool.total2),
            1 => (pool.total2, pool.total1),
            _ => (0, 0),
        };
        let payout: u64 = if pool.winner == DRAW || win_total == 0 {
            bet.amount
        } else if bet.side == pool.winner {
            let share = (bet.amount as u128) * (lose_total as u128) / (win_total as u128);
            bet.amount.checked_add(share as u64).ok_or(DuelError::Overflow)?
        } else {
            0
        };
        if payout > 0 {
            let id = pool.game_id.to_le_bytes();
            let seeds: &[&[&[u8]]] = &[&[BET_VAULT_SEED, &id, &[ctx.bumps.bet_vault]]];
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.key(),
                    Transfer { from: ctx.accounts.bet_vault.to_account_info(), to: ctx.accounts.bettor.to_account_info() },
                    seeds,
                ),
                payout,
            )?;
        }
        msg!("Bet claimed: {} lamports", payout);
        Ok(())
    }

    /// Refund the creator if nobody joined.
    pub fn cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
        let d = &mut ctx.accounts.duel;
        require!(ctx.accounts.player1.key() == d.player1, DuelError::WrongPlayer);
        require!(d.player2.is_none(), DuelError::AlreadyStarted);
        require!(!d.paid, DuelError::AlreadyPaid);
        d.paid = true;
        if d.stake > 0 {
            let id = d.game_id.to_le_bytes();
            let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &id, &[ctx.bumps.vault]]];
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.key(),
                    Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.player1.to_account_info() },
                    seeds,
                ),
                d.stake,
            )?;
        }
        Ok(())
    }

    /// Delegate the Duel or a move PDA to the (TEE) ephemeral rollup.
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seed_data = seeds_for(&account_type);
        let seed_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        ctx.accounts.delegate_pda(&ctx.accounts.payer, &seed_refs, DelegateConfig { validator, ..Default::default() })?;
        Ok(())
    }

    // ---------------- Ephemeral rollup ----------------

    /// Create the TEE permission for a delegated PDA. `members = None` → public
    /// (the Duel, so spectators can watch health); `Some([owner])` → private (moves).
    pub fn init_permission(ctx: Context<InitPermission>, account_type: AccountType, members: Option<Vec<Member>>) -> Result<()> {
        if ctx.accounts.permission.lamports() > 0 {
            msg!("Permission already exists");
            return Ok(());
        }
        let seed_data = seeds_for(&account_type);
        let (_, bump) = Pubkey::find_program_address(&seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(), &crate::ID);
        let mut seeds = seed_data.clone();
        seeds.push(vec![bump]);
        let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
        let (is_private, members) = match members {
            Some(m) => (true, m),
            None => (false, vec![]),
        };
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.permissioned_account.to_account_info(),
            permissioned_account: ctx.accounts.permissioned_account.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs { is_private, members },
        }
        .invoke_signed(&[seed_refs.as_slice()])?;
        Ok(())
    }

    /// Ask the VRF oracle for the battle omen (once, before the first beat).
    pub fn request_omen(ctx: Context<RequestOmen>, client_seed: u8) -> Result<()> {
        let d = &ctx.accounts.duel;
        require!(d.started && d.beat == 0 && d.omen == NONE, DuelError::OmenClosed);
        let ix = create_request_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::CallbackOmen::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![SerializableAccountMeta { pubkey: d.key(), is_signer: false, is_writable: true }]),
            ..Default::default()
        });
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback: a verifiably random side is blessed with bonus prana and
    /// the battlefield is chosen.
    pub fn callback_omen(ctx: Context<CallbackOmen>, randomness: [u8; 32]) -> Result<()> {
        let d = &mut ctx.accounts.duel;
        if d.omen != NONE || d.beat != 0 {
            return Ok(());
        }
        let side = ephemeral_rollups_sdk::vrf::rnd::random_u8_with_range(&randomness, 0, 1);
        d.omen = side;
        d.arena = randomness[31] % NUM_ARENAS;
        if side == 0 { d.prana1 = d.prana1.saturating_add(OMEN_PRANA); } else { d.prana2 = d.prana2.saturating_add(OMEN_PRANA); }
        msg!("Omen favours side {}; battlefield {}", side, d.arena);
        Ok(())
    }

    /// Lock in a hidden move. The move PDA is private to its owner in the TEE.
    pub fn make_choice(ctx: Context<MakeChoice>, _game_id: u64, choice: u8) -> Result<()> {
        require!(choice <= ASTRA, DuelError::BadMove);
        let d = &ctx.accounts.duel;
        require!(d.started && d.winner == NONE && !d.revealed, DuelError::NotInBeat);
        let owner = ctx.accounts.owner.key();
        let signer = ctx.accounts.signer.key();
        let side = if owner == d.player1 { 0 } else if Some(owner) == d.player2 { 1 } else { return err!(DuelError::NotAPlayer) };
        // The wallet itself or the session key it authorised may move.
        require!(d.side_of(&signer) == Some(side), DuelError::NotAPlayer);
        if choice == ASTRA {
            let (prana, f) = if side == 0 { (d.prana1, d.fighter1) } else { (d.prana2, d.fighter2) };
            require!(prana >= FIGHTER_STATS[f as usize].cost, DuelError::NoPrana);
        }
        let mv = &mut ctx.accounts.player_move;
        require!(mv.choice.is_none(), DuelError::AlreadyChose);
        mv.choice = Some(choice);
        Ok(())
    }

    /// Both moves are in: resolve the beat and make both moves readable.
    pub fn reveal_beat(ctx: Context<BeatCtx>) -> Result<()> {
        let m1 = ctx.accounts.move1.choice.ok_or(DuelError::MissingChoice)?;
        let m2 = ctx.accounts.move2.choice.ok_or(DuelError::MissingChoice)?;
        {
            let d = &mut ctx.accounts.duel;
            require!(d.started && d.winner == NONE && !d.revealed, DuelError::NotInBeat);
            resolve_beat(d, m1, m2);
            d.revealed = true;
            msg!("Beat {}: {} vs {} → hp {} / {}", d.beat, m1, m2, d.hp1, d.hp2);
        }
        set_move_privacy(&ctx, None)?;
        ctx.accounts.duel.exit(&crate::ID)?;
        Ok(())
    }

    /// Clear the beat and hide the next moves again. Only a player can advance.
    pub fn next_beat(ctx: Context<BeatCtx>) -> Result<()> {
        {
            let d = &ctx.accounts.duel;
            require!(d.revealed && d.winner == NONE, DuelError::NotRevealed);
            require!(d.side_of(&ctx.accounts.payer.key()).is_some(), DuelError::NotAPlayer);
        }
        let now = Clock::get()?.unix_timestamp;
        let d = &mut ctx.accounts.duel;
        d.revealed = false;
        d.beat_started_at = now;
        ctx.accounts.move1.choice = None;
        ctx.accounts.move2.choice = None;
        let owners = [(d.player1, d.session1), (d.player2.ok_or(DuelError::MissingOpponent)?, d.session2)];
        set_move_privacy(&ctx, Some(owners))?;
        Ok(())
    }

    /// A player who locked in a move wins if the opponent stalls past the timeout.
    pub fn claim_timeout(ctx: Context<BeatCtx>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c1 = ctx.accounts.move1.choice.is_some();
        let c2 = ctx.accounts.move2.choice.is_some();
        let d = &mut ctx.accounts.duel;
        require!(d.started && d.winner == NONE && !d.revealed, DuelError::NotInBeat);
        require!(now - d.beat_started_at > BEAT_TIMEOUT_SECS, DuelError::TooEarly);
        let side = d.side_of(&ctx.accounts.payer.key());
        if side == Some(0) && c1 && !c2 { d.winner = 0; }
        else if side == Some(1) && c2 && !c1 { d.winner = 1; }
        else { return err!(DuelError::TooEarly); }
        msg!("Duel {} won by timeout", d.game_id);
        Ok(())
    }

    /// Commit + undelegate the decided duel and both move PDAs back to Solana.
    pub fn undelegate_all(ctx: Context<UndelegateAll>) -> Result<()> {
        require!(ctx.accounts.duel.winner != NONE, DuelError::NotDecided);
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[
            ctx.accounts.duel.to_account_info(),
            ctx.accounts.move1.to_account_info(),
            ctx.accounts.move2.to_account_info(),
        ])
        .build_and_invoke()?;
        Ok(())
    }
}

/// Flip both move permissions: `None` → public (after reveal),
/// `Some([(wallet, session); 2])` → private to each player's wallet + session key.
fn set_move_privacy(ctx: &Context<BeatCtx>, owners: Option<[(Pubkey, Pubkey); 2]>) -> Result<()> {
    let a = &ctx.accounts;
    let game_id = a.duel.game_id.to_le_bytes();
    let pairs = [
        (a.move1.to_account_info(), a.permission1.to_account_info(), a.move1.player, ctx.bumps.move1, owners.map(|o| o[0])),
        (a.move2.to_account_info(), a.permission2.to_account_info(), a.move2.player, ctx.bumps.move2, owners.map(|o| o[1])),
    ];
    for (acc, perm, player, bump, owner) in pairs {
        let args = match owner {
            Some((wallet, session)) => EphemeralMembersArgs { is_private: true, members: member_list(wallet, session) },
            None => EphemeralMembersArgs { is_private: false, members: vec![] },
        };
        UpdateEphemeralPermissionCpi {
            payer: acc.clone(),
            permissioned_account: acc.clone(),
            permission: perm,
            vault: a.ephemeral_vault.to_account_info(),
            magic_program: a.magic_program.to_account_info(),
            permission_program: a.permission_program.to_account_info(),
            authority: acc.clone(),
            authority_is_signer: false,
            args,
        }
        .invoke_signed(&[&[MOVE_SEED, &game_id, player.as_ref(), &[bump]]])?;
    }
    Ok(())
}

/// Transfer lamports out of a system-owned vault PDA that signs via its seeds.
fn pay_from_vault<'info>(
    vault: &SystemAccount<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    system_program: &Program<'info, System>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    transfer(
        CpiContext::new_with_signer(
            system_program.key(),
            Transfer { from: vault.to_account_info(), to: to.clone() },
            signer_seeds,
        ),
        amount,
    )
}

fn member_list(wallet: Pubkey, session: Pubkey) -> Vec<Member> {
    let mut v = vec![Member { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: wallet }];
    if session != wallet && session != Pubkey::default() {
        v.push(Member { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: session });
    }
    v
}

fn seeds_for(t: &AccountType) -> Vec<Vec<u8>> {
    match t {
        AccountType::Duel { game_id } => vec![DUEL_SEED.to_vec(), game_id.to_le_bytes().to_vec()],
        AccountType::Move { game_id, player } => vec![MOVE_SEED.to_vec(), game_id.to_le_bytes().to_vec(), player.to_bytes().to_vec()],
    }
}

// ---------------- Accounts ----------------

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateDuel<'info> {
    #[account(init, payer = player1, space = 8 + Duel::LEN, seeds = [DUEL_SEED, &game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(init, payer = player1, space = 8 + PlayerMove::LEN, seeds = [MOVE_SEED, &game_id.to_le_bytes(), player1.key().as_ref()], bump)]
    pub player_move: Account<'info, PlayerMove>,
    #[account(init, payer = player1, space = 8 + Pool::LEN, seeds = [POOL_SEED, &game_id.to_le_bytes()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [VAULT_SEED, &game_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player1: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct JoinDuel<'info> {
    #[account(mut, seeds = [DUEL_SEED, &game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(init, payer = player, space = 8 + PlayerMove::LEN, seeds = [MOVE_SEED, &game_id.to_le_bytes(), player.key().as_ref()], bump)]
    pub player_move: Account<'info, PlayerMove>,
    #[account(mut, seeds = [VAULT_SEED, &game_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct PlaceBet<'info> {
    #[account(seeds = [DUEL_SEED, &game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [POOL_SEED, &game_id.to_le_bytes()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(init, payer = bettor, space = 8 + Bet::LEN, seeds = [BET_SEED, &game_id.to_le_bytes(), bettor.key().as_ref()], bump)]
    pub bet: Account<'info, Bet>,
    #[account(mut, seeds = [BET_VAULT_SEED, &game_id.to_le_bytes()], bump)]
    pub bet_vault: SystemAccount<'info>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BeginDuel<'info> {
    #[account(mut, seeds = [DUEL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPot<'info> {
    #[account(mut, seeds = [DUEL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [POOL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [VAULT_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: payout recipient, verified against duel.player1
    #[account(mut)]
    pub player1: UncheckedAccount<'info>,
    /// CHECK: payout recipient, verified against duel.player2
    #[account(mut)]
    pub player2: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimBet<'info> {
    #[account(seeds = [POOL_SEED, &pool.game_id.to_le_bytes()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [BET_SEED, &pool.game_id.to_le_bytes(), bettor.key().as_ref()], bump, has_one = bettor)]
    pub bet: Account<'info, Bet>,
    #[account(mut, seeds = [BET_VAULT_SEED, &pool.game_id.to_le_bytes()], bump)]
    pub bet_vault: SystemAccount<'info>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelDuel<'info> {
    #[account(mut, seeds = [DUEL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [VAULT_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player1: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: the PDA to delegate (Duel or PlayerMove)
    #[account(mut, del)]
    pub pda: UncheckedAccount<'info>,
    pub payer: Signer<'info>,
    /// CHECK: checked by the delegation program
    pub validator: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct InitPermission<'info> {
    /// CHECK: delegated PDA; pays its own permission rent and signs via seeds
    #[account(mut)]
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: verified by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: verified by the magic program
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestOmen<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [DUEL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    /// CHECK: validated by the VRF program
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct CallbackOmen<'info> {
    #[account(mut)]
    pub duel: Account<'info, Duel>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct MakeChoice<'info> {
    #[account(mut, seeds = [MOVE_SEED, &game_id.to_le_bytes(), owner.key().as_ref()], bump)]
    pub player_move: Account<'info, PlayerMove>,
    #[account(seeds = [DUEL_SEED, &game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    /// CHECK: the player's wallet that owns this move slot; checked against the duel.
    pub owner: UncheckedAccount<'info>,
    /// The wallet or its session key.
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct BeatCtx<'info> {
    #[account(mut, seeds = [DUEL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [MOVE_SEED, &duel.game_id.to_le_bytes(), duel.player1.as_ref()], bump)]
    pub move1: Account<'info, PlayerMove>,
    #[account(mut, seeds = [MOVE_SEED, &duel.game_id.to_le_bytes(), duel.player2.unwrap_or_default().as_ref()], bump)]
    pub move2: Account<'info, PlayerMove>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission1: UncheckedAccount<'info>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission2: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: verified by the magic program
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateAll<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [DUEL_SEED, &duel.game_id.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [MOVE_SEED, &duel.game_id.to_le_bytes(), duel.player1.as_ref()], bump)]
    pub move1: Account<'info, PlayerMove>,
    #[account(mut, seeds = [MOVE_SEED, &duel.game_id.to_le_bytes(), duel.player2.unwrap_or_default().as_ref()], bump)]
    pub move2: Account<'info, PlayerMove>,
}

// ---------------- State ----------------

#[account]
pub struct Duel {
    pub game_id: u64,
    pub player1: Pubkey,
    pub player2: Option<Pubkey>,
    pub session1: Pubkey,
    pub session2: Pubkey,
    pub fighter1: u8,
    pub fighter2: u8,
    pub hp1: u16,
    pub hp2: u16,
    pub prana1: u8,
    pub prana2: u8,
    pub beat: u8,
    pub last_move1: u8,
    pub last_move2: u8,
    pub last_taken1: u16,
    pub last_taken2: u16,
    pub revealed: bool,
    pub winner: u8, // 255 ongoing · 0 player1 · 1 player2 · 2 draw
    pub omen: u8,   // 255 none · side blessed by the VRF omen
    pub arena: u8,
    pub stake: u64,
    pub paid: bool,
    pub started: bool,
    pub beat_started_at: i64,
}
impl Duel {
    /// 0 / 1 when `key` is that player's wallet or session key.
    pub fn side_of(&self, key: &Pubkey) -> Option<u8> {
        if *key == self.player1 || (*key == self.session1 && self.session1 != Pubkey::default()) {
            Some(0)
        } else if Some(*key) == self.player2 || (*key == self.session2 && self.session2 != Pubkey::default()) {
            Some(1)
        } else {
            None
        }
    }

    pub const LEN: usize = 8 + 32 + 33 + 64 + 2 + 4 + 2 + 1 + 2 + 4 + 1 + 1 + 1 + 1 + 8 + 1 + 1 + 8 + 16;
}

#[account]
pub struct PlayerMove {
    pub game_id: u64,
    pub player: Pubkey,
    pub choice: Option<u8>,
}
impl PlayerMove {
    pub const LEN: usize = 8 + 32 + 2 + 6;
}

#[account]
pub struct Pool {
    pub game_id: u64,
    pub total1: u64,
    pub total2: u64,
    pub bettors: u32,
    pub settled: bool,
    pub winner: u8,
}
impl Pool {
    pub const LEN: usize = 8 + 8 + 8 + 4 + 1 + 1 + 8;
}

#[account]
pub struct Bet {
    pub game_id: u64,
    pub bettor: Pubkey,
    pub side: u8,
    pub amount: u64,
    pub claimed: bool,
}
impl Bet {
    pub const LEN: usize = 8 + 32 + 1 + 8 + 1 + 6;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Duel { game_id: u64 },
    Move { game_id: u64, player: Pubkey },
}

#[error_code]
pub enum DuelError {
    #[msg("Unknown warrior.")] BadFighter,
    #[msg("Unknown move.")] BadMove,
    #[msg("Side must be 0 or 1.")] BadSide,
    #[msg("Bet must be more than zero.")] ZeroBet,
    #[msg("Betting is closed: the duel has begun.")] BettingClosed,
    #[msg("You cannot join your own duel.")] CannotJoinOwn,
    #[msg("Duel already has two warriors.")] Full,
    #[msg("Duel has no opponent yet.")] MissingOpponent,
    #[msg("Only a duelist can do this.")] NotAPlayer,
    #[msg("Duel already started.")] AlreadyStarted,
    #[msg("Not accepting moves right now.")] NotInBeat,
    #[msg("You already locked in a move.")] AlreadyChose,
    #[msg("Both moves must be locked in first.")] MissingChoice,
    #[msg("Beat not revealed yet.")] NotRevealed,
    #[msg("Not enough prana for an astra.")] NoPrana,
    #[msg("The omen can only be cast before the first beat.")] OmenClosed,
    #[msg("Duel not decided yet.")] NotDecided,
    #[msg("Already paid.")] AlreadyPaid,
    #[msg("Duel already settled.")] Settled,
    #[msg("Wrong player account.")] WrongPlayer,
    #[msg("Timeout not reached.")] TooEarly,
    #[msg("Arithmetic overflow.")] Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn duel(f1: u8, f2: u8) -> Duel {
        Duel {
            game_id: 1, player1: Pubkey::default(), player2: Some(Pubkey::default()),
            session1: Pubkey::default(), session2: Pubkey::default(), fighter1: f1, fighter2: f2,
            hp1: FIGHTER_STATS[f1 as usize].hp, hp2: FIGHTER_STATS[f2 as usize].hp, prana1: START_PRANA, prana2: START_PRANA,
            beat: 0, last_move1: NONE, last_move2: NONE, last_taken1: 0, last_taken2: 0, revealed: false,
            winner: NONE, omen: NONE, arena: 0, stake: 0, paid: false, started: true, beat_started_at: 0,
        }
    }

    #[test]
    fn strike_beats_heavy_and_guard_beats_strike() {
        let mut d = duel(0, 3);
        resolve_beat(&mut d, STRIKE, HEAVY);
        assert_eq!(d.hp2, 130 - 11);
        assert_eq!(d.hp1, 110);
        resolve_beat(&mut d, STRIKE, GUARD);
        assert_eq!(d.hp1, 110 - 8);
    }

    #[test]
    fn astra_spends_prana_and_evade_counters() {
        let mut d = duel(2, 1);
        d.prana1 = 60;
        resolve_beat(&mut d, ASTRA, EVADE);
        assert_eq!(d.hp1, 95 - 9);
        assert_eq!(d.hp2, 100);
        assert_eq!(d.prana1, 10 + 15 + 4);
    }

    #[test]
    fn ko_decides_winner() {
        let mut d = duel(3, 2);
        d.hp2 = 10;
        resolve_beat(&mut d, HEAVY, GUARD);
        assert_eq!(d.winner, 0);
    }
}
