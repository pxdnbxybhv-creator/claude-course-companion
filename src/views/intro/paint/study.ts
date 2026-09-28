// 开篇 · S7 镜中月, S7c 一炷香 and the short cut's S7s 一窗 (spec §4): the thatched study on the right
// bank with its lit lattice window, the bronze mirror that glows like a second moon, the fight on
// Moon Lake inside it (the mirror kit's own sprites, or the PV's moon-with-eyes fallback), the room
// with the reader, the censer and the board, and the tall sky the incense thread climbs to the moon.
import type { Stroke } from '../../../ink/types';
import { makeRng } from '../../../core/rng';
import { censerDrawing } from '../../../ink/incense';
import { paintBoxwood, paintPiece } from '../../../views/games/xiangqi/board';
import { renderSpec, type Painted } from '../../mirror/paint/atlas';
import { CHAR_SPECS } from '../../mirror/paint/figures';
import { MON_SPECS } from '../../mirror/paint/monsters';
import { MOON_SPEC } from '../../mirror/paint/bosses';
import type { Cut } from '../../../app/intro';
import type { World } from './frames';
import { drawNightGardenStill } from './frames';
import { montageAt } from '../beats';
import { C, ctxOf, ease, layer, mk, paint, release, span, st, type Lay } from './util';
import { drawMoon } from './moon';
import { drawFigure } from './figure';

export interface StudySet {
  canvas: HTMLCanvasElement;
  steps: (() => void)[];
  ext: HTMLCanvasElement | null;
  int: HTMLCanvasElement | null;
  willow: HTMLCanvasElement | null;
  board: HTMLCanvasElement | null;
  censer: HTMLCanvasElement | null;
  pieces: HTMLCanvasElement[];
  /** The backdrop's right-edge sky, sampled at the first pan frame. */
  edge?: [number, string][];
  sprites: { scholar: Painted[]; mons: Painted[]; boss: Painted | null } | null;
  geo: StudyGeo;
  dispose(): void;
}

export interface StudyGeo {
  panX: number;
  /** The hut's lit window on the plate (plate css px) and the mirror seen through it. */
  win: { x: number; y: number; w: number; h: number };
  mirrorPlate: { x: number; y: number; r: number };
  /** The arena circle on screen. */
  arena: { x: number; y: number; R: number };
  /** In the room (interior plate = screen at scale 1). */
  room: { mirror: { x: number; y: number; r: number }; censer: { x: number; y: number; s: number }; board: { x0: number; y0: number; x1: number; y1: number }; reader: { x: number; y: number; s: number }; sill: number };
  /** The moon at the top of the climb. */
  moon: { x: number; y: number; r: number };
}

export function studyGeo(lay: Lay): StudyGeo {
  const { w, h, P } = lay;
  const panX = (P ? 0.6 : 0.4) * w;
  const hutX = (P ? 0.2 : 0.14) * w, hutY = h * 0.56;
  const win = { x: hutX - w * (P ? 0.07 : 0.035), y: hutY - h * (P ? 0.05 : 0.07), w: w * (P ? 0.14 : 0.07), h: h * (P ? 0.07 : 0.1) };
  return {
    panX,
    win,
    mirrorPlate: { x: win.x + win.w * 0.3, y: win.y + win.h * 0.45, r: win.h * 0.24 },
    arena: P ? { x: 0.5 * w, y: 0.45 * h, R: 0.45 * w } : { x: 0.5 * w, y: 0.46 * h, R: 0.36 * h },
    room: P
      ? { mirror: { x: 0.18 * w, y: 0.28 * h, r: 0.09 * w }, censer: { x: 0.7 * w, y: 0.72 * h, s: 0.2 * w }, board: { x0: 0.62 * w, y0: 0.52 * h, x1: 0.9 * w, y1: 0.64 * h }, reader: { x: 0.42 * w, y: 0.72 * h, s: 0.2 * h }, sill: 0.74 * h }
      : { mirror: { x: 0.2 * w, y: 0.3 * h, r: 0.07 * h }, censer: { x: 0.66 * w, y: 0.7 * h, s: 0.16 * h }, board: { x0: 0.52 * w, y0: 0.54 * h, x1: 0.74 * w, y1: 0.66 * h }, reader: { x: 0.37 * w, y: 0.72 * h, s: 0.22 * h }, sill: 0.72 * h },
    moon: P ? { x: 0.5 * w, y: 0.38 * h, r: 0.34 * w } : { x: 0.54 * w, y: 0.4 * h, r: 0.26 * h },
  };
}

