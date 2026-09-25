// Small persistent state for 五子棋: per-level results, last choices, and the game in progress.
// localStorage 'banmu.games.gomoku'; every access guarded (private windows, sandboxed iframes).
import { BLACK, WHITE, isLegalGame, type Color } from './engine';
import type { Level } from './ai';

export type Mode = 'ai' | 'duo';
export interface Record_ { w: number; l: number }
export interface Saved {
  v: 1;
  stats: Record<Level, Record_>;
  prefs: { mode: Mode; level: Level; human: Color };
  game: { moves: number[]; mode: Mode; level: Level; human: Color; recorded: boolean } | null;
}

const KEY = 'banmu.games.gomoku';
export const LEVEL_IDS: Level[] = ['beginner', 'club', 'master'];

const fresh = (): Saved => ({
  v: 1,
  stats: { beginner: { w: 0, l: 0 }, club: { w: 0, l: 0 }, master: { w: 0, l: 0 } },
  prefs: { mode: 'ai', level: 'club', human: BLACK },
  game: null,
});

const isLevel = (v: unknown): v is Level => v === 'beginner' || v === 'club' || v === 'master';
const isMode = (v: unknown): v is Mode => v === 'ai' || v === 'duo';
const isColor = (v: unknown): v is Color => v === BLACK || v === WHITE;
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function loadSaved(): Saved {
  const s = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!raw || typeof raw !== 'object') return s;
    for (const l of LEVEL_IDS) {
      const r = raw.stats?.[l];
      if (r) s.stats[l] = { w: count(r.w), l: count(r.l) };
    }
    const p = raw.prefs;
    if (p) {
      if (isMode(p.mode)) s.prefs.mode = p.mode;
      if (isLevel(p.level)) s.prefs.level = p.level;
      if (isColor(p.human)) s.prefs.human = p.human;
    }
    const g = raw.game;
    if (g && Array.isArray(g.moves) && isLegalGame(g.moves) && isMode(g.mode) && isLevel(g.level) && isColor(g.human)) {
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

/** "国手 3胜2负" / "Master 3–2" for the level with the most recent play (or the chosen one). */
export function statText(s: Saved, lang: 'zh' | 'en', level: Level = s.prefs.level): string | null {
  const r = s.stats[level];
  if (!r.w && !r.l) {
    const any = LEVEL_IDS.find((l) => s.stats[l].w || s.stats[l].l);
    if (!any) return null;
    return statText(s, lang, any);
  }
  const [zh, en] = LEVEL_NAMES[level];
  return lang === 'zh' ? `${zh} ${r.w}胜${r.l}负` : `${en} ${r.w}–${r.l}`;
}
