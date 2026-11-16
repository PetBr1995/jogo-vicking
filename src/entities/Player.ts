import Phaser from 'phaser';
import { CharacterConfig, CHARACTERS } from '../types/character';
import { TrainingDummy } from './TrainingDummy';

// Parâmetros de movimentação 2.5D fiéis ao jogo anterior (src/player.js)
export const MOVE_25D = {
  walkSpeed: 175,     // px/s no plano horizontal
  depthFactor: 0.65,  // profundidade no eixo vertical
  accel: 950,         // aceleração px/s²
  decel: 1400,        // desaceleração px/s²
};

export const JUMP_25D = {
  speed: 520,         // impulso inicial em Z (px/s)
  gravityUp: 1400,    // gravidade de subida px/s²
  gravityDown: 2300,  // gravidade de descida px/s² (mais responsiva)
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
};

export class Player extends Phaser.GameObjects.Container {
  public config: CharacterConfig;

  // Renderização: Sprite do Eirik em 80x80 e sombra no chão
  public eirikSprite: Phaser.GameObjects.Sprite;
  private shadowGfx: Phaser.GameObjects.Graphics;

  // Tweens e Animação Procedural
  private breathTween: Phaser.Tweens.Tween | null = null;
  private walkTimer: number = 0;
  private walkFrameIndex: number = 0;
  private isLanding: boolean = false;
  private landTimer: number = 0;

  // Estado e Física 2.5D
  public vx: number = 0;
  public vy: number = 0;
  public facing: number = 1; // 1 = frente (direita), -1 = trás (esquerda)

  // Eixo Z: Altura do Pulo acima do solo
  public z: number = 0;
  public vz: number = 0;
  public isAirborne: boolean = false;
  private jumpHeld: boolean = false;
  private coyoteTimer: number = 0;
  private jumpBufferTimer: number = 0;

  // Combate e Habilidades
  public isAttacking: boolean = false;
  private attackCooldown: number = 0;
  public isPogoActive: boolean = false;

  // Teclas direcionais, pulo e ataque
  private keys: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    attack: Phaser.Input.Keyboard.Key;
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.config = CHARACTERS.eirik;

    // Sombra elíptica projetada no plano do chão (y = 0 relativo)
    this.shadowGfx = scene.add.graphics();

    // Sprite do Eirik ancorado em (0.5, 1.0)
    this.eirikSprite = scene.add.sprite(0, 0, 'eirik_idle_01');
    this.eirikSprite.setOrigin(0.5, 1.0);
    this.eirikSprite.setDepth(10);

    this.add([this.shadowGfx, this.eirikSprite]);

    scene.add.existing(this);

