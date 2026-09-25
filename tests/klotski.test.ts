import { describe, expect, it } from 'vitest';
import {
  LAYOUTS, LAYOUT, parseLayout, keyOf, solveKey, successors, isSolved, reachable, movePiece, concreteMove, Solver, keySolved,
} from '../src/views/games/klotski/logic';

describe('华容道 layouts', () => {
  it('every layout is a proper 4×5 board with the ten classic pieces', () => {
    for (const l of LAYOUTS) {
      const p = parseLayout(l.map);
      expect(p.length, l.zh).toBe(10);
      expect(p.filter((q) => q.role === 'cao' && q.w === 2 && q.h === 2).length, l.zh).toBe(1);
      expect(p.filter((q) => q.role === 'guan' && q.w === 2 && q.h === 1).length, l.zh).toBe(1);
      expect(p.filter((q) => q.role === 'bing' && q.w === 1 && q.h === 1).length, l.zh).toBe(4);
      expect(p.filter((q) => ['zhang', 'zhao', 'ma', 'huang'].includes(q.role) && q.w * q.h === 2).length, l.zh).toBe(4);
      expect(keyOf(p).split('').filter((c) => c === '.').length, l.zh).toBe(2);
    }
  });

  it('横刀立马 takes exactly 81 moves', () => {
    const path = solveKey(keyOf(parseLayout(LAYOUT.hengdao.map)));
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(81);
  });

  it('every layout is solvable in its stored optimal number of moves', () => {
    for (const l of LAYOUTS) {
      const path = solveKey(keyOf(parseLayout(l.map)));
      expect(path, l.zh).not.toBeNull();
      expect(path!.length - 1, l.zh).toBe(l.optimal);
      // each step of the path is a legal single move
      for (let i = 1; i < path!.length; i++) expect(successors(path![i - 1])).toContain(path![i]);
      expect(keySolved(path![path!.length - 1])).toBe(true);
    }
  });

  it('the sliced solver gives the same answer as the one-shot solve', () => {
    const s = new Solver(keyOf(parseLayout(LAYOUT.qitou.map)));
    let r = null;
    let slices = 0;
    while (!(r = s.step(1))) slices++;
    expect(r.path!.length - 1).toBe(LAYOUT.qitou.optimal);
    expect(slices).toBeGreaterThan(0);
  });

  it('concrete moves follow the solver path all the way out', () => {
    let pieces = parseLayout(LAYOUT.hengdao.map);
    const path = solveKey(keyOf(pieces))!;
    for (let i = 1; i < path.length; i++) {
      const m = concreteMove(pieces, path[i]);
      expect(m).not.toBeNull();
      pieces = movePiece(pieces, m!.i, m!.x, m!.y);
    }
    expect(isSolved(pieces)).toBe(true);
  });

  it('reachable() turns corners but never passes through pieces', () => {
    // a lone soldier in an L-shaped gap can reach both cells
    const p = parseLayout(['ZCCY', 'ZCCY', 'MGGH', 'M1.H', '2.34']);
    const one = p.findIndex((q) => q.id === '1');
    const r = reachable(p, one).map((c) => `${c.x},${c.y}`).sort();
    expect(r).toEqual(['1,4', '2,3']);
    const cao = p.findIndex((q) => q.role === 'cao');
    expect(reachable(p, cao)).toEqual([]);
  });
});
