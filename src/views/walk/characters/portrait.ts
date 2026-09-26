// Painted portraits of the cast, for cards outside the 3D world (the quest book, the character
// select). Each is a small ink-and-colour figure on a round fan of xuan paper (团扇), painted with
// the same brush engine as the garden. A locked companion is a pale ink silhouette with a small
// 「?」 seal. Results are cached per (id, locked, size).
import type { Stroke, StrokeKind } from '../../../ink/types';
import { PIGMENTS } from '../../../ink/types';
import { paintStroke } from '../../../ink/brush';
import { fillPaper } from '../../../ink/paper';
import { makeSeal, SEAL_RED } from '../../../ink/seal';

type Pt = [number, number];
type WPt = [number, number, number];

/** Collects strokes in a 100 × 120 drawing space. Details (eyes, blush, fine lines) are dropped for silhouettes. */
class P {
  strokes: { s: Stroke; detail: boolean }[] = [];
  private seed = 11;
  constructor(readonly silhouette: boolean) {}
  private push(kind: StrokeKind, pts: { x: number; y: number; w: number }[], tone: number, color: string | undefined, detail: boolean, o: Partial<Stroke> = {}) {
    if (this.silhouette && detail) return;
    this.strokes.push({ s: { kind, pts, tone, color, birth: 0, seed: this.seed++, ...o }, detail });
  }
  fill(color: string, pts: Pt[], tone = 0.9, soft = 0.6, detail = false) {
    this.push('fill', pts.map(([x, y], i) => ({ x, y, w: i === 0 ? soft : 1 })), tone, color, detail);
  }
  wash(color: string | undefined, pts: Pt[], tone = 0.3, detail = false) {
    this.push('wash', pts.map(([x, y], i) => ({ x, y, w: i === 0 ? 2 : 1 })), tone, color, detail);
  }
  brush(pts: WPt[], tone = 0.85, color?: string, detail = false, dryness?: number) {
    this.push('brush', pts.map(([x, y, w]) => ({ x, y, w })), tone, color, detail, dryness !== undefined ? { dryness } : {});
  }
  dry(pts: WPt[], tone = 0.6, color?: string, detail = true) {
    this.push('dry', pts.map(([x, y, w]) => ({ x, y, w })), tone, color, detail, { dryness: 0.6 });
  }
  line(pts: Pt[], w = 0.7, tone = 0.7, color?: string, detail = true) {
    this.push('line', pts.map(([x, y]) => ({ x, y, w })), tone, color, detail);
  }
  dot(x: number, y: number, d: number, tone = 0.9, color?: string, detail = true) {
    this.push('dot', [{ x, y, w: d }], tone, color, detail);
  }
}

const ell = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 28): Pt[] => {
  const out: Pt[] = [];
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const m = closed ? n : n + 1;
  for (let i = 0; i < m; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
};
const arcW = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w0: number, w1: number, n = 10): WPt[] =>
  ell(cx, cy, rx, ry, a0, a1, n).map(([x, y], i) => [x, y, w0 + ((w1 - w0) * i) / n]);

const INK = PIGMENTS.ink;

interface Bust {
  skin: string; robe: string; trim: string; hair: string;
  eyes?: 'dot' | 'smile' | 'lady' | 'old' | 'fierce';
  blush?: number;
  /** head centre & radius */
  hx?: number; hy?: number; hr?: number;
  /** shoulder half-width */
  sw?: number;
  hairCap?: boolean;
  bun?: boolean;
}

