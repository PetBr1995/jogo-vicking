// Shared pieces for drawing characters in pixel art (used by make-viking.mjs
// and make-enemy.mjs): shapes, the frame buffer with outline and shading,
// the legs and the walk cycle, and writing the sprite sheet.
//
// Every frame is a CELL x CELL square with the soles on the GROUND line and
// the hips at HIP_X, so the game never has to cut anything out.

import fs from 'fs';
import { encode } from './png.mjs';

export const CELL = 64;
export const GROUND = 60;  // y of the soles inside the cell
export const HIP_X = 30;   // x of the hips inside the cell (anchor)
const OUT = new URL('../public/assets/', import.meta.url);

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// limbs on the far side are drawn darker, for depth
export const far = (pal) => pal.map((c) => c.map((v) => Math.round(v * 0.72)));
export const rad = (d) => (d * Math.PI) / 180;

// ---- shapes (tested at pixel centers) --------------------------------------

export const capsule = (x1, y1, x2, y2, r) => (x, y) => {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= r;
};
export const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
export const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
export const poly = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
export const union = (...fs) => (x, y) => fs.some((f) => f(x, y));
export const clip = (f, g) => (x, y) => f(x, y) && g(x, y);
export const rotate = (pts, ox, oy, a) => pts.map(([x, y]) => [
  ox + (x - ox) * Math.cos(a) - (y - oy) * Math.sin(a),
  oy + (x - ox) * Math.sin(a) + (y - oy) * Math.cos(a),
]);

// ---- a frame buffer --------------------------------------------------------

export class Frame {
  /** @param line outline color [r, g, b] */
  constructor(line) {
    this.line = line;
    this.px = new Uint8ClampedArray(CELL * CELL * 4);
  }

  set(x, y, c) {
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
    const i = (y * CELL + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = 255;
  }

  // a filled part with its own outline, light from the top-left
  part(shape, [fill, shade, light], { outline = true } = {}) {
    const m = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) m[y * CELL + x] = shape(x + 0.5, y + 0.5) ? 1 : 0;
    }
    const at = (x, y) => x >= 0 && y >= 0 && x < CELL && y < CELL && m[y * CELL + x];
    const edge = (x, y) => at(x, y) && !(at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1));
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        if (!at(x, y)) continue;
        if (outline && edge(x, y)) this.set(x, y, this.line);
        else if (edge(x + 1, y) || edge(x, y + 1) || !at(x + 1, y + 1)) this.set(x, y, shade);
        else if ((edge(x - 1, y) || edge(x, y - 1)) && !edge(x + 1, y + 1)) this.set(x, y, light);
        else this.set(x, y, fill);
      }
    }
  }

  dot(x, y, c) { this.set(Math.round(x - 0.5), Math.round(y - 0.5), c); }
}

// ---- legs and arms (same proportions for every character, so they all
// share the approved walk) ---------------------------------------------------

export const THIGH = 8.5, SHIN = 8, UPPER_ARM = 6, FOREARM = 5.5;

// leg from the hip: thigh angle (deg, + = forward) and knee bend (deg)
export function legPoints(hx, hy, thigh, knee) {
  const a = rad(thigh), b = rad(thigh - knee);
  const kx = hx + Math.sin(a) * THIGH, ky = hy + Math.cos(a) * THIGH;
  const ax = kx + Math.sin(b) * SHIN, ay = ky + Math.cos(b) * SHIN;
  // foot tilt: toes drop when the foot is lifted behind, rise on heel strike
  const shinBack = -(thigh - knee);
  let tilt = shinBack > 15 ? (shinBack - 15) * 0.9 : 0;
  if (thigh > 18 && knee < 15) tilt = -12;
  const boot = rotate([[ax - 2.5, ay - 1.5], [ax + 3, ay - 1.5], [ax + 5, ay + 0.5], [ax + 5, ay + 2.5], [ax - 2.5, ay + 2.5]], ax, ay, rad(tilt));
  return { kx, ky, ax, ay, boot, bottom: Math.max(...boot.map((p) => p[1])) };
}

// where the hips go so the lowest foot stands on the ground (the body bob
// comes for free); `air` lifts it, for the moment both feet are off the ground
export function hipsFor(pose) {
  const LF = legPoints(0, 0, ...pose.front), LB = legPoints(0, 0, ...pose.back);
  return { hx: HIP_X + 0.5, hy: GROUND - Math.max(LF.bottom, LB.bottom) - 0.01 - (pose.air || 0) };
}

