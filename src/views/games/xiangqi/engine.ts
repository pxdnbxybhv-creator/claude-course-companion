// 象棋 · Xiangqi rules — pure TS, no DOM. Used by the page, the AI (in a worker) and the tests.
//
// ── Board ────────────────────────────────────────────────────────────────────────────────────
// A 16×16 mailbox: square = (y + 3) * 16 + (x + 3), x = file 0..8 from the left as red sees it,
// y = row 0..9 from the top (black's back rank). The 3-square padding lets a knight's jump from any
// point land inside the array, so move generation only needs an IN_BOARD lookup.
// Red sits at the bottom (rows 5..9) and moves first.
//
// Piece code = side bit | type: red 8, black 16; 1 帅/将 king, 2 仕/士 advisor, 3 相/象 elephant,
// 4 马 horse, 5 车 chariot, 6 炮 cannon, 7 兵/卒 soldier. 0 = empty.
// A move is `from | to << 8`.
//
// ── Rules implemented ──────────────────────────────────────────────────────────────────────
// • every piece's movement, incl. the horse's leg (蹩马腿), the elephant's eye (塞象眼) and river,
//   the cannon's screen (炮架), soldiers turning sideways after the river, the palace;
// • a move may not leave one's own general attacked, and the two generals may not face each other
//   on an open file (飞将 / 白脸将);
// • a side with no legal move loses — checkmate (将死) and stalemate (困毙) alike;
// • repetition (simplified from the Chinese Xiangqi Association rules, which also cover 长捉
//   perpetual chasing — not implemented here): when a position occurs for the third time with the
//   same side to move, look at every move since its first occurrence. If all of one side's moves
//   gave check and the other side's did not, the checking side loses (长将判负). Otherwise the
//   game is drawn (三次重复 → 和);
// • 60 moves (120 plies) without a capture → draw (自然限着); neither side having any piece that
//   can cross the river (车马炮兵) → draw (无子可攻).

export type Side = 0 | 1;
export const RED: Side = 0;
export const BLACK: Side = 1;

export const KING = 1, ADVISOR = 2, BISHOP = 3, KNIGHT = 4, ROOK = 5, CANNON = 6, PAWN = 7;
export const RED_BIT = 8, BLACK_BIT = 16;

export const sideBit = (s: Side) => (s === RED ? RED_BIT : BLACK_BIT);
export const typeOf = (p: number) => p & 7;
export const sideOf = (p: number): Side => (p & RED_BIT ? RED : BLACK);

export const sq = (x: number, y: number) => ((y + 3) << 4) | (x + 3);
export const fileOf = (s: number) => (s & 15) - 3;
export const rowOf = (s: number) => (s >> 4) - 3;
export const moveOf = (from: number, to: number) => from | (to << 8);
export const src = (mv: number) => mv & 255;
export const dst = (mv: number) => mv >> 8;

export const IN_BOARD = new Uint8Array(256);
export const IN_PALACE = new Uint8Array(256);
/** HOME[side][sq] — the square is on that side's own half (an elephant may stand there). */
const HOME = [new Uint8Array(256), new Uint8Array(256)];
/** All 90 points, in reading order (top-left → bottom-right as red sees it). */
export const SQUARES: number[] = [];
for (let y = 0; y < 10; y++) {
  for (let x = 0; x < 9; x++) {
    const s = sq(x, y);
    IN_BOARD[s] = 1;
    SQUARES.push(s);
    if (x >= 3 && x <= 5 && (y <= 2 || y >= 7)) IN_PALACE[s] = 1;
    HOME[y >= 5 ? RED : BLACK][s] = 1;
  }
}

const ORTHO = [-16, 16, -1, 1];
const DIAG = [-17, -15, 15, 17];
/** Knight jumps grouped by the leg square (the orthogonal neighbour that must be empty). */
const KNIGHT_BY_LEG: [number, number, number][] = [
  [-16, -33, -31],
  [16, 31, 33],
  [-1, -18, 14],
  [1, -14, 18],
];
/** Pawn forward step per side. */
const FORWARD = [-16, 16];

