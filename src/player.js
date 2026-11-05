import { input } from './input.js';
import { whiteCopy } from './white.js';

export const MOVE = {
  walkSpeed: 150,   // px/s on screen
  runSpeed: 300,    // holding Shift
  depthFactor: 0.6, // up/down is slower (perspective)
  accel: 900,       // px/s² speeding up
  decel: 1400,      // px/s² slowing down
};

// jump frames: 0 crouch, 1 take-off, 2 rising, 3 top, 4 falling, 5 landing
export const JUMP = {
  crouch: 0.08,     // s crouching before leaving the ground
  speed: 520,       // px/s upward at take-off
  gravity: 1600,    // px/s²
  land: 0.1,        // s on the landing frame
  airControl: 0.5,  // fraction of the normal steering in the air
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
    this.attacking = false;
    this.white = whiteCopy(sheet);
    this.life = LIFE.max;
    this.stun = 0;
    this.flash = 0;
    this.safe = 0;
    this.dead = false;
    this.onFootstep = null;
    this.onLand = null;
    this.onHit = null;
  }

  get speed() { return Math.hypot(this.vx, this.vy / MOVE.depthFactor); }
  get alive() { return !this.dead; }

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
    this.safe = Math.max(0, this.safe - dt);
    this.stun = Math.max(0, this.stun - dt);
    // stunned or defeated: the keys do nothing
    const control = !this.dead && this.stun <= 0;
    const key = (...k) => control && input.isDown(...k);
    const press = (...k) => control && input.wasPressed(...k);
    const dx = (key('ArrowRight', 'KeyD') ? 1 : 0) - (key('ArrowLeft', 'KeyA') ? 1 : 0);
    const dy = (key('ArrowDown', 'KeyS') ? 1 : 0) - (key('ArrowUp', 'KeyW') ? 1 : 0);
    if (!this.jumpStage && !this.attacking && press('KeyJ')) this.startAttack();
    const len = Math.hypot(dx, dy) || 1;
    // attacking: he plants his feet (slows to a stop) and can't turn
    const max = this.attacking ? 0 : key('ShiftLeft', 'ShiftRight') ? MOVE.runSpeed : MOVE.walkSpeed;
    const tx = (dx / len) * max;
    const ty = (dy / len) * max * MOVE.depthFactor;
    if (!this.jumpStage && !this.attacking && press('Space', 'KeyK')) this.startJump();
    // in the air he keeps his momentum and steers less
    const steer = this.jumpStage === 'air' ? JUMP.airControl : this.jumpStage ? 0.3 : 1;
    if (dx && this.jumpStage !== 'air' && !this.attacking) this.facing = dx;

    // turning around: stop first, so he doesn't moonwalk
    const ax = Math.sign(tx) === -Math.sign(this.vx) || Math.abs(tx) < Math.abs(this.vx) ? MOVE.decel : MOVE.accel;
    const ay = Math.sign(ty) === -Math.sign(this.vy) || Math.abs(ty) < Math.abs(this.vy) ? MOVE.decel : MOVE.accel;
    this.vx = approach(this.vx, tx, ax * steer * dt);
    this.vy = approach(this.vy, ty, ay * steer * dt);

    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x + this.vx * dt));
    this.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.y + this.vy * dt));
    if (this.x === bounds.minX || this.x === bounds.maxX) this.vx = 0;
    if (this.y === bounds.minY || this.y === bounds.maxY) this.vy = 0;

    if (this.attacking) this.updateAttack(dt);
    else if (this.jumpStage) this.updateJump(dt);
    else if (this.dead && this.meta.anims.fall) { this.time += dt; this.updateFall(); }
    else if (!control) { this.time += dt; this.hurtPose(); }
    else this.animate(dt, dx !== 0 || dy !== 0);
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

  startAttack() {
    this.attacking = true;
    this.setAnim('attack');
    this.frame = 0;
  }

  updateAttack(dt) {
    const { durations, hitFrame, frames } = this.meta.anims.attack;
    this.time += dt;
    while (this.time >= durations[this.frame]) {
      this.time -= durations[this.frame];
      this.frame++;
      if (this.frame === hitFrame) this.onHit?.(this);
      if (this.frame >= frames) {
        // swing done: back to standing (or walking, if he's moving)
        this.attacking = false;
        this.frame = 0;
        this.setAnim('idle');
        return;
      }
    }
  }

  // ---- jump ------------------------------------------------------------

  startJump() {
    this.jumpStage = 'crouch';
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
        this.time = 0;
      }
    } else if (this.jumpStage === 'air') {
      this.vz -= JUMP.gravity * dt;
      this.z += this.vz * dt;
      // pose from the vertical speed: 1 = take-off, 0 = top, < 0 falling
      const v = this.vz / JUMP.speed;
      this.frame = this.time < 0.07 ? 1 : v > 0.35 ? 2 : v > -0.35 ? 3 : 4;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.jumpStage = 'land';
        this.frame = 5;
        this.time = 0;
        this.onLand?.(this);
      }
    } else if (this.time >= JUMP.land) {
      // back on the ground: walk, run or stand, depending on the speed
      this.jumpStage = null;
      this.setAnim(this.speed > 1 ? 'walk' : 'idle');
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
      const idle = this.meta.anims.idle;
      this.time += dt;
      this.frame = Math.floor(this.time * idle.fps) % idle.frames;
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
    // just hit: blinks while he can't be hit again
    if (this.safe > 0 && this.flash <= 0 && Math.floor(this.safe * 14) % 2) return;
    const { cell, anchor } = this.meta;
    const row = this.meta.anims[this.anim].row;
    const s = this.scale;
    const img = this.flash > 0 ? this.white : this.sheet;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - this.z));
    ctx.scale(this.facing * s, s);
    ctx.drawImage(img, this.frame * cell, row * cell, cell, cell, -anchor.x, -anchor.y, cell, cell);
    if (debug) {
      ctx.lineWidth = 1 / s;
      ctx.strokeStyle = '#0f0';
      ctx.strokeRect(-anchor.x, -anchor.y, cell, cell);
      ctx.fillStyle = '#f0f';
      ctx.fillRect(-0.5, -0.5, 1, 1);
    }
    ctx.restore();
  }
}
