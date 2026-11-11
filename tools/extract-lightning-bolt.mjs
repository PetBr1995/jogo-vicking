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

function isForegroundPixel(r, g, b) {
  // 1. Cyan/blue lightning, arcs, electric glow
  if (b >= 96 && g >= 66 && (b > r + 14 || g > r + 6)) return true;
  // 2. White hot core
  if (r >= 120 && g >= 120 && b >= 120) return true;
  // 3. Yellow/orange electric sparks
  if (r >= 115 && g >= 90 && r > b) return true;
  // 4. Rock fragments
  if (r >= 65 && g >= 50 && r >= b - 8 && (r + g + b) >= 170) return true;
  // 5. Electric energy flare
  if (b >= 115 && g >= 85) return true;
  return false;
}

function extractCell(r, c) {
  const [y0, y1] = rowDivs[r];
  const x0 = colDivs[c], x1 = colDivs[c + 1];

  // 1. Sample background color at cell perimeter
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let x = x0; x < x1; x++) {
    for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) {
      const idx = (y * w + x) * 4;
      if (!isForegroundPixel(data[idx], data[idx + 1], data[idx + 2])) {
        bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
      }
    }
  }
  for (let y = y0; y < y1; y++) {
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

  // 2. Find bounding box of true foreground
  let minX = 9999, maxX = -1, minY = 9999, maxY = -1, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * 4;
      const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];
      if (isForegroundPixel(red, grn, blu)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  const cx = count ? Math.round((minX + maxX) / 2) : Math.round((x0 + x1) / 2);
  const cy = count ? Math.round((minY + maxY) / 2) : Math.round((y0 + y1) / 2);

  // 3. Extract to 224x224 buffer: ONLY true foreground pixels get non-zero alpha!
  const cellBuf = new Uint8ClampedArray(CELL * CELL * 4);

  // Extract from within sprite bounding box with a 4px safety border
  const startX = Math.max(x0, minX - 4);
  const endX = Math.min(x1, maxX + 5);
  const startY = Math.max(y0, minY - 4);
  const endY = Math.min(y1, maxY + 5);

  if (count > 0) {
    for (let gy = startY; gy < endY; gy++) {
      for (let gx = startX; gx < endX; gx++) {
        const idx = (gy * w + gx) * 4;
        const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];

        // STRICT: if not foreground, alpha is 0
        if (!isForegroundPixel(red, grn, blu)) {
          continue;
        }

        const tx = gx - cx + ANCHOR.x;
        const ty = gy - cy + ANCHOR.y;
        if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;

        const diff = Math.hypot(red - bgR, grn - bgG, blu - bgB);

        // Smooth anti-aliased edge alpha
        let alpha = 255;
        if (diff < 40 && !((blu > 160 && grn > 140) || (red > 150 && grn > 150))) {
          alpha = Math.min(255, Math.max(0, Math.round(((diff - 10) / 30) * 255)));
        }
        if (alpha < 14) continue;

        let outR = red, outG = grn, outB = blu;
        // Decontaminate edge pixels against background
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
    cast: { start: 0, count: 6, fps: 26, loop: false },
    flight: { start: 6, count: 9, fps: 22, loop: true },
    impact: { start: 15, count: 14, fps: 20, loop: false },
    full: { start: 0, count: 29, fps: 22, loop: false },
  },
};

fs.writeFileSync('public/assets/lightning-bolt.json', JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved clean public/assets/lightning-bolt.png (${SHEET_W}x${SHEET_H}) and lightning-bolt.json`);
