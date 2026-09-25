// 家园 · the homestead's catalog: every kind of thing the owner can put on the plot — what it is
// called, which shelf it sits on, how many cells it covers, what it costs — and how to build it in
// low-poly toon-and-ink (warm 青绿 palette: vermilion pillars, indigo-teal tiles, jade leaves, ochre
// earth, rouge blossoms). Also the plot's grid logic (footprints, rotation, what fits where, the
// resale), shared by the builder (./build), the homestead's life (./life) and the tests.
//
// Pure: no DOM and no three.js at runtime. A builder draws through a Brush (./build/brush.ts), in
// the thing's own frame: origin at the centre of its footprint on the ground, +x across its width,
// +z out of its front (a house's door faces +z), y up; one unit = one metre = one cell.
import { HOME_PLOT } from '../../map';
import type { HomeItem } from '../../../../app/home';

// ───────────────────────────── the plot's grid ─────────────────────────────

/** Cells along each side of the plot (24). */
export const GRID = Math.round(HOME_PLOT.size / HOME_PLOT.cell);
/** World x / z of the plot's north-west corner. */
export const PLOT_X0 = HOME_PLOT.x - HOME_PLOT.size / 2;
export const PLOT_Z0 = HOME_PLOT.z - HOME_PLOT.size / 2;
const CELL = HOME_PLOT.cell;

/** The gate's opening in the east fence: cells j0 … j1 (inclusive) at i = GRID − 1. */
export const GATE_J: [number, number] = [
  Math.floor((HOME_PLOT.gate.z - PLOT_Z0) / CELL - 1),
  Math.floor((HOME_PLOT.gate.z - PLOT_Z0) / CELL),
];
/** Cells kept clear inside the gate (the way in, paved with stone slabs). */
export const GATE_CELLS: [number, number][] = [];
for (let i = GRID - 3; i < GRID; i++) for (let j = GATE_J[0]; j <= GATE_J[1]; j++) GATE_CELLS.push([i, j]);
const gateSet = new Set(GATE_CELLS.map(([i, j]) => i * 1000 + j));
export const isGateCell = (i: number, j: number) => gateSet.has(i * 1000 + j);

export type Rot = 0 | 1 | 2 | 3;

/** A footprint turned rot × 90°: odd turns swap width and depth. */
export function footprint(k: { w: number; d: number }, rot: number): { w: number; d: number } {
  return rot % 2 ? { w: k.d, d: k.w } : { w: k.w, d: k.d };
}

/** The cells (i, j) a thing covers when its turned footprint's north-west cell is (i, j). */
export function cellsOf(k: { w: number; d: number }, i: number, j: number, rot: number): [number, number][] {
  const f = footprint(k, rot);
  const out: [number, number][] = [];
  for (let a = 0; a < f.w; a++) for (let b = 0; b < f.d; b++) out.push([i + a, j + b]);
  return out;
}

/** Inside the plot? */
export function inPlot(k: { w: number; d: number }, i: number, j: number, rot: number): boolean {
  const f = footprint(k, rot);
  return i >= 0 && j >= 0 && i + f.w <= GRID && j + f.d <= GRID;
}

export type FitReason = 'ok' | 'bounds' | 'gate' | 'overlap' | 'unknown';
export interface Fit { ok: boolean; reason: FitReason; /** uids of the things in the way */ clash: string[] }

/**
 * Can `kind` stand with its north-west cell at (i, j), turned rot? Things may not overlap (except
 * a bridge over a pond), leave the plot, or block the way in at the gate. `ignore` is the uid of a
 * thing being moved (it does not block itself).
 */
export function fits(items: readonly Pick<HomeItem, 'uid' | 'kind' | 'i' | 'j' | 'rot'>[], kind: string, i: number, j: number, rot: number, ignore?: string): Fit {
  const k = KIND[kind];
  if (!k) return { ok: false, reason: 'unknown', clash: [] };
  if (!inPlot(k, i, j, rot)) return { ok: false, reason: 'bounds', clash: [] };
  const mine = cellsOf(k, i, j, rot);
  if (mine.some(([a, b]) => isGateCell(a, b))) return { ok: false, reason: 'gate', clash: [] };
  const want = new Set(mine.map(([a, b]) => a * 1000 + b));
  const clash: string[] = [];
  for (const it of items) {
    if (it.uid === ignore) continue;
    const o = KIND[it.kind];
    if (!o) continue;
    if (k.over?.includes(o.id) || o.over?.includes(k.id)) continue;
    const f = footprint(o, it.rot);
    // quick reject on the rectangles, then the cells
    const mf = footprint(k, rot);
    if (it.i >= i + mf.w || it.i + f.w <= i || it.j >= j + mf.d || it.j + f.d <= j) continue;
    if (cellsOf(o, it.i, it.j, it.rot).some(([a, b]) => want.has(a * 1000 + b))) clash.push(it.uid);
  }
  return clash.length ? { ok: false, reason: 'overlap', clash } : { ok: true, reason: 'ok', clash };
}

/** What selling a thing back gives: half its price, rounded down. */
export const resale = (price: number) => Math.max(0, Math.floor(price * 0.5));

/** Where a placed thing stands in the world: its centre, its heading (radians about +Y), its turned footprint. */
export function itemPose(it: Pick<HomeItem, 'kind' | 'i' | 'j' | 'rot'>): { x: number; z: number; heading: number; w: number; d: number } {
  const k = KIND[it.kind] ?? { w: 1, d: 1 };
  const f = footprint(k, it.rot);
  return { x: PLOT_X0 + (it.i + f.w / 2) * CELL, z: PLOT_Z0 + (it.j + f.d / 2) * CELL, heading: (it.rot * Math.PI) / 2, w: f.w, d: f.d };
}

