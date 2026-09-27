// 水月幻镜 · the sound effects, synthesised once (behind 研墨) into buffers and replayed with rate
// jitter (GDD §22). Pure: Float32Array in, no Web Audio — the tests render every voice in node.
//
//   melee hit 木鱼 · shot hit bamboo flick · talisman small bell · summon 古琴 · crit 磬 · pickup 泛音 on
//   宫商角徵羽 · 铜钱 「叮」 on 宫 · level-up 磬 · boss 锣 · 照破 bowl · the mirror cracking.
// Every pitched voice sits on the app's 宫 F, so a chime never lands a semitone off the music.
import { addMode, addNoiseBurst, bandpass, clamp, fadeTail, filter, highpass, lowpass, peakOf, renderBell, renderDrop, renderHarmonic, renderKnock, renderQin, scale, TAU } from '../../../audio/dsp';
import { renderBo, renderDrum, renderGong, renderLing, renderPlucks } from '../../../audio/music-dsp';
import { makeRng } from '../../../core/rng';
import type { SfxName } from '../types';

/** 宫 F: degree d of the F pentatonic, in Hz (degree 0 = F4 349.2 Hz). */
export function gongHz(d: number): number {
  const steps = [0, 2, 4, 7, 9];
  const o = Math.floor(d / 5);
  return 349.228 * Math.pow(2, (12 * o + steps[((d % 5) + 5) % 5]) / 12);
}

type Chans = Float32Array[];
const mono = (x: Float32Array): Chans => [x];

function norm(x: Float32Array, peak: number): Float32Array {
  return scale(x, peak / (peakOf(x) || 1));
}
function mixInto(out: Float32Array, x: Float32Array, at: number, g: number) {
  for (let i = 0; i < x.length && at + i < out.length; i++) out[at + i] += x[i] * g;
}

/** 磬: a stone chime — inharmonic modes, a dry strike. */
function qing(sr: number, f: number, dur: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(Math.ceil(dur * sr));
  for (const [r, a, t] of [[1, 1, dur * 0.9], [2.76, 0.5, dur * 0.5], [5.4, 0.22, dur * 0.25], [8.93, 0.08, dur * 0.12]] as const) addMode(out, sr, f * r, a, t, 0, rng() * TAU, 0.001);
  addNoiseBurst(out, sr, rng, 0.25, 0.0012, [bandpass(sr, 3000, 0.9)]);
  return fadeTail(norm(out, 0.8), sr, Math.min(0.3, dur * 0.2));
}
/** A small bright clink of bronze on bronze (铜钱). */
function clink(sr: number, f: number, seed: number, dur = 0.35): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(Math.ceil(dur * sr));
  for (const [r, a, t] of [[1, 1, dur * 0.8], [1.51, 0.55, dur * 0.5], [2.37, 0.35, dur * 0.3], [3.9, 0.15, dur * 0.15]] as const) addMode(out, sr, f * r, a, t, 0, rng() * TAU, 0.0004);
  addNoiseBurst(out, sr, rng, 0.4, 0.0006, [highpass(sr, 5000)]);
  return fadeTail(norm(out, 0.8), sr, 0.06);
}

