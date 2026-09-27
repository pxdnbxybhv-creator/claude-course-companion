// 水月幻镜 · the sound effects, synthesised once (behind 研墨) into buffers and replayed with rate
// jitter (GDD §22). Pure: Float32Array in, no Web Audio — the tests render every voice in node.
//
//   melee hit 木鱼 · shot hit bamboo flick · talisman small bell · summon 古琴 · crit 磬 · pickup 泛音 on
//   宫商角徵羽 · 铜钱 「叮」 on 宫 · level-up 磬 · boss 锣 · 照破 bowl · the mirror cracking.
// Every pitched voice sits on the app's 宫 F, so a chime never lands a semitone off the music.
import { addMode, addNoiseBurst, bandpass, clamp, fadeTail, filter, highpass, lowpass, peakOf, peaking, renderBell, renderDrop, renderHarmonic, renderKnock, renderQin, scale, TAU } from '../../../audio/dsp';
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

// ─────────────────────────────────────────────────────────────── impact voices (打击感)
// The hit layer the engine's feel bus plays in sync with the impact frame: a body (a pitch-dropping
// sine: the thump you feel), a transient (noise or a struck mode: the crack you hear) and a class
// colour (bamboo, bronze, jade, wine, ink, stone). Short, dry and loud-ish; the limiter and the
// bus's per-frame cap keep a screen of hits from turning into mush.

/** A sine whose pitch falls from f0 to f1 (time constant tf) under an exponential decay (ta). */
function sweep(out: Float32Array, sr: number, f0: number, f1: number, tf: number, amp: number, ta: number, at = 0): void {
  const n = Math.min(out.length - at, Math.ceil(ta * 7 * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / tf);
    ph += (TAU * f) / sr;
    out[at + i] += Math.sin(ph) * amp * Math.exp(-t / ta) * Math.min(1, i / (0.0006 * sr));
  }
}
/** Noise that swells and fades (sin² envelope) over dur: swishes and whooshes. */
function swell(out: Float32Array, sr: number, rng: () => number, amp: number, dur: number, at = 0, peakAt = 0.5): void {
  const n = Math.min(out.length - at, Math.ceil(dur * sr));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const e = u < peakAt ? Math.sin((u / peakAt) * Math.PI / 2) : Math.cos(((u - peakAt) / (1 - peakAt)) * Math.PI / 2);
    out[at + i] += (rng() * 2 - 1) * e * e * amp;
  }
}
function soft(x: Float32Array, drive: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive);
  return x;
}

/** The impact voices (not in the contract's SfxName: MirrorSound.feel plays them). */
export type FeelVoice =
  | 'thump' | 'crack' | 'slash' | 'smash' | 'arrow' | 'dartHit' | 'spark' | 'splash' | 'blot' | 'jade' | 'clack' | 'pluckHit'
  | 'moonHit' | 'clawHit' | 'pop' | 'popBig' | 'grunt' | 'whoosh' | 'release' | 'zip' | 'heart' | 'skillHit';
export const FEEL_NAMES: readonly FeelVoice[] = [
  'thump', 'crack', 'slash', 'smash', 'arrow', 'dartHit', 'spark', 'splash', 'blot', 'jade', 'clack', 'pluckHit',
  'moonHit', 'clawHit', 'pop', 'popBig', 'grunt', 'whoosh', 'release', 'zip', 'heart', 'skillHit',
];