// ── Zobrist keys (two 32-bit halves) ──────────────────────────────────────────────────────────
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}
/** index = piece code (8..23) * 256 + square */
export const Z_LO = new Int32Array(24 * 256);
export const Z_HI = new Int32Array(24 * 256);
{
  const r = mulberry(0x5eed_1a0);
  for (let i = 0; i < Z_LO.length; i++) {
    Z_LO[i] = r();
    Z_HI[i] = r();
  }
}
export const Z_SIDE_LO = 0x2f6b1c93 | 0, Z_SIDE_HI = 0x71d3a5e1 | 0;

// ── Piece-square values (material included), from red's point of view, row 0 = top ─────────────
// After the tables of 象眼 ElephantEye / XQWLight (the classic open-source xiangqi engines).
// prettier-ignore
const PST_RAW: Record<number, number[]> = {
  [KING]: [
    0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 2, 2, 2, 0, 0, 0,
    0, 0, 0, 11, 15, 11, 0, 0, 0,
  ],
  [ADVISOR]: [
    0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 20, 0, 20, 0, 0, 0,
    0, 0, 0, 0, 23, 0, 0, 0, 0,
    0, 0, 0, 20, 0, 20, 0, 0, 0,
  ],
  [BISHOP]: [
    0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 20, 0, 0, 0, 20, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    18, 0, 0, 0, 23, 0, 0, 0, 18,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 20, 0, 0, 0, 20, 0, 0,
  ],
  [KNIGHT]: [
    90, 90, 90, 96, 90, 96, 90, 90, 90,
    90, 96, 103, 97, 94, 97, 103, 96, 90,
    92, 98, 99, 103, 99, 103, 99, 98, 92,
    93, 108, 100, 107, 100, 107, 100, 108, 93,
    90, 100, 99, 103, 104, 103, 99, 100, 90,
    90, 98, 101, 102, 103, 102, 101, 98, 90,
    92, 94, 98, 95, 98, 95, 98, 94, 92,
    93, 92, 94, 95, 92, 95, 94, 92, 93,
    85, 90, 92, 93, 78, 93, 92, 90, 85,
    88, 85, 90, 88, 90, 88, 90, 85, 88,
  ],
  [ROOK]: [
    206, 208, 207, 213, 214, 213, 207, 208, 206,
    206, 212, 209, 216, 233, 216, 209, 212, 206,
    206, 208, 207, 214, 216, 214, 207, 208, 206,
    206, 213, 213, 216, 216, 216, 213, 213, 206,
    208, 211, 211, 214, 215, 214, 211, 211, 208,
    208, 212, 212, 214, 215, 214, 212, 212, 208,
    204, 209, 204, 212, 214, 212, 204, 209, 204,
    198, 208, 204, 212, 212, 212, 204, 208, 198,
    200, 208, 206, 212, 200, 212, 206, 208, 200,
    194, 206, 204, 212, 200, 212, 204, 206, 194,
  ],
  [CANNON]: [
    100, 100, 96, 91, 90, 91, 96, 100, 100,
    98, 98, 96, 92, 89, 92, 96, 98, 98,
    97, 97, 96, 91, 92, 91, 96, 97, 97,
    96, 99, 99, 98, 100, 98, 99, 99, 96,
    96, 96, 96, 96, 100, 96, 96, 96, 96,
    95, 96, 99, 96, 100, 96, 99, 96, 95,
    96, 96, 96, 96, 96, 96, 96, 96, 96,
    97, 96, 100, 99, 101, 99, 100, 96, 97,
    96, 97, 98, 98, 98, 98, 98, 97, 96,
    96, 96, 97, 99, 99, 99, 97, 96, 96,
  ],
  [PAWN]: [
    9, 9, 9, 11, 13, 11, 9, 9, 9,
    19, 24, 34, 42, 44, 42, 34, 24, 19,
    19, 24, 32, 37, 37, 37, 32, 24, 19,
    19, 23, 27, 29, 30, 29, 27, 23, 19,
    14, 18, 20, 27, 29, 27, 20, 18, 14,
    7, 0, 13, 0, 16, 0, 13, 0, 7,
    7, 0, 7, 0, 15, 0, 7, 0, 7,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
};
/** PST[piece code * 256 + sq] — the value of that piece on that square for its own side. */
export const PST = new Int16Array(24 * 256);
for (let t = KING; t <= PAWN; t++) {
  const tab = PST_RAW[t];
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 9; x++) {
      const v = tab[y * 9 + x];
      PST[((RED_BIT | t) << 8) | sq(x, y)] = v;
      PST[((BLACK_BIT | t) << 8) | sq(x, 9 - y)] = v;
    }
}

