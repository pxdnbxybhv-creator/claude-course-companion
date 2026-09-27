// Background music, part 3 — the band. For each theme: a Style for the composer and an arranger
// that turns each composed phrase into instrument layers (render jobs with a time, level, pan and
// reverb/echo sends). Pure: no Web Audio here, so the lab and tests can inspect every note.
import { makeRng, type Rng } from '../core/rng';
import { clamp } from './dsp';
import type { LineInst, LineNote, MusicJob, PluckInst, PluckNote } from './music-dsp';
import { degreeToMidi, halfCadence, midiToFreq, modeSteps, MUSIC_GONG_PC, PENT, type MNote, type Mode, type Phrase, type Style } from './music-theory';

import type { MusicTheme } from '../views/walk/map';

export type ThemeId = MusicTheme;

export type Inst = PluckInst | LineInst | 'harm' | 'sheng' | 'drum' | 'wood' | 'gong' | 'ling' | 'temple' | 'bo';

export interface MusicEvent {
  /** Seconds from the phrase start. */
  t: number;
  inst: Inst;
  job: MusicJob;
  gain: number;
  pan: number;
  /** Reverb send. */
  send: number;
  /** Echo (valley delay) send. */
  echo: number;
  /** Playback-rate (pitch) for cached one-shots. */
  rate?: number;
  /** Identical renders share one buffer under this key. */
  key?: string;
  /** 0 melody (always plays) · 1 accompaniment · 2 decoration (first to go when voices run short). */
  prio: 0 | 1 | 2;
  /** Approximate sounding length (s). */
  dur: number;
  /** Pitched content for the lab's timeline, relative to t. */
  notes?: { t: number; dur: number; midi: number }[];
}

export interface ThemeSpec {
  style: Style;
  /** Bus level for the theme (loudness calibration, measured in the lab). */
  level: number;
  /** Reshape a phrase before it is arranged (tempo, whole bars); the Conductor reads p afterwards. */
  shape?(p: Phrase): void;
  arrange(c: Ctx): MusicEvent[];
}

export interface Ctx {
  p: Phrase;
  r: Rng;
  /** Seconds per beat. */
  spb: number;
  /** Seed for render jobs. */
  seed: number;
}

// ---------------------------------------------------------------------------
// Rhythm cells

const SLOW = [[2], [1, 1], [1.5, 0.5], [3, 1], [1, 0.5, 0.5], [0.5, 0.5, 1], [1, 1, 2]];
const MED = [[1], [0.5, 0.5], [1.5, 0.5], [1, 1], [0.5, 0.5, 1], [2], [1, 0.5, 0.5]];
const LIVELY = [[0.5, 0.5], [1], [0.75, 0.25], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25], [1.5, 0.5], [0.5, 1, 0.5]];
const FLOW = [[1], [0.5, 0.5], [1.5, 0.5], [2], [0.5, 0.5, 1], [1, 1]];

/**
 * A mode by its final and a rough tonic, moved (by at most a tritone) onto the music's 宫 F so that
 * every theme shares the key of the sound effects: a chime never lands a semitone off the tune.
 */
const M = (tonic: number, final: number): Mode => {
  const gong = (((tonic - PENT[final]) % 12) + 12) % 12;
  let d = MUSIC_GONG_PC - gong;
  if (d > 6) d -= 12;
  if (d < -5) d += 12;
  return { tonic: tonic + d, final };
};

// ---------------------------------------------------------------------------
// helpers

const midiOf = (c: Ctx, d: number, oct = 0) => degreeToMidi(c.p.mode, d) + 12 * oct;
const hz = midiToFreq;
const secOf = (c: Ctx, beat: number) => beat * c.spb;
const phraseSec = (c: Ctx) => c.p.beats * c.spb;
const panOf = (midi: number, spread: number, center = 0) => clamp(center + ((midi - 64) / 24) * spread, -0.85, 0.85);
const inMode = (mode: Mode, midi: number) => modeSteps(mode.final).includes((((midi - mode.tonic) % 12) + 12) % 12);
const nextSeed = (c: Ctx) => (c.seed ^ c.r.int(0, 0x7fffffff)) >>> 0;

interface LineOpts { gain: number; pan: number; send: number; echo?: number; grace?: number; slide?: number; vib?: number; prio?: 0 | 1 | 2 }

/** A melodic line for a wind or bowed instrument (one render for the whole phrase). */
function line(c: Ctx, inst: LineInst, notes: MNote[], oct: number, o: LineOpts): MusicEvent | null {
  if (!notes.length) return null;
  const r = c.r;
  const t0 = secOf(c, notes[0].beat);
  const ln: LineNote[] = notes.map((n, i) => {
    const prev = notes[i - 1];
    const m = midiOf(c, n.deg, oct);
    const step = prev ? Math.abs(n.deg - prev.deg) : 0;
    const x: LineNote = { t: secOf(c, n.beat) - t0, dur: secOf(c, n.dur), freq: hz(m), vel: n.vel };
    if ((n.leap || n.cad) && r.chance(o.grace ?? 0.4) && x.dur > 0.25) x.grace = hz(midiOf(c, n.deg + 1, oct));
    else if (prev && step >= 1 && r.chance((o.slide ?? 0.2) * (step >= 2 ? 1.5 : 1))) x.slide = true;
    x.vib = n.dur * c.spb < 0.45 ? 0.2 : (o.vib ?? 1) * (n.cad ? 1.2 : 1);
    return x;
  });
  return {
    t: t0, inst, job: { op: 'line', inst, notes: ln, seed: nextSeed(c) },
    gain: o.gain, pan: o.pan, send: o.send, echo: o.echo ?? 0, prio: o.prio ?? 0,
    dur: ln[ln.length - 1].t + ln[ln.length - 1].dur + 0.3,
    notes: ln.map((n) => ({ t: n.t, dur: n.dur, midi: 69 + 12 * Math.log2(n.freq / 440) })),
  };
}

interface PluckOpts {
  gain: number; send: number; echo?: number; spread?: number; center?: number; prio?: 0 | 1 | 2;
  /** Chance of an ornament on long notes: 按音 bend / 綽注 glide / vibrato. */
  bend?: number; glide?: number; vib?: number;
  /** Pipa: tremolo on notes at least this many seconds long. */
  trem?: number;
  /** Qin: play as harmonics. */
  harm?: boolean;
  humanize?: number;
}

/** A plucked layer, split into render chunks of a few seconds. */
function plucks(c: Ctx, inst: PluckInst, raw: { beat: number; dur: number; midi: number; vel: number; cad?: boolean }[], o: PluckOpts): MusicEvent[] {
  if (!raw.length) return [];
  const r = c.r;
  const notes = raw.map((n) => {
    const d = secOf(c, n.dur);
    const x: PluckNote & { dur: number; midi: number } = {
      t: Math.max(0, secOf(c, n.beat) + (o.humanize ?? 0.008) * (r() * 2 - 1)), freq: hz(n.midi), vel: n.vel,
      pan: panOf(n.midi, o.spread ?? 0.35, o.center ?? 0), dur: d, midi: n.midi,
    };
    if (o.harm) { x.harm = true; return x; }
    if (o.trem && d >= o.trem) { x.trem = d - 0.06; return x; }
    if (d > 0.5 && r.chance(o.vib ?? 0)) x.vib = true;
    if (d > 0.45 && r.chance(o.bend ?? 0)) {
      // 回滑音: press the string up a step and let it back; on a cadence, 下滑 fall at the end
      const up = inst === 'qin' ? r.pick([150, 200, 300]) : r.pick([200, 200, 300]);
      x.bend = n.cad ? [{ at: Math.min(d * 0.6, 1.2), cents: -r.pick([100, 200]), time: 0.25 }]
        : [{ at: r.range(0.12, 0.25), cents: up, time: 0.14 }, { at: r.range(0.42, 0.6), cents: 0, time: 0.16 }];
    } else if (r.chance(o.glide ?? 0)) x.glide = r.pick([-1, 1]) * r.range(60, 140);
    return x;
  });
  // chunk by time so no render is huge and the first sound is ready fast
  const out: MusicEvent[] = [];
  let i = 0;
  while (i < notes.length) {
    const t0 = notes[i].t;
    const group: typeof notes = [];
    while (i < notes.length && notes[i].t - t0 < 6) group.push(notes[i++]);
    out.push({
      t: t0, inst: o.harm ? 'harm' : inst,
      job: { op: 'pluck', inst, notes: group.map(({ dur: _d, midi: _m, ...n }) => ({ ...n, t: n.t - t0 })), seed: nextSeed(c) },
      gain: o.gain, pan: 0, send: o.send, echo: o.echo ?? 0, prio: o.prio ?? 0,
      dur: group[group.length - 1].t - t0 + 2.5,
      notes: group.map((n) => ({ t: n.t - t0, dur: Math.max(0.15, n.dur), midi: n.midi })),
    });
  }
  return out;
}

const mel = (c: Ctx, oct = 0, notes = c.p.notes) => notes.map((n) => ({ beat: n.beat, dur: n.dur, midi: midiOf(c, n.deg, oct), vel: n.vel, cad: n.cad }));

