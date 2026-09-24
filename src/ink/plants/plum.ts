// 梅 Plum blossom — after 王冕《墨梅》, 金农 and 吴昌硕.
//
// An old, gnarled trunk in dry brush (飞白) with dark accents and moss dots (苔点), sometimes
// hollowed or broken off; limbs that zig-zag angularly like the character 女 ("old branches
// crooked, new shoots straight 老干曲，新枝直"); long straight whips (长条); short dark spurs;
// and five-petal blossoms — boneless rouge (红梅) or ink-outlined circles (圈梅), per seed —
// seen from every angle, with stamens (点蕊), calyx dots (蒂) and dark buds at the twig tips.
//
// Growth: a thin sapling (0–0.06) → the young wood of limbs and branches → the trunk thickens
// and ages (bark, accents, moss) → buds → blossoms open one by one (0.56–1).
import type { Drawing, PlantSpec, Stroke, StrokeKind, StrokePoint } from '../types';
import { PIGMENTS } from '../types';
import { makeRng, type Rng } from '../../core/rng';

type P = { x: number; y: number };

/** Design frame: ground contact at (0,0), up is −y, full height ≈ H. Rescaled to spec.height. */
const H = 320;

const dir = (a: number): P => ({ x: Math.sin(a), y: -Math.cos(a) });
const angOf = (a: P, b: P) => Math.atan2(b.x - a.x, -(b.y - a.y));
const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a: P, d: P, k = 1): P => ({ x: a.x + d.x * k, y: a.y + d.y * k });
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type BKind = 'trunk' | 'limb' | 'sec' | 'twig' | 'whip';
interface Branch {
  kind: BKind;
  pts: P[];
  w: number[];
  /** Path distance from the root at pts[0]. */
  d0: number;
  birth: number;
}

// ---------------------------------------------------------------------------
// geometry helpers

function polyLen(pts: P[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** Point, angle and width at arc-length fraction t of a branch. */
function at(b: Branch, t: number): { p: P; a: number; w: number; i: number } {
  const L = polyLen(b.pts);
  let want = clampN(t, 0, 1) * L;
  for (let i = 1; i < b.pts.length; i++) {
    const d = dist(b.pts[i - 1], b.pts[i]);
    if (want <= d || i === b.pts.length - 1) {
      const k = d ? clampN(want / d, 0, 1) : 0;
      return { p: mix(b.pts[i - 1], b.pts[i], k), a: angOf(b.pts[i - 1], b.pts[i]), w: b.w[i - 1] + (b.w[i] - b.w[i - 1]) * k, i: i - 1 };
    }
    want -= d;
  }
  return { p: b.pts[0], a: 0, w: b.w[0], i: 0 };
}

/** Angular zig-zag (女): segments alternate around a slowly drifting heading. */
function zig(rng: Rng, start: P, a0: number, length: number, segLen: number, turn: number, tropism: number): P[] {
  const n = Math.max(1, Math.round(length / segLen));
  const pts = [start];
  let s = rng.chance(0.5) ? 1 : -1;
  let base = a0;
  let p = start;
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? base + s * turn * rng.range(0, 0.4) : base + s * turn * rng.range(0.45, 1.1);
    if (!rng.chance(0.18)) s = -s;
    const l = (length / n) * rng.range(0.7, 1.3);
    p = add(p, dir(a), l);
    pts.push(p);
    base += (0 - base) * tropism;
  }
  return pts;
}

function widths(n: number, w0: number, w1: number, pow = 0.8): number[] {
  const w: number[] = [];
  for (let i = 0; i <= n; i++) w.push(w0 + (w1 - w0) * Math.pow(i / Math.max(1, n), pow));
  return w;
}

/** Occupancy: sample points of everything already placed, to steer new growth into empty space. */
class Space {
  pts: P[] = [];
  addPath(pts: P[], step = 6) {
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i]);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) this.pts.push(mix(pts[i - 1], pts[i], k / n));
    }
    this.pts.push(pts[pts.length - 1]);
  }
  near(q: P): number {
    let m = 1e9;
    for (const o of this.pts) {
      const d = (o.x - q.x) ** 2 + (o.y - q.y) ** 2;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }
  /** Mean clearance along a path (skipping its first `skip` px), with bounds penalties. */
  score(pts: P[], skip: number, cap = 34): number {
    let s = 0, n = 0, run = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i]);
      const m = Math.max(1, Math.ceil(d / 6));
      for (let k = 1; k <= m; k++) {
        run += d / m;
        if (run < skip) continue;
        const q = mix(pts[i - 1], pts[i], k / m);
        let v = Math.min(this.near(q), cap);
        if (q.x < -0.5 * H || q.x > 0.5 * H) v -= 50;
        if (q.y < -1.0 * H) v -= 50;
        if (q.y > -0.14 * H) v -= 30;
        s += v;
        n++;
      }
    }
    return n ? s / n : 0;
  }
}

// ---------------------------------------------------------------------------
// stroke helpers

let out: Stroke[] = [];
let srng: Rng = makeRng(1);

function push(kind: StrokeKind, pts: StrokePoint[], tone: number, birth: number, extra: Partial<Stroke> = {}) {
  out.push({ kind, pts, tone: clampN(tone, 0.04, 1), birth: clampN(birth, 0, 1), seed: srng.int(1, 2 ** 31 - 1), ...extra });
}

