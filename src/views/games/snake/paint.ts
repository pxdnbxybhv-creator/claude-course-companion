// Painting for 贪吃蛇: the snake as ONE continuous tapered brushstroke, redrawn every frame (so it
// has its own fast renderer rather than the full brush engine), plus the food and festival treats,
// which are painted once with the brush engine and cached as sprites.
import { applyInkGrain, paintStroke } from '../../../ink/brush';
import { fillPaper } from '../../../ink/paper';
import { PIGMENTS, type Stroke, type StrokeKind, type StrokePoint } from '../../../ink/types';
import { makeRng, type Rng } from '../../../core/rng';
import type { BonusKind } from './logic';

export interface P { x: number; y: number }

// ── noise ─────────────────────────────────────────────────────────────────────

function hash(i: number): number {
  let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth 1D value noise in 0..1. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 7919), b = hash(i + 1 + seed * 7919);
  return a + (b - a) * f * f * (3 - 2 * f);
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ── spine ─────────────────────────────────────────────────────────────────────

/**
 * Round a grid polyline into a brush path (each corner becomes a quadratic curve between the
 * midpoints of its two segments) and resample it every `step` px. Head first in, head first out.
 */
export function smoothSpine(raw: P[], step: number): P[] {
  const pts: P[] = [];
  for (const p of raw) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 0.01) pts.push(p);
  }
  if (pts.length < 2) return pts.slice();
  const dense: P[] = [pts[0]];
  const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const n = pts.length;
  if (n === 2) dense.push(pts[1]);
  else {
    dense.push(mid(pts[0], pts[1]));
    for (let i = 1; i < n - 1; i++) {
      const a = mid(pts[i - 1], pts[i]), c = pts[i], b = mid(pts[i], pts[i + 1]);
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        dense.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
      }
    }
    dense.push(pts[n - 1]);
  }
  // resample by arc length
  const out: P[] = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-6) continue;
    let s = step - carry;
    while (s <= d) {
      const k = s / d;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      s += step;
    }
    carry = d - (s - step);
  }
  const last = dense[dense.length - 1], ol = out[out.length - 1];
  if (Math.hypot(last.x - ol.x, last.y - ol.y) > step * 0.25) out.push(last);
  return out;
}

// ── the snake ─────────────────────────────────────────────────────────────────

export interface SnakePaint {
  /** Cell size, css px. */
  cell: number;
  /** Distance the head has travelled, px — anchors texture and the serpentine sway to the ground. */
  travel: number;
  /** Seconds, for breathing and the tongue. */
  time: number;
  /** 0..1 amplitude of the serpentine sway (0 with reduced motion). */
  sway: number;
  /** 0..1 idle breathing (paused / waiting). */
  breathe: number;
  /** 0..1 tongue flick. */
  tongue: number;
  /** Paler, drier ink after death. */
  dead?: boolean;
}

const INK = 'rgba(27,25,22,';
const DEEP = 'rgba(10,9,8,';

/**
 * Paint the snake onto `layer` (a transparent canvas the size of the board, already cleared, with
 * a css-px transform). `spine` is the smoothed centre line in px, head first.
 */