/** 笙 chord on a degree: root, a fifth (or fourth, whichever the mode has) and the octave. */
function pad(c: Ctx, rootDeg: number, oct: number, o: { gain: number; send: number; vel?: number; air?: number; overlap?: number; start?: number; dur?: number; octave?: boolean; echo?: number }): MusicEvent {
  const root = midiOf(c, rootDeg, oct);
  const fifth = inMode(c.p.mode, root + 7) ? root + 7 : root + 5;
  const tones = o.octave === false ? [root, fifth] : [root, fifth, root + 12];
  const start = o.start ?? 0;
  const dur = o.dur ?? phraseSec(c) - start + (o.overlap ?? 2.5);
  return {
    t: start, inst: 'sheng', job: { op: 'sheng', freqs: tones.map(hz), dur, vel: o.vel ?? 0.7, seed: nextSeed(c), air: o.air ?? 0 },
    gain: o.gain, pan: 0, send: o.send, echo: o.echo ?? 0, prio: 1, dur,
    notes: tones.map((m) => ({ t: 0, dur, midi: m })),
  };
}

type HitKind = 'tang' | 'rim' | 'big' | 'wood' | 'bang' | 'daluo' | 'xiaoluo' | 'bo' | 'ling' | 'temple';

/** A cached one-shot. */
function hit(c: Ctx, kind: HitKind, t: number, gain: number, o: { pan?: number; send?: number; echo?: number; freq?: number; prio?: 0 | 1 | 2 } = {}): MusicEvent {
  const v = c.r.int(1, 3); // three cached variants of each
  const base = { t, gain, pan: o.pan ?? 0, send: o.send ?? 0.15, echo: o.echo ?? 0, prio: o.prio ?? 2 } as const;
  switch (kind) {
    case 'tang': case 'rim': case 'big':
      return { ...base, inst: 'drum', job: { op: 'drum', kind, seed: v }, key: `drum:${kind}:${v}`, dur: kind === 'big' ? 1.2 : 0.6, rate: 1 + (c.r() - 0.5) * 0.03 };
    case 'wood': case 'bang':
      return { ...base, inst: 'wood', job: { op: 'wood', seed: v }, key: `wood:${v}`, dur: 0.3, rate: (kind === 'bang' ? 1.85 : 1) * (1 + (c.r() - 0.5) * 0.03) };
    case 'daluo': case 'xiaoluo':
      return { ...base, inst: 'gong', job: { op: 'gong', kind: kind === 'daluo' ? 'da' : 'xiao', seed: v }, key: `gong:${kind}:${v}`, dur: kind === 'daluo' ? 5 : 1.6 };
    case 'bo':
      return { ...base, inst: 'bo', job: { op: 'bo', seed: v }, key: `bo:${v}`, dur: 1.2 };
    case 'ling': {
      const f = o.freq ?? 2400;
      return { ...base, inst: 'ling', job: { op: 'ling', freq: f, seed: v }, key: `ling:${Math.round(f)}:${v}`, dur: 3 };
    }
    case 'temple': {
      const f = o.freq ?? 98;
      return { ...base, inst: 'temple', job: { op: 'temple', freq: f, seed: v }, key: `temple:${Math.round(f)}:${v}`, dur: 9, prio: 1 };
    }
  }
}

/** A repeating percussion pattern (beat offsets within a bar) across the phrase. */
function pattern(c: Ctx, kind: HitKind, bar: number, beats: [number, number][], o: { gain: number; from?: number; to?: number; pan?: number; send?: number; swing?: number; drop?: number }): MusicEvent[] {
  const out: MusicEvent[] = [];
  const from = o.from ?? 0, to = o.to ?? c.p.end;
  for (let b0 = Math.floor(from / bar) * bar; b0 < to; b0 += bar) {
    for (const [off, v] of beats) {
      const b = b0 + off;
      if (b < from || b >= to) continue;
      if (o.drop && c.r.chance(o.drop)) continue;
      const sw = o.swing && Math.abs(off % 1 - 0.5) < 1e-6 ? o.swing : 0;
      out.push(hit(c, kind, secOf(c, b + sw) + (c.r() - 0.5) * 0.01, o.gain * v * (0.9 + c.r() * 0.2), { pan: o.pan, send: o.send }));
    }
  }
  return out;
}

/** The chord root under a melody note: the final, its fifth-degree, or the second — whichever is nearest below. */
function rootUnder(p: Phrase, deg: number): number {
  const cands = [0, halfCadence(p.mode.final), 1, 4];
  let best = 0, bd = Infinity;
  for (const r of cands) {
    for (let o = -3; o <= 2; o++) {
      const d = r + 5 * o;
      const dist = deg - d;
      if (dist >= 0 && dist < bd) { bd = dist; best = r; }
    }
  }
  return best;
}

/** 古筝 flowing arpeggios under the melody: rising and falling figures, root changes every `every` beats. */
function arpeggio(c: Ctx, oct: number, o: { gain: number; send: number; every: number; sub: number; vel?: number; echo?: number; spread?: number; to?: number }): MusicEvent[] {
  const p = c.p, r = c.r;
  const figs = [[0, 3, 5, 6, 7, 6, 5, 3], [0, 2, 3, 5, 6, 5, 3, 2], [0, 3, 5, 3, 6, 5, 3, 2], [0, 3, 2, 5, 3, 6, 5, 3]];
  const raw: { beat: number; dur: number; midi: number; vel: number }[] = [];
  const to = o.to ?? p.beats;
  for (let b = 0; b < to - 1e-6; b += o.every) {
    const under = p.notes.filter((n) => n.beat <= b + 1e-6).pop() ?? p.notes[0];
    const root = rootUnder(p, under ? under.deg : 0);
    const fig = r.pick(figs);
    const n = Math.round(o.every / o.sub);
    for (let k = 0; k < n; k++) {
      const beat = b + k * o.sub;
      if (beat >= to) break;
      const d = root + fig[k % fig.length];
      const accent = k === 0 ? 1 : k % 2 ? 0.72 : 0.85;
      raw.push({ beat, dur: o.sub, midi: midiOf(c, d, oct), vel: (o.vel ?? 0.5) * accent * r.range(0.9, 1.05) });
    }
  }
  return plucks(c, 'zheng', raw, { gain: o.gain, send: o.send, echo: o.echo, spread: o.spread ?? 0.6, prio: 1, humanize: 0.006 });
}

/** 刮奏: a quick pentatonic run across the strings. */
function gliss(c: Ctx, beat: number, fromDeg: number, toDeg: number, secs: number, oct: number, o: { gain: number; send: number; vel?: number; echo?: number }): MusicEvent[] {
  const n = Math.abs(toDeg - fromDeg) + 1;
  const dir = Math.sign(toDeg - fromDeg) || 1;
  const raw = Array.from({ length: n }, (_, i) => ({
    beat: beat + (i * secs) / (n - 1 || 1) / c.spb, dur: 0.25, midi: midiOf(c, fromDeg + dir * i, oct),
    vel: (o.vel ?? 0.45) * (0.7 + 0.3 * Math.sin((Math.PI * i) / (n - 1 || 1))),
  }));
  return plucks(c, 'zheng', raw, { gain: o.gain, send: o.send, echo: o.echo, spread: 0.8, prio: 2, humanize: 0.003 });
}

const notNull = <T>(x: T | null | undefined): x is T => x != null;

/** Notes of the melody on strong beats only (for a heterophonic second voice, 支声). */
const strongOnly = (notes: MNote[]) => notes.filter((n) => Math.abs(n.beat - Math.round(n.beat)) < 1e-6 || n.cad);

// ---------------------------------------------------------------------------
// The themes

const garden: ThemeSpec = {
  level: 0.9,
  style: {
    bpm: [50, 58], modes: [M(53, 0), M(60, 3), M(62, 4), M(55, 1)], range: [-2, 7],
    cells: SLOW, motifBeats: 4, statements: [1, 2], restChance: 0.12, breath: [1.5, 3], periodRest: [2, 4],
    cadenceBeats: 2.5, leap: 0.5, modulate: 0.3,
  },
  // guqin alone, a distant xiao answering now and then
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const qin = (notes = p.notes, oct = 0, gain = 0.8) =>
      plucks(c, 'qin', mel(c, oct, notes), { gain, send: 0.35, bend: 0.25, glide: 0.25, vib: 0.6, spread: 0.2 });
    if (p.role === 'cheng' && r.chance(0.7)) {
      // distant: soft, off to one side, mostly reverb
      const x = line(c, 'xiao', p.notes, 1, { gain: 0.42, pan: 0.3, send: 0.6, grace: 0.45, slide: 0.2 });
      if (x) ev.push(x);
      // the qin keeps time with low open-string notes (散音)
      const bass = p.notes.filter((n, i) => i === 0 || n.cad).map((n) => ({ ...n, deg: rootUnder(p, n.deg) - 5, vel: 0.5 }));
      ev.push(...qin(bass, 0, 0.7));
    } else {
      ev.push(...qin());
      if (p.role === 'he') {
        const last = p.notes[p.notes.length - 1];
        // 撮: an octave below with the cadence, then a harmonic blooming above it
        ev.push(...plucks(c, 'qin', [{ beat: last.beat + 0.02, dur: last.dur, midi: midiOf(c, last.deg - 5), vel: 0.45 }], { gain: 0.6, send: 0.35 }));
        if (r.chance(0.6)) ev.push(...plucks(c, 'qin', [{ beat: last.beat + last.dur * 0.6, dur: 2, midi: midiOf(c, 0, 2), vel: 0.5 }], { gain: 0.5, send: 0.5, harm: true, prio: 2 }));
      }
    }
    return ev;
  },
};