/** A gently bowed spine from a to b, with widths wa → wb. */
function bowed(a: P, b: P, wa: number, wb: number, bow: number, n = 4, wMid = 1): StrokePoint[] {
  const L = dist(a, b);
  const nx = -(b.y - a.y) / (L || 1), ny = (b.x - a.x) / (L || 1);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = Math.sin(Math.PI * t) * bow * L;
    const w = (wa + (wb - wa) * t) * (1 + (wMid - 1) * Math.sin(Math.PI * t));
    pts.push({ x: a.x + (b.x - a.x) * t + nx * o, y: a.y + (b.y - a.y) * t + ny * o, w });
  }
  return pts;
}

/** Whole-branch spine as one continuous stroke (used for thin young wood). */
function wholeSpine(b: Branch, wk: number, tipTaper = 0.15): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < b.pts.length; i++) {
    const last = i === b.pts.length - 1;
    pts.push({ x: b.pts[i].x, y: b.pts[i].y, w: b.w[i] * wk * (last ? tipTaper : 1) });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// the painter

export function plum(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 7919 + 17);
  out = [];
  srng = rng.fork(99);
  const space = new Space();

  // --- character of this specimen ---------------------------------------
  const side = rng.chance(0.5) ? 1 : -1; // the trunk leans this way
  const lean = rng.range(0.06, 0.42);
  const trunkH = rng.range(0.3, 0.44) * H;
  const brokenTop = rng.chance(0.45);
  const hollow = rng.chance(0.4);
  const style: 'rouge' | 'ink' = rng.chance(0.5) ? 'rouge' : 'ink';
  const density = rng.range(0.7, 1.05);
  const wBase = rng.range(0.07, 0.092) * H;

  // --- trunk ----------------------------------------------------------------
  const nT = rng.int(3, 4);
  const tPts = zig(rng, { x: 0, y: 0 }, side * lean, trunkH / Math.cos(lean * 0.7), trunkH / nT, rng.range(0.28, 0.5), 0.12);
  if (brokenTop) {
    // a stub that carries on past the living limbs and ends in a jagged break
    const a = angOf(tPts[tPts.length - 2], tPts[tPts.length - 1]) + side * rng.range(0.1, 0.35);
    tPts.push(add(tPts[tPts.length - 1], dir(a), rng.range(0.07, 0.11) * H));
  }
  const trunk: Branch = { kind: 'trunk', pts: tPts, w: widths(tPts.length - 1, wBase, wBase * (brokenTop ? 0.5 : 0.56), 0.9), d0: 0, birth: 0.1 };
  trunk.w[0] *= 1.12;
  space.addPath(trunk.pts);
  const topIdx = brokenTop ? tPts.length - 2 : tPts.length - 1; // where the leader leaves the trunk

  const limbs: Branch[] = [];
  const secs: Branch[] = [];
  const whips: Branch[] = [];
  const twigs: Branch[] = [];
  const cumTrunk = (i: number) => polyLen(trunk.pts.slice(0, i + 1));

  function chooseBest<C extends { pts: P[] }>(cands: C[], skip: number): C {
    let best = cands[0], bs = -1e9;
    for (const c of cands) {
      const s = space.score(c.pts, skip) + rng.range(0, 6);
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  // leader: continues from the trunk top, usually swinging back against the lean
  {
    const from = trunk.pts[topIdx];
    const aT = angOf(trunk.pts[topIdx - 1], from);
    const cands = [];
    for (let k = 0; k < 7; k++) {
      const a0 = clampN(aT * 0.35 - side * rng.range(0.05, 0.7), -0.8, 0.8);
      const len = rng.range(0.4, 0.54) * H;
      cands.push({ pts: zig(rng, from, a0, len, rng.range(0.07, 0.09) * H, rng.range(0.35, 0.55), 0.1) });
    }
    const c = chooseBest(cands, 10);
    const w0 = trunk.w[topIdx] * (brokenTop ? 0.62 : 0.8);
    limbs.push({ kind: 'limb', pts: c.pts, w: widths(c.pts.length - 1, w0, 2.2, 0.75), d0: cumTrunk(topIdx), birth: 0 });
    space.addPath(c.pts);
  }
  // one or two side limbs from lower trunk joints, reaching out sideways
  const nSide = rng.chance(0.55) ? 2 : 1;
  for (let s = 0; s < nSide; s++) {
    const j = clampN(s === 0 ? rng.int(1, Math.max(1, topIdx - 1)) : topIdx, 1, topIdx);
    const from = trunk.pts[j];
    const cands = [];
    for (let k = 0; k < 10; k++) {
      const sg = k % 2 ? 1 : -1;
      const a0 = sg * rng.range(0.7, 1.35);
      const len = (s === 0 ? rng.range(0.3, 0.46) : rng.range(0.18, 0.3)) * H;
      cands.push({ pts: zig(rng, from, a0, len, rng.range(0.065, 0.085) * H, rng.range(0.35, 0.6), 0.14) });
    }
    const c = chooseBest(cands, 14);
    const w0 = trunk.w[j] * rng.range(0.42, 0.55);
    limbs.push({ kind: 'limb', pts: c.pts, w: widths(c.pts.length - 1, w0, 1.8, 0.75), d0: cumTrunk(j), birth: 0 });
    space.addPath(c.pts);
  }

  // whips 长条: long straight young shoots rising from the limbs
  const nWhip = rng.int(1, 3);
  for (let k = 0; k < nWhip; k++) {
    const cands = [];
    for (let c = 0; c < 10; c++) {
      const par = rng.pick(limbs);
      const t = rng.range(0.25, 0.8);
      const at0 = at(par, t);
      const a0 = clampN(at0.a * 0.25 + rng.range(-0.35, 0.35), -0.45, 0.45);
      const len = rng.range(0.2, 0.34) * H;
      const end = add(at0.p, dir(a0), len);
      const mid = add(mix(at0.p, end, 0.5), dir(a0 + Math.PI / 2), len * rng.range(-0.05, 0.05));
      cands.push({ pts: [at0.p, mid, end], par, t, w: at0.w });
    }
    const c = chooseBest(cands, 12);
    const par = c.par;
    const w0 = Math.min(c.w * 0.5, 4.2);
    whips.push({ kind: 'whip', pts: c.pts, w: [w0, w0 * 0.55, 0.5], d0: par.d0 + c.t * polyLen(par.pts), birth: 0 });
    space.addPath(c.pts);
  }

  // secondaries from limb joints, alternating sides, steered into empty space
  for (const L of limbs) {
    let sg = rng.chance(0.5) ? 1 : -1;
    const Ltot = polyLen(L.pts);
    for (let j = 1; j < L.pts.length - 1; j++) {
      if (!rng.chance(0.62)) continue;
      const from = L.pts[j];
      const aP = angOf(L.pts[j - 1], L.pts[j]);
      const cands = [];
      for (let c = 0; c < 6; c++) {
        const s2 = c < 4 ? sg : -sg;
        let a0 = aP + s2 * rng.range(0.45, 1.0);
        a0 = a0 * 0.82; // shoots prefer to rise
        const len = rng.range(0.08, 0.2) * H;
        cands.push({ pts: zig(rng, from, a0, len, rng.range(0.04, 0.055) * H, rng.range(0.25, 0.45), 0.2) });
      }
      const c = chooseBest(cands, 8);
      if (space.score(c.pts, 8) < 9) continue; // too crowded: leave the space empty
      const w0 = Math.min(L.w[j] * 0.58, 5.5);
      secs.push({ kind: 'sec', pts: c.pts, w: widths(c.pts.length - 1, w0, 1.1, 0.7), d0: L.d0 + polyLen(L.pts.slice(0, j + 1)), birth: 0 });
      space.addPath(c.pts);
      sg = -sg;
    }
    void Ltot;
  }
  // a few tertiary shoots off secondaries
  for (const S of secs.slice()) {
    if (S.pts.length < 3 || !rng.chance(0.4)) continue;
    const j = rng.int(1, S.pts.length - 2);
    const aP = angOf(S.pts[j - 1], S.pts[j]);
    const a0 = (aP + (rng.chance(0.5) ? 1 : -1) * rng.range(0.5, 0.9)) * 0.85;
    const pts = zig(rng, S.pts[j], a0, rng.range(0.05, 0.09) * H, 0.04 * H, 0.3, 0.2);
    if (space.score(pts, 6) < 9) continue;
    secs.push({ kind: 'sec', pts, w: widths(pts.length - 1, Math.min(S.w[j] * 0.6, 3), 0.9), d0: S.d0 + polyLen(S.pts.slice(0, j + 1)), birth: 0 });
    space.addPath(pts);
  }

  // spurs 刺 / short twigs, the dark punctuation of a plum branch
  const twigHosts: Branch[] = [...limbs, ...secs, ...whips];
  for (const B of twigHosts) {
    const L = polyLen(B.pts);
    const n = B.kind === 'limb' ? rng.int(1, 3) : B.kind === 'whip' ? rng.int(0, 2) : rng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const t = rng.range(0.3, 0.92);
      const q = at(B, t);
      const sg = rng.chance(0.5) ? 1 : -1;
      const a0 = (q.a + sg * rng.range(0.55, 1.05)) * 0.9;
      const len = rng.range(0.022, 0.05) * H;
      const e = add(q.p, dir(a0), len);
      const pts = rng.chance(0.3) ? [q.p, add(q.p, dir(a0 - sg * 0.3), len * 0.5), add(q.p, dir(a0), len)] : [q.p, e];
      if (space.score(pts, 4, 16) < 6) continue;
      twigs.push({ kind: 'twig', pts, w: pts.length === 3 ? [Math.min(q.w * 0.5, 2.3), 1.3, 0.45] : [Math.min(q.w * 0.5, 2.2), 0.45], d0: B.d0 + t * L, birth: 0 });
      space.addPath(pts);
    }
  }

  // --- growth timeline -----------------------------------------------------
  const all = [trunk, ...limbs, ...secs, ...whips, ...twigs];
  let maxD = 1;
  for (const b of all) maxD = Math.max(maxD, b.d0 + polyLen(b.pts));
  const T = (d: number) => 0.07 + 0.3 * clampN(d / maxD, 0, 1);

  // --- sapling (0 – 0.06) --------------------------------------------------
  {
    // thin stem up the trunk (a little toward the shadow side, where it will read as a crack)
    const st: StrokePoint[] = [];
    for (let i = 0; i <= topIdx; i++) {
      const p = trunk.pts[i];
      const t = i / topIdx;
      st.push({ x: p.x + trunk.w[i] * 0.18, y: p.y, w: 0.02 * H * (1 - 0.6 * t) });
    }
    const lead = limbs[0];
    const e = at(lead, Math.min(1, (0.07 * H) / polyLen(lead.pts)));
    st.push({ x: e.p.x, y: e.p.y, w: 0.9 });
    push('brush', st, 0.6, 0, { dryness: 0.3 });
    // two little twigs following the first reach of the side limbs, each ending in a bud
    const hosts = [limbs[1], limbs[2] ?? secs[0] ?? whips[0]].filter(Boolean) as Branch[];
    hosts.forEach((b, k) => {
      const L = polyLen(b.pts);
      const tip = at(b, Math.min(1, (0.075 * H) / L));
      const pts: StrokePoint[] = [{ ...b.pts[0], w: 3 }, { x: mix(b.pts[0], tip.p, 0.5).x, y: mix(b.pts[0], tip.p, 0.5).y, w: 1.8 }, { ...tip.p, w: 0.6 }];
      push('brush', pts, 0.68, 0.015 + k * 0.015, { dryness: 0.2 });
      push('dot', [{ ...tip.p, w: 4 }], 0.85, 0.045 + k * 0.008);
    });
  }

  // --- young wood: the limbs as slender strokes -----------------------------
  limbs.forEach((b) => {
    b.birth = T(b.d0);
    push('brush', wholeSpine(b, 0.42, 0.25), 0.6, b.birth, { dryness: 0.35 });
  });

  // --- trunk grows old --------------------------------------------------------
  paintTrunk(rng, trunk, topIdx, brokenTop, hollow, side);

  // --- mature limbs, segment by segment (the brush lifts at every 女 joint) ---
  for (const b of limbs) paintSegments(rng, b, T, 0.26, 0.14, maxD);
  for (const b of secs) {
    b.birth = T(b.d0) + 0.07;
    paintSegments(rng, b, T, b.birth, 0, maxD);
  }
  whips.forEach((b, k) => {
    b.birth = 0.3 + 0.1 * (k / Math.max(1, whips.length - 1));
    push('brush', [
      { ...b.pts[0], w: b.w[0] * 1.1 },
      { ...mix(b.pts[0], b.pts[1], 0.5), w: b.w[0] * 0.9 },
      { ...b.pts[1], w: b.w[1] },
      { ...mix(b.pts[1], b.pts[2], 0.6), w: b.w[1] * 0.6 },
      { ...b.pts[2], w: 0.35 },
    ], rng.range(0.66, 0.78), b.birth, { dryness: 0.3 });
  });
  for (const b of twigs) {
    b.birth = clampN(T(b.d0) + 0.1, 0.34, 0.47);
    const pts: StrokePoint[] = b.pts.map((p, i) => ({ ...p, w: b.w[i] }));
    push('brush', pts, rng.range(0.82, 0.93), b.birth, { dryness: 0.15 });
  }

  // --- moss & accents on the limbs near the crotches --------------------------
  for (const b of limbs) {
    if (!rng.chance(0.6)) continue;
    const q = at(b, rng.range(0.05, 0.3));
    const nx = Math.cos(q.a), ny = Math.sin(q.a);
    const s = rng.chance(0.5) ? 1 : -1;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const o = q.w * 0.5 * s * rng.range(0.8, 1.2);
      push('dot', [{ x: q.p.x + nx * o + rng.range(-3, 3), y: q.p.y + ny * o + rng.range(-3, 3), w: rng.range(2.2, 3.8) }], rng.range(0.85, 0.95), rng.range(0.44, 0.5));
    }
  }

  // --- buds & blossoms ------------------------------------------------------
  paintBlossoms(rng, { trunk, limbs, secs, whips, twigs }, style, density);

  return finalize(out, spec.height);
}

