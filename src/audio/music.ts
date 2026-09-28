// Background music — generative, synthesised live with Web Audio (no audio files).
// Themes follow the place: the garden, the water town, the lake, the bamboo grove, the plum ridge,
// the temple, night, festival days, and the games hall.
//
//   music-theory.ts  the composer: 五声 modes, motifs developed through 起承转合 periods, cadences
//   music-themes.ts  the band: per-theme style + arrangement (which instruments play what)
//   music-dsp.ts     the instruments (古筝 琵琶 箫 笛 二胡 唢呐 笙, drums, gongs, bells; the 古琴 reused)
//   music-worker.ts  renders phrases off the main thread
//   music-player.ts  the bus (reverb, valley echo, duck, volume, compressor) and the Conductor
//   /lab.html?scene=music  offline renders of every theme with waveform, spectrogram, score, checks
//
// Audio context: the music plays on the SAME AudioContext as the sound effects (audio.context in
// src/audio/engine.ts) so iOS only has one context to unlock; if that ever fails, the music creates
// its own context on the first gesture instead (and suspends it while the page is hidden). It ducks
// under the reward chime and the bell (audio.onEffect).
import type { MusicTheme } from '../views/walk/map';
import { audio } from './engine';
import { Conductor, MusicBus } from './music-player';
import type { MusicEvent } from './music-themes';
import { daySeed } from './music-theory';
import MusicWorker from './music-worker.ts?worker&inline';

/** A quicker handover than the default (the sounding phrase reaching its cadence, then ≈ 3 s). */
export interface ThemeCut {
  /** Seconds until the old theme is cut (≥ 0.05); the new one starts right after. Skips the debounce. */
  cut: number;
  /** Fade-out of the old theme (s; default 3). */
  fade?: number;
}

export interface MusicEngine {
  /** Crossfade to a theme (≈3 s); null fades to silence. Safe to call repeatedly with the same theme. */
  setTheme(theme: MusicTheme | null, o?: ThemeCut): void;
  /**
   * One-shots on the music bus now, outside any theme (a stinger: a 钹 choke, a 锣). They follow the
   * volume, the switch and the duck, and ring through a handover; `choke` damps them after that many
   * seconds. A no-op until the music is running.
   */
  cue(events: readonly MusicEvent[], o?: { choke?: number }): void;
  /** Master switch (settings.music). Starting is deferred until audio.unlock() has run. */
  setEnabled(on: boolean): void;
  /** 0..1 (settings.musicVolume). */
  setVolume(v: number): void;
  /** Lower the music briefly under a sound effect (0..1 = how much to keep). */
  duck(amount?: number, ms?: number): void;
  /** Currently requested theme. */
  readonly theme: MusicTheme | null;
  /**
   * Create (or reuse the sound engine's) context and the music bus without resuming anything —
   * allowed before a gesture; the context stays suspended until one. A no-op while music is off.
   */
  prime(): void;
  /**
   * The context and bus for a hand-scored reel (the opening PV, src/views/intro/reel.ts), primed if
   * need be; null while music is off or unsupported. The reel plays through the bus's duck, volume
   * and switch like any theme, so setEnabled(false) silences it without stopping its clock.
   */
  attach(): { ctx: AudioContext; bus: MusicBusHandle } | null;
}

/** The music bus as a reel sees it. */
export type MusicBusHandle = MusicBus;

export interface MusicStats {
  state: AudioContextState | 'none' | 'unsupported';
  shared: boolean;
  theme: MusicTheme | null;
  playing: MusicTheme | null;
  voices: number;
  peakVoices: number;
  fading: number;
  backlog: number;
  dropped: number;
}

type Ctor = typeof AudioContext;
const HORIZON = 4.5; // s of music composed and scheduled ahead of the audio clock
const PLAY_AHEAD = 1.2; // s — sources are created this close to their start
const TICK_MS = 250;
const CROSSFADE = 3;
const DEBOUNCE_MS = 450;

/** Perceptual volume law (0.5 → −12 dB): the music sits under the reward chime, not level with it. */
export const musicGain = (v: number) => (v <= 0 ? 0 : 0.72 * Math.pow(Math.min(1, v), 1.5));

/** The sound-effects engine's context, if it has one yet. */
function engineContext(): AudioContext | null {
  const c = audio.context;
  return c && typeof c.createGain === 'function' && c.state !== 'closed' ? c : null;
}

