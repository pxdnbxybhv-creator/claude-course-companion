import { describe, expect, it } from 'vitest';
import {
  ACTIVE_KEY, STALE_PAUSE_MS, clampMinutes, cleanIntent, cnInt, cnRemaining, decideRestore, elapsedMs, enRemaining,
  finishAt, formatClock, isFinished, isPaused, light, msToNextSecond, parseActive, pause, progress, remainingMs, resume,
  serialize, toSession,
} from '../src/views/focus/timer';
import { formatMinutes, recentDays, sessionsOn } from '../src/views/focus/stats';

const T0 = Date.UTC(2026, 8, 24, 3, 0, 0);
const MIN = 60_000;

describe('focus timer', () => {
  it('lights a clean session', () => {
    const s = light(30, '  读  书 ', T0);
    expect(s).toEqual({ start: T0, minutes: 30, intent: '读 书', pausedMs: 0, pausedAt: null });
    expect(light(0, '', T0).minutes).toBe(1);
    expect(light(999, undefined, T0).minutes).toBe(180);
    expect(light(12.6, '   ', T0)).not.toHaveProperty('intent');
    expect(clampMinutes(NaN)).toBe(30);
    expect(cleanIntent('x'.repeat(200))!.length).toBe(80);
    expect(ACTIVE_KEY).toBe('banmu.focus.active');
  });

  it('measures remaining time from timestamps', () => {
    const s = light(30, undefined, T0);
    expect(remainingMs(s, T0)).toBe(30 * MIN);
    expect(remainingMs(s, T0 + 12 * MIN)).toBe(18 * MIN);
    expect(progress(s, T0 + 15 * MIN)).toBeCloseTo(0.5);
    expect(remainingMs(s, T0 + 99 * MIN)).toBe(0);
    expect(progress(s, T0 + 99 * MIN)).toBe(1);
    expect(isFinished(s, T0 + 30 * MIN)).toBe(true);
    expect(isFinished(s, T0 + 30 * MIN - 1)).toBe(false);
    // A clock set backwards never produces negative elapsed time.
    expect(elapsedMs(s, T0 - 5 * MIN)).toBe(0);
  });

  it('accounts for pauses', () => {
    let s = light(30, undefined, T0);
    s = pause(s, T0 + 10 * MIN);
    expect(isPaused(s)).toBe(true);
    expect(finishAt(s)).toBeNull();
    // Time stands still while paused.
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(20 * MIN);
    expect(remainingMs(s, T0 + 50 * MIN)).toBe(20 * MIN);
    expect(pause(s, T0 + 55 * MIN)).toBe(s); // idempotent
    s = resume(s, T0 + 50 * MIN);
    expect(s.pausedMs).toBe(40 * MIN);
    expect(resume(s, T0 + 51 * MIN)).toBe(s);
    expect(remainingMs(s, T0 + 55 * MIN)).toBe(15 * MIN);
    expect(finishAt(s)).toBe(T0 + 70 * MIN);
    // Second pause accumulates.
    s = resume(pause(s, T0 + 60 * MIN), T0 + 62 * MIN);
    expect(s.pausedMs).toBe(42 * MIN);
    expect(finishAt(s)).toBe(T0 + 72 * MIN);
  });

  it('never pauses past the end or resumes into negative time', () => {
    const s = light(10, undefined, T0);
    const p = pause(s, T0 + 20 * MIN);
    expect(p.pausedAt).toBe(T0 + 10 * MIN);
    expect(remainingMs(p, T0 + 30 * MIN)).toBe(0);
    const back = resume(pause(s, T0 + 5 * MIN), T0 + 2 * MIN);
    expect(back.pausedMs).toBe(0);
  });

  it('round-trips through storage and rejects garbage', () => {
    const s = pause(light(45, 'write', T0), T0 + MIN);
    expect(parseActive(serialize(s))).toEqual(s);
    expect(parseActive(null)).toBeNull();
    expect(parseActive('{oops')).toBeNull();
    expect(parseActive('42')).toBeNull();
    expect(parseActive(JSON.stringify({ start: T0, minutes: 0 }))).toBeNull();
    expect(parseActive(JSON.stringify({ start: T0, minutes: 500 }))).toBeNull();
    expect(parseActive(JSON.stringify({ start: 'x', minutes: 30 }))).toBeNull();
    expect(parseActive(JSON.stringify({ start: T0, minutes: 30, pausedMs: -1 }))).toBeNull();
    expect(parseActive(JSON.stringify({ start: T0, minutes: 30, pausedAt: 'soon' }))).toBeNull();
    // Missing optional fields default sensibly.
    expect(parseActive(JSON.stringify({ start: T0, minutes: 30 }))).toEqual({ start: T0, minutes: 30, pausedMs: 0, pausedAt: null });
  });

  it('decides what to do with a stored session on start-up', () => {
    const s = light(30, 'read', T0);
    expect(decideRestore(null, T0)).toEqual({ kind: 'none', clear: false });
    expect(decideRestore('garbage', T0)).toEqual({ kind: 'none', clear: true });
    expect(decideRestore(serialize(s), T0 + 10 * MIN)).toEqual({ kind: 'resume', session: s });
    expect(decideRestore(serialize(s), T0 + 3 * 3600_000)).toEqual({ kind: 'finished', session: s, finishedAt: T0 + 30 * MIN });
    const p = pause(s, T0 + 5 * MIN);
    expect(decideRestore(serialize(p), T0 + 3 * 3600_000)).toEqual({ kind: 'resume', session: p });
    expect(decideRestore(serialize(p), T0 + 5 * MIN + STALE_PAUSE_MS + 1)).toEqual({ kind: 'stale', session: p });
    // Paused time is not counted towards finishing.
    const r = resume(p, T0 + 65 * MIN);
    expect(decideRestore(serialize(r), T0 + 80 * MIN).kind).toBe('resume');
    expect(decideRestore(serialize(r), T0 + 90 * MIN)).toMatchObject({ kind: 'finished', finishedAt: T0 + 90 * MIN });
  });

  it('builds a log entry', () => {
    expect(toSession(light(30, 'read', T0), true)).toEqual({ start: T0, minutes: 30, completed: true, intent: 'read' });
    expect(toSession(light(15, '', T0), false)).toEqual({ start: T0, minutes: 15, completed: false });
  });

  it('schedules ticks on whole displayed seconds', () => {
    const s = light(1, undefined, T0);
    expect(msToNextSecond(s, T0)).toBe(1000);
    expect(msToNextSecond(s, T0 + 250)).toBe(750);
    expect(msToNextSecond(s, T0 + 2 * MIN)).toBe(0);
  });
});