export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const FEN_TYPE: Record<string, number> = { k: KING, a: ADVISOR, b: BISHOP, e: BISHOP, n: KNIGHT, h: KNIGHT, r: ROOK, c: CANNON, p: PAWN };
const TYPE_FEN = ' kabnrcp';

/** Result of a finished game. */
export interface Outcome {
  /** the winning side, or null for a draw */
  winner: Side | null;
  reason: 'mate' | 'stalemate' | 'perpetual' | 'repetition' | 'rule60' | 'material';
}

/**
 * A position plus the history needed to undo moves and detect repetition.
 * Kept incrementally: Zobrist key, both kings' squares, each side's piece-square total.
 */
export class Position {
  board = new Uint8Array(256);
  side: Side = RED;
  kings: [number, number] = [0, 0];
  lo = 0;
  hi = 0;
  /** material + placement for red / black (each from its own point of view) */
  vl: [number, number] = [0, 0];
  // history, index i = the position after i moves (index 0 = the root of this object)
  private movesH: number[] = [];
  private capsH: number[] = [];
  /** keys of every position so far, lo halves (index = ply) */
  keysLo: number[] = [];
  keysHi: number[] = [];
  /** chk[i]: the side to move in position i is in check (i.e. move i gave check) */
  chk: boolean[] = [];
  /** plies since the last capture, per position */
  quiet: number[] = [];
  /** the FEN's move number, and whether black was to move, when this object was loaded */
  private baseMove = 1;
  private baseBlack = false;

  constructor(fen: string = START_FEN) {
    this.load(fen);
  }

  load(fen: string): void {
    const b = this.board;
    b.fill(0);
    this.kings = [0, 0];
    this.vl = [0, 0];
    this.lo = this.hi = 0;
    const parts = fen.trim().split(/\s+/);
    const rows = (parts[0] ?? '').split('/');
    if (rows.length !== 10) throw new Error('bad fen: ' + fen);
    for (let y = 0; y < 10; y++) {
      let x = 0;
      for (const ch of rows[y]) {
        if (ch >= '1' && ch <= '9') {
          x += +ch;
          continue;
        }
        const t = FEN_TYPE[ch.toLowerCase()];
        if (!t || x > 8) throw new Error('bad fen: ' + fen);
        const p = (ch === ch.toUpperCase() ? RED_BIT : BLACK_BIT) | t;
        this.put(sq(x, y), p);
        x++;
      }
      if (x !== 9) throw new Error('bad fen row: ' + rows[y]);
    }
    this.side = parts[1] === 'b' ? BLACK : RED;
    if (this.side === BLACK) {
      this.lo ^= Z_SIDE_LO;
      this.hi ^= Z_SIDE_HI;
    }
    this.movesH = [0];
    this.capsH = [0];
    this.keysLo = [this.lo];
    this.keysHi = [this.hi];
    this.chk = [false];
    const q = Number(parts[4]);
    this.quiet = [Number.isFinite(q) && q >= 0 ? q : 0];
    const mn = Number(parts[5]);
    this.baseMove = Number.isInteger(mn) && mn >= 1 ? mn : 1;
    this.baseBlack = this.side === BLACK;
    this.chk[0] = this.inCheck();
  }

