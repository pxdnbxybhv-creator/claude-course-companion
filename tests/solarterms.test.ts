import { describe, expect, it } from 'vitest';
import { chinaDayNumber, localDayNumber, seasonOfTerm, termContext, termOnDay, termsOfYear } from '../src/core/solarterms';

const NAMES = '立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至 小寒 大寒'.split(' ');
const day = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** China-time (UTC+8) wall clock of an instant, "MM-DD HH:MM:SS". */
const cst = (d: Date) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(5, 19).replace('T', ' ');

// Hong Kong Observatory, 二十四節氣 (Hong Kong time = UTC+8, to the minute), for 2025 and 2026 in
// Gregorian order 小寒 大寒 立春 … 冬至.
const HKO_INSTANTS: Record<number, string> = {
  2025: '01-05 10:33, 01-20 04:00, 02-03 22:10, 02-18 18:07, 03-05 16:07, 03-20 17:01, 04-04 20:48, 04-20 03:56, ' +
    '05-05 13:57, 05-21 02:55, 06-05 17:56, 06-21 10:42, 07-07 04:05, 07-22 21:29, 08-07 13:52, 08-23 04:34, ' +
    '09-07 16:52, 09-23 02:19, 10-08 08:41, 10-23 11:51, 11-07 12:04, 11-22 09:36, 12-07 05:05, 12-21 23:03',
  2026: '01-05 16:23, 01-20 09:45, 02-04 04:02, 02-18 23:52, 03-05 21:59, 03-20 22:46, 04-05 02:40, 04-20 09:39, ' +
    '05-05 19:49, 05-21 08:37, 06-05 23:48, 06-21 16:25, 07-07 09:57, 07-23 03:13, 08-07 19:43, 08-23 10:19, ' +
    '09-07 22:41, 09-23 08:05, 10-08 14:29, 10-23 17:38, 11-07 17:52, 11-22 15:23, 12-07 10:52, 12-22 04:50',
};

// US Naval Observatory equinoxes & solstices (UT, to the minute): 春分 夏至 秋分 冬至.
const USNO_SEASONS: Record<number, string> = {
  2023: '03-20 21:24, 06-21 14:58, 09-23 06:50, 12-22 03:27',
  2024: '03-20 03:06, 06-20 20:51, 09-22 12:44, 12-21 09:20',
  2025: '03-20 09:01, 06-21 02:42, 09-22 18:19, 12-21 15:03',
  2026: '03-20 14:46, 06-21 08:24, 09-23 00:05, 12-21 20:50',
  2027: '03-20 20:25, 06-21 14:11, 09-23 06:02, 12-22 02:42',
};

