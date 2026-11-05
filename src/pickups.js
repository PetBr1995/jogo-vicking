// Things the viking picks up from the ground by walking over them:
//  - meat: a roasted leg that gives back life
//  - rune: the Rune of Fury, a stone with a glowing rune; picking it up
//    sends the viking into a berserker fury for a while (see player.js)
//  - thunder: the Rune of Thunder, a stone with a blue rune; gives
//    lightning bolts the viking can throw (see bolt.js)
//
// The pictures are tiny pixel-art grids (one letter = one pixel, '.' =
// empty), outlined automatically and drawn at the same pixel size as the
// characters. They float gently above their shadow and shine.

export const PICKUP = {
  meatLife: 3,     // life the meat gives back
  thunderCharges: 3, // bolts the Rune of Thunder gives
  dropChance: 0.4, // chance a defeated Saxon drops a meat
  reach: { x: 16, y: 10 }, // how close (design px) the viking must walk
};

const ART = {
  meat: {
    palette: { M: '#a8502c', m: '#d47c48', d: '#7a3418', W: '#f2e8d2', w: '#c9bc9c' },
    grid: [
      '.........WW.',
      '........WwwW',
      '.......WWwW.',
      '...MMMMWW...',
      '..MmmMMd....',
      '.MmmMMMMd...',
      '.MmMMMMMd...',
      '.MMMMMMdd...',
      '..MMMMdd....',
      '...dddd.....',
    ],
  },
  rune: {
    palette: { S: '#8a8c96', s: '#6a6c76', l: '#a8aab4', R: '#ffb848', r: '#ff7a2a' },
    grid: [
      '..llll..',
      '.lSSSSs.',
      'lSSRSSSs',
      'lSSRrSSs',
      'lSSRSrSs',
      'lSSRSSrs',
      'lSSRSSSs',
      'lSSRSSSs',
      'SSSSSSSs',
      'sssssssS',
    ],
  },
};
ART.thunder = {
  palette: { S: '#7e8698', s: '#5e6678', l: '#a2aabc', R: '#bff4ff', r: '#4cc8ff' },
  grid: [
    '..llll..',
    '.lSSSSs.',
    'lSSSRSSs',
    'lSSRrSSs',
    'lSRrSSSs',
    'lSRRRRSs',
    'lSSSrRSs',
    'lSSrRSSs',
    'SSSRrSSs',
    'sssssssS',
  ],
};
const OUTLINE = '#1b1218';

// paints a grid into a small canvas, with a dark outline around it
function sprite({ palette, grid }) {
  const w = grid[0].length + 2, h = grid.length + 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const solid = (x, y) => grid[y - 1]?.[x - 1] && grid[y - 1][x - 1] !== '.';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) g.fillStyle = palette[grid[y - 1][x - 1]];
      else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) g.fillStyle = OUTLINE;
      else continue;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

let sprites;

export class Pickup {
  /** @param kind 'meat' | 'rune'; x, y on the ground (world px) */
  constructor(kind, x, y, unit) {
    sprites ??= { meat: sprite(ART.meat), rune: sprite(ART.rune), thunder: sprite(ART.thunder) };
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.unit = unit;
    this.t = Math.random() * 10; // so they don't all bob together
    this.taken = false;
  }

  update(dt) { this.t += dt; }

  /** Is the viking standing on it? */
  touches(p) {
    return !this.taken && p.z < 30 &&
      Math.abs(p.x - this.x) < PICKUP.reach.x * this.unit && Math.abs(p.y - this.y) < PICKUP.reach.y * this.unit;
  }

  draw(ctx) {
    const u = this.unit, img = sprites[this.kind];
    const bob = Math.round(Math.sin(this.t * 3) * 1.5 + 1.5); // design px above the ground
    const x = Math.round(this.x - (img.width * u) / 2), base = Math.round(this.y - (bob + 3) * u);

    // shadow, smaller when it floats higher
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, (5 - bob * 0.4) * u, 1.3 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    // glow behind the runes (orange for fury, blue for thunder)
    if (this.kind !== 'meat') {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      const r = (9 + pulse * 3) * u;
      const cy = base - (img.height * u) / 2;
      const rgb = this.kind === 'rune' ? '255,150,60' : '90,200,255';
      const glow = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, r);
      glow.addColorStop(0, `rgba(${rgb},${0.45 + pulse * 0.2})`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(this.x - r, cy - r, r * 2, r * 2);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, base - img.height * u, img.width * u, img.height * u);

    // a little sparkle now and then
    const s = (this.t * 1.3) % 2;
    if (s < 0.25) {
      ctx.fillStyle = { rune: '#ffe2a0', thunder: '#e2f8ff', meat: '#fff6dc' }[this.kind];
      const sx = x + img.width * u - 2 * u, sy = base - img.height * u + u;
      ctx.fillRect(sx, sy - u, u, 3 * u);
      ctx.fillRect(sx - u, sy, 3 * u, u);
    }
  }
}

// words that float up and fade ("+3", "FÚRIA!")
export class FloatingText {
  constructor(text, x, y, color) {
    Object.assign(this, { text, x, y, color, t: 0 });
  }
  get done() { return this.t > 1.1; }
  update(dt) { this.t += dt; }
  draw(ctx) {
    const a = Math.max(0, 1 - this.t / 1.1);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(20,12,10,${a})`;
    ctx.fillStyle = this.color.replace('A', a.toFixed(2));
    const y = this.y - this.t * 50;
    ctx.strokeText(this.text, this.x, y);
    ctx.fillText(this.text, this.x, y);
  }
}
