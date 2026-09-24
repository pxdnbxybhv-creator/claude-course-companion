// Landscape painter: sky, distant mountains, mist, sun/moon, ground, pond, rocks, light.
//
// Composition follows the Southern Song "one-corner" habit (马远一角): the main mountain mass
// rises from one side, seen through mist, while the other side stays open — bare paper, with at
// most a whisper of far hills. Three depths of hills, far → near:
//   0 · 远山 — a pale indigo/ochre breath, no texture, soft ridges.
//   1 · 米家山 — rounded cloudy peaks with horizontal 米点 dabs, belts of cloud crossing them.
//   2 · 近山 — nearer, darker slopes with 披麻 hemp-fibre strokes, a broken ridge line, a few
//        distant trees and moss dots.
// Every wash is computed as a soft pixel field (dissolving into mist at its base, mottled by
// noise) and upscaled; the brushwork on top goes through the shared brush engine.
// Night uses 烘云托月: the sky is washed, the moon is left as bare (lead-white) paper.
// Winter uses the 雪景 method: the sky is greyed, ridges stay white, valleys are darkened.
import type { Drawing, Stroke, StrokePoint } from './types';
import { PIGMENTS } from './types';
import type { SceneEnv, Season, TimeOfDay } from './scene-types';
import { fillPaper } from './paper';
import { paintStroke } from './brush';
import { makeRng, makeNoise2, mixSeed, clamp, lerp, smoothstep } from '../core/rng';
import type { Rng, Noise2 } from '../core/rng';

export interface Backdrop {
  /** Canvas of size w*dpr × h*dpr with everything static behind the plants. */
  canvas: HTMLCanvasElement;
  /** y (css px) of the ground line where plants stand. */
  groundY: number;
  /** y (css px) where the pond's water surface begins (below groundY). */
  pondTop: number;
  /** Which side the mountain mass leans to (−1 left, 1 right); the other side is open sky. */
  side?: -1 | 1;
  /** Sun or moon disc in css px (r = 0 when none is visible). */
  body?: { kind: 'sun' | 'moon'; x: number; y: number; r: number };
}

// ---------------------------------------------------------------------------
// colour helpers

type RGB = [number, number, number];
const hexRgb = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgbHex = (c: RGB) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const INK = hexRgb(PIGMENTS.ink);
const INDIGO = hexRgb(PIGMENTS.indigo);
const OCHRE = hexRgb(PIGMENTS.ochre);
const MALACHITE = hexRgb(PIGMENTS.malachite);
const ROUGE = hexRgb(PIGMENTS.rouge);
const CINNABAR = hexRgb(PIGMENTS.cinnabar);
const GAMBOGE = hexRgb(PIGMENTS.gamboge);
const LEADWHITE: RGB = [248, 245, 237];

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Evaluate a colour/alpha field on a coarse grid and paint it, smoothly upscaled, over
 * (x0, y0, w, h) of `ctx` (css units). `fn` writes straight-alpha RGBA (0..255, alpha 0..1)
 * into `out`. `res` is field pixels per css px.
 */
function paintField(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, w: number, h: number, res: number,
  fn: (x: number, y: number, out: Float32Array) => void,
): void {
  const fw = Math.max(2, Math.ceil(w * res)), fh = Math.max(2, Math.ceil(h * res));
  const c = makeCanvas(fw, fh);
  const fctx = c.getContext('2d')!;
  const img = fctx.createImageData(fw, fh);
  const d = img.data;
  const out = new Float32Array(4);
  const sx = w / fw, sy = h / fh;
  for (let j = 0; j < fh; j++) {
    const y = y0 + (j + 0.5) * sy;
    for (let i = 0; i < fw; i++) {
      out[3] = 0;
      fn(x0 + (i + 0.5) * sx, y, out);
      const a = out[3];
      if (a <= 0.002) continue;
      const k = (j * fw + i) * 4;
      d[k] = out[0]; d[k + 1] = out[1]; d[k + 2] = out[2];
      d[k + 3] = clamp(a, 0, 1) * 255;
    }
  }
  fctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, x0, y0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// layout: ground line, mountain ridges, sun/moon — deterministic in (w, h, env).

interface Peak { cx: number; hwL: number; hwR: number; hgt: number; k: number }

interface Ridge {
  /** Ridge y (css px) sampled every `step` px from x = −step. */
  ys: Float32Array;
  step: number;
  /** y where the layer has fully dissolved into mist. */
  base: number;
  depth: 0 | 1 | 2;
  /** Mountain height above base at x (0 where there is no mountain). */
}

interface Layout {
  w: number; h: number;
  groundY: number; pondTop: number;
  hz: number; skyTop: number;
  side: -1 | 1;
  ridges: Ridge[];
  body: { kind: 'sun' | 'moon'; x: number; y: number; r: number };
}

function ridgeAt(r: Ridge, x: number): number {
  const f = x / r.step + 1;
  const i = Math.floor(f);
  if (i < 0) return r.ys[0];
  if (i >= r.ys.length - 1) return r.ys[r.ys.length - 1];
  const t = f - i;
  return r.ys[i] * (1 - t) + r.ys[i + 1] * t;
}

/** The two pieces of layout the garden needs even without a backdrop. */
export function groundLine(w: number, h: number): { groundY: number; pondTop: number } {
  const aspect = w / h;
  const g = clamp(0.63 + (aspect - 1) * 0.022, 0.62, 0.7);
  const groundY = Math.round(h * g);
  const pondTop = groundY + Math.round(clamp(h * 0.02, 7, 14));
  return { groundY, pondTop };
}

function makeRidge(w: number, base: number, peaks: Peak[], noise: Noise2, depth: 0 | 1 | 2, detail: number, floor: number, salt: number): Ridge {
  const step = 2;
  const n = Math.ceil(w / step) + 3;
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i - 1) * step;
    // soft union of rounded, slightly skewed peaks (p-norm)
    let s = 0;
    for (const p of peaks) {
      const t = (x - p.cx) / (x < p.cx ? p.hwL : p.hwR);
      if (t <= -1 || t >= 1) continue;
      const b = p.hgt * Math.pow(1 - t * t, p.k);
      s += b * b * b;
    }
    let e = Math.cbrt(s);
    e += floor * (0.6 + 0.4 * noise(x / 230 + salt, 3.1));
    // ridge detail grows with height: peaks are knobbly, saddles smooth
    const rel = e > 0 ? 1 : 0;
    const big = noise(x / 90 + salt, 7.7 + depth) * 0.12;
    const small = noise.fbm(x / (18 + depth * 6) + salt, 1.3 + depth, 3) * detail;
    ys[i] = base - e * (1 + big) - rel * small * Math.min(e, 60) * 0.35;
  }
  return { ys, step, base, depth };
}

const layoutCache = new Map<string, Layout>();

