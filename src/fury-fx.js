// The berserker fury look, drawn on top of the plain Base body.
//
// The fury has no body art of its own: every move (idle, walk, run, jump,
// the axe attacks, the throw) uses the same frames as the Base form, so the
// movement is exactly as good as the Base. The fire is a separate layer,
// all drawn in chunky pixels (FIRE_PIXEL on screen) in the fury reds:
//
//   halo     three flat-colored shells of the body's own silhouette, each a
//            little bigger than the last (dark red, red, orange): the fire
//            hugs every pose, the cape, the axe and the slash arcs
//   tongues  pixel flames (jagged edges, light core, dark red outside) over
//            the head, shoulders and back. When he moves they lean back and
//            stretch into a trailing tail, like a comet
//   ground   a cluster of flames burning around his boots
//   embers   little square sparks floating up
//   eyes     the eyes glow red (positions per frame in viking-eyes.json,
//            found by tools/find-eyes.mjs)
//   arcs     the axe slash is painted red (viking-fury-arcs.png, made by
//            tools/make-fury-arcs.mjs)
//
// It only reads what the Base frame is showing; it never changes it.

export const FIRE_PIXEL = 4; // screen px of one flame pixel

const C = {
  halo: ['#8a1410', '#d8281a', '#ff5a2c'], // outside → inside
  outer: '#b81e14', red: '#e8321e', orange: '#ff6a34', hot: '#ff9a5c', core: '#ffc9a0',
  eye: '#ff2a18', eyeCore: '#ffd9a0',
};

// small deterministic noise in [0, 1)
function hash(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177) + Math.imul(d | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- the halo: the silhouette grown outward, in chunky pixels ---------------

const MARGIN = 44;
let scratch = null, sg = null;

function haloShells(ctx, white, src, anchor, pix, level, tq) {
  const [sx, sy, w, h] = src;
  const n = Math.ceil((w + MARGIN * 2) / pix);
  if (!scratch || scratch.width !== n) {
    scratch = document.createElement('canvas');
    scratch.width = scratch.height = n;
    sg = scratch.getContext('2d');
  }
  const shells = [[C.halo[0], 0.92, 17, 17], [C.halo[1], 1, 11, 10], [C.halo[2], 1, 5.5, 5]];
  ctx.imageSmoothingEnabled = false;
  shells.forEach(([color, alpha, reach, rise], si) => {
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.imageSmoothingEnabled = true;
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, n, n);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const wob = 0.72 + 0.4 * hash(i, si, tq);          // jumps between flicker steps
      const up = Math.sin(a) < 0 ? 1 : 0.4;              // flames reach farther up than down
      sg.drawImage(white, sx, sy, w, h,
        (MARGIN + Math.cos(a) * reach * wob) / pix, (MARGIN + Math.sin(a) * reach * wob * up) / pix, w / pix, h / pix);
    }
    for (let k = 0; k < 3; k++) {                         // extra copies straight up
      const sway = (hash(k, si, tq, 7) - 0.5) * reach * 0.8;
      const lift = rise * (0.65 + 0.5 * hash(k, si, tq, 9));
      sg.drawImage(white, sx, sy, w, h,
        (MARGIN + sway + (k - 1) * reach * 0.4) / pix, (MARGIN - lift - k * reach * 0.25) / pix, w / pix, h / pix);
    }
    // soft edges → solid pixels (drawing the layer over itself raises the faint alpha)
    for (let k = 0; k < 3; k++) sg.drawImage(scratch, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = color;
    sg.fillRect(0, 0, n, n);
    ctx.globalAlpha = alpha * level;
    ctx.drawImage(scratch, 0, 0, n, n, -anchor.x - MARGIN, -anchor.y - MARGIN, n * pix, n * pix);
  });
  ctx.globalAlpha = 1;
}

// ---- pixel flames -----------------------------------------------------------

/**
 * One flame standing on (bx, by), made of `pix`-sized squares: wide at the
 * base, thin at the tip, jagged edges, light core, dark red outside. `lean`
 * shears the top sideways (negative = backwards), so a big lean makes a
 * slanted streak like a comet's tail.
 */
function pixelTongue(ctx, bx, by, h, w, lean, pix, tq, seed) {
  const rows = Math.max(2, Math.round(h / pix)), cols = Math.max(2, Math.round(w / pix));
  for (let gy = 0; gy < rows; gy++) {
    const f = gy / rows;                                   // 0 at the base, 1 at the tip
    const half = Math.max(pix * 0.6, (w / 2) * Math.pow(1 - f, 0.8));
    // slanted by `lean`, with a slow S-curve like the reference flames
    const shear = lean * Math.pow(f, 1.4) + Math.sin(f * 4.5 + seed * 1.3 + tq * 0.55) * pix * 1.8 * f;
    for (let gx = 0; gx < cols; gx++) {
      const cx = (gx - (cols - 1) / 2) * pix;
      const jag = (hash(gx, gy >> 1, seed, tq) - 0.5) * 0.3 * (0.35 + f);
      const u = Math.abs(cx) / half + jag;                 // 0 in the middle, 1 at the edge
      if (u >= 1) continue;
      ctx.fillStyle = u > 0.74 ? C.outer : u > 0.5 ? C.red : u > 0.28 ? C.orange : f < 0.5 ? C.core : C.hot;
      const x = Math.round((bx + shear + cx) / pix) * pix, y = Math.round((by - (gy + 1) * pix) / pix) * pix;
      ctx.fillRect(x - pix / 2, y, pix, pix);
    }
  }
}

