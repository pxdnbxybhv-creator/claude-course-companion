// Seal stamps (印章): a carved stone seal pressed in cinnabar paste (印泥).
//
// Pipeline (all at a supersampled working resolution, then downsampled):
//   1. a crisp *mask* of where the stone face carries paste: the seal face (a superellipse —
//      rounded square / circle / vertical oval) minus the carved glyphs (白文 bai), or a frame
//      plus raised glyphs (朱文 zhu). Glyphs are measured by their ink box and scaled
//      non-uniformly so they fill their cells the way carved seal characters do.
//   2. stone damage: chips bitten out of the rim, sometimes a break in a zhu frame.
//   3. blur + noisy threshold → rounded corners and eroded, granular edges (like paste that
//      transferred unevenly), then paste density: low-frequency mottling, one side pressed
//      lighter, tiny paper speckles showing through the red, and fine grain.
//
// Deterministic for a given (text, options, seed). Cost: ~3 ms at 24 px, ~15–30 ms at 120 px @2x —
// callers should cache the canvas. makeSeal is synchronous and uses whatever fonts are loaded
// *now*: `await sealReady(text)` first (it loads the brush/kai fonts for those characters).
import { makeRng, makeNoise2, hashString, mixSeed, clamp } from '../core/rng';

/** Cinnabar seal paste. */
export const SEAL_RED = '#b93a2b';
/** Heavy brush/kai faces first; system kai & serif fallbacks. */
export const SEAL_FONT = "'Ma Shan Zheng','LXGW WenKai','STKaiti','KaiTi','Kaiti SC','Songti SC',serif";

export interface SealOptions {
  /** Edge length in css px. The canvas is always square (an oval seal sits centred in it). */
  size: number;
  dpr?: number;
  /** 'bai' 白文 = white characters carved into red; 'zhu' 朱文 = red characters, red border. */
  style?: 'bai' | 'zhu';
  /** 'square' (default) or 'round' / 'oval' for leisure seals (闲章). */
  shape?: 'square' | 'round' | 'oval';
  color?: string;
  seed?: number;
  /** 0..1 weathering (chips, erosion, speckles, uneven pressure). Default 0.5. */
  wear?: number;
  /** CSS font-family list for the glyphs. Default SEAL_FONT. */
  font?: string;
  /** Three characters: '1-2' = right column one tall char, left column two (default); '2-1' the reverse. */
  layout3?: '1-2' | '2-1';
}

/**
 * Load the seal fonts for `text` (resolves when loaded, or when loading fails / is unsupported).
 * Call before makeSeal so the first stamp is not carved in a fallback face.
 */
