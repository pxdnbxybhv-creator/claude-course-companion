// 开篇 · the score of 《月亮看见的》 (spec §7) — an authored reel on the music bus, pure data.
//
// 60 bpm, so one beat is one second and the sync hits sit on t = k + 0.5; the band's 宫 F, pentatonic
// F G A C D. 箫 is the moon, 二胡 is 嫦娥, 古琴 is writing and water, 古筝 the garden growing (and the
// glissandi), 笙 the night air, 笛 the world beyond the garden, 琵琶 the mirror, `wood` the pestle and
// the board, 铃 the glints. The poem plays its own ping-ze tones on the 古琴, one pluck per brushed glyph: the
// question hangs on 羽 at 「许」 and resolves to 宫 at 「来」.
//
// Every event is a MusicEvent (music-themes.ts) whose `t` is FILM time; the reel (reel.ts) plays
// them on the shared AudioContext. `until` releases a sound at a film time (a choke, a hard cut, a
// silence the picture asks for). The sfx (drip, chime, knock, the stream bed) are cues the film
// schedules on the sound engine with `at` (§9.7); the tap's drip at 0.0 is the gate's own call.
//
// Both cuts are built by the same act builders; the short cut shares 起 and 承 (0–49.2) exactly.
// tests/intro-score.test.ts pins every HIT, the ping-ze mapping, the lapse and the voice budget.
//
// (The oblique tone's glyph is written \u4ec4 here: the font builder collects every CJK character
// in src/, comments included, and this one is never shown — it would only add a WenKai glyph.)
import type { Cut } from '../../app/intro';
import type { Inst, MusicEvent } from '../../audio/music-themes';
import type { KitHit, KitKind, LineInst, LineNote, MusicJob, PluckInst, PluckNote } from '../../audio/music-dsp';

export type SfxCue =
  /** `by: 'gate'`: fired by the gate in the click handler (film t 0), not by the film's scheduler. */
  | { t: number; kind: 'drip'; pitch: number; gain: number; by?: 'gate' }
  | { t: number; kind: 'chime'; streak: number }
  | { t: number; kind: 'knock' }
  | { t: number; kind: 'ambient'; bed: 'stream' | 'restore' };

export interface ReelEvent extends MusicEvent {
  /** Film time (s) at which the sound is released (≈ `tau` time constant); `dur` already ends there. */
  until?: number;
  tau?: number;
}

export interface Score {
  events: ReelEvent[];
  sfx: SfxCue[];
  /** Act starts: 起 承 转 合 (short: 起 承 转′ 合′). */
  acts: number[];
  end: number;
}

/** The poem's tones, one per brushed glyph (Q1 半亩方塘一鉴开 · Q3a 问渠那得清如许 · Q3b 为有源头活水来). */
export const PINGZE = {
  Q1: '\u4ec4\u4ec4平平\u4ec4\u4ec4平', // ze ze ping ping ze ze ping
  Q3a: '\u4ec4平\u4ec4\u4ec4平平\u4ec4', // ze ping ze ze ping ping ze
  Q3b: '\u4ec4\u4ec4平平\u4ec4\u4ec4平',
} as const;
const ZE = '\u4ec4';
/** One glyph inks in every 0.17 s, and its pluck lands with it. */
export const GLYPH_STEP = 0.17;
/** When each column starts inking (full and short cut alike). */
export const QUOTE_AT = { Q1: 14.5, Q3a: 43.9, Q3b: 45.2 } as const;

export const END: Record<Cut, number> = { full: 86.0, short: 70.8 };
export const ACTS: Record<Cut, number[]> = { full: [0, 19.0, 49.2, 67.1], short: [0, 19.0, 49.2, 54.2] };
/** The skip tail's cue (music.cue(tailCue(), { choke: TAIL_CHOKE }) at the seal press, tail + 0.4 s). */
export const TAIL_CHOKE = 2.1;

// ---------------------------------------------------------------------------------------------- pitches

/** F3 53 · G3 55 · A3 57 · C4 60 · D4 62 · F4 65 · G4 67 · A4 69 · C5 72 · D5 74 · F5 77 · G5 79 · A5 81 · C6 84 · D6 86 · F6 89. */
export const P = {
  F2: 41, C3: 48, F3: 53, G3: 55, A3: 57, C4: 60, D4: 62, F4: 65, G4: 67, A4: 69, C5: 72, D5: 74, F5: 77, G5: 79, A5: 81,
  C6: 84, D6: 86, F6: 89, A6: 93,
} as const;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** One 古琴 pluck of the poem's tones. */
export interface PingzeNote { midi: number[]; tone: '平' | '\u4ec4'; long: boolean; vel: number; ring: number; vib?: boolean }

