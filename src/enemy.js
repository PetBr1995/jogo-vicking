import { whiteCopy } from './white.js';
import { keepOnGround } from './stage.js';
import { FIRE } from './fire.js';

// The Saxon spearman.
//  - patrol: walks slowly between two points, stops a moment at each end
//  - chase: when the viking comes close, walks up to him and stops at
//    spear distance, facing him (he never backs off, so the viking can step
//    in and hit him); if the viking runs far away, he gives up and patrols
//  - attack: standing next to the viking, he pulls the spear back, holds
//    it a moment (the warning) and thrusts; then waits a bit before the
//    next one. Hitting him during the warning cancels the thrust.
//  - hit by the axe: flashes white, is knocked back, loses life; with no
//    life left he falls flat on his back, lies there a moment, then blinks
//    and disappears

const AI = {
  patrolSpeed: 70,  // px/s
  chaseSpeed: 115,
  pause: 1.2,       // s standing at each end of the patrol
  see: 380,         // starts chasing when the viking is this close (px)
  giveUp: 1100,     // stops chasing beyond this
  stop: 84,         // keeps this far from the viking
  slack: 14,        // close enough to the spot: no need to shuffle around
  reach: 105,       // nail/dagger reach (px in front of him)
  depth: 38,        // ...and how far up/down it still hits
  rest: [1.0, 1.8], // s between thrusts (random in this range)
  firstRest: 0.6,   // s before the first thrust after reaching the viking
};

const HURT = {
  life: 5,          // hits to defeat him
  stun: 0.35,       // s he can't move after a hit
  flash: 0.12,      // s drawn all white
  knockback: 340,   // px/s pushed away
  friction: 1400,   // px/s² slowing the push
  lie: 0.9,         // s lying on the ground after the fall
  vanish: 0.8,      // s blinking before he disappears
};

let nextEnemyId = 1;

export class Enemy {
  constructor(sheet, meta, scale, x, y, range) {
    this.id = nextEnemyId++;
    this.sheet = sheet;
    this.meta = meta;
    this.scale = scale;
    this.x = x;
    this.y = y;
    this.z = 0;
    this.left = x - range;
    this.right = x + range;
    this.dir = -1;      // patrol direction
    this.facing = -1;   // starts facing left (toward the viking)
    this.state = 'patrol'; // 'patrol' | 'chase' | 'attack'
    this.rest = AI.firstRest; // s until he may thrust
    this.onAttack = null;     // called on the frame the thrust lands
    this.onDown = null;       // called when he hits the ground
    this.anim = 'idle';
    this.frame = 0;
    this.time = 0;
    this.phase = 0.25;
    this.wait = AI.pause;
    this.white = whiteCopy(sheet);
    this.ember = whiteCopy(sheet, '#ff6a1a');
    this.burn = 0;      // s left on fire (Rune of Fire)
    this.burnTick = 0;  // s until the fire hurts him again
    this.onBurn = null; // called each time the fire hurts him
    this.life = HURT.life;
    this.stun = 0;      // s left unable to move after a hit
    this.flash = 0;     // s left drawn white
    this.push = 0;      // knockback speed (px/s, signed)
    this.dead = false;
    this.gone = false;  // finished blinking: remove him
    this.deadTime = 0;
  }

  get alive() { return !this.dead; }

  /** The axe hit him (taking `damage` life). Returns true if it counted. */
  hit(fromX, damage = 1) {
    if (this.dead) return false;
    const away = this.x >= fromX ? 1 : -1;
    this.life = Math.max(0, this.life - damage);
    this.flash = HURT.flash;
    this.stun = HURT.stun;
    this.push = away * HURT.knockback;
    this.facing = -away; // turns to face whoever hit him
    if (this.anim === 'hurt') this.time = 0; // a new hit restarts the flinch
    this.state = 'chase'; // (cancels a thrust in progress)
    this.rest = Math.max(this.rest, AI.firstRest);
    if (this.life <= 0) {
      this.dead = true;
      this.setAnim('fall');
      this.frame = 0;
      this.push *= 1.3; // the last blow throws him a bit further
      this.burn = Math.min(this.burn, 0.6); // the flames die down as he falls
    }
    return true;
  }

  /** Sets him on fire for `seconds` (hurts him every FIRE.burnTick). */
  ignite(seconds) {
    if (this.dead) return;
    if (this.burn <= 0) this.burnTick = FIRE.burnTick;
    this.burn = Math.max(this.burn, seconds);
  }

