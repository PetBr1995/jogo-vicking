import fs from 'fs';
import { decode, encode } from './png.mjs';

const raw = decode('docs/arte/sheet-lightning-strike.png');
const { w, h, data } = raw;

const CELL_W = 224;
const CELL_H = 288;
const ANCHOR = { x: 112, y: 256 };

const rows = [
  { r: 0, y0: 0, y1: 228, gy: 228 },
  { r: 1, y0: 245, y1: 395, gy: 385 },
  { r: 2, y0: 440, y1: 545, gy: 528 },
  { r: 3, y0: 570, y1: 665, gy: 660 },
];
const colDivs = [0, 170, 341, 512, 683, 853, 1024];

function isForegroundPixel(r, g, b) {
  // Baseline guide line removal
  if (r < 18 && g < 18 && b < 26) return false;
  // Cyan/blue lightning, arcs, electric glow
  if (b >= 96 && g >= 66 && (b > r + 14 || g > r + 6)) return true;
  // White hot core
  if (r >= 120 && g >= 120 && b >= 120) return true;
  // Yellow/orange electric sparks
  if (r >= 115 && g >= 90 && r > b) return true;
  // Rock fragments
  if (r >= 65 && g >= 50 && r >= b - 8 && (r + g + b) >= 170) return true;
  // Electric energy flare
  if (b >= 115 && g >= 85) return true;
  // Smoke in aftermath
  if (g >= 60 && b >= 88 && b > r + 16) return true;
  return false;
}

function extractCell(r, c) {
  const row = rows[r];
  const x0 = colDivs[c], x1 = colDivs[c + 1];

  // 1. Sample background color at perimeter
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let x = x0; x < x1; x++) {
    for (const y of [row.y0, row.y0 + 1, row.y1 - 2, row.y1 - 1]) {
      const idx = (y * w + x) * 4;
      if (!isForegroundPixel(data[idx], data[idx + 1], data[idx + 2])) {
        bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
      }
    }
  }
  for (let y = row.y0; y < row.y1; y++) {
    for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) {
      const idx = (y * w + x) * 4;
      if (!isForegroundPixel(data[idx], data[idx + 1], data[idx + 2])) {
        bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
      }
    }
  }
  bgR /= Math.max(1, bgCount);
  bgG /= Math.max(1, bgCount);
  bgB /= Math.max(1, bgCount);

  // 2. Find bounding box & center
  let minX = 9999, maxX = -1, minY = 9999, maxY = -1, count = 0;
  let sumX = 0;
  for (let y = row.y0; y < row.y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * 4;
      const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];
      if (isForegroundPixel(red, grn, blu)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        count++;
      }
    }
  }

  // Consistent aligned column center
  const colCenters = [100, 268, 434, 601, 765, 933];
  const cx = colCenters[c];

  const cellBuf = new Uint8ClampedArray(CELL_W * CELL_H * 4);

  const startX = Math.max(0, x0 - 8);
  const endX = Math.min(w, x1 + 8);
  const startY = row.y0;
  const endY = row.y1;

  if (count > 0) {
    for (let gy = startY; gy < endY; gy++) {
      for (let gx = startX; gx < endX; gx++) {
        const idx = (gy * w + gx) * 4;
        const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];

        if (!isForegroundPixel(red, grn, blu)) continue;

        const tx = gx - cx + ANCHOR.x;
        const ty = gy - row.gy + ANCHOR.y;
        if (tx < 0 || tx >= CELL_W || ty < 0 || ty >= CELL_H) continue;

        const diff = Math.hypot(red - bgR, grn - bgG, blu - bgB);

        // Smooth anti-aliased edge alpha
        let alpha = 255;
        if (diff < 40 && !((blu > 160 && grn > 140) || (red > 150 && grn > 150))) {
          alpha = Math.min(255, Math.max(0, Math.round(((diff - 10) / 30) * 255)));
        }
        if (alpha < 14) continue;

        let outR = red, outG = grn, outB = blu;
        if (alpha < 240) {
          const a = alpha / 255;
          outR = Math.min(255, Math.max(0, Math.round((red - bgR * (1 - a)) / a)));
          outG = Math.min(255, Math.max(0, Math.round((grn - bgG * (1 - a)) / a)));
          outB = Math.min(255, Math.max(0, Math.round((blu - bgB * (1 - a)) / a)));
        }

        const di = (ty * CELL_W + tx) * 4;
        cellBuf[di] = outR;
        cellBuf[di + 1] = outG;
        cellBuf[di + 2] = outB;
        cellBuf[di + 3] = alpha;
      }
    }
  }

  return { cellBuf, count };
}

const frames = [];
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    if (r === 3 && c === 5) continue; // 23 frames
    const extracted = extractCell(r, c);
    frames.push(extracted);
  }
}

console.log(`Extracted ${frames.length} strike frames.`);

const COLS = 6;
const ROWS = 4;
const SHEET_W = COLS * CELL_W; // 1344
const SHEET_H = ROWS * CELL_H; // 1152
const sheetRgba = new Uint8ClampedArray(SHEET_W * SHEET_H * 4);

frames.forEach((f, idx) => {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  for (let y = 0; y < CELL_H; y++) {
    const srcOff = y * CELL_W * 4;
    const dstOff = ((row * CELL_H + y) * SHEET_W + col * CELL_W) * 4;
    sheetRgba.set(f.cellBuf.subarray(srcOff, srcOff + CELL_W * 4), dstOff);
  }
});

encode('public/assets/lightning-strike.png', SHEET_W, SHEET_H, sheetRgba);

const meta = {
  cellW: CELL_W,
  cellH: CELL_H,
  anchor: ANCHOR,
  totalFrames: frames.length,
  cols: COLS,
  rows: ROWS,
  anims: {
    strike: {
      start: 0,
      count: frames.length,
      fps: 22,
      loop: false,
      durations: [
        0.035, 0.035, 0.035, 0.035, 0.04, 0.04, // 0..5: Sky descent to impact
        0.045, 0.045, 0.045, 0.05, 0.05, 0.05,  // 6..11: Massive ground detonation & circular shockwaves
        0.05, 0.05, 0.05, 0.055, 0.055, 0.06,   // 12..17: Flying rocks & secondary electric arcs
        0.06, 0.065, 0.07, 0.075, 0.08          // 18..22: Dissipating ground smoke & embers
      ]
    }
  }
};

fs.writeFileSync('public/assets/lightning-strike.json', JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved clean public/assets/lightning-strike.png (${SHEET_W}x${SHEET_H}) and lightning-strike.json`);
