import { describe, expect, it } from 'vitest';
import {
  type LunarDate, astronomicalLunarMonths, festivalsOn, fromLunar, ganZhiOfYear, leapMonthOf, lunarDayName, lunarMonths, toLunar,
} from '../src/core/lunar';

const ymd = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
const day = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** False for the rare local days a time zone skipped (e.g. 1994-12-31 in Pacific/Kiritimati). */
const exists = (y: number, m: number, d: number) => new Date(y, m, d).getDate() === d;

// Every lunar year 1901–2099 as published by the Hong Kong Observatory, 公曆與農曆日期對照表
// (https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T<year>c.txt), re-encoded from all 200
// yearly tables: YYYYMMDD of 正月初一, leap month in hex (0 = none), then the months in order
// (leap month after its namesake), L = 30 days, S = 29 days.
const HKO_LUNAR_YEARS = [
  '190102190SLSSLSLSLLLS 190202080LSLSSLSLSLLL 190301295SLSLSSLSSLLSL 190402160LLSLSSLSSLLS 190502040LLSLLSSLSLSL 190601254SLLSLSLSLSLSL',
  '190702130SLSLSLLSLSLS 190802020LSSLLSLSLLSL 190901222SLSSLSLSLLLSL 191002100SLSSLSLSLLLS 191101306LSLSSLSSLLSLL 191202180LSLSSLSSLLSL',
  '191302060LLSLSSLSSLSL 191401265LLSLSLSLSSLSL 191502140LSLLSLSLSLSS 191602030LLSLSLLSLSLS 191701232LSSLSLLSLLSLS 191802110LSSLSLSLLSLL',
  '191902017SLSSLSSLLSLLL 192002200SLSSLSSLSLLL 192102080LSLSSLSSLSLL 192201285LSLLSSLSSLSLL 192302160SLLSLSLSSLSL 192402050SLLSLLSLSLSS',
  '192501244LSLSLLSLLSLSL 192602130SSLSLSLLSLLS 192702020LSSLSLSLSLLL 192801232SLSSLSSLSLLLL 192902100SLSSLSSLSLLL 193001306SLLSSLSSLSLLS',
  '193102170LLSLSLSSLSLS 193202060LLLSLSLSSLSL 193301265SLLSLLSLSLSSL 193402140SLSLLSLSLLSL 193502040SSLSLSLLSLLS 193601243LSSLSSLLSLLLS',
  '193702110LSSLSSLSLLLS 193801317LLSSLSSLSLLSL 193902190LLSSLSSLSLSL 194002080LLSLSLSSLSLS 194101276LLSLLSLSSLSLS 194202150LSLLSLSLSLSL',
  '194302050SLSLSLLSLSLS 194401254LSLSLSLSLLSLL 194502130SSLSSLSLLLSL 194602020LSSLSSLSLLSL 194701222LLSSLSSLSLSLL 194802100LSLSLSSLSLSL',
  '194901297LSLLSLSSLSLSL 195002170SLLSLLSSLSLS 195102060LSLLSLSLSLSL 195201275SLSLSLSLLSLSL 195302140SLSSLLSLLSLS 195402030LSLSSLSLLSLL',
  '195501243SLSLSSLSLSLLL 195602120SLSLSSLSLSLL 195701318LSLSLSSLSLSLS 195802180LLLSLSSLSLSL 195902080SLLSLSLSLSLS 196001286LSLSLLSLSLSLS',
  '196102150LSLSLSLLSLSL 196202050SLSSLSLLSLLS 196301254LSLSSLSLSLLLS 196402130LSLSSLSLSLLL 196502020SLSLSSLSSLLS 196601213LLLSLSSLSSLLS',
  '196702090LLSLLSSLSLSL 196801307SLSLLSLSLSLSL 196902170SLSLSLLSLSLS 197002060LSSLSLLSLLSL 197101275SLSSLSLSLLLSL 197202150SLSSLSLSLLSL',
  '197302030LSLSSLSSLLSL 197401234LLSLSSLSSLLSL 197502110LLSLSSLSSLSL 197601318LLSLSLSLSSLSL 197702180LSLLSLSLSLSS 197802070LSLLSLLSLSLS',
  '197901286LSSLSLLSLLSLS 198002160LSSLSLSLLSLL 198102050SLSSLSSLLSLL 198201254LSLSSLSSLSLLL 198302130LSLSSLSSLSLL 19840202aLSLLSSLSSLSLL',
  '198502200SLLSLSLSSLSL 198602090SLLSLLSLSLSS 198701296LSLSLLSLLSLSS 198802170LSLSLSLLSLLS 198902060LSSLSLSLSLLL 199001275SLSSLSSLSLLLL',
  '199102150SLSSLSSLSLLL 199202040SLLSSLSSLSLL 199301233SLLSLSLSSLSLS 199402100LLLSLSLSSLSL 199501318SLLSLSLLSSLSL 199602190SLSLLSLSLLSS',
  '199702070LSLSLSLLSLLS 199801285LSSLSSLLSLLSL 199902160LSSLSSLSLLLS 200002050LLSSLSSLSLLS 200101244LLSLSLSSLSLSL 200202120LLSLSLSSLSLS',
  '200302010LLSLLSLSSLSL 200401222SLSLLSLSLSLSL 200502090SLSLSLLSLSLS 200601297LSLSLSLSLLSLL 200702180SSLSSLSLLLSL 200802070LSSLSSLSLLSL',
  '200901265LLSSLSSLSLSLL 201002140LSLSLSSLSLSL 201102030LSLLSLSSLSLS 201201234LSLLSLSLSLSLS 201302100LSLSLLSLSLSL 201401319SLSLSLSLLSLSL',
  '201502190SLSSLSLLLSLS 201602080LSLSSLSLLSLL 201701286SLSLSSLSLSLLL 201802160SLSLSSLSLSLL 201902050LSLSLSSLSSLL 202001254SLLLSLSSLSLSL',
  '202102120SLLSLSLSLSLS 202202010LSLSLLSLSLSL 202301222SLSSLLSLLSLSL 202402100SLSSLSLLSLLS 202501296LSLSSLSLSLLLS 202602170LSLSSLSSLLLS',
  '202702060LLSLSSLSSLLS 202801265LLLSLSSLSSLLS 202902130LLSLSLSLSSLL 203002030SLSLLSLSLSLS 203101233SLLSLSLLSLSLS 203202110LSSLSLLSLLSL',
  '20330131bSLSSLSLSLLLSL 203402190SLSSLSLSLLSL 203502080LSLSSLSSLLSL 203601286LLSLSSLSSLSLL 203702150LLSLSSLSSLSL 203802040LLSLSLSLSSLS',
  '203901245LLSLLSLSLSLSS 204002120LSLLSLSLLSLS 204102010SLSLSLLSLLSL 204201222SLSSLSLSLLSLL 204302100SLSSLSSLLSLL 204401307LSLSSLSSLSLLL',
  '204502170LSLSSLSSLSLL 204602060LSLSLSLSSLSL 204701265LSLLSLSLSSLSL 204802140SLLSLLSLSSLS 204902020LSLSLLSLLSLS 205001233SLSLSLSLLSLLS',
  '205102110LSSLSSLLSLLL 205202018SLSSLSSLSLLLL 205302190SLSSLSSLSLLL 205402080SLLSSLSSLSLL 205501286SLLSLSLSSLSLS 205602150LLLSLSLSSLSL',
  '205702040SLLSLSLSLSLS 205801244LSLSLSLLSLLSS 205902120LSLSLSLSLLLS 206002020LSSLSSLSLLLS 206101213LLSSLSSLSLLLS 206202090LLSSLSSLSLLS',
  '206301297LLSLSLSSLSLSL 206402170LLSLSLSSLSLS 206502050LLSLLSLSSLSL 206601265SLSLLSLSLSLSL 206702140SLSLSLLSLSLS 206802030LSLSSLLSLLSL',
  '206901234SLSLSSLSLLLSL 207002110SLSLSSLSLLSL 207101318LSLSLSSLSLSLL 207202190LSLSLSSLSLSL 207302070LSLLSLSSLSLS 207401276LSLLSLSLSLSLS',
  '207502150LSLSLLSLSLSL 207602050SLSLSLSLLSLS 207701244LSLSSLSLLLSLS 207802120LSLSSLSLLSLL 207902020SLSLSSLSLSLL 208001223LSLSLSSLSSLLL',
  '208102090SLLSLSSLSSLL 208201297SLLLSSLSLSSLL 208302170SLLSLSLSLSLS 208402060LSLSLLSLSLSL 208501265SLSSLLSLLSLSL 208602140SLSSLSLLSLLS',
  '208702030LSLSSLSLSLLL 208801244SLSLSSLSSLLLS 208902100LLSLSSSLSLLS 209001308LLLSLSSLSSLLS 209102180LLSLSLSLSSLS 209202070LLSLLSLSLSLS',
  '209301276SLLSLSLLSLSLS 209402150SLSLSLLSLLSL 209502050SLSSLSLSLLLS 209601254LSLSSLSSLLLSL 209702120LSLSSSLSLLSL 209802010LLSLSSSLSLSL',
  '209901212LLSLLSSLSSLSL',
].join(' ').split(' ');

