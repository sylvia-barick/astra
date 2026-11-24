import * as THREE from 'three';
import { mat, add, clothTex, buildHead, buildBody, addCape } from '../characters.js';

// Dharma Yuddha roster — warriors of the epic's two armies, but never the
// revered central figures. Vanara Sena: Angada and Neela. Rakshasa Sena:
// Indrajit (Meghnad) and Kumbhakarna. Stats here mirror the on-chain program
// (onchain/programs/dharma-yuddha/src/lib.rs → FIGHTER_STATS); keep them in sync.

// Simian head: a lighter muzzle, flat nose, round ears.
function vanaraHead(c, o = {}) {
  const head = buildHead(c, 1.0, { browTilt: 0.2, noEarrings: !o.earrings });
  add(head, new THREE.SphereGeometry(0.075, 18, 12), c.muzzle, 0, -0.05, 0.075, 1.2, 0.85, 0.9);
  add(head, new THREE.SphereGeometry(0.012, 8, 6), c.pupil, -0.015, -0.025, 0.14);
  add(head, new THREE.SphereGeometry(0.012, 8, 6), c.pupil, 0.015, -0.025, 0.14);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.045, 12, 8), c.skin, s * 0.125, 0.01, -0.01, 0.4, 1, 0.9);
  // Fur cap and side whiskers.
  add(head, new THREE.SphereGeometry(0.128, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), c.fur, 0, 0.015, -0.01, 1, 1.05, 1.05);
  for (const s of [-1, 1]) add(head, new THREE.ConeGeometry(0.04, 0.1, 6), c.fur, s * 0.1, -0.06, 0.02).rotation.z = s * 2.2;
  return head;
}

function tail(rig, furMat) {
  const pts = [
    new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, -0.25, -0.38), new THREE.Vector3(0, -0.5, -0.5),
    new THREE.Vector3(0, -0.55, -0.75), new THREE.Vector3(0, -0.3, -0.95), new THREE.Vector3(0, 0.05, -0.95),
  ];
  const t = add(rig.hips, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 8), furMat);
  rig.tail = t;
  return t;
}

function gada(gold, iron, size = 1) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.028, 0.032, 0.7 * size, 10), gold, 0, -0.25 * size, 0);
  add(g, new THREE.SphereGeometry(0.15 * size, 18, 14), iron, 0, -0.65 * size, 0, 1, 1.15, 1);
  for (let k = 0; k < 4; k++) add(g, new THREE.TorusGeometry(0.152 * size, 0.014, 6, 24), gold, 0, -0.65 * size + (k - 1.5) * 0.06 * size, 0).rotation.x = Math.PI / 2;
  add(g, new THREE.ConeGeometry(0.05 * size, 0.12 * size, 10), gold, 0, -0.85 * size, 0).rotation.x = Math.PI;
  g.rotation.x = 0.3;
  return g;
}

function crown(head, gold, gem, h = 0.16) {
  add(head, new THREE.CylinderGeometry(0.12, 0.126, 0.055, 18), gold, 0, 0.1, 0);
  add(head, new THREE.CylinderGeometry(0.035, 0.105, h, 14), gold, 0, 0.1 + h / 2 + 0.02, 0);
  add(head, new THREE.ConeGeometry(0.03, 0.1, 8), gold, 0, 0.1 + h + 0.07, 0);
  add(head, new THREE.SphereGeometry(0.02, 8, 6), gem, 0, 0.11, 0.124);
}

