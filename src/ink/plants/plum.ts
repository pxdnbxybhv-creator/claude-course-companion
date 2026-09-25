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
    const a = i === 0 ? base + s * turn * rng.range(0, 0.35) : base + s * turn * rng.range(0.5, 1.1);
    if (!rng.chance(0.2)) s = -s;
    const l = (length / n) * rng.range(0.65, 1.35);
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
  constructor(private halfW: number) {}
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
        if (q.x < -this.halfW || q.x > this.halfW) v -= 50;
        if (q.y < -1.0 * H) v -= 50;
        if (q.y > -0.16 * H) v -= 30;
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
function bowed(a: P, b: P, wa: number, wb: number, bow: number, n = 4): StrokePoint[] {
  const L = dist(a, b) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = Math.sin(Math.PI * t) * bow * L;
    pts.push({ x: a.x + (b.x - a.x) * t + nx * o, y: a.y + (b.y - a.y) * t + ny * o, w: wa + (wb - wa) * t });
  }
  return pts;
}

/**
 * Spine through joints i0..i1 of a branch, keeping the 女 corners sharp (extra points hug each
 * joint so the brush engine's spline doesn't round them off). Each segment bows slightly.
 */
function runSpine(rng: Rng, b: Branch, i0: number, i1: number, wk = 1, tipTaper = 1, offset = 0): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let s = i0; s < i1; s++) {
    const a = b.pts[s], c = b.pts[s + 1];
    const L = dist(a, c) || 1;
    const nx = -(c.y - a.y) / L, ny = (c.x - a.x) / L;
    const bow = rng.range(-0.045, 0.045);
    for (const t of [0, 0.1, 0.5, 0.9]) {
      const o = Math.sin(Math.PI * t) * bow * L;
      const w = (b.w[s] + (b.w[s + 1] - b.w[s]) * t) * wk;
      const off = offset * w;
      pts.push({ x: a.x + (c.x - a.x) * t + nx * (o + off), y: a.y + (c.y - a.y) * t + ny * (o + off), w });
    }
  }
  const e = b.pts[i1];
  pts.push({ x: e.x, y: e.y, w: b.w[i1] * wk * tipTaper });
  return pts;
}

// ---------------------------------------------------------------------------
// the painter

