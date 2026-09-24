// 荷 Lotus — after 八大山人's economy and 张大千's splashed ink: one to three huge leaves laid
// in as layered wet washes (ink, a breath of malachite or indigo for some seeds) with veins
// radiating from the navel and burnt-ink rims in places, one leaf tipped into an umbrella or
// seen nearly edge-on; long slender two-tone stems with thorn dots (刺点) rising from the mud
// line; a rolled young leaf and a floating leaf as the first sprout; a closed bud on its own
// stem and, last, an open flower of broad pale-rouge petals (darker tips, fine outlines)
// around a green-gold seedpod (莲蓬) ringed with stamens.
//
// The flower is modelled in 3-D (cupped petals on a tilted receptacle) and projected; petal
// outlines are hidden wherever a nearer petal covers them, as a painter would leave them out.
import type { Drawing, PlantSpec, Stroke, StrokeKind, StrokePoint } from '../types';
import { PIGMENTS } from '../types';
import { makeRng, makeNoise2, clamp, lerp } from '../../core/rng';
import { growthFor } from '../../core/habits';
import type { Rng, Noise2 } from '../../core/rng';

interface V { x: number; y: number }
type V3 = [number, number, number];

const TAU = Math.PI * 2;
const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------------------------
// Geometry helpers

function catmull(ctrl: V[], perSeg: number): V[] {
  const out: V[] = [];
  const P = (i: number) => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function arcLengths(p: V[]): number[] {
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  return L;
}

function along(p: V[], L: number[], t: number): { p: V; d: V } {
  const want = clamp(t, 0, 1) * L[L.length - 1];
  let i = 1;
  while (i < p.length - 1 && L[i] < want) i++;
  const a = p[i - 1], b = p[i];
  const seg = L[i] - L[i - 1] || 1;
  const k = clamp((want - L[i - 1]) / seg, 0, 1);
  const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
  return { p: { x: a.x + dx * k, y: a.y + dy * k }, d: { x: dx / dl, y: dy / dl } };
}

function subPath(p: V[], L: number[], t0: number, t1: number, n: number): V[] {
  const out: V[] = [];
  for (let i = 0; i < n; i++) out.push(along(p, L, lerp(t0, t1, i / (n - 1))).p);
  return out;
}

const rot = (v: V, a: number): V => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

function pointInPoly(x: number, y: number, poly: V[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function convexHull(pts: V[]): V[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: V, a: V, b: V) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: V[] = [], hi: V[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

// ---------------------------------------------------------------------------------------------

interface Ctx {
  rng: Rng; noise: Noise2; u: number; strokes: Stroke[];
  /** Stroke groups ("units": a stem stroke, a thorn, a leaf, a flower stage) for re-timing. */
  units: number[]; unit: number;
}

/** Start a new stroke group. */
const group = (c: Ctx) => { c.unit++; };

function add(c: Ctx, kind: StrokeKind, pts: StrokePoint[], tone: number, birth: number, extra: Partial<Stroke> = {}) {
  c.strokes.push({ kind, pts, tone: clamp(tone, 0.04, 1), birth: clamp(birth, 0, 1), seed: c.rng.int(1, 0x7ffffffe), ...extra });
  c.units.push(c.unit);
}

const poly = (vs: V[], soft: number): StrokePoint[] => vs.map((v, i) => ({ x: v.x, y: v.y, w: i === 0 ? soft : 0 }));

function brushPts(path: V[], w0: number, w1: number, press = 1.15, endTaper = 0.25): StrokePoint[] {
  const n = path.length;
  return path.map((v, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    let w = lerp(w0, w1, t);
    if (t < 0.1) w *= lerp(0.6, press, t / 0.1);
    else if (t < 0.22) w *= lerp(press, 1, (t - 0.1) / 0.12);
    if (t > 0.82) w *= lerp(1, endTaper, (t - 0.82) / 0.18);
    return { x: v.x, y: v.y, w };
  });
}

// ---------------------------------------------------------------------------------------------
// Stems 荷梗: slender, two-tone, with thorn dots.

interface StemPlan { path: V[]; L: number[]; w: number; birth0: number; birth1: number }

function makeStem(base: V, top: V, bend: number, rng: Rng): { path: V[]; L: number[] } {
  const dx = top.x - base.x, dy = top.y - base.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const s2 = rng.range(-0.4, 0.4);
  const ctrl: V[] = [
    base,
    { x: lerp(base.x, top.x, 0.3) + nx * bend * len * 0.8, y: lerp(base.y, top.y, 0.3) + ny * bend * len * 0.8 },
    { x: lerp(base.x, top.x, 0.66) + nx * bend * len * (0.9 + s2), y: lerp(base.y, top.y, 0.66) + ny * bend * len * (0.9 + s2) },
    top,
  ];
  const path = catmull(ctrl, 12);
  return { path, L: arcLengths(path) };
}

function paintStem(c: Ctx, st: StemPlan, tone: number, thorns = true) {
  const { rng, u } = c;
  // 2–3 long strokes with a hair of a gap where the painter re-loaded the brush.
  const nseg = st.L[st.L.length - 1] > 140 * u ? rng.int(2, 3) : 1;
  const cuts = [0];
  for (let i = 1; i < nseg; i++) cuts.push(lerp(0, 1, i / nseg) + rng.range(-0.08, 0.08));
  cuts.push(1);
  for (let k = 0; k < nseg; k++) {
    const t0 = cuts[k] + (k ? 0.012 : 0), t1 = cuts[k + 1];
    const seg = subPath(st.path, st.L, t0, t1, 10);
    const b = lerp(st.birth0, st.birth1, t0);
    group(c);
    add(c, 'brush', brushPts(seg, st.w * lerp(1.1, 0.85, t0), st.w * lerp(1.1, 0.85, t1), 1.2, 0.75), tone + rng.range(-0.04, 0.04), b, { wet: 0.45, dryness: 0.12 });
    // the darker side of the stem: a thin line hugging one edge, part of the way
    if (rng.chance(0.75)) {
      const a0 = rng.range(0.05, 0.3), a1 = rng.range(0.6, 0.95);
      const side = rng.chance(0.5) ? 1 : -1;
      const pts = subPath(st.path, st.L, lerp(t0, t1, a0), lerp(t0, t1, a1), 8).map((p, i, arr) => {
        const q = arr[Math.min(arr.length - 1, i + 1)], r = arr[Math.max(0, i - 1)];
        const dx = q.x - r.x, dy = q.y - r.y, dl = Math.hypot(dx, dy) || 1;
        return { x: p.x - (dy / dl) * st.w * 0.3 * side, y: p.y + (dx / dl) * st.w * 0.3 * side, w: 0.9 * u };
      });
      add(c, 'line', pts, clamp(tone + 0.32, 0, 0.9), b + 0.001, { wet: 0.3 });
    }
  }
  if (!thorns) return;
  // 刺点: tiny thorn ticks, alternating sides, not evenly spaced.
  const total = st.L[st.L.length - 1];
  let s = rng.range(10, 18) * u;
  let side = 1;
  while (s < total - 12 * u) {
    const t = s / total;
    const q = along(st.path, st.L, t);
    const nx = -q.d.y * side, ny = q.d.x * side;
    const e0 = { x: q.p.x + nx * st.w * 0.45, y: q.p.y + ny * st.w * 0.45 };
    const len = rng.range(1.4, 2.4) * u;
    // spikes point up along the stem and out
    const dir = { x: nx * 0.7 + q.d.x * 0.7, y: ny * 0.7 + q.d.y * 0.7 };
    group(c);
    add(c, 'brush', [{ ...e0, w: 1.5 * u }, { x: e0.x + dir.x * len, y: e0.y + dir.y * len, w: 0.3 * u }], rng.range(0.72, 0.9), lerp(st.birth0, st.birth1, t) + 0.01, { wet: 0.2 });
    s += rng.range(12, 26) * u;
    side = rng.chance(0.75) ? -side : side;
  }
}

// ---------------------------------------------------------------------------------------------
// Leaves 荷叶

interface LeafOpts {
  navel: V;      // where the stem meets the leaf
  rx: number;    // half-width of the leaf as seen
  ry: number;    // half-height (tilt): small = edge-on
  ang: number;   // rotation of the ellipse
  lift: number;  // rim height above the navel (+ cup, − umbrella), px
  droop: number; // how much the sides fall, as a fraction of rx
  tone: number;
  color?: string;
  birth: number;
}

/**
 * 泼墨 lotus leaf: a pale wet ground, then three to five broad side-brush sweeps that follow
 * the leaf round (darkest along the rim on one side, paler toward the centre, the paper left
 * between them), ragged where the brush runs dry; a few soft, broken, curved veins that do
 * not quite meet; a burnt-ink touch on the rim.
 */
function leaf(c: Ctx, o: LeafOpts) {
  const { rng, noise, u } = c;
  group(c);
  const ns = rng.range(0, 99), ns2 = rng.range(0, 99);
  const rim = (th: number, k = 1): V => {
    const r = 1 + 0.2 * noise(Math.cos(th) * 1.1 + ns, Math.sin(th) * 1.1 + ns) + 0.06 * noise(Math.cos(th) * 4 + ns2, Math.sin(th) * 4 + ns2);
    const cth = Math.cos(th);
    const lx = cth * o.rx * r * k;
    const ly = Math.sin(th) * o.ry * r * k - o.lift * k + o.droop * o.rx * cth * cth * k;
    const q = rot({ x: lx, y: ly }, o.ang);
    return { x: o.navel.x + q.x, y: o.navel.y + q.y };
  };
  const b = o.birth;
  // 1. pale wet ground over the whole leaf
  const outlineV: V[] = [];
  for (let i = 0; i < 40; i++) outlineV.push(rim((i / 40) * TAU, 0.97));
  add(c, 'wash', poly(outlineV, 5 * u), o.tone * 0.34, b, { wet: 0.95 });
  if (o.color) add(c, 'wash', poly(outlineV, 5 * u), 0.09, b, { wet: 0.95, color: o.color });

  // 2. broad sweeps round the leaf: outer ones dark on the "dark side", inner ones pale
  const darkSide = -Math.PI / 2 - o.ang + rng.range(-1.2, 1.2);
  const sweeps = [
    { k: rng.range(0.8, 0.86), d: rng.range(0.14, 0.2), a: darkSide, span: rng.range(2.2, 3.2), tone: o.tone * rng.range(0.95, 1.12) },
    { k: rng.range(0.74, 0.82), d: rng.range(0.14, 0.2), a: darkSide + Math.PI + rng.range(-0.5, 0.5), span: rng.range(1.6, 2.6), tone: o.tone * rng.range(0.6, 0.78) },
    { k: rng.range(0.45, 0.56), d: rng.range(0.16, 0.22), a: darkSide + rng.range(-0.8, 0.8), span: rng.range(1.8, 3.0), tone: o.tone * rng.range(0.45, 0.6) },
  ];
  if (rng.chance(0.6)) sweeps.push({ k: rng.range(0.82, 0.88), d: rng.range(0.1, 0.15), a: darkSide + rng.range(1.2, 2.2) * (rng.chance(0.5) ? 1 : -1), span: rng.range(1.0, 1.8), tone: o.tone * rng.range(0.8, 1.0) });
  if (rng.chance(0.4)) sweeps.push({ k: rng.range(0.3, 0.4), d: rng.range(0.12, 0.18), a: darkSide + Math.PI + rng.range(-0.6, 0.6), span: rng.range(1.2, 2.2), tone: o.tone * rng.range(0.35, 0.5) });
  sweeps.forEach((sw, j) => {
    const pts: StrokePoint[] = [];
    const n = 10, dir = rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const th = sw.a + dir * (t - 0.5) * sw.span;
      const kk = sw.k + rng.range(-0.02, 0.02);
      const inner = rim(th, kk - sw.d), outer = rim(th, Math.min(1.04, kk + sw.d));
      const mid = rim(th, kk);
      // pressed start, full body, tapering lift
      const env = t < 0.15 ? lerp(0.55, 1, t / 0.15) : t > 0.8 ? lerp(1, 0.35, (t - 0.8) / 0.2) : 1;
      pts.push({ x: mid.x, y: mid.y, w: Math.max(2.2 * u, Math.hypot(outer.x - inner.x, outer.y - inner.y) * env) });
    }
    add(c, 'brush', pts, clamp(sw.tone, 0.18, 0.88), b + 0.0004 + j * 0.0002, { wet: rng.range(0.75, 0.9), dryness: rng.range(0.3, 0.6) });
  });

  // 3. veins: a few soft curved strokes from near the navel, some broken, none quite meeting
  const nv = rng.int(4, 6);
  const v0 = rng.range(0, TAU);
  for (let i = 0; i < nv; i++) {
    const va = v0 + (i / nv) * TAU + rng.range(-0.3, 0.3);
    const k0 = rng.range(0.08, 0.18), k1 = rng.range(0.5, 0.72);
    const bend = rng.range(-0.18, 0.18);
    const path: V[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      path.push(rim(va + bend * Math.sin(Math.PI * t), lerp(k0, k1, t)));
    }
    const broken = rng.chance(0.45);
    const pieces = broken ? [[0, 3], [4, 6]] : [[0, 6]];
    for (const [i0, i1] of pieces) {
      const seg = path.slice(i0, i1 + 1);
      if (seg.length < 2) continue;
      add(c, 'brush', seg.map((p, k) => ({ ...p, w: lerp(1.5, 0.5, (i0 + k) / 6) * u })), clamp(o.tone + rng.range(0.05, 0.2), 0.55, 0.85), b + 0.0016 + i * 0.0001, { wet: 0.55, dryness: 0.3 });
    }
  }
  // 4. a burnt-ink touch on the rim, in one place
  if (rng.chance(0.7)) {
    const a0 = darkSide + rng.range(-0.8, 0.8), span = rng.range(0.5, 0.9);
    const pts: V[] = [];
    for (let i = 0; i <= 7; i++) pts.push(rim(a0 + (span * i) / 7, 0.95));
    add(c, 'brush', brushPts(pts, rng.range(1.8, 2.6) * u, 1.2 * u, 1.0, 0.3), rng.range(0.78, 0.9), b + 0.0024, { wet: 0.5, dryness: 0.6 });
  }
}

/** 卷荷: a young leaf still rolled into a horn. */
function rolledLeaf(c: Ctx, base: V, dir: number, len: number, birth: number) {
  const { u } = c;
  group(c);
  const d = { x: Math.cos(dir), y: Math.sin(dir) };
  const n = { x: -d.y, y: d.x };
  const w = len * 0.24;
  const spine = (t: number, off: number): V => {
    const curl = Math.sin(t * Math.PI * 0.9) * len * 0.08;
    return { x: base.x + d.x * len * t + n.x * (curl + off), y: base.y + d.y * len * t + n.y * (curl + off) };
  };
  // body: spindle, fullest past the middle, open at the tip
  const L: V[] = [], R: V[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const hw = w * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.06)), 0.7);
    L.push(spine(t, hw));
    R.push(spine(t, -hw * 0.8));
  }
  add(c, 'wash', poly([...L, ...R.reverse()], 2 * u), 0.5, birth, { wet: 0.7 });
  // the rolled edge: a dark spiral line wrapping the horn
  const sp: StrokePoint[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = lerp(0.15, 1.02, i / 10);
    const hw = w * 0.5 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.06));
    sp.push({ ...spine(t, lerp(-hw * 0.7, hw * 0.9, i / 10)), w: lerp(2.6, 0.8, i / 10) * u });
  }
  add(c, 'brush', sp, 0.82, birth + 0.004, { wet: 0.5 });
  add(c, 'brush', brushPts([spine(0.05, w * 0.3), spine(0.5, w * 0.48), spine(0.92, w * 0.35)], 1.8 * u, 1.1 * u, 1.2, 0.3), 0.7, birth + 0.005, { wet: 0.5 });
}

