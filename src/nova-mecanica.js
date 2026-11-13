import { input } from './input.js';
import { Scene, WORLD_WIDTH } from './scene.js';
import { ThrownAxe } from './thrown-axe.js';
import { Particles } from './particles.js';
import { Bolt, setBoltAssets, drawBodyArcs } from './bolt.js';

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

// Carrega os sprites processados em 96x96 com cache-buster (Base e Raio)
let baseImg = null;
let baseMeta = null;
let thunderImg = null;
let thunderMeta = null;
let boltImg = null;
let boltMeta = null;

const cacheBust = Date.now();
try {
  [baseImg, baseMeta, thunderImg, thunderMeta, boltImg, boltMeta] = await Promise.all([
    loadImage(`/assets/base_ready/viking_base_96.png?v=${cacheBust}`),
    fetch(`/assets/base_ready/viking_base_96.json?v=${cacheBust}`).then((r) => r.json()),
    loadImage(`/assets/base_ready/viking_thunder_96.png?v=${cacheBust}`),
    fetch(`/assets/base_ready/viking_thunder_96.json?v=${cacheBust}`).then((r) => r.json()),
    loadImage(`/assets/lightning-bolt.png?v=${cacheBust}`).catch(() => null),
    fetch(`/assets/lightning-bolt.json?v=${cacheBust}`).then((r) => r.json()).catch(() => null),
  ]);
  if (boltImg && boltMeta) {
    setBoltAssets(boltImg, boltMeta);
  }
  console.log('✅ Sprites 96x96 Base e Raio carregados com sucesso');
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
      [baseImg, thunderImg] = await Promise.all([
        loadImage(`${folder}/viking_base_96.png?v=${Date.now()}`),
        loadImage(`${folder}/viking_thunder_96.png?v=${Date.now()}`),
      ]);
      console.log(`Alternado para: ${folder}`);
    } catch (e) {
      console.error('Falha ao alternar spritesheet:', e);
    }
  });
}

const btnBase = document.getElementById('btn-base');
const btnThunder = document.getElementById('btn-thunder');

function updateFormUI() {
  if (!btnBase || !btnThunder || !viking) return;
  const isT = viking.form === 'thunder';
  btnBase.style.background = !isT ? '#2a3b5c' : 'rgba(14, 18, 28, 0.9)';
  btnBase.style.borderColor = !isT ? '#62deff' : 'rgba(80, 200, 255, 0.4)';
  btnThunder.style.background = isT ? '#2a3b5c' : 'rgba(14, 18, 28, 0.9)';
  btnThunder.style.borderColor = isT ? '#62deff' : 'rgba(80, 200, 255, 0.4)';
}