  private put(s: number, p: number) {
    this.board[s] = p;
    const i = (p << 8) | s;
    this.lo ^= Z_LO[i];
    this.hi ^= Z_HI[i];
    this.vl[p & RED_BIT ? 0 : 1] += PST[i];
    if ((p & 7) === KING) this.kings[p & RED_BIT ? 0 : 1] = s;
  }
  private take(s: number) {
    const p = this.board[s];
    this.board[s] = 0;
    const i = (p << 8) | s;
    this.lo ^= Z_LO[i];
    this.hi ^= Z_HI[i];
    this.vl[p & RED_BIT ? 0 : 1] -= PST[i];
  }

  fen(): string {
    const rows: string[] = [];
    for (let y = 0; y < 10; y++) {
      let row = '', gap = 0;
      for (let x = 0; x < 9; x++) {
        const p = this.board[sq(x, y)];
        if (!p) { gap++; continue; }
        if (gap) { row += gap; gap = 0; }
        const c = TYPE_FEN[p & 7];
        row += p & RED_BIT ? c.toUpperCase() : c;
      }
      if (gap) row += gap;
      rows.push(row);
    }
    const n = this.ply;
    const move = this.baseMove + ((n + (this.baseBlack ? 1 : 0)) >> 1);
    return `${rows.join('/')} ${this.side === RED ? 'w' : 'b'} - - ${this.quiet[n]} ${move}`;
  }

  /** Number of moves played on this object. */
  get ply(): number {
    return this.movesH.length - 1;
  }
  /** The moves played on this object, oldest first. */
  history(): number[] {
    return this.movesH.slice(1);
  }
  lastMove(): number {
    return this.movesH[this.movesH.length - 1];
  }
  lastCapture(): number {
    return this.capsH[this.capsH.length - 1];
  }
  /** Piece codes captured so far, in order. */
  captures(): number[] {
    return this.capsH.slice(1).filter((c) => c > 0);
  }

  /** Plays a move (assumed pseudo-legal). Always pair with undo(). */
  make(mv: number): void {
    const from = mv & 255, to = mv >> 8;
    const cap = this.board[to];
    const p = this.board[from];
    if (cap) this.take(to);
    this.take(from);
    this.put(to, p);
    this.side = (this.side ^ 1) as Side;
    this.lo ^= Z_SIDE_LO;
    this.hi ^= Z_SIDE_HI;
    const n = this.movesH.length;
    this.movesH.push(mv);
    this.capsH.push(cap);
    this.keysLo.push(this.lo);
    this.keysHi.push(this.hi);
    this.chk.push(false); // filled in by the caller that needs it (see play / search)
    this.quiet.push(cap ? 0 : this.quiet[n - 1] + 1);
  }

  undo(): void {
    const mv = this.movesH.pop()!;
    const cap = this.capsH.pop()!;
    this.keysLo.pop();
    this.keysHi.pop();
    this.chk.pop();
    this.quiet.pop();
    const from = mv & 255, to = mv >> 8;
    const p = this.board[to];
    this.side = (this.side ^ 1) as Side;
    this.lo ^= Z_SIDE_LO;
    this.hi ^= Z_SIDE_HI;
    this.take(to);
    this.put(from, p);
    if (cap) this.put(to, cap);
  }

  /** A pass (for null-move pruning in the search). */
  makeNull(): void {
    this.side = (this.side ^ 1) as Side;
    this.lo ^= Z_SIDE_LO;
    this.hi ^= Z_SIDE_HI;
    const n = this.movesH.length;
    this.movesH.push(0);
    this.capsH.push(0);
    this.keysLo.push(this.lo);
    this.keysHi.push(this.hi);
    this.chk.push(false);
    this.quiet.push(this.quiet[n - 1]);
  }
  undoNull(): void {
    this.movesH.pop();
    this.capsH.pop();
    this.keysLo.pop();
    this.keysHi.pop();
    this.chk.pop();
    this.quiet.pop();
    this.side = (this.side ^ 1) as Side;
    this.lo ^= Z_SIDE_LO;
    this.hi ^= Z_SIDE_HI;
  }

