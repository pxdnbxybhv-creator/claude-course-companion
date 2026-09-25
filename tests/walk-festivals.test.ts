import { describe, expect, it } from 'vitest';
import { FESTIVALS, festivalsOn, newYearOf } from '../src/views/walk/features/calendar';
import { feature, timeChoice } from '../src/views/walk/features/kit';
import { FEATURES } from '../src/views/walk/features';
import type { WorldCtx } from '../src/views/walk/types';
import { toLunar } from '../src/core/lunar';
import { termOnDay } from '../src/core/solarterms';

const day = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

describe('walk festivals', () => {
  it('lists every festival once, in calendar order', () => {
    expect(FESTIVALS.map((f) => f.key)).toEqual([
      'newyear', 'spring', 'lantern', 'qingming', 'dragonboat', 'qixi', 'midautumn', 'chongyang', 'dongzhi', 'laba',
    ]);
    for (const f of FESTIVALS) expect(f.zh.length).toBeGreaterThan(0);
  });

  it('2026-09-25 is 中秋 (八月十五), with the eve and the day after', () => {
    const l = toLunar(day('2026-09-25'));
    expect([l.month, l.day, l.leap]).toEqual([8, 15, false]);
    expect(festivalsOn(day('2026-09-25'))).toEqual(['midautumn']);
    expect(festivalsOn(day('2026-09-24'))).toEqual(['midautumn']);
    expect(festivalsOn(day('2026-09-26'))).toEqual(['midautumn']);
    expect(festivalsOn(day('2026-09-27'))).toEqual([]);
  });

  it('2026-02-17 is 春节, and 除夕 through 初三 count', () => {
    const l = toLunar(day('2026-02-17'));
    expect([l.month, l.day]).toEqual([1, 1]);
    expect(festivalsOn(day('2026-02-17'))).toEqual(['spring']);
    expect(festivalsOn(day('2026-02-16'))).toEqual(['spring']); // 除夕 (腊月廿九 in 2026)
    expect(festivalsOn(day('2026-02-19'))).toEqual(['spring']); // 初三
    expect(festivalsOn(day('2026-02-20'))).toEqual([]);
    expect(festivalsOn(day('2026-03-03'))).toEqual(['lantern']); // 正月十五
  });

  it('2026-06-19 is 端午', () => {
    const l = toLunar(day('2026-06-19'));
    expect([l.month, l.day]).toEqual([5, 5]);
    expect(festivalsOn(day('2026-06-19'))).toEqual(['dragonboat']);
  });

  it('2026-12-22 is 冬至', () => {
    expect(termOnDay(day('2026-12-22'))?.index).toBe(21);
    expect(festivalsOn(day('2026-12-22'))).toEqual(['dongzhi']);
  });

  it('清明, 七夕, 重阳, 腊八 and 元旦 in 2026', () => {
    expect(termOnDay(day('2026-04-05'))?.index).toBe(4);
    expect(festivalsOn(day('2026-04-05'))).toEqual(['qingming']);
    expect(festivalsOn(day('2026-08-19'))).toEqual(['qixi']);
    expect(festivalsOn(day('2026-10-18'))).toEqual(['chongyang']);
    expect(festivalsOn(day('2026-01-26'))).toEqual(['laba']);
    expect(festivalsOn(day('2026-01-01'))).toEqual(['newyear']);
  });

  it('an ordinary day has none', () => {
    expect(festivalsOn(day('2026-05-12'))).toEqual([]);
    expect(festivalsOn(day('2026-11-03'))).toEqual([]);
  });
});

describe('walk features across worlds and time choices', () => {
  /** A world stub with just what a Bag touches. */
  const world = (name: string) => {
    const calls: [string, unknown][] = [];
    const ctx = {
      name,
      scene: { add() {} },
      camera: { layers: { mask: 1 | 2 } },
      hud: { setCounter: (id: string, label: unknown) => calls.push([id, label]), toast() {}, showCard() {} },
      onFrame: () => () => {},
      addInteractable: () => () => {},
    } as unknown as WorldCtx & { name: string };
    return { ctx, calls };
  };

  it('keeps one bag per world: an abandoned world never disposes the new one', async () => {
    const disposed: string[] = [];
    const f = feature('probe', (bag, ctx) => {
      bag.counter('probe', { zh: '测', en: 'probe' }, '0');
      bag.onDispose(() => disposed.push((ctx as unknown as { name: string }).name));
    });
    const A = world('A'), B = world('B');
    const fa = f.fresh(), fb = f.fresh();
    // The view was rebuilt while A was still starting: B reaches this feature first, A's init lands late.
    await fb.init(B.ctx);
    await fa.init(A.ctx);
    fa.dispose?.();
    expect(disposed).toEqual(['A']);
    // A's late teardown must not wipe the counter: it goes back to B
    expect(A.calls.filter(([, l]) => l === null)).toEqual([]);
    expect(B.calls.at(-1)).toEqual(['probe', { zh: '测', en: 'probe' }]);
    fb.dispose?.();
    expect(disposed).toEqual(['A', 'B']);
    expect(B.calls.at(-1)).toEqual(['probe', null]);
  });

  it('hands out fresh feature instances on every pass over FEATURES', () => {
    const one = [...FEATURES], two = [...FEATURES];
    expect(one.map((f) => f.id)).toEqual(two.map((f) => f.id));
    expect(one.length).toBeGreaterThan(5);
    one.forEach((f, i) => expect(f).not.toBe(two[i]));
    expect(new Set(one.map((f) => f.id)).size).toBe(one.length);
  });

  it('honours an explicit 昼 / 夜 but lets a festival bring night on “now”', () => {
    const env = (tod: string, hour: number, date: Date, extra: object = {}) => ({ env: { tod, hour, date, festivals: [], ...extra } }) as unknown as WorldCtx;
    const noon = new Date(2026, 8, 25, 12, 40);
    expect(timeChoice(env('day', 11, noon))).toBe('day'); // the core pins 昼 to 11:00
    expect(timeChoice(env('night', 21.5, noon))).toBe('night'); // …and 夜 to 21:30
    expect(timeChoice(env('day', 12 + 40 / 60, noon))).toBe('now');
    const eleven = new Date(2026, 8, 25, 11, 0);
    expect(timeChoice(env('day', 11, eleven))).toBe('now'); // the real clock at 11:00 is just “now”
    expect(timeChoice(env('day', 11, eleven, { timeMode: 'day' }))).toBe('day'); // the contract field wins
  });

  it('greets the coming year in a 元旦 preview', () => {
    expect(newYearOf(day('2027-01-01'))).toBe(2027);
    expect(newYearOf(day('2026-09-25'))).toBe(2027);
    expect(newYearOf(day('2026-12-31'))).toBe(2027);
  });
});
