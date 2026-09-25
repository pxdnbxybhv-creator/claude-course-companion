import { describe, expect, it, beforeEach } from 'vitest';
import { play, emptyPlay, record, recordMax, flag, visitRegion, unlocked, selectCharacter, dailyPicksFor, sanitizePlay, celebrations, questValue, redeemCode, revokeCode, codeActive, isUnlockedIn } from '../src/app/play';
import { state, emptyState, exportJSON, importJSON } from '../src/app/store';
import { QUESTS, QUEST } from '../src/data/quests';
import { CHARACTERS } from '../src/data/characters';

describe('play progress', () => {
  beforeEach(() => {
    state.value = emptyState();
    play.value = emptyPlay();
    celebrations.value = [];
  });

  it('every quest reward and every character unlock refer to each other', () => {
    for (const c of CHARACTERS) {
      if (c.unlock === 'default') continue;
      const q = QUEST[c.unlock];
      expect(q, `quest ${c.unlock} for ${c.id}`).toBeTruthy();
      expect('character' in q.reward && q.reward.character).toBe(c.id);
    }
    const ids = new Set(QUESTS.map((q) => q.id));
    expect(ids.size).toBe(QUESTS.length);
  });

  it('counters finish quests and unlock companions, announced once', () => {
    expect(unlocked.value).toEqual(['scholar']);
    for (let i = 0; i < 6; i++) record('water');
    expect(unlocked.value).not.toContain('gardener');
    record('water');
    expect(unlocked.value).toContain('gardener');
    expect(celebrations.value).toEqual(['q-water']);
    record('water');
    expect(celebrations.value).toEqual(['q-water']);
  });

  it('bests, flags and region visits', () => {
    recordMax('feihua', 7);
    recordMax('feihua', 4);
    expect(play.value.best.feihua).toBe(7);
    recordMax('feihua', 10);
    expect(unlocked.value).toContain('poet');
    flag('bell');
    expect(unlocked.value).toContain('taoist');
    for (const r of ['garden', 'village', 'lake', 'bamboo', 'plum']) visitRegion(r);
    expect(unlocked.value).not.toContain('painter');
    visitRegion('mountain');
    expect(unlocked.value).toContain('painter');
    expect(play.value.daily.counts.visits).toBe(6);
    visitRegion('lake');
    expect(play.value.daily.counts.visits).toBe(6);
  });

  it('real-life quests read habit data', () => {
    const q = QUEST['q-incense'];
    state.value = { ...emptyState(), focus: Array.from({ length: 5 }, (_, i) => ({ start: i, minutes: 30, completed: true })) };
    expect(questValue(q, play.value, state.value)).toBe(5);
  });

  it('only unlocked characters can be chosen', () => {
    expect(selectCharacter('fisher')).toBe(false);
    for (let i = 0; i < 5; i++) record('fish');
    expect(selectCharacter('fisher')).toBe(true);
    expect(play.value.character).toBe('fisher');
  });

  it('gathering twelve companions brings the thirteenth', () => {
    const p = emptyPlay();
    for (const c of CHARACTERS) if (c.unlock !== 'default' && c.id !== 'change') p.done[c.unlock] = '2026-09-25';
    play.value = p;
    record('noop');
    expect(unlocked.value).toContain('change');
  });

  it('the test code CZ opens every companion without finishing any quest', () => {
    expect(redeemCode('nope')).toBe('invalid');
    expect(redeemCode('')).toBe('invalid');
    expect(unlocked.value).toEqual(['scholar']);
    expect(redeemCode(' cz ')).toBe('unlocked');
    expect(codeActive.value).toBe(true);
    expect(unlocked.value).toEqual(CHARACTERS.map((c) => c.id));
    expect(isUnlockedIn(play.value, 'change')).toBe(true);
    expect(redeemCode('ＣＺ')).toBe('already');
    // nothing was earned: no quest done, nothing to celebrate, 群贤毕至 still counts only earned ones
    expect(play.value.done).toEqual({});
    expect(celebrations.value).toEqual([]);
    expect(questValue(QUEST['q-all'], play.value, state.value)).toBe(1);
    expect(selectCharacter('guan')).toBe(true);
    // and it survives a backup round trip
    const json = exportJSON();
    play.value = emptyPlay();
    expect(importJSON(json)).toBe(true);
    expect(codeActive.value).toBe(true);
    expect(play.value.character).toBe('guan');
    // taken back: companions you only borrowed go, and you walk as the scholar again
    revokeCode();
    expect(codeActive.value).toBe(false);
    expect(unlocked.value).toEqual(['scholar']);
    expect(play.value.character).toBe('scholar');
  });

  it('revoking the code keeps a companion you really earned', () => {
    for (let i = 0; i < 7; i++) record('water');
    redeemCode('CZ');
    selectCharacter('gardener');
    revokeCode();
    expect(play.value.character).toBe('gardener');
  });

  it('daily errands are three, stable for the day, and vary by day', () => {
    const a = dailyPicksFor('2026-09-25').map((d) => d.id);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(dailyPicksFor('2026-09-25').map((d) => d.id)).toEqual(a);
    const days = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'].map((d) => dailyPicksFor(d).map((x) => x.id).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('sanitizes junk and rides along in backups', () => {
    expect(sanitizePlay({ character: 'dragon', counters: { a: -3, b: 'x', c: 4 } })).toMatchObject({ character: 'scholar', counters: { c: 4 } });
    record('fish', 3);
    const json = exportJSON();
    play.value = emptyPlay();
    expect(importJSON(json)).toBe(true);
    expect(play.value.counters.fish).toBe(3);
  });
});
