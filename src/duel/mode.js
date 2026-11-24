import * as THREE from 'three';
import { Animator } from '../animation.js';
import { ARENAS } from '../arenas/index.js';
import { ROSTER } from './roster.js';
import { MOVES, STRIKE, HEAVY, GUARD, EVADE, ASTRA, newState, resolveBeat, botMove, canUse } from './rules.js';

// Dharma Yuddha — hidden-move duels between warriors of the two armies.
// Each beat both sides secretly lock a move; the reveal resolves both at once
// and the 3D exchange plays out. Practice runs locally; the on-chain modes run
// the same rules inside MagicBlock's private ephemeral rollup (see chain.js).

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BEAT_LEN = 2.5;
// Battlefields for this mode. Ram Setu is left out on purpose: its stones carry
// the name of Rama, and warriors should not fight on it. Index = on-chain `arena`.
const DY_ARENAS = ['ashoka', 'lanka', 'ayodhya'].map((id) => ARENAS.find((a) => a.id === id));
const HOME = 2.5;

// ---------------- 3D actor ----------------
class Actor {
  constructor(scene, def, side) {
    this.def = def;
    this.side = side;
    this.rig = def.build();
    this.root = this.rig.root;
    this.root.scale.setScalar(def.scale);
    scene.add(this.root);
    this.anim = new Animator(this.rig, def.handed);
    this.dir = side === 0 ? -1 : 1; // direction toward the opponent along z
    this.home = new THREE.Vector3(0, 0, side === 0 ? HOME : -HOME);
    this.root.position.copy(this.home);
    this.root.rotation.y = side === 0 ? Math.PI : 0;
    this.clock = 0;
    this.flash = 0;
    this.pose = 'stance';
    this.args = {};
  }
  hand() { return this.rig[this.def.handed === 'L' ? 'handL' : 'handR'].getWorldPosition(new THREE.Vector3()); }
  chest() { const p = this.root.position; return new THREE.Vector3(p.x, p.y + 1.25 * this.def.scale, p.z); }
  update(dt) {
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    for (const m of this.rig.flashMats) m.emissive?.setRGB(this.flash * 0.9, this.flash * 0.6, this.flash * 0.4);
    if (this.rig.cape) this.rig.cape.rotation.x = 0.12 + Math.sin(this.clock * 3) * 0.04;
    if (this.rig.tail) this.rig.tail.rotation.z = Math.sin(this.clock * 2.2) * 0.12;
    this.anim.update(dt, this.pose, this.args, this.clock);
  }
  dispose(scene) { scene.remove(this.root); }
}

// ---------------- Controllers ----------------
// All controllers expose: start() → state, play(move) → {moves, taken, state}, after(state), finish(state).

class PracticeController {
  constructor(f0, f1) { this.f = [f0, f1]; this.history = []; this.label = 'Practice · offline'; }
  async start() {
    this.state = newState(this.f[0], this.f[1], Math.random() < 0.5 ? 0 : 1);
    this.state.arena = (Math.random() * DY_ARENAS.length) | 0;
    return this.state;
  }
  async play(move) {
    const theirs = botMove(this.state, 1, this.history);
    await sleep(500 + Math.random() * 500);
    const out = resolveBeat(this.state, move, theirs);
    this.history.push(out.moves);
    return { ...out, state: this.state };
  }
  async after() {}
  async finish() { return null; }
}

