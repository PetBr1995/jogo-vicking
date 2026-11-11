// Magic orbs shot by the enemy casters (mago, fada). They fly straight
// along the ground line they were cast from, at the height of the caster's
// hands; the viking is hit if he is close in depth and at that height (a
// jump over a low orb dodges it).

const KINDS = {
  arcane: { speed: 330, radius: 13, life: 2.4, core: '#f4e8ff', mid: '#b98cff', edge: '#5a38c8', glow: '180,130,255' },
  spark: { speed: 430, radius: 8, life: 1.8, core: '#fff6c8', mid: '#ffd24a', edge: '#e08a1a', glow: '255,205,80' },
};

export class Orb {
  constructor(x, y, height, dir, kind, unit) {
    this.k = KINDS[kind] || KINDS.arcane;
    this.x = x;
    this.y = y;          // ground line
    this.h = height;     // px above the ground
    this.dir = dir;
    this.unit = unit;
    this.age = 0;
    this.dead = false;
    this.trail = [];
  }

  update(dt) {
    this.age += dt;
    this.trail.push({ x: this.x, a: 1 });
    if (this.trail.length > 7) this.trail.shift();
    this.x += this.dir * this.k.speed * dt;
    for (const t of this.trail) t.a -= dt * 4.5;
    if (this.age > this.k.life) this.dead = true;
  }

  /** Did it reach the viking (a Player: x, y, z)? */
  hits(p) {
    if (this.dead || p.dead) return false;
    return Math.abs(this.x - p.x) < 26 && Math.abs(this.y - p.y) < 34 && Math.abs(this.h - (p.z + 46)) < 52;
  }

  draw(ctx) {
    const { radius: r, core, mid, edge, glow } = this.k;
    const y = this.y - this.h;
    ctx.save();
    for (const t of this.trail) { // fading tail
      if (t.a <= 0) continue;
      ctx.globalAlpha = Math.min(1, t.a) * 0.45;
      ctx.fillStyle = mid;
      ctx.beginPath();
      ctx.arc(t.x, y, r * (0.4 + 0.5 * t.a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const pulse = 1 + 0.12 * Math.sin(this.age * 30);
    const g = ctx.createRadialGradient(this.x, y, 0, this.x, y, r * 3 * pulse);
    g.addColorStop(0, `rgba(${glow},0.55)`);
    g.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.fillStyle = edge;
    ctx.beginPath(); ctx.arc(this.x, y, r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mid;
    ctx.beginPath(); ctx.arc(this.x, y, r * 0.72 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(this.x - r * 0.12, y - r * 0.12, r * 0.38 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
