// /lab.html?scene=incense&t=20&progress=0.3&lit=1&seed=1&burn=0&blow=0&live=0
//   t        seconds of fixed-dt (1/60) simulation before the snapshot
//   progress 0 fresh … 1 burnt out; `burn` = progress gained over the t seconds (shows ash growth / falls)
//   blow     1 = a gust across the smoke 1.5 s before the end
//   live     1 = keep animating (for a browser); otherwise one still frame
// Prints average step+draw ms (and the paper blit separately) at the bottom.
import { createIncenseScene } from '../../ink/incense';
import { fillPaper, makePaperTile } from '../../ink/paper';

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const T = Number(p.get('t') ?? 20);
  const progress = Number(p.get('progress') ?? 0.3);
  const burn = Number(p.get('burn') ?? 0);
  const lit = p.get('lit') !== '0';
  const seed = Number(p.get('seed') ?? 1);
  const blow = p.get('blow') === '1';
  const live = p.get('live') === '1';
  const zoom = Number(p.get('zoom') ?? 1); // >1: re-layout at zoom× and frame the censer
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width / dpr, H = canvas.height / dpr;

  const tr0 = performance.now();
  const scene = createIncenseScene(seed);
  scene.resize(W * zoom, H * zoom, dpr);
  let tx = W / 2 - (W * zoom) / 2, ty = zoom > 1 ? H * 0.97 - H * zoom * 0.935 : 0;
  const focusTip = p.get('focus') === 'tip';
  const resizeMs = performance.now() - tr0;
  scene.setLit(lit);

  const dt = 1 / 60;
  const steps = Math.round(T / dt);
  for (let i = 0; i < steps; i++) {
    scene.setProgress(progress - burn * (1 - i / steps));
    if (blow && i === steps - 90) {
      const tp = scene.tip();
      for (let j = 0; j < 8; j++) scene.disturb(tp.x - 40 + j * 12, tp.y - 70, 420, -60);
    }
    scene.step(dt);
  }
  scene.setProgress(progress);

  const tile = makePaperTile(512, 7);
  const pat = ctx.createPattern(tile, 'repeat')!;
  const paper = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  };

  // timing: 120 frames of step + draw (paper blit measured separately)
  let tStep = 0, tDraw = 0, tPaper = 0;
  const acc = { build: 0, mist: 0, blit: 0, core: 0 };
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a = performance.now();
    paper();
    const b = performance.now();
    scene.step(dt);
    const c = performance.now();
    scene.draw(ctx);
    const d = performance.now();
    tPaper += b - a; tStep += c - b; tDraw += d - c;
    const ms = scene.stats().ms;
    if (ms) { acc.build += ms.build; acc.mist += ms.mist; acc.blit += ms.blit; acc.core += ms.core; }
  }
  // make the canvas flush so draw timings include rasterisation
  ctx.getImageData(0, 0, 1, 1);

  const label = () => {
    const st = scene.stats();
    ctx.font = '11px system-ui';
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillText(`step ${(tStep / N).toFixed(2)} ms · draw ${(tDraw / N).toFixed(2)} ms · paper ${(tPaper / N).toFixed(2)} ms · resize ${resizeMs.toFixed(0)} ms`, 8, H - 22);
    const m = { build: acc.build / N, mist: acc.mist / N, blit: acc.blit / N, core: acc.core / N };
    ctx.fillText(`particles ${st.particles} · strokes ${st.strokes} · t=${T}s p=${progress}` + (m ? ` · b${m.build.toFixed(2)} m${m.mist.toFixed(2)} u${m.blit.toFixed(2)} c${m.core.toFixed(2)}` : ''), 8, H - 8);
  };

  paper();
  if (focusTip) { const tp = scene.tip(); tx = W / 2 - tp.x; ty = H * 0.62 - tp.y; }
  ctx.translate(tx, ty);
  scene.draw(ctx);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  label();

  if (live) {
    let last = performance.now();
    let px = 0, py = 0, down = false;
    canvas.addEventListener('pointerdown', (e) => { down = true; px = e.clientX; py = e.clientY; });
    canvas.addEventListener('pointerup', () => { down = false; });
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      const now = performance.now();
      const dts = Math.max(0.008, (now - last) / 1000);
      scene.disturb(e.clientX, e.clientY, (e.clientX - px) / dts, (e.clientY - py) / dts);
      px = e.clientX; py = e.clientY;
    });
    const loop = (now: number) => {
      const d = Math.min(0.05, (now - last) / 1000);
      last = now;
      scene.step(d);
      paper();
      scene.draw(ctx);
      label();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  void fillPaper;
}
