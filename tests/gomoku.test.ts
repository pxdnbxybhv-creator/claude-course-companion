import { describe, it, expect } from 'vitest';
import { outcome, idx, isLegalGame, BLACK, WHITE, coordName, colorOfMove, CELLS } from '../src/views/games/gomoku/engine';
import { think, greedyMove, patternAt, Pos, Thinker, F4, F3, B4, B3, FIVE, type Level } from '../src/views/games/gomoku/ai';
import { makeRng } from '../src/core/rng';

type XY = [number, number];
/** Interleave black and white stones into a move list (black first). */
function game(black: XY[], white: XY[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(black.length, white.length); i++) {
    if (i < black.length) out.push(idx(...black[i]));
    if (i < white.length) out.push(idx(...white[i]));
  }
  return out;
}
const run = (x: number, y: number, dx: number, dy: number, n: number): XY[] => Array.from({ length: n }, (_, k) => [x + k * dx, y + k * dy] as XY);
/** White filler stones far from the action, never forming a line. */
const scatter: XY[] = [[0, 14], [2, 13], [4, 14], [6, 13], [8, 14], [10, 13], [12, 14], [14, 13]];

describe('gomoku rules', () => {
  const cases: [string, XY[]][] = [
    ['horizontal on the top edge', run(0, 0, 1, 0, 5)],
    ['horizontal on the right edge', run(10, 5, 1, 0, 5)],
    ['vertical on the left edge', run(0, 3, 0, 1, 5)],
    ['vertical on the right edge', run(14, 0, 0, 1, 5)],
    ['diagonal ↘ from the corner', run(0, 0, 1, 1, 5)],
    ['diagonal ↘ into the far corner', run(10, 10, 1, 1, 5)],
    ['diagonal ↗ from the bottom-left corner', run(0, 14, 1, -1, 5).map(([x, y]) => [x, y - 2] as XY)],
    ['diagonal ↗ into the top-right corner', run(10, 4, 1, -1, 5)],
  ];
  for (const [name, five] of cases) {
    it(`detects five: ${name}`, () => {
      const white = scatter.filter(([x, y]) => !five.some(([a, b]) => a === x && b === y)).slice(0, 4);
      const moves = game(five, white);
      expect(isLegalGame(moves)).toBe(true);
      const o = outcome(moves);
      expect(o.winner).toBe(BLACK);
      expect(o.line?.length).toBe(5);
      // every prefix before the last stone is still undecided
      expect(outcome(moves.slice(0, -1)).winner).toBe(0);
    });
  }

  it('counts an overline (six) as a win and returns the whole run', () => {
    const black: XY[] = [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7], [6, 7]];
    const moves = game(black, scatter.slice(0, 5));
    const o = outcome(moves);
    expect(o.winner).toBe(BLACK);
    expect(o.line?.length).toBe(6);
  });

  it('four is not five; a blocked line is not a win', () => {
    expect(outcome(game(run(3, 3, 1, 0, 4), scatter.slice(0, 3))).winner).toBe(0);
    // X X X X O X — broken by white
    const moves = game([[1, 1], [2, 1], [3, 1], [4, 1], [6, 1]], [[5, 1], ...scatter.slice(0, 3)]);
    expect(outcome(moves).winner).toBe(0);
  });

  it('white wins too, and names coordinates like the board', () => {
    const moves = game([[7, 7], [0, 0], [2, 0], [4, 0], [6, 0]], run(3, 10, 1, 0, 5));
    expect(outcome(moves).winner).toBe(WHITE);
    expect(coordName(idx(7, 7))).toBe('H8');
    expect(coordName(idx(0, 14))).toBe('A1');
    expect(colorOfMove(0)).toBe(BLACK);
    expect(isLegalGame([0, 0])).toBe(false);
    expect(isLegalGame([CELLS])).toBe(false);
  });
});

