import fs from 'fs';
import { decode, encode } from './png.mjs';

console.log('=== EXTRAÇÃO CALIBRADA DO PODER DE THOR (COM PROTEÇÃO CONTRA CORTES E BLEED) ===');

const srcPath = 'docs/arte/sheet-thunder.png';
const outDir = 'public/sprites/';

const st = decode(srcPath);
const w = st.w, h = st.h;

// Verificador estrito de fundo para eliminar 100% dos resíduos e halos azuis
function isBackground(r, g, b) {
  // Cores quentes (barba, pele, olhos, faíscas laranja/amarelas)
  if (r > b + 10) return false;
  // Metal do machado (cinza neutro)
  if (Math.abs(r - b) < 12 && Math.abs(r - g) < 12 && r > 28) return false;
  // Relâmpagos ciano e azul elétrico vivo
  if (b > 90 && g > 60) return false;
  // Núcleo branco dos raios
  if (r > 130 && g > 130 && b > 130) return false;
  // Contorno preto neutro do personagem
  if (r < 18 && g < 18 && b < 22 && Math.abs(b - r) <= 4) return false;
  // Fundo vinheta ardósia/azul escuro: dominância nítida de azul
  if (b > r + 3 && b > g - 2 && r < 75 && g < 85 && b < 125) return true;
  if (r < 38 && g < 45 && b < 68 && (b >= r)) return true;
  return false;
}

// Escala calculada a partir do Base Viking
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

// Limites ultrafinos com separação completa para evitar captura de pedaços de outros quadros
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
    y: [548, 670],
    cols: [
      [26, 160],  // Col 0: prepara machado (termina antes de 165 para não pegar Col 1)
      [172, 348], // Col 1: golpe frontal com arco ciano (termina antes do machado de Col 2)
      [362, 480], // Col 2: machado elevado (começa em 362 para não pegar o arco de Col 1)
      [516, 684], // Col 3: corte ciano estendido (termina em 684 antes do corpo de Col 4)
      [696, 838], // Col 4: golpe descendente (começa em 696 para não pegar o arco de Col 3)
      [855, 980]  // Col 5: finalização (isolado à direita)
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
        // Col 0: elimina vazamento de ponta de machado de Col 1 à direita
        if (col === 0 && gx > 152) bg[ly * sw + lx] = 1;

        // Col 1: elimina topo residual acima do arco
        if (col === 1 && gy < 550) bg[ly * sw + lx] = 1;

        // Col 2: elimina ponta do crescente de Col 1 à esquerda e topo
        if (col === 2 && (gy < 568 || (gx < 382 && gy < 600))) bg[ly * sw + lx] = 1;

        // Col 3: elimina cunha de impacto no chão e topo acima do crescente
        if (col === 3 && (gy < 550 || gy > 662 || gx < 522)) bg[ly * sw + lx] = 1;

        // Col 4: elimina ponta do raio/crescente de Col 3 à esquerda e botas do pulo acima
        if (col === 4 && (gy < 568 || (gx < 728 && gy <= 625))) bg[ly * sw + lx] = 1;

        // Col 5: elimina pontos flutuantes do pulo acima e resíduos à esquerda
        if (col === 5 && (gy < 578 || (gx < 885 && gy < 622))) bg[ly * sw + lx] = 1;
      }

      // LINHA 3 (PULO / IMPACTO):
      if (row === 3) {
        // Col 5: elimina poeira residual dispersa
        if (col === 5 && gy > 538 && (gx < 880 || gx > 960)) bg[ly * sw + lx] = 1;
      }
    }
  }

  // EROSÃO / DESPILL DE BORDA DE 1PX: elimina 100% dos resíduos de vinheta ardósia/azul
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;

      let bgNeighbor = false;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= sw || ny < 0 || ny >= sh || bg[ny * sw + nx]) {
          bgNeighbor = true;
          break;
        }
      }

      if (bgNeighbor) {
        const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
        const r = st.data[gi], g = st.data[gi + 1], b = st.data[gi + 2];
        // Se for borda escura com viés azul ou ardósia, corta fora
        if ((b > r + 1 && b > g - 2 && b < 85 && r < 60) || (r < 38 && g < 45 && b < 68 && b >= r)) {
          bg[idx] = 1;
        }
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

      // Barba ruiva
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

  // Cria buffer RGBA limpo com descontaminação de bordas (sem semi-transparência borrada)
  const buf = new Uint8ClampedArray(sw * sh * 4);
  for (let ly = 0; ly < sh; ly++) {
    for (let lx = 0; lx < sw; lx++) {
      const idx = ly * sw + lx;
      if (bg[idx]) continue;

      const gi = ((y0 + ly) * w + (x0 + lx)) * 4;
      let r = st.data[gi], g = st.data[gi + 1], b = st.data[gi + 2];

      let bgNeighbors = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= sw || ny < 0 || ny >= sh || bg[ny * sw + nx]) {
          bgNeighbors++;
        }
      }

      // Se for contorno escuro perto do fundo, neutraliza halo azul para preto sólido de pixel art
      if (bgNeighbors > 0 && r < 55 && g < 55 && b < 75) {
        r = Math.min(12, r);
        g = Math.min(12, g);
        b = Math.min(15, b);
      }

      const bi = idx * 4;
      buf[bi] = r;
      buf[bi + 1] = g;
      buf[bi + 2] = b;
      buf[bi + 3] = 255; // 1-bit alpha sólido
    }
  }

  return { sw, sh, buf, charBeardX, charBeardY, footY };
}

