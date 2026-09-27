// The nine bosses (GDD §14), one look per phase from BOSS_REG[].phases; phase 3 (倒悬) is phase 2
// with burning eyes and a vermilion aura. Big, simple silhouettes: they must read under a hundred
// enemy shots. They face right; breathe them procedurally (squash) in the engine.
import type { BossId } from '../ids';
import { B, blob, ell, arcW, rot, spine, star, type Pt, type Spec } from './kit';
import { CINNABAR, DANGER, GOLD, INK, PAPER, SILVER } from './palette';

type P = 0 | 1 | 2 | 3;
const LAKE = '#1d2430', FOREST = '#161a15', PALACE = '#1c2230';
const W = '#f4f2ea';

const big = (r: number, paint: (b: B, p: P) => void, halo: Spec['halo'] = 'paper', box?: Spec['box']): ((p: number) => Spec) =>
  (p) => ({ box: box ?? [-r * 1.55, -r * 1.55, r * 1.55, r * 1.55], n: 1, halo, paint: (b) => { paint(b, Math.min(3, p) as P); if (p >= 3) b.ring(0, 0, r * 1.35, r * 0.05, DANGER, 0.55); } });

function scales(b: B, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) {
    const x = cx + i * rx * 0.24, y = cy + j * ry * 0.5 + (i % 2 ? ry * 0.2 : 0);
    b.line(ell(x, y, rx * 0.12, ry * 0.2, -Math.PI / 2, Math.PI / 2, 5), 0.6, 0.55, color);
  }
}
/** Burning eyes for 倒悬. */
function wrath(b: B, p: P, pts: Pt[]) {
  if (p < 3) return;
  for (const [x, y] of pts) { b.dot(x, y, 7, 0.8, DANGER); b.disc(x, y, 1.6, '#fff4e0'); }
}

