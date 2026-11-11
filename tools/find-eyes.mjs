// Finds where the viking's eye is in every frame of the body animations, so
// the game can make it glow red in berserker fury (src/fury-fx.js).
//
//   node tools/find-eyes.mjs            -> writes public/assets/viking-eyes.json
//   node tools/find-eyes.mjs debug.png  -> also draws a check image (red dot = detected eye)
//
// The eye is a big, round, black pupil inside a pale (peach) face. Thin
// dark outlines are never thick enough to look like it, so we look for the
// thickest dark spot (distance transform of the dark pixels) that has face
// skin around it. Frames where no eye is visible (back turned, hidden by an
// effect) get `null`, and the game simply draws no eyes there.
//
// Output: { anim: [ { x, y, r } | null, ... ] }  (x, y, r in sheet pixels,
// relative to the frame's top-left corner).

import fs from 'fs';
import { decode, encode } from './png.mjs';

const ASSETS = new URL('../public/assets/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('viking-art.json', ASSETS), 'utf8'));
const { w, data } = decode(new URL('viking-art.png', ASSETS).pathname);
const C = meta.cell;

// every animation that draws the plain body (the fury look is layered on top)
const ANIMS = [
  'idle', 'walk', 'run', 'jump', 'attack', 'attackCombo', 'attackSpin', 'attackOverhead',
  'attackPlunge', 'throw', 'hurt', 'idleBare', 'walkBare', 'runBare', 'jumpBare',
];

const isDark = (r, g, b, a) => a > 200 && Math.max(r, g, b) < 58;
// the face is pale: peach in most frames, gray-white where the light hits it
// (attacks). Anything light and not orange (the beard) counts.
const isSkin = (r, g, b, a) => a > 200 && r > 150 && g > 120 && b > 105 && r >= g - 6 && g >= b - 12 && r - b < 110 && g > 0.62 * r;

function findEye(row, col) {
  const at = (x, y) => (y * w + x) * 4;
  const ox = col * C, oy = row * C;
  const dark = new Uint8Array(C * C), skin = new Uint8Array(C * C);
  for (let y = 0; y < C; y++) {
    for (let x = 0; x < C; x++) {
      const i = at(ox + x, oy + y);
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (isDark(r, g, b, a)) dark[y * C + x] = 1;
      if (isSkin(r, g, b, a)) skin[y * C + x] = 1;
    }
  }
  // distance from every dark pixel to the nearest non-dark pixel (two-pass chamfer)
  const d = new Float32Array(C * C);
  for (let i = 0; i < C * C; i++) d[i] = dark[i] ? 1e9 : 0;
  const relax = (x, y, nx, ny, wgt) => {
    if (nx < 0 || ny < 0 || nx >= C || ny >= C) return;
    const v = d[ny * C + nx] + wgt;
    if (v < d[y * C + x]) d[y * C + x] = v;
  };
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (dark[y * C + x]) {
    relax(x, y, x - 1, y, 1); relax(x, y, x, y - 1, 1); relax(x, y, x - 1, y - 1, 1.41); relax(x, y, x + 1, y - 1, 1.41);
  }
  for (let y = C - 1; y >= 0; y--) for (let x = C - 1; x >= 0; x--) if (dark[y * C + x]) {
    relax(x, y, x + 1, y, 1); relax(x, y, x, y + 1, 1); relax(x, y, x + 1, y + 1, 1.41); relax(x, y, x - 1, y + 1, 1.41);
  }
  // character height, to look for the eye only in the upper part. Only the
  // biggest connected shape counts (the body): stray specks and loose
  // slash arcs around it are ignored.
  const solid = new Uint8Array(C * C), seen = new Uint8Array(C * C);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (data[at(ox + x, oy + y) + 3] > 200) solid[y * C + x] = 1;
  let top = C, bottom = 0, bestArea = 0;
  for (let s0 = 0; s0 < C * C; s0++) {
    if (!solid[s0] || seen[s0]) continue;
    const st = [s0]; seen[s0] = 1;
    let area = 0, t = C, b = 0;
    while (st.length) {
      const i = st.pop(), x = i % C, y = (i / C) | 0;
      area++; if (y < t) t = y; if (y > b) b = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= C || ny >= C) continue;
        const j = ny * C + nx;
        if (solid[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
    }
    if (area > bestArea) { bestArea = area; top = t; bottom = b; }
  }
  if (bestArea < 1500) return null;

  let best = null;
  for (let y = 2; y < C - 2; y++) {
    for (let x = 2; x < C - 2; x++) {
      const v = d[y * C + x];
      if (v < 3 || v > 9) continue;
      // local maximum
      let peak = true;
      for (let dy = -2; dy <= 2 && peak; dy++) for (let dx = -2; dx <= 2; dx++) if (d[(y + dy) * C + x + dx] > v) { peak = false; break; }
      if (!peak) continue;
      if (y > top + (bottom - top) * 0.55) continue; // eyes are in the head, not the feet
      // face skin around it
      const R = Math.round(v * 2.6);
      let n = 0, s = 0;
      for (let yy = y - R; yy <= y + R; yy++) for (let xx = x - R; xx <= x + R; xx++) {
        if (xx < 0 || yy < 0 || xx >= C || yy >= C) continue;
        if ((xx - x) ** 2 + (yy - y) ** 2 > R * R) continue;
        n++; if (skin[yy * C + xx]) s++;
      }
      const skinFrac = s / n;
      if (skinFrac < 0.03) continue;
      const score = v * (0.4 + skinFrac);
      if (!best || score > best.score) best = { x, y, r: v, score };
    }
  }
  return best && { x: best.x, y: best.y, r: Math.round(best.r * 10) / 10 };
}

const eyes = {};
let found = 0, total = 0;
for (const name of ANIMS) {
  const a = meta.anims[name];
  if (!a) continue;
  // an eye is about 4–5 sheet pixels wide; bigger dark spots (axe heads,
  // black boots) were picked by mistake and are thrown away
  let list = [];
  for (let f = 0; f < a.frames; f++) {
    const e = findEye(a.row, f);
    list.push(e && e.r <= 5.6 ? e : null);
  }
  // ...and so are spots far from where the head is in the other frames
  const med = (v) => v.slice().sort((p, q) => p - q)[Math.floor(v.length / 2)];
  const good = list.filter(Boolean);
  if (good.length >= 3) {
    const mx = med(good.map((e) => e.x)), my = med(good.map((e) => e.y));
    list = list.map((e) => (e && Math.abs(e.x - mx) <= 26 && Math.abs(e.y - my) <= 22 ? e : null));
  }
  // a thrown-away frame between two good ones (a quick dive, for example)
  // gets a position blended from them; at the ends or in long gaps (the
  // spin, with his back turned) there is no eye
  const filled = list.map((e, i) => {
    if (e) return e;
    let p = i - 1, n = i + 1;
    while (p >= 0 && !list[p]) p--;
    while (n < list.length && !list[n]) n++;
    if (p < 0 || n >= list.length || n - p > 4) return null;
    const t = (i - p) / (n - p);
    return { x: Math.round(list[p].x + (list[n].x - list[p].x) * t), y: Math.round(list[p].y + (list[n].y - list[p].y) * t), r: list[p].r };
  });
  eyes[name] = filled;
  for (const e of filled) { total++; if (e) found++; }
}
fs.writeFileSync(new URL('viking-eyes.json', ASSETS), JSON.stringify(eyes) + '\n');
console.log(`olhos achados: ${found} de ${total} quadros`);
for (const [name, list] of Object.entries(eyes)) console.log(name.padEnd(16), list.map((e) => (e ? '●' : '·')).join(' '));

// optional check image: the frames with a red dot where the eye was found
const debugOut = process.argv[2];
if (debugOut) {
  const S = 1;
  const cols = 6, rows = Object.keys(eyes).length;
  const W = cols * C * S, H = rows * C * S;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([66, 72, 88, 255], i * 4);
  Object.entries(eyes).forEach(([name, list], r) => {
    const a = meta.anims[name];
    list.forEach((e, f) => {
      for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
        const si = ((a.row * C + y) * w + f * C + x) * 4, al = data[si + 3] / 255;
        if (!al) continue;
        const di = ((r * C + y) * W + f * C + x) * 4;
        for (let k = 0; k < 3; k++) img[di + k] = img[di + k] * (1 - al) + data[si + k] * al;
      }
      if (e) {
        const rr = Math.max(3, Math.round(e.r));
        for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) {
          if (xx * xx + yy * yy > rr * rr) continue;
          const di = (((r * C) + e.y + yy) * W + f * C + e.x + xx) * 4;
          img.set([255, 40, 30, 255], di);
        }
      }
    });
  });
  encode(debugOut, W, H, img);
  console.log('imagem de conferência:', debugOut);
}