/** A point given in a thing's own frame (lx across, lz out of its front), in the world. */
export function itemPoint(it: Pick<HomeItem, 'kind' | 'i' | 'j' | 'rot'>, lx: number, lz: number): { x: number; z: number } {
  const p = itemPose(it);
  const c = Math.cos(p.heading), s = Math.sin(p.heading);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** The cell under a world point, or null off the plot. */
export function cellAt(x: number, z: number): { i: number; j: number } | null {
  const i = Math.floor((x - PLOT_X0) / CELL), j = Math.floor((z - PLOT_Z0) / CELL);
  return i >= 0 && j >= 0 && i < GRID && j < GRID ? { i, j } : null;
}

/** Is a world point on the plot (inside the fence)? */
export const onPlot = (x: number, z: number, margin = 0) =>
  x > PLOT_X0 - margin && x < PLOT_X0 + GRID * CELL + margin && z > PLOT_Z0 - margin && z < PLOT_Z0 + GRID * CELL + margin;

/** The water cells nobody can walk on: every pond cell not under a bridge (`skip`: a thing left out). */
export function wetCells(items: readonly Pick<HomeItem, 'uid' | 'kind' | 'i' | 'j' | 'rot'>[], skip?: string | null): [number, number][] {
  const dry = new Set<number>();
  for (const it of items) {
    const k = KIND[it.kind];
    if (!k?.over || it.uid === skip) continue;
    for (const [a, b] of cellsOf(k, it.i, it.j, it.rot)) dry.add(a * 1000 + b);
  }
  const out: [number, number][] = [];
  for (const it of items) {
    const k = KIND[it.kind];
    if (!k?.wet || it.uid === skip) continue;
    for (const c of cellsOf(k, it.i, it.j, it.rot)) if (!dry.has(c[0] * 1000 + c[1])) out.push(c);
  }
  return out;
}

const STEP = 0.25;
const NS = Math.round((GRID * CELL) / STEP);
let walkGrid: Uint8Array | null = null;
let walkQueue: Int32Array | null = null;

/**
 * Can a walker of radius `pr` standing at (x, z) on the plot get out through the gate, going round
 * these round colliders (walls, posts, water)? A flood over a 25 cm lattice of the plot, from where
 * they stand to the cells kept clear inside the gate. Off the plot: always true.
 */
export function canWalkOut(circles: readonly { x: number; z: number; r: number }[], x: number, z: number, pr = 0.28): boolean {
  if (!onPlot(x, z)) return true;
  const N = NS * NS;
  const g = (walkGrid ??= new Uint8Array(N));
  const q = (walkQueue ??= new Int32Array(N));
  g.fill(0);
  // 1 = blocked
  for (const c of circles) {
    const R = c.r + pr;
    const a0 = Math.max(0, Math.floor((c.x - R - PLOT_X0) / STEP)), a1 = Math.min(NS - 1, Math.ceil((c.x + R - PLOT_X0) / STEP));
    const b0 = Math.max(0, Math.floor((c.z - R - PLOT_Z0) / STEP)), b1 = Math.min(NS - 1, Math.ceil((c.z + R - PLOT_Z0) / STEP));
    for (let a = a0; a <= a1; a++) {
      const sx = PLOT_X0 + (a + 0.5) * STEP - c.x;
      for (let b = b0; b <= b1; b++) {
        const sz = PLOT_Z0 + (b + 0.5) * STEP - c.z;
        if (sx * sx + sz * sz < R * R) g[a * NS + b] = 1;
      }
    }
  }
  // seeds: the open lattice points within reach of where the walker stands (2 = reached)
  let head = 0, tail = 0;
  const ax = Math.floor((x - PLOT_X0) / STEP), bz = Math.floor((z - PLOT_Z0) / STEP);
  for (let a = ax - 2; a <= ax + 2; a++) for (let b = bz - 2; b <= bz + 2; b++) {
    if (a < 0 || b < 0 || a >= NS || b >= NS || g[a * NS + b]) continue;
    const sx = PLOT_X0 + (a + 0.5) * STEP - x, sz = PLOT_Z0 + (b + 0.5) * STEP - z;
    if (sx * sx + sz * sz > 0.45 * 0.45) continue;
    g[a * NS + b] = 2;
    q[tail++] = a * NS + b;
  }
  const gi0 = Math.round(((GRID - 3) * CELL) / STEP), gj0 = Math.round((GATE_J[0] * CELL) / STEP), gj1 = Math.round(((GATE_J[1] + 1) * CELL) / STEP);
  while (head < tail) {
    const s = q[head++];
    const a = (s / NS) | 0, b = s - a * NS;
    if (a >= gi0 && b >= gj0 && b < gj1) return true;
    if (a > 0 && !g[s - NS]) { g[s - NS] = 2; q[tail++] = s - NS; }
    if (a < NS - 1 && !g[s + NS]) { g[s + NS] = 2; q[tail++] = s + NS; }
    if (b > 0 && !g[s - 1]) { g[s - 1] = 2; q[tail++] = s - 1; }
    if (b < NS - 1 && !g[s + 1]) { g[s + 1] = 2; q[tail++] = s + 1; }
  }
  return false;
}

/** How ripe a vegetable plot is: 0 sown … 3 ripe. */
export function growStage(it: Pick<HomeItem, 'grow'>, today: string, diffDays: (a: string, b: string) => number): number {
  const g = it.grow;
  if (!g) return 0;
  return Math.max(0, Math.min(3, diffDays(g.sown, today) + g.boost));
}
/** Coins for a ripe plot's harvest (once a day each). */
export const HARVEST_COINS = 8;

// ───────────────────────────── the brush a builder draws with ─────────────────────────────

export type V3 = readonly [number, number, number];
/** Material families (each one draw for the whole plot): solid (toon + ink edge lines), soft (toon + ink hull: leaves, blossoms, rocks), glow (lit at night: lanterns, window paper), water. */
export type Bucket = 'solid' | 'soft' | 'glow' | 'water';
/** Vertex-shader motion: spin (a windmill), swing (a pendulum: the swing seat, a hanging lantern), sway (leaves and stems, more with height), hang (cloth on a line, more further down). */
export type AnimKind = 'spin' | 'swing' | 'sway' | 'hang';
export interface Anim {
  kind: AnimKind;
  /** Pivot (spin / swing), or the root (sway) / the line (hang), in the thing's frame. */
  pivot: V3;
  /** Axis for spin / swing. */
  axis?: V3;
  /** spin: rad/s; swing: amplitude (rad); sway / hang: metres of drift per metre² of lever. */
  rate: number;
}
export interface PartOpts {
  /** Euler rotation (order YXZ), radians. */
  rx?: number; ry?: number; rz?: number;
  /** Scale, applied before the rotation. */
  s?: V3;
  bucket?: Bucket;
  /** Crease angle for ink edge lines (solid only); false: none. */
  edges?: number | false;
  anim?: Anim;
  /** Colour jitter (0.06 = ±3 %). */
  jitter?: number;
  /** Radial segments for cylinders and discs. */
  seg?: number;
}
export interface RoofSpec {
  /** Eave rectangle (overhang included), centred at (cx, cz). */
  w: number; d: number; cx?: number; cz?: number;
  /** Height of the eave line, and of the ridge above it. */
  y: number; rise: number;
  /** Half length of the ridge along x: 0 = a pyramid; ≥ w / 2 = a gable roof (open ends). */
  ridge: number;
  /** Concave sweep (1 = straight; 1.7 = the Chinese curve, flat at the eaves, steep at the ridge). */
  curve?: number;
  /** Upturned corners (m). */
  curl?: number;
  thick?: number;
  color: string;
  /** Soffit and edge colour. */
  under?: string;
  /** Spacing of ink tile lines down the slopes (0: none). */
  tiles?: number;
  jitter?: number;
}
/** Words painted on a board: a plaque's text, a couplet's right (上联) or left (下联) line, or the homestead's name. */
export type LabelKind = 'plaque' | 'couplet-r' | 'couplet-l' | 'name';

export interface Brush {
  /** Seeded per thing (the same thing always looks the same). */
  readonly rng: () => number;
  /** A box centred at `at`. */
  box(w: number, h: number, d: number, color: string, at: V3, o?: PartOpts): void;
  /** A cylinder (or cone, rTop = 0) centred at `at`. */
  cyl(rTop: number, rBot: number, h: number, color: string, at: V3, o?: PartOpts): void;
  /** A smooth blob (foliage, blossom, a rock): soft bucket by default. */
  ball(r: number, color: string, at: V3, o?: PartOpts & { detail?: number; lumpy?: number }): void;
  /** A ring (torus) around local z, centred at `at`. */
  ring(r: number, tube: number, color: string, at: V3, o?: PartOpts): void;
  /** A beam (square, or round) from a to b. */
  beam(a: V3, b: V3, size: number, color: string, o?: PartOpts & { round?: boolean }): void;
  /** A flat disc facing up at height y (a water surface, a lily pad, a slab). */
  disc(r: number, color: string, at: V3, o?: PartOpts & { sx?: number; sz?: number }): void;
  roof(r: RoofSpec, o?: PartOpts): void;
  /** Raw ink segments: x0,y0,z0, x1,y1,z1, … */
  lines(pts: number[]): void;
  /** A board of words (see LabelKind), a vertical quad centred at `at` facing +z turned by ry. */
  label(kind: LabelKind, at: V3, w: number, h: number, ry?: number): void;
  // ── how it behaves
  /** Solid: the walker goes round it (a trunk, a post). */
  solid(x: number, z: number, r: number, h?: number): void;
  /** A solid rectangle (walls), filled with round colliders. */
  solidRect(x0: number, z0: number, x1: number, z1: number, h?: number): void;
  /** Keep the walking camera out of a band (a lintel, a sign board): a vertical cylinder from y0 to y1. Roofs add their own. */
  occlude(x: number, z: number, r: number, y0: number, y1: number): void;
  /** A walkable floor along a → b (half width hw) at height y (or a profile over −L/2 … L/2). */
  floor(a: readonly [number, number], b: readonly [number, number], hw: number, y: number | ((s: number) => number)): void;
  /** Somewhere to sit, facing `heading`; `stand` is where you get up to. */
  seat(x: number, y: number, z: number, heading: number, stand: readonly [number, number]): void;
  /** A warm halo at night (lanterns, windows). */
  light(x: number, y: number, z: number, size?: number): void;
  /** A chimney: smoke rises here. */
  smoke(x: number, y: number, z: number): void;
}

export interface BuildOpts {
  /** The owner's words (plaques, couplets), or the default. */
  text: string;
  /** A vegetable plot's ripeness 0 … 3. */
  stage: number;
}

export type HomeCat = 'house' | 'garden' | 'thing' | 'farm' | 'pet';
export const HOME_CATS: { id: HomeCat; zh: string; en: string; glyph: string }[] = [
  { id: 'house', zh: '屋舍', en: 'Buildings', glyph: '屋' },
  { id: 'garden', zh: '园景', en: 'Garden', glyph: '园' },
  { id: 'thing', zh: '器物', en: 'Things', glyph: '器' },
  { id: 'farm', zh: '田园', en: 'Farm', glyph: '田' },
  { id: 'pet', zh: '宠居', en: 'Pet homes', glyph: '宠' },
];

/** What a thing does when you walk up to it. */
export type HomeUse = 'sit' | 'table' | 'swing' | 'well' | 'farm' | 'text';

export interface HomeKind {
  id: string;
  zh: string;
  en: string;
  cat: HomeCat;
  /** Footprint in cells (unturned: w across, d front to back). */
  w: number;
  d: number;
  /** 铜钱 (0: a gift). */
  price: number;
  noteZh: string;
  noteEn: string;
  /** Rough height (m): the camera and the thumbnails. */
  h: number;
  /** Pets this is a home for (see features/home/life). */
  pets?: string[];
  /** Where its animal comes and goes, in its own frame (x, z). */
  door?: readonly [number, number];
  /** Carries words the owner writes: a plaque, or a couplet (上联/下联). */
  text?: 'plaque' | 'couplet';
  defaultText?: string;
  use?: HomeUse;
  /** Kinds it may overlap (a bridge over a pond). */
  over?: string[];
  /** Water: the cells it covers are not walkable (except under a bridge). */
  wet?: boolean;
  /** Placed for free on the first visit. */
  starter?: boolean;
  build(b: Brush, o: BuildOpts): void;
}

// ───────────────────────────── palette (warm 青绿, moderate saturation) ─────────────────────────────

export const HC = {
  paper: '#f1e9d8', plaster: '#f1e5cd', mud: '#d8ba88', mudDark: '#b39168',
  wood: '#8e5b37', woodDark: '#5b3a26', woodLight: '#c0935f', lacquer: '#b43b2a', vermilion: '#c9482f',
  thatch: '#d0a75d', thatchDark: '#a37c3e', tile: '#4a7a80', tileDark: '#34585e', tileEdge: '#2f4a50',
  stone: '#c3b8a1', stoneDark: '#9d917b', stoneWarm: '#d0c3a7', slab: '#bbb09a',
  leaf: '#5f9147', leafDark: '#45733a', leafLight: '#95bb5a', jade: '#70a058', bamboo: '#adbc5e', bambooDark: '#7e9b46',
  ochre: '#bb7b3f', soil: '#6f4b32', soilLight: '#8d6545',
  rouge: '#d6627b', blossom: '#f3acb9', blossomDeep: '#e6879d', plum: '#c93b52', gamboge: '#e6ab36', gold: '#dbad4a',
  water: '#6eaaa3', waterDeep: '#3f6f6e', lantern: '#d9452f', amber: '#f1a44b', window: '#f6e2b2',
  ink: '#2b221c', indigo: '#3d5f8e', white: '#f6f1e6', terracotta: '#b6653d', hay: '#dbbb68', porcelain: '#eef0e8',
} as const;

const TAU = Math.PI * 2;

// ───────────────────────────── shared pieces ─────────────────────────────

/** A paper lantern hanging with its centre at (x, y, z): lit at night. */
function lantern(b: Brush, x: number, y: number, z: number, color: string = HC.lantern, s = 1, anim?: Anim): void {
  b.ball(0.16 * s, color, [x, y, z], { bucket: 'glow', s: [1, 0.86, 1], detail: 1, anim });
  b.cyl(0.075 * s, 0.09 * s, 0.05 * s, HC.ink, [x, y + 0.14 * s, z], { anim, edges: false, seg: 8 });
  b.cyl(0.09 * s, 0.075 * s, 0.05 * s, HC.ink, [x, y - 0.14 * s, z], { anim, edges: false, seg: 8 });
  b.cyl(0.012 * s, 0.035 * s, 0.17 * s, HC.gamboge, [x, y - 0.27 * s, z], { anim, edges: false, seg: 5 });
  b.light(x, y, z, 1.1 * s);
}

/** A lattice window of warm paper (lit at night) in a dark frame, centred at (x, y, z), facing +z turned by ry. */
function lattice(b: Brush, x: number, y: number, z: number, w: number, h: number, ry = 0, frame: string = HC.woodDark): void {
  const nx = Math.sin(ry), nz = Math.cos(ry), ax = Math.cos(ry), az = -Math.sin(ry);
  const at = (u: number, v: number, n: number): V3 => [x + ax * u + nx * n, y + v, z + az * u + nz * n];
  b.box(w + 0.14, h + 0.14, 0.06, frame, at(0, 0, 0), { ry });
  b.box(w, h, 0.03, HC.window, at(0, 0, 0.028), { ry, bucket: 'glow', edges: false });
  // 步步锦-ish muntins
  const cols = Math.max(2, Math.round(w / 0.22)), rows = Math.max(2, Math.round(h / 0.22));
  for (let c = 1; c < cols; c++) b.box(0.025, h, 0.03, frame, at(-w / 2 + (w * c) / cols, 0, 0.05), { ry, edges: false });
  for (let r = 1; r < rows; r++) b.box(w, 0.025, 0.03, frame, at(0, -h / 2 + (h * r) / rows, 0.05), { ry, edges: false });
  b.light(at(0, 0, 0.35)[0], y, at(0, 0, 0.35)[2], 1.3);
}

/** A tapering trunk through `pts` (round beams). */
function trunk(b: Brush, pts: V3[], r0: number, r1: number, color: string, anim?: Anim): void {
  for (let i = 1; i < pts.length; i++) {
    const r = r0 + ((r1 - r0) * (i - 0.5)) / (pts.length - 1);
    b.beam(pts[i - 1], pts[i], r * 2, color, { round: true, edges: false, anim });
  }
}

const sway = (x: number, z: number, rate = 0.0035, y = 0): Anim => ({ kind: 'sway', pivot: [x, y, z], rate });

/** A leafy crown: n blobs round a centre. */
function crown(b: Brush, cx: number, cy: number, cz: number, R: number, n: number, colors: string[], anim: Anim, lumpy = 0.18): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + b.rng() * 0.8;
    const d = i === 0 ? 0 : R * (0.45 + b.rng() * 0.35);
    const r = R * (i === 0 ? 0.72 : 0.42 + b.rng() * 0.22);
    b.ball(r, colors[i % colors.length], [cx + Math.cos(a) * d, cy + (b.rng() - 0.35) * R * 0.5, cz + Math.sin(a) * d], { anim, lumpy, s: [1, 0.82, 1] });
  }
}

/** Small blossoms scattered along a branch a → b. */
function blossoms(b: Brush, a: V3, c: V3, n: number, colors: string[], r: number, anim: Anim): void {
  for (let i = 0; i < n; i++) {
    const t = 0.25 + (0.75 * (i + b.rng() * 0.6)) / n;
    const j = () => (b.rng() - 0.5) * 0.14;
    b.ball(r * (0.75 + b.rng() * 0.5), colors[Math.floor(b.rng() * colors.length)], [a[0] + (c[0] - a[0]) * t + j(), a[1] + (c[1] - a[1]) * t + j(), a[2] + (c[2] - a[2]) * t + j()], { detail: 0, anim });
  }
}

