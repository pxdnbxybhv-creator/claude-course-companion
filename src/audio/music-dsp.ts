// Background music, part 2 — the instruments. Pure JS synthesis into Float32Arrays (no Web Audio),
// so the realtime engine (in its own worker, music-worker.ts) and the lab's OfflineAudioContext
// renders share exactly the same sound. The guqin, its harmonics, the 木鱼 and the bronze bell are
// the existing voices from dsp.ts; everything else is new:
//
//   古筝 guzheng  the qin's waveguide string, plucked near the bridge with a nail, brighter body;
//                 按音 bends and 颤音 vibrato move the string length; glissandi are many light plucks
//   琵琶 pipa     short, crisp waveguide plucks; 轮指 tremolo re-plucks one rendered note (each new
//                 pluck damps the ringing string), five fingers in a slightly uneven pattern
//   箫 / 笛 flutes band-limited wavetables blended soft→bright with the breath pressure, tracked
//                 breath noise through a resonant band-pass, 倚音 grace notes, portamento,
//                 delayed vibrato; the 笛 adds the buzz of its 笛膜 membrane
//   二胡 erhu     a bowed (sawtooth-like) spectrum through the resonances of the snakeskin body,
//                 揉弦 vibrato, slow slides, bow-change dips and bow noise
//   唢呐 suona    a reed spectrum with strong formants, played gently (low-passed, soft attack)
//   笙 sheng      free-reed pipes in fourths/fifths, paired and detuned left/right, slow swell, air
//   堂鼓 drum, 锣 gongs (大锣 falls in pitch, 小锣 rises), 钹 cymbals, 碰铃 bells — modal synthesis
//
// Whole phrases of a monophonic line (flute, erhu, suona) are rendered as one buffer, so legato,
// breath and slides are continuous; plucked phrases are mixed into one stereo buffer per layer.
// That keeps the number of live Web Audio voices tiny.
import { makeRng, type Rng } from '../core/rng';
import {
  TAU, addMode, addNoiseBurst, bandpass, clamp, fadeTail, filter, highpass, lowpass, peakOf, peaking, renderBell,
  renderHarmonic, renderIR, renderKnock, renderQin, scale, type Biquad, type QinNote,
} from './dsp';

export type LineInst = 'xiao' | 'dizi' | 'erhu' | 'suona';
export type PluckInst = 'zheng' | 'pipa' | 'qin';

export interface LineNote {
  /** Onset (s) from the start of the buffer. */
  t: number;
  dur: number;
  freq: number;
  /** 0..1 */
  vel: number;
  /** 倚音: a short grace note at this frequency before the main note. */
  grace?: number;
  /** Portamento from the previous note. */
  slide?: boolean;
  /** Vibrato depth multiplier (default 1; 0 = none). */
  vib?: number;
}

export interface PluckNote {
  t: number;
  freq: number;
  vel: number;
  /** -1..1 */
  pan?: number;
  /** 按音 / 上下: pitch moves after the pluck (cumulative cents reached at at+time). */
  bend?: { at: number; cents: number; time: number }[];
  /** 颤音 / 吟猱 vibrato. */
  vib?: boolean;
  /** 綽注 glide into the note (cents; negative = from below). */
  glide?: number;
  /** 轮指 tremolo length in seconds (pipa). */
  trem?: number;
  /** 泛音 harmonic (qin). */
  harm?: boolean;
  /** Ring length override (s). */
  ring?: number;
}

export type MusicJob =
  | { op: 'pluck'; inst: PluckInst; notes: PluckNote[]; seed: number }
  | { op: 'line'; inst: LineInst; notes: LineNote[]; seed: number }
  | { op: 'sheng'; freqs: number[]; dur: number; vel: number; seed: number; air?: number }
  | { op: 'drum'; kind: 'tang' | 'rim' | 'big'; seed: number }
  | { op: 'wood'; seed: number }
  | { op: 'gong'; kind: 'da' | 'xiao'; seed: number }
  | { op: 'ling'; freq: number; seed: number }
  | { op: 'temple'; freq: number; seed: number }
  | { op: 'bo'; seed: number }
  | { op: 'ir'; t60: number; secs: number; seed: number };

// ---------------------------------------------------------------------------
// Buffer cache for plain notes (no bends or vibrato) — the arpeggios reuse the same few dozen.