describe('focus formatting', () => {
  it('formats the clock (rounding up)', () => {
    expect(formatClock(30 * MIN)).toBe('30:00');
    expect(formatClock(18 * MIN + 41_200)).toBe('18:42');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(65 * MIN)).toBe('1:05:00');
  });

  it('writes Chinese numerals', () => {
    expect([0, 1, 10, 11, 18, 20, 30, 45, 99].map(cnInt)).toEqual(['零', '一', '十', '十一', '十八', '二十', '三十', '四十五', '九十九']);
    expect([100, 105, 110, 180, 999].map(cnInt)).toEqual(['一百', '一百零五', '一百一十', '一百八十', '九百九十九']);
    expect(cnRemaining(18 * MIN)).toBe('还剩十八分');
    expect(cnRemaining(17 * MIN + 1)).toBe('还剩十八分');
    expect(cnRemaining(30_000)).toBe('将尽');
    expect(cnRemaining(0)).toBe('香已燃尽');
    expect(enRemaining(MIN)).toBe('1 minute left');
    expect(enRemaining(18 * MIN)).toBe('18 minutes left');
  });
});

describe('focus stats', () => {
  const at = (d: number, h: number) => new Date(2026, 8, d, h, 0).getTime();
  const log = [
    { start: at(24, 9), minutes: 30, completed: true, intent: 'read' },
    { start: at(24, 14), minutes: 45, completed: true },
    { start: at(24, 8), minutes: 25, completed: false },
    { start: at(22, 9), minutes: 60, completed: true },
    { start: at(17, 9), minutes: 30, completed: true }, // 8 days ago: outside the week
    { start: at(25, 9), minutes: 30, completed: true }, // tomorrow: ignored
  ];

  it('lists today in order', () => {
    expect(sessionsOn(log, '2026-09-24').map((s) => s.minutes)).toEqual([25, 30, 45]);
  });

  it('summarises the last seven days', () => {
    const week = recentDays(log, '2026-09-24');
    expect(week.map((d) => d.day)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(week[6]).toMatchObject({ count: 2, minutes: 75 });
    expect(week[6].sessions).toHaveLength(3);
    expect(week[4]).toMatchObject({ count: 1, minutes: 60 });
    expect(week.reduce((a, d) => a + d.minutes, 0)).toBe(135);
  });

  it('formats minutes', () => {
    expect(formatMinutes(75, true)).toBe('1 小时 15 分');
    expect(formatMinutes(45, true)).toBe('45 分钟');
    expect(formatMinutes(120, false)).toBe('2 h');
  });
});
