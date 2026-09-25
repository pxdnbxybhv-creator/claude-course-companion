// 贪吃蛇 · Snake — pure game logic (no DOM). Deterministic: the same seed and the same inputs
// always give the same game, so replays and tests are exact.
//
// The state is immutable: `step(s)` returns a new state plus what happened this tick. The view
// keeps the previous state around to interpolate the brushstroke smoothly between ticks.

export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Cell { x: number; y: number }
export type BonusKind = 'osmanthus' | 'mooncake' | 'zongzi' | 'chrysanthemum' | 'tangyuan';

export interface Bonus {
  kind: BonusKind;
  cell: Cell;
  /** Ticks left before it fades away. */
  ttl: number;
  /** Ticks it started with (for the fade). */
  life: number;
}

export interface SnakeConfig {
  cols?: number;
  rows?: number;
  /** true: leaving one edge enters from the opposite edge (穿墙); false: the edge kills (有墙). */
  wrap?: boolean;
  seed?: number;
  /** Starting length (cells). Default 5. */
  length?: number;
  /** Which golden bonus appears (osmanthus normally; festival treats on festival days). */
  bonusKind?: BonusKind;
  /** Override the starting body (head first) — for tests and puzzles. */
  body?: Cell[];
  /** Starting direction. Default 'right'. */
  dir?: Dir;
}

export interface SnakeState {
  cols: number;
  rows: number;
  wrap: boolean;
  /** Head first. */
  body: Cell[];
  /** Direction of the last move. */
  dir: Dir;
  /** Turns waiting to be applied, one per tick. */
  queue: Dir[];
  food: Cell | null;
  bonus: Bonus | null;
  bonusKind: BonusKind;
  /** Cells still to grow (the tail stays put while > 0). */
  grow: number;
  score: number;
  /** Blossoms eaten (not counting bonuses) — drives speed and the melody. */
  eaten: number;
  ticks: number;
  alive: boolean;
  /** The board is full: nothing left to eat. */
  won: boolean;
  /** RNG state (mulberry32). */
  rng: number;
}

export interface StepEvents {
  ate: 'food' | 'bonus' | null;
  /** Bonus kind eaten (when ate === 'bonus'). */
  bonusKind?: BonusKind;
  /** Points gained this tick. */
  points: number;
  died: boolean;
  /** Where the head tried to go when it died (may be off-board in walls mode). */
  crash?: Cell;
  bonusSpawned: boolean;
  bonusExpired: boolean;
  /** The snake grew this tick (tail did not move). */
  grew: boolean;
  /** Head wrapped across an edge this tick. */
  wrapped: boolean;
}

export const DIRS: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const BONUS_POINTS: Record<BonusKind, number> = {
  osmanthus: 3,
  mooncake: 5,
  zongzi: 5,
  chrysanthemum: 5,
  tangyuan: 5,
};

/** How many blossoms between bonus chances, the chance, and how long a bonus lasts (ticks). */
export const BONUS_EVERY = 5;
export const BONUS_CHANCE = 0.75;
export const BONUS_TTL = 45;
/** Queue at most this many turns ahead (fast double-taps are honoured, mashing is not). */
export const QUEUE_MAX = 3;

// ── RNG ───────────────────────────────────────────────────────────────────────

