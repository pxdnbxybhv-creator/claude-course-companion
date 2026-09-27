// 水月幻镜 · the music director (GDD §22). It picks the theme for each phase — 'mirror-calm' for the
// lobby, the shop and the results, 'mirror' for a wave, 'mirror-boss' for a boss — hands over with the
// transitions (a drum fill into a wave, a choked 钹 on the clear, a 大鼓 roll into the 大锣 when a
// boss arrives), and feeds the band the wave clock and the danger. The themes read that state as each
// phrase is composed (src/audio/music-themes.ts: mirrorTier, mirrorBossStep), so layers enter over the
// wave, the last 10 s tighten and danger pushes a layer up.
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
import { getMirrorColour, getMirrorMusic, mirrorCue, setMirrorMusic } from '../../../audio/music-themes';
import type { MusicTheme } from '../../walk/map';
import type { MapId } from '../ids';
import type { HudState, MusicPhase } from '../types';

/** A map change while the theme id stays the same restarts the music after this pause (ms): longer
 *  than music.ts's 450 ms debounce, so the silence is honoured and a new Composer takes the map's
 *  tempo and modes. */
const RECOLOUR_MS = 520;

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
      setMirrorMusic({ left: null, total: null, danger: 0, bossPhase: 0 });
      this.danger = 0;
      this.sawBoss = false;
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
      this.danger = Math.max(d, this.danger - 0.05);
      const st = getMirrorMusic();
      const upd: Parameters<typeof setMirrorMusic>[0] = { danger: this.danger };
      if (s.time != null && Number.isFinite(s.time)) {
        upd.left = s.time;
        // the first report of a wave is its length
        if (st.total == null || s.time > st.total) upd.total = Math.max(1, s.time);
      }
      if (s.boss) { upd.bossPhase = s.boss.phase; this.sawBoss = true; }
      setMirrorMusic(upd);
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
    setMirrorMusic({ left: null, total: null, danger: 0, bossPhase: 0 });
  }
}

export const mirrorMusic = new MirrorMusic();
