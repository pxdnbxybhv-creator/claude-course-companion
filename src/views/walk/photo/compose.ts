// A photograph made into a picture: the chosen filter applied to the pixels themselves (the same
// colour matrices the live preview shows as a CSS filter; in a small worker when one can be had),
// then mounted — bare, as a hanging scroll (画轴) on a plaster wall with a poetry panel (诗堂) for
// the inscription, or as an album leaf (册页) with the inscription in its wide paper margin — and
// signed with the place, the date and the user's own seal. Loaded only when a picture is taken.
import { FILTER_OPS, VIGNETTE, filterPixels, frameLayout, inscriptionText, photoName, splitPhrase, type FrameLayout, type PhotoFilter, type PhotoFrame, type Rect } from '../world/photoFx';
import { drawHangingScroll, drawWall, fillSilk, mountPalette, rgb, type HangingScrollLayout } from '../../scroll/mount';
import { INK, drawColumn, ensureFonts, fontStacks } from '../../scroll/inscription';
import { fillPaper } from '../../../ink/paper';
import { makeSeal, sealReady, SEAL_RED } from '../../../ink/seal';
import { makeRng, hashString } from '../../../core/rng';
import { toLunar } from '../../../core/lunar';

export interface ComposeOptions {
  filter: PhotoFilter;
  frame: PhotoFrame;
  /** Sign it: the place, the date and the seal (题款). */
  inscribe: boolean;
  lang: 'zh' | 'en';
  /** The user's seal (up to four characters). */
  seal: string;
  place: { zh: string; en: string };
  at: Date;
  /** A phone: a smaller pixel budget for the mounted picture. */
  touch: boolean;
}

export interface Composed {
  blob: Blob;
  thumb: Blob;
  name: string;
  w: number;
  h: number;
}

const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Filter in a worker (so the shutter's flash keeps moving); on the main thread if no worker can start. */
function filterAsync(data: Uint8ClampedArray, ops: [string, number][]): Promise<void> {
  if (!ops.length) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let url = '';
    let worker: Worker | null = null;
    let settled = false;
    const finish = (fallback: boolean) => {
      if (settled) return;
      settled = true;
      try { worker?.terminate(); } catch { /* gone */ }
      if (url) URL.revokeObjectURL(url);
      if (fallback) filterPixels(data, ops);
      resolve();
    };
    try {
      const src = `const filterPixels = ${filterPixels.toString()};\nself.onmessage = (e) => { const b = e.data.buf; filterPixels(new Uint8ClampedArray(b), e.data.ops); self.postMessage(b, [b]); };`;
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      // the pixels travel there and back (a copy: the original stays usable if the worker fails)
      const copy = data.slice().buffer;
      worker.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (settled) return;
        try { data.set(new Uint8ClampedArray(e.data)); finish(false); } catch { finish(true); }
      };
      worker.onerror = () => finish(true);
      worker.postMessage({ buf: copy, ops }, [copy]);
      setTimeout(() => finish(true), 8000);
    } catch {
      finish(true);
    }
  });
}