export function paintStudy(lay: Lay, cut: Cut): StudySet {
  const { w, h, P } = lay;
  const dpr = lay.dpr;
  const geo = studyGeo(lay);
  const rng = makeRng(0x57d);
  const set: StudySet = {
    canvas: mk(1, 1), steps: [], ext: null, int: null, willow: null, board: null, censer: null, pieces: [], sprites: null, geo,
    dispose() { for (const c of [set.ext, set.int, set.willow, set.board, set.censer, ...set.pieces]) release(c); },
  };
  const S = (kind: Stroke['kind'], pts: [number, number, number][], tone: number, o: Partial<Stroke> = {}) => st(kind, pts, tone, Math.floor(rng() * 1e9), o);
  set.steps.push(() => {
    // the exterior plate: its own night sky, a mist band over its left 12 %, the bank, the hut
    const { c, g } = layer(w, h, dpr * 0.85);
    // the sky is left clear (the pan lays the backdrop's own sky colour under it; the climb its strip)
    const gr = g.createLinearGradient(0, h * 0.58, 0, h);
    gr.addColorStop(0, 'rgba(200,196,186,0)'); gr.addColorStop(0.08, '#cfcabe'); gr.addColorStop(1, '#e2dccd');
    g.fillStyle = gr; g.fillRect(0, h * 0.58, w, h * 0.42);
    const hx = P ? 0.2 * w : 0.14 * w, hy = h * 0.56, hw = w * (P ? 0.36 : 0.18);
    const strokes: Stroke[] = [];
    // a far ridge
    strokes.push(S('wash', [[0, h * 0.5, 8], [w * 0.3, h * 0.42, 0], [w * 0.7, h * 0.47, 0], [w, h * 0.44, 0], [w, h * 0.62, 0], [0, h * 0.62, 0]], 0.18, { color: C.indigo }));
    // walls: an opaque plaster base (the hut must not read see-through against the dark climb), then the brush fill
    g.fillStyle = '#d6cdb8';
    g.fillRect(hx - hw * 0.42, hy - hw * 0.12, hw * 0.84, hw * 0.44);
    strokes.push(S('fill', [[hx - hw * 0.42, hy - hw * 0.12, 1], [hx + hw * 0.42, hy - hw * 0.12, 0], [hx + hw * 0.42, hy + hw * 0.32, 0], [hx - hw * 0.42, hy + hw * 0.32, 0]], 0.5, { color: '#ded6c4' }));
    strokes.push(S('line', [[hx - hw * 0.42, hy - hw * 0.1, 1.6], [hx - hw * 0.43, hy + hw * 0.33, 1.4]], 0.7));
    strokes.push(S('line', [[hx + hw * 0.42, hy - hw * 0.1, 1.6], [hx + hw * 0.41, hy + hw * 0.33, 1.4]], 0.7));
    strokes.push(S('line', [[hx - hw * 0.5, hy + hw * 0.33, 1.4], [hx + hw * 0.5, hy + hw * 0.34, 1.2]], 0.6));
    // the thatched roof: a wash and many dry strokes
    strokes.push(S('wash', [[hx - hw * 0.62, hy - hw * 0.08, 4], [hx - hw * 0.1, hy - hw * 0.5, 0], [hx + hw * 0.1, hy - hw * 0.52, 0], [hx + hw * 0.62, hy - hw * 0.06, 0], [hx, hy - hw * 0.1, 0]], 0.45, { color: '#6d5e48' }));
    for (let i = 0; i < 16; i++) {
      const u = i / 15;
      const x0 = hx - hw * 0.6 + u * hw * 1.2;
      strokes.push(S('dry', [[hx + (u - 0.5) * hw * 0.2, hy - hw * 0.5, 3], [x0, hy - hw * 0.07, 2]], 0.55, { color: '#3b3226', dryness: 0.7 }));
    }
    // a willow-less bank, reeds
    for (let i = 0; i < 9; i++) {
      const x = w * (0.02 + rng() * 0.9), y = h * (0.64 + rng() * 0.1);
      strokes.push(S('line', [[x, y, 1.2], [x + (rng() - 0.5) * 8, y - 14 - rng() * 10, 0.3]], 0.5));
    }
    paint(g, strokes, dpr * 0.85);
    // the lit lattice window (gamboge .35) and the bronze mirror glowing moon-white inside
    const wi = geo.win;
    g.fillStyle = 'rgba(217,166,46,.35)';
    g.fillRect(wi.x, wi.y, wi.w, wi.h);
    const m = geo.mirrorPlate;
    const glow = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 2.4);
    glow.addColorStop(0, 'rgba(250,248,240,.95)'); glow.addColorStop(0.4, 'rgba(250,248,240,.45)'); glow.addColorStop(1, 'rgba(250,248,240,0)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(m.x, m.y, m.r * 2.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(58,44,30,.8)';
    g.lineWidth = 1.2;
    for (let i = 0; i <= 5; i++) { const x = wi.x + (wi.w * i) / 5; g.beginPath(); g.moveTo(x, wi.y); g.lineTo(x, wi.y + wi.h); g.stroke(); }
    for (let j = 0; j <= 4; j++) { const y = wi.y + (wi.h * j) / 4; g.beginPath(); g.moveTo(wi.x, y); g.lineTo(wi.x + wi.w, y); g.stroke(); }
    // (no baked edge fade: the pan lays its mist band over the join, and the climb needs the hut opaque)
    set.ext = c;
  });
  set.steps.push(() => {
    // the willow: a trunk in 重墨 dry strokes with a few hanging strands, over the seam
    const ww = w * 0.22, wh = h * 1.1;
    const { c, g } = layer(ww, wh, dpr * 0.75);
    const strokes: Stroke[] = [];
    const bx = ww * 0.5;
    for (let k = 0; k < 3; k++) strokes.push(S('dry', [[bx + (k - 1) * 7, wh, 16 - k * 3], [bx + 8 + (k - 1) * 5, wh * 0.55, 13 - k * 2], [bx - 4 + (k - 1) * 4, wh * 0.12, 9], [bx + 10, -10, 6]], 0.85, { color: C.ink, dryness: 0.5 }));
    for (let i = 0; i < 14; i++) {
      const x0 = bx + (rng() - 0.3) * ww * 0.9, y0 = wh * (0.02 + rng() * 0.3);
      strokes.push(S('line', [[x0, y0, 1.2], [x0 + (rng() - 0.5) * 12, y0 + wh * (0.2 + rng() * 0.25), 0.4]], 0.55));
    }
    paint(g, strokes, dpr * 0.75);
    set.willow = c;
  });
  set.steps.push(() => {
    // the room: a dim warm wall, the floor, a low table with an open book, the window and its sill
    const { c, g } = layer(w, h, dpr * 0.85);
    const wall = g.createLinearGradient(0, 0, w, h);
    wall.addColorStop(0, '#5b5244'); wall.addColorStop(0.6, '#8a7c64'); wall.addColorStop(1, '#6a5e4c');
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,34,26,.35)'; g.fillRect(0, h * 0.66, w, h * 0.34);
    const R = geo.room;
    // the window on the right, moonlight through the lattice
    const wx = P ? 0.6 * w : 0.58 * w, wy = h * 0.14, ww = P ? 0.4 * w : 0.3 * w, wh = R.sill - wy;
    g.fillStyle = 'rgba(206,214,222,.55)'; g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = 'rgba(40,30,20,.85)'; g.lineWidth = 2;
    for (let i = 0; i <= 5; i++) { const x = wx + (ww * i) / 5; g.beginPath(); g.moveTo(x, wy); g.lineTo(x, wy + wh); g.stroke(); }
    for (let j = 0; j <= 4; j++) { const y = wy + (wh * j) / 4; g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + ww, y); g.stroke(); }
    g.fillStyle = '#4a3c2c'; g.fillRect(wx - 10, R.sill, ww + 20, 10);
    // moonlight falling on the floor
    g.fillStyle = 'rgba(230,232,228,.12)';
    g.beginPath(); g.moveTo(wx, R.sill + 10); g.lineTo(wx + ww, R.sill + 10); g.lineTo(wx + ww * 0.6, h); g.lineTo(wx - ww * 0.6, h); g.closePath(); g.fill();
    // the low table and the book
    const tx = R.reader.x + R.reader.s * 0.35, ty = R.reader.y - R.reader.s * 0.2;
    g.fillStyle = '#3b2f22'; g.fillRect(tx - R.reader.s * 0.3, ty, R.reader.s * 0.9, R.reader.s * 0.06);
    g.fillRect(tx - R.reader.s * 0.25, ty, 4, R.reader.s * 0.22); g.fillRect(tx + R.reader.s * 0.52, ty, 4, R.reader.s * 0.22);
    g.fillStyle = '#efe4cc';
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + R.reader.s * 0.18, ty - R.reader.s * 0.04); g.lineTo(tx + R.reader.s * 0.36, ty); g.closePath(); g.fill();
    // the stool for the board
    const b = R.board;
    g.fillStyle = '#3b2f22';
    const sk = 0.12 * ((b.y1 - b.y0) / 0.55);
    g.fillRect(b.x0 - sk + (b.x1 - b.x0) * 0.1, b.y1, 5, h * 0.08); g.fillRect(b.x1 - sk - (b.x1 - b.x0) * 0.14, b.y1, 5, h * 0.08);
    // the bronze mirror on the back wall (its moon-white face flickers per frame)
    const m = R.mirror;
    g.fillStyle = '#8a6a3a'; g.beginPath(); g.arc(m.x, m.y, m.r * 1.15, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(95,138,110,.5)';
    for (let i = 0; i < 12; i++) { const a = rng() * Math.PI * 2; g.beginPath(); g.arc(m.x + Math.cos(a) * m.r * 1.07, m.y + Math.sin(a) * m.r * 1.07, 1.6, 0, Math.PI * 2); g.fill(); }
    set.int = c;
  });
  set.steps.push(() => {
    // the censer (a Drawing through the brush) and the board with its pieces
    const R = geo.room;
    const cl = censerDrawing(3);
    const d = cl.drawing;
    const sc = R.censer.s / Math.max(d.width, d.height);
    const { c, g } = layer(d.width * sc, d.height * sc, dpr);
    g.scale(sc, sc);
    paint(g, d.strokes, dpr * sc);
    set.censer = c;
    const bw = R.board.x1 - R.board.x0, bh = (R.board.y1 - R.board.y0) / 0.55;
    const bl = layer(bw, bh, dpr);
    paintBoxwood(bl.g, bw, bh, 5);
    bl.g.strokeStyle = 'rgba(60,40,20,.55)'; bl.g.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const x = bw * (0.08 + (0.84 * i) / 8); bl.g.beginPath(); bl.g.moveTo(x, bh * 0.08); bl.g.lineTo(x, bh * 0.92); bl.g.stroke(); }
    for (let j = 0; j < 10; j++) { const y = bh * (0.08 + (0.84 * j) / 9); bl.g.beginPath(); bl.g.moveTo(bw * 0.08, y); bl.g.lineTo(bw * 0.92, y); bl.g.stroke(); }
    set.board = bl.c;
    // painted large enough for S7s's push (drawn at the board's own piece size)
    for (const p of [1, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16]) set.pieces.push(paintPiece(p, Math.max(7, bw * 0.035), dpr));
  });
  if (cut === 'full') {
    // the mirror kit's own sprites (the shared lazy chunk): the scholar, six ink creatures, the moon boss,
    // one sprite per paint step
    const k = (P ? 1.3 : 1.6) * (Math.min(w, h) / 390);
    const scholar: Painted[] = [], mons: Painted[] = [];
    let boss: Painted | null = null;
    for (const v of [0, 1, 2]) set.steps.push(() => { scholar.push(renderSpec(CHAR_SPECS.scholar, v, { k, seed: 3 + v, halo: 3, flash: false })); });
    const ids = ['blot', 'paperman', 'lantern', 'frog', 'jelly', 'tadpole'] as const;
    ids.forEach((id, i) => set.steps.push(() => { mons.push(renderSpec(MON_SPECS[id], 0, { k: k * 0.9, seed: 20 + i, halo: 3, flash: false })); }));
    set.steps.push(() => { boss = renderSpec(MOON_SPEC(4), 0, { k: k * 0.8, seed: 40, halo: 4, flash: false }); set.sprites = { scholar, mons, boss }; });
  }
  return set;
}