const CACHE_LIMIT = 6_000_000; // samples (~24 MB)
const cache = new Map<string, Float32Array>();
let cached = 0;
function memo(key: string, make: () => Float32Array): Float32Array {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // LRU order
  const x = make();
  cache.set(key, x);
  cached += x.length;
  for (const [k, v] of cache) {
    if (cached <= CACHE_LIMIT) break;
    cache.delete(k);
    cached -= v.length;
  }
  return x;
}
export const musicCacheSize = () => cached;

// ---------------------------------------------------------------------------
// Wavetables: band-limited single cycles, one per octave band so no partial passes 0.45·sr.

const TBL = 2048;
const BAND0 = 60;
const BANDS = 9; // 60 Hz … 15 kHz tops
const tables = new Map<string, Float32Array[]>();

function wavetables(key: string, sr: number, amp: (k: number) => number, maxK: number): Float32Array[] {
  const id = `${key}:${sr}`;
  const hit = tables.get(id);
  if (hit) return hit;
  const out: Float32Array[] = [];
  for (let b = 0; b < BANDS; b++) {
    const top = BAND0 * Math.pow(2, b);
    const K = Math.max(1, Math.min(maxK, Math.floor((0.45 * sr) / top)));
    const t = new Float32Array(TBL + 1);
    let e = 0;
    for (let k = 1; k <= K; k++) {
      const a = amp(k);
      if (!a) continue;
      e += a * a / 2;
      const ph = k * 0.37; // fixed partial phases (less peaky than all-sine)
      for (let i = 0; i < TBL; i++) t[i] += a * Math.sin((TAU * k * i) / TBL + ph);
    }
    const g = 0.5 / Math.sqrt(e || 1); // equal RMS in every band
    for (let i = 0; i < TBL; i++) t[i] *= g;
    t[TBL] = t[0];
    out.push(t);
  }
  tables.set(id, out);
  return out;
}
const bandFor = (f: number) => clamp(Math.ceil(Math.log2(Math.max(f, 1) / BAND0)), 0, BANDS - 1);

// ---------------------------------------------------------------------------
// Monophonic lines

interface LinePreset {
  soft: (k: number) => number;
  bright: (k: number) => number;
  maxK: number;
  atk: number;
  rel: number;
  /** Level an attack starts from when slurred (1 = no articulation), and when re-tongued/re-bowed. */
  slur: number;
  tongue: number;
  glide: number;
  vib: { cents: number; rate: number; delay: number; amp: number };
  /** Breath noise through a band-pass that tracks the pitch. */
  breath: number;
  breathQ: number;
  /** Broadband air/bow noise. */
  hiss: number;
  hissF: number;
  /** Membrane (笛膜) or reed buzz. */
  buzz: number;
  buzzF: number;
  /** Random pitch wander (cents). */
  jitter: number;
  /** Long notes swell like a bow stroke (erhu) or grow (flutes). */
  swell: number;
  eq: (sr: number) => Biquad[];
  /** Sustain RMS at velocity 1. */
  level: number;
}

