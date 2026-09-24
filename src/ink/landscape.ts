// Landscape painter: sky, distant mountains, mist, sun/moon, ground, pond, rocks.
// STUB — contract only; the real painter replaces the bodies.
import type { Drawing } from './types';
import type { SceneEnv } from './scene-types';
import { fillPaper } from './paper';

export interface Backdrop {
  /** Canvas of size w*dpr × h*dpr with everything static behind the plants. */
  canvas: HTMLCanvasElement;
  /** y (css px) of the ground line where plants stand. */
  groundY: number;
  /** y (css px) where the pond's water surface begins (below groundY). */
  pondTop: number;
}

/** Everything behind the plants. Expensive — call once per size/env change and cache. */
export function paintBackdrop(w: number, h: number, dpr: number, env: SceneEnv): Backdrop {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  fillPaper(ctx, w, h, env.seed);
  const groundY = Math.round(h * 0.72);
  return { canvas: c, groundY, pondTop: groundY + 14 };
}

/** A scholar's rock (太湖石) with moss dots, as a Drawing (all strokes birth 0). */
export function rockDrawing(seed: number, size: number): Drawing {
  return { width: size, height: size * 0.7, anchor: { x: size / 2, y: size * 0.7 }, strokes: [
    { kind: 'wash', tone: 0.3, birth: 0, seed, pts: [{ x: size * 0.1, y: size * 0.7, w: 4 }, { x: size * 0.3, y: size * 0.2, w: 4 }, { x: size * 0.7, y: size * 0.15, w: 4 }, { x: size * 0.9, y: size * 0.7, w: 4 }] },
  ] };
}

export interface PondOptions {
  /** Pond rectangle in css px. */
  x: number; y: number; w: number; h: number;
  /** Seconds since start — drives ripples. */
  t: number;
  /** What to reflect: the painted scene above the pond (same css-px coordinate space, drawn at `dpr`). */
  source: CanvasImageSource;
  /** Mirror line in css px (usually the pond top). */
  mirrorY: number;
  clarity: number;
  dpr: number;
}

/** Per-frame: water surface with a rippling reflection of `source`. Must be cheap (≤ ~2 ms). */
export function paintPond(ctx: CanvasRenderingContext2D, o: PondOptions): void {
  ctx.save();
  ctx.fillStyle = 'rgba(61,90,115,0.08)';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.restore();
}

/** Per-frame overlay for time of day (dawn warmth, dusk glow, night indigo). */
export function paintLight(ctx: CanvasRenderingContext2D, w: number, h: number, env: SceneEnv): void {
  void ctx; void w; void h; void env;
}
