import { input } from './input.js';
import { whiteCopy } from './white.js';
import { keepOnGround } from './stage.js';

export const MOVE = {
  walkSpeed: 150,   // px/s on screen
  runSpeed: 300,    // holding Shift
  depthFactor: 0.6, // up/down is slower (perspective)
  accel: 900,       // px/s² speeding up
  decel: 1400,      // px/s² slowing down
};

// jump physics: variable jump height, coyote time, and aerial downward pogo
export const JUMP = {
  crouch: 0.05,     // s crouching before leaving the ground
  speed: 550,       // px/s upward at take-off
  gravityUp: 1400,  // px/s² rising
  gravityDown: 2200,// px/s² falling (snappier, less floaty)
  minAirTime: 0.12, // s minimum jump duration for short taps
  land: 0.08,       // s on the landing frame
  airControl: 0.65, // fraction of the normal steering in the air
  coyoteTime: 0.12, // s after leaving ground where jump is still allowed
  jumpBuffer: 0.14, // s input is remembered before hitting ground
};

// dash mechanic: invulnerable fast burst forward
export const DASH = {
  speed: 720,       // px/s during dash
  time: 0.18,       // s duration of the dash
  cooldown: 0.65,   // s before next dash
  invulnerable: 0.22, // s i-frames
};

// getting hit by the spear
export const LIFE = {
  max: 8,           // hits he can take
  stun: 0.3,        // s without control after a hit
  flash: 0.1,       // s drawn all white
  safe: 1.0,        // s he can't be hit again (he blinks)
  knockback: 360,   // px/s pushed away
  dodge: 18,        // px off the ground: high enough to jump over a thrust
};

// berserker fury, from the Rune of Fury
export const FURY = {
  time: 10,         // s it lasts
  speed: 1.3,       // walks and runs this much faster
  swing: 1.45,      // swings the axe this much faster
  damage: 2,        // each axe hit takes this much life
};

export const THUNDER_MAX = 5; // bolts he can carry
export const FIRE_MAX = 5;    // fire waves he can carry

// while casting a power, it runs all over his body (blue electricity for
// thunder, flames for fire): a glowing outline and a flickering tint
export const AURA = {
  time: 0.9,        // s from the start of the cast
  fadeOut: 0.3,     // s fading at the end
};

// walk-cycle positions (0..1) where both legs are under the body: when he
// stops, the legs finish the step up to the nearest one, then he stands
const REST_PHASES = [0.25, 0.75];
const SETTLE_SPEED = 2.5; // cycles/s while finishing the step

