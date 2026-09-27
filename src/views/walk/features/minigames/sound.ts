// Sounds for the mini-games that the shared engine has no voice for: a cast line's whirr, a splash,
// the reel's clicks, an arrow's whoosh and the bronze pot's ring, a paddle stroke, a deep temple
// bell with its long hum, a kite's flutter. Web Audio only (no files), a private context created on
// the first sound (always after a gesture), honouring the app's sound switch and volume.
import { state } from '../../../../app/store';
import type { DishId } from '../taoyuan/life/types';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let verb: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let broken = false;

function live(): { c: AudioContext; o: GainNode } | null {
  const s = state.value.settings;
  if (!s.sound || broken || typeof window === 'undefined') return null;
  if (!ac) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) { broken = true; return null; }
    try {
      ac = new C();
      out = ac.createGain();
      out.connect(ac.destination);
    } catch {
      broken = true;
      return null;
    }
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const v = Math.max(0, Math.min(1, s.volume ?? 0.7));
  out!.gain.value = v * v;
  return { c: ac, o: out! };
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate * 2);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 424242;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = seed / 2147483648 - 1;
  }
  return noiseBuf;
}

/** A long, dark valley echo (a synthesised impulse response) for the bell. */
function valley(c: AudioContext, o: AudioNode): ConvolverNode {
  if (verb && verb.context === c) return verb;
  const len = Math.floor(c.sampleRate * 4.5);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let seed = 99 + ch * 7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const t = i / c.sampleRate;
      // a diffuse tail plus discrete echoes off the far hills
      const echo = [0.42, 0.9, 1.5].reduce((a, e, k) => a + (Math.abs(t - e - ch * 0.03) < 0.012 ? 0.5 / (k + 1) : 0), 0);
      d[i] = ((seed / 2147483648 - 1) * 0.5 + echo) * Math.exp(-t * 1.35);
    }
  }
  verb = c.createConvolver();
  verb.buffer = ir;
  const g = c.createGain();
  g.gain.value = 0.55;
  verb.connect(g).connect(o);
  return verb;
}

function grain(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1, sweep?: number) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o);
  src.start(t, Math.random() * 1.5, dur + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

function tone(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, f0: number, f1 = f0, type: OscillatorType = 'sine', attack = 0.006) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

/** The line whirring off the reel as you cast (longer for a stronger cast). */
export function whirr(power = 0.6): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const n = Math.floor(8 + power * 16);
  for (let i = 0; i < n; i++) tone(c, o, t + i * 0.028, 0.02, 0.05 * (1 - i / n), 1500 + i * 20, 1400, 'triangle');
  grain(c, o, t, 0.25 + power * 0.3, 0.12, 'bandpass', 2400, 2, 900);
}

/** Something landing in the water: a float (small) or a fish (big). */
export function splash(size = 0.4): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  tone(c, o, t, 0.1 + size * 0.1, 0.18 * (0.5 + size), 700 - size * 300, 220);
  grain(c, o, t, 0.25 + size * 0.5, 0.25 * (0.4 + size), 'bandpass', 1400 - size * 600, 0.8, 500);
  for (let i = 0; i < 3 + size * 8; i++) grain(c, o, t + 0.06 + Math.random() * (0.2 + size * 0.4), 0.04, 0.06 * size + 0.02, 'highpass', 3000 + Math.random() * 3000, 1);
}

/** A bite: the float bobs under with a small gulp. */
export function bite(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  tone(c, o, t, 0.09, 0.22, 420, 160);
  tone(c, o, t + 0.12, 0.08, 0.16, 380, 150);
  grain(c, o, t, 0.16, 0.08, 'lowpass', 800, 1);
}

/** One ratchet click of the reel. */
export function click(level = 0.5): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.005;
  grain(c, o, t, 0.018, 0.2 * level, 'bandpass', 3200, 4);
}

/** A thin rising tone for the catch meter (0..1). */
export function tension(k: number): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  tone(c, o, c.currentTime + 0.005, 0.07, 0.035, 300 + k * 500, 320 + k * 520, 'triangle');
}