export async function sealReady(text = '印', font = SEAL_FONT): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return;
  const families = font.split(',').map((f) => f.trim()).filter((f) => /^['"]/.test(f));
  await Promise.all(families.map((f) => fonts.load(`64px ${f}`, text).catch(() => [])));
}

interface Cell { x: number; y: number; w: number; h: number }

/** Superellipse outline: p = 2 is an ellipse, large p a rounded rectangle. */
function faceOutline(cx: number, cy: number, a: number, b: number, p: number, n: number,
  wobble: (ang: number) => number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const e = 2 / p;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const k = 1 + wobble(t);
    out.push({ x: cx + a * k * Math.sign(c) * Math.abs(c) ** e, y: cy + b * k * Math.sign(s) * Math.abs(s) ** e });
  }
  return out;
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** Split the content box into reading-order cells (columns right → left, top → bottom). */
function layoutCells(n: number, box: Cell, gut: number, shape: string, layout3: '1-2' | '2-1'): Cell[] {
  const { x, y, w, h } = box;
  const halfW = (w - gut) / 2, halfH = (h - gut) / 2;
  const right = x + halfW + gut, left = x;
  const top = y, bottom = y + halfH + gut;
  if (n <= 1) return [box];
  if (n === 2 || (n === 3 && shape === 'oval')) {
    const ch = (h - gut * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => ({ x, y: y + i * (ch + gut), w, h: ch }));
  }
  if (n === 3) {
    return layout3 === '2-1'
      ? [{ x: right, y: top, w: halfW, h: halfH }, { x: right, y: bottom, w: halfW, h: halfH }, { x: left, y, w: halfW, h }]
      : [{ x: right, y, w: halfW, h }, { x: left, y: top, w: halfW, h: halfH }, { x: left, y: bottom, w: halfW, h: halfH }];
  }
  return [
    { x: right, y: top, w: halfW, h: halfH }, { x: right, y: bottom, w: halfW, h: halfH },
    { x: left, y: top, w: halfW, h: halfH }, { x: left, y: bottom, w: halfW, h: halfH },
  ];
}

/** Draw one glyph filling `cell` (ink box scaled non-uniformly, anisotropy limited), thickened by `lw` px. */
function carveGlyph(ctx: CanvasRenderingContext2D, ch: string, cell: Cell, font: string, lw: number) {
  const F = 200;
  ctx.font = `${F}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(ch);
  let l = m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight;
  let asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  if (!(r + l > 1) || !(asc + desc > 1)) { l = 0; r = m.width || F; asc = F * 0.84; desc = F * 0.1; }
  const inkW = l + r, inkH = asc + desc;
  const cw = Math.max(1, cell.w - lw), chh = Math.max(1, cell.h - lw);
  let sx = cw / inkW, sy = chh / inkH;
  const lo = Math.min(sx, sy), maxAniso = 1.45;
  sx = Math.min(sx, lo * maxAniso);
  sy = Math.min(sy, lo * maxAniso);
  ctx.save();
  ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
  ctx.scale(sx, sy);
  const ox = -(r - l) / 2, oy = (asc - desc) / 2;
  ctx.fillText(ch, ox, oy);
  if (lw > 0) {
    ctx.lineWidth = lw / Math.sqrt(sx * sy);
    ctx.lineJoin = 'round';
    ctx.strokeText(ch, ox, oy);
  }
  ctx.restore();
}

/** Separable box blur (running sums), radius r px, in place via a scratch buffer. */
function boxBlur(src: Float32Array, W: number, H: number, r: number, tmp: Float32Array) {
  if (r < 1) return;
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      src[y * W + x] = acc * inv;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Render 1–4 characters as a weathered stone seal impression. Returns a transparent square canvas. */
export function makeSeal(text: string, o: SealOptions): HTMLCanvasElement {
  const dpr = o.dpr ?? 1;
  const style = o.style ?? 'bai';
  const shape = o.shape ?? 'square';
  const wear = clamp(o.wear ?? 0.5, 0, 1);
  const font = o.font ?? SEAL_FONT;
  const chars = Array.from((text ?? '').replace(/\s+/g, '')).slice(0, 4);
  if (!chars.length) chars.push('印');
  const seed = o.seed ?? hashString(`${chars.join('')}|${style}|${shape}`);
  const rng = makeRng(mixSeed(seed, 0x5ea1));

  const N = Math.max(8, Math.round(o.size * dpr));
  const ss = N < 100 ? 3 : N < 200 ? 2 : 1;
  const M = N * ss;

  // ---- 1. mask -----------------------------------------------------------------------------
  const work = document.createElement('canvas');
  work.width = work.height = M;
  const g = work.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';

  const cx = M / 2, cy = M / 2;
  const a = shape === 'oval' ? M * 0.335 : M * 0.468;
  const b = M * 0.468;
  const p = shape === 'square' ? 11 + rng() * 4 : 2;
  const nWob = makeNoise2(mixSeed(seed, 11));
  const wobAmp = 0.004 + 0.006 * wear;
  const wob = (t: number) => wobAmp * nWob.fbm(Math.cos(t) * 1.6 + 5, Math.sin(t) * 1.6 + 5, 3);
  const face = faceOutline(cx, cy, a, b, p, 480, wob);

  g.beginPath();
  tracePoly(g, face);
  g.fill();

  const U = M / 100; // one percent of the seal
  const n = chars.length;
  let inset: number;
  if (style === 'zhu') {
    const fw = U * (shape === 'square' ? 6.2 : 5.4) * (0.9 + 0.2 * rng());
    const inner = faceOutline(cx, cy, a - fw, b - fw, shape === 'square' ? p + 4 : 2, 480,
      (t) => wob(t + 1.7) * 0.7);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    tracePoly(g, inner);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    inset = fw + U * (n === 1 ? 5 : 3.8);
  } else {
    inset = U * (n === 1 ? 11 : 8.5);
  }

  // Content box: the whole inner square, or the inscribed box of a round/oval face.
  let bw: number, bh: number;
  if (shape === 'square') { bw = a - inset; bh = b - inset; }
  else {
    const k = n === 1 ? 0.8 : 0.74;
    bw = (a - inset) * k; bh = (b - inset) * (shape === 'oval' ? 0.84 : k);
  }
  const box: Cell = { x: cx - bw, y: cy - bh, w: bw * 2, h: bh * 2 };
  const gut = U * (style === 'bai' ? 4.2 : 5);
  const cells = layoutCells(n, box, gut, shape, o.layout3 ?? '1-2');

  g.globalCompositeOperation = style === 'bai' ? 'destination-out' : 'source-over';
  chars.forEach((ch, i) => {
    const c = cells[i];
    const cmin = Math.min(c.w, c.h);
    const lw = style === 'bai' ? cmin * 0.05 : cmin * 0.022;
    carveGlyph(g, ch, c, font, lw);
  });
  g.globalCompositeOperation = 'source-over';

  // ---- 2. stone damage -----------------------------------------------------------------------
  g.globalCompositeOperation = 'destination-out';
  const chips = Math.round(2 + wear * 6 + rng() * 2);
  for (let i = 0; i < chips; i++) {
    const idx = Math.floor(rng() * face.length);
    const q = face[idx];
    const nx = q.x - cx, ny = q.y - cy, nl = Math.hypot(nx, ny) || 1;
    const r = U * (0.8 + rng() * rng() * 3.5) * (0.5 + wear);
    const out = r * (0.35 + rng() * 0.4);
    const px = q.x + (nx / nl) * out, py = q.y + (ny / nl) * out;
    g.beginPath();
    const k = 7;
    for (let j = 0; j < k; j++) {
      const t = (j / k) * Math.PI * 2 + rng() * 0.5;
      const rr = r * (0.55 + rng() * 0.6);
      const x = px + Math.cos(t) * rr * 1.3, y = py + Math.sin(t) * rr;
      if (j) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  // A worn gap in a zhu frame (残边) now and then.
  if (style === 'zhu' && rng() < 0.35 + wear * 0.5) {
    const q = face[Math.floor(rng() * face.length)];
    const len = U * (2 + rng() * 5);
    g.save();
    g.translate(q.x, q.y);
    g.rotate(Math.atan2(q.y - cy, q.x - cx));
    g.beginPath();
    g.ellipse(0, 0, U * 7, len / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.globalCompositeOperation = 'source-over';

  // ---- 3. paste ------------------------------------------------------------------------------
  const img = g.getImageData(0, 0, M, M);
  const d = img.data;
  const A = new Float32Array(M * M);
  for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3] / 255;
  const tmp = new Float32Array(M * M);
  const rb = Math.max(1, Math.round(M * 0.0045));
  boxBlur(A, M, M, rb, tmp);
  boxBlur(A, M, M, rb, tmp);
  const gain = 1.6 * rb + 1;

  const nEdge = makeNoise2(mixSeed(seed, 21));
  const nLow = makeNoise2(mixSeed(seed, 22));
  const nSpk = makeNoise2(mixSeed(seed, 23));
  const nGrain = makeNoise2(mixSeed(seed, 24));
  const [R0, G0, B0] = hexRgb(o.color ?? SEAL_RED);
  const pAng = rng() * Math.PI * 2;
  const pcx = Math.cos(pAng), pcy = Math.sin(pAng);
  const pAmt = 0.12 + 0.22 * wear;
  const edgeAmt = 0.1 + 0.2 * wear;
  const spkAmt = 0.25 + 0.75 * wear;
  const invM = 1 / M;

  for (let y = 0; y < M; y++) {
    const v = y * invM;
    for (let x = 0; x < M; x++) {
      const i = y * M + x;
      const bv = A[i];
      const o4 = i * 4;
      if (bv < 0.03) { d[o4 + 3] = 0; continue; }
      const u = x * invM;
      // Pressure: 0 on the firmly pressed side → 1 on the light side.
      const side = clamp((u - 0.5) * pcx + (v - 0.5) * pcy + 0.5, 0, 1);
      const light = side * side;
      let t = 0.5 + light * pAmt * 0.45;
      if (bv < 0.97) t += edgeAmt * (nEdge.fbm(u * 34, v * 34, 3) + 0.45 * nEdge(u * 110, v * 110));
      let c = (bv - t) * gain + 0.5;
      if (c <= 0) { d[o4 + 3] = 0; continue; }
      if (c > 1) c = 1;
      const low = nLow.fbm(u * 3.4, v * 3.4, 3);
      let dens = (0.9 + 0.12 * low) * (1 - pAmt * light);
      // Paper showing through where the paste did not take.
      const s = nSpk(u * 62, v * 62) * 0.7 + nSpk(u * 150 + 3.1, v * 150 + 7.7) * 0.5;
      const th = 0.5 - 0.28 * light * spkAmt - 0.08 * spkAmt;
      if (s > th) dens *= 1 - Math.min(1, (s - th) * 7) * (0.55 + 0.4 * spkAmt);
      dens *= 0.93 + 0.07 * nGrain(u * 240, v * 240);
      const al = c * clamp(dens, 0, 1);
      // Thick paste reads slightly deeper; thin paste slightly warmer.
      const deep = 1 - 0.1 * Math.max(0, low) - 0.05 * (1 - light);
      d[o4] = R0 * deep + (1 - dens) * 12;
      d[o4 + 1] = G0 * deep;
      d[o4 + 2] = B0 * deep;
      d[o4 + 3] = al * 255;
    }
  }
  g.putImageData(img, 0, 0);

  if (ss === 1) return work;
  const out = document.createElement('canvas');
  out.width = out.height = N;
  const oc = out.getContext('2d')!;
  oc.imageSmoothingEnabled = true;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(work, 0, 0, N, N);
  return out;
}