describe('gomoku patterns', () => {
  it('classifies open three / four shapes', () => {
    // black _XXX_ at row 7, cols 5..7 → playing at 4 or 8 makes a flex four
    const m = game(run(5, 7, 1, 0, 3), [[0, 0], [14, 14]]);
    expect(patternAt(m, 4, 7, 0)).toBe(F4);
    expect(patternAt(m, 8, 7, 0)).toBe(F4);
    expect(patternAt(m, 3, 7, 0)).toBe(B4);
    // walled on the left edge: |XXX_ → only a closed four
    const e = game(run(0, 3, 1, 0, 3), [[9, 9], [12, 12]]);
    expect(patternAt(e, 3, 3, 0)).toBe(B4);
    // _XX_ → three is open
    const two = game(run(6, 6, 0, 1, 2), [[0, 0]]);
    expect(patternAt(two, 6, 8, 1)).toBe(F3);
    // O X X _ → closed three
    const blocked = game(run(6, 6, 0, 1, 2), [[6, 5]]);
    expect(patternAt(blocked, 6, 8, 1)).toBe(B3);
    // XXXX_ → five
    const four = game(run(2, 2, 1, 1, 4), [[0, 5], [0, 7], [0, 9]]);
    expect(patternAt(four, 6, 6, 2)).toBe(FIVE);
  });

  it('keeps incremental counts identical to a fresh build', () => {
    const rng = makeRng(42);
    const moves: number[] = [];
    const used = new Set<number>();
    while (moves.length < 60) {
      const c = Math.floor(rng() * 81);
      const cell = idx(3 + (c % 9), 3 + Math.floor(c / 9));
      if (!used.has(cell)) { used.add(cell); moves.push(cell); }
    }
    const pos = new Pos();
    moves.forEach((m, i) => pos.place(m, colorOfMove(i)));
    for (let i = moves.length - 1; i >= 30; i--) pos.remove(moves[i]);
    const fresh = new Pos(moves.slice(0, 30));
    expect(Array.from(pos.cnt[1])).toEqual(Array.from(fresh.cnt[1]));
    expect(Array.from(pos.cnt[2])).toEqual(Array.from(fresh.cnt[2]));
    expect(Array.from(pos.pat[1])).toEqual(Array.from(fresh.pat[1]));
    expect(pos.hA).toBe(fresh.hA);
  });
});

const LEVELS: Level[] = ['beginner', 'club', 'master'];
const quick = (moves: number[], level: Level) => think(moves, { level, timeMs: level === 'master' ? 250 : 150, seed: 7 });

