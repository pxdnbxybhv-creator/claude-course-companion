// 兰 Orchid — ink orchid in the manner of 郑思肖 and 马守真: the most restrained of the plants.
//
// Anatomy:
//   叶 leaves   one `brush` stroke each, from a tuft at the foot. The width breathes along the
//               leaf — a small nail-head entry (钉头), a swelling "mantis belly" (螳螂肚), often a
//               narrow twist (折) where the blade turns, and a long "rat tail" (鼠尾) tip.
//               The first three leaves are the classic ones: a long sweeping arc, a second that
//               crosses it to form the phoenix eye (凤眼), a third through the eye (破凤眼).
//   鞘 sheaths  a few short dark leaves wrapping the foot.
//   花 flowers  2–5 blossoms on slender pale stems among the leaves: three outer petals spread
//               like a hand, two small inner petals cupping the heart, and 2–3 burnt-dark dots
//               (点心, written like 心 / 山). Petals are 淡墨, or a pale ochre / malachite tint.
//   地 ground   a clear-ink wash under the tuft and a few moss dots (苔点).
//
// Growth (strokes sorted by `birth`):
//   0.00–0.08  ground wash, the sheaths, two short young leaves — a tiny tuft
//   0.08–0.24  low leaves bowing out to both sides
//   0.24–0.42  the long leaves: counter-leaf, then 凤眼 and 破凤眼
//   0.42–0.54  a pale leaf behind, a leaf with a turned-over tip
//   0.56–0.92  flower stems, then the blossoms one by one (each with its heart dots)
//   0.93–1.00  moss dots
import type { Drawing, PlantSpec, Stroke, StrokePoint } from '../types';
import { PIGMENTS } from '../types';
import { makeRng, mixSeed } from '../../core/rng';
import { growthFor } from '../../core/habits';

type V = { x: number; y: number };
const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
/** Angles are measured clockwise from straight up (canvas y points down). */
const dirOf = (a: number): V => ({ x: Math.sin(a), y: -Math.cos(a) });

interface LeafPlan {
  base: V;
  a0: number;
  len: number;
  /** heading(t) = a0 + (a1 − a0)·t^p (+ fold): p < 1 bends early, p > 1 bends late */
  a1: number;
  p: number;
  /** paint only this leading fraction of the designed curve (a leaf cut short above the ground) */
  span?: number;
  fold?: { t: number; amt: number };
  wid: number;
  tone: number;
  /** position of the belly and of the narrow twist (0 = no twist) */
  belly: number;
  twist: number;
}

/** Spine points of a leaf by integrating its heading. */
function spine(lp: LeafPlan, n = 40): V[] {
  const pts: V[] = [];
  let x = lp.base.x, y = lp.base.y;
  const span = lp.span ?? 1;
  const ds = (lp.len * span) / (n - 1);
  for (let i = 0; i < n; i++) {
    pts.push({ x, y });
    const t = ((i + 0.5) / (n - 1)) * span;
    let a = lp.a0 + (lp.a1 - lp.a0) * Math.pow(t, lp.p);
    if (lp.fold) a += lp.fold.amt * smooth((t - lp.fold.t) / 0.1);
    x += Math.sin(a) * ds;
    y -= Math.cos(a) * ds;
  }
  return pts;
}

/** Width along an orchid leaf: 钉头 → 螳螂肚 → (折) → 鼠尾. */
function leafWidth(t: number, belly: number, twist: number): number {
  if (t < 0.03) return lerp(0.55, 0.4, t / 0.03);
  if (t < belly) return lerp(0.4, 1, smooth((t - 0.03) / (belly - 0.03)));
  if (twist > 0) {
    if (t < twist) return lerp(1, 0.3, smooth((t - belly) / (twist - belly)));
    if (t < twist + 0.1) return lerp(0.3, 0.62, smooth((t - twist) / 0.1));
    return 0.62 * Math.pow(1 - (t - twist - 0.1) / (0.9 - twist), 1.5);
  }
  return Math.pow(1 - (t - belly) / (1 - belly), 1.45);
}

