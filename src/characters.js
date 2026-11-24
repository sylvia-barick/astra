import * as THREE from 'three';

// Procedurally modeled, rigged characters built to match the reference art:
// Rama — fair, long hair in a top-knot, saffron angavastram, red & cream dhoti,
//        golden bow and quiver, gold jewellery and gauntlets.
// Ravana — ten bearded, crowned heads in a row, purple-and-gold armour with
//        lion medallions, long layered skirt, gauntlets, armoured boots, cape.
// Rakshasas — horned, tusked asura soldiers (club warriors and fire casters).
// Each model is a hierarchy of pivots (hips → torso → arms/head, hips → legs)
// posed by the Animator.

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function add(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, x = 0, y = 0, z = 0, order = 'XYZ') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = order;
  parent.add(g);
  return g;
}

// Woven cloth with a gold border, for scarves, skirts and capes.
function clothTex(base, border, motif = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 6); }
  g.fillStyle = border;
  g.fillRect(0, 0, 16, 256); g.fillRect(240, 0, 16, 256); g.fillRect(0, 232, 256, 24);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(18, 0, 3, 256); g.fillRect(235, 0, 3, 256); g.fillRect(0, 228, 256, 3);
  if (motif) {
    g.fillStyle = border;
    for (let y = 20; y < 220; y += 40) for (let x = 50; x < 220; x += 52) {
      g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const EYE = new THREE.SphereGeometry(0.022, 10, 8);
const PUPIL = new THREE.SphereGeometry(0.011, 8, 6);

function buildHead(c, scale = 1, o = {}) {
  const head = new THREE.Group();
  head.scale.setScalar(scale);
  add(head, new THREE.SphereGeometry(0.12, 28, 20), c.skin, 0, 0, 0, 0.92, 1.1, 1.0);
  add(head, new THREE.SphereGeometry(0.09, 18, 12), c.skin, 0, -0.065, 0.025, 0.95, 0.78, 0.95);
  add(head, new THREE.ConeGeometry(0.017, 0.055, 8), c.skin, 0, -0.012, 0.118).rotation.x = Math.PI / 2.4;
  add(head, new THREE.BoxGeometry(0.05, 0.008, 0.01), c.lip, 0, -0.07, 0.105);
  for (const s of [-1, 1]) {
    add(head, EYE, c.eyeWhite, s * 0.04, 0.022, 0.095, 1.1, 0.65, 0.5);
    add(head, PUPIL, c.pupil, s * 0.04, 0.022, 0.105);
    add(head, new THREE.BoxGeometry(0.05, 0.012, 0.012), c.brow || c.hair, s * 0.042, 0.055, 0.103).rotation.z = s * (o.browTilt ?? -0.12);
    add(head, new THREE.SphereGeometry(0.03, 10, 8), c.skin, s * 0.112, 0, -0.005, 0.45, 1, 0.75);
    if (c.gold && !o.noEarrings) add(head, new THREE.SphereGeometry(0.016, 8, 6), c.gold, s * 0.116, -0.06, 0.005);
    if (o.mustache) add(head, new THREE.CapsuleGeometry(0.01, 0.05, 4, 6), c.hair, s * 0.032, -0.052, 0.108).rotation.z = s * 1.15;
    if (o.tusks) add(head, new THREE.ConeGeometry(0.012, 0.05, 6), c.bone, s * 0.03, -0.06, 0.1).rotation.z = -s * 0.25;
    if (o.horns) {
      const h = add(head, new THREE.ConeGeometry(0.03, 0.16, 8), c.horn, s * 0.07, 0.12, -0.01);
      h.rotation.z = -s * 0.6;
    }
  }
  if (o.beard) {
    add(head, new THREE.SphereGeometry(0.1, 18, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), c.hair, 0, -0.05, 0.015, 1.0, 1.5, 1.05);
    add(head, new THREE.ConeGeometry(0.055, 0.1, 10), c.hair, 0, -0.2, 0.04).rotation.x = Math.PI;
  }
  if (o.tilak) add(head, new THREE.BoxGeometry(0.008, 0.045, 0.005), o.tilak, 0, 0.072, 0.114);
  return head;
}

// Shared humanoid body with pivots. Options select clothing and build.
function buildBody(c) {
  const b = c.bulk;
  const root = new THREE.Group();
  const body = pivot(root);
  const hips = pivot(body, 0, 0.95, 0, 'YXZ');
  const torso = pivot(hips, 0, 0.08, 0, 'YXZ');
  const sk = c.skirt;

  add(hips, new THREE.CylinderGeometry(0.17 * b, 0.2 * b, 0.2, 18), sk.mat, 0, 0, 0);
  const skirt = add(hips, new THREE.CylinderGeometry(sk.top * b, sk.bottom * b, sk.len, 24, 1, true), sk.mat, 0, -0.02 - sk.len / 2, 0);
  skirt.castShadow = true;

  // Torso: abdomen + chest (+ sculpted muscles if bare-chested).
  add(torso, new THREE.CylinderGeometry(0.155 * b, 0.17 * b, 0.24, 18), c.torso, 0, 0.1, 0, 1, 1, 0.82);
  add(torso, new THREE.CapsuleGeometry(0.17, 0.16, 8, 18), c.torso, 0, 0.37, 0, 1.25 * b, 1, 0.82 * b);
  if (c.muscle) {
    for (const s of [-1, 1]) {
      add(torso, new THREE.SphereGeometry(0.1, 16, 12), c.torso, s * 0.08 * b, 0.44, 0.11 * b, 1.3, 0.62, 0.28).rotation.z = s * 0.15;
      for (let k = 0; k < 3; k++) add(torso, new THREE.SphereGeometry(0.03, 8, 6), c.torso, s * 0.035, 0.24 - k * 0.075, 0.12 * b, 1.1, 0.8, 0.3);
    }
  }
  add(torso, new THREE.CylinderGeometry(0.055 * b, 0.068 * b, 0.13, 12), c.skin, 0, 0.6, 0);

  const headPivot = pivot(torso, 0, 0.77, 0, 'YXZ');
  const rig = { root, body, hips, torso, headPivot, skirt };

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    add(torso, new THREE.SphereGeometry(0.09 * b, 16, 12), c.shoulder, s * 0.25 * b, 0.5, 0);
    const ua = pivot(torso, s * 0.27 * b, 0.5, 0, 'YXZ');
    add(ua, new THREE.CapsuleGeometry(0.068 * b, 0.2, 6, 12), c.arm, 0, -0.15, 0);
    if (c.gold) add(ua, new THREE.TorusGeometry(0.072 * b, 0.018, 6, 16), c.gold, 0, -0.07, 0).rotation.x = Math.PI / 2;
    const fa = pivot(ua, 0, -0.3, 0);
    add(fa, new THREE.CapsuleGeometry(0.058 * b, 0.18, 6, 12), c.forearm, 0, -0.13, 0);
    if (c.gauntlet) {
      add(fa, new THREE.CylinderGeometry(0.07 * b, 0.064 * b, 0.17, 14), c.gauntlet, 0, -0.16, 0);
      add(fa, new THREE.TorusGeometry(0.072 * b, 0.014, 6, 16), c.gauntletTrim || c.gauntlet, 0, -0.08, 0).rotation.x = Math.PI / 2;
    }
    const hand = pivot(fa, 0, -0.29, 0);
    add(hand, new THREE.SphereGeometry(0.054, 12, 10), c.skin, 0, 0, 0, 0.9, 1.15, 0.75);
    rig['ua' + side] = ua; rig['fa' + side] = fa; rig['hand' + side] = hand;

    const th = pivot(hips, s * 0.1 * b, -0.05, 0);
    add(th, new THREE.CapsuleGeometry(0.09 * b * (c.thighR || 1), 0.28, 6, 12), c.thigh, 0, -0.2, 0);
    const sh = pivot(th, 0, -0.43, 0);
    add(sh, new THREE.CapsuleGeometry(0.066 * b * (c.shinR || 1), 0.3, 6, 12), c.shin, 0, -0.2, 0);
    if (c.boot) add(sh, new THREE.CylinderGeometry(0.085 * b, 0.075 * b, 0.26, 12), c.boot, 0, -0.27, 0);
    if (c.anklet) add(sh, new THREE.TorusGeometry(0.06 * b, 0.014, 6, 14), c.anklet, 0, -0.37, 0).rotation.x = Math.PI / 2;
    add(sh, new THREE.BoxGeometry(0.1, 0.06, 0.23), c.foot, 0, -0.44, 0.05);
    if (c.strap) for (const zz of [0.0, 0.1]) add(sh, new THREE.BoxGeometry(0.105, 0.065, 0.015), c.strap, 0, -0.43, zz);
    rig['th' + side] = th; rig['sh' + side] = sh;
  }
  return rig;
}

function addCape(rig, w, h, material, z = -0.17) {
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 4, 10), material);
  cape.geometry.translate(0, -h / 2, 0);
  cape.position.set(0, 0.55, z);
  cape.rotation.x = 0.12;
  cape.castShadow = true;
  rig.torso.add(cape);
  rig.cape = cape;
}

