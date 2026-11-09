import fs from 'fs';
import { decode, encode } from './png.mjs';

const baseRaw = decode('docs/arte/sheet-base.png');
const thunderRaw = decode('docs/arte/sheet-thunder.png');
const furyRaw = decode('docs/arte/sheet-fury.png');
const { w, h } = baseRaw;

const CELL = 224;
const DETAIL = 2.2;
const ANCHOR = { x: 112, y: 196 };

const ROW_SPANS = [
  {
    y: [24, 147],
    cols: [[50, 136], [208, 304], [372, 472], [542, 639], [706, 805], [880, 970]],
  },
  {
    y: [158, 280],
    cols: [[32, 138], [190, 308], [356, 476], [520, 642], [696, 810], [862, 976]],
  },
  {
    y: [294, 404],
    cols: [[20, 184], [190, 352], [352, 520], [518, 686], [686, 850], [852, 1018]],
  },
  {
    y: [406, 548],
    cols: [[48, 128], [204, 302], [360, 500], [520, 675], [685, 815], [856, 986]],
  },
  {
    y: [550, 678],
    cols: [[20, 165], [174, 350], [352, 476], [512, 682], [685, 838], [858, 976]],
  },
];

function isBaseBackgroundPixel(r, g, b, row) {
  if (row === 4 && r > 85 && g > 85 && b > 105) return false;
  if (r < 35 && g < 32 && b < 41 && (b - r) < 12) return false;
  if (r >= b - 5 && (r > 30 || g > 30)) return false;
  if (b > r + 5 && b > g + 5 && b < 145 && r < 98) return true;
  return false;
}

// Extracts a clean character mask and RGBA buffer from `srcData` for (row, col)
function extractCleanCharacter(srcData, row, col) {
  const [y0, y1] = ROW_SPANS[row].y;
  const [x0, x1] = ROW_SPANS[row].cols[col];
  const sw = x1 - x0 + 1;
  const sh = y1 - y0 + 1;

  let bgBaseR = 30, bgBaseG = 35, bgBaseB = 58;
  {
    const cornerSamples = [];
    for (const [cx, cy] of [[2, 2], [sw - 3, 2], [2, sh - 3], [sw - 3, sh - 3]]) {
      const gi = ((y0 + cy) * w + (x0 + cx)) * 4;
      cornerSamples.push([srcData[gi], srcData[gi + 1], srcData[gi + 2]]);
    }
    cornerSamples.sort((a, b) => a[2] - b[2]);
    [bgBaseR, bgBaseG, bgBaseB] = cornerSamples[1];
  }

  const bg = new Uint8Array(sw * sh);
  const queue = [];
  const tryPush = (lx, ly) => {
    if (lx < 0 || lx >= sw || ly < 0 || ly >= sh) return;
    const idx = ly * sw + lx;
    if (bg[idx]) return;
    const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
    if (isBaseBackgroundPixel(srcData[gi], srcData[gi + 1], srcData[gi + 2], row)) {
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

  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;
      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      const r = srcData[gi], g = srcData[gi + 1], b = srcData[gi + 2];
      if (b > r + 11 && b > g + 10 && b < 120 && r < 85) bg[idx] = 1;
    }
  }

  let beardSumX = 0, beardSumY = 0, beardCount = 0;
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      if (bg[ly * sw + lx]) continue;
      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      const r = srcData[gi], g = srcData[gi + 1], b = srcData[gi + 2];
      if (r > 135 && r > g + 38 && g > b + 12) {
        beardSumX += lx;
        beardSumY += ly;
        beardCount++;
      }
    }
  }
  const beardX = beardSumX / (beardCount || 1);
  const beardY = beardSumY / (beardCount || 1);

  if (row === 3 && col >= 4) {
    for (let ly = Math.floor(beardY + 8); ly < sh; ly++) {
      for (let lx = 0; lx < sw; lx++) {
        const idx = ly * sw + lx;
        if (bg[idx]) continue;
        const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
        const r = srcData[gi], g = srcData[gi + 1], b = srcData[gi + 2];
        const isLegZone = lx >= beardX - 20 && lx <= beardX + 10 && ly <= beardY + 32 && r < 38 && g < 36 && b < 42;
        if (!isLegZone && (ly > beardY + 20 || Math.abs(lx - beardX) > 22)) {
          bg[idx] = 1;
        }
      }
    }
  }

  const buf = new Uint8ClampedArray(sw * sh * 4);
  const bodyMask = new Uint8Array(sw * sh);
  let footMaxY = 0, maxY = 0;

  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;

      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      let r = srcData[gi], g = srcData[gi + 1], b = srcData[gi + 2];

      const isSlashZone =
        srcData === baseRaw.data &&
        row === 4 &&
        (col === 1 || col === 3) &&
        (b > r + 4 || (r > 130 && g > 130 && b > 140)) &&
        r > 55 &&
        (lx > beardX + 6 || (col === 1 && ly < 20 && lx > beardX - 32));
      if (isSlashZone) {
        const lum = (r + g + b) / 3;
        const bgLum = (bgBaseR + bgBaseG + bgBaseB) / 3;
        const a = Math.min(1, Math.max(0, (lum - bgLum - 8) / Math.max(1, 245 - bgLum)));
        const alpha = Math.round(a * 255);
        if (alpha < 22) continue;
        const bi = idx * 4;
        buf[bi] = 255; buf[bi + 1] = 255; buf[bi + 2] = 255; buf[bi + 3] = alpha;
        continue;
      }

      let bgNeighbors = 0;
      let bgR = 0, bgG = 0, bgB = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= sw || ny < 0 || ny >= sh || bg[ny * sw + nx]) {
          bgNeighbors++;
          const gx = Math.max(0, Math.min(w - 1, x0 + nx));
          const gy = Math.max(0, Math.min(h - 1, y0 + ny));
          const ngi = (gy * w + gx) * 4;
          bgR += srcData[ngi]; bgG += srcData[ngi + 1]; bgB += srcData[ngi + 2];
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

      bodyMask[idx] = 1;
      const bi = idx * 4;
      buf[bi] = r; buf[bi + 1] = g; buf[bi + 2] = b; buf[bi + 3] = alpha;

      if (ly > maxY) maxY = ly;
      if (r < 42 && g < 40 && b < 48 && lx >= beardX - 30 && lx <= beardX + 18) {
        if (ly > footMaxY) footMaxY = ly;
      }
    }
  }

  const footY = footMaxY > beardY + 12 ? footMaxY : maxY;
  return { sw, sh, x0, y0, buf, bodyMask, bg, beardX, beardY, footY, bgBaseR, bgBaseG, bgBaseB };
}

