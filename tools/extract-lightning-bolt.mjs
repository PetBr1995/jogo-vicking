import fs from 'fs';
import { decode, encode } from './png.mjs';

const raw = decode('docs/arte/sheet-lightning-bolt.png');
const { w, h, data } = raw;

const CELL = 224;
const ANCHOR = { x: 112, y: 112 };

const rowDivs = [
  [0, 150],
  [150, 260],
  [260, 400],
  [400, 550],
  [550, 687],
];
const colDivs = [0, 170, 341, 512, 683, 853, 1024];

function isDefinitelyForeground(r, g, b) {
  if (r > 130 && g > 130 && b > 130) return true; // white core
  if (b > 120 && g > 100) return true;           // cyan core
  if (r > 120 && g > 95 && r > b) return true;   // yellow sparks
  if (r > 65 && g > 50 && r >= b - 8) return true; // rock fragments
  if (b > 105 && b > r + 18 && b > g + 12) return true; // electric blue glow
  return false;
}

function extractCell(r, c) {
  const [y0, y1] = rowDivs[r];
  const x0 = colDivs[c], x1 = colDivs[c + 1];
  const sw = x1 - x0, sh = y1 - y0;

  // 1. Sample background color at cell perimeter
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let x = x0; x < x1; x++) {
    for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) {
      const idx = (y * w + x) * 4;
      bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
    }
  }
  for (let y = y0; y < y1; y++) {
    for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) {
      const idx = (y * w + x) * 4;
      bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
    }
  }
  bgR /= Math.max(1, bgCount);
  bgG /= Math.max(1, bgCount);
  bgB /= Math.max(1, bgCount);

  // 2. Find center of mass of foreground
  let sumX = 0, sumY = 0, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * 4;
      const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];
      if (isDefinitelyForeground(red, grn, blu)) {
        sumX += x; sumY += y; count++;
      }
    }
  }
  const cx = count ? Math.round(sumX / count) : Math.round((x0 + x1) / 2);
  const cy = count ? Math.round(sumY / count) : Math.round((y0 + y1) / 2);

  // 3. Extract to 224x224 buffer with smooth alpha matting
  const cellBuf = new Uint8ClampedArray(CELL * CELL * 4);

  for (let gy = y0; gy < y1; gy++) {
    for (let gx = x0; gx < x1; gx++) {
      const tx = gx - cx + ANCHOR.x;
      const ty = gy - cy + ANCHOR.y;
      if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;

      const idx = (gy * w + gx) * 4;
      const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];

      const diff = Math.hypot(red - bgR, grn - bgG, blu - bgB);
      if (diff < 12 && !isDefinitelyForeground(red, grn, blu)) {
        continue; // background
      }

      // Smooth alpha ramp
      let alpha = 255;
      if (diff < 36 && !isDefinitelyForeground(red, grn, blu)) {
        alpha = Math.min(255, Math.max(0, Math.round(((diff - 12) / 24) * 255)));
      }

      if (alpha < 10) continue;

      let outR = red, outG = grn, outB = blu;
      // Color decontaminate edges
      if (alpha < 240) {
        const a = alpha / 255;
        outR = Math.min(255, Math.max(0, Math.round((red - bgR * (1 - a)) / a)));
        outG = Math.min(255, Math.max(0, Math.round((grn - bgG * (1 - a)) / a)));
        outB = Math.min(255, Math.max(0, Math.round((blu - bgB * (1 - a)) / a)));
      }

      const di = (ty * CELL + tx) * 4;
      cellBuf[di] = outR;
      cellBuf[di + 1] = outG;
      cellBuf[di + 2] = outB;
      cellBuf[di + 3] = alpha;
    }
  }

  return { cellBuf, count, cx, cy };
}

// Generate all 29 frames
const frames = [];
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 6; c++) {
    if (r === 4 && c === 5) continue; // 29 frames
    const extracted = extractCell(r, c);
    frames.push(extracted);
  }
}

console.log(`Extracted ${frames.length} frames.`);

// Pack into 6 columns x 5 rows of 224x224
const COLS = 6;
const ROWS = 5;
const SHEET_W = COLS * CELL; // 1344
const SHEET_H = ROWS * CELL; // 1120
const sheetRgba = new Uint8ClampedArray(SHEET_W * SHEET_H * 4);

frames.forEach((f, idx) => {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  for (let y = 0; y < CELL; y++) {
    const srcOff = y * CELL * 4;
    const dstOff = ((row * CELL + y) * SHEET_W + col * CELL) * 4;
    sheetRgba.set(f.cellBuf.subarray(srcOff, srcOff + CELL * 4), dstOff);
  }
});

encode('public/assets/lightning-bolt.png', SHEET_W, SHEET_H, sheetRgba);

const meta = {
  cell: CELL,
  anchor: ANCHOR,
  totalFrames: frames.length,
  cols: COLS,
  rows: ROWS,
  anims: {
    // 1. Charge & Launch (Frames 0 to 5, Row 0)
    cast: { start: 0, count: 6, fps: 26, loop: false },
    // 2. High-speed Lightning Spear Flight (Frames 6 to 14)
    flight: { start: 6, count: 9, fps: 22, loop: true },
    // 3. Full Impact, Nova Detonation, Ground Shock & Dissipating Smoke (Frames 15 to 28)
    impact: { start: 15, count: 14, fps: 20, loop: false },
    // 4. Full sequence (from launch all the way to smoke dissipation)
    full: { start: 0, count: 29, fps: 22, loop: false },
  },
};

fs.writeFileSync('public/assets/lightning-bolt.json', JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved public/assets/lightning-bolt.png (${SHEET_W}x${SHEET_H}) and lightning-bolt.json`);
