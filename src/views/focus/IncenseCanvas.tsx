// The censer painting. Two stacked canvases: xuan paper (painted once per size) and the scene
// (censer, stick, smoke) redrawn every frame while something moves.
//
// - The RAF loop runs only while the page is visible, the canvas is on screen, and the stick is
//   lit (or smoke is still settling / being played with). Otherwise it sleeps.
// - Pointer drags over the smoke call scene.disturb; a mouse hovering stirs it gently.
// - prefers-reduced-motion: the smoke never drifts on screen. The simulation advances off-screen
//   in larger steps and each new state is revealed by a slow cross-fade.
import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { createIncenseScene } from '../../ink/incense';
import { fillPaper } from '../../ink/paper';
import { active, completion, restProgress } from './session';
import { progress } from './timer';

const MAX_DPR = 2.5;
/** Keep animating this long after the last change (smoke settling after being put out / stirred). */
const SETTLE_MS = 9000;
/** Reduced motion: a new smoke "still" every KEY_MS, faded in over FADE_MS. */
const KEY_MS = 3200;
const FADE_MS = 1600;

export function IncenseCanvas(props: { label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!, paperCv = paperRef.current!, inkCv = inkRef.current!;
    const ctx = inkCv.getContext('2d');
    const pctx = paperCv.getContext('2d');
    if (!ctx || !pctx) return;
    const scene = createIncenseScene(1);
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduce = !!mq?.matches;

    let W = 0, H = 0, dpr = 1;
    let raf = 0, last = 0, lastActivity = performance.now();
    let onScreen = true;
    let lit = false;
    let disposed = false;

    // Reduced-motion keyframes (device-pixel canvases).
    let keyA: HTMLCanvasElement | null = null, keyB: HTMLCanvasElement | null = null;
    let keyAt = -Infinity;

    const currentProgress = (): number => {
      const s = active.peek();
      if (s) return progress(s, Date.now());
      if (completion.peek()) return 1;
      return restProgress.peek();
    };

    const syncState = () => {
      const s = active.peek();
      const nowLit = !!s && s.pausedAt === null;
      if (nowLit !== lit) {
        lit = nowLit;
        scene.setLit(lit);
        lastActivity = performance.now();
      }
      scene.setProgress(currentProgress());
    };

    /** Let the plume establish itself off-screen (opening the view on a stick that is already lit). */
    let warmed = false;
    const prewarm = () => {
      if (warmed || W === 0) return;
      warmed = true;
      scene.setProgress(currentProgress());
      for (let i = 0; i < 60; i++) scene.step(1 / 12);
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const d = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      if (w === W && h === H && d === dpr) return;
      W = w; H = h; dpr = d;
      for (const c of [paperCv, inkCv]) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fillPaper(pctx, W, H, 11);
      scene.resize(W, H, dpr);
      keyA = keyB = null;
      keyAt = -Infinity;
      if (lit && !reduce) prewarm();
      draw(performance.now());
    };

    const paintScene = (target: CanvasRenderingContext2D) => {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, target.canvas.width, target.canvas.height);
      target.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.draw(target);
    };

    const makeKey = (): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = inkCv.width;
      c.height = inkCv.height;
      paintScene(c.getContext('2d')!);
      return c;
    };

    const draw = (t: number) => {
      syncState();
      if (!reduce) {
        paintScene(ctx);
        return;
      }
      if (!keyB || t - keyAt >= KEY_MS) {
        // Advance the smoke off-screen, then reveal the new still slowly.
        if (keyB && (lit || t - lastActivity < SETTLE_MS)) for (let i = 0; i < 16; i++) scene.step(KEY_MS / 16 / 1000);
        else if (!keyB && lit) prewarm();
        keyA = keyB;
        keyB = makeKey();
        keyAt = t;
      }
      const f = keyA ? Math.min(1, (t - keyAt) / FADE_MS) : 1;
      const e = f * f * (3 - 2 * f);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, inkCv.width, inkCv.height);
      if (keyA && e < 1) {
        ctx.globalAlpha = 1 - e;
        ctx.drawImage(keyA, 0, 0);
      }
      ctx.globalAlpha = e;
      ctx.drawImage(keyB, 0, 0);
      ctx.globalAlpha = 1;
    };

    const wantsLoop = (t: number) =>
      !disposed && onScreen && document.visibilityState === 'visible' && W > 0 && (lit || t - lastActivity < SETTLE_MS || (reduce && t - keyAt < FADE_MS));

    const frame = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (t - (last || t)) / 1000));
      last = t;
      if (reduce) {
        // ~12 fps is plenty for a cross-fade.
        if (t - lastReduced >= 80) {
          lastReduced = t;
          draw(t);
        }
      } else {
        scene.step(dt);
        draw(t);
      }
      if (wantsLoop(t)) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    let lastReduced = 0;

    const kick = () => {
      if (raf || disposed) return;
      const t = performance.now();
      if (wantsLoop(t)) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else draw(t);
    };

    // State changes (lighting, pausing, burning out) wake the loop.
    const stopEffect = effect(() => {
      void active.value; void completion.value; void restProgress.value;
      syncState();
      lastActivity = performance.now();
      kick();
    });

    // While the stick burns slowly with the loop asleep (e.g. reduced motion off-screen), the
    // progress still needs repainting now and then.
    const slow = setInterval(() => {
      if (!raf && active.peek() && onScreen && document.visibilityState === 'visible') draw(performance.now());
    }, 5000);

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    resize();

    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((e) => e.isIntersecting);
          if (onScreen) kick();
        })
      : null;
    io?.observe(wrap);

    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    const onMq = () => {
      reduce = !!mq?.matches;
      keyA = keyB = null;
      kick();
    };
    mq?.addEventListener?.('change', onMq);

    // Playing with the smoke.
    let px = 0, py = 0, pt = 0, has = false;
    const onMove = (e: PointerEvent) => {
      const r = inkCv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const t = e.timeStamp || performance.now();
      if (has && t > pt) {
        const dt = Math.max(8, t - pt) / 1000;
        const pressed = e.buttons !== 0 || e.pointerType === 'touch' || e.pointerType === 'pen';
        const k = pressed ? 1 : 0.4;
        const vx = ((x - px) / dt) * k, vy = ((y - py) / dt) * k;
        if (Math.abs(vx) + Math.abs(vy) > 4) {
          scene.disturb(x, y, Math.max(-3000, Math.min(3000, vx)), Math.max(-3000, Math.min(3000, vy)));
          lastActivity = performance.now();
          kick();
        }
      }
      px = x; py = y; pt = t; has = true;
    };
    const onLeave = () => { has = false; };
    inkCv.addEventListener('pointermove', onMove);
    inkCv.addEventListener('pointerdown', onMove);
    inkCv.addEventListener('pointerleave', onLeave);
    inkCv.addEventListener('pointercancel', onLeave);
    inkCv.addEventListener('pointerup', onLeave);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stopEffect();
      clearInterval(slow);
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMq);
      inkCv.removeEventListener('pointermove', onMove);
      inkCv.removeEventListener('pointerdown', onMove);
      inkCv.removeEventListener('pointerleave', onLeave);
      inkCv.removeEventListener('pointercancel', onLeave);
      inkCv.removeEventListener('pointerup', onLeave);
    };
  }, []);

  return (
    <div class="fx-canvas" ref={wrapRef}>
      <canvas class="fx-paper" ref={paperRef} aria-hidden="true" />
      <canvas class="fx-ink" ref={inkRef} role="img" aria-label={props.label} />
    </div>
  );
}
