// /lab.html?scene=brush[&mode=grid|compose|progress][&vigor=1]
// grid     — every stroke kind at the five ink tones plus a colour, several widths
// compose  — a small painting: bamboo culm with leaves, orchid leaves, a plum branch in blossom
// raster   — the same painting through rasterize() (transparent layer + ink grain), then blitted
// progress — strokes at progress 0.2 … 1 (what StrokeAnimation shows mid-stroke)
import type { Stroke, StrokeKind, StrokePoint } from '../../ink/types';
import { PIGMENTS } from '../../ink/types';
import { paintStroke, rasterize } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';
import { makeRng } from '../../core/rng';

type V = [number, number];

/** Sample a cubic bezier into stroke points with a width profile w(t). */
export function bez(p0: V, p1: V, p2: V, p3: V, w: (t: number) => number, n = 16): StrokePoint[] {
  const out: StrokePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    out.push({ x, y, w: w(t) });
  }
  return out;
}

/** Thin–thick–thin leaf profile peaking at `peak`. */
const leafW = (wmax: number, peak = 0.35) => (t: number) => wmax * Math.pow(Math.sin(Math.PI * Math.min(1, t < peak ? (t / peak) * 0.5 : 0.5 + ((t - peak) / (1 - peak)) * 0.5)), 0.8);

function blob(cx: number, cy: number, r: number, n: number, seed: number, squash = 1, rot = 0): StrokePoint[] {
  const rng = makeRng(seed);
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (1 + 0.12 * (rng() - 0.5));
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr * squash;
    return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot), w: 3 };
  });
}

function grid(ctx: CanvasRenderingContext2D, W: number, H: number, vigor: number) {
  const kinds: StrokeKind[] = ['brush', 'dry', 'line', 'wash', 'fill', 'dot'];
  const tones = [0.12, 0.3, 0.5, 0.75, 0.95];
  const cols = tones.length + 1;
  const left = 64, top = 30;
  const rowH = (H - top - 10) / kinds.length, colW = (W - left - 10) / cols;
  ctx.font = '12px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  tones.forEach((t, c) => ctx.fillText(`tone ${t}`, left + c * colW + 4, 16));
  ctx.fillText('colour', left + tones.length * colW + 4, 16);
  kinds.forEach((kind, r) => {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillText(kind, 10, top + r * rowH + rowH / 2);
    for (let c = 0; c < cols; c++) {
      const tone = c < tones.length ? tones[c] : 0.7;
      const x0 = left + c * colW, y0 = top + r * rowH, cx = x0 + colW / 2, cy = y0 + rowH / 2;
      const color = c === tones.length ? (kind === 'fill' || kind === 'dot' ? PIGMENTS.rouge : kind === 'wash' ? PIGMENTS.indigo : PIGMENTS.ochre) : undefined;
      const seed = r * 101 + c * 7 + 1;
      const strokes: Stroke[] = [];
      if (kind === 'wash') {
        strokes.push({ kind, tone, color, birth: 0, seed, pts: blob(cx, cy, rowH * 0.34, 9, seed, 0.62, 0.2).map((p) => ({ ...p, x: cx + (p.x - cx) * 1.45, w: 2 + c * 1.5 })) });
      } else if (kind === 'fill') {
        // five petals of a plum blossom plus one larger petal
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + c;
          const pr = rowH * 0.13;
          strokes.push({ kind, tone, color, birth: 0, seed: seed + k, pts: blob(cx - colW * 0.18 + Math.cos(a) * pr * 1.05, cy + Math.sin(a) * pr * 1.05, pr, 8, seed + k, 0.9, a) });
        }
        strokes.push({ kind, tone, color, birth: 0, seed: seed + 9, pts: blob(cx + colW * 0.24, cy, rowH * 0.24, 10, seed + 9, 0.7, 0.5) });
      } else if (kind === 'dot') {
        [3, 5, 9, 16, 26].forEach((d, k) => strokes.push({ kind, tone, color, birth: 0, seed: seed + k, pts: [{ x: x0 + 12 + [0, 12, 30, 58, 98][k], y: cy + (k % 2 ? -8 : 6), w: d }] }));
      } else {
        const len = colW * 0.86, wmax = kind === 'line' ? 2 : kind === 'dry' ? 22 : 16;
        const y1 = cy - rowH * 0.22, y2 = cy + rowH * 0.18;
        strokes.push({ kind, tone, color, birth: 0, seed, pts: bez([x0 + 8, y1], [x0 + len * 0.35, y1 - 20], [x0 + len * 0.6, y2 + 18], [x0 + len, y2 - 6], kind === 'line' ? (t) => wmax * (0.7 + 0.3 * Math.sin(t * 3)) : leafW(wmax, 0.2), 14) });
        // a second, straighter stroke of a different width underneath
        const w2 = kind === 'line' ? 1.2 : kind === 'dry' ? 12 : 8;
        strokes.push({ kind, tone, color, birth: 0, seed: seed + 50, pts: bez([x0 + 14, cy + rowH * 0.34], [x0 + len * 0.4, cy + rowH * 0.3], [x0 + len * 0.7, cy + rowH * 0.36], [x0 + len * 0.95, cy + rowH * 0.3], (t) => w2 * (t < 0.1 ? 0.6 + t * 4 : 1 - Math.max(0, t - 0.8) * 3), 8) });
      }
      for (const st of strokes) paintStroke(ctx, st, { vigor });
    }
  });
}

