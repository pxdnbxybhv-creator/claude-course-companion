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

interface Ctx { rng: Rng; noise: Noise2; u: number; strokes: Stroke[] }

function add(c: Ctx, kind: StrokeKind, pts: StrokePoint[], tone: number, birth: number, extra: Partial<Stroke> = {}) {
  c.strokes.push({ kind, pts, tone: clamp(tone, 0.04, 1), birth: clamp(birth, 0, 1), seed: c.rng.int(1, 0x7ffffffe), ...extra });
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

function leaf(c: Ctx, o: LeafOpts) {
  const { rng, noise, u } = c;
  const ns = rng.range(0, 99), ns2 = rng.range(0, 99);
  const rim = (th: number, k = 1): V => {
    const r = 1 + 0.2 * noise(Math.cos(th) * 1.1 + ns, Math.sin(th) * 1.1 + ns) + 0.05 * noise(Math.cos(th) * 4 + ns2, Math.sin(th) * 4 + ns2);
    const cth = Math.cos(th);
    const lx = cth * o.rx * r * k;
    const ly = Math.sin(th) * o.ry * r * k - o.lift * k + o.droop * o.rx * cth * cth * k;
    const q = rot({ x: lx, y: ly }, o.ang);
    return { x: o.navel.x + q.x, y: o.navel.y + q.y };
  };
  const N = 48;
  const outlineV: V[] = [];
  for (let i = 0; i < N; i++) outlineV.push(rim((i / N) * TAU));
  const b = o.birth;
  const col = o.color;

  // 1. a pale wash of the whole leaf
  add(c, 'wash', poly(outlineV, 4 * u), o.tone * 0.58, b, { wet: 0.9, color: col });

  // 2. two big wet masses laid over it, overlapping, each leaving part of the leaf pale —
  //    darker toward the far rim, as the leaf tips its face away from us.
  const masses = 2;
  let a = rng.range(0, TAU);
  for (let k = 0; k < masses; k++) {
    const span = rng.range(2.0, 3.2);
    const a0 = a, a1 = a + span;
    a = a1 + rng.range(-0.4, 0.3);
    const r0 = rng.range(0.05, 0.3);
    const kOut = rng.range(0.84, 0.98);
    const pts: V[] = [];
    for (let i = 0; i <= 3; i++) pts.push(rim(a0 + rng.range(-0.1, 0.1), lerp(r0, kOut, i / 3)));
    for (let i = 1; i < 16; i++) pts.push(rim(lerp(a0, a1, i / 16), kOut * rng.range(0.95, 1.02)));
    for (let i = 0; i <= 3; i++) pts.push(rim(a1 + rng.range(-0.1, 0.1), lerp(kOut, r0, i / 3)));
    for (let i = 1; i < 4; i++) pts.push(rim(lerp(a1, a0, i / 4), r0));
    const far = -Math.sin((a0 + a1) / 2 + o.ang);
    const tone = clamp(o.tone * (0.62 + 0.25 * far) + rng.range(-0.05, 0.05), 0.22, 0.88);
    add(c, 'wash', poly(pts, 3 * u), tone, b + 0.001 + k * 0.001, { wet: 0.9, color: k === 1 && col ? col : undefined });
  }
  // a darker band along part of the far rim, where the leaf turns away from us
  {
    const mid = -Math.PI / 2 - o.ang + rng.range(-0.9, 0.9);
    const a0 = mid - rng.range(0.6, 1.1), a1 = mid + rng.range(0.6, 1.1);
    const pts: V[] = [];
    for (let i = 0; i <= 12; i++) pts.push(rim(lerp(a0, a1, i / 12), rng.range(0.95, 1.0)));
    for (let i = 0; i <= 8; i++) pts.push(rim(lerp(a1, a0, i / 8), rng.range(0.45, 0.7)));
    add(c, 'wash', poly(pts, 2 * u), clamp(o.tone * 1.08, 0.3, 0.9), b + 0.003, { wet: 0.8 });
  }
  // 3. veins radiating from the navel — curved by the cup of the leaf, some left out
  const nv = rng.int(8, 11);
  const v0 = rng.range(0, TAU);
  for (let i = 0; i < nv; i++) {
    if (rng.chance(0.15)) continue;
    const va = v0 + (i / nv) * TAU + rng.range(-0.15, 0.15);
    const end = rim(va, rng.range(0.68, 0.9));
    const mid = rim(va, 0.5);
    const bow = { x: (mid.x - lerp(o.navel.x, end.x, 0.5)) * 0.6, y: (mid.y - lerp(o.navel.y, end.y, 0.5)) * 0.6 };
    const pts: StrokePoint[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = lerp(0.1, 1, k / 5);
      pts.push({ x: lerp(o.navel.x, end.x, t) + bow.x * Math.sin(Math.PI * t), y: lerp(o.navel.y, end.y, t) + bow.y * Math.sin(Math.PI * t), w: lerp(1.2, 0.35, k / 5) * u });
    }
    add(c, 'line', pts, clamp(o.tone + rng.range(0.04, 0.2), 0.5, 0.82), b + 0.006 + i * 0.0003, { wet: 0.55 });
  }
  add(c, 'dot', [{ x: o.navel.x, y: o.navel.y, w: 3.4 * u }], 0.85, b + 0.009, { wet: 0.4 });

  // 4. burnt-ink rim, in one or two places only
  const nr = rng.int(1, 2);
  for (let k = 0; k < nr; k++) {
    const a0 = rng.range(0, TAU), span = rng.range(0.5, 1.1);
    const pts: V[] = [];
    for (let i = 0; i <= 8; i++) pts.push(rim(a0 + (span * i) / 8, 0.94));
    add(c, 'brush', brushPts(pts, rng.range(1.6, 2.6) * u, rng.range(1.2, 2) * u, 1.0, 0.3), rng.range(0.78, 0.9), b + 0.01 + k * 0.0005, { wet: 0.5, dryness: 0.6 });
  }
}

/** 荷钱: a young leaf floating flat on the water — a lens of wash, a dark far rim. */
function floatingLeaf(c: Ctx, at: V, rx: number, color: string | undefined, birth: number) {
  const { rng, u } = c;
  const ry = rx * rng.range(0.18, 0.26);
  const pts: V[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const notch = Math.abs(((a - 1.9 + TAU) % TAU) - 0) < 0.25 ? 0.7 : 1;
    pts.push({ x: at.x + Math.cos(a) * rx * notch * rng.range(0.96, 1.04), y: at.y + Math.sin(a) * ry * notch });
  }
  add(c, 'wash', poly(pts, 2 * u), 0.45, birth, { wet: 0.8, color });
  const rim: V[] = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.08 + (0.8 * i) / 8); rim.push({ x: at.x + Math.cos(a) * rx * 0.97, y: at.y + Math.sin(a) * ry * 0.97 }); }
  add(c, 'brush', brushPts(rim, 2 * u, 1.4 * u, 1.1, 0.3), 0.75, birth + 0.003, { wet: 0.5 });
}

