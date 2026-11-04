import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { input } from './input.js';
import { Particles } from './particles.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stateEl = document.getElementById('state');

const SCALE = 4; // each sprite pixel becomes 4x4 on screen
let debug = false;
let shake = 0; // screen shake strength (px), fades out

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
resize();

// (onload instead of img.decode(): decode() can hang while the page is
// in the background)
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`não carregou ${src}`));
    img.src = src;
  });
}

const loadSheet = (name) => Promise.all([
  loadImage(`/assets/${name}.png`),
  fetch(`/assets/${name}.json`).then((r) => r.json()),
]);
const [[sheet, meta], [saxonSheet, saxonMeta]] = await Promise.all([loadSheet('viking'), loadSheet('saxon')]);

const player = new Player(sheet, meta, SCALE, innerWidth * 0.35, innerHeight * 0.75);
let saxon = new Enemy(saxonSheet, saxonMeta, SCALE, innerWidth * 0.72, innerHeight * 0.72, 90);
let respawn = 0;   // s until the next Saxon walks in
let hitStop = 0;   // s the action freezes on a hit, so it feels heavy
const dust = new Particles();
if (import.meta.env.DEV) {
  window.player = player;
  Object.defineProperty(window, 'saxon', { get: () => saxon }); // handy in the console
}

// how far the axe reaches in front of the viking, and how far up/down
const AXE_REACH = { front: 32 * SCALE, depth: 12 * SCALE };

player.onFootstep = (p) => {
  const run = p.anim === 'run';
  dust.burst(p.x - p.facing * 10, p.y, run ? 5 : 2, {
    vx: -p.facing * (run ? 60 : 20), spread: run ? 45 : 20, size: run ? 6 : 4,
  });
};

player.onHit = (p) => {
  shake = 7;
  dust.burst(p.x + p.facing * 22 * SCALE, p.y - 2, 9, { vx: p.facing * 90, spread: 100, size: 6 });

  // did the axe catch the Saxon? (in front, close enough, same depth)
  const ahead = (saxon.x - p.x) * p.facing;
  if (ahead > 0 && ahead < AXE_REACH.front && Math.abs(saxon.y - p.y) < AXE_REACH.depth && saxon.hit(p.x)) {
    shake = 10;
    hitStop = 0.07;
    dust.burst(saxon.x, saxon.y - 18 * SCALE, 12, { vx: p.facing * 120, spread: 160, size: 5 });
  }
};
player.onLand = (p) => {
  dust.burst(p.x, p.y, 8, { vx: 0, spread: 140, size: 6 });
};

const groundTop = () => canvas.height * 0.55;

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#2b3550');
  g.addColorStop(0.55, '#55607a');
  g.addColorStop(0.55, '#3d4a35');
  g.addColorStop(1, '#232b1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // floor lines, to see the movement
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, groundTop());
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function drawShadow(p) {
  const lift = Math.min(1, p.z / 120); // smaller and lighter while jumping
  ctx.fillStyle = `rgba(0,0,0,${0.3 - lift * 0.15})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 11 * SCALE * (1 - lift * 0.4), 2.5 * SCALE * (1 - lift * 0.4), 0, 0, Math.PI * 2);
  ctx.fill();
}

let last = performance.now();
function loop(now) {
  // clamp: the first timestamp can be earlier than `last`
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;

  if (input.wasPressed('KeyB')) debug = !debug;

  const bounds = {
    minX: 60,
    maxX: canvas.width - 60,
    minY: groundTop() + 40,
    maxY: canvas.height - 10,
  };
  if (hitStop > 0) hitStop -= dt; // frozen for an instant on a hit
  else {
    player.update(dt, bounds);
    saxon.update(dt, player, bounds);
    dust.update(dt);
  }

  // a defeated Saxon disappears; a new one walks in from the right
  if (saxon.gone) {
    respawn += dt;
    if (respawn > 1.2) {
      respawn = 0;
      const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      saxon = new Enemy(saxonSheet, saxonMeta, SCALE, canvas.width - 80, y, 90);
    }
  }

  shake = Math.max(0, shake - dt * 40);
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  // whoever is lower on the screen is closer, so it's drawn last
  const actors = [player, ...(saxon.gone ? [] : [saxon])].sort((a, b) => a.y - b.y);
  actors.forEach(drawShadow);
  dust.draw(ctx, (p) => p.y < player.y);
  for (const a of actors) a.draw(ctx, debug);
  dust.draw(ctx, (p) => p.y >= player.y);
  if (!saxon.gone) saxon.drawLife(ctx);
  ctx.restore();

  stateEl.textContent = `anim: ${player.anim}  quadro: ${player.frame + 1}  vel: ${player.speed | 0}`;

  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
