// The focus timer's painting: a bronze censer (香炉) with one burning incense stick and rising smoke.
// STUB — contract only.
export interface IncenseScene {
  /** css px size and device pixel ratio. */
  resize(w: number, h: number, dpr: number): void;
  /** 0 = fresh stick, 1 = burnt out. */
  setProgress(p: number): void;
  setLit(lit: boolean): void;
  /** Advance the smoke simulation by dt seconds. */
  step(dt: number): void;
  /** Draw the whole scene (css-px coordinates; the caller has applied dpr scaling). */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Disturb the smoke — pointer drag or a "blow". (x, y) css px, (dx, dy) velocity px/s. */
  disturb(x: number, y: number, dx: number, dy: number): void;
}

export function createIncenseScene(seed = 1): IncenseScene {
  void seed;
  let W = 0, H = 0, progress = 0;
  return {
    resize(w, h) { W = w; H = h; },
    setProgress(p) { progress = p; },
    setLit() {},
    step() {},
    draw(ctx) {
      ctx.fillStyle = '#1b1916';
      const top = H * 0.2 + (H * 0.45) * progress;
      ctx.fillRect(W / 2 - 1.5, top, 3, H * 0.65 - top);
    },
    disturb() {},
  };
}
