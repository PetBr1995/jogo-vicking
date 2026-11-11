// The berserker fury look, drawn on top of the plain Base body.
//
// The fury has no body art of its own: every move (idle, walk, run, jump,
// the axe attacks, the throw) uses the same frames as the Base form, so the
// movement is exactly as good as the Base. The fire is a separate layer,
// drawn in chunky pixels (FIRE_PIXEL on screen), in the style of classic
// pixel-art flames: nested color bands that follow the shape of the flame
// (dark red edge → red → orange → light orange → a light hot core), wavy
// tongues with gaps between them, and loose sparks.
//
// How the flame is made: every pixel around him gets a "heat". Heat starts
// high next to his body and falls with the distance to it; the distance is
// measured so that heat reaches farther UP than sideways (flames rise), and
// farther BACKWARD than forward when he moves (a comet's tail). Moving noise
// is added on top, so the heat breaks into tongues that climb, and the heat
// is cut into color bands. That is all: no two flames are drawn by hand, but
// they all hug the body, the cape, the axe and the slash arcs.
//
//   flames   the heat field around the silhouette of the current frame
//   ground   a cluster of flames around his boots (same recipe)
//   sparks   little square pieces floating up
//   eyes     the eyes glow red (positions per frame in viking-eyes.json,
//            found by tools/find-eyes.mjs)
//   arcs     the axe slash is painted red (viking-fury-arcs.png, made by
//            tools/make-fury-arcs.mjs)
//
// It only reads what the Base frame is showing; it never changes it.

export const FIRE_PIXEL = 4; // screen px of one flame pixel

// heat bands, coolest → hottest
const BANDS = ['#9a1810', '#e0301c', '#ff5f2e', '#ff9559', '#ffd2ae'];
const EYE = '#ff2a18', EYE_CORE = '#ffd9a0';

const MARGIN = 50;      // sheet px of room around the frame for flames
const REACH = 9;      // cells the heat reaches sideways (more upward, see COST)

// small deterministic noise
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ---- distance from the body, flame-shaped ------------------------------------

let silCanvas = null, silCtx = null;
const fieldCache = new Map();

/**
 * Distance (in cells) from every cell to the body, in two versions:
 * `still` reaches far upward, `move` also far backward (x < 0), for the tail.
 */
function fieldsFor(sheet, src, pix) {
  const key = `${src[0]},${src[1]},${Math.round(pix * 100)}`;
  let f = fieldCache.get(key);
  if (f) return f;
  const [sx, sy, w, h] = src;
  const n = Math.ceil((w + MARGIN * 2) / pix);
  if (!silCanvas || silCanvas.width !== n) {
    silCanvas = document.createElement('canvas');
    silCanvas.width = silCanvas.height = n;
    silCtx = silCanvas.getContext('2d', { willReadFrequently: true });
  }
  silCtx.clearRect(0, 0, n, n);
  silCtx.imageSmoothingEnabled = true;
  silCtx.drawImage(sheet, sx, sy, w, h, MARGIN / pix, MARGIN / pix, w / pix, h / pix);
  const px = silCtx.getImageData(0, 0, n, n).data;
  const mask = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) mask[i] = px[i * 4 + 3] > 90 ? 1 : 0;
  f = { n, still: distance(mask, n, 1, 1, 0.5, 1.7), move: distance(mask, n, 0.4, 1.9, 0.6, 1.7) };
  if (fieldCache.size > 500) fieldCache.clear();
  fieldCache.set(key, f);
  return f;
}

// costs of walking one cell: backward (x-), forward (x+), up (y-), down (y+)
function distance(mask, n, back, front, up, down) {
  const d = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = mask[i] ? 0 : 1e9;
  const relax = (x, y) => {
    let best = d[y * n + x];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const qx = x + dx, qy = y + dy;                    // the neighbor we come from
        if (qx < 0 || qy < 0 || qx >= n || qy >= n) continue;
        // moving from q to (x, y): the step is -dx, -dy
        const ch = dx === 0 ? 0 : (-dx < 0 ? back : front);
        const cv = dy === 0 ? 0 : (-dy < 0 ? up : down);
        const v = d[qy * n + qx] + Math.hypot(ch, cv);
        if (v < best) best = v;
      }
    }
    d[y * n + x] = best;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) relax(x, y);
    for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) relax(x, y);
  }
  return d;
}

// heat → band index (-1 = no fire)
function band(heat) {
  return heat >= 0.86 ? 4 : heat >= 0.66 ? 3 : heat >= 0.46 ? 2 : heat >= 0.27 ? 1 : heat >= 0.14 ? 0 : -1;
}

/**
 * Everything that goes BEHIND the body. Call before drawing the body, inside
 * the same transform (origin at the feet, scaled and mirrored): the body
 * covers the middle, so only the fire around the silhouette shows.
 * @param sheet  the body sheet (only its alpha is read: the silhouette)
 * @param src    [sx, sy, w, h] the frame being shown
 * @param pix    flame pixel in sheet px (FIRE_PIXEL / scale)
 * @param eye    { x, y, r } the eye in this frame (or null): the sparks rise from the head
 * @param speed  0..1, how fast he moves (the flames stream back into a tail)
 */
