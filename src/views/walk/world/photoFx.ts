// A photograph's look and its mount, as plain arithmetic (no DOM): the filters — previewed live
// as CSS filters on the canvas and applied to the saved picture pixel by pixel with the same
// colour matrices (Filter Effects 1), so what you see is what you keep — and the layout of the
// frames: none, a hanging scroll (画轴) with a poetry panel (诗堂) above the picture, or an album
// leaf (册页) with the inscription in its wide margin.

export type PhotoFilter = 'none' | 'ink' | 'warm' | 'cool' | 'paper';
export type PhotoFrame = 'none' | 'scroll' | 'album';

export const PHOTO_FILTERS: PhotoFilter[] = ['none', 'ink', 'warm', 'cool', 'paper'];
export const PHOTO_FRAMES: PhotoFrame[] = ['none', 'scroll', 'album'];

export type FilterOp = [kind: 'grayscale' | 'sepia' | 'saturate' | 'hue' | 'brightness' | 'contrast', amount: number];

/**
 * 原色 as it is; 水墨 ink wash (grey with a breath of warm ink, firmer contrast); 暖 late sun; 冷 a
 * clear cool morning; 旧纸 old paper (faded, yellowed). A vignette goes with 旧纸 and 水墨 (VIGNETTE).
 */
export const FILTER_OPS: Record<PhotoFilter, FilterOp[]> = {
  none: [],
  ink: [['grayscale', 1], ['sepia', 0.14], ['contrast', 1.16], ['brightness', 1.05]],
  warm: [['sepia', 0.2], ['saturate', 1.14], ['hue', -6], ['brightness', 1.03]],
  cool: [['saturate', 0.86], ['hue', 12], ['contrast', 1.05], ['brightness', 1.03]],
  paper: [['sepia', 0.52], ['saturate', 0.74], ['contrast', 0.9], ['brightness', 1.07]],
};

/** How dark the edges of the picture go with each filter (0 = none), in the preview and the file alike. */
export const VIGNETTE: Record<PhotoFilter, number> = { none: 0, ink: 0.16, warm: 0, cool: 0, paper: 0.26 };

/** The CSS filter string for the live preview. */
export function cssFilter(f: PhotoFilter): string {
  const ops = FILTER_OPS[f] ?? [];
  if (!ops.length) return 'none';
  return ops.map(([k, a]) => (k === 'hue' ? `hue-rotate(${a}deg)` : `${k}(${a})`)).join(' ');
}

/**
 * Apply filter ops to RGBA bytes in place (alpha untouched), each op on the result of the one before
 * and clamped, as the browser composes a CSS filter chain. Self-contained on purpose: it is also
 * shipped to a worker as source text, so it must not reach outside itself.
 */
