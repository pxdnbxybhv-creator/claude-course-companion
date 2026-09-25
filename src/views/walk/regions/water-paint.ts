// Painted textures for the water regions: the façade atlas of the water town (whitewash, shop
// boards, lattice windows, doors, signboards in brush calligraphy) with a matching night-glow
// atlas, and brush-painted flats (willow, bamboo) rasterised by the ink engine.
import type { Drawing, Stroke, StrokeKind } from '../../../ink/types';
import { PIGMENTS } from '../../../ink/types';
import { makeRng, type Rng } from '../../../core/rng';
import { BRUSH_FONT, canvas } from './water-kit';

export const ATLAS = 512;
const C = 128;

/** uv rect [u0, v0, u1, v1] of atlas cell i (4×4 grid), or of a sub-rect of it (fractions, y down). */
export function cellUV(i: number, sub: [number, number, number, number] = [0, 0, 1, 1]): [number, number, number, number] {
  const col = i % 4, row = Math.floor(i / 4);
  const inset = 1.5 / ATLAS;
  const x0 = col / 4 + (sub[0] * 0.25), x1 = col / 4 + (sub[2] * 0.25);
  const yTop = row / 4 + sub[1] * 0.25, yBot = row / 4 + sub[3] * 0.25;
  return [x0 + inset, 1 - yBot + inset, x1 - inset, 1 - yTop - inset];
}

export const CELL = {
  wall: 0, wallWin: 1, shop: 2, door: 3, lattice: 4, upperWin: 5, tea: 6, wood: 7,
  signs: 8, // 8..13: two vertical signboards per cell (left / right half)
  strips: 14, // four horizontal plaques, 128×32 each
  banners: 15, // four vertical banners, 32×128 each
} as const;

/** Vertical signboard k (0..11): uv sub-rect. */
export function signUV(k: number): [number, number, number, number] {
  const cell = CELL.signs + Math.floor(k / 2);
  return cellUV(cell, k % 2 ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1]);
}
export const stripUV = (k: number) => cellUV(CELL.strips, [0, k / 4, 1, (k + 1) / 4]);
export const bannerUV = (k: number) => cellUV(CELL.banners, [k / 4, 0, (k + 1) / 4, 1]);

export const SIGNS = ['茶楼', '酒家', '米行', '布庄', '药铺', '糖人', '客栈', '面馆', '当铺', '绸缎', '书坊', '豆腐'];
export const STRIPS = ['小桥流水', '烟雨人家', '藕香榭', '枕河'];
export const BANNERS = ['茶', '酒', '面', '糖'];
export const ATLAS_CHARS = SIGNS.join('') + STRIPS.join('') + BANNERS.join('');

const WHITE = '#f0ebe0';

