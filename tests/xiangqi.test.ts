import { describe, it, expect } from 'vitest';
import {
  Position, START_FEN, perft, sq, iccs, parseIccs, notation, replay, RED, BLACK, fileOf, rowOf,
} from '../src/views/games/xiangqi/engine';
import { think, bookMoves, clearMemory, Thinker, BOOK_LINES, WIN } from '../src/views/games/xiangqi/ai';

const P = (x: number, y: number) => sq(x, y);
const at = (list: number[]) => list.map((s) => `${fileOf(s)},${rowOf(s)}`).sort();
const moves = (s: string) => s.split(/\s+/).filter(Boolean).map(parseIccs);

describe('xiangqi move generation', () => {
  it('perft from the standard start matches the published counts', () => {
    const p = new Position();
    expect(perft(p, 1)).toBe(44);
    expect(perft(p, 2)).toBe(1920);
    expect(perft(p, 3)).toBe(79666);
    // and leaves the position untouched
    expect(p.fen()).toBe(START_FEN);
  });

  it('FEN round-trips and records side, captures clock and move number', () => {
    const fen = 'r1bakab1r/9/1cn3nc1/p1p1p1p1p/9/9/P1P1P1P1P/1CN3NC1/9/R1BAKAB1R b - - 4 3';
    const loaded = new Position(fen);
    expect(loaded.fen()).toBe(fen);
    // black's reply completes move 3; red then opens move 4
    loaded.play(parseIccs('a6a5'));
    expect(loaded.fen()).toBe('r1bakab1r/9/1cn3nc1/2p1p1p1p/p8/9/P1P1P1P1P/1CN3NC1/9/R1BAKAB1R w - - 5 4');
    expect(new Position('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 7').fen()).toBe('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 7');
    const p = new Position();
    p.play(parseIccs('h2e2'));
    expect(p.fen()).toBe('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b - - 1 1');
    expect(() => new Position('rnbakabnr/9/9 w')).toThrow();
  });

  it('the horse is hobbled by a piece on its leg', () => {
    // red horse c1 with a red soldier on its forward leg
    const p = new Position('3k5/9/9/9/9/9/9/2P6/2N6/4K4 w');
    expect(at(p.targetsFrom(P(2, 8)))).toEqual(at([P(0, 7), P(0, 9), P(4, 7)]));
  });

  it('the elephant is blocked by its eye and never crosses the river', () => {
    const blocked = new Position('3k5/9/9/9/9/9/3p5/4B4/9/5K3 w');
    expect(at(blocked.targetsFrom(P(4, 7)))).toEqual(at([P(6, 5), P(2, 9), P(6, 9)]));
    const bank = new Position('3k5/9/9/9/9/2B6/9/9/9/5K3 w');
    expect(at(bank.targetsFrom(P(2, 5)))).toEqual(at([P(0, 7), P(4, 7)]));
  });

  it('advisors and generals stay in the palace', () => {
    const p = new Position('3k5/9/9/9/9/9/9/3A5/9/5K3 w');
    expect(at(p.targetsFrom(P(3, 7)))).toEqual(at([P(4, 8)]));
    expect(at(p.targetsFrom(P(5, 9)))).toEqual(at([P(4, 9), P(5, 8)]));
  });

  it('the cannon needs exactly one screen to capture', () => {
    const p = new Position('r2k5/9/9/1p7/9/9/9/1C7/9/5K3 w');
    // screen = black soldier b6 (1,3); black chariot a9 is not on the file. Put one on b9:
    const q = new Position('1r1k5/9/9/1p7/9/9/9/1C7/9/5K3 w');
    const t = q.targetsFrom(P(1, 7));
    expect(t).toContain(P(1, 0)); // capture over the screen
    expect(t).not.toContain(P(1, 3)); // not the screen itself
    expect(t).not.toContain(P(1, 2)); // no quiet move past the screen
    expect(t).toContain(P(1, 4));
    expect(p.targetsFrom(P(1, 7))).not.toContain(P(1, 0));
  });

  it('soldiers go sideways only after crossing the river, and never back', () => {
    const home = new Position('3k5/9/9/9/9/9/4P4/9/9/5K3 w');
    expect(at(home.targetsFrom(P(4, 6)))).toEqual(at([P(4, 5)]));
    const across = new Position('3k5/9/9/9/4P4/9/9/9/9/5K3 w');
    expect(at(across.targetsFrom(P(4, 4)))).toEqual(at([P(4, 3), P(3, 4), P(5, 4)]));
    const black = new Position('3k5/9/9/9/9/4p4/9/9/9/5K3 b');
    expect(at(black.targetsFrom(P(4, 5)))).toEqual(at([P(4, 6), P(3, 5), P(5, 5)]));
  });

  it('the generals may not face each other on an open file', () => {
    const p = new Position('3k5/9/9/9/9/9/9/9/9/4K4 w');
    expect(at(p.targetsFrom(P(4, 9)))).toEqual(at([P(5, 9), P(4, 8)]));
    // a piece standing between the generals is pinned to the file
    const pin = new Position('4k4/9/9/9/9/9/9/9/4N4/4K4 w');
    expect(pin.targetsFrom(P(4, 8))).toEqual([]);
    expect(pin.inCheck(RED)).toBe(false);
    // …and a facing position counts as check
    expect(new Position('4k4/9/9/9/9/9/9/9/9/4K4 w').inCheck(RED)).toBe(true);
  });

  it('detects check from each attacker', () => {
    expect(new Position('4k4/9/9/9/9/9/9/9/4r4/3K5 w').inCheck()).toBe(false);
    expect(new Position('4k4/9/9/9/9/9/9/9/3r5/3K5 w').inCheck()).toBe(true); // chariot
    expect(new Position('4k4/9/9/3c5/9/3p5/9/9/9/3K5 w').inCheck()).toBe(true); // cannon over a screen
    expect(new Position('4k4/9/9/3c5/9/9/9/9/9/3K5 w').inCheck()).toBe(false); // no screen
    expect(new Position('4k4/9/9/9/9/9/9/2n6/9/3K5 w').inCheck()).toBe(true); // horse
    expect(new Position('4k4/9/9/9/9/9/9/2n6/3P5/3K5 w').inCheck()).toBe(true); // leg is elsewhere
    expect(new Position('4k4/9/9/9/9/9/9/2n6/2P6/3K5 w').inCheck()).toBe(false); // leg blocked
    expect(new Position('4k4/9/9/9/9/9/9/9/3p5/3K5 w').inCheck()).toBe(true); // soldier in front
    expect(new Position('4k4/9/9/9/9/9/9/9/9/2pK5 w').inCheck()).toBe(true); // soldier beside
    expect(new Position('4k4/9/9/9/9/9/9/9/9/3Kp4 w').inCheck()).toBe(true);
    expect(new Position('4k4/9/9/9/9/9/9/9/9/3K5 w').inCheck(BLACK)).toBe(false);
  });
});

