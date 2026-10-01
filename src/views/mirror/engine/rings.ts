// 水月幻镜 · m8 · the hidden companions' figure-layer drawing (hidden.md §2.7, §3.7, §4.7, §5.7; HIDDEN):
// the one ring at the figure's feet (越女's guard and 剑意 pips, 山鬼's vine arc, 后羿's draw arc with its gold
// notch and his still arc), 山鬼's vines (sagging green → straight gold), the 破绽 ✕ over marked foes and 后羿's
// aim line. Drawn through World.playerHooks (render.ts drawPlayer), in screen pixels; it never replaces the
// figure (the poses are ART / H6). Imports types only from the World (world.ts imports content/hidden.ts,
// which imports this module).
import type { AtlasId, Camera } from '../types';
import { F } from '../data';
import { blit } from '../paint/draw';
import { POSE_FRAME } from '../paint/hidden';
import type { World } from './world';

const TONE = { lake: '#7fc4c8', vine: '#9fb86a', sun: '#d9a62e' } as const;
const INK = '#2b2a28';
const TAU = Math.PI * 2;

/** The ring is live while it was asked for within this long (s): a step or two. */
const LIVE = 0.05;

export function makeHiddenHook(marks: () => ReadonlyMap<number, number>) {
  return (ctx: CanvasRenderingContext2D, cam: Camera, W: World): boolean => {
    const k = cam.scale;
    const sx = (x: number) => (x - cam.x) * k + cam.w / 2;
    const sy = (y: number) => (y - cam.y) * k + cam.h / 2;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'round';
    // 山鬼's vines: from her to each bound foe, sagging while slack
    if (W.t - W.tetherAt <= LIVE) {
      for (const v of W.tethers) {
        const i = W.E.slotOf(v.h);
        if (i < 0) continue;
        const x0 = sx(W.px), y0 = sy(W.py), x1 = sx(W.E.x[i]), y1 = sy(W.E.y[i]);
        const d = Math.hypot(x1 - x0, y1 - y0);
        ctx.strokeStyle = v.tint;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = Math.max(1.5, (v.sag < 0.05 ? 2.6 : 1.8) * cam.dpr);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + v.sag * d * 0.28, x1, y1);
        ctx.stroke();
      }
    }
    // 破绽: a small ink ✕ over each marked foe
    const mk = marks();
    if (mk.size) {
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2 * cam.dpr;
      for (const [h, until] of mk) {
        if (until <= W.t) continue;
        const i = W.E.slotOf(h);
        if (i < 0) continue;
        const x = sx(W.E.x[i]), y = sy(W.E.y[i] - W.E.r[i] - 10), s = 4 * cam.dpr;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
        ctx.stroke();
      }
    }
    // 后羿's aim line while drawing
    if (W.verbDown && W.skillRun && W.t - W.aimAt <= LIVE && (W.aimLine.x || W.aimLine.y)) {
      const len = (W.skillDef?.p.len ?? 900) * k, x0 = sx(W.px), y0 = sy(W.py);
      ctx.strokeStyle = TONE.sun;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2 * cam.dpr;
      ctx.setLineDash([6 * cam.dpr, 6 * cam.dpr]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + W.aimLine.x * len, y0 + W.aimLine.y * len);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the ring at the figure's feet
    if (W.t - W.ringAt <= LIVE) {
      const r = W.ringNow, R = (W.pr + F.hidden.ringPad) * k, x = sx(W.px), y = sy(W.py);
      const col = r.flash ? '#ffffff' : TONE[r.tone ?? 'lake'];
      const idle = r.v <= 0 && !r.flash;
      ctx.globalAlpha = idle ? F.hidden.ringIdle : 1;
      // the track
      ctx.strokeStyle = col;
      ctx.lineWidth = 1 * cam.dpr;
      ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      ctx.globalAlpha = idle ? F.hidden.ringIdle : 1;
      // the arc (from the top, clockwise)
      if (r.v > 0) {
        ctx.lineWidth = 2.4 * cam.dpr;
        ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, r.v)); ctx.stroke();
      }
      // the gold notch (后羿's 正中)
      if (r.marks && r.marks.length >= 2) {
        ctx.strokeStyle = r.flash ? '#ffffff' : TONE.sun;
        ctx.lineWidth = 4 * cam.dpr;
        ctx.beginPath(); ctx.arc(x, y, R + 3 * cam.dpr, -Math.PI / 2 + TAU * r.marks[0], -Math.PI / 2 + TAU * r.marks[1]); ctx.stroke();
      }
      // 剑意 pips under her
      if (r.of) {
        const n = r.of, p = r.pips ?? 0, gap = 7 * cam.dpr, y0 = y + R + 6 * cam.dpr;
        for (let j = 0; j < n; j++) {
          ctx.globalAlpha = j < p ? 1 : 0.35;
          ctx.fillStyle = j < p ? TONE.lake : INK;
          ctx.beginPath(); ctx.arc(x + (j - (n - 1) / 2) * gap, y0, 2.2 * cam.dpr, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
    return drawPose(ctx, cam, W);
  };
}

/** The steady half-tone of your figure through i-frames (engine/render.ts IFRAME_A). */
const IFRAME_A = 0.55;
/**
 * H6 · the pose frame in place of the figure (paint/hidden.ts POSE_FRAME): 越女's guard while its window is open,
 * 后羿's draw while the 技 is held. Not while hurt, leaping or risen (the default figure shows those).
 */
function drawPose(ctx: CanvasRenderingContext2D, cam: Camera, W: World): boolean {
  const c = W.run.char;
  const v = c === 'yuenv' && W.t <= W.guardUntil ? POSE_FRAME['yuenv-guard']
    : c === 'houyi' && W.verbDown && !!W.skillRun ? POSE_FRAME['houyi-draw'] : -1;
  if (v < 0 || W.iframes > 0.2 || W.leapT > 0 || W.untargT > 0) return false;
  const s = W.painter?.sprite(`char:${c}` as AtlasId, v);
  if (!s) return false;
  const aimed = c === 'houyi' && (W.aimLine.x !== 0 || W.aimLine.y !== 0) && W.t - W.aimAt <= LIVE;
  const flip = aimed ? W.aimLine.x < 0 : Math.cos(W.face) < 0;
  blit(ctx, cam, s, W.px, W.py, 1, flip, W.iframes > 0 || W.invulnT > 0 ? IFRAME_A : 1);
  return true;
}
