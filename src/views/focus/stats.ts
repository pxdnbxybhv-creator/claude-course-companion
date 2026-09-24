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
  /** Minutes of incense that burned to the end. */
  minutes: number;
}

export function summarize(day: DateKey, sessions: FocusSession[]): DaySummary {
  const done = sessions.filter((s) => s.completed);
  return { day, sessions, count: done.length, minutes: done.reduce((a, s) => a + s.minutes, 0) };
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
  const h = Math.floor(m / 60), r = m % 60;
  if (zh) return h ? `${h} 小时${r ? ` ${r} 分` : ''}` : `${m} 分钟`;
  return h ? `${h} h${r ? ` ${r} min` : ''}` : `${m} min`;
}

export function clockOf(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