export function plum(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed * 7919 + 17);
  out = [];
  srng = rng.fork(99);

  // --- character of this specimen ---------------------------------------
  const side = rng.chance(0.5) ? 1 : -1; // the trunk leans this way
  const lean = rng.range(0.08, 0.42);
  const trunkH = rng.range(0.28, 0.42) * H;
  const brokenTop = rng.chance(0.45);
  const hollow = rng.chance(0.28);
  const twin = rng.chance(0.25);
  const style: 'rouge' | 'ink' = rng.chance(0.5) ? 'rouge' : 'ink';
  const density = rng.range(0.75, 1.1);
  const wBase = rng.range(0.075, 0.095) * H;
  const space = new Space(rng.range(0.46, 0.58) * H);

  // --- trunk ----------------------------------------------------------------
  const nT = rng.int(3, 4);
  const tPts = zig(rng, { x: 0, y: 0 }, side * lean, trunkH / Math.cos(lean * 0.7), trunkH / nT, rng.range(0.3, 0.55), 0.1);
  if (brokenTop) {
    // a stub that carries on past the living limbs and ends in a jagged break
    const a = clampN(angOf(tPts[tPts.length - 2], tPts[tPts.length - 1]) + side * rng.range(0.05, 0.3), -0.6, 0.6);
    tPts.push(add(tPts[tPts.length - 1], dir(a), rng.range(0.06, 0.1) * H));
  }
  const trunk: Branch = { kind: 'trunk', pts: tPts, w: widths(tPts.length - 1, wBase, wBase * (brokenTop ? 0.55 : 0.5), 0.9), d0: 0, birth: 0.1 };
  space.addPath(trunk.pts);
  const topIdx = brokenTop ? tPts.length - 2 : tPts.length - 1; // where the leader leaves the trunk

  const limbs: Branch[] = [];
  const secs: Branch[] = [];
  const whips: Branch[] = [];
  const twigs: Branch[] = [];
  const cumTrunk = (i: number) => polyLen(trunk.pts.slice(0, i + 1));

  // the old stump (老干) a new plant starts from, and its one fresh shoot (一枝梅)
  const trunkLen = polyLen(trunk.pts);
  const stumpH = Math.min(trunkLen * 0.42, rng.range(0.1, 0.13) * H);
  const stumpTop = at(trunk, stumpH / trunkLen);
  const shootSide = -side;
  let shoot: Branch;
  {
    const nrm = dir(stumpTop.a + (shootSide * Math.PI) / 2);
    const base = add(stumpTop.p, nrm, stumpTop.w * 0.3);
    const a0 = stumpTop.a * 0.3 + shootSide * rng.range(0.2, 0.4);
    const len = rng.range(0.2, 0.26) * H;
    const tip = add(base, dir(a0), len);
    const mid = add(mix(base, tip, 0.5), dir(a0 + Math.PI / 2), len * rng.range(-0.05, 0.05));
    shoot = { kind: 'whip', pts: [base, mid, tip], w: [3.4, 2.2, 0.6], d0: stumpH, birth: 0.03 };
    space.addPath(shoot.pts);
  }

  // 忌平行: painters avoid shoots running parallel to their neighbours
  const placed: { m: P; a: number }[] = [];
  const place = (pts: P[]) => {
    space.addPath(pts);
    placed.push({ m: mix(pts[0], pts[pts.length - 1], 0.5), a: angOf(pts[0], pts[pts.length - 1]) });
  };
  const parallel = (pts: P[]) => {
    const m = mix(pts[0], pts[pts.length - 1], 0.5), a = angOf(pts[0], pts[pts.length - 1]);
    let pen = 0;
    for (const q of placed) {
      if (dist(q.m, m) > 0.3 * H) continue;
      const d = Math.abs(Math.atan2(Math.sin(a - q.a), Math.cos(a - q.a)));
      if (d < 0.3) pen += 18 * (1 - d / 0.3);
    }
    return pen;
  };
  function chooseBest<C extends { pts: P[] }>(cands: C[], skip: number): C {
    let best = cands[0], bs = -1e9;
    for (const c of cands) {
      const s = space.score(c.pts, skip) + rng.range(0, 6) - parallel(c.pts);
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  // leader: continues from the trunk top, usually swinging back against the lean
  {
    const from = trunk.pts[topIdx];
    const aT = angOf(trunk.pts[topIdx - 1], from);
    const cands = [];
    for (let k = 0; k < 8; k++) {
      const a0 = clampN(aT * 0.3 - side * rng.range(-0.1, 0.8), -0.85, 0.85);
      const len = rng.range(0.42, 0.56) * H;
      cands.push({ pts: zig(rng, from, a0, len, rng.range(0.09, 0.12) * H, rng.range(0.4, 0.65), 0.12) });
    }
    const c = chooseBest(cands, 10);
    const w0 = trunk.w[topIdx] * (brokenTop ? 0.6 : 0.78);
    limbs.push({ kind: 'limb', pts: c.pts, w: widths(c.pts.length - 1, w0, 2.4, 0.7), d0: cumTrunk(topIdx), birth: 0 });
    place(c.pts);
  }
  // one or two side limbs from lower trunk joints, reaching out sideways (or a young twin trunk)
  const nSide = rng.chance(0.55) ? 2 : 1;
  for (let s = 0; s < nSide; s++) {
    const isTwin = twin && s === 0;
    const j = isTwin ? 0 : clampN(s === 0 ? rng.int(1, Math.max(1, topIdx - 1)) : topIdx, 1, topIdx);
    const from = isTwin ? add(trunk.pts[0], dir(angOf(trunk.pts[0], trunk.pts[1])), 0.05 * H) : trunk.pts[j];
    const cands = [];
    for (let k = 0; k < 10; k++) {
      const sg = k % 2 ? 1 : -1;
      const a0 = isTwin ? -side * rng.range(0.25, 0.55) : sg * rng.range(0.75, 1.45);
      const len = (isTwin ? rng.range(0.45, 0.6) : s === 0 ? rng.range(0.32, 0.48) : rng.range(0.2, 0.32)) * H;
      cands.push({ pts: zig(rng, from, a0, len, rng.range(0.085, 0.11) * H, rng.range(0.4, 0.7), isTwin ? 0.12 : 0.16) });
    }
    const c = chooseBest(cands, 14);
    const w0 = isTwin ? wBase * 0.42 : trunk.w[j] * rng.range(0.42, 0.52);
    limbs.push({ kind: 'limb', pts: c.pts, w: widths(c.pts.length - 1, w0, 2, 0.7), d0: isTwin ? 0.05 * H : cumTrunk(j), birth: 0 });
    place(c.pts);
  }

  // whips 长条: long straight young shoots rising from the limbs
  const nWhip = rng.int(1, 3);
  for (let k = 0; k < nWhip; k++) {
    const cands = [];
    for (let c = 0; c < 12; c++) {
      const par = rng.pick(limbs);
      const t = rng.range(0.25, 0.85);
      const at0 = at(par, t);
      const a0 = clampN(at0.a * 0.3 + rng.range(-0.4, 0.4), -0.5, 0.5);
      const len = rng.range(0.2, 0.36) * H;
      const end = add(at0.p, dir(a0), len);
      const mid = add(mix(at0.p, end, 0.5), dir(a0 + Math.PI / 2), len * rng.range(-0.05, 0.05));
      cands.push({ pts: [at0.p, mid, end], par, t, w: at0.w });
    }
    const c = chooseBest(cands, 12);
    const w0 = Math.min(c.w * 0.5, 4);
    whips.push({ kind: 'whip', pts: c.pts, w: [w0, w0 * 0.55, 0.5], d0: c.par.d0 + c.t * polyLen(c.par.pts), birth: 0 });
    place(c.pts);
  }

  // secondaries from limb joints, alternating sides, steered into empty space; straighter than limbs
  for (const L of limbs) {
    let sg = rng.chance(0.5) ? 1 : -1;
    for (let j = 1; j < L.pts.length - 1; j++) {
      if (!rng.chance(0.7)) continue;
      const from = L.pts[j];
      const aP = angOf(L.pts[j - 1], L.pts[j]);
      const cands = [];
      for (let c = 0; c < 7; c++) {
        const s2 = c < 5 ? sg : -sg;
        const a0 = (aP + s2 * rng.range(0.45, 1.0)) * 0.8; // shoots prefer to rise
        const len = rng.range(0.09, 0.22) * H;
        cands.push({ pts: zig(rng, from, a0, len, rng.range(0.055, 0.075) * H, rng.range(0.15, 0.32), 0.2) });
      }
      const c = chooseBest(cands, 8);
      if (space.score(c.pts, 8) - parallel(c.pts) < 10) continue; // too crowded or too regular: leave it empty
      const w0 = Math.min(L.w[j] * 0.58, 5.5);
      secs.push({ kind: 'sec', pts: c.pts, w: widths(c.pts.length - 1, w0, 1.1, 0.7), d0: L.d0 + polyLen(L.pts.slice(0, j + 1)), birth: 0 });
      place(c.pts);
      sg = -sg;
    }
  }
  // a few tertiary shoots off secondaries
  for (const S of secs.slice()) {
    if (S.pts.length < 3 || !rng.chance(0.45)) continue;
    const j = rng.int(1, S.pts.length - 2);
    const aP = angOf(S.pts[j - 1], S.pts[j]);
    const a0 = (aP + (rng.chance(0.5) ? 1 : -1) * rng.range(0.5, 0.9)) * 0.85;
    const pts = zig(rng, S.pts[j], a0, rng.range(0.05, 0.1) * H, 0.05 * H, 0.2, 0.2);
    if (space.score(pts, 6) - parallel(pts) < 10) continue;
    secs.push({ kind: 'sec', pts, w: widths(pts.length - 1, Math.min(S.w[j] * 0.6, 3), 0.9), d0: S.d0 + polyLen(S.pts.slice(0, j + 1)), birth: 0 });
    place(pts);
  }

  // spurs 刺 / short twigs, the dark punctuation of a plum branch
  for (const B of [...limbs, ...secs, ...whips]) {
    const L = polyLen(B.pts);
    const n = B.kind === 'limb' ? rng.int(1, 3) : rng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const t = rng.range(0.3, 0.92);
      const q = at(B, t);
      const sg = rng.chance(0.5) ? 1 : -1;
      const a0 = (q.a + sg * rng.range(0.55, 1.05)) * 0.9;
      const len = rng.range(0.022, 0.05) * H;
      const pts = rng.chance(0.3) ? [q.p, add(q.p, dir(a0 - sg * 0.3), len * 0.5), add(q.p, dir(a0), len)] : [q.p, add(q.p, dir(a0), len)];
      if (space.score(pts, 4, 16) < 6) continue;
      const w0 = Math.min(q.w * 0.5, 2.2);
      twigs.push({ kind: 'twig', pts, w: pts.length === 3 ? [w0, w0 * 0.6, 0.45] : [w0, 0.45], d0: B.d0 + t * L, birth: 0 });
      space.addPath(pts);
    }
  }

  // --- growth timeline -----------------------------------------------------
  // check-in n reaches growth 0.06 + 0.94(1 − e^(−n/21)): 0.104, 0.146, 0.185, 0.223, 0.26, 0.295, 0.33 …
  let maxD = 1;
  for (const b of [trunk, ...limbs, ...secs, ...whips, ...twigs]) maxD = Math.max(maxD, b.d0 + polyLen(b.pts));
  const T = (d: number) => clampN(d / maxD, 0, 1);

  // --- day one (0 – 0.05): a short burnt-ink stump with a cut top, one green-ink shoot, one rouge bud
  paintStump(rng, trunk, stumpH, side);
  push('brush', shoot.pts.map((p, i) => ({ ...p, w: shoot.w[i] })), 0.5, 0.03, { dryness: 0 });
  push('brush', shoot.pts.map((p, i) => ({ ...p, w: shoot.w[i] * 0.72 })), 0.5, 0.032, { color: PIGMENTS.malachite, dryness: 0.1 });
  {
    const tip = shoot.pts[2];
    const a = angOf(shoot.pts[1], tip);
    const r = 0.018 * H;
    push('dot', [{ ...add(tip, dir(a), r * 0.55), w: r * 1.35 }], 0.82, 0.045, { color: PIGMENTS.rouge });
    push('dot', [{ ...add(tip, dir(a), -r * 0.05), w: r * 0.6 }], 0.92, 0.046);
    // a second, smaller bud along the shoot (check-in 1)
    const q = mix(shoot.pts[1], tip, rng.range(0.25, 0.45));
    const a2 = a + shootSide * 1.1;
    push('dot', [{ ...add(q, dir(a2), r * 0.55), w: r * 0.95 }], 0.78, 0.075, { color: PIGMENTS.rouge });
    push('dot', [{ ...q, w: r * 0.45 }], 0.9, 0.076);
  }

  // --- young wood (0.09–0.25): the trunk grows on out of the stump, then the limbs one by one ----
  {
    const st: StrokePoint[] = [];
    const i0 = Math.max(0, trunk.pts.findIndex((p, i) => i > 0 && cumTrunk(i) > stumpH) - 1);
    st.push({ ...stumpTop.p, w: stumpTop.w * 0.45 });
    for (let i = i0 + 1; i <= topIdx; i++) st.push({ ...trunk.pts[i], w: trunk.w[i] * 0.4 });
    const lead = limbs[0];
    const e1 = at(lead, Math.min(1, (0.06 * H) / polyLen(lead.pts)));
    st.push({ ...e1.p, w: lead.w[0] * 0.25 });
    push('brush', st, 0.62, 0.09, { dryness: 0.1 });
  }
  limbs.slice().sort((a, b) => a.d0 - b.d0).forEach((b, k) => {
    b.birth = 0.115 + 0.035 * k;
    push('brush', runSpine(rng, b, 0, b.pts.length - 1, 0.4, 0.5), 0.62, b.birth, { dryness: 0.15 });
  });

  // --- branches, whips and twigs (0.15–0.52) -------------------------------------
  for (const b of secs) {
    b.birth = 0.15 + 0.32 * T(b.d0);
    paintBranch(rng, b, b.birth, rng.range(0.7, 0.82));
  }
  whips.forEach((b, k) => {
    b.birth = 0.2 + 0.2 * (k / Math.max(1, whips.length - 1));
    push('brush', [
      { ...b.pts[0], w: b.w[0] * 1.1 },
      { ...mix(b.pts[0], b.pts[1], 0.5), w: b.w[0] * 0.9 },
      { ...b.pts[1], w: b.w[1] },
      { ...mix(b.pts[1], b.pts[2], 0.6), w: b.w[1] * 0.6 },
      { ...b.pts[2], w: 0.4 },
    ], rng.range(0.66, 0.78), b.birth, { dryness: 0.25 });
  });
  for (const b of twigs) {
    b.birth = clampN(0.24 + 0.3 * T(b.d0), 0.26, 0.54);
    push('brush', b.pts.map((p, i) => ({ ...p, w: b.w[i] })), rng.range(0.82, 0.93), b.birth, { dryness: 0.1 });
  }

  // --- the trunk grows old (0.3–0.5), limbs thicken (0.34–0.5) ---------------------
  paintTrunk(rng, trunk, topIdx, brokenTop, hollow, side);
  for (const b of limbs) paintBranch(rng, b, 0.34 + 0.16 * T(b.d0) / 0.5, rng.range(0.55, 0.66));

  // --- moss on the limbs near the crotches ------------------------------------
  for (const b of limbs) {
    if (!rng.chance(0.55)) continue;
    const q = at(b, rng.range(0.05, 0.3));
    const nx = Math.cos(q.a), ny = Math.sin(q.a);
    const s = rng.chance(0.5) ? 1 : -1;
    const n = rng.int(1, 3);
    const bm = rng.range(0.5, 0.6);
    for (let k = 0; k < n; k++) {
      const o = q.w * 0.5 * s * rng.range(0.8, 1.2);
      push('dot', [{ x: q.p.x + nx * o + rng.range(-3, 3), y: q.p.y + ny * o + rng.range(-3, 3), w: rng.range(2, 3.6) }], rng.range(0.85, 0.95), bm + k * 0.003);
    }
  }

  // --- buds & blossoms ------------------------------------------------------
  paintBlossoms(rng, { trunk, limbs, secs, whips, twigs, shoot }, style, density);

  // every check-in should add something: fill any quiet stretch with a moss dot on the old stump
  {
    const g = (n: number) => 0.06 + 0.94 * (1 - Math.exp(-n / 21));
    for (let n = 1; n <= 24; n++) {
      if (out.some((st) => st.birth > g(n - 1) && st.birth <= g(n))) continue;
      const q = at(trunk, rng.range(0.05, 0.9) * (stumpH / trunkLen));
      const s2 = rng.chance(0.6) ? 1 : -1;
      const nrm = dir(q.a + (s2 * Math.PI) / 2);
      push('dot', [{ ...add(q.p, nrm, q.w * 0.5 * rng.range(0.85, 1.1)), w: rng.range(2, 3.8) }], rng.range(0.86, 0.95), (g(n - 1) + g(n)) / 2);
    }
  }

  return finalize(out, spec.height);
}

