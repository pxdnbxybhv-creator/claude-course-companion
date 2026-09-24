// Pure-JS synthesis kernels. Everything here renders into Float32Arrays at a given sample
// rate and touches no Web Audio API, so the realtime engine and the OfflineAudioContext
// tests in the lab share exactly the same sound.
import { makeRng, type Rng } from '../core/rng';

export const TAU = Math.PI * 2;
const LN1000 = Math.log(1000); // amplitude ratio of a 60 dB decay

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------------------
// Biquads (RBJ cookbook), direct form I, applied in place.

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function bq(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function wc(sr: number, f: number, q: number) {
  const w = (TAU * Math.min(f, sr * 0.49)) / sr;
  return { c: Math.cos(w), al: Math.sin(w) / (2 * q) };
}
export function lowpass(sr: number, f: number, q = Math.SQRT1_2): Biquad {
  const { c, al } = wc(sr, f, q);
  return bq((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
}
export function highpass(sr: number, f: number, q = Math.SQRT1_2): Biquad {
  const { c, al } = wc(sr, f, q);
  return bq((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
}
/** Band-pass with 0 dB peak gain. */
export function bandpass(sr: number, f: number, q: number): Biquad {
  const { c, al } = wc(sr, f, q);
  return bq(al, 0, -al, 1 + al, -2 * c, 1 - al);
}
export function peaking(sr: number, f: number, q: number, db: number): Biquad {
  const { c, al } = wc(sr, f, q);
  const A = Math.pow(10, db / 40);
  return bq(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
}
export function filter(x: Float32Array, k: Biquad, from = 0, to = x.length): Float32Array {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const { b0, b1, b2, a1, a2 } = k;
  for (let i = from; i < to; i++) {
    const x0 = x[i];
    const y = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

export function peakOf(x: Float32Array, from = 0, to = x.length): number {
  let p = 0;
  for (let i = from; i < to; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}
export function scale(x: Float32Array, g: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
/** Raised-cosine fade over the last `sec` seconds. */
export function fadeTail(x: Float32Array, sr: number, sec: number): Float32Array {
  const n = Math.min(x.length, Math.round(sec * sr));
  const s = x.length - n;
  for (let i = 0; i < n; i++) x[s + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / n);
  return x;
}
function subtractMean(x: Float32Array) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length || 1;
  for (let i = 0; i < x.length; i++) x[i] -= m;
}

/**
 * Adds an exponentially decaying sinusoid (one vibrational mode) to `out`, starting at sample
 * `start`, using a two-pole resonator recursion (no per-sample trig). `attack` is a raised-cosine
 * onset in seconds — a struck object's modes build up over a few milliseconds.
 */
export function addMode(out: Float32Array, sr: number, freq: number, amp: number, t60: number, start = 0, phase = 0, attack = 0.002) {
  const w = (TAU * freq) / sr;
  if (w >= Math.PI * 0.98 || amp === 0) return;
  const r = Math.exp(-LN1000 / (t60 * sr));
  const k = 2 * r * Math.cos(w), r2 = r * r;
  // Seed y[-1], y[-2] so that y[n] = amp·r^n·sin(wn + phase).
  let y1 = (amp / r) * Math.sin(phase - w);
  let y2 = (amp / r2) * Math.sin(phase - 2 * w);
  const n = Math.min(out.length - start, Math.ceil(t60 * sr * 1.1));
  const na = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < n; i++) {
    const y = k * y1 - r2 * y2;
    y2 = y1; y1 = y;
    out[start + i] += i < na ? y * (0.5 - 0.5 * Math.cos((Math.PI * i) / na)) : y;
  }
}

/** A short noise burst with an exponential envelope, band-limited — a strike, a fingernail, a tick. */
export function addNoiseBurst(out: Float32Array, sr: number, rng: Rng, amp: number, tau: number, k: Biquad[], start = 0) {
  const n = Math.min(out.length - start, Math.ceil(tau * 7 * sr));
  const b = new Float32Array(n);
  const a = Math.max(1, Math.round(0.0004 * sr));
  for (let i = 0; i < n; i++) b[i] = (rng() * 2 - 1) * Math.exp(-i / (tau * sr)) * Math.min(1, i / a);
  for (const f of k) filter(b, f);
  for (let i = 0; i < n; i++) out[start + i] += b[i] * amp;
}

// ---------------------------------------------------------------------------
// 古琴 — a plucked silk string. Karplus–Strong / digital waveguide with a fractional,
// time-varying delay (so 綽注 glides, 吟猱 vibrato and 上下 slides move the string length itself,
// as the left hand does), a one-pole loop filter tuned per note to hit a target T60 at the
// fundamental and at 2.5 kHz, two polarisations (double decay), a fingertip/nail transient,
// silk "slide squeak", and a paulownia-body EQ.

export interface QinNote {
  /** Target pitch in Hz. */
  freq: number;
  /** 0..1 — loudness and brightness. */
  velocity?: number;
  /** Buffer length in seconds (default: from the decay time, ≤ 6.5 s). */
  dur?: number;
  /** Multiplier on the natural decay time. */
  decay?: number;
  /** Glide into the note: 綽 (from below, negative cents) or 注 (from above, positive). */
  glide?: { cents: number; time: number };
  /** 吟猱 vibrato: depth in cents, rate in Hz, onset delay in s. Depth and rate relax over time. */
  vibrato?: { cents: number; rate: number; delay: number };
  /** 上/下 slides after the pluck; `cents` are cumulative offsets reached at `at + time`. */
  slides?: { at: number; cents: number; time: number }[];
  /** Pluck position as a fraction of the string (the qin is plucked near the bridge ≈ 0.1). */
  pos?: number;
  /** Extra brightness 0..1. */
  bright?: number;
  seed?: number;
}

/** Natural T60 of the fundamental: ~9 s for the low C2 string, ~3.5 s at C5. */
export const qinT60 = (f: number) => 9 * Math.pow(Math.max(f, 30) / 65, -0.45);

/** The note's pitch contour in cents, sampled every `step` samples. */
function pitchContour(n: QinNote, sr: number, len: number, step: number): Float32Array {
  const m = Math.ceil(len / step) + 2;
  const c = new Float32Array(m);
  const g = n.glide, v = n.vibrato, sl = n.slides ?? [];
  const dt = step / sr;
  let vph = 0;
  for (let j = 0; j < m; j++) {
    const t = j * dt;
    let cents = 0;
    if (g && g.cents) cents += g.cents * Math.exp(-t / Math.max(0.005, g.time / 3));
    let off = 0;
    for (const s of sl) {
      if (t <= s.at) break;
      const u = clamp((t - s.at) / Math.max(0.01, s.time), 0, 1);
      off += (s.cents - off) * u * u * (3 - 2 * u); // smoothstep: the finger accelerates, then settles
    }
    cents += off;
    if (v && t > v.delay) {
      const tv = t - v.delay;
      // Depth swells in (0.25 s) and relaxes (τ ≈ 1.8 s); the rate slows by ~30 % — the traditional 吟.
      const depth = v.cents * Math.min(1, tv / 0.25) * Math.exp(-tv / 1.8);
      vph += TAU * v.rate * (1 - 0.3 * Math.min(1, tv / 2.5)) * dt;
      cents += depth * Math.sin(vph);
    }
    c[j] = cents;
  }
  return c;
}

function solveLoopPole(f0: number, fh: number, T0: number, Th: number, sr: number): number {
  const w0 = (TAU * f0) / sr, wh = (TAU * fh) / sr;
  const lnH = (p: number, w: number) => 0.5 * Math.log(((1 - p) * (1 - p)) / (1 - 2 * p * Math.cos(w) + p * p));
  const D = (-LN1000 / f0) * (1 / Th - 1 / T0);
  if (D >= 0) return 0;
  let lo = 0, hi = 0.95;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lnH(mid, wh) - lnH(mid, w0) > D) lo = mid; else hi = mid;
  }
  return lo;
}

/** One polarisation of the string, added into `out`. */
function runString(out: Float32Array, sr: number, f0: number, T0: number, Th: number, exc: Float32Array, contour: Float32Array, step: number, detuneCents: number, gain: number) {
  const fh = Math.max(2500, 3 * f0);
  const p = solveLoopPole(f0, fh, T0, Th, sr);
  const w0 = (TAU * f0) / sr;
  const lnH0 = 0.5 * Math.log(((1 - p) * (1 - p)) / (1 - 2 * p * Math.cos(w0) + p * p));
  const g = Math.min(0.99995, Math.exp(-LN1000 / (f0 * T0) - lnH0));
  const pd = Math.atan2(p * Math.sin(w0), 1 - p * Math.cos(w0)) / w0; // loop-filter phase delay at f0
  // Loop length per control step (samples); the loop filter's phase delay is subtracted so the
  // fundamental lands exactly on pitch.
  const Lc = new Float32Array(contour.length);
  for (let j = 0; j < contour.length; j++) Lc[j] = sr / (f0 * Math.pow(2, (contour[j] + detuneCents) / 1200)) - pd;
  let N = 1;
  let maxL = 0;
  for (let j = 0; j < Lc.length; j++) if (Lc[j] > maxL) maxL = Lc[j];
  while (N < maxL + 8) N <<= 1;
  const mask = N - 1;
  const dl = new Float32Array(N);
  const a = 1 - p;
  const len = out.length, ne = exc.length, inv = 1 / step;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const j = (i / step) | 0;
    const L = Lc[j] + (Lc[j + 1] - Lc[j]) * (i - j * step) * inv;
    const r = i - L;
    const ri = Math.floor(r);
    const d = r - ri;
    const xm = dl[(ri - 1) & mask], x0 = dl[ri & mask], x1 = dl[(ri + 1) & mask], x2 = dl[(ri + 2) & mask];
    // 4-point, 3rd-order Lagrange fractional delay
    const dm1 = d - 1, dm2 = d - 2, dp1 = d + 1;
    const y = (-d * dm1 * dm2 * xm) / 6 + (dp1 * dm1 * dm2 * x0) / 2 - (dp1 * d * dm2 * x1) / 2 + (dp1 * d * dm1 * x2) / 6;
    lp = a * y + p * lp;
    let v = g * lp;
    if (i < ne) v += exc[i];
    dl[i & mask] = v;
    out[i] += v * gain;
  }
}

export function renderQin(sr: number, n: QinNote): Float32Array {
  const rng = makeRng(n.seed ?? 1);
  const vel = clamp(n.velocity ?? 0.7, 0.05, 1);
  const f0 = n.freq;
  const T0 = qinT60(f0) * (n.decay ?? 1);
  const dur = n.dur ?? Math.min(6.5, 0.6 + T0 * 0.75);
  const len = Math.ceil(dur * sr);
  const out = new Float32Array(len);
  const step = 32;
  const contour = pitchContour(n, sr, len, step);

  // Excitation: one period of a plucked shape — a triangle with its apex at the pluck point
  // (1/k² harmonics, notches at multiples of 1/pos) blended with comb-filtered noise for grain.
  const L0 = Math.max(8, Math.round(sr / f0));
  const pos = clamp(n.pos ?? 0.11, 0.04, 0.45);
  const apex = Math.max(1, Math.round(pos * L0));
  const nz = new Float32Array(L0);
  for (let i = 0; i < L0; i++) nz[i] = rng() * 2 - 1;
  const exc = new Float32Array(L0);
  const noiseMix = 0.3 + 0.15 * (n.bright ?? 0);
  for (let i = 0; i < L0; i++) {
    const tri = i < apex ? i / apex : (L0 - i) / (L0 - apex);
    const comb = nz[i] - (i >= apex ? nz[i - apex] : 0) * 0.9;
    exc[i] = tri * (1 - noiseMix) + comb * 0.5 * noiseMix;
  }
  // Softer plucks are darker: a one-pole low-pass on the excitation, run twice for a gentle slope.
  const fc = 900 + 6500 * vel * vel * (1 + 0.5 * (n.bright ?? 0));
  const k = Math.exp((-TAU * fc) / sr);
  for (let pass = 0; pass < 2; pass++) {
    let s = 0;
    for (let i = 0; i < L0; i++) { s = (1 - k) * exc[i] + k * s; exc[i] = s; }
  }
  subtractMean(exc);

  const Th = 0.45 + 0.25 * vel;
  runString(out, sr, f0, T0, Th, exc, contour, step, 0, 1);
  runString(out, sr, f0, T0 * 1.4, Th * 1.2, exc, contour, step, 1.3, 0.28);

  // Body: DC block, paulownia air cavity and plate resonances, a little silk presence,
  // a gentle top roll-off for warmth.
  filter(out, highpass(sr, 32, 0.7));
  filter(out, peaking(sr, 108, 1.4, 3.5));
  filter(out, peaking(sr, 265, 2.2, 2.5));
  filter(out, peaking(sr, 640, 1.2, -2));
  filter(out, peaking(sr, 1350, 2, 1.5));
  filter(out, lowpass(sr, 5200, 0.6));

  const pk = peakOf(out, 0, Math.min(len, Math.round(0.4 * sr))) || 1;
  scale(out, (0.85 * Math.pow(vel, 1.25)) / pk);

  // Fingertip-and-nail transient: a brief band-passed tick.
  addNoiseBurst(out, sr, rng, 0.22 * vel * vel, 0.0018, [bandpass(sr, 3200, 0.9), lowpass(sr, 7000)]);

  // Silk squeak while the left hand slides: band-limited noise following the slide speed.
  if (n.slides?.length || (n.glide && Math.abs(n.glide.cents) > 40)) {
    const sq = new Float32Array(len);
    let prev = contour[0];
    for (let j = 1; j < contour.length; j++) {
      const speed = (Math.abs(contour[j] - prev) * sr) / step; // cents per second
      prev = contour[j];
      const a = Math.min(1, speed / 1800) * 0.05 * vel;
      if (a < 1e-5) continue;
      for (let i = j * step; i < Math.min(len, (j + 1) * step); i++) sq[i] = (rng() * 2 - 1) * a;
    }
    filter(sq, bandpass(sr, 1700, 1.1));
    filter(sq, lowpass(sr, 3500));
    for (let i = 0; i < len; i++) out[i] += sq[i];
  }
  return fadeTail(out, sr, Math.min(0.4, dur * 0.2));
}

// ---------------------------------------------------------------------------
// 泛音 — a guqin harmonic: the string touched lightly at a hui node. Nearly pure: the sounding
// partial plus a whisper of its multiples, fast onset, long glassy decay, a slow shimmer.

export function renderHarmonic(sr: number, freq: number, velocity = 0.6, decay = 1, seed = 1): Float32Array {
  const rng = makeRng(seed);
  const vel = clamp(velocity, 0.05, 1);
  const T = 3.6 * Math.pow(freq / 350, -0.35) * decay;
  const dur = Math.min(6.5, T * 0.95);
  const out = new Float32Array(Math.ceil(dur * sr));
  const ph = rng() * 0.3;
  addMode(out, sr, freq, 1, T, 0, ph, 0.004);
  addMode(out, sr, freq * (1 + 0.45 / freq), 0.22, T * 1.15, 0, ph + 1, 0.006); // slow shimmer (≈0.45 Hz beat)
  addMode(out, sr, freq * 2, 0.14 * (0.6 + vel), T * 0.45, 0, rng() * TAU, 0.003);
  addMode(out, sr, freq * 3, 0.045, T * 0.28, 0, rng() * TAU, 0.002);
  addMode(out, sr, freq * 4, 0.015, T * 0.2, 0, rng() * TAU, 0.002);
  scale(out, (0.8 * Math.pow(vel, 1.15)) / (peakOf(out) || 1));
  addNoiseBurst(out, sr, rng, 0.06 * vel, 0.0015, [bandpass(sr, 2600, 1)]);
  return fadeTail(out, sr, Math.min(0.5, dur * 0.2));
}

// ---------------------------------------------------------------------------
// 磬 / 颂钵 — a struck bronze bowl. Inharmonic modes (1 : 2.76 : 5.4 : 8.9 …), each split into a
// slightly detuned doublet (the bowl is never perfectly round) which beats slowly; the doublets
// have different phases in each channel, so the beating circles gently across the stereo field.

export function renderBell(sr: number, f1 = 174.6, seed = 7): [Float32Array, Float32Array] {
  const rng = makeRng(seed);
  const dur = 9;
  const L = new Float32Array(Math.ceil(dur * sr));
  const R = new Float32Array(L.length);
  const modes: [ratio: number, amp: number, t60: number, beat: number][] = [
    [1, 1, 8.5, 0.55],
    [2.76, 0.62, 6, 1.25],
    [5.4, 0.3, 3.6, 2.1],
    [8.9, 0.13, 2.1, 3.3],
    [13.1, 0.05, 1.2, 4.6],
  ];
  for (const [ratio, amp, t60, beat] of modes) {
    const f = f1 * ratio;
    const atk = 0.004 / Math.sqrt(ratio);
    const dph = rng() * TAU;
    for (const [ch, off] of [[L, 0], [R, 1.9]] as const) {
      addMode(ch, sr, f - beat / 2, amp * 0.56, t60, 0, 0, atk);
      addMode(ch, sr, f + beat / 2, amp * 0.44, t60 * 0.92, 0, dph + off, atk);
    }
  }
  // Felt-mallet contact: a soft, dark thud.
  const thud = new Float32Array(Math.ceil(0.08 * sr));
  addNoiseBurst(thud, sr, rng, 1, 0.006, [lowpass(sr, 900, 0.7), lowpass(sr, 1400)]);
  for (let i = 0; i < thud.length; i++) { L[i] += thud[i] * 0.12; R[i] += thud[i] * 0.12; }
  const pk = Math.max(peakOf(L), peakOf(R)) || 1;
  scale(L, 0.85 / pk); scale(R, 0.85 / pk);
  fadeTail(L, sr, 0.6); fadeTail(R, sr, 0.6);
  return [L, R];
}

// ---------------------------------------------------------------------------
// 木鱼 — a hollow wooden fish struck with a padded stick: a woody "tok" — a few damped wood
// modes, a low air-cavity bump and a softened contact click.

export function renderKnock(sr: number, seed = 3, velocity = 0.8): Float32Array {
  const rng = makeRng(seed);
  const vel = clamp(velocity, 0.1, 1);
  const f = 520 * (1 + (rng() - 0.5) * 0.03);
  const out = new Float32Array(Math.ceil(0.5 * sr));
  const modes: [number, number, number][] = [
    [0.37, 0.4, 0.07], // air cavity
    [1, 1, 0.16],
    [1.58, 0.36, 0.075],
    [2.47, 0.2, 0.045],
    [3.93, 0.09, 0.025],
  ];
  for (const [r, a, t] of modes) addMode(out, sr, f * r, a, t, 0, 0, 0.0008);
  addNoiseBurst(out, sr, rng, 0.35 * vel, 0.0012, [bandpass(sr, 2300, 0.8)]);
  filter(out, lowpass(sr, 4200, 0.6));
  filter(out, highpass(sr, 60));
  scale(out, (0.85 * vel) / (peakOf(out) || 1));
  return fadeTail(out, sr, 0.08);
}

// ---------------------------------------------------------------------------
// Water: a drop or a bubble is a sine whose pitch rises as the bubble surfaces (Minnaert), with a
// very fast attack and a short exponential decay.

export function renderDrop(sr: number, f0: number, rise: number, tau: number, seed: number, splash = 0): Float32Array {
  const rng = makeRng(seed);
  const len = Math.ceil((tau * 7 + 0.01) * sr);
  const out = new Float32Array(len);
  let ph = 0;
  const nyq = sr * 0.45;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = Math.min(nyq, f0 * Math.exp(rise * t));
    ph += (TAU * f) / sr;
    const env = (1 - Math.exp(-t / 0.0007)) * Math.exp(-t / tau);
    out[i] = Math.sin(ph) * env;
  }
  if (splash > 0) addNoiseBurst(out, sr, rng, splash, 0.004, [lowpass(sr, 1800), highpass(sr, 150)]);
  scale(out, 0.9 / (peakOf(out) || 1));
  return fadeTail(out, sr, Math.min(0.01, tau));
}

// ---------------------------------------------------------------------------
// Noise beds. Loops are made seamless by cross-fading the overshoot back into the head.

export type NoiseColour = 'white' | 'pink' | 'brown';

export function renderNoise(colour: NoiseColour, sr: number, seconds: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = Math.ceil(seconds * sr), F = Math.ceil(0.25 * sr);
  const x = new Float32Array(n + F);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < x.length; i++) {
    const w = rng() * 2 - 1;
    if (colour === 'white') x[i] = w;
    else if (colour === 'pink') {
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      br = 0.997 * br + w * 0.06; // leaky integrator → ~1/f² above ~20 Hz
      x[i] = br;
    }
  }
  filter(x, highpass(sr, 18, 0.6));
  subtractMean(x);
  const out = x.subarray(0, n).slice();
  for (let i = 0; i < F; i++) {
    const u = i / F;
    out[i] = x[i] * Math.sin((u * Math.PI) / 2) + x[n + i] * Math.cos((u * Math.PI) / 2);
  }
  let rms = 0;
  for (let i = 0; i < n; i++) rms += out[i] * out[i];
  return scale(out, 0.25 / Math.sqrt(rms / n || 1)); // RMS -12 dBFS
}

// ---------------------------------------------------------------------------
// Reverb: a small timber pavilion. Early reflections off posts and the floor, then a diffuse tail
// whose high frequencies die faster than the lows (wood absorbs the top), gently low-cut so the
// low qin strings stay clear. Normalised to unit energy per channel.

export function renderIR(sr: number, t60 = 2.3, seconds = 2.8, seed = 11): [Float32Array, Float32Array] {
  const rng = makeRng(seed);
  const len = Math.ceil(seconds * sr);
  const chans: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  const pre = Math.round(0.012 * sr);
  chans.forEach((x, c) => {
    const r = rng.fork(c + 1);
    // early reflections
    const taps = 11;
    for (let k = 0; k < taps; k++) {
      const t = 0.006 + 0.055 * Math.pow(r(), 1.3) + c * 0.0013;
      const i = Math.round(t * sr);
      if (i < len - 4) {
        const a = (r() < 0.5 ? -1 : 1) * (0.5 + 0.5 * r()) * Math.exp(-t / 0.05) * 0.9;
        x[i] += a * 0.6; x[i + 1] += a * 0.3; x[i + 2] += a * 0.1;
      }
    }
    // diffuse tail with a time-varying low-pass (bright start, dark end)
    const kDecay = LN1000 / (t60 * sr);
    let lp = 0, lp2 = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp(-kDecay * (i - pre)) * (1 - Math.exp(-t / 0.018));
      const fc = 1100 + 7500 * Math.exp(-t / 0.45);
      const a = Math.exp((-TAU * fc) / sr);
      lp = (1 - a) * (r() * 2 - 1) + a * lp;
      lp2 = (1 - a) * lp + a * lp2;
      x[i] += lp2 * env * 1.6;
    }
    filter(x, highpass(sr, 110, 0.6));
    filter(x, peaking(sr, 420, 1.5, 1.5)); // a hint of timber
    fadeTail(x, sr, 0.3);
    let e = 0;
    for (let i = 0; i < len; i++) e += x[i] * x[i];
    scale(x, 1 / Math.sqrt(e || 1));
  });
  return chans;
}
