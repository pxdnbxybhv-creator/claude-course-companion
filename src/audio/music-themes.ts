// Background music, part 3 — the band. For each theme: a Style for the composer and an arranger
// that turns each composed phrase into instrument layers (render jobs with a time, level, pan and
// reverb/echo sends). Pure: no Web Audio here, so the lab and tests can inspect every note.
import type { Rng } from '../core/rng';
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

// taoyuan: until its own theme lands (wave 6), the spring plays the garden's music
export const THEMES: Record<ThemeId, ThemeSpec> = { garden, village, lake, bamboo, plum, mountain, night, festival, hall, quiet, taoyuan: garden };

/** Arrange one phrase of a theme. */
export function arrange(theme: ThemeId, p: Phrase, r: Rng, seed: number): MusicEvent[] {
  const c: Ctx = { p, r, spb: 60 / p.bpm, seed };
  return THEMES[theme].arrange(c).filter((e) => e && Number.isFinite(e.t) && e.t >= 0);
}

/** Phrase length in seconds. */
export const phraseSeconds = (p: Phrase) => (p.beats * 60) / p.bpm;