// ---------------------------------------------------------------------------

function paintSegments(rng: Rng, b: Branch, T: (d: number) => number, birth0: number, spread: number, maxD: number) {
  let d = b.d0;
  const n = b.pts.length - 1;
  const tone = b.kind === 'limb' ? rng.range(0.56, 0.68) : rng.range(0.7, 0.8);
  for (let i = 0; i < n; i++) {
    const a = b.pts[i];
    const bb = b.pts[i + 1];
    const L = dist(a, bb);
    const last = i === n - 1;
    // overshoot the joint a little so segments knot together
    const e = last ? bb : add(bb, dir(angOf(a, bb)), Math.min(b.w[i + 1] * 0.35, 3));
    const wa = b.w[i] * rng.range(1.02, 1.12);
    const wb = last ? b.w[i + 1] * 0.35 : b.w[i + 1] * 0.92;
    const kind: StrokeKind = b.w[i] > 7.5 ? 'dry' : 'brush';
    const birth = spread ? birth0 + spread * clampN(d / maxD, 0, 1) : birth0 + i * 0.002;
    push(kind, bowed(a, e, wa, wb, rng.range(-0.06, 0.06), L > 30 ? 5 : 3, rng.range(0.9, 1.05)), tone * rng.range(0.92, 1.06), birth, {
      dryness: kind === 'dry' ? rng.range(0.4, 0.6) : rng.range(0.25, 0.45),
    });
    d += L;
    void T;
  }
}

