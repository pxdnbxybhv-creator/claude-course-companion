// 一炷香 — pure timer logic for the focus view. No DOM, no clocks: every function takes `now`.
//
// A session is described by timestamps, never by counting ticks, so a throttled background tab,
// a sleeping laptop or a reloaded page all agree on how much incense is left:
//
//   elapsed = (pausedAt ?? now) − start − pausedMs        (clamped to 0 … duration)
//
// The active session is persisted as JSON under ACTIVE_KEY; `decideRestore` says what to do with
// whatever is found there when the app starts.
import type { FocusSession } from '../../core/types';

export const ACTIVE_KEY = 'banmu.focus.active';
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;
/** A pause left untouched for this long is treated as an abandoned stick. */
export const STALE_PAUSE_MS = 12 * 3600_000;
export const INTENT_MAX = 80;

export interface ActiveFocus {
  /** Epoch ms when the incense was lit. */
  start: number;
  /** Planned length in minutes (1…180). */
  minutes: number;
  intent?: string;
  /** Total ms spent in pauses that have ended. */
  pausedMs: number;
  /** Epoch ms when the current pause began; null while burning. */
  pausedAt: number | null;
}

export const clampMinutes = (m: number): number =>
  Number.isFinite(m) ? Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(m))) : 30;

export function cleanIntent(s: string | undefined | null): string | undefined {
  const v = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, INTENT_MAX);
  return v || undefined;
}

export function light(minutes: number, intent: string | undefined, now: number): ActiveFocus {
  const i = cleanIntent(intent);
  return { start: now, minutes: clampMinutes(minutes), ...(i ? { intent: i } : {}), pausedMs: 0, pausedAt: null };
}

export const durationMs = (s: Pick<ActiveFocus, 'minutes'>): number => s.minutes * 60_000;
export const isPaused = (s: ActiveFocus): boolean => s.pausedAt !== null;

export function elapsedMs(s: ActiveFocus, now: number): number {
  const until = s.pausedAt ?? now;
  const e = until - s.start - s.pausedMs;
  return Math.min(durationMs(s), Math.max(0, e));
}

export const remainingMs = (s: ActiveFocus, now: number): number => durationMs(s) - elapsedMs(s, now);
export const progress = (s: ActiveFocus, now: number): number => elapsedMs(s, now) / durationMs(s);
export const isFinished = (s: ActiveFocus, now: number): boolean => remainingMs(s, now) <= 0;

/** Epoch ms at which a burning stick burns out (null while paused). */
export function finishAt(s: ActiveFocus): number | null {
  return s.pausedAt === null ? s.start + s.pausedMs + durationMs(s) : null;
}

export function pause(s: ActiveFocus, now: number): ActiveFocus {
  if (s.pausedAt !== null) return s;
  // Pausing after the end would hide the fact that it already finished; freeze at the end instead.
  const end = finishAt(s)!;
  return { ...s, pausedAt: Math.max(s.start, Math.min(now, end)) };
}

export function resume(s: ActiveFocus, now: number): ActiveFocus {
  if (s.pausedAt === null) return s;
  // A clock that jumped backwards never yields negative pause time.
  return { ...s, pausedMs: s.pausedMs + Math.max(0, now - s.pausedAt), pausedAt: null };
}

/** Minutes actually burned (pauses excluded), to one decimal. */
export const burnedMinutes = (s: ActiveFocus, now: number): number => Math.round(elapsedMs(s, now) / 6_000) / 10;

/** The log entry. A stick put out early records how long it really burned (`now` required then). */
export function toSession(s: ActiveFocus, completed: boolean, now?: number): FocusSession {
  return {
    start: s.start,
    minutes: s.minutes,
    completed,
    ...(s.intent ? { intent: s.intent } : {}),
    ...(!completed && now !== undefined ? { burned: burnedMinutes(s, now) } : {}),
  };
}

