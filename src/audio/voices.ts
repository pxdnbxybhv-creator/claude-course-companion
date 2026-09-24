// One-shot sounds, scheduled on a Mixer at an absolute context time `when`.
import type { QinNote } from './dsp';
import type { Job } from './jobs';
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

/** The qin note the engine plays for a degree (按音 with a small 綽 glide and a late, gentle 吟). */
export function pluckNote(degree: number, velocity: number, note: Partial<QinNote> = {}): QinNote {
  return {
    glide: { cents: -18, time: 0.07 },
    vibrato: { cents: 6, rate: 5.2, delay: 0.45 },
    seed: nextSeed(),
    ...note,
    freq: note.freq ?? qinRange(degreeFreq(degree)),
    velocity,
  };
}
const pluckVoice = (freq: number, o: VoiceOpts): VoiceOpts => ({
  gain: 0.8, pan: Math.max(-0.25, Math.min(0.25, Math.log2(freq / 220) * 0.12)), send: 0.26, ...o,
});
const harmJob = (degree: number, velocity: number, decay: number): Job =>
  ({ op: 'harm', freq: degreeFreq(degree), vel: velocity, decay, seed: nextSeed() });
const harmVoice = (degree: number, o: VoiceOpts): VoiceOpts => ({
  gain: 0.5, pan: Math.max(-0.35, Math.min(0.35, Math.log2(degreeFreq(degree) / 520) * 0.3)), send: 0.34, ...o,
});

/** A 古琴 pluck. */
export function playPluck(mix: Mixer, when: number, degree = 0, velocity = 0.7, note: Partial<QinNote> = {}, o: VoiceOpts = {}) {
  const n = pluckNote(degree, velocity, note);
  mix.synth([{ op: 'qin', note: n }], ([c]) => mix.play(mix.buffer(c), when, pluckVoice(n.freq, o)));
}

/** A 泛音 harmonic at the frequency of `degree`. */
export function playHarmonic(mix: Mixer, when: number, degree: number, velocity = 0.6, decay = 1, o: VoiceOpts = {}) {
  mix.synth([harmJob(degree, velocity, decay)], ([c]) => mix.play(mix.buffer(c), when, harmVoice(degree, o)));
}

/**
 * The check-in reward: a rising pentatonic phrase of harmonics resolving on 宫 (F5).
 * streak 1–2: two notes · 3–6: three · 7+: four, plus a soft open-string 宫 beneath the last
 * note (a warmer voicing) · 21+: a low harmonic octave also blooms under the resolution.
 * All notes render first, then the phrase is scheduled as a whole so its rhythm stays intact.
 */
export function playChime(mix: Mixer, when: number, streak = 1) {
  const s = Math.max(1, Math.floor(streak));
  const phrases: number[][] =
    s >= 7 ? [[5, 7, 8, 10], [6, 7, 8, 10], [3, 6, 8, 10]]
    : s >= 3 ? [[7, 8, 10], [6, 8, 10]]
    : [[7, 10], [8, 10]]; // index s % n: streak 1 → sol→do, the most resolved
  const phrase = phrases[s % phrases.length];
  const jobs: Job[] = [];
  const plan: { at: number; o: VoiceOpts }[] = [];
  let t = 0;
  phrase.forEach((d, i) => {
    const last = i === phrase.length - 1;
    jobs.push(harmJob(d, last ? 0.62 : 0.4 + 0.06 * i, last ? 1.25 : 0.8));
    plan.push({ at: t, o: harmVoice(d, {}) });
    // rubato: the phrase leans forward, then waits a breath before the resolution
    t += last ? 0 : i === phrase.length - 2 ? 0.24 : 0.17;
  });
  if (s >= 7) {
    const n = pluckNote(-5, 0.38, { vibrato: undefined, glide: undefined, decay: 0.9 });
    jobs.push({ op: 'qin', note: n });
    plan.push({ at: t + 0.012, o: pluckVoice(n.freq, { gain: 0.42, send: 0.3 }) });
  }
  if (s >= 21) {
    jobs.push(harmJob(5, 0.3, 1.3));
    plan.push({ at: t + 0.03, o: harmVoice(5, { gain: 0.35 }) });
  }
  mix.synth(jobs, (res) => {
    if (mix.ctx.currentTime - when > 0.5) return; // too late to be a reward for that tap
    const t0 = mix.at(when);
    res.forEach((chans, i) => mix.play(mix.buffer(chans), t0 + plan[i].at, plan[i].o));
  });
}

/** A struck bronze bowl (颂钵) at 宫, ringing ~8 s. */
export function playBell(mix: Mixer, when: number, gain = 0.5) {
  mix.cached('bell', { op: 'bell' }, (b) => mix.play(b, when, { gain, send: 0.22 }, 2));
}

/** A soft wooden knock (木鱼): three cached variants, lightly varied in pitch. */
export function playKnock(mix: Mixer, when: number, gain = 0.5) {
  const v = 1 + Math.floor(Math.random() * 3);
  mix.cached(`knock${v}`, { op: 'knock', seed: v }, (b) =>
    mix.play(b, when, { gain, send: 0.12, rate: 1 + (Math.random() - 0.5) * 0.02 }));
}
