// Almanac view model: cached, pure-ish helpers around the lunar / solar-term / astro cores.
import type { DateKey } from '../../core/types';
import { toKey } from '../../core/date';
import { toLunar, festivalsOn, type Festival, type LunarDate } from '../../core/lunar';
import { termOnDay, termsOfYear, type TermInstant } from '../../core/solarterms';

/**
 * The Date we hand to the calendar cores for a local calendar day. Local noon: whichever way a
 * core reads it (local Y/M/D fields, or the instant in China time) it lands on the same day for
 * every timezone from UTC−3 to UTC+14 — which covers the Chinese-speaking world.
 */
export function dayDate(k: DateKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

// --------------------------------------------------------------------------- text helpers

export const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
export const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return n + s;
}

/** "Year of the Horse, 8th month, day 14" */
export function lunarEn(l: LunarDate): string {
  return `Year of the ${l.zodiacEn}, ${l.leap ? 'leap ' : ''}${ordinal(l.month)} month, day ${l.day}`;
}

/** "八月十四" (闰 is already part of monthName). */
export function lunarZh(l: LunarDate): string {
  return l.monthName + l.dayName;
}

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Month/day of an instant as seen in China (UTC+8) — the almanac's clock. */
export function chinaMD(d: Date): { m: number; d: number; hh: string } {
  const c = new Date(d.getTime() + 8 * 3600_000);
  return { m: c.getUTCMonth() + 1, d: c.getUTCDate(), hh: `${String(c.getUTCHours()).padStart(2, '0')}:${String(c.getUTCMinutes()).padStart(2, '0')}` };
}

// --------------------------------------------------------------------------- caches

const yearTerms = new Map<number, TermInstant[]>();
/** Term instants of a Gregorian year, cached. */
export function termsIn(year: number): TermInstant[] {
  let t = yearTerms.get(year);
  if (!t) {
    t = termsOfYear(year);
    yearTerms.set(year, t);
  }
  return t;
}

export interface DayInfo {
  key: DateKey;
  y: number;
  m: number; // 0-based
  d: number;
  weekday: number;
  lunar: LunarDate;
  term: number | null;
  festivals: Festival[];
}

const dayCache = new Map<DateKey, DayInfo>();
export function dayInfo(key: DateKey): DayInfo {
  let info = dayCache.get(key);
  if (!info) {
    const date = dayDate(key);
    const t = termOnDay(date);
    info = {
      key,
      y: date.getFullYear(),
      m: date.getMonth(),
      d: date.getDate(),
      weekday: date.getDay(),
      lunar: toLunar(date),
      term: t ? t.index : null,
      festivals: festivalsOn(date),
    };
    if (dayCache.size > 800) dayCache.clear();
    dayCache.set(key, info);
  }
  return info;
}

/** What a calendar cell whispers under its numeral. */
export interface CellLabel {
  zh: string;
  en: string;
  kind: 'festival' | 'term' | 'month' | 'lunar';
}

export function cellLabel(info: DayInfo, termName: (i: number) => { zh: string; en: string }): CellLabel {
  const lunarFest = info.festivals.find((f) => f.kind === 'lunar');
  if (lunarFest) return { zh: lunarFest.zh, en: lunarFest.en, kind: 'festival' };
  if (info.term !== null) {
    const n = termName(info.term);
    return { zh: n.zh, en: n.en, kind: 'term' };
  }
  const other = info.festivals[0];
  if (other) return { zh: other.zh, en: other.en, kind: 'festival' };
  if (info.lunar.day === 1) return { zh: info.lunar.monthName, en: `${info.lunar.leap ? 'Leap ' : ''}${ordinal(info.lunar.month)} mo.`, kind: 'month' };
  return { zh: info.lunar.dayName, en: String(info.lunar.day), kind: 'lunar' };
}

export interface MonthGrid {
  y: number;
  m: number;
  weekStart: number;
  /** Weeks × 7 cells; `null` for the blanks before the 1st and after the last day. */
  weeks: (DayInfo | null)[][];
  days: DayInfo[];
}

const gridCache = new Map<string, MonthGrid>();
/** A month laid out in weeks. Cached per (month, week start). */
export function monthGrid(y: number, m: number, weekStart: number): MonthGrid {
  const id = `${y}-${m}-${weekStart}`;
  let g = gridCache.get(id);
  if (g) return g;
  const first = new Date(y, m, 1);
  const n = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() - weekStart + 7) % 7;
  const days: DayInfo[] = [];
  for (let d = 1; d <= n; d++) days.push(dayInfo(toKey(new Date(y, m, d))));
  const cells: (DayInfo | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (DayInfo | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  g = { y, m, weekStart, weeks, days };
  if (gridCache.size > 48) gridCache.clear();
  gridCache.set(id, g);
  return g;
}

/** Drop every cache (the cores were hot-reloaded, or the day rolled over). */
export function clearAlmanacCaches(): void {
  yearTerms.clear();
  dayCache.clear();
  gridCache.clear();
}

/** Solar longitude (degrees, 0 = 春分) of an instant, interpolated between term instants. */
export function sunLongitude(now: Date, current: TermInstant, next: TermInstant): number {
  const span = next.at.getTime() - current.at.getTime();
  const f = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - current.at.getTime()) / span)) : 0;
  return (315 + 15 * current.index + 15 * f) % 360;
}

const DAY_MS = 86_400_000;
/** Day number of an instant's China (UTC+8) calendar day. */
export function chinaDay(at: Date): number {
  return Math.floor((at.getTime() + 8 * 3600_000) / DAY_MS);
}
/** Day number of a Date's local calendar day (same scale as chinaDay). */
export function localDay(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/**
 * How far through the current term (0..1) the middle of `day` is, counting in whole China-time
 * days as the almanac (and termContext's pentads) do.
 */
export function termProgress(day: Date, current: TermInstant, next: TermInstant): number {
  const a = chinaDay(current.at), b = chinaDay(next.at);
  return b > a ? Math.min(1, Math.max(0, (localDay(day) - a + 0.5) / (b - a))) : 0;
}

export const SEASON_ZH = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;
export const SEASON_EN = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' } as const;
