// Turns a character concept sheet (5 rows x 6 columns on a dark navy/purple
// background, docs/arte/personagens/<name>/modelo.png) into a game sheet
// like saxon-art.png: background removed, frames cut at the empty gaps
// between them, scaled to the right size and aligned so the feet sit on the
// sheet anchor.
//
//   node tools/make-enemy-sheet.mjs mago|templario|fada|all [preview.png]
//
// The concept sheets have no "hurt" or "fall" rows, so those are made here
// from the idle frame: tilted back a little (hurt) and falling backwards
// until he lies flat (fall). Replace them when the final art has them.
//
// Output: public/assets/<name>-art.png + <name>-art.json (same format as saxon-art.json)

import fs from 'fs';
import { decode, encode } from './png.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const C = 224, AX = 112, AY = 196, NC = 6, NR = 5;

// srcRows: which concept row is each move. height: how tall (cell px) the
// standing character should be. hit: the attack frame that does the damage.
const CHARS = {
  mago: {
    height: 104,
    srcRows: { idle: 0, walk: 1, run: 2, attack: 4 },
    stride: { walk: 48, run: 64 },
    attack: { hitFrame: 2, durations: [0.16, 0.18, 0.16, 0.14, 0.14, 0.2] },
  },
  templario: {
    height: 108,
    srcRows: { idle: 0, walk: 1, run: 2, attack: 4 },
    stride: { walk: 42, run: 56 },
    attack: { hitFrame: 3, durations: [0.18, 0.18, 0.12, 0.14, 0.16, 0.22] },
  },
  fada: {
    height: 96,
    srcRows: { idle: 0, walk: 1, run: 2, attack: 4 },
    stride: { walk: 70, run: 90 },
    attack: { hitFrame: 2, durations: [0.1, 0.12, 0.12, 0.14, 0.12, 0.16] },
  },
};

