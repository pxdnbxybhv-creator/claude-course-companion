// 水月幻镜 · the music director (src/views/mirror/audio/music.ts, GDD §22) with a stubbed music engine:
// the calm theme for the lobby, the shop and the results; the wave theme with a 0.3 s cut (its drum
// fill); the clear cue (钹 + 大鼓) when the timer reaches 0 or the last boss falls; the boss phase and
// danger fed to the band, each answered by a cue on the band's next beat (a 堂鼓 roll into 大鼓 + 小锣 when the danger rises,
// at most every 12 s; a 大锣 with the 唢呐's call on a new boss phase), shifted onto that beat from the band's grid
// (music-player.ts bandBeat, stubbed here), and a new boss phase cuts the band over at its next bar (bandCut,
// stubbed); each wave tells the band its number; a new map restarts the band
// through a breath of silence; dispose forgets.
// The mirror audio (sfx.ts) hands its music() and the engine's HUD feed to the director.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
/** The first event's time of each cue, and the band's beat the stub reports. */
const cueAt: number[] = [];
const st = { want: null as string | null, beat: null as { wait: number; bpm: number } | null };
vi.mock('../src/audio/music-player', () => ({ bandBeat: () => st.beat, bandCut: () => { calls.push('bandCut'); return null; } }));
vi.mock('../src/audio/music', () => ({
  music: {
    get theme() { return st.want; },
    setTheme: (id: string | null, o?: { cut?: number; fade?: number }) => { calls.push(`setTheme(${id}${o ? ', ' + JSON.stringify(o) : ''})`); st.want = id; },
    cue: (ev: { inst: string; t: number }[], o?: { choke?: number }) => { calls.push(`cue(${ev.map((e) => e.inst).join('+')}, ${JSON.stringify(o ?? {})})`); cueAt.push(Math.min(...ev.map((e) => e.t))); },
    duck: () => {},
  },
}));

const { mirrorMusic, dangerOf, themeOf } = await import('../src/views/mirror/audio/music');
const { getMirrorMusic, mirrorEpoch } = await import('../src/audio/music-themes');

const hud = (time: number | null, hp = 80, crowd = 0.2, boss: { id: string; hp: number; phase: number } | null = null) =>
  mirrorMusic.hud({ hp, hpMax: 100, lowHp: hp < 30, time, boss } as never, crowd);
const take = () => calls.splice(0);

describe('the mirror music director', () => {
  beforeEach(() => { vi.useFakeTimers(); mirrorMusic.dispose(); st.want = null; st.beat = null; take(); cueAt.splice(0); });
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
    expect(take()).toEqual(['cue(drum+drum+drum+drum+gong+drum, {})']); // …and the drums answer at once
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

  it('each wave tells the band its number (the call rotates); the cues land on the band\'s next beat', () => {
    mirrorMusic.phase('wave', 'lake');
    const w = getMirrorMusic().wave ?? 0;
    mirrorMusic.phase('shop', 'lake');
    mirrorMusic.phase('wave', 'lake');
    expect(getMirrorMusic().wave).toBe(w + 1);
    mirrorMusic.phase('boss', 'lake'); // a boss has its own call
    expect(getMirrorMusic().wave).toBe(w + 1);
    take(); cueAt.splice(0);
    // the band's next beat is 0.31 s away: the boss-phase cue's 大锣 (t = 0) waits for it, past music.cue's own 20 ms
    st.beat = { wait: 0.31, bpm: 146 };
    hud(null, 80, 0.1, { id: 'b', hp: 1, phase: 0 });
    hud(null, 80, 0.1, { id: 'b', hp: 0.6, phase: 1 });
    expect(take()).toEqual(['cue(gong+drum+suona, {})', 'bandCut']);
    expect(cueAt[0]).toBeCloseTo(0.29, 6);
    // no band playing: at once
    mirrorMusic.phase('wave', 'lake');
    take(); cueAt.splice(0);
    st.beat = null;
    hud(30, 90, 0.2); hud(29, 90, 0.95);
    expect(take()).toEqual(['cue(drum+drum+drum+drum+gong+drum, {})']);
    expect(cueAt[0]).toBe(0);
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
    expect(take()).toEqual([]); // the entry has its own roll into the 锣
    const e0 = mirrorEpoch();
    hud(null, 80, 0.1, { id: 'b', hp: 0.6, phase: 1 });
    expect(getMirrorMusic().bossPhase).toBe(1);
    expect(mirrorEpoch()).toBe(e0 + 1); // the band re-composes what it has not played
    // a new phase: 大锣, 大鼓 and the 唢呐's call on the next beat; the band cuts over at its next bar,
    // after the new phase is set (the cut composes with it)
    expect(take()).toEqual(['cue(gong+drum+suona, {})', 'bandCut']);
    hud(null, 80, 0.1, { id: 'b', hp: 0.5, phase: 1 });
    expect(take()).toEqual([]); // the same phase: no cue, no cut
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

  it('the danger cue: on the rise past one half, at most every 12 s, never for the dead or outside a fight', () => {
    mirrorMusic.phase('wave', 'lake');
    take();
    hud(30, 90, 0.2);
    const e0 = mirrorEpoch();
    hud(29, 90, 0.95); // a crowd at the cap
    expect(take()).toEqual(['cue(drum+drum+drum+drum+gong+drum, {})']);
    expect(mirrorEpoch()).toBe(e0 + 1); // …and the band re-composes its next phrases with the danger layer
    hud(28, 90, 0.95); // still in danger: no repeat
    for (let i = 0; i < 20; i++) hud(27, 90, 0.2); // it falls away (0.05 per report)
    expect(getMirrorMusic().danger).toBeLessThan(0.5);
    hud(26, 90, 0.95); // rises again within 12 s: the band's next phrase carries it, no second cue
    expect(take()).toEqual([]);
    expect(mirrorEpoch()).toBe(e0 + 1); // a danger hovering around one half does not churn the band
    for (let i = 0; i < 20; i++) hud(25, 90, 0.2);
    vi.advanceTimersByTime(12_500);
    hud(24, 90, 0.95);
    expect(take()).toEqual(['cue(drum+drum+drum+drum+gong+drum, {})']);
    for (let i = 0; i < 20; i++) hud(23, 90, 0.2);
    vi.advanceTimersByTime(12_500);
    hud(22, 0, 0.95); // dead
    expect(take()).toEqual([]);
    mirrorMusic.phase('shop', 'lake');
    take();
    hud(10, 90, 0.95); // not a fight
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
