import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { TrainingDummy } from '../entities/TrainingDummy';

export class SandboxScene extends Phaser.Scene {
  private player!: Player;
  private dummies: TrainingDummy[] = [];
  private sceneryGfx!: Phaser.GameObjects.Graphics;

  // DOM HUD
  private telemetryEl: HTMLElement | null = null;

  // Dimensões do Mundo 2.5D
  public static readonly WORLD_WIDTH = 2000;
  public static readonly WORLD_HEIGHT = 650;

  // Área Caminhável 2.5D no chão (4 eixos)
  public static readonly BOUNDS = {
    minX: 60,
    maxX: 1940,
    minY: 260, // Limite superior (norte / fundo do cenário)
    maxY: 460, // Limite inferior (sul / frente do cenário)
  };

  constructor() {
    super({ key: 'SandboxScene' });
  }

  preload() {
    // Carrega os 8 PNGs limpos do Eirik de public/sprites/
    this.load.image('eirik_idle_01', '/sprites/eirik_idle_01.png');
    this.load.image('eirik_walk_01', '/sprites/eirik_walk_01.png');
    this.load.image('eirik_walk_passing', '/sprites/eirik_walk_passing.png');
    this.load.image('eirik_run_01', '/sprites/eirik_run_01.png');
    this.load.image('eirik_jump', '/sprites/eirik_jump.png');
    this.load.image('eirik_land', '/sprites/eirik_land.png');
    this.load.image('eirik_attack', '/sprites/eirik_attack.png');
    this.load.image('axe_slash_vfx', '/sprites/axe_slash_vfx.png');
  }

  create() {
    // 1. Renderiza o cenário e a pista de chão 2.5D com perspectiva
    this.createStage25D();

    // 2. Instancia o Alvo de Treino para testar golpes, hitstop de 40ms e recoil
    const dummy = new TrainingDummy(this, 750, 360, false);
    this.dummies.push(dummy);

    // 3. Instancia o Eirik com seus sprites reais
    this.player = new Player(this, 400, 360);

    // 4. Configura a câmera suave seguindo o jogador
    this.cameras.main.setBounds(0, 0, SandboxScene.WORLD_WIDTH, SandboxScene.WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setRoundPixels(true);

    // 5. Elementos do DOM
    this.telemetryEl = document.getElementById('telemetry-info');
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

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
   * Constrói o piso 2.5D estilizado com profundidade e perspectiva
   */
  private createStage25D() {
    this.sceneryGfx = this.add.graphics();
    this.sceneryGfx.setDepth(-10);

    const w = SandboxScene.WORLD_WIDTH;
    const h = SandboxScene.WORLD_HEIGHT;

    // Fundo escuro atmosférico
    this.sceneryGfx.fillStyle(0x070b12, 1);
    this.sceneryGfx.fillRect(0, 0, w, h);

    // Parede de fundo (acima da linha do chão)
    this.sceneryGfx.fillStyle(0x0f172a, 1);
    this.sceneryGfx.fillRect(0, 0, w, SandboxScene.BOUNDS.minY);

    // Friso de separação da parede / início do solo
    this.sceneryGfx.lineStyle(2, 0x1e293b, 1);
    this.sceneryGfx.lineBetween(0, SandboxScene.BOUNDS.minY, w, SandboxScene.BOUNDS.minY);

    // Pista de chão 2.5D (área caminhável com gradiente de perspectiva)
    const floorH = SandboxScene.BOUNDS.maxY - SandboxScene.BOUNDS.minY + 40;
    this.sceneryGfx.fillStyle(0x131d2e, 1);
    this.sceneryGfx.fillRect(0, SandboxScene.BOUNDS.minY, w, floorH);

    // Faixas horizontais de perspectiva suave (guias de profundidade)
    this.sceneryGfx.lineStyle(1, 0x1e293b, 0.5);
    for (let y = SandboxScene.BOUNDS.minY; y <= SandboxScene.BOUNDS.maxY; y += 40) {
      this.sceneryGfx.lineBetween(0, y, w, y);
    }

    // Linhas verticais espaçadas para medir deslocamento horizontal
    for (let x = 0; x < w; x += 80) {
      this.sceneryGfx.lineBetween(x, SandboxScene.BOUNDS.minY, x, SandboxScene.BOUNDS.maxY + 20);
    }

    // Borda inferior da pista (fim do chão / rodapé visual)
    this.sceneryGfx.lineStyle(3, 0x38bdf8, 0.8);
    this.sceneryGfx.lineBetween(0, SandboxScene.BOUNDS.maxY + 20, w, SandboxScene.BOUNDS.maxY + 20);
  }

  /**
   * Telemetria em tempo real das animações e física
   */
  private updateTelemetryDom() {
    if (!this.telemetryEl) return;

    let animState = 'Idle (Respiração)';
    if (this.player.isAttacking) {
      animState = this.player.isPogoActive ? 'Pogo Jump (↓ + J)' : 'Ataque Frontal (J)';
    } else if (this.player.z > 0) {
      animState = 'Jump no Ar (Z: ' + Math.round(this.player.z) + 'px)';
    } else if (Math.hypot(this.player.vx, this.player.vy) > 15) {
      const isRunning = Math.hypot(this.player.vx, this.player.vy) >= 150;
      animState = isRunning ? 'Run 10 FPS (Ápice)' : 'Walk 10 FPS (Ciclo 4 Frames)';
    }

    this.telemetryEl.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
        <span><b>Sprite / Animação:</b> <span style="color:#38bdf8">${animState}</span></span>
        <span><b>Direção:</b> ${this.player.facing > 0 ? 'Direita (Padrão)' : 'Esquerda (FlipX)'}</span>
        <span><b>Posição X / Y:</b> ${Math.round(this.player.x)}, ${Math.round(this.player.y)}</span>
        <span><b>Altura Z (Pulo):</b> ${Math.round(this.player.z)} px</span>
      </div>
    `;
  }
}
