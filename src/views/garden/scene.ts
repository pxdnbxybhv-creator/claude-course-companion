// The garden painting: the living scene on the home screen, and the still used by the scroll export.
//
// Composition: a cached backdrop (sky, mountains, ground) + one ink plant per habit standing on the
// ground line, interleaved with a few scholar's rocks, + a pond that reflects the composed upper scene
// as clearly as the habits are kept fresh. When there are more plants than fit, the painting becomes a
// hand scroll (手卷) that pans with drag / swipe / trackpad and inertia; the mountains move slower.
//
// Painting is cached: backdrop once per size/env, each plant once per (visible strokes, vigor, scale).
// Per frame: blits with a ≤1.5° sway, the pond, light, weather particles, labels.
import type { Habit, PlantKind } from '../../core/types';
import type { HabitStats } from '../../core/habits';
import type { SceneEnv } from '../../ink/scene-types';
import type { Drawing } from '../../ink/types';
import { PIGMENTS } from '../../ink/types';
import { plantDrawing } from '../../ink/plants';
import { rasterize, StrokeAnimation } from '../../ink/brush';
import { groundLine, paintBackdrop, paintPond, paintLight, rockDrawing, type Backdrop } from '../../ink/landscape';
import { Weather } from '../../ink/weather';
import { clamp, lerp, makeNoise2, makeRng } from '../../core/rng';

export interface GardenPlant {
  habit: Habit;
  stats: HabitStats;
}

// ---------------------------------------------------------------------------------------------- layout

/** Plants are generated at one reference height (a stable memo key) and scaled to the canvas. */
const REF_H = 300;
/** Full-grown height as a fraction of the scene height, per kind (bamboo and pine stand tallest). */
const KIND_H: Record<PlantKind, number> = { pine: 0.64, bamboo: 0.6, plum: 0.56, lotus: 0.34, chrysanthemum: 0.3, orchid: 0.26 };
/** Sway amplitude in degrees: bamboo and orchid leaves move, the old pine barely does. */
const KIND_SWAY: Record<PlantKind, number> = { bamboo: 1.35, orchid: 1.15, lotus: 1.0, chrysanthemum: 0.9, plum: 0.65, pine: 0.45 };
const BURST: Record<PlantKind, string | undefined> = {
  plum: PIGMENTS.rouge, lotus: PIGMENTS.rouge, chrysanthemum: PIGMENTS.gamboge,
  orchid: undefined, bamboo: undefined, pine: undefined,
};
const PARALLAX = 0.35;

/**
 * Where the ground should sit (fraction of scene height). On a tall phone canvas the plants should
 * dominate and the pond take about a quarter; a wide desktop scroll can afford a deeper reflection.
 */
function groundTarget(w: number, h: number): number {
  const a = w / h;
  return clamp(0.725 - (a - 0.8) * 0.035, 0.67, 0.725);
}

/**
 * The backdrop painter places its own ground line. To move it lower without reshaping the painting,
 * paint the backdrop taller than the canvas and let the bottom of the pond fall outside the frame.
 */
export function backdropPaintHeight(w: number, h: number): number {
  const target = groundTarget(w, h);
  let h2 = h;
  for (let i = 0; i < 4; i++) {
    const g = groundLine(w, h2).groundY / h2;
    const next = Math.max(h, Math.round((target * h) / g));
    if (Math.abs(next - h2) < 1) break;
    h2 = next;
  }
  return Math.min(h2, Math.round(h * 1.3));
}
const DEG = Math.PI / 180;
const MAX_DPR = 2.5;

interface Extent { minX: number; maxX: number; minY: number; maxY: number }

const extentCache = new WeakMap<Drawing, Map<number, Extent>>();

/** Number of strokes visible at growth g (strokes are sorted by birth). */
function bornCount(d: Drawing, g: number): number {
  let n = 0;
  for (const s of d.strokes) {
    if (s.birth > g) break;
    n++;
  }
  return n;
}

/** Painted bounds of a drawing at growth g, in drawing units. */
function extentOf(d: Drawing, g: number): Extent {
  const n = bornCount(d, g);
  let m = extentCache.get(d);
  if (!m) extentCache.set(d, (m = new Map()));
  const hit = m.get(n);
  if (hit) return hit;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const st = d.strokes[i];
    const poly = st.kind === 'wash' || st.kind === 'fill';
    for (const p of st.pts) {
      const r = poly ? 0 : p.w / 2;
      if (p.x - r < minX) minX = p.x - r;
      if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r;
      if (p.y + r > maxY) maxY = p.y + r;
    }
  }
  const e = n && Number.isFinite(minX)
    ? { minX, maxX, minY, maxY }
    : { minX: d.anchor.x - 4, maxX: d.anchor.x + 4, minY: d.anchor.y - 10, maxY: d.anchor.y };
  m.set(n, e);
  return e;
}

type Plane = 'back' | 'mid' | 'front' | 'water';

/** Three depth planes on land (远淡: further back is smaller and paler) and the water for lotus. */
const PLANES: Record<Exclude<Plane, 'water'>, { dy: number; k: number; alpha: number }> = {
  back: { dy: -0.06, k: 0.82, alpha: 0.8 },
  mid: { dy: -0.02, k: 0.92, alpha: 0.93 },
  front: { dy: 0.012, k: 1, alpha: 1 },
};
const TALL: ReadonlySet<PlantKind> = new Set<PlantKind>(['pine', 'plum', 'bamboo']);

interface Placed {
  key: string;
  plant?: GardenPlant;
  drawing: Drawing;
  /** css px per drawing unit */
  s: number;
  /** world css x / y of the anchor (where it meets the ground or water) */
  x: number;
  y: number;
  seed: number;
  kind: 'plant' | 'rock' | 'mound';
  plane: Plane;
  /** blit opacity (depth recession) */
  alpha: number;
  /** name inscription: world centre x, and bottom (vertical) or top (horizontal) y */
  labelX?: number;
  labelY?: number;
  /** draw order among items with the same y */
  order: number;
}

interface Layout {
  items: Placed[];
  worldW: number;
  /** World x of the empty-sky lead (for the first view of a hand scroll). */
  openSide: 'left' | 'right';
  /** World x of pauses between clusters (where a view edge may fall). */
  gaps: number[];
}

const rockMemo = new Map<number, Drawing>();
const moundMemo = new Map<number, Drawing>();

/** A low slope of pale ink with a few moss dots (苔点), so raised plants stand on ground, not mist. */
function moundDrawing(seed: number): Drawing {
  let d = moundMemo.get(seed);
  if (d) return d;
  const r = makeRng(seed ^ 0x6d2b79f5);
  const pts: { x: number; y: number; w: number }[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const hump = Math.pow(Math.sin(Math.PI * t), 0.7) * (13 + r.range(-2, 3)) * (1 + 0.18 * Math.sin(t * 9 + seed));
    pts.push({ x: t * 100, y: 24 - hump, w: 7 });
  }
  pts.push({ x: 96, y: 27, w: 7 }, { x: 50, y: 28.5, w: 7 }, { x: 4, y: 27, w: 7 });
  const strokes: Drawing['strokes'] = [
    { kind: 'wash', tone: 0.1, birth: 0, seed: r.int(0, 1e9), pts },
    { kind: 'wash', tone: 0.07, birth: 0, seed: r.int(0, 1e9), pts: pts.slice(3, N - 2).map((p) => ({ ...p, y: p.y + 4 })).concat([{ x: 70, y: 27, w: 6 }, { x: 30, y: 27, w: 6 }]) },
  ];
  const dots = r.int(3, 6);
  for (let i = 0; i < dots; i++) {
    const t = r.range(0.12, 0.88);
    const hump = Math.pow(Math.sin(Math.PI * t), 0.7) * 13;
    strokes.push({ kind: 'dot', tone: r.range(0.6, 0.85), birth: 0, seed: r.int(0, 1e9), pts: [{ x: t * 100, y: 24 - hump + r.range(-1, 2), w: r.range(2.2, 4.2) }] });
  }
  d = { width: 100, height: 32, anchor: { x: 50, y: 25 }, strokes };
  moundMemo.set(seed, d);
  return d;
}

