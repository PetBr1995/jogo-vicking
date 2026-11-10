import fs from 'fs';
import { decode, encode } from './png.mjs';

const raw = decode('docs/arte/sheet-rune-thunder.png');
const { w, h, data } = raw;

const COLS = 6;
const ROWS = 4;
const CELL = 192;
const ANCHOR = { x: 96, y: 165 };

// Empirically measured exact centers and bases of the stone monolith
const colCenters = [104, 265, 436, 606, 772, 934];
const rowBases = [168, 337, 506, 671];

const outW = CELL * COLS;
const outH = CELL * ROWS;
const outData = new Uint8ClampedArray(outW * outH * 4);

function getBgAt(y) {
  const t = y / h;
  return [26 + t * 19, 28 + t * 7, 50 + t * 11];
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = (r1 - r2) * 1.3;
  const dg = (g1 - g2) * 1.3;
  const db = (b1 - b2) * 0.9;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBrightLightning(r, g, b) {
  // Electric cyan / blue
  if (b >= 125 && (g >= 65 || r >= 45)) return true;
  // White/blue core
  if (r >= 130 && g >= 150 && b >= 165) return true;
  // Golden arcs / sparks
  if (r >= 145 && g >= 125 && b >= 40 && (r + g > 280)) return true;
  if (r + g + b >= 310) return true;
  return false;
}

function isDefinitelyStone(r, g, b) {
  // Moss green at base
  if (g >= r + 4 && g >= b - 2 && g > 32) return true;
  // Dark ink outline of stone
  if (r <= 34 && g <= 36 && b <= 46 && (r + g + b < 100)) return true;
  // Slate gray stone
  if (Math.abs(r - g) <= 18 && Math.abs(g - b) <= 22 && r >= 34 && g >= 38) return true;
  return false;
}

for (let r = 0; r < ROWS; r++) {
  const base = rowBases[r];

  for (let c = 0; c < COLS; c++) {
    const cx = colCenters[c];

    // Take generous window around stone center: 82px left, 82px right = 164px total width!
    // NO CLIPPING of the sides!
    const halfW = 82;
    const topH = 152;
    const botH = 15;

    const x0 = Math.max(0, cx - halfW);
    const x1 = Math.min(w - 1, cx + halfW - 1);
    const y0 = Math.max(0, base - topH);
    const y1 = Math.min(h - 1, base + botH - 1);
    const sw = x1 - x0 + 1;
    const sh = y1 - y0 + 1;

    // Flood fill from the 4 outer borders of the cell to find all connected background
    const isBg = new Uint8Array(sw * sh);
    const queue = [];

    // Push all border pixels
    for (let lx = 0; lx < sw; lx++) {
      queue.push(lx, 0);
      queue.push(lx, sh - 1);
    }
    for (let ly = 1; ly < sh - 1; ly++) {
      queue.push(0, ly);
      queue.push(sw - 1, ly);
    }

    let qHead = 0;
    while (qHead < queue.length) {
      const lx = queue[qHead++];
      const ly = queue[qHead++];
      const idx = ly * sw + lx;
      if (isBg[idx]) continue;

      const gx = x0 + lx;
      const gy = y0 + ly;
      const gi = (gy * w + gx) * 4;
      const red = data[gi];
      const grn = data[gi + 1];
      const blu = data[gi + 2];

      const [bgR, bgG, bgB] = getBgAt(gy);
      const dist = colorDist(red, grn, blu, bgR, bgG, bgB);

      // Stop flood-fill if we encounter bright lightning or stone
      if (isBrightLightning(red, grn, blu)) continue;
      if (isDefinitelyStone(red, grn, blu) && dist > 14) continue;

      // It's background or outer smoke
      isBg[idx] = 1;

      if (lx > 0 && !isBg[idx - 1]) queue.push(lx - 1, ly);
      if (lx < sw - 1 && !isBg[idx + 1]) queue.push(lx + 1, ly);
      if (ly > 0 && !isBg[idx - sw]) queue.push(lx, ly - 1);
      if (ly < sh - 1 && !isBg[idx + sw]) queue.push(lx, ly + 1);
    }

    // Output placement centered on ANCHOR
    const destOriginX = c * CELL + (ANCHOR.x - halfW);
    const destOriginY = r * CELL + (ANCHOR.y - topH);

    for (let ly = 0; ly < sh; ly++) {
      const gy = y0 + ly;
      for (let lx = 0; lx < sw; lx++) {
        const localIdx = ly * sw + lx;
        if (isBg[localIdx]) continue; // completely transparent!

        const gx = x0 + lx;
        const gi = (gy * w + gx) * 4;
        const red = data[gi];
        const grn = data[gi + 1];
        const blu = data[gi + 2];

        const [bgR, bgG, bgB] = getBgAt(gy);
        const dist = colorDist(red, grn, blu, bgR, bgG, bgB);

        let alpha = 255;
        if (dist < 20) {
          alpha = Math.round(Math.max(0, Math.min(255, (dist - 10) * (255 / 10))));
        }

        const outX = destOriginX + lx;
        const outY = destOriginY + ly;
        if (outX >= 0 && outX < outW && outY >= 0 && outY < outH) {
          const di = (outY * outW + outX) * 4;
          outData[di] = red;
          outData[di + 1] = grn;
          outData[di + 2] = blu;
          outData[di + 3] = alpha;
        }
      }
    }
  }
}

encode('public/assets/rune-thunder.png', outW, outH, outData);

const meta = {
  cell: CELL,
  detail: 3.4, // Natural proportional size next to Viking
  anchor: ANCHOR,
  anims: {
    // 24 frames total across 4 rows
    dormant: { row: 0, frames: 6, loop: false, fps: 1 },
    charge: { row: 1, frames: 6, loop: false, fps: 10 },
    burst: { row: 2, frames: 6, loop: false, fps: 12 },
    cooldown: { row: 3, frames: 6, loop: false, fps: 8 },
  },
};

fs.writeFileSync('public/assets/rune-thunder.json', JSON.stringify(meta, null, 2));
console.log('Rune thunder extracted with full width (not cut off) and transparent background!');
