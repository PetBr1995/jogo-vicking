// Makes the red version of the axe-slash arcs for the berserker fury.
//
//   node tools/make-fury-arcs.mjs
//
// The slash arcs of the Base attack frames are pure white (they are painted
// into the frames). In fury the game draws this red copy on top of them.
// For every attack row it finds the white pixels, measures how far each one
// is from the edge of the arc, and paints dark red at the edge, red, then
// orange-red, and a light hot core in the middle: the same "flame" colors as
// the rest of the fury fire (src/fury-fx.js).
//
// Output: public/assets/viking-fury-arcs.png (+ .json)
//   one row per animation, one column per frame, same cell size as the sheet.

import fs from 'fs';
import { decode, encode } from './png.mjs';

const ASSETS = new URL('../public/assets/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('viking-art.json', ASSETS), 'utf8'));
const { w, data } = decode(new URL('viking-art.png', ASSETS).pathname);
const C = meta.cell;

// the attacks that have a painted slash
const ANIMS = ['attack', 'attackCombo', 'attackSpin', 'attackOverhead', 'attackPlunge', 'throw'];
const COLS = 6;

// dark red edge → red → orange-red → hot core (distance from the edge, sheet px)
const BANDS = [
  [1.6, [150, 22, 16]],
  [3.4, [222, 44, 26]],
  [5.6, [255, 104, 52]],
  [Infinity, [255, 206, 168]],
];

const sheet = new Uint8ClampedArray(COLS * C * ANIMS.length * C * 4);
const W = COLS * C;
let painted = 0;

ANIMS.forEach((name, r) => {
  const a = meta.anims[name];
  for (let f = 0; f < a.frames; f++) {
    const mask = new Uint8Array(C * C), alpha = new Uint8Array(C * C);
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const i = ((a.row * C + y) * w + f * C + x) * 4;
        const al = data[i + 3];
        // white, or the soft edge of white (very light, no color)
        if (al > 40 && Math.min(data[i], data[i + 1], data[i + 2]) >= 236) { mask[y * C + x] = 1; alpha[y * C + x] = al; }
      }
    }
    // distance to the nearest non-white pixel
    const d = new Float32Array(C * C);
    for (let i = 0; i < C * C; i++) d[i] = mask[i] ? 1e9 : 0;
    const relax = (x, y, nx, ny, wg) => {
      const v = nx < 0 || ny < 0 || nx >= C || ny >= C ? wg : d[ny * C + nx] + wg;
      if (v < d[y * C + x]) d[y * C + x] = v;
    };
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (mask[y * C + x]) {
      relax(x, y, x - 1, y, 1); relax(x, y, x, y - 1, 1); relax(x, y, x - 1, y - 1, 1.41); relax(x, y, x + 1, y - 1, 1.41);
    }
    for (let y = C - 1; y >= 0; y--) for (let x = C - 1; x >= 0; x--) if (mask[y * C + x]) {
      relax(x, y, x + 1, y, 1); relax(x, y, x, y + 1, 1); relax(x, y, x + 1, y + 1, 1.41); relax(x, y, x - 1, y + 1, 1.41);
    }
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const k = y * C + x;
        if (!mask[k]) continue;
        const col = BANDS.find(([lim]) => d[k] < lim)[1];
        const o = ((r * C + y) * W + f * C + x) * 4;
        sheet[o] = col[0]; sheet[o + 1] = col[1]; sheet[o + 2] = col[2]; sheet[o + 3] = Math.min(255, alpha[k] * 1.4);
        painted++;
      }
    }
  }
});

encode(new URL('viking-fury-arcs.png', ASSETS).pathname, W, C * ANIMS.length, sheet);
fs.writeFileSync(new URL('viking-fury-arcs.json', ASSETS), JSON.stringify({
  cell: C, rows: Object.fromEntries(ANIMS.map((n, i) => [n, i])),
}) + '\n');
console.log(`ok: viking-fury-arcs.png (${W}x${C * ANIMS.length}), ${painted} pixels de arco pintados`);
