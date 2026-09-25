import { describe, expect, it } from 'vitest';
import { FESTIVALS, festivalsOn } from '../src/views/walk/features/calendar';
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
