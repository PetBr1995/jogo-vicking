import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { TrainingDummy } from '../entities/TrainingDummy';

export class SandboxScene extends Phaser.Scene {
  private player!: Player;
  private dummies: TrainingDummy[] = [];
  private bgLayer1!: Phaser.GameObjects.TileSprite; // Céu e Montanhas Distantes (Parallax 0.12x)
  private bgLayer2!: Phaser.GameObjects.TileSprite; // Pinheiros e Névoa (Parallax 0.35x)
  private groundLayer!: Phaser.GameObjects.TileSprite; // Chão 2D com grama e rochas nórdicas (1.0x)

  // DOM HUD
  private telemetryEl: HTMLElement | null = null;

  // Dimensões do Mundo 2D
  public static readonly WORLD_WIDTH = 2000;
  public static readonly WORLD_HEIGHT = 540;
  public static readonly GROUND_Y = 458; // Nível fixo do chão 2D

  // Limites da mecânica 2D
  public static readonly BOUNDS = {
    minX: 60,
    maxX: 1940,
    groundY: 458,
    minY: 458,
    maxY: 458,
  };

  constructor() {
    super({ key: 'SandboxScene' });
  }

  preload() {
    const V = 'v' + Date.now();

    // Camadas do Cenário 2D em Parallax
    this.load.image('bg_layer1', `/assets/cenario/layer1-sky-mountains-2d.png?v=${V}`);
    this.load.image('bg_layer2', `/assets/cenario/layer2-pines-mist-2d.png?v=${V}`);
    this.load.image('bg_ground2d', `/assets/cenario/ground-2d.png?v=${V}`);

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
    // 0. Camada 1: Céu Nórdico e Montanhas Distantes (Parallax 0.12x horizontal)
    this.bgLayer1 = this.add.tileSprite(0, 0, this.scale.width, 460, 'bg_layer1');
    this.bgLayer1.setOrigin(0, 0);
    this.bgLayer1.setScrollFactor(0); // Fixado na viewport
    this.bgLayer1.setDepth(-100);

    // 1. Camada 2: Floresta Média com Pinheiros e Névoa (Parallax 0.35x horizontal)
    this.bgLayer2 = this.add.tileSprite(0, 0, this.scale.width, 460, 'bg_layer2');
    this.bgLayer2.setOrigin(0, 0);
    this.bgLayer2.setScrollFactor(0); // Fixado na viewport
    this.bgLayer2.setDepth(-50);

    // 2. Camada 3: Chão 2D Texturizado com grama e rochas nórdicas (Velocidade 1.0x)
    this.groundLayer = this.add.tileSprite(0, SandboxScene.GROUND_Y, SandboxScene.WORLD_WIDTH, 82, 'bg_ground2d');
    this.groundLayer.setOrigin(0, 0);
    this.groundLayer.setScrollFactor(1); // Pertence ao mundo real do jogo
    this.groundLayer.setDepth(-10);

    // 3. Instancia o Alvo de Treino diretamente no chão 2D
    const dummy = new TrainingDummy(this, 750, SandboxScene.GROUND_Y, false);
    this.dummies.push(dummy);

    // 4. Instancia o Eirik com seus sprites reais no chão 2D
    this.player = new Player(this, 300, SandboxScene.GROUND_Y);

    // 5. Configura a câmera suave seguindo o jogador horizontalmente (visão pura 2D)
    this.cameras.main.setBounds(0, 0, SandboxScene.WORLD_WIDTH, SandboxScene.WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0);
    this.cameras.main.setRoundPixels(true);

    // 6. Elementos do DOM
    this.telemetryEl = document.getElementById('telemetry-info');
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    // Atualiza parallax contínuo das camadas do cenário 2D
    if (this.bgLayer1) {
      this.bgLayer1.tilePositionX = this.cameras.main.scrollX * 0.12;
    }
    if (this.bgLayer2) {
      this.bgLayer2.tilePositionX = this.cameras.main.scrollX * 0.35;
    }

    // Atualiza lógica do jogador (2D puro horizontal, pulo Z, animações procedurais e combate)
    this.player.updatePlayer(dt, SandboxScene.BOUNDS, this.dummies);

    // Atualiza o manequim de treino
    for (const dummy of this.dummies) {
      dummy.updateDummy(delta);
    }

    // Atualiza leituras de telemetria
    this.updateTelemetryDom();
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