/** The tall sky strip the incense thread climbs (P 2.2 heights; L a 1.6 × 1.4 diagonal), at 0.5 × dpr. */
export function paintSky(lay: Lay): { canvas: HTMLCanvasElement; steps: (() => void)[] } {
  const { w, h, P } = lay;
  const W = P ? w : w * 1.6, H = P ? h * 2.2 : h * 1.4;
  const { c, g } = layer(W, H, lay.dpr * 0.5);
  const rng = makeRng(0x5c1);
  return {
    canvas: c,
    steps: [
      () => {
        const sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#1a2230'); sky.addColorStop(0.6, '#2c3747'); sky.addColorStop(1, '#6b737e');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        for (const y of [0.45, 0.75]) {
          const m = g.createLinearGradient(0, H * y - 40, 0, H * y + 40);
          m.addColorStop(0, 'rgba(200,204,210,0)'); m.addColorStop(0.5, 'rgba(200,204,210,.22)'); m.addColorStop(1, 'rgba(200,204,210,0)');
          g.fillStyle = m; g.fillRect(0, H * y - 40, W, 80);
        }
        const S: Stroke[] = [];
        for (let i = 0; i < 6; i++) {
          const y = H * (0.2 + rng() * 0.6), x = W * rng();
          S.push(st('dry', [[x, y, 4], [x + W * 0.2, y - 6, 3], [x + W * 0.35, y + 2, 1]], 0.2, 70 + i, { color: '#cfd4da', dryness: 0.8 }));
        }
        paint(g, S, lay.dpr * 0.5);
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------- S7

/** The backdrop's own sky at its right edge (sampled once from the night plate) as gradient stops, 0 → pondTop. */
function edgeSky(W: World): [number, string][] {
  const s = W.study!;
  if (s.edge) return s.edge;
  const stops: [number, string][] = [[0, '#a3a7a8'], [1, '#d3d0c5']];
  const n = W.night?.canvas;
  if (n && n.width > 4) {
    try {
      const top = W.pondTop / W.lay.h;
      const k = mk(1, 12);
      const kg = ctxOf(k);
      kg.drawImage(n, n.width - 3, 0, 2, Math.max(1, n.height * top), 0, 0, 1, 12);
      const d = kg.getImageData(0, 0, 1, 12).data;
      release(k);
      const out: [number, string][] = [];
      for (let i = 0; i < 12; i++) out.push([i / 11, `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`]);
      if (d[3] > 200) { s.edge = out; return out; }
    } catch { /* keep the fixed stops */ }
  }
  s.edge = stops;
  return stops;
}

/** The pan from the pond to the study (P right 60 % w, L 40 % w), with the willow over the seam. */
function drawPan(g: CanvasRenderingContext2D, W: World, t: number, t0: number, t1: number): { camX: number } {
  const { w, h, P } = W.lay;
  const s = W.study!;
  const u = ease.io(span(t, t0, t1));
  const camX = s.geo.panX * u;
  const dy = P ? -0.24 * h * (1 - u) : 0; // from S6's framing (gardenCam)
  g.save();
  g.translate(-camX, dy);
  drawNightGardenStill(g, W, 49.0);
  g.restore();
  const x0 = w - camX;
  if (s.ext && x0 < w) {
    // the study's sky: the backdrop's own right-edge column (and the same night veil), from just
    // inside the backdrop's edge; then the plate; then a mist band laid over the join
    const top = W.pondTop;
    const sky = g.createLinearGradient(0, 0, 0, top);
    for (const [o, c] of edgeSky(W)) sky.addColorStop(o, c);
    g.save();
    g.fillStyle = sky;
    g.fillRect(x0 - w * 0.02, 0, w * 1.04, top);
    g.fillStyle = `rgba(30,38,52,${0.12 + 0.22 * (1 - montageAt(49.0).lit)})`;
    g.fillRect(x0 - w * 0.02, 0, w * 1.04, top);
    g.restore();
    g.drawImage(s.ext, x0, 0, w, h);
    const mist = g.createLinearGradient(x0 - w * 0.08, 0, x0 + w * 0.12, 0);
    mist.addColorStop(0, 'rgba(206,203,194,0)');
    mist.addColorStop(0.3, 'rgba(206,203,194,.62)');
    mist.addColorStop(0.45, 'rgba(206,203,194,.8)');
    mist.addColorStop(0.6, 'rgba(206,203,194,.62)');
    mist.addColorStop(1, 'rgba(206,203,194,0)');
    g.fillStyle = mist;
    g.fillRect(x0 - w * 0.08, 0, w * 0.2, h);
  }
  // the willow: foreground parallax that catches up with the seam and then stays on it
  if (s.willow) {
    const x = x0 - w * 0.11 + 0.25 * w * (1 - u) * (1 - u) + 0.04 * w * (u - 0.5);
    if (x < w && x > -w * 0.3) g.drawImage(s.willow, x, -h * 0.05, w * 0.22, h * 1.1);
  }
  return { camX };
}

export function drawS7(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  const s = W.study;
  if (!s) { drawNightGardenStill(g, W, 49.0); return; }
  const geo = s.geo;
  if (t < 50.6) {
    // 49.2–50.1 pan; 50.1–50.6 push ×2.4 through the window, then ×3.2 into the mirror
    g.save();
    const { camX } = { camX: geo.panX * ease.io(span(t, 49.2, 50.1)) };
    const winX = w - camX + geo.win.x + geo.win.w / 2, winY = geo.win.y + geo.win.h / 2;
    const mx = w - camX + geo.mirrorPlate.x, my = geo.mirrorPlate.y;
    const p1 = ease.in(span(t, 50.1, 50.35)), p2 = ease.in(span(t, 50.35, 50.6));
    const sc = (1 + 1.4 * p1) * (1 + 2.2 * p2);
    const ox = winX + (mx - winX) * p2, oy = winY + (my - winY) * p2;
    g.translate(w / 2 * (p1 * 0.6 + p2 * 0.4), h * 0.45 * (p1 * 0.6 + p2 * 0.4));
    g.translate(-ox * (p1 * 0.6 + p2 * 0.4), -oy * (p1 * 0.6 + p2 * 0.4));
    g.translate(ox, oy); g.scale(sc, sc); g.translate(-ox, -oy);
    drawPan(g, W, t, 49.2, 50.1);
    g.restore();
    const a = span(t, 50.42, 50.6);
    if (a > 0) { g.save(); g.globalAlpha = a; drawArena(g, W, t, a); g.restore(); }
    return;
  }
  drawArena(g, W, t, 1);
}

/** Inside the mirror: Moon Lake, the scholar dodging, six ink creatures closing in, splats, the fake moon glaring. */
function drawArena(g: CanvasRenderingContext2D, W: World, t: number, open: number): void {
  const { w, h } = W.lay;
  const s = W.study!;
  const A = s.geo.arena;
  const R = A.R * (0.6 + 0.4 * open);
  // the dim room around the mirror
  g.fillStyle = '#3e372d';
  g.fillRect(0, 0, w, h);
  // the bronze rim: ochre wash, malachite patina, an inner line, a knob
  g.fillStyle = '#8a6a3a';
  g.beginPath(); g.arc(A.x, A.y, R * 1.1, 0, Math.PI * 2); g.fill();
  const rng = makeRng(0x6a1);
  g.fillStyle = 'rgba(95,138,110,.55)';
  for (let i = 0; i < 26; i++) { const a = rng() * Math.PI * 2; g.beginPath(); g.arc(A.x + Math.cos(a) * R * 1.05, A.y + Math.sin(a) * R * 1.05, 1.5 + rng() * 2.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#6d5230'; g.beginPath(); g.arc(A.x, A.y - R * 1.1, R * 0.06, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(A.x, A.y, R, 0, Math.PI * 2); g.clip();
  const water = g.createLinearGradient(0, A.y - R, 0, A.y + R);
  water.addColorStop(0, '#c9d3dc'); water.addColorStop(1, '#8fa0b2');
  g.fillStyle = water; g.fillRect(A.x - R, A.y - R, 2 * R, 2 * R);
  // jade lotus pads
  for (let i = 0; i < 9; i++) {
    const x = A.x + (rng() - 0.5) * 1.8 * R, y = A.y + (rng() - 0.3) * 1.5 * R, r = R * (0.06 + rng() * 0.06);
    g.fillStyle = 'rgba(95,138,110,.6)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.45, 0, 0.3, Math.PI * 2 - 0.1); g.lineTo(x, y); g.fill();
  }
  const f = Math.max(0, t - 50.6);
  // the fake moon (水中月) glares from the upper third and glides forward
  const bossY = A.y - R * 0.55 + R * 0.12 * ease.s(span(t, 50.6, 55.7));
  const sp = s.sprites;
  if (sp && W.flags.mirrorSprites && sp.boss) blit(g, sp.boss, A.x, bossY, 1 + 0.1 * ease.s(span(t, 51.0, 51.4)));
  else moonWithEyes(g, A.x, bossY, R * 0.2, t);
  // six ink creatures close in on the scholar, who dodges on a loop
  const sx = A.x + Math.sin(f * 1.7) * R * 0.3, sy = A.y + R * 0.35 + Math.cos(f * 2.3) * R * 0.1;
  const splats = [51.5, 52.5, 53.5, 54.5];
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.4;
    const dist = R * (0.85 - 0.35 * ease.s(span(t, 50.6, 55.5)));
    const x = sx + Math.cos(a0 + f * 0.3) * dist, y = sy + Math.sin(a0 + f * 0.3) * dist * 0.7;
    const hit = i < 4 ? splats[i] : Infinity;
    if (t >= hit) {
      // an ink splat where it was
      const u = span(t, hit, hit + 0.25);
      g.fillStyle = `rgba(20,18,16,${0.75 * (1 - 0.4 * span(t, hit + 0.4, hit + 1.4))})`;
      const r2 = makeRng(90 + i);
      for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(x + (r2() - 0.5) * 30 * u, y + (r2() - 0.5) * 20 * u, (3 + r2() * 7) * u, 0, Math.PI * 2); g.fill(); }
      continue;
    }
    if (sp && W.flags.mirrorSprites) blit(g, sp.mons[i], x, y, 1);
    else { g.fillStyle = 'rgba(20,18,16,.85)'; g.beginPath(); g.arc(x, y, R * 0.06, 0, Math.PI * 2); g.fill(); }
    // the brush-stroke shot, just before the splat
    if (t > hit - 0.18 && t < hit) {
      g.strokeStyle = 'rgba(20,18,16,.8)'; g.lineWidth = 3; g.lineCap = 'round';
      const u = span(t, hit - 0.18, hit);
      g.beginPath(); g.moveTo(sx, sy - 10); g.lineTo(sx + (x - sx) * u, sy - 10 + (y - sy + 10) * u); g.stroke();
    }
  }
  if (sp && W.flags.mirrorSprites) blit(g, sp.scholar[Math.floor(f * 8) % 3], sx, sy, 1);
  else drawFigure(g, sx, sy + 12, 26, 'stand');
  g.restore();
  g.strokeStyle = 'rgba(40,28,14,.7)'; g.lineWidth = 2;
  g.beginPath(); g.arc(A.x, A.y, R, 0, Math.PI * 2); g.stroke();
}

function blit(g: CanvasRenderingContext2D, p: Painted, x: number, y: number, s: number): void {
  // renderSpec paints at k css px per unit: the image is already at css size
  const iw = p.img.width * s, ih = p.img.height * s;
  g.drawImage(p.img, x - iw * p.ax, y - ih * p.ay, iw, ih);
}

/** The PV's own fake moon: a lead-white disc with two ink eyes and ripple rings (the fallback). */
function moonWithEyes(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  g.fillStyle = 'rgba(248,245,237,.95)';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,58,78,.35)'; g.lineWidth = 1;
  for (let i = 1; i <= 2; i++) { g.beginPath(); g.ellipse(x, y + r * 1.2, r * (1 + i * 0.4), r * 0.2 * i, 0, 0, Math.PI * 2); g.stroke(); }
  const blink = Math.abs(Math.sin(t * 1.3)) > 0.97 ? 0.2 : 1;
  g.fillStyle = C.ink;
  for (const dx of [-0.35, 0.35]) {
    g.beginPath(); g.ellipse(x + dx * r, y - r * 0.08, r * 0.1, r * 0.14 * blink, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + dx * r - r * 0.16, y - r * 0.32 + (dx > 0 ? -1 : 1) * r * 0.05); g.lineTo(x + dx * r + r * 0.16, y - r * 0.32 + (dx > 0 ? 1 : -1) * r * 0.05); g.stroke();
  }
}

// ---------------------------------------------------------------------------------------------- S7c

/** The room (interior plate at scale s about the mirror); the censer's smoke and the board. */
function drawRoom(g: CanvasRenderingContext2D, W: World, t: number, flick = 1): void {
  const { w, h } = W.lay;
  const s = W.study!;
  const R = s.geo.room;
  if (s.int) g.drawImage(s.int, 0, 0, w, h);
  // the mirror still flickering faintly
  const m = R.mirror;
  g.fillStyle = `rgba(248,245,237,${0.8 + 0.15 * Math.sin(t * 9) * flick})`;
  g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
  // the board on its stool (squashed .55, slightly skewed) with 11 pieces; the black 炮 slides two points at 57.5
  const b = R.board;
  if (s.board) {
    // the stool top under the board's skewed lower edge
    const sk = 0.12 * ((b.y1 - b.y0) / 0.55);
    g.fillStyle = '#3b2f22';
    g.fillRect(b.x0 - sk - 2, b.y1 - 1, b.x1 - b.x0 + 4, 5);
    g.save();
    g.translate(b.x0, b.y0);
    g.transform(1, 0, -0.12, 0.55, 0, 0);
    const bw = b.x1 - b.x0, bh = (b.y1 - b.y0) / 0.55;
    g.drawImage(s.board, 0, 0, bw, bh);
    pieces(g, s, t, bw, bh, 57.5);
    g.restore();
  }
  // the reader bent over the book (does not look up)
  drawFigure(g, R.reader.x, R.reader.y, R.reader.s, 'read');
  // the censer on the sill, its lit stick with a vermilion tip, and its smoke
  const cs = R.censer;
  if (s.censer) g.drawImage(s.censer, cs.x - cs.s / 2, cs.y - cs.s, s.censer.width / W.lay.dpr, s.censer.height / W.lay.dpr);
  const tipX = cs.x, tipY = cs.y - cs.s * 1.05;
  g.strokeStyle = '#6b5a45'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(tipX, cs.y - cs.s * 0.55); g.lineTo(tipX, tipY); g.stroke();
  g.fillStyle = C.cinnabar; g.beginPath(); g.arc(tipX, tipY, 1.8, 0, Math.PI * 2); g.fill();
  smoke(g, tipX, tipY, h * 0.45, t, 0.45);
}

/** The points of a smoke thread rising from (x, y), `len` long, drifting to `toX` at the top (seekable). */
function smokePts(x: number, y: number, len: number, t: number, reveal: number, curl: { x: number; y: number } | null, toX = x): [number, number][] {
  const pts: [number, number][] = [[x, y]];
  const n = 48;
  for (let i = 1; i <= n * reveal; i++) {
    const u = i / n;
    const sway = Math.min(1, u * 3) * (1 - 0.6 * u);
    let px = x + (toX - x) * u * u + Math.sin(u * 7 + t * 1.3) * 10 * sway + Math.sin(u * 3 - t * 0.7) * 16 * u * sway;
    let py = y - len * u;
    if (curl && u > 0.85) {
      // the curl: the last 15 % hooks round under the nose
      const k = (u - 0.85) / 0.15;
      const a = -Math.PI / 2 + k * Math.PI * 1.3;
      const cx = curl.x - 6, cy = curl.y + 4;
      const tx = cx + Math.cos(a) * 9 * (1 - 0.3 * k), ty = cy - Math.sin(a) * 7 * (1 - 0.3 * k);
      px += (tx - px) * Math.min(1, k * 1.6);
      py += (ty - py) * Math.min(1, k * 1.6);
    }
    pts.push([px, py]);
  }
  return pts;
}

function strokePts(g: CanvasRenderingContext2D, pts: [number, number][], from: number, to: number, color: string, lw = 1.4): void {
  to = Math.min(to, pts.length);
  if (to - from < 2) return;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[from][0], pts[from][1]);
  for (let i = from + 1; i < to; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
  g.restore();
}

/** A thread of smoke rising from (x, y), `len` long: a 1.4 px line at 30 % ink, swaying (seekable). */
function smoke(g: CanvasRenderingContext2D, x: number, y: number, len: number, t: number, a: number, reveal = 1, curl: { x: number; y: number } | null = null): void {
  strokePts(g, smokePts(x, y, len, t, reveal, curl), 0, 1e9, `rgba(210,212,214,${a})`);
}

/** The room camera for S7c: ×3.2 on the mirror → ×1.25 on the room → a slow push to ×1.4 on the censer; the
 *  look-at point is clamped so the plate always covers the frame. */
function roomCam(W: World, t: number): { sc: number; ox: number; oy: number } {
  const { w, h } = W.lay;
  const R = W.study!.geo.room;
  const pull = ease.out(span(t, 55.7, 56.1));
  const sc = Math.max(1.25, 3.2 + (1.25 - 3.2) * pull + 0.15 * ease.io(span(t, 56.1, 57.2)));
  const v = ease.io(span(t, 55.9, 57.2));
  let ox = R.mirror.x + (R.censer.x - R.mirror.x) * v;
  let oy = R.mirror.y + (R.censer.y - h * 0.12 - R.mirror.y) * v;
  const hx = w / (2 * sc), hy = h / (2 * sc);
  ox = Math.min(w - hx, Math.max(hx, ox));
  oy = Math.min(h - hy, Math.max(hy, oy));
  return { sc, ox, oy };
}

export function drawS7c(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  const s = W.study;
  if (!s) { g.fillStyle = C.sky; g.fillRect(0, 0, w, h); return; }
  if (t < 58.2) {
    const { sc, ox, oy } = roomCam(W, t);
    g.save();
    g.translate(w / 2, h / 2); g.scale(sc, sc); g.translate(-ox, -oy);
    drawRoom(g, W, t);
    g.restore();
    // 57.9–58.2: dissolve to the hut from outside, the thread rising from its window
    const d = span(t, 57.9, 58.2);
    if (d > 0) { g.save(); g.globalAlpha = d; drawOutside(g, W, t, 0); g.restore(); }
    return;
  }
  drawOutside(g, W, t, ease.io(span(t, 58.2, 59.6)));
}

/** Outside: the hut, the thread slipping out of the window and climbing the tall sky to the moon. */
function drawOutside(g: CanvasRenderingContext2D, W: World, t: number, climb: number): void {
  const { w, h, P } = W.lay;
  const s = W.study!;
  const geo = s.geo;
  const sky = W.sky;
  const SH = P ? h * 2.2 : h * 1.4, SW = P ? w : w * 1.6;
  // the camera: up the strip (P 1.2 heights; L diagonally up-right)
  const cy = (SH - h) * (1 - climb), cx = P ? 0 : (SW - w) * climb;
  g.save();
  g.translate(-cx, -cy);
  if (sky) g.drawImage(sky, 0, 0, SW, SH);
  else { g.fillStyle = C.sky; g.fillRect(0, 0, SW, SH); }
  // the strip's foot: a full-width night ground under the plate (L: the whole diagonal's width)
  const foot = SH - h;
  // (the plate's own ground gradient, so its edge never shows)
  const gr = g.createLinearGradient(0, foot + h * 0.58, 0, SH);
  gr.addColorStop(0, 'rgba(200,196,186,0)'); gr.addColorStop(0.08, '#cfcabe'); gr.addColorStop(1, '#e2dccd');
  g.fillStyle = gr; g.fillRect(0, foot + h * 0.58, SW, h * 0.42);
  // the hut where the plate has it (the exterior plate at x 0), under a night veil to match the strip
  if (s.ext) {
    g.drawImage(s.ext, 0, foot, w, h);
    g.fillStyle = 'rgba(30,38,52,.3)';
    g.fillRect(0, foot + h * 0.5, SW, h * 0.5);
  }
  g.restore();
  // the thread: from the window, drifting over to the moon; it curls under the rabbit's nose
  const winX = geo.win.x + geo.win.w / 2 - cx, winY = foot + geo.win.y + geo.win.h * 0.3 - cy;
  const m = geo.moon;
  const mx = m.x, my = m.y - (1 - climb) * (SH - h);
  const reveal = 0.3 + 0.7 * ease.out(span(t, 57.9, 59.6));
  // the rabbit on the disc (moonRabbitPath at (mx − .12r, my + .56r), size 1.02 r): its nose at ≈ (82, 44)
  const k = (m.r * 1.02) / 100;
  const nose = { x: mx - m.r * 0.12 + 32 * k, y: my + m.r * 0.56 - 56 * k };
  const top = nose.y + m.r * 0.12;
  const pts = smokePts(winX, winY, winY - top, t, reveal, t > 59.2 ? { x: nose.x, y: nose.y + m.r * 0.1 } : null, nose.x - m.r * 0.05);
  const cut = Math.floor(pts.length * 0.85);
  strokePts(g, pts, 0, cut + 1, 'rgba(210,212,214,.55)');
  let sn = 0;
  if (my + m.r > 0) {
    // the twitch (59.8) and the sneeze (60.1): the head winds back, then jerks forward; ears flip; dust off the nose
    sn = t < 60.1 ? -ease.s(span(t, 59.95, 60.1)) : 1 - span(t, 60.1, 60.35);
    drawMoon(g, mx, my, m.r, 0.5, { maria: true, halo: 1, rabbit: { pestle: 0.8, flick: Math.max(0, 1 - Math.abs(t - 59.8) / 0.1), sneeze: sn } });
  }
  // the thread's last 15 % over the disc (a cool grey that reads on lead-white), so the curl reaches the nose
  strokePts(g, pts, cut, pts.length, 'rgba(118,128,146,.6)', 1.5);
  if (my + m.r > 0) sneezeDust(g, nose.x, nose.y, m.r, t - 60.1);
}

/** The sneeze: 12 lead-white dots burst forward off the rabbit's nose and fade over 0.45 s. */
function sneezeDust(g: CanvasRenderingContext2D, x: number, y: number, r: number, since: number): void {
  if (since < 0 || since > 0.45) return;
  const u = since / 0.45;
  const rng = makeRng(0x5e2e);
  g.save();
  for (let i = 0; i < 12; i++) {
    const a = -0.9 + 1.5 * rng();
    const d = r * (0.04 + u * (0.25 + 0.3 * rng()));
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    g.fillStyle = `rgba(150,160,176,${(1 - u) * 0.85})`;
    g.beginPath(); g.arc(px, py, Math.max(1, r * 0.025) * (1 + u * 0.5), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------- S7s (short)

/** One plate: the pan to the lit window, then a push until the window fills ~80 % of the frame, held; through
 *  the lattice (its own composition at a readable size) the reader, the mirror's fight, the censer, the 炮. */
export function drawS7s(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  const s = W.study;
  if (!s) { drawNightGardenStill(g, W, 49.0); return; }
  const geo = s.geo;
  const raw = span(t, 49.2, 49.9);
  const camX = geo.panX * ease.io(raw);
  const full = Math.min((0.8 * w) / geo.win.w, (0.8 * h) / geo.win.h);
  const k = ease.io(span(t, 49.55, 50.3));
  const push = 1 + (full - 1) * k;
  const winX = w - camX + geo.win.x + geo.win.w / 2, winY = geo.win.y + geo.win.h / 2;
  g.save();
  g.translate((w / 2 - winX) * k, (h * 0.44 - winY) * k);
  g.translate(winX, winY); g.scale(push, push); g.translate(-winX, -winY);
  drawPan(g, W, 49.2 + 0.9 * raw, 49.2, 50.1);
  const wx = w - camX + geo.win.x, wy = geo.win.y;
  windowRoom(g, W, t, wx, wy, geo.win.w, geo.win.h);
  // the lattice over it
  g.strokeStyle = 'rgba(58,44,30,.8)'; g.lineWidth = 1.6 / push;
  for (let i = 0; i <= 5; i++) { const x = wx + (geo.win.w * i) / 5; g.beginPath(); g.moveTo(x, wy); g.lineTo(x, wy + geo.win.h); g.stroke(); }
  for (let j = 0; j <= 4; j++) { const y = wy + (geo.win.h * j) / 4; g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + geo.win.w, y); g.stroke(); }
  g.restore();
}

/** The room as seen through the window (window-local, one uniform scale): the mirror with its fake moon and the
 *  two splats (49.9, 50.4), the reader bent over his book, the board on its stool (炮 at 51.5), the censer on the sill. */
function windowRoom(g: CanvasRenderingContext2D, W: World, t: number, x0: number, y0: number, ww: number, wh: number): void {
  const s = W.study!;
  g.save();
  g.beginPath(); g.rect(x0, y0, ww, wh); g.clip();
  const X = (u: number) => x0 + u * ww, Y = (v: number) => y0 + v * wh;
  const wall = g.createLinearGradient(x0, y0, x0 + ww, y0 + wh);
  wall.addColorStop(0, '#5b5244'); wall.addColorStop(0.6, '#8a7c64'); wall.addColorStop(1, '#6a5e4c');
  g.fillStyle = wall; g.fillRect(x0, y0, ww, wh);
  const lamp = g.createRadialGradient(X(0.5), Y(0.7), 0, X(0.5), Y(0.7), ww * 0.7);
  lamp.addColorStop(0, 'rgba(217,166,46,.32)'); lamp.addColorStop(1, 'rgba(217,166,46,0)');
  g.fillStyle = lamp; g.fillRect(x0, y0, ww, wh);
  g.fillStyle = 'rgba(40,34,26,.3)'; g.fillRect(x0, Y(0.72), ww, wh * 0.28);
  // the mirror (r .17 of the window: ≥ 12 % of the frame's width once pushed in)
  const mx = X(0.27), my = Y(0.3), mr = ww * 0.17;
  g.fillStyle = '#8a6a3a'; g.beginPath(); g.arc(mx, my, mr * 1.14, 0, Math.PI * 2); g.fill();
  const rng = makeRng(0x7a3);
  g.fillStyle = 'rgba(95,138,110,.55)';
  for (let i = 0; i < 14; i++) { const a = rng() * Math.PI * 2; g.beginPath(); g.arc(mx + Math.cos(a) * mr * 1.07, my + Math.sin(a) * mr * 1.07, mr * 0.03, 0, Math.PI * 2); g.fill(); }
  g.save();
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.clip();
  const water = g.createLinearGradient(0, my - mr, 0, my + mr);
  water.addColorStop(0, '#dfe5ea'); water.addColorStop(1, '#a9b6c4');
  g.fillStyle = water; g.fillRect(mx - mr, my - mr, 2 * mr, 2 * mr);
  moonWithEyes(g, mx, my - mr * 0.22, mr * 0.46, t);
  for (const [i, at] of [[0, 49.9], [1, 50.4]] as [number, number][]) {
    const a = span(t, at, at + 0.2);
    if (a <= 0) continue;
    const r2 = makeRng(300 + i);
    const sx = mx + (i ? 0.42 : -0.4) * mr, sy = my + 0.55 * mr;
    g.fillStyle = `rgba(20,18,16,${0.8 * (1 - 0.3 * span(t, at + 0.6, at + 2.0))})`;
    for (let q = 0; q < 6; q++) { g.beginPath(); g.arc(sx + (r2() - 0.5) * mr * 0.5 * a, sy + (r2() - 0.5) * mr * 0.3 * a, mr * (0.05 + r2() * 0.08) * a, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  g.strokeStyle = 'rgba(40,28,14,.7)'; g.lineWidth = Math.max(0.3, mr * 0.04);
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.stroke();
  // the board on its stool, at the back right (squashed .55, skewed), 11 pieces; the 炮 slides at 51.5
  if (s.board) {
    const bx0 = X(0.58), bx1 = X(0.96), by0 = Y(0.44), by1 = Y(0.6);
    const bw = bx1 - bx0, bh = (by1 - by0) / 0.55;
    const sk = 0.12 * bh;
    g.fillStyle = '#3b2f22';
    g.fillRect(bx0 - sk + bw * 0.1, by1, ww * 0.012, wh * 0.14);
    g.fillRect(bx1 - sk - bw * 0.12, by1, ww * 0.012, wh * 0.14);
    g.fillRect(bx0 - sk - ww * 0.005, by1, bw + ww * 0.01, wh * 0.018);
    g.save();
    g.translate(bx0, by0);
    g.transform(1, 0, -0.12, 0.55, 0, 0);
    g.drawImage(s.board, 0, 0, bw, bh);
    pieces(g, s, t, bw, bh, 51.5);
    g.restore();
  }
  // the reader, bent over his book (does not look up)
  g.fillStyle = '#3b2f22'; g.fillRect(X(0.24), Y(0.8), ww * 0.3, wh * 0.025);
  g.fillStyle = '#efe4cc';
  g.beginPath(); g.moveTo(X(0.3), Y(0.8)); g.lineTo(X(0.36), Y(0.785)); g.lineTo(X(0.42), Y(0.8)); g.closePath(); g.fill();
  drawFigure(g, X(0.2), Y(0.9), wh * 0.4, 'read');
  // the sill and the censer on it, its lit stick and its smoke
  g.fillStyle = '#4a3c2c'; g.fillRect(x0, Y(0.93), ww, wh * 0.07);
  const cx = X(0.84), cyy = Y(0.94), cs = ww * 0.16;
  if (s.censer) {
    const cw = s.censer.width / W.lay.dpr, ch = s.censer.height / W.lay.dpr;
    const f = cs / Math.max(cw, ch);
    g.drawImage(s.censer, cx - (cw * f) / 2, cyy - ch * f, cw * f, ch * f);
  }
  const tipY = cyy - cs * 1.05;
  g.strokeStyle = '#6b5a45'; g.lineWidth = Math.max(0.3, ww * 0.006);
  g.beginPath(); g.moveTo(cx, cyy - cs * 0.55); g.lineTo(cx, tipY); g.stroke();
  g.fillStyle = C.cinnabar; g.beginPath(); g.arc(cx, tipY, ww * 0.008, 0, Math.PI * 2); g.fill();
  const pts = smokePts(cx, tipY, wh * 0.75, t, 1, null);
  for (const p of pts) { p[0] = cx + (p[0] - cx) * (ww / 100); }
  strokePts(g, pts, 0, pts.length, 'rgba(226,226,224,.6)', Math.max(0.3, ww * 0.006));
  g.restore();
}

/** The 11 pieces on a board drawn at (0, 0, bw, bh); the black 炮 (i 3) slides two points at `at`. */
function pieces(g: CanvasRenderingContext2D, s: StudySet, t: number, bw: number, bh: number, at: number): void {
  const pts: [number, number][] = [[1, 0], [4, 0], [7, 0], [2, 2], [6, 3], [0, 3], [4, 3], [8, 3], [3, 6], [5, 9], [7, 7]];
  const pr = Math.max(2, bw * 0.055);
  s.pieces.forEach((pc, i) => {
    let [px, py] = pts[i];
    if (i === 3) px += 2 * ease.io(span(t, at, at + 0.35)); // nobody sits across the table
    const x = bw * (0.08 + (0.84 * px) / 8), y = bh * (0.08 + (0.84 * py) / 9);
    g.drawImage(pc, x - pr, y - pr, pr * 2, pr * 2);
  });
}

export { ctxOf };
