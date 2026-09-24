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
const KIND_H: Record<PlantKind, number> = { bamboo: 0.585, pine: 0.565, plum: 0.55, lotus: 0.49, chrysanthemum: 0.465, orchid: 0.44 };
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

interface Placed {
  key: string;
  plant?: GardenPlant;
  drawing: Drawing;
  /** css px per drawing unit */
  s: number;
  /** world css x / y of the anchor (where it meets the ground) */
  x: number;
  y: number;
  seed: number;
  /** world css x of the name inscription's centre line */
  labelX?: number;
}

interface Layout { items: Placed[]; worldW: number }

/** Minimum distance between two plant anchors: room for the name inscription. */
const MIN_GAP = 62;

/**
 * Place plants along the ground with a rhythm (clusters and pauses, never a grid), a few rocks,
 * slightly different depths. `side` is where the mountains lean (the other side is open sky).
 */
function layoutGarden(plants: GardenPlant[], W: number, H: number, groundY: number, pondTop: number, fit: boolean, side: -1 | 1 = -1): Layout {
  const margin = Math.max(24, W * 0.055);
  const yBack = groundY - H * 0.03;
  const yFront = Math.min(groundY + H * 0.014, pondTop - 3);
  const portrait = W < H * 0.95 ? 0.9 : 1;
  const items: Placed[] = [];
  const L: number[] = [], R: number[] = [], gaps: number[] = [0];
  plants.forEach((p, i) => {
    const r = makeRng(p.habit.seed ^ 0x5bd1e995);
    const frac = clamp(KIND_H[p.habit.plant] + r.range(-0.025, 0.025), 0.42, 0.6) * portrait;
    const s = (frac * H) / REF_H;
    const d = plantDrawing({ kind: p.habit.plant, seed: p.habit.seed, height: REF_H });
    const e = extentOf(d, 1);
    L.push(Math.max(10, (d.anchor.x - e.minX) * s));
    R.push(Math.max(10, (e.maxX - d.anchor.x) * s));
    if (i > 0) {
      // Some plants lean into their neighbour, some stand apart.
      const k = r.chance(0.32) ? r.range(0.4, 0.52) : r.range(0.6, 0.8);
      gaps.push(Math.max(MIN_GAP, (R[i - 1] + L[i]) * k));
    }
    const depth = r();
    items.push({ key: p.habit.id, plant: p, drawing: d, s, x: 0, y: lerp(yBack, yFront, depth), seed: p.habit.seed });
  });
  const n = items.length;
  if (n) {
    // When the painting has room, let the gaps breathe (each by what it can take) up to the width.
    const spanOf = () => gaps.reduce((a, g) => a + g, 0) + L[0] + R[n - 1];
    const target = W - margin * 2;
    if (n >= 2 && spanOf() < target) {
      const room = gaps.map((g, i) => (i === 0 ? 0 : Math.max(0, (R[i - 1] + L[i]) * 1.05 + 24 - g)));
      const total = room.reduce((a, b) => a + b, 0);
      const extra = Math.min(target - spanOf(), total);
      if (total > 0) gaps.forEach((_, i) => (gaps[i] += (extra * room[i]) / total));
    }
    let x = margin + L[0];
    items.forEach((it, i) => { x += gaps[i]; it.x = x; });
  }

  // Rocks for composition: one beside every third plant (on the left, away from the inscription).
  const rocks: Placed[] = [];
  const addRock = (cx: number, size: number, seed: number, y: number) => {
    const d = rockDrawing(seed, 100);
    const s = size / d.width;
    rocks.push({ key: `rock:${seed}`, drawing: d, s, x: cx, y, seed });
  };
  if (n === 0) {
    addRock(W * (0.5 + 0.2 * side), H * 0.16, 11, yFront);
  } else {
    items.forEach((it, i) => {
      if (i % 3 !== (n <= 2 ? 0 : 1)) return;
      const r = makeRng(it.seed ^ 0x2545f491);
      const size = H * r.range(0.1, 0.14) * portrait;
      const cx = Math.max(size * 0.35, it.x - L[i] * 0.35 - size * 0.3);
      addRock(cx, size, (it.seed % 1000) + 3, Math.min(yFront + 2, it.y + H * 0.012));
    });
  }

  const last = n ? items[n - 1].x + R[n - 1] : 0;
  let worldW = Math.max(W, last + margin);
  const all = [...items, ...rocks];
  if (n && last + margin <= W + 0.5) {
    // Fits: centre the group; a lone plant stands toward the mountains, leaving open sky (留白).
    const x0 = items[0].x - L[0];
    const want = n === 1 ? W * (0.5 + 0.13 * side) - items[0].x : (W - (last - x0)) / 2 - x0;
    for (const it of all) it.x += want;
    worldW = W;
  } else if (fit && worldW > W) {
    const f = W / worldW;
    for (const it of all) { it.x *= f; it.s *= f; }
    worldW = W;
  }
  all.sort((a, b) => a.y - b.y);
  return { items: all, worldW };
}

