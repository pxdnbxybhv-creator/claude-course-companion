// 桃源 · the valley's plan: where everything is, how high the floor lies, where the stream runs,
// where one may walk. Pure data and arithmetic (no three.js), shared by the valley's builder, its
// door, its effects, the story (C) and the case (D). See the bible §1.2 and features/taoyuan/API.md.
//
// Local coordinates are metres from the valley's centre G, +x east, +z SOUTH (toward the mouth), −z
// north (toward the spring). Heights are metres above the floor datum Y_T. `W()` turns local into
// world coordinates; every exported place and anchor is already in world coordinates.
import { REGION } from '../../map';
import { makeNoise2 } from '../../../../core/rng';

const SPEC = REGION.taoyuan;
/** The valley's centre (world x, z). */
export const G = { x: SPEC.center.x, z: SPEC.center.z };
/** The floor datum (world y). */
export const Y_T = SPEC.pocket!.y;
/** The walkable floor's radius; the inner slopes rise beyond it to the crest ring. */
export const FLOOR_R = 40;
export const RING = { inner: 52, crest: 58, outer: SPEC.pocket!.ring };
/** The lowest crest above the floor (the photo camera stays 3 m below it). */
export const CREST_MIN = 34;

/** The narrow way (光隧): a cleft through the south ring, from its start (outer end) to the inner mouth (local z). */
export const CAVE = { start: 61.6, end: 65.2, words: 55, mouth: 40, trigger: 43, outer: 66 } as const;

export interface XZ { x: number; z: number }
export interface XYZ { x: number; y: number; z: number }

/** Local → world (x, z). */
export const W = (x: number, z: number): XZ => ({ x: G.x + x, z: G.z + z });
/** World → local. */
export const L = (x: number, z: number): XZ => ({ x: x - G.x, z: z - G.z });

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const N = makeNoise2(4127);

// ───────────────────────────── polylines

type P = [number, number];
function segDist(px: number, pz: number, a: P, b: P): { d: number; t: number } {
  const sx = b[0] - a[0], sz = b[1] - a[1];
  const l2 = sx * sx + sz * sz || 1;
  const t = clamp(((px - a[0]) * sx + (pz - a[1]) * sz) / l2, 0, 1);
  return { d: Math.hypot(px - a[0] - sx * t, pz - a[1] - sz * t), t };
}
/** Distance to a polyline, and how far along it (m) the nearest point lies. */
export function polyDist(pts: P[], x: number, z: number): { d: number; s: number; i: number } {
  let best = Infinity, bs = 0, bi = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const r = segDist(x, z, pts[i - 1], pts[i]);
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (r.d < best) { best = r.d; bs = acc + r.t * len; bi = i; }
    acc += len;
  }
  return { d: best, s: bs, i: bi };
}
export function polyLen(pts: P[]): number {
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return a;
}
/** The point `s` metres along a polyline, and its unit direction. */
export function polyAt(pts: P[], s: number): { x: number; z: number; dx: number; dz: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    if (s <= acc + len || i === pts.length - 1) {
      const t = clamp((s - acc) / len, 0, 1);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len };
    }
    acc += len;
  }
  const a = pts[pts.length - 1];
  return { x: a[0], z: a[1], dx: 0, dz: 1 };
}