describe('xiangqi game results', () => {
  it('checkmate: the side to move loses', () => {
    const p = new Position('R2k5/8R/9/9/9/9/9/9/9/5K3 b');
    expect(p.inCheck()).toBe(true);
    expect(p.legalMoves()).toEqual([]);
    expect(p.outcome()).toEqual({ winner: RED, reason: 'mate' });
  });

  it('stalemate is also a loss for the side to move', () => {
    const p = new Position('3k5/8R/9/9/9/9/9/9/9/4K4 b');
    expect(p.inCheck()).toBe(false);
    expect(p.outcome()).toEqual({ winner: RED, reason: 'stalemate' });
  });

  it('perpetual check loses on the third repetition', () => {
    const p = new Position('3k5/9/8R/9/9/9/9/9/9/5K3 w');
    const seq = moves('i7i9 d9d8 i9i8 d8d9 i8i9 d9d8 i9i8 d8d9 i8i9');
    seq.forEach((m, i) => {
      expect(p.play(m), `move ${i}`).toBe(true);
      if (i < seq.length - 1) expect(p.outcome()).toBeNull();
    });
    expect(p.outcome()).toEqual({ winner: BLACK, reason: 'perpetual' });
  });

  it('a threefold repetition without checks is a draw', () => {
    const p = new Position('3k4r/9/9/9/9/9/9/9/9/R4K3 w');
    const seq = moves('a0a1 i9i8 a1a0 i8i9 a0a1 i9i8 a1a0 i8i9');
    seq.forEach((m, i) => {
      expect(p.play(m)).toBe(true);
      if (i < seq.length - 1) expect(p.outcome()).toBeNull();
    });
    expect(p.outcome()).toEqual({ winner: null, reason: 'repetition' });
  });

  it('no attacking pieces left is a draw', () => {
    expect(new Position('3ak4/4a4/9/9/9/9/9/4B4/9/3AK4 w').outcome()).toEqual({ winner: null, reason: 'material' });
  });

  it('undo restores the position exactly', () => {
    const p = new Position();
    const before = p.fen();
    const key = [p.lo, p.hi, p.vl[0], p.vl[1]];
    for (const m of moves('h2e2 h9g7 e2e6 g6g5 b0c2')) {
      expect(p.play(m)).toBe(true);
    }
    for (let i = 0; i < 5; i++) p.undo();
    expect(p.fen()).toBe(before);
    expect([p.lo, p.hi, p.vl[0], p.vl[1]]).toEqual(key);
  });

  it('replay rejects illegal games', () => {
    expect(replay(moves('h2e2 h9g7'))).not.toBeNull();
    expect(replay(moves('h2e2 h2e2'))).toBeNull();
    expect(replay([12345])).toBeNull();
  });
});

