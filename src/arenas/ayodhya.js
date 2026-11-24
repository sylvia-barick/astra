import * as THREE from 'three';
import { rand, std, canvasTex, speckle, gradientSky, glowSprite, moonLightRig, mesh, rectBounds, dotTex } from './common.js';

// Ayodhya — the royal courtyard of the Raghu dynasty (Suryavansha) at sunset.
// A marble courtyard with a rangoli in the centre, the palace with the golden
// Surya emblem, the Sarayu river with floating diyas, and falling marigolds.
// A classic, hazard-free arena.

const H = 11;

function marbleFloor() {
  return canvasTex(2048, (g, S) => {
    g.fillStyle = '#efe4d0'; g.fillRect(0, 0, S, S);
    speckle(g, S, 40000, ['rgba(160,140,120,.12)', 'rgba(255,255,255,.25)'], 3);
    g.strokeStyle = 'rgba(150,135,120,.25)'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      g.beginPath(); g.moveTo(Math.random() * S, Math.random() * S);
      g.bezierCurveTo(Math.random() * S, Math.random() * S, Math.random() * S, Math.random() * S, Math.random() * S, Math.random() * S);
      g.stroke();
    }
    const n = 13, cell = S / n;
    g.strokeStyle = 'rgba(190,140,50,.9)'; g.lineWidth = 5;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
    }
    g.fillStyle = 'rgba(165,50,30,.85)';
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      g.beginPath(); const x = i * cell, y = j * cell;
      g.moveTo(x, y - 22); g.lineTo(x + 22, y); g.lineTo(x, y + 22); g.lineTo(x - 22, y); g.closePath(); g.fill();
    }
    // Border band.
    g.strokeStyle = 'rgba(190,140,50,.95)'; g.lineWidth = 14; g.strokeRect(30, 30, S - 60, S - 60);
    g.fillStyle = 'rgba(30,90,70,.7)';
    for (let k = 60; k < S - 60; k += 48) for (const [x, y] of [[k, 54], [k, S - 54], [54, k], [S - 54, k]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
    // Central rangoli lotus.
    g.translate(S / 2, S / 2);
    const R = S * 0.24;
    const ring = (count, r0, r1, w, fill) => {
      for (let k = 0; k < count; k++) {
        g.save(); g.rotate((k / count) * Math.PI * 2);
        g.beginPath(); g.moveTo(0, r0); g.quadraticCurveTo(w, (r0 + r1) / 2, 0, r1); g.quadraticCurveTo(-w, (r0 + r1) / 2, 0, r0);
        g.fillStyle = fill; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(255,250,240,.9)'; g.stroke();
        g.restore();
      }
    };
    g.fillStyle = 'rgba(40,110,150,.8)'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    ring(24, R * 0.62, R * 1.05, R * 0.12, 'rgba(220,60,40,.95)');
    ring(16, R * 0.3, R * 0.72, R * 0.14, 'rgba(250,180,30,.95)');
    ring(8, R * 0.05, R * 0.38, R * 0.15, 'rgba(240,110,150,.95)');
    g.fillStyle = 'rgba(255,230,120,1)'; g.beginPath(); g.arc(0, 0, R * 0.08, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,250,240,.9)'; g.lineWidth = 6;
    for (const r of [R * 1.1, R * 1.18]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(250,180,30,.95)';
    for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * R * 1.14, Math.sin(a) * R * 1.14, 10, 0, Math.PI * 2); g.fill(); }
  });
}

function palaceWall() {
  const arches = (g, S, lit) => {
    for (let x = 12; x < S; x += 64) {
      g.fillStyle = lit ? 'rgba(255,170,80,1)' : 'rgba(60,35,20,.9)';
      g.beginPath(); g.moveTo(x, 220); g.lineTo(x, 110); g.arc(x + 20, 110, 20, Math.PI, 0); g.lineTo(x + 40, 220); g.closePath(); g.fill();
    }
  };
  const map = canvasTex(256, (g, S) => {
    g.fillStyle = '#f1e2c4'; g.fillRect(0, 0, S, S);
    speckle(g, S, 5000, ['rgba(150,120,90,.2)'], 2);
    g.fillStyle = 'rgba(200,150,60,.9)'; g.fillRect(0, 0, S, 14); g.fillRect(0, 60, S, 6); g.fillRect(0, S - 18, S, 18);
    g.fillStyle = 'rgba(170,60,40,.8)';
    for (let x = 0; x < S; x += 32) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x + 16, 48); g.lineTo(x + 32, 30); g.closePath(); g.fill(); }
    arches(g, S, false);
  });
  const emissiveMap = canvasTex(256, (g, S) => { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); arches(g, S, true); });
  return { map, emissiveMap };
}

