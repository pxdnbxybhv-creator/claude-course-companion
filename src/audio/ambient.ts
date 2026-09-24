// Ambient beds. Each bed owns a fader pair (dry → mixer.ambient, wet → mixer.send), starts its
// continuous layers at `when`, and schedules discrete events (drops, gusts, qin notes) against the
// audio clock from `tick(until)`: the engine calls tick every ~200 ms with until = now + lookahead;
// the lab calls it once with the whole render length. Everything disconnects after stop().
import type { AmbientKind } from '../core/types';
import { makeRng, type Rng } from '../core/rng';
import type { Mixer } from './graph';
import type { NoiseColour } from './dsp';
import { OPEN_STRINGS, playHarmonic, playPluck } from './voices';

export interface Bed {
  readonly kind: AmbientKind;
  /** Schedule everything that starts before `until` (context seconds). */
  tick(until: number): void;
  /** Fade out from `when` (~2 s) and release every node. */
  stop(when: number): void;
  /** True once stopped and fully released. */
  readonly done: boolean;
}

const FADE_IN_TAU = 0.6, FADE_OUT_TAU = 0.55;

abstract class BaseBed implements Bed {
  abstract readonly kind: AmbientKind;
  readonly out: GainNode;
  readonly wet: GainNode;
  done = false;
  protected stopped = false;
  protected rng: Rng;
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];

  constructor(protected mix: Mixer, protected start: number, level: number, wetLevel: number, seed: number) {
    this.rng = makeRng(seed);
    this.out = this.gain(0);
    this.wet = this.gain(0);
    this.out.connect(mix.ambient);
    this.wet.connect(mix.send);
    for (const [g, v] of [[this.out, level], [this.wet, wetLevel]] as const) {
      g.gain.setValueAtTime(0, start);
      g.gain.setTargetAtTime(v, start, FADE_IN_TAU);
    }
  }

  /** If the scheduler fell behind (throttled timers), skip ahead instead of bursting. */
  protected fresh(t: number): number {
    const now = this.mix.ctx.currentTime;
    return t < now ? now + 0.05 : t;
  }

  protected track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  protected gain(v: number): GainNode {
    const g = this.track(this.mix.ctx.createGain());
    g.gain.value = v;
    return g;
  }
  protected biquad(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.track(this.mix.ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  /** A looping noise source starting at a random point of its loop. */
  protected noise(colour: NoiseColour): AudioBufferSourceNode {
    const s = this.track(this.mix.ctx.createBufferSource());
    s.buffer = this.mix.noise(colour);
    s.loop = true;
    s.start(this.start, this.rng() * s.buffer.duration);
    this.sources.push(s);
    return s;
  }
  /** A slow sine LFO driving `param` by ±depth around its value. */
  protected lfo(param: AudioParam, rate: number, depth: number) {
    const ctx = this.mix.ctx;
    const o = this.track(ctx.createOscillator());
    o.frequency.value = rate;
    const ph = this.rng() * Math.PI * 2; // a sine at a random phase, so layers never move in lockstep
    o.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, Math.sin(ph)]), new Float32Array([0, Math.cos(ph)])));
    const g = this.gain(depth);
    o.connect(g).connect(param);
    o.start(this.start);
    this.sources.push(o);
  }
  /** Chains nodes and returns the last. */
  protected chain(...ns: AudioNode[]): AudioNode {
    for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
    return ns[ns.length - 1];
  }

  abstract tick(until: number): void;

  stop(when: number) {
    if (this.stopped) return;
    this.stopped = true;
    for (const g of [this.out, this.wet]) {
      g.gain.cancelScheduledValues(when);
      g.gain.setValueAtTime(g.gain.value, when);
      g.gain.setTargetAtTime(0, when, FADE_OUT_TAU);
    }
    const end = when + FADE_OUT_TAU * 7;
    const srcs = this.sources;
    if (!srcs.length) { this.release(); return; }
    let left = srcs.length;
    for (const s of srcs) {
      s.onended = () => { if (--left === 0) this.release(); };
      try { s.stop(end); } catch { /* already stopped */ }
    }
  }

  private release() {
    // One-shot voices inside the bed disconnect themselves; give the longest (a qin note, ≤ 6.5 s)
    // time to finish before the faders go.
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
    this.wet.disconnect();
    this.nodes = [];
    this.sources = [];
    this.done = true;
  }
}

/** Poisson process helper: next event time. */
const exp = (rng: Rng, rate: number) => -Math.log(1 - rng()) / rate;

// ---------------------------------------------------------------------------
// 雨 — rain on leaves and tiles: a pink hiss, a softer high patter, a low body, sparse droplets,
// and now and then a heavier drip from the eaves into a stone basin.