/** The stream: born at the spring, winding south past the square, under the stone bridge, out through the cleft. */
export const STREAM: P[] = [
  [0, -33.2], [3, -31], [7.6, -27.6], [11.2, -22.4], [12.4, -15.2], [11.9, -8.2], [10.2, -2.6], [8.8, 3],
  [6.2, 8], [3.1, 12], [1.6, 16], [1.9, 21], [2.6, 27], [2.2, 32], [1.3, 36.5], [0.55, 40], [0.36, 43.5], [0.36, 64.8],
];
/** The stream's length (m). */
export const STREAM_LEN = polyLen(STREAM);
/** The floating-cup channel (流觞渠): drawn off the stream above the square, past the long tables, and back. */
export const CHANNEL: P[] = [[10.3, -3.2], [8.2, -2.4], [6.9, -0.8], [6.9, 1.2], [5.9, 2.8], [6.4, 4.4], [7.6, 5.4]];
/** Paths (packed earth) the floor is painted with; trees keep off them. */
export const PATHS: P[][] = [
  [[-0.1, 41], [-1.3, 37], [-4.2, 31], [-4.9, 23], [-4, 16], [-2.2, 9], [-0.4, 4.5]],
  [[-3.6, 14.2], [0, 12.9], [3, 12.1], [6.4, 11.4], [12, 9.4], [18, 7.6], [20.5, 6.8]],
  [[0, -5.5], [0, -11], [0, -17.2]],
  [[-5.4, 1.4], [-12, 3], [-18, 3.4], [-22, 3.5]],
  [[-21, 3.2], [-17, -4], [-13.6, -10], [-11.4, -13.4], [-8, -18.6], [-4.8, -21.8]],
  [[3.2, -4], [6, -9], [8, -11.8]],
  [[6, -9], [11.9, -9.6], [15.6, -10.2]],
  [[19, -12.4], [23.4, -17.4]],
  [[4.4, -21.8], [5.2, -26.5], [3.8, -30.2], [1.6, -31.6]],
  [[5.2, -26.5], [9.6, -27.6]],
  [[-4.9, -21.9], [-10.8, -24.6], [-15.2, -26.8]],
  [[12, 9.4], [18.5, 15.5], [22.5, 21]],
  [[-12, 3], [-17, 12.5], [-21, 19.5]],
];

// ───────────────────────────── the plan (local)

/** The shrine compound: courtyard (8 × 5, walled), the hall, its door, altar, side table, stele, back window, side gate. */
export const SHRINE = {
  wallX: 4.2, south: -17.4, courtN: -22.4, sideN: -24.5,
  hall: { x0: -2.8, x1: 2.8, z0: -22.6, z1: -27.2, floor: 0.45, eave: 3.3 },
  gate: { x: 0, z: -17.4, w: 1.7 },
  door: { x: 0, z: -22.6, w: 1.3 },
  sideGate: { x: -4.2, z: -21.2, w: 1.1 },
  altar: { x: 0, z: -25.6, w: 1.9, d: 0.72, h: 0.9 },
  table: { x: 1.9, z: -25.1 },
  stele: { x: -3.45, z: -23.4 },
  window: { x: -1.6, z: -27.2, w: 0.9, sill: 0.95 },
} as const;

/** The pavilion 不出亭 on its outcrop, and the stepped path up. */
export const PAVILION = { x: 14, z: -36, top: 6, r: 2.5, path: [[9.4, -27.6], [11, -30.6], [12.6, -33.2], [13.6, -34.9]] as P[] };
/** The old 碧桃 knoll. */
export const KNOLL = { x: -18, z: -28, r: 5.2, h: 1.1 };
/** The spring pool under the north cliff. */
export const SPRING = { x: 0, z: -35.4, r: 3.1 };
export const PONDS: { x: number; z: number; r: number }[] = [{ x: 27, z: 17.5, r: 2.9 }, { x: -9, z: 23, r: 2.2 }];
/** The festival square (packed earth). */
export const SQUARE = { x: 0, z: 0, r: 6.6 };

/** Walled / built footprints the walker walks round (axis-aligned local rectangles; the builder adds them as colliders). */
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; id: string }

// ───────────────────────────── heights

/** Distance to the nearest path (local). */
export const pathDist = (x: number, z: number) => {
  let d = Infinity;
  for (const p of PATHS) d = Math.min(d, polyDist(p, x, z).d);
  return d;
};

