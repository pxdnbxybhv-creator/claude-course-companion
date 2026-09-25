// 华容道 · Huarong Pass — pure logic: layouts, moves, and a breadth-first solver.
//
// The board is 4 columns × 5 rows. A *move* is one piece sliding to any cell it can reach through
// empty space without another piece moving (turning corners included) — the common counting in
// which 横刀立马 takes 81 moves. The solver works on a canonical key where every cell holds the
// *shape* covering it (C 2×2 · H 2×1 · V 1×2 · S 1×1 · . empty), so identical pieces are
// interchangeable and the state space stays small (≈ 25 000 states for 横刀立马).

export const COLS = 4;
export const ROWS = 5;
/** Where 曹操's top-left corner must be to walk out through the gap in the bottom wall. */
export const EXIT = { x: 1, y: 3 };

export type Shape = 'C' | 'H' | 'V' | 'S';
export type Role = 'cao' | 'guan' | 'zhang' | 'zhao' | 'ma' | 'huang' | 'bing';

export interface Piece {
  /** Stable id within a game (a letter from the layout map). */
  id: string;
  role: Role;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  id: string;
  zh: string;
  en: string;
  /** Rows top→bottom. C 曹操 · G 关羽 · Z 张飞 · Y 赵云 · M 马超 · H 黄忠 · 1–4 卒 · . empty. */
  map: string[];
  /** Fewest moves, verified by the solver (tests/klotski.test.ts). */
  optimal: number;
}

/** Classic openings (moves verified in tests). Ordered from gentle to stern. */
export const LAYOUTS: Layout[] = [
  { id: 'xiaoshi', zh: '小试牛刀', en: 'A First Try', map: ['CC12', 'CC34', 'ZYMH', 'ZYMH', 'GG..'], optimal: 48 },
  { id: 'qitou', zh: '齐头并进', en: 'Side by Side', map: ['ZCCY', 'ZCCY', '1234', 'MGGH', 'M..H'], optimal: 60 },
  { id: 'zhihui', zh: '指挥若定', en: 'Calm Command', map: ['ZCCY', 'ZCCY', '1GG2', 'M34H', 'M..H'], optimal: 70 },
  { id: 'tunbing', zh: '屯兵东路', en: 'Troops to the East', map: ['CCZY', 'CCZY', 'GG12', 'MH34', 'MH..'], optimal: 71 },
  // the classic board as given on zh.wikipedia 华容道(游戏), 72 moves
  { id: 'jiangyong', zh: '将拥曹营', en: 'Generals Round the Camp', map: ['.CC.', 'ZCCY', 'ZMHY', '1MH2', 'GG34'], optimal: 72 },
  { id: 'bingfen', zh: '兵分三路', en: 'Three Columns', map: ['1CC2', 'ZCCY', 'ZGGY', 'M34H', 'M..H'], optimal: 72 },
  { id: 'hengdao', zh: '横刀立马', en: 'Blade Across the Horse', map: ['ZCCY', 'ZCCY', 'MGGH', 'M12H', '3..4'], optimal: 81 },
];

export const LAYOUT: Record<string, Layout> = Object.fromEntries(LAYOUTS.map((l) => [l.id, l]));

const ROLE_OF: Record<string, Role> = { C: 'cao', G: 'guan', Z: 'zhang', Y: 'zhao', M: 'ma', H: 'huang' };

export const ROLE_NAMES: Record<Role, { zh: string; en: string }> = {
  cao: { zh: '曹操', en: 'Cao Cao' },
  guan: { zh: '关羽', en: 'Guan Yu' },
  zhang: { zh: '张飞', en: 'Zhang Fei' },
  zhao: { zh: '赵云', en: 'Zhao Yun' },
  ma: { zh: '马超', en: 'Ma Chao' },
  huang: { zh: '黄忠', en: 'Huang Zhong' },
  bing: { zh: '卒', en: 'Soldier' },
};

/** Parse a layout map into pieces. Throws on a malformed map. */
export function parseLayout(map: string[]): Piece[] {
  if (map.length !== ROWS || map.some((r) => r.length !== COLS)) throw new Error('bad layout size');
  const seen = new Map<string, { x0: number; y0: number; x1: number; y1: number; n: number }>();
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const b = seen.get(ch);
      if (!b) seen.set(ch, { x0: x, y0: y, x1: x, y1: y, n: 1 });
      else {
        b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
        b.n++;
      }
    }),
  );
  const out: Piece[] = [];
  for (const [id, b] of seen) {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    if (w * h !== b.n) throw new Error(`piece ${id} is not a rectangle`);
    out.push({ id, role: ROLE_OF[id] ?? 'bing', x: b.x0, y: b.y0, w, h });
  }
  return out;
}

export function shapeOf(p: { w: number; h: number }): Shape {
  return p.w === 2 && p.h === 2 ? 'C' : p.w === 2 ? 'H' : p.h === 2 ? 'V' : 'S';
}

/** Canonical key: the shape letter covering each of the 20 cells, row-major. */
export function keyOf(pieces: readonly Piece[]): string {
  const cells = new Array<string>(COLS * ROWS).fill('.');
  for (const p of pieces) {
    const s = shapeOf(p);
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) cells[(p.y + dy) * COLS + p.x + dx] = s;
  }
  return cells.join('');
}

export function isSolved(pieces: readonly Piece[]): boolean {
  const c = pieces.find((p) => p.role === 'cao');
  return !!c && c.x === EXIT.x && c.y === EXIT.y;
}

export const keySolved = (k: string) => k[EXIT.y * COLS + EXIT.x] === 'C' && k[(EXIT.y + 1) * COLS + EXIT.x + 1] === 'C';

