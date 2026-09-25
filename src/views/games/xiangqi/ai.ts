// 象棋 AI — pure TS, no DOM; runs in a Web Worker (ai.worker.ts) or, in short slices, on the main
// thread when workers are unavailable.
//
// Iterative-deepening PVS negamax with alpha-beta, a quiescence search over captures (and every
// evasion when in check), check extension, null-move pruning (off when a side is short of pieces,
// where zugzwang is real), late-move reductions, and a Zobrist transposition table that survives
// between moves. Move order: hash move → captures by MVV-LVA → two killers per ply → history.
// Evaluation: piece-square tables with material (after ElephantEye / XQWLight) plus a small tempo.
// Repetition inside the search follows the game rule: whoever keeps checking loses, otherwise draw.
//
// Levels:
//   初学 beginner — depth 2, then picks among the near-best moves at random (and now and then a
//                   clearly worse one), but never misses a mate in one or walks into one;
//   棋友 club     — ~0.6 s;
//   国手 master   — ~2 s.
// All levels open from a small book of mainstream openings, chosen at random, for variety.
import { Position, START_FEN, KING, ADVISOR, BISHOP, KNIGHT, ROOK, CANNON, PAWN, parseIccs } from './engine';

export type Level = 'beginner' | 'club' | 'master';

export interface ThinkOptions {
  level: Level;
  /** override the level's time budget (ms) */
  timeMs?: number;
  /** override the level's maximum depth */
  depth?: number;
  /** seed for the level's randomness (book choice, beginner's picks); default: random */
  seed?: number;
  /** use the opening book (default true) */
  book?: boolean;
}

export interface ThinkResult {
  move: number;
  /** from the mover's point of view, centipawn-ish; ±(MATE - n) for a mate in n plies */
  score: number;
  depth: number;
  nodes: number;
  book: boolean;
  ms: number;
}

export const MATE = 10000;
export const WIN = 9000;
const BAN = 9500;
const MAX_PLY = 64;
const INF = 30000;

const LEVELS: Record<Level, { timeMs: number; depth: number; noise: number; blunder: number }> = {
  beginner: { timeMs: 250, depth: 2, noise: 90, blunder: 0.12 },
  club: { timeMs: 600, depth: 64, noise: 0, blunder: 0 },
  master: { timeMs: 2000, depth: 64, noise: 0, blunder: 0 },
};

// ── opening book ─────────────────────────────────────────────────────────────────────────────
/** Mainstream openings in ICCS; the search takes over when the game leaves the book. */
export const BOOK_LINES: string[] = [
  // 中炮对屏风马 Central cannon vs screen horses
  'h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 c3c4 g6g5',
  'h2e2 h9g7 h0g2 b9c7 b0c2 i9h9 i0h0 a9b9',
  'h2e2 b9c7 h0g2 h9g7 i0h0 i9h9 c3c4 c6c5',
  // 顺炮 Same-direction cannons
  'h2e2 h7e7 h0g2 h9g7 i0h0 i9h9 b0c2 b9c7',
  'h2e2 h7e7 h0g2 h9g7 i0h0 i9i8',
  // 列炮 Opposite-direction cannons
  'h2e2 b7e7 h0g2 b9c7 i0h0 a9b9 b0c2',
  // 中炮对反宫马 vs the palace-corner horses
  'h2e2 b9c7 h0g2 h7f7 i0h0 h9g7',
  // 中炮 from the left
  'b2e2 b9c7 b0c2 h9g7 a0b0 a9b9',
  'b2e2 h9g7 b0c2 i9h9 a0b0',
  // 飞相局 Elephant opening
  'g0e2 g6g5 h0g2 h9g7 i0h0 i9h9',
  'g0e2 h7e7 h0g2 h9g7 i0h0 i9h9',
  'g0e2 c6c5 b0c2 b9c7',
  'c0e2 c6c5 b0c2 b9c7 a0b0',
  // 仙人指路 Pawn opening
  'c3c4 g6g5 b0c2 h9g7 h0g2 i9h9',
  'c3c4 b7c7 h2e2 c9e7 h0g2 b9a7',
  'c3c4 c9e7 h0g2 h9g7 i0h0 i9h9',
  'g3g4 c6c5 h0g2 b9c7',
  // 起马局 Horse opening
  'h0g2 g6g5 c3c4 h9g7 b0c2',
  'h0g2 h9g7 c3c4 c6c5 b0c2',
  // 过宫炮 Cross-palace cannon
  'h2d2 h9g7 h0g2 i9h9 i0h0',
];