const LINE: Record<LineInst, LinePreset> = {
  xiao: {
    soft: (k) => [0, 1, 0.07, 0.1, 0.02, 0.025][k] ?? 0,
    bright: (k) => [0, 1, 0.18, 0.28, 0.07, 0.1, 0.03, 0.035][k] ?? 0,
    maxK: 7, atk: 0.1, rel: 0.16, slur: 0.82, tongue: 0.25, glide: 0.1,
    vib: { cents: 13, rate: 4.6, delay: 0.32, amp: 0.1 },
    breath: 0.32, breathQ: 5, hiss: 0.045, hissF: 2200, buzz: 0, buzzF: 0, jitter: 3, swell: 0.12,
    eq: (sr) => [highpass(sr, 180, 0.7), peaking(sr, 420, 1, 2), lowpass(sr, 4200, 0.7)],
    level: 0.2,
  },
  dizi: {
    soft: (k) => [0, 1, 0.28, 0.32, 0.1, 0.12, 0.05, 0.05, 0.02][k] ?? 0,
    bright: (k) => [0, 1, 0.45, 0.55, 0.28, 0.3, 0.16, 0.16, 0.08, 0.08, 0.04, 0.04][k] ?? 0,
    maxK: 11, atk: 0.045, rel: 0.1, slur: 0.8, tongue: 0.2, glide: 0.06,
    vib: { cents: 16, rate: 5.6, delay: 0.24, amp: 0.08 },
    breath: 0.16, breathQ: 7, hiss: 0.05, hissF: 3800, buzz: 0.1, buzzF: 3600, jitter: 3, swell: 0.1,
    eq: (sr) => [highpass(sr, 320, 0.7), peaking(sr, 3200, 1.2, 2.5), lowpass(sr, 7500, 0.7)],
    level: 0.19,
  },
  erhu: {
    soft: (k) => 1 / Math.pow(k, 1.55),
    bright: (k) => 1 / Math.pow(k, 1.05),
    maxK: 40, atk: 0.11, rel: 0.2, slur: 0.9, tongue: 0.5, glide: 0.2,
    vib: { cents: 22, rate: 5.7, delay: 0.2, amp: 0.05 },
    breath: 0, breathQ: 1, hiss: 0.02, hissF: 3200, buzz: 0, buzzF: 0, jitter: 4, swell: 0.18,
    eq: (sr) => [highpass(sr, 190, 0.7), peaking(sr, 680, 1.3, 6), peaking(sr, 1500, 1.8, 4), peaking(sr, 2900, 2.4, 4.5), peaking(sr, 4800, 1.2, -5), lowpass(sr, 6500, 0.7)],
    level: 0.19,
  },
  suona: {
    soft: (k) => (k % 2 ? 1 : 0.7) / Math.pow(k, 1.2),
    bright: (k) => (k % 2 ? 1 : 0.8) / Math.pow(k, 0.85),
    maxK: 30, atk: 0.05, rel: 0.1, slur: 0.85, tongue: 0.3, glide: 0.12,
    vib: { cents: 18, rate: 6.1, delay: 0.16, amp: 0.06 },
    breath: 0.04, breathQ: 4, hiss: 0.02, hissF: 2600, buzz: 0.06, buzzF: 2200, jitter: 5, swell: 0.1,
    // played gently: the bell's formants, but the top rolled off
    eq: (sr) => [highpass(sr, 260, 0.7), peaking(sr, 1150, 1.4, 7), peaking(sr, 2500, 2, 4), lowpass(sr, 3400, 0.6)],
    level: 0.17,
  },
};

const smooth = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };

