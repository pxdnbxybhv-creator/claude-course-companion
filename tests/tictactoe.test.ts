import { describe, expect, it } from 'vitest';
import {
  aiMove, bestMoves, emptyBoard, emptyCells, outcome, play, toMove, winner, winningMoves,
  type Board, type Level, type Mark,
} from '../src/views/games/tictactoe/logic';

const B = (s: string): Board => s.split('').map((c) => (c === 'O' || c === 'X' ? c : null));

/** A tiny seeded [0,1) source. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tic-tac-toe · rules', () => {
  it('finds winners on every line and draws', () => {
    expect(winner(B('OOO......'))?.line).toEqual([0, 1, 2]);
    expect(winner(B('X...X...X'))?.mark).toBe('X');
    expect(winner(B('..O.O.O..'))?.line).toEqual([2, 4, 6]);
    expect(outcome(B('OXOOXXXOO'))).toBe('draw');
    expect(outcome(B('OX.......'))).toBeNull();
  });

  it('knows whose turn it is and refuses illegal moves', () => {
    expect(toMove(emptyBoard(), 'X')).toBe('X');
    expect(toMove(B('X........'), 'X')).toBe('O');
    const b = B('X........');
    expect(play(b, 0, 'O')).toBe(b);
    expect(play(b, 9, 'O')).toBe(b);
    const won = B('XXX.OO...');
    expect(play(won, 8, 'O')).toBe(won);
    expect(play(b, 4, 'O')[4]).toBe('O');
    expect(b[4]).toBeNull(); // immutable
  });

  it('lists immediate wins', () => {
    expect(winningMoves(B('OO..X.X..'), 'O')).toEqual([2]);
    expect(winningMoves(B('OO..X.X..'), 'X').sort()).toEqual([2]);
  });
});

describe('tic-tac-toe · hard AI never loses', () => {
  /** Walk every sequence of human moves against the hard AI. Returns [games, losses for AI]. */
  function explore(b: Board, turn: Mark, ai: Mark, stats: { games: number; aiLosses: number; draws: number; aiWins: number }) {
    const o = outcome(b);
    if (o) {
      stats.games++;
      if (o === 'draw') stats.draws++;
      else if (o === ai) stats.aiWins++;
      else stats.aiLosses++;
      return;
    }
    if (turn === ai) {
      // every optimal reply the AI might choose (it breaks ties at random)
      for (const m of bestMoves(b, ai)) explore(play(b, m, ai), human(ai), ai, stats);
    } else {
      for (const m of emptyCells(b)) explore(play(b, m, turn), ai, ai, stats);
    }
  }
  const human = (ai: Mark): Mark => (ai === 'O' ? 'X' : 'O');

  it('when the human starts', () => {
    const stats = { games: 0, aiLosses: 0, draws: 0, aiWins: 0 };
    explore(emptyBoard(), 'O', 'X', stats);
    expect(stats.games).toBeGreaterThan(100);
    expect(stats.aiLosses).toBe(0);
    expect(stats.aiWins).toBeGreaterThan(0);
  });

  it('when the machine starts', () => {
    const stats = { games: 0, aiLosses: 0, draws: 0, aiWins: 0 };
    explore(emptyBoard(), 'X', 'X', stats);
    expect(stats.games).toBeGreaterThan(100);
    expect(stats.aiLosses).toBe(0);
  });

  it('aiMove(hard) always returns one of the best moves and wins as soon as it can', () => {
    const rnd = seeded(9);
    const b = B('XX.OO....');
    expect(aiMove(b, 'X', 'hard', rnd)).toBe(2); // win now rather than block
    expect(aiMove(B('OO..X....'), 'X', 'hard', rnd)).toBe(2); // must block
    for (let i = 0; i < 20; i++) expect(bestMoves(emptyBoard(), 'X')).toContain(aiMove(emptyBoard(), 'X', 'hard', rnd));
  });
});

describe('tic-tac-toe · easy and medium', () => {
  const levels: Level[] = ['easy', 'medium', 'hard'];

  it('every level takes an immediate win', () => {
    for (const lv of levels) {
      for (let s = 0; s < 30; s++) expect(aiMove(B('XX.OO.O..'), 'X', lv, seeded(s))).toBe(2);
    }
  });

  it('medium blocks, easy does not always', () => {
    const b = B('OO..X....'); // O threatens 2; X has no win
    for (let s = 0; s < 50; s++) expect(aiMove(b, 'X', 'medium', seeded(s))).toBe(2);
    const easy = new Set<number>();
    for (let s = 0; s < 200; s++) easy.add(aiMove(b, 'X', 'easy', seeded(s)));
    expect(easy.size).toBeGreaterThan(3); // it wanders
  });

  it('medium prefers its own win over a block', () => {
    const b = B('OO.XX....'); // X to move can win at 5; O threatens 2
    for (let s = 0; s < 30; s++) expect(aiMove(b, 'X', 'medium', seeded(s))).toBe(5);
  });

  it('otherwise plays at random among the free cells (easy and medium)', () => {
    for (const lv of ['easy', 'medium'] as Level[]) {
      const seen = new Set<number>();
      for (let s = 0; s < 400; s++) {
        const m = aiMove(emptyBoard(), 'X', lv, seeded(s));
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThan(9);
        seen.add(m);
      }
      expect(seen.size).toBe(9);
    }
  });

  it('is beatable on easy and medium', () => {
    // Human O takes the centre then plays a fork line; some seed lets O win against both.
    for (const lv of ['easy', 'medium'] as Level[]) {
      let humanWon = false;
      for (let s = 0; s < 200 && !humanWon; s++) {
        const rnd = seeded(s);
        let b = emptyBoard();
        let turn: Mark = 'O';
        while (!outcome(b)) {
          const m = turn === 'X' ? aiMove(b, 'X', lv, rnd) : (bestMoves(b, 'O')[0]);
          b = play(b, m, turn);
          turn = turn === 'O' ? 'X' : 'O';
        }
        humanWon = outcome(b) === 'O';
      }
      expect(humanWon).toBe(true);
    }
  });

  it('returns -1 when there is nothing to play', () => {
    expect(aiMove(B('OXOOXXXOO'), 'X', 'hard')).toBe(-1);
    expect(aiMove(B('OOOXX....'), 'X', 'easy')).toBe(-1);
  });
});