function compose(ctx: CanvasRenderingContext2D, W: number, H: number, vigor: number, raster = false) {
  const S: Stroke[] = [];
  let seed = 1000;
  const add = (st: Omit<Stroke, 'birth' | 'seed'>) => S.push({ ...st, birth: 0, seed: seed++ });
  const sx = W / 1200, sy = H / 700;
  const X = (x: number) => x * sx, Y = (y: number) => y * sy;

  // --- bamboo (left): culm segments with node gaps, 个 / 介 leaf groups -------------------------
  {
    const x = 170, segs = [[660, 548], [542, 420], [414, 300], [294, 190], [184, 96]];
    segs.forEach(([ya, yb], i) => {
      const lean = (i * i) * 1.6;
      const w = 17 - i * 1.4;
      add({ kind: 'brush', tone: 0.62 - i * 0.03, wet: 0.45, dryness: 0.35, pts: bez([X(x + lean), Y(ya)], [X(x + lean + 1), Y(ya - (ya - yb) * 0.3)], [X(x + lean + 2), Y(ya - (ya - yb) * 0.7)], [X(x + lean + 3 + i), Y(yb)], (t) => w * (t < 0.08 ? 1.12 - t : t > 0.92 ? 1.05 : 0.94 + 0.04 * Math.sin(t * 9)), 10) });
      // node: a dark 乙-like hook across the joint
      const ny = Y(yb - 3);
      add({ kind: 'brush', tone: 0.9, dryness: 0.1, pts: bez([X(x + lean + 3 + i - w * 0.62), ny + 3], [X(x + lean - 2 + i), ny - 3], [X(x + lean + 8 + i), ny + 2], [X(x + lean + 3 + i + w * 0.6), ny - 2], (t) => 4.5 * Math.sin(Math.PI * (0.15 + t * 0.75)), 7) });
    });
    // twig + leaves (个)
    add({ kind: 'brush', tone: 0.8, dryness: 0.3, pts: bez([X(178), Y(300)], [X(210), Y(280)], [X(240), Y(250)], [X(290), Y(236)], (t) => 3.2 * (1 - t * 0.6), 9) });
    const leaf = (bx: number, by: number, ang: number, len: number, wmax: number, tone: number, bend = 0.25) => {
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      const nx = -Math.sin(ang) * len * bend, ny = Math.cos(ang) * len * bend;
      add({ kind: 'brush', tone, wet: 0.55, dryness: 0.3, pts: bez([X(bx), Y(by)], [X(bx + (ex - bx) * 0.3 + nx * 0.5), Y(by + (ey - by) * 0.3 + ny * 0.5)], [X(bx + (ex - bx) * 0.7 + nx * 0.4), Y(by + (ey - by) * 0.7 + ny * 0.4)], [X(ex), Y(ey)], leafW(wmax, 0.3), 12) });
    };
    leaf(290, 236, 0.35, 120, 17, 0.92, 0.12);
    leaf(288, 238, 1.1, 96, 15, 0.9, -0.15);
    leaf(286, 236, -0.35, 88, 14, 0.88, 0.18);
    leaf(252, 250, 1.75, 84, 13, 0.5, 0.12);
    leaf(250, 250, 2.4, 78, 12, 0.45, -0.12);
    leaf(188, 196, 2.9, 90, 14, 0.85, 0.1);
    leaf(186, 198, 2.3, 76, 12, 0.82, -0.2);
  }

  // --- orchid (middle): three long leaves, 凤眼 crossing, a thin 破凤眼 fourth ------------------
  {
    const bx = 520, by = 640;
    const ow = (wmax: number) => (t: number) => wmax * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 0.7) * (1 - Math.max(0, t - 0.55) / 0.45) ** 0.9 * (t < 0.03 ? 0.4 : 1) * (0.72 + 0.28 * Math.cos(t * 11));
    add({ kind: 'brush', tone: 0.9, wet: 0.4, dryness: 0.35, pts: bez([X(bx), Y(by)], [X(bx - 40), Y(430)], [X(bx + 60), Y(260)], [X(bx + 250), Y(210)], ow(11), 26) });
    add({ kind: 'brush', tone: 0.85, wet: 0.4, dryness: 0.35, pts: bez([X(bx + 12), Y(by)], [X(bx + 80), Y(500)], [X(bx - 70), Y(360)], [X(bx - 130), Y(300)], ow(10), 22) });
    add({ kind: 'brush', tone: 0.8, wet: 0.4, dryness: 0.4, pts: bez([X(bx + 6), Y(by)], [X(bx + 10), Y(520)], [X(bx + 120), Y(430)], [X(bx + 230), Y(470)], ow(9), 20) });
    add({ kind: 'brush', tone: 0.55, wet: 0.5, dryness: 0.3, pts: bez([X(bx - 6), Y(by)], [X(bx - 60), Y(560)], [X(bx - 150), Y(520)], [X(bx - 200), Y(560)], ow(7), 18) });
    // a flower: pale petals in light ink, dark dotted heart
    const fx = X(bx + 110), fy = Y(400);
    [[-0.9, 32], [-0.2, 36], [0.6, 30], [1.9, 26]].forEach(([a, l], k) => {
      add({ kind: 'brush', tone: 0.34, wet: 0.7, dryness: 0.15, pts: bez([fx, fy], [fx + Math.cos(a) * l * 0.4 * sx, fy + Math.sin(a) * l * 0.4 * sy - 4], [fx + Math.cos(a + 0.2) * l * 0.8 * sx, fy + Math.sin(a + 0.2) * l * 0.8 * sy], [fx + Math.cos(a + 0.3) * l * sx, fy + Math.sin(a + 0.3) * l * sy], leafW(9 - k, 0.45), 10) });
    });
    add({ kind: 'dot', tone: 0.95, pts: [{ x: fx + 3, y: fy + 2, w: 4 }] });
    add({ kind: 'dot', tone: 0.95, pts: [{ x: fx + 8, y: fy - 3, w: 3.2 }] });
    add({ kind: 'brush', tone: 0.9, dryness: 0.1, pts: bez([fx + 1, fy + 6], [fx + 4, fy + 9], [fx + 8, fy + 9], [fx + 11, fy + 7], () => 2.6, 5) });
    // ground wash + moss dots
    add({ kind: 'wash', tone: 0.16, wet: 0.9, pts: blob(X(bx + 10), Y(660), 90, 12, 5, 0.18, 0) .map((p) => ({ ...p, w: 10 })) });
    [[-40, 648, 5], [-28, 652, 3], [46, 646, 4.5], [58, 650, 3], [-70, 655, 2.5]].forEach(([dx, y, d]) => add({ kind: 'dot', tone: 0.9, pts: [{ x: X(bx + dx), y: Y(y), w: d }] }));
  }

  // --- plum (right): old dry-brush branch zig-zagging like 女, rouge blossoms ----------------
  {
    add({ kind: 'dry', tone: 0.82, dryness: 0.55, pts: bez([X(1170), Y(690)], [X(1080), Y(560)], [X(1010), Y(520)], [X(960), Y(420)], (t) => 26 - t * 12, 16) });
    add({ kind: 'dry', tone: 0.78, dryness: 0.6, pts: bez([X(962), Y(424)], [X(930), Y(360)], [X(1000), Y(300)], [X(960), Y(200)], (t) => 14 - t * 8, 14) });
    add({ kind: 'brush', tone: 0.85, dryness: 0.5, wet: 0.3, pts: bez([X(1000), Y(520)], [X(920), Y(500)], [X(870), Y(470)], [X(800), Y(480)], (t) => 9 * (1 - t) + 1.2, 12) });
    add({ kind: 'brush', tone: 0.9, dryness: 0.4, wet: 0.3, pts: bez([X(960), Y(300)], [X(900), Y(270)], [X(870), Y(220)], [X(840), Y(150)], (t) => 6 * (1 - t) + 0.8, 10) });
    add({ kind: 'brush', tone: 0.9, dryness: 0.4, wet: 0.3, pts: bez([X(870), Y(478)], [X(850), Y(430)], [X(860), Y(400)], [X(830), Y(360)], (t) => 4 * (1 - t) + 0.6, 8) });
    // moss dots on the old branch
    [[1068, 560, 5], [1080, 572, 3.4], [1002, 505, 4], [955, 420, 3.2], [975, 360, 4.2]].forEach(([x, y, d]) => add({ kind: 'dot', tone: 0.95, pts: [{ x: X(x), y: Y(y), w: d }] }));
    // blossoms
    const bloom = (cx: number, cy: number, r: number, open = 1) => {
      const rng = makeRng(seed);
      const rot = rng() * 6;
      for (let k = 0; k < 5; k++) {
        const a = rot + (k / 5) * Math.PI * 2 + rng.range(-0.15, 0.15);
        const d = r * 0.75 * open;
        add({ kind: 'fill', tone: 0.62, color: PIGMENTS.rouge, wet: 0.5, pts: blob(X(cx) + Math.cos(a) * d, Y(cy) + Math.sin(a) * d, r * rng.range(0.78, 0.95), 9, seed + k, 0.92, a) });
      }
      if (open > 0.6) {
        for (let k = 0; k < 7; k++) {
          const a = rng() * 6.28, l = r * rng.range(0.9, 1.3);
          add({ kind: 'line', tone: 0.85, pts: [{ x: X(cx), y: Y(cy), w: 0.9 }, { x: X(cx) + Math.cos(a) * l * 0.6, y: Y(cy) + Math.sin(a) * l * 0.6, w: 0.8 }, { x: X(cx) + Math.cos(a + 0.1) * l, y: Y(cy) + Math.sin(a + 0.1) * l, w: 0.5 }] });
          add({ kind: 'dot', tone: 0.95, pts: [{ x: X(cx) + Math.cos(a + 0.1) * l, y: Y(cy) + Math.sin(a + 0.1) * l, w: 2.4 }] });
        }
      }
      add({ kind: 'dot', tone: 0.9, pts: [{ x: X(cx), y: Y(cy), w: 2.6 }] });
    };
    bloom(900, 262, 9);
    bloom(848, 170, 7.5);
    bloom(812, 470, 8.5);
    bloom(840, 368, 6, 0.4);
    bloom(1000, 318, 9.5);
    bloom(930, 470, 8);
    add({ kind: 'dot', tone: 0.9, color: PIGMENTS.rouge, pts: [{ x: X(822), y: Y(140), w: 7 }] });
    add({ kind: 'dot', tone: 0.9, pts: [{ x: X(826), y: Y(144), w: 3 }] });
  }
  if (raster) {
    // through rasterize(): a transparent layer at device resolution, then composited on paper
    const dpr = window.devicePixelRatio || 1;
    const img = rasterize({ width: W, height: H, anchor: { x: 0, y: H }, strokes: S }, 1, dpr, vigor);
    ctx.drawImage(img, 0, 0, W, H);
  } else for (const st of S) paintStroke(ctx, st, { vigor });
}

