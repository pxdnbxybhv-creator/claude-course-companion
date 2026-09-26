// The land of the whole 入画 world, baked once into a 1 m height grid: gentle rolling country, flat
// plateaus where the places are (map.ts REGIONS), the plum ridge and the temple mountain raised,
// a valley for the mountain stream with a cliff for its waterfall, the lotus-lake basin, the
// river's channel, and every path graded so it can be walked (≤ ~22°). Beyond the rim the land
// rises into hills that fade into the painted mountains. Pure numbers — no three.js; deterministic.
import { makeNoise2, smoothstep } from '../../../core/rng';
import { HOME_PLOT, LAKE, PATHS, RIVER, RIVER_LAKE_BREAK, WORLD_RADIUS, type XZ } from '../map';
import { catmull } from './geom';

export const GRID_MIN = -216;
export const GRID_N = 433; // 1 m cells, −216 … 216
const GMAX = GRID_MIN + GRID_N - 1;

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoother = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Raised land: a disc (or a capsule from x,z to bx,bz) flat on top, falling smoothly over `width`. */
interface Bump { x: number; z: number; bx?: number; bz?: number; elev: number; elev2?: number; flat: number; width: number }
const BUMPS: Bump[] = [
  { x: -72, z: -72, elev: 9, flat: 12, width: 44 },                                  // 梅岭 summit
  { x: -64, z: -80, bx: -4, bz: -104, elev: 8.2, elev2: 17, flat: 5, width: 42 },    // the ridge path toward the temple
  { x: 40, z: -112, elev: 22, flat: 26, width: 86 },                                 // 山寺
  // peaks behind the temple and hills round the rim (mostly beyond the walk)
  { x: 42, z: -170, elev: 48, flat: 6, width: 48 },
  { x: -18, z: -160, elev: 36, flat: 5, width: 42 },
  { x: 102, z: -150, elev: 40, flat: 6, width: 44 },
  { x: -120, z: -120, elev: 26, flat: 6, width: 42 },
  { x: -164, z: -34, elev: 15, flat: 8, width: 40 },
  { x: 164, z: -52, elev: 18, flat: 8, width: 40 },
  { x: 156, z: 92, elev: 9, flat: 8, width: 40 },
  { x: 58, z: 166, elev: 8, flat: 8, width: 38 },
  { x: -84, z: 164, elev: 9, flat: 8, width: 38 },
];

/**
 * Where the places sit flat (their plateaus), blending back to the land between r0 and r1. A little
 * noise keeps a plateau from looking planed (`grain`, m; the homestead's plot is level to build on).
 */
const FLATS: { x: number; z: number; elev: number; r0: number; r1: number; grain?: number }[] = [
  { x: 0, z: 0, elev: 0, r0: 14, r1: 26 },          // garden
  { x: 0, z: 80, elev: 0.05, r0: 24, r1: 40 },      // water town
  { x: -82, z: 28, elev: 1.5, r0: 18, r1: 34 },     // bamboo grove
  { x: -72, z: -73, elev: 9, r0: 9, r1: 16 },       // plum summit
  { x: 40, z: -112, elev: 22, r0: 24, r1: 30 },     // temple terrace
  { x: 88, z: 16, elev: LAKE.waterY + 0.5, r0: 40, r1: 54 }, // round the lake
  // 家园: the whole square plot (its corners are √2 × half its side out) level, easing out over 12 m
  { x: HOME_PLOT.x, z: HOME_PLOT.z, elev: 0.6, r0: HOME_PLOT.size * 0.72 + 1, r1: HOME_PLOT.size * 0.72 + 13, grain: 0 },
];

/** The paths as graded: the lake-to-temple path is carried on up onto the temple terrace. */
const GRADED_PATHS: XZ[][] = PATHS.map((p, i) => (i === 5 ? [...p, { x: 38, z: -93 }] : p));

/** The pool at the foot of the waterfall. */
export const POOL = { x: 56, z: -95, r: 4.6, y: 15 };
/** The island in the lotus lake. */
export const ISLAND = { x: 96, z: 18, r: 4.6 };

// water surface heights at the river's control points (see map.ts RIVER)
const UPPER_Y = [POOL.y, 9, 3.5, LAKE.waterY];
const LOWER_Y = [-0.42, -0.46, -0.5, -0.55, -0.6, -0.66];

