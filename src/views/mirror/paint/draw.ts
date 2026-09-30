// Blit helpers for the engine's frame loop: setTransform + drawImage only (no save/restore, no
// filters, no shadows, no allocation). World → screen: s = (world − cam) · cam.scale + (w/2, h/2).
import type { Camera, Quality, Sprite } from '../types';

/**
 * Draw a sprite centred on world (x, y) at `size` × its baked size, optionally mirrored (facing left)
 * and squashed (sx, sy multipliers for procedural bob / squash).
 */
export function blit(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, size = 1, flip = false, a = 1, sx = 1, sy = 1): void {
  const k = cam.scale * size;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  const kx = (flip ? -k : k) * sx, ky = k * sy;
  // wholly off the canvas: it would draw nothing (no call at all)
  const ex = Math.max(s.ax, 1 - s.ax) * s.w * (kx < 0 ? -kx : kx), ey = Math.max(s.ay, 1 - s.ay) * s.h * (ky < 0 ? -ky : ky);
  if (px + ex < 0 || py + ey < 0 || px - ex > cam.w || py - ey > cam.h) return;
  ctx.setTransform(kx, 0, 0, ky, px, py);
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  if (a !== 1) ctx.globalAlpha = 1;
}

/** Draw a sprite rotated by `ang` (radians; sprites point along +x) about its anchor. */
export function blitRot(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, ang: number, size = 1, a = 1, stretch = 1): void {
  const k = cam.scale * size;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  if (offCanvas(cam, px, py, reach(s, k * (stretch > 1 ? stretch : 1)))) return;
  const c = Math.cos(ang), n = Math.sin(ang);
  ctx.setTransform(c * k * stretch, n * k * stretch, -n * k, c * k, px, py);
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  if (a !== 1) ctx.globalAlpha = 1;
}

/** The screen radius (px) that bounds a sprite drawn at k px per u about its anchor, at any rotation. */
export function reach(s: Sprite, k: number): number {
  const ex = Math.max(s.ax, 1 - s.ax) * s.w, ey = Math.max(s.ay, 1 - s.ay) * s.h;
  return (k < 0 ? -k : k) * Math.sqrt(ex * ex + ey * ey);
}
/** Whether a disc of radius r (px) about screen (px, py) misses the canvas (a draw there is a no-op). */
export function offCanvas(cam: Camera, px: number, py: number, r: number): boolean {
  return px + r < 0 || py + r < 0 || px - r > cam.w || py - r > cam.h;
}
/**
 * An upright, unmirrored sprite at `size` as a destination rect: the caller has set the identity
 * transform (once for a run of these) and the alpha. The same pixels as blit's scale-and-translate
 * matrix, without a setTransform per sprite; wholly off the canvas, no call.
 */
export function blitAt(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, size = 1): void {
  const k = cam.scale * size;
  const w = s.w * k, h = s.h * k;
  const dx = (x - cam.x) * cam.scale + cam.w / 2 - s.ax * w, dy = (y - cam.y) * cam.scale + cam.h / 2 - s.ay * h;
  if (dx > cam.w || dy > cam.h || dx + w < 0 || dy + h < 0) return;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, dx, dy, w, h);
}

/** The player's choice of view size (EngineSettings.view): 'near' is the old close view, 'mid' (the
 *  default) shows ≈ 1.6× as far, 'far' ≈ 1.85×. */
export type ViewSize = 'near' | 'mid' | 'far';
export const VIEW_DEFAULT: ViewSize = 'mid';
export const VIEWS: readonly ViewSize[] = ['near', 'mid', 'far'];
/** A settings value → a view size (anything unknown: the default). */
export function viewOf(v: unknown): ViewSize {
  return v === 'near' || v === 'far' || v === 'mid' ? v : VIEW_DEFAULT;
}
/**
 * World u the screen's shorter side shows, by view. Measured against what the player must see (GDD
 * §13 roles, data/monsters.ts): shooters keep up to 260–360 u away (engine/enemies.ts keep(): they
 * settle 0–60 u inside it — lantern and clerk 320, imp 300, 樵鬼 280, spider and star 260, 灯笼鬼 360),
 * orbiters circle at 200–260, the toad's tongue reaches 300; no ranged monster winds up from farther
 * than SHOOT_R (420 u) from you; enemy shots fly 200–360 u/s; your ranged weapons reach 320–540 u.
 *   near 440: a 390-px phone shows 440 × 952 u (half-width 220: every shooter off the side of the screen)
 *   mid  700: 700 × 1515 u (half-width 350: every keeper on screen; a shooter in range ≤ 70 u past the
 *             edge, where its tell's chevron marks it). A 1280×800 desktop shows 1120 × 700 u.
 *   far  820: 820 × 1775 u (half-width 410: nearly all of SHOOT_R, and 灯笼鬼's 360)
 * On a 390-px phone the companion (54 u tall) is 48 / 30 / 26 css px, an ordinary monster (35–50 u)
 * 31–44 / 20–28 / 17–24.
 */
