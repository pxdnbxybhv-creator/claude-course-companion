// /lab.html?scene=intro — the opening film 《月亮看见的》 (spec §12).
//   &t=<s>&w=&h=&cut=full|short&hour=&term=&tier=&seal=&lang=   one frame, with its DOM text
//   &sheet=1          contact sheet at shot midpoints (both cuts)
//   &sheet=captions   every line with its in/out times and its reading need (the owner's review sheet)
//   &sheet=rabbit     the rabbit and the moon
//   &sheet=seams      S7's pan over the willow (49.5–49.9) and S7c's dissolve and climb (57.9–59.6)
//   &perf=1 · &mem=1 · &bench=1
// window.__seek(t) re-renders the frame at t (the frame dumps use it).
import { CUTS, LINES, TEXT, layoutFor, type Txt } from '../../views/intro/shots';
import { RABBIT_POSES, drawRabbit, drawPestle, drawMortar, moonRabbitPath, type RabbitPose } from '../../views/intro/paint/rabbit';
import { drawMoon } from '../../views/intro/paint/moon';
import { C } from '../../views/intro/paint/util';
import type { Cut } from '../../app/intro';
import { cloneCanvas, envNow, prepareFilm, registerJobs } from '../../views/intro/Film';
import { Captions, EndWords } from '../../views/intro/captions';
import { PaintQueue, budgetDpr, flagsFor, makeStageLay } from '../../views/intro/stage';
import { World, defaultRect, renderFrame } from '../../views/intro/paint/frames';
import { ctxOf, mk } from '../../views/intro/paint/util';
import { shotAt } from '../../views/intro/shots';
import { getSeal } from '../../views/quests/paint';
import { todayLine } from '../../views/garden/env';
import type { Tier } from '../../app/intro';

declare global { interface Window { __seek?: (t: number) => Promise<number> } }

export default async function (canvas: HTMLCanvasElement, q: URLSearchParams) {
  const sheet = q.get('sheet');
  if (sheet === 'rabbit') return rabbitSheet(canvas);
  if (sheet === 'captions') return captionSheet(canvas);
  return labFilm(canvas, q);
}

// ---------------------------------------------------------------------------------------------- rabbit

function rabbitSheet(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const W = innerWidth, H = Math.max(innerHeight, 1100);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  g.font = '13px "LXGW WenKai", serif';
  g.fillStyle = C.ink;
  const cols = Math.max(3, Math.floor(W / 150));
  const cell = W / cols;
  RABBIT_POSES.forEach((p, i) => {
    const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * 170 + 150;
    drawRabbit(g, p as RabbitPose, 110, dpr, x, y);
    if (p === 'pound') { drawPestle(g, 110, x - 55 + 70 * 1.1, y - 110 + 75 * 1.1, -0.2); drawMortar(g, x + 48, y, 34); }
    g.fillText(p, x - 20, y + 16);
  });
  // sizes as used in the film
  let y0 = Math.ceil(RABBIT_POSES.length / cols) * 170 + 110;
  const sizes = [36, 52, 64, 70, 90];
  sizes.forEach((s, i) => { drawRabbit(g, 'sit', s, dpr, 40 + i * 90, y0); g.fillText(`${s}px`, 30 + i * 90, y0 + 16); });
  y0 += 60;
  // the moon with its rabbit, several phases, with the pestle up and struck
  g.fillStyle = C.sky; g.fillRect(0, y0, W, 260);
  const phases = [0.062, 0.23, 0.35, 0.5, 0.62, 0.8];
  phases.forEach((ph, i) => {
    const x = 60 + (i % 6) * ((W - 80) / 6), y = y0 + 80;
    drawMoon(g, x, y, 42, ph, { rabbit: { pestle: i % 2 }, halo: true, maria: true });
  });
  drawMoon(g, W * 0.3, y0 + 200, 50, 0.5, { rabbit: { lean: 1 }, halo: true, maria: true });
  drawMoon(g, W * 0.7, y0 + 200, 50, 0.5, { rabbit: { flick: 1 }, halo: true, maria: true, reflect: true });
  void moonRabbitPath;
}