function sceneLayout(w: number, h: number, env: SceneEnv): Layout {
  const key = `${w}|${h}|${env.seed}|${env.tod}|${env.hour.toFixed(2)}|${env.moonPhase.toFixed(3)}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const rng = makeRng(mixSeed(env.seed, 0x1a4d5ca9));
  const noise = makeNoise2(mixSeed(env.seed, 77));
  const { groundY, pondTop } = groundLine(w, h);
  const side: -1 | 1 = rng.chance(0.5) ? -1 : 1;
  const skyTop = h * (w / h > 1.6 ? 0.1 : 0.14);
  const hz = groundY - Math.max(10, h * 0.045); // lowest mist line
  const Hz = hz - skyTop;
  // S: width over which the corner mass is laid out — on wide screens it stays in its corner.
  const S = Math.min(w, h * 1.55);
  const X = (c: number) => (side < 0 ? c * S : w - c * S);
  const Xw = (u: number) => (side < 0 ? u * w : w - u * w);

  // 0 · far hills: low rolling line across the width + one taller faint peak on the open side
  const far: Peak[] = [];
  const nf = rng.int(3, 5);
  for (let i = 0; i < nf; i++) {
    const u = (i + rng.range(0.1, 0.9)) / nf;
    far.push({ cx: Xw(u), hwL: rng.range(0.1, 0.22) * S, hwR: rng.range(0.1, 0.22) * S, hgt: Hz * rng.range(0.14, 0.3) * (1.1 - u * 0.4), k: rng.range(1, 1.6) });
  }
  far.push({ cx: Xw(rng.range(0.62, 0.9)), hwL: rng.range(0.1, 0.16) * S, hwR: rng.range(0.1, 0.16) * S, hgt: Hz * rng.range(0.34, 0.48), k: rng.range(0.9, 1.3) });
  const farBase = hz - Hz * 0.2;

  // 1 · 米家山 cloudy peaks, massed in the corner
  const mid: Peak[] = [];
  const nm = rng.int(2, 3);
  for (let i = 0; i < nm; i++) {
    const c = rng.range(0.02, 0.14) + i * rng.range(0.14, 0.2);
    mid.push({ cx: X(c), hwL: rng.range(0.12, 0.2) * S, hwR: rng.range(0.12, 0.2) * S, hgt: Hz * (0.86 - i * 0.2) * rng.range(0.85, 1.05), k: rng.range(0.8, 1.15) });
  }
  const midBase = hz - Hz * 0.05;

  // 2 · near slopes, lower, reaching out a little further
  const near: Peak[] = [];
  const nn = rng.int(1, 2);
  for (let i = 0; i < nn; i++) {
    const c = rng.range(0.0, 0.1) + i * rng.range(0.2, 0.3);
    near.push({ cx: X(c), hwL: rng.range(0.14, 0.24) * S, hwR: rng.range(0.14, 0.24) * S, hgt: Hz * (0.5 - i * 0.14) * rng.range(0.85, 1.1), k: rng.range(1.2, 1.8) });
  }
  const nearBase = hz + (groundY - hz) * 0.6;

  const ridges = [
    makeRidge(w, farBase, far, noise, 0, 0.35, 0, 11),
    makeRidge(w, midBase, mid, noise, 1, 0.6, 0, 23),
    makeRidge(w, nearBase, near, noise, 2, 1, 0, 37),
  ];

  // Sun by day (east = left), moon at night (rises ~6h before its transit, which lags noon by phase·24h).
  const r0 = clamp(0.034 * Math.min(w, h * 1.3), 9, 24);
  let body: Layout['body'];
  const highest = (x: number) => Math.min(...ridges.map((r) => ridgeAt(r, x)));
  if (env.tod !== 'night') {
    let u = (env.hour - 6) / 12;
    if (env.tod === 'dawn') u = clamp(u, -0.02, 0.2);
    else if (env.tod === 'dusk') u = clamp(u, 0.8, 1.02);
    else u = clamp(u, 0.12, 0.88);
    let x = w * lerp(0.07, 0.93, clamp(u, 0, 1));
    const alt = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u, 0, 1))), 0.8);
    let y = lerp(hz - Hz * 0.12, skyTop + Hz * 0.05, alt);
    // a low sun rests on the hills rather than showing through their thin wash: slide it
    // toward open sky first, and only lift it if the hills fill the whole way
    const clearAt = (cx: number) => {
      let top = Infinity;
      for (let dx = -r0; dx <= r0; dx += r0 / 3) top = Math.min(top, highest(cx + dx));
      return top - r0 * 0.85;
    };
    const dir = x < w / 2 ? 1 : -1;
    for (let k = 0; k < 40 && clearAt(x) < y && Math.abs(x - w * lerp(0.07, 0.93, clamp(u, 0, 1))) < w * 0.35; k++) x += dir * r0 * 0.5;
    y = Math.min(y, clearAt(x));
    body = { kind: 'sun', x, y: Math.max(r0 * 1.5, y), r: r0 };
  } else {
    const transit = 12 + env.moonPhase * 24;
    let u = ((((env.hour - (transit - 6)) % 24) + 24) % 24) / 12;
    const lit = (1 - Math.cos(2 * Math.PI * env.moonPhase)) / 2;
    if (u > 1 || lit < 0.03) body = { kind: 'moon', x: 0, y: 0, r: 0 };
    else {
      u = clamp(u, 0.08, 0.92);
      const x = w * lerp(0.08, 0.92, u);
      const alt = Math.pow(Math.sin(Math.PI * u), 0.7);
      let y = lerp(hz - Hz * 0.25, skyTop + Hz * 0.02, alt);
      const rm = r0 * 0.9;
      y = Math.min(y, highest(x) - rm * 1.8); // keep the moon in open sky
      body = { kind: 'moon', x, y: Math.max(rm * 1.6, y), r: rm };
    }
  }

  const L: Layout = { w, h, groundY, pondTop, hz, skyTop, side, ridges, body };
  if (layoutCache.size > 12) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, L);
  return L;
}

// ---------------------------------------------------------------------------
// palette per season / time

interface Palette {
  hills: [RGB, RGB, RGB];
  tones: [number, number, number];
  ground: RGB;
  grass: RGB;
}

function palette(season: Season, tod: TimeOfDay): Palette {
  const inkIndigo = (t: number) => mixRgb(INK, INDIGO, t);
  let hills: [RGB, RGB, RGB];
  let tones: [number, number, number] = [0.13, 0.26, 0.34];
  let ground: RGB = mixRgb(INK, OCHRE, 0.35);
  let grass: RGB = INK;
  switch (season) {
    case 'spring':
      hills = [inkIndigo(0.85), mixRgb(inkIndigo(0.55), MALACHITE, 0.3), mixRgb(INK, MALACHITE, 0.3)];
      grass = mixRgb(INK, MALACHITE, 0.35);
      break;
    case 'summer':
      hills = [inkIndigo(0.9), mixRgb(inkIndigo(0.5), MALACHITE, 0.45), mixRgb(INK, MALACHITE, 0.4)];
      grass = mixRgb(INK, MALACHITE, 0.45);
      tones = [0.14, 0.28, 0.36];
      break;
    case 'autumn': // 浅绛: indigo distance, ochre near slopes
      hills = [inkIndigo(0.7), mixRgb(INK, OCHRE, 0.45), mixRgb(INK, OCHRE, 0.6)];
      ground = mixRgb(INK, OCHRE, 0.55);
      grass = mixRgb(INK, OCHRE, 0.45);
      break;
    default: // winter
      hills = [inkIndigo(0.5), inkIndigo(0.3), inkIndigo(0.15)];
      tones = [0.12, 0.2, 0.3];
      ground = inkIndigo(0.2);
      break;
  }
  if (tod === 'dusk') hills[0] = mixRgb(hills[0], OCHRE, 0.35);
  if (tod === 'dawn') hills[0] = mixRgb(hills[0], ROUGE, 0.15);
  if (tod === 'night') {
    hills = hills.map((c) => mixRgb(c, INDIGO, 0.45)) as [RGB, RGB, RGB];
    tones = tones.map((t) => t * 1.25) as [number, number, number];
  }
  return { hills, tones, ground, grass };
}

// ---------------------------------------------------------------------------
// the backdrop

/** Wall-clock ms spent in each stage of the last paintBackdrop (for the lab). */
export const backdropTimings: Record<string, number> = {};

/** Everything behind the plants. Expensive — call once per size/env change and cache. */
export function paintBackdrop(w: number, h: number, dpr: number, env: SceneEnv): Backdrop {
  const c = makeCanvas(w * dpr, h * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const tp = performance.now();
  fillPaper(ctx, w, h, env.seed);
  const tPaper = performance.now() - tp;
  const L = sceneLayout(w, h, env);
  const pal = palette(env.season, env.tod);
  const rng = makeRng(mixSeed(env.seed, 0x6ac3));
  const noise = makeNoise2(mixSeed(env.seed, 0x51));
  // field resolution: ~0.25 device px per field px for washes (they are soft anyway)
  const fr = (k: number) => clamp(k * dpr, 0.12, 0.75);

  const T = backdropTimings;
  let t0 = performance.now();
  const lap = (k: string) => { const t1 = performance.now(); T[k] = (T[k] ?? 0) + t1 - t0; t0 = t1; };
  for (const k of Object.keys(T)) delete T[k];
  paintSky(ctx, L, env, noise, fr(0.2));
  paintBody(ctx, L, env, noise);
  lap('sky');
  for (let i = 0; i < 3; i++) {
    const R = L.ridges[i];
    paintHillWash(ctx, L, R, pal.hills[i], pal.tones[i], env, noise, fr([0.2, 0.28, 0.4][i]));
    lap('hills');
    if (i === 1) paintMiDots(ctx, L, R, pal, env, rng.fork(1), noise);
    if (i === 2) paintHempStrokes(ctx, L, R, pal, env, rng.fork(2), noise);
    lap('texture');
  }
  paintGround(ctx, L, pal, env, rng.fork(3), noise, fr(0.35));
  lap('ground');
  T.paper = tPaper;
  return { canvas: c, groundY: L.groundY, pondTop: L.pondTop, side: L.side, body: { ...L.body } };
}

function paintSky(ctx: CanvasRenderingContext2D, L: Layout, env: SceneEnv, noise: Noise2, res: number) {
  const { w, hz, skyTop } = L;
  const b = L.body;
  const winter = env.season === 'winter';
  let top = 0, horizon = 0, col: RGB = INK;
  let warm = 0, warmCol: RGB = ROUGE;
  switch (env.tod) {
    case 'night': top = 0.34; horizon = 0.1; col = mixRgb(INK, INDIGO, 0.75); break;
    case 'dawn': top = 0.03; horizon = 0; col = INDIGO; warm = 0.1; warmCol = mixRgb(ROUGE, CINNABAR, 0.3); break;
    case 'dusk': top = 0.04; horizon = 0; col = mixRgb(INK, INDIGO, 0.6); warm = 0.13; warmCol = mixRgb(OCHRE, GAMBOGE, 0.35); break;
    default: top = env.season === 'summer' ? 0.025 : 0; horizon = 0; col = INDIGO;
  }
  if (winter && env.tod !== 'night') { top += 0.1; horizon += 0.02; col = mixRgb(INK, INDIGO, 0.25); }
  if (top <= 0 && warm <= 0) return;
  const bottom = L.groundY;
  const haloR = b.r > 0 ? b.r * (b.kind === 'moon' ? 5 : 7) : 1;
  paintField(ctx, 0, 0, w, bottom, res, (x, y, out) => {
    const v = clamp((y - skyTop * 0.3) / (hz - skyTop * 0.3), 0, 1);
    // layered, horizontally streaked wash (渲染), a little uneven like real ink
    const m = 0.78 + 0.32 * noise.fbm(x / 260, y / 70, 3) + 0.12 * noise(x / 60, y / 14);
    let a = lerp(top, horizon, Math.pow(v, 0.8)) * m;
    let r = col[0], g = col[1], bl = col[2];
    if (b.r > 0) {
      const dx = x - b.x, dy = y - b.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (b.kind === 'moon') {
        // 烘云托月 — the wash thins out around the moon, and a few long cloud wisps catch its light
        a *= 1 - 0.8 * Math.exp(-((dd / haloR) ** 2)) * (0.85 + 0.15 * noise(x / 30, y / 30));
        const wisp = Math.max(0, noise(x / 320 + 3.3, y / 18)) * Math.exp(-(((y - b.y) / (haloR * 1.4)) ** 2));
        a *= 1 - 0.5 * smoothstep(0.22, 0.5, wisp);
      }
    }
    if (warm > 0) {
      // warm band hugging the horizon, stronger toward the sun
      const band = Math.exp(-(((y - (hz - (hz - skyTop) * 0.22)) / ((hz - skyTop) * 0.28)) ** 2));
      const near = b.r > 0 ? Math.exp(-(((x - b.x) / (w * 0.45)) ** 2)) : 0.5;
      const aw = warm * band * (0.35 + 0.65 * near) * (0.75 + 0.4 * noise.fbm(x / 200 + 5, y / 40, 2));
      const at = a + aw;
      if (at > 0) {
        r = (r * a + warmCol[0] * aw) / at; g = (g * a + warmCol[1] * aw) / at; bl = (bl * a + warmCol[2] * aw) / at;
      }
      a = at;
    }
    // the sky dissolves into the lowest mist, which stays paper
    a *= 1 - smoothstep(hz - (hz - skyTop) * 0.1, L.groundY, y);
    out[0] = r; out[1] = g; out[2] = bl; out[3] = a;
  });
}

function paintBody(ctx: CanvasRenderingContext2D, L: Layout, env: SceneEnv, noise: Noise2) {
  const b = L.body;
  if (b.r <= 0) return;
  ctx.save();
  if (b.kind === 'sun') {
    const a = env.tod === 'day' ? 0.34 : 0.5;
    const col = env.tod === 'dawn' ? mixRgb(CINNABAR, ROUGE, 0.3) : env.tod === 'dusk' ? mixRgb(CINNABAR, [214, 85, 58], 0.5) : CINNABAR;
    const R = b.r * 1.6;
    paintField(ctx, b.x - R, b.y - R, R * 2, R * 2, clamp(3 / b.r * 4, 0.6, 2), (x, y, out) => {
      const ang = Math.atan2(y - b.y, x - b.x);
      const dd = Math.hypot(x - b.x, y - b.y) / (b.r * (1 + 0.025 * noise(Math.cos(ang) * 2, Math.sin(ang) * 2 + 9)));
      const mott = 0.82 + 0.18 * noise(x / 5, y / 5) + 0.12 * smoothstep(0.7, 0.98, dd);
      const core = (1 - smoothstep(0.95, 1.02, dd)) * mott;
      const glow = Math.exp(-(((dd - 1) * 2.6) ** 2)) * 0.12 * (dd > 1 ? 1 : 0);
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
      out[3] = a * core + a * glow;
    });
  } else {
    // moon: lead-white lit part, the dark limb a faint earthshine
    const phase = env.moonPhase;
    ctx.fillStyle = 'rgba(40,52,70,0.1)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${LEADWHITE.join(',')},0.96)`;
    moonPath(ctx, b.x, b.y, b.r, phase);
    ctx.fill();
    // a thin rim so the disc reads against the thinned wash
    ctx.strokeStyle = 'rgba(40,52,70,0.1)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 0.3, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function moonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, phase: number) {
  const p = ((phase % 1) + 1) % 1;
  const waxing = p < 0.5;
  const k = Math.cos(2 * Math.PI * p); // 1 new · −1 full
  const s = waxing ? 1 : -1;
  const rx = Math.max(0.001, r * Math.abs(k));
  const dir = k > 0 ? s : -s;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
  if (dir > 0) ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
  else ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
  ctx.closePath();
}

