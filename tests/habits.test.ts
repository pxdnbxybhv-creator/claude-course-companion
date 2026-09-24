import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fromKey, isValidKey, toKey, cnNumber, cnYearDigits } from '../src/core/date';
import { bestStreakFor, freshnessFor, growthFor, isScheduled, statsFor, streakFor, toggleDay } from '../src/core/habits';
import type { Habit } from '../src/core/types';

const T = '2026-09-24'; // a Thursday
const habit = (over: Partial<Habit> = {}): Habit => ({ id: 'h', name: 'x', plant: 'plum', seed: 1, createdAt: '2026-01-01', ...over });
const lastN = (n: number, from = T) => Array.from({ length: n }, (_, i) => addDays(from, -i)).sort();

describe('date', () => {
  it('round-trips keys and handles month/year/DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST start
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // US DST end
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(toKey(fromKey('2026-09-24'))).toBe('2026-09-24');
  });
  it('validates keys', () => {
    expect(isValidKey('2026-02-29')).toBe(false);
    expect(isValidKey('2024-02-29')).toBe(true);
    expect(isValidKey('2026-9-1')).toBe(false);
    expect(isValidKey(20260101)).toBe(false);
  });
  it('writes Chinese numerals', () => {
    expect(cnYearDigits(2026)).toBe('二〇二六');
    expect(cnNumber(1)).toBe('一');
    expect(cnNumber(10)).toBe('十');
    expect(cnNumber(14)).toBe('十四');
    expect(cnNumber(20)).toBe('二十');
    expect(cnNumber(31)).toBe('三十一');
  });
});

describe('habits', () => {
  it('schedules by weekday', () => {
    expect(isScheduled(habit(), T)).toBe(true);
    expect(isScheduled(habit({ days: [4] }), T)).toBe(true);
    expect(isScheduled(habit({ days: [1, 2] }), T)).toBe(false);
  });

  it('grows monotonically from a visible sprout toward full bloom', () => {
    expect(growthFor(0)).toBeCloseTo(0.06, 5);
    expect(growthFor(66)).toBeGreaterThan(0.95);
    for (let n = 0; n < 200; n++) expect(growthFor(n + 1)).toBeGreaterThan(growthFor(n));
    expect(growthFor(1000)).toBeLessThanOrEqual(1);
  });

  it('keeps a streak alive until the day is over', () => {
    const done = new Set(lastN(5, addDays(T, -1))); // yesterday and 4 days before
    expect(streakFor(habit(), done, T)).toBe(5);
    done.add(T);
    expect(streakFor(habit(), done, T)).toBe(6);
  });

  it('breaks a streak on a missed scheduled day but skips rest days', () => {
    const h = habit({ days: [1, 3, 5] }); // Mon, Wed, Fri
    // 2026-09-21 Mon, 09-23 Wed done; Fri 09-18 done; Wed 09-16 missed
    const done = new Set(['2026-09-14', '2026-09-18', '2026-09-21', '2026-09-23']);
    expect(streakFor(h, done, T)).toBe(3);
    expect(bestStreakFor(h, [...done])).toBe(3);
  });

  it('computes best streak across gaps', () => {
    const days = [...lastN(4, '2026-09-10'), ...lastN(7, T)];
    expect(bestStreakFor(habit(), days)).toBe(7);
    expect(bestStreakFor(habit(), [])).toBe(0);
  });

  it('freshness rewards recent consistency and is optimistic for new habits', () => {
    const h = habit();
    expect(freshnessFor(habit({ createdAt: T }), new Set(), T)).toBe(1);
    expect(freshnessFor(h, new Set(lastN(14)), T)).toBeCloseTo(1, 5);
    const lapsed = freshnessFor(h, new Set(lastN(7, addDays(T, -8))), T);
    const recent = freshnessFor(h, new Set(lastN(7)), T);
    expect(recent).toBeGreaterThan(lapsed);
    expect(freshnessFor(h, new Set(), T)).toBe(0);
  });

  it("doesn't punish an unfinished today", () => {
    const h = habit();
    const done = new Set(lastN(14, addDays(T, -1)));
    expect(freshnessFor(h, done, T)).toBeCloseTo(1, 5);
  });

  it('summarises stats', () => {
    const s = statsFor(habit(), lastN(10), T);
    expect(s.done).toBe(10);
    expect(s.doneToday).toBe(true);
    expect(s.streak).toBe(10);
    expect(s.best).toBe(10);
  });

  it('toggles days keeping them sorted and unique', () => {
    expect(toggleDay(['2026-09-02', '2026-09-01'], '2026-09-03')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(toggleDay(['2026-09-01', '2026-09-02'], '2026-09-01')).toEqual(['2026-09-02']);
  });
});
