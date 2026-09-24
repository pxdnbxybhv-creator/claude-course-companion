// Chinese lunisolar calendar (农历).
//
// 1900–2100: the classic compact month table (lunarInfo, as used by most open-source Chinese
// calendars); it agrees with the Hong Kong Observatory's 公历与农历日期对照表 on every day of
// 1901–2100, and with our own ephemeris from 1929 on (see tests/lunar.test.ts). Outside that
// range the calendar is computed astronomically with the modern rules (GB/T 33661-2017): months
// begin on the China-time (UTC+8) day of the true new moon, the month holding 冬至 is 十一月, and
// in a 13-month 岁 the first month without a 中气 is the leap month. Lunar dates are China-time
// dates: toLunar reads only its argument's local Y/M/D, and treats it as that day in China.
import { moonPhaseInstant } from './astro';
import { chinaDayNumber, localDayNumber, termOnDay, termsOfYear } from './solarterms';

export interface LunarDate {
  /** Lunar year number (the Gregorian year in which that lunar year began). */
  year: number;
  /** 1..12 */
  month: number;
  /** 1..30 */
  day: number;
  /** True if this month is a leap (闰) month. */
  leap: boolean;
  /** Days in this lunar month (29 or 30). */
  monthDays: number;
  /** Sexagenary year name, e.g. 丙午. */
  yearGanZhi: string;
  /** Zodiac animal character, e.g. 马. */
  zodiac: string;
  /** English animal, e.g. Horse. */
  zodiacEn: string;
  /** 正月 … 冬月 腊月, with 闰 prefix for leap months. */
  monthName: string;
  /** 初一 … 三十 */
  dayName: string;
}

// ───────────────────────────── names ─────────────────────────────

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
const ZODIAC_EN = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
const MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const DIGITS = '一二三四五六七八九十';

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 丙午 for 2026. */
export function ganZhiOfYear(year: number): string {
  return GAN[mod(year - 4, 10)] + ZHI[mod(year - 4, 12)];
}

/** 正月 … 腊月, 闰四月 … */
export function lunarMonthName(month: number, leap = false): string {
  return (leap ? '闰' : '') + MONTH_NAMES[month - 1];
}

/** 初一 … 初十, 十一 … 二十, 廿一 … 廿九, 三十. */
export function lunarDayName(day: number): string {
  if (day <= 10) return '初' + DIGITS[day - 1];
  if (day < 20) return '十' + DIGITS[day - 11];
  if (day === 20) return '二十';
  if (day < 30) return '廿' + DIGITS[day - 21];
  return '三十';
}

// ───────────────────────────── year data ─────────────────────────────

const DAY_MS = 86_400_000;

// Bits 16..5 (0x8000 → 正月 … 0x10 → 腊月): month has 30 days; bits 3..0: leap month (0 = none);
// bit 16 (0x10000): the leap month has 30 days.
const LUNAR_INFO: readonly number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900–1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910–1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920–1929
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930–1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940–1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950–1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960–1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970–1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980–1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990–1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000–2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010–2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020–2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030–2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040–2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0, // 2050–2059
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060–2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070–2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080–2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090–2099
  0x0d520, // 2100
];
const TABLE_FIRST = 1900;
const TABLE_LAST = TABLE_FIRST + LUNAR_INFO.length - 1; // 2100
/** 1900-01-31, 正月初一 of lunar 1900, as a day number (days since 1970-01-01). */
const TABLE_EPOCH = Date.UTC(1900, 0, 31) / DAY_MS;

interface LunarMonthSpan {
  month: number;
  leap: boolean;
  days: number;
  /** Day number (days since 1970-01-01) of 初一. */
  start: number;
}

interface LunarYearSpan {
  year: number;
  /** Day numbers: first day (正月初一) and the day after the last (next 正月初一). */
  start: number;
  end: number;
  months: LunarMonthSpan[];
}

const yearCache = new Map<number, LunarYearSpan>();
let tableStarts: number[] | null = null;

function tableYearDays(info: number): number {
  let days = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) if (info & bit) days++;
  if (info & 0xf) days += info & 0x10000 ? 30 : 29;
  return days;
}

function tableYear(year: number): LunarYearSpan {
  if (!tableStarts) {
    tableStarts = [TABLE_EPOCH];
    for (const info of LUNAR_INFO) tableStarts.push(tableStarts[tableStarts.length - 1] + tableYearDays(info));
  }
  const i = year - TABLE_FIRST;
  const info = LUNAR_INFO[i];
  const leapMonth = info & 0xf;
  const months: LunarMonthSpan[] = [];
  let start = tableStarts[i];
  for (let m = 1; m <= 12; m++) {
    const days = info & (0x10000 >> m) ? 30 : 29;
    months.push({ month: m, leap: false, days, start });
    start += days;
    if (m === leapMonth) {
      const leapDays = info & 0x10000 ? 30 : 29;
      months.push({ month: m, leap: true, days: leapDays, start });
      start += leapDays;
    }
  }
  return { year, start: tableStarts[i], end: tableStarts[i + 1], months };
}

