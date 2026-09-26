import { describe, expect, it } from 'vitest';
import { emptyPlay } from '../src/app/play';
import { QUESTS } from '../src/data/quests';
import { CHARACTERS } from '../src/data/characters';
import {
  COMPANION_QUESTS, SEAL_QUESTS, brushOutline, cnCount, companionCount, dayHeading, doneDate, routeForQuest,
  sealCount, sealLook, stampText, statText, tallyGlyphs,
} from '../src/views/quests/helpers';

describe('quest book helpers', () => {
  it('splits the quests into companion and seal groups, covering all of them', () => {
    expect(COMPANION_QUESTS.length + SEAL_QUESTS.length).toBe(QUESTS.length);
    // everyone but the scholar (from the start) and 玉兔 (the 初见礼 letter) comes with a quest
    expect(COMPANION_QUESTS.length).toBe(CHARACTERS.filter((c) => c.unlock !== 'default' && c.unlock !== 'gift').length);
    expect(COMPANION_QUESTS.length).toBe(CHARACTERS.length - 2);
    // 八月十五 now earns the seal 团圆
    expect(SEAL_QUESTS.some((q) => q.id === 'q-mooncake' && 'seal' in q.reward && q.reward.seal === '团圆')).toBe(true);
  });

  it('the ledger names coins from letters and from 桃源, and any other named source', async () => {
    const { ledgerToday, namedSources } = await import('../src/views/quests/helpers');
    const p = emptyPlay();
    p.daily = { day: '2026-09-26', picks: [], counts: { 'src:mail': 300, 'src:taoyuan': 120, 'src:kite': 5, earned: 425 }, visited: [], paid: [] };
    const { rows, total } = ledgerToday(p, '2026-09-26');
    expect(rows.find((r) => r.key === 'src:mail')).toMatchObject({ zh: '书信', en: 'Letters', coins: 300 });
    expect(rows.find((r) => r.key === 'src:taoyuan')).toMatchObject({ zh: '桃源', en: 'Peach Spring', coins: 120 });
    expect(rows.find((r) => r.key === 'src:kite')?.coins).toBe(5);
    expect(rows.some((r) => r.key === 'other')).toBe(false);
    expect(total).toBe(425);
    // 桃源 is named where coins come from only once you have been there
    expect(namedSources(p).map((r) => r[0])).toEqual(['书信']);
    p.flags['visit:taoyuan'] = true;
    expect(namedSources(p).map((r) => r[0])).toEqual(['书信', '桃源']);
  });

  it('counts companions and seals for the hall stat line', () => {
    const p = emptyPlay();
    expect(companionCount(p)).toBe(1);
    expect(statText(p, 'zh')).toBe(`同伴 1/${CHARACTERS.length} · 印 0`);
    p.done = { 'q-water': '2026-09-25', 'q-lotus': '2026-09-25', 'q-summit': '2026-09-24' };
    expect(companionCount(p)).toBe(2);
    expect(sealCount(p)).toBe(2);
    expect(statText(p, 'en')).toBe(`Companions 2/${CHARACTERS.length} · Seals 2`);
  });

  it('every quest has a stamp text, a seal look, and a route unless it is about companions', () => {
    for (const q of QUESTS) {
      const s = stampText(q);
      expect(s.length).toBeGreaterThan(0);
      const look = sealLook(s);
      expect(['bai', 'zhu']).toContain(look.style);
      expect(['square', 'round', 'oval']).toContain(look.shape);
      if (q.goal.kind !== 'companions') expect(routeForQuest(q), q.id).not.toBeNull();
    }
  });

  it('draws a deterministic, closed brush outline', () => {
    const a = brushOutline(42), b = brushOutline(42), c = brushOutline(43);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('M')).toBe(true);
    expect(a.endsWith('Z')).toBe(true);
    expect(a).not.toMatch(/NaN/);
  });

  it('writes tallies in 正 characters of five strokes', () => {
    expect(tallyGlyphs(1)).toEqual([1]);
    expect(tallyGlyphs(3)).toEqual([3]);
    expect(tallyGlyphs(5)).toEqual([5]);
    expect(tallyGlyphs(7)).toEqual([5, 2]);
    expect(tallyGlyphs(10)).toEqual([5, 5]);
  });

  it('formats dates and small numbers', () => {
    expect(doneDate('2026-09-25', 'zh')).toBe('2026年9月25日');
    expect(doneDate('2026-09-25', 'en')).toBe('25 Sep 2026');
    expect(dayHeading('2026-09-25', 'en')).toBe('Friday, 25 Sep');
    expect(dayHeading('2026-09-25', 'zh')).toMatch(/^.+月.+ · 周五$/);
    expect(cnCount(0)).toBe('〇');
    expect(cnCount(2)).toBe('二');
    expect(cnCount(7)).toBe('七');
  });
});
