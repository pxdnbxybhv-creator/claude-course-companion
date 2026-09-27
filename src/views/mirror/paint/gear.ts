// Weapons (27), projectiles (27) and summons (12). Weapons and projectiles point along +x; weapons
// are anchored at the grip (rotate them to the aim). Player shots are pale washes in class colours;
// enemy shots (e…) have a white core and a 朱砂 rim and are 1.5× larger — the brightest thing on screen.
import type { ProjKind, SummonKind, WeaponId } from '../ids';
import { B, ell, arcW, rot, rotW, spine, star, type Pt, type Spec } from './kit';
import { CINNABAR, CLASS_WASH, DANGER, GOLD, INK, JADE, MOON, PAPER, SILVER } from './palette';

const STEEL = '#aeb7bd', WOOD = '#7b5a3a', DARKWOOD = '#4a3526', LACQ = '#8e2b2b', YELLOW = '#e3c25a';

const wpn = (x0: number, y0: number, x1: number, y1: number, paint: (b: B) => void, halo: Spec['halo'] = 'paper'): Spec =>
  ({ box: [x0, y0, x1, y1], n: 1, halo, paint: (b) => paint(b) });

function blade(b: B, x0: number, x1: number, w: number, color: string = STEEL, edge: string = INK) {
  b.fill(color, [[x0, -w / 2], [x1 - w, -w / 2], [x1, 0], [x1 - w, w / 2], [x0, w / 2]], 0.95, 0.2);
  b.line([[x0, -w / 2], [x1 - w, -w / 2], [x1, 0], [x1 - w, w / 2], [x0, w / 2]], 0.4, 0.8, edge);
  b.line([[x0 + 1, 0], [x1 - w * 1.4, 0]], 0.3, 0.5, '#ffffff');
}
function hilt(b: B, len: number, guard = GOLD, grip = DARKWOOD) {
  b.brush([[-len, 0, 2.2], [0, 0, 2.2]], 0.95, grip);
  b.brush([[0, -3.4, 1.6], [0, 3.4, 1.6]], 0.95, guard);
}

