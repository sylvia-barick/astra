import { buildAshoka } from './ashoka.js';
import { buildRamSetu } from './ramsetu.js';
import { buildLanka } from './lanka.js';
import { buildAyodhya } from './ayodhya.js';

// Arena registry. Each builder receives (root group, scene, fx) and returns
// { bounds, update(dt, t, info), ringOut?, floorY?, hazardAt?(pos), resetRound?() }.
export const ARENAS = [
  { id: 'ashoka', name: 'Ashoka Vatika', sub: 'Moonlit garden of Lanka', build: buildAshoka },
  { id: 'ramsetu', name: 'Ram Setu', sub: 'Storm over the floating bridge · ring-outs', build: buildRamSetu },
  { id: 'lanka', name: 'Lanka Dahan', sub: 'The golden city burns · spreading fire', build: buildLanka },
  { id: 'ayodhya', name: 'Ayodhya', sub: 'Palace courtyard at sunset', build: buildAyodhya },
];
