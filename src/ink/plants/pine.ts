// 松 Pine — after 马远 and 八大山人.
//
// A sturdy, slightly twisting trunk: soft ochre body, knobbly dry contours (the shadow side
// heavier), fish-scale bark (鳞皴) foreshortened round the cylinder, a knot or a broken stub.
// Limbs reach out nearly level, droop and lift their tips; some specimens throw one long
// "welcoming" limb (迎客松). Foliage sits in flat shelves: a pale wash (ink or 花青 indigo)
// under wheel (车轮) or fan (扇形) bursts of needles, pale clusters behind and dark in front.
//
// Growth: a seedling with one tuft (0–0.07) → whorl by whorl, each limb arriving with its first
// shelf (0.08–0.4) → the trunk thickens (0.4–0.55) → front clusters, bark scales, the indigo
// glaze, cones and moss (0.5–1).
import type { Drawing, PlantSpec, Stroke, StrokeKind, StrokePoint } from '../types';
import { PIGMENTS } from '../types';
import { makeRng, makeNoise2, type Rng } from '../../core/rng';

type P = { x: number; y: number };

/** Design frame: ground contact at (0,0), up is −y, full height ≈ H. Rescaled to spec.height. */
const H = 320;

const dir = (a: number): P => ({ x: Math.sin(a), y: -Math.cos(a) });
const angOf = (a: P, b: P) => Math.atan2(b.x - a.x, -(b.y - a.y));
const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a: P, d: P, k = 1): P => ({ x: a.x + d.x * k, y: a.y + d.y * k });
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

let out: Stroke[] = [];
let srng: Rng = makeRng(1);

function push(kind: StrokeKind, pts: StrokePoint[], tone: number, birth: number, extra: Partial<Stroke> = {}) {
  out.push({ kind, pts, tone: clampN(tone, 0.04, 1), birth: clampN(birth, 0, 1), seed: srng.int(1, 2 ** 31 - 1), ...extra });
}

