import { input } from './input.js';
import { Scene, WORLD_WIDTH } from './scene.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stateEl = document.getElementById('state');

let viewW = window.innerWidth;
let viewH = window.innerHeight;
let dpr = Math.min(2.5, window.devicePixelRatio || 1);

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  canvas.viewWidth = viewW;
  canvas.viewHeight = viewH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

// Carrega os sprites processados em 96x96 com cache-buster (limpeza de fragmentos)
let vikingImg = null;
let vikingMeta = null;
const cacheBust = Date.now();
try {
  [vikingImg, vikingMeta] = await Promise.all([
    loadImage(`/assets/base_ready/viking_base_96.png?v=${cacheBust}`),
    fetch(`/assets/base_ready/viking_base_96.json?v=${cacheBust}`).then((r) => r.json()),
  ]);
  console.log('✅ Sprites 96x96 carregados com sucesso:', vikingMeta);
} catch (err) {
  console.error('❌ Erro ao carregar sprites:', err);
  if (stateEl) stateEl.textContent = `Erro ao carregar sprites: ${err.message}`;
}

const scene = new Scene(4, null);
let useProceduralScene = false;

// Alterna cenário com tecla C
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') {
    useProceduralScene = !useProceduralScene;
  }
});

function drawShadow(ctx, x, y, z) {
  const lift = Math.min(1, Math.max(0, z / 180));
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${0.4 - lift * 0.25})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 32 * (1 - lift * 0.35), 9 * (1 - lift * 0.35), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArenaBackground(ctx, camX, groundY) {
  // Céu / fundo escuro nórdico
  ctx.fillStyle = '#141722';
  ctx.fillRect(0, 0, viewW, viewH);

  // Chão escuro da arena
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, viewH);
  groundGrad.addColorStop(0, '#1c2232');
  groundGrad.addColorStop(1, '#10141e');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, viewW, viewH - groundY);

  // Linha guia do piso
  ctx.fillStyle = '#323d57';
  ctx.fillRect(0, groundY, viewW, 2);

  // Grid sutil no chão para dar noção de profundidade e movimento
  ctx.strokeStyle = 'rgba(70, 90, 130, 0.12)';
  ctx.lineWidth = 1;
  const gridStep = 80;
  const offsetX = -((camX % gridStep) + gridStep) % gridStep;
  for (let x = offsetX; x < viewW; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, viewH);
    ctx.stroke();
  }
}