// ---------------------------------------------------------------------------

function paintBranch(rng: Rng, b: Branch, birth: number, tone: number) {
  const n = b.pts.length - 1;
  let i = 0, k = 0;
  while (i < n) {
    const run = Math.min(n - i, rng.int(2, 3));
    const last = i + run === n;
    const pts = runSpine(rng, b, i, i + run, 1, last ? 0.3 : 0.95);
    pts[0].w *= 1.1; // 起笔 a touch heavier
    const thick = b.w[i] > 7;
    push(thick ? 'dry' : 'brush', pts, tone * rng.range(0.92, 1.08), birth + k * 0.004, {
      dryness: thick ? rng.range(0.3, 0.45) : rng.range(0.15, 0.35),
    });
    i += run;
    k++;
  }
}

interface TS { p: P; nx: number; ny: number; hw: number; seg: number; t: number; u: number }

/** Dense spine samples of the trunk with smoothed normals (right-hand normal: +x for an upward spine). */
function trunkSamples(rng: Rng, trunk: Branch): TS[] {
  const n = trunk.pts.length - 1;
  const S: TS[] = [];
  const segN = (i: number) => {
    const a = trunk.pts[i], b = trunk.pts[i + 1];
    const L = dist(a, b);
    return { nx: -(b.y - a.y) / L, ny: (b.x - a.x) / L };
  };
  const bows = trunk.pts.map(() => rng.range(-0.05, 0.05));
  for (let i = 0; i < n; i++) {
    const a = trunk.pts[i], b = trunk.pts[i + 1];
    const L = dist(a, b);
    const nn = segN(i);
    const m = 8;
    for (let k = 0; k < m; k++) {
      const t = k / m;
      let { nx, ny } = nn;
      if (k === 0 && i > 0) {
        const pn = segN(i - 1);
        nx = (nx + pn.nx) / 2; ny = (ny + pn.ny) / 2;
        const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      }
      const o = Math.sin(Math.PI * t) * bows[i] * L;
      const p = mix(a, b, t);
      S.push({ p: { x: p.x + nn.nx * o, y: p.y + nn.ny * o }, nx, ny, hw: (trunk.w[i] + (trunk.w[i + 1] - trunk.w[i]) * t) / 2, seg: i, t, u: 0 });
    }
  }
  const nl = segN(n - 1);
  S.push({ p: trunk.pts[n], nx: nl.nx, ny: nl.ny, hw: trunk.w[n] / 2, seg: n - 1, t: 1, u: 1 });
  S.forEach((q, i) => (q.u = i / (S.length - 1)));
  // lift the foot a little so the round start of the broad strokes doesn't sink below the ground
  S[0].p = { x: S[0].p.x, y: S[0].p.y - S[0].hw * 0.55 };
  return S;
}

