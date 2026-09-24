// 竹 Bamboo — ink bamboo in the manner of 文同 and 郑板桥.
//
// Anatomy (everything is a `brush` stroke except the moss dots):
//   竿 culm    one stroke per internode, painted bottom-up; blunt, slightly swollen ends and a
//              small gap between internodes. Internodes are short at the foot, long in the
//              middle, short again toward the thin top.
//   节 node    a short dark ⌣ / 乙 / 八 stroke bridging each gap.
//   枝 branch  thin, jointed, zig-zag strokes from the upper nodes, twigs off the joints.
//   叶 leaf    tapering strokes — a pointed tip, the belly ~⅓ from the base, a slight droop —
//              grouped as 分 (2), 个 (3), 介 (4) and 重个 (two 个 overlapping).
//
// Composition: foliage gathers into two or three masses (密) with bare culm between them (疏);
// the seed also picks a mood — 晴 still (leaves spread), 雨 rain (leaves hang), 风 wind (culms
// bow and every leaf streams one way).
// Depth: the main culm and its leaves are 浓 (dark); a second culm is 重; a far culm and the
// clusters "behind" are 淡 (pale).
//
// Growth (strokes sorted by `birth`):
//   0.00–0.08  a young shoot (新篁) at the foot with its first few leaves
//   0.08–0.30  a second, medium culm; its foliage fills in from the crown down
//   0.30–0.58  the main culm, then its foliage from the crown down
//   0.58–0.90  secondary branches, pale clusters behind, a far pale culm
//   0.92–1.00  moss dots at the foot
import type { Drawing, PlantSpec, Stroke, StrokePoint } from '../types';
import { PIGMENTS } from '../types';
import { makeRng, mixSeed } from '../../core/rng';

type V = { x: number; y: number };
const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Angles are measured clockwise from straight up (canvas y points down). */
const dirOf = (a: number): V => ({ x: Math.sin(a), y: -Math.cos(a) });

type Role = 'sprout' | 'mid' | 'main' | 'far';
type Mood = 'still' | 'rain' | 'wind';

interface Culm {
  role: Role;
  base: V;
  h: number;
  w: number;
  tone: number;
  nodeTone: number;
  leafTone: number;
  leafLen: number;
  leafW: number;
  /** the side most of its foliage hangs on */
  side: number;
  spine: { x: number; y: number; a: number }[];
  nodes: number[]; // arc-length positions of the internode boundaries, 0 … h
}

/** A group of strokes that appear together (a culm's segments, a branch with its leaves…). */
interface Unit {
  strokes: Stroke[];
  birth: number;
  /** birth spacing between consecutive strokes of the unit */
  step?: number;
}

