// 开篇 · the RING set on canvas: the tap's ripple, spread far below in S9/S9s (the same spec as the
// gate's CSS rings: src/app/intro.ts RING), the plop in S11, the splash in S12 and the stage taps.
import { RING } from '../../../app/intro';

/**
 * Draw the RING set centred at (x, y) that started `since` seconds ago: RING.n ellipses at their
 * final size rx (ry = RING.ry·rx), scaled .02 → 1 with opacity RING.alpha → 0, eased out over
 * RING.dur, staggered RING.stagger. `color` is an "r,g,b" triple.
 */
export function drawRings(g: CanvasRenderingContext2D, x: number, y: number, rx: number, since: number, o: { color?: string; px?: number; n?: number; alpha?: number } = {}): boolean {
  const n = o.n ?? RING.n;
  let alive = false;
  g.save();
  for (let i = 0; i < n; i++) {
    const u = (since - i * RING.stagger) / RING.dur;
    if (u < 0 || u > 1) { if (u < 0) alive = true; continue; }
    alive = true;
    const e = 1 - Math.pow(1 - u, 3);
    const s = 0.02 + 0.98 * e;
    g.strokeStyle = `rgba(${o.color ?? '243,238,226'},${RING.alpha * (1 - e) * (o.alpha ?? 1)})`;
    g.lineWidth = Math.max(0.3, (o.px ?? RING.px) * s);
    g.beginPath();
    g.ellipse(x, y, rx * s, rx * RING.ry * s, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  return alive;
}

/** How long a RING set takes to finish (s). */
export const RING_LIFE = RING.dur + (RING.n - 1) * RING.stagger;