// ---------------- ANGADA — Vanara prince, son of Vali ----------------
export function buildAngada() {
  const gold = mat(0xe0ac3e, { metalness: 0.9, roughness: 0.3 });
  const fur = mat(0xb07a3a, { roughness: 0.85 });
  const skin = mat(0xc89262, { roughness: 0.6 });
  const muzzle = mat(0xe2c2a0, { roughness: 0.7 });
  const cloth = mat(0xffffff, { map: clothTex('#1f6a4a', '#e0ac3e'), roughness: 0.7, side: THREE.DoubleSide });
  const gem = mat(0x20c060, { emissive: 0x0a4020, roughness: 0.2 });
  const c = {
    bulk: 1.12, muscle: true, skin, gold, fur, muzzle,
    skirt: { mat: cloth, top: 0.2, bottom: 0.3, len: 0.4 },
    torso: fur, arm: fur, forearm: fur, shoulder: gold,
    thigh: fur, shin: fur, foot: skin, anklet: gold, gauntlet: gold,
    hair: fur, brow: mat(0x5a3818), lip: mat(0x5a3020), eyeWhite: mat(0xf2eadc), pupil: mat(0x2a1408),
  };
  const rig = buildBody(c);
  const head = vanaraHead(c, { earrings: true });
  crown(head, gold, gem, 0.12);
  rig.headPivot.add(head);
  add(rig.hips, new THREE.TorusGeometry(0.22, 0.03, 8, 30), gold, 0, 0.06, 0, 1, 1, 0.85).rotation.x = Math.PI / 2;
  add(rig.torso, new THREE.TorusGeometry(0.12, 0.02, 8, 24, Math.PI), gold, 0, 0.53, 0.05, 1.1, 1.3, 1).rotation.set(Math.PI * 0.6, 0, Math.PI);
  add(rig.torso, new THREE.TorusGeometry(0.21, 0.04, 8, 30), cloth, 0, 0.34, 0, 1.15, 1.2, 0.75).rotation.set(0, 0, 0.7);
  tail(rig, fur);
  rig.handR.add(gada(gold, mat(0x8a6a30, { metalness: 0.8, roughness: 0.35 })));
  rig.flashMats = [fur, skin];
  return rig;
}

// ---------------- NEELA — Vanara commander ----------------
export function buildNeela() {
  const fur = mat(0x3c4a6a, { roughness: 0.85 });
  const skin = mat(0x6a7690, { roughness: 0.6 });
  const muzzle = mat(0xb6bccc, { roughness: 0.7 });
  const bronze = mat(0xa87838, { metalness: 0.8, roughness: 0.4 });
  const cloth = mat(0xffffff, { map: clothTex('#7a2a18', '#d4a040'), roughness: 0.75, side: THREE.DoubleSide });
  const c = {
    bulk: 1.06, muscle: true, skin, gold: bronze, fur, muzzle,
    skirt: { mat: cloth, top: 0.2, bottom: 0.28, len: 0.36 },
    torso: fur, arm: fur, forearm: fur, shoulder: fur,
    thigh: fur, shin: fur, foot: skin, anklet: bronze, gauntlet: bronze,
    hair: fur, brow: mat(0x1a2030), lip: mat(0x2a2a3a), eyeWhite: mat(0xf0ece0), pupil: mat(0x101018),
  };
  const rig = buildBody(c);
  const head = vanaraHead(c);
  add(head, new THREE.TorusGeometry(0.125, 0.018, 6, 24), bronze, 0, 0.08, 0, 1, 1, 1).rotation.x = Math.PI / 2;
  rig.headPivot.add(head);
  add(rig.torso, new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze, 0.3, 0.55, 0, 1.1, 0.7, 1.1);
  tail(rig, fur);
  // Uprooted sal-tree club.
  const club = new THREE.Group();
  const wood = mat(0x5a3a1e, { roughness: 0.9 });
  add(club, new THREE.CylinderGeometry(0.05, 0.03, 1.1, 8), wood, 0, -0.45, 0);
  for (let k = 0; k < 4; k++) add(club, new THREE.CylinderGeometry(0.012, 0.018, 0.22, 5), wood, Math.cos(k * 1.7) * 0.06, -0.55 - k * 0.12, Math.sin(k * 1.7) * 0.06).rotation.set(Math.sin(k * 1.7) * 0.9, 0, -Math.cos(k * 1.7) * 0.9);
  add(club, new THREE.SphereGeometry(0.12, 10, 8), mat(0x3a6a2a, { roughness: 0.9 }), 0, -1.0, 0, 1, 1.3, 1);
  club.rotation.x = 0.3;
  rig.handR.add(club);
  rig.flashMats = [fur, skin];
  return rig;
}

