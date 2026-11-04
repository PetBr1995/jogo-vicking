// Draws the viking (the player) in pixel art and saves his sprite sheet.
//
//   node tools/make-viking.mjs
//
// Output: public/assets/viking.png + public/assets/viking.json
//
// The character is built from parts (legs, body, head, arms, axe). Each
// animation is a list of key poses (angles); in-between frames are
// interpolated, so adding frames makes the motion smoother. Shapes, outline,
// legs, the walk cycle and the sheet writer are shared in pixel-art.mjs.

import {
  hex, far, rad, capsule, ellipse, rect, poly, union, clip, rotate, Frame,
  legPoints, hipsFor, armPoints, loopKeys, walkLegs, strideOf, runStrideOf, writeSheet,
} from './pixel-art.mjs';

// ---- palette ---------------------------------------------------------------

const C = {
  line: hex('#1b1218'),
  skin: [hex('#f0b080'), hex('#c87850'), hex('#ffd0a8')],
  beard: [hex('#d04a1e'), hex('#922c12'), hex('#f07a3a')],
  helm: [hex('#8c97aa'), hex('#5a6276'), hex('#d0d8e2')],
  fur: [hex('#dccca2'), hex('#a8946a'), hex('#f4ead0')],
  belt: [hex('#3c2618'), hex('#2a1a10'), hex('#5a3a24')],
  pants: [hex('#454c5e'), hex('#2c3140'), hex('#5c6478')],
  wrap: [hex('#b4a68e'), hex('#857860'), hex('#d4c8b0')],
  boot: [hex('#6e4024'), hex('#4a2a16'), hex('#8e5a34')],
  bracer: [hex('#5a3a24'), hex('#3c2618'), hex('#7a5232')],
  wood: [hex('#80562e'), hex('#5a3a1e'), hex('#a0703e')],
  steel: [hex('#b4bcca'), hex('#77808f'), hex('#f2f5f8')],
  mail: [hex('#7c8698'), hex('#535c6c'), hex('#a6b0c0')],
  rim: [hex('#5a5f6a'), hex('#3c4048'), hex('#7c828e')],
  paint: [hex('#b8342a'), hex('#84221a'), hex('#d85442')],
  cream: [hex('#e8d8b0'), hex('#bca880'), hex('#f8ecd0')],
  trail: [hex('#ffffff'), hex('#c8dcf0')],
};

// ---- the character ---------------------------------------------------------

function drawLeg(f, L, hx, hy, depth) {
  const p = depth ? far : (x) => x;
  f.part(capsule(L.kx, L.ky, L.ax, L.ay, 2.9), p(C.wrap));
  f.part(poly(L.boot), p(C.boot));
  f.part(capsule(hx, hy, L.kx, L.ky, 3.6), p(C.pants));
}

// bare, muscular arm with a leather bracer
function drawArm(f, A, sx, sy, depth) {
  const p = depth ? far : (x) => x;
  f.part(capsule(sx, sy, A.ex, A.ey, 3.2), p(C.skin));
  f.part(capsule(A.ex, A.ey, A.hx, A.hy, 2.8), p(C.bracer));
  f.part(ellipse(A.hx, A.hy, 2.6, 2.6), p(C.skin)); // fist
}

/**
 * pose: { front: [thigh, knee], back: [thigh, knee],
 *         armFront: [upper, elbow], armBack: [upper, elbow],
 *         breath: px the upper body sinks, lean: px forward, air: px off the ground }
 */
