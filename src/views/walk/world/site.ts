// The site plan of the walkable garden — pure geometry, no three.js.
//
//            N (−z)
//      ┌─ loop path around the pond ─┐
//      │   亭 pavilion (north shore)  │
//      │   ~~~ pond ~~~ 九曲桥 bridge  │   plants stand along the loop, lotus in the pond
//      │                              │
//      └──────── 月洞门 moon gate ─────┘   the visitor starts outside the gate, looking in
//            S (+z)          E = +x
//
// Units are metres; y is up. Everything here is deterministic.
import type { PlantKind } from '../../../core/types';
import { hashString, makeNoise2, makeRng, smoothstep } from '../../../core/rng';

export const POND = { x: 0, z: 0, rx: 6.6, rz: 4.3, waterY: 0.1 };
export const BOUNDS_R = 25;
export const GATE = { z: 16.5, halfW: 6.2, holeR: 1.25, holeY: 1.2, thick: 0.34, top: 2.4 };
export const SPAWN = { x: 0, z: 20.2, heading: Math.PI };
export const PAVILION = { x: 0.4, z: -8.2, r: 2.25 };
export const BRIDGE: [number, number][] = [[1.0, 5.9], [1.0, 2.5], [-1.25, 0.9], [-1.25, -1.9], [0.4, -3.4], [0.4, -6.2]];
export const BRIDGE_HW = 0.58;
export const BRIDGE_Y = POND.waterY + 0.3;

/** Full-grown height (m) of each plant kind, and its trunk collider / footprint half-width. */
export const KIND_H: Record<PlantKind, number> = { pine: 4.1, bamboo: 3.6, plum: 3.0, chrysanthemum: 1.15, orchid: 0.95, lotus: 1.3 };
export const KIND_R: Record<PlantKind, number> = { pine: 0.5, bamboo: 0.42, plum: 0.4, chrysanthemum: 0.34, orchid: 0.28, lotus: 0.4 };
const KIND_SPACE: Record<PlantKind, number> = { pine: 1.9, bamboo: 1.4, plum: 1.7, chrysanthemum: 0.85, orchid: 0.75, lotus: 1 };
export const TALL: ReadonlySet<PlantKind> = new Set<PlantKind>(['pine', 'bamboo', 'plum']);

// ------------------------------------------------------------------------------------------ terrain

const N = makeNoise2(9127);
const PAV_FLOOR_BASE = 0.3;
export const PAVILION_Y = PAV_FLOOR_BASE + 0.34; // platform top

/** Ellipse distance from the pond centre (1 = the shore line). */
export function pondQ(x: number, z: number): number {
  return Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
}

/** Terrain height — rolling lawn inside, hills rising beyond the garden, a basin under the pond. */
export function terrainY(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = 0.5 * N.fbm(x / 17, z / 17, 3) + 0.1 * N(x / 5 + 7.3, z / 5 - 3.1);
  const hill = smoothstep(23, 62, r);
  if (hill > 0) h += hill * (1.6 + 3.6 * (0.5 + 0.5 * N.fbm(x / 38 + 3.7, z / 38 - 1.2, 3)));
  // flatten the gate threshold and the pavilion site
  const g = smoothstep(4.5, 2.2, Math.abs(z - GATE.z)) * smoothstep(GATE.halfW + 3, GATE.halfW + 0.5, Math.abs(x));
  h = h * (1 - g) + 0.18 * g;
  const pv = smoothstep(4.2, 2.6, Math.hypot(x - PAVILION.x, z - PAVILION.z));
  h = h * (1 - pv) + PAV_FLOOR_BASE * pv;
  // the pond basin
  const q = pondQ(x, z);
  const flat = smoothstep(2.1, 1.12, q);
  h = h * (1 - flat) + 0.24 * flat;
  h -= 1.0 * smoothstep(1.0, 0.8, q);
  return h;
}

// ---------------------------------------------------------------------------------------- polylines

export interface Poly {
  x: Float64Array;
  z: Float64Array;
  s: Float64Array;
  length: number;
  closed: boolean;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Sample a Catmull-Rom spline through `pts` densely (every ~0.25 m). */
export function spline(pts: [number, number][], closed: boolean, step = 0.25): Poly {
  const n = pts.length;
  const xs: number[] = [], zs: number[] = [];
  const segs = closed ? n : n - 1;
  const at = (i: number) => pts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < segs; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      xs.push(catmull(a[0], b[0], c[0], d[0], t));
      zs.push(catmull(a[1], b[1], c[1], d[1], t));
    }
  }
  if (closed) { xs.push(xs[0]); zs.push(zs[0]); } else { xs.push(pts[n - 1][0]); zs.push(pts[n - 1][1]); }
  const s = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), s, length: s[s.length - 1], closed };
}