/** Render one impact voice (mono). Deterministic for a given (name, sr). */
export function renderFeel(name: FeelVoice, sr: number): Chans {
  const rng = makeRng(0x7e11 + name.length * 97 + name.charCodeAt(0) * 7 + name.charCodeAt(name.length - 1));
  const buf = (sec: number) => new Float32Array(Math.ceil(sec * sr));
  switch (name) {
    case 'thump': {
      // the body under crits and heavy hits: a kick-drum drop 150 → 48 Hz, a padded click
      const out = buf(0.32);
      sweep(out, sr, 150, 48, 0.03, 1, 0.075);
      sweep(out, sr, 95, 40, 0.05, 0.5, 0.12);
      addNoiseBurst(out, sr, rng, 0.5, 0.003, [lowpass(sr, 2200, 0.7)]);
      soft(out, 1.6);
      return mono(fadeTail(norm(out, 0.9), sr, 0.06));
    }
    case 'crack': {
      // the crit: a whip-crack transient, a bright struck edge and a short bronze ring
      const out = buf(0.3);
      addNoiseBurst(out, sr, rng, 1, 0.0025, [highpass(sr, 1800), peaking(sr, 4200, 1.2, 6)]);
      addNoiseBurst(out, sr, rng, 0.5, 0.012, [bandpass(sr, 2600, 1.4)], Math.round(0.002 * sr));
      addMode(out, sr, 3120, 0.45, 0.09, 0, 0.3, 0.0002);
      addMode(out, sr, 4870, 0.25, 0.05, 0, 1.1, 0.0002);
      addMode(out, sr, gongHz(12), 0.2, 0.18, Math.round(0.004 * sr), 0, 0.0005);
      sweep(out, sr, 260, 90, 0.015, 0.45, 0.03);
      return mono(fadeTail(norm(out, 0.85), sr, 0.08));
    }
    case 'slash': {
      // a blade biting: a fast swish into a cut, a thin steel ring, a little meat of a thud
      const out = buf(0.3);
      swell(out, sr, rng, 0.55, 0.05, 0, 0.8);
      filter(out, bandpass(sr, 3200, 0.9));
      addNoiseBurst(out, sr, rng, 0.9, 0.006, [highpass(sr, 1500), bandpass(sr, 5200, 1)], Math.round(0.035 * sr));
      addMode(out, sr, 2480, 0.3, 0.12, Math.round(0.035 * sr), 0, 0.0003);
      addMode(out, sr, 3770, 0.18, 0.07, Math.round(0.035 * sr), 1, 0.0003);
      sweep(out, sr, 190, 80, 0.02, 0.7, 0.045, Math.round(0.035 * sr));
      return mono(fadeTail(norm(out, 0.8), sr, 0.06));
    }
    case 'smash': {
      // a heavy blow: a deep drop, crunch of wood and stone, dust
      const out = buf(0.5);
      sweep(out, sr, 120, 36, 0.045, 1, 0.13);
      addNoiseBurst(out, sr, rng, 0.9, 0.02, [lowpass(sr, 1100, 0.8), highpass(sr, 90)]);
      addNoiseBurst(out, sr, rng, 0.5, 0.004, [bandpass(sr, 1900, 1.1)]);
      const k = renderKnock(sr, 17, 1);
      mixInto(out, k.subarray(0, Math.min(k.length, Math.ceil(0.15 * sr))), 0, 0.35);
      soft(out, 1.8);
      return mono(fadeTail(norm(out, 0.9), sr, 0.1));
    }
    case 'arrow': {
      // an arrow sinking in: a hollow bamboo thock, a fibre snap and a small thud
      const out = buf(0.22);
      addMode(out, sr, 820, 1, 0.045, 0, 0, 0.0003);
      addMode(out, sr, 1930, 0.4, 0.025, 0, 1, 0.0003);
      addNoiseBurst(out, sr, rng, 0.8, 0.003, [bandpass(sr, 3600, 1.2)]);
      sweep(out, sr, 170, 85, 0.02, 0.55, 0.04);
      return mono(fadeTail(norm(out, 0.7), sr, 0.04));
    }
    case 'dartHit': {
      // steel on hide: a bright tink and a tick
      const out = buf(0.2);
      addMode(out, sr, 3520, 0.8, 0.06, 0, 0, 0.0002);
      addMode(out, sr, 5310, 0.35, 0.035, 0, 1, 0.0002);
      addNoiseBurst(out, sr, rng, 0.7, 0.0025, [highpass(sr, 2500)]);
      sweep(out, sr, 210, 110, 0.015, 0.4, 0.03);
      return mono(fadeTail(norm(out, 0.65), sr, 0.04));
    }
    case 'spark': {
      // talisman fire: a crackle of little discharges over a falling zap
      const out = buf(0.26);
      for (let i = 0; i < 7; i++) addNoiseBurst(out, sr, rng, 0.9 - i * 0.09, 0.0012, [highpass(sr, 2200)], Math.round((i * 0.011 + rng() * 0.006) * sr));
      let ph = 0;
      const n = Math.ceil(0.09 * sr);
      for (let i = 0; i < n; i++) { const t = i / sr; ph += (TAU * (1900 * Math.exp(-t / 0.03) + 500)) / sr; out[i] += (Math.sin(ph) > 0 ? 0.35 : -0.35) * Math.exp(-t / 0.025); }
      filter(out, lowpass(sr, 7000));
      return mono(fadeTail(norm(out, 0.62), sr, 0.05));
    }
    case 'splash': {
      // wine: a wet slap and two drops
      const out = buf(0.3);
      addNoiseBurst(out, sr, rng, 1, 0.012, [lowpass(sr, 2400), highpass(sr, 200)]);
      mixInto(out, renderDrop(sr, 700, 18, 0.018, 3), Math.round(0.02 * sr), 0.45);
      mixInto(out, renderDrop(sr, 980, 14, 0.014, 4), Math.round(0.055 * sr), 0.3);
      sweep(out, sr, 160, 90, 0.02, 0.4, 0.04);
      return mono(fadeTail(norm(out, 0.65), sr, 0.06));
    }
    case 'blot': {
      // ink landing: a soft, wet, low thud
      const out = buf(0.26);
      sweep(out, sr, 180, 70, 0.03, 1, 0.06);
      addNoiseBurst(out, sr, rng, 0.6, 0.014, [lowpass(sr, 900), highpass(sr, 120)]);
      return mono(fadeTail(norm(out, 0.62), sr, 0.06));
    }
    case 'jade': {
      // a flying sword's edge: glassy inharmonic tink, a hiss
      const out = buf(0.35);
      addMode(out, sr, 2890, 0.8, 0.16, 0, 0, 0.0002);
      addMode(out, sr, 4710, 0.45, 0.09, 0, 1, 0.0002);
      addMode(out, sr, 7020, 0.2, 0.04, 0, 2, 0.0002);
      addNoiseBurst(out, sr, rng, 0.5, 0.004, [highpass(sr, 4000)]);
      sweep(out, sr, 200, 100, 0.015, 0.35, 0.03);
      return mono(fadeTail(norm(out, 0.62), sr, 0.08));
    }
    case 'clack': {
      // go stones: two quick hard clacks (Yunzi on the board)
      const out = buf(0.22);
      for (const [at, f, a] of [[0, 1480, 1], [0.028, 2130, 0.6]] as const) {
        addMode(out, sr, f, a, 0.03, Math.round(at * sr), 0, 0.0002);
        addMode(out, sr, f * 2.31, a * 0.4, 0.018, Math.round(at * sr), 1, 0.0002);
        addNoiseBurst(out, sr, rng, a * 0.6, 0.0015, [highpass(sr, 3000)], Math.round(at * sr));
      }
      return mono(fadeTail(norm(out, 0.7), sr, 0.04));
    }
    case 'pluckHit': {
      // a qin wave landing: a muted string slap on 宫
      const out = buf(0.3);
      addMode(out, sr, gongHz(0) / 2, 1, 0.09, 0, 0, 0.0004);
      addMode(out, sr, gongHz(0), 0.45, 0.06, 0, 1, 0.0004);
      addNoiseBurst(out, sr, rng, 0.5, 0.004, [bandpass(sr, 1400, 1)]);
      sweep(out, sr, 150, 80, 0.02, 0.4, 0.04);
      return mono(fadeTail(norm(out, 0.62), sr, 0.06));
    }
    case 'moonHit': {
      // moonlight: a cool bell-glass tap on 徵
      const out = buf(0.4);
      addMode(out, sr, gongHz(8), 0.8, 0.2, 0, 0, 0.0003);
      addMode(out, sr, gongHz(8) * 2.76, 0.3, 0.08, 0, 1, 0.0003);
      addNoiseBurst(out, sr, rng, 0.4, 0.003, [highpass(sr, 3500)]);
      sweep(out, sr, 170, 90, 0.02, 0.35, 0.03);
      return mono(fadeTail(norm(out, 0.55), sr, 0.1));
    }
    case 'clawHit': {
      // three quick rakes
      const out = buf(0.24);
      for (let k = 0; k < 3; k++) addNoiseBurst(out, sr, rng, 0.9 - k * 0.15, 0.007, [bandpass(sr, 2600 + k * 500, 1.3)], Math.round(k * 0.024 * sr));
      sweep(out, sr, 190, 90, 0.02, 0.6, 0.04);
      return mono(fadeTail(norm(out, 0.68), sr, 0.05));
    }
    case 'pop': {
      // a kill: a crisp, round pop and a puff of ink
      const out = buf(0.2);
      sweep(out, sr, 520, 130, 0.012, 1, 0.03);
      addNoiseBurst(out, sr, rng, 0.8, 0.0035, [bandpass(sr, 2400, 0.9)]);
      addNoiseBurst(out, sr, rng, 0.35, 0.02, [lowpass(sr, 1500), highpass(sr, 200)], Math.round(0.008 * sr));
      return mono(fadeTail(norm(out, 0.7), sr, 0.05));
    }
    case 'popBig': {
      // an elite (or a boss) bursting: a deep pop, a wet splash, a stone-chime tail on 宫
      const out = buf(1.1);
      sweep(out, sr, 300, 55, 0.03, 1, 0.1);
      addNoiseBurst(out, sr, rng, 0.9, 0.03, [lowpass(sr, 2000), highpass(sr, 120)]);
      addNoiseBurst(out, sr, rng, 0.6, 0.004, [bandpass(sr, 2400, 1)]);
      mixInto(out, qing(sr, gongHz(5), 0.9, 77), Math.round(0.02 * sr), 0.35);
      soft(out, 1.5);
      return mono(fadeTail(norm(out, 0.85), sr, 0.25));
    }
    case 'grunt': {
      // you are hit: a body blow and a short, throaty buzz (a clenched 「嗯」)
      const out = buf(0.36);
      sweep(out, sr, 110, 45, 0.04, 1, 0.1);
      const n = Math.ceil(0.12 * sr);
      const v = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; ph += (TAU * (150 - 50 * t / 0.12)) / sr; const saw = (ph / TAU) % 1 * 2 - 1; v[i] = saw * Math.sin(Math.PI * Math.min(1, t / 0.12)) ** 0.6; }
      filter(v, bandpass(sr, 620, 2.2)); filter(v, bandpass(sr, 1100, 1.2));
      mixInto(out, norm(v, 1), Math.round(0.01 * sr), 0.45);
      addNoiseBurst(out, sr, rng, 0.5, 0.006, [lowpass(sr, 1400)]);
      soft(out, 1.4);
      return mono(fadeTail(norm(out, 0.85), sr, 0.08));
    }
    case 'whoosh': {
      // a melee swing cutting the air (plays at the swing, under the impact)
      const out = buf(0.14);
      swell(out, sr, rng, 1, 0.13, 0, 0.35);
      filter(out, bandpass(sr, 1100, 0.7)); filter(out, highpass(sr, 400));
      return mono(fadeTail(norm(out, 0.4), sr, 0.03));
    }
    case 'release': {
      // a shot leaving: a string twang or a flick of the wrist, quiet
      const out = buf(0.14);
      addMode(out, sr, 330, 0.8, 0.05, 0, 0, 0.0003);
      addMode(out, sr, 990, 0.3, 0.03, 0, 1, 0.0003);
      addNoiseBurst(out, sr, rng, 0.5, 0.004, [bandpass(sr, 2400, 1)]);
      return mono(fadeTail(norm(out, 0.4), sr, 0.03));
    }
    case 'zip': {
      // 月华 streaming in: a rising airy zip with a glint at the end
      const out = buf(0.22);
      const n = Math.ceil(0.16 * sr);
      const z = new Float32Array(n);
      swell(z, sr, rng, 1, 0.16, 0, 0.75);
      filter(z, bandpass(sr, 2600, 1.2)); filter(z, highpass(sr, 1200));
      mixInto(out, z, 0, 0.8);
      addMode(out, sr, gongHz(15), 0.35, 0.05, Math.round(0.14 * sr), 0, 0.0005);
      return mono(fadeTail(norm(out, 0.4), sr, 0.04));
    }
    case 'heart': {
      // low HP: a soft lub-dub under everything
      const out = buf(0.5);
      sweep(out, sr, 75, 42, 0.03, 1, 0.07);
      sweep(out, sr, 70, 40, 0.03, 0.65, 0.06, Math.round(0.17 * sr));
      filter(out, lowpass(sr, 300));
      return mono(fadeTail(norm(out, 0.6), sr, 0.08));
    }
    case 'skillHit': {
      // the 镜技 landing: a big low boom, a brush-slap and a bronze shimmer
      const out = buf(1);
      sweep(out, sr, 130, 38, 0.06, 1, 0.18);
      addNoiseBurst(out, sr, rng, 0.8, 0.03, [lowpass(sr, 1600), highpass(sr, 70)]);
      addNoiseBurst(out, sr, rng, 0.6, 0.004, [bandpass(sr, 3000, 1)]);
      mixInto(out, qing(sr, gongHz(3), 0.8, 88), Math.round(0.015 * sr), 0.3);
      soft(out, 1.6);
      return mono(fadeTail(norm(out, 0.9), sr, 0.2));
    }
  }
}

