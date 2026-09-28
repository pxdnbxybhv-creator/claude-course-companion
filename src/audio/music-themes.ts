// Background music, part 3 — the band. For each theme: a Style for the composer and an arranger
// that turns each composed phrase into instrument layers (render jobs with a time, level, pan and
// reverb/echo sends). Pure: no Web Audio here, so the lab and tests can inspect every note.
import { makeRng, type Rng } from '../core/rng';
import { clamp } from './dsp';
import type { KitHit, KitKind, LineInst, LineNote, MusicJob, PluckInst, PluckNote } from './music-dsp';
import { degreeToMidi, halfCadence, midiToFreq, modeSteps, MUSIC_GONG_PC, nearestOctave, PENT, type MNote, type Mode, type Phrase, type Style } from './music-theory';

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
  /** Reshape a phrase before it is arranged (tempo, whole bars, a new tune); the Conductor reads p afterwards. */
  shape?(p: Phrase, r?: Rng): void;
  arrange(c: Ctx): MusicEvent[];
  /** The longest fade-in the theme starts with (s): a fight opens on its first drum stroke. */
  fadeIn?: number;
  /**
   * A counter the theme bumps when its state moves on in a way the band must play before the phrases
   * already composed are heard (a boss's new phase): the Conductor then re-composes the phrases that
   * have no sound yet (music-player.ts). Themes without it are never re-composed.
   */
  epoch?(): number;
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
function hit(c: Ctx, kind: HitKind, t: number, gain: number, o: { pan?: number; send?: number; echo?: number; freq?: number; prio?: 0 | 1 | 2; hard?: boolean } = {}): MusicEvent {
  const v = c.r.int(1, 3); // three cached variants of each
  const base = { t, gain, pan: o.pan ?? 0, send: o.send ?? 0.15, echo: o.echo ?? 0, prio: o.prio ?? 2 } as const;
  switch (kind) {
    case 'tang': case 'rim': case 'big': {
      // `hard`: the battle drums (the knock and the stick a phone can play) — the mirror's cues
      const hard = !!o.hard && kind !== 'rim';
      const job: MusicJob = hard ? { op: 'drum', kind, seed: v, hard } : { op: 'drum', kind, seed: v };
      return { ...base, inst: 'drum', job, key: `drum:${kind}:${hard ? 'h:' : ''}${v}`, dur: kind === 'big' ? 1.2 : 0.6, rate: 1 + (c.r() - 0.5) * 0.03 };
    }
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
//   mirror       the waves, 132–152 bpm: a battle score led by the winds. After a one-bar drum fill
//                (the 笛's 吐音 pickup inside it) the 笛 states the map's own call — upward 4ths and
//                5ths, dotted drive, 吐音 repeated-note runs, 叠音/打音 ornaments — in 起承转合
//                periods: the 箫 answers low in every held note and takes the second statement, the
//                转 is a call-and-response (笛 against 箫, then 唢呐), the 合 rises into a held final
//                (花舌 on the climaxes). War drums drive it (大鼓, 堂鼓, 板, 梆子, 小锣; 钹 and 大锣 on the
//                turns); 二胡 and 笙 support; the 琵琶/古筝 only keep the rhythm. Layers grow with the
//                wave clock and the danger; the last 10 s tighten (+4 %, the 唢呐 doubles the tune).
//                湖: a bright 曲笛 and a prominent 箫 · 林: 箫 + 唢呐, 堂鼓 toms · 宫: 笛 + 编钟, high 笙.
//   mirror-boss  144–152 bpm, darker modes: a 大鼓 roll into the 大锣, then the 唢呐 leads the boss's
//                call (上滑音 scoops, a wide vibrato), the 箫 low and ominous under it in every phase; each
//                boss phase adds the 笛 a 4th above the 唢呐 (花舌 on the holds; never past E6), the 二胡
//                and 笙 stabs, heavier drums.
//
// Every phrase is four whole 4/4 bars (the groove never skips a beat across phrases) and reads its
// tempo and layers from the mirror state below when it is composed, ≈ 4.5 s ahead of the audio clock
// (music.ts HORIZON): a change is heard at the next phrase. A boss's new phase and the danger cue bump
// the mirror epoch, so the Conductor re-composes the phrases that have no sound yet (the band changes
// at the next phrase boundary more than 1.2 s ahead, not a phrase later), and the director (src/views/
// mirror/audio/music.ts) fires a cue on the music bus at once — on the band's next beat, in its tempo.

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
  /** Waves started this session: the map's call rotates with it (WAVE_HEADS). */
  wave?: number;
}

const mm: MirrorMusicState = { colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0, wave: 0 };
let epoch = 0;
/** Bumped by a boss's new phase and by the director's danger cue (ThemeSpec.epoch). */
export const mirrorEpoch = () => epoch;
/** Have the band re-compose what it has not played yet with the state as it is now (the director calls it
 *  with the danger cue, at most every 12 s: a danger hovering around one half must not churn the renders). */
export function refreshMirrorBand(): void { epoch++; }
const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : dflt);

/** Update the mirror state (non-finite values are ignored; everything is clamped). */
export function setMirrorMusic(s: Partial<MirrorMusicState>): void {
  if (s.colour) mm.colour = s.colour;
  if ('left' in s) mm.left = s.left == null ? null : num(s.left, 0, 3600, 0);
  if ('total' in s) mm.total = s.total == null ? null : num(s.total, 1, 3600, 60);
  const phase = mm.bossPhase;
  if ('danger' in s) mm.danger = num(s.danger, 0, 1, 0);
  if ('bossPhase' in s) mm.bossPhase = Math.round(num(s.bossPhase, 0, 9, 0));
  if ('wave' in s) mm.wave = Math.round(num(s.wave, 0, 1e6, 0));
  // a boss's new phase: the band steps up now, not a phrase later (the Conductor re-composes what has not sounded)
  if (mm.bossPhase > phase) epoch++;
}
export const getMirrorMusic = (): Readonly<MirrorMusicState> => mm;
export function setMirrorColour(map: MirrorColour): void { mm.colour = map; }
export const getMirrorColour = (): MirrorColour => mm.colour;

/** How far ahead of the audio clock a phrase is composed (music.ts HORIZON). */
export const MIRROR_LOOKAHEAD = 4.5;
/** The last seconds of a wave, when the band tightens. */
export const MIRROR_TIGHT_SECS = 10;

/**
 * The wave's layers for a phrase — the 笛 leads in every one of them:
 *   0  笛 and 箫, the war drums, a 琵琶 strum on each bar
 *   1  + 笙 pad, 梆子, the 大鼓's pickups, 刮奏 into the periods (湖)
 *   2  + 二胡 counterline, the 箫 doubling the long notes, 低音古筝 gallop, 堂鼓 ghosts
 *   3  + 花舌 on the climaxes, 笙 stabs, the 唢呐 answering in the 转, 小锣
 *   4  tight (the last 10 s): + 4 % tempo, the 唢呐 doubles the whole tune, 16th 板, 大锣 each phrase
 * From the wave clock when the engine reports it, else one layer per phrase; danger ≥ 0.5 pushes one
 * layer up.
 */
