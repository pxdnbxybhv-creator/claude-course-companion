// All sound is synthesised with the Web Audio API — no audio files.
//
// The AudioContext is created lazily (on unlock() or the first sound) and every method is a safe
// no-op when Web Audio is unavailable. Synthesis lives in dsp.ts (pure JS → Float32Array), the
// node graph in graph.ts, one-shots in voices.ts and the ambient beds in ambient.ts; the lab
// (/lab.html?scene=audio) renders the same code through an OfflineAudioContext and measures it.
import type { AmbientKind } from '../core/types';
import { Mixer } from './graph';
import { playBell, playChime, playKnock, playPluck } from './voices';
import { createBed, type Bed } from './ambient';
import RenderWorker from './render.worker.ts?worker&inline';

export interface AudioStats {
  state: AudioContextState | 'none' | 'unsupported';
  /** One-shot voices currently sounding (should return to 0 when idle). */
  voices: number;
  ambient: AmbientKind;
  /** Beds still fading out. */
  fading: number;
  time: number;
}

export interface AudioEngine {
  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock(): Promise<void>;
  setEnabled(on: boolean): void;
  setVolume(v: number): void;
  /** A guqin (古琴) pluck on the pentatonic scale. degree 0 = 宫; negative/above 4 wrap octaves. */
  pluck(degree?: number, velocity?: number): void;
  /** Check-in reward: a short rising phrase of harmonics (泛音). `streak` can make it richer. */
  chime(streak?: number): void;
  /** A struck bronze bowl / chime stone (磬) — end of a focus session. */
  bell(): void;
  /** A soft wooden knock (木鱼) — lighting the incense. */
  knock(): void;
  /** Crossfade the ambient bed. 'qin' = slow generative guqin improvisation. */
  setAmbient(kind: AmbientKind): void;
  /** Diagnostics (lab / debugging). */
  stats(): AudioStats;
}

type Ctor = typeof AudioContext;
const LOOKAHEAD = 1.6; // s — survives 1 s timer throttling in background tabs
const TICK_MS = 200;

class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private mix: Mixer | null = null;
  private unsupported = false;
  private enabled = true;
  private volume = 0.8;
  private want: AmbientKind = 'none';
  private bed: Bed | null = null;
  private fading: Bed[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private seed = (Math.random() * 2 ** 32) >>> 0;

  private ensure(): Mixer | null {
    if (this.mix) return this.mix;
    if (this.unsupported || typeof window === 'undefined') return null;
    const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!C) { this.unsupported = true; return null; }
    try {
      let ctx: AudioContext;
      try { ctx = new C({ latencyHint: 'interactive' }); } catch { ctx = new C(); }
      this.ctx = ctx;
      let worker: Worker | null = null;
      try { worker = new RenderWorker({ name: 'banmu-audio' }); } catch { worker = null; } // sync fallback
      this.mix = new Mixer(ctx, { worker });
      this.mix.master.gain.value = this.targetGain();
      document.addEventListener('visibilitychange', this.onVisible);
      return this.mix;
    } catch (e) {
      console.warn('[audio] Web Audio unavailable', e);
      this.unsupported = true;
      this.ctx = null;
      this.mix = null;
      return null;
    }
  }

  private targetGain() {
    return this.enabled ? this.volume * this.volume : 0; // perceptual taper
  }

  private resume() {
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  }

  private onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    this.resume();
    this.tick();
  };

  /** A mixer ready for a sound right now, or null (disabled / unsupported). */
  private live(): Mixer | null {
    if (!this.enabled) return null;
    const m = this.ensure();
    if (!m) return null;
    this.resume();
    this.syncAmbient();
    return m;
  }

  private now() {
    return (this.ctx?.currentTime ?? 0) + 0.01;
  }

  /**
   * Runs a one-shot now. If the context is not running yet (first gesture, or iOS after an
   * interruption) it waits briefly for resume(); a sound that cannot start soon is dropped
   * rather than queued, so nothing stale bursts out at the next unlock.
   */
  private safely(f: (m: Mixer, t: number) => void) {
    const m = this.live();
    const ctx = this.ctx;
    if (!m || !ctx) return;
    const run = () => { try { f(m, this.now()); } catch (e) { console.warn('[audio]', e); } };
    if (ctx.state === 'running') return run();
    const t0 = performance.now();
    ctx.resume().then(() => { if (ctx.state === 'running' && performance.now() - t0 < 400) run(); }).catch(() => {});
  }

  async unlock(): Promise<void> {
    const m = this.ensure();
    const ctx = this.ctx;
    if (!m || !ctx) return;
    try {
      // Old iOS only unmutes Web Audio after a buffer is started inside a gesture.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.onended = () => s.disconnect();
      s.start(0);
    } catch { /* ignore */ }
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch { /* not allowed yet */ }
    }
    this.syncAmbient();
  }

  setEnabled(on: boolean) {
    this.enabled = !!on;
    this.applyGain();
    this.syncAmbient();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.8));
    this.applyGain();
  }

  private applyGain() {
    const m = this.mix, ctx = this.ctx;
    if (!m || !ctx) return;
    const g = m.master.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(this.targetGain(), t, 0.08);
  }

  pluck(degree = 0, velocity = 0.7) {
    const d = Number.isFinite(degree) ? Math.round(degree) : 0;
    const v = Math.max(0.05, Math.min(1, Number.isFinite(velocity) ? velocity : 0.7));
    this.safely((m, t) => playPluck(m, t, d, v));
  }
  chime(streak = 1) {
    this.safely((m, t) => playChime(m, t, Number.isFinite(streak) ? streak : 1));
  }
  bell() {
    this.safely((m, t) => playBell(m, t));
  }
  knock() {
    this.safely((m, t) => playKnock(m, t));
  }

  setAmbient(kind: AmbientKind) {
    this.want = kind ?? 'none';
    this.syncAmbient();
  }

  /** Bring the running bed in line with (enabled, want). Never creates the context by itself. */
  private syncAmbient() {
    const m = this.mix, ctx = this.ctx;
    if (!m || !ctx) return;
    const want: AmbientKind = this.enabled ? this.want : 'none';
    if ((this.bed?.kind ?? 'none') === want) return;
    const t = ctx.currentTime + 0.05;
    try {
      if (this.bed) { this.bed.stop(t); this.fading.push(this.bed); this.bed = null; }
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      this.bed = createBed(want, m, t, this.seed);
    } catch (e) {
      console.warn('[audio] ambient', e);
      this.bed = null;
    }
    this.tick();
    this.ensureTimer();
  }

  private tick = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    try { this.bed?.tick(ctx.currentTime + LOOKAHEAD); } catch (e) { console.warn('[audio] tick', e); }
    this.fading = this.fading.filter((b) => !b.done);
    if (!this.bed && !this.fading.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  private ensureTimer() {
    if (this.timer === null && (this.bed || this.fading.length)) this.timer = setInterval(this.tick, TICK_MS);
  }

  stats(): AudioStats {
    return {
      state: this.unsupported ? 'unsupported' : this.ctx?.state ?? 'none',
      voices: this.mix?.voices ?? 0,
      ambient: this.bed?.kind ?? 'none',
      fading: this.fading.length,
      time: this.ctx?.currentTime ?? 0,
    };
  }
}

export const audio: AudioEngine = new WebAudioEngine();
