import fs from 'fs';
import { decode, encode } from './png.mjs';

const srcFile = 'public/assets/viking-art.png';
const outDir = 'public/assets/base_ready';

console.log('--- GERANDO SPRITESHEET COMPLETA 96x96 COM TODOS OS ATAQUES ---');
const art = decode(srcFile);

const cellSrc = 224;
const cellDst = 96;
const pasteY = 8;
const box = cellSrc / cellDst; // ~2.3333

const animDefs = [
  {
    name: 'idle',
    srcRow: 0,
    dstRow: 0,
    frames: 6,
    meta: { row: 0, frames: 6, loop: true, fps: 6 }
  },
  {
    name: 'walk',
    srcRow: 1,
    dstRow: 1,
    frames: 6,
    meta: { row: 1, frames: 6, loop: true, stride: 64, steps: [0, 0.5] }
  },
  {
    name: 'run',
    srcRow: 2,
    dstRow: 2,
    frames: 6,
    meta: { row: 2, frames: 6, loop: true, stride: 88, steps: [0, 0.5] }
  },
  {
    name: 'jump',
    srcRow: 3,
    dstRow: 3,
    frames: 6,
    meta: { row: 3, frames: 6, loop: false }
  },
  {
    name: 'attack',
    srcRow: 4,
    dstRow: 4,
    frames: 6,
    meta: {
      row: 4,
      frames: 6,
      loop: false,
      durations: [0.05, 0.08, 0.06, 0.09, 0.08, 0.09],
      hitFrame: 3
    }
  },
  {
    name: 'attackCombo',
    srcRow: 35,
    dstRow: 5,
    frames: 6,
    meta: {
      row: 5,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrames: [1, 2, 3],
      hitFrame: 1
    }
  },
  {
    name: 'attackSpin',
    srcRow: 36,
    dstRow: 6,
    frames: 6,
    meta: {
      row: 6,
      frames: 6,
      loop: false,
      durations: [0.05, 0.05, 0.05, 0.06, 0.06, 0.07],
      hitFrames: [1, 2, 3, 4],
      hitFrame: 2
    }
  },
  {
    name: 'attackOverhead',
    srcRow: 37,
    dstRow: 7,
    frames: 6,
    meta: {
      row: 7,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.07, 0.08, 0.08, 0.1],
      hitFrame: 2
    }
  },
  {
    name: 'attackPlunge',
    srcRow: 38,
    dstRow: 8,
    frames: 6,
    meta: {
      row: 8,
      frames: 6,
      loop: false,
      durations: [0.06, 0.06, 0.08, 0.1, 0.08, 0.09],
      hitFrame: 3
    }
  },
  {
    name: 'throw',
    srcRow: 7,
    dstRow: 9,
    frames: 6,
    meta: {
      row: 9,
      frames: 6,
      loop: false,
      durations: [0.06, 0.08, 0.05, 0.07, 0.08, 0.1],
      hitFrame: 3
    }
  },
  {
    name: 'hurt',
    srcRow: 5,
    dstRow: 10,
    frames: 2,
    meta: { row: 10, frames: 2, loop: false, durations: [0.12, 0.18] }
  },
  {
    name: 'fall',
    srcRow: 6,
    dstRow: 11,
    frames: 4,
    meta: { row: 11, frames: 4, loop: false, durations: [0.12, 0.08, 0.08, 0.2] }
  },
  {
    name: 'axe',
    srcRow: 12,
    dstRow: 12,
    frames: 1,
    meta: { row: 12, frames: 1, pivot: { x: 45, y: 47 } }
  }
];

const totalRows = animDefs.length;
const sheetWidth = cellDst * 6;
const sheetHeight = cellDst * totalRows;
const sheetData = new Uint8ClampedArray(sheetWidth * sheetHeight * 4);

