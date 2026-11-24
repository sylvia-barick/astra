import * as THREE from 'three';
import { buildRakshasa, buildRavana, CRESCENT_GEO } from '../characters.js';
import { Animator } from '../animation.js';

// Asura enemies with stealth-aware AI:
// patrol → suspicious (?) → alert (!) → search → patrol.
// Ravana is a boss: always aware once engaged, with melee, fireball volleys,
// the Chandrahasa storm, summoned rakshasas, and the Dashanana revive.

const TYPES = {
  warrior: { hp: 45, scale: 1.0, walk: 1.6, run: 4.3, sight: 15, fov: 1.05, melee: { range: 1.9, windup: 0.55, dur: 1.0, dmg: 9 } },
  caster: { hp: 32, scale: 0.98, walk: 1.4, run: 3.2, sight: 18, fov: 1.05, ranged: { cd: 2.8, keep: 9, dmg: 8, speed: 12 } },
  ravana: { hp: 420, scale: 1.35, walk: 2.2, run: 3.9, sight: 40, fov: Math.PI, boss: true },
};

const rand = (a, b) => a + Math.random() * (b - a);
const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

let ICONS = null;
function icons() {
  if (ICONS) return ICONS;
  const make = (ch, color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,6,4,.75)'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = color; g.stroke();
    g.fillStyle = color; g.font = 'bold 42px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 32, 35);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  ICONS = { '?': make('?', '#ffd23a'), '!': make('!', '#ff3a2a') };
  return ICONS;
}

