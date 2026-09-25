// Background music, part 1 — the composer. Pure functions, no Web Audio: modes, phrase
// generation and development, cadences. Unit-tested in tests/music.test.ts.
//
// The five-note modes (五声调式) are named by their final (主音): 宫 商 角 徵 羽, each on any
// tonic. A tune is built the way traditional pieces often are — in periods of four phrases,
// 起承转合: 起 states a motif and pauses on a half cadence, 承 repeats or varies it, 转 moves it
// elsewhere (a sequence higher, an inversion, a new rhythm), 合 answers it and comes home to the
// final. Between periods the motif develops (a step changed, a cell swapped, occasionally a new
// motif) and the music may move to another mode of the same 宫 (同宫转调), so it never loops.
import { hashString, makeRng, mixSeed, type Rng } from '../core/rng';

/** Semitones of 宫 商 角 徵 羽 above 宫. */
export const PENT = [0, 2, 4, 7, 9] as const;
export const STEP_NAMES = ['宫', '商', '角', '徵', '羽'] as const;

export interface Mode {
  /** MIDI note of the mode's final (主音) in the melody's home octave. */
  tonic: number;
  /** Which step is the final: 0 宫 · 1 商 · 2 角 · 3 徵 · 4 羽. */
  final: number;
}

/** Semitones above the final for the five degrees of a mode (degree 0 = the final). */
export function modeSteps(final: number): number[] {
  const f = ((final % 5) + 5) % 5;
  const base = PENT[f];
  return [0, 1, 2, 3, 4].map((k) => (PENT[(f + k) % 5] - base + 12) % 12);
}

