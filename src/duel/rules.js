import { ROSTER } from './roster.js';

// Dharma Yuddha rules. This file is the JS twin of `resolve_beat` in
// onchain/programs/dharma-yuddha/src/lib.rs. The program is the referee on-chain; the
// browser uses this copy for practice matches and to predict animations.
// All maths is integer so both sides agree exactly.

export const MOVES = [
  { id: 0, key: 'strike', name: 'STRIKE', key1: '1', desc: 'Fast blow. Beats Heavy and Evade.' },
  { id: 1, key: 'heavy', name: 'HEAVY', key1: '2', desc: 'Guard-breaker. Beats Guard.' },
  { id: 2, key: 'guard', name: 'GUARD', key1: '3', desc: 'Parry. Beats Strike.' },
  { id: 3, key: 'evade', name: 'EVADE', key1: '4', desc: 'Sidestep. Beats Heavy and Astra.' },
  { id: 4, key: 'astra', name: 'ASTRA', key1: '5', desc: 'Divine weapon. Beats all but Evade. Costs prana.' },
];
export const STRIKE = 0, HEAVY = 1, GUARD = 2, EVADE = 3, ASTRA = 4;

export const START_PRANA = 20;
export const OMEN_PRANA = 25;
export const BEAT_PRANA = 15;
export const STALL_PRANA = 10;
export const MAX_BEATS = 40;

// Damage that `me` (using move m) deals to the opponent (using move t).
export function dealt(F, m, t) {
  switch (m) {
    case STRIKE: return t === HEAVY || t === EVADE ? F.strike : t === STRIKE ? (F.strike >> 1) : 0;
    case HEAVY: return t === GUARD ? F.heavy : t === HEAVY ? (F.heavy >> 1) : 0;
    case GUARD: return t === STRIKE ? F.parry : 0;
    case EVADE: return t === HEAVY || t === ASTRA ? F.counter : 0;
    case ASTRA: return t === STRIKE || t === HEAVY ? F.astra : t === GUARD || t === ASTRA ? (F.astra >> 1) : 0;
    default: return 0;
  }
}

const isStall = (m) => m === GUARD || m === EVADE;

export function canUse(state, side, move) {
  if (move !== ASTRA) return true;
  return state.prana[side] >= ROSTER[state.fighter[side]].cost;
}

// Applies one beat to `state` ({fighter:[a,b], hp:[a,b], prana:[a,b], beat})
// and returns the outcome used by the 3D presentation.
export function resolveBeat(state, m0, m1) {
  const F0 = ROSTER[state.fighter[0]], F1 = ROSTER[state.fighter[1]];
  const moves = [m0, m1];
  for (const s of [0, 1]) if (moves[s] === ASTRA) state.prana[s] -= ROSTER[state.fighter[s]].cost;
  const d0 = dealt(F0, m0, m1); // damage A deals to B
  const d1 = dealt(F1, m1, m0); // damage B deals to A
  const taken = [d1, d0];
  for (const s of [0, 1]) {
    state.hp[s] = Math.max(0, state.hp[s] - taken[s]);
    let gain = BEAT_PRANA + (taken[s] >> 1);
    if (isStall(m0) && isStall(m1)) gain += STALL_PRANA;
    state.prana[s] = Math.min(100, state.prana[s] + gain);
  }
  state.beat++;
  let winner = -1; // -1 ongoing, 0 / 1 side, 2 draw
  if (state.hp[0] === 0 && state.hp[1] === 0) winner = 2;
  else if (state.hp[0] === 0) winner = 1;
  else if (state.hp[1] === 0) winner = 0;
  else if (state.beat >= MAX_BEATS) winner = state.hp[0] === state.hp[1] ? 2 : state.hp[0] > state.hp[1] ? 0 : 1;
  state.winner = winner;
  return { moves, taken, winner };
}

export function newState(f0, f1, omenSide = -1) {
  const hp = [ROSTER[f0].hp, ROSTER[f1].hp];
  const prana = [START_PRANA, START_PRANA];
  if (omenSide === 0 || omenSide === 1) prana[omenSide] += OMEN_PRANA;
  return { fighter: [f0, f1], hp, maxHp: [...hp], prana, beat: 0, winner: -1, omenSide };
}

// A readable opponent: leans on its fighter's strengths, punishes repeats,
// and saves prana for an astra when the player keeps guarding.
export function botMove(state, side, history) {
  const me = ROSTER[state.fighter[side]];
  const theirs = history.map((h) => h[1 - side]);
  const w = [1, 1, 1, 1, 0];
  const last = theirs[theirs.length - 1];
  const counters = { [STRIKE]: GUARD, [HEAVY]: EVADE, [GUARD]: HEAVY, [EVADE]: STRIKE, [ASTRA]: EVADE };
  if (last !== undefined) w[counters[last]] += 1.4;
  if (theirs.length >= 2 && theirs[theirs.length - 1] === theirs[theirs.length - 2]) w[counters[last]] += 1.5;
  if (me.heavy >= 20) w[HEAVY] += 0.6;
  if (me.counter >= 8) w[EVADE] += 0.4;
  if (me.parry >= 9) w[GUARD] += 0.4;
  if (canUse(state, side, ASTRA)) w[ASTRA] = 1.2 + (theirs.slice(-3).filter((m) => m === GUARD).length * 0.8);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return STRIKE;
}
