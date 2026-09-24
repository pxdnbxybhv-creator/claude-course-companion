// Xuan paper (宣纸).
//
// A seamless tile built from four quiet layers:
//   1. a warm base with low-frequency mottling (the sheet is never perfectly even),
//   2. long bast fibres — faint, gently curving hairs, some lighter, a few darker,
//   3. short fibre flecks and the odd speck of bark,
//   4. fine per-pixel tooth.
// Everything is subtle: the paper must never compete with the painting.
//
// The same fibre logic also yields `inkGrainTile()` — an alpha mask the brush engine uses so
// that thin ink sits *in* the paper (fibres resist the ink a little, grain shows through).
import { makeNoise2, makeRng, clamp } from '../core/rng';

export const PAPER_BASE = '#f1e9d8';

const BASE_RGB: [number, number, number] = [241, 233, 216];

function canvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draw `fn` at the 9 wrapped positions needed for a seamless tile when near an edge. */
function wrapped(size: number, x: number, y: number, reach: number, fn: (dx: number, dy: number) => void) {
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const dx = i * size, dy = j * size;
      if (x + dx + reach < 0 || x + dx - reach > size || y + dy + reach < 0 || y + dy - reach > size) continue;
      fn(dx, dy);
    }
  }
}

/** A gently curving fibre as a list of points (tile units). */
function fibrePath(rng: ReturnType<typeof makeRng>, x: number, y: number, len: number, curl: number) {
  const pts: [number, number][] = [[x, y]];
  let a = rng() * Math.PI * 2;
  const n = Math.max(3, Math.round(len / 6));
  const step = len / n;
  let da = rng.gauss() * curl;
  for (let i = 0; i < n; i++) {
    da += rng.gauss() * curl * 0.5;
    da *= 0.8;
    a += da;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

function strokeFibre(ctx: CanvasRenderingContext2D, pts: [number, number][], dx: number, dy: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0] + dx, pts[i][1] + dy, mx + dx, my + dy);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0] + dx, last[1] + dy);
  ctx.stroke();
}

const tileCache = new Map<string, HTMLCanvasElement>();

/**
 * A seamless paper tile to use with createPattern(…, 'repeat').
 * @param size tile size in paper units (css px at scale 1)
 * @param seed paper seed
 * @param res  pixels per unit (pass the device scale, e.g. devicePixelRatio, for crisp fibres). The
 *             returned canvas is `round(size*res)` px square.
 */
