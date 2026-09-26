import { describe, expect, it } from 'vitest';
import { festivalNight, festivalPreview, type Bag } from '../src/views/walk/features/kit';
import type { FestivalKey, WorldCtx } from '../src/views/walk/types';

/** A world stub: what festivalNight reads (env, the sky) and a bag that records its teardown. */
function world(o: { tod: 'dawn' | 'day' | 'dusk' | 'night'; hour: number; date: Date; festivals: FestivalKey[]; timeMode?: 'now' | 'day' | 'night' }) {
  let forced = false;
  const forcedLog: boolean[] = [];
  const undo: (() => void)[] = [];
  const ctx = {
    env: { tod: o.tod, hour: o.hour, date: o.date, festivals: o.festivals, timeMode: o.timeMode ?? 'now' },
    sky: {
      isNight: () => forced || o.tod === 'night',
      forceNight: (on: boolean) => { forced = on; forcedLog.push(on); },
    },
  } as unknown as WorldCtx;
  const bag = { ctx, onDispose: (fn: () => void) => undo.push(fn) } as unknown as Bag;
  return { ctx, bag, forcedLog, dispose: () => undo.forEach((f) => f()), isForced: () => forced };
}

// 2026-09-25 is 中秋 (lunar 8/15); 2026-09-20 is an ordinary day.
const midAutumnNoon = new Date(2026, 8, 25, 12, 40);
const midAutumnDusk = new Date(2026, 8, 25, 18, 0);
const midAutumnNight = new Date(2026, 8, 25, 21, 0);

describe('festival nights keep the real clock', () => {
  it('shows the daytime face on the festival day itself', () => {
    const w = world({ tod: 'day', hour: 12.67, date: midAutumnNoon, festivals: ['midautumn'] });
    expect(festivalPreview(w.ctx)).toBe(false);
    expect(festivalNight(w.bag)).toBe(false);
    expect(w.forcedLog).toEqual([]);
  });

  it('brings the festival evening on at real dusk, and gives the sky back', () => {
    const w = world({ tod: 'dusk', hour: 18, date: midAutumnDusk, festivals: ['midautumn'] });
    expect(festivalNight(w.bag)).toBe(true);
    expect(w.isForced()).toBe(true);
    w.dispose();
    expect(w.isForced()).toBe(false);
  });

  it('needs nothing forced at real night', () => {
    const w = world({ tod: 'night', hour: 21, date: midAutumnNight, festivals: ['midautumn'] });
    expect(festivalNight(w.bag)).toBe(true);
    expect(w.forcedLog).toEqual([]);
  });

  it('shows the night at once in a preview of another day’s festival', () => {
    const w = world({ tod: 'day', hour: 12.67, date: new Date(2026, 8, 20, 12, 40), festivals: ['qixi'] });
    expect(festivalPreview(w.ctx)).toBe(true);
    expect(festivalNight(w.bag)).toBe(true);
    expect(w.isForced()).toBe(true);
  });

  it('lets the visitor’s 昼 / 夜 win', () => {
    const day = world({ tod: 'day', hour: 11, date: new Date(2026, 8, 20, 15, 0), festivals: ['qixi'], timeMode: 'day' });
    expect(festivalNight(day.bag)).toBe(false);
    expect(day.forcedLog).toEqual([]);
    const night = world({ tod: 'night', hour: 21.5, date: midAutumnNoon, festivals: ['midautumn'], timeMode: 'night' });
    expect(festivalNight(night.bag)).toBe(true);
  });
});
