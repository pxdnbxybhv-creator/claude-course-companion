// Small persisted state for 七巧板 (localStorage 'banmu.games.tangram', guarded): which figures you
// have made by yourself, which you peeked at, the figure on the table and where the pieces lie.
import { FIGURE, FIGURES } from './figures';
import { SET, type Placed } from './geometry';

const KEY = 'banmu.games.tangram';

export interface TangramSaved {
  v: 1;
  fig: string;
  /** Figure ids solved without looking at the answer. */
  solved: string[];
  /** Pieces on the table for `fig` (null = in the tray). */
  table: Placed[] | null;
}

export function loadSaved(): TangramSaved {
  const d: TangramSaved = { v: 1, fig: FIGURES[0].id, solved: [], table: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return d;
    if (typeof raw.fig === 'string' && FIGURE[raw.fig]) d.fig = raw.fig;
    if (Array.isArray(raw.solved)) d.solved = [...new Set(raw.solved.filter((x: unknown) => typeof x === 'string' && FIGURE[x as string]))] as string[];
    if (Array.isArray(raw.table) && raw.table.length === SET.length) {
      const ok = raw.table.every((p: Placed, i: number) => p && p.kind === SET[i] && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isInteger(p.rot) && typeof p.flip === 'boolean');
      if (ok) d.table = raw.table.map((p: Placed) => ({ kind: p.kind, x: p.x, y: p.y, rot: ((p.rot % 8) + 8) % 8, flip: p.flip }));
    }
    return d;
  } catch {
    return d;
  }
}

export function writeSaved(s: TangramSaved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
