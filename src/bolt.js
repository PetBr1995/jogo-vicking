// Lightning, from the Rune of Thunder.
//  - Bolt: horizontal lightning projectile thrown by the viking, flies
//    forward until it hits an enemy or reaches maximum range.
//  - SkyStrike: vertical lightning strike falling from the top of the sky
//    crashing onto an enemy ONLY when hit.
//  - ImpactBurst: radial electric explosion on hit.

export const BOLT = {
  speed: 980,     // px/s
  range: 820,     // px before it fades out
  height: 22,     // design px above the ground (chest height)
  length: 24,     // design px long
  damage: 2,
  depth: 16,      // design px up/down that still counts as the same line
};

const BLUE = '#4cc8ff', CORE = '#ffffff', PALE = '#bff4ff';

let boltSheet = null, boltMeta = null;
let strikeSheet = null, strikeMeta = null;

export function setBoltAssets(sheet, meta) {
  boltSheet = sheet;
  boltMeta = meta;
}

export function setStrikeAssets(sheet, meta) {
  strikeSheet = sheet;
  strikeMeta = meta;
}

export class Bolt {
  constructor(x, y, dir, unit) {
    Object.assign(this, {
      x,
      y,
      dir,
      unit,
      travelled: 0,
      dead: false,
      t: 0,
      frame: 0,
      animTime: 0,
    });
  }

  get z() {
    return BOLT.height * this.unit;
  }

  update(dt) {
    const step = BOLT.speed * dt;
    this.x += this.dir * step;
    this.travelled += step;
    this.t += dt;
    this.animTime += dt;

    if (boltMeta?.anims?.flight) {
      const anim = boltMeta.anims.flight;
      const d = anim.durations[this.frame] || 0.06;
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame = (this.frame + 1) % anim.frames;
      }
    }

    if (this.travelled > BOLT.range) this.dead = true;
  }

  /** Did it reach this Saxon (same line, just passed his body)? */
  hits(e) {
    if (this.dead || e.dead) return false;
    const u = this.unit;
    const ahead = (e.x - this.x) * this.dir;
    return (
      Math.abs(e.y - this.y) < BOLT.depth * u &&
      ahead < 12 * u &&
      ahead > -BOLT.length * u
    );
  }

  draw(ctx) {
    const u = this.unit,
      cy = this.y - this.z;
    const fade = Math.min(1, (BOLT.range - this.travelled) / 100);

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, fade);

    if (boltSheet && boltMeta) {
      const { cell, anchor } = boltMeta;
      const s = (u / 3.0) * 0.95;

      ctx.save();
      ctx.translate(this.x, cy);
      ctx.scale(this.dir * s, s);

      // Soft ambient electric glow
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 48);
      g.addColorStop(0, 'rgba(120,230,255,0.45)');
      g.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-48, -48, 96, 96);

      // Flying lightning sprite frame
      const sx = this.frame * cell;
      const sy = (boltMeta.anims.flight.row || 0) * cell;
      ctx.drawImage(
        boltSheet,
        sx,
        sy,
        cell,
        cell,
        -anchor.x,
        -anchor.y,
        cell,
        cell
      );
      ctx.restore();
    } else {
      // Fallback procedural glow
      const head = this.x;
      const g = ctx.createRadialGradient(head, cy, 0, head, cy, 14 * u);
      g.addColorStop(0, 'rgba(120,220,255,0.55)');
      g.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(head - 14 * u, cy - 14 * u, 28 * u, 28 * u);
      ctx.fillStyle = CORE;
      ctx.fillRect(head - 3 * u, cy - 2 * u, 6 * u, 4 * u);
    }

    ctx.restore();
  }
}

// Explosive electric impact burst when a bolt or thunder strike impacts
export class ImpactBurst {
  constructor(x, y, unit) {
    Object.assign(this, {
      x,
      y,
      unit,
      t: 0,
      frame: 0,
      animTime: 0,
      dead: false,
    });
  }

  get done() {
    return this.dead;
  }