const village: ThemeSpec = {
  level: 0.8,
  style: {
    bpm: [84, 96], modes: [M(62, 3), M(55, 0), M(57, 1), M(64, 4)], range: [-2, 7],
    cells: LIVELY, motifBeats: 4, statements: [2, 2], restChance: 0.05, breath: [0.5, 1.5], periodRest: [1, 2],
    cadenceBeats: 2, leap: 0.4, modulate: 0.35,
  },
  // erhu sings, pipa answers with tremolo, a clapper (梆子) keeps the market busy
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const erhu = (gain: number) => line(c, 'erhu', p.notes, 0, { gain, pan: -0.18, send: 0.22, grace: 0.25, slide: 0.35 });
    const pipaMel = (notes: MNote[], oct: number, gain: number) => plucks(c, 'pipa', mel(c, oct, notes), { gain, send: 0.2, trem: 0.55, spread: 0.3, center: 0.2 });
    if (p.role === 'zhuan') {
      ev.push(...pipaMel(p.notes, 0, 0.8));
      ev.push(...pattern(c, 'tang', 4, [[0, 1], [2, 0.6]], { gain: 0.32, pan: -0.2, send: 0.12 }));
    } else {
      ev.push(...[erhu(0.85)].filter(notNull));
      if (p.role === 'he') ev.push(...pipaMel(strongOnly(p.notes), -1, 0.55)); // 支声 heterophony
      else {
        // pipa accompaniment: bass on 1, fifth-dyad on the off-beats
        const acc: { beat: number; dur: number; midi: number; vel: number }[] = [];
        for (let b = 0; b < p.end; b += 2) {
          const under = p.notes.filter((n) => n.beat <= b + 1e-6).pop() ?? p.notes[0];
          const root = rootUnder(p, under.deg);
          acc.push({ beat: b, dur: 1, midi: midiOf(c, root, -1), vel: 0.55 });
          acc.push({ beat: b + 1, dur: 0.5, midi: midiOf(c, root + 3, -1), vel: 0.4 });
          if (r.chance(0.5)) acc.push({ beat: b + 1.5, dur: 0.5, midi: midiOf(c, root + 5, -1), vel: 0.36 });
        }
        ev.push(...plucks(c, 'pipa', acc, { gain: 0.5, send: 0.15, spread: 0.2, center: 0.35, prio: 1 }));
      }
    }
    ev.push(...pattern(c, 'bang', 2, [[0, 1], [1, 0.7], [1.5, 0.55]], { gain: 0.16, pan: 0.45, send: 0.1, drop: 0.12 }));
    if (p.role === 'he') {
      const last = p.notes[p.notes.length - 1];
      ev.push(hit(c, 'tang', secOf(c, last.beat), 0.4, { pan: -0.2 }), hit(c, 'rim', secOf(c, last.beat - 0.5), 0.2, { pan: -0.2 }));
    }
    return ev;
  },
};

const lake: ThemeSpec = {
  level: 0.85,
  style: {
    bpm: [66, 76], modes: [M(62, 0), M(59, 4), M(57, 3), M(64, 1)], range: [1, 8],
    cells: FLOW, motifBeats: 4, statements: [2, 2], restChance: 0.08, breath: [1, 2], periodRest: [1, 2],
    cadenceBeats: 3, leap: 0.4, modulate: 0.3,
  },
  // 古筝 arpeggios like moving water, a 箫 melody over them; the zheng sings the 转
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    if (p.role === 'zhuan') {
      ev.push(...plucks(c, 'zheng', mel(c, 0), { gain: 0.8, send: 0.3, bend: 0.45, vib: 0.5, spread: 0.4 }));
      ev.push(...arpeggio(c, -1, { gain: 0.42, send: 0.3, every: 2, sub: 0.5, vel: 0.4 }));
    } else {
      ev.push(...[line(c, 'xiao', p.notes, 0, { gain: 0.62, pan: -0.12, send: 0.45, grace: 0.45, slide: 0.25 })].filter(notNull));
      ev.push(...arpeggio(c, -1, { gain: 0.5, send: 0.3, every: 2, sub: 0.5, vel: 0.46 }));
    }
    // 刮奏 glissandi: opening each period, and sweeping into the 合
    if (p.role === 'qi') ev.push(...gliss(c, 0, -3, 7, 0.9, 0, { gain: 0.35, send: 0.4 }));
    if (p.role === 'zhuan' && r.chance(0.7)) ev.push(...gliss(c, p.end + 0.2, 8, -2, 0.8, 0, { gain: 0.3, send: 0.4 }));
    return ev;
  },
};

const bamboo: ThemeSpec = {
  level: 0.85,
  style: {
    bpm: [60, 70], modes: [M(67, 3), M(69, 1), M(64, 4), M(62, 0)], range: [-1, 8],
    cells: MED, motifBeats: 4, statements: [1, 2], restChance: 0.1, breath: [1.5, 3], periodRest: [2, 3],
    cadenceBeats: 3, leap: 0.6, modulate: 0.3,
  },
  // 笛 and 箫 trade phrases over a wind-like 笙; the stalks knock in the breeze
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const dizi = p.role === 'qi' || p.role === 'zhuan';
    ev.push(...[dizi
      ? line(c, 'dizi', p.notes, 0, { gain: 0.5, pan: 0.15, send: 0.45, grace: 0.6, slide: 0.2, echo: 0.12 })
      : line(c, 'xiao', p.notes, -1, { gain: 0.66, pan: -0.2, send: 0.5, grace: 0.4, slide: 0.3 })].filter(notNull));
    const root = p.role === 'zhuan' ? halfCadence(p.mode.final) : 0;
    ev.push(pad(c, root, -1, { gain: 0.32, send: 0.5, vel: 0.6, air: 1, overlap: 3 }));
    if (r.chance(0.55)) {
      let t = r.range(0.3, 0.8) * phraseSec(c);
      for (let k = r.int(1, 3); k > 0; k--) {
        ev.push(hit(c, 'wood', t, 0.07 + r() * 0.05, { pan: r.range(-0.7, 0.7), send: 0.5 }));
        ev[ev.length - 1].rate = r.range(1.35, 1.7);
        t += r.range(0.12, 0.35);
      }
    }
    return ev;
  },
};

const plum: ThemeSpec = {
  level: 0.85,
  style: {
    bpm: [48, 56], modes: [M(64, 4), M(57, 4), M(62, 1), M(64, 2)], range: [0, 8],
    cells: SLOW, motifBeats: 4, statements: [1, 2], restChance: 0.12, breath: [2, 3.5], periodRest: [2, 4],
    cadenceBeats: 3, leap: 0.6, modulate: 0.25,
  },
  // cold and clear: a 箫 on the snow, 泛音 like ice on the branches, a small bell
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    if (p.role === 'zhuan') {
      ev.push(...plucks(c, 'qin', mel(c, 1), { gain: 0.7, send: 0.55, harm: true, echo: 0.2, spread: 0.5 }));
    } else {
      ev.push(...[line(c, 'xiao', p.notes, 0, { gain: 0.66, pan: -0.1, send: 0.5, grace: 0.5, slide: 0.25, echo: 0.15 })].filter(notNull));
      const marks = p.notes.filter((n, i) => i === 0 || n.cad);
      ev.push(...plucks(c, 'qin', marks.map((n) => ({ beat: n.beat + 0.5, dur: 2, midi: midiOf(c, n.deg, 1) + (midiOf(c, n.deg, 1) < 72 ? 12 : 0), vel: 0.45 })), { gain: 0.55, send: 0.6, harm: true, echo: 0.2, spread: 0.6, prio: 1 }));
    }
    if (p.role === 'qi' && r.chance(0.7)) ev.push(hit(c, 'ling', secOf(c, 0), 0.14, { freq: hz(midiOf(c, 0, 3)), pan: 0.35, send: 0.6, echo: 0.3 }));
    if (p.role === 'he') {
      const last = p.notes[p.notes.length - 1];
      ev.push(...plucks(c, 'qin', [{ beat: last.beat, dur: last.dur, midi: midiOf(c, 0, -1), vel: 0.45 }], { gain: 0.55, send: 0.4, prio: 1 }));
    }
    return ev;
  },
};