/** 3 + 2 + 1 …: odd groups with pauses between them, never an even row. */
function clusterSizes(n: number): number[] {
  const pat = [3, 2, 1];
  const out: number[] = [];
  let left = n, i = 0;
  while (left > 0) {
    const k = Math.min(pat[i % 3], left);
    out.push(k);
    left -= k;
    i++;
  }
  if (out.length >= 2 && out[out.length - 1] === 1 && out[out.length - 2] === 1) { out.pop(); out[out.length - 1] = 2; }
  return out;
}

export type Framing = 'scene' | 'poster' | 'fit';

/**
 * Compose the garden. Tall plants (pine, plum, bamboo) stand on the back and middle planes, short
 * ones (orchid, chrysanthemum) in front, lotus in the water. Plants gather in odd clusters with
 * pauses between, and at least 30 % of the width is left as open sky on the side away from the
 * mountains (`side`). When the garden is wider than the view it becomes a hand scroll.
 */
function layoutGarden(plants: GardenPlant[], W: number, H: number, groundY: number, pondTop: number, framing: Framing, side: -1 | 1 = -1): Layout {
  const margin = Math.max(18, W * 0.045);
  const openSide: 'left' | 'right' = side === 1 ? 'left' : 'right';
  const poster = framing === 'poster';
  const heightK = poster ? 0.7 : W < H * 0.95 ? 0.94 : 1;
  const items: Placed[] = [];
  let order = 0;

  const land = plants.filter((p) => p.habit.plant !== 'lotus');
  const water = plants.filter((p) => p.habit.plant === 'lotus');

  // --- land plants: sizes, planes
  type P = { p: GardenPlant; d: Drawing; s: number; L: number; R: number; plane: Exclude<Plane, 'water'>; r: ReturnType<typeof makeRng> };
  const sizes = clusterSizes(land.length);
  const ps: P[] = [];
  let ci = 0, inCluster = 0, tallInCluster = 0;
  for (const p of land) {
    if (inCluster >= sizes[ci]) { ci++; inCluster = 0; tallInCluster = 0; }
    const r = makeRng(p.habit.seed ^ 0x5bd1e995);
    const kind = p.habit.plant;
    const plane: P['plane'] = poster
      ? (TALL.has(kind) ? 'back' : 'front')
      : TALL.has(kind) ? (tallInCluster++ % 2 === 0 ? (r.chance(0.7) ? 'back' : 'mid') : 'mid') : 'front';
    const d = plantDrawing({ kind, seed: p.habit.seed, height: REF_H });
    const e = extentOf(d, 1);
    const frac = (KIND_H[kind] + r.range(-0.02, 0.02)) * heightK * PLANES[plane].k;
    const maxW = Math.min(H * 0.62, W * (W < H ? 0.66 : 0.36));
    const s = Math.min((frac * H) / REF_H, maxW / Math.max(1, e.maxX - e.minX));
    ps.push({ p, d, s, L: Math.max(8, (d.anchor.x - e.minX) * s), R: Math.max(8, (e.maxX - d.anchor.x) * s), plane, r });
    inCluster++;
  }

  // --- x positions: tight within a cluster (planes may overlap), a pause between clusters
  const xs: number[] = [];
  const pauses: number[] = [];
  const pauseW = clamp(W * 0.06, 26, 90);
  let x = 0;
  ci = 0; inCluster = 0;
  ps.forEach((q, i) => {
    if (i > 0) {
      const prev = ps[i - 1];
      if (inCluster >= sizes[ci]) {
        ci++; inCluster = 0;
        const g = (prev.R + q.L) * (poster ? 0.3 : 0.72) + (poster ? 0 : pauseW * q.r.range(0.8, 1.3));
        pauses.push(x + g / 2);
        x += g;
      } else if (prev.plane === q.plane) x += Math.max(H * (poster ? 0.05 : 0.1), (prev.R + q.L) * (poster ? 0.3 : q.r.range(0.45, 0.6)));
      else x += Math.max(H * 0.05, (prev.R + q.L) * (poster ? 0.25 : q.r.range(0.25, 0.4)));
    }
    xs.push(x);
    inCluster++;
  });
  const n = ps.length;
  let span = n ? xs[n - 1] + ps[n - 1].R + ps[0].L : 0;
  let x0 = n ? -ps[0].L : 0; // world x of the group's left edge relative to xs

  // --- lotus: in the water, beyond the group's open-sky end
  const lot: { p: GardenPlant; d: Drawing; s: number; L: number; R: number; y: number }[] = water.map((p) => {
    const r = makeRng(p.habit.seed ^ 0x5bd1e995);
    const d = plantDrawing({ kind: 'lotus', seed: p.habit.seed, height: REF_H });
    const e = extentOf(d, 1);
    const sc = Math.min(((KIND_H.lotus + r.range(-0.02, 0.02)) * heightK * H) / REF_H, Math.min(H * 0.55, W * 0.5) / Math.max(1, e.maxX - e.minX));
    const depth = poster ? 0.3 : r.range(0.22, 0.35);
    return { p, d, s: sc, L: (d.anchor.x - e.minX) * sc, R: (e.maxX - d.anchor.x) * sc, y: pondTop + (H - pondTop) * depth };
  });
  const lotusSpan = lot.reduce((a, l) => a + (l.L + l.R) * 0.7, 0);

  // --- fit the view: prefer 30 % open sky; else shrink a little; else a hand scroll
  const lead = poster ? 0 : W * 0.3;
  const allowed = W - margin * 2 - lead;
  let f = 1;
  let pannable = false;
  if (poster || framing === 'fit') {
    const room = W - margin * 2;
    const need = span + lotusSpan * 0.6;
    if (need > room) f = room / need;
  } else if (span + lotusSpan * 0.4 > allowed) {
    if ((span + lotusSpan * 0.4) * 0.86 <= allowed) f = allowed / (span + lotusSpan * 0.4);
    else pannable = true;
  } else if (pauses.length) {
    // A little breathing room, never spread edge to edge.
    const extra = Math.min(allowed - span - lotusSpan * 0.4, span * 0.15) / pauses.length;
    let add = 0, pi = 0;
    for (let i = 1; i < n; i++) {
      if (pi < pauses.length && xs[i] > pauses[pi]) { add += extra; pauses[pi] += add - extra / 2; pi++; }
      xs[i] += add;
    }
    span += extra * pauses.length;
  }
  if (f !== 1) {
    for (let i = 0; i < n; i++) { xs[i] *= f; ps[i].s *= f; ps[i].L *= f; ps[i].R *= f; }
    for (let i = 0; i < pauses.length; i++) pauses[i] *= f;
    for (const l of lot) { l.s *= f; l.L *= f; l.R *= f; }
    span *= f;
    x0 *= f;
  }

  // Where the group starts in world x.
  let worldW = W;
  let startX: number;
  if (pannable) {
    // The open sky becomes the scroll's lead; the group follows it.
    worldW = margin + span + margin + lead + lotusSpan * 0.4;
    startX = openSide === 'left' ? lead + margin : margin;
  } else if (poster || framing === 'fit') {
    startX = (W - span) / 2;
  } else {
    // Lean toward the mountains, leaving the open side empty.
    const slack = allowed - span - lotusSpan * 0.4;
    startX = openSide === 'left' ? margin + lead + lotusSpan * 0.4 + slack * 0.65 : margin + slack * 0.35;
  }
  const off = startX - x0;
  const baseY = (pl: Exclude<Plane, 'water'>) => Math.min(groundY + H * PLANES[pl].dy * (poster ? 0.85 : 1), pondTop - 3);
  ps.forEach((q, i) => {
    const y = baseY(q.plane);
    const alpha = PLANES[q.plane].alpha;
    if (q.plane !== 'front') {
      // ground under a raised plant
      const bw = clamp((q.L + q.R) * 0.55, H * 0.08, H * 0.3);
      const md = moundDrawing(q.p.habit.seed);
      items.push({ key: `mound:${q.p.habit.id}`, drawing: md, s: bw / md.width, x: xs[i] + off, y: y + 1, seed: q.p.habit.seed, kind: 'mound', plane: q.plane, alpha, order: order++ });
    }
    items.push({ key: q.p.habit.id, plant: q.p, drawing: q.d, s: q.s, x: xs[i] + off, y, seed: q.p.habit.seed, kind: 'plant', plane: q.plane, alpha, order: order++ });
  });
  const gaps = pauses.map((g) => g + off);

  // Lotus beyond the open-sky end of the group, in the water.
  const groupL = startX, groupR = startX + span;
  let lx = openSide === 'left' ? groupL - margin * 0.3 : groupR + margin * 0.3;
  for (const l of lot) {
    const cx = openSide === 'left' ? lx - l.R * 0.75 : lx + l.L * 0.75;
    items.push({ key: l.p.habit.id, plant: l.p, drawing: l.d, s: l.s, x: clamp(cx, l.L * 0.4, worldW - l.R * 0.4), y: l.y, seed: l.p.habit.seed, kind: 'plant', plane: 'water', alpha: 1, order: order++ });
    lx = openSide === 'left' ? cx - l.L * 0.5 : cx + l.R * 0.5;
  }

  // Rocks: one at the foot of each cluster of two or more, on its mountain side; one in an empty garden.
  const addRock = (cx: number, size: number, seed: number, y: number) => {
    let d = rockMemo.get(seed);
    if (!d) rockMemo.set(seed, (d = rockDrawing(seed, 100)));
    items.push({ key: `rock:${seed}`, drawing: d, s: size / d.width, x: cx, y, seed, kind: 'rock', plane: 'front', alpha: 1, order: order++ });
  };
  const yFront = baseY('front');
  if (plants.length === 0) addRock(W * (0.5 + 0.2 * side), H * 0.16, 11, yFront);
  else if (!poster) {
    let k = 0;
    sizes.forEach((sz) => {
      if (sz >= 2) {
        const q = ps[k];
        const size = H * q.r.range(0.07, 0.11);
        const cx = xs[k] + off + (openSide === 'left' ? q.R * 0.5 + size * 0.2 : -q.L * 0.5 - size * 0.2);
        addRock(clamp(cx, size * 0.4, worldW - size * 0.4), size, (q.p.habit.seed % 1000) + 3, yFront + 2);
      }
      k += sz;
    });
  }

  items.sort((a, b) => (a.plane === 'water' ? 1 : 0) - (b.plane === 'water' ? 1 : 0) || a.y - b.y || a.order - b.order);
  return { items, worldW, openSide, gaps };
}