export function drawFlameBehind(ctx, sheet, src, anchor, pix, level, t, eye, speed) {
  if (level <= 0) return;
  const { n, still, move } = fieldsFor(sheet, src, pix);
  const ts = Math.floor(t * 12) / 12;                   // the flames change in 12 steps a second
  const tq = Math.floor(t * 12);
  const paths = BANDS.map(() => new Path2D());
  const ox = -anchor.x - MARGIN, oy = -anchor.y - MARGIN;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const d = still[k] + (move[k] - still[k]) * speed;
      if (d > REACH * 1.9) continue;
      // moving noise: tall tongues that climb; when he moves it is sheared and
      // pulled backward, so the tongues slant into a streaming tail
      const nx = i * 0.36 + ts * 3.0 * speed + j * 0.2 * speed;
      const ny = j * 0.13 + ts * 2.6;
      const nz = vnoise(nx, ny, 1) * 0.7 + vnoise(nx * 2.1 + 9, ny * 2.1, 2) * 0.3;
      const far = Math.min(1, d / REACH);
      const heat = 0.92 - far * 1.05 + (nz - 0.5) * (0.35 + 1.5 * far) + (hash(i, j, tq) - 0.5) * 0.05;
      const b = band(heat);
      if (b >= 0) paths[b].rect(ox + i * pix, oy + j * pix, pix, pix);
    }
  }
  ctx.save();
  ctx.globalAlpha = level;
  paths.forEach((p, b) => { ctx.fillStyle = BANDS[b]; ctx.fill(p); });

  // sparks: loose square pieces floating up and (when he runs) back
  const ex = eye ? eye.x - anchor.x : 4, ey = eye ? eye.y - anchor.y : -72;
  for (let s = 0; s < 16; s++) {
    const life = (t * 0.5 + hash(s, 5)) % 1;
    const x = ex + (hash(s, 1) - 0.5) * 96 - speed * 70 * life + Math.sin(t * 3 + s) * 4;
    const y = ey + 52 - life * 150;
    ctx.fillStyle = life < 0.3 ? BANDS[3] : life < 0.65 ? BANDS[2] : BANDS[1];
    ctx.globalAlpha = level * Math.min(1, (1 - life) * 1.6);
    const sz = (s % 3 === 0 ? 1 : 0.6) * pix;
    ctx.fillRect(Math.round(x / pix) * pix, Math.round(y / pix) * pix, sz, sz);
  }
  ctx.restore();
}

/** The cluster of flames around his boots. Call AFTER drawing the body, same transform. */
export function drawGroundFlames(ctx, pix, level, t, speed) {
  if (level <= 0) return;
  const ts = Math.floor(t * 12) / 12, tq = Math.floor(t * 12);
  const paths = BANDS.map(() => new Path2D());
  const W = 11, H = 12; // cells to each side / upward
  for (let j = 0; j < H; j++) {
    for (let i = -W; i <= W; i++) {
      const x = (i + 0.5) * pix, up = (j + 0.5) * pix;
      // an ellipse of heat on the ground, taller in the middle
      const e = Math.hypot(x / 38, up / 30);
      const nx = i * 0.4 + ts * 3.0 * speed + j * 0.2 * speed, ny = -j * 0.15 + ts * 2.6;
      const nz = vnoise(nx + 20, ny, 3) * 0.7 + vnoise(nx * 2.1 + 3, ny * 2.1, 4) * 0.3;
      const heat = 0.8 - e * 0.95 + (nz - 0.5) * (0.3 + e * 1.4) + (hash(i, j, tq + 7) - 0.5) * 0.05;
      const b = band(heat);
      if (b >= 0) paths[b].rect(i * pix - pix / 2, -(j + 1) * pix, pix, pix);
    }
  }
  ctx.save();
  ctx.globalAlpha = level;
  paths.forEach((p, b) => { ctx.fillStyle = BANDS[b]; ctx.fill(p); });
  ctx.restore();
}

/**
 * The glowing red eyes. Call AFTER drawing the body, in the same transform.
 * @param eye { x, y, r } in sheet pixels from the frame's top-left (or null)
 */
export function drawEyes(ctx, eye, anchor, level, t) {
  if (!eye || level <= 0) return;
  const pulse = 0.85 + 0.15 * Math.sin(t * 9);
  const x = eye.x - anchor.x, y = eye.y - anchor.y, r = eye.r;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
  g.addColorStop(0, `rgba(255,60,30,${0.7 * pulse * level})`);
  g.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8);
  ctx.globalAlpha = Math.min(1, 0.95 * level);
  ctx.fillStyle = EYE;
  ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9 * pulse * level;
  ctx.fillStyle = EYE_CORE;
  ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * The red axe slash on top of the white one painted in the Base frame.
 * @param arcs { img, meta } from viking-fury-arcs.png / .json
 */
export function drawArcs(ctx, arcs, animName, frame, anchor, level) {
  const row = arcs?.meta.rows[animName];
  if (row === undefined || level <= 0) return;
  const c = arcs.meta.cell;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = level;
  ctx.drawImage(arcs.img, frame * c, row * c, c, c, -anchor.x, -anchor.y, c, c);
  ctx.restore();
}