// Day of month of each term, every year 1901–2100, from the Hong Kong Observatory's
// 公曆與農曆日期對照表 (节气 column; https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T<year>c.txt).
// One 24-letter word per year in Gregorian order 小寒 大寒 立春 … 冬至; letter = '@' + day.
const HKO_TERM_DAYS = [
  'FUDSFUEUFVFVHWHXHXIXHWHV FUESFUFUFVGVHXHXHXIXHWHW FUETGVFUGVGVHXIXIXIXHWHW GUETFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV', // 1901–1905
  'FUESFUFUFVFVHXHXHXIXHWHW FUETGVFUGVGVHXIXIXIXHWHW GUETFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESFUFUFVFVHXHXHXIXHWHW', // 1906–1910
  'FUETGVFUGVGVHXIXIXIXHWHW GUETFUETFUFVGWHWHWIXHWGV FTDSFUEUFVFVHWHXHXIXHWHV FUDSFUEUFVFVHXHXHXIXHWHW FUETFVFUFVGVHXHXIXIXHWHW', // 1911–1915
  'FUETFUETFUFVGWHWHWHXHVGV FTDSFUEUFUFVHWHXHWIXHWGV FUDSFUEUFVFVHXHXHXIXHWHV FUETFVFUFVGVHXHXIXIXHWHW FUETFUETFUFVGWHWHWHXHVGV', // 1916–1920
  'FTDSFUETFUFVHWHXHWIXHWGV FUDSFUEUFVFVHXHXHXIXHWHV FUESFUFUFVGVHXHXIXIXHWHW FUETFUETFUFVGWHWHWHXHVGV FTDSFUETFUFVHWHXHWIXHWGV', // 1921–1925
  'FUDSFUEUFVFVHWHXHXIXHWHV FUESFUFUFVGVHXHXHXIXHWHW FUETFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV', // 1926–1930
  'FUESFUFUFVGVHXHXHXIXHWHW FUETFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESFUFUFVFVHXHXHXIXHWHW', // 1931–1935
  'FUETFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESFUFUFVFVHXHXHXIXHWHW FUETFUETFUFUGWHWHWHWGVGV', // 1936–1940
  'FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESFUFUFVFVHXHXHXIXHWHW FUETFUETEUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWHXHVGV', // 1941–1945
  'FTDSFUEUFVFVHWHXHWIXHWHV FUDSFUEUFVFVHXHXHXIXHWHW FUETEUETEUFUGWGWHWHWGVGV ETDSFUETFUFVGWHWHWHXHVGV FTDSFUETFUFVHWHXHWIXHWHV', // 1946–1950
  'FUDSFUEUFVFVHXHXHXIXHWHW FUETEUETEUFUGWGWHWHWGVGV ETDSFUETFUFVGWHWHWHXHVGV FTDSFUETFUFVHWHXHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV', // 1951–1955
  'FUETETETEUFUGWGWHWHWGVGV ETDSFUETFUFVGWHWHWHXHVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESETETEUFUGWGWGWHWGVGV', // 1956–1960
  'ETDSFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESETETEUFUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHWGVGV', // 1961–1965
  'FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHXIXHWHV FUESETETEUEUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV', // 1966–1970
  'FUDSFUEUFVFVHWHXHXIXHWHV FUESETETEUEUGWGWGWHWGVGV ETDSFUETEUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSFUEUFVFVHWHXHWIXHWHV', // 1971–1975
  'FUESETDTEUEUGWGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV FTDSFUETFUFVGWHWHWHXHWGV FUDSFUEUFUFVHWHXHWIXHWHV FUESETDTEUEUGWGWGWHWGVGV', // 1976–1980
  'ETDSFUETEUFUGWGWHWHWGVGV FTDSFUETFUFVGWHWHWHXHVGV FTDSFUETFUFVHWHXHWIXHWHV FUDSETDTEUEUGVGWGWHWGVGV ETDSEUETEUFUGWGWHWHWGVGV', // 1981–1985
  'ETDSFUETFUFVGWHWHWHXHVGV FTDSFUETFUFVGWHXHWIXHWGV FUDSETDTEUEUGVGWGWHWGVGU ETDSETETEUFUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHXHVGV', // 1986–1990
  'FTDSFUETFUFVGWHWHWIXHWGV FUDSETDTEUEUGVGWGWHWGVGU ETDRETETEUFUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV', // 1991–1995
  'FUDSETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSETDTEUEUGVGWGWHWGVGU', // 1996–2000
  'ETDRETETEUEUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV', // 2001–2005
  'ETDSFUETEUFUGWGWHWHWGVGV FTDSFUETFUFVGWHWHWIXHWGV FUDSETDTEUEUGVGWGVHWGVGU ETDRETDTEUEUGWGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV', // 2006–2010
  'FTDSFUETFUFVGWHWHWHXHWGV FUDSETDTETEUGVGWGVHWGVGU ETDRETDTEUEUGVGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV FTDSFUETFUFVGWHWHWHXHVGV', // 2011–2015
  'FTDSETDSETEUGVGWGVHWGVGU ETCRETDTEUEUGVGWGWHWGVGV ETDSEUETEUFUGWGWHWHWGVGV ETDSFUETFUFUGWHWHWHXHVGV FTDSETDSETEUFVGVGVHWGVGU', // 2016–2020
  'ETCRETDTEUEUGVGWGWHWGVGU ETDSETETEUFUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHXHVGV FTDSETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU', // 2021–2025
  'ETDRETETEUEUGWGWGWHWGVGV ETDSFUETFUFUGWHWHWHWGVGV FTDSETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV', // 2026–2030
  'ETDSFUETFUFUGWHWHWHWGVGV FTDSETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV', // 2031–2035
  'FTDSETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV FTDSETDSETEUFVGVGVHWGVFU', // 2036–2040
  'ETCRETDTETEUGVGWGVHWGVGU ETDRETDTEUEUGWGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV FTDSETDSETEUFVGVGVGWGVFU ETCRETDSETEUGVGWGVHWGVGU', // 2041–2045
  'ETDRETDTEUEUGVGWGWHWGVGV ETDSFUETEUFUGWGWHWHWGVGV FTDSETDSETETFVGVGVGWGUFU ESCRETDSETEUFVGVGVHWGVGU ETCRETDTEUEUGVGWGWHWGVGV', // 2046–2050
  'ETDSETETEUFUGWGWGWHWGVGV ETDSETDSETETFVGVGVGWGUFU ESCRETDSETEUFVGVGVHWGVGU ETCRETDTEUEUGVGWGWHWGVGV ETDSETETEUEUGWGWGWHWGVGV', // 2051–2055
  'ETDSETDSETETFVGVGVGWGUFU ESCRETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU ETDSETETEUEUGWGWGWHWGVGV ETDSETDSETETFVGVGVGVFUFU', // 2056–2060
  'ESCRETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV ETDSETDSETETFVGVGVGVFUFU ESCRETDSETEUFVGVGVHWGVFU', // 2061–2065
  'ETCRETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV ETDSETDSDTETFVFVGVGVFUFU ESCRETDSETEUFVGVGVHWGVFU ETCRETDTETEUGVGWGVHWGVGU', // 2066–2070
  'ETDRETETEUEUGWGWGWHWGVGV ETDSETDSDTETFVFVGVGVFUFU ESCRETDSETEUFVGVGVGWGVFU ETCRETDTETEUGVGWGVHWGVGU ETDRETDTEUEUGVGWGWHWGVGV', // 2071–2075
  'ETDSETDSDTETFVFVGVGVFUFU ESCRETDSETEUFVGVGVGWGVFU ETCRETDSETEUFVGWGVHWGVGU ETDRETDTEUEUGVGWGWHWGVGV ETDSETDSDTETFVFVGVGVFUFU', // 2076–2080
  'ESCRETDSETETFVGVGVGWGUFU ETCRETDSETEUFVGVGVHWGVGU ETCRETDTEUEUGVGWGWHWGVGV ETDSDSDSDTETFVFVFVGVFUFU DSCRETDSETETFVGVGVGWGUFU', // 2081–2085
  'ESCRETDSETEUFVGVGVHWGVGU ETCRETDTEUEUGVGWGWHWGVGV ETDSDSDSDTDTFVFVFVGVFUFU DSCRETDSETETFVGVGVGWGUFU ESCRETDSETEUFVGVGVHWGVFU', // 2086–2090
  'ETCRETDTEUEUGVGWGWHWGVGU ETDSDSDSDTDTFVFVFVGVFUFU DSCRETDSETETFVGVGVGVFUFU ESCRETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU', // 2091–2095
  'ETDRDSDSDTDTFVFVFVGVFUFU DSCRETDSETETFVFVGVGVFUFU ESCRETDSETEUFVGVGVHWGVFU ETCRETDTEUEUGVGWGWHWGVGU ETDRETETEUEUGWGWGWHWGVGV', // 2096–2100
].join(' ').split(' ');

