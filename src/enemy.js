// The Saxon spearman.
//  - patrol: walks slowly between two points, stops a moment at each end
//  - chase: when the viking comes close, walks up to him and stops at
//    spear distance, facing him; if the viking runs far away, he gives up
//    and goes back to patrolling
// (Fighting comes next.)

const AI = {
  patrolSpeed: 70,  // px/s
  chaseSpeed: 110,
  pause: 1.2,       // s standing at each end of the patrol
  see: 380,         // starts chasing when the viking is this close (px)
  giveUp: 620,      // stops chasing beyond this
  stop: 130,        // keeps this far from the viking (spear reach)
  slack: 14,        // close enough to the spot: no need to shuffle around
};

export class Enemy {
  constructor(sheet, meta, scale, x, y, range) {
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
    this.state = 'patrol'; // 'patrol' | 'chase'
    this.anim = 'idle';
    this.frame = 0;
    this.time = 0;
    this.phase = 0.25;
    this.wait = AI.pause;
  }

  update(dt, target) {
    this.time += dt;
    const dist = Math.hypot(target.x - this.x, (target.y - this.y) * 1.6);
    if (this.state === 'patrol' && dist < AI.see) this.state = 'chase';
    else if (this.state === 'chase' && dist > AI.giveUp) {
      this.state = 'patrol';
      this.left = this.x - 90;
      this.right = this.x + 90;
      this.wait = AI.pause;
    }

    if (this.state === 'chase') this.chase(dt, target);
    else this.patrol(dt);
  }

  // walk to the spot beside the viking (on the side he's already on)
  chase(dt, target) {
    const side = this.x >= target.x ? 1 : -1;
    const gx = target.x + side * AI.stop, gy = target.y;
    const dx = gx - this.x, dy = gy - this.y;
    this.facing = -side; // always looks at the viking
    const far = Math.hypot(dx, dy);
    if (far < AI.slack) return this.stand();
    const step = Math.min(far, AI.chaseSpeed * dt);
    this.x += (dx / far) * step;
    this.y += (dy / far) * step;
    this.walk(step);
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
    const walk = this.meta.anims.walk;
    this.setAnim('walk');
    this.phase = (this.phase + distance / (walk.stride * this.scale)) % 1;
    this.frame = Math.round(this.phase * walk.frames) % walk.frames;
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
    const { cell, anchor } = this.meta;
    const row = this.meta.anims[this.anim].row;
    const s = this.scale;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - this.z));
    ctx.scale(this.facing * s, s);
    ctx.drawImage(this.sheet, this.frame * cell, row * cell, cell, cell, -anchor.x, -anchor.y, cell, cell);
    ctx.restore();
  }
}
