// The homestead's small daily bookkeeping that is not part of the saved home itself: the day the pets'
// affection was last settled, strokes counted today (per pet), the dog's dig, the cook's snack, a
// visitor's gift, and the lines you taught your parrots. Its own localStorage key; everything here
// may be lost (a private window) without harm — it just starts afresh.
import type { DateKey } from '../../../../../core/types';
import { backupExtras } from '../../../../../app/store';

const KEY = 'banmu.homelife.v1';

export interface LifeBook {
  /** The last day the pets' affection was settled (decay counted up to it). */
  marker: DateKey | '';
  /** The day `strokes` counts. */
  day: DateKey | '';
  strokes: Record<string, number>;
  /** Pet uid → the last day it dug up coins. */
  dug: Record<string, DateKey>;
  snack: DateKey | '';
  gift: DateKey | '';
  news: DateKey | '';
  /** Parrot uid → the line you taught it. */
  lines: Record<string, string>;
}

const empty = (): LifeBook => ({ marker: '', day: '', strokes: {}, dug: {}, snack: '', gift: '', news: '', lines: {} });

const isDay = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function sanitize(raw: unknown): LifeBook {
  const b = empty();
  if (!raw || typeof raw !== 'object') return b;
  const r = raw as Partial<LifeBook>;
  if (isDay(r.marker)) b.marker = r.marker;
  if (isDay(r.day)) b.day = r.day;
  if (isDay(r.snack)) b.snack = r.snack;
  if (isDay(r.gift)) b.gift = r.gift;
  if (isDay(r.news)) b.news = r.news;
  if (r.strokes && typeof r.strokes === 'object') for (const [k, v] of Object.entries(r.strokes)) if (typeof v === 'number' && v > 0) b.strokes[k.slice(0, 32)] = Math.min(99, Math.floor(v));
  if (r.dug && typeof r.dug === 'object') for (const [k, v] of Object.entries(r.dug)) if (isDay(v)) b.dug[k.slice(0, 32)] = v;
  if (r.lines && typeof r.lines === 'object') for (const [k, v] of Object.entries(r.lines)) if (typeof v === 'string' && v.trim()) b.lines[k.slice(0, 32)] = v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16);
  return b;
}

let cache: LifeBook | null = null;

export function book(): LifeBook {
  if (cache) return cache;
  try {
    const t = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    cache = t ? sanitize(JSON.parse(t)) : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

export function saveBook(fn: (b: LifeBook) => void): void {
  const b = book();
  fn(b);
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* keep it in memory */ }
}

/** Strokes that already counted today for this pet. */
export function strokesToday(uid: string, today: DateKey): number {
  const b = book();
  return b.day === today ? b.strokes[uid] ?? 0 : 0;
}

export function countStroke(uid: string, today: DateKey): void {
  saveBook((b) => {
    if (b.day !== today) { b.day = today; b.strokes = {}; }
    b.strokes[uid] = (b.strokes[uid] ?? 0) + 1;
  });
}

/** Forget what belonged to pets that are gone. */
export function tidyBook(uids: Set<string>): void {
  const b = book();
  const stale = [...Object.keys(b.lines), ...Object.keys(b.dug)].some((k) => !uids.has(k));
  if (!stale) return;
  saveBook((x) => {
    for (const k of Object.keys(x.lines)) if (!uids.has(k)) delete x.lines[k];
    for (const k of Object.keys(x.dug)) if (!uids.has(k)) delete x.dug[k];
  });
}

// It rides along in backups (the day affection was last settled, today's small doings), so a
// restored backup does not charge the pets for the days in between twice.
const extra = {
  key: 'homelife',
  get: () => ({ ...book() }),
  set: (raw: unknown) => {
    cache = sanitize(raw);
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* keep it in memory */ }
  },
};
const at = backupExtras.findIndex((b) => b.key === extra.key);
if (at >= 0) backupExtras[at] = extra; else backupExtras.push(extra);
