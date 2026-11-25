// Animates ONE flat drawing of the viking (docs/arte/puppet/viking-frente.png,
// on a green background) by cutting it into pieces (body, two legs, axe) and
// warping each piece per frame, the way a paper puppet moves.
//
//   node tools/make-puppet-sprites.mjs
//
// Output: public/sprites/viking_puppet_<anim>_<n>.png (128x128, feet at x=64, y=118)
// with the same names the Phaser game uses for the other modes (idle, walk, run,
// dash, jump, attack, attackCombo, attackOverhead, attackSpin, attackPlunge, fall, hurt).
// It is an experiment: the drawing is a front view, so walking is a bob and
// the axe swings from the belt.

import fs from 'fs';
import { decode, encode } from './png.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const g = decode(`${ROOT}docs/arte/puppet/viking-frente.png`);
const { w, h } = g;
const C = 128, AX = 64, AY = 118, S = 0.18, SS = 4;
const FOOT = [84, 283];
const ARC = S / 0.36; // slash sizes were tuned at a 0.36 scale

// ---- green background -> transparent
const d = new Uint8ClampedArray(w * h * 4);
for (let k = 0; k < w * h; k++) {
  const i = k * 4, r = g.data[i], gg = g.data[i + 1], b = g.data[i + 2];
  const gl = gg - Math.max(r, b);
  const a = gl > 30 ? Math.max(0, 1 - (gl - 30) / 50) : 1;
  d[i] = r; d[i + 1] = a > 0 && gl > 0 ? Math.min(gg, Math.max(r, b) + 2) : gg; d[i + 2] = b; d[i + 3] = Math.round(a * 255);
}
const lum = (i) => (d[i] + d[i + 1] + d[i + 2]) / 3;

// ---- pieces
const axe = new Uint8Array(w * h), legL = new Uint8Array(w * h), legR = new Uint8Array(w * h);
for (let y = 208; y <= 247; y++) for (let x = 100; x <= 126; x++) { const k = y * w + x, i = k * 4; if (d[i + 3] > 40 && lum(i) > 62) axe[k] = 1; }
{ const n = axe.slice(); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const k = y * w + x; if (!axe[k] && d[k * 4 + 3] > 40 && (axe[k - 1] || axe[k + 1] || axe[k - w] || axe[k + w]) && lum(k * 4) < 62 && x >= 97 && y >= 206) n[k] = 1; } axe.set(n); }
for (let y = 243; y < h; y++) for (let x = 62; x <= 140; x++) { const k = y * w + x; if (d[k * 4 + 3] < 20 || axe[k]) continue; (x < 101 ? legL : legR)[k] = 1; }
const mk = (mask, fill) => {
  const px = new Float32Array(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    const i = k * 4;
    if (mask(k)) { const a = d[i + 3] / 255; px[i] = d[i] * a; px[i + 1] = d[i + 1] * a; px[i + 2] = d[i + 2] * a; px[i + 3] = a; }
    else if (fill && fill(k)) { px[i] = 18; px[i + 1] = 14; px[i + 2] = 16; px[i + 3] = 1; } // dark: what was behind the axe
  }
  return px;
};
const upper = mk((k) => !axe[k] && !legL[k] && !legR[k], (k) => axe[k]);
const pL = mk((k) => legL[k]), pR = mk((k) => legR[k]), pAxe = mk((k) => axe[k]);
const sample = (px, x, y) => {
  const ix = Math.floor(x - 0.5), iy = Math.floor(y - 0.5), fx = x - 0.5 - ix, fy = y - 0.5 - iy, o = [0, 0, 0, 0];
  for (const [qx, qy, wt] of [[ix, iy, (1 - fx) * (1 - fy)], [ix + 1, iy, fx * (1 - fy)], [ix, iy + 1, (1 - fx) * fy], [ix + 1, iy + 1, fx * fy]]) {
    if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue; const i = (qy * w + qx) * 4; for (let c = 0; c < 4; c++) o[c] += px[i + c] * wt;
  }
  return o;
};
const rad = (deg) => (deg * Math.PI) / 180;

