// Rules parity tests. The same cases are asserted in Rust
// (onchain/programs/dharma-yuddha/src/lib.rs, mod tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROSTER } from '../src/duel/roster.js';
import { dealt, newState, resolveBeat, STRIKE, HEAVY, GUARD, EVADE, ASTRA } from '../src/duel/rules.js';

test('strike beats heavy, guard parries strike', () => {
  assert.equal(dealt(ROSTER[0], STRIKE, HEAVY), 11);
  assert.equal(dealt(ROSTER[3], HEAVY, STRIKE), 0);
  assert.equal(dealt(ROSTER[3], GUARD, STRIKE), 8);
});

test('evade counters heavy and astra, loses to strike', () => {
  assert.equal(dealt(ROSTER[1], EVADE, ASTRA), 9);
  assert.equal(dealt(ROSTER[2], ASTRA, EVADE), 0);
  assert.equal(dealt(ROSTER[0], STRIKE, EVADE), 11);
});

test('astra is halved by guard and by a clashing astra', () => {
  assert.equal(dealt(ROSTER[2], ASTRA, GUARD), 16);
  assert.equal(dealt(ROSTER[2], ASTRA, ASTRA), 16);
});

test('every matchup is non-negative and no move dominates', () => {
  for (const F of ROSTER) for (let m = 0; m < 5; m++) {
    let beats = 0, loses = 0;
    for (let t = 0; t < 5; t++) {
      const mine = dealt(F, m, t), theirs = dealt(F, t, m);
      assert.ok(mine >= 0 && theirs >= 0);
      if (mine > theirs) beats++; if (theirs > mine) loses++;
    }
    assert.ok(loses >= 1, `move ${m} should lose to something`);
  }
});

test('resolveBeat matches the Rust unit tests', () => {
  let s = newState(0, 3);
  resolveBeat(s, STRIKE, HEAVY);
  assert.deepEqual(s.hp, [110, 119]);
  resolveBeat(s, STRIKE, GUARD);
  assert.equal(s.hp[0], 102);
  s = newState(2, 1); s.prana[0] = 60;
  resolveBeat(s, ASTRA, EVADE);
  assert.deepEqual([s.hp[0], s.hp[1], s.prana[0]], [86, 100, 29]);
  s = newState(3, 2); s.hp[1] = 10;
  const out = resolveBeat(s, HEAVY, GUARD);
  assert.equal(out.winner, 0);
});
