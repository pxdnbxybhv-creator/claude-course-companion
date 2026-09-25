// Small plant paintings for the sheets: the plant picker cards and the habit detail painting.
import { useEffect, useRef } from 'preact/hooks';
import type { PlantKind } from '../../core/types';
import { plantDrawing } from '../../ink/plants';
import { rasterize, paintStroke } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';
import type { Drawing } from '../../ink/types';

const REF_H = 300;
const THUMB_SEED: Record<PlantKind, number> = { plum: 17, orchid: 23, bamboo: 5, chrysanthemum: 41, pine: 8, lotus: 12 };

/** Painted bounds of the full-grown plant (drawing units), for framing. */
function bounds(d: Drawing) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const st of d.strokes) {
    for (const p of st.pts) {
      const r = st.kind === 'wash' || st.kind === 'fill' ? 0 : p.w / 2;
      minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r);
      minY = Math.min(minY, p.y - r); maxY = Math.max(maxY, p.y + r);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: d.width, minY: 0, maxY: d.height };
  return { minX, maxX, minY, maxY };
}

// One rasterisation at a time, yielding between them, so opening a sheet never stalls a frame.
let chain: Promise<unknown> = Promise.resolve();
function later<T>(fn: () => T): Promise<T> {
  const p = chain.then(() => new Promise<T>((res) => setTimeout(() => res(fn()), 16)));
  chain = p.catch(() => undefined);
  return p;
}

const thumbCache = new Map<string, HTMLCanvasElement>();

function paintInto(canvas: HTMLCanvasElement, w: number, h: number, dpr: number, d: Drawing, growth: number, vigor: number, opts: { paper: boolean; ground: boolean; pad: number }) {
  const b = bounds(d);
  const bw = b.maxX - b.minX, bh = Math.max(b.maxY, d.anchor.y) - b.minY;
  const s = Math.min((w - opts.pad * 2) / bw, (h - opts.pad * 2) / bh);
  const bmp = rasterize(d, growth, s * dpr, vigor);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts.paper) fillPaper(ctx, w, h, 5);
  // Anchor sits at the bottom, horizontally centred on the plant's full-grown bounds.
  const ax = w / 2 - ((b.minX + b.maxX) / 2 - d.anchor.x) * s;
  const ay = h - opts.pad - (Math.max(b.maxY, d.anchor.y) - d.anchor.y) * s;
  if (opts.ground) {
    // A soft slope of ground and a few moss dots under the plant.
    const gw = Math.min(w * 0.7, bw * s * 0.9);
    paintStroke(ctx, { kind: 'wash', tone: 0.14, birth: 0, seed: 3, pts: [
      { x: ax - gw / 2, y: ay + 2, w: 6 }, { x: ax - gw * 0.2, y: ay - 3, w: 6 }, { x: ax + gw * 0.25, y: ay - 2, w: 6 }, { x: ax + gw / 2, y: ay + 3, w: 6 }, { x: ax, y: ay + 6, w: 6 },
    ] });
    for (const [dx, dy, r] of [[-0.34, 1, 3.2], [-0.27, 3, 2], [0.3, 2, 2.6], [0.4, 0, 1.8]]) {
      paintStroke(ctx, { kind: 'dot', tone: 0.7, birth: 0, seed: 9, pts: [{ x: ax + dx * gw, y: ay + dy, w: r }] });
    }
  }
  ctx.drawImage(bmp, ax - d.anchor.x * s, ay - d.anchor.y * s, d.width * s, d.height * s);
}

/** A full-grown sample of a plant kind, for the picker. */
export function PlantThumb(props: { kind: PlantKind; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = `${props.kind}:${props.w}x${props.h}@${dpr}`;
    const show = (src: HTMLCanvasElement) => {
      const c = ref.current;
      if (!c || !alive) return;
      c.width = src.width; c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      c.classList.add('is-ready');
    };
    const hit = thumbCache.get(key);
    if (hit) show(hit);
    else later(() => {
      if (!alive) return;
      const c = document.createElement('canvas');
      const d = plantDrawing({ kind: props.kind, seed: THUMB_SEED[props.kind], height: REF_H });
      paintInto(c, props.w, props.h, dpr, d, 1, 1, { paper: false, ground: false, pad: 4 });
      thumbCache.set(key, c);
      show(c);
    });
    return () => { alive = false; };
  }, [props.kind, props.w, props.h]);
  return <canvas ref={ref} class="plant-thumb" style={{ width: props.w, height: props.h }} aria-hidden="true" />;
}

/** The habit's own plant, at its current growth, painted on paper. */
export function PlantPainting(props: { kind: PlantKind; seed: number; growth: number; vigor: number; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    later(() => {
      const c = ref.current;
      if (!c || !alive) return;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const d = plantDrawing({ kind: props.kind, seed: props.seed, height: REF_H });
      paintInto(c, props.w, props.h, dpr, d, props.growth, props.vigor, { paper: true, ground: true, pad: 14 });
      c.classList.add('is-ready');
    });
    return () => { alive = false; };
  }, [props.kind, props.seed, props.growth, props.vigor, props.w, props.h]);
  return <canvas ref={ref} class="plant-painting" style={{ width: props.w, height: props.h }} aria-hidden="true" />;
}