function build(name, previewPath) {
  const cfg = CHARS[name];
  const g = decode(`${ROOT}docs/arte/personagens/${name}/modelo.png`);
  const { w, h, data: d } = g;

  // ---- background: dark, bluish pixels connected to the border
  const bgLike = (k) => { const i = k * 4, r = d[i], gg = d[i + 1], b = d[i + 2]; return b - r >= 8 && b >= gg && Math.max(r, gg, b) < 128; };
  const R = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const k = st.pop(); if (R[k] || !bgLike(k)) continue; R[k] = 1;
    const x = k % w, y = (k / w) | 0;
    if (x > 0) st.push(k - 1); if (x < w - 1) st.push(k + 1); if (y > 0) st.push(k - w); if (y < h - 1) st.push(k + w);
  }
  // local background color (average of the nearby background pixels)
  const sat = [0, 1, 2, 3].map(() => new Float64Array((w + 1) * (h + 1)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, i = k * 4, wv = R[k];
    const vals = [d[i] * wv, d[i + 1] * wv, d[i + 2] * wv, wv];
    for (let c = 0; c < 4; c++) sat[c][(y + 1) * (w + 1) + x + 1] = vals[c] + sat[c][y * (w + 1) + x + 1] + sat[c][(y + 1) * (w + 1) + x] - sat[c][y * (w + 1) + x];
  }
  const bgAt = (x, y) => {
    const r = 22, x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    const q = (c) => sat[c][y1 * (w + 1) + x1] - sat[c][y0 * (w + 1) + x1] - sat[c][y1 * (w + 1) + x0] + sat[c][y0 * (w + 1) + x0];
    const n = q(3) || 1; return [q(0) / n, q(1) / n, q(2) / n];
  };
  // distance (px) from the background, up to 12
  const nearD = new Uint8Array(w * h); let near = R.slice();
  for (let it = 1; it <= 12; it++) {
    const nx = near.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const k = y * w + x; if (!near[k] && (near[k - 1] || near[k + 1] || near[k - w] || near[k + w])) { nx[k] = 1; nearD[k] = it; } }
    near = nx;
  }
  const A = new Float32Array(w * h), col = new Float32Array(w * h * 3);
  for (let k = 0; k < w * h; k++) {
    const i = k * 4; let a = 1, c = [d[i], d[i + 1], d[i + 2]];
    if (R[k]) a = 0;
    else if (nearD[k] > 0) { // soft glows over the background (sparkles, magic): see-through
      const bg = bgAt(k % w, (k / w) | 0);
      const ex = Math.max(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]);
      if (ex > 14 && Math.max(...c) > Math.max(...bg) + 24) {
        a = Math.min(1, Math.pow(ex / 175, 0.8));
        if (a > 0.02) c = c.map((v, j) => Math.max(0, Math.min(255, (v - bg[j] * (1 - a)) / a)));
      }
    }
    A[k] = a; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }

  // ---- rows: cut at the emptiest horizontal lines near h/5, 2h/5...
  const rowOcc = new Float32Array(h);
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += A[y * w + x] > 0.5 ? 1 : 0; rowOcc[y] = c; }
  const rcuts = [0];
  for (let k = 1; k < NR; k++) {
    let best = Math.round((k * h) / NR), bv = 1e9;
    for (let y = Math.round((k * h) / NR - 32); y <= Math.round((k * h) / NR + 32); y++) {
      let v = 0; for (let q = -2; q <= 2; q++) v += rowOcc[y + q]; v += Math.abs(y - (k * h) / NR) * 1.2;
      if (v < bv) { bv = v; best = y; }
    }
    rcuts.push(best);
  }
  rcuts.push(h);

  // ---- per concept row: columns, cleaned alpha per frame
  const frames = []; // frames[row][f] = { AF, y0, y1, x0, x1, top, bottom, cx }
  for (let r = 0; r < NR; r++) {
    const y0 = rcuts[r], y1 = rcuts[r + 1];
    const colOcc = new Float32Array(w);
    for (let x = 0; x < w; x++) { let c = 0; for (let y = y0; y < y1; y++) c += A[y * w + x]; colOcc[x] = c; }
    const cuts = [0];
    for (let k = 1; k < NC; k++) {
      let best = Math.round((k * w) / NC), bv = 1e9;
      for (let x = Math.round((k * w) / NC - 34); x <= Math.round((k * w) / NC + 34); x++) {
        let v = 0; for (let q = -2; q <= 2; q++) v += colOcc[x + q]; v += Math.abs(x - (k * w) / NC) * 0.6;
        if (v < bv) { bv = v; best = x; }
      }
      cuts.push(best);
    }
    cuts.push(w);
    const row = [];
    for (let f = 0; f < NC; f++) {
      const x0 = cuts[f], x1 = cuts[f + 1], af = new Float32Array(w * h);
      const lab = new Int32Array(w * h), comps = [];
      for (let s0 = y0 * w; s0 < y1 * w; s0++) {
        const sx0 = s0 % w; if (sx0 < x0 || sx0 >= x1 || A[s0] < 0.04 || lab[s0]) continue;
        const id = comps.length + 1, stk = [s0]; lab[s0] = id;
        let area = 0, touches = false, nearCut = false, solid = 0;
        while (stk.length) {
          const k = stk.pop(); area++; if (A[k] > 0.9) solid++;
          const x = k % w, y = (k / w) | 0;
          if ((x === x0 && f > 0) || (x === x1 - 1 && f < NC - 1)) touches = true;
          if ((f > 0 && x - x0 < 30) || (f < NC - 1 && x1 - 1 - x < 30)) nearCut = true;
          for (const q of [x > x0 ? k - 1 : -1, x < x1 - 1 ? k + 1 : -1, y > y0 ? k - w : -1, y < y1 - 1 ? k + w : -1]) if (q >= 0 && A[q] >= 0.04 && !lab[q]) { lab[q] = id; stk.push(q); }
        }
        comps.push({ id, area, solid, touches: touches || (nearCut && area < 500) });
      }
      const big = comps.reduce((m, c) => (c.solid > (m?.solid || 0) ? c : m), null);
      const keep = new Set(comps.filter((c) => c === big || !c.touches).map((c) => c.id));
      let top = h, bottom = 0, sx = 0, sn = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const k = y * w + x; if (!lab[k] || !keep.has(lab[k])) continue;
        let fade = 1;
        if (f > 0) fade = Math.min(fade, (x - x0) / 8);
        if (f < NC - 1) fade = Math.min(fade, (x1 - 1 - x) / 8);
        af[k] = A[k] * Math.max(0, Math.min(1, fade));
        if (lab[k] === big?.id && A[k] > 0.9) { if (y < top) top = y; if (y > bottom) bottom = y; sx += x; sn++; }
      }
      row.push({ af, x0, x1, y0, y1, top, bottom, cx: sn ? sx / sn : (x0 + x1) / 2 });
    }
    frames.push(row);
  }

  // ---- scale: the standing character (idle row) gets the wanted height
  const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const idleRow = cfg.srcRows.idle;
  const heights = frames[idleRow].map((f) => f.bottom - f.top);
  const SCALE = cfg.height / med(heights);

  // ---- render game cells
  const MOVES = ['idle', 'walk', 'run', 'attack'];
  const OUT_ROWS = { idle: 0, walk: 1, run: 2, attack: 3, hurt: 4, fall: 5 };
  const W = C * NC, H = C * 6, out = new Uint8ClampedArray(W * H * 4);
  const cell = (move, f) => { // renders one frame into a Float32 premultiplied cell
    const fr = frames[cfg.srcRows[move]][f];
    const base = med(frames[cfg.srcRows[move]].map((q) => q.bottom));
    const refOf = (q, i) => (i + 0.5) * (w / NC);
    const cx = refOf(null, f) + med(frames[cfg.srcRows[move]].map((q, i) => q.cx - refOf(q, i))); // the body stays put, like the feet
    const px = new Float32Array(C * C * 4);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      let pa = 0, pr = 0, pg = 0, pb = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const u = cx + (x + (sx + 0.5) / 2 - AX) / SCALE, v = base + (y + (sy + 0.5) / 2 - AY) / SCALE;
        const ix = Math.floor(u), iy = Math.floor(v);
        if (ix < fr.x0 || ix >= fr.x1 || iy < fr.y0 || iy >= fr.y1) continue;
        const k = iy * w + ix, a = fr.af[k];
        pa += a; pr += col[k * 3] * a; pg += col[k * 3 + 1] * a; pb += col[k * 3 + 2] * a;
      }
      const o = (y * C + x) * 4; px[o] = pr / 4; px[o + 1] = pg / 4; px[o + 2] = pb / 4; px[o + 3] = pa / 4; // premultiplied
    }
    return px;
  };
  const put = (px, row, f) => {
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const s = (y * C + x) * 4, a = px[s + 3]; if (a <= 0.002) continue;
      const o = ((row * C + y) * W + f * C + x) * 4;
      out[o] = Math.min(255, px[s] / a); out[o + 1] = Math.min(255, px[s + 1] / a); out[o + 2] = Math.min(255, px[s + 2] / a); out[o + 3] = Math.min(255, a * 255);
    }
  };
  const idle0 = cell('idle', 0);
  for (const mv of MOVES) for (let f = 0; f < NC; f++) put(f === 0 && mv === 'idle' ? idle0 : cell(mv, f), OUT_ROWS[mv], f);
  // tilt the standing frame about the feet: hurt (a little) and fall (all the way down)
  const tilt = (deg, dx, dy) => {
    const th = (deg * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th), px = new Float32Array(C * C * 4);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const X = x + 0.5 - AX - dx, Y = y + 0.5 - AY - dy; // inverse rotation
      const u = X * cs + Y * sn + AX - 0.5, v = -X * sn + Y * cs + AY - 0.5;
      const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
      if (ix < -1 || iy < -1 || ix >= C || iy >= C) continue;
      const o = (y * C + x) * 4;
      for (const [qx, qy, wt] of [[ix, iy, (1 - fx) * (1 - fy)], [ix + 1, iy, fx * (1 - fy)], [ix, iy + 1, (1 - fx) * fy], [ix + 1, iy + 1, fx * fy]]) {
        if (qx < 0 || qy < 0 || qx >= C || qy >= C) continue;
        const s = (qy * C + qx) * 4; for (let c = 0; c < 4; c++) px[o + c] += idle0[s + c] * wt;
      }
    }
    return px;
  };
  [[-6, -3, 0], [-11, -6, 0]].forEach(([a, dx, dy], f) => put(tilt(a, dx, dy), OUT_ROWS.hurt, f));
  [[-14, -2, 0], [-38, 2, -3], [-65, 10, -10], [-86, 22, -20], [-90, 26, -22]].forEach(([a, dx, dy], f) => put(tilt(a, dx, dy), OUT_ROWS.fall, f));

  // no frame may touch the edge of its cell (a cut effect)
  for (const [mv, r] of Object.entries(OUT_ROWS)) for (let f = 0; f < NC; f++) {
    let hit = 0;
    for (let t = 0; t < C; t++) for (const [x, y] of [[0, t], [C - 1, t], [t, 0], [t, C - 1]]) if (out[((r * C + y) * W + f * C + x) * 4 + 3] > 12) hit++;
    if (hit) console.log(`ATENÇÃO: ${name} ${mv} quadro ${f + 1} encosta na borda (${hit} px)`);
  }
  encode(`${ROOT}public/assets/${name}-art.png`, W, H, out);
  const anims = {
    idle: { row: 0, frames: 6, loop: true, fps: 6 },
    walk: { row: 1, frames: 6, loop: true, stride: cfg.stride.walk, steps: [0, 0.5] },
    run: { row: 2, frames: 6, loop: true, stride: cfg.stride.run, steps: [0, 0.5] },
    attack: { row: 3, frames: 6, loop: false, hitFrame: cfg.attack.hitFrame, durations: cfg.attack.durations },
    hurt: { row: 4, frames: 2, loop: false, durations: [0.12, 0.18] },
    fall: { row: 5, frames: 5, loop: false, durations: [0.1, 0.1, 0.1, 0.12, 0.2] },
  };
  fs.writeFileSync(`${ROOT}public/assets/${name}-art.json`, JSON.stringify({ cell: C, detail: 3.2, anchor: { x: AX, y: AY }, anims }, null, 2) + '\n');
  console.log(`ok: ${name}-art.png ${W}x${H}, escala ${SCALE.toFixed(2)}`);

  if (previewPath) { // dark checker preview, 1x, feet line in yellow
    const P = 1, PW = W * P, PH = H * P, pv = new Uint8ClampedArray(PW * PH * 4);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const s = (y * W + x) * 4, a = out[s + 3] / 255, o = (y * PW + x) * 4;
      const chk = (((x >> 5) + (y >> 5)) & 1) ? [58, 64, 84] : [48, 54, 74];
      for (let k = 0; k < 3; k++) pv[o + k] = out[s + k] * a + chk[k] * (1 - a); pv[o + 3] = 255;
      if (y % C === AY) { pv[o] = 255; pv[o + 1] = 255; pv[o + 2] = 0; }
      if (x % C === 0) { pv[o] = 255; pv[o + 1] = 255; pv[o + 2] = 0; }
    }
    encode(previewPath, PW, PH, pv);
  }
}

const arg = process.argv[2], prev = process.argv[3];
for (const n of arg === 'all' || !arg ? Object.keys(CHARS) : [arg]) build(n, prev && arg !== 'all' ? prev : null);
