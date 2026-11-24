import * as THREE from 'three';

// GPU particle pool (sparks, fire, divine energy) + expanding rings + impact lights.
export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.max = 4000;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.alpha = new Float32Array(this.max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main() {
          vColor = pcolor; vAlpha = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = pow(1.0 - d * 2.0, 1.6) * vAlpha;
          gl_FragColor = vec4(vColor * a * 2.0, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.parts = [];
    for (let i = 0; i < this.max; i++) this.parts.push({ on: false });
    this.cursor = 0;
    this.floorY = 0.02;
    this.rings = [];
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffaa55, 0, 9, 2);
      scene.add(l);
      return { l, t: 0, dur: 1 };
    });
    this.lightIdx = 0;
    this._c = new THREE.Color();
  }

  resize() { this.mat.uniforms.uScale.value = innerHeight * 0.5; }

  spawn(x, y, z, vx, vy, vz, life, size, color, gravity = 0, drag = 0) {
    const p = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    Object.assign(p, { on: true, x, y, z, vx, vy, vz, life, max: life, s: size, grav: gravity, drag });
    this._c.set(color);
    p.r = this._c.r; p.g = this._c.g; p.b = this._c.b;
  }

  burst(pos, o = {}) {
    const { count = 20, color = 0xffcc66, color2 = null, speed = 4, life = 0.5, size = 0.15, gravity = -6, up = 0, spread = 1, drag = 2 } = o;
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(
        pos.x, pos.y, pos.z,
        Math.sin(ph) * Math.cos(th) * s * spread, Math.cos(ph) * s + up, Math.sin(ph) * Math.sin(th) * s * spread,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8),
        color2 && Math.random() < 0.5 ? color2 : color, gravity, drag,
      );
    }
  }

  ring(pos, color = 0xffcc66, radius = 3, dur = 0.5, y = 0.05) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, y, pos.z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, radius });
  }

  flash(pos, color = 0xffaa55, intensity = 30, dur = 0.25) {
    const L = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.l.position.copy(pos);
    L.l.color.set(color);
    L.l.intensity = intensity;
    L.peak = intensity;
    L.t = 0; L.dur = dur;
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (!p.on) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.on = false; this.alpha[i] = 0; this.size[i] = 0; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < this.floorY) { p.y = this.floorY; p.vy *= -0.3; }
      const f = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.s * (0.4 + 0.6 * f);
      this.alpha[i] = Math.min(1, f * 2);
      n++;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.pcolor.needsUpdate = a.psize.needsUpdate = a.palpha.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const f = r.t / r.dur;
      r.m.scale.setScalar(0.2 + r.radius * f);
      r.m.material.opacity = 1 - f;
      if (f >= 1) {
        this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (const L of this.lights) {
      if (L.l.intensity <= 0) continue;
      L.t += dt;
      L.l.intensity = Math.max(0, L.peak * (1 - L.t / L.dur));
    }
  }
}