/** MIDI note of scale degree `d` (0 = final; 5 = the final an octave up; negatives go down). */
export function degreeToMidi(mode: Mode, d: number): number {
  const o = Math.floor(d / 5);
  return mode.tonic + 12 * o + modeSteps(mode.final)[d - 5 * o];
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** 宫商角徵羽 name of degree `d` in `mode`. */
export function stepName(mode: Mode, d: number): string {
  return STEP_NAMES[(mode.final + (((d % 5) + 5) % 5)) % 5];
}

/** Pitch class of the mode's 宫. */
export function gongPc(mode: Mode): number {
  return (((mode.tonic - PENT[mode.final]) % 12) + 12) % 12;
}

/** Degree of the half cadence: the fifth above the final, or the fourth where the mode has no fifth (角). */
export function halfCadence(final: number): number {
  return modeSteps(final)[3] === 7 ? 3 : 2;
}

/**
 * Another mode on the same 宫 (同宫转调), its tonic placed within a tritone of `ref` — the piece's
 * home tonic, so that modulating again and again never random-walks the key out of range.
 */
export function relatedMode(mode: Mode, final: number, ref = mode.tonic): Mode {
  const gong = mode.tonic - PENT[mode.final];
  let tonic = gong + PENT[((final % 5) + 5) % 5];
  while (tonic - ref > 6) tonic -= 12;
  while (ref - tonic > 6) tonic += 12;
  return { tonic, final: ((final % 5) + 5) % 5 };
}

/**
 * The music's 宫 is F, the same as every sound effect (voices.ts: GONG = F3), so a check-in chime or
 * a pluck always lands inside the scale that is playing. Every theme's modes are on it.
 */
export const MUSIC_GONG_PC = 5;

// ---------------------------------------------------------------------------
// Styles and phrases

export type Role = 'qi' | 'cheng' | 'zhuan' | 'he';
export const ROLES: readonly Role[] = ['qi', 'cheng', 'zhuan', 'he'];

export interface Style {
  /** Tempo range (beats per minute); one tempo per day, drifting a little per period. */
  bpm: [number, number];
  /** Candidate modes (one is chosen per day). */
  modes: Mode[];
  /** Melody range in degrees relative to the final. */
  range: [number, number];
  /** Rhythm cells (durations in beats); motifs are built from them. */
  cells: number[][];
  /** Length of a motif in beats. */
  motifBeats: number;
  /** Motif statements per phrase before the cadence. */
  statements: [number, number];
  /** Chance that an inner note of a statement becomes a rest (breath inside the line). */
  restChance: number;
  /** Rest after a phrase, in beats. */
  breath: [number, number];
  /** Extra rest after the 合 phrase (end of a period), in beats. */
  periodRest: [number, number];
  /** Length of a cadence note in beats. */
  cadenceBeats: number;
  /** Relative weight of leaps (3–4 degrees) against steps. */
  leap: number;
  /** Chance per period of moving to another mode on the same 宫. */
  modulate: number;
}

export interface MNote {
  /** Onset in beats from the phrase start. */
  beat: number;
  /** Length in beats. */
  dur: number;
  /** Scale degree (0 = final). */
  deg: number;
  /** 0..1 */
  vel: number;
  /** True for the phrase's cadence note. */
  cad?: boolean;
  /** Arrived at by a leap (≥ 3 degrees) — a place for a grace note or a slide. */
  leap?: boolean;
}

export interface Phrase {
  role: Role;
  /** Period number (0, 1, 2…). */
  period: number;
  /** Index of the phrase in the whole piece. */
  index: number;
  mode: Mode;
  bpm: number;
  notes: MNote[];
  /** Where the last note ends (beats). */
  end: number;
  /** Total length including the rest that follows (beats). */
  beats: number;
  /** The degree the phrase cadences on. */
  cadence: number;
}

export interface Motif { rhythm: number[]; steps: number[] }

/** Reflect a degree back into [lo, hi]. */
export function fold(d: number, lo: number, hi: number): number {
  for (let i = 0; i < 4 && (d < lo || d > hi); i++) {
    if (d > hi) d = hi - (d - hi);
    if (d < lo) d = lo + (lo - d);
  }
  return Math.max(lo, Math.min(hi, d));
}

/** A rhythm of `beats` beats from the style's cells. */
export function makeRhythm(cells: number[][], beats: number, rng: Rng): number[] {
  const out: number[] = [];
  let left = beats;
  for (let guard = 0; left > 1e-6 && guard < 64; guard++) {
    const fit = cells.filter((c) => sum(c) <= left + 1e-6);
    if (!fit.length) { out.push(left); break; }
    const c = rng.pick(fit);
    out.push(...c);
    left -= sum(c);
  }
  return out;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Interval steps for a motif: mostly steps, a few leaps (always recovered by a step back). */
export function makeSteps(n: number, leap: number, rng: Rng): number[] {
  const steps = [0];
  for (let i = 1; i < n; i++) {
    const prev = steps[i - 1];
    if (Math.abs(prev) >= 3) { steps.push(-Math.sign(prev) * rng.int(1, 2)); continue; }
    const w: [number, number][] = [[1, 3], [-1, 3.4], [2, 1.2], [-2, 1.4], [0, 0.5], [3, leap], [-3, leap], [4, leap * 0.4], [-4, leap * 0.3]];
    let x = rng() * w.reduce((a, [, v]) => a + v, 0);
    let pick = w[0][0];
    for (const [s, v] of w) { if ((x -= v) <= 0) { pick = s; break; } }
    if (pick === 0 && prev === 0) pick = rng.chance(0.5) ? 1 : -1; // no triple repeats
    steps.push(pick);
  }
  return steps;
}

export function makeMotif(style: Style, rng: Rng): Motif {
  const rhythm = makeRhythm(style.cells, style.motifBeats, rng);
  return { rhythm, steps: makeSteps(rhythm.length, style.leap, rng) };
}

/** Develop a motif between periods: keep its identity, change a detail. */
export function developMotif(m: Motif, style: Style, rng: Rng): Motif {
  const x = rng();
  if (x < 0.3) {
    // change one or two intervals by a step
    const steps = m.steps.slice();
    for (let k = rng.int(1, 2); k > 0; k--) {
      const i = rng.int(1, Math.max(1, steps.length - 1));
      if (i < steps.length) steps[i] += rng.chance(0.5) ? 1 : -1;
    }
    return { rhythm: m.rhythm, steps };
  }
  if (x < 0.55) {
    // swap the rhythm of the second half
    const half = style.motifBeats / 2;
    let acc = 0, cut = 0;
    while (cut < m.rhythm.length && acc + m.rhythm[cut] <= half + 1e-6) acc += m.rhythm[cut++];
    const tail = makeRhythm(style.cells, style.motifBeats - acc, rng);
    const rhythm = [...m.rhythm.slice(0, cut), ...tail];
    const steps = [...m.steps.slice(0, cut), ...makeSteps(tail.length + 1, style.leap, rng).slice(1)].slice(0, rhythm.length);
    while (steps.length < rhythm.length) steps.push(rng.chance(0.5) ? 1 : -1);
    return { rhythm, steps };
  }
  if (x < 0.7) return { rhythm: m.rhythm, steps: m.steps.map((s, i) => (i ? -s : 0)) }; // inversion
  if (x < 0.85) return m; // keep: a recognisable return
  return makeMotif(style, rng); // a new section
}

type Transform = 'repeat' | 'vary' | 'invert' | 'retro' | 'augment' | 'diminish';

function transform(m: Motif, t: Transform, rng: Rng): Motif {
  switch (t) {
    case 'repeat': return m;
    case 'vary': {
      const steps = m.steps.slice();
      const i = rng.int(1, Math.max(1, steps.length - 1));
      if (i < steps.length) steps[i] += rng.chance(0.5) ? 1 : -1;
      // sometimes split the longest note into two (a passing note)
      let rhythm = m.rhythm.slice();
      if (rng.chance(0.4)) {
        let li = 0;
        rhythm.forEach((d, k) => { if (d > rhythm[li]) li = k; });
        if (rhythm[li] >= 1) {
          rhythm = [...rhythm.slice(0, li), rhythm[li] / 2, rhythm[li] / 2, ...rhythm.slice(li + 1)];
          steps.splice(li + 1, 0, rng.chance(0.5) ? 1 : -1);
        }
      }
      return { rhythm, steps: steps.slice(0, rhythm.length) };
    }
    case 'invert': return { rhythm: m.rhythm, steps: m.steps.map((s, i) => (i ? -s : 0)) };
    case 'retro': {
      const n = m.steps.length;
      const steps = [0];
      for (let i = 1; i < n; i++) steps.push(-m.steps[n - i]);
      return { rhythm: m.rhythm.slice().reverse(), steps };
    }
    case 'augment': return { rhythm: m.rhythm.map((d) => d * 2), steps: m.steps };
    case 'diminish': return { rhythm: m.rhythm.map((d) => d / 2), steps: m.steps };
  }
}

/** Lay a motif out from degree `start` at beat `beat0`. */
export function realize(m: Motif, start: number, beat0: number, style: Style, rng: Rng, strong = 0.78): MNote[] {
  const [lo, hi] = style.range;
  const out: MNote[] = [];
  let d = fold(start, lo, hi);
  let b = beat0;
  for (let i = 0; i < m.rhythm.length; i++) {
    const prev = d;
    if (i > 0) d = fold(d + m.steps[i], lo, hi);
    const dur = m.rhythm[i];
    const inner = i > 0 && i < m.rhythm.length - 1;
    if (inner && rng.chance(style.restChance)) { b += dur; continue; }
    const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
    const vel = (onBeat && Math.round(b) % 2 === 0 ? strong : onBeat ? strong - 0.1 : strong - 0.2) + rng.range(-0.06, 0.06);
    out.push({ beat: b, dur, deg: d, vel: Math.max(0.2, Math.min(1, vel)), leap: i > 0 && Math.abs(d - prev) >= 3 });
    b += dur;
  }
  return out;
}

/** The octave of `target` (a degree class) nearest to `from`, inside [lo, hi] when possible. */
export function nearestOctave(target: number, from: number, lo: number, hi: number): number {
  const base = ((target % 5) + 5) % 5;
  let best = base, bd = Infinity;
  for (let o = -4; o <= 4; o++) {
    const c = base + 5 * o;
    const pen = c < lo || c > hi ? 100 : 0;
    const dist = Math.abs(c - from) + pen;
    if (dist < bd) { bd = dist; best = c; }
  }
  return best;
}

/** End a line on `target`: approach it by step and hold it (the cadence). Mutates and returns notes. */
export function cadence(notes: MNote[], target: number, style: Style, vel: number): MNote[] {
  const [lo, hi] = style.range;
  const last = notes[notes.length - 1];
  const end = last ? last.beat + last.dur : 0;
  const from = last ? last.deg : target;
  const t = nearestOctave(target, from, lo, hi);
  const passDur = Math.min(1, style.cadenceBeats / 2);
  if (last && last.deg === t) {
    last.dur = Math.max(last.dur, style.cadenceBeats);
    last.cad = true;
    return notes;
  }
  let b = end;
  if (last && Math.abs(from - t) > 2) {
    const dir = Math.sign(t - from);
    notes.push({ beat: b, dur: passDur, deg: t - dir, vel: vel * 0.9 });
    b += passDur;
  }
  notes.push({ beat: b, dur: style.cadenceBeats, deg: t, vel, cad: true });
  return notes;
}

// ---------------------------------------------------------------------------

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Seed for a theme's tune of the day: the same theme sounds related all day, and new tomorrow. */
export function daySeed(theme: string, day = dayKey()): number {
  return mixSeed(hashString(day), hashString(theme));
}

/**
 * Generates an endless tune in a style. `seed` fixes the day's mode, tempo and first motif;
 * `visit` varies how it unfolds (each time the theme starts again the same day).
 */
export class Composer {
  readonly style: Style;
  /** The day's mode: modulations stay near its tonic. */
  readonly home: Mode;
  mode: Mode;
  bpm: number;
  private rng: Rng;
  private motif: Motif;
  private index = 0;
  private period = 0;
  private last = 0;
  private baseBpm: number;

  constructor(style: Style, seed: number, visit = 0) {
    this.style = style;
    const day = makeRng(seed);
    this.mode = day.pick(style.modes);
    this.home = { ...this.mode };
    this.baseBpm = Math.round(day.range(style.bpm[0], style.bpm[1]));
    this.bpm = this.baseBpm;
    this.motif = makeMotif(style, day);
    this.rng = makeRng(mixSeed(seed, 0x51ed + visit));
    if (visit > 0) this.motif = developMotif(this.motif, style, this.rng);
    this.last = 0;
  }

  next(): Phrase {
    const s = this.style, r = this.rng;
    const role = ROLES[this.index % 4];
    if (role === 'qi' && this.index > 0) {
      this.period++;
      this.motif = developMotif(this.motif, s, r);
      if (r.chance(s.modulate)) {
        const finals = [0, 3, 4, 1].filter((f) => f !== this.mode.final);
        this.mode = relatedMode(this.mode, r.pick(finals), this.home.tonic);
        this.last = 0;
      }
      this.bpm = Math.round(this.baseBpm * r.range(0.96, 1.04));
    }
    const [lo, hi] = s.range;
    const half = halfCadence(this.mode.final);
    const nState = r.int(s.statements[0], s.statements[1]);
    const notes: MNote[] = [];
    let beat = 0;
    const lively = s.motifBeats <= 4 && s.bpm[0] >= 80;
    // Where each role starts and what it does to the motif.
    const plan: { start: number; t: Transform[]; seq: number; target: number; strong: number } =
      role === 'qi' ? { start: this.last, t: ['repeat', 'vary'], seq: -1, target: half, strong: 0.72 }
      : role === 'cheng' ? { start: this.last + r.int(-1, 1), t: ['vary', 'repeat'], seq: r.pick([-1, 1]), target: r.pick([1, half, half]), strong: 0.74 }
      : role === 'zhuan' ? { start: this.last + r.int(1, 3), t: [r.pick<Transform>(['invert', 'retro', lively ? 'diminish' : 'augment']), 'vary'], seq: r.pick([1, 2, -2]), target: r.pick([2, 4, 1]), strong: 0.8 }
      : { start: this.last + r.int(0, 2), t: [r.pick<Transform>(['invert', 'retro', 'repeat']), 'vary'], seq: -1, target: 0, strong: 0.68 };
    let start = fold(plan.start, lo, hi);
    for (let k = 0; k < nState; k++) {
      let m = transform(this.motif, plan.t[Math.min(k, plan.t.length - 1)], r);
      // an augmented motif should not make the phrase enormous
      if (sum(m.rhythm) > s.motifBeats * 1.5 && k > 0) m = this.motif;
      const line = realize(m, start, beat, s, r, plan.strong);
      notes.push(...line);
      beat += sum(m.rhythm);
      const lastDeg = line.length ? line[line.length - 1].deg : start;
      start = fold(lastDeg + plan.seq + r.int(-1, 1), lo, hi);
    }
    const cadVel = role === 'he' ? 0.62 : role === 'zhuan' ? 0.78 : 0.7;
    cadence(notes, plan.target, s, cadVel);
    // 合 fades a little towards its close
    if (role === 'he') notes.forEach((n, i) => { n.vel *= 1 - 0.18 * (i / Math.max(1, notes.length - 1)); });
    const lastN = notes[notes.length - 1];
    const end = lastN.beat + lastN.dur;
    let rest = r.range(s.breath[0], s.breath[1]);
    if (role === 'he') rest += r.range(s.periodRest[0], s.periodRest[1]);
    rest = Math.round(rest * 2) / 2;
    this.last = lastN.deg;
    const phrase: Phrase = {
      role, period: this.period, index: this.index, mode: { ...this.mode }, bpm: this.bpm,
      notes, end, beats: end + rest, cadence: lastN.deg,
    };
    this.index++;
    return phrase;
  }
}