/**
 * 平 (ping) → 宫 F3 / 徵 C4 alternating from 宫, long, vel .5; ze → 商 G4 / 羽 D5 alternating from 商, short,
 * vel .35. A line-final 平 is F3 plus the open-string F2 (it resolves); a line-final ze is 羽 D5 held
 * 1.3 s with 吟 (the question left hanging). Pure; pinned by the test.
 */
export function pingze(tones: string): PingzeNote[] {
  const g = [...tones];
  let p = 0, z = 0;
  return g.map((c, i) => {
    const last = i === g.length - 1;
    if (c === '平') {
      if (last) return { midi: [P.F3, P.F2], tone: '平', long: true, vel: 0.5, ring: 3.2 };
      return { midi: [p++ % 2 ? P.C4 : P.F3], tone: '平', long: true, vel: 0.5, ring: 2.2 };
    }
    if (last) return { midi: [P.D5], tone: ZE, long: true, vel: 0.4, ring: 1.6, vib: true };
    return { midi: [z++ % 2 ? P.D5 : P.G4], tone: ZE, long: false, vel: 0.35, ring: 0.7 };
  });
}

// ---------------------------------------------------------------------------------------------- the band

/** Per-instrument levels, calibrated in the lab (?scene=music&reel=full) against the app's themes. */
const MIX: Record<Inst, { gain: number; send: number; echo: number; pan: number }> = {
  qin: { gain: 0.95, send: 0.38, echo: 0.06, pan: 0 },
  harm: { gain: 0.8, send: 0.55, echo: 0.16, pan: 0.1 },
  zheng: { gain: 0.72, send: 0.32, echo: 0.08, pan: 0 },
  pipa: { gain: 0.66, send: 0.22, echo: 0, pan: 0.2 },
  xiao: { gain: 0.95, send: 0.5, echo: 0.1, pan: -0.12 },
  dizi: { gain: 0.62, send: 0.42, echo: 0.14, pan: 0.18 },
  erhu: { gain: 0.78, send: 0.34, echo: 0.04, pan: -0.16 },
  suona: { gain: 0.4, send: 0.3, echo: 0, pan: 0 },
  sheng: { gain: 1.3, send: 0.45, echo: 0, pan: 0 },
  drum: { gain: 1, send: 0.18, echo: 0, pan: -0.1 },
  wood: { gain: 1, send: 0.2, echo: 0, pan: 0.08 },
  gong: { gain: 1, send: 0.3, echo: 0.1, pan: 0.1 },
  ling: { gain: 1, send: 0.55, echo: 0.2, pan: 0.3 },
  temple: { gain: 1, send: 0.5, echo: 0.2, pan: -0.15 },
  bo: { gain: 1, send: 0.25, echo: 0, pan: 0.2 },
};

type HitKind = 'tang' | 'rim' | 'big' | 'wood' | 'daluo' | 'xiaoluo' | 'bo' | 'ling' | 'temple';

/** Sounding length of a render (s), so the voice budget and the lapse can be checked on paper. */
const harmDur = (m: number) => Math.min(6.5, 0.95 * 3.6 * Math.pow(hz(m) / 350, -0.35));
const HIT_DUR: Record<HitKind, number> = { tang: 0.8, rim: 0.25, big: 1.36, wood: 0.5, daluo: 5.98, xiaoluo: 2.09, bo: 1.4, ling: 3.2, temple: 9 };

interface PluckIn { t: number; midi: number; vel: number; ring?: number; harm?: boolean; vib?: boolean; glide?: number; trem?: number }

class Band {
  readonly ev: ReelEvent[] = [];
  readonly sfx: SfxCue[] = [];
  private k = 0;

