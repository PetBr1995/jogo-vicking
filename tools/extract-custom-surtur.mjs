import fs from 'fs';
import { decode, encode } from './png.mjs';

console.log('=== EXTRAÇÃO CALIBRADA DA FÚRIA DE SURTUR ===');

const srcPath = '/tmp/surtur_sheet.png';
const outDir = 'public/sprites/';

const st = decode(srcPath);
const w = st.w, h = st.h;

// Verificador estrito de fundo para eliminar 100% dos resíduos e halos azuis
function isBackground(r, g, b) {
  // Cores quentes (fogo, chamas, faíscas, olhos incandescentes, barba ruiva)
  if (r > b + 10) return false;
  if (r > 100 && g > 75) return false;
  // Metal do machado (cinza neutro)
  if (Math.abs(r - b) < 12 && Math.abs(r - g) < 12 && r > 28) return false;
  // Núcleo incandescente branco/amarelado das chamas
  if (r > 140 && g > 130) return false;
  // Contorno preto neutro do personagem
  if (r < 24 && g < 24 && b < 28 && Math.abs(b - r) <= 4) return false;
  // Fundo vinheta ardósia/azul escuro: dominância nítida de azul
  if (b > r + 5 && b > g + 2 && r < 75 && g < 85 && b < 125) return true;
  if (r < 32 && g < 36 && b < 58 && (b - r) >= 4) return true;
  return false;
}

// Escala idêntica ao Base Viking
const SCALE = 0.52;

// Alvos exatos de barba e pés medidos do Viking Base (public/sprites/viking_base_*.png)
const BASE_TARGETS = {
  idle: [
    { bx: 66.0, by: 93.3, fy: 117 },
    { bx: 64.9, by: 93.5, fy: 116 },
    { bx: 64.9, by: 93.6, fy: 116 },
    { bx: 65.5, by: 93.8, fy: 116 },
    { bx: 66.3, by: 93.6, fy: 116 },
    { bx: 66.1, by: 93.1, fy: 117 },
  ],
  walk: [
    { bx: 64.9, by: 93.5, fy: 117 },
    { bx: 65.8, by: 93.6, fy: 116 },
    { bx: 66.2, by: 92.6, fy: 116 },
    { bx: 65.5, by: 92.5, fy: 117 },
    { bx: 64.7, by: 92.6, fy: 116 },
    { bx: 65.1, by: 92.6, fy: 117 },
  ],
  run: [
    { bx: 65.6, by: 99.3, fy: 119 },
    { bx: 66.0, by: 99.6, fy: 117 },
    { bx: 66.0, by: 98.1, fy: 117 },
    { bx: 65.1, by: 97.7, fy: 117 },
    { bx: 66.2, by: 99.8, fy: 117 },
    { bx: 66.0, by: 98.7, fy: 117 },
  ],
  jump: [
    { bx: 66.0, by: 92.0, fy: 115 },
    { bx: 65.9, by: 84.4, fy: 106 },
    { bx: 64.9, by: 76.6, fy: 101 },
    { bx: 65.3, by: 76.6, fy: 99 },
    { bx: 65.7, by: 96.4, fy: 116 },
    { bx: 65.7, by: 96.4, fy: 115 },
  ],
  attack: [
    { bx: 64.8, by: 98.3, fy: 118 },
    { bx: 66.2, by: 97.8, fy: 117 },
    { bx: 67.1, by: 99.2, fy: 118 },
    { bx: 66.8, by: 95.2, fy: 117 },
    { bx: 65.4, by: 98.3, fy: 118 },
    { bx: 65.6, by: 98.8, fy: 118 },
  ],
};

