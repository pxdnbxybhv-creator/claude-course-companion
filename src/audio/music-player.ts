// Background music, part 4 — playing it. Web Audio on any BaseAudioContext (the realtime engine
// in music.ts and the lab's OfflineAudioContext use the same code):
//
//   conductor faders (dry · wet · echo), one set per theme instance, so themes crossfade
//     dry  ──────────────────────────────────────────────┐
//     wet  ─► convolver (procedural hall IR) ──────────────┤
//     echo ─► ping-pong delay (valley echo, dark feedback) ┼─► duck ─► volume ─► compressor ─► soft clip ─► out
//
// A Conductor composes one phrase at a time a few seconds ahead of the audio clock, asks for the
// renders (worker or synchronous), and schedules each layer as a single AudioBufferSourceNode.
// Every node is disconnected when it ends; a finished conductor releases its faders.
import { makeRng, mixSeed, type Rng } from '../core/rng';
import type { MusicJob, MusicJobRequest, MusicJobResult } from './music-dsp';
import { runMusicJob } from './music-dsp';
import { Composer, type Phrase } from './music-theory';
import { THEMES, arrange, phraseSeconds, type MusicEvent, type ThemeId } from './music-themes';

/** Most simultaneous music voices (sources). Decorations are dropped first. */
export const MAX_VOICES = 24;

function softClip(): Float32Array<ArrayBuffer> {
  const n = 2049, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25));
  }
  return c;
}

export interface BusOptions { worker?: Worker | null; dest?: AudioNode }

export interface PlayOpts {
  gain: number; pan: number; send: number; echo: number; rate?: number; offset?: number;
  dry: AudioNode; wet: AudioNode; echoDest: AudioNode;
}

export class MusicBus {
  readonly ctx: BaseAudioContext;
  readonly input: GainNode;
  readonly verbIn: GainNode;
  readonly echoIn: GainNode;
  readonly duckG: GainNode;
  readonly volume: GainNode;
  /** Sources created and not yet ended (scheduled ahead included) — returns to 0 when idle. */
  voices = 0;
  /** Most voices sounding at the same moment. */
  peakVoices = 0;
  dropped = 0;
  private spans: { s: number; e: number }[] = [];
  private nodes: AudioNode[] = [];
  private worker: Worker | null;
  private pending = new Map<number, { job: MusicJob; cb: (c: Float32Array[]) => void }>();
  private nextId = 1;
  private bufs = new Map<string, AudioBuffer>();
  private waiters = new Map<string, ((b: AudioBuffer) => void)[]>();
  private hasPanner: boolean;
  private disposed = false;

  constructor(ctx: BaseAudioContext, o: BusOptions = {}) {
    this.ctx = ctx;
    this.hasPanner = typeof ctx.createStereoPanner === 'function';
    this.worker = o.worker ?? null;
    if (this.worker) {
      this.worker.onmessage = (e: MessageEvent<MusicJobResult>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.chans) p.cb(e.data.chans);
        else this.runLocal(p.job, p.cb);
      };
      this.worker.onerror = (e) => {
        e.preventDefault?.();
        this.worker?.terminate();
        this.worker = null;
        const jobs = [...this.pending.values()];
        this.pending.clear();
        for (const p of jobs) this.runLocal(p.job, p.cb);
      };
    }
    const g = (v: number) => { const n = ctx.createGain(); n.gain.value = v; this.nodes.push(n); return n; };
    this.input = g(1);
    this.verbIn = g(1);
    this.echoIn = g(1);
    this.duckG = g(1);
    this.volume = g(0);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 2.5;
    comp.attack.value = 0.02; comp.release.value = 0.4;
    const clip = ctx.createWaveShaper();
    clip.curve = softClip();
    this.nodes.push(comp, clip);
    this.input.connect(this.duckG);
    this.duckG.connect(this.volume).connect(comp).connect(clip).connect(o.dest ?? ctx.destination);