export function paintSnake(layer: CanvasRenderingContext2D, spine: P[], o: SnakePaint, devW: number, devH: number): void {
  const n = spine.length;
  if (n < 2) return;
  const cell = o.cell;
  // arc length from the head
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(spine[i].x - spine[i - 1].x, spine[i].y - spine[i - 1].y);
  const L = s[n - 1];
  const T = Math.min(3.4 * cell, 0.5 * L); // taper length
  const breath = 1 + 0.035 * o.breathe * Math.sin(o.time * 1.3);

  // normals (smoothed) and swayed centre line
  const nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 2)], b = spine[Math.min(n - 1, i + 2)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // pointing from head toward tail, so the left normal is (dy, -dx)
    nx[i] = -dy; ny[i] = dx;
  }
  const cx = new Float64Array(n), cy = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const m = (o.travel - s[i]) / cell; // material / ground coordinate in cells
    const env = smooth(0, 1.6 * cell, s[i]) * 0.7 + 0.3;
    const tailEnv = smooth(0, 0.8 * cell, L - s[i]);
    const off = o.sway * 0.075 * cell * Math.sin(m * ((Math.PI * 2) / 3.4)) * env * (0.4 + 0.6 * tailEnv);
    cx[i] = spine[i].x + nx[i] * off;
    cy[i] = spine[i].y + ny[i] * off;
    let wi = 0.7 * cell * breath * (0.92 + 0.16 * noise1(m * 0.9, 3));
    // a slight neck behind the head, the body full, then the long taper to the tail
    wi *= 0.9 + 0.1 * smooth(0.5 * cell, 1.6 * cell, s[i]);
    const r = (L - s[i]) / T;
    if (r < 1) wi *= Math.pow(Math.max(0, r), 0.85);
    w[i] = wi;
  }

  const ctx = layer;
  const poly = (scale: number, add: number, from: number, to: number, jit: number) => {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const m = (o.travel - s[i]) / cell;
      const hw = (w[i] * scale) / 2 + add + jit * cell * (noise1(m * 3.1, 11) - 0.5);
      const x = cx[i] + nx[i] * hw, y = cy[i] + ny[i] * hw;
      i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let i = to; i >= from; i--) {
      const m = (o.travel - s[i]) / cell;
      const hw = (w[i] * scale) / 2 + add + jit * cell * (noise1(m * 2.7, 23) - 0.5);
      ctx.lineTo(cx[i] - nx[i] * hw, cy[i] - ny[i] * hw);
    }
    ctx.closePath();
    ctx.fill();
  };

  const tone = o.dead ? 0.8 : 1;
  ctx.save();
  // 1 · bleed halo
  ctx.fillStyle = INK + (0.1 * tone).toFixed(3) + ')';
  poly(1.08, 0.9, 0, n - 1, 0.08);
  // 2 · body: a crisp-edged base, then ink built up by overlapping dabs whose density follows the
  //     brush — loaded and near-black behind the head, thinning toward the tail, with wet and dry patches
  ctx.fillStyle = INK + (0.5 * tone).toFixed(3) + ')';
  poly(1, 0, 0, n - 1, 0.05);
  const dabStep = Math.max(1, Math.round((cell * 0.14) / Math.max(0.5, s[1] || 1)));
  for (let i = 0; i < n; i += dabStep) {
    const m = (o.travel - s[i]) / cell;
    const run = smooth(Math.max(0.15 * L, 2.5 * cell), Math.max(L, 8 * cell), s[i]); // ink running out
    const a = (0.2 - 0.12 * run) * (0.75 + 0.5 * noise1(m * 0.55, 7)) * tone;
    const r = (w[i] / 2) * (0.86 - 0.2 * run);
    if (r < 0.4 || a <= 0.005) continue;
    ctx.fillStyle = DEEP + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx[i], cy[i], r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3 · 飞白: toward the tail the bristles part and the paper shows through in long hairlines
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  const tailStart = L - T * 1.05;
  const bristles = 15;
  for (let k = 0; k < bristles; k++) {
    const q = -0.9 + (1.8 * k) / (bristles - 1) + (hash(k * 31) - 0.5) * 0.06;
    ctx.lineWidth = Math.max(0.45, cell * (0.012 + 0.026 * hash(k * 17 + 5)));
    let open = false;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const m = (o.travel - s[i]) / cell;
      const dry = smooth(tailStart, L, s[i]); // 0 in the body, 1 at the tip
      const thresh = dry > 0 ? 0.05 + 0.8 * dry * (0.6 + 0.4 * Math.abs(q)) : 0;
      const on = thresh > 0 && noise1(m * (1.1 + k * 0.09), 40 + k) < thresh;
      const hw = (w[i] / 2) * q;
      const x = cx[i] + nx[i] * hw, y = cy[i] + ny[i] * hw;
      if (on) {
        open ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        open = true;
      } else open = false;
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.stroke();
  }
  // a couple of faint bristle tracks along the body
  ctx.lineWidth = Math.max(0.45, cell * 0.014);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  for (const q of [-0.5, 0.58]) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const hw = (w[i] / 2) * q;
      const x = cx[i] + nx[i] * hw, y = cy[i] + ny[i] * hw;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // 4 · a few wisps continuing past the tip as the brush lifts
  {
    const a = spine[Math.max(0, n - 4)], b = spine[n - 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    ctx.strokeStyle = INK + (0.22 * tone).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.5, cell * 0.022);
    for (let k = 0; k < 2; k++) {
      const off = (k - 0.5) * cell * 0.07;
      const len = cell * (0.16 + 0.18 * hash(k * 7 + 3));
      ctx.beginPath();
      ctx.moveTo(b.x - uy * off - ux * cell * 0.2, b.y + ux * off - uy * cell * 0.2);
      ctx.quadraticCurveTo(b.x - uy * off * 1.4 + ux * len * 0.5, b.y + ux * off * 1.4 + uy * len * 0.5, b.x - uy * off * 2 + ux * len, b.y + ux * off * 2 + uy * len);
      ctx.stroke();
    }
  }

  // 5 · the paper's tooth pressed into the ink
  applyInkGrain(ctx, devW, devH, 0.9);

  // 6 · the head: a heavier blot of burnt ink (焦墨) with a tiny eye left blank
  const h = { x: cx[0], y: cy[0] };
  let bi = 1;
  while (bi < n - 1 && s[bi] < 0.4 * cell) bi++;
  let dx = h.x - cx[bi], dy = h.y - cy[bi];
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  paintHead(ctx, h, dx, dy, cell, o, tone);
  ctx.restore();
}

