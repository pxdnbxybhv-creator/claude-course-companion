// Weapons (27), projectiles (27) and summons (12). Weapons and projectiles point along +x; weapons
// are anchored at the grip (rotate them to the aim). Player shots are pale washes in class colours;
// enemy shots (e…) have a white core and a 朱砂 rim and are 1.5× larger — the brightest thing on screen.
import type { ProjKind, SummonKind, WeaponId } from '../ids';
import { B, ell, arcW, rot, rotW, spine, star, type Pt, type Spec } from './kit';
import { CINNABAR, CLASS_WASH, DANGER, GOLD, INK, JADE, MOON, PAPER, SILVER } from './palette';
import { litOf, shadeOf } from './brushwork';

const STEEL = '#aeb7bd', WOOD = '#7b5a3a', DARKWOOD = '#4a3526', LACQ = '#8e2b2b', YELLOW = '#e3c25a';

const wpn = (x0: number, y0: number, x1: number, y1: number, paint: (b: B) => void, halo: Spec['halo'] = 'paper'): Spec =>
  ({ box: [x0, y0, x1, y1], n: 1, halo, paint: (b) => paint(b) });

function blade(b: B, x0: number, x1: number, w: number, color: string = STEEL, edge: string = INK) {
  b.fill(color, [[x0, -w / 2], [x1 - w, -w / 2], [x1, 0], [x1 - w, w / 2], [x0, w / 2]], 0.95, 0.2);
  b.line([[x0, -w / 2], [x1 - w, -w / 2], [x1, 0], [x1 - w, w / 2], [x0, w / 2]], 0.4, 0.8, edge);
  b.line([[x0 + 1, 0], [x1 - w * 1.4, 0]], 0.3, 0.5, '#ffffff');
}

// ───────────────────────────── m8 · weapons redrawn for the hand (art.md §4.3, PLAN A5)
// A held weapon is drawn at 0.8× on a phone (engine/render.ts HELD) and the same spec is the shop, codex
// and results icon, so every weapon keeps to the redraw's rules: blades ≥ 5 u in two steels (lit above
// the ridge, shade below) with a 1.1 u ink contour and a white ridge; gold guards 2.6 u; wrapped grips;
// a tassel or ribbon ≥ 2 u; wood and lacquer with a lit side; and one baked class-colour glow wash along
// it (tone 0.28–0.3, soft 3), the one thing that finds a weapon among the bodies.
const STEEL_L = '#dfe9ec', STEEL_D = '#86a0a8';
/** The class-colour glow per weapon class (moon's is a moon-blue: a white glow vanishes on pale paper). */
const GLOW: Readonly<Record<string, string>> = {
  sword: CLASS_WASH.sword, heavy: CLASS_WASH.heavy, fist: CLASS_WASH.fist, hidden: '#4f7f9a', bow: '#b8792e', fortune: CLASS_WASH.fortune,
  flying: CLASS_WASH.sword, talisman: CLASS_WASH.talisman, wine: CLASS_WASH.wine, music: CLASS_WASH.music, ink: CLASS_WASH.ink, go: '#4a4a56', moon: '#8ea4bf',
};
function aura(b: B, pts: Pt[], cls: string, tone = 0.3) { b.wash(GLOW[cls], pts, tone, 3); }
/** A blade in two steels from x0 to its tip x1, width w, turned by a: lit above the ridge, shade below, a 1.1 u contour, a white ridge. */
function blade2(b: B, x0: number, x1: number, w: number, a = 0, lit: string = STEEL_L, shade: string = STEEL_D, edge: string = INK) {
  const h = w / 2, t = x1 - w * 1.4;
  b.fill(lit, rot([[x0, -h], [t, -h], [x1, 0], [x0, 0]], a), 0.97, 0.2);
  b.fill(shade, rot([[x0, 0], [x1, 0], [t, h], [x0, h]], a), 0.97, 0.2);
  b.line(rot([[x0, -h], [t, -h], [x1, 0], [t, h], [x0, h], [x0, -h]], a), 1.1, 0.9, edge);
  b.line(rot([[x0 + 2, -0.2], [x1 - w * 0.9, -0.2]], a), 0.6, 0.75, '#ffffff');
}
/** A wrapped grip of `len` u and a gold guard 2.6 u wide. */
function hilt2(b: B, len: number, guard: string = GOLD, grip: string = DARKWOOD, gh = 5.2) {
  b.brush([[-len, 0, 3.6], [0, 0, 3.6]], 0.97, grip);
  for (let x = -len + 1; x < -0.5; x += 2.4) b.line([[x, -1.7], [x + 1.4, 1.7]], 0.6, 0.7, '#c9a870');
  b.brush([[0, -gh / 2, 2.6], [0, gh / 2, 2.6]], 0.97, guard);
  b.line([[0, -gh / 2], [0, gh / 2]], 0.5, 0.6, '#7a5212');
}
/** A tassel ≥ 2 u hanging from (x, y). */
function tassel(b: B, x: number, y: number, color: string, k = 1) {
  b.dot(x, y, 3, 0.95, GOLD);
  b.brush([[x, y, 2], [x - 3 * k, y + 4 * k, 2.2], [x - 2 * k, y + 9 * k, 1.8], [x, y + 12 * k, 0.6]], 0.95, color);
}
/** A shaft with an ink edge (wood or lacquer). */
function shaft(b: B, pts: [number, number, number][], color: string, e = 1.1) {
  b.brush(pts.map(([x, y, w]) => [x, y, w + e] as [number, number, number]), 0.95, INK);
  b.brush(pts, 0.97, color);
}
/** A closed outline in ink (1.1 u). */
function outline(b: B, pts: Pt[], w = 1.1, color: string = INK) { b.line([...pts, pts[0]], w, 0.9, color); }

