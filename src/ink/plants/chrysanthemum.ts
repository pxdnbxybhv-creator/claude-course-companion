// 菊 Chrysanthemum — in the manner of 吴昌硕 / 齐白石: one to three slightly bowed stems with
// dark joints, lobed leaves pressed on with a loaded side-brush (浓/淡 blots, veins hooked in
// burnt ink while wet), and heads of many narrow curling petals in gamboge — inner petals
// cupped over the heart, outer petals drooping, never a perfect disc. Some seeds paint the
// petals in outline (勾勒, ink line over a pale wash) instead.
//
// Heads are modelled in 3-D (petal ribbons curling off a tilted receptacle) and projected,
// so a head seen from above, from the side, or as a closed bud all come from the same code.
import type { Drawing, PlantSpec, Stroke, StrokeKind, StrokePoint } from '../types';
import { PIGMENTS } from '../types';
import { makeRng, makeNoise2, clamp, lerp } from '../../core/rng';
import type { Rng, Noise2 } from '../../core/rng';

interface V { x: number; y: number }
type V3 = [number, number, number];

const TAU = Math.PI * 2;
const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------------------------
// Small geometry helpers

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

/** Point and unit tangent at arc fraction t along a polyline. */
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

/** Sub-path between arc fractions t0..t1, resampled to n points. */
function subPath(p: V[], L: number[], t0: number, t1: number, n: number): V[] {
  const out: V[] = [];
  for (let i = 0; i < n; i++) out.push(along(p, L, lerp(t0, t1, i / (n - 1))).p);
  return out;
}

const rot = (v: V, a: number): V => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/** A noisy ellipse-ish blot outline. `tip` > 0 pulls the +x end into a soft point. */
function blot(c: V, rx: number, ry: number, ang: number, noise: Noise2, nseed: number, n = 20, rough = 0.14, tip = 0): V[] {
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const nz = noise(Math.cos(a) * 1.3 + nseed, Math.sin(a) * 1.3 + nseed * 0.7);
    let r = 1 + rough * nz * 2;
    const ca = Math.cos(a);
    if (tip > 0 && ca > 0) r *= 1 + tip * Math.pow(ca, 6);
    const lx = ca * rx * r, ly = Math.sin(a) * ry * r * (tip > 0 ? 1 - 0.25 * tip * Math.max(0, ca) : 1);
    const q = rot({ x: lx, y: ly }, ang);
    out.push({ x: c.x + q.x, y: c.y + q.y });
  }
  return out;
}

