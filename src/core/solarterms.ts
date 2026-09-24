// The 24 solar terms (二十四节气), computed astronomically. STUB — contract only.
// Index 0 = 立春 (sun at 315°), then every 15° of solar longitude: 1 雨水, 2 惊蛰, 3 春分 … 23 大寒.

export interface TermInstant {
  /** 0..23, 0 = 立春. */
  index: number;
  /** Exact instant the sun reaches the term's longitude. */
  at: Date;
}

/** All 24 term instants whose instant falls in Gregorian `year` (UTC+8), sorted by time. */
export function termsOfYear(year: number): TermInstant[] {
  void year;
  return [];
}

export interface TermContext {
  /** The term we are in now (most recent term instant ≤ date). */
  current: TermInstant;
  /** The next term instant after date. */
  next: TermInstant;
  /** 0, 1, 2 — which of the term's three pentads (候, ~5 days each) we are in. */
  pentad: 0 | 1 | 2;
  /** Whole days until `next` (China calendar days, UTC+8). */
  daysToNext: number;
}

export function termContext(date: Date): TermContext {
  const now = { index: 15, at: date };
  return { current: now, next: { index: 16, at: date }, pentad: 0, daysToNext: 0 };
}

/** The term that begins on this calendar day (in China time, UTC+8), if any. */
export function termOnDay(d: Date): TermInstant | null {
  void d;
  return null;
}

export function seasonOfTerm(index: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  return (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(((index % 24) + 24) % 24 / 6)];
}
