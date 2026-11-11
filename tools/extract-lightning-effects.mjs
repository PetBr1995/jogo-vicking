import fs from 'fs';
import { decode, encode } from './png.mjs';

function isSky(r, g, b) {
  if (r > 105 || g > 95 || b > 115) return false;
  if (r > b + 2) return false;
  if ((b > 110 && g > 90) || (r > 110 && g > 90 && b < 100)) return false;
  if (r > 40 && g > 35 && r >= b - 5) return false; // rock debris
  if (r <= 15 && g <= 15 && b <= 20) return false; // baseline guide line
  if (b >= 25 && b <= 95 && b >= r + 4 && b >= g + 4 && r <= 80 && g <= 75) return true;
  return false;
}

function extractBg(rawImg, removeBaseLines = false) {
  const w = rawImg.w, h = rawImg.h, data = rawImg.data;
  const bg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4;
    if (isSky(data[pi], data[pi + 1], data[pi + 2])) bg[i] = 1;
  }

  if (removeBaseLines) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (bg[idx]) continue;
        const pi = idx * 4;
        const r = data[pi], g = data[pi + 1], b = data[pi + 2];
        if (r <= 22 && g <= 22 && b <= 28) {
          if (bg[idx - w] && bg[idx + w]) {
            bg[idx] = 1;
          }
        }
      }
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (bg[idx]) continue;
        const pi = idx * 4;
        const r = data[pi], g = data[pi + 1], b = data[pi + 2];
        let skyN = 0;
        if (bg[idx - 1]) skyN++;
        if (bg[idx + 1]) skyN++;
        if (bg[idx - w]) skyN++;
        if (bg[idx + w]) skyN++;
        if (skyN >= 3 && b >= r && b >= g - 2 && r < 85 && g < 80 && b < 100 && !(r > 120 && g > 120)) {
          bg[idx] = 1;
        }
      }
    }
  }
  return bg;
}

// =========================================================================
// 1. EXTRACT LIGHTNING BOLT (Flight & Impact Burst)
// =========================================================================
const boltRaw = decode('docs/arte/sheet-lightning-bolt.png');
const boltBg = extractBg(boltRaw, false);

const BOLT_CELL = 192;
const BOLT_ANCHOR = { x: 96, y: 96 };
const boltColDivs = [0, 170, 340, 510, 680, 850, 1024];

function extractBoltCell(rawImg, bg, x0, x1, y0, y1) {
  const w = rawImg.w, h = rawImg.h, data = rawImg.data;
  let sumX = 0, sumY = 0, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * w + x;
      if (bg[idx]) continue;
      const pi = idx * 4;
      const r = data[pi], g = data[pi + 1], b = data[pi + 2];
      if ((b > 110 && g > 90) || (r > 130 && g > 130 && b > 130) || (r > 110 && g > 90 && b < 100)) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  const cx = count ? Math.round(sumX / count) : Math.round((x0 + x1) / 2);
  const cy = count ? Math.round(sumY / count) : Math.round((y0 + y1) / 2);
  const cellBuf = new Uint8ClampedArray(BOLT_CELL * BOLT_CELL * 4);

  for (let gy = y0; gy < y1; gy++) {
    for (let gx = x0; gx < x1; gx++) {
      const idx = gy * w + gx;
      if (bg[idx]) continue;
      const tx = gx - cx + BOLT_ANCHOR.x;
      const ty = gy - cy + BOLT_ANCHOR.y;
      if (tx < 0 || tx >= BOLT_CELL || ty < 0 || ty >= BOLT_CELL) continue;

      const pi = idx * 4;
      let r = data[pi], g = data[pi + 1], b = data[pi + 2];
      let bgN = 0, bgR = 0, bgG = 0, bgB = 0;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = gx + ox, ny = gy + oy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || bg[ny * w + nx]) {
          bgN++;
          const npi = (Math.max(0, Math.min(h - 1, ny)) * w + Math.max(0, Math.min(w - 1, nx))) * 4;
          bgR += data[npi]; bgG += data[npi + 1]; bgB += data[npi + 2];
        }
      }
      let alpha = 255;
      if (bgN > 0) {
        bgR /= bgN; bgG /= bgN; bgB /= bgN;
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        alpha = Math.min(255, Math.max(0, Math.round((dist - 4) * 8.5)));
        if (alpha < 16) continue;
        const a = alpha / 255;
        if ((r > 120 && g > 120 && b > 120) || (b > 110 && g > 90) || (r > 110 && g > 90 && b < 100)) {
          r = Math.min(255, Math.max(0, Math.round((r - bgR * (1 - a)) / a)));
          g = Math.min(255, Math.max(0, Math.round((g - bgG * (1 - a)) / a)));
          b = Math.min(255, Math.max(0, Math.round((b - bgB * (1 - a)) / a)));
        }
      }
      const di = (ty * BOLT_CELL + tx) * 4;
      cellBuf[di] = r; cellBuf[di + 1] = g; cellBuf[di + 2] = b; cellBuf[di + 3] = alpha;
    }
  }
  return cellBuf;
}