export const serialize = (s: ActiveFocus): string => JSON.stringify(s);

/** Parse & validate a stored session. Anything malformed is null — never throws. */
export function parseActive(raw: string | null | undefined): ActiveFocus | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const start = r.start, minutes = r.minutes, pausedMs = r.pausedMs ?? 0, pausedAt = r.pausedAt ?? null;
  if (typeof start !== 'number' || !Number.isFinite(start) || start <= 0) return null;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) return null;
  if (typeof pausedMs !== 'number' || !Number.isFinite(pausedMs) || pausedMs < 0) return null;
  if (pausedAt !== null && (typeof pausedAt !== 'number' || !Number.isFinite(pausedAt))) return null;
  const intent = cleanIntent(typeof r.intent === 'string' ? r.intent : undefined);
  return {
    start,
    minutes: Math.round(minutes),
    ...(intent ? { intent } : {}),
    pausedMs,
    pausedAt: pausedAt === null ? null : Math.max(start, pausedAt as number),
  };
}

export type Restore =
  /** Nothing stored (or it was unreadable): start fresh. */
  | { kind: 'none'; clear: boolean }
  /** Still burning (or paused): pick it up where it is. */
  | { kind: 'resume'; session: ActiveFocus }
  /** It burned out while nobody was watching: log it as completed at `finishedAt`. */
  | { kind: 'finished'; session: ActiveFocus; finishedAt: number }
  /** Paused and forgotten for more than STALE_PAUSE_MS: log it as put out. */
  | { kind: 'stale'; session: ActiveFocus };

export function decideRestore(raw: string | null | undefined, now: number): Restore {
  if (!raw) return { kind: 'none', clear: false };
  const s = parseActive(raw);
  if (!s) return { kind: 'none', clear: true };
  if (s.pausedAt !== null) {
    return now - s.pausedAt > STALE_PAUSE_MS ? { kind: 'stale', session: s } : { kind: 'resume', session: s };
  }
  const end = finishAt(s)!;
  if (now >= end) return { kind: 'finished', session: s, finishedAt: end };
  return { kind: 'resume', session: s };
}

/** ms until the next whole-second change of the displayed (ceil-rounded) remaining time. */
export function msToNextSecond(s: ActiveFocus, now: number): number {
  const r = remainingMs(s, now);
  if (r <= 0) return 0;
  const frac = r % 1000;
  return frac === 0 ? 1000 : frac;
}

// --------------------------------------------------------------------------- formatting

/** Whole seconds shown for a remaining time — rounded up, so 0:00 appears only at the very end. */
export const displaySeconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

/** 18:42, or 1:05:00 for an hour or more. */
export function formatClock(ms: number): string {
  const total = displaySeconds(ms);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 0…999 in Chinese numerals: 18 → 十八, 105 → 一百零五, 180 → 一百八十. */
export function cnInt(n: number): string {
  n = Math.max(0, Math.floor(n));
  if (n < 10) return CN[n];
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 1000) {
    const h = Math.floor(n / 100), rest = n % 100;
    if (!rest) return CN[h] + '百';
    if (rest < 10) return CN[h] + '百零' + CN[rest];
    return CN[h] + '百' + CN[Math.floor(rest / 10)] + '十' + (rest % 10 ? CN[rest % 10] : '');
  }
  return String(n);
}

/** 还剩十八分 — the quiet Chinese reading of the remaining time. */
export function cnRemaining(ms: number): string {
  const sec = displaySeconds(ms);
  if (sec <= 0) return '香已燃尽';
  if (sec < 60) return '将尽';
  return `还剩${cnInt(Math.ceil(sec / 60))}分`;
}

export function enRemaining(ms: number): string {
  const sec = displaySeconds(ms);
  if (sec <= 0) return 'burned out';
  if (sec < 60) return 'almost done';
  const m = Math.ceil(sec / 60);
  return `${m} minute${m === 1 ? '' : 's'} left`;
}