export function filterPixels(data: Uint8ClampedArray, ops: [string, number][]): void {
  if (!ops.length) return;
  // each op as a 3x4 affine matrix on 0..255 values
  const mats: number[][] = [];
  for (const [k, a] of ops) {
    let m: number[];
    if (k === 'grayscale') {
      const s = 1 - Math.min(1, Math.max(0, a));
      m = [0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0,
        0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0,
        0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s, 0];
    } else if (k === 'sepia') {
      const s = 1 - Math.min(1, Math.max(0, a));
      m = [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0,
        0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0,
        0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0];
    } else if (k === 'saturate') {
      const s = Math.max(0, a);
      m = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0];
    } else if (k === 'hue') {
      const r = (a * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
      m = [0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928, 0,
        0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283, 0,
        0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072, 0];
    } else if (k === 'brightness') {
      m = [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
    } else if (k === 'contrast') {
      const o = 127.5 * (1 - a);
      m = [a, 0, 0, o, 0, a, 0, o, 0, 0, a, o];
    } else continue;
    mats.push(m);
  }
  const n = mats.length;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    for (let j = 0; j < n; j++) {
      const m = mats[j];
      let nr = m[0] * r + m[1] * g + m[2] * b + m[3];
      let ng = m[4] * r + m[5] * g + m[6] * b + m[7];
      let nb = m[8] * r + m[9] * g + m[10] * b + m[11];
      nr = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      ng = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      nb = nb < 0 ? 0 : nb > 255 ? 255 : nb;
      r = nr; g = ng; b = nb;
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

/** Apply a named filter to RGBA bytes in place. */
export function applyFilter(data: Uint8ClampedArray, f: PhotoFilter): void {
  filterPixels(data, FILTER_OPS[f] ?? []);
}

// ───────────────────────────── frames

export interface Rect { x: number; y: number; w: number; h: number }

/** Where the inscription (place and date) and the seal go, and how. */
export interface InscriptionBox {
  box: Rect;
  /** Which corner of the box the block hugs. */
  anchor: 'tl' | 'tr' | 'bl' | 'br' | 'c';
  /** Character size (units). */
  size: number;
  /** Ink on paper, or pale characters on the picture itself. */
  ink: 'dark' | 'light';
}

export interface FrameLayout {
  frame: PhotoFrame;
  /** The whole picture in layout units; the canvas is W·k × H·k pixels. */
  W: number;
  H: number;
  /** Pixels per unit. */
  k: number;
  /** Where the photograph goes. */
  photo: Rect;
  /** 画轴: the hanging scroll (world/scroll mount's HangingScrollLayout) and its poetry panel. */
  scroll?: { x: number; w: number; top: number; head: number; gapB: number; foot: number; rollerD: number; nailY: number; painting: Rect; panel: Rect };
  /** 册页: the brocade edge and the paper leaf. */
  album?: { outer: Rect; leaf: Rect };
  text: InscriptionBox;
}

/** The long side of the photograph in layout units (the mounts were drawn at this scale). */
export const FRAME_UNITS = 900;

/**
 * Lay out a frame round a photograph of photoW × photoH pixels. The photograph keeps its full
 * resolution unless the whole would pass `maxPixels` or `maxDim`; then everything scales down.
 */
export function frameLayout(frame: PhotoFrame, photoW: number, photoH: number, maxPixels = 16e6, maxDim = 8192): FrameLayout {
  const long = Math.max(1, photoW, photoH);
  const L = FRAME_UNITS;
  const pw = (Math.max(1, photoW) / long) * L, ph = (Math.max(1, photoH) / long) * L;
  const short = Math.min(pw, ph);
  let W: number, H: number;
  let photo: Rect;
  let text: InscriptionBox;
  let scroll: FrameLayout['scroll'];
  let album: FrameLayout['album'];
  if (frame === 'scroll') {
    const side = Math.max(64, L * 0.085);
    const mx = 96, my = 70;
    const nailY = my;
    const top = nailY + 58;
    // 天头 about a third of an upright picture's height, less over a wide one; 地头 about half of it
    const head = Math.round(ph * 0.22 + pw * 0.04 + 36);
    const panelH = Math.round(Math.min(180, Math.max(140, ph * 0.3)));
    const gapPad = 18, gapT = panelH + gapPad * 2 + 8;
    const gapB = Math.round(L * 0.05);
    const foot = Math.round(head * 0.52);
    const rollerD = 30;
    const x = mx, w = pw + side * 2;
    const painting = { x: x + side, y: top + head + gapT, w: pw, h: ph };
    const panel = { x: painting.x, y: top + head + gapPad, w: pw, h: panelH };
    W = w + mx * 2;
    H = painting.y + ph + gapB + foot + rollerD + my;
    photo = painting;
    scroll = { x, w, top, head, gapB, foot, rollerD, nailY, painting, panel };
    const size = Math.round(Math.min(38, Math.max(20, panelH * 0.19)));
    text = { box: { x: panel.x + 16, y: panel.y + 12, w: panel.w - 32, h: panel.h - 24 }, anchor: 'c', size, ink: 'dark' };
  } else if (frame === 'album') {
    const m = Math.round(L * 0.07);
    const ml = Math.round(L * 0.2);
    const b = Math.round(L * 0.036);
    const out = Math.round(L * 0.05);
    const leaf = { x: out + b, y: out + b, w: ml + pw + m, h: m + ph + m };
    const outer = { x: out, y: out, w: leaf.w + b * 2, h: leaf.h + b * 2 };
    W = outer.w + out * 2;
    H = outer.h + out * 2;
    photo = { x: leaf.x + ml, y: leaf.y + m, w: pw, h: ph };
    album = { outer, leaf };
    const size = Math.round(Math.min(32, Math.max(18, ml * 0.15)));
    text = { box: { x: leaf.x + m * 0.45, y: photo.y + 4, w: ml - m * 0.9, h: ph - 8 }, anchor: 'tr', size, ink: 'dark' };
  } else {
    W = pw; H = ph;
    photo = { x: 0, y: 0, w: pw, h: ph };
    const size = Math.round(Math.max(14, short * 0.03));
    const mg = short * 0.04;
    text = { box: { x: pw * 0.55, y: ph * 0.4, w: pw * 0.45 - mg, h: ph * 0.6 - mg }, anchor: 'br', size, ink: 'light' };
  }
  // px per unit: the photograph at its own resolution, within the budget
  let k = long / L;
  k = Math.min(k, Math.sqrt(maxPixels / (W * H)), maxDim / Math.max(W, H));
  return { frame, W, H, k, photo, scroll, album, text };
}

/** Rectangles overlap (touching edges do not count). */
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** `inner` lies within `outer`. */
export const inside = (inner: Rect, outer: Rect, eps = 1e-6) =>
  inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;

/** The inscription's words: the lunar date and the place (zh columns), or one English line. */
export function inscriptionText(o: { lang: 'zh' | 'en'; ganzhi: string; lunarMonth: string; lunarDay: string; placeZh: string; placeEn: string; date: Date }): string[] {
  if (o.lang === 'zh') return [`${o.ganzhi}年${o.lunarMonth}${o.lunarDay}`, `${o.placeZh}留影`];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return [`${o.placeEn}`, `${o.date.getDate()} ${M[o.date.getMonth()]} ${o.date.getFullYear()}`];
}

/**
 * A column of the inscription broken at its natural pause, for a short panel: 丙午年 · 八月十六,
 * 荷塘 · 留影. Other text stays whole.
 */
export function splitPhrase(line: string): string[] {
  const i = line.indexOf('年');
  if (i > 0 && i < line.length - 1) return [line.slice(0, i + 1), line.slice(i + 1)];
  if (line.endsWith('留影') && line.length > 2) return [line.slice(0, -2), '留影'];
  return [line];
}

/** A file name for a photograph taken at `d`: banmu-photo-20260926-143012.jpg. */
export function photoName(d: Date, ext = 'jpg'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `banmu-photo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
