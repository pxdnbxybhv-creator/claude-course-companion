// Poster composition: the garden as a mounted hanging scroll (立轴) or square panel (斗方),
// and the year-in-ink (岁时记). Output is a canvas 1080 px wide, independent of the screen.
import type { AppState, DateKey } from '../../core/types';
import { hashString, makeRng } from '../../core/rng';
import { seasonOfTerm } from '../../core/solarterms';
import { moonInfo } from '../../core/astro';
import { pickPoem } from '../../data/poems';
import { fillPaper } from '../../ink/paper';
import type { SceneEnv } from '../../ink/scene-types';
import { renderGardenStill } from '../garden/scene';
import { drawHangingScroll, drawPanel, drawWall, mountPalette, type MountPalette, type Rect } from './mount';
import { drawInscription, ensureFonts, fontStacks, type Fonts } from './inscription';
import { composeInscription, englishCaption, posterData, type PosterData } from './text';
import { drawYear } from './year';

export type PosterKind = 'garden' | 'year';
export type PosterFormat = 'tall' | 'square';

export interface PosterOptions {
  kind: PosterKind;
  format: PosterFormat;
  state: AppState;
  today: DateKey;
  lang: 'zh' | 'en';
  /** Varies the poem and leisure seal. */
  salt: number;
  dark: boolean;
}

export const POSTER_W = 1080;
export const posterSize = (f: PosterFormat) => ({ w: POSTER_W, h: f === 'tall' ? 1920 : 1080 });

/** Characters that may be painted at runtime but are built from data (so the font subsetter sees them here). */
export const RUNTIME_GLYPHS = '二〇一二三四五六七八九十百千万零年月日记本种计功焚香炷园中植半亩主人初开犹待栽植勤于者连不辍岁时记是岁今墨淡浓全无';

export async function renderPoster(o: PosterOptions): Promise<HTMLCanvasElement> {
  const { w: W, h: H } = posterSize(o.format);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const fonts = fontStacks();
  const d = posterData(o.state, o.today);
  const pal = mountPalette(o.dark);
  if (o.kind === 'year') {
    await ensureFonts(RUNTIME_GLYPHS + '岁时记正腊闰' + (o.state.settings.sealName || '半亩'), fonts);
    await drawYear(ctx, W, H, o, d, fonts, pal);
    return c;
  }
  const poem = pickPoem({ term: d.termIndex, salt: hashString(o.today) + o.salt * 7919 });
  const ins = composeInscription(d, poem.lines, o.state.settings.sealName, o.salt);
  await ensureFonts([...ins.verses, ...ins.date, ...ins.record, ins.sign, ins.seal, ins.leisure].join(''), fonts);
  const caption = o.lang === 'en' ? englishCaption(d) : '';
  const poemEn = o.lang === 'en' ? `“${poem.en}” — ${poem.authorEn}` : '';

  drawWall(ctx, W, H, pal);
  if (o.format === 'tall') {
    const sw = 820;
    const x = (W - sw) / 2;
    const top = 176, head = 296, gapT = 44, gapB = 34, foot = 150, rollerD = 46;
    const pw = sw - 2 * 50;
    const py = top + head + gapT;
    const ph = Math.round(H - 118 - py - gapB - foot - rollerD);
    const P: Rect = { x: x + 50, y: py, w: pw, h: ph };
    const garden = await gardenCanvas(d, P, o);
    drawHangingScroll(ctx, { x, w: sw, top, head, gapB, foot, painting: P, rollerD, nailY: 64 }, pal, (g) => paintPainting(g, P, garden, ins, fonts, o, d));
    if (caption) drawCaption(ctx, W, H - 58, caption, poemEn, fonts, pal);
  } else {
    const m = caption ? 54 : 64;
    const outer: Rect = { x: m, y: m - (caption ? 16 : 0), w: W - 2 * m, h: W - 2 * m - (caption ? 30 : 0) };
    const b = 62;
    const P: Rect = { x: outer.x + b, y: outer.y + b, w: outer.w - 2 * b, h: outer.h - 2 * b };
    const garden = await gardenCanvas(d, P, o);
    drawPanel(ctx, outer, P, pal, (g) => paintPainting(g, P, garden, ins, fonts, o, d));
    if (caption) drawCaption(ctx, W, H - 28, caption, '', fonts, pal);
  }
  return c;
}

/** The garden still in a portrait/square composition (logical width ≈ a phone screen). */
async function gardenCanvas(d: PosterData, P: Rect, o: PosterOptions): Promise<HTMLCanvasElement | null> {
  const logicalW = o.format === 'tall' ? 400 : 460;
  const dpr = P.w / logicalW;
  const env: SceneEnv = {
    season: seasonOfTerm(d.termIndex),
    tod: 'day',
    hour: 10.5,
    moonPhase: safe(() => moonInfo(d.date).phase, 0.5),
    termIndex: d.termIndex,
    clarity: d.clarity,
    seed: hashString('banmu-scroll'),
  };
  try {
    return await renderGardenStill({ width: logicalW, height: Math.round(P.h / dpr), dpr, plants: d.plants, env });
  } catch (e) {
    console.warn('[scroll] garden still failed', e);
    return null;
  }
}

function safe<T>(f: () => T, fallback: T): T {
  try { return f(); } catch { return fallback; }
}

function paintPainting(ctx: CanvasRenderingContext2D, P: Rect, garden: HTMLCanvasElement | null, ins: ReturnType<typeof composeInscription>, fonts: Fonts, o: PosterOptions, d: PosterData) {
  fillPaper(ctx, P.w, P.h, 11);
  if (garden && garden.width > 0) ctx.drawImage(garden, 0, 0, P.w, P.h);
  const size = Math.round(P.w * (o.format === 'tall' ? 0.05 : 0.046));
  const margin = Math.round(P.w * 0.075);
  drawInscription(ctx, ins, { right: P.w - margin, top: margin * 0.95, maxH: P.h * (o.format === 'tall' ? 0.42 : 0.5), size }, fonts, hashString(o.today) ^ (o.salt * 131) ^ d.year);
}

function drawCaption(ctx: CanvasRenderingContext2D, W: number, y: number, text: string, sub: string, fonts: Fonts, pal: MountPalette) {
  ctx.save();
  ctx.fillStyle = pal.caption;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 27px ${fonts.latin}`;
  fitText(ctx, text, W / 2, y, W - 120);
  if (sub) {
    ctx.globalAlpha = 0.8;
    ctx.font = `italic 21px ${fonts.latin}`;
    wrapCentered(ctx, sub, W / 2, y + 34, W - 180, 26, 2);
  }
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(maxW / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  } else ctx.fillText(text, x, y);
}

function wrapCentered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

export { makeRng };
