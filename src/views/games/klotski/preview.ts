// A small still painting of 华容道 for its card in the games hall: the rosewood tray set out as
// 横刀立马, sitting on paper with plenty of room around it.
import { fillPaper } from '../../../ink/paper';
import { LAYOUT, LAYOUTS, parseLayout } from './logic';
import { FRAME, TAIL, cellOrigin, makeTile, paintTray, tilePad } from './paint';
import { loadSaved } from './store';

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  const dpr = r.width ? canvas.width / r.width : 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fillPaper(ctx, w, h, 29);
  const cell = Math.min((h * 0.98) / (5 + 2 * FRAME + TAIL * 0.4), (w * 0.8) / (4 + 2 * FRAME));
  const trayW = (4 + 2 * FRAME) * cell;
  ctx.save();
  ctx.translate(Math.round(w * 0.5 - trayW / 2), Math.round(h * 0.03));
  paintTray(ctx, cell);
  const pad = tilePad(cell);
  for (const p of parseLayout(LAYOUT.hengdao.map)) {
    const t = makeTile(p.role, p.w, p.h, cell, dpr, p.id.charCodeAt(0) * 97 + 13);
    const o = cellOrigin(cell, p.x, p.y);
    ctx.drawImage(t, o.x - pad, o.y - pad, t.width / dpr, t.height / dpr);
  }
  ctx.restore();
}

/** e.g. "已解 3/7 局 · 横刀立马 81 步". */
export function statLine(lang: 'zh' | 'en'): string | null {
  const s = loadSaved();
  const n = LAYOUTS.filter((l) => s.best[l.id]).length;
  if (!n) return null;
  const h = s.best.hengdao;
  return lang === 'zh'
    ? `已解 ${n}/${LAYOUTS.length} 局${h ? ` · 横刀立马 ${h} 步` : ''}`
    : `${n} of ${LAYOUTS.length} solved${h ? ` · Blade Across the Horse in ${h}` : ''}`;
}
