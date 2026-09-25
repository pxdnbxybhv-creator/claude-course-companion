// Persisted totals and preferences for 井字棋 (localStorage, guarded).
import type { Level, Mark } from './logic';

export interface Tally { w: number; d: number; l: number }
export interface TttStats {
  v: 1;
  /** Against the machine, from your side: wins / draws / losses per level. */
  ai: Record<Level, Tally>;
  /** Two players at one table: 〇 wins, ✕ wins, draws. */
  pvp: { o: number; x: number; d: number };
  mode: 'ai' | 'pvp';
  level: Level;
  /** Who moves first: in 人机 'O' = you, 'X' = the machine. */
  first: Mark;
}

const KEY = 'banmu.games.tictactoe';
const LEVELS: Level[] = ['easy', 'medium', 'hard'];
const zero = (): Tally => ({ w: 0, d: 0, l: 0 });

export function defaults(): TttStats {
  return { v: 1, ai: { easy: zero(), medium: zero(), hard: zero() }, pvp: { o: 0, x: 0, d: 0 }, mode: 'ai', level: 'medium', first: 'O' };
}

export function loadStats(): TttStats {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return d;
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    for (const lv of LEVELS) d.ai[lv] = { w: n(raw.ai?.[lv]?.w), d: n(raw.ai?.[lv]?.d), l: n(raw.ai?.[lv]?.l) };
    d.pvp = { o: n(raw.pvp?.o), x: n(raw.pvp?.x), d: n(raw.pvp?.d) };
    if (raw.mode === 'pvp') d.mode = 'pvp';
    if (LEVELS.includes(raw.level)) d.level = raw.level;
    if (raw.first === 'X') d.first = 'X';
    return d;
  } catch {
    return d;
  }
}

export function saveStats(s: TttStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export const LEVEL_NAMES: Record<Level, { zh: string; en: string }> = {
  easy: { zh: '易', en: 'Easy' },
  medium: { zh: '中', en: 'Medium' },
  hard: { zh: '难', en: 'Hard' },
};
