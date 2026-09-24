// Brush engine: turns Stroke display lists into ink on a canvas.
//
// Every stroke is rendered in *device pixels* (the caller's transform × `scale` is folded into
// the geometry), so edge roughness, bleed and paper grain have a consistent physical size
// whatever the context's transform. Strokes are built from a few layered polygons:
//
//   brush  halo (soft bleed) → body (noise-jittered edges, ends raggedly as ink runs out)
//          → a pool of denser ink where the brush is widest → bristle bundles that continue
//          past the body into a dry, streaky 收笔 → a heavier blot at the 起笔.
//   dry    a faint wet underlayer that dies early + many thin bristles breaking into 飞白.
//   wash   Tyler-Hobbs style layered, recursively deformed polygons with a mottled interior
//          and a slightly darker drying ring (水渍).
//   dot    an irregular blot with a bleed halo and a pooled core; tiny dots stay crisp (苔点).
//   fill   pigment polygon: soft under-layer, grainy body, uneven inner density, darker rim.
//   line   fine outline (勾勒) with gentle width modulation and occasional small breaks.
//
// All fills use a paper-grain pattern (see paper.ts) so ink sits in the fibres.
// Layer alphas are shares of the tone: alpha_i = 1 − (1 − tone)^p_i with Σp ≈ 1, so the
// composited centre of a stroke lands on its tone (0.12 faint wash … 0.95 near-black).
import type { Drawing, Stroke, StrokePoint } from './types';
import { PIGMENTS } from './types';
import { makeRng, makeNoise2, clamp, smoothstep } from '../core/rng';
import type { Rng } from '../core/rng';
import { grainPattern, inkGrainTile } from './paper';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PaintOptions {
  /** Drawing-space → canvas px multiplier (include devicePixelRatio here). Default 1. */
  scale?: number;
  /** 0..1 — paint only this fraction of the stroke (along its path, or fading in for polygons). */
  progress?: number;
  /** 0..1 — overall ink strength multiplier; <1 makes a neglected plant look pale and dry. Default 1. */
  vigor?: number;
}