// ─── astronomical calendar (outside the table, and as an independent check of it) ───

const SYNODIC = 29.530588861;
const newMoonDayCache = new Map<number, number>();

/** China-time day number of the true new moon of lunation k (k = 0: 2000-01-06). */
function newMoonDay(k: number): number {
  let d = newMoonDayCache.get(k);
  if (d === undefined) {
    d = chinaDayNumber(moonPhaseInstant(k, 0));
    newMoonDayCache.set(k, d);
  }
  return d;
}

/** The lunation whose China day of 初一 is ≤ day < the next one's. */
function lunationOnOrBefore(day: number): number {
  // 2000-01-06 = day 10962; mean new moons are within ~±0.6 day of the true ones.
  let k = Math.floor((day - 10962) / SYNODIC);
  while (newMoonDay(k + 1) <= day) k++;
  while (newMoonDay(k) > day) k--;
  return k;
}

/** Months of the 岁 from 十一月 (holding 冬至 of year−1) up to the next 十一月 (exclusive). */
function suiMonths(year: number): LunarMonthSpan[] {
  const solstice0 = chinaDayNumber(termsOfYear(year - 1)[23].at);
  const solstice1 = chinaDayNumber(termsOfYear(year)[23].at);
  const k0 = lunationOnOrBefore(solstice0);
  const k1 = lunationOnOrBefore(solstice1);
  let leapK = Infinity;
  if (k1 - k0 === 13) {
    // 中气 = terms at multiples of 30° = the odd indices (雨水, 春分, … 冬至, 大寒).
    const zhongqi = [...termsOfYear(year - 1), ...termsOfYear(year)]
      .filter((t) => t.index % 2 === 1)
      .map((t) => chinaDayNumber(t.at));
    for (let k = k0 + 1; k < k1; k++) {
      const a = newMoonDay(k), b = newMoonDay(k + 1);
      if (!zhongqi.some((z) => z >= a && z < b)) { leapK = k; break; }
    }
  }
  const out: LunarMonthSpan[] = [];
  let month = 10;
  for (let k = k0; k < k1; k++) {
    const leap = k === leapK;
    if (!leap) month = (month % 12) + 1;
    const start = newMoonDay(k);
    out.push({ month, leap, days: newMoonDay(k + 1) - start, start });
  }
  return out;
}

/** Lunar year computed from ephemerides (modern rules), for any year. */
function astronomicalYear(year: number): LunarYearSpan {
  const a = suiMonths(year);
  const b = suiMonths(year + 1);
  const firstA = a.findIndex((m) => m.month === 1 && !m.leap);
  const firstB = b.findIndex((m) => m.month === 1 && !m.leap);
  const months = [...a.slice(firstA), ...b.slice(0, firstB)];
  const start = months[0].start;
  const last = months[months.length - 1];
  return { year, start, end: last.start + last.days, months };
}

function yearSpan(year: number): LunarYearSpan {
  let y = yearCache.get(year);
  if (!y) {
    y = year >= TABLE_FIRST && year <= TABLE_LAST ? tableYear(year) : astronomicalYear(year);
    yearCache.set(year, y);
  }
  return y;
}

export interface LunarMonthInfo {
  month: number;
  leap: boolean;
  /** 29 or 30. */
  days: number;
  /** 初一 of this month (local midnight). */
  firstDay: Date;
  /** 正月, 闰四月 … */
  name: string;
}