class NewViking {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.z = 0;
    this.vz = 0;
    this.facing = 1;
    this.anim = 'idle';
    this.frame = 0;
    this.animTime = 0;
    this.attacking = false;
    this.inAir = false;
    this.scale = 2.2; // Escala ideal para proporção nítida dos sprites 96x96
  }

  update(dt, bounds) {
    const left = input.isDown('KeyA', 'ArrowLeft');
    const right = input.isDown('KeyD', 'ArrowRight');
    const up = input.isDown('KeyW', 'ArrowUp');
    const down = input.isDown('KeyS', 'ArrowDown');
    const running = input.isDown('ShiftLeft', 'ShiftRight');
    const jump = input.wasPressed('Space');
    const attack = input.wasPressed('KeyJ');

    // Ataque
    if (attack && !this.attacking) {
      this.attacking = true;
      this.anim = 'attack';
      this.frame = 0;
      this.animTime = 0;
    }

    if (this.attacking) {
      const durations = vikingMeta?.anims?.attack?.durations || [0.06, 0.08, 0.06, 0.09, 0.08, 0.09];
      const dur = durations[this.frame] || 0.08;
      this.animTime += dt;
      if (this.animTime >= dur) {
        this.animTime -= dur;
        this.frame++;
        if (this.frame >= 6) {
          this.attacking = false;
          this.frame = 0;
          this.anim = 'idle';
        }
      }
    } else {
      // Pulo
      if (jump && !this.inAir) {
        this.inAir = true;
        this.vz = 540;
        this.anim = 'jump';
        this.frame = 0;
      }

      if (this.inAir) {
        this.z += this.vz * dt;
        this.vz -= 1700 * dt;
        if (this.z <= 0) {
          this.z = 0;
          this.vz = 0;
          this.inAir = false;
          this.anim = 'idle';
          this.frame = 0;
        } else {
          // Escolhe o quadro do pulo conforme a fase (subida, ápice, queda)
          if (this.vz > 250) this.frame = 1;
          else if (this.vz > 50) this.frame = 2;
          else if (this.vz > -180) this.frame = 3;
          else if (this.vz > -350) this.frame = 4;
          else this.frame = 5;
        }
      }

      // Movimentação
      const speed = running ? 260 : 150;
      let moveX = 0;
      let moveY = 0;
      if (left) { moveX -= 1; this.facing = -1; }
      if (right) { moveX += 1; this.facing = 1; }
      if (up) moveY -= 0.65;
      if (down) moveY += 0.65;

      this.x += moveX * speed * dt;
      this.y += moveY * speed * dt;

      // Limites de movimentação
      this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x));
      this.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.y));

      // Animações terrestres
      if (!this.inAir) {
        if (moveX !== 0 || moveY !== 0) {
          this.anim = running ? 'run' : 'walk';
          const fps = running ? 11 : 8;
          this.animTime += dt;
          if (this.animTime >= 1 / fps) {
            this.animTime -= 1 / fps;
            this.frame = (this.frame + 1) % 6;
          }
        } else {
          this.anim = 'idle';
          this.animTime += dt;
          if (this.animTime >= 1 / 6) {
            this.animTime -= 1 / 6;
            this.frame = (this.frame + 1) % 6;
          }
        }
      }
    }
  }

  draw(ctx) {
    if (!vikingImg || !vikingMeta) return;

    const { cell, anims } = vikingMeta;
    const animInfo = anims[this.anim] || anims.idle;
    const row = animInfo.row ?? 0;
    const sx = Math.min(this.frame, 5) * cell;
    const sy = row * cell;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(this.x), Math.round(this.y - this.z));
    ctx.scale(this.facing * this.scale, this.scale);

    // O sprite 96x96 foi alinhado na base inferior centralizada (x=48, pés em y=86)
    ctx.drawImage(
      vikingImg,
      sx, sy, cell, cell,
      -cell / 2, -86, cell, cell
    );
    ctx.restore();
  }
}

const groundHorizon = () => viewH * 0.58;
const viking = new NewViking(350, viewH * 0.72);
let camX = 0;
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const horizon = groundHorizon();
  const bounds = {
    minX: 60,
    maxX: WORLD_WIDTH - 60,
    minY: horizon + 20,
    maxY: viewH - 40,
  };

  viking.update(dt, bounds);

  // Câmera segue o viking
  const targetCamX = viking.x - viewW * 0.45;
  camX += (targetCamX - camX) * Math.min(1, dt * 6);
  camX = Math.max(0, Math.min(WORLD_WIDTH - viewW, camX));

  // Limpa o canvas para garantir renderização limpa
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);

  // Cenário de fundo
  if (useProceduralScene) {
    scene.draw(ctx, camX, horizon);
  } else {
    drawArenaBackground(ctx, camX, horizon);
  }

  // Mundo no espaço da câmera
  ctx.save();
  ctx.translate(-Math.round(camX), 0);

  // Efeito/sombra atrás do boneco removido conforme solicitado: apenas o sprite
  viking.draw(ctx);

  ctx.restore();
  ctx.restore();

  // Telemetria no HUD
  if (stateEl) {
    stateEl.innerHTML = `
      <b>Ação:</b> <span style="color:#62deff">${viking.anim}</span> &nbsp;|&nbsp;
      <b>Quadro:</b> ${viking.frame + 1}/6 &nbsp;|&nbsp;
      <b>Posição:</b> (${Math.round(viking.x)}, ${Math.round(viking.y)}) &nbsp;|&nbsp;
      <b>Pulo (Z):</b> ${Math.round(viking.z)}px &nbsp;|&nbsp;
      <b>Cenário (C):</b> ${useProceduralScene ? 'Floresta Nórdica' : 'Arena Escura'}
    `;
  }

  input.endFrame();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
