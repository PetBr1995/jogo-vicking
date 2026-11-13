// The axe thrown in berserker fury: it spins away, slows down, turns
// around and flies back to the viking wherever he is, hitting a Saxon on
// the way out and again on the way back. The picture is the "axe" frame of
// the viking's sheet, spun around its pivot.

export const AXE_THROW = {
  speed: 980,     // px/s leaving the hand
  range: 380,     // px before it turns around
  back: 1150,     // px/s top speed coming back
  spin: 22,       // turns (radians) per second
  height: 20,     // design px above the ground
  catch: 26,      // px from his hand to catch it
  reach: 12,      // design px around the axe that hit
  depth: 14,      // design px up/down that still counts as the same line
};

export class ThrownAxe {
  /** @param p the viking (Player) */
  constructor(p, unit) {
    this.unit = unit;
    this.dir = p.facing;
    this.x = p.x + p.facing * 16 * unit;
    this.y = p.y;
    this.z = AXE_THROW.height * unit + p.z;
    this.v = AXE_THROW.speed;
    this.decel = AXE_THROW.speed ** 2 / (2 * AXE_THROW.range); // stops after `range`
    this.going = true;  // false once it turned around
    this.angle = 0;
    this.trail = [];    // last positions, for the motion blur
    this.hitOut = new Set(); // Saxons hit going out / coming back (once each)
    this.hitBack = new Set();
    this.caught = false;
  }

  /** Moves it; returns true when the viking catches it. */
  update(dt, p) {
    this.trail.unshift({ x: this.x, y: this.y, z: this.z, angle: this.angle });
    this.trail.length = Math.min(this.trail.length, 3);
    this.angle += AXE_THROW.spin * dt * this.dir;

    if (this.going) {
      this.x += this.dir * this.v * dt;
      this.v -= this.decel * dt;
      if (this.v <= 0) { this.going = false; this.v = 0; }
      return false;
    }
    // coming back: homes in on his hand, speeding up
    const tx = p.x, ty = p.y, tz = AXE_THROW.height * this.unit + p.z;
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz);
    this.v = Math.min(AXE_THROW.back, this.v + 2600 * dt);
    if (d < AXE_THROW.catch || d < this.v * dt) { this.caught = true; return true; }
    const step = this.v * dt;
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.z += (dz / d) * step;
    return false;
  }

  /** Which way it's moving sideways (for knockback). */
  get heading() {
    const prev = this.trail[0];
    return prev ? Math.sign(this.x - prev.x) || this.dir : this.dir;
  }

  /** Does it touch this Saxon now (and hasn't hit him on this pass yet)? */
  hits(e) {
    if (e.dead) return false;
    const hitSet = this.going ? this.hitOut : this.hitBack;
    if (hitSet.has(e)) return false;
    const u = this.unit;
    if (Math.abs(e.x - this.x) > AXE_THROW.reach * u || Math.abs(e.y - this.y) > AXE_THROW.depth * u) return false;
    hitSet.add(e);
    return true;
  }

  draw(ctx, sheet, meta, scale, furious, furyAxeImg) {
    const a = meta.anims.axe, cell = meta.cell;
    const piv = a.pivot;
    const smooth = (meta.detail || 1) > 1;
    const drawOne = (x, y, z, angle, alpha) => {
      ctx.save();
      ctx.imageSmoothingEnabled = smooth;
      if (smooth) ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = alpha;
      ctx.translate(smooth ? x : Math.round(x), smooth ? y - z : Math.round(y - z));
      ctx.rotate(angle);
      ctx.scale(this.dir * scale, scale);
      if (furious && furyAxeImg) { ctx.drawImage(furyAxeImg, 0, 0, cell, cell, -piv.x, -piv.y, cell, cell); } else { ctx.drawImage(sheet, 0, a.row * cell, cell, cell, -piv.x, -piv.y, cell, cell); }
      ctx.restore();
    };
    // fury glow around the spinning axe
    if (furious) {
      const r = 14 * this.unit, cy = this.y - this.z;
      const g = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, r);
      g.addColorStop(0, 'rgba(255,140,40,0.45)');
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.x - r, cy - r, r * 2, r * 2);
    }
    this.trail.forEach((t, i) => drawOne(t.x, t.y, t.z, t.angle, 0.28 - i * 0.08));
    drawOne(this.x, this.y, this.z, this.angle, 1);
    ctx.imageSmoothingEnabled = false;
  }
}