/** 卷荷: a young leaf still rolled into a horn. */
function rolledLeaf(c: Ctx, base: V, dir: number, len: number, birth: number) {
  const { rng, u } = c;
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
  void rng;
}

// ---------------------------------------------------------------------------------------------
// Flower 荷花

interface Petal { poly: V[]; z: number; tip: V[]; veins: V[][]; inner: boolean }

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
  // darker tip region: last ~35% of the petal
  const tipL = Lp.slice(5).map(P), tipR = Rp.slice(5, -1).reverse().map(P);
  const tip = [...tipL, ...tipR];
  // two fine veins
  const veins: V[][] = [[Lp, 0.42], [Rp, 0.38]].map(([E, k]) => spine.slice(1, -2).map((q, i) => {
    const e = (E as V3[])[i + 1], f = k as number;
    return P([lerp(q[0], e[0], f), lerp(q[1], e[1], f), lerp(q[2], e[2], f)]);
  }));
  return { poly: polyV, z, tip, veins, inner };
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

  const paintPetal = (p: Petal, b: number, ground: boolean) => {
    if (ground) add(c, 'fill', poly(p.poly, 0.8 * u), 0.88, b, { color: PIGMENTS.white, wet: 0.1 });
    add(c, 'fill', poly(p.poly, 1.2 * u), o.tone * rng.range(0.6, 0.85), b + 0.0002, { color: rouge, wet: 0.45 });
    if (p.tip.length > 3) add(c, 'fill', poly(p.tip, 5 * u), clamp(o.tone * 1.5, 0.28, 0.45), b + 0.0003, { color: rouge, wet: 0.8 });
  };
  const nearerOf = (p: Petal) => petals.filter((q) => q !== p && q.z > p.z);
  const outlinePetal = (p: Petal, b: number) => {
    const nearer = nearerOf(p);
    const pl = p.poly;
    const n = pl.length;
    let run: StrokePoint[] = [];
    const flush = () => { if (run.length >= 3) add(c, 'line', run, 0.58, b, { color: rouge, wet: 0.2 }); run = []; };
    for (let i = 0; i < n; i++) {
      const a = pl[i], bp = pl[(i + 1) % n];
      for (const t of [0, 0.5]) {
        const x = lerp(a.x, bp.x, t), y = lerp(a.y, bp.y, t);
        if (nearer.some((q) => pointInPoly(x, y, q.poly))) flush();
        else run.push({ x, y, w: 0.7 * u });
      }
    }
    flush();
    for (const v of p.veins) {
      if (p.z < 0 || rng.chance(0.4)) continue;
      let vr: StrokePoint[] = [];
      const vflush = () => { if (vr.length >= 3) add(c, 'line', vr, 0.3, b + 0.0001, { color: rouge, wet: 0.3 }); vr = []; };
      for (const q of v) {
        if (nearer.some((r) => pointInPoly(q.x, q.y, r.poly))) vflush();
        else vr.push({ ...q, w: 0.5 * u });
      }
      vflush();
    }
  };

  // Stage A: the inner cup (reads as a flower just opening), pod between back and front.
  let b = o.birthA;
  const step = 0.004;
  const backIn = inner.filter((p) => p.z <= podZ), frontIn = inner.filter((p) => p.z > podZ);
  for (const p of backIn) { paintPetal(p, b, true); b += step; }
  // pod
  const hull = convexHull([...top, ...bot]);
  add(c, 'fill', poly(hull, 1 * u), 0.62, b, { color: PIGMENTS.gamboge, wet: 0.4 });
  add(c, 'fill', poly(top, 1.5 * u), 0.42, b + 0.0005, { color: PIGMENTS.malachite, wet: 0.5 });
  add(c, 'line', [...top, top[0]].map((q) => ({ ...q, w: 0.7 * u })), 0.55, b + 0.001, { wet: 0.2 });
  const nSeeds = rng.int(6, 9);
  for (let i = 0; i < nSeeds; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng()) * podTop * 0.7;
    const q = P3([Math.cos(a) * r, Math.sin(a) * r, podH]);
    add(c, 'dot', [{ ...q, w: R * 0.045 }], 0.6, b + 0.0015, { color: PIGMENTS.malachite, wet: 0.2 });
  }
  // stamens
  const nSt = rng.int(14, 20);
  for (let i = 0; i < nSt; i++) {
    const a = (i / nSt) * TAU + rng.range(-0.15, 0.15);
    const s0: V3 = [Math.cos(a) * podBot * 1.3, Math.sin(a) * podBot * 1.3, podH * 0.1];
    const el = rad(rng.range(55, 80)), ln = R * rng.range(0.2, 0.28);
    const s1: V3 = [s0[0] + Math.cos(a) * Math.cos(el) * ln, s0[1] + Math.sin(a) * Math.cos(el) * ln, s0[2] + Math.sin(el) * ln];
    const pa = P3(s0), pb = P3(s1);
    add(c, 'line', [{ ...pa, w: 0.7 * u }, { x: lerp(pa.x, pb.x, 0.5) + rng.range(-0.6, 0.6) * u, y: lerp(pa.y, pb.y, 0.5), w: 0.7 * u }, { ...pb, w: 0.6 * u }], 0.75, b + 0.002, { color: PIGMENTS.gamboge, wet: 0.2 });
    if (i % 2 === 0) add(c, 'dot', [{ ...pb, w: 2 * u }], 0.8, b + 0.0021, { color: PIGMENTS.ochre, wet: 0.2 });
  }
  b += step;
  for (const p of frontIn) { paintPetal(p, b, true); b += step; }
  for (const p of inner) outlinePetal(p, o.birthA + 0.03);

  // Stage B: the outer petals fall open. Those behind the cup are left translucent (no white
  // ground), so they tint rather than hide the inner petals they sit behind.
  b = o.birthB;
  for (const p of outer) { paintPetal(p, b, p.z > podZ); b += step * 1.5; }
  for (const p of outer) outlinePetal(p, o.birthB + 0.06);
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
  const tone = rng.range(0.22, 0.3);
  const rouge = PIGMENTS.rouge;
  let b = birth;
  for (const p of [back, left, right]) {
    add(c, 'fill', poly(p, 0.8 * u), 0.85, b, { color: PIGMENTS.white, wet: 0.1 });
    add(c, 'fill', poly(p, 1.2 * u), tone, b + 0.0002, { color: rouge, wet: 0.45 });
    // dark tip
    const tip = p.filter((_, i) => i >= 6 && i <= 14);
    add(c, 'fill', poly(tip, 4 * u), 0.38, b + 0.0003, { color: rouge, wet: 0.8 });
    add(c, 'line', p.map((q) => ({ ...q, w: 0.7 * u })), 0.58, b + 0.0004, { color: rouge, wet: 0.2 });
    b += 0.003;
  }
}