if (btnBase) btnBase.addEventListener('click', () => viking.setForm('base'));
if (btnThunder) btnThunder.addEventListener('click', () => viking.setForm('thunder'));

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
const bolts = [];
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
    this.form = 'base'; // 'base' | 'thunder'
    this.anim = 'idle';
    this.frame = 0;
    this.animTime = 0;
    this.attacking = false;
    this.inAir = false;
    this.isPlunging = false;
    this.plungeHit = false;
    this.axeSpawned = false;
    this.boltSpawned = false;
    this.comboStep = false;
    this.dashing = 0;
    this.dashCooldown = 0;
    this.dashDir = 1;
    this.ghosts = [];
    this.ghostTimer = 0;
    this.scale = 2.2; // Escala ideal para proporção nítida dos sprites 96x96
  }

  setForm(form) {
    if (this.form === form) return;
    this.form = form;
    this.anim = 'idle';
    this.frame = 0;
    this.animTime = 0;
    this.attacking = false;
    this.isPlunging = false;
    shake = 6;
    const isT = form === 'thunder';
    dust.burst(this.x, this.y - 24, 16, {
      spread: 140,
      size: 6,
      color: isT ? 'rgba(120, 220, 255, A)' : 'rgba(255, 200, 120, A)',
    });
    updateFormUI();
  }

  getAssets() {
    if (this.form === 'thunder' && thunderImg && thunderMeta) {
      return { img: thunderImg, meta: thunderMeta };
    }
    return { img: baseImg, meta: baseMeta };
  }

  update(dt, bounds) {
    // Alternância de formas por tecla numérica: 1 (Base), 3 (Raio)
    if (input.wasPressed('Digit1')) this.setForm('base');
    if (input.wasPressed('Digit3')) this.setForm('thunder');

    const left = input.isDown('KeyA', 'ArrowLeft');
    const right = input.isDown('KeyD', 'ArrowRight');
    const up = input.isDown('KeyW', 'ArrowUp');
    const down = input.isDown('KeyS', 'ArrowDown');
    const running = input.isDown('ShiftLeft', 'ShiftRight');
    const jump = input.wasPressed('Space');
    const attack = input.wasPressed('KeyJ');
    const throwAtk = input.wasPressed('KeyT');
    const dodge = input.wasPressed('KeyK');
    const castAtk = input.wasPressed('KeyL');

    // Atualiza cooldown de desvio e fantasmas / afterimages
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].alpha -= dt * 4.2;
      if (this.ghosts[i].alpha <= 0) this.ghosts.splice(i, 1);
    }

    // 0. Desvio / Esquiva com a tecla K (no chão ou no ar)
    if (dodge && this.dashing <= 0 && this.dashCooldown <= 0 && !this.isPlunging) {
      if (left) this.facing = -1;
      else if (right) this.facing = 1;

      this.dashing = 0.18; // Duração do desvio (180ms)
      this.dashCooldown = 0.42; // Cooldown ágil
      this.dashDir = this.facing;
      this.attacking = false; // Esquiva tem prioridade
      const isThunder = this.form === 'thunder';
      shake = isThunder ? 5 : 3;

      dust.burst(this.x - this.facing * 18, this.y - this.z, isThunder ? 16 : 10, {
        vx: -this.facing * (isThunder ? 240 : 180),
        spread: isThunder ? 100 : 60,
        size: isThunder ? 6 : 5,
        color: isThunder ? 'rgba(120, 230, 255, A)' : 'rgba(180, 225, 255, A)',
      });
    }

    if (this.dashing > 0) {
      this.dashing -= dt;
      const dashSpeed = this.form === 'thunder' ? 820 : 750; // Modo raio tem warp veloz
      this.x += this.dashDir * dashSpeed * dt;
      this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x));

      if (this.inAir) {
        this.vz = 0; // Sustentação reta no ar durante o desvio
      }

      this.ghostTimer = (this.ghostTimer || 0) + dt;
      if (this.ghostTimer >= 0.032) {
        this.ghostTimer = 0;
        this.ghosts.push({
          x: this.x,
          y: this.y,
          z: this.z,
          facing: this.facing,
          anim: this.anim,
          frame: this.frame,
          alpha: 0.7,
        });
      }

      if (!this.inAir) {
        this.anim = 'run';
        this.frame = 2; // Pose aerodinâmica de corrida
      }
      return;
    }

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
      } else if (castAtk) {
        // Disparo de Raio / Lightning Bolt com a tecla L
        this.attacking = true;
        this.anim = 'cast';
        this.animTime = 0;
        this.frame = 0;
        this.boltSpawned = false;
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
          const isT = this.form === 'thunder';
          shake = isT ? 22 : 16;
          dust.burst(this.x, this.y, isT ? 24 : 18, {
            spread: isT ? 280 : 240,
            size: isT ? 8 : 7,
            color: isT ? 'rgba(120, 220, 255, A)' : 'rgba(255, 230, 180, A)',
          });
          dust.burst(this.x, this.y, 14, {
            spread: 170,
            size: 5,
            color: 'rgba(255, 255, 255, A)',
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

    // 3. Outros Ataques (Combo, Overhead, Spin, Throw, Cast)
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
          color: this.form === 'thunder' ? 'rgba(120, 230, 255, A)' : 'rgba(255, 180, 70, A)',
        });
      }

      // Disparo de Raio: no quadro de lançamento (frame 3) do cast o raio surge e dispara
      if (this.anim === 'cast' && !this.boltSpawned && this.frame >= 3) {
        this.boltSpawned = true;
        const b = new Bolt(this.x + this.facing * 35, this.y, this.facing, this.scale);
        bolts.push(b);
        shake = 10;
        dust.burst(this.x + this.facing * 35, this.y - 30 - this.z, 14, {
          vx: this.facing * 220,
          spread: 120,
          size: 6,
          color: 'rgba(140, 230, 255, A)',
        });
      }

      const { meta } = this.getAssets();
      const animInfo = meta?.anims?.[this.anim] || meta?.anims?.attack;
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
    const assets = this.getAssets();
    if (!assets?.img || !assets?.meta) return;

    const { img, meta } = assets;
    const { cell, anims } = meta;

    // 1. Silhuetas / Fantasmas translúcidos do Desvio (Dash afterimages)
    for (const g of this.ghosts) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.max(0, g.alpha * 0.45);
      ctx.translate(Math.round(g.x), Math.round(g.y - g.z));
      ctx.scale(g.facing * this.scale, this.scale);
      const gAnim = anims[g.anim] || anims.run || anims.idle;
      const gRow = gAnim.row ?? 0;
      const gSx = Math.min(g.frame, 5) * cell;
      const gSy = gRow * cell;
      ctx.drawImage(
        img,
        gSx, gSy, cell, cell,
        -cell / 2, -86, cell, cell
      );
      ctx.restore();
    }

    // 2. Aura de faíscas elétricas se estiver no modo Raio
    if (this.form === 'thunder') {
      drawBodyArcs(ctx, this.x, this.y - this.z, this.scale, 0.65);
    }

    // 3. Sprite principal do Viking
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
      img,
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

  // Atualiza raios disparados (bolts)
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.update(dt);
    if (b.dead) bolts.splice(i, 1);
  }

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
        color: viking.form === 'thunder' ? 'rgba(140, 230, 255, A)' : 'rgba(255, 210, 120, A)',
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

  // Raios disparados
  for (const b of bolts) {
    b.draw(ctx);
  }

  // Viking
  viking.draw(ctx);

  // Machados arremessados voando e girando
  const currentAssets = viking.getAssets();
  for (const axe of flyingAxes) {
    axe.draw(ctx, currentAssets.img, currentAssets.meta, viking.scale, false, null);
  }

  ctx.restore();
  ctx.restore();

  // Telemetria no HUD
  if (stateEl) {
    stateEl.innerHTML = `
      <b>Forma (1 / 3):</b> <span style="color:${viking.form === 'thunder' ? '#8fe6ff' : '#ffd062'}; font-weight: bold;">${viking.form === 'thunder' ? '⚡ Raio (Thunder)' : '⚔️ Base'}</span> &nbsp;|&nbsp;
      <b>Ação:</b> <span style="color:#62deff">${viking.dashing > 0 ? 'dash' : viking.anim}</span> &nbsp;|&nbsp;
      <b>Quadro:</b> ${viking.frame + 1}/6 &nbsp;|&nbsp;
      <b>Posição:</b> (${Math.round(viking.x)}, ${Math.round(viking.y)}) &nbsp;|&nbsp;
      <b>Pulo (Z):</b> ${Math.round(viking.z)}px &nbsp;|&nbsp;
      <b>Raios/Machados:</b> ${bolts.length}/${flyingAxes.length}
    `;
  }

  input.endFrame();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