describe('gomoku AI tactics', () => {
  it('always completes its own five, even when the opponent also has four', () => {
    // white (AI, to move) has four at row 10; black has four at row 3
    const black: XY[] = [...run(3, 3, 1, 0, 4), [7, 7]];
    const white: XY[] = run(4, 10, 1, 0, 4);
    const moves = game(black, white);
    for (const level of LEVELS) {
      const r = quick(moves, level);
      expect([idx(3, 10), idx(8, 10)]).toContain(r.move);
    }
  });

  it('always blocks a four', () => {
    // black four with one open end (white capped the left); white to move
    const black: XY[] = [...run(5, 5, 0, 1, 4), [10, 12]];
    const white: XY[] = [[5, 4], [1, 1], [12, 1], [1, 12]];
    const moves = game(black, white);
    for (const level of LEVELS) expect(quick(moves, level).move).toBe(idx(5, 9));
  });

  it('blocks an open three when it has no four of its own', () => {
    // black _XXX_ diagonal; white scattered and harmless; white to move
    const black: XY[] = [...run(5, 5, 1, 1, 3)];
    const white: XY[] = [[1, 12], [12, 1]];
    const moves = game(black, white);
    const ok = [idx(4, 4), idx(8, 8), idx(3, 3), idx(9, 9)];
    for (const level of ['club', 'master'] as Level[]) expect(ok).toContain(quick(moves, level).move);
    // a split three X_XX too
    const split = game([[4, 7], [6, 7], [7, 7]], [[1, 1], [13, 13]]);
    const ok2 = [idx(3, 7), idx(5, 7), idx(8, 7), idx(2, 7), idx(9, 7)];
    for (const level of ['club', 'master'] as Level[]) expect(ok2).toContain(quick(split, level).move);
  });

  it('turns a flex-four point into the win (makes the open four)', () => {
    // white to move has _OOO_ open three; black has nothing urgent
    const black: XY[] = [[1, 1], [1, 3], [13, 13]];
    const white: XY[] = run(6, 9, 1, 0, 3);
    const moves = game(black, white);
    for (const level of ['club', 'master'] as Level[]) {
      const r = quick(moves, level);
      expect([idx(5, 9), idx(9, 9)]).toContain(r.move);
    }
  });

  it('finds a VCF (win by continuous fours)', () => {
    // Black to move. Two closed threes that cross: fours in sequence lead to a double four.
    //   row 7: O X X X _ _  (closed three, cols 4..6, white at 3)
    //   col 8: O X X X _    (closed three, rows 3..5, white at 2) → X at (8,7) makes a four on both lines? no:
    // Build: black at (4,7),(5,7),(6,7) with white (3,7); black at (8,4),(8,5),(8,6) with white (8,3).
    // Playing (8,7) → vertical four (8,4..7) AND row 7: X X X _ X → four too → double four.
    const black: XY[] = [[4, 7], [5, 7], [6, 7], [8, 4], [8, 5], [8, 6]];
    const white: XY[] = [[3, 7], [8, 3], [0, 14], [14, 14], [14, 0], [0, 0]];
    const moves = game(black, white);
    const r = think(moves, { level: 'master', timeMs: 300, seed: 1 });
    expect(r.move).toBe(idx(8, 7));
    expect(r.score).toBeGreaterThan(900_000);
  });
});

describe('gomoku AI strength', () => {
  it('Master beats a greedy one-ply player at least 9 games in 10', () => {
    let masterWins = 0;
    const log: string[] = [];
    for (let g = 0; g < 10; g++) {
      const rng = makeRng(1000 + g);
      const masterIs = g % 2 === 0 ? BLACK : WHITE;
      const moves: number[] = [];
      // a couple of random-ish opening stones for variety
      let result = 0;
      while (moves.length < CELLS) {
        const side = colorOfMove(moves.length);
        let m: number;
        if (side === masterIs) m = think(moves, { level: 'master', timeMs: 70, seed: g }).move;
        else m = greedyMove(moves, rng);
        if (m < 0) break;
        moves.push(m);
        const o = outcome(moves);
        if (o.winner) { result = o.winner; break; }
      }
      if (result === masterIs) masterWins++;
      log.push(`${g}: master ${masterIs === BLACK ? 'black' : 'white'} → ${result === masterIs ? 'win' : result ? 'loss' : 'draw'} in ${moves.length}`);
    }
    console.log(log.join('\n'));
    expect(masterWins).toBeGreaterThanOrEqual(9);
  }, 60_000);
});

describe('gomoku AI threats (VCT)', () => {
  // Black has two open twos that meet at H8 (7,7): taking it makes a double open three.
  const black: XY[] = [[8, 7], [9, 7], [5, 5], [6, 6]];
  const white: XY[] = [[1, 1], [13, 1], [1, 13], [13, 13]];

  it('Master finds a win by threes and fours', () => {
    const moves = game(black, white); // black to move
    const r = think(moves, { level: 'master', timeMs: 400, seed: 3 });
    expect(r.reason).toBe('vct');
    expect(r.score).toBeGreaterThan(900_000);
  });

  it('Master sees the double three coming and takes the point', () => {
    const moves = game(black, white.slice(0, 3)); // same stones, white to move
    expect(colorOfMove(moves.length)).toBe(WHITE);
    const r = think(moves, { level: 'master', timeMs: 600, seed: 3 });
    expect(r.move).toBe(idx(7, 7));
  });
});