class RainBed extends BaseBed {
  readonly kind = 'rain' as const;
  private nextDrop: number;
  private nextEave: number;
  private eaveSpots: number[];

  constructor(mix: Mixer, when: number, seed: number) {
    super(mix, when, 0.62, 0.06, seed);
    const hissG = this.gain(0.5);
    this.chain(this.noise('pink'), this.biquad('highpass', 420, 0.5), this.biquad('lowpass', 6500, 0.4), hissG, this.out);
    this.lfo(hissG.gain, 0.019, 0.12);
    const patterG = this.gain(0.16);
    this.chain(this.noise('white'), this.biquad('bandpass', 3200, 0.5), this.biquad('lowpass', 8000, 0.5), patterG, this.out);
    this.lfo(patterG.gain, 0.031, 0.05);
    this.chain(this.noise('brown'), this.biquad('lowpass', 380, 0.6), this.gain(0.5), this.out);
    this.nextDrop = when + 0.3;
    this.nextEave = when + 1.5 + this.rng() * 2;
    this.eaveSpots = [-0.55, 0.2, 0.62];
  }

  tick(until: number) {
    if (this.stopped) return;
    const { rain, eave } = this.mix.dropBanks();
    const r = this.rng;
    this.nextDrop = this.fresh(this.nextDrop);
    this.nextEave = this.fresh(this.nextEave);
    while (this.nextDrop < until) {
      this.mix.play(r.pick(rain), this.nextDrop, {
        gain: 0.035 + 0.09 * r() * r(), pan: r.range(-0.85, 0.85), rate: r.range(0.8, 1.25), dest: this.out,
      });
      this.nextDrop += exp(r, 7);
    }
    while (this.nextEave < until) {
      const pan = r.pick(this.eaveSpots);
      this.mix.play(r.pick(eave), this.nextEave, {
        gain: r.range(0.1, 0.2), pan, rate: r.range(0.9, 1.08), dest: this.out, send: 0.9, sendDest: this.wet,
      });
      // Eaves drip in loose rhythms, sometimes a quick double.
      this.nextEave += r.chance(0.2) ? r.range(0.18, 0.4) : r.range(1.4, 4.2);
    }
  }
}

// ---------------------------------------------------------------------------
// 溪 — a mountain stream: noise through slowly wandering band-passes over a soft low rush,
// with bubbling (many small rising-pitch bubbles, sometimes in babbling clusters).

class StreamBed extends BaseBed {
  readonly kind = 'stream' as const;
  private nextBubble: number;

  constructor(mix: Mixer, when: number, seed: number) {
    super(mix, when, 0.7, 0.05, seed);
    this.chain(this.noise('brown'), this.biquad('lowpass', 320, 0.6), this.gain(0.42), this.out);
    const bands: [number, number, number][] = [[240, 2.5, 0.5], [560, 3.5, 0.42], [1250, 4, 0.3], [2700, 3, 0.16], [5200, 2, 0.06]];
    for (const [f, q, g] of bands) {
      const bp = this.biquad('bandpass', f, q);
      const gg = this.gain(g);
      this.chain(this.noise(f < 1000 ? 'pink' : 'white'), bp, gg, this.out);
      this.lfo(bp.frequency, this.rng.range(0.05, 0.23), f * this.rng.range(0.15, 0.3));
      this.lfo(bp.Q, this.rng.range(0.07, 0.3), q * 0.35);
      this.lfo(gg.gain, this.rng.range(0.09, 0.45), g * 0.45);
    }
    this.nextBubble = when + 0.2;
  }

  tick(until: number) {
    if (this.stopped) return;
    const { bubble } = this.mix.dropBanks();
    const r = this.rng;
    this.nextBubble = this.fresh(this.nextBubble);
    while (this.nextBubble < until) {
      const cluster = r.chance(0.12) ? r.int(3, 6) : 1;
      let t = this.nextBubble;
      for (let k = 0; k < cluster; k++) {
        this.mix.play(r.pick(bubble), t, { gain: 0.02 + 0.05 * r() * r(), pan: r.range(-0.6, 0.6), rate: r.range(0.75, 1.3), dest: this.out });
        t += r.range(0.02, 0.07);
      }
      this.nextBubble += exp(r, 11);
    }
  }
}

// ---------------------------------------------------------------------------
// 松风 — wind in the pines: dark noise whose cutoff and level follow randomly timed gusts,
// a needle hiss that grows with gust strength, and a faint whistle that drifts in pitch.

class PinesBed extends BaseBed {
  readonly kind = 'pines' as const;
  private nextGust: number;
  private core: BiquadFilterNode;
  private coreG: GainNode;
  private midG: GainNode;
  private needleG: GainNode;
  private whistleG: GainNode;

