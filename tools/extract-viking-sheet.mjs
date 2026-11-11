import fs from 'fs';
import { decode, encode } from './png.mjs';

const baseRaw = decode('docs/arte/sheet-base.png');
const thunderRaw = decode('docs/arte/sheet-thunder.png');
const furyRaw = decode('docs/arte/sheet-fury.png');
const fireRaw = decode('docs/arte/sheet-fire.png');
const baseAttacksRaw = decode('docs/arte/sheet-base-attacks.png');
const thunderAttacksRaw = decode('docs/arte/sheet-thunder-attacks.png');
const { w, h } = baseRaw;

const CELL = 224;
const DETAIL = 3.2;
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
    y: [528, 678],
    cols: [[20, 166], [166, 350], [330, 506], [506, 695], [676, 850], [836, 976]],
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
      y: [528, 678],
      cols: [[18, 166], [166, 326], [330, 506], [506, 695], [676, 850], [836, 982]],
    },
  ];

  let thunderCell;
  // For Row 0 (idle crouch with thunder), extract directly from thunderRaw so the crouching
  // Viking's head, face, cyan eyes, helmet, beard, and lightning aura are 100% solid and crisp
  // without any transparent holes or mismatched masks from the standing base sprite!
  if (row === 0) {
    const [tx0, tx1] = THUNDER_SPANS[0].cols[col];
    const ty0 = 20, ty1 = 147;
    const tsw = tx1 - tx0 + 1, tsh = ty1 - ty0 + 1;
    const tData = thunderRaw.data;

    const tBg = new Uint8Array(tsw * tsh);
    const q = [];
    const isBg = (gx, gy) => {
      const gi = (gy * w + gx) * 4;
      const r = tData[gi], g = tData[gi + 1], b = tData[gi + 2];
      if (r < 25 && g < 22 && b < 32 && (b - r) < 8) return false;
      if (r >= b - 4 && (r > 30 || g > 25)) return false;
      if (r > 42 && g > 42 && b > 42 && Math.abs(r - b) < 28) return false;
      if (b > 110 && g > 90) return false;
      if (r > 100 && g > 80 && r > b + 10) return false;
      if (r < 45 && g < 50 && b < 75 && b > r + 3) return true;
      return false;
    };

    const push = (lx, ly) => {
      if (lx < 0 || lx >= tsw || ly < 0 || ly >= tsh) return;
      const idx = ly * tsw + lx;
      if (tBg[idx]) return;
      if (isBg(tx0 + lx, ty0 + ly)) {
        tBg[idx] = 1;
        q.push(idx);
      }
    };
    for (let x = 0; x < tsw; x++) { push(x, 0); push(x, tsh - 1); }
    for (let y = 0; y < tsh; y++) { push(0, y); push(tsw - 1, y); }
    while (q.length) {
      const idx = q.pop();
      const lx = idx % tsw, ly = (idx / tsw) | 0;
      push(lx + 1, ly); push(lx - 1, ly); push(lx, ly + 1); push(lx, ly - 1);
    }

    let sumX = 0, countX = 0, footY = 139;
    for (let ly = 0; ly < tsh; ly++) {
      for (let lx = 0; lx < tsw; lx++) {
        if (tBg[ly * tsw + lx]) continue;
        const gx = tx0 + lx, gy = ty0 + ly;
        if (gy >= 70 && gy <= 115 && lx >= 20 && lx <= tsw - 20) {
          sumX += gx; countX++;
        }
      }
    }
    const centerX = countX ? sumX / countX : (tx0 + tx1) / 2;

    const cellBuf = new Uint8ClampedArray(CELL * CELL * 4);
    const targetX = ANCHOR.x + 6;
    const targetY = ANCHOR.y;
    const dx = Math.round(targetX - (centerX - tx0));
    const dy = Math.round(targetY - (footY - ty0));

    const refR = 18, refG = 22, refB = 34;

    for (let ly = 0; ly < tsh; ly++) {
      const ty = ly + dy;
      if (ty < 0 || ty >= CELL) continue;
      for (let lx = 0; lx < tsw; lx++) {
        if (tBg[ly * tsw + lx]) continue;
        const tx = lx + dx;
        if (tx < 0 || tx >= CELL) continue;

        const gi = ((ty0 + ly) * w + (tx0 + lx)) * 4;
        let r = tData[gi], g = tData[gi + 1], b = tData[gi + 2];

        let bgNeighbors = 0;
        let bgR = 0, bgG = 0, bgB = 0;
        for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          const nx = lx + ox, ny = ly + oy;
          if (nx < 0 || nx >= tsw || ny < 0 || ny >= tsh || tBg[ny * tsw + nx]) {
            bgNeighbors++;
            const ngi = ((Math.max(0, Math.min(h - 1, ty0 + ny))) * w + Math.max(0, Math.min(w - 1, tx0 + nx))) * 4;
            bgR += tData[ngi]; bgG += tData[ngi + 1]; bgB += tData[ngi + 2];
          }
        }

        let alpha = 255;
        if (bgNeighbors > 0) {
          bgR /= bgNeighbors; bgG /= bgNeighbors; bgB /= bgNeighbors;
          const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
          alpha = Math.min(255, Math.max(0, Math.round((dist - 4) * 9)));
          if (alpha < 24) continue;
          const a = alpha / 255;
          if (b > 130 && g > 100) {
            r = Math.min(255, Math.max(r, Math.round((r - refR * (1 - a)) / a)));
            g = Math.min(255, Math.max(g, Math.round((g - refG * (1 - a)) / a)));
            b = Math.min(255, Math.max(b, Math.round((b - refB * (1 - a)) / a)));
          }
        }

        const di = (ty * CELL + tx) * 4;
        cellBuf[di] = r;
        cellBuf[di + 1] = g;
        cellBuf[di + 2] = b;
        cellBuf[di + 3] = alpha;
      }
    }
    thunderCell = cellBuf;
  } else {


  const ty0 = THUNDER_SPANS[row].y[0];
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
      if (row >= 0 && !((row === 3 || row === 4) && col === 3) && gx >= baseInfo.x0 && gx < baseInfo.x0 + baseInfo.sw && gy >= baseInfo.y0 && gy < baseInfo.y0 + baseInfo.sh) {
        const bIdx = (gy - baseInfo.y0) * baseInfo.sw + (gx - baseInfo.x0);
        if (baseInfo.bodyMask[bIdx]) continue;
      }
      const gi = (gy * w + gx) * 4;
      const r = tData[gi], g = tData[gi + 1], b = tData[gi + 2];
      // Axe metal detection (cool steel with ambient glow) - never delete axe metal as background!
      const isAxeMetal = (r >= 34 && g >= 34 && b <= 110 && Math.abs(r - g) <= 22 && (b - r) <= 34);
      // Slate-blue background or dim ambient blue haze (not a bright cyan arc, nor solid axe metal)
      if (b > r + 10 && b > g + 8 && b < 142 && g < 110 && r < 88 && !isAxeMetal) {
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
      // In Row 3 Col 3 (wide horizontal lightning beam in legacy sheet), exclude neighboring character bodies
      if (row === 3 && col === 3 && (gx < 530 || gx > 682)) {
        const gi = (gy * w + gx) * 4;
        const rT = tData[gi], gT = tData[gi + 1], bT = tData[gi + 2];
        const isBrightBeam = bT > 165 && gT > 130;
        if (!isBrightBeam) continue;
      }
      // In Row 4 Col 3 (the giant horizontal lightning spear attack):
      // Exclude neighboring character bodies at gx < 525 (Col 2) or gx > 675 (Col 4)
      if (row === 4 && col === 3 && (gx < 525 || gx > 675)) {
        const gi = (gy * w + gx) * 4;
        const rT = tData[gi], gT = tData[gi + 1], bT = tData[gi + 2];
        const isBrightBeam = bT > 165 && gT > 130;
        if (!isBrightBeam) continue;
      }
      // In Row 4 Col 4 (downward axe ground-slam):
      // Exclude the horizontal beam bleed crossing above the Viking's head
      if (row === 4 && col === 4 && gx < 765 && gy >= 585 && gy <= 622) {
        const gi = (gy * w + gx) * 4;
        const isBeamBleed = tData[gi + 2] > 155 && tData[gi + 1] > 125;
        if (isBeamBleed) continue;
      }
      // Smoothly taper horizontal lightning beams near column edges so they never look harshly cut
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
      } else if (row === 4 && col === 3) {
        if (gx > 662) edgeTaper = Math.max(0, 1 - (gx - 662) / 32);
      }
      if (edgeTaper <= 0) continue;

      const bi = idx * 4;
      const gi = (gy * w + gx) * 4;
      let rT = tData[gi], gT = tData[gi + 1], bT = tData[gi + 2];
      const rB = bData[gi], gB = bData[gi + 1], bB = bData[gi + 2];

      // 1) Inside baseInfo.bodyMask for Rows 0..4 (within the main character column): keep 100% solid!
      if (row >= 0 && gx >= baseInfo.x0 && gx < baseInfo.x0 + baseInfo.sw && gy >= baseInfo.y0 && gy < baseInfo.y0 + baseInfo.sh) {
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

      // 2) Solid character/axe pixels in Row 0 or extended axe in Row 1..4:
      const isAxeMetal = (rT >= 34 && gT >= 34 && bT <= 110 && Math.abs(rT - gT) <= 22 && (bT - rT) <= 34);
      const isSolidCharOrAxe =
        isAxeMetal ||
        (rT < 36 && gT < 34 && bT < 44 && (bT - rT) < 12) ||
        (rT >= bT - 6 && (rT > 34 || gT > 32) && !(bT > 140 && gT > 110));
      if (isSolidCharOrAxe && !(row === 3 && col === 3 && (gx < 530 || gx > 682)) && !(row === 4 && col === 3 && (gx < 525 || gx > 675))) {
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

    thunderCell = placeIntoCell(tsw, tsh, thunderBuf, row, col, gBeardX - tx0, gFootY - ty0);
  }

  // Extract Fury frame:
  // In sheet-fury.png, the 5 rows correspond to the 5 distinct powers of Berserker Fury:
  // Row 0: idle & walk with rising ground flames at feet and glowing red eyes
  // Row 1: runFury full flaming aura sprint (engulfed in crimson/black fire)
  // Row 2: attackFury / attackComboFury (horizontal slashes with giant crimson crescent & sparks)
  // Row 3: attackPlungeFury & jumpFury (mid-air dive with giant vertical flame crescent & crater landing)
  // Row 4: attackOverheadFury & throwFury (heavy overhead ground smashing cleave & throw windup)
  const FURY_ROW_Y = [
    [20, 150],  // row 0: idle & walk with ground flames at feet
    [148, 290], // row 1: runFury full flaming aura sprint
    [288, 422], // row 2: attackFury / attackComboFury crimson crescents
    [420, 558], // row 3: attackPlungeFury & jumpFury mid-air dive & landing
    [555, 680], // row 4: attackOverheadFury & throwFury heavy ground smash
  ];
  const FURY_COLS = [
    [0, 160, 332, 494, 664, 832, 1024], // row 0
    [0, 150, 345, 500, 672, 835, 1024], // row 1
    [0, 175, 345, 515, 685, 854, 1024], // row 2
    [0, 160, 335, 505, 670, 842, 1024], // row 3
    [0, 165, 325, 490, 660, 835, 1024], // row 4
  ];
  const [fy0, fy1] = FURY_ROW_Y[row];
  const fx0 = FURY_COLS[row][col];
  const fx1 = FURY_COLS[row][col + 1];
  const fsw = fx1 - fx0;
  const fsh = fy1 - fy0;

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

  // Extract Fire frame:
  // For Row 0, use own character mask (crouching with flames / sparks).
  // For Rows 1..4, use baseInfo.bodyMask for 100% solid character body, and extract
  // the gorgeous blazing flames, burning axe, fire stream, and golden embers outside!
  const fireCharInfo = row === 0 ? extractCleanCharacter(fireRaw.data, row, col) : baseInfo;

  const FIRE_ROW_Y = [
    [10, 150],  // row 0: flames at feet & raised fiery arm
    [145, 285], // row 1: walkFire full body blazing flames
    [280, 415], // row 2: runFire blazing running flames & fiery projectiles
    [405, 545], // row 3: jumpFire blazing starburst / horizontal fire stream
    [548, 685], // row 4: attackFire fiery axe slam
  ];
  const [fy0_f, fy1_f] = FIRE_ROW_Y[row];
  const prevColEndFire = col > 0 ? ROW_SPANS[row].cols[col - 1][1] : 0;
  const nextColStartFire = col < 5 ? ROW_SPANS[row].cols[col + 1][0] : w - 1;
  const fx0_f = Math.max(col > 0 ? Math.ceil((prevColEndFire + ROW_SPANS[row].cols[col][0]) / 2) + 2 : 4, ROW_SPANS[row].cols[col][0] - (row === 0 || row === 1 ? 24 : 10));
  const fx1_f = Math.min(col < 5 ? Math.floor((ROW_SPANS[row].cols[col][1] + nextColStartFire) / 2) - 2 : w - 4, ROW_SPANS[row].cols[col][1] + (row === 2 || row === 3 ? 36 : 14));
  const fire_sw = fx1_f - fx0_f + 1;
  const fire_sh = fy1_f - fy0_f + 1;

  const fiData = fireRaw.data;
  const fiBg = new Uint8Array(fire_sw * fire_sh);
  const fiQueue = [];
  const isFireBgPixel = (r, g, b, gx, gy) => {
    // Dark brown/purple smoke cloud around row 0 col 3 (raised fiery arm)
    if (row === 0 && col === 3) {
      if (gy <= 38) return true;
      if (gx < 570 && gy < 90 && (r < 110 && g < 80)) return true;
      if (gx < 564) return true;
    }
    // Dark black ink outline or shadow
    if (r < 35 && g < 32 && b < 41 && (b - r) < 11) return false;
    // Any warm orange/yellow flame or beard pixel
    if (r >= b - 4 && (r > 30 || g > 28)) return false;
    // Bright white-hot flame core
    if (r > 160 && g > 130) return false;
    // Slate-blue background
    if (b > r + 4 && b > g + 4 && b < 145 && r < 102) return true;
    return false;
  };

  const tryPushFire = (lx, ly) => {
    if (lx < 0 || lx >= fire_sw || ly < 0 || ly >= fire_sh) return;
    const idx = ly * fire_sw + lx;
    if (fiBg[idx]) return;
    const gx = fx0_f + lx, gy = fy0_f + ly;
    if (isFireBgPixel(fiData[((gy * w + gx) * 4)], fiData[((gy * w + gx) * 4) + 1], fiData[((gy * w + gx) * 4) + 2], gx, gy)) {
      fiBg[idx] = 1;
      fiQueue.push(idx);
    }
  };
  for (let x = 0; x < fire_sw; x++) { tryPushFire(x, 0); tryPushFire(x, fire_sh - 1); }
  for (let y = 0; y < fire_sh; y++) { tryPushFire(0, y); tryPushFire(fire_sw - 1, y); }
  while (fiQueue.length) {
    const idx = fiQueue.pop();
    const lx = idx % fire_sw, ly = (idx / fire_sw) | 0;
    tryPushFire(lx + 1, ly);
    tryPushFire(lx - 1, ly);
    tryPushFire(lx, ly + 1);
    tryPushFire(lx, ly - 1);
  }

  // Punch out interior slate-blue background pockets
  for (let ly = 0; ly < fire_sh; ly++) {
    for (let lx = 0; lx < fire_sw; lx++) {
      const idx = ly * fire_sw + lx;
      if (fiBg[idx]) continue;
      const gi = ((fy0_f + ly) * w + (fx0_f + lx)) * 4;
      const r = fiData[gi], g = fiData[gi + 1], b = fiData[gi + 2];
      if (b > r + 9 && b > g + 8 && b < 122 && r < 86) fiBg[idx] = 1;
    }
  }

  const fireBuf = new Uint8ClampedArray(fire_sw * fire_sh * 4);
  for (let ly = 0; ly < fire_sh; ly++) {
    for (let lx = 0; lx < fire_sw; lx++) {
      const idx = ly * fire_sw + lx;
      if (fiBg[idx]) continue;
      const gx = fx0_f + lx, gy = fy0_f + ly;

      // Remove landing dust clouds at the bottom of jump frames 4 and 5
      if (row === 3 && col >= 4 && gy > gBeardY + 18 && Math.abs(gx - gBeardX) > 20) continue;

      // Split cleanly between row 3 col 2 and col 3
      if (row === 3 && col === 2 && gx > 470) continue;
      if (row === 3 && col === 3 && gx <= 470) continue;

      const gi = (gy * w + gx) * 4;
      let rFi = fiData[gi], gFi = fiData[gi + 1], bFi = fiData[gi + 2];
      const bi = idx * 4;

      // 1) Inside character bodyMask: keep 100% solid character pixel!
      if (gx >= fireCharInfo.x0 && gx < fireCharInfo.x0 + fireCharInfo.sw && gy >= fireCharInfo.y0 && gy < fireCharInfo.y0 + fireCharInfo.sh) {
        const cIdx = (gy - fireCharInfo.y0) * fireCharInfo.sw + (gx - fireCharInfo.x0);
        if (fireCharInfo.bodyMask[cIdx]) {
          fireBuf[bi] = rFi;
          fireBuf[bi + 1] = gFi;
          fireBuf[bi + 2] = bFi;
          fireBuf[bi + 3] = fireCharInfo.buf[cIdx * 4 + 3];
          continue;
        }
      }

      // 2) Outside bodyMask: extract flames, sparks, glowing embers, and fire blasts
      let bgNeighbors = 0;
      let bgR = 0, bgG = 0, bgB = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= fire_sw || ny < 0 || ny >= fire_sh || fiBg[ny * fire_sw + nx]) {
          bgNeighbors++;
          const ngi = (Math.max(0, Math.min(h - 1, fy0_f + ny)) * w + Math.max(0, Math.min(w - 1, fx0_f + nx))) * 4;
          bgR += fiData[ngi]; bgG += fiData[ngi + 1]; bgB += fiData[ngi + 2];
        }
      }

      let alpha = 255;
      if (bgNeighbors > 0) {
        bgR /= bgNeighbors; bgG /= bgNeighbors; bgB /= bgNeighbors;
        const dist = Math.hypot(rFi - bgR, gFi - bgG, bFi - bgB);
        alpha = Math.min(255, Math.max(0, Math.round((dist - 6) * 7.5)));
        if (alpha >= 24) {
          const a = alpha / 255;
          if (rFi > bFi + 8) {
            // Warm orange/yellow flame: un-blend slate-blue background
            rFi = Math.min(255, Math.max(rFi, Math.round((rFi - refR * (1 - a)) / a)));
            gFi = Math.min(255, Math.max(0, Math.round((gFi - refG * (1 - a)) / a)));
            bFi = Math.min(255, Math.max(0, Math.round((bFi - refB * (1 - a)) / a)));
          } else if (rFi < 58 && gFi < 58 && bFi < 78) {
            rFi = Math.round(rFi * 0.35);
            gFi = Math.round(gFi * 0.35);
            bFi = Math.round(bFi * 0.38);
          }
        }
      }
      if (alpha < 24) continue;

      fireBuf[bi] = rFi;
      fireBuf[bi + 1] = gFi;
      fireBuf[bi + 2] = bFi;
      fireBuf[bi + 3] = alpha;
    }
  }

  const fireCell = placeIntoCell(fire_sw, fire_sh, fireBuf, row, col, gBeardX - fx0_f, gFootY - fy0_f);
  return { base: baseCell, thunder: thunderCell, fury: furyCell, fire: fireCell };
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
const fireRows = [];
for (let r = 0; r < 5; r++) {
  const bRow = [], tRow = [], fRow = [], fiRow = [];
  for (let c = 0; c < 6; c++) {
    const pair = extractPair(r, c);
    bRow.push(pair.base);
    tRow.push(pair.thunder);
    fRow.push(pair.fury);
    fiRow.push(pair.fire);
  }
  baseRows.push(bRow);
  thunderRows.push(tRow);
  furyRows.push(fRow);
  fireRows.push(fiRow);
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

// Row 30: castFire (pressing U: gathers flames & unleashes running fire wave / stream!)
const castFireRow = [
  fireRows[0][1], // crouches as ground flames erupt
  fireRows[4][1], // raises flaming axe overhead
  fireRows[1][2], // full body fire surge + blazing glowing eyes
  fireRows[3][2], // striking/thrusting forward, fiery blast launches!
  fireRows[3][3], // massive flame blast / wave travelling out
  fireRows[0][4], // fiery recovery with trailing embers
];

// Extract new high-impact attacks: Overhead chop, 360 Spin Whirlwind, Downward Plunge slam, and Slash Combo
function extractAttackSheetBg(rawImg, isThunder) {
  const w = rawImg.w, h = rawImg.h, data = rawImg.data;
  const isSky = (r, g, b) => {
    if (r > 105 || g > 95 || b > 115) return false;
    if (r > b + 2) return false;
    if (isThunder && ((b > 110 && g > 90) || (r > 110 && g > 90 && b < 100))) return false;
    if (r <= 24 && g <= 20 && b <= 25) return false;
    if (b >= 25 && b <= 95 && b >= r + 4 && b >= g + 4 && r <= 80 && g <= 75) return true;
    return false;
  };
  const bg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4;
    if (isSky(data[pi], data[pi + 1], data[pi + 2])) bg[i] = 1;
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

const baseAttacksBg = extractAttackSheetBg(baseAttacksRaw, false);
const thunderAttacksBg = extractAttackSheetBg(thunderAttacksRaw, true);

const attackRowDefs = {
  overhead: {
    y0: 8,
    y1: 148,
    footY: 141,
    divs: [0, 175, 345, 530, 665, 850, 1024],
  },
  spin: {
    y0: 148,
    y1: 284,
    footY: 272,
    divs: [0, 173, 348, 518, 690, 852, 1024],
  },
  plunge: {
    y0: 405,
    y1: 552,
    footY: 544,
    divs: [0, 168, 340, 505, 687, 838, 1024],
  },
  combo: {
    y0: 550,
    y1: 685,
    footY: 671,
    divs: [0, 168, 353, 547, 692, 846, 1024],
    shiftX: [0, 0, -8, 0, 0, 0],
  },
};

function extractAttackRow(rawImg, bg, rowDef, isThunder) {
  const w = rawImg.w, h = rawImg.h, data = rawImg.data;
  const frames = [];
  const divs = rowDef.divs;
  for (let c = 0; c < 6; c++) {
    const xMin = divs[c], xMax = divs[c + 1];
    let sumX = 0, countX = 0;
    for (let y = rowDef.y0; y < rowDef.y1; y++) {
      for (let x = xMin; x < xMax; x++) {
        const idx = y * w + x;
        if (bg[idx]) continue;
        const pi = idx * 4;
        const r = data[pi], g = data[pi + 1], b = data[pi + 2];
        if ((r >= b + 4 && (r > 30 || g > 25)) || (r <= 24 && g <= 20 && b <= 25)) {
          sumX += x;
          countX++;
        }
      }
    }
    const cx = countX > 50 ? Math.round(sumX / countX) : Math.round((xMin + xMax) / 2);
    const footY = rowDef.footY;
    const shift = rowDef.shiftX ? (rowDef.shiftX[c] || 0) : 0;
    const cellBuf = new Uint8ClampedArray(CELL * CELL * 4);

    for (let gy = rowDef.y0; gy < rowDef.y1; gy++) {
      for (let gx = xMin; gx < xMax; gx++) {
        const idx = gy * w + gx;
        if (bg[idx]) continue;
        const tx = gx - cx + ANCHOR.x + shift;
        const ty = gy - footY + ANCHOR.y;
        if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;

        const pi = idx * 4;
        let r = data[pi], g = data[pi + 1], b = data[pi + 2];
        let bgN = 0, bgR = 0, bgG = 0, bgB = 0;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nx = gx + ox, ny = gy + oy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || bg[ny * w + nx]) {
            bgN++;
            const npi = (Math.max(0, Math.min(h - 1, ny)) * w + Math.max(0, Math.min(w - 1, nx))) * 4;
            bgR += data[npi];
            bgG += data[npi + 1];
            bgB += data[npi + 2];
          }
        }
        let alpha = 255;
        if (bgN > 0) {
          bgR /= bgN; bgG /= bgN; bgB /= bgN;
          const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
          alpha = Math.min(255, Math.max(0, Math.round((dist - 4) * 8.5)));
          if (alpha < 16) continue;
          const a = alpha / 255;
          if ((r > 120 && g > 120 && b > 120) || (isThunder && b > 110 && g > 90)) {
            r = Math.min(255, Math.max(0, Math.round((r - bgR * (1 - a)) / a)));
            g = Math.min(255, Math.max(0, Math.round((g - bgG * (1 - a)) / a)));
            b = Math.min(255, Math.max(0, Math.round((b - bgB * (1 - a)) / a)));
          }
        }
        const edgeDist = Math.min(gx - xMin, xMax - 1 - gx);
        if (edgeDist < 2) alpha = Math.round(alpha * ((edgeDist + 1) / 3));

        const di = (ty * CELL + tx) * 4;
        cellBuf[di] = r;
        cellBuf[di + 1] = g;
        cellBuf[di + 2] = b;
        cellBuf[di + 3] = alpha;
      }
    }
    frames.push(cellBuf);
  }
  return frames;
}