// ---------------- INDRAJIT (Meghnad) — Lanka's prince, master of illusion ----------------
export function buildIndrajit() {
  const gold = mat(0xd4a03a, { metalness: 0.9, roughness: 0.3 });
  const skin = mat(0x7a4a32, { roughness: 0.5 });
  const armor = mat(0x2a1a1a, { metalness: 0.7, roughness: 0.35 });
  const cloth = mat(0xffffff, { map: clothTex('#5a0a12', '#d4a03a'), roughness: 0.7, side: THREE.DoubleSide });
  const gem = mat(0x6a40ff, { emissive: 0x2a10a0, roughness: 0.2 });
  const c = {
    bulk: 1.05, muscle: true, skin, gold,
    skirt: { mat: cloth, top: 0.2, bottom: 0.36, len: 0.7 },
    torso: skin, arm: skin, forearm: skin, shoulder: armor,
    thigh: cloth, thighR: 1.1, shin: armor, foot: armor, boot: armor,
    gauntlet: gold, gauntletTrim: armor,
    hair: mat(0x0a0606), brow: mat(0x0a0606), lip: mat(0x4a1a1a), eyeWhite: mat(0xf0e6d6), pupil: mat(0x8a50ff, { emissive: 0x4020aa }),
  };
  const rig = buildBody(c);
  add(rig.torso, new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), armor, 0, 0.42, 0, 1.4, 0.9, 1.05);
  add(rig.torso, new THREE.TorusGeometry(0.235, 0.018, 6, 32), gold, 0, 0.5, 0, 1.4, 1.05, 1).rotation.x = Math.PI / 2;
  add(rig.torso, new THREE.SphereGeometry(0.03, 10, 8), gem, 0, 0.47, 0.22);
  add(rig.hips, new THREE.TorusGeometry(0.22, 0.035, 8, 30), gold, 0, 0.05, 0, 1, 1, 0.82).rotation.x = Math.PI / 2;
  addCape(rig, 0.7, 1.3, cloth, -0.2);
  const head = buildHead(c, 1, { browTilt: 0.25, mustache: true });
  crown(head, gold, gem, 0.2);
  add(head, new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), c.hair, 0, -0.03, -0.03, 0.95, 1.2, 1);
  rig.headPivot.add(head);
  // Dark recurve bow in the left hand with a glowing violet string.
  const bow = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, -0.72), new THREE.Vector3(0, -0.02, -0.6), new THREE.Vector3(0, -0.12, -0.3),
    new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, -0.12, 0.3), new THREE.Vector3(0, -0.02, 0.6), new THREE.Vector3(0, 0.1, 0.72),
  ]);
  add(bow, new THREE.TubeGeometry(curve, 40, 0.022, 8), armor);
  add(bow, new THREE.TubeGeometry(curve, 40, 0.026, 8, false), mat(0x6a40ff, { emissive: 0x3010a0, transparent: true, opacity: 0.25 }));
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.1, -0.72), new THREE.Vector3(0, 0.1, 0.72)]);
  bow.add(new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xb090ff })));
  rig.handL.add(bow);
  rig.flashMats = [skin, armor];
  return rig;
}

