// 五子棋 rules — pure TS, no DOM. 15×15, free-style: five *or more* in a row wins, black first.
//
// A game is just its move list (cell indices). Everything else — whose turn, the board, the
// winner — is derived from it, which keeps undo, persistence and the worker protocol trivial.

export const N = 15;
export const CELLS = N * N;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export type Color = 1 | 2;

export const idx = (x: number, y: number): number => y * N + x;
export const colOf = (i: number): number => i % N;
export const rowOf = (i: number): number => (i / N) | 0;
export const other = (c: Color): Color => (c === BLACK ? WHITE : BLACK);
/** Colour that plays move number `n` (0-based). */
export const colorOfMove = (n: number): Color => (n % 2 === 0 ? BLACK : WHITE);
export const onBoard = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N;

/** The four line directions: → ↓ ↘ ↗. */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** 天元 + 星位: the nine star points of a 15-line board. */
export const STAR_POINTS: readonly number[] = [3, 7, 11].flatMap((y) => [3, 7, 11].map((x) => idx(x, y)));

export function boardFrom(moves: readonly number[]): Uint8Array {
  const b = new Uint8Array(CELLS);
  moves.forEach((m, i) => (b[m] = colorOfMove(i)));
  return b;
}

/**
 * If the stone at `i` is part of a run of ≥ 5 (overlines count), the cells of the longest such
 * run in order along its line; otherwise null.
 */
export function fiveThrough(board: ArrayLike<number>, i: number): number[] | null {
  const c = board[i];
  if (c !== BLACK && c !== WHITE) return null;
  const x0 = colOf(i), y0 = rowOf(i);
  let best: number[] | null = null;
  for (const [dx, dy] of DIRS) {
    let a = 0;
    while (onBoard(x0 - (a + 1) * dx, y0 - (a + 1) * dy) && board[idx(x0 - (a + 1) * dx, y0 - (a + 1) * dy)] === c) a++;
    let b = 0;
    while (onBoard(x0 + (b + 1) * dx, y0 + (b + 1) * dy) && board[idx(x0 + (b + 1) * dx, y0 + (b + 1) * dy)] === c) b++;
    if (a + b + 1 >= 5 && (!best || a + b + 1 > best.length)) {
      best = [];
      for (let k = -a; k <= b; k++) best.push(idx(x0 + k * dx, y0 + k * dy));
    }
  }
  return best;
}

export interface Outcome {
  /** 0 = game on / draw not yet; BLACK or WHITE when someone made five. */
  winner: 0 | Color;
  /** The winning run (≥ 5 cells), in line order. */
  line: number[] | null;
  /** The board is full with no five. */
  draw: boolean;
}

/** Winner of a move list. Only the last move can have made five (earlier fives end the game). */
export function outcome(moves: readonly number[]): Outcome {
  if (!moves.length) return { winner: 0, line: null, draw: false };
  const b = boardFrom(moves);
  const last = moves[moves.length - 1];
  const line = fiveThrough(b, last);
  if (line) return { winner: b[last] as Color, line, draw: false };
  return { winner: 0, line: null, draw: moves.length >= CELLS };
}

/** A move list is legal when every index is on the board, unused, and no earlier move ended the game. */
export function isLegalGame(moves: readonly unknown[]): moves is number[] {
  const b = new Uint8Array(CELLS);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m >= CELLS || b[m]) return false;
    b[m] = colorOfMove(i);
    if (i < moves.length - 1 && fiveThrough(b, m)) return false;
  }
  return true;
}

/** "H8"-style coordinate: columns A–O left→right, rows 1–15 bottom→top (as printed on the board). */
export function coordName(i: number): string {
  return String.fromCharCode(65 + colOf(i)) + String(N - rowOf(i));
}
