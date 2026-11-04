// Small dust puffs (footsteps, attack impact).
export class Particles {
  constructor() { this.list = []; }

  burst(x, y, count, { vx = 0, spread = 40, size = 6 } = {}) {
    for (let i = 0; i < count; i++) {
      this.list.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 6,
        vx: vx + (Math.random() - 0.5) * spread,
        vy: -10 - Math.random() * 30,
        size: size * (0.6 + Math.random() * 0.6),
        life: 0,
        maxLife: 0.35 + Math.random() * 0.3,
      });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 4;
      p.vy *= 1 - dt * 3;
    }
    this.list = this.list.filter((p) => p.life < p.maxLife);
  }

  draw(ctx, filter) {
    for (const p of this.list) {
      if (!filter(p)) continue;
      const t = p.life / p.maxLife;
      ctx.fillStyle = `rgba(170,150,120,${0.45 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.7 + t * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