function polyLen(pts: P[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** Point and heading at arc-length fraction t along a polyline. */
function along(pts: P[], t: number): { p: P; a: number } {
  const L = polyLen(pts);
  let want = clampN(t, 0, 1) * L;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (want <= d || i === pts.length - 1) return { p: mix(pts[i - 1], pts[i], d ? clampN(want / d, 0, 1) : 0), a: angOf(pts[i - 1], pts[i]) };
    want -= d;
  }
  return { p: pts[0], a: 0 };
}

/** Densify a polyline with a Chaikin pass or two (keeps the ends). */
function smooth(pts: P[], iters = 2): P[] {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q: P[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      q.push(mix(p[i], p[i + 1], 0.25), mix(p[i], p[i + 1], 0.75));
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

interface Limb {
  pts: P[];
  w0: number;
  w1: number;
  f: number; // attach height fraction on the trunk
  side: number;
  birth: number;
  crown: boolean;
}

interface Hub { c: P; r: number; front: boolean }
interface Pad {
  c: P;
  w: number;
  h: number;
  birth: number;
  limb?: Limb;
  root: P; // where its twigs leave the limb
  hubs: Hub[];
}

type Noise = ReturnType<typeof makeNoise2>;

export function pine(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 104729 + 3);
  out = [];
  srng = rng.fork(7);
  const nz = makeNoise2(spec.seed * 31 + 5);

  // --- character -------------------------------------------------------------
  const side = rng.chance(0.5) ? 1 : -1; // lean
  const u0 = rng();
  const form: 'welcoming' | 'leaning' | 'upright' = u0 < 0.36 ? 'welcoming' : u0 < 0.66 ? 'leaning' : 'upright';
  const lean = form === 'leaning' ? rng.range(0.34, 0.52) : form === 'upright' ? rng.range(0.02, 0.12) : rng.range(0.08, 0.3);
  const welcoming = form === 'welcoming';
  const wheel = rng.chance(0.6); // 车轮 (马远) or 扇形 fans (八大)
  const washColor = rng.chance(0.6) ? PIGMENTS.indigo : undefined;
  const wBase = rng.range(0.085, 0.105) * H;
  const trunkLen = (form === 'upright' ? rng.range(0.68, 0.76) : rng.range(0.6, 0.7)) * H;

  // --- trunk spine: a slow S with a slight twist --------------------------------
  const nS = 6;
  const ph = rng.range(0, 6.28), fr = rng.range(0.8, 1.3), amp = form === 'leaning' ? rng.range(0.06, 0.16) : rng.range(0.12, 0.28);
  const raw: P[] = [{ x: 0, y: 0 }];
  for (let i = 1; i <= nS; i++) {
    const u = i / nS;
    let a = side * lean * (1 - 0.5 * u) + amp * Math.sin(ph + i * fr) * (0.3 + u) + rng.range(-0.06, 0.06);
    if (i === nS) a -= side * (form === 'leaning' ? rng.range(0.45, 0.75) : rng.range(0.15, 0.45)); // the crown turns back over the base
    raw.push(add(raw[i - 1], dir(a), trunkLen / nS));
  }
  const spine = smooth(raw, 3);
  const tw = (f: number) => wBase * (1 - 0.62 * Math.pow(f, 0.8)) * (1 + 0.25 * Math.max(0, 1 - f / 0.07));
  const trunkAt = (f: number) => ({ ...along(spine, f), w: tw(f) });
  const top = spine[spine.length - 1];

  // --- limbs ---------------------------------------------------------------------
  const limbs: Limb[] = [];
  const nL = form === 'upright' ? 4 : rng.int(3, 4);
  const fs: number[] = [];
  for (let tries = 0; tries < 300 && fs.length < nL; tries++) {
    const f = rng.range(0.36, 0.88);
    if (fs.every((g) => Math.abs(g - f) > 0.13)) fs.push(f);
  }
  fs.sort((a, b) => a - b);
  let wIdx = -1;
  if (welcoming) {
    wIdx = fs.findIndex((f) => f > 0.4 && f < 0.66);
    if (wIdx < 0) { fs[0] = rng.range(0.44, 0.56); fs.sort((a, b) => a - b); wIdx = fs.findIndex((f) => f > 0.4 && f < 0.66); }
  }
  let sL = rng.chance(0.5) ? 1 : -1;
  fs.forEach((f, k) => {
    const isW = k === wIdx;
    let s = sL;
    if (isW) s = -side; // reach out against the lean, for balance
    else if (rng.chance(0.2)) s = -s;
    sL = -s;
    const t = trunkAt(f);
    const hi = clampN((f - 0.36) / 0.52, 0, 1); // 0 low … 1 high
    // a leaning pine reaches far on its lean side and keeps short arms on the other
    const lk = form === 'leaning' ? (s === side ? 1.3 : 0.6) : form === 'upright' ? 0.8 : 1;
    const len = isW ? rng.range(0.48, 0.6) * H : rng.range(0.2, 0.32) * H * (1 - 0.4 * hi) * lk;
    const segs = isW ? 4 : 3;
    const pts: P[] = [add(t.p, dir(t.a + (s * Math.PI) / 2), t.w * 0.15)];
    for (let i = 0; i < segs; i++) {
      // out and nearly level, an elbow that droops, then the tip lifts (angles from vertical)
      let a = i === 0 ? rng.range(0.9, 1.3) : i === segs - 1 ? rng.range(0.55, 0.95) : rng.range(1.55, 1.95);
      a -= hi * 0.3 * (i === segs - 1 ? 0.3 : 1);
      const l = (len / segs) * (i === segs - 1 ? rng.range(0.6, 0.9) : rng.range(0.85, 1.3));
      pts.push(add(pts[i], dir(s * a), l));
    }
    limbs.push({ pts, w0: t.w * (isW ? 0.68 : rng.range(0.52, 0.62)), w1: 2, f, side: s, birth: 0, crown: false });
  });
  // crown: two short arms from the top, flat like a parasol (平顶)
  {
    const aT = along(spine, 0.98).a;
    const big = rng.chance(0.5) ? 1 : -1;
    const arms = rng.chance(0.4) ? [big] : [1, -1];
    for (const s of arms) {
      const len = (s === big ? rng.range(0.13, 0.19) : rng.range(0.05, 0.09)) * H;
      const p1 = add(top, dir(aT * 0.4 + s * rng.range(0.85, 1.2)), len * 0.55);
      const p2 = add(p1, dir(s * rng.range(1.0, 1.35)), len * 0.45);
      limbs.push({ pts: [top, p1, p2], w0: tw(1) * 0.75, w1: 1.6, f: 1, side: s, birth: 0, crown: true });
    }
  }

  // --- foliage shelves -----------------------------------------------------------
  const pads: Pad[] = [];
  const padOk = (c: P, w: number, h: number) => pads.every((p) => Math.abs(p.c.x - c.x) > (p.w + w) * 0.4 || Math.abs(p.c.y - c.y) > (p.h + h) * 0.7);
  const newPad = (c: P, w: number, root: P, limb?: Limb, force = false): boolean => {
    const h = w * rng.range(0.26, 0.34);
    if (!force && !padOk(c, w, h)) return false;
    const hubs: Hub[] = [];
    const nF = clampN(Math.round(w / (0.085 * H)), 2, 3);
    for (let k = 0; k < nF; k++) {
      const u = k / (nF - 1) - 0.5;
      hubs.push({ c: { x: c.x + u * w * 0.62 + rng.range(-0.03, 0.03) * w, y: c.y + h * rng.range(0.02, 0.2) }, r: rng.range(0.062, 0.076) * H, front: true });
    }
    for (let k = 0; k < nF - 1; k++) {
      const u = (k + 0.5) / (nF - 1) - 0.5;
      hubs.push({ c: { x: c.x + u * w * 0.62 + rng.range(-0.05, 0.05) * w, y: c.y - h * rng.range(0.28, 0.45) }, r: rng.range(0.054, 0.066) * H, front: false });
    }
    pads.push({ c, w, h, birth: 0, limb, root, hubs });
    return true;
  };
  const bare = new Set<Limb>();
  for (const l of limbs.slice().sort((a, b) => b.f - a.f)) {
    const L = polyLen(l.pts);
    const ts = L > 0.4 * H ? [0.5, 0.78, 1] : L > 0.19 * H ? [0.6, 1] : [1];
    let any = false;
    for (const t0 of ts.reverse()) {
      const t = clampN(t0 + rng.range(-0.05, 0.02), 0, 1);
      const q = along(l.pts, t);
      const w = rng.range(0.19, 0.26) * H * (t0 === 1 ? 1 : 0.85);
      const c = { x: q.p.x + l.side * w * 0.1, y: q.p.y - rng.range(0.02, 0.035) * H };
      any = newPad(c, w, q.p, l, !l.crown && t0 === 1 && ts.length === 1) || any;
    }
    if (!any) bare.add(l);
  }
  // the top of the leader carries its own shelf
  newPad({ x: top.x, y: top.y - 0.035 * H }, rng.range(0.2, 0.26) * H, top, limbs[limbs.length - 1]);

  // a low sprout on the trunk: this is the seedling's first tuft
  const fSp = rng.range(0.2, 0.28);
  const spT = trunkAt(fSp);
  const spSide = -(limbs.slice().sort((a, b) => a.f - b.f)[0]?.side ?? side);
  const spC = add(add(spT.p, dir(spT.a + (spSide * Math.PI) / 2), spT.w * 0.5 + 0.055 * H), dir(0), 0.025 * H);

  // a crown arm that found no room for foliage is left out; a bare limb gets a tuft anyway
  for (const l of bare) {
    if (l.crown) limbs.splice(limbs.indexOf(l), 1);
    else newPad(add(l.pts[l.pts.length - 1], dir(0), 0.025 * H), 0.16 * H, l.pts[l.pts.length - 1], l, true);
  }

  // --- growth timeline: whorls from the ground up -------------------------------
  const sortedLimbs = limbs.slice().sort((a, b) => a.f - b.f || a.side - b.side);
  sortedLimbs.forEach((l, k) => (l.birth = 0.08 + 0.3 * (k / Math.max(1, sortedLimbs.length - 1))));
  // a shelf arrives with its limb, so a young tree never shows bare arms
  for (const p of pads) p.birth = (p.limb?.birth ?? 0.38) + 0.001 + 0.004 * dist(p.root, p.limb?.pts[0] ?? p.root) / H;
  pads.sort((a, b) => a.birth - b.birth);

  // budget needles so the whole tree stays near 400 strokes
  const nHubs = pads.reduce((s, p) => s + p.hubs.length, 0) + 1;
  const strokesPerHub = clampN(Math.floor(250 / nHubs), 5, wheel ? 10 : 11);

  // --- seedling (0–0.07) ----------------------------------------------------------
  {
    const pts: StrokePoint[] = [];
    const m = 5;
    for (let i = 0; i <= m; i++) {
      const q = trunkAt((fSp * i) / m);
      const o = q.w * 0.22;
      const n = dir(q.a + Math.PI / 2);
      pts.push({ x: q.p.x + n.x * o, y: q.p.y + n.y * o, w: 0.02 * H * (1 - 0.35 * (i / m)) });
    }
    const bend = mix(spT.p, spC, 0.55);
    pts.push({ ...add(bend, dir(0), 0.012 * H), w: 0.011 * H }, { ...spC, w: 0.007 * H });
    push('brush', pts, 0.62, 0, { dryness: 0, wet: 0.4 });
    paintWash(rng, nz, { c: { x: spC.x, y: spC.y - 0.006 * H }, w: 0.12 * H, h: 0.045 * H }, 0.18, washColor, 0.02);
    paintCluster(rng, spC, 0.05 * H, Math.max(6, strokesPerHub), wheel, 0.75, 0.03, 0.03, spSide);
  }

  // --- whorls: young stem, young limb, first wash and pale back clusters -----------
  {
    let prevF = fSp;
    sortedLimbs.forEach((l) => {
      if (l.f > prevF + 0.01) {
        const pts: StrokePoint[] = [];
        const f1 = Math.min(1, l.f + 0.03);
        const m = Math.max(2, Math.round((f1 - prevF) * 12));
        for (let i = 0; i <= m; i++) {
          const q = trunkAt(Math.max(0, prevF - 0.02 + ((f1 - prevF + 0.02) * i) / m));
          const o = q.w * 0.22;
          const n = dir(q.a + Math.PI / 2);
          pts.push({ x: q.p.x + n.x * o, y: q.p.y + n.y * o, w: q.w * 0.4 * (i === m ? 0.6 : 1) });
        }
        push('brush', pts, 0.6, l.birth - 0.005, { dryness: 0.1 });
        prevF = l.f;
      }
      const lp = smooth(l.pts, 1);
      push('brush', lp.map((p, i) => ({ ...p, w: (l.w0 + (l.w1 - l.w0) * (i / (lp.length - 1))) * 0.42 })), 0.62, l.birth, { dryness: 0.15 });
    });
  }
  for (const p of pads) {
    p.hubs.forEach((h, k) => {
      if (!h.front) paintCluster(rng, h.c, h.r, strokesPerHub, wheel, rng.range(0.42, 0.55), p.birth + k * 0.0005, 0.0005, p.limb?.side ?? 1);
    });
    // one dark tuft right away, so a young limb already reads as pine
    const first = p.hubs[rng.int(0, p.hubs.filter((h) => h.front).length - 1)];
    (first as Hub & { done?: boolean }).done = true;
    paintCluster(rng, first.c, first.r * 0.95, strokesPerHub, wheel, rng.range(0.74, 0.86), p.birth + 0.003, 0.0005, p.limb?.side ?? 1);
    // the pale shelf is washed in over the first needles, pushing them back
    paintWash(rng, nz, p, rng.range(0.18, 0.25), washColor, p.birth + 0.004);
  }

  // --- the trunk grows old (0.4–0.8) ----------------------------------------------
  paintTrunk(rng, nz, spine, tw, limbs, side);
  for (const l of sortedLimbs) {
    const lp = smooth(l.pts, 1);
    const n = lp.length - 1;
    const b = 0.44 + 0.1 * l.f;
    const wAt = (i: number) => l.w0 + (l.w1 - l.w0) * Math.pow(i / n, 0.65);
    const nrm = (i: number) => dir(angOf(lp[Math.max(0, i - 1)], lp[Math.min(n, i + 1)]) + Math.PI / 2);
    if (l.w0 > 6) {
      push('dry', lp.map((p, i) => ({ ...p, w: wAt(i) * 1.05 })), rng.range(0.36, 0.44), b, { dryness: 0.25 });
      // the underside in shadow, heavier and knotted
      push('brush', lp.map((p, i) => {
        const o = wAt(i) * 0.34 * (l.side > 0 ? 1 : -1);
        return { x: p.x + nrm(i).x * o, y: p.y + nrm(i).y * o, w: wAt(i) * 0.36 * (0.6 + 0.4 * Math.sin(Math.PI * clampN((i / n) * 1.1, 0, 1))) };
      }), rng.range(0.72, 0.84), b + 0.005, { dryness: 0.3 });
    } else {
      push('brush', lp.map((p, i) => ({ ...p, w: wAt(i) })), rng.range(0.64, 0.76), b, { dryness: 0.3 });
    }
  }

  // --- front clusters and their twigs (0.5–0.8) ------------------------------------
  pads.forEach((p, i) => {
    const birth = 0.5 + 0.28 * (i / Math.max(1, pads.length - 1));
    for (const h of p.hubs) {
      if (!h.front || dist(p.root, h.c) < 0.02 * H) continue;
      const m = mix(p.root, h.c, 0.5);
      push('brush', [{ ...p.root, w: 2.2 }, { x: m.x, y: m.y + rng.range(-0.004, 0.004) * H, w: 1.6 }, { ...h.c, w: 1 }], rng.range(0.62, 0.74), birth, { dryness: 0.1 });
    }
    p.hubs.forEach((h, k) => {
      if (h.front && !(h as Hub & { done?: boolean }).done) paintCluster(rng, h.c, h.r, strokesPerHub, wheel, rng.range(0.78, 0.92), birth + 0.002 + k * 0.002, 0.004, p.limb?.side ?? 1);
    });
  });

  // --- indigo glaze 罩染 and cones (0.85–1) ------------------------------------------
  if (washColor) {
    pads.forEach((p, i) => {
      if (rng.chance(0.6)) paintWash(rng, nz, { c: { x: p.c.x + rng.range(-0.1, 0.1) * p.w, y: p.c.y + p.h * 0.05 }, w: p.w * 0.8, h: p.h * 0.85 }, 0.1, washColor, 0.86 + 0.08 * (i / pads.length));
    });
  }
  if (rng.chance(0.6)) {
    const host = rng.pick(pads.filter((p) => p.limb && !p.limb.crown).concat(pads.slice(0, 1)));
    const n = rng.int(2, 3);
    for (let k = 0; k < n; k++) {
      const c = { x: host.root.x + (k - 1) * 0.014 * H + rng.range(-0.004, 0.004) * H, y: host.root.y + rng.range(0.016, 0.026) * H };
      push('dot', [{ ...c, w: 0.022 * H * rng.range(0.85, 1.1) }], rng.range(0.42, 0.52), 0.94 + k * 0.01);
      push('dot', [{ ...add(c, dir(2.8), 0.003 * H), w: 0.009 * H }], 0.85, 0.945 + k * 0.01);
    }
  }

  return finalize(out, spec.height);
}

// ---------------------------------------------------------------------------

function paintWash(rng: Rng, nz: Noise, pad: { c: P; w: number; h: number }, tone: number, color: string | undefined, birth: number) {
  const m = 18;
  const pts: StrokePoint[] = [];
  const o = rng.range(0, 100);
  for (let i = 0; i < m; i++) {
    const t = (i / m) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const k = 1 + 0.25 * nz(o + c * 1.6, o + s * 1.6);
    const y = s > 0 ? s * 0.5 : s * (1 + 0.3 * Math.abs(nz(o + 7 + c * 3, 3)));
    pts.push({ x: pad.c.x + c * pad.w * 0.56 * k, y: pad.c.y + y * pad.h * 0.95 * k, w: i === 0 ? 5 : 0 });
  }
  push('wash', pts, tone * rng.range(0.85, 1.15), birth, color ? { color } : {});
}

/**
 * A burst of needles. Wheels (车轮) are drawn as strokes passing through the hub — each one two
 * needles — squashed flat; fans (扇形) as single needles rising from the hub.
 */
function paintCluster(rng: Rng, c: P, len: number, n: number, wheel: boolean, tone: number, birth: number, span: number, lean: number) {
  const nd = (d: P, L: number, w0: number): StrokePoint[] => {
    const bend = rng.range(-0.05, 0.05) * L;
    const m = { x: c.x + d.x * L * 0.5 - d.y * bend, y: c.y + d.y * L * 0.5 + d.x * bend };
    return [{ ...m, w: w0 * 0.75 }, { x: c.x + d.x * L, y: c.y + d.y * L, w: 0.35 }];
  };
  if (wheel) {
    const squash = rng.range(0.4, 0.55);
    const th0 = rng.range(0, Math.PI);
    for (let k = 0; k < n; k++) {
      const th = th0 + (k / n) * Math.PI + rng.range(-0.1, 0.1);
      const thB = th + Math.PI + rng.range(-0.18, 0.18);
      const dA = { x: Math.cos(th), y: Math.sin(th) * squash }, dB = { x: Math.cos(thB), y: Math.sin(thB) * squash };
      const nA = Math.hypot(dA.x, dA.y), nB = Math.hypot(dB.x, dB.y);
      const LA = len * rng.range(0.8, 1.08) * (dA.y > 0 ? 0.82 : 1) * (0.75 + 0.25 * nA);
      const LB = len * rng.range(0.8, 1.08) * (dB.y > 0 ? 0.82 : 1) * (0.75 + 0.25 * nB);
      const a = nd(dA, LA / nA * nA, 1.2).reverse();
      const b = nd(dB, LB / nB * nB, 1.2);
      const hub = { x: c.x + rng.range(-0.6, 0.6), y: c.y + rng.range(-0.4, 0.4), w: 1.25 };
      push('line', [...a, hub, ...b], tone * rng.range(0.9, 1.1), birth + (k / n) * span);
    }
  } else {
    const fanDir = -Math.PI / 2 + lean * rng.range(0.1, 0.4);
    const spread = rng.range(2.4, 2.9);
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0.5 : k / (n - 1);
      const th = fanDir + (u - 0.5) * spread + rng.range(-0.08, 0.08);
      const d = { x: Math.cos(th), y: Math.sin(th) };
      const L = len * rng.range(0.85, 1.05) * (0.78 + 0.22 * Math.sin(Math.PI * u));
      const s0 = { x: c.x + d.x * L * 0.04, y: c.y + d.y * L * 0.04, w: 1.3 };
      push('line', [s0, ...nd(d, L, 1.3)], tone * rng.range(0.9, 1.1), birth + (k / n) * span);
    }
    push('dot', [{ ...c, w: 2.4 }], Math.min(0.95, tone + 0.1), birth + span);
  }
}

function paintTrunk(rng: Rng, nz: Noise, spine: P[], tw: (f: number) => number, limbs: Limb[], side: number) {
  const N = 40;
  interface S { p: P; n: P; hw: number; f: number }
  const S: S[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const q = along(spine, f);
    S.push({ p: q.p, n: dir(q.a + Math.PI / 2), hw: tw(f) / 2, f });
  }
  const off = (s: S, u: number): P => ({ x: s.p.x + s.n.x * s.hw * u, y: s.p.y + s.n.y * s.hw * u });
  const o1 = rng.range(0, 50);
  const knob = (s: S, k: number) => 1 + 0.1 * nz(o1 + s.f * 11, k * 3.1) + 0.05 * nz(o1 + s.f * 31, k * 5.3);

  // roots gripping the ground
  const nR = rng.int(2, 3);
  for (let k = 0; k < nR; k++) {
    const s = k === 0 ? -1 : k === 1 ? 1 : rng.chance(0.5) ? 1 : -1;
    const hw = tw(0) / 2;
    const a = { x: s * hw * rng.range(0.6, 0.85), y: -rng.range(0.01, 0.022) * H };
    const b = { x: s * (hw + rng.range(0.022, 0.045) * H), y: rng.range(0.002, 0.006) * H };
    const m = { x: a.x * 0.45 + b.x * 0.55, y: (a.y + b.y) / 2 + rng.range(0, 0.004) * H };
    push('dry', [{ ...a, w: hw * 0.32 }, { ...m, w: hw * 0.2 }, { ...b, w: 0.7 }], s > 0 ? 0.6 : 0.46, 0.4, { dryness: 0.35 });
  }

  // body: an ochre-tinted wash inside the silhouette
  {
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= N; i++) pts.push({ ...off(S[i], -0.95 * knob(S[i], 1)), w: i === 0 ? 2.5 : 0 });
    for (let i = N; i >= 0; i--) pts.push({ ...off(S[i], 0.95 * knob(S[i], 2)), w: 0 });
    push('wash', pts, rng.range(0.22, 0.3), 0.41, { color: PIGMENTS.ochre, wet: 0.4 });
  }
  // a mid-tone rub on the shadow side, for roundness
  push('dry', S.map((s) => ({ ...off(s, 0.1), w: s.hw * 1.7 })), rng.range(0.22, 0.28), 0.415, { dryness: 0.3 });
  push('dry', S.map((s) => ({ ...off(s, 0.42), w: s.hw * 1.1 })), rng.range(0.36, 0.44), 0.42, { dryness: 0.25 });
  // bark rubs 皴 along the grain
  const nTex = rng.int(4, 6);
  for (let k = 0; k < nTex; k++) {
    const i = rng.int(1, N - 8), j = Math.min(N, i + rng.int(4, 8));
    const u = rng.range(-0.55, 0.7);
    const pts = S.slice(i, j + 1).map((q, m, arr) => ({ ...off(q, u + 0.15 * nz(o1 + k * 7, m * 0.3)), w: q.hw * rng.range(0.2, 0.3) * Math.sin(Math.PI * (0.15 + 0.7 * (m / Math.max(1, arr.length - 1)))) }));
    push('dry', pts, rng.range(0.42, 0.56), 0.46 + k * 0.004, { dryness: 0.45 });
  }

  // contours: knobbly, broken dry edges; the shadow side (+normal) heavier
  for (const s of [1, -1]) {
    const cuts = [0, rng.int(9, 13), rng.int(19, 23), rng.int(29, 33), N];
    for (let k = 0; k < cuts.length - 1; k++) {
      const i0 = Math.max(0, cuts[k] - (k ? rng.int(0, 2) : 0)), i1 = cuts[k + 1];
      const pts: StrokePoint[] = [];
      for (let i = i0; i <= i1; i++) {
        const v = (i - i0) / Math.max(1, i1 - i0);
        const swell = 0.5 + 0.5 * Math.sin(Math.PI * clampN(v * 1.1, 0, 1));
        pts.push({ ...off(S[i], s * 0.86 * knob(S[i], s + 3)), w: S[i].hw * (s > 0 ? 0.4 : 0.24) * swell * (1 + 0.35 * nz(o1 + i * 0.4, 9 + s)) });
      }
      push(s > 0 ? 'dry' : 'dry', pts, s > 0 ? rng.range(0.74, 0.86) : rng.range(0.5, 0.62), 0.43 + k * 0.02 + (s > 0 ? 0 : 0.01), { dryness: s > 0 ? 0.18 : 0.3 });
    }
  }

  // a broken stub (枯枝) with its knot
  if (rng.chance(0.45)) {
    const f = rng.range(0.14, 0.34);
    const i = Math.round(f * N);
    const s = limbs.some((l) => Math.abs(l.f - f) < 0.12 && l.side === side) ? -side : side;
    const base = off(S[i], s * 0.8);
    const a = angOf(S[i].p, base) - s * rng.range(0.15, 0.5);
    const L = rng.range(0.022, 0.036) * H;
    const e = add(base, dir(a), L);
    push('brush', [{ ...base, w: S[i].hw * 0.62 }, { ...mix(base, e, 0.55), w: S[i].hw * 0.42 }, { ...e, w: S[i].hw * 0.16 }], 0.7, 0.5, { dryness: 0.5 });
    const k = off(S[i], s * 0.35);
    const ring: StrokePoint[] = [];
    const rx = S[i].hw * 0.26, ry = rx * 0.75;
    for (let j = 0; j <= 9; j++) {
      const t = (j / 9) * Math.PI * 1.8 + 0.4;
      ring.push({ x: k.x + Math.cos(t) * rx, y: k.y + Math.sin(t) * ry, w: 1.4 * (0.4 + 0.6 * Math.sin((j / 9) * Math.PI)) });
    }
    push('line', ring, 0.7, 0.62);
  }

  // fish-scale bark 鳞皴: small crescents in a staggered lattice, foreshortened toward the edges,
  // sparse on the lit side
  let cnt = 0;
  let f = 0.04;
  let row = 0;
  while (f < 0.9 && cnt < 40) {
    const i = clampN(Math.round(f * N), 0, N);
    const s = S[i];
    const stepU = 0.5;
    for (let u = -0.85 + (row % 2) * stepU * 0.5 + rng.range(-0.08, 0.08); u < 0.9; u += stepU * rng.range(0.85, 1.15)) {
      if (!rng.chance(u < -0.3 ? 0.5 : 0.8)) continue;
      const fore = Math.sqrt(Math.max(0.05, 1 - u * u));
      const sw = s.hw * 0.28 * fore * rng.range(0.8, 1.2);
      const sh = s.hw * 0.2 * rng.range(0.8, 1.2);
      const c = off(s, u);
      const ax = -s.n.y, ay = s.n.x; // along the trunk (downward-ish for our normal)
      const pts: StrokePoint[] = [];
      const a0 = rng.range(0, 0.25), a1 = rng.range(0.75, 1);
      for (let j = 0; j <= 5; j++) {
        const t = Math.PI * (a0 + (a1 - a0) * (j / 5));
        const lx = Math.cos(t) * sw, ly = Math.sin(t) * sh; // a ∪, convex toward the ground
        pts.push({ x: c.x + s.n.x * lx + ax * ly, y: c.y + s.n.y * lx + ay * ly, w: 1.3 * (0.4 + 0.6 * Math.sin(Math.PI * (j / 5))) });
      }
      push('line', pts, u > 0.2 ? rng.range(0.7, 0.85) : rng.range(0.5, 0.65), 0.55 + 0.25 * f + cnt * 0.0005);
      cnt++;
    }
    f += (s.hw * rng.range(0.5, 0.7)) / (along(spine, 1) && polyLen(spine));
    row++;
  }

  // moss dots 苔点 at the foot and along the shadow edge
  const nm = rng.int(4, 6);
  for (let k = 0; k < nm; k++) {
    const i = k < 2 ? rng.int(1, 4) : rng.int(6, Math.round(N * 0.7));
    const s = rng.chance(0.7) ? 1 : -1;
    push('dot', [{ ...off(S[i], s * rng.range(0.85, 1.12)), w: rng.range(2, 3.8) }], rng.range(0.86, 0.96), 0.9 + k * 0.01);
  }
}