/** An arrow leaving the hand. */
export function whoosh(power = 0.6): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  grain(c, o, t, 0.3 + power * 0.15, 0.22, 'bandpass', 600, 1.5, 2600);
}

/** The bronze pot: an arrow dropping in (ring) or clattering off (thud). */
export function clink(kind: 'hu' | 'er' | 'yi' | 'miss'): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  if (kind === 'miss') {
    grain(c, o, t, 0.08, 0.3, 'lowpass', 500, 1);
    grain(c, o, t + 0.13, 0.06, 0.15, 'lowpass', 400, 1);
    return;
  }
  // an inharmonic bronze ring; the ear is higher and brighter
  const f = kind === 'er' ? 1180 : kind === 'yi' ? 760 : 620;
  const ratios = [1, 2.32, 3.9, 5.4];
  ratios.forEach((r, i) => tone(c, o, t, 1.6 - i * 0.3, (0.16 / (i + 1)) * (kind === 'yi' ? 0.6 : 1), f * r, f * r * 0.998));
  grain(c, o, t, 0.05, 0.25, 'bandpass', 2400, 2);
  if (kind !== 'yi') tone(c, o, t + 0.09, 0.3, 0.06, f * 0.5, f * 0.5); // the arrow settling on the bottom
}

/** One oar stroke: the blade in, a push, the drip. */
export function paddle(level = 0.5): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  grain(c, o, t, 0.5, 0.18 * level, 'bandpass', 500, 0.8, 260);
  grain(c, o, t + 0.05, 0.3, 0.08 * level, 'highpass', 2500, 0.7);
  for (let i = 0; i < 3; i++) tone(c, o, t + 0.45 + i * 0.12 + Math.random() * 0.05, 0.06, 0.04 * level, 1300 + Math.random() * 500, 700);
}

/** A lotus pod snapping off its stem. */
export function snap(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  grain(c, o, t, 0.05, 0.3, 'bandpass', 1800, 3);
  tone(c, o, t, 0.06, 0.08, 900, 400);
}

/**
 * The great bronze bell (梵钟), struck by a swung log: a low hum that beats, a strike note, and the
 * partials of a bell, sent out into a long valley echo. `force` 0..1.
 */
export function templeBell(force = 1): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.02;
  const bus = c.createGain();
  bus.gain.value = 0.6 + force * 0.4;
  bus.connect(o);
  bus.connect(valley(c, o));
  const f0 = 98; // G2: the strike note
  // [ratio, gain, decay s] — hum, prime, tierce (minor third), quint, nominal, higher partials
  const partials: [number, number, number][] = [[0.5, 0.34, 14], [1, 0.3, 9], [1.19, 0.16, 7], [1.5, 0.1, 5], [2, 0.12, 4.5], [2.61, 0.06, 3], [3.4, 0.04, 2], [4.3, 0.025, 1.4]];
  for (const [r, g, d] of partials) {
    tone(c, bus, t, d * (0.7 + force * 0.3), g, f0 * r, f0 * r * 0.999, 'sine', 0.004);
    tone(c, bus, t, d * 0.9, g * 0.5, f0 * r * 1.004, f0 * r * 1.003, 'sine', 0.004); // the slow beat (the bell "breathes")
  }
  // the log's thud
  grain(c, bus, t, 0.18, 0.4 * force, 'lowpass', 260, 1);
  setTimeout(() => bus.disconnect(), 16000);
}

/** A kite's paper flutter in the wind. */
export function flutter(level = 0.4): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < 10; i++) grain(c, o, t + i * 0.045, 0.04, 0.08 * level, 'bandpass', 900 + Math.random() * 600, 1.2);
}

/** Pouring tea: a soft stream, rising as the cup fills. */
export function pour(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  grain(c, o, t, 1.5, 0.12, 'bandpass', 700, 2, 1600);
  for (let i = 0; i < 12; i++) tone(c, o, t + 0.1 + i * 0.11 + Math.random() * 0.05, 0.05, 0.025, 900 + i * 60, 700 + i * 50);
}