const INK = PIGMENTS.ink;
/** Diluted ink spreads a touch cooler than the core. */
const INK_THIN = '#252a2f';
const NZ = makeNoise2(0x51ab);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(color: string, a: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(4)})`;
}

function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Alpha of one layer carrying `share` of a stroke's tone. */
const share = (tone: number, p: number) => 1 - Math.pow(1 - tone, p);

// ---------------------------------------------------------------------------
// Public geometry helpers (drawing space).

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

// ---------------------------------------------------------------------------
// Device transform.

interface Xf { a: number; b: number; c: number; d: number; e: number; f: number; k: number }

function deviceXf(ctx: Ctx2D, s: number): Xf {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const a = (m ? m.a : 1) * s, b = (m ? m.b : 0) * s, c = (m ? m.c : 0) * s, d = (m ? m.d : 1) * s;
  return { a, b, c, d, e: m ? m.e : 0, f: m ? m.f : 0, k: Math.sqrt(Math.abs(a * d - b * c)) || 1e-6 };
}

// ---------------------------------------------------------------------------
// Spines: smoothed, uniformly resampled centre lines in device px. Cached per stroke+transform,
// so an in-flight StrokeAnimation stroke costs only its polygons per frame.

interface Spine {
  n: number;
  x: Float64Array; y: Float64Array;
  /** half width, px */
  h: Float64Array;
  /** arc length from start, px */
  s: Float64Array;
  nx: Float64Array; ny: Float64Array;
  /** full length of the *whole* stroke (also on truncated copies) */
  L: number;
  hmax: number;
}

const spineCache = new WeakMap<Stroke, { key: string; sp: Spine }>();

function getSpine(st: Stroke, xf: Xf): Spine {
  const key = `${xf.a},${xf.b},${xf.c},${xf.d},${xf.e},${xf.f}`;
  const hit = spineCache.get(st);
  if (hit && hit.key === key) return hit.sp;
  const sp = buildSpine(st, xf);
  spineCache.set(st, { key, sp });
  return sp;
}

function buildSpine(st: Stroke, xf: Xf): Spine {
  // 1 · to device px, dropping duplicate points
  const P: { x: number; y: number; w: number }[] = [];
  for (const p of st.pts) {
    const x = xf.a * p.x + xf.c * p.y + xf.e, y = xf.b * p.x + xf.d * p.y + xf.f;
    const q = P[P.length - 1];
    if (q && Math.abs(q.x - x) < 0.01 && Math.abs(q.y - y) < 0.01) { q.w = Math.max(q.w, p.w * xf.k); continue; }
    P.push({ x, y, w: Math.max(0, p.w) * xf.k });
  }
  let hmax = 0;
  for (const p of P) hmax = Math.max(hmax, p.w / 2);
  if (P.length < 2) {
    const p = P[0] ?? { x: 0, y: 0, w: 0 };
    const one = (v: number) => Float64Array.of(v);
    return { n: 1, x: one(p.x), y: one(p.y), h: one(p.w / 2), s: one(0), nx: one(0), ny: one(1), L: 0, hmax };
  }
  // 2 · Catmull-Rom densify (width interpolated linearly: CR would overshoot below 0)
  const dx: number[] = [], dy: number[] = [], dw: number[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p1 = P[i], p2 = P[i + 1];
    const p0 = P[i - 1] ?? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = P[i + 2] ?? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const m = clamp(Math.ceil(seg / 2), 1, 64);
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      dx.push(0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3));
      dy.push(0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3));
      dw.push(p1.w + (p2.w - p1.w) * t);
    }
  }
  const last = P[P.length - 1];
  dx.push(last.x); dy.push(last.y); dw.push(last.w);
  const cum = new Float64Array(dx.length);
  for (let i = 1; i < dx.length; i++) cum[i] = cum[i - 1] + Math.hypot(dx[i] - dx[i - 1], dy[i] - dy[i - 1]);
  const L = cum[cum.length - 1];
  // 3 · uniform resample; spacing follows brush size (fine strokes need fewer samples per px of width)
  const spacing = st.kind === 'line' ? clamp(hmax * 1.2, 2, 4) : st.kind === 'dry' ? clamp(hmax * 0.3, 1.5, 4.5) : clamp(hmax * 0.5, 1.5, 6);
  const n = Math.max(2, Math.ceil(L / spacing) + 1);
  const x = new Float64Array(n), y = new Float64Array(n), h = new Float64Array(n), s = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const want = (L * i) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < want) j++;
    const seg = cum[j + 1] - cum[j];
    const t = seg > 0 ? clamp((want - cum[j]) / seg, 0, 1) : 0;
    x[i] = dx[j] + (dx[j + 1] - dx[j]) * t;
    y[i] = dy[j] + (dy[j + 1] - dy[j]) * t;
    h[i] = (dw[j] + (dw[j + 1] - dw[j]) * t) / 2;
    s[i] = want;
  }
  // 4 · normals from central differences
  const nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const tx = x[b] - x[a], ty = y[b] - y[a];
    const len = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / len;
    ny[i] = tx / len;
  }
  return { n, x, y, h, s, nx, ny, L, hmax };
}

/** A copy of the spine cut at `progress` of its arc length (keeps L of the full stroke). */
function truncate(sp: Spine, progress: number): Spine {
  if (progress >= 1 || sp.n < 2) return sp;
  const want = sp.L * progress;
  let i = 1;
  while (i < sp.n - 1 && sp.s[i] < want) i++;
  const t = clamp((want - sp.s[i - 1]) / (sp.s[i] - sp.s[i - 1] || 1), 0, 1);
  const n = i + 1;
  const cut = (arr: Float64Array, lerp = true) => {
    const out = arr.slice(0, n);
    out[i] = lerp ? arr[i - 1] + (arr[i] - arr[i - 1]) * t : arr[i];
    return out;
  };
  const h = cut(sp.h);
  h[i] *= 0.75; // the wet front of a brush in motion is slightly rounded
  return { n, x: cut(sp.x), y: cut(sp.y), h, s: cut(sp.s), nx: cut(sp.nx, false), ny: cut(sp.ny, false), L: sp.L, hmax: sp.hmax };
}

// ---------------------------------------------------------------------------
// Path tracing: a band between lateral offsets lo[i] (left, +normal) and ro[i] (right) over
// samples i0..i1, appended to the current path.

function traceBand(ctx: Ctx2D, sp: Spine, i0: number, i1: number, lo: Float64Array, ro: Float64Array) {
  const { x, y, nx, ny } = sp;
  ctx.moveTo(x[i0] + nx[i0] * lo[i0], y[i0] + ny[i0] * lo[i0]);
  for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(x[i] + nx[i] * lo[i], y[i] + ny[i] * lo[i]);
  for (let i = i1; i >= i0; i--) ctx.lineTo(x[i] + nx[i] * ro[i], y[i] + ny[i] * ro[i]);
  ctx.closePath();
}

/**
 * Trace the runs where `ink[i] > 0` (a bristle that skips across the paper). Band width is
 * already scaled by the caller; runs shorter than 2 samples are dropped.
 */
function traceRuns(ctx: Ctx2D, sp: Spine, ink: Float64Array, lo: Float64Array, ro: Float64Array): boolean {
  let any = false;
  let i = 0;
  const n = sp.n;
  while (i < n) {
    while (i < n && ink[i] <= 0) i++;
    const a = i;
    while (i < n && ink[i] > 0) i++;
    const b = i - 1;
    if (b > a) {
      // close the run on its neighbours so ends taper to a point rather than cut square
      const i0 = a > 0 ? a - 1 : a, i1 = b < n - 1 ? b + 1 : b;
      traceBand(ctx, sp, i0, i1, lo, ro);
      any = true;
    }
  }
  return any;
}

// ---------------------------------------------------------------------------
// Fill helpers

interface Paint {
  ctx: Ctx2D;
  /** caller's globalAlpha, preserved as a multiplier */
  A0: number;
  /** grain scale (pattern px per device px) */
  gs: number;
}

/** Debug switches for the perf lab (not part of the painting contract). */
export const brushFlags = { shadows: true, grain: true, unitGrain: false };

function setGrain(P: Paint, color: string, variant: 'fine' | 'wash' = 'fine', ox = 0, oy = 0, scaleMul = 1) {
  if (!brushFlags.grain) { P.ctx.fillStyle = color; return; }
  const pat = grainPattern(P.ctx, color, variant);
  if (typeof pat !== 'string' && typeof pat.setTransform === 'function' && !(brushFlags.unitGrain && variant === 'fine')) {
    const g = P.gs * scaleMul;
    pat.setTransform(new DOMMatrix([g, 0, 0, g, ox, oy]));
  }
  P.ctx.fillStyle = pat;
}

function fillWith(P: Paint, alpha: number) {
  if (alpha <= 0.002) return;
  P.ctx.globalAlpha = P.A0 * clamp(alpha, 0, 1);
  P.ctx.fill();
}

/**
 * Soft bleed via shadowBlur. The shape is filled with a *solid* colour while the shadow is on:
 * shadow + pattern fill is ~15× slower in Chromium, so grain is left to the other layers.
 */
function shadow(P: Paint, color: string, a: number, blur: number, fill = color) {
  if (blur < 0.35 || a <= 0 || !brushFlags.shadows) { noShadow(P); return; }
  P.ctx.fillStyle = fill;
  P.ctx.shadowColor = rgba(color, a);
  P.ctx.shadowBlur = blur;
}

function noShadow(P: Paint) {
  P.ctx.shadowColor = 'rgba(0,0,0,0)';
  P.ctx.shadowBlur = 0;
}

function seedOffsets(seed: number): [number, number] {
  return [((seed >>> 0) % 1000) * 3.731 + 17.1, (((seed >>> 0) / 1000) % 1000) * 2.917 + 5.3];
}

/** An irregular closed blob around (cx, cy), appended to the current path. */
function traceBlob(ctx: Ctx2D, cx: number, cy: number, r: number, rng: Rng, rough: number, ecc = 0, rot = 0) {
  const m = clamp(Math.round(r * 1.6), 9, 32);
  const ox = rng() * 100, oy = rng() * 100;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < m; i++) {
    const th = (i / m) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const rr = r * (1 + rough * (NZ(ox + c * 1.1, oy + s * 1.1) * 1.3 + NZ(ox + c * 3, oy + s * 3) * 0.5));
    const ex = c * rr * (1 + ecc), ey = s * rr * (1 - ecc * 0.6);
    const px = cx + ex * cr - ey * sr, py = cy + ex * sr + ey * cr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// brush · dry · line

function paintSpineStroke(P: Paint, st: Stroke, full: Spine, progress: number, tone: number, vigor: number) {
  const sp = truncate(full, progress);
  const { ctx } = P;
  const n = sp.n;
  if (n < 2) return;
  const kind = st.kind;
  const rng = makeRng(st.seed);
  const [ox, oy] = seedOffsets(st.seed);
  const hmax = Math.max(full.hmax, 0.3);
  const L = Math.max(full.L, 1);
  const color = st.color ?? INK;
  const thin = st.color ?? INK_THIN;
  const isDry = kind === 'dry', isLine = kind === 'line';
  const wet = clamp(st.wet ?? (isDry ? 0.15 : isLine ? 0.3 : 0.5), 0, 1) * (0.5 + 0.5 * vigor);
  const dry = clamp((st.dryness ?? (isDry ? 0.55 : isLine ? 0.12 : 0.2)) + (1 - vigor) * 0.6, 0, 1);

  // Edge offsets. ELs/ERs: smooth silhouette (slow pressure wobble + mid-frequency irregularity);
  // EL/ER add the fine fibrous roughness where ink wicks into the paper.
  const EL = new Float64Array(n), ER = new Float64Array(n), ELs = new Float64Array(n), ERs = new Float64Array(n), T = new Float64Array(n);
  const lam1 = Math.max(hmax * 3, 14), lamM = Math.max(hmax * 0.9, 5), lam2 = isLine ? 6 : 2.2;
  const A1 = isDry ? 0.12 : isLine ? 0.3 : 0.07;
  const AM = isDry ? 0.05 : isLine ? 0 : 0.045;
  const r2 = isDry ? 0.15 : isLine ? 0.1 : (0.3 + 0.04 * hmax) * (1.2 - wet * 0.6);
  for (let i = 0; i < n; i++) {
    const si = sp.s[i], h = sp.h[i];
    T[i] = si / L;
    const w1 = NZ(ox + si / lam1, oy), w2 = NZ(ox + si / lam1, oy + 7.7);
    const m1 = NZ(ox + si / lamM, oy + 21.5), m2 = NZ(ox + si / lamM, oy + 29.1);
    const f1 = NZ(ox + si / lam2, oy + 3.1), f2 = NZ(ox + si / lam2, oy + 13.3);
    const rr = Math.min(r2, h * 0.6);
    ELs[i] = Math.max(0, h * (1 + A1 * w1 + AM * m1));
    ERs[i] = Math.max(0, h * (1 + A1 * w2 + AM * m2));
    EL[i] = Math.max(0, ELs[i] + rr * f1);
    ER[i] = Math.max(0, ERs[i] + rr * f2);
    if (isLine) ER[i] = EL[i] = Math.max(0.3, (EL[i] + ER[i]) / 2);
  }
  const lo = new Float64Array(n), ro = new Float64Array(n), ink = new Float64Array(n);
  const mapU = (u: number, i: number, sm = false) => (u >= 0 ? u * (sm ? ELs[i] : EL[i]) : u * (sm ? ERs[i] : ER[i]));

  // --- line: one band with small breaks + a faint halo -------------------------------------
  if (isLine) {
    for (let i = 0; i < n; i++) {
      ink[i] = 0.75 + 0.7 * NZ(ox + 9.1, sp.s[i] / 28) - dry * 1.4 * T[i] ** 1.5;
    }
    ink[0] = Math.max(ink[0], 0.3); // the fine tip always touches down
    setGrain(P, thin);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const g = smoothstep(-0.2, 0.25, ink[i]); lo[i] = EL[i] * g + 0.45 * wet * g; ro[i] = -lo[i]; }
    traceRuns(ctx, sp, ink, lo, ro);
    fillWith(P, share(tone, 0.12));
    setGrain(P, color);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const g = smoothstep(0, 0.3, ink[i]); lo[i] = EL[i] * g; ro[i] = -lo[i]; }
    traceRuns(ctx, sp, ink, lo, ro);
    fillWith(P, share(tone, 0.9));
    if (progress > 0.02 && hmax > 0.4) {
      ctx.beginPath();
      const r = Math.max(sp.h[0], sp.h[Math.min(n - 1, 2)]) * 1.15 + 0.2;
      traceBlob(ctx, sp.x[0], sp.y[0], r, rng, 0.1);
      fillWith(P, share(tone, 0.25));
    }
    return;
  }

  // body ink: stays until the brush runs dry, then ends raggedly and never comes back
  const tEnd = isDry ? 0.12 + 0.55 * (1 - dry) : 1.02 - 0.6 * dry;
  const body = new Float64Array(n);
  let run = 1e9;
  for (let i = 0; i < n; i++) {
    const v = (tEnd - T[i]) * 7 + 0.55 * NZ(ox + 2.3, sp.s[i] / Math.max(hmax * 1.5, 6));
    run = Math.min(run, v);
    body[i] = run;
  }

  // --- halo: diluted ink bleeding into the paper (only where the body is) ----------------------
  if (!isDry && wet > 0.05) {
    const bleed = (0.45 + 0.09 * hmax) * wet;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const g = smoothstep(-0.15, 0.4, body[i]);
      lo[i] = (EL[i] + bleed) * g; ro[i] = -(ER[i] + bleed) * g;
      ink[i] = body[i] + 0.15;
    }
    traceRuns(ctx, sp, ink, lo, ro);
    setGrain(P, thin);
    shadow(P, thin, 0.6, bleed * 2.4 + 0.8);
    fillWith(P, share(tone, 0.12 + 0.1 * wet));
    noShadow(P);
  }

  setGrain(P, color);
  // --- body ---------------------------------------------------------------------------------
  if (isDry) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const g = smoothstep(0, 0.45, body[i]);
      lo[i] = EL[i] * g; ro[i] = -ER[i] * g;
      ink[i] = body[i];
    }
    traceRuns(ctx, sp, ink, lo, ro);
    fillWith(P, share(tone, 0.22));
  } else {
    // Lateral strips that sometimes part (a pale hair-line where bristles split) and sometimes
    // overlap (a darker line). Alternate strips share a fill (they never touch each other).
    const K = clamp(Math.round(hmax / 2.5), 2, 6);
    const U: number[] = [-1];
    for (let k = 1; k < K; k++) U.push(-1 + (2 * k) / K + (rng() - 0.5) * (0.6 / K));
    U.push(1);
    const gw = clamp(hmax * 0.1, 0.35, 2) * (0.6 + dry);
    const G: Float64Array[] = U.map(() => new Float64Array(n));
    for (let k = 1; k < K; k++) {
      const lam = Math.max(hmax * 1.2, 6) * rng.range(0.7, 1.5), bias = rng.range(-0.35, 0.15);
      for (let i = 0; i < n; i++) G[k][i] = gw * (NZ(ox + k * 3.7, oy + 40 + sp.s[i] / lam) + bias);
    }
    for (let parity = 0; parity < 2; parity++) {
      ctx.beginPath();
      for (let j = parity; j < K; j += 2) {
        for (let i = 0; i < n; i++) {
          const g = smoothstep(0, 0.45, body[i]);
          let top = mapU(U[j + 1], i) - (j < K - 1 ? G[j + 1][i] / 2 : 0);
          let bot = mapU(U[j], i) + (j > 0 ? G[j][i] / 2 : 0);
          if (top < bot) top = bot = (top + bot) / 2;
          lo[i] = top * g; ro[i] = bot * g;
          ink[i] = body[i];
        }
        traceRuns(ctx, sp, ink, lo, ro);
      }
      fillWith(P, share(tone, 0.48));
    }
    // 側鋒: the brush held at a slant leaves its tip-side edge darker than the heel side
    if (hmax > 1.5) {
      const side = rng() < 0.5 ? -1 : 1, depth = rng.range(0.35, 0.7);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const g = smoothstep(0, 0.45, body[i]);
        const inner = 1 - depth * (1 + 0.25 * NZ(ox + 8.8, sp.s[i] / lamM));
        const a = mapU(side, i) * g, b = mapU(side * inner, i, true) * g;
        lo[i] = Math.max(a, b); ro[i] = Math.min(a, b);
        ink[i] = body[i];
      }
      traceRuns(ctx, sp, ink, lo, ro);
      fillWith(P, share(tone, rng.range(0.06, 0.16)));
    }
  }

  // --- pooling: denser ink where the brush is pressed widest (brush only) -------------------
  if (!isDry && hmax > 1.2) {
    ctx.beginPath();
    const off = rng.range(-0.25, 0.25);
    for (let i = 0; i < n; i++) {
      const q = sp.h[i] / hmax;
      const g = smoothstep(0, 0.45, body[i]) * 0.6 * q * Math.sqrt(q);
      const c = off * sp.h[i] + 0.15 * sp.h[i] * NZ(ox + 5.5, sp.s[i] / lam1);
      lo[i] = c + ELs[i] * g; ro[i] = c - ERs[i] * g;
      ink[i] = body[i];
    }
    traceRuns(ctx, sp, ink, lo, ro);
    fillWith(P, share(tone, 0.12));
  }

  // --- bristles: streaks that outlast the body and break up as the brush runs dry (飞白) ---
  const nb = isDry ? clamp(Math.round(hmax / 1.25), 6, 30) : clamp(Math.round(hmax / 2), 3, 10);
  const lamF = Math.max(hmax * (isDry ? 2.4 : 2), 10);
  // bristles are grouped into a few fills (each group its own ink load) to keep the draw count low
  const groups = isDry ? 3 : 2;
  const gShare = Array.from({ length: groups }, () => (isDry ? rng.range(0.3, 0.7) : rng.range(0.05, 0.17)));
  for (let gi = 0; gi < groups; gi++) {
    ctx.beginPath();
    let any = false;
    for (let j = gi; j < nb; j += groups) {
      const rj = makeRng(st.seed + j * 977);
      const c0 = -1 + (2 * j + 1) / nb + (rj() - 0.5) * (0.5 / nb);
      const bw = (1 / nb) * (isDry ? rj.range(0.6, 1.3) : rj.range(0.35, 0.85));
      const inkLoad = 1 + 0.25 * rj.gauss() - (isDry ? 0.45 : 0.2) * c0 * c0;
      const oj = ox + j * 7.37;
      for (let i = 0; i < n; i++) {
        const si = sp.s[i];
        // shared field across neighbouring bristles → gaps open as long pale slivers
        const F = NZ(ox + c0 * 1.7, oy + 60 + si / lamF);
        const own = NZ(oj, si / (lamF * 0.4));
        const v = inkLoad - dry * (isDry ? 2.0 : 1.6) * Math.pow(T[i], isDry ? 1.15 : 1.6)
          + (isDry ? 0.65 : 0.35) * F + (isDry ? 0.25 : 0.15) * own;
        ink[i] = v;
        const g = smoothstep(0, 0.25, v);
        const c = c0 + 0.1 * NZ(oj + 1.7, si / lam1) / Math.sqrt(nb);
        const top = clamp(c + bw * g, -1, 1), bot = clamp(c - bw * g, -1, 1);
        lo[i] = mapU(top, i, true);
        ro[i] = mapU(bot, i, true);
      }
      any = traceRuns(ctx, sp, ink, lo, ro) || any;
    }
    if (any) fillWith(P, share(tone, gShare[gi]));
  }

  // --- 起笔: a heavier blot where the brush first pressed down -----------------------------
  // Centred about one radius into the stroke, sized by the width there: a blunt start gets a
  // rounded, inky head; a stroke that starts from a fine tip gets only a tiny dot.
  if (progress > 0.03) {
    let i = 0;
    while (i < n - 1 && sp.s[i] < sp.h[i] * 0.9) i++;
    const r = sp.h[i] * (isDry ? 0.9 : 1.02);
    if (r > 0.9) {
      const tx = sp.ny[i], ty = -sp.nx[i];
      ctx.beginPath();
      traceBlob(ctx, sp.x[i], sp.y[i], r, rng, isDry ? 0.12 : 0.06, 0.12, Math.atan2(ty, tx));
      fillWith(P, share(tone, isDry ? 0.14 : 0.18));
    }
  }
}

// ---------------------------------------------------------------------------
// Polygons: wash · fill

type Pt = { x: number; y: number };

/** Closed Catmull-Rom densification so coarse outlines become smooth before deformation. */
function smoothClosed(poly: Pt[], maxEdge: number): Pt[] {
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n], p3 = poly[(i + 2) % n];
    const m = clamp(Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / maxEdge), 1, 24);
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

/**
 * Recursive midpoint displacement (Tyler Hobbs' watercolour polygon). `vari` holds a per-vertex
 * variance so some parts of the edge stay tight while others bleed.
 */
function deform(poly: Pt[], vari: number[], depth: number, amp: number, rng: Rng): { poly: Pt[]; vari: number[] } {
  let P = poly, V = vari;
  for (let d = 0; d < depth; d++) {
    const nP: Pt[] = [], nV: number[] = [];
    const n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const va = V[i], vb = V[(i + 1) % n];
      nP.push(a); nV.push(va);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const v = (va + vb) / 2;
      const sd = Math.min(len * 0.35, amp) * v;
      nP.push({ x: (a.x + b.x) / 2 + rng.gauss() * sd * 0.5, y: (a.y + b.y) / 2 + rng.gauss() * sd * 0.5 });
      nV.push(v * rng.range(0.85, 1.15));
    }
    P = nP; V = nV;
    amp *= 0.6;
  }
  return { poly: P, vari: V };
}

function tracePoly(ctx: Ctx2D, poly: Pt[]) {
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

function devicePoly(st: Stroke, xf: Xf, progress: number): { poly: Pt[]; cx: number; cy: number; size: number } {
  const poly = st.pts.map((p) => ({ x: xf.a * p.x + xf.c * p.y + xf.e, y: xf.b * p.x + xf.d * p.y + xf.f }));
  let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of poly) {
    cx += p.x; cy += p.y;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  cx /= poly.length; cy /= poly.length;
  if (progress < 1) {
    // grow gently from the centre while fading in
    const g = 0.88 + 0.12 * progress;
    for (const p of poly) { p.x = cx + (p.x - cx) * g; p.y = cy + (p.y - cy) * g; }
  }
  return { poly, cx, cy, size: Math.max(1, Math.min(x1 - x0, y1 - y0)) };
}

function paintWash(P: Paint, st: Stroke, xf: Xf, progress: number, tone: number, vigor: number) {
  if (st.pts.length < 3) return;
  const { ctx } = P;
  const rng = makeRng(st.seed ^ 0x77);
  const wet = clamp(st.wet ?? 0.75, 0, 1) * (0.6 + 0.4 * vigor);
  const { poly, size } = devicePoly(st, xf, progress);
  const soft = Math.max(1, (st.pts[0].w || 4) * xf.k) * (0.6 + 0.8 * wet);
  const base0 = smoothClosed(poly, Math.max(soft * 1.5, size / 24, 3));
  const vari0 = base0.map(() => rng.range(0.4, 1.6));
  const { poly: base, vari } = deform(base0, vari0, 1, soft * 1.2, rng);
  const color = st.color ?? INK_THIN;
  const layers = size > 120 ? 12 : size > 40 ? 10 : 8;
  const a = share(tone, 0.82 / layers) * progress;
  const mox = rng() * 256, moy = rng() * 256;
  for (let l = 0; l < layers; l++) {
    const { poly: shape } = deform(base, vari, 2, soft * (0.45 + (0.9 * l) / layers), rng);
    ctx.beginPath();
    tracePoly(ctx, shape);
    // half the layers share the mottle offset (structure), half drift (softness)
    const drift = l % 2 ? rng() * 60 : 0;
    setGrain(P, color, 'wash', mox + drift, moy + drift * 0.7, 2.2);
    fillWith(P, a);
  }
  // 水渍: ink carried to the edge as the wash dries leaves a faintly darker, broken rim
  if (wet > 0.2) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(color, 1);
    for (let r = 0; r < 2; r++) {
      const { poly: rim } = deform(base, vari, 1, soft * 0.4, rng);
      ctx.beginPath();
      tracePoly(ctx, rim);
      ctx.setLineDash([rng.range(size * 0.2, size * 0.7), rng.range(size * 0.05, size * 0.3)]);
      ctx.lineDashOffset = rng() * size;
      ctx.lineWidth = Math.max(0.6, soft * 0.18) * (r ? 0.6 : 1);
      ctx.globalAlpha = P.A0 * share(tone, 0.07 * wet) * progress;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

function paintFill(P: Paint, st: Stroke, xf: Xf, progress: number, tone: number, vigor: number) {
  if (st.pts.length < 3) return;
  const { ctx } = P;
  const rng = makeRng(st.seed ^ 0x3c);
  const { poly, size } = devicePoly(st, xf, progress);
  const soft = Math.max(0, (st.pts[0].w ?? 2) * xf.k);
  const wet = clamp(st.wet ?? 0.35, 0, 1) * (0.5 + 0.5 * vigor);
  const color = st.color ?? INK;
  const base0 = smoothClosed(poly, Math.max(1.5, size / 10));
  const vari0 = base0.map(() => rng.range(0.5, 1.5));
  const wob = Math.min(0.6 + soft * 0.15, size * 0.06);
  const { poly: base, vari } = deform(base0, vari0, 1, wob, rng);
  const fade = progress;

  // soft under-layer (the pigment wicks a little into the paper)
  ctx.beginPath();
  tracePoly(ctx, base);
  setGrain(P, color);
  shadow(P, color, 0.45 * wet + 0.1, Math.min(soft * 0.8 + 0.6 * wet, size * 0.35));
  fillWith(P, share(tone, 0.3) * fade);
  noShadow(P);
  // body
  ctx.beginPath();
  tracePoly(ctx, deform(base, vari, 1, wob * 0.5, rng).poly);
  fillWith(P, share(tone, 0.5) * fade);
  // uneven density: a denser patch pulled toward one side
  let cx = 0, cy = 0;
  for (const p of base) { cx += p.x; cy += p.y; }
  cx /= base.length; cy /= base.length;
  const ang = rng() * Math.PI * 2, off = size * rng.range(0.08, 0.2);
  const px = cx + Math.cos(ang) * off, py = cy + Math.sin(ang) * off;
  const k = rng.range(0.45, 0.7);
  ctx.beginPath();
  tracePoly(ctx, base.map((p) => ({ x: px + (p.x - px) * k, y: py + (p.y - py) * k })));
  fillWith(P, share(tone, 0.22) * fade);
  // rim — pigment pooled at the drying edge
  ctx.beginPath();
  tracePoly(ctx, base);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = mixHex(color, INK, st.color ? 0.28 : 0);
  ctx.lineWidth = clamp(size * 0.05, 0.5, 1.6);
  ctx.globalAlpha = P.A0 * share(tone, 0.22) * fade;
  ctx.stroke();
}

function paintDot(P: Paint, st: Stroke, xf: Xf, progress: number, tone: number, vigor: number) {
  const p = st.pts[0];
  if (!p) return;
  const { ctx } = P;
  const rng = makeRng(st.seed ^ 0x5d);
  const cx = xf.a * p.x + xf.c * p.y + xf.e, cy = xf.b * p.x + xf.d * p.y + xf.f;
  const r = (Math.max(0, p.w) / 2) * xf.k * (0.55 + 0.45 * progress);
  if (r < 0.25) return;
  const wet = clamp(st.wet ?? 0.5, 0, 1) * (0.5 + 0.5 * vigor);
  const color = st.color ?? INK;
  const ecc = rng.range(0.02, 0.24), rot = rng() * Math.PI * 2;
  const fade = 0.3 + 0.7 * progress;
  setGrain(P, color);
  if (r < 2.4) {
    // 苔点: small dots stay crisp and dark
    ctx.beginPath();
    traceBlob(ctx, cx, cy, r, rng, 0.12, ecc, rot);
    fillWith(P, Math.min(1, share(tone, 1) * 1.08) * fade);
    return;
  }
  ctx.beginPath();
  traceBlob(ctx, cx, cy, r, rng, 0.16, ecc, rot);
  shadow(P, st.color ?? INK_THIN, 0.5, (r * 0.3 + 0.6) * wet, color);
  fillWith(P, share(tone, 0.72) * fade);
  noShadow(P);
  // pooled core, off-centre
  const oa = rng() * Math.PI * 2, od = r * rng.range(0.05, 0.25);
  ctx.beginPath();
  traceBlob(ctx, cx + Math.cos(oa) * od, cy + Math.sin(oa) * od, r * rng.range(0.5, 0.7), rng, 0.2, ecc, rot);
  fillWith(P, share(tone, 0.3) * fade);
}

// ---------------------------------------------------------------------------
// Public painting API

export function paintStroke(ctx: Ctx2D, stroke: Stroke, o: PaintOptions = {}): void {
  const progress = clamp(o.progress ?? 1, 0, 1);
  if (progress <= 0 || !stroke.pts.length) return;
  const vigor = clamp(o.vigor ?? 1, 0, 1);
  const xf = deviceXf(ctx, o.scale ?? 1);
  // vigor < 1: paler ink
  const tone = clamp(stroke.tone, 0, 1) * (0.42 + 0.58 * vigor);
  if (tone <= 0.003) return;
  ctx.save();
  const P: Paint = { ctx, A0: ctx.globalAlpha, gs: clamp(xf.k * 0.75, 1, 2.5) };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    switch (stroke.kind) {
      case 'wash': paintWash(P, stroke, xf, progress, tone, vigor); break;
      case 'fill': paintFill(P, stroke, xf, progress, tone, vigor); break;
      case 'dot': paintDot(P, stroke, xf, progress, tone, vigor); break;
      default: {
        const sp = getSpine(stroke, xf);
        if (sp.n < 2) {
          // a degenerate stroke is just a touch of the brush
          const dot: Stroke = { ...stroke, kind: 'dot', pts: [{ x: stroke.pts[0].x, y: stroke.pts[0].y, w: stroke.pts[0].w }] };
          paintDot(P, dot, xf, progress, tone, vigor);
        } else paintSpineStroke(P, stroke, sp, progress, tone, vigor);
      }
    }
  } finally {
    ctx.restore();
  }
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

/**
 * Press the paper's tooth into finished ink: removes a sparse speckle of pixels and pale fibres,
 * so even dense 焦墨 shows the sheet. Use on transparent ink layers only (it cuts alpha).
 */
export function applyInkGrain(ctx: Ctx2D, w: number, h: number, strength = 1): void {
  const tile = inkGrainTile('punch');
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = clamp(0.55 * strength, 0, 1);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Rasterise a drawing at a growth level into a fresh transparent canvas. */
export function rasterize(d: Drawing, growth: number, scale: number, vigor = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(d.width * scale);
  c.height = Math.ceil(d.height * scale);
  const ctx = c.getContext('2d')!;
  paintDrawing(ctx, d, growth, { scale, vigor });
  applyInkGrain(ctx, c.width, c.height);
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
    if (!this.done && overlay) {
      // ease-out: the brush lands decisively and slows as it lifts
      const x = this.t / per;
      paintStroke(overlay, this.strokes[this.i], { ...this.o, progress: 1 - (1 - x) * (1 - x) });
    }
  }

  finish(): void {
    while (!this.done) this.step(1e9);
  }
}
