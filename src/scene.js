// The world the viking walks through: a Nordic dusk, wider than the screen.
//
// Layers far → near, each moving at its own speed as the camera follows the
// viking (parallax): sky with moon and stars, snowy mountains, hills with a
// pine forest, bigger pines, then the ground with a dirt path, grass tufts
// and stones fixed to the world.
//
// Everything is pixel art at the same pixel size as the characters (UNIT
// screen px per pixel): each background layer is painted once into a small
// canvas that repeats seamlessly, and drawn scaled up without smoothing.

export const WORLD_WIDTH = 4000; // px on screen

// small seeded random, so the world looks the same every time
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a wavy line that repeats every `period` px (sum of sines with whole cycles)
function ridge(period, waves, seed) {
  const r = rng(seed);
  const parts = waves.map(([cycles, amp]) => ({ k: cycles, amp, ph: r() * Math.PI * 2 }));
  return (x) => parts.reduce((h, p) => h + p.amp * Math.sin((2 * Math.PI * p.k * x) / period + p.ph), 0);
}

const C = {
  skyTop: '#121a33', skyMid: '#2d3560', skyLow: '#7a5a78', glow: '#d98a6a',
  moon: '#f4e9cf', moonShade: '#d8c9a6', star: '#e8eefc',
  mountain: '#3b4570', mountainShade: '#2f375c', snow: '#c9d2ea', snowShade: '#9aa6c8',
  hill: '#26343f', hillPine: '#1b2731',
  nearPine: '#141d22', nearPineLight: '#1f2b30',
  ground: '#3a4630', groundDark: '#2a3322', path: '#5a4a36', pathDark: '#463a2a', pathLight: '#6e5c44',
  grass: '#4f6338', grassLight: '#6c8247', stone: '#6d6a72', stoneDark: '#4a4850', stoneLight: '#8e8b94',
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// a pine tree silhouette standing on (x, base), `h` px tall
function pine(g, x, base, h, color, light) {
  const w = Math.max(3, Math.round(h * 0.45));
  for (let y = 0; y < h; y++) {
    // three stacked tiers, each wider at the bottom
    const tier = Math.floor((y / h) * 3);
    const inTier = ((y / h) * 3) % 1;
    const half = Math.round(((w / 2) * (0.45 + tier * 0.25)) * (0.35 + inTier * 0.65));
    g.fillStyle = color;
    g.fillRect(x - half, base - h + y, half * 2 + 1, 1);
    if (light && half > 1) { g.fillStyle = light; g.fillRect(x - half, base - h + y, 1, 1); }
  }
  g.fillStyle = color;
  g.fillRect(x, base - 1, 1, 2); // trunk
}

// each background layer: a canvas that repeats horizontally, its parallax
// speed, and how far above the horizon it reaches (design px)
function buildLayers() {
  const layers = [];

  // snowy mountains
  {
    const P = 320, H = 80;
    const [c, g] = canvas(P, H);
    const top = ridge(P, [[1, 14], [2, 9], [5, 5], [11, 2]], 7);
    for (let x = 0; x < P; x++) {
      const h = Math.round(46 + top(x));
      const slope = top(x + 1) - top(x - 1);
      for (let y = H - h; y < H; y++) {
        const depth = y - (H - h);
        const snowLine = 9 + Math.round(Math.sin(x * 0.7) * 2);
        let col = slope > 0 ? C.mountainShade : C.mountain;
        if (depth < snowLine && h > 44) col = slope > 0 ? C.snowShade : C.snow;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    layers.push({ canvas: c, speed: 0.12, lift: 0 });
  }

  // hills with a pine forest on top
  {
    const P = 256, H = 44;
    const [c, g] = canvas(P, H);
    const top = ridge(P, [[1, 5], [3, 3], [7, 1.5]], 21);
    g.fillStyle = C.hill;
    for (let x = 0; x < P; x++) {
      const h = Math.round(16 + top(x));
      g.fillRect(x, H - h, 1, h);
    }
    const r = rng(33);
    for (let x = 2; x < P - 2; x += 3 + Math.floor(r() * 4)) {
      pine(g, x, H - Math.round(16 + top(x)) + 2, 8 + Math.floor(r() * 7), C.hillPine);
    }
    layers.push({ canvas: c, speed: 0.3, lift: 0 });
  }

  // bigger, closer pines
  {
    const P = 384, H = 60;
    const [c, g] = canvas(P, H);
    const r = rng(57);
    g.fillStyle = C.nearPine;
    g.fillRect(0, H - 4, P, 4); // forest floor line at the horizon
    for (let x = 6; x < P - 6; x += 14 + Math.floor(r() * 26)) {
      pine(g, x, H - 2, 26 + Math.floor(r() * 26), C.nearPine, C.nearPineLight);
    }
    layers.push({ canvas: c, speed: 0.55, lift: 0 });
  }

  return layers;
}

export class Scene {
  /** @param unit screen px per design px (same as the characters) */
  constructor(unit) {
    this.unit = unit;
    this.layers = buildLayers();
    const r = rng(99);
    this.stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.8, big: r() < 0.15 }));
    // ground details, fixed in the world (design px from the world's left)
    const g = rng(123);
    this.props = [];
    for (let x = 0; x < WORLD_WIDTH / unit; x += 3 + Math.floor(g() * 9)) {
      const kind = g() < 0.18 ? 'stone' : 'grass';
      this.props.push({ x, depth: g(), kind, size: 1 + Math.floor(g() * 3) });
    }
  }

  /**
   * Draws the background and the floor.
   * @param camX left edge of the view, in world px
   * @param horizon screen y where the ground starts
   */
  draw(ctx, camX, horizon) {
    const { width: W, height: H } = ctx.canvas;
    const u = this.unit;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, C.skyTop);
    sky.addColorStop(0.55, C.skyMid);
    sky.addColorStop(0.88, C.skyLow);
    sky.addColorStop(1, C.glow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);

    // stars (barely move) and moon
    const drift = (camX * 0.02) % W;
    ctx.fillStyle = C.star;
    for (const s of this.stars) {
      const x = Math.floor(((s.x * W - drift) % W + W) % W / u) * u;
      const y = Math.floor((s.y * horizon * 0.7) / u) * u;
      ctx.fillRect(x, y, s.big ? u : u / 2, s.big ? u : u / 2);
    }
    const mx = Math.floor((W * 0.78 - camX * 0.03) / u) * u, my = Math.floor((horizon * 0.22) / u) * u, mr = 7 * u;
    ctx.fillStyle = C.moon;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.moonShade;
    ctx.fillRect(mx - 2 * u, my - u, 2 * u, 2 * u);
    ctx.fillRect(mx + 2 * u, my + 2 * u, u, u);

    // parallax layers, bottoms on the horizon, repeating sideways
    ctx.imageSmoothingEnabled = false;
    for (const L of this.layers) {
      const w = L.canvas.width * u, h = L.canvas.height * u;
      const off = Math.floor((camX * L.speed) / u) * u; // whole pixels: no shimmer
      let x = -(((off % w) + w) % w);
      for (; x < W; x += w) ctx.drawImage(L.canvas, x, horizon - h - L.lift * u, w, h);
    }

    // ground: darker toward the bottom, a dirt path across it
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, C.ground);
    ground.addColorStop(1, C.groundDark);
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);
    const pathTop = horizon + (H - horizon) * 0.38, pathBot = horizon + (H - horizon) * 0.78;
    const snap = (v) => Math.floor(v / u) * u;
    ctx.fillStyle = C.path;
    ctx.fillRect(0, snap(pathTop), W, snap(pathBot) - snap(pathTop));
    ctx.fillStyle = C.pathLight;
    ctx.fillRect(0, snap(pathTop), W, u);
    ctx.fillStyle = C.pathDark;
    ctx.fillRect(0, snap(pathBot) - u, W, u);
    // ragged path edges, fixed to the world
    for (let wx = Math.floor(camX / u / 2) * 2; wx < (camX + W) / u; wx += 2) {
      const n = (Math.sin(wx * 12.9898) * 43758.5453) % 1;
      const sx = wx * u - camX;
      if (Math.abs(n) > 0.55) { ctx.fillStyle = C.ground; ctx.fillRect(sx, snap(pathTop), 2 * u, u); }
      if (Math.abs(n) < 0.2) { ctx.fillStyle = C.groundDark; ctx.fillRect(sx, snap(pathBot), 2 * u, u); }
    }

    // grass tufts and stones (only the ones in view)
    for (const p of this.props) {
      const sx = p.x * u - camX;
      if (sx < -8 * u || sx > W + 8 * u) continue;
      const y = snap(horizon + 2 * u + p.depth * (H - horizon - 6 * u));
      if (p.kind === 'grass') {
        if (y > pathTop - u && y < pathBot) continue; // no grass on the path
        ctx.fillStyle = C.grass;
        ctx.fillRect(sx, y - p.size * u, u, p.size * u);
        ctx.fillRect(sx + 2 * u, y - (p.size + 1) * u, u, (p.size + 1) * u);
        ctx.fillStyle = C.grassLight;
        ctx.fillRect(sx + u, y - (p.size - 1 || 1) * u, u, (p.size - 1 || 1) * u);
      } else {
        const w = (p.size + 2) * u, h = (p.size + 1) * u;
        ctx.fillStyle = C.stoneDark;
        ctx.fillRect(sx, y - h, w, h);
        ctx.fillStyle = C.stone;
        ctx.fillRect(sx, y - h, w - u, h - u);
        ctx.fillStyle = C.stoneLight;
        ctx.fillRect(sx + u, y - h, u, u);
      }
    }
  }
}
