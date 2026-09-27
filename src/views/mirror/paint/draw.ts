// Blit helpers for the engine's frame loop: setTransform + drawImage only (no save/restore, no
// filters, no shadows, no allocation). World → screen: s = (world − cam) · cam.scale + (w/2, h/2).
import type { Camera, Sprite } from '../types';

/**
 * Draw a sprite centred on world (x, y) at `size` × its baked size, optionally mirrored (facing left)
 * and squashed (sx, sy multipliers for procedural bob / squash).
 */
export function blit(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, size = 1, flip = false, a = 1, sx = 1, sy = 1): void {
  const k = cam.scale * size;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  const kx = (flip ? -k : k) * sx, ky = k * sy;
  ctx.setTransform(kx, 0, 0, ky, px, py);
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  if (a !== 1) ctx.globalAlpha = 1;
}

/** Draw a sprite rotated by `ang` (radians; sprites point along +x) about its anchor. */
export function blitRot(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, ang: number, size = 1, a = 1, stretch = 1): void {
  const k = cam.scale * size;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  const c = Math.cos(ang), n = Math.sin(ang);
  ctx.setTransform(c * k * stretch, n * k * stretch, -n * k, c * k, px, py);
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  if (a !== 1) ctx.globalAlpha = 1;
}