function wash(g: CanvasRenderingContext2D, r: Rng, x: number, y: number, w: number, h: number, damp = true) {
  g.fillStyle = WHITE;
  g.fillRect(x, y, w, h);
  // rain stains running down from the top
  for (let i = 0; i < 3; i++) {
    const sx = x + r() * w, sw = r.range(6, 18), len = r.range(20, h * 0.6);
    const grd = g.createLinearGradient(0, y, 0, y + len);
    grd.addColorStop(0, `rgba(96,90,78,${r.range(0.08, 0.16)})`);
    grd.addColorStop(1, 'rgba(96,90,78,0)');
    g.fillStyle = grd;
    g.fillRect(sx - sw / 2, y, sw, len);
  }
  if (damp) {
    const d = g.createLinearGradient(0, y + h * 0.72, 0, y + h);
    d.addColorStop(0, 'rgba(92,86,70,0)');
    d.addColorStop(1, 'rgba(92,86,70,0.34)');
    g.fillStyle = d;
    g.fillRect(x, y + h * 0.72, w, h * 0.28);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(52,58,44,${r.range(0.15, 0.45)})`;
      g.beginPath();
      g.arc(x + r() * w, y + h * r.range(0.88, 0.99), r.range(0.6, 1.8), 0, Math.PI * 2);
      g.fill();
    }
  }
}

function lattice(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame = '#4a3428', paper = '#e9dfc6') {
  g.fillStyle = frame;
  g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = paper;
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(40,30,24,0.85)';
  g.lineWidth = 1.3;
  const n = Math.max(2, Math.round(w / 9)), m = Math.max(2, Math.round(h / 9));
  g.beginPath();
  for (let i = 1; i < n; i++) { g.moveTo(x + (w * i) / n, y); g.lineTo(x + (w * i) / n, y + h); }
  for (let j = 1; j < m; j++) { g.moveTo(x, y + (h * j) / m); g.lineTo(x + w, y + (h * j) / m); }
  g.stroke();
  // a thin inner frame (the 回 pattern of the sash)
  g.strokeStyle = frame;
  g.lineWidth = 2;
  g.strokeRect(x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.64);
}

function boards(g: CanvasRenderingContext2D, r: Rng, x: number, y: number, w: number, h: number, base = '#6c4a36', vertical = true) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  const n = vertical ? Math.round(w / 11) : Math.round(h / 11);
  for (let i = 0; i < n; i++) {
    const k = r.range(-14, 14);
    g.fillStyle = `rgba(${k > 0 ? '255,240,220' : '20,12,8'},${Math.abs(k) / 120})`;
    if (vertical) g.fillRect(x + (w * i) / n, y, w / n, h);
    else g.fillRect(x, y + (h * i) / n, w, h / n);
    g.fillStyle = 'rgba(28,18,12,0.55)';
    if (vertical) g.fillRect(x + (w * i) / n, y, 1.2, h);
    else g.fillRect(x, y + (h * i) / n, w, 1.2);
  }
  // weathering: lighter, greyer toward the bottom
  const grd = g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, 'rgba(30,20,14,0.15)');
  grd.addColorStop(1, 'rgba(210,200,180,0.18)');
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
}

function glyphs(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, color: string, vertical: boolean, sx = 1, sy = 1) {
  g.save();
  g.fillStyle = color;
  g.font = `${size}px ${BRUSH_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text];
  chars.forEach((ch, i) => {
    const off = (i - (chars.length - 1) / 2) * size * 1.02;
    g.save();
    g.translate(vertical ? cx : cx + off * sx, vertical ? cy + off * sy : cy);
    g.scale(sx, sy);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.restore();
}

/** The façade atlas of the water town and its night-glow twin (lit windows and openings). */
export function paintFacades(seed = 5151): { day: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const c = canvas(ATLAS, ATLAS);
  const g = c.getContext('2d')!;
  const gc = canvas(ATLAS / 2, ATLAS / 2);
  const gg = gc.getContext('2d')!;
  gg.fillStyle = '#000';
  gg.fillRect(0, 0, gc.width, gc.height);
  const glow = (x: number, y: number, w: number, h: number, a = 1) => {
    gg.fillStyle = `rgba(255,196,120,${a})`;
    gg.fillRect(x / 2, y / 2, w / 2, h / 2);
  };
  const r = makeRng(seed);
  const at = (i: number) => [(i % 4) * C, Math.floor(i / 4) * C] as const;

  // 0 · plain whitewash
  { const [x, y] = at(CELL.wall); wash(g, r, x, y, C, C); }
  // 1 · whitewash with a small lattice window high up
  { const [x, y] = at(CELL.wallWin); wash(g, r, x, y, C, C); lattice(g, x + 44, y + 30, 40, 34, '#5d5a54', '#d9d0bb'); glow(x + 44, y + 30, 40, 34, 0.8); }
  // 2 · shop front: boards with an open counter in the middle
  {
    const [x, y] = at(CELL.shop);
    boards(g, r, x, y, C, C);
    g.fillStyle = '#2a221d';
    g.fillRect(x + 30, y + 22, 68, 70);
    glow(x + 30, y + 22, 68, 70, 0.9);
    g.fillStyle = 'rgba(160,120,80,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(x + 36 + i * 16, y + 38, 10, 10); // wares on shelves
    boards(g, r, x + 26, y + 88, 76, 40, '#5a3d2c', false); // counter
    g.fillStyle = '#3a2a20';
    g.fillRect(x, y, C, 10); // lintel
  }
  // 3 · house door: stone frame, black double doors, brass knockers, a little tiled hood
  {
    const [x, y] = at(CELL.door);
    wash(g, r, x, y, C, C);
    g.fillStyle = '#a19b8f';
    g.fillRect(x + 34, y + 30, 60, 98);
    g.fillStyle = '#2d2520';
    g.fillRect(x + 42, y + 38, 44, 90);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x + 63.5, y + 38, 1.4, 90);
    g.fillStyle = '#b89a5c';
    g.beginPath(); g.arc(x + 58, y + 80, 2.4, 0, 7); g.arc(x + 70, y + 80, 2.4, 0, 7); g.fill();
    g.fillStyle = '#403e3b';
    g.fillRect(x + 26, y + 20, 76, 9);
    g.fillStyle = '#5a5855';
    g.fillRect(x + 30, y + 16, 68, 5);
    glow(x + 64, y + 38, 2, 90, 0.5);
  }
  // 4 · upper floor: wooden frame with lattice windows over a panel
  {
    const [x, y] = at(CELL.lattice);
    boards(g, r, x, y, C, C, '#71503a', false);
    for (let i = 0; i < 3; i++) { lattice(g, x + 8 + i * 40, y + 14, 32, 62); glow(x + 8 + i * 40, y + 14, 32, 62, 0.85); }
    g.fillStyle = '#4a3428';
    g.fillRect(x, y + 84, C, 5);
  }
  // 5 · upper whitewash with a shuttered window
  {
    const [x, y] = at(CELL.upperWin);
    wash(g, r, x, y, C, C, false);
    lattice(g, x + 40, y + 30, 48, 52);
    glow(x + 40, y + 30, 48, 52, 0.85);
    boards(g, r, x + 22, y + 27, 15, 58, '#5a3d2c');
    g.fillStyle = '#3c3a37';
    g.fillRect(x + 32, y + 20, 64, 6);
  }
  // 6 · teahouse front: open, a bamboo blind rolled half down, dark room with a lamp
  {
    const [x, y] = at(CELL.tea);
    boards(g, r, x, y, C, C, '#6b4833');
    g.fillStyle = '#2b221c';
    g.fillRect(x + 10, y + 14, 108, 114);
    glow(x + 10, y + 40, 108, 88, 1);
    g.fillStyle = '#b89565';
    g.fillRect(x + 10, y + 14, 108, 40);
    g.strokeStyle = 'rgba(70,50,30,0.6)';
    g.lineWidth = 1;
    for (let k = 0; k < 13; k++) { g.beginPath(); g.moveTo(x + 10, y + 16 + k * 3); g.lineTo(x + 118, y + 16 + k * 3); g.stroke(); }
    g.fillStyle = '#6b4833';
    g.fillRect(x + 10, y + 52, 108, 4);
    // a table and a figure's silhouette in the room
    g.fillStyle = 'rgba(90,70,52,0.9)';
    g.fillRect(x + 36, y + 98, 56, 6);
    g.fillRect(x + 40, y + 104, 4, 24);
    g.fillRect(x + 84, y + 104, 4, 24);
    g.fillStyle = 'rgba(120,100,80,0.8)';
    g.beginPath(); g.arc(x + 58, y + 91, 5, 0, 7); g.fill();
  }
  // 7 · plain wooden boards
  { const [x, y] = at(CELL.wood); boards(g, r, x, y, C, C, '#6f4d38', false); }
  // 8..13 · signboards: black lacquer with gilt characters, or natural wood with ink
  for (let k = 0; k < SIGNS.length; k++) {
    const [cx, cy] = at(CELL.signs + Math.floor(k / 2));
    const x = cx + (k % 2) * 64, y = cy;
    const lacquer = k % 3 !== 2;
    g.fillStyle = lacquer ? '#2a2521' : '#9a7a52';
    g.fillRect(x + 2, y + 2, 60, 124);
    g.strokeStyle = lacquer ? '#8c6f45' : '#4d3524';
    g.lineWidth = 3;
    g.strokeRect(x + 6, y + 6, 52, 116);
    glyphs(g, SIGNS[k], x + 32, y + 64, 46, lacquer ? '#e2cd98' : '#1f1a16', true);
  }
  // 14 · horizontal plaques
  STRIPS.forEach((s, k) => {
    const [x, y0] = at(CELL.strips);
    const y = y0 + k * 32;
    g.fillStyle = k === 2 ? '#3b2a20' : '#2a2521';
    g.fillRect(x + 1, y + 1, 126, 30);
    g.strokeStyle = '#8c6a3e';
    g.lineWidth = 2;
    g.strokeRect(x + 3, y + 3, 122, 26);
    glyphs(g, s, x + 64, y + 17, 25, '#e6d4a4', false, [...s].length > 3 ? 1 : 1.2, 1);
  });
  // 15 · cloth banners: a single big character, a cinnabar / indigo hem
  BANNERS.forEach((s, k) => {
    const [x0, y] = at(CELL.banners);
    const x = x0 + k * 32;
    g.fillStyle = k === 1 ? '#e9e1cf' : '#f0e9d8';
    g.fillRect(x, y, 32, C);
    g.fillStyle = k % 2 ? PIGMENTS.indigo : '#b5503f';
    g.fillRect(x, y, 32, 8);
    g.fillRect(x, y + C - 16, 32, 16);
    for (let i = 0; i < 4; i++) g.fillRect(x + i * 8 + 1, y + C - 16, 5, 16 + 0); // tattered hem
    g.fillStyle = WHITE;
    for (let i = 0; i < 4; i++) g.fillRect(x + i * 8 + 5, y + C - 8, 3, 8);
    glyphs(g, s, x + 16, y + 58, 30, '#1b1916', true, 0.85, 1.6);
  });
  return { day: c, glow: gc };
}

// ───────────────────────────── brush-painted flats ─────────────────────────────

type Pt = [number, number, number?];

class Brush {
  readonly strokes: Stroke[] = [];
  constructor(readonly rng: Rng) {}
  add(kind: StrokeKind, pts: Pt[], tone: number, extra: Partial<Stroke> = {}): void {
    this.strokes.push({ kind, tone, birth: 0, seed: this.rng.int(1, 2 ** 31 - 1), pts: pts.map(([x, y, w]) => ({ x, y, w: w ?? 2 })), ...extra });
  }
  stroke(pts: [number, number][], w0: number, w1: number, tone: number, extra: Partial<Stroke> = {}, kind: StrokeKind = 'brush'): void {
    const n = pts.length;
    this.add(kind, pts.map(([x, y], i) => [x, y, (w0 + (w1 - w0) * (n > 1 ? i / (n - 1) : 0)) * (i === 0 ? 0.7 : 1)]), tone, extra);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, n = 18): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 6]); }
    return out;
  }
}