function paintTrunk(rng: Rng, trunk: Branch, topIdx: number, brokenTop: boolean, hollow: boolean, side: number) {
  const n = trunk.pts.length - 1;
  // dense samples of the spine with normals
  interface S { p: P; nx: number; ny: number; hw: number; seg: number; t: number }
  const samples: S[] = [];
  for (let i = 0; i < n; i++) {
    const a = trunk.pts[i], b = trunk.pts[i + 1];
    const L = dist(a, b);
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L; // right-hand normal (for an upward spine: +x)
    const m = 6;
    for (let k = 0; k < m; k++) {
      const t = k / m;
      samples.push({ p: mix(a, b, t), nx, ny, hw: (trunk.w[i] + (trunk.w[i + 1] - trunk.w[i]) * t) / 2, seg: i, t });
    }
  }
  const lastS = samples[samples.length - 1];
  void lastS;

  // root flare
  for (const s of [-1, 1]) {
    const hw = trunk.w[0] / 2;
    const a = { x: s * hw * 0.3, y: -0.035 * H };
    const b = { x: s * (hw + rng.range(0.03, 0.06) * H), y: rng.range(-0.004, 0.004) * H };
    push('dry', bowed(a, b, hw * 0.9, 1.2, s * 0.12, 4), s > 0 ? 0.6 : 0.42, 0.1, { dryness: 0.6 });
  }

  // body: pale dry rubs, one per segment, from the ground up
  for (let i = 0; i < n; i++) {
    const a = trunk.pts[i], b = trunk.pts[i + 1];
    const last = i === n - 1;
    const e = last ? b : add(b, dir(angOf(a, b)), trunk.w[i + 1] * 0.2);
    const wb = last && brokenTop ? trunk.w[i + 1] * 0.95 : trunk.w[i + 1];
    push('dry', bowed(a, e, trunk.w[i], wb, rng.range(-0.05, 0.05), 5, 1.04), rng.range(0.22, 0.3), 0.1 + i * 0.02, { dryness: rng.range(0.45, 0.65) });
  }

  // contours: broken dry edges, the shadow side (right) darker and heavier
  for (let i = 0; i < n; i++) {
    for (const s of [1, -1]) {
      const seg = samples.filter((q) => q.seg === i);
      if (i === n - 1) seg.push({ ...seg[seg.length - 1], p: trunk.pts[n], t: 1, hw: trunk.w[n] / 2 });
      const t0 = rng.range(0, 0.18), t1 = rng.range(0.78, 1);
      const pick = seg.filter((q) => q.t >= t0 && q.t <= t1);
      if (pick.length < 2) continue;
      const dark = s > 0;
      const pts: StrokePoint[] = pick.map((q, k) => {
        const u = k / (pick.length - 1);
        const inset = rng.range(0.62, 0.8);
        return { x: q.p.x + q.nx * q.hw * inset * s, y: q.p.y + q.ny * q.hw * inset * s, w: q.hw * (dark ? 0.55 : 0.38) * (0.6 + 0.6 * Math.sin(Math.PI * clampN(u * 1.1, 0, 1))) };
      });
      push('dry', pts, dark ? rng.range(0.62, 0.78) : rng.range(0.42, 0.55), 0.14 + i * 0.02 + (dark ? 0 : 0.01), { dryness: rng.range(0.35, 0.6) });
    }
  }

  // broken top: a jagged, dark break
  if (brokenTop) {
    const a = trunk.pts[n - 1], b = trunk.pts[n];
    const ang = angOf(a, b);
    const hw = trunk.w[n] / 2;
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const c1 = { x: b.x - nx * hw, y: b.y - ny * hw };
    const c2 = { x: b.x + nx * hw, y: b.y + ny * hw };
    const mid = add(mix(c1, c2, rng.range(0.35, 0.65)), dir(ang), rng.range(-0.3, 0.6) * hw);
    push('dry', [{ ...c1, w: 2.4 }, { ...mid, w: 3.2 }, { ...c2, w: 1.6 }], 0.82, 0.2, { dryness: 0.5 });
    push('brush', [{ ...add(mid, dir(ang), -hw * 0.3), w: 2.2 }, { ...add(mid, dir(ang), -hw * 1.3), w: 0.6 }], 0.8, 0.2);
  }

  // hollow: an eye-shaped rot opening in the middle of the trunk
  if (hollow && n >= 2) {
    const seg = samples.filter((q) => q.seg === (n >= 3 ? 1 : 0) || q.seg === (n >= 3 ? 2 : 1));
    if (seg.length > 6) {
      const i0 = Math.floor(seg.length * rng.range(0.15, 0.3));
      const i1 = Math.floor(seg.length * rng.range(0.6, 0.8));
      const part = seg.slice(i0, i1 + 1);
      const L = part.length - 1;
      const inner: StrokePoint[] = [];
      const outer: StrokePoint[] = [];
      const shift = rng.range(-0.15, 0.2);
      part.forEach((q, k) => {
        const u = Math.sin((Math.PI * k) / L);
        const cL = shift - 0.42 * u, cR = shift + 0.3 * u;
        inner.push({ x: q.p.x + q.nx * q.hw * cL, y: q.p.y + q.ny * q.hw * cL, w: 0.5 + q.hw * 0.3 * u });
        outer.push({ x: q.p.x + q.nx * q.hw * cR, y: q.p.y + q.ny * q.hw * cR, w: 0.5 + q.hw * 0.16 * u });
      });
      push('dry', inner, 0.86, 0.3, { dryness: 0.4 });
      push('dry', outer, 0.5, 0.3, { dryness: 0.55 });
    }
  }

  // bark rubs 皴: short dry strokes along the grain
  const nTex = rng.int(4, 7);
  for (let k = 0; k < nTex; k++) {
    const i = rng.int(0, samples.length - 4);
    const q = samples[i], r = samples[Math.min(samples.length - 1, i + rng.int(2, 4))];
    const u = rng.range(-0.55, 0.6);
    const a = { x: q.p.x + q.nx * q.hw * u, y: q.p.y + q.ny * q.hw * u };
    const b = { x: r.p.x + r.nx * r.hw * (u + rng.range(-0.2, 0.2)), y: r.p.y + r.ny * r.hw * (u + rng.range(-0.2, 0.2)) };
    push('dry', bowed(a, b, q.hw * rng.range(0.18, 0.32), q.hw * 0.08, rng.range(-0.1, 0.1), 3), rng.range(0.4, 0.58), 0.3 + k * 0.006, { dryness: 0.6 });
  }

  // knot scar 节疤 on the light side
  if (rng.chance(0.6)) {
    const q = samples[rng.int(Math.floor(samples.length * 0.3), Math.floor(samples.length * 0.8))];
    const u = -rng.range(0.2, 0.45);
    const c = { x: q.p.x + q.nx * q.hw * u, y: q.p.y + q.ny * q.hw * u };
    const rx = q.hw * rng.range(0.22, 0.3), ry = rx * rng.range(1.3, 1.7);
    const rot = Math.atan2(q.ny, q.nx);
    const ring: StrokePoint[] = [];
    const a0 = rng.range(0, 6.28);
    for (let k = 0; k <= 9; k++) {
      const t = a0 + (k / 9) * Math.PI * 1.75;
      const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
      ring.push({ x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot), w: 1.6 * (0.5 + 0.5 * Math.sin((k / 9) * Math.PI)) });
    }
    push('brush', ring, 0.72, 0.33);
    push('dot', [{ ...c, w: rx * 0.9 }], 0.78, 0.33);
  }

  // dark accents 醒笔 on the shadow edge at the joints
  for (let i = 1; i <= Math.min(n, topIdx); i++) {
    if (!rng.chance(0.75)) continue;
    const q = samples.find((s) => s.seg === Math.min(i, n - 1) && s.t >= (i === n ? 0.8 : 0)) ?? samples[samples.length - 1];
    const s = rng.chance(0.75) ? 1 : -1;
    const a = { x: q.p.x + q.nx * q.hw * 0.85 * s, y: q.p.y + q.ny * q.hw * 0.85 * s };
    const ang = angOf(trunk.pts[Math.min(i, n) - 1], trunk.pts[Math.min(i, n)]);
    const b = add(a, dir(ang + s * rng.range(-0.25, 0.1)), rng.range(0.035, 0.06) * H);
    push('brush', bowed(a, b, q.hw * 0.3, 0.8, rng.range(-0.1, 0.1), 3), rng.range(0.85, 0.95), 0.36 + i * 0.005, { dryness: 0.35 });
  }

  // moss dots 苔点, in little groups straddling the contour
  const groups = rng.int(2, 3);
  for (let g = 0; g < groups; g++) {
    const q = samples[rng.int(Math.floor(samples.length * (g === 0 ? 0 : 0.35)), Math.floor(samples.length * (g === 0 ? 0.25 : 0.95)))];
    const s = side * (g % 2 ? -1 : 1);
    const n2 = rng.int(2, 3);
    for (let k = 0; k < n2; k++) {
      const u = s * rng.range(0.85, 1.12);
      const along = rng.range(-6, 6);
      push('dot', [{ x: q.p.x + q.nx * q.hw * u - q.ny * along, y: q.p.y + q.ny * q.hw * u + q.nx * along, w: rng.range(2.4, 4.6) }], rng.range(0.86, 0.96), 0.42 + g * 0.02 + k * 0.004);
    }
  }
}

