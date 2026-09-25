import { describe, expect, it } from 'vitest';
import {
  BONUS_EVERY, BONUS_POINTS, BONUS_TTL, QUEUE_MAX, createGame, freeCell, queueTurn, sameCell, step, tickMs,
  type Cell, type Dir, type SnakeState,
} from '../src/views/games/snake/logic';
import { festivalFor } from '../src/views/games/snake/festival';

/** Queue a turn, failing the test if it was rejected. */
function turn(s: SnakeState, d: Dir): SnakeState {
  const n = queueTurn(s, d);
  if (!n) throw new Error(`turn ${d} rejected`);
  return n;
}
function run(s: SnakeState, n: number): SnakeState {
  for (let i = 0; i < n; i++) s = step(s).state;
  return s;
}
const line = (x: number, y: number, len: number, dx = -1, dy = 0): Cell[] =>
  Array.from({ length: len }, (_, i) => ({ x: x + dx * i, y: y + dy * i }));

describe('snake · setup', () => {
  it('starts centred, moving right, with food off the snake', () => {
    const s = createGame({ seed: 7 });
    expect(s.cols).toBe(17);
    expect(s.body).toHaveLength(5);
    expect(s.body[0]).toEqual({ x: 7, y: 8 });
    expect(s.body[4]).toEqual({ x: 3, y: 8 });
    expect(s.food).not.toBeNull();
    expect(s.body.some((b) => sameCell(b, s.food))).toBe(false);
    expect(s.alive).toBe(true);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const play = (seed: number) => {
      let s = createGame({ seed });
      const foods: string[] = [];
      for (let i = 0; i < 200 && s.alive; i++) {
        // steer greedily toward the food so we actually eat
        const h = s.body[0], f = s.food!;
        const want: Dir = f.x > h.x ? 'right' : f.x < h.x ? 'left' : f.y > h.y ? 'down' : 'up';
        s = queueTurn(s, want) ?? s;
        const r = step(s);
        s = r.state;
        if (r.events.ate) foods.push(`${s.food?.x},${s.food?.y}`);
      }
      return foods.join(' ');
    };
    expect(play(42)).toBe(play(42));
    expect(play(42)).not.toBe(play(43));
  });
});

describe('snake · direction queue', () => {
  it('forbids reversing onto the neck', () => {
    const s = createGame({ seed: 1 });
    expect(queueTurn(s, 'left')).toBeNull();
    expect(queueTurn(s, 'right')).toBeNull(); // same direction is a no-op
  });

  it('forbids reversing within a tick even via a quick double turn', () => {
    // moving right; ↑ then ← is fine (two ticks), but ↑ then ↓ is a reversal of the queued turn
    let s = createGame({ seed: 1 });
    s = turn(s, 'up');
    expect(queueTurn(s, 'down')).toBeNull();
    s = turn(s, 'left');
    const head = s.body[0];
    s = step(s).state; // up
    expect(s.body[0]).toEqual({ x: head.x, y: head.y - 1 });
    s = step(s).state; // left
    expect(s.body[0]).toEqual({ x: head.x - 1, y: head.y - 1 });
    expect(s.alive).toBe(true);
  });

  it('caps the queue and applies one turn per tick', () => {
    let s = createGame({ seed: 1 });
    s = turn(s, 'up');
    s = turn(s, 'left');
    s = turn(s, 'down');
    expect(s.queue).toHaveLength(QUEUE_MAX);
    expect(queueTurn(s, 'right')).toBeNull();
    s = step(s).state;
    expect(s.dir).toBe('up');
    expect(s.queue).toEqual(['left', 'down']);
  });
});