  /** Is `side`'s general attacked (or facing the other general on an open file)? */
  inCheck(side: Side = this.side): boolean {
    const b = this.board;
    const k = this.kings[side];
    if (!k) return false;
    const opp = side === RED ? BLACK_BIT : RED_BIT;
    // soldiers: from the front, and from the sides (an enemy soldier beside our palace has crossed)
    const pawn = opp | PAWN;
    if (b[k + FORWARD[side]] === pawn || b[k - 1] === pawn || b[k + 1] === pawn) return true;
    // horses: each leg is a diagonal neighbour of the general
    const horse = opp | KNIGHT;
    for (let i = 0; i < 4; i++) {
      const d = DIAG[i];
      if (b[k + d]) continue;
      const ex = d === -17 || d === 15 ? -1 : 1;
      const ey = d < 0 ? -16 : 16;
      if (b[k + 2 * ex + ey] === horse || b[k + ex + 2 * ey] === horse) return true;
    }
    // chariots, the other general (flying general), cannons
    const rook = opp | ROOK, king = opp | KING, cannon = opp | CANNON;
    for (let i = 0; i < 4; i++) {
      const d = ORTHO[i];
      let s = k + d;
      while (IN_BOARD[s] && !b[s]) s += d;
      if (!IN_BOARD[s]) continue;
      const p = b[s];
      if (p === rook || p === king) return true;
      s += d;
      while (IN_BOARD[s] && !b[s]) s += d;
      if (IN_BOARD[s] && b[s] === cannon) return true;
    }
    return false;
  }

  /**
   * Pseudo-legal moves for the side to move (may leave the general in check). With `capturesOnly`
   * only captures. Appends to `out` and returns the count added.
   */
  gen(out: number[], capturesOnly = false): number {
    const b = this.board;
    const side = this.side;
    const self = sideBit(side);
    const opp = self ^ (RED_BIT | BLACK_BIT);
    const start = out.length;
    const add = (from: number, to: number) => {
      const t = b[to];
      if (t & self) return;
      if (capturesOnly && !t) return;
      out.push(from | (to << 8));
    };
    for (let i = 0; i < 90; i++) {
      const s = SQUARES[i];
      const p = b[s];
      if (!(p & self)) continue;
      switch (p & 7) {
        case KING:
          for (let j = 0; j < 4; j++) {
            const t = s + ORTHO[j];
            if (IN_PALACE[t]) add(s, t);
          }
          break;
        case ADVISOR:
          for (let j = 0; j < 4; j++) {
            const t = s + DIAG[j];
            if (IN_PALACE[t]) add(s, t);
          }
          break;
        case BISHOP:
          for (let j = 0; j < 4; j++) {
            const eye = s + DIAG[j];
            const t = eye + DIAG[j];
            if (IN_BOARD[t] && HOME[side][t] && !b[eye]) add(s, t);
          }
          break;
        case KNIGHT:
          for (let j = 0; j < 4; j++) {
            const [leg, a, c] = KNIGHT_BY_LEG[j];
            if (b[s + leg]) continue;
            if (IN_BOARD[s + a]) add(s, s + a);
            if (IN_BOARD[s + c]) add(s, s + c);
          }
          break;
        case ROOK:
          for (let j = 0; j < 4; j++) {
            const d = ORTHO[j];
            let t = s + d;
            while (IN_BOARD[t]) {
              const q = b[t];
              if (q) {
                if (q & opp) out.push(s | (t << 8));
                break;
              }
              if (!capturesOnly) out.push(s | (t << 8));
              t += d;
            }
          }
          break;
        case CANNON:
          for (let j = 0; j < 4; j++) {
            const d = ORTHO[j];
            let t = s + d;
            while (IN_BOARD[t] && !b[t]) {
              if (!capturesOnly) out.push(s | (t << 8));
              t += d;
            }
            if (!IN_BOARD[t]) continue;
            t += d; // jump the screen
            while (IN_BOARD[t] && !b[t]) t += d;
            if (IN_BOARD[t] && b[t] & opp) out.push(s | (t << 8));
          }
          break;
        case PAWN: {
          const f = s + FORWARD[side];
          if (IN_BOARD[f]) add(s, f);
          if (!HOME[side][s]) {
            if (IN_BOARD[s - 1]) add(s, s - 1);
            if (IN_BOARD[s + 1]) add(s, s + 1);
          }
          break;
        }
      }
    }
    return out.length - start;
  }

