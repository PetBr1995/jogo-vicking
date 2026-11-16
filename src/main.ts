import Phaser from 'phaser';
import { SandboxScene } from './scenes/SandboxScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 960,
  height: 540,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#090d16',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // Movimentação 2.5D no chão (4 eixos livres no plano X/Y, pulo no eixo Z)
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [SandboxScene],
};

// Inicializa a instância do jogo
new Phaser.Game(config);
