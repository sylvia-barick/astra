import * as THREE from 'three';
import { rand, std, canvasTex, speckle, gradientSky, glowSprite, moonLightRig, mesh, rectBounds } from './common.js';

// Ram Setu — the bridge of floating stones, each inscribed with Rama's name,
// built by the Vanara Sena across the stormy ocean to Lanka.
// Twist: the bridge has no railings. Heavy knockback throws a fighter into
// the sea (damage + reset to the middle of the bridge).

const HX = 4.0, HZ = 15;

function ramStone() {
  const font = 'bold 120px "Tiro Devanagari Sanskrit", "Kohinoor Devanagari", "Devanagari Sangam MN", serif';
  const map = canvasTex(256, (g, S) => {
    g.fillStyle = '#6f6a60'; g.fillRect(0, 0, S, S);
    speckle(g, S, 9000, ['rgba(30,28,24,.35)', 'rgba(200,195,180,.18)', 'rgba(70,90,80,.25)'], 3);
    g.strokeStyle = 'rgba(20,18,14,.8)'; g.lineWidth = 10; g.strokeRect(0, 0, S, S);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(60,35,10,.9)'; g.fillText('राम', S / 2, S / 2 + 8);
  });
  const glow = canvasTex(256, (g, S) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff9a30'; g.shadowBlur = 18;
    g.fillStyle = '#ffb040'; g.fillText('राम', S / 2, S / 2 + 8);
  });
  return std(0xffffff, { map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.9 });
}