// ---------------------------------------------------------------------------
// blossoms

interface Site { p: P; a: number; wt: number; b: Branch; t: number; hw: number }

function paintBlossoms(
  rng: Rng,
  tree: { trunk: Branch; limbs: Branch[]; secs: Branch[]; whips: Branch[]; twigs: Branch[] },
  style: 'rouge' | 'ink',
  density: number,
) {
  const r0 = rng.range(0.024, 0.029) * H; // flower radius
  const sites: Site[] = [];
  const addSites = (b: Branch, tMin: number, wt: number) => {
    const L = polyLen(b.pts);
    const n = Math.max(2, Math.floor(L / (r0 * 0.7)));
    for (let k = 0; k <= n; k++) {
      const t = tMin + ((1 - tMin) * k) / n;
      const q = at(b, t);
      // plum flowers gather at the joints
      let near = 1e9;
      for (const jp of b.pts) near = Math.min(near, dist(jp, q.p));
      sites.push({ p: q.p, a: q.a, wt: wt * (near < r0 ? 2.2 : 1), b, t, hw: q.w / 2 });
    }
  };
  tree.limbs.forEach((b) => addSites(b, 0.35, 0.55));
  tree.secs.forEach((b) => addSites(b, 0.15, 1));
  tree.whips.forEach((b) => addSites(b, 0.2, 0.75));

  // flowers never sit on the old trunk
  const trunkClear = (c: P, r: number) => {
    for (let i = 1; i < tree.trunk.pts.length; i++) {
      const a = tree.trunk.pts[i - 1], b = tree.trunk.pts[i];
      for (let k = 0; k <= 6; k++) if (dist(mix(a, b, k / 6), c) < tree.trunk.w[i] / 2 + r * 1.1) return false;
    }
    return true;
  };

  // two or three focal clusters give rhythm: dense here, sparse there, empty elsewhere
  const focal: P[] = [];
  for (let tries = 0; tries < 40 && focal.length < rng.int(2, 3); tries++) {
    const s = rng.pick(sites);
    if (focal.every((f) => dist(f, s.p) > 0.22 * H)) focal.push(s.p);
  }
  for (const s of sites) {
    let m = 1e9;
    for (const f of focal) m = Math.min(m, dist(f, s.p));
    s.wt *= 0.25 + Math.exp(-(m * m) / (2 * (0.1 * H) ** 2));
  }
  const total = () => sites.reduce((a, s) => a + s.wt, 0);
  const pickSite = () => {
    let x = rng() * total();
    for (const s of sites) if ((x -= s.wt) <= 0) return s;
    return sites[sites.length - 1];
  };

  interface F { c: P; r: number; site: Site; view: 'face' | 'tilt' | 'side' | 'back'; phi: number }
  const flowers: F[] = [];
  const nF = Math.round(rng.range(9, 14) * density);
  for (let tries = 0; tries < 400 && flowers.length < nF && sites.length; tries++) {
    const s = pickSite();
    const r = r0 * rng.range(0.82, 1.12);
    const sg = rng.chance(0.5) ? 1 : -1;
    const nrm = s.a + (sg * Math.PI) / 2;
    const off = s.hw + r * rng.range(style === 'ink' ? 0.55 : 0.1, style === 'ink' ? 0.95 : 0.7);
    const c = add(s.p, dir(nrm), off);
    const pair = rng.chance(0.28);
    if (!flowers.every((f) => dist(f.c, c) > (f.r + r) * (pair ? 0.62 : 0.95))) continue;
    if (!trunkClear(c, r)) continue;
    const u = rng();
    const view = u < 0.36 ? 'face' : u < 0.66 ? 'tilt' : u < 0.84 ? 'side' : 'back';
    // flowers face outward from the branch and a little upward
    const phi = nrm * 0.7 + rng.range(-0.5, 0.5);
    flowers.push({ c, r, site: s, view, phi });
    s.wt *= 0.3;
  }

  // buds: at twig and shoot tips, and a few along the branches
  interface Bd { p: P; a: number; r: number }
  const buds: Bd[] = [];
  const tips: Branch[] = [...tree.twigs, ...tree.secs, ...tree.whips];
  for (const b of tips) {
    if (!rng.chance(b.kind === 'twig' ? 0.6 : 0.8)) continue;
    const p = b.pts[b.pts.length - 1];
    const a = angOf(b.pts[b.pts.length - 2], p);
    const r = r0 * rng.range(0.3, 0.42);
    const c = add(p, dir(a), r * 0.6);
    if (!flowers.every((f) => dist(f.c, c) > f.r + r * 0.6)) continue;
    buds.push({ p: c, a, r });
    if (rng.chance(0.3)) {
      const q = at(b, rng.range(0.4, 0.85));
      const s2 = rng.chance(0.5) ? 1 : -1;
      const c2 = add(q.p, dir(q.a + s2 * 1.2), q.w / 2 + r * 0.8);
      if (flowers.every((f) => dist(f.c, c2) > f.r + r)) buds.push({ p: c2, a: q.a + s2 * 0.9, r: r * 0.85 });
    }
  }

  // buds swell (0.47–0.6)
  const budOrder = buds.map((b) => ({ b, k: rng() })).sort((x, y) => x.k - y.k);
  budOrder.forEach(({ b }, i) => {
    const birth = 0.47 + 0.12 * (i / Math.max(1, buds.length - 1));
    const base = add(b.p, dir(b.a), -b.r * 0.7);
    if (style === 'rouge') {
      push('dot', [{ ...b.p, w: b.r * 2 }], rng.range(0.62, 0.8), birth, { color: PIGMENTS.rouge });
    } else {
      push('dot', [{ ...b.p, w: b.r * 1.8 }], rng.range(0.55, 0.78), birth);
    }
    push('dot', [{ ...base, w: b.r * 0.95 }], 0.92, birth);
  });

  // blossoms open (0.56–1): the first near the main focus, then spreading
  const order = flowers
    .map((f) => ({ f, k: rng() * 0.55 + (focal.length ? dist(f.c, focal[0]) / H : 0) }))
    .sort((x, y) => x.k - y.k);
  order.forEach(({ f }, i) => {
    const birth = 0.56 + 0.44 * (i / Math.max(1, order.length - 1));
    paintFlower(rng, f.c, f.r, f.view, f.phi, style, birth);
  });
}

