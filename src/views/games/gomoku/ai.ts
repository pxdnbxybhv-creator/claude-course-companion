// 五子棋 AI — pure TS, no DOM; runs in a Web Worker (ai.worker.ts) or, sliced, on the main thread.
//
// ── Patterns ─────────────────────────────────────────────────────────────────────────────────
// For every empty point and each of the 4 lines through it we keep a 16-bit key: the 8 neighbours
// (±4 along the line), 2 bits each (empty / black / white / wall). A 64 K-entry table, solved once
// by a small memoised recursion, answers "if this colour played here, what would it make on this
// line?" — FIVE, FLEX4 (two ways to five: 活四), BLOCK4 (冲四), FLEX3 (活三), BLOCK3 (眠三),
// FLEX2, BLOCK2, … Keys and per-point patterns are updated incrementally: a stone touches 32 keys.
// Counting patterns over empty points gives both the static evaluation and O(1) threat tests
// ("does the side to move have a five point? a flex-four point?").
//
// ── Search ───────────────────────────────────────────────────────────────────────────────────
// Iterative-deepening PVS negamax with alpha-beta and a Zobrist transposition table.
//   · take a win; block a four (forced replies don't cost depth, so four-chains read deep);
//   · a flex-four point (or a double four) is a win in 3;
//   · facing an open three, only fours and moves on the three's line are considered;
//   · otherwise moves within 2 of a stone, ordered threat-first (attack + defence of each point),
//     beam-limited per level.
// Club and Master first look for a VCF (连续冲四胜: victory by continuous fours); Master also
// checks its chosen move against the opponent's VCF and sidesteps it when it can.
import { CELLS, N, BLACK, DIRS, colorOfMove, other, type Color, idx, colOf, rowOf, onBoard } from './engine';
import { makeRng, type Rng } from '../../../core/rng';

export type Level = 'beginner' | 'club' | 'master';

// Line patterns (what a stone placed here would make on one line).
export const DEAD = 0, B1 = 1, F1 = 2, B2 = 3, F2 = 4, B3 = 5, F3 = 6, B4 = 7, F4 = 8, FIVE = 9;

const OFF = [-4, -3, -2, -1, 1, 2, 3, 4];

function buildPatterns(): [Uint8Array, Uint8Array] {
  const T = new Uint8Array(65536);
  const done = new Uint8Array(65536);
  const POS = [0, 1, 2, 3, 5, 6, 7, 8]; // key field → window position (centre = 4)
  // best child pattern → this pattern (one stone short of it)
  const DOWN = [B1, B1, B1, B1, F1, B2, F2, B3, F3, F4];
  const w = new Int8Array(9);
  const solve = (key: number): number => {
    if (done[key]) return T[key];
    w[4] = 1;
    for (let j = 0; j < 8; j++) w[POS[j]] = (key >> (2 * j)) & 3;
    let l = 4;
    while (l > 0 && w[l - 1] === 1) l--;
    let r = 4;
    while (r < 8 && w[r + 1] === 1) r++;
    let res: number;
    if (r - l + 1 >= 5) res = FIVE;
    else {
      let room = false;
      for (let s = 0; s <= 4 && !room; s++) {
        let ok = true;
        for (let t = s; t < s + 5; t++) if (w[t] >= 2) { ok = false; break; }
        room = ok;
      }
      if (!room) res = DEAD;
      else {
        let wins = 0, mx = DEAD;
        for (let j = 0; j < 8; j++) {
          if (((key >> (2 * j)) & 3) !== 0) continue;
          const c = solve(key | (1 << (2 * j)));
          if (c === FIVE) wins++;
          else if (c > mx) mx = c;
        }
        res = wins >= 2 ? F4 : wins === 1 ? B4 : DOWN[mx];
      }
    }
    done[key] = 1;
    T[key] = res;
    return res;
  };
  for (let k = 0; k < 65536; k++) solve(k);
  const TW = new Uint8Array(65536);
  for (let k = 0; k < 65536; k++) {
    let s = 0;
    for (let j = 0; j < 8; j++) {
      const c = (k >> (2 * j)) & 3;
      s |= (c === 1 ? 2 : c === 2 ? 1 : c) << (2 * j);
    }
    TW[k] = T[s];
  }
  return [T, TW];
}

// Point classes (all four lines together).
const C_NONE = 0, C_F3 = 1, C_B4 = 2, C_33 = 3, C_43 = 4, C_F4 = 5, C_FIVE = 6;
/** Move-ordering value of one line pattern. */
const PW = [0, 1, 5, 8, 60, 70, 900, 1100, 0, 0];
/** Evaluation weight of one (empty point, line) pattern. */
const EW = [0, 1, 3, 4, 14, 16, 70, 80, 420, 2000];

let tables: { PB: Uint8Array; PWt: Uint8Array; CSCORE: Int32Array; CCLASS: Uint8Array; CMAX: Uint8Array; NB: Int16Array; R2: Int16Array[]; ZA: Int32Array; ZB: Int32Array } | null = null;