// ---------------------------------------------------------------------------------------------- labels

/** A coarse map of where ink lies (css px cells), for placing name inscriptions in clear paper. */
interface InkGrid { g: Float32Array; cols: number; rows: number; cell: number }

function inkGrid(items: Placed[], growthOf: (key: string) => number, worldW: number, H: number): InkGrid {
  const cell = 6;
  const cols = Math.ceil(worldW / cell) + 1, rows = Math.ceil(H / cell) + 1;
  const g = new Float32Array(cols * rows);
  const add = (X: number, Y: number, v: number) => {
    const c = Math.floor(X / cell), r = Math.floor(Y / cell);
    if (c >= 0 && c < cols && r >= 0 && r < rows) g[r * cols + c] += v;
  };
  for (const it of items) {
    if (it.kind === 'mound') continue;
    const d = it.drawing;
    const n = bornCount(d, it.plant ? growthOf(it.key) : 1);
    const tx = (px: number) => it.x + (px - d.anchor.x) * it.s, ty = (py: number) => it.y + (py - d.anchor.y) * it.s;
    for (let i = 0; i < n; i++) {
      const st = d.strokes[i];
      if (st.kind === 'wash' || st.kind === 'fill') {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of st.pts) { x0 = Math.min(x0, tx(p.x)); x1 = Math.max(x1, tx(p.x)); y0 = Math.min(y0, ty(p.y)); y1 = Math.max(y1, ty(p.y)); }
        for (let Y = y0; Y <= y1; Y += cell) for (let X = x0; X <= x1; X += cell) add(X, Y, st.tone * 0.8);
        continue;
      }
      const pts = st.pts;
      if (pts.length === 1) { add(tx(pts[0].x), ty(pts[0].y), st.tone * 2); continue; }
      for (let j = 1; j < pts.length; j++) {
        const ax = tx(pts[j - 1].x), ay = ty(pts[j - 1].y), bx = tx(pts[j].x), by = ty(pts[j].y);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell * 0.7)));
        const wv = st.tone * Math.max(1, pts[j].w * it.s * 0.4);
        for (let k = 0; k <= steps; k++) add(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, wv);
      }
    }
  }
  return { g, cols, rows, cell };
}

function inkIn(grid: InkGrid, x0: number, y0: number, x1: number, y1: number): number {
  const { g, cols, rows, cell } = grid;
  let sum = 0;
  const c0 = Math.max(0, Math.floor(x0 / cell)), c1 = Math.min(cols - 1, Math.floor(x1 / cell));
  const r0 = Math.max(0, Math.floor(y0 / cell)), r1 = Math.min(rows - 1, Math.floor(y1 / cell));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) sum += g[r * cols + c];
  return sum;
}

const LATIN_MAX = 14;
const LABEL_LATIN = "'Cormorant Garamond', 'EB Garamond', Georgia, serif";

/** Break a Latin name into at most two short lines at word boundaries (never mid-word). */
export function wrapLatin(name: string, max = LATIN_MAX): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const word = w.length > max ? w.slice(0, max - 1) + '…' : w;
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= max) cur += ' ' + word;
    else {
      lines.push(cur);
      cur = word;
      if (lines.length === 2) break;
    }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
    let last = lines[1];
    if (last.length > max - 1) last = last.slice(0, max - 1).replace(/\s+\S*$/, '') || last.slice(0, max - 1);
    if (!last.endsWith('…')) last += '…';
    lines[1] = last;
  }
  return lines.slice(0, 2);
}

interface LabelBox { mode: 'v' | 'h'; lines: string[]; w: number; h: number }

let measureCtx: CanvasRenderingContext2D | null = null;
function labelBox(name: string, size: number, latinFont: string): LabelBox {
  const trimmed = name.trim();
  if (isCJK(trimmed)) {
    const chars = [...trimmed].slice(0, 9);
    if ([...trimmed].length > 9) chars[8] = '…';
    return { mode: 'v', lines: chars, w: size + 10, h: chars.length * size * 1.18 + 10 };
  }
  const lines = wrapLatin(trimmed);
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  measureCtx.font = `italic ${size + 2}px ${latinFont}`;
  const w = Math.max(...lines.map((l) => measureCtx!.measureText(l).width), 10) + 12;
  return { mode: 'h', lines, w, h: lines.length * (size + 2) * 1.12 + 8 };
}