function placeIntoCell(sw, sh, src, row, col, beardX, footY) {
  const cellBuf = new Uint8ClampedArray(CELL * CELL * 4);
  const targetBeardX = ANCHOR.x + (row === 2 ? 10 : row === 4 && col >= 3 ? 8 : 6);
  const dx = Math.round(targetBeardX - beardX);
  const dy = Math.round(ANCHOR.y - footY);

  for (let ly = 0; ly < sh; ly++) {
    const ty = ly + dy;
    if (ty < 0 || ty >= CELL) continue;
    for (let lx = 0; lx < sw; lx++) {
      const tx = lx + dx;
      if (tx < 0 || tx >= CELL) continue;
      const si = (ly * sw + lx) * 4;
      if (!src[si + 3]) continue;
      const di = (ty * CELL + tx) * 4;
      cellBuf[di] = src[si];
      cellBuf[di + 1] = src[si + 1];
      cellBuf[di + 2] = src[si + 2];
      cellBuf[di + 3] = src[si + 3];
    }
  }
  return cellBuf;
}

function extractPair(row, col) {
  const baseInfo = extractCleanCharacter(baseRaw.data, row, col);
  const baseCell = placeIntoCell(baseInfo.sw, baseInfo.sh, baseInfo.buf, row, col, baseInfo.beardX, baseInfo.footY);

  // Extract Thunder frame using full non-clipping bounds (THUNDER_SPANS) so no axe blade
  // (Row 0 & Row 1), overhead lightning arc (Rows 1, 2, 4), or side spark is ever cut off!
  const gBeardX = baseInfo.x0 + baseInfo.beardX;
  const gBeardY = baseInfo.y0 + baseInfo.beardY;
  const gFootY = baseInfo.y0 + baseInfo.footY;

  const THUNDER_SPANS = [
    {
      y: [20, 147],
      cols: [[34, 160], [182, 330], [348, 487], [518, 652], [682, 833], [848, 986]],
    },
    {
      y: [144, 282],
      cols: [[24, 160], [174, 314], [336, 503], [504, 652], [676, 822], [842, 988]],
    },
    {
      y: [284, 402],
      cols: [[16, 182], [182, 352], [346, 520], [516, 694], [684, 854], [846, 1018]],
    },
    {
      y: [404, 546],
      cols: [[44, 134], [198, 304], [354, 508], [495, 715], [682, 832], [852, 988]],
    },
    {
      y: [550, 678],
      cols: [[18, 165], [168, 326], [334, 484], [508, 662], [680, 838], [852, 982]],
    },
  ];

  // Row 4 Col 2 has a tall overhead lightning arc above the raised axe (up to y=534), and Col 1 has sparks up to y=545
  const ty0 = row === 4 && col === 2 ? 534 : row === 4 && col === 1 ? 545 : THUNDER_SPANS[row].y[0];
  const ty1 = THUNDER_SPANS[row].y[1];
  const [tx0, tx1] = THUNDER_SPANS[row].cols[col];
  const tsw = tx1 - tx0 + 1;
  const tsh = ty1 - ty0 + 1;

  const bData = baseRaw.data;
  const tData = thunderRaw.data;

  // Flood-fill background from cell border so solid axes (Row 0 & Row 1) and character parts
  // are never clipped even when they extend outside baseInfo.bodyMask
  const tBg = new Uint8Array(tsw * tsh);
  const tQueue = [];
  const isThunderBg = (gx, gy) => {
    const gi = (gy * w + gx) * 4;
    const r = tData[gi], g = tData[gi + 1], b = tData[gi + 2];
    // Dark outline or shadow
    if (r < 35 && g < 32 && b < 42 && (b - r) < 12) return false;
    // Warm character/beard/wood/yellow-spark or grey axe metal
    if (r >= b - 5 && (r > 30 || g > 30)) return false;
    // Bright cyan/white lightning arc or electric axe glow
    if (b > 145 || g > 115 || r > 105) return false;
    // Slate-blue background
    if (b > r + 5 && b > g + 4 && b < 146 && r < 98) return true;
    return false;
  };
  const tryPushThunder = (lx, ly) => {
    if (lx < 0 || lx >= tsw || ly < 0 || ly >= tsh) return;
    const idx = ly * tsw + lx;
    if (tBg[idx]) return;
    if (isThunderBg(tx0 + lx, ty0 + ly)) {
      tBg[idx] = 1;
      tQueue.push(idx);
    }
  };
  for (let x = 0; x < tsw; x++) { tryPushThunder(x, 0); tryPushThunder(x, tsh - 1); }
  for (let y = 0; y < tsh; y++) { tryPushThunder(0, y); tryPushThunder(tsw - 1, y); }
  while (tQueue.length) {
    const idx = tQueue.pop();
    const lx = idx % tsw, ly = (idx / tsw) | 0;
    tryPushThunder(lx + 1, ly);
    tryPushThunder(lx - 1, ly);
    tryPushThunder(lx, ly + 1);
    tryPushThunder(lx, ly - 1);
  }

  // Clear interior slate-blue holes outside baseInfo.bodyMask (e.g. between legs, under arms, between lightning arcs)
  for (let ly = 0; ly < tsh; ly++) {
    for (let lx = 0; lx < tsw; lx++) {
      const idx = ly * tsw + lx;
      if (tBg[idx]) continue;
      const gx = tx0 + lx, gy = ty0 + ly;
      if (row >= 1 && !(row === 3 && col === 3) && gx >= baseInfo.x0 && gx < baseInfo.x0 + baseInfo.sw && gy >= baseInfo.y0 && gy < baseInfo.y0 + baseInfo.sh) {
        const bIdx = (gy - baseInfo.y0) * baseInfo.sw + (gx - baseInfo.x0);
        if (baseInfo.bodyMask[bIdx]) continue;
      }
      const gi = (gy * w + gx) * 4;
      const r = tData[gi], g = tData[gi + 1], b = tData[gi + 2];
      // Slate-blue background or dim ambient blue haze (not a bright cyan arc)
      if (b > r + 10 && b > g + 8 && b < 142 && g < 110 && r < 88) {
        tBg[idx] = 1;
      }
    }
  }

  const thunderBuf = new Uint8ClampedArray(tsw * tsh * 4);
  const tRefR = baseInfo.bgBaseR, tRefG = baseInfo.bgBaseG, tRefB = baseInfo.bgBaseB;

  for (let ly = 0; ly < tsh; ly++) {
    for (let lx = 0; lx < tsw; lx++) {
      const idx = ly * tsw + lx;
      const gx = tx0 + lx, gy = ty0 + ly;

      // Remove landing dust clouds at the bottom of jump frame 5
      if (row === 3 && col === 5 && gy > gBeardY + 18 && Math.abs(gx - gBeardX) > 20) continue;
      // In Row 3 Col 3 (wide horizontal lightning beam), exclude the neighboring character bodies at gx < 530 or gx > 682
      if (row === 3 && col === 3 && (gx < 530 || gx > 682)) {
        const gi = (gy * w + gx) * 4;
        const rT = tData[gi], gT = tData[gi + 1], bT = tData[gi + 2];
        const isBrightBeam = bT > 165 && gT > 130;
        if (!isBrightBeam) continue;
      }
      // In Row 3 Cols 2, 3, 4, smoothly taper the horizontal lightning beam near the column edges so it never looks cut
      let edgeTaper = 1;
      if (row === 3 && col === 2 && gx > 462) {
        edgeTaper = Math.max(0, 1 - (gx - 462) / 44);
      } else if (row === 3 && col === 3) {
        if (gx < 535) edgeTaper = Math.max(0, 1 - (535 - gx) / 38);
        else if (gx > 668) edgeTaper = Math.max(0, 1 - (gx - 668) / 44);
      } else if (row === 3 && col === 4) {
        const gi = (gy * w + gx) * 4;
        if (tData[gi + 2] > tData[gi] + 20) {
          if (gx < 724) edgeTaper = Math.max(0, 1 - (724 - gx) / 40);
          else if (gx > 792) edgeTaper = Math.max(0, 1 - (gx - 792) / 38);
        }
      }
      if (edgeTaper <= 0) continue;

      const bi = idx * 4;
      const gi = (gy * w + gx) * 4;
      let rT = tData[gi], gT = tData[gi + 1], bT = tData[gi + 2];
      const rB = bData[gi], gB = bData[gi + 1], bB = bData[gi + 2];

      // 1) Inside baseInfo.bodyMask for Rows 1..4 (within the main character column): keep 100% solid!
      if (row >= 1 && gx >= baseInfo.x0 && gx < baseInfo.x0 + baseInfo.sw && gy >= baseInfo.y0 && gy < baseInfo.y0 + baseInfo.sh) {
        const bIdx = (gy - baseInfo.y0) * baseInfo.sw + (gx - baseInfo.x0);
        if (baseInfo.bodyMask[bIdx]) {
          thunderBuf[bi] = rT;
          thunderBuf[bi + 1] = gT;
          thunderBuf[bi + 2] = bT;
          thunderBuf[bi + 3] = baseInfo.buf[bIdx * 4 + 3];
          continue;
        }
      }

      if (tBg[idx]) continue;

      // 2) Solid character/axe pixels in Row 0 or extended axe in Row 1 (cols 0, 2):
      const isSolidCharOrAxe =
        (rT < 36 && gT < 34 && bT < 44 && (bT - rT) < 12) ||
        (rT >= bT - 6 && (rT > 34 || gT > 32) && !(bT > 140 && gT > 110));
      if (isSolidCharOrAxe && !(row === 3 && col === 3 && (gx < 530 || gx > 682))) {
        let bgNeighbors = 0;
        let bgR = 0, bgG = 0, bgB = 0;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          const nx = lx + dx, ny = ly + dy;
          if (nx < 0 || nx >= tsw || ny < 0 || ny >= tsh || tBg[ny * tsw + nx]) {
            bgNeighbors++;
            const ngi = (Math.max(0, Math.min(h - 1, ty0 + ny)) * w + Math.max(0, Math.min(w - 1, tx0 + nx))) * 4;
            bgR += tData[ngi]; bgG += tData[ngi + 1]; bgB += tData[ngi + 2];
          }
        }
        let alpha = 255;
        if (bgNeighbors > 0) {
          bgR /= bgNeighbors; bgG /= bgNeighbors; bgB /= bgNeighbors;
          const dist = Math.hypot(rT - bgR, gT - bgG, bT - bgB);
          alpha = Math.min(255, Math.max(0, Math.round((dist - 5) * 8.5)));
          if (rT < 58 && gT < 58 && bT < 78 && (rT - bT) < 10) {
            rT = Math.round(rT * 0.35);
            gT = Math.round(gT * 0.35);
            bT = Math.round(bT * 0.38);
          }
        }
        alpha = Math.round(alpha * edgeTaper);
        if (alpha >= 24) {
          thunderBuf[bi] = rT;
          thunderBuf[bi + 1] = gT;
          thunderBuf[bi + 2] = bT;
          thunderBuf[bi + 3] = alpha;
        }
        continue;
      }

      // 3) Crisp lightning arcs, glowing electric axe aura, starbursts, and yellow sparks
      const isYellowSpark = rT > 130 && gT > 95 && rT > bT + 14;
      const isCyanBolt = bT > 152 && gT > 118 && (bT - tRefB > 42 || bT > 190);
      const isWhiteCore = rT > 165 && gT > 175 && bT > 195;

      if (isYellowSpark || isCyanBolt || isWhiteCore) {
        const dR = Math.max(0, rT - tRefR);
        const dG = Math.max(0, gT - tRefG);
        const dB = Math.max(0, bT - tRefB);
        const dist = Math.hypot(dR, dG, dB);
        // In Row 3 Cols 2..4, filter out the soft circular blue background halo around the starburst
        // while keeping the bright white/cyan lightning rays!
        const minDist = row === 3 && col >= 2 && col <= 4 ? 115 : 26;
        if (dist < minDist && !isWhiteCore && !isYellowSpark) continue;

        const alpha = Math.round(Math.min(255, Math.max(0, Math.round((dist - (minDist - 16)) * 2.8))) * edgeTaper);
        if (alpha < 24) continue;
        const a = alpha / 255;
        thunderBuf[bi] = Math.min(255, Math.max(rT, Math.round((rT - tRefR * (1 - a)) / a)));
        thunderBuf[bi + 1] = Math.min(255, Math.max(gT, Math.round((gT - tRefG * (1 - a)) / a)));
        thunderBuf[bi + 2] = Math.min(255, Math.max(bT, Math.round((bT - tRefB * (1 - a)) / a)));
        thunderBuf[bi + 3] = alpha;
      }
    }
  }

  const thunderCell = placeIntoCell(tsw, tsh, thunderBuf, row, col, gBeardX - tx0, gFootY - ty0);

  // Extract Fury frame:
  // In sheet-fury.png, the character, axe, belt, dark/red flames, and crimson slashes are all
  // warm or dark-outlined against the slate-blue background. Extracting directly from furyRaw
  // within tight non-overlapping cell bounds preserves 100% of the axe (Row 0), belt, cape,
  // flames (Row 1), and crimson slashes (Rows 2-3), while anchoring to baseInfo's beardX/footY.
  const FURY_ROW_Y = [
    [24, 154],  // row 0: includes ground flames at feet
    [156, 282], // row 1: walkFury flames
    [294, 408], // row 2: runFury crimson slashes
    [410, 548], // row 3: jumpFury crimson slashes
    [552, 678], // row 4: attackFury
  ];
  const [fy0, fy1] = FURY_ROW_Y[row];
  const prevColEnd = col > 0 ? ROW_SPANS[row].cols[col - 1][1] : 0;
  const nextColStart = col < 5 ? ROW_SPANS[row].cols[col + 1][0] : w - 1;
  const fx0 = Math.max(col > 0 ? Math.ceil((prevColEnd + ROW_SPANS[row].cols[col][0]) / 2) + 2 : 4, ROW_SPANS[row].cols[col][0] - (row === 0 ? 18 : 6));
  const fx1 = Math.min(col < 5 ? Math.floor((ROW_SPANS[row].cols[col][1] + nextColStart) / 2) - 2 : w - 4, ROW_SPANS[row].cols[col][1] + (row === 0 ? 24 : 8));
  const fsw = fx1 - fx0 + 1;
  const fsh = fy1 - fy0 + 1;

  const fData = furyRaw.data;
  const fBg = new Uint8Array(fsw * fsh);
  const fQueue = [];
  const isFuryBgPixel = (r, g, b) => {
    if (r < 35 && g < 32 && b < 41 && (b - r) < 11) return false;
    if (r >= b - 4 && (r > 30 || g > 28)) return false;
    if (b > r + 4 && b > g + 4 && b < 145 && r < 102) return true;
    return false;
  };
  const tryPushFury = (lx, ly) => {
    if (lx < 0 || lx >= fsw || ly < 0 || ly >= fsh) return;
    const idx = ly * fsw + lx;
    if (fBg[idx]) return;
    const gi = ((fy0 + ly) * w + (fx0 + lx)) * 4;
    if (isFuryBgPixel(fData[gi], fData[gi + 1], fData[gi + 2])) {
      fBg[idx] = 1;
      fQueue.push(idx);
    }
  };
  for (let x = 0; x < fsw; x++) { tryPushFury(x, 0); tryPushFury(x, fsh - 1); }
  for (let y = 0; y < fsh; y++) { tryPushFury(0, y); tryPushFury(fsw - 1, y); }
  while (fQueue.length) {
    const idx = fQueue.pop();
    const lx = idx % fsw, ly = (idx / fsw) | 0;
    tryPushFury(lx + 1, ly);
    tryPushFury(lx - 1, ly);
    tryPushFury(lx, ly + 1);
    tryPushFury(lx, ly - 1);
  }
  // Punch out interior slate-blue background pockets (e.g. between legs and ground flames)
  for (let ly = 0; ly < fsh; ly++) {
    for (let lx = 0; lx < fsw; lx++) {
      const idx = ly * fsw + lx;
      if (fBg[idx]) continue;
      const gi = ((fy0 + ly) * w + (fx0 + lx)) * 4;
      const r = fData[gi], g = fData[gi + 1], b = fData[gi + 2];
      if (b > r + 9 && b > g + 8 && b < 122 && r < 86) fBg[idx] = 1;
    }
  }

  const refR = baseInfo.bgBaseR, refG = baseInfo.bgBaseG, refB = baseInfo.bgBaseB;
  const furyBuf = new Uint8ClampedArray(fsw * fsh * 4);

  for (let ly = 0; ly < fsh; ly++) {
    for (let lx = 0; lx < fsw; lx++) {
      const idx = ly * fsw + lx;
      if (fBg[idx]) continue;
      const gx = fx0 + lx, gy = fy0 + ly;

      // Remove landing dust clouds at the bottom of jump frames 4 and 5
      if (row === 3 && col >= 4 && gy > gBeardY + 18 && Math.abs(gx - gBeardX) > 20) continue;

      const gi = (gy * w + gx) * 4;
      let rF = fData[gi], gF = fData[gi + 1], bF = fData[gi + 2];

      let bgNeighbors = 0;
      let bgR = 0, bgG = 0, bgB = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= fsw || ny < 0 || ny >= fsh || fBg[ny * fsw + nx]) {
          bgNeighbors++;
          const ngi = (Math.max(0, Math.min(h - 1, fy0 + ny)) * w + Math.max(0, Math.min(w - 1, fx0 + nx))) * 4;
          bgR += fData[ngi]; bgG += fData[ngi + 1]; bgB += fData[ngi + 2];
        }
      }

      let alpha = 255;
      if (bgNeighbors > 0) {
        bgR /= bgNeighbors; bgG /= bgNeighbors; bgB /= bgNeighbors;
        const dist = Math.hypot(rF - bgR, gF - bgG, bF - bgB);
        alpha = Math.min(255, Math.max(0, Math.round((dist - 6) * 7.5)));
        if (alpha >= 24) {
          const a = alpha / 255;
          if (rF > bF + 8) {
            // Warm red/orange flame or slash border: un-blend slate-blue background
            rF = Math.min(255, Math.max(rF, Math.round((rF - refR * (1 - a)) / a)));
            gF = Math.min(255, Math.max(0, Math.round((gF - refG * (1 - a)) / a)));
            bF = Math.min(255, Math.max(0, Math.round((bF - refB * (1 - a)) / a)));
          } else if (rF < 58 && gF < 58 && bF < 78) {
            rF = Math.round(rF * 0.35);
            gF = Math.round(gF * 0.35);
            bF = Math.round(bF * 0.38);
          }
        }
      }
      if (alpha < 24) continue;

      const bi = idx * 4;
      furyBuf[bi] = rF;
      furyBuf[bi + 1] = gF;
      furyBuf[bi + 2] = bF;
      furyBuf[bi + 3] = alpha;
    }
  }

  const furyCell = placeIntoCell(fsw, fsh, furyBuf, row, col, gBeardX - fx0, gFootY - fy0);
  return { base: baseCell, thunder: thunderCell, fury: furyCell };
}