interface BookNode { moves: Map<number, BookNode> }
let bookRoot: BookNode | null = null;
function book(): BookNode {
  if (bookRoot) return bookRoot;
  const root: BookNode = { moves: new Map() };
  for (const line of BOOK_LINES) {
    let n = root;
    for (const s of line.split(/\s+/)) {
      const mv = parseIccs(s);
      if (!mv) break;
      let c = n.moves.get(mv);
      if (!c) n.moves.set(mv, (c = { moves: new Map() }));
      n = c;
    }
  }
  return (bookRoot = root);
}

/** The book's candidate replies after `moves` (from the standard start), or [] once out of book. */
export function bookMoves(moves: readonly number[]): number[] {
  let n: BookNode | undefined = book();
  for (const m of moves) {
    n = n.moves.get(m);
    if (!n) return [];
  }
  return [...n.moves.keys()];
}

// ── transposition table (kept between searches) ────────────────────────────────────────────────
const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1, LOWER = 2, UPPER = 3;
let ttLock: Int32Array | null = null;
let ttMove: Uint16Array;
let ttScore: Int16Array;
let ttDepth: Int8Array;
let ttFlag: Uint8Array;
function ensureTT() {
  if (ttLock) return;
  ttLock = new Int32Array(TT_SIZE);
  ttMove = new Uint16Array(TT_SIZE);
  ttScore = new Int16Array(TT_SIZE);
  ttDepth = new Int8Array(TT_SIZE);
  ttFlag = new Uint8Array(TT_SIZE);
}
export function clearMemory(): void {
  if (!ttLock) return;
  ttLock.fill(0);
  ttFlag.fill(0);
}

// MVV-LVA: value of the captured piece dominates, cheaper attackers first.
const VICTIM = [0, 1000, 20, 20, 45, 90, 45, 10];
const ATTACKER = [0, 5, 2, 2, 4, 8, 4, 1];

function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Stop extends Error {}

/**
 * One search. `step(sliceMs)` runs iterative-deepening iterations until the time budget is spent
 * (or, when sliced, until ~sliceMs has passed) and returns the result when finished, else null.
 */
export class Thinker {
  private pos: Position;
  private cfg: { timeMs: number; depth: number; noise: number; blunder: number };
  private rnd: () => number;
  private t0 = 0;
  private deadline = 0;
  private sliceEnd = Infinity;
  private pollMask = 2047;
  private nodes = 0;
  private depth = 0;
  private done: ThinkResult | null = null;
  private rootMoves: number[] = [];
  private rootScores: number[] = [];
  private best = 0;
  private bestScore = -INF;
  private killers = new Uint16Array(MAX_PLY * 2);
  private hist = new Int32Array(65536);
  private buf: number[][] = Array.from({ length: MAX_PLY + 8 }, () => []);
  private keys: Int32Array[] = Array.from({ length: MAX_PLY + 8 }, () => new Int32Array(160));
  private started = false;