function paintFlower(rng: Rng, c: P, r: number, view: 'face' | 'tilt' | 'side' | 'back', phi: number, style: 'rouge' | 'ink', birth: number) {
  const tilt = view === 'face' ? rng.range(0.86, 1) : view === 'tilt' ? rng.range(0.56, 0.78) : view === 'side' ? rng.range(0.34, 0.48) : rng.range(0.7, 0.92);
  const fd = dir(phi); // the way the flower's face turns
  // view transform: squash along fd by `tilt`, and slide the petal ring toward the face side
  const shift = (1 - tilt) * 0.35 * r;
  const T = (x: number, y: number): P => {
    const along = x * fd.x + y * fd.y;
    const perp = -x * fd.y + y * fd.x;
    const a2 = along * tilt;
    return { x: c.x + fd.x * (a2 + shift) - fd.y * perp, y: c.y + fd.y * (a2 + shift) + fd.x * perp };
  };
  const nPet = view === 'side' ? 4 : 5;
  const th0 = rng.range(0, Math.PI * 2);
  const ring = style === 'ink' ? 0.6 : 0.52;
  const pr = style === 'ink' ? 0.37 : 0.47;
  interface Pet { cx: number; cy: number; depth: number; th: number }
  const pets: Pet[] = [];
  for (let k = 0; k < 5; k++) {
    const th = th0 + (k * Math.PI * 2) / 5 + rng.range(-0.12, 0.12);
    const cx = Math.cos(th) * r * ring, cy = Math.sin(th) * r * ring;
    pets.push({ cx, cy, th, depth: -(cx * fd.x + cy * fd.y) });
  }
  // a side view hides the petal turned furthest away
  if (nPet === 4) pets.sort((a, b) => a.depth - b.depth).shift();
  pets.sort((a, b) => a.depth - b.depth); // far first

  const petalPoly = (pt: Pet, scale = 1): StrokePoint[] => {
    const pts: StrokePoint[] = [];
    const m = 11;
    const rr = r * pr * rng.range(0.9, 1.08) * scale;
    for (let i = 0; i < m; i++) {
      const t = (i / m) * Math.PI * 2;
      // slightly longer radially, a little flattened at the base
      const lx = Math.cos(t) * rr * 1.08, ly = Math.sin(t) * rr * (1 + rng.range(-0.05, 0.05));
      const x = pt.cx + lx * Math.cos(pt.th) - ly * Math.sin(pt.th);
      const y = pt.cy + lx * Math.sin(pt.th) + ly * Math.cos(pt.th);
      pts.push({ ...T(x, y), w: i === 0 ? 0.5 : 0 });
    }
    return pts;
  };

  // a veil of lead white so the flower sits in front of the branch (painters leave it blank)
  {
    const pts: StrokePoint[] = [];
    const m = 12, rr = r * (ring + pr * 0.55);
    for (let i = 0; i < m; i++) {
      const t = (i / m) * Math.PI * 2;
      pts.push({ ...T(Math.cos(t) * rr, Math.sin(t) * rr), w: i === 0 ? 0.6 : 0 });
    }
    push('fill', pts, style === 'ink' ? 0.9 : 0.8, birth, { color: PIGMENTS.white });
  }

  if (style === 'rouge') {
    const base = rng.range(0.42, 0.66);
    for (const pt of pets) push('fill', petalPoly(pt), base * rng.range(0.82, 1.16), birth, { color: PIGMENTS.rouge });
  } else {
    const tone = rng.range(0.5, 0.66);
    for (const pt of pets) {
      if (view !== 'face') push('fill', petalPoly(pt, 0.98), 0.92, birth, { color: PIGMENTS.white });
      // outline drawn as an open circle, starting and ending at the petal's base
      const rr = r * pr * rng.range(0.92, 1.06);
      const pts: StrokePoint[] = [];
      const m = 12;
      const gap = rng.range(0.25, 0.55);
      for (let i = 0; i <= m; i++) {
        const t = pt.th + Math.PI + gap / 2 + (i / m) * (Math.PI * 2 - gap);
        const x = pt.cx + Math.cos(t) * rr * 1.06, y = pt.cy + Math.sin(t) * rr;
        const u = i / m;
        pts.push({ ...T(x, y), w: 0.55 + 0.75 * Math.sin(Math.PI * u) });
      }
      push('line', pts, tone * rng.range(0.9, 1.1), birth);
    }
  }

  // stamens 点蕊: fine lines fanning out of the heart, each tipped with a dark dot
  const heart = T(0, 0);
  if (view !== 'back') {
    const n = view === 'face' ? rng.int(6, 7) : view === 'tilt' ? 5 : 3;
    const spread = view === 'face' ? Math.PI : view === 'tilt' ? 1.1 : 0.55;
    const tips: P[] = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : k / (n - 1);
      const a = view === 'face' ? th0 + (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2) : phi + (u - 0.5) * 2 * spread + rng.range(-0.12, 0.12);
      const len = r * (view === 'face' ? rng.range(0.42, 0.62) : rng.range(0.55, 0.8));
      const tip = add(heart, dir(a), len);
      const mid = add(mix(heart, tip, 0.5), dir(a + Math.PI / 2), len * rng.range(-0.1, 0.1));
      push('line', [{ ...heart, w: 0.7 }, { ...mid, w: 0.55 }, { ...tip, w: 0.4 }], rng.range(0.62, 0.78), birth);
      tips.push(tip);
    }
    for (const tp of tips) push('dot', [{ ...tp, w: r * rng.range(0.14, 0.2) }], rng.range(0.85, 0.96), birth);
  }
  // calyx 蒂: dark dots at the base of turned and back-facing flowers
  if (view === 'back') {
    for (let k = 0; k < 5; k++) {
      const a = th0 + (k * Math.PI * 2) / 5 + Math.PI / 5;
      push('dot', [{ ...T(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2), w: r * 0.26 }], 0.9, birth);
    }
  } else if (view !== 'face') {
    const base = add(c, fd, -r * (0.25 + 0.3 * (1 - tilt)));
    const n = view === 'side' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * r * 0.24;
      push('dot', [{ x: base.x - fd.y * o, y: base.y + fd.x * o, w: r * rng.range(0.22, 0.3) }], 0.92, birth);
    }
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