// ---------------------------------------------------------------------------------------------- captions

function captionSheet(canvas: HTMLCanvasElement) {
  canvas.style.display = 'none';
  const hz = (s: string) => [...s].filter((c) => /[\u3400-\u9fff]/.test(c)).length;
  const row = (t: Txt) => t.lines.map((l, i) => {
    const need = 1.8 + 0.25 * hz(l.zh);
    const have = t.out - l.at;
    const ok = t.kind === 'label' && hz(l.zh) < 5 ? '—' : have + 1e-9 >= need ? '✓' : '✗';
    return `<tr><td>${i === 0 ? t.id : ''}</td><td>${t.kind}</td><td>${l.at.toFixed(2)}</td><td>${i === t.lines.length - 1 ? t.out.toFixed(2) : ''}</td><td>${have.toFixed(2)} ≥ ${need.toFixed(2)} ${ok}</td><td class="zh">${l.zh}${t.by && i === t.lines.length - 1 ? `<small> · ${t.by}</small>` : ''}${t.live ? ' <small>(live)</small>' : ''}</td></tr>`;
  }).join('');
  const table = (cut: Cut) => `<h2>${cut === 'full' ? '全片' : '短版'} · ${CUTS[cut].end} s</h2><table><tr><th>id</th><th>kind</th><th>in</th><th>out</th><th>on screen ≥ need</th><th>text</th></tr>${TEXT[cut].map(row).join('')}</table>`;
  const variants = [LINES.C22round, LINES.C22bent, LINES.C22half, LINES.C22day].map((s) => `<li>${s} <small>${hz(s)} 字 → ${(1.8 + 0.25 * hz(s)).toFixed(2)} s of 5.3</small></li>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<style>body{font:14px 'LXGW WenKai',serif;color:#1b1916;padding:16px}table{border-collapse:collapse;margin-bottom:24px}td,th{border-bottom:1px solid #d8ccb4;padding:3px 8px;text-align:left}td.zh{font-size:17px}small{color:#7a6f5f}</style>
    <h1>《月亮看见的》 · 字幕表</h1>${table('full')}${table('short')}<h2>C22</h2><ul class="zh">${variants}</ul>
    <p>layout 390×844 ${layoutFor(390, 844).cls} · 1280×800 ${layoutFor(1280, 800).cls} · 844×390 ${layoutFor(844, 390).cls} · 320×568 ${layoutFor(320, 568).cls}</p>`);
}

// ---------------------------------------------------------------------------------------------- the film in the lab (kept out of the film chunk)

