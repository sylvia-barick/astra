import * as THREE from 'three';
import { rand, std, canvasTex, speckle, stoneTexture, dotTex, circleBounds } from './common.js';

// Ashoka Vatika — Ravana's moonlit garden in Lanka, where Sita was held.
// Everything is procedural (no downloaded assets): carved mandala floor,
// Ashoka trees with red-orange blossoms, lamp pillars with diyas, a Nagara-style
// shrine, a lotus pond, distant hills, stars, fireflies and falling petals.


function mandalaTexture() {
  return canvasTex(2048, (g, S) => {
    g.fillStyle = '#7a6148';
    g.fillRect(0, 0, S, S);
    speckle(g, S, 90000, ['rgba(40,25,10,.18)', 'rgba(255,235,200,.10)', 'rgba(90,60,30,.2)'], 3);
    g.translate(S / 2, S / 2);
    const R = S / 2;
    // Stone slabs: concentric rings cut into radial tiles.
    const rings = [0.16, 0.3, 0.44, 0.6, 0.76, 0.9, 0.995];
    g.strokeStyle = 'rgba(25,15,6,.75)';
    g.lineWidth = 5;
    rings.forEach((r, i) => {
      g.beginPath(); g.arc(0, 0, r * R, 0, Math.PI * 2); g.stroke();
      if (i === 0) return;
      const n = 8 * (i + 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i * 0.2;
        g.beginPath();
        g.moveTo(Math.cos(a) * rings[i - 1] * R, Math.sin(a) * rings[i - 1] * R);
        g.lineTo(Math.cos(a) * r * R, Math.sin(a) * r * R);
        g.stroke();
      }
    });
    // Gold inlaid lotus petals.
    const petals = (count, r0, r1, w, fill, stroke) => {
      for (let k = 0; k < count; k++) {
        g.save();
        g.rotate((k / count) * Math.PI * 2);
        g.beginPath();
        g.moveTo(0, r0 * R);
        g.quadraticCurveTo(w * R, ((r0 + r1) / 2) * R, 0, r1 * R);
        g.quadraticCurveTo(-w * R, ((r0 + r1) / 2) * R, 0, r0 * R);
        g.fillStyle = fill; g.fill();
        g.lineWidth = 4; g.strokeStyle = stroke; g.stroke();
        g.restore();
      }
    };
    petals(16, 0.02, 0.16, 0.05, 'rgba(214,168,86,.55)', 'rgba(60,35,10,.8)');
    petals(24, 0.17, 0.29, 0.035, 'rgba(160,60,40,.35)', 'rgba(214,168,86,.7)');
    petals(48, 0.61, 0.75, 0.022, 'rgba(214,168,86,.35)', 'rgba(50,30,10,.7)');
    // Chakra spokes in the centre.
    g.strokeStyle = 'rgba(240,200,110,.8)'; g.lineWidth = 3;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 0.06 * R, Math.sin(a) * 0.06 * R); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, 0.06 * R, 0, Math.PI * 2); g.stroke();
    // Dotted border band.
    g.fillStyle = 'rgba(230,190,110,.7)';
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2;
      g.beginPath(); g.arc(Math.cos(a) * 0.83 * R, Math.sin(a) * 0.83 * R, 6, 0, Math.PI * 2); g.fill();
    }
  });
}

const grassTexture = () => canvasTex(512, (g, S) => {
  g.fillStyle = '#1d2c14'; g.fillRect(0, 0, S, S);
  speckle(g, S, 30000, ['#2a3d1b', '#16220e', '#33461f', '#26331a', '#3a3020'], 3);
}, 24);

