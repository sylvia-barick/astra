import * as THREE from 'three';
import { rand, std, canvasTex, speckle, gradientSky, glowSprite, moonLightRig, mesh, circleBounds, dotTex } from './common.js';

// Lanka Dahan — Ravana's golden city the night Hanuman set it ablaze.
// Twist: fire patches spread across the arena during each round.
// Standing in a burning patch drains health.

function lankaFloor() {
  return canvasTex(2048, (g, S) => {
    g.fillStyle = '#1e1416'; g.fillRect(0, 0, S, S);
    speckle(g, S, 70000, ['rgba(0,0,0,.35)', 'rgba(120,80,60,.12)', 'rgba(200,150,80,.06)'], 3);
    g.translate(S / 2, S / 2);
    const R = S / 2;
    const star = (r, rot, fill, stroke, w) => {
      g.save(); g.rotate(rot);
      for (let k = 0; k < 2; k++) {
        g.rotate(Math.PI / 4);
        g.beginPath(); g.rect(-r * R * 0.7071, -r * R * 0.7071, r * R * 1.4142, r * R * 1.4142);
        if (fill) { g.fillStyle = fill; g.fill(); }
        g.lineWidth = w; g.strokeStyle = stroke; g.stroke();
      }
      g.restore();
    };
    star(0.62, 0, 'rgba(110,18,22,.55)', 'rgba(230,180,80,.9)', 8);
    star(0.42, Math.PI / 8, 'rgba(30,10,12,.6)', 'rgba(230,180,80,.85)', 6);
    star(0.22, 0, 'rgba(150,24,30,.6)', 'rgba(255,210,110,.9)', 5);
    g.strokeStyle = 'rgba(230,180,80,.8)';
    for (const r of [0.08, 0.7, 0.86, 0.97]) { g.lineWidth = r > 0.9 ? 10 : 5; g.beginPath(); g.arc(0, 0, r * R, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(230,180,80,.85)';
    for (let k = 0; k < 64; k++) {
      g.save(); g.rotate((k / 64) * Math.PI * 2); g.translate(0, 0.78 * R);
      g.beginPath(); g.moveTo(0, -18); g.lineTo(10, 0); g.lineTo(0, 18); g.lineTo(-10, 0); g.closePath(); g.fill();
      g.restore();
    }
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.6)';
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 0.86 * R, Math.sin(a) * 0.86 * R); g.lineTo(Math.cos(a) * 0.97 * R, Math.sin(a) * 0.97 * R); g.stroke();
    }
  });
}

function wallTextures() {
  const rows = (g, S, lit) => {
    for (let y = 30; y < S; y += 64) {
      for (let x = 16; x < S; x += 40) {
        const on = Math.random() < 0.55;
        g.fillStyle = lit ? (on ? `rgba(255,${140 + Math.random() * 80 | 0},60,1)` : '#000') : 'rgba(30,15,8,.9)';
        g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x, y + 10); g.arc(x + 10, y + 10, 10, Math.PI, 0); g.lineTo(x + 20, y + 30); g.closePath(); g.fill();
      }
    }
  };
  const map = canvasTex(256, (g, S) => {
    g.fillStyle = '#c99a4a'; g.fillRect(0, 0, S, S);
    speckle(g, S, 6000, ['rgba(90,50,10,.25)', 'rgba(255,230,160,.2)'], 2);
    g.fillStyle = 'rgba(120,60,10,.6)';
    for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 5);
    rows(g, S, false);
  });
  const emissiveMap = canvasTex(256, (g, S) => { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); rows(g, S, true); });
  return { map, emissiveMap };
}

