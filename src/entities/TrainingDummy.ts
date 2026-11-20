import Phaser from 'phaser';

export class TrainingDummy extends Phaser.GameObjects.Container {
  declare public body: Phaser.Physics.Arcade.Body;
  public width: number = 40;
  public height: number = 68;
  private gfx: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  public maxHp: number = 100;
  public currentHp: number = 100;
  private hitFlashTimer: number = 0;
  public isSuspended: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, isSuspended: boolean = false) {
    super(scene, x, y);
    this.isSuspended = isSuspended;

    // Gráficos do Alvo de Treino estilizado
    this.gfx = scene.add.graphics();
    this.add(this.gfx);

    // Texto de HP no topo
    this.hpText = scene.add.text(0, -this.height - 14, '100 HP', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#facc15',
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    this.add(this.hpText);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(this.width, this.height);
    this.body.setOffset(-this.width / 2, -this.height);
    this.body.setImmovable(true);
    this.body.setAllowGravity(!isSuspended);

    // Visual rústico de tronco de treino viking (madeira escura e brasão dourado)
    this.drawDummy(0x45311f, 0xf59e0b);
  }

  private drawDummy(fillColor: number, accentColor: number) {
    this.gfx.clear();

    const w = this.width;
    const h = this.height;
    const x = -w / 2;
    const y = -h;

    // Suporte / Base de pedra e ferro fincada na terra
    this.gfx.fillStyle(0x1e293b, 1);
    this.gfx.fillRect(x - 4, y + h - 8, w + 8, 8);

    // Corpo de madeira do boneco
    this.gfx.fillStyle(fillColor, 1);
    this.gfx.fillRoundedRect(x, y, w, h - 8, 6);

    // Cinta de ferro forjado reforçando o tronco
    this.gfx.fillStyle(0x334155, 0.9);
    this.gfx.fillRect(x, y + 10, w, 5);
    this.gfx.fillRect(x, y + h - 18, w, 5);

    // Borda rústica firme (pixel art)
    this.gfx.lineStyle(2, 0x0f172a, 1);
    this.gfx.strokeRoundedRect(x, y, w, h - 8, 6);

    // Brasão rúnico de mira no peito
    const cy = y + (h - 8) / 2;
    this.gfx.lineStyle(2, accentColor, 1);
    this.gfx.strokeCircle(0, cy, 12);
    this.gfx.fillStyle(accentColor, 1);
    this.gfx.fillCircle(0, cy, 4);

    // Linhas cruzadas de mira
    this.gfx.lineStyle(1, accentColor, 0.8);
    this.gfx.lineBetween(-16, cy, 16, cy);
    this.gfx.lineBetween(0, cy - 16, 0, cy + 16);
  }

  public takeHit(damage: number, knockDir: number = 0, isPogo: boolean = false) {
    this.currentHp = Math.max(0, this.currentHp - damage);
    this.hpText.setText(`${this.currentHp} HP`);
    this.hpText.setScale(1.3);
    this.scene.tweens.add({
      targets: this.hpText,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
    });

    // Flash branco
    this.drawDummy(0xffffff, 0xffffff);
    this.scene.time.delayedCall(80, () => {
      this.drawDummy(0x45311f, 0xf59e0b);
    });

    // Tremor do boneco
    this.scene.tweens.add({
      targets: this,
      x: this.x + (isPogo ? 0 : knockDir * 6),
      y: this.y + (isPogo ? 4 : 0),
      duration: 40,
      yoyo: true,
      repeat: 1,
    });

    // Número flutuante de dano
    const dmgText = this.scene.add.text(
      this.x + (Math.random() * 20 - 10),
      this.y - this.height - 24,
      isPogo ? `💥 POGO -${damage}` : `-${damage}`,
      {
        fontFamily: 'monospace',
        fontSize: isPogo ? '14px' : '13px',
        color: isPogo ? '#38bdf8' : '#fb7185',
        stroke: '#000',
        strokeThickness: 3,
      }
    ).setOrigin(0.5);

    this.scene.tweens.add({
      targets: dmgText,
      y: dmgText.y - 32,
      alpha: 0,
      duration: 550,
      onComplete: () => dmgText.destroy(),
    });

    // Auto-regeneração rápida após 3s para continuar treinando
    this.scene.time.delayedCall(3000, () => {
      if (this.currentHp < this.maxHp) {
        this.currentHp = this.maxHp;
        this.hpText.setText('100 HP');
      }
    });
  }

  public getHitboxRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.x - this.width / 2, this.y - this.height, this.width, this.height);
  }

  public updateDummy(_delta: number) {
    // Manutenção de estado ou animação ociosa se necessário
  }
}