export const WPN_SPECS: Record<WeaponId, Spec> = {
  qingfeng: wpn(-16, -9, 46, 14, (b) => {
    aura(b, [[0, -5.5], [36, -4.2], [46, 0], [36, 4.2], [0, 5.5]], 'sword', 0.28);
    hilt2(b, 11);
    blade2(b, 1, 44, 5.2);
    tassel(b, -12, 0, CINNABAR);
  }),
  longquan: wpn(-12, -17, 34, 17, (b) => {
    aura(b, [[-2, -10], [26, -14], [33, 0], [26, 14], [-2, 10]], 'sword', 0.28);
    for (const s of [-1, 1]) {
      const a = s * 0.32;
      b.brush(rotW([[-7, 0, 3.2], [0, 0, 3.2]], a), 0.97, DARKWOOD);
      b.brush(rotW([[0, -3.2, 2.4], [0, 3.2, 2.4]], a), 0.97, GOLD);
      blade2(b, 1, 30, 4.4, a);
    }
    b.brush([[-6.5, 0, 2], [-9.5, 4, 2.2], [-8.5, 9, 1.8], [-7, 12, 0.6]], 0.95, CINNABAR);
  }),
  yanyue: wpn(-26, -17, 54, 14, (b) => {
    aura(b, [[24, -8], [38, -15], [53, -15], [50, 4], [30, 8], [-24, 3.5], [-24, -3.5]], 'heavy', 0.28);
    shaft(b, spine(-24, 0, 34, 0, 3, 3), '#5b2c24');
    for (let x = -20; x < 26; x += 9) b.line([[x, -1.4], [x + 1.4, 1.4]], 0.7, 0.6, '#c9a870');
    const hd: Pt[] = [[30, -2], [38, -10], [51, -13], [48, -4], [42, 2], [32, 4]];
    b.fill(STEEL_L, [[30, -2], [38, -10], [51, -13], [44, -5], [36, -1]], 0.97, 0.3);
    b.fill(STEEL_D, [[36, -1], [44, -5], [51, -13], [48, -4], [42, 2], [32, 4], [30, -2]], 0.97, 0.3);
    outline(b, hd, 1.4);
    b.line([[34, -1], [48, -11]], 0.6, 0.7, '#ffffff');
    b.dot(30, 0, 8, 0.97, '#2f7552'); b.ring(30, 0, 4, 0.9, GOLD, 0.95);
    b.brush([[29, 4, 2], [28, 9, 1.8], [30, 12, 0.6]], 0.95, CINNABAR);
  }),
  hoe: wpn(-24, -12, 28, 13, (b) => {
    aura(b, [[-22, -3], [20, -4], [28, -2], [27, 11], [18, 11], [-22, 3]], 'heavy', 0.28);
    shaft(b, spine(-22, 0, 20, 0, 2.8, 2.8), '#9a6f3e');
    b.brush([[-20, -0.6, 0.8], [18, -0.6, 0.8]], 0.5, '#d7b27a');
    b.fill(STEEL_L, [[18, -2.5], [26.5, -2.5], [26, 4], [18.5, 4]], 0.97, 0.2);
    b.fill(STEEL_D, [[18.5, 4], [26, 4], [25.5, 10], [19, 10]], 0.97, 0.2);
    outline(b, [[18, -2.5], [26.5, -2.5], [25.5, 10], [19, 10]], 1.1);
    b.brush([[6, 0, 1.4], [8, -6, 1.8], [5, -9.5, 0.6]], 0.9, '#4f7f5e');
    b.dot(8, -8.5, 5.6, 0.97, '#e7a3b3'); b.disc(8, -8.5, 1.2, GOLD);
  }),
  pestle: wpn(-8, -9, 32, 9, (b) => {
    aura(b, [[-6, -4], [20, -5], [30, -8], [32, 0], [30, 8], [20, 5], [-6, 4]], 'moon', 0.3);
    const P: Pt[] = [[-6, -2.8], [20, -3.8], [28, -6.5], [31, 0], [28, 6.5], [20, 3.8], [-6, 2.8]];
    b.fill('#a8d4bc', P, 0.97, 0.4);
    b.fill('#e2f2e8', [[-5, -2.2], [20, -3], [27.5, -5.6], [29.5, -1], [-5, -0.4]], 0.75, 0.4);
    b.fill('#6fa98a', [[-5, 1.2], [20, 1.6], [29.5, 1.5], [27.5, 5.8], [20, 3.4], [-5, 2.4]], 0.7, 0.4);
    outline(b, P, 1.1, '#2f5a4a');
    b.brush([[-6, 0, 1.6], [-9, 4, 1.8], [-8, 8, 0.6]], 0.95, '#5fae8f');
  }),
  claw: wpn(-6, -12, 22, 12, (b) => {
    aura(b, ell(8, 0, 12, 10, 0, Math.PI * 2, 14), 'fist', 0.28);
    b.fill('#e0924a', ell(6, 0, 8.4, 7.4), 0.97, 0.4);
    b.fill(shadeOf('#e0924a'), ell(8, 2.6, 6, 4.4, 0, Math.PI * 2, 12), 0.55, 0.6);
    for (const y of [-5.2, 0, 5.2]) { b.dot(12.5, y, 4.6, 0.97, '#e0924a'); b.brush([[13.5, y, 1.8], [20, y + y * 0.2, 0.6]], 0.97, INK); }
    b.line(ell(6, 0, 8.6, 7.6, Math.PI * 0.55, Math.PI * 1.45, 10), 1.1, 0.85, INK);
    b.dot(3.6, 0, 4.4, 0.85, '#e7a3a0');
  }),
  drunkfist: wpn(-12, -12, 17, 12, (b) => {
    aura(b, ell(4, 0, 12, 10, 0, Math.PI * 2, 14), 'fist', 0.28);
    b.brush([[-11, 3, 3], [-4, 6.5, 3.2], [0, 4, 2.6], [-6, 10, 1.2]], 0.95, '#8e2b3a');
    b.fill('#f2d0b0', ell(6, 0, 8.4, 7.4), 0.97, 0.4);
    b.fill(litOf('#f2d0b0'), ell(4.5, -2.4, 4.6, 3.2, 0, Math.PI * 2, 10), 0.7, 0.5);
    b.fill(shadeOf('#f2d0b0'), ell(8, 3, 5.6, 3.6, 0, Math.PI * 2, 10), 0.5, 0.6);
    for (const y of [-4, -1.3, 1.3, 4]) b.line([[9.5, y], [13.5, y]], 0.8, 0.7, INK);
    b.line(ell(6, 0, 8.6, 7.6, 0, Math.PI * 2, 16), 1.1, 0.88, INK);
  }),
  dart: wpn(-10, -10, 10, 10, (b) => {
    aura(b, ell(0, 0, 9.5, 9.5, 0, Math.PI * 2, 14), 'hidden', 0.28);
    b.fill('#8e969a', star(0, 0, 9, 2.8, 4, 0), 0.97, 0.2);
    b.fill(STEEL_L, [[0, 0], [9, 0], [2.8 * Math.SQRT1_2, -2.8 * Math.SQRT1_2], [0, -9]], 0.9, 0.2);
    outline(b, star(0, 0, 9, 2.8, 4, 0), 1);
    b.disc(0, 0, 1.8, INK); b.disc(-0.5, -0.5, 0.6, '#ffffff');
  }),
  coindart: wpn(-10, -10, 10, 10, (b) => {
    aura(b, ell(0, 0, 9.5, 9.5, 0, Math.PI * 2, 14), 'fortune', 0.28);
    b.fill('#d9b24a', star(0, 0, 9, 7.2, 12, 0), 0.97, 0.2);
    b.fill('#f2d77a', ell(-1.4, -1.6, 4.6, 4, 0, Math.PI * 2, 10), 0.7, 0.4);
    outline(b, star(0, 0, 9, 7.2, 12, 0), 0.9, '#7a5212');
    b.ring(0, 0, 3.6, 1.1, '#7a5212', 0.95); b.fill('#3a2408', [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]], 0.97, 0.1);
  }),
  sunbow: wpn(-8, -24, 16, 24, (b) => {
    aura(b, [[-6, -22], [2, -12], [4, 0], [2, 12], [-6, 22], [-1, 0]], 'bow', 0.28);
    b.brush(arcW(-18, 0, 26, 21, -0.95, 0.95, 4.4, 4.4, 12), 0.95, INK);
    b.brush(arcW(-18, 0, 26, 21, -0.95, 0.95, 3.2, 3.2, 12), 0.97, LACQ);
    b.brush(arcW(-18, 0, 25.4, 20.4, -0.9, 0.2, 1, 1, 8), 0.7, '#e8a070');
    b.line([[-2.8, -17], [-2.8, 17]], 0.8, 0.9, '#3a2a1a');
    b.brush([[-2.8, 0, 1.4], [12, 0, 1.4]], 0.95, WOOD);
    b.fill('#f4f4f2', [[11, -2.6], [16, 0], [11, 2.6]], 0.97, 0.2); outline(b, [[11, -2.6], [16, 0], [11, 2.6]], 0.8);
    b.fill('#f4efe4', [[-4, 0], [0, -3], [2, 0], [0, 3]], 0.95, 0.2); b.brush([[-3, -2.6, 1.2], [1, -2.6, 0.6]], 0.9, CINNABAR);
  }),
  repeater: wpn(-12, -14, 24, 14, (b) => {
    aura(b, [[-10, -5], [22, -5], [24, 0], [22, 5], [-10, 5]], 'bow', 0.28);
    const stock: Pt[] = [[-11, -3.4], [18, -3.4], [18, 3.4], [-11, 3.4]];
    b.fill(DARKWOOD, stock, 0.97, 0.2); b.fill(litOf(DARKWOOD), [[-10, -2.8], [17, -2.8], [17, -0.8], [-10, -0.8]], 0.6, 0.3);
    outline(b, stock, 1);
    const mag: Pt[] = [[-2, -10], [10, -10], [10, -3.4], [-2, -3.4]];
    b.fill('#a0703e', mag, 0.97, 0.2); b.fill(litOf('#a0703e'), [[-1.4, -9.4], [4, -9.4], [4, -4], [-1.4, -4]], 0.6, 0.3);
    outline(b, mag, 1.1);
    b.brush(arcW(8, 0, 6, 12, -1.4, 1.4, 2.4, 2.4, 8), 0.97, DARKWOOD);
    b.line([[13, -12], [13, 12]], 0.8, 0.85, INK);
    b.fill(STEEL_L, [[18, -2], [23, 0], [18, 2]], 0.97, 0.2); outline(b, [[18, -2], [23, 0], [18, 2]], 0.8);
  }),
  rod: wpn(-12, -13, 46, 10, (b) => {
    aura(b, [[-10, -0.5], [37, -11], [40, -6], [-10, 5]], 'fortune', 0.28);
    shaft(b, spine(-10, 2, 38, -8, 2.6, 1), '#8f7b48', 0.9);
    for (const x of [2, 14, 26]) b.line([[x, -0.4 - x * 0.2], [x + 1, -2.8 - x * 0.2]], 0.8, 0.75, INK);
    b.line([[38, -8], [42, 2]], 0.6, 0.7, INK);
    b.dot(42, 4, 4.8, 0.97, CINNABAR); b.disc(41.4, 3.2, 0.7, '#ffffff');
    b.brush(arcW(42, 6.8, 1.6, 2, -1.6, 1.8, 0.8, 0.5, 6), 0.95, GOLD);
  }),
  qingping: wpn(-10, -7, 34, 7, (b) => {
    aura(b, [[-8, -4], [26, -4.5], [34, 0], [26, 4.5], [-8, 4]], 'flying', 0.28);
    b.brush([[-9, 0, 2.4], [0, 0, 3]], 0.97, '#3f6f5f');
    b.brush([[0, -3, 2.2], [0, 3, 2.2]], 0.97, JADE);
    blade2(b, 0.5, 33, 5, 0, '#dcefe4', '#86b8a2', '#2f5a4a');
    b.brush([[-9, 0, 1.6], [-12, 4, 2], [-11, 8, 0.6]], 0.95, JADE);
  }),
  casket: wpn(-13, -16, 13, 11, (b) => {
    aura(b, [[-12, -9], [12, -9], [12, 10], [-12, 10]], 'flying', 0.28);
    for (const x of [-6, 0, 6]) { b.brush([[x, -8, 2.2], [x + 1, -14, 1.2]], 0.95, INK); b.brush([[x, -8, 1.4], [x + 1, -13.5, 0.8]], 0.97, STEEL_L); }
    const bx: Pt[] = [[-11.5, -8.5], [11.5, -8.5], [11.5, 8.5], [-11.5, 8.5]];
    b.fill('#2a211c', bx, 0.97, 0.2);
    b.fill('#5a4436', [[-11, -8], [11, -8], [11, -4], [-11, -4]], 0.8, 0.3);
    outline(b, bx, 1.1);
    b.line([[-11, -2], [11, -2]], 1, 0.8, GOLD); b.dot(0, 3, 4, 0.97, GOLD); b.disc(-0.6, 2.4, 0.7, '#fff4c8');
  }),
  peach: wpn(-14, -9, 36, 12, (b) => {
    aura(b, [[0, -4.5], [30, -4], [36, 0], [30, 4], [0, 4.5]], 'talisman', 0.3);
    hilt2(b, 9, CINNABAR, '#a8703a');
    const bl: Pt[] = [[1, -2.8], [30, -2.8], [35, 0], [30, 2.8], [1, 2.8]];
    b.fill('#c88a5a', bl, 0.97, 0.3);
    b.fill('#e8b88a', [[1, -2.3], [30, -2.3], [34, -0.3], [1, -0.3]], 0.7, 0.3);
    outline(b, bl, 1.1, '#5a3418');
    for (const x of [8, 16, 24]) b.brush([[x, -1.8, 1], [x + 2, 1.8, 1]], 0.95, CINNABAR);
    tassel(b, -10, 0, CINNABAR, 0.9);
  }),
  seven: wpn(-14, -9, 42, 13, (b) => {
    aura(b, [[0, -5.5], [34, -4.2], [42, 0], [34, 4.2], [0, 5.5]], 'flying', 0.28);
    hilt2(b, 9);
    blade2(b, 1, 40, 5.2);
    for (const [x, y] of [[6, -1.2], [10, 1], [14, -0.8], [18, 1.2], [23, 0.4], [27, -1.2], [31, 0.2]] as Pt[]) { b.disc(x, y, 1.1, GOLD); b.disc(x - 0.3, y - 0.3, 0.35, '#fff8e0'); }
    tassel(b, -10, 0, '#2f5f78', 0.9);
  }),
  thunder: wpn(-10, -14, 10, 14, (b) => {
    aura(b, [[-10, -13], [10, -13], [10, 13], [-10, 13]], 'talisman', 0.3);
    const P: Pt[] = [[-8, -12.5], [8, -12.5], [8, 12.5], [-8, 12.5]];
    b.fill(YELLOW, P, 0.97, 0.2);
    b.fill(shadeOf(YELLOW), [[1, -12], [8, -12], [8, 12.5], [3, 12.5]], 0.5, 0.5);
    outline(b, P, 1, '#7a5212');
    b.glyph('雷', 0, -1.5, 12, CINNABAR);
    b.brush([[-5.5, 8.5, 1.3], [5.5, 8.5, 1.3]], 0.95, CINNABAR);
  }),
  fire: wpn(-10, -16, 10, 14, (b) => {
    aura(b, [[-10, -15], [10, -15], [10, 13], [-10, 13]], 'talisman', 0.3);
    const P: Pt[] = [[-8, -10], [8, -10], [8, 12.5], [-8, 12.5]];
    b.fill(YELLOW, P, 0.97, 0.2);
    b.fill(shadeOf(YELLOW), [[1, -9.5], [8, -9.5], [8, 12.5], [3, 12.5]], 0.5, 0.5);
    b.fill('#e0683a', [[-8, -10], [-4.5, -15.5], [0, -11], [4.5, -16.5], [8, -10]], 0.95, 0.5);
    outline(b, P, 1, '#7a5212');
    b.glyph('火', 0, 1.5, 12, CINNABAR);
  }),
  gourd: wpn(-11, -14, 11, 16, (b) => {
    aura(b, ell(0, 2, 10.5, 14, 0, Math.PI * 2, 14), 'wine', 0.26);
    b.fill('#cf9446', ell(0, 6, 8.4, 8.4), 0.97, 0.3); b.fill('#cf9446', ell(0, -4.4, 5.4, 5.4), 0.97, 0.3);
    b.fill(litOf('#cf9446'), ell(-2.6, 3.6, 3.4, 4.4, 0, Math.PI * 2, 10), 0.7, 0.4);
    b.fill(shadeOf('#cf9446'), ell(3, 9, 4.4, 3.6, 0, Math.PI * 2, 10), 0.5, 0.5);
    b.line(ell(0, 6, 8.6, 8.6, -Math.PI * 0.2, Math.PI * 1.2, 12), 1.1, 0.88, INK);
    b.line(ell(0, -4.4, 5.6, 5.6, Math.PI * 0.8, Math.PI * 2.2, 10), 1.1, 0.88, INK);
    b.brush([[-5.5, 1, 2], [5.5, 1, 2]], 0.97, CINNABAR); b.brush([[4, 1.5, 1.6], [6.5, 6, 1.4], [5.6, 9, 0.5]], 0.95, CINNABAR);
    b.fill(WOOD, [[-1.8, -9.5], [1.8, -9.5], [1.6, -12.5], [-1.6, -12.5]], 0.97, 0.2);
  }),
  qin: wpn(-29, -10, 29, 14, (b) => {
    aura(b, [[-27, -8], [24, -9], [28, 0], [24, 9], [-27, 8]], 'music', 0.3);
    const P: Pt[] = [[-26, -6], [22, -7.5], [26, 0], [22, 7.5], [-26, 6]];
    b.fill('#3b2b25', P, 0.97, 0.3);
    b.fill('#8a6a55', [[-24, -5], [21, -6.4], [23, -3], [-24, -2]], 0.6, 0.6);
    outline(b, P, 1.1);
    for (const y of [-3.6, -1.2, 1.2, 3.6]) b.line([[-24, y], [23, y * 1.08]], 0.55, 0.8, '#efe6d0');
    for (let i = 0; i < 7; i++) b.disc(-15 + i * 5.2, -6.8, 0.95, '#f6f7fb');
    b.brush([[-26, 4, 1.4], [-28, 8, 1.6], [-27, 12, 0.6]], 0.95, '#5fae8f');
  }),
  flute: wpn(-20, -6, 20, 9, (b) => {
    aura(b, [[-20, -3.5], [20, -3.5], [20, 3.5], [-20, 3.5]], 'music', 0.3);
    const P: Pt[] = [[-19, -2], [19, -2], [19, 2], [-19, 2]];
    b.fill('#e3efe6', [[-19, -2], [19, -2], [19, 0], [-19, 0]], 0.97, 0.2);
    b.fill('#9fc8b4', [[-19, 0], [19, 0], [19, 2], [-19, 2]], 0.97, 0.2);
    outline(b, P, 1, '#2f5a4a');
    for (const x of [-12, 13]) b.line([[x, -2], [x, 2]], 0.9, 0.8, '#2f5a4a');
    for (let i = 0; i < 6; i++) b.disc(-6 + i * 3.6, -0.3, 0.8, INK);
    b.brush([[-15, 2, 1.6], [-16.5, 5, 2], [-15.5, 8, 0.6]], 0.95, CINNABAR);
  }),
  brush: wpn(-20, -7, 24, 7, (b) => {
    aura(b, [[-18, -3.5], [12, -4], [23, 0], [12, 4], [-18, 3.5]], 'ink', 0.28);
    shaft(b, spine(-18, 0, 10, 0, 3, 3), '#c9a870');
    b.brush([[-17, -0.7, 0.9], [8, -0.7, 0.9]], 0.5, '#efd9a8');
    b.brush([[7, 0, 3.6], [10, 0, 3.6]], 0.97, '#8a5a32');
    b.wash(INK, [[10, -4.4], [17, -3.4], [23, 0], [17, 3.4], [10, 4.4]], 0.45, 1.4);
    b.fill(INK, [[9.5, -3.6], [16, -2.6], [21.5, 0], [16, 2.6], [9.5, 3.6]], 0.97, 0.5);
    b.dot(23, 2, 2.4, 0.85, INK);
  }),
  inkstone: wpn(-12, -11, 12, 11, (b) => {
    aura(b, ell(0, 0, 11.5, 9.5, 0, Math.PI * 2, 14), 'ink', 0.28);
    b.fill('#3b3540', ell(0, 0, 10, 8), 0.97, 0.3);
    b.fill('#6a6272', ell(-2.4, -2.4, 6, 3.6, 0, Math.PI * 2, 12), 0.6, 0.5);
    b.fill('#0d0c10', ell(1.2, 1.2, 6, 4.4), 0.97, 0.3);
    b.line(ell(0, 0, 10.2, 8.2, 0, Math.PI * 2, 18), 1.1, 0.9, INK);
    b.disc(-0.6, 0, 1.2, '#8a8a9a', 0.85);
  }),
  crane: wpn(-13, -11, 14, 11, (b) => {
    aura(b, ell(0, 0, 12, 10, 0, Math.PI * 2, 14), 'moon', 0.3);
    const P: Pt[] = [[-10, 0], [0, -9], [3, -1], [12, -3], [4, 3], [0, 9]];
    b.fill('#f7f5ee', P, 0.97, 0.2);
    b.fill('#c9cdd6', [[0, -9], [3, -1], [0, 1], [-10, 0]], 0.7, 0.2);
    outline(b, P, 1.1);
    b.line([[0, -9], [0, 9]], 0.7, 0.6, INK); b.dot(11.5, -3, 2.4, 0.97, CINNABAR);
  }, 'dark'),
  gobowl: wpn(-12, -12, 12, 12, (b) => {
    aura(b, ell(0, 0, 11.5, 11, 0, Math.PI * 2, 14), 'go', 0.24);
    b.fill('#8a5a32', ell(0, 1, 9.4, 8.8), 0.97, 0.3);
    b.fill(litOf('#8a5a32'), ell(-3.4, 1.6, 3.6, 5, 0, Math.PI * 2, 10), 0.6, 0.5);
    b.fill('#4a2f1c', ell(0, -3, 7.2, 2.6), 0.97, 0.2);
    b.line(ell(0, 1, 9.6, 9, 0, Math.PI * 2, 18), 1.1, 0.9, INK);
    b.disc(-2.2, -3.4, 2, '#111'); b.disc(2.4, -3, 2, '#f4efe4'); b.ring(2.4, -3, 2, 0.6, INK, 0.8);
  }),
  moonwheel: wpn(-12, -12, 12, 12, (b) => {
    aura(b, ell(0, 0, 11.5, 11.5, 0, Math.PI * 2, 14), 'moon', 0.34);
    const P: Pt[] = [...ell(0, 0, 10, 10, -Math.PI * 0.8, Math.PI * 0.8, 14), ...ell(4, 0, 7, 8, Math.PI * 0.7, -Math.PI * 0.7, 10)];
    b.fill('#f7f9ff', P, 0.97, 0.3);
    b.fill('#c3d2ea', [...ell(0, 0, 10, 10, Math.PI * 0.1, Math.PI * 0.8, 8), ...ell(1, 0, 6, 7, Math.PI * 0.7, Math.PI * 0.15, 6)], 0.8, 0.3);
    b.line(ell(0, 0, 10.2, 10.2, -Math.PI * 0.8, Math.PI * 0.8, 14), 1.4, 0.92, '#28386a');
    b.line(ell(4, 0, 7, 8, -Math.PI * 0.7, Math.PI * 0.7, 10), 1.1, 0.85, '#28386a');
  }),
  moonmirror: wpn(-12, -12, 14, 12, (b) => {
    aura(b, ell(0, 0, 11.5, 11.5, 0, Math.PI * 2, 14), 'moon', 0.34);
    b.fill('#b0875a', ell(0, 0, 10.4, 10.4), 0.97, 0.3);
    b.fill(shadeOf('#b0875a'), ell(2.4, 2.4, 7, 7, 0, Math.PI * 2, 14), 0.5, 0.5);
    b.line(ell(0, 0, 10.6, 10.6, 0, Math.PI * 2, 18), 1.1, 0.9, INK);
    b.fill('#f7f9ff', ell(0, 0, 7.2, 7.2), 0.97, 0.3);
    b.ring(0, 0, 7.2, 1.2, '#3a548c', 0.75);
    b.disc(-2.2, -2.2, 2.2, '#ffffff');
    b.brush([[8.5, 6.5, 2.2], [12.5, 10.5, 1.6]], 0.97, CINNABAR);
  }),
};

