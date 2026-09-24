// Mounting (装裱) for the poster: the wall, woven silk, the hanging scroll's rods, roller and cord.
// Everything is painted at poster scale (1 unit = 1 px of the 1080-wide export).
import { makeNoise2, makeRng } from '../../core/rng';

export type RGB = [number, number, number];

export interface MountPalette {
  /** Main light silk: side borders, 隔水 strips, 惊燕 ribbons. */
  body: RGB;
  /** Deeper silk of 天头 / 地头. */
  head: RGB;
  /** Thin 局条 strips framing the painting. */
  line: string;
  wallHi: string;
  wallLo: string;
  shadow: string;
  cord: string;
  caption: string;
}

export function mountPalette(dark: boolean): MountPalette {
  return dark
    ? {
        body: [206, 194, 167], head: [70, 82, 84], line: '#a6946d',
        wallHi: '#2d2e31', wallLo: '#121315', shadow: 'rgba(0,0,0,0.62)', cord: '#8a7962', caption: 'rgba(236,228,210,0.62)',
      }
    : {
        body: [219, 207, 180], head: [88, 101, 101], line: '#b39f78',
        wallHi: '#e9e3d6', wallLo: '#c8bfae', shadow: 'rgba(40,30,15,0.34)', cord: '#6d5c45', caption: 'rgba(40,34,26,0.66)',
      };
}

export const rgb = (c: RGB, k = 1, a = 1) =>
  `rgba(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))},${a})`;

function canvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const silkCache = new Map<string, HTMLCanvasElement>();

/**
 * A seamless tile of plain-woven silk in `color`: over/under threads, slubbed wefts, a soft sheen,
 * and (optionally) a faint woven lozenge damask (菱格暗花).
 */
export function silkTile(color: RGB, seed = 3, damask = 0): HTMLCanvasElement {
  const key = `${color.join(',')}|${seed}|${damask}`;
  const hit = silkCache.get(key);
  if (hit) return hit;
  const N = 256;
  const T = 128; // threads per tile (2 px each)
  const c = canvas(N);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const rng = makeRng(seed * 97 + 11);
  const weft = Array.from({ length: T }, () => rng.gauss() * 0.5);
  const warp = Array.from({ length: T }, () => rng.gauss() * 0.4);
  // a few slightly thicker slubs along a weft — kept faint so the tile never reads as stripes
  for (let i = 0; i < 5; i++) weft[rng.int(0, T - 1)] += rng.range(0.5, 1.1) * (rng() < 0.5 ? 1 : -1);
  const mott = makeNoise2(seed * 13 + 5, 3);
  let h = (seed * 2654435761) >>> 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const tx = x >> 1, ty = y >> 1;
      const over = (tx + ty) & 1; // 1 = warp on top
      const sub = over ? (x & 1) : (y & 1); // position across the thread → round sheen
      let b = over ? 2 + warp[tx] * 2 : -1.6 + weft[ty] * 2.2;
      b += sub ? -1.3 : 1.1;
      b += mott(x / N * 3, y / N * 3) * 4;
      if (damask) {
        // lozenge lattice, period 32: the damask shows as a change of sheen, never of colour
        const u = ((x + y) % 64 + 64) % 64, v = ((x - y) % 64 + 64) % 64;
        const du = Math.abs(u - 32), dv = Math.abs(v - 32);
        const ring = Math.abs(du + dv - 24) < 3 || (du < 3.5 && dv < 3.5);
        if (ring) b += (over ? 3.6 : -1.4) * damask;
      }
      h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
      b += ((h & 255) / 255 - 0.5) * 3;
      const k = (y * N + x) * 4;
      d[k] = color[0] + b;
      d[k + 1] = color[1] + b;
      d[k + 2] = color[2] + b * 0.9;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  silkCache.set(key, c);
  return c;
}

export function fillSilk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: RGB, seed = 3, damask = 0): void {
  const pat = ctx.createPattern(silkTile(color, seed, damask), 'repeat');
  ctx.save();
  ctx.fillStyle = pat ?? rgb(color);
  ctx.translate(x, y);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

let plasterTile: HTMLCanvasElement | null = null;
function plaster(): HTMLCanvasElement {
  if (plasterTile) return plasterTile;
  const N = 256;
  const c = canvas(N);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const n1 = makeNoise2(71, 6), n2 = makeNoise2(72, 24);
  let h = 0x51ed270b;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
      const v = n1.fbm(x / N * 6, y / N * 6, 3) * 0.6 + n2(x / N * 24, y / N * 24) * 0.25 + ((h & 255) / 255 - 0.5) * 0.35;
      const k = (y * N + x) * 4;
      const white = v > 0;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = white ? 255 : 0;
      img.data[k + 3] = Math.min(255, Math.abs(v) * 34);
    }
  }
  ctx.putImageData(img, 0, 0);
  return (plasterTile = c);
}