export function buildAshoka(scene, world) {
  const dot = dotTex();
  const updaters = [];
  const fightRadius = 11;

  // ---------- Sky, moon, stars ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x02040e) }, mid: { value: new THREE.Color(0x0d1636) }, horizon: { value: new THREE.Color(0x2a2346) } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top, mid, horizon; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(horizon, mid, smoothstep(-0.05, 0.25, h)); c = mix(c, top, smoothstep(0.25, 0.9, h)); gl_FragColor = vec4(c,1.); }`,
    }),
  );
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 2500; i++) {
    const th = Math.random() * Math.PI * 2, y = rand(0.05, 1);
    const r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(th) * r * 420, y * 420, Math.sin(th) * r * 420);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false })));

  const moonDir = new THREE.Vector3(-0.45, 0.5, -0.75).normalize();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }));
  moon.position.copy(moonDir).multiplyScalar(380);
  scene.add(moon);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(256, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,240,210,.6)'); gr.addColorStop(0.3, 'rgba(160,170,255,.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  glow.scale.set(160, 160, 1);
  glow.position.copy(moon.position);
  scene.add(glow);

  // ---------- Lights ----------
  scene.add(new THREE.HemisphereLight(0x6a80c8, 0x3a2614, 1.5));
  const moonLight = new THREE.DirectionalLight(0xb4c6ff, 1.6);
  moonLight.position.copy(moonDir).multiplyScalar(40);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.near = 1; sc.far = 100;
  moonLight.shadow.bias = -0.0005;
  moonLight.shadow.normalBias = 0.03;
  scene.add(moonLight);
  world.fog = new THREE.FogExp2(0x101833, 0.014);

  // ---------- Ground & mandala platform ----------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), std(0xffffff, { map: grassTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.36;
  ground.receiveShadow = true;
  scene.add(ground);

  const mandala = mandalaTexture();
  const stoneTex = stoneTexture();
  const sideMat = std(0x8a6a48, { map: stoneTex });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(12, 12.3, 0.36, 96), [
    sideMat,
    std(0xffffff, { map: mandala, bumpMap: mandala, bumpScale: 1.5, roughness: 0.75 }),
    sideMat,
  ]);
  platform.position.y = -0.18;
  platform.receiveShadow = true;
  scene.add(platform);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.3, 0.18, 96), sideMat);
  step.position.y = -0.27;
  step.receiveShadow = true;
  scene.add(step);
  // Gold rim.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(12.02, 0.05, 6, 128), std(0xd4a548, { metalness: 0.9, roughness: 0.3 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.01;
  scene.add(rim);

  // ---------- Lamp pillars (deepa stambha) ----------
  const pillarMat = std(0xa88457, { map: stoneTex });
  const goldMat = std(0xd9a640, { metalness: 0.85, roughness: 0.35 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const flameCore = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const flames = [];
  const pillarCount = 8;
  for (let i = 0; i < pillarCount; i++) {
    const a = (i / pillarCount) * Math.PI * 2 + Math.PI / pillarCount;
    const p = new THREE.Group();
    p.position.set(Math.cos(a) * 14, -0.36, Math.sin(a) * 14);
    const add = (geo, m, y, s = 1) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y; mesh.scale.setScalar(s);
      mesh.castShadow = mesh.receiveShadow = true;
      p.add(mesh); return mesh;
    };
    add(new THREE.BoxGeometry(1.1, 0.4, 1.1), pillarMat, 0.2);
    add(new THREE.BoxGeometry(0.85, 0.3, 0.85), pillarMat, 0.55);
    add(new THREE.CylinderGeometry(0.28, 0.34, 3.6, 12), pillarMat, 2.5);
    for (const y of [1.0, 1.9, 2.8, 3.7]) add(new THREE.TorusGeometry(0.32, 0.06, 6, 16), pillarMat, y).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.5, 0.3, 0.35, 12), pillarMat, 4.45);
    add(new THREE.BoxGeometry(0.95, 0.12, 0.95), pillarMat, 4.68);
    add(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), goldMat, 4.95).rotation.x = Math.PI;
    const fl = add(new THREE.ConeGeometry(0.09, 0.32, 8), flameMat, 5.1);
    const core = add(new THREE.ConeGeometry(0.045, 0.18, 8), flameCore, 5.06);
    let light = null;
    if (i % 2 === 0) {
      light = new THREE.PointLight(0xff8c3a, 22, 16, 1.6);
      light.position.y = 5.3;
      p.add(light);
    }
    flames.push({ fl, core, light, seed: Math.random() * 10 });
    scene.add(p);
  }
  updaters.push((dt, t) => {
    for (const f of flames) {
      const k = 1 + Math.sin(t * 13 + f.seed) * 0.12 + Math.sin(t * 29 + f.seed * 2) * 0.08;
      f.fl.scale.set(1, k, 1);
      f.core.scale.set(1, k, 1);
      if (f.light) f.light.intensity = 22 * (0.85 + (k - 1) * 1.2);
    }
  });

  // ---------- Ashoka trees ----------
  const barkMat = std(0x3b2a1e, { roughness: 1 });
  const canopyMat = std(0x2b5226, { flatShading: true, roughness: 0.9 });
  const leafPts = [];
  const flowerPts = [];
  const treeSpots = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand(-0.12, 0.12);
    const r = rand(19, 25);
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI / 2) < 0.35) continue; // keep the shrine view open
    treeSpots.push([Math.cos(a) * r, Math.sin(a) * r, rand(0.9, 1.3)]);
  }
  for (let i = 0; i < 10; i++) {
    const a = rand(0, Math.PI * 2);
    treeSpots.push([Math.cos(a) * rand(30, 42), Math.sin(a) * rand(30, 42), rand(1.1, 1.6)]);
  }
  for (const [x, z, s] of treeSpots) {
    const tree = new THREE.Group();
    tree.position.set(x, -0.36, z);
    tree.scale.setScalar(s);
    tree.rotation.y = rand(0, 6.28);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 3.4, 9), barkMat);
    trunk.position.y = 1.7;
    trunk.rotation.z = rand(-0.06, 0.06);
    trunk.castShadow = true;
    tree.add(trunk);
    for (let b = 0; b < 4; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 1.8, 6), barkMat);
      const ba = (b / 4) * Math.PI * 2 + rand(-0.3, 0.3);
      br.position.set(Math.cos(ba) * 0.5, 3.4, Math.sin(ba) * 0.5);
      br.rotation.set(Math.sin(ba) * 0.7, 0, -Math.cos(ba) * 0.7);
      br.castShadow = true;
      tree.add(br);
    }
    const blobs = [];
    for (let b = 0; b < 7; b++) {
      const ba = rand(0, Math.PI * 2), br = b === 0 ? 0 : rand(0.7, 1.5);
      const c = new THREE.Vector3(Math.cos(ba) * br, rand(3.9, 5.0) + (b === 0 ? 0.6 : 0), Math.sin(ba) * br);
      const rr = rand(0.9, 1.35);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), canopyMat);
      blob.position.copy(c);
      blob.scale.y = 0.75;
      blob.castShadow = true;
      tree.add(blob);
      blobs.push([c, rr]);
    }
    scene.add(tree);
    tree.updateMatrixWorld(true);
    for (const [c, rr] of blobs) {
      for (let k = 0; k < 34; k++) {
        const th = rand(0, Math.PI * 2), ph = rand(0.35, 1.5);
        const v = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * rr, -Math.cos(ph) * rr * 0.75 + 0.1, Math.sin(ph) * Math.sin(th) * rr).add(c);
        leafPts.push([v.applyMatrix4(tree.matrixWorld), s]);
      }
      for (let k = 0; k < 7; k++) {
        const th = rand(0, Math.PI * 2), ph = rand(0.2, 1.3);
        const v = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * rr * 1.02, Math.cos(ph) * rr * 0.4, Math.sin(ph) * Math.sin(th) * rr * 1.02).add(c);
        flowerPts.push(v.applyMatrix4(tree.matrixWorld));
      }
    }
  }
  // Drooping leaves (instanced).
  const leafGeo = new THREE.ConeGeometry(0.07, 0.75, 4);
  leafGeo.translate(0, -0.37, 0);
  const leaves = new THREE.InstancedMesh(leafGeo, std(0xffffff, { roughness: 0.8, flatShading: true }), leafPts.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  leafPts.forEach(([p, s], i) => {
    dummy.position.copy(p);
    dummy.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
    dummy.scale.setScalar(s * rand(0.8, 1.3));
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, col.setHSL(rand(0.24, 0.32), rand(0.4, 0.6), rand(0.16, 0.28)));
  });
  leaves.castShadow = true;
  scene.add(leaves);
  // Ashoka blossoms (red-orange clusters).
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), std(0xffffff, { emissive: 0x551000, roughness: 0.6 }), flowerPts.length);
  flowerPts.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.rotation.set(rand(0, 6), rand(0, 6), 0);
    dummy.scale.setScalar(rand(0.7, 1.4));
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, col.setHSL(rand(0.0, 0.07), 0.9, rand(0.45, 0.55)));
  });
  scene.add(flowers);

  // ---------- Grass tufts ----------
  const grassGeo = new THREE.ConeGeometry(0.05, 0.5, 3);
  grassGeo.translate(0, 0.25, 0);
  const GN = 4000;
  const grass = new THREE.InstancedMesh(grassGeo, std(0xffffff, { roughness: 1 }), GN);
  for (let i = 0; i < GN; i++) {
    const a = rand(0, Math.PI * 2), r = 13.6 + Math.pow(Math.random(), 1.4) * 30;
    dummy.position.set(Math.cos(a) * r, -0.36, Math.sin(a) * r);
    dummy.rotation.set(rand(-0.3, 0.3), rand(0, 6), rand(-0.3, 0.3));
    dummy.scale.set(1, rand(0.6, 1.6), 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, col.setHSL(rand(0.2, 0.3), 0.5, rand(0.1, 0.2)));
  }
  grass.receiveShadow = true;
  scene.add(grass);

  // ---------- Shrine (Nagara-style mandapa + shikhara) ----------
  const shrine = new THREE.Group();
  shrine.position.set(0, -0.36, -30);
  const sm = std(0xb08a5c, { map: stoneTex });
  const sAdd = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    shrine.add(mesh); return mesh;
  };
  for (let i = 0; i < 4; i++) sAdd(new THREE.BoxGeometry(12 - i * 1.2, 0.4, 9 - i * 0.8), sm, 0, 0.2 + i * 0.4, 0);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    sAdd(new THREE.CylinderGeometry(0.3, 0.36, 4, 12), sm, x, 3.6, 2.6);
    sAdd(new THREE.BoxGeometry(0.8, 0.25, 0.8), sm, x, 5.7, 2.6);
  }
  sAdd(new THREE.BoxGeometry(9, 0.6, 3.6), sm, 0, 6.1, 1.6);
  sAdd(new THREE.BoxGeometry(7, 5, 5), sm, 0, 4.1, -1.3);
  // Curved shikhara built from stacked tapering tiers.
  for (let i = 0; i < 12; i++) {
    const f = 1 - i / 12;
    const w = 6.2 * Math.pow(f, 0.7) + 0.6;
    sAdd(new THREE.BoxGeometry(w, 0.85, w * 0.85), sm, 0, 7 + i * 0.82, -1.3);
  }
  const amalaka = sAdd(new THREE.TorusGeometry(0.75, 0.35, 10, 20), sm, 0, 16.9, -1.3);
  amalaka.rotation.x = Math.PI / 2;
  sAdd(new THREE.SphereGeometry(0.4, 16, 10), goldMat, 0, 17.6, -1.3);
  sAdd(new THREE.ConeGeometry(0.15, 0.8, 10), goldMat, 0, 18.3, -1.3);
  sAdd(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), std(0x664422), 0.0, 19.4, -1.3);
  const flag = sAdd(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, emissive: 0x401000 }), 0.72, 20.2, -1.3);
  updaters.push((dt, t) => { flag.rotation.y = Math.sin(t * 2) * 0.3; flag.scale.y = 1 + Math.sin(t * 5) * 0.05; });
  // Glowing sanctum doorway.
  const door = sAdd(new THREE.PlaneGeometry(1.8, 3), new THREE.MeshBasicMaterial({ color: 0xffa040 }), 0, 3.1, 1.21);
  door.material.color.multiplyScalar(1.6);
  const sanctum = new THREE.PointLight(0xff9a40, 30, 14, 1.8);
  sanctum.position.set(0, 3, 3);
  shrine.add(sanctum);
  scene.add(shrine);

  // ---------- Lotus pond ----------
  const pond = new THREE.Group();
  pond.position.set(-22, -0.34, 12);
  const water = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: 0x0a1a30, roughness: 0.08, metalness: 0.6 }));
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  pond.add(water);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 8, 48), sm);
  edge.rotation.x = -Math.PI / 2;
  pond.add(edge);
  const petalMat = std(0xffb3c9, { roughness: 0.6, emissive: 0x30101a });
  const padMat = std(0x2e5a24, { roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const a = rand(0, 6.28), r = rand(0.5, 4);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.4, 0.7), 16, 0.3, 5.9), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
    pond.add(pad);
    if (i % 2 === 0) {
      const lotus = new THREE.Group();
      lotus.position.set(pad.position.x, 0.05, pad.position.z);
      for (let k = 0; k < 10; k++) {
        const pt = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), petalMat);
        pt.scale.set(0.5, 1.2, 0.3);
        const pa = (k / 10) * Math.PI * 2;
        pt.position.set(Math.cos(pa) * 0.09, 0.1, Math.sin(pa) * 0.09);
        pt.rotation.set(Math.sin(pa) * (k < 5 ? 0.5 : 0.9), 0, -Math.cos(pa) * (k < 5 ? 0.5 : 0.9));
        lotus.add(pt);
      }
      pond.add(lotus);
    }
  }
  scene.add(pond);

  // ---------- Distant hills (Trikuta mountain silhouettes) ----------
  const hillMat = std(0x0b1020, { flatShading: true, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1);
    const r = rand(110, 150);
    const h = rand(18, 48);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rand(25, 45), h, 6), hillMat);
    hill.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    hill.rotation.y = rand(0, 6);
    scene.add(hill);
  }

  // ---------- Fireflies & falling petals ----------
  const FF = 140;
  const ffGeo = new THREE.BufferGeometry();
  const ffPos = new Float32Array(FF * 3);
  const ffSeed = [];
  for (let i = 0; i < FF; i++) {
    const a = rand(0, 6.28), r = rand(6, 26);
    ffSeed.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rand(0.5, 4), s: rand(0, 100), sp: rand(0.3, 0.8) });
  }
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ff = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.16, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ff.frustumCulled = false;
  scene.add(ff);

  const PN = 220;
  const petGeo = new THREE.BufferGeometry();
  const petPos = new Float32Array(PN * 3);
  const pets = [];
  for (let i = 0; i < PN; i++) {
    const src = flowerPts[(Math.random() * flowerPts.length) | 0] || new THREE.Vector3();
    pets.push({ x: src.x + rand(-2, 2), y: rand(0, 6), z: src.z + rand(-2, 2), vy: rand(0.3, 0.7), s: rand(0, 50) });
  }
  petGeo.setAttribute('position', new THREE.BufferAttribute(petPos, 3));
  const petals = new THREE.Points(petGeo, new THREE.PointsMaterial({ color: 0xff6a3a, size: 0.1, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05 }));
  petals.frustumCulled = false;
  scene.add(petals);

  updaters.push((dt, t) => {
    for (let i = 0; i < FF; i++) {
      const s = ffSeed[i];
      ffPos[i * 3] = s.x + Math.sin(t * s.sp + s.s) * 1.5;
      ffPos[i * 3 + 1] = s.y + Math.sin(t * s.sp * 1.7 + s.s * 2) * 0.6;
      ffPos[i * 3 + 2] = s.z + Math.cos(t * s.sp * 0.9 + s.s) * 1.5;
    }
    ff.material.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    ffGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < PN; i++) {
      const p = pets[i];
      p.y -= p.vy * dt;
      p.x += Math.sin(t + p.s) * dt * 0.5 + dt * 0.3;
      if (p.y < -0.3) {
        const src = flowerPts[(Math.random() * flowerPts.length) | 0];
        p.x = src.x; p.y = src.y; p.z = src.z;
      }
      petPos[i * 3] = p.x; petPos[i * 3 + 1] = p.y; petPos[i * 3 + 2] = p.z;
    }
    petGeo.attributes.position.needsUpdate = true;
  });

  return {
    bounds: circleBounds(fightRadius),
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}