/** Darken the edges a little (旧纸, 水墨), as the preview's overlay does. */
function vignette(g: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  if (k <= 0) return;
  const r = Math.hypot(w, h) / 2;
  const grd = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  grd.addColorStop(0, 'rgba(60,40,20,0)');
  grd.addColorStop(1, `rgba(60,40,20,${k})`);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** The filtered photograph at its own resolution. */
export async function developed(shot: HTMLCanvasElement, filter: PhotoFilter): Promise<HTMLCanvasElement> {
  const c = canvasOf(shot.width, shot.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(shot, 0, 0);
  const ops = FILTER_OPS[filter] ?? [];
  if (ops.length) {
    const img = g.getImageData(0, 0, c.width, c.height);
    await filterAsync(img.data, ops);
    g.putImageData(img, 0, 0);
  }
  vignette(g, c.width, c.height, VIGNETTE[filter] ?? 0);
  return c;
}

/** Where the block of words (and the seal) goes inside its box. */
function place(box: Rect, anchor: FrameLayout['text']['anchor'], w: number, h: number): { x: number; y: number } {
  const x = anchor === 'tl' || anchor === 'bl' ? box.x : anchor === 'c' ? box.x + (box.w - w) / 2 : box.x + box.w - w;
  const y = anchor === 'tl' || anchor === 'tr' ? box.y : anchor === 'c' ? box.y + (box.h - h) / 2 : box.y + box.h - h;
  return { x, y };
}

/** Press the seal: multiplied into paper and silk, laid on (a little translucent) over a photograph. */
function stamp(g: CanvasRenderingContext2D, seal: HTMLCanvasElement, cx: number, cy: number, size: number, rot: number, onPhoto: boolean): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.globalCompositeOperation = onPhoto ? 'source-over' : 'multiply';
  g.globalAlpha = onPhoto ? 0.9 : 0.94;
  g.drawImage(seal, -size / 2, -size / 2, size, size);
  g.restore();
}

/** Sign the picture: columns of kai set right to left with the seal under the last (zh), or two italic lines and the seal (en). */
function inscribe(g: CanvasRenderingContext2D, L: FrameLayout, o: ComposeOptions, seal: HTMLCanvasElement | null, lines: string[]): void {
  const f = fontStacks();
  const T = L.text;
  const light = T.ink === 'light';
  const color = light ? '#fbf5ea' : INK;
  const rng = makeRng(hashString(lines.join('|')) + o.at.getTime());
  let size = T.size;
  const lead = 1.12;
  if (o.lang === 'zh') {
    // one column a line; in a short panel each line breaks at its pause (丙午年 · 八月十六)
    const sealK = 1.9;
    const fit = (cols: string[][]) => {
      const longest = Math.max(...cols.map((c) => c.length));
      const need = (s: number) => Math.max(longest * s * lead, cols[cols.length - 1].length * s * lead + s * 0.5 + s * sealK);
      let s = T.size;
      while (s > 10 && (need(s) > T.box.h || cols.length * s * 1.55 > T.box.w)) s -= 1;
      return { s, need };
    };
    let cols = lines.map((l) => Array.from(l));
    let fitted = fit(cols);
    if (fitted.s < T.size * 0.8) {
      const split = lines.flatMap(splitPhrase).map((l) => Array.from(l));
      const g = fit(split);
      if (g.s > fitted.s) { cols = split; fitted = g; }
    }
    size = fitted.s;
    const need = fitted.need;
    const colW = size * 1.55;
    const w = colW * cols.length, h = need(size);
    const at = place(T.box, T.anchor, w, h);
    if (light) backdrop(g, at.x, at.y, w, h, size);
    g.save();
    if (light) { g.shadowColor = 'rgba(20,14,8,0.55)'; g.shadowBlur = size * 0.35; }
    let x = at.x + w - colW / 2;
    let end = at.y;
    for (const c of cols) {
      end = drawColumn(g, c, x, at.y, size, lead, f.text, rng, color, light ? 0.96 : 0.88);
      x -= colW;
    }
    g.restore();
    if (seal) {
      const s = size * sealK;
      stamp(g, seal, x + colW, end + size * 0.5 + s / 2, s, rng.gauss() * 0.03, light);
    }
    return;
  }
  // English: two small italic lines, the seal beside them — or under them, in a narrow margin
  size = Math.round(size * 0.9);
  const narrow = T.box.w < T.box.h * 0.6;
  g.save();
  const font = (s: number, i: number) => `${i === 0 ? 'italic ' : ''}${Math.round(i === 0 ? s * 1.08 : s)}px ${f.latin}`;
  const measure = (s: number) => Math.max(...lines.map((l, i) => { g.font = font(s, i); return g.measureText(l).width; }));
  const sealS = (s: number) => s * 2.1;
  const width = (s: number) => (narrow ? Math.max(measure(s), sealS(s)) : measure(s) + s * 0.6 + sealS(s));
  while (size > 9 && width(size) > T.box.w) size -= 1;
  const tw = measure(size);
  const lh = size * 1.35;
  const S = sealS(size);
  const w = width(size);
  const h = narrow ? lh * lines.length + size * 0.5 + S : Math.max(lh * lines.length, S);
  const at = place(T.box, T.anchor === 'tr' ? 'bl' : T.anchor, w, h);
  if (light) backdrop(g, at.x, at.y, w, h, size);
  if (light) { g.shadowColor = 'rgba(20,14,8,0.55)'; g.shadowBlur = size * 0.35; }
  g.fillStyle = color;
  g.globalAlpha = light ? 0.96 : 0.86;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const ty = narrow ? at.y + lh / 2 : at.y + (h - lh * lines.length) / 2 + lh / 2;
  lines.forEach((l, i) => { g.font = font(size, i); g.fillText(l, at.x, ty + i * lh); });
  g.restore();
  if (!seal) return;
  if (narrow) stamp(g, seal, at.x + S / 2, at.y + lh * lines.length + size * 0.5 + S / 2, S, rng.gauss() * 0.03, light);
  else stamp(g, seal, at.x + tw + size * 0.6 + S / 2, at.y + h / 2, S, rng.gauss() * 0.03, light);
}

/** A soft dark wash behind pale words on a photograph, so they read on any sky. */
function backdrop(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, size: number): void {
  const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) * 0.85 + size * 3;
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grd.addColorStop(0, 'rgba(20,14,8,0.22)');
  grd.addColorStop(0.55, 'rgba(20,14,8,0.12)');
  grd.addColorStop(1, 'rgba(20,14,8,0)');
  g.save();
  g.fillStyle = grd;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
}

/** The paper panel of 诗堂 above the painting, edged with a thin 局条. */
function poetryPanel(g: CanvasRenderingContext2D, P: Rect, line: string): void {
  g.save();
  g.translate(P.x, P.y);
  g.beginPath();
  g.rect(0, 0, P.w, P.h);
  g.clip();
  fillPaper(g, P.w, P.h, 23);
  g.restore();
  g.save();
  g.strokeStyle = line;
  g.lineWidth = 3;
  g.strokeRect(P.x - 5.5, P.y - 5.5, P.w + 11, P.h + 11);
  g.strokeStyle = 'rgba(60,44,24,0.18)';
  g.lineWidth = 1.2;
  g.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
  g.restore();
}

