import fs from 'fs';
import { decode, encode } from './png.mjs';

const raw = decode('docs/arte/sheet-lightning-strike.png');
const { w, h, data } = raw;

const CELL_W = 224;
const CELL_H = 320;
const ANCHOR = { x: 112, y: 260 };

const rowSpans = [
  { r: 0, y0: 0, y1: 237, gy: 228, cols: [0, 160, 330, 495, 660, 836, 1024] },
  { r: 1, y0: 237, y1: 416, gy: 385, cols: [0, 180, 346, 521, 673, 845, 1024] },
  { r: 2, y0: 416, y1: 551, gy: 528, cols: [0, 173, 330, 511, 676, 825, 1024] },
  { r: 3, y0: 551, y1: 675, gy: 660, cols: [0, 160, 330, 495, 660, 825, 1024] },
];
const colCenters = [100, 266, 436, 602, 765, 925];

function isTrueForeground(r, g, b) {
  // Baseline guide line removal (black lines)
  if (r < 18 && g < 18 && b < 26) return false;
  // 1. White hot core
  if (r >= 120 && g >= 120 && b >= 120) return true;
  // 2. Cyan core & bright electricity
  if (b >= 130 && g >= 105) return true;
  // 3. Cyan electric arcs (strong green component relative to red)
  if (b >= 105 && g >= 92 && g >= r + 24) return true;
  // 4. Yellow/orange electric sparks
  if (r >= 120 && g >= 95 && r > b) return true;
  // 5. Ground blast rock fragments
  if (r >= 70 && g >= 55 && r >= b - 8 && (r + g + b) >= 170) return true;
  // 6. Secondary electric arcs
  if (b >= 115 && g >= 85 && (b > r + 30 || g > r + 15)) return true;
  return false;
}

function extractCell(r, c) {
  const row = rowSpans[r];
  const x0 = row.cols[c], x1 = row.cols[c + 1];

  // 1. Sample local background color from the natural border perimeter
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let x = x0; x < x1; x++) {
    for (const y of [row.y0, row.y0 + 1, row.y1 - 2, row.y1 - 1]) {
      const idx = (y * w + x) * 4;
      if (!isTrueForeground(data[idx], data[idx + 1], data[idx + 2])) {
        bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
      }
    }
  }
  for (let y = row.y0; y < row.y1; y++) {
    for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) {
      const idx = (y * w + x) * 4;
      if (!isTrueForeground(data[idx], data[idx + 1], data[idx + 2])) {
        bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2]; bgCount++;
      }
    }
  }
  bgR /= Math.max(1, bgCount);
  bgG /= Math.max(1, bgCount);
  bgB /= Math.max(1, bgCount);

  // Consistent column centers aligned across all 4 rows
  const cx = colCenters[c];

  const cellBuf = new Uint8ClampedArray(CELL_W * CELL_H * 4);

  // Strictly sample within the natural cell boundaries (x0 to x1, row.y0 to row.y1)
  // This guarantees ZERO pixel bleed or duplicate debris from adjacent columns or rows!
  for (let gy = row.y0; gy < row.y1; gy++) {
    for (let gx = x0; gx < x1; gx++) {
      const idx = (gy * w + gx) * 4;
      const red = data[idx], grn = data[idx + 1], blu = data[idx + 2];

      if (!isTrueForeground(red, grn, blu)) continue;

      const tx = gx - cx + ANCHOR.x;
      const ty = gy - row.gy + ANCHOR.y;
      if (tx < 0 || tx >= CELL_W || ty < 0 || ty >= CELL_H) continue;

      const diff = Math.hypot(red - bgR, grn - bgG, blu - bgB);

      // Smooth anti-aliased edge alpha
      let alpha = 255;
      if (diff < 45 && !((blu > 160 && grn > 140) || (red > 150 && grn > 150))) {
        alpha = Math.min(255, Math.max(0, Math.round(((diff - 12) / 33) * 255)));
      }
      if (alpha < 12) continue;

      // Soft feathering at cell borders to guarantee seamless transparency
      let edgeFade = 1.0;
      if (tx < 20) {
        edgeFade = Math.min(edgeFade, tx / 20);
      } else if (tx > CELL_W - 20) {
        edgeFade = Math.min(edgeFade, (CELL_W - 1 - tx) / 20);
      }

      if (ty < 20) {
        edgeFade = Math.min(edgeFade, ty / 20);
      } else if (ty > CELL_H - 20) {
        edgeFade = Math.min(edgeFade, (CELL_H - 1 - ty) / 20);
      }

      alpha = Math.round(alpha * edgeFade);
      if (alpha < 8) continue;

      let outR = red, outG = grn, outB = blu;
      if (alpha < 240) {
        const a = alpha / 255;
        outR = Math.min(255, Math.max(0, Math.round((red - bgR * (1 - a)) / a)));
        outG = Math.min(255, Math.max(0, Math.round((grn - bgG * (1 - a)) / a)));
        outB = Math.min(255, Math.max(0, Math.round((blu - bgB * (1 - a)) / a)));
      }

      // Realce de vivacidade (1.20) e contraste elétrico (1.15) idêntico ao pré-processamento do Viking
      const gray = 0.299 * outR + 0.587 * outG + 0.114 * outB;
      outR = Math.min(255, Math.max(0, Math.round(1.15 * (gray + 1.20 * (outR - gray)))));
      outG = Math.min(255, Math.max(0, Math.round(1.15 * (gray + 1.20 * (outG - gray)))));
      outB = Math.min(255, Math.max(0, Math.round(1.15 * (gray + 1.20 * (outB - gray)))));

      const di = (ty * CELL_W + tx) * 4;
      cellBuf[di] = outR;
      cellBuf[di + 1] = outG;
      cellBuf[di + 2] = outB;
      cellBuf[di + 3] = alpha;
    }
  }

  return { cellBuf };
}

const frames = [];
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    if (r === 3 && c === 5) continue; // 23 frames
    const extracted = extractCell(r, c);
    frames.push(extracted);
  }
}

console.log(`Extracted ${frames.length} clean strike frames.`);

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
encode('public/assets/base_ready/lightning_strike.png', SHEET_W, SHEET_H, sheetRgba);
encode('public/assets/base_ready_backup_estavel/lightning_strike.png', SHEET_W, SHEET_H, sheetRgba);

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

const metaJson = JSON.stringify(meta, null, 2) + '\n';
fs.writeFileSync('public/assets/lightning-strike.json', metaJson);
fs.writeFileSync('public/assets/base_ready/lightning_strike.json', metaJson);
fs.writeFileSync('public/assets/base_ready_backup_estavel/lightning_strike.json', metaJson);
console.log(`Saved clean lightning-strike.png (${SHEET_W}x${SHEET_H}) and lightning-strike.json`);