describe('term instants', () => {
  it('match the Hong Kong Observatory to the minute (2025, 2026)', () => {
    for (const [year, list] of Object.entries(HKO_INSTANTS)) {
      const terms = termsOfYear(Number(year));
      list.split(', ').forEach((s, i) => {
        const [md, hm] = s.split(' ');
        const [mo, d] = md.split('-').map(Number);
        const [h, mi] = hm.split(':').map(Number);
        const ref = Date.UTC(Number(year), mo - 1, d, h - 8, mi);
        expect(Math.abs(terms[i].at.getTime() - ref) / 1000, `${year} ${NAMES[terms[i].index]} ${cst(terms[i].at)}`).toBeLessThanOrEqual(60);
      });
    }
  });

  it('match USNO equinoxes and solstices 2023–2027 to the minute', () => {
    for (const [year, list] of Object.entries(USNO_SEASONS)) {
      list.split(', ').forEach((s, i) => {
        const [md, hm] = s.split(' ');
        const [mo, d] = md.split('-').map(Number);
        const [h, mi] = hm.split(':').map(Number);
        const t = termsOfYear(Number(year)).find((x) => x.index === 3 + 6 * i)!;
        expect(Math.abs(t.at.getTime() - Date.UTC(Number(year), mo - 1, d, h, mi)) / 1000).toBeLessThanOrEqual(60);
      });
    }
  });

  it('立春 2024 at 16:27 CST', () => {
    const t = termsOfYear(2024).find((x) => x.index === 0)!;
    expect(cst(t.at).slice(0, 11)).toBe('02-04 16:27');
  });

  it('1979 大寒 is the ephemeris knife-edge: 23:59:5x CST on Jan 20', () => {
    // 寿星万年历 (sxwnl) gives 1979-01-20 23:59:56 too; HKO's table prints it on Jan 21.
    const t = termsOfYear(1979).find((x) => x.index === 23)!;
    expect(cst(t.at).slice(0, 10)).toBe('01-20 23:5');
  });
});