    // Mapeamento de Teclas (WASD + Setas + Espaço + J)
    const kb = scene.input.keyboard!;
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      attack: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
    };

    this.renderShadow();
    this.startBreathTween();
  }

  public updatePlayer(
    dt: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    dummies: TrainingDummy[] = []
  ) {
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // 1. Movimentação nos 4 eixos (se não estiver atacando no chão)
    this.handleMovement4Axes(dt, bounds);

    // 2. Mecânica do Pulo no Eixo Z
    this.handleJumpZ(dt);

    // 3. Mecânica de Ataque & Pogo com Hitbox e Hitstop
    this.handleAttackAndPogo(dummies);

    // 4. Animação Procedural dos Sprites
    this.updateSpriteAnimations(dt);

    // 5. Atualiza sombra e elevação Z do sprite
    this.renderShadow();
    this.eirikSprite.y = -this.z;
  }

  /**
   * Movimentação suave nos 4 eixos do chão (X e Y)
   */
  private handleMovement4Axes(dt: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
    const left = this.keys.left.isDown;
    const right = this.keys.right.isDown;
    const up = this.keys.up.isDown;
    const down = this.keys.down.isDown;

    let dx = 0;
    let dy = 0;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    // Atualiza direção do olhar (facing)
    if (dx !== 0 && !this.isAttacking) {
      this.facing = dx > 0 ? 1 : -1;
    }

    const len = Math.hypot(dx, dy) || 1;
    let targetVx = 0;
    let targetVy = 0;

    // Trava movimento durante golpe terrestre
    const canMove = !(this.isAttacking && this.z <= 0);

    if (canMove && (dx !== 0 || dy !== 0)) {
      targetVx = (dx / len) * MOVE_25D.walkSpeed;
      targetVy = (dy / len) * MOVE_25D.walkSpeed * MOVE_25D.depthFactor;
    }

    const ax = Math.sign(targetVx) === -Math.sign(this.vx) || Math.abs(targetVx) < Math.abs(this.vx)
      ? MOVE_25D.decel
      : MOVE_25D.accel;
    const ay = Math.sign(targetVy) === -Math.sign(this.vy) || Math.abs(targetVy) < Math.abs(this.vy)
      ? MOVE_25D.decel
      : MOVE_25D.accel;

    const steer = this.z > 0 ? 0.75 : 1.0;
    this.vx = Phaser.Math.Linear(this.vx, targetVx, Math.min(1, (ax * steer * dt) / MOVE_25D.walkSpeed));
    this.vy = Phaser.Math.Linear(this.vy, targetVy, Math.min(1, (ay * steer * dt) / MOVE_25D.walkSpeed));

    this.x = Phaser.Math.Clamp(this.x + this.vx * dt, bounds.minX, bounds.maxX);
    this.y = Phaser.Math.Clamp(this.y + this.vy * dt, bounds.minY, bounds.maxY);
  }

  /**
   * Pulo de Precisão no Eixo Z com Gravidade e Aterrissagem
   */
  private handleJumpZ(dt: number) {
    this.jumpHeld = this.keys.jump.isDown;

    if (Phaser.Input.Keyboard.JustDown(this.keys.jump)) {
      this.jumpBufferTimer = JUMP_25D.jumpBuffer;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.z <= 0) {
      this.coyoteTimer = JUMP_25D.coyoteTime;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    const canJump = (this.z <= 0 || this.coyoteTimer > 0) && !this.isAirborne && !this.isAttacking;
    if ((this.jumpBufferTimer > 0 || Phaser.Input.Keyboard.JustDown(this.keys.jump)) && canJump) {
      this.vz = JUMP_25D.speed;
      this.isAirborne = true;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.stopBreathTween();
      this.spawnDust(this.x, this.y, 6);
    }

    // Física Gravitacional em Z
    if (this.isAirborne || this.z > 0) {
      const gravity = this.vz > 0 && this.jumpHeld ? JUMP_25D.gravityUp : JUMP_25D.gravityDown;
      this.vz -= gravity * dt;
      this.z += this.vz * dt;

      // Aterrissagem
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.isAirborne = false;
        this.onLand();
      }
    }
  }

  /**
   * Impacto de Aterrissagem: squash & stretch de 90ms + eirik_land por 100ms + poeira nos pés
   */
  private onLand() {
    this.isLanding = true;
    this.landTimer = 0.10; // 100ms
    this.stopBreathTween();
    this.eirikSprite.setTexture('eirik_land');

    // Squash & Stretch rápido de impacto (scaleY: 0.85, scaleX: 1.15) voltando em 90ms
    this.scene.tweens.add({
      targets: this.eirikSprite,
      scaleY: 0.85,
      scaleX: 1.15,
      duration: 45,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!this.isLanding) {
          this.eirikSprite.setScale(1.0, 1.0);
        }
      },
    });

    // Partículas simples de poeira nos pés
    this.spawnDust(this.x, this.y, 8);
  }

  /**
   * Ataque e Pogo Jump com Spawn de VFX Independente e Hitstop de 40ms
   */
  private handleAttackAndPogo(dummies: TrainingDummy[]) {
    const attackJustDown = Phaser.Input.Keyboard.JustDown(this.keys.attack);
    if (!attackJustDown || this.attackCooldown > 0) return;

    this.attackCooldown = 0.35;
    this.isAttacking = true;

    const isDownward = this.z > 15 && this.keys.down.isDown;
    this.isPogoActive = isDownward;

    this.stopBreathTween();
    this.eirikSprite.setTexture('eirik_attack');

    // Spawn do VFX axe_slash_vfx como sprite independente
    this.spawnAxeSlashVfx(isDownward);

    // Calcula hitbox no espaço 2.5D
    const hitW = 56;
    const hitH = 56;
    let hitX = this.x;
    let hitY = this.y - this.z;

    if (isDownward) {
      hitY = this.y - this.z + 18;
    } else {
      hitX = this.x + this.facing * 34;
      hitY = this.y - this.z - 30;
    }

    const hitBounds = new Phaser.Geom.Rectangle(hitX - hitW / 2, hitY - hitH / 2, hitW, hitH);

    // Checa acerto nos alvos de treino
    for (const dummy of dummies) {
      const dummyBounds = dummy.getHitboxRect();
      if (Phaser.Geom.Intersects.RectangleToRectangle(hitBounds, dummyBounds)) {
        this.onHitTarget(dummy, isDownward);
        break;
      }
    }

    // Fim da animação de golpe
    this.scene.time.delayedCall(160, () => {
      this.isAttacking = false;
      this.isPogoActive = false;
    });
  }

  /**
   * Spawna o VFX axe_slash_vfx na frente do Eirik ou abaixo no Pogo por 120ms
   */
  private spawnAxeSlashVfx(isDownward: boolean) {
    let slashX = this.x;
    let slashY = this.y - this.z;
    let slashAngle = 0;

    if (isDownward) {
      slashX = this.x;
      slashY = this.y - this.z + 14;
      slashAngle = this.facing > 0 ? 90 : -90;
    } else {
      slashX = this.x + this.facing * 36;
      slashY = this.y - this.z - 34;
      slashAngle = 0;
    }

    const vfx = this.scene.add.sprite(slashX, slashY, 'axe_slash_vfx');
    vfx.setOrigin(0.5, 0.5);
    vfx.setFlipX(this.facing < 0 && !isDownward);
    vfx.setAngle(slashAngle);
    vfx.setDepth(15);

    // Sprite ativo por 120ms com fade suave
    this.scene.tweens.add({
      targets: vfx,
      alpha: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 120,
      ease: 'Linear',
      onComplete: () => {
        vfx.destroy();
      },
    });
  }

  /**
   * Resposta de impacto no alvo: Hitstop de 40ms + Recoil + Pogo Jump
   */
  private onHitTarget(dummy: TrainingDummy, isDownward: boolean) {
    dummy.takeHit(isDownward ? 35 : 25, this.facing, isDownward);

    // Hitstop de 40ms com micro-shake de câmera
    this.applyHitstop(40);

    if (isDownward) {
      // Pogo Jump: quica imediatamente para cima no ar com impulso vertical forte
      this.vz = 540;
      this.isAirborne = true;
      this.coyoteTimer = 0;
      this.spawnDust(this.x, this.y - this.z, 14);
    } else {
      // Recoil: empurrão para trás no atacante
      this.x -= this.facing * 5;
      this.vx = -this.facing * 90;
    }
  }

  /**
   * Hitstop: Congela a física por durationMs milissegundos
   */
  public applyHitstop(durationMs: number = 40) {
    const origScale = this.scene.physics.world.timeScale;
    this.scene.physics.world.timeScale = 1000;
    this.scene.cameras.main.shake(durationMs * 2, 0.005);

    window.setTimeout(() => {
      this.scene.physics.world.timeScale = origScale;
    }, durationMs);
  }

  /**
   * Máquina de Estados e Animações dos Sprites
   */
  private updateSpriteAnimations(dt: number) {
    // 1. Espelhamento horizontal (flipX ao virar para a esquerda)
    this.eirikSprite.setFlipX(this.facing < 0);

    // 2. Se atacando, mantém eirik_attack
    if (this.isAttacking) {
      this.stopBreathTween();
      this.eirikSprite.setTexture('eirik_attack');
      return;
    }

    // 3. No ar: eirik_jump
    if (this.z > 0 || this.isAirborne) {
      this.stopBreathTween();
      this.isLanding = false;
      this.eirikSprite.setTexture('eirik_jump');
      return;
    }

    // 4. Aterrissagem: eirik_land por 100ms
    if (this.isLanding) {
      this.stopBreathTween();
      this.eirikSprite.setTexture('eirik_land');
      this.landTimer -= dt;
      if (this.landTimer <= 0 || Math.hypot(this.vx, this.vy) > 30) {
        this.isLanding = false;
        this.eirikSprite.setScale(1.0, 1.0);
      }
      return;
    }

    // 5. Movimentação no Solo: Walk / Run
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 15) {
      this.stopBreathTween();
      this.isLanding = false;

      // Ciclo a 10 FPS = 0.10s por frame
      const frameDuration = 0.10;
      this.walkTimer += dt;
      if (this.walkTimer >= frameDuration) {
        this.walkTimer = 0;
        this.walkFrameIndex = (this.walkFrameIndex + 1) % 4;
      }

      // Em velocidade máxima (ápice), alterna com eirik_run_01
      const isMaxSpeed = speed >= MOVE_25D.walkSpeed * 0.85;
      const walkCycle = isMaxSpeed
        ? ['eirik_walk_passing', 'eirik_run_01', 'eirik_walk_passing', 'eirik_idle_01']
        : ['eirik_walk_passing', 'eirik_walk_01', 'eirik_walk_passing', 'eirik_idle_01'];

      this.eirikSprite.setTexture(walkCycle[this.walkFrameIndex]);
      return;
    }

    // 6. Idle (Parado no chão com tween de respiração contínuo)
    this.walkTimer = 0;
    this.walkFrameIndex = 0;
    this.eirikSprite.setTexture('eirik_idle_01');
    this.startBreathTween();
  }

  /**
   * Tween contínuo e suave de respiração (scaleY: 1.0 -> 0.95, scaleX: 1.0 -> 1.02)
   */
  private startBreathTween() {
    if (this.breathTween) return;
    this.breathTween = this.scene.tweens.add({
      targets: this.eirikSprite,
      scaleY: 0.95,
      scaleX: 1.02,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopBreathTween() {
    if (this.breathTween) {
      this.breathTween.stop();
      this.breathTween = null;
    }
  }

  /**
   * Renderiza a sombra elíptica projetada no solo
   */
  private renderShadow() {
    this.shadowGfx.clear();
    const jumpProgress = Math.min(1, this.z / 250);
    const shadowScale = 1 - jumpProgress * 0.45;
    const shadowAlpha = 0.45 * (1 - jumpProgress * 0.55);

    this.shadowGfx.fillStyle(0x000000, shadowAlpha);
    this.shadowGfx.fillEllipse(0, 0, 36 * shadowScale, 14 * shadowScale);
  }

  /**
   * Partículas de poeira nos pés
   */
  private spawnDust(x: number, y: number, count: number = 6) {
    const p = this.scene.add.particles(x, y, '', {
      speed: { min: 20, max: 70 },
      angle: { min: 180, max: 360 },
      scale: { start: 4, end: 0 },
      lifespan: 220,
      quantity: count,
      tint: 0x94a3b8,
    });
    this.scene.time.delayedCall(250, () => p.destroy());
  }
}