const CUT_BOUNDS = [
  // Linha 0: Idle (6 colunas)
  {
    y: [20, 147],
    cols: [
      [34, 160], [185, 330], [350, 488], [520, 655], [685, 835], [850, 988]
    ]
  },
  // Linha 1: Walk/Run (6 colunas)
  {
    y: [150, 280],
    cols: [
      [28, 160], [176, 316], [340, 504], [506, 654], [678, 824], [844, 988]
    ]
  },
  // Linha 2: Dash (6 colunas)
  {
    y: [290, 402],
    cols: [
      [20, 182], [186, 350], [352, 516], [518, 680], [686, 852], [852, 1015]
    ]
  },
  // Linha 3: Jump & Ground Slam (6 colunas)
  {
    y: [410, 546],
    cols: [
      [42, 136], [200, 308], [360, 495], [510, 675], [684, 830], [854, 988]
    ]
  },
  // Linha 4: Attack & Slashes (Limites finos isolando estritamente cada golpe)
  {
    y: [540, 676],
    cols: [
      [26, 160],  // Col 0: prepara machado
      [172, 351], // Col 1: golpe frontal com arco flamejante
      [360, 480], // Col 2: machado elevado
      [516, 684], // Col 3: corte flamejante estendido
      [696, 838], // Col 4: golpe descendente
      [855, 980]  // Col 5: finalização
    ]
  }
];

function extractCleanCell(row, col) {
  const [y0, y1] = CUT_BOUNDS[row].y;
  const [x0, x1] = CUT_BOUNDS[row].cols[col];
  const sw = x1 - x0 + 1;
  const sh = y1 - y0 + 1;

  const bg = new Uint8Array(sw * sh);
  const q = [];

  const tryPush = (lx, ly) => {
    if (lx < 0 || lx >= sw || ly < 0 || ly >= sh) return;
    const idx = ly * sw + lx;
    if (bg[idx]) return;
    const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
    if (isBackground(st.data[gi], st.data[gi + 1], st.data[gi + 2])) {
      bg[idx] = 1;
      q.push(idx);
    }
  };

  // Flood fill pelas 4 bordas da célula
  for (let x = 0; x < sw; x++) { tryPush(x, 0); tryPush(x, sh - 1); }
  for (let y = 0; y < sh; y++) { tryPush(0, y); tryPush(sw - 1, y); }
  while (q.length) {
    const idx = q.pop();
    const lx = idx % sw, ly = (idx / sw) | 0;
    tryPush(lx + 1, ly);
    tryPush(lx - 1, ly);
    tryPush(lx, ly + 1);
    tryPush(lx, ly - 1);
  }

  // Elimina bolsões interiores de fundo azul
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;
      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      const r = st.data[gi], g = st.data[gi + 1], b = st.data[gi + 2];
      if (b > r + 8 && b > g + 4 && b < 105 && r < 65) {
        bg[idx] = 1;
      }
    }
  }

  // FILTROS FINOS POR QUADRO PARA ISOLAMENTO ABSOLUTO:
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const gx = x0 + lx, gy = y0 + ly;

      // LINHA 4 (ATAQUES):
      if (row === 4) {
        // Col 0: elimina vazamento à direita e topo
        if (col === 0 && (gx > 152 || gy < 575)) bg[ly * sw + lx] = 1;

        // Col 1: elimina topo acima do arco e resíduos à direita
        if (col === 1 && (gy < 548 || gx > 351)) bg[ly * sw + lx] = 1;

        // Col 2: elimina topo e resíduos à esquerda
        if (col === 2 && (gy < 562 || gx < 360)) bg[ly * sw + lx] = 1;

        // Col 3: elimina topo acima do crescente e corte esquerdo/inferior
        if (col === 3 && (gy < 540 || gy > 674 || gx < 522)) bg[ly * sw + lx] = 1;

        // Col 4: elimina explosão do crater da linha 3 acima (gy < 575) e crescente da col 3 à esquerda
        if (col === 4 && (gy < 575 || gx < 696)) bg[ly * sw + lx] = 1;

        // Col 5: elimina poeira/brasas da linha 3 acima (gy < 575) e resíduos à esquerda
        if (col === 5 && (gy < 575 || gx < 855)) bg[ly * sw + lx] = 1;
      }

      // LINHA 3 (PULO / IMPACTO):
      if (row === 3) {
        // Col 5: poeira residual dispersa fora do impacto
        if (col === 5 && gy > 538 && (gx < 870 || gx > 965)) bg[ly * sw + lx] = 1;
      }
    }
  }

  // Localiza barba e pé com precisão subpixel
  let bSumX = 0, bSumY = 0, bCount = 0;
  let footY = 0;
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      if (bg[ly * sw + lx]) continue;
      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      const r = st.data[gi], g = st.data[gi + 1], b = st.data[gi + 2];

      // Barba ruiva (evitando fogo dos olhos/capacete)
      if (r > 95 && r > b + 20 && g > b + 2 && (r - g) > 12 && (r - g) < 75) {
        bSumX += lx;
        bSumY += ly;
        bCount++;
      }
      // Pés
      if (r < 45 && g < 45 && b < 52 && (b - r) < 10) {
        if (ly > footY) footY = ly;
      }
    }
  }

  const charBeardX = bCount > 0 ? (bSumX / bCount) : (sw / 2);
  const charBeardY = bCount > 0 ? (bSumY / bCount) : (sh / 2);
  if (footY === 0) footY = sh - 10;

  // Cria buffer RGBA limpo com descontaminação de bordas
  const buf = new Uint8ClampedArray(sw * sh * 4);
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;

      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      let r = st.data[gi], g = st.data[gi + 1], b = st.data[gi + 2];

      let bgNeighbors = 0;
      let bgR = 0, bgG = 0, bgB = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= sw || ny < 0 || ny >= sh || bg[ny * sw + nx]) {
          bgNeighbors++;
          const gx = Math.max(0, Math.min(w - 1, x0 + nx));
          const gy = Math.max(0, Math.min(h - 1, y0 + ny));
          const ngi = (gy * w + gx) * 4;
          bgR += st.data[ngi]; bgG += st.data[ngi + 1]; bgB += st.data[ngi + 2];
        }
      }

      let alpha = 255;
      if (bgNeighbors > 0) {
        bgR /= bgNeighbors; bgG /= bgNeighbors; bgB /= bgNeighbors;
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        alpha = Math.min(255, Math.max(0, Math.round((dist - 5) * 9.0)));

        // Remove contaminação de halo azul do contorno escuro
        if (r < 55 && g < 55 && b < 75 && b > r) {
          r = Math.min(r, Math.round(r * 0.35));
          g = Math.min(g, Math.round(g * 0.35));
          b = Math.min(b, Math.round(b * 0.35));
        }
      }
      if (alpha < 24) continue;

      // Preserva e realça o brilho vivo do fogo/olhos incandescentes
      const isFire = (r > 110 && r > b + 25);
      if (isFire && bgNeighbors > 0) {
        const a = alpha / 255;
        r = Math.min(255, Math.max(0, Math.round((r - bgR * (1 - a)) / a)));
        g = Math.min(255, Math.max(0, Math.round((g - bgG * (1 - a)) / a)));
        b = Math.min(255, Math.max(0, Math.round((b - bgB * (1 - a)) / a)));
      }

      const bi = idx * 4;
      buf[bi] = r;
      buf[bi + 1] = g;
      buf[bi + 2] = b;
      buf[bi + 3] = alpha;
    }
  }

  return { sw, sh, buf, charBeardX, charBeardY, footY };
}