describe('toLunar / fromLunar vs the Hong Kong Observatory tables', () => {
  it('matches every lunar year 1901–2099: 正月初一, leap month and every month length', () => {
    expect(HKO_LUNAR_YEARS).toHaveLength(199);
    for (const row of HKO_LUNAR_YEARS) {
      const year = Number(row.slice(0, 4));
      const cny = `${row.slice(0, 4)}-${row.slice(4, 6)}-${row.slice(6, 8)}`;
      const leap = parseInt(row[8], 16);
      const lengths = row.slice(9).split('').map((c) => (c === 'L' ? 30 : 29));
      expect(ymd(fromLunar(year, 1, 1)), `CNY ${year}`).toBe(cny);
      expect(leapMonthOf(year), `leap ${year}`).toBe(leap);
      const months = lunarMonths(year);
      expect(months.map((m) => m.days), `months ${year}`).toEqual(lengths);
      // first and last day of every month, through toLunar
      for (const m of months) {
        const f = m.firstDay;
        const first = toLunar(f);
        expect([first.year, first.month, first.leap, first.day]).toEqual([year, m.month, m.leap, 1]);
        const last0 = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate() + m.days - 1));
        if (!exists(last0.getUTCFullYear(), last0.getUTCMonth(), last0.getUTCDate())) continue;
        const last = toLunar(new Date(last0.getUTCFullYear(), last0.getUTCMonth(), last0.getUTCDate()));
        expect([last.year, last.month, last.leap, last.day, last.monthDays]).toEqual([year, m.month, m.leap, m.days, m.days]);
      }
    }
  });

  it('Chinese New Year dates', () => {
    const cny: Record<number, string> = {
      1950: '1950-02-17', 1990: '1990-01-27', 2000: '2000-02-05', 2020: '2020-01-25', 2021: '2021-02-12',
      2022: '2022-02-01', 2023: '2023-01-22', 2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17',
      2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23',
      2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08', 2050: '2050-01-23',
      2099: '2099-01-21', 2100: '2100-02-09',
    };
    for (const [y, d] of Object.entries(cny)) {
      expect(ymd(fromLunar(Number(y), 1, 1))).toBe(d);
      const l = toLunar(day(d));
      expect([l.year, l.month, l.day, l.leap]).toEqual([Number(y), 1, 1, false]);
    }
  });

  it('leap months (HKO): 2020 闰四月, 2023 闰二月, 2025 闰六月, 2028 闰五月, 2031 闰三月, 2033 闰十一月', () => {
    const leaps: [number, number, string][] = [
      [2020, 4, '2020-05-23'], [2023, 2, '2023-03-22'], [2025, 6, '2025-07-25'],
      [2028, 5, '2028-06-23'], [2031, 3, '2031-04-22'], [2033, 11, '2033-12-22'],
    ];
    for (const [y, m, first] of leaps) {
      expect(leapMonthOf(y)).toBe(m);
      expect(ymd(fromLunar(y, m, 1, true))).toBe(first);
      const l = toLunar(day(first));
      expect(l.leap).toBe(true);
      expect(l.month).toBe(m);
    }
    expect(toLunar(day('2033-12-22')).monthName).toBe('闰冬月');
    expect(toLunar(day('2023-03-22')).monthName).toBe('闰二月');
    expect(leapMonthOf(2024)).toBe(0);
    expect(lunarMonths(2023)).toHaveLength(13);
    expect(lunarMonths(2024)).toHaveLength(12);
  });

  it('the 2057 edge case (new moon minutes before midnight): 九月初一 = 2057-09-28, as HKO', () => {
    expect(ymd(fromLunar(2057, 9, 1))).toBe('2057-09-28');
  });

  it('中秋 dates', () => {
    expect(ymd(fromLunar(2024, 8, 15))).toBe('2024-09-17');
    expect(ymd(fromLunar(2025, 8, 15))).toBe('2025-10-06');
    expect(ymd(fromLunar(2026, 8, 15))).toBe('2026-09-25');
  });

  it('round-trips fromLunar(toLunar(d)) for every day 1901–2099', () => {
    let prev: LunarDate | null = toLunar(new Date(1900, 11, 31));
    for (let t = Date.UTC(1901, 0, 1); t < Date.UTC(2100, 0, 1); t += 86400e3) {
      const u = new Date(t);
      const d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
      if (d.getDate() !== u.getUTCDate()) { prev = null; continue; } // a day this time zone skipped
      const l = toLunar(d);
      const back = fromLunar(l.year, l.month, l.day, l.leap);
      if (ymd(back) !== ymd(d)) throw new Error(`round trip failed at ${ymd(d)}: ${JSON.stringify(l)}`);
      // consecutive days advance by exactly one lunar day
      if (prev && l.day !== 1 && (l.day !== prev.day + 1 || l.month !== prev.month || l.leap !== prev.leap)) {
        throw new Error(`discontinuity at ${ymd(d)}`);
      }
      if (prev && l.day === 1 && prev.day !== prev.monthDays) throw new Error(`month ended early at ${ymd(d)}`);
      prev = l;
    }
  });
});

