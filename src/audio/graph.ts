// The node graph, built on any BaseAudioContext (realtime or offline):
//
//   voices ─► input ─┐
//   voices ─► send ──┴► convolver (procedural pavilion IR) ─► wet ─┐
//   beds ───► ambient ──────────────────────────────────────────────┼► master (volume) ─► compressor ─► soft clip ─► destination
//
// Every one-shot voice disconnects its nodes when it ends, so nothing accumulates.
import { renderDrop, renderIR, renderNoise, type NoiseColour } from './dsp';
import { makeRng } from '../core/rng';

export interface VoiceOpts {
  gain?: number;
  /** -1 (left) … 1 (right). */
  pan?: number;
  /** Reverb send level (0 = dry). */
  send?: number;
  /** Playback-rate multiplier (pitch shift for droplets). */
  rate?: number;
  /** Override destinations (ambient beds route voices through their own faders). */
  dest?: AudioNode;
  sendDest?: AudioNode;
}

/** Soft-knee ceiling: identity below 0.8, then eases asymptotically towards 0.98. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export interface DropBanks { rain: AudioBuffer[]; bubble: AudioBuffer[]; eave: AudioBuffer[] }

export class Mixer {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly input: GainNode;
  readonly send: GainNode;
  readonly ambient: GainNode;
  /** Live one-shot voices (sources started and not yet ended). */
  voices = 0;
  private noiseCache = new Map<NoiseColour, AudioBuffer>();
  private drops?: DropBanks;
  private hasPanner: boolean;

  constructor(ctx: BaseAudioContext, dest: AudioNode = ctx.destination) {
    this.ctx = ctx;
    this.hasPanner = typeof ctx.createStereoPanner === 'function';
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    // Gentle glue: only the rare pile-up (bell + chime + qin bed) touches it.
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.3;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    this.master.connect(comp).connect(clip).connect(dest);

    this.input = ctx.createGain();
    this.input.connect(this.master);
    this.ambient = ctx.createGain();
    this.ambient.connect(this.master);

    this.send = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.normalize = false;
    const [l, r] = renderIR(ctx.sampleRate);
    verb.buffer = this.buffer([l, r]);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.send.connect(verb).connect(wet).connect(this.master);
  }

  get sampleRate() { return this.ctx.sampleRate; }

  buffer(chans: Float32Array[]): AudioBuffer {
    const b = this.ctx.createBuffer(chans.length, chans[0].length, this.ctx.sampleRate);
    chans.forEach((c, i) => b.getChannelData(i).set(c));
    return b;
  }

  /** Plays a buffer once; all nodes are disconnected when it ends. */
  play(buf: AudioBuffer, when: number, o: VoiceOpts = {}): AudioBufferSourceNode {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (o.rate && o.rate !== 1) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g);
    const nodes: AudioNode[] = [src, g];
    let tail: AudioNode = g;
    if (o.pan && this.hasPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(o.dest ?? this.input);
    if (o.send && o.send > 0) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      tail.connect(s);
      s.connect(o.sendDest ?? this.send);
      nodes.push(s);
    }
    this.voices++;
    src.onended = () => {
      this.voices--;
      for (const n of nodes) n.disconnect();
      src.onended = null;
    };
    src.start(Math.max(when, 0));
    return src;
  }

  /** A seamless stereo noise loop (generated once per context). */
  noise(colour: NoiseColour): AudioBuffer {
    let b = this.noiseCache.get(colour);
    if (!b) {
      const sr = this.ctx.sampleRate;
      const secs = colour === 'brown' ? 9 : 7;
      const seed = colour === 'white' ? 101 : colour === 'pink' ? 202 : 303;
      b = this.buffer([renderNoise(colour, sr, secs, seed), renderNoise(colour, sr, secs, seed + 1)]);
      this.noiseCache.set(colour, b);
    }
    return b;
  }

  /** Banks of pre-rendered droplets and bubbles, varied further at playback by rate/gain/pan. */
  dropBanks(): DropBanks {
    if (this.drops) return this.drops;
    const sr = this.ctx.sampleRate;
    const rng = makeRng(4242);
    const mk = (n: number, f: [number, number], rise: [number, number], tau: [number, number], splash: number) =>
      Array.from({ length: n }, (_, i) =>
        this.buffer([renderDrop(sr, rng.range(f[0], f[1]), rng.range(rise[0], rise[1]), rng.range(tau[0], tau[1]), 900 + i, splash)]));
    this.drops = {
      rain: mk(10, [1400, 4200], [6, 22], [0.004, 0.012], 0.25),
      bubble: mk(12, [320, 1300], [10, 35], [0.008, 0.022], 0),
      eave: mk(5, [650, 1250], [3, 9], [0.03, 0.06], 0.6),
    };
    return this.drops;
  }
}
