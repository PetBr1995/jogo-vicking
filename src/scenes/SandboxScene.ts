import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { TrainingDummy } from '../entities/TrainingDummy';

export class SandboxScene extends Phaser.Scene {
  private player!: Player;
  private dummies: TrainingDummy[] = [];
  private sceneryGfx!: Phaser.GameObjects.Graphics;
  private bgLayer1!: Phaser.GameObjects.TileSprite;

  // DOM HUD
  private telemetryEl: HTMLElement | null = null;

  // Dimensões do Mundo 2.5D
  public static readonly WORLD_WIDTH = 2000;
  public static readonly WORLD_HEIGHT = 540;

  // Área Caminhável 2.5D no chão (4 eixos no plano da floresta)
  public static readonly BOUNDS = {
    minX: 60,
    maxX: 1940,
    minY: 360, // Limite superior (norte / início da mata ao pé das montanhas)
    maxY: 490, // Limite inferior (sul / borda frontal da pista)
  };

  constructor() {
    super({ key: 'SandboxScene' });
  }

  preload() {
    // Camada 1 do Cenário: Céu e Montanhas Distantes (Parallax 0.15x)
    const V = 'v' + Date.now();
    this.load.image('bg_layer1', `/assets/cenario/layer1-sky-mountains-seamless-540.png?v=${V}`);

    // Sprites oficiais do Viking Base 96 e Nova Spritesheet do Poder de Thor

    for (let i = 0; i < 6; i++) {
      // Modo Base
      this.load.image(`viking_base_idle_${i}`, `/sprites/viking_base_idle_${i}.png?v=${V}`);
      this.load.image(`viking_base_walk_${i}`, `/sprites/viking_base_walk_${i}.png?v=${V}`);
      this.load.image(`viking_base_run_${i}`, `/sprites/viking_base_run_${i}.png?v=${V}`);
      this.load.image(`viking_base_jump_${i}`, `/sprites/viking_base_jump_${i}.png?v=${V}`);
      this.load.image(`viking_base_attack_${i}`, `/sprites/viking_base_attack_${i}.png?v=${V}`);
      this.load.image(`viking_base_attackCombo_${i}`, `/sprites/viking_base_attackCombo_${i}.png?v=${V}`);
      this.load.image(`viking_base_attackOverhead_${i}`, `/sprites/viking_base_attackOverhead_${i}.png?v=${V}`);
      this.load.image(`viking_base_attackSpin_${i}`, `/sprites/viking_base_attackSpin_${i}.png?v=${V}`);
      this.load.image(`viking_base_attackPlunge_${i}`, `/sprites/viking_base_attackPlunge_${i}.png?v=${V}`);

      // Novo Poder de Thor (Extraído da Spritesheet com Raios e Eletricidade)
      this.load.image(`viking_thunder_idle_${i}`, `/sprites/viking_thunder_idle_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_walk_${i}`, `/sprites/viking_thunder_walk_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_run_${i}`, `/sprites/viking_thunder_run_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_dash_${i}`, `/sprites/viking_thunder_dash_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_jump_${i}`, `/sprites/viking_thunder_jump_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_attack_${i}`, `/sprites/viking_thunder_attack_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_attackCombo_${i}`, `/sprites/viking_thunder_attackCombo_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_attackOverhead_${i}`, `/sprites/viking_thunder_attackOverhead_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_attackSpin_${i}`, `/sprites/viking_thunder_attackSpin_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_attackPlunge_${i}`, `/sprites/viking_thunder_attackPlunge_${i}.png?v=${V}`);

      // Fúria de Surtur (Extraído da Spritesheet com Chamas e Fogo Incandescente)
      this.load.image(`viking_surtur_idle_${i}`, `/sprites/viking_surtur_idle_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_walk_${i}`, `/sprites/viking_surtur_walk_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_run_${i}`, `/sprites/viking_surtur_run_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_dash_${i}`, `/sprites/viking_surtur_dash_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_jump_${i}`, `/sprites/viking_surtur_jump_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_attack_${i}`, `/sprites/viking_surtur_attack_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_attackCombo_${i}`, `/sprites/viking_surtur_attackCombo_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_attackOverhead_${i}`, `/sprites/viking_surtur_attackOverhead_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_attackSpin_${i}`, `/sprites/viking_surtur_attackSpin_${i}.png?v=${V}`);
      this.load.image(`viking_surtur_attackPlunge_${i}`, `/sprites/viking_surtur_attackPlunge_${i}.png?v=${V}`);
    }
    for (let i = 0; i < 4; i++) {
      this.load.image(`viking_base_fall_${i}`, `/sprites/viking_base_fall_${i}.png?v=${V}`);
      this.load.image(`viking_thunder_fall_${i}`, `/sprites/viking_thunder_jump_3.png?v=${V}`);
      this.load.image(`viking_surtur_fall_${i}`, `/sprites/viking_surtur_jump_3.png?v=${V}`);
    }
  }