  update(dt) {
    this.t += dt;
    this.animTime += dt;
    if (boltMeta?.anims?.impact) {
      const anim = boltMeta.anims.impact;
      const d = anim.durations[this.frame] || 0.055;
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame++;
        if (this.frame >= anim.frames) this.dead = true;
      }
    } else {
      if (this.t > 0.3) this.dead = true;
    }
  }

  draw(ctx) {
    if (this.dead) return;
    if (boltSheet && boltMeta) {
      const cell = boltMeta.cell;
      const s = (this.unit / 3.0) * 1.1;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      const sx = this.frame * cell;
      const sy = (boltMeta.anims.impact.row || 1) * cell;
      ctx.drawImage(
        boltSheet,
        sx,
        sy,
        cell,
        cell,
        -boltMeta.anchor.x,
        -boltMeta.anchor.y,
        cell,
        cell
      );
      ctx.restore();
    }
  }
}

// Vertical lightning falling from the top of the sky crashing onto (x, y)
export class SkyStrike {
  constructor(x, y, unit) {
    Object.assign(this, {
      x,
      y,
      unit,
      t: 0,
      frame: 0,
      animTime: 0,
      dead: false,
    });
  }

  get done() {
    return this.dead;
  }

  update(dt) {
    this.t += dt;
    this.animTime += dt;
    if (strikeMeta?.anims?.strike) {
      const anim = strikeMeta.anims.strike;
      const d = anim.durations[this.frame] || 0.05;
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame++;
        if (this.frame >= anim.frames) {
          this.dead = true;
        }
      }
    } else {
      if (this.t > 0.35) this.dead = true;
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const u = this.unit;

    if (strikeSheet && strikeMeta) {
      const { cellW, cellH, anchor } = strikeMeta;
      const s = (u / 3.0) * 1.45;
      const groundDrawY = this.y;
      const topDrawY = groundDrawY - anchor.y * s;

      ctx.save();

      // In early strike frames (frames 0 to 4), ensure the lightning beam
      // extends straight up into the infinite sky above the viewport!
      if (this.frame <= 4 && topDrawY > 0) {
        const beamW = (this.frame <= 1 ? 5 : this.frame <= 2 ? 10 : 18) * s;
        ctx.save();
        // Cyan lightning glow
        ctx.fillStyle = 'rgba(110,225,255,0.45)';
        ctx.fillRect(this.x - beamW * 1.6, 0, beamW * 3.2, topDrawY + 4);
        // Blue electric pillar
        ctx.fillStyle = '#62deff';
        ctx.fillRect(this.x - beamW * 0.75, 0, beamW * 1.5, topDrawY + 4);
        // White core
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.x - beamW * 0.35, 0, beamW * 0.7, topDrawY + 4);
        ctx.restore();
      }

      // Draw the animated lightning strike sprite anchored at the ground!
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      const sx = this.frame * cellW;
      const sy = 0;
      ctx.drawImage(
        strikeSheet,
        sx,
        sy,
        cellW,
        cellH,
        -anchor.x,
        -anchor.y,
        cellW,
        cellH
      );
      ctx.restore();
    } else {
      // Fallback
      const a = 1 - this.t / 0.3;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#62deff';
      ctx.fillRect(this.x - 4 * u, 0, 8 * u, this.y);
      ctx.fillStyle = CORE;
      ctx.fillRect(this.x - 2 * u, 0, 4 * u, this.y);
      ctx.restore();
    }
  }
}

/**
 * Electricity crawling all over a body standing at (x, y): a blue glow and
 * a few short arcs jumping between random points of the body, new ones
 * every frame. `level` 0..1 fades it.
 */
export function drawBodyArcs(ctx, x, y, u, level) {
  if (level <= 0) return;
  ctx.save();
  const cy = y - 24 * u,
    r = 32 * u;
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  g.addColorStop(0, `rgba(120,220,255,${0.4 * level})`);
  g.addColorStop(1, 'rgba(80,180,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, cy - r, r * 2, r * 2);
  ctx.restore();
}