const boltFlightFrames = [];
for (let c = 0; c < 6; c++) {
  boltFlightFrames.push(extractBoltCell(boltRaw, boltBg, boltColDivs[c], boltColDivs[c + 1], 160, 275));
}
const boltImpactFrames = [];
for (let c = 0; c < 6; c++) {
  boltImpactFrames.push(extractBoltCell(boltRaw, boltBg, boltColDivs[c], boltColDivs[c + 1], 275, 420));
}

const boltSheetCols = 6;
const boltSheetRows = 2; // Row 0: flight, Row 1: impact
const boltSheetW = boltSheetCols * BOLT_CELL;
const boltSheetH = boltSheetRows * BOLT_CELL;
const boltRgba = new Uint8ClampedArray(boltSheetW * boltSheetH * 4);

[boltFlightFrames, boltImpactFrames].forEach((rowFrames, r) => {
  rowFrames.forEach((cellBuf, c) => {
    for (let y = 0; y < BOLT_CELL; y++) {
      const srcOff = y * BOLT_CELL * 4;
      const dstOff = ((r * BOLT_CELL + y) * boltSheetW + c * BOLT_CELL) * 4;
      boltRgba.set(cellBuf.subarray(srcOff, srcOff + BOLT_CELL * 4), dstOff);
    }
  });
});

encode('public/assets/lightning-bolt.png', boltSheetW, boltSheetH, boltRgba);

const boltMeta = {
  cell: BOLT_CELL,
  anchor: BOLT_ANCHOR,
  anims: {
    flight: { row: 0, frames: 6, loop: true, durations: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06] },
    impact: { row: 1, frames: 6, loop: false, durations: [0.05, 0.05, 0.06, 0.06, 0.07, 0.08] },
  },
};
fs.writeFileSync('public/assets/lightning-bolt.json', JSON.stringify(boltMeta, null, 2) + '\n');
console.log(`Saved public/assets/lightning-bolt.png (${boltSheetW}x${boltSheetH}) and lightning-bolt.json`);

// =========================================================================
// 2. EXTRACT VERTICAL LIGHTNING STRIKE FROM THE SKY
// =========================================================================
const strikeRaw = decode('docs/arte/sheet-lightning-strike.png');
const strikeBg = extractBg(strikeRaw, true);

const STRIKE_CELL_W = 224;
const STRIKE_CELL_H = 288;
const STRIKE_ANCHOR = { x: 112, y: 256 };
const strikeColDivs = [0, 170, 340, 510, 680, 850, 1024];

function extractStrikeCell(rawImg, bg, x0, x1, y0, y1, groundY) {
  const w = rawImg.w, h = rawImg.h, data = rawImg.data;
  let sumX = 0, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * w + x;
      if (bg[idx]) continue;
      const pi = idx * 4;
      const r = data[pi], g = data[pi + 1], b = data[pi + 2];
      if ((b > 110 && g > 90) || (r > 130 && g > 130 && b > 130)) {
        sumX += x;
        count++;
      }
    }
  }
  const cx = count ? Math.round(sumX / count) : Math.round((x0 + x1) / 2);
  const cellBuf = new Uint8ClampedArray(STRIKE_CELL_W * STRIKE_CELL_H * 4);

  for (let gy = y0; gy < y1; gy++) {
    for (let gx = x0; gx < x1; gx++) {
      const idx = gy * w + gx;
      if (bg[idx]) continue;
      const tx = gx - cx + STRIKE_ANCHOR.x;
      const ty = gy - groundY + STRIKE_ANCHOR.y;
      if (tx < 0 || tx >= STRIKE_CELL_W || ty < 0 || ty >= STRIKE_CELL_H) continue;

      const pi = idx * 4;
      let r = data[pi], g = data[pi + 1], b = data[pi + 2];
      let bgN = 0, bgR = 0, bgG = 0, bgB = 0;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = gx + ox, ny = gy + oy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || bg[ny * w + nx]) {
          bgN++;
          const npi = (Math.max(0, Math.min(h - 1, ny)) * w + Math.max(0, Math.min(w - 1, nx))) * 4;
          bgR += data[npi]; bgG += data[npi + 1]; bgB += data[npi + 2];
        }
      }
      let alpha = 255;
      if (bgN > 0) {
        bgR /= bgN; bgG /= bgN; bgB /= bgN;
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        alpha = Math.min(255, Math.max(0, Math.round((dist - 4) * 8.5)));
        if (alpha < 16) continue;
        const a = alpha / 255;
        if ((r > 120 && g > 120 && b > 120) || (b > 110 && g > 90) || (r > 110 && g > 90 && b < 100)) {
          r = Math.min(255, Math.max(0, Math.round((r - bgR * (1 - a)) / a)));
          g = Math.min(255, Math.max(0, Math.round((g - bgG * (1 - a)) / a)));
          b = Math.min(255, Math.max(0, Math.round((b - bgB * (1 - a)) / a)));
        }
      }
      const di = (ty * STRIKE_CELL_W + tx) * 4;
      cellBuf[di] = r; cellBuf[di + 1] = g; cellBuf[di + 2] = b; cellBuf[di + 3] = alpha;
    }
  }
  return cellBuf;
}