const mountain: ThemeSpec = {
  level: 1.05,
  style: {
    bpm: [42, 50], modes: [M(50, 0), M(48, 4), M(45, 3), M(52, 1)], range: [-2, 6],
    cells: SLOW, motifBeats: 4, statements: [1, 2], restChance: 0.15, breath: [2, 3.5], periodRest: [3, 5],
    cadenceBeats: 3, leap: 0.35, modulate: 0.2,
  },
  // the temple: a great bell, low qin, the 木鱼's slow chant, a soft gong where phrases close
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    if (p.role === 'zhuan') ev.push(...plucks(c, 'qin', mel(c, 2), { gain: 0.6, send: 0.55, harm: true, echo: 0.3 }));
    else ev.push(...plucks(c, 'qin', mel(c, 0), { gain: 0.85, send: 0.4, bend: 0.3, glide: 0.2, vib: 0.7, echo: 0.12, spread: 0.2 }));
    ev.push(pad(c, 0, -1, { gain: 0.2, send: 0.5, vel: 0.5, octave: false, overlap: 3 }));
    if (p.role === 'qi' || p.index === 0) ev.push(hit(c, 'temple', 0, 0.3, { freq: hz(midiOf(c, 0, -1)), send: 0.5, echo: 0.25, pan: -0.15 }));
    if (p.role === 'cheng' || p.role === 'zhuan') {
      ev.push(...pattern(c, 'wood', 1, [[0, 1]], { gain: 0.12, pan: 0.25, send: 0.35, to: p.end }));
    }
    const last = p.notes[p.notes.length - 1];
    if (p.role === 'he' || (p.role === 'zhuan' && r.chance(0.5))) {
      ev.push(hit(c, 'daluo', secOf(c, last.beat), p.role === 'he' ? 0.2 : 0.13, { send: 0.45, echo: 0.3, pan: 0.2, prio: 1 }));
    }
    if (p.role === 'cheng' && r.chance(0.6)) ev.push(hit(c, 'ling', secOf(c, last.beat + 0.5), 0.1, { freq: hz(midiOf(c, 0, 4)), send: 0.6, echo: 0.35, pan: -0.4 }));
    return ev;
  },
};

const night: ThemeSpec = {
  level: 0.8,
  style: {
    bpm: [40, 46], modes: [M(62, 4), M(65, 0), M(60, 3)], range: [1, 8],
    cells: SLOW, motifBeats: 4, statements: [1, 1], restChance: 0.3, breath: [3, 5], periodRest: [3, 6],
    cadenceBeats: 3, leap: 0.4, modulate: 0.2,
  },
  // almost nothing: 泛音 under the moon, a breath of 笙
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    ev.push(...plucks(c, 'qin', mel(c, 1), { gain: 0.6, send: 0.6, harm: true, echo: 0.15, spread: 0.5 }));
    if (p.role === 'qi' || p.role === 'he') ev.push(pad(c, 0, -1, { gain: 0.18, send: 0.6, vel: 0.45, octave: false, overlap: 4 }));
    if (p.role === 'he' && r.chance(0.6)) {
      const last = p.notes[p.notes.length - 1];
      ev.push(...plucks(c, 'qin', [{ beat: last.beat, dur: 3, midi: midiOf(c, 0, -2), vel: 0.4 }], { gain: 0.5, send: 0.45, prio: 1 }));
    }
    return ev;
  },
};

const festival: ThemeSpec = {
  level: 0.85,
  style: {
    bpm: [104, 116], modes: [M(67, 3), M(62, 0), M(69, 1), M(64, 3)], range: [0, 7],
    cells: LIVELY, motifBeats: 4, statements: [2, 2], restChance: 0.04, breath: [0.5, 1], periodRest: [1, 2],
    cadenceBeats: 2, leap: 0.5, modulate: 0.35,
  },
  // 锣鼓 and a gentle 唢呐; the pipa rolls its tremolo in the 转; 笙 chords brighten the cadences
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const suona = (gain: number) => line(c, 'suona', p.notes, 0, { gain, pan: 0.05, send: 0.25, grace: 0.55, slide: 0.35 });
    if (p.role === 'zhuan') {
      ev.push(...plucks(c, 'pipa', mel(c, 0), { gain: 0.75, send: 0.2, trem: 0.4, spread: 0.3, center: -0.15 }));
      ev.push(...pattern(c, 'rim', 2, [[0, 1], [0.5, 0.6], [1, 0.8], [1.5, 0.6]], { gain: 0.14, pan: -0.3, send: 0.1 }));
      ev.push(pad(c, halfCadence(p.mode.final), 0, { gain: 0.22, send: 0.3, vel: 0.6, start: secOf(c, p.end - 2), dur: secOf(c, 2) + 1.5 }));
    } else {
      ev.push(...[suona(0.6)].filter(notNull));
      if (p.role === 'he') ev.push(...plucks(c, 'pipa', mel(c, -1, strongOnly(p.notes)), { gain: 0.5, send: 0.2, trem: 0.5, spread: 0.2, center: -0.2, prio: 1 }));
      ev.push(...pattern(c, 'tang', 4, [[0, 1], [1, 0.55], [1.5, 0.45], [2, 0.85], [3, 0.55], [3.5, 0.6]], { gain: 0.34, pan: -0.25, send: 0.12, drop: 0.08 }));
      ev.push(...pattern(c, 'xiaoluo', 2, [[1, 1]], { gain: 0.1, pan: 0.35, send: 0.15, drop: 0.15 }));
    }
    ev.push(...pattern(c, 'bang', 1, [[0, 1], [0.5, 0.5]], { gain: 0.08, pan: 0.5, send: 0.08, drop: 0.2 }));
    // 开场: gong, cymbals and big drum open every period; the 合 closes on them too
    if (p.role === 'qi') ev.push(hit(c, 'daluo', 0, 0.22, { send: 0.3, pan: 0.1, prio: 1 }), hit(c, 'bo', 0, 0.12, { pan: 0.3 }), hit(c, 'big', 0, 0.4, { pan: -0.2 }));
    if (p.role === 'he') {
      const last = p.notes[p.notes.length - 1];
      ev.push(hit(c, 'daluo', secOf(c, last.beat), 0.2, { send: 0.3, pan: 0.1, prio: 1 }), hit(c, 'bo', secOf(c, last.beat), 0.1, { pan: 0.3 }));
      ev.push(pad(c, 0, 0, { gain: 0.2, send: 0.3, vel: 0.6, start: secOf(c, last.beat), dur: secOf(c, last.dur) + 1.8 }));
    }
    if (r.chance(0.3)) ev.push(hit(c, 'ling', secOf(c, 2), 0.08, { freq: 2600, pan: 0.5 }));
    return ev;
  },
};

const hall: ThemeSpec = {
  level: 0.7,
  style: {
    bpm: [92, 104], modes: [M(60, 0), M(67, 3), M(62, 1), M(64, 4)], range: [0, 7],
    cells: LIVELY, motifBeats: 4, statements: [2, 2], restChance: 0.12, breath: [1, 2], periodRest: [2, 3],
    cadenceBeats: 2, leap: 0.6, modulate: 0.35,
  },
  // the games hall: a playful 古筝 with a light 梆子 — present, never in the way
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const oct = p.role === 'zhuan' ? 1 : 0;
    ev.push(...plucks(c, 'zheng', mel(c, oct), { gain: 0.72, send: 0.22, bend: 0.3, glide: 0.1, vib: 0.3, spread: 0.45 }));
    // light bass: root on 1, a fifth on 3 (zheng's low strings)
    const bass: { beat: number; dur: number; midi: number; vel: number }[] = [];
    for (let b = 0; b < p.end; b += 2) {
      const under = p.notes.filter((n) => n.beat <= b + 1e-6).pop() ?? p.notes[0];
      const root = rootUnder(p, under.deg);
      bass.push({ beat: b, dur: 1, midi: midiOf(c, root, -1), vel: 0.42 });
      if (r.chance(0.7)) bass.push({ beat: b + 1, dur: 1, midi: midiOf(c, root + 3, -1), vel: 0.3 });
    }
    ev.push(...plucks(c, 'zheng', bass, { gain: 0.45, send: 0.2, spread: 0.5, center: -0.1, prio: 1 }));
    const pat: [number, number][] = p.role === 'zhuan' ? [[0, 1], [1.5, 0.6]] : [[0, 1], [0.75, 0.55], [1.5, 0.7], [2, 0.9], [3, 0.6], [3.5, 0.5]];
    ev.push(...pattern(c, 'bang', 4, pat, { gain: 0.1, pan: 0.4, send: 0.1, drop: 0.1 }));
    if (p.role === 'he') {
      const last = p.notes[p.notes.length - 1];
      ev.push(hit(c, 'ling', secOf(c, last.beat), 0.09, { freq: hz(midiOf(c, 0, 3)), pan: -0.3, send: 0.4 }));
    }
    return ev;
  },
};