describe('gomoku Beginner', () => {
  it('overlooks a plain open three now and then (20–40% of the time), never a four', () => {
    const cases = [
      game(run(5, 7, 1, 0, 3), [[1, 12], [12, 1]]),
      game(run(5, 5, 1, 1, 3), [[1, 12], [12, 1]]),
      game([[4, 7], [6, 7], [7, 7]], [[1, 1], [13, 13]]),
    ];
    for (const moves of cases) {
      let missed = 0;
      for (let s = 0; s < 100; s++) {
        const m = think(moves, { level: 'beginner', seed: s }).move;
        const pos = new Pos([...moves, m]);
        if (pos.cnt[BLACK][F4] > 0) missed++; // black can still make an open four
      }
      expect(missed).toBeGreaterThanOrEqual(20);
      expect(missed).toBeLessThanOrEqual(40);
    }
    const four = game([...run(5, 5, 0, 1, 4), [10, 12]], [[5, 4], [1, 1], [12, 1], [1, 12]]);
    for (let s = 0; s < 40; s++) expect(think(four, { level: 'beginner', seed: s }).move).toBe(idx(5, 9));
  });
});

describe('gomoku AI on the main thread', () => {
  it('a sliced Master search (12 ms steps) still ends with a legal move', () => {
    const moves = game([[7, 7], [8, 8], [6, 8], [9, 6]], [[7, 6], [8, 7], [6, 6]]);
    const t = new Thinker(moves, { level: 'master', timeMs: 300, seed: 5 });
    let r = null;
    let steps = 0;
    while (!(r = t.step(12))) steps++;
    expect(steps).toBeGreaterThan(3);
    expect(r.move).toBeGreaterThanOrEqual(0);
    expect(moves).not.toContain(r.move);
  });
});

/**
 * The level ladder, at the real time budgets: Master as white (the default seat against a human
 * playing black) must clearly beat Club as black. Ten standard three-stone openings (black H8, white
 * adjacent, black anywhere within two). Takes several minutes, so it is opt-in:
 *   GOMOKU_MATCH=1 npx vitest run tests/gomoku.test.ts
 */
describe.skipIf(!process.env.GOMOKU_MATCH)('gomoku level ladder (slow)', () => {
  const openings: XY[][] = [];
  for (let y = -2; y <= 2; y++) for (let x = 0; x <= 2; x++) if (!(x === 0 && (y === 0 || y === -1))) openings.push([[0, 0], [0, -1], [x, y]]);
  const seen = new Set<string>();
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    if ((x === 0 && y === 0) || (x === 1 && y === -1) || seen.has(`${-y},${-x}`)) continue;
    seen.add(`${x},${y}`);
    openings.push([[0, 0], [1, -1], [x, y]]);
  }

  it('Master (white) beats Club (black) at least 6 games in 10', () => {
    let wins = 0;
    const log: string[] = [];
    for (const o of [0, 3, 5, 8, 11, 14, 17, 19, 22, 25]) {
      const moves = openings[o].map(([x, y]) => idx(7 + x, 7 + y));
      let winner = 0;
      while (moves.length < CELLS && !winner) {
        const level: Level = colorOfMove(moves.length) === BLACK ? 'club' : 'master';
        moves.push(think(moves, { level, seed: o * 31 + moves.length }).move);
        winner = outcome(moves).winner;
      }
      if (winner === WHITE) wins++;
      log.push(`opening ${o}: ${winner === WHITE ? 'Master' : winner ? 'Club' : 'draw'} in ${moves.length}`);
    }
    console.log(log.join('\n'));
    expect(wins).toBeGreaterThanOrEqual(6);
  }, 20 * 60_000);
});
