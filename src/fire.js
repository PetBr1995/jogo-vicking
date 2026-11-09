// Fire, from the Rune of Fire.
//  - FireWave: the viking strikes the ground and a line of flames races
//    forward along it, passing through every Saxon in its path; each one it
//    touches takes a hit and catches fire (see Enemy.ignite)
//  - drawFlame / drawBodyFlames: pixel-art flames, used by the wave, by a
//    burning Saxon and by the viking while he casts it
// Everything is drawn in whole pixels (UNIT) to match the pixel art.

export const FIRE = {
  speed: 620,       // px/s the front of the wave runs along the ground
  range: 600,       // px before it stops
  spacing: 7,       // design px between two flames of the wave
  flameLife: 0.55,  // s each flame of the wave burns
  damage: 1,        // hit when the wave touches a Saxon
  reach: 12,        // design px around the front that still touches
  depth: 16,        // design px up/down that still counts as the same line
  burn: 3,          // s a Saxon keeps burning
  burnTick: 1,      // s between burn damage
  burnDamage: 1,    // life lost on each burn tick
  charges: 3,       // fire waves the Rune of Fire gives
};

const RED = '#d8321a', ORANGE = '#ff8a1e', YELLOW = '#ffd84a', WHITE = '#fff4c8';

/**
 * One flame standing on (x, y): `h` and `w` in design px, `t` makes it
 * sway. Three layers: red outside, orange, yellow core (white at the base).
 */
export function drawFlame(ctx, x, y, h, w, u, t = 0) {
  if (h < 1) return;
  const cx = Math.round(x / u), base = Math.round(y / u) * u;
  const layers = [[RED, 1, 1], [ORANGE, 0.7, 0.78], [YELLOW, 0.4, 0.5], [WHITE, 0.18, 0.2]];
  for (const [color, ws, hs] of layers) {
    const lh = Math.max(1, Math.round(h * hs));
    ctx.fillStyle = color;
    for (let r = 0; r < lh; r++) {
      const k = r / lh;
      const rw = Math.max(1, Math.round(w * ws * (1 - k * k)));
      const sway = Math.round(Math.sin(t * 13 + r * 0.9) * k * 1.6);
      ctx.fillRect((cx + sway - Math.floor(rw / 2)) * u, base - (r + 1) * u, rw * u, u);
    }
  }
}

// spots over a body (design px from the feet: x, y, flame height)
const SPOTS = [[-7, -2, 8], [6, -8, 9], [-4, -17, 10], [5, -25, 9], [-6, -33, 8], [3, -40, 9], [-1, -47, 7], [0, -12, 11]];

/** Flames all over a body standing at (x, y); `level` 0..1 fades them. */
export function drawBodyFlames(ctx, x, y, u, level, facing = 1, t = performance.now() / 1000) {
  if (level <= 0) return;
  ctx.save();
  // warm glow around the body
  const cy = y - 24 * u, r = 30 * u;
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  g.addColorStop(0, `rgba(255,130,40,${0.35 * level})`);
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, cy - r, r * 2, r * 2);
  ctx.globalAlpha = 0.85 * level;
  SPOTS.forEach(([dx, dy, h], i) => {
    const flick = 0.65 + 0.35 * Math.sin(t * 11 + i * 1.7);
    drawFlame(ctx, x + dx * facing * u, y + dy * u, h * flick * level, 5, u, t + i);
  });
  ctx.restore();
}

export class FireWave {
  constructor(x, y, dir, unit) {
    Object.assign(this, { x, y, dir, unit, travelled: 0, moving: true, flames: [], hit: new Set(), gap: 0 });
  }

  get done() { return !this.moving && this.flames.length === 0; }

  update(dt) {
    const u = this.unit;
    if (this.moving) {
      const step = FIRE.speed * dt;
      this.x += this.dir * step;
      this.travelled += step;
      this.gap -= step;
      if (this.gap <= 0) {
        this.gap += FIRE.spacing * u;
        this.flames.push({
          x: this.x + (Math.random() - 0.5) * 4 * u,
          y: this.y + (Math.random() - 0.5) * 6 * u,
          age: 0,
          life: FIRE.flameLife * (0.8 + Math.random() * 0.4),
          h: 15 + Math.random() * 9,
          w: 8 + Math.random() * 3,
          seed: Math.random() * 10,
        });
      }
      if (this.travelled >= FIRE.range) this.moving = false;
    }
    for (const f of this.flames) f.age += dt;
    this.flames = this.flames.filter((f) => f.age < f.life);
  }

  /** Does the front of the wave touch this Saxon now (once per Saxon)? */
  hits(e) {
    if (!this.moving || e.dead || this.hit.has(e)) return false;
    const u = this.unit;
    if (Math.abs(e.x - this.x) > FIRE.reach * u || Math.abs(e.y - this.y) > FIRE.depth * u) return false;
    this.hit.add(e);
    return true;
  }

  draw(ctx) {
    const u = this.unit, t = performance.now() / 1000;
    ctx.save();
    // glow at the running front
    if (this.moving) {
      const cy = this.y - 8 * u, r = 22 * u;
      const g = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, r);
      g.addColorStop(0, 'rgba(255,170,60,0.55)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.x - r, cy - r, r * 2, r * 2);
    }
    // back to front, so the nearer flames cover the farther ones
    for (const f of [...this.flames].sort((a, b) => a.y - b.y)) {
      const k = f.age / f.life;
      const grow = Math.min(1, k / 0.18);
      const fade = 1 - Math.max(0, (k - 0.45) / 0.55);
      // scorched ground under it
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = 'rgba(40,14,6,0.6)';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, f.w * 0.7 * u, 1.6 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, fade * 1.4);
      drawFlame(ctx, f.x, f.y, f.h * grow * (0.35 + 0.65 * fade), f.w, u, t + f.seed);
    }
    ctx.restore();
  }
}