/** A stretch of low bamboo fence from a to c (x, z) — the plot's own fence uses it too. */
export function bambooFence(b: Brush, a: readonly [number, number], c: readonly [number, number], h = 0.85, ground: (x: number, z: number) => number = () => 0): void {
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
  if (L < 0.05) return;
  const ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L, nx = -uz, nz = ux;
  const at = (u: number, off = 0): [number, number, number] => {
    const x = a[0] + ux * u + nx * off, z = a[1] + uz * u + nz * off;
    return [x, ground(x, z), z];
  };
  const n = Math.max(1, Math.round(L / 0.95));
  for (let k = 0; k <= n; k++) {
    const [x, y, z] = at((L * k) / n);
    b.cyl(0.04, 0.045, h + 0.1, HC.bamboo, [x, y + (h + 0.1) / 2 - 0.05, z], { edges: false, seg: 6 });
    b.cyl(0.05, 0.05, 0.03, HC.bambooDark, [x, y + h * 0.55, z], { edges: false, seg: 6 });
  }
  for (const f of [0.32, 0.72]) {
    for (let k = 0; k < n; k++) {
      const p = at((L * k) / n, 0.03), q = at((L * (k + 1)) / n, 0.03);
      b.beam([p[0], p[1] + h * f, p[2]], [q[0], q[1] + h * f, q[2]], 0.035, HC.bambooDark, { round: true, edges: false });
    }
  }
  // criss-cross slats (篱笆)
  const m = Math.max(2, Math.round(L / 0.32));
  for (let k = 0; k < m; k++) {
    const s = k % 2 ? 1 : -1;
    const p = at((L * k) / m, -0.02 * s), q = at((L * (k + 1)) / m, -0.02 * s);
    b.beam([p[0], p[1] + 0.06, p[2]], [q[0], q[1] + h * 0.86, q[2]], 0.022, k % 3 ? HC.bamboo : HC.hay, { round: true, edges: false });
    const p2 = at((L * k) / m, 0.02 * s), q2 = at((L * (k + 1)) / m, 0.02 * s);
    b.beam([q2[0], q2[1] + 0.06, q2[2]], [p2[0], p2[1] + h * 0.86, p2[2]], 0.022, HC.bamboo, { round: true, edges: false });
  }
}

/** A stone plinth sunk a little into the ground (hides any slope). */
function plinth(b: Brush, w: number, d: number, top: number, color: string = HC.stone, z = 0): void {
  b.box(w, top + 0.4, d, color, [0, (top - 0.4) / 2, z], { jitter: 0.05 });
}

// ───────────────────────────── the catalog ─────────────────────────────