function T() {
  if (tables) return tables;
  const [PB, PWt] = buildPatterns();
  const CSCORE = new Int32Array(10000), CCLASS = new Uint8Array(10000), CMAX = new Uint8Array(10000);
  const n = new Int32Array(10);
  for (let k = 0; k < 10000; k++) {
    n.fill(0);
    const ps = [(k / 1000) | 0, ((k / 100) | 0) % 10, ((k / 10) | 0) % 10, k % 10];
    let mx = 0;
    for (const p of ps) { n[p]++; if (p > mx) mx = p; }
    CMAX[k] = mx;
    let cls = 0, sc = 0;
    if (n[FIVE]) { cls = C_FIVE; sc = 10_000_000; }
    else if (n[F4] || n[B4] >= 2) { cls = C_F4; sc = 1_000_000; }
    else if (n[B4] && n[F3]) { cls = C_43; sc = 100_000; }
    else if (n[F3] >= 2) { cls = C_33; sc = 20_000; }
    else {
      cls = n[B4] ? C_B4 : n[F3] ? C_F3 : C_NONE;
      for (const p of ps) sc += PW[p];
      if (n[F3] + n[B3] + n[F2] >= 2 && (n[F3] || n[B4])) sc += 500;
      else if (n[B3] + n[F2] >= 2) sc += 120;
      if (n[B4] && (n[B3] || n[F2])) sc += 300;
    }
    CSCORE[k] = sc;
    CCLASS[k] = cls;
  }
  // neighbour table: NB[(c*4+d)*8+j] = cell at c + OFF[j]*dir, or -1
  const NB = new Int16Array(CELLS * 32).fill(-1);
  for (let c = 0; c < CELLS; c++) {
    const x = colOf(c), y = rowOf(c);
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      for (let j = 0; j < 8; j++) {
        const nx = x + OFF[j] * dx, ny = y + OFF[j] * dy;
        if (onBoard(nx, ny)) NB[(c * 4 + d) * 8 + j] = idx(nx, ny);
      }
    }
  }
  const R2: Int16Array[] = [];
  for (let c = 0; c < CELLS; c++) {
    const list: number[] = [];
    const x = colOf(c), y = rowOf(c);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dy) && onBoard(x + dx, y + dy)) list.push(idx(x + dx, y + dy));
    }
    R2.push(Int16Array.from(list));
  }
  const zr = makeRng(0x60b0c0);
  const ZA = new Int32Array(CELLS * 3), ZB = new Int32Array(CELLS * 3);
  for (let i = 0; i < ZA.length; i++) {
    ZA[i] = (zr() * 4294967296) | 0;
    ZB[i] = (zr() * 4294967296) | 0;
  }
  tables = { PB, PWt, CSCORE, CCLASS, CMAX, NB, R2, ZA, ZB };
  return tables;
}

