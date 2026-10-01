// The nine bosses (GDD §14), one look per phase from BOSS_REG[].phases; phase 3 (倒悬) is phase 2
// with burning eyes and a vermilion aura. Big, simple silhouettes: they must read under a hundred
// enemy shots. They face right.
//
// m8 redraw (art.md §4.4, R1–R5 at boss scale): every phase has two idle frames (v 0, 1: a real breath —
// fins, tails, jaws and chests move; the engine alternates them at 2 Hz); masses in three values (a bleed
// or a lit and a shade wash, ≤ 3 washes a frame); contours ≈ 3 u; scale and feather lines 1.4 u; eyes
// r ≥ 4 with a ring and a glint. Phase accents stay: 倒悬 keeps its vermilion ring and burning eyes.
import type { BossId } from '../ids';
import { B, blob, ell, arcW, rot, spine, star, TAU, type Pt, type Spec } from './kit';
import { CINNABAR, DANGER, GOLD, INK, PAPER, SILVER } from './palette';
import { sheen } from './brushwork';

type P = 0 | 1 | 2 | 3;
const LAKE = '#1d2430', PALACE = '#1c2230';
const W = '#f4f2ea';
const SLATE = '#3a4150', SKY = '#3a4562';
const STEEL_LIT = '#dfe9ec', STEEL_SH = '#86a0a8';
const E = (cx: number, cy: number, rx: number, ry: number, n = 20): Pt[] => ell(cx, cy, rx, ry, 0, TAU, n);

/**
 * A boss look: two idle frames per phase (v 0, 1). 倒悬 (phase 3) adds the vermilion ring. `tight` (m8) is the
 * box of phases 0–2 when their marks need less than `box` (the canvas covers box ∪ marks): the second idle frame
 * costs atlas memory, and a square box round a long carp is mostly empty.
 */
const big = (r: number, paint: (b: B, p: P, v: number) => void, halo: Spec['halo'] = 'paper', box?: Spec['box'], tight?: Spec['box']): ((p: number) => Spec) =>
  (p) => ({ box: (p < 3 ? tight : undefined) ?? box ?? [-r * 1.55, -r * 1.55, r * 1.55, r * 1.55], n: 2, halo, paint: (b, v) => { paint(b, Math.min(3, p) as P, v & 1); if (p >= 3) b.ring(0, 0, r * 1.35, r * 0.05, DANGER, 0.55); } });

function scales(b: B, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) {
    const x = cx + i * rx * 0.24, y = cy + j * ry * 0.5 + (i % 2 ? ry * 0.2 : 0);
    b.line(ell(x, y, rx * 0.12, ry * 0.2, -Math.PI / 2, Math.PI / 2, 5), 1.4, 0.6, color);
  }
}
/** Burning eyes for 倒悬. */
function wrath(b: B, p: P, pts: Pt[]) {
  if (p < 3) return;
  for (const [x, y] of pts) { b.dot(x, y, 9, 0.8, DANGER); b.disc(x, y, 2, '#fff4e0'); }
}
/** A boss's eye (R5): an ink ring → the white or an iris → a pupil → a glint; `glow` adds a bloom 2× its size. */
function eyeB(b: B, x: number, y: number, r: number, iris = '#f6f1e4', pupil = '#111', look = 0.25, glow = false) {
  b.flat((g) => {
    if (glow) { g.globalAlpha = 0.28; g.fillStyle = iris; g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill(); g.globalAlpha = 1; }
    g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(x, y, r + 1, 0, TAU); g.fill();
    g.fillStyle = iris; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = pupil; g.beginPath(); g.arc(x + r * look, y + r * 0.1, r * 0.5, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + r * look - r * 0.2, y - r * 0.24, r * 0.22, 0, TAU); g.fill();
  }, glow ? [x - r * 2, y - r * 2, x + r * 2, y + r * 2] : [x - r - 1, y - r - 1, x + r + 1, y + r + 1]);
}

/**
 * 水中月. `moon`: −1 the plain half-dark moon of its second phase; 0–7 a reflection's moon phase
 * (0 full … 4 new; 1–3 waning, dark on the right; 5–7 waxing, dark on the left); null: none.
 */
