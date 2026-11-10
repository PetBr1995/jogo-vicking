import fs from 'fs';
import { decode, encode } from './png.mjs';

const raw = decode('docs/arte/sheet-enemy.png');
const { w, h, data } = raw;

const CELL = 192;
const DETAIL = 2.6;
const ANCHOR = { x: 96, y: 170 };

const ROW_SPANS = [
  {
    y: [28, 143],
    cols: [[48, 146], [208, 312], [374, 478], [548, 648], [704, 812], [874, 980]],
  },
  {
    y: [160, 276],
    cols: [[50, 138], [206, 304], [374, 476], [550, 642], [708, 812], [882, 974]],
  },
  {
    y: [294, 403],
    cols: [[52, 158], [220, 326], [388, 494], [532, 662], [688, 842], [886, 996]],
  },
  {
    y: [418, 546],
    cols: [[48, 136], [216, 306], [388, 486], [526, 680], [688, 820], [882, 972]],
  },
  {
    y: [554, 676],
    cols: [[48, 150], [214, 320], [382, 488], [540, 648], [678, 826], [866, 990]],
  },
];

function isOuterBgPixel(r, g, b) {
  // White eyes, motion lines, or white slash arcs
  if (r > 125 && g > 125 && b > 135) return false;
  // Dark black ink outline or legs/antennae
  if (r < 36 && g < 34 && b < 43 && (b - r) < 12) return false;
  // Warm beige mask/belly/dagger or neutral dark grey shell
  if (r >= b - 3 && (r > 32 || g > 30)) return false;
  // Slate-blue background
  if (b > r + 4 && b > g + 4 && b < 148 && r < 102) return true;
  return false;
}

function extractFrame(row, col) {
  const [y0, y1] = ROW_SPANS[row].y;
  const [x0, x1] = ROW_SPANS[row].cols[col];
  const sw = x1 - x0 + 1;
  const sh = y1 - y0 + 1;

  // Sample corner background color
  const cornerSamples = [];
  for (const [cx, cy] of [[2, 2], [sw - 3, 2], [2, sh - 3], [sw - 3, sh - 3]]) {
    const gi = ((y0 + cy) * w + (x0 + cx)) * 4;
    cornerSamples.push([data[gi], data[gi + 1], data[gi + 2]]);
  }
  cornerSamples.sort((a, b) => a[2] - b[2]);
  const [bgBaseR, bgBaseG, bgBaseB] = cornerSamples[1];

  // 1) Flood-fill background from cell borders
  const bg = new Uint8Array(sw * sh);
  const queue = [];
  const tryPush = (lx, ly) => {
    if (lx < 0 || lx >= sw || ly < 0 || ly >= sh) return;
    const idx = ly * sw + lx;
    if (bg[idx]) return;
    const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
    if (isOuterBgPixel(data[gi], data[gi + 1], data[gi + 2])) {
      bg[idx] = 1;
      queue.push(idx);
    }
  };
  for (let x = 0; x < sw; x++) { tryPush(x, 0); tryPush(x, sh - 1); }
  for (let y = 0; y < sh; y++) { tryPush(0, y); tryPush(sw - 1, y); }
  while (queue.length) {
    const idx = queue.pop();
    const lx = idx % sw, ly = (idx / sw) | 0;
    tryPush(lx + 1, ly);
    tryPush(lx - 1, ly);
    tryPush(lx, ly + 1);
    tryPush(lx, ly - 1);
  }

  // 2) Find centroid of the warm beige head/belly so we know where the body is
  let headSumX = 0, headSumY = 0, headCount = 0;
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      if (bg[ly * sw + lx]) continue;
      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      const r = data[gi], g = data[gi + 1], b = data[gi + 2];
      // Warm beige face/belly (r > g > b)
      if (r > 95 && r > b + 12 && g > b + 4) {
        headSumX += lx;
        headSumY += ly;
        headCount++;
      }
    }
  }
  const bodyX = headCount ? headSumX / headCount : sw * 0.5;
  const bodyY = headCount ? headSumY / headCount : sh * 0.55;

  // 3) Clear enclosed slate-blue holes between legs, under dagger arm, or between antennae
  // (excluding the upper-left grey carapace shell and the smoke puff in Row 4 Col 5!)
  if (!(row === 4 && col === 5)) {
    for (let ly = 0; ly < sh; ly++) {
      for (let lx = 0; lx < sw; lx++) {
        const idx = ly * sw + lx;
        if (bg[idx]) continue;
        // Protect the grey shell on the left/back of the beetle
        const inShell = lx < bodyX - 2 && ly > bodyY - 26 && ly < bodyY + 18;
        if (inShell) continue;
        const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
        const r = data[gi], g = data[gi + 1], b = data[gi + 2];
        if (b > r + 11 && b > g + 9 && b < 120 && r < 82) {
          bg[idx] = 1;
        }
      }
    }
  }

  // 4) Build clean RGBA buffer and find foot baseline
  const buf = new Uint8ClampedArray(sw * sh * 4);
  let footMaxY = 0, maxY = 0;

  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;

      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      let r = data[gi], g = data[gi + 1], b = data[gi + 2];

      let bgNeighbors = 0;
      let bgR = 0, bgG = 0, bgB = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= sw || ny < 0 || ny >= sh || bg[ny * sw + nx]) {
          bgNeighbors++;
          const gx = Math.max(0, Math.min(w - 1, x0 + nx));
          const gy = Math.max(0, Math.min(h - 1, y0 + ny));
          const ngi = (gy * w + gx) * 4;
          bgR += data[ngi]; bgG += data[ngi + 1]; bgB += data[ngi + 2];
        }
      }

      let alpha = 255;
      if (bgNeighbors > 0) {
        bgR /= bgNeighbors; bgG /= bgNeighbors; bgB /= bgNeighbors;
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        alpha = Math.min(255, Math.max(0, Math.round((dist - 6) * 8.5)));
        if (r < 58 && g < 58 && b < 78) {
          r = Math.round(r * 0.35);
          g = Math.round(g * 0.35);
          b = Math.round(b * 0.38);
        }
      }
      if (alpha < 24) continue;

      const bi = idx * 4;
      buf[bi] = r;
      buf[bi + 1] = g;
      buf[bi + 2] = b;
      buf[bi + 3] = alpha;

      if (ly > maxY) maxY = ly;
      if (r < 42 && g < 40 && b < 48 && lx >= bodyX - 28 && lx <= bodyX + 22) {
        if (ly > footMaxY) footMaxY = ly;
      }
    }
  }

  const footY = footMaxY > bodyY + 10 ? footMaxY : maxY;
  const cellBuf = new Uint8ClampedArray(CELL * CELL * 4);
  const targetX = ANCHOR.x + (row === 2 || row === 3 ? 6 : 4);
  const dx = Math.round(targetX - bodyX);
  const dy = Math.round(ANCHOR.y - footY);

  for (let ly = 0; ly < sh; ly++) {
    const ty = ly + dy;
    if (ty < 0 || ty >= CELL) continue;
    for (let lx = 0; lx < sw; lx++) {
      const tx = lx + dx;
      if (tx < 0 || tx >= CELL) continue;
      const si = (ly * sw + lx) * 4;
      if (!buf[si + 3]) continue;
      const di = (ty * CELL + tx) * 4;
      cellBuf[di] = buf[si];
      cellBuf[di + 1] = buf[si + 1];
      cellBuf[di + 2] = buf[si + 2];
      cellBuf[di + 3] = buf[si + 3];
    }
  }
  return cellBuf;
}