/** A whole phrase of a monophonic wind or bowed instrument. */
export function renderLine(sr: number, inst: LineInst, input: LineNote[], seed: number): Float32Array {
  const P = LINE[inst];
  const rng = makeRng(seed);
  const notes = input.filter((n) => n.dur > 0 && n.freq > 0).sort((a, b) => a.t - b.t);
  if (!notes.length) return new Float32Array(1);
  const endT = Math.max(...notes.map((n) => n.t + n.dur)) + P.rel * 3 + 0.2;
  const len = Math.ceil(endT * sr);
  const step = 32;
  const m = Math.ceil(len / step) + 2;
  const lf = new Float32Array(m); // log2 frequency
  const amp = new Float32Array(m);
  const attackAt: number[] = [];
  let vph = rng() * TAU, jit = 0;
  let cur = -1;
  for (let j = 0; j < m; j++) {
    const t = (j * step) / sr;
    while (cur + 1 < notes.length && notes[cur + 1].t <= t) {
      cur++;
      const prev = notes[cur - 1];
      const gap = prev ? notes[cur].t - (prev.t + prev.dur) : Infinity;
      if (!(gap < 0.03)) attackAt.push(notes[cur].t);
    }
    if (cur < 0) { lf[j] = Math.log2(notes[0].freq); amp[j] = 0; continue; }
    const n = notes[cur], prev = notes[cur - 1];
    const tt = t - n.t;
    const base = Math.log2(n.freq);
    let l = base;
    const gap = prev ? n.t - (prev.t + prev.dur) : Infinity;
    const legato = gap < 0.03;
    if (n.grace && tt < 0.1) {
      const gd = 0.065;
      l = tt < gd ? Math.log2(n.grace) : Math.log2(n.grace) + (base - Math.log2(n.grace)) * smooth((tt - gd) / 0.03);
    } else if (prev && n.slide && gap < 0.2) {
      const lp = Math.log2(prev.freq);
      l = lp + (base - lp) * smooth(tt / P.glide);
    }
    // vibrato (continuous phase), swelling in after the delay; the rate relaxes on long notes
    const vd = (n.vib ?? 1) * P.vib.cents * clamp((tt - P.vib.delay) / 0.35, 0, 1) * (n.dur > 0.3 ? 1 : 0.3);
    vph += (TAU * P.vib.rate * (1 - 0.12 * clamp(tt / 3, 0, 1)) * step) / sr;
    jit += (rng() * 2 - 1) * 0.35 - jit * 0.02;
    l += (vd * Math.sin(vph) + P.jitter * 0.25 * jit) / 1200;
    lf[j] = l;
    // amplitude: attack from silence, or from a dip when slurred / re-articulated
    let e: number;
    if (tt < n.dur) {
      const from = legato ? (n.slide ? P.slur : P.tongue) : 0;
      const a = smooth(tt / (legato ? P.atk * 0.6 : P.atk));
      e = from + (1 - from) * a;
      const u = tt / Math.max(0.2, n.dur);
      e *= 1 - P.swell + P.swell * (inst === 'erhu' ? Math.sin(Math.PI * clamp(u * 1.1, 0, 1)) * 0.6 + 0.4 : clamp(u * 2, 0, 1));
      e *= 1 + P.vib.amp * (vd / (P.vib.cents || 1)) * Math.sin(vph + 0.6);
    } else {
      e = Math.exp(-(tt - n.dur) / (P.rel / 2.3));
    }
    amp[j] = e * n.vel;
  }
  // smooth the amplitude (two passes, τ ≈ 4 ms each), so articulation dips are quick but never clicks
  const ks = 1 - Math.exp(-step / (0.004 * sr));
  for (let pass = 0; pass < 2; pass++) {
    let s = 0;
    for (let j = 0; j < m; j++) { s += (amp[j] - s) * ks; amp[j] = s; }
  }

  const soft = wavetables(`${inst}s`, sr, P.soft, P.maxK);
  const bright = wavetables(`${inst}b`, sr, P.bright, P.maxK);
  const out = new Float32Array(len);
  const air = new Float32Array(len);
  const buzz = P.buzz ? new Float32Array(len) : null;
  let ph = rng();
  // tracked breath band-pass (TPT state-variable filter)
  let ic1 = 0, ic2 = 0;
  const kq = 1 / P.breathQ;
  for (let j = 0; j < m - 1; j++) {
    const i0 = j * step, i1 = Math.min(len, i0 + step);
    if (i0 >= len) break;
    const f0 = Math.pow(2, lf[j]), f1 = Math.pow(2, lf[j + 1]);
    const a0 = amp[j], a1 = amp[j + 1];
    if (a0 < 1e-5 && a1 < 1e-5) { ph += (f0 * (i1 - i0)) / sr; continue; }
    const band = bandFor(Math.max(f0, f1) * 1.02);
    const ts = soft[band], tb = bright[band];
    const g = Math.tan((Math.PI * Math.min(f0, sr * 0.45)) / sr);
    const A1 = 1 / (1 + g * (g + kq)), A2 = g * A1, A3 = g * A2;
    const inv = 1 / (i1 - i0);
    for (let i = i0; i < i1; i++) {
      const u = (i - i0) * inv;
      const f = f0 + (f1 - f0) * u;
      const a = a0 + (a1 - a0) * u;
      ph += f / sr;
      ph -= Math.floor(ph);
      const x = ph * TBL, xi = x | 0, fr = x - xi;
      const s = ts[xi] + (ts[xi + 1] - ts[xi]) * fr;
      const b = tb[xi] + (tb[xi + 1] - tb[xi]) * fr;
      const br = clamp(a * 1.15, 0, 1);
      const tone = (s + (b - s) * br) * a;
      const nz = rng() * 2 - 1;
      // breath: noise resonating at the pitch
      const v3 = nz - ic2, v1 = A1 * ic1 + A2 * v3, v2 = ic2 + A2 * ic1 + A3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      out[i] = tone + v1 * P.breath * a * 1.8;
      air[i] = nz * a * P.hiss;
      if (buzz) buzz[i] = Math.tanh(tone * 5) * a;
    }
  }
  // attack chiff (flutes) / bow bite (erhu): a short burst of air on every articulated onset
  for (const t of attackAt) {
    const s = Math.round(t * sr);
    if (s < len) addNoiseBurst(air, sr, rng, P.hiss * 3, 0.012, [], s);
  }
  filter(air, bandpass(sr, P.hissF, 0.8));
  for (let i = 0; i < len; i++) out[i] += air[i];
  if (buzz) {
    filter(buzz, highpass(sr, P.buzzF * 0.7, 0.8));
    filter(buzz, bandpass(sr, P.buzzF, 1.2));
    for (let i = 0; i < len; i++) out[i] += buzz[i] * P.buzz;
  }
  for (const k of P.eq(sr)) filter(out, k);
  // level: sustain RMS where the line is sounding, scaled by the phrase's mean velocity
  let e = 0, c = 0, vs = 0;
  for (let j = 0; j < m - 1; j++) {
    if (amp[j] < 0.15) continue;
    for (let i = j * step; i < Math.min(len, (j + 1) * step); i++) { e += out[i] * out[i]; c++; }
  }
  for (const n of notes) vs += n.vel;
  const rms = Math.sqrt(e / Math.max(1, c)) || 1;
  let gain = (P.level * (vs / notes.length)) / rms;
  const pk = peakOf(out) * gain;
  if (pk > 0.9) gain *= 0.9 / pk;
  scale(out, gain);
  return fadeTail(out, sr, 0.05);
}