export class Enemy {
  constructor(adv, kind, spawn, route) {
    this.adv = adv;
    this.kind = kind;
    this.T = TYPES[kind];
    this.boss = !!this.T.boss;
    this.rig = kind === 'ravana' ? buildRavana() : buildRakshasa(kind);
    this.root = this.rig.root;
    this.root.scale.setScalar(this.T.scale);
    this.anim = new Animator(this.rig, 'R');
    adv.group.add(this.root);
    this.pos = this.root.position;
    this.pos.set(spawn[0], 0, spawn[1]);
    this.route = (route && route.length ? route : [spawn]).map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.wp = 0;
    this.wait = rand(0, 1.5);
    this.facing = rand(0, Math.PI * 2);
    this.hp = this.maxHp = this.T.hp;
    this.state = 'patrol';
    this.aware = 0;
    this.lastSeen = new THREE.Vector3();
    this.lostT = 0;
    this.searchT = 0;
    this.action = null;
    this.stun = 0;
    this.dead = false;
    this.deadT = 0;
    this.cd = rand(0.8, 1.6);
    this.clock = rand(0, 10);
    this.walkPhase = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.knock = new THREE.Vector3();
    if (this.boss) {
      this.revived = false; this.stormT = 6; this.summonT = 14; this.volleyCd = 2; this.slashAlt = false; this.engaged = false;
    }

    const I = icons();
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: I['?'], depthWrite: false }));
    this.icon.scale.set(0.5, 0.5, 1);
    this.icon.visible = false;
    adv.group.add(this.icon);
    this.barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a0606, depthWrite: false }));
    this.barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe0302a, depthWrite: false }));
    this.barBg.scale.set(0.9, 0.08, 1);
    this.barFg.scale.set(0.9, 0.08, 1);
    this.barBg.visible = this.barFg.visible = false;
    adv.group.add(this.barBg, this.barFg);
  }

  chest() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.2 * this.T.scale, this.pos.z); }
  get forward() { return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  get aware01() { return this.state === 'alert' ? 1 : this.aware; }

  becomeAlert(spread) {
    if (this.dead) return;
    if (this.state !== 'alert') {
      this.state = 'alert';
      this.aware = 1;
      this.cd = Math.max(this.cd, 0.5);
      this.adv.onEnemyAlert(this);
      if (spread) this.adv.alertNearby(this);
    }
  }

  takeHit(dmg) {
    if (this.dead || this.invuln > 0) return 0;
    const unaware = this.state !== 'alert' && !this.boss;
    if (unaware) dmg *= 3;
    this.hp -= dmg;
    this.hitFlash = 1;
    const away = this.pos.clone().sub(this.adv.hero.pos).setY(0).normalize();
    this.knock.addScaledVector(away, this.boss ? 1 : 3);
    if (!this.boss || Math.random() < 0.2) {
      if (!(this.boss && this.action)) { this.stun = 0.35; this.action = null; this.clearStorm(); }
    }
    this.lastSeen.copy(this.adv.hero.pos);
    if (this.boss) this.engaged = true;
    this.becomeAlert(true);
    if (this.hp <= 0) {
      if (this.boss && !this.revived) {
        this.revived = true;
        this.hp = this.maxHp * 0.35;
        this.invuln = 1.6;
        this.stun = 1.4;
        this.action = null;
        this.clearStorm();
        this.rig.heads[1 + Math.floor(Math.random() * 9)].visible = false;
        this.adv.onBossRevive(this);
      } else {
        this.die();
      }
    }
    return unaware ? 3 : 1;
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.action = null;
    this.clearStorm();
    this.icon.visible = this.barBg.visible = this.barFg.visible = false;
    this.adv.onEnemyKilled(this);
  }

  // Returns true when the corpse can be removed.
  update(dt, hero) {
    const A = this.adv;
    this.clock += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dead) {
      this.deadT += dt;
      this.anim.update(dt, 'ko', { t: this.deadT }, this.clock);
      if (this.deadT > 2.5) this.pos.y -= dt * 0.7;
      this.flash();
      return this.deadT > 4.5;
    }

    // ---------- Perception ----------
    const toH = new THREE.Vector3().subVectors(hero.pos, this.pos).setY(0);
    const d = toH.length();
    const dir = d > 1e-3 ? toH.clone().divideScalar(d) : this.forward;
    let sees = false;
    if (!hero.dead) {
      const range = this.T.sight * (hero.crouch ? 0.55 : 1);
      const inCone = this.T.fov >= Math.PI || this.forward.dot(dir) > Math.cos(this.T.fov) || d < 2.2;
      const hidden = hero.hidden && d > 2.2;
      if (d < range && inCone && !hidden && !A.losBlocked(this.chest(), hero.chest())) sees = true;
      if (!hero.crouch && hero.moving && d < 5.5 && !hidden) sees = true; // hears running footsteps
      if (this.boss && !this.engaged && d > 15) sees = false;
    }
    if (sees) {
      this.lastSeen.copy(hero.pos);
      this.lostT = 0;
      if (this.state !== 'alert') {
        const rate = (1.7 * (1 - d / (this.T.sight + 1)) + 0.3) * (hero.crouch ? 0.5 : 1);
        this.aware = Math.min(1, this.aware + rate * dt);
      }
    } else {
      this.lostT += dt;
      if (this.state !== 'alert') this.aware = Math.max(0, this.aware - dt * 0.25);
    }
    if (this.boss && sees) this.engaged = true;
    if (this.state !== 'alert' && this.aware >= 1) this.becomeAlert(true);
    else if (this.state === 'patrol' && this.aware > 0.3) this.state = 'suspicious';
    else if (this.state === 'suspicious' && this.aware < 0.12) this.state = 'patrol';
    if (this.state === 'alert' && this.lostT > 4.5 && !this.boss) { this.state = 'search'; this.searchT = 5; this.aware = 0.6; }
    if (this.state === 'search') {
      this.searchT -= dt;
      if (this.searchT <= 0) { this.state = 'patrol'; this.aware = 0.15; }
    }
    if (hero.dead && this.state === 'alert') { this.state = 'patrol'; this.aware = 0; }

    // ---------- Behaviour ----------
    let move = null, speed = 0, pose = 'stance', args = { moving: false }, turnTo = null, turnRate = 6;
    this.cd -= dt;
    if (this.stun > 0) {
      this.stun -= dt;
      pose = this.boss && this.revived && this.invuln > 0 ? 'revive' : 'hit';
      args = { t: 1 - Math.max(0, this.stun) / 0.35 };
    } else if (this.action) {
      const r = this.updateAction(dt, hero, d, dir);
      pose = r.pose; args = r.args; turnTo = r.turnTo; move = r.move; speed = r.speed || 0;
    } else if (this.state === 'patrol') {
      const wp = this.route[this.wp];
      const v = new THREE.Vector3(wp.x - this.pos.x, 0, wp.z - this.pos.z);
      if (v.length() < 0.4) {
        this.wait -= dt;
        if (this.wait <= 0) { this.wp = (this.wp + 1) % this.route.length; this.wait = rand(1, 2.2); }
        if (this.route.length === 1) this.facing += Math.sin(this.clock * 0.6) * dt * 0.6;
      } else { move = v.normalize(); speed = this.T.walk; }
    } else if (this.state === 'suspicious') {
      turnTo = this.lastSeen;
      if (this.pos.distanceTo(this.lastSeen) > 3) { move = this.lastSeen.clone().sub(this.pos).setY(0).normalize(); speed = this.T.walk * 0.7; }
    } else if (this.state === 'search') {
      const v = this.lastSeen.clone().sub(this.pos).setY(0);
      if (v.length() > 0.8) { move = v.normalize(); speed = this.T.walk * 1.4; }
      else this.facing += dt * 1.6;
    } else if (this.state === 'alert') {
      const r = this.combat(dt, hero, d, dir);
      if (r) { move = r.move; speed = r.speed || 0; turnTo = r.turnTo; }
    }

    // ---------- Integrate ----------
    if (move && speed > 0) {
      this.pos.addScaledVector(move, speed * dt);
      if (!turnTo) turnTo = this.pos.clone().add(move);
    }
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-dt * 6));
    A.collide(this.pos, 0.42 * this.T.scale);
    this.pos.y = A.groundY(this.pos.x, this.pos.z);
    if (turnTo) this.facing = angleLerp(this.facing, Math.atan2(turnTo.x - this.pos.x, turnTo.z - this.pos.z), Math.min(1, dt * turnRate));
    this.root.rotation.y = this.facing;
    if (pose === 'stance' && speed > 0 && !this.action) {
      this.walkPhase += dt * speed * 2.1;
      args = { moving: true, speedFrac: Math.min(1.3, speed / 3.5), phase: this.walkPhase, fwd: 1, side: 0 };
    }
    this.anim.update(dt, pose, args, this.clock);
    this.flash();
    this.updateUI();
    if (this.stormFx) {
      this.stormFx.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.stormFx.rotation.y += dt * 9;
    }
    if (this.rig.orb) this.rig.orb.scale.setScalar(1 + Math.sin(this.clock * 6) * 0.15 + (this.action ? 0.5 : 0));
    return false;
  }

  flash() {
    const f = this.hitFlash;
    for (const m of this.rig.flashMats) m.emissive.setRGB(f * 0.9, f * 0.6, f * 0.4);
  }

  updateUI() {
    const top = this.pos.y + 2.25 * this.T.scale;
    if (!this.boss && (this.state === 'alert' || this.state === 'suspicious' || this.state === 'search')) {
      this.icon.visible = true;
      this.icon.material.map = icons()[this.state === 'alert' ? '!' : '?'];
      this.icon.position.set(this.pos.x, top + 0.45 + Math.sin(this.clock * 6) * 0.04, this.pos.z);
      const s = this.state === 'suspicious' ? 0.3 + this.aware * 0.3 : 0.55;
      this.icon.scale.set(s, s, 1);
    } else this.icon.visible = false;
    const showBar = !this.boss && this.hp < this.maxHp;
    this.barBg.visible = this.barFg.visible = showBar;
    if (showBar) {
      const f = Math.max(0.02, this.hp / this.maxHp);
      this.barBg.position.set(this.pos.x, top + 0.12, this.pos.z);
      this.barFg.position.copy(this.barBg.position);
      this.barFg.scale.x = 0.9 * f;
      this.barFg.center.set(0.5 / f, 0.5);
    }
  }

  // Alert behaviour: decide movement or start an attack.
  combat(dt, hero, d, dir) {
    const A = this.adv, T = this.T;
    if (this.kind === 'warrior') {
      const range = T.melee.range * T.scale;
      if (d > range) return { move: dir, speed: T.run, turnTo: hero.pos };
      if (this.cd <= 0) {
        this.action = { type: 'melee', t: 0, dur: T.melee.dur, hitAt: T.melee.windup, dmg: T.melee.dmg, range, pose: 'overhead' };
        this.cd = rand(1.0, 1.7);
      }
      return { turnTo: hero.pos };
    }
    if (this.kind === 'caster') {
      const R = T.ranged;
      const blocked = A.losBlocked(this.chest(), hero.chest());
      let move = null, speed = 0;
      if (d < R.keep - 2.5) { move = dir.clone().negate(); speed = T.walk * 1.3; }
      else if (d > R.keep + 4 || blocked) { move = dir; speed = T.run; }
      else { move = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.clock * 0.7) > 0 ? 1 : -1); speed = T.walk * 0.6; }
      if (this.cd <= 0 && !blocked && d < R.keep + 8) {
        this.action = { type: 'cast', t: 0, dur: 0.85, fireAt: 0.45, dmg: R.dmg, speed: R.speed, spread: [0] };
        this.cd = R.cd + rand(0, 1);
      }
      return { move, speed, turnTo: hero.pos };
    }
    // ---- Ravana ----
    if (!this.engaged) return { turnTo: hero.pos };
    this.stormT -= dt; this.summonT -= dt; this.volleyCd -= dt;
    const low = this.hp < this.maxHp * 0.5;
    if (low && this.stormT <= 0 && d < 9) {
      this.action = { type: 'storm', t: 0, dur: 2.6, tick: 0 };
      this.stormT = 10;
      A.announce('CHANDRAHASA STORM', 'Run!', 1.2);
      A.g.audio.roar();
      return null;
    }
    if (this.summonT <= 0 && A.livingMinions() < 2) {
      this.action = { type: 'summon', t: 0, dur: 1.3, fireAt: 0.6 };
      this.summonT = 18;
      return null;
    }
    if (d < 2.9 * T.scale * 0.85 && this.cd <= 0) {
      this.slashAlt = !this.slashAlt;
      this.action = { type: 'melee', t: 0, dur: 0.8, hitAt: 0.34, dmg: 16, range: 3.0, pose: this.slashAlt ? 'swingR' : 'swingL' };
      this.cd = rand(0.5, 1.0);
      return null;
    }
    if (this.volleyCd <= 0 && d > 4.5) {
      this.action = { type: 'cast', t: 0, dur: 0.95, fireAt: 0.45, dmg: 12, speed: 15, spread: low ? [-0.35, -0.17, 0, 0.17, 0.35] : [-0.2, 0, 0.2] };
      this.volleyCd = low ? 2.6 : 3.4;
      return null;
    }
    return { move: d > 2.4 ? dir : null, speed: T.run, turnTo: hero.pos };
  }

  updateAction(dt, hero, d, dir) {
    const A = this.adv, a = this.action;
    a.t += dt;
    if (a.type === 'melee') {
      const h0 = a.hitAt / a.dur, h1 = (a.hitAt + 0.12) / a.dur;
      if (!a.done && a.t >= a.hitAt - 0.08 && !a.whoosh) { a.whoosh = true; A.g.audio.whoosh(true); }
      if (!a.done && a.t >= a.hitAt) {
        a.done = true;
        if (d < a.range + 0.35 && this.forward.dot(dir) > 0.3) A.damageHero(a.dmg, this.pos);
        if (this.boss) A.g.vfx.ring(this.pos.clone().addScaledVector(this.forward, 1.6), 0xb070ff, 2.5, 0.4, this.pos.y + 0.05);
      }
      if (a.t >= a.dur) this.action = null;
      return { pose: a.pose, args: { t: a.t / a.dur, h0, h1 }, turnTo: a.t < a.hitAt ? hero.pos : null, move: a.t < a.hitAt && d > 1.6 ? dir : null, speed: 2 };
    }
    if (a.type === 'cast') {
      if (!a.done && a.t >= a.fireAt) {
        a.done = true;
        const src = this.rig.handR.getWorldPosition(new THREE.Vector3());
        if (this.rig.orb) this.rig.orb.getWorldPosition(src);
        const base = hero.chest().sub(src).normalize();
        for (const s of a.spread) A.spawnFireball(src, base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s), a.dmg, a.speed, this.boss);
      }
      if (a.t >= a.dur) this.action = null;
      return { pose: 'cast', args: { t: a.t / a.dur, h0: a.fireAt / a.dur, h1: (a.fireAt + 0.1) / a.dur }, turnTo: hero.pos };
    }
    if (a.type === 'storm') {
      if (!this.stormFx) this.makeStorm();
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick = 0.3;
        A.g.audio.storm();
        if (d < 3.4) A.damageHero(6, this.pos, true);
      }
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2;
        A.g.vfx.spawn(this.pos.x + Math.cos(ang) * 3, this.pos.y + 0.5 + Math.random() * 1.5, this.pos.z + Math.sin(ang) * 3, -Math.sin(ang) * 6, 0.5, Math.cos(ang) * 6, 0.35, 0.25, i % 2 ? 0x9fb4ff : 0xb070ff, 0, 1);
      }
      if (a.t >= a.dur) { this.action = null; this.clearStorm(); }
      return { pose: 'storm', args: { spin: a.t * 14 }, move: dir, speed: 1.8 };
    }
    if (a.type === 'summon') {
      if (!a.done && a.t >= a.fireAt) { a.done = true; A.summonMinions(this); }
      if (a.t >= a.dur) this.action = null;
      return { pose: 'revive', args: { t: a.t }, turnTo: hero.pos };
    }
    this.action = null;
    return { pose: 'stance', args: { moving: false } };
  }

  makeStorm() {
    const grp = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xd8e6ff, emissive: 0x6a80ff, emissiveIntensity: 2, metalness: 1, roughness: 0.2 });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(CRESCENT_GEO, m);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 2.8, 1.2 + (i % 2) * 0.5, Math.sin(a) * 2.8);
      b.rotation.set(Math.PI / 2, 0, -a);
      b.scale.setScalar(2);
      grp.add(b);
    }
    this.adv.group.add(grp);
    this.stormFx = grp;
  }

  clearStorm() {
    if (this.stormFx) { this.stormFx.parent?.remove(this.stormFx); this.stormFx = null; }
  }

  remove() {
    this.clearStorm();
    for (const o of [this.root, this.icon, this.barBg, this.barFg]) o.parent?.remove(o);
  }
}
