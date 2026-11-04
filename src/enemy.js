// The Saxon spearman. For now he only patrols: walks slowly between two
// points, stops a moment at each end, and faces the way he walks. (Chasing
// and fighting come next.)

const PATROL = {
  speed: 70,   // px/s
  pause: 1.2,  // s standing at each end
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
    this.dir = -1;      // walking direction
    this.facing = -1;   // starts facing left (toward the viking)
    this.anim = 'idle';
    this.frame = 0;
    this.time = 0;
    this.phase = 0.25;
    this.wait = PATROL.pause;
  }

  update(dt) {
    this.time += dt;
    if (this.wait > 0) {
      this.wait -= dt;
      this.setAnim('idle');
      const idle = this.meta.anims.idle;
      this.frame = Math.floor(this.time * idle.fps) % idle.frames;
      return;
    }
    const walk = this.meta.anims.walk;
    this.setAnim('walk');
    this.facing = this.dir;
    this.x += this.dir * PATROL.speed * dt;
    this.phase = (this.phase + (PATROL.speed * dt) / (walk.stride * this.scale)) % 1;
    this.frame = Math.round(this.phase * walk.frames) % walk.frames;
    if ((this.dir < 0 && this.x <= this.left) || (this.dir > 0 && this.x >= this.right)) {
      this.x = Math.max(this.left, Math.min(this.right, this.x));
      this.dir = -this.dir;
      this.wait = PATROL.pause;
      this.phase = 0.25;
    }
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