// ---------------------------------------------------------------------------
// Plucked strings

function limitPeak(x: Float32Array, max: number): Float32Array {
  const pk = peakOf(x);
  return pk > max ? scale(x, max / pk) : x;
}

function zhengNote(sr: number, n: PluckNote, seed: number): Float32Array {
  const q: QinNote = {
    freq: n.freq, velocity: n.vel, pos: 0.075, bright: 0.9, decay: 1.2,
    dur: n.ring ?? (n.bend || n.vib ? 3.2 : 2.6), seed,
    glide: n.glide ? { cents: n.glide, time: 0.06 } : undefined,
    vibrato: n.vib ? { cents: 22, rate: 5.8, delay: 0.28 } : undefined,
    slides: n.bend,
  };
  const x = renderQin(sr, q);
  // steel-core strings and fingerpicks: a brighter, glassier top than the silk qin
  filter(x, peaking(sr, 3100, 0.9, 6));
  filter(x, peaking(sr, 110, 1.2, -3));
  addNoiseBurst(x, sr, makeRng(seed + 3), 0.1 * n.vel, 0.0012, [bandpass(sr, 5200, 1.2)]);
  limitPeak(x, 0.75);
  return fadeTail(x, sr, 0.3);
}

function pipaNote(sr: number, freq: number, vel: number, seed: number, ring = 1.1): Float32Array {
  const x = renderQin(sr, { freq, velocity: vel, pos: 0.2, bright: 0.7, decay: 0.28, dur: ring, seed });
  filter(x, highpass(sr, 140, 0.7));
  filter(x, peaking(sr, 1900, 1.1, 5));
  filter(x, peaking(sr, 420, 1.5, 2));
  addNoiseBurst(x, sr, makeRng(seed + 5), 0.16 * vel, 0.0015, [bandpass(sr, 3800, 1)]);
  limitPeak(x, 0.7);
  return fadeTail(x, sr, 0.25);
}

/** 轮指: repeated plucks of one string; each new pluck damps what was ringing. */
function tremolo(sr: number, base: Float32Array, len: number, trem: number, rng: Rng): Float32Array {
  const out = new Float32Array(len);
  const rate = rng.range(12, 15);
  const pattern = [1, 0.72, 0.8, 0.86, 0.76];
  const damp = Math.round(0.006 * sr);
  let t = 0, k = 0;
  while (t < trem) {
    const s = Math.round(t * sr);
    if (s >= len) break;
    if (k > 0) {
      for (let i = s; i < len; i++) out[i] *= i - s < damp ? 1 - 0.55 * ((i - s) / damp) : 0.45;
    }
    // swell into the tremolo, then settle
    const v = pattern[k % 5] * (0.75 + 0.25 * Math.min(1, t / 0.25)) * (1 + (rng() - 0.5) * 0.12);
    const n = Math.min(base.length, len - s);
    for (let i = 0; i < n; i++) out[s + i] += base[i] * v * 0.8;
    t += (1 / rate) * (1 + (rng() - 0.5) * 0.14);
    k++;
  }
  return limitPeak(out, 0.75);
}