/** Render one voice (channels; mono or stereo). Deterministic for a given (name, sr). */
export function renderVoice(name: SfxName, sr: number): Chans {
  const rng = makeRng(0x6d31 + name.length * 131 + name.charCodeAt(0));
  switch (name) {
    case 'hitMelee': return mono(norm(renderKnock(sr, 5, 0.75), 0.7));
    case 'hitShot': {
      // a bamboo flick: a hollow tick and a dry fibre snap
      const out = new Float32Array(Math.ceil(0.14 * sr));
      addMode(out, sr, 1180, 1, 0.05, 0, 0, 0.0004);
      addMode(out, sr, 2650, 0.45, 0.03, 0, 1, 0.0003);
      addNoiseBurst(out, sr, rng, 0.8, 0.004, [bandpass(sr, 3200, 1.2)]);
      return mono(fadeTail(norm(out, 0.6), sr, 0.03));
    }
    case 'hitTalisman': return mono(norm(renderLing(sr, gongHz(12), 3).subarray(0, Math.ceil(0.9 * sr)), 0.5));
    case 'summon': return mono(fadeTail(norm(renderQin(sr, { freq: gongHz(0) / 2, velocity: 0.6, seed: 11, dur: 1.8 }), 0.7), sr, 0.3));
    case 'crit': return mono(qing(sr, gongHz(7), 0.9, 21));
    case 'pickup': return mono(norm(renderHarmonic(sr, gongHz(5), 0.5, 0.25, 4), 0.45));
    case 'coin': {
      // 「叮」: a clink, then the 宫 rings
      const out = new Float32Array(Math.ceil(1.2 * sr));
      mixInto(out, clink(sr, 2793.8, 5), 0, 0.7);
      mixInto(out, renderLing(sr, gongHz(10), 9), Math.round(0.012 * sr), 0.55);
      return mono(fadeTail(norm(out, 0.7), sr, 0.3));
    }
    case 'coinString': {
      const out = new Float32Array(Math.ceil(1.1 * sr));
      for (let i = 0; i < 6; i++) mixInto(out, clink(sr, 2400 + rng() * 900, 30 + i, 0.25), Math.round((0.03 + i * 0.055 + rng() * 0.02) * sr), 0.5 + rng() * 0.3);
      mixInto(out, renderLing(sr, gongHz(10), 13), Math.round(0.34 * sr), 0.5);
      return mono(fadeTail(norm(out, 0.72), sr, 0.3));
    }
    case 'coinTen': {
      const out = new Float32Array(Math.ceil(2.2 * sr));
      mixInto(out, clink(sr, 1860, 41, 0.6), 0, 0.8);
      mixInto(out, renderLing(sr, gongHz(5), 17), Math.round(0.01 * sr), 0.7);
      mixInto(out, renderHarmonic(sr, gongHz(10), 0.5, 0.5, 8), Math.round(0.12 * sr), 0.45);
      return mono(fadeTail(norm(out, 0.78), sr, 0.4));
    }
    case 'levelUp': return mono(qing(sr, gongHz(0), 2.4, 31));
    case 'gong': return mono(norm(renderGong(sr, 'xiao', 2), 0.65));
    case 'bell': return renderBell(sr, 174.614, 9);
    case 'merge': {
      const out = new Float32Array(Math.ceil(1.4 * sr));
      [5, 7, 10].forEach((d, i) => mixInto(out, renderHarmonic(sr, gongHz(d), 0.5, 0.35, 50 + i), Math.round(i * 0.07 * sr), 0.5));
      return mono(fadeTail(norm(out, 0.6), sr, 0.3));
    }
    case 'hurt': {
      // a heartbeat on the big drum: lub-dub
      const out = new Float32Array(Math.ceil(0.6 * sr));
      const d = renderDrum(sr, 'big', 3);
      mixInto(out, d, 0, 1); mixInto(out, d, Math.round(0.16 * sr), 0.6);
      filter(out, lowpass(sr, 420, 0.7));
      return mono(fadeTail(norm(out, 0.75), sr, 0.1));
    }
    case 'dodge': {
      // a sleeve through air: a quick band-passed swell
      const n = Math.ceil(0.22 * sr);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / n; out[i] = (rng() * 2 - 1) * Math.sin(Math.PI * t) * Math.sin(Math.PI * t); }
      filter(out, bandpass(sr, 1400, 0.8)); filter(out, bandpass(sr, 1800, 0.7));
      return mono(norm(out, 0.35));
    }
    case 'kill': {
      // ink bursting into the paper: a soft puff over a low pop
      const out = new Float32Array(Math.ceil(0.3 * sr));
      addMode(out, sr, 150, 1, 0.09, 0, 0, 0.001);
      addNoiseBurst(out, sr, rng, 1.2, 0.02, [lowpass(sr, 1800, 0.7), highpass(sr, 200)]);
      return mono(fadeTail(norm(out, 0.5), sr, 0.08));
    }
    case 'bossDrum': {
      // the entrance: a drum roll that swells into one big stroke (≈1.5 s)
      const out = new Float32Array(Math.ceil(2.4 * sr));
      const tang = renderDrum(sr, 'tang', 5), big = renderDrum(sr, 'big', 7);
      for (let i = 0; i < 16; i++) { const t = 0.05 + i * 0.075 * (1 - i / 40); mixInto(out, tang, Math.round(t * sr), 0.25 + (i / 16) * 0.6); }
      mixInto(out, big, Math.round(1.25 * sr), 1.2);
      return mono(fadeTail(norm(out, 0.8), sr, 0.5));
    }
    case 'phaseBreak': return mono(norm(renderGong(sr, 'da', 4), 0.8));
    case 'beatTick': {
      const out = new Float32Array(Math.ceil(0.09 * sr));
      addMode(out, sr, 1750, 1, 0.03, 0, 0, 0.0005);
      addNoiseBurst(out, sr, rng, 0.3, 0.001, [highpass(sr, 3000)]);
      return mono(norm(out, 0.3));
    }
    case 'buy': {
      // an abacus bead, then the coin drops into the old man's box
      const out = new Float32Array(Math.ceil(0.7 * sr));
      mixInto(out, renderKnock(sr, 8, 0.6).subarray(0, Math.ceil(0.12 * sr)), 0, 0.4);
      mixInto(out, clink(sr, 2500, 61, 0.4), Math.round(0.07 * sr), 0.6);
      return mono(fadeTail(norm(out, 0.6), sr, 0.1));
    }
    case 'reroll': {
      // a quick 古筝 sweep up the strings
      const notes = [0, 1, 2, 3, 4, 5].map((d, i) => ({ t: i * 0.035, freq: gongHz(d), vel: 0.4 + i * 0.05 }));
      const [L, R] = renderPlucks(sr, 'zheng', notes, 7);
      const n = Math.min(L.length, Math.ceil(1.1 * sr));
      return [fadeTail(norm(L.slice(0, n), 0.55), sr, 0.2), fadeTail(norm(R.slice(0, n), 0.55), sr, 0.2)];
    }
    case 'crate': {
      // the lacquered case opens: a wooden tok, a clasp, a little bell inside
      const out = new Float32Array(Math.ceil(1 * sr));
      mixInto(out, renderKnock(sr, 12, 0.7), 0, 0.5);
      mixInto(out, clink(sr, 3300, 71, 0.15), Math.round(0.06 * sr), 0.3);
      mixInto(out, renderLing(sr, gongHz(7), 21), Math.round(0.14 * sr), 0.4);
      return mono(fadeTail(norm(out, 0.65), sr, 0.25));
    }
    case 'shatter': {
      // 镜碎: a crack runs through the bronze, glassy shards ring and scatter, a dull thud beneath
      const out = new Float32Array(Math.ceil(2 * sr));
      addMode(out, sr, 70, 1, 0.3, 0, 0, 0.002);
      for (let i = 0; i < 9; i++) {
        const at = Math.round((0.01 + i * 0.045 + rng() * 0.03) * sr);
        addNoiseBurst(out, sr, rng, 0.8 - i * 0.05, 0.004 + rng() * 0.004, [highpass(sr, 2500), bandpass(sr, 3000 + rng() * 4000, 1.5)], at);
        addMode(out, sr, 1800 + rng() * 3200, 0.3, 0.4 + rng() * 0.6, at, rng() * TAU, 0.0004);
      }
      mixInto(out, renderBo(sr, 3), Math.round(0.02 * sr), 0.25);
      return mono(fadeTail(norm(out, 0.8), sr, 0.4));
    }
    case 'ritualCoins': {
      // two strings of coins fall into the pond (0.8 s): clinks, then drops and bubbles
      const out = new Float32Array(Math.ceil(1.6 * sr));
      for (let i = 0; i < 8; i++) mixInto(out, clink(sr, 2200 + rng() * 1200, 90 + i, 0.25), Math.round((0.02 + i * 0.05) * sr), 0.45);
      for (let i = 0; i < 5; i++) mixInto(out, renderDrop(sr, 500 + rng() * 700, 12 + rng() * 20, 0.015, 120 + i, 0.4), Math.round((0.45 + i * 0.07) * sr), 0.6);
      return mono(fadeTail(norm(out, 0.65), sr, 0.4));
    }
    case 'ritualGlint': {
      // the free run: a breath of moonlight, three harmonics rising to 宫
      const out = new Float32Array(Math.ceil(1.8 * sr));
      [7, 8, 10].forEach((d, i) => mixInto(out, renderHarmonic(sr, gongHz(d), 0.45, 0.4, 70 + i), Math.round(i * 0.12 * sr), 0.5));
      return mono(fadeTail(norm(out, 0.55), sr, 0.4));
    }
    case 'uiTap': {
      const out = new Float32Array(Math.ceil(0.08 * sr));
      addMode(out, sr, 900, 1, 0.035, 0, 0, 0.0006);
      addNoiseBurst(out, sr, rng, 0.2, 0.001, [bandpass(sr, 2400, 1)]);
      return mono(norm(out, 0.25));
    }
  }
}

