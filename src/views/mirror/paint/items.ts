// The 75 item icons (shop cards, 镜鉴, results): small still lifes in ink and colour on a 32 u
// square. 劫 items carry a purple ink border, 神品 a ring of gold leaf (GDD §9).
import type { ItemId } from '../ids';
import { ITEM_REG } from '../ids';
import { B, blob, ell, arcW, rot, rotW, spine, star, type Pt, type Spec } from './kit';
import { CINNABAR, CURSE, GOLD, INK, JADE, MOON, PAPER, SILVER } from './palette';

const WOOD = '#7b5a3a', BR = '#a8743a', STEEL = '#aeb7bd', YELLOW = '#e3c25a', ROUGE = '#b83a4b', GREEN = '#5f8a6e', IND = '#3d5a73';

// ─────────── primitives (all centred in a ±16 u box)
const P = {
  jar(b: B, c: string, label?: string) { b.fill(c, [[-9, -6], [-11, 4], [-8, 13], [8, 13], [11, 4], [9, -6]], 0.92, 0.4); b.fill(c, [[-5, -11], [5, -11], [6, -6], [-6, -6]], 0.92, 0.3); b.brush([[-6, -11, 1.4], [6, -11, 1.4]], 0.8, INK); if (label) { b.fill('#d9483a', [[-4, -3], [4, -3], [4, 6], [-4, 6]], 0.9, 0.2); b.glyph(label, 0, 1.5, 7, INK); } },
  cup(b: B, c: string) { b.fill(c, [[-10, -3], [10, -3], [7, 7], [-7, 7]], 0.92, 0.4); b.fill(c, [[-3, 7], [3, 7], [4, 10], [-4, 10]], 0.92, 0.3); b.line(ell(0, -3, 10, 2.6, 0, Math.PI * 2, 14), 0.5, 0.7, INK); },
  mirror(b: B, rim: string, face = '#e9e4d4') { b.fill(rim, ell(0, 0, 13, 13), 0.95, 0.4); b.fill(face, ell(0, 0, 10, 10), 0.95, 0.3); b.disc(-3, -3, 2.2, '#ffffff', 0.8); },
  bell(b: B, c: string) { b.fill(c, [[-4, -10], [4, -10], [8, 4], [11, 9], [-11, 9], [-8, 4]], 0.95, 0.3); b.brush([[-11, 9, 1.4], [11, 9, 1.4]], 0.8, INK); b.dot(0, 11, 3, 0.95, INK); b.brush(arcW(0, -12, 3, 2.4, Math.PI, Math.PI * 2, 1, 1, 6), 0.9, INK); },
  leaf(b: B, x: number, y: number, a: number, len: number, c = GREEN) { b.brush(rotW([[0, 0, 0.4], [len * 0.4, 0, len * 0.28], [len, 0, 0.3]], a).map(([px, py, w]) => [px + x, py + y, w] as [number, number, number]), 0.85, c); },
  feather(b: B, a: number, c = '#8a7a64') { b.fill(c, rot([[-12, 0], [-4, -4], [10, -2], [13, 0], [10, 2], [-4, 4]], a), 0.9, 0.4); b.line(rot([[-14, 0], [13, 0]], a), 0.5, 0.9, INK); for (let i = -2; i <= 2; i++) b.line(rot([[i * 4, -3], [i * 4 + 2, 3]], a), 0.4, 0.6, INK); },
  book(b: B, c: string) { b.fill(c, [[-12, -9], [12, -9], [12, 9], [-12, 9]], 0.92, 0.2); b.fill('#f1e9d8', [[-10, -8], [-1, -7], [-1, 8], [-10, 7]], 0.95, 0.2); b.fill('#f1e9d8', [[1, -7], [10, -8], [10, 7], [1, 8]], 0.95, 0.2); for (let y = -5; y < 7; y += 2.6) { b.line([[-8, y], [-3, y]], 0.3, 0.5, INK); b.line([[3, y], [8, y]], 0.3, 0.5, INK); } },
  scroll(b: B, c = '#e9dcc0') { b.fill(c, [[-9, -12], [9, -12], [9, 12], [-9, 12]], 0.95, 0.2); b.brush([[-11, -12, 2.4], [11, -12, 2.4]], 0.95, WOOD); b.brush([[-11, 12, 2.4], [11, 12, 2.4]], 0.95, WOOD); },
  stone(b: B, c: string, x = 0, y = 0, r = 9) { b.fill(c, blob(x, y, r, r * 0.8, x * 7 + y * 13 + 3, 0.1), 0.95, 0.4); },
  flame(b: B, x: number, y: number, s: number, c = '#e0683a') { b.fill(c, [[x - 6 * s, y + 6 * s], [x - 5 * s, y - 2 * s], [x - 2 * s, y - 5 * s], [x, y - 12 * s], [x + 3 * s, y - 4 * s], [x + 6 * s, y - 1 * s], [x + 5 * s, y + 6 * s]], 0.85, 0.8); b.fill(YELLOW, [[x - 2.4 * s, y + 5 * s], [x, y - 3 * s], [x + 2.4 * s, y + 5 * s]], 0.85, 0.5); },
  knot(b: B, c: string) { b.brush(arcW(0, -4, 8, 6, 0, Math.PI * 2, 2, 2, 14), 0.9, c); b.brush([[-2, 2, 2], [-6, 12, 1.4]], 0.9, c); b.brush([[2, 2, 2], [6, 12, 1.4]], 0.9, c); b.dot(0, 2, 4, 0.95, c); },
  box(b: B, c: string, lid = GOLD) { b.fill(c, [[-12, -6], [12, -6], [12, 10], [-12, 10]], 0.95, 0.2); b.fill(c, [[-13, -10], [13, -10], [12, -6], [-12, -6]], 0.95, 0.2); b.dot(0, -3, 4, 0.95, lid); },
  pill(b: B, x: number, y: number, r: number, c = GOLD) { b.disc(x, y, r, c); b.disc(x - r * 0.35, y - r * 0.35, r * 0.3, '#fff6d0'); },
  charm(b: B, c = YELLOW, glyph?: string) { b.fill(c, [[-6, -12], [6, -12], [6, 12], [-6, 12]], 0.95, 0.2); if (glyph) b.glyph(glyph, 0, 0, 10, CINNABAR); else b.brush([[0, -9, 1.2], [0, 9, 1.2]], 0.9, CINNABAR); },
  sword(b: B, a: number, len = 26, c = STEEL) { const pts: Pt[] = [[-len / 2, -1.4], [len / 2 - 3, -1.4], [len / 2, 0], [len / 2 - 3, 1.4], [-len / 2, 1.4]]; b.fill(c, rot(pts, a), 0.95, 0.2); b.line(rot(pts, a), 0.4, 0.8, INK); b.brush(rotW([[-len / 2 - 5, 0, 1.8], [-len / 2, 0, 1.8]], a), 0.95, '#4a3526'); b.brush(rotW([[-len / 2, -3, 1.2], [-len / 2, 3, 1.2]], a), 0.95, GOLD); },
  gourd(b: B, c = '#cf9446') { b.fill(c, ell(0, 5, 8, 8), 0.95, 0.3); b.fill(c, ell(0, -6, 5, 5), 0.95, 0.3); b.brush([[-5, -1, 1.4], [5, -1, 1.4]], 0.9, CINNABAR); b.fill(WOOD, [[-1.6, -11], [1.6, -11], [1.4, -14], [-1.4, -14]], 0.95, 0.2); },
  ring(b: B, c: string, w = 1.6) { b.ring(0, 0, 14.5, w, c, 0.95); },
  ripples(b: B, x: number, y: number, c = IND) { for (const r of [4, 8, 12]) b.line(ell(x, y, r, r * 0.4, 0, Math.PI * 2, 14), 0.5, 0.5, c); },
};

