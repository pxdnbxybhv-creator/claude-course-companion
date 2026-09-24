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

/** Closed Catmull-Rom through a loop of points. */
function catmullClosed(ctrl: V[], perSeg: number): V[] {
  const n = ctrl.length, out: V[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

/**
 * 菊叶: one wet wash in a lobed, notched silhouette (a terminal lobe and one or two pairs of
 * side lobes, never quite symmetric), a darker wet-in-wet pool near the base that fades out,
 * then crisp burnt-ink veins (勾筋) hooked in over it — midrib and one vein into each lobe.
 */
function leaf(c: Ctx, o: LeafOpts) {
  const { rng, u } = c;
  const L = o.len;
  const d = { x: Math.cos(o.dir), y: Math.sin(o.dir) };
  const nrm = { x: -d.y, y: d.x };
  const sag = o.droop * L;
  // leaf-local (x along the midrib 0..L, y across) → drawing space, following the sagging midrib
  const mid = (x: number): V => {
    const t = x / L, bend = sag * t * t;
    return { x: o.base.x + d.x * x + nrm.x * bend * o.side, y: o.base.y + d.y * x + nrm.y * bend * o.side + bend * 0.35 };
  };
  const at = (x: number, y: number): V => {
    const p = mid(x), q = mid(Math.min(L, x + L * 0.02)), r = mid(Math.max(0, x - L * 0.02));
    const tx = q.x - r.x, ty = q.y - r.y, tl = Math.hypot(tx, ty) || 1;
    const yy = y * o.squash;
    return { x: p.x - (ty / tl) * yy, y: p.y + (tx / tl) * yy };
  };
  const pet = L * 0.16; // petiole length; the blade starts here
  const B = L - pet;    // blade length
  const X = (f: number) => pet + f * B;

  // --- silhouette -------------------------------------------------------------------------
  const pairs = rng.chance(0.65) ? 2 : 1;
  const lobeAt = pairs === 2 ? [0.3, 0.6] : [0.48];
  const lobeExt = pairs === 2 ? [0.4, 0.46] : [0.48];
  const tips: { s: number; a: number; e: number }[] = [];
  const sideLobes = (s: number): V[] => {
    const pts: V[] = [];
    // cuneate base
    pts.push({ x: X(0.03), y: s * B * 0.1 });
    lobeAt.forEach((a0, k) => {
      const a = a0 + rng.range(-0.04, 0.04);
      const e = B * lobeExt[k] * rng.range(0.82, 1.12) * (rng.chance(0.12) ? 0.6 : 1);
      pts.push({ x: X(a - 0.13), y: s * e * rng.range(0.42, 0.56) });  // sinus (notch)
      pts.push({ x: X(a - 0.07), y: s * e * 0.92 });                    // inner shoulder
      pts.push({ x: X(a + 0.05), y: s * e });                           // lobe tip, leaning forward
      tips.push({ s, a, e });
      pts.push({ x: X(a + 0.12), y: s * e * 0.8 });                     // outer shoulder
    });
    const last = lobeAt[lobeAt.length - 1];
    pts.push({ x: X(last + 0.19), y: s * B * rng.range(0.16, 0.2) });  // notch below the terminal lobe
    pts.push({ x: X(0.85), y: s * B * rng.range(0.22, 0.27) });        // terminal lobe shoulder
    return pts;
  };
  const left = sideLobes(-1), right = sideLobes(1);
  const loop: V[] = [{ x: pet, y: 0 }, ...left, { x: X(1.0), y: rng.range(-0.03, 0.03) * B }, ...right.reverse()];
  const outline = catmullClosed(loop.map((p) => at(p.x, p.y)), 4);

  const b = o.birth;
  // petiole: a short twig from the stem
  add(c, 'brush', brushPts([mid(0), mid(pet * 0.5), mid(pet * 1.15)], 2 * u, 1.5 * u, 1.1, 0.6), clamp(o.tone + 0.25, 0.55, 0.85), b, { wet: 0.35 });
  // the blade: one wet wash
  add(c, 'wash', poly(outline, 2.2 * u), o.tone, b + 0.0005, { wet: 0.75 });
  // wet-in-wet: a darker pool near the base, fading out into the blade
  {
    const cx = rng.range(0.22, 0.38), sy = rng.range(-0.06, 0.06) * B;
    const pool: V[] = [];
    const rx = B * rng.range(0.22, 0.3), ry = B * rng.range(0.16, 0.22);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const r = 1 + 0.18 * c.noise(Math.cos(a) * 1.4 + b * 50, Math.sin(a) * 1.4);
      pool.push(at(X(cx) + Math.cos(a) * rx * r, sy + Math.sin(a) * ry * r));
    }
    add(c, 'wash', poly(pool, 4.5 * u), clamp(o.tone * 0.55 + 0.1, 0.18, 0.5), b + 0.001, { wet: 0.9 });
  }
  // 勾筋: crisp veins over the damp blade
  const vt = clamp(o.tone + 0.45, 0.78, 0.94);
  const vb = b + 0.002;
  const rib: StrokePoint[] = [];
  for (let i = 0; i <= 6; i++) rib.push({ ...at(lerp(pet * 0.9, X(0.8), i / 6), 0), w: lerp(1.15, 0.45, i / 6) * u });
  add(c, 'line', rib, vt, vb, { wet: 0.25 });
  for (const tp of tips) {
    if (rng.chance(0.15)) continue;
    // from the midrib into the lobe, stopping well short of the damp edge
    // left and right veins leave the midrib at different points, and arc gently outward
    const x0 = X(tp.a - 0.12 + (tp.s < 0 ? 0 : rng.range(0.03, 0.06))), x1 = X(tp.a + 0.03);
    const ext = tp.e * rng.range(0.6, 0.7);
    const pts: StrokePoint[] = [
      { ...at(x0, 0), w: 0.95 * u },
      { ...at(lerp(x0, x1, 0.35), tp.s * ext * 0.45), w: 0.8 * u },
      { ...at(lerp(x0, x1, 0.72), tp.s * ext * 0.8), w: 0.6 * u },
      { ...at(x1, tp.s * ext), w: 0.35 * u },
    ];
    add(c, 'line', pts, vt, vb + 0.0001, { wet: 0.25 });
  }
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

function makePetal(o: HeadOpts, phi: number, r0: number, len: number, a0: number, curl: number, wmax: number, ring: number, jitter: number, rng: Rng, swirl = 0): Petal {
  const N = 7;
  let pos: V3 = [Math.cos(phi) * r0, Math.sin(phi) * r0, [0.12, 0.08, 0.03, 0][ring] * o.R];
  const spine3: V3[] = [pos];
  const ds = len / (N - 1);
  const wob = rng.range(-1, 1) * jitter;
  for (let i = 1; i < N; i++) {
    const t = i / (N - 1);
    const a = a0 + curl * t * t + wob * t;
    const ph = phi + wob * 0.25 * t + swirl * Math.pow(t, 1.5);
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
    const prof = t < 0.65 ? lerp(0.18, 1, Math.pow(t / 0.65, 0.9)) : lerp(1, 0.72, (t - 0.65) / 0.35);
    const h = (wmax * prof * f) / 2;
    L.push({ x: spine[i].x + nx * h, y: spine[i].y + ny * h });
    Rr.push({ x: spine[i].x - nx * h, y: spine[i].y - ny * h });
  }
  // rounded tip
  const e = spine[N - 1], pe = spine[N - 2];
  const dl = Math.hypot(e.x - pe.x, e.y - pe.y) || 1;
  const ex = (e.x - pe.x) / dl, ey = (e.y - pe.y) / dl;
  const lt = L[N - 1], rt = Rr[N - 1];
  const tipV = [
    { x: lerp(lt.x, e.x, 0.35) + ex * wmax * 0.22, y: lerp(lt.y, e.y, 0.35) + ey * wmax * 0.22 },
    { x: e.x + ex * wmax * 0.3, y: e.y + ey * wmax * 0.3 },
    { x: lerp(rt.x, e.x, 0.35) + ex * wmax * 0.22, y: lerp(rt.y, e.y, 0.35) + ey * wmax * 0.22 },
  ];
  const polyV = [...L, ...tipV, ...Rr.reverse()];
  const z = sp.reduce((s, p) => s + p[2], 0) / N;
  return { poly: polyV, spine, z, ring, width: wmax };
}

function head(c: Ctx, o: HeadOpts) {
  const { rng, u } = c;
  const R = o.R;
  const colours = {
    gamboge: { main: PIGMENTS.gamboge, heart: PIGMENTS.gamboge, tone: 0.82, heartTone: 0.95 },
    ochre: { main: PIGMENTS.ochre, heart: PIGMENTS.ochre, tone: 0.62, heartTone: 0.78 },
    rouge: { main: PIGMENTS.rouge, heart: PIGMENTS.rouge, tone: 0.55, heartTone: 0.78 },
    white: { main: PIGMENTS.gamboge, heart: PIGMENTS.ochre, tone: 0.14, heartTone: 0.3 },
  }[o.palette];

  // Calyx: a few dark green-ink bracts cupping the head from below/behind.
  const sd = o.stemDir;
  const nb = o.bud ? rng.int(3, 4) : 2;
  for (let i = 0; i < nb; i++) {
    const a = Math.atan2(-sd.y, -sd.x) + rng.range(-1.1, 1.1);
    const len = R * (o.bud ? rng.range(0.45, 0.65) : rng.range(0.16, 0.24));
    const s0 = { x: o.c.x + sd.x * R * 0.12, y: o.c.y + sd.y * R * 0.12 };
    const e = { x: s0.x + Math.cos(a) * len, y: s0.y + Math.sin(a) * len };
    const m = { x: lerp(s0.x, e.x, 0.5) + rng.range(-1, 1) * len * 0.15, y: lerp(s0.y, e.y, 0.5) + rng.range(-1, 1) * len * 0.15 };
    add(c, 'brush', brushPts([s0, m, e], R * (o.bud ? 0.16 : 0.1), R * 0.06, 1.1, 0.2), rng.range(0.5, 0.72), o.birth, { wet: 0.7 });
  }

  // Rings: heart (tight, curled over), cup, open, drooping outer.
  type Ring = { n: number; r0: number; len: [number, number]; a0: [number, number]; curl: [number, number]; w: number; birth: number };
  const rings: Ring[] = o.bud
    ? [{ n: rng.int(8, 10), r0: 0.05, len: [0.6, 0.85], a0: [60, 78], curl: [40, 70], w: 0.3, birth: o.birth + 0.01 }]
    : [
      { n: rng.int(10, 13), r0: 0.03, len: [0.3, 0.44], a0: [66, 84], curl: [45, 80], w: 0.24, birth: o.birth + 0.01 },
      { n: rng.int(13, 17), r0: 0.06, len: [0.55, 0.75], a0: [40, 58], curl: [25, 50], w: 0.25, birth: lerp(o.birth, o.open, 0.45) },
      { n: rng.int(14, 18), r0: 0.1, len: [0.75, 0.95], a0: [10, 28], curl: [-25, 10], w: 0.22, birth: lerp(o.birth, o.open, 0.7) },
      { n: rng.int(7, 11), r0: 0.12, len: [0.8, 1.05], a0: [-4, 10], curl: [-95, -45], w: 0.18, birth: lerp(o.birth, o.open, 0.92) },
    ];

  const allPetals: { p: Petal; birth: number; ringIdx: number }[] = [];
  const envSeed = rng.range(0, 50);
  const headSwirl = rng.range(-0.5, 0.5);
  const env = (phi: number) => 1 + 0.22 * c.noise(Math.cos(phi) * 0.9 + envSeed, Math.sin(phi) * 0.9 + envSeed);
  rings.forEach((rg, ri) => {
    const off = rng.range(0, TAU);
    const nP = o.outline ? Math.round(rg.n * 0.8) : rg.n; // outlines are busier: fewer petals
    for (let i = 0; i < nP; i++) {
      // wild: skip some outer petals, jitter angles and lengths
      if (ri >= 2 && rng.chance(0.12)) continue;
      const phi = off + (i / nP) * TAU + rng.range(-0.35, 0.35) * (TAU / nP);
      const len = R * rng.range(rg.len[0], rg.len[1]) * (ri >= 1 ? env(phi) : 1);
      const a0 = rad(rng.range(rg.a0[0], rg.a0[1]));
      const curl = rad(rng.range(rg.curl[0], rg.curl[1]));
      const p = makePetal(o, phi, R * rg.r0, len, a0, curl, R * rg.w * rng.range(0.8, 1.15), ri, 0.25, rng, (headSwirl + rng.range(-0.25, 0.25)) * (ri / 3));
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
    list.forEach((ap) => {
      const depth = (ap.p.z - zmin) / (zmax - zmin || 1);
      const heart = ri === 0 && !o.bud;
      const col = heart ? colours.heart : colours.main;
      let tone = (heart ? colours.heartTone : colours.tone) * rng.range(0.7, 1.05);
      if (o.palette !== 'white') tone *= lerp(0.88, 1.04, depth);
      const b = ap.birth; // a ring opens as one unit; ties keep the far → near order
      if (o.outline) {
        add(c, 'fill', poly(ap.p.poly, 0.6 * u), 0.85, b, { color: PIGMENTS.white, wet: 0.1 });
        if (heart) add(c, 'fill', poly(ap.p.poly, 0.8 * u), 0.3, b, { color: col, wet: 0.3 });
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
        if (run.length >= 3) add(c, 'line', run, 0.72, ap.birth + 0.001, { wet: 0.2 });
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
    // 点心: once open, a few short curled strokes re-state the heart over the cupped petals.
    const nh = rng.int(4, 6);
    const hcol = o.palette === 'rouge' ? PIGMENTS.rouge : PIGMENTS.ochre;
    for (let i = 0; i < nh; i++) {
      const phi = (i / nh) * TAU + rng.range(-0.3, 0.3);
      const pts: StrokePoint[] = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        const r = R * lerp(0.13, 0.03, t);
        const a = phi + t * 1.2;
        const p3 = project([Math.cos(a) * r, Math.sin(a) * r, R * (0.22 + 0.1 * t)], o.face, o.roll);
        pts.push({ x: o.c.x + p3[0], y: o.c.y - p3[1], w: R * lerp(0.075, 0.03, t) });
      }
      add(c, 'brush', pts, o.palette === 'white' ? 0.35 : rng.range(0.6, 0.8), o.open + 0.001, { color: hcol, wet: 0.4 });
    }
  }
}

// ---------------------------------------------------------------------------------------------

interface StemPlan { base: V; top: V; path: V[]; L: number[]; h: number; nodes: number[]; head: 'open' | 'bud' | 'side'; birth0: number; birth1: number; branch?: boolean }

export function chrysanthemum(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 7919 + 17);
  const noise = makeNoise2(spec.seed + 101);
  const H = spec.height;
  const u = H / 320;
  const c: Ctx = { rng, noise, u, strokes: [] };

  // --- Composition ------------------------------------------------------------------------
  const nStems = rng.pick([1, 2, 2, 2, 3, 3]);
  const lean = (rng.chance(0.5) ? -1 : 1) * rng.range(0.06, 0.26); // whole plant leans one way
  const outline = rng.chance(0.3);
  const stems: StemPlan[] = [];
  const kinds: ('open' | 'bud' | 'side')[] = nStems === 1 ? ['open'] : nStems === 2 ? ['open', rng.pick(['bud', 'side', 'open'] as const)] : ['open', rng.pick(['side', 'open'] as const), 'bud'];
  // Secondary stems fan away from the main one so heads never stack or cross.
  const away = -Math.sign(lean);
  const leans = [lean, lean + away * rng.range(0.3, 0.5), lean + (rng.chance(0.5) ? away * rng.range(0.12, 0.2) : -away * rng.range(0.14, 0.24))];
  const heights = [rng.range(0.78, 0.86), rng.range(0.5, 0.68), rng.range(0.4, 0.55)];
  for (let s = 0; s < nStems; s++) {
    const main = s === 0;
    const h = H * heights[s];
    const myLean = leans[s];
    const base = { x: main ? 0 : Math.sign(myLean - lean) * rng.range(1.5, 4) * u, y: 0 };
    const bow = (main ? rng.range(-0.05, 0.05) : Math.sign(myLean - lean) * rng.range(0.02, 0.07)) * h;
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
    const nNodes = main ? rng.int(4, 5) : rng.int(3, 4);
    const nodes: number[] = [];
    // the main stem's first joint sits low, so the seedling is a short stub between leaves
    if (main) nodes.push(rng.range(0.07, 0.11));
    const lo = main ? 0.2 : 0.1;
    for (let i = 0; i < nNodes; i++) nodes.push(clamp(lerp(lo, 0.9, (i + rng.range(0.1, 0.9)) / nNodes), 0.06, 0.94));
    const birth0 = main ? 0 : rng.range(0.1, 0.2);
    const birth1 = main ? rng.range(0.36, 0.4) : rng.range(0.4, 0.46);
    stems.push({ base, top: path[path.length - 1], path, L, h, nodes, head: kinds[s], birth0, birth1 });
  }
  // A branch off the main stem carries a bud or a small head turned aside (always, for a lone stem).
  if (nStems === 1 || (nStems === 2 && rng.chance(0.4))) {
    const m = stems[0];
    const tb = rng.range(0.4, 0.55);
    const q = along(m.path, m.L, tb);
    const out = (Math.sign(lean) || 1) * (nStems === 1 ? (rng.chance(0.65) ? -1 : 1) : 1);
    const len = H * rng.range(0.2, 0.28);
    const a = Math.atan2(q.d.y, q.d.x) + out * rng.range(0.8, 1.05);
    const d = { x: Math.cos(a), y: Math.sin(a) };
    const path = catmull([
      q.p,
      { x: q.p.x + d.x * len * 0.5, y: q.p.y + d.y * len * 0.5 },
      { x: q.p.x + d.x * len * 0.9, y: q.p.y + d.y * len * 0.9 - len * 0.12 },
      { x: q.p.x + d.x * len * 1.05, y: q.p.y + d.y * len * 1.05 - len * 0.26 },
    ], 8);
    const L = arcLengths(path);
    const b0 = lerp(m.birth0, m.birth1, tb) + 0.1; // branches break out once the stem has leafed
    stems.push({ base: q.p, top: path[path.length - 1], path, L, h: len, nodes: [rng.range(0.4, 0.6)], head: nStems === 1 && rng.chance(0.6) ? 'side' : 'bud', birth0: b0, birth1: b0 + 0.08, branch: true });
  }

  // --- Stems, jointed ------------------------------------------------------------------------
  const stemTone = rng.range(0.5, 0.62);
  stems.forEach((st, si) => {
    const cuts = [0, ...st.nodes, 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const t0 = cuts[k], t1 = cuts[k + 1];
      const seg = subPath(st.path, st.L, t0 + (k ? 0.006 : 0), t1, 6);
      const wBase = lerp(4, 2.2, t0) * u * (si === 0 ? 1 : st.branch ? 0.6 : 0.85);
      const wEnd = lerp(4, 2.2, t1) * u * (si === 0 ? 1 : st.branch ? 0.6 : 0.85);
      const b = lerp(st.birth0, st.birth1, t0);
      add(c, 'brush', brushPts(seg, wBase, wEnd * 0.92, 1.25, 0.7), stemTone + rng.range(-0.05, 0.08), b, { wet: 0.5, dryness: 0.25 });
      // joint: a small dark knot at the node
      if (k > 0 && rng.chance(0.5)) {
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
  // Larger and fuller low on the stem, smaller and sparser toward the flowers.
  const leafSpots: { st: StemPlan; t: number; side: number; sprout: boolean }[] = [];
  stems.forEach((st, si) => {
    let side = rng.chance(0.5) ? 1 : -1;
    st.nodes.forEach((t) => {
      if ((si > 0 && !st.branch && t < 0.35) || (t < 0.2 && rng.chance(0.4))) return;
      if (t > 0.55 && rng.chance(lerp(0.1, 0.45, (t - 0.55) / 0.4))) { side = -side; return; }
      leafSpots.push({ st, t, side, sprout: false });
      side = -side;
    });
    // now and then a small leaf just under the head
    if (st.head !== 'bud' && rng.chance(0.45)) leafSpots.push({ st, t: rng.range(0.8, 0.88), side: rng.chance(0.5) ? 1 : -1, sprout: false });
  });
  // sprout leaves: at the very base, first strokes of the painting
  const main = stems[0];
  for (const s of [-1, 1]) leafSpots.push({ st: main, t: s < 0 ? 0.03 : 0.05, side: s, sprout: true });
  // 1–3 accent leaves in thick ink (浓); everything else stays in mid tones (淡–重)
  const accentPool = leafSpots.map((ls, i) => ({ ls, i })).filter(({ ls }) => !ls.sprout && ls.t > 0.15 && ls.t < 0.85);
  const accents = new Set<number>();
  const nAcc = Math.min(accentPool.length, rng.int(1, 3));
  while (accents.size < nAcc) accents.add(accentPool[rng.int(0, accentPool.length - 1)].i);

  leafSpots.forEach((ls, i) => {
    const q = along(ls.st.path, ls.st.L, ls.t);
    const up = Math.atan2(q.d.y, q.d.x); // stem tangent (pointing up the stem)
    const lowness = 1 - ls.t;
    // lower leaves spread and droop; upper leaves reach up
    const spread = rad(lerp(40, 80, lowness) + rng.range(-12, 12));
    const dir = up + ls.side * spread;
    const size = ls.sprout ? 0.12 : lerp(0.23, 0.12, clamp(ls.t / 0.9, 0, 1)) * rng.range(0.88, 1.12) * (ls.st.branch ? 0.85 : 1);
    const accent = accents.has(i);
    // 反叶: now and then a leaf turned edge-on, showing its paler underside
    const turned = !accent && !ls.sprout && rng.chance(0.25);
    const tone = accent ? rng.range(0.64, 0.74) : turned ? rng.range(0.24, 0.3) : rng.range(0.34, 0.55);
    const birth = ls.sprout ? (ls.side < 0 ? 0.012 : 0.03) : lerp(ls.st.birth0, ls.st.birth1, ls.t) + rng.range(0.015, 0.045);
    leaf(c, {
      base: q.p, dir, len: H * size, tone, birth, squash: turned ? rng.range(0.35, 0.5) : rng.range(0.7, 1), side: ls.side,
      droop: lerp(0.05, 0.35, lowness) * rng.range(0.6, 1.3),
    });
  });

  // --- Heads ---------------------------------------------------------------------------------
  const palettes: HeadOpts['palette'][] = [];
  for (let i = 0; i < stems.length; i++) {
    if (outline) palettes.push('white');
    else if (i > 0 && stems[i].head === 'bud') palettes.push(palettes[0]); // buds promise the main head's colour
    else palettes.push(i === 0 ? (rng.chance(0.85) ? 'gamboge' : 'ochre') : rng.pick(['gamboge', 'gamboge', 'gamboge', 'gamboge', 'gamboge', 'ochre', 'ochre', 'rouge'] as const));
  }
  let openIdx = 0;
  stems.forEach((st, si) => {
    const q = along(st.path, st.L, 1);
    const Rmain = H * rng.range(0.15, 0.18);
    const kind = st.head;
    const R = kind === 'bud' ? H * rng.range(0.07, 0.085) : si === 0 ? Rmain : st.branch ? H * rng.range(0.1, 0.12) : H * rng.range(0.12, 0.15);
    const face = kind === 'side' ? rad(rng.range(74, 88)) : kind === 'bud' ? rad(rng.range(60, 90)) : rad(rng.range(45, 68));
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