/**
 * Stand each name where the paper is clearest beside its own plant: never over foliage if it can be
 * helped, never nearer another plant's stem than its own, never on another name.
 */
function placeLabels(items: Placed[], growthOf: (key: string) => number, worldW: number, H: number, groundY: number, pondTop: number, size: number, latinFont: string): void {
  const plants = items.filter((i) => i.kind === 'plant' && i.plant);
  if (!plants.length) return;
  const grid = inkGrid(items, growthOf, worldW, H);
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const stems = plants.map((p) => p.x);
  const order = [...plants].sort((a, b) => a.x - b.x);
  for (const it of order) {
    const box = labelBox(it.plant!.habit.name, size, latinFont);
    let best = Infinity, bx = it.x, by = it.y;
    const tryAt = (cx: number, yEdge: number) => {
      const x0 = cx - box.w / 2, x1 = cx + box.w / 2;
      const y0 = box.mode === 'v' ? yEdge - box.h : yEdge, y1 = box.mode === 'v' ? yEdge : yEdge + box.h;
      if (x0 < 2 || x1 > worldW - 2 || y1 > H - 2) return;
      let cost = inkIn(grid, x0 + 3, y0 + 3, x1 - 3, y1 - 3) * 10;
      cost += Math.abs(cx - it.x) * 0.08 + Math.abs(yEdge - it.y) * 0.05;
      for (const sx of stems) if (sx !== it.x && Math.abs(cx - sx) < Math.abs(cx - it.x) - 2) cost += 400;
      for (const t of taken) if (x0 < t.x1 + 4 && x1 > t.x0 - 4 && y0 < t.y1 + 4 && y1 > t.y0 - 4) cost += 1000;
      if (cost < best) { best = cost; bx = cx; by = yEdge; }
    };
    if (box.mode === 'v') {
      for (let k = 0; k < 9; k++) {
        const dx = box.w / 2 + 4 + k * size * 0.8;
        for (const lift of [0, box.h * 0.35]) { tryAt(it.x + dx, it.y - 4 - lift); tryAt(it.x - dx, it.y - 4 - lift); }
      }
    } else {
      // A small caption on the bank or the water just below the plant's foot.
      const tops = it.plane === 'water' ? [it.y + 4, it.y - box.h - 6] : [Math.max(it.y, groundY) + 2, pondTop + 4, it.y - box.h - 4];
      for (const top of tops) for (const dx of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) tryAt(it.x + dx * box.w, top);
    }
    it.labelX = bx;
    it.labelY = by;
    taken.push(box.mode === 'v' ? { x0: bx - box.w / 2, y0: by - box.h, x1: bx + box.w / 2, y1: by } : { x0: bx - box.w / 2, y0: by, x1: bx + box.w / 2, y1: by + box.h });
  }
}

function vigorFor(freshness: number): number {
  return Math.round((0.4 + 0.6 * clamp(freshness, 0, 1)) * 10) / 10;
}

function isCJK(s: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(s);
}

// ---------------------------------------------------------------------------------------------- caches

// Module-level caches outlive the view, so coming back to the garden paints instantly.
const BMP_BUDGET = 18_000_000; // pixels (~72 MB of bitmaps)
const bmpCache = new Map<string, HTMLCanvasElement>();
let bmpPixels = 0;

function bmpKey(ident: string, n: number, vigor: number, px: number): string {
  return `${ident}|${n}|${vigor}|${px}`;
}

function bmpGet(k: string): HTMLCanvasElement | undefined {
  const c = bmpCache.get(k);
  if (c) {
    bmpCache.delete(k);
    bmpCache.set(k, c); // most recently used last
  }
  return c;
}

function bmpPut(k: string, c: HTMLCanvasElement): void {
  const old = bmpCache.get(k);
  if (old) {
    bmpPixels -= old.width * old.height;
    bmpCache.delete(k);
  }
  bmpCache.set(k, c);
  bmpPixels += c.width * c.height;
  for (const [key, v] of bmpCache) {
    if (bmpPixels <= BMP_BUDGET || bmpCache.size <= 1) break;
    bmpCache.delete(key);
    bmpPixels -= v.width * v.height;
  }
}

let backdropCache: { key: string; bd: Backdrop; w: number; h: number; ph: number } | null = null;

/**
 * Time-of-day light in backdrop space (so the moonlit patch sits on the painted moon while the
 * scroll pans): paintLight multiplied onto white at quarter resolution — it is a soft map anyway.
 */
function buildLightLayer(bd: Backdrop, w: number, h: number, env: SceneEnv): HTMLCanvasElement | null {
  if (env.tod === 'day') return null;
  const k = 0.25;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w * k));
  c.height = Math.max(2, Math.ceil(h * k));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(k, k);
  paintLight(ctx, w, h, env, { body: bd.body && bd.body.r > 0 ? { x: bd.body.x, y: bd.body.y, r: bd.body.r } : undefined });
  return c;
}

// ---------------------------------------------------------------------------------------------- scene

interface Slot {
  key: string;
  /** Identity of what is painted (habit, kind, seed) — the bitmap cache key prefix. */
  ident: string;
  drawing: Drawing;
  kind?: PlantKind;
  /** What the bitmap shows. */
  shown: { n: number; vigor: number; px: number } | null;
  /** What it should show. */
  want: { growth: number; n: number; vigor: number; px: number };
  bmp: HTMLCanvasElement | null;
  prev: HTMLCanvasElement | null;
  fade: number;
  appear: number;
  anim: StrokeAnimation | null;
  overlay: HTMLCanvasElement | null;
  queued: boolean;
  nodAt: number;
  /** performance.now() before which a pending stroke animation waits (e.g. for a pan to settle). */
  animAt: number;
  phase: number;
}

type Tween = { from: number; to: number; t0: number; dur: number };

