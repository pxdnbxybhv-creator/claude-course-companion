// Brush engine: turns Stroke display lists into ink on a canvas.
// v0 — deliberately simple placeholder. The public API below is the contract; the
// rendering behind it is expected to get much more painterly.
import type { Drawing, Stroke, StrokePoint } from './types';
import { PIGMENTS } from './types';
import { makeRng } from '../core/rng';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PaintOptions {
  /** Drawing-space → canvas px multiplier (include devicePixelRatio here). Default 1. */
  scale?: number;
  /** 0..1 — paint only this fraction of the stroke (along its path, or fading in for polygons). */
  progress?: number;
  /** 0..1 — overall ink strength multiplier; <1 makes a neglected plant look pale and dry. Default 1. */
  vigor?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(color: string | undefined, a: number): string {
  const [r, g, b] = hexToRgb(color ?? PIGMENTS.ink);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(4)})`;
}

/** Truncate a polyline to the first `t` fraction of its arc length. */
export function partialPath(pts: StrokePoint[], t: number): StrokePoint[] {
  if (t >= 1 || pts.length < 2) return pts;
  if (t <= 0) return pts.slice(0, 1);
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d);
    total += d;
  }
  let want = total * t;
  const out: StrokePoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (want >= seg[i - 1]) {
      out.push(pts[i]);
      want -= seg[i - 1];
    } else {
      const k = seg[i - 1] ? want / seg[i - 1] : 0;
      const a = pts[i - 1], b = pts[i];
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k });
      break;
    }
  }
  return out;
}

/** Left/right outline of a variable-width spine, as one closed polygon. */
export function outline(pts: StrokePoint[], jitter = 0, seed = 1): { x: number; y: number }[] {
  const rng = makeRng(seed);
  const L: { x: number; y: number }[] = [];
  const R: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const h = pts[i].w / 2;
    const j1 = 1 + (rng() - 0.5) * jitter, j2 = 1 + (rng() - 0.5) * jitter;
    L.push({ x: pts[i].x + nx * h * j1, y: pts[i].y + ny * h * j1 });
    R.push({ x: pts[i].x - nx * h * j2, y: pts[i].y - ny * h * j2 });
  }
  return [...L, ...R.reverse()];
}

function polyPath(ctx: Ctx2D, poly: { x: number; y: number }[], s: number) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
  ctx.closePath();
}

export function paintStroke(ctx: Ctx2D, stroke: Stroke, o: PaintOptions = {}): void {
  const s = o.scale ?? 1;
  const vigor = o.vigor ?? 1;
  const progress = o.progress ?? 1;
  if (progress <= 0) return;
  const alpha = Math.min(1, stroke.tone * (0.55 + 0.45 * vigor));
  ctx.save();
  switch (stroke.kind) {
    case 'wash':
    case 'fill': {
      ctx.fillStyle = rgba(stroke.color, alpha * progress * (stroke.kind === 'wash' ? 0.6 : 1));
      polyPath(ctx, stroke.pts, s);
      ctx.fill();
      break;
    }
    case 'dot': {
      const p = stroke.pts[0];
      ctx.fillStyle = rgba(stroke.color, alpha * progress);
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, (p.w / 2) * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      const pts = partialPath(stroke.pts, progress);
      if (pts.length < 2) break;
      ctx.fillStyle = rgba(stroke.color, alpha);
      polyPath(ctx, outline(pts, stroke.kind === 'dry' ? 0.5 : 0.15, stroke.seed), s);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Paint every stroke with `from < birth ≤ growth`. */
export function paintDrawing(ctx: Ctx2D, d: Drawing, growth: number, o: PaintOptions & { from?: number } = {}): void {
  const from = o.from ?? -1;
  for (const st of d.strokes) {
    if (st.birth > growth) break;
    if (st.birth <= from) continue;
    paintStroke(ctx, st, o);
  }
}

/** Rasterise a drawing at a growth level into a fresh transparent canvas. */
export function rasterize(d: Drawing, growth: number, scale: number, vigor = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(d.width * scale);
  c.height = Math.ceil(d.height * scale);
  const ctx = c.getContext('2d')!;
  paintDrawing(ctx, d, growth, { scale, vigor });
  return c;
}

/**
 * Paints `strokes` one after another over time, each drawn along its path like a brush.
 * Call `step` every animation frame with a canvas that already holds everything painted
 * before; finished strokes are committed to `base`, the in-flight stroke is drawn on top.
 */
export class StrokeAnimation {
  private i = 0;
  private t = 0;
  done = false;
  constructor(
    private strokes: Stroke[],
    private base: Ctx2D,
    private o: PaintOptions & { msPerStroke?: number } = {},
  ) {
    this.done = strokes.length === 0;
  }

  /** Advance by dt ms and draw the in-flight stroke onto `overlay` (cleared by the caller). */
  step(dtMs: number, overlay?: Ctx2D): void {
    if (this.done) return;
    const per = this.o.msPerStroke ?? 90;
    this.t += dtMs;
    while (!this.done && this.t >= per) {
      paintStroke(this.base, this.strokes[this.i], this.o);
      this.t -= per;
      this.i++;
      if (this.i >= this.strokes.length) this.done = true;
    }
    if (!this.done && overlay) paintStroke(overlay, this.strokes[this.i], { ...this.o, progress: this.t / per });
  }

  finish(): void {
    while (!this.done) this.step(1e9);
  }
}