const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export class Player {
  /**
   * @param sheet  the sprite sheet image (fixed grid, see tools/make-viking.mjs)
   * @param meta   public/assets/viking.json
   * @param scale  pixel size on screen
   */
  constructor(sheet, meta, scale, x, y) {
    this.sheet = sheet;
    this.meta = meta;
    this.scale = scale;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;   // 1 = right (as drawn), -1 = left
    this.anim = 'idle';
    this.frame = 0;
    this.time = 0;
    this.phase = 0.25; // position in the walk cycle (0..1)
    this.z = 0;        // height above the floor (jump)
    this.vz = 0;
    this.jumpStage = null; // 'crouch' | 'air' | 'land'
    this.jumpHeld = false; // button held for variable jump height
    this.airTime = 0;      // s in the air
    this.coyoteTimer = 0;  // s jump window after leaving ground
    this.jumpBuffer = 0;   // s jump request buffered
    this.dashing = 0;      // s left in current dash
    this.dashCooldown = 0; // s cooldown until next dash
    this.dashDir = 1;      // dash facing direction
    this.airDashUsed = false; // single dash per jump
    this.ghosts = [];      // dash afterimage silhouettes
    this.ghostTimer = 0;
    this.onDash = null;    // callback for dash visual effects
    this.onPogo = null;    // callback when downward pogo strikes a foe
    this.attacking = false;
    this.airAttack = false; // true if attacking in mid-air
    this.white = whiteCopy(sheet);
    this.life = LIFE.max;
    this.stun = 0;
    this.flash = 0;
    this.safe = 0;
    this.dead = false;
    this.lockedForm = null; // 'base' | 'fury' | 'thunder' | 'fire' para testes
    this.fury = 0;     // s of berserker fury left
    this.thunder = 0;  // lightning bolts he can throw (Rune of Thunder)
    this.casting = false; // this swing throws a bolt instead of hitting
    this.onCast = null;   // called when the bolt leaves his hand
    this.axeAway = false; // the axe is flying (thrown in fury): empty hands
    this.onThrow = null;  // called when the axe leaves his hand
    this.fire = 0;        // fire waves he can cast (Rune of Fire)
    this.onFire = null;   // called when the fire wave leaves the axe
    this.aura = null;     // { kind: 'thunder' | 'fire', t } while casting
    this.red = whiteCopy(sheet, '#ff3a1a');
    this.blue = whiteCopy(sheet, '#8fe6ff');
    this.flame = whiteCopy(sheet, '#ff8a1e');
    this.onFootstep = null;
    this.onLand = null;
    this.onHit = null;
  }

  get speed() { return Math.hypot(this.vx, this.vy / MOVE.depthFactor); }
  get alive() { return !this.dead; }
  get furious() { return this.fury > 0; }
  get electrified() { return this.thunder > 0 || this.aura?.kind === 'thunder'; }
  get flaming() { return this.fire > 0 || this.aura?.kind === 'fire'; }
  get damage() { return this.furious ? FURY.damage : 1; }

  /** Food: gives back life (never above the maximum). Returns how much. */
  heal(amount) {
    if (this.dead) return 0;
    const before = this.life;
    this.life = Math.min(LIFE.max, this.life + amount);
    return this.life - before;
  }

  startFury() { this.fury = FURY.time; }

  /** Seleciona e trava uma forma específica para testes */
  setForm(form) {
    this.lockedForm = form;
    if (form === 'base') {
      this.fury = 0;
      this.thunder = 0;
      this.fire = 0;
      this.aura = null;
      if (this.meta.anims[this.anim + 'Fury'] || this.meta.anims[this.anim + 'Thunder'] || this.meta.anims[this.anim + 'Fire']) {
        this.setAnim('idle');
      }
    } else if (form === 'fury') {
      this.fury = FURY.time;
      this.thunder = 0;
      this.fire = 0;
      this.aura = null;
    } else if (form === 'thunder') {
      this.fury = 0;
      this.thunder = 10;
      this.fire = 0;
      this.aura = { kind: 'thunder', t: 2.5 };
    } else if (form === 'fire') {
      this.fury = 0;
      this.thunder = 0;
      this.fire = 10;
      this.aura = { kind: 'fire', t: 2.5 };
    }
  }

  /** Rune of Thunder: more bolts to throw (up to THUNDER_MAX). */
  addThunder(n) { this.thunder = Math.min(THUNDER_MAX, this.thunder + n); }

  /** Rune of Fire: more fire waves to cast (up to FIRE_MAX). */
  addFire(n) { this.fire = Math.min(FIRE_MAX, this.fire + n); }

  /** 0..1: how strong the power running over his body is right now. */
  get auraLevel() { return this.aura ? Math.min(1, this.aura.t / AURA.fadeOut) : 0; }

  /** A spear thrust reached him. Returns true if it counted. */
  hurt(fromX) {
    if (this.dead || this.safe > 0 || this.z > LIFE.dodge) return false;
    const away = this.x >= fromX ? 1 : -1;
    this.life--;
    this.flash = LIFE.flash;
    this.stun = LIFE.stun;
    this.safe = LIFE.safe;
    this.vx = away * LIFE.knockback;
    // a hit interrupts whatever he was doing
    this.attacking = false;
    if (this.jumpStage !== 'air') this.jumpStage = null;
    if (!this.jumpStage) this.setAnim('idle');
    if (this.life <= 0) this.dead = true;
    return true;
  }

  update(dt, bounds) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.lockedForm === 'fury') {
      this.fury = FURY.time;
    } else {
      this.fury = Math.max(0, this.fury - dt);
    }
    this.safe = Math.max(0, this.safe - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.dashing = Math.max(0, this.dashing - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.lockedForm === 'base') {
      this.fury = 0;
      this.thunder = 0;
      this.fire = 0;
      this.aura = null;
    } else if (this.lockedForm === 'thunder') {
      if (this.thunder < 3) this.thunder = 10;
    } else if (this.lockedForm === 'fire') {
      if (this.fire < 3) this.fire = 10;
    }
    if (this.aura && (this.aura.t -= dt) <= 0) this.aura = null;

    // update ghost afterimages from dash
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].alpha -= dt * 3.5;
      if (this.ghosts[i].alpha <= 0) this.ghosts.splice(i, 1);
    }

    // stunned or defeated: the keys do nothing
    const control = !this.dead && this.stun <= 0;
    const key = (...k) => control && input.isDown(...k);
    const press = (...k) => control && input.wasPressed(...k);
    const dx = (key('ArrowRight', 'KeyD') ? 1 : 0) - (key('ArrowLeft', 'KeyA') ? 1 : 0);
    const dy = (key('ArrowDown', 'KeyS') ? 1 : 0) - (key('ArrowUp', 'KeyW') ? 1 : 0);

    // K or C or Shift tap: Dash with invulnerability
    if (press('KeyK', 'KeyC') || press('ShiftLeft', 'ShiftRight')) {
      this.startDash();
    }

    // Space: Jump with buffering, coyote time, and variable height
    if (press('Space')) {
      this.jumpBuffer = JUMP.jumpBuffer;
    } else {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    }
    this.jumpHeld = key('Space');

    if (!this.jumpStage && this.z <= 0) {
      this.coyoteTimer = JUMP.coyoteTime;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    const canJump = (!this.jumpStage || this.coyoteTimer > 0) && !this.attacking && this.dashing <= 0;
    if (this.jumpBuffer > 0 && canJump) {
      this.jumpBuffer = 0;
      this.coyoteTimer = 0;
      this.startJump();
    }

    // J: axe attacks with rich moveset! (Combo slashes, Overhead cleave, 360 Spin Whirlwind, Downward Plunge slam)
    if (!this.attacking && !this.axeAway && press('KeyJ')) {
      const up = key('ArrowUp', 'KeyW');
      const down = key('ArrowDown', 'KeyS');
      const isAir = this.jumpStage === 'air' || this.z > 8;
      const isDashing = this.dashing > 0;

      if (this.furious) {
        if (up) {
          this.startAttack('throw');
        } else if (isAir) {
          this.startAttack('plunge');
        } else {
          this.startAttack('attack'); // golpe cortante furioso attackFury
        }
      } else if (isAir) {
        this.startAttack('plunge');
      } else if (isDashing || down) {
        this.startAttack('spin');
      } else if (up) {
        this.startAttack('overhead');
      } else {
        this.startAttack('combo');
      }
    } else if (this.attacking && !this.axeAway && press('KeyJ')) {
      // Buffer combo input to chain next attack smoothly!
      this.comboQueued = true;
    }

    // T: tecla dedicada para arremesso de machado (habilidade de fúria)
    if (!this.attacking && !this.axeAway && press('KeyT')) {
      this.startAttack('throw');
    }

    // L: throw a lightning bolt (can now cast in mid-air or on ground!)
    if (!this.attacking && !this.axeAway && this.thunder > 0 && press('KeyL')) {
      if (this.lockedForm !== 'thunder') {
        this.thunder--;
      }
      this.startAttack('cast');
    }
    // U: fire wave (strikes the ground, flames race forward)
    if (!this.jumpStage && !this.attacking && !this.axeAway && this.fire > 0 && press('KeyU')) {
      if (this.lockedForm !== 'fire') {
        this.fire--;
      }
      this.startAttack('fire');
    }

    if (this.dashing > 0) {
      // Dash overrides velocity: snappy, straight burst (electrified = lightning warp speed)
      const dashSpeed = this.electrified ? DASH.speed * 1.3 : DASH.speed;
      this.vx = this.dashDir * dashSpeed;
      this.vy = 0;
      if (this.jumpStage === 'air') this.vz = 0;
      this.ghostTimer = (this.ghostTimer || 0) + dt;
      if (this.ghostTimer >= 0.035) {
        this.ghostTimer = 0;
        this.ghosts.push({
          x: this.x,
          y: this.y,
          z: this.z,
          facing: this.facing,
          frame: this.frame,
          anim: this.anim,
          alpha: 0.7,
          isThunder: this.electrified,
        });
      }
    } else {
      const len = Math.hypot(dx, dy) || 1;
      const isRunning = key('ShiftLeft', 'ShiftRight');
      const max = (this.attacking ? 0 : isRunning ? MOVE.runSpeed : MOVE.walkSpeed)
        * (this.furious ? FURY.speed : 1);
      const tx = (dx / len) * max;
      const ty = (dy / len) * max * MOVE.depthFactor;

      // in the air he keeps momentum with responsive air control
      const steer = this.jumpStage === 'air' ? JUMP.airControl : this.jumpStage ? 0.3 : 1;
      if (dx && this.jumpStage !== 'air' && !this.attacking) this.facing = dx;

      // turning around: stop first, so he doesn't moonwalk
      const ax = Math.sign(tx) === -Math.sign(this.vx) || Math.abs(tx) < Math.abs(this.vx) ? MOVE.decel : MOVE.accel;
      const ay = Math.sign(ty) === -Math.sign(this.vy) || Math.abs(ty) < Math.abs(this.vy) ? MOVE.decel : MOVE.accel;
      this.vx = approach(this.vx, tx, ax * steer * dt);
      this.vy = approach(this.vy, ty, ay * steer * dt);
    }

    const px = this.x, py = this.y;
    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x + this.vx * dt));
    this.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.y + this.vy * dt));
    if (this.x === bounds.minX || this.x === bounds.maxX) this.vx = 0;
    if (this.y === bounds.minY || this.y === bounds.maxY) this.vy = 0;
    // painted stage: no walking over the chasm, water or cliffs
    const blocked = keepOnGround(this, px, py, bounds.walkable);
    if (blocked.bx) this.vx = 0;
    if (blocked.by) this.vy = 0;

    if (this.attacking) {
      this.updateAttack(dt);
      if (this.jumpStage) this.updateJump(dt);
    } else if (this.jumpStage) {
      this.updateJump(dt);
    } else if (this.dead && this.meta.anims.fall) {
      this.time += dt;
      this.updateFall();
    } else if (!control) {
      this.time += dt;
      this.hurtPose();
    } else {
      this.animate(dt, dx !== 0 || dy !== 0);
    }
  }

  // ---- hit and defeat (frames only if the art has them) ------------------

  // a few timed frames that stop on the last one
  playOnce(name) {
    const a = this.meta.anims[name];
    if (this.anim !== name) { this.anim = name; this.time = 0; }
    let t = this.time, f = 0;
    while (f < a.frames - 1 && t >= a.durations[f]) t -= a.durations[f++];
    this.frame = f;
  }

  // staggered by a hit: "hurt" frames, or the first idle frame
  hurtPose() {
    if (this.meta.anims.hurt) this.playOnce('hurt');
    else { this.setAnim('idle'); this.frame = 0; }
  }

  // defeated: falls and stays down
  updateFall() { this.playOnce('fall'); }

  // ---- attack ----------------------------------------------------------

  /** kind: 'swing' (axe hit), 'cast' (lightning bolt), 'throw' (axe throw), 'fire' (fire wave) */
  startDash() {
    if (this.dashing > 0 || this.dashCooldown > 0) return false;
    if (this.jumpStage === 'air') {
      if (this.airDashUsed) return false;
      this.airDashUsed = true;
    }
    this.dashing = DASH.time;
    this.dashCooldown = DASH.cooldown;
    this.safe = Math.max(this.safe, DASH.invulnerable);
    this.dashDir = this.facing;
    this.onDash?.(this);
    return true;
  }

  // Pogo bounce when attacking downwards in the air
  bounce(boost = 520) {
    this.vz = boost;
    this.airTime = 0;
    this.jumpStage = 'air';
    this.airDashUsed = false; // bouncing off a foe resets the air dash!
    this.onPogo?.(this);
  }

  startAttack(kind = 'combo') {
    this.attacking = true;
    this.attackKind = kind;
    this.casting = kind === 'cast' || kind === 'fire';
    this.airAttack = Boolean(this.jumpStage === 'air');
    this.comboQueued = false;
    this.time = 0;
    this.frame = 0;
    this.hitRegistered = new Set();
    if (this.casting) this.aura = { kind: kind === 'cast' ? 'thunder' : 'fire', t: AURA.time };

    if (kind === 'plunge') {
      // Mergulho aéreo rápido em direção ao solo com machado apontado para baixo
      this.vz = -650;
    }

    const thunder = this.electrified;
    const furyMode = this.furious;
    let animName = 'attack';

    if (kind === 'throw') {
      animName = furyMode && this.meta.anims.throwFury ? 'throwFury' : 'throw';
    } else if (kind === 'cast') {
      animName = this.meta.anims.cast ? 'cast' : 'attack';
    } else if (kind === 'fire') {
      animName = this.meta.anims.castFire ? 'castFire' : 'attack';
    } else if (furyMode && (kind === 'attack' || kind === 'swing')) {
      animName = this.meta.anims.attackFury ? 'attackFury' : 'attack';
    } else if (kind === 'spin') {
      animName = thunder && this.meta.anims.attackSpinThunder ? 'attackSpinThunder' : 'attackSpin';
    } else if (kind === 'overhead') {
      animName = thunder && this.meta.anims.attackOverheadThunder ? 'attackOverheadThunder' : 'attackOverhead';
    } else if (kind === 'plunge') {
      animName = thunder && this.meta.anims.attackPlungeThunder ? 'attackPlungeThunder' : 'attackPlunge';
    } else if (kind === 'combo') {
      animName = thunder && this.meta.anims.attackComboThunder ? 'attackComboThunder' : 'attackCombo';
    } else {
      animName = thunder && this.meta.anims.attackThunder ? 'attackThunder' : 'attack';
    }

    this.anim = animName;
  }

  updateAttack(dt) {
    const animMeta = this.meta.anims[this.anim] || this.meta.anims.attack;
    const { durations, frames } = animMeta;
    const hitFrames = animMeta.hitFrames || [animMeta.hitFrame ?? 3];

    this.time += dt * (this.furious ? FURY.swing : 1) * (this.casting ? 1.25 : 1);
    let guard = 0;
    while (guard++ < 20 && this.time >= (durations[this.frame] || 0.08)) {
      this.time -= (durations[this.frame] || 0.08);
      this.frame++;

      if (hitFrames.includes(this.frame) && !this.hitRegistered?.has(this.frame)) {
        this.hitRegistered?.add(this.frame);
        ({
          swing: this.onHit,
          combo: this.onHit,
          spin: this.onHit,
          overhead: this.onHit,
          plunge: this.onHit,
          cast: this.onCast,
          throw: this.onThrow,
          fire: this.onFire,
        })[this.attackKind]?.(this);
      }

      if (this.frame >= frames) {
        if (this.comboQueued) {
          this.comboQueued = false;
          const up = input.isDown('KeyW', 'ArrowUp');
          const down = input.isDown('KeyS', 'ArrowDown');
          if (up) this.startAttack('overhead');
          else if (down) this.startAttack('spin');
          else this.startAttack(this.attackKind === 'combo' ? 'spin' : 'combo');
          return;
        }

        this.attacking = false;
        this.airAttack = false;
        this.frame = 0;
        this.setAnim(this.jumpStage ? 'jump' : 'idle');
        return;
      }
    }
  }

  // ---- jump ------------------------------------------------------------

  startJump() {
    this.jumpStage = 'crouch';
    this.coyoteTimer = 0;
    this.airTime = 0;
    this.setAnim('jump');
    this.frame = 0;
  }

  updateJump(dt) {
    this.time += dt;
    if (this.jumpStage === 'crouch') {
      this.frame = 0;
      if (this.time >= JUMP.crouch) {
        this.jumpStage = 'air';
        this.vz = JUMP.speed;
        this.airTime = 0;
        this.time = 0;
      }
    } else if (this.jumpStage === 'air') {
      this.airTime += dt;
      // Variable jump height: holding the button allows reaching full arc
      const gravity = (this.vz > 0 && this.jumpHeld) ? JUMP.gravityUp : JUMP.gravityDown;
      this.vz -= gravity * dt;
      this.z += this.vz * dt;

      // pose from vertical velocity (unless attacking mid-air)
      if (!this.attacking) {
        const v = this.vz / JUMP.speed;
        this.frame = this.time < 0.07 ? 1 : v > 0.35 ? 2 : v > -0.35 ? 3 : 4;
      }

      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.jumpStage = 'land';
        this.airDashUsed = false; // landing resets air dash
        if (!this.attacking) this.frame = 5;
        this.time = 0;
        this.airTime = 0;
        this.onLand?.(this);
      }
    } else if (this.time >= JUMP.land) {
      // back on the ground: walk, run or stand, depending on the speed
      this.jumpStage = null;
      if (!this.attacking) this.setAnim(this.speed > 1 ? 'walk' : 'idle');
    }
  }

  get isMoving() { return this.anim === 'walk' || this.anim === 'run'; }

  animate(dt, wantsToMove) {
    const speed = this.speed;

    if (speed > 1) {
      // walk and run share the step position, so switching is seamless;
      // legs advance by distance traveled: the planted foot stays put
      this.setAnim(speed > MOVE.walkSpeed * 1.15 ? 'run' : 'walk');
      this.advancePhase((speed * dt) / (this.meta.anims[this.anim].stride * this.scale));
    } else if (this.isMoving && !wantsToMove) {
      // stopped mid-step: finish it, then stand
      const target = this.nextRest();
      const step = SETTLE_SPEED * dt;
      const left = (target - this.phase + 1) % 1;
      if (left <= step || left > 0.5) {
        this.phase = target;
        this.setAnim('idle');
      } else {
        this.setAnim('walk');
        this.advancePhase(step);
      }
    } else if (!this.isMoving) {
      this.setAnim('idle');
    }

    if (this.isMoving) {
      const { frames } = this.meta.anims[this.anim];
      this.frame = Math.round(this.phase * frames) % frames;
    } else {
      const animMeta = (this.electrified && this.meta.anims[this.anim + 'Thunder'])
        || (this.furious && this.meta.anims[this.anim + 'Fury'])
        || this.meta.anims[this.anim];
      const fps = animMeta.fps || 6;
      const frames = animMeta.frames || 6;
      this.time += dt;
      this.frame = Math.floor(this.time * fps) % frames;
    }
  }

  advancePhase(amount) {
    const prev = this.phase;
    this.phase = (this.phase + amount) % 1;
    for (const p of this.meta.anims[this.anim].steps) {
      const crossed = prev <= this.phase ? prev < p && this.phase >= p : prev < p || this.phase >= p;
      if (crossed) this.onFootstep?.(this);
    }
  }

  nextRest() {
    return REST_PHASES.find((p) => p > this.phase + 0.02) ?? REST_PHASES[0];
  }

  setAnim(name) {
    if (this.anim === name) return;
    this.anim = name;
    this.time = 0;
  }

  draw(ctx, debug) {
    const { cell, anchor } = this.meta;
    const s = this.scale;
    const smooth = (this.meta.detail || 1) > 1;

    // dash afterimage silhouettes
    if (this.ghosts.length > 0) {
      for (const g of this.ghosts) {
        ctx.save();
        ctx.imageSmoothingEnabled = smooth;
        ctx.globalAlpha = g.alpha * 0.55;
        ctx.translate(smooth ? g.x : Math.round(g.x), smooth ? g.y - g.z : Math.round(g.y - g.z));
        ctx.scale(g.facing * s, s);
        const gAnim = this.meta.anims[g.anim] || this.meta.anims.idle;
        const gRow = gAnim.row ?? 0;
        const gSrc = [g.frame * cell, gRow * cell, cell, cell];
        const gImg = this.blue || this.white || this.sheet;
        ctx.drawImage(gImg, ...gSrc, -anchor.x, -anchor.y, cell, cell);
        ctx.restore();
      }
    }

    // just hit: blinks while he can't be hit again
    if (this.safe > 0 && this.flash <= 0 && Math.floor(this.safe * 14) % 2) return;
    // with the axe away, the empty-handed version of the move (if the art has it);
    // in berserker fury or with thunder charges, the dedicated power rows
    const bare = this.axeAway && (
      this.furious && (this.anim === 'walk' || this.anim === 'run' || this.anim === 'jump')
        ? this.meta.anims[(this.anim === 'run' ? 'walk' : this.anim) + 'Fury']
        : this.meta.anims[this.anim + 'Bare']
    );
    const fury = !this.axeAway && this.furious && this.meta.anims[this.anim + 'Fury'];
    const thunder = !this.axeAway && !fury && this.electrified && this.meta.anims[this.anim + 'Thunder'];
    const fire = !this.axeAway && !fury && !thunder && this.flaming && this.meta.anims[this.anim + 'Fire'];
    const row = (bare || fury || thunder || fire || this.meta.anims[this.anim]).row;
    const img = this.flash > 0 ? this.white : this.sheet;
    const src = [this.frame * cell, row * cell, cell, cell];
    // casting a power: it runs over his whole body (unless the sheet already has painted art)
    const level = this.auraLevel;
    const hasPaintedThunder = Boolean(this.meta.anims.cast);
    const hasPaintedFire = Boolean(this.meta.anims.castFire);
    const hasPaintedFury = Boolean(this.meta.anims.idleFury);
    const tint = level > 0 && (
      this.aura.kind === 'thunder' ? (!hasPaintedThunder && this.blue) : (!hasPaintedFire && this.flame)
    );
    ctx.save();
    ctx.imageSmoothingEnabled = smooth;
    if (smooth) ctx.imageSmoothingQuality = 'high';
    ctx.translate(smooth ? this.x : Math.round(this.x), smooth ? this.y - this.z : Math.round(this.y - this.z));
    ctx.scale(this.facing * s, s);
    if (tint) {
      // glowing outline: the tinted body, one pixel off in each direction
      const o = Math.ceil(this.meta.detail || 1);
      ctx.globalAlpha = level * (0.7 + 0.3 * Math.random());
      for (const [ox, oy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) {
        ctx.drawImage(tint, ...src, -anchor.x + ox, -anchor.y + oy, cell, cell);
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, ...src, -anchor.x, -anchor.y, cell, cell);
    if (this.furious && !hasPaintedFury && this.flash <= 0) {
      // fury fallback when the sprite sheet has no dedicated fury rows
      const fade = Math.min(1, this.fury / 2);
      ctx.globalAlpha = (0.22 + 0.16 * Math.sin(performance.now() / 90)) * fade;
      ctx.drawImage(this.red, ...src, -anchor.x, -anchor.y, cell, cell);
      ctx.globalAlpha = 1;
    }
    if (tint && this.flash <= 0) {
      // the power flickering over the body
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (0.25 + 0.25 * Math.random()) * level;
      ctx.drawImage(tint, ...src, -anchor.x, -anchor.y, cell, cell);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (debug) {
      ctx.lineWidth = 1 / s;
      ctx.strokeStyle = '#0f0';
      ctx.strokeRect(-anchor.x, -anchor.y, cell, cell);
      ctx.fillStyle = '#f0f';
      ctx.fillRect(-0.5, -0.5, 1, 1);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
}