export interface RiverSample { x: number; z: number; w: number; y: number; s: number; tx: number; tz: number; upper: boolean }
export interface PathSample { x: number; z: number; y: number; tx: number; tz: number; s: number }

/** Sample a Catmull-Rom through points every ~1 m, interpolating per-point values by segment. */
function sampleCurve(pts: XZ[], vals: number[][], step = 1): { x: number; z: number; v: number[] }[] {
  const out: { x: number; z: number; v: number[] }[] = [];
  const n = pts.length;
  const at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    const k = Math.max(2, Math.ceil(hyp(c.x - b.x, c.z - b.z) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({ x: catmull(a.x, b.x, c.x, d.x, t), z: catmull(a.z, b.z, c.z, d.z, t), v: vals.map((vs) => vs[i] + (vs[i + 1] - vs[i]) * t) });
    }
  }
  const last = pts[n - 1];
  out.push({ x: last.x, z: last.z, v: vals.map((vs) => vs[n - 1]) });
  return out;
}

function riverSamples(): RiverSample[] {
  const up = RIVER.slice(0, RIVER_LAKE_BREAK);
  const low = RIVER.slice(RIVER_LAKE_BREAK);
  // run each part a little into the lake so the water meets
  const ext = (a: XZ, b: XZ, k: number): XZ => { const l = hyp(b.x - a.x, b.z - a.z) || 1; return { x: b.x + ((b.x - a.x) / l) * k, z: b.z + ((b.z - a.z) / l) * k }; };
  const upX: XZ[] = [...up, ext(up[up.length - 2], up[up.length - 1], 6.5)];
  const lowX: XZ[] = [ext(low[1], low[0], 5), ...low];
  const upW = [...up.map((p) => p.w), up[up.length - 1].w + 1];
  const lowW = [low[0].w + 1, ...low.map((p) => p.w)];
  const out: RiverSample[] = [];
  const push = (list: { x: number; z: number; v: number[] }[], upper: boolean) => {
    let s = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (i > 0) s += hyp(p.x - list[i - 1].x, p.z - list[i - 1].z);
      const q = list[Math.min(list.length - 1, i + 1)], r = list[Math.max(0, i - 1)];
      const dx = q.x - r.x, dz = q.z - r.z, l = hyp(dx, dz) || 1;
      out.push({ x: p.x, z: p.z, w: p.v[0], y: p.v[1], s, tx: dx / l, tz: dz / l, upper });
    }
  };
  const upper = sampleCurve(upX, [upW, [...UPPER_Y, LAKE.waterY]]);
  // the lake-to-temple path runs close beside the stream: keep the water a bank's width off it
  const side = sampleCurve(GRADED_PATHS[5], [], 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 3; i < upper.length; i++) {
      const p = upper[i];
      let bd = Infinity, bx = 0, bz = 0;
      for (const q of side) { const d = hyp(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; bx = q.x; bz = q.z; } }
      const need = p.v[0] + 4.2;
      if (bd < need && bd > 1e-3) { p.x += ((p.x - bx) / bd) * (need - bd); p.z += ((p.z - bz) / bd) * (need - bd); }
    }
    for (let i = 3; i < upper.length - 1; i++) {
      upper[i].x = (upper[i - 1].x + upper[i].x * 2 + upper[i + 1].x) / 4;
      upper[i].z = (upper[i - 1].z + upper[i].z * 2 + upper[i + 1].z) / 4;
    }
  }
  push(upper, true);
  push(sampleCurve(lowX, [lowW, [LAKE.waterY, ...LOWER_Y]]), false);
  return out;
}

export const RIVER_SAMPLES: RiverSample[] = riverSamples();
/** Index of the first sample of the lower river (after the lake). */
export const RIVER_LOWER_START = RIVER_SAMPLES.findIndex((s) => !s.upper);

// ------------------------------------------------------------------------------------------ bake

const N0 = makeNoise2(5501);
const N1 = makeNoise2(7717);

