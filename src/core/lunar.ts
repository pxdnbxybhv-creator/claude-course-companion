// Chinese lunisolar calendar (农历), 1900–2100. STUB — contract only.

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

/** Convert a Gregorian calendar date (only its local Y/M/D fields are read) to the lunar date. */
export function toLunar(d: Date): LunarDate {
  void d;
  return { year: 2026, month: 1, day: 1, leap: false, monthDays: 30, yearGanZhi: '丙午', zodiac: '马', zodiacEn: 'Horse', monthName: '正月', dayName: '初一' };
}

/** Gregorian date (local midnight) for a lunar date, or null if it does not exist. */
export function fromLunar(year: number, month: number, day: number, leap = false): Date | null {
  void year; void month; void day; void leap;
  return null;
}

export interface Festival {
  zh: string;
  en: string;
  /** 'lunar' = on the lunar calendar (春节, 中秋…), 'term' = tied to a solar term (清明, 冬至), 'solar' = Gregorian (元旦). */
  kind: 'lunar' | 'term' | 'solar';
}

/** Traditional festivals falling on this Gregorian date. */
export function festivalsOn(d: Date): Festival[] {
  void d;
  return [];
}
