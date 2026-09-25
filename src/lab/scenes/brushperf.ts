// /lab.html?scene=brushperf[&scale=2][&n=300][&runs=5]
// Rasterises a synthetic ~300-stroke plant (realistic mix of kinds and sizes) and prints timings:
// full rasterize() (median of runs), per-kind cost, and StrokeAnimation per-frame cost.
import type { Drawing, Stroke, StrokeKind } from '../../ink/types';
import { PIGMENTS } from '../../ink/types';
import { rasterize, paintStroke, paintDrawing, StrokeAnimation, brushFlags } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';
import { makeRng } from '../../core/rng';

function synthPlant(seed: number, count: number): Drawing {
  const rng = makeRng(seed);
  const W = 320, H = 400;
  const strokes: Stroke[] = [];
  const line = (x: number, y: number, a: number, len: number, w0: number, w1: number, n = 10) =>
    Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const bend = Math.sin(t * Math.PI) * len * 0.12;
      return { x: x + Math.cos(a) * len * t - Math.sin(a) * bend, y: y + Math.sin(a) * len * t + Math.cos(a) * bend, w: w0 + (w1 - w0) * t };
    });
  const mix: [StrokeKind, number][] = [['brush', 0.13], ['brush', 0.45], ['dry', 0.1], ['fill', 0.15], ['dot', 0.1], ['line', 0.06], ['wash', 0.01]];
  for (let k = 0; k < count; k++) {
    let r = rng(), kind: StrokeKind = 'brush', idx = 0;
    for (let m = 0; m < mix.length; m++) { if (r < mix[m][1]) { kind = mix[m][0]; idx = m; break; } r -= mix[m][1]; }
    const x = rng.range(20, W - 20), y = rng.range(20, H - 20), a = rng() * Math.PI * 2;
    let pts: Stroke['pts'];
    if (kind === 'brush' && idx === 0) pts = line(x, y, a, rng.range(60, 150), rng.range(10, 18), rng.range(6, 12), 12);
    else if (kind === 'brush') pts = line(x, y, a, rng.range(30, 90), 0.5, 0.3, 12).map((p, i) => ({ ...p, w: rng.range(7, 13) * Math.sin(Math.PI * Math.min(1, (i + 0.5) / 11)) }));
    else if (kind === 'dry') pts = line(x, y, a, rng.range(40, 100), rng.range(10, 20), rng.range(4, 8), 12);
    else if (kind === 'line') pts = line(x, y, a, rng.range(10, 40), 1.2, 0.6, 5);
    else if (kind === 'dot') pts = [{ x, y, w: rng.range(2, 7) }];
    else {
      const rad = kind === 'wash' ? rng.range(40, 80) : rng.range(5, 9);
      pts = Array.from({ length: kind === 'wash' ? 10 : 8 }, (_, i) => ({ x: x + Math.cos((i / 8) * 6.28) * rad, y: y + Math.sin((i / 8) * 6.28) * rad * 0.8, w: 4 }));
    }
    strokes.push({ kind, pts, tone: rng.range(0.3, 0.95), birth: k / count, seed: rng.int(0, 1e9), color: kind === 'fill' ? PIGMENTS.rouge : undefined });
  }
  return { width: W, height: H, anchor: { x: W / 2, y: H }, strokes };
}

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  fillPaper(ctx, W, H);
  const scale = Number(p.get('scale') ?? 2);
  const count = Number(p.get('n') ?? 300);
  const runs = Number(p.get('runs') ?? 5);
  const d = synthPlant(Number(p.get('seed') ?? 1), count);
  // warm-up: grain tiles and patterns are built once per page
  rasterize(d, 0.05, scale);
  const times: number[] = [];
  let img: HTMLCanvasElement | null = null;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    img = rasterize(d, 1, scale);
    // force the raster to complete (GPU canvases are lazy)
    img.getContext('2d')!.getImageData(0, 0, 1, 1);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  // feature ablation: which part of the pipeline costs raster time
  const ablate = (label: string, opts: CanvasRenderingContext2DSettings | undefined, sh: boolean, gr: boolean) => {
    brushFlags.shadows = sh; brushFlags.grain = gr;
    const ts: number[] = [];
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      const c = document.createElement('canvas');
      c.width = Math.ceil(d.width * scale); c.height = Math.ceil(d.height * scale);
      const x = c.getContext('2d', opts)!;
      paintDrawing(x, d, 1, { scale });
      x.getImageData(0, 0, 1, 1);
      ts.push(performance.now() - t0);
    }
    brushFlags.shadows = true; brushFlags.grain = true;
    ts.sort((a, b) => a - b);
    return `${label}: ${ts[1].toFixed(1)} ms`;
  };
  const abl = [
    ablate('gpu  all', undefined, true, true),
    ablate('gpu  no shadow', undefined, false, true),
    ablate('gpu  no grain', undefined, true, false),
    ablate('gpu  neither', undefined, false, false),
    ablate('cpu  all', { willReadFrequently: true }, true, true),
    ablate('cpu  no shadow', { willReadFrequently: true }, false, true),
    ablate('cpu  no grain', { willReadFrequently: true }, true, false),
  ];
  // per-kind timing
  const per: Record<string, { n: number; ms: number }> = {};
  const scratch = document.createElement('canvas');
  scratch.width = Math.ceil(d.width * scale); scratch.height = Math.ceil(d.height * scale);
  const sctx = scratch.getContext('2d')!;
  for (const st of d.strokes) {
    const t0 = performance.now();
    paintStroke(sctx, st, { scale });
    const dt = performance.now() - t0;
    (per[st.kind] ??= { n: 0, ms: 0 }).n++;
    per[st.kind].ms += dt;
  }
  sctx.getImageData(0, 0, 1, 1);
  // animation frame cost: overlay repaint of one in-flight stroke per frame
  const base = document.createElement('canvas');
  base.width = scratch.width; base.height = scratch.height;
  const over = document.createElement('canvas');
  over.width = scratch.width; over.height = scratch.height;
  const octx = over.getContext('2d')!;
  const anim = new StrokeAnimation(d.strokes.slice(0, 60), base.getContext('2d')!, { scale, msPerStroke: 90 });
  const frames: number[] = [];
  while (!anim.done) {
    const t0 = performance.now();
    octx.clearRect(0, 0, over.width, over.height);
    anim.step(16.7, octx);
    frames.push(performance.now() - t0);
  }
  frames.sort((a, b) => a - b);

  if (img) ctx.drawImage(img, 20, 20, img.width / scale, img.height / scale);
  ctx.fillStyle = '#222';
  ctx.font = '14px ui-monospace, monospace';
  const lines = [
    `rasterize ${count} strokes @ scale ${scale}: median ${times[Math.floor(times.length / 2)].toFixed(1)} ms  (min ${times[0].toFixed(1)}, max ${times[times.length - 1].toFixed(1)})`,
    ...Object.entries(per).map(([k, v]) => `  ${k.padEnd(6)} n=${String(v.n).padStart(3)}  ${v.ms.toFixed(1).padStart(6)} ms  (${(v.ms / v.n).toFixed(3)} ms/stroke)`),
    ...abl,
    `StrokeAnimation frame: median ${frames[Math.floor(frames.length / 2)].toFixed(2)} ms, p95 ${frames[Math.floor(frames.length * 0.95)].toFixed(2)} ms`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 360, 40 + i * 22));
  console.log(lines.join('\n'));
}
