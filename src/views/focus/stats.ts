// Pure summaries of the focus log for the "今日 · 本周" panel.
import type { DateKey, FocusSession } from '../../core/types';
import { addDays, toKey } from '../../core/date';

export const dayOf = (f: FocusSession): DateKey => toKey(new Date(f.start));

export function sessionsOn(focus: readonly FocusSession[], day: DateKey): FocusSession[] {
  return focus.filter((f) => dayOf(f) === day).sort((a, b) => a.start - b.start);
}

export interface DaySummary {
  day: DateKey;
  sessions: FocusSession[];
  /** Burned sticks. */
  count: number;
  /** Minutes of incense burned — whole sticks plus the part of any put out early (rounded). */
  minutes: number;
}

/** Minutes a session really burned: all of it if completed, else what was recorded (0 if unknown). */
export const burnedOf = (f: FocusSession): number =>
  f.completed ? f.minutes : Math.max(0, Math.min(f.minutes, Number.isFinite(f.burned) ? f.burned! : 0));

export function summarize(day: DateKey, sessions: FocusSession[]): DaySummary {
  const count = sessions.filter((s) => s.completed).length;
  // Whole minutes for display; the fractions of sticks put out early add up first.
  const minutes = Math.round(sessions.reduce((a, s) => a + burnedOf(s), 0));
  return { day, sessions, count, minutes };
}

/** The last `n` local days ending today, oldest first. */
export function recentDays(focus: readonly FocusSession[], today: DateKey, n = 7): DaySummary[] {
  const first = addDays(today, -(n - 1));
  const byDay = new Map<DateKey, FocusSession[]>();
  for (const f of focus) {
    const d = dayOf(f);
    if (d < first || d > today) continue;
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(f);
  }
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(first, i);
    return summarize(day, (byDay.get(day) ?? []).sort((a, b) => a.start - b.start));
  });
}

/** 90 → "1 小时 30 分" / "1 h 30 min". */
export function formatMinutes(m: number, zh: boolean): string {
  m = Math.round(m);
  const h = Math.floor(m / 60), r = m % 60;
  if (zh) return h ? `${h} 小时${r ? ` ${r} 分` : ''}` : `${m} 分钟`;
  return h ? `${h} h${r ? ` ${r} min` : ''}` : `${m} min`;
}

export function clockOf(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