describe('snake · moving, eating, growing', () => {
  it('moves one cell per tick and keeps its length', () => {
    let s = createGame({ seed: 3, body: line(5, 5, 4), cols: 17, rows: 17 });
    s = { ...s, food: { x: 16, y: 16 } };
    s = run(s, 3);
    expect(s.body[0]).toEqual({ x: 8, y: 5 });
    expect(s.body).toHaveLength(4);
  });

  it('grows by one per blossom, scores, and places new food off the snake', () => {
    let s = createGame({ seed: 3, body: line(5, 5, 4) });
    s = { ...s, food: { x: 6, y: 5 } };
    const r = step(s);
    expect(r.events.ate).toBe('food');
    expect(r.events.grew).toBe(true);
    expect(r.state.body).toHaveLength(5);
    expect(r.state.score).toBe(1);
    expect(r.state.eaten).toBe(1);
    expect(r.state.food).not.toBeNull();
    expect(r.state.body.some((b) => sameCell(b, r.state.food))).toBe(false);
    // the tail stays put on the eating tick, then the snake moves on at its new length
    const s2 = step(r.state).state;
    expect(s2.body).toHaveLength(5);
  });

  it('never places food on the snake, even when only one cell is free', () => {
    // a 4×4 board filled by a serpentine body, except (3,3)
    const body: Cell[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) body.push({ x: y % 2 ? 3 - x : x, y });
    body.pop(); // free the last cell (0,3)
    for (let seed = 0; seed < 50; seed++) {
      const [c] = freeCell(4, 4, body, [], seed);
      expect(c).toEqual({ x: 0, y: 3 });
    }
    expect(freeCell(4, 4, [...body, { x: 0, y: 3 }], [], 1)[0]).toBeNull();
    // random placements over a busy board never land on the body
    let s = createGame({ seed: 11 });
    for (let seed = 0; seed < 300; seed++) {
      const [c] = freeCell(s.cols, s.rows, s.body, [s.food], seed);
      expect(s.body.some((b) => sameCell(b, c))).toBe(false);
      expect(sameCell(c, s.food)).toBe(false);
    }
  });

  it('wins when the board is full', () => {
    // 3×1 board, snake of 2 and food in the last cell
    let s = createGame({ cols: 3, rows: 1, body: [{ x: 1, y: 0 }, { x: 0, y: 0 }], seed: 2 });
    expect(s.food).toEqual({ x: 2, y: 0 });
    s = step(s).state;
    expect(s.won).toBe(true);
    expect(s.body).toHaveLength(3);
  });

  it('quickens gently and never below the floor', () => {
    expect(tickMs(0)).toBe(150);
    expect(tickMs(10)).toBeLessThan(tickMs(5));
    expect(tickMs(1000)).toBe(72);
    for (let i = 1; i < 60; i++) expect(tickMs(i - 1) - tickMs(i)).toBeLessThanOrEqual(4);
  });
});

describe('snake · collisions', () => {
  it('dies on a wall in walls mode', () => {
    let s = createGame({ seed: 1, body: line(16, 3, 3), wrap: false });
    s = { ...s, food: { x: 0, y: 0 } };
    const r = step(s);
    expect(r.events.died).toBe(true);
    expect(r.events.crash).toEqual({ x: 17, y: 3 });
    expect(r.state.alive).toBe(false);
    // a dead snake does not move
    expect(step(r.state).state).toBe(r.state);
    expect(queueTurn(r.state, 'up')).toBeNull();
  });

  it('wraps across edges in wrap mode', () => {
    let s = createGame({ seed: 1, body: line(16, 3, 3), wrap: true });
    s = { ...s, food: { x: 5, y: 10 } };
    let r = step(s);
    expect(r.events.died).toBe(false);
    expect(r.events.wrapped).toBe(true);
    expect(r.state.body[0]).toEqual({ x: 0, y: 3 });
    // and vertically: head (4,0) moving up re-enters at the bottom row
    s = createGame({ seed: 1, body: line(4, 0, 3, 0, 1), dir: 'up', wrap: true });
    s = { ...s, food: { x: 9, y: 9 } };
    r = step(s);
    expect(r.state.body[0]).toEqual({ x: 4, y: 16 });
  });

  it('dies biting itself', () => {
    // a hook: head at (5,5) moving up with the body curling round so ↑ hits it
    let s = createGame({ seed: 1, body: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 4 }], dir: 'left' });
    s = { ...s, food: { x: 12, y: 12 } };
    s = turn(s, 'up');
    const r = step(s);
    expect(r.events.died).toBe(true);
    expect(r.events.crash).toEqual({ x: 5, y: 4 });
  });

  it('may chase its own tail (the tail moves away) — but not while growing', () => {
    // a 2×2 loop: head (0,0) → (1,0) → (1,1) → tail (0,1); moving down into the tail cell
    const body = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    let s = createGame({ seed: 1, body, dir: 'left' });
    s = { ...s, food: { x: 9, y: 9 } };
    s = turn(s, 'down');
    const ok = step(s);
    expect(ok.events.died).toBe(false);
    expect(ok.state.body[0]).toEqual({ x: 0, y: 1 });
    const growing = step({ ...s, grow: 1 });
    expect(growing.events.died).toBe(true);
  });
});