/** Crest height (m above the floor) at an angle round the ring (atan2(z, x), local). North is high over the spring, east low for the sunrise. */
export function crestH(a: number): number {
  const n = N(Math.cos(a) * 2.2 + 7, Math.sin(a) * 2.2 - 3) * 4 + N(Math.cos(a) * 6, Math.sin(a) * 6) * 1.6;
  const north = Math.exp(-(((Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) / 0.7) ** 2));
  const south = Math.exp(-(((Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) / 0.5) ** 2));
  const east = Math.exp(-((Math.atan2(Math.sin(a), Math.cos(a)) / 0.55) ** 2));
  const h = 40 + 3 * Math.sin(a * 3 + 1.3) + n + north * 8 + south * 3 - east * 5;
  return clamp(h, CREST_MIN, 48);
}

/** The stream here: distance from its line, how far along, and its half-width there. */
export function streamAt(x: number, z: number): { d: number; s: number; hw: number; inCleft: boolean } {
  const r = polyDist(STREAM, x, z);
  const inCleft = z > 43.4;
  const narrow = smooth(33, 38.5, z);
  const hw = inCleft ? 0.34 : (0.85 + 0.25 * Math.sin(r.s * 0.21) + (r.s < 4 ? 0.3 : 0)) * (1 - narrow) + 0.36 * narrow;
  return { d: r.d, s: r.s, hw, inCleft };
}

/** The cleft's half-width at local z (narrowest in the middle: 「初极狭，才通人」). */
export function cleftHalf(z: number): number {
  if (z < CAVE.mouth - 4) return 6;
  if (z < 44) return 0.9 + (44 - z) * 0.62;
  return 0.66 + 0.2 * (0.5 + 0.5 * Math.sin(z * 0.9 + 1.3)) + 0.06 * Math.sin(z * 2.7);
}

/** The cleft's floor (the plank walk), local height: level with the mouth, rising a little in the middle. */
let mouthH: number | null = null;
export const cleftFloor = (z: number) => (mouthH ??= floorAt(0, CAVE.mouth - 0.5)) + 0.22 * Math.sin(clamp((z - (CAVE.mouth + 1.5)) / 23, 0, 1) * Math.PI);

/** The walkable floor's height (local, m) at (x, z), inside r ≤ FLOOR_R (the gentle terraces, the platforms, the stream bed). */
export function floorAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  // gentle land: rising a little toward the north, softly rolling
  let h = 0.18 * N(x * 0.08, z * 0.08) + 0.08 * N(x * 0.3 + 3, z * 0.3 - 1);
  h += 1.1 * smooth(-4, -34, z) + 0.35 * smooth(10, 36, Math.abs(x)) * smooth(-10, 30, z);
  // terraces west and east (the fields step down toward the south)
  if (z > 18 && Math.abs(x) > 15) h += -0.25 * Math.floor((z - 18) / 4) * 0.6 + 0.4;
  // the square: level packed earth
  const sq = smooth(SQUARE.r + 2.5, SQUARE.r, Math.hypot(x - SQUARE.x, z - SQUARE.z));
  h = h * (1 - sq) + 0.15 * sq;
  // the opening terrace by the mouth: a flat rock a little raised
  const tr = smooth(3.4, 2.2, Math.hypot((x + 1.4) / 1.3, z - 35.2));
  h = h * (1 - tr) + 0.55 * tr;
  // the shrine's platform: level, a step up
  const S = SHRINE;
  const shrineBox = Math.max(Math.abs(x) - (S.wallX + 0.3), z - (S.south + 0.2), (S.hall.z1 - 0.4) - z);
  const sh = smooth(1.4, 0, shrineBox);
  h = h * (1 - sh) + 1.0 * sh;
  // the old 碧桃's knoll
  const kn = Math.hypot(x - KNOLL.x, z - KNOLL.z);
  h += KNOLL.h * smooth(KNOLL.r, 0, kn) * smooth(KNOLL.r, KNOLL.r * 0.3, kn);
  // the pavilion's outcrop and its stepped path
  const pv = Math.hypot(x - PAVILION.x, z - PAVILION.z);
  const top = 1.35 + PAVILION.top;
  if (pv < PAVILION.r + 3.2) {
    const onTop = smooth(PAVILION.r + 0.6, PAVILION.r, pv);
    const skirt = smooth(PAVILION.r + 3.2, PAVILION.r + 0.6, pv);
    h = Math.max(h, h + (top - h) * (onTop + (1 - onTop) * skirt * skirt * 0.97));
  }
  const pp = polyDist(PAVILION.path, x, z);
  if (pp.d < 1.6) {
    const L0 = polyLen(PAVILION.path);
    const up = h + (top - 0.02 - h) * smooth(0, L0, pp.s);
    h = Math.max(h, h + (up - h) * smooth(1.6, 0.8, pp.d));
  }
  // the spring's pool
  const sp = Math.hypot(x - SPRING.x, z - SPRING.z);
  h -= 0.7 * smooth(SPRING.r + 0.8, SPRING.r - 0.6, sp);
  // the ponds
  for (const p of PONDS) h -= 0.55 * smooth(p.r + 0.7, p.r - 0.5, Math.hypot(x - p.x, z - p.z));
  // the stream bed
  const st = streamAt(x, z);
  if (!st.inCleft) h -= 0.5 * smooth(st.hw + 0.9, st.hw - 0.25, st.d);
  // toward the edge the land lifts into the slopes
  h += 0.9 * smooth(33, FLOOR_R + 1, r);
  return h;
}