/** Mount and sign a (filtered) photograph. */
export async function mount(photo: HTMLCanvasElement, o: ComposeOptions): Promise<HTMLCanvasElement> {
  const L = frameLayout(o.frame, photo.width, photo.height, o.touch ? 8e6 : 12e6, o.touch ? 4096 : 6144);
  const c = canvasOf(L.W * L.k, L.H * L.k);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.scale(c.width / L.W, c.height / L.H);
  const pal = mountPalette(false);
  const drawPhoto = (gg: CanvasRenderingContext2D, x: number, y: number) => gg.drawImage(photo, x, y, L.photo.w, L.photo.h);
  if (L.scroll) {
    drawWall(g, L.W, L.H, pal);
    const S = L.scroll;
    const lay: HangingScrollLayout = { x: S.x, w: S.w, top: S.top, head: S.head, gapB: S.gapB, foot: S.foot, painting: S.painting, rollerD: S.rollerD, nailY: S.nailY };
    drawHangingScroll(g, lay, pal, (gg) => drawPhoto(gg, 0, 0));
    poetryPanel(g, S.panel, pal.line);
  } else if (L.album) {
    // the album lies open on a dark walnut table (warm, never a cold grey)
    drawWall(g, L.W, L.H, mountPalette(true, [44, 34, 27]));
    const A = L.album;
    // the leaf lies a little proud of the table: a soft shadow under the brocade
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 36;
    g.shadowOffsetY = 14;
    g.fillStyle = rgb(pal.head);
    g.fillRect(A.outer.x, A.outer.y, A.outer.w, A.outer.h);
    g.restore();
    fillSilk(g, A.outer.x, A.outer.y, A.outer.w, A.outer.h, pal.head, 9, 1);
    g.save();
    g.translate(A.leaf.x, A.leaf.y);
    g.beginPath();
    g.rect(0, 0, A.leaf.w, A.leaf.h);
    g.clip();
    fillPaper(g, A.leaf.w, A.leaf.h, 31);
    g.restore();
    // the brocade's inner edge and a 局条 round the picture
    g.save();
    g.strokeStyle = 'rgba(30,22,14,0.55)';
    g.lineWidth = 2;
    g.strokeRect(A.leaf.x - 1, A.leaf.y - 1, A.leaf.w + 2, A.leaf.h + 2);
    g.strokeStyle = pal.line;
    g.lineWidth = 2.5;
    g.strokeRect(L.photo.x - 4.5, L.photo.y - 4.5, L.photo.w + 9, L.photo.h + 9);
    g.restore();
    drawPhoto(g, L.photo.x, L.photo.y);
    g.save();
    g.strokeStyle = 'rgba(60,44,24,0.2)';
    g.lineWidth = 1.2;
    g.strokeRect(L.photo.x + 0.5, L.photo.y + 0.5, L.photo.w - 1, L.photo.h - 1);
    g.restore();
  } else {
    drawPhoto(g, 0, 0);
  }
  if (o.inscribe) {
    const lu = toLunar(o.at);
    const lines = inscriptionText({ lang: o.lang, ganzhi: lu.yearGanZhi, lunarMonth: lu.monthName, lunarDay: lu.dayName, placeZh: o.place.zh, placeEn: o.place.en, date: o.at });
    const text = o.seal || '半亩';
    try { await Promise.all([ensureFonts(lines.join('') + text), sealReady(text)]); } catch { /* fallbacks will do */ }
    const k = c.width / L.W;
    const sealPx = Math.round(L.text.size * (o.lang === 'zh' ? 1.9 : 1.9) * k);
    let seal: HTMLCanvasElement | null = null;
    try { seal = makeSeal(text, { size: Math.max(24, sealPx), dpr: 1, style: 'bai', seed: hashString(text) % 997, color: SEAL_RED }); } catch { seal = null; }
    inscribe(g, L, o, seal, lines);
  }
  return c;
}

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, q);
    } catch (e) {
      reject(e);
    }
  });
}

/** A small copy for the album's shelf. */
async function thumbOf(c: HTMLCanvasElement, long = 420): Promise<Blob> {
  const k = Math.min(1, long / Math.max(c.width, c.height));
  const t = canvasOf(c.width * k, c.height * k);
  const g = t.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, t.width, t.height);
  return toBlob(t, 'image/jpeg', 0.82);
}

/** Develop, mount, sign and encode a photograph. */
export async function compose(shot: HTMLCanvasElement, o: ComposeOptions): Promise<Composed> {
  await nextFrame();
  const photo = await developed(shot, o.filter);
  await nextFrame();
  const c = await mount(photo, o);
  photo.width = photo.height = 1; // let the big buffer go early (Safari counts canvas memory)
  const blob = await toBlob(c, 'image/jpeg', 0.92);
  const thumb = await thumbOf(c);
  const out = { blob, thumb, name: photoName(o.at), w: c.width, h: c.height };
  c.width = c.height = 1;
  return out;
}
