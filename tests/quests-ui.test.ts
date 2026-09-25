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
    expect(COMPANION_QUESTS.length).toBe(CHARACTERS.length - 1);
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