/** A small reward flourish: three rising plucks of a bamboo xylophone. */
export function ding(n = 3): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const notes = [523, 587, 659, 784, 880, 1047];
  for (let i = 0; i < n; i++) {
    const f = notes[Math.min(notes.length - 1, i * 2)];
    tone(c, o, t + i * 0.09, 0.45, 0.1, f, f, 'triangle');
    tone(c, o, t + i * 0.09, 0.2, 0.04, f * 3.01, f * 3, 'sine');
  }
}

// ───────────────────────────── 桃源 · 二期 (特写 and the valley games)
//
// The 特写's kitchen (spec §4.6) and the valley games' clock and instruments, on this file's own
// context (live()). Every one is silent while the sound is off, and none throws.

/** The kinds `at()` can schedule on the audio clock (踩曲's drum, 杜二's clap, a pluck). */
export type BeatSound = 'drum' | 'clap' | 'pluck';

/** The 徵 scale (sol la do′ re′ mi′ …) from G4, in Hz: `at('pluck', t, {note})` and the sting. */
const ZHI = [392, 440, 523.25, 587.33, 659.25, 784, 880, 1046.5, 1174.66, 1318.51];
const zhi = (step: number) => {
  const n = ZHI.length / 2;
  const oct = Math.floor(step / n), k = ((step % n) + n) % n;
  return ZHI[k] * 2 ** oct;
};

/** One plucked string (the 筝 of the sting, a game's pluck): a bright attack that mellows. */
function pluckAt(c: AudioContext, o: AudioNode, t: number, f: number, gain = 0.12, dur = 1.1): void {
  tone(c, o, t, dur, gain, f, f * 0.998, 'triangle', 0.003);
  tone(c, o, t, dur * 0.4, gain * 0.35, f * 2.005, f * 2, 'sine', 0.002);
  tone(c, o, t, dur * 0.15, gain * 0.25, f * 3.01, f * 3, 'sine', 0.001);
  grain(c, o, t, 0.02, gain * 0.6, 'bandpass', Math.min(8000, f * 6), 2);
}

/** A wood block: a short hollow knock. */
function woodAt(c: AudioContext, o: AudioNode, t: number, f = 900, gain = 0.2): void {
  tone(c, o, t, 0.08, gain, f, f * 0.8, 'sine', 0.001);
  tone(c, o, t, 0.05, gain * 0.5, f * 2.7, f * 2.4, 'sine', 0.001);
  grain(c, o, t, 0.025, gain * 0.7, 'bandpass', f * 2, 3);
}

/** Oil sizzling (炙): band-passed noise at 3–6 kHz with Poisson clicks, for `secs`. */
export function sizzle(secs = 1.2): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const d = Math.max(0.2, Math.min(4, secs));
  grain(c, o, t, d, 0.07, 'bandpass', 4200, 0.9, 3200);
  grain(c, o, t + d * 0.3, d * 0.7, 0.05, 'highpass', 5200, 0.7);
  // the spits: clicks at random (a Poisson process, about 14 a second)
  let k = t;
  for (let i = 0; i < 80; i++) {
    k += -Math.log(1 - Math.random() * 0.999) / 14;
    if (k > t + d) break;
    grain(c, o, k, 0.012, 0.05 + Math.random() * 0.08, 'bandpass', 3000 + Math.random() * 3000, 3);
  }
}

/** Steam (蒸): high-passed noise with a swell, for `secs`. */
export function steam(secs = 1.2): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const d = Math.max(0.2, Math.min(4, secs));
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.setValueAtTime(2200, t);
  f.frequency.linearRampToValueAtTime(3400, t + d * 0.6);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + d * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f).connect(g).connect(o);
  src.start(t, Math.random());
  src.stop(t + d + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

/** A pot bubbling (羹): n low sine blips, 180–320 Hz. */
export function bubble(n = 6): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const m = Math.max(1, Math.min(24, Math.round(n)));
  for (let i = 0; i < m; i++) {
    const f = 180 + Math.random() * 140;
    tone(c, o, t + i * (0.09 + Math.random() * 0.12), 0.07, 0.07, f, f * 1.6, 'sine', 0.004);
  }
}