// P = pose: bob (px up), scx/scy (squash & stretch), rot (deg), lean (shear), sway (cape),
// liftL/liftR (legs up), axeRot (deg about the belt hook)
function render(P, slash) {
  const out = new Float32Array(C * C * 4);
  const inv = (sx0, sy0, extraLift = 0) => {
    let x = sx0, y = sy0 + P.bob + extraLift;
    x = FOOT[0] + (x - FOOT[0]) / P.scx; y = FOOT[1] + (y - FOOT[1]) / P.scy;
    const c = Math.cos(rad(-P.rot)), s = Math.sin(rad(-P.rot)), dx = x - FOOT[0], dy = y - FOOT[1];
    x = FOOT[0] + dx * c - dy * s; y = FOOT[1] + dx * s + dy * c;
    x -= P.lean * (FOOT[1] - y) / 200;
    const wl = Math.max(0, Math.min(1, (78 - x) / 22)) + Math.max(0, Math.min(1, (x - 132) / 22));
    x -= P.sway * wl * Math.pow(Math.max(0, (y - 120) / 160), 1.4);
    return [x, y];
  };
  const n2 = SS * SS;
  for (let Y = 0; Y < C; Y++) for (let X = 0; X < C; X++) {
    let ar = 0, ag = 0, ab = 0, aa = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = FOOT[0] + (X + (sx + 0.5) / SS - AX) / S, v = FOOT[1] + (Y + (sy + 0.5) / SS - AY) / S;
      let pr = 0, pg = 0, pb = 0, pa = 0;
      const over = (c) => { pr = c[0] + pr * (1 - c[3]); pg = c[1] + pg * (1 - c[3]); pb = c[2] + pb * (1 - c[3]); pa = c[3] + pa * (1 - c[3]); };
      let [x, y] = inv(u, v); over(sample(upper, x, y));
      [x, y] = inv(u, v, P.liftL); over(sample(pL, x, y));
      [x, y] = inv(u, v, P.liftR); over(sample(pR, x, y));
      [x, y] = inv(u, v);
      const pv = [107, 211], c2 = Math.cos(rad(-P.axeRot)), s2 = Math.sin(rad(-P.axeRot)), ddx = x - pv[0], ddy = y - pv[1];
      over(sample(pAxe, pv[0] + ddx * c2 - ddy * s2, pv[1] + ddx * s2 + ddy * c2));
      ar += pr; ag += pg; ab += pb; aa += pa;
    }
    const o = (Y * C + X) * 4; out[o] = ar / n2; out[o + 1] = ag / n2; out[o + 2] = ab / n2; out[o + 3] = aa / n2;
  }
  if (slash) { // white crescent of the axe swing
    const cx = AX + (107 - FOOT[0]) * S, cy = AY + (211 - FOOT[1]) * S;
    const [a0, a1, R, th] = slash;
    for (let Y = 0; Y < C; Y++) for (let X = 0; X < C; X++) {
      const dx = X - cx, dy = Y - cy, r = Math.hypot(dx, dy), an = (Math.atan2(dy, dx) * 180) / Math.PI;
      const t = (an - a0) / (a1 - a0); if (t < 0 || t > 1) continue;
      const k = Math.max(0, 1 - Math.abs(r - R * ARC) / (th * ARC * (0.3 + 0.7 * Math.sin(t * Math.PI)))); if (k <= 0) continue;
      const o = (Y * C + X) * 4, a = Math.min(1, k * 1.2);
      for (let c = 0; c < 3; c++) out[o + c] = out[o + c] * (1 - a) + 255 * a;
      out[o + 3] = Math.max(out[o + 3], a);
    }
  }
  return out;
}

