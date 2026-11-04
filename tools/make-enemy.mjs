// Draws the first enemy, a Saxon spearman, and saves his sprite sheet.
//
//   node tools/make-enemy.mjs
//
// Output: public/assets/saxon.png + public/assets/saxon.json
//
// Same body proportions and walk as the viking (pixel-art.mjs), but a
// different look so he reads as the other side: pointed helmet, blue wool
// tunic, short brown beard, round shield held in front, long spear.

import {
  hex, far, rad, capsule, ellipse, rect, poly, union, clip, rotate, Frame,
  legPoints, hipsFor, armPoints, walkLegs, strideOf, writeSheet,
} from './pixel-art.mjs';

// ---- palette ---------------------------------------------------------------

const C = {
  line: hex('#161420'),
  skin: [hex('#e8a87c'), hex('#b8744e'), hex('#f8c8a0')],
  hair: [hex('#5a3a22'), hex('#3a2414'), hex('#7a5232')],
  helm: [hex('#7c8494'), hex('#4c5262'), hex('#b8c0cc')],
  tunic: [hex('#3c5a8c'), hex('#28406a'), hex('#5a7cb0')],
  trim: [hex('#d8b048'), hex('#a8842c'), hex('#f0d070')],
  belt: [hex('#4a3020'), hex('#301e12'), hex('#6a4830')],
  pants: [hex('#6a5038'), hex('#4a3624'), hex('#86684a')],
  garter: [hex('#3a2a1e'), hex('#261a10'), hex('#54402e')],
  boot: [hex('#3e2c20'), hex('#281c12'), hex('#58402e')],
  wood: [hex('#8a6438'), hex('#62441e'), hex('#aa8250')],
  steel: [hex('#b4bcca'), hex('#77808f'), hex('#f2f5f8')],
  shieldA: [hex('#2e6a44'), hex('#1e4a2e'), hex('#46885c')],
  shieldB: [hex('#e0d6b8'), hex('#b4a88a'), hex('#f4ecd4')],
  rim: [hex('#5a5f6a'), hex('#3c4048'), hex('#7c828e')],
};

// ---- the character ---------------------------------------------------------

function drawLeg(f, L, hx, hy, depth) {
  const p = depth ? far : (x) => x;
  f.part(capsule(L.kx, L.ky, L.ax, L.ay, 2.6), p(C.pants));
  // cross-garters wrapped around the shin
  for (const t of [0.3, 0.6]) f.dot(L.kx + (L.ax - L.kx) * t, L.ky + (L.ay - L.ky) * t, p(C.garter)[0]);
  f.part(poly(L.boot), p(C.boot));
  f.part(capsule(hx, hy, L.kx, L.ky, 3.2), p(C.pants));
}

// wool sleeve, bare forearm and hand
function drawArm(f, A, sx, sy, depth) {
  const p = depth ? far : (x) => x;
  f.part(capsule(sx, sy, A.ex, A.ey, 2.8), p(C.tunic));
  f.part(capsule(A.ex, A.ey, A.hx, A.hy, 2.3), p(C.skin));
  f.part(ellipse(A.hx, A.hy, 2.3, 2.3), p(C.skin));
}

/**
 * pose: { front, back: [thigh, knee] legs, armFront (spear), armBack
 *         (shield): [upper, elbow], spear: tilt (deg, 90 = level forward),
 *         breath, lean }
 */