// ---------------- RAMA ----------------
export function buildRama() {
  const gold = mat(0xe8b54a, { metalness: 0.9, roughness: 0.28 });
  const skin = mat(0xe0ab84, { roughness: 0.5 });
  const cream = mat(0xf2e7d2, { roughness: 0.8, side: THREE.DoubleSide });
  const redWrap = mat(0xffffff, { map: clothTex('#c9401a', '#e8b54a'), roughness: 0.7, side: THREE.DoubleSide });
  const saffron = mat(0xffffff, { map: clothTex('#f08a1c', '#f2c14e'), roughness: 0.7, side: THREE.DoubleSide });
  const hair = mat(0x2a1810, { roughness: 0.75 });
  const leather = mat(0x6b3a1c, { roughness: 0.7 });
  const c = {
    bulk: 1.05, muscle: true, skin, gold,
    skirt: { mat: redWrap, top: 0.2, bottom: 0.32, len: 0.42 },
    torso: skin, arm: skin, forearm: skin, shoulder: skin,
    thigh: cream, thighR: 1.25, shin: cream, shinR: 1.45, foot: skin, strap: leather, anklet: gold,
    gauntlet: gold, gauntletTrim: gold,
    hair, lip: mat(0x9a4a4a), eyeWhite: mat(0xf3eee6), pupil: mat(0x3a2414),
  };
  const rig = buildBody(c);
  const T = rig.torso;
  // Belt with jewelled medallion.
  add(rig.hips, new THREE.TorusGeometry(0.2 * 1.05, 0.032, 8, 30), gold, 0, 0.06, 0, 1, 1, 0.85).rotation.x = Math.PI / 2;
  add(rig.hips, new THREE.CylinderGeometry(0.055, 0.055, 0.02, 20), gold, 0, 0.06, 0.18).rotation.x = Math.PI / 2;
  add(rig.hips, new THREE.SphereGeometry(0.022, 10, 8), mat(0xc0102a, { emissive: 0x500008, roughness: 0.2 }), 0, 0.06, 0.195);
  // Angavastram over the left shoulder + quiver strap across the chest.
  add(T, new THREE.TorusGeometry(0.21, 0.045, 8, 30), saffron, 0, 0.34, 0, 1.15, 1.2, 0.75).rotation.set(0, 0, -0.7);
  add(T, new THREE.TorusGeometry(0.21, 0.014, 6, 30), leather, 0, 0.34, 0, 1.15, 1.2, 0.76).rotation.set(0, 0, 0.75);
  // Necklaces + pendant.
  add(T, new THREE.TorusGeometry(0.105, 0.016, 8, 24, Math.PI), gold, 0, 0.555, 0.035, 1.05, 1.2, 1).rotation.set(Math.PI * 0.62, 0, Math.PI);
  add(T, new THREE.TorusGeometry(0.14, 0.012, 6, 24, Math.PI), gold, 0, 0.5, 0.06, 1.1, 1.4, 1).rotation.set(Math.PI * 0.6, 0, Math.PI);
  add(T, new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), gold, 0, 0.42, 0.175).rotation.x = Math.PI / 2.2;
  add(T, new THREE.SphereGeometry(0.016, 8, 6), mat(0xc0102a, { emissive: 0x500008 }), 0, 0.42, 0.185);
  // Flowing saffron scarf behind.
  addCape(rig, 0.55, 1.0, saffron, -0.16);
  rig.cape.position.x = 0.08;

  const head = buildHead(c, 1, { browTilt: -0.05, tilak: mat(0xff2a1a, { emissive: 0x550000 }) });
  rig.headPivot.add(head);
  add(head, new THREE.BoxGeometry(0.007, 0.045, 0.005), mat(0xffffff, { emissive: 0x444444 }), -0.011, 0.072, 0.113);
  add(head, new THREE.BoxGeometry(0.007, 0.045, 0.005), mat(0xffffff, { emissive: 0x444444 }), 0.011, 0.072, 0.113);
  // Long wavy hair with a top-knot.
  add(head, new THREE.SphereGeometry(0.13, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.02, -0.02, 0.97, 1.1, 1.04).rotation.x = -0.35;
  add(head, new THREE.CapsuleGeometry(0.085, 0.26, 6, 12), hair, 0, -0.17, -0.08, 1.55, 1, 0.65);
  for (const s of [-1, 1]) add(head, new THREE.CapsuleGeometry(0.035, 0.2, 4, 8), hair, s * 0.11, -0.12, -0.02).rotation.z = s * 0.12;
  add(head, new THREE.SphereGeometry(0.06, 14, 10), hair, 0, 0.15, -0.05);
  add(head, new THREE.TorusGeometry(0.045, 0.012, 6, 16), gold, 0, 0.13, -0.05).rotation.x = Math.PI / 2;
  add(head, new THREE.SphereGeometry(0.012, 8, 6), mat(0xc0102a, { emissive: 0x500008 }), 0, 0.13, -0.002);

  // Kodanda — ornate golden recurve bow in the left hand (spans the hand's local Z).
  const bow = new THREE.Group();
  const bowGold = mat(0xc8902e, { metalness: 0.85, roughness: 0.3 });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.08, -0.76), new THREE.Vector3(0, 0.0, -0.68), new THREE.Vector3(0, -0.12, -0.42),
    new THREE.Vector3(0, -0.13, 0), new THREE.Vector3(0, -0.12, 0.42), new THREE.Vector3(0, 0.0, 0.68), new THREE.Vector3(0, 0.08, 0.76),
  ]);
  add(bow, new THREE.TubeGeometry(curve, 48, 0.024, 8), bowGold);
  add(bow, new THREE.CylinderGeometry(0.032, 0.032, 0.18, 10), mat(0x7a1a10), 0, -0.13, 0).rotation.x = Math.PI / 2;
  for (const z of [-0.76, 0.76]) add(bow, new THREE.TorusGeometry(0.04, 0.012, 6, 14, Math.PI * 1.4), bowGold, 0, 0.1, z).rotation.y = Math.PI / 2;
  for (const z of [-0.3, 0.3]) add(bow, new THREE.SphereGeometry(0.035, 10, 8), gold, 0, -0.13, z, 1, 1, 1.6);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.08, -0.76), new THREE.Vector3(0, 0.08, 0.76)]);
  bow.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xfff1c8 })));
  rig.handL.add(bow);

  // Golden quiver with white-feathered arrows.
  const quiver = new THREE.Group();
  quiver.position.set(0.12, 0.38, -0.2);
  quiver.rotation.z = -0.45;
  T.add(quiver);
  add(quiver, new THREE.CylinderGeometry(0.075, 0.06, 0.5, 14), gold, 0, 0, 0);
  add(quiver, new THREE.TorusGeometry(0.075, 0.015, 6, 16), mat(0x7a1a10), 0, 0.2, 0).rotation.x = Math.PI / 2;
  const feather = mat(0xfaf6ee, { roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const x = ((i % 3) - 1) * 0.03, z = (i < 3 ? -0.02 : 0.025);
    add(quiver, new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), bowGold, x, 0.36, z);
    add(quiver, new THREE.BoxGeometry(0.004, 0.1, 0.045), feather, x, 0.48, z);
  }

  rig.flashMats = [skin, cream];
  rig.bow = bow;
  return rig;
}