function progressSheet(ctx: CanvasRenderingContext2D, W: number, H: number, vigor: number) {
  const ps = [0.2, 0.4, 0.6, 0.8, 1];
  const colW = (W - 40) / ps.length;
  ctx.font = '12px system-ui';
  ps.forEach((p, c) => {
    const x0 = 20 + c * colW;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillText(`progress ${p}`, x0, 18);
    const o = { vigor, progress: p };
    paintStroke(ctx, { kind: 'brush', tone: 0.85, birth: 0, seed: 3, dryness: 0.4, pts: bez([x0 + 10, 60], [x0 + colW * 0.4, 30], [x0 + colW * 0.6, 140], [x0 + colW * 0.9, 90], leafW(22, 0.25), 14) }, o);
    paintStroke(ctx, { kind: 'dry', tone: 0.8, birth: 0, seed: 4, pts: bez([x0 + 10, 200], [x0 + colW * 0.3, 170], [x0 + colW * 0.6, 240], [x0 + colW * 0.9, 190], (t) => 26 - 10 * t, 14) }, o);
    paintStroke(ctx, { kind: 'line', tone: 0.8, birth: 0, seed: 5, pts: bez([x0 + 10, 300], [x0 + colW * 0.3, 270], [x0 + colW * 0.6, 330], [x0 + colW * 0.9, 290], () => 1.6, 10) }, o);
    paintStroke(ctx, { kind: 'wash', tone: 0.4, birth: 0, seed: 6, pts: blob(x0 + colW / 2, 420, 60, 10, 6, 0.6) }, o);
    paintStroke(ctx, { kind: 'fill', tone: 0.7, color: PIGMENTS.rouge, birth: 0, seed: 7, pts: blob(x0 + colW / 2 - 40, 540, 22, 9, 7, 0.9) }, o);
    paintStroke(ctx, { kind: 'dot', tone: 0.9, birth: 0, seed: 8, pts: [{ x: x0 + colW / 2 + 40, y: 540, w: 24 }] }, o);
  });
  // vigor ladder
  [1, 0.7, 0.4, 0.15].forEach((v, k) => {
    const x0 = 20 + k * colW;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillText(`vigor ${v}`, x0, 610);
    paintStroke(ctx, { kind: 'brush', tone: 0.85, birth: 0, seed: 11, pts: bez([x0 + 10, 650], [x0 + colW * 0.3, 620], [x0 + colW * 0.6, 690], [x0 + colW * 0.9, 640], leafW(18, 0.3), 14) }, { vigor: v });
  });
}

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  fillPaper(ctx, W, H);
  const vigor = Number(p.get('vigor') ?? 1);
  const zoom = Number(p.get('zoom') ?? 1);
  if (zoom !== 1) {
    ctx.translate(-Number(p.get('zx') ?? 0) * (zoom - 1), -Number(p.get('zy') ?? 0) * (zoom - 1));
    ctx.scale(zoom, zoom);
  }
  const mode = p.get('mode') ?? 'grid';
  const t0 = performance.now();
  if (mode === 'compose' || mode === 'raster') compose(ctx, W, H, vigor, mode === 'raster');
  else if (mode === 'progress') progressSheet(ctx, W, H, vigor);
  else grid(ctx, W, H, vigor);
  const ms = performance.now() - t0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '11px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillText(`${ms.toFixed(1)} ms`, W - 60, H - 8);
}