// ---------------------------------------------------------------------------------------------
// Flower 荷花

interface Petal { poly: V[]; z: number; tip: V[]; upper: V[]; inner: boolean }

interface FlowerOpts { c: V; R: number; face: number; roll: number; birthA: number; birthB: number; tone: number }

function project(p: V3, face: number, roll: number): V3 {
  const cf = Math.cos(face), sf = Math.sin(face);
  const y1 = p[1] * cf + p[2] * sf;
  const z1 = -p[1] * sf + p[2] * cf;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return [p[0] * cr - y1 * sr, p[0] * sr + y1 * cr, z1];
}

function makePetal(o: FlowerOpts, phi: number, elev: number, len: number, wid: number, cup: number, curl: number, inner: boolean): Petal {
  // Petal plane: spine rises from the receptacle at azimuth phi and elevation elev (from the
  // receptacle plane towards the axis), bending by `curl`; the sides cup towards the axis.
  const N = 9;
  const dir = (a: number): V3 => [Math.cos(a) * Math.cos(phi), Math.cos(a) * Math.sin(phi), Math.sin(a)];
  const side: V3 = [-Math.sin(phi), Math.cos(phi), 0];
  const spine: V3[] = [];
  const inward: V3[] = [];
  const r0 = o.R * (inner ? 0.17 : 0.2);
  let p: V3 = [Math.cos(phi) * r0, Math.sin(phi) * r0, inner ? o.R * 0.04 : 0];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = elev + curl * t * t;
    spine.push(p);
    const d = dir(a);
    // inward normal (towards the flower axis): perpendicular to d within the phi plane
    inward.push([-Math.sin(a) * Math.cos(phi), -Math.sin(a) * Math.sin(phi), Math.cos(a)]);
    const ds = len / (N - 1);
    p = [p[0] + d[0] * ds, p[1] + d[1] * ds, p[2] + d[2] * ds];
  }
  const Lp: V3[] = [], Rp: V3[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // broad ovate petal with a pointed tip
    const hw = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.68)), 0.55) * (t < 0.08 ? 0.6 + 5 * t : 1);
    const cz = cup * hw; // edges curl forward
    const s = spine[i], n = inward[i];
    Lp.push([s[0] + side[0] * hw + n[0] * cz, s[1] + side[1] * hw + n[1] * cz, s[2] + side[2] * hw + n[2] * cz]);
    Rp.push([s[0] - side[0] * hw + n[0] * cz, s[1] - side[1] * hw + n[1] * cz, s[2] - side[2] * hw + n[2] * cz]);
  }
  const P = (q: V3): V => { const r = project(q, o.face, o.roll); return { x: o.c.x + r[0], y: o.c.y - r[1] }; };
  const polyV = [...Lp.map(P), ...Rp.slice(0, -1).reverse().map(P)];
  const z = spine.reduce((s, q) => s + project(q, o.face, o.roll)[2], 0) / N;
  // pigment deepens toward the tip: an upper half and a tip third, each a softer layer
  const upper = [...Lp.slice(3).map(P), ...Rp.slice(3, -1).reverse().map(P)];
  const tip = [...Lp.slice(6).map(P), ...Rp.slice(6, -1).reverse().map(P)];
  return { poly: polyV, z, tip, upper, inner };
}

