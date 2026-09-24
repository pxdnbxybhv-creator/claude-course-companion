// Seasonal particles: spring petals, summer fireflies/rain, autumn leaves & geese, winter snow.
// STUB — contract only.
import type { SceneEnv } from './scene-types';

export class Weather {
  constructor(public env: SceneEnv, public w: number, public h: number) {}
  resize(w: number, h: number): void { this.w = w; this.h = h; }
  /** dt in seconds; wind −1..1 (pointer / tilt can push it). */
  step(dt: number, wind = 0): void { void dt; void wind; }
  /** Draw onto a css-px-scaled context. */
  draw(ctx: CanvasRenderingContext2D): void { void ctx; }
  /** A small celebratory burst at (x, y) — e.g. petals when a habit is done. */
  burst(x: number, y: number, color?: string): void { void x; void y; void color; }
}
