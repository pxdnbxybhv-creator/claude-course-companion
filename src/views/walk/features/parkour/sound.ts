// 轻功's little sounds, synthesised on the shared engine's own context (no new AudioContext): the
// bright "ting" of a bronze coin, a purse of them, a splash, the timer's tick and a wooden clack.
// Honours the app's sound switch and volume; every call is a safe no-op without audio.
import type { AudioEngine } from '../../../../audio/engine';
import { state } from '../../../../app/store';

let noiseBuf: AudioBuffer | null = null;
let seed = 0x5eed1234;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function live(audio: AudioEngine): { c: AudioContext; o: AudioNode; v: number } | null {
  const s = state.value.settings;
  if (!s.sound) return null;
  const c = audio.context;
  if (!c) {
    // the first sound opens the engine's context; this one is a soft pluck instead
    try { audio.pluck(9, 0.35); } catch { /* no audio */ }
    return null;
  }
  if (c.state === 'suspended') c.resume().catch(() => {});
  const v = Math.max(0, Math.min(1, s.volume ?? 0.7));
  return { c, o: c.destination, v: v * v };
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate * 1.2);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 99991;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  return noiseBuf;
}

function partial(c: AudioContext, o: AudioNode, t: number, f: number, gain: number, dur: number, type: OscillatorType = 'sine') {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

function hiss(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, q = 1) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o);
  src.start(t, rnd() * 0.6, dur + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

/** One bronze coin: a bright, slightly inharmonic ting. `n` > 1 rattles a few together (a bigger find). */
export function coin(audio: AudioEngine, n = 1): void {
  const a = live(audio);
  if (!a) return;
  const { c, o, v } = a;
  const t = c.currentTime + 0.01;
  const k = Math.min(4, Math.max(1, n));
  for (let i = 0; i < k; i++) {
    const t0 = t + i * 0.075;
    const f = 1850 * (1 + i * 0.12) * (0.98 + rnd() * 0.04);
    partial(c, o, t0, f, 0.12 * v, 0.55);
    partial(c, o, t0, f * 2.76, 0.05 * v, 0.28);
    partial(c, o, t0, f * 5.4, 0.02 * v, 0.12);
  }
  // a last, higher sparkle
  partial(c, o, t + k * 0.075 + 0.02, 3950, 0.05 * v, 0.7);
}

/** Falling in: a plunge and the water closing over it. */
export function splash(audio: AudioEngine): void {
  const a = live(audio);
  if (!a) return;
  const { c, o, v } = a;
  const t = c.currentTime + 0.01;
  hiss(c, o, t, 0.5, 0.35 * v, 'lowpass', 2600, 300, 0.7);
  hiss(c, o, t + 0.05, 0.35, 0.18 * v, 'bandpass', 1400, 600, 1.5);
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.12 * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + 0.25);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

/** A wooden clack (a foot on a pole, the clock starting). */
export function clack(audio: AudioEngine, level = 1): void {
  const a = live(audio);
  if (!a) return;
  const { c, o, v } = a;
  const t = c.currentTime + 0.005;
  partial(c, o, t, 820 + rnd() * 80, 0.14 * v * level, 0.09, 'triangle');
  hiss(c, o, t, 0.05, 0.12 * v * level, 'bandpass', 2400, 1600, 2);
}