describe('names', () => {
  it('month, day, 干支 and zodiac', () => {
    const l = toLunar(day('2026-09-24')); // 八月十四, 丙午 马年
    expect(l).toMatchObject({ year: 2026, month: 8, day: 14, leap: false, monthName: '八月', dayName: '十四', yearGanZhi: '丙午', zodiac: '马', zodiacEn: 'Horse' });
    expect(toLunar(day('2026-12-09')).monthName).toBe('冬月');
    expect(toLunar(day('2027-01-08')).monthName).toBe('腊月');
    expect(toLunar(day('2026-02-17')).monthName).toBe('正月');
    const days = Array.from({ length: 30 }, (_, i) => lunarDayName(i + 1));
    expect(days.join(' ')).toBe(
      '初一 初二 初三 初四 初五 初六 初七 初八 初九 初十 十一 十二 十三 十四 十五 十六 十七 十八 十九 二十 ' +
      '廿一 廿二 廿三 廿四 廿五 廿六 廿七 廿八 廿九 三十',
    );
    expect(ganZhiOfYear(1984)).toBe('甲子');
    expect(ganZhiOfYear(2024)).toBe('甲辰');
    expect(ganZhiOfYear(2025)).toBe('乙巳');
    expect(ganZhiOfYear(2043)).toBe('癸亥');
    expect(toLunar(day('2024-06-01'))).toMatchObject({ yearGanZhi: '甲辰', zodiac: '龙', zodiacEn: 'Dragon' });
  });

  it('the lunar year (and animal) changes at 春节, not at 立春', () => {
    expect(toLunar(day('2026-02-04'))).toMatchObject({ year: 2025, yearGanZhi: '乙巳', zodiac: '蛇', zodiacEn: 'Snake' }); // 立春
    expect(toLunar(day('2026-02-16'))).toMatchObject({ year: 2025, month: 12, day: 29, monthDays: 29 });
    expect(toLunar(day('2026-02-17'))).toMatchObject({ year: 2026, month: 1, day: 1, yearGanZhi: '丙午', zodiac: '马' });
  });
});

