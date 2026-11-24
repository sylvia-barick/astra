// Procedural pose animation. Every pose is a set of joint angles; the Animator
// eases the rig toward the target pose each frame. Poses are authored for a
// right-handed weapon and mirrored for Rama (bow in the left hand).

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const seg = (t, a, b) => clamp01((t - a) / Math.max(1e-4, b - a));
// Three-phase value: rest → windup → strike → rest.
const tri = (t, h0, h1, rest, wind, strike) => {
  let v = lerp(rest, wind, ease(seg(t, 0, h0)));
  v = lerp(v, strike, ease(seg(t, h0, h1)));
  return lerp(v, rest, ease(seg(t, h1 + (1 - h1) * 0.25, 1)));
};

const KEYS = ['hipsY', 'hipsRot', 'tX', 'tY', 'tZ', 'hX', 'hY', 'uaLx', 'uaLy', 'uaLz', 'faL', 'uaRx', 'uaRy', 'uaRz', 'faR',
  'thLx', 'thLz', 'shL', 'thRx', 'thRz', 'shR', 'fall'];

function base(time) {
  const br = Math.sin(time * 2.2);
  return {
    hipsY: -0.07 + br * 0.008, hipsRot: 0, tX: 0.06 + br * 0.015, tY: 0, tZ: 0, hX: -0.04, hY: 0,
    uaLx: -0.55, uaLy: 0.15, uaLz: 0.2, faL: -1.15,
    uaRx: -0.6, uaRy: -0.1, uaRz: -0.2, faR: -1.2,
    thLx: -0.3, thLz: 0.08, shL: 0.35, thRx: 0.18, thRz: -0.08, shR: 0.3, fall: 0,
  };
}

