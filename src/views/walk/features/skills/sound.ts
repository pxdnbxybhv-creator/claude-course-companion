// The skills' little sounds, synthesised (Web Audio, no files): a brush stroke, wind, a sword's ring,
// paper fluttering, a talisman's pop, a meow, a go stone's clack, hoofbeats and a whinny, a splash,
// a sip of wine, the moon's shimmer. A private context opened on the first sound (always after a
// key or a tap), honouring the app's sound switch and volume; every call is a safe no-op without audio.
import { state } from '../../../../app/store';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let broken = false;
let seed = 0x2545f491;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

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
  out!.gain.value = v * v * 0.9;
  return { c: ac, o: out! };
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate * 2);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 777;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  return noiseBuf;
}

/** Filtered noise with an envelope; the filter may sweep from f0 to f1. */
function hiss(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, attack = 0.01) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(attack, dur / 2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o);
  src.start(t, rnd() * 1.4, dur + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

function tone(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, f0: number, f1 = f0, type: OscillatorType = 'sine', attack = 0.006) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

const run = (fn: (c: AudioContext, o: GainNode, t: number) => void) => {
  const a = live();
  if (!a) return;
  try { fn(a.c, a.o, a.c.currentTime + 0.01); } catch { /* audio is a nicety */ }
};

/** A brush stroke on paper. */
export const brush = (level = 0.5) => run((c, o, t) => {
  hiss(c, o, t, 0.32, 0.22 * level, 'bandpass', 1800, 3600, 0.9, 0.05);
  hiss(c, o, t + 0.05, 0.2, 0.08 * level, 'highpass', 5000, 5000, 0.7);
});

/** A rush of wind; `up` sweeps it upward (a lift). */
export const wind = (dur = 1.2, level = 0.5, up = true) => run((c, o, t) => {
  hiss(c, o, t, dur, 0.3 * level, 'bandpass', up ? 300 : 1400, up ? 1600 : 350, 0.8, dur * 0.35);
  hiss(c, o, t + 0.1, dur * 0.8, 0.12 * level, 'bandpass', up ? 900 : 2400, up ? 3200 : 700, 2.5, dur * 0.3);
});

/** A quick swish. */
export const swish = (level = 0.5) => run((c, o, t) => hiss(c, o, t, 0.22, 0.35 * level, 'bandpass', 700, 3200, 1.2, 0.02));

/** A sword's clear ring after the swish. */
export const blade = (level = 0.5) => run((c, o, t) => {
  hiss(c, o, t, 0.2, 0.3 * level, 'bandpass', 900, 4000, 1.4, 0.02);
  tone(c, o, t + 0.05, 1.1, 0.05 * level, 1870, 1860);
  tone(c, o, t + 0.05, 0.8, 0.035 * level, 2810, 2800);
  tone(c, o, t + 0.05, 0.5, 0.02 * level, 4410, 4400);
});

/** Paper fluttering (a talisman, a paper crane). */
export const paper = (n = 5, level = 0.5) => run((c, o, t) => {
  for (let i = 0; i < n; i++) hiss(c, o, t + i * 0.07 + rnd() * 0.03, 0.05, 0.12 * level, 'highpass', 3000 + rnd() * 2000, undefined, 0.8);
});

/** A talisman bursting: a soft thump and crackle. */
export const pop = (level = 0.6) => run((c, o, t) => {
  tone(c, o, t, 0.25, 0.3 * level, 180, 55);
  for (let i = 0; i < 7; i++) hiss(c, o, t + 0.02 + rnd() * 0.25, 0.04, 0.1 * level, 'bandpass', 2500 + rnd() * 3000, undefined, 2);
});

/** A cat's meow (pitch 1 = the ginger; strays are higher). */
export const meow = (pitch = 1, level = 0.5, delay = 0) => run((c, o, t0) => {
  const t = t0 + delay;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  const f = 480 * pitch;
  osc.frequency.setValueAtTime(f * 0.85, t);
  osc.frequency.linearRampToValueAtTime(f * 1.45, t + 0.16);
  osc.frequency.linearRampToValueAtTime(f * 1.05, t + 0.5);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(900, t);
  bp.frequency.linearRampToValueAtTime(1900, t + 0.18);
  bp.frequency.linearRampToValueAtTime(1100, t + 0.52);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16 * level, t + 0.05);
  g.gain.setValueAtTime(0.16 * level, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
  osc.connect(bp).connect(g).connect(o);
  osc.start(t);
  osc.stop(t + 0.62);
  osc.onended = () => { osc.disconnect(); bp.disconnect(); g.disconnect(); };
});

/** A go stone set down on the board. */
export const clack = (level = 0.6) => run((c, o, t) => {
  hiss(c, o, t, 0.035, 0.5 * level, 'highpass', 2600, undefined, 0.8, 0.001);
  tone(c, o, t, 0.09, 0.12 * level, 1650, 1500, 'triangle', 0.001);
  tone(c, o, t, 0.16, 0.08 * level, 420, 380, 'sine', 0.001);
});

/** A low hum that bends down (time slowing) or back up. */
export const bend = (down = true, level = 0.5) => run((c, o, t) => {
  tone(c, o, t, 1.3, 0.12 * level, down ? 330 : 110, down ? 90 : 300, 'triangle', 0.08);
  tone(c, o, t, 1.3, 0.06 * level, down ? 495 : 165, down ? 135 : 450, 'sine', 0.08);
});

/** One hoofbeat. */
export const hoof = (level = 0.5, pan = 0) => run((c, o, t) => {
  void pan;
  tone(c, o, t, 0.12, 0.28 * level, 140, 60, 'sine', 0.002);
  hiss(c, o, t, 0.06, 0.16 * level, 'lowpass', 900, undefined, 0.7, 0.001);
});

/** A horse's whinny. */
export const neigh = (level = 0.5) => run((c, o, t) => {
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(620, t);
  osc.frequency.linearRampToValueAtTime(1150, t + 0.25);
  osc.frequency.linearRampToValueAtTime(820, t + 0.7);
  osc.frequency.linearRampToValueAtTime(480, t + 1.1);
  const lfo = c.createOscillator();
  lfo.frequency.value = 17;
  const lg = c.createGain();
  lg.gain.value = 45;
  lfo.connect(lg).connect(osc.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 1.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.1 * level, t + 0.08);
  g.gain.setValueAtTime(0.1 * level, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  osc.connect(bp).connect(g).connect(o);
  osc.start(t); lfo.start(t);
  osc.stop(t + 1.25); lfo.stop(t + 1.25);
  osc.onended = () => { osc.disconnect(); lfo.disconnect(); lg.disconnect(); bp.disconnect(); g.disconnect(); };
});

/** Water: a splash (a net landing, a leap into the lake). */
export const splash = (level = 0.5) => run((c, o, t) => {
  hiss(c, o, t, 0.45, 0.3 * level, 'lowpass', 2400, 500, 0.7, 0.005);
  for (let i = 0; i < 4; i++) tone(c, o, t + 0.05 + rnd() * 0.3, 0.07, 0.05 * level, 500 + rnd() * 500, 1100 + rnd() * 600);
});

/** A sip from the gourd. */
export const sip = (level = 0.5) => run((c, o, t) => {
  for (let i = 0; i < 3; i++) tone(c, o, t + i * 0.22, 0.14, 0.12 * level, 170 + i * 25, 290 + i * 30, 'sine', 0.01);
  tone(c, o, t + 0.8, 0.3, 0.05 * level, 660, 520, 'triangle', 0.02);
});

/** The moon's shimmer: glassy high partials. */
export const shimmer = (level = 0.5) => run((c, o, t) => {
  const f = [1318.5, 1760, 1975.5, 2637, 3520];
  f.forEach((hz, i) => tone(c, o, t + i * 0.09, 1.6 - i * 0.15, 0.035 * level, hz, hz * 1.003, 'sine', 0.02));
});

/** A few bright bell notes rising (flowers opening). */
export const bloom = (level = 0.5) => run((c, o, t) => {
  const f = [587.3, 659.3, 784, 880, 1046.5, 1174.7];
  f.forEach((hz, i) => {
    tone(c, o, t + i * 0.07, 0.9, 0.05 * level, hz, hz, 'sine', 0.005);
    tone(c, o, t + i * 0.07, 0.4, 0.015 * level, hz * 3, hz * 3, 'sine', 0.005);
  });
});

/** A soft flap of wings. */
export const flap = (level = 0.4) => run((c, o, t) => {
  for (let i = 0; i < 3; i++) hiss(c, o, t + i * 0.13, 0.09, 0.14 * level, 'bandpass', 700, 400, 1.2, 0.02);
});

export function closeSkillSound(): void {
  const c = ac;
  ac = null;
  out = null;
  if (c) c.close().catch(() => {});
}