/** Ink alpha (0..1, before tone) of a hill layer at (x, y), shared by the wash and the texture strokes. */
function hillDensity(L: Layout, R: Ridge, x: number, y: number, noise: Noise2): number {
  const r = ridgeAt(R, x);
  if (y < r - 1) return 0;
  const H = R.base - r;
  if (H < 2) return 0;
  const d = y - r;
  const edge = smoothstep(-1, 0.8, d);
  // the base curls away into cloud: warp the fade line with noise
  const warp = noise.fbm(x / 70 + R.depth * 9, y / 28, 3) * H * 0.35;
  const fade = 1 - smoothstep(r + H * (R.depth === 2 ? 0.3 : 0.18), R.base + H * 0.1, y + warp);
  if (fade <= 0) return 0;
  // ridge darker (墨色 at the crest), body lighter
  const crest = R.depth === 1
    ? 0.45 + 0.55 * Math.exp(-d / (3 + H * 0.16))
    : 0.55 + 0.45 * Math.exp(-d / (2.5 + H * 0.05));
  let a = edge * fade * crest;
  if (R.depth === 1) {
    // a belt of cloud crossing the cloudy peaks, in patches (米氏云山)
    const yb = r + H * 0.5 + noise(x / 70, 4.4) * H * 0.2 + noise(x / 23, 8.1) * H * 0.05;
    const dy = y - yb;
    const band = Math.exp(-((dy / ((dy < 0 ? 0.06 : 0.16) * H + 3)) ** 2));
    const patch = smoothstep(-0.2, 0.3, noise(x / 140 + 3, 1.7));
    a *= 1 - 0.95 * band * patch;
  }
  void L;
  return a;
}

function paintHillWash(ctx: CanvasRenderingContext2D, L: Layout, R: Ridge, col: RGB, tone: number, env: SceneEnv, noise: Noise2, res: number) {
  let top = Infinity;
  for (let i = 0; i < R.ys.length; i++) top = Math.min(top, R.ys[i]);
  if (!isFinite(top) || top >= R.base - 2) return;
  const y0 = Math.max(0, top - 4), y1 = Math.min(L.h, R.base + (R.base - top) * 0.45);
  const snow = env.season === 'winter';
  const washed = snow || env.tod === 'night' || env.tod === 'dusk' || env.tod === 'dawn';
  paintField(ctx, 0, y0, L.w, y1 - y0, res, (x, y, out) => {
    const dens = hillDensity(L, R, x, y, noise) * (1 - smoothstep(y1 - (y1 - y0) * 0.12, y1, y));
    if (dens <= 0) return;
    const r = ridgeAt(R, x);
    const d = y - r;
    const H = R.base - r;
    // light from the upper left: slopes rising to the right face the light, the others turn away
    // (slope of the ridge, smoothed more with depth so it shapes flanks, not columns)
    const win = 6 + d * 0.6;
    const sl = (ridgeAt(R, x + win) - ridgeAt(R, x - win)) / (2 * win);
    const shade = clamp(0.5 + sl * 1.6, 0, 1);
    // gullies flow down the slope (sheared streaks), plus a fine wet mottle
    const gully = noise(x / (7 + R.depth * 3) - (d * sl) / 9, y / 22 + R.depth * 5);
    const mott = 0.8 + 0.3 * noise(x / 40 - y / 90, y / 13) + 0.1 * noise(x / 6, y / 5);
    const struct = R.depth === 0 ? 1
      : R.depth === 1 ? (0.75 + 0.4 * shade) * (0.85 + 0.3 * noise(x / 50, y / 9))
      : (0.62 + 0.55 * shade) * (0.88 + 0.22 * gully * Math.min(1, d / 8));
    let ink = dens * tone * mott * struct;
    let white = 0;
    if (snow) {
      // 雪景: ridges keep the paper, gullies and the lower flanks take the ink
      const cap = smoothstep(H * 0.04, H * 0.3, d);
      const gully = Math.max(0, noise(x / 12, y / 26 + R.depth * 3));
      ink *= cap * (0.55 + 1.4 * gully);
      white = dens * 0.9;
    } else if (washed) {
      // mountains stand in front of a tinted sky: occlude it a little with paper
      white = dens * (env.tod === 'night' ? 0.2 : 0.45) * (1 - smoothstep(0, H * 0.6, d));
    }
    const a = ink + white * (1 - ink);
    if (a <= 0) return;
    out[0] = (col[0] * ink + LEADWHITE[0] * white * (1 - ink)) / a;
    out[1] = (col[1] * ink + LEADWHITE[1] * white * (1 - ink)) / a;
    out[2] = (col[2] * ink + LEADWHITE[2] * white * (1 - ink)) / a;
    out[3] = a;
  });
}

const P = (x: number, y: number, w: number): StrokePoint => ({ x, y, w });