const rows = [];
for (let r = 0; r < 5; r++) {
  const rowFrames = [];
  for (let c = 0; c < 6; c++) {
    rowFrames.push(extractFrame(r, c));
  }
  rows.push(rowFrames);
}

// Row 0: idle (6 frames)
// Row 1: walk (6 frames)
// Row 2: run (6 frames - used when chasing the Viking!)
// Row 3: attack (6 frames, hitFrame: 3)
// Row 4: hurt (2 frames: cols 0, 1)
// Row 5: fall (5 frames: cols 1..5 of Row 4)
const hurtRow = [rows[4][0], rows[4][1]];
const fallRow = [rows[4][1], rows[4][2], rows[4][3], rows[4][4], rows[4][5]];

const allRows = [
  rows[0], // 0: idle
  rows[1], // 1: walk
  rows[2], // 2: run
  rows[3], // 3: attack
  hurtRow, // 4: hurt
  fallRow, // 5: fall
];

const sheetCols = 6;
const sheetRows = allRows.length;
const sheetW = sheetCols * CELL;
const sheetH = sheetRows * CELL;
const sheetRgba = new Uint8ClampedArray(sheetW * sheetH * 4);

allRows.forEach((rowFrames, r) => {
  rowFrames.forEach((cellBuf, c) => {
    for (let y = 0; y < CELL; y++) {
      const srcOff = y * CELL * 4;
      const dstOff = ((r * CELL + y) * sheetW + c * CELL) * 4;
      sheetRgba.set(cellBuf.subarray(srcOff, srcOff + CELL * 4), dstOff);
    }
  });
});

encode('public/assets/saxon-art.png', sheetW, sheetH, sheetRgba);

const meta = {
  cell: CELL,
  detail: DETAIL,
  anchor: ANCHOR,
  anims: {
    idle: { row: 0, frames: 6, loop: true, fps: 6 },
    walk: { row: 1, frames: 6, loop: true, stride: 54, steps: [0, 0.5] },
    run: { row: 2, frames: 6, loop: true, stride: 68, steps: [0, 0.5] },
    attack: {
      row: 3,
      frames: 6,
      loop: false,
      hitFrame: 3,
      durations: [0.1, 0.14, 0.14, 0.08, 0.14, 0.16],
    },
    hurt: {
      row: 4,
      frames: 2,
      loop: false,
      durations: [0.12, 0.18],
    },
    fall: {
      row: 5,
      frames: 5,
      loop: false,
      durations: [0.1, 0.1, 0.1, 0.12, 0.2],
    },
  },
};

fs.writeFileSync('public/assets/saxon-art.json', JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved public/assets/saxon-art.png (${sheetW}x${sheetH}) and public/assets/saxon-art.json`);