/** A weeping willow (垂柳) in ink: a leaning dry-brush trunk and curtains of hanging wands. */
export function willowDrawing(seed = 1717, lean = 1): Drawing {
  const rng = makeRng(seed);
  const p = new Brush(rng);
  const W = 320, H = 640, AX = 150, AY = 628;
  const r = (a: number, b: number) => rng.range(a, b);
  p.add('wash', p.ellipse(AX, AY - 4, 60, 8), 0.1);
  // trunk: leaning, gnarled, a knot or two
  const top: [number, number] = [AX + 38 * lean, 250];
  const trunk: [number, number][] = [[AX, AY], [AX + 6 * lean, 540], [AX - 4 * lean, 460], [AX + 14 * lean, 380], [AX + 26 * lean, 310], top];
  p.stroke(trunk, 30, 12, 0.78, { dryness: 0.5 }, 'dry');
  p.stroke(trunk.map(([x, y]) => [x - 6, y]), 10, 4, 0.9, { dryness: 0.3 });
  p.add('dot', [[AX + 4 * lean, 470, 10]], 0.85);
  // main limbs arching out and up
  const limbs: [number, number][][] = [
    [top, [top[0] - 40, 190], [top[0] - 92, 150], [top[0] - 130, 140]],
    [top, [top[0] + 30, 180], [top[0] + 80, 150], [top[0] + 118, 150]],
    [[top[0] - 8, 290], [top[0] - 60, 250], [top[0] - 110, 236]],
    [top, [top[0] + 6, 160], [top[0] - 10, 96]],
  ];
  for (const l of limbs) p.stroke(l, 11, 3, 0.8, { dryness: 0.3 });
  // hanging wands: long falling lines from the crown, in pale to mid ink, with leaf dabs
  const crown: [number, number][] = [];
  for (let i = 0; i < 46; i++) {
    const a = rng();
    crown.push([W * 0.08 + a * W * 0.84, 90 + Math.sin(a * Math.PI) * -40 + r(0, 90) + (a < 0.2 || a > 0.8 ? 40 : 0)]);
  }
  for (const [x0, y0] of crown) {
    const len = r(200, 400);
    const drift = r(-18, 22);
    const pts: [number, number][] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([x0 + drift * t * t + Math.sin(t * 3 + x0) * 4, Math.min(AY - 70, y0 + len * t)]);
    }
    const tone = r(0.22, 0.5);
    p.stroke(pts, 2.2, 1, tone, { wet: 0.35 });
    // leaves: little slanting dabs down the wand, malachite in some
    const green = rng() < 0.45;
    for (let k = 1; k < 8; k++) {
      if (rng() < 0.3) continue;
      const [x, y] = pts[k];
      const s = rng() < 0.5 ? 1 : -1;
      p.stroke([[x, y], [x + s * r(4, 8), y + r(6, 10)]], 3.8, 0.8, tone + 0.15, green ? { color: PIGMENTS.malachite, wet: 0.5 } : { wet: 0.5 });
    }
  }
  // a veil of pale wash behind the crown (the green mist of a willow in leaf)
  p.strokes.unshift({ kind: 'wash', tone: 0.12, birth: 0, seed: 9, color: PIGMENTS.malachite, pts: p.ellipse(W / 2 + 10 * lean, 260, W * 0.42, 150, 22).map(([x, y]) => ({ x, y, w: 14 })) });
  return { width: W, height: H, anchor: { x: AX, y: AY }, strokes: p.strokes };
}