// ---------------- RAVANA ----------------
function crescentBlade() {
  const s = new THREE.Shape();
  s.moveTo(-0.03, 0);
  s.quadraticCurveTo(0.42, 0.45, 0.12, 1.05);
  s.quadraticCurveTo(0.2, 0.5, -0.06, 0.12);
  s.lineTo(-0.03, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 18 });
  g.translate(0, 0, -0.006);
  return g;
}
export const CRESCENT_GEO = crescentBlade();

function lionFace(parent, gold, gem, x, y, z, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.025, 20), gold, 0, 0, 0).rotation.x = Math.PI / 2;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    add(g, new THREE.ConeGeometry(0.02, 0.05, 5), gold, Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0).rotation.z = a - Math.PI / 2;
  }
  for (const sx of [-1, 1]) add(g, new THREE.SphereGeometry(0.012, 8, 6), gem, sx * 0.025, 0.015, 0.018);
  add(g, new THREE.ConeGeometry(0.015, 0.03, 6), gold, 0, -0.01, 0.02).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.006, 0.025, 4), mat(0xf5efe0), sx * 0.018, -0.04, 0.016).rotation.x = Math.PI;
  parent.add(g);
  return g;
}

export function buildRavana() {
  const gold = mat(0xd8a63c, { metalness: 0.9, roughness: 0.3 });
  const darkGold = mat(0x8a6420, { metalness: 0.85, roughness: 0.35 });
  const skin = mat(0x8a5636, { roughness: 0.5 });
  const purple = mat(0xffffff, { map: clothTex('#2a1440', '#c9962e'), roughness: 0.7, side: THREE.DoubleSide });
  const armorBlue = mat(0x2c2a66, { metalness: 0.6, roughness: 0.35 });
  const gem = mat(0xff2a3a, { emissive: 0x7a0010, roughness: 0.2 });
  const c = {
    bulk: 1.15, muscle: true, skin, gold,
    skirt: { mat: purple, top: 0.21, bottom: 0.42, len: 0.9 },
    torso: skin, arm: skin, forearm: skin, shoulder: gold,
    thigh: purple, thighR: 1.1, shin: darkGold, foot: darkGold, boot: gold,
    gauntlet: gold, gauntletTrim: darkGold,
    hair: mat(0x0a0706, { roughness: 0.8 }), brow: mat(0x0a0706),
    lip: mat(0x4a1a1a), eyeWhite: mat(0xf0e6d6), pupil: mat(0xff3a00, { emissive: 0xaa1100 }),
  };
  const rig = buildBody(c);
  const T = rig.torso;
  // Breastplate mantle + lion medallion.
  add(T, new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), armorBlue, 0, 0.42, 0, 1.45, 0.9, 1.05);
  add(T, new THREE.TorusGeometry(0.235, 0.02, 6, 32), gold, 0, 0.5, 0, 1.45, 1.05, 1).rotation.x = Math.PI / 2;
  lionFace(T, gold, gem, 0, 0.48, 0.2, 1.1);
  // Layered pauldrons.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const p = add(T, new THREE.SphereGeometry(0.15 - k * 0.025, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), k % 2 ? darkGold : gold, s * (0.3 + k * 0.035) * 1.15, 0.56 - k * 0.07, 0, 1.2, 0.7, 1.1);
      p.rotation.z = -s * (0.3 + k * 0.15);
    }
    for (let k = 0; k < 3; k++) add(T, new THREE.ConeGeometry(0.022, 0.12, 6), gold, s * (0.3 + k * 0.05) * 1.15, 0.66 - k * 0.03, -0.04 + k * 0.04).rotation.z = -s * (0.5 + k * 0.2);
  }
  // Belt with lion-face buckle, front panel.
  add(rig.hips, new THREE.TorusGeometry(0.22 * 1.15, 0.04, 8, 30), gold, 0, 0.05, 0, 1, 1, 0.82).rotation.x = Math.PI / 2;
  lionFace(rig.hips, gold, gem, 0, 0.04, 0.22, 1.0);
  add(rig.hips, new THREE.BoxGeometry(0.16, 0.75, 0.02), purple, 0, -0.42, 0.3).rotation.x = -0.15;
  add(rig.hips, new THREE.BoxGeometry(0.17, 0.04, 0.025), gold, 0, -0.78, 0.36);
  addCape(rig, 0.85, 1.45, purple, -0.2);

  // Ten heads in a row: the main head + nine (5 one side, 4 the other).
  const heads = [];
  const crown = (h, big) => {
    add(h, new THREE.CylinderGeometry(0.12, 0.125, 0.06, 18), gold, 0, 0.1, 0);
    add(h, new THREE.CylinderGeometry(0.04, 0.11, big ? 0.24 : 0.18, 14), gold, 0, big ? 0.24 : 0.21, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI - Math.PI / 2;
      add(h, new THREE.ConeGeometry(0.022, 0.12, 5), gold, Math.sin(a) * 0.1, 0.18, Math.cos(a) * 0.1).rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
    }
    add(h, new THREE.ConeGeometry(0.035, big ? 0.18 : 0.13, 8), gold, 0, big ? 0.44 : 0.36, 0);
    add(h, new THREE.SphereGeometry(0.02, 8, 6), gem, 0, 0.12, 0.122);
    if (big) for (const s of [-1, 1]) add(h, new THREE.ConeGeometry(0.03, 0.16, 6), gold, s * 0.14, 0.22, 0).rotation.z = -s * 0.7;
    add(h, new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), c.hair, 0, -0.03, -0.03, 0.95, 1.2, 1);
  };
  const tilak = mat(0xff2a1a, { emissive: 0x550000 });
  const main = buildHead(c, 1, { browTilt: 0.32, beard: true, mustache: true, tilak });
  crown(main, true);
  rig.headPivot.add(main);
  heads.push(main);
  for (const x of [0.22, 0.41, 0.6, 0.79, -0.22, -0.41, -0.6, -0.79, -0.98]) {
    const h = buildHead(c, 0.8, { browTilt: 0.32, beard: true, mustache: true, tilak, noEarrings: true });
    h.position.set(x, 0.03, -0.05 - Math.abs(x) * 0.05);
    h.rotation.y = x * 0.22;
    crown(h, false);
    rig.headPivot.add(h);
    heads.push(h);
  }

  // Chandrahasa — crescent-moon sword in the right hand.
  const sword = new THREE.Group();
  const bladeMat = mat(0xcfe0ff, { metalness: 1, roughness: 0.15, emissive: 0x2a3d80, emissiveIntensity: 0.9 });
  const blade = add(sword, CRESCENT_GEO, bladeMat, 0, 0, 0, 1.15, 1.15, 1.15);
  blade.rotation.set(Math.PI, Math.PI / 2, 0);
  blade.position.y = -0.1;
  add(sword, new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), gold, 0, 0.02, 0);
  add(sword, new THREE.BoxGeometry(0.2, 0.03, 0.05), gold, 0, -0.08, 0);
  add(sword, new THREE.SphereGeometry(0.035, 10, 8), gem, 0, 0.12, 0);
  sword.rotation.x = 0.25;
  rig.handR.add(sword);

  rig.flashMats = [skin, armorBlue];
  rig.heads = heads;
  rig.bladeMat = bladeMat;
  return rig;
}