function bumpsAt(x: number, z: number): number {
  let best = 0;
  for (const b of BUMPS) {
    let d: number, e = b.elev;
    if (b.bx !== undefined && b.bz !== undefined) {
      const sx = b.bx - b.x, sz = b.bz - b.z;
      const t = clamp01(((x - b.x) * sx + (z - b.z) * sz) / (sx * sx + sz * sz));
      d = hyp(x - b.x - sx * t, z - b.z - sz * t);
      e = b.elev + ((b.elev2 ?? b.elev) - b.elev) * t;
    } else d = hyp(x - b.x, z - b.z);
    if (d >= b.flat + b.width) continue;
    const h = e * (1 - smoother(b.flat, b.flat + b.width, d));
    if (h > best) best = h;
  }
  return best;
}

/** The land before any path, river or lake shaping. */
function macro(x: number, z: number): number {
  const r = hyp(x, z);
  let h = 1.25 * N0.fbm(x / 62, z / 62, 3) + 0.3 * N1(x / 14 + 3.1, z / 14 - 7.7);
  h += bumpsAt(x, z);
  // hills round the rim
  const rim = smoothstep(WORLD_RADIUS - 14, WORLD_RADIUS + 34, r);
  if (rim > 0) h += rim * (15 + 9 * N1.fbm(x / 40 + 11, z / 40 - 4, 2));
  for (const f of FLATS) {
    const d = hyp(x - f.x, z - f.z);
    if (d >= f.r1) continue;
    const w = smoothstep(f.r1, f.r0, d);
    h = h + (f.elev + (f.grain ?? 0.15) * N1(x / 9, z / 9) - h) * w;
  }
  return h;
}

export interface Terrain {
  /** Ground height (m) — the baked grid, bilinear; analytic beyond it. */
  height(x: number, z: number): number;
  /** Steepness: |∇h| (rise per metre). */
  slope(x: number, z: number): number;
  /** Nearest river sample index and distance (−1 if farther than ~14 m). */
  riverNear(x: number, z: number): { i: number; d: number };
  /** River / lake / pool surface height at (x, z), or null (the garden pond is the core's). */
  waterAt(x: number, z: number): number | null;
  /** Distance to the nearest path (≤ 12 m, else 99) and that path's graded height. */
  pathNear(x: number, z: number): { d: number; y: number };
  paths: PathSample[][];
}

let cached: Terrain | null = null;