// Plays against a bot identity that lives in this browser — handy for a solo
// on-chain demo: every move is a real private-rollup transaction.
class ChainBotController {
  constructor(chain, ui, wallet, f0, f1) {
    this.c = chain; this.ui = ui; this.wallet = wallet; this.f = [f0, f1]; this.history = [];
    this.label = 'On-chain · vs bot (devnet TEE rollup)';
  }
  async start() {
    const { DuelClient, loadKeypair, keypairSigner, newSession, duelToState, BOT_FUND_SOL, SESSION_FUND_SOL } = this.c;
    const me = new DuelClient(this.wallet, newSession(), this.ui.log);
    const botKp = loadKeypair('dy-bot');
    const bot = new DuelClient(keypairSigner(botKp), botKp, this.ui.log);
    this.me = me; this.bot = bot;
    const id = Math.floor(Math.random() * 2 ** 47);
    this.id = id;
    this.ui.status('Checking balances on devnet…');
    const need = SESSION_FUND_SOL + 0.02;
    if ((await me.balance()) < need + BOT_FUND_SOL) throw new Error(`Your wallet needs about ${(need + BOT_FUND_SOL).toFixed(2)} devnet SOL. Switch it to Devnet and use the faucet.`);
    const extra = (await bot.balance()) < 0.02 ? [me.fundIx(bot.owner, BOT_FUND_SOL)] : [];
    this.ui.status(`Approve in ${this.wallet.name}: create the duel${extra.length ? ' and fund the bot opponent' : ''}…`);
    await me.createDuel(id, 0, this.f[0], extra);
    this.ui.status('Bot accepts the challenge…');
    await bot.joinDuel(id, this.f[1]);
    this.ui.status('Moving the duel into the private rollup…');
    await me.beginDuel(id);
    this.ui.status('Sealing move slots inside the TEE…');
    await Promise.all([me.hideMyMove(id), bot.hideMyMove(id)]);
    await me.publishDuel(id).catch(() => {});
    this.ui.status('Asking the VRF oracle for an omen…');
    await me.requestOmen(id).catch((e) => this.ui.log({ label: 'VRF omen skipped: ' + e.message }));
    let d = null;
    for (let i = 0; i < 8; i++) { d = await me.fetchDuelEr(id); if (d && d.omen !== 255) break; await sleep(700); }
    this.state = duelToState(d);
    this.state.maxHp = [ROSTER[this.f[0]].hp, ROSTER[this.f[1]].hp];
    this.p1 = me.owner; this.p2 = bot.owner;
    return this.state;
  }
  async play(move) {
    const { duelToState } = this.c;
    const theirs = botMove(this.state, 1, this.history);
    await Promise.all([this.me.makeChoice(this.id, move), this.bot.makeChoice(this.id, theirs)]);
    this.ui.status('Both moves sealed · revealing inside the TEE…');
    for (let i = 0; i < 30; i++) {
      if (await this.me.tryReveal(this.id, this.p1, this.p2)) break;
      await sleep(500);
    }
    const d = duelToState(await this.me.fetchDuelEr(this.id));
    d.maxHp = this.state.maxHp;
    this.state = d;
    this.history.push(d.lastMoves);
    return { moves: d.lastMoves, taken: d.lastTaken, winner: d.winner, state: d };
  }
  async after(state) { if (state.winner === -1) await this.me.nextBeat(this.id, this.p1, this.p2); }
  async finish() {
    this.ui.status('Committing the result back to Solana…');
    await this.me.undelegateAll(this.id, this.p1, this.p2);
    await this.me.waitOnBase(this.id);
    await this.me.claimPot(this.id, this.p1, this.p2);
    await this.me.sweepSession().catch(() => {});
    return `Duel #${this.id} settled on Solana.`;
  }
}

// Two real players, each in their own browser. Player 1 creates, shares the
// code, player 2 joins; spectators can bet until player 1 begins.
class ChainPvPController {
  constructor(chain, ui, wallet, opts) {
    this.c = chain; this.ui = ui; this.wallet = wallet; this.o = opts; this.label = 'On-chain · player vs player';
  }
  async start() {
    const { DuelClient, newSession, duelToState, PublicKey, SESSION_FUND_SOL } = this.c;
    const me = new DuelClient(this.wallet, newSession(), this.ui.log);
    this.me = me;
    if ((await me.balance()) < SESSION_FUND_SOL + 0.02 + this.o.stake) throw new Error('Not enough devnet SOL in your wallet for the stake and fees.');
    this.ui.status(`Approve in ${this.wallet.name}…`);
    let d;
    if (this.o.create) {
      this.id = Math.floor(Math.random() * 2 ** 47);
      await me.createDuel(this.id, this.o.stake, this.o.fighter);
      this.ui.showCode(this.id);
      this.ui.status(`Duel code ${this.id} · share it. Waiting for a challenger…`);
      while (!(d = await me.fetchDuelBase(this.id)) || !d.player2) await sleep(2000);
      this.ui.status('Challenger arrived! Spectators can still bet. Press BEGIN when ready.');
      await this.ui.waitBegin();
      await me.beginDuel(this.id);
    } else {
      this.id = this.o.code;
      await me.joinDuel(this.id, this.o.fighter);
      this.ui.status('Joined. Waiting for player 1 to begin the war…');
      while (!(d = await me.fetchDuelEr(this.id).catch(() => null))) await sleep(2000);
    }
    await me.hideMyMove(this.id);
    if (this.o.create) {
      await me.publishDuel(this.id).catch(() => {});
      await me.requestOmen(this.id).catch(() => {});
    }
    for (let i = 0; i < 6; i++) { d = await me.fetchDuelEr(this.id); if (d.omen !== 255) break; await sleep(800); }
    this.p1 = d.player1; this.p2 = d.player2;
    this.mySide = this.o.create ? 0 : 1;
    this.state = duelToState(d);
    this.state.maxHp = [ROSTER[d.fighter1].hp, ROSTER[d.fighter2].hp];
    this.PublicKey = PublicKey;
    return this.state;
  }
  async play(move) {
    const { duelToState } = this.c;
    await this.me.makeChoice(this.id, move);
    this.ui.status('Your move is sealed in the TEE · waiting for your opponent…');
    const beat = this.state.beat;
    let d;
    for (;;) {
      await this.me.tryReveal(this.id, this.p1, this.p2).catch(() => null);
      d = await this.me.fetchDuelEr(this.id).catch(() => null);
      if (d && d.beat > beat) break;
      await sleep(1200);
    }
    const s = duelToState(d);
    s.maxHp = this.state.maxHp;
    this.state = s;
    // Side 0 is always player 1 on screen; the HUD marks which side is "YOU".
    return { moves: s.lastMoves, taken: s.lastTaken, winner: s.winner, state: s };
  }
  async after(state) {
    if (state.winner !== -1) return;
    if (this.mySide === 0) await this.me.nextBeat(this.id, this.p1, this.p2);
    else for (let i = 0; i < 30; i++) { const d = await this.me.fetchDuelEr(this.id); if (!d.revealed) break; await sleep(800); }
  }
  async finish() {
    if (this.mySide !== 0) { await this.me.sweepSession().catch(() => {}); return 'Player 1 settles the pot on Solana.'; }
    await this.me.undelegateAll(this.id, this.p1, this.p2);
    await this.me.waitOnBase(this.id);
    await this.me.claimPot(this.id, this.p1, this.p2);
    await this.me.sweepSession().catch(() => {});
    return `Duel #${this.id} settled on Solana.`;
  }
}