describe('term days', () => {
  it('match the HKO table on every term day 1901–2100 (all 4800), bar six knife-edge cases', () => {
    expect(HKO_TERM_DAYS).toHaveLength(200);
    const mismatches: string[] = [];
    for (let y = 1901; y <= 2100; y++) {
      const word = HKO_TERM_DAYS[y - 1901];
      termsOfYear(y).forEach((t, i) => {
        const hkoDay = word.charCodeAt(i) - 64;
        const u = new Date(t.at.getTime() + 8 * 3600e3);
        if (u.getUTCFullYear() !== y || u.getUTCDate() !== hkoDay) mismatches.push(`${y} ${NAMES[t.index]} ${cst(t.at)}`);
      });
    }
    // Five before 1929, when the almanac was not yet reckoned in UTC+8, each within minutes of
    // midnight; and 1979 大寒, four seconds before midnight.
    expect(mismatches).toEqual([
      '1912 小雪 11-22 23:48:11',
      '1913 秋分 09-23 23:52:50',
      '1917 大雪 12-08 00:01:00',
      '1927 白露 09-09 00:05:31',
      '1928 夏至 06-22 00:06:29',
      '1979 大寒 01-20 23:59:56',
    ]);
  });

  it('termOnDay: the 2025–2026 landmarks', () => {
    const cases: [string, string][] = [
      ['2025-12-21', '冬至'], ['2026-01-05', '小寒'], ['2026-02-04', '立春'], ['2026-03-20', '春分'],
      ['2026-04-05', '清明'], ['2026-06-21', '夏至'], ['2026-08-07', '立秋'], ['2026-09-23', '秋分'],
      ['2026-12-22', '冬至'],
    ];
    for (const [d, name] of cases) expect(NAMES[termOnDay(day(d))!.index], d).toBe(name);
    expect(termOnDay(day('2026-09-24'))).toBeNull();
    expect(termOnDay(day('2026-12-21'))).toBeNull(); // 冬至 2026 is 04:50 CST on the 22nd
    expect(termOnDay(new Date(2026, 1, 4, 23, 59))!.index).toBe(0); // time of day is ignored
  });
});

describe('termsOfYear', () => {
  it('24 sorted terms, 小寒 … 冬至, all dated within the year in China time, cached', () => {
    for (const y of [1900, 1950, 2000, 2026, 2100]) {
      const terms = termsOfYear(y);
      expect(terms.map((t) => t.index)).toEqual([22, 23, ...Array.from({ length: 22 }, (_, i) => i)]);
      for (let i = 1; i < 24; i++) {
        const gap = (terms[i].at.getTime() - terms[i - 1].at.getTime()) / 86400e3;
        expect(gap).toBeGreaterThan(14.6);
        expect(gap).toBeLessThan(15.8);
      }
      for (const t of terms) expect(new Date(t.at.getTime() + 8 * 3600e3).getUTCFullYear()).toBe(y);
      expect(termsOfYear(y)).toBe(terms);
    }
  });
});

