// Small painted pieces shared by the quest book and the celebration: a portrait fan, a seal, a
// seal's faint outline, a brush-stroke progress bar, 正-tally marks with a cinnabar circle, and a
// paper page that sits behind content.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { hashString } from '../../core/rng';
import { brushOutline, tallyGlyphs, ZHENG_STROKES } from './helpers';
import { dprOf, enqueuePaint, getSeal, paintCompanion, paintPaper, paintSealOutline } from './paint';

export function Portrait(props: { id: string; locked: boolean; size: number; class?: string; eager?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const px = Math.round(props.size * Math.min(2, dprOf()));
    const run = () => {
      if (c.width !== px) { c.width = px; c.height = px; }
      paintCompanion(c, props.id, props.locked);
    };
    if (props.eager) { run(); return; }
    return enqueuePaint(run);
  }, [props.id, props.locked, props.size]);
  return <canvas ref={ref} class={'qb-portrait' + (props.class ? ' ' + props.class : '')} style={{ width: props.size + 'px', height: props.size + 'px' }} aria-hidden="true" />;
}

/** A seal impression (earned) or its faint outline (not yet). */
export function Seal(props: { text: string; size: number; earned: boolean; class?: string; onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let dead = false;
    const dpr = Math.min(2, dprOf());
    const px = Math.round(props.size * dpr);
    if (!props.earned) {
      return enqueuePaint(() => {
        c.width = px; c.height = px;
        paintSealOutline(c, props.text);
      });
    }
    const cancel = enqueuePaint(() => {
      void getSeal(props.text, props.size, dpr).then((img) => {
        if (dead) return;
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        if (!g) return;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0);
        props.onReady?.();
      }).catch(() => undefined);
    });
    return () => { dead = true; cancel(); };
  }, [props.text, props.size, props.earned]);
  return <canvas ref={ref} class={'qb-seal' + (props.class ? ' ' + props.class : '')} style={{ width: props.size + 'px', height: props.size + 'px' }} aria-hidden="true" />;
}

let barSeq = 0;

/** Progress as a single brush stroke: the whole stroke faint, the done part in ink with a dry-brush tip. */
export function BrushBar(props: { seed: string; frac: number; label?: string }) {
  const W = 200, H = 12;
  const id = useMemo(() => `qbbar${++barSeq}`, []);
  const d = useMemo(() => brushOutline(hashString(props.seed), W, H), [props.seed]);
  const f = Math.max(0, Math.min(1, props.frac));
  const x = f * W;
  const full = f >= 0.999;
  return (
    <svg class={'qb-bar' + (full ? ' is-full' : '')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role={props.label ? 'img' : undefined} aria-label={props.label} aria-hidden={props.label ? undefined : 'true'}>
      <defs>
        <linearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1={Math.max(0, x - 16)} x2={x + 0.01} y1="0" y2="0">
          <stop offset="0" stop-color="#fff" />
          <stop offset="0.7" stop-color="#fff" stop-opacity="0.55" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect x="0" y="0" width={full ? W : x} height={H} fill={full ? '#fff' : `url(#${id}g)`} />
        </mask>
      </defs>
      <path class="qb-bar-track" d={d} />
      {f > 0 && (
        <g mask={`url(#${id}m)`}>
          <path class="qb-bar-ink" d={d} />
          {!full && (
            // 飞白: dry streaks where the brush runs out
            <g class="qb-bar-dry">
              <line x1={x - 22} x2={x + 1} y1={H * 0.4} y2={H * 0.38} />
              <line x1={x - 14} x2={x + 1} y1={H * 0.62} y2={H * 0.64} />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

/** 正 tally marks — one stroke per unit — circled in cinnabar when done. */
export function Tally(props: { value: number; target: number; done: boolean }) {
  const glyphs = tallyGlyphs(props.target);
  let left = Math.max(0, Math.round(props.value));
  const w = glyphs.length * 22 + 6;
  return (
    <span class={'qb-tally' + (props.done ? ' is-done' : '')} aria-hidden="true">
      <svg viewBox={`0 0 ${w} 24`} width={w} height="24">
        {glyphs.map((n, gi) => (
          <g transform={`translate(${3 + gi * 22} 2)`}>
            {ZHENG_STROKES.slice(0, n).map((s) => {
              const on = left > 0;
              left--;
              return <path d={s} class={on ? 'on' : 'off'} />;
            })}
          </g>
        ))}
        {props.done && (
          <path class="qb-tally-ring" pathLength={100}
            d={`M${w * 0.62} 1.6 C${w * 0.98} 1.4 ${w + 1} 20 ${w * 0.55} 22.6 C${w * 0.12} 23.8 -1.4 17 1.6 8.6 C3.6 3 ${w * 0.3} 0.6 ${w * 0.72} 2.8`} />
        )}
      </svg>
    </span>
  );
}

/** A page of xuan paper behind its children (stays paper in dark mode). */
export function PaperPage(props: { seed: number; class?: string; children: ComponentChildren }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let cancel = () => {};
    let lastW = 0, lastH = 0;
    const paint = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, dprOf());
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (!w || !h || (w === lastW && h === lastH)) return;
      lastW = w; lastH = h;
      cancel();
      cancel = enqueuePaint(() => {
        c.width = w; c.height = h;
        paintPaper(c, props.seed);
      });
    };
    paint();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
    ro?.observe(c);
    return () => { cancel(); ro?.disconnect(); };
  }, [props.seed]);
  return (
    <div class={'qb-paper' + (props.class ? ' ' + props.class : '')}>
      <canvas ref={ref} class="qb-paper-bg" aria-hidden="true" />
      {props.children}
    </div>
  );
}