// ---- poses
const base = { bob: 0, scx: 1, scy: 1, rot: 0, lean: 0, sway: 0, liftL: 0, liftR: 0, axeRot: 0 };
const ANIMS = {};
const anim = (name, n, fn, slashes = []) => { ANIMS[name] = { frames: Array.from({ length: n }, (_, i) => fn(i, n)), slashes }; };
const sinp = (i, n) => Math.sin((i / n) * Math.PI * 2);
anim('idle', 6, (i, n) => ({ ...base, scy: 1 + 0.014 * sinp(i, n), scx: 1 - 0.006 * sinp(i, n), sway: 2.5 * sinp(i + 1, n), lean: 1.2 * sinp(i, n) }));
anim('walk', 6, (i, n) => { const s = sinp(i, n); return { ...base, bob: 8.8 * Math.abs(s), lean: 6 * s, rot: 2.2 * s, sway: -6 * s, liftL: Math.max(0, s) * 22, liftR: Math.max(0, -s) * 22, axeRot: 6 * s }; });
anim('run', 6, (i, n) => { const s = sinp(i, n); return { ...base, bob: 14 * Math.abs(s), lean: 16, rot: 5 + 2 * s, sway: -14 - 5 * s, liftL: Math.max(0, s) * 40, liftR: Math.max(0, -s) * 40, axeRot: 14 + 8 * s }; });
anim('dash', 6, (i) => ({ ...base, scx: 1.06, lean: 24, rot: 9 + i, sway: -22, liftL: 30, liftR: 18, axeRot: 28 }));
const J = [[0.88, 1.1, 0], [1.12, 0.93, 26], [1.05, 0.98, 40], [1.06, 0.97, 36], [1.02, 1, 18], [0.85, 1.12, 0]];
anim('jump', 6, (i) => ({ ...base, scy: J[i][0], scx: J[i][1], liftL: J[i][2], liftR: J[i][2], sway: i > 0 && i < 5 ? -8 : 2, axeRot: i === 2 ? -12 : 0 })); // (the game lifts him in z)
const A1 = [[-60, 2, 4], [-130, 4, 8], [30, -4, 22], [90, -2, 14], [45, 0, 6], [0, 0, 0]];
anim('attack', 6, (i) => { const [ax, rot, lean] = A1[i]; return { ...base, axeRot: ax, rot, lean, sway: -lean * 0.6 }; }, [null, null, [-10, 115, 62, 7], [40, 130, 62, 9], null, null]);
const A2 = [[70, -2, -4], [110, -4, -8], [-30, 3, 20], [-110, 5, 12], [-50, 2, 4], [0, 0, 0]];
anim('attackCombo', 6, (i) => { const [ax, rot, lean] = A2[i]; return { ...base, axeRot: ax, rot, lean, sway: -lean * 0.6, scx: i === 2 ? 1.06 : 1 }; }, [null, null, [-140, 0, 60, 8], [-130, 20, 64, 9], null, null]);
const OH = [[-30, 1, 0, 0], [-100, 1.04, -4, -3], [-170, 1.08, -6, -5], [-175, 1.08, -6, -5], [25, 0.9, 12, 8], [60, 0.95, 8, 5]];
anim('attackOverhead', 6, (i) => { const [ax, scy, lean, rot] = OH[i]; return { ...base, axeRot: ax, scy, lean, rot, sway: -lean }; }, [null, null, null, [-170, -20, 58, 8], [-40, 80, 64, 9], null]);
const SP = [0, 60, 120, 180, 240, 300];
anim('attackSpin', 6, (i) => { const c = Math.cos(rad(SP[i])), sc = Math.sign(c || 1) * Math.max(0.28, Math.abs(c)); return { ...base, scx: sc, axeRot: SP[i] * 1.1, sway: 10 * Math.sin(rad(SP[i])), lean: 6 * Math.sin(rad(SP[i])), liftL: i % 2 ? 10 : 0 }; }, [null, [-180, 180, 56, 6], [-180, 180, 56, 8], [-180, 180, 56, 8], [-180, 180, 56, 6], null]);
anim('attackPlunge', 6, (i) => [
  { ...base, scy: 0.9, scx: 1.08 },
  { ...base, scy: 1.12, scx: 0.94, liftL: 24, liftR: 24, axeRot: -30 },
  { ...base, scy: 1.22, scx: 0.88, liftL: 30, liftR: 30, axeRot: 170 },
  { ...base, scy: 1.3, scx: 0.82, liftL: 20, liftR: 20, axeRot: 175 },
  { ...base, scy: 0.78, scx: 1.28, axeRot: 150 },
  { ...base, scy: 0.96, scx: 1.03, axeRot: 40 },
][i], [null, null, null, null, [-170, -10, 40, 7], null]);
anim('fall', 4, (i) => ({ ...base, rot: [-20, -55, -85, -90][i], lean: [-6, -2, 0, 0][i], bob: [0, 3, 0, -14][i], liftL: [0, 12, 8, 0][i], liftR: [0, 8, 8, 0][i], axeRot: [-15, -40, -60, -60][i], sway: 6 }));
anim('hurt', 2, (i) => ({ ...base, rot: -5 - 4 * i, lean: -10 - 6 * i, bob: 2, sway: 8, axeRot: -10 }));

fs.mkdirSync(`${ROOT}public/sprites`, { recursive: true });
let n = 0;
for (const [name, a] of Object.entries(ANIMS)) {
  a.frames.forEach((P, f) => {
    const px = render(P, a.slashes[f] || null), out = new Uint8ClampedArray(C * C * 4);
    for (let k = 0; k < C * C; k++) { const s = k * 4, al = px[s + 3]; if (al <= 0.003) continue; out[s] = Math.min(255, px[s] / al); out[s + 1] = Math.min(255, px[s + 1] / al); out[s + 2] = Math.min(255, px[s + 2] / al); out[s + 3] = Math.min(255, al * 255); }
    encode(`${ROOT}public/sprites/viking_puppet_${name}_${f}.png`, C, C, out); n++;
  });
}
console.log(`ok: ${n} quadros em public/sprites/viking_puppet_*`);