const quiet: ThemeSpec = {
  level: 0.6,
  style: {
    bpm: [40, 40], modes: [M(62, 0), M(57, 3)], range: [0, 5],
    cells: [[4], [2, 2]], motifBeats: 4, statements: [1, 1], restChance: 0.5, breath: [4, 6], periodRest: [4, 6],
    cadenceBeats: 4, leap: 0.2, modulate: 0.2,
  },
  // barely there: a slow-breathing 笙 chord, and once in a while one harmonic
  arrange(c) {
    const { p, r } = c;
    const roots = { qi: 0, cheng: 3, zhuan: 1, he: 0 } as const;
    const ev: MusicEvent[] = [pad(c, roots[p.role], -1, { gain: 0.22, send: 0.6, vel: 0.5, octave: p.role !== 'zhuan', overlap: 4, air: 0.3 })];
    if (p.role === 'he' && r.chance(0.45)) {
      const last = p.notes[p.notes.length - 1];
      ev.push(...plucks(c, 'qin', [{ beat: last.beat, dur: 3, midi: midiOf(c, last.deg, 2), vel: 0.35 }], { gain: 0.35, send: 0.7, harm: true, prio: 1 }));
    }
    return ev;
  },
};

const taoyuan: ThemeSpec = {
  level: 0.85,
  style: {
    bpm: [60, 68], modes: [M(67, 3), M(60, 3), M(62, 3), M(65, 3)], range: [0, 8],
    cells: FLOW, motifBeats: 4, statements: [1, 2], restChance: 0.08, breath: [1, 2.5], periodRest: [1.5, 3],
    cadenceBeats: 3, leap: 0.45, modulate: 0.25,
  },
  // 桃源: a bright 徵 tune on the 笛 over flowing 古筝 arpeggios and a 笙 pad, every voice sent into the
  // valley's echo; the zheng takes the 转; a little bell rings off the cliffs now and then
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    if (p.role === 'zhuan') {
      ev.push(...plucks(c, 'zheng', mel(c, 0), { gain: 0.72, send: 0.35, bend: 0.4, vib: 0.4, spread: 0.45, echo: 0.2 }));
    } else {
      ev.push(...[line(c, 'dizi', p.notes, 0, { gain: 0.5, pan: 0.12, send: 0.42, grace: 0.6, slide: 0.2, echo: 0.28 })].filter(notNull));
    }
    ev.push(...arpeggio(c, -1, { gain: 0.38, send: 0.32, every: 2, sub: 0.5, vel: 0.42, echo: 0.15 }));
    const root = p.role === 'zhuan' ? halfCadence(p.mode.final) : 0;
    ev.push(pad(c, root, -1, { gain: 0.22, send: 0.5, vel: 0.55, air: 0.6, overlap: 3, echo: 0.2 }));
    if (p.role === 'qi' && r.chance(0.5)) ev.push(...gliss(c, 0, -3, 7, 0.9, 0, { gain: 0.26, send: 0.4, echo: 0.2 }));
    if ((p.role === 'cheng' || p.role === 'he') && r.chance(0.35)) {
      const last = p.notes[p.notes.length - 1];
      ev.push(hit(c, 'ling', secOf(c, last.beat + 0.5), 0.1, { freq: hz(midiOf(c, 0, 3)), pan: -0.35, send: 0.6, echo: 0.35 }));
    }
    return ev;
  },
};

// ---------------------------------------------------------------------------
// 水月幻镜 (the mirror, GDD §12, §22). Three themes, each coloured by the map (湖 · 林 · 宫):
//
//   mirror-calm  lobby, shop and results, 84–92 bpm: a breath between waves, never a nap. A soft
//                大鼓 on every bar, 梆子 / 木鱼 off-beats and a quiet 古筝 ostinato keep a pulse
//                under the old colours (古琴 and 箫 · 洞箫 and 手鼓 · 编钟 and 笙).
//   mirror       the waves, 羽 or 商, 120–138 bpm — 《十面埋伏》, not a tea-house. Layers enter as
//                the wave runs: drums (大鼓 on the downbeats, 板 and 梆子 on the off-beats, 钹 and 锣
//                on the phrase turns) → an ostinato bass (低音古筝, or 阮 on the forest's pipa) →
//                琵琶 扫弦 and 轮 figures → the lead (笛, 唢呐; tongued and short). The last 10 s
//                tighten (≈ 4 % faster, 16th 板, 战鼓 pickups, 小锣 on the backbeat, the lead doubled);
//                danger (a crowd near the cap, low HP) pushes one layer up. The first phrase of a
//                wave opens with a drum fill into a 钹 + 大锣 downbeat.
//   mirror-boss  heavier per map, 138–150 bpm, darker modes (羽, 商 low, 角): war drums, a 大鼓 roll
//                into every phrase, 唢呐 calls, 琵琶 轮指 on the long notes; each boss phase adds a
//                layer and 4 bpm. It opens with a 大鼓 roll into the 大锣: the 锣 on boss entry.
//
// Every phrase is squared to whole 4/4 bars (the groove never skips a beat across phrases) and read
// its tempo and layers from the mirror state below when it is composed, ≈ 4.5 s ahead of the audio
// clock (music.ts HORIZON): a change is heard at the next phrase. The mirror's audio module
// (src/views/mirror/audio/music.ts) sets that state from the wave clock and the HUD.

export type MirrorColour = 'lake' | 'forest' | 'palace';

/** What the mirror's audio tells the band. Module state, like the colour: read at compose time. */
export interface MirrorMusicState {
  colour: MirrorColour;
  /** Seconds left in the wave when last told (null: not told, or a boss). */
  left: number | null;
  /** The wave's length in seconds (null: not told). */
  total: number | null;
  /** 0..1 — a crowd near the cap, low HP. At ≥ 0.5 it pushes the band one layer up. */
  danger: number;
  /** The boss's phase (0, 1, 2…): each one steps the boss theme up. */
  bossPhase: number;
}

const mm: MirrorMusicState = { colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0 };
const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : dflt);

/** Update the mirror state (non-finite values are ignored; everything is clamped). */
export function setMirrorMusic(s: Partial<MirrorMusicState>): void {
  if (s.colour) mm.colour = s.colour;
  if ('left' in s) mm.left = s.left == null ? null : num(s.left, 0, 3600, 0);
  if ('total' in s) mm.total = s.total == null ? null : num(s.total, 1, 3600, 60);
  if ('danger' in s) mm.danger = num(s.danger, 0, 1, 0);
  if ('bossPhase' in s) mm.bossPhase = Math.round(num(s.bossPhase, 0, 9, 0));
}
export const getMirrorMusic = (): Readonly<MirrorMusicState> => mm;
export function setMirrorColour(map: MirrorColour): void { mm.colour = map; }
export const getMirrorColour = (): MirrorColour => mm.colour;

/** How far ahead of the audio clock a phrase is composed (music.ts HORIZON). */
export const MIRROR_LOOKAHEAD = 4.5;
/** The last seconds of a wave, when the band tightens. */
export const MIRROR_TIGHT_SECS = 10;

/**
 * The wave's layers for a phrase: 0 drums · 1 + bass · 2 + 琵琶 · 3 + lead · 4 tight. From the wave
 * clock when the engine reports it (the last 10 s are tight), else one layer per phrase; danger ≥ 0.5
 * pushes one layer up.
 */
export function mirrorTier(p: Phrase, s: Readonly<MirrorMusicState> = mm): number {
  let t: number;
  if (s.left != null && s.total) {
    const left = s.left - MIRROR_LOOKAHEAD - 2.5; // the middle of this phrase, when it is heard
    const prog = 1 - left / s.total;
    t = left <= MIRROR_TIGHT_SECS ? 4 : prog < 0.1 ? 0 : prog < 0.25 ? 1 : prog < 0.42 ? 2 : 3;
  } else t = Math.min(3, p.index);
  if (s.danger >= 0.5) t += 1;
  return Math.min(4, Math.max(0, t));
}

/** The boss theme's step: its phase, plus one when in danger (0 … 3). */
export const mirrorBossStep = (s: Readonly<MirrorMusicState> = mm) => Math.min(3, s.bossPhase + (s.danger >= 0.5 ? 1 : 0));

const MIRROR_CALM_STYLE: Record<MirrorColour, Style> = {
  lake: {
    bpm: [84, 90], modes: [M(62, 4), M(55, 1), M(53, 0)], range: [-1, 7],
    cells: MED, motifBeats: 4, statements: [1, 2], restChance: 0.08, breath: [0.5, 1.5], periodRest: [1, 2],
    cadenceBeats: 2, leap: 0.45, modulate: 0.3,
  },
  forest: {
    bpm: [86, 92], modes: [M(55, 1), M(62, 4), M(57, 2)], range: [-1, 7],
    cells: MED, motifBeats: 4, statements: [1, 2], restChance: 0.08, breath: [0.5, 1.5], periodRest: [1, 2],
    cadenceBeats: 2, leap: 0.5, modulate: 0.3,
  },
  palace: {
    bpm: [88, 92], modes: [M(55, 1), M(62, 4), M(60, 3)], range: [0, 8],
    cells: MED, motifBeats: 4, statements: [1, 2], restChance: 0.06, breath: [0.5, 1.5], periodRest: [1, 2],
    cadenceBeats: 2, leap: 0.5, modulate: 0.3,
  },
};