/** The surface (local height) anywhere in the pocket: the floor, the inner slopes, the crest ring, the outer skirt. */
export function surfaceAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const crest = crestH(a);
  // the north cliff behind the spring rises sheer
  const north = Math.exp(-((Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)) / 0.26) ** 2));
  const f = r < FLOOR_R + 2 ? floorAt(x, z) : floorAt((x / r) * (FLOOR_R + 2), (z / r) * (FLOOR_R + 2));
  if (r <= 36) return f;
  const n = N(x * 0.11 + 5, z * 0.11) * 1.6 + N(x * 0.35, z * 0.35 - 4) * 0.5;
  // slope: a concave rise from the floor's edge to the crest (steeper in the north: a cliff)
  const k0 = (FLOOR_R + 0.5) - north * 1.2;
  let h: number;
  if (r < RING.crest) {
    const u = clamp((r - k0) / (RING.crest - k0), 0, 1);
    const shape = north > 0.3 ? Math.pow(u, 0.55) : Math.pow(u, 1.7);
    h = f + (crest - f) * (u <= 0 ? 0 : shape) + n * smooth(k0, k0 + 6, r);
    if (r < k0) h = f;
  } else if (r < RING.outer + 2) {
    const u = (r - RING.crest) / (RING.outer + 2 - RING.crest);
    h = crest - 9 * u * u + n;
  } else {
    const u = clamp((r - RING.outer - 2) / 16, 0, 1);
    h = crest - 9 - (crest + 21) * Math.pow(u, 0.8);
  }
  // the cleft through the south ring: a slot open to a sliver of sky
  if (z > CAVE.mouth - 6 && z < CAVE.end + 9) {
    const hw = cleftHalf(z);
    const ax = Math.abs(x - 0.02);
    if (ax < hw + 8) {
      // (under the plank walk the stream runs along the east foot of the wall)
      const floor = z < 44 ? Math.min(h, f) : cleftFloor(z) - (x > 0.2 ? 0.45 : 0.3);
      const wall = floor + Math.max(0, ax - hw) * 16 + (ax > hw ? 1.5 : 0);
      // (it runs on a few metres past the curtain at its start, room for a camera behind the walker)
      const into = smooth(CAVE.mouth - 5, CAVE.mouth + 1, z) * smooth(CAVE.end + 8, CAVE.end + 4, z);
      const carved = Math.min(h, wall);
      h = h + (carved - h) * into;
    }
  }
  return h;
}

/** Inside the cleft (the narrow way), local. */
export function inCleft(x: number, z: number): boolean {
  return z > CAVE.mouth - 1 && z < CAVE.end && Math.abs(x) < cleftHalf(z) + 0.6;
}

