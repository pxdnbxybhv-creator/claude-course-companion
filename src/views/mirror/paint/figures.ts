// The 13 companions as small standing ink figures (the arena token), matched in colour to their
// painted busts (walk/characters/portrait.ts). They face right; the engine mirrors them to face left.
// Frames: 0 idle · 1, 2 walk steps (feet and sleeves swap, a slight lean) · 3 hurt (thrown back,
// eyes shut, a splash of ink). The hitbox centre (0, 0) is the robe's middle.
//
// m8 redraw (art.md §3, §4.1): every figure stands on paint/brushwork.ts — marks that must read are
// ≥ 1.2 u, every mass has a fill, a shade and a light, a broken 焦墨 contour, a head of r 8.4 with eyes that
// carry a glint, and every pale companion wears one mid-value mass (R7) so it stands off pale paper.
import type { CharacterId } from '../types';
import { B, ell, arcW, spine, type Pt, type Spec } from './kit';
import { CHAR_LOOK, CINNABAR, GOLD, INK, PAPER } from './palette';
import { body2, face2, hair2, hat2, hurtInk2, litOf, pool2, shadeOf, HAIR_SHEEN } from './brushwork';
import { HIDDEN_SPECS } from './hidden';

type F = 0 | 1 | 2 | 3;
const BOX: Spec['box'] = [-22, -34, 24, 20];
/** The 玉兔's warm-grey contour (a white rabbit is not drawn in ink). */
const WARM_GREY = '#5c534c';

/** A held or carried stick (a rod, a handle, a scroll): an ink edge `e` u wider under the fill. */
function rod(b: B, pts: [number, number, number][], color: string, e = 1.2, tone = 0.95) {
  b.brush(pts.map(([x, y, w]) => [x, y, w + e] as [number, number, number]), 0.92, INK);
  b.brush(pts, tone, color);
}
/** A closed shape's ink contour (1.1 u by default). */
function edge(b: B, pts: Pt[], w = 1.1, color: string = INK, tone = 0.9) {
  b.line([...pts, pts[0]], w, tone, color);
}

const fig = (paint: (b: B, v: F) => void): Spec => ({ box: BOX, n: 4, halo: 'paper', paint: (b, v) => paint(b, v as F) });