/** The pickup voice for a degree of the pentatonic (the combo climbs 宫商角徵羽). */
export function renderPickup(sr: number, degree: number): Float32Array {
  const d = clamp(Math.round(degree), 0, 14);
  return norm(renderHarmonic(sr, gongHz(5 + d), 0.45, 0.22, 100 + d), 0.4);
}

/** Every sfx name (the voices prime() renders). */
export const SFX_NAMES: readonly SfxName[] = [
  'hitMelee', 'hitShot', 'hitTalisman', 'summon', 'crit', 'pickup', 'coin', 'coinString', 'coinTen', 'levelUp',
  'gong', 'bell', 'merge', 'hurt', 'dodge', 'kill', 'bossDrum', 'phaseBreak', 'beatTick', 'buy', 'reroll',
  'crate', 'shatter', 'ritualCoins', 'ritualGlint', 'uiTap',
];

/** Mixing: gain, reverb send, per-kind cap per 50 ms, and whether the music ducks under it. */
export const SFX_MIX: Record<SfxName, { gain: number; send: number; cap: number; duck?: number }> = {
  hitMelee: { gain: 0.45, send: 0.06, cap: 2 },
  hitShot: { gain: 0.4, send: 0.05, cap: 2 },
  hitTalisman: { gain: 0.3, send: 0.15, cap: 1 },
  summon: { gain: 0.5, send: 0.25, cap: 1 },
  crit: { gain: 0.38, send: 0.2, cap: 1 },
  pickup: { gain: 0.35, send: 0.15, cap: 2 },
  coin: { gain: 0.6, send: 0.2, cap: 2 },
  coinString: { gain: 0.65, send: 0.2, cap: 1 },
  coinTen: { gain: 0.75, send: 0.25, cap: 1, duck: 0.6 },
  levelUp: { gain: 0.7, send: 0.3, cap: 1, duck: 0.45 },
  gong: { gain: 0.6, send: 0.3, cap: 1, duck: 0.5 },
  bell: { gain: 0.55, send: 0.25, cap: 1, duck: 0.4 },
  merge: { gain: 0.55, send: 0.25, cap: 1 },
  hurt: { gain: 0.7, send: 0.05, cap: 1 },
  dodge: { gain: 0.4, send: 0.1, cap: 1 },
  kill: { gain: 0.35, send: 0.08, cap: 2 },
  bossDrum: { gain: 0.8, send: 0.2, cap: 1, duck: 0.35 },
  phaseBreak: { gain: 0.7, send: 0.3, cap: 1, duck: 0.35 },
  beatTick: { gain: 0.3, send: 0.05, cap: 1 },
  buy: { gain: 0.55, send: 0.15, cap: 1 },
  reroll: { gain: 0.5, send: 0.2, cap: 1 },
  crate: { gain: 0.6, send: 0.2, cap: 1 },
  shatter: { gain: 0.85, send: 0.3, cap: 1, duck: 0.25 },
  ritualCoins: { gain: 0.7, send: 0.25, cap: 1 },
  ritualGlint: { gain: 0.6, send: 0.3, cap: 1 },
  uiTap: { gain: 0.35, send: 0.05, cap: 2 },
};