/** Mixing of the impact voices (the same limiter as the contract's voices). */
export const FEEL_MIX: Record<FeelVoice, SfxMix> = {
  thump: { gain: 0.7, send: 0.03, cap: 1 },
  crack: { gain: 0.42, send: 0.1, cap: 1 },
  slash: { gain: 0.5, send: 0.05, cap: 2, spam: true },
  smash: { gain: 0.62, send: 0.06, cap: 1, spam: true },
  arrow: { gain: 0.45, send: 0.04, cap: 2, spam: true },
  dartHit: { gain: 0.34, send: 0.05, cap: 2, spam: true },
  spark: { gain: 0.36, send: 0.08, cap: 2, spam: true },
  splash: { gain: 0.42, send: 0.06, cap: 2, spam: true },
  blot: { gain: 0.45, send: 0.05, cap: 2, spam: true },
  jade: { gain: 0.34, send: 0.12, cap: 2, spam: true },
  clack: { gain: 0.45, send: 0.08, cap: 2, spam: true },
  pluckHit: { gain: 0.4, send: 0.12, cap: 1, spam: true, pitched: true },
  moonHit: { gain: 0.36, send: 0.15, cap: 1, spam: true, pitched: true },
  clawHit: { gain: 0.45, send: 0.04, cap: 2, spam: true },
  pop: { gain: 0.5, send: 0.05, cap: 2, spam: true },
  popBig: { gain: 0.8, send: 0.2, cap: 1, duck: 0.6 },
  grunt: { gain: 0.75, send: 0.04, cap: 1 },
  whoosh: { gain: 0.22, send: 0.04, cap: 1, spam: true },
  release: { gain: 0.2, send: 0.04, cap: 1, spam: true },
  zip: { gain: 0.26, send: 0.1, cap: 1 },
  heart: { gain: 0.55, send: 0.02, cap: 1 },
  skillHit: { gain: 0.85, send: 0.2, cap: 1, duck: 0.5 },
};