export const BOSS_SPEC: Record<BossId, (p: number) => Spec> = {
  carp: big(60, (b, p) => {
    const gold = '#c98a2a', arch = p === 1 ? -14 : 0;
    // tail
    b.fill(gold, [[-50, arch * 0.4], [-78, -22 + arch], [-70, 0], [-78, 22 + arch * 0.3]], 0.9, 1);
    for (const y of [-12, 0, 12]) b.line([[-52, arch * 0.4], [-74, y + arch * 0.6]], 0.8, 0.6, '#7a4f12');
    b.fill(gold, [[-54, arch * 0.4], [-20, -30 + arch], [20, -32 + arch * 0.6], [52, -12], [58, 4], [40, 24], [0, 30], [-30, 22]], 0.95, 0.8);
    b.fill('#e9c46a', [[-20, 12], [20, 16], [40, 16], [10, 26], [-20, 22]], 0.7, 1.2);
    scales(b, 0, -2 + arch * 0.4, 70, 30, '#7a4f12');
    b.fill(gold, [[-6, -28 + arch], [8, -52 + arch], [22, -30 + arch * 0.6]], 0.9, 0.6);
    for (const x of [0, 8, 14]) b.line([[x, -30 + arch], [x + 4, -48 + arch]], 0.6, 0.6, '#7a4f12');
    b.fill('#b0761e', [[10, 18], [26, 38], [30, 20]], 0.9, 0.5);
    b.disc(42, -8, 5.4, PAPER); b.disc(44, -8, 3, '#111');
    b.brush([[56, 4, 3], [62, 8, 2], [60, 12, 0.6]], 0.9, INK);
    if (p >= 2) {
      // half a dragon: horns and whiskers
      b.brush([[40, -18, 3], [46, -34, 2.4], [40, -44, 0.8]], 0.95, INK); b.brush([[48, -16, 3], [58, -30, 2.2], [60, -40, 0.6]], 0.95, INK);
      b.brush([[58, 2, 1.6], [72, -6, 1.2], [84, 2, 0.4]], 0.9, INK); b.brush([[58, 6, 1.6], [70, 16, 1.2], [80, 12, 0.4]], 0.9, INK);
      b.fill('#2f7552', [[-30, -26], [-10, -34], [-20, -20]], 0.7, 0.5);
    }
    if (p === 0) for (const [x, y, r] of [[72, -18, 4], [80, -30, 3], [70, -40, 2.4]] as [number, number, number][]) b.ring(x, y, r, 1, SILVER, 0.9);
    wrath(b, p, [[43, -8]]);
  }),
  mirage: big(58, (b, p) => {
    if (p >= 1) for (let i = 0; i < (p === 2 ? 6 : 3); i++) {
      const x = -50 + i * 22, h = 30 + ((i * 37) % 23);
      b.wash('#8ea4bf', [[x, -40], [x, -40 - h], [x + 6, -44 - h], [x + 12, -40 - h], [x + 12, -40]], 0.3, 3);
      b.line([[x - 2, -40 - h], [x + 6, -48 - h], [x + 14, -40 - h]], 0.6, 0.4, LAKE);
    }
    const open = p === 2 ? 22 : 16;
    b.fill(LAKE, ell(0, 10, 58, 30, 0, Math.PI, 18).concat([[-58, 10]]), 0.96, 0.6);
    b.fill('#2c3a4c', ell(0, 10 - open, 58, 38, Math.PI, Math.PI * 2, 18), 0.96, 0.6);
    for (let i = -5; i <= 5; i++) b.line([[i * 4, 10 - open - 2], [i * 10.5, -24 - open]], 0.9, 0.5, '#8ea4bf');
    b.fill('#07090d', [[-54, 10 - open], [54, 10 - open], [54, 10], [-54, 10]], 0.9, 0.5);
    b.disc(0, 10 - open / 2, open * 0.36, '#f3f1ec'); b.disc(-3, 10 - open / 2 - 3, open * 0.1, '#ffffff');
    b.disc(-26, 10 - open / 2, 3, PAPER); b.disc(26, 10 - open / 2, 3, PAPER);
    b.wash(SILVER, blob(40, -30, 26, 12, 3), 0.25);
    wrath(b, p, [[-26, 10 - open / 2], [26, 10 - open / 2]]);
  }),
  moonwater: big(62, (b, p) => {
    for (const r of [62, 76, 90]) b.line(ell(0, 0, r, r * 0.9, 0, Math.PI * 2, 30), 1.1, 0.35, '#51708a');
    b.fill('#f3f4f6', ell(0, 0, 50, 50, 0, Math.PI * 2, 28), 0.97, 1.4);
    b.wash('#c9d3dc', blob(-12, -8, 16, 12, 5), 0.35);
    b.wash('#c9d3dc', blob(16, 14, 10, 8, 9), 0.3);
    if (p === 1) b.fill('#1d2430', ell(18, 0, 44, 50, -Math.PI / 2, Math.PI / 2, 16), 0.85, 1.2);
    if (p >= 2) {
      // a chain of ink monkeys hanging toward you
      for (let i = 0; i < 4; i++) {
        const x = -40 + i * 26, y = -64 + i * 10;
        b.fill(INK, ell(x, y, 6, 7), 0.95, 0.4); b.dot(x + 2, y - 7, 7, 0.95, INK);
        b.brush([[x + 4, y - 2, 1.6], [x + 18, y + 6, 1.2]], 0.95, INK);
        b.brush([[x - 4, y + 4, 1.4], [x - 10, y + 12, 1], [x - 6, y + 16, 0.3]], 0.9, INK);
        b.disc(x + 3.4, y - 8, 1, PAPER);
      }
    }
    b.line(ell(0, 0, 50, 50, 0, Math.PI * 2, 28), 1.4, 0.8, '#51708a');
    b.eyes(0, -2, 12, 4.5, 0.2, '#ffffff', '#1d2430');
    wrath(b, p, [[-12, -2], [12, -2]]);
  }),
  kui: big(56, (b, p) => {
    const hide = '#6e737a';
    b.brush(spine(4, 20, 6, 70, 18, 14), 0.97, INK);
    b.fill(INK, ell(6, 76, 14, 5), 0.95, 0.4);
    b.fill(hide, blob(0, 0, 58, 40, 7, 0.05), 0.97, 0.8);
    b.fill('#9aa0a6', ell(-6, -2, 40, 28), 0.8, 1.2);
    b.line(ell(-6, -2, 40, 28, 0, Math.PI * 2, 24), 1.6, 0.8, INK);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.disc(-6 + Math.cos(a) * 36, -2 + Math.sin(a) * 25, 2, '#c9a646'); }
    b.fill(hide, ell(58, -12, 20, 16), 0.97, 0.5);
    b.brush([[50, -26, 4], [44, -44, 3], [52, -54, 1]], 0.95, '#d8d0bc'); b.brush([[62, -26, 4], [70, -44, 3], [64, -54, 1]], 0.95, '#d8d0bc');
    b.disc(66, -14, 4.4, '#f0d060'); b.disc(67, -14, 2, '#111');
    if (p >= 1) for (const [x, y] of [[-40, -30], [30, 30], [-50, 20]] as Pt[]) b.brush([[x, y, 1.4], [x + 6, y - 8, 2], [x + 2, y - 10, 1.6], [x + 9, y - 20, 0.4]], 0.95, GOLD);
    if (p >= 2) for (const [x0, y0, x1, y1] of [[-30, -14, -4, 8], [-4, 8, 18, -6], [-4, 8, -10, 24]] as [number, number, number, number][]) b.brush([[x0, y0, 2], [x1, y1, 0.6]], 0.95, INK);
    wrath(b, p, [[66, -14]]);
  }),
  fox: big(54, (b, p) => {
    const tails = p === 0 ? 9 : p === 1 ? 6 : 3;
    for (let i = 0; i < tails; i++) {
      const a = Math.PI * 0.62 + (i - (tails - 1) / 2) * (p === 2 ? 0.45 : 0.2);
      const x1 = -20 + Math.cos(a) * 80, y1 = Math.sin(a) * -1 * 80 * 0.8;
      b.brush([[-20, 0, 12], [(-20 + x1) / 2, y1 / 2 - 8, 14], [x1, y1, 5]], 0.95, W);
      b.fill(CINNABAR, ell(x1, y1, 7, 7), 0.85, 1);
      b.line([[-20, 0], [(-20 + x1) / 2, y1 / 2 - 8], [x1, y1]], 0.6, 0.45, INK);
    }
    b.fill(W, [[-30, 0], [0, -20], [30, -14], [40, 6], [20, 22], [-26, 18]], 0.97, 0.8);
    b.line([[-30, 0], [0, -20], [30, -14], [40, 6], [20, 22], [-26, 18], [-30, 0]], 1, 0.8, INK);
    for (const [x, d] of [[-18, 0], [-6, 2], [16, 0], [26, 2]] as Pt[]) b.brush([[x, 16, 5], [x + d, 36, 4]], 0.95, W), b.line([[x - 2.5, 16], [x - 2.5 + d, 36]], 0.6, 0.6, INK);
    b.fill(W, [[30, -10], [44, -28], [62, -22], [74, -12], [56, -4], [36, 2]], 0.97, 0.6);
    b.fill(W, [[42, -24], [44, -42], [52, -26]], 0.97, 0.3); b.fill(W, [[52, -24], [58, -40], [62, -22]], 0.97, 0.3);
    b.line([[30, -10], [44, -28], [44, -42], [52, -26], [58, -40], [62, -22], [74, -12], [56, -4]], 0.9, 0.85, INK);
    b.fill(CINNABAR, [[44, -34], [45, -40], [49, -30]], 0.7, 0.3);
    b.brush([[54, -20, 1.4], [60, -18, 0.6]], 0.95, INK); b.disc(56, -19, 1.4, '#e9c46a');
    b.dot(73, -12, 3, 0.95, INK);
    if (p === 1) b.wash(SILVER, blob(0, 44, 50, 8, 2), 0.3);
    wrath(b, p, [[56, -19]]);
  }, 'dark', [-100, -86, 84, 56]),
  xingtian: big(68, (b, p) => {
    const skin = '#6a4a3a';
    for (const [x, d] of [[-20, 0], [18, 0]] as Pt[]) b.brush([[x, 40, 18], [x + d, 88, 16]], 0.97, INK);
    b.fill(skin, [[-44, -46], [44, -46], [52, 20], [34, 50], [-34, 50], [-52, 20]], 0.97, 0.8);
    b.fill(INK, [[-40, 34], [40, 34], [36, 52], [-36, 52]], 0.95, 0.4);
    // eyes for nipples, a mouth for a navel
    for (const x of [-20, 20]) { b.fill(PAPER, ell(x, -18, 10, 7), 0.97, 0.3); b.disc(x + 2, -18, 4, p >= 3 ? DANGER : '#111'); b.brush([[x - 12, -30, 2.4], [x + 10, -28, 1.2]], 0.95, INK); }
    b.fill('#7a2f28', ell(0, 16, 14, 7), 0.95, 0.4);
    for (let i = -2; i <= 2; i++) b.line([[i * 5, 11], [i * 5, 21]], 0.8, 0.9, PAPER);
    const axeUp = p === 0 || p === 2;
    b.brush(axeUp ? [[44, -30, 10], [66, -60, 8]] : [[44, -20, 10], [62, 6, 8]], 0.97, skin);
    b.brush(axeUp ? spine(66, -60, 100, -104, 4, 4) : spine(62, 6, 98, 30, 4, 4), 0.95, '#6b4a2a');
    b.fill('#8f9aa0', axeUp ? [[90, -96], [110, -120], [118, -92], [102, -86]] : [[92, 22], [110, 8], [118, 36], [100, 40]], 0.97, 0.3);
    const shield = p === 1 ? [70, -10] : [-62, 0];
    b.brush([[-44, -30, 10], [shield[0] * 0.8, shield[1], 8]], 0.97, skin);
    b.fill('#3b3a36', ell(shield[0], shield[1], 30, 38), 0.97, 0.5);
    b.line(ell(shield[0], shield[1], 30, 38, 0, Math.PI * 2, 20), 1.6, 0.9, GOLD);
    b.fill(GOLD, star(shield[0], shield[1], 12, 5, 6), 0.8, 0.3);
    if (p === 2) b.line(ell(0, 0, 110, 60, 0, Math.PI * 2, 30), 1.2, 0.5, DANGER);
  }, 'paper', [-114, -124, 124, 96]),
  wugang: big(56, (b, p) => {
    const skin = p >= 2 ? '#c46a4a' : '#d9a67a';
    for (const [x, d] of [[-16, -4], [14, 4]] as Pt[]) b.brush([[x, 30, 14], [x + d, 64, 12]], 0.97, '#3b3a36');
    b.fill('#4e5a4a', [[-36, -24], [34, -24], [42, 34], [-40, 34]], 0.97, 0.6);
    b.fill(skin, [[-10, -24], [12, -24], [6, 4], [-6, 4]], 0.9, 0.3);
    b.brush([[-40, 30, 5], [42, 30, 5]], 0.9, '#7a4f12');
    b.fill(skin, ell(0, -42, 18, 18), 0.96, 0.4);
    b.fill(INK, [[-18, -44], [-16, -58], [0, -64], [16, -58], [18, -44], [6, -52], [-6, -52]], 0.95, 0.4);
    b.fill(INK, [[-8, -34], [8, -34], [10, -22], [0, -16], [-10, -22]], 0.95, 0.4);
    b.brush([[-9, -44, 2.4], [-2, -42, 1]], 0.95, INK); b.brush([[9, -44, 2.4], [2, -42, 1]], 0.95, INK);
    b.disc(-5, -40, 1.8, '#111'); b.disc(6, -40, 1.8, '#111');
    const throwing = p === 1;
    b.brush(throwing ? [[30, -20, 10], [58, -40, 8]] : [[30, -20, 10], [48, 0, 8]], 0.97, skin);
    const [ax, ay] = throwing ? [58, -40] : [48, 0];
    b.brush(spine(ax, ay, throwing ? ax + 10 : ax - 30, throwing ? ay - 50 : ay - 60, 4.4, 4), 0.95, '#6b4a2a');
    const [hx, hy] = throwing ? [ax + 10, ay - 50] : [ax - 30, ay - 60];
    b.fill('#9aa6ae', [[hx - 16, hy - 6], [hx + 16, hy - 16], [hx + 20, hy + 8], [hx - 6, hy + 8]], 0.97, 0.3);
    b.line([[hx - 16, hy - 6], [hx + 16, hy - 16], [hx + 20, hy + 8]], 0.8, 0.8, INK);
    b.brush([[-30, -20, 10], [-46, 10, 8]], 0.97, skin);
    if (p >= 2) b.wash(DANGER, ell(0, -42, 26, 26), 0.2);
    wrath(b, p, [[-5, -40], [6, -40]]);
  }, 'paper', [-60, -130, 100, 70]),
  goldtoad: big(62, (b, p) => {
    const g = '#c79a2a', leap = p === 2 ? -18 : 0;
    if (leap) b.wash(INK, ell(0, 50, 50, 12), 0.25);
    b.fill(PALACE, ell(0, 8 + leap, 62, 42), 0.97, 0.8);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; b.dot(Math.cos(a) * 38 * ((i % 3) / 3 + 0.4), 8 + leap + Math.sin(a) * 24 * ((i % 2) * 0.5 + 0.5), 9, 0.9, g); }
    b.brush([[-44, 30 + leap, 14], [-64, 50 + leap, 10]], 0.97, PALACE); b.brush([[30, 36 + leap, 14], [40, 56 + leap, 10]], 0.97, PALACE); b.brush([[-6, 44 + leap, 14], [-4, 62 + leap, 10]], 0.97, PALACE);
    b.fill(PALACE, ell(52, -14 + leap, 30, 24), 0.97, 0.6);
    b.dot(40, -38 + leap, 18, 0.97, PALACE); b.dot(64, -38 + leap, 16, 0.97, PALACE);
    for (const [x, r] of [[40, 6], [64, 5.4]] as Pt[]) { b.disc(x, -39 + leap, r, '#f0d060'); b.disc(x + 1, -39 + leap, r * 0.4, '#111'); }
    // a crown with no coin in it
    b.fill(GOLD, [[34, -52 + leap], [38, -64 + leap], [46, -56 + leap], [52, -68 + leap], [58, -56 + leap], [66, -64 + leap], [70, -52 + leap]], 0.95, 0.3);
    b.line([[34, -52 + leap], [70, -52 + leap]], 1.2, 0.9, '#7a4f12');
    if (p === 0) b.brush([[78, -8 + leap, 8], [110, -4, 7], [128, 0, 6]], 0.95, '#b83a4b');
    if (p === 1) { b.fill('#2a0f0c', ell(74, -4, 12, 10), 0.95, 0.3); for (const [x, y] of [[92, -20], [100, 4], [88, 16]] as Pt[]) b.fill(GOLD, rot([[0, -4], [3, 0], [0, 6], [-3, 0]], 0.4).map(([a, c]) => [a + x, c + y] as Pt), 0.95, 0.2); }
    b.line([[62, -2 + leap], [80, -6 + leap]], 1.4, 0.8, g);
    wrath(b, p, [[40, -39], [64, -39]]);
  }, 'paper', [-80, -74, 132, 72]),
  eclipse: big(70, (b, p) => {
    const lunge = p === 0;
    b.wash('#0d1020', blob(10, 0, 88, 62, 4), 0.3, 6);
    for (const [x, d] of [[-50, -6], [-30, 6], [30, lunge ? -14 : -6], [50, 6]] as Pt[]) b.brush([[x, 20, 14], [x + d, 64, 11]], 0.97, INK);
    b.dry([[-60, -10, 16], [-96, -34, 12], [-110, -20, 4]], 0.9, INK);
    b.fill('#101218', [[-64, -16], [-20, -34], [30, -32], [60, -14], [56, 26], [-60, 24]], 0.98, 0.8);
    const hx = lunge ? 86 : 74, hy = lunge ? -6 : -20;
    b.fill('#101218', [[40, -26], [hx - 20, hy - 30], [hx + 30, hy - 10], [hx + 36, hy + 8], [hx + 4, hy + 26], [44, 16]], 0.98, 0.6);
    b.fill('#101218', [[hx - 16, hy - 26], [hx - 12, hy - 54], [hx, hy - 24]], 0.97, 0.3);
    // the moon: in its jaws, swallowed (only the eyes glow), then spat back
    if (p === 0) b.fill('#f6f7fb', ell(hx + 34, hy + 8, 16, 16), 0.97, 0.6);
    if (p === 2) { b.fill('#f6f7fb', ell(hx + 56, hy + 6, 22, 22), 0.97, 0.8); for (let i = 0; i < 4; i++) b.brush(rot([[hx + 56, hy + 6], [hx + 116, hy + 6]], i * Math.PI / 2 + 0.3, hx + 56, hy + 6).map(([x, y], j) => [x, y, j ? 2 : 8] as [number, number, number]), 0.5, '#f6f7fb'); }
    b.dot(hx + 4, hy - 10, 11, 0.95, p === 1 ? '#ffe08a' : '#e9c46a'); b.disc(hx + 6, hy - 10, 2.4, p >= 3 ? DANGER : '#111');
    if (p === 1) { b.dot(hx - 10, hy - 8, 9, 0.9, '#ffe08a'); b.wash('#ffe08a', ell(hx, hy - 10, 30, 16), 0.15); }
    b.line([[hx + 6, hy + 14], [hx + 30, hy + 10]], 1.4, 0.9, '#f4efe4');
    wrath(b, p, [[hx + 4, hy - 10]]);
  }, 'paper', [-116, -90, 190, 90]),
};
void arcW; void CINNABAR; void FOREST;