/** Driving cells: 8ths and 16ths, dotted pushes, few long notes. */
const DRIVE = [[0.5, 0.5], [1], [0.75, 0.25], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25], [1.5, 0.5], [0.5, 1, 0.5]];

const MIRROR_STYLE: Record<MirrorColour, Style> = {
  // 月湖: 羽 on D (or 商 on G), 笛 over a 古筝 gallop, 刮奏 like water breaking
  lake: {
    bpm: [118, 126], modes: [M(62, 4), M(55, 1)], range: [-1, 7],
    cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.04, breath: [0.5, 1], periodRest: [0.5, 1],
    cadenceBeats: 1.5, leap: 0.5, modulate: 0.2,
  },
  // 墨林: 商 on G (or 羽), the ambush — 堂鼓 toms, 阮 on the pipa's low strings, a 唢呐 lead
  forest: {
    bpm: [122, 130], modes: [M(55, 1), M(62, 4)], range: [-1, 7],
    cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.04, breath: [0.5, 1], periodRest: [0.5, 1],
    cadenceBeats: 1.5, leap: 0.55, modulate: 0.2,
  },
  // 广寒: 羽 or 商, bright and cold — 笛 with 编钟 on the strong beats, the fastest of the three
  palace: {
    bpm: [126, 132], modes: [M(62, 4), M(67, 1)], range: [0, 7],
    cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.04, breath: [0.5, 1], periodRest: [0.5, 1],
    cadenceBeats: 1.5, leap: 0.5, modulate: 0.2,
  },
};

const MIRROR_BOSS_STYLE: Record<MirrorColour, Style> = {
  lake: {
    bpm: [136, 142], modes: [M(62, 4), M(57, 2)], range: [-2, 6],
    cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.03, breath: [0.5, 1], periodRest: [0.5, 1],
    cadenceBeats: 2, leap: 0.55, modulate: 0.2,
  },
  forest: {
    bpm: [138, 144], modes: [M(55, 1), M(50, 4)], range: [-2, 6],
    cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.03, breath: [0.5, 1], periodRest: [0.5, 1],
    cadenceBeats: 2, leap: 0.6, modulate: 0.2,
  },
  palace: {
    bpm: [140, 146], modes: [M(57, 2), M(62, 4)], range: [-2, 6],
    cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.03, breath: [0.5, 1], periodRest: [0.5, 1],
    cadenceBeats: 2, leap: 0.55, modulate: 0.2,
  },
};

/** Per-colour level (the music lab asks for −24…−18 dBFS at full volume). */
const MIRROR_CALM_LEVEL: Record<MirrorColour, number> = { lake: 0.95, forest: 0.9, palace: 1.0 };
const MIRROR_LEVEL: Record<MirrorColour, number> = { lake: 0.62, forest: 0.56, palace: 0.6 };
const MIRROR_BOSS_LEVEL: Record<MirrorColour, number> = { lake: 0.58, forest: 0.58, palace: 0.56 };

/** Square a phrase to whole 4/4 bars at a set tempo (the Conductor reads p after arrange()). */
function toBars(p: Phrase, bpm: number, intro = false) {
  if (intro) {
    // a bar of drums before the tune (the fill into the wave, the roll into the boss)
    for (const n of p.notes) n.beat += 4;
    p.end += 4;
  }
  p.bpm = Math.round(bpm);
  p.beats = Math.max(4, Math.ceil((p.end + 0.5 - 1e-6) / 4) * 4);
}

const between = (x: number, [lo, hi]: [number, number]) => clamp(x, lo, hi);

/** The chord root under the melody at `beat`. */
const rootAt = (p: Phrase, beat: number) => rootUnder(p, (p.notes.filter((n) => n.beat <= beat + 1e-6).pop() ?? p.notes[0]).deg);

/** The octave that puts the mode's final nearest `midi`. */
const octFor = (p: Phrase, midi: number) => Math.round((midi - p.mode.tonic) / 12);

/** Melody notes tongued short (the lead kept tight): long inner notes lose a quarter. */
const tongued = (notes: MNote[]) => notes.map((n) => (n.dur >= 0.5 && !n.cad ? { ...n, dur: n.dur * 0.72 } : n));

interface DrumOpts {
  /** 0 drums … 4 tight (mirrorTier). */
  tier: number;
  /** Bar 0 is a fill: two 大鼓 strokes and a rising 堂鼓 roll (wave), or a 大鼓 roll (boss). */
  intro?: 'fill' | 'roll';
  /** 墨林's toms: a syncopated 堂鼓 on the and-of-3 and the last 16th. */
  toms?: boolean;
  /** Boss: war drums, 小锣 on the backbeat, a 大鼓 roll into the next phrase; `step` adds 大锣 and 16ths. */
  boss?: boolean;
  step?: number;
  gain?: number;
}

/**
 * The percussion bed over the whole phrase (breath included): 大鼓 on the downbeats, 板 on the
 * off-beats, 堂鼓 on the backbeat, 梆子 pushing into it, 钹 and 锣 on the phrase turns.
 */
function drumBed(c: Ctx, o: DrumOpts): MusicEvent[] {
  const { p, r } = c;
  const ev: MusicEvent[] = [];
  const G = o.gain ?? 1, tier = o.tier, step = o.step ?? 0;
  const at = (kind: HitKind, beat: number, gain: number, pan: number, prio: 0 | 1 | 2 = 2, send = 0.12) => {
    if (beat >= p.beats - 1e-6) return;
    ev.push(hit(c, kind, Math.max(0, secOf(c, beat) + (r() - 0.5) * 0.006), clamp(G * gain * (0.92 + r() * 0.16), 0.01, 1), { pan, send, prio }));
  };
  const bars = Math.round(p.beats / 4);
  const intro = o.intro && p.index === 0;
  for (let b = 0; b < bars; b++) {
    const b0 = b * 4, last = b === bars - 1;
    if (intro && b === 0) {
      if (o.intro === 'fill') {
        // 咚 咚 哒哒哒哒哒哒哒哒 | 仓 — into the wave
        at('big', 0, 0.5, -0.1, 0); at('big', 1, 0.42, -0.1, 0);
        for (let k = 0; k < 8; k++) at('tang', 2 + k * 0.25, 0.16 + 0.035 * k, -0.3 + 0.08 * k, 1);
      } else {
        // the boss: a drum roll swelling for a whole bar — 大鼓 on the 8ths, 堂鼓 between
        for (let k = 0; k < 8; k++) { at('big', k * 0.5, 0.2 + 0.045 * k, -0.1, 0); at('tang', k * 0.5 + 0.25, 0.1 + 0.035 * k, 0.2); }
      }
      continue;
    }
    // 大鼓: 1 and 3 (the pulse: never dropped, like a melody); the and-of-4 pickup from the lead's
    // entry; the and-of-2 when tight (战鼓)
    at('big', b0, 0.52, -0.1, 0); at('big', b0 + 2, 0.44, -0.1, 0);
    if (tier >= 3 || o.boss) at('big', b0 + 3.5, 0.28, -0.1);
    if ((tier >= 4 || o.boss) && b % 2 === 1) at('big', b0 + 1.5, 0.26, -0.1);
    if (o.boss && step >= 2 && b % 2 === 0) for (const k of [1.5, 1.75]) at('tang', b0 + k, 0.24, -0.3);
    // 板 (the clapper) on every off-beat; tight: the 16ths between too
    for (const k of [0.5, 1.5, 2.5, 3.5]) at('rim', b0 + k, 0.17, 0.3);
    if (tier >= 4 || (o.boss && step >= 2)) for (const k of [0.25, 1.25, 2.25, 3.25]) at('rim', b0 + k, 0.09, 0.38);
    // 堂鼓 backbeat, ghost 16ths from the 琵琶's entry
    if (tier >= 1 || o.boss) { at('tang', b0 + 1, 0.32, 0.15); at('tang', b0 + 3, 0.32, 0.15); }
    if (tier >= 2 && b % 2 === 1 && !last) { at('tang', b0 + 2.75, 0.12, 0.22); at('tang', b0 + 3.25, 0.1, 0.22); }
    if (o.toms && tier >= 1) { at('tang', b0 + 2.5, 0.2, -0.35); at('tang', b0 + 3.75, 0.16, -0.35); }
    // 梆子: a 16th before each backbeat
    if (tier >= 1 || o.boss) { at('bang', b0 + 0.75, 0.11, 0.45); at('bang', b0 + 2.75, 0.11, 0.45); }
    // 小锣 (才) on 3 when tight and for a boss; on 1 too from the boss's second phase
    if (o.boss && step >= 2) at('xiaoluo', b0 + 1, 0.07, 0.42);
    if (tier >= 4 || o.boss) at('xiaoluo', b0 + 3, 0.08, 0.42);
    // into the next phrase: a 堂鼓 fill, or for a boss a 大鼓 roll (大鼓 and 堂鼓 alternating)
    // (the backbeat on 3 starts it)
    if (last && o.boss) for (let k = 1; k < 4; k++) at(k === 2 ? 'big' : 'tang', b0 + 3 + k * 0.25, 0.26 + 0.06 * k, k === 2 ? -0.1 : 0.2);
    else if (last && tier >= 2) for (let k = 1; k < 4; k++) at('tang', b0 + 3 + k * 0.25, 0.16 + 0.05 * k, -0.25 + 0.12 * k);
  }
  // phrase turns: 钹 on the first downbeat, the 大锣 opening each period (every phrase when tight,
  // or from the boss's second phase), and after an intro bar
  const first = intro ? 4 : 0;
  if (first < p.beats) {
    at('bo', first, 0.2, 0.3, 1, 0.2);
    const turn = p.role === 'qi' || ((tier >= 4 || (o.boss && step >= 1)) && p.role === 'zhuan');
    if (turn || intro) at('daluo', first, intro ? 0.26 : 0.2, 0.05, 1, 0.25);
    else if (tier >= 4 || o.boss) at('xiaoluo', first, 0.1, 0.35, 1, 0.2);
  }
  return ev;
}