/** First crossing of two polylines (skipping the first few points, where tufted leaves meet). */
function crossing(a: V[], b: V[], skip = 3): V | null {
  for (let i = skip; i < a.length - 1; i++) {
    for (let j = skip; j < b.length - 1; j++) {
      const p = a[i], p2 = a[i + 1], q = b[j], q2 = b[j + 1];
      const rx = p2.x - p.x, ry = p2.y - p.y, sx = q2.x - q.x, sy = q2.y - q.y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
      const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: p.x + rx * t, y: p.y + ry * t };
    }
  }
  return null;
}

export function orchid(spec: PlantSpec): Drawing {
  const H = spec.height;
  const rng = makeRng(mixSeed(spec.seed >>> 0, 0x0c41d));
  const sd = () => rng.int(1, 0x7fffffff);
  const minW = (w: number, m: number) => Math.max(m, w);
  // Growth is choreographed per check-in (see `choreograph`): `first` is the day-one tuft,
  // `seq` the story in order (each group waits for its check-in `minN`), `fillers` small
  // touches that keep every check-in visible while the story waits.
  const first: Stroke[] = [];
  const seq: Group[] = [];
  const fillers: Stroke[][] = [];
  const add = (strokes: Stroke[], minN = 0) => seq.push({ strokes, minN });

  const s = rng.chance(0.5) ? 1 : -1; // the long first leaf sweeps to this side
  const leafW = H * rng.range(0.024, 0.028);
  const allSpines: V[][] = [];

  function leafStroke(lp: LeafPlan): Stroke {
    const sp = spine(lp);
    // keep leaf tips above the ground line
    allSpines.push(sp);
    const pts: StrokePoint[] = sp.map((p, i) => {
      const t = i / (sp.length - 1);
      return { x: p.x, y: Math.min(p.y, -1), w: t > 0.97 ? 0 : minW(lp.wid * leafWidth(t, lp.belly, lp.twist), 0.6) };
    });
    pts[pts.length - 1].w = 0;
    return { kind: 'brush', pts, tone: lp.tone, birth: 0, seed: sd(), dryness: rng.range(0.1, 0.3) };
  }

  /** Lower the droop until the whole leaf stays above the ground. */
  /** Keep a drooping leaf above the ground: cut it short where it would reach `minHeight`,
   *  or — if that would leave too little of it — relax its bend. */
  function lift(lp: LeafPlan, minHeight: number): LeafPlan {
    for (let k = 0; k < 16; k++) {
      lp.span = 1;
      const sp = spine(lp);
      const i = sp.findIndex((p, j) => j > sp.length * 0.25 && p.y > -minHeight);
      if (i < 0) return lp;
      const span = i / (sp.length - 1);
      if (span >= 0.66) { lp.span = span; return lp; }
      lp.a1 = lp.a0 + (lp.a1 - lp.a0) * 0.92;
    }
    return lp;
  }

  const plan = (o: Partial<LeafPlan> & Pick<LeafPlan, 'a0' | 'len' | 'a1' | 'p'>): LeafPlan => ({
    base: { x: 0, y: 0 }, wid: leafW, tone: 0.82, belly: rng.range(0.2, 0.3), twist: 0, ...o,
  });

  // ------------------------------------------------------------ ground & sheaths (0 – 0.03)
  {
    const n = 16;
    const rx = H * rng.range(0.22, 0.3), ry = H * rng.range(0.018, 0.028);
    const cx = s * H * rng.range(0.0, 0.05);
    const pts: StrokePoint[] = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const k = 1 + rng.range(-0.12, 0.12);
      const sy = Math.sin(th);
      pts.push({ x: cx + Math.cos(th) * rx * k, y: H * 0.002 + sy * ry * k * (sy > 0 ? 0.45 : 1), w: i === 0 ? H * 0.03 : 0 });
    }
    first.push({ kind: 'wash', pts, tone: 0.1, birth: 0, seed: sd() });
  }
  {
    const n = rng.int(3, 4);
    const sh: Stroke[] = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const bx = side * H * rng.range(0.004, 0.016);
      const a = side * rng.range(6, 34) * DEG;
      const len = H * rng.range(0.045, 0.075) * (i === 0 ? 1.15 : 1);
      const bend = side * rng.range(4, 14) * DEG;
      const pts: StrokePoint[] = [];
      const m = 7;
      let x = bx, y = 0;
      for (let j = 0; j < m; j++) {
        const t = j / (m - 1);
        const w = H * 0.02 * (t < 0.3 ? lerp(0.75, 1, t / 0.3) : Math.pow(1 - (t - 0.3) / 0.7, 1.1));
        pts.push({ x, y, w: t === 1 ? 0 : minW(w, 0.8) });
        const aa = a + bend * t;
        x += Math.sin(aa) * (len / (m - 1));
        y -= Math.cos(aa) * (len / (m - 1));
      }
      sh.push({ kind: 'brush', pts, tone: rng.range(0.82, 0.95), birth: 0, seed: sd() });
    }
    first.push(...sh);
  }

  // ------------------------------------------------------------ day one: a tuft of young leaves
  {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const side = (i === 1 ? -1 : 1) * s;
      const lf = leafStroke(lift(plan({
        base: { x: side * H * 0.004, y: 0 }, a0: side * rng.range(4, 14) * DEG, len: H * rng.range(0.3, 0.4) * [1, 0.85, 0.62][i],
        a1: side * rng.range(40, 80) * DEG, p: rng.range(1.3, 1.7), wid: leafW * 0.85, tone: rng.range(0.74, 0.84), belly: 0.28,
      }), H * 0.08));
      if (i < 2) first.push(lf);
      else add([lf]);
    }
  }

  // ------------------------------------------------------------ low bowing leaves (0.1 – 0.22)
  {
    const lv: Stroke[] = [];
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const side = i === 1 ? s : -s;
      const lp = lift(plan({
        base: { x: side * H * rng.range(0.004, 0.012), y: 0 },
        a0: side * rng.range(24, 46) * DEG, len: H * rng.range(0.48, 0.62) * [1, rng.range(0.55, 0.75), 0.7][i],
        a1: side * rng.range(90, 135) * DEG, p: rng.range(1.1, 1.6),
        wid: leafW * rng.range(0.8, 0.95), tone: rng.range(0.66, 0.84),
        twist: rng.chance(0.5) ? rng.range(0.5, 0.6) : 0,
      }), H * 0.02);
      lv.push(leafStroke(lp));
    }
    lv.forEach((l) => add([l]));
  }

  // ------------------------------------------------------------ the long leaves (0.24 – 0.42)
  // counter-leaf: sweeps to the other side and balances the first leaf
  const counter = lift(plan({
    base: { x: -s * H * 0.012, y: 0 }, a0: -s * rng.range(18, 32) * DEG, len: H * rng.range(0.78, 0.95),
    a1: -s * rng.range(85, 125) * DEG, p: rng.range(1.5, 2), tone: rng.range(0.7, 0.8),
    twist: rng.chance(0.6) ? rng.range(0.45, 0.58) : 0,
  }), H * 0.06);
  add([leafStroke(counter)]);

  // 1 — the long arc: leans away first, then sweeps over to side s and droops
  const L1 = lift(plan({
    base: { x: -s * H * 0.01, y: 0 }, a0: -s * rng.range(2, 12) * DEG, len: H * rng.range(1.2, 1.4),
    a1: s * rng.range(100, 128) * DEG, p: rng.range(1.2, 1.55), wid: leafW * 1.08, tone: rng.range(0.84, 0.92),
    belly: rng.range(0.2, 0.26), twist: rng.chance(0.55) ? rng.range(0.42, 0.52) : 0,
  }), H * 0.08);
  const sp1 = spine(L1);

  // 2 — the phoenix eye: leans toward s first, then curves back across the first leaf.
  //     Search its curvature so the crossing sits at a pleasing height.
  const eyeH = H * rng.range(0.16, 0.26);
  const L2base = plan({
    base: { x: s * H * 0.01, y: 0 }, a0: s * rng.range(14, 24) * DEG, len: H * rng.range(0.85, 1.02),
    a1: 0, p: rng.range(1.0, 1.3), tone: rng.range(0.78, 0.88), twist: rng.chance(0.4) ? rng.range(0.5, 0.6) : 0,
  });
  let best = { a1: -s * 90 * DEG, err: Infinity };
  for (let k = 10; k <= 160; k += 3) {
    const lp = { ...L2base, a1: -s * k * DEG };
    const c = crossing(sp1, spine(lp));
    if (!c) continue;
    const err = Math.abs(-c.y - eyeH);
    if (err < best.err) best = { a1: lp.a1, err };
  }
  const L2 = { ...L2base, a1: best.a1 };
  lift(L2, H * 0.1);

  // 3 — breaks the eye: rises between the two, through the eye, bending gently
  const s3 = rng.chance(0.65) ? -s : s;
  const L3 = lift(plan({
    base: { x: 0, y: 0 }, a0: s3 * rng.range(-3, 6) * DEG, len: H * rng.range(0.8, 0.98),
    a1: s3 * rng.range(30, 70) * DEG, p: rng.range(2, 2.6), wid: leafW * 0.95, tone: rng.range(0.7, 0.8),
    twist: rng.chance(0.5) ? rng.range(0.5, 0.62) : 0,
  }), H * 0.2);
  add([leafStroke(L1)]);
  add([leafStroke(L2)]);
  add([leafStroke(L3)]);

  // ------------------------------------------------------------ later leaves (0.43 – 0.54)
  {
    // a pale leaf behind (淡墨)
    const side = rng.chance(0.5) ? 1 : -1;
    const back = lift(plan({
      base: { x: side * H * 0.008, y: 0 }, a0: side * rng.range(4, 18) * DEG, len: H * rng.range(0.7, 0.9),
      a1: side * rng.range(45, 95) * DEG, p: rng.range(1.7, 2.2), wid: leafW * 0.9, tone: rng.range(0.3, 0.4),
    }), H * 0.12);
    const backLeaf = leafStroke(back);
    // a leaf whose tip turns over (折叶)
    if (rng.chance(0.75)) {
      const fs = rng.chance(0.6) ? -s : s;
      const fl = lift(plan({
        base: { x: fs * H * 0.006, y: 0 }, a0: fs * rng.range(8, 22) * DEG, len: H * rng.range(0.55, 0.72),
        a1: fs * rng.range(25, 50) * DEG, p: 1.3,
        fold: { t: rng.range(0.52, 0.64), amt: fs * rng.range(70, 110) * DEG }, tone: rng.range(0.74, 0.86),
        twist: 0,
      }), H * 0.1);
      fl.twist = fl.fold!.t + 0.02;
      fl.belly = rng.range(0.22, 0.3);
      add([leafStroke(fl)]);
    }
    add([backLeaf]);
    // fillers: one or two more pale leaves behind, and a little offshoot tuft (子兰) nearby
    for (let i = 0, nb = rng.int(1, 2); i < nb; i++) {
      const sd2 = rng.chance(0.5) ? 1 : -1;
      fillers.push([leafStroke(lift(plan({
        base: { x: sd2 * H * 0.006, y: 0 }, a0: sd2 * rng.range(10, 30) * DEG, len: H * rng.range(0.5, 0.75),
        a1: sd2 * rng.range(70, 120) * DEG, p: rng.range(1.4, 1.9), wid: leafW * 0.85, tone: rng.range(0.3, 0.4),
      }), H * 0.06))]);
    }
    const ox = -s * H * rng.range(0.2, 0.26);
    for (let i = 0; i < 2; i++) {
      const sd2 = (i ? 1 : -1) * -s;
      fillers.push([leafStroke(lift(plan({
        base: { x: ox + sd2 * H * 0.003, y: 0 }, a0: sd2 * rng.range(6, 18) * DEG, len: H * rng.range(0.2, 0.28) * (i ? 0.75 : 1),
        a1: sd2 * rng.range(50, 95) * DEG, p: 1.4, wid: leafW * 0.7, tone: rng.range(0.66, 0.78), belly: 0.28,
      }), H * 0.05))]);
    }
  }

  // ------------------------------------------------------------ flowers (0.56 – 0.92)
  const hue = rng();
  const petalColor = hue < 0.6 ? undefined : hue < 0.88 ? PIGMENTS.ochre : PIGMENTS.malachite;
  const petalTone = petalColor ? rng.range(0.4, 0.5) : rng.range(0.28, 0.36);
  const stemTone = petalColor ? 0.4 : rng.range(0.34, 0.42);
  const petalLen = H * rng.range(0.085, 0.1);

  /** Distance from p to the nearest leaf spine point. */
  const clearance = (p: V) => {
    let d = Infinity;
    for (const sp of allSpines) for (const q of sp) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
    return d;
  };

  function stem(base: V, a0: number, len: number, bend: number): { pts: StrokePoint[]; tip: V; a: number } {
    const n = 14;
    const pts: StrokePoint[] = [];
    let x = base.x, y = base.y, a = a0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push({ x, y, w: minW(H * 0.0065 * lerp(1, 0.55, t), 0.8) });
      a = a0 + bend * t * t;
      x += Math.sin(a) * (len / (n - 1));
      y -= Math.cos(a) * (len / (n - 1));
    }
    return { pts, tip: { x: pts[n - 1].x, y: pts[n - 1].y }, a };
  }

  function petal(o: V, a: number, len: number, wid: number, curl: number, tone: number, color?: string): Stroke {
    const n = 8;
    const pts: StrokePoint[] = [];
    let x = o.x, y = o.y;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // narrow where it springs from the heart, broad in the middle, a softly rounded tip
      const w = t < 0.42 ? lerp(0.22, 1, smooth(t / 0.42)) : t < 0.84 ? lerp(1, 0.5, smooth((t - 0.42) / 0.42)) : lerp(0.5, 0.08, (t - 0.84) / 0.16);
      pts.push({ x, y, w: t === 1 ? 0 : minW(wid * w, 0.7) });
      const aa = a + curl * t;
      x += Math.sin(aa) * (len / (n - 1));
      y -= Math.cos(aa) * (len / (n - 1));
    }
    return { kind: 'brush', pts, tone: clamp(tone + rng.range(-0.04, 0.04), 0.05, 1), color, birth: 0, seed: sd(), wet: 0.5 };
  }

  /** One blossom facing `phi`: three sepals, two cupped petals, the heart dots. */
  function blossom(c: V, phi: number, scale: number): Stroke[] {
    const out: Stroke[] = [];
    const L = petalLen * scale;
    const W = L * rng.range(0.3, 0.36);
    const spreadA = rng.range(52, 72) * DEG, spreadB = rng.range(52, 72) * DEG;
    const sepals: [number, number, number][] = [
      [phi + rng.range(-8, 8) * DEG, 1, rng.range(-12, 12) * DEG],
      [phi - spreadA, rng.range(0.82, 0.95), -rng.range(12, 26) * DEG],
      [phi + spreadB, rng.range(0.82, 0.95), rng.range(12, 26) * DEG],
    ];
    for (const [a, l, curl] of sepals) {
      const d = dirOf(a);
      out.push(petal({ x: c.x + d.x * L * 0.08, y: c.y + d.y * L * 0.08 }, a, L * l, W, curl, petalTone, petalColor));
    }
    // 捧心 — two small petals cupping the heart
    const cup = rng.range(16, 26) * DEG;
    for (const sg of [-1, 1]) {
      const a = phi + sg * cup;
      out.push(petal(c, a, L * rng.range(0.42, 0.52), W * 0.95, -sg * rng.range(16, 28) * DEG, petalTone + 0.1, petalColor));
    }
    // 点心 — the heart: small comma-like dots on the lip, set on a slant (never a tidy row,
    // which would read as a face)
    const lip = dirOf(phi + Math.PI);
    const cx = c.x + lip.x * L * 0.12, cy = c.y + lip.y * L * 0.12;
    const fl = rng.chance(0.5) ? 1 : -1;
    const nr = dirOf(phi + (fl * Math.PI) / 2);
    const dd = L * 0.12;
    const P = (u: number, v: number): V => ({ x: cx + nr.x * u * dd + lip.x * v * dd, y: cy + nr.y * u * dd + lip.y * v * dd });
    const comma = (u: number, v: number, turn: number, len: number, sz: number): Stroke => {
      const a = phi + Math.PI + fl * turn * DEG;
      const d = dirOf(a), d2 = dirOf(a + fl * 40 * DEG);
      const p0 = P(u, v);
      const p1 = { x: p0.x + d.x * len * dd * 0.55, y: p0.y + d.y * len * dd * 0.55 };
      const p2 = { x: p1.x + d2.x * len * dd * 0.45, y: p1.y + d2.y * len * dd * 0.45 };
      return {
        kind: 'brush', tone: rng.range(0.88, 0.97), birth: 0, seed: sd(),
        pts: [{ ...p0, w: minW(sz * 0.8, 1.1) }, { ...p1, w: minW(sz, 1.2) }, { ...p2, w: 0 }],
      };
    };
    if (rng.chance(0.55)) {
      // 心: a dot, a larger hooked dot, a small dot — rising along a diagonal
      out.push(comma(-1.1, 0.7 + rng.range(-0.2, 0.2), -30, 0.9, L * 0.1));
      out.push(comma(-0.1, 0.1, 10, 1.3, L * 0.11));
      out.push(comma(0.9, -0.5 + rng.range(-0.2, 0.2), 50, 0.7, L * 0.085));
    } else {
      // 两点 / 山: two or three dots, one tucked under the cupped petals
      out.push(comma(-0.6, 0.6, -20, 1, L * 0.1));
      out.push(comma(0.5, -0.1, 30, 0.8, L * 0.09));
      if (rng.chance(0.5)) out.push(comma(0.1, 1.3, 0, 0.6, L * 0.075));
    }
    return out;
  }

  /** A closed bud: two petals folded together, a dark calyx at the foot. */
  function bud(c: V, a: number, scale: number): Stroke[] {
    const L = petalLen * 0.62 * scale;
    const d = dirOf(a);
    return [
      petal(c, a - 7 * DEG, L, L * 0.34, 12 * DEG, petalTone + 0.06, petalColor),
      petal(c, a + 7 * DEG, L * 0.92, L * 0.32, -12 * DEG, petalTone + 0.12, petalColor),
      { kind: 'brush', tone: 0.7, birth: 0, seed: sd(), pts: [
        { x: c.x - d.x * L * 0.1, y: c.y - d.y * L * 0.1, w: minW(L * 0.2, 1.1) },
        { x: c.x + d.x * L * 0.18, y: c.y + d.y * L * 0.18, w: 0 },
      ] },
    ];
  }

  const spring = rng.chance(0.6); // 春兰: one flower per stem · 蕙兰: several on one stem
  const heads: V[] = [];
  // Flowers must sit in open paper, not on the dark leaves: try many stems, keep the one whose
  // flowering part has the most clearance from every leaf.
  const pickStem = (lenR: [number, number], aR: number, ts: number[] = [1]) => {
    let bestC: { base: V; a0: number; len: number; bend: number; score: number } | null = null;
    for (let i = 0; i < 44; i++) {
      const base = { x: rng.range(-0.012, 0.012) * H, y: 0 };
      const a0 = rng.range(-aR, aR) * DEG;
      const len = H * rng.range(lenR[0], lenR[1]);
      const bend = Math.sign(a0 || 1) * rng.range(4, 22) * DEG;
      const st = stem(base, a0, len, bend);
      let score = Math.min(H * 0.13, ...ts.map((t) => clearance(st.pts[Math.round(t * (st.pts.length - 1))])));
      for (const h of heads) score -= Math.max(0, H * 0.14 - Math.hypot(h.x - st.tip.x, h.y - st.tip.y)) * 2;
      if (!bestC || score > bestC.score) bestC = { base, a0, len, bend, score };
    }
    return bestC!;
  };
  const bract = (pts: StrokePoint[], t: number, side: number): Stroke => {
    const i = Math.round(t * (pts.length - 1));
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)];
    const a = Math.atan2(q.x - p.x, -(q.y - p.y)) + side * 16 * DEG;
    const d = dirOf(a), l = H * 0.028;
    return {
      kind: 'brush', tone: stemTone + 0.25, birth: 0, seed: sd(), pts: [
        { x: p.x, y: p.y, w: minW(H * 0.009, 1) }, { x: p.x + d.x * l * 0.5, y: p.y + d.y * l * 0.5, w: minW(H * 0.007, 0.9) },
        { x: p.x + d.x * l, y: p.y + d.y * l, w: 0 },
      ],
    };
  };

  if (spring) {
    // a pale bud on a short stem first (check-in ~7), then the flowers: each stalk rises two
    // check-ins before it opens; the last flower waits for a long streak
    {
      const c = pickStem([0.2, 0.32], 45);
      const st = stem(c.base, c.a0, c.len, c.bend);
      heads.push(st.tip);
      add([{ kind: 'brush', pts: st.pts, tone: stemTone + 0.06, color: petalColor, birth: 0, seed: sd() },
        ...bud(st.tip, st.a + rng.range(-10, 10) * DEG, 0.75)], 7);
    }
    const n = rng.int(2, 3);
    const opens = [11, 16, 26];
    for (let i = 0; i < n; i++) {
      const c = pickStem([0.3, 0.58], 44);
      const st = stem(c.base, c.a0, c.len, c.bend);
      heads.push(st.tip);
      add([{ kind: 'brush', pts: st.pts, tone: stemTone, color: petalColor, birth: 0, seed: sd() }, bract(st.pts, rng.range(0.2, 0.4), rng.chance(0.5) ? 1 : -1)], opens[i] - 2);
      const phi = st.a + rng.range(-20, 20) * DEG;
      add(blossom(st.tip, phi, rng.range(0.92, 1.08)), opens[i]);
    }
  } else {
    // 蕙: one tall stem, flowers alternating along its upper half, the top one a bud
    const c = pickStem([0.55, 0.72], 26, [0.45, 0.6, 0.75, 0.9]);
    const st = stem(c.base, c.a0, c.len, c.bend);
    heads.push(st.tip);
    // the stalk with its pale top bud comes first (check-in ~7); flowers open bottom-up
    add([
      { kind: 'brush', pts: st.pts, tone: stemTone, color: petalColor, birth: 0, seed: sd() },
      bract(st.pts, 0.22, 1), bract(st.pts, 0.42, -1),
      ...bud(st.tip, st.a + rng.range(-8, 8) * DEG, 0.85),
    ], 7);
    const nf = rng.int(3, 4);
    const opens = [11, 14, 18, 25];
    let side = rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < nf; i++) {
      const t = lerp(0.4, 0.8, i / (nf - 1)) + rng.range(-0.03, 0.03);
      const k = Math.round(t * (st.pts.length - 1));
      const p = st.pts[k], q = st.pts[Math.min(st.pts.length - 1, k + 1)];
      const a = Math.atan2(q.x - p.x, -(q.y - p.y));
      const pa = a + side * rng.range(45, 70) * DEG;
      const d = dirOf(pa), pl = H * 0.03;
      const head = { x: p.x + d.x * pl, y: p.y + d.y * pl };
      const ped: Stroke = { kind: 'brush', tone: stemTone, color: petalColor, birth: 0, seed: sd(), pts: [
        { x: p.x, y: p.y, w: minW(H * 0.005, 0.8) }, { x: head.x, y: head.y, w: minW(H * 0.004, 0.7) },
      ] };
      const phi = pa + side * rng.range(10, 40) * DEG;
      add([ped, ...blossom(head, phi, rng.range(0.86, 0.98) * (1 - i * 0.05))], opens[i]);
      side = -side;
    }
  }

  // ------------------------------------------------------------ moss dots
  const moss: Stroke[] = [];
  const nm = rng.int(4, 7);
  // dots gather in two little clusters, a big one and a small one
  const mc = [-s * H * rng.range(0.07, 0.14), s * H * rng.range(0.1, 0.2)];
  for (let i = 0; i < nm; i++) {
    const x = mc[i % 3 === 2 ? 1 : 0] + rng.gauss() * 0.016 * H;
    const d = H * (i < 3 ? rng.range(0.011, 0.017) : rng.range(0.006, 0.011));
    moss.push({ kind: 'dot', pts: [{ x, y: rng.range(-0.006, 0.006) * H, w: minW(d, 1.4) }],
      tone: rng.chance(0.3) ? rng.range(0.35, 0.45) : rng.range(0.82, 0.95), birth: 0, seed: sd() });
  }
  for (let i = 0; i < moss.length; i += 2) fillers.push(moss.slice(i, i + 2));

  return normalise(choreograph(first, seq, fillers), H);
}