describe('fromLunar edge cases', () => {
  it('returns null for dates that do not exist', () => {
    expect(fromLunar(2025, 12, 30)).toBeNull(); // 腊月 of 2025 has 29 days
    expect(ymd(fromLunar(2025, 12, 29))).toBe('2026-02-16');
    expect(fromLunar(2024, 4, 1, true)).toBeNull(); // no leap month in 2024
    expect(fromLunar(2023, 3, 1, true)).toBeNull(); // 2023 leaps 二月, not 三月
    expect(fromLunar(2026, 13, 1)).toBeNull();
    expect(fromLunar(2026, 0, 1)).toBeNull();
    expect(fromLunar(2026, 1, 0)).toBeNull();
    expect(fromLunar(2026, 1, 31)).toBeNull();
    expect(fromLunar(2026, 1.5, 1)).toBeNull();
  });

  it('returns local midnight', () => {
    const d = fromLunar(2026, 8, 15)!;
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it('ignores the time of day of the input', () => {
    const a = toLunar(new Date(2026, 8, 25, 0, 0, 0));
    const b = toLunar(new Date(2026, 8, 25, 23, 59, 59));
    expect(a).toEqual(b);
    expect(a.day).toBe(15);
  });
});

describe('the table agrees with the ephemeris', () => {
  it('astronomical months (modern rules, UTC+8) equal the table for 1929–2100', () => {
    for (let y = 1929; y <= 2100; y++) {
      const a = astronomicalLunarMonths(y).map((m) => `${m.name} ${ymd(m.firstDay)} ${m.days}`);
      const t = lunarMonths(y).map((m) => `${m.name} ${ymd(m.firstDay)} ${m.days}`);
      expect(a, `lunar year ${y}`).toEqual(t);
    }
  });

  it('before 1929 (calendar reckoned at the Beijing meridian) only three month starts differ', () => {
    const diffs: string[] = [];
    for (let y = 1900; y < 1929; y++) {
      const a = astronomicalLunarMonths(y);
      lunarMonths(y).forEach((m, i) => {
        if (ymd(m.firstDay) !== ymd(a[i].firstDay)) diffs.push(`${y} ${m.name} ${ymd(m.firstDay)}`);
      });
    }
    expect(diffs).toEqual(['1914 十月 1914-11-17', '1916 正月 1916-02-03', '1920 十月 1920-11-10']);
  });

  it('continues seamlessly outside 1900–2100', () => {
    expect(toLunar(day('1900-01-30'))).toMatchObject({ year: 1899, month: 12, day: 30 });
    expect(toLunar(day('1900-01-31'))).toMatchObject({ year: 1900, month: 1, day: 1 });
    const end2100 = lunarMonths(2100).at(-1)!;
    const after = new Date(end2100.firstDay);
    after.setDate(after.getDate() + end2100.days);
    expect(toLunar(after)).toMatchObject({ year: 2101, month: 1, day: 1 });
    expect(ymd(after)).toBe(ymd(fromLunar(2101, 1, 1)));
    for (const s of ['1850-06-15', '1899-12-31', '2101-06-15', '2150-02-01']) {
      const l = toLunar(day(s));
      expect(ymd(fromLunar(l.year, l.month, l.day, l.leap))).toBe(s);
    }
  });
});

describe('festivalsOn', () => {
  const names = (s: string) => festivalsOn(day(s)).map((f) => f.zh);

  it('finds the festivals of 2026', () => {
    const expected: [string, string][] = [
      ['2026-01-01', '元旦'], ['2026-02-16', '除夕'], ['2026-02-17', '春节'], ['2026-03-03', '元宵'],
      ['2026-03-20', '龙抬头'], ['2026-04-19', '上巳'], ['2026-04-05', '清明'], ['2026-06-19', '端午'],
      ['2026-08-19', '七夕'], ['2026-08-27', '中元'], ['2026-09-25', '中秋'], ['2026-10-18', '重阳'],
      ['2026-11-09', '寒衣'], ['2026-11-23', '下元'], ['2026-12-22', '冬至'], ['2027-01-15', '腊八'],
      ['2027-01-30', '小年'], ['2027-02-05', '除夕'],
    ];
    for (const [d, zh] of expected) expect(names(d), d).toEqual([zh]);
    expect(names('2026-09-24')).toEqual([]);
  });

  it('kinds and English names', () => {
    expect(festivalsOn(day('2026-01-01'))[0]).toMatchObject({ kind: 'solar', en: "New Year's Day" });
    expect(festivalsOn(day('2026-09-25'))[0]).toMatchObject({ kind: 'lunar', en: 'Mid-Autumn Festival' });
    expect(festivalsOn(day('2026-04-05'))[0]).toMatchObject({ kind: 'term' });
    expect(festivalsOn(day('2025-12-21'))[0]).toMatchObject({ zh: '冬至', kind: 'term', en: 'Winter Solstice' });
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      for (const f of festivalsOn(d)) expect(f.en.length).toBeGreaterThan(3);
    }
  });

  it('除夕 is 腊月廿九 when 腊月 is short, and 三十 otherwise', () => {
    expect(toLunar(day('2026-02-16'))).toMatchObject({ month: 12, day: 29 });
    expect(names('2026-02-16')).toEqual(['除夕']);
    expect(names('2026-02-15')).toEqual([]);
    expect(toLunar(day('2024-02-09'))).toMatchObject({ month: 12, day: 30 });
    expect(names('2024-02-09')).toEqual(['除夕']);
    // Every eve is the day before 春节, 1901–2099.
    for (let y = 1902; y <= 2099; y++) {
      const eve = fromLunar(y, 1, 1)!;
      eve.setDate(eve.getDate() - 1);
      expect(names(ymd(eve)!)).toContain('除夕');
    }
  });

  it('leap months do not repeat festivals', () => {
    expect(toLunar(day('2023-03-23'))).toMatchObject({ month: 2, day: 2, leap: true });
    expect(names('2023-03-23')).toEqual([]);
    expect(names('2023-02-21')).toEqual(['龙抬头']);
  });
});

describe('performance', () => {
  it('a 42-cell month grid costs well under a millisecond per call', () => {
    toLunar(new Date(2026, 8, 1));
    festivalsOn(new Date(2026, 8, 1));
    const t0 = performance.now();
    for (let rep = 0; rep < 10; rep++) {
      for (let i = 0; i < 42; i++) {
        const d = new Date(2026, 7, 30 + i);
        toLunar(d);
        festivalsOn(d);
      }
    }
    const perCall = (performance.now() - t0) / 840;
    expect(perCall).toBeLessThan(0.05);
  });
});