    // reverb: a longer, darker room than the sound effects' pavilion
    const verb = ctx.createConvolver();
    verb.normalize = false;
    const verbOut = g(0.75);
    this.nodes.push(verb);
    this.verbIn.connect(verb).connect(verbOut).connect(this.duckG);
    this.render({ op: 'ir', t60: 3.1, secs: 3.4, seed: 29 }, (ir) => { if (!this.disposed) verb.buffer = this.buffer(ir); });

    // valley echo: ping-pong delay, each repeat darker
    const merger = ctx.createChannelMerger(2);
    const dL = ctx.createDelay(2), dR = ctx.createDelay(2);
    dL.delayTime.value = 0.43; dR.delayTime.value = 0.43;
    const lpL = ctx.createBiquadFilter(), lpR = ctx.createBiquadFilter();
    lpL.frequency.value = 2400; lpR.frequency.value = 1900;
    const fbL = g(0.42), fbR = g(0.42);
    const echoOut = g(0.8);
    this.nodes.push(merger, dL, dR, lpL, lpR);
    this.echoIn.connect(dL);
    dL.connect(lpL).connect(fbL).connect(dR);
    dR.connect(lpR).connect(fbR).connect(dL);
    dL.connect(merger, 0, 0);
    dR.connect(merger, 0, 1);
    merger.connect(echoOut).connect(this.duckG);
    echoOut.connect(this.verbIn);
  }

  get backlog() { return this.pending.size; }

  private runLocal(job: MusicJob, cb: (c: Float32Array[]) => void) {
    let chans: Float32Array[];
    try { chans = runMusicJob(this.ctx.sampleRate, job); } catch (e) { console.warn('[music] render', e); return; }
    cb(chans);
  }

  /** Render a job (in the worker if there is one, else synchronously). */
  render(job: MusicJob, cb: (chans: Float32Array[]) => void) {
    if (!this.worker) return this.runLocal(job, cb);
    const id = this.nextId++;
    this.pending.set(id, { job, cb });
    this.worker.postMessage({ id, sr: this.ctx.sampleRate, job } satisfies MusicJobRequest);
  }

  buffer(chans: Float32Array[]): AudioBuffer {
    const b = this.ctx.createBuffer(chans.length, Math.max(1, chans[0].length), this.ctx.sampleRate);
    chans.forEach((c, i) => b.getChannelData(i).set(c));
    return b;
  }

  /** A render memoised as an AudioBuffer (percussion one-shots). */
  cached(key: string, job: MusicJob, cb: (b: AudioBuffer) => void) {
    const hit = this.bufs.get(key);
    if (hit) return cb(hit);
    const w = this.waiters.get(key);
    if (w) { w.push(cb); return; }
    this.waiters.set(key, [cb]);
    this.render(job, (chans) => {
      const b = this.buffer(chans);
      this.bufs.set(key, b);
      const ws = this.waiters.get(key) ?? [];
      this.waiters.delete(key);
      for (const f of ws) f(b);
    });
  }

  /** Voices that will be sounding at context time `t` (from the scheduled spans). */
  concurrent(t: number): number {
    const now = this.ctx.currentTime;
    if (this.spans.length > 192) this.spans = this.spans.filter((sp) => sp.e > now);
    let n = 0;
    for (const sp of this.spans) if (sp.s <= t && t < sp.e) n++;
    return n;
  }

  play(buf: AudioBuffer, when: number, o: PlayOpts): AudioBufferSourceNode {
    const ctx = this.ctx;
    const span = { s: when, e: when + (buf.duration - (o.offset ?? 0)) / (o.rate || 1) };
    this.spans.push(span);
    this.peakVoices = Math.max(this.peakVoices, this.concurrent(when + 0.001));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (o.rate && o.rate !== 1) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    g.gain.value = o.gain;
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
    tail.connect(o.dry);
    for (const [lvl, dest] of [[o.send, o.wet], [o.echo, o.echoDest]] as const) {
      if (lvl > 0) {
        const s = ctx.createGain();
        s.gain.value = lvl;
        tail.connect(s).connect(dest);
        nodes.push(s);
      }
    }
    this.voices++;
    src.onended = () => {
      this.voices--;
      for (const n of nodes) n.disconnect();
      src.onended = null;
    };
    src.start(Math.max(when, 0), o.offset ?? 0);
    return src;
  }

  dispose() {
    this.disposed = true;
    for (const n of this.nodes) n.disconnect();
    this.nodes = [];
    this.bufs.clear();
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------

export interface ConductorOptions {
  /** Fade-in time constant (s); 0 = start at full level. */
  fadeIn?: number;
  /** Keep every scheduled event (lab timeline). */
  record?: boolean;
}

export interface PlayedPhrase { start: number; end: number; next: number; phrase: Phrase }
export interface PlayedEvent { at: number; ev: MusicEvent }

interface Tracked { src: AudioBufferSourceNode; when: number }
interface Queued { when: number; ev: MusicEvent; buf: AudioBuffer | null }

export class Conductor {
  readonly theme: ThemeId;
  readonly composer: Composer;
  readonly phrases: PlayedPhrase[] = [];
  readonly events: PlayedEvent[] = [];
  done = false;
  finishing = false;
  private dry: GainNode;
  private wet: GainNode;
  private echo: GainNode;
  private rng: Rng;
  private cursor: number;
  private endAt = Infinity;
  private live = new Set<Tracked>();
  /** Composed events: rendered as soon as composed, but given a source node only shortly before they sound. */
  private queue: Queued[] = [];
  private playUntil = 0;
  private seed: number;
  private record: boolean;
  private sentinel: AudioBufferSourceNode | null = null;

  constructor(private bus: MusicBus, theme: ThemeId, when: number, seed: number, visit = 0, o: ConductorOptions = {}) {
    this.theme = theme;
    this.seed = mixSeed(seed, visit + 1);
    this.composer = new Composer(THEMES[theme].style, seed, visit);
    this.rng = makeRng(mixSeed(this.seed, 0xa11));
    this.record = !!o.record;
    const ctx = bus.ctx;
    const level = THEMES[theme].level;
    const mk = (dest: AudioNode) => { const g = ctx.createGain(); g.connect(dest); return g; };
    this.dry = mk(bus.input);
    this.wet = mk(bus.verbIn);
    this.echo = mk(bus.echoIn);
    for (const g of [this.dry, this.wet, this.echo]) {
      if (o.fadeIn) {
        g.gain.setValueAtTime(0, Math.max(0, when - 0.5));
        g.gain.setTargetAtTime(level, Math.max(0, when - 0.5), o.fadeIn);
      } else g.gain.value = level;
    }
    this.cursor = when;
  }

  /**
   * Compose every phrase that starts before `until` (and send its renders), and create the sources
   * for everything that starts before `playUntil` (context seconds; default: `until`).
   */
  tick(until: number, playUntil = until) {
    const now = this.bus.ctx.currentTime;
    if (!this.finishing) {
      // fell behind (a throttled timer): skip ahead instead of bursting
      if (this.cursor < now) this.cursor = now + 0.1;
      let guard = 0;
      while (this.cursor < until && guard++ < 16) {
        const p = this.composer.next();
        const evs = arrange(this.theme, p, this.rng, mixSeed(this.seed, p.index));
        const start = this.cursor;
        const len = phraseSeconds(p);
        this.phrases.push({ start, end: start + (p.end * 60) / p.bpm, next: start + len, phrase: p });
        if (this.phrases.length > 64 && !this.record) this.phrases.shift();
        for (const ev of evs) this.enqueue(ev, start);
        this.cursor = start + len;
      }
    }
    this.flush(playUntil);
  }

  private enqueue(ev: MusicEvent, t0: number) {
    const bus = this.bus;
    const q: Queued = { when: t0 + ev.t, ev, buf: null };
    if (this.record) this.events.push({ at: q.when, ev });
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].when > q.when) i--;
    this.queue.splice(i, 0, q);
    const ready = (b: AudioBuffer) => {
      q.buf = b;
      if (q.when < this.playUntil) this.flush(this.playUntil);
    };
    if (ev.key) bus.cached(ev.key, ev.job, ready);
    else bus.render(ev.job, (chans) => { if (!this.done && this.queue.includes(q)) ready(bus.buffer(chans)); });
  }

  private flush(until: number) {
    this.playUntil = Math.max(this.playUntil, until);
    const keep: Queued[] = [];
    for (const q of this.queue) {
      if (this.finishing && q.when >= this.endAt) continue; // after the handover: never plays
      if (q.when >= this.playUntil || !q.buf) { keep.push(q); continue; }
      this.start(q.ev, q.when, q.buf);
    }
    this.queue = keep;
    if (this.finishing) this.maybeRelease();
  }

  private start(ev: MusicEvent, when: number, buf: AudioBuffer) {
    const bus = this.bus;
    const now = bus.ctx.currentTime;
    if (ev.prio > 0 && bus.concurrent(Math.max(when, now)) >= MAX_VOICES - (ev.prio === 2 ? 4 : 0)) { bus.dropped++; return; }
    let at = when, offset = 0;
    if (now + 0.015 > when) {
      // the render came back late: join in mid-sound, or skip what is only decoration
      const late = now + 0.015 - when;
      if (ev.prio === 2 || late > buf.duration / (ev.rate ?? 1) - 0.5) { bus.dropped++; return; }
      offset = late * (ev.rate ?? 1);
      at = now + 0.015;
    }
    const src = bus.play(buf, at, {
      gain: ev.gain, pan: ev.pan, send: ev.send, echo: ev.echo, rate: ev.rate, offset,
      dry: this.dry, wet: this.wet, echoDest: this.echo,
    });
    const tr: Tracked = { src, when: at };
    this.live.add(tr);
    const prev = src.onended;
    src.onended = (e) => {
      this.live.delete(tr);
      if (prev) (prev as (e: Event) => void).call(src, e);
      if (this.finishing) this.maybeRelease();
    };
    if (this.finishing) this.stopTracked(tr);
  }

  /** Events at or after this time were cut by a handover (Infinity while playing). */
  get cutoff() { return this.endAt; }

  /** Where the phrase sounding at `t` ends (its last note, before the breath); `t` if between phrases. */
  phraseEnd(t: number): number {
    for (let i = this.phrases.length - 1; i >= 0; i--) {
      const p = this.phrases[i];
      if (p.start <= t) return p.end > t ? p.end : t;
    }
    return t;
  }

  private fadeEnd = 0;

  private stopTracked(tr: Tracked) {
    try {
      // not yet sounding at the handover: never play; otherwise ring into the fade and stop at silence
      tr.src.stop(tr.when >= this.endAt - 0.01 ? tr.when : this.fadeEnd);
    } catch { /* already stopped */ }
  }

  /** Stop composing; fade out from `when` over ~`fade` s (to −35 dB) and release everything. */
  finish(when: number, fade = 3) {
    if (this.finishing) return;
    this.finishing = true;
    const ctx = this.bus.ctx;
    when = Math.max(when, ctx.currentTime);
    this.endAt = when;
    this.fadeEnd = when + fade * 1.5;
    for (const g of [this.dry, this.wet, this.echo]) {
      g.gain.cancelScheduledValues(when);
      g.gain.setTargetAtTime(0, when, fade / 4);
    }
    for (const tr of this.live) this.stopTracked(tr);
    this.queue = this.queue.filter((q) => q.when < when);
    // a silent sentinel guarantees a release even when nothing is sounding
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.loop = true;
    s.connect(this.dry);
    s.onended = () => { s.disconnect(); this.sentinel = null; this.maybeRelease(); };
    s.start(ctx.currentTime);
    s.stop(this.fadeEnd + 0.05);
    this.sentinel = s;
  }

  private maybeRelease() {
    if (this.done || this.live.size || this.sentinel || this.queue.length) return;
    this.done = true;
    for (const g of [this.dry, this.wet, this.echo]) g.disconnect();
  }
}
