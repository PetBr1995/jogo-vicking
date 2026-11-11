// Lightning power from the Rune of Thunder.
// Extracted from docs/arte/sheet-lightning-bolt.png:
// - Stage 1 (Frames 0 to 5):  Charge & Launch at the Viking's hand/axe.
// - Stage 2 (Frames 6 to 14): High-speed piercing lightning spear flying forward.
// - Stage 3 (Frames 15 to 28): Massive radial starburst nova detonation, shockwaves & dissipating smoke.

export const BOLT = {
  speed: 1050,    // px/s
  range: 620,     // px distance travelled before detonation
  height: 12,     // design px acima do chão (12 * 4 = 48px: perfeitamente centralizado no corpo/peito do Viking)
  length: 28,     // design px long
  damage: 2,
  depth: 18,      // design px up/down that still counts as the same line
};

const CORE = '#ffffff';

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
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.unit = unit;
    this.stage = 'cast'; // 'cast' (0..5), 'flight' (6..14), 'impact' (15..28)
    this.frame = 0;
    this.animTime = 0;
    this.travelled = 0;
    this.dead = false;
    this.onImpact = null;
  }

  get z() {
    return BOLT.height * this.unit;
  }

  triggerImpact() {
    if (this.stage === 'impact') return;
    this.stage = 'impact';
    this.frame = 15;
    this.animTime = 0;
    if (this.onImpact) this.onImpact(this);
  }

  update(dt) {
    if (this.dead) return;

    this.animTime += dt;

    if (this.stage === 'cast') {
      const d = 0.035; // Fast launch formation (frames 0 to 5: ~0.21s)
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame++;
        if (this.frame >= 6) {
          this.stage = 'flight';
          this.frame = 6;
        }
      }
    } else if (this.stage === 'flight') {
      const step = BOLT.speed * dt;
      this.x += this.dir * step;
      this.travelled += step;

      const d = 0.04;
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame++;
        if (this.frame > 14) {
          // Loop through active lightning spear surge frames while traveling
          this.frame = 9;
        }
      }

      if (this.travelled >= BOLT.range) {
        this.triggerImpact();
      }
    } else if (this.stage === 'impact') {
      const d = 0.045; // Explosion, starburst nova, shockwave & dissipating smoke
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame++;
        if (this.frame >= 29) {
          this.dead = true;
        }
      }
    }
  }

  /** Did it reach an enemy */
  hits(e) {
    if (this.dead || this.stage === 'impact' || e.dead) return false;
    const u = this.unit;
    const ahead = (e.x - this.x) * this.dir;
    return (
      Math.abs(e.y - this.y) < BOLT.depth * u &&
      ahead < 24 * u &&
      ahead > -BOLT.length * u
    );
  }

  draw(ctx) {
    if (this.dead) return;
    const u = this.unit;
    const cy = this.y - this.z;

    if (boltSheet && boltMeta) {
      const { cell, anchor, cols } = boltMeta;
      // Proporção ideal com o Viking
      const s = (u / 3.0) * 1.05;

      const col = this.frame % cols;
      const row = Math.floor(this.frame / cols);
      const sx = col * cell;
      const sy = row * cell;

      ctx.save();
      ctx.translate(this.x, cy);
      ctx.scale(this.dir * s, s);

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
      // Fallback
      const head = this.x;
      ctx.save();
      const g = ctx.createRadialGradient(head, cy, 0, head, cy, 16 * u);
      g.addColorStop(0, 'rgba(120,220,255,0.6)');
      g.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(head - 16 * u, cy - 16 * u, 32 * u, 32 * u);
      ctx.fillStyle = CORE;
      ctx.fillRect(head - 4 * u, cy - 3 * u, 8 * u, 6 * u);
      ctx.restore();
    }
  }
}

// Retained for future use
export class ImpactBurst {
  constructor(x, y, unit) {
    this.x = x;
    this.y = y;
    this.unit = unit;
    this.dead = false;
    this.frame = 15;
    this.animTime = 0;
  }
  get done() { return this.dead; }
  update(dt) {
    this.animTime += dt;
    if (this.animTime >= 0.045) {
      this.animTime -= 0.045;
      this.frame++;
      if (this.frame >= 29) this.dead = true;
    }
  }
  draw(ctx) {
    if (this.dead || !boltSheet || !boltMeta) return;
    const { cell, anchor, cols } = boltMeta;
    const s = (this.unit / 3.0) * 1.05;
    const col = this.frame % cols;
    const row = Math.floor(this.frame / cols);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);
    ctx.drawImage(boltSheet, col * cell, row * cell, cell, cell, -anchor.x, -anchor.y, cell, cell);
    ctx.restore();
  }
}

export class SkyStrike {
  constructor(x, y, unit) {
    this.x = x;
    this.y = y;
    this.unit = unit;
    this.dead = false;
    this.frame = 0;
    this.animTime = 0;
  }
  get done() { return this.dead; }
  update(dt) {
    if (this.dead) return;
    this.animTime += dt;
    if (strikeMeta?.anims?.strike) {
      const anim = strikeMeta.anims.strike;
      const d = anim.durations?.[this.frame] || 0.045;
      if (this.animTime >= d) {
        this.animTime -= d;
        this.frame++;
        if (this.frame >= strikeMeta.totalFrames) {
          this.dead = true;
        }
      }
    } else {
      if (this.animTime > 0.8) this.dead = true;
    }
  }
  draw(ctx) {
    if (this.dead || !strikeSheet || !strikeMeta) return;
    const { cellW, cellH, anchor, cols } = strikeMeta;
    // Escala equilibrada com o Saxon/Viking
    const s = (this.unit / 3.0) * 1.35;
    const groundDrawY = this.y;
    const topDrawY = groundDrawY - anchor.y * s;

    // Conexão contínua com o topo do céu durante a queda do raio (frames 1 a 10)
    if (this.frame >= 1 && this.frame <= 10 && topDrawY > 0) {
      const beamW = (this.frame <= 2 ? 6 : this.frame <= 4 ? 14 : 22) * s;
      ctx.save();
      // Aura de energia ciano
      ctx.fillStyle = 'rgba(110,225,255,0.45)';
      ctx.fillRect(this.x - beamW * 1.5, 0, beamW * 3.0, topDrawY + 2);
      // Pilar elétrico azul
      ctx.fillStyle = '#62deff';
      ctx.fillRect(this.x - beamW * 0.75, 0, beamW * 1.5, topDrawY + 2);
      // Núcleo branco incandescente
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x - beamW * 0.35, 0, beamW * 0.7, topDrawY + 2);
      ctx.restore();
    }

    const col = this.frame % cols;
    const row = Math.floor(this.frame / cols);
    const sx = col * cellW;
    const sy = row * cellH;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);
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
  }
}

export function drawBodyArcs(ctx, x, y, u, level) {
  if (level <= 0) return;
  ctx.save();
  const cy = y - 24 * u, r = 32 * u;
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  g.addColorStop(0, `rgba(120,220,255,${0.4 * level})`);
  g.addColorStop(1, 'rgba(80,180,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, cy - r, r * 2, r * 2);
  ctx.restore();
}