/** 米点皴 — horizontal dabs clustered along the cloudy peaks' crests. */
function paintMiDots(ctx: CanvasRenderingContext2D, L: Layout, R: Ridge, pal: Palette, env: SceneEnv, rng: Rng, noise: Noise2) {
  const col = rgbHex(mixRgb(pal.hills[1], INK, 0.35));
  const snow = env.season === 'winter';
  const scale = clamp(Math.sqrt(L.w * L.h) / 820, 0.6, 1.3);
  // 积墨: clusters of wet horizontal dabs — pale, broad ones first, then smaller, darker ones
  // crowding the crests and the shadowed flanks. Clusters fuse into masses and leave gaps.
  // The first two passes are painted wet-in-wet: onto a half-resolution layer that is then
  // laid down smoothly upscaled, so the dabs bleed into one another (破墨). The last pass —
  // small dark accents on the crests — goes on crisp, once the "paper has dried".
  const limit = Math.round(clamp(L.w * 0.7, 160, 800) * (snow ? 0.5 : 1));
  const clusters = Math.round(limit / 8);
  const m = ctx.getTransform();
  const dev = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const k = dev * 0.5;
  const wet = makeCanvas(L.w * k, L.h * k);
  const wctx = wet.getContext('2d')!;
  wctx.scale(k, k);
  let count = 0;
  const xs: number[] = [];
  let Hmax = 1;
  for (let x = 0; x < L.w; x += 4) {
    const H = R.base - ridgeAt(R, x);
    if (H > 16) xs.push(x);
    Hmax = Math.max(Hmax, H);
  }
  if (xs.length) {
    // in snow only the dark accents remain — rock and scrub showing through (雪景)
    for (let pass = snow ? 2 : 0; pass < 3 && count < limit; pass++) {
      if (pass === 2) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(wet, 0, 0, L.w, L.h);
        ctx.restore();
      }
      const target = pass < 2 ? wctx : ctx;
      const nc = Math.round(clusters * [0.4, 0.38, 0.22][pass] * 1.6);
      for (let c = 0; c < nc; c++) {
        const cx = rng.pick(xs) + rng.range(-4, 4);
        const r = ridgeAt(R, cx);
        const H = R.base - r;
        // tall masses carry the dabs; thin saddles stay wash (no dotted "trails")
        if (H < 30 * scale || rng() > H / Hmax) continue;
        const sl = (ridgeAt(R, cx + 4) - ridgeAt(R, cx - 4)) / 8;
        // shadowed (right-facing) flanks and the crest collect the ink; lit flanks stay wash
        if (sl < -0.05 && rng.chance(pass === 2 ? 0.6 : 0.4)) continue;
        const depthK = (snow ? 0.3 : [0.3, 0.17, 0.06][pass]) * (sl > 0 ? 1.2 : 0.8);
        const cy = r + 2 + Math.abs(rng.gauss()) * H * depthK;
        const dens = hillDensity(L, R, cx, cy, noise);
        if (dens < 0.3) continue;
        if (snow && cy - r < H * 0.1) continue;
        const nd = rng.int(3, pass === 2 ? 6 : 9);
        const spread = [15, 11, 6][pass] * scale;
        for (let q = 0; q < nd; q++) {
          const x = cx + rng.gauss() * spread;
          const rr = ridgeAt(R, x);
          const y = Math.max(rr + 1.5, cy + rng.gauss() * spread * 0.35 + (rr - r) * 0.8);
          const len = [13, 9.5, 6][pass] * scale * rng.range(0.6, 1.4);
          const wd = [6, 4.4, 2.8][pass] * scale * rng.range(0.75, 1.25);
          const tone = clamp(pal.tones[1] * [0.75, 1.35, 1.9][pass] * rng.range(0.7, 1.25) * (0.5 + 0.5 * dens), 0.08, 0.6);
          const tilt = rng.range(-0.12, 0.08) * len;
          paintStroke(target, {
            kind: 'brush', tone, color: col, birth: 0, seed: rng.int(1, 1e9), wet: 0.85,
            pts: [P(x - len / 2, y - tilt / 2 + 0.3, wd * 0.75), P(x - len * 0.08, y, wd), P(x + len / 2, y + tilt / 2 - 0.2, wd * 0.3)],
          });
          count++;
        }
      }
    }
  }
  // an optional pagoda on a secondary crest — a tiny sign of people in the hills
  if (rng.chance(0.45)) {
    const u = L.side < 0 ? rng.range(0.22, 0.42) : 1 - rng.range(0.22, 0.42);
    let x = u * Math.min(L.w, L.h * 1.55);
    if (L.side > 0) x = L.w - (1 - u) * Math.min(L.w, L.h * 1.55);
    const r = ridgeAt(R, x);
    if (R.base - r > 30) paintPagoda(ctx, x, r + 1.5, scale, rng, rgbHex(mixRgb(pal.hills[1], INK, 0.6)));
  }
}

function paintPagoda(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng, col: string) {
  const tiers = rng.int(5, 7);
  const hTier = 2.1 * s;
  let wd = 5.2 * s;
  let yy = y;
  // body
  paintStroke(ctx, { kind: 'brush', tone: 0.35, color: col, birth: 0, seed: rng.int(1, 1e9), pts: [P(x, y, 2.6 * s), P(x, y - tiers * hTier, 1.2 * s)] });
  for (let i = 0; i < tiers; i++) {
    paintStroke(ctx, { kind: 'line', tone: 0.55, color: col, birth: 0, seed: rng.int(1, 1e9), pts: [P(x - wd / 2, yy - 0.4 * s, 0.5 * s), P(x, yy - 0.9 * s, 0.9 * s), P(x + wd / 2, yy - 0.4 * s, 0.5 * s)] });
    yy -= hTier;
    wd *= 0.87;
  }
  paintStroke(ctx, { kind: 'line', tone: 0.5, color: col, birth: 0, seed: rng.int(1, 1e9), pts: [P(x, yy, 0.6 * s), P(x, yy - 3 * s, 0.3 * s)] });
}

/** 披麻皴 on the near slopes, a broken crest line, distant trees and moss dots. */
function paintHempStrokes(ctx: CanvasRenderingContext2D, L: Layout, R: Ridge, pal: Palette, env: SceneEnv, rng: Rng, noise: Noise2) {
  const col = rgbHex(mixRgb(pal.hills[2], INK, 0.4));
  const dark = rgbHex(INK);
  const snow = env.season === 'winter';
  const scale = clamp(Math.sqrt(L.w * L.h) / 820, 0.6, 1.3);
  // where is this layer tall enough to texture?
  const xs: number[] = [];
  for (let x = 0; x < L.w; x += 3) if (R.base - ridgeAt(R, x) > 14) xs.push(x);
  if (!xs.length) return;
  const slope = (x: number) => (ridgeAt(R, x + 3) - ridgeAt(R, x - 3)) / 6;

  // crest: a few broken brush segments following the ridge, heavier where it turns
  let x = xs[0];
  const xEnd = xs[xs.length - 1];
  while (x < xEnd) {
    const len = rng.range(30, 80) * scale;
    const pts: StrokePoint[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const xx = Math.min(xEnd, x + (len * i) / n);
      const t = i / n;
      pts.push(P(xx, ridgeAt(R, xx) + 0.8, (0.8 + 2 * Math.sin(Math.PI * (0.1 + 0.8 * t))) * scale * (snow ? 0.8 : 1)));
    }
    if (R.base - ridgeAt(R, x + len / 2) > 18) paintStroke(ctx, { kind: rng.chance(0.4) ? 'dry' : 'brush', tone: pal.tones[2] * 1.7, color: col, birth: 0, seed: rng.int(1, 1e9), dryness: 0.5, pts });
    x += len + rng.range(8, 40) * scale;
  }

  // 披麻皴: bundles of long, gently S-curved, roughly parallel strokes running down the slopes
  const bundles = Math.round(clamp(xs.length / 10, 6, 24));
  for (let b = 0; b < bundles; b++) {
    const bx = rng.pick(xs);
    const r0 = ridgeAt(R, bx);
    const H = R.base - r0;
    const sl = slope(bx);
    const lean = clamp(sl * 0.8, -1.1, 1.1);
    const bend = rng.range(0.12, 0.35) * (rng.chance(0.5) ? 1 : -1);
    const len0 = rng.range(0.22, 0.5) * H;
    const n = rng.int(3, 5);
    const gap = rng.range(3, 5.5) * scale;
    const start = rng.range(0.03, 0.2);
    for (let k = 0; k < n; k++) {
      const sx = bx + (k - (n - 1) / 2) * gap + rng.range(-1, 1);
      const r = ridgeAt(R, sx);
      let y = r + (start + rng.range(-0.02, 0.05)) * H;
      if (snow && y - r < H * 0.14) y = r + H * rng.range(0.14, 0.25);
      const len = len0 * rng.range(0.7, 1.1);
      const pts: StrokePoint[] = [];
      const m = 8;
      const wd = rng.range(1.1, 2) * scale;
      for (let i = 0; i <= m; i++) {
        const t = i / m;
        const px = sx + lean * len * t * 0.8 + Math.sin(t * Math.PI) * bend * len * 0.3;
        pts.push(P(px, y + len * t, wd * (i === 0 ? 0.7 : 1 - 0.75 * t)));
      }
      const dens = hillDensity(L, R, pts[1].x, pts[1].y, noise);
      if (dens < 0.2) continue;
      paintStroke(ctx, { kind: rng.chance(0.5) ? 'dry' : 'brush', tone: clamp(pal.tones[2] * rng.range(0.9, 1.4) * (0.4 + 0.6 * dens), 0.1, 0.5), color: col, birth: 0, seed: rng.int(1, 1e9), dryness: 0.75, pts });
    }
  }

  // distant trees along the nearest crest (远树): trunk tick + a few dots
  const nTrees = rng.int(3, 7);
  const cx = rng.pick(xs);
  for (let i = 0; i < nTrees; i++) {
    const tx = cx + rng.gauss() * 14 * scale;
    const r = ridgeAt(R, tx);
    if (R.base - r < 16) continue;
    const th = rng.range(4, 8) * scale;
    const ty = r + rng.range(0.5, 2.5);
    paintStroke(ctx, { kind: 'brush', tone: 0.5, color: dark, birth: 0, seed: rng.int(1, 1e9), pts: [P(tx, ty, 0.9 * scale), P(tx + rng.range(-0.8, 0.8), ty - th, 0.3 * scale)] });
    const nd = rng.int(3, 6);
    for (let j = 0; j < nd; j++) {
      paintStroke(ctx, { kind: 'dot', tone: rng.range(0.35, 0.6), color: dark, birth: 0, seed: rng.int(1, 1e9), pts: [P(tx + rng.gauss() * 1.6 * scale, ty - th * rng.range(0.55, 1.05), rng.range(1.6, 3) * scale)] });
    }
  }

  // moss dots on the crest (点苔)
  const nMoss = Math.round(clamp(xs.length / 12, 5, 22));
  for (let i = 0; i < nMoss; i++) {
    const mx = rng.pick(xs) + rng.range(-3, 3);
    const r = ridgeAt(R, mx);
    const cl = rng.int(1, 3);
    for (let j = 0; j < cl; j++) {
      paintStroke(ctx, { kind: 'dot', tone: rng.range(0.55, 0.85), color: dark, birth: 0, seed: rng.int(1, 1e9), pts: [P(mx + j * rng.range(2, 3.5) * scale, r + rng.range(-0.5, 1.5), rng.range(1.3, 2.4) * scale)] });
    }
  }
}