const attackComboRow = extractAttackRow(baseAttacksRaw, baseAttacksBg, attackRowDefs.combo, false);
const attackSpinRow = extractAttackRow(baseAttacksRaw, baseAttacksBg, attackRowDefs.spin, false);
const attackOverheadRow = extractAttackRow(baseAttacksRaw, baseAttacksBg, attackRowDefs.overhead, false);
const attackPlungeRow = extractAttackRow(baseAttacksRaw, baseAttacksBg, attackRowDefs.plunge, false);

const attackComboThunderRow = extractAttackRow(thunderAttacksRaw, thunderAttacksBg, attackRowDefs.combo, true);
const attackSpinThunderRow = extractAttackRow(thunderAttacksRaw, thunderAttacksBg, attackRowDefs.spin, true);
const attackOverheadThunderRow = extractAttackRow(thunderAttacksRaw, thunderAttacksBg, attackRowDefs.overhead, true);
const attackPlungeThunderRow = extractAttackRow(thunderAttacksRaw, thunderAttacksBg, attackRowDefs.plunge, true);

// Row 13: idleThunder (smooth ping-pong breathing cycle with crackling thunder - never chops when idle!)
const idleThunderRow = [
  thunderRows[0][0],
  thunderRows[0][1],
  thunderRows[0][2],
  thunderRows[0][3],
  thunderRows[0][2],
  thunderRows[0][1],
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
  idleThunderRow, // 13: idleThunder
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
  fireRows[0],    // 25: idleFire
  fireRows[1],    // 26: walkFire
  fireRows[2],    // 27: runFire
  fireRows[3],    // 28: jumpFire
  fireRows[4],    // 29: attackFire
  castFireRow,    // 30: castFire
  attackComboRow,         // 31: attackCombo
  attackSpinRow,          // 32: attackSpin
  attackOverheadRow,      // 33: attackOverhead
  attackPlungeRow,        // 34: attackPlunge
  attackComboThunderRow,  // 35: attackComboThunder
  attackSpinThunderRow,   // 36: attackSpinThunder
  attackOverheadThunderRow, // 37: attackOverheadThunder
  attackPlungeThunderRow, // 38: attackPlungeThunder
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
    walkFury: { row: 19, frames: 6, loop: true, stride: 64, steps: [0, 0.5] },
    runFury: { row: 20, frames: 6, loop: true, stride: 96, steps: [0, 0.5] },
    jumpFury: { row: 22, frames: 6, loop: false },
    attackFury: {
      row: 21,
      frames: 6,
      loop: false,
      durations: [0.05, 0.06, 0.06, 0.08, 0.08, 0.09],
      hitFrames: [1, 2, 3, 4],
      hitFrame: 3,
    },
    attackComboFury: {
      row: 21,
      frames: 6,
      loop: false,
      durations: [0.05, 0.06, 0.06, 0.08, 0.08, 0.09],
      hitFrames: [1, 2, 3, 4],
      hitFrame: 3,
    },
    attackSpinFury: {
      row: 21,
      frames: 6,
      loop: false,
      durations: [0.05, 0.05, 0.05, 0.06, 0.06, 0.07],
      hitFrames: [1, 2, 3, 4],
      hitFrame: 2,
    },
    attackOverheadFury: {
      row: 23,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrames: [2, 3, 4],
      hitFrame: 3,
    },
    attackPlungeFury: {
      row: 22,
      frames: 6,
      loop: false,
      durations: [0.05, 0.06, 0.07, 0.09, 0.08, 0.09],
      hitFrames: [2, 3, 4],
      hitFrame: 3,
    },
    throwFury: {
      row: 24,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.05, 0.07, 0.08, 0.1],
      hitFrame: 3,
    },
    idleFire: { row: 25, frames: 6, loop: true, fps: 8 },
    walkFire: { row: 26, frames: 6, loop: true, stride: 64, steps: [0, 0.5] },
    runFire: { row: 27, frames: 6, loop: true, stride: 88, steps: [0, 0.5] },
    jumpFire: { row: 28, frames: 6, loop: false },
    attackFire: {
      row: 29,
      frames: 6,
      loop: false,
      durations: [0.05, 0.08, 0.06, 0.09, 0.08, 0.09],
      hitFrame: 3,
    },
    castFire: {
      row: 30,
      frames: 6,
      loop: false,
      durations: [0.05, 0.07, 0.07, 0.09, 0.08, 0.08],
      hitFrame: 3,
    },
    attackCombo: {
      row: 31,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrames: [1, 2, 3],
      hitFrame: 1,
    },
    attackSpin: {
      row: 32,
      frames: 6,
      loop: false,
      durations: [0.05, 0.05, 0.05, 0.06, 0.06, 0.07],
      hitFrames: [1, 2, 3, 4],
      hitFrame: 2,
    },
    attackOverhead: {
      row: 33,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrame: 2,
    },
    attackPlunge: {
      row: 34,
      frames: 6,
      loop: false,
      durations: [0.06, 0.06, 0.08, 0.1, 0.08, 0.09],
      hitFrame: 3,
    },
    attackComboThunder: {
      row: 35,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrames: [1, 2, 3],
      hitFrame: 1,
    },
    attackSpinThunder: {
      row: 36,
      frames: 6,
      loop: false,
      durations: [0.05, 0.05, 0.05, 0.06, 0.06, 0.07],
      hitFrames: [1, 2, 3, 4],
      hitFrame: 2,
    },
    attackOverheadThunder: {
      row: 37,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrame: 2,
    },
    attackPlungeThunder: {
      row: 38,
      frames: 6,
      loop: false,
      durations: [0.06, 0.06, 0.08, 0.1, 0.08, 0.09],
      hitFrame: 3,
    },
  },
};

fs.writeFileSync('public/assets/viking-art.json', JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved public/assets/viking-art.png (${sheetW}x${sheetH}) and public/assets/viking-art.json`);
