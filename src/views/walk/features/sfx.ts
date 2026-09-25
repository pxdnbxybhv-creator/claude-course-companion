// Little synthesised sound effects the shared engine has no voice for: a mooncake bite, a festival
// drum, firework pops, a cat's purr, sparrow chirps, a plop. Web Audio only, no files; a private
// context created on the first sound (which always follows a gesture — a key or a tap), honouring
// the app's sound switch and volume. Every call is a safe no-op when audio is unavailable.
import { state } from '../../../app/store';

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let broken = false;

function live(): { c: AudioContext; o: GainNode } | null {
  const s = state.value.settings;
  if (!s.sound || broken || typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) { broken = true; return null; }
    try {
      ctx = new C();
      out = ctx.createGain();
      out.connect(ctx.destination);
    } catch {
      broken = true;
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const v = Math.max(0, Math.min(1, s.volume ?? 0.7));
  out!.gain.value = v * v;
  return { c: ctx, o: out! };
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate * 1.5);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = seed / 2147483648 - 1;
  }
  return noiseBuf;
}

/** A filtered noise grain: the atom of crunches, crackles and splashes. */
function grain(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1, pan = 0) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.004, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let last: AudioNode = g;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    last = p;
  }
  src.connect(f).connect(g);
  last.connect(o);
  src.start(t, Math.random() * 1.2, dur + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); if (last !== g) last.disconnect(); };
}

function tone(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, f0: number, f1: number, type: OscillatorType = 'sine') {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

/** Crunch — a bite of flaky pastry: a cluster of bright grains, then two smaller chews. */
export function bite(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let k = 0; k < 3; k++) {
    const t0 = t + k * 0.26;
    const n = k === 0 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      grain(c, o, t0 + i * 0.011 + Math.random() * 0.012, 0.03 + Math.random() * 0.04, (k === 0 ? 0.5 : 0.28) * (0.6 + Math.random() * 0.4),
        'bandpass', 1800 + Math.random() * 3200, 1.4);
    }
    grain(c, o, t0, 0.09, k === 0 ? 0.22 : 0.12, 'lowpass', 500, 0.7); // the jaw's thump
  }
}

/** A festival drum (堂鼓): pitched thump with a skin slap. `level` 0..1 (distance). */
export function drum(level = 1, pan = 0): void {
  const a = live();
  if (!a || level < 0.02) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  tone(c, o, t, 0.45, 0.55 * level, 120, 52);
  grain(c, o, t, 0.06, 0.25 * level, 'bandpass', 900, 0.8, pan);
}

/** A distant firework: a thump, then a sparkle of crackles. `level` 0..1. */
export function firework(level = 1, pan = 0): void {
  const a = live();
  if (!a || level < 0.02) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  tone(c, o, t, 0.5, 0.35 * level, 90, 38);
  grain(c, o, t, 0.25, 0.25 * level, 'lowpass', 700, 0.7, pan);
  for (let i = 0; i < 14; i++) {
    grain(c, o, t + 0.25 + Math.random() * 0.9, 0.02 + Math.random() * 0.02, 0.12 * level * Math.random(), 'highpass', 3000 + Math.random() * 3000, 0.9, pan + (Math.random() - 0.5) * 0.6);
  }
}

/** A cat's purr, `sec` long: 25 Hz pulses of low noise. */
export function purr(sec = 2.2, level = 0.6): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.02;
  const n = Math.floor(sec * 24);
  for (let i = 0; i < n; i++) {
    const breath = 0.5 + 0.5 * Math.sin((i / n) * Math.PI * 2 * (sec / 1.6));
    const env = Math.min(1, i / 6, (n - i) / 6);
    grain(c, o, t + i / 24 + Math.random() * 0.004, 0.045, 0.28 * level * env * (0.55 + 0.45 * breath), 'lowpass', 260, 2.2);
  }
}

/** Sparrows taking off: a few quick upward chirps and a flurry of wings. */
export function chirps(n = 3, level = 0.6): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < n; i++) {
    const t0 = t + i * 0.09 + Math.random() * 0.06;
    const f = 3200 + Math.random() * 1400;
    tone(c, o, t0, 0.07, 0.07 * level, f, f * 1.35, 'triangle');
  }
  for (let i = 0; i < 10; i++) grain(c, o, t + i * 0.03, 0.04, 0.1 * level, 'bandpass', 1400, 0.6);
}

/** A koi's plop at the surface. */
export function plop(level = 0.5): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  tone(c, o, t, 0.12, 0.2 * level, 900, 300);
  grain(c, o, t + 0.02, 0.18, 0.08 * level, 'bandpass', 1200, 1.2);
}

/** Paper rustle — picking up a red envelope or a riddle slip. */
export function rustle(level = 0.5): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < 6; i++) grain(c, o, t + i * 0.035 + Math.random() * 0.02, 0.05, 0.12 * level, 'highpass', 2500 + Math.random() * 2000, 0.7);
}

/** Close the private context (when the walk view is left). */
export function closeSfx(): void {
  const c = ctx;
  ctx = null;
  out = null;
  if (c) c.close().catch(() => {});
}