function pointInPoly(x: number, y: number, poly: V[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------------------------

interface Ctx {
  rng: Rng;
  noise: Noise2;
  u: number; // unit: 1 at height 320
  strokes: Stroke[];
}

function add(c: Ctx, kind: StrokeKind, pts: StrokePoint[], tone: number, birth: number, extra: Partial<Stroke> = {}) {
  c.strokes.push({ kind, pts, tone: clamp(tone, 0.04, 1), birth: clamp(birth, 0, 1), seed: c.rng.int(1, 0x7ffffffe), ...extra });
}

const poly = (vs: V[], soft: number): StrokePoint[] => vs.map((v, i) => ({ x: v.x, y: v.y, w: i === 0 ? soft : 0 }));

/** Width profile for a wet stroke: a pressed start (起笔), a body, and a lifted end (收笔). */
function brushPts(path: V[], w0: number, w1: number, press = 1.15, endTaper = 0.25): StrokePoint[] {
  const n = path.length;
  return path.map((v, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    let w = lerp(w0, w1, t);
    if (t < 0.12) w *= lerp(0.55, press, t / 0.12);
    else if (t < 0.25) w *= lerp(press, 1, (t - 0.12) / 0.13);
    if (t > 0.8) w *= lerp(1, endTaper, (t - 0.8) / 0.2);
    return { x: v.x, y: v.y, w };
  });
}

// ---------------------------------------------------------------------------------------------
// Leaves 菊叶

interface LeafOpts {
  base: V; dir: number; len: number; tone: number; birth: number; squash: number; side: number; droop: number;
}

function leaf(c: Ctx, o: LeafOpts) {
  const { rng, noise, u } = c;
  const L = o.len;
  // The midrib: from the node outward, sagging under its own weight.
  const d = { x: Math.cos(o.dir), y: Math.sin(o.dir) };
  const nrm = { x: -d.y, y: d.x };
  const sag = o.droop * L;
  const mid = (t: number): V => {
    const along = t * L;
    const bend = sag * t * t;
    return { x: o.base.x + d.x * along + nrm.x * bend * o.side, y: o.base.y + d.y * along + nrm.y * bend * o.side + bend * 0.35 };
  };
  const pet = 0.18; // petiole fraction
  const b = o.birth;
  // Petiole: a short dark twig from the stem.
  add(c, 'brush', brushPts([mid(0), mid(pet * 0.5), mid(pet + 0.04)], 2.2 * u, 1.6 * u, 1.1, 0.6), clamp(o.tone + 0.08, 0.5, 0.92), b, { wet: 0.4 });

  const wsc = o.squash; // foreshortening across the leaf
  const midAng = (t: number) => {
    const a = mid(t), bb = mid(Math.min(1, t + 0.02));
    return Math.atan2(bb.y - a.y, bb.x - a.x);
  };
  // Body wash: pale underlayer that ties the lobes together.
  const bodyC = mid(0.56);
  const tones = (dt: number) => clamp(o.tone + dt + rng.range(-0.06, 0.06), 0.18, 0.95);
  add(c, 'wash', poly(blot(bodyC, L * 0.4, L * 0.2 * wsc, midAng(0.56), noise, rng.range(0, 99), 18, 0.12, 0.35), 2.5 * u), tones(-0.18), b + 0.004, { wet: 0.75 });

  // Lobes: side-brush dabs, pressed from the midrib outward. 3–5 per leaf, not symmetric.
  const lobes: { t: number; s: number; len: number; wid: number; ang: number }[] = [];
  lobes.push({ t: 0.62, s: 0, len: 0.42, wid: 0.3, ang: 0 }); // terminal lobe
  const pairs = rng.chance(0.6) ? [0.42, 0.66] : [0.48];
  for (const t of pairs) {
    for (const s of [-1, 1]) {
      if (rng.chance(0.18)) continue;
      lobes.push({ t, s, len: rng.range(0.26, 0.36), wid: rng.range(0.2, 0.27), ang: s * rng.range(0.55, 0.95) });
    }
  }
  lobes.push({ t: 0.3, s: rng.chance(0.5) ? -1 : 1, len: 0.22, wid: 0.17, ang: 0 });
  lobes[lobes.length - 1].ang = lobes[lobes.length - 1].s * 1.0;
  const tipPts: V[] = [];
  lobes.forEach((lb, k) => {
    const start = mid(lb.t - (lb.s === 0 ? 0.2 : 0.02));
    const a0 = midAng(lb.t) + lb.ang;
    const dd = { x: Math.cos(a0), y: Math.sin(a0) };
    // foreshorten the lateral component
    const ln = L * lb.len;
    const pts: V[] = [];
    const lat = { x: -Math.sin(midAng(lb.t)), y: Math.cos(midAng(lb.t)) };
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      let px = start.x + dd.x * ln * t, py = start.y + dd.y * ln * t;
      // squash towards the midrib line
      const offx = px - mid(lb.t).x, offy = py - mid(lb.t).y;
      const latC = offx * lat.x + offy * lat.y;
      px -= lat.x * latC * (1 - wsc);
      py -= lat.y * latC * (1 - wsc);
      pts.push({ x: px, y: py });
    }
    tipPts.push(pts[pts.length - 1]);
    const W = L * lb.wid * lerp(0.75, 1, wsc);
    const sp: StrokePoint[] = pts.map((p, i) => {
      const t = i / 4;
      const w = W * (t < 0.3 ? lerp(0.6, 1, t / 0.3) : t < 0.7 ? 1 : lerp(1, 0.55, (t - 0.7) / 0.3));
      return { ...p, w };
    });
    add(c, 'brush', sp, tones(k === 0 ? 0.04 : rng.range(-0.1, 0.08)), b + 0.006 + k * 0.002, { wet: 0.85, dryness: 0.15 });
  });

  // Veins 勾筋: burnt-ink hooks laid in while the lobes are wet.
  const vt = clamp(Math.max(o.tone + 0.25, 0.82), 0, 0.97);
  const vb = b + 0.018;
  const rib: V[] = [];
  for (let i = 0; i <= 6; i++) rib.push(mid(lerp(pet * 0.9, 0.86, i / 6)));
  add(c, 'line', rib.map((p, i) => ({ ...p, w: lerp(1.25, 0.55, i / 6) * u })), vt, vb, { wet: 0.45 });
  lobes.forEach((lb, k) => {
    if (lb.s === 0 || rng.chance(0.25)) return;
    const s0 = mid(lb.t - 0.06);
    const e = tipPts[k];
    const m = { x: lerp(s0.x, e.x, 0.5) + rng.range(-1, 1) * u, y: lerp(s0.y, e.y, 0.5) + rng.range(-1, 1) * u };
    const e2 = { x: lerp(s0.x, e.x, 0.78), y: lerp(s0.y, e.y, 0.78) };
    add(c, 'line', [{ ...s0, w: 1.0 * u }, { ...m, w: 0.8 * u }, { ...e2, w: 0.45 * u }], vt, vb + 0.001, { wet: 0.45 });
  });
}

// ---------------------------------------------------------------------------------------------
// Flower heads 菊花

interface HeadOpts {
  c: V;           // receptacle centre (screen)
  R: number;      // outer petal length
  face: number;   // how far the face turns up from the viewer, radians (0 = facing us, π/2 = facing sky)
  roll: number;   // lean of the head's axis in the picture plane
  palette: 'gamboge' | 'ochre' | 'rouge' | 'white';
  outline: boolean;
  birth: number;  // when the heart (bud) appears
  open: number;   // when the head is fully open (≤ 1)
  bud: boolean;   // a closed bud only
  stemDir: V;     // direction the stem arrives from (for the calyx)
}

interface Petal { poly: V[]; spine: V[]; z: number; ring: number; width: number }

function project(p: V3, face: number, roll: number): V3 {
  // tilt about x: the axis (0,0,1) turns towards +y (up) by `face`
  const cf = Math.cos(face), sf = Math.sin(face);
  const y1 = p[1] * cf + p[2] * sf;
  const z1 = -p[1] * sf + p[2] * cf;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const x2 = p[0] * cr - y1 * sr;
  const y2 = p[0] * sr + y1 * cr;
  return [x2, y2, z1];
}

function makePetal(o: HeadOpts, phi: number, r0: number, len: number, a0: number, curl: number, wmax: number, ring: number, jitter: number, rng: Rng): Petal {
  const N = 7;
  let pos: V3 = [Math.cos(phi) * r0, Math.sin(phi) * r0, ring === 0 ? 0.06 * o.R : 0];
  const spine3: V3[] = [pos];
  const ds = len / (N - 1);
  const wob = rng.range(-1, 1) * jitter;
  for (let i = 1; i < N; i++) {
    const t = i / (N - 1);
    const a = a0 + curl * t * t + wob * t;
    const ph = phi + wob * 0.25 * t;
    pos = [pos[0] + Math.cos(a) * Math.cos(ph) * ds, pos[1] + Math.cos(a) * Math.sin(ph) * ds, pos[2] + Math.sin(a) * ds];
    spine3.push(pos);
  }
  const tang: V3 = [-Math.sin(phi), Math.cos(phi), 0];
  const tp = project(tang, o.face, o.roll);
  const sp = spine3.map((p) => project(p, o.face, o.roll));
  const spine: V[] = sp.map((p) => ({ x: o.c.x + p[0], y: o.c.y - p[1] }));
  const L: V[] = [], Rr: V[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(N - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    // how much of the ribbon's width faces us
    const f = clamp(Math.abs(tp[0] * nx - tp[1] * ny), 0.35, 1);
    // narrow at the heart, widest two-thirds out, a blunt rounded tip
    const prof = t < 0.7 ? lerp(0.25, 1, Math.pow(t / 0.7, 0.8)) : lerp(1, 0.55, (t - 0.7) / 0.3);
    const h = (wmax * prof * f) / 2;
    L.push({ x: spine[i].x + nx * h, y: spine[i].y + ny * h });
    Rr.push({ x: spine[i].x - nx * h, y: spine[i].y - ny * h });
  }
  // rounded tip
  const e = spine[N - 1], pe = spine[N - 2];
  const dl = Math.hypot(e.x - pe.x, e.y - pe.y) || 1;
  const tipV = { x: e.x + ((e.x - pe.x) / dl) * wmax * 0.28, y: e.y + ((e.y - pe.y) / dl) * wmax * 0.28 };
  const polyV = [...L, tipV, ...Rr.reverse()];
  const z = sp.reduce((s, p) => s + p[2], 0) / N;
  return { poly: polyV, spine, z, ring, width: wmax };
}

function head(c: Ctx, o: HeadOpts) {
  const { rng, u } = c;
  const R = o.R;
  const colours = {
    gamboge: { main: PIGMENTS.gamboge, heart: PIGMENTS.ochre, tone: 0.82, heartTone: 0.6 },
    ochre: { main: PIGMENTS.ochre, heart: PIGMENTS.vermilion, tone: 0.62, heartTone: 0.5 },
    rouge: { main: PIGMENTS.rouge, heart: PIGMENTS.rouge, tone: 0.55, heartTone: 0.78 },
    white: { main: PIGMENTS.gamboge, heart: PIGMENTS.ochre, tone: 0.14, heartTone: 0.3 },
  }[o.palette];

  // Calyx: a few dark green-ink bracts cupping the head from below/behind.
  const sd = o.stemDir;
  const nb = o.bud ? rng.int(3, 4) : rng.int(2, 3);
  for (let i = 0; i < nb; i++) {
    const a = Math.atan2(-sd.y, -sd.x) + rng.range(-1.1, 1.1);
    const len = R * (o.bud ? rng.range(0.45, 0.65) : rng.range(0.25, 0.4));
    const s0 = { x: o.c.x + sd.x * R * 0.12, y: o.c.y + sd.y * R * 0.12 };
    const e = { x: s0.x + Math.cos(a) * len, y: s0.y + Math.sin(a) * len };
    const m = { x: lerp(s0.x, e.x, 0.5) + rng.range(-1, 1) * len * 0.15, y: lerp(s0.y, e.y, 0.5) + rng.range(-1, 1) * len * 0.15 };
    add(c, 'brush', brushPts([s0, m, e], R * 0.16, R * 0.08, 1.1, 0.2), rng.range(0.5, 0.72), o.birth, { wet: 0.7 });
  }

  // Rings: heart (tight, curled over), cup, open, drooping outer.
  type Ring = { n: number; r0: number; len: [number, number]; a0: [number, number]; curl: [number, number]; w: number; birth: number };
  const rings: Ring[] = o.bud
    ? [{ n: rng.int(7, 9), r0: 0.03, len: [0.3, 0.42], a0: [72, 86], curl: [35, 60], w: 0.2, birth: o.birth + 0.01 }]
    : [
      { n: rng.int(8, 11), r0: 0.02, len: [0.26, 0.4], a0: [70, 86], curl: [40, 75], w: 0.15, birth: o.birth + 0.01 },
      { n: rng.int(10, 13), r0: 0.06, len: [0.52, 0.72], a0: [44, 62], curl: [25, 50], w: 0.16, birth: lerp(o.birth, o.open, 0.45) },
      { n: rng.int(12, 15), r0: 0.1, len: [0.78, 0.98], a0: [14, 32], curl: [-15, 15], w: 0.14, birth: lerp(o.birth, o.open, 0.7) },
      { n: rng.int(9, 13), r0: 0.12, len: [0.88, 1.18], a0: [-4, 12], curl: [-95, -45], w: 0.12, birth: lerp(o.birth, o.open, 0.92) },
    ];

  const allPetals: { p: Petal; birth: number; ringIdx: number }[] = [];
  rings.forEach((rg, ri) => {
    const off = rng.range(0, TAU);
    for (let i = 0; i < rg.n; i++) {
      // wild: skip some outer petals, jitter angles and lengths
      if (ri >= 2 && rng.chance(0.12)) continue;
      const phi = off + (i / rg.n) * TAU + rng.range(-0.35, 0.35) * (TAU / rg.n);
      const len = R * rng.range(rg.len[0], rg.len[1]);
      const a0 = rad(rng.range(rg.a0[0], rg.a0[1]));
      const curl = rad(rng.range(rg.curl[0], rg.curl[1]));
      const p = makePetal(o, phi, R * rg.r0, len, a0, curl, R * rg.w * rng.range(0.8, 1.15), ri, 0.25, rng);
      allPetals.push({ p, birth: rg.birth, ringIdx: ri });
    }
  });

  // Paint order within a ring: far → near. Rings open in sequence (heart first).
  const byRing = new Map<number, typeof allPetals>();
  for (const ap of allPetals) {
    if (!byRing.has(ap.ringIdx)) byRing.set(ap.ringIdx, []);
    byRing.get(ap.ringIdx)!.push(ap);
  }
  const zs = allPetals.map((a) => a.p.z);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  for (const [ri, list] of [...byRing.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.p.z - b.p.z);
    list.forEach((ap, k) => {
      const depth = (ap.p.z - zmin) / (zmax - zmin || 1);
      const heart = ri === 0 && !o.bud;
      const col = heart ? colours.heart : colours.main;
      let tone = (heart ? colours.heartTone : colours.tone) * rng.range(0.85, 1.08);
      if (o.palette !== 'white') tone *= lerp(0.88, 1.04, depth);
      const b = ap.birth + k * 0.0004;
      if (o.outline) {
        add(c, 'fill', poly(ap.p.poly, 0.8 * u), heart ? 0.3 : tone, b, { color: col, wet: 0.3 });
      } else {
        add(c, 'fill', poly(ap.p.poly, 0.9 * u), tone, b, { color: col, wet: 0.35 });
      }
    });
  }

  // 勾勒: ink outlines, hidden where a nearer petal covers them.
  if (o.outline) {
    for (const ap of allPetals) {
      const pl = ap.p.poly;
      const nearer = allPetals.filter((q) => q !== ap && (q.p.z > ap.p.z || q.ringIdx > ap.ringIdx + 1));
      const n = pl.length;
      let run: StrokePoint[] = [];
      const flush = () => {
        if (run.length >= 3) add(c, 'line', run, 0.72, ap.birth + 0.003, { wet: 0.2 });
        run = [];
      };
      for (let i = 0; i <= n; i++) {
        const a = pl[i % n];
        // subdivide each edge once for finer hiding
        const bpt = pl[(i + 1) % n];
        for (const t of i < n ? [0, 0.5] : [0]) {
          const x = lerp(a.x, bpt.x, t), y = lerp(a.y, bpt.y, t);
          const hidden = nearer.some((q) => pointInPoly(x, y, q.p.poly));
          if (hidden) flush();
          else run.push({ x, y, w: 0.85 * u });
        }
      }
      flush();
    }
  }

  // The heart: a few dark dots where the curled petals crowd.
  if (!o.bud) {
    const nd = rng.int(2, 4);
    for (let i = 0; i < nd; i++) {
      const p3 = project([rng.range(-1, 1) * R * 0.08, rng.range(-1, 1) * R * 0.08, R * 0.2], o.face, o.roll);
      add(c, 'dot', [{ x: o.c.x + p3[0], y: o.c.y - p3[1], w: R * rng.range(0.05, 0.09) }], rng.range(0.55, 0.8), o.birth + 0.012, { color: o.palette === 'white' ? undefined : PIGMENTS.ochre });
    }
  }
}

// ---------------------------------------------------------------------------------------------

interface StemPlan { base: V; top: V; path: V[]; L: number[]; h: number; nodes: number[]; head: 'open' | 'bud' | 'side'; birth0: number; birth1: number }

export function chrysanthemum(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 7919 + 17);
  const noise = makeNoise2(spec.seed + 101);
  const H = spec.height;
  const u = H / 320;
  const c: Ctx = { rng, noise, u, strokes: [] };

  // --- Composition ------------------------------------------------------------------------
  const nStems = rng.pick([1, 2, 2, 2, 3, 3]);
  const lean = (rng.chance(0.5) ? -1 : 1) * rng.range(0.08, 0.2); // whole plant leans one way
  const outline = rng.chance(0.3);
  const stems: StemPlan[] = [];
  const kinds: ('open' | 'bud' | 'side')[] = nStems === 1 ? ['open'] : nStems === 2 ? ['open', rng.pick(['bud', 'side', 'open'] as const)] : ['open', rng.pick(['side', 'open'] as const), 'bud'];
  for (let s = 0; s < nStems; s++) {
    const main = s === 0;
    const h = H * (main ? rng.range(0.78, 0.86) : rng.range(0.42, 0.7));
    const myLean = main ? lean : lean * rng.range(-0.6, 1.8) + (s === 1 ? -1 : 1) * rng.range(0.05, 0.18) * Math.sign(lean || 1) * (s === 1 ? 1 : -1);
    const base = { x: (s === 0 ? 0 : rng.range(-4, 4)) * u + (s - (nStems - 1) / 2) * 3 * u, y: 0 };
    const bow = rng.range(-0.06, 0.06) * h;
    const nod = rng.range(0.02, 0.06) * h * Math.sign(myLean || 1);
    const ctrl: V[] = [
      base,
      { x: base.x + myLean * h * 0.2 + bow * 0.6, y: -h * 0.3 },
      { x: base.x + myLean * h * 0.55 + bow, y: -h * 0.62 },
      { x: base.x + myLean * h * 0.85 + bow * 0.5 + nod * 0.4, y: -h * 0.88 },
      { x: base.x + myLean * h + nod, y: -h },
    ];
    const path = catmull(ctrl, 10);
    const L = arcLengths(path);
    const nNodes = rng.int(4, 6);
    const nodes: number[] = [];
    for (let i = 0; i < nNodes; i++) nodes.push(clamp(lerp(0.1, 0.9, (i + rng.range(0.1, 0.9)) / nNodes), 0.06, 0.94));
    const birth0 = main ? 0 : rng.range(0.1, 0.2);
    const birth1 = main ? rng.range(0.36, 0.4) : rng.range(0.4, 0.46);
    stems.push({ base, top: path[path.length - 1], path, L, h, nodes, head: kinds[s], birth0, birth1 });
  }

  // --- Stems, jointed ------------------------------------------------------------------------
  const stemTone = rng.range(0.42, 0.55);
  stems.forEach((st, si) => {
    const cuts = [0, ...st.nodes, 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const t0 = cuts[k], t1 = cuts[k + 1];
      const seg = subPath(st.path, st.L, t0 + (k ? 0.006 : 0), t1, 6);
      const wBase = lerp(3.4, 1.9, t0) * u * (si === 0 ? 1 : 0.85);
      const wEnd = lerp(3.4, 1.9, t1) * u * (si === 0 ? 1 : 0.85);
      const b = lerp(st.birth0, st.birth1, t0);
      add(c, 'brush', brushPts(seg, wBase, wEnd * 0.92, 1.25, 0.7), stemTone + rng.range(-0.05, 0.08), b, { wet: 0.5, dryness: 0.25 });
      // joint: a small dark knot at the node
      if (k > 0 && rng.chance(0.7)) {
        const q = along(st.path, st.L, t0);
        const nn = { x: -q.d.y, y: q.d.x };
        const s = rng.chance(0.5) ? 1 : -1;
        add(c, 'brush', [
          { x: q.p.x - nn.x * s * 1.6 * u, y: q.p.y - nn.y * s * 1.6 * u, w: 1.2 * u },
          { x: q.p.x + nn.x * s * 1.2 * u + q.d.x * 1.5 * u, y: q.p.y + nn.y * s * 1.2 * u + q.d.y * 1.5 * u, w: 2.3 * u },
          { x: q.p.x + nn.x * s * 2.6 * u + q.d.x * 2.4 * u, y: q.p.y + nn.y * s * 2.6 * u + q.d.y * 2.4 * u, w: 0.8 * u },
        ], rng.range(0.82, 0.95), b + 0.004, { wet: 0.3 });
      }
    }
  });

  // --- Leaves -------------------------------------------------------------------------------
  const leafSpots: { st: StemPlan; t: number; side: number; big: number }[] = [];
  stems.forEach((st, si) => {
    let side = rng.chance(0.5) ? 1 : -1;
    st.nodes.forEach((t, k) => {
      if (si > 0 && t < 0.3 && rng.chance(0.6)) return;
      leafSpots.push({ st, t, side, big: k });
      side = -side;
      // extra leaf on the other side, sometimes, near the top
      if (t > 0.55 && rng.chance(0.35)) leafSpots.push({ st, t: t + 0.03, side, big: k });
    });
    // a cluster right under the head
    if (st.head !== 'bud') leafSpots.push({ st, t: rng.range(0.9, 0.95), side: rng.chance(0.5) ? 1 : -1, big: 9 });
  });
  // sprout leaves: at the very base, first strokes of the painting
  const main = stems[0];
  for (const s of [-1, 1]) leafSpots.push({ st: main, t: s < 0 ? 0.03 : 0.05, side: s, big: -1 });

  for (const ls of leafSpots) {
    const q = along(ls.st.path, ls.st.L, ls.t);
    const up = Math.atan2(q.d.y, q.d.x); // stem tangent (pointing up the stem)
    const lowness = 1 - ls.t;
    // lower leaves spread and droop; upper leaves reach up
    const spread = rad(lerp(40, 80, lowness) + rng.range(-12, 12));
    const dir = up + ls.side * spread;
    const size = ls.big < 0 ? 0.09 : ls.t > 0.85 ? rng.range(0.11, 0.15) : lerp(0.12, 0.17, Math.sin(Math.PI * ls.t)) * rng.range(0.85, 1.15);
    const dark = rng.chance(ls.t > 0.8 ? 0.65 : 0.45);
    const tone = dark ? rng.range(0.72, 0.86) : rng.range(0.38, 0.52);
    const birth = ls.big < 0 ? (ls.side < 0 ? 0.012 : 0.03) : lerp(ls.st.birth0, ls.st.birth1, ls.t) + rng.range(0.02, 0.06);
    leaf(c, {
      base: q.p, dir, len: H * size, tone, birth, squash: rng.range(0.55, 1), side: ls.side,
      droop: lerp(0.05, 0.35, lowness) * rng.range(0.6, 1.3),
    });
  }

  // --- Heads ---------------------------------------------------------------------------------
  const palettes: HeadOpts['palette'][] = [];
  for (let i = 0; i < stems.length; i++) {
    if (outline) palettes.push('white');
    else palettes.push(i === 0 ? (rng.chance(0.8) ? 'gamboge' : 'ochre') : rng.pick(['gamboge', 'gamboge', 'ochre', 'rouge'] as const));
  }
  let openIdx = 0;
  stems.forEach((st, si) => {
    const q = along(st.path, st.L, 1);
    const Rmain = H * rng.range(0.15, 0.18);
    const kind = st.head;
    const R = kind === 'bud' ? H * rng.range(0.05, 0.065) : si === 0 ? Rmain : H * rng.range(0.12, 0.15);
    const face = kind === 'side' ? rad(rng.range(78, 92)) : kind === 'bud' ? rad(rng.range(60, 90)) : rad(rng.range(35, 60));
    // heads lean with their stem, and nod a little
    const roll = clamp(Math.atan2(q.d.x, -q.d.y) * 0.8 + rng.range(-0.25, 0.25), -0.7, 0.7);
    const b0 = st.birth1 + 0.02;
    const open = kind === 'bud' ? b0 : Math.min(1, 0.72 + openIdx * 0.1 + rng.range(0, 0.05));
    if (kind !== 'bud') openIdx++;
    // the receptacle sits just past the stem tip
    const cpos = { x: q.p.x + q.d.x * R * 0.1, y: q.p.y + q.d.y * R * 0.1 };
    head(c, {
      c: cpos, R, face, roll, palette: palettes[si], outline: outline && kind !== 'bud', bud: kind === 'bud',
      birth: kind === 'bud' ? 0.5 : Math.max(b0, 0.46 + si * 0.03), open, stemDir: { x: -q.d.x, y: -q.d.y },
    });
  });

  return finish(c, H);
}

function finish(c: Ctx, H: number): Drawing {
  const strokes = c.strokes.map((s, i) => ({ s, i })).sort((a, b) => a.s.birth - b.s.birth || a.i - b.i).map((x) => x.s);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const poly = s.kind === 'wash' || s.kind === 'fill';
    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i];
      const r = poly ? (s.pts[0].w || 0) : p.w / 2;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
      y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
  }
  const m = Math.max(4, H * 0.025);
  const dx = m - x0, dy = m - y0;
  for (const s of strokes) for (const p of s.pts) { p.x += dx; p.y += dy; }
  return { width: Math.ceil(x1 - x0 + 2 * m), height: Math.ceil(Math.max(y1, 0) - y0 + 2 * m), anchor: { x: dx, y: dy }, strokes };
}
