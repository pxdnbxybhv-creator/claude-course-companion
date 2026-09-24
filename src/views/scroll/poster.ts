// Poster composition: the garden as a mounted hanging scroll (立轴) or square panel (斗方),
// and the year-in-ink (岁时记). Output is a canvas 1080 px wide, independent of the screen.
import type { AppState, DateKey } from '../../core/types';
import { hashString } from '../../core/rng';
import { seasonOfTerm } from '../../core/solarterms';
import { moonInfo } from '../../core/astro';
import { pickPoem } from '../../data/poems';
import { fillPaper } from '../../ink/paper';
import type { SceneEnv } from '../../ink/scene-types';
import { renderGardenStill } from '../garden/scene';
import { drawHangingScroll, drawPanel, drawWall, mountPalette, type MountPalette, type Rect } from './mount';
import { drawInscription, ensureFonts, fontStacks, planInscription, type Fonts, type InscriptionPlan } from './inscription';
import { composeInscription, englishCaption, posterData, type Inscription, type PosterData } from './text';
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
    const top = 176, head = 272, gapT = 44, gapB = 34, foot = 140, rollerD = 46;
    const pw = sw - 2 * 50;
    const py = top + head + gapT;
    const bottomRoom = caption ? 150 : 118;
    const ph = Math.round(H - bottomRoom - py - gapB - foot - rollerD);
    const P: Rect = { x: x + 50, y: py, w: pw, h: ph };
    const garden = await gardenCanvas(d, P, o);
    drawHangingScroll(ctx, { x, w: sw, top, head, gapB, foot, painting: P, rollerD, nailY: 64 }, pal, (g) => paintPainting(g, P, garden, ins, fonts, o, d));
    if (caption) drawCaption(ctx, W, H - bottomRoom + 46, caption, poemEn, fonts, pal);
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
  const logicalW = o.format === 'tall' ? 410 : 540;
  const dpr = P.w / logicalW;
  // paint a taller scene and keep its top: the ground line (≈63 % down) lands lower in the frame,
  // so the pond is shortened and the garden and its sky fill the picture
  const extra = o.format === 'tall' ? 1 : 0.75 / 0.63;
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
    return await renderGardenStill({ width: logicalW, height: Math.round((P.h / dpr) * extra), dpr, plants: d.plants, env });
  } catch (e) {
    console.warn('[scroll] garden still failed', e);
    return null;
  }
}

function safe<T>(f: () => T, fallback: T): T {
  try { return f(); } catch { return fallback; }
}

function paintPainting(ctx: CanvasRenderingContext2D, P: Rect, garden: HTMLCanvasElement | null, ins: Inscription, fonts: Fonts, o: PosterOptions, d: PosterData) {
  fillPaper(ctx, P.w, P.h, 11);
  if (garden && garden.width > 0) ctx.drawImage(garden, 0, 0, garden.width, Math.min(garden.height, garden.width * (P.h / P.w)), 0, 0, P.w, P.h);
  const tall = o.format === 'tall';
  const margin = Math.round(P.w * 0.075);
  const top = Math.round(margin * 0.95);
  const place = placeInscription(inkMap(garden, P.w, P.h * (garden ? garden.height / (garden.width * (P.h / P.w)) : 1)), ins, P, P.w * (tall ? 0.05 : 0.046), P.w * (tall ? 0.034 : 0.03), margin, top);
  drawInscription(ctx, ins, place.plan, place.right, top, fonts, hashString(o.today) ^ (o.salt * 131) ^ d.year);
}

interface InkMap { gw: number; gh: number; cw: number; ch: number; ink: Float32Array }

/** A coarse map of where the garden has put ink (or colour), so the inscription can keep clear of it. */
function inkMap(garden: HTMLCanvasElement | null, w: number, h: number): InkMap | null {
  if (!garden || !garden.width || !garden.height) return null;
  try {
    const gw = 72, gh = Math.max(8, Math.round((72 * h) / w));
    const c = document.createElement('canvas');
    c.width = gw;
    c.height = gh;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(garden, 0, 0, gw, gh);
    const px = x.getImageData(0, 0, gw, gh).data;
    // reference paper tone from the top rows (mostly empty sky)
    const lums: number[] = [], sats: number[] = [];
    for (let i = 0; i < gw * Math.round(gh * 0.12); i++) {
      if (px[i * 4 + 3] < 200) continue;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      lums.push(0.299 * r + 0.587 * g + 0.114 * b);
      sats.push((Math.max(r, g, b) - Math.min(r, g, b)) / 255);
    }
    lums.sort((a, b) => a - b);
    sats.sort((a, b) => a - b);
    const ref = lums.length ? lums[Math.floor(lums.length * 0.85)] : 236;
    const refSat = sats.length ? sats[Math.floor(sats.length * 0.5)] : 0.1; // xuan paper is a warm off-white
    const ink = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      ink[i] = a * Math.max(Math.max(0, (ref - lum) / Math.max(1, ref)), Math.max(0, sat - refSat - 0.02) * 3.5);
    }
    return { gw, gh, cw: w / gw, ch: h / gh, ink };
  } catch {
    return null; // tainted or unsupported — fall back to the default corner
  }
}

/** Cells with real ink in a rectangle, and the summed ink (for ranking crowded options). */
function busyCells(m: InkMap, x0: number, y0: number, x1: number, y1: number): { n: number; sum: number } {
  const i0 = Math.max(0, Math.floor(x0 / m.cw)), i1 = Math.min(m.gw - 1, Math.ceil(x1 / m.cw));
  const j0 = Math.max(0, Math.floor(y0 / m.ch)), j1 = Math.min(m.gh - 1, Math.ceil(y1 / m.ch));
  let n = 0, sum = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = m.ink[j * m.gw + i];
      if (v > 0.16) n++;
      sum += v * v;
    }
  }
  return { n, sum };
}

/**
 * Find clear paper for the inscription (留白): at the largest hand that fits, sweep the block from
 * the upper-right corner to the upper-left, preferring the corners; the hand shrinks (never wraps)
 * until a clause fits clear of plants, peaks and the sun. If nothing is clear, take the smallest
 * hand where it covers the least (and faintest) ink.
 */
function placeInscription(m: InkMap | null, ins: Inscription, P: Rect, S0: number, Smin: number, margin: number, top: number): { plan: InscriptionPlan; right: number } {
  if (!m) {
    const plan = planInscription(ins, Math.round(S0));
    return { plan, right: P.w - margin };
  }
  let fallback: { plan: InscriptionPlan; right: number; busy: number } | null = null;
  for (let S = S0; S >= Smin - 0.01; S *= 0.93) {
    const plan = planInscription(ins, Math.round(S));
    const hi = P.w - margin, lo = margin + plan.width - plan.S * 0.5;
    let best: { right: number; score: number } | null = null;
    const steps = 12;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const right = hi + (lo - hi) * t;
      if (right < lo - 1) continue;
      const b = busyCells(m, right - plan.width + plan.S * 0.2, top - plan.S * 0.5, right + plan.S * 0.9, top + plan.height + plan.S * 0.5);
      const edge = Math.min(t, 1 - t); // 0 at a corner, 0.5 in the middle
      if (b.n <= 1) {
        const score = -edge + (t < 0.5 ? 0.01 : 0);
        if (!best || score > best.score) best = { right, score };
      } else if (S * 0.93 < Smin && (!fallback || b.sum < fallback.busy)) fallback = { plan, right, busy: b.sum };
    }
    if (best) return { plan, right: best.right };
  }
  return fallback ?? { plan: planInscription(ins, Math.round(Smin)), right: P.w - margin };
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