/** A quiet ground band: soft wash, bank edge above the pond, tufts and moss dots. */
function paintGround(ctx: CanvasRenderingContext2D, L: Layout, pal: Palette, env: SceneEnv, rng: Rng, noise: Noise2, res: number) {
  const { w, h, groundY: gy, pondTop: pt } = L;
  const snow = env.season === 'winter';
  const scale = clamp(h / 520, 0.75, 1.3);
  const col = pal.ground;
  // wash: darkest just under the ground line, thinning toward the bank; the pond below gets a
  // whisper of water tone so the scene reads before the pond is painted over it.
  const water = env.tod === 'night' ? mixRgb(INK, INDIGO, 0.6) : INDIGO;
  paintField(ctx, 0, gy - 12 * scale, w, h - gy + 12 * scale, res, (x, y, out) => {
    const lineY = gy + noise(x / 50, 2.2) * 1.6;
    const d = y - lineY;
    if (y < pt) {
      let a: number;
      if (d < 0) a = 0.55 * Math.exp(-((d / (2.2 * scale)) ** 2)) * (0.5 + 0.5 * noise(x / 9, 5.5));
      else a = 0.55 * (0.5 + 0.5 * Math.exp(-d / (4 * scale))) * (0.75 + 0.35 * noise(x / 26, y / 6));
      let t = pal.tones[2] * (env.tod === 'night' ? 1.1 : 0.75);
      if (snow) t *= d < 0 ? 0.5 : 0.35 + 0.65 * smoothstep(0, pt - gy, d); // snow lies on the ground
      a *= t * (1 - 0.8 * smoothstep(pt - 3, pt + 1, y));
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = a;
    } else {
      const dd = y - pt;
      const a = (0.045 + 0.08 * Math.exp(-dd / 6)) * (0.75 + 0.4 * noise(x / 120, y / 16));
      out[0] = water[0]; out[1] = water[1]; out[2] = water[2]; out[3] = a;
    }
  });
  const ink = rgbHex(INK);
  const grass = rgbHex(pal.grass);
  // bank lip: a long, slightly wavering dry line where earth meets water (方塘 edge)
  let x = -10;
  while (x < w + 10) {
    const len = rng.range(60, 180) * scale;
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const xx = x + len * t;
      pts.push(P(xx, pt - 0.5 + noise(xx / 40, 9.1) * 1.2, (0.5 + 1.2 * Math.sin(Math.PI * t) ** 0.7) * scale));
    }
    paintStroke(ctx, { kind: 'dry', tone: snow ? 0.55 : 0.42, color: ink, birth: 0, seed: rng.int(1, 1e9), dryness: 0.55, pts });
    x += len + rng.range(6, 50) * scale;
  }
  // 折带 texture on the bank face: a few short horizontal dry strokes
  const nt = Math.round(w / 90);
  for (let i = 0; i < nt; i++) {
    const sx = rng() * w;
    const sy = lerp(gy + 2, pt - 2, rng());
    const len = rng.range(10, 30) * scale;
    paintStroke(ctx, { kind: 'dry', tone: rng.range(0.15, 0.3), color: rgbHex(col), birth: 0, seed: rng.int(1, 1e9), dryness: 0.8,
      pts: [P(sx, sy, 0.9 * scale), P(sx + len * 0.5, sy + rng.range(-1, 1), 1.1 * scale), P(sx + len, sy + rng.range(-0.5, 1.5), 0.2 * scale)] });
  }
  // grass tufts, sparse, in odd-numbered clumps
  const clumps = Math.round(clamp(w / 70, 4, 22) * (snow ? 0.5 : 1));
  for (let i = 0; i < clumps; i++) {
    const cx = rng() * w;
    const blades = rng.pick([3, 3, 5, 5, 7]);
    const lenMax = rng.range(5, 11) * scale * (snow ? 0.6 : 1) * (env.season === 'summer' ? 1.3 : 1);
    for (let b = 0; b < blades; b++) {
      const bx = cx + rng.gauss() * 3 * scale;
      const by = gy + 1 + rng.range(-0.5, 1.2);
      const lean = rng.range(-0.8, 0.8) + (bx - cx) * 0.06;
      const len = lenMax * rng.range(0.45, 1);
      paintStroke(ctx, { kind: 'brush', tone: rng.range(0.4, 0.75), color: rng.chance(0.6) ? grass : ink, birth: 0, seed: rng.int(1, 1e9),
        pts: [P(bx, by, 1.1 * scale), P(bx + lean * len * 0.35, by - len * 0.55, 0.8 * scale), P(bx + lean * len * 0.8, by - len, 0.1)] });
    }
  }
  // moss dots, clustered in twos and threes
  const md = Math.round(clamp(w / 55, 6, 30));
  for (let i = 0; i < md; i++) {
    const cx = rng() * w;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      paintStroke(ctx, { kind: 'dot', tone: rng.range(0.6, 0.92), color: ink, birth: 0, seed: rng.int(1, 1e9), pts: [P(cx + k * rng.range(2.5, 4) * scale, gy + rng.range(-1, 2.5), rng.range(1.4, 2.8) * scale)] });
    }
  }
}

// ---------------------------------------------------------------------------
// rocks