  /** Does the move leave the mover's own general safe? (the move must be pseudo-legal) */
  isLegalPseudo(mv: number): boolean {
    const side = this.side;
    this.make(mv);
    const ok = !this.inCheck(side);
    this.undo();
    return ok;
  }

  legalMoves(): number[] {
    const out: number[] = [];
    this.gen(out);
    return out.filter((m) => this.isLegalPseudo(m));
  }

  /** Legal destinations of the piece on `from` (for the board UI). */
  targetsFrom(from: number): number[] {
    return this.legalMoves().filter((m) => (m & 255) === from).map((m) => m >> 8);
  }

  isLegal(mv: number): boolean {
    const from = mv & 255, to = mv >> 8;
    if (!IN_BOARD[from] || !IN_BOARD[to]) return false;
    if (!(this.board[from] & sideBit(this.side))) return false;
    return this.legalMoves().includes(mv);
  }

  /** Plays a legal move with full bookkeeping (check flag for repetition rules). Returns false if illegal. */
  play(mv: number): boolean {
    if (!this.isLegal(mv)) return false;
    this.make(mv);
    this.chk[this.chk.length - 1] = this.inCheck();
    return true;
  }

  /** Does either side still have a piece that can cross the river (车马炮兵)? */
  hasAttackers(): boolean {
    for (let i = 0; i < 90; i++) {
      const t = this.board[SQUARES[i]] & 7;
      if (t === ROOK || t === KNIGHT || t === CANNON || t === PAWN) return true;
    }
    return false;
  }

  /**
   * Scans back for an earlier occurrence of the current position (same side to move), stopping at
   * the last capture. Returns null if none, else how many times the position occurred before and,
   * over the span since the earliest one, whether every move of the side to move (`selfChecks`)
   * and of the other side (`oppChecks`) gave check.
   */
  repetition(maxBack = 1 << 30): { count: number; selfChecks: boolean; oppChecks: boolean } | null {
    const n = this.movesH.length - 1;
    const lo = this.keysLo[n], hi = this.keysHi[n];
    let count = 0;
    let opp = true, self = true;
    let spanOpp = true, spanSelf = true;
    for (let j = n, back = 0; j >= 1 && back < maxBack; j--, back++) {
      if ((n - j) % 2 === 0) opp = opp && this.chk[j];
      else self = self && this.chk[j];
      if (this.capsH[j] || !this.movesH[j]) break; // a capture (or a null move) cuts the chain
      const p = j - 1;
      if ((n - p) % 2 === 0 && this.keysLo[p] === lo && this.keysHi[p] === hi) {
        count++;
        spanOpp = opp;
        spanSelf = self;
      }
    }
    return count ? { count, selfChecks: spanSelf, oppChecks: spanOpp } : null;
  }

  /** The game result for the position as it stands, or null while the game goes on. */
  outcome(): Outcome | null {
    if (this.legalMoves().length === 0) {
      return { winner: (this.side ^ 1) as Side, reason: this.inCheck() ? 'mate' : 'stalemate' };
    }
    const rep = this.repetition();
    if (rep && rep.count >= 2) {
      // side to move = S; "opp" moved last
      if (rep.oppChecks && !rep.selfChecks) return { winner: this.side, reason: 'perpetual' };
      if (rep.selfChecks && !rep.oppChecks) return { winner: (this.side ^ 1) as Side, reason: 'perpetual' };
      return { winner: null, reason: 'repetition' };
    }
    if (this.quiet[this.ply] >= 120) return { winner: null, reason: 'rule60' };
    if (!this.hasAttackers()) return { winner: null, reason: 'material' };
    return null;
  }
}

/** Replays `moves` from `fen`; returns null if any move is illegal. */
export function replay(moves: readonly number[], fen = START_FEN): Position | null {
  let p: Position;
  try {
    p = new Position(fen);
  } catch {
    return null;
  }
  for (const m of moves) {
    if (typeof m !== 'number' || !p.play(m)) return null;
  }
  return p;
}

