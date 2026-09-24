// Pure habit arithmetic: how grown, how fresh, how long the streak.
// Nothing here reads the clock — callers pass `today` so everything is testable.
import type { DateKey, Habit } from './types';
import { addDays, diffDays, weekday } from './date';

/** Research on habit formation puts the average at ~66 days; a plant reaches full bloom around there. */
export const FULL_BLOOM_DAYS = 66;

export function isScheduled(h: Pick<Habit, 'days'>, day: DateKey): boolean {
  return !h.days || h.days.length === 0 || h.days.includes(weekday(day));
}

/** Completions on or before `today`. */
export function countDone(days: readonly DateKey[], today: DateKey): number {
  let n = 0;
  for (const d of days) if (d <= today) n++;
  return n;
}

/**
 * Growth 0..1 from the number of completions. A brand-new habit is a visible sprout (≈0.06);
 * ~7 days → 0.33, ~21 days → 0.65, ~66 days → 0.98.
 */
export function growthFor(completions: number): number {
  return 0.06 + 0.94 * (1 - Math.exp(-completions / 21));
}

/**
 * Freshness 0..1: recency-weighted completion rate over the last 14 scheduled days
 * (today counts only once it is done, so an unfinished morning never looks like neglect).
 * Days before the habit existed are not held against it.
 */
export function freshnessFor(h: Pick<Habit, 'days' | 'createdAt'>, done: ReadonlySet<DateKey>, today: DateKey): number {
  let num = 0, den = 0, w = 1, seen = 0;
  for (let i = 0; i < 60 && seen < 14; i++) {
    const d = addDays(today, -i);
    if (d < h.createdAt) break;
    if (!isScheduled(h, d)) continue;
    if (i === 0 && !done.has(d)) continue;
    den += w;
    if (done.has(d)) num += w;
    w *= 0.86;
    seen++;
  }
  // A young habit with little history leans optimistic.
  if (den === 0) return 1;
  const rate = num / den;
  const confidence = Math.min(1, seen / 5);
  return rate * confidence + 1 * (1 - confidence);
}

/**
 * Current streak in scheduled days. If today is scheduled but not yet done, the streak
 * is still alive and counts through yesterday.
 */
export function streakFor(h: Pick<Habit, 'days'>, done: ReadonlySet<DateKey>, today: DateKey): number {
  let n = 0;
  let d = today;
  if (isScheduled(h, d) && !done.has(d)) d = addDays(d, -1);
  for (let i = 0; i < 3660; i++) {
    if (isScheduled(h, d)) {
      if (!done.has(d)) break;
      n++;
    }
    d = addDays(d, -1);
  }
  return n;
}

/** Longest run of consecutive scheduled completions ever. */
export function bestStreakFor(h: Pick<Habit, 'days'>, days: readonly DateKey[]): number {
  if (days.length === 0) return 0;
  const sorted = [...new Set(days)].sort();
  let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    // Walk from the previous done day to this one; any scheduled day in between breaks the run.
    let broken = false;
    const gap = diffDays(sorted[i - 1], sorted[i]);
    for (let k = 1; k < gap; k++) {
      if (isScheduled(h, addDays(sorted[i - 1], k))) { broken = true; break; }
    }
    run = broken ? 1 : run + 1;
    if (run > best) best = run;
  }
  return best;
}

export interface HabitStats {
  done: number;
  growth: number;
  freshness: number;
  streak: number;
  best: number;
  doneToday: boolean;
  scheduledToday: boolean;
}

export function statsFor(h: Habit, days: readonly DateKey[], today: DateKey): HabitStats {
  const set = new Set(days);
  const done = countDone(days, today);
  return {
    done,
    growth: growthFor(done),
    freshness: freshnessFor(h, set, today),
    streak: streakFor(h, set, today),
    best: bestStreakFor(h, days),
    doneToday: set.has(today),
    scheduledToday: isScheduled(h, today),
  };
}

/** Insert or remove a day keeping the list sorted and unique. */
export function toggleDay(days: readonly DateKey[], day: DateKey): DateKey[] {
  const set = new Set(days);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort();
}