/** The shared bust: robe, crossed collar, face, hair cap, eyes. */
function bust(p: P, b: Bust): void {
  const hx = b.hx ?? 50, hy = b.hy ?? 52, hr = b.hr ?? 13;
  const sw = b.sw ?? 30;
  const ny = hy + hr + 2;
  // robe
  const robe: Pt[] = [[hx - 7, ny], [hx - sw * 0.55, ny + 5], [hx - sw * 0.85, ny + 11], [hx - sw, ny + 26], [hx - sw - 4, 124], [hx + sw + 4, 124], [hx + sw, ny + 26], [hx + sw * 0.85, ny + 11], [hx + sw * 0.55, ny + 5], [hx + 7, ny]];
  p.fill(b.robe, robe, 0.92, 0.5);
  p.brush([[hx - 7, ny + 1, 1.8], [hx - sw * 0.6, ny + 5.5, 2.2], [hx - sw * 0.9, ny + 13, 1.8], [hx - sw - 1.5, ny + 32, 1.2], [hx - sw - 3.5, 120, 0.5]], 0.8);
  p.brush([[hx + 7, ny + 1, 1.8], [hx + sw * 0.6, ny + 5.5, 2.2], [hx + sw * 0.9, ny + 13, 1.8], [hx + sw + 1.5, ny + 32, 1.2], [hx + sw + 3.5, 120, 0.5]], 0.8);
  // crossed collar (left over right)
  p.brush([[hx - 6, ny, 2.6], [hx + 1, ny + 12, 2.8], [hx + 8, ny + 24, 2]], 0.9, b.trim);
  p.brush([[hx + 6, ny, 2.4], [hx + 1.5, ny + 8, 2]], 0.9, b.trim);
  // neck & face
  p.fill(b.skin, [[hx - 4.5, hy + hr - 4], [hx + 4.5, hy + hr - 4], [hx + 4, ny + 2], [hx - 4, ny + 2]], 0.95, 0.4);
  p.fill(b.skin, ell(hx, hy, hr, hr * 1.06), 0.95, 0.5);
  p.brush(arcW(hx, hy, hr, hr * 1.06, Math.PI * 0.12, Math.PI * 0.88, 0.6, 0.4, 12), 0.55);
  if (b.hairCap !== false) {
    // hair: the upper skull, with a soft parting at the brow
    const cap: Pt[] = [...ell(hx, hy - 0.5, hr + 1, hr * 1.1 + 0.5, Math.PI * 1.02, Math.PI * 1.98, 16), [hx + hr * 0.82, hy - 2], [hx + 4, hy - hr * 0.55], [hx, hy - hr * 0.45], [hx - 4, hy - hr * 0.55], [hx - hr * 0.82, hy - 2]];
    p.fill(b.hair, cap, 0.95, 0.5);
    if (b.bun !== false) p.dot(hx, hy - hr - 5, 10, 0.95, b.hair, false);
  }
  face(p, hx, hy, hr, b.eyes ?? 'dot', b.blush ?? 0.25);
}

function face(p: P, hx: number, hy: number, hr: number, eyes: NonNullable<Bust['eyes']>, blush: number): void {
  const ex = hr * 0.36, ey = hy + hr * 0.12;
  for (const sx of [-1, 1]) {
    const x = hx + ex * sx;
    if (eyes === 'smile') p.brush([[x - 2.2, ey, 0.6], [x, ey - 1.6, 1.0], [x + 2.2, ey, 0.6]], 0.9);
    else if (eyes === 'fierce') {
      p.brush([[x - 2.6 * sx, ey + 0.8, 0.7], [x + 2.4 * sx, ey - 1.2, 1.1]], 0.95);
      p.brush([[x - 3.5 * sx, ey - 3, 1.6], [x + 3.2 * sx, ey - 6.2, 0.6]], 0.95);
    } else {
      p.dot(x, ey, eyes === 'old' ? 1.8 : 2.5, 0.95);
      if (eyes === 'lady') p.brush([[x - 1.5 * sx, ey - 1.8, 0.4], [x + 2.4 * sx, ey - 2.4, 0.8]], 0.8);
      if (eyes === 'old') p.brush([[x - 3 * sx, ey - 3.4, 1.2], [x + 2.5 * sx, ey - 2.4, 0.5]], 0.5, '#9a958b');
    }
    if (blush > 0) p.dot(hx + hr * 0.62 * sx, ey + 4.2, 6, blush, '#e08f85');
  }
}

// ---------------------------------------------------------------------------------- the cast

const conical = (p: P, cx: number, by: number, r: number, ht: number, color: string) => {
  p.fill(color, [[cx - r, by], [cx - r * 0.3, by - ht * 0.72], [cx, by - ht], [cx + r * 0.3, by - ht * 0.72], [cx + r, by], [cx + r * 0.9, by + 2.4], [cx - r * 0.9, by + 2.4]], 0.92, 0.4);
  p.brush([[cx - r - 1, by + 0.8, 1.3], [cx, by + 2.6, 1.8], [cx + r + 1, by + 0.8, 1.1]], 0.85);
  p.brush([[cx, by - ht, 1.2], [cx - r * 0.35, by - ht * 0.65, 1.0], [cx - r, by, 0.5]], 0.6);
  for (let i = -3; i <= 3; i++) if (i) p.line([[cx, by - ht + 1], [cx + (r * i) / 3.6, by + 1]], 0.35, 0.3);
};