/** Where the walker may stand (local): the floor within its edge, dry, off the steep outcrop; the planks of the cleft. */
export function walkAt(x: number, z: number): boolean {
  if (z > CAVE.mouth + 1.5) {
    if (z > CAVE.end - 0.7) return false;
    return Math.abs(x + 0.05) < cleftHalf(z) - 0.42;
  }
  const r = Math.hypot(x, z);
  if (r > FLOOR_R - 0.6 && !(z > CAVE.mouth - 4 && Math.abs(x) < cleftHalf(z) - 0.4)) return false;
  // water (the stream is crossed only on the bridges and the stepping stones; the channel is stepped over)
  if (waterAt(x, z) !== null && !crossing(x, z)) return false;
  // the pavilion's outcrop: its path and its top only
  const pv = Math.hypot(x - PAVILION.x, z - PAVILION.z);
  if (pv < PAVILION.r + 3) {
    if (pv < PAVILION.r - 0.35) return true;
    return polyDist(PAVILION.path, x, z).d < 0.62 && pv > PAVILION.r - 0.6;
  }
  return true;
}

/** Crossings of the stream: the stone bridge, the slab to 鲁三's, the stepping stones below the spring. */
export const CROSSINGS: { a: P; b: P; hw: number; y?: number; id: string }[] = [
  { id: 'bridge', a: [0.4, 12.9], b: [6, 11.4], hw: 1.05, y: 0.62 },
  { id: 'slab', a: [10.5, -9.4], b: [13.4, -9.8], hw: 0.7, y: 0.28 },
  { id: 'stones', a: [1.2, -30.2], b: [4.6, -32.6], hw: 0.55, y: 0.05 },
];
function crossing(x: number, z: number): boolean {
  for (const c of CROSSINGS) if (segDist(x, z, c.a, c.b).d < c.hw) return true;
  return false;
}
/** The height of a crossing's deck here (local), or null. The bridge arches. */
export function crossingY(x: number, z: number): number | null {
  for (const c of CROSSINGS) {
    const r = segDist(x, z, c.a, c.b);
    if (r.d >= c.hw) continue;
    const base = floorAt(c.a[0], c.a[1]) * (1 - r.t) + floorAt(c.b[0], c.b[1]) * r.t;
    const arch = c.id === 'bridge' ? Math.sin(r.t * Math.PI) * 0.75 : 0;
    return Math.max(floorAt(x, z), base + (c.y ?? 0.2) * (c.id === 'bridge' ? 0.5 : 1) + arch);
  }
  return null;
}

/** The water surface (local height) at (x, z): the stream, the spring, the ponds (not the channel, stepped over); null where dry. */
export function waterAt(x: number, z: number): number | null {
  const st = streamAt(x, z);
  if (st.d < st.hw) {
    if (st.inCleft) return cleftFloor(z) - 0.22;
    // level across the stream: a hand's depth over its bed at the line
    const c = polyAt(STREAM, st.s);
    return floorAt(c.x, c.z) + 0.3;
  }
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r) return floorAt(SPRING.x - SPRING.r - 0.9, SPRING.z) - 0.28;
  for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r) return floorAt(p.x + p.r + 0.8, p.z) - 0.25;
  return null;
}

/** The floor the walker stands on (local): the floor, the crossings, the cleft's planks, the hall's raised floor. */
export function standAt(x: number, z: number): number {
  if (z > CAVE.mouth + 1.5 && z < CAVE.end) return cleftFloor(z);
  const c = crossingY(x, z);
  if (c !== null) return c;
  const H = SHRINE.hall;
  if (x > H.x0 + 0.05 && x < H.x1 - 0.05 && z < H.z0 + 0.05 && z > H.z1 + 0.05) return floorAt(0, -24) + H.floor;
  // the hall's front step
  if (Math.abs(x) < 1.6 && z < H.z0 + 0.75 && z >= H.z0 + 0.05) return floorAt(0, -24) + H.floor * 0.5;
  if (z > CAVE.mouth - 1 && z <= CAVE.mouth + 1.5 && Math.abs(x) < cleftHalf(z)) return Math.max(floorAt(x, z), cleftFloor(CAVE.mouth + 1.5) * smooth(CAVE.mouth - 1, CAVE.mouth + 1.5, z));
  return floorAt(x, z);
}