// Renderiza para o canvas 128x128 alinhando perfeitamente a barba e o pé com o Base Viking
function renderTo128Canvas(cellData, targetBx, targetBy, targetFy) {
  const { sw, sh, buf, charBeardX, charBeardY, footY } = cellData;
  const canvas = new Uint8ClampedArray(128 * 128 * 4);

  // Calcula o offset no canvas 128x128
  const dx = targetBx - charBeardX * SCALE;
  let dy = targetBy - charBeardY * SCALE;
  if (targetFy !== undefined && Math.abs(footY - charBeardY) > 20) {
    const footDy = targetFy - footY * SCALE;
    dy = footDy * 0.7 + dy * 0.3;
  }

  for (let cy = 0; cy < 128; cy++) {
    for (let cx = 0; cx < 128; cx++) {
      const sx = (cx - dx) / SCALE;
      const sy = (cy - dy) / SCALE;

      const xf = Math.floor(sx), yf = Math.floor(sy);
      if (xf < 0 || xf >= sw - 1 || yf < 0 || yf >= sh - 1) continue;

      const wx = sx - xf, wy = sy - yf;

      const idx00 = (yf * sw + xf) * 4;
      const idx10 = (yf * sw + (xf + 1)) * 4;
      const idx01 = ((yf + 1) * sw + xf) * 4;
      const idx11 = ((yf + 1) * sw + (xf + 1)) * 4;

      const a00 = buf[idx00 + 3], a10 = buf[idx10 + 3], a01 = buf[idx01 + 3], a11 = buf[idx11 + 3];

      const a = (1 - wy) * ((1 - wx) * a00 + wx * a10) + wy * ((1 - wx) * a01 + wx * a11);
      if (a < 18) continue;

      const r = (1 - wy) * ((1 - wx) * buf[idx00] + wx * buf[idx10]) + wy * ((1 - wx) * buf[idx01] + wx * buf[idx11]);
      const g = (1 - wy) * ((1 - wx) * buf[idx00 + 1] + wx * buf[idx10 + 1]) + wy * ((1 - wx) * buf[idx01 + 1] + wx * buf[idx11 + 1]);
      const b = (1 - wy) * ((1 - wx) * buf[idx00 + 2] + wx * buf[idx10 + 2]) + wy * ((1 - wx) * buf[idx01 + 2] + wx * buf[idx11 + 2]);

      const di = (cy * 128 + cx) * 4;
      canvas[di] = Math.round(r);
      canvas[di + 1] = Math.round(g);
      canvas[di + 2] = Math.round(b);
      canvas[di + 3] = Math.round(a);
    }
  }

  return canvas;
}

