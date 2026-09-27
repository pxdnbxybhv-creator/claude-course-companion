// 水月幻镜 · per-viewer conveniences in localStorage (API.md §1: the UI may keep these, guarded):
// the day this device last played the paused run (「镜中人已候 N 日」, keyed by the run's seed), the
// codex tab last open, and 减少动态 (this device's reduced-motion switch, ORed with the OS setting).
// Never state that must persist: every read and write is in a try, and the screens work without it.
import { signal } from '@preact/signals';
import type { DateKey } from '../types';

const KEY = 'banmu.mirror.ui';
interface Prefs { played?: DateKey; seed?: number; codex?: string; calm?: boolean }

function read(): Prefs {
  try {
    const t = localStorage.getItem(KEY);
    const v = t ? JSON.parse(t) : null;
    return v && typeof v === 'object' ? (v as Prefs) : {};
  } catch {
    return {};
  }
}
function write(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
const isDay = (d: unknown): d is DateKey => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** A wave of the run with this seed started or ended today, on this device. */
export function rememberPlayed(day: DateKey, seed: number): void {
  const p = read();
  if (p.played !== day || p.seed !== seed) write({ ...p, played: day, seed });
}
/** The day this device last played the run with this seed (null for another run, or none kept). */
export function lastPlayed(seed: number): DateKey | null {
  const p = read();
  return isDay(p.played) && p.seed === seed ? p.played : null;
}
export function rememberCodexTab(tab: string): void { write({ ...read(), codex: tab }); }
export const codexTab = (): string | null => (typeof read().codex === 'string' ? read().codex! : null);

/** 减少动态, this device's own switch (the OS setting counts as well: see calmNow). */
export const calmPref = signal<boolean>(read().calm === true);
export function setCalm(on: boolean): void {
  calmPref.value = on;
  write({ ...read(), calm: on });
}
/** Reduced motion from the OS. */
export function osReduced(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
/** Reduced motion, from either the OS or 减少动态. */
export const calmNow = (): boolean => calmPref.value || osReduced();