// Renderiza para o canvas 128x128 com NEAREST-neighbor e 1-bit alpha (pixel art 100% nítido)
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
      const sx = Math.round((cx - dx) / SCALE);
      const sy = Math.round((cy - dy) / SCALE);

      if (sx < 0 || sx >= sw || sy < 0 || sy >= sh) continue;

      const idx = (sy * sw + sx) * 4;
      if (buf[idx + 3] === 0) continue;

      const di = (cy * 128 + cx) * 4;
      canvas[di] = buf[idx];
      canvas[di + 1] = buf[idx + 1];
      canvas[di + 2] = buf[idx + 2];
      canvas[di + 3] = 255;
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
  encode(`${outDir}viking_thunder_idle_${c}.png`, 128, 128, frame);
}
console.log('✓ Idle 0..5 exportado!');

// 2. Exporta WALK & RUN (Linha 1)
console.log('-> Processando Walk & Run (Linha 1)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(1, c);
  const targetWalk = BASE_TARGETS.walk[c];
  const walkFrame = renderTo128Canvas(cell, targetWalk.bx, targetWalk.by, targetWalk.fy);
  encode(`${outDir}viking_thunder_walk_${c}.png`, 128, 128, walkFrame);

  const targetRun = BASE_TARGETS.run[c];
  const runFrame = renderTo128Canvas(cell, targetRun.bx, targetRun.by, targetRun.fy);
  encode(`${outDir}viking_thunder_run_${c}.png`, 128, 128, runFrame);
}
console.log('✓ Walk e Run 0..5 exportados!');

// 3. Exporta DASH (Linha 2)
console.log('-> Processando Dash (Linha 2)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(2, c);
  const frame = renderTo128Canvas(cell, 65.5, 98.0, 117);
  encode(`${outDir}viking_thunder_dash_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_thunder_attackSpin_${c}.png`, 128, 128, frame);
}
console.log('✓ Dash e Spin 0..5 exportados!');

// 4. Exporta JUMP & GROUND SLAM (Linha 3)
console.log('-> Processando Jump & Ground Slam (Linha 3)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(3, c);
  const target = BASE_TARGETS.jump[c];
  const frame = renderTo128Canvas(cell, target.bx, target.by, target.fy);
  encode(`${outDir}viking_thunder_jump_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_thunder_attackPlunge_${c}.png`, 128, 128, frame);
}
console.log('✓ Jump e Ground Slam 0..5 exportados!');

// 5. Exporta ATTACK & COMBOS (Linha 4)
console.log('-> Processando Attack & Combos (Linha 4)...');
for (let c = 0; c < 6; c++) {
  const cell = extractCleanCell(4, c);
  const target = BASE_TARGETS.attack[c];
  const frame = renderTo128Canvas(cell, target.bx, target.by, target.fy);
  encode(`${outDir}viking_thunder_attack_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_thunder_attackCombo_${c}.png`, 128, 128, frame);
  encode(`${outDir}viking_thunder_attackOverhead_${c}.png`, 128, 128, frame);
}
console.log('✓ Attack, Combos e Overhead 0..5 exportados sem vazamento entre frames!');

console.log('=== TODOS OS 30 FRAMES DO PODER DE THOR CALIBRADOS COM SUCESSO! ===');
