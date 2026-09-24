// The 24 solar terms (二十四节气), computed astronomically: the instant the Sun's apparent
// geocentric longitude reaches 315° + 15°·index (VSOP87D + nutation + aberration, ΔT-corrected;
// see astro.ts). Accurate to well under a minute for 1900–2100.
// Index 0 = 立春 (sun at 315°), then every 15° of solar longitude: 1 雨水, 2 惊蛰, 3 春分 … 23 大寒.
// Term *days* are China Standard Time (UTC+8) calendar days, as in the traditional almanac.
import { dateFromJde, julianDay, sunApparentLongitude } from './astro';

export interface TermInstant {
  /** 0..23, 0 = 立春. */
  index: number;
  /** Exact instant the sun reaches the term's longitude. */
  at: Date;
}

const DAY_MS = 86_400_000;
const CST_MS = 8 * 3_600_000;

/** Day number (days since 1970-01-01) of an instant's calendar date in China Standard Time. */
export function chinaDayNumber(at: Date): number {
  return Math.floor((at.getTime() + CST_MS) / DAY_MS);
}

/** Day number (days since 1970-01-01) of a Date's *local* calendar Y/M/D. */
export function localDayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Solar longitude (degrees) of term `index`. */
export function termLongitude(index: number): number {
  return (315 + 15 * (((index % 24) + 24) % 24)) % 360;
}

/**
 * The instant at which the Sun's apparent longitude reaches `longitude` (degrees), searching
 * near the Julian Day `jdGuess` (must be within ~±30 days of the answer).
 */
export function solarLongitudeInstant(longitude: number, jdGuess: number): Date {
  let jde = jdGuess;
  for (let i = 0; i < 12; i++) {
    let diff = (longitude - sunApparentLongitude(jde)) % 360;
    if (diff > 180) diff -= 360;
    else if (diff <= -180) diff += 360;
    // Newton step with the Sun's true angular speed (mean 0.98565°/day, ±3.3 % with the anomaly).
    const M = (357.52911 + 0.98560028 * (jde - 2451545)) * (Math.PI / 180);
    const speed = 0.98564736 + 0.033 * Math.cos(M) + 0.0007 * Math.cos(2 * M);
    const step = diff / speed;
    jde += step;
    if (Math.abs(step) < 2e-7) break; // ~0.02 s
  }
  return dateFromJde(jde);
}

// Order within a Gregorian year: 小寒(22) 大寒(23) 立春(0) … 冬至(21).
const YEAR_ORDER = [22, 23, ...Array.from({ length: 22 }, (_, i) => i)];

const yearCache = new Map<number, TermInstant[]>();
const dayIndexCache = new Map<number, Map<number, TermInstant>>();

/**
 * All 24 term instants whose instant falls in Gregorian `year` (UTC+8), sorted by time:
 * 小寒 (index 22), 大寒 (23), 立春 (0) … 冬至 (21). Cached — the array is shared, do not mutate it.
 */
export function termsOfYear(year: number): TermInstant[] {
  const hit = yearCache.get(year);
  if (hit) return hit;
  const jan0 = julianDay(new Date(Date.UTC(year, 0, 1))) - 1;
  const out = YEAR_ORDER.map((index, i) => {
    // 小寒 ≈ Jan 5.6, then one term every ≈ 15.22 days.
    const guess = jan0 + 5.6 + 15.2184 * i;
    return { index, at: solarLongitudeInstant(termLongitude(index), guess) };
  });
  yearCache.set(year, out);
  return out;
}

function termsByDay(year: number): Map<number, TermInstant> {
  let m = dayIndexCache.get(year);
  if (!m) {
    m = new Map(termsOfYear(year).map((t) => [chinaDayNumber(t.at), t]));
    dayIndexCache.set(year, m);
  }
  return m;
}

/** The term instant of `index` in Gregorian year `year` (China time). */
export function termInstant(year: number, index: number): TermInstant {
  return termsOfYear(year).find((t) => t.index === (((index % 24) + 24) % 24))!;
}

export interface TermContext {
  /** The term we are in: the latest term whose China-time day is ≤ the date's day (so a term
   *  holds for the whole of the day on which it begins). */
  current: TermInstant;
  /** The term after `current` (it begins on a later day). */
  next: TermInstant;
  /** 0, 1, 2 — which of the term's three pentads (候, ~5 days each) we are in. */
  pentad: 0 | 1 | 2;
  /** Whole days until `next` (China calendar days, UTC+8). */
  daysToNext: number;
}

/**
 * The solar-term context of `date`'s *day* — the almanac is a calendar of days: a term counts
 * from the start of its China-time (UTC+8) calendar day, and `date` is read by its local Y/M/D
 * (as toLunar and termOnDay do). So on the day of 秋分 `current` is 秋分 all day long, and
 * `daysToNext` ≥ 1. The pentad splits the days from `current`'s day to `next`'s day in thirds
 * by each day's midpoint (a 15-day term → 5 + 5 + 5 days, 16 → 5 + 6 + 5, 14 → 5 + 4 + 5).
 */
export function termContext(date: Date): TermContext {
  const day = localDayNumber(date);
  const y = date.getFullYear();
  const list = [termsOfYear(y - 1)[23], ...termsOfYear(y), termsOfYear(y + 1)[0]];
  let i = list.length - 2;
  while (i > 0 && chinaDayNumber(list[i].at) > day) i--;
  const current = list[i];
  const next = list[i + 1];
  const startDay = chinaDayNumber(current.at);
  const nextDay = chinaDayNumber(next.at);
  // Which third of [current's day, next's day) the middle of this day falls in.
  const pentad = Math.min(2, Math.max(0, Math.floor(((day - startDay + 0.5) * 3) / (nextDay - startDay)))) as 0 | 1 | 2;
  return { current, next, pentad, daysToNext: nextDay - day };
}

/** The term that begins on this calendar day (in China time, UTC+8), if any. */
export function termOnDay(d: Date): TermInstant | null {
  return termsByDay(d.getFullYear()).get(localDayNumber(d)) ?? null;
}

export function seasonOfTerm(index: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  return (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(((index % 24) + 24) % 24 / 6)];
}
