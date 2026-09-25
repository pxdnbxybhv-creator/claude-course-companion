// Small persisted stats for 飞花令 (localStorage 'banmu.games.feihua', guarded).
import { LING } from './logic';

const KEY = 'banmu.games.feihua';

export interface FeihuaStats {
  v: 1;
  /** Longest chain of your own lines in one game. */
  best: number;
  games: number;
  /** The relaxed 30-second clock. */
  timer: boolean;
  lastLing: string;
}

export function loadStats(): FeihuaStats {
  const d: FeihuaStats = { v: 1, best: 0, games: 0, timer: false, lastLing: '花' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return d;
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    return {
      v: 1,
      best: n(raw.best),
      games: n(raw.games),
      timer: raw.timer === true,
      lastLing: LING.some((l) => l.ch === raw.lastLing) ? raw.lastLing : '花',
    };
  } catch {
    return d;
  }
}

export function saveStats(s: FeihuaStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