function drawSaxon(pose) {
  const f = new Frame(C.line);
  const { hx, hy } = hipsFor(pose);
  const legF = legPoints(hx + 2, hy, ...pose.front);
  const legB = legPoints(hx - 2, hy, ...pose.back);

  const by = hy + (pose.breath || 0);
  const bx = hx + (pose.lean || 0);
  const sx = bx + 1, sy = by - 12;
  const armF = armPoints(sx + 1, sy, ...pose.armFront);
  const armB = armPoints(sx - 2, sy, ...pose.armBack);

  // back to front: shield arm, legs, body
  drawArm(f, armB, sx - 2, sy, true);
  drawLeg(f, legB, hx - 2, hy, true);
  drawLeg(f, legF, hx + 2, hy, false);

  // knee-length wool tunic with a yellow hem, belt
  f.part(union(ellipse(bx + 0.5, by - 7, 8, 7.5), poly([[hx - 6.5, hy - 4], [hx + 6.5, hy - 4], [hx + 8, hy + 5], [hx - 7.5, hy + 5]])), C.tunic);
  f.part(rect(hx - 7.5, hy + 3.5, hx + 8, hy + 5), C.trim, { outline: false });
  f.part(rect(hx - 7, hy - 5, hx + 7.5, hy - 2.5), C.belt);
  f.dot(hx + 5, hy - 4, C.trim[2]);
  f.dot(bx + 4, by - 12, C.trim[0]); // collar
  f.dot(bx + 5, by - 11, C.trim[0]);

  // head: pointed (conical) helmet, nose guard, short brown beard
  const cx = bx + 2.5, cy = by - 19;
  f.part(ellipse(cx - 3, cy + 2, 3.3, 4.5), C.hair);
  f.part(ellipse(cx + 0.5, cy + 0.5, 4.8, 5), C.skin);
  f.part(poly([[cx - 1, cy + 3], [cx + 2, cy + 2.5], [cx + 6.2, cy + 3], [cx + 5.5, cy + 7], [cx + 2.5, cy + 8.5], [cx - 1, cy + 6]]), C.hair);
  f.part(poly([[cx - 6, cy], [cx + 6, cy], [cx + 4.5, cy - 4], [cx + 0.5, cy - 9.5], [cx - 4, cy - 4]]), C.helm);
  f.part(rect(cx - 6, cy - 1.5, cx + 6, cy + 0.5), C.helm);
  f.part(rect(cx + 3.8, cy - 0.5, cx + 5.4, cy + 2.8), C.helm); // nose guard
  f.dot(cx - 1, cy - 5, C.helm[2]);
  f.dot(cx + 2.2, cy + 1.2, C.line); // eye
  f.dot(cx + 1.4, cy + 0.6, C.line); // brow
  f.dot(cx + 3, cy + 4.5, C.hair[1]);

  // round shield held in front of the body: green and cream, iron rim and boss
  // (turned a bit toward the camera so it reads as round, painted in quarters)
  const shx = bx + 5 + (pose.shieldX || 0), shy = by - 6;
  f.part(ellipse(shx, shy, 7.5, 9.5), C.rim);
  const inner = ellipse(shx, shy, 6.3, 8.3);
  f.part(clip(inner, (x, y) => (x < shx) === (y < shy)), C.shieldA, { outline: false });
  f.part(clip(inner, (x, y) => (x < shx) !== (y < shy)), C.shieldB, { outline: false });
  f.part(ellipse(shx, shy, 2.2, 2.6), C.steel); // boss

  // long spear in the front hand, leaf-shaped iron tip
  const ang = rad(pose.spear ?? 70);
  const ux = Math.sin(ang), uy = -Math.cos(ang);
  const tx = armF.hx + ux * 17, ty = armF.hy + uy * 17;
  f.part(capsule(armF.hx - ux * 9, armF.hy - uy * 9, tx, ty, 1.5), C.wood);
  const tip = rotate([[tx - 1.8, ty + 1], [tx, ty - 1], [tx + 1.8, ty + 1], [tx + 1, ty + 3], [tx - 1, ty + 3]], tx, ty, ang);
  f.part(poly(rotate(tip, tx, ty, 0).map(([x, y]) => [x + ux * 2.5, y + uy * 2.5])), C.steel);
  f.part(poly(rotate([[tx - 1.4, ty], [tx, ty - 4.5], [tx + 1.4, ty], [tx, ty + 1.5]], tx, ty, ang)), C.steel);
  drawArm(f, armF, sx + 1, sy, false);

  return f;
}

// ---- animations ------------------------------------------------------------

const walk = walkLegs().map(({ front, back }) => ({
  front, back,
  armFront: [25 - back[0] * 0.25, 60],
  armBack: [30, 60],
  shieldX: Math.round(-back[0] * 0.04),
  spear: 70 + back[0] * 0.2,
  lean: 1,
}));

const idle = [0, 0.5, 1, 0.5].map((b) => ({
  front: [8, 4], back: [-8, 4],
  armFront: [25, 60 - b * 3], armBack: [30, 60],
  spear: 68, breath: b,
}));

writeSheet('saxon', [idle, walk], drawSaxon, {
  idle: { row: 0, frames: idle.length, fps: 3, loop: true },
  walk: { row: 1, frames: walk.length, stride: strideOf(walk), loop: true, steps: [0, 0.5] },
});