function flower(c: Ctx, o: FlowerOpts) {
  const { rng, u } = c;
  const R = o.R;
  const petals: Petal[] = [];
  const nIn = rng.int(4, 5), nOut = rng.int(5, 6);
  const off = rng.range(0, TAU);
  for (let i = 0; i < nIn; i++) {
    const phi = off + (i / nIn) * TAU + rng.range(-0.25, 0.25);
    petals.push(makePetal(o, phi, rad(rng.range(54, 66)), R * rng.range(0.66, 0.78), R * rng.range(0.6, 0.7), 0.75, rad(rng.range(6, 18)), true));
  }
  const off2 = off + Math.PI / nOut;
  for (let i = 0; i < nOut; i++) {
    if (i > 3 && rng.chance(0.25)) continue;
    const phi = off2 + (i / nOut) * TAU + rng.range(-0.3, 0.3);
    petals.push(makePetal(o, phi, rad(rng.range(24, 46)), R * rng.range(0.9, 1.05), R * rng.range(0.66, 0.78), 0.6, rad(rng.range(0, 22)), false));
  }

  // Pod and stamens (3-D): a flat-topped inverted cone above the receptacle.
  const podH = R * 0.24, podTop = R * 0.22, podBot = R * 0.1;
  const P3 = (q: V3): V => { const r = project(q, o.face, o.roll); return { x: o.c.x + r[0], y: o.c.y - r[1] }; };
  const top: V[] = [], bot: V[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    top.push(P3([Math.cos(a) * podTop, Math.sin(a) * podTop, podH]));
    bot.push(P3([Math.cos(a) * podBot, Math.sin(a) * podBot, podH * 0.15]));
  }
  const podZ = project([0, 0, podH * 0.6], o.face, o.roll)[2];

  const inner = petals.filter((p) => p.inner).sort((a, b) => a.z - b.z);
  const outer = petals.filter((p) => !p.inner).sort((a, b) => a.z - b.z);
  const rouge = PIGMENTS.rouge;

  // near-white base, rouge gathering toward the tip: three soft layers per petal
  const paintPetal = (p: Petal, b: number, ground: boolean) => {
    if (ground) add(c, 'fill', poly(p.poly, 0.8 * u), 0.88, b, { color: PIGMENTS.white, wet: 0.1 });
    add(c, 'fill', poly(p.poly, 2.5 * u), o.tone * rng.range(0.3, 0.45), b, { color: rouge, wet: 0.7 });
    if (p.upper.length > 3) add(c, 'fill', poly(p.upper, 6 * u), o.tone * rng.range(0.6, 0.8), b, { color: rouge, wet: 0.85 });
    if (p.tip.length > 3) add(c, 'fill', poly(p.tip, 5 * u), clamp(o.tone * rng.range(1.4, 1.8), 0.28, 0.5), b, { color: rouge, wet: 0.85 });
  };
  const nearerOf = (p: Petal) => petals.filter((q) => q !== p && q.z > p.z);
  // fine 勾勒, broken: hidden behind nearer petals, and lifted here and there like a real line
  const outlinePetal = (p: Petal, b: number) => {
    const nearer = nearerOf(p);
    const pl = p.poly;
    const n = pl.length;
    let run: StrokePoint[] = [];
    const flush = () => { if (run.length >= 3) add(c, 'line', run, 0.5, b, { color: rouge, wet: 0.25 }); run = []; };
    let gap = 0;
    for (let i = 0; i < n; i++) {
      const a = pl[i], bp = pl[(i + 1) % n];
      for (const t of [0, 0.5]) {
        const x = lerp(a.x, bp.x, t), y = lerp(a.y, bp.y, t);
        if (gap > 0) { gap--; continue; }
        if (nearer.some((q) => pointInPoly(x, y, q.poly))) flush();
        else {
          run.push({ x, y, w: 0.65 * u });
          if (run.length > 5 && rng.chance(0.12)) { flush(); gap = rng.int(1, 2); }
        }
      }
    }
    flush();
  };

  group(c);
  // Stage A: the inner cup (reads as a flower just opening), pod between back and front.
  // Each stage appears as one unit (a shared birth); ties keep paint order: back → pod → front.
  let b = o.birthA;
  const backIn = inner.filter((p) => p.z <= podZ), frontIn = inner.filter((p) => p.z > podZ);
  for (const p of backIn) paintPetal(p, b, true);
  // pod
  const hull = convexHull([...top, ...bot]);
  add(c, 'fill', poly(hull, 1 * u), 0.62, b, { color: PIGMENTS.gamboge, wet: 0.4 });
  add(c, 'fill', poly(top, 1.5 * u), 0.42, b, { color: PIGMENTS.malachite, wet: 0.5 });
  add(c, 'line', [...top, top[0]].map((q) => ({ ...q, w: 0.7 * u })), 0.55, b, { wet: 0.2 });
  const nSeeds = rng.int(6, 9);
  for (let i = 0; i < nSeeds; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng()) * podTop * 0.7;
    const q = P3([Math.cos(a) * r, Math.sin(a) * r, podH]);
    add(c, 'dot', [{ ...q, w: R * 0.045 }], 0.6, b, { color: PIGMENTS.malachite, wet: 0.2 });
  }
  // stamens
  const nSt = rng.int(14, 20);
  for (let i = 0; i < nSt; i++) {
    const a = (i / nSt) * TAU + rng.range(-0.15, 0.15);
    const s0: V3 = [Math.cos(a) * podBot * 1.3, Math.sin(a) * podBot * 1.3, podH * 0.1];
    const el = rad(rng.range(55, 80)), ln = R * rng.range(0.2, 0.28);
    const s1: V3 = [s0[0] + Math.cos(a) * Math.cos(el) * ln, s0[1] + Math.sin(a) * Math.cos(el) * ln, s0[2] + Math.sin(el) * ln];
    const pa = P3(s0), pb = P3(s1);
    add(c, 'line', [{ ...pa, w: 0.7 * u }, { x: lerp(pa.x, pb.x, 0.5) + rng.range(-0.6, 0.6) * u, y: lerp(pa.y, pb.y, 0.5), w: 0.7 * u }, { ...pb, w: 0.6 * u }], 0.75, b, { color: PIGMENTS.gamboge, wet: 0.2 });
    if (i % 2 === 0) add(c, 'dot', [{ ...pb, w: 2 * u }], 0.8, b, { color: PIGMENTS.ochre, wet: 0.2 });
  }
  for (const p of frontIn) paintPetal(p, b, true);
  for (const p of inner) outlinePetal(p, o.birthA + 0.002);

  group(c);
  // Stage B: the outer petals fall open. Those behind the cup are left translucent (no white
  // ground), so they tint rather than hide the inner petals they sit behind.
  b = o.birthB;
  for (const p of outer) paintPetal(p, b, p.z > podZ);
  for (const p of outer) outlinePetal(p, o.birthB + 0.002);
}