export function bamboo(spec: PlantSpec): Drawing {
  const H = spec.height;
  const rng = makeRng(mixSeed(spec.seed >>> 0, 0x6ba3b00));
  const sd = () => rng.int(1, 0x7fffffff);
  const brush = (pts: StrokePoint[], tone: number, extra: Partial<Stroke> = {}): Stroke => ({
    kind: 'brush', pts, tone: clamp(tone, 0.05, 1), birth: 0, seed: sd(), ...extra,
  });
  // Minimum widths in absolute px keep small plants legible on phones.
  const minW = (w: number, m: number) => Math.max(m, w);

  const dir = rng.chance(0.5) ? 1 : -1; // the main culm leans this way
  const r = rng();
  const mood: Mood = r < 0.42 ? 'still' : r < 0.72 ? 'rain' : 'wind';
  const mainW = H * rng.range(0.028, 0.034);

  // ---------------------------------------------------------------- culms

  function makeCulm(role: Role, base: V, h: number, w: number, segs: number, lean: number, bend: number,
    tone: number, nodeTone: number, leafTone: number, leafScale: number): Culm {
    const M = 60;
    const spine: Culm['spine'] = [];
    const ph = rng.range(0, Math.PI * 2);
    const wob = rng.range(0.4, 1.4) * DEG;
    let x = base.x, y = base.y;
    const ds = h / M;
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      const a = lean + bend * t * t + wob * Math.sin(ph + t * 5);
      spine.push({ x, y, a });
      x += Math.sin(a) * ds;
      y -= Math.cos(a) * ds;
    }
    // Internodes: short at the foot, longest a little below the middle, short at the top.
    const wts: number[] = [];
    for (let i = 0; i < segs; i++) {
      const u = (i + 0.5) / segs;
      wts.push((0.42 + 0.78 * Math.sin(Math.PI * Math.pow(u, 0.72))) * rng.range(0.88, 1.12));
    }
    const sum = wts.reduce((a, b) => a + b, 0);
    const nodes = [0];
    for (const wt of wts) nodes.push(nodes[nodes.length - 1] + (wt / sum) * h);
    nodes[nodes.length - 1] = h;
    const leafLen = H * rng.range(0.16, 0.185) * leafScale * (mood === 'rain' ? 1.06 : 1);
    const side = Math.abs(lean + bend) > 3 * DEG ? Math.sign(lean + bend) : rng.chance(0.5) ? 1 : -1;
    return {
      role, base, h, w, tone, nodeTone, leafTone, leafLen, leafW: leafLen * rng.range(0.12, 0.135) * (mood === 'rain' ? 0.92 : 1),
      side, spine, nodes,
    };
  }

  function at(c: Culm, s: number) {
    const M = c.spine.length - 1;
    const f = clamp(s / c.h, 0, 1) * M;
    const i = Math.min(M - 1, Math.floor(f));
    const k = f - i;
    const p = c.spine[i], q = c.spine[i + 1];
    return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), a: lerp(p.a, q.a, k) };
  }
  const wAt = (c: Culm, s: number) => c.w * (1 - 0.5 * Math.pow(clamp(s / c.h, 0, 1), 1.4));
  const gapAt = (c: Culm, s: number) => Math.max(1.1, wAt(c, s) * rng.range(0.26, 0.36));

  /** Internode strokes + node marks, bottom-up. Returned in paint order. */
  function culmStrokes(c: Culm): Stroke[] {
    const out: Stroke[] = [];
    const n = c.nodes.length - 1;
    const gaps = c.nodes.map((s) => gapAt(c, s));
    for (let i = 0; i < n; i++) {
      const s0 = c.nodes[i] + (i === 0 ? 0 : gaps[i] / 2);
      const s1 = c.nodes[i + 1] - (i === n - 1 ? 0 : gaps[i + 1] / 2);
      const top = i === n - 1;
      const prof: [number, number][] = i === 0
        ? [[0, 1.02], [0.12, 1.0], [0.5, 0.94], [0.86, 0.98], [0.96, 1.05], [1, 0.84]]
        : top
          ? [[0, 0.8], [0.05, 1.04], [0.2, 0.97], [0.55, 0.8], [0.85, 0.55], [1, 0.3]]
          : [[0, 0.8], [0.045, 1.07], [0.15, 1.0], [0.5, 0.93], [0.86, 0.98], [0.955, 1.06], [1, 0.84]];
      const pts = prof.map(([u, f]) => {
        const s = lerp(s0, s1, u);
        const p = at(c, s);
        return { x: p.x, y: p.y, w: minW(wAt(c, s) * f, 1.2) };
      });
      out.push(brush(pts, c.tone + rng.range(-0.05, 0.04), { dryness: rng.range(0.2, 0.45) }));
      if (i < n - 1) out.push(...nodeMark(c, c.nodes[i + 1]));
    }
    return out;
  }

  /** 节 — a short dark stroke across the gap, shaped like a flattened ⌣, 乙 or 八. */
  function nodeMark(c: Culm, s: number): Stroke[] {
    const p = at(c, s);
    const w = wAt(c, s);
    const t = dirOf(p.a), nr = { x: Math.cos(p.a), y: Math.sin(p.a) };
    const L = (u: number, v: number) => ({ x: p.x + nr.x * u + t.x * v, y: p.y + nr.y * u + t.y * v });
    const hw = w * rng.range(0.56, 0.68);
    const th = minW(w * rng.range(0.2, 0.28), 1);
    const tone = c.nodeTone + rng.range(-0.04, 0.05);
    const flip = rng.chance(0.5) ? 1 : -1; // which end carries the pressure
    const kind = rng();
    if (kind < 0.45) {
      // ⌣ — ends lifted, heavier at the start
      const us = [-1, -0.62, -0.2, 0.22, 0.62, 1];
      const ws = [0.35, 0.95, 1, 0.9, 0.7, 0.25];
      const lift = rng.range(0.1, 0.16);
      return [brush(us.map((u, i) => ({ ...L(u * hw * flip, w * (lift * u * u - lift * 0.5)), w: th * ws[i] })), tone)];
    }
    if (kind < 0.8) {
      // 乙 — a small entry tick, a gently rising body, a hooked exit
      const pts = [
        { u: -1, v: 0.06, f: 0.3 }, { u: -0.86, v: -0.05, f: 0.95 }, { u: -0.4, v: -0.02, f: 0.85 },
        { u: 0.3, v: 0.05, f: 0.8 }, { u: 0.82, v: 0.07, f: 0.75 }, { u: 1, v: -0.05, f: 0.25 },
      ];
      return [brush(pts.map((q) => ({ ...L(q.u * hw * flip, q.v * w), w: th * q.f })), tone)];
    }
    // 八 — two short strokes that nearly meet in the middle
    const a1 = [{ u: -0.12, v: 0.05, f: 0.9 }, { u: -0.55, v: 0.0, f: 0.8 }, { u: -1, v: -0.06, f: 0.2 }];
    const a2 = [{ u: 0.1, v: 0.05, f: 0.9 }, { u: 0.55, v: 0.0, f: 0.8 }, { u: 1, v: -0.07, f: 0.2 }];
    return [
      brush(a1.map((q) => ({ ...L(q.u * hw, q.v * w), w: th * q.f })), tone),
      brush(a2.map((q) => ({ ...L(q.u * hw, q.v * w), w: th * q.f })), tone),
    ];
  }

  // ---------------------------------------------------------------- leaves

  const leafProfile = (t: number) =>
    t < 0.32 ? 0.1 + 0.9 * Math.sin((t / 0.32) * (Math.PI / 2)) : Math.pow(1 - (t - 0.32) / 0.68, 1.15);

  function leaf(p: V, ang: number, len: number, wid: number, tone: number): Stroke {
    // Gravity rotates the tip toward straight down; a few leaves curl the other way.
    const g = Math.sin(ang) >= 0 ? 1 : -1;
    const k = mood === 'wind' ? 0.4 : 1;
    const bend = g * rng.range(-5, 16) * k * DEG * (0.35 + 0.65 * Math.abs(Math.sin(ang)));
    const n = 13;
    const ds = len / (n - 1);
    const pts: StrokePoint[] = [];
    let x = p.x, y = p.y;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push({ x, y, w: Math.max(t < 0.93 ? 0.7 : 0, wid * leafProfile(t)) });
      const a = ang - bend * 0.35 + bend * t * t;
      x += Math.sin(a) * ds;
      y -= Math.cos(a) * ds;
    }
    pts[n - 1].w = 0;
    return brush(pts, tone + rng.range(-0.07, 0.05), { dryness: rng.range(0.05, 0.25) });
  }

  const spread = () => (mood === 'still' ? rng.range(22, 34) : mood === 'rain' ? rng.range(11, 19) : rng.range(12, 21)) * DEG;

  /**
   * A cluster of leaves from one point. `ang` is the cluster's axis.
   * 2 → 分/人, 3 → 个, 4 → 介, 5–6 → 重个 (a second 个 tucked against the first).
   */
  function cluster(p: V, ang: number, n: number, len: number, wid: number, tone: number): Stroke[] {
    const out: Stroke[] = [];
    const jitter = () => rng.range(-5, 5) * DEG;
    // Side leaves land a little back along the twig, so the roots don't pile into one blot.
    const ax = dirOf(ang);
    const root = (back = 0): V => {
      const b = back * len * rng.range(0.5, 1);
      return { x: p.x - ax.x * b + rng.range(-0.025, 0.025) * len, y: p.y - ax.y * b + rng.range(-0.025, 0.025) * len };
    };
    const sz = () => rng.range(0.88, 1.1);
    if (n <= 2) {
      const d = spread() * 0.7;
      const l1 = rng.range(0.72, 0.88);
      const first = rng.chance(0.5);
      out.push(leaf(root(), ang - d + jitter(), len * (first ? 1 : l1), wid * sz(), tone));
      out.push(leaf(root(0.08), ang + d + jitter(), len * (first ? l1 : 1), wid * sz(), tone));
      return out;
    }
    if (n <= 4) {
      const d1 = spread(), d2 = spread() * rng.range(0.8, 1.1);
      const flip = rng.chance(0.5) ? 1 : -1;
      out.push(leaf(root(), ang + jitter(), len, wid * sz(), tone)); // the long middle stroke first
      out.push(leaf(root(0.07), ang - d1 * flip + jitter(), len * rng.range(0.7, 0.85), wid * sz(), tone));
      out.push(leaf(root(0.12), ang + d2 * flip + jitter(), len * rng.range(0.64, 0.8), wid * sz(), tone));
      if (n === 4) out.push(leaf(root(0.16), ang + (d2 + spread() * 0.8) * flip, len * rng.range(0.5, 0.66), wid * sz() * 0.9, tone));
      return out;
    }
    // 重个: two 个, the second a little further along and rotated
    out.push(...cluster(p, ang, 3, len, wid, tone));
    const fwd = dirOf(ang);
    const q = { x: p.x + fwd.x * len * 0.12 + rng.range(-0.06, 0.06) * len, y: p.y + fwd.y * len * 0.12 };
    const rot = (rng.chance(0.5) ? 1 : -1) * rng.range(14, 26) * DEG;
    out.push(...cluster(q, ang + rot, n - 3, len * 0.88, wid * 0.95, tone - 0.05));
    return out;
  }

  /** Axis for a leaf cluster on `side` at height fraction `u` of its culm. */
  function leafAxis(c: Culm, side: number, u: number) {
    const uu = clamp(u, 0, 1);
    if (mood === 'wind') return c.side * (lerp(116, 86, uu) + rng.range(-12, 12)) * DEG;
    if (mood === 'rain') return side * (lerp(166, 138, uu) + rng.range(-10, 10)) * DEG;
    return side * (lerp(150, 84, uu ** 1.4) + rng.range(-14, 14)) * DEG;
  }

  // ---------------------------------------------------------------- branches

  /** A jointed branch from `o`, with leaves off the joints and a cluster at the end. */
  function branch(c: Culm, o: V, ang: number, len: number, w0: number, side: number, u: number, big: boolean, depth = 0): Stroke[] {
    const out: Stroke[] = [];
    const nj = depth > 0 ? rng.int(1, 2) : big ? rng.int(2, 3) : rng.int(1, 2);
    const wts = [1, 0.8, 0.64].slice(0, nj);
    const tot = wts.reduce((a, b) => a + b, 0);
    const zig = rng.range(10, 20) * DEG;
    let p = o;
    let zs = rng.chance(0.5) ? 1 : -1;
    const behind = depth === 0 && !big && c.role !== 'far' && c.role !== 'sprout' && rng.chance(0.3);
    const lt = behind ? rng.range(0.3, 0.4) : c.leafTone + rng.range(-0.14, 0.05);
    const bt = behind ? 0.35 : c.nodeTone * rng.range(0.88, 1);
    for (let k = 0; k < nj; k++) {
      const a = ang + zs * zig * 0.5;
      const L = (wts[k] / tot) * len;
      const d = dirOf(a);
      const q = { x: p.x + d.x * L, y: p.y + d.y * L };
      const wa = w0 * (1 - 0.4 * (k / nj)), wb = w0 * (1 - 0.4 * ((k + 1) / nj));
      const gap = k === 0 ? 0 : Math.max(0.6, wa * 0.55);
      const bow = rng.range(-0.05, 0.05) * L;
      const nr = { x: -d.y, y: d.x };
      const pts: StrokePoint[] = [0, 0.1, 0.5, 0.9, 1].map((t, i) => {
        const tt = lerp(gap / L, 1, t);
        const b = Math.sin(Math.PI * t) * bow;
        const f = [0.8, 1.12, 0.95, 0.9, 0.75][i];
        return { x: p.x + d.x * L * tt + nr.x * b, y: p.y + d.y * L * tt + nr.y * b, w: minW(lerp(wa, wb, t) * f, 0.8) };
      });
      out.push(brush(pts, bt + rng.range(-0.05, 0.03), { dryness: 0.2 }));
      if (k < nj - 1) {
        if (big && depth === 0 && rng.chance(0.5)) {
          // a twig off the joint, to the other side of the zig
          const ta = a - zs * rng.range(26, 44) * DEG;
          out.push(...branch(c, q, ta, len * rng.range(0.3, 0.45), wb * 0.75, Math.sin(ta) >= 0 ? 1 : -1, u, false, 1));
        } else if (rng.chance(big ? 0.6 : 0.3)) {
          out.push(...cluster(q, leafAxis(c, side, u), rng.pick([2, 2, 3]), c.leafLen * rng.range(0.72, 0.86), c.leafW * 0.9, lt));
        }
      }
      p = q;
      zs = -zs;
    }
    const n = depth > 0 ? rng.pick([2, 3, 3]) : big ? rng.pick([4, 5, 6, 6]) : rng.pick([2, 3, 3]);
    const scale = depth > 0 ? 0.86 : big ? 1 : 0.9;
    const axis = leafAxis(c, side, u);
    out.push(...cluster(p, axis, n, c.leafLen * scale * rng.range(0.92, 1.08), c.leafW * scale, lt));
    if (depth === 0 && !behind && (c.role === 'main' || c.role === 'mid')) backs.push({ c, p, axis, side, u, big });
    return out;
  }

  /** Where pale leaves can later be tucked in behind a dark cluster (浓淡 layering). */
  const backs: { c: Culm; p: V; axis: number; side: number; u: number; big: boolean }[] = [];
  function backCluster(b: (typeof backs)[number]): Stroke[] {
    const rot = (rng.chance(0.5) ? 1 : -1) * rng.range(18, 34) * DEG;
    const q = { x: b.p.x + rng.range(-0.03, 0.03) * b.c.leafLen, y: b.p.y + rng.range(-0.02, 0.04) * b.c.leafLen };
    const n = b.big ? rng.pick([3, 3, 4]) : rng.pick([2, 3]);
    return cluster(q, b.axis + rot, n, b.c.leafLen * rng.range(0.82, 0.95), b.c.leafW * 0.92, rng.range(0.3, 0.42));
  }

  /** Crown: young leaves springing from the top of the culm (燕尾 / 竹梢) — never symmetric. */
  function crown(c: Culm): Stroke[] {
    const out: Stroke[] = [];
    const tip = at(c, c.h);
    const n = rng.pick([2, 3, 3, 3, 4]);
    const windy = mood === 'wind' ? c.side * rng.range(25, 45) : 0;
    const s1 = rng.chance(0.5) ? 1 : -1;
    const spec: [number, number][] = [
      [rng.range(-4, 10) * s1, rng.range(0.66, 0.78)],
      [rng.range(24, 38) * s1, rng.range(0.48, 0.6)],
      [-rng.range(16, 28) * s1, rng.range(0.36, 0.5)],
      [rng.range(48, 62) * s1, rng.range(0.4, 0.5)],
    ];
    for (let i = 0; i < n; i++) {
      const a = tip.a + (spec[i][0] + windy) * DEG;
      const p = at(c, c.h - (i === 0 ? 0 : rng.range(0.01, 0.04)) * c.h);
      out.push(leaf(p, a, c.leafLen * spec[i][1], c.leafW * rng.range(0.66, 0.78), c.leafTone));
    }
    return out;
  }

  /**
   * Foliage units of a culm: the crown first, then branches top-down. `masses` nodes carry big
   * leafy branches; the other upper nodes carry small ones or stay bare.
   */
  function foliage(c: Culm, firstFrac: number, masses: number, lenFrac: [number, number]): { unit: Stroke[]; big: boolean }[] {
    const units: { unit: Stroke[]; big: boolean }[] = [{ unit: crown(c), big: true }];
    const n = c.nodes.length - 1;
    const start = Math.max(1, Math.round(n * firstFrac));
    const cand: number[] = [];
    for (let i = n - 1; i >= start; i--) cand.push(i);
    // Pick the mass nodes, spaced apart where possible.
    const massSet = new Set<number>();
    for (let tries = 0; massSet.size < Math.min(masses, cand.length) && tries < 40; tries++) {
      const i = rng.pick(cand);
      if ([...massSet].every((j) => Math.abs(i - j) >= 2) || tries > 25) massSet.add(i);
    }
    let side = rng.chance(0.5) ? 1 : -1;
    let massCount = 0;
    for (const i of cand) {
      side = rng.chance(0.8) ? -side : side;
      const big = massSet.has(i);
      if (big) {
        // the first (highest) mass leans with the culm; later ones alternate
        side = massCount === 0 ? c.side : massCount === 1 ? -c.side * (rng.chance(0.7) ? 1 : -1) : rng.chance(0.5) ? 1 : -1;
        massCount++;
      } else if (!rng.chance(0.5)) continue;
      const s = c.nodes[i];
      const u = s / c.h;
      const p = at(c, s);
      const w = wAt(c, s);
      const nr = { x: Math.cos(p.a), y: Math.sin(p.a) };
      const o = { x: p.x + nr.x * side * w * 0.35, y: p.y + nr.y * side * w * 0.35 };
      const ang = p.a + side * (lerp(62, 32, u) + rng.range(-15, 12)) * DEG;
      const len = c.h * rng.range(lenFrac[0], lenFrac[1]) * (1 - 0.35 * u) * (big ? rng.range(0.8, 1.15) : rng.range(0.45, 0.7));
      units.push({ unit: branch(c, o, ang, len, minW(w * rng.range(0.26, 0.34), 1), side, u, big), big });
      // Bamboo often puts out a second, smaller branch at a leafy node.
      if (big && rng.chance(0.45)) {
        const a2 = p.a - side * (lerp(50, 30, u) + rng.range(-6, 6)) * DEG;
        const o2 = { x: p.x - nr.x * side * w * 0.35, y: p.y - nr.y * side * w * 0.35 };
        units.push({ unit: branch(c, o2, a2, len * rng.range(0.4, 0.6), minW(w * 0.24, 0.9), -side, u, false), big: false });
      }
    }
    return units;
  }

  // ---------------------------------------------------------------- compose

  const units: Unit[] = [];
  const schedule = (list: Stroke[][], b0: number, b1: number) => {
    list.forEach((st, i) => units.push({ strokes: st, birth: lerp(b0, b1, list.length > 1 ? i / (list.length - 1) : 0) }));
  };
  const windBend = mood === 'wind' ? 1.9 : 1;

  // The young shoot at the foot.
  const sproutSide = rng.chance(0.6) ? -dir : dir;
  const sprout = makeCulm('sprout',
    { x: sproutSide * H * rng.range(0.05, 0.1), y: 0 }, H * rng.range(0.2, 0.27), mainW * rng.range(0.42, 0.5), rng.int(3, 4),
    sproutSide * rng.range(3, 10) * DEG, (mood === 'wind' ? dir * 12 : sproutSide * rng.range(2, 10)) * DEG, 0.5, 0.82, 0.84, 0.58);

  // Medium culm (usually): opposite side, leaning away from the main culm — or crossing it.
  const hasMid = rng.chance(0.78);
  const cross = rng.chance(0.3);
  const midSide = cross || mood === 'wind' ? dir : -dir;
  const mid = hasMid ? makeCulm('mid',
    { x: (cross ? -dir : midSide) * H * rng.range(0.02, 0.05), y: 0 }, H * rng.range(0.56, 0.7), mainW * rng.range(0.6, 0.72), rng.int(6, 7),
    midSide * rng.range(3, 10) * DEG, midSide * rng.range(4, 14) * windBend * DEG, 0.4, 0.72, 0.62, 0.86) : null;

  // The main culm.
  const main = makeCulm('main',
    { x: (cross ? dir : -dir) * H * rng.range(0, 0.02), y: 0 }, H * rng.range(0.84, 0.9), mainW, rng.int(7, 9),
    dir * rng.range(1, 6) * DEG, dir * rng.range(4, 14) * windBend * DEG, 0.56, 0.9, 0.9, 1);

  // A far, pale culm behind (sometimes).
  const hasFar = rng.chance(0.55);
  const farSide = mood === 'wind' ? dir : rng.chance(0.5) ? dir : -dir;
  const far = hasFar ? makeCulm('far',
    { x: (rng.chance(0.5) ? 1 : -1) * H * rng.range(0.06, 0.12), y: 0 }, H * rng.range(0.64, 0.78), mainW * rng.range(0.5, 0.6), rng.int(6, 7),
    farSide * rng.range(4, 12) * DEG, farSide * rng.range(3, 10) * windBend * DEG, 0.18, 0.3, 0.28, 0.82) : null;

  // 0.00–0.08: the shoot, then its crown and a little branch.
  units.push({ strokes: culmStrokes(sprout), birth: 0, step: 0.004 });
  const spF = foliage(sprout, 0.5, 1, [0.35, 0.45]);
  schedule(spF.slice(0, 2).map((f) => f.unit), 0.03, 0.055);

  const late: Stroke[][] = spF.slice(2).map((f) => f.unit);
  const place = (c: Culm, b0: number, b1: number, lateFrac: number, firstFrac: number, masses: number, lenFrac: [number, number]) => {
    const segEnd = b0 + 0.045;
    units.push({ strokes: culmStrokes(c), birth: b0, step: (segEnd - b0) / (c.nodes.length * 2.2) });
    const f = foliage(c, firstFrac, masses, lenFrac);
    // the crown and the leafy masses come first (top-down); then the small branches, some of
    // which wait for the late phase
    const bigs = f.filter((u) => u.big).map((u) => u.unit);
    const small: Stroke[][] = [];
    for (const { unit, big } of f) if (!big) (rng.chance(lateFrac) ? late : small).push(unit);
    const leafy = Math.min(segEnd + 0.05, lerp(segEnd, b1, 0.4));
    schedule(bigs, segEnd + 0.008, leafy);
    schedule(small, leafy + 0.01, b1);
  };
  if (mid) {
    place(mid, 0.08, 0.28, 0.5, 0.45, rng.int(1, 2), [0.18, 0.26]);
    place(main, 0.3, 0.56, 0.6, 0.36, rng.int(2, 3), [0.18, 0.27]);
  } else {
    place(main, 0.08, 0.5, 0.5, 0.33, 3, [0.18, 0.28]);
  }
  // Pale leaves behind the leafy masses fill the plant out late in its growth.
  for (const b of backs) if (b.big ? rng.chance(0.8) : rng.chance(0.3)) late.push(backCluster(b));
  // Late foliage in a shuffled but deterministic order.
  for (let i = late.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [late[i], late[j]] = [late[j], late[i]];
  }
  schedule(late, 0.6, 0.88);
  if (far) {
    units.push({ strokes: culmStrokes(far), birth: 0.585, step: 0.002 });
    const fol = foliage(far, 0.45, 2, [0.14, 0.22]).map((f) => f.unit);
    // at most a whisper of indigo (花青) in the far leaves
    if (rng.chance(0.4)) for (const u of fol) for (const st of u) { st.color = PIGMENTS.indigo; st.tone *= 0.9; }
    schedule(fol, 0.615, 0.84);
  }

  // 苔点 moss dots and a blade or two of grass at the foot.
  const moss: Stroke[] = [];
  const nm = rng.int(4, 7);
  // dots gather in two little clusters, a big one and a small one
  const mc = [-dir * H * rng.range(0.05, 0.1), dir * H * rng.range(0.08, 0.15)];
  for (let i = 0; i < nm; i++) {
    const x = mc[i % 3 === 2 ? 1 : 0] + rng.gauss() * 0.014 * H;
    const d = H * (i < 3 ? rng.range(0.011, 0.016) : rng.range(0.006, 0.011));
    moss.push({ kind: 'dot', pts: [{ x, y: rng.range(-0.004, 0.006) * H, w: minW(d, 1.4) }], tone: rng.chance(0.3) ? 0.45 : 0.88, birth: 0, seed: sd() });
  }
  const ng = rng.int(1, 3);
  for (let i = 0; i < ng; i++) {
    const x = rng.range(-0.14, 0.14) * H;
    const a = rng.range(-35, 35) * DEG;
    const l = H * rng.range(0.025, 0.045);
    const d = dirOf(a);
    moss.push(brush([{ x, y: 0, w: minW(H * 0.006, 1) }, { x: x + d.x * l * 0.5, y: d.y * l * 0.5, w: minW(H * 0.005, 0.9) }, { x: x + d.x * l, y: d.y * l, w: 0 }], 0.75));
  }
  units.push({ strokes: moss.slice(0, 2), birth: 0.07, step: 0.001 });
  units.push({ strokes: moss.slice(2), birth: 0.93, step: 0.01 });

  // Flatten, give each stroke its birth, sort.
  const strokes: Stroke[] = [];
  for (const u of units) {
    const step = u.step ?? 0.0006;
    u.strokes.forEach((s, i) => {
      s.birth = clamp(u.birth + i * step, 0, 1);
      strokes.push(s);
    });
  }
  strokes.sort((a, b) => a.birth - b.birth);
  return normalise(strokes, H);
}

/** Fit to the target height with a small margin; the anchor is the foot of the clump. */
function normalise(strokes: Stroke[], H: number): Drawing {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = 0;
  for (const s of strokes) {
    const poly = s.kind === 'wash' || s.kind === 'fill';
    for (const p of s.pts) {
      const r = poly ? 0 : p.w / 2;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
      y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
  }
  const m = 4 + H * 0.02;
  const k = (H - 2 * m) / (y1 - y0);
  for (const s of strokes) {
    for (const p of s.pts) {
      p.x = (p.x - x0) * k + m;
      p.y = (p.y - y0) * k + m;
      p.w *= k;
    }
  }
  return {
    width: Math.ceil((x1 - x0) * k + 2 * m),
    height: H,
    anchor: { x: (0 - x0) * k + m, y: (0 - y0) * k + m },
    strokes,
  };
}