/** A quiet lime-plaster wall lit from above. */
export function drawWall(ctx: CanvasRenderingContext2D, W: number, H: number, p: MountPalette): void {
  const g = ctx.createRadialGradient(W / 2, H * 0.22, 0, W / 2, H * 0.3, Math.hypot(W, H) * 0.72);
  g.addColorStop(0, p.wallHi);
  g.addColorStop(1, p.wallLo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const pat = ctx.createPattern(plaster(), 'repeat');
  if (pat) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Vertical cylinder shading for a horizontal rod between y and y+h. */
function cylinder(ctx: CanvasRenderingContext2D, y: number, h: number, c: RGB, gloss = 1): CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, rgb(c, 0.62));
  g.addColorStop(0.2, rgb(c, 1 + 0.22 * gloss));
  g.addColorStop(0.32, rgb(c, 1 + 0.08 * gloss));
  g.addColorStop(0.7, rgb(c, 0.8));
  g.addColorStop(1, rgb(c, 0.5));
  return g;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface HangingScrollLayout {
  /** Outer silk of the scroll (rod top to roller centre). */
  x: number;
  w: number;
  top: number;
  /** 天头 height (below the top rod). */
  head: number;
  /** 隔水 below the painting (the one above is whatever lies between 天头 and the painting). */
  gapB: number;
  /** 地头 height (above the roller). */
  foot: number;
  painting: Rect;
  rollerD: number;
  nailY: number;
}

/**
 * A 立轴 in 宣和装 style: 天头/地头 in deep silk with two 惊燕 ribbons, light silk surround and
 * 隔水, thin 局条 lines, a top rod on a cord, and a silk-wrapped roller with wooden knobs.
 * `paint` draws the painting (already translated & clipped to the painting rect).
 */
export function drawHangingScroll(ctx: CanvasRenderingContext2D, L: HangingScrollLayout, p: MountPalette, paint: (ctx: CanvasRenderingContext2D) => void): void {
  const { x, w, top, head, foot, gapB, painting: P, rollerD } = L;
  const rodH = 16;
  const footTop = P.y + P.h + gapB;
  const rollerY = footTop + foot; // top of roller
  const bottom = rollerY + rollerD;
  const cx = x + w / 2;

  // cord and nail
  const ringX = [x + w * 0.3, x + w * 0.7];
  ctx.save();
  ctx.strokeStyle = p.cord;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ringX[0], top + 2);
  ctx.lineTo(cx, L.nailY);
  ctx.lineTo(ringX[1], top + 2);
  ctx.stroke();
  // a second, paler twist of the cord
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(ringX[0] + 0.6, top + 1);
  ctx.lineTo(cx, L.nailY + 1);
  ctx.lineTo(ringX[1] - 0.6, top + 1);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  const ng = ctx.createRadialGradient(cx - 2, L.nailY - 2, 0, cx, L.nailY, 7);
  ng.addColorStop(0, '#d8cbb0');
  ng.addColorStop(0.5, '#7a6a52');
  ng.addColorStop(1, '#3a3025');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(cx, L.nailY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // cast shadow (soft, then contact)
  ctx.save();
  ctx.fillStyle = rgb(p.body);
  ctx.shadowColor = p.shadow;
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 22;
  ctx.fillRect(x + 6, top, w - 12, bottom - top - 6);
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillRect(x, top, w, rollerY - top);
  ctx.restore();

  // silk: body, 天头, 地头
  fillSilk(ctx, x, top, w, rollerY - top + rollerD / 2, p.body, 5, 0.8);
  fillSilk(ctx, x, top, w, head, p.head, 9, 1);
  fillSilk(ctx, x, footTop, w, foot + rollerD / 2, p.head, 9, 1);

  // 局条: thin strips where the sections meet, and around the painting
  ctx.save();
  ctx.fillStyle = p.line;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x, top + head, w, 3);
  ctx.fillRect(x, footTop - 3, w, 3);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  ctx.strokeRect(P.x - 5.5, P.y - 5.5, P.w + 11, P.h + 11);
  ctx.restore();

  // 惊燕: two narrow ribbons down the 天头, each edged with a pair of fine lines
  const rw = Math.round(w * 0.03);
  for (const fx of [0.25, 0.75]) {
    const rx = Math.round(x + w * fx - rw / 2);
    fillSilk(ctx, rx, top, rw, head, p.body, 13, 0);
    ctx.save();
    ctx.fillStyle = p.line;
    ctx.fillRect(rx + 2, top, 1.2, head);
    ctx.fillRect(rx + rw - 3.2, top, 1.2, head);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.fillRect(rx + rw, top, 1.5, head); // tiny drop shadow — the ribbon is pasted on
    ctx.restore();
  }

  // the painting
  ctx.save();
  ctx.beginPath();
  ctx.rect(P.x, P.y, P.w, P.h);
  ctx.clip();
  ctx.translate(P.x, P.y);
  paint(ctx);
  ctx.restore();
  // paper edge
  ctx.save();
  ctx.strokeStyle = 'rgba(60,44,24,0.18)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
  ctx.restore();

  // light: the silk bows very slightly away from the wall at its edges
  ctx.save();
  const lg = ctx.createLinearGradient(x, 0, x + w, 0);
  lg.addColorStop(0, 'rgba(0,0,0,0.09)');
  lg.addColorStop(0.06, 'rgba(0,0,0,0)');
  lg.addColorStop(0.5, 'rgba(255,255,255,0.025)');
  lg.addColorStop(0.94, 'rgba(0,0,0,0)');
  lg.addColorStop(1, 'rgba(0,0,0,0.11)');
  ctx.fillStyle = lg;
  ctx.fillRect(x, top, w, rollerY - top);
  ctx.restore();

  // top rod (天杆), wrapped in the 天头 silk
  ctx.save();
  ctx.fillStyle = cylinder(ctx, top - rodH / 2, rodH, [p.head[0] * 0.8, p.head[1] * 0.8, p.head[2] * 0.8], 0.8);
  roundRectPath(ctx, x - 2, top - rodH / 2, w + 4, rodH, 3);
  ctx.fill();
  // brass rings for the cord
  ctx.strokeStyle = '#8c7448';
  ctx.lineWidth = 2;
  for (const rx of ringX) {
    ctx.beginPath();
    ctx.ellipse(rx, top - rodH / 2 - 1, 4.5, 5.5, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // roller (地杆) wrapped in silk, and its knobs (轴头) of old rosewood
  ctx.save();
  ctx.fillStyle = cylinder(ctx, rollerY, rollerD, p.head, 1);
  ctx.fillRect(x, rollerY, w, rollerD);
  // woven texture on the roller, then shade again so it reads as round
  ctx.globalAlpha = 0.5;
  fillSilk(ctx, x, rollerY, w, rollerD, p.head, 17, 0);
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = cylinder(ctx, rollerY, rollerD, p.head, 1);
  ctx.fillRect(x, rollerY, w, rollerD);
  ctx.restore();

  const kw = 34, kh = rollerD * 1.2, ky = rollerY + rollerD / 2 - kh / 2;
  const wood: RGB = [92, 50, 34];
  for (const side of [-1, 1]) {
    const kx = side < 0 ? x - kw + 2 : x + w - 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = cylinder(ctx, ky, kh, wood, 1.4);
    roundRectPath(ctx, kx, ky, kw, kh, 7);
    ctx.fill();
    ctx.restore();
    // the collar where knob meets roller, and a turned groove near the end
    ctx.save();
    ctx.fillStyle = cylinder(ctx, ky + 3, kh - 6, [60, 32, 22], 1);
    ctx.fillRect(side < 0 ? kx + kw - 7 : kx + 2, ky + 3, 5, kh - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(side < 0 ? kx + 8 : kx + kw - 10, ky + 2, 2, kh - 4);
    ctx.restore();
  }
}

/** A framed square panel (镜片) for the 斗方 format: silk border, 局条, painting. */
export function drawPanel(ctx: CanvasRenderingContext2D, outer: Rect, P: Rect, p: MountPalette, paint: (ctx: CanvasRenderingContext2D) => void): void {
  ctx.save();
  ctx.fillStyle = rgb(p.body);
  ctx.shadowColor = p.shadow;
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillRect(outer.x, outer.y, outer.w, outer.h);
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillRect(outer.x, outer.y, outer.w, outer.h);
  ctx.restore();
  fillSilk(ctx, outer.x, outer.y, outer.w, outer.h, p.body, 5, 0.8);
  // a thin frame of darker wood around the silk
  ctx.save();
  ctx.strokeStyle = 'rgba(52,34,22,0.9)';
  ctx.lineWidth = 8;
  ctx.strokeRect(outer.x + 4, outer.y + 4, outer.w - 8, outer.h - 8);
  ctx.strokeStyle = 'rgba(255,240,210,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(outer.x + 1.5, outer.y + 1.5, outer.w - 3, outer.h - 3);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  ctx.strokeRect(P.x - 5.5, P.y - 5.5, P.w + 11, P.h + 11);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(P.x, P.y, P.w, P.h);
  ctx.clip();
  ctx.translate(P.x, P.y);
  paint(ctx);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(60,44,24,0.18)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
  // inner bevel shadow of the frame on the silk
  const s = 18;
  const edges: [number, number, number, number, number, number, number, number][] = [
    [outer.x + 8, outer.y + 8, outer.w - 16, s, outer.x, outer.y + 8, outer.x, outer.y + 8 + s],
    [outer.x + 8, outer.y + 8, s, outer.h - 16, outer.x + 8, outer.y, outer.x + 8 + s, outer.y],
  ];
  for (const [ex, ey, ew, eh, gx0, gy0, gx1, gy1] of edges) {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ex, ey, ew, eh);
  }
  ctx.restore();
}
