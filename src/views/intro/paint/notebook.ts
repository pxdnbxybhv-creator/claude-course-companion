// 开篇 · S3 页边的塘: a page of reading notes by moonlight, and the square pond someone drew in its
// top margin (spec §4 S3). Portrait starts close on the page's 天头 (the binding off to the right);
// landscape shows the open spread. The "handwriting" is unreadable 淡墨 marks: nothing is invented
// as text. The pond's four strokes are kept, so S4 re-strokes them sharp as the camera pushes in.
import type { Stroke } from '../../../ink/types';
import { fillPaper } from '../../../ink/paper';
import { makeRng } from '../../../core/rng';
import { field, layer, paint, st, type Lay, type PaintJob } from './util';

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface NotebookLayout {
  page: Box;
  pond: Box;
  strokes: Stroke[];
  moon: { x: number; y: number; r: number };
  slip: Box;
  q1: { x: number; y0: number; y1: number; size: number };
  by: { x: number; y: number };
  l1: { x: number; y0: number; y1: number };
  fold: number | null;
}

export function notebookLayout(lay: Lay): NotebookLayout {
  const { w, h, P } = lay;
  const B = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: x0 * w, y0: y0 * h, x1: x1 * w, y1: y1 * h });
  const pond = P ? B(0.1, 0.11, 0.55, 0.34) : B(0.6, 0.09, 0.74, 0.27);
  const rng = makeRng(0x90d);
  const j = (k: number) => (rng() - 0.5) * k;
  const pw = pond.x1 - pond.x0, ph = pond.y1 - pond.y0;
  const W = P ? 3.6 : 3.2;
  const edge = (a: [number, number], b: [number, number], s: number): Stroke => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const wd = W * (u < 0.1 ? 0.6 + u * 4 : 1 - 0.55 * Math.pow(u, 1.6)) * (1 + 0.1 * Math.sin(u * 9 + s));
      pts.push([a[0] + (b[0] - a[0]) * u + j(1.2), a[1] + (b[1] - a[1]) * u + j(1.2), wd]);
    }
    return st('brush', pts, 0.82, 1000 + s, { dryness: 0.55 });
  };
  // slightly trapezoid, like a hand-drawn square; each side overshoots a touch at its start
  const tl: [number, number] = [pond.x0 + pw * 0.02, pond.y0], tr: [number, number] = [pond.x1 - pw * 0.01, pond.y0 + ph * 0.015];
  const br: [number, number] = [pond.x1 + pw * 0.01, pond.y1], bl: [number, number] = [pond.x0 - pw * 0.015, pond.y1 - ph * 0.01];
  const strokes = [edge([tl[0] - 4, tl[1]], tr, 1), edge([tr[0], tr[1] - 4], br, 2), edge([br[0] + 3, br[1]], bl, 3), edge([bl[0], bl[1] + 3], tl, 4)];
  const moon = { x: pond.x0 + pw * 0.52, y: pond.y0 + ph * 0.46, r: Math.min(pw, ph) * 0.17 };
  const slip = P ? B(0.57, 0.1, 0.64, 0.2) : B(0.555, 0.09, 0.585, 0.15);
  const q1 = P ? { x: 0.8 * w, y0: 0.05 * h, y1: 0.42 * h, size: 30 } : { x: 0.79 * w, y0: 0.07 * h, y1: 0.33 * h, size: 32 };
  const by = P ? { x: 0.71 * w, y: 0.24 * h } : { x: 0.76 * w, y: 0.19 * h };
  const l1 = P ? { x: 0.05 * w, y0: 0.05 * h, y1: 0.4 * h } : { x: 0.86 * w, y0: 0.07 * h, y1: 0.38 * h };
  const page = P ? B(0, 0, 1, 1) : B(0.05, 0.04, 0.95, 0.96);
  return { page, pond, strokes, moon, slip, q1, by, l1, fold: P ? null : 0.5 * w };
}

