import * as THREE from 'three';
import { buildRama } from '../characters.js';
import { Animator } from '../animation.js';
import { Enemy } from './enemy.js';
import { ZONES } from './zones.js';

// YATRA — adventure mode. Rama runs from Ayodhya across Ram Setu and through
// Ashoka Vatika to burning Lanka, sneaking past or hunting asuras, and finally
// faces Ravana. Arrow keys move, Enter fires arrows at the nearest enemy.

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const UP = new THREE.Vector3(0, 1, 0);

export class Adventure {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.enemies = [];
    this.arrows = [];
    this.fireballs = [];
    this.beams = [];
    this.colliders = [];
    this.bushes = [];
    this.clock = 0;
    this.camYaw = Math.PI;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shakeAmt = 0;
    this.transition = false;
    this.cleared = new Set();
    this.map = $('minimap').getContext('2d');
  }

  // ---------- Lifecycle ----------
  start() {
    this.active = true;
    if (!this.hero) this.makeHero();
    this.hero.root.visible = true;
    this.cleared.clear();
    $('advHud').classList.remove('hidden');
    $('advEnd').classList.add('hidden');
    this.loadZone(0);
  }

  stop() {
    this.active = false;
    this.clearZone();
    if (this.hero) this.hero.root.visible = false;
    $('advHud').classList.add('hidden');
    $('advEnd').classList.add('hidden');
    $('bossBar').classList.add('hidden');
  }

  retry() {
    $('advEnd').classList.add('hidden');
    if (this.won) { this.cleared.clear(); this.loadZone(0); } else this.loadZone(this.zi);
  }

  makeHero() {
    const rig = buildRama();
    const h = (this.hero = {
      rig, root: rig.root, anim: new Animator(rig, 'L'), pos: rig.root.position,
      facing: Math.PI, crouch: false, moving: false, hidden: false,
      chest() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z); },
    });
    this.g.scene.add(h.root);
  }

  resetHero(x, z, facing) {
    const h = this.hero;
    Object.assign(h, {
      facing, crouch: false, moving: false, hidden: false, hp: 100, hpLag: 100, dead: false, deadT: 0,
      shootCd: 0, drawT: 0, fired: false, target: null, rollT: 0, rollCd: 0, rollDir: new THREE.Vector3(),
      iframes: 0, lastHurt: -10, hitFlash: 0, walkPhase: 0, speedFrac: 0, beamT: 0, knock: new THREE.Vector3(),
      prana: h.prana ?? 0,
    });
    h.pos.set(x, 0, z);
    h.root.rotation.y = facing;
  }

  clearZone() {
    for (const e of this.enemies) e.remove();
    for (const p of [...this.arrows, ...this.fireballs]) p.mesh.parent?.remove(p.mesh);
    for (const b of this.beams) b.grp.parent?.remove(b.grp);
    this.enemies = []; this.arrows = []; this.fireballs = []; this.beams = [];
    this.boss = null;
  }

  loadZone(i) {
    this.clearZone();
    const Z = (this.zone = ZONES[i]);
    this.zi = i;
    this.won = false;
    this.g.loadArena(Z.arena);
    this.group = new THREE.Group();
    this.g.arenaRoot.add(this.group);
    this.colliders = (Z.colliders || []).map((c) => ({ ...c }));
    this.bushes = Z.bushes.map(([x, z]) => ({ x, z, r: 1.35 }));
    this.buildProps(Z);
    this.buildBushes();
    this.gate = Z.gate ? this.buildGate(Z.gate) : null;
    for (const e of Z.enemies) this.spawnEnemy(e.kind, e.route[0], e.route);
    if (Z.boss) {
      this.boss = this.spawnEnemy('ravana', Z.boss, [Z.boss]);
      this.boss.facing = 0;
    }
    this.hero.prana = this.hero.prana ?? 0;
    this.resetHero(Z.entry[0], Z.entry[1], Z.entry[2]);
    this.camYaw = Z.entry[2];
    const back = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this.g.camera.position.copy(this.hero.pos).addScaledVector(back, -5.5).setY(2.7);
    this.camLook.copy(this.hero.pos).addScaledVector(back, 2.5).setY(1.3);
    this.kills = 0;
    this.detectedT = 0;
    $('zoneName').textContent = Z.name;
    $('bossBar').classList.toggle('hidden', !Z.boss);
    this.setObjective();
    this.g.announce(Z.name.toUpperCase(), Z.story, 2.6);
    this.renderJourney();
  }

  spawnEnemy(kind, at, route) {
    const e = new Enemy(this, kind, at, route);
    e.pos.y = this.groundY(at[0], at[1]);
    this.enemies.push(e);
    return e;
  }

  // ---------- World building ----------
  buildProps(Z) {
    const stone = new THREE.MeshStandardMaterial({ color: Z.id === 'lanka' ? 0x3a2a22 : 0x6a6258, roughness: 0.9, flatShading: true });
    const marble = new THREE.MeshStandardMaterial({ color: 0xeadfcb, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9a640, metalness: 0.85, roughness: 0.3 });
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    for (const p of Z.props) {
      const gy = this.groundY(p.x, p.z);
      if (p.t === 'rock') {
        const r = p.r || 1;
        for (let k = 0; k < 3; k++) {
          const m = add(new THREE.DodecahedronGeometry(r * (k ? 0.6 : 0.85), 0), stone, p.x + rand(-0.3, 0.3) * k, gy + r * (k ? 0.9 + k * 0.4 : 0.5), p.z + rand(-0.3, 0.3) * k);
          m.rotation.set(rand(0, 3), rand(0, 3), 0);
          m.scale.y = 0.85;
        }
        this.colliders.push({ x: p.x, z: p.z, r: r * 0.95, h: 2.4 });
      } else if (p.t === 'planter') {
        add(new THREE.BoxGeometry(1.6, 0.9, 1.6), marble, p.x, gy + 0.45, p.z);
        add(new THREE.BoxGeometry(1.75, 0.12, 1.75), gold, p.x, gy + 0.92, p.z);
        const bush = add(new THREE.IcosahedronGeometry(0.95, 1), new THREE.MeshStandardMaterial({ color: 0x3e6a22, flatShading: true }), p.x, gy + 1.5, p.z);
        bush.scale.y = 0.8;
        for (let k = 0; k < 10; k++) {
          const f = add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xff9a10 : 0xffcc20, emissive: 0x301000 }), p.x + rand(-0.7, 0.7), gy + rand(1.3, 2.0), p.z + rand(-0.7, 0.7));
          f.castShadow = false;
        }
        this.colliders.push({ x: p.x, z: p.z, r: 1.05, h: 2.2 });
      } else if (p.t === 'wall') {
        const w = add(new THREE.BoxGeometry(p.len, 1.9, 0.6), marble, p.x, gy + 0.95, p.z);
        w.rotation.y = p.rot;
        const cap = add(new THREE.BoxGeometry(p.len + 0.2, 0.15, 0.75), gold, p.x, gy + 1.95, p.z);
        cap.rotation.y = p.rot;
        const n = Math.ceil(p.len / 0.9);
        for (let k = 0; k < n; k++) {
          const t = (k / (n - 1 || 1) - 0.5) * (p.len - 0.6);
          this.colliders.push({ x: p.x + Math.cos(p.rot) * t, z: p.z - Math.sin(p.rot) * t, r: 0.5, h: 1.9 });
        }
      } else if (p.t === 'cart') {
        const charred = new THREE.MeshStandardMaterial({ color: 0x1e140e, roughness: 1 });
        add(new THREE.BoxGeometry(2.2, 0.9, 1.3), charred, p.x, gy + 0.85, p.z).rotation.y = 0.4;
        for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.45, 0.08, 6, 14), charred, p.x + s * 0.7, gy + 0.45, p.z + 0.7).rotation.y = 0.4;
        this.colliders.push({ x: p.x, z: p.z, r: 1.3, h: 1.6 });
        this.embers = (this.embers || []).concat([[p.x, gy + 1.3, p.z]]);
      }
    }
  }

  buildBushes() {
    if (!this.bushes.length) return;
    const geo = new THREE.ConeGeometry(0.16, 1.5, 4);
    geo.translate(0, 0.75, 0);
    const n = this.bushes.length * 60;
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), n);
    const d = new THREE.Object3D(), c = new THREE.Color();
    let i = 0;
    for (const b of this.bushes) {
      const gy = this.groundY(b.x, b.z);
      for (let k = 0; k < 60; k++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * b.r;
        d.position.set(b.x + Math.cos(a) * r, gy, b.z + Math.sin(a) * r);
        d.rotation.set(rand(-0.35, 0.35), rand(0, 6), rand(-0.35, 0.35));
        d.scale.set(1, rand(0.7, 1.25) * (1 - r / b.r * 0.35), 1);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
        inst.setColorAt(i++, c.setHSL(rand(0.22, 0.32), 0.55, rand(0.12, 0.22)));
      }
    }
    inst.castShadow = true;
    this.group.add(inst);
  }

  buildGate([x, z]) {
    const grp = new THREE.Group();
    const gy = this.groundY(x, z);
    grp.position.set(x, gy, z);
    grp.rotation.y = Math.atan2(-x, -z);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9a640, metalness: 0.85, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.6, 10), gold);
      p.position.set(s * 1.4, 1.8, 0);
      grp.add(p);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), gold);
      top.position.set(s * 1.4, 3.9, 0);
      grp.add(top);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.14, 8, 24, Math.PI), gold);
    arch.position.y = 3.5;
    grp.add(arch);
    const portalMat = new THREE.MeshBasicMaterial({ color: 0x5a1010, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.4), portalMat);
    portal.position.y = 1.75;
    grp.add(portal);
    this.group.add(grp);
    return { x, z, grp, portal, open: false };
  }

  openGate() {
    if (!this.gate || this.gate.open) return;
    this.gate.open = true;
    this.gate.portal.material.color.set(0xffc860).multiplyScalar(1.6);
    this.gate.portal.material.opacity = 0.75;
    this.g.vfx.ring(new THREE.Vector3(this.gate.x, 0, this.gate.z), 0xffd27a, 4, 0.8, this.groundY(this.gate.x, this.gate.z) + 0.05);
    this.g.audio.bell();
    this.g.toast('THE PATH IS OPEN — RUN TO THE GATE');
    this.setObjective();
  }

  // ---------- Queries used by enemies ----------
  groundY(x, z) { return this.zone?.groundY ? this.zone.groundY(x, z) : 0; }

  collide(pos, r) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 1e-4) { pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
    }
    this.zone.bounds.clamp(pos);
  }

  losBlocked(a, b) {
    const abx = b.x - a.x, abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    for (const c of this.colliders) {
      if (c.h < 1.2) continue;
      let t = ((c.x - a.x) * abx + (c.z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + abx * t - c.x, pz = a.z + abz * t - c.z;
      if (px * px + pz * pz < c.r * c.r * 0.8) return true;
    }
    return false;
  }

  inBush(p) { return this.bushes.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < b.r); }
  livingMinions() { return this.enemies.filter((e) => !e.dead && !e.boss).length; }

  alertNearby(src) {
    for (const e of this.enemies) {
      if (e === src || e.dead || e.state === 'alert') continue;
      if (e.pos.distanceTo(src.pos) < 12) { e.lastSeen.copy(src.lastSeen); e.becomeAlert(false); }
    }
  }

  onEnemyAlert(e) {
    if (e.boss) return;
    this.g.audio.tone('square', 660, 880, 0.12, 0.08);
  }

  onEnemyKilled(e) {
    const h = this.hero;
    h.prana = Math.min(100, h.prana + (e.boss ? 0 : 25));
    this.kills++;
    this.g.audio.hit(true);
    this.g.vfx.burst(e.chest(), { count: 40, color: 0x8a40ff, color2: 0xff5030, speed: 5, life: 0.8, size: 0.25, gravity: 1 });
    if (e.boss) { this.victory(); return; }
    this.setObjective();
    if (this.gate && this.livingMinions() === 0) this.openGate();
  }

  onBossRevive(e) {
    this.g.vfx.burst(e.chest(), { count: 140, color: 0xb050ff, color2: 0xff3050, speed: 7, life: 1.3, size: 0.3, gravity: 0, up: 1 });
    this.g.vfx.ring(e.pos, 0xb050ff, 6, 0.8, e.pos.y + 0.05);
    this.g.audio.roar();
    this.shake(0.6);
    this.g.announce('DASHANANA', 'A head falls — Ravana rises again', 2);
  }

  summonMinions(boss) {
    for (let k = 0; k < 2; k++) {
      const a = boss.facing + (k ? 1.2 : -1.2);
      const x = boss.pos.x + Math.sin(a) * 3.5, z = boss.pos.z + Math.cos(a) * 3.5;
      const e = this.spawnEnemy(Math.random() < 0.5 ? 'warrior' : 'caster', [x, z], [[x, z]]);
      e.lastSeen.copy(this.hero.pos);
      e.becomeAlert(false);
      this.g.vfx.burst(e.chest(), { count: 50, color: 0x9a3aff, speed: 4, life: 0.8, size: 0.3, gravity: 0 });
      this.g.vfx.ring(e.pos, 0x9a3aff, 2.5, 0.6, e.pos.y + 0.05);
    }
    this.g.toast('RAVANA SUMMONS HIS RAKSHASAS');
    this.g.audio.roar();
  }

  announce(t, s, d) { this.g.announce(t, s, d); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  damageHero(dmg, from, quiet = false) {
    const h = this.hero;
    if (h.dead || h.iframes > 0 || this.transition) return;
    h.hp -= dmg;
    h.hitFlash = 1;
    h.lastHurt = this.clock;
    if (from) h.knock.copy(h.pos).sub(from).setY(0).normalize().multiplyScalar(4);
    if (!quiet) { this.g.audio.hit(dmg > 12); this.shake(0.35); }
    const hurt = $('hurt');
    hurt.classList.remove('on'); void hurt.offsetWidth; hurt.classList.add('on');
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      h.deadT = 0;
      this.g.audio.ko();
      setTimeout(() => {
        if (!this.active || !h.dead) return;
        $('advEndTitle').textContent = 'RAMA HAS FALLEN';
        $('advEndText').textContent = `Rise again and continue the journey through ${this.zone.name}.`;
        $('advRetry').textContent = 'Retry';
        $('advEnd').classList.remove('hidden');
      }, 1800);
    }
  }

  victory() {
    this.won = true;
    this.cleared.add(this.zone.id);
    this.renderJourney();
    this.g.announce('VIJAYA!', 'Dharma prevails — Ravana is defeated', 3.5);
    this.g.audio.conch();
    setTimeout(() => {
      if (!this.active) return;
      $('advEndTitle').textContent = 'VIJAYA';
      $('advEndText').textContent = 'From Ayodhya to Lanka, Rama has crossed the sea and defeated the ten-headed king. Jai Shri Ram.';
      $('advRetry').textContent = 'Play again';
      $('advEnd').classList.remove('hidden');
    }, 3500);
  }

  setObjective() {
    const Z = this.zone;
    const left = this.livingMinions();
    let text;
    if (Z.boss) text = this.boss && !this.boss.dead ? 'Defeat Ravana' : 'Victory!';
    else if (this.gate?.open) text = 'Run to the golden gate';
    else text = `Defeat the rakshasas — ${left} remaining (sneak or fight)`;
    $('objective').textContent = text;
  }

  // ---------- Hero ----------
  pickTarget() {
    const h = this.hero;
    const fwd = new THREE.Vector3(Math.sin(h.facing), 0, Math.cos(h.facing));
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const v = e.pos.clone().sub(h.pos).setY(0);
      const d = v.length();
      if (d > 34) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, fwd.dot(v.normalize()))));
      if (ang > 1.4) continue;
      if (this.losBlocked(h.chest(), e.chest())) continue;
      const score = d + ang * 10;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  updateHero(dt) {
    const h = this.hero, I = this.g.input;
    h.hitFlash = Math.max(0, h.hitFlash - dt * 5);
    h.iframes = Math.max(0, h.iframes - dt);
    h.hpLag = h.hp > h.hpLag ? h.hp : h.hpLag + (h.hp - h.hpLag) * Math.min(1, dt * 2.2);
    for (const m of h.rig.flashMats) m.emissive.setRGB(h.hitFlash * 0.9, h.hitFlash * 0.3, h.hitFlash * 0.2);
    if (h.dead) {
      h.deadT += dt;
      h.anim.update(dt, 'ko', { t: h.deadT }, this.clock);
      return;
    }
    const ix = (I.down('ArrowRight', 'KeyD') ? 1 : 0) - (I.down('ArrowLeft', 'KeyA') ? 1 : 0);
    const iz = (I.down('ArrowUp', 'KeyW') ? 1 : 0) - (I.down('ArrowDown', 'KeyS') ? 1 : 0);
    this.lastIz = iz;
    h.crouch = I.down('ShiftLeft', 'ShiftRight', 'KeyC');
    const fwd = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = fwd.multiplyScalar(iz).addScaledVector(right, ix);
    h.moving = mv.lengthSq() > 0;
    if (h.moving) mv.normalize();
    let speed = h.crouch ? 2.7 : 6.4;
    if (h.drawT > 0 || h.beamT > 0) speed *= 0.45;

    h.rollCd -= dt;
    if (h.rollT > 0) {
      h.rollT -= dt;
      mv.copy(h.rollDir);
      speed = 12 * (h.rollT / 0.4) + 2;
    } else if (I.hit('Space') && h.rollCd <= 0 && h.beamT <= 0) {
      h.rollDir.copy(h.moving ? mv : new THREE.Vector3(Math.sin(h.facing), 0, Math.cos(h.facing)));
      h.rollT = 0.4; h.iframes = 0.35; h.rollCd = 0.75; h.drawT = 0;
      this.g.audio.dodge();
    }
    if (h.beamT > 0) speed = 0;
    if (h.moving || h.rollT > 0) h.pos.addScaledVector(mv, speed * dt);
    h.pos.addScaledVector(h.knock, dt);
    h.knock.multiplyScalar(Math.exp(-dt * 7));
    this.collide(h.pos, 0.4);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = new THREE.Vector3().subVectors(h.pos, e.pos).setY(0);
      const min = 0.45 + 0.45 * e.T.scale, len = d.length();
      if (len < min && len > 1e-4) h.pos.addScaledVector(d, (min - len) / len);
    }
    h.pos.y = this.groundY(h.pos.x, h.pos.z);

    // ---- Shooting (Enter) ----
    h.shootCd -= dt;
    if (I.down('Enter', 'NumpadEnter') && h.shootCd <= 0 && h.rollT <= 0 && h.beamT <= 0) {
      h.target = this.pickTarget();
      h.drawT = 0.001; h.fired = false; h.shootCd = 0.5;
    }
    if (h.drawT > 0) {
      h.drawT += dt;
      if (!h.fired && h.drawT >= 0.2) { h.fired = true; this.fireArrow(); }
      if (h.drawT > 0.42) h.drawT = 0;
    }
    // ---- Brahmastra (Q) ----
    if (I.hit('KeyQ') && h.prana >= 100 && h.beamT <= 0) {
      h.prana = 0; h.beamT = 0.001; h.beamFired = false; h.target = this.pickTarget();
      this.g.audio.charge();
      this.g.announce('BRAHMASTRA', '', 1.1);
    }
    if (h.beamT > 0) {
      h.beamT += dt;
      const hp = h.rig.handL.getWorldPosition(new THREE.Vector3());
      for (let k = 0; k < 3; k++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(2);
        this.g.vfx.spawn(hp.x + v.x, hp.y + v.y, hp.z + v.z, -v.x * 2.4, -v.y * 2.4, -v.z * 2.4, 0.4, 0.2, k ? 0xffd27a : 0xffffff, 0, 0);
      }
      if (!h.beamFired && h.beamT > 0.7) { h.beamFired = true; this.fireBeam(); }
      if (h.beamT > 1.3) h.beamT = 0;
    }

    // ---- Facing ----
    const aiming = h.drawT > 0 || h.beamT > 0;
    if (aiming && h.target && !h.target.dead) {
      h.facing = angleLerp(h.facing, Math.atan2(h.target.pos.x - h.pos.x, h.target.pos.z - h.pos.z), Math.min(1, dt * 20));
    } else if (h.moving && h.rollT <= 0) {
      h.facing = angleLerp(h.facing, Math.atan2(mv.x, mv.z), Math.min(1, dt * 12));
    }
    h.root.rotation.y = h.facing;

    // ---- Stealth & regen ----
    h.hidden = h.crouch && this.inBush(h.pos);
    if (this.clock - h.lastHurt > 5 && h.hp < 100) h.hp = Math.min(100, h.hp + 6 * dt);

    // ---- Animation ----
    h.speedFrac += ((h.moving ? 1 : 0) - h.speedFrac) * Math.min(1, dt * 10);
    h.walkPhase += dt * (h.moving ? speed : 0) * 2.0;
    let pose = 'stance', args;
    if (h.rollT > 0) { pose = 'dodge'; args = {}; }
    else if (aiming) { pose = 'draw'; args = h.beamT > 0 ? { pull: Math.min(1, h.beamT / 0.7), released: h.beamFired } : { pull: Math.min(1, h.drawT / 0.2), released: h.fired }; }
    else if (h.crouch) { pose = 'sneak'; args = { speedFrac: h.speedFrac, phase: h.walkPhase }; }
    else args = { moving: h.moving, speedFrac: h.speedFrac * 1.35, phase: h.walkPhase, fwd: 1, side: 0 };
    h.anim.update(dt, pose, args, this.clock);
    if (h.rig.cape) h.rig.cape.rotation.x = 0.12 + h.speedFrac * (h.crouch ? 0.2 : 0.55) + Math.sin(this.clock * 4) * 0.04;
    if (h.hidden && Math.random() < 0.05) this.g.vfx.spawn(h.pos.x + rand(-0.5, 0.5), h.pos.y + 0.8, h.pos.z + rand(-0.5, 0.5), 0, 0.5, 0, 0.6, 0.12, 0x6aa040, -1, 1);
  }

  fireArrow() {
    const h = this.hero;
    const src = h.rig.handL.getWorldPosition(new THREE.Vector3());
    let dir;
    if (h.target && !h.target.dead) dir = h.target.chest().sub(src).normalize();
    else dir = new THREE.Vector3(Math.sin(h.facing), 0, Math.cos(h.facing));
    const grp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a20, emissive: 0xffb040, emissiveIntensity: 0.8 }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(3) }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.55;
    grp.add(shaft, tip);
    grp.position.copy(src);
    grp.lookAt(src.clone().add(dir));
    this.g.arenaRoot.add(grp);
    this.arrows.push({ mesh: grp, pos: grp.position, vel: dir.multiplyScalar(40), life: 1.3 });
    this.g.audio.twang(0.3);
  }

  fireBeam() {
    const h = this.hero;
    const start = h.rig.handL.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(h.facing), 0, Math.cos(h.facing));
    const len = 34;
    const grp = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4d0).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    grp.add(outer, inner);
    grp.position.copy(start).addScaledVector(dir, len / 2);
    grp.quaternion.setFromUnitVectors(UP, dir);
    this.g.arenaRoot.add(grp);
    this.beams.push({ grp, outer, inner, t: 0, dur: 0.85, start, dir, len });
    this.g.audio.beam();
    this.shake(0.8);
    this.g.vfx.flash(start, 0xffd27a, 120, 0.8);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.chest();
      const along = c.clone().sub(start).dot(dir);
      const closest = start.clone().addScaledVector(dir, along);
      if (along > 0 && along < len && closest.distanceTo(c) < 1.8 * e.T.scale) e.takeHit(e.boss ? 70 : 60);
    }
  }

  spawnFireball(src, dir, dmg, speed, big) {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.SphereGeometry(big ? 0.3 : 0.22, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(big ? 0xb050ff : 0xff6a1a).multiplyScalar(2.5) })));
    grp.add(new THREE.Mesh(new THREE.SphereGeometry(big ? 0.46 : 0.36, 14, 10), new THREE.MeshBasicMaterial({ color: big ? 0x7a20ff : 0xff3a00, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })));
    grp.position.copy(src);
    this.g.arenaRoot.add(grp);
    this.fireballs.push({ mesh: grp, pos: grp.position, vel: dir.clone().multiplyScalar(speed), dmg, life: 3, big });
    this.g.audio.fire();
  }

  blockedAt(p) {
    for (const c of this.colliders) if (p.y - this.groundY(c.x, c.z) < c.h && Math.hypot(p.x - c.x, p.z - c.z) < c.r) return true;
    return false;
  }

  updateProjectiles(dt) {
    const v = this.g.vfx;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      let remove = (a.life -= dt) <= 0;
      for (let s = 0; s < 3 && !remove; s++) {
        a.pos.addScaledVector(a.vel, dt / 3);
        if (this.blockedAt(a.pos)) { remove = true; v.burst(a.pos, { count: 10, color: 0xffd27a, speed: 3, life: 0.3, size: 0.1 }); break; }
        for (const e of this.enemies) {
          if (e.dead) continue;
          const c = e.chest();
          const r = 0.6 * e.T.scale;
          const dy = a.pos.y - e.pos.y;
          if (Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < r && dy > 0.1 && dy < 2.2 * e.T.scale) {
            const mult = e.takeHit(16);
            remove = true;
            v.burst(a.pos, { count: mult === 3 ? 40 : 18, color: mult === 3 ? 0xffffff : 0xffd27a, color2: 0xff6a3a, speed: 5, life: 0.45, size: 0.15 });
            v.flash(a.pos, 0xffd27a, 20);
            if (mult === 3) this.g.toast('STEALTH SHOT ×3');
            this.hero.prana = Math.min(100, this.hero.prana + 3);
            break;
          }
        }
      }
      if (!remove) v.spawn(a.pos.x, a.pos.y, a.pos.z, 0, 0, 0, 0.22, 0.12, 0xffd27a, 0, 0);
      if (remove) { a.mesh.parent?.remove(a.mesh); this.arrows.splice(i, 1); }
    }
    const h = this.hero;
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.pos.addScaledVector(f.vel, dt);
      let remove = (f.life -= dt) <= 0 || this.blockedAt(f.pos) || f.pos.y < this.groundY(f.pos.x, f.pos.z);
      for (let k = 0; k < 2; k++) v.spawn(f.pos.x + rand(-0.15, 0.15), f.pos.y + rand(-0.15, 0.15), f.pos.z + rand(-0.15, 0.15), 0, 1, 0, 0.4, 0.3, f.big ? 0xa050ff : 0xff5a10, 1, 1);
      const c = h.chest();
      if (!remove && !h.dead && f.pos.distanceTo(c) < 0.7) {
        remove = true;
        if (h.iframes <= 0) this.damageHero(f.dmg, f.pos.clone().sub(f.vel));
      }
      if (remove) {
        v.burst(f.pos, { count: 40, color: f.big ? 0xa050ff : 0xff5a10, color2: 0xffd040, speed: 5, life: 0.6, size: 0.3, gravity: 2 });
        this.g.audio.explode();
        f.mesh.parent?.remove(f.mesh);
        this.fireballs.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const f = b.t / b.dur;
      const w = f < 0.12 ? f / 0.12 : 1 - Math.pow((f - 0.12) / 0.88, 2);
      b.outer.scale.set(0.9 * w, 1, 0.9 * w);
      b.inner.scale.set(0.35 * w, 1, 0.35 * w);
      if (f >= 1) { b.grp.parent?.remove(b.grp); this.beams.splice(i, 1); }
    }
  }

  // ---------- Frame ----------
  update(dt) {
    if (!this.active) return;
    this.clock += dt;
    this.updateHero(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].update(dt, this.hero)) { this.enemies[i].remove(); this.enemies.splice(i, 1); }
    }
    // Enemy-enemy separation.
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i], b = this.enemies[j];
      if (a.dead || b.dead) continue;
      const d = new THREE.Vector3().subVectors(b.pos, a.pos).setY(0);
      const len = d.length(), min = 0.45 * (a.T.scale + b.T.scale);
      if (len < min && len > 1e-4) { d.multiplyScalar((min - len) / len / 2); a.pos.sub(d); b.pos.add(d); }
    }
    this.updateProjectiles(dt);
    // Lanka fire hazard during the boss fight.
    const hz = this.g.arena.hazardAt?.(this.hero.pos);
    if (hz > 0) this.damageHero(hz * dt, null, true);
    for (const [x, y, z] of this.embers || []) if (Math.random() < 0.5) this.g.vfx.spawn(x + rand(-0.6, 0.6), y, z + rand(-0.4, 0.4), 0, rand(1, 2.5), 0, 0.6, rand(0.3, 0.5), Math.random() < 0.5 ? 0xff5a10 : 0xffa030, 0, 1);
    // Gate.
    if (this.gate) {
      const g = this.gate;
      g.portal.material.opacity = g.open ? 0.6 + Math.sin(this.clock * 5) * 0.15 : 0.35;
      if (g.open) {
        if (Math.random() < 0.6) this.g.vfx.spawn(g.x + rand(-1.2, 1.2), this.groundY(g.x, g.z) + rand(0, 0.5), g.z + rand(-0.4, 0.4), 0, rand(2, 4), 0, 0.9, 0.25, 0xffd27a, 0, 0.5);
        if (!this.transition && Math.hypot(this.hero.pos.x - g.x, this.hero.pos.z - g.z) < 1.7) this.nextZone();
      }
    }
    this.updateCamera(dt);
    this.updateHUD(dt);
  }

  nextZone() {
    this.transition = true;
    this.cleared.add(this.zone.id);
    this.g.audio.conch();
    $('fade').classList.add('on');
    setTimeout(() => {
      this.loadZone(this.zi + 1);
      $('fade').classList.remove('on');
      this.transition = false;
    }, 650);
  }

  arenaInfo() {
    const fighting = !!(this.boss && this.boss.engaged && !this.boss.dead && !this.hero.dead);
    return { fighting, fighters: [this.hero, ...(this.boss ? [this.boss] : [])] };
  }

  updateCamera(dt) {
    const h = this.hero, cam = this.g.camera;
    const k = (s) => 1 - Math.exp(-dt * s);
    if ((h.moving && this.lastIz >= 0 && h.rollT <= 0) || h.drawT > 0 || h.beamT > 0) this.camYaw = angleLerp(this.camYaw, h.facing, k(h.drawT > 0 ? 4 : 2.2));
    const back = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const height = h.crouch ? 2.2 : 2.7;
    const desired = h.pos.clone().addScaledVector(back, -5.6).setY(h.pos.y + height);
    cam.position.lerp(desired, k(6));
    this.camLook.lerp(h.pos.clone().addScaledVector(back, 2.6).setY(h.pos.y + 1.3), k(8));
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const s = this.shakeAmt * this.shakeAmt * 0.35;
    cam.lookAt(this.camLook.x + rand(-s, s), this.camLook.y + rand(-s, s), this.camLook.z + rand(-s, s));
  }

  // ---------- HUD & minimap ----------
  updateHUD() {
    const h = this.hero;
    $('ahp').style.width = `${h.hp}%`;
    $('ahpLag').style.width = `${h.hpLag}%`;
    $('aprana').style.width = `${h.prana}%`;
    $('apranaBox').classList.toggle('full', h.prana >= 100);
    $('apranaTip').classList.toggle('ready', h.prana >= 100);
    if (this.boss) {
      $('bossHp').style.width = `${Math.max(0, this.boss.hp / this.boss.maxHp) * 100}%`;
      $('bossLag').style.width = `${Math.max(0, this.boss.hp / this.boss.maxHp) * 100}%`;
    }
    const spotted = this.enemies.some((e) => !e.dead && e.state === 'alert' && !e.boss);
    const st = $('stealth');
    if (h.dead) { st.textContent = ''; st.className = 'stealth'; }
    else if (spotted) { st.textContent = '⚠ DETECTED'; st.className = 'stealth detected'; }
    else if (h.hidden) { st.textContent = '◉ HIDDEN'; st.className = 'stealth hidden-on'; }
    else if (h.crouch) { st.textContent = '◌ SNEAKING'; st.className = 'stealth sneak'; }
    else { st.textContent = ''; st.className = 'stealth'; }
    this.drawMap();
  }

  renderJourney() {
    $('journey').innerHTML = ZONES.map((z, i) => {
      const cls = i === this.zi ? 'cur' : this.cleared.has(z.id) ? 'done' : '';
      return `<span class="${cls}">${this.cleared.has(z.id) ? '✓ ' : ''}${z.name}</span>`;
    }).join('<b>›</b>');
  }

  drawMap() {
    const g = this.map, S = 200, Z = this.zone, sh = Z.shape;
    const ex = sh.type === 'circle' ? sh.r : sh.hx, ez = sh.type === 'circle' ? sh.r : sh.hz;
    const sc = (S / 2 - 14) / Math.max(ex, ez);
    const X = (x) => S / 2 + x * sc, Y = (z) => S / 2 + z * sc;
    g.clearRect(0, 0, S, S);
    const bg = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 1.4);
    bg.addColorStop(0, 'rgba(40,28,18,.92)'); bg.addColorStop(1, 'rgba(12,8,6,.92)');
    g.fillStyle = bg; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); g.clip();
    // Walkable area.
    g.fillStyle = 'rgba(214,170,90,.16)'; g.strokeStyle = 'rgba(244,201,93,.75)'; g.lineWidth = 2;
    g.beginPath();
    if (sh.type === 'circle') g.arc(X(0), Y(0), sh.r * sc, 0, Math.PI * 2);
    else g.rect(X(-sh.hx), Y(-sh.hz), sh.hx * 2 * sc, sh.hz * 2 * sc);
    g.fill(); g.stroke();
    // Bushes & cover.
    g.fillStyle = 'rgba(90,160,60,.6)';
    for (const b of this.bushes) { g.beginPath(); g.arc(X(b.x), Y(b.z), Math.max(3, b.r * sc), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(170,160,150,.75)';
    for (const c of this.colliders) { g.beginPath(); g.arc(X(c.x), Y(c.z), Math.max(2, c.r * sc), 0, Math.PI * 2); g.fill(); }
    // Gate.
    if (this.gate) {
      const gx = X(this.gate.x), gz = Y(this.gate.z);
      g.fillStyle = this.gate.open ? '#ffd860' : 'rgba(140,110,70,.9)';
      g.fillRect(gx - 5, gz - 5, 10, 10);
      if (this.gate.open) { g.strokeStyle = 'rgba(255,216,96,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(gx, gz, 8 + Math.sin(this.clock * 5) * 2, 0, Math.PI * 2); g.stroke(); }
    }
    // Enemies.
    for (const e of this.enemies) {
      if (e.dead) continue;
      const x = X(e.pos.x), y = Y(e.pos.z);
      if (e.boss) { g.fillStyle = '#b050ff'; g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); continue; }
      g.fillStyle = e.state === 'alert' ? '#ff8a00' : e.state === 'patrol' ? '#e8c060' : '#ffe040';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      // Vision cone.
      g.fillStyle = e.state === 'alert' ? 'rgba(255,120,0,.18)' : 'rgba(255,230,120,.1)';
      g.beginPath(); g.moveTo(x, y);
      const yaw = Math.atan2(Math.cos(e.facing), Math.sin(e.facing));
      g.arc(x, y, Math.min(40, e.T.sight * sc * 0.6), yaw - e.T.fov, yaw + e.T.fov); g.closePath(); g.fill();
    }
    // Rama: red dot with facing pointer.
    const h = this.hero, hx = X(h.pos.x), hy = Y(h.pos.z);
    const fx = Math.sin(h.facing), fz = Math.cos(h.facing);
    g.fillStyle = 'rgba(255,40,40,.35)'; g.beginPath(); g.moveTo(hx + fx * 13, hy + fz * 13); g.lineTo(hx - fz * 5, hy + fx * 5); g.lineTo(hx + fz * 5, hy - fx * 5); g.closePath(); g.fill();
    g.fillStyle = '#ff2020'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(hx, hy, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = '#b8862b'; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f4c95d'; g.font = 'bold 13px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.fillText('N', S / 2, 16);
  }
}