  /** A seed from the event's time and kind: both cuts give their shared acts identical renders. */
  private seed(t: number, salt: number) { return (Math.imul(Math.round(t * 1000) + 7919, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0; }
  private variant() { return 1 + (this.k++ % 3); }

  /** A monophonic 箫 / 笛 / 二胡 line from `t0`: [midi, beats, extra] played legato. */
  line(inst: LineInst, t0: number, notes: [number, number, Partial<LineNote>?][], vel: number, o: { vib?: number; gain?: number; pan?: number; prio?: 0 | 1 | 2 } = {}) {
    let t = 0;
    const ln: LineNote[] = notes.map(([m, d, x]) => {
      const n: LineNote = { t, dur: d, freq: hz(m), vel, vib: o.vib ?? 1, ...x };
      t += d;
      return n;
    });
    const mx = MIX[inst];
    this.ev.push({
      t: t0, inst, job: { op: 'line', inst, notes: ln, seed: this.seed(t0, 1 + inst.length) },
      gain: mx.gain * (o.gain ?? 1), pan: o.pan ?? mx.pan, send: mx.send, echo: mx.echo, prio: o.prio ?? 0,
      dur: t + 0.3, notes: ln.map((n, i) => ({ t: n.t, dur: n.dur, midi: notes[i][0] })),
    });
  }

  /** Plucks mixed into one render (one voice). Times are film times. */
  pluck(inst: PluckInst, list: PluckIn[], o: { gain?: number; battle?: boolean; prio?: 0 | 1 | 2; spread?: number; center?: number } = {}) {
    if (!list.length) return;
    const t0 = Math.min(...list.map((n) => n.t));
    const mx = MIX[list.every((n) => n.harm) ? 'harm' : inst];
    const ring = (n: PluckIn) => n.harm ? harmDur(n.midi)
      : n.trem ? n.trem + (o.battle ? 0.8 : 1.1)
      : inst === 'pipa' ? (o.battle ? 0.8 : 1.1) : n.ring ?? 2.4;
    const notes: PluckNote[] = list.map((n) => {
      const x: PluckNote = { t: +(n.t - t0).toFixed(4), freq: hz(n.midi), vel: n.vel, pan: Math.max(-0.8, Math.min(0.8, (o.center ?? 0) + ((n.midi - 64) / 24) * (o.spread ?? 0.3))) };
      if (n.harm) x.harm = true;
      else {
        if (n.ring && inst !== 'pipa') x.ring = n.ring;
        if (n.vib) x.vib = true;
        if (n.glide) x.glide = n.glide;
        if (n.trem) x.trem = n.trem;
      }
      return x;
    });
    const job: MusicJob = { op: 'pluck', inst, notes, seed: this.seed(t0, inst === 'qin' ? 11 : inst === 'zheng' ? 12 : 13) };
    if (o.battle) (job as { tone?: 'battle' }).tone = 'battle';
    this.ev.push({
      t: t0, inst: list.every((n) => n.harm) ? 'harm' : inst, job, gain: mx.gain * (o.gain ?? 1), pan: 0, send: mx.send, echo: mx.echo,
      prio: o.prio ?? 0, dur: Math.max(...list.map((n) => n.t - t0 + ring(n))),
      notes: list.map((n) => ({ t: n.t - t0, dur: Math.min(ring(n), 2), midi: n.midi })),
    });
  }

  qin(t: number, midi: number | number[], vel: number, x: Partial<PluckIn> = {}) {
    this.pluck('qin', (Array.isArray(midi) ? midi : [midi]).map((m) => ({ t, midi: m, vel, ring: 2.6, ...x })));
  }
  harm(t: number, midi: number, vel: number) { this.pluck('qin', [{ t, midi, vel, harm: true }]); }

  /** A 笙 chord (free reeds; the swell is its own attack, ≈ 28 % of `dur`). */
  sheng(t: number, midis: number[], dur: number, vel: number, x: { air?: number; stab?: boolean; prio?: 0 | 1 | 2 } = {}) {
    const mx = MIX.sheng;
    const job: MusicJob = { op: 'sheng', freqs: midis.map(hz), dur, vel, seed: this.seed(t, 21) };
    if (x.air) job.air = x.air;
    if (x.stab) job.stab = true;
    this.ev.push({ t, inst: 'sheng', job, gain: mx.gain, pan: 0, send: mx.send, echo: 0, prio: x.prio ?? 1, dur, notes: midis.map((m) => ({ t: 0, dur, midi: m })) });
  }

  /**
   * A percussion one-shot. `gain` is the spec's vel. No cache key: the bus's cache never evicts, and
   * the reel keeps its renders to itself and lets them go once played.
   */
  hit(kind: HitKind, t: number, gain: number, x: { midi?: number; rate?: number; echo?: number; pan?: number; prio?: 0 | 1 | 2 } = {}) {
    const v = this.variant();
    const inst: Inst = kind === 'tang' || kind === 'rim' || kind === 'big' ? 'drum' : kind === 'daluo' || kind === 'xiaoluo' ? 'gong' : kind;
    const mx = MIX[inst];
    const f = x.midi !== undefined ? hz(x.midi) : 0;
    let job: MusicJob;
    switch (kind) {
      case 'tang': case 'rim': case 'big': job = { op: 'drum', kind, seed: v }; break;
      case 'wood': job = { op: 'wood', seed: v }; break;
      case 'daluo': case 'xiaoluo': job = { op: 'gong', kind: kind === 'daluo' ? 'da' : 'xiao', seed: v }; break;
      case 'bo': job = { op: 'bo', seed: v }; break;
      case 'ling': job = { op: 'ling', freq: f, seed: v }; break;
      case 'temple': job = { op: 'temple', freq: f, seed: v }; break;
    }
    const rate = x.rate ?? 1;
    const e: ReelEvent = {
      t, inst, job, gain, pan: x.pan ?? mx.pan, send: mx.send, echo: x.echo ?? mx.echo, prio: x.prio ?? 1, dur: HIT_DUR[kind] / rate,
    };
    if (rate !== 1) e.rate = rate;
    if (x.midi !== undefined) e.notes = [{ t: 0, dur: Math.min(2, e.dur), midi: x.midi }];
    this.ev.push(e);
  }

  /** A pattern of percussion mixed into one render (one voice). */
  kit(list: { t: number; kind: KitKind; gain: number; pan?: number }[]) {
    const t0 = Math.min(...list.map((h) => h.t));
    const hits: KitHit[] = list.map((h, i) => ({ t: +(h.t - t0).toFixed(4), kind: h.kind, gain: h.gain, pan: h.pan ?? -0.1, v: 1 + (i % 3) }));
    this.ev.push({
      t: t0, inst: 'drum', job: { op: 'kit', hits }, gain: 1, pan: 0, send: MIX.drum.send, echo: 0, prio: 1,
      dur: Math.max(...list.map((h) => h.t - t0 + (h.kind === 'rim' ? 0.25 : h.kind === 'xiaoluo' ? 2.09 : 0.8))),
    });
  }

  cue(c: SfxCue) { this.sfx.push(c); }

  /** Release everything sounding at `at` that started before it (except `keep`): a cut, a breath. */
  cut(at: number, tau: number, keep: (e: ReelEvent) => boolean = () => false) {
    for (const e of this.ev) {
      if (e.t >= at - 1e-9 || e.t + e.dur <= at || keep(e)) continue;
      e.until = at;
      e.tau = tau;
      e.dur = at - e.t;
    }
  }
}

// ---------------------------------------------------------------------------------------------- motifs

/** 箫, the moon: C5 .75 · D5 .25 · F5 1.0 · G5 .5 · F5 1.5 (4 s). */
const MOON: [number, number][] = [[P.C5, 0.75], [P.D5, 0.25], [P.F5, 1], [P.G5, 0.5], [P.F5, 1.5]];
/** 二胡, 嫦娥: D5 · C5 · A4 · G4 · F4. */
const CHANGE: [number, number, Partial<LineNote>?][] = [[P.D5, 0.5], [P.C5, 0.5], [P.A4, 0.5, { slide: true }], [P.G4, 0.5], [P.F4, 1.5]];

/** The poem's column on the 古琴 from `t0`, one pluck per glyph; returns the plucks' film times. */
function column(b: Band, tones: string, t0: number, finalOpen?: { t: number; glide: number; vel: number }): number[] {
  const list: PluckIn[] = [];
  const times: number[] = [];
  pingze(tones).forEach((n, i) => {
    const t = +(t0 + i * GLYPH_STEP).toFixed(3);
    times.push(t);
    n.midi.forEach((m, j) => {
      // the open string of a resolving 平 (Q1's is the naming's F2, a breath earlier: one pluck, not a flam)
      if (j === 1 && finalOpen) list.push({ t: finalOpen.t, midi: m, vel: finalOpen.vel, ring: n.ring, glide: finalOpen.glide });
      else list.push({ t, midi: m, vel: n.vel * (j ? 0.9 : 1), ring: n.ring, vib: n.vib });
    });
  });
  b.pluck('qin', list, { spread: 0.2 });
  return times;
}

// ---------------------------------------------------------------------------------------------- 起 · 0–19

function qi(b: Band) {
  b.cue({ t: 0, kind: 'drip', pitch: 1, gain: 0.5, by: 'gate' });
  b.sheng(0.5, [P.F3, P.C4, P.F4], 6.5, 0.22, { air: 0.5 });
  b.line('xiao', 1.0, MOON, 0.45, { vib: 0.8 });
  b.hit('ling', 3.1, 0.18, { midi: P.F6 });
  [[4.5, P.A5], [5.0, P.C6], [5.5, P.D6], [6.0, P.F6], [6.5, P.D6]].forEach(([t, m], i) => b.hit('ling', t, 0.08 + 0.01 * i, { midi: m, pan: -0.45 + 0.22 * i, prio: 2 }));
  b.harm(7.0, P.C6, 0.4);
  b.sheng(7.3, [P.G3, P.D4, P.A4], 4.3, 0.3); // its attack (28 %) is the 1.2 s swell of the push
  b.hit('big', 9.0, 0.22, { echo: 0.5 });
  b.hit('big', 10.0, 0.14, { echo: 0.5 });
  b.hit('big', 11.0, 0.08, { echo: 0.5 });
  b.line('xiao', 9.5, [[P.C5, 1], [P.D5, 0.5], [P.F5, 2.5]], 0.3);
  // Q1 半亩方塘一鉴开 (14.50–15.52); the naming's F2 (glide −30 cents) at 15.5 is its open string
  column(b, PINGZE.Q1, QUOTE_AT.Q1, { t: 15.5, glide: -30, vel: 0.6 });
  b.sheng(15.5, [P.F3, P.A3, P.C4], 4.0, 0.2);
  b.hit('ling', 16.4, 0.15, { midi: P.A5 });
}

// ---------------------------------------------------------------------------------------------- 承 · 19–49.2

const BEATS: [number, number][] = [[26.5, 2], [27.5, 3], [28.5, 6], [29.5, 13], [30.5, 22], [31.5, 31], [32.5, 39]];

function tok(b: Band, t: number, streak: number) {
  b.hit('wood', t, 0.35, { rate: 1.2 });
  b.cue({ t, kind: 'chime', streak });
}

function cheng(b: Band) {
  b.sheng(19.0, [P.G3, P.D4, P.A4], 1.8, 0.24);
  // the moon wheeling in the pond: 古筝 D6 → A4, 0.15 s apart
  b.pluck('zheng', [P.D6, P.C6, P.A5, P.G5, P.F5, P.D5, P.C5, P.A4].map((m, i) => ({ t: 19.6 + i * 0.15, midi: m, vel: 0.3, ring: 1.4 })), { spread: 0.6, prio: 1 });
  // the garden enters: 古筝 quarter notes on 宫
  b.pluck('zheng', [P.F3, P.A3, P.C4, P.D4, P.F3, P.A3].map((m, i) => ({ t: 20.5 + i, midi: m, vel: 0.3, ring: 2.2 })), { spread: 0.4, prio: 1 });
  b.pluck('qin', [[21.6, P.F4], [21.9, P.G4], [22.2, P.A4]].map(([t, m]) => ({ t, midi: m, vel: 0.3, ring: 1.8 })));
  // check-in #1: the pestle's first tok, the real chime
  tok(b, 22.5, 1);
  b.line('xiao', 22.5, [[P.C5, 3.5], [P.D5, 1]], 0.26);
  // the montage (locked camera): a tok and a chime per check-in
  for (const [t, s] of BEATS) tok(b, t, s);
  const eighths = [P.F3, P.C4, P.A3, P.C4];
  const figs = [[P.F3, P.C4, P.F4, P.A4], [P.G3, P.D4, P.G4, P.A4], [P.D4 - 12, P.A3, P.D4, P.F4], [P.C4 - 12, P.G3, P.C4, P.D4]];
  const mont: PluckIn[] = eighths.map((m, i) => ({ t: 26.5 + i * 0.5, midi: m, vel: 0.28, ring: 1.6 }));
  for (let k = 0; k < 16; k++) {
    const t = 28.5 + k * 0.25;
    mont.push({ t, midi: figs[k >> 2][k & 3], vel: (0.28 + 0.08 * (k / 15)) * (k % 4 ? 0.85 : 1), ring: Math.min(1.2, 32.9 - t) });
  }
  mont.push({ t: 32.5, midi: P.F3, vel: 0.36, ring: 0.4 }, { t: 32.5, midi: P.C4, vel: 0.32, ring: 0.4 });
  b.pluck('zheng', mont.filter((n) => n.t < 28.5), { spread: 0.5, prio: 1 });
  b.pluck('zheng', mont.filter((n) => n.t >= 28.5), { spread: 0.5, prio: 1 });
  b.pluck('pipa', [{ t: 28.5, midi: P.C5, vel: 0.18, trem: 1.9 }, { t: 30.5, midi: P.C5, vel: 0.3, trem: 1.9 }], { center: 0.25, prio: 1 });
  for (const t of [26.5, 28.5, 30.5, 32.5]) b.hit('tang', t, 0.2);
  b.cut(32.9, 0.1); // everything releases (0.3 s)
  // the lapse: ONE 二胡 note sliding 角 → 商, nothing else
  b.line('erhu', 33.5, [[P.A4, 1.8, { vib: 0.6 }], [P.G4, 1.0, { slide: true, vib: 0.6 }]], 0.3);
  // the return (#40), then the fast beats
  tok(b, 36.5, 1);
  b.pluck('zheng', [P.F3, P.C4, P.F4, P.C4, P.A3, P.C4].map((m, i) => ({ t: 36.5 + i * 0.5, midi: m, vel: 0.3, ring: 1.8 })), { spread: 0.5, prio: 1 });
  b.sheng(36.5, [P.F3, P.C4], 3.2, 0.2);
  tok(b, 37.5, 11);
  tok(b, 38.5, 20);
  b.line('dizi', 37.5, [[P.C5, 0.25], [P.D5, 0.25], [P.F5, 0.25], [P.G5, 0.25], [P.A5, 0.25], [P.D5, 0.25], [P.F5, 0.25], [P.G5, 0.25], [P.A5, 0.25], [P.C6, 0.75]], 0.35);
  b.kit(Array.from({ length: 16 }, (_, i) => ({ t: 37.5 + i * 0.12, kind: 'tang' as const, gain: 0.07 + 0.2 * (i / 15) * (i % 2 ? 0.8 : 1), pan: -0.15 })));
  // #66, the bloom
  tok(b, 39.5, 27);
  [P.F6, P.D6, P.C6, P.A5, P.G5, P.F5].forEach((m, i) => b.hit('ling', +(39.5 + i * 0.08).toFixed(2), 0.13 - 0.012 * i, { midi: m, pan: 0.4 - 0.15 * i, prio: 2 }));
  b.hit('xiaoluo', 39.5, 0.25);
  b.sheng(39.5, [P.F3, P.A3, P.C4, P.D4, P.F4], 4.0, 0.32);
  // 清如许: the moon sees itself
  b.harm(40.5, P.C5, 0.35);
  b.harm(41.8, P.F5, 0.35);
  b.harm(43.1, P.A5, 0.35);
  b.line('xiao', 40.5, [[P.C5, 3.0]], 0.24);
  b.hit('ling', 43.6, 0.12, { midi: P.D6 });
  const q3a = column(b, PINGZE.Q3a, QUOTE_AT.Q3a);
  const hang = b.ev[b.ev.length - 1];
  b.cut(q3a[q3a.length - 1], 0.12, (e) => e === hang); // everything else silent 44.9–45.2: the question hangs on 羽
  column(b, PINGZE.Q3b, QUOTE_AT.Q3b);
  b.cue({ t: 45.2, kind: 'ambient', bed: 'stream' });
  b.cue({ t: 48.2, kind: 'ambient', bed: 'restore' });
  b.sheng(45.5, [P.F3, P.C4, P.F4, P.A4], 3.5, 0.25);
  b.line('xiao', 45.5, [[P.F5, 3.0]], 0.26);
}

// ---------------------------------------------------------------------------------------------- 转 · 49.2–67.1

/** 笛 in 徵 as the gaze leaves the garden: C5 D5 F5 G5 in 8ths, then A5 .6. */
function dizi49(b: Band) {
  b.line('dizi', 49.2, [[P.C5, 0.5], [P.D5, 0.5], [P.F5, 0.5], [P.G5, 0.5], [P.A5, 0.6]], 0.4);
}

function zhuan(b: Band) {
  dizi49(b);
  b.pluck('pipa', [[49.2, P.G4], [49.7, P.C5], [50.2, P.G4]].map(([t, m]) => ({ t, midi: m, vel: 0.28 })), { center: 0.3, prio: 1 });
  // Moon Lake: the mirror fight — 琵琶 battle 16ths on 羽, rim 8ths, 堂鼓 on the beats, 小锣 on the splats
  const fig = [P.D4, P.F4, P.G4, P.A4, P.C5, P.A4, P.G4, P.F4, P.D4, P.F4, P.G4, P.A4, P.D5, P.C5, P.A4, P.G4, P.A4, P.G4, P.F4, P.D4];
  b.pluck('pipa', fig.map((m, i) => {
    const t = 50.75 + i * 0.25;
    const on = Math.abs(t - Math.round(t - 0.5) - 0.5) < 1e-6;
    return { t, midi: m, vel: on ? 0.4 : 0.3 };
  }), { battle: true, center: 0.15, spread: 0.4 });
  const kit: { t: number; kind: KitKind; gain: number; pan?: number }[] = [];
  for (let i = 0; i < 10; i++) kit.push({ t: 51 + i * 0.5, kind: 'rim', gain: 0.25, pan: 0.2 });
  for (const t of [51.5, 52.5, 53.5, 54.5]) kit.push({ t, kind: 'tang', gain: 0.3, pan: -0.2 });
  b.kit(kit);
  b.sheng(51.0, [P.D4, P.A4, P.C5], 0.7, 0.25, { stab: true });
  for (const t of [51.5, 52.5, 53.5, 54.5]) b.hit('xiaoluo', t, 0.22);
  b.cut(55.6, 0.06); // all out in 0.2 s
  b.sheng(55.6, [P.D4, P.A4], 2.3, 0.14);
  // 一炷香: the knock, the 炮 that moves by itself, the smoke climbing
  b.cue({ t: 56.5, kind: 'knock' });
  b.hit('wood', 57.5, 0.3, { rate: 1.6 });
  [[57.9, P.G4], [58.3, P.A4], [58.7, P.C5], [59.1, P.D5]].forEach(([t, m], i) => b.sheng(t, [m], i === 3 ? 1.3 : 0.8, 0.2));
  b.hit('ling', 59.8, 0.1, { midi: P.D6 });
  b.hit('ling', 60.1, 0.2, { midi: P.A6 });
  b.hit('bo', 60.1, 0.2);
  const bo = b.ev[b.ev.length - 1];
  bo.until = 60.22; bo.tau = 0.02; bo.dur = 0.12; // choked by the hand
  b.cut(60.5, 0.012); // hard cut: silence
  // 月宫: the craters
  b.qin(60.6, [P.F2, P.C3], 0.3, { ring: 3.5 });
  b.line('erhu', 61.0, CHANGE, 0.35);
  for (const t of [61.5, 62.5, 64.5]) { // 63.5 is the comic rest
    b.hit('rim', t, 0.35);
    b.hit('ling', t, 0.07, { midi: P.C6, prio: 2 });
  }
  b.sheng(63.0, [P.D4, P.F4, P.A4], 3.0, 0.2);
  b.cut(67.1, 0.1); // the cut to S9: the 笙 is alone
}

/** 转′ 49.2–54.2, the short cut's window plate: no mirror fight. */
function zhuanShort(b: Band) {
  dizi49(b);
  b.pluck('pipa', [[49.2, P.G4], [49.7, P.C5], [50.2, P.G4], [50.7, P.C5]].map(([t, m]) => ({ t, midi: m, vel: 0.2 })), { center: 0.3, prio: 1 });
  b.hit('xiaoluo', 49.9, 0.1);
  b.hit('xiaoluo', 50.4, 0.1);
  b.cue({ t: 50.5, kind: 'knock' });
  b.hit('wood', 51.5, 0.3, { rate: 1.6 });
  [[52.0, P.G4], [52.53, P.A4], [53.07, P.C5]].forEach(([t, m]) => b.sheng(t, [m], 0.9, 0.2));
  b.cut(54.0, 0.08); // silence from 54.0
}

// ---------------------------------------------------------------------------------------------- 合 · 67.1–86 (short 54.2–70.8)

/** Someone touched the water: the ring below, the identical drip, the 箫 remembering two notes. */
function ripple(b: Band, t0: number) {
  b.sheng(t0, [P.F3, P.C4], 4.3, 0.12);
  b.cue({ t: +(t0 + 0.4).toFixed(2), kind: 'drip', pitch: 1, gain: 0.5 });
  b.line('xiao', +(t0 + 1.2).toFixed(2), [[P.C5, 0.75], [P.D5, 1.5]], 0.26);
}

/** The 月 seal (a 堂鼓 and a 铃). */
function seal(b: Band, t: number) {
  b.hit('tang', t, 0.3);
  b.hit('ling', t, 0.2, { midi: P.C6 });
}

/** The leap: 古筝 glissando D6 → F3 in 0.06 s steps with a 铃 trail. */
function leap(b: Band, t0: number) {
  const run = [P.D6, P.C6, P.A5, P.G5, P.F5, P.D5, P.C5, P.A4, P.G4, P.F4, P.D4, P.C4, P.A3, P.G3, P.F3];
  b.pluck('zheng', run.map((m, i) => ({ t: +(t0 + i * 0.06).toFixed(3), midi: m, vel: 0.3 * (0.75 + 0.25 * Math.sin((Math.PI * i) / 14)), ring: 1.6 })), { spread: 0.8, prio: 1 });
  [[0.1, P.D6], [0.4, P.A5], [0.7, P.F5]].forEach(([d, m], i) => b.hit('ling', +(t0 + d).toFixed(2), 0.07 - 0.015 * i, { midi: m, pan: 0.4 - 0.3 * i, prio: 2 }));
}

/** The water town: 笛 F5 G5 A5 C6 A5 G5 F5 over 古筝 F4 A4 C5, in the town's lilting 8ths. */
function waterTown(b: Band, t0: number, span: number) {
  const step = (span - 0.2) / 6;
  const tune = [P.F5, P.G5, P.A5, P.C6, P.A5, P.G5, P.F5];
  b.line('dizi', t0, tune.map((m, i) => [m, i === 6 ? 0.45 : step] as [number, number]), 0.35);
  b.pluck('zheng', tune.map((_, i) => ({ t: +(t0 + i * step).toFixed(3), midi: [P.F4, P.A4, P.C5][i % 3], vel: 0.26, ring: 1.4 })), { spread: 0.4, prio: 1 });
}

/** Over the weir: 古筝 run F4 → F5 and a 笙 swell. */
function weir(b: Band, t0: number) {
  b.pluck('zheng', [P.F4, P.G4, P.A4, P.C5, P.D5, P.F5].map((m, i) => ({ t: +(t0 + i * 0.18).toFixed(3), midi: m, vel: 0.26 + 0.03 * i, ring: 1.6 })), { spread: 0.6, prio: 1 });
  b.sheng(t0, [P.F3, P.C4, P.F4], 1.4, 0.26);
}

/** S12 半亩, from the splash (full 79.5, short 64.3): the name, the seal, today, the hand-off. */
function finale(b: Band, s: number) {
  const at = (d: number) => +(s + d).toFixed(2);
  b.cue({ t: at(0), kind: 'drip', pitch: 0.8, gain: 0.5 });
  b.hit('bo', at(0), 0.15);
  b.line('xiao', at(0.2), MOON, 0.42, { vib: 0.8 });
  b.qin(at(0.2), [P.F3, P.C4], 0.3, { ring: 3.0 });
  b.qin(at(0.7), P.G4, 0.35, { ring: 0.8 }); // 半, ze
  b.qin(at(1.1), P.D5, 0.35, { ring: 1.0 }); // 亩, ze
  // the 半亩 seal: 大鼓 + 大锣 + the final chord (the 箫's F5 is sounding from the motif)
  b.hit('big', at(2.0), 0.45);
  b.hit('daluo', at(2.0), 0.35);
  b.sheng(at(2.0), [P.F3, P.A3, P.C4, P.D4, P.F4], 4.0, 0.35, { air: 0.3 });
  b.pluck('zheng', [{ t: at(2.0), midi: P.F2, vel: 0.5, ring: 3.5 }, { t: at(2.0), midi: P.F3, vel: 0.5, ring: 3.5 }], { prio: 0 });
  // the hops into the mailbox, the puff, the colophon alone
  [[3.7, P.A5], [4.0, P.C6], [4.3, P.F6]].forEach(([d, m]) => b.hit('ling', at(d), 0.18, { midi: m }));
  b.hit('wood', at(4.5), 0.15, { rate: 1.8 });
  b.harm(at(5.3), P.F5, 0.22);
}

function he(b: Band) {
  ripple(b, 67.1);
  b.qin(71.4, P.F4, 0.3);
  b.qin(71.9, P.A4, 0.3);
  b.qin(72.4, P.C5, 0.3);
  b.line('xiao', 71.4, [[P.F5, 2]], 0.22);
  seal(b, 73.5);
  b.cut(74.1, 0.06); // the crouch: silence
  leap(b, 74.4);
  b.hit('temple', 74.9, 0.25, { midi: P.F3 });
  b.cue({ t: 75.2, kind: 'ambient', bed: 'stream' });
  b.sheng(75.6, [P.F4, P.A4, P.C5, P.D5], 1.6, 0.25);
  b.hit('ling', 75.6, 0.12, { midi: P.A6, prio: 2 });
  b.cue({ t: 76.0, kind: 'drip', pitch: 0.85, gain: 0.5 });
  b.cue({ t: 76.4, kind: 'ambient', bed: 'restore' });
  waterTown(b, 76.2, 2.2);
  for (const t of [77.5, 77.8, 78.1]) b.hit('ling', t, 0.1, { midi: [P.C6, P.D6, P.F6][Math.round((t - 77.5) / 0.3)], pan: 0.35 });
  weir(b, 78.4);
  finale(b, 79.5);
}

function heShort(b: Band) {
  ripple(b, 54.2);
  b.line('erhu', 57.2, CHANGE, 0.35);
  seal(b, 58.2);
  leap(b, 59.5);
  waterTown(b, 61.2, 2.0);
  weir(b, 63.2);
  finale(b, 64.3);
}

// ---------------------------------------------------------------------------------------------- the score

/** The acts one by one (the tests check each act's events start inside it). */
export function scoreActs(cut: Cut): { start: number; events: ReelEvent[]; sfx: SfxCue[] }[] {
  const b = new Band();
  const acts = ACTS[cut];
  const out: { start: number; events: ReelEvent[]; sfx: SfxCue[] }[] = [];
  const builders = cut === 'full' ? [qi, cheng, zhuan, he] : [qi, cheng, zhuanShort, heShort];
  builders.forEach((f, i) => {
    const e0 = b.ev.length, s0 = b.sfx.length;
    f(b);
    out.push({ start: acts[i], events: b.ev.slice(e0), sfx: b.sfx.slice(s0) });
  });
  b.cut(END[cut], 0.3);
  return out;
}

/** The whole reel for a cut: events sorted by film time, the sfx cues, the acts, the end. */
export function buildScore(cut: Cut): Score {
  const acts = scoreActs(cut);
  const events = acts.flatMap((a) => a.events).sort((x, y) => x.t - y.t);
  const sfx = acts.flatMap((a) => a.sfx).sort((x, y) => x.t - y.t);
  return { events, sfx, acts: ACTS[cut], end: END[cut] };
}

/** The skip tail's stinger (fired at the seal press): 大锣, the 笙 chord, the 古琴's open F2. */
export function tailCue(): MusicEvent[] {
  const b = new Band();
  b.hit('daluo', 0, 0.3);
  b.sheng(0, [P.F3, P.A3, P.C4, P.D4, P.F4], 2.4, 0.3);
  b.qin(0, P.F2, 0.4, { ring: 2.4 });
  b.cut(TAIL_CHOKE, 0.02);
  // music.cue plays each event at its t; a choke of TAIL_CHOKE damps what rings on
  return b.ev.map(({ until: _u, tau: _t, ...e }) => e);
}