class WebMusic implements MusicEngine {
  private want: MusicTheme | null = null;
  private enabled = true;
  private vol = 0.5;
  private ctx: AudioContext | null = null;
  private own = false;
  private unsupported = false;
  private bus: MusicBus | null = null;
  private cur: Conductor | null = null;
  private old: Conductor[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private visits = new Map<MusicTheme, number>();
  private hidden = false;
  private listening = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private cutNext: ThemeCut | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.listen(true);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  get theme() { return this.want; }

  setTheme(theme: MusicTheme | null, o?: ThemeCut) {
    if (theme === this.want) return;
    this.want = theme ?? null;
    this.cutNext = o && Number.isFinite(o.cut) ? { cut: Math.max(0.05, Math.min(5, o.cut)), fade: o.fade } : null;
    // coalesce quick flips (walking along a region border) into one handover; a cut is meant now
    if (this.debounce) clearTimeout(this.debounce);
    if (!this.cur || this.cutNext) { this.debounce = null; this.sync(); return; }
    this.debounce = setTimeout(() => { this.debounce = null; this.sync(); }, DEBOUNCE_MS);
  }

  setEnabled(on: boolean) {
    const was = this.enabled;
    this.enabled = !!on;
    this.applyVolume();
    // switched on by a tap (the settings toggle): start now rather than on the next tap
    if (this.enabled && !was && typeof navigator !== 'undefined') {
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (ua?.isActive || engineContext()?.state === 'running') this.onGesture();
    }
    this.sync();
  }

  setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
    this.applyVolume();
  }