// ───────────────────────────── named places and anchors (world coordinates)

const at = (x: number, z: number, dy = 0): XYZ => ({ ...W(x, z), y: Y_T + standAt(x, z) + dy });

/** Every place of bible §1.2, in world coordinates (y on the floor there). */
export const PLACES = {
  cave: { start: at(0.02, CAVE.start), words: at(0, CAVE.words), mouth: at(0, CAVE.mouth) },
  terrace: at(-1.4, 35.2),
  banks: { from: at(-3, 34), to: at(-3, 12) },
  bridge: at(3.2, 12.1),
  square: at(0, 0),
  pole: at(0, 0),
  tables: at(4.6, 0),
  channel: at(6.2, 3),
  well: at(-3, 2),
  sang: { house: at(-23.2, 5.7), silk: at(-24, 8.4), stove: at(-20.7, 6.9), doorstep: at(-22, 3.8) },
  brew: { house: at(22, 4.2), cellar: at(23.2, 7.4), counter: at(19.6, 4.6), jar: at(23.2, 7.9) },
  lu: { shop: at(18, -10.4), bench: at(18, -9.9) },
  qin: { house: at(8, -14), porch: at(8, -11.7), window: at(9.4, -11.9) },
  herb: { garden: at(26, -20), basin: at(26, -20) },
  gu: { hut: at(-14.2, -15.3), porch: at(-12.3, -14.1) },
  shrine: {
    gate: at(SHRINE.gate.x, SHRINE.gate.z), courtyard: at(0, -20), door: at(SHRINE.door.x, SHRINE.door.z + 0.3),
    altar: at(SHRINE.altar.x, SHRINE.altar.z), table: at(SHRINE.table.x, SHRINE.table.z), stele: at(SHRINE.stele.x, SHRINE.stele.z),
    window: at(SHRINE.window.x, SHRINE.window.z), sideGate: at(SHRINE.sideGate.x, SHRINE.sideGate.z),
  },
  oldpeach: at(KNOLL.x, KNOLL.z),
  spring: at(SPRING.x, SPRING.z),
  pavilion: at(PAVILION.x, PAVILION.z),
  fields: { east: at(24, 24), west: at(-24, 24), pond: at(PONDS[0].x, PONDS[0].z), coop: at(-20.5, 19.5) },
} as const;

/**
 * Named points the story and the case stand things on or look at (world, y at the surface named):
 * where to put a prompt, a glint, a camera's look.
 */
