// 水月幻镜 · the music director (GDD §22). It picks the theme for each phase — 'mirror-calm' for the
// lobby, the shop and the results, 'mirror' for a wave (the battle score: the 笛 leads from the first
// bar), 'mirror-boss' for a boss (the 唢呐 leads) — hands over with the transitions (a drum fill into a
// wave, a choked 钹 on the clear, a 大鼓 roll into the 大锣 when a boss arrives), and feeds the band the
// wave clock and the danger. The themes read that state as each phrase is composed
// (src/audio/music-themes.ts: mirrorTier, mirrorBossStep), so layers enter over the wave, the last 10 s
// tighten and danger pushes a layer up. A phrase is composed ≈ 4.5 s ahead: the danger cue makes the
// band re-compose what it has not played yet (the mirror epoch), a boss's new phase cuts the band over
// at its next bar line past the play-ahead (≈ 1.2–3 s: music-player.ts bandCut), and the director
// plays a cue at once — on the band's next beat, in its tempo (music-player.ts
// bandBeat): a 堂鼓 roll into 大鼓 + 小锣 when the danger rises past one half (at most every 12 s), a
// 大锣 with the 唢呐's call when a boss enters a new phase. Each wave tells the band its number, so the
// map's call rotates (music-themes.ts WAVE_HEADS).
//
//   mirrorMusic.phase(phase, map)   the theme for a phase (what MirrorAudio.music does)
//   mirrorMusic.hud(s, crowd)       the ≈ 8 Hz HUD feed: the wave clock, the danger, the boss phase,
//                                   and the clear (the timer reaching 0, the last boss falling)
//   mirrorMusic.intensity(x)        0..1 danger set directly (≥ 0.5 pushes the band a layer up)
//   mirrorMusic.clock(left, total)  the wave clock set directly
//
// Volume and the music switch are the app's (settings.music, settings.musicVolume → music.ts), and the
// music bus has its own compressor and soft clip. No Web Audio here; never throws.
import { music } from '../../../audio/music';
import { bandBeat, bandCut } from '../../../audio/music-player';
import { getMirrorColour, getMirrorMusic, mirrorBpm, mirrorCue, refreshMirrorBand, setMirrorMusic, type MirrorCue } from '../../../audio/music-themes';
import type { MusicTheme } from '../../walk/map';
import type { MapId } from '../ids';
import type { HudState, MusicPhase } from '../types';

/** A map change while the theme id stays the same restarts the music after this pause (ms): longer
 *  than music.ts's 450 ms debounce, so the silence is honoured and a new Composer takes the map's
 *  tempo and modes. */
const RECOLOUR_MS = 520;
/** The danger cue at most this often (ms): a warning, not a metronome. */
const DANGER_CUE_MS = 12_000;
/** music.cue starts its events this long after the call (music.ts WebMusic.cue). */
const CUE_START = 0.02;

/** A cue on the playing band's next beat, in its tempo (its roll runs in the band's 16ths). */
function onBeat(kind: MirrorCue): void {
  const b = bandBeat(CUE_START + 0.01);
  music.cue(mirrorCue(kind, 1, b?.bpm ?? mirrorBpm(), b ? Math.max(0, b.wait - CUE_START) : 0));
}

export const themeOf = (phase: MusicPhase): MusicTheme | null =>
  phase === null ? null : phase === 'boss' ? 'mirror-boss' : phase === 'wave' ? 'mirror' : 'mirror-calm';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** Danger 0..1 from the HUD: HP under 55 % (full at the 30 % low-HP mark), a crowd over 55 % of the cap (full at 90 %). */
export function dangerOf(s: Pick<HudState, 'hp' | 'hpMax' | 'lowHp'>, crowd = 0): number {
  const frac = s.hpMax > 0 ? s.hp / s.hpMax : 1;
  const hp = s.lowHp ? 1 : clamp01((0.55 - frac) / 0.25);
  return Math.max(hp, clamp01((crowd - 0.55) / 0.35));
}

export type MirrorHud = Pick<HudState, 'hp' | 'hpMax' | 'lowHp' | 'time' | 'boss'>;

class MirrorMusic {
  private now: MusicPhase = null;
  private map: MapId | null = null;
  private recolour: ReturnType<typeof setTimeout> | null = null;
  /** The wave was cleared (heard from the HUD) before the UI moved on to the shop. */
  private cleared = false;
  private sawBoss = false;
  private danger = 0;
  /** The last boss phase heard this fight (−1: none yet). */
  private bossPhase = -1;
  private dangerCueAt = -Infinity;
  /** Waves started (the band's call rotates with it). */
  private waves = 0;

  /** The theme for a phase, coloured by the map. Switches only when the phase or the map changes. */
  phase(phase: MusicPhase, map: MapId): void {
    try { this.doPhase(phase, map); } catch (e) { console.warn('[mirror music]', e); }
  }

