// 开篇 · S10 信 (spec §4 S10): no words; the real letter will speak. A moon-white sheet writes itself
// in eight columns of unreadable 淡墨, the round 月 seal presses (the first cinnabar), the sheet folds
// into an envelope, and the rabbit takes it in its mouth and crouches. Under a full moon's light.
import { makeRng } from '../../../core/rng';
import type { World } from './frames';
import { C, ease, layer, mk, release, span, type Lay } from './util';
import { drawRabbit, drawEnvelope } from './rabbit';

export interface LetterSet { canvas: HTMLCanvasElement; steps: (() => void)[]; ground: HTMLCanvasElement | null; cols: HTMLCanvasElement | null; dispose(): void }

export function letterGeo(lay: Lay) {
  const { w, h, P } = lay;
  return P
    ? { sheet: { x0: 0.12 * w, y0: 0.12 * h, x1: 0.88 * w, y1: 0.66 * h }, seal: { x: 0.26 * w, y: 0.6 * h }, rabbit: { x: 0.5 * w, y: 0.82 * h + 32, s: 64 }, fan: { x: 0.82 * w, y: 0.1 * h, s: 0.26 * w } }
    : { sheet: { x0: 0.18 * w, y0: 0.1 * h, x1: 0.56 * w, y1: 0.8 * h }, seal: { x: 0.24 * w, y: 0.72 * h }, rabbit: { x: 0.72 * w, y: 0.7 * h + 43, s: 86 }, fan: { x: 0.84 * w, y: 0.24 * h, s: 0.2 * h } };
}

export function paintLetter(lay: Lay): LetterSet {
  const { w, h } = lay;
  const geo = letterGeo(lay);
  const set: LetterSet = { canvas: mk(1, 1), steps: [], ground: null, cols: null, dispose() { release(set.ground); release(set.cols); } };
  set.steps.push(() => {
    const { c, g } = layer(w, h, lay.dpr * 0.8);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.3);
    sky.addColorStop(0, '#26303d'); sky.addColorStop(1, '#6d7684');
    g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.3);
    const gr = g.createLinearGradient(0, h * 0.26, 0, h);
    gr.addColorStop(0, '#e6e2d8'); gr.addColorStop(0.2, '#f3f1ea'); gr.addColorStop(1, '#ece8de');
    g.fillStyle = gr; g.fillRect(0, h * 0.26, w, h * 0.74);
    set.ground = c;
  });
  set.steps.push(() => {
    // eight columns of unreadable writing, right to left, on a transparent layer the size of the sheet
    const s = geo.sheet;
    const sw = s.x1 - s.x0, sh = s.y1 - s.y0;
    const { c, g } = layer(sw, sh, lay.dpr);
    const rng = makeRng(0x1e77);
    g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const x = sw * (0.86 - i * 0.09);
      let y = sh * 0.1;
      const stop = sh * (i === 7 ? 0.5 : 0.86 - rng() * 0.1);
      while (y < stop) {
        g.strokeStyle = `rgba(30,28,26,${0.5 + rng() * 0.25})`;
        g.lineWidth = 1 + rng() * 0.9;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const y0 = y + rng() * 9;
          g.moveTo(x + (rng() - 0.5) * 8, y0);
          g.quadraticCurveTo(x + (rng() - 0.5) * 12, y0 + (rng() - 0.3) * 6, x + (rng() - 0.5) * 8, y0 + rng() * 6);
        }
        g.stroke();
        y += 15 + rng() * 4;
      }
    }
    set.cols = c;
  });
  return set;
}

export function drawS10(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  const L = W.letter;
  const geo = letterGeo(W.lay);
  if (L?.ground) g.drawImage(L.ground, 0, 0, w, h);
  else { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h); }
  // 嫦娥's fan stays faint at top right
  if (W.portrait) { g.save(); g.globalAlpha = 0.35; g.drawImage(W.portrait, geo.fan.x - geo.fan.s / 2, geo.fan.y - geo.fan.s / 2 + geo.fan.s * 0.3, geo.fan.s, geo.fan.s); g.restore(); }
  const s = geo.sheet;
  const fold = ease.io(span(t, 73.7, 74.1));
  const r = geo.rabbit;
  const env = { x: r.x + r.s * 0.3, y: r.y - r.s * 0.55 };
  if (fold < 1) {
    g.save();
    // the sheet folds once and shrinks into the envelope at the rabbit's mouth
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
    const tx = cx + (env.x - cx) * fold, ty = cy + (env.y - cy) * fold;
    const k = 1 - 0.9 * fold;
    g.translate(tx, ty);
    g.scale(k, k * (1 - 0.5 * ease.s(span(t, 73.7, 73.9))));
    g.translate(-cx, -cy);
    g.fillStyle = 'rgba(0,0,0,.1)';
    g.fillRect(s.x0 + 3, s.y0 + 4, s.x1 - s.x0, s.y1 - s.y0);
    g.fillStyle = '#f7f5ee';
    g.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    g.strokeStyle = 'rgba(27,25,22,.2)'; g.lineWidth = 1;
    g.strokeRect(s.x0 + 0.5, s.y0 + 0.5, s.x1 - s.x0 - 1, s.y1 - s.y0 - 1);
    if (L?.cols) {
      // each column brushes in, 0.15 s apiece, right to left (71.4–72.6)
      const sw = s.x1 - s.x0, sh = s.y1 - s.y0;
      for (let i = 0; i < 8; i++) {
        const u = span(t, 71.4 + i * 0.15, 71.55 + i * 0.15);
        if (u <= 0) continue;
        const x = sw * (0.86 - i * 0.09) - sw * 0.045;
        g.save();
        g.beginPath(); g.rect(s.x0 + x, s.y0, sw * 0.09, sh * u); g.clip();
        g.drawImage(L.cols, s.x0, s.y0, sw, sh);
        g.restore();
      }
    }
    // the round 月 seal presses at 73.5: scales 1.25 → 1.0 and settles 2° in 0.18 s
    if (t >= 73.5 && W.sealMoon) {
      const u = ease.out(span(t, 73.5, 73.68));
      const size = W.lay.P ? 44 : 56;
      g.save();
      g.translate(geo.seal.x, geo.seal.y);
      g.rotate((2 * Math.PI) / 180 * u);
      g.scale(1.25 - 0.25 * u, 1.25 - 0.25 * u);
      g.globalAlpha = Math.min(1, 0.4 + u);
      g.drawImage(W.sealMoon, -size / 2, -size / 2, size, size);
      g.restore();
    }
    g.restore();
  }
  // the rabbit: stands, takes the envelope in its mouth (74.1), crouches (74.1–74.4, squash .85)
  const crouch = ease.io(span(t, 74.1, 74.4));
  drawRabbit(g, crouch > 0.5 ? 'crouch' : 'stand', r.s, W.lay.dpr, r.x, r.y, { sy: 1 - 0.15 * crouch, sx: 1 + 0.05 * crouch });
  if (fold >= 1) drawEnvelope(g, env.x - r.s * 0.05 + crouch * r.s * 0.12, env.y + crouch * r.s * 0.3, r.s * 0.46, -0.25, W.sealMoon);
  void C;
}
