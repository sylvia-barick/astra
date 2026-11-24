import { emptyCommand } from './input.js';

// Opponent AI: reacts with a human-like delay, blocks light attacks, dodges
// heavies / projectiles / ultimates, spaces itself, and spends Prana on astras.
const LEVELS = [
  { react: 0.42, block: 0.25, dodge: 0.2, aggro: 0.45, combo: 0.45, think: 0.35 },
  { react: 0.26, block: 0.5, dodge: 0.45, aggro: 0.65, combo: 0.75, think: 0.22 },
  { react: 0.15, block: 0.72, dodge: 0.7, aggro: 0.85, combo: 0.95, think: 0.12 },
];

export class AIController {
  constructor(level = 1) {
    this.L = LEVELS[level];
    this.think = 0;
    this.strafe = 1;
    this.mode = 'approach';
    this.modeT = 0;
    this.blockHold = 0;
    this.seenAction = null;
    this.seenProj = new Set();
    this.pending = null; // delayed reaction
  }

  command(dt, me, foe, projectiles) {
    const c = emptyCommand();
    const L = this.L;
    if (me.dead || foe.dead) return c;
    const dist = me.dist;
    const myRange = me.def.moves.light1.range * me.def.scale + 0.3;

    // ---- Defense: notice threats once, react after a delay ----
    const fa = foe.action;
    if (fa && fa !== this.seenAction) {
      this.seenAction = fa;
      const mv = fa.mv;
      let threat = null;
      if (mv.type === 'melee' && dist < mv.range * foe.def.scale + 1.2) threat = mv.heavy ? 'heavy' : 'light';
      if (mv.type === 'beam' || mv.type === 'storm') threat = 'ult';
      if (threat) {
        const r = Math.random();
        let resp = 'none';
        if (threat === 'light' && r < L.block) resp = 'block';
        else if ((threat === 'heavy' || threat === 'ult') && r < L.dodge) resp = 'dodge';
        else if (threat === 'heavy' && r < L.dodge + 0.15) resp = 'block';
        const delay = threat === 'ult' ? L.react + 0.35 + Math.random() * 0.3 : L.react * (0.6 + Math.random() * 0.6);
        this.pending = { resp, at: delay, threat };
      }
    }
    for (const p of projectiles) {
      if (p.owner === me || this.seenProj.has(p)) continue;
      this.seenProj.add(p);
      const r = Math.random();
      if (r < L.dodge) this.pending = { resp: 'dodge', at: L.react * 0.8, threat: 'proj' };
      else if (r < L.dodge + L.block * 0.5) this.pending = { resp: 'block', at: L.react * 0.6, threat: 'proj' };
    }
    if (this.seenProj.size > 50) this.seenProj.clear();

    if (this.pending) {
      this.pending.at -= dt;
      if (this.pending.at <= 0) {
        const { resp, threat } = this.pending;
        this.pending = null;
        if (resp === 'block') this.blockHold = threat === 'proj' ? 0.6 : 0.5 + Math.random() * 0.4;
        if (resp === 'dodge' && me.dodgeCd <= 0) {
          c.dodge = true;
          c.moveX = Math.random() < 0.5 ? -1 : 1;
          c.moveZ = threat === 'ult' && foe.def.id === 'ravana' ? -1 : 0;
          return c;
        }
      }
    }
    if (this.blockHold > 0) {
      this.blockHold -= dt;
      c.block = true;
      c.moveX = this.strafe * 0.3;
      return c;
    }

    // ---- Combo continuation ----
    if (me.action && me.action.mv.type === 'melee' && me.action.mv.next && me.action.hitDone && Math.random() < L.combo * dt * 12) c.light = true;
    if (me.action?.mv.type === 'projectile' && me.action.mv.chargeable) c.specialHeld = me.action.charge < 0.25 + Math.random() * 0.5;
    if (me.action?.mv.type === 'storm') { c.moveZ = 1; return c; }

    // ---- Offense / movement planning ----
    this.think -= dt;
    this.modeT -= dt;
    if (this.think <= 0) {
      this.think = L.think * (0.6 + Math.random() * 0.8);
      if (Math.random() < 0.15) this.strafe *= -1;
      if (this.modeT <= 0) {
        const r = Math.random();
        this.mode = r < L.aggro ? 'approach' : r < L.aggro + 0.2 ? 'circle' : 'retreat';
        this.modeT = 0.8 + Math.random() * 1.5;
      }
      if (me.free) {
        const ultReady = me.prana >= 100;
        if (ultReady && me.def.id === 'rama' && dist < 14 && (foe.stun > 0 || !foe.action || dist > 4)) { c.ultimate = true; return c; }
        if (ultReady && me.def.id === 'ravana' && dist < 3.2) { c.ultimate = true; return c; }
        if (me.prana >= me.def.specialCost + (ultReady ? 0 : 20) && dist > 5 && Math.random() < 0.35) { c.special = true; c.specialHeld = true; return c; }
        if (dist < myRange) {
          if (foe.stun > 0 || Math.random() < L.aggro) {
            const heavyBias = foe.blocking ? 0.6 : 0.2;
            if (Math.random() < heavyBias) c.heavy = true; else c.light = true;
            return c;
          }
        }
      }
    }

    if (!me.free) return c;
    if (this.mode === 'approach') {
      c.moveZ = dist > myRange * 0.85 ? 1 : 0;
      c.moveX = dist < 4 ? this.strafe * 0.4 : 0;
    } else if (this.mode === 'circle') {
      c.moveX = this.strafe;
      c.moveZ = dist > 6 ? 0.6 : dist < 3 ? -0.4 : 0;
      if (dist < myRange && Math.random() < 0.02) c.block = true;
    } else {
      c.moveZ = dist < 7 ? -1 : 0;
      c.moveX = this.strafe * 0.6;
    }
    return c;
  }
}