const POSES = {
  stance(p, a) {
    if (a.moving) {
      const s = a.speedFrac, ph = a.phase;
      p.thLx = -0.15 + Math.sin(ph) * 0.65 * s;
      p.thRx = -0.15 - Math.sin(ph) * 0.65 * s;
      p.shL = 0.25 + Math.max(0, Math.sin(ph + 1.4)) * 0.9 * s;
      p.shR = 0.25 + Math.max(0, Math.sin(ph + Math.PI + 1.4)) * 0.9 * s;
      p.hipsY = -0.08 - Math.abs(Math.cos(ph)) * 0.04 * s;
      p.tX = 0.12 * a.fwd * s + 0.06;
      p.tZ = -a.side * 0.08 * s;
      p.uaLx += Math.sin(ph) * 0.15 * s;
      p.uaRx -= Math.sin(ph) * 0.15 * s;
    }
  },
  // Crouched stealth walk.
  sneak(p, a) {
    const s = a.speedFrac || 0, ph = a.phase || 0;
    p.hipsY = -0.3; p.tX = 0.45; p.hX = -0.3;
    p.thLx = -0.85 + Math.sin(ph) * 0.4 * s; p.thRx = -0.45 - Math.sin(ph) * 0.4 * s;
    p.shL = 1.35 + Math.max(0, Math.sin(ph + 1.4)) * 0.4 * s;
    p.shR = 1.15 + Math.max(0, Math.sin(ph + Math.PI + 1.4)) * 0.4 * s;
    p.uaLx = -0.9; p.faL = -1.0; p.uaRx = -0.7; p.faR = -1.3;
  },
  block(p) {
    Object.assign(p, { uaRx: -1.45, uaRy: 0.75, uaRz: -0.1, faR: -1.3, uaLx: -1.3, uaLy: -0.5, faL: -1.7, tX: 0.18, hipsY: -0.14, hX: 0.15, thLx: -0.45, shL: 0.6, thRx: 0.35, shR: 0.45 });
  },
  swingR(p, a) {
    const { t, h0, h1 } = a;
    p.tY = tri(t, h0, h1, 0, -0.85, 0.95);
    p.uaRx = tri(t, h0, h1, -0.6, -1.35, -1.3);
    p.uaRy = tri(t, h0, h1, -0.1, -1.0, 0.7);
    p.uaRz = -0.25;
    p.faR = tri(t, h0, h1, -1.2, -1.0, -0.15);
    p.thLx = -0.55; p.shL = 0.55; p.hipsY = -0.13;
    p.tX = 0.15;
  },
  swingL(p, a) {
    const { t, h0, h1 } = a;
    p.tY = tri(t, h0, h1, 0, 0.85, -0.95);
    p.uaRx = tri(t, h0, h1, -0.6, -1.45, -1.3);
    p.uaRy = tri(t, h0, h1, -0.1, 0.8, -1.0);
    p.uaRz = -0.2;
    p.faR = tri(t, h0, h1, -1.2, -1.7, -0.15);
    p.thLx = -0.5; p.shL = 0.5; p.hipsY = -0.13; p.tX = 0.15;
  },
  thrust(p, a) {
    const { t, h0, h1 } = a;
    p.tY = tri(t, h0, h1, 0, -0.7, 0.45);
    p.uaRx = tri(t, h0, h1, -0.6, -0.7, -1.6);
    p.uaRy = tri(t, h0, h1, -0.1, -0.3, 0.25);
    p.faR = tri(t, h0, h1, -1.2, -2.0, -0.05);
    p.thLx = tri(t, h0, h1, -0.3, -0.2, -0.95);
    p.shL = tri(t, h0, h1, 0.35, 0.4, 0.9);
    p.thRx = tri(t, h0, h1, 0.18, 0.2, 0.55);
    p.tX = tri(t, h0, h1, 0.06, -0.05, 0.35);
    p.hipsY = tri(t, h0, h1, -0.07, -0.05, -0.22);
  },
  kick(p, a) {
    const { t, h0, h1 } = a;
    p.thRx = tri(t, h0, h1, 0.18, -1.1, -1.6);
    p.shR = tri(t, h0, h1, 0.3, 1.9, 0.08);
    p.tX = tri(t, h0, h1, 0.06, -0.1, -0.35);
    p.thLx = 0.05; p.shL = 0.2;
    p.uaLz = 0.7; p.uaRz = -0.8; p.uaRx = -0.4; p.uaLx = -0.4;
  },
  overhead(p, a) {
    const { t, h0, h1 } = a;
    p.uaRx = tri(t, h0, h1, -0.6, -3.0, -0.95);
    p.uaRy = 0.25;
    p.faR = tri(t, h0, h1, -1.2, -0.6, -0.1);
    p.uaLx = tri(t, h0, h1, -0.55, -2.8, -0.9);
    p.uaLy = -0.35;
    p.faL = tri(t, h0, h1, -1.15, -0.8, -0.4);
    p.tX = tri(t, h0, h1, 0.06, -0.3, 0.55);
    p.hX = tri(t, h0, h1, -0.04, -0.25, 0.2);
    p.hipsY = tri(t, h0, h1, -0.07, 0.0, -0.3);
    p.thLx = tri(t, h0, h1, -0.3, -0.2, -0.75);
    p.shL = tri(t, h0, h1, 0.35, 0.3, 0.85);
    p.thRx = tri(t, h0, h1, 0.18, 0.1, 0.5);
  },
  // Archer stance — authored for a left-hand bow (Rama). Not mirrored.
  draw(p, a) {
    const pull = a.pull;
    p.tY = -0.9; p.tX = 0.02; p.hY = 0.45;
    p.uaLx = -1.5; p.uaLy = 0.95; p.uaLz = 0; p.faL = -0.05;
    p.uaRx = -1.45; p.uaRy = lerp(0.95, 0.3, pull); p.uaRz = 0; p.faR = lerp(-0.3, -2.2, pull);
    if (a.released) { p.uaRy = -0.2; p.faR = -1.0; p.uaRz = -0.6; }
    p.thLx = -0.35; p.thLz = 0.25; p.shL = 0.3; p.thRx = 0.35; p.thRz = -0.25; p.shR = 0.3;
    p.hipsY = -0.12;
  },
  cast(p, a) {
    const { t, h0, h1 } = a;
    p.tY = tri(t, h0, h1, 0, -0.7, 0.5);
    p.uaRx = tri(t, h0, h1, -0.6, -0.6, -1.65);
    p.uaRy = tri(t, h0, h1, -0.1, -0.7, 0.15);
    p.faR = tri(t, h0, h1, -1.2, -2.0, -0.05);
    p.uaLx = tri(t, h0, h1, -0.55, -1.2, -0.3); p.uaLz = 0.5;
    p.thLx = -0.6; p.shL = 0.55; p.hipsY = -0.15;
  },
  storm(p, a) {
    p.uaRx = -1.2; p.uaRy = 0; p.uaRz = -1.0; p.faR = -0.1;
    p.uaLx = -0.4; p.uaLz = 1.3; p.faL = -0.3;
    p.tX = 0.1; p.hipsY = -0.18; p.thLx = -0.4; p.thRx = 0.3; p.shL = 0.5; p.shR = 0.5;
    p.hipsRot = a.spin;
  },
  dodge(p) {
    Object.assign(p, { tX: 0.65, hipsY: -0.38, thLx: -1.1, shL: 1.5, thRx: 0.5, shR: 1.3, uaLx: -1.2, faL: -1.9, uaRx: -1.2, faR: -1.9, hX: 0.25 });
  },
  hit(p, a) {
    const k = 1 - a.t;
    p.tX = -0.4 * k; p.hX = -0.35 * k; p.uaLz = 0.6; p.uaRz = -0.6; p.uaLx = -0.3; p.uaRx = -0.3;
    p.hipsY = -0.1; p.thLx = -0.1; p.thRx = 0.3;
  },
  stagger(p, a) {
    p.tX = -0.45 + Math.sin(a.time * 9) * 0.08; p.tZ = Math.sin(a.time * 6) * 0.15; p.hX = -0.4;
    p.uaLx = 0.1; p.uaRx = 0.1; p.uaLz = 0.4; p.uaRz = -0.4; p.faL = -0.3; p.faR = -0.3; p.hipsY = -0.15;
  },
  revive(p, a) {
    p.uaLz = 1.4; p.uaRz = -1.4; p.uaLx = -0.5; p.uaRx = -0.5; p.faL = -0.4; p.faR = -0.4;
    p.hX = -0.45; p.tX = -0.3; p.hipsY = -0.2 + Math.sin(a.time * 30) * 0.01;
  },
  ko(p, a) {
    const f = ease(seg(a.t, 0, 0.7));
    p.fall = -1.5 * f; p.tX = -0.3 * f; p.hX = -0.4 * f;
    p.uaLz = 1.2 * f; p.uaRz = -1.2 * f; p.uaLx = -0.2; p.uaRx = -0.2; p.faL = -0.3; p.faR = -0.3;
    p.thLx = -0.4 * f; p.thRx = 0.1; p.shL = 0.6 * f; p.shR = 0.1; p.hipsY = -0.07;
  },
  victory(p, a) {
    p.uaRx = -2.85; p.uaRy = 0.1; p.uaRz = -0.25; p.faR = -0.25;
    p.uaLx = -0.25; p.uaLz = 0.35; p.faL = -0.6;
    p.tX = -0.12; p.hX = -0.2; p.hipsY = -0.02 + Math.sin(a.time * 2) * 0.01;
    p.thLx = -0.1; p.thRx = 0.1; p.shL = 0.1; p.shR = 0.1;
  },
};

