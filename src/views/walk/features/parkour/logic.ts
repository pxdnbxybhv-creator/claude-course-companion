// Pure logic for 轻功 · parkour: which coin spots are out today, the 梅花桩 run's clock and its
// best-time rules, and a few small geometric helpers. No DOM, no three.js (tests/walk-parkour.test.ts).
import { makeRng } from '../../../../core/rng';

/** What a hard-to-reach coin asks of you (see CHALLENGE_BY). */
export type Challenge = 'double' | 'high' | 'glide';

export interface SpotLike {
  id: string;
  region: string;
  challenge?: Challenge;
}

/** How many coin spots are out on a day, world-wide. */
export const DAILY_SPOTS = 40;
/** At least this many of today's spots are challenges (when the set has them). */
export const MIN_CHALLENGES = 5;

/**
 * Today's coin spots: `n` of `spots`, the same all day for the same seed. Every region gets its
 * share (round-robin over each region's own shuffled list, so none is left bare), and a few of
 * them are challenges. The result keeps the order of `spots`.
 */
export function pickDaily<T extends SpotLike>(spots: readonly T[], seed: number, n = DAILY_SPOTS): T[] {
  if (n >= spots.length) return [...spots];
  if (n <= 0) return [];
  const rng = makeRng(seed);
  const byRegion = new Map<string, T[]>();
  for (const s of spots) {
    const l = byRegion.get(s.region);
    if (l) l.push(s);
    else byRegion.set(s.region, [s]);
  }
  const lists = [...byRegion.values()].map((l) => shuffle(l, rng));
  // the regions take turns in a shuffled order too, so no place always gets the last pick
  const order = shuffle(lists.map((_, i) => i), rng);
  const chosen = new Set<T>();
  for (let round = 0; chosen.size < n; round++) {
    let any = false;
    for (const i of order) {
      const l = lists[i];
      if (round < l.length) {
        any = true;
        chosen.add(l[round]);
        if (chosen.size >= n) break;
      }
    }
    if (!any) break;
  }
  // make sure some challenges are out: swap a plain spot of the same region for an unpicked challenge
  const want = Math.min(MIN_CHALLENGES, spots.filter((s) => s.challenge).length);
  let have = [...chosen].filter((s) => s.challenge).length;
  if (have < want) {
    const spare = shuffle(spots.filter((s) => s.challenge && !chosen.has(s)), rng);
    for (const c of spare) {
      if (have >= want) break;
      const plain = [...chosen].filter((s) => !s.challenge);
      const out = plain.find((s) => s.region === c.region) ?? plain[plain.length - 1];
      if (!out) break;
      chosen.delete(out);
      chosen.add(c);
      have++;
    }
  }
  return spots.filter((s) => chosen.has(s));
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────────────── 梅花桩: the run ─────────────────────────────

/** Where the walker is, as the course sees it. */
export type RunPlace =
  /** standing on the start stone */
  | 'start'
  /** standing on a pole */
  | 'pole'
  /** standing on the finish platform */
  | 'finish'
  /** standing on the ground inside the course (fell off) */
  | 'ground'
  /** in the air over the course */
  | 'air'
  /** somewhere else entirely (walked away, travelled) */
  | 'away';

export type RunPhase = 'idle' | 'armed' | 'running' | 'fallen' | 'finished';
export type RunEvent = 'armed' | 'go' | 'finish' | 'fall' | 'abort';

/** A run longer than this is called off (s). */
export const RUN_LIMIT = 180;

/**
 * The clock of a run over the poles. Stand on the start stone (armed); the clock starts the moment
 * you leave it; landing on the finish stops it; touching the ground between the poles is a fall.
 * Times are seconds on the world clock.
 */
export class PoleRun {
  phase: RunPhase = 'idle';
  /** When the clock started. */
  t0 = 0;
  /** The last finished time (s). */
  time = 0;

  step(now: number, at: RunPlace): RunEvent | null {
    switch (this.phase) {
      case 'idle':
      case 'fallen':
      case 'finished':
        if (at === 'start') { this.phase = 'armed'; return 'armed'; }
        return null;
      case 'armed':
        if (at === 'start') return null;
        if (at === 'air' || at === 'pole') { this.phase = 'running'; this.t0 = now; return 'go'; }
        if (at === 'finish') { this.phase = 'idle'; return null; } // no shortcut from start to finish
        this.phase = 'idle';
        return null;
      case 'running':
        if (now - this.t0 > RUN_LIMIT) { this.phase = 'idle'; return 'abort'; }
        if (at === 'finish') { this.phase = 'finished'; this.time = now - this.t0; return 'finish'; }
        if (at === 'ground') { this.phase = 'fallen'; return 'fall'; }
        if (at === 'away') { this.phase = 'idle'; return 'abort'; }
        if (at === 'start') { this.phase = 'armed'; return 'armed'; } // back to the start: begin again
        return null;
    }
  }

  /** Seconds on the clock now (0 unless running). */
  elapsed(now: number): number {
    return this.phase === 'running' ? Math.max(0, now - this.t0) : 0;
  }

  reset(): void {
    this.phase = 'idle';
    this.t0 = 0;
  }
}

/**
 * Best times live in play.best, which only ever rises (recordMax): a time is kept as a score, higher
 * for faster. Centiseconds below a 1000 s cap.
 */
export const POLE_SCORE_BASE = 100000;
export function poleScore(secs: number): number {
  const cs = Math.round(Math.max(0, secs) * 100);
  return Math.max(1, POLE_SCORE_BASE - cs);
}
/** The time (s) a stored score stands for, or null when there is none. */
export function poleTime(score: number | undefined): number | null {
  if (!score || score <= 0 || score >= POLE_SCORE_BASE) return null;
  return (POLE_SCORE_BASE - score) / 100;
}

/** Coins for the first finish ever, and for a new best time. */
export const FIRST_FINISH_COINS = 30;
export const RECORD_COINS = 10;

/** What a finish in `secs` earns, given the best time so far (null = never finished). */
export function finishReward(best: number | null, secs: number): { coins: number; first: boolean; record: boolean } {
  if (best === null) return { coins: FIRST_FINISH_COINS, first: true, record: true };
  // a record must beat the old one by a clear hundredth of a second
  if (Math.round(secs * 100) < Math.round(best * 100)) return { coins: RECORD_COINS, first: false, record: true };
  return { coins: 0, first: false, record: false };
}

/** 12.345 → "12.3″", 75.2 → "1′15.2″". */
export function fmtTime(secs: number): string {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const tenth = (Math.floor(r * 10) / 10).toFixed(1);
  return m > 0 ? `${m}′${tenth.padStart(4, '0')}″` : `${tenth}″`;
}

// ───────────────────────────── coins ─────────────────────────────

/** How far below a coin's own surface the feet may be and still pick it up (m). */
export const COIN_FEET = 0.25;
/** The pick-up reach: horizontal radius, and the body's span from the feet (below the coin) up. */
export const COIN_REACH = 0.7;
export const COIN_BELOW = 0.3;
export const COIN_ABOVE = 1.4;

/**
 * Does a walker whose feet are at `feetY`, (dx, dz) from a coin at `coinY` hanging over a surface at
 * `floorY`, pick it up? The body (feet to head) must pass through the coin with the feet up at (or
 * above) that surface: a coin on a low jar or a parapet is a hop, never a walk past, and one hung out
 * over a drop is reached only by keeping your height a long way out.
 */
export function coinReached(dx: number, dz: number, coinY: number, feetY: number, floorY: number): boolean {
  const dy = coinY - feetY;
  return dx * dx + dz * dz < COIN_REACH * COIN_REACH && dy > -COIN_BELOW && dy < COIN_ABOVE && feetY > floorY - COIN_FEET;
}

// ───────────────────────────── small geometry ─────────────────────────────

/** Is (x, z) inside the oriented rectangle (centre, unit axis, half length, half width)? */
export function inRect(x: number, z: number, cx: number, cz: number, ax: number, az: number, hl: number, hw: number): boolean {
  const dx = x - cx, dz = z - cz;
  return Math.abs(dx * ax + dz * az) <= hl && Math.abs(-dx * az + dz * ax) <= hw;
}

/**
 * Stepping stones from a to b: `n` stones evenly along the line, nudged side to side by up to
 * `zig` metres (alternately, so the way reads as a path), ends excluded.
 */
export function stoneLine(a: { x: number; z: number }, b: { x: number; z: number }, n: number, zig: number, seed = 1): { x: number; z: number }[] {
  const rng = makeRng(seed);
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
  const out: { x: number; z: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const side = (i % 2 ? 1 : -1) * zig * (0.5 + rng() * 0.5);
    out.push({ x: a.x + (b.x - a.x) * t - uz * side, z: a.z + (b.z - a.z) * t + ux * side });
  }
  return out;
}

/** Local frame helper: (lx along the heading's right, lz along the heading) → world, heading ry about +Y. */
export function framePoint(x: number, z: number, ry: number, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(ry), s = Math.sin(ry);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}