// ---------------- RAKSHASA SOLDIERS ----------------
export function buildRakshasa(kind = 'warrior') {
  const caster = kind === 'caster';
  const skin = mat(caster ? 0x4c4a72 : 0x4f6138, { roughness: 0.55 });
  const cloth = mat(caster ? 0x3a0f3a : 0x6a1a12, { roughness: 0.8, side: THREE.DoubleSide });
  const bronze = mat(0x8a5a2a, { metalness: 0.7, roughness: 0.45 });
  const c = {
    bulk: caster ? 1.05 : 1.22, muscle: true, skin, gold: bronze,
    skirt: { mat: cloth, top: 0.2, bottom: 0.28, len: 0.36 },
    torso: skin, arm: skin, forearm: skin, shoulder: skin,
    thigh: skin, shin: skin, foot: skin, anklet: bronze,
    gauntlet: bronze,
    hair: mat(0x140c0a, { roughness: 0.9 }), brow: mat(0x140c0a),
    lip: mat(0x2a0a0a), eyeWhite: mat(0x200606), pupil: mat(0xff2000, { emissive: 0xff2000, emissiveIntensity: 2 }),
    bone: mat(0xeee4cc), horn: mat(0x2a2018, { roughness: 0.5 }),
  };
  const rig = buildBody(c);
  const head = buildHead(c, 1.05, { browTilt: 0.45, horns: true, tusks: true, noEarrings: true });
  rig.headPivot.add(head);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI - Math.PI / 2;
    add(head, new THREE.ConeGeometry(0.03, 0.14, 5), c.hair, Math.sin(a) * 0.08, 0.06, -0.06 + Math.cos(a) * -0.03).rotation.set(-0.9, 0, -Math.sin(a) * 0.6);
  }
  // Bone-bead necklace and bronze shoulder guard.
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI;
    add(rig.torso, new THREE.SphereGeometry(0.018, 8, 6), c.bone, Math.cos(a) * 0.12, 0.54 - Math.sin(a) * 0.06, 0.08 + Math.sin(a) * 0.05);
  }
  add(rig.torso, new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze, -0.3, 0.55, 0, 1.1, 0.7, 1.1);

  const weapon = new THREE.Group();
  let orb = null;
  if (caster) {
    add(weapon, new THREE.CylinderGeometry(0.018, 0.018, 1.5, 8), mat(0x3a2414), 0, -0.2, 0);
    orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1a).multiplyScalar(1.4) }));
    orb.position.y = 0.58;
    weapon.add(orb);
    for (let k = 0; k < 4; k++) add(weapon, new THREE.ConeGeometry(0.015, 0.12, 4), bronze, Math.cos(k * 1.57) * 0.08, 0.5, Math.sin(k * 1.57) * 0.08).rotation.set(Math.sin(k * 1.57) * 0.5, 0, -Math.cos(k * 1.57) * 0.5);
    weapon.rotation.x = 0.35;
  } else {
    // Gada (mace) with an iron spiked head.
    const iron = mat(0x3a3a40, { metalness: 0.8, roughness: 0.4 });
    add(weapon, new THREE.CylinderGeometry(0.025, 0.03, 0.6, 8), mat(0x3a2414), 0, -0.25, 0);
    add(weapon, new THREE.SphereGeometry(0.13, 14, 10), iron, 0, -0.6, 0);
    for (let k = 0; k < 8; k++) {
      const v = new THREE.Vector3().randomDirection();
      const sp = add(weapon, new THREE.ConeGeometry(0.025, 0.09, 5), iron, v.x * 0.13, -0.6 + v.y * 0.13, v.z * 0.13);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    }
    weapon.rotation.x = 0.3;
  }
  rig.handR.add(weapon);
  rig.flashMats = [skin];
  rig.orb = orb;
  return rig;
}