describe('snake · bonus', () => {
  /** Feed the snake `n` blossoms by teleporting food in front of it (keeps the test independent of layout). */
  function feed(s: SnakeState, n: number): { s: SnakeState; spawned: boolean } {
    let spawned = false;
    for (let i = 0; i < n; i++) {
      const h = s.body[0];
      // walk in a loop within the board: go right until near the edge, then wrap mode handles it
      s = { ...s, food: { x: (h.x + 1) % s.cols, y: h.y } };
      if (s.bonus && sameCell(s.bonus.cell, s.food)) s = { ...s, bonus: { ...s.bonus, cell: { x: 0, y: 0 } } };
      const r = step(s);
      s = r.state;
      spawned ||= r.events.bonusSpawned;
    }
    return { s, spawned };
  }

  it('offers a golden bonus every few blossoms (for some seed) that fades if ignored', () => {
    let found: SnakeState | null = null;
    for (let seed = 0; seed < 20 && !found; seed++) {
      const { s, spawned } = feed(createGame({ seed, wrap: true, cols: 40, rows: 17, length: 3 }), BONUS_EVERY);
      if (spawned) found = s;
    }
    expect(found).not.toBeNull();
    let s = found!;
    expect(s.bonus!.kind).toBe('osmanthus');
    expect(s.bonus!.ttl).toBe(BONUS_TTL);
    expect(s.body.some((b) => sameCell(b, s.bonus!.cell))).toBe(false);
    expect(sameCell(s.bonus!.cell, s.food)).toBe(false);
    // move away harmlessly until it fades: park the food far away and steer in a safe loop
    let expired = false;
    for (let i = 0; i < BONUS_TTL + 2 && !expired; i++) {
      s = { ...s, bonus: s.bonus ? { ...s.bonus, cell: { x: 39, y: 0 } } : null, food: { x: 39, y: 16 } };
      const r = step(s);
      s = r.state;
      expired = r.events.bonusExpired;
    }
    expect(expired).toBe(true);
    expect(s.bonus).toBeNull();
  });

  it('scores festival treats more and grows by one', () => {
    let s = createGame({ seed: 5, body: line(5, 5, 3), bonusKind: 'mooncake' });
    s = { ...s, food: { x: 12, y: 12 }, bonus: { kind: 'mooncake', cell: { x: 6, y: 5 }, ttl: 10, life: 10 } };
    const r = step(s);
    expect(r.events.ate).toBe('bonus');
    expect(r.events.bonusKind).toBe('mooncake');
    expect(r.state.score).toBe(BONUS_POINTS.mooncake);
    expect(r.state.eaten).toBe(0);
    expect(r.state.body).toHaveLength(4);
    expect(r.state.bonus).toBeNull();
  });
});

describe('snake · festivals', () => {
  it('finds 中秋 on its lunar date and no festival on an ordinary day', () => {
    const f = festivalFor(new Date(2026, 8, 25)); // 2026-09-25 is 八月十五
    expect(f?.key).toBe('midautumn');
    expect(f?.moon).toBe(true);
    expect(festivalFor(new Date(2026, 8, 1))).toBeNull();
  });

  it('names every treat in English without a stray plural s', () => {
    for (const d of [new Date(2026, 8, 25), new Date(2026, 5, 19), new Date(2026, 9, 18), new Date(2026, 2, 3), new Date(2026, 1, 17)]) {
      const f = festivalFor(d);
      if (!f) continue;
      expect(f.treatsEn).toBeTruthy();
      expect(f.treatsEn).not.toMatch(/(zongzis|tangyuans)$/);
      expect(BONUS_POINTS[f.bonus]).toBe(5);
    }
  });
});
