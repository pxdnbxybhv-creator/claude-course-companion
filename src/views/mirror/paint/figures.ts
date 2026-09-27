// The 13 companions as small standing ink figures (the arena token), matched in colour to their
// painted busts (walk/characters/portrait.ts). They face right; the engine mirrors them to face left.
// Frames: 0 idle · 1, 2 walk steps (feet and sleeves swap, a slight lean) · 3 hurt (thrown back,
// eyes shut, a splash of ink). The hitbox centre (0, 0) is the robe's middle.
import type { CharacterId } from '../../../data/characters';
import { B, ell, arcW, spine, type Pt, type Spec } from './kit';
import { CHAR_LOOK, CINNABAR, INK, PAPER, type CharLook } from './palette';

type F = 0 | 1 | 2 | 3;
const BOX: Spec['box'] = [-22, -34, 24, 20];

interface Opt { robeW?: number; hem?: number; head?: number; lean?: number }

/** A pool of moonlight under the companion: the one pale thing among 焦墨 enemies. */
function standing(b: B, y: number, accent: string) {
  b.flat((g) => { g.fillStyle = '#f6f7fb'; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(0, y + 3, 13, 4.2, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = accent === INK ? '#6f8ea6' : accent; g.globalAlpha = 0.7; g.lineWidth = 1; g.beginPath(); g.ellipse(0, y + 3, 13, 4.2, 0, 0, Math.PI * 2); g.stroke(); });
}
/** Feet, robe, collar, head; returns the head centre. */
function body(b: B, L: CharLook, v: F, o: Opt = {}): { hx: number; hy: number; hr: number; lean: number } {
  const hurt = v === 3;
  const lean = hurt ? -3 : v === 1 ? 1.2 : v === 2 ? 1.8 : 0;
  const rw = o.robeW ?? 9, hem = o.hem ?? 12, hr = o.head ?? 7.2;
  standing(b, hem, L.accent);
  // feet
  const st = v === 1 ? 3 : v === 2 ? -3 : 0;
  b.dot(-3 + st, hem + 2, 4, 0.95, INK); b.dot(4 - st, hem + 2, 4, 0.95, INK);
  // robe
  const top = -5;
  b.fill(L.robe, [[-rw * 0.55 + lean, top], [rw * 0.55 + lean, top], [rw + 1, hem], [rw * 0.2, hem + 1.5], [-rw - 1, hem]], 0.95, 0.5);
  b.brush([[-rw * 0.55 + lean, top + 0.5, 1.2], [-rw - 1.2, hem + 0.5, 0.8]], 0.8, INK);
  b.brush([[rw * 0.55 + lean, top + 0.5, 1.2], [rw + 1.2, hem + 0.5, 0.8]], 0.8, INK);
  b.brush([[-rw - 1, hem, 1], [rw + 1, hem, 1]], 0.6, L.trim);
  // sleeves swing
  const sw = hurt ? -4 : v === 1 ? 2 : v === 2 ? -2 : 0;
  b.brush([[rw * 0.5 + lean, top + 2, 3.4], [rw + 2 + sw * 0.4, top + 8, 3.2], [rw + 1 + sw, top + 11, 2.4]], 0.92, L.robe);
  b.brush([[rw * 0.5 + lean, top + 2, 0.8], [rw + 2.5 + sw * 0.4, top + 8, 0.8], [rw + 2 + sw, top + 11.5, 0.5]], 0.6, INK);
  // crossed collar
  b.brush([[-2 + lean, top, 1.6], [2 + lean, top + 6, 1.8], [4 + lean, top + 10, 1.2]], 0.9, L.trim);
  // head
  const hx = 1 + lean * 1.4, hy = top - hr + 0.5;
  b.fill(L.skin, ell(hx, hy, hr, hr * 1.04, 0, Math.PI * 2, 18), 0.96, 0.4);
  b.brush(arcW(hx, hy, hr, hr * 1.04, Math.PI * 0.15, Math.PI * 0.85, 0.5, 0.3, 8), 0.5, INK);
  return { hx, hy, hr, lean };
}
/** Eyes looking right (3/4 view); shut on the hurt frame. */
function face(b: B, hx: number, hy: number, hr: number, v: F, kind: 'dot' | 'fierce' | 'lady' | 'smile' | 'old' = 'dot', blush = 0.3) {
  const e = [hx + hr * 0.12, hx + hr * 0.62], y = hy + hr * 0.1;
  if (v === 3) { for (const x of e) b.line([[x - 1.2, y - 1], [x + 1.2, y + 0.4]], 0.6, 0.95, INK); b.line([[e[1] - 1, y + 3.5], [e[1] + 1.2, y + 3]], 0.5, 0.8, INK); return; }
  for (const x of e) {
    if (kind === 'smile') b.brush([[x - 1.2, y, 0.4], [x, y - 1, 0.7], [x + 1.2, y, 0.4]], 0.95, INK);
    else if (kind === 'fierce') { b.disc(x, y, 1, '#111'); b.brush([[x - 1.8, y - 2.6, 0.9], [x + 1.4, y - 1.6, 0.5]], 0.95, INK); }
    else b.disc(x, y, kind === 'old' ? 0.75 : 0.95, '#111');
  }
  if (blush > 0) b.dot(hx + hr * 0.55, y + 2.4, 3, blush, '#e08f85');
}
/** Hair as a cap on the back of the head (the figure faces right), with an optional bun. */
function hair(b: B, hx: number, hy: number, hr: number, color: string, bun = true) {
  b.fill(color, [...ell(hx - 0.8, hy - 0.4, hr + 0.6, hr * 1.06, Math.PI * 0.62, Math.PI * 1.9, 12), [hx + hr * 0.2, hy - hr * 0.35], [hx - hr * 0.3, hy + hr * 0.1]], 0.95, 0.4);
  if (bun) b.dot(hx - hr * 0.5, hy - hr - 1.8, 5.4, 0.95, color);
}
function hurtInk(b: B, v: F) {
  if (v !== 3) return;
  b.dot(-10, -4, 3, 0.7, INK); b.dot(-13, 2, 1.8, 0.6, INK); b.dot(-8, 8, 1.2, 0.5, INK);
}
function hat(b: B, cx: number, cy: number, r: number, h: number, color: string) {
  b.fill(color, [[cx - r, cy], [cx - r * 0.3, cy - h * 0.7], [cx, cy - h], [cx + r * 0.3, cy - h * 0.7], [cx + r, cy], [cx + r * 0.85, cy + 1.6], [cx - r * 0.85, cy + 1.6]], 0.94, 0.4);
  b.brush([[cx - r - 0.6, cy + 0.6, 1], [cx, cy + 1.8, 1.3], [cx + r + 0.6, cy + 0.6, 0.8]], 0.85, INK);
  for (let i = -2; i <= 2; i++) if (i) b.line([[cx, cy - h + 0.8], [cx + (r * i) / 2.6, cy + 0.6]], 0.3, 0.3, INK);
}

const fig = (paint: (b: B, v: F) => void): Spec => ({ box: BOX, n: 4, halo: 'paper', paint: (b, v) => paint(b, v as F) });

export const CHAR_SPECS: Record<CharacterId, Spec> = {
  scholar: fig((b, v) => {
    const L = CHAR_LOOK.scholar;
    b.fill('#d6b273', [[-13, -6], [-5, -6], [-5, 6], [-13, 6]], 0.9, 0.3);
    for (let x = -12; x < -5; x += 2.2) b.line([[x, -5.5], [x, 5.5]], 0.3, 0.35, INK);
    const { hx, hy, hr } = body(b, L, v);
    hair(b, hx, hy, hr, L.hair);
    b.brush([[hx - hr * 0.4, hy - hr * 0.9, 1.4], [hx - hr - 4, hy - 2, 1.2], [hx - hr - 6, hy + 4, 0.4]], 0.75, L.trim);
    b.brush([[hx + hr * 0.2, hy - hr - 1, 0.8], [hx + hr * 0.9, hy - hr - 3.4, 0.8]], 0.95, '#c9a870');
    face(b, hx, hy, hr, v);
    b.brush(spine(10, 2, 15, -3, 2.2, 2.2), 0.9, '#efe6d0'); b.line([[10, 2], [15, -3]], 0.4, 0.6, INK);
    hurtInk(b, v);
  }),
  gardener: fig((b, v) => {
    const L = CHAR_LOOK.gardener;
    b.brush(spine(-12, 10, 8, -22, 1.8, 1.4), 0.9, '#8f6b3a');
    b.fill('#9aa0a0', [[6, -24], [12, -22], [9, -18]], 0.9, 0.2);
    const { hx, hy, hr } = body(b, L, v);
    b.fill('#ead6a8', [[-2, -2], [5, -2], [6, 12], [-3, 12]], 0.9, 0.3);
    hair(b, hx, hy, hr, L.hair, false);
    face(b, hx, hy, hr, v, 'dot', 0.38);
    hat(b, hx, hy - hr * 0.35, 13, 7, '#e3bf6f');
    b.fill('#5f9a5a', [[hx - 6, hy - hr * 0.35 - 1], [hx - 5, hy - hr * 0.35 - 3.5], [hx + 5, hy - hr * 0.35 - 3.5], [hx + 6, hy - hr * 0.35 - 1]], 0.85, 0.2);
    hurtInk(b, v);
  }),
  fisher: fig((b, v) => {
    const L = CHAR_LOOK.fisher;
    b.brush(spine(-10, 12, 14, -30, 1.6, 0.6), 0.85, '#8f7b48');
    b.line([[14, -30], [18, -18], [18, -10]], 0.25, 0.5, INK); b.dot(18, -9.5, 2, 0.9, CINNABAR);
    const { hx, hy, hr } = body(b, L, v, { robeW: 10 });
    for (let i = 0; i < 9; i++) b.dry([[-9 + i * 2.3, -4, 1.2], [-10 + i * 2.5, 6, 1], [-10.5 + i * 2.6, 12, 0.5]], 0.45, '#5b4f33');
    hair(b, hx, hy, hr, L.hair, false);
    b.fill('#f3f0e8', [[hx + 1, hy + 3], [hx + 6, hy + 2.5], [hx + 4, hy + 9], [hx + 2, hy + 10]], 0.95, 0.3);
    face(b, hx, hy, hr, v, 'old', 0.2);
    hat(b, hx, hy - hr * 0.3, 14, 9, '#d6b56c');
    hurtInk(b, v);
  }),
  musician: fig((b, v) => {
    const L = CHAR_LOOK.musician;
    b.brush(spine(-14, 8, 10, -10, 4.2, 3.6), 0.95, '#3b2b25');
    b.line([[-13, 7], [9, -9.5]], 0.25, 0.4, '#e9dfc8');
    b.fill(INK, [[-4, -16], [2, -18], [3, -4], [-3, 2], [-7, -4]], 0.9, 0.4);
    const { hx, hy, hr } = body(b, L, v, { robeW: 8.5 });
    hair(b, hx, hy, hr, L.hair);
    b.dot(hx - hr * 0.2, hy - hr * 0.7, 2.4, 0.9, '#e0707a');
    b.brush([[hx + hr * 0.3, hy - hr * 0.9, 0.5], [hx + hr + 2, hy - hr - 1.5, 0.5]], 0.9, '#c8a24e'); b.dot(hx + hr + 2, hy - hr + 1, 1.6, 0.9, '#7fb39a');
    face(b, hx, hy, hr, v, 'lady', 0.32);
    hurtInk(b, v);
  }),
  swordsman: fig((b, v) => {
    const L = CHAR_LOOK.swordsman;
    b.brush(spine(-8, 10, 6, -12, 1.8, 1.6), 0.95, '#2a1f1a');
    b.brush([[-4, 3, 0.8], [0, 5, 0.8]], 0.95, '#b08a4a'); b.brush([[6, -12, 1], [7, -9, 0.4]], 0.9, CINNABAR);
    const { hx, hy, hr } = body(b, L, v, { robeW: 8.5 });
    b.brush([[-8, 1, 2], [9, 1, 2]], 0.9, L.accent);
    b.brush([[-8, 1, 1.4], [-11, 7, 1], [-10, 11, 0.3]], 0.8, L.accent);
    hair(b, hx, hy, hr, L.hair, false);
    face(b, hx, hy, hr, v, 'fierce', 0.12);
    b.wash(undefined, [[hx - 13, hy - 2], [hx + 13, hy - 2], [hx + 12, hy + 7], [hx + 8, hy + 6], [hx + 8, hy - 1], [hx - 8, hy - 1], [hx - 8, hy + 6], [hx - 12, hy + 7]], 0.14);
    hat(b, hx, hy - hr * 0.35, 13, 6, '#c9a86a');
    hurtInk(b, v);
  }),
  taoist: fig((b, v) => {
    const L = CHAR_LOOK.taoist;
    const { hx, hy, hr } = body(b, L, v, { robeW: 8, head: 8 });
    b.brush([[10, 8, 1], [13, -2, 0.9]], 0.9, '#7b5a3a');
    b.fill('#f3f0e8', [[12.5, -3], [15, -3], [19, 3], [20, 9], [16, 5], [13, 1]], 0.95, 0.4);
    b.fill(L.accent, [[-12, -3], [-7, -3], [-7, 7], [-12, 7]], 0.9, 0.2); b.line([[-9.5, -2], [-9.5, 6]], 0.5, 0.9, CINNABAR);
    hair(b, hx, hy, hr, L.hair, false);
    b.dot(hx - 5, hy - hr + 0.5, 6, 0.95, INK); b.dot(hx + 3, hy - hr - 0.5, 6, 0.95, INK);
    face(b, hx, hy, hr, v, 'dot', 0.45);
    hurtInk(b, v);
  }),
  painter: fig((b, v) => {
    const L = CHAR_LOOK.painter;
    const { hx, hy, hr } = body(b, L, v);
    b.fill(L.trim, [[-6, -2], [6, -2], [8, 12], [-7, 12]], 0.88, 0.3);
    for (const [x, y, d] of [[-4, 6, 2], [3, 9, 1.6], [5, 2, 1.2]] as [number, number, number][]) b.dot(x, y, d, 0.8, INK);
    // the huge brush held like a spear
    b.brush(spine(-6, 14, 16, -20, 2, 1.8), 0.95, '#c9a870');
    b.fill(INK, [[15, -19], [19, -23], [21, -28], [18, -30], [14, -26], [13, -21]], 0.95, 0.5);
    b.dot(21, -31, 2.2, 0.9, INK);
    b.fill(INK, [...ell(hx, hy - 0.6, hr + 0.6, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98, 10), [hx + hr, hy - 1], [hx - hr, hy - 1]], 0.95, 0.4);
    b.brush([[hx - hr + 1, hy - 3, 1.6], [hx - hr - 5, hy - 4, 1.4], [hx - hr - 9, hy - 2, 0.4]], 0.9, INK);
    face(b, hx, hy, hr, v, 'dot', 0.26);
    hurtInk(b, v);
  }),
  player: fig((b, v) => {
    const L = CHAR_LOOK.player;
    b.fill('#d7b273', [[-14, -4], [-4, -8], [-2, 6], [-12, 9]], 0.9, 0.3);
    for (let i = 1; i < 4; i++) b.line([[-14 + i * 2.5, -4 - i], [-12 + i * 2.5, 9 - i * 0.8]], 0.25, 0.4, INK);
    const { hx, hy, hr } = body(b, L, v);
    hair(b, hx, hy, hr, L.hair, false);
    b.fill(L.trim, [[hx - hr + 0.5, hy - 1], [hx - hr + 1, hy - hr - 1.5], [hx - 2, hy - hr - 4], [hx + 4, hy - hr - 3.5], [hx + hr - 1, hy - hr * 0.5]], 0.95, 0.3);
    b.brush([[hx + 3, hy + 4, 0.6], [hx + 3, hy + 9, 0.9], [hx + 2.6, hy + 12, 0.3]], 0.9, INK);
    face(b, hx, hy, hr, v);
    // a stone between two fingers
    b.disc(13, -2, 2.4, v === 2 ? '#f4efe4' : '#111');
    if (v === 2) b.ring(13, -2, 2.4, 0.5, INK, 0.8);
    hurtInk(b, v);
  }),
  cat: fig((b, v) => {
    const G = '#e0924a', D = '#b8632a', C = '#f6e6c8';
    const hurt = v === 3, st = v === 1 ? 2.4 : v === 2 ? -2.4 : 0;
    standing(b, 12, '#e08a3c');
    b.brush(hurt ? [[-10, 4, 3.4], [-17, -2, 3], [-19, -10, 2]] : [[-10, 4, 3.4], [-16, -4, 3], [-14, -14, 2.2], [-11, -17, 1]], 0.95, G);
    b.brush([[-16, -5, 1.2], [-17, -3, 1.2]], 0.9, D);
    for (const [x, d] of [[-7, st], [-1, -st], [5, st], [9, -st]] as Pt[]) b.dot(x + d * 0.5, 13.5, 4.6, 0.95, G);
    b.fill(G, ell(0, 5, 12, 9), 0.95, 0.5);
    b.fill(C, ell(4, 8, 6, 5), 0.95, 0.4);
    for (const x of [-7, -3]) b.brush([[x, -3, 1.2], [x - 1, 3, 0.9], [x - 1.5, 7, 0.3]], 0.8, D);
    const hx = 6 + (hurt ? -3 : 0), hy = -8;
    b.fill(G, [[hx - 8, hy - 4], [hx - 7, hy - 13], [hx - 2, hy - 7]], 0.95, 0.3);
    b.fill(G, [[hx + 2, hy - 7], [hx + 6, hy - 13], [hx + 8, hy - 4]], 0.95, 0.3);
    b.fill(G, ell(hx, hy, 9, 8), 0.95, 0.5);
    b.fill(C, ell(hx + 2, hy + 3.5, 5, 3.2), 0.95, 0.3);
    for (const [x, a] of [[hx - 1, 0], [hx - 3.5, -0.3], [hx + 1.5, 0.3]] as Pt[]) b.brush([[x, hy - 7, 1], [x + a * 4, hy - 3.5, 0.3]], 0.85, D);
    if (hurt) for (const x of [hx - 1, hx + 4]) b.line([[x - 1.2, hy - 1], [x + 1.2, hy + 0.5]], 0.6, 0.95, INK);
    else for (const x of [hx - 1, hx + 4]) { b.brush([[x - 1.6, hy, 0.4], [x, hy - 0.6, 0.9], [x + 1.6, hy, 0.4]], 0.95, INK); b.disc(x, hy + 0.5, 0.8, '#111'); }
    b.dot(hx + 2, hy + 2.5, 1.6, 0.9, '#d98080');
    for (let i = 0; i < 2; i++) b.line([[hx + 6, hy + 2 + i * 1.5], [hx + 12, hy + 1 + i * 2.5]], 0.25, 0.45, INK);
    hurtInk(b, v);
  }),
  rabbit: fig((b, v) => {
    const W = '#f7f4ee', pink = '#eab1b3';
    const hurt = v === 3, st = v === 1 ? 2.4 : v === 2 ? -2.4 : 0;
    standing(b, 12, INK);
    b.dot(-3 + st, 14, 5, 0.95, W); b.dot(4 - st, 14, 5, 0.95, W);
    b.fill(W, ell(0, 4, 10, 10), 0.96, 0.5);
    b.brush(arcW(0, 4, 10, 10, Math.PI * 0.95, Math.PI * 2.05, 0.6, 0.6, 10), 0.4, INK);
    b.dot(-10, 8, 6, 0.95, W);
    // the pestle
    b.brush(spine(8, 10, 14, -6, 3, 2.6), 0.95, '#e4efe6'); b.line([[8, 10], [14, -6]], 0.3, 0.4, INK);
    const hx = 2 + (hurt ? -3 : 0), hy = -10;
    for (const sx of [-1, 1]) {
      const ex = hx + 2.5 * sx;
      b.fill(W, [[ex - 2, hy - 4], [ex - 2.5 + sx, hy - 14], [ex + sx * 2, hy - 22], [ex + 2 + sx * 2, hy - 21], [ex + 2.2, hy - 12], [ex + 2, hy - 4]], 0.96, 0.4);
      b.fill(pink, [[ex - 0.6, hy - 6], [ex - 0.8 + sx, hy - 14], [ex + sx * 1.8, hy - 19], [ex + 1.2, hy - 12], [ex + 1, hy - 6]], 0.8, 0.5);
      b.brush([[ex - 2, hy - 4, 0.4], [ex - 2.5 + sx, hy - 14, 0.5], [ex + sx * 2, hy - 22, 0.4]], 0.4, INK);
    }
    b.fill(W, ell(hx, hy, 7.5, 6.8), 0.96, 0.4);
    b.brush(arcW(hx, hy, 7.5, 6.8, 0.1, Math.PI * 0.9, 0.5, 0.4, 8), 0.4, INK);
    if (hurt) b.line([[hx + 2, hy - 1], [hx + 4.5, hy + 0.5]], 0.6, 0.95, INK);
    else b.disc(hx + 3.4, hy - 0.4, 1.3, '#a8323a');
    b.dot(hx + 7, hy + 2, 1.4, 0.9, pink); b.dot(hx + 4.5, hy + 3, 2.6, 0.25, '#e08f85');
    b.brush(arcW(hx, hy + 6, 5, 2, 0.2, Math.PI * 0.8, 0.5, 0.5, 6), 0.9, CINNABAR); b.dot(hx, hy + 8.5, 2.4, 0.9, '#7fb39a');
    hurtInk(b, v);
  }),
  poet: fig((b, v) => {
    const L = CHAR_LOOK.poet;
    b.fill('#cf9446', ell(-9, 8, 3.6, 4.2), 0.95, 0.3); b.fill('#cf9446', ell(-9, 2.5, 2.4, 2.6), 0.95, 0.3);
    const { hx, hy, hr } = body(b, L, v, { robeW: 10 });
    b.brush([[-9, 1, 2.2], [0, 2.5, 2.4], [10, 1, 2]], 0.9, L.accent);
    b.brush([[-8, 2, 1.6], [-11, 9, 1.2], [-10, 13, 0.3]], 0.85, L.accent);
    hair(b, hx, hy, hr, L.hair);
    b.brush([[hx - hr * 0.6, hy - hr * 0.6, 1.4], [hx - hr - 4, hy + 1, 1.2], [hx - hr - 6, hy + 7, 0.3]], 0.8, '#4a88b2');
    b.brush([[hx + 2.5, hy + 3.6, 0.5], [hx + 5, hy + 4, 0.7]], 0.9, INK);
    face(b, hx, hy, hr, v, 'smile', 0.5);
    // the cup raised
    b.fill('#f4efe4', [[12, -6], [17, -6], [16, -2], [13, -2]], 0.95, 0.2); b.line([[12, -6], [17, -6], [16, -2], [13, -2], [12, -6]], 0.4, 0.8, INK);
    b.dot(14.5, -5.4, 1.6, 0.8, L.accent);
    hurtInk(b, v);
  }),
  guan: fig((b, v) => {
    const L = CHAR_LOOK.guan;
    // the glaive
    b.brush(spine(14, 16, 14, -26, 1.6, 1.5), 0.95, '#5b2c24');
    b.fill('#d4d8d4', [[14, -24], [19, -27], [23, -34], [22, -39], [18, -36], [16, -30], [13, -28]], 0.95, 0.3);
    b.brush([[14, -24, 0.4], [19, -27, 0.5], [23, -34, 0.5]], 0.8, INK);
    b.dot(14, -22.5, 3.4, 0.95, L.robe);
    b.brush([[15, -21, 1.2], [17, -17, 0.9], [16, -13, 0.3]], 0.9, CINNABAR);
    const { hx, hy, hr } = body(b, L, v, { robeW: 11 });
    for (const sx of [-1, 1]) b.fill(L.trim, ell(sx * 8, -4, 4.6, 2.6, 0, Math.PI * 2, 12), 0.9, 0.3);
    b.fill(L.robe, [...ell(hx - 0.6, hy - 0.4, hr + 0.8, hr * 1.06, Math.PI * 0.9, Math.PI * 2.02, 12), [hx + hr * 0.5, hy - hr * 0.5], [hx - hr * 0.2, hy - 2]], 0.95, 0.4);
    b.dot(hx - hr * 0.3, hy - hr - 1.2, 4.6, 0.95, L.robe);
    b.brush([[hx - hr * 0.6, hy - hr * 0.7, 1.2], [hx + hr * 0.7, hy - hr * 0.75, 1.2]], 0.95, L.trim);
    b.fill(INK, [[hx + 0.5, hy + 3], [hx + 6, hy + 3.4], [hx + 6.5, hy + 8], [hx + 4.5, hy + 15], [hx + 2.8, hy + 18], [hx + 1.4, hy + 12], [hx, hy + 6]], 0.95, 0.5);
    face(b, hx, hy, hr, v, 'fierce', 0);
    hurtInk(b, v);
  }),
  change: fig((b, v) => {
    const L = CHAR_LOOK.change;
    const sw = v === 1 ? 2 : v === 2 ? -2 : 0;
    // 披帛 streaming behind
    b.brush([[-3, -2, 1], [-12, 2 + sw, 2.4], [-18, 10 - sw, 2.2], [-22, 16, 0.6]], 0.55, '#a8d4c0');
    b.brush([[4, -1, 1], [12, 4 - sw, 2], [15, 12 + sw, 1.6], [17, 17, 0.4]], 0.5, '#a8d4c0');
    b.fill(INK, [[-4, -16], [2, -18], [2, -4], [-3, 0], [-6, -6]], 0.9, 0.4);
    const { hx, hy, hr } = body(b, L, v, { robeW: 10, hem: 13 });
    b.brush([[-10, 13, 1.4], [10, 13, 1.4]], 0.5, '#d2a95a');
    hair(b, hx, hy, hr, L.hair, false);
    b.brush(arcW(hx - 3, hy - hr - 3.5, 2.6, 3.6, 0, Math.PI * 2, 1.4, 1.4, 12), 0.95, INK);
    b.brush(arcW(hx + 2.5, hy - hr - 4, 2.6, 3.6, 0, Math.PI * 2, 1.4, 1.4, 12), 0.95, INK);
    b.dot(hx + 0.5, hy - hr - 0.5, 2, 0.9, '#eaa0ae');
    face(b, hx, hy, hr, v, 'lady', 0.3);
    hurtInk(b, v);
  }),
};

/** The companions' token ids in display order (the lab). */
export const CHAR_IDS = Object.keys(CHAR_SPECS) as CharacterId[];
export { PAPER };
