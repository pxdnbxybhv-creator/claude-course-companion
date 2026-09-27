// 水月幻镜 · the music director (src/views/mirror/audio/music.ts, GDD §22) with a stubbed music engine:
// the calm theme for the lobby, the shop and the results; the wave theme with a 0.3 s cut (its drum
// fill); the clear cue (钹 + 大鼓) when the timer reaches 0 or the last boss falls; the boss phase and
// danger fed to the band; a new map restarts the band through a breath of silence; dispose forgets.
// The mirror audio (sfx.ts) hands its music() and the engine's HUD feed to the director.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const st = { want: null as string | null };
vi.mock('../src/audio/music', () => ({
  music: {
    get theme() { return st.want; },
    setTheme: (id: string | null, o?: { cut?: number; fade?: number }) => { calls.push(`setTheme(${id}${o ? ', ' + JSON.stringify(o) : ''})`); st.want = id; },
    cue: (ev: { inst: string }[], o?: { choke?: number }) => { calls.push(`cue(${ev.map((e) => e.inst).join('+')}, ${JSON.stringify(o ?? {})})`); },
    duck: () => {},
  },
}));

const { mirrorMusic, dangerOf, themeOf } = await import('../src/views/mirror/audio/music');
const { getMirrorMusic } = await import('../src/audio/music-themes');

const hud = (time: number | null, hp = 80, crowd = 0.2, boss: { id: string; hp: number; phase: number } | null = null) =>
  mirrorMusic.hud({ hp, hpMax: 100, lowHp: hp < 30, time, boss } as never, crowd);
const take = () => calls.splice(0);

describe('the mirror music director', () => {
  beforeEach(() => { vi.useFakeTimers(); mirrorMusic.dispose(); st.want = null; take(); });
  afterEach(() => { vi.useRealTimers(); });

  it('maps phases to themes', () => {
    expect(themeOf('lobby')).toBe('mirror-calm');
    expect(themeOf('shop')).toBe('mirror-calm');
    expect(themeOf('results')).toBe('mirror-calm');
    expect(themeOf('wave')).toBe('mirror');
    expect(themeOf('boss')).toBe('mirror-boss');
    expect(themeOf(null)).toBeNull();
  });

  it('lobby → wave → clear on timer 0 → shop → wave: calm, a cut into the wave, the cue, calm again', () => {
    mirrorMusic.phase('lobby', 'lake');
    expect(take()).toEqual(['setTheme(mirror-calm)']);
    mirrorMusic.phase('lobby', 'lake'); // same phase: nothing
    expect(take()).toEqual([]);
    mirrorMusic.phase('wave', 'lake');
    expect(take()).toEqual(['setTheme(mirror, {"cut":0.3,"fade":1.2})']);
    hud(20);
    expect(getMirrorMusic().left).toBe(20);
    expect(getMirrorMusic().total).toBe(20);
    hud(10, 50, 0.95);
    expect(getMirrorMusic().danger).toBeGreaterThanOrEqual(0.5); // a crowd at the cap pushes a layer up
    expect(take()).toEqual([]);
    hud(0);
    expect(take()).toEqual(['cue(bo+drum, {"choke":0.16})', 'setTheme(mirror-calm, {"cut":0.05,"fade":0.4})']);
    hud(0); // heard once
    expect(take()).toEqual([]);
    mirrorMusic.phase('shop', 'lake');
    expect(take()).toEqual(['setTheme(mirror-calm)']);
    mirrorMusic.phase('wave', 'lake');
    expect(take()).toEqual(['setTheme(mirror, {"cut":0.3,"fade":1.2})']);
    expect(getMirrorMusic().left).toBeNull(); // a new wave counts its own phrases until the HUD reports
  });

  it('a wave left without a clear (the shop straight after) still plays the cue; dying drops out fast', () => {
    mirrorMusic.phase('wave', 'lake');
    take();
    mirrorMusic.phase('shop', 'lake');
    expect(take()).toEqual(['cue(bo+drum, {"choke":0.16})', 'setTheme(mirror-calm, {"cut":0.05,"fade":0.4})']);
    mirrorMusic.phase('wave', 'lake');
    take();
    hud(12, 0); // dead: no clear
    expect(take()).toEqual([]);
    mirrorMusic.phase('results', 'lake');
    expect(take()).toEqual(['setTheme(mirror-calm, {"cut":0.1,"fade":1.4})']);
  });

  it('a boss: its phase steps the band, its fall is the clear', () => {
    mirrorMusic.phase('boss', 'lake');
    expect(take()).toEqual(['setTheme(mirror-boss, {"cut":0.3,"fade":0.8})']);
    hud(null, 80, 0.1, null); // the intro, before the boss stands
    expect(take()).toEqual([]);
    hud(null, 80, 0.1, { id: 'b', hp: 1, phase: 0 });
    hud(null, 80, 0.1, { id: 'b', hp: 0.6, phase: 1 });
    expect(getMirrorMusic().bossPhase).toBe(1);
    expect(take()).toEqual([]);
    hud(null, 80, 0.1, null);
    expect(take()).toEqual(['cue(bo+drum, {"choke":0.16})', 'setTheme(mirror-calm, {"cut":0.05,"fade":0.4})']);
  });

  it('a new map restarts the band through a breath of silence; dispose forgets the phase', () => {
    mirrorMusic.phase('shop', 'lake');
    take();
    mirrorMusic.phase('wave', 'forest');
    expect(take()).toEqual(['setTheme(mirror, {"cut":0.3,"fade":1.2})']); // a new theme id: a new Composer anyway
    mirrorMusic.phase('shop', 'forest');
    take();
    mirrorMusic.phase('shop', 'palace'); // same theme id, a new map: silence, then the theme
    expect(take()).toEqual(['setTheme(null)']);
    vi.advanceTimersByTime(600);
    expect(take()).toEqual(['setTheme(mirror-calm)']);
    expect(getMirrorMusic().colour).toBe('palace');
    mirrorMusic.phase('wave', 'palace');
    hud(15, 80, 0.9);
    mirrorMusic.dispose();
    expect(getMirrorMusic()).toMatchObject({ left: null, total: null, danger: 0, bossPhase: 0 });
    take();
    hud(0); // no phase: the feed is ignored
    expect(take()).toEqual([]);
  });

  it('danger: HP under 55 % and a crowd over 55 % of the cap', () => {
    expect(dangerOf({ hp: 100, hpMax: 100, lowHp: false }, 0)).toBe(0);
    expect(dangerOf({ hp: 20, hpMax: 100, lowHp: true }, 0)).toBe(1);
    expect(dangerOf({ hp: 100, hpMax: 100, lowHp: false }, 0.9)).toBeCloseTo(1, 5);
    expect(dangerOf({ hp: 100, hpMax: 100, lowHp: false }, 0.5)).toBe(0);
  });

  it('the mirror audio hands music() and the HUD feed to the director', async () => {
    const { createMirrorAudio } = await import('../src/views/mirror/audio/sfx');
    const a = createMirrorAudio();
    a.music('lobby', 'lake');
    a.music('wave', 'lake');
    expect(take()).toEqual(['setTheme(mirror-calm)', 'setTheme(mirror, {"cut":0.3,"fade":1.2})']);
    a.hud?.({ hp: 80, hpMax: 100, lowHp: false, time: 0, boss: null } as never, 0.1);
    expect(take()).toEqual(['cue(bo+drum, {"choke":0.16})', 'setTheme(mirror-calm, {"cut":0.05,"fade":0.4})']);
    a.dispose();
    a.music('wave', 'lake'); // disposed: nothing
    expect(take()).toEqual([]);
  });
});
