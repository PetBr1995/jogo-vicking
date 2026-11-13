import { input } from './input.js';
import { Scene, WORLD_WIDTH } from './scene.js';
import { ThrownAxe } from './thrown-axe.js';
import { Particles } from './particles.js';

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

// Botão para alternar entre a versão de teste detalhada e o backup estável (Rollback em tempo real)
let isDetailed = true;
const toggleBtn = document.getElementById('toggle-mode');
if (toggleBtn) {
  toggleBtn.addEventListener('click', async () => {
    isDetailed = !isDetailed;
    const folder = isDetailed ? '/assets/base_ready' : '/assets/base_ready_backup_estavel';
    toggleBtn.textContent = isDetailed ? '🔄 Modo: Detalhes Ricos (Teste)' : '🔄 Modo: Estável (Rollback Ativo)';
    toggleBtn.style.background = isDetailed ? '#2a3b5c' : '#632525';
    toggleBtn.style.borderColor = isDetailed ? '#62deff' : '#ff7a7a';
    try {
      vikingImg = await loadImage(`${folder}/viking_base_96.png?v=${Date.now()}`);
      console.log(`Alternado para: ${folder}`);
    } catch (e) {
      console.error('Falha ao alternar spritesheet:', e);
    }
  });
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

const dust = new Particles();
const flyingAxes = [];
let shake = 0;

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
    this.isPlunging = false;
    this.plungeHit = false;
    this.axeSpawned = false;
    this.comboStep = false;
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
    const throwAtk = input.wasPressed('KeyT');

    // 1. Iniciação de Ataques
    if (!this.attacking) {
      if (attack) {
        this.attacking = true;
        this.animTime = 0;
        this.frame = 0;
        if (this.inAir) {
          // Mergulho pesado no ar: vai DIRETO para o chão em alta velocidade
          this.anim = 'attackPlunge';
          this.isPlunging = true;
          this.plungeHit = false;
          this.vz = -1000;
        } else if (up) {
          this.anim = 'attackOverhead';
        } else if (down || running) {
          this.anim = 'attackSpin';
        } else {
          this.anim = this.comboStep ? 'attackCombo' : 'attack';
          this.comboStep = !this.comboStep;
        }
      } else if (throwAtk) {
        this.attacking = true;
        this.anim = 'throw';
        this.animTime = 0;
        this.frame = 0;
        this.axeSpawned = false;
      }
    }

    // 2. Ataque de Mergulho (Plunge) - direto ao solo
    if (this.isPlunging) {
      if (!this.plungeHit) {
        // Acelera em queda livre violenta direto ao chão
        this.vz -= 3200 * dt;
        this.z += this.vz * dt;

        // Animação de descida rápida
        this.animTime += dt;
        if (this.frame === 0 && this.animTime >= 0.04) {
          this.frame = 1;
          this.animTime = 0;
        } else if (this.frame === 1 && this.animTime >= 0.04) {
          this.frame = 2;
          this.animTime = 0;
        } else if (this.frame >= 2) {
          this.frame = 2; // Trava na postura de mergulho com machado apontado para baixo
        }

        // IMPACTO NO SOLO!
        if (this.z <= 0) {
          this.z = 0;
          this.vz = 0;
          this.inAir = false;
          this.plungeHit = true;
          this.frame = 4; // Impacto do machado esmagando o chão
          this.animTime = 0;
          shake = 16;
          dust.burst(this.x, this.y, 18, {
            spread: 240,
            size: 7,
            color: 'rgba(255, 230, 180, A)',
          });
          dust.burst(this.x, this.y, 12, {
            spread: 160,
            size: 5,
            color: 'rgba(98, 222, 255, A)',
          });
        }
      } else {
        // Conclusão do impacto no solo (frames 4 e 5)
        this.animTime += dt;
        if (this.frame === 4 && this.animTime >= 0.10) {
          this.frame = 5; // Onda de choque e recuperação
          this.animTime = 0;
        } else if (this.frame === 5 && this.animTime >= 0.10) {
          this.isPlunging = false;
          this.plungeHit = false;
          this.attacking = false;
          this.anim = 'idle';
          this.frame = 0;
          this.animTime = 0;
        }
      }
      return;
    }

    // 3. Outros Ataques (Combo, Overhead, Spin, Throw)
    if (this.attacking) {
      // Arremesso do machado: no quadro de lançamento (frame 2 ou 3) o machado é disparado
      if (this.anim === 'throw' && !this.axeSpawned && this.frame >= 2) {
        this.axeSpawned = true;
        flyingAxes.push(new ThrownAxe(this, this.scale));
        shake = 4;
        dust.burst(this.x + this.facing * 35, this.y - 44 - this.z, 8, {
          vx: this.facing * 140,
          spread: 80,
          size: 4,
          color: 'rgba(255, 180, 70, A)',
        });
      }

      const animInfo = vikingMeta?.anims?.[this.anim] || vikingMeta?.anims?.attack;
      const durations = animInfo?.durations || [0.06, 0.08, 0.06, 0.09, 0.08, 0.09];
      const maxFrames = animInfo?.frames || 6;
      const dur = durations[this.frame] || 0.08;
      this.animTime += dt;
      if (this.animTime >= dur) {
        this.animTime -= dur;
        this.frame++;
        if (this.frame >= maxFrames) {
          this.attacking = false;
          this.frame = 0;
          this.anim = this.inAir ? 'jump' : 'idle';
        }
      }

      // Gravidade continua ativa se o jogador atacou no ar
      if (this.inAir) {
        this.z += this.vz * dt;
        this.vz -= 1700 * dt;
        if (this.z <= 0) {
          this.z = 0;
          this.vz = 0;
          this.inAir = false;
        }
      }
    } else {
      // 4. Pulo Normal
      if (jump && !this.inAir) {
        this.inAir = true;
        this.vz = 540;
        this.anim = 'jump';
        this.frame = 0;
        dust.burst(this.x, this.y, 6, { spread: 60, size: 4 });
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
          dust.burst(this.x, this.y, 8, { spread: 90, size: 5 });
        } else {
          // Escolhe o quadro do pulo conforme a fase (subida, ápice, queda)
          if (this.vz > 250) this.frame = 1;
          else if (this.vz > 50) this.frame = 2;
          else if (this.vz > -180) this.frame = 3;
          else if (this.vz > -350) this.frame = 4;
          else this.frame = 5;
        }
      }

      // 5. Movimentação Terrestre
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

  // Atualiza poeira e partículas
  dust.update(dt);

  // Atualiza machados arremessados
  for (let i = flyingAxes.length - 1; i >= 0; i--) {
    const axe = flyingAxes[i];
    if (axe.update(dt, viking)) {
      // Retornou para a mão do viking
      flyingAxes.splice(i, 1);
      shake = 3;
      dust.burst(viking.x + viking.facing * 14, viking.y - 44 - viking.z, 6, {
        spread: 60,
        size: 3,
        color: 'rgba(255, 210, 120, A)',
      });
    }
  }

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

  // Tremor de tela (camera shake)
  let shakeX = 0;
  let shakeY = 0;
  if (shake > 0) {
    shakeX = (Math.random() - 0.5) * shake;
    shakeY = (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 32);
  }

  // Mundo no espaço da câmera
  ctx.save();
  ctx.translate(-Math.round(camX) + Math.round(shakeX), Math.round(shakeY));

  // Sombra suave do viking no chão
  drawShadow(ctx, viking.x, viking.y, viking.z);

  // Poeira e partículas
  dust.draw(ctx, () => true);

  // Viking
  viking.draw(ctx);

  // Machados arremessados voando e girando
  for (const axe of flyingAxes) {
    axe.draw(ctx, vikingImg, vikingMeta, viking.scale, false, null);
  }

  ctx.restore();
  ctx.restore();

  // Telemetria no HUD
  if (stateEl) {
    stateEl.innerHTML = `
      <b>Ação:</b> <span style="color:#62deff">${viking.anim}</span> &nbsp;|&nbsp;
      <b>Quadro:</b> ${viking.frame + 1}/6 &nbsp;|&nbsp;
      <b>Posição:</b> (${Math.round(viking.x)}, ${Math.round(viking.y)}) &nbsp;|&nbsp;
      <b>Pulo (Z):</b> ${Math.round(viking.z)}px &nbsp;|&nbsp;
      <b>Machados no Ar:</b> ${flyingAxes.length} &nbsp;|&nbsp;
      <b>Cenário (C):</b> ${useProceduralScene ? 'Floresta Nórdica' : 'Arena Escura'}
    `;
  }

  input.endFrame();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