// ───────────────────────────────────────────── projectiles

const shot = (r: number, paint: (b: B) => void, halo: Spec['halo'] = 'none', w = r): Spec =>
  ({ box: [-w, -r, w, r], n: 1, halo, paint: (b) => paint(b) });
/** Enemy shots: a white core, a 朱砂 rim, a faint red bloom — never a gradient per frame. */
function eshot(b: B, r: number, core = '#ffffff', rim = DANGER) {
  b.disc(0, 0, r, rim, 0.25);
  b.disc(0, 0, r * 0.78, rim);
  b.disc(0, 0, r * 0.52, core);
}

/** A soft round glow of radius r under a player shot (baked once: light on paper, never a per-frame
 *  gradient): three pale discs, the tint at its edge, white toward the heart. */
function glow(b: B, r: number, tint: string) {
  b.disc(0, 0, r, tint, 0.16);
  b.disc(0, 0, r * 0.66, tint, 0.24);
  b.disc(0, 0, r * 0.36, '#ffffff', 0.5);
}
/** A soft glow along a shaft from x0 to x1, half-width w. */
function glowLine(b: B, x0: number, x1: number, w: number, tint: string) {
  b.flat((g) => {
    for (const [k, a] of [[1, 0.14], [0.6, 0.22]] as [number, number][]) {
      g.globalAlpha = a; g.fillStyle = tint;
      g.beginPath(); g.ellipse((x0 + x1) / 2, 0, (x1 - x0) / 2 + w * k * 0.5, w * k, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }, [x0 - w, -w, x1 + w, w]);
}

export const PROJ_SPECS: Record<ProjKind, Spec> = {
  dartStar: shot(7, (b) => { glow(b, 7, '#9fc2d6'); b.fill(CLASS_WASH.sword, star(0, 0, 6.6, 1.9, 4, 0), 0.8, 0.3); b.fill('#dfe9ee', star(0, 0, 5, 1.3, 4, 0), 0.97, 0.2); b.disc(0, 0, 1.1, '#ffffff'); }),
  coinBlade: shot(7, (b) => { glow(b, 7, '#f2d77a'); b.fill('#d9b24a', star(0, 0, 6, 4.8, 12, 0), 0.95, 0.2); b.ring(0, 0, 4.2, 0.5, '#8a5a12', 0.8); b.disc(0, 0, 1.6, '#fff4c8'); b.disc(-2, -2.4, 0.9, '#ffffff'); }),
  sunArrow: shot(4, (b) => { glowLine(b, -12, 16, 3.4, '#f2d77a'); b.brush([[-14, 0, 1.2], [10, 0, 1.2]], 0.95, LACQ); b.line([[-12, -0.3], [9, -0.3]], 0.3, 0.7, '#e8b870'); b.fill('#eef2f4', [[9, -2.8], [16, 0], [9, 2.8]], 0.97, 0.2); b.line([[9, -2.8], [16, 0], [9, 2.8]], 0.35, 0.8, INK); b.disc(13.4, -0.5, 0.7, '#ffffff'); b.fill('#f4efe4', [[-15, 0], [-10, -3.4], [-8, 0], [-10, 3.4]], 0.95, 0.2); b.line([[-14, 0], [-9, 0]], 0.3, 0.7, GOLD); }, 'none', 16),
  crossBolt: shot(3, (b) => { glowLine(b, -7, 10, 2.8, '#c9d8e0'); b.brush([[-7, 0, 1.6], [6, 0, 1.6]], 0.95, DARKWOOD); b.fill('#eef2f4', [[5, -2.4], [10, 0], [5, 2.4]], 0.97, 0.2); b.line([[5, -2.4], [10, 0], [5, 2.4]], 0.3, 0.8, INK); b.disc(7.6, -0.4, 0.6, '#ffffff'); }, 'none', 10),
  hookLine: shot(4, (b) => { b.line([[-14, 0], [2, 0]], 0.3, 0.7, INK); b.brush(arcW(4, 1.4, 2.4, 2.8, -1.6, 2, 1, 0.6, 6), 0.95, GOLD); }, 'none', 14),
  // 仙剑: a luminous blade — azure halo, a pale steel body with an azure edge, a white-hot spine and tip
  flySword: shot(4, (b) => {
    glowLine(b, -10, 18, 4.4, '#9fc8dc');
    b.dry([[-22, 0, 4.4], [-6, 0, 3.2]], 0.5, CLASS_WASH.sword);
    blade(b, -6, 17, 3.6, '#d6e8ef', '#2f5f78');
    b.line([[-4, -0.35], [13, -0.35]], 0.45, 0.95, '#ffffff');
    b.disc(15.4, 0, 0.9, '#ffffff');
    b.brush([[-10, 0, 1.8], [-6, 0, 1.8]], 0.95, JADE); b.brush([[-6, -2.6, 1.2], [-6, 2.6, 1.2]], 0.95, '#3f6f5f');
  }, 'none', 22),
  noteGlyph: shot(7, (b) => { glow(b, 7, '#b8dcb0'); b.wash(CLASS_WASH.music, ell(0, 0, 6.4, 6.4), 0.55); b.disc(0, 0, 2.6, '#f4fbef', 0.9); b.brush([[-1, 4, 1.7], [-1, -5.4, 1.3], [4.4, -3.2, 0.6]], 0.97, '#2f5a36'); b.dot(-2.4, 4, 3.6, 0.97, '#2f5a36'); }),
  inkBlob: shot(6, (b) => { b.dot(0, 0, 11, 0.95, INK); b.disc(-1.6, -1.8, 1.4, '#6a6a6a'); }),
  bambooLeaf: shot(3, (b) => { b.brush([[-8, 0, 0.4], [-2, 0, 3.4], [8, 0, 0.3]], 0.9, '#2f5a36'); b.line([[-7, 0], [7, 0]], 0.25, 0.6, '#a8c49a'); }, 'none', 8),
  moonMote: shot(4, (b) => { b.disc(0, 0, 4, MOON, 0.35); b.fill(MOON, [[-4, 0], [0, -3], [5, 0], [0, 3]], 0.95, 0.3); b.disc(0.6, -0.4, 1, '#ffffff'); }),
  moonDisc: shot(9, (b) => { b.fill(MOON, [...ell(0, 0, 9, 9, -Math.PI * 0.8, Math.PI * 0.8, 14), ...ell(4, 0, 6.4, 7, Math.PI * 0.7, -Math.PI * 0.7, 10)], 0.95, 0.3); b.line(ell(0, 0, 9, 9, -Math.PI * 0.8, Math.PI * 0.8, 12), 0.5, 0.5, SILVER); }),
  fireLob: shot(7, (b) => { b.fill('#e0683a', [[-8, -4], [-4, -8], [0, -5], [4, -9], [8, -3], [6, 6], [-6, 6]], 0.85, 0.6); b.fill(YELLOW, rot([[-4, -6], [4, -6], [4, 6], [-4, 6]], 0.3), 0.95, 0.2); b.line([[-1, -3], [1, 3]], 0.5, 0.9, CINNABAR); }),
  gourdLob: shot(7, (b) => { b.fill('#cf9446', ell(0, 2.4, 5.4, 5.4), 0.95, 0.3); b.fill('#cf9446', ell(0, -4, 3.4, 3.4), 0.95, 0.3); b.brush([[-3, -1, 1], [3, -1, 1]], 0.9, CINNABAR); }),
  peachCharm: shot(8, (b) => { b.fill(YELLOW, [[-4, -8], [4, -8], [4, 8], [-4, 8]], 0.95, 0.2); b.brush([[0, -6, 1.2], [0, 6, 1.2]], 0.95, CINNABAR); b.disc(0, -4, 1.4, CINNABAR); }),
  verseGlyph: shot(8, (b) => { b.wash('#8e2b3a', ell(0, 0, 8, 8), 0.25); b.glyph('月', 0, 0, 13, '#3a1a20'); }),
  crescentWave: shot(14, (b) => { b.wash(CLASS_WASH.sword, [...ell(-6, 0, 14, 14, -1.2, 1.2, 10), ...ell(-10, 0, 10, 11, 1.1, -1.1, 10)], 0.55, 2); b.brush(arcW(-6, 0, 14, 14, -1.1, 1.1, 1.6, 1.6, 10), 0.7, '#dfeaf0'); }),
  eFireball: shot(9, (b) => { b.disc(-4, 0, 6, DANGER, 0.2); eshot(b, 8); }),
  eSeed: shot(7, (b) => eshot(b, 6.4, '#fffbe8')),
  eBubble: shot(8, (b) => { eshot(b, 7.4, '#f2f8ff'); b.disc(-2, -2, 1.3, '#ffffff'); }),
  ePearl: shot(8, (b) => { eshot(b, 7.4, '#fbf6ee'); b.disc(-1.6, -2, 1.6, '#ffffff'); }),
  eStone: shot(8, (b) => { b.disc(0, 0, 8, DANGER, 0.9); b.fill('#8a857c', ell(0, 0, 5.8, 5.2), 0.97, 0.3); b.disc(-1.4, -1.4, 1.4, '#ffffff'); }),
  eAxe: shot(10, (b) => { b.disc(0, 0, 10, DANGER, 0.22); b.brush([[-8, 0, 2], [6, 0, 2]], 0.95, '#6b4a2a'); b.fill('#f4f4f2', [[2, -8], [9, -6], [9, 6], [2, 8], [4, 0]], 0.97, 0.2); b.line([[2, -8], [9, -6], [9, 6], [2, 8]], 1.2, 0.95, DANGER); }),
  eFrost: shot(8, (b) => { b.fill(DANGER, [[-9, 0], [0, -5], [10, 0], [0, 5]], 0.95, 0.2); b.fill('#ffffff', [[-6, 0], [0, -3], [7, 0], [0, 3]], 0.97, 0.2); }, 'none', 10),
  eGold: shot(7, (b) => { b.fill(DANGER, rot([[0, -7], [5, 0], [0, 8], [-5, 0]], 0), 0.95, 0.2); b.fill('#ffe79a', [[0, -4.6], [3, 0], [0, 5.4], [-3, 0]], 0.97, 0.2); }),
  eFoxfire: shot(9, (b) => { b.fill('#e04a5a', [[-10, 0], [-4, -6], [4, -7], [9, 0], [4, 7], [-4, 6]], 0.9, 0.6); b.disc(1, 0, 4, '#fff0f4'); }, 'none', 10),
  eMoonShard: shot(8, (b) => { b.fill(DANGER, [[-8, 0], [0, -6], [10, 0], [0, 6]], 0.95, 0.2); b.fill('#ffffff', [[-5, 0], [0, -3.4], [7, 0], [0, 3.4]], 0.97, 0.2); }, 'none', 10),
  eOrb: shot(8, (b) => eshot(b, 7.4)),
  // 桃木剑 in flight: a peachwood blade in its gamboge light — warm wood with carved notches, a white-hot
  // spine and tip, a gold guard and tassel (no cinnabar: red stays the enemy's)
  peachSword: shot(4, (b) => {
    glowLine(b, -10, 18, 4.8, '#f2cf6a');
    b.dry([[-22, 0, 4.4], [-6, 0, 3.2]], 0.5, '#e2b45a');
    b.fill('#c88a5a', [[-6, -2.1], [13, -2.1], [18, 0], [13, 2.1], [-6, 2.1]], 0.96, 0.3);
    b.line([[-6, -2.1], [13, -2.1], [18, 0], [13, 2.1], [-6, 2.1]], 0.4, 0.8, '#5a3418');
    for (const x of [0, 5, 10]) b.line([[x, -1.3], [x + 1.6, 1.3]], 0.4, 0.8, '#6b3a1a');
    b.line([[-4, -0.45], [12, -0.45]], 0.45, 0.9, '#fff6dc');
    b.disc(16, 0, 0.9, '#ffffff');
    b.brush([[-10, 0, 1.8], [-6, 0, 1.8]], 0.95, WOOD); b.brush([[-6, -2.7, 1.2], [-6, 2.7, 1.2]], 0.95, GOLD);
    b.brush([[-10, 0, 1], [-13, 3, 0.8], [-12, 6, 0.3]], 0.9, GOLD);
  }, 'none', 22),
};

// ───────────────────────────────────────────── summons (allies: indigo washes, never 焦墨 silhouettes)

const sum = (r: number, paint: (b: B) => void, halo: Spec['halo'] = 'dark'): Spec => ({ box: [-r, -r, r, r], n: 1, halo, paint: (b) => paint(b) });
const IND = CLASS_WASH.ink;

export const SUM_SPECS: Record<SummonKind, Spec> = {
  moque: sum(12, (b) => { b.wash(IND, ell(-1, 0, 7, 5), 0.8); b.brush([[-6, 0, 1], [-11, -3, 2.6], [-12, 2, 0.4]], 0.7, IND); b.dot(5, -1.6, 6, 0.9, IND); b.fill('#d9a62e', [[8, -2], [11, -1.4], [8, 0]], 0.95, 0.2); b.disc(6, -2.4, 0.8, PAPER); b.brush([[-2, -2, 1], [-4, -9, 3], [2, -4, 0.6]], 0.6, IND); }),
  moli: sum(16, (b) => { b.wash(IND, [[-14, 0], [-8, -6], [6, -6], [14, 0], [6, 6], [-8, 6]], 0.8); b.fill(IND, [[-14, 0], [-20, -6], [-18, 0], [-20, 6]], 0.8, 0.5); b.brush(arcW(0, 0, 10, 4, 3.6, 5.8, 0.6, 0.6, 6), 0.5, '#1f3346'); b.disc(9, -1.6, 1.2, PAPER); b.brush([[13, 1, 0.6], [17, 4, 0.3]], 0.8, IND); }),
  mohe: sum(18, (b) => { b.wash(IND, ell(-2, 2, 9, 5), 0.8); b.brush([[-4, 0, 2], [-10, -12, 5], [-18, -14, 1]], 0.7, IND); b.brush([[-4, 4, 2], [-10, 14, 5], [-18, 16, 1]], 0.7, IND); b.brush([[6, 0, 2], [11, -6, 1.6], [13, -10, 1.4]], 0.85, IND); b.dot(13.5, -11, 4, 0.9, IND); b.dot(14.5, -13, 2.4, 0.9, CINNABAR); b.brush([[15, -10, 0.8], [20, -8, 0.4]], 0.9, '#1f3346'); }),
  mohu: sum(22, (b) => {
    b.wash(IND, [[-16, -6], [0, -9], [12, -6], [14, 6], [-16, 6]], 0.8);
    for (const x of [-12, -6, 6, 11]) b.brush([[x, 5, 3.4], [x, 14, 2.6]], 0.75, IND);
    for (let x = -12; x < 10; x += 5) b.brush([[x, -8, 1.8], [x - 1, -2, 1]], 0.85, '#1f3346');
    b.wash(IND, ell(17, -5, 7, 6.4), 0.85); b.dot(14, -11, 4, 0.9, IND); b.dot(20, -11, 4, 0.9, IND); b.disc(19, -6, 1.2, '#e9c46a');
    b.brush([[-16, -2, 2.4], [-22, -10, 1.6], [-20, -16, 0.4]], 0.7, IND);
  }),
  yantai: sum(12, (b) => { b.fill('#3b3540', ell(0, 1, 11, 9), 0.97, 0.3); b.fill('#0d0c10', ell(1, 0, 7, 5), 0.97, 0.3); b.wash(IND, ell(1, 0, 6, 4), 0.5); b.disc(-1, -1.4, 1.2, '#8a8a9a', 0.8); }),
  zhihe: sum(13, (b) => { b.fill('#f7f5ee', [[-11, 0], [0, -11], [3, -1], [13, -3], [4, 3], [0, 11]], 0.97, 0.2); b.line([[-11, 0], [0, -11], [3, -1], [13, -3], [4, 3], [0, 11], [-11, 0]], 0.5, 0.85, INK); b.line([[0, -11], [0, 11]], 0.3, 0.5, INK); b.dot(12, -3, 1.6, 0.9, CINNABAR); }),
  mozhu: sum(14, (b) => { for (let i = 0; i < 3; i++) b.fill('#2f5a36', [[-2, 12 - i * 8], [2, 12 - i * 8], [1.8, 5 - i * 8], [-1.8, 5 - i * 8]], 0.95, 0.2); for (const [a, s] of [[-0.6, 1], [0.5, -1], [-0.2, 1]] as Pt[]) b.brush(rotW([[0, -6, 0.4], [7, -6, 2.4], [13, -6, 0.3]], a * s, 0, -6), 0.85, '#2f5a36'); b.wash(IND, ell(0, 12, 8, 3), 0.4); }),
  molong: sum(34, (b) => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([-28 + t * 48, Math.sin(t * Math.PI * 1.6) * 8, 2 + 7 * Math.sin(t * Math.PI * 0.95 + 0.1)]); }
    b.brush(pts, 0.8, IND);
    for (let i = 1; i < 10; i += 2) b.brush([[pts[i][0], pts[i][1] - pts[i][2] / 2, 1.2], [pts[i][0] - 3, pts[i][1] - pts[i][2] / 2 - 4, 0.4]], 0.8, '#1f3346');
    b.wash(IND, ell(24, 0, 8, 6), 0.9); b.brush([[22, -4, 1.6], [26, -12, 1.4], [22, -16, 0.4]], 0.9, '#1f3346');
    b.brush([[30, 2, 0.8], [36, 6, 0.6], [40, 4, 0.3]], 0.9, '#1f3346'); b.disc(27, -1.6, 1.4, '#e9c46a');
  }),
  canjian: sum(12, (b) => { b.brush([[-10, 0, 2], [-4, 0, 2]], 0.9, DARKWOOD); b.brush([[-4, -3, 1.2], [-4, 3, 1.2]], 0.9, GOLD); b.fill(STEEL, [[-3, -1.6], [7, -1.6], [9, 0.4], [6, 1.6], [-3, 1.6]], 0.95, 0.2); b.line([[7, -1.6], [8, 0], [6.5, 0.8], [9, 0.4]], 0.4, 0.8, INK); }, 'paper'),
  demonSelf: sum(18, (b) => { b.wash('#6a3d7a', [[-8, -4], [8, -4], [10, 14], [-10, 14]], 0.85); b.wash('#6a3d7a', ell(1, -11, 6.4, 6.6), 0.9); b.disc(3, -11, 1.1, DANGER); b.disc(5.6, -11, 1, DANGER); b.brush([[-9, 14, 2], [-12, 18, 0.6]], 0.6, '#6a3d7a'); }, 'paper'),
  inkAlly: sum(16, (b) => { b.ring(0, 0, 13, 1.6, '#ffffff', 0.9); b.ring(0, 0, 13, 0.8, IND, 0.8); b.wash(IND, ell(0, 0, 12, 12), 0.35); }, 'none'),
  flowerSprout: sum(9, (b) => { b.brush([[0, 8, 1.2], [0, 0, 1]], 0.9, '#3e5a3a'); b.brush([[0, 4, 0.4], [4, 2, 2], [6, 3, 0.3]], 0.8, '#5f8a6e'); for (let i = 0; i < 5; i++) b.fill('#e7a3b3', rot(ell(3.4, -2, 3, 2, 0, Math.PI * 2, 8), (i / 5) * Math.PI * 2, 0, -2), 0.9, 0.3); b.disc(0, -2, 1.4, GOLD); }, 'paper'),
};
void PAPER; void spine;