function drawViking(pose) {
  const f = new Frame(C.line);
  const { hx, hy } = hipsFor(pose);
  const legF = legPoints(hx + 2, hy, ...pose.front);
  const legB = legPoints(hx - 2, hy, ...pose.back);

  const by = hy + (pose.breath || 0); // upper body
  const lean = pose.lean || 0;
  const bx = hx + lean;               // chest shifts forward when leaning
  const sx = bx + 1, sy = by - 11;    // front shoulder
  const armF = armPoints(sx + 1, sy, ...pose.armFront);
  const armB = armPoints(sx - 3, sy, ...pose.armBack);

  // round shield on the back: red and cream halves, iron rim and boss
  const shx = bx - 7, shy = by - 9;
  f.part(ellipse(shx, shy, 6.5, 9.5), C.rim);
  f.part(clip(ellipse(shx, shy, 5.3, 8.3), (x, y) => y < shy), C.paint);
  f.part(clip(ellipse(shx, shy, 5.3, 8.3), (x, y) => y >= shy), C.cream);
  f.part(ellipse(shx - 0.5, shy, 2, 2.4), C.steel); // boss

  // back to front
  drawArm(f, armB, sx - 3, sy, true);
  drawLeg(f, legB, hx - 2, hy, true);
  drawLeg(f, legF, hx + 2, hy, false);

  // chainmail shirt: broad barrel chest + mail skirt, with a ring pattern
  const mail = union(ellipse(bx + 0.5, by - 7.5, 10, 8), rect(hx - 7.5, hy - 5, hx + 7.5, hy + 3));
  f.part(mail, C.mail);
  for (let y = Math.ceil(by - 13); y <= hy + 2; y += 2) {
    for (let x = Math.ceil(hx - 9); x <= hx + 10; x += 2) {
      const ox = x + ((y & 2) ? 1 : 0);
      if (mail(ox + 0.5, y + 0.5) && mail(ox + 1.5, y + 0.5) && mail(ox + 0.5, y + 1.5)) f.dot(ox + 0.5, y + 0.5, C.mail[1]);
    }
  }
  for (let x = -7; x <= 7; x += 2) f.dot(hx + x + 0.5, hy + 3.5, C.line); // jagged hem
  // shield strap across the chest, wide belt with buckle
  f.part(capsule(bx - 6, by - 13, hx + 6, hy - 5, 1.2), C.belt, { outline: false });
  f.part(rect(hx - 8, hy - 6, hx + 8, hy - 2.5), C.belt);
  f.part(rect(hx + 3, hy - 6, hx + 6, hy - 2.5), C.steel); // buckle
  f.dot(hx + 4.5, hy - 4.5, C.belt[1]);

  // big fur mantle over the shoulders
  f.part(union(ellipse(bx - 1, by - 12, 10.5, 4.2), ellipse(bx - 9, by - 9.5, 3, 3.2), ellipse(bx + 7, by - 10, 3, 3)), C.fur);
  for (const [x, y] of [[-7, -11], [-3, -10], [1, -12], [4, -10.5], [-9, -8]]) f.dot(bx + x, by + y, C.fur[1]);

  // head: slightly bigger, angry brow, long braided beard
  const cx = bx + 3, cy = by - 19;
  f.part(ellipse(cx - 3.5, cy + 2.5, 3.8, 5.5), C.beard); // hair at the back
  f.part(ellipse(cx + 0.5, cy + 0.5, 5.2, 5.2), C.skin);
  f.part(poly([[cx - 1.5, cy + 2.5], [cx + 1.5, cy + 2], [cx + 7, cy + 2.4], [cx + 7, cy + 8], [cx + 4.5, cy + 14],
    [cx + 1, cy + 13.5], [cx - 2, cy + 7]]), C.beard);
  f.part(capsule(cx + 3, cy + 13, cx + 3.5, cy + 17.5, 1.3), C.beard); // braid
  f.dot(cx + 3.6, cy + 16, C.steel[2]);                               // bead
  for (const [x, y] of [[1, 6], [3.5, 8], [1.5, 10], [4.5, 5], [2.5, 12]]) f.dot(cx + x, cy + y, C.beard[1]);
  f.part(union(clip(ellipse(cx, cy - 1.5, 6.5, 6), (x, y) => y <= cy - 0.5), rect(cx - 6.5, cy - 2, cx + 6.5, cy)), C.helm);
  f.part(rect(cx + 4, cy - 1, cx + 5.8, cy + 2.6), C.helm); // nose guard
  f.dot(cx + 0, cy - 5.5, C.helm[2]);                       // shine
  f.dot(cx - 1, cy - 4.5, C.helm[2]);
  for (const x of [-4, -1, 2]) f.dot(cx + x, cy - 1, C.helm[1]); // rivets
  f.dot(cx + 2.5, cy + 1, C.line);                          // eye
  f.dot(cx + 1.5, cy + 0.2, C.line);                        // angry brow
  f.dot(cx + 2.5, cy + 0.2, C.line);
  f.dot(cx + 3.5, cy + 0.6, C.beard[1]);

  // motion trail of the swing: an arc around the shoulder, from angle
  // trail[0] to trail[1] (same angles as the arm: 0 = down, + = forward),
  // thick at the end (where the axe is now), thin where it started
  if (pose.trail) {
    const [a0, a1, r] = pose.trail;
    const n = Math.ceil(Math.abs(a1 - a0) / 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = rad(a0 + (a1 - a0) * t);
      const w = 1 + Math.round(t * 3);
      for (let k = 0; k < w; k++) {
        f.dot(sx + 1 + Math.sin(a) * (r - k), sy + Math.cos(a) * (r - k), k ? C.trail[1] : C.trail[0]);
      }
    }
  }

  // big bearded axe in the front hand, then the arm over it
  const ang = rad(pose.axe ?? 45);
  const ux = Math.sin(ang), uy = -Math.cos(ang);
  const tx = armF.hx + ux * 12, ty = armF.hy + uy * 12;
  f.part(capsule(armF.hx - ux * 4, armF.hy - uy * 4, tx + ux, ty + uy, 1.6), C.wood);
  const blade = rotate([[tx - 1, ty - 3], [tx + 3, ty - 6.5], [tx + 8, ty - 6.5], [tx + 9.5, ty + 0.5],
    [tx + 8.5, ty + 8], [tx + 5.5, ty + 8.5], [tx + 3, ty + 4], [tx - 1, ty + 3]], tx, ty, ang);
  f.part(poly(blade), C.steel);
  for (let k = -4; k <= 6; k++) { // bright cutting edge
    const [ex, ey] = rotate([[tx + 8.2 - (k > 3 ? (k - 3) * 0.5 : 0), ty + k * 1.1]], tx, ty, ang)[0];
    f.dot(ex, ey, C.steel[2]);
  }
  drawArm(f, armF, sx + 1, sy, false);

  return f;
}