const NATIVE = new Set(['draw', 'stance', 'sneak', 'dodge', 'hit', 'stagger', 'ko', 'revive']);

function mirror(p) {
  const q = { ...p };
  q.uaLx = p.uaRx; q.uaLy = -p.uaRy; q.uaLz = -p.uaRz; q.faL = p.faR;
  q.uaRx = p.uaLx; q.uaRy = -p.uaLy; q.uaRz = -p.uaLz; q.faR = p.faL;
  q.thLx = p.thRx; q.thLz = -p.thRz; q.shL = p.shR;
  q.thRx = p.thLx; q.thRz = -p.thLz; q.shR = p.shL;
  q.tY = -p.tY; q.tZ = -p.tZ; q.hY = -p.hY; q.hipsRot = -p.hipsRot;
  return q;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Animator {
  constructor(rig, handed) {
    this.rig = rig;
    this.handed = handed;
    this.cur = base(0);
  }

  update(dt, name, args, time) {
    let p = base(time);
    const fn = POSES[name] || POSES.stance;
    fn(p, { ...args, time });
    if (this.handed === 'L' && !NATIVE.has(name)) p = mirror(p);

    if (name !== 'storm') this.cur.hipsRot = wrap(this.cur.hipsRot);
    const k = 1 - Math.exp(-dt * (args.snap ?? 18));
    for (const key of KEYS) {
      if (key === 'hipsRot' && name === 'storm') this.cur[key] = p[key];
      else this.cur[key] += (p[key] - this.cur[key]) * k;
    }
    this.apply();
  }

  apply() {
    const c = this.cur, r = this.rig;
    r.hips.position.y = 0.95 + c.hipsY;
    r.hips.rotation.y = c.hipsRot;
    r.torso.rotation.set(c.tX, c.tY, c.tZ);
    r.headPivot.rotation.set(c.hX, c.hY - c.tY * 0.5, 0);
    r.uaL.rotation.set(c.uaLx, c.uaLy, c.uaLz);
    r.uaR.rotation.set(c.uaRx, c.uaRy, c.uaRz);
    r.faL.rotation.x = c.faL;
    r.faR.rotation.x = c.faR;
    r.thL.rotation.set(c.thLx, 0, c.thLz);
    r.thR.rotation.set(c.thRx, 0, c.thRz);
    r.shL.rotation.x = c.shL;
    r.shR.rotation.x = c.shR;
    r.body.rotation.x = c.fall;
  }
}