const it = (paint: (b: B) => void): Spec => ({ box: [-16, -16, 16, 16], n: 1, halo: 'paper', paint });

const DEF: Record<ItemId, (b: B) => void> = {
  songzi: (b) => { P.leaf(b, -10, 8, -0.2, 22, GREEN); for (const [x, y] of [[-4, 2], [1, 0], [5, 3], [-1, 5], [3, 7], [-6, 6]] as Pt[]) b.fill('#b58a5a', ell(x, y, 2.6, 3.4), 0.95, 0.3); },
  tea: (b) => { P.cup(b, '#a8c4b0'); P.leaf(b, -4, -3, -0.3, 10, '#4a7a4a'); },
  sandals: (b) => { for (const x of [-6, 6]) { b.fill('#d6b56c', ell(x, 0, 4.6, 12), 0.95, 0.3); for (let y = -8; y < 10; y += 3) b.line([[x - 4, y], [x + 4, y]], 0.4, 0.6, '#7a5a2a'); } },
  whetstone: (b) => { b.fill('#8a8f94', rot([[-13, -5], [13, -5], [13, 5], [-13, 5]], -0.3), 0.95, 0.3); b.brush(rotW([[-8, 0, 2], [8, 0, 0.6]], -0.3), 0.4, '#dfe6ea'); },
  fletch: (b) => { for (const a of [-0.5, 0, 0.5]) P.feather(b, a - Math.PI / 2, '#b8a88a'); b.brush([[-3, 8, 1.4], [3, 8, 1.4]], 0.9, CINNABAR); },
  cinnabar: (b) => { b.fill(CINNABAR, rot([[-11, -3], [7, -3], [11, 0], [7, 3], [-11, 3]], -0.6), 0.95, 0.3); b.wash(CINNABAR, blob(5, 8, 8, 4, 3), 0.5); },
  pineink: (b) => { b.fill('#1b1916', [[-5, -13], [5, -13], [5, 13], [-5, 13]], 0.97, 0.2); b.brush([[0, -8, 0.6], [0, 6, 0.8]], 0.7, GOLD); for (const [a, s] of [[-0.8, 1], [0.8, 1]] as Pt[]) b.line([[0, -4 + s], [4 * Math.sin(a), -1 + s]], 0.4, 0.8, GOLD); },
  guardmirror: (b) => { P.mirror(b, BR); b.brush([[-13, -2, 1], [-16, -12, 0.8]], 0.9, ROUGE); b.brush([[13, -2, 1], [16, -12, 0.8]], 0.9, ROUGE); },
  bell: (b) => { P.bell(b, '#b0853a'); b.brush([[0, -12, 1.4], [5, -15, 1.2], [9, -13, 0.4]], 0.9, CINNABAR); },
  eagle: (b) => P.feather(b, -0.8, '#6e5a44'),
  redstring: (b) => P.knot(b, ROUGE),
  ginseng: (b) => { b.fill('#e3c8a0', [[-2, -6], [3, -6], [4, 4], [8, 13], [4, 12], [1, 6], [-2, 13], [-5, 12], [-2, 4]], 0.95, 0.4); b.brush([[0, -6, 0.8], [2, -13, 0.6]], 0.9, GREEN); for (const [x, y] of [[4, -13], [6, -11], [2, -12]] as Pt[]) b.disc(x, y, 1.6, ROUGE); },
  tigertally: (b) => { for (const s of [-1, 1]) b.fill('#9a7a3a', rot(ell(s * 5, 0, 5, 11, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5, 10), 0).concat([[s * 5, 11]]), 0.95, 0.3); for (let x = -8; x <= 8; x += 4) b.line([[x, -7], [x + 2, 7]], 0.6, 0.8, INK); },
  amulet: (b) => { b.fill(ROUGE, [[-8, -4], [8, -4], [9, 12], [-9, 12]], 0.95, 0.3); b.fill(YELLOW, [[-3, -12], [3, -12], [3, 2], [-3, 2]], 0.95, 0.2); b.brush([[-8, -4, 1.4], [0, -7, 1.4], [8, -4, 1.4]], 0.9, GOLD); },
  balm: (b) => { b.fill('#f1ede2', ell(0, 3, 10, 10), 0.95, 0.3); b.line(ell(0, 3, 10, 10, 0, Math.PI * 2, 16), 0.5, 0.6, IND); b.fill(ROUGE, [[-6, -9], [6, -9], [5, -5], [-5, -5]], 0.95, 0.2); b.dot(0, 4, 4, 0.5, IND); },
  elixir: (b) => { P.gourd(b, '#b88a4a'); P.pill(b, 0, -14, 3); },
  drumroll: (b) => { b.fill(ROUGE, [[-12, -6], [12, -6], [12, 8], [-12, 8]], 0.95, 0.3); b.fill('#e9dcc0', ell(0, -6, 12, 4), 0.95, 0.3); b.brush([[-3, -7, 2.4], [3, -5, 2.4]], 0.9, INK); for (let x = -9; x <= 9; x += 6) b.disc(x, 1, 1, GOLD); },
  gall: (b) => { for (let i = 0; i < 6; i++) b.brush(spine(-12, 8 + i * 1.2, 12, 6 + i * 1.4, 1.4, 1.2), 0.8, '#8a6a3a'); b.line([[0, -14], [0, -6]], 0.4, 0.8, INK); b.fill('#4a6a3a', ell(0, -2, 4, 5), 0.95, 0.3); },
  backwater: (b) => { b.brush(spine(-6, 12, -6, -13, 1.4, 1.2), 0.95, WOOD); b.fill(CINNABAR, [[-6, -13], [8, -10], [6, -3], [-6, -5]], 0.9, 0.3); for (const y of [6, 10, 14]) b.brush([[-14, y, 1], [-4, y - 1, 1.6], [14, y + 1, 0.6]], 0.6, IND); },
  atease: (b) => { b.brush([[-8, 12, 1.4], [6, -2, 1.4]], 0.9, WOOD); b.brush([[8, 12, 1.4], [-6, -2, 1.4]], 0.9, WOOD); b.brush([[-8, -2, 2.4], [8, -2, 2.4]], 0.95, '#6e5a44'); b.brush(spine(10, 14, 14, -14, 1.2, 1), 0.9, WOOD); b.fill(STEEL, [[13, -14], [15, -18], [16, -13]], 0.95, 0.2); },
  versatile: (b) => { b.fill('#e9c46a', star(0, 0, 12, 11, 8, Math.PI / 8), 0.85, 0.3); b.line(star(0, 0, 12, 11, 8, Math.PI / 8).concat([star(0, 0, 12, 11, 8, Math.PI / 8)[0]]), 0.6, 0.8, INK); b.dot(0, 0, 7, 0.6, ROUGE); },
  chasewind: (b) => { b.brush(spine(10, 13, 3, -1, 2.2, 1.8), 0.95, WOOD); for (let i = 0; i < 7; i++) b.brush([[3, -1, 1.6], [-4 - i, -7 + i * 1.3, 1.4], [-14, -11 + i * 2.6, 0.4]], 0.85, i % 2 ? '#9a8f7a' : '#c9bfa8'); b.brush([[-8, -12, 0.3], [-2, -13, 1], [6, -12, 0.3]], 0.4, IND); b.brush([[-10, 9, 0.3], [-3, 10, 1], [4, 9, 0.3]], 0.4, IND); },
  ironbone: (b) => { b.brush(spine(-12, 10, 12, -10, 4, 4), 0.95, '#8a8f94'); for (const [x, y] of [[-12, 10], [12, -10]] as Pt[]) { b.dot(x - 2, y, 5, 0.95, '#8a8f94'); b.dot(x + 2, y + 2, 5, 0.95, '#8a8f94'); } for (let i = 0; i < 4; i++) b.ring(-9 + i * 6, -8 + i * 6, 2, 0.8, INK, 0.8); },
  physician: (b) => { b.brush(spine(-10, 14, 8, -14, 1.6, 1.4), 0.95, WOOD); b.brush([[2, -6, 0.5], [4, -2, 0.5]], 0.9, INK); b.fill('#cf9446', ell(5, 4, 5.4, 5.4), 0.95, 0.3); b.fill('#cf9446', ell(5, -3, 3.4, 3.4), 0.95, 0.3); b.brush([[2, 1, 1], [8, 1, 1]], 0.9, CINNABAR); },
  basket: (b) => { b.fill('#b58a4a', [[-12, -2], [12, -2], [9, 12], [-9, 12]], 0.95, 0.3); for (let x = -10; x <= 10; x += 4) b.line([[x, -2], [x * 0.8, 12]], 0.4, 0.6, '#6e4a22'); b.brush(arcW(0, -2, 11, 10, Math.PI, Math.PI * 2, 1.4, 1.4, 10), 0.9, '#6e4a22'); for (const [x, y] of [[-4, -4], [2, -5], [6, -3]] as Pt[]) b.fill(MOON, [[x - 2, y], [x, y - 3], [x + 2, y], [x, y + 2]], 0.95, 0.2); },
  coinstring: (b) => { for (let i = 0; i < 5; i++) { const x = -10 + i * 5, y = -8 + i * 4; b.disc(x, y, 3.6, '#c9973a'); b.flat((g) => { g.fillStyle = '#5a3a12'; g.fillRect(x - 1, y - 1, 2, 2); }); } b.line([[-13, -10], [12, 10]], 0.4, 0.9, ROUGE); },
  lots: (b) => { b.fill('#8a6a3a', [[-8, -2], [8, -2], [7, 13], [-7, 13]], 0.95, 0.3); for (let i = 0; i < 5; i++) b.brush([[-5 + i * 2.5, -2, 1.2], [-6 + i * 3, -9 - (i === 2 ? 5 : 0), 1.2]], 0.95, '#d6b273'); b.dot(0, -14, 2, 0.9, CINNABAR); },
  pawn: (b) => { b.fill('#efe6d0', [[-9, -13], [9, -13], [9, 13], [-9, 13]], 0.95, 0.2); b.fill(CINNABAR, [[-5, -9], [5, -9], [5, 1], [-5, 1]], 0.85, 0.2); b.glyph('当', 0, -4, 8, '#efe6d0'); for (let y = 5; y < 12; y += 3) b.line([[-6, y], [6, y]], 0.4, 0.5, INK); },
  luckycat: (b) => { b.fill('#f7f5ee', ell(0, 5, 9, 9), 0.95, 0.4); b.fill('#f7f5ee', ell(0, -5, 7, 6), 0.95, 0.4); b.fill('#f7f5ee', [[-6, -9], [-5, -14], [-2, -10]], 0.95, 0.2); b.fill('#f7f5ee', [[2, -10], [5, -14], [6, -9]], 0.95, 0.2); b.brush([[6, 0, 2.6], [10, -8, 2.4]], 0.95, '#f7f5ee'); b.line(ell(0, 5, 9, 9, 0, Math.PI * 2, 16), 0.5, 0.6, INK); b.brush([[-3, -5, 0.6], [-1, -5.6, 0.6]], 0.9, INK); b.brush([[1, -5.6, 0.6], [3, -5, 0.6]], 0.9, INK); b.brush(arcW(0, 0, 6, 2, 0.2, Math.PI - 0.2, 1, 1, 6), 0.9, ROUGE); b.dot(0, 2, 2.4, 0.9, GOLD); },
  miser: (b) => { b.fill('#6e7378', [[-8, 10], [-10, -2], [-4, -6], [2, -12], [6, -8], [4, -4], [10, 0], [8, 10]], 0.95, 0.3); b.fill(CINNABAR, [[2, -12], [4, -15], [6, -11]], 0.9, 0.2); b.fill('#e3c25a', [[6, -8], [10, -7], [6, -6]], 0.9, 0.2); b.disc(3, -9, 0.8, '#111'); b.brush([[-10, 12, 1.4], [10, 12, 1.4]], 0.9, INK); },
  abacus: (b) => { b.brush([[-13, -10, 2], [13, -10, 2]], 0.95, '#3b2b25'); b.brush([[-13, 10, 2], [13, 10, 2]], 0.95, '#3b2b25'); b.brush([[-13, -4, 1.2], [13, -4, 1.2]], 0.95, '#3b2b25'); for (let x = -10; x <= 10; x += 5) { b.line([[x, -10], [x, 10]], 0.4, 0.8, INK); b.disc(x, -7, 1.6, '#e9dcc0'); for (const y of [0, 3, 6]) b.disc(x, y + (x % 2 ? 1 : 0), 1.6, '#e9dcc0'); } },
  xuan: (b) => { for (let i = 0; i < 4; i++) b.fill('#f6f1e4', [[-11 + i, -9 + i * 2], [11 + i, -11 + i * 2], [12 + i, 7 + i * 2], [-10 + i, 9 + i * 2]], 0.95, 0.2), b.line([[-11 + i, -9 + i * 2], [11 + i, -11 + i * 2]], 0.3, 0.4, INK); b.brush([[10, 11, 1], [14, 8, 1.4]], 0.5, INK); },
  duanyan: (b) => { b.fill('#5a3a4a', ell(0, 0, 13, 10), 0.97, 0.3); b.fill('#0d0c10', ell(0, 2, 8, 5), 0.97, 0.3); b.disc(-2, 1, 1.4, '#6a6a7a'); b.line(ell(0, 0, 13, 10, 0, Math.PI * 2, 16), 0.5, 0.6, '#2a1a22'); },
  splash: (b) => { b.fill(INK, blob(0, 0, 10, 8, 17, 0.35), 0.9, 1.4); for (const [x, y, d] of [[11, -8, 3], [-12, 6, 2.4], [8, 11, 2], [-9, -11, 1.8]] as [number, number, number][]) b.dot(x, y, d, 0.9, INK); },
  inkbamboo: (b) => { for (const x of [-5, 4]) for (let i = 0; i < 3; i++) b.brush([[x, 13 - i * 9, 2.6], [x + 0.5, 6 - i * 9, 2.4]], 0.9, INK); P.leaf(b, 4, -8, -0.5, 12, INK); P.leaf(b, -5, -2, -2.6, 11, INK); },
  inkcrane: (b) => { b.wash(INK, ell(-2, 2, 8, 5), 0.6); b.brush([[2, 0, 2], [6, -6, 1.6], [9, -12, 1.4]], 0.85, INK); b.dot(9.5, -13, 3, 0.9, INK); b.dot(10, -15, 2, 0.95, CINNABAR); b.brush([[-6, 0, 1.6], [-13, -8, 4], [-15, -6, 0.4]], 0.6, INK); b.line([[-2, 6], [-3, 14]], 0.5, 0.9, INK); b.line([[1, 6], [2, 14]], 0.5, 0.9, INK); },
  inkpool: (b) => { b.fill('#0d0c10', blob(0, 3, 13, 8, 5, 0.08), 0.97, 0.6); b.brush(spine(-10, -10, 10, -2, 1.6, 1.6), 0.95, '#c9a870'); b.fill(INK, [[9, -4], [13, -1], [11, 0]], 0.95, 0.3); },
  dotting: (b) => { b.brush(arcW(0, 2, 11, 9, Math.PI * 0.8, Math.PI * 2.1, 3, 1.4, 12), 0.9, INK); b.brush([[4, -6, 1.6], [8, -12, 1], [6, -15, 0.3]], 0.9, INK); b.brush([[8, 0, 1.2], [14, 4, 0.8], [15, 8, 0.3]], 0.9, INK); b.disc(3, -2, 2.4, '#f4efe4'); b.disc(3.4, -2, 1.4, '#000'); b.dot(3.4, -2, 3, 0.4, CINNABAR); },
  tassel: (b) => { b.disc(0, -8, 3.6, JADE); b.brush([[0, -12, 0.6], [0, -16, 0.5]], 0.9, CINNABAR); for (let i = -2; i <= 2; i++) b.brush([[0, -4, 1.4], [i * 2, 6, 1.2], [i * 3, 14, 0.4]], 0.85, CINNABAR); },
  swordqi: (b) => { for (const a of [-0.7, 0.7]) b.brush(rotW([[-14, 0, 0.4], [0, 0, 3.4], [14, 0, 0.4]], a), 0.75, '#3f6f8f'); },
  swordheart: (b) => { b.ring(0, 0, 11, 1.6, '#e9c46a', 0.9); b.wash('#e9c46a', ell(0, 0, 11, 11), 0.2); P.sword(b, -Math.PI / 2, 22); },
  washpool: (b) => { b.fill('#8a8f94', ell(0, 4, 14, 8), 0.95, 0.3); b.fill('#51708a', ell(0, 4, 11, 5.6), 0.9, 0.3); P.sword(b, -0.15, 26); },
  yujian: (b) => { P.scroll(b); for (const [x, y] of [[-4, -6], [4, -6], [-4, 2], [4, 2]] as Pt[]) b.brush([[x - 2, y, 0.8], [x + 2, y + 2, 1], [x, y + 4, 0.4]], 0.9, INK); b.brush([[-6, 8, 0.8], [6, 8, 0.8]], 0.8, '#3f6f8f'); },
  swordtomb: (b) => { b.fill('#6e6a5a', ell(0, 8, 14, 6, Math.PI, Math.PI * 2, 12).concat([[14, 10], [-14, 10]]), 0.95, 0.4); for (const [x, a, l] of [[-7, -0.3, 14], [0, 0.05, 18], [7, 0.35, 12]] as [number, number, number][]) b.brush(rotW([[0, 0, 1.8], [0, -l, 1.2]], a).map(([px, py, w]) => [px + x, py + 6, w] as [number, number, number]), 0.95, STEEL); },
  yellowpaper: (b) => { for (let i = 0; i < 3; i++) b.fill(YELLOW, rot([[-6, -12], [6, -12], [6, 12], [-6, 12]], -0.3 + i * 0.3), 0.9, 0.2); },
  fivethunder: (b) => { b.fill(CINNABAR, [[-5, -5], [5, -5], [5, 5], [-5, 5]], 0.9, 0.2); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * 11, y = Math.sin(a) * 11; b.brush([[x - 1.4, y - 3, 0.8], [x + 1, y - 0.4, 1], [x - 1, y + 0.6, 1], [x + 1.4, y + 3, 0.3]], 0.95, '#d9a62e'); } },
  lingering: (b) => { b.brush([[-14, -10, 2.4], [14, -10, 2.4]], 0.95, WOOD); for (const r of [5, 9, 13]) b.line(ell(0, 2, r, r * 0.55, 0, Math.PI * 2, 16), 0.5, 0.55, '#6e9a6a'); },
  boya: (b) => { b.fill('#3b2b25', rot([[-14, -4], [14, -5], [15, 0], [14, 5], [-14, 4]], -0.35), 0.97, 0.3); for (const y of [-2, 0, 2]) b.line(rot([[-12, y], [12, y]], -0.35), 0.25, 0.6, '#e9dfc8'); b.line(rot([[2, 3], [9, 12]], -0.35), 0.3, 0.7, '#e9dfc8'); },
  dukang: (b) => P.jar(b, '#8a6a4a', '杜'),
  nightcup: (b) => { b.wash('#7fb39a', ell(0, 0, 14, 14), 0.25); P.cup(b, '#bfe0cc'); b.fill('#8e2b3a', ell(0, -3, 8, 2), 0.8, 0.2); },
  dragblade: (b) => { b.brush(spine(-14, -12, 8, 4, 1.8, 1.8), 0.95, '#5b2c24'); b.fill('#d4d8d4', [[6, 2], [14, 4], [16, 12], [8, 10]], 0.95, 0.3); b.dry([[-14, 13, 2], [14, 13, 1]], 0.6, INK); },
  thorns: (b) => { for (const a of [0.3, -0.5, 1.2]) { const pts = rotW([[-13, 0, 1.6], [0, 3, 1.4], [13, -1, 0.6]], a); b.brush(pts, 0.9, '#4a3a2a'); for (let i = -2; i <= 2; i++) b.fill('#4a3a2a', rot([[i * 5, 1], [i * 5 + 1.5, -3.4], [i * 5 + 2.4, 1]], a), 0.95, 0.2); } },
  goldenbell: (b) => { P.bell(b, GOLD); b.wash(GOLD, ell(0, 0, 15, 15), 0.2); },
  gomanual: (b) => { P.book(b, '#3a4a5a'); for (const [x, y, w] of [[-7, -4, 0], [-4, 0, 1], [5, -3, 0], [6, 2, 1]] as [number, number, number][]) b.disc(x, y, 1.4, w ? '#f4efe4' : '#111'); },
  capture: (b) => { b.flat((g) => { g.fillStyle = '#d7b273'; g.fillRect(-15, -15, 30, 30); g.strokeStyle = 'rgba(27,25,22,.5)'; g.lineWidth = 0.5; for (let i = -12; i <= 12; i += 8) { g.beginPath(); g.moveTo(i, -15); g.lineTo(i, 15); g.moveTo(-15, i); g.lineTo(15, i); g.stroke(); } }); for (const [x, y] of [[-4, -12], [-4, 4], [-12, -4], [4, -4]] as Pt[]) b.disc(x, y, 3.6, '#111'); b.disc(-4, -4, 3.6, '#f4efe4'); b.ring(-4, -4, 3.6, 0.5, INK); },
  moonsoul: (b) => { b.wash(MOON, ell(2, -2, 12, 12), 0.35); b.disc(2, -2, 7, '#f6f7fb'); for (const [x, y] of [[-10, 8], [-6, 12], [-12, 2]] as Pt[]) b.fill(MOON, [[x - 1.6, y], [x, y - 2.4], [x + 1.6, y], [x, y + 2.4]], 0.9, 0.2); b.ring(2, -2, 7, 0.6, SILVER); },
  osmanthus: (b) => { b.brush(spine(-12, 12, 10, -10, 1.4, 1), 0.9, WOOD); P.leaf(b, -2, 2, -2.2, 10, '#3e5a3a'); P.leaf(b, 4, -4, 0.4, 10, '#3e5a3a'); for (const [x, y] of [[-6, 4], [-2, -1], [2, -6], [7, -8], [-4, 0], [5, -3], [0, 3]] as Pt[]) b.disc(x, y, 1.6, GOLD); },
  lingbo: (b) => { P.ripples(b, 0, 9); for (const x of [-6, 6]) { b.fill(ROUGE, ell(x, 0, 4, 9), 0.95, 0.3); b.fill('#f1d9a8', ell(x, 3, 2.4, 4), 0.9, 0.2); } },
  cushion: (b) => { b.fill('#b58a4a', ell(0, 2, 14, 10), 0.95, 0.3); for (const r of [4, 8, 12]) b.line(ell(0, 2, r, r * 0.7, 0, Math.PI * 2, 16), 0.5, 0.55, '#6e4a22'); },
  cuthair: (b) => { for (let i = 0; i < 7; i++) b.brush([[-6 + i * 1.6, -12, 1.2], [-4 + i * 1.4, 0, 1], [-8 + i * 2, 12, 0.3]], 0.9, INK); b.brush(spine(4, -8, 14, -14, 1.6, 1.2), 0.95, STEEL); b.brush(spine(-2, -4, 4, -8, 1.8, 1.8), 0.95, WOOD); },
  burnboats: (b) => { b.fill('#3a3a36', [[-12, -4], [-2, -4], [-4, 6], [-10, 6]], 0.95, 0.3); b.brush([[-8, -4, 1], [-5, 4, 1]], 0.95, PAPER); b.fill(WOOD, [[0, 4], [14, 2], [10, 8], [2, 8]], 0.95, 0.3); P.ripples(b, 6, 10); P.flame(b, -7, -6, 0.5); },
  yanwang: (b) => { b.fill('#1b1916', [[-9, -13], [9, -13], [9, 13], [-9, 13]], 0.97, 0.2); b.fill(CINNABAR, [[-5, 2], [5, 2], [5, 10], [-5, 10]], 0.9, 0.2); b.glyph('令', 0, -5, 9, '#efe6d0'); },
  delusion: (b) => { b.wash('#6a5a7a', blob(0, 0, 12, 11, 7, 0.2), 0.6); b.brush(arcW(0, 0, 8, 8, 0, Math.PI * 1.6, 1.6, 0.4, 12), 0.7, INK); for (const [x, y] of [[-5, -4], [4, -6], [6, 3], [-3, 5], [0, -1]] as Pt[]) { b.disc(x, y, 1.5, '#f4efe4'); b.disc(x + 0.4, y, 0.7, '#111'); } },
  innerdemon: (b) => { b.wash(CURSE, [[-6, -2], [6, -2], [8, 13], [-8, 13]], 0.8); b.wash(CURSE, ell(0, -8, 5, 5.4), 0.9); b.disc(-1.6, -8, 0.9, '#ff5a4a'); b.disc(1.8, -8, 0.9, '#ff5a4a'); },
  crackedmirror: (b) => { P.mirror(b, BR); b.brush([[-8, -9, 1.2], [-2, -2, 1], [2, 1, 0.8], [8, 9, 0.4]], 0.95, INK); b.line([[-2, -2], [4, -6]], 0.5, 0.9, '#ffffff'); },
  wanjian: (b) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.brush([[Math.cos(a) * 14, Math.sin(a) * 14, 1.4], [Math.cos(a) * 5, Math.sin(a) * 5, 0.4]], 0.9, STEEL); } b.disc(0, 0, 2.4, GOLD); },
  inkdragon: (b) => { P.scroll(b, '#efe6d0'); b.brush([[-6, 8, 2.4], [-2, 0, 3], [4, -4, 2.4], [8, -10, 2], [14, -14, 1]], 0.9, INK); b.dot(12, -14, 4, 0.9, INK); b.disc(12.6, -14.4, 0.9, GOLD); },
  dugu: (b) => { b.fill('#f6f1e4', [[-12, -14], [12, -14], [12, 14], [-12, 14]], 0.95, 0.2); P.sword(b, -Math.PI / 4, 24); },
  samadhi: (b) => { b.fill('#e7a3b3', ell(0, 9, 12, 4.4), 0.9, 0.4); for (let i = -2; i <= 2; i++) b.fill('#e7a3b3', rot(ell(0, 4, 3, 7, 0, Math.PI * 2, 10), i * 0.45, 0, 10), 0.85, 0.3); P.flame(b, -4, 2, 0.6, '#e04a3a'); P.flame(b, 0, 0, 0.8, '#3f6f8f'); P.flame(b, 4, 2, 0.6, GOLD); },
  treasurebowl: (b) => { b.fill(BR, [[-13, -2], [13, -2], [9, 10], [-9, 10]], 0.95, 0.3); b.fill('#8a5a2a', ell(0, -2, 13, 3.6), 0.95, 0.2); for (const [x, y] of [[-6, -5], [0, -8], [6, -5], [-2, -4], [4, -3]] as Pt[]) b.fill(MOON, [[x - 2, y], [x, y - 3], [x + 2, y], [x, y + 2]], 0.95, 0.2); b.disc(3, -9, 1.8, '#ffffff'); },
  penglai: (b) => { for (const [x, w] of [[-8, 7], [3, 9], [11, 5]] as Pt[]) b.fill(GREEN, [[x - w, 10], [x - w * 0.3, 2], [x, -1], [x + w * 0.4, 3], [x + w, 10]], 0.85, 0.5); P.ripples(b, 0, 11); P.pill(b, 0, -9, 4); },
  ambush: (b) => { for (let i = 0; i < 5; i++) b.fill(i % 2 ? CINNABAR : '#3a4a5a', [[-14 + i * 6, -14], [-9 + i * 6, -12], [-14 + i * 6, -9]], 0.9, 0.2), b.line([[-14 + i * 6, -14], [-14 + i * 6, 0]], 0.4, 0.8, INK); b.fill('#8a5a32', ell(0, 6, 8, 9), 0.95, 0.3); b.brush(spine(0, -2, 2, -14, 2, 1.4), 0.95, '#6b4a2a'); for (const x of [-2, 0, 2]) b.line([[x, -10], [x, 12]], 0.25, 0.6, '#e9dfc8'); },
  needle: (b) => { P.ripples(b, 0, 12); b.fill('#3a3a36', [[-3, -14], [3, -14], [3, 12], [-3, 12]], 0.97, 0.2); for (const y of [-12, 9]) b.brush([[-4, y, 2.4], [4, y, 2.4]], 0.95, GOLD); },
  jiangjinjiu: (b) => { b.fill('#8a6a4a', rot([[-9, -6], [-11, 4], [-8, 13], [8, 13], [11, 4], [9, -6]], 0.9, 0, 0).map(([x, y]) => [x - 4, y - 4] as Pt), 0.92, 0.4); b.wash(IND, [[2, -2], [14, 4], [15, 14], [4, 12]], 0.5); b.brush([[2, -2, 3], [10, 6, 4], [14, 14, 3]], 0.5, '#8e2b3a'); },
  watermoon: (b) => { P.mirror(b, '#b0875a', '#1d2430'); b.disc(-2, -3, 3.6, '#f6f7fb'); b.fill('#f6f7fb', ell(-2, 5, 3.6, 1.2), 0.6, 0.2); P.ripples(b, -2, 5, '#9ab0c6'); },
};

export const ITEM_SPECS = {} as Record<ItemId, Spec>;
for (const row of ITEM_REG) {
  const paint = DEF[row.id];
  ITEM_SPECS[row.id] = it((b) => {
    paint(b);
    if (row.group === 'curse') P.ring(b, CURSE, 1.8);
    if (row.group === 'legend') { P.ring(b, GOLD, 2); b.ring(0, 0, 13.2, 0.5, '#fff1b8', 0.8); }
  });
}
void star; void SILVER;