const offS = (q: TS, k: number): P => ({ x: q.p.x + q.nx * q.hw * k, y: q.p.y + q.ny * q.hw * k });

/** Day one: a short, burnt-ink (焦墨) stump with a broken, dry-brush cut top. */
function paintStump(rng: Rng, trunk: Branch, stumpH: number, side: number) {
  const S = trunkSamples(makeRng(7), trunk);
  const L = polyLen(trunk.pts);
  const iTop = Math.max(3, S.findIndex((q) => q.u * L >= stumpH));
  const part = S.slice(0, iTop + 1);
  const band = (k: number, wf: (q: TS, v: number) => number) => part.map((q, j) => ({ ...offS(q, k), w: wf(q, j / (part.length - 1)) }));
  push('dry', band(0.05, (q) => q.hw * 1.8), rng.range(0.38, 0.46), 0, { dryness: 0.35 });
  push('dry', band(0.78, (q, v) => q.hw * 0.5 * (0.7 + 0.3 * Math.sin(Math.PI * v))), rng.range(0.86, 0.94), 0.006, { dryness: 0.3 });
  push('dry', band(-0.8, (q, v) => q.hw * 0.34 * (0.6 + 0.4 * Math.sin(Math.PI * v))), rng.range(0.72, 0.84), 0.012, { dryness: 0.4 });
  // the cut: two jagged dry strokes that don't close into a lid
  const q = S[iTop];
  const c1 = offS(q, -0.95), c2 = offS(q, 0.95);
  const up = dir(Math.atan2(q.ny, q.nx)); // along the spine, upward
  const mid = add(mix(c1, c2, rng.range(0.35, 0.6)), { x: -up.x, y: -up.y }, -q.hw * rng.range(0.25, 0.6));
  push('dry', [{ ...c1, w: q.hw * 0.4 }, { ...mid, w: q.hw * 0.28 }], 0.9, 0.018, { dryness: 0.55 });
  push('dry', [{ ...mid, w: q.hw * 0.3 }, { ...add(c2, up, -q.hw * 0.2), w: q.hw * 0.18 }], 0.84, 0.02, { dryness: 0.6 });
  // moss dots at the foot and the lip
  for (let k = 0; k < 3; k++) {
    const qq = S[k < 2 ? rng.int(1, Math.max(2, iTop - 2)) : iTop - 1];
    const s = k === 1 ? -side : side;
    push('dot', [{ ...offS(qq, s * rng.range(0.85, 1.1)), w: rng.range(2.4, 4.2) }], rng.range(0.88, 0.96), 0.022 + k * 0.002);
  }
}