// ---------------------------------------------------------------------------

function finalize(strokes: Stroke[], targetH: number): Drawing {
  const isPoly = (s: Stroke) => s.kind === 'wash' || s.kind === 'fill';
  let top = -1;
  for (const s of strokes) for (const p of s.pts) top = Math.min(top, p.y - (isPoly(s) ? 0 : p.w / 2));
  const k = targetH / -top;
  const minW = 0.75;
  for (const s of strokes) {
    s.pts = s.pts.map((p) => ({ x: p.x * k, y: p.y * k, w: p.w * k }));
    if (s.kind === 'dot') s.pts[0].w = Math.max(s.pts[0].w, 1);
    else if (!isPoly(s)) {
      const mx = Math.max(...s.pts.map((p) => p.w));
      if (mx < minW) s.pts = s.pts.map((p) => ({ ...p, w: (p.w * minW) / mx }));
    }
  }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of strokes) {
    for (const p of s.pts) {
      const r = isPoly(s) ? 0 : p.w / 2;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
      y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
  }
  const m = 4 + targetH * 0.015;
  const dx = m - x0, dy = m - y0;
  for (const s of strokes) s.pts = s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy, w: p.w }));
  strokes.sort((a, b) => a.birth - b.birth);
  return { width: Math.ceil(x1 - x0 + 2 * m), height: Math.ceil(y1 - y0 + 2 * m), anchor: { x: dx, y: dy }, strokes };
}
