// Small persistent state for 象棋: per-level results, last choices, and the game in progress.
// localStorage 'banmu.games.xiangqi'; every access guarded (private windows, sandboxed iframes).
import { RED, BLACK, replay, type Side } from './engine';
import type { Level } from './ai';

export type Mode = 'ai' | 'duo';
export interface Tally { w: number; l: number; d: number }
export interface Saved {
  v: 1;
  stats: Record<Level, Tally>;
  prefs: { mode: Mode; level: Level; human: Side };
  game: { moves: number[]; mode: Mode; level: Level; human: Side; recorded: boolean } | null;
}

const KEY = 'banmu.games.xiangqi';
export const LEVEL_IDS: Level[] = ['beginner', 'club', 'master'];

export const fresh = (): Saved => ({
  v: 1,
  stats: { beginner: { w: 0, l: 0, d: 0 }, club: { w: 0, l: 0, d: 0 }, master: { w: 0, l: 0, d: 0 } },
  prefs: { mode: 'ai', level: 'club', human: RED },
  game: null,
});

const isLevel = (v: unknown): v is Level => v === 'beginner' || v === 'club' || v === 'master';
const isMode = (v: unknown): v is Mode => v === 'ai' || v === 'duo';
const isSide = (v: unknown): v is Side => v === RED || v === BLACK;
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function loadSaved(): Saved {
  const s = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!raw || typeof raw !== 'object') return s;
    for (const l of LEVEL_IDS) {
      const r = raw.stats?.[l];
      if (r) s.stats[l] = { w: count(r.w), l: count(r.l), d: count(r.d) };
    }
    const p = raw.prefs;
    if (p) {
      if (isMode(p.mode)) s.prefs.mode = p.mode;
      if (isLevel(p.level)) s.prefs.level = p.level;
      if (isSide(p.human)) s.prefs.human = p.human;
    }
    const g = raw.game;
    if (g && Array.isArray(g.moves) && g.moves.length <= 1000 && isMode(g.mode) && isLevel(g.level) && isSide(g.human) && replay(g.moves)) {
      s.game = { moves: g.moves.slice(), mode: g.mode, level: g.level, human: g.human, recorded: !!g.recorded };
    }
  } catch {
    /* unreadable: start clean */
  }
  return s;
}

export function writeSaved(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the game still works, it just won't remember */
  }
}

export const LEVEL_NAMES: Record<Level, [string, string]> = {
  beginner: ['初学', 'Beginner'],
  club: ['棋友', 'Club'],
  master: ['国手', 'Master'],
};

/** "国手 3胜2负1和" / "Master 3–2–1" for the chosen level (or any level that has been played). */
export function statText(s: Saved, lang: 'zh' | 'en', level: Level = s.prefs.level): string | null {
  const r = s.stats[level];
  if (!r.w && !r.l && !r.d) {
    const any = LEVEL_IDS.find((l) => s.stats[l].w || s.stats[l].l || s.stats[l].d);
    if (!any) return null;
    return statText(s, lang, any);
  }
  const [zh, en] = LEVEL_NAMES[level];
  if (lang === 'zh') return `${zh} ${r.w}胜${r.l}负${r.d ? r.d + '和' : ''}`;
  return `${en} ${r.w}–${r.l}${r.d ? '–' + r.d : ''}`;
}