function moonwater(b: B, p: P, moon: number | null, v: number) {
  const ri = v ? 4 : 0;
  for (const r of [62, 76, 90]) b.line(ell(0, 0, r + ri * (r / 62), (r + ri * (r / 62)) * 0.9, 0, TAU, 30), 1.4, 0.4, '#51708a');
  // 烘云托月: an indigo bleed round the white moon (the same as 月华's pearl: it is the big moon)
  b.wash('#51708a', E(0, 0, 55 + ri * 0.5, 55 + ri * 0.5, 24), 0.4, 3);
  b.fill('#f3f4f6', E(0, 0, 50, 50, 28), 0.97, 1.4);
  b.wash('#c9d3dc', blob(-12 + v, -8, 16, 12, 5), 0.35);
  b.fill('#c9d3dc', blob(16, 14 - v, 10, 8, 9), 0.3, 2);
  if (moon === -1) b.fill('#1d2430', ell(18, 0, 44, 50, -Math.PI / 2, Math.PI / 2, 16), 0.85, 1.2);
  else if (moon !== null) {
    // the dark part: from the limb on the dark side back along the terminator (x = cos α · limb)
    const k = ((moon % 8) + 8) % 8, R = 50, c = Math.cos((k / 8) * Math.PI * 2), side = k >= 1 && k <= 3 ? 1 : -1;
    if (k !== 0) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 + (i / 16) * Math.PI; pts.push([side * R * Math.cos(t), R * Math.sin(t)]); }
      for (let i = 16; i >= 0; i--) { const t = -Math.PI / 2 + (i / 16) * Math.PI; pts.push([side * c * R * Math.cos(t), R * Math.sin(t)]); }
      b.fill('#1d2430', pts, 0.9, 1);
    }
  }
  if (p >= 2) {
    // a chain of ink monkeys hanging toward you
    for (let i = 0; i < 4; i++) {
      const x = -40 + i * 26, y = -64 + i * 10 + (v ? (i % 2 ? 2 : -2) : 0);
      b.fill(INK, E(x, y, 6, 7, 12), 0.97, 0.4); b.dot(x + 2, y - 7, 7, 0.97, INK);
      b.brush([[x + 4, y - 2, 2], [x + 18, y + 6, 1.4]], 0.95, INK);
      b.brush([[x - 4, y + 4, 1.8], [x - 10, y + 12, 1.4], [x - 6, y + 16, 0.6]], 0.92, INK);
      b.disc(x + 3.4, y - 8, 1.3, PAPER);
    }
  }
  b.line(E(0, 0, 50, 50, 28).concat([[50, 0]]), 2.2, 0.85, '#51708a');
  eyeB(b, -12, -2 + v * 0.8, 5, '#ffffff', '#1d2430', 0.2); eyeB(b, 12, -2 + v * 0.8, 5, '#ffffff', '#1d2430', 0.2);
  wrath(b, p, [[-12, -2], [12, -2]]);
}
/** 水中月's reflections: its second-phase look wearing moon phase k (0–7) (one frame: eight of them are baked). */
export const MOON_SPEC = (k: number): Spec => ({ ...big(62, (b, p) => moonwater(b, p, k, 0))(1), n: 1 });