// ---- animations ------------------------------------------------------------

const walk = walkLegs().map(({ front, back }) => ({
  front, back,
  // arms swing against the legs on the same side; the axe arm swings less
  armFront: [6 - back[0] * 0.3, 75],
  armBack: [-front[0] * 0.8, 25 + Math.max(0, -front[0])],
  axe: 45 + back[0] * 0.3,
  lean: 1,
}));

// run cycle of ONE leg, 8 keys: [thigh, knee]
//   0 foot lands ahead · 1 weight down (knee bends) · 2 passing (support)
//   3 push off · 4 flight, leg behind · 5 heel kicks up · 6 knee drives
//   forward · 7 reach
const RUN_LEG = [[28, 22], [12, 38], [-6, 26], [-28, 10], [-34, 45], [-8, 100], [32, 100], [44, 50]];
// body height over one step (half a cycle): sinks on landing, flies after
// the push
const RUN_AIR = [0, -0.5, 0.5, 2];

const RUN_FRAMES = 12;
const run = [];
for (let i = 0; i < RUN_FRAMES; i++) {
  const t = i / RUN_FRAMES;
  const front = loopKeys(RUN_LEG, t), back = loopKeys(RUN_LEG, t + 0.5);
  run.push({
    front, back,
    air: Math.max(0, loopKeys(RUN_AIR.map((v) => [v]), (t * 2) % 1)[0]),
    // arms bent and pumping hard against the legs
    armFront: [12 - back[0] * 0.6, 95],
    armBack: [-front[0] * 1.1, 70],
    axe: 60 + back[0] * 0.4,
    lean: 3,
  });
}

// jump: one pose per moment (the height itself comes from the game code)
//   0 crouch · 1 take-off · 2 rising (knees tucked) · 3 top · 4 falling
//   5 landing (knees bend to absorb it)
const jump = [
  { front: [38, 72], back: [22, 62], armFront: [-25, 85], armBack: [-45, 35], axe: 25, lean: 3 },
  { front: [8, 6], back: [-22, 14], armFront: [70, 60], armBack: [120, 25], axe: 15, lean: 2 },
  { front: [55, 95], back: [18, 85], armFront: [95, 50], armBack: [145, 20], axe: 10, lean: 1 },
  { front: [50, 105], back: [10, 100], armFront: [105, 45], armBack: [155, 15], axe: 5, lean: 1 },
  { front: [28, 40], back: [-8, 32], armFront: [80, 55], armBack: [100, 30], axe: 30, lean: 1 },
  { front: [36, 70], back: [18, 60], armFront: [25, 80], armBack: [35, 40], axe: 45, lean: 3 },
];

// attack: one axe swing, overhead to the front
//   0 ready · 1 wind-up (axe behind the head) · 2 hold · 3 swing
//   4 impact (arm stretched, the hit happens here) · 5 follow-through
//   6 back to guard
const STANCE = { front: [10, 5], back: [-10, 5] };
const LUNGE = { front: [20, 14], back: [-16, 8] }; // steps into the blow
const attack = [
  { ...STANCE, armFront: [40, 60], armBack: [-10, 30], axe: 15, lean: 0 },
  { ...STANCE, armFront: [165, 35], armBack: [25, 40], axe: -55, lean: -1 },
  { ...STANCE, armFront: [180, 25], armBack: [35, 40], axe: -75, lean: -2 },
  { ...LUNGE, armFront: [120, 25], armBack: [-20, 40], axe: 45, lean: 2, trail: [190, 125, 21] },
  { ...LUNGE, armFront: [78, 30], armBack: [-30, 40], axe: 115, lean: 3, trail: [175, 90, 21] },
  { ...LUNGE, armFront: [45, 10], armBack: [-25, 35], axe: 145, lean: 4 },
  { ...STANCE, armFront: [20, 55], armBack: [-10, 30], axe: 70, lean: 2 },
];

const IDLE_FRAMES = 4; // wide, steady stance
const idle = [];
for (let i = 0; i < IDLE_FRAMES; i++) {
  const b = [0, 0.5, 1, 0.5][i]; // breathing
  idle.push({
    front: [10, 5], back: [-10, 5],
    armFront: [4, 75 - b * 4], armBack: [-4, 15 + b * 4],
    axe: 42, breath: b,
  });
}

// ---- sheet -----------------------------------------------------------------

writeSheet('viking', [idle, walk, run, jump, attack], drawViking, {
  idle: { row: 0, frames: idle.length, fps: 3, loop: true },
  walk: { row: 1, frames: walk.length, stride: strideOf(walk), loop: true, steps: [0, 0.5] },
  run: { row: 2, frames: run.length, stride: runStrideOf(run), loop: true, steps: [0, 0.5] },
  jump: { row: 3, frames: jump.length, loop: false },
  attack: {
    row: 4, frames: attack.length, loop: false, hitFrame: 4,
    durations: [0.05, 0.09, 0.07, 0.04, 0.09, 0.08, 0.1], // s per frame
  },
});