// Sequence:
// Row 0 cols 1..5: descending vertical sky bolt hitting ground
// Row 1 cols 0..5: ground explosion, shockwaves and rock blast
// Row 2 cols 1..3: dissipation and residual crackling smoke
const strikeSequenceDef = [
  // Row 0: bolt strikes down from sky to ground
  { r: 0, c: 1, y0: 0, y1: 230, gy: 228 },
  { r: 0, c: 2, y0: 0, y1: 230, gy: 228 },
  { r: 0, c: 3, y0: 0, y1: 230, gy: 228 },
  { r: 0, c: 4, y0: 0, y1: 230, gy: 228 },
  { r: 0, c: 5, y0: 0, y1: 230, gy: 228 },
  // Row 1: massive ground detonation and expanding shockwaves
  { r: 1, c: 0, y0: 230, y1: 415, gy: 385 },
  { r: 1, c: 1, y0: 230, y1: 415, gy: 385 },
  { r: 1, c: 2, y0: 230, y1: 415, gy: 385 },
  { r: 1, c: 3, y0: 230, y1: 415, gy: 385 },
  { r: 1, c: 4, y0: 230, y1: 415, gy: 385 },
  { r: 1, c: 5, y0: 230, y1: 415, gy: 385 },
  // Row 2: ground smoke, embers, and aftermath
  { r: 2, c: 1, y0: 415, y1: 550, gy: 528 },
  { r: 2, c: 2, y0: 415, y1: 550, gy: 528 },
  { r: 2, c: 3, y0: 415, y1: 550, gy: 528 },
];

const strikeFrames = strikeSequenceDef.map((def) =>
  extractStrikeCell(
    strikeRaw,
    strikeBg,
    strikeColDivs[def.c],
    strikeColDivs[def.c + 1],
    def.y0,
    def.y1,
    def.gy
  )
);

const strikeSheetCols = strikeFrames.length; // 14 frames in a single row
const strikeSheetRows = 1;
const strikeSheetW = strikeSheetCols * STRIKE_CELL_W;
const strikeSheetH = STRIKE_CELL_H;
const strikeRgba = new Uint8ClampedArray(strikeSheetW * strikeSheetH * 4);

strikeFrames.forEach((cellBuf, c) => {
  for (let y = 0; y < STRIKE_CELL_H; y++) {
    const srcOff = y * STRIKE_CELL_W * 4;
    const dstOff = (y * strikeSheetW + c * STRIKE_CELL_W) * 4;
    strikeRgba.set(cellBuf.subarray(srcOff, srcOff + STRIKE_CELL_W * 4), dstOff);
  }
});

encode('public/assets/lightning-strike.png', strikeSheetW, strikeSheetH, strikeRgba);

const strikeMeta = {
  cellW: STRIKE_CELL_W,
  cellH: STRIKE_CELL_H,
  anchor: STRIKE_ANCHOR,
  anims: {
    strike: {
      row: 0,
      frames: strikeFrames.length,
      loop: false,
      durations: [
        0.04, 0.04, 0.04, 0.04, 0.05,
        0.05, 0.05, 0.05, 0.05, 0.06, 0.06,
        0.06, 0.07, 0.08
      ],
    },
  },
};
fs.writeFileSync('public/assets/lightning-strike.json', JSON.stringify(strikeMeta, null, 2) + '\n');
console.log(`Saved public/assets/lightning-strike.png (${strikeSheetW}x${strikeSheetH}) and lightning-strike.json`);
