// 开篇 · shared helpers for the film's painters: canvases, soft fields, stroke builders, the
// PaintJob contract (spec §13.2: every painter is (layout, seed) → PaintJob, so the stage's deadline
// queue can slice any paint), and the film's palette. No module-level work beyond constants.
import type { Stroke, StrokeKind, StrokePoint } from '../../../ink/types';
import { paintStroke } from '../../../ink/brush';
import { makeRng, type Rng } from '../../../core/rng';
import type { LayoutCls } from '../shots';

/** A paint split into steps; the stage runs them within its slice budget. */
export interface PaintJob { canvas: HTMLCanvasElement; steps: (() => void)[] }

/** What every painter is given: the viewport (css px), its layout class and the layer's dpr. */
export interface Lay {
  w: number; h: number;
  cls: LayoutCls;
  /** 0 (portrait) … 1 (landscape). */
  mix: number;
  /** true when the portrait composition is used. */
  P: boolean;
  dpr: number;
  /** Interpolate a P value and an L value by the layout's mix. */
  l(p: number, q: number): number;
}

export function makeLay(w: number, h: number, dpr: number, cls: LayoutCls, mix: number): Lay {
  return { w, h, cls, mix, P: mix < 0.5, dpr, l: (p, q) => p + (q - p) * mix };
}

export const C = {
  paper: '#f1e9d8',
  page: '#efe4cc',
  slip: '#f6efdd',
  ink: '#1b1916',
  lead: '#f3eee2',
  leadRGB: '243,238,226',
  night: '#26303d',
  indigo: '#3d5a73',
  rouge: '#b83a4b',
  cinnabar: '#c0412f',
  ochre: '#a8703a',
  gamboge: '#d9a62e',
  malachite: '#5f8a6e',
  mount: '#2b251e',
  sky: '#1e2735',
} as const;

export function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  return g;
}

/** A layer canvas at css size w × h and `dpr`, its context scaled to css px. */
export function layer(w: number, h: number, dpr: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = mk(w * dpr, h * dpr);
  const g = ctxOf(c);
  g.scale(dpr, dpr);
  return { c, g };
}

/** Release a canvas's memory (keep rule). */
export function release(c: HTMLCanvasElement | null | undefined): void {
  if (c) { c.width = 0; c.height = 0; }
}

/**
 * A soft colour/alpha field over (x0, y0, w, h) (css px) at `res` field px per css px, upscaled
 * smoothly: washes, glows and mottles. `fn` writes straight RGBA (0..255, alpha 0..1) into out.
 */
export function field(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, res: number,
  fn: (x: number, y: number, out: Float32Array) => void): void {
  const fw = Math.max(2, Math.ceil(w * res)), fh = Math.max(2, Math.ceil(h * res));
  const c = mk(fw, fh);
  const fg = ctxOf(c);
  const img = fg.createImageData(fw, fh);
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
      d[k + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
  }
  fg.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, x0, y0, w, h);
  g.restore();
}

/** A stroke in drawing space (css px of the layer). */
export function st(kind: StrokeKind, pts: [number, number, number][], tone: number, seed: number, o: Partial<Stroke> = {}): Stroke {
  return { kind, pts: pts.map(([x, y, w]) => ({ x, y, w })), tone, birth: 0, seed, ...o };
}

/**
 * Paint strokes onto a context already scaled to css px. The brush composes the context's own
 * transform with its scale, so the scale here is 1 (the second argument is kept for call sites).
 */
export function paint(g: CanvasRenderingContext2D, strokes: Stroke[], _dpr?: number, o: { progress?: number; vigor?: number } = {}): void {
  for (const s of strokes) paintStroke(g, s, { scale: 1, ...o });
}

/** Points along a quadratic-ish curve through a, b (control), c, with a width profile. */
export function curve(a: [number, number], b: [number, number], c: [number, number], w: (u: number) => number, n = 12): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1], w(u)]);
  }
  return out;
}

/** Points along an ellipse arc. */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: (u: number) => number, n = 16, rot = 0): [number, number, number][] {
  const out: [number, number, number][] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + (a1 - a0) * u;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr, w(u)]);
  }
  return out;
}

/** A closed polygon outline for wash/fill strokes (first ≠ last). */
export function poly(pts: [number, number][], soft = 2): [number, number, number][] {
  return pts.map(([x, y], i) => [x, y, i === 0 ? soft : 0]);
}

/** An ellipse as a polygon (for fills), with a little wobble. */
export function blob(cx: number, cy: number, rx: number, ry: number, rng: Rng, jag = 0.06, n = 22, rot = 0): [number, number][] {
  const out: [number, number][] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rng() * 2 - 1) * jag;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}

/** Taper profiles. */
export const taper = (w: number, head = 0.15, tail = 0.35) => (u: number) => w * Math.min(1, u / head, (1 - u) / tail + 0.08);
export const even = (w: number) => (_u: number) => w;

export { makeRng };
export type { Rng, Stroke, StrokePoint };

export const ease = {
  io: (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(1 - u, 3)),
  in: (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u),
  s: (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)),
};

/** 0..1 progress of t through [a, b]. */
export const span = (t: number, a: number, b: number) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
/** 1 inside [a, b] with fades of `f` s at both ends. */
export const window01 = (t: number, a: number, b: number, fi = 0.3, fo = fi) => Math.min(span(t, a, a + fi), 1 - span(t, b - fo, b));
