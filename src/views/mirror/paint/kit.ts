// The sprite kit: a stroke collector in world units (u) around a sprite's anchor, and the shape
// helpers every painter shares. Pure (no DOM at import): specs can be listed and checked in node.
//
// A sprite is painted once per (id, variant, size, dpr) with the app's brush engine (ink/brush.ts)
// plus a few crisp canvas marks (eyes, glints, glyphs) — never in the frame loop.
import type { Stroke, StrokeKind } from '../../../ink/types';

export type Pt = [number, number];
export type WPt = [number, number, number];

export type Op =
  | { k: 'stroke'; s: Stroke }
  | { k: 'fn'; f: (g: CanvasRenderingContext2D) => void };

/** Collects strokes (u, relative to the sprite's anchor). */
export class B {
  ops: Op[] = [];
  private seed: number;
  constructor(seed = 1) { this.seed = (seed >>> 0) || 1; }
  private push(kind: StrokeKind, pts: { x: number; y: number; w: number }[], tone: number, color: string | undefined, o: Partial<Stroke> = {}) {
    this.ops.push({ k: 'stroke', s: { kind, pts, tone, color, birth: 0, seed: this.seed++, ...o } });
    return this;
  }
  /** Pigment polygon, crisp-ish edge. */
  fill(color: string | undefined, pts: Pt[], tone = 0.9, soft = 0.5) {
    return this.push('fill', pts.map(([x, y], i) => ({ x, y, w: i === 0 ? soft : 1 })), tone, color);
  }
  /** Diluted wash polygon with bleeding edges. */
  wash(color: string | undefined, pts: Pt[], tone = 0.3, soft = 2) {
    return this.push('wash', pts.map(([x, y], i) => ({ x, y, w: i === 0 ? soft : 1 })), tone, color);
  }
  /** Loaded brush along a spine (w = full width in u). */
  brush(pts: WPt[], tone = 0.85, color?: string, dryness?: number) {
    return this.push('brush', pts.map(([x, y, w]) => ({ x, y, w })), tone, color, dryness !== undefined ? { dryness } : {});
  }
  /** 飞白 dry brush. */
  dry(pts: WPt[], tone = 0.6, color?: string, dryness = 0.6) {
    return this.push('dry', pts.map(([x, y, w]) => ({ x, y, w })), tone, color, { dryness });
  }
  /** Fine outline 勾勒. */
  line(pts: Pt[], w = 0.6, tone = 0.7, color?: string) {
    return this.push('line', pts.map(([x, y]) => ({ x, y, w })), tone, color);
  }
  dot(x: number, y: number, d: number, tone = 0.9, color?: string) {
    return this.push('dot', [{ x, y, w: d }], tone, color);
  }
  /** Crisp canvas marks in u space (eyes, glints, glyphs). */
  flat(f: (g: CanvasRenderingContext2D) => void) {
    this.ops.push({ k: 'fn', f });
    return this;
  }
  /** A crisp filled circle. */
  disc(x: number, y: number, r: number, color: string, a = 1) {
    return this.flat((g) => { g.globalAlpha = a; g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; });
  }
  /** A crisp circle outline. */
  ring(x: number, y: number, r: number, w: number, color: string, a = 1) {
    return this.flat((g) => { g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; });
  }
  /** Two pale eyes with ink pupils (enemies read by their eyes). */
  eyes(x: number, y: number, gap: number, r: number, look = 0.3, white = '#f4efe4', pupil = '#111') {
    return this.flat((g) => {
      for (const sx of [-1, 1]) {
        g.fillStyle = white; g.beginPath(); g.arc(x + sx * gap, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = pupil; g.beginPath(); g.arc(x + sx * gap + r * look, y + r * 0.1, r * 0.55, 0, Math.PI * 2); g.fill();
      }
    });
  }
  /** A glyph in a face (the font must be loaded before baking). */
  glyph(ch: string, x: number, y: number, size: number, color: string, font = BRUSH_FONT, a = 1, rot = 0) {
    return this.flat((g) => {
      g.save();
      g.translate(x, y); if (rot) g.rotate(rot);
      g.globalAlpha = a; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${size}px ${font}`;
      g.fillText(ch, 0, size * 0.04);
      g.restore();
    });
  }
}

export const BRUSH_FONT = "'Ma Shan Zheng','LXGW WenKai','STKaiti','KaiTi',serif";
export const TEXT_FONT = "'LXGW WenKai','Kaiti SC','STKaiti','KaiTi',serif";

/** How a sprite is framed and painted. Coordinates are u around the anchor (0, 0). */
export interface Spec {
  /** [x0, y0, x1, y1] in u around the anchor. */
  box: readonly [number, number, number, number];
  /** Variants / animation frames (default 1). */
  n?: number;
  /** Outline: a paper halo (enemies), a dark rim (pale things), none. Default 'paper'. */
  halo?: 'paper' | 'dark' | 'none';
  paint(b: B, v: number): void;
}

// ───────────────────────────────────────────── geometry

export const TAU = Math.PI * 2;

/** An ellipse (closed) or an arc (open, n+1 points). */
export function ell(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = TAU, n = 22): Pt[] {
  const out: Pt[] = [];
  const closed = Math.abs(a1 - a0 - TAU) < 1e-6;
  const m = closed ? n : n + 1;
  for (let i = 0; i < m; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
/** An arc spine for brush(), width easing w0 → w1. */
export function arcW(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w0: number, w1: number, n = 10): WPt[] {
  return ell(cx, cy, rx, ry, a0, a1, n).map(([x, y], i) => [x, y, w0 + ((w1 - w0) * i) / n]);
}
/** A wobbly blob (deterministic by seed). */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, jag = 0.12, n = 18): Pt[] {
  const out: Pt[] = [];
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const ph = rnd() * TAU, ph2 = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + jag * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 5 + ph2) * 0.4) + jag * 0.5 * (rnd() - 0.5);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}
/** Rotate points about (cx, cy). */
export function rot(pts: Pt[], a: number, cx = 0, cy = 0): Pt[] {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
export function rotW(pts: WPt[], a: number, cx = 0, cy = 0): WPt[] {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y, w]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c, w]);
}
/** A regular star / polygon. */
export function star(cx: number, cy: number, r0: number, r1: number, n: number, a0 = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r0; const a = a0 + (i * Math.PI) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
/** A tapered straight spine from (x0,y0) to (x1,y1). */
export function spine(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, n = 3, bend = 0): WPt[] {
  const out: WPt[] = [];
  const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, b = Math.sin(t * Math.PI) * bend;
    out.push([x0 + (x1 - x0) * t + (nx / L) * b, y0 + (y1 - y0) * t + (ny / L) * b, w0 + (w1 - w0) * t]);
  }
  return out;
}
/** A deterministic 0..1 hash of (id, k). */
export function h01(seed: number, k: number): number {
  let x = (seed ^ Math.imul(k + 0x9e37, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