function paintTrunk(rng: Rng, trunk: Branch, topIdx: number, brokenTop: boolean, hollow: boolean, side: number) {
  const n = trunk.pts.length - 1;
  const S = trunkSamples(rng, trunk);
  const off = offS;
  const band = (i0: number, i1: number, k: number, wf: (q: TS, v: number) => number) =>
    S.slice(i0, i1 + 1).map((q, j, arr) => ({ ...off(q, k), w: wf(q, j / Math.max(1, arr.length - 1)) }));
  const N = S.length - 1;
  const split = Math.floor(S.length * rng.range(0.4, 0.6));
  const swell = (v: number) => 0.55 + 0.45 * Math.sin(Math.PI * clampN(v * 1.15, 0, 1));

  // root flare
  for (const s of [-1, 1]) {
    const hw = trunk.w[0] / 2;
    const a = { x: s * hw * 0.2, y: -0.045 * H };
    const b = { x: s * (hw + rng.range(0.03, 0.06) * H), y: rng.range(-0.003, 0.004) * H };
    push('dry', bowed(a, b, hw * 0.95, 1.2, s * 0.14, 5), s > 0 ? 0.55 : 0.4, 0.3, { dryness: 0.55 });
  }

  // body: pale side-brush rubs with plenty of 飞白, from the ground up, then a mid-tone mass on the shadow side
  const endW = brokenTop ? 0.95 : 0.8;
  push('dry', band(0, split + 2, 0, (q) => q.hw * 1.9), rng.range(0.24, 0.3), 0.31, { dryness: 0.4 });
  push('dry', band(split - 2, N, 0, (q, v) => q.hw * 1.9 * (1 - (1 - endW) * v)), rng.range(0.24, 0.3), 0.33, { dryness: 0.45 });
  push('dry', band(0, N, 0.42, (q, v) => q.hw * 1.0 * (1 - 0.3 * v)), rng.range(0.32, 0.4), 0.35, { dryness: 0.45 });

  // contours: broken dry brush in three runs a side, the shadow side (right) heavier
  for (const s of [1, -1]) {
    const cuts = [0, Math.floor(N * rng.range(0.28, 0.4)), Math.floor(N * rng.range(0.58, 0.72)), N];
    for (let k = 0; k < 3; k++) {
      const i0 = Math.max(0, cuts[k] + (k ? rng.int(0, 2) : 0)), i1 = Math.min(N, cuts[k + 1] + rng.int(-1, 1));
      if (i1 - i0 < 2) continue;
      const kk = s * rng.range(0.74, 0.84);
      push('dry', band(i0, i1, kk, (q, v) => q.hw * (s > 0 ? 0.48 : 0.32) * swell(v)), s > 0 ? rng.range(0.74, 0.86) : rng.range(0.5, 0.62), 0.37 + k * 0.012 + (s > 0 ? 0 : 0.006), { dryness: rng.range(0.4, 0.6) });
    }
  }

  // broken top: a jagged, dry-brush break — no lid
  if (brokenTop) {
    const q = S[N];
    const c1 = off(q, -0.95), c2 = off(q, 0.95);
    const up = dir(angOf(trunk.pts[n - 1], trunk.pts[n]));
    const mid = add(mix(c1, c2, rng.range(0.35, 0.65)), up, q.hw * rng.range(-0.2, 0.5));
    push('dry', [{ ...c1, w: q.hw * 0.42 }, { ...mid, w: q.hw * 0.25 }], 0.86, 0.41, { dryness: 0.6 });
    push('dry', [{ ...mid, w: q.hw * 0.3 }, { ...add(c2, up, -q.hw * 0.4), w: q.hw * 0.15 }], 0.8, 0.412, { dryness: 0.65 });
  }

  // hollow (some seeds): a ragged, lopsided rot opening, dark on one lip only
  if (hollow && N > 12) {
    const i0 = Math.floor(N * rng.range(0.22, 0.34));
    const i1 = Math.floor(N * rng.range(0.52, 0.68));
    const shift = rng.range(-0.2, 0.15);
    const inner: StrokePoint[] = [];
    const outer: StrokePoint[] = [];
    for (let i = i0; i <= i1; i++) {
      const q = S[i];
      const v = Math.pow(Math.sin((Math.PI * (i - i0)) / (i1 - i0)), 0.7);
      const jag = rng.range(-0.08, 0.08);
      inner.push({ ...off(q, shift - (0.5 + jag) * v), w: 0.6 + q.hw * 0.38 * v * rng.range(0.7, 1.2) });
      if (i < i0 + (i1 - i0) * 0.75) outer.push({ ...off(q, shift + (0.22 + jag) * v), w: 0.5 + q.hw * 0.12 * v });
    }
    push('dry', inner, 0.88, 0.42, { dryness: 0.4 });
    if (outer.length > 2) push('dry', outer, 0.5, 0.421, { dryness: 0.6 });
  }

  // bark rubs 皴: short dry strokes along the grain
  const nTex = rng.int(4, 6);
  for (let k = 0; k < nTex; k++) {
    const i = rng.int(2, N - 6);
    const j = Math.min(N, i + rng.int(3, 6));
    const u = rng.range(-0.5, 0.55);
    const a = off(S[i], u), b = off(S[j], u + rng.range(-0.2, 0.2));
    push('dry', bowed(a, b, S[i].hw * rng.range(0.16, 0.28), 0.6, rng.range(-0.12, 0.12), 4), rng.range(0.42, 0.58), 0.43 + k * 0.004, { dryness: 0.55 });
  }

  // a split (裂) along the grain, with moss gathering in it
  {
    const i0 = Math.floor(N * rng.range(0.25, 0.45)), i1 = Math.min(N - 2, i0 + Math.floor(N * rng.range(0.18, 0.3)));
    const u0 = rng.range(-0.3, 0.25);
    const pts = S.slice(i0, i1 + 1).map((q, j, arr) => ({ ...off(q, u0 + 0.12 * Math.sin(j * 1.7) + rng.range(-0.04, 0.04)), w: 0.6 + q.hw * 0.16 * Math.sin(Math.PI * (j / Math.max(1, arr.length - 1))) }));
    push('dry', pts, 0.82, 0.45, { dryness: 0.45 });
    const nm = rng.int(2, 3);
    for (let k = 0; k < nm; k++) {
      const q = S[rng.int(i0, i1)];
      push('dot', [{ ...off(q, u0 + rng.range(-0.25, 0.25)), w: rng.range(2, 3.6) }], rng.range(0.86, 0.96), 0.452 + k * 0.003);
    }
  }

  // dark accents 醒笔 on the shadow edge by the joints
  for (let i = 1; i <= Math.min(n, topIdx); i++) {
    if (!rng.chance(0.7)) continue;
    const q = S[Math.min(N, i * 8 - rng.int(1, 3))];
    const s = rng.chance(0.75) ? 1 : -1;
    const a = off(q, 0.88 * s);
    const ang = Math.atan2(q.ny, q.nx) + Math.PI; // along the spine, pointing down
    const b = add(a, dir(ang + s * rng.range(-0.05, 0.12)), rng.range(0.025, 0.045) * H);
    push('brush', bowed(a, b, q.hw * 0.28, 0.7, rng.range(-0.1, 0.1), 3), rng.range(0.82, 0.92), 0.46 + i * 0.005, { dryness: 0.35 });
  }

  // moss dots 苔点, in little groups straddling the contour
  const groups = rng.int(2, 3);
  for (let g = 0; g < groups; g++) {
    const q = S[rng.int(Math.floor(N * (g === 0 ? 0.02 : 0.35)), Math.floor(N * (g === 0 ? 0.25 : 0.95)))];
    const s = side * (g % 2 ? -1 : 1);
    const n2 = rng.int(2, 3);
    for (let k = 0; k < n2; k++) {
      const u = s * rng.range(0.85, 1.12);
      const along = rng.range(-6, 6);
      push('dot', [{ x: q.p.x + q.nx * q.hw * u - q.ny * along, y: q.p.y + q.ny * q.hw * u + q.nx * along, w: rng.range(2.2, 4.4) }], rng.range(0.86, 0.96), 0.48 + g * 0.02 + k * 0.004);
    }
  }
}

