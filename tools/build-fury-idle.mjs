import { decode, encode } from './png.mjs';

const raw = decode('docs/arte/sheet-fury-idle-new.png');
const { w, h, data } = raw;

// 1. Identify pure background
const isBg = new Uint8Array(w * h);
const queue = [];

function isPureBg(r, g, b) {
  const bri = (r + g + b) / 3;
  if ((b >= 28 && b >= r - 12 && g >= 22) || (b >= r + 6 && bri < 65) || (bri < 25 && b >= r - 5)) {
    return true;
  }
  return false;
}

function push(x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = y * w + x;
  if (isBg[idx]) return;
  const pi = idx * 4;
  if (isPureBg(data[pi], data[pi+1], data[pi+2])) {
    isBg[idx] = 1;
    queue.push(idx);
  }
}

for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

while (queue.length > 0) {
  const idx = queue.pop();
  const x = idx % w, y = (idx / w) | 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

// 2. Build local background color estimator with diffusion
const gw = Math.ceil(w / 16), gh = Math.ceil(h / 16);
const gridR = new Float32Array(gw * gh);
const gridG = new Float32Array(gw * gh);
const gridB = new Float32Array(gw * gh);
const gridCount = new Int32Array(gw * gh);

for (let y = 0; y < h; y++) {
  const gy = Math.floor(y / 16);
  for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (!isBg[idx]) continue;
    const gx = Math.floor(x / 16);
    const gi = gy * gw + gx;
    const pi = idx * 4;
    gridR[gi] += data[pi];
    gridG[gi] += data[pi+1];
    gridB[gi] += data[pi+2];
    gridCount[gi]++;
  }
}
for (let i = 0; i < gw * gh; i++) {
  if (gridCount[i] > 0) {
    gridR[i] /= gridCount[i]; gridG[i] /= gridCount[i]; gridB[i] /= gridCount[i];
  }
}
for (let pass = 0; pass < 25; pass++) {
  let filled = 0;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const gi = gy * gw + gx;
      if (gridCount[gi] > 0) continue;
      let sR = 0, sG = 0, sB = 0, num = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) {
          const ni = ny * gw + nx;
          if (gridCount[ni] > 0) {
            sR += gridR[ni]; sG += gridG[ni]; sB += gridB[ni]; num++;
          }
        }
      }
      if (num > 0) {
        gridR[gi] = sR / num; gridG[gi] = sG / num; gridB[gi] = sB / num; gridCount[gi] = 1; filled++;
      }
    }
  }
  if (filled === 0) break;
}

function getBg(x, y) {
  const gx = Math.max(0, Math.min(gw - 1.001, x / 16));
  const gy = Math.max(0, Math.min(gh - 1.001, y / 16));
  const x0 = Math.floor(gx), x1 = Math.min(gw - 1, x0 + 1);
  const y0 = Math.floor(gy), y1 = Math.min(gh - 1, y0 + 1);
  const fx = gx - x0, fy = gy - y0;
  const i00 = y0 * gw + x0, i10 = y0 * gw + x1;
  const i01 = y1 * gw + x0, i11 = y1 * gw + x1;
  return [
    (1-fx)*(1-fy)*gridR[i00] + fx*(1-fy)*gridR[i10] + (1-fx)*fy*gridR[i01] + fx*fy*gridR[i11],
    (1-fx)*(1-fy)*gridG[i00] + fx*(1-fy)*gridG[i10] + (1-fx)*fy*gridG[i01] + fx*fy*gridG[i11],
    (1-fx)*(1-fy)*gridB[i00] + fx*(1-fy)*gridB[i10] + (1-fx)*fy*gridB[i01] + fx*fy*gridB[i11],
  ];
}