/** Counts leaf nodes of the legal move tree (the standard move-generator test). */
export function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves: number[] = [];
  p.gen(moves);
  let n = 0;
  const side = p.side;
  for (const m of moves) {
    p.make(m);
    if (!p.inCheck(side)) n += depth === 1 ? 1 : perft(p, depth - 1);
    p.undo();
  }
  return n;
}

// ── notation ───────────────────────────────────────────────────────────────────────────────────

/** ICCS coordinates, e.g. "h2e2" (files a–i from red's left, ranks 0–9 from red's side). */
export function iccs(mv: number): string {
  const f = mv & 255, t = mv >> 8;
  const c = (s: number) => String.fromCharCode(97 + fileOf(s)) + (9 - rowOf(s));
  return c(f) + c(t);
}
export function parseIccs(s: string): number {
  const m = /^([a-i])([0-9])-?([a-i])([0-9])$/i.exec(s.trim());
  if (!m) return 0;
  const f = sq(m[1].toLowerCase().charCodeAt(0) - 97, 9 - +m[2]);
  const t = sq(m[3].toLowerCase().charCodeAt(0) - 97, 9 - +m[4]);
  return f | (t << 8);
}

const NAMES_ZH = [
  ['', '帅', '仕', '相', '马', '车', '炮', '兵'],
  ['', '将', '士', '象', '马', '车', '炮', '卒'],
];
const NAMES_EN = ['', 'General', 'Advisor', 'Elephant', 'Horse', 'Chariot', 'Cannon', 'Soldier'];
const LETTER_EN = ' KABNRCP';
export const pieceChar = (p: number) => NAMES_ZH[sideOf(p)][p & 7];
export const pieceNameEn = (p: number) => NAMES_EN[p & 7];

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const FW_NUM = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];

/**
 * Traditional notation for a legal move in position `p` (before it is played), e.g. 炮二平五,
 * 马８进７, 前车进一. In English, WXF style: C2.5, H8+7, +R.8.
 */
export function notation(p: Position, mv: number, lang: 'zh' | 'en' = 'zh'): string {
  const from = mv & 255, to = mv >> 8;
  const piece = p.board[from];
  if (!piece) return iccs(mv);
  const side = sideOf(piece), type = piece & 7;
  const zh = lang === 'zh';
  const fileNo = (s: number) => (side === RED ? 9 - fileOf(s) : fileOf(s) + 1);
  const num = (n: number) => (zh ? (side === RED ? CN_NUM[n] : FW_NUM[n]) : String(n));
  // same pieces on this file, front (toward the enemy) first
  const x = fileOf(from);
  const same: number[] = [];
  for (let y = 0; y < 10; y++) if (p.board[sq(x, y)] === piece) same.push(sq(x, y));
  if (side === BLACK) same.reverse();
  let head: string;
  const name = zh ? NAMES_ZH[side][type] : LETTER_EN[type];
  if (same.length >= 2 && type !== ADVISOR && type !== BISHOP) {
    const i = same.indexOf(from);
    let tag: string;
    if (same.length === 2) tag = zh ? (i === 0 ? '前' : '后') : i === 0 ? '+' : '-';
    else if (same.length === 3) tag = zh ? ['前', '中', '后'][i] : ['+', '.', '-'][i];
    else tag = zh ? CN_NUM[i + 1] : String(i + 1);
    head = zh ? tag + name : tag + name;
  } else head = name + num(fileNo(from));
  const dy = rowOf(to) - rowOf(from);
  const fwd = side === RED ? -dy : dy;
  let act: string, n: number;
  if (dy === 0) {
    act = zh ? '平' : '.';
    n = fileNo(to);
  } else {
    act = fwd > 0 ? (zh ? '进' : '+') : zh ? '退' : '-';
    n = type === KNIGHT || type === ADVISOR || type === BISHOP ? fileNo(to) : Math.abs(dy);
  }
  return head + act + num(n);
}
