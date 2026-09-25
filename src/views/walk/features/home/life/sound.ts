// The homestead's voices, synthesised (no files): a bark, a meow, a quack, the crane's call, the
// parrot's squawk, a goat's bleat, a thump on the fence, a broom's swish, a pot's sizzle and the young
// musician's flute. A private context created on the first sound (always after a gesture), honouring
// the app's sound switch and volume; every call is a safe no-op when audio is unavailable.
import { state } from '../../../../../app/store';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let broken = false;
let unlocked = false;

if (typeof window !== 'undefined') {
  // sounds may only start after a gesture; before that every call is silent
  const mark = () => { unlocked = true; };
  window.addEventListener('pointerdown', mark, { once: true, capture: true });
  window.addEventListener('keydown', mark, { once: true, capture: true });
}

function live(): { c: AudioContext; o: GainNode } | null {
  const s = state.value.settings;
  if (!s.sound || broken || !unlocked || typeof window === 'undefined') return null;
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
  out!.gain.value = v * v * 0.8;
  return { c: ac, o: out! };
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 4242;
  for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
  return noiseBuf;
}

/** One voiced sound: an oscillator through a filter with an envelope, gliding f0 → f1. */
function voice(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, f0: number, f1: number, type: OscillatorType, filter?: { type: BiquadFilterType; f: number; q?: number }, vib?: { rate: number; depth: number }) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let head: AudioNode = osc;
  let f: BiquadFilterNode | null = null;
  if (filter) {
    f = c.createBiquadFilter();
    f.type = filter.type; f.frequency.value = filter.f; f.Q.value = filter.q ?? 1;
    osc.connect(f);
    head = f;
  }
  let lfo: OscillatorNode | null = null, lg: GainNode | null = null;
  if (vib) {
    lfo = c.createOscillator(); lfo.frequency.value = vib.rate;
    lg = c.createGain(); lg.gain.value = vib.depth;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  head.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => { osc.disconnect(); f?.disconnect(); g.disconnect(); lfo?.disconnect(); lg?.disconnect(); };
}

function hiss(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o);
  src.start(t, (t * 7.3) % 0.8, dur + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

/** Level falls off with distance (m) from the listener. */
const near = (d: number) => Math.max(0, Math.min(1, 1.2 - d / 18));

export function bark(d = 0, big = false): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const base = big ? 260 : 420;
  for (let i = 0; i < 2; i++) {
    const t0 = t + i * 0.2;
    voice(c, o, t0, 0.13, 0.32 * k, base * 1.6, base, 'sawtooth', { type: 'bandpass', f: base * 3, q: 1.2 });
    hiss(c, o, t0, 0.08, 0.12 * k, 'bandpass', 1400, 0.8);
  }
}

export function meow(d = 0): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  voice(c, o, t, 0.2, 0.2 * k, 520, 780, 'triangle', { type: 'bandpass', f: 1600, q: 2 });
  voice(c, o, t + 0.2, 0.38, 0.22 * k, 780, 430, 'triangle', { type: 'bandpass', f: 1400, q: 2 });
}

export function quack(d = 0, n = 2): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < n; i++) voice(c, o, t + i * 0.22, 0.15, 0.2 * k, 330, 260, 'sawtooth', { type: 'bandpass', f: 1100, q: 5 });
}

export function craneCall(d = 0): void {
  const a = live(); const k = near(d * 0.6);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  voice(c, o, t, 0.5, 0.16 * k, 900, 1250, 'square', { type: 'bandpass', f: 1800, q: 3 }, { rate: 18, depth: 30 });
  voice(c, o, t + 0.55, 0.7, 0.14 * k, 1150, 850, 'square', { type: 'bandpass', f: 1700, q: 3 }, { rate: 16, depth: 40 });
}

/** The parrot: a chirpy squawk, one blip per syllable of what it says. */
export function squawk(d = 0, syllables = 3): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  const n = Math.max(1, Math.min(8, syllables));
  for (let i = 0; i < n; i++) {
    const f = 900 + ((i * 373) % 500);
    voice(c, o, t + i * 0.14, 0.11, 0.13 * k, f, f * (i % 2 ? 0.8 : 1.25), 'square', { type: 'bandpass', f: 2200, q: 2.5 });
  }
}

export function bleat(d = 0): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  voice(c, o, t, 0.7, 0.2 * k, 480, 400, 'sawtooth', { type: 'bandpass', f: 1300, q: 3 }, { rate: 11, depth: 45 });
}

export function thump(d = 0): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  voice(c, o, t, 0.25, 0.4 * k, 140, 60, 'sine');
  hiss(c, o, t, 0.12, 0.2 * k, 'lowpass', 700);
}

export function swish(d = 0): void {
  const a = live(); const k = near(d * 1.4);
  if (!a || k <= 0) return;
  const { c, o } = a;
  hiss(c, o, c.currentTime + 0.01, 0.35, 0.07 * k, 'bandpass', 3200, 0.7);
}

export function sizzle(d = 0): void {
  const a = live(); const k = near(d * 1.3);
  if (!a || k <= 0) return;
  const { c, o } = a;
  hiss(c, o, c.currentTime + 0.01, 1.4, 0.05 * k, 'highpass', 4200, 0.6);
}

export function munch(d = 0): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < 4; i++) hiss(c, o, t + i * 0.13, 0.05, 0.14 * k, 'bandpass', 2400 + i * 300, 1.5);
}

/** A little pentatonic phrase on a breathy flute (the young musician practising; `skill` 0…1). */
export function flute(d = 0, skill = 0.5, seed = 0): void {
  const a = live(); const k = near(d);
  if (!a || k <= 0) return;
  const { c, o } = a;
  const t = c.currentTime + 0.02;
  const scale = [587, 659, 784, 880, 988, 1175];
  let s = seed >>> 0;
  let at = t;
  for (let i = 0; i < 5; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const f = scale[s % scale.length];
    // practice: now and then a note cracks
    const crack = skill < 0.5 && (s >> 8) % 7 === 0;
    const dur = 0.28 + ((s >> 4) % 3) * 0.14;
    voice(c, o, at, dur, 0.09 * k, f, crack ? f * 1.5 : f * 1.004, 'sine', undefined, { rate: 5.5, depth: f * 0.008 });
    hiss(c, o, at, dur * 0.8, 0.018 * k, 'bandpass', f * 2, 3);
    at += dur * 0.92;
  }
}

export function chime(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  [1318, 1760, 2093].forEach((f, i) => voice(c, o, t + i * 0.08, 0.6, 0.08, f, f, 'sine'));
}

export function closeSound(): void {
  const c = ac;
  ac = null; out = null;
  if (c) c.close().catch(() => {});
}
