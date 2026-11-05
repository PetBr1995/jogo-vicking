// Lightning, from the Rune of Thunder.
//  - Bolt: thrown forward by the viking, flies at chest height in a
//    crackling zig-zag until it hits a Saxon or goes too far
//  - SkyStrike: where a bolt hits, lightning falls from the sky onto the
//    target for an instant
// Both are drawn in whole pixels (UNIT) to match the pixel art.

export const BOLT = {
  speed: 950,     // px/s
  range: 760,     // px before it fades out
  height: 20,     // design px above the ground (chest height)
  length: 18,     // design px long
  damage: 2,
  depth: 14,      // design px up/down that still counts as the same line
};

const BLUE = '#4cc8ff', CORE = '#ffffff', PALE = '#bff4ff';

// a jagged line from (x1,y1) to (x2,y2), drawn as UNIT-sized squares
function zigzag(ctx, x1, y1, x2, y2, u, wobble, color, thick) {
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / (4 * u)));
  let px = x1, py = y1;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i === n ? 0 : (Math.random() - 0.5) * 2 * wobble;
    // offset perpendicular to the line
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const qx = x1 + (x2 - x1) * t + nx * j, qy = y1 + (y2 - y1) * t + ny * j;
    const steps = Math.ceil(Math.hypot(qx - px, qy - py) / u);
    for (let k = 0; k <= steps; k++) {
      const x = Math.floor((px + ((qx - px) * k) / steps) / u) * u, y = Math.floor((py + ((qy - py) * k) / steps) / u) * u;
      ctx.fillStyle = color;
      ctx.fillRect(x - (thick - 1) * u / 2, y - (thick - 1) * u / 2, thick * u, thick * u);
    }
    px = qx; py = qy;
  }
}

export class Bolt {
  constructor(x, y, dir, unit) {
    Object.assign(this, { x, y, dir, unit, travelled: 0, dead: false, t: 0 });
  }

  get z() { return BOLT.height * this.unit; }

  update(dt) {
    const step = BOLT.speed * dt;
    this.x += this.dir * step;
    this.travelled += step;
    this.t += dt;
    if (this.travelled > BOLT.range) this.dead = true;
  }

  /** Did it reach this Saxon (same line, just passed his body)? */
  hits(e) {
    if (this.dead || e.dead) return false;
    const u = this.unit;
    const ahead = (e.x - this.x) * this.dir;
    return Math.abs(e.y - this.y) < BOLT.depth * u && ahead < 6 * u && ahead > -BOLT.length * u;
  }

  draw(ctx) {
    const u = this.unit, y = this.y - this.z;
    const head = this.x, tail = this.x - this.dir * BOLT.length * u;
    const fade = Math.min(1, (BOLT.range - this.travelled) / 120);
    ctx.save();
    ctx.globalAlpha = fade;
    // soft glow
    const g = ctx.createRadialGradient(head, y, 0, head, y, 14 * u);
    g.addColorStop(0, 'rgba(120,220,255,0.55)');
    g.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(head - 14 * u, y - 14 * u, 28 * u, 28 * u);
    // crackling body: blue outside, white core, a couple of branches
    zigzag(ctx, tail, y, head, y, u, 3 * u, BLUE, 3);
    zigzag(ctx, tail, y, head, y, u, 2 * u, CORE, 1);
    for (let b = 0; b < 2; b++) {
      const bx = tail + (head - tail) * (0.3 + Math.random() * 0.5);
      zigzag(ctx, bx, y, bx - this.dir * (3 + Math.random() * 4) * u, y + (Math.random() - 0.5) * 10 * u, u, u, PALE, 1);
    }
    // bright ball at the front
    ctx.fillStyle = CORE;
    ctx.fillRect(Math.floor(head / u) * u - u, Math.floor(y / u) * u - u, 3 * u, 3 * u);
    ctx.restore();
  }
}

// lightning falling from the top of the screen onto (x, y - height)
export class SkyStrike {
  constructor(x, y, unit) { Object.assign(this, { x, y, unit, t: 0 }); }
  get done() { return this.t > 0.28; }
  update(dt) { this.t += dt; }
  draw(ctx) {
    const u = this.unit, a = 1 - this.t / 0.28;
    const bottom = this.y - 2 * u;
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(this.x, bottom, 0, this.x, bottom, 24 * u);
    g.addColorStop(0, 'rgba(160,230,255,0.6)');
    g.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 24 * u, bottom - 24 * u, 48 * u, 48 * u);
    zigzag(ctx, this.x + 8 * u, 0, this.x, bottom, u, 6 * u, BLUE, 4);
    zigzag(ctx, this.x + 8 * u, 0, this.x, bottom, u, 4 * u, CORE, 2);
    ctx.restore();
  }
}
