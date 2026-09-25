// A small still painting of 飞花令 for its card in the games hall: the 「花」 order as a seal, and
// two lines of verse in columns with the character picked out in cinnabar.
import { fillPaper } from '../../../ink/paper';
import { makeSeal } from '../../../ink/seal';
import { linesWith } from './logic';
import { loadStats } from './store';

const TEXT = "'LXGW WenKai', 'STKaiti', 'KaiTi', serif";

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  const dpr = r.width ? canvas.width / r.width : 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fillPaper(ctx, w, h, 41);
  // two real lines holding 花, written top to bottom, right to left
  const pool = linesWith('花').filter((c) => c.text.length <= 7);
  const lines = [pool[3] ?? pool[0], pool[9] ?? pool[1]].filter(Boolean);
  const size = Math.min(15, (h - 16) / 7.4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${size}px ${TEXT}`;
  lines.forEach((c, k) => {
    const x = w * 0.66 - k * size * 2.1;
    [...c.text].forEach((ch, i) => {
      ctx.fillStyle = ch === '花' ? '#b93a2b' : k ? 'rgba(27,25,22,0.62)' : 'rgba(27,25,22,0.86)';
      ctx.fillText(ch, x, 8 + i * size * 1.06);
    });
  });
  const S = Math.min(46, h * 0.42);
  const seal = makeSeal('花', { size: S, dpr, style: 'bai', seed: 33 });
  ctx.drawImage(seal, w * 0.3 - S / 2, h * 0.52 - S / 2, S, S);
}

/** e.g. "最长连 12 句". */
export function statLine(lang: 'zh' | 'en'): string | null {
  const s = loadStats();
  if (!s.games) return null;
  return lang === 'zh' ? `最长连 ${s.best} 句 · 行令 ${s.games} 回` : `Best chain ${s.best} · ${s.games} game${s.games === 1 ? '' : 's'}`;
}
