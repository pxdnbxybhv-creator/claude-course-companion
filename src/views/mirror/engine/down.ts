// 水月幻镜 · 破镜重圆: the look of the down state and of the revive (API.md §3). While you are down the
// world holds still: the field under you pales (a paper wash over the ground, drops and bodies; the
// enemy's shots, the numbers and the light stay on top), your figure (the hurt pose) slumps and fades
// into a spreading blot of wet ink with one ink ripple, over DOWN_ANIM seconds; then the frame holds.
// The revive answers in the player's light (jade and moon-white, never the enemy's vermilion): a
// column of light where you stand, a big jade double shockwave with a moon-white ring beyond it,
// glints, then a shimmer for the invulnerable seconds (a thin jade ring and two rising glints every
// 0.25 s, on top of the usual i-frame blink). Everything is the pooled VFX layer (budgets, the frame
// guard and reduced motion apply), the painter's baked sprites or a few flat vector strokes; nothing
// here allocates per frame or touches the simulation's random streams.
import type { AtlasId, Camera, Sprite } from '../types';
import { REVIVE } from '../logic/formulas';
import { blit } from '../paint/draw';
import { INK, PAPER } from '../paint/palette';
import { BK, FK, VF, VT, vfxOf } from './vfx';
import type { World } from './world';

/** Seconds the fall animates (the engine's loop draws until then, then holds the last frame). */
export const DOWN_ANIM = 1;
/** The shimmer's beat (Hz). */
const SHIMMER_HZ = 4;

/** The revive's light at (W.px, W.py): column, shockwave, moon ring, glow and glints. */
export function reviveFx(W: World): void {
  const V = vfxOf(W);
  const x = W.px, y = W.py;
  V.bloom(x, y + 6, 100, VT.jade, 0.9, BK.column, 0.95, 2);
  V.shock(x, y, REVIVE.pushR, VT.jade, { flags: VF.double | VF.halo | VF.big, debris: 12, fleck: FK.glint, life: 0.6, prio: 2 });
  V.ring(x, y, REVIVE.pushR * 1.3, VT.moon, 0.8, VF.thin);
  V.bloom(x, y - 8, 56, VT.moon, 0.45, BK.glow, 1, 2);
  V.motes(x, y, 40, 12, VT.moon, 1.1);
}

/** One step of the shimmer while W.reviveT runs down (called after the step's decrement by dt). */
export function reviveShimmer(W: World, dt: number): void {
  if (Math.floor((W.reviveT + dt) * SHIMMER_HZ) === Math.floor(W.reviveT * SHIMMER_HZ)) return;
  const V = vfxOf(W);
  V.ring(W.px, W.py, 30, VT.jade, 0.45, VF.thin);
  V.motes(W.px, W.py - 8, 20, 2, VT.moon, 0.6);
}

function sprite(W: World, id: AtlasId, v = 0): Sprite | null {
  try { return W.painter?.sprite(id, v) ?? null; } catch { return null; }
}

/**
 * The player's layer while down (engine/render.ts drawPlayer calls this first): true when it drew
 * the fallen figure itself, so the living one (and its hitbox dot) is skipped. Reduced motion: the
 * blot is laid at its full size and only fades in; the figure fades without slumping.
 */
export function drawDown(W: World, ctx: CanvasRenderingContext2D, cam: Camera): boolean {
  if (W.phase !== 'down') return false;
  const calm = !!W.settings.reduceMotion;
  const u = Math.min(1, W.downAge / DOWN_ANIM);
  const e = calm ? 1 : 1 - (1 - u) * (1 - u) * (1 - u);
  const x = W.downX, y = W.downY;
  // the field pales, so the fall reads in a crowd (one rect a frame, for the second the fall lasts)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.5 * Math.min(1, u * 1.6);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.globalAlpha = 1;
  // the blot: wet ink spreading flat on the paper (the painter's baked ink-burst wash)
  const ba = 0.85 * Math.min(1, u * (calm ? 2 : 2.5));
  const blot = sprite(W, 'fx:inkBurst');
  if (blot) blit(ctx, cam, blot, x, y + 6, 1 + 1.1 * e, false, ba, 1.35, 0.72);
  else {
    ctx.setTransform(cam.scale, 0, 0, cam.scale * 0.6, (x - cam.x) * cam.scale + cam.w / 2, (y + 6 - cam.y) * cam.scale + cam.h / 2);
    ctx.globalAlpha = ba;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(0, 0, 18 + 20 * e, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // one ink ripple running out from it (none with reduced motion)
  if (!calm && u < 1) {
    ctx.setTransform(cam.scale, 0, 0, cam.scale * 0.6, (x - cam.x) * cam.scale + cam.w / 2, (y + 6 - cam.y) * cam.scale + cam.h / 2);
    ctx.globalAlpha = 0.55 * (1 - u);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2 / cam.scale * cam.dpr;
    ctx.beginPath(); ctx.arc(0, 0, 24 + 70 * e, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the figure: the hurt pose slumping into it and fading
  const fa = 0.95 * (1 - e);
  if (fa > 0.02) {
    const s = sprite(W, `char:${W.run.char}` as AtlasId, 3);
    if (s) blit(ctx, cam, s, x, y + (calm ? 0 : 8 * e), 1, Math.cos(W.face) < 0, fa, calm ? 1 : 1 + 0.3 * e, calm ? 1 : 1 - 0.5 * e);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}