  constructor(moves: readonly number[], opts: ThinkOptions, fen: string = START_FEN) {
    ensureTT();
    const p = new Position(fen);
    for (const m of moves) if (!p.play(m)) throw new Error('illegal move in history');
    this.pos = p;
    const base = LEVELS[opts.level] ?? LEVELS.club;
    this.cfg = { ...base, timeMs: opts.timeMs ?? base.timeMs, depth: opts.depth ?? base.depth };
    this.rnd = makeRandom(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
    // the opening book (only from the standard start)
    if (opts.book !== false && fen === START_FEN) {
      const cands = bookMoves(moves).filter((m) => p.isLegal(m));
      if (cands.length) {
        const m = cands[Math.floor(this.rnd() * cands.length)];
        this.done = { move: m, score: 0, depth: 0, nodes: 0, book: true, ms: 0 };
      }
    }
  }

  step(sliceMs = Infinity): ThinkResult | null {
    if (this.done) return this.done;
    const t = now();
    if (!this.started) {
      this.started = true;
      this.t0 = t;
      this.deadline = t + this.cfg.timeMs;
      this.rootMoves = this.pos.legalMoves();
      if (this.rootMoves.length === 0) {
        return (this.done = { move: 0, score: -MATE, depth: 0, nodes: 0, book: false, ms: 0 });
      }
      this.best = this.rootMoves[0];
      this.rootScores = this.rootMoves.map(() => -INF);
      if (this.rootMoves.length === 1) {
        return (this.done = { move: this.best, score: 0, depth: 1, nodes: 1, book: false, ms: 0 });
      }
      this.orderRoot();
    }
    if (t >= this.deadline) return this.finish();
    const sliced = sliceMs !== Infinity;
    this.sliceEnd = sliced ? t + sliceMs : Infinity;
    // poll the clock often enough that a slice overruns by a millisecond or two, not by a frame
    this.pollMask = sliced ? 255 : 2047;
    while (this.depth < this.cfg.depth) {
      const d = this.depth + 1;
      try {
        this.searchRoot(d);
      } catch (e) {
        if (!(e instanceof Stop)) throw e;
        // out of time: done. Out of slice: keep what this iteration found (best move first) and
        // search the same depth again next slice — the transposition table remembers every subtree
        // already finished, so the retry soon catches up with where this one stopped.
        if (now() >= this.deadline) return this.finish();
        this.promoteBest();
        return null;
      }
      this.depth = d;
      // a forced mate found: no need to look further
      if (Math.abs(this.bestScore) > WIN) break;
      const el = now() - this.t0;
      // another iteration costs several times the last one; don't start what can't finish
      if (el > this.cfg.timeMs * 0.45) break;
      if (now() >= this.sliceEnd) return null;
    }
    return this.finish();
  }

  /** After a cut-short iteration: search its best move first next time. */
  private promoteBest() {
    const i = this.rootMoves.indexOf(this.best);
    if (i <= 0) return;
    const m = this.rootMoves.splice(i, 1)[0], sc = this.rootScores.splice(i, 1)[0];
    this.rootMoves.unshift(m);
    this.rootScores.unshift(sc);
  }

  private finish(): ThinkResult {
    let move = this.best, score = this.bestScore;
    const { noise, blunder } = this.cfg;
    if (noise > 0 && Math.abs(score) < WIN) {
      // beginner: pick among the near-best, sometimes a clearly weaker move, never a losing-to-mate one
      const scored = this.rootMoves.map((m, i) => ({ m, s: this.rootScores[i] })).filter((x) => x.s > -WIN);
      if (scored.length) {
        const top = Math.max(...scored.map((x) => x.s));
        const margin = this.rnd() < blunder ? noise * 3 : noise;
        const pool = scored.filter((x) => x.s >= top - margin);
        let total = 0;
        const w = pool.map((x) => (total += 1 + (x.s - (top - margin)) / 20));
        const r = this.rnd() * total;
        const pick = pool[w.findIndex((c) => c >= r)] ?? pool[0];
        move = pick.m;
        score = pick.s;
      }
    }
    this.done = { move, score, depth: this.depth, nodes: this.nodes, book: false, ms: Math.round(now() - this.t0) };
    return this.done;
  }

  private orderRoot() {
    const p = this.pos;
    const sc = this.rootMoves.map((m) => {
      const cap = p.board[m >> 8];
      return cap ? VICTIM[cap & 7] * 16 - ATTACKER[p.board[m & 255] & 7] : 0;
    });
    const idx = this.rootMoves.map((_, i) => i).sort((a, b) => sc[b] - sc[a]);
    this.rootMoves = idx.map((i) => this.rootMoves[i]);
  }

  /** One iteration at the root; throws Stop when cut short (the best move so far is kept). */
  private searchRoot(depth: number): void {
    const p = this.pos;
    const full = this.cfg.noise > 0; // beginner wants an honest score for every move
    let alpha = -INF;
    const beta = INF;
    let bestIdx = -1;
    const scores = this.rootMoves.map(() => -INF);
    for (let i = 0; i < this.rootMoves.length; i++) {
      const m = this.rootMoves[i];
      p.make(m);
      const gives = p.inCheck();
      p.chk[p.ply] = gives;
      let v: number;
      try {
        if (i === 0 || full) v = -this.search(depth - 1, -beta, -alpha, 1, true);
        else {
          v = -this.search(depth - 1, -alpha - 1, -alpha, 1, true);
          if (v > alpha) v = -this.search(depth - 1, -beta, -alpha, 1, true);
        }
      } finally {
        p.undo();
      }
      scores[i] = v;
      if (v > alpha) {
        alpha = v;
        bestIdx = i;
        // a better move found in an unfinished iteration is still better than the old best
        this.best = m;
        this.bestScore = v;
      }
    }
    // stable reorder: best first, then by score (for the next iteration)
    const order = this.rootMoves.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    this.rootMoves = order.map((i) => this.rootMoves[i]);
    this.rootScores = order.map((i) => scores[i]);
    if (bestIdx >= 0) {
      this.best = this.rootMoves[0];
      this.bestScore = this.rootScores[0];
    }
  }

  private checkTime() {
    const t = now();
    // the recursion can't be paused, so either limit abandons the iteration in progress; step()
    // tells them apart (the deadline ends the search, the slice only this attempt at the depth)
    if (t >= this.deadline || t >= this.sliceEnd) throw new Stop();
  }

  private evaluate(): number {
    const p = this.pos;
    const s = p.side;
    return p.vl[s] - p.vl[s ^ 1] + 3;
  }

  /** Is null-move pruning safe for the side to move? (enough pieces that a pass never helps) */
  private nullOk(): boolean {
    return this.pos.vl[this.pos.side] > 400;
  }

  private search(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const p = this.pos;
    const inCheck = p.chk[p.ply];
    // repetition along the game + search path
    const rep = p.repetition(100);
    if (rep) {
      if (rep.oppChecks && !rep.selfChecks) return BAN - ply;
      if (rep.selfChecks && !rep.oppChecks) return -(BAN - ply);
      return 0;
    }
    if (p.quiet[p.ply] >= 120) return 0;
    // mate-distance pruning
    const mAlpha = -MATE + ply, mBeta = MATE - ply - 1;
    if (mAlpha > alpha) alpha = mAlpha;
    if (mBeta < beta) beta = mBeta;
    if (alpha >= beta) return alpha;
    if (inCheck) depth++;
    if (depth <= 0 || ply >= MAX_PLY) return this.quiesce(alpha, beta, ply);
    if ((++this.nodes & this.pollMask) === 0) this.checkTime();

    const pv = beta - alpha > 1;
    // transposition table
    const ti = p.lo & TT_MASK;
    let hashMove = 0;
    if (ttLock![ti] === p.hi && ttFlag[ti]) {
      hashMove = ttMove[ti];
      if (!pv && ttDepth[ti] >= depth) {
        let v = ttScore[ti];
        if (v > WIN) v -= ply;
        else if (v < -WIN) v += ply;
        const f = ttFlag[ti];
        if (f === EXACT || (f === LOWER && v >= beta) || (f === UPPER && v <= alpha)) return v;
      }
    }

    // null move
    if (allowNull && !pv && !inCheck && depth >= 3 && beta < WIN && this.nullOk() && this.evaluate() >= beta) {
      p.makeNull();
      let v: number;
      try {
        v = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
      } finally {
        p.undoNull();
      }
      if (v >= beta) return v > WIN ? beta : v;
    }

    // moves, ordered
    const moves = this.buf[ply];
    moves.length = 0;
    p.gen(moves);
    const n = moves.length;
    const keys = this.keys[ply].length >= n ? this.keys[ply] : (this.keys[ply] = new Int32Array(n * 2));
    const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    const b = p.board;
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      const cap = b[m >> 8];
      keys[i] = m === hashMove ? 1 << 30 : cap ? (1 << 28) + VICTIM[cap & 7] * 16 - ATTACKER[b[m & 255] & 7] : m === k1 ? 1 << 27 : m === k2 ? (1 << 27) - 1 : Math.min(this.hist[m], (1 << 26));
    }

    const side = p.side;
    let best = -INF, bestMove = 0, legal = 0;
    const alpha0 = alpha;
    for (let i = 0; i < n; i++) {
      // selection sort: bring the best remaining move forward
      let bi = i;
      for (let j = i + 1; j < n; j++) if (keys[j] > keys[bi]) bi = j;
      if (bi !== i) {
        const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
        const tk = keys[i]; keys[i] = keys[bi]; keys[bi] = tk;
      }
      const m = moves[i];
      const cap = b[m >> 8];
      p.make(m);
      if (p.inCheck(side)) {
        p.undo();
        continue;
      }
      legal++;
      const gives = p.inCheck();
      p.chk[p.ply] = gives;
      let v: number;
      try {
        if (legal === 1) v = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          let r = 0;
          if (depth >= 3 && !inCheck && !gives && !cap && m !== k1 && m !== k2 && legal > 3) r = legal > 10 && depth >= 5 ? 2 : 1;
          v = -this.search(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
          if (v > alpha && r) v = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (v > alpha && v < beta) v = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
        }
      } finally {
        p.undo();
      }
      if (v > best) {
        best = v;
        bestMove = m;
        if (v > alpha) {
          alpha = v;
          if (v >= beta) {
            if (!cap) {
              if (k1 !== m) {
                this.killers[ply * 2 + 1] = k1;
                this.killers[ply * 2] = m;
              }
              this.hist[m] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return -MATE + ply; // mated or stalemated: both lose in xiangqi

    // store (not path-dependent repetition verdicts)
    const ab = Math.abs(best);
    if (!(ab > WIN && ab < MATE - 200)) {
      let sv = best;
      if (sv > WIN) sv += ply;
      else if (sv < -WIN) sv -= ply;
      ttLock![ti] = p.hi;
      ttMove[ti] = bestMove;
      ttScore[ti] = sv;
      ttDepth[ti] = Math.min(127, depth);
      ttFlag[ti] = best >= beta ? LOWER : best <= alpha0 ? UPPER : EXACT;
    }
    return best;
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    const p = this.pos;
    if ((++this.nodes & this.pollMask) === 0) this.checkTime();
    const inCheck = p.chk[p.ply];
    const mAlpha = -MATE + ply;
    if (mAlpha >= beta) return mAlpha;
    let best = -INF;
    if (!inCheck) {
      const stand = this.evaluate();
      if (stand >= beta || ply >= MAX_PLY) return stand;
      best = stand;
      if (stand > alpha) alpha = stand;
    } else if (ply >= MAX_PLY) return this.evaluate();
    const moves = this.buf[ply];
    moves.length = 0;
    p.gen(moves, !inCheck);
    const n = moves.length;
    const keys = this.keys[ply].length >= n ? this.keys[ply] : (this.keys[ply] = new Int32Array(n * 2));
    const b = p.board;
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      const cap = b[m >> 8];
      keys[i] = cap ? (1 << 20) + VICTIM[cap & 7] * 16 - ATTACKER[b[m & 255] & 7] : this.hist[m] >> 8;
    }
    const side = p.side;
    let legal = 0;
    for (let i = 0; i < n; i++) {
      let bi = i;
      for (let j = i + 1; j < n; j++) if (keys[j] > keys[bi]) bi = j;
      if (bi !== i) {
        const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
        const tk = keys[i]; keys[i] = keys[bi]; keys[bi] = tk;
      }
      const m = moves[i];
      p.make(m);
      if (p.inCheck(side)) {
        p.undo();
        continue;
      }
      legal++;
      p.chk[p.ply] = p.inCheck();
      let v: number;
      try {
        v = -this.quiesce(-beta, -alpha, ply + 1);
      } finally {
        p.undo();
      }
      if (v > best) {
        best = v;
        if (v > alpha) {
          alpha = v;
          if (v >= beta) return v;
        }
      }
    }
    if (inCheck && legal === 0) return -MATE + ply;
    return best;
  }
}

/** Think synchronously to the end (tests, the worker). */
export function think(moves: readonly number[], opts: ThinkOptions, fen: string = START_FEN): ThinkResult {
  const t = new Thinker(moves, opts, fen);
  let r: ThinkResult | null;
  while (!(r = t.step())) { /* resume */ }
  return r;
}

/** Piece values, for the captured tray's ordering and the tests. */
export const PIECE_VALUE: Record<number, number> = { [KING]: 0, [ADVISOR]: 2, [BISHOP]: 2, [KNIGHT]: 4, [ROOK]: 9, [CANNON]: 4.5, [PAWN]: 1 };