const reachCache = new WeakMap<Drawing, Map<string, { left: number; right: number }>>();

/** How far the plant reaches left/right of its stem below `bandTop` (drawing units). */
function baseReach(d: Drawing, g: number, bandTop: number): { left: number; right: number } {
  const n = bornCount(d, g);
  const key = `${n}:${Math.round(bandTop)}`;
  let m = reachCache.get(d);
  if (!m) reachCache.set(d, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  let left = 0, right = 0;
  for (let i = 0; i < n; i++) {
    const st = d.strokes[i];
    const r = st.kind === 'wash' || st.kind === 'fill' ? 0 : 0.5;
    for (const p of st.pts) {
      if (p.y < bandTop) continue;
      left = Math.max(left, d.anchor.x - (p.x - p.w * r));
      right = Math.max(right, p.x + p.w * r - d.anchor.x);
    }
  }
  const out = { left, right };
  m.set(key, out);
  return out;
}

/** Height (css px) of a plant's vertical name inscription. */
function labelHeight(name: string, size: number): number {
  const n = [...name.trim()].length;
  return isCJK(name) ? Math.min(n, 9) * size * 1.18 : Math.min(n, 18) * size * 0.5;
}

/** Stand each name in the clearest gap beside its plant: right of the stem if free, else left. */
function placeLabels(items: Placed[], growthOf: (key: string) => number, size: number): void {
  const plants = items.filter((i) => i.plant).sort((a, b) => a.x - b.x);
  const reach = plants.map((it) => {
    const band = (labelHeight(it.plant!.habit.name, size) + 10) / it.s;
    const r = baseReach(it.drawing, growthOf(it.key), it.drawing.anchor.y - band);
    return { left: r.left * it.s, right: r.right * it.s };
  });
  const half = size * 0.6;
  let prevEdge = -Infinity;
  plants.forEach((it, i) => {
    const rx = it.x + Math.max(11, reach[i].right + 7);
    const nextEdge = i + 1 < plants.length ? plants[i + 1].x - reach[i + 1].left : Infinity;
    const lx = it.x - Math.max(11, reach[i].left + 7);
    if (rx + half < nextEdge - 2 || lx - half <= prevEdge + 2) it.labelX = rx;
    else it.labelX = lx;
    prevEdge = Math.max(it.x + reach[i].right, it.labelX + half);
  });
}

function vigorFor(freshness: number): number {
  return Math.round((0.4 + 0.6 * clamp(freshness, 0, 1)) * 10) / 10;
}

function isCJK(s: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(s);
}

// ---------------------------------------------------------------------------------------------- scene

interface Slot {
  key: string;
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
    const L = layoutGarden(this.plants, this.W, this.H, this.groundY, this.pondTop, false, this.backdrop?.side ?? -1);
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
        slot = {
          key: it.key, drawing: it.drawing, kind: it.plant?.habit.plant, shown: null, want, bmp: null, prev: null,
          fade: 1, appear: 0, anim: null, overlay: null, queued: false, nodAt: -1e9, animAt: 0, phase: (it.seed % 1000) * 0.37,
        };
        this.slots.set(it.key, slot);
        this.enqueue(slot);
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
    placeLabels(this.items, (k) => this.slots.get(k)?.want.growth ?? 0, this.labelSize);
    this.queue = this.queue.filter((k) => this.slots.has(k));
    this.kick();
  }

  private enqueue(slot: Slot): void {
    if (slot.queued) return;
    slot.queued = true;
    this.queue.push(slot.key);
  }

  private startGrowth(slot: Slot, fromN: number, toN: number): void {
    const bmp = slot.bmp!;
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
    const bmp = rasterize(slot.drawing, growth, px, vigor);
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
    if (key !== this.bdKey && now >= this.bdDue) {
      const hadGround = this.backdrop ? this.groundY : -1;
      const bw = this.bdTargetW();
      const ph = backdropPaintHeight(bw, this.H);
      this.backdrop = paintBackdrop(bw, ph, this.dpr, this.env);
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

    // Rasterise queued plants.
    this.work();

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
          const w = s.want;
          if (s.shown && (w.n !== s.shown.n || w.vigor !== s.shown.vigor || w.px !== s.shown.px)) this.enqueue(s);
        }
      }
    }

    if (this.weather && !this.reduced) {
      const wind = clamp(-this.vel / 1600 + (this.drag ? 0 : 0), -1, 1);
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
        angle += clamp(-this.vel / 900, -0.6, 0.6);
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
    paintLight(ctx, W, H, this.env);

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

  private labelCache = new Map<string, { c: HTMLCanvasElement; w: number; h: number }>();

  /** A habit name as a small vertical inscription, rasterised once (text with a soft paper halo). */
  private labelBitmap(name: string, size: number): { c: HTMLCanvasElement; w: number; h: number } {
    const key = `${name}|${size}|${this.dpr}|${this.labelFont}`;
    const hit = this.labelCache.get(key);
    if (hit) return hit;
    if (this.labelCache.size > 64) this.labelCache.clear();
    const dpr = this.dpr;
    const lh = size * 1.18;
    const cjk = isCJK(name);
    const chars = [...name].slice(0, 9);
    if ([...name].length > 9) chars[8] = '…';
    const latin = name.length > 18 ? name.slice(0, 17) + '…' : name;
    const pad = 4;
    const m = document.createElement('canvas').getContext('2d')!;
    m.font = `italic ${size + 1}px ${this.labelFont}`;
    const w = cjk ? size + pad * 2 : size + 3 + pad * 2;
    const h = (cjk ? chars.length * lh : m.measureText(latin).width) + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgb(52,46,38)';
    ctx.shadowColor = 'rgba(241,233,216,0.95)';
    ctx.shadowBlur = 3 * dpr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (cjk) {
      ctx.font = `${size}px ${this.labelFont}`;
      chars.forEach((ch, i) => ctx.fillText(ch, w / 2, pad + lh * (i + 0.5)));
    } else {
      ctx.translate(w / 2, h - pad);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.font = `italic ${size + 1}px ${this.labelFont}`;
      ctx.fillText(latin, 0, 0);
    }
    const out = { c, w, h };
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
      if (x < -20 || x > this.W + 20) continue;
      const hot = this.hover === it.key;
      const done = it.plant.stats.doneToday;
      ctx.globalAlpha = slot.appear * (hot ? 0.9 : done ? 0.62 : 0.46);
      const b = this.labelBitmap(name, size);
      ctx.drawImage(b.c, x - b.w / 2, it.y - 1 - b.h, b.w, b.h);
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

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
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
export async function renderGardenStill(o: { width: number; height: number; dpr: number; plants: GardenPlant[]; env: SceneEnv }): Promise<HTMLCanvasElement> {
  const { width: W, height: H, dpr } = o;
  const bd = paintBackdrop(W, backdropPaintHeight(W, H), dpr, o.env);
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bd.canvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { items } = layoutGarden(o.plants, W, H, bd.groundY, bd.pondTop, true, bd.side ?? -1);
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
  paintLight(ctx, W, H, o.env);
  return c;
}