/**
 * The ostinato bass: a gallop on the root (8th, two 16ths), the fifth on 2, the octave or a turn on
 * 4 — 低音古筝 (damped short, like a palm) or 阮 (the pipa's low strings).
 */
function ostinato(c: Ctx, inst: 'zheng' | 'pipa', o: { gain: number; from?: number; heavy?: boolean }): MusicEvent[] {
  const { p } = c;
  const oct = octFor(p, inst === 'zheng' ? 40 : 45);
  const A: [number, number, number][] = [[0, 0, 1], [0.5, 0, 0.5], [0.75, 0, 0.6], [1, 3, 0.8], [1.5, 0, 0.55], [2, 0, 0.9], [2.5, 0, 0.5], [2.75, 0, 0.6], [3, 5, 0.8], [3.5, 3, 0.6]];
  const B: [number, number, number][] = [[0, 0, 1], [0.5, 0, 0.5], [0.75, 0, 0.6], [1, 3, 0.8], [1.5, 0, 0.55], [2, 0, 0.9], [2.5, 0, 0.5], [2.75, 0, 0.6], [3, 2, 0.75], [3.5, 1, 0.65]];
  const raw: { beat: number; dur: number; midi: number; vel: number }[] = [];
  for (let b0 = o.from ?? 0; b0 < p.beats - 1e-6; b0 += 4) {
    const root = rootAt(p, b0);
    for (const [k, d, v] of (b0 / 4) % 2 ? B : A) raw.push({ beat: b0 + k, dur: 0.5, midi: midiOf(c, root + d, oct), vel: v * 0.82 });
    if (o.heavy) raw.push({ beat: b0, dur: 1, midi: midiOf(c, root + 5, oct), vel: 0.6 });
  }
  const ev = plucks(c, inst, raw, { gain: o.gain, send: 0.08, spread: 0.12, center: -0.18, prio: 1, humanize: 0.004 });
  // the zheng's low strings ring for seconds: damp them to a short, driving note
  if (inst === 'zheng') for (const e of ev) if (e.job.op === 'pluck') for (const n of e.job.notes) n.ring = 0.42;
  return ev;
}

/** 琵琶: 扫弦 (a four-string strum) on each bar, 轮 figures (four repeated 16ths) on 2 and 4, root and fifth between. */
function pipaDrive(c: Ctx, o: { gain: number; tight?: boolean; from?: number }): MusicEvent[] {
  const { p } = c;
  const oct = octFor(p, 52);
  const raw: { beat: number; dur: number; midi: number; vel: number }[] = [];
  const strum = (beat: number, root: number, vel: number) => {
    [0, 3, 5, 7].forEach((d, i) => raw.push({ beat: beat + (i * 0.014) / c.spb, dur: 0.5, midi: midiOf(c, root + d, oct), vel: vel * (1 - i * 0.06) }));
  };
  const lun = (beat: number, deg: number, vel: number) => {
    [1, 0.55, 0.72, 0.55].forEach((v, i) => raw.push({ beat: beat + i * 0.25, dur: 0.25, midi: midiOf(c, deg, oct + 1), vel: vel * v }));
  };
  for (let b0 = o.from ?? 0; b0 < p.beats - 1e-6; b0 += 4) {
    const root = rootAt(p, b0);
    strum(b0, root, 0.85);
    lun(b0 + 1, root + 3, 0.7);
    raw.push({ beat: b0 + 2, dur: 0.5, midi: midiOf(c, root, oct + 1), vel: 0.72 }, { beat: b0 + 2.5, dur: 0.5, midi: midiOf(c, root + 3, oct), vel: 0.55 });
    if (o.tight) strum(b0 + 2.5, root, 0.7);
    lun(b0 + 3, root + ((b0 / 4) % 2 ? 2 : 5), 0.72);
  }
  return plucks(c, 'pipa', raw.filter((n) => n.beat < p.beats - 1e-6), { gain: o.gain, send: 0.14, spread: 0.3, center: 0.3, prio: 1, humanize: 0.003 });
}

/** A soft pulse for the calm theme: 大鼓 on the bar, 梆子 or 木鱼 on the off-beats, a 古筝 ostinato. */
function calmPulse(c: Ctx, o: { knock: 'bang' | 'wood'; zheng: number; drum: number }): MusicEvent[] {
  const { p, r } = c;
  const ev: MusicEvent[] = [];
  for (let b0 = 0; b0 < p.beats - 1e-6; b0 += 4) {
    ev.push(hit(c, 'big', secOf(c, b0), o.drum * (0.9 + r() * 0.2), { pan: -0.1, send: 0.2, prio: 1 }));
    if (r.chance(0.5)) ev.push(hit(c, 'big', secOf(c, b0 + 2.5), o.drum * 0.5, { pan: -0.1, send: 0.2 }));
    for (const k of [1, 2.5, 3]) if (!r.chance(0.15)) ev.push(hit(c, o.knock, secOf(c, b0 + k), (o.knock === 'bang' ? 0.07 : 0.08) * (k === 1 ? 1 : 0.7), { pan: 0.4, send: 0.2 }));
  }
  if (o.zheng > 0) {
    const oct = octFor(p, 48);
    const raw: { beat: number; dur: number; midi: number; vel: number }[] = [];
    for (let b0 = 0; b0 < p.beats - 1e-6; b0 += 2) {
      const root = rootAt(p, b0);
      [[0, 0, 0.6], [0.5, 3, 0.4], [1, 5, 0.45], [1.5, 3, 0.38]].forEach(([k, d, v]) => raw.push({ beat: b0 + k, dur: 0.5, midi: midiOf(c, root + d, oct), vel: v }));
    }
    const z = plucks(c, 'zheng', raw, { gain: o.zheng, send: 0.22, spread: 0.4, center: -0.1, prio: 1, humanize: 0.006 });
    for (const e of z) if (e.job.op === 'pluck') for (const n of e.job.notes) n.ring = 0.9;
    ev.push(...z);
  }
  return ev;
}

/** Melody notes as 编钟 strikes: bronze bells, one cached render per pitch. */
function bells(c: Ctx, notes: MNote[], oct: number, gain: number, prio: 0 | 1 | 2 = 0): MusicEvent[] {
  return notes.map((n) => {
    const m = midiOf(c, n.deg, oct);
    const e = hit(c, 'ling', secOf(c, n.beat), gain * (0.75 + 0.35 * n.vel), { freq: hz(m), pan: panOf(m, 0.3, 0.1), send: 0.35, echo: 0.1, prio });
    e.notes = [{ t: 0, dur: Math.max(0.3, secOf(c, n.dur)), midi: m }];
    return e;
  });
}