export const CATALOG: HomeKind[] = [
  // ─────────── 屋舍 buildings
  {
    id: 'cottage', zh: '茅屋', en: 'Thatched cottage', cat: 'house', w: 4, d: 3, price: 0, h: 3.6, starter: true,
    noteZh: '泥墙茅顶，一灯一灶，家的起头。', noteEn: 'Mud walls, a thatched roof, a lamp and a stove: where a home begins.',
    build(b) {
      const W = 3.4, D = 2.3, H = 1.95, base = 0.22;
      plinth(b, 3.8, 2.75, base);
      b.box(W, H, D, HC.mud, [0, base + H / 2, 0], { jitter: 0.07 });
      b.box(W + 0.04, 0.34, D + 0.04, HC.mudDark, [0, base + 0.17, 0], { jitter: 0.05 });
      for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]] as const) b.box(0.17, H + 0.04, 0.17, HC.woodDark, [x, base + H / 2, z]);
      b.box(W + 0.12, 0.14, 0.15, HC.wood, [0, base + H - 0.06, D / 2 + 0.02]);
      b.box(W + 0.12, 0.14, 0.15, HC.wood, [0, base + H - 0.06, -D / 2 - 0.02]);
      // door (ajar: a dark gap and one leaf)
      b.box(0.86, 1.5, 0.04, '#2e211a', [-0.7, base + 0.75, D / 2 + 0.01], { edges: false });
      b.box(0.42, 1.48, 0.05, HC.wood, [-0.92, base + 0.74, D / 2 + 0.04]);
      b.box(1.02, 0.1, 0.1, HC.woodDark, [-0.7, base + 1.55, D / 2 + 0.05]);
      b.box(0.08, 1.55, 0.1, HC.woodDark, [-1.17, base + 0.78, D / 2 + 0.05]);
      b.box(0.08, 1.55, 0.1, HC.woodDark, [-0.23, base + 0.78, D / 2 + 0.05]);
      // red paper on the door, a string of chillies and one of corn by it
      b.box(0.2, 0.2, 0.01, HC.lacquer, [-0.92, base + 1.15, D / 2 + 0.07], { rz: Math.PI / 4, edges: false });
      for (let k = 0; k < 6; k++) b.ball(0.045, k % 2 ? HC.plum : HC.lantern, [0.02, base + 1.55 - k * 0.1, D / 2 + 0.1], { detail: 0, s: [0.8, 1.5, 0.8] });
      for (let k = 0; k < 4; k++) b.ball(0.06, HC.gamboge, [-0.1, base + 1.5 - k * 0.12, D / 2 + 0.12], { detail: 0, s: [0.9, 1.4, 0.9] });
      lattice(b, 0.8, base + 1.2, D / 2 + 0.02, 0.9, 0.6);
      lattice(b, W / 2 + 0.02, base + 1.2, -0.2, 0.62, 0.5, Math.PI / 2);
      b.roof({ w: 4.35, d: 3.35, y: base + H - 0.08, rise: 1.3, ridge: 0.85, curve: 1.08, thick: 0.28, color: HC.thatch, under: HC.thatchDark, jitter: 0.12 });
      b.cyl(0.14, 0.14, 1.95, HC.thatchDark, [0, base + H - 0.08 + 1.33, 0], { rz: Math.PI / 2, seg: 7, edges: false });
      // chimney and its smoke
      b.box(0.34, 1.05, 0.34, HC.mudDark, [1.05, base + H + 0.95, -0.6]);
      b.box(0.44, 0.08, 0.44, HC.stoneDark, [1.05, base + H + 1.5, -0.6]);
      b.smoke(1.05, base + H + 1.6, -0.6);
      // firewood by the west wall, a water jar and a stool by the door
      for (let k = 0; k < 7; k++) {
        const row = k < 4 ? 0 : 1, c = row ? k - 4 : k;
        b.cyl(0.075, 0.075, 0.8, k % 3 ? HC.woodLight : HC.wood, [-W / 2 - 0.2, 0.08 + row * 0.14, -0.6 + c * 0.16 + row * 0.08], { rx: Math.PI / 2, seg: 6, edges: false });
      }
      b.cyl(0.2, 0.15, 0.42, HC.terracotta, [0.2, 0.21, D / 2 + 0.3], { seg: 9, edges: false });
      b.disc(0.17, HC.waterDeep, [0.2, 0.43, D / 2 + 0.3], { bucket: 'water', seg: 9 });
      b.box(0.8, 0.07, 0.26, HC.woodLight, [1.0, 0.36, D / 2 + 0.33]);
      for (const x of [0.68, 1.32]) b.box(0.06, 0.34, 0.2, HC.woodDark, [x, 0.17, D / 2 + 0.33]);
      b.box(0.9, 0.12, 0.45, HC.slab, [-0.7, 0.06, D / 2 + 0.36]);
      lantern(b, -0.1, base + H - 0.28, D / 2 + 0.52, HC.lantern, 0.85);
      b.solidRect(-W / 2 - 0.1, -D / 2 - 0.1, W / 2 + 0.1, D / 2 + 0.1, 3.3);
      b.seat(1.0, 0.4, D / 2 + 0.35, 0, [1.0, D / 2 + 0.95]);
    },
  },
  {
    id: 'house', zh: '瓦房', en: 'Tiled house', cat: 'house', w: 5, d: 4, price: 520, h: 4.4,
    noteZh: '粉墙青瓦，朱柱门廊，檐下两盏灯。', noteEn: 'White walls, teal tiles, a porch on vermilion columns, two lanterns under the eaves.',
    build(b) {
      const base = 0.3, H = 2.3, W = 4.2, zb = -1.75, zf = 1.05;
      plinth(b, 4.8, 3.7, base, HC.stone, -0.1);
      b.box(1.5, 0.15, 0.35, HC.slab, [0, 0.075, 1.85]);
      const zc = (zb + zf) / 2, D = zf - zb;
      b.box(W, H, D, HC.plaster, [0, base + H / 2, zc], { jitter: 0.03 });
      b.box(W + 0.04, 0.45, D + 0.04, HC.stoneDark, [0, base + 0.22, zc]);
      for (const [x, z] of [[-W / 2, zb], [W / 2, zb], [-W / 2, zf], [W / 2, zf]] as const) b.box(0.18, H, 0.18, HC.woodDark, [x, base + H / 2, z]);
      b.box(W + 0.2, 0.2, 0.2, HC.woodDark, [0, base + H - 0.1, zf + 0.02]);
      b.box(W + 0.2, 0.2, 0.2, HC.woodDark, [0, base + H - 0.1, zb - 0.02]);
      // porch columns on stone drums, a beam across them
      for (const x of [-1.95, 1.95]) {
        b.cyl(0.1, 0.1, H, HC.vermilion, [x, base + H / 2, 1.55], { seg: 10, edges: false });
        b.cyl(0.16, 0.17, 0.14, HC.stoneWarm, [x, base + 0.07, 1.55], { seg: 10, edges: false });
      }
      b.box(4.2, 0.18, 0.16, HC.vermilion, [0, base + H - 0.12, 1.55]);
      b.box(4.0, 0.1, 0.05, HC.gold, [0, base + H - 0.28, 1.58], { edges: false });
      // doors, knockers, red paper strips, windows
      b.box(1.2, 1.85, 0.06, HC.lacquer, [0, base + 0.93, zf + 0.03]);
      b.box(0.04, 1.85, 0.07, HC.woodDark, [0, base + 0.93, zf + 0.05], { edges: false });
      for (const x of [-0.12, 0.12]) b.ball(0.05, HC.gold, [x, base + 1.0, zf + 0.09], { detail: 0, bucket: 'solid' });
      for (const x of [-0.82, 0.82]) b.box(0.2, 1.2, 0.02, HC.lantern, [x, base + 1.1, zf + 0.02], { edges: false });
      lattice(b, -1.45, base + 1.35, zf + 0.02, 0.85, 0.8, 0, HC.wood);
      lattice(b, 1.45, base + 1.35, zf + 0.02, 0.85, 0.8, 0, HC.wood);
      lattice(b, W / 2 + 0.02, base + 1.35, zc, 0.7, 0.6, Math.PI / 2, HC.wood);
      lattice(b, -W / 2 - 0.02, base + 1.35, zc, 0.7, 0.6, -Math.PI / 2, HC.wood);
      // roof: hipped, teal tiles, the corners turned up
      const ry = base + H + 0.02;
      b.roof({ w: 5.6, d: 4.6, cz: -0.12, y: ry, rise: 1.5, ridge: 1.25, curve: 1.7, curl: 0.3, thick: 0.16, color: HC.tile, under: '#6d4a33', tiles: 0.24 });
      b.box(2.8, 0.22, 0.26, HC.tileDark, [0, ry + 1.58, -0.12]);
      for (const s of [-1, 1]) b.box(0.18, 0.42, 0.22, HC.tileDark, [s * 1.45, ry + 1.75, -0.12], { rz: -s * 0.45 });
      b.box(0.24, 0.9, 0.3, HC.plaster, [1.3, ry + 1.1, -1.25]);
      b.smoke(1.3, ry + 1.6, -1.25);
      lantern(b, -1.25, base + H - 0.42, 1.75, HC.lantern, 0.9);
      lantern(b, 1.25, base + H - 0.42, 1.75, HC.lantern, 0.9);
      // a potted plant and a bench on the porch
      b.cyl(0.16, 0.12, 0.28, HC.porcelain, [-1.6, base + 0.14, 1.3], { seg: 8, edges: false });
      crown(b, -1.6, base + 0.5, 1.3, 0.22, 3, [HC.leaf, HC.leafLight], sway(-1.6, 1.3, 0.004, base));
      b.solidRect(-W / 2 - 0.1, zb - 0.1, W / 2 + 0.1, zf + 0.1, 3.6);
      for (const x of [-1.95, 1.95]) b.solid(x, 1.55, 0.14, 2.6);
      b.floor([-2.3, 1.45], [2.3, 1.45], 0.38, base);
    },
  },
  {
    id: 'study', zh: '书斋', en: 'Study', cat: 'house', w: 4, d: 4, price: 780, h: 4, use: 'sit',
    noteZh: '竹帘半卷，一窗月洞，满架诗书，门前芭蕉。', noteEn: 'A half-rolled blind, a moon window, shelves of books, a banana plant by the door.',
    build(b) {
      const base = 0.28, H = 2.25, W = 3.4, zb = -1.6, zf = 0.9;
      plinth(b, 3.9, 3.7, base, HC.stoneWarm, -0.1);
      const zc = (zb + zf) / 2;
      // back and side walls, open front with a veranda
      b.box(W, H, 0.16, HC.plaster, [0, base + H / 2, zb]);
      b.box(0.16, H, zf - zb, HC.plaster, [-W / 2, base + H / 2, zc]);
      b.box(0.16, H, zf - zb, HC.plaster, [W / 2, base + H / 2, zc]);
      b.box(W + 0.2, 0.4, zf - zb + 0.2, HC.stoneDark, [0, base + 0.2, zc], { edges: 60 });
      for (const x of [-W / 2, -0.6, 0.6, W / 2]) b.box(0.16, H, 0.16, HC.woodDark, [x, base + H / 2, zf]);
      b.box(W + 0.3, 0.18, 0.18, HC.woodDark, [0, base + H - 0.09, zf]);
      // half-rolled bamboo blinds, low lattice rail at the sides
      b.cyl(0.07, 0.07, 1.1, HC.hay, [0, base + H - 0.3, zf + 0.05], { rz: Math.PI / 2, seg: 8, edges: false });
      b.box(1.1, 0.5, 0.02, HC.hay, [0, base + H - 0.6, zf + 0.06], { edges: false });
      for (const x of [-1.1, 1.1]) {
        b.box(1.0, 0.06, 0.06, HC.wood, [x, base + 0.62, zf + 0.02]);
        for (let k = 0; k < 5; k++) b.box(0.03, 0.5, 0.04, HC.wood, [x - 0.4 + k * 0.2, base + 0.37, zf + 0.02], { edges: false });
      }
      // inside: shelves of books, a scroll, a desk and its lamp
      b.box(2.2, 1.7, 0.36, HC.woodDark, [0, base + 0.95, zb + 0.26]);
      const spines = [HC.indigo, HC.ochre, HC.rouge, HC.jade, HC.white, HC.lacquer];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) {
        const hh = 0.28 + b.rng() * 0.12;
        b.box(0.18, hh, 0.26, spines[(k + r * 2) % spines.length], [-0.92 + k * 0.23, base + 0.36 + r * 0.55 + hh / 2, zb + 0.3], { edges: false });
      }
      b.box(0.5, 1.1, 0.02, HC.white, [1.2, base + 1.35, zb + 0.1], { edges: false });
      b.beam([1.05, base + 1.1, zb + 0.12], [1.35, base + 1.6, zb + 0.12], 0.02, HC.ink, { edges: false });
      b.box(1.3, 0.08, 0.6, HC.wood, [0, base + 0.75, -0.3]);
      for (const [x, z] of [[-0.58, -0.55], [0.58, -0.55], [-0.58, -0.05], [0.58, -0.05]] as const) b.box(0.06, 0.72, 0.06, HC.woodDark, [x, base + 0.37, z], { edges: false });
      b.cyl(0.07, 0.09, 0.2, HC.window, [0.45, base + 0.9, -0.35], { bucket: 'glow', seg: 8, edges: false });
      b.light(0.45, base + 1.0, -0.2, 1.4);
      b.box(0.3, 0.02, 0.22, HC.white, [-0.2, base + 0.8, -0.3], { edges: false });
      // the moon window on the east wall
      b.ring(0.45, 0.07, HC.stoneDark, [W / 2 + 0.06, base + 1.3, zc], { ry: Math.PI / 2 });
      b.cyl(0.42, 0.42, 0.03, HC.window, [W / 2 + 0.04, base + 1.3, zc], { rz: Math.PI / 2, bucket: 'glow', seg: 18, edges: false });
      b.light(W / 2 + 0.4, base + 1.3, zc, 1.3);
      // roof: long ridge, teal tiles
      const ry = base + H;
      b.roof({ w: 4.3, d: 3.6, cz: zc + 0.1, y: ry, rise: 1.25, ridge: 1.3, curve: 1.6, curl: 0.22, thick: 0.15, color: '#4f7c79', under: '#6d4a33', tiles: 0.2 });
      b.box(2.8, 0.18, 0.2, HC.tileDark, [0, ry + 1.32, zc + 0.1]);
      // 芭蕉 by the door
      const bx = -1.55, bz = 1.4, sw = sway(bx, bz, 0.006);
      for (let k = 0; k < 3; k++) b.cyl(0.05, 0.08, 1.1 + k * 0.25, HC.bambooDark, [bx + (k - 1) * 0.12, (1.1 + k * 0.25) / 2, bz + (k % 2) * 0.1], { seg: 6, edges: false, anim: sw });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + 0.4;
        b.ball(0.42, k % 2 ? HC.leafLight : HC.jade, [bx + Math.cos(a) * 0.38, 1.35 + (k % 3) * 0.18, bz + Math.sin(a) * 0.38], { s: [1.6, 0.22, 0.55], ry: -a, rz: 0.35, anim: sw, lumpy: 0.05 });
      }
      b.solidRect(-W / 2 - 0.1, zb - 0.1, W / 2 + 0.1, 0.2, 3.4);
      for (const x of [-W / 2, -0.6, 0.6, W / 2]) b.solid(x, zf, 0.12, 2.4);
      b.solid(bx, bz, 0.3, 1.5);
      b.floor([-1.8, 0.95], [1.8, 0.95], 0.4, base);
      b.seat(0, base, 0.2, Math.PI, [0, 1.5]);
    },
  },

  // ─────────── 园景 garden
  {
    id: 'pavilion', zh: '亭子', en: 'Pavilion', cat: 'garden', w: 3, d: 3, price: 360, h: 4.3, use: 'sit',
    noteZh: '四根朱柱，一顶青瓦，坐看云起。', noteEn: 'Four vermilion pillars under a teal roof: sit and watch the clouds rise.',
    build(b) {
      const top = 0.3;
      plinth(b, 3, 3, top, HC.stoneWarm);
      b.box(3.02, 0.06, 3.02, HC.stoneDark, [0, top - 0.02, 0], { edges: false });
      const P = 1.22;
      for (const [x, z] of [[-P, -P], [P, -P], [-P, P], [P, P]] as const) {
        b.cyl(0.09, 0.1, 2.3, HC.vermilion, [x, top + 1.15, z], { seg: 10, edges: false });
        b.cyl(0.15, 0.15, 0.12, HC.stone, [x, top + 0.06, z], { seg: 10, edges: false });
      }
      for (const s of [-1, 1]) {
        b.box(2.6, 0.16, 0.14, HC.vermilion, [0, top + 2.22, s * P]);
        b.box(0.14, 0.16, 2.6, HC.vermilion, [s * P, top + 2.22, 0]);
        b.box(2.4, 0.05, 0.04, HC.gold, [0, top + 2.08, s * (P + 0.06)], { edges: false });
        b.box(0.04, 0.05, 2.4, HC.gold, [s * (P + 0.06), top + 2.08, 0], { edges: false });
        // 挂落: a little fretwork under the beams
        for (let k = 0; k < 7; k++) b.box(0.03, 0.2, 0.03, HC.woodDark, [-1.05 + k * 0.35, top + 2.02, s * P], { edges: false });
      }
      // 美人靠 benches on the back and west sides
      const bench = (ax: number, az: number, ry: number) => {
        const c = Math.cos(ry), s = Math.sin(ry);
        const at = (u: number, y: number, v: number): V3 => [ax + u * c + v * s, y, az - u * s + v * c];
        b.box(2.2, 0.08, 0.36, HC.wood, at(0, top + 0.44, 0), { ry });
        b.box(2.2, 0.36, 0.08, HC.woodDark, at(0, top + 0.22, 0.12), { ry });
        for (let k = 0; k < 9; k++) b.beam(at(-1.0 + k * 0.25, top + 0.48, -0.16), at(-1.0 + k * 0.25, top + 0.85, -0.3), 0.035, HC.vermilion, { edges: false });
        b.beam(at(-1.1, top + 0.86, -0.3), at(1.1, top + 0.86, -0.3), 0.06, HC.vermilion, { round: true, edges: false });
      };
      bench(0, -1.05, 0);
      bench(-1.05, 0, -Math.PI / 2);
      b.roof({ w: 3.9, d: 3.9, y: top + 2.3, rise: 1.45, ridge: 0, curve: 1.8, curl: 0.42, thick: 0.14, color: '#3f7078', under: HC.vermilion, tiles: 0.26 });
      b.cyl(0.05, 0.12, 0.3, HC.gold, [0, top + 2.3 + 1.5, 0], { seg: 8, edges: false });
      b.ball(0.11, HC.gold, [0, top + 2.3 + 1.72, 0], { bucket: 'solid', detail: 1 });
      lantern(b, P + 0.1, top + 1.95, P + 0.1, HC.lantern, 0.8);
      lantern(b, -P - 0.1, top + 1.95, P + 0.1, HC.amber, 0.8);
      for (const [x, z] of [[-P, -P], [P, -P], [-P, P], [P, P]] as const) b.solid(x, z, 0.13, 2.6);
      b.floor([-1.5, 0], [1.5, 0], 1.5, top);
      b.seat(0.2, top + 0.44, -1.0, 0, [0.2, 0.2]);
    },
  },
  {
    id: 'bridge', zh: '小桥', en: 'Little bridge', cat: 'garden', w: 4, d: 1, price: 180, h: 1.2, over: ['pond'],
    noteZh: '朱栏木桥，可架在池上。', noteEn: 'A wooden bridge with vermilion rails; it can span a pond.',
    build(b) {
      const arch = (x: number) => 0.08 + 0.44 * (1 - (x / 2) * (x / 2));
      const N = 10;
      for (let k = 0; k < N; k++) {
        const x = -1.9 + (3.8 * (k + 0.5)) / N;
        const slope = Math.atan(-0.44 * 2 * x / 4);
        b.box(0.38, 0.08, 1.02, k % 2 ? HC.woodLight : '#b4865a', [x, arch(x) - 0.04, 0], { rz: slope, edges: 40 });
      }
      for (let k = 0; k < 8; k++) {
        const xa = -2 + k * 0.5, xb = xa + 0.5;
        for (const z of [-0.45, 0.45]) b.beam([xa, arch(xa) - 0.12, z], [xb, arch(xb) - 0.12, z], 0.12, HC.woodDark, { edges: false });
      }
      const posts = [-1.85, -0.92, 0, 0.92, 1.85];
      for (const z of [-0.52, 0.52]) {
        for (const x of posts) {
          b.box(0.07, 0.6, 0.07, HC.vermilion, [x, arch(x) + 0.28, z], { edges: 40 });
          b.solid(x, z, 0.07, 0.7);
        }
        for (let k = 1; k < posts.length; k++) {
          const xa = posts[k - 1], xb = posts[k];
          b.beam([xa, arch(xa) + 0.55, z], [xb, arch(xb) + 0.55, z], 0.06, HC.vermilion, { round: true, edges: false });
          b.beam([xa, arch(xa) + 0.25, z], [xb, arch(xb) + 0.25, z], 0.035, HC.vermilion, { round: true, edges: false });
        }
        for (const x of [-1.85, 1.85]) b.ball(0.06, HC.gold, [x, arch(x) + 0.62, z], { detail: 0, bucket: 'solid' });
      }
      for (const x of [-1.0, 1.0]) b.box(0.3, 0.6, 0.9, HC.stoneDark, [x, arch(x) - 0.45, 0]);
      b.floor([-2, 0], [2, 0], 0.46, (s) => arch(s));
    },
  },
  {
    id: 'pond', zh: '水池', en: 'Pond', cat: 'garden', w: 3, d: 3, price: 260, h: 0.9, wet: true, pets: ['koi', 'crane'], door: [1.3, 1.3],
    noteZh: '一池清水，几片荷叶；锦鲤、仙鹤都住这里。', noteEn: 'Clear water and a few lotus leaves; home to koi and cranes.',
    build(b) {
      b.disc(1.32, '#5d6f55', [0, 0.04, 0], { sx: 1.05, sz: 0.95, seg: 22, edges: false });
      b.disc(1.28, HC.water, [0, POND_WATER_Y, 0], { bucket: 'water', sx: 1.05, sz: 0.95, seg: 22 });
      const n = 15;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + b.rng() * 0.2;
        const r = 0.2 + b.rng() * 0.14;
        b.ball(r, [HC.stone, HC.stoneWarm, HC.stoneDark][k % 3], [Math.cos(a) * 1.38, 0.1, Math.sin(a) * 1.3], { s: [1.25, 0.55, 0.9], ry: -a, lumpy: 0.3, detail: 1 });
      }
      const pads: [number, number, number][] = [[-0.5, 0.3, 0.19], [0.3, -0.45, 0.16], [0.55, 0.35, 0.14], [-0.2, -0.2, 0.12]];
      for (const [x, z, r] of pads) b.disc(r, HC.jade, [x, POND_WATER_Y + 0.015, z], { seg: 9, bucket: 'soft' });
      // a lotus in flower and a bud
      const lx = -0.5, lz = 0.3, ly = POND_WATER_Y + 0.12;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        b.ball(0.07, k % 2 ? HC.blossom : HC.rouge, [lx + Math.cos(a) * 0.06, ly, lz + Math.sin(a) * 0.06], { s: [0.7, 1.4, 0.45], ry: -a, rz: 0.5, detail: 0 });
      }
      b.ball(0.035, HC.gamboge, [lx, ly + 0.03, lz], { detail: 0 });
      b.cyl(0.012, 0.012, 0.3, HC.leafDark, [0.55, POND_WATER_Y + 0.15, 0.35], { seg: 4, edges: false });
      b.ball(0.05, HC.rouge, [0.55, POND_WATER_Y + 0.32, 0.35], { detail: 0, s: [1, 1.6, 1] });
      // reeds in the back corner
      const rx = 1.15, rz = -1.05, sw = sway(rx, rz, 0.012);
      for (let k = 0; k < 7; k++) {
        const a = b.rng() * TAU, h = 0.7 + b.rng() * 0.5;
        b.beam([rx + Math.cos(a) * 0.12, 0, rz + Math.sin(a) * 0.12], [rx + Math.cos(a) * 0.3, h, rz + Math.sin(a) * 0.3], 0.025, k % 2 ? HC.leafDark : HC.bambooDark, { edges: false, anim: sw });
      }
    },
  },
  {
    id: 'rockery', zh: '假山', en: 'Rockery', cat: 'garden', w: 2, d: 2, price: 150, h: 2.2,
    noteZh: '太湖石叠成一座小山，石缝里长一株松。', noteEn: 'Lake stones stacked into a small mountain, a pine in a crack.',
    build(b) {
      const stones: [number, V3, V3, string][] = [
        [0.72, [0, 0.32, 0], [1.15, 0.7, 0.95], '#c9c0ad'],
        [0.5, [0.18, 0.98, -0.1], [0.8, 1.25, 0.7], '#b8ae9a'],
        [0.34, [-0.12, 1.58, 0.05], [0.7, 1.35, 0.6], '#d3cab6'],
        [0.4, [0.55, 0.26, 0.5], [1, 0.8, 0.9], '#aea591'],
        [0.3, [-0.62, 0.2, 0.45], [1, 0.7, 1], '#c2b8a3'],
      ];
      for (const [r, at, s, c] of stones) b.ball(r, c, at, { s, lumpy: 0.35, detail: 1, ry: b.rng() * TAU });
      for (let k = 0; k < 9; k++) {
        const a = b.rng() * TAU;
        b.ball(0.07, k % 2 ? HC.leafDark : HC.leaf, [Math.cos(a) * 0.55, 0.35 + b.rng() * 1.0, Math.sin(a) * 0.45], { detail: 0, s: [1.4, 0.5, 1.2] });
      }
      const sw = sway(-0.3, 0.3, 0.006, 1.2);
      trunk(b, [[-0.25, 1.15, 0.3], [-0.5, 1.55, 0.42], [-0.72, 1.8, 0.35]], 0.06, 0.035, HC.woodDark, sw);
      b.ball(0.28, HC.leafDark, [-0.75, 1.86, 0.35], { s: [1.3, 0.35, 1], anim: sw });
      b.ball(0.2, HC.leaf, [-0.45, 1.66, 0.52], { s: [1.3, 0.35, 1], anim: sw });
      b.solid(0, 0, 0.85, 2.0);
    },
  },
  {
    id: 'bamboo', zh: '竹丛', en: 'Bamboo clump', cat: 'garden', w: 2, d: 2, price: 90, h: 4.6,
    noteZh: '可使食无肉，不可居无竹。', noteEn: '“Better a meal without meat than a home without bamboo.”',
    build(b) {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + b.rng() * 0.5, d = 0.15 + b.rng() * 0.45;
        const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 3.0 + b.rng() * 1.6;
        const lx = x + Math.cos(a) * 0.35, lz = z + Math.sin(a) * 0.35;
        const sw = sway(x, z, 0.004);
        b.beam([x, -0.05, z], [lx, h, lz], 0.085, k % 3 ? HC.bamboo : HC.bambooDark, { round: true, edges: false, anim: sw });
        for (let q = 1; q < 7; q++) {
          const t = q / 7;
          b.cyl(0.055, 0.055, 0.03, HC.bambooDark, [x + (lx - x) * t, h * t, z + (lz - z) * t], { seg: 6, edges: false, anim: sw });
        }
        for (let q = 0; q < 4; q++) {
          const t = 0.62 + q * 0.12, ang = b.rng() * TAU;
          const cx = x + (lx - x) * t + Math.cos(ang) * 0.22, cz = z + (lz - z) * t + Math.sin(ang) * 0.22;
          b.ball(0.32, [HC.leaf, HC.leafLight, HC.bambooDark, HC.jade][q], [cx, h * t, cz], { s: [1.4, 0.35, 0.65], ry: -ang, rz: 0.25, anim: sw, lumpy: 0.1 });
        }
      }
      for (let k = 0; k < 3; k++) b.cyl(0, 0.06, 0.22, k % 2 ? HC.ochre : HC.leafLight, [0.5 - k * 0.35, 0.11, 0.6 - k * 0.2], { seg: 6, edges: false });
      b.solid(0, 0, 0.55, 3);
    },
  },
  {
    id: 'peach', zh: '桃树', en: 'Peach tree', cat: 'garden', w: 2, d: 2, price: 160, h: 3,
    noteZh: '桃之夭夭，灼灼其华。', noteEn: '“The peach tree young and lovely, its blossoms ablaze.”',
    build(b) {
      const sw = sway(0, 0, 0.0035);
      trunk(b, [[0, 0, 0], [0.08, 0.7, 0.04], [0.02, 1.25, 0.1]], 0.13, 0.09, '#6e4430', sw);
      for (const [x, y, z] of [[-0.55, 1.85, 0.1], [0.55, 1.95, -0.1], [0.1, 2.1, 0.5], [0, 1.9, -0.5]] as const) b.beam([0.02, 1.2, 0.1], [x, y, z], 0.08, '#6e4430', { round: true, edges: false, anim: sw });
      crown(b, 0, 2.15, 0, 0.9, 8, [HC.blossom, HC.blossomDeep, '#f8ccd3', HC.blossom, HC.leafLight], sw, 0.2);
      for (let k = 0; k < 12; k++) {
        const a = b.rng() * TAU, d = 0.3 + b.rng() * 0.6;
        b.disc(0.04, k % 2 ? HC.blossom : HC.blossomDeep, [Math.cos(a) * d, 0.02, Math.sin(a) * d], { seg: 5, bucket: 'soft' });
      }
      b.solid(0, 0, 0.25, 2.4);
    },
  },
  {
    id: 'plum', zh: '梅树', en: 'Plum tree', cat: 'garden', w: 2, d: 2, price: 160, h: 2.6,
    noteZh: '疏影横斜水清浅，暗香浮动月黄昏。', noteEn: '“Sparse shadows slant on clear shallows; a faint scent drifts in the dusk moon.”',
    build(b) {
      const sw = sway(0, 0, 0.003);
      const ink = '#3d2b22';
      const T: V3[] = [[0, 0, 0], [0.18, 0.55, 0.05], [-0.1, 1.05, 0.12], [0.2, 1.55, -0.05]];
      trunk(b, T, 0.15, 0.07, ink, sw);
      const br: [V3, V3][] = [
        [T[2], [-0.75, 1.55, 0.25]], [[-0.75, 1.55, 0.25], [-1.0, 1.45, 0.55]],
        [T[3], [0.75, 2.05, 0.05]], [T[3], [0.3, 2.45, -0.25]], [[0.75, 2.05, 0.05], [0.95, 2.3, 0.3]],
        [T[1], [0.65, 0.9, -0.3]],
      ];
      for (const [a, c] of br) b.beam(a, c, 0.05, ink, { round: true, edges: false, anim: sw });
      for (const [a, c] of br) blossoms(b, a, c, 6, [HC.plum, '#dd5a70', '#f3c4ca', HC.plum], 0.07, sw);
      b.solid(0, 0, 0.25, 2.2);
    },
  },
  {
    id: 'osmanthus', zh: '桂树', en: 'Osmanthus', cat: 'garden', w: 2, d: 2, price: 180, h: 2.9,
    noteZh: '浓荫一树，金粟满枝，秋来满园香。', noteEn: 'Dense shade and tiny golden flowers: in autumn the whole garden smells sweet.',
    build(b) {
      const sw = sway(0, 0, 0.003);
      trunk(b, [[0, 0, 0], [0.05, 0.6, 0], [0, 1.1, 0.05]], 0.14, 0.1, '#5e4030', sw);
      crown(b, 0, 1.85, 0, 0.95, 6, ['#3f6d3b', '#4b7d42', '#56874a'], sw, 0.16);
      for (let k = 0; k < 26; k++) {
        const a = b.rng() * TAU, e = (b.rng() - 0.3) * 1.2, r = 0.85 + b.rng() * 0.2;
        b.ball(0.04, k % 3 ? HC.gamboge : '#f4cf6a', [Math.cos(a) * Math.cos(e) * r, 1.85 + Math.sin(e) * r * 0.8, Math.sin(a) * Math.cos(e) * r], { detail: 0, anim: sw });
      }
      b.solid(0, 0, 0.3, 2.4);
    },
  },
  {
    id: 'flowers', zh: '花圃', en: 'Flower bed', cat: 'garden', w: 2, d: 1, price: 60, h: 0.7,
    noteZh: '一畦牡丹芍药，红白相间。', noteEn: 'A bed of peonies, red and white.',
    build(b) {
      for (const s of [-1, 1]) {
        b.box(1.9, 0.16, 0.08, HC.terracotta, [0, 0.08, s * 0.43]);
        b.box(0.08, 0.16, 0.8, HC.terracotta, [s * 0.93, 0.08, 0]);
      }
      b.box(1.78, 0.1, 0.78, HC.soil, [0, 0.07, 0], { edges: false });
      const cols = [HC.rouge, HC.white, HC.plum, HC.blossom, HC.gamboge, HC.rouge];
      for (let k = 0; k < 6; k++) {
        const x = -0.66 + (k % 3) * 0.66 + (b.rng() - 0.5) * 0.1, z = k < 3 ? -0.18 : 0.18;
        const sw = sway(x, z, 0.02);
        b.ball(0.17, k % 2 ? HC.leaf : HC.leafDark, [x, 0.3, z], { s: [1.2, 0.6, 1.1], anim: sw, lumpy: 0.2 });
        b.ball(0.12, cols[k], [x, 0.5, z], { anim: sw, lumpy: 0.25, s: [1, 0.8, 1] });
        b.ball(0.035, HC.gamboge, [x, 0.58, z], { detail: 0, anim: sw });
      }
    },
  },
  {
    id: 'swing', zh: '秋千', en: 'Swing', cat: 'thing', w: 2, d: 2, price: 150, h: 2.6, use: 'swing',
    noteZh: '藤花缠绳，荡一荡，看墙外。', noteEn: 'Flowers twined round the ropes; swing high and see over the fence.',
    build(b) {
      for (const s of [-1, 1]) {
        b.beam([s * 0.98, -0.05, -0.55], [s * 0.98, 2.42, 0], 0.09, HC.wood, { edges: 40 });
        b.beam([s * 0.98, -0.05, 0.55], [s * 0.98, 2.42, 0], 0.09, HC.wood, { edges: 40 });
        b.solid(s * 0.98, -0.5, 0.08, 1.5);
        b.solid(s * 0.98, 0.5, 0.08, 1.5);
      }
      b.cyl(0.07, 0.07, 2.2, HC.woodDark, [0, 2.44, 0], { rz: Math.PI / 2, seg: 8, edges: false });
      const an: Anim = { kind: 'swing', pivot: [0, SWING_RIG.pivotY, 0], axis: [1, 0, 0], rate: SWING_RIG.amp };
      for (const x of [-0.42, 0.42]) {
        b.beam([x, 2.4, 0], [x, 0.56, 0], 0.025, HC.hay, { round: true, edges: false, anim: an });
        for (let k = 0; k < 4; k++) b.ball(0.05, k % 2 ? HC.rouge : HC.blossom, [x, 1.0 + k * 0.35, 0.02], { detail: 0, anim: an });
      }
      b.box(1.0, 0.06, 0.34, HC.woodLight, [0, 0.52, 0], { anim: an });
    },
  },

  // ─────────── 器物 things
  {
    id: 'table', zh: '石桌凳', en: 'Stone table', cat: 'thing', w: 2, d: 2, price: 120, h: 0.9, use: 'table',
    noteZh: '石桌上一局残棋，四只鼓凳。', noteEn: 'An unfinished game of go on a stone table, four drum stools.',
    build(b) {
      b.cyl(0.36, 0.5, 0.66, HC.stoneWarm, [0, 0.33, 0], { seg: 10, edges: 60 });
      b.cyl(0.56, 0.56, 0.08, HC.stone, [0, 0.7, 0], { seg: 14, edges: 60 });
      b.box(0.5, 0.02, 0.5, '#dcc18a', [0, 0.75, 0], { edges: false });
      const L: number[] = [];
      for (let k = 0; k <= 6; k++) {
        const u = -0.22 + (k * 0.44) / 6;
        L.push(u, 0.762, -0.22, u, 0.762, 0.22, -0.22, 0.762, u, 0.22, 0.762, u);
      }
      b.lines(L);
      for (let k = 0; k < 7; k++) b.ball(0.022, k % 2 ? HC.white : HC.ink, [-0.15 + (k % 4) * 0.073, 0.77, -0.08 + Math.floor(k / 3) * 0.073], { detail: 0, s: [1, 0.45, 1], bucket: 'solid' });
      for (const [x, z] of [[0, 0.78], [0, -0.78], [0.78, 0], [-0.78, 0]] as const) b.cyl(0.18, 0.2, 0.42, HC.stone, [x, 0.21, z], { seg: 9, edges: 60 });
      b.solid(0, 0, 0.5, 0.8);
      b.seat(0, 0.42, 0.78, Math.PI, [0, 1.35]);
      b.seat(0, 0.42, -0.78, 0, [0, -1.35]);
      b.seat(0.78, 0.42, 0, -Math.PI / 2, [1.35, 0]);
      b.seat(-0.78, 0.42, 0, Math.PI / 2, [-1.35, 0]);
    },
  },
  {
    id: 'bench', zh: '长凳', en: 'Bench', cat: 'thing', w: 2, d: 1, price: 40, h: 0.9, use: 'sit',
    noteZh: '一条木凳，歇歇脚。', noteEn: 'A wooden bench to rest your feet.',
    build(b) {
      b.box(1.7, 0.07, 0.36, HC.woodLight, [0, 0.45, 0]);
      b.box(1.7, 0.3, 0.05, HC.wood, [0, 0.72, -0.17], { rx: -0.12 });
      for (const x of [-0.72, 0.72]) {
        b.box(0.07, 0.45, 0.3, HC.woodDark, [x, 0.22, 0]);
        b.box(0.06, 0.4, 0.06, HC.woodDark, [x, 0.62, -0.17], { edges: false });
      }
      b.seat(0, 0.45, 0.02, 0, [0, 0.8]);
    },
  },
  {
    id: 'lantern', zh: '石灯笼', en: 'Stone lantern', cat: 'thing', w: 1, d: 1, price: 70, h: 1.4,
    noteZh: '石灯一盏，夜里点着。', noteEn: 'A stone lantern, lit at night.',
    build(b) {
      b.cyl(0.26, 0.3, 0.14, HC.stoneDark, [0, 0.07, 0], { seg: 6, edges: 40 });
      b.cyl(0.1, 0.13, 0.55, HC.stone, [0, 0.42, 0], { seg: 6, edges: 40 });
      b.cyl(0.26, 0.2, 0.09, HC.stone, [0, 0.74, 0], { seg: 6, edges: 40 });
      for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]] as const) b.box(0.07, 0.28, 0.07, HC.stone, [x, 0.92, z], { edges: false });
      b.box(0.2, 0.22, 0.2, HC.amber, [0, 0.92, 0], { bucket: 'glow', edges: false });
      b.cyl(0.02, 0.38, 0.26, HC.stoneDark, [0, 1.19, 0], { seg: 6, edges: 40 });
      b.ball(0.07, HC.stone, [0, 1.36, 0], { detail: 0, bucket: 'solid' });
      b.light(0, 0.95, 0, 1.2);
      b.solid(0, 0, 0.25, 1.3);
    },
  },
  {
    id: 'lanterns', zh: '灯笼串', en: 'String of lanterns', cat: 'thing', w: 3, d: 1, price: 110, h: 2.4,
    noteZh: '竹竿挑起一串红灯笼，入夜便亮。', noteEn: 'Red lanterns strung between bamboo poles; they glow at night.',
    build(b) {
      for (const x of [-1.4, 1.4]) {
        b.cyl(0.045, 0.055, 2.4, HC.bamboo, [x, 1.2, 0], { seg: 6, edges: false });
        b.solid(x, 0, 0.1, 2.3);
      }
      const rope = (x: number) => 2.25 - 0.32 * (1 - (x / 1.4) * (x / 1.4));
      for (let k = 0; k < 8; k++) {
        const xa = -1.4 + k * 0.35, xb = xa + 0.35;
        b.beam([xa, rope(xa), 0], [xb, rope(xb), 0], 0.02, HC.ink, { round: true, edges: false });
      }
      const xs = [-0.9, -0.3, 0.3, 0.9];
      xs.forEach((x, k) => {
        const top = rope(x);
        const an: Anim = { kind: 'swing', pivot: [x, top, 0], axis: [1, 0, 0], rate: 0.1 };
        b.beam([x, top, 0], [x, top - 0.2, 0], 0.012, HC.ink, { edges: false, anim: an });
        lantern(b, x, top - 0.36, 0, k % 2 ? HC.amber : HC.lantern, 0.95, an);
      });
    },
  },
  {
    id: 'plaque', zh: '匾额', en: 'Plaque', cat: 'thing', w: 2, d: 1, price: 100, h: 2.8, text: 'plaque', defaultText: '宁静致远', use: 'text',
    noteZh: '朱柱挑一方黑匾，题字由你。', noteEn: 'A black plaque between vermilion posts; you write the words.',
    build(b) {
      for (const x of [-0.92, 0.92]) {
        b.cyl(0.07, 0.08, 2.45, HC.vermilion, [x, 1.22, 0], { seg: 8, edges: false });
        b.cyl(0.14, 0.15, 0.14, HC.stone, [x, 0.07, 0], { seg: 8, edges: false });
        b.solid(x, 0, 0.1, 2.4);
      }
      b.box(2.1, 0.12, 0.14, HC.vermilion, [0, 2.36, 0]);
      b.roof({ w: 2.5, d: 0.72, y: 2.44, rise: 0.3, ridge: 1.25, curve: 1.5, curl: 0.12, thick: 0.08, color: HC.tile, under: HC.vermilion, tiles: 0.16 });
      b.box(1.64, 0.6, 0.08, '#2f2620', [0, 1.92, 0]);
      for (const [w, h, x, y] of [[1.72, 0.05, 0, 2.23], [1.72, 0.05, 0, 1.61], [0.05, 0.64, -0.84, 1.92], [0.05, 0.64, 0.84, 1.92]] as const) b.box(w, h, 0.1, HC.gold, [x, y, 0], { edges: false });
      b.label('plaque', [0, 1.92, 0.046], 1.54, 0.5);
      b.label('plaque', [0, 1.92, -0.046], 1.54, 0.5, Math.PI);
    },
  },
  {
    id: 'couplets', zh: '对联', en: 'Couplets', cat: 'thing', w: 2, d: 1, price: 80, h: 2.8, text: 'couplet', defaultText: '室雅何须大/花香不在多', use: 'text',
    noteZh: '小门楼一座，两边红纸对联，上联下联由你写。', noteEn: 'A little gateway with red couplets on its posts; you write both lines.',
    build(b) {
      for (const x of [-0.88, 0.88]) {
        b.box(0.18, 2.3, 0.18, HC.woodDark, [x, 1.15, 0]);
        b.box(0.26, 0.16, 0.26, HC.stone, [x, 0.08, 0], { edges: false });
        b.box(0.24, 1.55, 0.02, HC.lacquer, [x, 1.3, 0.1], { edges: false });
        b.solid(x, 0, 0.14, 2.3);
      }
      b.box(2.1, 0.2, 0.2, HC.woodDark, [0, 2.2, 0]);
      b.box(1.2, 0.26, 0.02, HC.lacquer, [0, 2.2, 0.11], { edges: false });
      for (let k = 0; k < 4; k++) b.ball(0.035, HC.gold, [-0.42 + k * 0.28, 2.2, 0.125], { detail: 0, bucket: 'solid', s: [1, 1, 0.4] });
      b.roof({ w: 2.5, d: 0.9, y: 2.3, rise: 0.36, ridge: 1.25, curve: 1.5, curl: 0.14, thick: 0.09, color: HC.tile, under: HC.woodDark, tiles: 0.16 });
      lantern(b, -0.55, 1.95, 0.25, HC.lantern, 0.7);
      lantern(b, 0.55, 1.95, 0.25, HC.lantern, 0.7);
      // 上联 on the right as you face it (your right: −x), 下联 on the left
      b.label('couplet-r', [-0.88, 1.3, 0.115], 0.2, 1.46);
      b.label('couplet-l', [0.88, 1.3, 0.115], 0.2, 1.46);
    },
  },
  {
    id: 'screen', zh: '屏风', en: 'Folding screen', cat: 'thing', w: 2, d: 1, price: 110, h: 1.7,
    noteZh: '四扇屏风，画着梅兰竹菊。', noteEn: 'Four panels painted with plum, orchid, bamboo and chrysanthemum.',
    build(b) {
      const inks = [[HC.plum, '#3d2b22'], [HC.jade, HC.leafDark], [HC.bambooDark, HC.leafDark], [HC.gamboge, HC.leafDark]];
      for (let k = 0; k < 4; k++) {
        const x = -0.72 + k * 0.48, ry = k % 2 ? 0.28 : -0.28;
        b.box(0.48, 1.6, 0.05, HC.woodDark, [x, 0.9, 0], { ry });
        b.box(0.4, 1.38, 0.02, HC.white, [x + Math.sin(ry) * 0.03, 0.92, Math.cos(ry) * 0.03], { ry, edges: false });
        const [bloom, stem] = inks[k];
        const c = Math.cos(ry), s = Math.sin(ry);
        const at = (u: number, y: number): V3 => [x + u * c + s * 0.045, y, -u * s + c * 0.045];
        b.beam(at(-0.12, 0.45), at(0.1, 1.3), 0.015, stem, { edges: false });
        b.beam(at(0.02, 0.9), at(0.14, 1.05), 0.012, stem, { edges: false });
        for (let q = 0; q < 4; q++) b.ball(0.035, bloom, at(-0.05 + q * 0.05, 1.0 + q * 0.08), { detail: 0, s: [1, 1, 0.3], bucket: 'solid' });
        b.box(0.1, 0.08, 0.2, HC.woodDark, [x, 0.04, 0], { ry, edges: false });
      }
      b.solid(-0.5, 0, 0.35, 1.6);
      b.solid(0.5, 0, 0.35, 1.6);
    },
  },
  {
    id: 'fishbowl', zh: '鱼缸', en: 'Fish bowl', cat: 'thing', w: 1, d: 1, price: 90, h: 0.8,
    noteZh: '青花大缸，两尾金鱼，一片荷叶。', noteEn: 'A blue-and-white jar, two goldfish and a lotus leaf.',
    build(b) {
      b.cyl(0.34, 0.36, 0.1, HC.woodDark, [0, 0.05, 0], { seg: 10, edges: false });
      b.cyl(0.43, 0.3, 0.55, HC.porcelain, [0, 0.37, 0], { seg: 14, edges: false });
      b.cyl(0.415, 0.39, 0.1, HC.indigo, [0, 0.46, 0], { seg: 14, edges: false });
      b.cyl(0.46, 0.46, 0.04, HC.porcelain, [0, 0.64, 0], { seg: 14, edges: false });
      b.disc(0.4, HC.water, [0, 0.6, 0], { bucket: 'water', seg: 14 });
      b.disc(0.13, HC.jade, [0.12, 0.615, -0.08], { seg: 8, bucket: 'soft' });
      b.ball(0.06, '#e2723b', [-0.12, 0.6, 0.08], { s: [1.8, 0.6, 0.8], ry: 0.6, detail: 0 });
      b.ball(0.05, '#f0a04a', [0.05, 0.6, 0.18], { s: [1.8, 0.6, 0.8], ry: -0.9, detail: 0 });
      b.solid(0, 0, 0.42, 0.7);
    },
  },
  {
    id: 'mums', zh: '菊花盆', en: 'Chrysanthemums', cat: 'thing', w: 1, d: 1, price: 45, h: 0.8,
    noteZh: '采菊东篱下，悠然见南山。', noteEn: '“Picking chrysanthemums by the east fence, I see the southern hills.”',
    build(b) {
      const pots: [number, number, string, string][] = [[-0.22, -0.15, HC.terracotta, HC.gamboge], [0.22, -0.12, HC.porcelain, HC.white], [0, 0.22, HC.terracotta, '#c96c9c']];
      for (const [x, z, pot, fl] of pots) {
        b.cyl(0.16, 0.12, 0.24, pot, [x, 0.12, z], { seg: 9, edges: false });
        b.cyl(0.17, 0.17, 0.03, pot, [x, 0.245, z], { seg: 9, edges: false });
        const sw = sway(x, z, 0.03);
        b.ball(0.13, HC.leafDark, [x, 0.36, z], { s: [1.2, 0.7, 1.2], anim: sw, lumpy: 0.2 });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + 0.3;
          b.ball(0.07, fl, [x + Math.cos(a) * 0.08, 0.48 + (k % 2) * 0.05, z + Math.sin(a) * 0.08], { anim: sw, lumpy: 0.3, detail: 1 });
        }
      }
    },
  },

  // ─────────── 田园 farm
  {
    id: 'farm', zh: '菜畦', en: 'Vegetable plot', cat: 'farm', w: 2, d: 2, price: 40, h: 0.8, use: 'farm', starter: true,
    noteZh: '三垄菜地，过几日就能收；浇水长得快。', noteEn: 'Three rows of vegetables, ripe in a few days; water them to hurry them along.',
    build(b, o) {
      const rows = [-0.6, 0, 0.6];
      for (const z of rows) b.box(1.5, 0.16, 0.42, k2(b) ? HC.soil : HC.soilLight, [-0.12, 0.06, z], { edges: false, jitter: 0.08 });
      // the scarecrow in the corner
      const sx = 0.78, sz = -0.72;
      b.beam([sx, 0, sz], [sx, 1.25, sz], 0.05, HC.woodLight, { round: true, edges: false });
      b.beam([sx - 0.35, 0.95, sz], [sx + 0.35, 0.95, sz], 0.04, HC.woodLight, { round: true, edges: false });
      b.box(0.32, 0.36, 0.14, HC.indigo, [sx, 0.85, sz], { edges: false });
      b.ball(0.1, HC.hay, [sx, 1.18, sz], { detail: 1 });
      b.cyl(0, 0.2, 0.12, HC.thatch, [sx, 1.3, sz], { seg: 8, edges: false });
      b.solid(sx, sz, 0.1, 1.2);
      const st = o.stage;
      rows.forEach((z, r) => {
        for (let k = 0; k < 5; k++) {
          const x = -0.75 + k * 0.32, sw = sway(x, z, 0.03, 0.14);
          if (st === 0) { b.ball(0.035, HC.leafLight, [x, 0.17, z], { detail: 0, anim: sw }); continue; }
          if (st === 1) { b.ball(0.08, HC.leafLight, [x, 0.2, z], { s: [1.2, 0.6, 1.2], anim: sw }); continue; }
          if (st === 2) { b.ball(0.13, HC.jade, [x, 0.24, z], { s: [1.2, 0.8, 1.2], anim: sw, lumpy: 0.2 }); continue; }
          if (r === 0) {
            b.ball(0.17, HC.leaf, [x, 0.24, z], { s: [1.3, 0.6, 1.3], anim: sw, lumpy: 0.25 });
            b.ball(0.13, '#b9d27a', [x, 0.3, z], { anim: sw });
          } else if (r === 1) {
            b.ball(0.07, HC.plum, [x, 0.17, z], { s: [1, 1.3, 1], detail: 0 });
            b.ball(0.1, HC.leafLight, [x, 0.3, z], { s: [0.8, 1.2, 0.8], anim: sw, lumpy: 0.3 });
          } else {
            b.ball(0.15, k % 2 ? HC.ochre : '#d98b3a', [x, 0.25, z], { s: [1.2, 0.8, 1.2], lumpy: 0.12 });
            b.cyl(0.015, 0.02, 0.08, HC.leafDark, [x, 0.38, z], { seg: 4, edges: false });
          }
        }
      });
    },
  },
  {
    id: 'well', zh: '水井', en: 'Well', cat: 'farm', w: 2, d: 2, price: 200, h: 2.4, use: 'well',
    noteZh: '辘轳吱呀，打一桶井水，清甜。', noteEn: 'The windlass creaks; a bucket of sweet well water.',
    build(b) {
      b.cyl(0.95, 0.95, 0.12, HC.slab, [0, 0.06, 0], { seg: 8, edges: 40 });
      b.cyl(0.56, 0.6, 0.62, HC.stoneWarm, [0, 0.4, 0], { seg: 8, edges: 40 });
      b.cyl(0.44, 0.44, 0.02, HC.waterDeep, [0, 0.66, 0], { seg: 8, bucket: 'water' });
      for (const s of [-1, 1]) b.box(0.1, 1.75, 0.1, HC.woodDark, [s * 0.68, 0.95, 0]);
      b.cyl(0.07, 0.07, 1.25, HC.woodLight, [0, 1.25, 0], { rz: Math.PI / 2, seg: 8, edges: false });
      b.beam([0.72, 1.25, 0], [0.8, 1.08, 0.2], 0.03, HC.woodDark, { edges: false });
      b.beam([0, 1.2, 0.05], [0.25, 0.86, 0.3], 0.012, HC.ink, { edges: false });
      b.cyl(0.13, 0.1, 0.2, HC.wood, [0.35, 0.8, 0.38], { seg: 8, edges: false });
      b.roof({ w: 1.7, d: 1.15, y: 1.78, rise: 0.45, ridge: 0.85, curve: 1.4, curl: 0.08, thick: 0.08, color: HC.tile, under: HC.woodDark, tiles: 0.16 });
      b.solid(0, 0, 0.72, 1.5);
    },
  },
  {
    id: 'windmill', zh: '风车', en: 'Windmill', cat: 'farm', w: 1, d: 1, price: 90, h: 2.8,
    noteZh: '风一吹，彩帆就转。', noteEn: 'Painted sails that turn with the wind.',
    build(b) {
      b.cyl(0.2, 0.25, 0.15, HC.stone, [0, 0.07, 0], { seg: 8, edges: false });
      b.cyl(0.06, 0.08, 2.3, HC.woodLight, [0, 1.2, 0], { seg: 7, edges: false });
      b.box(0.16, 0.16, 0.28, HC.woodDark, [0, 2.3, 0.05]);
      const an: Anim = { kind: 'spin', pivot: [0, 2.3, 0.22], axis: [0, 0, 1], rate: 1.1 };
      b.cyl(0.06, 0.06, 0.08, HC.gold, [0, 2.3, 0.22], { rx: Math.PI / 2, seg: 8, edges: false, anim: an });
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4;
        const cx = Math.cos(a), cy = Math.sin(a);
        b.beam([0, 2.3, 0.22], [cx * 0.85, 2.3 + cy * 0.85, 0.22], 0.03, HC.woodDark, { edges: false, anim: an });
        b.box(0.62, 0.2, 0.015, k % 2 ? HC.white : HC.rouge, [cx * 0.5 - cy * 0.1, 2.3 + cy * 0.5 + cx * 0.1, 0.23], { rz: a, edges: false, anim: an });
      }
      b.box(0.02, 0.3, 0.4, HC.lacquer, [0, 2.36, -0.25], { edges: false });
      b.solid(0, 0, 0.16, 2.3);
    },
  },
  {
    id: 'laundry', zh: '晾衣架', en: 'Laundry rack', cat: 'farm', w: 2, d: 1, price: 50, h: 1.8,
    noteZh: '竹竿上晒着蓝印花布，风里轻摆。', noteEn: 'Indigo-print cloth drying on a bamboo pole, stirring in the breeze.',
    build(b) {
      for (const x of [-0.92, 0.92]) {
        b.beam([x, -0.02, -0.35], [x, 1.62, 0.1], 0.045, HC.bamboo, { round: true, edges: false });
        b.beam([x, -0.02, 0.35], [x, 1.62, -0.1], 0.045, HC.bamboo, { round: true, edges: false });
      }
      b.cyl(0.03, 0.03, 2.1, HC.bambooDark, [0, 1.55, 0], { rz: Math.PI / 2, seg: 6, edges: false });
      const hang = (x: number): Anim => ({ kind: 'hang', pivot: [x, 1.55, 0], rate: 0.035 });
      b.box(0.62, 0.85, 0.02, HC.indigo, [-0.5, 1.12, 0], { anim: hang(-0.5), edges: false });
      for (let k = 0; k < 6; k++) b.ball(0.03, HC.white, [-0.68 + (k % 3) * 0.18, 0.92 + Math.floor(k / 3) * 0.35, 0.015], { detail: 0, s: [1, 1, 0.3], anim: hang(-0.5), bucket: 'solid' });
      b.box(0.44, 0.52, 0.02, HC.white, [0.08, 1.28, 0], { anim: hang(0.08), edges: false });
      b.box(0.5, 0.14, 0.02, HC.white, [0.08, 1.48, 0], { anim: hang(0.08), edges: false });
      b.box(0.2, 0.7, 0.02, HC.rouge, [0.58, 1.2, 0], { anim: hang(0.58), edges: false });
      b.solid(-0.92, 0, 0.1, 1.5);
      b.solid(0.92, 0, 0.1, 1.5);
    },
  },
  {
    id: 'fence', zh: '篱笆', en: 'Fence', cat: 'farm', w: 2, d: 1, price: 12, h: 0.9,
    noteZh: '竹篱一段，牵牛花爬在上面。', noteEn: 'A stretch of bamboo fence with morning glories climbing it.',
    build(b) {
      bambooFence(b, [-1, 0], [1, 0], 0.85);
      for (let k = 0; k < 5; k++) b.ball(0.05, k % 2 ? '#6275c0' : HC.rouge, [-0.8 + k * 0.4, 0.55 + (k % 3) * 0.12, 0.05], { detail: 0 });
      for (const x of [-0.7, 0, 0.7]) b.solid(x, 0, 0.32, 0.9);
    },
  },
  {
    id: 'paving', zh: '石板', en: 'Stone slab', cat: 'farm', w: 1, d: 1, price: 8, h: 0.1,
    noteZh: '一块青石板，铺成小径。', noteEn: 'A flagstone; lay a few to make a path.',
    build(b) {
      b.box(0.88, 0.1, 0.84, HC.slab, [0.02 * (b.rng() - 0.5), 0.03, 0], { ry: (b.rng() - 0.5) * 0.12, jitter: 0.1, edges: 40 });
      b.ball(0.05, HC.leaf, [0.42, 0.02, 0.3], { detail: 0, s: [1.6, 0.4, 1] });
    },
  },

  // ─────────── 宠居 pet homes (kinds fixed with ./life: doghouse, catbed, hutch, coop, pond, perch, pen)
  {
    id: 'doghouse', zh: '狗窝', en: 'Doghouse', cat: 'pet', w: 1, d: 1, price: 80, h: 1.1, pets: ['dog'], door: [0, 0.6],
    noteZh: '小木屋红顶，门口一只饭碗。', noteEn: 'A little wooden house with a red roof, a bowl by the door.',
    build(b) {
      b.box(0.72, 0.52, 0.7, HC.woodLight, [0, 0.3, -0.05]);
      b.box(0.3, 0.36, 0.02, '#2e211a', [0, 0.24, 0.31], { edges: false });
      b.cyl(0.15, 0.15, 0.02, '#2e211a', [0, 0.42, 0.31], { rx: Math.PI / 2, seg: 10, edges: false });
      b.roof({ w: 0.95, d: 0.9, cz: -0.05, y: 0.55, rise: 0.36, ridge: 0.48, curve: 1, thick: 0.06, color: '#b8452f', under: HC.woodDark });
      b.cyl(0.1, 0.08, 0.05, HC.indigo, [0.3, 0.03, 0.42], { seg: 10, edges: false });
      b.solid(0, -0.05, 0.38, 0.9);
    },
  },
  {
    id: 'catbed', zh: '猫窝', en: 'Cat bed', cat: 'pet', w: 1, d: 1, price: 60, h: 0.4, pets: ['cat'], door: [0, 0.45],
    noteZh: '藤编小窝，红垫子，一团毛线球。', noteEn: 'A woven basket with a red cushion and a ball of yarn.',
    build(b) {
      b.cyl(0.4, 0.32, 0.22, '#c79d5c', [0, 0.11, 0], { seg: 12, edges: false, jitter: 0.1 });
      b.ring(0.39, 0.05, '#a97e44', [0, 0.23, 0], { rx: Math.PI / 2 });
      b.cyl(0.33, 0.33, 0.08, HC.lacquer, [0, 0.2, 0], { seg: 12, edges: false });
      b.ball(0.07, HC.rouge, [0.35, 0.07, 0.3], { detail: 1 });
    },
  },
  {
    id: 'hutch', zh: '兔笼', en: 'Rabbit hutch', cat: 'pet', w: 2, d: 1, price: 70, h: 1, pets: ['rabbit'], door: [0.4, 0.65],
    noteZh: '高脚木笼，铺着干草，门口几根胡萝卜。', noteEn: 'A hutch on legs, lined with hay; a few carrots at the door.',
    build(b) {
      for (const [x, z] of [[-0.75, -0.3], [0.75, -0.3], [-0.75, 0.3], [0.75, 0.3]] as const) b.box(0.06, 0.3, 0.06, HC.woodDark, [x, 0.15, z], { edges: false });
      b.box(1.6, 0.55, 0.66, HC.woodLight, [0, 0.58, 0]);
      b.box(0.7, 0.45, 0.02, '#3a2c22', [0.35, 0.58, 0.335], { edges: false });
      const L: number[] = [];
      for (let k = 0; k <= 6; k++) L.push(0.02 + k * 0.11, 0.36, 0.35, 0.02 + k * 0.11, 0.8, 0.35);
      for (let k = 0; k <= 4; k++) L.push(0.02, 0.36 + k * 0.11, 0.35, 0.68, 0.36 + k * 0.11, 0.35);
      b.lines(L);
      b.box(0.5, 0.06, 0.2, HC.hay, [0.35, 0.37, 0.2], { edges: false });
      b.box(1.8, 0.06, 0.85, HC.thatchDark, [0, 0.93, -0.02], { rx: -0.14 });
      for (let k = 0; k < 3; k++) {
        b.cyl(0.025, 0.004, 0.16, '#e2803a', [0.1 + k * 0.1, 0.03, 0.62], { rz: Math.PI / 2, seg: 5, edges: false });
        b.ball(0.03, HC.leafLight, [0.19 + k * 0.1, 0.04, 0.62], { detail: 0 });
      }
      b.solid(-0.4, 0, 0.35, 1);
      b.solid(0.4, 0, 0.35, 1);
    },
  },
  {
    id: 'coop', zh: '鸡鸭舍', en: 'Duck coop', cat: 'pet', w: 2, d: 2, price: 90, h: 1.6, pets: ['duck'], door: [0, 0.7],
    noteZh: '茅草小舍，门前围一圈矮篱，一只水槽。', noteEn: 'A thatched coop with a low fence round its yard and a water trough.',
    build(b) {
      b.box(1.2, 0.8, 0.9, HC.woodLight, [0, 0.4, -0.45]);
      b.box(0.3, 0.35, 0.02, '#2e211a', [0, 0.2, 0.01], { edges: false });
      b.roof({ w: 1.5, d: 1.25, cz: -0.45, y: 0.8, rise: 0.55, ridge: 0.75, curve: 1.05, thick: 0.12, color: HC.thatch, under: HC.thatchDark, jitter: 0.12 });
      b.box(0.28, 0.03, 0.5, HC.wood, [0, 0.1, 0.22], { rx: 0.35, edges: false });
      for (let k = 0; k < 5; k++) {
        const x = -0.9 + k * 0.45;
        b.box(0.04, 0.4, 0.04, HC.bambooDark, [x, 0.2, 0.9], { edges: false });
      }
      b.beam([-0.9, 0.3, 0.9], [0.9, 0.3, 0.9], 0.03, HC.bamboo, { round: true, edges: false });
      for (const s of [-1, 1]) {
        b.beam([s * 0.9, 0.3, 0.9], [s * 0.9, 0.3, 0.05], 0.03, HC.bamboo, { round: true, edges: false });
        for (let k = 0; k < 3; k++) b.box(0.04, 0.4, 0.04, HC.bambooDark, [s * 0.9, 0.2, 0.05 + k * 0.3], { edges: false });
      }
      b.box(0.6, 0.12, 0.2, HC.wood, [0.45, 0.06, 0.5], { edges: false });
      b.box(0.52, 0.02, 0.14, HC.water, [0.45, 0.12, 0.5], { bucket: 'water', edges: false });
      b.solidRect(-0.6, -0.9, 0.6, 0, 1.4);
    },
  },
  {
    id: 'perch', zh: '鹦鹉架', en: 'Parrot perch', cat: 'pet', w: 1, d: 1, price: 60, h: 1.5, pets: ['parrot'], door: [0, 0],
    noteZh: '一根栖杆，两只小食碗，一只铜环。', noteEn: 'A perch with two little bowls and a brass ring.',
    build(b) {
      b.cyl(0.22, 0.25, 0.08, HC.woodDark, [0, 0.04, 0], { seg: 10, edges: false });
      b.cyl(0.035, 0.045, 1.3, HC.woodLight, [0, 0.68, 0], { seg: 7, edges: false });
      b.cyl(0.03, 0.03, 0.62, HC.wood, [0, PERCH_Y, 0], { rz: Math.PI / 2, seg: 7, edges: false });
      b.cyl(0.06, 0.045, 0.06, HC.gamboge, [-0.3, PERCH_Y + 0.04, 0], { seg: 8, edges: false });
      b.cyl(0.06, 0.045, 0.06, HC.jade, [0.3, PERCH_Y + 0.04, 0], { seg: 8, edges: false });
      b.ring(0.1, 0.012, HC.gold, [0.15, PERCH_Y - 0.2, 0]);
      b.solid(0, 0, 0.15, 1.3);
    },
  },
  {
    id: 'pen', zh: '羊圈', en: 'Goat pen', cat: 'pet', w: 3, d: 2, price: 120, h: 1.4, pets: ['goat'], door: [0, 0.2],
    noteZh: '木栅围一圈，后头有草架和一方凉棚。', noteEn: 'A wooden paddock with a hay rack and a little shade roof at the back.',
    build(b) {
      const X = 1.4, Z = 0.9;
      const rail = (a: V3, c: V3) => { b.beam(a, c, 0.05, HC.wood, { edges: false }); };
      const post = (x: number, z: number) => b.box(0.08, 0.8, 0.08, HC.woodDark, [x, 0.4, z], { edges: false });
      for (let k = 0; k <= 6; k++) { const x = -X + (2 * X * k) / 6; post(x, -Z); if (Math.abs(x) > 0.4) post(x, Z); }
      for (let k = 1; k < 4; k++) { post(-X, -Z + (2 * Z * k) / 4); post(X, -Z + (2 * Z * k) / 4); }
      for (const y of [0.35, 0.65]) {
        rail([-X, y, -Z], [X, y, -Z]); rail([-X, y, -Z], [-X, y, Z]); rail([X, y, -Z], [X, y, Z]);
        rail([-X, y, Z], [-0.4, y, Z]); rail([0.4, y, Z], [X, y, Z]);
      }
      // hay rack and a shade roof on posts
      b.box(0.8, 0.5, 0.3, HC.wood, [-0.8, 0.45, -0.65]);
      b.box(0.72, 0.2, 0.24, HC.hay, [-0.8, 0.75, -0.65], { edges: false, jitter: 0.12 });
      for (const [x, z] of [[0.3, -0.85], [1.3, -0.85], [0.3, -0.25], [1.3, -0.25]] as const) b.box(0.07, 1.25, 0.07, HC.woodDark, [x, 0.62, z], { edges: false });
      b.box(1.3, 0.08, 0.9, HC.thatch, [0.8, 1.28, -0.55], { rx: 0.12, jitter: 0.12 });
      b.box(0.9, 0.05, 0.6, HC.hay, [0.2, 0.03, 0.2], { edges: false, jitter: 0.15 });
      for (let k = 0; k <= 6; k++) b.solid(-X + (2 * X * k) / 6, -Z, 0.12, 0.8);
      for (let k = 0; k <= 3; k++) { b.solid(-X, -Z + (2 * Z * k) / 3, 0.12, 0.8); b.solid(X, -Z + (2 * Z * k) / 3, 0.12, 0.8); }
      for (const x of [-X, -0.9, -0.45, 0.45, 0.9, X]) b.solid(x, Z, 0.12, 0.8);
    },
  },
];

