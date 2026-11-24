import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ARENAS } from './arenas/index.js';
import { FIGHTERS } from './characters.js';
import { Fighter } from './fighter.js';
import { VFX } from './vfx.js';
import { Sound } from './audio.js';
import { Input, emptyCommand } from './input.js';
import { AIController } from './ai.js';
import { Adventure } from './adventure/index.js';
import { DharmaYuddha } from './duel/mode.js';
import { WalletBar } from './ui/walletBar.js';
import { KeyGuide } from './ui/keys.js';

const $ = (id) => document.getElementById(id);
const ROUND_TIME = 99;

class Game {
  constructor() {
    // ---------- Renderer ----------
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    $('app').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);
    this.camera.position.set(0, 3, 10);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Soft rim/fill light that follows the camera so fighters read against the night.
    this.fill = new THREE.DirectionalLight(0xffe0c0, 0.9);
    this.scene.add(this.fill, this.fill.target);
    this.vfx = new VFX(this.scene);
    this.audio = new Sound();
    this.input = new Input();
    this.fx = { vfx: this.vfx, audio: this.audio, toast: (m) => this.toast(m) };
    this.arenaChoice = 'ashoka';
    this.loadArena('ashoka');

    this.fighters = {
      rama: new Fighter(FIGHTERS.rama, this),
      ravana: new Fighter(FIGHTERS.ravana, this),
    };
    this.projectiles = [];
    this.beams = [];

    this.state = 'menu';
    this.selected = 'rama';
    this.difficulty = 1;
    this.time = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.shakeAmt = 0;
    this.camF = new THREE.Vector3(0, 0, -1);
    this.lookAt = new THREE.Vector3(0, 1.2, 0);
    this.cine = null;
    this.combo = { n: 0, t: 0 };
    this.placeForMenu();
    this.adventure = new Adventure(this);
    this.wallet = null;
    this.keys = new KeyGuide();
    this.walletBar = new WalletBar(this);
    this.yuddha = new DharmaYuddha(this);

