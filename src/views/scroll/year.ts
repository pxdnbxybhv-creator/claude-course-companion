// 岁时记 · Year in Ink: twelve months of ink dots on a sheet of xuan paper, one dot per day,
// its darkness the share of habits kept that day. Today is ringed in cinnabar.
import type { DateKey } from '../../core/types';
import { cnYearDigits, weekday } from '../../core/date';
import { makeRng, hashString, type Rng } from '../../core/rng';
import { toLunar } from '../../core/lunar';
import { fillPaper, grainPattern } from '../../ink/paper';
import { makeSeal } from '../../ink/seal';
import { drawColumn, inkText, pressSeal, INK, type Fonts } from './inscription';
import type { MountPalette } from './mount';
import { CN_MONTHS, EN_MONTHS, dayShare, daysOfYear, yearRecord, LEISURE_SEALS, type PosterData } from './text';
import type { PosterOptions } from './poster';

const CINNABAR = '#b93a2b';

interface Grid { x: number; y: number; w: number; h: number; cols: number; rows: number; pitch: number; label: number }

function inkDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, share: number | null, future: boolean, rng: Rng) {
  if (future) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, r * 0.1), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (share === null) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.4, r * 0.13), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (share <= 0) {
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const a = 0.1 + 0.84 * Math.pow(share, 1.25);
  const rr = r * (0.46 + 0.44 * share);
  // bleed: a pale halo where the wet ink crept into the fibres
  ctx.globalAlpha = a * 0.1;
  ctx.fillStyle = grainPattern(ctx, INK, 'wash');
  ctx.beginPath();
  ctx.ellipse(x + rng.gauss() * r * 0.04, y + rng.gauss() * r * 0.04, rr * 1.16, rr * (1.08 + rng() * 0.08), rng() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  // body: two overlapping dabs, never a perfect circle
  ctx.fillStyle = INK;
  for (let k = 0; k < 2; k++) {
    ctx.globalAlpha = a * (k ? 0.55 : 0.75);
    const ox = rng.gauss() * rr * 0.07, oy = rng.gauss() * rr * 0.07;
    ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, rr * (0.9 + rng() * 0.12), rr * (0.86 + rng() * 0.12), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // grain: the paper shows through where the brush was drier
  ctx.globalAlpha = a * 0.3;
  ctx.fillStyle = grainPattern(ctx, INK, 'fine');
  ctx.beginPath();
  ctx.arc(x, y, rr * 0.95, 0, Math.PI * 2);
  ctx.fill();
}

function todayRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, share: number | null) {
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = CINNABAR;
  ctx.lineWidth = Math.max(2, r * 0.13);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.02, -Math.PI * 0.42, Math.PI * 1.46); // a brushed ring, not quite closed
  ctx.stroke();
  if (!share) {
    ctx.fillStyle = CINNABAR;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMonths(ctx: CanvasRenderingContext2D, g: Grid, o: PosterOptions, d: PosterData, fonts: Fonts) {
  const s = o.state;
  const year = d.year;
  const sets = new Map<string, Set<DateKey>>(s.habits.map((h) => [h.id, new Set(s.checkins[h.id] ?? [])]));
  const days = daysOfYear(year);
  const cw = g.w / g.cols, ch = g.h / g.rows;
  const rng = makeRng(hashString('year' + year));
  const r = g.pitch * 0.4;
  for (let m = 0; m < 12; m++) {
    const cx = g.x + (m % g.cols) * cw;
    const cy = g.y + Math.floor(m / g.cols) * ch;
    const gridW = g.pitch * 7;
    const ox = cx + (cw - gridW) / 2;
    // month name
    const past = `${year}-${String(m + 1).padStart(2, '0')}-01` <= o.today;
    const lw = inkText(ctx, CN_MONTHS[m], ox + g.pitch * 0.08, cy + g.label * 0.55, g.label, fonts.brush, m + 7, { alpha: past ? 0.9 : 0.45 });
    if (o.lang === 'en') {
      ctx.save();
      ctx.globalAlpha = past ? 0.62 : 0.34;
      ctx.fillStyle = INK;
      ctx.font = `italic ${Math.round(g.label * 0.56)}px ${fonts.latin}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(EN_MONTHS[m], ox + g.pitch * 0.08 + lw + g.label * 0.3, cy + g.label * 0.6);
      ctx.restore();
    }
    const mDays = days.filter((k) => Number(k.slice(5, 7)) === m + 1);
    const first = (weekday(mDays[0]) + 6) % 7; // Monday first
    const top = cy + g.label * 1.35;
    ctx.save();
    mDays.forEach((k, i) => {
      const pos = first + i;
      const x = ox + (pos % 7 + 0.5) * g.pitch;
      const y = top + (Math.floor(pos / 7) + 0.5) * g.pitch;
      const future = k > o.today;
      const share = future ? null : dayShare(s.habits, sets, k);
      inkDot(ctx, x, y, r, share, future, rng);
      if (k === o.today) todayRing(ctx, x, y, r, share);
    });
    ctx.restore();
  }
}

function legend(ctx: CanvasRenderingContext2D, x: number, y: number, pitch: number, fonts: Fonts, o: PosterOptions, size: number) {
  const rng = makeRng(99);
  const r = pitch * 0.44;
  ctx.save();
  let cx = x;
  cx += inkText(ctx, '淡', cx, y, size, fonts.text, 3, { alpha: 0.7 }) + size * 0.5;
  for (const sh of [0, 0.25, 0.5, 0.75, 1]) {
    inkDot(ctx, cx + r, y, r, sh, false, rng);
    cx += pitch;
  }
  ctx.globalAlpha = 1;
  cx += size * 0.2;
  cx += inkText(ctx, '浓', cx, y, size, fonts.text, 4, { alpha: 0.7 }) + size * 1.4;
  todayRing(ctx, cx + r, y, r, 0);
  ctx.globalAlpha = 1;
  cx += r * 2 + size * 0.5;
  inkText(ctx, o.lang === 'en' ? '今日 today' : '今日', cx, y, size, fonts.text, 5, { alpha: 0.7 });
  ctx.restore();
}

export async function drawYear(ctx: CanvasRenderingContext2D, W: number, H: number, o: PosterOptions, d: PosterData, fonts: Fonts, _pal: MountPalette): Promise<void> {
  const tall = H > W;
  fillPaper(ctx, W, H, 23);
  // ruled border (乌丝栏 style): a firm outer rule and a hairline inside it
  const inset = tall ? 44 : 34;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(inset + 8, inset + 8, W - 2 * inset - 16, H - 2 * inset - 16);
  ctx.restore();

  const rec = yearRecord(o.state, d.year, o.today);
  const ganzhi = toLunar(new Date(d.year, 6, 1)).yearGanZhi;
  const rng = makeRng(hashString('yeartitle' + d.year));
  const sealName = o.state.settings.sealName.trim() || '半亩';
  const leisure = LEISURE_SEALS[Math.abs(o.salt + d.year) % LEISURE_SEALS.length];

  if (tall) {
    // title block, upper right: 岁时记 in large running script, the year beside it, then the record
    const T = 112;
    const tx = W - 150, ty = 116;
    drawColumn(ctx, Array.from('岁时记'), tx, ty, T, 1.04, fonts.brush, rng, INK, 0.95);
    const ys = 40;
    const yx = tx - T * 0.98;
    const yEnd = drawColumn(ctx, [...Array.from(cnYearDigits(d.year)), null, ...Array.from(ganzhi + '年')], yx, ty + T * 0.35, ys, 1.12, fonts.text, rng, INK, 0.86);
    const seal = makeSeal(sealName, { size: 62, dpr: 1, style: 'bai', seed: 7 });
    pressSeal(ctx, { canvas: seal, x: yx, y: yEnd + 50, size: 62, rot: -0.012 });
    const lz = 96;
    pressSeal(ctx, { canvas: makeSeal(leisure, { size: lz, dpr: 1, style: 'zhu', shape: 'oval', seed: 8 }), x: tx + T * 0.52, y: ty + 4, size: lz, rot: 0.01 });
    // the year's record, one phrase per column, read right to left
    const rs = 32;
    let rx = yx - ys * 2.4;
    const phrases = ['是岁也', ...rec.zh];
    phrases.forEach((ph, i) => {
      drawColumn(ctx, Array.from(ph), rx, ty + T * 0.35 + (i === 0 ? 0 : rs * 1.2), rs, 1.14, fonts.text, rng, INK, i === 0 ? 0.6 : 0.82);
      rx -= rs * 1.7;
    });
    if (o.lang === 'en') {
      ctx.save();
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.66;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `italic 44px ${fonts.latin}`;
      ctx.fillText('Year in Ink', 96, 150);
      ctx.font = `italic 26px ${fonts.latin}`;
      ctx.globalAlpha = 0.56;
      ctx.fillText(String(d.year), 96, 190);
      if (rec.en) {
        const parts = rec.en.split(' · ');
        parts.forEach((p, i) => ctx.fillText(p, 96, 236 + i * 34));
      }
      ctx.restore();
    }
    const grid: Grid = { x: 84, y: 600, w: W - 168, h: 1180, cols: 3, rows: 4, pitch: 37, label: 42 };
    drawMonths(ctx, grid, o, d, fonts);
    legend(ctx, 104, H - 108, 30, fonts, o, 24);
    inkText(ctx, '半亩', W - 104, H - 108, 30, fonts.brush, 12, { align: 'right', alpha: 0.75 });
  } else {
    const T = 92;
    const tx = W - 116, ty = 92;
    drawColumn(ctx, Array.from('岁时记'), tx, ty, T, 1.04, fonts.brush, rng, INK, 0.95);
    const ys = 32;
    const yx = tx - T * 0.95;
    const yEnd = drawColumn(ctx, [...Array.from(cnYearDigits(d.year)), null, ...Array.from(ganzhi + '年')], yx, ty + T * 0.3, ys, 1.12, fonts.text, rng, INK, 0.86);
    pressSeal(ctx, { canvas: makeSeal(sealName, { size: 52, dpr: 1, style: 'bai', seed: 7 }), x: yx, y: yEnd + 42, size: 52, rot: -0.012 });
    pressSeal(ctx, { canvas: makeSeal(leisure, { size: 76, dpr: 1, style: 'zhu', shape: 'oval', seed: 8 }), x: tx + T * 0.46, y: ty + 2, size: 76, rot: 0.01 });
    // record under the title block, read right to left
    const rs = 26;
    let rx = tx;
    const recTop = Math.max(ty + T * 3.35, yEnd + 42 + 26 + 36);
    for (const ph of rec.zh.slice(0, 3)) {
      drawColumn(ctx, Array.from(ph), rx, recTop, rs, 1.12, fonts.text, rng, INK, 0.8);
      rx -= rs * 1.7;
    }
    const grid: Grid = { x: 58, y: 70, w: W - 300, h: H - 170, cols: 4, rows: 3, pitch: 25, label: 30 };
    drawMonths(ctx, grid, o, d, fonts);
    legend(ctx, 78, H - 72, 22, fonts, o, 19);
    if (o.lang === 'en') {
      ctx.save();
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.6;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `italic 24px ${fonts.latin}`;
      ctx.fillText(`Year in Ink · ${d.year}`, W - 250, H - 72);
      ctx.restore();
    }
  }
}