function pluckNoteBuffer(sr: number, inst: PluckInst, n: PluckNote, seed: number): { x: Float32Array; g: number } {
  const plain = !n.bend && !n.vib && !n.glide && !n.trem && !n.ring;
  const vb = Math.max(0.25, Math.round(n.vel * 4) / 4); // velocity bucket for the cache
  const key = `${inst}:${sr}:${n.freq.toFixed(1)}:${vb}:${n.harm ? 'h' : ''}`;
  if (inst === 'qin' && n.harm) {
    return { x: memo(key, () => renderHarmonic(sr, n.freq, vb, 1, seed)), g: n.vel / vb };
  }
  if (inst === 'qin') {
    const make = (v: number) => renderQin(sr, {
      freq: n.freq, velocity: v, decay: 0.85, seed, dur: n.ring,
      glide: { cents: n.glide ?? -14, time: n.glide ? 0.14 : 0.06 },
      vibrato: n.vib ? { cents: 10, rate: 5, delay: 0.45 } : undefined,
      slides: n.bend,
    });
    return plain ? { x: memo(key, () => make(vb)), g: n.vel / vb } : { x: make(n.vel), g: 1 };
  }
  if (inst === 'zheng') {
    return plain ? { x: memo(key, () => zhengNote(sr, { ...n, vel: vb }, seed)), g: n.vel / vb } : { x: zhengNote(sr, n, seed), g: 1 };
  }
  // pipa
  const base = memo(key, () => pipaNote(sr, n.freq, vb, seed));
  if (!n.trem) return { x: base, g: n.vel / vb };
  const len = Math.ceil((n.trem + 1.1) * sr);
  return { x: tremolo(sr, base, len, n.trem, makeRng(seed)), g: n.vel / vb };
}