export function makePaperTile(size = 512, seed = 7, res = 1): HTMLCanvasElement {
  res = clamp(Math.round(res * 4) / 4, 0.25, 4);
  const key = `${size}|${seed}|${res}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const N = Math.round(size * res);
  const c = canvas(N);
  const ctx = c.getContext('2d')!;

  // 1 · base + mottling, computed at low resolution (4 units per texel) and smoothly upscaled.
  //     A one-texel wrapped border keeps bilinear filtering seamless across tile edges.
  const m = Math.max(8, Math.round(size / 4));
  const lo = canvas(m + 2);
  const lctx = lo.getContext('2d')!;
  const img = lctx.createImageData(m + 2, m + 2);
  const P1 = 4, P2 = 9;
  const n1 = makeNoise2(seed * 7 + 1, P1);
  const n2 = makeNoise2(seed * 7 + 2, P2);
  const n3 = makeNoise2(seed * 7 + 3, P2 * 2);
  for (let j = 0; j < m + 2; j++) {
    for (let i = 0; i < m + 2; i++) {
      const u = ((i - 1 + m) % m) / m, v = ((j - 1 + m) % m) / m;
      // broad clouds of slightly denser / thinner pulp
      const cloud = n1.fbm(u * P1, v * P1, 2, 2, 0.5) * 0.7 + n2(u * P2, v * P2) * 0.3;
      // finer "cloud-fibre" flocculation typical of hand-made xuan
      const floc = n3(u * P2 * 2, v * P2 * 2);
      const b = cloud * 7 + floc * 2.2; // brightness offset in 0..255 levels
      const warm = cloud * 2.5; // darker patches read a touch more ochre
      const k = (j * (m + 2) + i) * 4;
      img.data[k] = BASE_RGB[0] + b + warm * 0.3;
      img.data[k + 1] = BASE_RGB[1] + b;
      img.data[k + 2] = BASE_RGB[2] + b - warm;
      img.data[k + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const texel = N / m;
  ctx.drawImage(lo, -texel, -texel, N + 2 * texel, N + 2 * texel);

  // 2 · fibres, drawn in tile units.
  ctx.save();
  ctx.scale(res, res);
  ctx.lineCap = 'round';
  const rng = makeRng(seed * 31 + 5);
  const area = (size / 512) ** 2;
  // long bast fibres — the soul of xuan: faint, pale, meandering
  const longN = Math.round(46 * area);
  for (let f = 0; f < longN; f++) {
    const x = rng() * size, y = rng() * size, len = rng.range(40, 150);
    const pts = fibrePath(rng, x, y, len, 0.16);
    const light = rng() < 0.78;
    ctx.lineWidth = rng.range(0.35, 0.9);
    ctx.strokeStyle = light ? `rgba(255,252,244,${rng.range(0.25, 0.55).toFixed(3)})` : `rgba(160,138,104,${rng.range(0.05, 0.11).toFixed(3)})`;
    wrapped(size, x, y, len, (dx, dy) => strokeFibre(ctx, pts, dx, dy));
  }
  // short flecks
  const shortN = Math.round(420 * area);
  for (let f = 0; f < shortN; f++) {
    const x = rng() * size, y = rng() * size, len = rng.range(3, 16);
    const pts = fibrePath(rng, x, y, len, 0.35);
    const light = rng() < 0.6;
    ctx.lineWidth = rng.range(0.3, 0.75);
    ctx.strokeStyle = light ? `rgba(255,251,242,${rng.range(0.2, 0.5).toFixed(3)})` : `rgba(150,126,92,${rng.range(0.05, 0.14).toFixed(3)})`;
    wrapped(size, x, y, len, (dx, dy) => strokeFibre(ctx, pts, dx, dy));
  }
  // a few specks of bark / straw
  const speckN = Math.round(7 * area);
  for (let f = 0; f < speckN; f++) {
    const x = rng() * size, y = rng() * size, r = rng.range(0.3, 0.75);
    ctx.fillStyle = `rgba(120,98,70,${rng.range(0.12, 0.28).toFixed(3)})`;
    const rx = r * rng.range(1, 2.4), rot = rng() * Math.PI;
    wrapped(size, x, y, 3, (dx, dy) => {
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, rx, r, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();

  // 3 · fine tooth: per-pixel luminance noise (cheap hash, no fbm).
  const px = ctx.getImageData(0, 0, N, N);
  const d = px.data;
  let h = (seed * 2654435761) >>> 0;
  for (let k = 0; k < d.length; k += 4) {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    const r = ((h & 1023) / 1023 - 0.5) * 5.5;
    d[k] += r;
    d[k + 1] += r;
    d[k + 2] += r * 0.9;
  }
  ctx.putImageData(px, 0, 0);

  if (tileCache.size > 8) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, c);
  return c;
}

/** The device scale (px per user unit) of a context's current transform. */
export function deviceScale(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): number {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  if (!m) return 1;
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

/** Fill a rectangle (0,0,w,h in the context's current user space) with paper. */
export function fillPaper(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7): void {
  const res = deviceScale(ctx);
  const tile = makePaperTile(512, seed, res);
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.save();
  if (pat) {
    const k = 512 / tile.width;
    if (k !== 1 && typeof pat.setTransform === 'function') pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.fillStyle = pat;
  } else ctx.fillStyle = PAPER_BASE;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ink grain — alpha masks used by the brush engine.

const grainCache = new Map<string, HTMLCanvasElement>();

/**
 * A seamless 256×256 alpha mask (white, alpha = how much the paper resists ink there).
 * - `fine`: pixel tooth + pale fibres; for strokes, dots and petals (mean alpha ≈ 0.1).
 * - `wash`: adds low-frequency mottling, for diluted washes that pool unevenly (mean ≈ 0.2).
 * - `punch`: very sparse tooth + fibres; punched out of finished rasters (see brush.rasterize).
 */
export function inkGrainTile(variant: 'fine' | 'wash' | 'punch' = 'fine'): HTMLCanvasElement {
  const hit = grainCache.get(variant);
  if (hit) return hit;
  const N = 256;
  const c = canvas(N);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const noise = makeNoise2(variant === 'wash' ? 911 : 577, 8);
  const noiseLo = makeNoise2(912, 3);
  let h = variant === 'punch' ? 0x2545f491 : 0x9e3779b9;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      h ^= h << 13; h >>>= 0;
      h ^= h >>> 17;
      h ^= h << 5; h >>>= 0;
      const r = (h & 65535) / 65535;
      let a: number;
      if (variant === 'punch') {
        a = r > 0.93 ? (r - 0.93) * 6 : 0;
      } else {
        const mid = noise((x / N) * 8, (y / N) * 8);
        a = r * r * r * 0.34 + Math.max(0, mid) * 0.12;
        if (variant === 'wash') {
          const lo = noiseLo.fbm((x / N) * 3, (y / N) * 3, 2);
          a += clamp(lo * 0.9 + 0.12, 0, 0.55) + Math.max(0, mid) * 0.08;
        }
      }
      const k = (y * N + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = clamp(a, 0, 1) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // pale fibres resisting the ink
  const rng = makeRng(variant === 'wash' ? 41 : 43);
  ctx.lineCap = 'round';
  const nf = variant === 'punch' ? 26 : 34;
  for (let f = 0; f < nf; f++) {
    const x = rng() * N, y = rng() * N, len = rng.range(10, 60);
    const pts = fibrePath(rng, x, y, len, 0.2);
    ctx.lineWidth = rng.range(0.5, 1.2);
    ctx.strokeStyle = `rgba(255,255,255,${(variant === 'punch' ? rng.range(0.25, 0.5) : rng.range(0.2, 0.45)).toFixed(3)})`;
    wrapped(N, x, y, len, (dx, dy) => strokeFibre(ctx, pts, dx, dy));
  }
  grainCache.set(variant, c);
  return c;
}

const patCache = new WeakMap<object, Map<string, CanvasPattern>>();

/**
 * A repeating pattern of `color` whose alpha is modulated by the paper grain — fill a shape with
 * it and the ink sits in the fibres. Cached per context.
 */
export function grainPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  color: string,
  variant: 'fine' | 'wash' = 'fine',
): CanvasPattern | string {
  let m = patCache.get(ctx);
  if (!m) patCache.set(ctx, (m = new Map()));
  const key = `${color}|${variant}`;
  let p = m.get(key);
  if (!p) {
    const tile = coloredGrainTile(color, variant);
    p = ctx.createPattern(tile, 'repeat') ?? undefined;
    if (!p) return color;
    m.set(key, p);
  }
  return p;
}

const colTileCache = new Map<string, HTMLCanvasElement>();

function coloredGrainTile(color: string, variant: 'fine' | 'wash'): HTMLCanvasElement {
  const key = `${color}|${variant}`;
  let c = colTileCache.get(key);
  if (c) return c;
  const g = inkGrainTile(variant);
  c = canvas(g.width);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(g, 0, 0);
  colTileCache.set(key, c);
  return c;
}