  private doPhase(phase: MusicPhase, map: MapId) {
    const prev = this.now;
    const recoloured = phase !== null && map !== (this.map ?? getMirrorColour());
    if (phase === prev && !recoloured) return;
    this.now = phase;
    if (phase !== null) this.map = map;
    setMirrorMusic({ colour: map });
    if (this.recolour) { clearTimeout(this.recolour); this.recolour = null; }
    const fight = phase === 'wave' || phase === 'boss';
    if (fight) {
      // a new wave: the band counts its own phrases until the HUD reports the clock
      setMirrorMusic({ left: null, total: null, danger: 0, bossPhase: 0, ...(phase === 'wave' ? { wave: this.waves++ } : {}) });
      this.danger = 0;
      this.sawBoss = false;
      this.bossPhase = -1;
    }
    const wasClear = this.cleared;
    this.cleared = false;
    const id = themeOf(phase);
    if (recoloured && id !== null && music.theme === id) {
      // the Composer fixed its tempo and modes when it was built: a new map needs a new one, so
      // hand over through a breath of silence (the entry ritual covers it)
      music.setTheme(null);
      this.recolour = setTimeout(() => {
        this.recolour = null;
        if (this.now === phase) music.setTheme(id);
      }, RECOLOUR_MS);
      return;
    }
    if (fight) {
      // straight in: the new theme opens with a drum fill (a wave) or a 大鼓 roll into the 大锣 (a boss)
      music.setTheme(id, { cut: 0.3, fade: phase === 'boss' ? 0.8 : 1.2 });
    } else if ((prev === 'wave' || prev === 'boss') && phase === 'shop') {
      if (!wasClear) this.clear();
      else music.setTheme(id);
    } else if (prev === 'wave' || prev === 'boss') {
      // 镜碎 (results) or leaving mid-wave: the band drops out quickly under the shatter
      music.setTheme(id, { cut: 0.1, fade: 1.4 });
    } else music.setTheme(id);
  }

  /** The wave is won: 仓 — 钹 and 大鼓, the cymbal choked — and the band stops dead; the shop breathes in. */
  private clear() {
    this.cleared = true;
    music.cue(mirrorCue('clear'), { choke: 0.16 });
    music.setTheme('mirror-calm', { cut: 0.05, fade: 0.4 });
  }

  /** The ≈ 8 Hz HUD feed during a wave (crowd = living enemies / the cap, 0..1). */
  hud(s: MirrorHud, crowd = 0): void {
    try {
      if (this.now !== 'wave' && this.now !== 'boss') return;
      // danger rises at once and falls over about a second, so the band does not flicker
      const d = dangerOf(s, crowd);
      const was = this.danger;
      let refresh = false, phaseUp = false;
      this.danger = Math.max(d, this.danger - 0.05);
      // the band hears the danger at its next phrase; the drums answer it now
      if (was < 0.5 && this.danger >= 0.5 && s.hp > 0) {
        const now = Date.now();
        if (now - this.dangerCueAt >= DANGER_CUE_MS) { this.dangerCueAt = now; onBeat('danger'); refresh = true; }
      }
      const st = getMirrorMusic();
      const upd: Parameters<typeof setMirrorMusic>[0] = { danger: this.danger };
      if (s.time != null && Number.isFinite(s.time)) {
        upd.left = s.time;
        // the first report of a wave is its length
        if (st.total == null || s.time > st.total) upd.total = Math.max(1, s.time);
      }
      if (s.boss) {
        upd.bossPhase = s.boss.phase;
        this.sawBoss = true;
        // a new boss phase: 大锣 and the 唢呐's call at once (the boss's entry has its own roll into the 锣)
        if (this.bossPhase >= 0 && s.boss.phase > this.bossPhase && s.hp > 0) { onBeat('phase'); phaseUp = true; }
        this.bossPhase = Math.max(this.bossPhase, s.boss.phase);
      }
      setMirrorMusic(upd); // (a new boss phase also re-composes the band's next phrases by itself…)
      if (phaseUp) bandCut(); // …but the band cuts over to it at its next bar line, not a phrase later
      if (refresh) refreshMirrorBand(); // the danger layer from the next phrase, not a phrase later
      // the clear, heard as it happens (the UI's shop comes ≈ 1.2 s later, after the 「破」 title)
      if (!this.cleared && s.hp > 0 && ((this.now === 'wave' && s.time != null && s.time <= 0.05) || (this.now === 'boss' && this.sawBoss && !s.boss))) this.clear();
    } catch (e) { console.warn('[mirror music]', e); }
  }

  /** 0..1 danger set directly (a crowd near the cap, low HP): ≥ 0.5 pushes the band one layer up. */
  intensity(x: number): void {
    this.danger = clamp01(x);
    setMirrorMusic({ danger: this.danger });
  }

  /** The wave clock set directly: seconds left and the wave's length (null left: a boss, no timer). */
  clock(left: number | null, total?: number): void {
    setMirrorMusic(total == null ? { left } : { left, total });
  }

  /** Forget the phase (the view unmounts); the app picks the next page's theme. */
  dispose(): void {
    if (this.recolour) { clearTimeout(this.recolour); this.recolour = null; }
    this.now = null;
    this.map = null;
    this.cleared = false;
    this.bossPhase = -1;
    this.dangerCueAt = -Infinity;
    setMirrorMusic({ left: null, total: null, danger: 0, bossPhase: 0 });
  }
}

export const mirrorMusic = new MirrorMusic();