export const WPN_SPECS: Record<WeaponId, Spec> = {
  qingfeng: wpn(-8, -5, 40, 5, (b) => { hilt(b, 7); blade(b, 1, 38, 3.2, '#9fc2c0'); b.brush([[-7, 0, 1], [-10, 3, 0.8], [-9, 6, 0.3]], 0.9, CINNABAR); }),
  longquan: wpn(-6, -12, 30, 12, (b) => {
    for (const s of [-1, 1]) {
      const a = s * 0.32;
      b.brush(rotW([[-5, 0, 2.2], [0, 0, 2.2]], a), 0.95, DARKWOOD);
      b.brush(rotW([[0, -3, 1.4], [0, 3, 1.4]], a), 0.95, GOLD);
      b.fill(STEEL, rot([[1, -1.4], [23, -1.4], [26, 0], [23, 1.4], [1, 1.4]], a), 0.95, 0.2);
      b.line(rot([[1, -1.4], [23, -1.4], [26, 0], [23, 1.4], [1, 1.4]], a), 0.4, 0.8, INK);
    }
  }),
  yanyue: wpn(-24, -14, 52, 10, (b) => {
    b.brush(spine(-24, 0, 34, 0, 2.4, 2.4), 0.95, '#5b2c24');
    b.fill('#d4d8d4', [[30, -2], [38, -10], [50, -12], [48, -4], [42, 2], [32, 4]], 0.95, 0.3);
    b.line([[30, -2], [38, -10], [50, -12], [48, -4], [42, 2], [32, 4]], 0.6, 0.9, INK);
    b.dot(30, 0, 6, 0.95, '#2f7552'); b.brush([[29, 3, 1.4], [28, 8, 1], [30, 10, 0.3]], 0.9, CINNABAR);
  }),
  hoe: wpn(-22, -10, 26, 10, (b) => {
    b.brush(spine(-22, 0, 20, 0, 2, 2), 0.95, WOOD);
    b.fill('#8e969a', [[18, -2], [26, -2], [25, 9], [19, 9]], 0.95, 0.2); b.line([[19, 9], [25, 9]], 0.8, 0.9, INK);
    b.brush([[6, 0, 1], [8, -6, 1.4], [5, -9, 0.4]], 0.85, '#5f8a6e'); b.dot(8, -8, 2.6, 0.9, '#e7a3b3');
  }),
  pestle: wpn(-6, -7, 30, 7, (b) => { b.fill('#e4efe6', [[-5, -2.4], [20, -3.4], [28, -6], [30, 0], [28, 6], [20, 3.4], [-5, 2.4]], 0.95, 0.4); b.line([[-5, -2.4], [20, -3.4], [28, -6], [30, 0], [28, 6], [20, 3.4], [-5, 2.4]], 0.4, 0.6, INK); b.dot(25, -2, 2, 0.4, JADE); }),
  claw: wpn(-4, -10, 20, 10, (b) => {
    b.fill('#e0924a', ell(6, 0, 8, 7), 0.95, 0.4);
    for (const y of [-5, 0, 5]) { b.dot(12, y, 4, 0.95, '#e0924a'); b.brush([[13, y, 1.4], [19, y + y * 0.2, 0.4]], 0.95, INK); }
    b.dot(4, 0, 4, 0.8, '#e7a3a0');
  }),
  drunkfist: wpn(-10, -10, 16, 10, (b) => {
    b.brush([[-10, 3, 2], [-4, 6, 3], [0, 4, 2.4], [-6, 9, 1]], 0.8, '#8e2b3a');
    b.fill('#f2d0b0', ell(6, 0, 8, 7), 0.95, 0.4);
    for (const y of [-4, -1.3, 1.3, 4]) b.line([[9, y], [13, y]], 0.5, 0.6, INK);
    b.line(ell(6, 0, 8, 7, 0, Math.PI * 2, 14), 0.5, 0.7, INK);
  }),
  dart: wpn(-8, -8, 8, 8, (b) => { b.fill('#8e969a', star(0, 0, 8, 2.4, 4, 0), 0.95, 0.2); b.disc(0, 0, 1.4, INK); }),
  coindart: wpn(-8, -8, 8, 8, (b) => { b.fill('#d9b24a', star(0, 0, 8, 6.4, 12, 0), 0.95, 0.2); b.ring(0, 0, 3.4, 1, '#7a5212', 0.9); b.disc(0, 0, 1.6, '#f2d77a'); }),
  sunbow: wpn(-6, -22, 12, 22, (b) => {
    b.brush(arcW(-18, 0, 26, 21, -0.95, 0.95, 2.6, 2.6, 12), 0.95, LACQ);
    b.line([[-2.8, -17], [-2.8, 17]], 0.4, 0.8, INK);
    b.brush([[-2.8, 0, 1], [12, 0, 1]], 0.9, WOOD); b.fill(SILVER, [[10, -2], [14, 0], [10, 2]], 0.95, 0.2);
  }),
  repeater: wpn(-10, -12, 22, 12, (b) => {
    b.fill(DARKWOOD, [[-10, -3], [18, -3], [18, 3], [-10, 3]], 0.95, 0.2);
    b.fill(WOOD, [[-2, -9], [10, -9], [10, -3], [-2, -3]], 0.95, 0.2);
    b.brush(arcW(8, 0, 6, 11, -1.4, 1.4, 1.6, 1.6, 8), 0.95, DARKWOOD);
    b.line([[13, -11], [13, 11]], 0.3, 0.7, INK); b.fill(SILVER, [[18, -1.6], [22, 0], [18, 1.6]], 0.95, 0.2);
  }),
  rod: wpn(-10, -12, 44, 8, (b) => { b.brush(spine(-10, 2, 38, -8, 2.2, 0.8), 0.9, '#8f7b48'); for (const x of [2, 14, 26]) b.line([[x, 0], [x + 1, -2.4]], 0.5, 0.7, INK); b.line([[38, -8], [42, 2]], 0.25, 0.6, INK); b.brush(arcW(42, 4, 2, 2.4, -1.6, 1.8, 0.8, 0.5, 6), 0.95, GOLD); }),
  qingping: wpn(-8, -5, 32, 5, (b) => { b.brush([[-8, 0, 1.6], [0, 0, 2]], 0.9, JADE); blade(b, 0, 32, 3, '#cfe3d6', '#3f6f5f'); }),
  casket: wpn(-12, -14, 12, 9, (b) => { b.fill('#1b1916', [[-11, -8], [11, -8], [11, 8], [-11, 8]], 0.97, 0.2); b.line([[-11, -2], [11, -2]], 0.5, 0.6, GOLD); for (const x of [-6, 0, 6]) b.brush([[x, -8, 1.2], [x + 1, -13, 0.4]], 0.9, STEEL); b.dot(0, 3, 3, 0.9, GOLD); }),
  peach: wpn(-10, -6, 34, 6, (b) => { hilt(b, 7, CINNABAR, '#a8703a'); b.fill('#c88a5a', [[1, -2.2], [30, -2.2], [34, 0], [30, 2.2], [1, 2.2]], 0.95, 0.3); for (const x of [8, 16, 24]) b.line([[x, -1.4], [x + 2, 1.4]], 0.4, 0.8, CINNABAR); b.brush([[-7, 0, 1.4], [-10, 4, 1], [-8, 8, 0.3]], 0.95, CINNABAR); }),
  seven: wpn(-8, -5, 38, 5, (b) => { hilt(b, 7); blade(b, 1, 36, 3.4); for (const [x, y] of [[6, -0.6], [10, 0.6], [14, -0.4], [18, 0.8], [23, 0.2], [27, -0.8], [31, 0]] as Pt[]) b.disc(x, y, 0.8, GOLD); }),
  thunder: wpn(-8, -12, 8, 12, (b) => { b.fill(YELLOW, [[-7, -11], [7, -11], [7, 11], [-7, 11]], 0.95, 0.2); b.glyph('雷', 0, -1, 10, CINNABAR); b.line([[-5, 7], [5, 7]], 0.8, 0.8, CINNABAR); }),
  fire: wpn(-8, -14, 8, 12, (b) => { b.fill(YELLOW, [[-7, -9], [7, -9], [7, 11], [-7, 11]], 0.95, 0.2); b.fill('#e0683a', [[-7, -9], [-4, -14], [0, -10], [4, -15], [7, -9]], 0.9, 0.5); b.glyph('火', 0, 2, 10, CINNABAR); }),
  gourd: wpn(-10, -12, 10, 14, (b) => { b.fill('#cf9446', ell(0, 6, 8, 8), 0.95, 0.3); b.fill('#cf9446', ell(0, -4, 5, 5), 0.95, 0.3); b.brush([[-5, 1, 1.4], [5, 1, 1.4]], 0.9, CINNABAR); b.fill(WOOD, [[-1.6, -9], [1.6, -9], [1.4, -12], [-1.4, -12]], 0.95, 0.2); b.line(ell(0, 6, 8, 8, 0.2, 2.9, 8), 0.5, 0.6, INK); }),
  qin: wpn(-24, -7, 24, 7, (b) => { b.fill('#3b2b25', [[-24, -5], [22, -6], [24, 0], [22, 6], [-24, 5]], 0.97, 0.3); for (const y of [-3, -1, 1, 3]) b.line([[-22, y], [22, y * 1.1]], 0.25, 0.6, '#e9dfc8'); for (let i = 0; i < 7; i++) b.disc(-14 + i * 5, -5.6, 0.6, '#f4efe4'); }),
  flute: wpn(-18, -4, 18, 4, (b) => { b.fill('#eef1ea', [[-18, -1.6], [18, -1.6], [18, 1.6], [-18, 1.6]], 0.95, 0.2); b.line([[-18, -1.6], [18, -1.6], [18, 1.6], [-18, 1.6], [-18, -1.6]], 0.3, 0.6, INK); for (let i = 0; i < 6; i++) b.disc(-6 + i * 3.6, 0, 0.6, INK); b.brush([[-14, 1.6, 1], [-15, 4, 0.8]], 0.9, CINNABAR); }),
  brush: wpn(-18, -6, 20, 6, (b) => { b.brush(spine(-18, 0, 10, 0, 2.6, 2.6), 0.95, '#c9a870'); b.fill(INK, [[9, -3.6], [16, -2.6], [21, 0], [16, 2.6], [9, 3.6]], 0.97, 0.5); b.dot(22, 1.5, 2, 0.8, INK); }),
  inkstone: wpn(-10, -9, 10, 9, (b) => { b.fill('#3b3540', ell(0, 0, 10, 8), 0.97, 0.3); b.fill('#0d0c10', ell(1, 1, 6, 4.4), 0.97, 0.3); b.disc(-1, -0.4, 1, '#6a6a7a', 0.8); }),
  crane: wpn(-12, -10, 12, 10, (b) => { b.fill('#f7f5ee', [[-10, 0], [0, -9], [3, -1], [12, -3], [4, 3], [0, 9]], 0.97, 0.2); b.line([[-10, 0], [0, -9], [3, -1], [12, -3], [4, 3], [0, 9], [-10, 0]], 0.4, 0.8, INK); b.line([[0, -9], [0, 9]], 0.3, 0.5, INK); b.dot(11, -3, 1.4, 0.9, CINNABAR); }, 'dark'),
  gobowl: wpn(-10, -10, 10, 10, (b) => { b.fill('#8a5a32', ell(0, 1, 9, 8.4), 0.97, 0.3); b.fill('#5b3a22', ell(0, -3, 7, 2.4), 0.95, 0.2); b.disc(-2, -3.4, 1.6, '#111'); b.disc(2, -3, 1.6, '#f4efe4'); b.line(ell(0, 1, 9, 8.4, 0.3, 2.8, 8), 0.4, 0.6, INK); }),
  moonwheel: wpn(-10, -10, 10, 10, (b) => { b.fill(SILVER, [...ell(0, 0, 10, 10, -Math.PI * 0.8, Math.PI * 0.8, 14), ...ell(4, 0, 7, 8, Math.PI * 0.7, -Math.PI * 0.7, 10)], 0.95, 0.3); b.line(ell(0, 0, 10, 10, -Math.PI * 0.8, Math.PI * 0.8, 14), 0.5, 0.7, INK); }),
  moonmirror: wpn(-10, -10, 12, 10, (b) => { b.fill('#b0875a', ell(0, 0, 10, 10), 0.97, 0.3); b.fill('#f3f1e6', ell(0, 0, 7.4, 7.4), 0.97, 0.3); b.disc(-2, -2, 2, '#ffffff'); b.brush([[8, 6, 1.6], [12, 10, 1.2]], 0.95, CINNABAR); }),
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