  // the fire hurts him: life and a short flash, but no push or stagger
  scorch(damage) {
    if (this.dead) return;
    this.life = Math.max(0, this.life - damage);
    this.flash = HURT.flash * 0.6;
    if (this.life <= 0) {
      this.dead = true;
      this.state = 'chase';
      this.setAnim('fall');
      this.frame = 0;
      this.burn = Math.min(this.burn, 0.6);
    }
  }

  update(dt, target, bounds, allies = []) {
    const px = this.x, py = this.y;
    this.step(dt, target, bounds, allies);
    // painted stage: stays on the ground (slides along edges)
    if (bounds?.walkable) {
      const blocked = keepOnGround(this, px, py, bounds.walkable);
      if (blocked.bx) this.push = 0;
    }
  }

  step(dt, target, bounds, allies) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);

    // on fire: loses life now and then until the flames go out
    if (this.burn > 0) {
      this.burn = Math.max(0, this.burn - dt);
      if (!this.dead && (this.burnTick -= dt) <= 0) {
        this.burnTick += FIRE.burnTick;
        this.scorch(FIRE.burnDamage);
        this.onBurn?.(this);
      }
    }

    // knockback slides him away, slowing down
    if (this.push) {
      this.x += this.push * dt;
      const slow = HURT.friction * dt;
      this.push = Math.abs(this.push) <= slow ? 0 : this.push - Math.sign(this.push) * slow;
    }
    if (bounds) {
      this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x));
      this.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.y));
    }

    if (this.dead) return this.updateFall(dt);
    if (this.stun > 0) {
      this.stun -= dt;
      return this.hurtPose();
    }

    if (this.state === 'attack') return this.updateAttack(dt);
    this.rest -= dt;

    const dist = Math.hypot(target.x - this.x, (target.y - this.y) * 1.6);
    if (this.state === 'patrol' && dist < AI.see) this.state = 'chase';
    else if (this.state === 'chase' && dist > AI.giveUp) {
      this.state = 'patrol';
      this.left = this.x - 90;
      this.right = this.x + 90;
      this.wait = AI.pause;
    }

    if (this.state === 'chase') this.chase(dt, target, bounds, allies);
    else this.patrol(dt);
  }

  // walk to the spot beside the viking (on the side he's already on); if
  // several Saxons are on the same side, they fan out slightly in depth and
  // distance so they don't stack on top of each other
  chase(dt, target, bounds, allies = []) {
    const side = this.x >= target.x ? 1 : -1;
    const sameSide = allies
      .filter((a) => a.alive && a.state !== 'patrol' && (a.x >= target.x ? 1 : -1) === side)
      .sort((a, b) => a.y - b.y || a.id - b.id);
    const idx = Math.max(0, sameSide.indexOf(this));
    const slot = sameSide.length > 1 ? idx - (sameSide.length - 1) / 2 : 0;
    const stopDist = AI.stop + (idx % 2) * 14;
    const gx = target.x + side * stopDist;
    const rawGy = target.y + slot * 22;
    const gy = bounds ? Math.max(bounds.minY, Math.min(bounds.maxY, rawGy)) : rawGy;
    const closer = Math.abs(target.x - this.x) < stopDist;
    const dx = closer ? 0 : gx - this.x, dy = gy - this.y;
    this.facing = -side; // always looks at the viking
    const far = Math.hypot(dx, dy);
    const inReach = Math.abs(target.x - this.x) < AI.reach && Math.abs(target.y - this.y) < AI.depth;
    if (inReach && this.rest <= 0 && target.alive !== false) return this.startAttack();
    if (far < AI.slack) return this.stand();
    const step = Math.min(far, AI.chaseSpeed * dt);
    this.x += (dx / far) * step;
    this.y += (dy / far) * step;
    this.walk(step);
  }

  startAttack() {
    this.state = 'attack';
    this.setAnim('attack');
    this.frame = 0;
  }

  updateAttack(dt) {
    const { durations, hitFrame, frames } = this.meta.anims.attack;
    while (this.time >= durations[this.frame]) {
      this.time -= durations[this.frame];
      this.frame++;
      if (this.frame === hitFrame) this.onAttack?.(this);
      if (this.frame >= frames) {
        this.state = 'chase';
        this.rest = AI.rest[0] + Math.random() * (AI.rest[1] - AI.rest[0]);
        return this.stand();
      }
    }
  }

  /** Is (x, y) inside the spear's reach right now? */
  reaches(x, y) {
    const ahead = (x - this.x) * this.facing;
    return ahead > 0 && ahead < AI.reach && Math.abs(y - this.y) < AI.depth;
  }

  patrol(dt) {
    if (this.wait > 0) {
      this.wait -= dt;
      return this.stand();
    }
    this.facing = this.dir;
    const step = AI.patrolSpeed * dt;
    this.x += this.dir * step;
    this.walk(step);
    if ((this.dir < 0 && this.x <= this.left) || (this.dir > 0 && this.x >= this.right)) {
      this.x = Math.max(this.left, Math.min(this.right, this.x));
      this.dir = -this.dir;
      this.wait = AI.pause;
    }
  }

  // legs advance by distance walked, like the viking (feet stay planted)
  walk(distance) {
    const moveName = this.state === 'chase' && this.meta.anims.run ? 'run' : 'walk';
    const move = this.meta.anims[moveName];
    this.setAnim(moveName);
    this.phase = (this.phase + distance / (move.stride * this.scale)) % 1;
    this.frame = Math.round(this.phase * move.frames) % move.frames;
  }

  // falls over (timed frames, the last one holds), lies, blinks, is gone
  updateFall(dt) {
    const { durations, frames } = this.meta.anims.fall;
    while (this.frame < frames - 1 && this.time >= durations[this.frame]) {
      this.time -= durations[this.frame];
      this.frame++;
      if (this.frame === frames - 1) this.onDown?.(this);
    }
    if (this.frame === frames - 1) {
      this.deadTime += dt;
      this.gone = this.deadTime >= HURT.lie + HURT.vanish;
    }
  }

  // staggered by a hit: the "hurt" frames if the art has them, otherwise
  // the first idle frame
  hurtPose() {
    const hurt = this.meta.anims.hurt;
    if (!hurt) {
      this.setAnim('idle');
      this.frame = 0;
      return;
    }
    if (this.anim !== 'hurt') { this.anim = 'hurt'; this.time = 0; }
    let t = this.time, f = 0;
    while (f < hurt.frames - 1 && t >= hurt.durations[f]) t -= hurt.durations[f++];
    this.frame = f;
  }

  stand() {
    if (this.anim !== 'idle') this.phase = 0.25;
    this.setAnim('idle');
    const idle = this.meta.anims.idle;
    this.frame = Math.floor(this.time * idle.fps) % idle.frames;
  }

  setAnim(name) {
    if (this.anim === name) return;
    this.anim = name;
    this.time = 0;
  }

  draw(ctx) {
    // defeated: after lying a moment, blinks faster and faster, then is gone
    const blink = this.deadTime - HURT.lie;
    if (this.dead && blink > 0 && Math.floor(blink * (8 + blink * 20)) % 2) return;
    const { cell, anchor } = this.meta;
    const row = this.meta.anims[this.anim].row;
    const s = this.scale;
    const img = this.flash > 0 ? this.white : this.sheet;
    const smooth = (this.meta.detail || 1) > 1;
    ctx.save();
    ctx.imageSmoothingEnabled = smooth;
    if (smooth) ctx.imageSmoothingQuality = 'high';
    ctx.translate(smooth ? this.x : Math.round(this.x), smooth ? this.y - this.z : Math.round(this.y - this.z));
    ctx.scale(this.facing * s, s);
    ctx.drawImage(img, this.frame * cell, row * cell, cell, cell, -anchor.x, -anchor.y, cell, cell);
    if (this.burn > 0 && this.flash <= 0) {
      // on fire: the body glows orange, flickering
      ctx.globalAlpha = (0.3 + 0.18 * Math.sin(performance.now() / 70)) * Math.min(1, this.burn / 0.5);
      ctx.drawImage(this.ember, this.frame * cell, row * cell, cell, cell, -anchor.x, -anchor.y, cell, cell);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  // life bar over his head (shown once he's been hit)
  drawLife(ctx) {
    if (this.life === HURT.life || this.dead) return;
    const w = 44, h = 6;
    const x = Math.round(this.x - w / 2), y = Math.round(this.y - 50 * this.scale * (this.meta.detail || 1));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#5a1a14';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e04a32';
    ctx.fillRect(x, y, Math.round((w * this.life) / HURT.life), h);
  }
}