export const VIEW_SPAN: Readonly<Record<ViewSize, number>> = { near: 440, mid: 700, far: 820 };
/** css px per u, the ceiling by view (big screens: 1280×800 shows 853 × 533 u near, 1120 × 700 mid,
 *  1312 × 820 far; 1920×1080 1280 × 720, 1536 × 864, 1829 × 1029). */
export const VIEW_CAP: Readonly<Record<ViewSize, number>> = { near: 1.5, mid: 1.25, far: 1.05 };
/** css px per u, the floor by view (tiny screens keep figures ≥ ≈ 24 px tall). */
export const VIEW_FLOOR: Readonly<Record<ViewSize, number>> = { near: 0.7, mid: 0.5, far: 0.45 };
/** The largest view scale of any view (a big screen, 'near'): × a canvas dpr of 2 it stays within
 *  every quality's bake cap (paint/index.ts K_MAX). */
export const VIEW_MAX = 1.5;
/** CSS px per world u for a viewport of cssW × cssH and a view size: the shorter side shows
 *  VIEW_SPAN[view] u, within VIEW_FLOOR–VIEW_CAP. The engine's camera (× the canvas dpr) and the
 *  painter's bake scale (paint/index.ts bakeScale) both start here, so sprites are painted at the size
 *  they are drawn. */
export function viewScale(cssW: number, cssH: number, view: ViewSize = VIEW_DEFAULT): number {
  const v = viewOf(view);
  const m = Math.min(cssW, cssH);
  const span = VIEW_SPAN[v];
  return Math.max(VIEW_FLOOR[v], Math.min(VIEW_CAP[v], (Number.isFinite(m) && m > 0 ? m : span) / span));
}

/** Bake scale over the camera's base px per u: zoom punches reach +2–4% for a tenth of a second, and a
 *  little supersample keeps rotating blades and thin lines crisp (high as mid: its 1.15 cost a desktop
 *  at DPR 2 ≈ 9% more bake time for no visible gain). Low paints exactly at the drawn size. */
export const HEADROOM: Readonly<Record<Quality, number>> = { low: 1, mid: 1.1, high: 1.1 };
/** The bake scale's ceiling (memory grows with k²: the start atlas is ≈ 3 MB × k²). Mid's 3.3 lets any
 *  DPR-3 phone up to 440 px wide keep its full headroom at the closest view ('near': camera ≤ 3.0 × 1.1);
 *  the default view ('mid') bakes a DPR-3 390-px phone at 1.84 (40% of near's memory), 'far' at 1.57
 *  (29%). */
export const K_MAX: Readonly<Record<Quality, number>> = { low: 3, mid: 3.3, high: 3.4 };
/**
 * The sprite resolution (px per u) for a viewport and view size: the camera's base scale there
 * (viewScale × the canvas dpr) × a small headroom by quality, within [1, K_MAX]. Sprites are then drawn
 * at ≤ 1.0× their baked pixels at every quality and view (bosses and a few ids adjust by how large they
 * are drawn: paint/index.ts kindScale). It follows the view: a farther view bakes smaller (less memory,
 * no aliasing from drawing far below the bake); the engine re-bakes live when the player changes it
 * (the painter's rescale). `view` missing: the default ('mid').
 */
export function bakeScale(cssW: number, cssH: number, dpr: number, quality: Quality, view?: ViewSize): number {
  const cam = viewScale(cssW, cssH, view) * Math.max(1, dpr || 1);
  return Math.max(1, Math.min(K_MAX[quality] ?? 3.3, cam * (HEADROOM[quality] ?? 1.1)));
}