// 1. Exporta IDLE (Linha 0)
console.log('-> Processando Idle (Linha 0)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(0, c);
  const target = BASE_TARGETS.idle[c];
  const frame = renderTo128Canvas(cell, target.bx, target.by, target.fy);
  encode(`${outDir}viking_surtur_idle_${c}.png`, 128, 128, frame);
}
console.log('✓ Idle 0..5 exportado!');

// 2. Exporta WALK & RUN (Linha 1)
console.log('-> Processando Walk & Run (Linha 1)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(1, c);
  const targetWalk = BASE_TARGETS.walk[c];
  const walkFrame = renderTo128Canvas(cell, targetWalk.bx, targetWalk.by, targetWalk.fy);
  encode(`${outDir}viking_surtur_walk_${c}.png`, 128, 128, walkFrame);

  const targetRun = BASE_TARGETS.run[c];
  const runFrame = renderTo128Canvas(cell, targetRun.bx, targetRun.by, targetRun.fy);
  encode(`${outDir}viking_surtur_run_${c}.png`, 128, 128, runFrame);
}
console.log('✓ Walk e Run 0..5 exportados!');

// 3. Exporta DASH (Linha 2)
console.log('-> Processando Dash (Linha 2)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(2, c);
  const frame = renderTo128Canvas(cell, 65.5, 98.0, 117);
  encode(`${outDir}viking_surtur_dash_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_surtur_attackSpin_${c}.png`, 128, 128, frame);
}
console.log('✓ Dash e Spin 0..5 exportados!');

// 4. Exporta JUMP & GROUND SLAM (Linha 3)
console.log('-> Processando Jump & Ground Slam (Linha 3)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(3, c);
  const target = BASE_TARGETS.jump[c];
  const frame = renderTo128Canvas(cell, target.bx, target.by, target.fy);
  encode(`${outDir}viking_surtur_jump_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_surtur_attackPlunge_${c}.png`, 128, 128, frame);
}
console.log('✓ Jump e Ground Slam 0..5 exportados!');

// 5. Exporta ATTACK & COMBOS (Linha 4)
console.log('-> Processando Attack & Combos (Linha 4)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(4, c);
  const target = BASE_TARGETS.attack[c];
  const frame = renderTo128Canvas(cell, target.bx, target.by, target.fy);
  encode(`${outDir}viking_surtur_attack_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_surtur_attackCombo_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_surtur_attackOverhead_${c}.png`, 128, 128, frame);
}
console.log('✓ Attack, Combos e Overhead 0..5 exportados sem vazamento entre frames!');

console.log('=== TODOS OS 30 FRAMES DA FÚRIA DE SURTUR CALIBRADOS COM SUCESSO! ===');
