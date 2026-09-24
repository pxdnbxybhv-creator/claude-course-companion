// Xuan paper (宣纸). v0 placeholder — flat warm tone; to be replaced with fibres & mottling.

export const PAPER_BASE = '#f1e9d8';

/** A seamless paper tile (size×size px) to use with createPattern(…, 'repeat'). */
export function makePaperTile(size = 512, seed = 7): HTMLCanvasElement {
  void seed;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER_BASE;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Fill a rectangle of `ctx` with paper. */
export function fillPaper(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7): void {
  const tile = makePaperTile(512, seed);
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.fillStyle = pat ?? PAPER_BASE;
  ctx.fillRect(0, 0, w, h);
}