/** A scholar's rock (太湖石) or a low riverbank boulder, as a Drawing (all strokes birth 0). */
export function rockDrawing(seed: number, size: number): Drawing {
  const rng = makeRng(mixSeed(seed, 0x70c4));
  const nz = makeNoise2(mixSeed(seed, 0x5eed));
  const taihu = rng.chance(0.42);
  const W = size;
  const H = taihu ? size * rng.range(1.0, 1.3) : size * rng.range(0.42, 0.6);
  const s = size / 100; // stroke scale
  const baseY = H * 0.96;
  type V = { x: number; y: number };

  // --- silhouette: a few key vertices joined by gently bulging edges (angular turns, 转折)
  const keys: V[] = [];
  if (!taihu) {
    const lx = W * rng.range(0.05, 0.12), rx = W * rng.range(0.88, 0.96);
    const peakX = W * rng.range(0.36, 0.62);
    keys.push({ x: lx + W * rng.range(0.02, 0.06), y: baseY });
    keys.push({ x: lx, y: baseY - H * rng.range(0.3, 0.5) });
    keys.push({ x: W * rng.range(0.14, 0.28), y: H * rng.range(0.12, 0.26) });
    keys.push({ x: peakX, y: H * rng.range(0.02, 0.08) });
    if (rng.chance(0.6)) keys.push({ x: lerp(peakX, rx, rng.range(0.4, 0.6)), y: H * rng.range(0.1, 0.22) });
    keys.push({ x: rx, y: baseY - H * rng.range(0.25, 0.5) });
    keys.push({ x: rx - W * rng.range(0.02, 0.06), y: baseY });
  } else {
    // lean, top-heavy, pinched: a wandering spine with a varying half-width
    const lean = rng.range(-0.16, 0.16) * W;
    const levels = 7;
    const spine = (v: number) => W / 2 + lean * v + Math.sin(v * Math.PI * rng.range(1.2, 1.8) + seed) * W * 0.05;
    // independent, lumpy left and right profiles; the waist wanders, the crown overhangs
    const waist = rng.range(0.25, 0.6);
    const prof = () => {
      const out: number[] = [];
      for (let i = 0; i <= levels; i++) {
        const v = i / levels;
        const pinch = 0.07 * Math.exp(-(((v - waist) / 0.16) ** 2));
        out.push(W * (0.15 + 0.1 * v - pinch + rng.range(-0.045, 0.05)));
      }
      return out;
    };
    const hl = prof(), hr = prof();
    const yAt = (v: number) => baseY - v * (baseY - H * 0.04);
    keys.push({ x: spine(0) - hl[0] * 0.9, y: baseY });
    for (let i = 1; i < levels; i++) keys.push({ x: spine(i / levels) - hl[i], y: yAt(i / levels) + rng.range(-0.03, 0.03) * H });
    keys.push({ x: spine(1) - hl[levels] * rng.range(0.3, 0.7), y: yAt(1) + rng.range(0, 0.06) * H });
    keys.push({ x: spine(1) + hr[levels] * rng.range(0.3, 0.7), y: yAt(1) + rng.range(0.02, 0.1) * H });
    for (let i = levels - 1; i >= 1; i--) keys.push({ x: spine(i / levels) + hr[i], y: yAt(i / levels) + rng.range(-0.03, 0.03) * H });
    keys.push({ x: spine(0) + hr[0] * 0.9, y: baseY });
  }
  const cx = keys.reduce((a, k) => a + k.x, 0) / keys.length;
  const cy = keys.reduce((a, k) => a + k.y, 0) / keys.length;
  const pts: V[] = [];
  const keyIdx: number[] = [];
  const nk = keys.length;
  for (let i = 0; i < nk; i++) {
    const a = keys[i], b = keys[(i + 1) % nk];
    const closing = i === nk - 1; // the base: straight, it sits in the ground
    const seg = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (4 * s)));
    // bulge outward from the centroid
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let ox = mx - cx, oy = my - cy;
    const ol = Math.hypot(ox, oy) || 1;
    ox /= ol; oy /= ol;
    const bulge = closing ? 0 : Math.hypot(b.x - a.x, b.y - a.y) * rng.range(0.04, taihu ? 0.2 : 0.14) * (rng.chance(taihu ? 0.25 : 0.1) ? -1 : 1);
    keyIdx.push(pts.length);
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const bb = Math.sin(Math.PI * t) * bulge;
      const j = closing ? 0 : nz(i * 3.1 + t * 2, 0.5) * 1.2 * s;
      pts.push({ x: lerp(a.x, b.x, t) + ox * (bb + j), y: Math.min(baseY + 0.5, lerp(a.y, b.y, t) + oy * (bb + j)) });
    }
  }
  const N = pts.length;
  const strokes: Stroke[] = [];
  const add = (st: Omit<Stroke, 'birth' | 'seed'>) => strokes.push({ ...st, birth: 0, seed: rng.int(1, 1e9) });
  const tint = rng.pick([PIGMENTS.ink, PIGMENTS.ink, PIGMENTS.ochre, PIGMENTS.indigo]);

  // 1 · a pale body wash
  add({ kind: 'wash', tone: tint === PIGMENTS.ink ? 0.09 : 0.14, color: tint, wet: 0.6, pts: pts.map((p) => P(p.x, p.y, 3 * s)) });

  // 2 · 石分三面: a facet line from the top turning down divides the lit face from the shadow side
  const topI = pts.reduce((bi, p, i) => (p.y < pts[bi].y ? i : bi), 0);
  const top = pts[topI];
  const facet: StrokePoint[] = [];
  {
    const endX = lerp(top.x, Math.max(...pts.map((p) => p.x)), rng.range(0.35, 0.6));
    const endY = lerp(top.y, baseY, rng.range(taihu ? 0.45 : 0.7, taihu ? 0.7 : 0.95));
    const m = 7;
    const bow = rng.range(-0.15, 0.1) * (endY - top.y);
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      const e = t * t * (3 - 2 * t);
      facet.push(P(lerp(top.x, endX, e) - Math.sin(Math.PI * t) * bow + (i === 0 ? 0 : nz(t * 3, 7) * 1.5 * s), lerp(top.y, endY, t), (0.4 + 2.2 * Math.sin(Math.PI * (0.15 + 0.7 * t))) * s));
    }
    // shadow face: the facet line, then the contour from its foot back up to the top
    const shade: StrokePoint[] = facet.map((p) => P(p.x, p.y, 4 * s));
    let footI = topI;
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      if (p.x < facet[facet.length - 1].x) continue;
      const d = Math.hypot(p.x - facet[facet.length - 1].x, p.y - facet[facet.length - 1].y);
      if (d < best) { best = d; footI = i; }
    }
    for (let i = footI; i !== topI; i = (i - 1 + N) % N) {
      shade.push(P(pts[i].x, pts[i].y, 4 * s));
      if (shade.length > N) break;
    }
    add({ kind: 'wash', tone: 0.17, wet: 0.7, pts: shade });
  }

  // 3 · holes (透 · 漏) for the scholar's rock — at clearly different heights, never a pair
  const holes: { x: number; y: number; rx: number; ry: number }[] = [];
  if (taihu) {
    const nh = rng.pick([1, 2, 2, 3]);
    const bands = [0.2, 0.45, 0.7].sort(() => rng() - 0.5);
    for (let hi = 0; hi < nh; hi++) {
      for (let tries = 0; tries < 20; tries++) {
        const hy = lerp(H * 0.08, baseY, bands[hi] + rng.range(-0.08, 0.08));
        const hx = cx + rng.range(-0.24, 0.24) * W;
        const big = hi === 0;
        const hrx = W * (big ? rng.range(0.07, 0.11) : rng.range(0.035, 0.06));
        const hry = hrx * rng.range(0.6, 1.2);
        if (![[-1.7, 0], [1.7, 0], [0, -1.8], [0, 1.8], [1.2, 1.2], [-1.2, -1.2]].every(([a, b]) => inside(pts, hx + a * hrx, hy + b * hry))) continue;
        if (holes.some((q) => Math.abs(q.x - hx) < W * 0.08)) continue;
        holes.push({ x: hx, y: hy, rx: hrx, ry: hry });
        break;
      }
    }
    for (const q of holes) {
      const rot = rng.range(-0.6, 0.6);
      const ring = (sc: number, n: number, a0 = 0, a1 = Math.PI * 2): StrokePoint[] => {
        const out: StrokePoint[] = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          const wob = 1 + 0.22 * nz(Math.cos(a) * 1.5 + q.x * 0.1, Math.sin(a) * 1.5 + q.y * 0.1);
          const ex = Math.cos(a) * q.rx * sc * wob, ey = Math.sin(a) * q.ry * sc * wob;
          out.push(P(q.x + ex * Math.cos(rot) - ey * Math.sin(rot), q.y + ex * Math.sin(rot) + ey * Math.cos(rot), 1));
        }
        return out;
      };
      add({ kind: 'wash', tone: 0.22, wet: 0.5, pts: ring(1, 18).slice(0, 18).map((p) => ({ ...p, w: 1.2 * s })) });
      // the cavity's shadow falls under the upper lip: a crescent, not a pupil
      const outer = ring(0.92, 10, Math.PI * 1.05, Math.PI * 1.95);
      const inner = ring(0.5, 10, Math.PI * 1.95, Math.PI * 1.05).map((p) => ({ ...p, y: p.y + q.ry * 0.2 }));
      add({ kind: 'wash', tone: 0.5, wet: 0.4, pts: [...outer, ...inner].map((p) => ({ ...p, w: 1 * s })) });
      const a0 = Math.PI * rng.range(0.7, 0.9), a1 = Math.PI * rng.range(1.9, 2.15);
      const lip = ring(1.05, 12, a0, a1);
      lip.forEach((p, i) => (p.w = (0.5 + 2 * Math.sin((Math.PI * i) / 12)) * s));
      add({ kind: 'brush', tone: 0.7, pts: lip, dryness: 0.35 });
    }
  }

  // 4 · contour: broken brush segments, pressed at the turns (提按), dry along the ground
  const isKey = new Set(keyIdx);
  let i = rng.int(0, 3);
  while (i < N) {
    const len = rng.int(8, 16);
    const seg: StrokePoint[] = [];
    for (let k = 0; k <= len && i + k <= N; k++) {
      const idx = (i + k) % N;
      const p = pts[idx];
      const t = k / len;
      const turn = isKey.has(idx) || isKey.has((idx + 1) % N) || isKey.has((idx - 1 + N) % N) ? 1.5 : 1;
      const shadow = p.x > cx ? 1.15 : 0.6;
      seg.push(P(p.x, p.y, (0.7 + 1.9 * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 0.8) * s * shadow * turn));
    }
    const onGround = seg.every((p) => p.y > baseY - 2);
    if (seg.length > 2) {
      if (onGround) add({ kind: 'dry', tone: 0.3, pts: seg.map((p) => ({ ...p, w: p.w * 0.6 })), dryness: 0.8 });
      else {
        const lit = seg.reduce((a, q) => a + q.x, 0) / seg.length < cx;
        add({ kind: lit || rng.chance(0.3) ? 'dry' : 'brush', tone: lit ? rng.range(0.5, 0.65) : rng.range(0.66, 0.85), pts: seg, dryness: rng.range(0.3, 0.6) });
      }
    }
    i += len + (rng.chance(0.35) ? rng.int(1, 3) : 0);
  }
  add({ kind: taihu ? 'dry' : 'brush', tone: taihu ? rng.range(0.35, 0.5) : rng.range(0.5, 0.7), pts: taihu ? facet.slice(0, 6) : facet, dryness: 0.55 });

  // 5 · 皴: dry strokes echoing the facet on the shadow side, and a fold or two on the lit face
  const nTex = taihu ? rng.int(3, 5) : rng.int(4, 7);
  for (let t = 0; t < nTex; t++) {
    const off = rng.range(0.15, 0.85);
    const k0 = rng.int(1, 3), k1 = Math.min(facet.length - 1, k0 + rng.int(2, 4));
    const dx = off * W * 0.28;
    const seg: StrokePoint[] = [];
    for (let k = k0; k <= k1; k++) {
      const q = facet[k];
      seg.push(P(q.x + dx + nz(k, t) * 2 * s, q.y + dx * 0.25, (0.5 + 1.1 * Math.sin((Math.PI * (k - k0)) / (k1 - k0 || 1))) * s));
    }
    if (seg.every((q) => inside(pts, q.x, q.y) && !holes.some((h) => Math.hypot(h.x - q.x, h.y - q.y) < h.rx * 1.4))) add({ kind: 'dry', tone: rng.range(0.28, 0.45), dryness: 0.8, pts: seg });
  }
  const folds = taihu ? rng.int(2, 4) : rng.int(1, 2);
  for (let f = 0; f < folds; f++) {
    const start = taihu ? rng.int(0, Math.round(N * 0.45)) : (topI + rng.int(-6, -2) + N) % N;
    const len = rng.int(5, 10);
    const k = rng.range(0.18, 0.4);
    const seg: StrokePoint[] = [];
    for (let j = 0; j <= len; j++) {
      const p = pts[(start + j) % N];
      seg.push(P(lerp(p.x, cx, k), lerp(p.y, cy, k * 0.5), (0.4 + 1.3 * Math.sin((Math.PI * j) / len)) * s));
    }
    if (seg.every((q) => inside(pts, q.x, q.y))) add({ kind: 'dry', tone: rng.range(0.3, 0.5), pts: seg, dryness: 0.7 });
  }

  // 6 · moss dots 苔点 on the crest and shoulders; a touch of malachite under some
  const nMoss = rng.int(4, 9);
  const crest = pts.map((p, idx) => ({ p, idx })).filter(({ p }) => p.y < lerp(top.y, baseY, taihu ? 0.35 : 0.3));
  for (let m = 0; m < nMoss && crest.length; m++) {
    const { p } = rng.pick(crest);
    const dx = rng.range(-1.5, 1.5) * s, dy = rng.range(-0.8, 1.5) * s;
    if (rng.chance(0.3)) add({ kind: 'dot', tone: 0.35, color: PIGMENTS.malachite, pts: [P(p.x + dx, p.y + dy, rng.range(3, 5) * s)] });
    const wd = rng.range(1.8, 3.4) * s;
    if (rng.chance(0.5)) add({ kind: 'dot', tone: rng.range(0.75, 0.95), pts: [P(p.x + dx, p.y + dy, wd)] });
    else add({ kind: 'brush', tone: rng.range(0.75, 0.95), pts: [P(p.x + dx - wd * 0.5, p.y + dy + 0.2 * s, wd * 0.7), P(p.x + dx + wd * 0.5, p.y + dy - 0.2 * s, wd * 0.4)] });
  }

  // 7 · a clump of grass at the foot
  const gx = rng.chance(0.5) ? keys[0].x : keys[nk - 1].x;
  for (let g = 0; g < rng.pick([3, 5]); g++) {
    const bx = gx + rng.gauss() * 2 * s, len = rng.range(6, 13) * s, lean = rng.range(-0.7, 0.7);
    add({ kind: 'brush', tone: rng.range(0.5, 0.8), pts: [P(bx, baseY, 1.2 * s), P(bx + lean * len * 0.4, baseY - len * 0.55, 0.8 * s), P(bx + lean * len, baseY - len, 0.1)] });
  }
  return { width: W, height: H, anchor: { x: (keys[0].x + keys[nk - 1].x) / 2, y: baseY }, strokes };
}

