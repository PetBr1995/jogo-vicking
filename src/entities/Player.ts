import Phaser from 'phaser';
import { CharacterConfig, CHARACTERS } from '../types/character';
import { TrainingDummy } from './TrainingDummy';

// Parâmetros de movimentação 2.5D com peso e fluidez
export const MOVE_25D = {
  walkSpeed: 130,     // px/s no plano horizontal (ajustado para controle fluido e cadência realista)
  depthFactor: 0.60,  // profundidade no eixo vertical
  accel: 650,         // aceleração px/s² suave
  decel: 900,         // desaceleração px/s² com inércia natural
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
  public walkTimer: number = 0;
  public walkFrameIndex: number = 0;
  public idleTimer: number = 0;
  public idleFrameIndex: number = 0;
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
    this.eirikSprite = scene.add.sprite(0, 0, 'viking_base_idle_0');
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

    if (targetVx === 0 && Math.abs(this.vx) < 1.0) this.vx = 0;
    if (targetVy === 0 && Math.abs(this.vy) < 1.0) this.vy = 0;

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
    this.eirikSprite.setTexture('viking_base_jump_5');

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
    this.eirikSprite.setTexture(isDownward ? 'viking_base_attackPlunge_2' : 'viking_base_attack_2');

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

    // 2. Se atacando, anima os quadros de golpe do Viking Base 96
    if (this.isAttacking) {
      this.stopBreathTween();
      const frames = this.isPogoActive
        ? [
            'viking_base_attackPlunge_0',
            'viking_base_attackPlunge_1',
            'viking_base_attackPlunge_2',
            'viking_base_attackPlunge_3',
            'viking_base_attackPlunge_4',
            'viking_base_attackPlunge_5',
          ]
        : [
            'viking_base_attack_0',
            'viking_base_attack_1',
            'viking_base_attack_2',
            'viking_base_attack_3',
            'viking_base_attack_4',
            'viking_base_attack_5',
          ];
      const progress = Math.max(0, Math.min(1, 1 - this.attackCooldown / 0.35));
      const frameIdx = Math.min(frames.length - 1, Math.floor(progress * frames.length));
      this.eirikSprite.setTexture(frames[frameIdx]);
      return;
    }

    // 3. No ar: salto ascendente (jump_2) e descida no ar (jump_3)
    if (this.z > 0 || this.isAirborne) {
      this.stopBreathTween();
      this.isLanding = false;
      if (this.vz > 0) {
        this.eirikSprite.setTexture('viking_base_jump_2');
      } else {
        this.eirikSprite.setTexture('viking_base_jump_3');
      }
      return;
    }

    // 4. Aterrissagem: executada apenas após tocar o chão por 100ms
    if (this.isLanding) {
      this.stopBreathTween();
      this.eirikSprite.setTexture('viking_base_jump_5');
      this.landTimer -= dt;
      if (this.landTimer <= 0 || Math.hypot(this.vx, this.vy) > 30) {
        this.isLanding = false;
        this.eirikSprite.setScale(1.0, 1.0);
      }
      return;
    }

    // 5. Movimentação no Solo: Walk e Run com viking_base
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 15) {
      this.stopBreathTween();
      this.isLanding = false;
      this.idleTimer = 0;
      this.idleFrameIndex = 0;

      // Inclinação sutil e orgânica ao avançar (1.5 graus no sentido da caminhada)
      const targetAngle = this.facing * 1.5;
      this.eirikSprite.angle = Phaser.Math.Linear(this.eirikSprite.angle, targetAngle, 0.2);

      const isRunning = speed >= MOVE_25D.walkSpeed * 0.85;
      const walkCycle = isRunning
        ? [
            'viking_base_run_0',
            'viking_base_run_1',
            'viking_base_run_2',
            'viking_base_run_3',
            'viking_base_run_4',
            'viking_base_run_5',
          ]
        : [
            'viking_base_walk_0',
            'viking_base_walk_1',
            'viking_base_walk_2',
            'viking_base_walk_3',
            'viking_base_walk_4',
            'viking_base_walk_5',
          ];

      const frameDuration = isRunning ? 0.08 : 0.11;
      this.walkTimer += dt;
      if (this.walkTimer >= frameDuration) {
        this.walkTimer = 0;
        this.walkFrameIndex = (this.walkFrameIndex + 1) % walkCycle.length;
      }

      this.eirikSprite.setTexture(walkCycle[this.walkFrameIndex]);
      return;
    }

    // 6. Idle (Viking Base 96 parado - 6 frames a ~6 FPS fiéis a viking_base_96.json)
    this.walkTimer = 0;
    this.walkFrameIndex = 0;
    this.stopBreathTween();

    // Retorna o ângulo para a posição ereta suavemente
    this.eirikSprite.angle = Phaser.Math.Linear(this.eirikSprite.angle, 0, 0.2);

    const idleCycle = [
      'viking_base_idle_0',
      'viking_base_idle_1',
      'viking_base_idle_2',
      'viking_base_idle_3',
      'viking_base_idle_4',
      'viking_base_idle_5',
    ];
    const idleFrameDuration = 0.16; // 6 FPS
    this.idleTimer += dt;
    if (this.idleTimer >= idleFrameDuration) {
      this.idleTimer = 0;
      this.idleFrameIndex = (this.idleFrameIndex + 1) % idleCycle.length;
    }

    this.eirikSprite.setTexture(idleCycle[this.idleFrameIndex]);
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
}