function processCell(srcRow, dstRow, colIdx) {
  const out = new Uint8ClampedArray(cellDst * cellDst * 4);
  const curPasteY = srcRow === 12 ? 0 : pasteY;

  for (let dy = 0; dy < cellDst; dy++) {
    const sy = dy - curPasteY;
    if (sy < 0 || sy >= cellDst) continue;
    const srcY0 = sy * box;
    const srcY1 = (sy + 1) * box;

    for (let dx = 0; dx < cellDst; dx++) {
      const srcX0 = dx * box;
      const srcX1 = (dx + 1) * box;

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, totalW = 0;

      const iy0 = Math.floor(srcY0);
      const iy1 = Math.min(cellSrc - 1, Math.floor(srcY1));
      const ix0 = Math.floor(srcX0);
      const ix1 = Math.min(cellSrc - 1, Math.floor(srcX1));

      for (let iy = iy0; iy <= iy1; iy++) {
        const wy = Math.min(srcY1, iy + 1) - Math.max(srcY0, iy);
        if (wy <= 0) continue;

        for (let ix = ix0; ix <= ix1; ix++) {
          const wx = Math.min(srcX1, ix + 1) - Math.max(srcX0, ix);
          if (wx <= 0) continue;

          // Proteções estritas contra vazamento de corte ou botas entre frames:
          // 1. Attack / Throw: corte vizinho à esquerda
          if ((srcRow === 4 || srcRow === 7) && colIdx === 2 && ix < 40) continue;
          if ((srcRow === 4 || srcRow === 7) && colIdx === 4 && ix < 35) continue;

          // 2. Attack / Throw: botas da linha superior (pulo) no topo
          if ((srcRow === 4 || srcRow === 7) && iy < 85) continue;

          // 3. Jump: bolinha flutuante residual no frame 5 (aterrissagem)
          if (srcRow === 3 && colIdx === 5 && ix > 150) continue;

          const idx = (((srcRow * cellSrc + iy) * art.w) + (colIdx * cellSrc + ix)) * 4;
          const a = art.data[idx + 3];
          if (a > 10) {
            const w = wx * wy * (a / 255);
            rSum += art.data[idx] * w;
            gSum += art.data[idx + 1] * w;
            bSum += art.data[idx + 2] * w;
            totalW += w;
            aSum += a * wx * wy;
          }
        }
      }

      if (totalW > 0.1 && (aSum / (box * box)) > 45) {
        let r = rSum / totalW;
        let g = gSum / totalW;
        let b = bSum / totalW;

        // Realce de vivacidade (1.20) e contraste de detalhes (1.15)
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = Math.min(255, Math.max(0, Math.round(1.15 * (gray + 1.20 * (r - gray)))));
        g = Math.min(255, Math.max(0, Math.round(1.15 * (gray + 1.20 * (g - gray)))));
        b = Math.min(255, Math.max(0, Math.round(1.15 * (gray + 1.20 * (b - gray)))));

        const dstIdx = (dy * cellDst + dx) * 4;
        out[dstIdx] = r;
        out[dstIdx + 1] = g;
        out[dstIdx + 2] = b;
        out[dstIdx + 3] = (aSum / (box * box)) > 140 ? 255 : Math.round(aSum / (box * box));
      }
    }
  }

  return out;
}

const animsJson = {};

for (const anim of animDefs) {
  animsJson[anim.name] = anim.meta;

  for (let col = 0; col < anim.frames; col++) {
    const frameData = processCell(anim.srcRow, anim.dstRow, col);

    // Salva quadro individual
    const framePath = `${outDir}/viking_base_${anim.name}_${col}.png`;
    encode(framePath, cellDst, cellDst, frameData);

    // Insere na folha consolidada
    for (let dy = 0; dy < cellDst; dy++) {
      for (let dx = 0; dx < cellDst; dx++) {
        const srcI = (dy * cellDst + dx) * 4;
        const dstI = (((anim.dstRow * cellDst + dy) * sheetWidth) + (col * cellDst + dx)) * 4;
        sheetData[dstI] = frameData[srcI];
        sheetData[dstI + 1] = frameData[srcI + 1];
        sheetData[dstI + 2] = frameData[srcI + 2];
        sheetData[dstI + 3] = frameData[srcI + 3];
      }
    }
  }
}

// Salva folha consolidada
const sheetPath = `${outDir}/viking_base_96.png`;
encode(sheetPath, sheetWidth, sheetHeight, sheetData);

// Salva viking_base_96.json
const fullJson = {
  cell: cellDst,
  cols: 6,
  rows: totalRows,
  anims: animsJson
};

fs.writeFileSync(`${outDir}/viking_base_96.json`, JSON.stringify(fullJson, null, 2));

console.log(`✅ Folha consolidada gerada com ${totalRows} linhas em: ${sheetPath}`);
console.log(`✅ Metadados salvos em: ${outDir}/viking_base_96.json`);