/** 荷苞: a closed bud — a pointed teardrop of three visible petals. */
function bud(c: Ctx, base: V, dir: number, h: number, birth: number) {
  const { rng, u } = c;
  const d = { x: Math.cos(dir), y: Math.sin(dir) };
  const n = { x: -d.y, y: d.x };
  const shape = (t: number) => h * 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.9);
  const at = (t: number, off: number): V => ({ x: base.x + d.x * h * t + n.x * off, y: base.y + d.y * h * t + n.y * off });
  const lean = rng.range(-0.08, 0.08) * h;
  const petal = (sgn: number, width: number, shift: number) => {
    const L: V[] = [], R: V[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const hw = shape(t) * width;
      L.push(at(t, shift * shape(t) + hw + lean * t * t));
      R.push(at(t, shift * shape(t) - hw + lean * t * t));
    }
    return [...L, ...R.slice(0, -1).reverse()];
  };
  const back = petal(0, 1, 0);
  const left = petal(-1, 0.72, -0.3);
  const right = petal(1, 0.7, 0.34);
  const tone = rng.range(0.2, 0.26);
  const rouge = PIGMENTS.rouge;
  const b = birth;
  group(c);
  for (const p of [back, left, right]) {
    add(c, 'fill', poly(p, 0.8 * u), 0.85, b, { color: PIGMENTS.white, wet: 0.1 });
    add(c, 'fill', poly(p, 2 * u), tone * 0.45, b, { color: rouge, wet: 0.7 });
    add(c, 'fill', poly(p.filter((_, i) => i >= 4 && i <= 16), 4 * u), tone, b, { color: rouge, wet: 0.85 });
    // the tip, where the colour gathers
    add(c, 'fill', poly(p.filter((_, i) => i >= 7 && i <= 13), 3 * u), 0.46, b, { color: rouge, wet: 0.8 });
    add(c, 'line', p.slice(2, 19).map((q) => ({ ...q, w: 0.65 * u })), 0.5, b, { color: rouge, wet: 0.25 });
  }
}