// ---------------- Fighter definitions ----------------
export const FIGHTERS = {
  rama: {
    id: 'rama', name: 'RAMA', title: 'Maryada Purushottama', build: buildRama,
    maxHp: 105, speed: 5.2, scale: 1.0, handed: 'L', specialCost: 20,
    hitColor: 0xffd27a,
    moves: {
      light1: { type: 'melee', pose: 'swingR', dur: 0.42, hit: [0.14, 0.24], dmg: 7, range: 2.1, knock: 1.5, lunge: 2.5, cancel: 0.27, next: 'light2' },
      light2: { type: 'melee', pose: 'swingL', dur: 0.44, hit: [0.14, 0.24], dmg: 8, range: 2.1, knock: 1.8, lunge: 2.5, cancel: 0.28, next: 'light3' },
      light3: { type: 'melee', pose: 'kick', dur: 0.6, hit: [0.22, 0.32], dmg: 11, range: 2.2, knock: 6, lunge: 3, stun: 0.5 },
      heavy: { type: 'melee', pose: 'overhead', dur: 0.85, hit: [0.42, 0.54], dmg: 16, range: 2.3, knock: 6, lunge: 3.5, heavy: true, shock: true },
      special: { type: 'projectile', pose: 'draw', dur: 0.75, fireAt: 0.38, proj: 'arrow', dmg: 11, maxDmg: 24, speed: 32, chargeable: true, maxCharge: 1.0 },
      ultimate: { type: 'beam', pose: 'draw', dur: 1.75, fireAt: 0.9, dmg: 34, name: 'BRAHMASTRA' },
    },
  },
  ravana: {
    id: 'ravana', name: 'RAVANA', title: 'Dashanana', build: buildRavana,
    maxHp: 100, speed: 4.5, scale: 1.12, handed: 'R', specialCost: 25, passive: 'dashanana',
    hitColor: 0xff6a3a,
    moves: {
      light1: { type: 'melee', pose: 'swingR', dur: 0.48, hit: [0.16, 0.27], dmg: 7, range: 2.0, knock: 1.8, lunge: 2.2, cancel: 0.31, next: 'light2' },
      light2: { type: 'melee', pose: 'swingL', dur: 0.5, hit: [0.16, 0.27], dmg: 8, range: 2.0, knock: 2, lunge: 2.2, cancel: 0.32, next: 'light3' },
      light3: { type: 'melee', pose: 'thrust', dur: 0.7, hit: [0.26, 0.38], dmg: 11, range: 2.25, knock: 6, lunge: 4, stun: 0.5 },
      heavy: { type: 'melee', pose: 'overhead', dur: 1.0, hit: [0.5, 0.62], dmg: 18, range: 2.3, knock: 7, lunge: 3, heavy: true, shock: true },
      special: { type: 'projectile', pose: 'cast', dur: 0.8, fireAt: 0.4, proj: 'fireball', dmg: 14, speed: 17 },
      ultimate: { type: 'storm', pose: 'storm', dur: 2.4, tick: 0.22, dmg: 2.4, radius: 3.4, name: 'CHANDRAHASA STORM' },
    },
  },
};

// Shared builders for other character files (e.g. the Dharma Yuddha roster).
export { mat, add, pivot, clothTex, buildHead, buildBody, addCape };
