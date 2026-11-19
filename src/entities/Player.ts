import Phaser from 'phaser';
import { CharacterConfig, CHARACTERS } from '../types/character';
import { TrainingDummy } from './TrainingDummy';

// Parâmetros de movimentação 2.5D com peso e fluidez
export const MOVE_25D = {
  walkSpeed: 130,     // px/s no plano horizontal (ajustado para controle fluido e cadência realista)
  runSpeed: 210,      // px/s ao correr
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

export type AttackType = 'normal' | 'combo' | 'finisher' | 'overhead' | 'spin' | 'slam' | 'plungeImpact';

export class Player extends Phaser.GameObjects.Container {
  public config: CharacterConfig;

  // Renderização: Sprite do Eirik ancorado pelo pé na grade 128x128
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

  // Mecânica do Dash
  public isDashing: boolean = false;
  public dashTimer: number = 0;
  public dashCooldownTimer: number = 0;
  private dashDir: number = 1;
  private ghostSpawnTimer: number = 0;

  // Combate e Sistema de Combos
  public isAttacking: boolean = false;
  public isGroundSlamming: boolean = false;
  public currentAttackType: AttackType = 'normal';
  public isPogoActive: boolean = false;
  public comboStep: number = 0; // 0 = neutro, 1 = Hit 1, 2 = Hit 2, 3 = Hit 3 (Finalizador)
  public comboResetTimer: number = 0;
  private queuedNextAttack: boolean = false;
  private attackCooldown: number = 0;
  private attackDuration: number = 0.26;
  private attackTimer: number = 0;
  private hitChecked: boolean = false;

  // Teclas direcionais, pulo, ataque e dash
  private keys: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    attack: Phaser.Input.Keyboard.Key;
    dashK: Phaser.Input.Keyboard.Key;
    dashC: Phaser.Input.Keyboard.Key;
    dashShift: Phaser.Input.Keyboard.Key;
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.config = CHARACTERS.eirik;

    // Sombra elíptica projetada no plano do chão (y = 0 relativo)
    this.shadowGfx = scene.add.graphics();

    // Sprite do Viking ancorado pelo pé na grade 128x128 (x=64, y=118)
    this.eirikSprite = scene.add.sprite(0, 0, 'viking_base_idle_0');
    this.eirikSprite.setOrigin(0.5, 118 / 128);
    this.eirikSprite.setDepth(10);

    this.add([this.shadowGfx, this.eirikSprite]);

    scene.add.existing(this);

    // Mapeamento de Teclas (WASD + Espaço + J + K/C/Shift para Dash)
    const kb = scene.input.keyboard!;
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      attack: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      dashK: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      dashC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      dashShift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
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
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= dt;
    }
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0 && !this.isAttacking) {
        this.comboStep = 0; // Reseta o combo se o jogador pausar os golpes
      }
    }

    // 1. Mecânica de Dash (K, C ou Shift)
    this.handleDash(dt);

    // 2. Movimentação nos 4 eixos
    this.handleMovement4Axes(dt, bounds);

    // 3. Mecânica do Pulo no Eixo Z e Queda de Ground Slam
    this.handleJumpZ(dt, dummies);

    // 4. Mecânica de Ataques com Combo Fluido (Hit 1 -> Hit 2 -> Hit 3 Finalizador)
    this.handleAttackAndPogo(dt, dummies);

    // 5. Animação Procedural dos Sprites
    this.updateSpriteAnimations(dt);

    // 6. Atualiza sombra e elevação Z do sprite
    this.renderShadow();
    this.eirikSprite.y = -this.z;
  }

  /**
   * Mecânica de Dash com Fantasmas de Rastro (Afterimages)
   */
  private handleDash(dt: number) {
    const dashJustDown =
      Phaser.Input.Keyboard.JustDown(this.keys.dashK) ||
      Phaser.Input.Keyboard.JustDown(this.keys.dashC) ||
      Phaser.Input.Keyboard.JustDown(this.keys.dashShift);

    const canDash =
      dashJustDown &&
      this.dashCooldownTimer <= 0 &&
      !this.isDashing &&
      !this.isLanding &&
      !this.isGroundSlamming &&
      (!this.isAttacking || this.currentAttackType === 'spin');

    if (canDash) {
      this.isDashing = true;
      this.dashTimer = 0.18; // 180ms de arrancada rápida
      this.dashCooldownTimer = 0.40;

      // Se estiver pressionando para algum lado, vira imediatamente
      if (this.keys.left.isDown) this.facing = -1;
      else if (this.keys.right.isDown) this.facing = 1;

      this.dashDir = this.facing;
      this.eirikSprite.setFlipX(this.facing < 0);

      // No ar: sustenta a gravidade durante o dash (Air Dash)
      if (this.z > 0) {
        this.vz = 0;
      }

      this.stopBreathTween();
      this.spawnDashGhost();
      this.ghostSpawnTimer = 0;

      // Micro squash & stretch do arranque
      this.scene.tweens.add({
        targets: this.eirikSprite,
        scaleX: 1.15,
        scaleY: 0.90,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    if (this.isDashing) {
      this.dashTimer -= dt;
      this.vx = this.dashDir * 680; // Velocidade alta de arrancada

      // Se estiver no ar durante o dash, cancela a queda momentaneamente
      if (this.z > 0) {
        this.vz = 0;
      }

      // Cria silhuetas fantasma semi-transparentes de rastro
      this.ghostSpawnTimer += dt;
      if (this.ghostSpawnTimer >= 0.035) {
        this.ghostSpawnTimer = 0;
        this.spawnDashGhost();
      }

      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.vx = this.dashDir * 150; // Impulso residual suave
      }
    }
  }

  /**
   * Spawna o rastro fantasma do Viking (proporções idênticas em 128x128)
   */
  private spawnDashGhost() {
    const currentTex = this.eirikSprite.texture.key;
    const ghost = this.scene.add.sprite(this.x, this.y - this.z, currentTex);
    ghost.setOrigin(0.5, 118 / 128);
    ghost.setFlipX(this.eirikSprite.flipX);
    ghost.setAngle(this.eirikSprite.angle);
    ghost.setAlpha(0.60);
    ghost.setTint(0x38bdf8); // Ciano brilhante nórdico
    ghost.setDepth(this.depth - 1);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: ghost.flipX ? -1.06 : 1.06,
      scaleY: 1.06,
      duration: 210,
      ease: 'Quad.easeOut',
      onComplete: () => {
        ghost.destroy();
      },
    });
  }

  /**
   * Movimentação suave nos 4 eixos do chão (X e Y)
   */
  private handleMovement4Axes(dt: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
    if (this.isDashing) {
      this.x = Phaser.Math.Clamp(this.x + this.vx * dt, bounds.minX, bounds.maxX);
      return;
    }

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

    // Trava movimento durante golpes terrestres (exceto deslizes de ataque)
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
  private handleJumpZ(dt: number, dummies: TrainingDummy[]) {
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

    const canJump =
      (this.z <= 0 || this.coyoteTimer > 0) &&
      !this.isAirborne &&
      !this.isAttacking &&
      !this.isDashing;

    if ((this.jumpBufferTimer > 0 || Phaser.Input.Keyboard.JustDown(this.keys.jump)) && canJump) {
      this.vz = JUMP_25D.speed;
      this.isAirborne = true;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.stopBreathTween();
    }

    // Se estiver em Ground Slam (mergulho rápido com machado para o chão)
    if (this.isGroundSlamming) {
      this.vz = -950; // Descida acelerada de impacto
      this.z += this.vz * dt;

      // Checa se acertou um inimigo no ar durante a descida (Pogo)
      this.checkAirSlamDummyHit(dummies);

      // Impacto no chão
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.isAirborne = false;
        this.isGroundSlamming = false;
        this.triggerGroundSlamImpact(dummies);
      }
      return;
    }

    // Física Gravitacional normal em Z (se não estiver em Dash no ar)
    if ((this.isAirborne || this.z > 0) && !this.isDashing) {
      const gravity = this.vz > 0 && this.jumpHeld ? JUMP_25D.gravityUp : JUMP_25D.gravityDown;
      this.vz -= gravity * dt;
      this.z += this.vz * dt;

      // Aterrissagem suave normal
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.isAirborne = false;
        this.onLand();
      }
    }
  }

  /**
   * Checa se o machado acertou um alvo no ar durante a descida (Pogo)
   */
  private checkAirSlamDummyHit(dummies: TrainingDummy[]) {
    const hitBounds = new Phaser.Geom.Rectangle(this.x - 28, this.y - this.z + 10, 56, 50);
    for (const dummy of dummies) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(hitBounds, dummy.getHitboxRect())) {
        dummy.takeHit(35, this.facing, true);
        this.applyHitstop(45);
        this.vz = 560; // Pula de volta no ar (Pogo Bounce)
        this.isGroundSlamming = false;
        this.isAttacking = false;
        this.isPogoActive = true;
        break;
      }
    }
  }

  /**
   * Impacto de Aterrissagem Normal
   */
  private onLand() {
    this.isLanding = true;
    this.landTimer = 0.10; // 100ms
    this.stopBreathTween();
    this.eirikSprite.setTexture('viking_base_jump_5');

    // Squash & Stretch rápido de impacto
    this.scene.tweens.add({
      targets: this.eirikSprite,
      scaleY: 0.88,
      scaleX: 1.12,
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
   * Impacto Brutal de Ground Slam no Chão: Onda de Choque, Screenshake e Dano em Área
   */
  private triggerGroundSlamImpact(dummies: TrainingDummy[]) {
    this.isAttacking = true;
    this.currentAttackType = 'plungeImpact';
    this.attackDuration = 0.28;
    this.attackTimer = 0;
    this.attackCooldown = 0.32;
    this.comboStep = 0;
    this.stopBreathTween();

    // 1. Screenshake pesado
    this.scene.cameras.main.shake(150, 0.015);

    // 2. Onda de choque no solo (desenhada via gráficos vetoriais)
    this.spawnShockwave(this.x, this.y);

    // 3. Dano em Área (AoE) em todos os alvos próximos
    for (const dummy of dummies) {
      const dx = dummy.x - this.x;
      const dy = dummy.y - this.y;
      if (Math.abs(dx) <= 120 && Math.abs(dy) <= 55) {
        dummy.takeHit(45, Math.sign(dx) || this.facing, false);
      }
    }

    // 4. Hitstop de 50ms para peso e satisfação do golpe
    this.applyHitstop(50);
  }

  /**
   * Desenha anéis de onda de choque e poeira de impacto no solo
   */
  private spawnShockwave(x: number, y: number) {
    const shock = this.scene.add.graphics();
    shock.setDepth(this.depth - 1);
    const maxR = 90;
    const dur = 260;

    this.scene.tweens.addCounter({
      from: 10,
      to: maxR,
      duration: dur,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        const r = tween.getValue();
        const alpha = Math.max(0, 1 - (r - 10) / (maxR - 10));
        shock.clear();

        // Anel elíptico externo ciano
        shock.lineStyle(3, 0x38bdf8, alpha * 0.9);
        shock.strokeEllipse(x, y, r * 2.2, r * 0.8);

        // Anel elíptico interno branco de energia
        shock.lineStyle(1.5, 0xffffff, alpha * 0.85);
        shock.strokeEllipse(x, y, r * 1.5, r * 0.55);

        // Fissuras de terra nos lados
        if (r < maxR * 0.7) {
          shock.lineStyle(2, 0x7dd3fc, alpha * 0.7);
          shock.lineBetween(x - r * 0.9, y, x - r * 1.15, y + 2);
          shock.lineBetween(x + r * 0.9, y, x + r * 1.15, y - 2);
        }
      },
      onComplete: () => {
        shock.destroy();
      },
    });
  }

  /**
   * Mecânica de Ataque e Combos com Fila de Inputs (Combo Input Buffering)
   */
  private handleAttackAndPogo(dt: number, dummies: TrainingDummy[]) {
    const attackJustDown = Phaser.Input.Keyboard.JustDown(this.keys.attack);

    // Se estiver atacando no chão (com golpe normal/combo/overhead/spin/finisher)
    if (this.isAttacking && !this.isGroundSlamming) {
      this.attackTimer += dt;

      // Se o jogador clicar repetidas vezes no botão de ataque durante o golpe, enfileira o próximo combo!
      if (attackJustDown) {
        this.queuedNextAttack = true;
      }

      // Checa a hitbox no instante de corte da lâmina (~50-70ms)
      if (!this.hitChecked && this.attackTimer >= 0.05) {
        this.hitChecked = true;
        this.checkAttackHitboxes(dummies);
      }

      // Janela de cancelamento do golpe para transição imediata do combo
      // Se o golpe já passou de 65% da duração e o jogador já clicou no botão de novo:
      if (this.queuedNextAttack && this.attackTimer >= this.attackDuration * 0.65) {
        this.queuedNextAttack = false;
        this.advanceCombo();
        return;
      }

      // Fim natural do golpe atual
      if (this.attackTimer >= this.attackDuration) {
        if (this.queuedNextAttack) {
          this.queuedNextAttack = false;
          this.advanceCombo();
          return;
        }

        // Se o golpe terminou sem input na fila, abre a janela de 500ms para continuar o combo
        this.isAttacking = false;
        this.isPogoActive = false;
        this.comboResetTimer = 0.50;
        this.eirikSprite.setScale(1.0, 1.0);
      }
      return;
    }

    if (!attackJustDown || this.attackCooldown > 0 || this.isDashing || this.isLanding) return;

    this.stopBreathTween();

    // 1. ATAQUE NO AR -> GROUND SLAM / PLUNGE
    if (this.z > 15 || this.isAirborne) {
      this.isGroundSlamming = true;
      this.isAttacking = true;
      this.currentAttackType = 'slam';
      this.vz = -950; // Descida em alta velocidade
      this.vx *= 0.25; // Foca o mergulho vertical
      this.hitChecked = false;
      this.comboStep = 0;
      this.eirikSprite.setTexture('viking_base_attackPlunge_1');
      return;
    }

    // 2. ATAQUES DIRECIONAIS NO CHÃO
    // A) Overhead / Golpe Alto (W + J)
    if (this.keys.up.isDown) {
      this.currentAttackType = 'overhead';
      this.attackDuration = 0.30;
      this.attackCooldown = 0.34;
      this.isAttacking = true;
      this.attackTimer = 0;
      this.hitChecked = false;
      this.comboStep = 0;
      return;
    }

    // B) Giro 360° Direto (S + J)
    if (this.keys.down.isDown) {
      this.currentAttackType = 'spin';
      this.attackDuration = 0.34;
      this.attackCooldown = 0.38;
      this.isAttacking = true;
      this.attackTimer = 0;
      this.hitChecked = false;
      this.comboStep = 0;
      this.vx = this.facing * 100;
      return;
    }

    // 3. COMBO DE ATAQUES SEQUENCIAIS (Hit 1 -> Hit 2 -> Hit 3 Finalizador)
    if (this.comboResetTimer > 0 && this.comboStep > 0) {
      this.comboStep = (this.comboStep % 3) + 1;
    } else {
      this.comboStep = 1;
    }

    this.startComboAttack(this.comboStep);
  }

  /**
   * Avança para o próximo estágio do combo fluido (1 -> 2 -> 3)
   */
  private advanceCombo() {
    this.comboStep = (this.comboStep % 3) + 1;
    this.startComboAttack(this.comboStep);
  }

  /**
   * Inicia o estágio específico do combo com velocidade, animação e avanço
   */
  private startComboAttack(step: number) {
    this.isAttacking = true;
    this.attackTimer = 0;
    this.hitChecked = false;
    this.queuedNextAttack = false;
    this.stopBreathTween();

    if (step === 1) {
      // Hit 1: Corte rápido horizontal
      this.currentAttackType = 'normal';
      this.attackDuration = 0.25;
      this.attackCooldown = 0.28;
      this.vx = this.facing * 90; // Passo de aproximação
    } else if (step === 2) {
      // Hit 2: Corte diagonal pesado
      this.currentAttackType = 'combo';
      this.attackDuration = 0.28;
      this.attackCooldown = 0.32;
      this.vx = this.facing * 150; // Avanço corporal firme
    } else {
      // Hit 3: Giro Finalizador 360° devastador
      this.currentAttackType = 'finisher';
      this.attackDuration = 0.34;
      this.attackCooldown = 0.38;
      this.vx = this.facing * 200; // Impulso giratório com finalização
    }
  }

  /**
   * Checagem de Hitboxes adaptadas por tipo de golpe
   */
  private checkAttackHitboxes(dummies: TrainingDummy[]) {
    let hitW = 60;
    let hitH = 52;
    let hitX = this.x + this.facing * 36;
    let hitY = this.y - this.z - 28;
    let damage = 22;
    let knockbackForce = 70;
    let isHeavyHit = false;

    switch (this.currentAttackType) {
      case 'overhead':
        hitW = 58;
        hitH = 78;
        hitX = this.x + this.facing * 26;
        hitY = this.y - this.z - 42; // Alcança mais alto
        damage = 32;
        knockbackForce = 85;
        break;

      case 'spin':
        hitW = 112; // Cobre frente e costas do Viking
        hitH = 50;
        hitX = this.x;
        hitY = this.y - this.z - 26;
        damage = 30;
        knockbackForce = 120;
        break;

      case 'combo': // Hit 2
        hitW = 70;
        hitH = 56;
        hitX = this.x + this.facing * 42;
        hitY = this.y - this.z - 26;
        damage = 34;
        knockbackForce = 140;
        break;

      case 'finisher': // Hit 3 Finalizador
        hitW = 120; // 360° com raio expandido
        hitH = 54;
        hitX = this.x;
        hitY = this.y - this.z - 26;
        damage = 48; // Dano massivo
        knockbackForce = 260; // Arremessa o alvo
        isHeavyHit = true;
        break;

      case 'normal': // Hit 1
      default:
        hitW = 60;
        hitH = 52;
        hitX = this.x + this.facing * 36;
        hitY = this.y - this.z - 28;
        damage = 22;
        knockbackForce = 70;
        break;
    }

    const hitBounds = new Phaser.Geom.Rectangle(hitX - hitW / 2, hitY - hitH / 2, hitW, hitH);

    for (const dummy of dummies) {
      const dummyBounds = dummy.getHitboxRect();
      if (Phaser.Geom.Intersects.RectangleToRectangle(hitBounds, dummyBounds)) {
        dummy.takeHit(damage, this.facing * (isHeavyHit ? 2 : 1), false);
        this.applyHitstop(isHeavyHit ? 50 : 38);

        if (isHeavyHit) {
          // Screenshake e faíscas de impacto no golpe finalizador
          this.scene.cameras.main.shake(90, 0.009);
          this.spawnHitSparks(dummy.x, dummy.y - 30);
        } else {
          // Recoil no atacante nos primeiros golpes
          this.x -= this.facing * 3;
          this.vx = -this.facing * knockbackForce * 0.4;
        }
        break;
      }
    }
  }

  /**
   * Efeito de faíscas geométricas de impacto douradas/âmbar
   */
  private spawnHitSparks(x: number, y: number) {
    const sparks = this.scene.add.graphics();
    sparks.setDepth(this.depth + 1);

    this.scene.tweens.addCounter({
      from: 4,
      to: 22,
      duration: 160,
      ease: 'Quad.easeOut',
      onUpdate: (tween) => {
        const r = tween.getValue();
        const alpha = Math.max(0, 1 - (r - 4) / 18);
        sparks.clear();
        sparks.lineStyle(2, 0xfacc15, alpha); // Faíscas douradas de corte
        sparks.lineBetween(x - r, y - r, x - r * 1.4, y - r * 1.4);
        sparks.lineBetween(x + r, y - r, x + r * 1.4, y - r * 1.4);
        sparks.lineBetween(x - r, y + r, x - r * 1.4, y + r * 1.4);
        sparks.lineBetween(x + r, y + r, x + r * 1.4, y + r * 1.4);
      },
      onComplete: () => {
        sparks.destroy();
      },
    });
  }

  /**
   * Hitstop: Pausa breve de 40ms com micro-shake de impacto
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

    // 2. Dash: pose ágil inclinada com rastro
    if (this.isDashing) {
      this.stopBreathTween();
      this.eirikSprite.setTexture('viking_base_run_2');
      this.eirikSprite.angle = this.facing * 6;
      return;
    }

    // 3. Mergulho de Ground Slam no ar
    if (this.isGroundSlamming) {
      this.stopBreathTween();
      this.eirikSprite.setTexture('viking_base_attackPlunge_1');
      this.eirikSprite.angle = this.facing * 3;
      return;
    }

    // 4. Ataques (Normal, Combo, Finisher, Overhead, Spin, PlungeImpact)
    if (this.isAttacking) {
      this.stopBreathTween();
      const progress = Math.max(0, Math.min(1, this.attackTimer / this.attackDuration));

      if (this.currentAttackType === 'plungeImpact') {
        const impactFrames = [
          'viking_base_attackPlunge_3',
          'viking_base_attackPlunge_4',
          'viking_base_attackPlunge_5',
        ];
        const fIdx = Math.min(2, Math.floor(progress * 3));
        this.eirikSprite.setTexture(impactFrames[fIdx]);
        this.eirikSprite.angle = 0;
        return;
      }

      let animPrefix = 'viking_base_attack';
      if (this.currentAttackType === 'combo') animPrefix = 'viking_base_attackCombo';
      else if (this.currentAttackType === 'overhead') animPrefix = 'viking_base_attackOverhead';
      else if (this.currentAttackType === 'spin' || this.currentAttackType === 'finisher') {
        animPrefix = 'viking_base_attackSpin';
      }

      const fIdx = Math.min(5, Math.floor(progress * 6));
      this.eirikSprite.setTexture(`${animPrefix}_${fIdx}`);
      this.eirikSprite.angle = 0;
      return;
    }

    // 5. No ar: salto ascendente (jump_2) e descida no ar (jump_3)
    if (this.z > 0 || this.isAirborne) {
      this.stopBreathTween();
      this.isLanding = false;
      this.eirikSprite.angle = 0;
      if (this.vz > 0) {
        this.eirikSprite.setTexture('viking_base_jump_2');
      } else {
        this.eirikSprite.setTexture('viking_base_jump_3');
      }
      return;
    }

    // 6. Aterrissagem suave: executada apenas após tocar o chão por 100ms
    if (this.isLanding) {
      this.stopBreathTween();
      this.eirikSprite.setTexture('viking_base_jump_5');
      this.eirikSprite.angle = 0;
      this.landTimer -= dt;
      if (this.landTimer <= 0 || Math.hypot(this.vx, this.vy) > 30) {
        this.isLanding = false;
        this.eirikSprite.setScale(1.0, 1.0);
      }
      return;
    }

    // 7. Movimentação no Solo: Walk e Run com viking_base
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

    // 8. Idle (Viking Base 96 parado - 6 frames a ~6 FPS fiéis a viking_base_96.json)
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
