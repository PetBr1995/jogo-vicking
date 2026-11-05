// Makes the drawing guides for painted art (for an artist or an image AI),
// and the description the game needs to use that art.
//
//   node tools/make-guides.mjs
//
// For each character:
//   docs/arte/guia-<name>.png   the exact layout of the sheet to paint:
//       128x128 frames, one row per move, ground line (magenta), anchor
//       point (cyan), the impact frame framed in red, and the approved poses
//       as light gray shapes to paint over. Row name in the first frame,
//       frame number in each one.
//   public/assets/<name>-art.json  what the game needs to use
//       public/assets/<name>-art.png once it exists (same layout, transparent
//       background, no guides).
//
// The poses come from the current generated sheets (viking.png, saxon.png),
// so the painted moves keep the approved timing and footing.

import fs from 'fs';
import { decode, encode } from './png.mjs';

const ART = 2;            // painted frames are 2x the design size
const CELL = 64 * ART;    // 128
const ASSETS = new URL('../public/assets/', import.meta.url);
const DOCS = new URL('../docs/arte/', import.meta.url);

// ---- a tiny 3x5 pixel font for the labels -----------------------------------

const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', G: '011100101101011', I: '111010010010111', L: '100100100100111',
  N: '110101101101101', M: '101111111101101', H: '101101111101101', Z: '111001010100111', O: '010101101101010', P: '110101110100100', Q: '010101101110011',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', ' ': '000000000000000', '-': '000000111000000',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
};

// ---- the layout of each character's painted sheet ----------------------------

// src: [row, frames] in the generated sheet (or another sheet) used as the
// gray reference; null = new move, no reference (empty frames)
const CHARACTERS = {
  viking: {
    base: 'viking',
    rows: [
      { name: 'idle', label: 'PARADO', frames: 4, src: ['viking', 0] },
      { name: 'walk', label: 'ANDAR', frames: 12, src: ['viking', 1] },
      { name: 'run', label: 'CORRER', frames: 12, src: ['viking', 2] },
      { name: 'jump', label: 'PULAR', frames: 6, src: ['viking', 3] },
      { name: 'attack', label: 'ATACAR', frames: 7, src: ['viking', 4], hit: 4 },
      { name: 'hurt', label: 'LEVOU GOLPE', frames: 2, src: null },
      { name: 'fall', label: 'QUEDA', frames: 4, src: ['saxon', 3] },
      { name: 'throw', label: 'ARREMESSO', frames: 6, src: ['viking', 5], hit: 3 },
      { name: 'idleBare', label: 'PARADO SEM', frames: 4, src: ['viking', 6] },
      { name: 'walkBare', label: 'ANDAR SEM', frames: 12, src: ['viking', 7] },
      { name: 'runBare', label: 'CORRER SEM', frames: 12, src: ['viking', 8] },
      { name: 'jumpBare', label: 'PULAR SEM', frames: 6, src: ['viking', 9] },
      { name: 'axe', label: 'MACHADO', frames: 1, src: ['viking', 10], pivot: true },
    ],
  },
  saxon: {
    base: 'saxon',
    rows: [
      { name: 'idle', label: 'PARADO', frames: 4, src: ['saxon', 0] },
      { name: 'walk', label: 'ANDAR', frames: 12, src: ['saxon', 1] },
      { name: 'attack', label: 'ESTOCADA', frames: 6, src: ['saxon', 2], hit: 4 },
      { name: 'hurt', label: 'LEVOU GOLPE', frames: 2, src: null },
      { name: 'fall', label: 'QUEDA', frames: 4, src: ['saxon', 3] },
    ],
  },
};

const sheets = {};
const sheetOf = (name) => (sheets[name] ??= decode(new URL(`${name}.png`, ASSETS).pathname));
const metaOf = (name) => JSON.parse(fs.readFileSync(new URL(`${name}.json`, ASSETS), 'utf8'));

fs.mkdirSync(DOCS, { recursive: true });