export function mirrorTier(p: Phrase, s: Readonly<MirrorMusicState> = mm): number {
  let t: number;
  if (s.left != null && s.total) {
    const left = s.left - MIRROR_LOOKAHEAD - 2.5; // the middle of this phrase, when it is heard
    const prog = 1 - left / s.total;
    t = left <= MIRROR_TIGHT_SECS ? 4 : prog < 0.12 ? 0 : prog < 0.3 ? 1 : prog < 0.55 ? 2 : 3;
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

// The battle styles give the day's mode and tempo (the Composer's own tune is replaced by the battle
// composer below, which keeps its 起承转合 role, period and mode).
const battleStyle = (bpm: [number, number], modes: Mode[]): Style => ({
  bpm, modes, range: [-1, 7], cells: DRIVE, motifBeats: 4, statements: [2, 2], restChance: 0.04, breath: [0.5, 1],
  periodRest: [0.5, 1], cadenceBeats: 2, leap: 0.5, modulate: 0.2,
});

const MIRROR_STYLE: Record<MirrorColour, Style> = {
  // 月湖: 羽 on D (or 商 on G) — a bright 曲笛 and the lake's 箫
  lake: battleStyle([132, 138], [M(62, 4), M(55, 1)]),
  // 墨林: 商 on G (or 羽) — the ambush: 箫 and 唢呐, 堂鼓 toms
  forest: battleStyle([136, 142], [M(55, 1), M(62, 4)]),
  // 广寒: 羽 or 商, bright and cold — the 笛 with 编钟, high 笙, the fastest of the three
  palace: battleStyle([140, 146], [M(62, 4), M(67, 1)]),
};

const MIRROR_BOSS_STYLE: Record<MirrorColour, Style> = {
  lake: battleStyle([144, 148], [M(62, 4), M(57, 2)]),
  forest: battleStyle([144, 150], [M(55, 1), M(50, 4)]),
  palace: battleStyle([146, 150], [M(57, 2), M(62, 4)]),
};

/** The fastest a battle phrase may go (the tight last 10 s and the boss phases included). */
export const MIRROR_MAX_BPM = 152;

/** Per-colour level (the music lab asks for −24…−18 dBFS at full volume; a wave is never quieter than the shop). */
const MIRROR_CALM_LEVEL: Record<MirrorColour, number> = { lake: 0.95, forest: 0.9, palace: 1.0 };
// the battle score sits ≈ 2.5 dB over the other themes: under a fight's impacts it was ≈ 4 dB buried
const MIRROR_LEVEL: Record<MirrorColour, number> = { lake: 1.07, forest: 1.07, palace: 1.07 };
const MIRROR_BOSS_LEVEL: Record<MirrorColour, number> = { lake: 1.04, forest: 1.04, palace: 1.04 };

const between = (x: number, [lo, hi]: [number, number]) => clamp(x, lo, hi);

/** The chord root under the melody at `beat`. */
const rootAt = (p: Phrase, beat: number) => rootUnder(p, (p.notes.filter((n) => n.beat <= beat + 1e-6).pop() ?? p.notes[0]).deg);

/** The octave that puts the mode's final nearest `midi`. */
const octFor = (p: Phrase, midi: number) => Math.round((midi - p.mode.tonic) / 12);

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
  shape(p) {
    p.bpm = Math.round(between(p.bpm, MIRROR_CALM_STYLE[mm.colour].bpm));
    p.beats = Math.max(4, Math.ceil((p.end + 0.5 - 1e-6) / 4) * 4);
  },
  arrange(c) {
    const { p, r } = c;
    const ev: MusicEvent[] = [];
    const last = p.notes[p.notes.length - 1];
    if (mm.colour === 'lake') {
      // the 箫 sings the call and its answer, the 笛 takes the turn over the water, the 古琴 only the
      // close (合) and its low final; 木鱼 and a soft 大鼓 keep the pulse
      if (p.role === 'zhuan') ev.push(...[line(c, 'dizi', p.notes, octFor(p, 72), { gain: 0.5, pan: 0.15, send: 0.4, grace: 0.6, slide: 0.2, echo: 0.14 })].filter(notNull));
      else if (p.role === 'he') ev.push(...plucks(c, 'qin', mel(c, 0), { gain: 0.85, send: 0.32, bend: 0.3, glide: 0.2, vib: 0.5, spread: 0.25 }));
      else ev.push(...[line(c, 'xiao', p.notes, 0, { gain: 0.62, pan: -0.15, send: 0.42, grace: 0.45, slide: 0.25 })].filter(notNull));
      ev.push(...calmPulse(c, { knock: 'wood', zheng: 0.22, drum: 0.2 }));
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

// ---------------------------------------------------------------------------
// The battle composer. The Composer supplies the phrase's role (起承转合), period and mode; the tune
// is rewritten here as four bars around the map's fixed call (the head), so every wave of a run
// states the same hook and a player learns it.

export type BattleVoice = 'dizi' | 'xiao' | 'suona';

/** A battle melody note: a composer note plus who plays it and how. */
export interface BattleNote extends MNote {
  /** The wind carrying it: 笛 (lead), 箫 (second statements, answers), 唢呐 (bosses, the 转's answer). */
  v: BattleVoice;
  /** 吐音: tongued short (repeated notes, pickups, runs). */
  tu?: boolean;
  /** Held (≥ 1.5 beats): the other wind answers inside it. */
  hold?: boolean;
  /** The phrase's high point (花舌 from tier 3, or in a boss). */
  climax?: boolean;
  /** The pickup into the next phrase. */
  pick?: boolean;
}

/** A two-bar call: degrees from the mode's final and their lengths in beats (4 + 4). */
interface Head { degs: number[]; beats: number[] }

/**
 * The maps' calls (written for this game). 湖: the long D, a dotted fall, a climb by a 4th to the held
 * fifth — a call across the water. 林: a 吐音 burst on the final, a 5th up, a half-cadence hold — the
 * ambush. 宫: a rising 5th + 4th arpeggio to the top, then 吐音 below it — cold and high.
 */
const WAVE_HEADS: Record<MirrorColour, readonly Head[]> = {
  lake: [
    { degs: [5, 6, 5, 4, 3, 4, 5, 7, 8], beats: [1.5, 0.5, 0.75, 0.25, 1, 0.5, 0.5, 1, 2] },
    // the call from below: a 4th up to the held sixth, a 吐音 answer climbing to the top
    { degs: [3, 5, 6, 5, 4, 3, 3, 4, 5, 7], beats: [0.5, 0.5, 1.5, 0.5, 1, 0.25, 0.25, 0.5, 1, 2] },
    // tongued on the fifth, a leap to the seventh, falling back and pushing up again
    { degs: [5, 5, 7, 6, 5, 4, 5, 5, 6, 5, 4, 5], beats: [0.75, 0.25, 1, 0.5, 0.5, 1, 0.25, 0.25, 0.5, 0.5, 0.5, 2] },
  ],
  forest: [
    { degs: [0, 0, 0, 0, 3, 3, 5, 4, 3, 2, 3, 4, 3], beats: [0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 1, 0.75, 0.25, 0.5, 0.5, 1, 2] },
    // a 4th up and 吐音 on it, a 5th to the top, a snap back to the half-cadence
    { degs: [0, 3, 3, 3, 3, 5, 4, 3, 3, 2, 0, 2], beats: [0.5, 0.5, 0.25, 0.25, 0.5, 1.5, 0.5, 0.25, 0.25, 0.5, 1, 2] },
    // 吐音 on the fourth, the 5th leap, down to the final and up again
    { degs: [3, 3, 3, 3, 5, 4, 3, 2, 0, 0, 0, 3, 2, 3, 5], beats: [0.25, 0.25, 0.25, 0.25, 0.75, 0.25, 0.5, 0.5, 1, 0.25, 0.25, 0.5, 0.5, 0.5, 2] },
  ],
  palace: [
    { degs: [2, 5, 7, 6, 7, 6, 6, 6, 6, 6, 5, 4, 5], beats: [0.5, 0.5, 0.5, 0.5, 1.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 2] },
    // from the top down the arpeggio and back up to it; 吐音 below
    { degs: [7, 5, 2, 5, 7, 6, 6, 5, 4, 2, 4], beats: [1, 0.5, 0.5, 0.5, 1.5, 0.25, 0.25, 0.5, 0.5, 0.5, 2] },
    // a tongued pickup, the 5th + 4th to the top, a turn under it, rising to the held sixth
    { degs: [2, 2, 5, 7, 6, 5, 7, 6, 5, 4, 4, 5, 6], beats: [0.25, 0.25, 0.5, 0.75, 0.25, 0.5, 1.5, 0.5, 0.5, 0.25, 0.25, 0.5, 2] },
  ],
};
/** The call of the session's `wave`-th wave: the map's calls in turn, so a run does not hear one lick all night. */
const waveHead = (col: MirrorColour, wave = 0) => { const hs = WAVE_HEADS[col]; return hs[((wave % hs.length) + hs.length) % hs.length]; };
/** The 吐音 pickup into a phrase starting on `start`: a 4th below it, or a 5th above when the flute has no room below. */
const pickupDeg = (start: number, lo: number, hi: number) => (start - 2 >= lo ? start - 2 : Math.min(hi, start + 3));
/** The bosses' calls: long notes to scoop into (the 唢呐's 上滑音), a dotted answer. */
const BOSS_HEAD: Record<MirrorColour, Head> = {
  lake: { degs: [0, 2, 3, 2, 3, 5, 4, 3, 2, 3], beats: [1.5, 0.5, 1, 0.5, 0.5, 2, 0.75, 0.25, 0.5, 0.5] },
  forest: { degs: [0, 0, 0, 0, 2, 3, 5, 4, 3, 2, 3, 0], beats: [0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 2, 0.5, 0.5, 0.5, 0.5, 2] },
  palace: { degs: [5, 4, 5, 7, 6, 5, 4, 3, 5], beats: [1, 0.5, 0.5, 2, 0.75, 0.25, 0.5, 0.5, 2] },
};
/** Where each colour's lead sits: the MIDI note the head's middle is placed nearest. */
const LEAD_REG: Record<MirrorColour, number> = { lake: 76, forest: 77, palace: 81 };
const BOSS_REG: Record<MirrorColour, number> = { lake: 74, forest: 74, palace: 76 };

/** One bar of drive (4 beats): 8ths, dotted pushes, 吐音 16ths, syncopation. */
const DRIVE_BARS = [
  [0.5, 0.5, 0.75, 0.25, 1, 1],
  [0.25, 0.25, 0.5, 0.5, 0.5, 1, 1],
  [0.75, 0.25, 0.75, 0.25, 0.5, 0.5, 1],
  [0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 1],
  [0.5, 0.25, 0.25, 0.5, 0.25, 0.25, 0.5, 0.5, 1],
  [0.5, 1, 0.5, 0.75, 0.25, 1],
];
/** The 转's call-and-response cells (2 beats each). */
const CALL_CELLS = [[0.25, 0.25, 0.5, 1], [0.5, 0.25, 0.25, 1], [0.75, 0.25, 1], [0.25, 0.25, 0.25, 0.25, 1]];

interface BattlePlan {
  head: Head;
  /** The lowest and highest degree the tune may use (the lead instrument's range at its octave). */
  lo: number;
  hi: number;
  tier: number;
  boss: boolean;
  /** Who takes the 承's first statement (the second statement of the call). */
  second: BattleVoice;
  /** Who answers the 笛 in the 转. */
  answer: BattleVoice;
  /** Who leads. */
  lead: BattleVoice;
}

/** Split a head into its two bars. */
function headBars(h: Head): [{ degs: number[]; beats: number[] }, { degs: number[]; beats: number[] }] {
  let acc = 0, k = 0;
  while (k < h.beats.length && acc < 4 - 1e-6) acc += h.beats[k++];
  return [{ degs: h.degs.slice(0, k), beats: h.beats.slice(0, k) }, { degs: h.degs.slice(k), beats: h.beats.slice(k) }];
}

/** Degrees for a bar of drive: steps toward `to`, 吐音 repeats on 16th pairs, upward 4th/5th leaps on strong beats. */
function walk(r: Rng, from: number, to: number, rh: number[], lo: number, hi: number, tu: number, rise: number): number[] {
  const out: number[] = [];
  let d = from, beat = 0, rep = 0;
  for (let i = 0; i < rh.length; i++) {
    const left = rh.length - i;
    const need = to - d;
    let s: number;
    const six = rh[i] <= 0.25 + 1e-6;
    const strong = Math.abs(beat - Math.round(beat)) < 1e-6;
    if (i > 0 && six && rep < 3 && r.chance(tu)) s = 0; // 吐音: tongue the same note again
    else if (strong && i < rh.length - 1 && d + 3 <= hi && need >= -1 && r.chance(rise)) s = r.pick([2, 3]); // a 4th/5th up
    else if (Math.abs(need) >= left * 1.5) s = Math.sign(need) * 2;
    else if (need === 0) s = r.chance(0.5) ? 1 : -1;
    else s = r.chance(0.78) ? Math.sign(need) : -Math.sign(need);
    const nd = clamp(d + s, lo, hi);
    rep = nd === d ? rep + 1 : 0;
    d = nd;
    out.push(d);
    beat += rh[i];
  }
  return out;
}

/**
 * Compose one battle phrase (four bars; the first phrase of a theme opens with a bar of drums and the
 * pickup). Mutates `p`: notes, end, beats, cadence.
 */
function composeBattle(p: Phrase, r: Rng, plan: BattlePlan): BattleNote[] {
  const { head, tier } = plan;
  const [bar1, bar2] = headBars(head);
  const hHi = Math.max(...head.degs);
  const { lo, hi } = plan;
  const half = halfCadence(p.mode.final);
  const out: BattleNote[] = [];
  let b = 0;
  const put = (deg: number, dur: number, v: BattleVoice, x: Partial<BattleNote> = {}) => {
    out.push({ beat: b, dur, deg, vel: 0.8, v, ...x });
    b += dur;
  };
  const lastDeg = () => (out.length ? out[out.length - 1].deg : head.degs[0]);
  const tuChance = 0.25 + 0.08 * tier;
  const rise = 0.28 + 0.04 * tier;
  const drive = (to: number, v: BattleVoice, rh = r.pick(DRIVE_BARS)) => {
    const ds = walk(r, lastDeg(), to, rh, lo, hi, tuChance, rise);
    rh.forEach((d, i) => put(ds[i], d, v, { tu: d <= 0.25 + 1e-6 && i > 0 && ds[i] === ds[i - 1] ? true : undefined }));
  };
  const statement = (bar: { degs: number[]; beats: number[] }, v: BattleVoice, shift = 0) => {
    if (Math.max(...bar.degs) + shift > hi) shift = 0; // a sequence up only while the flute has room
    bar.degs.forEach((d, i) => {
      const dur = bar.beats[i];
      const tu = dur <= 0.25 + 1e-6 && i > 0 && bar.degs[i - 1] === d;
      put(d + shift, dur, v, { tu: tu || undefined, hold: dur >= 1.5 || undefined });
    });
  };
  const nearest = (target: number) => nearestOctave(target, lastDeg(), lo, hi);
  // the next phrase's first note, and the 吐音 pickup a 4th below it
  const nextRole = ROLE_ORDER[(p.index + 1) % 4];
  const zStart = hHi - 1;
  const nextStart = nextRole === 'zhuan' ? zStart : head.degs[0];
  const pickup = (v: BattleVoice) => {
    const d = pickupDeg(nextStart, lo, hi);
    put(d, 0.25, v, { tu: true, pick: true }); put(d, 0.25, v, { tu: true, pick: true }); put(d, 0.5, v, { tu: true, pick: true });
  };
  /** Approach (1 beat), a 2-beat hold on the cadence degree, the pickup. */
  const cadenceBar = (target: number, v: BattleVoice) => {
    const t = nearest(target);
    const from = lastDeg();
    const dir = Math.sign(t - from) || -1;
    const ap = r.pick([[0.5, 0.5], [0.75, 0.25], [0.25, 0.25, 0.5]]);
    ap.forEach((d, i) => put(clamp(t - dir * (ap.length - i), lo, hi), d, v));
    put(t, 2, v, { cad: true, hold: true });
    pickup(plan.lead);
  };
  const L = plan.lead;
  const dev = p.period % 3; // the call returns each period; its second bar develops with the periods
  switch (p.role) {
    case 'qi': {
      statement(bar1, L);
      statement(bar2, L, dev === 2 ? 1 : 0);
      drive(half + 2, L);
      cadenceBar(half, L);
      break;
    }
    case 'cheng': {
      // the second statement (箫 in 湖 and 林): the call sequenced a step up (while the flute has room),
      // its second bar moved and back at pitch
      statement(bar1, plan.second, 1);
      const moved = { degs: bar2.degs.map((d, i) => (i > 0 && i < bar2.degs.length - 1 && r.chance(0.4) ? clamp(d + r.pick([-1, 1]), lo, hi) : d)), beats: bar2.beats };
      statement(moved, plan.second, dev === 1 ? 1 : 0);
      drive(r.pick([1, half]) + 2, L, r.pick([DRIVE_BARS[1], DRIVE_BARS[3], DRIVE_BARS[4]]));
      cadenceBar(r.pick([1, half]), L);
      break;
    }
    case 'zhuan': {
      // call and response in 2-beat cells, sequenced upward; a 历音 run into the climax; down to the cadence
      let d = zStart;
      for (let k = 0; k < 2; k++) {
        const cell = r.pick(CALL_CELLS);
        const degs = cell.map((_, i) => (i < cell.length - 2 ? d : i === cell.length - 2 ? d + 1 : d + r.pick([2, 3])));
        cell.forEach((dur, i) => put(clamp(degs[i], lo, hi), dur, L, { tu: i > 0 && degs[i] === degs[i - 1] && dur <= 0.5 ? true : undefined }));
        const resp = r.pick([[0.75, 0.25, 1], [0.5, 0.5, 1], [0.25, 0.25, 0.5, 1]]);
        const top = clamp(degs[degs.length - 1], lo, hi);
        resp.forEach((dur, i) => put(clamp(top - 2 - (i === resp.length - 1 ? 1 : i % 2), lo, hi), dur, plan.answer));
        d += 1;
      }
      const peak = Math.min(hi, zStart + 3);
      [4, 3, 2, 1].forEach((k) => put(clamp(peak - k, lo, hi), 0.25, L));
      put(peak, 3, L, { climax: true, hold: true });
      [1, 2, 3, 4].forEach((k) => put(clamp(peak - k, lo, hi), 0.25, L));
      put(nearest(r.pick([2, 4, 1])), 2, L, { cad: true, hold: true });
      pickup(L);
      break;
    }
    case 'he': {
      // the call's first bar, a rising drive, and the heroic cadence rising into the final, held
      statement(bar1, L);
      const fin = nearestOctave(0, hHi, lo, hi);
      drive(fin - 3, L);
      put(clamp(fin - 2, lo, hi), 1, L);
      put(clamp(fin - 1, lo, hi), 1, L);
      put(fin, 5, L, { cad: true, hold: true, climax: true });
      pickup(L);
      break;
    }
  }
  // velocity: strong beats lean, 吐音 alternates T/K, the climax peaks; each layer adds a little
  let prev: BattleNote | undefined;
  for (const n of out) {
    const onBeat = Math.abs(n.beat - Math.round(n.beat)) < 1e-6;
    let v = onBeat && Math.round(n.beat) % 2 === 0 ? 0.86 : onBeat ? 0.8 : 0.74;
    if (n.tu) v = Math.round(n.beat * 4) % 2 === 0 ? 0.92 : 0.76;
    if (n.climax) v = 1;
    else if (n.hold) v = Math.max(v, 0.88);
    n.vel = clamp((v + 0.025 * tier) * r.range(0.96, 1.03), 0.3, 1);
    if (prev && n.deg - prev.deg >= 2) n.leap = true;
    prev = n;
  }
  return out;
}

const ROLE_ORDER = ['qi', 'cheng', 'zhuan', 'he'] as const;

interface Battle { notes: BattleNote[]; tier: number; lead: number; intro: boolean }
let lastBpm = 140;
/** The tempo of the last battle phrase composed (the cues play in the band's 16ths). */
export const mirrorBpm = () => lastBpm;
/** The battle tune of each composed phrase, kept for its arrangement (the Conductor holds the Phrase). */
const BATTLE = new WeakMap<Phrase, Battle>();

/** Shape a battle phrase: the tempo, the tune, four whole bars (a fifth — the drum fill — first). */
function shapeBattle(p: Phrase, r: Rng, boss: boolean): void {
  const col = mm.colour;
  const tier = boss ? mirrorBossStep() : mirrorTier(p);
  const style = (boss ? MIRROR_BOSS_STYLE : MIRROR_STYLE)[col];
  const bpm = boss ? between(p.bpm, style.bpm) + 3 * Math.min(2, tier) : between(p.bpm, style.bpm) * (tier >= 4 ? 1.04 : 1);
  p.bpm = Math.round(Math.min(MIRROR_MAX_BPM, bpm));
  lastBpm = p.bpm;
  const head = boss ? BOSS_HEAD[col] : waveHead(col, mm.wave);
  // the lead's octave: the head's middle pitch nearest the colour's register; the tune keeps inside
  // the lead's range there (a 曲笛/梆笛 G4–E6, a 唢呐 D4–C6) and never below the call itself
  const reg = (boss ? BOSS_REG : LEAD_REG)[col];
  const pitches = head.degs.map((d) => degreeToMidi(p.mode, d)).sort((a, b) => a - b);
  let lead = Math.round((reg - pitches[pitches.length >> 1]) / 12);
  const [pLo, pHi] = boss ? [62, 84] : [67, 88];
  // …and the call itself inside that range (a call whose middle sits low would drop out of the flute's compass)
  if (pitches[0] + 12 * lead < pLo && pitches[pitches.length - 1] + 12 * (lead + 1) <= pHi) lead++;
  else if (pitches[pitches.length - 1] + 12 * lead > pHi && pitches[0] + 12 * (lead - 1) >= pLo) lead--;
  let lo = Math.min(...head.degs) - 2, hi = Math.max(...head.degs) + 3;
  while (degreeToMidi(p.mode, lo) + 12 * lead < pLo && lo < Math.min(...head.degs)) lo++;
  while (degreeToMidi(p.mode, hi) + 12 * lead > pHi && hi > Math.max(...head.degs)) hi--;
  const plan: BattlePlan = boss
    ? { head, lo, hi, tier: 2 + Math.min(2, tier), boss, lead: 'suona', second: 'suona', answer: tier >= 1 ? 'dizi' : 'xiao' }
    : { head, lo, hi, tier, boss, lead: 'dizi', second: col === 'palace' ? 'dizi' : 'xiao', answer: col === 'forest' ? (tier >= 1 ? 'suona' : 'xiao') : tier >= 3 ? 'suona' : 'xiao' };
  const notes = composeBattle(p, r, plan);
  const intro = p.index === 0;
  if (intro) {
    // a bar of drums first; the lead's 吐音 pickup sits in its last beat
    for (const n of notes) n.beat += 4;
    const d = pickupDeg(head.degs[0], lo, hi);
    notes.unshift(
      { beat: 3, dur: 0.25, deg: d, vel: 0.84, v: plan.lead, tu: true, pick: true },
      { beat: 3.25, dur: 0.25, deg: d, vel: 0.72, v: plan.lead, tu: true, pick: true },
      { beat: 3.5, dur: 0.5, deg: d, vel: 0.86, v: plan.lead, tu: true, pick: true },
    );
  }
  p.notes = notes;
  const cad = [...notes].reverse().find((n) => n.cad) ?? notes[notes.length - 1];
  p.end = Math.max(...notes.filter((n) => !n.pick).map((n) => n.beat + n.dur));
  p.beats = 16 + (intro ? 4 : 0);
  p.cadence = cad.deg;
  BATTLE.set(p, { notes, tier, lead, intro });
}

// ---------------------------------------------------------------------------
// The battle band

/** The octave that puts the median of `notes` (degrees + `shift`) nearest `target` (each wind in its own register). */
function octNear(c: Ctx, notes: readonly MNote[], target: number, shift = 0): number {
  if (!notes.length) return 0;
  const ms = notes.map((n) => midiOf(c, n.deg + shift, 0)).sort((a, b) => a - b);
  return Math.round((target - ms[ms.length >> 1]) / 12);
}
/** Where the supporting voices sit (median MIDI): the 箫 low and hollow (but its second harmonic above ≈ 800 Hz,
 *  where a phone still plays it), the 二胡 under the 笛, the 唢呐 below it; the 笛's answers in its singing
 *  register (G5–A5), never its shrill top. */
const REG = { xiao: 68, erhu: 67, suona: 71, sheng: 62, diziAns: 79, bossDizi: 78, bossXiao: 67 } as const;
/** The battle 笛's ceiling (E6): above it a band flute turns shrill. */
export const DIZI_TOP = 88;
/** `oct`, lowered by octaves until the line's top note (degrees + `shift`) is at most the 笛's ceiling. */
function diziOct(c: Ctx, notes: readonly MNote[], oct: number, shift = 0): number {
  if (!notes.length) return oct;
  const top = Math.max(...notes.map((n) => midiOf(c, n.deg + shift, oct)));
  return top > DIZI_TOP ? oct - Math.ceil((top - DIZI_TOP) / 12) : oct;
}

/** A wind line of the battle score (the loud voices), with its ornaments. */
function battleLine(c: Ctx, inst: LineInst, notes: BattleNote[], oct: number, o: {
  gain: number; pan: number; send: number; echo?: number; prio?: 0 | 1 | 2;
  /** Chance of a 叠音 / 打音 / 颤音 on a fitting note. */
  orn?: number;
  /** 花舌 on the climaxes (and the 合's held final). */
  flutter?: boolean;
  /** 上滑音 into long notes (cents). */
  scoop?: number;
  slide?: number;
  degShift?: number;
}): MusicEvent | null {
  if (!notes.length) return null;
  const r = c.r, sh = o.degShift ?? 0;
  if (inst === 'dizi') oct = diziOct(c, notes, oct, sh); // never above E6
  const t0 = secOf(c, notes[0].beat);
  const ln: LineNote[] = notes.map((n, i) => {
    const prev = notes[i - 1];
    const m = midiOf(c, n.deg + sh, oct);
    const secs = secOf(c, n.dur);
    const dur = n.tu ? secs * 0.62 : n.hold ? secs * 0.97 : n.dur >= 0.5 ? secs * 0.84 : secs * 0.8;
    const x: LineNote = { t: secOf(c, n.beat) - t0, dur, freq: hz(m), vel: n.vel };
    if (n.tu) x.tongue = true;
    const onBeat = Math.abs(n.beat - Math.round(n.beat)) < 1e-6;
    const orn = o.orn ?? 0;
    if (n.leap && prev && n.deg > prev.deg && secs > 0.18 && r.chance(0.55)) { x.grace = hz(midiOf(c, n.deg + sh + 1, oct)); x.graceLen = 0.05; }
    else if (onBeat && !n.tu && n.dur >= 0.5 && !n.hold && r.chance(orn)) { x.grace = hz(midiOf(c, n.deg + sh + 1, oct)); x.graceLen = 0.032; } // 叠音
    else if (prev && !n.tu && Math.abs(n.deg - prev.deg) === 1 && r.chance(o.slide ?? 0)) x.slide = true;
    if (n.hold && o.flutter && (n.climax || (n.cad && n.dur >= 2))) x.flutter = n.climax ? 0.75 : 0.55;
    else if (n.hold && secs > 0.5 && r.chance(orn)) {
      if (n.cad && r.chance(0.5)) x.trill = hz(midiOf(c, n.deg + sh + 1, oct)); // 颤音
      else x.tap = { at: secs * r.range(0.4, 0.6), freq: hz(midiOf(c, n.deg + sh - 1, oct)) }; // 打音
    }
    if (o.scoop && n.dur >= 1 && !n.tu) x.scoop = o.scoop;
    x.vib = secs < 0.4 ? 0.15 : n.hold ? 1.25 : 0.8;
    return x;
  });
  return {
    t: t0, inst, job: { op: 'line', inst, notes: ln, seed: nextSeed(c), loud: true },
    gain: o.gain, pan: o.pan, send: o.send, echo: o.echo ?? 0, prio: o.prio ?? 0,
    dur: ln[ln.length - 1].t + ln[ln.length - 1].dur + 0.3,
    notes: ln.map((n) => ({ t: n.t, dur: n.dur, midi: 69 + 12 * Math.log2(n.freq / 440) })),
  };
}

/**
 * The answers: while one wind holds a note, another echoes the figure before it (a 4th lower for the
 * 箫, a 4th higher for the 笛) — call and response inside every phrase.
 */
function answers(notes: BattleNote[], by: (holder: BattleVoice) => BattleVoice | null): Map<BattleVoice, BattleNote[]> {
  const out = new Map<BattleVoice, BattleNote[]>();
  notes.forEach((h, i) => {
    if (!h.hold || h.dur < 2 || h.climax) return;
    const who = by(h.v);
    if (!who) return;
    const before = notes.slice(Math.max(0, i - 3), i).filter((n) => n.v === h.v);
    if (before.length < 2) return;
    const shift = who === 'dizi' ? 2 : -2;
    const rh = h.dur >= 3 ? [0.75, 0.25, 0.5, 0.5, 1] : [0.5, 0.5, 0.5];
    const src = [...before.map((n) => n.deg), h.deg];
    let b = h.beat + 0.5;
    const list = out.get(who) ?? [];
    rh.forEach((d, k) => {
      list.push({ beat: b, dur: d, deg: src[Math.min(src.length - 1, k)] + shift, vel: 0.72 + (k === 0 ? 0.08 : 0), v: who, hold: k === rh.length - 1 && d >= 1 ? true : undefined });
      b += d;
    });
    out.set(who, list);
  });
  return out;
}

/** Percussion collected for one phrase and mixed into a single stereo buffer (a single voice). */
class Kit {
  readonly hits: KitHit[] = [];
  constructor(private c: Ctx, private g = 1) {}
  at(kind: KitKind, beat: number, gain: number, pan: number) {
    const { p, r } = this.c;
    if (beat < -1e-6 || beat >= p.beats - 1e-6) return;
    const rate = (kind === 'bang' ? 1.85 : 1) * (1 + (r() - 0.5) * 0.03);
    this.hits.push({ t: Math.max(0, secOf(this.c, beat) + (r() - 0.5) * 0.006), kind, gain: clamp(this.g * gain * (0.92 + r() * 0.16), 0.01, 1.2), pan, v: r.int(1, 3), rate });
  }
  event(send = 0.12): MusicEvent {
    const c = this.c;
    return {
      t: 0, inst: 'drum', job: { op: 'kit', hits: this.hits.slice().sort((a, b) => a.t - b.t), hard: true },
      gain: 1, pan: 0, send, echo: 0, prio: 0, dur: phraseSec(c) + 1.4,
    };
  }
}

interface BattleDrums { tier: number; intro?: 'fill' | 'roll'; boss?: boolean; toms?: boolean; gain?: number }

/**
 * The war drums over the whole phrase: 大鼓 on 1 and 3 (the pulse) with pickups, the 堂鼓 backbeat,
 * 板 on the off-beats, 梆子 pushing into the backbeat, 小锣, fills into the next phrase; 钹 and 大锣
 * on the turns (separate voices: they ring into the reverb).
 */
function battleDrums(c: Ctx, o: BattleDrums): MusicEvent[] {
  const { p } = c;
  const tier = o.tier, boss = !!o.boss;
  // each layer leans in a little harder (the tight last 10 s ≈ +2 dB over the first layer)
  const kit = new Kit(c, (o.gain ?? 1) * (1 + 0.06 * Math.min(4, tier)));
  const bars = Math.round(p.beats / 4);
  const intro = !!o.intro && p.index === 0;
  for (let b = 0; b < bars; b++) {
    const b0 = b * 4, last = b === bars - 1;
    if (intro && b === 0) {
      if (o.intro === 'fill') {
        // 咚 咚 哒哒哒哒哒哒哒哒 | 仓 — into the wave (the lead's pickup rides the roll's last beat)
        kit.at('big', 0, 0.72, -0.1); kit.at('big', 1, 0.66, -0.1); // at least a downbeat's weight
        for (let k = 0; k < 8; k++) kit.at('tang', 2 + k * 0.25, 0.2 + 0.045 * k, -0.3 + 0.08 * k);
      } else {
        // the boss: a roll swelling for a whole bar — 大鼓 on the 8ths, 堂鼓 between
        for (let k = 0; k < 8; k++) { kit.at('big', k * 0.5, 0.26 + 0.05 * k, -0.1); kit.at('tang', k * 0.5 + 0.25, 0.14 + 0.04 * k, 0.2); }
      }
      continue;
    }
    // 大鼓: 1 and 3; the and-of-4 pickup; war drums (a boss, tight) push the and-of-2 too
    kit.at('big', b0, 0.72, -0.1); kit.at('big', b0 + 2, 0.6, -0.1); // (the harder knock takes body: a little more stick)
    if (tier >= 1 || boss) kit.at('big', b0 + 3.5, 0.34, -0.1);
    if (tier >= 4 || boss || (tier >= 3 && b % 2 === 1)) kit.at('big', b0 + 1.5, 0.32, -0.1);
    if (boss && tier >= 3) { kit.at('big', b0 + 1, 0.3, -0.1); kit.at('big', b0 + 3, 0.34, -0.1); }
    // 堂鼓 backbeat (the phone hears it), ghost 16ths from tier 2
    kit.at('tang', b0 + 1, 0.78, 0.15); kit.at('tang', b0 + 3, 0.78, 0.15);
    if ((tier >= 2 || boss) && b % 2 === 1 && !last) { kit.at('tang', b0 + 2.75, 0.16, 0.22); kit.at('tang', b0 + 3.25, 0.13, 0.22); }
    if (o.toms) { kit.at('tang', b0 + 2.5, 0.54, -0.35); kit.at('tang', b0 + 3.75, 0.44, -0.35); }
    // 板 on every off-beat; tight and in a boss's heat, the 16ths between
    for (const k of [0.5, 1.5, 2.5, 3.5]) kit.at('rim', b0 + k, 0.66, 0.3);
    if (tier >= 4 || (boss && tier >= 3)) for (const k of [0.25, 1.25, 2.25, 3.25]) kit.at('rim', b0 + k, 0.2, 0.38);
    // 梆子: a 16th before each backbeat
    if (tier >= 1 || boss) { kit.at('bang', b0 + 0.75, 0.54, 0.45); kit.at('bang', b0 + 2.75, 0.54, 0.45); }
    // 小锣 (才) on 3 from tier 3; on 1 too in a boss's later phases
    if (tier >= 3 || boss) kit.at('xiaoluo', b0 + 3, 0.065, 0.42);
    if (boss && tier >= 3) kit.at('xiaoluo', b0 + 1, 0.05, 0.42);
    // into the next phrase: a 堂鼓 fill under the pickup (a boss: 大鼓 and 堂鼓 alternating)
    if (last) for (let k = 1; k < 4; k++) kit.at(boss && k === 2 ? 'big' : 'tang', b0 + 3 + k * 0.25, 0.2 + 0.07 * k, -0.25 + 0.12 * k);
  }
  const ev: MusicEvent[] = [kit.event()];
  // phrase turns: 钹 on the first downbeat, the 大锣 opening each period (every phrase when tight or
  // in a boss's later phases), and after the intro bar
  const first = intro ? 4 : 0;
  if (first < p.beats) {
    ev.push(hit(c, 'bo', secOf(c, first), 0.24, { pan: 0.3, send: 0.2, prio: 1 }));
    const turn = p.role === 'qi' || tier >= 4 || (boss && tier >= 3) || ((tier >= 3 || boss) && p.role === 'zhuan');
    if (turn || intro) ev.push(hit(c, 'daluo', secOf(c, first), intro ? 0.3 : 0.24, { pan: 0.05, send: 0.25, prio: 1 }));
  }
  return ev;
}

/** 琵琶 扫弦 (four-string strums) as rhythm: on 1, then the and-of-2, then 3 and 4 as the tiers rise. */
function strums(c: Ctx, tier: number, o: { gain: number; from: number }): MusicEvent[] {
  const { p } = c;
  const oct = octFor(p, 52);
  const at = tier >= 4 ? [0, 1.5, 2.5, 3, 3.5] : tier >= 3 ? [0, 1.5, 2.5] : tier >= 2 ? [0, 1.5] : [0];
  const raw: { beat: number; dur: number; midi: number; vel: number }[] = [];
  for (let b0 = o.from; b0 < p.beats - 1e-6; b0 += 4) {
    const root = rootAt(p, b0);
    for (const k of at) {
      const vel = k === 0 ? 0.9 : 0.7;
      [0, 3, 5, 7].forEach((d, i) => raw.push({ beat: b0 + k + (i * 0.012) / c.spb, dur: 0.5, midi: midiOf(c, root + d, oct), vel: vel * (1 - i * 0.07) }));
    }
  }
  const ev = plucks(c, 'pipa', raw.filter((n) => n.beat < p.beats - 1e-6), { gain: o.gain, send: 0.12, spread: 0.3, center: 0.3, prio: 1, humanize: 0.003 });
  for (const e of ev) if (e.job.op === 'pluck') e.job.tone = 'battle';
  return ev;
}

/** 低音古筝: a damped gallop on the root (8th, two 16ths), the fifth on 2 — rhythm under the winds. */
function gallop(c: Ctx, o: { gain: number; from: number }): MusicEvent[] {
  const { p } = c;
  const oct = octFor(p, 43);
  const A: [number, number, number][] = [[0, 0, 1], [0.5, 0, 0.5], [0.75, 0, 0.6], [1, 3, 0.8], [2, 0, 0.9], [2.5, 0, 0.5], [2.75, 0, 0.6], [3, 2, 0.8]];
  const raw: { beat: number; dur: number; midi: number; vel: number }[] = [];
  for (let b0 = o.from; b0 < p.beats - 1e-6; b0 += 4) {
    const root = rootAt(p, b0);
    for (const [k, d, v] of A) raw.push({ beat: b0 + k, dur: 0.5, midi: midiOf(c, root + d, oct), vel: v * 0.8 });
  }
  const ev = plucks(c, 'zheng', raw, { gain: o.gain, send: 0.08, spread: 0.12, center: -0.2, prio: 1, humanize: 0.004 });
  for (const e of ev) if (e.job.op === 'pluck') { e.job.tone = 'battle'; for (const n of e.job.notes) n.ring = 0.3; }
  return ev;
}

/** 二胡: a counterline a 4th/3rd under the tune's strong notes, long and sliding (or 快弓 on the root). */
function erhuLine(c: Ctx, notes: BattleNote[], oct: number, o: { gain: number; kuai?: boolean; from: number }): MusicEvent | null {
  const { p } = c;
  const src: BattleNote[] = [];
  for (let b = o.from; b < p.beats - 1e-6; b += 2) {
    const under = notes.filter((n) => n.beat <= b + 1e-6 && !n.pick).pop();
    if (!under) continue;
    src.push({ beat: b, dur: 1.9, deg: under.deg - 2, vel: 0.72, v: 'dizi' });
  }
  if (o.kuai) {
    // 快弓: the root re-bowed in 16ths through the 转's second half
    const root = rootAt(p, 8 + o.from);
    for (let b = 8 + o.from; b < 12 + o.from; b += 0.25) src.push({ beat: b, dur: 0.25, deg: root, vel: b % 1 === 0 ? 0.85 : 0.65, v: 'dizi', tu: true });
    src.sort((a, b) => a.beat - b.beat);
    for (let i = src.length - 1; i > 0; i--) if (src[i].beat < src[i - 1].beat + src[i - 1].dur - 1e-6 && !src[i - 1].tu) src[i - 1].dur = src[i].beat - src[i - 1].beat;
  }
  return battleLine(c, 'erhu', src.filter((n) => n.dur > 0.05), oct, { gain: o.gain, pan: -0.3, send: 0.2, prio: 1, slide: 0.5, orn: 0 });
}

/** 笙 stabs: short tongued chords on the off-beats (cached per chord). */
function shengStabs(c: Ctx, oct: number, o: { gain: number; from: number; at: number[] }): MusicEvent[] {
  const { p } = c;
  const ev: MusicEvent[] = [];
  for (let b0 = o.from; b0 < p.beats - 1e-6; b0 += 4) {
    for (const k of o.at) {
      const root = midiOf(c, rootAt(p, b0 + k), oct);
      const fifth = inMode(p.mode, root + 7) ? root + 7 : root + 5;
      const tones = [root, fifth, root + 12];
      const t = secOf(c, b0 + k);
      ev.push({
        t, inst: 'sheng', job: { op: 'sheng', freqs: tones.map(hz), dur: 0.26, vel: 0.8, seed: 7, air: 0.2, stab: true },
        key: `sheng:stab:${root}`, gain: o.gain, pan: 0, send: 0.14, echo: 0, prio: 2, dur: 0.26,
        notes: tones.map((m) => ({ t: 0, dur: 0.26, midi: m })),
      });
    }
  }
  return ev;
}

const mirror: ThemeSpec = {
  get level() { return MIRROR_LEVEL[mm.colour]; },
  get style() { return MIRROR_STYLE[mm.colour]; },
  fadeIn: 0.05,
  epoch: mirrorEpoch,
  shape(p, r) { shapeBattle(p, r ?? makeRng(p.index + 1), false); },
  arrange(c) {
    const { p } = c;
    const bt = BATTLE.get(p);
    if (!bt) return [];
    const { notes, tier, lead: o } = bt;
    const col = mm.colour;
    const ev: MusicEvent[] = [];
    const from = bt.intro ? 4 : 0;
    ev.push(...battleDrums(c, { tier, intro: 'fill', toms: col === 'forest' }));
    // the winds: the 笛 leads; the 箫 (an octave below) takes the second statement; the 唢呐 answers
    const orn = 0.22 + 0.07 * tier;
    const flutter = tier >= 3;
    const by = (v: BattleVoice) => notes.filter((n) => n.v === v);
    // (the first layers leave the war drums room on a phone's small speaker)
    const dizi = battleLine(c, 'dizi', by('dizi'), o, { gain: tier <= 1 ? 0.6 : 0.66 + 0.02 * tier, pan: 0.1, send: 0.16, echo: col === 'lake' ? 0.12 : 0.05, orn, flutter });
    const xiao = battleLine(c, 'xiao', by('xiao'), octNear(c, by('xiao'), REG.xiao), { gain: 0.78, pan: -0.25, send: 0.3, orn: orn * 0.7, slide: 0.25, echo: col === 'lake' ? 0.1 : 0 });
    const suona = battleLine(c, 'suona', by('suona'), octNear(c, by('suona'), REG.suona), { gain: 0.5, pan: 0.05, send: 0.18, orn, scoop: 90 });
    ev.push(...[dizi, xiao, suona].filter(notNull));
    // answers inside the holds: the 箫 under the 笛, the 笛 over the 箫 and the 唢呐
    const ans = answers(notes, (v) => (v === 'dizi' ? 'xiao' : 'dizi'));
    const ax = ans.get('xiao'), ad = ans.get('dizi');
    if (ax) ev.push(...[battleLine(c, 'xiao', ax, octNear(c, ax, REG.xiao), { gain: col === 'lake' ? 0.66 : 0.56, pan: -0.3, send: 0.32, prio: 1, slide: 0.3, echo: col === 'lake' ? 0.12 : 0 })].filter(notNull));
    if (ad) ev.push(...[battleLine(c, 'dizi', ad, octNear(c, ad, REG.diziAns), { gain: 0.46, pan: 0.25, send: 0.2, prio: 1, echo: 0.08 })].filter(notNull));
    // tight (or pushed by danger into it): the 唢呐 doubles the whole tune an octave below the 笛
    // (always the octave: in unison it would beat against the lead and bury it) — below the octave
    // the 笛 actually plays, which battleLine lowers when the tune would pass E6
    if (tier >= 4) {
      const dbl = notes.filter((n) => n.v === 'dizi' && !n.pick).map((n) => ({ ...n, v: 'suona' as const }));
      ev.push(...[battleLine(c, 'suona', dbl, diziOct(c, by('dizi'), o) - 1, { gain: 0.4, pan: -0.08, send: 0.18, prio: 1, scoop: 70 })].filter(notNull));
    }
    if (tier >= 4 || (tier >= 2 && (p.role === 'cheng' || p.role === 'he'))) {
      // 支声: the 箫 doubles the 笛's long notes an octave below (in every phrase of the climax)
      const long = notes.filter((n) => n.v === 'dizi' && n.dur >= 1 && !n.pick);
      if (long.length) ev.push(...[battleLine(c, 'xiao', long, octNear(c, long, REG.xiao), { gain: tier >= 4 ? 0.52 : 0.46, pan: -0.2, send: 0.3, prio: 1 })].filter(notNull));
    }
    // support: 笙 (pad, then stabs), 二胡 counterline
    const sh = octFor(p, REG.sheng) + (col === 'palace' ? 1 : 0); // the palace's 笙 voiced high
    if (tier >= 1) ev.push(pad(c, p.role === 'zhuan' ? halfCadence(p.mode.final) : 0, sh, { gain: 0.13, send: 0.35, vel: 0.62, air: 0.4, overlap: 1.5, start: secOf(c, from) }));
    if (tier >= 3) ev.push(...shengStabs(c, sh, { gain: col === 'palace' ? 0.2 : 0.16, from, at: tier >= 4 ? [0.5, 1.5, 2.5, 3.5] : [1.5, 3.5] }));
    if (tier >= 2 || (col === 'forest' && tier >= 1)) {
      const x = erhuLine(c, notes, octNear(c, notes, REG.erhu, -2), { gain: 0.3, kuai: tier >= 3 && p.role === 'zhuan', from });
      if (x) ev.push(x);
    }
    // rhythm: 琵琶 strums, then the 低音古筝 gallop (plucks keep the time, never the tune)
    ev.push(...strums(c, tier, { gain: col === 'forest' && tier < 4 ? 0.3 : 0.26, from }));
    if (tier >= 2) ev.push(...gallop(c, { gain: 0.24, from }));
    // 编钟 on the palace's strong notes; 刮奏 into the lake's periods
    if (col === 'palace' && tier >= 1) ev.push(...bells(c, notes.filter((n) => !n.pick && n.v === 'dizi' && (n.hold || (Math.abs(n.beat - Math.round(n.beat)) < 1e-6 && Math.round(n.beat) % 4 === 0))), o, 0.2, 2));
    if (col === 'lake' && tier >= 1 && p.role === 'qi' && !bt.intro) {
      const g = gliss(c, 0, -3, 7, 0.45, octFor(p, 62), { gain: 0.16, send: 0.3, echo: 0.15 });
      for (const e of g) if (e.job.op === 'pluck') e.job.tone = 'battle';
      ev.push(...g);
    }
    return ev;
  },
};

const mirrorBoss: ThemeSpec = {
  get level() { return MIRROR_BOSS_LEVEL[mm.colour]; },
  get style() { return MIRROR_BOSS_STYLE[mm.colour]; },
  fadeIn: 0.05,
  epoch: mirrorEpoch,
  shape(p, r) { shapeBattle(p, r ?? makeRng(p.index + 1), true); },
  arrange(c) {
    const { p } = c;
    const bt = BATTLE.get(p);
    if (!bt) return [];
    const { notes, lead: o } = bt;
    const step = mirrorBossStep();
    const col = mm.colour;
    const ev: MusicEvent[] = [];
    const from = bt.intro ? 4 : 0;
    ev.push(...battleDrums(c, { tier: 2 + Math.min(2, step), intro: 'roll', boss: true, toms: col === 'forest', gain: 1.05 }));
    const by = (v: BattleVoice) => notes.filter((n) => n.v === v);
    // the 唢呐 leads (scoops, a wide vibrato); the 箫 takes the second statement, low
    const suona = battleLine(c, 'suona', by('suona'), o, { gain: 0.7, pan: 0.05, send: 0.2, orn: 0.3, scoop: 110, flutter: false });
    const xiao = battleLine(c, 'xiao', by('xiao'), octNear(c, by('xiao'), REG.bossXiao), { gain: 0.78, pan: -0.25, send: 0.3, orn: 0.2, slide: 0.3 });
    const dz = battleLine(c, 'dizi', by('dizi'), octNear(c, by('dizi'), REG.bossDizi), { gain: 0.5, pan: 0.2, send: 0.2, orn: 0.3, flutter: true });
    ev.push(...[suona, xiao, dz].filter(notNull));
    // the 箫 low and ominous under the long notes, in every phase; from phase 1 the 笛 above the 唢呐
    // (支声): a 4th over it, silent where that would climb past E6 (in unison it would bury the lead)
    const long = notes.filter((n) => n.v === 'suona' && n.dur >= 1 && !n.pick);
    if (long.length) ev.push(...[battleLine(c, 'xiao', long, octNear(c, long, REG.bossXiao), { gain: 0.5, pan: -0.3, send: 0.32, prio: 1 })].filter(notNull));
    if (step >= 1) {
      const het = notes.filter((n) => n.v === 'suona' && !n.pick && (n.dur >= 0.75 || Math.abs(n.beat - Math.round(n.beat)) < 1e-6 || step >= 2))
        .filter((n) => midiOf(c, n.deg + 2, o) <= DIZI_TOP)
        .map((n) => ({ ...n, deg: n.deg + 2, v: 'dizi' as const }));
      ev.push(...[battleLine(c, 'dizi', het, o, { gain: step >= 2 ? 0.5 : 0.42, pan: 0.25, send: 0.2, prio: 1, flutter: true, orn: 0.25, echo: col === 'lake' ? 0.1 : 0 })].filter(notNull));
    }
    // the answers in the holds: the 箫 under the 唢呐 in every phase, the 笛 over the 箫
    const ans = answers(notes, (v) => (v === 'suona' ? 'xiao' : v === 'xiao' ? 'dizi' : null));
    for (const [who, list] of ans) ev.push(...[battleLine(c, who, list, octNear(c, list, who === 'dizi' ? REG.bossDizi : REG.bossXiao), { gain: 0.5, pan: who === 'dizi' ? 0.25 : -0.3, send: 0.3, prio: 1 })].filter(notNull));
    // support: 笙 pad, then stabs; 二胡 (快弓 in the 转); 琵琶 strums, 古筝 gallop
    ev.push(pad(c, 0, octFor(p, REG.sheng), { gain: 0.13, send: 0.35, vel: 0.62, air: 0.3, overlap: 1.5, start: secOf(c, from) }));
    if (step >= 1) ev.push(...shengStabs(c, octFor(p, REG.sheng), { gain: 0.18, from, at: step >= 2 ? [0.5, 1.5, 2.5, 3.5] : [1.5, 3.5] }));
    if (step >= 1 || col === 'forest') { const x = erhuLine(c, notes, octNear(c, notes, REG.erhu, -2), { gain: 0.32, kuai: p.role === 'zhuan', from }); if (x) ev.push(x); }
    ev.push(...strums(c, 2 + Math.min(2, step), { gain: 0.26, from }));
    ev.push(...gallop(c, { gain: 0.26, from }));
    if (col === 'palace') ev.push(...bells(c, notes.filter((n) => !n.pick && n.hold), o, 0.22, 2));
    return ev;
  },
};

/** One-shots the mirror's audio plays on the music bus between phrases (music.cue). */
export type MirrorCue = 'clear' | 'danger' | 'phase';
/**
 * A cue in the band's time: `bpm` is the band's tempo, `at` the seconds from music.cue's start to the
 * band's next beat (music-player.ts bandBeat), so the roll runs in the band's 16ths and its accent
 * lands on the beat after. The drums are the battle kit's (the knock a phone can play).
 */
export function mirrorCue(kind: MirrorCue, seed = 1, bpm = 144, at = 0): MusicEvent[] {
  const ev = cueEvents(kind, seed, bpm);
  if (at > 0 && Number.isFinite(at)) for (const e of ev) e.t += at;
  return ev;
}

function cueEvents(kind: MirrorCue, seed: number, bpm: number): MusicEvent[] {
  const tempo = Math.round(clamp(Number.isFinite(bpm) ? bpm : 144, 128, MIRROR_MAX_BPM));
  const spb = 60 / tempo;
  const c = { p: { bpm: tempo, beats: 8, mode: M(62, 4) } as Phrase, r: makeRng(seed), spb, seed } as Ctx;
  if (kind === 'danger') {
    // the danger rises: a 堂鼓 roll in 16ths swelling into 大鼓 + 小锣 on the next beat — the band
    // leans in before its next phrase
    const ev = Array.from({ length: 4 }, (_, k) => hit(c, 'tang', k * 0.25 * spb, 0.34 + 0.09 * k, { pan: -0.2 + 0.1 * k, send: 0.12, prio: 1, hard: true }));
    ev.push(hit(c, 'xiaoluo', spb, 0.12, { pan: 0.35, send: 0.2, prio: 1 }), hit(c, 'big', spb, 0.6, { pan: -0.1, send: 0.15, prio: 1, hard: true }));
    return ev;
  }
  if (kind === 'phase') {
    // a boss phase: 大锣 and 大鼓 on the beat, and the 唢呐's two-note call — a tongued 8th pickup, a
    // 4th up onto the next beat, scooped
    const call: LineNote[] = [
      { t: 0, dur: 0.4 * spb, freq: hz(69), vel: 0.9, tongue: true, scoop: 80 },
      { t: 0.5 * spb, dur: 2.2 * spb, freq: hz(74), vel: 1, scoop: 120, vib: 1.3 },
    ];
    return [
      hit(c, 'daluo', 0, 0.32, { pan: 0.05, send: 0.25, prio: 1 }), hit(c, 'big', 0, 0.62, { pan: -0.1, send: 0.15, prio: 1, hard: true }),
      { t: 0.5 * spb, inst: 'suona', job: { op: 'line', inst: 'suona', notes: call, seed: 11, loud: true }, key: `cue:phase:suona:${tempo}`, gain: 0.5, pan: 0.05, send: 0.2, echo: 0, prio: 1, dur: 3 * spb + 0.3 },
    ];
  }
  // the wave is won: 仓! — 钹 and 大鼓 together, the cymbal choked by the hand (music.cue's choke)
  return [hit(c, 'bo', 0, 0.34, { pan: 0.15, send: 0.25, prio: 1 }), hit(c, 'big', 0, 0.6, { pan: -0.1, send: 0.2, prio: 1, hard: true })];
}

export const THEMES: Record<ThemeId, ThemeSpec> = {
  garden, village, lake, bamboo, plum, mountain, night, festival, hall, quiet, taoyuan,
  mirror, 'mirror-calm': mirrorCalm, 'mirror-boss': mirrorBoss,
};

/** Arrange one phrase of a theme (a theme may first reshape it: tempo, whole bars, its tune — the Conductor reads p afterwards). */
export function arrange(theme: ThemeId, p: Phrase, r: Rng, seed: number): MusicEvent[] {
  const spec = THEMES[theme];
  spec.shape?.(p, r);
  const c: Ctx = { p, r, spb: 60 / p.bpm, seed };
  return spec.arrange(c).filter((e) => e && Number.isFinite(e.t) && e.t >= 0);
}

/** Phrase length in seconds. */
export const phraseSeconds = (p: Phrase) => (p.beats * 60) / p.bpm;