/** Occupancy grid: piece index per cell, −1 empty. */
export function occupancy(pieces: readonly Piece[]): Int8Array {
  const g = new Int8Array(COLS * ROWS).fill(-1);
  pieces.forEach((p, i) => {
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) g[(p.y + dy) * COLS + p.x + dx] = i;
  });
  return g;
}

/** Can piece i sit with its top-left at (x, y), ignoring its own cells? */
export function fits(pieces: readonly Piece[], i: number, x: number, y: number, occ = occupancy(pieces)): boolean {
  const p = pieces[i];
  if (x < 0 || y < 0 || x + p.w > COLS || y + p.h > ROWS) return false;
  for (let dy = 0; dy < p.h; dy++)
    for (let dx = 0; dx < p.w; dx++) {
      const o = occ[(y + dy) * COLS + x + dx];
      if (o !== -1 && o !== i) return false;
    }
  return true;
}

/** Every cell piece i can reach by sliding (any path through empty space), excluding where it is. */
export function reachable(pieces: readonly Piece[], i: number): { x: number; y: number; dist: number }[] {
  const occ = occupancy(pieces);
  const p = pieces[i];
  const seen = new Set<number>([p.y * COLS + p.x]);
  const out: { x: number; y: number; dist: number }[] = [];
  let frontier = [{ x: p.x, y: p.y }];
  for (let dist = 1; frontier.length; dist++) {
    const next: { x: number; y: number }[] = [];
    for (const f of frontier)
      for (const [dx, dy] of DIRS) {
        const x = f.x + dx, y = f.y + dy, k = y * COLS + x;
        if (seen.has(k) || !fits(pieces, i, x, y, occ)) continue;
        seen.add(k);
        next.push({ x, y });
        out.push({ x, y, dist });
      }
    frontier = next;
  }
  return out;
}

export const DIRS: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function movePiece(pieces: readonly Piece[], i: number, x: number, y: number): Piece[] {
  return pieces.map((p, k) => (k === i ? { ...p, x, y } : p));
}

// ─── solver on canonical keys ────────────────────────────────────────────────────────────────

interface KPiece { s: Shape; x: number; y: number; w: number; h: number }

function piecesOfKey(k: string): KPiece[] {
  const taken = new Uint8Array(COLS * ROWS);
  const out: KPiece[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const s = k[i];
    if (s === '.' || taken[i]) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    const w = s === 'C' || s === 'H' ? 2 : 1, h = s === 'C' || s === 'V' ? 2 : 1;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken[(y + dy) * COLS + x + dx] = 1;
    out.push({ s: s as Shape, x, y, w, h });
  }
  return out;
}

/** Every state one move away from key k. */
export function successors(k: string): string[] {
  const pcs = piecesOfKey(k);
  const out: string[] = [];
  const base = k.split('');
  for (const p of pcs) {
    // lift the piece off the board, then flood-fill where it can go
    const g = base.slice();
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) g[(p.y + dy) * COLS + p.x + dx] = '.';
    const ok = (x: number, y: number) => {
      if (x < 0 || y < 0 || x + p.w > COLS || y + p.h > ROWS) return false;
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) if (g[(y + dy) * COLS + x + dx] !== '.') return false;
      return true;
    };
    const seen = new Set<number>([p.y * COLS + p.x]);
    const stack = [[p.x, p.y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      for (const [dx, dy] of DIRS) {
        const x = cx + dx, y = cy + dy, id = y * COLS + x;
        if (seen.has(id) || !ok(x, y)) continue;
        seen.add(id);
        stack.push([x, y]);
        const n = g.slice();
        for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) n[(y + yy) * COLS + x + xx] = p.s;
        out.push(n.join(''));
      }
    }
  }
  return out;
}

export type SolveResult = { path: string[] } | { path: null };

/**
 * Breadth-first search from a start key to any solved key, in slices: call step(ms) until it returns
 * a result. `path` runs start → goal (inclusive); null when there is no way out.
 */
export class Solver {
  private parent = new Map<string, string>();
  private queue: string[];
  private head = 0;
  result: SolveResult | null = null;
  /** States examined so far. */
  get explored(): number { return this.head; }

  readonly start: string;

  constructor(start: string) {
    this.start = start;
    this.queue = [start];
    this.parent.set(start, '');
    if (keySolved(start)) this.result = { path: [start] };
  }

  step(budgetMs = Infinity): SolveResult | null {
    if (this.result) return this.result;
    const t0 = budgetMs === Infinity ? 0 : performance.now();
    let n = 0;
    while (this.head < this.queue.length) {
      const k = this.queue[this.head++];
      for (const s of successors(k)) {
        if (this.parent.has(s)) continue;
        this.parent.set(s, k);
        if (keySolved(s)) {
          const path = [s];
          let c = k;
          while (c) { path.push(c); c = this.parent.get(c)!; }
          path.reverse();
          this.result = { path };
          this.parent.clear();
          this.queue = [];
          return this.result;
        }
        this.queue.push(s);
      }
      if (budgetMs !== Infinity && ++n % 64 === 0 && performance.now() - t0 > budgetMs) return null;
    }
    this.result = { path: null };
    return this.result;
  }
}

/** A shortest path from a key to freedom (null when there is none). Synchronous — for tests and small jobs. */
export function solveKey(k: string): string[] | null {
  return new Solver(k).step()?.path ?? null;
}

/** Translate a canonical step (key a → key b) into a concrete move of one of `pieces`. */
export function concreteMove(pieces: readonly Piece[], next: string): { i: number; x: number; y: number } | null {
  for (let i = 0; i < pieces.length; i++)
    for (const r of reachable(pieces, i)) if (keyOf(movePiece(pieces, i, r.x, r.y)) === next) return { i, x: r.x, y: r.y };
  return null;
}
