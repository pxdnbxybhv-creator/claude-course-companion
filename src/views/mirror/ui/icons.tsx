// 水月幻镜 · pictures for DOM screens: painted icons (shop, codex, results), companion portraits and
// seals. Everything paints through one small queue (≈6 ms a frame), so opening the codex's 185 pages
// or a shop never lands as one long frame; painted icons are cached by the painter itself.
import { useEffect, useRef } from 'preact/hooks';
import { paintPortrait } from '../../walk/characters/portrait';
import { makeSeal, sealReady } from '../../../ink/seal';
import { createPainter } from '../paint';
import { HIDDEN_BUSTS } from '../paint/hidden';
import type { AtlasId, HiddenId, Painter } from '../types';

let shared: Painter | null = null;
/** One painter for DOM icons, shared by every screen (its icon cache survives runs). */
export function iconPainter(): Painter {
  return (shared ??= createPainter('lake', 'mid', typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
}

type Job = { run: () => void; dead: boolean };
const queue: Job[] = [];
let pump = 0;
function drain() {
  pump = 0;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 6) {
    const j = queue.shift();
    if (j && !j.dead) {
      try { j.run(); } catch (e) { console.warn('[mirror ui] paint', e); }
    }
  }
  if (queue.length) pump = requestAnimationFrame(drain);
}
/** Queue a paint job; returns a cancel. */
export function schedulePaint(run: () => void, first = false): () => void {
  const j: Job = { run, dead: false };
  if (first) queue.unshift(j); else queue.push(j);
  if (!pump && typeof requestAnimationFrame === 'function') pump = requestAnimationFrame(drain);
  return () => { j.dead = true; };
}

/** A painted icon (shop cards, codex pages, results). `painter` defaults to the shared one. */
export function Icon(props: { id: string; px: number; class?: string; painter?: Painter | null; label?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const cancel = schedulePaint(() => {
      const p = props.painter ?? iconPainter();
      const c = p.icon(props.id as AtlasId, props.px);
      c.setAttribute('aria-hidden', 'true');
      el.replaceChildren(c);
    });
    return cancel;
  }, [props.id, props.px, props.painter]);
  return (
    <span
      ref={host}
      class={'mj-icon ' + (props.class ?? '')}
      style={{ width: props.px + 'px', height: props.px + 'px' }}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    />
  );
}

/**
 * A companion's round-fan portrait (a pale 「未」 silhouette when locked). m8: a hidden companion's own bust
 * (paint/hidden.ts HIDDEN_BUSTS) is tried first; `veiled` paints it as the sealed ink silhouette (hidden.md §2.3).
 */
export function Portrait(props: { id: string; size: number; locked?: boolean; veiled?: boolean; class?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const d = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(props.size * d);
    const hidden = HIDDEN_BUSTS[props.id as HiddenId];
    if (hidden) {
      const g = c.getContext('2d');
      return schedulePaint(() => { if (g) hidden(g, c.width, c.height, !!props.veiled || !!props.locked); }, true);
    }
    return schedulePaint(() => paintPortrait(c, props.id, !!props.locked, { seal: !!props.locked }), true);
  }, [props.id, props.size, props.locked, props.veiled]);
  return <canvas ref={ref} class={'mj-portrait ' + (props.class ?? '')} style={{ width: props.size + 'px', height: props.size + 'px' }} aria-hidden="true" />;
}

const sealCache = new Map<string, string>();
/** A carved seal (makeSeal) as an image; vermilion by default. */
export function Seal(props: { text: string; size: number; color?: string; style?: 'bai' | 'zhu'; shape?: 'square' | 'round' | 'oval'; class?: string; label?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const key = `${props.text}|${props.size}|${props.color ?? ''}|${props.style ?? 'bai'}|${props.shape ?? 'square'}`;
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    const hit = sealCache.get(key);
    if (hit) { img.src = hit; return; }
    let dead = false;
    void sealReady(props.text).then(() => {
      if (dead) return;
      schedulePaint(() => {
        if (dead) return;
        try {
          const d = Math.min(2, window.devicePixelRatio || 1);
          const c = makeSeal(props.text, { size: props.size, dpr: d, style: props.style ?? 'bai', shape: props.shape ?? 'square', color: props.color ?? '#b93a2b', wear: 0.45 });
          const url = c.toDataURL('image/png');
          if (sealCache.size > 120) sealCache.delete(sealCache.keys().next().value as string);
          sealCache.set(key, url);
          if (ref.current) ref.current.src = url;
        } catch (e) {
          console.warn('[mirror ui] seal', e);
        }
      });
    });
    return () => { dead = true; };
  }, [key]);
  return (
    <img
      ref={ref}
      class={'mj-seal ' + (props.class ?? '')}
      width={props.size}
      height={props.size}
      alt={props.label ?? props.text}
      src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
    />
  );
}