/** A slurp: a 400 → 1500 Hz sweep through noise. */
export function slurp(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  grain(c, o, t, 0.34, 0.16, 'bandpass', 400, 4, 1500);
  grain(c, o, t + 0.05, 0.22, 0.06, 'bandpass', 900, 6, 2200);
}

/** A crunch: 3 noise bursts, 25 ms each. */
export function crunch(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < 3; i++) grain(c, o, t + i * (0.045 + Math.random() * 0.02), 0.025, 0.22 - i * 0.04, 'bandpass', 1800 + Math.random() * 1600, 1.2);
}

/** A crack (a mud seal, a crust): a noise transient, then a low knock. */
export function crack(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  grain(c, o, t, 0.03, 0.3, 'highpass', 2500, 0.8);
  grain(c, o, t + 0.012, 0.06, 0.14, 'bandpass', 1200, 2);
  tone(c, o, t + 0.03, 0.14, 0.16, 190, 120, 'sine', 0.002);
}

/** A sip: a short 900 Hz sine with a noise tail; `ha`, the breath after wine. */
export function sip(ha = false): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  tone(c, o, t, 0.07, 0.07, 900, 1000, 'sine', 0.004);
  grain(c, o, t + 0.03, 0.18, 0.05, 'bandpass', 1400, 2, 700);
  if (ha) grain(c, o, t + 0.45, 0.4, 0.09, 'bandpass', 900, 0.8, 600);
}

/** A steamer's lid: a wood clack. */
export function lid(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  woodAt(c, o, t, 620, 0.22);
  woodAt(c, o, t + 0.07, 540, 0.1);
}

/** The 特写's small sounds: a brush swish, one 筝 pluck, the wood-block tick, the hiss in 举, the cup's clink. */
export function pvTick(kind: 'swish' | 'pluck' | 'tick' | 'hiss' | 'clink'): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  if (kind === 'swish') grain(c, o, t, 0.28, 0.08, 'bandpass', 700, 1.2, 2400);
  else if (kind === 'pluck') pluckAt(c, o, t, zhi(0), 0.1, 1.4);
  else if (kind === 'tick') woodAt(c, o, t, 1100, 0.14);
  else if (kind === 'hiss') grain(c, o, t, 0.5, 0.05, 'highpass', 3600, 0.7);
  else { tone(c, o, t, 0.5, 0.05, 2300, 2290, 'sine', 0.002); tone(c, o, t, 0.3, 0.03, 3700, 3690, 'sine', 0.002); }
}

/**
 * The 特写's sting: plucks sol-la-do′-re′-mi′, 90 ms apart, then a chime; on a first taste, a low
 * fourth note and a knock. (桃花茶 has none: the caller skips it.)
 */
export function sting(dish: DishId, first = false): void {
  const a = live();
  if (!a) return;
  void dish;
  const { c, o } = a;
  const t = c.currentTime + 0.02;
  for (let i = 0; i < 5; i++) pluckAt(c, o, t + i * 0.09, zhi(i), 0.085 + i * 0.008, 1.2);
  const ct = t + 5 * 0.09 + 0.08;
  // the chime: a small bronze bell over the run
  for (const [r, g] of [[1, 0.06], [2.76, 0.025], [5.4, 0.012]] as const) tone(c, o, ct, 1.8 / r + 0.4, g, 1046.5 * r, 1046.5 * r * 0.999, 'sine', 0.002);
  if (first) {
    pluckAt(c, o, ct + 0.12, 146.83, 0.16, 2.2);
    woodAt(c, o, ct + 0.12, 300, 0.24);
  }
}

/** 开饭's 梆子: two dry wood hits. */
export function clapper(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  woodAt(c, o, t, 980, 0.26);
  woodAt(c, o, t + 0.16, 1040, 0.3);
}

/** now() minus the context's clock, fixed when the context first runs (and again if it jumps). */
let skew: number | null = null;

/**
 * The audio clock now, in seconds — the clock `at()` schedules on. It is the context's own clock
 * while it runs, offset to agree with a monotonic clock, so it never jumps when the first sound
 * makes the context (or the context sleeps and wakes); with the sound off, the monotonic clock
 * alone, so a rhythm game still runs.
 */
