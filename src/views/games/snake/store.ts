// Small persisted stats for 贪吃蛇 (localStorage, guarded — storage may be unavailable).
export type SnakeMode = 'walls' | 'wrap';

export interface SnakeStats {
  v: 1;
  best: Record<SnakeMode, number>;
  games: number;
  mode: SnakeMode;
}

const KEY = 'banmu.games.snake';

export function loadStats(): SnakeStats {
  const d: SnakeStats = { v: 1, best: { walls: 0, wrap: 0 }, games: 0, mode: 'walls' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return d;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    return {
      v: 1,
      best: { walls: num(raw.best?.walls), wrap: num(raw.best?.wrap) },
      games: num(raw.games),
      mode: raw.mode === 'wrap' ? 'wrap' : 'walls',
    };
  } catch {
    return d;
  }
}

export function saveStats(s: SnakeStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — stats just won't persist */
  }
}