function transformCell(src, deg, cx = ANCHOR.x, cy = ANCHOR.y, ox = 0, oy = 0) {
  const dst = new Uint8ClampedArray(CELL * CELL * 4);
  const rad = (-deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const rx = x - cx - ox, ry = y - cy - oy;
      const sx = Math.round(cx + rx * cos - ry * sin);
      const sy = Math.round(cy + rx * sin + ry * cos);
      if (sx < 0 || sx >= CELL || sy < 0 || sy >= CELL) continue;
      const si = (sy * CELL + sx) * 4;
      if (!src[si + 3]) continue;
      const di = (y * CELL + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

function extractPaintedAxe(attackFrame4) {
  const dst = new Uint8ClampedArray(CELL * CELL * 4);
  const xMin = ANCHOR.x + 27, xMax = ANCHOR.x + 80;
  const yMin = ANCHOR.y - 44, yMax = ANCHOR.y + 4;
  let sumX = 0, sumY = 0, count = 0;
  for (let y = yMin; y < yMax; y++) {
    for (let x = xMin; x < xMax; x++) {
      const si = (y * CELL + x) * 4;
      if (attackFrame4[si + 3] > 50) {
        sumX += x; sumY += y; count++;
      }
    }
  }
  const cx = count ? sumX / count : ANCHOR.x + 49;
  const cy = count ? sumY / count : ANCHOR.y - 20;
  const pivX = CELL / 2, pivY = CELL / 2;

  for (let y = yMin; y < yMax; y++) {
    for (let x = xMin; x < xMax; x++) {
      const si = (y * CELL + x) * 4;
      if (!attackFrame4[si + 3]) continue;
      const tx = Math.round(pivX + (x - cx));
      const ty = Math.round(pivY + (y - cy));
      if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;
      const di = (ty * CELL + tx) * 4;
      dst[di] = attackFrame4[si];
      dst[di + 1] = attackFrame4[si + 1];
      dst[di + 2] = attackFrame4[si + 2];
      dst[di + 3] = attackFrame4[si + 3];
    }
  }
  return transformCell(dst, -85, pivX, pivY);
}

const baseRows = [];
const thunderRows = [];
const furyRows = [];
for (let r = 0; r < 5; r++) {
  const bRow = [], tRow = [], fRow = [];
  for (let c = 0; c < 6; c++) {
    const pair = extractPair(r, c);
    bRow.push(pair.base);
    tRow.push(pair.thunder);
    fRow.push(pair.fury);
  }
  baseRows.push(bRow);
  thunderRows.push(tRow);
  furyRows.push(fRow);
}

// Row 5: hurt
const hurtRow = [
  transformCell(baseRows[3][0], -8, ANCHOR.x, ANCHOR.y, -2, 0),
  transformCell(baseRows[3][4], -14, ANCHOR.x, ANCHOR.y, -4, 0),
];
// Row 6: fall
const fallRow = [
  transformCell(baseRows[3][4], -22, ANCHOR.x, ANCHOR.y - 35, -4, 0),
  transformCell(baseRows[3][4], -52, ANCHOR.x, ANCHOR.y - 35, -6, 2),
  transformCell(baseRows[3][2], -80, ANCHOR.x, ANCHOR.y - 35, -8, 4),
  transformCell(baseRows[0][0], -90, ANCHOR.x, ANCHOR.y - 35, -8, 6),
];
// Row 7: throw
const throwRow = [
  baseRows[4][0],
  baseRows[4][1],
  baseRows[4][2],
  baseRows[4][3],
  baseRows[1][2],
  baseRows[1][3],
];
// Rows 8..11: bare-handed moves
const idleBareRow = baseRows[0];
const walkBareRow = baseRows[1];
const runBareRow = baseRows[1].map((f) => transformCell(f, 8, ANCHOR.x, ANCHOR.y));
const jumpBareRow = baseRows[3];
// Row 12: spinning loose axe
const axeRow = [extractPaintedAxe(baseRows[4][4])];

// Row 18: cast (pressing L: surges with full-body lightning & fires the bolt!)
const castThunderRow = [
  thunderRows[0][2], // sparks gather
  thunderRows[4][1], // raises electrified axe overhead
  thunderRows[1][2], // full-body lightning surge + glowing eyes
  thunderRows[3][3], // blinding electric starburst blast (bolt launches here!)
  thunderRows[1][3], // golden-blue aftershock arcs across body
  thunderRows[0][4], // recovery with trailing sparks
];

// Row 24: throwFury (throwing the axe in Berserker Fury: crimson slash + roaring follow-through!)
const throwFuryRow = [
  furyRows[4][0],
  furyRows[4][1],
  furyRows[4][2],
  furyRows[2][4], // big crimson slash arc as the axe leaves his hand
  furyRows[0][2], // empty-handed berserker roar follow-through
  furyRows[0][1],
];

const allRows = [
  baseRows[0],    // 0: idle
  baseRows[1],    // 1: walk
  baseRows[2],    // 2: run
  baseRows[3],    // 3: jump
  baseRows[4],    // 4: attack
  hurtRow,        // 5: hurt
  fallRow,        // 6: fall
  throwRow,       // 7: throw
  idleBareRow,    // 8: idleBare
  walkBareRow,    // 9: walkBare
  runBareRow,     // 10: runBare
  jumpBareRow,    // 11: jumpBare
  axeRow,         // 12: axe
  thunderRows[0], // 13: idleThunder
  thunderRows[1], // 14: walkThunder
  thunderRows[2], // 15: runThunder
  thunderRows[3], // 16: jumpThunder
  thunderRows[4], // 17: attackThunder
  castThunderRow, // 18: cast
  furyRows[0],    // 19: idleFury
  furyRows[1],    // 20: walkFury
  furyRows[2],    // 21: runFury
  furyRows[3],    // 22: jumpFury
  furyRows[4],    // 23: attackFury
  throwFuryRow,   // 24: throwFury
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

encode('public/assets/viking-art.png', sheetW, sheetH, sheetRgba);

const meta = {
  cell: CELL,
  detail: DETAIL,
  anchor: ANCHOR,
  anims: {
    idle: { row: 0, frames: 6, loop: true, fps: 6 },
    walk: { row: 1, frames: 6, loop: true, stride: 64, steps: [0, 0.5] },
    run: { row: 2, frames: 6, loop: true, stride: 88, steps: [0, 0.5] },
    jump: { row: 3, frames: 6, loop: false },
    attack: {
      row: 4,
      frames: 6,
      loop: false,
      durations: [0.05, 0.08, 0.06, 0.09, 0.08, 0.09],
      hitFrame: 3,
    },
    hurt: { row: 5, frames: 2, loop: false, durations: [0.12, 0.18] },
    fall: { row: 6, frames: 4, loop: false, durations: [0.12, 0.08, 0.08, 0.2] },
    throw: {
      row: 7,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.05, 0.07, 0.08, 0.1],
      hitFrame: 3,
    },
    idleBare: { row: 8, frames: 6, loop: true, fps: 6 },
    walkBare: { row: 9, frames: 6, loop: true, stride: 64, steps: [0, 0.5] },
    runBare: { row: 10, frames: 6, loop: true, stride: 88, steps: [0, 0.5] },
    jumpBare: { row: 11, frames: 6, loop: false },
    axe: { row: 12, frames: 1, loop: false, pivot: { x: CELL / 2, y: CELL / 2 } },
    idleThunder: { row: 13, frames: 6, loop: true, fps: 8 },
    walkThunder: { row: 14, frames: 6, loop: true, stride: 64, steps: [0, 0.5] },
    runThunder: { row: 15, frames: 6, loop: true, stride: 88, steps: [0, 0.5] },
    jumpThunder: { row: 16, frames: 6, loop: false },
    attackThunder: {
      row: 17,
      frames: 6,
      loop: false,
      durations: [0.05, 0.08, 0.06, 0.09, 0.08, 0.09],
      hitFrame: 3,
    },
    cast: {
      row: 18,
      frames: 6,
      loop: false,
      durations: [0.05, 0.07, 0.07, 0.09, 0.08, 0.08],
      hitFrame: 3,
    },
    idleFury: { row: 19, frames: 6, loop: true, fps: 8 },
    walkFury: { row: 20, frames: 6, loop: true, stride: 64, steps: [0, 0.5] },
    runFury: { row: 21, frames: 6, loop: true, stride: 88, steps: [0, 0.5] },
    jumpFury: { row: 22, frames: 6, loop: false },
    attackFury: {
      row: 23,
      frames: 6,
      loop: false,
      durations: [0.05, 0.08, 0.06, 0.09, 0.08, 0.09],
      hitFrame: 3,
    },
    throwFury: {
      row: 24,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.05, 0.07, 0.08, 0.1],
      hitFrame: 3,
    },
  },
};

fs.writeFileSync('public/assets/viking-art.json', JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved public/assets/viking-art.png (${sheetW}x${sheetH}) and public/assets/viking-art.json`);