const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export class GardenScene {
  readonly canvas: HTMLCanvasElement;
  /** Tap on a plant (or its inscription). */
  onPick?: (id: string) => void;
  /** Called when the scene becomes (non-)pannable, so the view can expose keyboard panning. */
  onPannable?: (pannable: boolean) => void;
  /** Called when the backdrop is (re)painted: which side is open sky, where the sun/moon sits (css px). */
  onBackdrop?: (info: { openSide: 'left' | 'right'; body?: { x: number; y: number; r: number } }) => void;

  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private env: SceneEnv;
  private backdrop: Backdrop | null = null;
  private bdKey = '';
  private bdW = 0;
  /** Canvas height the backdrop was painted for, and the (taller) height it was painted at. */
  private bdH = 0;
  private bdPH = 0;
  private light: HTMLCanvasElement | null = null;
  private lightKey = '';
  private bdDue = 0;
  private plants: GardenPlant[] = [];
  private items: Placed[] = [];
  private worldW = 0;
  private slots = new Map<string, Slot>();
  private queue: string[] = [];
  private weather: Weather | null = null;
  private noise = makeNoise2(1127);
  private pan = 0;
  private vel = 0;
  private tween: Tween | null = null;
  private drag: { id: number; x0: number; y0: number; pan0: number; t0: number; moved: boolean; captured: boolean; samples: { t: number; x: number }[] } | null = null;
  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private t = 0;
  private hidden = false;
  private onScreen = true;
  private destroyed = false;
  private reduced: boolean;
  private hover: string | null = null;
  private pending = new Map<string, number>();
  private events: { at: number; fn: () => void }[] = [];
  private lastPanAt = -1e9;
  /** A breeze from the pointer sweeping across the painting, −1..1, decaying. */
  private gust = 0;
  private lastMove: { t: number; x: number } | null = null;
  private pannableNow = false;
  private labelFont = '';
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private mq: MediaQueryList | null = null;

  constructor(canvas: HTMLCanvasElement, env: SceneEnv) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.env = env;
    this.mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!this.mq?.matches;
    this.mq?.addEventListener?.('change', this.onMotionPref);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('visibilitychange', this.onVisibility);

    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(canvas);
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver((es) => {
        this.onScreen = es.some((e) => e.isIntersecting);
        this.kick();
      });
      this.io.observe(canvas);
    }
    document.fonts?.ready.then(() => { this.labelFont = ''; this.kick(); });
    this.measure();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.mq?.removeEventListener?.('change', this.onMotionPref);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.slots.clear();
  }

  // ------------------------------------------------------------------------------------ public API

  setEnv(env: SceneEnv): void {
    this.env = env;
    this.weather?.setEnv(env);
    this.kick();
  }

  setPlants(plants: GardenPlant[]): void {
    this.plants = plants;
    this.relayout();
  }

  get pannable(): boolean {
    return this.worldW > this.W + 1;
  }

  private get maxPan(): number {
    return Math.max(0, this.worldW - this.W);
  }

  /** Habit id of the plant under a point (css px relative to the canvas), or null. */
  hitTest(x: number, y: number): string | null {
    // A name inscription belongs to its own plant, even when it stands nearer a neighbour's stem.
    const size = this.labelSize;
    for (const it of this.items) {
      if (!it.plant || it.labelX === undefined || it.labelY === undefined) continue;
      const box = labelBox(it.plant.habit.name.trim(), size, LABEL_LATIN);
      const cx = it.labelX - this.pan;
      const y0 = box.mode === 'v' ? it.labelY - box.h : it.labelY;
      if (x >= cx - box.w / 2 - 4 && x <= cx + box.w / 2 + 4 && y >= y0 - 4 && y <= y0 + box.h + 4) return it.key;
    }
    let best: string | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (!it.plant) continue;
      const slot = this.slots.get(it.key);
      const g = slot?.want.growth ?? 0;
      const d = it.drawing;
      const e = extentOf(d, g);
      const sx = it.x - this.pan;
      const L = Math.min(sx + (e.minX - d.anchor.x) * it.s - 6, sx - 22);
      const R = Math.max(sx + (e.maxX - d.anchor.x) * it.s + 6, sx + 34);
      const T = Math.min(it.y + (e.minY - d.anchor.y) * it.s - 8, it.y - 90);
      const B = it.y + 14;
      if (x >= L && x <= R && y >= T && y <= B) {
        const dd = Math.abs(x - sx) + (y < it.y + (e.minY - d.anchor.y) * it.s ? 40 : 0);
        if (dd < bestD) { bestD = dd; best = it.key; }
      }
    }
    return best;
  }

  /** Screen x (css px) of a plant's stem, after any pan in progress settles. */
  plantScreenX(id: string): number | null {
    const it = this.items.find((i) => i.key === id);
    if (!it) return null;
    return it.x - (this.tween ? this.tween.to : this.pan);
  }

  /**
   * Which side of the sky a poem should be written on: the side with the least ink in the upper
   * part of the view, away from the sun or moon and from the plant being celebrated.
   */
  poemSide(id?: string): 'left' | 'right' {
    const W = this.W, H = this.H;
    if (!W) return 'right';
    const pan = this.tween ? this.tween.to : clamp(this.pan, 0, this.maxPan);
    const y0 = H * 0.04, y1 = H * 0.5;
    const zones = [[W * 0.02, W * 0.42], [W * 0.58, W * 0.98]];
    const ink = [0, 0];
    for (const it of this.items) {
      if (!it.plant) continue;
      const d = it.drawing;
      const n = bornCount(d, this.slots.get(it.key)?.want.growth ?? 0);
      const sx = it.x - pan;
      for (let i = 0; i < n; i++) {
        const st = d.strokes[i];
        const wgt = st.kind === 'wash' || st.kind === 'fill' ? 6 : 1;
        for (const p of st.pts) {
          const X = sx + (p.x - d.anchor.x) * it.s, Y = it.y + (p.y - d.anchor.y) * it.s;
          if (Y < y0 || Y > y1) continue;
          for (let z = 0; z < 2; z++) if (X >= zones[z][0] && X <= zones[z][1]) ink[z] += Math.max(1, p.w * it.s) * wgt * st.tone;
        }
      }
    }
    const total = ink[0] + ink[1] + 1;
    const cost = [ink[0] / total, ink[1] / total];
    if (id) {
      const x = this.plantScreenX(id);
      if (x !== null) { if (x < W * 0.45) cost[0] += 0.35; else if (x > W * 0.55) cost[1] += 0.35; }
    }
    const bd = this.backdrop;
    if (bd?.body && bd.body.r > 0) {
      const k = H / this.bdH;
      const bx = bd.body.x * k - clamp(pan * PARALLAX, 0, Math.max(0, this.bdW * k - W));
      if (bx < W * 0.42) cost[0] += 0.12; else if (bx > W * 0.58) cost[1] += 0.12;
    }
    cost[(bd?.side ?? -1) === 1 ? 1 : 0] += 0.08; // mountains lean this way: prefer the open sky
    return cost[0] <= cost[1] ? 'left' : 'right';
  }

  /** Width of the scene in css px. */
  get width(): number {
    return this.W;
  }

  /** Pan by a fraction of the view width (keyboard). */
  panBy(fraction: number): void {
    if (!this.pannable) return;
    this.panTo(clamp((this.tween?.to ?? this.pan) + fraction * this.W, 0, this.maxPan));
  }

  panTo(target: number, dur = 700): void {
    target = clamp(target, 0, this.maxPan);
    this.vel = 0;
    if (this.reduced) {
      this.pan = target;
      this.tween = null;
    } else this.tween = { from: this.pan, to: target, t0: performance.now(), dur };
    this.lastPanAt = performance.now();
    this.kick();
  }

  /** Bring a plant into view if it is not. */
  focusPlant(id: string): boolean {
    const it = this.items.find((i) => i.key === id);
    if (!it || !this.pannable) return false;
    const sx = it.x - this.pan;
    if (sx > this.W * 0.18 && sx < this.W * 0.82) return false;
    this.panTo(it.x - this.W * 0.5);
    return true;
  }

  /**
   * A habit was just done: the next growth for it is painted in stroke by stroke, the plant nods,
   * and petals drift from it. Call right after toggling the check-in (before setPlants arrives).
   */
  celebrate(id: string): void {
    const now = performance.now();
    this.pending.set(id, now);
    const moved = this.focusPlant(id);
    const at = now + (moved ? 620 : 120);
    this.events.push({
      at,
      fn: () => {
        const slot = this.slots.get(id);
        const it = this.items.find((i) => i.key === id);
        if (!slot || !it) return;
        slot.nodAt = performance.now();
        if (this.reduced || !this.weather) return;
        const e = extentOf(it.drawing, slot.want.growth);
        const top = it.y + (e.minY - it.drawing.anchor.y) * it.s;
        const bx = it.x - this.pan + ((e.minX + e.maxX) / 2 - it.drawing.anchor.x) * it.s * 0.6;
        this.weather.burst(bx, lerp(top, it.y, 0.3), slot.kind ? BURST[slot.kind] : undefined);
      },
    });
    this.kick();
  }

  // ------------------------------------------------------------------------------------ layout sync

  private measure(): void {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    const first = !this.W;
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (!this.weather) this.weather = new Weather(this.env, w, h);
    else this.weather.resize(w, h);
    // Repaint the backdrop right away the first time, otherwise once resizing settles.
    this.bdDue = first || !this.backdrop ? 0 : performance.now() + 180;
    this.relayout();
  }

  private get groundY(): number {
    if (!this.backdrop) return groundLine(this.bdTargetW(), backdropPaintHeight(this.bdTargetW(), this.H)).groundY;
    return this.backdrop.groundY * (this.H / this.bdH);
  }

  private get pondTop(): number {
    if (!this.backdrop) return groundLine(this.bdTargetW(), backdropPaintHeight(this.bdTargetW(), this.H)).pondTop;
    return this.backdrop.pondTop * (this.H / this.bdH);
  }

  private get labelSize(): number {
    return this.H > 470 ? 12 : 11;
  }

  private relayout(): void {
    if (!this.W) return;
    const L = layoutGarden(this.plants, this.W, this.H, this.groundY, this.pondTop, 'scene', this.backdrop?.side ?? -1);
    this.items = L.items;
    this.worldW = L.worldW;
    this.pan = clamp(this.pan, 0, this.maxPan);
    if (this.pannable !== this.pannableNow) {
      this.pannableNow = this.pannable;
      this.onPannable?.(this.pannableNow);
    }
    const now = performance.now();
    const seen = new Set<string>();
    for (const it of this.items) {
      seen.add(it.key);
      const growth = it.plant ? it.plant.stats.growth : 1;
      const vigor = it.plant ? vigorFor(it.plant.stats.freshness) : 1;
      const px = Math.round(it.s * this.dpr * 50) / 50;
      const want = { growth, n: bornCount(it.drawing, growth), vigor, px };
      let slot = this.slots.get(it.key);
      if (!slot || slot.drawing !== it.drawing) {
        const ident = `${it.key}|${it.plant?.habit.plant ?? 'rock'}|${it.seed}`;
        slot = {
          key: it.key, ident, drawing: it.drawing, kind: it.plant?.habit.plant, shown: null, want, bmp: null, prev: null,
          fade: 1, appear: 0, anim: null, overlay: null, queued: false, nodAt: -1e9, animAt: 0, phase: (it.seed % 1000) * 0.37,
        };
        this.slots.set(it.key, slot);
        const hit = bmpGet(bmpKey(ident, want.n, want.vigor, want.px));
        if (hit) {
          slot.bmp = hit;
          slot.shown = { n: want.n, vigor: want.vigor, px: want.px };
          slot.appear = 1;
        } else this.enqueue(slot);
        continue;
      }
      const grewFrom = slot.want.n;
      slot.want = want;
      const sh = slot.shown;
      if (!sh || slot.anim) {
        if (!sh) this.enqueue(slot);
        continue;
      }
      const pendingAt = this.pending.get(it.key);
      if (pendingAt !== undefined && now - pendingAt < 4000 && want.n > sh.n && sh.px === want.px && slot.bmp && grewFrom <= want.n) {
        this.pending.delete(it.key);
        this.startGrowth(slot, sh.n, want.n);
      } else if (sh.n !== want.n || sh.vigor !== want.vigor || sh.px !== want.px) {
        this.enqueue(slot);
      }
    }
    for (const k of [...this.slots.keys()]) if (!seen.has(k)) this.slots.delete(k);
    placeLabels(this.items, (k) => this.slots.get(k)?.want.growth ?? 0, this.worldW, this.H, this.groundY, this.pondTop, this.labelSize, LABEL_LATIN);
    this.queue = this.queue.filter((k) => this.slots.has(k));
    this.kick();
  }

  private enqueue(slot: Slot): void {
    if (slot.queued) return;
    slot.queued = true;
    this.queue.push(slot.key);
  }

  private startGrowth(slot: Slot, fromN: number, toN: number): void {
    // Paint onto a copy: the old bitmap stays valid in the cache under its own growth.
    const bmp = document.createElement('canvas');
    bmp.width = slot.bmp!.width;
    bmp.height = slot.bmp!.height;
    bmp.getContext('2d')!.drawImage(slot.bmp!, 0, 0);
    slot.bmp = bmp;
    const strokes = slot.drawing.strokes.slice(fromN, toN);
    const ov = document.createElement('canvas');
    ov.width = bmp.width;
    ov.height = bmp.height;
    slot.overlay = ov;
    // A few strokes are painted deliberately; a long backlog quickly (whole growth ≲ 2.6 s).
    const per = clamp(1500 / Math.max(1, strokes.length), 55, 260);
    slot.animAt = performance.now() + (this.tween ? Math.max(0, this.tween.t0 + this.tween.dur * 0.8 - performance.now()) : 140);
    slot.anim = new StrokeAnimation(strokes, bmp.getContext('2d')!, { scale: slot.shown!.px, vigor: slot.shown!.vigor, msPerStroke: this.reduced ? 20 : per });
    // Delay the first stroke until the pan / nod has begun.
    slot.shown = { ...slot.shown!, n: toN };
  }

  /** Rasterise at most one queued plant per frame, so the first paint never stalls. */
  private work(): void {
    const key = this.queue.shift();
    if (!key) return;
    const slot = this.slots.get(key);
    if (!slot) return;
    slot.queued = false;
    if (slot.anim) return; // re-queued when the animation ends
    const { growth, n, vigor, px } = slot.want;
    const sh = slot.shown;
    if (sh && sh.n === n && sh.vigor === vigor && sh.px === px && slot.bmp) return;
    const k = bmpKey(slot.ident, n, vigor, px);
    let bmp = bmpGet(k);
    if (!bmp) {
      bmp = rasterize(slot.drawing, growth, px, vigor);
      bmpPut(k, bmp);
    }
    if (slot.bmp && slot.appear > 0) {
      slot.prev = slot.bmp;
      slot.fade = this.reduced ? 1 : 0;
    }
    slot.bmp = bmp;
    slot.shown = { n, vigor, px };
  }

  // ------------------------------------------------------------------------------------ loop

  private kick(): void {
    if (this.destroyed || this.raf || this.hidden || !this.onScreen) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private isBusy(now: number): boolean {
    if (this.drag || this.tween || this.vel !== 0 || this.queue.length || this.events.length) return true;
    if (this.pan < 0 || this.pan > this.maxPan) return true;
    if (now - this.lastPanAt < 1600) return true;
    if (this.bdDue && now < this.bdDue + 50) return true;
    for (const s of this.slots.values()) {
      if (s.anim || s.fade < 1 || s.appear < 1 || now - s.nodAt < 2600) return true;
    }
    return false;
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed || this.hidden || !this.onScreen || !this.W) return;
    const busy = this.isBusy(now);
    const idleMotion = !this.reduced;
    // Idle sway runs at ~30 fps; anything interactive at full rate.
    if (!busy && idleMotion && now - this.lastDraw < 31) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    this.lastDraw = now;
    this.t += dt;
    this.step(now, dt);
    this.draw(now);
    if (busy || idleMotion) this.raf = requestAnimationFrame(this.frame);
  };

  private step(now: number, dt: number): void {
    // Backdrop (expensive, cached).
    const e = this.env;
    const key = `${this.W}x${this.H}@${this.dpr}|${this.bdTargetW()}|${e.season}|${e.tod}|${Math.round(e.hour * 2)}|${e.moonPhase.toFixed(2)}|${e.termIndex}|${e.seed}`;
    let paintedBackdrop = false;
    if (key !== this.bdKey && now >= this.bdDue) {
      const hadGround = this.backdrop ? this.groundY : -1;
      const bw = this.bdTargetW();
      const ph = backdropPaintHeight(bw, this.H);
      if (backdropCache?.key === key) this.backdrop = backdropCache.bd;
      else {
        this.backdrop = paintBackdrop(bw, ph, this.dpr, this.env);
        backdropCache = { key, bd: this.backdrop, w: bw, h: this.H, ph };
        paintedBackdrop = true;
      }
      this.bdW = bw;
      this.bdH = this.H;
      this.bdPH = ph;
      this.bdKey = key;
      this.bdDue = 0;
      if (Math.abs(hadGround - this.groundY) > 0.5 || this.backdrop.side !== undefined) this.relayout();
      this.reportBackdrop();
    }

    // Timed events.
    if (this.events.length) {
      const due = this.events.filter((ev) => ev.at <= now);
      this.events = this.events.filter((ev) => ev.at > now);
      for (const ev of due) ev.fn();
    }

    // Pan physics.
    if (!this.drag) {
      if (this.tween) {
        const k = easeOut((now - this.tween.t0) / this.tween.dur);
        this.pan = lerp(this.tween.from, this.tween.to, k);
        if (k >= 1) this.tween = null;
        this.lastPanAt = now;
      } else {
        if (this.vel !== 0) {
          this.pan += this.vel * dt;
          this.vel *= Math.exp(-3.4 * dt);
          this.lastPanAt = now;
        }
        const c = clamp(this.pan, 0, this.maxPan);
        if (c !== this.pan) {
          this.pan += (c - this.pan) * (1 - Math.exp(-11 * dt));
          this.vel *= Math.exp(-12 * dt);
          if (Math.abs(c - this.pan) < 0.4) this.pan = c;
        }
        if (Math.abs(this.vel) < 6) this.vel = 0;
      }
    }

    // Rasterise queued plants — not in the frame that painted the backdrop, so it shows first.
    if (!paintedBackdrop) this.work();

    // Fades, stroke animations.
    const ms = dt * 1000;
    for (const s of this.slots.values()) {
      if (s.bmp && s.appear < 1) s.appear = this.reduced ? 1 : Math.min(1, s.appear + dt / 0.7);
      if (s.fade < 1) {
        s.fade = Math.min(1, s.fade + dt / 0.6);
        if (s.fade >= 1) s.prev = null;
      }
      if (s.anim && now >= s.animAt) {
        const ov = s.overlay!;
        const octx = ov.getContext('2d')!;
        octx.clearRect(0, 0, ov.width, ov.height);
        s.anim.step(ms, octx);
        if (s.anim.done) {
          s.anim = null;
          s.overlay = null;
          if (s.bmp && s.shown) bmpPut(bmpKey(s.ident, s.shown.n, s.shown.vigor, s.shown.px), s.bmp);
          const w = s.want;
          if (s.shown && (w.n !== s.shown.n || w.vigor !== s.shown.vigor || w.px !== s.shown.px)) this.enqueue(s);
        }
      }
    }

    this.gust *= Math.exp(-1.6 * dt);
    if (Math.abs(this.gust) < 0.003) this.gust = 0;
    if (this.weather && !this.reduced) {
      const wind = clamp(-this.vel / 1600 + this.gust, -1, 1);
      this.weather.step(dt, wind);
    }
  }

  private reportBackdrop(): void {
    const bd = this.backdrop;
    if (!bd || !this.onBackdrop) return;
    const k = this.H / this.bdH;
    const off = clamp(this.pan * PARALLAX, 0, Math.max(0, this.bdW * k - this.W));
    const b = bd.body && bd.body.r > 0 ? { x: bd.body.x * k - off, y: bd.body.y * k, r: bd.body.r * k } : undefined;
    this.onBackdrop({ openSide: (bd.side ?? -1) === 1 ? 'left' : 'right', body: b });
  }

  private bdTargetW(): number {
    // Wider than the view when the scroll pans; quantised so adding a habit rarely repaints it.
    if (!this.pannable) return this.W;
    const need = this.W + this.maxPan * PARALLAX;
    const q = this.W * 0.25;
    return Math.ceil(need / q) * q;
  }

  private draw(now: number): void {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bd = this.backdrop;
    if (bd) {
      const k = H / this.bdH;
      const maxOff = Math.max(0, this.bdW * k - W);
      const off = clamp(this.pan * PARALLAX, 0, maxOff);
      ctx.drawImage(bd.canvas, -off, 0, this.bdW * k, this.bdPH * k);
    }

    // Plants and rocks, back to front.
    const tSec = now / 1000;
    for (const it of this.items) {
      const slot = this.slots.get(it.key);
      if (!slot || !slot.bmp) continue;
      const d = it.drawing;
      const sx = it.x - this.pan;
      const w = d.width * it.s, h = d.height * it.s;
      const ox = -d.anchor.x * it.s, oy = -d.anchor.y * it.s;
      if (sx + ox + w < -30 || sx + ox > W + 30) continue;
      let angle = 0;
      if (slot.kind && !this.reduced) {
        const amp = KIND_SWAY[slot.kind];
        const n = this.noise(tSec * 0.16 + slot.phase, slot.phase * 0.7) * 1.6;
        angle = amp * clamp(n, -1, 1);
        // A slow nod when the habit is done — one lean and back, never bouncy.
        const nt = (now - slot.nodAt) / 2400;
        if (nt >= 0 && nt < 1) angle += 1.1 * Math.sin(Math.PI * nt) * (1 - nt * 0.3);
        angle += clamp(-this.vel / 900, -0.6, 0.6) + this.gust * 0.9 * (amp / 1.35);
        angle = clamp(angle, -1.5, 1.5) * DEG;
      }
      ctx.save();
      ctx.translate(sx, it.y);
      if (angle) ctx.rotate(angle);
      const a = slot.appear;
      if (slot.prev && slot.fade < 1) {
        ctx.globalAlpha = a * (1 - slot.fade);
        ctx.drawImage(slot.prev, ox, oy, w, h);
        ctx.globalAlpha = a * slot.fade;
      } else ctx.globalAlpha = a;
      ctx.drawImage(slot.bmp, ox, oy, w, h);
      if (slot.overlay) ctx.drawImage(slot.overlay, ox, oy, w, h);
      ctx.restore();
    }

    // Pond: reflect the composed upper scene (the pond painter grabs the band it needs first).
    const pondTop = this.pondTop;
    if (bd && pondTop < H) {
      paintPond(ctx, { x: 0, y: pondTop, w: W, h: H - pondTop, t: this.t, source: this.canvas, mirrorY: pondTop, clarity: this.env.clarity, dpr, seed: this.env.seed, tod: this.env.tod });
    }
    if (bd) {
      const e = this.env;
      const lk = `${this.bdKey}|${e.tod}|${e.hour.toFixed(2)}|${e.moonPhase.toFixed(3)}`;
      if (lk !== this.lightKey) {
        this.light = buildLightLayer(bd, this.bdW, this.bdPH, e);
        this.lightKey = lk;
      }
      if (this.light) {
        const k = H / this.bdH;
        const off = clamp(this.pan * PARALLAX, 0, Math.max(0, this.bdW * k - W));
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(this.light, -off, 0, this.bdW * k, this.bdPH * k);
        ctx.restore();
      }
    }

    this.drawLabels();

    if (this.weather && !this.reduced) this.weather.draw(ctx);

    // A quiet scroll indicator when the painting is a hand scroll.
    if (this.pannable) {
      const since = now - this.lastPanAt;
      const a = 0.28 + 0.45 * clamp(1 - (since - 900) / 700, 0, 1);
      const tw = Math.min(72, W * 0.18);
      const x0 = (W - tw) / 2, y0 = H - 9;
      const frac = W / this.worldW;
      const pos = clamp(this.pan / this.maxPan, 0, 1);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(27,25,22,${(a * 0.4).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + tw, y0); ctx.stroke();
      ctx.strokeStyle = `rgba(27,25,22,${a.toFixed(3)})`;
      ctx.lineWidth = 2.2;
      const tl = Math.max(10, tw * frac);
      const tx = x0 + (tw - tl) * pos;
      ctx.beginPath(); ctx.moveTo(tx, y0); ctx.lineTo(tx + tl, y0); ctx.stroke();
      ctx.restore();
    }
  }

  private labelCache = new Map<string, { c: HTMLCanvasElement; w: number; h: number; mode: 'v' | 'h' }>();

  /** A habit name as a small inscription (vertical for Chinese, a short horizontal caption for Latin), rasterised once. */
  private labelBitmap(name: string, size: number): { c: HTMLCanvasElement; w: number; h: number; mode: 'v' | 'h' } {
    const key = `${name}|${size}|${this.dpr}|${this.labelFont}`;
    const hit = this.labelCache.get(key);
    if (hit) return hit;
    if (this.labelCache.size > 64) this.labelCache.clear();
    const dpr = this.dpr;
    const box = labelBox(name, size, LABEL_LATIN);
    const c = document.createElement('canvas');
    c.width = Math.ceil(box.w * dpr);
    c.height = Math.ceil(box.h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgb(52,46,38)';
    ctx.shadowColor = 'rgba(241,233,216,0.95)';
    ctx.shadowBlur = 3 * dpr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (box.mode === 'v') {
      const lh = size * 1.18;
      ctx.font = `${size}px ${this.labelFont}`;
      box.lines.forEach((ch, i) => ctx.fillText(ch, box.w / 2, 5 + lh * (i + 0.5)));
    } else {
      const lh = (size + 2) * 1.12;
      ctx.font = `italic ${size + 2}px ${LABEL_LATIN}`;
      box.lines.forEach((line, i) => ctx.fillText(line, box.w / 2, 4 + lh * (i + 0.5)));
    }
    const out = { c, w: box.w, h: box.h, mode: box.mode };
    this.labelCache.set(key, out);
    return out;
  }

  private drawLabels(): void {
    const ctx = this.ctx;
    if (!this.labelFont) {
      this.labelFont = getComputedStyle(document.documentElement).getPropertyValue('--font-text').trim() || 'serif';
      this.labelCache.clear();
    }
    const size = this.labelSize;
    ctx.save();
    for (const it of this.items) {
      if (!it.plant) continue;
      const slot = this.slots.get(it.key);
      if (!slot?.bmp) continue;
      const name = it.plant.habit.name.trim();
      if (!name) continue;
      const x = (it.labelX ?? it.x + 13) - this.pan;
      if (x < -40 || x > this.W + 40) continue;
      const hot = this.hover === it.key;
      const done = it.plant.stats.doneToday;
      ctx.globalAlpha = slot.appear * (hot ? 0.9 : done ? 0.66 : 0.5);
      const b = this.labelBitmap(name, size);
      const y = it.labelY ?? it.y - 1;
      // Vertical labels hang upward from their anchor; horizontal captions sit below it.
      ctx.drawImage(b.c, x - b.w / 2, b.mode === 'v' ? y - b.h : y, b.w, b.h);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------ input

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pan0: this.pan, t0: performance.now(), moved: false, captured: false, samples: [{ t: performance.now(), x: e.clientX }] };
    this.tween = null;
    this.vel = 0;
    this.kick();
  };

  /** Pointer sweeps become a breeze: particles drift, plants lean a little. */
  private feelWind(e: PointerEvent): void {
    const t = performance.now();
    const lm = this.lastMove;
    this.lastMove = { t, x: e.clientX };
    if (!lm || t - lm.t > 120 || this.reduced) return;
    const v = (e.clientX - lm.x) / Math.max(8, t - lm.t); // px per ms
    this.gust = clamp(this.gust * 0.7 + clamp(v / 2.2, -1, 1) * 0.3, -1, 1);
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d?.captured) this.feelWind(e);
    if (!d || d.id !== e.pointerId) {
      if (e.pointerType === 'mouse') {
        const r = this.canvas.getBoundingClientRect();
        const id = this.hitTest(e.clientX - r.left, e.clientY - r.top);
        if (id !== this.hover) {
          this.hover = id;
          this.canvas.style.cursor = id ? 'pointer' : this.pannable ? 'grab' : '';
          this.kick();
        }
      }
      return;
    }
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true;
      if (this.pannable && Math.abs(dx) > Math.abs(dy)) {
        try { this.canvas.setPointerCapture(e.pointerId); d.captured = true; } catch { /* ignore */ }
        if (e.pointerType === 'mouse') this.canvas.style.cursor = 'grabbing';
      }
    }
    if (d.moved && d.captured) {
      let p = d.pan0 - dx;
      const max = this.maxPan;
      if (p < 0) p *= 0.32;
      else if (p > max) p = max + (p - max) * 0.32;
      this.pan = p;
      const now = performance.now();
      d.samples.push({ t: now, x: e.clientX });
      if (d.samples.length > 8) d.samples.shift();
      this.lastPanAt = now;
      this.kick();
    }
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    const now = performance.now();
    if (!d.moved && now - d.t0 < 650) {
      const r = this.canvas.getBoundingClientRect();
      const id = this.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (id) this.onPick?.(id);
    } else if (d.captured) {
      const recent = d.samples.filter((s) => now - s.t < 90);
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        const v = (b.x - a.x) / Math.max(16, b.t - a.t) * 1000;
        this.vel = clamp(-v, -4000, 4000);
      }
      if (e.pointerType === 'mouse') this.canvas.style.cursor = 'grab';
    }
    this.kick();
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.drag?.id === e.pointerId) this.drag = null;
    this.kick();
  };

  private onLeave = (): void => {
    if (this.hover) {
      this.hover = null;
      this.kick();
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.pannable) return;
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!d) return;
    e.preventDefault();
    if (e.deltaMode === 1) d *= 16;
    this.tween = null;
    this.vel = 0;
    this.pan = clamp(this.pan + d, 0, this.maxPan);
    this.lastPanAt = performance.now();
    this.kick();
  };

  private onVisibility = (): void => {
    this.hidden = document.visibilityState === 'hidden';
    if (!this.hidden) {
      this.last = 0;
      this.kick();
    }
  };

  private onMotionPref = (): void => {
    this.reduced = !!this.mq?.matches;
    this.kick();
  };
}

