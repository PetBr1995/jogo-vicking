// Fase 1: a painted Nordic cave. The picture is the whole level (it scrolls
// together with the world, no parallax), and only the places that really
// have ground in the picture can be walked on: the stone floor, the wooden
// bridge over the chasm and the ledge by the door. Everything else (the
// chasm, the water, the cliffs) blocks the way.
//
// Ground shapes are polygons in the picture's own pixels (1024 × 572), so
// they stay on the painted floor at any screen size.

// Fase 1: a painted Nordic cave. Expanded across multiple cave chambers (2976 x 572)
// with seamless blending between sections so the player has a long, epic run to the end!
// Only places that really have ground in the picture can be walked on (stone floors,
// wooden bridges over chasms, and doorways).

const BASE_GROUND = [
  // main stone floor (ladder, gravestone, skull, shield, swords)
  [[24, 506], [120, 498], [220, 494], [330, 491], [470, 489], [600, 488], [690, 492], [716, 508],
   [716, 538], [700, 568], [28, 568], [14, 540]],
  // wooden bridge over the chasm
  [[704, 510], [790, 511], [884, 516], [884, 536], [790, 532], [704, 532]],
  // ledge by the doorway on the right
  [[872, 506], [960, 500], [1024, 502], [1024, 568], [884, 568], [872, 540]],
];

const SECTIONS = 3;
const OVERLAP = 48;
const SECTION_STEP = 1024 - OVERLAP; // 976
const STAGE_GROUND = [];

for (let s = 0; s < SECTIONS; s++) {
  const shiftX = s * SECTION_STEP;
  for (const poly of BASE_GROUND) {
    STAGE_GROUND.push(poly.map(([x, y]) => [x + shiftX, y]));
  }
}

export const STAGE1 = {
  image: '/assets/fase1-bg-long.png',
  w: 1024 + (SECTIONS - 1) * SECTION_STEP, // 2976 px
  h: 572,
  ground: STAGE_GROUND,
};

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export class Stage {
  constructor(def, image) {
    this.def = def;
    this.image = image;
    this.layout(1, 1);
  }

  /** Fits the picture to the view: covers it, bottom-aligned. */
  layout(viewW, viewH) {
    const { w, h } = this.def;
    this.s = Math.max(viewH / h, viewW / w);
    this.offY = viewH - h * this.s;
    this.width = w * this.s; // world width in screen px
  }

  /** Is there ground under the feet at world point (x, y)? */
  walkable(x, y) {
    const ix = x / this.s, iy = (y - this.offY) / this.s;
    return this.def.ground.some((p) => inside(p, ix, iy));
  }

  /** The nearest point with ground (searching around x, y). */
  snap(x, y) {
    if (this.walkable(x, y)) return { x, y };
    for (let r = 4; r < this.width; r += 4) {
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        const px = x + Math.cos(t) * r, py = y + Math.sin(t) * r * 0.5;
        if (this.walkable(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  /** Top and bottom of the walkable ground (screen px). */
  get minY() { return this.offY + Math.min(...this.def.ground.flat().map((p) => p[1])) * this.s; }
  get maxY() { return this.offY + Math.max(...this.def.ground.flat().map((p) => p[1])) * this.s; }

  draw(ctx, camX, debug) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.image, -camX, this.offY, this.width, this.def.h * this.s);
    if (debug) {
      // B: shows where the ground is
      ctx.fillStyle = 'rgba(0,255,120,0.22)';
      ctx.strokeStyle = 'rgba(0,255,120,0.8)';
      for (const poly of this.def.ground) {
        ctx.beginPath();
        poly.forEach(([ix, iy], i) => {
          const x = ix * this.s - camX, y = this.offY + iy * this.s;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
}

/**
 * Keeps a body on the ground: if the step (from px, py to the current x, y)
 * would leave the ground, it slides along the edge or stays put.
 * Returns which axes were blocked.
 */
export function keepOnGround(body, px, py, walkable) {
  if (!walkable || walkable(body.x, body.y)) return { bx: false, by: false };
  if (walkable(body.x, py)) { body.y = py; return { bx: false, by: true }; }
  // walking into a slanted edge (or toward the bridge): steer a little up
  // or down so he follows the edge instead of getting stuck
  if (body.x !== px) {
    for (let d = 1; d <= 30; d++) {
      for (const dy of [-d, d]) {
        if (!walkable(body.x, py + dy)) continue;
        if (d <= 3) { body.y = py + dy; return { bx: false, by: true }; }
        // ground ahead but further up/down: drift toward it, 3 px a step
        const sy = py + Math.sign(dy) * 3;
        if (walkable(px, sy)) { body.x = px; body.y = sy; return { bx: true, by: false }; }
      }
    }
  }
  if (walkable(px, body.y)) { body.x = px; return { bx: true, by: false }; }
  body.x = px; body.y = py;
  return { bx: true, by: true };
}