export function now(): number {
  const p = performance.now() / 1000;
  if (ac && ac.state === 'running') {
    const t = ac.currentTime;
    if (skew === null || Math.abs(t + skew - p) > 0.05) skew = p - t;
    return t + skew;
  }
  return p;
}

/** Schedule a drum, a clap or a pluck at `when` (seconds on now()'s clock). `note`: a pluck's step in the 徵 scale. */
export function at(kind: BeatSound, when: number, o: { level?: number; note?: number } = {}): void {
  const a = live();
  if (!a) return;
  const { c, o: out0 } = a;
  // (relative to now(): right whether or not the context has started its clock yet)
  const t = c.currentTime + Math.max(0.005, when - now());
  const lv = Math.max(0, Math.min(1, o.level ?? 0.8));
  if (kind === 'drum') {
    tone(c, out0, t, 0.32, 0.34 * lv, 120, 58, 'sine', 0.003);
    grain(c, out0, t, 0.05, 0.12 * lv, 'lowpass', 900, 1);
  } else if (kind === 'clap') {
    for (let i = 0; i < 3; i++) grain(c, out0, t + i * 0.009, 0.05, 0.16 * lv, 'bandpass', 1300 + i * 250, 1.4);
  } else {
    pluckAt(c, out0, t, zhi(Math.round(o.note ?? 0)), 0.12 * lv, 1.0);
  }
}

/** The kite's 鹞琴: one held voice, its loudness eased toward the last level asked. */
let kite: { osc: OscillatorNode; osc2: OscillatorNode; g: GainNode; lfo: OscillatorNode; ctx: AudioContext } | null = null;

/** The kite's 鹞琴 (a bamboo whistle on the line): sets its loudness now, 0…1 (0 silences it). Call it as often as you like. */
export function whistle(level: number): void {
  const lv = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  if (lv <= 0.001) {
    const k = kite;
    if (!k) return;
    try {
      const t = k.ctx.currentTime;
      k.g.gain.cancelScheduledValues(t);
      k.g.gain.setTargetAtTime(0, t, 0.08);
    } catch { /* closed */ }
    return;
  }
  const a = live();
  if (!a) return;
  const { c, o } = a;
  try {
    if (!kite || kite.ctx !== c) {
      const osc = c.createOscillator(), osc2 = c.createOscillator(), lfo = c.createOscillator();
      const g = c.createGain(), lg = c.createGain();
      osc.type = 'sine'; osc2.type = 'sine'; lfo.type = 'sine';
      osc.frequency.value = 1180; osc2.frequency.value = 1770; lfo.frequency.value = 5.5;
      lg.gain.value = 18;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lg.connect(osc2.frequency);
      const g2 = c.createGain();
      g2.gain.value = 0.35;
      g.gain.value = 0;
      osc.connect(g);
      osc2.connect(g2).connect(g);
      g.connect(o);
      osc.start(); osc2.start(); lfo.start();
      kite = { osc, osc2, g, lfo, ctx: c };
    }
    const t = c.currentTime;
    kite.g.gain.cancelScheduledValues(t);
    kite.g.gain.setTargetAtTime(0.05 * lv, t, 0.12);
    // the pitch leans up with the wind
    kite.osc.frequency.setTargetAtTime(1080 + lv * 220, t, 0.2);
    kite.osc2.frequency.setTargetAtTime((1080 + lv * 220) * 1.5, t, 0.2);
  } catch { /* the whistle is optional */ }
}

/** The firefly net swept through the air. */
export function swish(power = 0.6): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const p = Math.max(0.1, Math.min(1, power));
  grain(c, o, t, 0.18 + p * 0.14, 0.1 + p * 0.1, 'bandpass', 500, 1.1, 1800 + p * 1400);
}

/** Close the private context (when the walk view is left). */
export function closeSound(): void {
  const x = ac;
  if (kite) { try { kite.osc.stop(); kite.osc2.stop(); kite.lfo.stop(); kite.g.disconnect(); } catch { /* closed */ } }
  kite = null;
  skew = null;
  ac = null;
  out = null;
  verb = null;
  if (x) x.close().catch(() => {});
}