const PAINT: Record<string, (p: P) => void> = {
  scholar(p) {
    // book box behind the shoulder
    p.fill('#d6b273', [[62, 58], [83, 60], [84, 98], [63, 98]], 0.9, 0.4);
    for (let x = 65; x < 83; x += 3.2) p.line([[x, 60], [x + 0.5, 97]], 0.35, 0.35);
    p.brush([[57, 55, 1.4], [72, 50, 2], [89, 56, 1.2]], 0.8, '#6b4a2a');
    p.dot(68, 55, 5, 0.9, '#efe6d0', false); p.dot(76, 54, 4.5, 0.9, '#c2553f', false);
    bust(p, { skin: '#f3d6b8', robe: '#f3e9d6', trim: '#2f5f78', hair: INK, blush: 0.3 });
    p.brush([[40, 33, 0.6], [50, 34, 1], [60, 32, 0.6]], 0.9, PIGMENTS.malachite, true);
    // hair ribbons
    p.brush([[46, 37, 2.2], [40, 44, 2], [33, 50, 1.4], [30, 58, 0.5]], 0.75, '#2f5f78');
    p.brush([[53, 36, 1.8], [58, 30, 1.4], [64, 29, 0.5]], 0.6, '#2f5f78');
  },
  gardener(p) {
    bust(p, { skin: '#ecc39b', robe: '#3e6485', trim: '#2b3f55', hair: '#2a2420', bun: false, blush: 0.38 });
    p.fill('#ead6a8', [[41, 78], [59, 78], [60, 124], [40, 124]], 0.95, 0.4);
    p.line([[41, 78], [40, 124]], 0.6, 0.5); p.line([[59, 78], [60, 124]], 0.6, 0.5);
    p.brush([[46, 60, 0.6], [50, 61.5, 0.9], [54, 60, 0.6]], 0.8, undefined, true);
    conical(p, 50, 43, 33, 16, '#e3bf6f');
    p.fill('#5f9a5a', [[38, 42.5], [39, 38], [61, 38], [62, 42.5]], 0.85, 0.3);
    // the watering can
    p.fill('#c47c3e', ell(78, 104, 10, 9), 0.92, 0.4);
    p.brush([[86, 104, 2.2], [93, 96, 1.8], [97, 90, 1.4]], 0.9, '#c47c3e');
    p.brush(arcW(78, 96, 7, 7, Math.PI, Math.PI * 2, 1.4, 1.4), 0.8, '#7d4f2a');
    p.brush(arcW(78, 104, 10, 9, Math.PI * 0.1, Math.PI * 0.9, 0.8, 0.8), 0.7);
  },
  fisher(p) {
    // the rod over the shoulder, its line and float
    p.brush([[62, 110, 2.2], [76, 60, 1.6], [90, 14, 0.7]], 0.85, '#8f7b48');
    p.line([[90, 14], [93, 40], [94, 58]], 0.35, 0.5);
    p.dot(94, 59, 3, 0.9, PIGMENTS.cinnabar);
    bust(p, { skin: '#e6bd95', robe: '#a58a52', trim: '#6e5230', hair: '#efe9dd', eyes: 'old', blush: 0.22, bun: false });
    // the straw cape: dry-brush straws
    for (let i = 0; i < 16; i++) {
      const x = 22 + i * 3.8;
      p.dry([[x + (i % 2) * 1.5, 74 + Math.abs(i - 7.5) * 0.8, 1.6], [x - 1 + (i % 3), 102, 1.2], [x + (i % 2), 122, 0.6]], 0.45, '#5b4f33');
    }
    // the white beard, brows, moustache
    p.fill('#f3f0e8', [[42, 60], [58, 60], [57, 72], [53, 84], [50, 92], [47, 84], [43, 72]], 0.98, 0.4);
    for (const x of [45, 48, 51, 54]) p.line([[x, 63], [x + (50 - x) * 0.3, 86]], 0.35, 0.35);
    p.brush([[42, 60.5, 1.2], [46, 59, 2], [50, 60, 1], [54, 59, 2], [58, 60.5, 1.2]], 0.35);
    conical(p, 50, 42, 36, 20, '#d6b56c');
    p.dot(50, 21.5, 3, 0.9, '#5b4a32', false);
  },
  musician(p) {
    // the qin across her back
    p.brush([[16, 70, 8], [52, 92, 9], [90, 116, 7]], 0.95, '#3b2b25');
    p.line([[18, 68], [90, 113]], 0.35, 0.4, '#e9dfc8'); p.line([[17, 71], [89, 116]], 0.35, 0.4, '#e9dfc8');
    p.brush([[14, 70, 1.6], [12, 76, 1.2], [13, 81, 0.4]], 0.9, PIGMENTS.cinnabar);
    // long hair behind
    p.fill(INK, [[38, 48], [62, 48], [66, 76], [60, 94], [40, 94], [34, 76]], 0.9, 0.5);
    bust(p, { skin: '#f7dcc6', robe: '#f8ebdc', trim: '#3f7f7a', hair: INK, eyes: 'lady', blush: 0.32, sw: 26 });
    p.fill(INK, ell(50, 30, 8, 6), 0.95, 0.4);
    p.brush(arcW(52, 22, 6, 6, 0, Math.PI * 2, 2.6, 2.6, 16), 0.95);
    p.dot(40, 38, 4, 0.9, '#e0707a');
    // 步摇
    p.brush([[57, 33, 0.8], [66, 27, 0.8]], 0.9, '#c8a24e');
    p.line([[66, 27], [66, 36]], 0.3, 0.6, '#c8a24e');
    p.dot(66, 37, 2.2, 0.9, '#7fb39a'); p.dot(66, 40.5, 1.8, 0.9, '#c8a24e');
  },
  swordsman(p) {
    // the sword over the right shoulder
    p.brush([[58, 92, 2.6], [74, 60, 2.6], [82, 44, 2.2]], 0.95, '#2a1f1a');
    p.brush([[73, 57, 1.2], [80, 62, 1.2]], 0.95, '#b08a4a');
    p.brush([[82, 44, 1.4], [84, 48, 1.2], [83, 54, 0.4]], 0.9, PIGMENTS.cinnabar);
    bust(p, { skin: '#eccdab', robe: '#3d302a', trim: '#a8322a', hair: INK, eyes: 'fierce', blush: 0.14, bun: false });
    // veil hanging from the brim
    p.wash(undefined, [[18, 43], [82, 43], [80, 66], [72, 64], [70, 44], [30, 44], [28, 64], [20, 66]], 0.14);
    for (const x of [22, 27, 73, 78]) p.line([[x, 44], [x - 0.5, 64]], 0.3, 0.25);
    conical(p, 50, 43, 32, 15, '#c9a86a');
    p.dot(50, 28, 2.6, 0.9, '#5b4a32', false);
  },
  taoist(p) {
    // the fly-whisk
    p.brush([[74, 120, 1.6], [79, 96, 1.4]], 0.9, '#7b5a3a');
    p.fill('#f3f0e8', [[78, 94], [82, 94], [90, 104], [93, 118], [86, 110], [80, 104]], 0.95, 0.5);
    for (let i = 0; i < 4; i++) p.line([[79 + i, 95], [85 + i * 2, 110 + i * 2]], 0.3, 0.35);
    bust(p, { skin: '#f8dcc2', robe: '#e8b660', trim: '#3a2c24', hair: INK, blush: 0.45, hr: 15, hy: 56, sw: 25, bun: false });
    for (const sx of [-1, 1]) {
      p.dot(50 + 12 * sx, 38, 10, 0.95, INK, false);
      p.brush([[50 + 8 * sx, 43, 1.4], [50 + 16 * sx, 46, 1.2], [50 + 19 * sx, 52, 0.4]], 0.9, PIGMENTS.cinnabar);
    }
    p.dot(50, 63.5, 2, 0.7, '#9b3a32');
  },
  painter(p) {
    // scroll tube behind
    p.brush([[20, 104, 6], [50, 80, 6], [84, 58, 5.5]], 0.9, '#7d4f36');
    p.dot(84, 58, 7, 0.95, '#3b2a24', false);
    bust(p, { skin: '#f2d4b4', robe: '#e9d7b3', trim: '#6e5238', hair: INK, blush: 0.26, bun: false });
    // ink spatters on the robe
    for (const [x, y, d, c] of [[34, 104, 3.4, INK], [62, 112, 2.6, INK], [70, 96, 2, PIGMENTS.indigo], [44, 116, 1.8, PIGMENTS.rouge]] as const) p.dot(x, y, d, 0.8, c);
    // 幞头: a black cap with a raised back, two ties blowing
    p.fill(INK, [...ell(50, 49, 14.5, 15, Math.PI * 1.05, Math.PI * 1.95, 12), [62, 46], [38, 46]], 0.95, 0.4);
    p.fill(INK, ell(51, 34, 8, 6), 0.95, 0.4);
    p.brush([[60, 36, 2.2], [70, 34, 2], [80, 38, 1.4], [88, 36, 0.5]], 0.9);
    p.brush([[60, 38, 2], [70, 42, 1.8], [78, 48, 0.5]], 0.85);
    // a brush behind the ear
    p.brush([[33, 44, 1.2], [38, 56, 1.2]], 0.9, '#c9a870');
    p.dot(33, 43.5, 2.2, 0.95);
  },
  player(p) {
    // the go board slung on his back (its corners over both shoulders), the stone pot tied on top
    const B: Pt[] = [[14, 70], [70, 56], [86, 104], [28, 118]];
    const at = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    p.fill('#d7b273', B, 0.92, 0.4);
    for (let i = 1; i < 8; i++) { const k = i / 8; p.line([at(B[0], B[1], k), at(B[3], B[2], k)], 0.3, 0.45); p.line([at(B[0], B[3], k), at(B[1], B[2], k)], 0.3, 0.45); }
    p.dot(72, 53, 6.5, 0.95, '#8a5a32', false);
    p.brush(arcW(72, 53, 6.5, 6.5, Math.PI * 1.1, Math.PI * 1.9, 0.6, 0.6), 0.6);
    bust(p, { skin: '#f0d3b4', robe: '#739c8c', trim: '#2e3a35', hair: INK, blush: 0.2, bun: false });
    // moustache, goatee
    p.brush([[49, 60, 0.8], [44, 61, 1.2], [41, 64, 0.4]], 0.9);
    p.brush([[51, 60, 0.8], [56, 61, 1.2], [59, 64, 0.4]], 0.9);
    p.brush([[50, 65, 1.6], [50, 71, 1.2], [49.5, 76, 0.3]], 0.9);
    // 纶巾
    p.fill('#2e3a35', [[36, 46], [37, 34], [42, 28], [58, 28], [63, 34], [64, 46]], 0.95, 0.4);
    // the fan
    p.fill('#f2ead8', [[66, 106], [60, 86], [66, 80], [76, 78], [86, 82], [90, 90], [72, 108]], 0.98, 0.4);
    p.wash(PIGMENTS.indigo, [[63, 88], [70, 83], [74, 88], [80, 82], [88, 89], [80, 96], [68, 98]], 0.3, true);
    p.brush([[66, 106, 0.9], [60, 86, 0.8], [66, 80, 0.8], [76, 78, 0.8], [86, 82, 0.8], [90, 90, 0.8], [72, 108, 0.9]], 0.75);
  },
  poet(p) {
    // the moon he is toasting: a pale wash up over his shoulder, well inside the fan
    p.wash(PIGMENTS.indigo, ell(25, 29, 11, 11, 0, Math.PI * 2, 24), 0.07, true);
    p.fill('#f8f3e6', ell(25, 29, 9, 9), 0.55, 0.5, true);
    // the gourd
    p.fill('#cf9446', ell(80, 108, 8, 9), 0.95, 0.4);
    p.fill('#cf9446', ell(80, 95, 5, 5.5), 0.95, 0.4);
    p.brush([[76, 101, 1.4], [84, 101, 1.4]], 0.9, PIGMENTS.cinnabar);
    p.brush(arcW(80, 108, 8, 9, Math.PI * 0.1, Math.PI * 0.9, 0.6, 0.6), 0.6);
    bust(p, { skin: '#f2d0b0', robe: '#f6ecda', trim: '#3f79a0', hair: INK, eyes: 'smile', blush: 0.5, bun: false });
    p.fill(INK, ell(50, 35, 6, 7), 0.95, 0.4);
    p.brush([[46, 38, 2], [38, 44, 2.2], [30, 54, 1.6], [26, 66, 0.4]], 0.8, '#4a88b2');
    p.brush([[49, 60, 0.7], [45, 60.5, 1], [42, 63, 0.3]], 0.9); p.brush([[51, 60, 0.7], [55, 60.5, 1], [58, 63, 0.3]], 0.9);
    p.brush([[50, 64.5, 1.2], [50, 69, 0.3]], 0.9);
    p.brush([[46, 62.5, 0.4], [50, 63.5, 0.8], [54, 62.5, 0.4]], 0.6, '#9b3a32', true);
  },
  guan(p) {
    // the glaive: shaft, crescent blade, dragon mouth, tassel
    p.brush([[14, 124, 2.4], [14, 60, 2.4], [14, 22, 2.2]], 0.95, '#5b2c24');
    p.fill('#d4d8d4', [[14, 24], [22, 20], [28, 10], [27, 2], [22, 6], [20, 14], [15, 18]], 0.95, 0.4);
    p.brush([[14, 24, 0.6], [22, 20, 0.8], [28, 10, 0.8], [27, 2, 0.5]], 0.8);
    p.dot(14, 26, 6, 0.95, '#2f7552', false);
    p.brush([[16, 30, 1.8], [19, 36, 1.4], [18, 42, 0.4]], 0.9, PIGMENTS.cinnabar);
    bust(p, { skin: '#bb4632', robe: '#2f7552', trim: '#cda146', hair: INK, eyes: 'fierce', blush: 0, sw: 36, hairCap: false });
    // pauldrons
    for (const sx of [-1, 1]) p.fill('#cda146', ell(50 + 30 * sx, 78, 11, 6, 0, Math.PI * 2, 16), 0.9, 0.4);
    // 巾帻 and its gold band
    p.fill('#2f7552', [...ell(50, 51, 14.5, 15.5, Math.PI * 1.02, Math.PI * 1.98, 14), [63, 46], [37, 46]], 0.95, 0.4);
    p.dot(50, 34, 9, 0.95, '#2f7552', false);
    p.brush([[40, 44, 1.6], [50, 42.5, 2], [60, 44, 1.6]], 0.95, '#cda146');
    // the long beard
    p.fill(INK, [[42, 62], [50, 64], [58, 62], [60, 74], [57, 92], [52, 110], [50, 116], [47, 104], [43, 88], [40, 72]], 0.95, 0.6);
    p.brush([[49, 59.5, 1], [43, 61, 1.4], [38, 66, 0.4]], 0.95); p.brush([[51, 59.5, 1], [57, 61, 1.4], [62, 66, 0.4]], 0.95);
    for (const sx of [-1, 1]) p.brush([[50 + 10 * sx, 60, 1.2], [50 + 13 * sx, 72, 1.4], [50 + 12 * sx, 86, 0.4]], 0.9);
  },
  change(p) {
    // a great pale moon behind her
    p.wash(PIGMENTS.indigo, ell(50, 50, 38, 38, 0, Math.PI * 2, 36), 0.08, true);
    p.fill('#faf6ec', ell(50, 50, 34, 34, 0, Math.PI * 2, 36), 0.9, 1.2, true);
    // 披帛 sweeping round her
    p.brush([[8, 112, 1.2], [14, 94, 3], [24, 78, 3.6], [38, 72, 3], [50, 71, 2.6], [64, 73, 3], [78, 80, 3.6], [88, 70, 3], [94, 54, 1.2]], 0.55, '#a8d4c0');
    // long hair
    p.fill(INK, [[38, 48], [62, 48], [64, 76], [58, 92], [42, 92], [36, 76]], 0.9, 0.5);
    bust(p, { skin: '#f9e3d2', robe: '#fbf0e2', trim: '#d2a95a', hair: INK, eyes: 'lady', blush: 0.3, sw: 25, bun: false });
    // 飞仙髻: two tall loops
    p.fill(INK, ell(50, 34, 7, 5), 0.95, 0.4);
    p.brush(arcW(44, 22, 5.5, 8, 0, Math.PI * 2, 2.4, 2.4, 16), 0.95);
    p.brush(arcW(56, 22, 5.5, 8, 0, Math.PI * 2, 2.4, 2.4, 16), 0.95);
    for (const [x, y] of [[41, 36], [59, 36], [50, 30]]) p.dot(x, y, 2.6, 0.95, '#f4efe4');
    p.dot(50, 33, 3.4, 0.8, '#eaa0ae');
  },
  cat(p) {
    const G = '#e0924a', D = '#b8632a', C = '#f6e6c8';
    // tail curling round
    p.brush([[80, 120, 5], [90, 100, 5], [86, 82, 4.2], [76, 78, 3]], 0.95, G);
    p.brush([[88, 106, 1.8], [91, 104, 1.8]], 0.9, D, true); p.brush([[88, 92, 1.8], [91, 90, 1.8]], 0.9, D, true);
    // body
    p.fill(G, ell(50, 104, 30, 22), 0.95, 0.5);
    p.fill(C, ell(50, 110, 16, 16), 0.95, 0.6);
    for (const x of [30, 36, 64, 70]) p.brush([[x, 90, 1.6], [x + (x < 50 ? -2 : 2), 98, 1.2], [x + (x < 50 ? -3 : 3), 104, 0.3]], 0.8, D);
    // head
    for (const sx of [-1, 1]) {
      p.fill(G, [[50 + 19 * sx, 44], [50 + 22 * sx, 22], [50 + 7 * sx, 36]], 0.95, 0.4);
      p.fill('#e7a3a0', [[50 + 18 * sx, 40], [50 + 20 * sx, 27], [50 + 10 * sx, 36]], 0.9, 0.4, true);
    }
    p.fill(G, ell(50, 58, 24, 20), 0.95, 0.5);
    p.fill(C, ell(50, 67, 12, 8), 0.95, 0.5);
    p.brush(arcW(50, 58, 24, 20, Math.PI * 0.05, Math.PI * 0.95, 0.7, 0.7, 14), 0.5);
    // forehead M
    for (const [x, a] of [[50, 0], [44, -0.3], [56, 0.3]] as const) p.brush([[x, 40, 1.6], [x + a * 6, 48, 0.4]], 0.85, D);
    // smug half-lidded eyes
    for (const sx of [-1, 1]) {
      p.brush([[50 + 5 * sx, 57, 0.6], [50 + 9 * sx, 56, 1.4], [50 + 13 * sx, 57, 0.6]], 0.95, INK, true);
      p.dot(50 + 9 * sx, 58, 2.6, 0.95);
      for (let i = 0; i < 3; i++) p.line([[50 + 13 * sx, 66 + i * 2], [50 + 29 * sx, 63 + i * 4]], 0.4, 0.45);
    }
    p.dot(50, 63, 3, 0.9, '#d98080');
    p.line([[46, 67], [48, 68.5], [50, 66.5], [52, 68.5], [54, 67]], 0.45, 0.7);
  },
  rabbit(p) {
    const W = '#f7f4ee', pink = '#eab1b3';
    p.fill(W, ell(50, 102, 26, 22), 0.95, 0.5);
    p.brush(arcW(50, 102, 26, 22, Math.PI * 0.95, Math.PI * 2.05, 0.8, 0.8, 16), 0.45);
    p.dot(76, 112, 9, 0.95, W, false);
    // ears
    for (const sx of [-1, 1]) {
      const ex = 50 + 8 * sx;
      p.fill(W, [[ex - 5, 52], [ex - 6 + sx * 2, 30], [ex - 2 + sx * 4, 12], [ex + 3 + sx * 4, 14], [ex + 5, 34], [ex + 4, 52]], 0.95, 0.5);
      p.fill(pink, [[ex - 2, 48], [ex - 2.5 + sx * 2, 30], [ex + sx * 4, 17], [ex + 2 + sx * 3, 30], [ex + 2, 48]], 0.8, 0.8, true);
      p.brush([[ex - 5, 52, 0.6], [ex - 6 + sx * 2, 30, 0.8], [ex - 2 + sx * 4, 12, 0.6], [ex + 3 + sx * 4, 14, 0.6], [ex + 5, 34, 0.7]], 0.45);
    }
    p.fill(W, ell(50, 64, 18, 15.5), 0.95, 0.5);
    p.brush(arcW(50, 64, 18, 15.5, Math.PI * 0.02, Math.PI * 0.98, 0.7, 0.7, 14), 0.45);
    for (const sx of [-1, 1]) { p.dot(50 + 7 * sx, 63, 3.2, 0.95, '#a8323a'); p.dot(50 + 12 * sx, 69, 5.5, 0.22, '#e08f85'); }
    p.dot(50, 69, 2.4, 0.9, pink);
    // jade tag on a red cord
    p.brush(arcW(50, 78, 12, 5, Math.PI * 0.1, Math.PI * 0.9, 0.6, 0.6), 0.9, PIGMENTS.cinnabar);
    p.dot(50, 84, 5, 0.9, '#7fb39a');
  },
};