  create() {
    // 0. Camada 1: Céu e Montanhas Nórdicas Distantes (Parallax 0.15x contínuo)
    this.bgLayer1 = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'bg_layer1');
    this.bgLayer1.setOrigin(0, 0);
    this.bgLayer1.setScrollFactor(0); // Fixado na viewport da câmera
    this.bgLayer1.setDepth(-100);

    // 1. Renderiza o cenário e a pista de chão 2.5D com perspectiva
    this.createStage25D();

    // 2. Instancia o Alvo de Treino para testar golpes, hitstop de 40ms e recoil
    const dummy = new TrainingDummy(this, 750, 430, false);
    this.dummies.push(dummy);

    // 3. Instancia o Eirik com seus sprites reais
    this.player = new Player(this, 320, 430);

    // 4. Configura a câmera suave seguindo o jogador horizontalmente (visão cinematográfica 2.5D)
    this.cameras.main.setBounds(0, 0, SandboxScene.WORLD_WIDTH, SandboxScene.WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setRoundPixels(true);

    // 5. Elementos do DOM
    this.telemetryEl = document.getElementById('telemetry-info');
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    // Atualiza parallax horizontal da Camada 1 (0.15x da velocidade da câmera)
    if (this.bgLayer1) {
      this.bgLayer1.tilePositionX = this.cameras.main.scrollX * 0.15;
    }

    // Atualiza lógica do jogador (4 eixos, pulo Z, animações procedurais e combate)
    this.player.updatePlayer(dt, SandboxScene.BOUNDS, this.dummies);

    // Atualiza o manequim de treino
    for (const dummy of this.dummies) {
      dummy.updateDummy(delta);
    }

    // Atualiza leituras de telemetria
    this.updateTelemetryDom();
  }

  /**
   * Constrói a ambientação da floresta 2.5D sem grades artificiais
   */
  private createStage25D() {
    this.sceneryGfx = this.add.graphics();
    this.sceneryGfx.setDepth(-10);

    const w = SandboxScene.WORLD_WIDTH;

    // Névoa suave na base das montanhas / início da floresta nórdica (Y ≈ 345 - 370)
    this.sceneryGfx.fillStyle(0x0c1424, 0.45);
    this.sceneryGfx.fillRect(0, SandboxScene.BOUNDS.minY - 20, w, 28);
    this.sceneryGfx.fillStyle(0x101a2e, 0.25);
    this.sceneryGfx.fillRect(0, SandboxScene.BOUNDS.minY - 10, w, 18);

    // Sombra orgânica suave no chão da floresta (área caminhável 2.5D)
    this.sceneryGfx.fillStyle(0x0a0e18, 0.35);
    this.sceneryGfx.fillRect(0, SandboxScene.BOUNDS.minY + 10, w, SandboxScene.BOUNDS.maxY - SandboxScene.BOUNDS.minY);

    // Vinheta / profundidade atmosférica na borda inferior do cenário (Y >= 495)
    this.sceneryGfx.fillStyle(0x060910, 0.55);
    this.sceneryGfx.fillRect(0, SandboxScene.BOUNDS.maxY + 5, w, 40);
    this.sceneryGfx.fillStyle(0x030508, 0.90);
    this.sceneryGfx.fillRect(0, SandboxScene.BOUNDS.maxY + 25, w, 30);
  }