// ---------------------------------------------------------------------------------------------

export function lotus(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 104729 + 3);
  const noise = makeNoise2(spec.seed + 777);
  const H = spec.height;
  const u = H / 320;
  const c: Ctx = { rng, noise, u, strokes: [] };

  const side = rng.chance(0.5) ? 1 : -1; // which side the big leaf leans to
  // tall: flower high above the leaves · low: a leaf canopy above the flower · pair: two flowers
  const layout = rng.pick(['tall', 'tall', 'low', 'pair'] as const);
  const tint = rng.pick([undefined, undefined, PIGMENTS.malachite, PIGMENTS.indigo] as const);
  const stemTone = rng.range(0.4, 0.5);
  const baseX = () => rng.range(-0.02, 0.02) * H;

  // --- sprout: a rolled young leaf, and a floating leaf 荷钱 ---------------------------------
  {
    const b0 = { x: baseX() - side * 0.03 * H, y: 0 };
    const top = { x: b0.x - side * rng.range(0.03, 0.07) * H, y: -rng.range(0.13, 0.19) * H };
    const { path, L } = makeStem(b0, top, rng.range(-0.05, 0.05), rng);
    paintStem(c, { path, L, w: 2.2 * u, birth0: 0, birth1: 0.02 }, stemTone, false);
    const q = along(path, L, 1);
    rolledLeaf(c, { x: q.p.x - q.d.x * 2 * u, y: q.p.y - q.d.y * 2 * u }, Math.atan2(q.d.y, q.d.x) + rng.range(-0.25, 0.25), H * rng.range(0.1, 0.13), 0.022);
    if (rng.chance(0.7)) {
      const fx = side * rng.range(0.08, 0.14) * H;
      floatingLeaf(c, { x: fx, y: -0.01 * H }, H * rng.range(0.06, 0.08), tint, 0.05);
    }
  }

  // --- big leaves ------------------------------------------------------------------------------
  interface LeafPlan { navel: V; rx: number; ry: number; lift: number; droop: number; ang: number; tone: number; birth: number }
  const nLeaves = rng.pick([1, 2, 2, 2, 3, 3]);
  const plans: LeafPlan[] = [];
  // leaf 1: the great open leaf, tilted towards us
  plans.push({
    navel: { x: side * rng.range(0.1, 0.18) * H, y: -(layout === 'low' ? rng.range(0.56, 0.66) : rng.range(0.42, 0.56)) * H },
    rx: H * rng.range(0.27, 0.32), ry: 0, lift: 0, droop: 0, ang: side * rng.range(-0.05, 0.18), tone: rng.range(0.62, 0.78), birth: 0.185,
  });
  plans[0].ry = plans[0].rx * rng.range(0.3, 0.45);
  plans[0].lift = plans[0].ry * rng.range(0.1, 0.5);
  plans[0].droop = rng.range(0.0, 0.12);
  if (nLeaves >= 2) {
    // leaf 2: an umbrella seen nearly edge-on, drooping, on the other side
    const rx = H * rng.range(0.19, 0.24);
    plans.push({
      navel: { x: -side * rng.range(0.1, 0.17) * H, y: -rng.range(0.3, 0.42) * H },
      rx, ry: rx * rng.range(0.14, 0.22), lift: -rx * rng.range(0.1, 0.22), droop: rng.range(0.25, 0.4), ang: -side * rng.range(0.05, 0.3), tone: rng.range(0.55, 0.72), birth: 0.285,
    });
  }
  if (nLeaves >= 3) {
    // leaf 3: smaller, higher, far behind — paler
    const rx = H * rng.range(0.13, 0.17);
    plans.push({
      navel: { x: side * rng.range(-0.05, 0.08) * H, y: -rng.range(0.66, 0.74) * H },
      rx, ry: rx * rng.range(0.25, 0.4), lift: rx * 0.05, droop: rng.range(0.05, 0.2), ang: rng.range(-0.2, 0.2), tone: rng.range(0.4, 0.5), birth: 0.38,
    });
  }
  // paint far → near is by birth; order leaves so the far/pale one comes last but under? keep birth order
  plans.forEach((lp, i) => {
    const b0 = { x: baseX(), y: 0 };
    const st = makeStem(b0, lp.navel, rng.range(-0.06, 0.06), rng);
    const birth0 = lerp(0.05, lp.birth - 0.12, 0.5) + i * 0.02;
    paintStem(c, { ...st, w: 2.8 * u, birth0, birth1: lp.birth - 0.01 }, stemTone, true);
    leaf(c, { navel: lp.navel, rx: lp.rx, ry: lp.ry, ang: lp.ang, lift: lp.lift, droop: lp.droop, tone: lp.tone, color: tint, birth: lp.birth });
  });

  const mainTop = layout === 'low'
    ? { x: -side * rng.range(0.12, 0.2) * H, y: -rng.range(0.64, 0.74) * H }
    : { x: side * rng.range(-0.1, 0.04) * H, y: -rng.range(0.8, 0.88) * H };

  // --- bud on its own stem ------------------------------------------------------------------
  {
    const top = layout === 'low' ? { x: mainTop.x + side * rng.range(0.12, 0.2) * H, y: -rng.range(0.76, 0.84) * H } : layout === 'pair' ? { x: mainTop.x + side * rng.range(0.1, 0.16) * H, y: -rng.range(0.68, 0.75) * H } : { x: mainTop.x - side * rng.range(0.09, 0.16) * H, y: -rng.range(0.62, 0.72) * H };
    const b0 = { x: baseX(), y: 0 };
    const st = makeStem(b0, top, rng.range(-0.05, 0.05), rng);
    paintStem(c, { ...st, w: 2.4 * u, birth0: 0.36, birth1: 0.46 }, stemTone, true);
    const q = along(st.path, st.L, 1);
    bud(c, { x: q.p.x - q.d.x * 1 * u, y: q.p.y - q.d.y * 1 * u }, Math.atan2(q.d.y, q.d.x) + rng.range(-0.15, 0.15), H * rng.range(0.1, 0.12), 0.47);
  }

  // --- the flower(s) ------------------------------------------------------------------------
  const flowerAt = (top: V, R: number, birth0: number, birthA: number, birthB: number, face: number) => {
    const b0 = { x: baseX(), y: 0 };
    const st = makeStem(b0, top, rng.range(-0.05, 0.05), rng);
    paintStem(c, { ...st, w: 2.6 * u, birth0, birth1: birthA - 0.01 }, stemTone, true);
    const q = along(st.path, st.L, 1);
    flower(c, {
      c: { x: q.p.x, y: q.p.y }, R, face,
      roll: clamp(Math.atan2(q.d.x, -q.d.y) * 0.8 + rng.range(-0.15, 0.15), -0.4, 0.4), birthA, birthB, tone: rng.range(0.2, 0.27),
    });
  };
  flowerAt(mainTop, H * rng.range(0.15, 0.18), 0.44, 0.57, 0.72, rad(rng.range(42, 60)));
  {
    if (layout === 'pair') flowerAt({ x: -side * rng.range(0.16, 0.24) * H, y: -rng.range(0.52, 0.6) * H }, H * rng.range(0.12, 0.14), 0.5, 0.62, 0.8, rad(rng.range(62, 80)));
  }

  // --- reeds at the water line (some seeds) ---------------------------------------------------
  if (rng.chance(0.55)) {
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const b0 = { x: -side * rng.range(0.04, 0.12) * H + i * 3 * u, y: 0 };
      const hgt = H * rng.range(0.16, 0.34);
      const lean = -side * rng.range(0.05, 0.4);
      const top = { x: b0.x + lean * hgt, y: -hgt };
      const st = makeStem(b0, top, rng.range(-0.1, 0.1), rng);
      add(c, 'brush', brushPts(subPath(st.path, st.L, 0, 1, 12), 2.4 * u, 1.2 * u, 1.1, 0.05), rng.range(0.35, 0.55), 0.06 + i * 0.02, { wet: 0.3, dryness: 0.4 });
    }
  }

  return finish(c, H);
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
