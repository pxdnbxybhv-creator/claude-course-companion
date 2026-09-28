// 开篇 · the montage's beats (S4's sprout and S5, spec §4) from the app's own habit arithmetic.
//
// A synthetic daily habit is planted AND checked in on night 0, checked in on nights 0–38 and
// 46–72, and missed on nights 39–45 (「有几晚没有圈」). Each beat reads the plant's growth
// (growthFor), the pond (freshnessFor), the ink's vigour (vigorFor, scene.ts) and the chime
// (streakFor) exactly as the garden would on that night, so the film shows what the app will do.
// The moon's phase runs φ(n) = 0.062 + n / 29.53: a 4 % crescent at the sprout, full inside the
// lapse and at the bloom. Pure; tests/intro-beats.test.ts pins it.
import type { Cut } from '../../app/intro';
import { freshnessFor, growthFor, streakFor } from '../../core/habits';
import { vigorFor } from '../garden/scene';

export type BeatKind = 'sprout' | 'beat' | 'lapse' | 'return' | 'bloom';

export interface Beat {
  /** Film time of the beat (s). */
  t: number;
  kind: BeatKind;
  night: number;
  /** Check-ins so far (null on a lapse beat: nothing was done). */
  count: number | null;
  growth: number;
  /** Pond clarity = the habit's freshness. */
  pond: number;
  vigor: number;
  /** audio.chime(streak) on a check-in beat, else null. */
  chime: number | null;
  phase: number;
  lit: number;
  /** A check-in: an ensō and the pestle's tok. */
  enso: boolean;
  /** The beat jumps many nights: a flip-book of small ensō on 16ths. */
  flip: boolean;
}

/** The moon's phase on night n (0 new · .5 full). */
export const PHI0 = 0.062;
export const phaseOf = (night: number) => (((PHI0 + night / 29.53) % 1) + 1) % 1;
export const litOf = (p: number) => (1 - Math.cos(2 * Math.PI * p)) / 2;

/** The pond states baked before the montage; every beat's clarity lies within them. */
export const POND_STATES = [0.3, 0.5, 0.75, 1.0] as const;

const ROWS: [number, BeatKind, number][] = [
  [22.5, 'sprout', 0], [26.5, 'beat', 1], [27.5, 'beat', 2], [28.5, 'beat', 5], [29.5, 'beat', 12],
  [30.5, 'beat', 21], [31.5, 'beat', 30], [32.5, 'beat', 38],
  [33.5, 'lapse', 41], [34.5, 'lapse', 43], [35.5, 'lapse', 45],
  [36.5, 'return', 46], [37.5, 'beat', 56], [38.5, 'beat', 65], [39.5, 'bloom', 72],
];

/** Nights the habit was checked in. */
export const DONE_NIGHTS: readonly number[] = [...Array.from({ length: 39 }, (_, i) => i), ...Array.from({ length: 27 }, (_, i) => 46 + i)];

const BASE = Date.UTC(2026, 0, 1, 12);
const keyOf = (n: number) => new Date(BASE + n * 864e5).toISOString().slice(0, 10);
const HABIT = { days: [0, 1, 2, 3, 4, 5, 6], createdAt: keyOf(0) };

let memo: Beat[] | null = null;

/** The beat table (the same for both cuts: they share 0–49.2 s). */
export function beatTable(_cut: Cut = 'full'): Beat[] {
  if (memo) return memo;
  const out: Beat[] = [];
  let prevNight = 0;
  for (const [t, kind, night] of ROWS) {
    const done = new Set<string>();
    let count = 0;
    for (const d of DONE_NIGHTS) if (d <= night) { done.add(keyOf(d)); count++; }
    const pond = freshnessFor(HABIT, done, keyOf(night));
    const check = kind !== 'lapse';
    const phase = phaseOf(night);
    out.push({
      t, kind, night,
      count: check ? count : null,
      growth: growthFor(count),
      pond,
      vigor: vigorFor(pond),
      chime: check ? streakFor(HABIT, done, keyOf(night)) : null,
      phase,
      lit: litOf(phase),
      enso: check,
      flip: check && kind === 'beat' && night - prevNight >= 3,
    });
    prevNight = night;
  }
  memo = out;
  return out;
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** How long the plum takes to brush from one beat's growth to the next (s). */
export const GROW_S = 0.85;

/** The montage's continuous state at film time t (19.0–49.2), for render(t). */
export interface MontageState {
  growth: number;
  pond: number;
  vigor: number;
  /** Continuous moon phase (it visibly wheels). */
  phase: number;
  lit: number;
  /** The last beat at or before t, and the time since it. */
  beat: Beat | null;
  since: number;
  /** 0..1 the rabbit's lean toward the pond (the lapse). */
  lean: number;
}

export function montageAt(t: number): MontageState {
  const B = beatTable();
  let i = -1;
  for (let k = 0; k < B.length; k++) if (B[k].t <= t + 1e-9) i = k;
  const cur = i >= 0 ? B[i] : null;
  const next = i + 1 < B.length ? B[i + 1] : null;
  const prev = i > 0 ? B[i - 1] : null;
  // growth: brushes from the previous beat's growth to this one's over GROW_S
  let growth = 0;
  if (cur) {
    const from = prev ? prev.growth : 0;
    const dur = cur.kind === 'sprout' ? 1.0 : GROW_S;
    const t0 = cur.kind === 'sprout' ? 21.6 : cur.t;
    growth = from + (cur.growth - from) * ease((t - t0) / dur);
  } else if (t >= 21.6) {
    growth = B[0].growth * ease((t - 21.6) / 1.0);
  }
  // the pond and the vigour ease between beats (the murk comes on over the missed nights)
  let pond = 1, vigor = 1;
  if (cur) {
    const a = prev ?? cur;
    const u = ease((t - cur.t) / 0.6);
    pond = a.pond + (cur.pond - a.pond) * u;
    vigor = a.vigor + (cur.vigor - a.vigor) * u;
  }
  // the phase wheels continuously between beats (always forward)
  let phase: number;
  if (!cur) phase = PHI0;
  else if (!next) phase = cur.phase;
  else {
    const u = Math.max(0, Math.min(1, (t - cur.t) / (next.t - cur.t)));
    const n = cur.night + (next.night - cur.night) * u;
    phase = phaseOf(n);
  }
  // the lapse: the rabbit tilts toward the pond 33.7–34.3 and holds; straightens on the return
  const lean = t < 33.7 ? 0 : t < 34.3 ? ease((t - 33.7) / 0.6) : t < 36.5 ? 1 : t < 36.9 ? 1 - ease((t - 36.5) / 0.4) : 0;
  return { growth, pond, vigor, phase, lit: litOf(phase), beat: cur, since: cur ? t - cur.t : Infinity, lean };
}

/** The reflected rabbit is drawn only in S6 (the montage keeps the reflected moon a soft disc). */
export function reflectedRabbit(t: number): boolean {
  return t >= 39.5 && t < 49.2;
}

/** The two nearest baked pond states and the cross-fade between them. */
export function pondMix(c: number): { a: number; b: number; k: number } {
  const s = POND_STATES;
  const x = Math.max(s[0], Math.min(s[s.length - 1], c));
  for (let i = 0; i < s.length - 1; i++) {
    if (x <= s[i + 1] + 1e-9) return { a: i, b: i + 1, k: (x - s[i]) / (s[i + 1] - s[i]) };
  }
  return { a: s.length - 1, b: s.length - 1, k: 0 };
}
