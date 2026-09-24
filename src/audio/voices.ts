// One-shot sounds, scheduled on a Mixer at an absolute context time `when`.
import { renderBell, renderHarmonic, renderKnock, renderQin, type QinNote } from './dsp';
import type { Mixer, VoiceOpts } from './graph';

/**
 * 正调 tuning: the seven strings are C2 D2 F2 G2 A2 C3 D3 (徵 羽 宫 商 角 徵 羽) with 宫 = F.
 * Degree 0 is 宫 F3 — the middle of the qin's stopped-note register; each 5 degrees is an octave.
 */
export const GONG = 174.614; // F3
export const PENTATONIC = [0, 2, 4, 7, 9]; // 宫 商 角 徵 羽
export const OPEN_STRINGS = [-7, -6, -5, -4, -3, -2, -1]; // C2 … D3 as degrees

export function degreeSemitones(d: number): number {
  const o = Math.floor(d / 5);
  return 12 * o + PENTATONIC[d - 5 * o];
}
export const degreeFreq = (d: number, tonic = GONG) => tonic * Math.pow(2, degreeSemitones(Math.round(d)) / 12);

/** Keep plucks inside the instrument: roughly C2 (65 Hz) … F5 (700 Hz). */
export function qinRange(f: number): number {
  while (f > 720) f /= 2;
  while (f < 64) f *= 2;
  return f;
}

let seedCounter = 1;
const nextSeed = () => (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0);

/** A 古琴 pluck (按音 stopped note with a small 綽 glide and a late, gentle 吟). */
export function playPluck(mix: Mixer, when: number, degree = 0, velocity = 0.7, note: Partial<QinNote> = {}, o: VoiceOpts = {}) {
  const freq = note.freq ?? qinRange(degreeFreq(degree));
  const buf = renderQin(mix.sampleRate, {
    glide: { cents: -18, time: 0.07 },
    vibrato: { cents: 6, rate: 5.2, delay: 0.45 },
    seed: nextSeed(),
    ...note,
    freq,
    velocity,
  });
  return mix.play(mix.buffer([buf]), when, {
    gain: 0.62,
    pan: Math.max(-0.25, Math.min(0.25, Math.log2(freq / 220) * 0.12)),
    send: 0.26,
    ...o,
  });
}

/** A 泛音 harmonic at the frequency of `degree`. */
export function playHarmonic(mix: Mixer, when: number, degree: number, velocity = 0.6, decay = 1, o: VoiceOpts = {}) {
  const freq = degreeFreq(degree);
  const buf = renderHarmonic(mix.sampleRate, freq, velocity, decay, nextSeed());
  return mix.play(mix.buffer([buf]), when, {
    gain: 0.5,
    pan: Math.max(-0.35, Math.min(0.35, Math.log2(freq / 520) * 0.3)),
    send: 0.34,
    ...o,
  });
}

/**
 * The check-in reward: a rising pentatonic phrase of harmonics resolving on 宫 (F5).
 * streak 1–2: two notes · 3–6: three · 7+: four · 7+ also adds a soft open-string 宫 beneath
 * the last note (a warmer voicing), and 21+ lets a low harmonic octave bloom under it.
 */
export function playChime(mix: Mixer, when: number, streak = 1) {
  const s = Math.max(1, Math.floor(streak));
  const phrases: number[][] =
    s >= 7 ? [[5, 7, 8, 10], [6, 7, 8, 10], [3, 6, 8, 10]]
    : s >= 3 ? [[7, 8, 10], [6, 8, 10]]
    : [[8, 10], [7, 10]];
  const phrase = phrases[s % phrases.length];
  let t = when;
  phrase.forEach((d, i) => {
    const last = i === phrase.length - 1;
    const v = last ? 0.62 : 0.4 + 0.06 * i;
    playHarmonic(mix, t, d, v, last ? 1.25 : 0.8);
    // rubato: the phrase leans forward, then waits a breath before the resolution
    t += last ? 0 : i === phrase.length - 2 ? 0.24 : 0.17;
  });
  if (s >= 7) playPluck(mix, t + 0.012, -5, 0.38, { vibrato: undefined, glide: undefined, decay: 0.9 }, { gain: 0.42, send: 0.3 });
  if (s >= 21) playHarmonic(mix, t + 0.03, 5, 0.3, 1.3, { gain: 0.35 });
}

const cache = new WeakMap<BaseAudioContext, { bell?: AudioBuffer; knocks?: AudioBuffer[] }>();
function cacheFor(mix: Mixer) {
  let c = cache.get(mix.ctx);
  if (!c) cache.set(mix.ctx, (c = {}));
  return c;
}

/** A struck bronze bowl (颂钵) at 宫, ringing ~8 s. */
export function playBell(mix: Mixer, when: number, gain = 0.5) {
  const c = cacheFor(mix);
  c.bell ??= mix.buffer(renderBell(mix.sampleRate));
  return mix.play(c.bell, when, { gain, send: 0.22 });
}

/** A soft wooden knock (木鱼). */
export function playKnock(mix: Mixer, when: number, gain = 0.5) {
  const c = cacheFor(mix);
  c.knocks ??= [1, 2, 3].map((s) => mix.buffer([renderKnock(mix.sampleRate, s)]));
  const b = c.knocks[Math.floor(Math.random() * c.knocks.length)];
  return mix.play(b, when, { gain, send: 0.12, rate: 1 + (Math.random() - 0.5) * 0.02 });
}