/** mulberry32 as a pure step: returns [uniform 0..1, next state]. */
export function rand(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

// ── helpers ───────────────────────────────────────────────────────────────────

export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;

function onBody(body: Cell[], c: Cell): boolean {
  for (const b of body) if (b.x === c.x && b.y === c.y) return true;
  return false;
}

/** A random free cell (not on the snake nor in `avoid`), or null when the board is full. */
export function freeCell(cols: number, rows: number, body: Cell[], avoid: (Cell | null)[], rng: number): [Cell | null, number] {
  const taken = new Uint8Array(cols * rows);
  for (const b of body) if (b.x >= 0 && b.y >= 0 && b.x < cols && b.y < rows) taken[b.y * cols + b.x] = 1;
  for (const a of avoid) if (a) taken[a.y * cols + a.x] = 1;
  let free = 0;
  for (let i = 0; i < taken.length; i++) if (!taken[i]) free++;
  if (!free) return [null, rng];
  const [r, next] = rand(rng);
  let k = Math.floor(r * free);
  for (let i = 0; i < taken.length; i++) {
    if (taken[i]) continue;
    if (k-- === 0) return [{ x: i % cols, y: Math.floor(i / cols) }, next];
  }
  return [null, next];
}

/** Milliseconds per tick after `eaten` blossoms: starts unhurried and quickens gently. */
export function tickMs(eaten: number): number {
  return Math.max(72, Math.round(150 * Math.pow(0.975, Math.max(0, eaten))));
}

// ── game ──────────────────────────────────────────────────────────────────────

export function createGame(cfg: SnakeConfig = {}): SnakeState {
  const cols = cfg.cols ?? 17;
  const rows = cfg.rows ?? 17;
  const dir = cfg.dir ?? 'right';
  let body: Cell[];
  if (cfg.body?.length) body = cfg.body.map((c) => ({ x: c.x, y: c.y }));
  else {
    const len = Math.max(1, Math.min(cfg.length ?? 5, cols - 2));
    const hy = Math.floor(rows / 2);
    const hx = Math.floor(cols / 2) - 1;
    const d = DIRS[dir];
    body = [];
    for (let i = 0; i < len; i++) body.push({ x: hx - d.x * i, y: hy - d.y * i });
  }
  const seed = (cfg.seed ?? 1) >>> 0;
  const [food, rng] = freeCell(cols, rows, body, [], seed);
  return {
    cols, rows, wrap: !!cfg.wrap, body, dir, queue: [], food, bonus: null,
    bonusKind: cfg.bonusKind ?? 'osmanthus', grow: 0, score: 0, eaten: 0, ticks: 0,
    alive: true, won: food === null, rng,
  };
}

/**
 * Queue a turn. Rejected (returns false) when it would reverse onto the neck, repeat the last
 * queued direction, or the queue is full. Reversal is checked against the *last queued* turn, so
 * pressing ↑ then ← within one tick while moving → can never fold the snake back on itself.
 */
export function queueTurn(s: SnakeState, d: Dir): SnakeState | null {
  if (!s.alive) return null;
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (d === last || d === OPPOSITE[last] || s.queue.length >= QUEUE_MAX) return null;
  // A one-cell snake has no neck to fold onto; still, keep the rule uniform.
  return { ...s, queue: [...s.queue, d] };
}

/** Advance one tick. */
export function step(s: SnakeState): { state: SnakeState; events: StepEvents } {
  const ev: StepEvents = { ate: null, points: 0, died: false, bonusSpawned: false, bonusExpired: false, grew: false, wrapped: false };
  if (!s.alive || s.won) return { state: s, events: ev };

  const queue = s.queue.slice();
  const dir = queue.length ? queue.shift()! : s.dir;
  const d = DIRS[dir];
  const head = s.body[0];
  let nx = head.x + d.x, ny = head.y + d.y;
  if (s.wrap) {
    const wx = (nx + s.cols) % s.cols, wy = (ny + s.rows) % s.rows;
    ev.wrapped = wx !== nx || wy !== ny;
    nx = wx;
    ny = wy;
  } else if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) {
    ev.died = true;
    ev.crash = { x: nx, y: ny };
    return { state: { ...s, queue, dir, alive: false, ticks: s.ticks + 1 }, events: ev };
  }
  const next: Cell = { x: nx, y: ny };

  const eatsFood = sameCell(next, s.food);
  const eatsBonus = !!s.bonus && sameCell(next, s.bonus.cell);
  let grow = s.grow + (eatsFood ? 1 : 0) + (eatsBonus ? 1 : 0);

  // The tail moves out of the way this tick unless the snake is growing — so chasing your own
  // tail is safe, but not while it is growing.
  const growing = grow > 0;
  const bodyAfter = growing ? s.body : s.body.slice(0, -1);
  if (onBody(bodyAfter, next)) {
    ev.died = true;
    ev.crash = next;
    return { state: { ...s, queue, dir, alive: false, ticks: s.ticks + 1 }, events: ev };
  }
  const body = [next, ...bodyAfter];
  if (growing) {
    grow--;
    ev.grew = true;
  }

  let { score, eaten, rng, food, bonus } = s;
  const ticks = s.ticks + 1;

  if (eatsBonus && bonus) {
    ev.ate = 'bonus';
    ev.bonusKind = bonus.kind;
    ev.points += BONUS_POINTS[bonus.kind];
    bonus = null;
  }
  if (eatsFood) {
    ev.ate = 'food';
    ev.points += 1;
    eaten++;
    [food, rng] = freeCell(s.cols, s.rows, body, [bonus?.cell ?? null], rng);
    // Every few blossoms, a chance of a golden bonus somewhere else.
    if (!bonus && eaten % BONUS_EVERY === 0) {
      let r: number;
      [r, rng] = rand(rng);
      if (r < BONUS_CHANCE) {
        let cell: Cell | null;
        [cell, rng] = freeCell(s.cols, s.rows, body, [food], rng);
        if (cell) {
          bonus = { kind: s.bonusKind, cell, ttl: BONUS_TTL, life: BONUS_TTL };
          ev.bonusSpawned = true;
        }
      }
    }
  }
  score += ev.points;

  // Bonuses fade if not eaten in time.
  if (bonus && !ev.bonusSpawned) {
    const ttl = bonus.ttl - 1;
    if (ttl <= 0) {
      bonus = null;
      ev.bonusExpired = true;
    } else bonus = { ...bonus, ttl };
  }

  const won = food === null && !bonus;
  return {
    state: { ...s, body, dir, queue, food, bonus, grow, score, eaten, ticks, rng, won },
    events: ev,
  };
}