export const ANCHORS = {
  /** The altar's top (the incense tray, the lacquer box, the jar before the rite). */
  altar: at(SHRINE.altar.x, SHRINE.altar.z, SHRINE.altar.h),
  /** The incense-seal tray on the altar's front edge (FX10). */
  incense: at(0.1, SHRINE.altar.z + 0.2, SHRINE.altar.h + 0.06),
  /** 柳婆's spare tray (the 试香 test) on the altar's right end. */
  spareTray: at(0.78, SHRINE.altar.z + 0.1, SHRINE.altar.h + 0.05),
  /** The altar's left corner (C12's cup ring). */
  altarLeft: at(-0.62, SHRINE.altar.z, SHRINE.altar.h + 0.02),
  /** Before the altar on the hall floor (C2's shards). */
  shards: at(0, SHRINE.altar.z + 1.1),
  /** The courtyard's middle (C5), and its west strip along the wall (the patched clog's route). */
  courtyard: at(0, -20),
  courtyardWest: at(-3.3, -20),
  /** The hall door (the lantern hook is above it). */
  hallDoor: at(0, SHRINE.door.z + 0.35),
  lanternHook: at(0.9, SHRINE.door.z + 0.25, 2.55),
  /** The side table and its register (C9). */
  register: at(SHRINE.table.x, SHRINE.table.z, 0.82),
  stele: at(SHRINE.stele.x, SHRINE.stele.z + 0.55),
  backWindow: at(SHRINE.window.x, SHRINE.window.z - 0.6),
  sideGate: at(SHRINE.sideGate.x + 0.5, SHRINE.sideGate.z),
  shrineGate: at(0, SHRINE.south + 0.8),
  /** 杜二's cellar: a mud-sealed jar (C3), and his counter. */
  cellarJar: at(23.2, 7.9, 0.55),
  counter: at(19.6, 4.6, 1.0),
  /** 鲁三's bench and its chalk job list (C7). */
  bench: at(18, -9.9, 0.86),
  /** The Sang stove (C8), the silk-room tray (C10), the doorstep. */
  stove: at(-20.7, 6.9, 0.7),
  silkTray: at(-24, 8.4, 0.95),
  doorstep: at(-22, 3.8),
  /** 葛姑's petal-clock basin (C6). */
  basin: at(26, -20, 0.62),
  /** The old 碧桃's knee-high hollow (C11 / 小满's treasure). */
  hollow: at(KNOLL.x + 0.3, KNOLL.z + 0.75, 0.45),
  /** The spring's glowing pool (B7, FX13). */
  spring: at(SPRING.x, SPRING.z),
  /** The opening terrace, the old peach on it, the kite. */
  terrace: at(-1.4, 35.2),
  /** The festival square, the 花神杆 pole's top, the long tables, the cup channel's stopping place. */
  square: at(0, 0),
  poleTop: at(0, 0, 7.2),
  tables: at(4.6, 0),
  cupStop: at(6.9, 0.8),
  well: at(-3, 2),
  bridge: at(3.2, 12.1),
  /** 石瞽's porch on the lane; the elder's porch; the pavilion's top; the inner mouth. */
  guPorch: at(-12.3, -14.1),
  qinPorch: at(8, -11.7),
  pavilion: at(PAVILION.x, PAVILION.z),
  mouth: at(0, CAVE.mouth + 0.5),
  caveStart: at(0.02, CAVE.start),
} as const;

export type AnchorName = keyof typeof ANCHORS;

/** The lane lanterns (lit one by one at 戌): along the path from the square to the shrine and to the Sang house. */
export const LANE_LANTERNS: XZ[] = ([
  [0.9, -6], [-0.9, -10.5], [0.9, -14.8], [-1.6, 5.2], [-6.4, 2.4], [-11, 3.9], [-16, 4.3], [-19.8, 2.4], [3.8, -21.6], [-3.8, -21.6], [2.8, 12.9], [-4.6, 26], [-3.6, 19],
] as P[]).map(([x, z]) => W(x, z));

/** The photo camera's fence inside the valley: in the cleft, the cleft; elsewhere a disc of 44 m under the crest − 3. */
export function fenceValley(p: XYZ, walker: XYZ): void {
  const l = L(walker.x, walker.z);
  const c = L(p.x, p.z);
  if (l.z > CAVE.mouth + 1) {
    const zz = clamp(c.z, CAVE.mouth - 3, CAVE.start + 0.8);
    const hw = Math.max(0.2, cleftHalf(zz) - 0.3);
    p.x = G.x + clamp(c.x, -hw, hw);
    p.z = G.z + zz;
    p.y = Math.min(p.y, Y_T + cleftFloor(zz) + 7);
    return;
  }
  const d = Math.hypot(c.x, c.z);
  if (d > 44) { p.x = G.x + (c.x / d) * 44; p.z = G.z + (c.z / d) * 44; }
  p.y = Math.min(p.y, Y_T + CREST_MIN - 3);
}

/** The glyphs brushed into the air in the valley (fetched as the valley is built). */
export const BRUSHED = '初极狭才通人豁然开朗秦汉魏晋过所证断桃花源嗒';
