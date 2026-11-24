import { circleBounds, rectBounds } from '../arenas/common.js';

// The Yatra: four connected zones from Ayodhya to Lanka. Each zone reuses an
// arena's environment and adds cover, hiding bushes, patrolling asuras and a
// gate to the next zone. Coordinates are metres; facing = yaw where 0 looks +Z.

const ring = (n, r, offset = 0) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + offset;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

const platformGround = (top) => (x, z) => {
  const r = Math.hypot(x, z);
  return r < top ? 0 : r < top + 1 ? -0.18 : -0.36;
};

export const ZONES = [
  {
    id: 'ayodhya', arena: 'ayodhya', name: 'Ayodhya',
    story: 'Rakshasa spies have crept into the royal courtyard.',
    shape: { type: 'rect', hx: 12.3, hz: 12.3 }, bounds: rectBounds(12.3, 12.3),
    entry: [0, 10, Math.PI], gate: [11.2, -2],
    props: [
      { t: 'planter', x: -5, z: -4 }, { t: 'planter', x: 5, z: -4 }, { t: 'planter', x: -5, z: 5 }, { t: 'planter', x: 5, z: 5 },
      { t: 'wall', x: 0, z: -8, len: 5, rot: 0 }, { t: 'wall', x: -9, z: 1, len: 4, rot: Math.PI / 2 }, { t: 'wall', x: 8.5, z: -8.5, len: 3, rot: 0.6 },
    ],
    bushes: [[-10, 9], [9.5, 9.5], [-10, -10], [2.5, -10.5], [10, 3]],
    enemies: [
      { kind: 'warrior', route: [[-8, -4], [-8, -10], [-2, -10]] },
      { kind: 'warrior', route: [[6, -2], [9, -10]] },
      { kind: 'caster', route: [[0, -11], [5, -11]] },
      { kind: 'warrior', route: [[-10, 4], [-6, 2]] },
    ],
  },
  {
    id: 'ramsetu', arena: 'ramsetu', name: 'Ram Setu',
    story: 'Cross the bridge of floating stones. Asuras guard the way to Lanka.',
    shape: { type: 'rect', hx: 3.9, hz: 55 }, bounds: rectBounds(3.9, 55),
    entry: [0, 50, Math.PI], gate: [0, -51],
    props: [40, 30, 18, 6, -6, -18, -30, -42].map((z, i) => ({ t: 'rock', x: i % 2 ? 2.4 : -2.4, z, r: 1.0 })),
    bushes: [],
    enemies: [
      { kind: 'warrior', route: [[0, 35], [0, 24]] },
      { kind: 'caster', route: [[-2, 12], [2, 12]] },
      { kind: 'warrior', route: [[0, 1], [0, -10]] },
      { kind: 'caster', route: [[2, -24], [-2, -24]] },
      { kind: 'warrior', route: [[0, -36], [0, -46]] },
    ],
  },
  {
    id: 'ashoka', arena: 'ashoka', name: 'Ashoka Vatika',
    story: 'Ravana’s moonlit garden. Stay in the shadows of the Ashoka trees.',
    shape: { type: 'circle', r: 17 }, bounds: circleBounds(17), groundY: platformGround(12.1),
    entry: [0, 15.5, Math.PI], gate: [0, -15.5],
    colliders: ring(8, 14, Math.PI / 8).map(([x, z]) => ({ x, z, r: 0.65, h: 5 })),
    props: [{ t: 'rock', x: -4, z: -3, r: 1.1 }, { t: 'rock', x: 5, z: 2, r: 1.0 }, { t: 'rock', x: 1, z: -9, r: 0.9 }, { t: 'rock', x: -9, z: 6, r: 1.0 }],
    bushes: [[-6, 9], [7, 9], [-11, -2], [11, -1], [-6, -11], [7, -10], [0, 3]],
    enemies: [
      { kind: 'warrior', route: [[-8, 5], [-10, -3], [-5, -8]] },
      { kind: 'warrior', route: [[8, 5], [10, -4]] },
      { kind: 'caster', route: [[0, -11], [3, -12]] },
      { kind: 'warrior', route: [[-3, -1], [4, -1]] },
      { kind: 'caster', route: [[-12, -7], [-9, -12]] },
    ],
  },
  {
    id: 'lanka', arena: 'lanka', name: 'Lanka',
    story: 'The golden city burns. Ravana awaits.',
    shape: { type: 'circle', r: 16 }, bounds: circleBounds(16), groundY: platformGround(12.1),
    entry: [0, 14, Math.PI], gate: null, boss: [0, -8],
    colliders: ring(6, 13.4, 0.3).map(([x, z]) => ({ x, z, r: 0.55, h: 3 })),
    props: [{ t: 'cart', x: -6, z: 4 }, { t: 'cart', x: 6.5, z: 1 }, { t: 'rock', x: -2, z: -2, r: 0.9 }, { t: 'rock', x: 9, z: -7, r: 1.0 }],
    bushes: [],
    enemies: [
      { kind: 'caster', route: [[-8, -7]] },
      { kind: 'caster', route: [[8, -7]] },
      { kind: 'warrior', route: [[-6, 7], [6, 7]] },
    ],
  },
];