  constructor(mix: Mixer, when: number, seed: number) {
    super(mix, when, 0.8, 0.04, seed);
    this.core = this.biquad('lowpass', 400, 0.5);
    this.coreG = this.gain(0.25);
    this.chain(this.noise('brown'), this.core, this.coreG, this.out);
    this.midG = this.gain(0.08);
    this.chain(this.noise('pink'), this.biquad('bandpass', 850, 0.7), this.midG, this.out);
    this.needleG = this.gain(0.03);
    this.chain(this.noise('white'), this.biquad('bandpass', 3800, 1.1), this.biquad('lowpass', 7000), this.needleG, this.out);
    const wbp = this.biquad('bandpass', 1900, 28);
    this.whistleG = this.gain(0.01);
    this.chain(this.noise('white'), wbp, this.whistleG, this.out);
    this.lfo(wbp.frequency, 0.043, 260);
    this.lfo(this.whistleG.gain, 0.11, 0.004);
    this.nextGust = when;
  }

  private setWind(t: number, s: number, tau: number) {
    this.core.frequency.setTargetAtTime(220 + 900 * s, t, tau);
    this.coreG.gain.setTargetAtTime(0.18 + 0.42 * s, t, tau);
    this.midG.gain.setTargetAtTime(0.04 + 0.16 * s, t, tau);
    this.needleG.gain.setTargetAtTime(0.012 + 0.07 * s * s, t, tau * 1.2);
    this.whistleG.gain.setTargetAtTime(0.004 + 0.02 * s * s, t, tau * 1.4);
  }

  tick(until: number) {
    if (this.stopped) return;
    const r = this.rng;
    this.nextGust = this.fresh(this.nextGust);
    while (this.nextGust < until) {
      const t = this.nextGust;
      const s = 0.35 + 0.65 * Math.pow(r(), 1.4); // gust strength
      const rise = r.range(0.8, 2.2);
      this.setWind(t, s, rise / 2.5);
      const hold = r.range(1.2, 3.5);
      const lull = r.range(0.05, 0.3);
      this.setWind(t + rise + hold, lull, r.range(0.8, 1.6));
      this.nextGust = t + rise + hold + r.range(2, 7);
    }
  }
}

// ---------------------------------------------------------------------------
// 琴 — slow generative guqin. One mode per session (宫, 徵 or 羽), phrases of 3–7 notes in three
// textures — 散 (open strings, low), 按 (stopped, with 綽注 glides, 上下 slides and 吟猱), 泛
// (harmonics, higher and lighter) — linked by a stepwise random walk, cadencing on the mode's
// tonic or fifth, with 撮 octave dyads now and then, and long silences between phrases. A short
// motif memory lets later phrases vary earlier contours, so it sounds composed, not random.

type Texture = 'san' | 'an' | 'fan';
interface QinEvent { t: number; deg: number; vel: number; tex: Texture; slide?: number; glide?: number; vib?: boolean; dyad?: number }

class QinBed extends BaseBed {
  readonly kind = 'qin' as const;
  private queue: QinEvent[] = [];
  private phraseAt: number;
  private tonic: number;
  private last: number;
  private lastTex: Texture[] = [];
  private motifs: number[][] = [];

  constructor(mix: Mixer, when: number, seed: number) {
    super(mix, when, 0.55, 0.5, seed);
    this.tonic = this.rng.pick([0, 3, 4]); // 宫 F · 徵 C · 羽 D
    this.last = this.tonic;
    this.phraseAt = when + 0.8;
  }

  private pickTexture(): Texture {
    const r = this.rng;
    let tex: Texture = r() < 0.5 ? 'an' : r() < 0.5 ? 'san' : 'fan';
    if (this.lastTex.length >= 2 && this.lastTex.every((x) => x === tex)) tex = tex === 'an' ? r.pick(['san', 'fan'] as const) : 'an';
    this.lastTex = [...this.lastTex.slice(-1), tex];
    return tex;
  }