/** The page (P) or spread (L), its 版框, the unreadable columns, the pond and its wash. The moon is drawn per frame. */
export function paintNotebook(lay: Lay, seed = 0x5eed): PaintJob {
  const { w, h, P } = lay;
  const dpr = lay.dpr;
  const { c, g } = layer(w, h, dpr);
  const N = notebookLayout(lay);
  const rng = makeRng(seed);
  const pg = N.page;
  const steps: (() => void)[] = [
    () => {
      // the desk under the spread (L) is night; the page is paper
      g.fillStyle = '#2a3140';
      g.fillRect(0, 0, w, h);
      g.save();
      g.beginPath(); g.rect(pg.x0, pg.y0, pg.x1 - pg.x0, pg.y1 - pg.y0); g.clip();
      fillPaper(g, w, h, seed);
      g.fillStyle = 'rgba(239,228,204,0.45)';
      g.fillRect(0, 0, w, h);
      g.restore();
      if (!P) {
        // the spread's shadow on the desk and the fold
        g.save();
        g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24;
        g.strokeStyle = 'rgba(0,0,0,0)';
        g.restore();
        const f = N.fold!;
        const grd = g.createLinearGradient(f - 40, 0, f + 40, 0);
        grd.addColorStop(0, 'rgba(60,50,40,0)'); grd.addColorStop(0.5, 'rgba(60,50,40,.22)'); grd.addColorStop(1, 'rgba(60,50,40,0)');
        g.fillStyle = grd;
        g.fillRect(f - 40, pg.y0, 80, pg.y1 - pg.y0);
      }
    },
    () => {
      // moonlight: a faint diagonal band from the upper left, and night at the far edges
      field(g, pg.x0, pg.y0, pg.x1 - pg.x0, pg.y1 - pg.y0, 0.12, (x, y, out) => {
        const d = (x - pg.x0) * 0.6 + (y - pg.y0) - (pg.y1 - pg.y0) * 0.3;
        const band = Math.exp(-((d / (h * 0.28)) ** 2));
        const edge = Math.max(0, Math.hypot((x - w * 0.45) / w, (y - h * 0.4) / h) - 0.45);
        if (band > edge * 2) { out[0] = 250; out[1] = 248; out[2] = 240; out[3] = 0.16 * band; }
        else { out[0] = 40; out[1] = 50; out[2] = 66; out[3] = Math.min(0.28, edge * 0.5); }
      });
    },
    () => {
      // 版框: a double rule (P: its top rule at 44 %; L: round each page)
      const S: Stroke[] = [];
      const rule = (x0: number, y0: number, x1: number, y1: number, wd: number, s: number) =>
        S.push(st('line', [[x0, y0, wd], [(x0 + x1) / 2 + (rng() - 0.5) * 2, (y0 + y1) / 2 + (rng() - 0.5) * 2, wd], [x1, y1, wd]], 0.55, s));
      if (P) {
        const y = 0.44 * h;
        rule(0.035 * w, y, w * 1.02, y, 1.6, 1);
        rule(0.035 * w, y + 5, w * 1.02, y + 5, 0.8, 2);
        rule(0.035 * w, y, 0.035 * w, h * 1.02, 1.6, 3);
        rule(0.035 * w + 5, y + 5, 0.035 * w + 5, h * 1.02, 0.8, 4);
      } else {
        for (const [a, b] of [[pg.x0 + 30, N.fold! - 30], [N.fold! + 30, pg.x1 - 30]]) {
          const y0 = pg.y0 + 34, y1 = pg.y1 - 34;
          rule(a, y0, b, y0, 1.4, 5); rule(a, y1, b, y1, 1.4, 6); rule(a, y0, a, y1, 1.4, 7); rule(b, y0, b, y1, 1.4, 8);
          rule(a + 5, y0 + 5, b - 5, y0 + 5, 0.7, 9); rule(a + 5, y1 - 5, b - 5, y1 - 5, 0.7, 10);
        }
      }
      paint(g, S, dpr);
    },
    () => {
      // the unreadable columns: 淡墨 marks, right to left
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const cols: { x: number; y0: number; y1: number }[] = [];
      const pitch = P ? 24 : 26;
      if (P) for (let x = w * 0.93; x > w * 0.07; x -= pitch) cols.push({ x, y0: 0.465 * h, y1: h * 1.02 });
      else {
        for (let x = N.fold! - 52; x > pg.x0 + 50; x -= pitch) cols.push({ x, y0: pg.y0 + 50, y1: pg.y1 - 46 });
        for (let x = pg.x1 - 52; x > N.fold! + 50; x -= pitch) {
          const nearPond = x > N.pond.x0 - 30 && x < N.l1.x + 20;
          cols.push({ x, y0: nearPond ? N.pond.y1 + 60 : pg.y0 + 50, y1: pg.y1 - 46 });
        }
      }
      // running script (行草): each column a flowing pen line in short runs, too small and quick to read
      const gh = P ? 10 : 11;
      for (const col of cols) {
        let y = col.y0 + rng() * 8;
        const stop = col.y1 - rng() * (rng() < 0.2 ? 160 : 20);
        while (y < stop) {
          const run = gh * (1.5 + rng() * 3.5);
          g.strokeStyle = `rgba(44,40,36,${0.2 + rng() * 0.14})`;
          g.lineWidth = 0.7 + rng() * 0.5;
          g.beginPath();
          let x = col.x + (rng() - 0.5) * 3;
          g.moveTo(x, y);
          const n = Math.max(2, Math.round(run / 5.5));
          for (let k = 1; k <= n; k++) {
            const yy = y + (run * k) / n;
            const loop = (rng() - 0.5) * (3 + rng() * 7);
            const cx = col.x + loop * 1.4, cy = yy - run / n / 2;
            x = col.x + (rng() - 0.5) * 7;
            g.quadraticCurveTo(cx, cy, x, yy);
          }
          g.stroke();
          y += run + gh * (0.5 + rng() * 0.9);
          if (rng() < 0.05) y += gh * 3; // a paragraph break
        }
      }
      g.restore();
    },
    () => {
      // the pond's water: a pale indigo wash inside the square, two small ripple rings round the moon
      const p = N.pond;
      g.save();
      g.beginPath();
      g.moveTo(p.x0 + 3, p.y0 + 3); g.lineTo(p.x1 - 2, p.y0 + 4); g.lineTo(p.x1 - 1, p.y1 - 3); g.lineTo(p.x0 + 1, p.y1 - 3);
      g.closePath();
      g.clip();
      field(g, p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0, 0.35, (x, y, out) => {
        const u = (y - p.y0) / (p.y1 - p.y0);
        const ex = Math.min(x - p.x0, p.x1 - x, y - p.y0, p.y1 - y);
        out[0] = 61; out[1] = 90; out[2] = 115;
        out[3] = (0.1 + 0.1 * u + 0.04 * Math.sin(x * 0.05 + y * 0.02)) * Math.min(1, ex / 14);
      });
      // a few horizontal water lines
      g.strokeStyle = 'rgba(40,58,78,.28)';
      g.lineWidth = 0.8;
      for (let i = 0; i < 7; i++) {
        const y = p.y0 + (p.y1 - p.y0) * (0.15 + i * 0.12) + (rng() - 0.5) * 6;
        const x0 = p.x0 + (p.x1 - p.x0) * (0.08 + rng() * 0.3);
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (p.x1 - p.x0) * (0.15 + rng() * 0.3), y + (rng() - 0.5) * 2); g.stroke();
      }
      g.restore();
      // a few grass tufts on the drawn bank
      const S: Stroke[] = [];
      for (let i = 0; i < 5; i++) {
        const x = p.x0 + (p.x1 - p.x0) * (0.1 + i * 0.2) + (rng() - 0.5) * 10, y = p.y1 + 6;
        S.push(st('line', [[x, y, 1], [x - 2, y - 8, 0.4]], 0.5, 40 + i));
        S.push(st('line', [[x + 2, y, 1], [x + 5, y - 7, 0.4]], 0.45, 50 + i));
      }
      paint(g, S, dpr);
    },
    () => paint(g, N.strokes, dpr),
  ];
  return { canvas: c, steps };
}

/** The pond's four strokes, re-stroked (S3 bakes them; S4 draws them per frame while the camera pushes in). */
export function drawPondStrokes(g: CanvasRenderingContext2D, N: NotebookLayout, scale: number): void {
  paint(g, N.strokes, scale);
}