/** A phrase of plucks mixed into one stereo buffer (equal-power pan per note). */
export function renderPlucks(sr: number, inst: PluckInst, notes: PluckNote[], seed: number): [Float32Array, Float32Array] {
  const bufs = notes.map((n, i) => ({ n, ...pluckNoteBuffer(sr, inst, n, seed + i * 7919) }));
  const len = Math.max(1, ...bufs.map((b) => Math.round(b.n.t * sr) + b.x.length));
  const L = new Float32Array(len), R = new Float32Array(len);
  for (const { n, x, g } of bufs) {
    const s = Math.round(n.t * sr);
    const p = (clamp(n.pan ?? 0, -1, 1) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * g, gr = Math.sin(p) * g;
    for (let i = 0; i < x.length && s + i < len; i++) { L[s + i] += x[i] * gl; R[s + i] += x[i] * gr; }
  }
  return [L, R];
}

// ---------------------------------------------------------------------------
// 笙 — free-reed pipes

export function renderSheng(sr: number, freqs: number[], dur: number, vel: number, seed: number, air = 0): [Float32Array, Float32Array] {
  const rng = makeRng(seed);
  const len = Math.ceil(dur * sr);
  const L = new Float32Array(len), R = new Float32Array(len);
  const tb = wavetables('sheng', sr, (k) => (k % 2 ? 1 : 0.55) / Math.pow(k, 1.05), 24);
  const atk = Math.min(1.6, dur * 0.28), rel = Math.min(2.2, dur * 0.35);
  for (const f of freqs) {
    for (const [ch, cents] of [[L, -3.5], [R, 3.5]] as const) {
      const ff = f * Math.pow(2, (cents + rng.range(-1, 1)) / 1200);
      const t = tb[bandFor(ff * 1.01)];
      let ph = rng();
      const inc = ff / sr;
      const swR = rng.range(0.09, 0.17), swP = rng() * TAU;
      const envAt = (tt: number) => smooth(tt / atk) * smooth((dur - tt) / rel) * (1 + 0.14 * Math.sin(TAU * swR * tt + swP));
      // envelope at a 64-sample control rate, interpolated
      let e0 = envAt(0);
      for (let i0 = 0; i0 < len; i0 += 64) {
        const i1 = Math.min(len, i0 + 64);
        const e1 = envAt(i1 / sr), de = (e1 - e0) / 64;
        let e = e0;
        for (let i = i0; i < i1; i++, e += de) {
          ph += inc; if (ph >= 1) ph -= 1;
          const x = ph * TBL, xi = x | 0;
          ch[i] += (t[xi] + (t[xi + 1] - t[xi]) * (x - xi)) * e;
        }
        e0 = e1;
      }
    }
  }
  // reed pipes through the gourd: warm, a little nasal; air rustling in the mouthpiece
  for (const ch of [L, R]) {
    filter(ch, lowpass(sr, 1900, 0.6));
    filter(ch, peaking(sr, 900, 1.2, 2.5));
    filter(ch, highpass(sr, 90, 0.7));
  }
  if (air > 0) {
    for (const ch of [L, R]) {
      const nz = new Float32Array(len);
      const lfoP = rng() * TAU;
      for (let i0 = 0; i0 < len; i0 += 64) {
        const tt = i0 / sr;
        const e = smooth(tt / atk) * smooth((dur - tt) / rel) * (0.6 + 0.4 * Math.sin(lfoP + TAU * 0.07 * tt));
        for (let i = i0; i < Math.min(len, i0 + 64); i++) nz[i] = (rng() * 2 - 1) * e;
      }
      filter(nz, bandpass(sr, 1300, 0.5));
      filter(nz, lowpass(sr, 3500));
      for (let i = 0; i < len; i++) ch[i] += nz[i] * air * 0.35;
    }
  }
  let e = 0;
  for (let i = 0; i < len; i++) e += L[i] * L[i] + R[i] * R[i];
  const rms = Math.sqrt(e / (2 * len)) || 1;
  const g = (0.13 * vel) / rms;
  scale(L, g); scale(R, g);
  return [L, R];
}

// ---------------------------------------------------------------------------
// Percussion

/** 堂鼓: a tensioned membrane — pitch drops as the head relaxes; circular-membrane overtones. */
export function renderDrum(sr: number, kind: 'tang' | 'rim' | 'big', seed: number): Float32Array {
  const rng = makeRng(seed);
  if (kind === 'rim') {
    const out = new Float32Array(Math.ceil(0.25 * sr));
    const f = 900 * (1 + (rng() - 0.5) * 0.05);
    for (const [r, a, t] of [[1, 1, 0.05], [1.73, 0.5, 0.03], [2.61, 0.3, 0.02]] as const) addMode(out, sr, f * r, a, t, 0, 0, 0.0005);
    addNoiseBurst(out, sr, rng, 0.8, 0.002, [bandpass(sr, 3000, 0.8)]);
    scale(out, 0.8 / (peakOf(out) || 1));
    return fadeTail(out, sr, 0.03);
  }
  const f0 = (kind === 'big' ? 72 : 118) * (1 + (rng() - 0.5) * 0.04);
  const T = kind === 'big' ? 0.9 : 0.5;
  const out = new Float32Array(Math.ceil((T * 1.4 + 0.1) * sr));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = f0 * (1 + 0.35 * Math.exp(-t / 0.025));
    ph += (TAU * f) / sr;
    out[i] = Math.sin(ph) * Math.exp((-6.9 * t) / T) * Math.min(1, i / (0.0015 * sr));
  }
  const modes: [number, number, number][] = [[1.59, 0.35, 0.5], [2.14, 0.22, 0.35], [2.3, 0.14, 0.3], [2.65, 0.1, 0.22], [2.92, 0.07, 0.18]];
  for (const [r, a, t] of modes) addMode(out, sr, f0 * r, a, T * t, 0, rng() * TAU, 0.001);
  addNoiseBurst(out, sr, rng, 0.5, 0.004, [lowpass(sr, 1800), highpass(sr, 80)]);
  filter(out, highpass(sr, 40, 0.7));
  scale(out, 0.85 / (peakOf(out) || 1));
  return fadeTail(out, sr, 0.08);
}