  private compose(t0: number): number {
    const r = this.rng;
    const tex = this.pickTexture();
    const [lo, hi] = tex === 'san' ? [-7, 2] : tex === 'an' ? [-3, 7] : [5, 13];
    const n = tex === 'fan' ? r.int(4, 7) : r.int(3, 6);
    // contour: vary a remembered motif (transposed) or take a fresh random walk
    let steps: number[];
    if (this.motifs.length && r.chance(0.3)) {
      steps = r.pick(this.motifs).slice(0, n).map((s) => (r.chance(0.2) ? -s : s));
    } else {
      steps = [];
      for (let i = 0; i < n; i++) {
        const x = r();
        steps.push((x < 0.62 ? 1 : x < 0.87 ? 2 : r.pick([3, 5])) * (r.chance(0.5) ? 1 : -1));
      }
      this.motifs = [...this.motifs.slice(-3), steps];
    }
    let d = Math.max(lo, Math.min(hi, this.last + (tex === 'fan' ? 5 : tex === 'san' ? -5 : 0)));
    const ioi = tex === 'fan' ? [0.45, 0.9] : tex === 'an' ? [0.8, 1.6] : [0.9, 1.9];
    let t = t0;
    const cadence = [this.tonic, this.tonic + 3, this.tonic - 2]; // tonic, fifth above, fourth below
    for (let i = 0; i < n; i++) {
      const lastNote = i === n - 1;
      if (i > 0) {
        d += steps[i];
        if (d < lo || d > hi) d -= 2 * steps[i]; // reflect off the register walls
      }
      if (lastNote) {
        // cadence: settle on the nearest tonic/fifth in any octave
        let best = d, bd = 99;
        for (const c of cadence) for (let o = -3; o <= 3; o++) {
          const cand = c + 5 * o;
          if (cand >= lo && cand <= hi && Math.abs(cand - d) < bd) { bd = Math.abs(cand - d); best = cand; }
        }
        d = best;
      }
      const ev: QinEvent = { t, deg: d, vel: (i === 0 ? 0.62 : 0.44) + r.range(-0.06, 0.08), tex };
      if (tex === 'san') {
        // open strings where the pitch exists on one, stopped otherwise
        if (!OPEN_STRINGS.includes(d)) ev.tex = 'an';
      }
      if (ev.tex === 'an') {
        if (r.chance(0.28)) ev.glide = r.pick([-1, 1]) * r.range(60, 140); // 綽 / 注
        if (!lastNote && r.chance(0.22)) ev.slide = r.pick([-1, 1]); // 上 / 下 one scale step
        ev.vib = r.chance(0.55) || lastNote;
      }
      if (tex !== 'fan' && r.chance(0.1)) ev.dyad = d - 5; // 撮: octave below
      this.queue.push(ev);
      const dt = r.range(ioi[0], ioi[1]) * (i === n - 2 ? 1.35 : 1) * (r.chance(0.15) ? 0.5 : 1);
      t += dt;
      this.last = d;
    }
    // 留白: a long rest before the next phrase
    return t + r.range(2.5, 7.5) + (tex === 'fan' ? 1.5 : 0);
  }

  tick(until: number) {
    if (this.stopped) return;
    // drop notes that fell behind a throttled timer; then compose far enough ahead
    const now = this.mix.ctx.currentTime;
    while (this.queue.length && this.queue[0].t < now) this.queue.shift();
    this.phraseAt = this.fresh(this.phraseAt);
    while (this.phraseAt < until) this.phraseAt = this.compose(this.phraseAt);
    const semis = [0, 2, 4, 7, 9];
    while (this.queue.length && this.queue[0].t < until) {
      const ev = this.queue.shift()!;
      const o = { dest: this.out, sendDest: this.wet, send: 1 };
      if (ev.tex === 'fan') {
        playHarmonic(this.mix, ev.t, ev.deg, ev.vel * 0.9, 0.9, { ...o, gain: 0.42 });
        continue;
      }
      const note: Parameters<typeof playPluck>[4] = { decay: 0.85 };
      note.glide = ev.glide ? { cents: ev.glide, time: 0.14 } : { cents: -12, time: 0.05 };
      note.vibrato = ev.vib && ev.tex === 'an' ? { cents: this.rng.range(6, 16), rate: this.rng.range(4.2, 5.8), delay: this.rng.range(0.35, 0.7) } : undefined;
      if (ev.slide) {
        const d = ev.deg, m = ((d % 5) + 5) % 5;
        const target = ev.slide > 0 ? (m === 4 ? 12 - semis[m] : semis[m + 1] - semis[m]) : (m === 0 ? -(12 - semis[4]) : semis[m - 1] - semis[m]);
        note.slides = [{ at: this.rng.range(0.35, 0.7), cents: target * 100, time: this.rng.range(0.14, 0.3) }];
      }
      if (ev.tex === 'san') { note.vibrato = undefined; note.glide = undefined; }
      playPluck(this.mix, ev.t, ev.deg, ev.vel, note, { ...o, gain: 0.55 });
      if (ev.dyad !== undefined) playPluck(this.mix, ev.t + 0.012, ev.dyad, ev.vel * 0.7, { decay: 0.85, vibrato: undefined, glide: undefined }, { ...o, gain: 0.45 });
    }
  }
}

export function createBed(kind: AmbientKind, mix: Mixer, when: number, seed: number): Bed | null {
  switch (kind) {
    case 'rain': return new RainBed(mix, when, seed);
    case 'stream': return new StreamBed(mix, when, seed);
    case 'pines': return new PinesBed(mix, when, seed);
    case 'qin': return new QinBed(mix, when, seed);
    default: return null;
  }
}