/** Warm the tables (≈ 30 ms) — call early in the worker so the first move is snappy. */
export function warmUp(): void {
  T();
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Incremental position

export class Pos {
  readonly board = new Uint8Array(CELLS);
  /** Line keys, black perspective, per (cell, dir). */
  private key = new Uint16Array(CELLS * 4);
  /** pat[c][cell*4+dir] — pattern colour c would make by playing there. */
  readonly pat: [Uint8Array, Uint8Array, Uint8Array];
  /** cnt[c][pattern] over empty points and lines. */
  readonly cnt: [Int32Array, Int32Array, Int32Array];
  readonly near = new Uint8Array(CELLS);
  hA = 0;
  hB = 0;
  stones = 0;
  private t = T();

  constructor(moves: readonly number[] = []) {
    const t = this.t;
    this.pat = [new Uint8Array(0), new Uint8Array(CELLS * 4), new Uint8Array(CELLS * 4)];
    this.cnt = [new Int32Array(10), new Int32Array(10), new Int32Array(10)];
    for (let c = 0; c < CELLS; c++) {
      for (let d = 0; d < 4; d++) {
        let k = 0;
        for (let j = 0; j < 8; j++) if (t.NB[(c * 4 + d) * 8 + j] < 0) k |= 3 << (2 * j);
        const i = c * 4 + d;
        this.key[i] = k;
        const pb = t.PB[k], pw = t.PWt[k];
        this.pat[1][i] = pb;
        this.pat[2][i] = pw;
        this.cnt[1][pb]++;
        this.cnt[2][pw]++;
      }
    }
    moves.forEach((m, i) => this.place(m, colorOfMove(i)));
  }

  get side(): Color {
    return colorOfMove(this.stones);
  }

  place(c: number, col: Color): void {
    const { NB, PB, PWt, R2, ZA, ZB } = this.t;
    const p1 = this.pat[1], p2 = this.pat[2], c1 = this.cnt[1], c2 = this.cnt[2];
    const b = this.board, key = this.key;
    for (let d = 0; d < 4; d++) {
      c1[p1[c * 4 + d]]--;
      c2[p2[c * 4 + d]]--;
    }
    b[c] = col;
    for (let d = 0; d < 4; d++) {
      const base = (c * 4 + d) * 8;
      for (let j = 0; j < 8; j++) {
        const n = NB[base + j];
        if (n < 0) continue;
        const sh = 2 * (7 - j);
        const i = n * 4 + d;
        const k = (key[i] & ~(3 << sh)) | (col << sh);
        key[i] = k;
        const pb = PB[k], pw = PWt[k];
        if (b[n] === 0) {
          c1[p1[i]]--; c1[pb]++;
          c2[p2[i]]--; c2[pw]++;
        }
        p1[i] = pb;
        p2[i] = pw;
      }
    }
    const r = R2[c];
    for (let i = 0; i < r.length; i++) this.near[r[i]]++;
    this.hA ^= ZA[c * 3 + col];
    this.hB ^= ZB[c * 3 + col];
    this.stones++;
  }

  remove(c: number): void {
    const { NB, PB, PWt, R2, ZA, ZB } = this.t;
    const p1 = this.pat[1], p2 = this.pat[2], c1 = this.cnt[1], c2 = this.cnt[2];
    const b = this.board, key = this.key;
    const col = b[c];
    b[c] = 0;
    for (let d = 0; d < 4; d++) {
      const base = (c * 4 + d) * 8;
      for (let j = 0; j < 8; j++) {
        const n = NB[base + j];
        if (n < 0) continue;
        const sh = 2 * (7 - j);
        const i = n * 4 + d;
        const k = key[i] & ~(3 << sh);
        key[i] = k;
        const pb = PB[k], pw = PWt[k];
        if (b[n] === 0) {
          c1[p1[i]]--; c1[pb]++;
          c2[p2[i]]--; c2[pw]++;
        }
        p1[i] = pb;
        p2[i] = pw;
      }
    }
    for (let d = 0; d < 4; d++) {
      c1[p1[c * 4 + d]]++;
      c2[p2[c * 4 + d]]++;
    }
    const r = R2[c];
    for (let i = 0; i < r.length; i++) this.near[r[i]]--;
    this.hA ^= ZA[c * 3 + col];
    this.hB ^= ZB[c * 3 + col];
    this.stones--;
  }

  /** Combined 4-line pattern index of point c for colour col (into CSCORE / CCLASS / CMAX). */
  combo(c: number, col: Color): number {
    const p = this.pat[col], i = c * 4;
    return ((p[i] * 10 + p[i + 1]) * 10 + p[i + 2]) * 10 + p[i + 3];
  }

  /** Empty points where `col` would make five (distinct). */
  fivePoints(col: Color, limit = 3): number[] {
    const out: number[] = [];
    if (this.cnt[col][FIVE] === 0) return out;
    const p = this.pat[col], b = this.board, nr = this.near;
    for (let c = 0; c < CELLS; c++) {
      if (b[c] || !nr[c]) continue;
      const i = c * 4;
      if (p[i] === FIVE || p[i + 1] === FIVE || p[i + 2] === FIVE || p[i + 3] === FIVE) {
        out.push(c);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** Five points of `col` on the lines through c (after a stone was placed at c). */
  fivePointsNear(c: number, col: Color): number[] {
    const { NB } = this.t;
    const p = this.pat[col], b = this.board;
    const out: number[] = [];
    for (let d = 0; d < 4; d++) {
      const base = (c * 4 + d) * 8;
      for (let j = 0; j < 8; j++) {
        const n = NB[base + j];
        if (n >= 0 && b[n] === 0 && p[n * 4 + d] === FIVE && !out.includes(n)) out.push(n);
      }
    }
    return out;
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Search

export const WIN = 1_000_000;
const MATE = WIN - 1000;
const INF = 2 * WIN;
const MAXPLY = 64;

/**
 * vcf / vct: depth of the own-win searches (0 = off). defend: after searching, check the chosen
 * move against the opponent's VCF and VCT and step aside when it can (Master).
 */
interface LevelCfg { time: number; maxDepth: number; rootWidth: number; width: number; vcf: number; vct: number; defend: boolean; noise: boolean; salt: number }
const LEVELS: Record<Level, LevelCfg> = {
  beginner: { time: 160, maxDepth: 2, rootWidth: 10, width: 8, vcf: 0, vct: 0, defend: false, noise: true, salt: 0x1b1b },
  club: { time: 400, maxDepth: 6, rootWidth: 18, width: 10, vcf: 10, vct: 0, defend: false, noise: false, salt: 0x2c2c },
  master: { time: 1500, maxDepth: 24, rootWidth: 24, width: 13, vcf: 18, vct: 6, defend: true, noise: false, salt: 0x3d3d },
};
/** Threes tried per VCT attacker node (fours are always tried first). */
const VCT_WIDTH = 10;
/** Beginner overlooks an open three this often. */
const CARELESS = 0.3;

// Transposition table (shared across searches in one worker; salted per level).
const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
let tt: { chk: Int32Array; score: Int32Array; move: Int16Array; depth: Int8Array; flag: Uint8Array } | null = null;
function TT() {
  if (!tt) tt = { chk: new Int32Array(TT_SIZE), score: new Int32Array(TT_SIZE), move: new Int16Array(TT_SIZE), depth: new Int8Array(TT_SIZE), flag: new Uint8Array(TT_SIZE) };
  return tt;
}
/** Forget everything learnt (new game). */
export function clearMemory(): void {
  tt = null;
}
const EXACT = 1, LOWER = 2, UPPER = 3;
const toTT = (s: number, ply: number) => (s > MATE ? s + ply : s < -MATE ? s - ply : s);
const fromTT = (s: number, ply: number) => (s > MATE ? s - ply : s < -MATE ? s + ply : s);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface ThinkOptions {
  level: Level;
  /** Override the level's time budget (ms). */
  timeMs?: number;
  maxDepth?: number;
  seed?: number;
}

export interface ThinkResult {
  move: number;
  score: number;
  depth: number;
  nodes: number;
  ms: number;
  reason: 'open' | 'win' | 'block' | 'vcf' | 'vct' | 'search' | 'none';
}

class Aborted extends Error {}

/**
 * A resumable search. `step(sliceMs)` works for at most ~sliceMs and returns the result once
 * done, or null to be called again (the main-thread fallback keeps each slice under a frame;
 * the TT keeps finished subtrees, so a re-entered iteration picks up quickly).
 */
export class Thinker {
  private pos: Pos;
  private cfg: LevelCfg;
  private me: Color;
  private rng: Rng;
  private t0 = now();
  private budget: number;
  private deadline = 0;
  private nodes = 0;
  private phase: 'init' | 'vcf' | 'vct' | 'threat' | 'id' | 'defend' | 'beginner' | 'done' = 'init';
  private result: ThinkResult | null = null;
  private root: number[] = [];
  private rootScores: number[] = [];
  private best = -1;
  private bestScore = 0;
  private depth = 0;
  private nextDepth = 1;
  private vcfMove = -1;
  private vcfCache = new Map<number, number>();
  private vctMove = -1;
  private vctCache = new Map<number, number>();
  /** The opponent's first VCT move if we passed (a point worth taking away), or -1. */
  private threat = -1;
  private defOrder: number[] = [];
  private defIdx = 0;
  private defBad = new Set<number>();
  private mv: Int16Array[] = [];
  private sc: Int32Array[] = [];
  private tbl = T();
  private tt = TT();
  private maxDepth: number;

  constructor(readonly moves: readonly number[], opts: ThinkOptions) {
    this.cfg = LEVELS[opts.level] ?? LEVELS.club;
    this.budget = opts.timeMs ?? this.cfg.time;
    this.maxDepth = opts.maxDepth ?? this.cfg.maxDepth;
    this.pos = new Pos(moves);
    this.me = this.pos.side;
    this.rng = makeRng(((opts.seed ?? Date.now()) >>> 0) ^ 0x9e3779b9);
    for (let i = 0; i < MAXPLY; i++) {
      this.mv.push(new Int16Array(CELLS));
      this.sc.push(new Int32Array(CELLS));
    }
  }

  private finish(move: number, score: number, reason: ThinkResult['reason']): ThinkResult {
    this.phase = 'done';
    this.result = { move, score, depth: this.depth, nodes: this.nodes, ms: Math.round(now() - this.t0), reason };
    return this.result;
  }

  step(sliceMs = Infinity): ThinkResult | null {
    if (this.result) return this.result;
    const sliceEnd = now() + sliceMs;
    // Master keeps a third of its time to check the chosen move against the opponent's threats.
    const end = this.t0 + this.budget * (this.cfg.defend ? 0.7 : 1);
    const pos = this.pos, me = this.me, opp = other(me);

    if (this.phase === 'init') {
      const r = this.immediate();
      if (r) return r;
      this.phase = this.cfg.noise ? 'beginner' : this.cfg.vcf ? 'vcf' : 'id';
    }

    if (this.phase === 'vcf') {
      const vEnd = this.t0 + this.budget * 0.3;
      this.deadline = Math.min(sliceEnd, vEnd);
      const r = this.runVcf(me, this.cfg.vcf);
      if (r === true && this.vcfMove >= 0) return this.finish(this.vcfMove, WIN - 1, 'vcf');
      if (r === null && now() < vEnd) return null; // slice ran out — resume next step
      this.phase = this.cfg.vct ? 'vct' : 'id';
    }

    if (this.phase === 'vct') {
      // our own win by threes and fours
      const vEnd = this.t0 + this.budget * 0.3;
      this.deadline = Math.min(sliceEnd, vEnd);
      const r = this.runVct(me, this.cfg.vct);
      if (r === true && this.vctMove >= 0) return this.finish(this.vctMove, WIN - 5, 'vct');
      if (r === null && now() < vEnd) return null;
      this.phase = 'threat';
    }

    if (this.phase === 'threat') {
      // what would the opponent do if we passed? its first VCT move is a point to deny
      const vEnd = this.t0 + this.budget * 0.36;
      this.deadline = Math.min(sliceEnd, vEnd);
      const r = this.runVct(opp, this.cfg.vct);
      if (r === null && now() < vEnd) return null;
      if (r === true && this.vctMove >= 0 && !pos.board[this.vctMove]) this.threat = this.vctMove;
      this.phase = 'id';
    }

    if (this.phase === 'beginner') {
      this.deadline = Math.min(sliceEnd, end + 100);
      const r = this.beginnerPick();
      if (r) return r;
      if (now() < end + 100) return null;
      return this.finish(this.best, this.bestScore, 'search');
    }

    if (this.phase === 'id') {
      if (!this.root.length) {
        this.root = this.genRoot();
        this.rootScores = this.root.map(() => -INF);
        this.best = this.root[0];
      }
      if (this.root.length === 1) return this.finish(this.root[0], 0, 'search');
      if (this.threat >= 0 && !this.root.includes(this.threat)) {
        this.root.push(this.threat);
        this.rootScores.push(-INF);
      }
      while (this.nextDepth <= this.maxDepth) {
        this.deadline = Math.min(sliceEnd, end);
        const t = now();
        const ok = this.searchRoot(this.nextDepth);
        if (!ok) {
          if (now() < end) return null; // only the slice ended
          break;
        }
        this.nextDepth++;
        if (Math.abs(this.bestScore) > MATE) break;
        // the next iteration costs several times this one; don't start what can't finish
        if (now() - this.t0 > this.budget * 0.55 && now() - t > 5) break;
      }
      this.phase = this.cfg.defend ? 'defend' : 'done';
      if (this.phase === 'done') return this.finish(this.best, this.bestScore, 'search');
    }

    if (this.phase === 'defend') {
      // Does our move leave the opponent a VCF or a VCT? Try the next-best moves until one doesn't.
      const dEnd = this.t0 + this.budget * 1.1;
      this.deadline = Math.min(sliceEnd, dEnd);
      if (this.bestScore > MATE) return this.finish(this.best, this.bestScore, 'search');
      if (!this.defOrder.length) {
        const rest = this.root.filter((m) => m !== this.best && m !== this.threat);
        this.defOrder = [this.best, ...(this.threat >= 0 && this.threat !== this.best ? [this.threat] : []), ...rest].slice(0, 12);
      }
      try {
        for (; this.defIdx < this.defOrder.length; this.defIdx++) {
          const m = this.defOrder[this.defIdx];
          pos.place(m, me);
          let bad: boolean;
          try {
            bad = this.vcf(opp, 12, 1) || this.vctAttack(opp, this.cfg.vct, 1);
          } finally {
            pos.remove(m);
          }
          if (!bad) {
            if (m !== this.best) this.bestScore = 0;
            return this.finish(m, this.bestScore, 'search');
          }
          this.defBad.add(m);
        }
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
        this.resetBoard();
        if (now() < dEnd) return null;
        // out of time: the move under test is at least not known to lose
        const m = this.defOrder[this.defIdx];
        if (m !== undefined && this.defBad.has(this.best)) return this.finish(m, 0, 'search');
      }
      return this.finish(this.best, this.bestScore, 'search');
    }
    return this.finish(this.best, this.bestScore, 'search');
  }

  /** Put the board back to the root position after an abort mid-line. */
  private resetBoard() {
    const pos = this.pos;
    if (pos.stones === this.moves.length) return;
    this.pos = new Pos(this.moves);
    void pos;
  }

  /** Openings, wins, forced blocks, flex fours — decided without searching. */
  private immediate(): ThinkResult | null {
    const pos = this.pos, me = this.me, opp = other(me);
    const b = pos.board;
    if (pos.stones === 0) return this.finish(idx(7, 7), 0, 'open');
    if (pos.stones >= CELLS) return this.finish(-1, 0, 'none');
    if (pos.stones === 1) {
      // answer the first stone diagonally or directly, leaning toward the centre
      const s = this.moves[0];
      const x = colOf(s), y = rowOf(s);
      const opts: number[] = [];
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!onBoard(nx, ny)) continue;
        const dc = Math.abs(nx - 7) + Math.abs(ny - 7);
        if (dc <= Math.abs(x - 7) + Math.abs(y - 7) + 1) opts.push(idx(nx, ny));
      }
      if (opts.length) return this.finish(opts[Math.floor(this.rng() * opts.length)], 0, 'open');
    }
    const mine = pos.fivePoints(me, 1);
    if (mine.length) return this.finish(mine[0], WIN, 'win');
    const theirs = pos.fivePoints(opp, 2);
    if (theirs.length) return this.finish(theirs[0], theirs.length > 1 ? -WIN : 0, 'block');
    if (!this.cfg.noise) {
      const { CCLASS } = this.tbl;
      for (let c = 0; c < CELLS; c++) {
        if (!b[c] && pos.near[c] && CCLASS[pos.combo(c, me)] >= C_F4) return this.finish(c, WIN - 3, 'win');
      }
    }
    return null;
  }

  private tick() {
    if ((++this.nodes & 511) === 0 && now() >= this.deadline) throw new Aborted();
  }

  private evaluate(p: Color): number {
    const a = this.pos.cnt[p], b = this.pos.cnt[other(p)];
    let s = 0;
    for (let k = 1; k < 10; k++) s += EW[k] * (a[k] - b[k]);
    // the side to move gets to use its open-three chances first
    return s + a[F3] * 20 + a[B4] * 10;
  }

  /**
   * Fill mv[ply] with ordered moves for `p`. Returns the count, or -1 when p has a flex-four /
   * double-four point (a win in 3).
   */
  private gen(p: Color, ply: number, width: number, ttMove = -1, ignoreThree = false): number {
    const pos = this.pos, b = pos.board, nr = pos.near;
    const { CSCORE, CCLASS, CMAX } = this.tbl;
    const o = other(p);
    const defend = !ignoreThree && pos.cnt[o][F4] > 0;
    const mv = this.mv[ply], sc = this.sc[ply];
    const cap = defend ? CELLS : width;
    let n = 0;
    for (let c = 0; c < CELLS; c++) {
      if (b[c] || !nr[c]) continue;
      const kp = pos.combo(c, p), ko = pos.combo(c, o);
      if (CCLASS[kp] >= C_F4) { mv[0] = c; return -1; }
      if (defend && CMAX[kp] < B4 && CMAX[ko] < B4) continue;
      let s = CSCORE[kp] + ((CSCORE[ko] * 7) >> 3);
      if (c === ttMove) s += 1 << 29;
      if (n === cap && s <= sc[n - 1]) continue;
      // insertion into the sorted, capped prefix
      let i = n < cap ? n++ : n - 1;
      while (i > 0 && sc[i - 1] < s) { mv[i] = mv[i - 1]; sc[i] = sc[i - 1]; i--; }
      mv[i] = c;
      sc[i] = s;
    }
    return n;
  }

  private genRoot(): number[] {
    const n = this.gen(this.me, 0, this.cfg.rootWidth);
    if (n < 0) return [this.mv[0][0]];
    return Array.from(this.mv[0].subarray(0, n));
  }

  private searchRoot(depth: number): boolean {
    const pos = this.pos, me = this.me;
    let alpha = -INF, best = -INF, bestMove = -1;
    try {
      for (let i = 0; i < this.root.length; i++) {
        const m = this.root[i];
        pos.place(m, me);
        let s: number;
        try {
          if (i === 0) s = -this.negamax(depth - 1, -INF, -alpha, 1);
          else {
            s = -this.negamax(depth - 1, -alpha - 1, -alpha, 1);
            if (s > alpha) s = -this.negamax(depth - 1, -INF, -alpha, 1);
          }
        } finally {
          pos.remove(m);
        }
        this.rootScores[i] = s;
        if (s > best) { best = s; bestMove = m; }
        if (s > alpha) alpha = s;
      }
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
      this.resetBoard();
      return false; // keep the last finished iteration's choice
    }
    // reorder for the next iteration: best first, then by score
    const order = this.root.map((m, i) => ({ m, s: this.rootScores[i] }));
    order.sort((a, b) => b.s - a.s);
    this.root = order.map((o) => o.m);
    this.rootScores = order.map((o) => o.s);
    this.best = bestMove;
    this.bestScore = best;
    this.depth = depth;
    return true;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    const pos = this.pos;
    const p = pos.side, o = other(p);
    const cp = pos.cnt[p], co = pos.cnt[o];
    if (cp[FIVE] > 0) return WIN - ply;
    if (co[FIVE] > 0) {
      const f = pos.fivePoints(o, 2);
      if (f.length > 1) return -(WIN - ply - 1);
      if (ply >= MAXPLY - 2) return this.evaluate(p);
      pos.place(f[0], p);
      let s: number;
      try {
        s = -this.negamax(depth, -beta, -alpha, ply + 1); // forced: no depth spent
      } finally {
        pos.remove(f[0]);
      }
      return s;
    }
    if (cp[F4] > 0) return WIN - ply - 2;
    if (depth <= 0 || ply >= MAXPLY - 2) return this.evaluate(p);

    // transposition table
    const t = this.tt;
    const hB = pos.hB ^ this.cfg.salt;
    const ti = pos.hA & TT_MASK;
    let ttMove = -1;
    if (t.chk[ti] === hB && t.flag[ti]) {
      ttMove = t.move[ti];
      if (t.depth[ti] >= depth) {
        const s = fromTT(t.score[ti], ply);
        const f = t.flag[ti];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }

    const n = this.gen(p, ply, this.cfg.width, ttMove);
    if (n < 0) return WIN - ply - 2;
    if (n === 0) return 0;
    const mv = this.mv[ply];
    const a0 = alpha;
    let best = -INF, bestMove = mv[0];
    for (let i = 0; i < n; i++) {
      const m = mv[i];
      pos.place(m, p);
      let s: number;
      try {
        if (i === 0) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        else {
          s = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
          if (s > alpha && s < beta) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        }
      } finally {
        pos.remove(m);
      }
      if (s > best) {
        best = s;
        bestMove = m;
        if (s > alpha) {
          alpha = s;
          if (alpha >= beta) break;
        }
      }
    }
    if (t.depth[ti] <= depth || t.chk[ti] !== hB) {
      t.chk[ti] = hB;
      t.score[ti] = toTT(best, ply);
      t.move[ti] = bestMove;
      t.depth[ti] = depth;
      t.flag[ti] = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    }
    return best;
  }

  /** VCF at the root: true (vcfMove set), false, or null when the slice ran out. */
  private runVcf(p: Color, depth: number): boolean | null {
    try {
      return this.vcf(p, depth, 0);
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
      this.resetBoard();
      return null;
    }
  }

  /** Can `p` (to move) win by an unbroken chain of fours? */
  private vcf(p: Color, depth: number, ply: number): boolean {
    this.tick();
    const pos = this.pos, o = other(p);
    if (pos.cnt[p][FIVE] > 0) return true;
    let forced = -1;
    if (pos.cnt[o][FIVE] > 0) {
      const f = pos.fivePoints(o, 2);
      if (f.length > 1) return false;
      forced = f[0];
      if (this.tbl.CMAX[pos.combo(forced, p)] < B4) return false; // the block isn't a four
    } else if (pos.cnt[p][F4] > 0) {
      if (ply === 0) {
        for (let c = 0; c < CELLS; c++) if (!pos.board[c] && pos.near[c] && this.tbl.CCLASS[pos.combo(c, p)] >= C_F4) { this.vcfMove = c; break; }
      }
      return true;
    }
    if (depth <= 0) return false;
    const key = (pos.hA ^ Math.imul(pos.hB, 0x9e3779b1)) >>> 0;
    const seen = this.vcfCache.get(key);
    if (seen !== undefined && seen >= depth) return false;

    const { CSCORE, CCLASS, CMAX } = this.tbl;
    const cands: number[] = [];
    const scores: number[] = [];
    if (forced >= 0) {
      cands.push(forced);
      scores.push(0);
    } else {
      const b = pos.board, nr = pos.near;
      for (let c = 0; c < CELLS; c++) {
        if (b[c] || !nr[c]) continue;
        const k = pos.combo(c, p);
        if (CMAX[k] < B4) continue;
        if (CCLASS[k] >= C_F4) {
          if (ply === 0) this.vcfMove = c;
          return true;
        }
        const s = CSCORE[k];
        let i = cands.length;
        cands.push(c);
        scores.push(s);
        while (i > 0 && scores[i - 1] < s) { cands[i] = cands[i - 1]; scores[i] = scores[i - 1]; i--; }
        cands[i] = c;
        scores[i] = s;
      }
    }
    for (const m of cands) {
      pos.place(m, p);
      let won = false;
      try {
        const fp = pos.fivePointsNear(m, p);
        if (fp.length >= 2) won = true;
        else if (fp.length === 1) {
          pos.place(fp[0], o);
          try {
            won = this.vcf(p, depth - 1, ply + 2);
          } finally {
            pos.remove(fp[0]);
          }
        }
      } finally {
        pos.remove(m);
      }
      if (won) {
        if (ply === 0) this.vcfMove = m;
        return true;
      }
    }
    this.vcfCache.set(key, depth);
    return false;
  }

  /** VCT at the root for `p` (to move): true (vctMove set), false, or null when time ran out. */
  private runVct(p: Color, depth: number): boolean | null {
    try {
      this.vctMove = -1;
      return this.vctAttack(p, depth, 0);
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
      this.resetBoard();
      return null;
    }
  }

  /**
   * VCT (连续活三冲四胜): can `p`, to move, win by an unbroken chain of threats — fours the
   * defender must block, open threes it must answer — whatever the defender replies, counter-fours
   * included? `depth` counts the attacker's threat moves; forced blocks are free.
   */
  private vctAttack(p: Color, depth: number, ply: number): boolean {
    this.tick();
    const pos = this.pos, o = other(p);
    if (pos.cnt[p][FIVE] > 0) return true;
    if (pos.cnt[o][FIVE] > 0) {
      // the defender's counter-four: block it, and the threat we left must still stand
      const f = pos.fivePoints(o, 2);
      if (f.length > 1 || ply >= MAXPLY - 2) return false;
      pos.place(f[0], p);
      try {
        return this.vctDefend(p, depth, ply + 1);
      } finally {
        pos.remove(f[0]);
      }
    }
    if (pos.cnt[p][F4] > 0) {
      if (ply === 0) this.vctMove = this.flexFourPoint(p);
      return true;
    }
    if (depth <= 0 || ply >= MAXPLY - 4) return false;
    const key = (pos.hA ^ Math.imul(pos.hB, 0x85ebca6b) ^ (p === BLACK ? 0x5bd1e995 : 0)) >>> 0;
    const seen = this.vctCache.get(key);
    if (seen !== undefined && seen >= depth) return false;

    const { CSCORE, CCLASS, CMAX } = this.tbl;
    const b = pos.board, nr = pos.near;
    // if the defender has an open three of its own, only fours keep the initiative
    const foursOnly = pos.cnt[o][F4] > 0;
    const cands: number[] = [], scores: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (b[c] || !nr[c]) continue;
      const k = pos.combo(c, p);
      const mx = CMAX[k];
      if (mx < F3 || (foursOnly && mx < B4)) continue;
      if (CCLASS[k] >= C_F4) {
        if (ply === 0) this.vctMove = c;
        return true;
      }
      // fours first; among threes, the ones that also hurt the defender
      const sc = CSCORE[k] + (mx >= B4 ? 1 << 20 : 0) + (CSCORE[pos.combo(c, o)] >> 2);
      let i = cands.length;
      cands.push(c);
      scores.push(sc);
      while (i > 0 && scores[i - 1] < sc) { cands[i] = cands[i - 1]; scores[i] = scores[i - 1]; i--; }
      cands[i] = c;
      scores[i] = sc;
    }
    const n = Math.min(cands.length, VCT_WIDTH);
    for (let i = 0; i < n; i++) {
      const m = cands[i];
      pos.place(m, p);
      let won: boolean;
      try {
        won = this.vctDefend(p, depth - 1, ply + 1);
      } finally {
        pos.remove(m);
      }
      if (won) {
        if (ply === 0) this.vctMove = m;
        return true;
      }
    }
    this.vctCache.set(key, depth);
    return false;
  }

  /** The defender (other(p)) to move after a threat by p: does p win against every reply? */
  private vctDefend(p: Color, depth: number, ply: number): boolean {
    this.tick();
    const pos = this.pos, o = other(p);
    if (pos.cnt[o][FIVE] > 0) return false;
    if (pos.cnt[p][FIVE] > 0) {
      const f = pos.fivePoints(p, 2);
      if (f.length > 1) return true;
      pos.place(f[0], o);
      try {
        return this.vctAttack(p, depth, ply + 1);
      } finally {
        pos.remove(f[0]);
      }
    }
    // no four and no open three standing: the defender is free, the chain is broken
    if (pos.cnt[p][F4] === 0 || pos.cnt[o][F4] > 0 || ply >= MAXPLY - 4) return false;
    const { CMAX } = this.tbl;
    const b = pos.board, nr = pos.near;
    // replies: every point that spoils one of p's fours-to-be, and every counter-four
    const replies: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (b[c] || !nr[c]) continue;
      if (CMAX[pos.combo(c, p)] >= B4 || CMAX[pos.combo(c, o)] >= B4) replies.push(c);
    }
    for (const r of replies) {
      pos.place(r, o);
      let won: boolean;
      try {
        won = this.vctAttack(p, depth, ply + 1);
      } finally {
        pos.remove(r);
      }
      if (!won) return false;
    }
    return true;
  }

  private flexFourPoint(p: Color): number {
    const pos = this.pos, { CCLASS, CMAX } = this.tbl;
    let fallback = -1;
    for (let c = 0; c < CELLS; c++) {
      if (pos.board[c] || !pos.near[c]) continue;
      const k = pos.combo(c, p);
      if (CCLASS[k] >= C_F4) return c;
      if (fallback < 0 && CMAX[k] === F4) fallback = c;
    }
    return fallback;
  }

  /** Beginner: a 2-ply look with noise; sometimes it doesn't notice an open three. */
  private beginnerPick(): ThinkResult | null {
    const pos = this.pos, me = this.me;
    if (!this.root.length) {
      const careless = this.rng() < CARELESS;
      const n = this.gen(me, 0, this.cfg.rootWidth, -1, careless);
      this.root = n < 0 ? [this.mv[0][0]] : Array.from(this.mv[0].subarray(0, Math.max(0, n)));
      if (!this.root.length) return this.finish(-1, 0, 'none');
      if (careless && n > 0 && pos.cnt[other(me)][F4] > 0) {
        // It hasn't noticed the open three: play on as if it weren't there — one of the points it
        // likes best away from the three's line. (A four is still always blocked: immediate().)
        const { CMAX } = this.tbl;
        const blind = this.root.filter((m) => {
          if (CMAX[pos.combo(m, other(me))] >= B4) return false;
          pos.place(m, me);
          const stands = pos.cnt[other(me)][F4] > 0;
          pos.remove(m);
          return stands;
        });
        if (blind.length) return this.finish(blind[Math.floor(this.rng() * Math.min(blind.length, 3))], 0, 'search');
      }
      this.rootScores = this.root.map(() => -INF);
      this.best = this.root[0];
      this.nextDepth = 0;
    }
    try {
      for (let i = this.nextDepth; i < this.root.length; i++) {
        const m = this.root[i];
        pos.place(m, me);
        try {
          this.rootScores[i] = -this.negamax(1, -INF, INF, 1);
        } finally {
          pos.remove(m);
        }
        this.nextDepth = i + 1;
      }
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
      this.resetBoard();
      return null;
    }
    const top = Math.max(...this.rootScores);
    const margin = Math.max(60, Math.abs(top) * 0.25);
    const pool = this.root.filter((_, i) => this.rootScores[i] >= top - margin && this.rootScores[i] > -MATE);
    const pick = pool.length ? pool[Math.floor(this.rng() * Math.min(pool.length, 4))] : this.root[0];
    this.depth = 2;
    return this.finish(pick, top, 'search');
  }
}

/** Search synchronously (blocks for up to the budget). */
export function think(moves: readonly number[], opts: ThinkOptions): ThinkResult {
  const t = new Thinker(moves, opts);
  let r: ThinkResult | null = null;
  while (!(r = t.step())) { /* resume */ }
  return r;
}

/**
 * A greedy one-ply player (used by tests): take a win, block a four, otherwise the point with the
 * best attack + defence value, ties broken by `rng`.
 */
export function greedyMove(moves: readonly number[], rng: () => number = Math.random): number {
  const pos = new Pos(moves);
  const me = pos.side, opp = other(me);
  if (pos.stones === 0) return idx(7, 7);
  const w = pos.fivePoints(me, 1);
  if (w.length) return w[0];
  const f = pos.fivePoints(opp, 1);
  if (f.length) return f[0];
  const { CSCORE } = T();
  let best = -1, bs = -Infinity;
  for (let c = 0; c < CELLS; c++) {
    if (pos.board[c] || !pos.near[c]) continue;
    const s = CSCORE[pos.combo(c, me)] + CSCORE[pos.combo(c, opp)] * 0.9 + rng() * 30;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

/** Debug helper: the line pattern `col` would make at (x, y) along dir d. */
export function patternAt(moves: readonly number[], x: number, y: number, d: number, col: Color = BLACK): number {
  const pos = new Pos(moves);
  return pos.pat[col][idx(x, y) * 4 + d];
}

export const BOARD_N = N;