// ---------------------------------------------------------------------------------------------

export function lotus(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 104729 + 3);
  const noise = makeNoise2(spec.seed + 777);
  const H = spec.height;
  const u = H / 320;
  const c: Ctx = { rng, noise, u, strokes: [], units: [], unit: 0 };

  const side = rng.chance(0.5) ? 1 : -1; // which side the big leaf leans to
  // tall: flower high above the leaves · low: a leaf canopy above the flower · pair: two flowers
  const layout = rng.pick(['tall', 'tall', 'low', 'pair'] as const);
  const tint = rng.pick([undefined, undefined, PIGMENTS.malachite, PIGMENTS.indigo] as const);
  const stemTone = rng.range(0.4, 0.5);
  const baseX = () => rng.range(-0.02, 0.02) * H;

  // Timeline (growth ≈ 0.06 + 0.94(1 − e^(−n/21)) after n check-ins):
  //   0      a round floating leaf 荷钱 and a young leaf still rolled 卷荷 — alive on day one
  //   ~0.1   the first leaf stem rises, the great leaf unfolds (~0.15), then the others
  //   ~0.3   the bud, pink at the tip (check-in 6–7)
  //   ~0.4   the flower opens as a cup; ~0.52 wide open with its seedpod; a second flower later
  // retime() then makes sure every check-in up to 21 adds something.

  // --- day one: 荷钱 on the water, and a rolled young leaf on a short stem --------------------
  {
    const fx = side * rng.range(0.07, 0.12) * H;
    const frx = H * rng.range(0.085, 0.105);
    leaf(c, { navel: { x: fx, y: -frx * 0.12 }, rx: frx, ry: frx * rng.range(0.28, 0.36), ang: rng.range(-0.06, 0.06), lift: 0, droop: 0, tone: rng.range(0.5, 0.6), color: tint, birth: 0 });
    const b0 = { x: baseX() - side * 0.02 * H, y: 0 };
    const top = { x: b0.x - side * rng.range(0.03, 0.06) * H, y: -rng.range(0.12, 0.17) * H };
    const { path, L } = makeStem(b0, top, rng.range(-0.05, 0.05), rng);
    paintStem(c, { path, L, w: 2.2 * u, birth0: 0.005, birth1: 0.02 }, stemTone, false);
    const q = along(path, L, 1);
    rolledLeaf(c, { x: q.p.x - q.d.x * 2 * u, y: q.p.y - q.d.y * 2 * u }, Math.atan2(q.d.y, q.d.x) + rng.range(-0.25, 0.25), H * rng.range(0.1, 0.13), 0.03);
  }

  // --- big leaves ------------------------------------------------------------------------------
  interface LeafPlan { navel: V; rx: number; ry: number; lift: number; droop: number; ang: number; tone: number; birth: number }
  const nLeaves = rng.pick([1, 2, 2, 2, 3, 3]);
  const plans: LeafPlan[] = [];
  // leaf 1: the great open leaf, tilted towards us
  plans.push({
    navel: { x: side * rng.range(0.1, 0.18) * H, y: -(layout === 'low' ? rng.range(0.56, 0.66) : rng.range(0.42, 0.56)) * H },
    rx: H * rng.range(0.27, 0.32), ry: 0, lift: 0, droop: 0, ang: side * rng.range(-0.05, 0.18), tone: rng.range(0.62, 0.78), birth: 0.15,
  });
  plans[0].ry = plans[0].rx * rng.range(0.3, 0.45);
  plans[0].lift = plans[0].ry * rng.range(0.1, 0.5);
  plans[0].droop = rng.range(0.0, 0.12);
  if (nLeaves >= 2) {
    // leaf 2: tipped over like an umbrella and seen nearly edge-on, curling, on the other side
    const rx = H * rng.range(0.19, 0.24);
    plans.push({
      navel: { x: -side * rng.range(0.1, 0.17) * H, y: -rng.range(0.3, 0.42) * H },
      rx, ry: rx * rng.range(0.14, 0.22), lift: -rx * rng.range(0.1, 0.22), droop: rng.range(0.25, 0.4), ang: -side * rng.range(0.05, 0.3), tone: rng.range(0.55, 0.72), birth: 0.215,
    });
  }
  if (nLeaves >= 3 && layout !== 'low') {
    // leaf 3: smaller, higher, far behind — paler
    const rx = H * rng.range(0.13, 0.17);
    plans.push({
      navel: { x: side * rng.range(-0.05, 0.08) * H, y: -rng.range(0.66, 0.74) * H },
      rx, ry: rx * rng.range(0.25, 0.4), lift: rx * 0.05, droop: rng.range(0.05, 0.2), ang: rng.range(-0.2, 0.2), tone: rng.range(0.4, 0.5), birth: 0.36,
    });
  }
  // each leaf rises on its own stem, then unfurls
  plans.forEach((lp) => {
    const b0 = { x: baseX(), y: 0 };
    const st = makeStem(b0, lp.navel, rng.range(-0.06, 0.06), rng);
    paintStem(c, { ...st, w: 2.8 * u, birth0: lp.birth - 0.08, birth1: lp.birth - 0.006 }, stemTone, true);
    leaf(c, { navel: lp.navel, rx: lp.rx, ry: lp.ry, ang: lp.ang, lift: lp.lift, droop: lp.droop, tone: lp.tone, color: tint, birth: lp.birth });
  });

  const mainTop = layout === 'low'
    ? { x: -side * rng.range(0.12, 0.2) * H, y: -rng.range(0.64, 0.74) * H }
    : { x: side * rng.range(-0.1, 0.04) * H, y: -rng.range(0.8, 0.88) * H };

  // --- bud on its own stem: the first colour ------------------------------------------------
  {
    const top = layout === 'low' ? { x: mainTop.x + side * rng.range(0.12, 0.2) * H, y: -rng.range(0.76, 0.84) * H } : layout === 'pair' ? { x: mainTop.x + side * rng.range(0.1, 0.16) * H, y: -rng.range(0.68, 0.75) * H } : { x: mainTop.x - side * rng.range(0.09, 0.16) * H, y: -rng.range(0.62, 0.72) * H };
    const b0 = { x: baseX(), y: 0 };
    const st = makeStem(b0, top, rng.range(-0.05, 0.05), rng);
    paintStem(c, { ...st, w: 2.4 * u, birth0: 0.235, birth1: 0.285 }, stemTone, true);
    const q = along(st.path, st.L, 1);
    bud(c, { x: q.p.x - q.d.x * 1 * u, y: q.p.y - q.d.y * 1 * u }, Math.atan2(q.d.y, q.d.x) + rng.range(-0.15, 0.15), H * rng.range(0.1, 0.12), 0.295);
  }

  // --- the flower(s) ------------------------------------------------------------------------
  const flowerAt = (top: V, R: number, birth0: number, birthA: number, birthB: number, face: number) => {
    const b0 = { x: baseX(), y: 0 };
    const st = makeStem(b0, top, rng.range(-0.05, 0.05), rng);
    paintStem(c, { ...st, w: 2.6 * u, birth0, birth1: birthA - 0.008 }, stemTone, true);
    const q = along(st.path, st.L, 1);
    flower(c, {
      c: { x: q.p.x, y: q.p.y }, R, face,
      roll: clamp(Math.atan2(q.d.x, -q.d.y) * 0.8 + rng.range(-0.15, 0.15), -0.4, 0.4), birthA, birthB, tone: rng.range(0.2, 0.27),
    });
  };
  flowerAt(mainTop, H * rng.range(0.15, 0.18), 0.31, 0.4, 0.52, rad(rng.range(42, 60)));
  if (layout === 'pair') flowerAt({ x: -side * rng.range(0.16, 0.24) * H, y: -rng.range(0.52, 0.6) * H }, H * rng.range(0.12, 0.14), 0.5, 0.6, 0.72, rad(rng.range(62, 80)));

  retime(c);
  return finish(c, H);
}