// ---------------------------------------------------------------------------------- painting

const cache = new Map<string, HTMLCanvasElement>();
let sealCache: HTMLCanvasElement | null = null;

function render(id: string, locked: boolean, W: number, H: number, seal: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return c;
  const R = Math.min(W, H) / 2 - Math.max(1, Math.min(W, H) * 0.015);
  const cx = W / 2, cy = H / 2;
  // the round fan of paper
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  fillPaper(g, W, H, 7 + id.length);
  if (locked) { g.fillStyle = 'rgba(40,34,26,0.06)'; g.fillRect(0, 0, W, H); }
  // figure: fit the 100 × 120 drawing into the disc
  const k = (R * 2) / 108;
  const ox = cx - 50 * k, oy = cy - 60 * k + R * 0.05;
  const p = new P(locked);
  (PAINT[id] ?? PAINT.scholar)(p);
  if (!locked) {
    g.setTransform(k, 0, 0, k, ox, oy);
    for (const { s } of p.strokes) paintStroke(g, s);
    g.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    // one flat pale silhouette: paint solid ink off-screen, then lay it down thin
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const o = off.getContext('2d');
    if (o) {
      o.setTransform(k, 0, 0, k, ox, oy);
      for (const { s } of p.strokes) paintStroke(o, { ...s, color: undefined, tone: 0.97, kind: s.kind === 'dry' ? 'brush' : s.kind });
      g.globalAlpha = 0.2;
      g.drawImage(off, 0, 0);
      g.globalAlpha = 1;
    }
  }
  g.restore();
  // the mount: a fine ring
  g.strokeStyle = 'rgba(27,25,22,0.28)';
  g.lineWidth = Math.max(1, R * 0.012);
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  if (locked && seal) {
    // 未 — "not yet": cinnabar is rare, so only the large portrait carries it, never the tiles
    const size = Math.max(14, Math.round(R * 0.36));
    if (!sealCache || sealCache.width !== size * 2) {
      try { sealCache = makeSeal('未', { size, dpr: 2, style: 'zhu', shape: 'square', color: SEAL_RED, wear: 0.35, seed: 7 }); } catch { sealCache = null; }
    }
    if (sealCache) g.drawImage(sealCache, cx + R * 0.36, cy + R * 0.36, size, size);
  }
  return c;
}

/**
 * A small painted portrait (2D canvas, ink style) for cards outside the 3D world. A locked one
 * carries a cinnabar 「未」 seal only when `seal` is set (default: large portraits, ≥ 160 px).
 */
export function paintPortrait(canvas: HTMLCanvasElement, id: string, locked: boolean, o: { seal?: boolean } = {}): void {
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  const seal = locked && (o.seal ?? Math.min(W, H) >= 160);
  const key = `${id}|${locked ? 1 : 0}|${seal ? 1 : 0}|${W}x${H}`;
  let img = cache.get(key);
  if (!img) {
    img = render(id, locked, W, H, seal);
    if (cache.size > 64) cache.delete(cache.keys().next().value as string);
    cache.set(key, img);
  }
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.drawImage(img, 0, 0);
}
