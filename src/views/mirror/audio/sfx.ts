// 水月幻镜 · the mirror's audio (API.md §7): cached voices on the app's Web Audio context, a limiter,
// the pickup scale, and the music (handed to the director in music.ts: calm / wave / boss themes
// coloured by map, the wave clock and danger fed from the HUD).
//
// The voices render once in prime() (behind 研墨) on the SAME AudioContext as the app's sounds and
// music (audio.context), through their own Mixer so a hundred hits never touch audio.pluck. Volume
// and the sound switch follow the app's settings. Never throws: without Web Audio everything is a no-op.
import { effect } from '@preact/signals';
import { audio } from '../../../audio/engine';
import { Mixer } from '../../../audio/graph';
import { music } from '../../../audio/music';
import { state } from '../../../app/store';
import type { MapId } from '../ids';
import type { CreateMirrorAudio, HudState, MirrorAudio, MusicPhase, SfxName } from '../types';
import { Limiter } from './limiter';
import { mirrorMusic } from './music';
import { FEEL_MIX, FEEL_NAMES, JITTER, PITCHED_JITTER, renderFeel, renderPickup, renderVoice, SFX_MIX, SFX_NAMES, type FeelVoice } from './voices';

/** The impact layer on top of the contract's MirrorAudio (the engine's feel bus duck-types it). */
/** The impact voices' trim against the battle score (≈ −1.5 dB). */
const FEEL_TRIM = 0.84;
export interface FeelAudio { feel(name: FeelVoice, gain?: number, rate?: number): void }

class MirrorSound implements MirrorAudio, FeelAudio {
  private mix: Mixer | null = null;
  private bufs = new Map<string, AudioBuffer>();
  private picks: AudioBuffer[] = [];
  private limiter = new Limiter();
  private stopSettings: (() => void) | null = null;
  private priming: Promise<void> | null = null;
  private disposed = false;
  private lastDuck = -Infinity;
  private lastDepth = 1;

  /** At most one music duck per 1.2 s, unless a deeper one comes (a busy fight kept the battle
   *  score ducked about a third of the time). */
  private duckMusic(depth: number, ms: number, now: number) {
    // (a sound nobody hears never ducks the music: the sound switch off or its volume at 0)
    const s = state.value.settings;
    if (!s.sound || !(s.volume > 0)) return;
    if (now - this.lastDuck < 1.2 && depth >= this.lastDepth) return;
    this.lastDuck = now; this.lastDepth = depth;
    music.duck(depth, ms);
  }

  prime(): Promise<void> {
    if (!this.priming) this.priming = this.doPrime().catch((e) => { console.warn('[mirror audio]', e); });
    return this.priming;
  }

  private async doPrime(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!audio.context) { try { await Promise.race([audio.unlock(), new Promise((r) => setTimeout(r, 400))]); } catch { /* no audio */ } }
    const ctx = audio.context;
    if (!ctx || this.disposed) return;
    const mix = new Mixer(ctx, { worker: null });
    this.mix = mix;
    this.stopSettings = effect(() => {
      const { sound, volume } = state.value.settings;
      const g = sound ? volume * volume * 0.9 : 0;
      try { mix.master.gain.setTargetAtTime(g, ctx.currentTime, 0.05); } catch { mix.master.gain.value = g; }
    });
    const sr = ctx.sampleRate;
    // render a few voices per frame so 研墨 keeps breathing
    let t0 = performance.now();
    for (const name of SFX_NAMES) {
      if (this.disposed) return;
      try { this.bufs.set(name, mix.buffer(renderVoice(name, sr))); } catch (e) { console.warn('[mirror audio] voice', name, e); }
      if (performance.now() - t0 > 12) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
    }
    for (let d = 0; d < 10; d++) {
      try { this.picks.push(mix.buffer([renderPickup(sr, d)])); } catch { /* skip */ }
    }
    for (const name of FEEL_NAMES) {
      if (this.disposed) return;
      try { this.bufs.set('~' + name, mix.buffer(renderFeel(name, sr))); } catch (e) { console.warn('[mirror audio] impact', name, e); }
      if (performance.now() - t0 > 12) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
    }
  }

  sfx(name: SfxName, o: { gain?: number; rate?: number } = {}): void {
    const mix = this.mix, buf = this.bufs.get(name);
    if (!mix || !buf || this.disposed) return;
    const ctx = mix.ctx;
    const now = ctx.currentTime;
    const m = SFX_MIX[name];
    if (!this.limiter.allow(name, m.cap, !!m.spam, now)) return;
    try {
      const rate = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (m.pitched ? PITCHED_JITTER : JITTER));
      mix.play(buf, now + 0.005, { gain: m.gain * (o.gain ?? 1), send: m.send, rate, pan: (Math.random() - 0.5) * 0.3 });
      if (m.duck) this.duckMusic(m.duck, 700, now);
    } catch { /* a closed context */ }
  }

  /** An impact voice (打击感), started now: the engine calls it on the step the hit lands, so the
   *  sound meets the flash on the same frame. Gain and rate multiply the voice's mix and jitter. */
  feel(name: FeelVoice, gain = 1, rate = 1): void {
    const mix = this.mix, buf = this.bufs.get('~' + name);
    if (!mix || !buf || this.disposed) return;
    const now = mix.ctx.currentTime;
    const m = FEEL_MIX[name];
    if (!m || !this.limiter.allow('~' + name, m.cap, !!m.spam, now)) return;
    try {
      const r = rate * (1 + (Math.random() * 2 - 1) * (m.pitched ? PITCHED_JITTER : JITTER));
      // the impact layer runs ≈ 1.5 dB under its table, leaving the battle score room (FEEL_TRIM)
      const g = m.gain * gain * FEEL_TRIM * (0.88 + Math.random() * 0.24);
      mix.play(buf, now + 0.002, { gain: g, send: m.send, rate: r, pan: (Math.random() - 0.5) * 0.25 });
      if (m.duck) this.duckMusic(m.duck, 500, now);
    } catch { /* a closed context */ }
  }

  pickup(combo: number): void {
    const mix = this.mix;
    if (!mix || !this.picks.length || this.disposed) return;
    const now = mix.ctx.currentTime;
    if (!this.limiter.allow('pickup', SFX_MIX.pickup.cap, true, now)) return;
    // 宫商角徵羽 climbing, wrapping back down after two octaves
    const d = Math.max(0, combo | 0) % this.picks.length;
    try { mix.play(this.picks[d], now + 0.005, { gain: SFX_MIX.pickup.gain, send: SFX_MIX.pickup.send, rate: 1 + (Math.random() - 0.5) * 0.01 }); } catch { /* closed */ }
  }

  /** The theme for a phase (the director: lobby / shop / results calm, a wave, a boss; transitions). */
  music(phase: MusicPhase, map: MapId): void {
    if (this.disposed) return;
    mirrorMusic.phase(phase, map);
  }

  /** The engine's ≈ 8 Hz HUD feed (crowd = living capped enemies / the cap): the wave clock, danger,
   *  the boss phase and the clear, for the band. */
  hud(s: HudState, crowd: number): void {
    if (this.disposed) return;
    mirrorMusic.hud(s, crowd);
  }

  dispose(): void {
    this.disposed = true;
    mirrorMusic.dispose();
    this.stopSettings?.();
    this.stopSettings = null;
    try { this.mix?.master.disconnect(); } catch { /* already */ }
    this.mix = null;
    this.bufs.clear();
    this.picks = [];
  }
}

export const createMirrorAudio: CreateMirrorAudio = () => new MirrorSound();