const mirrorCalm: ThemeSpec = {
  get level() { return MIRROR_CALM_LEVEL[mm.colour]; },
  get style() { return MIRROR_CALM_STYLE[mm.colour]; },
  shape(p) { toBars(p, between(p.bpm, MIRROR_CALM_STYLE[mm.colour].bpm)); },
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const last = p.notes[p.notes.length - 1];
    if (mm.colour === 'lake') {
      // 古琴 sings, a 箫 takes the second statement; 木鱼 and a soft 大鼓 keep the pulse
      if (p.role === 'cheng') ev.push(...[line(c, 'xiao', p.notes, 0, { gain: 0.6, pan: -0.15, send: 0.42, grace: 0.45, slide: 0.25 })].filter(notNull));
      else ev.push(...plucks(c, 'qin', mel(c, 0), { gain: 0.85, send: 0.32, bend: 0.3, glide: 0.2, vib: 0.5, spread: 0.25 }));
      ev.push(...calmPulse(c, { knock: 'wood', zheng: 0.3, drum: 0.2 }));
      if (p.role === 'he') ev.push(...plucks(c, 'qin', [{ beat: last.beat, dur: last.dur, midi: midiOf(c, 0, -1), vel: 0.45 }], { gain: 0.55, send: 0.35, prio: 1 }));
    } else if (mm.colour === 'forest') {
      // 洞箫 low and breathy over 手鼓; the 笛 answers in the 转
      const x = p.role === 'zhuan'
        ? line(c, 'dizi', p.notes, octFor(p, 67), { gain: 0.5, pan: 0.15, send: 0.4, grace: 0.6, slide: 0.2, echo: 0.12 })
        : line(c, 'xiao', p.notes, octFor(p, 60), { gain: 0.68, pan: -0.15, send: 0.42, grace: 0.45, slide: 0.3 });
      if (x) ev.push(x);
      ev.push(...pattern(c, 'tang', 4, [[0, 1], [1.5, 0.5], [2, 0.8], [3, 0.45], [3.5, 0.6]], { gain: 0.22, pan: -0.2, send: 0.1, drop: 0.06, to: p.beats }));
      ev.push(...calmPulse(c, { knock: 'bang', zheng: 0.26, drum: 0.16 }));
      ev.push(pad(c, p.role === 'zhuan' ? halfCadence(p.mode.final) : 0, -1, { gain: 0.14, send: 0.5, vel: 0.5, air: 1, octave: false }));
    } else {
      // 笙 chords under 编钟 bells; the 古筝 keeps the pulse; a small 锣 opens each period
      ev.push(...bells(c, p.notes, octFor(p, 74), 0.32));
      ev.push(pad(c, p.role === 'zhuan' ? halfCadence(p.mode.final) : 0, -1, { gain: 0.22, send: 0.45, vel: 0.6, air: 0.4, overlap: 2.5 }));
      ev.push(...calmPulse(c, { knock: 'bang', zheng: 0.34, drum: 0.18 }));
    }
    if (p.role === 'qi' && r.chance(0.6)) ev.push(hit(c, 'xiaoluo', 0, 0.08, { pan: 0.3, send: 0.3 }));
    return ev;
  },
};

const mirror: ThemeSpec = {
  get level() { return MIRROR_LEVEL[mm.colour]; },
  get style() { return MIRROR_STYLE[mm.colour]; },
  shape(p) {
    const tier = mirrorTier(p);
    toBars(p, between(p.bpm, MIRROR_STYLE[mm.colour].bpm) * (tier >= 4 ? 1.04 : 1));
  },
  arrange(c) {
    const { p } = c;
    const tier = mirrorTier(p);
    const col = mm.colour;
    const ev: MusicEvent[] = [];
    const fill = p.index === 0;
    const from = fill ? 4 : 0; // melodic layers wait for the fill's downbeat
    ev.push(...drumBed(c, { tier, intro: 'fill', toms: col === 'forest' }));
    if (tier >= 1) ev.push(...ostinato(c, col === 'forest' ? 'pipa' : 'zheng', { gain: col === 'forest' ? 0.62 : 0.56, from, heavy: tier >= 4 }));
    if (tier >= 2) ev.push(...pipaDrive(c, { gain: 0.46, tight: tier >= 4, from }));
    if (tier >= 3) {
      const notes = tongued(p.notes);
      if (col === 'forest') {
        ev.push(...[line(c, 'suona', notes, octFor(p, 62), { gain: 0.5, pan: 0.05, send: 0.2, grace: 0.55, slide: 0.12, vib: 0.7 })].filter(notNull));
        if (tier >= 4) ev.push(...[line(c, 'dizi', tongued(strongOnly(p.notes)), octFor(p, 74), { gain: 0.34, pan: 0.25, send: 0.25, grace: 0.4, slide: 0.05, prio: 1 })].filter(notNull));
      } else {
        ev.push(...[line(c, 'dizi', notes, octFor(p, 67), { gain: 0.56, pan: 0.1, send: 0.24, grace: 0.55, slide: 0.08, vib: 0.6, echo: col === 'lake' ? 0.14 : 0.06 })].filter(notNull));
        if (tier >= 4) ev.push(...[line(c, 'suona', tongued(strongOnly(p.notes)), octFor(p, 58), { gain: 0.36, pan: -0.1, send: 0.2, grace: 0.4, slide: 0.08, prio: 1 })].filter(notNull));
        // 编钟 on the half-bar strong notes (long rings: every other one)
        if (col === 'palace') ev.push(...bells(c, strongOnly(p.notes).filter((n) => n.cad || Math.round(n.beat) % 2 === 0), octFor(p, 79), 0.22, 2));
      }
    } else if (p.role === 'he' && tier >= 2) {
      // before the lead enters, the 琵琶's top string hints at the tune's cadence
      const lastN = p.notes[p.notes.length - 1];
      ev.push(...plucks(c, 'pipa', [{ beat: lastN.beat, dur: lastN.dur, midi: midiOf(c, lastN.deg, octFor(p, 64)), vel: 0.7 }], { gain: 0.5, send: 0.2, trem: 0.3, prio: 1, center: 0.2 }));
    }
    // 刮奏 on the lake: a sweep up into each period from the 琵琶's entry
    if (col === 'lake' && tier >= 2 && p.role === 'qi' && !fill) ev.push(...gliss(c, 0, -3, 7, 0.45, 0, { gain: 0.26, send: 0.3, echo: 0.15 }));
    return ev;
  },
};

const mirrorBoss: ThemeSpec = {
  get level() { return MIRROR_BOSS_LEVEL[mm.colour]; },
  get style() { return MIRROR_BOSS_STYLE[mm.colour]; },
  shape(p) { toBars(p, between(p.bpm, MIRROR_BOSS_STYLE[mm.colour].bpm) + 3 * Math.min(2, mirrorBossStep()), p.index === 0); },
  arrange(c) {
    const { p } = c;
    const step = mirrorBossStep();
    const col = mm.colour;
    const ev: MusicEvent[] = [];
    const from = p.index === 0 ? 4 : 0;
    ev.push(...drumBed(c, { tier: 3 + Math.min(1, step), intro: 'roll', boss: true, step, toms: col === 'forest' }));
    ev.push(...ostinato(c, col === 'forest' ? 'pipa' : 'zheng', { gain: 0.6, from, heavy: true }));
    ev.push(...pipaDrive(c, { gain: 0.4, tight: step >= 1, from }));
    // 琵琶 轮指 on the tune's long notes (heterophony)
    const long = p.notes.filter((n) => n.dur >= 1);
    if (long.length) ev.push(...plucks(c, 'pipa', mel(c, octFor(p, 64), long), { gain: 0.42, send: 0.18, trem: 0.3, spread: 0.2, center: 0.25, prio: 2 }));
    // the lead: 唢呐 calls on the strong notes (the whole tune in the 转, and from the second phase)
    const full = p.role === 'zhuan' || step >= 1;
    const lead = full ? tongued(p.notes) : strongOnly(p.notes).map((n) => ({ ...n, dur: Math.max(n.dur, 0.75) }));
    ev.push(...[line(c, 'suona', lead, octFor(p, 60), { gain: 0.52, pan: 0.05, send: 0.22, grace: 0.6, slide: 0.2, vib: 0.8 })].filter(notNull));
    if (col === 'forest') ev.push(...[line(c, 'erhu', tongued(p.notes), octFor(p, 52), { gain: 0.4, pan: -0.25, send: 0.2, grace: 0.3, slide: 0.3, prio: 1 })].filter(notNull));
    if (col === 'palace') ev.push(...bells(c, strongOnly(p.notes).filter((n) => n.cad || Math.round(n.beat) % 2 === 0), octFor(p, 76), 0.24, 2));
    if (col === 'lake' && step >= 1) ev.push(...[line(c, 'dizi', tongued(strongOnly(p.notes)), octFor(p, 74), { gain: 0.3, pan: 0.3, send: 0.25, echo: 0.12, prio: 2 })].filter(notNull));
    return ev;
  },
};

/** One-shots the mirror's audio plays on the music bus between themes (music.cue). */
export type MirrorCue = 'clear';
export function mirrorCue(_kind: MirrorCue, seed = 1): MusicEvent[] {
  const c = { p: { bpm: 120 } as Phrase, r: makeRng(seed), spb: 0.5, seed } as Ctx;
  // the wave is won: 仓! — 钹 and 大鼓 together, the cymbal choked by the hand (music.cue's choke)
  return [hit(c, 'bo', 0, 0.34, { pan: 0.15, send: 0.25, prio: 1 }), hit(c, 'big', 0, 0.6, { pan: -0.1, send: 0.2, prio: 1 })];
}

export const THEMES: Record<ThemeId, ThemeSpec> = {
  garden, village, lake, bamboo, plum, mountain, night, festival, hall, quiet, taoyuan,
  mirror, 'mirror-calm': mirrorCalm, 'mirror-boss': mirrorBoss,
};

/** Arrange one phrase of a theme (a theme may first reshape it: tempo, whole bars — the Conductor reads p after this). */
export function arrange(theme: ThemeId, p: Phrase, r: Rng, seed: number): MusicEvent[] {
  const spec = THEMES[theme];
  spec.shape?.(p);
  const c: Ctx = { p, r, spb: 60 / p.bpm, seed };
  return spec.arrange(c).filter((e) => e && Number.isFinite(e.t) && e.t >= 0);
}

/** Phrase length in seconds. */
export const phraseSeconds = (p: Phrase) => (p.beats * 60) / p.bpm;
