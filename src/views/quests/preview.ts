// The quest-book card in the games hall: a page of the book on xuan paper — red column rules, a
// few quests written top-to-bottom (the finished ones ticked with a cinnabar circle), the portrait
// of whoever you walk as, and a seal pressed at the foot. Cheap after the first paint (the portrait
// and seal are cached); repaints once when the fonts arrive.
import { fillPaper } from '../../ink/paper';
import { makeSeal, sealReady, SEAL_RED } from '../../ink/seal';
import { play } from '../../app/play';
import { QUESTS } from '../../data/quests';
import { paintCompanion } from './paint';
import { SEAL_QUESTS, statText } from './helpers';

const TEXT_FONT = "'LXGW WenKai','Kaiti SC','STKaiti','KaiTi',serif";
let sealImg: { key: string; c: HTMLCanvasElement } | null = null;
const waiting = new WeakSet<HTMLCanvasElement>();

function fontsReady(sample: string): boolean {
  try {
    return document.fonts ? document.fonts.check(`16px ${TEXT_FONT.split(',')[0]}`, sample) && document.fonts.check(`16px 'Ma Shan Zheng'`, '簿') : true;
  } catch {
    return true;
  }
}

export function paintPreview(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  const css = canvas.clientWidth || W;
  const dpr = W / css;
  const u = H / 120; // one unit = 1/120 of the height
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  fillPaper(g, W, H, 17);

  const p = play.value;
  const pick = [...QUESTS.slice(0, 6)];
  const sample = pick.map((q) => q.zh).join('') + '簿任务';
  // after one wait for the fonts, paint with whatever face is there
  const ready = fontsReady(sample) || waiting.has(canvas);

  // red column rules (八行笺), with a margin band at the top and bottom
  const top = 12 * u, bot = H - 12 * u;
  const colW = 17 * u;
  g.strokeStyle = 'rgba(185,58,43,0.32)';
  g.lineWidth = Math.max(1, 0.6 * u);
  g.beginPath();
  for (let x = W - 8 * u; x > W * 0.36; x -= colW) {
    g.moveTo(x, top);
    g.lineTo(x, bot);
  }
  g.moveTo(W * 0.36, top); g.lineTo(W - 8 * u, top);
  g.moveTo(W * 0.36, bot); g.lineTo(W - 8 * u, bot);
  g.stroke();

  // the quests, written in columns right to left (the rightmost column starts below the hall's badge)
  if (ready) {
    g.fillStyle = 'rgba(27,25,22,0.86)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fs = 11 * u;
    g.font = `${fs}px ${TEXT_FONT}`;
    // the hall's round badge sits in the top-right corner: start left of it (the strip stays blank)
    let x = W - 52 * u - colW / 2;
    for (const q of pick) {
      if (x < W * 0.36 + colW * 0.5) break;
      const chars = Array.from(q.zh);
      const y0 = top + 14 * u;
      const room = Math.floor((bot - y0 - 4 * u) / (fs * 1.08));
      chars.slice(0, room).forEach((ch, k) => g.fillText(ch, x, y0 + k * fs * 1.08));
      if (p.done[q.id]) {
        // 圈 — a cinnabar circle beside a finished one
        g.strokeStyle = 'rgba(185,58,43,0.85)';
        g.lineWidth = Math.max(1, 0.9 * u);
        g.beginPath();
        g.ellipse(x, y0 - fs * 0.95, fs * 0.34, fs * 0.3, 0, 0.3, Math.PI * 2.15);
        g.stroke();
      }
      x -= colW;
    }
  }

  // the companion you walk as, on a round fan
  const S = Math.round(Math.min(H * 0.8, W * 0.3));
  const fan = document.createElement('canvas');
  fan.width = fan.height = S;
  try {
    paintCompanion(fan, p.character, false);
    const fx = Math.max(6 * u, W * 0.18 - S / 2), fy = (H - S) / 2;
    g.save();
    g.shadowColor = 'rgba(40,28,14,0.3)';
    g.shadowBlur = 8 * u;
    g.shadowOffsetY = 3 * u;
    g.drawImage(fan, fx, fy, S, S);
    g.restore();
  } catch { /* the page alone is fine */ }

  // a seal pressed at the foot of the page: your latest seal, or 「任务」
  const latest = SEAL_QUESTS.filter((q) => p.done[q.id]).sort((a, b) => (p.done[a.id] < p.done[b.id] ? 1 : -1))[0];
  const text = latest && 'seal' in latest.reward ? latest.reward.seal : '任务';
  const size = Math.round(30 * u / dpr);
  const key = `${text}|${size}|${dpr}`;
  if (ready) {
    try {
      if (!sealImg || sealImg.key !== key) sealImg = { key, c: makeSeal(text, { size, dpr, style: 'bai', wear: 0.5, color: SEAL_RED, seed: 88 }) };
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.translate(W * 0.36 + 4 * u, H - 14 * u - 30 * u);
      g.rotate(-0.06);
      g.drawImage(sealImg.c, 0, 0, 30 * u, 30 * u);
      g.restore();
    } catch { /* no seal */ }
  }

  if (!ready && !waiting.has(canvas) && typeof document !== 'undefined' && document.fonts) {
    waiting.add(canvas);
    void Promise.all([document.fonts.load(`16px 'LXGW WenKai'`, sample), sealReady(text)])
      .catch(() => undefined)
      .then(() => {
        if (canvas.isConnected && canvas.width === W && canvas.height === H) paintPreview(canvas);
      });
  }
}

/** "同伴 4/13 · 印 2" / "Companions 4/13 · Seals 2". */
export function statLine(lang: 'zh' | 'en'): string | null {
  try {
    return statText(play.value, lang);
  } catch {
    return null;
  }
}