// [dx, dy from the head, height, width, lean, seed]
const CROWN = [[-12, -22, 52, 24, -9, 1], [3, -26, 62, 26, -1, 2], [15, -20, 46, 22, 8, 3]];
const BACK = [[-32, 4, 46, 22, -12, 4], [-36, 34, 42, 22, -14, 5], [-26, -14, 42, 20, -14, 6]];
// the tail when he moves: low, long, slanted streaks behind the body
const TAIL = [[-24, 14, 42, 24, -34, 8], [-28, 40, 38, 22, -38, 9], [-22, -2, 36, 20, -30, 10]];
// the boots
const GROUND = [[-27, 0, 16, 14, -3, 11], [-14, 0, 24, 16, 2, 12], [0, 0, 18, 16, -2, 13], [14, 0, 26, 18, 3, 14], [27, 0, 15, 14, 5, 15]];

/**
 * Everything that goes BEHIND the body. Call before drawing the body, inside
 * the same transform (origin at the feet, scaled and mirrored): the body
 * covers the middle, so only the fire outside the silhouette shows.
 * @param white  the whole sheet painted white (the silhouette)
 * @param src    [sx, sy, w, h] the frame being shown
 * @param pix    flame pixel in sheet px (FIRE_PIXEL / scale)
 * @param eye    { x, y, r } the eye in this frame (or null): the flames rise from the head
 * @param speed  0..1, how fast he moves (the flames lean back and stretch)
 */
export function drawFlameBehind(ctx, white, src, anchor, pix, level, t, eye, speed) {
  if (level <= 0) return;
  const tq = Math.floor(t * 11); // the flames change at ~11 steps a second, like pixel animation
  ctx.save();

  haloShells(ctx, white, src, anchor, pix, level, tq);

  const ex = eye ? eye.x - anchor.x : 4, ey = eye ? eye.y - anchor.y : -anchor.y * 0 - 72;
  ctx.globalAlpha = level;
  const draw = (list, mult = 1, stretch = 1) => {
    for (const [dx, dy, h, w, lean, seed] of list) {
      const hh = h * stretch * (0.82 + 0.3 * hash(seed, tq, 3));
      const ln = lean * (1 + 1.1 * speed) - speed * hh * 0.45 * mult;
      pixelTongue(ctx, ex + dx, ey + dy, hh, w, ln, pix, tq, seed);
    }
  };
  draw(BACK, 1, 1 + 0.2 * speed);
  draw(CROWN, 1, 1 + 0.15 * speed);
  if (speed > 0.3) { ctx.globalAlpha = level * Math.min(1, (speed - 0.3) * 2.2); draw(TAIL, 1, 1 + 0.5 * speed); }

  // embers: little square sparks rising
  ctx.globalAlpha = level;
  for (let i = 0; i < 14; i++) {
    const life = (t * 0.55 + hash(i, 5)) % 1;
    const x = ex + (hash(i, 1) - 0.5) * 84 - speed * 40 * life + Math.sin(t * 3 + i) * 5;
    const y = ey + 44 - life * 130;
    ctx.fillStyle = life < 0.35 ? C.hot : life < 0.7 ? C.orange : C.outer;
    ctx.globalAlpha = level * (1 - life) * 0.95;
    const s = life < 0.5 ? pix * 0.75 : pix * 0.5;
    ctx.fillRect(Math.round(x / pix) * pix, Math.round(y / pix) * pix, s, s);
  }
  ctx.restore();
}

/** The flames burning around his boots. Call AFTER drawing the body, same transform. */
export function drawGroundFlames(ctx, pix, level, t, speed) {
  if (level <= 0) return;
  const tq = Math.floor(t * 11);
  ctx.save();
  ctx.globalAlpha = level;
  for (const [dx, dy, h, w, lean, seed] of GROUND) {
    const hh = h * (0.8 + 0.35 * hash(seed, tq, 5));
    pixelTongue(ctx, dx, dy, hh, w, lean - speed * 22, pix, tq, seed);
  }
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
  ctx.fillStyle = C.eye;
  ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9 * pulse * level;
  ctx.fillStyle = C.eyeCore;
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