interface Group {
  strokes: Stroke[];
  /** the earliest check-in at which the group may appear */
  minN: number;
}

/** Check-ins whose growth must each add something visible (growthFor(21) ≈ 0.65). */
const STORY_CHECKINS = 21;

/**
 * Assign births so that the plant changes visibly at every check-in 1…21 (growth from
 * `growthFor`), then spread whatever is left over the long tail up to full growth.
 * Each check-in n takes the next story group that may appear (minN ≤ n), else a filler, else
 * pulls the next story group early. A group's strokes land just below growthFor(n).
 */
function choreograph(first: Stroke[], seq: Group[], fillers: Stroke[][]): Stroke[] {
  const out: Stroke[] = [];
  const put = (strokes: Stroke[], b0: number, step: number) =>
    strokes.forEach((st, i) => { st.birth = clamp(b0 + i * step, 0, 1); out.push(st); });
  put(first, 0, Math.min(0.004, 0.05 / Math.max(1, first.length)));
  const q = [...seq];
  const f = [...fillers];
  for (let n = 1; n <= STORY_CHECKINS; n++) {
    const i = q.findIndex((g) => g.minN <= n);
    const st = i >= 0 ? q.splice(i, 1)[0].strokes : f.length ? f.shift()! : q.shift()?.strokes;
    if (!st) break;
    const step = Math.min(0.0003, 0.006 / st.length);
    put(st, growthFor(n) - 0.002 - step * (st.length - 1), step);
  }
  // The long tail: the remaining story (the last flowers) interleaved with fillers.
  const rest: Stroke[][] = [];
  while (q.length || f.length) {
    if (q.length) rest.push(q.shift()!.strokes);
    if (f.length) rest.push(f.shift()!);
  }
  const g0 = growthFor(STORY_CHECKINS) + 0.02;
  rest.forEach((st, k) => {
    const b = lerp(g0, 0.95, rest.length > 1 ? k / (rest.length - 1) : 0);
    put(st, b, Math.min(0.0005, 0.01 / st.length));
  });
  return out.sort((a, b) => a.birth - b.birth);
}

/** Fit to the target height with a small margin; the anchor is the foot of the tuft. */
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
    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i];
      p.x = (p.x - x0) * k + m;
      p.y = (p.y - y0) * k + m;
      if (!(s.kind === 'wash' || s.kind === 'fill') || i === 0) p.w *= k;
    }
  }
  return {
    width: Math.ceil((x1 - x0) * k + 2 * m),
    height: H,
    anchor: { x: (0 - x0) * k + m, y: (0 - y0) * k + m },
    strokes,
  };
}