/** A few reeds / rushes (芦苇) in ink with ochre plumes, for the water's edge. */
export function reedDrawing(seed = 919): Drawing {
  const rng = makeRng(seed);
  const p = new Brush(rng);
  const W = 200, H = 400, AX = 100, AY = 396;
  const r = (a: number, b: number) => rng.range(a, b);
  for (let i = 0; i < 7; i++) {
    const x0 = AX + r(-40, 40), lean = r(-60, 60), topY = r(40, 170);
    const pts: [number, number][] = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([x0 + lean * t * t, AY - (AY - topY) * t]); }
    p.stroke(pts, 3.2, 1.2, r(0.45, 0.75));
    for (let k = 0; k < 2; k++) {
      const t = r(0.2, 0.6);
      const [sx, sy] = pts[Math.round(t * 6)];
      const d = rng() < 0.5 ? 1 : -1;
      p.stroke([[sx, sy], [sx + d * r(20, 35), sy - r(30, 60)], [sx + d * r(40, 60), sy - r(10, 50)]], 6, 0.8, r(0.4, 0.65), { wet: 0.4 });
    }
    if (rng() < 0.7) {
      const [tx, ty] = pts[6];
      for (let k = 0; k < 10; k++) p.add('dot', [[tx + r(-5, 5) + lean * 0.05, ty + r(0, 34), r(3, 6)]], r(0.35, 0.6), { color: rng() < 0.6 ? PIGMENTS.ochre : undefined });
    }
  }
  return { width: W, height: H, anchor: { x: AX, y: AY }, strokes: p.strokes };
}
