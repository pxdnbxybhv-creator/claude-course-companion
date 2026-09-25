// Sounds for the mini-games that the shared engine has no voice for: a cast line's whirr, a splash,
// the reel's clicks, an arrow's whoosh and the bronze pot's ring, a paddle stroke, a deep temple
// bell with its long hum, a kite's flutter. Web Audio only (no files), a private context created on
// the first sound (always after a gesture), honouring the app's sound switch and volume.
import { state } from '../../../../app/store';

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

/** Close the private context (when the walk view is left). */
export function closeSound(): void {
  const x = ac;
  ac = null;
  out = null;
  verb = null;
  if (x) x.close().catch(() => {});
}