// 3. Create cleaned RGBA buffer with smooth alpha un-blending
const clean = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (isBg[idx]) continue;
    const pi = idx * 4;
    const r = data[pi], g = data[pi+1], b = data[pi+2];
    const [bgR, bgG, bgB] = getBg(x, y);

    const bri = (r + g + b) / 3;
    const maxDiff = Math.max(Math.abs(r-g), Math.abs(r-b), Math.abs(g-b));
    const isBeard = (r > 90 && (r - g) > 20 && (r - b) > 35);
    const isEyes = (r > 180 && (r - g) > 50 && (r - b) > 50);
    const isFace = (r > 130 && g > 90 && b > 80 && maxDiff < 60);
    const isHelmet = (y >= 100 && y <= 215 && maxDiff < 18 && bri >= 35 && bri <= 125);
    const isCloak = (y >= 190 && y <= 315 && maxDiff < 25 && bri >= 25 && bri <= 85);
    const isBoots = (y >= 270 && y <= 335 && bri < 40 && (r + g + b) > 8);

    if (isBeard || isEyes || isFace || isHelmet || isCloak || isBoots) {
      clean[pi] = r; clean[pi+1] = g; clean[pi+2] = b; clean[pi+3] = 255;
      continue;
    }

    const dR = r - bgR, dG = g - bgG, dB = b - bgB;
    const dist = Math.hypot(dR, dG, dB);

    let alpha = Math.min(255, Math.max(0, Math.round((dist - 6) * 12.0)));
    if (r > bgR || (r - b) > (bgR - bgB) + 6) {
      alpha = Math.min(255, Math.max(alpha, Math.round(Math.max(0, dR) * 3.5)));
    }
    if (alpha <= 10) continue;

    const aNorm = alpha / 255;
    let fgR = Math.max(0, Math.min(255, Math.round((r - (1 - aNorm) * bgR) / aNorm)));
    let fgG = Math.max(0, Math.min(255, Math.round((g - (1 - aNorm) * bgG) / aNorm)));
    let fgB = Math.max(0, Math.min(255, Math.round((b - (1 - aNorm) * bgB) / aNorm)));

    clean[pi] = fgR; clean[pi+1] = fgG; clean[pi+2] = fgB; clean[pi+3] = alpha;
  }
}

// 4. Frames extraction and resampling to match Base Viking proportion 100%
const CELL = 224;
const ANCHOR = { x: 112, y: 196 };
const TARGET_BODY_HEIGHT = 104; // identical to Base Viking body height!
const RAW_BODY_HEIGHT = 200;    // helmet dome to boots ground
const SCALE = TARGET_BODY_HEIGHT / RAW_BODY_HEIGHT; // 0.52

const splits = [0, 176, 347, 514, 680, 854, 1024];
const midXs = [102, 274, 431, 599, 772, 933];
const bootYs = [312, 312, 312, 312, 312, 312];

const outSheet = new Uint8ClampedArray(CELL * 6 * CELL * 4);

for (let c = 0; c < 6; c++) {
  const mx = midXs[c];
  const by = bootYs[c];
  
  for (let cy = 0; cy < CELL; cy++) {
    for (let cx = 0; cx < CELL; cx++) {
      const rawX = mx + (cx - ANCHOR.x) / SCALE;
      const rawY = by + (cy - ANCHOR.y) / SCALE;
      
      const rX = 0.5 / SCALE;
      const rY = 0.5 / SCALE;
      
      const minX = Math.floor(rawX - rX);
      const maxX = Math.ceil(rawX + rX);
      const minY = Math.floor(rawY - rY);
      const maxY = Math.ceil(rawY + rY);
      
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0, totalWeight = 0;
      
      for (let sy = minY; sy <= maxY; sy++) {
        if (sy < 0 || sy >= h) continue;
        const wy = Math.max(0, Math.min(sy + 0.5, rawY + rY) - Math.max(sy - 0.5, rawY - rY));
        if (wy <= 0) continue;
        for (let sx = minX; sx <= maxX; sx++) {
          if (sx < splits[c] || sx >= splits[c+1]) continue;
          const wx = Math.max(0, Math.min(sx + 0.5, rawX + rX) - Math.max(sx - 0.5, rawX - rX));
          const wSample = wx * wy;
          if (wSample <= 0) continue;
          
          const pi = (sy * w + sx) * 4;
          const a = clean[pi+3];
          if (a > 0) {
            sumR += clean[pi] * a * wSample;
            sumG += clean[pi+1] * a * wSample;
            sumB += clean[pi+2] * a * wSample;
            sumA += a * wSample;
          }
          totalWeight += wSample;
        }
      }
      
      if (sumA > 0 && totalWeight > 0) {
        const outA = Math.round(sumA / totalWeight);
        if (outA > 5) {
          const outR = Math.min(255, Math.round(sumR / sumA));
          const outG = Math.min(255, Math.round(sumG / sumA));
          const outB = Math.min(255, Math.round(sumB / sumA));
          
          const destX = c * CELL + cx;
          const destY = cy;
          const di = (destY * (CELL * 6) + destX) * 4;
          outSheet[di] = outR;
          outSheet[di+1] = outG;
          outSheet[di+2] = outB;
          outSheet[di+3] = outA;
        }
      }
    }
  }
}

encode('docs/arte/sheet-fury-idle-cells.png', CELL * 6, CELL, outSheet);
console.log('Saved 6-frame fury idle sheet to docs/arte/sheet-fury-idle-cells.png');
