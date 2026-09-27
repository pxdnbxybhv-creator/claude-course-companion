// 水月幻镜 · the mirror's audio (API.md §7): cached voices on the app's Web Audio context, a limiter,
// the pickup scale, and the two music themes coloured by map.
//
// The voices render once in prime() (behind 研墨) on the SAME AudioContext as the app's sounds and
// music (audio.context), through their own Mixer so a hundred hits never touch audio.pluck. Volume
// and the sound switch follow the app's settings. Never throws: without Web Audio everything is a no-op.
import { effect } from '@preact/signals';
import { audio } from '../../../audio/engine';
import { Mixer } from '../../../audio/graph';
import { music } from '../../../audio/music';
import { setMirrorColour } from '../../../audio/music-themes';
import { state } from '../../../app/store';
import type { MapId } from '../ids';
import type { CreateMirrorAudio, MirrorAudio, MusicPhase, SfxName } from '../types';
import { renderPickup, renderVoice, SFX_MIX, SFX_NAMES } from './voices';

/** At most this many sounds start in any 50 ms window (GDD §22). */
const WINDOW = 0.05;
const MAX_PER_WINDOW = 4;
const JITTER = 0.06;

class MirrorSound implements MirrorAudio {
  private mix: Mixer | null = null;
  private bufs = new Map<string, AudioBuffer>();
  private picks: AudioBuffer[] = [];
  /** Start times of recent sounds (ring buffer) and per-kind. */
  private recent = new Float64Array(MAX_PER_WINDOW);
  private ri = 0;
  private kinds = new Map<string, Float64Array>();
  private stopSettings: (() => void) | null = null;
  private priming: Promise<void> | null = null;
  private phase: MusicPhase = null;
  private disposed = false;

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
  }

  /** The limiter: global 4 per 50 ms, and each kind's own cap. */
  private allow(kind: string, cap: number, now: number): boolean {
    const oldest = this.recent[this.ri];
    if (now - oldest < WINDOW) return false;
    let k = this.kinds.get(kind);
    if (!k) { k = new Float64Array(Math.max(1, cap)).fill(-1); this.kinds.set(kind, k); }
    let slot = -1, n = 0;
    for (let i = 0; i < k.length; i++) { if (now - k[i] < WINDOW) n++; else if (slot < 0) slot = i; }
    if (n >= cap || slot < 0) return false;
    k[slot] = now;
    this.recent[this.ri] = now;
    this.ri = (this.ri + 1) % MAX_PER_WINDOW;
    return true;
  }

  sfx(name: SfxName, o: { gain?: number; rate?: number } = {}): void {
    const mix = this.mix, buf = this.bufs.get(name);
    if (!mix || !buf || this.disposed) return;
    const ctx = mix.ctx;
    const now = ctx.currentTime;
    const m = SFX_MIX[name];
    if (!this.allow(name, m.cap, now)) return;
    try {
      const rate = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * JITTER);
      mix.play(buf, now + 0.005, { gain: m.gain * (o.gain ?? 1), send: m.send, rate, pan: (Math.random() - 0.5) * 0.3 });
      if (m.duck) music.duck(m.duck, 700);
    } catch { /* a closed context */ }
  }

  pickup(combo: number): void {
    const mix = this.mix;
    if (!mix || !this.picks.length || this.disposed) return;
    const now = mix.ctx.currentTime;
    if (!this.allow('pickup', SFX_MIX.pickup.cap, now)) return;
    // 宫商角徵羽 climbing, wrapping back down after two octaves
    const d = Math.max(0, combo | 0) % this.picks.length;
    try { mix.play(this.picks[d], now + 0.005, { gain: SFX_MIX.pickup.gain, send: SFX_MIX.pickup.send, rate: 1 + (Math.random() - 0.5) * 0.01 }); } catch { /* closed */ }
  }

  music(phase: MusicPhase, map: MapId): void {
    if (this.disposed) return;
    if (phase === this.phase && phase !== null) return;
    this.phase = phase;
    setMirrorColour(map);
    music.setTheme(phase === null ? null : phase === 'boss' ? 'mirror-boss' : 'mirror');
  }

  dispose(): void {
    this.disposed = true;
    this.stopSettings?.();
    this.stopSettings = null;
    try { this.mix?.master.disconnect(); } catch { /* already */ }
    this.mix = null;
    this.bufs.clear();
    this.picks = [];
  }
}

export const createMirrorAudio: CreateMirrorAudio = () => new MirrorSound();
