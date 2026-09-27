// Telegraphs: wet vermilion ink filling a shape — how full it is shows the time left (k 0 → 1).
// Shapes back up colour: rings for areas, lines for charges and beams, a fan of dots for spreads.
// Per frame this is paths filled with flat rgba plus a baked blotch sprite: no gradients, no filters.
import type { FxName } from '../ids';
import type { Camera, Sprite, TeleShape } from '../types';
import { DANGER, rgbOf } from './palette';

const [DR, DG, DB] = rgbOf(DANGER);
const red = (a: number) => `rgba(${DR},${DG},${DB},${a.toFixed(3)})`;
/** A small cache of rgba strings (no string building per frame for the common alphas). */
const RED = Array.from({ length: 21 }, (_, i) => red(i / 20));
const R = (a: number) => RED[Math.max(0, Math.min(20, Math.round(a * 20)))];

export class Tele {
  /** The baked wet-ink blotch (fx:teleInk), set by the painter once baked. */
  blot: Sprite | null = null;
  constructor(private dpr: number) {}

  draw(ctx: CanvasRenderingContext2D, cam: Camera, s: TeleShape, k: number): void {
    k = Math.max(0, Math.min(1, k));
    const sc = cam.scale;
    const px = (s.x - cam.x) * sc + cam.w / 2, py = (s.y - cam.y) * sc + cam.h / 2;
    const lw = Math.max(1, 1.6 * this.dpr);
    const edge = 0.55 + 0.4 * k, wet = 0.14 + 0.36 * k * k;
    ctx.setTransform(1, 0, 0, 1, px, py);
    switch (s.kind) {
      case 'circle': {
        const r = s.r * sc;
        ctx.fillStyle = R(0.08);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        this.blotAt(ctx, 0, 0, r * k, wet + 0.2);
        ctx.strokeStyle = R(edge); ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'ring': {
        const r0 = Math.min(s.r, s.r2) * sc, r1 = Math.max(s.r, s.r2) * sc;
        const gaps = s.gaps ?? [];
        // the band between the gaps: the whole band pale, then the wet part growing outward
        this.band(ctx, r0, r1, gaps, R(0.1));
        this.band(ctx, r0, r0 + (r1 - r0) * k, gaps, R(wet + 0.15));
        ctx.strokeStyle = R(edge); ctx.lineWidth = lw;
        this.arcs(ctx, r1, gaps); this.arcs(ctx, r0, gaps);
        break;
      }
      case 'line': {
        const len = s.len * sc, w = s.w * sc;
        const c = Math.cos(s.dir), n = Math.sin(s.dir);
        ctx.setTransform(c, n, -n, c, px, py);
        ctx.fillStyle = R(0.1); ctx.fillRect(0, -w / 2, len, w);
        ctx.fillStyle = R(wet + 0.2); ctx.fillRect(0, -w / 2 * (0.3 + 0.7 * k), len * k, w * (0.3 + 0.7 * k));
        ctx.strokeStyle = R(edge); ctx.lineWidth = lw; ctx.strokeRect(0, -w / 2, len, w);
        // the head of the charge: a bead of ink where it will end
        ctx.fillStyle = R(edge); ctx.beginPath(); ctx.arc(len, 0, Math.max(2 * this.dpr, w * 0.18), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'cone': {
        const r = s.r * sc, h = (s.deg * Math.PI) / 360;
        ctx.fillStyle = R(0.09);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, s.dir - h, s.dir + h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = R(wet + 0.18);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * k, s.dir - h, s.dir + h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = R(edge); ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, s.dir - h, s.dir + h); ctx.closePath(); ctx.stroke();
        break;
      }
      case 'fan': {
        // a fan of dots: one ray per shot, the dots appear from the source outward
        const h = (s.deg * Math.PI) / 360, n = Math.max(1, s.n | 0);
        const reach = 150 * sc, dots = 6, dr = Math.max(1.6 * this.dpr, 3 * sc);
        ctx.fillStyle = R(edge);
        for (let i = 0; i < n; i++) {
          const a = n === 1 ? s.dir : s.dir - h + (2 * h * i) / (n - 1);
          const ca = Math.cos(a), sa = Math.sin(a);
          const shown = Math.ceil(dots * (0.25 + 0.75 * k));
          for (let j = 1; j <= shown; j++) {
            const d = (reach * j) / dots;
            ctx.beginPath(); ctx.arc(ca * d, sa * d, dr * (1 - j / (dots + 2)), 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private blotAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
    if (r < 0.5) return;
    const b = this.blot;
    if (!b) { ctx.fillStyle = R(a); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); return; }
    // the blot sprite is a ±32 u disc inside its padded box: scale so that 32 u → r px
    const k = r / 32;
    ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.drawImage(b.img, b.sx, b.sy, b.sw, b.sh, x - b.ax * b.w * k, y - b.ay * b.h * k, b.w * k, b.h * k);
    ctx.globalAlpha = 1;
  }
  private band(ctx: CanvasRenderingContext2D, r0: number, r1: number, gaps: readonly { at: number; w: number }[], fill: string) {
    if (r1 <= r0) return;
    ctx.fillStyle = fill;
    for (const [a0, a1] of spans(gaps)) {
      ctx.beginPath(); ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, r0, a1, a0, true); ctx.closePath(); ctx.fill();
    }
  }
  private arcs(ctx: CanvasRenderingContext2D, r: number, gaps: readonly { at: number; w: number }[]) {
    for (const [a0, a1] of spans(gaps)) { ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke(); }
  }

  /** A zone / wash: the fx sprite (a ±32 u disc) scaled to radius r at opacity a. */
  zone(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite | null, _look: FxName, x: number, y: number, r: number, a: number): void {
    const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
    const k = (r / 32) * cam.scale;
    if (!s) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#3d5a73';
      ctx.beginPath(); ctx.arc(px, py, r * cam.scale, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.setTransform(k, 0, 0, k, px, py);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** Angle spans (radians) of a full circle minus the gaps ({ at, w } in radians). Memoised per gaps array. */
const spanCache = new WeakMap<object, [number, number][]>();
const FULL: [number, number][] = [[0, Math.PI * 2]];
function spans(gaps: readonly { at: number; w: number }[]): [number, number][] {
  if (!gaps.length) return FULL;
  const hit = spanCache.get(gaps);
  if (hit) return hit;
  const g = [...gaps].map((x) => ({ a: x.at - x.w / 2, b: x.at + x.w / 2 })).sort((p, q) => p.a - q.a);
  const out: [number, number][] = [];
  for (let i = 0; i < g.length; i++) {
    const next = g[(i + 1) % g.length];
    const from = g[i].b, to = i + 1 < g.length ? next.a : next.a + Math.PI * 2;
    if (to > from) out.push([from, to]);
  }
  spanCache.set(gaps, out);
  return out;
}