  /**
   * Telemetria em tempo real das animações e física
   */
  private updateTelemetryDom() {
    if (!this.telemetryEl) return;

    const isSurtur = this.player.mode === 'surtur';
    const isThor = this.player.mode === 'thor';
    const modeTag = isSurtur
      ? '<span style="color:#f97316; font-weight:bold;">🔥 FÚRIA DE SURTUR</span>'
      : isThor
      ? '<span style="color:#38bdf8; font-weight:bold;">⚡ PODER DE THOR</span>'
      : '<span style="color:#a3e635; font-weight:bold;">⚔️ VIKING BASE</span>';

    const modeName = isSurtur ? 'Surtur' : isThor ? 'Thor' : 'Base';
    let animState = `${modeName} Idle (${this.player.idleFrameIndex + 1}/6)`;
    if (this.player.isDashing) {
      animState = isSurtur ? '🔥 Dash Flamejante (Arrancada de Fogo)' : isThor ? '⚡ Dash de Relâmpago (Arco Elétrico)' : '💨 Dash Tático (Rastro Ativo)';
    } else if (this.player.isGroundSlamming) {
      animState = isSurtur ? '🔥 Crater Slam (Mergulho Incandescente)' : isThor ? '⚡ Ground Slam de Trovão (Queda & Impacto)' : '💥 Ground Slam (Mergulho no Chão)';
    } else if (this.player.isAttacking) {
      switch (this.player.currentAttackType) {
        case 'overhead': animState = isSurtur ? '🔥 Corte de Chamas Alto (W+J)' : isThor ? '⚡ Corte de Raio Alto (W+J)' : '⚔️ Corte Alto / Overhead (W+J)'; break;
        case 'spin': animState = isSurtur ? '🔥 Giro Flamejante 360° (S+J)' : isThor ? '⚡ Giro de Tempestade 360° (S+J)' : '🌀 Giro 360° (S+J)'; break;
        case 'normal': animState = isSurtur ? '🔥 Corte de Fogo 1/3 (J)' : isThor ? '⚡ Corte Elétrico 1/3 (J)' : '🪓 Combo 1/3: Corte Rápido'; break;
        case 'combo': animState = isSurtur ? '🔥 Golpe Ardente 2/3 (J+J)' : isThor ? '⚡ Corte Elétrico 2/3 (J+J)' : '🪓 Combo 2/3: Golpe Pesado'; break;
        case 'finisher': animState = isSurtur ? '🔥 Explosão Ígnea Final 3/3!' : isThor ? '⚡ Descarga de Choque Final 3/3!' : '⚡ Combo 3/3: Giro Finalizador!'; break;
        case 'plungeImpact': animState = isSurtur ? '🔥 Impacto de Fogo no Solo' : isThor ? '⚡ Impacto de Relâmpago no Solo' : '💥 Impacto no Solo / Onda de Choque'; break;
        default: animState = '🪓 Golpe Machado (J)'; break;
      }
    } else if (this.player.z > 0) {
      animState = 'Jump no Ar (Z: ' + Math.round(this.player.z) + 'px)';
    } else if (Math.hypot(this.player.vx, this.player.vy) > 15) {
      const isRunning = Math.hypot(this.player.vx, this.player.vy) >= 110;
      animState = isRunning
        ? `Run (${this.player.walkFrameIndex + 1}/6)`
        : `Walk (${this.player.walkFrameIndex + 1}/6)`;
    }

    const comboStatus = this.player.comboStep > 0
      ? `<span style="color:#facc15; font-weight:bold;">${this.player.comboStep}/3</span>`
      : '<span style="color:#94a3b8">Pronto</span>';

    const accentColor = isSurtur ? '#f97316' : isThor ? '#38bdf8' : '#a3e635';

    this.telemetryEl.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
        <span><b>Personagem / Modo:</b> ${modeTag}</span>
        <span><b>Sprite / Ação:</b> <span style="color:${accentColor}">${animState}</span></span>
        <span><b>Combo:</b> ${comboStatus}</span>
        <span><b>Direção:</b> ${this.player.facing > 0 ? 'Direita' : 'Esquerda (FlipX)'}</span>
        <span><b>Posição X / Y:</b> ${Math.round(this.player.x)}, ${Math.round(this.player.y)}</span>
        <span><b>Altura Z (Pulo):</b> ${Math.round(this.player.z)} px</span>
      </div>
    `;
  }
}
