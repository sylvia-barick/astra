import * as THREE from 'three';

// Shared building blocks for every arena: procedural textures, sky, bounds.

export const rand = (a, b) => a + Math.random() * (b - a);
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

export function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

export function speckle(g, S, n, colors, sz = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.fillRect(Math.random() * S, Math.random() * S, sz, sz);
  }
}

export const stoneTexture = (base = '#9c7b56', lines = 'rgba(50,30,12,.5)') => canvasTex(512, (g, S) => {
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  speckle(g, S, 25000, ['rgba(60,40,20,.25)', 'rgba(255,230,190,.15)'], 2);
  g.strokeStyle = lines; g.lineWidth = 3;
  for (let y = 0; y < S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
}, 1);

export const dotTex = () => canvasTex(64, (g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
});

// Vertical-gradient sky dome.
export function gradientSky(top, mid, horizon, bottom = horizon) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) },
        horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top, mid, horizon, bottom; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.3, h));
          c = mix(c, top, smoothstep(0.3, 0.9, h));
          c = mix(bottom, c, smoothstep(-0.25, 0.0, h));
          gl_FragColor = vec4(c, 1.); }`,
    }),
  );
}

export function starField(count = 2000, color = 0xdfe8ff) {
  const sp = [];
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2, y = rand(0.05, 1), r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(th) * r * 420, y * 420, Math.sin(th) * r * 420);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size: 1.6, sizeAttenuation: false, fog: false }));
}

export function glowSprite(inner, outer, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(256, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, inner); gr.addColorStop(0.3, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  s.scale.set(scale, scale, 1);
  return s;
}

export function moonLightRig(scene, dir, color, intensity, hemiSky, hemiGround, hemiI) {
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, hemiI);
  scene.add(hemi);
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(dir).multiplyScalar(40);
  l.castShadow = true;
  l.shadow.mapSize.set(2048, 2048);
  const sc = l.shadow.camera;
  sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.near = 1; sc.far = 100;
  l.shadow.bias = -0.0005;
  l.shadow.normalBias = 0.03;
  scene.add(l);
  return { hemi, light: l };
}

export function mesh(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---- Fight-area bounds ----
export const circleBounds = (R) => ({
  outside: (p) => Math.hypot(p.x, p.z) > R,
  clamp(p) { const r = Math.hypot(p.x, p.z); if (r > R) { p.x *= R / r; p.z *= R / r; } },
  home: (p) => p.set(0, 0, 0),
});

export const rectBounds = (hx, hz) => ({
  outside: (p) => Math.abs(p.x) > hx || Math.abs(p.z) > hz,
  clamp(p) { p.x = THREE.MathUtils.clamp(p.x, -hx, hx); p.z = THREE.MathUtils.clamp(p.z, -hz, hz); },
  home: (p) => p.set(0, 0, THREE.MathUtils.clamp(p.z, -hz + 1, hz - 1)),
});