/** 锣: 大锣 (falling pitch, big bloom) or 小锣 (rising "tai"). */
export function renderGong(sr: number, kind: 'da' | 'xiao', seed: number): Float32Array {
  const rng = makeRng(seed);
  const da = kind === 'da';
  const f0 = (da ? 196 : 620) * (1 + (rng() - 0.5) * 0.03);
  const T = da ? 5.5 : 1.8;
  const out = new Float32Array(Math.ceil((T * 1.05 + 0.2) * sr));
  // the main modes glide: down for 大锣, up for 小锣 (the plate's tension changes as it rings)
  const glide = da ? -0.07 : 0.1;
  const mains: [number, number, number][] = [[1, 1, 1], [1.52, 0.5, 0.8], [2.03, 0.32, 0.7]];
  for (const [r, a, tr] of mains) {
    let ph = rng() * TAU;
    const tau = da ? 0.5 : 0.18;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      const f = f0 * r * (1 + glide * (1 - Math.exp(-t / tau)));
      ph += (TAU * f) / sr;
      out[i] += a * Math.sin(ph) * Math.exp((-6.9 * t) / (T * tr)) * Math.min(1, t / 0.004);
    }
  }
  // shimmer: many inharmonic modes that bloom after the strike (energy moving up the plate)
  const nModes = da ? 28 : 14;
  for (let k = 0; k < nModes; k++) {
    const r = 2.2 + Math.pow(rng(), 1.3) * (da ? 16 : 8);
    const a = 0.25 * Math.pow(rng(), 1.5) / Math.sqrt(r);
    addMode(out, sr, f0 * r, a, T * rng.range(0.25, 0.7), 0, rng() * TAU, da ? rng.range(0.03, 0.35) : 0.005);
  }
  addNoiseBurst(out, sr, rng, da ? 0.35 : 0.5, da ? 0.01 : 0.003, [lowpass(sr, da ? 700 : 3000)]);
  filter(out, highpass(sr, 60, 0.7));
  scale(out, 0.85 / (peakOf(out) || 1));
  return fadeTail(out, sr, da ? 1 : 0.4);
}

/** 碰铃: two small cup bells struck together — a bright ping with a slow beat. */
export function renderLing(sr: number, freq: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(Math.ceil(3.2 * sr));
  for (const [det, amp] of [[0, 1], [3.2, 0.45]] as const) { // the pair is never quite in tune: a slow shimmer
    const f = freq + det;
    for (const [r, a, t] of [[1, 1, 2.8], [2.32, 0.4, 1.2], [4.25, 0.18, 0.6], [6.63, 0.08, 0.3]] as const) {
      addMode(out, sr, f * r, a * amp, t, 0, rng() * TAU, 0.0006);
    }
  }
  addNoiseBurst(out, sr, rng, 0.3, 0.0008, [highpass(sr, 4000)]);
  scale(out, 0.8 / (peakOf(out) || 1));
  return fadeTail(out, sr, 0.5);
}

/** 钹: small cymbals — a dense cloud of high modes and a noisy crash, quickly damped. */
export function renderBo(sr: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(Math.ceil(1.4 * sr));
  for (let k = 0; k < 48; k++) {
    const f = 420 * Math.pow(2, rng.range(0, 4.3));
    addMode(out, sr, f, rng.range(0.2, 1) / Math.sqrt(f / 420), rng.range(0.25, 1.1), 0, rng() * TAU, 0.0008);
  }
  addNoiseBurst(out, sr, rng, 3, 0.05, [highpass(sr, 2500), lowpass(sr, 11000)]);
  filter(out, highpass(sr, 300, 0.7));
  scale(out, 0.8 / (peakOf(out) || 1));
  return fadeTail(out, sr, 0.4);
}

// ---------------------------------------------------------------------------

export function runMusicJob(sr: number, j: MusicJob): Float32Array[] {
  switch (j.op) {
    case 'pluck': return renderPlucks(sr, j.inst, j.notes, j.seed);
    case 'line': return [renderLine(sr, j.inst, j.notes, j.seed)];
    case 'sheng': return renderSheng(sr, j.freqs, j.dur, j.vel, j.seed, j.air ?? 0);
    case 'drum': return [renderDrum(sr, j.kind, j.seed)];
    case 'wood': return [renderKnock(sr, j.seed, 0.8)];
    case 'gong': return [renderGong(sr, j.kind, j.seed)];
    case 'ling': return [renderLing(sr, j.freq, j.seed)];
    case 'temple': return renderBell(sr, j.freq, j.seed);
    case 'bo': return [renderBo(sr, j.seed)];
    case 'ir': return renderIR(sr, j.t60, j.secs, j.seed);
  }
}

export interface MusicJobRequest { id: number; sr: number; job: MusicJob }
export interface MusicJobResult { id: number; chans?: Float32Array[]; error?: string }
