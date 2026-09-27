// 水月幻镜 · arena geometry: the shape and a seeded obstacle layout the engine, painter and sim share.
import type { MapId } from '../ids';
import type { ArenaGeom, ArenaShape } from '../types';
import { MAPS } from '../data';
import { rngFor } from './rng';

/** Is (x, y) inside the shape, keeping a margin m? */
export function insideShape(shape: ArenaShape, x: number, y: number, m = 0): boolean {
  switch (shape.kind) {
    case 'circle': return Math.hypot(x, y) <= shape.r - m;
    case 'rect': return Math.abs(x) <= shape.w / 2 - m && Math.abs(y) <= shape.h / 2 - m;
    case 'octagon': {
      // regular octagon with circumradius r, flat sides facing the axes: apothem a = r·cos(22.5°)
      const a = shape.r * Math.cos(Math.PI / 8) - m;
      const ax = Math.abs(x), ay = Math.abs(y);
      return ax <= a && ay <= a && (ax + ay) * Math.SQRT1_2 <= a;
    }
  }
}

function bounds(shape: ArenaShape): { minX: number; minY: number; maxX: number; maxY: number } {
  if (shape.kind === 'rect') return { minX: -shape.w / 2, minY: -shape.h / 2, maxX: shape.w / 2, maxY: shape.h / 2 };
  const r = shape.kind === 'octagon' ? shape.r * Math.cos(Math.PI / 8) : shape.r;
  return { minX: -r, minY: -r, maxX: r, maxY: r };
}

/** The arena for a map and run seed (the same seed always lays out the same obstacles). */
export function arenaGeom(map: MapId, seed: number): ArenaGeom {
  const def = MAPS[map];
  const b = bounds(def.shape);
  const rng = rngFor(seed, 0, 'arena');
  const obstacles: ArenaGeom['obstacles'][number][] = [];
  for (const spec of def.obstacles) {
    if (spec.kind === 'tree') {
      obstacles.push({ x: 0, y: 0, r: spec.r[0], kind: 'tree', blocks: spec.blocks });
      continue;
    }
    let tries = 0;
    let placed = 0;
    while (placed < spec.n && tries < 400) {
      tries++;
      const r = spec.r[0] + (spec.r[1] - spec.r[0]) * rng();
      const x = b.minX + (b.maxX - b.minX) * rng();
      const y = b.minY + (b.maxY - b.minY) * rng();
      if (!insideShape(def.shape, x, y, r + 90)) continue;
      if (Math.hypot(x, y) < 200 + r) continue; // keep the centre (where you enter) open
      if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 110)) continue;
      obstacles.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), kind: spec.kind, blocks: spec.blocks });
      placed++;
    }
  }
  return { shape: def.shape, obstacles, ...b };
}