export const BOSS_SPEC: Record<BossId, (p: number) => Spec> = {
  carp: big(60, (b, p, v) => {
    const gold = '#c98a2a', arch = (p === 1 ? -14 : 0) + (v ? -2.5 : 0), sw = v ? 5 : 0;
    // tail (it sways on the breath)
    b.fill(gold, [[-50, arch * 0.4], [-78, -22 + arch + sw], [-70, sw * 0.4], [-78, 22 + arch * 0.3 + sw]], 0.95, 1);
    b.fill('#8e2b2b', [[-56, arch * 0.4 + 2], [-76, 6 + sw * 0.8], [-77, 20 + arch * 0.3 + sw]], 0.4, 1.4);
    for (const y of [-12, 0, 12]) b.line([[-52, arch * 0.4], [-74, y + arch * 0.6 + sw * 0.7]], 1.4, 0.6, '#7a4f12');
    b.fill(gold, [[-54, arch * 0.4], [-20, -30 + arch], [20, -32 + arch * 0.6], [52, -12], [58, 4], [40, 24], [0, 30], [-30, 22]], 0.97, 0.8);
    // gold-red in washes: lit gold on the back, a deep red under the belly
    b.wash('#f2c768', [[-40, -6 + arch * 0.5], [-16, -24 + arch], [18, -26 + arch * 0.6], [30, -14], [-4, -8], [-30, 0]], 0.6, 2);
    b.wash('#8e2b2b', [[-26, 14], [6, 20], [34, 16], [24, 26], [0, 29], [-26, 22]], 0.45, 2);
    b.fill('#e9c46a', [[-20, 12], [20, 16], [40, 16], [10, 26], [-20, 22]], 0.6, 1.2);
    scales(b, 0, -2 + arch * 0.4, 70, 30, '#7a4f12');
    b.brush([[-28, 22, 1.4], [0, 30.4, 3], [38, 24.4, 2.6], [56, 6, 1.2]], 0.85, '#5a3408');
    b.brush([[-48, -2 + arch * 0.4, 1.6], [-20, -27 + arch, 3], [20, -29.6 + arch * 0.6, 3], [50, -11, 1.4]], 0.8, '#5a3408');
    b.fill(gold, [[-6, -28 + arch], [8, -52 + arch + (v ? 3 : 0)], [22, -30 + arch * 0.6]], 0.92, 0.6);
    for (const x of [0, 8, 14]) b.line([[x, -30 + arch], [x + 4, -48 + arch + (v ? 3 : 0)]], 1.2, 0.6, '#7a4f12');
    // the pectoral fin beats
    b.fill('#b0761e', v ? [[10, 18], [22, 40], [32, 22]] : [[10, 18], [26, 38], [30, 20]], 0.92, 0.5);
    b.line(v ? [[12, 20], [22, 36]] : [[12, 20], [25, 34]], 1.2, 0.6, '#7a4f12');
    eyeB(b, 42, -8, 5.4);
    b.brush([[56, 4, 3], [62, 8 + v, 2], [60, 12 + v, 0.6]], 0.92, INK);
    if (p >= 2) {
      // half a dragon: horns and whiskers (dry, 1.6 → 0.4)
      b.brush([[40, -18, 3], [46, -34, 2.4], [40, -44, 0.8]], 0.95, INK); b.brush([[48, -16, 3], [58, -30, 2.2], [60, -40, 0.6]], 0.95, INK);
      b.dry([[58, 2, 1.8], [72, -6 + v * 2, 1.2], [84, 2 + v * 2, 0.4]], 0.9, INK, 0.4); b.dry([[58, 6, 1.8], [70, 16 - v * 2, 1.2], [80, 12 - v * 2, 0.4]], 0.9, INK, 0.4);
      b.fill('#2f7552', [[-30, -26], [-10, -34], [-20, -20]], 0.7, 0.5);
    }
    if (p === 0) for (const [x, y, r] of [[72, -18 - v * 3, 4], [80, -30 - v * 3, 3], [70, -40 - v * 3, 2.4]] as [number, number, number][]) b.ring(x, y, r, 1.2, SILVER, 0.9);
    wrath(b, p, [[43, -8]]);
  }, 'paper', undefined, [-82, -68, 86, 42]),
  mirage: big(58, (b, p, v) => {
    if (p >= 1) {
      // the mirage's towers: one pale wash (the effect is the breath, not the brush)
      const pts: Pt[] = [];
      for (let i = 0; i < (p === 2 ? 6 : 3); i++) {
        const x = -50 + i * 22 + v * 2, h = 30 + ((i * 37) % 23) + v * 3;
        pts.push([x, -40], [x, -40 - h], [x + 6, -44 - h], [x + 12, -40 - h], [x + 12, -40]);
      }
      b.wash('#8ea4bf', pts, 0.3, 3);
      for (let i = 0; i < (p === 2 ? 6 : 3); i++) {
        const x = -50 + i * 22 + v * 2, h = 30 + ((i * 37) % 23) + v * 3;
        b.line([[x - 2, -40 - h], [x + 6, -48 - h], [x + 14, -40 - h]], 1.2, 0.45, LAKE);
      }
    }
    const open = (p === 2 ? 22 : 16) + (v ? 3 : 0);
    b.fill(LAKE, ell(0, 10, 58, 30, 0, Math.PI, 18).concat([[-58, 10]]), 0.97, 0.6);
    b.fill('#2c3a4c', ell(0, 10 - open, 58, 38, Math.PI, Math.PI * 2, 18), 0.97, 0.6);
    b.wash('#51677f', ell(-14, -6 - open, 30, 16, Math.PI * 1.05, Math.PI * 1.95, 12).concat([[-8, 6 - open], [-36, 6 - open]]), 0.6, 2);
    for (let i = -5; i <= 5; i++) b.line([[i * 4, 10 - open - 2], [i * 10.5, -24 - open]], 1.4, 0.55, '#8ea4bf');
    sheen(b, 0, 10 - open, 55, 35, Math.PI * 1.1, Math.PI * 1.45, 3);
    b.line(ell(0, 10 - open, 58, 38, Math.PI, Math.PI * 2, 18), 2.4, 0.75, INK);
    b.fill('#07090d', [[-54, 10 - open], [54, 10 - open], [54, 10], [-54, 10]], 0.92, 0.5);
    b.disc(0, 10 - open / 2, open * 0.36, '#f3f1ec'); b.disc(-3, 10 - open / 2 - 3, open * 0.1, '#ffffff');
    eyeB(b, -26, 10 - open / 2, 4); eyeB(b, 26, 10 - open / 2, 4);
    b.wash(SILVER, blob(40, -30 - v * 3, 26, 12, 3), 0.25);
    wrath(b, p, [[-26, 10 - open / 2], [26, 10 - open / 2]]);
  }, 'paper', undefined, [-70, -104, 90, 42]),
  moonwater: big(62, (b, p, v) => moonwater(b, p, p === 1 ? -1 : null, v)),
  kui: big(56, (b, p, v) => {
    const hide = '#6e737a', sw = v ? 2 : 0;
    b.brush(spine(4, 20, 6, 70, 18, 14), 0.97, INK);
    b.fill(INK, E(6, 76, 14, 5, 14), 0.95, 0.4);
    b.fill(hide, blob(0, 0, 58, 40 + sw, 7, 0.05), 0.97, 0.8);
    // the drum-belly: lit upper left, shade lower right, an ink rim and gold studs
    b.fill('#9aa0a6', E(-6, -2, 40 + sw, 28 + sw, 24), 0.85, 1.2);
    b.wash('#cdd2d6', E(-18, -12, 18, 11, 16), 0.6, 2);
    b.wash('#4a4f56', ell(-6, -2, 38, 26, -Math.PI * 0.1, Math.PI * 0.7, 10).concat([[-6, -2]]), 0.5, 2);
    b.brush(arcW(-6, -2, 40 + sw, 28 + sw, 0, TAU, 3, 3, 24), 0.85, INK);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; b.disc(-6 + Math.cos(a) * (36 + sw), -2 + Math.sin(a) * (25 + sw), 2.4, '#c9a646'); }
    sheen(b, 0, 0, 54, 37, Math.PI * 1.08, Math.PI * 1.45, 3);
    b.brush(arcW(0, 1, 58, 40 + sw, -Math.PI * 0.25, Math.PI * 0.95, 3, 1.6, 14), 0.85, INK);
    b.fill(hide, E(58, -12 - sw, 20, 16, 16), 0.97, 0.5);
    b.brush([[50, -26 - sw, 4.4], [44, -44 - sw, 3.2], [52, -54 - sw, 1.2]], 0.95, '#d8d0bc'); b.brush([[62, -26 - sw, 4.4], [70, -44 - sw, 3.2], [64, -54 - sw, 1.2]], 0.95, '#d8d0bc');
    eyeB(b, 66, -14 - sw, 4.6, '#f0d060', '#111', 0.2, true);
    if (p >= 1) for (const [x, y] of [[-40, -30], [30, 30], [-50, 20]] as Pt[]) b.brush([[x, y, 1.8], [x + 6, y - 8 - sw, 2.4], [x + 2, y - 10 - sw, 2], [x + 9, y - 20 - sw, 0.6]], 0.95, '#e0a526');
    if (p >= 2) for (const [x0, y0, x1, y1] of [[-30, -14, -4, 8], [-4, 8, 18, -6], [-4, 8, -10, 24]] as [number, number, number, number][]) b.brush([[x0, y0, 2.4], [x1, y1, 0.8]], 0.95, INK);
    wrath(b, p, [[66, -14]]);
  }, 'paper', undefined, [-60, -58, 80, 83]),
  fox: big(54, (b, p, v) => {
    const tails = p === 0 ? 9 : p === 1 ? 6 : 3;
    for (let i = 0; i < tails; i++) {
      const a = Math.PI * 0.62 + (i - (tails - 1) / 2) * (p === 2 ? 0.45 : 0.2) + (v ? 0.05 * (i % 2 ? 1 : -1) : 0);
      const x1 = -20 + Math.cos(a) * 80, y1 = Math.sin(a) * -1 * 80 * 0.8;
      const mx = (-20 + x1) / 2, my = y1 / 2 - 8;
      b.brush([[-20, 0, 12], [mx, my, 14], [x1, y1, 5]], 0.97, W);
      // each tail a dry sweep, 6 → 1 u, in two inks
      b.dry([[-18, -2, 6], [mx, my - 3, 4], [x1, y1, 1]], 0.55, i % 2 ? '#8a8276' : '#5a564e', 0.5);
      b.fill(CINNABAR, E(x1, y1, 7, 7, 12), 0.88, 1);
    }
    const lift = v ? -1.5 : 0;
    b.fill(W, [[-30, 0], [0, -20 + lift], [30, -14 + lift], [40, 6], [20, 22], [-26, 18]], 0.97, 0.8);
    b.fill('#d9d4c8', [[-24, 10], [18, 14], [30, 10], [20, 21], [-24, 17]], 0.7, 1.2);
    b.line([[-30, 0], [0, -20 + lift], [30, -14 + lift], [40, 6], [20, 22], [-26, 18], [-30, 0]], 2.2, 0.85, INK);
    for (const [x, d] of [[-18, 0], [-6, 2], [16, 0], [26, 2]] as Pt[]) b.brush([[x, 16, 5], [x + d, 36, 4]], 0.97, W), b.line([[x - 2.5, 16], [x - 2.5 + d, 36]], 1.4, 0.7, INK);
    const hy = v ? -1.5 : 0;
    b.fill(W, [[30, -10 + hy], [44, -28 + hy], [62, -22 + hy], [74, -12 + hy], [56, -4 + hy], [36, 2]], 0.97, 0.6);
    b.fill(W, [[42, -24 + hy], [44, -42 + hy], [52, -26 + hy]], 0.97, 0.3); b.fill(W, [[52, -24 + hy], [58, -40 + hy], [62, -22 + hy]], 0.97, 0.3);
    b.line([[30, -10 + hy], [44, -28 + hy], [44, -42 + hy], [52, -26 + hy], [58, -40 + hy], [62, -22 + hy], [74, -12 + hy], [56, -4 + hy]], 2, 0.85, INK);
    b.fill(CINNABAR, [[44, -34 + hy], [45, -40 + hy], [49, -30 + hy]], 0.75, 0.3);
    b.brush([[52, -21 + hy, 1.8], [60, -18 + hy, 0.8]], 0.95, INK);
    // the fox's eye: gold with a slit pupil
    b.flat((g) => {
      const x = 56, y = -19 + hy;
      g.globalAlpha = 0.28; g.fillStyle = '#e9c46a'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#0c0c10'; g.beginPath(); g.ellipse(x, y, 4, 3, 0, 0, TAU); g.fill();
      g.fillStyle = '#e9c46a'; g.beginPath(); g.ellipse(x, y, 3.2, 2.3, 0, 0, TAU); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(x + 0.4, y, 0.8, 2.1, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 1.1, y - 0.9, 0.7, 0, TAU); g.fill();
    }, [50, -25 + hy, 62, -13 + hy]);
    b.dot(73, -12 + hy, 3.4, 0.97, INK);
    wrath(b, p, [[56, -19]]);
  }, 'dark', [-100, -86, 84, 56], [-103, -73, 77, 40]),
  xingtian: big(68, (b, p, v) => {
    const skin = '#6a4a3a', ch = v ? 2 : 0;
    for (const [x, d] of [[-20, 0], [18, 0]] as Pt[]) b.brush([[x, 40, 18], [x + d, 88, 16]], 0.97, INK);
    b.wash(INK, [[-46, -48 - ch], [46, -48 - ch], [55, 20], [36, 53], [-36, 53], [-55, 20]], 0.45, 2);
    b.fill(skin, [[-44, -46 - ch], [44, -46 - ch], [52, 20], [34, 50], [-34, 50], [-52, 20]], 0.97, 0.8);
    b.wash('#8e6a56', [[-40, -42 - ch], [-6, -42 - ch], [-12, -4], [-44, 6]], 0.6, 2);
    b.fill(INK, [[-40, 34], [40, 34], [36, 52], [-36, 52]], 0.97, 0.4);
    b.brush([[-43, -44 - ch, 2.4], [-51.4, 18, 3.2], [-35, 49, 1.6]], 0.88, INK); b.brush([[43, -44 - ch, 2.6], [51.4, 18, 3.4], [35, 49, 1.8]], 0.9, INK);
    sheen(b, 0, 0, 48, 44, Math.PI * 1.1, Math.PI * 1.42, 3);
    // eyes for nipples (r 5, glints), a mouth for a navel
    for (const x of [-20, 20]) {
      b.fill(PAPER, E(x, -18 - ch, 10, 7 + ch * 0.4, 14), 0.97, 0.3);
      b.line(ell(x, -18 - ch, 10, 7 + ch * 0.4, Math.PI, TAU, 8), 1.4, 0.8, INK);
      eyeB(b, x + 2, -18 - ch, 4.4, p >= 3 ? DANGER : '#2a1a14', '#111', 0.15);
      b.brush([[x - 12, -30 - ch, 3], [x + 10, -28 - ch, 1.4]], 0.95, INK);
    }
    b.fill('#7a2f28', E(0, 16, 14, 7 + ch, 14), 0.97, 0.4);
    for (let i = -2; i <= 2; i++) b.line([[i * 5, 11 - ch * 0.5], [i * 5, 21 + ch * 0.5]], 1.4, 0.9, PAPER);
    const axeUp = p === 0 || p === 2, lift = v ? -3 : 0;
    b.brush(axeUp ? [[44, -30, 10], [66, -60 + lift, 8]] : [[44, -20, 10], [62, 6 + lift, 8]], 0.97, skin);
    b.brush(axeUp ? spine(66, -60 + lift, 100, -104 + lift, 4.4, 4.4) : spine(62, 6 + lift, 98, 30 + lift, 4.4, 4.4), 0.95, '#6b4a2a');
    // the axe head in two steels with an ink edge
    const ah: Pt[] = axeUp ? [[90, -96], [110, -120], [118, -92], [102, -86]] : [[92, 22], [110, 8], [118, 36], [100, 40]];
    const AH = ah.map(([x, y]) => [x, y + lift] as Pt);
    b.fill(STEEL_SH, AH, 0.97, 0.3);
    b.fill(STEEL_LIT, [AH[0], AH[1], [(AH[1][0] + AH[2][0]) / 2, (AH[1][1] + AH[2][1]) / 2], [(AH[0][0] + AH[3][0]) / 2, (AH[0][1] + AH[3][1]) / 2]], 0.95, 0.3);
    b.line([AH[1], AH[2]], 1.6, 0.9, INK);
    const shield = p === 1 ? [70, -10] : [-62, 0];
    b.brush([[-44, -30, 10], [shield[0] * 0.8, shield[1] + ch, 8]], 0.97, skin);
    b.fill('#3b3a36', E(shield[0], shield[1] + ch, 30, 38, 20), 0.97, 0.5);
    b.fill('#5e5c56', E(shield[0] - 8, shield[1] - 10 + ch, 14, 18, 14), 0.6, 1.2);
    b.line(E(shield[0], shield[1] + ch, 30, 38, 20).concat([[shield[0] + 30, shield[1] + ch]]), 2.4, 0.9, GOLD);
    b.fill(GOLD, star(shield[0], shield[1] + ch, 12, 5, 6), 0.85, 0.3);
    if (p === 2) b.line(E(0, 0, 110, 60, 30), 1.4, 0.5, DANGER);
  }, 'paper', [-114, -124, 124, 96]),
  wugang: big(56, (b, p, v) => {
    const skin = p >= 2 ? '#c46a4a' : '#d9a67a', robe = '#4e5a4a', ch = v ? 1.5 : 0;
    for (const [x, d] of [[-16, -4], [14, 4]] as Pt[]) b.brush([[x, 30, 14], [x + d, 64, 12]], 0.97, '#3b3a36');
    b.fill(robe, [[-36, -24 - ch], [34, -24 - ch], [42, 34], [-40, 34]], 0.97, 0.6);
    b.wash('#6e7c68', [[-32, -20 - ch], [-12, -20 - ch], [-16, 20], [-36, 26]], 0.6, 2);
    // osmanthus: gold dots on the robe
    for (const [x, y] of [[-26, -6], [-18, 14], [22, -10], [28, 18], [-30, 24]] as Pt[]) { b.dot(x, y, 4, 0.92, '#e9b84a'); b.dot(x - 0.5, y - 0.5, 1.4, 0.9, '#fff1c4'); }
    b.fill(skin, [[-10, -24 - ch], [12, -24 - ch], [6, 4], [-6, 4]], 0.92, 0.3);
    b.brush([[-40, 30, 5], [42, 30, 5]], 0.92, '#7a4f12');
    b.brush([[-38, -22 - ch, 3], [-42, 6, 2.6], [-41, 32, 1.4]], 0.85, INK);
    b.brush([[34, -22 - ch, 3], [40, 8, 3], [42, 33, 1.6]], 0.88, INK);
    b.fill(skin, E(0, -42, 18, 18, 18), 0.97, 0.4);
    b.fill('#9a6a4a', E(-7, -36, 8, 9, 12), 0.35, 1.5);
    b.fill(INK, [[-18, -44], [-16, -58], [0, -64], [16, -58], [18, -44], [6, -52], [-6, -52]], 0.97, 0.4);
    b.fill(INK, [[-8, -34], [8, -34], [10, -22 + v], [0, -16 + v], [-10, -22 + v]], 0.97, 0.4);
    // fierce eyes under heavy brows (the brows drawn over the eyes' tops)
    eyeB(b, -5, -39, 2.6, '#f6f1e4', '#111', 0.15); eyeB(b, 6, -39, 2.6, '#f6f1e4', '#111', 0.15);
    b.brush([[-10, -44.6, 3.2], [-1.6, -41.4, 1.4]], 0.97, INK); b.brush([[10.4, -44.6, 3.2], [1.6, -41.4, 1.4]], 0.97, INK);
    const throwing = p === 1, lift = v ? -3 : 0;
    b.brush(throwing ? [[30, -20, 10], [58, -40 + lift, 8]] : [[30, -20, 10], [48, 0 + lift, 8]], 0.97, skin);
    const [ax, ay] = throwing ? [58, -40 + lift] : [48, 0 + lift];
    b.brush(spine(ax, ay, throwing ? ax + 10 : ax - 30, throwing ? ay - 50 : ay - 60, 4.6, 4.2), 0.95, '#6b4a2a');
    const [hx, hy] = throwing ? [ax + 10, ay - 50] : [ax - 30, ay - 60];
    // the axe in two steels
    b.fill(STEEL_SH, [[hx - 16, hy - 6], [hx + 16, hy - 16], [hx + 20, hy + 8], [hx - 6, hy + 8]], 0.97, 0.3);
    b.fill(STEEL_LIT, [[hx - 16, hy - 6], [hx + 16, hy - 16], [hx + 18, hy - 4], [hx - 11, hy + 1]], 0.95, 0.3);
    b.line([[hx - 16, hy - 6], [hx + 16, hy - 16], [hx + 20, hy + 8]], 1.6, 0.85, INK);
    b.brush([[-30, -20, 10], [-46, 10 - lift * 0.5, 8]], 0.97, skin);
    if (p >= 2) b.wash(DANGER, E(0, -42, 26, 26, 16), 0.2);
    wrath(b, p, [[-5, -39], [6, -39]]);
  }, 'paper', [-60, -130, 100, 70], [-53, -111, 91, 74]),
  goldtoad: big(62, (b, p, v) => {
    const g = '#c79a2a', leap = p === 2 ? -18 : 0, sw = v ? 2 : 0;
    if (leap) b.fill(INK, E(0, 50, 50, 12, 18), 0.22, 3);
    b.wash(PALACE, E(1, 9 + leap, 64.6, 44.6 + sw, 24), 0.42, 2);
    b.fill(PALACE, E(0, 8 + leap, 62, 42 + sw, 24), 0.97, 0.8);
    b.wash(SKY, E(-18, -10 + leap, 30, 16, 16), 0.6, 2);
    sheen(b, 0, 8 + leap, 58, 38 + sw, Math.PI * 1.08, Math.PI * 1.45, 3);
    // gold warts as lit dots
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, x = Math.cos(a) * 38 * ((i % 3) / 3 + 0.4), y = 8 + leap + Math.sin(a) * 24 * ((i % 2) * 0.5 + 0.5);
      b.dot(x, y, 9, 0.92, g); b.dot(x - 1.4, y - 1.4, 3.6, 0.9, '#f0d060');
    }
    b.brush([[-44, 30 + leap, 14], [-64, 50 + leap, 10]], 0.97, PALACE); b.brush([[30, 36 + leap, 14], [40, 56 + leap, 10]], 0.97, PALACE); b.brush([[-6, 44 + leap, 14], [-4, 62 + leap, 10]], 0.97, PALACE);
    // the throat swells on the breath
    b.fill(PALACE, E(52, -14 + leap, 30, 24 + sw, 18), 0.97, 0.6);
    b.dot(40, -38 + leap, 18, 0.97, PALACE); b.dot(64, -38 + leap, 16, 0.97, PALACE);
    eyeB(b, 40, -39 + leap, 6, '#f0d060', '#111', 0.15, true); eyeB(b, 64, -39 + leap, 5.4, '#f0d060', '#111', 0.15, true);
    // a crown with no coin in it
    b.fill(GOLD, [[34, -52 + leap], [38, -64 + leap], [46, -56 + leap], [52, -68 + leap], [58, -56 + leap], [66, -64 + leap], [70, -52 + leap]], 0.97, 0.3);
    b.fill('#f0cf6a', [[36, -53 + leap], [38, -62 + leap], [45, -55.4 + leap], [44, -53 + leap]], 0.75, 0.4);
    b.line([[34, -52 + leap], [70, -52 + leap]], 1.8, 0.9, '#7a4f12');
    if (p === 0) b.brush([[78, -8 + leap, 8], [110, -4 + v * 2, 7], [128, 0 + v * 2, 6]], 0.95, '#b83a4b');
    if (p === 1) { b.fill('#2a0f0c', E(74, -4, 12, 10 + sw, 14), 0.97, 0.3); for (const [x, y] of [[92, -20], [100, 4], [88, 16]] as Pt[]) b.fill(GOLD, rot([[0, -4], [3, 0], [0, 6], [-3, 0]], 0.4 + v * 0.3).map(([a, c]) => [a + x, c + y] as Pt), 0.95, 0.2); }
    else {
      // the coin it holds in the corner of its mouth (cashTen-style: a square hole, a rim, a glint)
      const cx = 74, cy = -2 + leap;
      b.flat((q) => {
        q.fillStyle = GOLD; q.beginPath(); q.arc(cx, cy, 6.5, 0, TAU); q.fill();
        q.strokeStyle = '#7a4f12'; q.lineWidth = 1.2; q.beginPath(); q.arc(cx, cy, 5.6, 0, TAU); q.stroke();
        q.fillStyle = '#2a0f0c'; q.fillRect(cx - 1.8, cy - 1.8, 3.6, 3.6);
        q.fillStyle = '#fff4c8'; q.beginPath(); q.arc(cx - 3, cy - 3, 1.1, 0, TAU); q.fill();
      }, [cx - 7.2, cy - 7.2, cx + 7.2, cy + 7.2]);
    }
    b.line([[62, -2 + leap], [80, -6 + leap]], 1.8, 0.85, g);
    wrath(b, p, [[40, -39], [64, -39]]);
  }, 'paper', [-80, -74, 132, 72], [-72, -88, 133, 70]),
  eclipse: big(70, (b, p, v) => {
    const lunge = p === 0, br = v ? 1 : 0;
    b.wash('#0d1020', blob(10, 0, 88, 62, 4), 0.3, 6);
    for (const [x, d] of [[-50, -6], [-30, 6], [30, lunge ? -14 : -6], [50, 6]] as Pt[]) b.brush([[x, 20, 14], [x + d + br * (x < 0 ? 2 : -2), 64, 11]], 0.97, INK);
    b.dry([[-60, -10, 16], [-96, -34 + br * 6, 12], [-110, -20 + br * 6, 4]], 0.92, INK, 0.5);
    b.fill('#101218', [[-64, -16], [-20, -34 - br * 2], [30, -32 - br * 2], [60, -14], [56, 26], [-60, 24]], 0.98, 0.8);
    b.wash(SLATE, [[-56, -14], [-18, -29 - br * 2], [20, -27 - br * 2], [10, -14], [-40, -4]], 0.6, 2);
    sheen(b, 0, -2, 60, 28, Math.PI * 1.1, Math.PI * 1.5, 3);
    const hx = (lunge ? 86 : 74) + br * 2, hy = (lunge ? -6 : -20) - br * 2;
    b.fill('#101218', [[40, -26], [hx - 20, hy - 30], [hx + 30, hy - 10], [hx + 36, hy + 8], [hx + 4, hy + 26], [44, 16]], 0.98, 0.6);
    b.fill('#101218', [[hx - 16, hy - 26], [hx - 12, hy - 54], [hx, hy - 24]], 0.97, 0.3);
    b.dry([[hx - 14, hy - 28, 2], [hx - 12, hy - 46, 0.8]], 0.55, '#c9d6e6', 0.5);
    // the moon: in its jaws, swallowed (only the eyes glow), then spat back
    if (p === 0) { b.disc(hx + 34, hy + 8, 22, '#f6f7fb', 0.22); b.fill('#f6f7fb', E(hx + 34, hy + 8, 16, 16, 18), 0.97, 0.6); }
    if (p === 2) { b.fill('#f6f7fb', E(hx + 56, hy + 6, 22, 22, 20), 0.97, 0.8); for (let i = 0; i < 4; i++) b.brush(rot([[hx + 56, hy + 6], [hx + 116, hy + 6]], i * Math.PI / 2 + 0.3 + br * 0.1, hx + 56, hy + 6).map(([x, y], j) => [x, y, j ? 2 : 8] as [number, number, number]), 0.5, '#f6f7fb'); }
    eyeB(b, hx + 4, hy - 10, 6, p === 1 ? '#ffe08a' : '#e9c46a', p >= 3 ? DANGER : '#111', 0.2, true);
    if (p === 1) { eyeB(b, hx - 10, hy - 8, 4.2, '#ffe08a', '#111', 0.2, true); b.wash('#ffe08a', E(hx, hy - 10, 30, 16, 16), 0.15 + br * 0.05); }
    b.line([[hx + 6, hy + 14], [hx + 30, hy + 10]], 1.8, 0.9, '#f4efe4');
    wrath(b, p, [[hx + 4, hy - 10]]);
  }, 'paper', [-116, -90, 190, 90], [-114, -78, 190, 74]),
};