function inside(poly: { x: number; y: number }[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------------------
// the pond

export interface PondOptions {
  /** Pond rectangle in css px. */
  x: number; y: number; w: number; h: number;
  /** Seconds since start — drives ripples. */
  t: number;
  /** What to reflect: the painted scene above the pond (same css-px coordinate space, drawn at `dpr`). */
  source: CanvasImageSource;
  /** Mirror line in css px (usually the pond top). */
  mirrorY: number;
  clarity: number;
  dpr: number;
  /** Optional: the scene seed, so ripples and duckweed differ between gardens. Default 1. */
  seed?: number;
  /** Optional: night dims the sky glint. */
  tod?: TimeOfDay;
}

interface PondCache {
  key: string;
  pond: HTMLCanvasElement; pctx: CanvasRenderingContext2D;
  refl: HTMLCanvasElement; rctx: CanvasRenderingContext2D; rs: number; pr: number;
  tint: HTMLCanvasElement;
  water: HTMLCanvasElement;
  silt: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  ripples: { c: HTMLCanvasElement; w: number; h: number }[];
  glint: HTMLCanvasElement;
}
const pondCaches: PondCache[] = [];

function buildPondCache(o: PondOptions, key: string, full: boolean): PondCache {
  const { w, h, dpr } = o;
  const seed = o.seed ?? 1;
  const cl = Math.round(clamp(o.clarity, 0, 1) * 10) / 10;
  const pr = Math.min(dpr, 2);
  const pond = makeCanvas(w * pr, h * pr);
  const pctx = pond.getContext('2d')!;
  // reflections are softer than the thing reflected; murky water blurs them further
  const rs = Math.min(dpr, 2) * lerp(0.35, 0.8, cl);
  const refl = makeCanvas(w * rs, h * rs);
  const rctx = refl.getContext('2d')!;
  const noise = makeNoise2(mixSeed(seed, 0x90d));

  // water tone: a faint indigo breath, a darker shadow line right under the bank
  const tint = makeCanvas(w * 0.25 + 2, h * 0.25 + 2);
  {
    const tc = tint.getContext('2d')!;
    paintField(tc, 0, 0, tint.width, tint.height, 1, (x, y, out) => {
      const X = x * 4, Y = y * 4;
      const v = Y / h;
      const a = (0.035 + 0.05 * v) * (0.7 + 0.5 * noise.fbm(X / 140, Y / 18, 3)) + 0.2 * Math.exp(-Y / 3.5);
      out[0] = INDIGO[0] * 0.7; out[1] = INDIGO[1] * 0.75; out[2] = INDIGO[2] * 0.8; out[3] = a;
    });
  }
  // silt: an ochre-grey murk, pooling unevenly
  const silt = makeCanvas(w * 0.25 + 2, h * 0.25 + 2);
  {
    const sc = silt.getContext('2d')!;
    const col = mixRgb(OCHRE, [90, 88, 80], 0.5);
    paintField(sc, 0, 0, silt.width, silt.height, 1, (x, y, out) => {
      const X = x * 4, Y = y * 4;
      const n = noise.fbm(X / 80 + 40, Y / 22, 4);
      const a = 0.38 + 0.6 * n + 0.15 * (Y / h);
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = clamp(a, 0, 1);
    });
  }
  // bake the murk into the water tone: one blit per frame instead of two
  {
    const murk = (1 - cl) ** 1.3;
    if (murk > 0.02) {
      const tc = tint.getContext('2d')!;
      tc.globalAlpha = murk * 0.4;
      tc.drawImage(silt, 0, 0);
      tc.globalAlpha = 1;
    }
  }
  // upscale the water tone once, to the exact device size it is drawn at (a 1:1 blit per frame)
  const tr = full ? dpr : pr;
  const water = makeCanvas(w * tr, h * tr);
  {
    const wc = water.getContext('2d')!;
    wc.imageSmoothingEnabled = true;
    wc.imageSmoothingQuality = 'high';
    wc.drawImage(tint, 0, 0, tint.width - 2, tint.height - 2, 0, 0, water.width, water.height);
  }
  // mask: fade the side ends so the water sits in the paper, not in a box
  const mask = makeCanvas(w * pr, 4);
  {
    const mc = mask.getContext('2d')!;
    const g = mc.createLinearGradient(0, 0, mask.width, 0);
    const e = clamp(0.06 * w, 10, 40) / w;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(e, 'rgba(0,0,0,1)');
    g.addColorStop(1 - e, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mc.fillStyle = g;
    mc.fillRect(0, 0, mask.width, mask.height);
  }
  // 水纹: fine tapered wave lines, some doubled, painted with the brush engine
  const rng = makeRng(mixSeed(seed, 0x317));
  const ripples: PondCache['ripples'] = [];
  const res = Math.min(dpr, 2) * 1.5;
  for (let i = 0; i < 7; i++) {
    const len = rng.range(26, 70);
    const hh = 8;
    const c = makeCanvas((len + 6) * res, hh * res);
    const cc = c.getContext('2d')!;
    cc.scale(res, res);
    const lines = rng.chance(0.4) ? 2 : 1;
    for (let l = 0; l < lines; l++) {
      const pts: StrokePoint[] = [];
      const n = 14;
      const off = l * rng.range(2.2, 3);
      const ll = len * (l ? rng.range(0.4, 0.7) : 1);
      const x0 = 3 + (l ? rng.range(0, len - ll) : 0);
      const ph = rng.range(0, 6), fq = rng.range(2.5, 4.5);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push(P(x0 + ll * t, 3 + off * 0.6 + Math.sin(ph + t * fq * Math.PI) * 0.7, 1.1 * Math.sin(Math.PI * t) ** 0.8 + 0.05));
      }
      paintStroke(cc, { kind: 'line', tone: l ? 0.4 : 0.55, birth: 0, seed: rng.int(1, 1e9), pts });
    }
    ripples.push({ c, w: len + 6, h: hh });
  }
  // sky-light glint: soft white streaks (lighter than paper — the one place we use lead white)
  const glint = makeCanvas(128, 16);
  {
    const gc = glint.getContext('2d')!;
    paintField(gc, 0, 0, 128, 16, 1, (x, y, out) => {
      const u = (x - 64) / 64, v = (y - 8) / 3.2;
      const a = Math.exp(-u * u * 2.2 - v * v) * (0.7 + 0.3 * noise(x / 9, y / 3));
      out[0] = 255; out[1] = 253; out[2] = 246; out[3] = a;
    });
  }
  return { key, pond, pctx, refl, rctx, rs, pr, tint, water, silt, mask, ripples, glint };
}

const hash01 = (a: number, b: number) => mixSeed(a, b) / 4294967296;

/** Per-frame: water surface with a rippling reflection of `source`. Must be cheap (≤ ~2 ms). */
export function paintPond(ctx: CanvasRenderingContext2D, o: PondOptions): void {
  if (o.w < 2 || o.h < 2) return;
  const clarity = clamp(o.clarity, 0, 1);
  // A pond spanning the whole width is painted straight onto the scene; a narrower one goes
  // through its own layer so its ends can be feathered into the paper.
  const full = o.x <= 0.5 && o.x + o.w >= ctx.canvas.width / o.dpr - 0.5;
  const key = `${o.w}|${o.h}|${o.dpr}|${Math.round(clarity * 10)}|${o.seed ?? 1}|${full}`;
  // a few sizes stay cached (the garden, the scroll export…); most recent first
  let ci = pondCaches.findIndex((c) => c.key === key);
  if (ci < 0) {
    pondCaches.unshift(buildPondCache(o, key, full));
    if (pondCaches.length > 3) pondCaches.pop();
    ci = 0;
  }
  const C = pondCaches[ci];
  const { w, h, t, dpr } = o;
  const pr = C.pr;
  const seed = o.seed ?? 1;
  const night = o.tod === 'night';

  const __T: Record<string, number> = ((globalThis as any).__pondT ??= {});
  let __t0 = performance.now();
  const __lap = (k: string) => { (ctx as any).getImageData?.(0, 0, 1, 1); const t1 = performance.now(); __T[k] = (__T[k] ?? 0) + t1 - __t0; __t0 = t1; };
  // 1 · grab the mirrored band above the water once (safe even if source is the target canvas)
  const rctx = C.rctx;
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.clearRect(0, 0, C.refl.width, C.refl.height);
  const sy0 = Math.max(0, o.mirrorY - h);
  const shCss = o.mirrorY - sy0;
  if (shCss > 1) {
    rctx.setTransform(1, 0, 0, -1, 0, shCss * C.rs);
    rctx.drawImage(o.source as CanvasImageSource, o.x * dpr, sy0 * dpr, w * dpr, shCss * dpr, 0, 0, w * C.rs, shCss * C.rs);
    rctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  rctx.getImageData(0, 0, 1, 1); __lap('flip');
  // 2 · draw it in strips, displaced sideways by waves that grow toward the viewer
  let p: CanvasRenderingContext2D;
  if (full) {
    p = ctx;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  } else {
    p = C.pctx;
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.globalAlpha = 1;
    p.globalCompositeOperation = 'source-over';
    p.clearRect(0, 0, C.pond.width, C.pond.height);
    p.setTransform(pr, 0, 0, pr, 0, 0);
  }
  p.drawImage(C.water, 0, 0, w, h);
  __lap('tint');
  const ampK = lerp(1.35, 0.8, clarity);
  const a0 = lerp(0.12, 0.5, clarity);
  let y = 0;
  while (y < h) {
    const dn = y / h;
    const sh = 1.6 + 3.6 * dn;
    const ph = 5.5 / (dn + 0.1);
    const dx = ampK * (0.3 + 4.2 * dn) * (Math.sin(ph + t * 1.15) + 0.45 * Math.sin(ph * 2.3 - t * 0.8 + 1.7));
    // brief breaks in the reflection where a wave crest catches the sky
    const crest = Math.max(0, Math.sin(ph * 0.5 + t * 0.6 + 0.4)) ** 6;
    p.globalAlpha = a0 * (1 - 0.75 * dn ** 0.8) * (1 - 0.6 * crest);
    const syR = y * C.rs, shR = Math.min(sh, h - y) * C.rs;
    if (syR < C.refl.height && shR > 0) p.drawImage(C.refl, 0, syR, C.refl.width, Math.min(shR, C.refl.height - syR), dx, y, w, Math.min(sh, h - y));
    y += sh;
  }
  p.globalAlpha = 1;

  __lap('strips');
  // 3 · murk (silt clouds, a greyer surface) is baked into the water tone drawn first

  // 4 · 天光: sky-light glints near the far bank, breathing
  const gA = (night ? 0.35 : 0.8) * clarity ** 1.5;
  if (gA > 0.02) {
    for (let i = 0; i < 4; i++) {
      const gx = w * (0.12 + 0.76 * hash01(seed, i)) + Math.sin(t * 0.07 + i) * 12;
      const gy = h * (0.08 + 0.35 * hash01(seed, i + 9) ** 1.5);
      const gw = w * (0.18 + 0.2 * hash01(seed, i + 3)) * (0.6 + gy / h);
      p.globalAlpha = gA * (0.45 + 0.35 * Math.sin(t * 0.5 + i * 2.1));
      p.drawImage(C.glint, gx - gw / 2, gy - 3, gw, 6 + 6 * (gy / h));
    }
    p.globalAlpha = 1;
  }

  __lap('glint');
  // 5 · 水纹: slow ink wave lines, spaced in perspective (dense far, open near)
  const nr = Math.round(clamp(w / 45, 5, 14));
  for (let i = 0; i < nr; i++) {
    const hr = hash01(seed + 101, i);
    const dn = 0.06 + 0.9 * ((i + 0.5 * hr) / nr) ** 1.6;
    const sp = C.ripples[i % C.ripples.length];
    const k = 0.45 + 0.9 * dn;
    const span = w + sp.w * k * 2;
    const speed = (4 + 5 * dn) * (hr > 0.5 ? 1 : -1);
    let x = (hash01(seed + 7, i) * span + t * speed) % span;
    if (x < 0) x += span;
    x -= sp.w * k;
    const yy = dn * h + Math.sin(t * 0.4 + i) * 1.2;
    p.globalAlpha = (0.35 + 0.3 * Math.sin(t * 0.33 + i * 1.7) ** 2) * lerp(0.75, 1, 1 - clarity) * (night ? 0.7 : 1);
    p.drawImage(sp.c, x, yy - (sp.h * k) / 2, sp.w * k, sp.h * k);
  }
  p.globalAlpha = 1;

  __lap('ripples');
  // 6 · rings: a fish rising or a drop falling, now and then
  const period = 4.2;
  const k0 = Math.floor(t / period);
  p.strokeStyle = PIGMENTS.ink;
  for (let k = k0 - 1; k <= k0; k++) {
    if (hash01(seed + 3, k) < 0.25) continue;
    const ts = k * period + hash01(seed + 5, k) * period * 0.8;
    const age = (t - ts) / 3.6;
    if (age < 0 || age > 1) continue;
    const dn = 0.2 + 0.7 * hash01(seed + 11, k);
    const rx0 = w * (0.1 + 0.8 * hash01(seed + 13, k)), ry0 = dn * h;
    const persp = 0.5 + 0.9 * dn;
    for (let r = 0; r < 3; r++) {
      const ag = age - r * 0.12;
      if (ag <= 0) continue;
      const rad = (2 + ag * 26) * persp;
      p.globalAlpha = (1 - ag) ** 1.6 * 0.4 * (1 - r * 0.25);
      p.lineWidth = (1.1 - ag * 0.6) * persp;
      p.beginPath();
      p.ellipse(rx0, ry0, rad, rad * (0.16 + 0.22 * dn), 0, 0, Math.PI * 2);
      p.stroke();
    }
  }
  p.globalAlpha = 1;

  __lap('rings');
  // 7 · duckweed when the water stagnates
  const nd = Math.round(clamp((0.62 - clarity) / 0.62, 0, 1) * 36);
  if (nd > 0) {
    const green = `rgba(${MALACHITE.map((v) => Math.round(v * 0.85)).join(',')},`;
    for (let i = 0; i < nd; i++) {
      const cxi = Math.floor(i / 4);
      const bx = w * (0.08 + 0.84 * hash01(seed + 21, cxi)) + (hash01(seed + 22, i) - 0.5) * 14;
      const dn = 0.12 + 0.8 * hash01(seed + 23, cxi);
      const by = dn * h + (hash01(seed + 24, i) - 0.5) * 5;
      const dx = Math.sin(t * 0.05 + cxi * 1.3) * 6 + Math.sin(t * 0.13 + i) * 0.8;
      const r = (1.1 + 1.5 * hash01(seed + 25, i)) * (0.55 + 0.8 * dn);
      p.fillStyle = green + (0.5 + 0.3 * hash01(seed + 26, i)).toFixed(2) + ')';
      p.beginPath();
      p.ellipse(bx + dx, by, r * 1.3, r * 0.75, 0, 0, Math.PI * 2);
      p.fill();
      if (i % 3 === 0) {
        p.fillStyle = 'rgba(27,25,22,0.45)';
        p.beginPath();
        p.ellipse(bx + dx + r * 0.6, by + r * 0.2, r * 0.6, r * 0.35, 0, 0, Math.PI * 2);
        p.fill();
      }
    }
  }

  __lap('duck');
  // 8 · soften the ends, then lay the water onto the scene
  if (full) {
    ctx.restore();
    return;
  }
  p.setTransform(1, 0, 0, 1, 0, 0);
  p.globalCompositeOperation = 'destination-in';
  p.drawImage(C.mask, 0, 0, C.pond.width, C.pond.height);
  p.globalCompositeOperation = 'source-over';
  ctx.drawImage(C.pond, o.x, o.y, w, h);
}

// ---------------------------------------------------------------------------
// light

const lightCache = new Map<string, HTMLCanvasElement>();

/** Per-frame overlay for time of day (dawn warmth, dusk glow, night indigo). Multiplies a cached, low-res light map. */
export function paintLight(ctx: CanvasRenderingContext2D, w: number, h: number, env: SceneEnv): void {
  if (env.tod === 'day') return;
  const key = `${w}|${h}|${env.tod}|${env.season}|${env.hour.toFixed(2)}|${env.moonPhase.toFixed(3)}|${env.seed}`;
  let c = lightCache.get(key);
  if (!c) {
    c = buildLight(w, h, env);
    if (lightCache.size > 6) lightCache.delete(lightCache.keys().next().value!);
    lightCache.set(key, c);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, c.width - 2, c.height - 2, 0, 0, w, h);
  ctx.restore();
}

function buildLight(w: number, h: number, env: SceneEnv): HTMLCanvasElement {
  const L = sceneLayout(w, h, env);
  const k = 1 / 8;
  const c = makeCanvas(w * k + 2, h * k + 2);
  const cc = c.getContext('2d')!;
  const noise = makeNoise2(mixSeed(env.seed, 0x11ab));
  const b = L.body;
  const tod = env.tod;
  const hzY = L.hz - (L.hz - L.skyTop) * 0.2;
  paintField(cc, 0, 0, c.width, c.height, 1, (fx, fy, out) => {
    const x = fx / k, y = fy / k;
    const mott = noise.fbm(x / 300, y / 160, 2) * 0.5;
    let r = 255, g = 255, bl = 255;
    if (tod === 'night') {
      // indigo veil, lifted around the moon, slightly deeper at the top and in the water
      let v = 0.8 + 0.04 * mott + 0.03 * smoothstep(0, h * 0.5, y) - 0.03 * smoothstep(L.pondTop, h, y);
      if (b.r > 0) {
        const dd = Math.hypot(x - b.x, y - b.y);
        v += 0.1 * Math.exp(-((dd / (b.r * 7)) ** 2)) + 0.25 * Math.exp(-((dd / (b.r * 1.6)) ** 2));
      }
      v = clamp(v, 0, 1);
      r = 255 * (v - 0.07 * (1 - v) * 4); g = 255 * (v - 0.035 * (1 - v) * 4); bl = 255 * Math.min(1, v + 0.02);
    } else {
      const warm: RGB = tod === 'dawn' ? [250, 218, 210] : [249, 214, 166];
      const band = Math.exp(-(((y - hzY) / (h * 0.28)) ** 2));
      const near = b.r > 0 ? Math.exp(-(((x - b.x) / (w * 0.4)) ** 2) - (((y - b.y) / (h * 0.35)) ** 2)) : 0.3;
      const s = clamp((0.32 * band + 0.5 * near) * (1 + mott) + 0.04, 0, 1) * (tod === 'dawn' ? 0.55 : 0.6);
      r = lerp(255, warm[0], s); g = lerp(255, warm[1], s); bl = lerp(255, warm[2], s);
    }
    out[0] = r; out[1] = g; out[2] = bl; out[3] = 1;
  });
  return c;
}
