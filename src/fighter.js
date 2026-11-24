import * as THREE from 'three';
import { Animator } from './animation.js';
import { CRESCENT_GEO } from './characters.js';

const _toE = new THREE.Vector3();
const _right = new THREE.Vector3();
const _mv = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class Fighter {
  constructor(def, game) {
    this.def = def;
    this.game = game;
    this.rig = def.build();
    this.root = this.rig.root;
    this.root.scale.setScalar(def.scale);
    game.scene.add(this.root);
    this.anim = new Animator(this.rig, def.handed);
    this.pos = this.root.position;
    this.knock = new THREE.Vector3();
    this.toEnemy = new THREE.Vector3(0, 0, 1);
    this.dist = 5;
    this.clock = 0;
    this.stormFx = null;
    this.reset(new THREE.Vector3(), 0);
  }

  reset(p, facing) {
    this.pos.copy(p);
    this.knock.set(0, 0, 0);
    this.hp = this.def.maxHp;
    this.hpLag = this.hp;
    this.prana = 0;
    this.action = null;
    this.blocking = false;
    this.blockStart = -10;
    this.dodgeCd = 0;
    this.iframes = 0;
    this.stun = 0;
    this.stunType = 'hit';
    this.stunDur = 1;
    this.dead = false;
    this.deadT = 0;
    this.revived = false;
    this.victory = false;
    this.walkPhase = 0;
    this.facing = facing;
    this.root.rotation.y = facing;
    this.hitFlash = 0;
    this.falling = 0;
    this.moving = false;
    this.speedFrac = 0;
    this.moveFwd = 0;
    this.moveSide = 0;
    this.clearStorm();
    if (this.rig.heads) this.rig.heads.forEach((h) => (h.visible = true));
  }

  get forward() { return _tmp.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  get free() { return !this.dead && !this.action && this.stun <= 0; }
  chest() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.25 * this.def.scale, this.pos.z); }
  handWorld(side) { return this.rig['hand' + side].getWorldPosition(new THREE.Vector3()); }

  update(dt, cmd, enemy) {
    const g = this.game;
    this.clock += dt;
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.prana = Math.min(100, this.prana + dt * 1.5);
    this.hpLag = this.hp > this.hpLag ? this.hp : this.hpLag + (this.hp - this.hpLag) * Math.min(1, dt * 2.2);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    if (this.falling > 0) { this.updateFall(dt); return; }

    _toE.subVectors(enemy.pos, this.pos).setY(0);
    this.dist = _toE.length();
    if (this.dist > 1e-3) this.toEnemy.copy(_toE).divideScalar(this.dist);
    const f = this.toEnemy;
    _right.set(-f.z, 0, f.x);

    _mv.set(0, 0, 0);
    let speed = 0;
    let turnRate = 12;
    let pose = 'stance';
    const args = { moving: false };
    const wasBlocking = this.blocking;
    this.blocking = false;

    if (this.dead) {
      this.deadT += dt;
      pose = 'ko'; args.t = this.deadT; turnRate = 0;
    } else if (this.victory) {
      pose = 'victory';
    } else if (this.stun > 0) {
      this.stun -= dt;
      pose = this.stunType; args.t = 1 - this.stun / this.stunDur; turnRate = 2;
    } else {
      if (!this.action) this.chooseAction(cmd);
      if (this.action) {
        const r = this.updateAction(dt, cmd, enemy, f, _right);
        pose = r.pose; Object.assign(args, r.args); turnRate = r.turn;
        if (r.move) { _mv.copy(r.move); speed = r.speed; }
      } else {
        if (cmd.block) {
          this.blocking = true;
          if (!wasBlocking) this.blockStart = this.clock;
          pose = 'block';
        }
        _mv.copy(f).multiplyScalar(cmd.moveZ).addScaledVector(_right, cmd.moveX);
        if (_mv.lengthSq() > 0) {
          _mv.normalize();
          speed = this.def.speed * (this.blocking ? 0.4 : cmd.moveZ < 0 ? 0.8 : 1);
          this.moving = true;
        }
        if (pose === 'stance') {
          args.moving = speed > 0;
          this.speedFrac += ((speed > 0 ? 1 : 0) - this.speedFrac) * Math.min(1, dt * 10);
          this.walkPhase += dt * speed * 2.1;
          Object.assign(args, { speedFrac: this.speedFrac, phase: this.walkPhase, fwd: cmd.moveZ, side: cmd.moveX });
        }
      }
    }

    // Movement & knockback.
    this.pos.addScaledVector(_mv, speed * dt);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-dt * 7));
    const B = g.arena.bounds;
    if (g.arena.ringOut && g.state === 'fight' && !this.dead && this.knock.length() > 2.2 && B.outside(this.pos)) this.startFall();
    else B.clamp(this.pos);

    // Face the enemy (lock-on).
    if (turnRate > 0 && this.dist > 0.05) {
      this.facing = angleLerp(this.facing, Math.atan2(f.x, f.z), Math.min(1, dt * turnRate));
    }
    this.root.rotation.y = this.facing;

    this.anim.update(dt, pose, args, this.clock);
    this.updateVisuals(dt);
  }

  chooseAction(cmd) {
    const m = this.def.moves;
    if (cmd.dodge && this.dodgeCd <= 0) {
      const dx = cmd.moveX, dz = cmd.moveZ;
      this.action = { name: 'dodge', mv: { type: 'dodge', dur: 0.4 }, t: 0, dir: dx || dz ? [dx, dz] : [0, -1] };
      this.dodgeCd = 0.65;
      this.iframes = 0.3;
      this.game.audio.dodge();
    } else if (cmd.ultimate && this.prana >= 100) {
      this.prana = 0;
      this.start('ultimate');
      this.game.onUltimate(this, m.ultimate);
    } else if (cmd.special && this.prana >= this.def.specialCost) {
      this.prana -= this.def.specialCost;
      this.start('special');
    } else if (cmd.heavy) this.start('heavy');
    else if (cmd.light) this.start('light1');
  }

  start(name) {
    this.action = { name, mv: this.def.moves[name], t: 0, hitDone: false, queued: false, fired: false, charge: 0, whoosh: false, tickT: 0 };
  }

  updateAction(dt, cmd, enemy, f, right) {
    const a = this.action, mv = a.mv, g = this.game;
    a.t += dt;
    const out = { pose: mv.pose, args: {}, turn: 6, move: null, speed: 0 };

    if (mv.type === 'dodge') {
      const k = a.t / mv.dur;
      out.pose = 'dodge';
      out.turn = 0;
      out.move = _tmp.copy(f).multiplyScalar(a.dir[1]).addScaledVector(right, a.dir[0]).normalize().clone();
      out.speed = 13 * (1 - k) + 1;
      if (Math.random() < 0.5) g.vfx.spawn(this.pos.x, 0.1, this.pos.z, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), 0.5, 0.35, 0x8a7a60, 0, 2);
      if (a.t >= mv.dur) this.action = null;
      return out;
    }

    if (mv.type === 'melee') {
      out.args = { t: a.t / mv.dur, h0: mv.hit[0] / mv.dur, h1: mv.hit[1] / mv.dur };
      if (cmd.light && mv.next && a.t > 0.08) a.queued = true;
      if (a.t < mv.hit[1] && this.dist > 1.1 * this.def.scale) { out.move = f.clone(); out.speed = mv.lunge * (a.t < mv.hit[0] ? 1 : 0.5); }
      if (!a.whoosh && a.t >= mv.hit[0] - 0.06) { a.whoosh = true; g.audio.whoosh(mv.heavy); }
      if (!a.hitDone && a.t >= mv.hit[0] && a.t <= mv.hit[1]) {
        const reach = mv.range * this.def.scale + 0.15 * enemy.def.scale;
        const facingDot = this.forward.dot(this.toEnemy);
        if (this.dist <= reach && facingDot > 0.45) {
          a.hitDone = true;
          g.resolveHit(this, enemy, { kind: 'melee', dmg: mv.dmg, knock: mv.knock, heavy: !!mv.heavy, stun: mv.stun });
        }
      }
      if (mv.shock && !a.shocked && a.t >= mv.hit[0] + 0.04) {
        a.shocked = true;
        const p = this.pos.clone().addScaledVector(this.forward, 1.4 * this.def.scale);
        g.vfx.ring(p, 0xffb060, 3.2, 0.45);
        g.vfx.burst(p.setY(0.2), { count: 30, color: 0xc8a878, speed: 4, life: 0.7, size: 0.35, gravity: -3, up: 2 });
        g.shake(0.35);
      }
      if (a.queued && a.t >= mv.cancel) { this.start(mv.next); return this.updateAction(0, cmd, enemy, f, right); }
      if (a.t >= mv.dur) this.action = null;
      return out;
    }

    if (mv.type === 'projectile') {
      out.args = { t: a.t / mv.dur, h0: mv.fireAt / mv.dur, h1: (mv.fireAt + 0.1) / mv.dur, pull: Math.min(1, a.t / mv.fireAt), released: a.fired };
      // Mantra charge: holding the button holds the draw and powers up the arrow.
      if (mv.chargeable && !a.fired && cmd.specialHeld && a.charge < mv.maxCharge && a.t >= mv.fireAt * 0.85) {
        a.charge += dt;
        a.t -= dt;
        out.turn = 10;
        const hp = this.handWorld('L');
        if (Math.random() < 0.6) g.vfx.spawn(hp.x + (Math.random() - 0.5) * 0.8, hp.y + (Math.random() - 0.5) * 0.8, hp.z + (Math.random() - 0.5) * 0.8, 0, 0, 0, 0.3, 0.15, 0xffd27a, 0, 0);
        if (a.charge >= mv.maxCharge * 0.98 && !a.chargedFx) { a.chargedFx = true; g.vfx.burst(hp, { count: 25, color: 0xfff0b0, speed: 3, life: 0.4, size: 0.18, gravity: 0 }); g.audio.parry(); }
      }
      if (!a.fired && a.t >= mv.fireAt) {
        a.fired = true;
        const power = mv.chargeable ? Math.min(1, a.charge / mv.maxCharge) : 0;
        const src = mv.proj === 'arrow' ? this.handWorld('L') : this.handWorld('R');
        const target = enemy.chest();
        const dir = target.sub(src).normalize();
        const dmg = mv.maxDmg ? mv.dmg + (mv.maxDmg - mv.dmg) * power : mv.dmg;
        g.spawnProjectile(this, mv.proj, src, dir, dmg, mv.speed * (1 + power * 0.4), power);
      }
      if (a.t >= mv.dur) this.action = null;
      return out;
    }

    if (mv.type === 'beam') {
      out.pose = 'draw';
      out.args = { pull: Math.min(1, a.t / mv.fireAt), released: a.fired };
      out.turn = a.fired ? 0 : 8;
      const hp = this.handWorld('L');
      if (!a.fired) {
        for (let i = 0; i < 3; i++) {
          const v = new THREE.Vector3().randomDirection().multiplyScalar(2.2);
          g.vfx.spawn(hp.x + v.x, hp.y + v.y, hp.z + v.z, -v.x * 2.2, -v.y * 2.2, -v.z * 2.2, 0.45, 0.2, i ? 0xffd27a : 0xffffff, 0, 0);
        }
      }
      if (!a.fired && a.t >= mv.fireAt) {
        a.fired = true;
        g.fireBeam(this, enemy, hp, this.forward.clone(), mv.dmg);
      }
      if (a.t >= mv.dur) this.action = null;
      return out;
    }

    if (mv.type === 'storm') {
      out.args = { spin: a.t * 16 };
      out.turn = 0;
      out.move = _tmp.copy(f).multiplyScalar(cmd.moveZ).addScaledVector(right, cmd.moveX).clone();
      if (out.move.lengthSq() > 0) { out.move.normalize(); out.speed = this.def.speed * 0.75; }
      if (!this.stormFx) this.makeStorm();
      a.tickT -= dt;
      if (a.tickT <= 0 && a.t > 0.2) {
        a.tickT = mv.tick;
        g.audio.storm();
        if (this.dist < mv.radius * this.def.scale * 0.85) g.resolveHit(this, enemy, { kind: 'ult', dmg: mv.dmg, knock: 0.6, stun: 0.12, quiet: true });
      }
      if (a.t >= mv.dur) { this.action = null; this.clearStorm(); }
      return out;
    }
    this.action = null;
    return out;
  }

  // Knocked off the edge (Ram Setu): arc out, splash, then return to the bridge.
  startFall() {
    this.falling = 1.15;
    this.fallV = 3;
    this.splashed = false;
    this.fallDir = this.knock.clone().setY(0).normalize();
    this.action = null;
    this.blocking = false;
    this.clearStorm();
  }

  updateFall(dt) {
    const g = this.game;
    this.falling -= dt;
    this.fallV -= 22 * dt;
    this.pos.y += this.fallV * dt;
    this.pos.addScaledVector(this.fallDir, 2.5 * dt);
    const wy = g.arena.waterY ?? -2;
    if (!this.splashed && this.pos.y < wy + 0.2) { this.splashed = true; g.onSplash(this); }
    this.pos.y = Math.max(this.pos.y, wy - 2);
    if (this.falling <= 0) {
      g.arena.bounds.home(this.pos);
      this.knock.set(0, 0, 0);
      this.iframes = 1.0;
      if (!this.dead) this.applyStun(0.35, 'hit');
      g.vfx.burst(this.chest(), { count: 30, color: 0x9fd0ff, speed: 3, life: 0.5, size: 0.2, gravity: 0 });
    }
    this.root.rotation.y = this.facing;
    this.anim.update(dt, this.dead ? 'ko' : 'hit', { t: 0.15 }, this.clock);
    this.updateVisuals(dt);
  }

  makeStorm() {
    const grp = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xd8e6ff, emissive: 0x6a80ff, emissiveIntensity: 2, metalness: 1, roughness: 0.2 });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(CRESCENT_GEO, m);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 2.4, 1.1 + (i % 2) * 0.5, Math.sin(a) * 2.4);
      b.rotation.set(Math.PI / 2, 0, -a);
      b.scale.setScalar(1.8);
      grp.add(b);
    }
    this.game.scene.add(grp);
    this.stormFx = grp;
  }

  clearStorm() {
    if (this.stormFx) { this.game.scene.remove(this.stormFx); this.stormFx = null; }
  }

  updateVisuals(dt) {
    const fl = this.hitFlash;
    for (const m of this.rig.flashMats) m.emissive.setRGB(fl * 0.9, fl * 0.7, fl * 0.5);
    if (this.stormFx) {
      this.stormFx.position.set(this.pos.x, 0, this.pos.z);
      this.stormFx.rotation.y += dt * 9;
      const g = this.game;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        g.vfx.spawn(this.pos.x + Math.cos(a) * 2.6, 0.5 + Math.random() * 1.5, this.pos.z + Math.sin(a) * 2.6, -Math.sin(a) * 6, 0.5, Math.cos(a) * 6, 0.35, 0.22, i % 2 ? 0x9fb4ff : 0xb070ff, 0, 1);
      }
    }
    if (this.rig.cape) this.rig.cape.rotation.x = 0.12 + this.speedFrac * 0.35 + Math.sin(this.clock * 3) * 0.03;
    if (this.rig.halo) this.rig.halo.material.opacity = 0.4 + Math.sin(this.clock * 2) * 0.1 + (this.action?.mv?.type === 'beam' ? 0.5 : 0);
    if (this.rig.bladeMat) this.rig.bladeMat.emissiveIntensity = 0.8 + Math.sin(this.clock * 4) * 0.3;
  }

  applyStun(dur, type) {
    this.stun = dur; this.stunDur = dur; this.stunType = type;
    this.action = null;
    this.clearStorm();
  }

  // Returns: 'miss' | 'block' | 'parry' | 'guardbreak' | 'hit' | 'revive' | 'ko'
  receiveHit(att, hit) {
    if (this.dead) return 'none';
    if (this.iframes > 0 || this.falling > 0) return 'miss';
    const toA = _tmp.subVectors(att.pos, this.pos).setY(0).normalize();
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const facing = fwd.dot(toA) > 0.1;
    const away = toA.clone().negate();
    let dmg = hit.dmg;

    if (this.blocking && facing) {
      if (hit.kind === 'melee' && this.clock - this.blockStart < 0.22) {
        att.applyStun(0.9, 'stagger');
        this.prana = Math.min(100, this.prana + 15);
        return 'parry';
      }
      if (hit.heavy) {
        this.blocking = false;
        this.hp -= dmg * 0.25;
        this.applyStun(0.8, 'stagger');
        this.knock.addScaledVector(away, hit.knock * 0.7);
        return this.checkDeath() || 'guardbreak';
      }
      if (hit.kind !== 'ult') {
        this.hp -= dmg * 0.12;
        this.prana = Math.min(100, this.prana + 4);
        this.knock.addScaledVector(away, hit.knock * 0.5 + 1);
        return this.checkDeath() || 'block';
      }
      dmg *= 0.5;
    }

    // Divine armour: ultimates can't be interrupted, and take half damage.
    const armoured = this.action && (this.action.mv.type === 'beam' || this.action.mv.type === 'storm');
    if (armoured) {
      this.hp -= dmg * 0.5;
      this.hitFlash = 0.6;
      return this.checkDeath() || 'block';
    }

    this.hp -= dmg;
    this.prana = Math.min(100, this.prana + dmg * 0.5);
    if (hit.kind !== 'ult') att.prana = Math.min(100, att.prana + dmg * 0.9);
    this.hitFlash = 1;
    this.knock.addScaledVector(away, hit.knock);
    this.applyStun(hit.stun ?? (hit.heavy ? 0.55 : 0.32), 'hit');
    return this.checkDeath() || 'hit';
  }

  checkDeath() {
    if (this.hp > 0) return null;
    if (this.def.passive === 'dashanana' && !this.revived) {
      this.revived = true;
      this.hp = 15;
      this.applyStun(1.2, 'revive');
      this.iframes = 1.3;
      if (this.rig.heads) this.rig.heads[1 + Math.floor(Math.random() * 9)].visible = false;
      return 'revive';
    }
    this.hp = 0;
    this.dead = true;
    this.deadT = 0;
    this.action = null;
    this.clearStorm();
    return 'ko';
  }
}

export { UP };