function paintHead(ctx: CanvasRenderingContext2D, tip: P, dx: number, dy: number, cell: number, o: SnakePaint, tone: number) {
  const hc = { x: tip.x - dx * cell * 0.1, y: tip.y - dy * cell * 0.1 };
  const rl = cell * 0.56, rw = cell * 0.4;
  ctx.save();
  ctx.translate(hc.x, hc.y);
  ctx.rotate(Math.atan2(dy, dx));
  // tongue first so the head sits on it
  if (o.tongue > 0.01 && !o.dead) {
    const len = cell * 0.42 * o.tongue;
    ctx.strokeStyle = PIGMENTS.rouge;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(0.8, cell * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rl * 0.8, 0);
    ctx.lineTo(rl * 0.8 + len, 0);
    ctx.moveTo(rl * 0.8 + len, 0);
    ctx.lineTo(rl * 0.8 + len + cell * 0.12 * o.tongue, -cell * 0.07 * o.tongue);
    ctx.moveTo(rl * 0.8 + len, 0);
    ctx.lineTo(rl * 0.8 + len + cell * 0.12 * o.tongue, cell * 0.07 * o.tongue);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // halo
  ctx.beginPath();
  blob(ctx, rl * 1.12, rw * 1.14, 5);
  ctx.fillStyle = INK + (0.14 * tone).toFixed(3) + ')';
  ctx.fill();
  // blot, slightly pointed at the snout
  ctx.beginPath();
  blob(ctx, rl, rw, 9);
  const g = ctx.createRadialGradient(rl * 0.15, -rw * 0.1, 0, 0, 0, rl * 1.05);
  g.addColorStop(0, DEEP + (0.97 * tone).toFixed(3) + ')');
  g.addColorStop(0.7, DEEP + (0.93 * tone).toFixed(3) + ')');
  g.addColorStop(1, INK + (0.8 * tone).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fill();
  // the eye: a speck of bare paper with a dot of ink — on the side facing up the page
  const side = Math.abs(dx) > 0.5 ? (dx > 0 ? -1 : 1) : dy > 0 ? 1 : -1;
  const ex = rl * 0.3, ey = side * rw * 0.42;
  ctx.fillStyle = 'rgba(241,233,216,0.96)';
  ctx.beginPath();
  ctx.ellipse(ex, ey, cell * 0.095, cell * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (o.dead) {
    // ✕ eyes? No — a closed eye: a short arc.
    ctx.strokeStyle = DEEP + '0.95)';
    ctx.lineWidth = Math.max(0.8, cell * 0.035);
    ctx.beginPath();
    ctx.moveTo(ex - cell * 0.07, ey);
    ctx.lineTo(ex + cell * 0.07, ey);
    ctx.stroke();
  } else {
    ctx.fillStyle = DEEP + '1)';
    ctx.beginPath();
    ctx.arc(ex + cell * 0.022, ey + side * cell * 0.008, cell * 0.048, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** An egg-ish blob along +x (snout at +rl), rough edged. */
function blob(ctx: CanvasRenderingContext2D, rl: number, rw: number, seed: number) {
  const m = 28;
  for (let i = 0; i <= m; i++) {
    const t = (i / m) * Math.PI * 2;
    const c = Math.cos(t), sn = Math.sin(t);
    // narrower toward the snout
    const pinch = c > 0 ? 1 - 0.22 * c * c : 1;
    const j = 1 + (noise1(i * 0.9, seed) - 0.5) * 0.08;
    const x = c * rl * j, y = sn * rw * pinch * j;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// ── sprites (brush engine, cached) ────────────────────────────────────────────

type Push = (kind: StrokeKind, pts: StrokePoint[], tone: number, extra?: Partial<Stroke>) => void;

function recorder(seed: number): { strokes: Stroke[]; push: Push; rng: Rng } {
  const rng = makeRng(seed);
  const strokes: Stroke[] = [];
  const push: Push = (kind, pts, tone, extra = {}) => strokes.push({ kind, pts, tone, birth: 0, seed: (rng() * 1e9) | 0, ...extra });
  return { strokes, push, rng };
}

function ring(c: P, rx: number, ry: number, m: number, rot = 0, jit = 0, rng?: Rng, soft = 0.5): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < m; i++) {
    const t = (i / m) * Math.PI * 2;
    const j = 1 + (rng ? rng.range(-jit, jit) : 0);
    const x = Math.cos(t) * rx * j, y = Math.sin(t) * ry * j;
    pts.push({ x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot), w: i === 0 ? soft : 0 });
  }
  return pts;
}

/** Five-petal rouge plum blossom (红梅), face on, with ink stamens. Drawing space: r = blossom radius. */
function blossomStrokes(c: P, r: number, seed: number): Stroke[] {
  const { strokes, push, rng } = recorder(seed);
  const th0 = rng.range(0, Math.PI * 2);
  push('fill', ring(c, r * 0.95, r * 0.95, 12, 0, 0.05, rng, 0.6), 0.55, { color: PIGMENTS.white });
  const base = rng.range(0.55, 0.7);
  for (let k = 0; k < 5; k++) {
    const th = th0 + (k * Math.PI * 2) / 5 + rng.range(-0.1, 0.1);
    const pc = { x: c.x + Math.cos(th) * r * 0.5, y: c.y + Math.sin(th) * r * 0.5 };
    push('fill', ring(pc, r * 0.5, r * 0.46, 11, th, 0.06, rng), base * rng.range(0.85, 1.15), { color: PIGMENTS.rouge });
  }
  push('dot', [{ x: c.x, y: c.y, w: r * 0.36 }], 0.5, { color: PIGMENTS.rouge });
  const n = rng.int(5, 7);
  for (let k = 0; k < n; k++) {
    const a = th0 + ((k + 0.5) / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const len = r * rng.range(0.35, 0.55);
    const tip = { x: c.x + Math.cos(a) * len, y: c.y + Math.sin(a) * len };
    push('line', [{ x: c.x, y: c.y, w: 0.45 }, { x: tip.x, y: tip.y, w: 0.35 }], 0.55);
    push('dot', [{ ...tip, w: r * rng.range(0.13, 0.18) }], 0.9);
  }
  return strokes;
}

/** A sprig of osmanthus (桂花): a cluster of tiny four-petal golden florets and one dark leaf. */
function osmanthusStrokes(c: P, r: number, seed: number): Stroke[] {
  const { strokes, push, rng } = recorder(seed);
  // leaf
  const la = rng.range(2.2, 2.8);
  const lx = Math.cos(la), ly = Math.sin(la);
  const leaf: StrokePoint[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    leaf.push({ x: c.x + lx * r * (0.1 + 1.0 * t), y: c.y + ly * r * (0.1 + 1.0 * t) - Math.sin(t * Math.PI) * r * 0.08, w: r * 0.42 * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.4 });
  }
  push('brush', leaf, 0.62, { color: '#2f3a30' });
  const florets = 5;
  for (let k = 0; k < florets; k++) {
    const a = rng.range(-1.2, 1.4), d = r * rng.range(0.05, 0.62);
    const fc = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d - r * 0.1 };
    const fr = r * rng.range(0.24, 0.3);
    const rot = rng.range(0, Math.PI);
    for (let p = 0; p < 4; p++) {
      const th = rot + (p * Math.PI) / 2;
      const pc = { x: fc.x + Math.cos(th) * fr * 0.5, y: fc.y + Math.sin(th) * fr * 0.5 };
      push('fill', ring(pc, fr * 0.52, fr * 0.4, 9, th, 0.05, rng), rng.range(0.7, 0.9), { color: PIGMENTS.gamboge });
    }
    push('dot', [{ ...fc, w: fr * 0.35 }], 0.7, { color: PIGMENTS.ochre });
  }
  return strokes;
}

/** 月饼 mooncake: a scalloped golden-brown cake with a pressed flower and ring. */
function mooncakeStrokes(c: P, r: number, seed: number): Stroke[] {
  const { strokes, push, rng } = recorder(seed);
  const scal: StrokePoint[] = [];
  const m = 48;
  for (let i = 0; i < m; i++) {
    const t = (i / m) * Math.PI * 2;
    const rr = r * (0.92 + 0.08 * Math.abs(Math.cos(t * 6)));
    scal.push({ x: c.x + Math.cos(t) * rr, y: c.y + Math.sin(t) * rr, w: i === 0 ? 0.6 : 0 });
  }
  push('fill', scal, 0.85, { color: '#c28a3e' });
  push('fill', ring({ x: c.x - r * 0.08, y: c.y - r * 0.1 }, r * 0.62, r * 0.6, 16, 0, 0.02, rng), 0.35, { color: PIGMENTS.gamboge });
  // pressed pattern: an inner ring and a four-petal flower
  const circ: StrokePoint[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2 + 0.3;
    circ.push({ x: c.x + Math.cos(t) * r * 0.66, y: c.y + Math.sin(t) * r * 0.66, w: 0.55 });
  }
  push('line', circ, 0.42, { color: '#6b4420' });
  for (let p = 0; p < 4; p++) {
    const th = (p * Math.PI) / 2 + Math.PI / 4;
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = -Math.PI / 2 + (i / 10) * Math.PI;
      const lx = r * 0.22 + Math.cos(t) * r * 0.2, ly = Math.sin(t) * r * 0.14;
      pts.push({ x: c.x + lx * Math.cos(th) - ly * Math.sin(th), y: c.y + lx * Math.sin(th) + ly * Math.cos(th), w: 0.5 });
    }
    push('line', pts, 0.4, { color: '#6b4420' });
  }
  push('dot', [{ x: c.x, y: c.y, w: r * 0.14 }], 0.5, { color: '#6b4420' });
  return strokes;
}

/** 粽子 zongzi: a green leaf-wrapped triangle tied with a thread. */
function zongziStrokes(c: P, r: number, seed: number): Stroke[] {
  const { strokes, push, rng } = recorder(seed);
  const A = { x: c.x, y: c.y - r * 0.95 }, B = { x: c.x - r * 0.9, y: c.y + r * 0.7 }, C = { x: c.x + r * 0.9, y: c.y + r * 0.7 };
  push('fill', [{ ...A, w: 0.6 }, { ...B, w: 0 }, { ...C, w: 0 }], 0.85, { color: PIGMENTS.malachite });
  push('fill', [{ ...A, w: 0.4 }, { x: c.x - r * 0.1, y: c.y + r * 0.72, w: 0 }, { ...C, w: 0 }], 0.4, { color: '#3f6a4e' });
  for (let k = 0; k < 3; k++) {
    const t = 0.3 + k * 0.2;
    push('line', [{ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, w: 0.5 }, { x: A.x + (C.x - A.x) * t, y: A.y + (C.y - A.y) * t, w: 0.5 }], 0.35, { color: '#2f4a38' });
  }
  push('brush', [{ x: c.x - r * 0.62, y: c.y + r * 0.12, w: r * 0.1 }, { x: c.x, y: c.y + r * 0.05, w: r * 0.13 }, { x: c.x + r * 0.62, y: c.y + r * 0.12, w: r * 0.08 }], 0.7, { color: PIGMENTS.cinnabar });
  void rng;
  return strokes;
}

/** 菊 chrysanthemum head for 重阳: many thin gamboge petals. */
function chrysanthemumStrokes(c: P, r: number, seed: number): Stroke[] {
  const { strokes, push, rng } = recorder(seed);
  const n = 22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const len = r * rng.range(0.75, 1);
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const bend = Math.sin(t * Math.PI) * r * 0.06;
      pts.push({ x: c.x + Math.cos(a) * len * t - Math.sin(a) * bend, y: c.y + Math.sin(a) * len * t + Math.cos(a) * bend, w: r * 0.16 * Math.sin(Math.min(1, 0.2 + t) * Math.PI * 0.9) + 0.3 });
    }
    push('brush', pts, rng.range(0.55, 0.8), { color: PIGMENTS.gamboge });
  }
  push('dot', [{ x: c.x, y: c.y, w: r * 0.45 }], 0.75, { color: PIGMENTS.ochre });
  return strokes;
}

/** 汤圆 tangyuan: three glossy white rice balls, for the Lantern / Spring festival. */
function tangyuanStrokes(c: P, r: number, seed: number): Stroke[] {
  const { strokes, push, rng } = recorder(seed);
  push('wash', ring({ x: c.x, y: c.y + r * 0.2 }, r * 1.0, r * 0.55, 14, 0, 0.04, rng, 1.2), 0.25, { color: PIGMENTS.indigo });
  const balls = [{ x: -0.42, y: 0.18 }, { x: 0.42, y: 0.2 }, { x: 0, y: -0.25 }];
  for (const b of balls) {
    const bc = { x: c.x + b.x * r, y: c.y + b.y * r };
    push('fill', ring(bc, r * 0.4, r * 0.37, 14, 0, 0.03, rng), 0.95, { color: PIGMENTS.white });
    const arc: StrokePoint[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = Math.PI * 0.15 + (i / 10) * Math.PI * 0.8;
      arc.push({ x: bc.x + Math.cos(t) * r * 0.39, y: bc.y + Math.sin(t) * r * 0.36, w: 0.55 });
    }
    push('line', arc, 0.35);
  }
  push('dot', [{ x: c.x + r * 0.05, y: c.y - r * 0.3, w: r * 0.12 }], 0.5, { color: PIGMENTS.rouge });
  return strokes;
}

export type SpriteKind = 'blossom' | BonusKind;

const spriteCache = new Map<string, HTMLCanvasElement>();

/**
 * A cached, transparent sprite `size` css px square (at `dpr`), content centred.
 * Variants give each blossom a slightly different face.
 */
export function sprite(kind: SpriteKind, size: number, dpr: number, variant = 0): HTMLCanvasElement {
  const key = `${kind}|${Math.round(size * 4)}|${dpr}|${variant}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const px = Math.max(1, Math.ceil(size * dpr));
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mid = { x: size / 2, y: size / 2 };
  const r = size * 0.36;
  const seed = 1000 + variant * 97;
  const strokes =
    kind === 'blossom' ? blossomStrokes(mid, r, seed)
    : kind === 'osmanthus' ? osmanthusStrokes(mid, r * 1.05, seed)
    : kind === 'mooncake' ? mooncakeStrokes(mid, r * 1.05, seed)
    : kind === 'zongzi' ? zongziStrokes(mid, r, seed)
    : kind === 'chrysanthemum' ? chrysanthemumStrokes(mid, r * 1.05, seed)
    : tangyuanStrokes(mid, r, seed);
  for (const st of strokes) paintStroke(ctx, st);
  if (spriteCache.size > 40) spriteCache.delete(spriteCache.keys().next().value!);
  spriteCache.set(key, c);
  return c;
}

// ── board ─────────────────────────────────────────────────────────────────────

export interface BoardLook {
  wrap: boolean;
  /** Paint a full moon behind the board (中秋). */
  moon?: boolean;
}

/** The static board: paper, faint grid points, and a painted frame (walls) or open corners (wrap). */
export function paintBoard(ctx: CanvasRenderingContext2D, W: number, H: number, cols: number, rows: number, look: BoardLook): void {
  fillPaper(ctx, W, H, 23);
  const cw = W / cols, ch = H / rows;
  if (look.moon) paintMoon(ctx, W, H);
  // faint grid points, like a practice sheet
  ctx.fillStyle = 'rgba(60,50,40,0.13)';
  for (let y = 1; y < rows; y++) {
    for (let x = 1; x < cols; x++) {
      ctx.beginPath();
      ctx.arc(x * cw, y * ch, Math.max(0.6, cw * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const rng = makeRng(look.wrap ? 77 : 78);
  const inset = 2.5;
  const edge = (a: P, b: P, tone: number, kind: StrokeKind, width: number) => {
    const pts: StrokePoint[] = [];
    const m = 10;
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      const wob = Math.sin(t * Math.PI) * rng.range(-1, 1) * 1.2;
      const nx = -(b.y - a.y), ny = b.x - a.x, d = Math.hypot(nx, ny) || 1;
      const taper = 0.55 + 0.45 * Math.sin(Math.min(1, 0.08 + t * 0.95) * Math.PI);
      pts.push({ x: a.x + (b.x - a.x) * t + (nx / d) * wob, y: a.y + (b.y - a.y) * t + (ny / d) * wob, w: width * taper });
    }
    paintStroke(ctx, { kind, pts, tone, birth: 0, seed: (rng() * 1e9) | 0, dryness: 0.5 });
  };
  if (!look.wrap) {
    // 有墙: four confident strokes, overshooting a little at the corners
    const o = 4;
    edge({ x: -o + inset, y: inset }, { x: W + o - inset, y: inset + 0.5 }, 0.8, 'dry', 4.2);
    edge({ x: W - inset, y: -o + inset }, { x: W - inset - 0.5, y: H + o - inset }, 0.78, 'dry', 4.2);
    edge({ x: W + o - inset, y: H - inset }, { x: -o + inset, y: H - inset - 0.5 }, 0.82, 'dry', 4.2);
    edge({ x: inset, y: H + o - inset }, { x: inset + 0.5, y: -o + inset }, 0.76, 'dry', 4.2);
  } else {
    // 穿墙: only the corners are marked — the edges are open
    const k = Math.min(W, H) * 0.09;
    const cs: [P, P, P][] = [
      [{ x: inset, y: k }, { x: inset, y: inset }, { x: k, y: inset }],
      [{ x: W - k, y: inset }, { x: W - inset, y: inset }, { x: W - inset, y: k }],
      [{ x: W - inset, y: H - k }, { x: W - inset, y: H - inset }, { x: W - k, y: H - inset }],
      [{ x: k, y: H - inset }, { x: inset, y: H - inset }, { x: inset, y: H - k }],
    ];
    for (const [a, b, c] of cs) {
      edge(a, b, 0.5, 'brush', 2.4);
      edge(b, c, 0.5, 'brush', 2.4);
    }
  }
}

/**
 * 中秋: the moon painted the old way — 烘云托月, "wash the clouds to hold up the moon". The moon
 * itself is bare paper (with the faintest warmth); a pale indigo wash around it makes it glow.
 */
function paintMoon(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const r = Math.min(W, H) * 0.16;
  const c = { x: W * 0.73, y: H * 0.25 };
  ctx.save();
  const halo = ctx.createRadialGradient(c.x, c.y, r * 0.98, c.x, c.y, r * 3.4);
  halo.addColorStop(0, 'rgba(61,90,115,0)');
  halo.addColorStop(0.03, 'rgba(61,90,115,0.16)');
  halo.addColorStop(0.3, 'rgba(61,90,115,0.08)');
  halo.addColorStop(1, 'rgba(61,90,115,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, 0, c.x, c.y, r);
  g.addColorStop(0, 'rgba(252,244,222,0.75)');
  g.addColorStop(1, 'rgba(244,226,180,0.45)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // a thin drift of cloud across the moon's lower edge
  const rng = makeRng(815);
  const band: StrokePoint[] = [];
  const y0 = c.y + r * 0.72;
  const x0 = c.x - r * 2.2, x1 = c.x + r * 1.6;
  for (let i = 0; i <= 8; i++) band.push({ x: x0 + ((x1 - x0) * i) / 8, y: y0 - Math.sin((i / 8) * Math.PI) * r * 0.16 + rng.range(-1.5, 1.5), w: i === 0 ? 4 : 0 });
  for (let i = 8; i >= 0; i--) band.push({ x: x0 + ((x1 - x0) * i) / 8 + r * 0.2, y: y0 + r * 0.14 + Math.sin((i / 8) * Math.PI) * r * 0.05 + rng.range(-1.5, 1.5), w: 0 });
  paintStroke(ctx, { kind: 'wash', pts: band, tone: 0.12, color: PIGMENTS.indigo, birth: 0, seed: 9 });
}

/**
 * 泼墨 — an ink splash, painted once into its own canvas (`size` css px square) for the game over.
 * It spreads mostly the way the snake was heading (`dx`, `dy`).
 */
export function inkSplash(size: number, dpr: number, seed: number, dx = 1, dy = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rng = makeRng(seed);
  const m = { x: size / 2, y: size / 2 };
  const R = size * 0.13;
  const fwd = Math.atan2(dy, dx);
  const st = (kind: StrokeKind, pts: StrokePoint[], tone: number, extra: Partial<Stroke> = {}) =>
    paintStroke(ctx, { kind, pts, tone, birth: 0, seed: (rng() * 1e9) | 0, ...extra });
  // the bleed, then the blot built from a few overlapping pools
  st('wash', ring({ x: m.x + Math.cos(fwd) * R * 0.3, y: m.y + Math.sin(fwd) * R * 0.3 }, R * 1.9, R * 1.6, 16, fwd, 0.2, rng, 5), 0.16);
  st('dot', [{ ...m, w: R * 1.9 }], 0.95);
  for (let k = 0; k < 4; k++) {
    const a = fwd + rng.range(-1.6, 1.6);
    const d = R * rng.range(0.55, 0.95);
    st('dot', [{ x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d, w: R * rng.range(0.7, 1.1) }], rng.range(0.82, 0.95));
  }
  // flung drops, teardrop-shaped, most of them thrown forward
  const n = rng.int(7, 11);
  for (let k = 0; k < n; k++) {
    const back = k >= n - 2;
    const a = (back ? fwd + Math.PI : fwd) + rng.range(-1.1, 1.1);
    const d = R * rng.range(1.35, back ? 1.9 : 2.9);
    const w = R * rng.range(0.14, 0.42) * (1.5 - d / (R * 3.2));
    const ux = Math.cos(a), uy = Math.sin(a);
    const p = { x: m.x + ux * d, y: m.y + uy * d };
    st('brush', [{ x: p.x - ux * w * 2.4, y: p.y - uy * w * 2.4, w: w * 0.25 }, { x: p.x - ux * w * 0.6, y: p.y - uy * w * 0.6, w: w * 0.8 }, { ...p, w: w * 0.9 }], 0.85);
    st('dot', [{ ...p, w: w * 1.25 }], 0.92);
  }
  return c;
}