describe('xiangqi notation', () => {
  it('writes moves the traditional way', () => {
    const p = new Position();
    expect(notation(p, parseIccs('h2e2'))).toBe('炮二平五');
    expect(notation(p, parseIccs('h2e2'), 'en')).toBe('C2.5');
    expect(notation(p, parseIccs('b0c2'))).toBe('马八进七');
    expect(notation(p, parseIccs('i0i1'))).toBe('车一进一');
    p.play(parseIccs('h2e2'));
    expect(notation(p, parseIccs('h9g7'))).toBe('马８进７');
    expect(notation(p, parseIccs('c6c5'))).toBe('卒３进１');
    expect(iccs(parseIccs('h2e2'))).toBe('h2e2');
    // two chariots on one file
    const q = new Position('3k5/9/9/9/9/R8/9/R8/9/5K3 w');
    expect(notation(q, parseIccs('a4b4'))).toBe('前车平八');
    expect(notation(q, parseIccs('a2a1'))).toBe('后车退一');
  });
});

describe('xiangqi AI', () => {
  it('every book line is legal', () => {
    for (const line of BOOK_LINES) expect(replay(moves(line)), line).not.toBeNull();
    expect(bookMoves([]).length).toBeGreaterThan(4);
    expect(bookMoves(moves('h2e2')).length).toBeGreaterThan(1);
  });

  it('finds a mate in one at every level', () => {
    const fen = '3k5/8R/9/9/R8/9/9/9/9/5K3 w';
    for (const level of ['beginner', 'club', 'master'] as const) {
      const r = think([], { level, timeMs: 400, seed: 3 }, fen);
      expect(iccs(r.move), level).toBe('a5a9');
      expect(r.score).toBeGreaterThan(WIN);
    }
  });

  it('takes a hanging chariot', () => {
    const r = think([], { level: 'club', timeMs: 300 }, '4k4/9/r8/9/9/9/9/R8/9/3K5 w');
    expect(iccs(r.move)).toBe('a2a7');
  });

  it('sees a mate in two (double chariots) and plays a mating move', () => {
    const fen = '3ak4/9/9/9/9/9/9/9/R7R/5K3 w';
    // brute force: red moves after which every black reply allows a mate in one
    const p = new Position(fen);
    const mating = p.legalMoves().filter((m) => {
      p.play(m);
      const ok = p.legalMoves().every((r) => {
        p.play(r);
        const has = p.legalMoves().some((m2) => {
          p.play(m2);
          const over = p.legalMoves().length === 0;
          p.undo();
          return over;
        });
        p.undo();
        return has;
      });
      p.undo();
      return ok;
    });
    expect(mating.map(iccs).sort()).toEqual(['a1d1', 'a1e1', 'i1e1']);
    const r = think([], { level: 'club', timeMs: 800 }, fen);
    expect(r.score).toBeGreaterThan(WIN);
    expect(mating).toContain(r.move);
  });

  it('opens from the book, and answers with a legal move', () => {
    const r = think([], { level: 'club', seed: 7 });
    expect(r.book).toBe(true);
    expect(new Position().isLegal(r.move)).toBe(true);
    const r2 = think(moves('h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 c3c4 g6g5 b0c2'), { level: 'beginner', seed: 1 });
    expect(r2.book).toBe(false);
    expect(replay(moves('h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 c3c4 g6g5 b0c2'))!.isLegal(r2.move)).toBe(true);
  });

  it('a search in short slices (no worker) reaches the same depth as one run straight through', () => {
    const hist = moves('h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 c3c4 g6g5 b0c2');
    const opts = { level: 'club' as const, depth: 6, timeMs: 60000, book: false };
    clearMemory();
    const whole = think(hist, opts);
    clearMemory();
    const t = new Thinker(hist, opts);
    let r = null, steps = 0;
    // 1 ms slices: every iteration past the first few is cut short many times and must resume
    while (!(r = t.step(1))) steps++;
    expect(steps).toBeGreaterThan(3);
    expect(r.depth).toBe(6);
    expect(whole.depth).toBe(6);
    // (the move itself may differ: where the slices fall changes the move-ordering history)
    expect(replay(hist)!.isLegal(r.move)).toBe(true);
  });

  it('stays within its time budget', () => {
    const t = performance.now();
    think(moves('h2e2 h9g7'), { level: 'club', book: false });
    expect(performance.now() - t).toBeLessThan(1500);
  });

  it('beats the beginner level from the start', { timeout: 60000 }, () => {
    const p = new Position();
    const hist: number[] = [];
    let res = p.outcome();
    for (let ply = 0; ply < 160 && !res; ply++) {
      const strong = p.side === RED;
      // fixed depth (not time) so the game is the same on every machine
      const r = think(hist, strong ? { level: 'club', depth: 4, timeMs: 10000, seed: ply } : { level: 'beginner', timeMs: 10000, seed: ply });
      expect(p.play(r.move)).toBe(true);
      hist.push(r.move);
      res = p.outcome();
    }
    expect(res?.winner).toBe(RED);
  });
});

