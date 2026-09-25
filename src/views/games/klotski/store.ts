// Small persisted state for 华容道 (localStorage 'banmu.games.klotski', guarded): best move counts
// per layout, how many escapes in all, and the game on the board (so a reload resumes it).
import { LAYOUT, LAYOUTS, parseLayout, type Piece } from './logic';

const KEY = 'banmu.games.klotski';

export interface KlotskiSaved {
  v: 1;
  layout: string;
  /** Fewest moves you've escaped in, per layout id. */
  best: Record<string, number>;
  /** Total escapes. */
  wins: number;
  /** The game in progress: positions per piece id ("x,y"), move count, and history for undo. */
  cur: { layout: string; pos: string; moves: number; hist: { pos: string; moves: number }[] } | null;
}

export function defaults(): KlotskiSaved {
  return { v: 1, layout: 'hengdao', best: {}, wins: 0, cur: null };
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

export function loadSaved(): KlotskiSaved {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return d;
    if (typeof raw.layout === 'string' && LAYOUT[raw.layout]) d.layout = raw.layout;
    if (raw.best && typeof raw.best === 'object') for (const l of LAYOUTS) if (num(raw.best[l.id]) >= l.optimal) d.best[l.id] = num(raw.best[l.id]); // (a best under the optimum is from an older board)
    d.wins = num(raw.wins);
    const c = raw.cur;
    if (c && typeof c === 'object' && LAYOUT[c.layout] && typeof c.pos === 'string' && decode(c.layout, c.pos)) {
      const hist = Array.isArray(c.hist) ? c.hist.filter((h: { pos?: unknown }) => typeof h?.pos === 'string' && decode(c.layout, h.pos as string)).slice(-400) : [];
      d.cur = { layout: c.layout, pos: c.pos, moves: num(c.moves), hist: hist.map((h: { pos: string; moves: unknown }) => ({ pos: h.pos, moves: num(h.moves) })) };
    }
    return d;
  } catch {
    return d;
  }
}

export function writeSaved(s: KlotskiSaved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Compact positions: two digits per piece, in layout order. */
export function encode(pieces: readonly Piece[]): string {
  return pieces.map((p) => `${p.x}${p.y}`).join('');
}

/** Pieces of a layout at encoded positions, or null if the code doesn't fit the layout. */
export function decode(layout: string, pos: string): Piece[] | null {
  const l = LAYOUT[layout];
  if (!l) return null;
  const base = parseLayout(l.map);
  if (pos.length !== base.length * 2 || !/^\d+$/.test(pos)) return null;
  const out = base.map((p, i) => ({ ...p, x: +pos[i * 2], y: +pos[i * 2 + 1] }));
  // must not overlap or leave the board
  const seen = new Set<number>();
  for (const p of out) {
    if (p.x + p.w > 4 || p.y + p.h > 5) return null;
    for (let dy = 0; dy < p.h; dy++)
      for (let dx = 0; dx < p.w; dx++) {
        const k = (p.y + dy) * 4 + p.x + dx;
        if (seen.has(k)) return null;
        seen.add(k);
      }
  }
  return out;
}