/** Bake (once) and return the world's terrain. ~100 ms on a laptop. */
export function terrain(): Terrain {
  if (cached) return cached;
  const N = GRID_N;
  const H = new Float32Array(N * N);
  // the broad land at 2 m (it is smooth), filled in to 1 m
  const M = (N - 1) / 2 + 1;
  const coarse = new Float32Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) coarse[j * M + i] = macro(GRID_MIN + i * 2, GRID_MIN + j * 2);
  for (let j = 0; j < N; j++) {
    const cj = j >> 1, vj = (j & 1) * 0.5, cj1 = Math.min(M - 1, cj + 1);
    for (let i = 0; i < N; i++) {
      const ci = i >> 1, ui = (i & 1) * 0.5, ci1 = Math.min(M - 1, ci + 1);
      const a = coarse[cj * M + ci], b = coarse[cj * M + ci1], c = coarse[cj1 * M + ci], d = coarse[cj1 * M + ci1];
      H[j * N + i] = a + (b - a) * ui + (c - a) * vj + (a - b - c + d) * ui * vj;
    }
  }

  // --- distance fields: river samples and path samples, splatted into the grid
  const rivI = new Int16Array(N * N).fill(-1);
  const rivD = new Float32Array(N * N).fill(99);
  const RS = RIVER_SAMPLES;
  const splat = (x: number, z: number, R: number, fn: (k: number, d: number) => void) => {
    const i0 = Math.max(0, Math.floor(x - R - GRID_MIN)), i1 = Math.min(N - 1, Math.ceil(x + R - GRID_MIN));
    const j0 = Math.max(0, Math.floor(z - R - GRID_MIN)), j1 = Math.min(N - 1, Math.ceil(z + R - GRID_MIN));
    for (let j = j0; j <= j1; j++) {
      const dz = GRID_MIN + j - z;
      for (let i = i0; i <= i1; i++) {
        const dx = GRID_MIN + i - x;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= R) fn(j * N + i, d);
      }
    }
  };
  for (let k = 0; k < RS.length; k++) {
    splat(RS[k].x, RS[k].z, 26, (c, d) => { if (d < rivD[c]) { rivD[c] = d; rivI[c] = k; } });
  }

  // --- the stream's valley (with a cliff behind the pool) and the lake's shore
  const s0 = RS[0], s1 = RS[Math.min(RS.length - 1, 6)];
  const fx = s1.x - s0.x, fz = s1.z - s0.z, fl = hyp(fx, fz) || 1;
  const lakeR = Math.min(LAKE.rx, LAKE.rz);
  for (let j = 0; j < N; j++) {
    const z = GRID_MIN + j;
    for (let i = 0; i < N; i++) {
      const x = GRID_MIN + i;
      const c = j * N + i;
      let h = H[c];
      const k = rivI[c];
      if (k >= 0) {
        const s = RS[k];
        let slope = 0.3;
        if (s.upper && k < 8) {
          const proj = ((x - s0.x) * fx + (z - s0.z) * fz) / fl;
          slope = 0.3 + 1.9 * smoothstep(0, -6, proj);
        }
        const v = s.y + 0.7 + Math.max(0, rivD[c] - s.w) * slope;
        if (v < h) h = v;
      }
      const q = hyp((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
      if (q < 1.9) {
        const v = LAKE.waterY + 0.4 + Math.max(0, q - 1) * lakeR * 0.22;
        if (v < h) h = v;
      }
      H[c] = h;
    }
  }

  // --- paths: sample, smooth, limit the grade, then lay them into the land
  const sampleH = (x: number, z: number) => bilinear(H, x, z);
  const paths: PathSample[][] = GRADED_PATHS.map((pts) => {
    const list = sampleCurve(pts, [], 1);
    const ys = list.map((p) => sampleH(p.x, p.z));
    // smooth ±5 m
    const sm = ys.map((_, i) => {
      let a = 0, n = 0;
      for (let k = -5; k <= 5; k++) { const y = ys[i + k]; if (y !== undefined) { a += y; n++; } }
      return a / n;
    });
    const MAX = 0.36;
    const ds = list.map((p, i) => (i ? hyp(p.x - list[i - 1].x, p.z - list[i - 1].z) : 0));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < sm.length; i++) { const m = MAX * ds[i]; sm[i] = Math.min(sm[i - 1] + m, Math.max(sm[i - 1] - m, sm[i])); }
      for (let i = sm.length - 2; i >= 0; i--) { const m = MAX * ds[i + 1]; sm[i] = Math.min(sm[i + 1] + m, Math.max(sm[i + 1] - m, sm[i])); }
    }
    let s = 0;
    return list.map((p, i) => {
      if (i > 0) s += hyp(p.x - list[i - 1].x, p.z - list[i - 1].z);
      const q = list[Math.min(list.length - 1, i + 1)], r = list[Math.max(0, i - 1)];
      const dx = q.x - r.x, dz = q.z - r.z, l = hyp(dx, dz) || 1;
      return { x: p.x, z: p.z, y: sm[i], tx: dx / l, tz: dz / l, s };
    });
  });
  const pathD = new Float32Array(N * N).fill(99);
  const pathY = new Float32Array(N * N);
  const pathL = new Int8Array(N * N).fill(-1);
  const pathK = new Int32Array(N * N);
  paths.forEach((list, li) => list.forEach((p, k) => splat(p.x, p.z, 12, (c, d) => { if (d < pathD[c]) { pathD[c] = d; pathL[c] = li; pathK[c] = k; } })));
  // the height a cell takes from its path: projected onto the nearer of the two segments beside its
  // nearest sample, so it runs on smoothly along the path (a nearest-sample height steps up a whole
  // sample's rise from one cell to the next wherever a walker cuts across a bend)
  for (let c = 0; c < N * N; c++) {
    const li = pathL[c];
    if (li < 0) continue;
    const list = paths[li], k = pathK[c];
    const x = GRID_MIN + (c % N), z = GRID_MIN + Math.floor(c / N);
    let bd = Infinity, by = list[k].y;
    for (const [a, b] of [[k - 1, k], [k, k + 1]]) {
      if (a < 0 || b >= list.length) continue;
      const A = list[a], B = list[b];
      const ex = B.x - A.x, ez = B.z - A.z, e2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / e2));
      const d = hyp(x - A.x - ex * t, z - A.z - ez * t);
      if (d < bd) { bd = d; by = A.y + (B.y - A.y) * t; }
    }
    pathD[c] = Math.min(pathD[c], bd);
    pathY[c] = by;
  }
  for (let c = 0; c < N * N; c++) {
    const d = pathD[c];
    if (d >= 8.5) continue;
    const w = smoothstep(8.5, 2.4, d);
    H[c] += (pathY[c] - H[c]) * w;
  }

  // --- the channels: river bed and banks, the pool, the lake bed and its island
  for (let j = 0; j < N; j++) {
    const z = GRID_MIN + j;
    for (let i = 0; i < N; i++) {
      const x = GRID_MIN + i;
      const c = j * N + i;
      let h = H[c];
      const k = rivI[c];
      if (k >= 0 && rivD[c] < RS[k].w + 5) {
        const s = RS[k];
        const v = Math.max(s.y - 0.75, s.y + 0.14 + (rivD[c] - s.w) * 0.55);
        if (v < h) h = v;
      }
      const dp = hyp(x - POOL.x, z - POOL.z);
      if (dp < POOL.r + 4) {
        const v = Math.max(POOL.y - 1.1, POOL.y + 0.14 + (dp - POOL.r) * 0.6);
        if (v < h) h = v;
      }
      const q = hyp((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
      if (q < 1.12) {
        const v = Math.max(LAKE.waterY - 1.7, LAKE.waterY + 0.16 + (q - 1) * lakeR * 0.5);
        // a path running out into the lake is carried on a low causeway (堤)
        const pd = pathD[c];
        const keep = pd < 5 ? smoothstep(5, 2.2, pd) : 0;
        if (v < h) h = v + (Math.max(h, LAKE.waterY + 0.32) - v) * keep;
        const di = hyp(x - ISLAND.x, z - ISLAND.z);
        if (di < ISLAND.r + 4) h = Math.max(h, LAKE.waterY + 0.5 - Math.max(0, di - ISLAND.r * 0.6) * 0.42);
      }
      H[c] = h;
    }
  }

  const far = (x: number, z: number) => macro(x, z);
  const height = (x: number, z: number): number => {
    if (x <= GRID_MIN || z <= GRID_MIN || x >= GMAX || z >= GMAX) return far(x, z);
    return bilinear(H, x, z);
  };
  const riverNear = (x: number, z: number) => {
    const i = Math.round(x - GRID_MIN), j = Math.round(z - GRID_MIN);
    if (i < 0 || j < 0 || i >= N || j >= N) return { i: -1, d: 99 };
    const k = rivI[j * N + i];
    if (k < 0) return { i: -1, d: 99 };
    // refine against the neighbouring samples
    let best = k, bd = Infinity;
    for (let m = Math.max(0, k - 2); m <= Math.min(RS.length - 1, k + 2); m++) {
      const d = hyp(x - RS[m].x, z - RS[m].z);
      if (d < bd) { bd = d; best = m; }
    }
    return { i: best, d: bd };
  };
  const waterAt = (x: number, z: number): number | null => {
    const q = hyp((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (q < 1.06 && height(x, z) < LAKE.waterY - 0.02) return LAKE.waterY;
    if (hyp(x - POOL.x, z - POOL.z) < POOL.r + 0.6 && height(x, z) < POOL.y - 0.02) return POOL.y;
    const r = riverNear(x, z);
    if (r.i >= 0 && r.d < RS[r.i].w + 1) {
      const y = RS[r.i].y;
      if (height(x, z) < y - 0.02) return y;
    }
    return null;
  };
  const slope = (x: number, z: number) => {
    const e = 0.75;
    return hyp(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
  };
  const pathNear = (x: number, z: number) => {
    const i = Math.round(x - GRID_MIN), j = Math.round(z - GRID_MIN);
    if (i < 0 || j < 0 || i >= N || j >= N) return { d: 99, y: 0 };
    const c = j * N + i;
    return { d: pathD[c], y: pathY[c] };
  };
  cached = { height, slope, riverNear, waterAt, pathNear, paths };
  return cached;
}

function bilinear(H: Float32Array, x: number, z: number): number {
  const N = GRID_N;
  const fx = Math.min(N - 1.001, Math.max(0, x - GRID_MIN)), fz = Math.min(N - 1.001, Math.max(0, z - GRID_MIN));
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const c = j * N + i;
  const a = H[c], b = H[c + 1], d = H[c + N], e = H[c + N + 1];
  return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
}