/** Render one voice (channels; mono or stereo). Deterministic for a given (name, sr). */
export function renderVoice(name: SfxName, sr: number): Chans {
  const rng = makeRng(0x6d31 + name.length * 131 + name.charCodeAt(0));
  switch (name) {
    case 'hitMelee': {
      // 木鱼 with a body under it: the woodblock tok over a short kick
      const out = new Float32Array(Math.ceil(0.4 * sr));
      mixInto(out, renderKnock(sr, 5, 0.9), 0, 0.75);
      sweep(out, sr, 150, 60, 0.025, 0.7, 0.06);
      return mono(fadeTail(norm(out, 0.78), sr, 0.08));
    }
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
      // ink bursting into the paper: a crisp pop over a puff
      const out = new Float32Array(Math.ceil(0.3 * sr));
      sweep(out, sr, 480, 120, 0.012, 1, 0.035);
      addNoiseBurst(out, sr, rng, 0.9, 0.018, [lowpass(sr, 1800, 0.7), highpass(sr, 200)]);
      return mono(fadeTail(norm(out, 0.6), sr, 0.08));
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

/** How one voice is mixed and limited. */
export interface SfxMix {
  gain: number;
  /** Reverb send. */
  send: number;
  /** Per-kind cap per 50 ms. */
  cap: number;
  /** The music ducks under it (depth). */
  duck?: number;
  /** A combat sound that shares the global 4-per-50 ms window; every other kind is a cue that
   *  checks only its own cap, so hit spam can never starve it. */
  spam?: true;
  /** Tuned to 宫 F: replayed with ±0.8% rate jitter at most (a semitone is 5.9%). */
  pitched?: true;
}

/** Rate jitter: unpitched voices vary freely; pitched ones stay on the F pentatonic. */
export const JITTER = 0.06;
export const PITCHED_JITTER = 0.008;

/** Mixing: gain, reverb send, per-kind cap per 50 ms, whether the music ducks, spam and pitch. */
export const SFX_MIX: Record<SfxName, SfxMix> = {
  hitMelee: { gain: 0.45, send: 0.06, cap: 2, spam: true },
  hitShot: { gain: 0.4, send: 0.05, cap: 2, spam: true },
  hitTalisman: { gain: 0.3, send: 0.15, cap: 1, spam: true, pitched: true },
  summon: { gain: 0.5, send: 0.25, cap: 1, spam: true, pitched: true },
  crit: { gain: 0.38, send: 0.2, cap: 1, spam: true, pitched: true },
  pickup: { gain: 0.35, send: 0.15, cap: 2, spam: true, pitched: true },
  coin: { gain: 0.6, send: 0.2, cap: 2, pitched: true },
  coinString: { gain: 0.65, send: 0.2, cap: 1, pitched: true },
  coinTen: { gain: 0.75, send: 0.25, cap: 1, duck: 0.6, pitched: true },
  levelUp: { gain: 0.7, send: 0.3, cap: 1, duck: 0.45, pitched: true },
  gong: { gain: 0.6, send: 0.3, cap: 1, duck: 0.5, pitched: true },
  bell: { gain: 0.55, send: 0.25, cap: 1, duck: 0.4, pitched: true },
  merge: { gain: 0.55, send: 0.25, cap: 1, pitched: true },
  hurt: { gain: 0.7, send: 0.05, cap: 1 },
  dodge: { gain: 0.4, send: 0.1, cap: 1 },
  kill: { gain: 0.35, send: 0.08, cap: 2, spam: true },
  bossDrum: { gain: 0.8, send: 0.2, cap: 1, duck: 0.35 },
  phaseBreak: { gain: 0.7, send: 0.3, cap: 1, duck: 0.35, pitched: true },
  beatTick: { gain: 0.3, send: 0.05, cap: 1 },
  buy: { gain: 0.55, send: 0.15, cap: 1 },
  reroll: { gain: 0.5, send: 0.2, cap: 1, pitched: true },
  crate: { gain: 0.6, send: 0.2, cap: 1, pitched: true },
  shatter: { gain: 0.85, send: 0.3, cap: 1, duck: 0.25 },
  ritualCoins: { gain: 0.7, send: 0.25, cap: 1 },
  ritualGlint: { gain: 0.6, send: 0.3, cap: 1, pitched: true },
  uiTap: { gain: 0.35, send: 0.05, cap: 2 },
};