// ---------------------------------------------------------------------------
// blossoms

interface Site { p: P; a: number; wt: number; hw: number; b0: number }
type View = 'face' | 'tilt' | 'side' | 'back';

function paintBlossoms(
  rng: Rng,
  tree: { trunk: Branch; limbs: Branch[]; secs: Branch[]; whips: Branch[]; twigs: Branch[]; shoot: Branch },
  style: 'rouge' | 'ink',
  density: number,
) {
  const r0 = rng.range(0.03, 0.036) * H; // flower radius
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
      sites.push({ p: q.p, a: q.a, wt: wt * (near < r0 ? 2.2 : 1), hw: q.w / 2, b0: b.birth });
    }
  };
  tree.limbs.forEach((b) => addSites(b, 0.35, 0.5));
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
  const nFocal = rng.int(2, 3);
  for (let tries = 0; tries < 40 && focal.length < nFocal; tries++) {
    const s = rng.pick(sites);
    if (focal.every((f) => dist(f, s.p) > 0.22 * H)) focal.push(s.p);
  }
  for (const s of sites) {
    let m = 1e9;
    for (const f of focal) m = Math.min(m, dist(f, s.p));
    s.wt *= 0.2 + Math.exp(-(m * m) / (2 * (0.09 * H) ** 2));
  }
  const pickSite = () => {
    let x = rng() * sites.reduce((a, s) => a + s.wt, 0);
    for (const s of sites) if ((x -= s.wt) <= 0) return s;
    return sites[sites.length - 1];
  };

  interface F { c: P; r: number; view: View; phi: number; b0: number; first?: boolean }
  interface Bd { p: P; a: number; r: number; b0: number }
  const flowers: F[] = [];
  const buds: Bd[] = [];
  const pickView = (): View => {
    const u = rng();
    return u < 0.34 ? 'face' : u < 0.64 ? 'tilt' : u < 0.84 ? 'side' : 'back';
  };
  const room = (c: P, r: number, k = 0.95) => flowers.every((f) => dist(f.c, c) > (f.r + r) * k) && trunkClear(c, r);

  // 1 · the first blossom opens on the fresh shoot, just below its rouge bud (check-in ~7)
  {
    const q = at(tree.shoot, rng.range(0.58, 0.78));
    const sg = rng.chance(0.5) ? 1 : -1;
    const r = r0 * rng.range(0.95, 1.08);
    const nrm = q.a + (sg * Math.PI) / 2;
    const c = add(q.p, dir(nrm), q.w / 2 + r * (style === 'ink' ? 0.7 : 0.35));
    flowers.push({ c, r, view: rng.chance(0.6) ? 'face' : 'tilt', phi: nrm * 0.7, b0: 0, first: true });
  }

  // 2 · twig ends: a third left bare and tapering, some with buds of different sizes, some in flower
  for (const b of [...tree.twigs, ...tree.secs, ...tree.whips]) {
    const p = b.pts[b.pts.length - 1];
    const a = angOf(b.pts[b.pts.length - 2], p);
    const u = rng();
    if (u < 0.34) continue;
    if (u < 0.74) {
      const r = r0 * rng.range(0.16, 0.34);
      const c = add(p, dir(a + rng.range(-0.35, 0.35)), r * 0.7);
      if (!room(c, r, 0.6)) continue;
      buds.push({ p: c, a, r, b0: b.birth });
      if (rng.chance(0.25)) {
        const s2 = rng.chance(0.5) ? 1 : -1;
        const r2 = r * rng.range(0.55, 0.8);
        buds.push({ p: add(add(p, dir(a), -r * 1.6), dir(a + s2 * 1.3), r2 + b.w[b.w.length - 1]), a: a + s2 * 0.9, r: r2, b0: b.birth });
      }
    } else {
      const r = r0 * rng.range(0.8, 1);
      const c = add(p, dir(a), r * 0.5);
      if (!room(c, r)) continue;
      flowers.push({ c, r, view: rng.chance(0.5) ? 'side' : 'tilt', phi: a, b0: b.birth });
    }
  }

  // 3 · blossoms along the branches, gathered round the focal clusters
  const nF = Math.round(rng.range(10, 15) * density);
  for (let tries = 0; tries < 400 && flowers.length < nF && sites.length; tries++) {
    const s = pickSite();
    const r = r0 * rng.range(0.8, 1.12);
    const sg = rng.chance(0.5) ? 1 : -1;
    const nrm = s.a + (sg * Math.PI) / 2;
    const off = s.hw + r * (style === 'ink' ? rng.range(0.5, 0.9) : rng.range(0.05, 0.6));
    const c = add(s.p, dir(nrm), off);
    if (!room(c, r, rng.chance(0.3) ? 0.62 : 0.95)) continue;
    // flowers face outward from the branch and a little upward
    flowers.push({ c, r, view: pickView(), phi: nrm * 0.7 + rng.range(-0.5, 0.5), b0: s.b0 });
    s.wt *= 0.3;
  }
  // and a few buds along the branches
  for (const b of [...tree.secs, ...tree.whips]) {
    if (!rng.chance(0.35)) continue;
    const q = at(b, rng.range(0.4, 0.85));
    const s2 = rng.chance(0.5) ? 1 : -1;
    const r = r0 * rng.range(0.18, 0.3);
    const c = add(q.p, dir(q.a + s2 * 1.2), q.w / 2 + r * 0.8);
    if (room(c, r, 0.7)) buds.push({ p: c, a: q.a + s2 * 0.9, r, b0: b.birth });
  }

  // buds swell soon after their twig
  for (const b of buds) {
    const birth = clampN(b.b0 + rng.range(0.025, 0.07), 0.1, 0.64);
    const base = add(b.p, dir(b.a), -b.r * 0.75);
    if (style === 'rouge') push('dot', [{ ...b.p, w: b.r * 2 }], rng.range(0.6, 0.82), birth, { color: PIGMENTS.rouge });
    else push('dot', [{ ...b.p, w: b.r * 1.6 }], rng.range(0.55, 0.8), birth);
    push('dot', [{ ...base, w: b.r * 0.85 }], 0.92, birth);
  }

  // blossoms open: the first on the shoot at check-in ~7 (0.315), a real bloom by ~21 (0.65),
  // full splendour near 66 (0.98); each after its own branch
  const rest = flowers
    .filter((f) => !f.first)
    .map((f) => ({ f, k: rng() * 0.5 + (focal.length ? dist(f.c, focal[0]) / H : 0) }))
    .sort((x, y) => x.k - y.k);
  flowers.filter((f) => f.first).forEach((f) => paintFlower(rng, f.c, f.r, f.view, f.phi, style, 0.315));
  rest.forEach(({ f }, i) => {
    const t = 0.34 + 0.64 * Math.pow(i / Math.max(1, rest.length - 1), 1.1);
    paintFlower(rng, f.c, f.r, f.view, f.phi, style, clampN(Math.max(t, f.b0 + 0.05), 0, 1));
  });
}