for (const [name, ch] of Object.entries(CHARACTERS)) {
  const base = metaOf(ch.base); // generated: 64x64 design cells
  const cols = Math.max(...ch.rows.map((r) => r.frames));
  const W = cols * CELL, H = ch.rows.length * CELL;
  const img = new Uint8ClampedArray(W * H * 4).fill(255);
  const put = (x, y, rgb, a = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) img[i + k] = Math.round(img[i + k] * (1 - a) + rgb[k] * a);
  };
  const text = (str, x, y, size, rgb) => {
    [...str].forEach((ch, n) => {
      const g = FONT[ch] ?? FONT[' '];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        if (g[j * 3 + i] !== '1') continue;
        for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) put(x + (n * 4 + i) * size + xx, y + j * size + yy, rgb);
      }
    });
  };

  const anchorX = (base.anchor.x) * ART, ground = base.anchor.y * ART;
  ch.rows.forEach((row, r) => {
    for (let c = 0; c < row.frames; c++) {
      const ox = c * CELL, oy = r * CELL;
      // gray reference pose, enlarged
      if (row.src) {
        const [srcName, srcRow] = row.src;
        const s = sheetOf(srcName), sm = metaOf(srcName), sc = sm.cell;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const sx = c * sc + Math.floor(x / ART), sy = srcRow * sc + Math.floor(y / ART);
          if (s.data[(sy * s.w + sx) * 4 + 3]) put(ox + x, oy + y, [150, 150, 160], 0.45);
        }
      }
      // ground line and anchor point (for the loose axe: the point it spins around)
      if (row.pivot) {
        const pv = base.anims[row.name].pivot;
        for (let k = -6; k <= 6; k++) {
          put(ox + pv.x * ART + k, oy + pv.y * ART, [0, 190, 220]);
          put(ox + pv.x * ART, oy + pv.y * ART + k, [0, 190, 220]);
        }
      } else {
        for (let x = 0; x < CELL; x++) put(ox + x, oy + ground, [230, 40, 200], 0.9);
        for (let k = -6; k <= 6; k++) {
          put(ox + anchorX + k, oy + ground, [0, 190, 220]);
          put(ox + anchorX, oy + ground + k, [0, 190, 220]);
        }
      }
      // frame border (red on the impact frame), frame number
      const hit = row.hit === c;
      const border = hit ? [220, 30, 30] : [200, 200, 210];
      for (let k = 0; k < CELL; k++) {
        for (let w = 0; w < (hit ? 3 : 1); w++) {
          put(ox + k, oy + w, border); put(ox + k, oy + CELL - 1 - w, border);
          put(ox + w, oy + k, border); put(ox + CELL - 1 - w, oy + k, border);
        }
      }
      text(String(c + 1), ox + CELL - 6 - String(c + 1).length * 8, oy + 5, 2, [120, 120, 130]);
      if (c === 0) text(row.label, ox + 5, oy + 5, 2, [40, 40, 50]);
    }
  });
  encode(new URL(`guia-${name}.png`, DOCS).pathname, W, H, img);

  // what the game needs to use the painted sheet (same moves and timing)
  const anims = {};
  ch.rows.forEach((row, r) => {
    const gen = base.anims[row.name];
    const a = { row: r, frames: row.frames, loop: gen?.loop ?? false };
    if (gen?.fps) a.fps = gen.fps;
    if (gen?.stride) a.stride = Math.round(gen.stride * ART * 10) / 10;
    if (gen?.steps) a.steps = gen.steps;
    if (gen?.durations) a.durations = gen.durations;
    if (gen?.hitFrame !== undefined) a.hitFrame = gen.hitFrame;
    if (row.name === 'hurt') a.durations = [0.12, 0.18];
    if (row.name === 'fall') a.durations = gen?.durations ?? [0.12, 0.07, 0.07];
    if (gen?.pivot) a.pivot = { x: gen.pivot.x * ART, y: gen.pivot.y * ART };
    anims[row.name] = a;
  });
  const meta = { cell: CELL, detail: ART, anchor: { x: anchorX, y: ground }, anims };
  fs.writeFileSync(new URL(`${name}-art.json`, ASSETS), JSON.stringify(meta, null, 2) + '\n');
  console.log(`ok: docs/arte/guia-${name}.png ${W}x${H} · public/assets/${name}-art.json`);
}