export function buildLanka(scene, world, fx) {
  const updaters = [];
  const R = 11;

  // ---------- Burning sky & light ----------
  scene.add(gradientSky(0x080206, 0x3a0d0a, 0xd2541a, 0x2a0a06));
  const dir = new THREE.Vector3(0.45, 0.55, 0.5).normalize();
  moonLightRig(scene, dir, 0xffa070, 1.1, 0xb05a36, 0x200808, 1.5);
  world.fog = new THREE.FogExp2(0x3a140c, 0.013);
  const horizonGlow = glowSprite('rgba(255,140,50,.5)', 'rgba(255,70,20,.18)', 380);
  horizonGlow.position.set(0, 10, -260);
  scene.add(horizonGlow);

  // ---------- Platform ----------
  const tex = lankaFloor();
  const sideMat = std(0x3a2418, { roughness: 0.7 });
  const goldMat = std(0xe0a83c, { metalness: 0.9, roughness: 0.3 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(12, 12.4, 0.36, 96), [
    sideMat, std(0xffffff, { map: tex, roughness: 0.35, metalness: 0.3 }), sideMat,
  ]);
  platform.position.y = -0.18;
  platform.receiveShadow = true;
  scene.add(platform);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(12.02, 0.07, 6, 128), goldMat);
  rim.rotation.x = -Math.PI / 2;
  scene.add(rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(200, 48), std(0x2a1610, { roughness: 0.6, metalness: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.37;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fire braziers ring.
  const braziers = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 13.4, z = Math.sin(a) * 13.4;
    mesh(scene, new THREE.CylinderGeometry(0.25, 0.4, 2.2, 10), std(0x2a1a14), x, 0.75, z);
    mesh(scene, new THREE.CylinderGeometry(0.6, 0.3, 0.45, 12), goldMat, x, 2.05, z);
    let light = null;
    if (i % 2 === 0) { light = new THREE.PointLight(0xff7a2a, 30, 16, 1.6); light.position.set(x, 3, z); scene.add(light); }
    braziers.push({ x, z, light, s: rand(0, 9) });
  }

  // ---------- Golden city ----------
  const { map, emissiveMap } = wallTextures();
  const wallMat = std(0xffffff, { map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1, metalness: 0.5, roughness: 0.45 });
  const burning = [];
  const addTower = (x, z, h, w, burn) => {
    const g = new THREE.Group();
    g.position.set(x, -0.36, z);
    g.rotation.y = rand(0, Math.PI);
    let y = 0, cw = w;
    const tiers = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < tiers; i++) {
      const th = h / tiers;
      mesh(g, new THREE.BoxGeometry(cw, th, cw), wallMat, 0, y + th / 2, 0);
      mesh(g, new THREE.BoxGeometry(cw * 1.12, 0.35, cw * 1.12), goldMat, 0, y + th, 0);
      if (i === tiers - 1 || Math.random() < 0.4) {
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          mesh(g, new THREE.SphereGeometry(cw * 0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), goldMat, sx * cw * 0.45, y + th + 0.15, sz * cw * 0.45);
        }
      }
      y += th; cw *= 0.76;
    }
    mesh(g, new THREE.SphereGeometry(cw * 0.75, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), goldMat, 0, y, 0);
    mesh(g, new THREE.ConeGeometry(cw * 0.2, cw * 1.6, 8), goldMat, 0, y + cw * 1.4, 0);
    scene.add(g);
    if (burn) burning.push(new THREE.Vector3(x, y - 0.36 + cw * 0.5, z));
  };
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rand(-0.06, 0.06);
    const r = i % 2 ? rand(20, 28) : rand(34, 55);
    addTower(Math.cos(a) * r, Math.sin(a) * r, rand(9, 26) * (r > 30 ? 1.5 : 1), rand(3.5, 6), Math.random() < 0.45);
  }
  // Ravana's palace towering behind.
  addTower(0, -70, 60, 16, true);

  // Torana gate.
  const gate = new THREE.Group();
  gate.position.set(0, -0.36, -19);
  for (const s of [-1, 1]) {
    mesh(gate, new THREE.BoxGeometry(1.4, 10, 1.4), wallMat, s * 5.5, 5, 0);
    mesh(gate, new THREE.BoxGeometry(1.9, 0.5, 1.9), goldMat, s * 5.5, 10.2, 0);
    mesh(gate, new THREE.ConeGeometry(0.7, 1.8, 8), goldMat, s * 5.5, 11.3, 0);
  }
  const arch = mesh(gate, new THREE.TorusGeometry(5.5, 0.45, 10, 40, Math.PI), goldMat, 0, 10, 0);
  arch.scale.y = 0.5;
  mesh(gate, new THREE.BoxGeometry(12.5, 0.8, 1.2), goldMat, 0, 9.6, 0);
  const face = mesh(gate, new THREE.CircleGeometry(1.3, 24), std(0x8a1418, { metalness: 0.5, emissive: 0x300000 }), 0, 12.2, 0.62);
  face.castShadow = false;
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a10).multiplyScalar(3) }));
    eye.position.set(s * 0.45, 12.45, 0.7);
    gate.add(eye);
  }
  scene.add(gate);

  // ---------- Smoke & embers ----------
  const dot = dotTex();
  const SN = 260;
  const smokePos = new Float32Array(SN * 3);
  const smoke = [];
  const resetSmoke = (p) => {
    const src = burning[(Math.random() * burning.length) | 0];
    p.x = src.x + rand(-1, 1); p.y = src.y + rand(0, 2); p.z = src.z + rand(-1, 1); p.v = rand(2, 4);
  };
  for (let i = 0; i < SN; i++) { const p = {}; resetSmoke(p); p.y += rand(0, 30); smoke.push(p); }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokePts = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ color: 0x24160f, size: 9, map: dot, transparent: true, opacity: 0.55, depthWrite: false }));
  smokePts.frustumCulled = false;
  scene.add(smokePts);

  const EN = 500;
  const embPos = new Float32Array(EN * 3);
  const embers = [];
  for (let i = 0; i < EN; i++) embers.push({ x: rand(-40, 40), y: rand(0, 25), z: rand(-40, 40), v: rand(0.8, 2.5), s: rand(0, 9) });
  const embGeo = new THREE.BufferGeometry();
  embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3));
  const embPts = new THREE.Points(embGeo, new THREE.PointsMaterial({ color: 0xff8a2a, size: 0.14, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  embPts.frustumCulled = false;
  scene.add(embPts);

  updaters.push((dt, t) => {
    for (let i = 0; i < SN; i++) {
      const p = smoke[i];
      p.y += p.v * dt; p.x += 1.5 * dt;
      if (p.y > 70) resetSmoke(p);
      smokePos[i * 3] = p.x; smokePos[i * 3 + 1] = p.y; smokePos[i * 3 + 2] = p.z;
    }
    smokeGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < EN; i++) {
      const p = embers[i];
      p.y += p.v * dt; p.x += Math.sin(t * 1.3 + p.s) * dt; p.z += Math.cos(t + p.s) * dt * 0.7;
      if (p.y > 25) { p.y = 0; p.x = rand(-40, 40); p.z = rand(-40, 40); }
      embPos[i * 3] = p.x; embPos[i * 3 + 1] = p.y; embPos[i * 3 + 2] = p.z;
    }
    embGeo.attributes.position.needsUpdate = true;
    // Rooftop fires + braziers.
    for (const b of burning) {
      if (Math.random() < 0.7) fx.vfx.spawn(b.x + rand(-1.5, 1.5), b.y, b.z + rand(-1.5, 1.5), rand(-0.5, 0.5), rand(3, 6), rand(-0.5, 0.5), rand(0.6, 1.1), rand(1.4, 2.6), Math.random() < 0.5 ? 0xff5a10 : 0xffa030, 0, 0.5);
    }
    for (const b of braziers) {
      fx.vfx.spawn(b.x + rand(-0.3, 0.3), 2.3, b.z + rand(-0.3, 0.3), 0, rand(1.5, 3), 0, rand(0.35, 0.6), rand(0.4, 0.7), Math.random() < 0.5 ? 0xff6a1a : 0xffc040, 0, 1);
      if (b.light) b.light.intensity = 30 * (0.8 + Math.sin(t * 13 + b.s) * 0.12 + Math.random() * 0.1);
    }
  });

  // ---------- Hazard: spreading fire patches ----------
  const scorchTex = canvasTex(256, (g, S) => {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(20,6,2,.95)'); gr.addColorStop(0.65, 'rgba(60,14,4,.85)');
    gr.addColorStop(0.85, 'rgba(255,110,20,.9)'); gr.addColorStop(1, 'rgba(255,80,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  const patches = [];
  let spawnT = 9, announced = false;
  const PR = 1.7;

  const clearPatches = () => {
    for (const p of patches) { scene.remove(p.m); p.m.material.dispose(); }
    patches.length = 0;
    spawnT = 9;
  };

  return {
    bounds: circleBounds(R),
    update(dt, t, info) {
      for (const u of updaters) u(dt, t);
      if (info?.fighting) {
        spawnT -= dt;
        if (spawnT <= 0 && patches.length < 6) {
          spawnT = rand(6, 9);
          let x = 0, z = 0;
          for (let tries = 0; tries < 20; tries++) {
            const a = rand(0, Math.PI * 2), r = rand(2, 9);
            x = Math.cos(a) * r; z = Math.sin(a) * r;
            if (info.fighters.every((f) => Math.hypot(f.pos.x - x, f.pos.z - z) > 2.4)) break;
          }
          const m = new THREE.Mesh(new THREE.CircleGeometry(PR * 1.15, 32), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, opacity: 0 }));
          m.rotation.x = -Math.PI / 2;
          m.position.set(x, 0.02, z);
          scene.add(m);
          patches.push({ m, x, z, age: 0 });
          fx.audio.fire?.();
          if (!announced) { announced = true; fx.toast?.('LANKA DAHAN — THE FIRE SPREADS'); }
        }
      }
      for (const p of patches) {
        p.age += dt;
        const live = p.age > 1.2;
        p.m.material.opacity = Math.min(1, p.age);
        const n = live ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * PR;
          fx.vfx.spawn(p.x + Math.cos(a) * r, 0.05, p.z + Math.sin(a) * r, 0, rand(1.5, 3.5) * (live ? 1 : 0.4), 0, rand(0.35, 0.7), rand(0.3, 0.6), Math.random() < 0.6 ? 0xff5a10 : 0xffc040, 0, 1);
        }
      }
    },
    hazardAt(pos) {
      for (const p of patches) if (p.age > 1.2 && Math.hypot(pos.x - p.x, pos.z - p.z) < PR) return 7;
      return 0;
    },
    resetRound: clearPatches,
  };
}