function paintFlower(rng: Rng, c: P, r: number, view: View, phi: number, style: 'rouge' | 'ink', birth: number) {
  const tilt = view === 'face' ? rng.range(0.86, 1) : view === 'tilt' ? rng.range(0.56, 0.78) : view === 'side' ? rng.range(0.36, 0.5) : rng.range(0.7, 0.92);
  const fd = dir(phi); // the way the flower's face turns
  // view transform: squash along fd by `tilt`, and slide the petal ring toward the face side
  const shift = (1 - tilt) * 0.35 * r;
  const T = (x: number, y: number): P => {
    const along = x * fd.x + y * fd.y;
    const perp = -x * fd.y + y * fd.x;
    const a2 = along * tilt;
    return { x: c.x + fd.x * (a2 + shift) - fd.y * perp, y: c.y + fd.y * (a2 + shift) + fd.x * perp };
  };
  const th0 = rng.range(0, Math.PI * 2);
  const ring = style === 'ink' ? 0.6 : 0.52;
  const pr = style === 'ink' ? 0.38 : 0.47;
  interface Pet { cx: number; cy: number; depth: number; th: number }
  const pets: Pet[] = [];
  for (let k = 0; k < 5; k++) {
    const th = th0 + (k * Math.PI * 2) / 5 + rng.range(-0.12, 0.12);
    const cx = Math.cos(th) * r * ring, cy = Math.sin(th) * r * ring;
    pets.push({ cx, cy, th, depth: -(cx * fd.x + cy * fd.y) });
  }
  pets.sort((a, b) => a.depth - b.depth); // far first
  if (view === 'side') pets.shift(); // a side view hides the petal turned furthest away

  const petalPoly = (pt: Pet, scale = 1): StrokePoint[] => {
    const pts: StrokePoint[] = [];
    const m = 11;
    const rr = r * pr * rng.range(0.9, 1.08) * scale;
    for (let i = 0; i < m; i++) {
      const t = (i / m) * Math.PI * 2;
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
    const base = rng.range(0.4, 0.66);
    for (const pt of pets) push('fill', petalPoly(pt), base * rng.range(0.8, 1.18), birth, { color: PIGMENTS.rouge });
  } else {
    const tone = rng.range(0.4, 0.55);
    for (const pt of pets) {
      if (view !== 'face') push('fill', petalPoly(pt, 0.98), 0.92, birth, { color: PIGMENTS.white });
      // outline drawn as an open circle, starting and ending at the petal's base
      const rr = r * pr * rng.range(0.92, 1.06);
      const pts: StrokePoint[] = [];
      const m = 12;
      const gap = rng.range(0.2, 0.6);
      for (let i = 0; i <= m; i++) {
        const t = pt.th + Math.PI + gap / 2 + (i / m) * (Math.PI * 2 - gap);
        const lx = Math.cos(t) * rr * 1.06, ly = Math.sin(t) * rr;
        const x = pt.cx + lx * Math.cos(pt.th) - ly * Math.sin(pt.th);
        const y = pt.cy + lx * Math.sin(pt.th) + ly * Math.cos(pt.th);
        pts.push({ ...T(x, y), w: 0.5 + 0.5 * Math.sin(Math.PI * (i / m)) });
      }
      push('line', pts, tone * rng.range(0.9, 1.12), birth);
    }
  }

  // stamens 点蕊: fine filaments out of the heart, each tipped with a dark dot
  const heart = T(0, 0);
  if (view !== 'back') {
    const n = view === 'face' ? rng.int(5, 7) : view === 'tilt' ? rng.int(4, 5) : 3;
    const spread = view === 'tilt' ? 0.9 : 0.5;
    const tips: P[] = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0.5 : k / (n - 1);
      const a = view === 'face' ? th0 + ((k + 0.5) / n) * Math.PI * 2 + rng.range(-0.3, 0.3) : phi + (u - 0.5) * 2 * spread + rng.range(-0.12, 0.12);
      const len = r * (view === 'face' ? rng.range(0.32, 0.56) : rng.range(0.5, 0.75));
      const tip = add(heart, dir(a), len);
      const mid = add(mix(heart, tip, 0.5), dir(a + Math.PI / 2), len * rng.range(-0.12, 0.12));
      push('line', [{ ...heart, w: 0.5 }, { ...mid, w: 0.45 }, { ...tip, w: 0.35 }], rng.range(0.45, 0.6), birth);
      tips.push(tip);
    }
    for (const tp of tips) push('dot', [{ ...tp, w: r * rng.range(0.11, 0.17) }], rng.range(0.82, 0.95), birth);
  }
  // calyx 蒂: dark dots at the base of turned and back-facing flowers
  if (view === 'back') {
    for (let k = 0; k < 5; k++) {
      const a = th0 + (k * Math.PI * 2) / 5 + Math.PI / 5;
      push('dot', [{ ...T(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2), w: r * 0.24 }], 0.88, birth);
    }
  } else if (view !== 'face') {
    const base = add(c, fd, -r * (0.25 + 0.3 * (1 - tilt)));
    const n = view === 'side' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * r * 0.24;
      push('dot', [{ x: base.x - fd.y * o, y: base.y + fd.x * o, w: r * rng.range(0.2, 0.28) }], 0.9, birth);
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