export function buildAyodhya(scene, world, fx) {
  const updaters = [];

  // ---------- Sunset sky ----------
  scene.add(gradientSky(0x2a3a78, 0xe88a52, 0xffcf8a, 0x8a5a40));
  const sunDir = new THREE.Vector3(0.18, 0.13, -1).normalize();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe3a8).multiplyScalar(1.6), fog: false }));
  sun.position.copy(sunDir).multiplyScalar(390);
  scene.add(sun);
  const sunGlow = glowSprite('rgba(255,220,150,.75)', 'rgba(255,150,70,.25)', 300);
  sunGlow.position.copy(sun.position);
  scene.add(sunGlow);
  moonLightRig(scene, sunDir, 0xffc58a, 2.6, 0xffd0a0, 0x6a4a32, 1.15);
  world.fog = new THREE.FogExp2(0xd99868, 0.0065);
  // Wispy clouds lit from below.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffa070, transparent: true, opacity: 0.5, fog: false });
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
    c.position.set(rand(-250, 250), rand(40, 90), rand(-380, -150));
    c.scale.set(rand(30, 70), rand(3, 6), rand(8, 15));
    scene.add(c);
  }

  // ---------- Courtyard ----------
  const marble = std(0xf2e8d8, { roughness: 0.45 });
  const goldMat = std(0xe2ad42, { metalness: 0.9, roughness: 0.28 });
  const redMat = std(0x9a2a1e, { roughness: 0.6 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.4, 26), [
    marble, marble, std(0xffffff, { map: marbleFloor(), roughness: 0.3, metalness: 0.05 }), marble, marble, marble,
  ]);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);
  mesh(scene, new THREE.BoxGeometry(29, 0.25, 29), marble, 0, -0.42, 0);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std(0x5a6a2a, { roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.55;
  lawn.receiveShadow = true;
  scene.add(lawn);

  // Balustrade with lamp pillars on three sides (low, so the camera sees over it).
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb040).multiplyScalar(2) });
  const sides = [
    (t) => [t, 13.2], (t) => [-13.2, t], (t) => [13.2, t],
  ];
  sides.forEach((fn, si) => {
    const [ax, az] = fn(0);
    const rail = mesh(scene, new THREE.BoxGeometry(si === 0 ? 26 : 0.3, 0.18, si === 0 ? 0.3 : 26), goldMat, si === 0 ? 0 : ax, 0.85, si === 0 ? az : 0);
    rail.castShadow = false;
    for (let t = -12; t <= 12; t += 1.5) {
      const [x, z] = fn(t);
      mesh(scene, new THREE.CylinderGeometry(0.07, 0.09, 0.8, 8), marble, x, 0.4, z);
    }
    for (let t = -12; t <= 12; t += 6) {
      const [x, z] = fn(t);
      mesh(scene, new THREE.BoxGeometry(0.6, 0.4, 0.6), marble, x, 0.2, z);
      mesh(scene, new THREE.CylinderGeometry(0.2, 0.24, 2.4, 12), marble, x, 1.4, z);
      mesh(scene, new THREE.TorusGeometry(0.22, 0.04, 6, 14), goldMat, x, 1.0, z).rotation.x = Math.PI / 2;
      mesh(scene, new THREE.CylinderGeometry(0.32, 0.18, 0.2, 12), goldMat, x, 2.7, z);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 8), flameMat);
      fl.position.set(x, 2.92, z);
      scene.add(fl);
      flames.push({ fl, s: rand(0, 9) });
    }
  });
  updaters.push((dt, t) => { for (const f of flames) f.fl.scale.y = 1 + Math.sin(t * 13 + f.s) * 0.15; });

  // ---------- Palace ----------
  const { map, emissiveMap } = palaceWall();
  const wallMat = std(0xffffff, { map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.55 });
  const palace = new THREE.Group();
  palace.position.set(0, -0.55, -25);
  mesh(palace, new THREE.BoxGeometry(44, 1.6, 16), marble, 0, 0.8, 0);
  for (let i = 0; i < 5; i++) mesh(palace, new THREE.BoxGeometry(12 - i, 0.3, 1), marble, 0, 0.15 + i * 0.3, 8.5 + (4 - i) * 0.5);
  const tiers = [[34, 7, 11, 1.6], [24, 5.5, 8, 8.6], [14, 4.5, 6, 14.1]];
  const chhatri = (x, y, z, s) => {
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) mesh(palace, new THREE.CylinderGeometry(0.08 * s, 0.08 * s, 1.4 * s, 6), marble, x + px * 0.6 * s, y + 0.7 * s, z + pz * 0.6 * s);
    mesh(palace, new THREE.BoxGeometry(1.6 * s, 0.15 * s, 1.6 * s), marble, x, y + 1.45 * s, z);
    mesh(palace, new THREE.SphereGeometry(0.8 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), goldMat, x, y + 1.5 * s, z);
    mesh(palace, new THREE.ConeGeometry(0.1 * s, 0.6 * s, 8), goldMat, x, y + 2.5 * s, z);
  };
  for (const [w, h, d, y] of tiers) {
    mesh(palace, new THREE.BoxGeometry(w, h, d), wallMat, 0, y + h / 2, 0);
    mesh(palace, new THREE.BoxGeometry(w + 1, 0.5, d + 1), goldMat, 0, y + h, 0);
    mesh(palace, new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), redMat, 0, y + h + 0.45, 0);
    chhatri(-w / 2, y + h + 0.65, d / 2, 1.2);
    chhatri(w / 2, y + h + 0.65, d / 2, 1.2);
  }
  // Portico pillars.
  for (let x = -14; x <= 14; x += 4) {
    mesh(palace, new THREE.CylinderGeometry(0.42, 0.5, 6.4, 14), marble, x, 4.8, 6.6);
    mesh(palace, new THREE.BoxGeometry(1.2, 0.5, 1.2), goldMat, x, 8.1, 6.6);
  }
  mesh(palace, new THREE.BoxGeometry(31, 0.9, 1.6), marble, 0, 8.6, 6.6);
  // Great dome + kalash.
  mesh(palace, new THREE.CylinderGeometry(4.4, 4.6, 2, 24), wallMat, 0, 19.6, 0);
  mesh(palace, new THREE.SphereGeometry(4.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), goldMat, 0, 20.6, 0);
  mesh(palace, new THREE.SphereGeometry(0.8, 16, 10), goldMat, 0, 25.6, 0);
  mesh(palace, new THREE.ConeGeometry(0.3, 2.2, 10), goldMat, 0, 27.2, 0);
  // Surya emblem of the Suryavansha (Raghu dynasty).
  const suryaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc44a).multiplyScalar(1.8) });
  const surya = new THREE.Group();
  surya.position.set(0, 11.6, 4.05);
  surya.add(new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), suryaMat));
  for (let k = 0; k < 16; k++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.3, 3), suryaMat);
    const a = (k / 16) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0);
    ray.rotation.z = a - Math.PI / 2;
    surya.add(ray);
  }
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), std(0xd08a20, { metalness: 0.8, roughness: 0.3 }));
  face.position.z = 0.02;
  surya.add(face);
  palace.add(surya);
  updaters.push((dt, t) => { surya.rotation.z = t * 0.1; });
  // Saffron flags.
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff7a14, side: THREE.DoubleSide, emissive: 0x4a1a00 });
  const flags = [];
  for (const x of [-12, 0, 12]) {
    const y = x === 0 ? 28.3 : 19.4;
    mesh(palace, new THREE.CylinderGeometry(0.05, 0.05, 4, 6), goldMat, x, y, 0);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(2.4, -0.6); shape.lineTo(0, -1.2);
    const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), flagMat);
    f.position.set(x, y + 1.9, 0);
    palace.add(f);
    flags.push(f);
  }
  updaters.push((dt, t) => flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 2 + i) * 0.35; f.scale.x = 1 + Math.sin(t * 6 + i) * 0.06; }));
  scene.add(palace);

  // ---------- Sarayu river & ghats (left side) ----------
  const river = new THREE.Mesh(new THREE.PlaneGeometry(60, 500), new THREE.MeshStandardMaterial({ color: 0x3a5a78, roughness: 0.12, metalness: 0.5 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(-58, -2.3, 0);
  scene.add(river);
  for (let i = 0; i < 6; i++) mesh(scene, new THREE.BoxGeometry(2, 0.35, 120), marble, -24 - i * 1.6, -0.6 - i * 0.3, 0);
  const DN = 70;
  const diyaPos = new Float32Array(DN * 3);
  const diyas = [];
  for (let i = 0; i < DN; i++) diyas.push({ x: rand(-80, -32), z: rand(-200, 200), v: rand(0.6, 1.4) });
  const diyaGeo = new THREE.BufferGeometry();
  diyaGeo.setAttribute('position', new THREE.BufferAttribute(diyaPos, 3));
  const dot = dotTex();
  const diyaPts = new THREE.Points(diyaGeo, new THREE.PointsMaterial({ color: new THREE.Color(0xffb040).multiplyScalar(2), size: 0.7, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  diyaPts.frustumCulled = false;
  scene.add(diyaPts);
  updaters.push((dt, t) => {
    for (let i = 0; i < DN; i++) {
      const d = diyas[i];
      d.z += d.v * dt;
      if (d.z > 200) d.z = -200;
      diyaPos[i * 3] = d.x; diyaPos[i * 3 + 1] = -2.1 + Math.sin(t * 2 + i) * 0.05; diyaPos[i * 3 + 2] = d.z;
    }
    diyaGeo.attributes.position.needsUpdate = true;
  });

  // ---------- Palms & mango trees ----------
  const bark = std(0x6a4a2e);
  const frond = std(0x3d6a24, { flatShading: true, side: THREE.DoubleSide });
  const leaf = std(0x2f5a22, { flatShading: true });
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * rand(17, 30), z = rand(-14, 30);
    if (side < 0 && x < -22) continue;
    const tr = new THREE.Group();
    tr.position.set(x, -0.55, z);
    if (Math.random() < 0.55) {
      const h = rand(7, 10), lean = rand(-0.15, 0.15);
      for (let k = 0; k < 6; k++) {
        const s = mesh(tr, new THREE.CylinderGeometry(0.18, 0.22, h / 6 + 0.05, 8), bark, Math.sin(lean) * k * h / 6, k * h / 6 + h / 12, 0);
        s.rotation.z = -lean;
      }
      const top = new THREE.Vector3(Math.sin(lean) * h, h, 0);
      for (let k = 0; k < 9; k++) {
        const f = mesh(tr, new THREE.ConeGeometry(0.5, 3.6, 4), frond, top.x, top.y, top.z);
        f.scale.z = 0.15;
        f.rotation.set(0, (k / 9) * Math.PI * 2, 1.9);
        f.geometry.translate(0, 0, 0);
      }
    } else {
      mesh(tr, new THREE.CylinderGeometry(0.3, 0.45, 3, 9), bark, 0, 1.5, 0);
      for (let k = 0; k < 5; k++) {
        const b = mesh(tr, new THREE.IcosahedronGeometry(rand(1.6, 2.4), 1), leaf, rand(-1.4, 1.4), rand(3.6, 5), rand(-1.4, 1.4));
        b.scale.y = 0.7;
      }
    }
    scene.add(tr);
  }

  // ---------- Marigold petals & birds ----------
  const PN = 260;
  const pp = new Float32Array(PN * 3);
  const pc = new Float32Array(PN * 3);
  const petals = [];
  const c = new THREE.Color();
  for (let i = 0; i < PN; i++) {
    petals.push({ x: rand(-14, 14), y: rand(0, 14), z: rand(-14, 14), v: rand(0.5, 1.1), s: rand(0, 9) });
    c.set(Math.random() < 0.6 ? 0xff9a10 : 0xffd020);
    pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const petalPts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.13, map: dot, vertexColors: true, transparent: true, alphaTest: 0.05, depthWrite: false }));
  petalPts.frustumCulled = false;
  scene.add(petalPts);

  const birdMat = new THREE.LineBasicMaterial({ color: 0x2a1a20 });
  const birds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.8, 0.3, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.8, 0.3, 0)]);
    const b = new THREE.Line(g, birdMat);
    scene.add(b);
    birds.push({ b, r: rand(30, 60), a: rand(0, 6), y: rand(26, 40), sp: rand(0.08, 0.15), s: rand(0, 9) });
  }
  updaters.push((dt, t) => {
    for (let i = 0; i < PN; i++) {
      const p = petals[i];
      p.y -= p.v * dt; p.x += Math.sin(t * 1.5 + p.s) * dt * 0.6; p.z += Math.cos(t + p.s) * dt * 0.4;
      if (p.y < 0.02) { p.y = rand(10, 14); p.x = rand(-14, 14); p.z = rand(-14, 14); }
      pp[i * 3] = p.x; pp[i * 3 + 1] = p.y; pp[i * 3 + 2] = p.z;
    }
    pg.attributes.position.needsUpdate = true;
    for (const b of birds) {
      b.a += b.sp * dt;
      b.b.position.set(Math.cos(b.a) * b.r, b.y, Math.sin(b.a) * b.r - 40);
      b.b.rotation.y = -b.a;
      b.b.scale.y = Math.sin(t * 8 + b.s) * 1.2;
    }
  });

  return {
    bounds: rectBounds(H, H),
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}