export function armPoints(sx, sy, upper, elbow) {
  const a = rad(upper), b = rad(upper + elbow);
  const ex = sx + Math.sin(a) * UPPER_ARM, ey = sy + Math.cos(a) * UPPER_ARM;
  return { ex, ey, hx: ex + Math.sin(b) * FOREARM, hy: ey + Math.cos(b) * FOREARM };
}

// ---- animation helpers -----------------------------------------------------

// smooth loop through key values (Catmull-Rom, wraps around)
export function loopKeys(keys, t) {
  const n = keys.length, p = t * n, i = Math.floor(p), u = p - i;
  const k = (j) => keys[((j % n) + n) % n];
  const cr = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return k(i).map((_, j) => cr(k(i - 1)[j], k(i)[j], k(i + 1)[j], k(i + 2)[j]));
}

// walk cycle of ONE leg, 8 keys: [thigh, knee]
//   0 heel strike · 1 weight down · 2 passing (support) · 3 push
//   4 toe off · 5 lift · 6 passing (swing) · 7 reach
export const LEG = [[24, 4], [16, 18], [2, 6], [-12, 4], [-24, 14], [-14, 48], [8, 58], [24, 24]];
export const WALK_FRAMES = 12;

// legs of each walk frame: { t, front, back }
export const walkLegs = () => Array.from({ length: WALK_FRAMES }, (_, i) => {
  const t = i / WALK_FRAMES;
  return { t, front: loopKeys(LEG, t), back: loopKeys(LEG, t + 0.5) };
});

// how far the body moves in one full walk cycle (px), so the planted foot
// doesn't slide: measured from the foot on the ground
export function strideOf(poses) {
  let dist = 0;
  for (let i = 0; i < poses.length; i++) {
    const a = poses[i], b = poses[(i + 1) % poses.length];
    const pa = { f: legPoints(0, 0, ...a.front), b: legPoints(0, 0, ...a.back) };
    const pb = { f: legPoints(0, 0, ...b.front), b: legPoints(0, 0, ...b.back) };
    const planted = pa.f.bottom >= pa.b.bottom ? 'f' : 'b';
    const off = planted === 'f' ? 1.5 : -1.5;
    dist += (pa[planted].ax + off) - (pb[planted].ax + off);
  }
  return Math.round(dist * 10) / 10;
}

// run: part of the time both feet are in the air, so only the frames with a
// foot on the ground count. The body must move at the same speed that foot
// slides back; that speed times the whole cycle is the stride.
export function runStrideOf(poses) {
  let sum = 0, n = 0;
  for (let i = 0; i < poses.length; i++) {
    const a = poses[i], b = poses[(i + 1) % poses.length];
    if (a.air > 0.3) continue; // flying
    const F = legPoints(0, 0, ...a.front), B = legPoints(0, 0, ...a.back);
    const leg = F.bottom >= B.bottom ? 'front' : 'back';
    sum += legPoints(0, 0, ...a[leg]).ax - legPoints(0, 0, ...b[leg]).ax;
    n++;
  }
  return Math.round((sum / n) * poses.length * 10) / 10;
}

// ---- sheet -----------------------------------------------------------------

/**
 * Draws every pose and saves public/assets/<name>.png + <name>.json.
 * @param rows  [poses of row 0, poses of row 1, ...]
 * @param draw  pose -> Frame
 * @param anims animation info for the game (row, frames, stride...)
 */
export function writeSheet(name, rows, draw, anims) {
  const cols = Math.max(...rows.map((r) => r.length));
  const W = cols * CELL, H = rows.length * CELL;
  const sheet = new Uint8ClampedArray(W * H * 4);
  rows.forEach((poses, r) => poses.forEach((pose, c) => {
    const f = draw(pose);
    for (let y = 0; y < CELL; y++) {
      sheet.set(f.px.subarray(y * CELL * 4, (y + 1) * CELL * 4), ((r * CELL + y) * W + c * CELL) * 4);
    }
  }));
  fs.mkdirSync(OUT, { recursive: true });
  encode(new URL(`${name}.png`, OUT).pathname, W, H, sheet);
  const meta = { cell: CELL, anchor: { x: HIP_X + 1, y: GROUND }, anims };
  fs.writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify(meta, null, 2) + '\n');
  console.log(`ok: public/assets/${name}.png`, `${W}x${H}`, JSON.stringify(anims));
}
