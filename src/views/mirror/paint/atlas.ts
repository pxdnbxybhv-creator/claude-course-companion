// Atlas pages: sprites are painted once into small canvases, then packed on shelves into 1024² pages
// (one texture per page for drawImage). Bodies that flash get a hit-flash twin (a white body in an ink
// rim), and on demand a 倒影 twin (lightness inverted, hue kept: white ink on black paper). Figures get a
// moonlight rim (and pale ones an ink hairline) so they stand off the paper.
import { paintStroke } from '../../../ink/brush';
import { grainPattern } from '../../../ink/paper';
import type { Sprite } from '../types';
import type { Spec } from './kit';
import { B, extentOps } from './kit';
import { PAPER } from './palette';

export const PAGE = 1024;

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  return g;
}

export interface Painted {
  img: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  /** Size in u (including the padding) and the anchor (0..1). */
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export interface RenderOpts {
  /** px per u. */
  k: number;
  seed: number;
  /** Halo width in px. */
  halo: number;
  /** Lightness-invert the result (倒影). */
  invert?: boolean;
  /** Replace every colour by white ink on a black halo (镜主). */
  ghost?: boolean;
  /** Bake the hit-flash twin (default true). Only bodies that flash (enemies, summons, the companion)
   *  need one: everything else shares its sprite as its "flash", which halves its memory. */
  flash?: boolean;
  /** Moonlight rim: a thin moon-white edge along the silhouette's upper-left, at this alpha (0 none). */
  rim?: number;
  /** An ink hairline outside the halo at this alpha (0 none): pale figures on pale paper get an edge. */
  outline?: number;
  /** Ink volume (0 none … 1): moonlight wraps the body's upper left and shade gathers at its lower
   *  right, soft and inside the silhouette, so a flat ink body reads as rounded. */
  volume?: number;
}

/** The moonlight rim's colour and the ink of the outline and of the flash twin's rim. */
const RIM = '#fbfcff';
const RIM_INK = '20,18,16';

/** Paint a spec's variant into a fresh canvas with its halo; plus its flash twin. */
export function renderSpec(spec: Spec, v: number, o: RenderOpts): Painted {
  const k = o.k;
  const haloKind = o.ghost ? 'dark' : spec.halo ?? 'paper';
  const hp = haloKind === 'none' ? 0 : o.halo;
  const ol = !o.ghost && o.outline && hp > 0 ? Math.max(1, Math.round(hp * 0.6)) : 0;
  const pad = hp + ol + 2;
  const b = new B(o.seed);
  spec.paint(b, v);
  // the canvas covers what the marks really reach (brush half-widths, discs, glyphs), not just the box
  const [x0, y0, x1, y1] = extentOps(b.ops, spec.box);
  const cw = Math.ceil((x1 - x0) * k) + pad * 2, ch = Math.ceil((y1 - y0) * k) + pad * 2;
  const ox = pad - x0 * k, oy = pad - y0 * k;
  // paint on one shared scratch context: the brush's grain patterns are cached per context
  const sc = scratch(cw, ch);
  const g = sc.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, cw, ch);
  for (const op of b.ops) {
    g.setTransform(k, 0, 0, k, ox, oy);
    if (op.k === 'stroke') paintStroke(g, op.s);
    else { g.save(); try { op.f(g); } finally { g.restore(); } }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const ink = canvas(cw, ch);
  ctx2d(ink).drawImage(sc.c, 0, 0, cw, ch, 0, 0, cw, ch);
  if (o.ghost) ghostify(ink);
  // the white body of the flash twin (before the rim light: a flash is flat white)
  const wantFlash = o.flash !== false;
  const white = wantFlash ? tinted(ink, '#fffdf6') : null;
  if (!o.ghost && o.volume && o.volume > 0) volume(ink, Math.max(2, Math.round(k * 2.6)), o.volume);
  if (!o.ghost && o.rim && o.rim > 0) rimLight(ink, Math.max(1, Math.round(k * 0.9)), o.rim);
  let out = ink;
  if (hp > 0) {
    out = canvas(cw, ch);
    const q = ctx2d(out);
    if (ol > 0) {
      // the ink hairline: the silhouette grown by halo + outline, under the paper halo
      stamp(q, ink, hp + ol);
      q.globalCompositeOperation = 'source-in';
      q.fillStyle = `rgba(${RIM_INK},${Math.min(1, o.outline!)})`;
      q.fillRect(0, 0, cw, ch);
      q.globalCompositeOperation = 'source-over';
      const h = canvas(cw, ch), hq = ctx2d(h);
      stamp(hq, ink, hp);
      hq.globalCompositeOperation = 'source-in';
      hq.fillStyle = haloKind === 'dark' ? 'rgba(12,12,16,0.78)' : hexA(PAPER, 0.92);
      hq.fillRect(0, 0, cw, ch);
      q.drawImage(h, 0, 0);
      h.width = h.height = 1;
    } else {
      stamp(q, ink, hp);
      q.globalCompositeOperation = 'source-in';
      q.fillStyle = haloKind === 'dark' ? 'rgba(12,12,16,0.78)' : hexA(PAPER, 0.92);
      q.fillRect(0, 0, cw, ch);
      q.globalCompositeOperation = 'source-over';
    }
    q.drawImage(ink, 0, 0);
  }
  if (o.invert) invertLightness(out);
  let flash = out;
  if (wantFlash && white) {
    // the twin: a crisp white body inside an ink rim (the halo turned ink), so a struck body reads as
    // a flash of light on pale paper rather than a hole cut in it
    flash = canvas(cw, ch);
    const f = ctx2d(flash);
    f.drawImage(out, 0, 0);
    f.globalCompositeOperation = 'source-in';
    f.fillStyle = o.invert ? 'rgba(240,238,232,0.9)' : `rgba(${RIM_INK},0.9)`;
    f.fillRect(0, 0, cw, ch);
    f.globalCompositeOperation = 'source-over';
    f.drawImage(white, 0, 0);
    white.width = white.height = 1;
  }
  return { img: out, flash, w: cw / k, h: ch / k, ax: ox / cw, ay: oy / ch };
}

/** Stamp `src` at 8 offsets of distance d (a dilation: the halo's shape). */
function stamp(q: CanvasRenderingContext2D, src: HTMLCanvasElement, d: number) {
  const e = d * 0.72;
  for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [e, e], [-e, e], [e, -e], [-e, -e]]) q.drawImage(src, dx, dy);
}
/** A copy of `src` with every painted pixel replaced by `color` (alpha kept). */
function tinted(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = canvas(src.width, src.height), g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
/** Moonlight from the upper left: the silhouette minus itself shifted down-right by d px leaves a thin
 *  band along the lit edges; laid over the body (source-atop) in moon-white at alpha a. */
function rimLight(ink: HTMLCanvasElement, d: number, a: number) {
  const m = canvas(ink.width, ink.height), g = ctx2d(m);
  g.drawImage(ink, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(ink, d, d);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = RIM;
  g.fillRect(0, 0, m.width, m.height);
  const q = ctx2d(ink);
  q.globalCompositeOperation = 'source-atop';
  q.globalAlpha = a;
  q.drawImage(m, 0, 0);
  q.globalAlpha = 1;
  q.globalCompositeOperation = 'source-over';
  m.width = m.height = 1;
}

/** Ink volume: the silhouette minus itself shifted d px leaves a band along the edges facing away
 *  from the shift. Each band is made at 1/f of the sprite's resolution (so it costs little and comes
 *  out soft) and laid over the body smoothed (source-atop): moon-white on the upper left (light
 *  wrapping a rounded body), ink on the lower right (the shaded side). */
function volume(ink: HTMLCanvasElement, d: number, a: number) {
  const w = ink.width, h = ink.height;
  const f = Math.max(2, Math.round(d * 0.75));
  const sw = Math.max(1, Math.ceil(w / f)), sh = Math.max(1, Math.ceil(h / f));
  const small = canvas(sw, sh), sg = ctx2d(small);
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = 'high';
  const q = ctx2d(ink);
  q.imageSmoothingEnabled = true;
  q.imageSmoothingQuality = 'high';
  const band = (dx: number, dy: number, color: string, alpha: number) => {
    sg.globalCompositeOperation = 'copy';
    sg.drawImage(ink, 0, 0, sw * f, sh * f, 0, 0, sw, sh);
    sg.globalCompositeOperation = 'destination-out';
    sg.drawImage(ink, 0, 0, sw * f, sh * f, dx / f, dy / f, sw, sh);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = color;
    sg.fillRect(0, 0, sw, sh);
    q.globalCompositeOperation = 'source-atop';
    q.globalAlpha = alpha;
    q.drawImage(small, 0, 0, sw, sh, 0, 0, sw * f, sh * f);
  };
  band(d, d, SHEEN, 0.4 * a);
  band(-d, -d, `rgb(${RIM_INK})`, 0.3 * a);
  q.globalAlpha = 1;
  q.globalCompositeOperation = 'source-over';
  small.width = small.height = 1;
}
/** The volume's light: a cool moon-white. */
const SHEEN = '#eef3ff';

/** Warm the brush's grain patterns on the shared scratch context for these colours (the pattern
 *  cache is per context and colour; building a tile is the slow part of a sprite's first paint). */
export function warmGrain(colors: Iterable<string>, wash: Iterable<string>): void {
  const g = scratch(256, 256).g;
  for (const c of colors) grainPattern(g, c, 'fine');
  for (const c of wash) grainPattern(g, c, 'wash');
}

let scr: { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
function scratch(w: number, h: number) {
  if (!scr) { const c = canvas(Math.max(256, w), Math.max(256, h)); scr = { c, g: ctx2d(c) }; }
  else if (scr.c.width < w || scr.c.height < h) { scr.c.width = Math.max(scr.c.width, w); scr.c.height = Math.max(scr.c.height, h); }
  return scr;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 倒影: invert each pixel's luminance, keep its hue and saturation (the W3C SetLum/ClipColor). */
export function invertLightness(c: HTMLCanvasElement): void {
  const g = ctx2d(c);
  let img: ImageData;
  try { img = g.getImageData(0, 0, c.width, c.height); } catch { return; }
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i] / 255, gg = d[i + 1] / 255, bb = d[i + 2] / 255;
    const L = 0.3 * r + 0.59 * gg + 0.11 * bb;
    const dl = 1 - 2 * L;
    r += dl; gg += dl; bb += dl;
    const l = 1 - L;
    const n = Math.min(r, gg, bb), x = Math.max(r, gg, bb);
    if (n < 0) { const s = l / (l - n || 1); r = l + (r - l) * s; gg = l + (gg - l) * s; bb = l + (bb - l) * s; }
    if (x > 1) { const s = (1 - l) / (x - l || 1); r = l + (r - l) * s; gg = l + (gg - l) * s; bb = l + (bb - l) * s; }
    d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = bb * 255;
  }
  g.putImageData(img, 0, 0);
}

/** 镜主: white ink on black — luminance inverted to grey, a cold tint. */
function ghostify(c: HTMLCanvasElement): void {
  const g = ctx2d(c);
  let img: ImageData;
  try { img = g.getImageData(0, 0, c.width, c.height); } catch { return; }
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const L = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const v = 1 - L * 0.85;
    d[i] = 235 * v + 10; d[i + 1] = 240 * v + 10; d[i + 2] = 250 * v + 5;
  }
  g.putImageData(img, 0, 0);
}

/** Shelf-packed pages. Several shelves stay open at once, and a sprite goes on the first shelf of a
 *  similar height with room left, so a tall zone effect never wastes a row of little coins. */
interface Shelf { page: HTMLCanvasElement; y: number; h: number; x: number }
export class Pages {
  pages: HTMLCanvasElement[] = [];
  /** Oversized sprites that keep their own canvas. */
  private own: HTMLCanvasElement[] = [];
  private shelves: Shelf[] = [];
  /** Bytes held (RGBA pages plus oversized canvases). */
  bytes(): number {
    let n = 0;
    for (const c of this.pages) n += c.width * c.height * 4;
    for (const c of this.own) n += c.width * c.height * 4;
    return n;
  }
  /** The next free row of the newest page. */
  private top = 0;
  /** Copy `src` into a page; returns the page and the rect. Oversized images keep their own canvas. */
  put(src: HTMLCanvasElement): { img: HTMLCanvasElement; sx: number; sy: number } {
    const w = src.width, h = src.height;
    if (w > PAGE / 2 || h > PAGE / 2) { this.own.push(src); return { img: src, sx: 0, sy: 0 }; }
    let best: Shelf | null = null;
    for (const sh of this.shelves) {
      if (sh.h < h || sh.h > h * 1.4 + 8 || sh.x + w > PAGE) continue;
      if (!best || sh.h < best.h) best = sh;
    }
    if (!best) {
      let page = this.pages[this.pages.length - 1];
      if (!page || this.top + h > PAGE) {
        page = canvas(PAGE, PAGE);
        this.pages.push(page);
        this.top = 0;
        // shelves of full pages that are nearly full are dropped from the search
        this.shelves = this.shelves.filter((sh) => sh.x < PAGE - 48);
      }
      // round the shelf height up a little so the next similar sprites fit too
      const sh = Math.min(PAGE - this.top, Math.ceil(h * 1.1) + 2);
      best = { page, y: this.top, h: sh, x: 0 };
      this.shelves.push(best);
      this.top += sh + 1;
    }
    const sx = best.x, sy = best.y;
    ctx2d(best.page).drawImage(src, sx, sy);
    best.x += w + 1;
    return { img: best.page, sx, sy };
  }
  dispose() {
    for (const p of this.pages) { p.width = 1; p.height = 1; }
    for (const p of this.own) { p.width = 1; p.height = 1; }
    this.pages = [];
    this.own = [];
    this.shelves = [];
    this.top = 0;
  }
}

/** Pack a painted pair into pages as two Sprites. */
export function pack(pages: Pages, p: Painted): { s: Sprite; f: Sprite } {
  const a = pages.put(p.img), b = p.flash === p.img ? a : pages.put(p.flash);
  const base = { sw: p.img.width, sh: p.img.height, w: p.w, h: p.h, ax: p.ax, ay: p.ay };
  return { s: { img: a.img, sx: a.sx, sy: a.sy, ...base }, f: { img: b.img, sx: b.sx, sy: b.sy, ...base } };
}
