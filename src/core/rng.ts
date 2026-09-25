// Deterministic randomness and noise. All procedural art must draw from these,
// never from Math.random(), so a plant with the same seed paints the same way twice.

/** 32-bit string hash (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix two integers into a new 32-bit seed. */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  (): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Approximately normal (mean 0, sd 1). */
  gauss(): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** A new independent generator derived from this one. */
  fork(salt?: number): Rng;
}

/** mulberry32 — small, fast, good enough for art. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, max) => Math.floor(min + (max - min + 1) * next());
  next.gauss = () => {
    let u = 0;
    for (let i = 0; i < 6; i++) u += next();
    return (u - 3) / Math.SQRT1_2;
  };
  next.chance = (p) => next() < p;
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.fork = (salt = 0) => makeRng(mixSeed(Math.floor(next() * 4294967296), salt));
  return next;
}

// ---------------------------------------------------------------------------
// 2D gradient noise (Perlin-style) with an optional period for seamless tiles.

function grad(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export interface Noise2 {
  /** Gradient noise, roughly in [-1, 1]. */
  (x: number, y: number): number;
  /** Fractal sum of `octaves` layers, normalised to roughly [-1, 1]. */
  fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
}

/**
 * @param period when set, noise tiles every `period` units on both axes (use an integer).
 */
export function makeNoise2(seed: number, period = 0): Noise2 {
  const rng = makeRng(seed);
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const wrap = (i: number) => (period > 0 ? ((i % period) + period) % period : i) & 255;

  const n = ((x: number, y: number) => {
    const xf = Math.floor(x);
    const yf = Math.floor(y);
    const X0 = wrap(xf), Y0 = wrap(yf);
    const X1 = wrap(xf + 1), Y1 = wrap(yf + 1);
    const dx = x - xf, dy = y - yf;
    const u = fade(dx), v = fade(dy);
    const aa = p[p[X0] + Y0], ab = p[p[X0] + Y1];
    const ba = p[p[X1] + Y0], bb = p[p[X1] + Y1];
    const x1 = grad(aa, dx, dy) + u * (grad(ba, dx - 1, dy) - grad(aa, dx, dy));
    const x2 = grad(ab, dx, dy - 1) + u * (grad(bb, dx - 1, dy - 1) - grad(ab, dx, dy - 1));
    return (x1 + v * (x2 - x1)) * 0.5;
  }) as Noise2;

  n.fbm = (x, y, octaves = 4, lacunarity = 2, gain = 0.5) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
  return n;
}

/** Short random id for records. Uses crypto when available. */
export function uid(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID().slice(0, 8);
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
