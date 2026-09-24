// Placeholder generator for pine — replace with the real painter.
import type { Drawing, PlantSpec, Stroke } from '../types';
import { makeRng } from '../../core/rng';

export function pine(spec: PlantSpec): Drawing {
  const rng = makeRng(spec.seed);
  const w = spec.height * 0.8, h = spec.height;
  const strokes: Stroke[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y0 = h - (i * h) / n, y1 = h - ((i + 1) * h) / n;
    strokes.push({ kind: 'brush', tone: 0.7, birth: i / n, seed: rng.int(0, 1e9),
      pts: [{ x: w / 2, y: y0, w: 10 }, { x: w / 2 + rng.range(-6, 6), y: y1 + 4, w: 9 }] });
  }
  return { width: w, height: h, anchor: { x: w / 2, y: h }, strokes };
}