/** Height of a pond's water above its ground (koi swim just under it; a crane wades at it). */
export const POND_WATER_Y = 0.16;
/** Height of the parrot's perch bar. */
export const PERCH_Y = 1.32;
/** The swing: its pivot height, where the rider sits, and its idle sway (rad) about its x axis. */
export const SWING_RIG = { pivotY: 2.4, seatY: 0.55, amp: 0.07 };

function k2(b: Brush): boolean { return b.rng() < 0.5; }

export const KIND: Record<string, HomeKind> = Object.fromEntries(CATALOG.map((k) => [k.id, k]));

/** The kinds that are a home for each pet species. */
export const PET_HOUSE_KINDS = ['doghouse', 'catbed', 'hutch', 'coop', 'pond', 'perch', 'pen'] as const;

/** A thing's words: what the owner wrote, or its default. Couplets are "上联/下联". */
export function itemText(it: Pick<HomeItem, 'kind' | 'text'>): string {
  return it.text || KIND[it.kind]?.defaultText || '';
}

/**
 * A couplet's two lines. Stored as "上联/下联": split at the first slash and keep both halves as
 * they are (either may be empty; commas and spaces belong inside a line). Words without a slash
 * (older saves) are halved.
 */
export function coupletLines(text: string): [string, string] {
  const t = text.trim();
  const k = t.search(/[/／]/);
  if (k >= 0) return [t.slice(0, k).trim(), t.slice(k + 1).replace(/[/／]/g, '').trim()];
  const h = Math.ceil(t.length / 2);
  return [t.slice(0, h), t.slice(h)];
}

/** A thing's words as one line to show (a couplet's two lines joined by a comma, a lone line alone). */
export function textLine(it: Pick<HomeItem, 'kind' | 'text'>): string {
  const t = itemText(it);
  if (KIND[it.kind]?.text !== 'couplet') return t;
  return coupletLines(t).filter(Boolean).join('，');
}

/** Put a couplet's two lines together for storing (slashes typed into a line are dropped). */
export function joinCouplet(a: string, b: string): string {
  const c = (s: string) => s.replace(/[/／]/g, '').trim();
  const x = c(a), y = c(b);
  return x || y ? `${x}/${y}` : '';
}

/** The starter things placed on the first visit: [kind, i, j, rot]. */
export const STARTER: [string, number, number, Rot][] = [
  ['cottage', 9, 4, 0],
  ['farm', 15, 9, 0],
];
