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
import { getMirrorColour, setMirrorColour } from '../../../audio/music-themes';
import { state } from '../../../app/store';
import type { MapId } from '../ids';
import type { CreateMirrorAudio, MirrorAudio, MusicPhase, SfxName } from '../types';
import { Limiter } from './limiter';
import { JITTER, PITCHED_JITTER, renderPickup, renderVoice, SFX_MIX, SFX_NAMES } from './voices';

/** A map change while the theme id stays the same restarts the music after this pause (ms): longer
 *  than music.ts's 450 ms debounce, so the silence request is honoured and a new Composer picks up
 *  the map's tempo and modes. */
const RECOLOUR_MS = 520;

class MirrorSound implements MirrorAudio {
  private mix: Mixer | null = null;
  private bufs = new Map<string, AudioBuffer>();
  private picks: AudioBuffer[] = [];
  private limiter = new Limiter();
  private stopSettings: (() => void) | null = null;
  private priming: Promise<void> | null = null;
  private phase: MusicPhase = null;
  private colour: MapId | null = null;
  private recolour: ReturnType<typeof setTimeout> | null = null;
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
      if (m.duck) music.duck(m.duck, 700);
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

  music(phase: MusicPhase, map: MapId): void {
    if (this.disposed) return;
    const recoloured = phase !== null && map !== (this.colour ?? getMirrorColour());
    if (phase === this.phase && phase !== null && !recoloured) return;
    this.phase = phase;
    if (phase !== null) this.colour = map;
    setMirrorColour(map);
    if (this.recolour) { clearTimeout(this.recolour); this.recolour = null; }
    const id = phase === null ? null : phase === 'boss' ? 'mirror-boss' : 'mirror';
    if (recoloured && id !== null && music.theme === id) {
      // the Composer fixed its tempo and modes when it was built: a new map needs a new one, so
      // hand over through a breath of silence (the entry ritual covers it)
      music.setTheme(null);
      this.recolour = setTimeout(() => {
        this.recolour = null;
        if (!this.disposed && this.phase === phase) music.setTheme(id);
      }, RECOLOUR_MS);
      return;
    }
    music.setTheme(id);
  }

  dispose(): void {
    this.disposed = true;
    if (this.recolour) { clearTimeout(this.recolour); this.recolour = null; }
    this.stopSettings?.();
    this.stopSettings = null;
    try { this.mix?.master.disconnect(); } catch { /* already */ }
    this.mix = null;
    this.bufs.clear();
    this.picks = [];
  }
}

export const createMirrorAudio: CreateMirrorAudio = () => new MirrorSound();