const dateOfDayNumber = (n: number) => {
  const u = new Date(n * DAY_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
};

/** The months of lunar year `year` in order (12 or 13, leap month after its namesake). */
export function lunarMonths(year: number): LunarMonthInfo[] {
  return yearSpan(year).months.map((m) => ({
    month: m.month,
    leap: m.leap,
    days: m.days,
    firstDay: dateOfDayNumber(m.start),
    name: lunarMonthName(m.month, m.leap),
  }));
}

/** The leap month of lunar year `year` (1..12), or 0 if it has none. */
export function leapMonthOf(year: number): number {
  return yearSpan(year).months.find((m) => m.leap)?.month ?? 0;
}

/**
 * The months of lunar year `year` computed purely from the ephemeris with the modern rules,
 * ignoring the 1900–2100 table. Exposed for verification (it reproduces the table from 1929 on).
 */
export function astronomicalLunarMonths(year: number): LunarMonthInfo[] {
  return astronomicalYear(year).months.map((m) => ({
    month: m.month,
    leap: m.leap,
    days: m.days,
    firstDay: dateOfDayNumber(m.start),
    name: lunarMonthName(m.month, m.leap),
  }));
}

// ───────────────────────────── conversions ─────────────────────────────

function lunarFromDayNumber(n: number, gregorianYear: number): LunarDate {
  let span = yearSpan(gregorianYear);
  if (n < span.start) span = yearSpan(gregorianYear - 1);
  let m = span.months[0];
  for (const mm of span.months) {
    if (mm.start > n) break;
    m = mm;
  }
  const day = n - m.start + 1;
  const year = span.year;
  return {
    year,
    month: m.month,
    day,
    leap: m.leap,
    monthDays: m.days,
    yearGanZhi: ganZhiOfYear(year),
    zodiac: ZODIAC[mod(year - 4, 12)],
    zodiacEn: ZODIAC_EN[mod(year - 4, 12)],
    monthName: lunarMonthName(m.month, m.leap),
    dayName: lunarDayName(day),
  };
}

/** Convert a Gregorian calendar date (only its local Y/M/D fields are read) to the lunar date. */
export function toLunar(d: Date): LunarDate {
  return lunarFromDayNumber(localDayNumber(d), d.getFullYear());
}

/** Gregorian date (local midnight) for a lunar date, or null if it does not exist. */
export function fromLunar(year: number, month: number, day: number, leap = false): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 30) return null;
  const m = yearSpan(year).months.find((mm) => mm.month === month && mm.leap === leap);
  if (!m || day > m.days) return null;
  return dateOfDayNumber(m.start + day - 1);
}

// ───────────────────────────── festivals ─────────────────────────────

export interface Festival {
  zh: string;
  en: string;
  /** 'lunar' = on the lunar calendar (春节, 中秋…), 'term' = tied to a solar term (清明, 冬至), 'solar' = Gregorian (元旦). */
  kind: 'lunar' | 'term' | 'solar';
}

const NEW_YEAR: Festival = { zh: '元旦', en: "New Year's Day", kind: 'solar' };
const LUNAR_FESTIVALS: Record<number, Festival> = {
  101: { zh: '春节', en: 'Spring Festival', kind: 'lunar' },
  115: { zh: '元宵', en: 'Lantern Festival', kind: 'lunar' },
  202: { zh: '龙抬头', en: 'Dragon Raises Its Head', kind: 'lunar' },
  303: { zh: '上巳', en: 'Double Third Festival', kind: 'lunar' },
  505: { zh: '端午', en: 'Dragon Boat Festival', kind: 'lunar' },
  707: { zh: '七夕', en: 'Double Seventh Festival', kind: 'lunar' },
  715: { zh: '中元', en: 'Ghost Festival', kind: 'lunar' },
  815: { zh: '中秋', en: 'Mid-Autumn Festival', kind: 'lunar' },
  909: { zh: '重阳', en: 'Double Ninth Festival', kind: 'lunar' },
  1001: { zh: '寒衣', en: 'Winter Clothing Day', kind: 'lunar' },
  1015: { zh: '下元', en: 'Xiayuan Festival', kind: 'lunar' },
  1208: { zh: '腊八', en: 'Laba Festival', kind: 'lunar' },
  1223: { zh: '小年', en: 'Little New Year', kind: 'lunar' },
};
const NEW_YEARS_EVE: Festival = { zh: '除夕', en: "Lunar New Year's Eve", kind: 'lunar' };
const TERM_FESTIVALS: Record<number, Festival> = {
  4: { zh: '清明', en: 'Qingming Festival', kind: 'term' },
  21: { zh: '冬至', en: 'Winter Solstice', kind: 'term' },
};

/** Traditional festivals falling on this Gregorian date (its local Y/M/D). */
export function festivalsOn(d: Date): Festival[] {
  const out: Festival[] = [];
  if (d.getMonth() === 0 && d.getDate() === 1) out.push(NEW_YEAR);
  const n = localDayNumber(d);
  const l = lunarFromDayNumber(n, d.getFullYear());
  if (!l.leap) {
    const f = LUNAR_FESTIVALS[l.month * 100 + l.day];
    if (f) out.push(f);
  }
  // 除夕 is the last day of the lunar year — 腊月廿九 when 腊月 is a short month.
  if (n + 1 === yearSpan(l.year).end) out.push(NEW_YEARS_EVE);
  const term = termOnDay(d);
  if (term && TERM_FESTIVALS[term.index]) out.push(TERM_FESTIVALS[term.index]);
  return out;
}
