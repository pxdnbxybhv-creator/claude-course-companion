// Brushwork for 井字棋: the grid is the character 井 written in four strokes (一 一 丿 丨),
// 〇 is an ensō (圆相) circle, ✕ two crossing strokes, and a win is struck through in cinnabar.
// Everything is a Stroke for the brush engine, painted in stroke by stroke with StrokeAnimation.
import { PIGMENTS, type Stroke, type StrokePoint } from '../../../ink/types';
import { makeRng, type Rng } from '../../../core/rng';

export interface P { x: number; y: number }

/** Board geometry for a square board of side S (css px). */
export function geometry(S: number) {
  const m = S * 0.07;
  const cell = (S - 2 * m) / 3;
  const center = (i: number): P => ({ x: m + cell * ((i % 3) + 0.5), y: m + cell * (Math.floor(i / 3) + 0.5) });
  return { m, cell, center };
}

/** A tapered spine along points, with a heavier 起笔 and a lifting 收笔. */
function spine(pts: P[], W: number, profile: (t: number) => number): StrokePoint[] {
  return pts.map((p, i) => ({ x: p.x, y: p.y, w: W * profile(i / (pts.length - 1)) }));
}

/** Pressed 起笔 (a heavier head), a body that thins slightly in the middle, a lifting 收笔. */
const brushProfile = (t: number) => (t < 0.1 ? 1.25 - 2 * Math.abs(t - 0.05) * 4 : t > 0.8 ? Math.max(0.22, 0.86 - (t - 0.8) * 3.2) : 0.95 - 0.18 * Math.sin(((t - 0.1) / 0.7) * Math.PI));

/** A gently wobbling line a→b, sampled in n steps; `bow` bends it sideways (px), `wob` adds noise. */
function line(a: P, b: P, n: number, bow: number, rng: Rng, wob = 0.6): P[] {
  const out: P[] = [];
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = Math.sin(t * Math.PI) * bow + (i && i < n ? rng.range(-wob, wob) : 0);
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  return out;
}

/** The grid, in 井 stroke order: two horizontals, then the left 丿 (sweeping slightly), then the right 丨. */
export function gridStrokes(S: number, seed: number): Stroke[] {
  const rng = makeRng(seed);
  const { m, cell } = geometry(S);
  const W = Math.max(2.6, S * 0.017);
  const out: Stroke[] = [];
  const pad = S * 0.085;
  const mk = (pts: P[], tone: number, dry = 0.35): Stroke => ({
    kind: 'brush', pts: spine(pts, W * rng.range(0.9, 1.08), brushProfile), tone, birth: 0, seed: (rng() * 1e9) | 0, dryness: dry,
  });
  for (let k = 1; k <= 2; k++) {
    const y = m + cell * k + rng.range(-2, 2);
    out.push(mk(line({ x: pad + rng.range(0, 6), y: y + rng.range(-2, 2) }, { x: S - pad - rng.range(0, 6), y: y - rng.range(1, 4) }, 10, rng.range(-3, 1), rng), rng.range(0.7, 0.8)));
  }
  // 丿: the left vertical, leaning and sweeping a touch to the left at its foot
  {
    const x = m + cell + rng.range(-2, 2);
    const pts = line({ x: x + 3, y: pad }, { x: x - 6, y: S - pad }, 10, rng.range(2, 5), rng);
    out.push(mk(pts, rng.range(0.72, 0.82), 0.5));
  }
  // 丨: the right vertical, upright, pressed at the top
  {
    const x = m + cell * 2 + rng.range(-2, 2);
    out.push(mk(line({ x, y: pad + rng.range(0, 4) }, { x: x + rng.range(-2, 2), y: S - pad - rng.range(0, 8) }, 10, rng.range(-2, 2), rng), rng.range(0.72, 0.82), 0.3));
  }
  return out;
}

/** 〇 — an ensō: one breath of the brush, heavy where it lands, drying to a split tail, leaving a small gap. */
export function ensoStrokes(c: P, r: number, seed: number): Stroke[] {
  const rng = makeRng(seed);
  const a0 = rng.range(1.7, 2.6); // lands lower-left, travels clockwise
  const sweep = Math.PI * 2 * rng.range(0.97, 1.02);
  const n = 36;
  const W = r * 0.34;
  const squash = rng.range(0.92, 1.02);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + sweep * t;
    const rr = r * (1 + 0.04 * Math.sin(t * 7 + seed) + (t > 0.85 ? (t - 0.85) * 0.3 : 0));
    const w = W * (t < 0.06 ? 0.85 + 3 * t : t > 0.84 ? Math.max(0.34, 1 - (t - 0.84) * 3.6) : 1.02 + 0.12 * Math.sin(t * Math.PI * 2.4));
    pts.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr * squash, w });
  }
  return [{ kind: 'brush', pts, tone: 0.9, birth: 0, seed: (rng() * 1e9) | 0, dryness: 0.55 }];
}

/** ✕ — two crossing strokes, each pressed at the start and lifted at the end. */
export function crossStrokes(c: P, r: number, seed: number): Stroke[] {
  const rng = makeRng(seed);
  const W = r * 0.3;
  const k = r * 0.8;
  const s1 = line({ x: c.x - k + rng.range(-2, 2), y: c.y - k }, { x: c.x + k, y: c.y + k + rng.range(-2, 2) }, 9, rng.range(-3, 3), rng, 0.4);
  const s2 = line({ x: c.x + k * 0.95, y: c.y - k + rng.range(-2, 2) }, { x: c.x - k, y: c.y + k * 1.02 }, 9, rng.range(-3, 3), rng, 0.4);
  const tone = 0.8;
  return [
    { kind: 'brush', pts: spine(s1, W, brushProfile), tone, birth: 0, seed: (rng() * 1e9) | 0, dryness: 0.45 },
    { kind: 'brush', pts: spine(s2, W * 0.92, brushProfile), tone: tone - 0.04, birth: 0, seed: (rng() * 1e9) | 0, dryness: 0.55 },
  ];
}

/** The cinnabar stroke joining a winning three (from centre a to centre c, overshooting a little). */
export function winStroke(a: P, b: P, cell: number, seed: number): Stroke {
  const rng = makeRng(seed);
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const over = cell * 0.36;
  const pts = line({ x: a.x - ux * over, y: a.y - uy * over }, { x: b.x + ux * over, y: b.y + uy * over }, 12, rng.range(-4, 4), rng, 0.8);
  const W = cell * 0.09;
  return { kind: 'brush', pts: spine(pts, W, (t) => (t < 0.06 ? 0.9 + 2 * t : t > 0.8 ? Math.max(0.2, 1 - (t - 0.8) * 4) : 1)), tone: 0.86, color: PIGMENTS.cinnabar, birth: 0, seed: (rng() * 1e9) | 0, dryness: 0.6 };
}

/** Radius used for marks in a cell. */
export const markRadius = (cell: number) => cell * 0.31;