    this.bindUI();
    addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    setTimeout(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 700); }, 300);
  }

  // ---------- Arenas ----------
  loadArena(id) {
    if (id === 'random') id = ARENAS[(Math.random() * ARENAS.length) | 0].id;
    const def = ARENAS.find((a) => a.id === id);
    if (this.arenaRoot) {
      this.scene.remove(this.arenaRoot);
      this.arenaRoot.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { ['map', 'emissiveMap', 'bumpMap'].forEach((k) => m[k]?.dispose()); m.dispose(); }
      });
    }
    this.arenaRoot = new THREE.Group();
    this.scene.add(this.arenaRoot);
    this.arena = def.build(this.arenaRoot, this.scene, this.fx);
    this.arenaDef = def;
    this.vfx.floorY = this.arena.floorY ?? 0.02;
  }

  // Damage from the environment (sea, fire) — can KO or trigger Ravana's revive.
  envDamage(f, dmg, kind) {
    if (f.dead || this.state !== 'fight') return;
    f.hp -= dmg;
    f.hitFlash = Math.max(f.hitFlash, kind === 'fire' ? 0.45 : 1);
    if (kind === 'fire' && Math.random() < 0.25) this.vfx.burst(f.chest(), { count: 3, color: 0xff7a20, speed: 2, life: 0.4, size: 0.15, gravity: 2 });
    const res = f.checkDeath();
    const other = f === this.player ? this.enemy : this.player;
    if (res === 'ko') { this.audio.ko(); this.shake(0.6); this.endRound(other); }
    if (res === 'revive') {
      this.vfx.burst(f.chest(), { count: 120, color: 0xb050ff, color2: 0xff3050, speed: 6, life: 1.2, size: 0.25, gravity: 0, up: 1 });
      this.audio.roar();
      this.announce('DASHANANA', 'A head falls — Ravana rises again', 1.8);
    }
  }

  onSplash(f) {
    const p = f.pos.clone();
    p.y = this.arena.waterY ?? -1.6;
    this.vfx.burst(p, { count: 80, color: 0xcfe8ff, color2: 0x6fa8d0, speed: 7, life: 0.9, size: 0.3, gravity: -12, up: 5 });
    this.vfx.ring(p, 0xbfe0ff, 3, 0.6, p.y + 0.05);
    this.audio.splash();
    this.shake(0.3);
    this.toast('INTO THE SAMUDRA!');
    this.envDamage(f, 12, 'sea');
  }

  // ---------- UI ----------
  bindUI() {
    const pick = $('arenaPick');
    for (const a of [...ARENAS, { id: 'random', name: 'Random', sub: 'A different battlefield each match' }]) {
      const b = document.createElement('button');
      b.textContent = a.name;
      b.dataset.id = a.id;
      if (a.id === this.arenaChoice) b.classList.add('on');
      b.addEventListener('click', () => {
        pick.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.arenaChoice = a.id;
        $('arenaTip').textContent = `${a.sub} · Best of 3 rounds`;
        if (a.id !== 'random') this.loadArena(a.id);
      });
      pick.appendChild(b);
    }
    document.querySelectorAll('.card').forEach((card) => card.addEventListener('click', () => {
      document.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      this.selected = card.dataset.id;
    }));
    document.querySelectorAll('.diff button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.diff button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      this.difficulty = +b.dataset.d;
    }));
    $('startBtn').addEventListener('click', () => this.startMatch());
    $('yatraBtn').addEventListener('click', () => this.openHub());
    document.querySelectorAll('#hubTiles .hub-tile').forEach((t) => t.addEventListener('click', () => {
      const go = t.dataset.go;
      if (go === 'journey') this.startAdventure();
      else if (go === 'dharma') this.startYuddha();
      else { $('hubTiles').classList.add('hidden'); $('hubYuddha').classList.remove('hidden'); }
    }));
    $('hubBack').addEventListener('click', () => {
      if (!$('hubYuddha').classList.contains('hidden')) this.openHub();
      else this.toMenu();
    });
    $('advRetry').addEventListener('click', () => this.adventure.retry());
    $('advMenu').addEventListener('click', () => this.toHub());
    $('resumeBtn').addEventListener('click', () => this.togglePause());
    $('quitBtn').addEventListener('click', () => this.toHub());
    $('rematchBtn').addEventListener('click', () => this.startMatch());
    $('menuBtn').addEventListener('click', () => this.toHub());
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && (this.state === 'fight' || this.state === 'paused' || this.state === 'intro' || this.state === 'adventure')) this.togglePause();
      if (e.code === 'KeyM') this.audio.toggleMute();
      if (e.code === 'Enter' && this.state === 'menu' && !$('menu').classList.contains('hidden')) this.openHub();
    });
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.vfx.resize();
  }

  placeForMenu() {
    const { rama, ravana } = this.fighters;
    rama.reset(new THREE.Vector3(-1.8, 0, 0), Math.PI / 2);
    ravana.reset(new THREE.Vector3(1.8, 0, 0), -Math.PI / 2);
  }

  startAdventure() {
    document.activeElement?.blur(); // so Enter/Space don't re-click the menu button
    this.audio.init();
    this.audio.ctx.resume();
    ['menu', 'hub', 'result', 'pause', 'hud'].forEach((id) => $(id).classList.add('hidden'));
    Object.values(this.fighters).forEach((f) => { f.root.visible = false; f.clearStorm(); });
    this.clearProjectiles();
    this.keys.show('journey');
    this.state = 'adventure';
    this.audio.startMusic();
    this.adventure.start();
  }

  // Dharma Yuddha: hidden-move duels with side characters (Solana / MagicBlock).
  startYuddha() {
    document.activeElement?.blur();
    this.audio.init();
    this.audio.ctx.resume();
    ['menu', 'hub', 'result', 'pause', 'hud'].forEach((id) => $(id).classList.add('hidden'));
    Object.values(this.fighters).forEach((f) => { f.root.visible = false; f.clearStorm(); });
    this.clearProjectiles();
    this.yuddha.enter();
  }

  /** The Yatra hub: every mode (Journey, Yuddha, Dharma Yuddha) starts here. */
  openHub() {
    document.activeElement?.blur();
    $('menu').classList.add('hidden');
    $('hub').classList.remove('hidden');
    $('hubTiles').classList.remove('hidden');
    $('hubYuddha').classList.add('hidden');
  }

  toHub() {
    this.toMenu();
    this.openHub();
  }

  toMenu() {
    this.keys.hide();
    clearTimeout(this.annT);
    $('announce').classList.remove('show');
    $('toast').classList.remove('show');
    $('hub').classList.add('hidden');
    if (this.state === 'yuddha') {
      this.yuddha.exit();
      Object.values(this.fighters).forEach((f) => (f.root.visible = true));
      this.loadArena(this.arenaChoice === 'random' ? 'ashoka' : this.arenaChoice);
    }
    if (this.adventure.active) {
      this.adventure.stop();
      Object.values(this.fighters).forEach((f) => (f.root.visible = true));
      this.loadArena(this.arenaChoice === 'random' ? 'ashoka' : this.arenaChoice);
    }
    this.state = 'menu';
    this.audio.stopMusic();
    ['hud', 'pause', 'result'].forEach((id) => $(id).classList.add('hidden'));
    $('menu').classList.remove('hidden');
    this.clearProjectiles();
    this.placeForMenu();
  }

  togglePause() {
    if (this.state === 'paused') { this.state = this.pausedFrom; $('pause').classList.add('hidden'); }
    else { this.pausedFrom = this.state; this.state = 'paused'; $('pause').classList.remove('hidden'); }
  }

  startMatch() {
    document.activeElement?.blur();
    this.audio.init();
    this.audio.ctx.resume();
    this.player = this.fighters[this.selected];
    this.enemy = this.fighters[this.selected === 'rama' ? 'ravana' : 'rama'];
    this.ai = new AIController(this.difficulty);
    if (this.arenaChoice === 'random') this.loadArena('random');
    this.wins = [0, 0];
    this.round = 1;
    $('p1name').textContent = this.player.def.name;
    $('p2name').textContent = this.enemy.def.name;
    ['menu', 'hub', 'result', 'pause'].forEach((id) => $(id).classList.add('hidden'));
    $('hud').classList.remove('hidden');
    this.keys.show('yuddha');
    this.audio.startMusic();
    this.startRound();
  }

  startRound() {
    this.clearProjectiles();
    this.player.reset(new THREE.Vector3(0, 0, 4.5), Math.PI);
    this.enemy.reset(new THREE.Vector3(0, 0, -4.5), 0);
    this.camF.set(0, 0, -1);
    this.camera.position.set(1, 3, 10);
    this.timer = ROUND_TIME;
    this.state = 'intro';
    this.stateT = 0;
    this.timeScale = 1;
    this.cine = null;
    this.arena.resetRound?.();
    this.announce(`ROUND ${this.round}`, this.arenaDef.name);
    this.audio.conch();
    this.updateWins();
  }

  announce(text, sub = '', dur = 1.4) {
    const el = $('announce');
    el.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
    el.classList.add('show');
    clearTimeout(this.annT);
    this.annT = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 700);
  }

  updateWins() {
    [['p1wins', 0], ['p2wins', 1]].forEach(([id, i]) => {
      [...$(id).children].forEach((el, k) => el.classList.toggle('on', k < this.wins[i]));
    });
  }

  // ---------- Combat events ----------
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  resolveHit(att, tgt, hit) {
    const res = tgt.receiveHit(att, hit);
    const p = tgt.chest().lerp(att.chest(), 0.25);
    const a = this.audio, v = this.vfx;
    switch (res) {
      case 'hit':
        v.burst(p, { count: hit.heavy ? 45 : 22, color: att.def.hitColor, color2: 0xffffff, speed: hit.heavy ? 7 : 5, life: 0.45, size: 0.16 });
        v.flash(p, att.def.hitColor, hit.heavy ? 40 : 20);
        if (!hit.quiet) a.hit(hit.heavy || hit.kind === 'ult');
        else a.hit(false);
        this.hitstop = hit.heavy ? 0.11 : hit.quiet ? 0.02 : 0.06;
        this.shake(hit.heavy ? 0.5 : 0.22);
        if (att === this.player) { this.combo.n++; this.combo.t = 1.2; }
        break;
      case 'block':
        v.burst(p, { count: 14, color: 0x9fd0ff, speed: 4, life: 0.3, size: 0.12 });
        a.block(); this.hitstop = 0.04; this.shake(0.1);
        break;
      case 'parry':
        v.burst(p, { count: 40, color: 0xffffff, color2: 0x9fd0ff, speed: 8, life: 0.4, size: 0.14, gravity: 0 });
        v.ring(tgt.pos, 0xbfe6ff, 2.5, 0.35, 1.2);
        v.flash(p, 0xbfe6ff, 40);
        a.parry(); this.hitstop = 0.15; this.shake(0.25);
        this.toast('PARRY!');
        break;
      case 'guardbreak':
        v.burst(p, { count: 30, color: 0xff9a3a, speed: 6, life: 0.4, size: 0.16 });
        a.guardBreak(); this.hitstop = 0.1; this.shake(0.4);
        this.toast('GUARD BREAK');
        break;
      case 'revive':
        v.burst(tgt.chest(), { count: 120, color: 0xb050ff, color2: 0xff3050, speed: 6, life: 1.2, size: 0.25, gravity: 0, up: 1 });
        v.ring(tgt.pos, 0xb050ff, 5, 0.8);
        v.flash(tgt.chest(), 0xb050ff, 60, 0.8);
        a.roar(); this.shake(0.5);
        this.announce('DASHANANA', 'A head falls — Ravana rises again', 1.8);
        break;
      case 'ko':
        v.burst(p, { count: 90, color: att.def.hitColor, color2: 0xffffff, speed: 9, life: 0.9, size: 0.2 });
        v.flash(p, att.def.hitColor, 80, 0.6);
        a.ko(); this.shake(0.7);
        this.endRound(att);
        break;
      case 'miss':
        if (tgt === this.player) this.toast('EVADED');
        break;
    }
  }

  onUltimate(f, mv) {
    this.cine = { f, t: 0, dur: mv.type === 'beam' ? mv.fireAt : 0.9 };
    this.announce(mv.name, f.def.name, 1.2);
    if (mv.type === 'beam') this.audio.charge(); else this.audio.roar();
    this.vfx.ring(f.pos, mv.type === 'beam' ? 0xffd27a : 0xa060ff, 4, 0.7);
  }

  spawnProjectile(owner, type, pos, dir, dmg, speed, power) {
    const grp = new THREE.Group();
    if (type === 'arrow') {
      const glowCol = power > 0.95 ? 0xfff2b0 : 0xffc860;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x7a4a20, emissive: glowCol, emissiveIntensity: 0.6 + power * 2 }));
      shaft.rotation.x = Math.PI / 2;
      grp.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(glowCol).multiplyScalar(3) }));
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.56;
      grp.add(tip);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09 + power * 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
      glow.position.z = 0.5;
      grp.add(glow);
      this.audio.twang(power);
    } else {
      grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(2.5) })));
      grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3a00, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })));
      this.audio.fire();
    }
    grp.position.copy(pos);
    grp.lookAt(pos.clone().add(dir));
    this.scene.add(grp);
    this.projectiles.push({ owner, type, mesh: grp, pos: grp.position, vel: dir.clone().multiplyScalar(speed), dmg, power, life: 2.5 });
  }

  fireBeam(owner, enemy, start, dir) {
    const len = 32;
    const grp = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4d0).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    inner.scale.set(0.4, 1, 0.4);
    grp.add(outer, inner);
    grp.position.copy(start).addScaledVector(dir, len / 2);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(grp);
    this.beams.push({ grp, outer, inner, t: 0, dur: 0.85, start: start.clone(), dir: dir.clone(), len });
    this.audio.beam();
    this.shake(0.8);
    this.vfx.flash(start, 0xffd27a, 120, 0.8);
    this.vfx.ring(owner.pos, 0xffd27a, 6, 0.6);
    // Hit test: distance from enemy's centre line to the beam ray.
    const c = enemy.chest();
    const along = c.clone().sub(start).dot(dir);
    const closest = start.clone().addScaledVector(dir, along);
    if (along > 0 && along < len && closest.distanceTo(c) < 1.6 * enemy.def.scale) {
      this.resolveHit(owner, enemy, { kind: 'ult', dmg: owner.def.moves.ultimate.dmg, knock: 10, heavy: true, stun: 0.9 });
    }
  }

  clearProjectiles() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const b of this.beams) this.scene.remove(b.grp);
    this.projectiles = [];
    this.beams = [];
    Object.values(this.fighters).forEach((f) => f.clearStorm());
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      const v = this.vfx;
      if (p.type === 'arrow') {
        v.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.25 + p.power * 0.2, 0.12 + p.power * 0.15, 0xffd27a, 0, 0);
      } else {
        for (let k = 0; k < 3; k++) v.spawn(p.pos.x + (Math.random() - 0.5) * 0.3, p.pos.y + (Math.random() - 0.5) * 0.3, p.pos.z + (Math.random() - 0.5) * 0.3, 0, 1, 0, 0.4, 0.35, k ? 0xff5a10 : 0xffc040, 1, 1);
        p.mesh.children[1].scale.setScalar(1 + Math.sin(this.time * 30) * 0.15);
      }
      const tgt = p.owner === this.player ? this.enemy : this.player;
      const dx = p.pos.x - tgt.pos.x, dz = p.pos.z - tgt.pos.z;
      const hitR = (p.type === 'fireball' ? 0.75 : 0.55) * tgt.def.scale;
      const inY = p.pos.y > 0.1 && p.pos.y < 2.3 * tgt.def.scale;
      let remove = p.life <= 0 || Math.hypot(p.pos.x, p.pos.z) > 40 || p.pos.y < 0;
      if (!remove && inY && dx * dx + dz * dz < hitR * hitR && !tgt.dead) {
        const res = tgt.iframes > 0 ? 'miss' : null;
        if (!res) {
          this.resolveHit(p.owner, tgt, { kind: 'proj', dmg: p.dmg, knock: p.type === 'fireball' ? 5 : 2.5 + p.power * 4, heavy: p.power > 0.95, stun: 0.35 });
          remove = true;
        }
      }
      if (remove) {
        if (p.type === 'fireball') {
          v.burst(p.pos, { count: 60, color: 0xff5a10, color2: 0xffd040, speed: 6, life: 0.7, size: 0.35, gravity: 2 });
          v.flash(p.pos, 0xff6a20, 50, 0.4);
          this.audio.explode();
          this.shake(0.3);
        } else {
          v.burst(p.pos, { count: 14, color: 0xffd27a, speed: 3, life: 0.3, size: 0.12 });
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const f = b.t / b.dur;
      const w = f < 0.12 ? f / 0.12 : 1 - Math.pow((f - 0.12) / 0.88, 2);
      const wob = 1 + Math.sin(this.time * 60) * 0.08;
      b.outer.scale.set(0.9 * w * wob, 1, 0.9 * w * wob);
      b.inner.scale.set(0.35 * w, 1, 0.35 * w);
      for (let k = 0; k < 8; k++) {
        const s = b.start.clone().addScaledVector(b.dir, Math.random() * b.len);
        const r = new THREE.Vector3().randomDirection().multiplyScalar(0.8 * w);
        this.vfx.spawn(s.x + r.x, s.y + r.y, s.z + r.z, r.x * 3, r.y * 3, r.z * 3, 0.4, 0.25, k % 2 ? 0xffd27a : 0xffffff, 0, 1);
      }
      if (f >= 1) { this.scene.remove(b.grp); this.beams.splice(i, 1); }
    }
  }

  endRound(winner) {
    if (this.state !== 'fight') return;
    this.state = 'roundEnd';
    this.stateT = 0;
    this.slowmoT = 1.4;
    const wi = winner === this.player ? 0 : 1;
    this.wins[wi]++;
    this.updateWins();
    this.roundWinner = winner;
    this.announce('K.O.', '', 1.5);
  }

  timeUp() {
    this.state = 'roundEnd';
    this.stateT = 0;
    const p = this.player.hp / this.player.def.maxHp, e = this.enemy.hp / this.enemy.def.maxHp;
    const winner = p >= e ? this.player : this.enemy;
    this.wins[winner === this.player ? 0 : 1]++;
    this.updateWins();
    this.roundWinner = winner;
    this.announce('TIME', '', 1.5);
  }

  // ---------- Camera ----------
  updateCamera(dt) {
    const cam = this.camera;
    const k = (s) => 1 - Math.exp(-dt * s);
    let desired, look;
    if (this.state === 'menu') {
      const a = this.time * 0.12;
      desired = new THREE.Vector3(Math.sin(a) * 7.5, 2.4 + Math.sin(this.time * 0.3) * 0.4, Math.cos(a) * 7.5);
      look = new THREE.Vector3(0, 1.35, 0);
      cam.position.lerp(desired, k(2));
      this.lookAt.lerp(look, k(3));
    } else if (this.cine && this.cine.t < this.cine.dur) {
      const f = this.cine.f;
      const fw = new THREE.Vector3(Math.sin(f.facing), 0, Math.cos(f.facing));
      const rt = new THREE.Vector3(-fw.z, 0, fw.x);
      desired = f.pos.clone().addScaledVector(rt, 3.4).addScaledVector(fw, 1.6).setY(1.7 * f.def.scale);
      look = f.chest();
      cam.position.lerp(desired, k(6));
      this.lookAt.lerp(look, k(8));
    } else {
      const P = this.player, E = this.enemy;
      const d = new THREE.Vector3().subVectors(E.pos, P.pos).setY(0);
      const sep = d.length();
      if (sep > 0.4) this.camF.lerp(d.divideScalar(sep), k(4)).normalize();
      const rt = new THREE.Vector3(-this.camF.z, 0, this.camF.x);
      const dist = 4.4 + sep * 0.38;
      desired = P.pos.clone().addScaledVector(this.camF, -dist).addScaledVector(rt, 1.2).setY(2.1 + sep * 0.13);
      look = P.pos.clone().lerp(E.pos, 0.5).setY(1.15);
      if (this.state === 'roundEnd' && this.stateT > 1.2) {
        const w = this.roundWinner;
        const fw = new THREE.Vector3(Math.sin(w.facing), 0, Math.cos(w.facing));
        desired = w.pos.clone().addScaledVector(fw, 3.6).setY(1.6);
        look = w.chest();
      }
      cam.position.lerp(desired, k(5));
      this.lookAt.lerp(look, k(7));
    }
    this.fill.position.copy(cam.position).add(new THREE.Vector3(0, 4, 0));
    this.fill.target.position.copy(this.lookAt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const s = this.shakeAmt * this.shakeAmt * 0.35;
    cam.lookAt(this.lookAt.x + (Math.random() - 0.5) * s, this.lookAt.y + (Math.random() - 0.5) * s, this.lookAt.z + (Math.random() - 0.5) * s);
  }

  // ---------- HUD ----------
  updateHUD() {
    const set = (pfx, f) => {
      $(pfx + 'hp').style.width = `${(f.hp / f.def.maxHp) * 100}%`;
      $(pfx + 'lag').style.width = `${(f.hpLag / f.def.maxHp) * 100}%`;
      $(pfx + 'prana').style.width = `${f.prana}%`;
      $(pfx + 'pranaBox').classList.toggle('full', f.prana >= 100);
    };
    set('p1', this.player);
    set('p2', this.enemy);
    $('timer').textContent = Math.ceil(Math.max(0, this.timer));
    const c = $('combo');
    if (this.combo.n >= 2 && this.combo.t > 0) { c.innerHTML = `${this.combo.n}<small>HIT COMBO</small>`; c.classList.add('show'); }
    else c.classList.remove('show');
  }

  // ---------- Main loop ----------
  frame() {
    const rawDt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += rawDt;

    if (this.state === 'paused') { this.composer.render(); this.input.endFrame(); return; }

    if (this.state === 'yuddha') {
      this.yuddha.update(rawDt);
      this.input.endFrame();
      return;
    }

    if (this.state === 'adventure') {
      this.adventure.update(rawDt);
      this.arena.update(rawDt, this.time, this.adventure.arenaInfo());
      this.vfx.update(rawDt);
      this.composer.render();
      this.input.endFrame();
      return;
    }

    if (this.slowmoT > 0) { this.slowmoT -= rawDt; this.timeScale = 0.3; } else this.timeScale = 1;
    let dt = rawDt * this.timeScale;
    if (this.hitstop > 0) { this.hitstop -= rawDt; dt = 0; }

    const { rama, ravana } = this.fighters;
    if (this.state === 'menu') {
      const none = emptyCommand();
      rama.update(rawDt, none, ravana);
      ravana.update(rawDt, none, rama);
    } else {
      this.stateT += rawDt;
      if (this.cine) this.cine.t += rawDt;
      let pc = emptyCommand(), ec = emptyCommand();
      if (this.state === 'intro') {
        if (this.stateT > 1.6 && !this.saidFight) { this.saidFight = true; this.announce('YUDDHA!', 'Fight', 0.8); this.audio.bell(); }
        if (this.stateT > 2.2) { this.state = 'fight'; this.saidFight = false; }
      } else if (this.state === 'fight') {
        pc = this.input.playerCommand();
        ec = this.ai.command(dt, this.enemy, this.player, this.projectiles);
        this.timer -= dt;
        if (this.timer <= 0) this.timeUp();
      } else if (this.state === 'roundEnd') {
        if (this.stateT > 1.2) this.roundWinner.victory = true;
        if (this.stateT > 4) {
          if (this.wins[0] >= 2 || this.wins[1] >= 2) this.endMatch();
          else { this.round++; this.startRound(); }
        }
      }
      // Buffer button presses made during hit-stop so combos aren't dropped.
      const TAPS = ['light', 'heavy', 'dodge', 'special', 'ultimate'];
      this.tapBuf ??= {};
      for (const t of TAPS) if (pc[t]) this.tapBuf[t] = true;
      if (dt > 0) {
        for (const t of TAPS) if (this.tapBuf[t]) pc[t] = true;
        this.tapBuf = {};
        this.player.update(dt, pc, this.enemy);
        this.enemy.update(dt, ec, this.player);
        this.separate();
        this.updateProjectiles(dt);
      }
      this.combo.t -= rawDt;
      if (this.combo.t <= 0) this.combo.n = 0;
      if (this.state !== 'matchEnd') this.updateHUD();
    }

    this.arena.update(rawDt, this.time, { fighting: this.state === 'fight', fighters: this.player ? [this.player, this.enemy] : [] });
    if (this.state === 'fight' && this.arena.hazardAt && dt > 0) {
      for (const f of [this.player, this.enemy]) {
        const dps = this.arena.hazardAt(f.pos);
        if (dps > 0) this.envDamage(f, dps * dt, 'fire');
      }
    }
    this.vfx.update(dt || rawDt * 0.1);
    this.updateCamera(rawDt);
    this.composer.render();
    this.input.endFrame();
  }

  separate() {
    const a = this.player, b = this.enemy;
    const d = new THREE.Vector3().subVectors(b.pos, a.pos).setY(0);
    const len = d.length();
    const min = 0.55 * (a.def.scale + b.def.scale);
    if (a.dead || b.dead) return;
    if (len < min && len > 1e-4) {
      d.multiplyScalar((min - len) / len / 2);
      a.pos.sub(d);
      b.pos.add(d);
    }
  }

  endMatch() {
    this.state = 'matchEnd';
    this.audio.stopMusic();
    const won = this.wins[0] >= 2;
    $('hud').classList.add('hidden');
    $('result').classList.remove('hidden');
    $('resultTitle').textContent = won ? 'VIJAYA' : 'PARAJAYA';
    const lines = {
      rama: won ? 'Dharma prevails. The arrow of Rama finds its mark.' : 'The Lord of Lanka stands unbowed — for now.',
      ravana: won ? 'Ten heads, ten crowns — Lanka’s king is undefeated.' : 'Even ten heads could not outlast Dharma.',
    };
    $('resultText').textContent = lines[this.player.def.id];
  }
}

window.game = new Game();