// ---------------- Mode ----------------
export class DharmaYuddha {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.actors = [];
    this.pick = 0;
    this.foe = 2;
    this.anim = null;
    this.busy = false;
    this.camAng = 0.6;
    this.chain = null;
    this.buildLobby();
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const n = +e.key;
      if (n >= 1 && n <= 5) this.choose(n - 1);
    });
  }

  // ---------- Lobby ----------
  buildLobby() {
    const grid = $('dyRoster');
    ROSTER.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'dy-card';
      card.style.setProperty('--c', '#' + f.color.toString(16).padStart(6, '0'));
      card.innerHTML = `<div class="army">${f.army}</div><h3>${f.name}</h3><div class="epithet">${f.title}</div>
        <div class="blurb">${f.blurb}</div><div class="nums">HP ${f.hp} · Astra ${f.astraName} ${f.astra} (${f.cost} prana)</div>`;
      card.addEventListener('click', (e) => {
        if (e.shiftKey || e.altKey) this.foe = f.id; else this.pick = f.id;
        this.refreshLobby();
      });
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); this.foe = f.id; this.refreshLobby(); });
      grid.appendChild(card);
    });
    document.querySelectorAll('#dyModes button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#dyModes button').forEach((x) => x.classList.toggle('on', x === b));
      this.mode = b.dataset.m;
      this.refreshLobby();
    }));
    this.mode = 'practice';
    $('dyFight').addEventListener('click', () => this.launch());
    $('dyBack').addEventListener('click', () => this.g.toHub());
    this.g.walletBar.onChange(() => { if (!$('dy').classList.contains('hidden')) this.refreshLobby(); });
    $('dyBetBtn').addEventListener('click', () => this.bet());
    $('dyBegin').addEventListener('click', () => { $('dyBegin').classList.add('hidden'); this.beginResolve?.(); });
    $('dyDone').addEventListener('click', () => this.g.toHub());
    $('dyAgain').addEventListener('click', () => { this.teardown(); this.openLobby(); });
    const moves = $('dyMoves');
    MOVES.forEach((m) => {
      const b = document.createElement('button');
      b.dataset.m = m.id;
      b.innerHTML = `<kbd>${m.key1}</kbd><b>${m.name}</b><small>${m.desc}</small>`;
      b.addEventListener('click', () => this.choose(m.id));
      moves.appendChild(b);
    });
    this.refreshLobby();
  }

  async loadChain() {
    if (!this.chain) this.chain = await import('./chain.js');
    return this.chain;
  }

  async refreshLobby() {
    document.querySelectorAll('.dy-card').forEach((c, i) => {
      c.classList.toggle('me', i === this.pick);
      c.classList.toggle('foe', i === this.foe && (this.mode === 'practice' || this.mode === 'bot'));
    });
    const m = this.mode;
    $('dyFoeTip').classList.toggle('hidden', !(m === 'practice' || m === 'bot'));
    $('dyPvp').classList.toggle('hidden', m !== 'pvp');
    $('dyWatch').classList.toggle('hidden', m !== 'watch');
    $('dyFight').textContent = { practice: 'FIGHT', bot: 'FIGHT ON-CHAIN', pvp: 'ENTER DUEL', watch: 'WATCH' }[m];
    const onchain = m !== 'practice';
    $('dyWallet').classList.toggle('hidden', !onchain);
    if (!onchain) { $('dyFight').disabled = false; return; }
    const c = await this.loadChain();
    if (!c.chainReady()) {
      $('dyWalletInfo').innerHTML = '<b>Program not deployed yet.</b> Build and deploy <code>onchain/</code> to devnet (see README), then reload. Practice mode works now.';
      $('dyFight').disabled = true;
      return;
    }
    if (!(await c.programDeployed())) {
      $('dyWalletInfo').innerHTML = `<b>Smart contract not live on devnet yet</b> (<a target="_blank" href="${c.explorerAddr(c.PROGRAM_ID.toBase58())}">program ${c.PROGRAM_ID.toBase58().slice(0, 6)}…</a> has no code). On-chain modes unlock automatically once it is deployed. Practice works now.`;
      $('dyFight').disabled = true;
      return;
    }
    this.renderWallet();
  }

  // The wallet itself is connected from the bar at the top of the screen.
  renderWallet() {
    const w = this.g.wallet;
    $('dyFight').disabled = !w;
    $('dyWalletInfo').innerHTML = w
      ? `Playing with <b>${w.name}</b> · ${w.publicKey.toBase58().slice(0, 4)}…${w.publicKey.toBase58().slice(-4)} on Solana Devnet. Your wallet approves the stake once; a session key signs each hidden move.`
      : '<b>Connect your wallet</b> with the button at the top right (Phantom, MetaMask, Core, Solflare…) to play on-chain.';
  }

  openLobby() {
    this.active = false;
    $('dy').classList.remove('hidden');
    $('dyLobby').classList.remove('hidden');
    $('dyResult').classList.add('hidden');
    $('dyHud').classList.add('hidden');
    this.g.keys.hide();
    this.refreshLobby();
  }

  // Entry from the main menu.
  enter() {
    this.g.state = 'yuddha';
    this.openLobby();
    this.ensureActors(this.pick, this.foe);
    this.g.loadArena('ashoka');
  }

  ensureActors(f0, f1) {
    if (this.actors[0]?.def.id === f0 && this.actors[1]?.def.id === f1) return;
    this.actors.forEach((a) => a.dispose(this.g.scene));
    this.actors = [new Actor(this.g.scene, ROSTER[f0], 0), new Actor(this.g.scene, ROSTER[f1], 1)];
  }

  // ---------- Match flow ----------
  ui() {
    return {
      status: (t) => { $('dyStatus').textContent = t; },
      log: (e) => this.logTx(e),
      showCode: (id) => { $('dyCode').textContent = `Duel code: ${id}`; $('dyCode').classList.remove('hidden'); },
      waitBegin: () => new Promise((r) => { this.beginResolve = r; $('dyBegin').classList.remove('hidden'); }),
    };
  }

  async launch() {
    const m = this.mode;
    if (m === 'watch') return this.watch();
    $('dyLobby').classList.add('hidden');
    $('dyHud').classList.remove('hidden');
    this.g.keys.show('dharma');
    $('dyTx').innerHTML = '';
    $('dyCode').classList.add('hidden');
    this.setMovesEnabled(false);
    this.active = true;
    const ui = this.ui();
    try {
      if (m === 'practice') this.ctl = new PracticeController(this.pick, this.foe);
      else {
        const c = await this.loadChain();
        if (!this.g.wallet) throw new Error('Connect a wallet first.');
        if (m === 'bot') this.ctl = new ChainBotController(c, ui, this.g.wallet, this.pick, this.foe);
        else {
          const code = $('dyJoinCode').value.trim();
          const stake = Math.max(0, +$('dyStake').value || 0);
          this.ctl = new ChainPvPController(c, ui, this.g.wallet, { create: !code, code: code ? +code : 0, stake, fighter: this.pick });
        }
      }
      $('dyModeLabel').textContent = this.ctl.label;
      ui.status('Preparing the battlefield…');
      const s = await this.ctl.start();
      this.mySide = this.ctl.mySide ?? 0;
      this.state = s;
      this.ensureActors(s.fighter[0], s.fighter[1]);
      const arena = DY_ARENAS[(s.arena ?? 0) % DY_ARENAS.length];
      this.g.loadArena(arena.id);
      this.resetActors();
      this.renderHud();
      const omen = s.omenSide >= 0 ? `The omen favours ${ROSTER[s.fighter[s.omenSide]].name} (+25 prana)` : '';
      this.g.announce('DHARMA YUDDHA', `${arena.name}${omen ? ' · ' + omen : ''}`, 2.4);
      this.g.audio.conch();
      this.awaitMove();
    } catch (e) {
      console.error(e);
      ui.status('⚠ ' + (e.message || e));
      $('dyLobby').classList.remove('hidden');
      $('dyHud').classList.add('hidden');
      $('dyErr').textContent = e.message || String(e);
      this.active = false;
    }
  }

  resetActors() {
    this.actors.forEach((a) => {
      a.root.position.copy(a.home);
      a.pose = 'stance'; a.args = {};
      a.root.visible = true;
    });
    this.anim = null;
  }

  awaitMove() {
    this.busy = false;
    this.setMovesEnabled(true);
    $('dyStatus').textContent = `Beat ${this.state.beat + 1} · choose your move in secret (keys 1–5)`;
  }

  setMovesEnabled(on) {
    document.querySelectorAll('#dyMoves button').forEach((b) => {
      const id = +b.dataset.m;
      const ok = on && (id !== ASTRA || canUse(this.state ?? { prana: [0, 0], fighter: [0, 0] }, this.mySide ?? 0, ASTRA));
      b.disabled = !ok;
    });
  }

  async choose(move) {
    if (!this.active || this.busy || !this.state || this.state.winner !== -1) return;
    if (!canUse(this.state, this.mySide, move)) { this.g.toast('NOT ENOUGH PRANA'); return; }
    this.busy = true;
    this.setMovesEnabled(false);
    document.querySelectorAll('#dyMoves button').forEach((b) => b.classList.toggle('chosen', +b.dataset.m === move));
    $('dyStatus').textContent = this.ctl instanceof PracticeController ? 'Opponent is choosing…' : 'Sealing your move inside the TEE…';
    this.g.audio.bell();
    try {
      const out = await this.ctl.play(move);
      this.state = out.state;
      await this.playBeat(out);
      if (out.state.winner !== -1) return this.endMatch(out.state);
      $('dyStatus').textContent = 'Clearing the beat…';
      await this.ctl.after(out.state);
      document.querySelectorAll('#dyMoves button').forEach((b) => b.classList.remove('chosen'));
      this.awaitMove();
    } catch (e) {
      console.error(e);
      $('dyStatus').textContent = '⚠ ' + (e.message || e) + ' · press the move again to retry';
      this.busy = false;
      this.setMovesEnabled(true);
    }
  }

  async endMatch(s) {
    this.setMovesEnabled(false);
    const w = s.winner;
    const name = w === 2 ? 'DRAW' : ROSTER[s.fighter[w]].name;
    let note = '';
    try { note = (await this.ctl.finish(s)) || ''; } catch (e) { note = 'Settlement pending: ' + (e.message || e); }
    const won = w === this.mySide;
    $('dyResultTitle').textContent = w === 2 ? 'SAMA · DRAW' : won ? 'VIJAYA' : 'PARAJAYA';
    $('dyResultText').textContent = `${w === 2 ? 'Both warriors fall.' : name + ' wins the duel.'} ${note}`;
    $('dyResult').classList.remove('hidden');
  }

  // ---------- Spectating ----------
  async watch() {
    const c = await this.loadChain();
    const id = +$('dyWatchCode').value.trim();
    if (!id) { $('dyErr').textContent = 'Enter a duel code to watch.'; return; }
    if (!this.g.wallet) { $('dyErr').textContent = 'Connect a wallet to watch and bet.'; return; }
    const client = new c.DuelClient(this.g.wallet, c.newSession(), (e) => this.logTx(e));
    this.spec = { c, client, id };
    const pool = await client.fetchPool(id).catch(() => null);
    const d = await client.fetchDuel(id).catch(() => null);
    if (!d) { $('dyErr').textContent = 'No duel with that code.'; return; }
    const s = c.duelToState(d);
    $('dyPool').innerHTML = `${ROSTER[s.fighter[0]].name} vs ${ROSTER[d.player2 ? s.fighter[1] : 0].name}<br>
      Pool: <b>${((pool?.total1?.toNumber() ?? 0) / 1e9).toFixed(2)}</b> SOL · <b>${((pool?.total2?.toNumber() ?? 0) / 1e9).toFixed(2)}</b> SOL
      ${s.started ? '<br><i>Betting closed — the duel is in the rollup.</i>' : ''}`;
    $('dyBetRow').classList.toggle('hidden', s.started || !d.player2);
    if (!s.started) return;
    // Follow the live duel beat by beat.
    $('dyLobby').classList.add('hidden');
    $('dyHud').classList.remove('hidden');
    $('dyModeLabel').textContent = `Spectating duel #${id}`;
    this.active = true; this.mySide = -1;
    this.setMovesEnabled(false);
    s.maxHp = [ROSTER[s.fighter[0]].hp, ROSTER[s.fighter[1]].hp];
    this.state = s;
    this.ensureActors(s.fighter[0], s.fighter[1]);
    this.g.loadArena(DY_ARENAS[s.arena % DY_ARENAS.length].id);
    this.resetActors();
    this.renderHud();
    let beat = s.beat;
    while (this.active && this.state.winner === -1) {
      $('dyStatus').textContent = 'Both warriors are choosing in secret…';
      const nd = await client.fetchDuel(id).catch(() => null);
      if (nd && nd.beat > beat) {
        const ns = c.duelToState(nd);
        ns.maxHp = s.maxHp;
        beat = ns.beat;
        this.state = ns;
        await this.playBeat({ moves: ns.lastMoves, taken: ns.lastTaken, winner: ns.winner, state: ns });
      } else await sleep(1500);
    }
    if (this.active) {
      $('dyResultTitle').textContent = 'YUDDHA ENDS';
      $('dyResultText').textContent = this.state.winner === 2 ? 'A draw.' : `${ROSTER[this.state.fighter[this.state.winner]].name} wins. Bettors can claim from the lobby once it settles.`;
      $('dyResult').classList.remove('hidden');
    }
  }

  async bet() {
    const sp = this.spec;
    if (!sp) return;
    const side = +$('dyBetSide').value, amt = +$('dyBetAmt').value;
    try { await sp.client.placeBet(sp.id, side, amt); $('dyErr').textContent = 'Bet placed!'; this.watch(); }
    catch (e) { $('dyErr').textContent = e.message || String(e); }
  }

  logTx(e) {
    const el = $('dyTx');
    const row = document.createElement('div');
    row.className = e.layer === 'rollup' ? 'er' : 'sol';
    row.innerHTML = e.sig
      ? `<span>${e.layer === 'rollup' ? 'ER' : 'SOL'}</span> ${e.label} · ${e.layer === 'rollup' ? e.sig.slice(0, 8) + '…' : `<a target="_blank" href="https://explorer.solana.com/tx/${e.sig}?cluster=devnet">${e.sig.slice(0, 8)}…</a>`}`
      : `<span>·</span> ${e.label}`;
    el.prepend(row);
    while (el.children.length > 7) el.lastChild.remove();
  }

  // ---------- HUD ----------
  renderHud() {
    const s = this.state;
    for (const side of [0, 1]) {
      const f = ROSTER[s.fighter[side]];
      const p = side === 0 ? 'dyA' : 'dyB';
      $(p + 'Name').textContent = f.name + (side === this.mySide ? ' (YOU)' : '');
      $(p + 'Hp').style.width = `${(s.hp[side] / s.maxHp[side]) * 100}%`;
      $(p + 'HpTxt').textContent = `${s.hp[side]} / ${s.maxHp[side]}`;
      $(p + 'Prana').style.width = `${s.prana[side]}%`;
      $(p + 'PranaBox').classList.toggle('full', s.prana[side] >= f.cost);
      $(p + 'Omen').classList.toggle('hidden', s.omenSide !== side);
    }
    $('dyBeat').textContent = `BEAT ${s.beat + (s.winner === -1 ? 1 : 0)}`;
  }

  // ---------- Beat presentation ----------
  playBeat(out) {
    return new Promise((resolve) => {
      const [m0, m1] = out.moves;
      const fx = $('dyReveal');
      fx.innerHTML = `<span style="color:${hex(ROSTER[this.state.fighter[0]].color)}">${MOVES[m0].name}</span><i>vs</i><span style="color:${hex(ROSTER[this.state.fighter[1]].color)}">${MOVES[m1].name}</span>`;
      fx.classList.remove('show'); void fx.offsetWidth; fx.classList.add('show');
      this.anim = { t: 0, moves: out.moves, taken: out.taken, winner: out.winner, impacted: false, resolve, proj: [] };
    });
  }

  impact() {
    const a = this.anim, g = this.g;
    const [m0, m1] = a.moves;
    for (const side of [0, 1]) {
      const me = this.actors[side], foe = this.actors[1 - side];
      const taken = a.taken[side];
      const myMove = a.moves[side], theirMove = a.moves[1 - side];
      if (taken > 0) {
        me.flash = 1;
        const col = foe.def.color;
        g.vfx.burst(me.chest(), { count: taken >= 18 ? 70 : 34, color: col, color2: 0xffffff, speed: taken >= 18 ? 8 : 5, life: 0.6, size: 0.2 });
        g.vfx.flash(me.chest(), col, 30 + taken * 2);
        g.audio.hit(taken >= 18);
        g.shake(Math.min(0.8, 0.15 + taken / 40));
        this.floatText(me, `-${taken}`, '#ff6a5a');
      } else if (myMove === GUARD && (theirMove === STRIKE || theirMove === ASTRA)) {
        g.vfx.ring(me.root.position.clone(), 0xbfe6ff, 2.4, 0.4, 1.2);
        g.audio.parry();
        this.floatText(me, theirMove === STRIKE ? 'PARRY' : 'GUARDED', '#bfe6ff');
      } else if (myMove === EVADE && (theirMove === HEAVY || theirMove === ASTRA || theirMove === STRIKE)) {
        g.audio.dodge();
        this.floatText(me, 'EVADE', '#d8ffd0');
      }
    }
    if (m0 === HEAVY || m1 === HEAVY) for (const s of [0, 1]) if (a.moves[s] === HEAVY) g.vfx.ring(this.actors[1 - s].root.position.clone(), 0xffb060, 3, 0.45);
    // Outcome caption.
    const t = a.taken;
    const name = (s) => ROSTER[this.state.fighter[s]].name;
    let cap = '';
    if (t[0] === 0 && t[1] === 0) cap = 'NO BLOOD DRAWN · PRANA GATHERS';
    else if (t[0] > 0 && t[1] > 0) cap = 'BLOWS TRADED';
    else cap = `${name(t[1] > 0 ? 0 : 1)} WINS THE EXCHANGE`;
    g.toast(cap);
    this.renderHud();
  }

  floatText(actor, text, color) {
    const el = document.createElement('div');
    el.className = 'dy-float';
    el.textContent = text;
    el.style.color = color;
    $('dyHud').appendChild(el);
    const p = actor.chest().add(new THREE.Vector3(0, 0.9, 0)).project(this.g.camera);
    el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    setTimeout(() => el.remove(), 1300);
  }

  spawnAstra(from, to, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) }));
    m.position.copy(from.hand());
    this.g.scene.add(m);
    this.anim.proj.push({ m, from: m.position.clone(), to: to.chest(), t: 0, color });
    this.g.audio.fire();
  }

  // Per-frame animation of the current beat.
  stepBeat(dt) {
    const a = this.anim;
    a.t += dt;
    const T = a.t;
    for (const side of [0, 1]) {
      const act = this.actors[side];
      const mv = a.moves[side];
      const melee = mv === STRIKE || mv === HEAVY;
      const near = new THREE.Vector3(0, 0, -act.dir * 1.15 * (act.def.scale + 0.1));
      const k = (x0, x1) => Math.min(1, Math.max(0, (T - x0) / (x1 - x0)));
      const pos = act.root.position;
      let pose = 'stance', args = {};
      if (T < 0.45) {
        if (melee) pos.lerpVectors(act.home, near, k(0, 0.45));
        pose = 'stance'; args = { moving: melee, speedFrac: melee ? 1 : 0, phase: T * 12, fwd: 1, side: 0 };
      } else if (T < 1.4) {
        const u = (T - 0.45) / 0.95;
        if (mv === STRIKE) { pose = u < 0.5 ? 'swingR' : 'swingL'; args = { t: (u % 0.5) * 2, h0: 0.35, h1: 0.55 }; }
        else if (mv === HEAVY) { pose = 'overhead'; args = { t: u, h0: 0.5, h1: 0.62 }; }
        else if (mv === GUARD) pose = 'block';
        else if (mv === EVADE) { pose = 'dodge'; pos.x = Math.sin(Math.min(1, u * 1.4) * Math.PI) * 1.3 * (side ? -1 : 1); }
        else if (mv === ASTRA) {
          if (act.def.handed === 'L') { pose = 'draw'; args = { pull: Math.min(1, u * 2.2), released: u > 0.45 }; }
          else { pose = 'cast'; args = { t: u, h0: 0.4, h1: 0.55 }; }
          if (!a['fired' + side] && u > 0.42) { a['fired' + side] = true; this.spawnAstra(act, this.actors[1 - side], act.def.color); }
          if (Math.random() < 0.5) { const h = act.hand(); this.g.vfx.spawn(h.x, h.y, h.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.4, 0.2, act.def.color, 0, 1); }
        }
        // Being struck overrides the action pose briefly.
        if (a.impacted && a.taken[side] > 0 && T < 1.4) { pose = a.taken[side] >= 18 ? 'stagger' : 'hit'; args = { t: (T - 1.0) / 0.4 }; }
      } else {
        pos.lerp(act.home, Math.min(1, dt * 4));
        pos.x *= 1 - Math.min(1, dt * 6);
        if (a.winner !== -1 && a.winner !== 2) pose = a.winner === side ? 'victory' : 'ko';
        else if (a.winner === 2) pose = 'ko';
        args = { t: (T - 1.4) / 1.0 };
        if (pose === 'ko') pos.copy(pos);
      }
      act.pose = pose; act.args = args;
    }
    if (!a.impacted && T >= 1.0) { a.impacted = true; this.impact(); }
    for (let i = a.proj.length - 1; i >= 0; i--) {
      const p = a.proj[i];
      p.t += dt / 0.3;
      p.m.position.lerpVectors(p.from, p.to, Math.min(1, p.t));
      this.g.vfx.spawn(p.m.position.x, p.m.position.y, p.m.position.z, 0, 0.5, 0, 0.35, 0.3, p.color, 0, 1);
      if (p.t >= 1) { this.g.vfx.burst(p.to, { count: 40, color: p.color, speed: 6, life: 0.5, size: 0.25 }); this.g.scene.remove(p.m); a.proj.splice(i, 1); }
    }
    const end = a.winner !== -1 ? BEAT_LEN + 1.6 : BEAT_LEN;
    if (T >= end) {
      a.proj.forEach((p) => this.g.scene.remove(p.m));
      // Decided duels hold the KO / victory tableau; otherwise back to stance.
      this.anim = a.winner === -1 ? null : { ...a, proj: [], hold: true };
      a.resolve();
    }
  }

  // ---------- Frame ----------
  update(dt) {
    const g = this.g;
    if (this.anim) {
      if (this.anim.hold) {
        this.anim.t = Math.min(this.anim.t + dt, 3.2);
        this.actors.forEach((x, s) => { x.pose = this.anim.winner === 2 ? 'ko' : this.anim.winner === s ? 'victory' : 'ko'; x.args = { t: 1, time: x.clock }; });
      } else this.stepBeat(dt);
    } else this.actors.forEach((x) => { x.pose = 'stance'; x.args = {}; });
    this.actors.forEach((x) => x.update(dt));
    g.arena.update(dt, g.time, { fighting: false, fighters: [] });
    g.vfx.update(dt);
    // Side-on orbit camera framing both warriors.
    this.camAng += dt * 0.05;
    const r = 8.5 * Math.max(1, 1.25 / g.camera.aspect);
    const target = new THREE.Vector3(Math.cos(this.camAng) * r, 2.6, Math.sin(this.camAng) * r * 0.55 + 0.5);
    g.camera.position.lerp(target, 1 - Math.exp(-dt * 2));
    g.lookAt.lerp(new THREE.Vector3(0, 1.3, 0), 1 - Math.exp(-dt * 4));
    g.fill.position.copy(g.camera.position).add(new THREE.Vector3(0, 4, 0));
    g.fill.target.position.copy(g.lookAt);
    g.shakeAmt = Math.max(0, g.shakeAmt - dt * 1.8);
    const s = g.shakeAmt * g.shakeAmt * 0.35;
    g.camera.lookAt(g.lookAt.x + (Math.random() - 0.5) * s, g.lookAt.y + (Math.random() - 0.5) * s, g.lookAt.z);
    g.composer.render();
  }

  teardown() {
    this.active = false;
    this.anim = null;
    $('dyResult').classList.add('hidden');
    $('dyHud').classList.add('hidden');
    $('dyErr').textContent = '';
  }

  exit() {
    this.teardown();
    $('dy').classList.add('hidden');
    this.actors.forEach((a) => a.dispose(this.g.scene));
    this.actors = [];
  }
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