/**
 * Check-in choreography: growth after n check-ins is growthFor(n). Make sure each of the first
 * 21 check-ins adds at least one stroke group, by pulling the next group forward into any
 * empty interval (order is preserved: nothing overtakes what came before it).
 */
function retime(c: Ctx) {
  const unitMin = new Map<number, number>();
  c.strokes.forEach((st, i) => unitMin.set(c.units[i], Math.min(unitMin.get(c.units[i]) ?? 2, st.birth)));
  for (let n = 1; n <= 21; n++) {
    const lo = growthFor(n - 1), hi = growthFor(n);
    if (c.strokes.some((st) => st.birth > lo && st.birth <= hi)) continue;
    let next = -1, nb = 2;
    for (const [id, b] of unitMin) if (b > hi && b < nb) { nb = b; next = id; }
    if (next < 0) break;
    const shift = lerp(lo, hi, 0.5) - nb;
    c.strokes.forEach((st, i) => { if (c.units[i] === next) st.birth = clamp(st.birth + shift, 0, 1); });
    unitMin.set(next, nb + shift);
  }
}

function finish(c: Ctx, H: number): Drawing {
  const strokes = c.strokes.map((s, i) => ({ s, i })).sort((a, b) => a.s.birth - b.s.birth || a.i - b.i).map((x) => x.s);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const isPoly = s.kind === 'wash' || s.kind === 'fill';
    for (const p of s.pts) {
      const r = isPoly ? (s.pts[0].w || 0) : p.w / 2;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
      y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
  }
  const m = Math.max(4, H * 0.025);
  const dx = m - x0, dy = m - y0;
  for (const s of strokes) for (const p of s.pts) { p.x += dx; p.y += dy; }
  return { width: Math.ceil(x1 - x0 + 2 * m), height: Math.ceil(Math.max(y1, 0) - y0 + 2 * m), anchor: { x: dx, y: dy }, strokes };
}