// ---------------- KUMBHAKARNA — the giant who wakes for war ----------------
export function buildKumbhakarna() {
  const bronze = mat(0xb07a30, { metalness: 0.85, roughness: 0.35 });
  const skin = mat(0x5a3a2a, { roughness: 0.55 });
  const cloth = mat(0xffffff, { map: clothTex('#3a2a10', '#b07a30', false), roughness: 0.85, side: THREE.DoubleSide });
  const c = {
    bulk: 1.35, muscle: true, skin, gold: bronze,
    skirt: { mat: cloth, top: 0.24, bottom: 0.36, len: 0.45 },
    torso: skin, arm: skin, forearm: skin, shoulder: skin,
    thigh: skin, thighR: 1.2, shin: skin, shinR: 1.2, foot: skin, anklet: bronze, gauntlet: bronze,
    hair: mat(0x140c0a), brow: mat(0x140c0a), lip: mat(0x2a0a0a), eyeWhite: mat(0xe8dcc8), pupil: mat(0x6a1a00),
    bone: mat(0xeee4cc),
  };
  const rig = buildBody(c);
  // Great belly.
  add(rig.torso, new THREE.SphereGeometry(0.22, 20, 14), skin, 0, 0.15, 0.07, 1.25, 1.0, 1.0);
  add(rig.hips, new THREE.TorusGeometry(0.29, 0.04, 8, 30), bronze, 0, 0.06, 0, 1, 1, 0.85).rotation.x = Math.PI / 2;
  const head = buildHead(c, 1.1, { browTilt: 0.35, tusks: true, beard: true, mustache: true });
  crown(head, bronze, mat(0xff6a1a, { emissive: 0x6a2000 }), 0.12);
  rig.headPivot.add(head);
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI;
    add(rig.torso, new THREE.SphereGeometry(0.024, 8, 6), c.bone, Math.cos(a) * 0.16, 0.55 - Math.sin(a) * 0.08, 0.1 + Math.sin(a) * 0.07);
  }
  for (const s of [-1, 1]) add(rig.torso, new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze, s * 0.38, 0.55, 0, 1.1, 0.7, 1.1);
  rig.handR.add(gada(bronze, mat(0x3a3a40, { metalness: 0.8, roughness: 0.4 }), 1.3));
  rig.flashMats = [skin];
  return rig;
}

// Fighter data. Damage numbers are integers so JS and Rust resolve identically.
// strike/heavy: hit damage; parry: counter when Guard beats Strike; counter:
// counter when Evade beats Heavy/Astra; astra: astra damage; cost: astra prana.
export const ROSTER = [
  {
    id: 0, key: 'angada', name: 'ANGADA', army: 'Vanara Sena', title: 'The Unmoved Foot', build: buildAngada,
    handed: 'R', scale: 1.0, color: 0x2fd27a,
    hp: 110, strike: 11, heavy: 18, parry: 10, counter: 6, astra: 26, cost: 60,
    astraName: 'ACHALA PADA', blurb: 'Steady prince. Strong guard counters, extra health.',
  },
  {
    id: 1, key: 'neela', name: 'NEELA', army: 'Vanara Sena', title: 'Builder of the Bridge', build: buildNeela,
    handed: 'R', scale: 1.0, color: 0x5aa0ff,
    hp: 100, strike: 12, heavy: 17, parry: 7, counter: 9, astra: 26, cost: 50,
    astraName: 'SHILA VARSHA', blurb: 'Agile commander. Best evade counters, cheap astra.',
  },
  {
    id: 2, key: 'indrajit', name: 'INDRAJIT', army: 'Rakshasa Sena', title: 'Meghnad of the Clouds', build: buildIndrajit,
    handed: 'L', scale: 1.02, color: 0xa070ff,
    hp: 95, strike: 10, heavy: 16, parry: 7, counter: 7, astra: 32, cost: 50,
    astraName: 'NAGA PASHA', blurb: 'Sorcerer prince. The most powerful astra, low health.',
  },
  {
    id: 3, key: 'kumbhakarna', name: 'KUMBHAKARNA', army: 'Rakshasa Sena', title: 'The Waking Giant', build: buildKumbhakarna,
    handed: 'R', scale: 1.28, color: 0xff8a3a,
    hp: 130, strike: 10, heavy: 23, parry: 8, counter: 4, astra: 28, cost: 70,
    astraName: 'MAHA GADA', blurb: 'Giant. Crushing heavy blows and huge health, slow to dodge.',
  },
];
