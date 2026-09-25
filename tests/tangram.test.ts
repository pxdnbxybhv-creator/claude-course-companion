import { describe, expect, it } from 'vitest';
import {
  LOCAL, SET, area, coverage, maskArea, maskOf, onLattice, outlineOf, snap, solveFigure, SOLVED, type Placed,
} from '../src/views/games/tangram/geometry';
import { FIGURES } from '../src/views/games/tangram/figures';
import { homePieces, quarterTurn } from '../src/views/games/tangram/board';

describe('七巧板 pieces', () => {
  it('the seven pieces have the classic areas and together make the square (area 8)', () => {
    const a = (k: keyof typeof LOCAL) => Math.abs(area(LOCAL[k]));
    expect(a('L')).toBeCloseTo(2);
    expect(a('M')).toBeCloseTo(1);
    expect(a('S')).toBeCloseTo(0.5);
    expect(a('Q')).toBeCloseTo(1);
    expect(a('P')).toBeCloseTo(1);
    expect(SET.reduce((s, k) => s + a(k), 0)).toBeCloseTo(8);
    // relative sizes: the square and parallelogram and medium triangle are each two small triangles
    expect(a('L')).toBeCloseTo(4 * a('S'));
  });

  it('pieces are centred and rotations keep their area', () => {
    for (const k of Object.keys(LOCAL) as (keyof typeof LOCAL)[]) {
      for (let r = 0; r < 8; r++) {
        const p: Placed = { kind: k, x: 3, y: 2, rot: r, flip: r % 2 === 1 };
        expect(Math.abs(area(outlineOf(p)))).toBeCloseTo(Math.abs(area(LOCAL[k])));
      }
    }
  });

  it('only 90° orientations sit on the lattice (for all but the medium triangle’s hypotenuse)', () => {
    expect(onLattice('Q', 0, false)).toBe(true);
    expect(onLattice('Q', 1, false)).toBe(false);
    expect(onLattice('M', 2, false)).toBe(true);
    expect(onLattice('P', 2, true)).toBe(true);
  });

  it('a turn is a quarter turn, always to a grid orientation (odd ones from old saves recover)', () => {
    for (let r = 0; r < 8; r++) {
      const cw = quarterTurn(r, 1), ccw = quarterTurn(r, -1);
      expect(cw % 2).toBe(0);
      expect(ccw % 2).toBe(0);
      for (const k of Object.keys(LOCAL) as (keyof typeof LOCAL)[]) expect(onLattice(k, cw, false)).toBe(true);
    }
    expect(quarterTurn(6, 1)).toBe(0);
    expect(quarterTurn(0, -1)).toBe(6);
  });

  it('a whole keyboard step from the tray lands on the grid (snap reach 1), and a figure can be finished that way', () => {
    for (const p of homePieces()) {
      const moved = snap({ ...p, x: p.x + 1 }, 1);
      const v = outlineOf(moved)[0];
      expect(Math.abs(v.x - Math.round(v.x))).toBeLessThan(1e-9);
      expect(Math.abs(v.y - Math.round(v.y))).toBeLessThan(1e-9);
    }
  });

  it('snap() pulls a nearly-placed piece onto lattice points', () => {
    const p = snap({ kind: 'Q', x: 0.62, y: 0.41, rot: 0, flip: false });
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });
});

describe('七巧板 figures', () => {
  it('there are at least twenty, with unique ids', () => {
    expect(FIGURES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(FIGURES.map((f) => f.id)).size).toBe(FIGURES.length);
  });

  it('every figure has area 8 and a solution using exactly the seven pieces', () => {
    for (const f of FIGURES) {
      expect(maskArea(maskOf(f.art)), f.id).toBe(8);
      const sol = solveFigure(f.art);
      expect(sol, f.id).not.toBeNull();
      expect(sol!.map((s) => s.kind).sort().join(''), f.id).toBe([...SET].sort().join(''));
    }
  });

  it('no figure encloses a hole (every empty quarter-cell reaches the outside)', () => {
    for (const f of FIGURES) {
      const m = maskOf(f.art);
      const W = m.w + 2, H = m.h + 2;
      const filled = (x: number, y: number, q: number) =>
        x >= 1 && y >= 1 && x <= m.w && y <= m.h && !!(m.cells[(y - 1) * m.w + (x - 1)] & (1 << q));
      const seen = new Set<number>();
      const key = (x: number, y: number, q: number) => (y * W + x) * 4 + q;
      const stack: [number, number, number][] = [[0, 0, 0]];
      while (stack.length) {
        const [x, y, q] = stack.pop()!;
        if (x < 0 || y < 0 || x >= W || y >= H || filled(x, y, q) || seen.has(key(x, y, q))) continue;
        seen.add(key(x, y, q));
        stack.push([x, y, (q + 1) % 4], [x, y, (q + 3) % 4]);
        if (q === 0) stack.push([x, y - 1, 2]);
        if (q === 1) stack.push([x + 1, y, 3]);
        if (q === 2) stack.push([x, y + 1, 0]);
        if (q === 3) stack.push([x - 1, y, 1]);
      }
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          for (let q = 0; q < 4; q++) if (!filled(x, y, q)) expect(seen.has(key(x, y, q)), `${f.id} hole at ${x - 1},${y - 1}`).toBe(true);
    }
  });

  it('the coverage test accepts a known solution and rejects near misses', () => {
    for (const f of FIGURES) {
      const sol = solveFigure(f.art)!;
      const off = { x: 1, y: 2 };
      const pieces: Placed[] = sol.map((s) => ({ ...s, x: s.x + off.x, y: s.y + off.y }));
      const c = coverage(maskOf(f.art), off, pieces);
      expect(c.covered, f.id).toBeGreaterThan(0.995);
      expect(c.outside, f.id).toBeLessThan(0.005);
      expect(SOLVED(c), f.id).toBe(true);
      // one piece pulled off the figure → not solved
      const off1 = pieces.map((p, i) => (i === 0 ? { ...p, x: p.x + 9 } : p));
      expect(SOLVED(coverage(maskOf(f.art), off, off1)), f.id).toBe(false);
      // a piece rotated out of place → not solved
      const rot = pieces.map((p, i) => (i === 6 ? { ...p, rot: p.rot + 1 } : p));
      expect(SOLVED(coverage(maskOf(f.art), off, rot)), f.id).toBe(false);
    }
  });

  it('a tiny nudge (float noise, a two-hundredth of a unit) is still within tolerance', () => {
    const f = FIGURES[0];
    const sol = solveFigure(f.art)!;
    const pieces: Placed[] = sol.map((s) => ({ ...s, x: s.x + 0.005, y: s.y - 0.004 }));
    expect(SOLVED(coverage(maskOf(f.art), { x: 0, y: 0 }, pieces))).toBe(true);
  });
});
