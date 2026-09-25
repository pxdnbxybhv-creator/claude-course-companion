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
import { daySeed } from './music-theory';
import MusicWorker from './music-worker.ts?worker&inline';

export interface MusicEngine {
  /** Crossfade to a theme (≈3 s); null fades to silence. Safe to call repeatedly with the same theme. */
  setTheme(theme: MusicTheme | null): void;
  /** Master switch (settings.music). Starting is deferred until audio.unlock() has run. */
  setEnabled(on: boolean): void;
  /** 0..1 (settings.musicVolume). */
  setVolume(v: number): void;
  /** Lower the music briefly under a sound effect (0..1 = how much to keep). */
  duck(amount?: number, ms?: number): void;
  /** Currently requested theme. */
  readonly theme: MusicTheme | null;
}

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

  constructor() {
    if (typeof window === 'undefined') return;
    this.hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.listen(true);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  get theme() { return this.want; }

  setTheme(theme: MusicTheme | null) {
    if (theme === this.want) return;
    this.want = theme ?? null;
    // coalesce quick flips (walking along a region border) into one handover
    if (this.debounce) clearTimeout(this.debounce);
    if (!this.cur) { this.debounce = null; this.sync(); return; }
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

  private onGesture = () => {
    if (!this.enabled) return; // stay silent (and create nothing) until music is switched on
    this.attach();
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

  /** Find or create the context and the music bus (inside a gesture). */
  private attach() {
    if (this.bus || this.unsupported) return;
    let ctx: AudioContext | null = null;
    try { void audio.unlock(); } catch { /* engine unavailable */ }
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
    if (this.cur) {
      // musical handover: let the phrase that is sounding reach its cadence (at most ~5 s), then fade
      const end = fastFade || !target ? now + 0.05 : Math.min(now + 5, Math.max(now + 0.3, this.cur.phraseEnd(now)));
      this.cur.finish(end, fastFade || (target ? CROSSFADE : 2.2));
      this.old.push(this.cur);
      this.cur = null;
      start = end + 0.35;
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
