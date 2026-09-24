// Local-calendar date helpers. A DateKey is always the user's *local* day.
import type { DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a DateKey as local midnight. */
export function fromKey(k: DateKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

/** Add whole days to a key (DST-safe: works on calendar fields, not milliseconds). */
export function addDays(k: DateKey, n: number): DateKey {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const da = fromKey(a), db = fromKey(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function weekday(k: DateKey): number {
  return fromKey(k).getDay();
}

export function isValidKey(k: unknown): k is DateKey {
  if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  return toKey(fromKey(k)) === k;
}

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 2026 → 二〇二六 */
export function cnYearDigits(y: number): string {
  return String(y).split('').map((c) => CN_DIGITS[Number(c)]).join('');
}

/** 1..31 → 一 … 三十一 (for 月/日 in Gregorian dates). */
export function cnNumber(n: number): string {
  if (n <= 10) return n === 10 ? '十' : CN_DIGITS[n];
  if (n < 20) return '十' + CN_DIGITS[n - 10];
  const t = Math.floor(n / 10), o = n % 10;
  return CN_DIGITS[t] + '十' + (o ? CN_DIGITS[o] : '');
}