  duck(amount = 0.35, ms = 900) {
    const bus = this.bus;
    if (!bus) return;
    const t = bus.ctx.currentTime, g = bus.duckG.gain;
    const keep = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0.35));
    g.cancelScheduledValues(t);
    g.setTargetAtTime(keep, t, 0.04);
    g.setTargetAtTime(1, t + Math.max(0.05, (Number.isFinite(ms) ? ms : 900) / 1000), 0.35);
  }

  cue(events: readonly MusicEvent[], o: { choke?: number } = {}) {
    const bus = this.bus, ctx = this.ctx;
    if (!bus || !ctx || ctx.state !== 'running' || !this.enabled || this.hidden || !events.length) return;
    const t0 = ctx.currentTime + 0.02;
    const dry = ctx.createGain(), wet = ctx.createGain();
    dry.connect(bus.input);
    wet.connect(bus.verbIn);
    const choke = o.choke && Number.isFinite(o.choke) ? Math.max(0.02, o.choke) : 0;
    if (choke) for (const g of [dry, wet]) { g.gain.setValueAtTime(1, t0 + choke); g.gain.setTargetAtTime(0, t0 + choke, 0.018); }
    let left = events.length;
    const done = () => { if (--left <= 0) { dry.disconnect(); wet.disconnect(); } };
    for (const ev of events) {
      const play = (buf: AudioBuffer) => {
        try {
          const at = Math.max(t0 + ev.t, ctx.currentTime + 0.005);
          const src = bus.play(buf, at, { gain: ev.gain, pan: ev.pan, send: ev.send, echo: 0, rate: ev.rate, dry, wet, echoDest: bus.echoIn });
          const prev = src.onended;
          src.onended = (e) => { if (prev) (prev as (e: Event) => void).call(src, e); done(); };
          if (choke) src.stop(at + choke + 0.15);
        } catch { done(); }
      };
      if (ev.key) bus.cached(ev.key, ev.job, play);
      else bus.render(ev.job, (chans) => play(bus.buffer(chans)));
    }
  }

  stats(): MusicStats {
    return {
      state: this.unsupported ? 'unsupported' : this.ctx?.state ?? 'none',
      shared: !!this.ctx && !this.own,
      theme: this.want,
      playing: this.cur?.theme ?? null,
      voices: this.bus?.voices ?? 0,
      peakVoices: this.bus?.peakVoices ?? 0,
      fading: this.old.length,
      backlog: this.bus?.backlog ?? 0,
      dropped: this.bus?.dropped ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // context & gestures

  private listen(on: boolean) {
    if (on === this.listening || typeof window === 'undefined') return;
    this.listening = on;
    const f = on ? window.addEventListener : window.removeEventListener;
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) f.call(window, type, this.onGesture, { capture: true, passive: true } as AddEventListenerOptions);
  }

  prime() {
    if (this.enabled) this.connect(false);
  }

  attach(): { ctx: AudioContext; bus: MusicBusHandle } | null {
    if (!this.enabled) return null;
    this.connect(false);
    return this.ctx && this.bus ? { ctx: this.ctx, bus: this.bus } : null;
  }

  private onGesture = () => {
    if (!this.enabled) return; // stay silent (and create nothing) until music is switched on
    this.connect(true);
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (this.own) {
      try {
        // old iOS unmutes Web Audio only after a buffer is started inside a gesture
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination);
        s.onended = () => s.disconnect();
        s.start(0);
      } catch { /* ignore */ }
    }
    const done = () => { if (ctx.state === 'running') { this.listen(false); this.sync(); } };
    done();
    ctx.resume().then(done, () => {});
  };

  /**
   * Find or create the context and the music bus. `gesture`: inside one, so the sound engine is
   * unlocked too; otherwise (prime) its context is only created, left suspended.
   */
  private connect(gesture: boolean) {
    if (this.bus || this.unsupported || typeof window === 'undefined') return;
    let ctx: AudioContext | null = null;
    try { if (gesture) void audio.unlock(); else audio.prime(); } catch { /* engine unavailable */ }
    ctx = engineContext();
    if (!ctx) {
      const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!C) { this.unsupported = true; return; }
      try { ctx = new C({ latencyHint: 'playback' }); } catch { try { ctx = new C(); } catch { ctx = null; } }
      if (!ctx) { this.unsupported = true; return; }
      this.own = true;
    }
    this.ctx = ctx;
    // an interrupted context (iOS call, another app) that comes back: pick the music up again
    ctx.addEventListener('statechange', () => { if (ctx.state === 'running') this.sync(); });
    let worker: Worker | null = null;
    try { worker = new MusicWorker({ name: 'banmu-music' }); } catch { worker = null; } // synchronous fallback
    try {
      this.bus = new MusicBus(ctx, { worker });
    } catch (e) {
      console.warn('[music] Web Audio unavailable', e);
      worker?.terminate();
      this.unsupported = true;
      this.ctx = null;
      return;
    }
    this.applyVolume();
  }

  private onVisible = () => {
    this.hidden = document.visibilityState === 'hidden';
    const ctx = this.ctx;
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null; }
    if (!this.hidden && ctx && this.own && ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.sync(0.6);
    if (this.hidden && ctx && this.own) {
      // our own context: suspend it once the fade is over (the shared one belongs to the engine)
      this.suspendTimer = setTimeout(() => { if (this.hidden && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 1500);
    }
  };

  private applyVolume() {
    const bus = this.bus;
    if (!bus) return;
    const g = bus.volume.gain, t = bus.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.enabled ? musicGain(this.vol) : 0, t, 0.12);
  }

  // -------------------------------------------------------------------------
  // themes

  /** Bring the playing theme in line with (enabled, hidden, want). */
  private sync(fastFade = 0) {
    const bus = this.bus, ctx = this.ctx;
    if (!bus || !ctx || ctx.state === 'closed') return;
    if (ctx.state !== 'running' && !this.cur) return; // wait for the gesture / resume
    const target = this.enabled && !this.hidden ? this.want : null;
    if ((this.cur?.theme ?? null) === target) return;
    const now = ctx.currentTime;
    let start = now + 0.8; // time for the first renders to come back from the worker
    const cut = this.cutNext;
    this.cutNext = null;
    if (this.cur) {
      // musical handover: let the phrase that is sounding reach its cadence (at most ~5 s), then fade;
      // a cut (the mirror's wave start / clear) hands over at once
      const end = fastFade || !target ? now + 0.05 : cut ? now + cut.cut : Math.min(now + 5, Math.max(now + 0.3, this.cur.phraseEnd(now)));
      this.cur.finish(end, fastFade || (cut?.fade ?? (target ? CROSSFADE : 2.2)));
      this.old.push(this.cur);
      this.cur = null;
      start = cut ? Math.max(end + 0.05, now + 0.45) : end + 0.35;
    }
    if (target) {
      const visit = this.visits.get(target) ?? 0;
      this.visits.set(target, visit + 1);
      this.cur = new Conductor(bus, target, start, daySeed(target), visit, { fadeIn: 0.7 });
    }
    this.tick();
    if (this.timer === null) this.timer = setInterval(this.tick, TICK_MS);
  }

  private tick = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      this.cur?.tick(now + HORIZON, now + PLAY_AHEAD);
      for (const c of this.old) c.tick(now, now + PLAY_AHEAD); // their queues play out until the handover
    } catch (e) { console.warn('[music] tick', e); }
    this.old = this.old.filter((c) => !c.done);
    if (!this.cur && !this.old.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };
}

const engine = new WebMusic();
// the reward chime and the bell sit on top of the music, not inside it
audio.onEffect = (kind) => engine.duck(0.45, kind === 'bell' ? 1600 : 900);

export const music: MusicEngine = engine;

/** Diagnostics (lab / debugging). */
export const musicStats = (): MusicStats => engine.stats();

// Dev builds: expose the diagnostics for headless checks (window.__banmuMusic.stats()).
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __banmuMusic?: unknown }).__banmuMusic = { stats: musicStats };