export const CHAR_SPECS: Record<CharacterId, Spec> = {
  scholar: fig((b, v) => {
    const L = CHAR_LOOK.scholar;
    // the bamboo book case on his back: 1.2 u slats, a lit half, an ink edge
    const box: Pt[] = [[-15, -8], [-5, -8], [-5, 7], [-15, 7]];
    b.fill('#c99a52', box, 0.96, 0.3);
    b.fill(litOf('#c99a52'), [[-14.4, -7.4], [-10, -7.4], [-10, 6.4], [-14.4, 6.4]], 0.7, 0.4);
    for (let x = -13.2; x < -5.5; x += 2.6) b.line([[x, -7.2], [x, 6.4]], 1.2, 0.55, '#7a5a2a');
    edge(b, box, 1.2);
    // an indigo half-robe over the pale one (R7)
    const { hx, hy, hr, handX, handY } = body2(b, L, v, { over: '#2f5f78' });
    hair2(b, hx, hy, hr, L.hair);
    b.brush([[hx - hr * 0.4, hy - hr * 0.9, 1.8], [hx - hr - 4, hy - 2, 1.5], [hx - hr - 6, hy + 4, 0.6]], 0.9, L.trim);
    // a brush behind the ear
    b.brush([[hx + hr * 0.15, hy - hr - 0.6, 1.3], [hx + hr * 0.95, hy - hr - 3.4, 1.2]], 0.97, '#c9a870');
    b.dot(hx + hr * 0.15, hy - hr - 0.6, 1.8, 0.95, INK);
    face2(b, hx, hy, hr, v);
    // a rolled scroll in the hand
    rod(b, spine(handX - 2, handY + 3, handX + 4, handY - 4, 2.8, 2.8), '#efe6d0', 1.1);
    hurtInk2(b, v);
  }),
  gardener: fig((b, v) => {
    const L = CHAR_LOOK.gardener;
    // the hoe over the shoulder: a 2.4 u handle with an ink edge, a two-steel head
    rod(b, spine(-12, 10, 8, -21, 2.4, 2.2), '#a07a44');
    b.fill('#c3cccf', [[5.5, -24.5], [12.5, -22.5], [10, -19.5], [7, -21]], 0.96, 0.2);
    b.fill('#7d888c', [[7, -21], [10, -19.5], [9.5, -17.8]], 0.96, 0.2);
    edge(b, [[5.5, -24.5], [12.5, -22.5], [9.5, -17.8], [7, -21]], 1.1);
    const { hx, hy, hr } = body2(b, L, v);
    // the apron (the light mass on a mid-blue robe), its ink edge and a fold
    const ap: Pt[] = [[-3, -2], [5, -2], [6.5, 12.5], [-4, 12.5]];
    b.fill('#ead6a8', ap, 0.95, 0.3);
    b.fill(shadeOf('#ead6a8'), [[2.5, -1], [5, -2], [6.5, 12.5], [3, 12.5]], 0.45, 0.6);
    edge(b, ap, 1.2);
    hair2(b, hx, hy, hr, L.hair, false);
    face2(b, hx, hy, hr, v, 'dot', 0.4);
    const cy = hy - hr * 0.35;
    hat2(b, hx, cy, 14.5, 8, '#e3bf6f');
    b.fill('#5f9a5a', [[hx - 6.5, cy - 1], [hx - 5.5, cy - 3.8], [hx + 5.5, cy - 3.8], [hx + 6.5, cy - 1]], 0.92, 0.2);
    hurtInk2(b, v);
  }),
  fisher: fig((b, v) => {
    const L = CHAR_LOOK.fisher;
    // the rod (2 u → 1 u), the line and a 2.4 u cinnabar float
    b.brush(spine(-10, 12, 14, -30, 2.2, 1.1), 0.95, '#6b5a30');
    b.line([[14, -30], [18.5, -18], [18.5, -11]], 0.7, 0.65, INK);
    b.dot(18.5, -10, 3.2, 0.97, CINNABAR);
    const { hx, hy, hr } = body2(b, L, v, { robeW: 10.5 });
    // the straw cape: a dark base and three staggered dry sweeps of 2.4 u
    b.fill('#5b4f33', [[-12, -5], [7, -5.5], [9.5, 3], [-2, 5.5], [-13, 4]], 0.9, 0.6);
    for (const [dx, dy] of [[0, -3.5], [1.4, 0], [0.4, 3.4]] as Pt[]) b.dry([[-12.5 + dx, dy - 1, 2.4], [-3 + dx, dy + 1.2, 2.4], [7.5 + dx, dy - 1.5, 1.4]], 0.8, '#b8a26a', 0.55);
    hair2(b, hx, hy, hr, L.hair, false);
    // a white beard with a grey edge
    const bd: Pt[] = [[hx + 1, hy + 3], [hx + 6.5, hy + 2.5], [hx + 4.4, hy + 9.6], [hx + 2, hy + 11]];
    b.fill('#f3f0e8', bd, 0.97, 0.3); edge(b, bd, 1.1, '#6b665c', 0.8);
    face2(b, hx, hy, hr, v, 'old', 0.2);
    hat2(b, hx, hy - hr * 0.3, 14.5, 9, '#d6b56c');
    hurtInk2(b, v);
  }),
  musician: fig((b, v) => {
    const L = CHAR_LOOK.musician;
    // the guqin on her back: a dark lacquer plank, a lit edge, pale strings, a jade tassel
    b.fill('#3b2b25', [[-17, 9], [-14, 5], [8, -13], [12, -12], [11, -8], [-13, 12]], 0.97, 0.4);
    b.fill('#8a6a55', [[-15, 6.5], [9, -12.2], [10.5, -11], [-14, 8.5]], 0.6, 0.6);
    b.brush([[-16.5, 10.5, 1.4], [11.5, -10, 1.2]], 0.9, INK);
    for (const d of [-1.2, 0.2, 1.6]) b.line([[-14 + d, 8.2 + d], [9 + d, -10.8 + d]], 0.55, 0.75, '#efe6d0');
    b.brush([[-17, 10, 1.4], [-19, 15, 1.5], [-18, 19, 0.6]], 0.92, '#5fae8f');
    // long hair falling behind
    b.fill(INK, [[-4, -18], [3, -20], [3, -5], [-2, 3], [-8, 5], [-8, -6]], 0.96, 0.4);
    // a teal over-robe on the pale one (R7) and a teal sash
    const { hx, hy, hr } = body2(b, L, v, { robeW: 9.5, over: '#8fc2b8' });
    hair2(b, hx, hy, hr, L.hair);
    b.dot(hx - hr * 0.1, hy - hr * 0.78, 3.2, 0.95, '#e0707a');
    b.brush([[hx + hr * 0.2, hy - hr * 0.95, 0.9], [hx + hr + 2.6, hy - hr - 2, 0.8]], 0.95, '#c8a24e'); b.dot(hx + hr + 2.6, hy - hr + 1, 2.4, 0.95, '#7fb39a');
    face2(b, hx, hy, hr, v, 'lady', 0.4);
    hurtInk2(b, v);
  }),
  swordsman: fig((b, v) => {
    const L = CHAR_LOOK.swordsman;
    // the sword across his back: bright steel, so the dark figure keeps a light line
    b.brush(spine(-12, 12, 9, -16, 3, 2.6), 0.97, '#2a1f1a');
    b.fill('#dfe9ec', [[3.5, -9], [12, -20], [13.4, -19], [5.4, -7.6]], 0.97, 0.3);
    edge(b, [[3.5, -9], [12, -20], [13.4, -19], [5.4, -7.6]], 0.8);
    b.brush([[1.6, -6.2, 3.2], [5.6, -10.4, 3.2]], 0.97, '#c9a24e');
    b.brush([[-12, 12, 1.4], [-15, 16, 1.5], [-13.5, 20, 0.6]], 0.95, CINNABAR);
    // the robe lifted one step (it stood on dark enemies)
    const { hx, hy, hr } = body2(b, { ...L, robe: '#4a3a32' }, v, { sash: '#4a7fae' });
    // the azure scarf blowing back: the one light mass on a dark figure
    const s2 = v === 1 ? 1.5 : v === 2 ? -1.5 : 0;
    b.brush([[-3, -5, 3.4], [-9, -4 + s2, 3], [-15, -1 - s2, 2.2], [-19, 1 + s2, 0.8]], 0.95, '#7fb0d6');
    b.brush([[-3, -4, 1], [-15, 0 - s2, 0.8]], 0.6, '#2e4a6b');
    hair2(b, hx, hy, hr, L.hair, false);
    face2(b, hx, hy, hr, v, 'fierce', 0.12);
    // 斗笠: a broad hat
    hat2(b, hx, hy - hr * 0.3, 15, 8.5, '#c9a86a');
    hurtInk2(b, v);
  }),
  taoist: fig((b, v) => {
    const L = CHAR_LOOK.taoist;
    // the gamboge talisman with a cinnabar glyph (strokes ≥ 1.2 u)
    const tl: Pt[] = [[-15, -5], [-7.5, -5], [-7.5, 8.5], [-15, 8.5]];
    b.fill('#f0cf6a', tl, 0.96, 0.2);
    edge(b, tl, 1.1, '#7a5212');
    b.brush([[-11.2, -3.2, 1.6], [-11.2, 7, 1.4]], 0.97, CINNABAR);
    b.brush([[-13.8, -0.2, 1.4], [-8.8, 0.4, 1.4]], 0.97, CINNABAR);
    b.brush([[-13.6, 4, 1.3], [-9, 3, 1.3]], 0.95, CINNABAR);
    const { hx, hy, hr, handX, handY } = body2(b, L, v, { robeW: 9, head: 8.6 });
    // the whisk: a handle and three dry strokes of 1.6 u (a grey under-stroke keeps them off pale paper)
    rod(b, [[handX - 1, handY + 1, 1.4], [handX + 2, handY - 9, 1.2]], '#7b5a3a', 0.9);
    for (let k = 0; k < 3; k++) {
      const w: [number, number, number][] = [[handX + 2, handY - 9.5, 1.6], [handX + 5 + k * 1.4, handY - 4 + k, 1.4], [handX + 7.5 + k, handY + 2 + k * 0.8, 0.6]];
      b.dry(w.map(([x, y, ww]) => [x + 0.5, y + 0.6, ww + 0.6] as [number, number, number]), 0.7, '#8a8a88', 0.3);
      b.dry(w, 0.9, '#f6f4ec', 0.35);
    }
    hair2(b, hx, hy, hr, L.hair, false);
    // double buns 6.5 u with a moonlit sheen
    for (const [x, y] of [[hx - 5, hy - hr + 0.2], [hx + 3, hy - hr - 0.8]] as Pt[]) {
      b.dot(x, y, 6.5, 0.97, INK);
      b.dry(arcW(x, y, 2.2, 2.2, Math.PI * 1.1, Math.PI * 1.7, 0.9, 0.5, 5), 0.6, HAIR_SHEEN, 0.4);
    }
    face2(b, hx, hy, hr, v, 'dot', 0.45);
    hurtInk2(b, v);
  }),
  painter: fig((b, v) => {
    const L = CHAR_LOOK.painter;
    const { hx, hy, hr } = body2(b, L, v);
    // the ink-stained apron (R7): indigo, its edge, three stains
    const ap: Pt[] = [[-6.5, -2], [6, -2], [8.5, 12.5], [-7.5, 12.5]];
    b.fill(L.trim, ap, 0.92, 0.3);
    b.fill(litOf(L.trim), [[-6, -1.4], [-1, -1.4], [-2, 8], [-6.8, 8]], 0.45, 0.6);
    edge(b, ap, 1.2);
    for (const [x, y, d] of [[-4, 6, 2.6], [3, 9, 2], [5, 2, 1.6]] as [number, number, number][]) b.dot(x, y, d, 0.85, INK);
    // the huge brush held like a spear: a 2.4 u shaft with an ink edge, a wet ink head
    rod(b, spine(-6, 14, 16, -20, 2.4, 2.2), '#c9a870');
    b.brush([[14.6, -18.4, 1.6], [15.8, -20, 1.6]], 0.95, '#8a5a32');
    b.fill(INK, [[15, -18.5], [19.5, -22.5], [22, -28], [18.5, -31], [13.5, -26.5], [12.5, -21]], 0.97, 0.5);
    b.brush([[15.5, -20.5, 0.9], [18.5, -27, 0.6]], 0.55, '#6a6a7a');
    b.dot(21.5, -31.5, 2.6, 0.9, INK);
    // the cap of hair and the tail swept back
    b.fill(INK, [...ell(hx, hy - 0.6, hr + 0.8, hr * 1.06, Math.PI * 1.02, Math.PI * 1.98, 10), [hx + hr, hy - 1], [hx - hr, hy - 1]], 0.97, 0.4);
    b.dry(arcW(hx - 0.8, hy - 0.6, hr - 1.2, hr - 1.4, Math.PI * 1.15, Math.PI * 1.6, 1.3, 0.6, 6), 0.55, HAIR_SHEEN, 0.5);
    b.brush([[hx - hr + 1, hy - 3, 2], [hx - hr - 5, hy - 4, 1.8], [hx - hr - 9, hy - 2, 0.6]], 0.92, INK);
    face2(b, hx, hy, hr, v, 'dot', 0.26);
    hurtInk2(b, v);
  }),
  player: fig((b, v) => {
    const L = CHAR_LOOK.player;
    // the go-board satchel on his back (R7): a wood board with its grid, an ink edge and a strap
    const bd: Pt[] = [[-16, -5], [-5, -9], [-3, 7], [-14, 10]];
    b.fill('#d7b273', bd, 0.96, 0.3);
    for (let i = 1; i < 4; i++) {
      b.line([[-16 + i * 2.8, -5 - i * 1.1], [-14 + i * 2.8, 10 - i * 0.9]], 0.8, 0.55, '#5b3a22');
      b.line([[-15.5 + i * 0.5, -5 + i * 3.8], [-5 + i * 0.5, -9 + i * 4]], 0.8, 0.55, '#5b3a22');
    }
    edge(b, bd, 1.2);
    b.brush([[-5, -8.5, 1.4], [4, 3, 1.4]], 0.9, '#5b3a22');
    const { hx, hy, hr, handX, handY } = body2(b, L, v);
    hair2(b, hx, hy, hr, L.hair, false);
    // a scholar's cap in the trim colour
    const cap: Pt[] = [[hx - hr + 0.5, hy - 1], [hx - hr + 1, hy - hr - 1.5], [hx - 2, hy - hr - 4.5], [hx + 4, hy - hr - 4], [hx + hr - 0.5, hy - hr * 0.5]];
    b.fill(L.trim, cap, 0.97, 0.3);
    b.brush([[hx - hr + 1.5, hy - hr - 1, 1], [hx - 1.5, hy - hr - 3.6, 0.8]], 0.5, litOf(L.trim));
    b.brush([[hx + 3, hy + 4, 1], [hx + 3, hy + 9, 1.3], [hx + 2.6, hy + 12, 0.5]], 0.92, INK);
    face2(b, hx, hy, hr, v);
    // a stone between two fingers (r 3, a white ring)
    const sx = handX + 0.6, sy = handY - 2.6;
    b.disc(sx, sy, 3.6, '#ffffff');
    b.disc(sx, sy, 3, v === 2 ? '#f4efe4' : '#111');
    if (v === 2) b.ring(sx, sy, 3, 0.8, INK, 0.9);
    else b.disc(sx - 1, sy - 1.1, 0.8, '#8a8a96');
    hurtInk2(b, v);
  }),
  cat: fig((b, v) => {
    const G = '#da8640', D = '#b8632a', C = '#f6e6c8';
    const hurt = v === 3, st = v === 1 ? 2.4 : v === 2 ? -2.4 : 0;
    pool2(b, 12, '#e08a3c');
    b.brush(hurt ? [[-10, 4, 6], [-17.5, -2, 5.4], [-19.5, -10, 3.8]] : [[-10, 4, 6], [-17, -4, 5.4], [-15, -14, 4.2], [-11, -18, 2]], 0.95, G);
    b.brush(hurt ? [[-11, 2.4, 1.2], [-17.6, -3, 1.1], [-19.6, -10, 0.6]] : [[-11, 2.4, 1.2], [-17.4, -4, 1.1], [-15.4, -14, 0.8], [-12, -17.6, 0.5]], 0.85, INK);
    b.brush([[-16, -5, 1.6], [-17, -3, 1.6]], 0.9, D);
    for (const [x, d] of [[-7, st], [-1, -st], [5, st], [9, -st]] as Pt[]) { b.dot(x + d * 0.5, 14, 6.6, 0.97, INK); b.dot(x + d * 0.5, 13.6, 5.6, 0.97, G); }
    b.fill(G, ell(0, 5, 14.4, 10.8), 0.96, 0.5);
    b.fill(shadeOf(G), ell(4, 8, 8, 5.5, 0, Math.PI * 2, 14), 0.4, 0.8);
    b.fill(C, ell(4, 8, 6, 5), 0.95, 0.4);
    // QA boost (A-A1: the cat read ×1.18): a mid-value mass under the belly line, then darker, wider stripes with an ink edge
    b.fill(shadeOf(G), ell(-3, 10, 11, 4), 0.5, 0.7);
    for (const x of [-7, -3, 1, 5]) {
      b.brush([[x + 0.6, -3.5, 2.3], [x - 0.4, 3, 1.9], [x - 0.9, 7, 0.8]], 0.7, INK);
      b.brush([[x, -3.5, 1.9], [x - 1, 3, 1.6], [x - 1.5, 7, 0.6]], 0.92, '#93501f');
    }
    // the ink contour along the back (1.4 u), and a thin dry outline all round (the silhouette reads on every wash)
    b.brush(arcW(0, 5, 15.1, 11.6, 0, Math.PI * 2, 0.9, 0.9, 18), 0.55, INK);
    b.brush(arcW(0, 5, 14.4, 10.9, Math.PI * 0.85, Math.PI * 1.8, 1.6, 1, 9), 0.9, INK);
    b.brush(arcW(0, 5, 14.4, 10.9, Math.PI * 0.05, Math.PI * 0.7, 1.1, 1.6, 7), 0.85, INK);
    const hx = 6 + (hurt ? -3 : 0), hy = -8;
    b.fill(G, [[hx - 8.6, hy - 4], [hx - 7.6, hy - 14.2], [hx - 2, hy - 7]], 0.96, 0.3);
    b.fill(G, [[hx + 2, hy - 7], [hx + 6.4, hy - 14.2], [hx + 8.6, hy - 4]], 0.96, 0.3);
    b.line([[hx - 8.6, hy - 4], [hx - 7.6, hy - 14.2], [hx - 2, hy - 7]], 1.1, 0.85, INK);
    b.line([[hx + 2, hy - 7], [hx + 6.4, hy - 14.2], [hx + 8.6, hy - 4]], 1.1, 0.85, INK);
    b.fill('#e9a3a0', [[hx - 6.6, hy - 5.5], [hx - 6.4, hy - 10.5], [hx - 3.6, hy - 7]], 0.8, 0.3);
    b.fill(G, ell(hx, hy, 11, 9.5), 0.96, 0.5);
    b.brush(arcW(hx, hy, 11.3, 9.8, Math.PI * 0.95, Math.PI * 1.9, 1.4, 0.8, 9), 0.88, INK);
    // a red collar and a gold bell (the accent)
    b.brush([[hx - 7, hy + 6.5, 2.2], [hx + 5, hy + 7.4, 2.2]], 0.95, CINNABAR);
    b.disc(hx - 0.5, hy + 8.8, 1.9, GOLD); b.disc(hx - 1, hy + 8.2, 0.6, '#fff4c8');
    b.fill(C, ell(hx + 2, hy + 3.5, 5, 3.2), 0.95, 0.3);
    for (const [x, a] of [[hx - 1, 0], [hx - 3.5, -0.3], [hx + 1.5, 0.3]] as Pt[]) b.brush([[x, hy - 7, 1.4], [x + a * 4, hy - 3.5, 0.5]], 0.88, D);
    // eyes with a glint (R5)
    if (hurt) for (const x of [hx - 1, hx + 4]) b.brush([[x - 1.6, hy - 1.2, 1], [x + 1.6, hy + 0.6, 1]], 0.95, INK);
    else for (const x of [hx - 1, hx + 4]) { b.disc(x, hy + 0.3, 1.5, '#111'); b.disc(x - 0.5, hy - 0.3, 0.55, '#ffffff'); }
    b.dot(hx + 2, hy + 2.5, 1.8, 0.92, '#d98080');
    for (let i = 0; i < 2; i++) b.line([[hx + 6, hy + 2 + i * 1.5], [hx + 13, hy + 1 + i * 2.5]], 0.9, 0.6, INK);
    hurtInk2(b, v);
  }),
  rabbit: fig((b, v) => {
    const W = '#f7f4ee', pink = '#df7f8a', LILAC = '#958cab';
    const hurt = v === 3, st = v === 1 ? 2.4 : v === 2 ? -2.4 : 0;
    pool2(b, 12, '#6f8ea6');
    for (const x of [-3 + st, 4 - st]) { b.dot(x, 14, 5.4, 0.97, WARM_GREY); b.dot(x, 13.8, 4.2, 0.97, W); }
    // the body: white, a lilac-grey shade wash (lower right), a 1.6 u warm-grey contour
    b.fill(W, ell(0, 4, 10, 10), 0.97, 0.5);
    b.fill(LILAC, ell(3.2, 7.2, 7.2, 6.2, 0, Math.PI * 2, 14), 0.8, 0.9);
    b.brush(arcW(0, 4, 10.5, 10.5, Math.PI * 0.55, Math.PI * 2.1, 2.2, 1.4, 14), 0.95, WARM_GREY);
    b.dot(-10, 8, 6.4, 0.97, WARM_GREY); b.dot(-10, 8, 5.2, 0.97, W);
    // the stone mortar at its feet and the pestle: jade 2.4 u with an edge
    const mo: Pt[] = [[6, 9], [17, 9], [15.5, 15.5], [7.5, 15.5]];
    b.fill('#4f5d58', mo, 0.97, 0.3);
    b.fill('#7d8c86', [[6.8, 9.6], [11, 9.6], [10.4, 12.5], [7.4, 12.5]], 0.7, 0.4);
    edge(b, mo, 1.1);
    rod(b, spine(10, 10, 15, -6, 3.4, 3), '#5f9f82', 1.1);
    b.brush(spine(10.5, 8.5, 14, -4.5, 1.1, 0.9), 0.7, '#bfe3cf');
    const hx = 2 + (hurt ? -3 : 0), hy = -10;
    for (const sx of [-1, 1]) {
      const ex = hx + 2.5 * sx;
      const ear: Pt[] = [[ex - 2, hy - 4], [ex - 2.5 + sx, hy - 14], [ex + sx * 2, hy - 22], [ex + 2 + sx * 2, hy - 21], [ex + 2.2, hy - 12], [ex + 2, hy - 4]];
      b.fill(W, ear, 0.97, 0.4);
      // the ears' pink (R7): the one mid-value mass on a white figure
      b.fill(pink, [[ex - 1.2, hy - 5.5], [ex - 1.4 + sx, hy - 14], [ex + sx * 1.8, hy - 20.2], [ex + 1.8, hy - 12], [ex + 1.5, hy - 5.5]], 0.97, 0.5);
      b.brush([[ex - 2.2, hy - 4, 1.6], [ex - 2.7 + sx, hy - 14, 1.7], [ex + sx * 2, hy - 22.2, 1.3], [ex + 2.2 + sx * 2, hy - 21, 1.1], [ex + 2.4, hy - 12, 1]], 0.92, WARM_GREY);
    }
    b.fill(W, ell(hx, hy, 7.5, 6.8), 0.97, 0.4);
    b.brush(arcW(hx, hy, 8, 7.3, -Math.PI * 0.1, Math.PI * 1.2, 2, 1.3, 10), 0.93, WARM_GREY);
    b.fill(LILAC, ell(hx - 2.5, hy + 2.5, 3.8, 3.2, 0, Math.PI * 2, 10), 0.7, 0.8);
    if (hurt) b.brush([[hx + 2, hy - 1.4, 1], [hx + 5, hy + 0.6, 1]], 0.95, INK);
    else { b.disc(hx + 3.4, hy - 0.4, 1.6, '#a8323a'); b.disc(hx + 2.9, hy - 1, 0.55, '#ffffff'); }
    b.dot(hx + 7, hy + 2, 1.8, 0.95, pink); b.dot(hx + 4.5, hy + 3, 2.6, 0.3, '#e08f85');
    b.brush(arcW(hx, hy + 6, 5.2, 2.2, 0.1, Math.PI * 0.9, 1.9, 1.9, 6), 0.97, CINNABAR); b.dot(hx, hy + 8.7, 3.2, 0.97, '#4f8a6e');
    hurtInk2(b, v);
  }),
  poet: fig((b, v) => {
    const L = CHAR_LOOK.poet;
    // the gourd at his back: amber with an ink contour ≥ 1.1 u and a red cord
    b.fill('#cf9446', ell(-10, 8, 3.8, 4.4), 0.97, 0.3); b.fill('#cf9446', ell(-10, 2.4, 2.6, 2.8), 0.97, 0.3);
    b.fill(litOf('#cf9446'), ell(-11.2, 7, 1.6, 2.2, 0, Math.PI * 2, 10), 0.7, 0.4);
    b.line([...ell(-10, 8, 3.9, 4.5, -Math.PI * 0.45, Math.PI * 1.45, 12)], 1.1, 0.88, INK);
    b.line([...ell(-10, 2.4, 2.7, 2.9, Math.PI * 0.6, Math.PI * 2.4, 10)], 1.1, 0.88, INK);
    b.brush([[-12.6, 4.8, 1.4], [-7.4, 4.8, 1.4]], 0.95, CINNABAR);
    // a wine-red cloak lining (R7) and a wine-red sash
    const { hx, hy, hr, handX, handY } = body2(b, L, v, { robeW: 10, over: '#8e2b3a' });
    hair2(b, hx, hy, hr, L.hair);
    b.brush([[hx - hr * 0.6, hy - hr * 0.6, 1.8], [hx - hr - 4, hy + 1, 1.5], [hx - hr - 6, hy + 7, 0.6]], 0.88, '#4a88b2');
    face2(b, hx, hy, hr, v, 'smile', 0.5);
    // the cup raised: white with an ink contour, wine inside
    const cx = handX + 1.5, cy = handY - 6;
    const cup: Pt[] = [[cx - 2.8, cy - 2], [cx + 2.8, cy - 2], [cx + 2, cy + 2], [cx - 2, cy + 2]];
    b.fill('#f4efe4', cup, 0.97, 0.2); edge(b, cup, 1.1);
    b.dot(cx, cy - 1.4, 2.2, 0.9, L.accent);
    hurtInk2(b, v);
  }),
  guan: fig((b, v) => {
    const L = CHAR_LOOK.guan;
    // the glaive: a 2.2 u shaft with an edge, a head in two steels, the dragon-green ring, a red tassel
    rod(b, spine(14.5, 17, 14, -25, 2.8, 2.4), '#5b2c24', 1.1);
    b.fill('#e3e9ea', [[14, -24], [19, -27], [23, -34], [22, -39], [19, -34], [16, -30]], 0.97, 0.3);
    b.fill('#8ea2a8', [[14, -24], [16, -30], [19, -34], [22, -39], [18, -36], [13, -28]], 0.97, 0.3);
    edge(b, [[14, -24], [19, -27], [23, -34], [22, -39], [18, -36], [13, -28]], 1.1);
    b.dot(14, -22.5, 4, 0.97, L.robe); b.ring(14, -22.5, 2, 0.7, '#cda146', 0.9);
    b.brush([[15, -21, 1.6], [17, -17, 1.3], [16, -13, 0.5]], 0.92, CINNABAR);
    const { hx, hy, hr } = body2(b, L, v, { robeW: 11 });
    for (const sx of [-1, 1]) { b.fill(L.trim, ell(sx * 8.5, -4.5, 5, 2.8, 0, Math.PI * 2, 12), 0.95, 0.3); b.line(ell(sx * 8.5, -4.5, 5, 2.8, Math.PI * 0.9, Math.PI * 2.1, 8), 1, 0.8, '#7a5212'); }
    // the green hood and the gold band
    b.fill(L.robe, [...ell(hx - 0.6, hy - 0.4, hr + 1, hr * 1.08, Math.PI * 0.9, Math.PI * 2.02, 12), [hx + hr * 0.5, hy - hr * 0.5], [hx - hr * 0.2, hy - 2]], 0.97, 0.4);
    b.dot(hx - hr * 0.3, hy - hr - 1.4, 5.2, 0.97, L.robe);
    b.brush(arcW(hx - 0.6, hy - 0.4, hr + 1.2, hr * 1.08 + 0.2, Math.PI * 0.95, Math.PI * 1.6, 1.2, 0.7, 8), 0.8, INK);
    b.brush([[hx - hr * 0.6, hy - hr * 0.7, 1.6], [hx + hr * 0.7, hy - hr * 0.75, 1.6]], 0.97, L.trim);
    // the beard: three brush strokes, 2 → 0.6 u
    for (const [dx, len] of [[0.8, 15], [3, 17.5], [5.2, 13]] as Pt[]) b.brush([[hx + dx, hy + 3, 2], [hx + dx + 1, hy + len * 0.55, 1.6], [hx + dx + 0.4, hy + len, 0.6]], 0.97, INK);
    face2(b, hx, hy, hr, v, 'fierce', 0);
    hurtInk2(b, v);
  }),
  change: fig((b, v) => {
    const L = CHAR_LOOK.change;
    const sw = v === 1 ? 2 : v === 2 ? -2 : 0;
    // 披帛 streaming behind: jade at tone 0.8 with a darker edge (the mid-value mass, R7)
    b.brush([[-3, -2, 1.4], [-12, 2 + sw, 3], [-18, 10 - sw, 2.8], [-22, 16, 0.8]], 0.9, '#5f9f86');
    b.brush([[-3, -1, 0.8], [-12, 3.4 + sw, 1], [-18, 11.4 - sw, 1], [-21.6, 16.6, 0.4]], 0.6, shadeOf('#7fb8a0'));
    b.brush([[4, -1, 1.2], [12, 4 - sw, 2.6], [15, 12 + sw, 2.2], [17, 17, 0.6]], 0.88, '#5f9f86');
    b.fill(INK, [[-4, -16], [2, -18], [2, -4], [-3, 0], [-6, -6]], 0.92, 0.4);
    const { hx, hy, hr } = body2(b, L, v, { robeW: 10, hem: 13, over: '#6aa58e' });
    // the gold hem band (2 u)
    b.brush([[-12, 13.2, 2], [0, 14.4, 2], [12, 13.2, 2]], 0.9, '#d2a95a');
    hair2(b, hx, hy, hr, L.hair, false);
    b.brush(arcW(hx - 3, hy - hr - 3.5, 2.6, 3.6, 0, Math.PI * 2, 1.6, 1.6, 12), 0.97, INK);
    b.brush(arcW(hx + 2.5, hy - hr - 4, 2.6, 3.6, 0, Math.PI * 2, 1.6, 1.6, 12), 0.97, INK);
    b.dot(hx + 0.5, hy - hr - 0.5, 2.4, 0.95, '#eaa0ae');
    b.dot(hx - 4.5, hy - hr + 0.5, 1.6, 0.95, GOLD);
    face2(b, hx, hy, hr, v, 'lady', 0.35);
    hurtInk2(b, v);
  }),
  // m8:hidden · the three mirror-only companions (paint/hidden.ts, HIDDEN)
  ...HIDDEN_SPECS,
};

/** The companions' token ids in display order (the lab). */
export const CHAR_IDS = Object.keys(CHAR_SPECS) as CharacterId[];
export { PAPER };