describe('termContext', () => {
  it('on a term day, that term is current all day', () => {
    for (const hour of [0, 7, 12, 23]) {
      const c = termContext(new Date(2026, 8, 23, hour));
      expect(NAMES[c.current.index]).toBe('秋分');
      expect(NAMES[c.next.index]).toBe('寒露');
      expect(c.pentad).toBe(0);
      expect(c.daysToNext).toBe(15); // 寒露 is 2026-10-08
    }
  });

  it('pentads split the term into thirds of ~5 days', () => {
    const at = (s: string) => termContext(day(s));
    expect(at('2026-09-27').pentad).toBe(0);
    expect(at('2026-09-28').pentad).toBe(1);
    expect(at('2026-10-02').pentad).toBe(1);
    expect(at('2026-10-03').pentad).toBe(2);
    expect(at('2026-10-07')).toMatchObject({ pentad: 2, daysToNext: 1 });
    expect(NAMES[at('2026-10-08').current.index]).toBe('寒露');
    expect(at('2026-09-24')).toMatchObject({ pentad: 0, daysToNext: 14 });
    // 夏至 2026-06-21 → 小暑 2026-07-07 is 16 days: 5 + 6 + 5.
    const split = Array.from({ length: 16 }, (_, i) => termContext(new Date(2026, 5, 21 + i)).pentad).join('');
    expect(split).toBe('0000011111122222');
  });

  it('crosses the year boundary', () => {
    const jan1 = termContext(day('2026-01-01'));
    expect(NAMES[jan1.current.index]).toBe('冬至');
    expect(new Date(jan1.current.at.getTime() + 8 * 3600e3).getUTCFullYear()).toBe(2025);
    expect(NAMES[jan1.next.index]).toBe('小寒');
    expect(jan1.daysToNext).toBe(4);
    const dec31 = termContext(day('2026-12-31'));
    expect(NAMES[dec31.current.index]).toBe('冬至');
    expect(NAMES[dec31.next.index]).toBe('小寒');
    expect(dec31.daysToNext).toBe(5); // 2027-01-05
  });

  it('is consistent with termOnDay for every day 1990–2040', () => {
    let prev = termContext(day('1989-12-31'));
    for (const d = day('1990-01-01'); d.getFullYear() <= 2040; d.setDate(d.getDate() + 1)) {
      const c = termContext(d);
      const n = localDayNumber(d);
      if (!(chinaDayNumber(c.current.at) <= n && n < chinaDayNumber(c.next.at))) throw new Error(`bracket ${d.toDateString()}`);
      if (c.next.index !== (c.current.index + 1) % 24) throw new Error(`order ${d.toDateString()}`);
      if (c.daysToNext !== chinaDayNumber(c.next.at) - n || c.daysToNext < 1) throw new Error(`days ${d.toDateString()}`);
      const on = termOnDay(d);
      if (on) {
        if (on.index !== c.current.index || c.pentad !== 0) throw new Error(`termOnDay ${d.toDateString()}`);
      } else if (c.current.index === prev.current.index && c.pentad < prev.pentad) {
        throw new Error(`pentad went backwards ${d.toDateString()}`);
      }
      prev = c;
    }
  });

  it('is fast enough for a 42-cell month grid', () => {
    termContext(new Date(2026, 8, 1));
    const t0 = performance.now();
    for (let rep = 0; rep < 10; rep++) for (let i = 0; i < 42; i++) { termContext(new Date(2026, 7, 30 + i)); termOnDay(new Date(2026, 7, 30 + i)); }
    expect((performance.now() - t0) / 840).toBeLessThan(0.05);
  });
});

it('seasonOfTerm', () => {
  expect([0, 5, 6, 11, 12, 17, 18, 23, 24, -1].map(seasonOfTerm)).toEqual([
    'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'spring', 'winter',
  ]);
});