/** Point and unit tangent at arc length s. */
export function polyAt(p: Poly, s: number): { x: number; z: number; tx: number; tz: number } {
  if (p.closed) s = ((s % p.length) + p.length) % p.length;
  else s = Math.max(0, Math.min(p.length, s));
  let lo = 0, hi = p.s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p.s[m] <= s) lo = m; else hi = m;
  }
  const seg = p.s[hi] - p.s[lo] || 1;
  const t = (s - p.s[lo]) / seg;
  const dx = p.x[hi] - p.x[lo], dz = p.z[hi] - p.z[lo];
  const l = Math.hypot(dx, dz) || 1;
  return { x: p.x[lo] + dx * t, z: p.z[lo] + dz * t, tx: dx / l, tz: dz / l };
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function polyDist(p: Poly, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < p.x.length; i++) {
    const d = segDist(x, z, p.x[i - 1], p.z[i - 1], p.x[i], p.z[i]);
    if (d < best) best = d;
  }
  return best;
}

function rawPolyDist(pts: [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return best;
}

/** The winding path around the pond (closed loop), starting just inside the gate and heading west. */
export const LOOP = spline(
  [[0, 14], [-4.2, 12.1], [-8.6, 8.4], [-11.4, 3.2], [-11.6, -2.8], [-9.2, -8.2], [-4.6, -11.6], [0.8, -12.4], [6, -11.2], [10.2, -7.2], [12.1, -1.4], [11.4, 4.4], [8.4, 9.1], [4.3, 12.2]],
  true,
);
/** From outside the gate, through it, down to the bridge; and from the pavilion back to the loop. */
export const SPURS = [
  spline([[SPAWN.x, SPAWN.z + 1.5], [0, GATE.z], [0, 14], [0.55, 10], [1.0, 6.2]], false),
  spline([[0.5, -10.2], [0.7, -12.2]], false),
];

// ---------------------------------------------------------------------------------------- obstacles

export interface Circle { x: number; z: number; r: number }
export interface Rock { x: number; z: number; h: number; w: number; seed: number }
export interface Lantern { x: number; z: number }

function outward(x: number, z: number, tx: number, tz: number): [number, number] {
  let nx = tz, nz = -tx;
  if (nx * (x - POND.x) + nz * (z - POND.z) < 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

/** Scholar's rocks: placed relative to the loop so they never block it. */
export const ROCKS: Rock[] = (() => {
  const spec: { f: number; off: number; h: number; w: number }[] = [
    { f: 0.215, off: 3.1, h: 2.5, w: 1.2 },
    { f: 0.6, off: 2.9, h: 1.7, w: 1.0 },
    { f: 0.735, off: -1.9, h: 0.75, w: 0.8 },
    { f: 0.93, off: 2.4, h: 1.1, w: 0.9 },
    { f: 0.36, off: -1.9, h: 0.6, w: 0.75 },
  ];
  return spec.map((r, i) => {
    const p = polyAt(LOOP, r.f * LOOP.length);
    const [nx, nz] = outward(p.x, p.z, p.tx, p.tz);
    return { x: p.x + nx * r.off, z: p.z + nz * r.off, h: r.h, w: r.w, seed: 4000 + i * 97 };
  });
})();

// the first stands east of the way in, leaving the west side of the moon gate's frame to a plant
export const LANTERNS: Lantern[] = [{ x: 1.4, z: 12.8 }, { x: 2.15, z: 6.5 }, { x: -2.1, z: -11.0 }];

/** Pavilion columns (hexagon corners). */
export const COLUMNS: Circle[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2;
  return { x: PAVILION.x + Math.cos(a) * (PAVILION.r - 0.28), z: PAVILION.z + Math.sin(a) * (PAVILION.r - 0.28), r: 0.14 };
});

export function staticColliders(): Circle[] {
  return [
    ...ROCKS.map((r) => ({ x: r.x, z: r.z, r: r.w * 0.62 })),
    ...LANTERNS.map((l) => ({ x: l.x, z: l.z, r: 0.3 })),
    ...COLUMNS,
    { x: PAVILION.x, z: PAVILION.z, r: 0.5 }, // stone table
  ];
}

/** Is (x, z) on the bridge deck? */
export function onBridge(x: number, z: number): boolean {
  return rawPolyDist(BRIDGE, x, z) < BRIDGE_HW;
}

export function onPavilion(x: number, z: number): boolean {
  return Math.hypot(x - PAVILION.x, z - PAVILION.z) < PAVILION.r - 0.05;
}

/** The surface you stand on: terrain, the bridge deck or the pavilion floor. */
export function floorY(x: number, z: number): number {
  let y = terrainY(x, z);
  if (onPavilion(x, z)) y = Math.max(y, PAVILION_Y);
  if (onBridge(x, z)) y = Math.max(y, BRIDGE_Y);
  return y;
}

/** Walkable ground: inside the garden, not in the water (the bridge is fine). */
export function walkableGround(x: number, z: number, margin = 0.28): boolean {
  if (Math.hypot(x, z) > BOUNDS_R) return false;
  if (onBridge(x, z) || onPavilion(x, z)) return true;
  const q = Math.hypot((x - POND.x) / (POND.rx + margin), (z - POND.z) / (POND.rz + margin));
  return q > 1.0;
}

/** Signed distance to the moon-gate wall (two segments either side of the round opening). */
export function wallSegments(): [number, number, number, number][] {
  const o = GATE.holeR * 0.82;
  return [[-GATE.halfW, GATE.z, -o, GATE.z], [o, GATE.z, GATE.halfW, GATE.z]];
}

// ------------------------------------------------------------------------------------ plant layout

export interface PlantSlot {
  key: string;
  kind: PlantKind;
  x: number;
  z: number;
  /** Where the tablet stands and which way it faces (radians around +Y; 0 = facing +z). */
  tablet: { x: number; z: number; rot: number };
  inWater: boolean;
  /** A lotus the pond had no room for grows in a glazed water jar (荷缸) beside the path. */
  jar?: boolean;
}

export interface LayoutItem { key: string; kind: PlantKind }

/** Height of a 荷缸 water jar's rim (the lotus floats on the water inside). */
export const JAR_H = 0.62;
export const JAR_R = 0.46;

/** Through the moon gate, the first thing you see: 框景, a plant framed by the round opening. */
const FRAME_SPOTS: [number, number][] = [[-1.5, 10.1], [-1.35, 9.3], [-1.9, 10.3], [-2.2, 9.6], [-2.6, 10.0], [2.3, 9.4], [2.6, 10.4]];

/**
 * Lay plants out in order (first planted = first met): the first land plant stands in the moon
 * gate's frame, the rest go along the loop alternating west and east of the gate, tall trees
 * standing back, small plants leaning close. Lotus floats in the pond; when the pond is full,
 * more lotus grow in water jars by the path. Every item gets a slot — never fewer.
 * The order is by the caller (sorted by creation); the small variations are seeded by the key.
 */
export function layoutPlants(items: LayoutItem[]): PlantSlot[] {
  const out: PlantSlot[] = [];
  const blockers: Circle[] = staticColliders();
  const taken: Circle[] = [];
  const clear = (x: number, z: number, r: number, relax = 0) => {
    if (Math.hypot(x, z) > BOUNDS_R - 2.5) return false;
    if (pondQ(x, z) < 1.0 + (r + 0.5) / Math.min(POND.rx, POND.rz)) return false;
    if (Math.abs(z - GATE.z) < r + 0.8 && Math.abs(x) < GATE.halfW + 0.5) return false;
    if (Math.hypot(x - PAVILION.x, z - PAVILION.z) < PAVILION.r + r + 0.4) return false;
    for (const sp of SPURS) if (polyDist(sp, x, z) < r + 0.75 - relax) return false;
    if (polyDist(LOOP, x, z) < r + 0.55 - relax) return false;
    if (rawPolyDist(BRIDGE, x, z) < r + 1) return false;
    for (const b of blockers) if (Math.hypot(x - b.x, z - b.z) < b.r + r + 0.5) return false;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + r) return false;
    return true;
  };
  const take = (s: PlantSlot, r: number) => {
    out.push(s);
    taken.push({ x: s.x, z: s.z, r });
    taken.push({ x: s.tablet.x, z: s.tablet.z, r: 0.35 });
  };

  const land = items.filter((i) => i.kind !== 'lotus');
  const water = items.filter((i) => i.kind === 'lotus');

  // 1. 框景: the first land plant stands just beyond the moon gate, off the axis, in its frame.
  let rest = land;
  if (land.length) {
    const it = land[0];
    const r = KIND_R[it.kind] + 0.35;
    for (const [fx, fz] of FRAME_SPOTS) {
      const tall = TALL.has(it.kind);
      // small plants lean closer to the path so they still show in the frame
      const x = tall ? fx : fx * 0.72, z = tall ? fz : fz + 0.5;
      if (!clear(x, z, r, 0.6)) continue;
      const side = Math.sign(x) || -1;
      const tx = tall ? x - side * 0.95 : x - side * 0.35, tz = tall ? z + 0.75 : z + 0.9;
      take({ key: it.key, kind: it.kind, x, z, tablet: { x: tx, z: tz, rot: side * -0.45 }, inWater: false }, KIND_SPACE[it.kind]);
      rest = land.slice(1);
      break;
    }
  }

  // 2. Along the loop: alternate west and east of the gate so the plants flank the way in, then
  // work round toward the pavilion; the spacing spreads a small garden round to the north shore.
  const perSide = Math.max(1, Math.ceil((rest.length + 1) / 2));
  const spacing = Math.max(3.4, Math.min(13, (LOOP.length / 2 - 8.4) / Math.max(1, perSide - 1)));
  const cursor = [2.4, LOOP.length - 2.4]; // west-going, east-going
  let flip = 1;
  let turn = 0;
  const placeOnLoop = (it: LayoutItem, jar: boolean): boolean => {
    const r = makeRng(hashString(it.key) ^ 0x2c1b3c6d);
    const tall = TALL.has(it.kind);
    const space = jar ? 1.0 : KIND_SPACE[it.kind];
    const dir = turn++ % 2 === 0 ? 0 : 1;
    const sign = dir === 0 ? 1 : -1;
    let ring = 0;
    for (let tries = 0; tries < 300; tries++) {
      let s = cursor[dir];
      if (cursor[0] > cursor[1] - 1) { ring++; cursor[0] = 2 + ring; cursor[1] = LOOP.length - 2 - ring; s = cursor[dir]; }
      if (ring > 3) break;
      const p = polyAt(LOOP, s);
      const [nx, nz] = outward(p.x, p.z, p.tx, p.tz);
      const baseOff = (tall ? 2.35 : jar ? 1.25 : 1.4) + ring * 3.1 + r.range(-0.15, 0.25);
      const sides = tall || ring > 0 ? [1, -1] : [flip, -flip];
      for (const side of sides) {
        const off = side > 0 ? baseOff : (tall ? 2.1 : 1.35);
        const x = p.x + nx * side * off, z = p.z + nz * side * off;
        if (!clear(x, z, space)) continue;
        // the tablet: between the plant and the path, a little ahead along it
        const along = r.chance(0.5) ? 1 : -1;
        let tx = p.x + nx * side * 0.95 + p.tx * along * (space * 0.55 + 0.25);
        let tz = p.z + nz * side * 0.95 + p.tz * along * (space * 0.55 + 0.25);
        if (pondQ(tx, tz) < 1.15) { tx = p.x + nx * side * 0.95; tz = p.z + nz * side * 0.95; }
        const rot = Math.atan2(-nx * side, -nz * side);
        take({ key: it.key, kind: it.kind, x, z, tablet: { x: tx, z: tz, rot }, inWater: false, ...(jar ? { jar: true } : {}) }, space);
        if (!tall) flip = -flip;
        cursor[dir] += sign * spacing * r.range(0.85, 1.15);
        return true;
      }
      cursor[dir] += sign * 0.6;
    }
    return false;
  };
  /** Last resort: any clear spot on the lawn, scanning outward rings round the pond. */
  const placeAnywhere = (it: LayoutItem, jar: boolean) => {
    const space = jar ? 1.0 : KIND_SPACE[it.kind];
    for (const shrink of [1, 0.6, 0.35]) {
      for (let q = 1.6; q < 3.6; q += 0.18) {
        for (let k = 0; k < 48; k++) {
          const a = (k / 48) * Math.PI * 2 + q * 1.7;
          const x = POND.x + Math.cos(a) * POND.rx * q, z = POND.z + Math.sin(a) * POND.rz * q;
          if (!clear(x, z, space * shrink)) continue;
          const tx = x + (POND.x - x) * 0.08, tz = z + (POND.z - z) * 0.08 + 0.6;
          take({ key: it.key, kind: it.kind, x, z, tablet: { x: tx, z: tz, rot: Math.atan2(POND.x - x, POND.z - z) }, inWater: false, ...(jar ? { jar: true } : {}) }, space * shrink);
          return;
        }
      }
    }
    // the garden is truly full: stand it outside the loop anyway, never drop a habit
    const a = hashString(it.key) % 628 / 100;
    const x = Math.cos(a) * (BOUNDS_R - 4), z = Math.sin(a) * (BOUNDS_R - 4) * 0.8;
    take({ key: it.key, kind: it.kind, x, z, tablet: { x: x * 0.95, z: z * 0.95, rot: Math.atan2(-x, -z) }, inWater: false, ...(jar ? { jar: true } : {}) }, 0.4);
  };
  for (const it of rest) if (!placeOnLoop(it, false)) placeAnywhere(it, false);

  // 3. Lotus: floating in the pond, a tablet on the nearest shore. Wide spacing first, then closer,
  // then an inner and an outer ring; what still does not fit goes into a water jar by the path.
  const angles = [205, 330, 25, 150, 265, 95, 180, 300, 60, 235, 0, 120];
  const cands: { a: number; q: number }[] = [];
  for (let i = 0; i < angles.length * 2; i++) cands.push({ a: angles[i % angles.length] + (i >= angles.length ? 17 : 0), q: i >= angles.length ? 0.42 : 0.64 });
  for (let i = 0; i < 18; i++) cands.push({ a: i * 20 + 8, q: 0.8 });
  for (let i = 0; i < 12; i++) cands.push({ a: i * 30 + 21, q: 0.25 });
  for (let i = 0; i < 18; i++) cands.push({ a: i * 20 + 2, q: 0.54 });
  const passes = [{ gap: 1.2, bridge: 1.5 }, { gap: 0.55, bridge: 1.15 }];
  const pondFree = (x: number, z: number, gap: number, bridge: number) =>
    rawPolyDist(BRIDGE, x, z) >= bridge && !taken.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + gap);
  const overflow: LayoutItem[] = [];
  for (const it of water) {
    let done = false;
    for (const ps of passes) {
      for (const c of cands) {
        const a = c.a * (Math.PI / 180);
        const x = POND.x + Math.cos(a) * POND.rx * c.q, z = POND.z + Math.sin(a) * POND.rz * c.q;
        if (!pondFree(x, z, ps.gap, ps.bridge)) continue;
        // the tablet on the shore, clear of the others and of the bridge's landings
        let tx = 0, tz = 0, b = a, ok = false;
        for (const da of [0, 9, -9, 18, -18, 27, -27]) {
          b = a + da * (Math.PI / 180);
          tx = POND.x + Math.cos(b) * POND.rx * 1.2; tz = POND.z + Math.sin(b) * POND.rz * 1.2;
          if (rawPolyDist(BRIDGE, tx, tz) < 1.1 || polyDist(LOOP, tx, tz) < 0.5) continue;
          if (taken.some((t) => Math.hypot(tx - t.x, tz - t.z) < t.r + 0.45)) continue;
          ok = true;
          break;
        }
        if (!ok) continue;
        const rot = Math.atan2(Math.cos(b), Math.sin(b) * (POND.rx / POND.rz));
        out.push({ key: it.key, kind: 'lotus', x, z, tablet: { x: tx, z: tz, rot }, inWater: true });
        taken.push({ x, z, r: 0.9 });
        taken.push({ x: tx, z: tz, r: 0.35 });
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) overflow.push(it);
  }
  for (const it of overflow) if (!placeOnLoop(it, true)) placeAnywhere(it, true);

  // keep the caller's order (first planted first)
  const at = new Map(items.map((it, i) => [it.key, i]));
  out.sort((a, b) => (at.get(a.key) ?? 0) - (at.get(b.key) ?? 0));
  return out;
}

/** Stepping stones along the paths: [x, z, radius, rotation]. */
export function steppingStones(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const rng = makeRng(771);
  const lay = (p: Poly, gap: number) => {
    for (let s = 0.3; s < p.length; s += gap * rng.range(0.9, 1.12)) {
      const q = polyAt(p, s);
      const j = rng.range(-0.12, 0.12);
      const x = q.x + q.tz * j, z = q.z - q.tx * j;
      if (pondQ(x, z) < 1.12 || onBridge(x, z) || onPavilion(x, z)) continue;
      if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < 0.5)) continue;
      out.push([x, z, rng.range(0.23, 0.31), rng.range(0, Math.PI)]);
    }
  };
  for (const sp of SPURS) lay(sp, 0.68);
  lay(LOOP, 0.72);
  return out;
}
