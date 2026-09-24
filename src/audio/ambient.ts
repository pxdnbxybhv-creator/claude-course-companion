// Ambient beds. Each bed owns a fader pair (dry → mixer.ambient, wet → mixer.send), starts its
// continuous layers at `when`, and schedules discrete events (drops, gusts, qin notes) against the
// audio clock from `tick(until)`: the engine calls tick every ~200 ms with until = now + lookahead;
// the lab calls it once with the whole render length. Everything disconnects after stop().
import type { AmbientKind } from '../core/types';
import { makeRng, type Rng } from '../core/rng';
import type { Mixer } from './graph';
import { TAU, type NoiseColour } from './dsp';
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
  /** A looping noise source starting at a random point of its loop (once its buffer exists). */
  protected noise(colour: NoiseColour): AudioBufferSourceNode {
    const s = this.track(this.mix.ctx.createBufferSource());
    s.loop = true;
    const offset = this.rng();
    this.mix.noise(colour, (b) => {
      if (this.stopped) return;
      s.buffer = b;
      s.start(this.mix.at(this.start), offset * b.duration);
      this.sources.push(s);
    });
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
    const end = when + FADE_OUT_TAU * 7; // −56 dB
    // A silent sentinel guarantees an 'ended' event at the end of the fade even for beds with no
    // continuous layers (the qin), so ringing notes fade instead of being cut.
    const ctx = this.mix.ctx;
    const sentinel = this.track(ctx.createBufferSource());
    sentinel.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    sentinel.loop = true;
    sentinel.connect(this.out);
    sentinel.start(when);
    const srcs = [...this.sources, sentinel];
    let left = srcs.length;
    for (const s of srcs) {
      s.onended = () => { if (--left === 0) this.release(); };
      try { s.stop(end); } catch { if (--left === 0) this.release(); }
    }
  }

  private release() {
    // One-shot voices inside the bed disconnect themselves when they end; by now the faders are
    // at −56 dB, so disconnecting them is inaudible.
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
    super(mix, when, 0.24, 0.025, seed);
    const hissG = this.gain(0.5);
    this.chain(this.noise('pink'), this.biquad('highpass', 420, 0.5), this.biquad('lowpass', 6500, 0.4), hissG, this.out);
    this.lfo(hissG.gain, 0.019, 0.12);
    const patterG = this.gain(0.16);
    this.chain(this.noise('white'), this.biquad('bandpass', 3200, 0.5), this.biquad('lowpass', 8000, 0.5), patterG, this.out);
    this.lfo(patterG.gain, 0.031, 0.05);
    this.chain(this.noise('brown'), this.biquad('lowpass', 380, 0.6), this.gain(0.18), this.out);
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
    super(mix, when, 0.26, 0.02, seed);
    this.chain(this.noise('brown'), this.biquad('lowpass', 320, 0.6), this.gain(0.1), this.out);
    const bands: [number, number, number][] = [[240, 2.5, 0.7], [560, 3.5, 1.1], [1250, 4, 1], [2700, 3, 0.55], [5200, 2, 0.2]];
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
    super(mix, when, 0.38, 0.016, seed);
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
    this.core.frequency.setTargetAtTime(300 + 1100 * s, t, tau);
    this.coreG.gain.setTargetAtTime(0.05 + 0.12 * s, t, tau);
    this.midG.gain.setTargetAtTime(0.1 + 0.5 * s, t, tau);
    this.needleG.gain.setTargetAtTime(0.025 + 0.15 * s * s, t, tau * 1.2);
    this.whistleG.gain.setTargetAtTime(0.006 + 0.03 * s * s, t, tau * 1.4);
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
  /** Last ~64 played events (for the lab's score view). */
  readonly history: QinEvent[] = [];
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
    // Phrase contour: the line leans towards an arch, a fall, a rise or a wave of a few degrees.
    const shape = r.pick([(u: number) => Math.sin(Math.PI * u), (u: number) => -u, (u: number) => u, (u: number) => Math.sin(TAU * u)]);
    const span = r.int(2, 4) * (r.chance(0.5) ? 1 : -1);
    // A remembered motif (its intervals, maybe inverted) biases the choices — variation, not a copy.
    const motif = this.motifs.length && r.chance(0.35) ? r.pick(this.motifs).map((x) => (r.chance(0.3) ? -x : x)) : null;
    const cadence = [this.tonic, this.tonic + 3, this.tonic - 2]; // tonic, fifth above, fourth below
    const isCadence = (d: number) => cadence.some((c) => (((d - c) % 5) + 5) % 5 === 0);
    const IW = [0.25, 1, 0.6, 0.25, 0.1, 0.22]; // weight by interval size in scale steps (5 = octave)

    // start near where the last phrase ended, moved into this texture's register
    let start = this.last;
    while (start < lo) start += 5;
    while (start > hi) start -= 5;
    start = Math.max(lo, Math.min(hi, start + r.int(-1, 1)));
    const degs = [start];
    for (let i = 1; i < n; i++) {
      const prev = degs[i - 1], prev2 = i > 1 ? degs[i - 2] : NaN;
      const target = start + span * shape(i / (n - 1));
      const last = i === n - 1;
      const cands: number[] = [], ws: number[] = [];
      for (let c = prev - 5; c <= prev + 5; c++) {
        const iv = Math.abs(c - prev);
        if (c < lo || c > hi || (iv > 3 && iv < 5)) continue;
        if (last && !isCadence(c)) continue;
        let w = IW[iv] * Math.exp(-((c - target) ** 2) / 4.5);
        const pingPong = c === prev2 && prev !== prev2 && (i < 3 || degs[i - 3] === prev);
        if (c === prev2 && prev !== prev2) w *= pingPong ? 0.03 : 0.35; // no A-B-A-B
        if (c === prev && prev === prev2) w *= 0.05; // no triple repeats
        if (motif && c - prev === motif[(i - 1) % motif.length] && !pingPong) w *= 3;
        if (last) w *= iv <= 2 ? 2 : 0.3; // approach the cadence by step
        cands.push(c); ws.push(w);
      }
      if (!cands.length) { degs.push(prev); continue; }
      let x = r() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (k < ws.length - 1 && (x -= ws[k]) > 0) k++;
      degs.push(cands[k]);
    }
    this.motifs = [...this.motifs.slice(-3), degs.slice(1).map((d, i) => d - degs[i])];

    // Rhythm in beats: mostly even, some short pairs and held notes; the penultimate note broadens.
    const beat = tex === 'fan' ? r.range(0.42, 0.6) : tex === 'an' ? r.range(0.7, 0.95) : r.range(0.85, 1.15);
    let t = t0;
    degs.forEach((d, i) => {
      const lastNote = i === n - 1;
      const ev: QinEvent = { t, deg: d, vel: (i === 0 ? 0.62 : 0.46) + r.range(-0.06, 0.08), tex };
      if (tex === 'san' && !OPEN_STRINGS.includes(d)) ev.tex = 'an'; // open string where one exists
      let beats = r.pick([1, 1, 1, 0.5, 1.5, 2]);
      if (ev.tex === 'an') {
        if (r.chance(0.28)) ev.glide = r.pick([-1, 1]) * r.range(60, 140); // 綽 / 注
        if (!lastNote && r.chance(0.2)) { ev.slide = r.pick([-1, 1]); beats = Math.max(beats, 1.5); } // 上 / 下
        ev.vib = r.chance(0.55) || lastNote;
      }
      if (tex !== 'fan' && (i === 0 || lastNote) && d - 5 >= -7 && r.chance(0.18)) ev.dyad = d - 5; // 撮 octave
      if (i === n - 2) beats *= 1.4;
      this.queue.push(ev);
      t += beats * beat * r.range(0.92, 1.08);
    });
    this.last = degs[n - 1];
    // 留白: rest before the next phrase
    return t + r.range(1.8, 5.5) + (tex === 'fan' ? 1 : 0);
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
      this.history.push(ev);
      if (this.history.length > 64) this.history.shift();
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
