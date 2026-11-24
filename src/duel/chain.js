import './polyfill.js'; // must stay first: web3.js / anchor need Buffer at load time
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import {
  permissionPdaFromAccount, getAuthToken, waitUntilPermissionActive,
  AUTHORITY_FLAG, TX_LOGS_FLAG, PERMISSION_PROGRAM_ID, MAGIC_PROGRAM_ID,
} from '@magicblock-labs/ephemeral-rollups-sdk';

export * from './wallet.js';

// Client for the Dharma Yuddha program (onchain/programs/dharma-yuddha).
//
// Who signs what:
//  • The player's real wallet (Phantom, MetaMask, …) signs every base-layer
//    transaction that moves their SOL or creates their accounts: create/join
//    with stake, bets, bet claims. One popup per action.
//  • A session key, created in this browser and registered on-chain by the
//    wallet in the create/join transaction, signs the fast rollup actions
//    (hidden moves, reveals, next beat) so there is no popup every beat.
//    Its small balance is swept back to the wallet at the end.
//  • The bot opponent is its own keypair (a separate on-chain identity).

const env = import.meta.env;
export const BASE_ENDPOINT = env.VITE_BASE_ENDPOINT || 'https://api.devnet.solana.com';
export const TEE_ENDPOINT = env.VITE_TEE_ENDPOINT || 'https://devnet-tee.magicblock.app';
export const TEE_WS_ENDPOINT = env.VITE_TEE_WS_ENDPOINT || TEE_ENDPOINT.replace(/^http/, 'ws');
export const ER_VALIDATOR = new PublicKey(env.VITE_VALIDATOR || 'MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
export const VRF_QUEUE = new PublicKey(env.VITE_VRF_QUEUE || '5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
const VAULT_ID = new PublicKey('MagicVau1t999999999999999999999999999999999');
export const SESSION_FUND_SOL = 0.02;
export const BOT_FUND_SOL = 0.03;

const idls = import.meta.glob('./idl/*.json', { eager: true });
const rawIdl = idls['./idl/dharma_yuddha.json']?.default ?? null;
export const PROGRAM_ID = rawIdl ? new PublicKey(env.VITE_PROGRAM_ID || rawIdl.address) : null;
export const chainReady = () => !!rawIdl && !!PROGRAM_ID && !PROGRAM_ID.equals(SystemProgram.programId);

/** True once the program account actually exists (is executable) on devnet. */
let deployedCache = null;
export async function programDeployed() {
  if (!chainReady()) return false;
  if (deployedCache) return true;
  const info = await baseConnection().getAccountInfo(PROGRAM_ID).catch(() => null);
  deployedCache = !!info?.executable;
  return deployedCache;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const le8 = (id) => new BN(id).toArrayLike(Buffer, 'le', 8);
const sol = (x) => Math.round(x * LAMPORTS_PER_SOL);

export const explorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const baseConnection = () => new Connection(BASE_ENDPOINT, 'confirmed');

export function loadKeypair(key) {
  try {
    const s = localStorage.getItem(key);
    if (s) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
  } catch { /* fall through */ }
  const kp = Keypair.generate();
  try { localStorage.setItem(key, JSON.stringify(Array.from(kp.secretKey))); } catch { /* private mode */ }
  return kp;
}

export const newSession = () => Keypair.generate();

/** A signer backed by a local keypair (session keys and the bot). */
export const keypairSigner = (kp) => ({ publicKey: kp.publicKey, async signTransaction(tx) { tx.partialSign(kp); return tx; }, keypair: kp });

export class DuelClient {
  /**
   * @param wallet  signer for base-layer txs — a WalletSigner (real wallet) or keypairSigner (bot)
   * @param session Keypair that signs rollup txs (the bot passes its own keypair)
   */
  constructor(wallet, session, onTx = () => {}) {
    if (!chainReady()) throw new Error('The Dharma Yuddha program is not deployed yet.');
    this.wallet = wallet;
    this.session = session;
    this.onTx = onTx;
    this.base = baseConnection();
    const readOnly = { publicKey: wallet.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t };
    this.program = new anchor.Program({ ...rawIdl, address: PROGRAM_ID.toBase58() }, new anchor.AnchorProvider(this.base, readOnly, { commitment: 'confirmed' }));
    this.tee = null;
    this.teeExpiry = 0;
  }

  get owner() { return this.wallet.publicKey; }
  get sk() { return this.session.publicKey; }

  // ---------- PDAs ----------
  pda(...seeds) { return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0]; }
  duelPda(id) { return this.pda(Buffer.from('duel'), le8(id)); }
  movePda(id, player) { return this.pda(Buffer.from('beat_move'), le8(id), player.toBuffer()); }
  vaultPda(id) { return this.pda(Buffer.from('vault'), le8(id)); }
  poolPda(id) { return this.pda(Buffer.from('pool'), le8(id)); }
  betVaultPda(id) { return this.pda(Buffer.from('bet_vault'), le8(id)); }
  betPda(id, bettor) { return this.pda(Buffer.from('bet'), le8(id), bettor.toBuffer()); }

  async balance(pk = this.owner) { return (await this.base.getBalance(pk)) / LAMPORTS_PER_SOL; }

  // ---------- Sending ----------
  /** Base layer, paid and signed by the player's wallet (wallet popup). */
  async sendWallet(ixs, label) {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.owner;
    const { blockhash, lastValidBlockHeight } = await this.base.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    const signed = await this.wallet.signTransaction(tx);
    const sig = await this.base.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    const res = await this.base.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    if (res.value.err) throw new Error(`${label} failed on-chain: ${JSON.stringify(res.value.err)}`);
    this.onTx({ label, sig, layer: 'solana' });
    return sig;
  }

  /** Base layer, paid by the session key (no popup): begin, settlement, sweep. */
  async sendSessionBase(ixs, label) {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.sk;
    const sig = await sendAndConfirmTransaction(this.base, tx, [this.session], { commitment: 'confirmed' });
    this.onTx({ label, sig, layer: 'solana' });
    return sig;
  }

  async teeConn() {
    if (this.tee && Date.now() < this.teeExpiry - 60_000) return this.tee;
    const auth = await getAuthToken(TEE_ENDPOINT, this.sk, (msg) => Promise.resolve(nacl.sign.detached(msg, this.session.secretKey)));
    const exp = auth.expiresAt > 1e12 ? auth.expiresAt : auth.expiresAt * 1000;
    const base = TEE_ENDPOINT.replace(/\/$/, ''), ws = TEE_WS_ENDPOINT.replace(/\/$/, '');
    this.tee = new Connection(`${base}?token=${auth.token}`, { wsEndpoint: `${ws}?token=${auth.token}`, commitment: 'confirmed' });
    this.teeExpiry = exp;
    return this.tee;
  }

  /** Rollup transaction signed by the session key. */
  async sendEr(ixs, label) {
    const conn = await this.teeConn();
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.sk;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const sig = await sendAndConfirmTransaction(conn, tx, [this.session], { skipPreflight: true, commitment: 'confirmed' });
    this.onTx({ label, sig, layer: 'rollup' });
    return sig;
  }

  async waitOnEr(pda, ms = 25_000) {
    const conn = await this.teeConn();
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await conn.getAccountInfo(pda).catch(() => null)) return;
      await sleep(600);
    }
    throw new Error('Account did not reach the rollup in time');
  }

  delegateIx(type, pda, payer) {
    return this.program.methods.delegatePda(type).accountsPartial({ payer, validator: ER_VALIDATOR, pda }).instruction();
  }

  fundIx(to, amountSol) { return SystemProgram.transfer({ fromPubkey: this.owner, toPubkey: to, lamports: sol(amountSol) }); }

  // ---------- Base layer (wallet) ----------
  /** One wallet approval: fund the session key (+ optional extra transfers), create the duel with the stake, hide the move slot. */
  async createDuel(id, stakeSol, fighter, extraIxs = []) {
    const create = await this.program.methods
      .createDuel(new BN(id), new BN(sol(stakeSol)), fighter, this.sk)
      .accountsPartial({ duel: this.duelPda(id), playerMove: this.movePda(id, this.owner), pool: this.poolPda(id), vault: this.vaultPda(id), player1: this.owner })
      .instruction();
    const del = await this.delegateIx({ move: { gameId: new BN(id), player: this.owner } }, this.movePda(id, this.owner), this.owner);
    const fund = this.session.publicKey.equals(this.owner) ? [] : [this.fundIx(this.sk, SESSION_FUND_SOL)];
    return this.sendWallet([...fund, ...extraIxs, create, del], `Create duel${stakeSol ? ` · stake ${stakeSol} SOL` : ''}`);
  }

  async joinDuel(id, fighter) {
    const join = await this.program.methods
      .joinDuel(new BN(id), fighter, this.sk)
      .accountsPartial({ duel: this.duelPda(id), playerMove: this.movePda(id, this.owner), vault: this.vaultPda(id), player: this.owner })
      .instruction();
    const del = await this.delegateIx({ move: { gameId: new BN(id), player: this.owner } }, this.movePda(id, this.owner), this.owner);
    const fund = this.session.publicKey.equals(this.owner) ? [] : [this.fundIx(this.sk, SESSION_FUND_SOL)];
    return this.sendWallet([...fund, join, del], 'Join duel + match stake');
  }

  async placeBet(id, side, amountSol) {
    const ix = await this.program.methods
      .placeBet(new BN(id), side, new BN(sol(amountSol)))
      .accountsPartial({ duel: this.duelPda(id), pool: this.poolPda(id), bet: this.betPda(id, this.owner), betVault: this.betVaultPda(id), bettor: this.owner })
      .instruction();
    return this.sendWallet([ix], `Bet ${amountSol} SOL on side ${side + 1}`);
  }

  async claimBet(id) {
    const ix = await this.program.methods.claimBet()
      .accountsPartial({ pool: this.poolPda(id), bet: this.betPda(id, this.owner), betVault: this.betVaultPda(id), bettor: this.owner })
      .instruction();
    return this.sendWallet([ix], 'Claim bet winnings');
  }

  // ---------- Base layer (session key, no popup) ----------
  async beginDuel(id) {
    const begin = await this.program.methods.beginDuel().accountsPartial({ duel: this.duelPda(id), payer: this.sk }).instruction();
    const del = await this.delegateIx({ duel: { gameId: new BN(id) } }, this.duelPda(id), this.sk);
    return this.sendSessionBase([begin, del], 'Begin duel → private rollup (bets lock)');
  }

  async claimPot(id, p1, p2) {
    const ix = await this.program.methods.claimPot()
      .accountsPartial({ duel: this.duelPda(id), pool: this.poolPda(id), vault: this.vaultPda(id), player1: p1, player2: p2, payer: this.sk })
      .instruction();
    return this.sendSessionBase([ix], 'Pay out pot + settle spectator pool');
  }

  /** Return what is left on the session key to the wallet. */
  async sweepSession() {
    if (this.sk.equals(this.owner)) return null;
    const lamports = await this.base.getBalance(this.sk);
    const keep = 5000;
    if (lamports <= keep) return null;
    return this.sendSessionBase([SystemProgram.transfer({ fromPubkey: this.sk, toPubkey: this.owner, lamports: lamports - keep })], 'Return session-key SOL to wallet');
  }

  // ---------- Rollup (session key) ----------
  permissionIx(type, account, members) {
    return this.program.methods.initPermission(type, members)
      .accountsPartial({
        permissionedAccount: account, permission: permissionPdaFromAccount(account), authority: this.sk,
        permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
      })
      .instruction();
  }

  /** My move slot becomes readable only by my wallet and my session key. */
  async hideMyMove(id) {
    const mv = this.movePda(id, this.owner);
    await this.waitOnEr(mv);
    const members = [{ flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: this.owner }];
    if (!this.sk.equals(this.owner)) members.push({ flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: this.sk });
    const ix = await this.permissionIx({ move: { gameId: new BN(id), player: this.owner } }, mv, members);
    const sig = await this.sendEr([ix], 'Seal my move slot in the TEE');
    await waitUntilPermissionActive(TEE_ENDPOINT, mv);
    return sig;
  }

  async publishDuel(id) {
    const d = this.duelPda(id);
    await this.waitOnEr(d);
    const ix = await this.permissionIx({ duel: { gameId: new BN(id) } }, d, null);
    return this.sendEr([ix], 'Open duel state to spectators');
  }

  async requestOmen(id) {
    const ix = await this.program.methods.requestOmen((Math.random() * 255) | 0)
      .accountsPartial({ payer: this.sk, duel: this.duelPda(id), oracleQueue: VRF_QUEUE })
      .instruction();
    return this.sendEr([ix], 'Request VRF battle omen');
  }

  async makeChoice(id, move) {
    const ix = await this.program.methods.makeChoice(new BN(id), move)
      .accountsPartial({ playerMove: this.movePda(id, this.owner), duel: this.duelPda(id), owner: this.owner, signer: this.sk })
      .instruction();
    return this.sendEr([ix], 'Lock hidden move');
  }

  beatAccounts(id, p1, p2) {
    const m1 = this.movePda(id, p1), m2 = this.movePda(id, p2);
    return {
      duel: this.duelPda(id), move1: m1, move2: m2,
      permission1: permissionPdaFromAccount(m1), permission2: permissionPdaFromAccount(m2), payer: this.sk,
      permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
    };
  }

  async tryReveal(id, p1, p2) {
    const conn = await this.teeConn();
    const tx = await this.program.methods.revealBeat().accountsPartial(this.beatAccounts(id, p1, p2)).transaction();
    tx.feePayer = this.sk;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const sim = await conn.simulateTransaction(tx).catch(() => null);
    if (!sim || sim.value.err) return null;
    const sig = await sendAndConfirmTransaction(conn, tx, [this.session], { skipPreflight: true, commitment: 'confirmed' });
    this.onTx({ label: 'Reveal beat · TEE resolves both moves', sig, layer: 'rollup' });
    return sig;
  }

  async nextBeat(id, p1, p2) {
    const ix = await this.program.methods.nextBeat().accountsPartial(this.beatAccounts(id, p1, p2)).instruction();
    return this.sendEr([ix], 'Next beat · moves sealed again');
  }

  async undelegateAll(id, p1, p2) {
    const ix = await this.program.methods.undelegateAll()
      .accountsPartial({ payer: this.sk, duel: this.duelPda(id), move1: this.movePda(id, p1), move2: this.movePda(id, p2) })
      .instruction();
    return this.sendEr([ix], 'Commit result back to Solana');
  }

  // ---------- Reads ----------
  decodeDuel(data) { return this.program.coder.accounts.decode('duel', data); }
  async fetchDuelEr(id) {
    const info = await (await this.teeConn()).getAccountInfo(this.duelPda(id));
    return info ? this.decodeDuel(info.data) : null;
  }
  async fetchDuelBase(id) {
    const info = await this.base.getAccountInfo(this.duelPda(id));
    return info && info.owner.equals(PROGRAM_ID) ? this.decodeDuel(info.data) : null;
  }
  async fetchDuel(id) {
    return (await this.fetchDuelEr(id).catch(() => null)) || (await this.fetchDuelBase(id).catch(() => null));
  }
  async fetchPool(id) {
    const info = await this.base.getAccountInfo(this.poolPda(id));
    return info ? this.program.coder.accounts.decode('pool', info.data) : null;
  }
  async waitOnBase(id, ms = 60_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const d = await this.fetchDuelBase(id).catch(() => null);
      if (d) return d;
      await sleep(1500);
    }
    throw new Error('Commit to Solana is taking longer than expected');
  }
}

export function duelToState(d) {
  return {
    fighter: [d.fighter1, d.fighter2], hp: [d.hp1, d.hp2], prana: [d.prana1, d.prana2],
    beat: d.beat, winner: d.winner === 255 ? -1 : d.winner, omenSide: d.omen === 255 ? -1 : d.omen,
    lastMoves: [d.lastMove1, d.lastMove2], lastTaken: [d.lastTaken1, d.lastTaken2], revealed: d.revealed,
    started: d.started, player1: d.player1, player2: d.player2, stake: d.stake.toNumber() / LAMPORTS_PER_SOL, arena: d.arena,
  };
}

export { LAMPORTS_PER_SOL, PublicKey, Keypair };
