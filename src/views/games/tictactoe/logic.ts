// 井字棋 · Tic-tac-toe — pure rules and the machine opponent (no DOM).
//
// Cells are numbered 0..8 in reading order (0 = top-left). 〇 is 'O', ✕ is 'X'.
// Levels: easy 易 — takes a win when it sees one, otherwise plays at random;
//         medium 中 — wins, else blocks, else random;
//         hard 难 — perfect play (minimax), never loses.

export type Mark = 'O' | 'X';
export type Cell = Mark | null;
export type Board = Cell[];
export type Level = 'easy' | 'medium' | 'hard';

export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const other = (m: Mark): Mark => (m === 'O' ? 'X' : 'O');
export const emptyBoard = (): Board => Array<Cell>(9).fill(null);

export function winner(b: Board): { mark: Mark; line: readonly [number, number, number] } | null {
  for (const l of LINES) {
    const m = b[l[0]];
    if (m && m === b[l[1]] && m === b[l[2]]) return { mark: m, line: l };
  }
  return null;
}

export const emptyCells = (b: Board): number[] => b.flatMap((c, i) => (c ? [] : [i]));

/** 'O' | 'X' when someone has three, 'draw' when full, null while in play. */
export function outcome(b: Board): Mark | 'draw' | null {
  const w = winner(b);
  if (w) return w.mark;
  return b.every((c) => c) ? 'draw' : null;
}

/** Whose move it is, given who started. */
export function toMove(b: Board, first: Mark): Mark {
  const n = b.filter((c) => c).length;
  return n % 2 === 0 ? first : other(first);
}

export function play(b: Board, i: number, m: Mark): Board {
  if (i < 0 || i > 8 || b[i] || outcome(b)) return b;
  const n = b.slice();
  n[i] = m;
  return n;
}

/** Cells where `m` completes a line right now. */
export function winningMoves(b: Board, m: Mark): number[] {
  return emptyCells(b).filter((i) => {
    b[i] = m;
    const w = winner(b);
    b[i] = null;
    return !!w;
  });
}

// ── minimax ──────────────────────────────────────────────────────────────────

const memo = new Map<string, number>();

/**
 * Value of the position for `me` with `turn` to move: +(10 − depth) for a win (sooner is better),
 * −(10 − depth) for a loss (later is better), 0 for a draw.
 */
export function minimax(b: Board, turn: Mark, me: Mark, depth = 0): number {
  const o = outcome(b);
  if (o === 'draw') return 0;
  if (o) return o === me ? 10 - depth : depth - 10;
  const key = b.map((c) => c ?? '.').join('') + turn + me + depth;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = turn === me ? -Infinity : Infinity;
  for (const i of emptyCells(b)) {
    b[i] = turn;
    const v = minimax(b, other(turn), me, depth + 1);
    b[i] = null;
    best = turn === me ? Math.max(best, v) : Math.min(best, v);
  }
  memo.set(key, best);
  return best;
}

/** Every move of equal, best minimax value for `me` (to move). */
export function bestMoves(b: Board, me: Mark): number[] {
  const work = b.slice();
  let best = -Infinity;
  let out: number[] = [];
  for (const i of emptyCells(work)) {
    work[i] = me;
    const v = minimax(work, other(me), me, 1);
    work[i] = null;
    if (v > best) {
      best = v;
      out = [i];
    } else if (v === best) out.push(i);
  }
  return out;
}

const pick = (xs: number[], rnd: () => number) => xs[Math.min(xs.length - 1, Math.floor(rnd() * xs.length))];

/** The machine's move for `me` at a level. `rnd` is a uniform [0,1) source (Math.random in play, seeded in tests). */
export function aiMove(b: Board, me: Mark, level: Level, rnd: () => number = Math.random): number {
  const free = emptyCells(b);
  if (!free.length || outcome(b)) return -1;
  if (level === 'hard') return pick(bestMoves(b, me), rnd);
  const wins = winningMoves(b.slice(), me);
  if (wins.length) return pick(wins, rnd);
  if (level === 'medium') {
    const blocks = winningMoves(b.slice(), other(me));
    if (blocks.length) return pick(blocks, rnd);
  }
  return pick(free, rnd);
}
