import fs from 'fs';
import { decode, encode } from './png.mjs';

const srcFile = 'public/assets/viking-art.png';
const outDir = 'public/assets/base_ready';

console.log('--- GERANDO SPRITESHEET 96x96 DE ALTO DETALHE ---');
const art = decode(srcFile);

const cellSrc = 224;
const cellDst = 96;
const pasteY = 8;
const box = cellSrc / cellDst; // ~2.3333

const rowDefs = [
  { name: 'idle', row: 0, frames: 6 },
  { name: 'walk', row: 1, frames: 6 },
  { name: 'run', row: 2, frames: 6 },
  { name: 'jump', row: 3, frames: 6 },
  { name: 'attack', row: 4, frames: 6 }
];

const sheetWidth = cellDst * 6;
const sheetHeight = cellDst * rowDefs.length;
const sheetData = new Uint8ClampedArray(sheetWidth * sheetHeight * 4);

function processCell(rowIdx, colIdx) {
  const out = new Uint8ClampedArray(cellDst * cellDst * 4);

  for (let dy = 0; dy < cellDst; dy++) {
    const sy = dy - pasteY;
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

          // Proteção contra vazamento de corte anterior à esquerda no ataque
          if (rowIdx === 4 && colIdx === 2 && ix < 40) continue;
          if (rowIdx === 4 && colIdx === 4 && ix < 35) continue;

          // Proteção contra vazamento de botas da linha superior (pulo) no topo do ataque
          if (rowIdx === 4 && iy < 85) continue;

          // Proteção contra bolinha/artefato flutuante na aterrissagem do pulo
          if (rowIdx === 3 && colIdx === 5 && ix > 150) continue;

          const idx = (((rowIdx * cellSrc + iy) * art.w) + (colIdx * cellSrc + ix)) * 4;
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

for (const { name, row, frames } of rowDefs) {
  for (let col = 0; col < frames; col++) {
    const frameData = processCell(row, col);

    // Salva quadro individual
    const framePath = `${outDir}/viking_base_${name}_${col}.png`;
    encode(framePath, cellDst, cellDst, frameData);

    // Insere na folha consolidada
    for (let dy = 0; dy < cellDst; dy++) {
      for (let dx = 0; dx < cellDst; dx++) {
        const srcI = (dy * cellDst + dx) * 4;
        const dstI = (((row * cellDst + dy) * sheetWidth) + (col * cellDst + dx)) * 4;
        sheetData[dstI] = frameData[srcI];
        sheetData[dstI + 1] = frameData[srcI + 1];
        sheetData[dstI + 2] = frameData[srcI + 2];
        sheetData[dstI + 3] = frameData[srcI + 3];
      }
    }
  }
}

const sheetPath = `${outDir}/viking_base_96.png`;
encode(sheetPath, sheetWidth, sheetHeight, sheetData);
console.log(`✅ Folha detalhada gerada com sucesso em: ${sheetPath}`);