export function buildRamSetu(scene, world, fx) {
  const updaters = [];

  // ---------- Storm sky & light ----------
  scene.add(gradientSky(0x04060b, 0x121a26, 0x2c3646, 0x0a1018));
  const moonDir = new THREE.Vector3(0.35, 0.55, -0.75).normalize();
  const { hemi } = moonLightRig(scene, moonDir, 0xa4b6d6, 1.2, 0x5a6c90, 0x0c141c, 1.3);
  world.fog = new THREE.FogExp2(0x1a2331, 0.018);
  // Storm clouds: big dark puffs high up.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 1, transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), r = rand(60, 220);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(15, 35), 1), cloudMat);
    c.position.set(Math.cos(a) * r, rand(55, 90), Math.sin(a) * r);
    c.scale.y = 0.35;
    scene.add(c);
  }
  const moonGlow = glowSprite('rgba(220,230,255,.5)', 'rgba(120,140,200,.12)', 140);
  moonGlow.position.copy(moonDir).multiplyScalar(380);
  scene.add(moonGlow);

  // ---------- Ocean (animated waves) ----------
  const oceanGeo = new THREE.PlaneGeometry(300, 300, 120, 120);
  oceanGeo.rotateX(-Math.PI / 2);
  const base = Float32Array.from(oceanGeo.attributes.position.array);
  const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({ color: 0x0b2433, roughness: 0.22, metalness: 0.35 }));
  ocean.position.y = -1.6;
  ocean.receiveShadow = true;
  scene.add(ocean);
  let frameN = 0;
  updaters.push((dt, t) => {
    const p = oceanGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], z = base[i + 2];
      p[i + 1] = 0.38 * Math.sin(0.11 * x + 1.1 * t) + 0.26 * Math.sin(0.16 * z - 1.4 * t + 0.05 * x) + 0.12 * Math.sin(0.45 * (x + z) + 2.3 * t);
    }
    oceanGeo.attributes.position.needsUpdate = true;
    if ((frameN++ & 1) === 0) oceanGeo.computeVertexNormals();
  });
  const waveY = (x, z, t) => -1.6 + 0.38 * Math.sin(0.11 * x + 1.1 * t) + 0.26 * Math.sin(0.16 * z - 1.4 * t + 0.05 * x);

  // ---------- The bridge: stones inscribed "राम" ----------
  const stoneMat = ramStone();
  const blockGeo = new THREE.BoxGeometry(1.03, 2.4, 1.03);
  const cols = 8, step = 1.05;
  const spots = [];
  for (let z = -100; z <= 55; z += step) {
    for (let c = 0; c < cols; c++) {
      if (Math.abs(z) > 20 && Math.random() < 0.08) continue; // weathered gaps far from the fight
      spots.push([-HX - 0.2 + step / 2 + c * step, z]);
    }
  }
  const blocks = new THREE.InstancedMesh(blockGeo, stoneMat, spots.length);
  const d = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach(([x, z], i) => {
    d.position.set(x, -1.2 - rand(0, 0.04), z);
    d.rotation.set(0, rand(-0.03, 0.03), 0);
    d.updateMatrix();
    blocks.setMatrixAt(i, d.matrix);
    blocks.setColorAt(i, col.setHSL(rand(0.08, 0.14), rand(0.05, 0.15), rand(0.55, 0.85)));
  });
  blocks.castShadow = blocks.receiveShadow = true;
  scene.add(blocks);

  // Floating stones drifting on the waves.
  const floaters = [];
  const fGeo = new THREE.DodecahedronGeometry(0.6, 0);
  for (let i = 0; i < 28; i++) {
    let x = rand(-40, 40);
    if (Math.abs(x) < 7) x += Math.sign(x || 1) * 7;
    const m = mesh(scene, fGeo, stoneMat, x, -1.4, rand(-50, 40));
    m.scale.set(rand(0.8, 1.5), 0.6, rand(0.8, 1.5));
    floaters.push({ m, s: rand(0, 10) });
  }
  updaters.push((dt, t) => {
    for (const f of floaters) {
      f.m.position.y = waveY(f.m.position.x, f.m.position.z, t) + 0.15;
      f.m.rotation.x = Math.sin(t * 0.8 + f.s) * 0.15;
      f.m.rotation.z = Math.cos(t * 0.7 + f.s) * 0.15;
    }
  });

  // ---------- Torch posts on the edges ----------
  const postMat = std(0x4a3b2a);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a3a).multiplyScalar(2) });
  const flames = [];
  for (const z of [-14, -6, 6, 14]) {
    for (const s of [-1, 1]) {
      const x = s * (HX + 0.55);
      mesh(scene, new THREE.CylinderGeometry(0.1, 0.14, 3.6, 8), postMat, x, -0.4, z);
      mesh(scene, new THREE.CylinderGeometry(0.28, 0.12, 0.25, 10), std(0x8a6a30, { metalness: 0.6 }), x, 1.45, z);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8), flameMat);
      fl.position.set(x, 1.85, z);
      scene.add(fl);
      flames.push({ fl, s: rand(0, 10) });
    }
  }
  const torchLights = [-8, 8].map((z) => {
    const l = new THREE.PointLight(0xff8a3a, 26, 18, 1.6);
    l.position.set(0, 2.6, z);
    scene.add(l);
    return l;
  });
  updaters.push((dt, t) => {
    for (const f of flames) { const k = 1 + Math.sin(t * 14 + f.s) * 0.15; f.fl.scale.set(1, k, 1); }
    torchLights.forEach((l, i) => (l.intensity = 26 * (0.85 + Math.sin(t * 11 + i) * 0.1)));
  });

  // ---------- Lanka on the horizon ----------
  const lanka = new THREE.Group();
  lanka.position.set(0, -1.6, -190);
  const rockMat = std(0x0c0d12, { flatShading: true });
  mesh(lanka, new THREE.ConeGeometry(70, 45, 7), rockMat, 0, 22, 0);
  mesh(lanka, new THREE.ConeGeometry(45, 32, 6), rockMat, -55, 15, 10);
  mesh(lanka, new THREE.ConeGeometry(40, 28, 6), rockMat, 60, 13, 5);
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb040).multiplyScalar(2.5) });
  for (let i = 0; i < 90; i++) {
    const a = rand(-1.2, 1.2), h = rand(4, 34);
    const r = 70 * (1 - h / 45) * rand(0.6, 0.98);
    const w = mesh(lanka, new THREE.BoxGeometry(rand(0.6, 2), rand(1, 4), 0.5), winMat, Math.sin(a) * r, h, Math.cos(a) * r);
    w.castShadow = false;
  }
  const lankaGlow = glowSprite('rgba(255,150,60,.55)', 'rgba(255,90,30,.15)', 220);
  lankaGlow.position.set(0, 30, 10);
  lanka.add(lankaGlow);
  scene.add(lanka);

  // Vanara Sena camp torches on the shore behind.
  for (let i = 0; i < 26; i++) {
    const g = glowSprite('rgba(255,190,90,.9)', 'rgba(255,120,40,.25)', rand(2, 4));
    g.position.set(rand(-60, 60), rand(-0.5, 2), rand(75, 95));
    scene.add(g);
  }
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(300, 60), std(0x2a2418, { roughness: 1 }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(0, -1.0, 100);
  scene.add(shore);

  // ---------- Rain ----------
  const RN = 1800;
  const rainPos = new Float32Array(RN * 6);
  const drops = [];
  for (let i = 0; i < RN; i++) drops.push({ x: rand(-30, 30), y: rand(-2, 28), z: rand(-30, 30), v: rand(24, 32) });
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xa8bcd4, transparent: true, opacity: 0.35 }));
  rain.frustumCulled = false;
  scene.add(rain);
  updaters.push((dt) => {
    for (let i = 0; i < RN; i++) {
      const p = drops[i];
      p.y -= p.v * dt; p.x += 4 * dt;
      if (p.y < -1.6) { p.y = 28; p.x = rand(-30, 30); p.z = rand(-30, 30); }
      const k = i * 6;
      rainPos[k] = p.x; rainPos[k + 1] = p.y; rainPos[k + 2] = p.z;
      rainPos[k + 3] = p.x - 0.12; rainPos[k + 4] = p.y + 0.8; rainPos[k + 5] = p.z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  });

  // ---------- Lightning ----------
  const boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(3, 3, 4) });
  let bolt = null, nextBolt = rand(3, 6), flashT = 0;
  const flash = glowSprite('rgba(220,230,255,.9)', 'rgba(150,170,255,.25)', 160);
  flash.visible = false;
  scene.add(flash);
  updaters.push((dt) => {
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = rand(4, 9);
      const a = rand(0, Math.PI * 2), r = rand(70, 140);
      const pts = [];
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      for (let y = 85; y > -2; y -= rand(5, 10)) { pts.push(new THREE.Vector3(x, y, z)); x += rand(-5, 5); z += rand(-5, 5); }
      if (bolt) { scene.remove(bolt); bolt.geometry.dispose(); }
      bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat);
      scene.add(bolt);
      flash.position.set(Math.cos(a) * r, 60, Math.sin(a) * r);
      flash.visible = true;
      flashT = 0.35;
      setTimeout(() => fx.audio.thunder?.(), 350 + r * 4);
    }
    if (flashT > 0) {
      flashT -= dt;
      const f = Math.max(0, flashT / 0.35);
      const flick = f * (0.6 + Math.random() * 0.4);
      hemi.intensity = 1.3 + flick * 6;
      if (bolt) bolt.visible = flashT > 0.12 || Math.random() < 0.5;
      if (flashT <= 0) { hemi.intensity = 1.3; flash.visible = false; if (bolt) bolt.visible = false; }
    }
  });

  // Sea spray against the bridge.
  updaters.push((dt, t) => {
    for (let i = 0; i < 2; i++) {
      const s = Math.random() < 0.5 ? -1 : 1, z = rand(-25, 25);
      fx.vfx.spawn(s * (HX + 0.3), -1.0, z, s * rand(0.5, 2), rand(2, 5), rand(-0.5, 0.5), 0.8, 0.3, 0x9fc4dd, -9, 0.5);
    }
  });

  return {
    bounds: rectBounds(HX, HZ),
    ringOut: true,
    waterY: -1.6,
    floorY: -1.7,
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}