/** /lab.html?scene=intro — one frame (with its DOM text), a contact sheet, the seams; window.__seek(t). */
async function labFilm(labCanvas: HTMLCanvasElement, q: URLSearchParams): Promise<void> {
  await import('../../views/intro/gate.css');
  await import('../../styles/tokens.css');
  const w = Number(q.get('w')) || innerWidth, h = Number(q.get('h')) || innerHeight;
  const cut = (q.get('cut') === 'short' ? 'short' : 'full') as Cut;
  const tier = (q.get('tier') as Tier) || 'high';
  const dpr = budgetDpr(w, h, tier === 'low' ? 'low' : 'high');
  const lay = makeStageLay(w, h, dpr);
  const W = new World({ lay, cut, tier, seal: q.get('seal') || '半亩', dark: false, env: envNow() }, flagsFor(Number(q.get('level') || 0), tier));
  const queue = new PaintQueue();
  registerJobs({ world: W, queue }, cut);
  const sd = Math.min(2, window.devicePixelRatio || 1);
  const t0 = performance.now();
  await Promise.all([
    getSeal('月', 60, sd).then((c) => { W.sealMoon = c; }, () => {}),
    getSeal(W.seal, 56, sd).then((c) => { W.sealName = c; }, () => {}),
    document.fonts?.load(`30px "Ma Shan Zheng"`, '半亩方塘一鉴开问渠那得清如许为有源头活水来'),
  ]);
  await queue.finishUntil(CUTS[cut].end);
  const paintMs = performance.now() - t0;
  const { cls } = { cls: lay.cls };
  const sheet = q.get('sheet');
  if (sheet === '1' || sheet === 'seams') {
    const times = sheet === 'seams' ? [49.5, 49.6, 49.7, 49.8, 49.9, 57.9, 58.05, 58.2, 58.6, 59.0, 59.6, 60.1]
      : CUTS[cut].shots.map((s) => (s.t0 + s.t1) / 2).filter((t) => t > 3.5);
    const c = mk(w * dpr, h * dpr);
    const g = ctxOf(c);
    const cols = Math.min(6, times.length), rows = Math.ceil(times.length / cols);
    const cw = Math.floor(innerWidth / cols), chh = Math.round((cw * h) / w);
    labCanvas.width = cw * cols * (window.devicePixelRatio || 1); labCanvas.height = (chh + 18) * rows * (window.devicePixelRatio || 1);
    labCanvas.style.width = cw * cols + 'px'; labCanvas.style.height = (chh + 18) * rows + 'px';
    const lg = ctxOf(labCanvas);
    lg.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    lg.font = '12px system-ui';
    times.forEach((t, i) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderFrame(g, W, t);
      const x = (i % cols) * cw, y = Math.floor(i / cols) * (chh + 18);
      lg.drawImage(c, x, y, cw, chh);
      lg.fillStyle = '#1b1916';
      lg.fillText(`${shotAt(cut, t).shot.id} ${t.toFixed(2)}s`, x + 4, y + chh + 13);
    });
    return;
  }
  labCanvas.style.display = 'none';
  const root = document.createElement('div');
  root.className = `intro-film is-${cls === 'P' ? 'P' : 'L'}${cls === 'shortL' ? ' is-shortL' : ''}`;
  root.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;inset:auto`;
  root.setAttribute('lang', 'zh-CN');
  const slot = document.createElement('div');
  slot.className = 'intro-slot';
  const live = document.createElement('div');
  live.className = 'intro-live';
  live.style.display = 'none';
  root.append(slot, live);
  document.body.append(root);
  const stage = document.createElement('div');
  stage.className = 'intro-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'intro-canvas';
  canvas.width = w * dpr; canvas.height = h * dpr;
  stage.append(canvas);
  slot.append(stage);
  const g = ctxOf(canvas);
  const caps = new Captions(slot, stage, { cut, w, h, reduced: tier === 'still', sky: LINES.C22round, date: todayLine(new Date()).zh });
  const rect = defaultRect(lay);
  W.garden = { rect, snap: null, pond: null, body: null, title: new DOMRect(16, 14, 68, 34), mail: new DOMRect(w - 100, 14, 40, 40) };
  const end = new EndWords(slot, { title: W.garden.title, date: new DOMRect(96, 24, 200, 18), rect, mail: W.garden.mail }, { cut, w, h, date: todayLine(new Date()).zh, colophon: LINES.K, seal: W.sealName ? cloneCanvas(W.sealName) : null, english: false });
  const seek = async (t: number): Promise<number> => {
    const a = performance.now();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = renderFrame(g, W, t);
    stage.style.transform = f.stage;
    caps.update(t);
    end.update(t);
    const ms = performance.now() - a;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return ms;
  };
  window.__seek = seek;
  const t = Number(q.get('t') ?? 16);
  const ms = await seek(t);
  if (q.get('perf') || q.get('mem')) {
    const p = document.createElement('pre');
    p.style.cssText = 'position:fixed;right:0;bottom:0;margin:0;padding:4px 8px;background:#fff9;font:11px monospace;z-index:9';
    p.textContent = `paint ${paintMs.toFixed(0)} ms · frame ${ms.toFixed(1)} ms · dpr ${dpr.toFixed(2)} · ${cls}`;
    document.body.append(p);
  }
  if (q.get('bench')) {
    const pr = prepareFilm({ reduced: false, seal: '半亩', w, h, dark: false });
    const b = pr.probe();
    console.log('bench ms/Mpx', b);
    pr.dispose();
  }
}