// ---------------------------------------------------------------------------------------------- still

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/** Paint a still image of the whole garden (backdrop, plants, rocks, pond) for export — no UI. */
export async function renderGardenStill(o: { width: number; height: number; dpr: number; plants: GardenPlant[]; env: SceneEnv; framing?: Framing }): Promise<HTMLCanvasElement> {
  const { width: W, height: H, dpr } = o;
  const bd = paintBackdrop(W, backdropPaintHeight(W, H), dpr, o.env);
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bd.canvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { items } = layoutGarden(o.plants, W, H, bd.groundY, bd.pondTop, o.framing ?? 'fit', bd.side ?? -1);
  for (const it of items) {
    const growth = it.plant ? it.plant.stats.growth : 1;
    const vigor = it.plant ? vigorFor(it.plant.stats.freshness) : 1;
    const bmp = rasterize(it.drawing, growth, it.s * dpr, vigor);
    const d = it.drawing;
    ctx.drawImage(bmp, it.x - d.anchor.x * it.s, it.y - d.anchor.y * it.s, d.width * it.s, d.height * it.s);
    await yieldFrame();
  }
  if (bd.pondTop < H) {
    paintPond(ctx, { x: 0, y: bd.pondTop, w: W, h: H - bd.pondTop, t: 0, source: c, mirrorY: bd.pondTop, clarity: o.env.clarity, dpr, seed: o.env.seed, tod: o.env.tod });
  }
  paintLight(ctx, W, H, o.env, { body: bd.body && bd.body.r > 0 ? { x: bd.body.x, y: bd.body.y, r: bd.body.r } : undefined });
  return c;
}
