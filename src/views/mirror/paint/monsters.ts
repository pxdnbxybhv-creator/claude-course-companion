// Monsters (36), named elites (6) and treasures (2): 焦墨 silhouettes that face right (+x), with pale
// eyes and one accent each. Frames: v0 / v1 are a two-step walk (the engine alternates them at
// ~5 Hz), v2 is the tell / attack pose (crouch, glow, raised arm) shown while a telegraph fills.
//
// m8 redraw (art.md §4.2, R1 R4 R5 R8 R9): each mass is 焦墨 in three values — a wet bleed just outside
// it (a wash), the dense core, a slate lit wash on the upper left — plus a moonlit dry-brush sheen along
// the lit edge, ringed eyes with a pupil and a glint, legs ≥ 2.2 u, feelers ≥ 1.2 u, and one accent with
// a soft bloom. At most 3 washes a frame (washes are the slow part of a bake). The bleed stays inside the
// sprite's old box, so the atlas and the frame's fill do not grow. Every crisp mark carries its bb.
import type { EliteId, MonsterId, TreasureId } from '../ids';
import { B, blob, ell, arcW, spine, star, rot, TAU, type Pt, type Spec } from './kit';
import { CINNABAR, DANGER, GOLD, INK, JADE, PAPER, SILVER } from './palette';
import { eyes2, litOf, sheen, SHEEN } from './brushwork';

const LAKE = '#1d2430', FOREST = '#161a15', PALACE = '#1c2230';
const AZ = '#3f6f8f'; // 石青: shooters
const ROUGE = '#b83a4b';
/** R4 lit washes on 焦墨: lake / shared, shelled, forest fur, the palace (leaning to each map's ink). */
const SLATE = '#3a4150', SHELL = '#3a4a60', FUR = '#46513f', SKY = '#3a4562';
/** Two steels (lit above the ridge, shade below) for blades and axe heads. */
const STEEL_LIT = '#dfe9ec', STEEL_SH = '#86a0a8';
/** A warm grey contour for white bodies on pale paper (R11). */
const WARM = '#8a8276';

type Frame = 0 | 1 | 2;
const sp = (r: number, paint: (b: B, v: Frame) => void, n = 3, extra = 1.45): Spec => ({
  box: [-r * extra, -r * extra, r * extra, r * extra], n, paint: (b, v) => paint(b, v as Frame),
});
const E = (cx: number, cy: number, rx: number, ry: number, n = 16): Pt[] => ell(cx, cy, rx, ry, 0, TAU, n);

/** Stick legs: a pair of brushed lines from the body to the ground, alternating by frame. */
function legs(b: B, x: number, y: number, len: number, w: number, v: Frame, ink: string, spread = 4) {
  const s = v === 1 ? -1 : 1;
  b.brush(spine(x - spread * 0.5, y, x - spread * 0.5 - 2 * s, y + len, w, w * 0.6), 0.92, ink);
  b.brush(spine(x + spread * 0.5, y, x + spread * 0.5 + 2 * s, y + len, w, w * 0.6), 0.92, ink);
}
/** The elite's gold seal (1.3× the old stamp: the seal is the elite read), a square with a carved cross. */
function seal(b: B, x: number, y: number, s0: number) {
  const s = s0 * 1.3;
  b.flat((g) => {
    g.fillStyle = GOLD; g.fillRect(x - s / 2, y - s / 2, s, s);
    g.fillStyle = '#f0cf6a'; g.fillRect(x - s / 2, y - s / 2, s, s * 0.22);
    g.strokeStyle = '#7a4f12'; g.lineWidth = s * 0.12; g.strokeRect(x - s * 0.34, y - s * 0.34, s * 0.68, s * 0.68);
    g.beginPath(); g.moveTo(x, y - s * 0.25); g.lineTo(x, y + s * 0.25); g.moveTo(x - s * 0.22, y); g.lineTo(x + s * 0.22, y); g.stroke();
  }, [x - s / 2 - 0.2, y - s / 2 - 0.2, x + s / 2 + 0.2, y + s / 2 + 0.2]);
}
/** The bleed's reach (u past the mass), its tone and its soft edge (art.md R4: + ≈ 2 u, soft ≈ 2; a little darker than the spec so it reads on the phone). */
const BLEED = { grow: 2.2, tone: 0.58, soft: 1.8 };
/** R4's bleed (水晕): the wet ink wash just outside a mass — its outline grown by `g` u from its centre. */
function bleed(b: B, pts: Pt[], c: string = INK, g = BLEED.grow, tone = BLEED.tone) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  b.wash(c, pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; return [x + (dx / d) * g, y + (dy / d) * g] as Pt; }), tone, BLEED.soft);
}
/** One ringed eye (R5): an ink ring → the white (or an iris colour) → a pupil looking by `look` → a glint. */
function eye1(b: B, x: number, y: number, r: number, look = 0.3, white = '#f6f1e4') {
  b.flat((g) => {
    g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(x, y, r + 0.6, 0, TAU); g.fill();
    g.fillStyle = white; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(x + r * look, y + r * 0.12, r * 0.58, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + r * look - r * 0.22, y - r * 0.22, r * 0.24, 0, TAU); g.fill();
  }, [x - r - 0.7, y - r - 0.7, x + r + 0.7, y + r + 0.7]);
}
/** R8: an accent eye that glows (an iris disc with a pupil and a glint over a 0.28-alpha bloom 2× its size). */
function glowEye(b: B, x: number, y: number, r: number, iris: string, pupil = 0.45) {
  b.disc(x, y, r * 2, iris, 0.28);
  b.disc(x, y, r, iris);
  b.disc(x + r * 0.2, y, r * pupil, '#111');
  b.disc(x - r * 0.25, y - r * 0.3, r * 0.28, '#ffffff');
}
/** A treasure's sparkle: a four-pointed star of light. */
function spark(b: B, x: number, y: number, r: number) {
  b.flat((g) => {
    g.fillStyle = '#fffbe8';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, q = i % 2 ? r * 0.22 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); g.fill();
  }, [x - r, y - r, x + r, y + r]);
}

export const MON_SPECS: Record<MonsterId | EliteId | TreasureId, Spec> = {
  // ───────────── shared
  blot: sp(13, (b, v) => {
    const sq = v === 1 ? [14.5, 11.5] : v === 2 ? [12, 14.5] : [13, 12.5];
    // the bleed, the core, the lit edge, the drips
    bleed(b, E(0.3, 0.4, sq[0], sq[1]));
    b.fill(INK, blob(0, 0, sq[0] - 0.4, sq[1] - 0.4, 11 + v, 0.12), 0.97, 0.9);
    b.wash(SLATE, blob(-3, -3.5, sq[0] * 0.55, sq[1] * 0.45, 5 + v, 0.1), 0.6, 1);
    sheen(b, 0, 0, sq[0] - 2.4, sq[1] - 2.4, Math.PI * 1.02, Math.PI * 1.5, 2.2);
    const dr = Math.min(sq[1] + 3.2, 15.4);
    b.brush([[-6, sq[1] - 2, 3], [-6.4, dr - 1.4, 2.2], [-6, dr, 0.6]], 0.95, INK);
    b.brush([[5, sq[1] - 2.4, 2.4], [5.4, Math.min(sq[1] + 1.6, 14.4), 1.4]], 0.95, INK);
    b.dot(-14, 8, 3.4, 0.9); b.dot(12, 10, 2.6, 0.85); b.dot(-10, -13, 2, 0.8);
    eyes2(b, 3, -3, 4.4, 2.8);
    // a torn mouth in paper white
    b.brush([[-0.5, 5.4, 1], [1.5, 3.8, 1.3], [3.5, 5.2, 1.3], [5.5, 3.8, 1.3], [7, 5, 0.8]], 0.9, PAPER);
  }),
  paperman: sp(14, (b, v) => {
    const c = '#3a342d', dy = v === 2 ? 4 : 0, sx = v === 2 ? 1.15 : 1;
    bleed(b, [[-8 * sx, -2 + dy], [0, -2.4 + dy], [8 * sx, -2 + dy], [9.6 * sx, 6], [11 * sx, 14], [0, 14.6], [-11 * sx, 14], [-9.6 * sx, 6]], INK, 2.4);
    bleed(b, E(0, -9 + dy, 6.5, 6.5, 12), INK, 1.6, 0.45);
    b.fill(c, [[-8 * sx, -2 + dy], [8 * sx, -2 + dy], [11 * sx, 14], [-11 * sx, 14]], 0.97, 0.3);
    b.wash('#6a6156', [[-7.4 * sx, -1 + dy], [-1, -1 + dy], [-2.4, 12], [-9.6 * sx, 12.6]], 0.6, 1);
    b.fill(c, E(0, -9 + dy, 6.5, 6.5, 14), 0.97, 0.3);
    b.fill('#6a6156', E(-2, -11 + dy, 3.4, 2.8, 10), 0.55, 1);
    b.brush([[-16, 1 + dy, 3], [-8, -1 + dy, 3.4]], 0.95, c); b.brush([[8, -1 + dy, 3.4], [16, 1 + dy + (v === 1 ? -3 : 0), 3]], 0.95, c);
    // folded paper: two creases across (crumpled zigzags on the tell)
    if (v === 2) for (const [x, y] of [[-6, 4], [5, 7], [0, 10]] as Pt[]) b.line([[x - 2, y], [x, y - 1.5], [x + 2, y + 0.5]], 1, 0.85, PAPER);
    else { b.line([[-7, 3.4], [7, 3.4]], 1, 0.4, PAPER); b.line([[-8.6, 8.6], [8.6, 8.6]], 1, 0.5, PAPER); }
    b.dot(-3.4, -6.6 + dy, 3.6, 0.85, ROUGE); b.dot(3.8, -6.6 + dy, 3.6, 0.85, ROUGE);
    eyes2(b, 0.5, -10 + dy, 3, 2);
  }),
  shard: sp(13, (b, v) => {
    const a = v * 0.18;
    const pts: Pt[] = [[-12, -3], [-4, -13], [3, -9], [13, -12], [8, 2], [12, 12], [0, 8], [-9, 13]];
    bleed(b, rot(pts, a), INK, 1.4);
    b.fill('#3b2e22', rot(pts, a), 0.97, 0.3);
    // facets: two lit, one in shade
    b.fill('#8a6a3c', rot([[-7, -2], [-2, -9], [4, -6], [2, 4]], a), 0.85, 0.3);
    b.fill('#b9935a', rot([[-4, -5], [-2, -9], [1, -7.4]], a), 0.8, 0.3);
    b.fill('#1c140d', rot([[3, 3], [8, 2], [11, 11], [1, 7.4]], a), 0.8, 0.3);
    // the silver glint as a crisp line, and a second small one
    const [g0, g1, g2] = rot([[-6, -5], [4, -8], [8.5, -8.5]], a);
    b.flat((g) => {
      g.strokeStyle = SILVER; g.lineCap = 'round';
      g.globalAlpha = v === 2 ? 1 : 0.85; g.lineWidth = 2; g.beginPath(); g.moveTo(g0[0], g0[1]); g.lineTo(g1[0], g1[1]); g.stroke();
      g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(g2[0], g2[1], 1.2, 0, TAU); g.fill();
    }, [-9, -12, 11, -4]);
    eyes2(b, 2, 1, 3.8, 2.3);
  }),
  lantern: sp(14, (b, v) => {
    const big = v === 2 ? 1.5 : 1;
    bleed(b, E(0, 3, 10, 11));
    b.fill(INK, E(0, 3, 10, 11), 0.97, 0.5);
    b.wash(SLATE, E(-3.6, -0.6, 4.6, 6), 0.6, 1);
    for (const x of [-5, 0, 5]) b.line([[x, -7], [x * 1.25, 3], [x, 13]], 1, 0.6, PAPER);
    b.fill(INK, [[-5, -9], [5, -9], [5, -6], [-5, -6]], 0.97, 0.2);
    b.fill(INK, [[-4, 13], [4, 13], [3, 15], [-3, 15]], 0.95, 0.2);
    // the azure flame, larger, with a soft bloom under it
    b.disc(0, -9 - 6 * big, 5.6 * big, AZ, 0.3);
    b.fill(AZ, [[0, -9 - 13.6 * big], [5.8 * big, -12.5], [3.4, -8], [-3.4, -8], [-5.8 * big, -12.5]], 0.9, 0.6);
    b.fill('#9cc0d8', [[0, -10 - 8 * big], [2.2, -11.5], [0, -9], [-2.2, -11.5]], 0.85, 0.3);
    if (v === 2) b.fill(DANGER, [[0, -9 - 10 * big], [3, -12], [-3, -12]], 0.85, 0.5);
    eyes2(b, 0, 2, 3.8, 2.4); b.line([[-3, 7.4], [0, 9], [3, 7.4]], 1.2, 0.9, PAPER);
  }, 3, 1.75),
  // ───────────── 月湖
  tadpole: sp(8, (b, v) => {
    const t = v === 1 ? -1 : 1;
    b.brush([[-1, 0, 5.8], [-6, 2 * t, 4.6], [-10, -1 * t, 2.8], [-13, 2 * t, 1]], 0.95, LAKE);
    b.fill(LAKE, E(3, 0, 6.8, 5.8, 14), 0.97, 0.5);
    b.fill(SLATE, E(1.6, -1.8, 3.4, 2, 10), 0.6, 1);
    sheen(b, 3, 0, 5, 4, Math.PI * 1.1, Math.PI * 1.6, 1.4);
    eye1(b, 5.4, -1.2, 1.7, 0.35);
  }, 2),
  shrimp: sp(14, (b, v) => {
    const straight = v === 2;
    const segs: [number, number, number][] = straight
      ? [[12, 0, 8.4], [6, 0, 9.6], [0, 0, 9.6], [-6, 0, 8.4], [-11, 0, 6.4]]
      : [[10, -4, 8.4], [6, 1, 9.6], [0, 3, 9.6], [-6, 1, 8.4], [-9, -4, 6.4]];
    if (v !== 2) legs(b, 2, 5.4, 5, 2.2, v, LAKE, 6);
    for (const [x, y, w] of segs) b.dot(x, y, w, 0.95, LAKE);
    const tail = segs[segs.length - 1];
    b.fill(LAKE, [[tail[0], tail[1]], [tail[0] - 6, tail[1] - 5], [tail[0] - 7, tail[1] + 4]], 0.95, 0.3);
    // the shell's plates: a lit wash on each segment, a moonlit edge down the back
    for (const [x, y, w] of segs) b.dot(x - w * 0.15, y - w * 0.2, w * 0.5, 0.6, SHELL);
    b.dry(segs.map(([x, y, w], i) => [x, y - w * 0.36, i === 0 || i === segs.length - 1 ? 0.6 : 1.5] as [number, number, number]), 0.55, SHEEN, 0.5);
    b.line([[segs[0][0] + 2, segs[0][1] - 2], [segs[0][0] + 10, segs[0][1] - 12]], 1.4, 0.85, LAKE);
    b.line([[segs[0][0] + 2, segs[0][1] - 1], [segs[0][0] + 14, segs[0][1] - 6]], 1.4, 0.85, LAKE);
    // the spear: a 1.6 u shaft, a silver head in two steels
    const ty = straight ? 1 : -2;
    b.brush([[-2, 8, 2], [14, ty, 2]], 0.95, '#6b4a2a');
    b.fill(STEEL_SH, [[14, ty], [18.4, ty - 1.2], [15, ty + 3]], 0.95, 0.2);
    b.fill(STEEL_LIT, [[14, ty], [18.4, ty - 1.2], [15, ty - 1.8]], 0.95, 0.2);
    eye1(b, segs[0][0] + 2, segs[0][1] - 1.6, 1.8);
  }, 3, 1.6),
  frog: sp(13, (b, v) => {
    const cr = v === 2 ? 3 : 0;
    bleed(b, E(0, 2 + cr, 13, 9 - cr * 0.6), LAKE);
    b.fill(LAKE, E(0, 2 + cr, 13, 9 - cr * 0.6), 0.97, 0.5);
    b.fill(LAKE, E(-9, 6 + cr * 0.5, 6, 5, 12), 0.97, 0.4);
    if (v === 1) b.brush([[-10, 9, 3.4], [-17, 12, 2.6], [-20, 10, 1.2]], 0.95, LAKE);
    b.wash(SLATE, E(-3.4, -2 + cr, 7, 3.6, 12), 0.6, 1);
    b.fill('#4f6250', E(6, 7 + cr * 0.4, 5, 3.5, 12), 0.75, 0.5);
    sheen(b, 0, 2 + cr, 11.5, 7.5, Math.PI * 1.05, Math.PI * 1.45, 2);
    for (const x of [4, 9.4]) { b.dot(x, -5 + cr, 6.6, 0.97, LAKE); eye1(b, x + 0.6, -5.6 + cr, 2.2, 0.35); }
    b.line([[6, 3 + cr], [12.4, 2.4 + cr]], 1, 0.65, PAPER);
    b.dot(-4, 0 + cr, 2.6, 0.75, JADE); b.dot(2, 2.4 + cr, 2.4, 0.75, JADE); b.dot(-8, 4 + cr, 2.4, 0.7, JADE);
  }),
  crab: sp(20, (b, v) => {
    const s = v === 1 ? 2 : 0;
    for (let i = 0; i < 3; i++) {
      const y = -6 + i * 6;
      b.brush([[-4 + i * 2, y, 3.4], [-16 + i * 2, y - 2 + (i % 2 ? s : -s), 2.8], [-22 + i * 3, y + 6, 1.2]], 0.95, LAKE);
      b.brush([[-6 + i * 2, y - 0.8, 0.9], [-15 + i * 2, y - 3 + (i % 2 ? s : -s), 0.7]], 0.5, SHEEN);
    }
    bleed(b, blob(0.4, 0.5, 15.5, 12.5, 9, 0.06), LAKE);
    b.fill(LAKE, blob(0, 0, 15.5, 12.5, 5, 0.06), 0.97, 0.5);
    b.wash(SHELL, E(-2, -3.5, 10, 6.5), 0.7, 1.2);
    sheen(b, 0, 0, 13, 10, Math.PI * 1.05, Math.PI * 1.6, 2);
    b.brush([[-9, -3, 1.2], [0, -6.5, 1.4], [9, -3, 1.2]], 0.55, PAPER);
    for (const y of [-10, 10]) {
      b.brush([[8, y * 0.6, 4.4], [14, y * 1.0, 4.2], [18, y * 0.9, 3.4]], 0.97, LAKE);
      b.fill(LAKE, E(22, y * 0.8, 6.6, 5.6), 0.97, 0.4);
      b.fill(SHELL, E(20.6, y * 0.8 - 1.5, 4, 2.5, 10), 0.75, 0.8);
      b.brush([[23, y * 0.8, 2.4], [27.6, y * 0.8 + (y > 0 ? -2.2 : 2.2), 1.2]], 0.97, LAKE);
      // silver claw tips (vermilion on the tell)
      b.brush([[25.4, y * 0.8 + (y > 0 ? -1.2 : 1.2), 1], [27.6, y * 0.8 + (y > 0 ? -2.2 : 2.2), 0.6]], 0.9, v === 2 ? DANGER : SILVER);
    }
    // eyes on stalks
    for (const dy of [-4.5, 1.5]) b.brush([[8, dy + 1, 1.6], [12, dy, 1.4]], 0.97, LAKE);
    eyes2(b, 12.5, -1.5, 3, 2.5, 0.35);
    if (v === 2) b.fill(SILVER, [[18, -12], [26, -6], [26, 6], [18, 12]], 0.25, 1);
  }),
  lotuspod: sp(15, (b, v) => {
    b.brush([[0, 8, 3.6], [-2, 16, 3], [0, 21, 2]], 0.94, '#3e5a3a');
    b.wash(JADE, blob(-9, 18, 10.4, 5.2, 3), 0.6);
    b.fill('#3c4a32', [[-13, -7], [13, -7], [9, 8], [-9, 8]], 0.97, 0.4);
    b.fill('#283222', [[3, -6], [13, -7], [9, 8], [2, 8]], 0.6, 0.6);
    bleed(b, [[-13, -7], [0, -7.4], [13, -7], [11, 0.6], [9, 8], [0, 8.4], [-9, 8], [-11, 0.6]], '#1b2216', 2.8, 0.6);
    b.fill('#5d7148', [[-12, -6], [-4, -6], [-4.4, 6], [-8.6, 7]], 0.6, 1);
    // the pod's top in a lit wash, its rim, the seed holes
    b.wash('#8d9e74', E(0, -7, 12.6, 3.8), 0.8, 0.8);
    b.line(ell(0, -7, 13, 4, 0, Math.PI, 10), 1.2, 0.75, '#283222');
    const glow = v === 2;
    for (const [x, y] of [[-7, -7], [0, -8], [7, -7], [-3.5, -5.4], [3.5, -5.4]] as Pt[]) b.disc(x, y, 2, glow ? DANGER : '#1b1f16');
    b.dry([[-12.6, -5, 1.8], [-10.2, 5, 0.7]], 0.55, SHEEN, 0.5);
    eyes2(b, 0, 1.4, 3.9, 2.3);
  }),
  jelly: sp(13, (b, v) => {
    const pulse = v === 2;
    for (const x of [-7, -3, 1, 5, 8]) b.brush([[x, 2, 2], [x + (v === 1 ? 2 : -2), 10, 1.7], [x, 16.4, 0.8]], 0.8, LAKE);
    const bell = ell(0, -2, 13, 10, Math.PI, Math.PI * 2, 16).concat([[13, 2], [-13, 2]]);
    bleed(b, bell, LAKE, 1.8, 0.4);
    b.wash('#51708a', bell, 0.75);
    b.wash('#a9c0d2', E(-3.6, -6, 5.6, 3.2, 12), 0.6, 1);
    b.fill(pulse ? DANGER : '#2c3a4a', E(0, -3, 6, 5, 14), pulse ? 0.92 : 0.8, 0.6);
    if (pulse) b.disc(0, -3, 8, DANGER, 0.22);
    // pale on pale: an ink contour round the bell (R11)
    b.line(ell(0, -2, 13, 10, Math.PI, Math.PI * 2, 12), 1.8, 0.88, LAKE);
    b.line([[-13, 2], [-6, 2.8], [6, 2.8], [13, 2]], 1, 0.6, LAKE);
    eyes2(b, 1, -1, 3.7, 2.2);
  }),
  clam: sp(16, (b, v) => {
    const open = v === 0 ? 5 : v === 1 ? 2 : 0;
    bleed(b, E(0, 3.6 - open * 0.5, 16, 11), INK, 2.6, 0.56);
    b.fill(LAKE, ell(0, 4, 16, 9, 0, Math.PI, 14).concat([[-16, 4]]), 0.97, 0.4);
    b.fill('#232c38', ell(0, 4 - open, 16, 11, Math.PI, Math.PI * 2, 14), 0.97, 0.4);
    b.wash(SHELL, E(-4.6, -3.4 - open, 8.6, 4.2, 12), 0.65, 1);
    for (let i = -3; i <= 3; i++) b.line([[i * 2, 4 - open - 1], [i * 5.2, -6 - open]], 1, 0.6, PAPER);
    sheen(b, 0, 4 - open, 14.6, 10, Math.PI * 1.1, Math.PI * 1.5, 2);
    b.line(ell(0, 4.2, 15.4, 8.4, Math.PI * 0.15, Math.PI * 0.85, 8), 1.4, 0.5, SHEEN);
    b.line(ell(0, 4 - open, 16.2, 11.2, Math.PI * 1.05, Math.PI * 1.95, 12), 1.6, 0.75, INK);
    if (open > 0) {
      b.fill('#0d1016', [[-14, 4 - open], [14, 4 - open], [14, 4], [-14, 4]], 0.92, 0.3);
      eyes2(b, -0.5, 4 - open / 2, 4.4, open * 0.28 + 0.9);
      // the pearl inside, with its glint
      if (open >= 4) { b.disc(9, 4 - open / 2, 1.9, '#f3f1ec'); b.disc(8.4, 3.4 - open / 2, 0.7, '#ffffff'); }
    }
  }),
  egret: {
    box: [-22, -24, 24, 20], n: 3, halo: 'dark',
    paint(b, v) {
      const W = '#f7f6f1';
      const neck = v === 2 ? [[4, -4, 4], [12, -8, 3], [18, -9, 2.4]] : [[4, -4, 4], [6, -12, 3], [11, -17, 2.4]];
      b.fill(W, E(-2, 0, 14, 7.8, 18), 0.97, 0.5);
      b.fill('#d3cdc0', E(0, 3.8, 11, 3.4, 12), 0.85, 0.8);
      b.dry([[-12, -1.6, 1.8], [-2, -4, 1.4], [7, -1.5, 0.6]], 0.6, '#b8b2a6', 0.5);
      b.brush(neck as [number, number, number][], 0.97, W);
      const hx = neck[2][0], hy = neck[2][1];
      b.fill(W, E(hx + 1, hy, 4, 3, 10), 0.97, 0.4);
      b.brush([[hx + 4, hy, 1.6], [hx + 11, hy + 1.2, 0.6]], 0.95, '#d9a62e');
      // a warm-grey contour (a white bird on pale paper, R11)
      b.brush(arcW(-2, 0, 14.4, 8.2, Math.PI * 0.85, Math.PI * 2.15, 2, 1.5, 12), 0.92, WARM);
      b.line((neck as [number, number, number][]).map(([x, y, w]) => [x - w * 0.55, y] as Pt), 1.5, 0.85, WARM);
      b.line(ell(hx + 1, hy, 4.4, 3.4, Math.PI * 0.8, Math.PI * 1.9, 6), 1.1, 0.85, WARM);
      b.brush([[-14, 0, 2.2], [-21, 2, 0.6]], 0.85, INK);
      eye1(b, hx + 1.6, hy - 0.8, 1.1, 0.3, '#f2d27a');
      if (v !== 2) { const s = v === 1 ? 2 : -2; b.line([[-2, 6], [-2 + s, 18]], 2, 0.95, INK); b.line([[2, 6], [2 - s, 18]], 2, 0.95, INK); }
      else b.brush([[-8, -3, 1.2], [-18, -10, 3], [-8, -6, 1.2]], 0.75, SILVER);
    },
  },
  weed: sp(13, (b, v) => {
    const s = v === 1 ? 1 : v === 2 ? 0.4 : -1;
    b.wash(FOREST, E(0, 1, 10, 12.4), 0.38, 1);
    for (let i = 0; i < 5; i++) {
      const x = -8 + i * 4;
      b.brush([[x, 14, 2.6], [x + 3 * s, 4, 2.2], [x - 2 * s, -5, 1.8], [x + 2 * s, -14 + (i % 2) * 3, 0.6]], 0.94, i % 2 ? '#24372b' : FOREST);
      // the fronds as dry strokes in two greens
      b.dry([[x + 0.6, 12, 2], [x + 3 * s + 0.6, 3, 1.8], [x - 2 * s + 0.6, -5, 1.2]], 0.6, i % 2 ? '#5f8a6e' : '#4a6e58', 0.5);
    }
    eyes2(b, 0, -2, 3.6, 2.3);
  }),
  drowned: sp(14, (b, v) => {
    const d = v === 1 ? 1.5 : 0;
    b.line(ell(0, 12, 13.6, 3.8, 0, TAU, 16), 1.6, v === 2 ? 0.85 : 0.6, '#9fb2c2');
    b.wash(LAKE, [[-10.6, -7.4], [-13.2, 8], [-9.6, 17.4], [-3, 13.6 + d], [1, 18.4], [5, 13.6 - d], [10.6, 17.4], [13.2, 7], [10.6, -7.4]], 0.84, 1.5);
    b.wash(SLATE, [[-8, -4], [-2.4, -4], [-4.4, 6], [-9.2, 7]], 0.6, 1);
    b.fill(LAKE, E(0, -9, 8, 8.5, 16), 0.95, 0.6);
    b.fill('#c9d0d6', E(1.5, -8, 4.6, 5, 12), 0.82, 0.4);
    sheen(b, 0, -9, 7, 7.4, Math.PI * 1.05, Math.PI * 1.5, 1.8);
    // wet hair over the brow
    b.brush([[-5, -15, 1.8], [-1, -12.6, 1.4], [3, -12.4, 0.6]], 0.92, LAKE);
    b.brush([[-7, -12, 2.2], [-8.6, -4, 1.8], [-8, 3, 0.8]], 0.92, LAKE);
    for (const x of [-6, 2, 7]) b.brush([[x, 14, 1.2], [x, 18 + d * 2, 0.4]], 0.7, LAKE);
    for (const x of [0, 3.4]) { b.disc(x, -8.5, 1.6, '#111'); b.disc(x - 0.4, -9, 0.45, '#ffffff'); }
  }),
  // ───────────── 墨林
  rat: sp(10, (b, v) => {
    b.brush([[-8, 3, 2], [-15, 4 + (v === 1 ? 2 : -1), 1.4], [-21, 1, 0.6]], 0.9, FOREST);
    legs(b, 1, 6, 3, 2, v, FOREST, 8);
    bleed(b, [[-9, 2], [-5, -6], [3, -7], [10, -2], [13, 3], [7, 6], [-6, 7]], FOREST);
    b.fill(FOREST, [[-9, 2], [-5, -6], [3, -7], [10, -2], [13, 3], [7, 6], [-6, 7]], 0.97, 0.5);
    b.wash(FUR, [[-6.4, -1], [-3.6, -5.4], [3, -6], [2, -2]], 0.65, 1);
    sheen(b, 1, 0, 8.4, 5.6, Math.PI * 1.05, Math.PI * 1.55, 1.8);
    b.dot(2, -7, 5.4, 0.97, FOREST); b.dot(2, -7, 2.8, 0.7, ROUGE);
    eye1(b, 9, -1.8, 1.4, 0.4);
    b.dot(13.5, 2.5, 2.2, 0.95, ROUGE);
    for (const y of [1, 3]) b.line([[12, y], [18, y - 1 + (y - 2)]], 1, 0.6, FOREST);
  }, 3, 2),
  foxfire: sp(12, (b, v) => {
    const st = v === 2 ? 1.35 : 1;
    // the fox-fire's bloom, its cinnabar body, a hot core
    b.wash('#e8a25a', E(-2, 0, 17, 12), 0.36, 1.8);
    b.fill(CINNABAR, [[12, 0], [6, -9], [-4 * st, -8], [-14 * st, -3 + (v === 1 ? 2 : 0)], [-20 * st, 0], [-12 * st, 5], [-3, 9], [7, 8]], 0.88, 1.2);
    b.dry([[-6, -3, 3], [-14 * st, -1 + (v === 1 ? 1.4 : 0), 2], [-19 * st, 0, 0.6]], 0.7, '#f2b26a', 0.5);
    b.fill('#e8a25a', E(3, 0, 6, 5, 12), 0.85, 0.8);
    b.fill('#f7d27a', E(1, -0.4, 3, 2.4, 10), 0.8, 0.8);
    // the fox mask
    b.fill(FOREST, E(5, 0, 5.5, 4.6, 12), 0.95, 0.4);
    b.fill(FOREST, [[1, -3], [2, -9], [5, -4]], 0.95, 0.2); b.fill(FOREST, [[6, -3.5], [8.5, -9], [9, -3]], 0.95, 0.2);
    sheen(b, 5, 0, 4.4, 3.6, Math.PI * 1.05, Math.PI * 1.6, 1.4);
    for (const sx of [-1, 1]) b.brush([[5 + sx * 2.4 - 1.3, -0.7, 1.2], [5 + sx * 2.4 + 1.3, 0.4, 1.2]], 0.95, '#f7d27a');
    b.brush([[8.6, 1.6, 1.2], [10, 2.2, 0.6]], 0.9, CINNABAR);
  }, 3, 2.1),
  imp: sp(15, (b, v) => {
    const up = v === 2;
    b.dry([[-6, -4, 11], [-8, 6, 13], [-6, 14, 9]], 0.9, FOREST, 0.35);
    bleed(b, blob(-3, 2, 10, 12, 21, 0.1), FOREST, 3, 0.58);
    b.fill(FOREST, blob(-3, 2, 10, 12, 21, 0.12), 0.97, 0.8);
    b.wash(FUR, blob(-6.6, -3.4, 4.8, 5.6, 4, 0.1), 0.62, 1);
    for (let i = 0; i < 3; i++) b.dry([[-10 + i * 3, -5 + i * 2.4, 1.4], [-11.6 + i * 3, 1 + i * 2.4, 0.6]], 0.55, SHEEN, 0.6);
    b.fill(FOREST, E(5, -8, 6.5, 6, 14), 0.97, 0.5);
    sheen(b, 5, -8, 5.4, 5, Math.PI * 1.1, Math.PI * 1.55, 1.4);
    b.dot(9.6, -6.4, 3.6, 0.95, CINNABAR); b.dot(7, -4, 2.6, 0.75, AZ);
    eyes2(b, 7.8, -10, 2.1, 1.3, 0.35);
    b.brush(up ? [[2, -2, 3.2], [8, -14, 2.8], [6, -22, 1.8]] : [[3, 0, 3.2], [12, 8, 2.8], [15, 17, 1.8]], 0.95, FOREST);
    if (up) { b.dot(6, -23, 6, 0.95, '#57524a'); b.dot(4.8, -24.2, 2.2, 0.8, '#8a857c'); }
    b.brush([[-8, 0, 3.2], [-14, 10, 2.8], [-13, 18, 1.6]], 0.95, FOREST);
    legs(b, -3, 12, 5, 2.6, v, FOREST, 7);
  }),
  umbrella: sp(15, (b, v) => {
    const hop = v === 1 ? -3 : 0, sq = v === 2 ? 0.8 : 1;
    const canopy = ell(0, -1 + hop, 16, 12 * sq, Math.PI, Math.PI * 2, 16).concat([[16, 1 + hop], [-16, 1 + hop]]);
    bleed(b, ell(0, -1 + hop, 16, 12 * sq, Math.PI, Math.PI * 2, 14).concat([[16, 1 + hop], [0, 1.4 + hop], [-16, 1 + hop]]), '#2a1612');
    b.fill('#4a2a22', canopy, 0.97, 0.3);
    b.wash('#7a4a3a', [[-14.4, -1 + hop], [-9, -8.4 * sq + hop], [-2, -11 * sq + hop], [-4.6, -3 + hop]], 0.6, 1);
    for (const x of [-10, -4, 4, 10]) b.line([[0, -12 * sq + hop], [x * 1.5, 1 + hop]], 1.2, 0.6, '#c9a86a');
    b.line(ell(0, -1 + hop, 16, 12 * sq, Math.PI, Math.PI * 2, 12), 1.2, 0.85, INK);
    sheen(b, 0, -1 + hop, 14.4, 10.6 * sq, Math.PI * 1.1, Math.PI * 1.45, 2);
    b.brush([[0, 1 + hop, 2.6], [0, 13 + hop, 2.2], [-3, 16 + hop, 1.4]], 0.95, '#6b4a2a');
    b.line([[-0.6, 2 + hop], [-0.6, 12 + hop]], 0.8, 0.5, '#a8845a');
    eye1(b, 4.6, -5 + hop, 3, 0.35);
    b.brush([[8, 1 + hop, 2.6], [11, 5 + hop, 2], [10, 8 + hop, 0.8]], 0.92, CINNABAR);
  }),
  wolf: sp(15, (b, v) => {
    const howl = v === 2;
    // tail: a big dry-brush sweep
    b.dry([[-14, -2, 7], [-19.6, -5 + (v === 1 ? 3 : 0), 5], [-23, -7.4 + (v === 1 ? 3.4 : 0), 1.6]], 0.9, FOREST, 0.5);
    bleed(b, [[-15, -3.5], [-6, -8], [6, -7], [11.5, -3.5], [9.5, 5], [-1, 5.4], [-12.5, 5]], FOREST);
    b.fill(FOREST, [[-15, -3.5], [-6, -8], [6, -7], [11.5, -3.5], [9.5, 5], [-12.5, 5]], 0.97, 0.5);
    b.wash(FUR, [[-13, -3.6], [-5, -7], [5, -6.2], [3, -3], [-11.6, -1.2]], 0.6, 1);
    // fur: pale dry strokes along the back, a darker belly
    for (let i = 0; i < 4; i++) b.dry([[-12 + i * 5, -6.8 + (i % 2) * 0.6, 1.6], [-8.5 + i * 5, -4, 0.5]], 0.6, SHEEN, 0.6);
    b.fill('#0b0e0a', [[-11, 2], [8, 1.5], [9, 5], [-12, 5]], 0.6, 0.8);
    const hx = howl ? 12 : 13, hy = howl ? -14 : -6;
    b.fill(FOREST, [[7, -5], [hx - 3.5, hy - 2.6], [hx + 2, hy - 1.6], [hx + 9.2, hy + (howl ? -5.2 : 2.2)], [hx + 2, hy + 6], [9, 3]], 0.97, 0.4);
    b.fill(FOREST, [[hx - 2.6, hy - 2], [hx - 2.2, hy - 10.5], [hx + 2.6, hy - 2]], 0.97, 0.2);
    b.dry([[hx - 2, hy - 9, 0.9], [hx - 1, hy - 4, 0.5]], 0.6, SHEEN, 0.4);
    b.brush([[hx + 1, hy - 1.8, 1.2], [hx + 7.4, hy + (howl ? -4.2 : 1.6), 0.6]], 0.55, SHEEN);
    // the eye glows gold, with a little bloom baked round it
    glowEye(b, hx + 2.8, hy + 0.6, 1.7, '#f2d27a');
    if (howl) b.brush([[hx + 5, hy + 1, 1.2], [hx + 9, hy - 3, 1]], 0.95, DANGER);
    const s = v === 1 ? 3 : 0;
    for (const [x, d] of [[-11, -s], [-6, s], [5, -s], [9, s]] as Pt[]) b.brush([[x, 3, 3.4], [x + d, 10, 2.4], [x + d + 1, 14.5, 1.6]], 0.97, FOREST);
  }),
  ghostlamp: sp(13, (b, v) => {
    const heal = v === 2;
    if (heal) b.wash(GOLD, E(0, -2, 17, 17), 0.35);
    b.wash(FOREST, [[-8, 6], [-4, 18], [0, 12], [3, 19], [6, 10]], 0.55);
    const body = heal ? '#e8b64a' : '#b58a3a';
    bleed(b, E(0, -2, 10, 11), '#5a4012', 2, 0.42);
    b.fill(body, E(0, -2, 10, 11), 0.95, 0.5);
    b.fill(litOf(body), E(-3.6, -5.4, 4.6, 5, 12), 0.6, 1);
    b.fill('#7a5a22', E(4.4, 2, 4.6, 6, 12), 0.5, 1);
    for (const x of [-5, 0, 5]) b.line([[x, -12], [x * 1.3, -2], [x, 8]], 1.3, 0.65, INK);
    b.line(ell(0, -2, 10, 11, Math.PI * 0.1, Math.PI * 0.9, 8), 1.2, 0.6, '#5a4012');
    b.fill(INK, [[-5, -14], [5, -14], [5, -11], [-5, -11]], 0.97, 0.2);
    eyes2(b, 0, -3, 3.7, 2.2, 0.3, '#fff6d8'); b.brush([[-3, 3, 1.2], [0, 5, 1.4], [3, 3, 1.2]], 0.9, INK);
  }),
  spider: sp(12, (b, v) => {
    const s = v === 1 ? 2 : 0;
    for (const k of [-1, 1]) for (let i = 0; i < 4; i++) {
      const bx = -3 + i * 3;
      b.brush([[bx, 0, 1.8], [bx + (i - 1.5) * 5, k * (10 + (i % 2 ? s : -s)), 1.6], [bx + (i - 1.5) * 7.4, k * 15, 0.7]], 0.92, FOREST);
    }
    bleed(b, E(-6, 0, 8, 7), FOREST);
    b.fill(FOREST, E(-6, 0, 8, 7), 0.97, 0.6);
    b.wash(FUR, E(-8, -2.6, 4.4, 2.8, 12), 0.6, 1);
    sheen(b, -6, 0, 6.6, 5.6, Math.PI * 1.05, Math.PI * 1.55, 1.8);
    b.fill(FOREST, E(4, 0, 5, 4.5, 12), 0.97, 0.4);
    b.dot(-7, 1, 3.6, 0.85, '#a83232'); b.dot(-7, 3.4, 2, 0.8, '#a83232');
    eye1(b, 6.4, -1.7, 1.25, 0.4); eye1(b, 6.4, 1.7, 1.25, 0.4);
    if (v === 2) b.dot(11, 0, 4.4, 0.85, '#d6d6cf');
  }),
  panda: sp(20, (b, v) => {
    const W = '#f3f0e6', SH = '#d6cfbd';
    if (v === 2) {
      // curled into a rolling ball: white fur, black legs tucked, ears and eye patches on top
      b.fill(W, E(0, 0, 17, 16, 18), 0.97, 0.5);
      b.fill(SH, E(3, 4, 13, 11, 14), 0.6, 1);
      b.brush(arcW(0, 0, 11, 10, 0.2, 2.4, 6, 4, 8), 0.95, INK);
      b.brush(arcW(0, 0, 11, 10, 3.3, 5.2, 6, 4, 8), 0.95, INK);
      b.brush(arcW(0, 0, 17, 16, 0, TAU, 1.4, 1.4, 18), 0.85, WARM);
      b.dot(6, -11, 5, 0.97, INK); b.dot(12, -6, 4.4, 0.97, INK);
      b.dot(8, -4, 3.6, 0.97, INK); b.disc(8.6, -4.4, 1, PAPER);
      for (const [x, y] of [[-20, 6], [-22, -2]] as Pt[]) b.dot(x, y, 3, 0.4, '#a89a80');
      return;
    }
    const s = v === 1 ? 3 : 0;
    for (const [x, d] of [[-10, -s], [-4, s], [6, -s], [11, s]] as Pt[]) b.brush([[x, 4, 5], [x + d, 13, 4.4]], 0.97, INK);
    b.fill(W, E(0, -1, 16, 10, 18), 0.97, 0.5);
    b.fill(SH, E(3, 3, 12, 5.4, 14), 0.6, 1);
    b.brush([[-6, -9, 5], [4, -9, 5]], 0.92, INK);
    b.dry([[-5, -10.4, 1.4], [2, -10.6, 0.6]], 0.5, SHEEN, 0.5);
    b.fill(W, E(14, -6, 8, 7, 14), 0.97, 0.4);
    b.dot(11, -12, 5, 0.97, INK); b.dot(17, -12, 4.5, 0.97, INK);
    b.dot(13, -6, 3.8, 0.97, INK); b.dot(18, -6, 3.4, 0.97, INK); b.disc(13.4, -6.4, 1, PAPER); b.disc(18.2, -6.4, 0.9, PAPER);
    b.dot(21, -3, 2.2, 0.97, INK);
    // white parts get a warm-grey contour on pale paper (R11)
    b.brush(arcW(0, -1, 16, 10, Math.PI * 0.15, Math.PI * 1.2, 1.4, 1.2, 12), 0.85, WARM);
    b.brush(arcW(14, -6, 8, 7, -Math.PI * 0.2, Math.PI * 0.75, 1.3, 1.1, 8), 0.8, WARM);
  }),
  stick: sp(13, (b, v) => {
    const c = '#253a26';
    const s = v === 1 ? 2 : 0;
    legs(b, 0, 16, 4, 2.2, v, c, 5);
    bleed(b, [[-4.4, -15], [0, -15.4], [4.4, -15], [4.6, -5], [4.6, 5], [4.4, 14.4], [0, 14.8], [-4.4, 14.4], [-4.6, 5], [-4.6, -5]], FOREST, 1.4);
    for (let i = 0; i < 4; i++) b.fill(c, [[-4, -16 + i * 8], [4, -16 + i * 8], [3.6, -9.5 + i * 8], [-3.6, -9.5 + i * 8]], 0.97, 0.3);
    b.wash('#4f6a4c', [[-3.4, -14.6], [-0.9, -14.6], [-0.9, -5], [-0.9, 5], [-0.9, 14.4], [-3.2, 14.4], [-3.4, 5], [-3.4, -5]], 0.65, 1);
    // nodes as rings
    for (let i = 1; i < 4; i++) b.brush([[-5, -16.5 + i * 8, 1.6], [5, -16.5 + i * 8, 1.6]], 0.97, FOREST);
    b.brush([[3, -6, 1.4], [11, -12 + s, 3], [16, -14 + s, 0.6]], 0.88, c); b.brush([[-3, 0, 1.4], [-11, -5 - s, 3], [-16, -6 - s, 0.6]], 0.88, c);
    b.dry([[11, -12.6 + s, 2], [15.4, -15 + s, 1]], 0.7, '#5f8a6e', 0.45); b.dry([[-11, -5.6 - s, 2], [-15.4, -7 - s, 1]], 0.7, '#5f8a6e', 0.45);
    if (v === 2) { b.brush([[3, 4, 1.4], [13, 2, 3], [18, 0, 0.6]], 0.88, c); b.brush([[-3, 6, 1.4], [-12, 9, 3], [-17, 10, 0.6]], 0.88, c); }
    eyes2(b, 0, -11, 2.7, 1.6);
  }),
  toadstool: sp(13, (b, v) => {
    const sq = v === 1 ? 1.08 : 1;
    b.fill('#e3dccb', [[-5.6, -1], [5.6, -1], [6.8, 12.4], [-6.8, 12.4]], 0.92, 0.4);
    b.wash('#a89c84', [[1.2, -0.6], [5, -1], [5.8, 11.6], [1.6, 11.6]], 0.6, 1);
    b.line([[-6.8, 12.4], [-5.6, -1]], 1.5, 0.88, INK); b.line([[6.8, 12.4], [5.6, -1]], 1.5, 0.88, INK); b.line([[-6.4, 12.6], [6.4, 12.6]], 1.4, 0.7, INK);
    bleed(b, ell(0, -1, 15 * sq, 11 / sq, Math.PI, Math.PI * 2, 14).concat([[15 * sq, 1], [0, 1.4], [-15 * sq, 1]]), '#3e1612', 1.4);
    b.fill('#7a2f28', ell(0, -1, 15 * sq, 11 / sq, Math.PI, Math.PI * 2, 16).concat([[15 * sq, 1], [-15 * sq, 1]]), 0.97, 0.4);
    b.fill('#a8483e', E(-5, -6, 6, 3.4, 12), 0.7, 1);
    b.line([[-14 * sq, 0.8], [14 * sq, 0.8]], 1.2, 0.8, '#3e1612');
    for (const [x, y, d] of [[-7, -6, 4], [2, -9, 4], [8, -4, 4], [-1, -3, 4]] as [number, number, number][]) b.disc(x, y, d / 2, '#efe7d6');
    eyes2(b, 0, 5, 2.6, 1.8);
    if (v === 2) b.wash('#8a9a6a', E(0, 0, 18, 16), 0.3);
  }),
  woodghost: sp(15, (b, v) => {
    const up = v === 2;
    b.wash(FOREST, [[-10, -5], [-13.4, 10], [-9, 18], [-2, 14], [3, 19], [9.4, 13], [10, -3]], 0.84, 1.5);
    bleed(b, [[-9, -2], [-4, -14], [4, -15], [9, -4], [6, 2], [-7, 2]], FOREST, 2.4, 0.56);
    b.fill(FOREST, [[-9, -2], [-4, -14], [4, -15], [9, -4], [6, 2], [-7, 2]], 0.97, 0.4);
    b.wash(FUR, [[-7.6, -3], [-3.6, -12], [0.6, -12.4], [-2, -3]], 0.6, 1);
    sheen(b, 0, -6, 7.6, 7.6, Math.PI * 1.05, Math.PI * 1.5, 1.8);
    b.fill('#c9cfc6', E(3, -7, 3.6, 4.2, 12), 0.75, 0.3);
    for (const x of [2.2, 4.6]) { b.disc(x, -7.5, 1.1, '#111'); b.disc(x - 0.3, -7.9, 0.35, '#ffffff'); }
    const ax = up ? [[2, -2, 2.2], [8, -16, 1.8]] : [[-4, 0, 2.2], [-14, -12, 1.8]];
    b.brush(ax as [number, number, number][], 0.95, '#6b4a2a');
    const [hx, hy] = ax[1] as number[];
    // the axe head in two steels with an ink edge
    b.fill(STEEL_SH, [[hx, hy], [hx + 6.4, hy - 4], [hx + 7.4, hy + 3.4]], 0.97, 0.2);
    b.fill(STEEL_LIT, [[hx, hy], [hx + 6.4, hy - 4], [hx + 6.6, hy - 0.4]], 0.97, 0.2);
    b.line([[hx + 6.4, hy - 4], [hx + 7.4, hy + 3.4]], 1.1, 0.85, INK);
  }),
  // ───────────── 广寒
  shadowhare: sp(12, (b, v) => {
    const hop = v === 1;
    const by = hop ? -2 : 2, hy = hop ? -8 : -4;
    b.wash(PALACE, E(-2, by, 12.4, 9.2), 0.84, 1.4);
    b.fill(PALACE, E(-2, by, 9, 7), 0.95, 0.6);
    b.wash(SKY, E(-5, by - 2.6, 4.6, 2.6, 12), 0.6, 1);
    sheen(b, -2, by, 7.6, 5.6, Math.PI * 1.05, Math.PI * 1.5, 1.8);
    b.fill(PALACE, E(7, hy, 5.5, 5, 12), 0.95, 0.4);
    b.brush([[6, hy - 4, 3.4], [4, hy - 12, 2.8], [1, hy - 17, 1]], 0.95, PALACE);
    b.brush([[8, hy - 4, 3.2], [9, hy - 12, 2.6], [8, hy - 17, 0.8]], 0.95, PALACE);
    // the ears' lit inside
    b.brush([[5.4, hy - 5, 1.2], [3.8, hy - 12, 0.9], [2, hy - 15, 0.4]], 0.8, '#6c7c9c');
    eye1(b, 9.4, hy - 0.6, 1.5, 0.35, '#b9c8da');
    b.brush(hop ? [[-6, 3, 3.2], [-14, 8, 1.2]] : [[-6, 7, 3.2], [-2, 10, 2.6]], 0.92, PALACE);
    if (v === 2) b.line(ell(0, 10, 13, 3.5, 0, TAU, 14), 1.4, 0.7, SILVER);
  }, 3, 1.65),
  crow: sp(12, (b, v) => {
    const up = v === 1 ? -6 : 0;
    // wings as two dry sweeps (feathers in 飞白)
    b.brush([[-2, 0, 3.6], [-8, -8 + up, 6.4], [-15, -14 + up, 3.8], [-20, -12 + up, 1]], 0.97, INK);
    b.brush([[-2, 0, 3.6], [-8, 8 - up, 6.4], [-15, 14 - up, 3.8], [-20, 12 - up, 1]], 0.97, INK);
    bleed(b, E(0, 0, 9, 4.5, 12), INK, 2);
    b.dry([[-4, -2.4, 1.6], [-9, -8.4 + up, 1.8], [-15, -13 + up, 0.6]], 0.55, SHEEN, 0.55);
    b.dry([[-4, 2.4, 1.2], [-9, 8.4 - up, 1.4], [-14, 12.4 - up, 0.5]], 0.4, SHEEN, 0.6);
    b.fill(INK, E(0, 0, 9, 4.5, 14), 0.97, 0.4);
    b.wash(SLATE, E(-1.6, -1.6, 5, 2, 12), 0.6, 1);
    b.fill(INK, [[-8, -2], [-15, -4], [-14, 4], [-8, 2]], 0.95, 0.3);
    b.fill(INK, E(8, 0, 4, 3.4, 12), 0.97, 0.3);
    b.fill(v === 2 ? DANGER : '#4a4a4a', [[11, -1.2], [16, 0], [11, 1.2]], 0.95, 0.2);
    glowEye(b, 9, -1.2, 1.4, '#e9c46a', 0.5);
  }),
  soldier: sp(16, (b, v) => {
    legs(b, -2, 10, 7, 3.8, v, PALACE, 6);
    bleed(b, [[-8, -6], [-1, -6.4], [6, -6], [7, 2.6], [8, 11], [0, 11.4], [-9, 11], [-8.6, 2.6]], PALACE, 4.2, 0.6);
    b.fill('#3e4a5e', [[-8, -6], [6, -6], [8, 11], [-9, 11]], 0.97, 0.4);
    // armour plates: lit on the near side, silver rims
    for (let y = -5; y < 9; y += 4) b.fill('#5f7090', [[-7.6, y], [-1, y], [-1, y + 2.6], [-8, y + 2.6]], 0.75, 0.6);
    for (let y = -3; y < 10; y += 4) b.line([[-8, y], [7, y]], 1, 0.55, SILVER);
    b.fill('#e8d8c0', E(0, -11, 5, 5, 12), 0.92, 0.3);
    b.fill('#3e4a5e', ell(0, -13, 6, 4, Math.PI, Math.PI * 2, 10).concat([[6, -12], [-6, -12]]), 0.97, 0.3);
    b.brush([[0, -17, 1.8], [-3, -22, 2.6], [-7, -21 - (v === 1 ? 2 : 0), 0.8]], 0.92, CINNABAR);
    b.disc(2.2, -11, 1.2, '#111'); b.disc(1.9, -11.4, 0.38, '#ffffff');
    b.fill('#556478', [[9, -12], [16, -10], [16, 12], [9, 14]], 0.97, 0.3);
    b.fill('#7a8aa4', [[9.6, -11], [12, -10.4], [12, 12.6], [9.6, 13]], 0.7, 0.4);
    b.dot(12.5, 1, 5.4, 0.95, GOLD); b.dot(11.8, 0.2, 2, 0.8, '#f0cf6a');
    b.line([[9, -12], [16, -10], [16, 12], [9, 14], [9, -12]], 1.7, 0.9, INK);
    if (v === 2) {
      b.brush([[4, -2, 1.6], [22, -3.6, 1.6]], 0.95, '#6b4a2a');
      b.fill(STEEL_SH, [[22, -5.4], [26.4, -3.8], [22, -2]], 0.97, 0.2); b.fill(STEEL_LIT, [[22, -5.4], [26.4, -3.8], [22, -3.6]], 0.97, 0.2);
    }
  }),
  frost: {
    box: [-18, -18, 18, 18], n: 3, halo: 'dark',
    paint(b, v) {
      const r = v === 2 ? 1.2 : 1, C = '#3f5f8a';
      bleed(b, star(0, 0, 13 * r, 4.4, 5, v * 0.3), C, 1.6, 0.34);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + v * 0.3;
        b.fill(i % 2 ? '#a9c9de' : '#8cb4d0', rot([[0, -3.8], [14 * r, 0], [0, 3.8]], a), 0.92, 0.2);
        b.fill('#e2eef6', rot([[0, -3.8], [14 * r, 0], [0, 0]], a), 0.85, 0.2);
        // pale on pale: a cold-indigo contour (R11)
        b.line(rot([[0.6, -4.2], [13.4 * r, 0], [0.6, 4.2]], a), 2, 0.88, C);
      }
      b.fill('#e9f3f8', star(0, 0, 8, 4, 6), 0.95, 0.3);
      b.line(star(0, 0, 8, 4, 6).concat([[0, -8]]), 1, 0.6, C);
      b.fill(PALACE, E(0, 0, 4.5, 4.5, 12), 0.95, 0.3);
      for (const x of [-1.4, 1.4]) { b.disc(x, -0.5, 1.1, '#e9f3f8'); b.disc(x + 0.3, -0.4, 0.5, '#1c2230'); }
      if (v === 2) b.ring(0, 0, 13, 1.4, AZ, 0.9);
    },
  },
  guihua: sp(12, (b, v) => {
    const a0 = v * 0.2;
    bleed(b, E(0, 0, 12, 12, 16), '#8a5f1a', 1.2, 0.32);
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i / 4) * Math.PI * 2;
      b.fill(GOLD, rot(E(8, 0, 7, 5.5, 12), a), 0.94, 0.5);
      b.fill('#f0cf6a', rot(E(7, -1.4, 3.6, 2.2, 10), a), 0.75, 0.6);
      b.line(rot(ell(8, 0, 7.2, 5.6, -Math.PI * 0.6, Math.PI * 0.6, 8), a), 1.5, 0.8, '#8a5f1a');
    }
    b.fill('#a8703a', E(0, 0, 5.5, 5.5, 12), 0.97, 0.4);
    // florets: little gold flowers at the tips
    for (const [x, y] of rot([[13.4, 3.4], [-3.6, 13], [-12.8, -3]], a0) as Pt[]) { b.dot(x, y, 3.2, 0.95, '#f5d76e'); b.dot(x, y, 1.2, 0.9, '#a8703a'); }
    eyes2(b, 0, -0.5, 2.3, 1.5);
    b.brush([[0, 6, 1.4], [-3, 13, 1]], 0.85, '#3e5a3a');
    if (v === 2) b.ring(0, 0, 15, 1.2, DANGER, 0.8);
  }),
  toad: sp(16, (b, v) => {
    const gold = '#b88a2a';
    bleed(b, E(0, 2, 16, 11), PALACE, 2.4, 0.56);
    b.fill(PALACE, E(0, 2, 16, 11, 18), 0.97, 0.5);
    b.wash(SKY, E(-5, -3, 8, 4.4, 12), 0.6, 1);
    sheen(b, 0, 2, 14, 9, Math.PI * 1.05, Math.PI * 1.45, 2);
    for (const [x, y] of [[-8, -2], [-2, 4], [4, -3], [-6, 7], [7, 5], [0, -5]] as Pt[]) { b.dot(x, y, 3.6, 0.92, gold); b.dot(x - 0.6, y - 0.6, 1.6, 0.9, '#f0d060'); }
    b.brush([[-12, 8, 4], [-18, 14, 3]], 0.95, PALACE); b.brush([[6, 10, 4], [10, 15, 3]], 0.95, PALACE); b.brush([[-2, 11, 4], [-1, 16, 3]], 0.95, PALACE);
    b.fill(PALACE, E(12, -4, 8, 6.5, 14), 0.97, 0.4);
    b.dot(10, -10, 5.6, 0.97, PALACE); b.dot(16, -10, 5, 0.97, PALACE);
    eye1(b, 10.4, -10.4, 1.9, 0.3, '#f0d060'); eye1(b, 16.2, -10.4, 1.7, 0.3, '#f0d060');
    b.line([[13, -1], [20, -2]], 1.2, 0.85, gold);
    if (v === 2) b.brush([[19, -2, 3], [28, -1, 2.4]], 0.92, ROUGE);
  }),
  star: sp(14, (b, v) => {
    legs(b, 0, 10, 5, 2.4, v, PALACE, 5);
    bleed(b, [[-9, -4], [0, -4.4], [9, -4], [10.6, 4], [12, 12], [0, 12.4], [-12, 12], [-10.6, 4]], PALACE, 3.2, 0.6);
    b.fill('#2c3650', [[-9, -4], [9, -4], [12, 12], [-12, 12]], 0.97, 0.4);
    b.wash('#4a5878', [[-8, -3], [-1, -3], [-2, 10], [-10.6, 11]], 0.6, 1);
    for (const [x, y] of [[-5, 4], [3, 8]] as Pt[]) b.dot(x, y, 2.2, 0.9, '#e9d58a');
    b.brush([[-9, -4, 3.8], [-13, 6, 3.4]], 0.95, '#2c3650'); b.brush([[9, -4, 3.8], [14, 3, 3.2]], 0.95, '#2c3650');
    b.fill('#e3d6bf', E(0, -9, 5, 5.5, 12), 0.92, 0.3);
    b.fill('#2c3650', [[-7, -13], [7, -13], [5, -16], [-5, -16]], 0.97, 0.2);
    // the star: gold points round a white core (and a bloom on the tell)
    if (v === 2) b.disc(0, -20, 6, '#f6e7a0', 0.45);
    b.fill(v === 2 ? '#fff4c0' : '#e9d58a', star(0, -20, 5.1, 2.3, 5), 0.97, 0.2);
    b.fill('#fffbe8', star(0, -20, 2.6, 1.2, 5), 0.95, 0.2);
    b.fill('#d9d2c0', [[13, 0], [16, -9], [18, -8], [15, 1]], 0.95, 0.2);
    for (const x of [-1.8, 1.8]) { b.disc(x, -9, 1.1, '#111'); b.disc(x - 0.3, -9.4, 0.35, '#ffffff'); }
  }),
  clerk: sp(12, (b, v) => {
    legs(b, 0, 7, 5, 2.2, v, PALACE, 5);
    bleed(b, [[-6, -3], [6, -3], [8, 8], [-8, 8], [-14, 0], [-8, -6]], PALACE, 2);
    b.fill('#34425c', [[-6, -3], [6, -3], [8, 8], [-8, 8]], 0.97, 0.4);
    b.fill('#52617e', [[-5.4, -2.4], [-1, -2.4], [-1.4, 7.4], [-7, 7.4]], 0.7, 0.6);
    // the drum: lit and shade, a gold rim
    b.fill('#7a2f28', E(-8, 0, 6, 6, 14), 0.97, 0.3);
    b.fill('#b0544a', E(-9.6, -1.6, 3, 2.6, 10), 0.75, 0.6);
    b.line(ell(-8, 0, 6, 6, 0, TAU, 14), 2, 0.92, GOLD);
    b.fill('#e3d6bf', E(1, -8, 4.6, 4.8, 12), 0.92, 0.3);
    b.fill('#34425c', [[-4, -12], [6, -12], [5, -15], [-3, -15]], 0.97, 0.2);
    b.disc(2.6, -8, 1, '#111'); b.disc(2.3, -8.4, 0.32, '#ffffff');
    const up = v === 2;
    b.brush(up ? [[4, -3, 1.8], [9, -16, 1.6]] : [[4, -3, 1.8], [12, -6, 1.6]], 0.95, '#6b4a2a');
    b.fill(STEEL_SH, up ? E(9, -17, 3.2, 2.2, 10) : E(13, -6.5, 2.2, 3.2, 10), 0.97, 0.2);
    b.fill(STEEL_LIT, up ? E(8.4, -17.8, 2, 1.1, 8) : E(12.4, -7.6, 1.1, 2, 8), 0.9, 0.2);
    if (up) { b.disc(12, -16, 4.4, '#e0a526', 0.28); b.brush([[14, -20, 1.4], [11, -14, 1.8], [15, -12, 1.4], [12, -6, 0.6]], 0.95, '#e0a526'); }
  }),
  dancer: sp(14, (b, v) => {
    const spin = v === 2 ? 1 : 0, s = v === 1 ? 1 : -1;
    // two ribbons, each in two values (a lit stripe down its middle)
    const r1: [number, number, number][] = [[-3, -4, 2.4], [-12, 0 + s * 3, 5], [-20, 6 + s * 5, 3.8], [-24, 14, 1]];
    const r2: [number, number, number][] = [[3, -4, 2.4], [12, -8 - s * 3 - spin * 6, 5], [20, -4 - spin * 8, 3.8], [24, 6, 1]];
    b.brush(r1, 0.82, '#8fb0c8'); b.brush(r1.map(([x, y, w]) => [x, y - w * 0.15, w * 0.4] as [number, number, number]), 0.6, '#d6e4ee');
    b.brush(r2, 0.82, '#e08ea2'); b.brush(r2.map(([x, y, w]) => [x, y - w * 0.15, w * 0.4] as [number, number, number]), 0.6, '#f6d2da');
    bleed(b, [[-5, -4], [5, -4], [7.6, 5], [10, 14], [0, 14.4], [-10, 14], [-7.6, 5]], PALACE);
    b.fill(PALACE, [[-5, -4], [5, -4], [10, 14], [-10, 14]], 0.97, 0.5);
    b.wash(SKY, [[-4.4, -3], [-0.6, -3], [-2, 12], [-8.6, 12.4]], 0.6, 1);
    b.line([[-7, 8], [7, 8]], 1, 0.6, '#e7a3b3');
    b.fill('#f1e0cf', E(0, -9, 4.4, 4.8, 12), 0.92, 0.3);
    b.fill(PALACE, E(0, -13, 5, 3.2, 10), 0.97, 0.2);
    b.dot(3, -15, 2.8, 0.92, '#e7a3b3');
    for (const x of [-1.4, 1.6]) { b.disc(x, -9, 1, '#111'); b.disc(x - 0.3, -9.4, 0.32, '#ffffff'); }
    if (spin) b.line(ell(0, 4, 19, 6, 0, TAU, 18), 1.2, 0.7, SILVER);
  }),
  axeshade: sp(17, (b, v) => {
    b.wash(PALACE, [[-11, -6], [-14.4, 12], [-9, 20], [-2, 15], [3, 21], [10.4, 14], [12, -4]], 0.84, 1.5);
    bleed(b, [[-10, -2], [-5, -16], [5, -17], [11, -4], [8, 4], [-8, 4]], PALACE, 2.6, 0.56);
    b.fill(PALACE, [[-10, -2], [-5, -16], [5, -17], [11, -4], [8, 4], [-8, 4]], 0.97, 0.4);
    b.wash(SKY, [[-8.6, -3], [-4.4, -14], [0.4, -14.6], [-2, -3]], 0.6, 1);
    sheen(b, 0, -7, 8.6, 8.6, Math.PI * 1.05, Math.PI * 1.5, 2);
    b.fill('#c9cfd6', E(3, -8, 4, 4.4, 12), 0.75, 0.3);
    for (const x of [2.4, 4.8]) { b.disc(x, -8.5, 1.1, v === 2 ? DANGER : '#111'); b.disc(x - 0.3, -8.9, 0.35, '#ffffff'); }
    b.brush([[-8, 2, 4], [-15, 9 + (v === 1 ? 2 : 0), 2.8]], 0.95, PALACE); b.brush([[8, 2, 4], [15, 9 - (v === 1 ? 2 : 0), 2.8]], 0.95, PALACE);
  }),
  skypup: sp(11, (b, v) => {
    const cr = v === 2 ? 3 : 0;
    b.brush([[-10, -2 + cr, 3.4], [-16, -8 + cr, 2.2], [-18, -12 + cr, 1]], 0.94, INK);
    b.wash('#0d1020', E(0, 1, 14.4, 11, 18), 0.3, 3);
    bleed(b, E(-2, 1 + cr, 10, 6 - cr * 0.3), '#0d1020', 3.6, 0.58);
    b.fill(INK, E(-2, 1 + cr, 11.4, 7.2 - cr * 0.3, 16), 0.97, 0.4);
    b.wash(SLATE, E(-4.6, -1.4 + cr, 5, 2.2, 12), 0.6, 1);
    sheen(b, -2, 1 + cr, 8.6, 4.6, Math.PI * 1.05, Math.PI * 1.5, 1.8);
    // the bite out of the moon it carries on its flank
    b.fill('#e9edf2', ell(-5, 2 + cr, 3, 3, -Math.PI / 2, Math.PI / 2, 8).concat(ell(-6, 2 + cr, 2.2, 3, Math.PI / 2, -Math.PI / 2, 8)), 0.85, 0.3);
    b.fill(INK, E(8, -3 + cr, 6.6, 5.6, 12), 0.97, 0.4);
    b.fill(INK, [[5, -6 + cr], [6, -13.6 + cr], [9.4, -7 + cr]], 0.97, 0.2);
    b.fill(INK, [[12, -4 + cr], [17, -2 + cr], [12, 0 + cr]], 0.97, 0.2);
    glowEye(b, 9.5, -4 + cr, 1.5, '#f0d060');
    const s = v === 1 ? 2 : 0;
    for (const [x, d] of [[-8, -s], [-4, s], [3, -s], [6, s]] as Pt[]) b.brush([[x, 5 + cr, 2.8], [x + d, 11.4, 2.2]], 0.97, INK);
  }),
  // ───────────── elites (gold seal)
  turtle: sp(30, (b, v) => {
    const shell = v === 2;
    if (!shell) {
      const s = v === 1 ? 4 : 0;
      for (const [x, y, d] of [[16, -18, s], [16, 18, -s], [-16, -18, -s], [-16, 18, s]] as [number, number, number][]) b.fill(LAKE, rot(E(0, 0, 11, 6, 12), (y > 0 ? 0.6 : -0.6) + d * 0.05).map(([px, py]) => [px + x + d, py + y] as Pt), 0.97, 0.4);
      b.fill(LAKE, E(31, 0, 9.8, 7.8, 14), 0.97, 0.4);
      b.fill(SLATE, E(29.4, -2.4, 4.6, 2.6, 10), 0.6, 1);
      eye1(b, 35, -2.6, 1.9, 0.35);
    }
    bleed(b, E(0.4, 0.5, 25, 21, 22), INK, 4.4, 0.6);
    b.fill('#2a3a3e', E(0, 0, 25, 21, 24), 0.97, 0.5);
    b.wash('#4a6064', E(-8, -8, 13, 8.6), 0.65, 1.2);
    for (const [x, y] of [[0, 0], [-12, -9], [12, -9], [-12, 9], [12, 9], [0, -15], [0, 15]] as Pt[]) b.line(star(x, y, 6.5, 6.5, 3, 0).concat([[x + 6.5, y]]), 1.6, 0.65, '#9ab0a6');
    b.line(E(0, 0, 25, 21, 24).concat([[25, 0]]), 1.6, 0.9, INK);
    sheen(b, 0, 0, 22, 18, Math.PI * 1.05, Math.PI * 1.5, 2.4);
    seal(b, -4, -2, 6);
  }, 3, 1.45),
  whitesnake: {
    box: [-40, -26, 40, 26], n: 3, halo: 'dark',
    paint(b, v) {
      const W = '#f4f2ea', IND = '#3f4f7a';
      const ph = v * 0.9;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([-36 + t * 62, Math.sin(t * Math.PI * 2 + ph) * 12, 3.6 + 7.6 * Math.sin(t * Math.PI * 0.95 + 0.1)]); }
      bleed(b, pts.map(([x, y, w]) => [x, y - w / 2 - 3.4] as Pt).concat(pts.slice().reverse().map(([x, y, w]) => [x, y + w / 2 + 3.4] as Pt)), '#3f4f7a', 0, 0.4);
      b.brush(pts, 0.97, W);
      // the belly's shade (R3) and a 1.6 u indigo contour (a white body on pale paper)
      b.brush(pts.map(([x, y, w]) => [x, y + w * 0.25, w * 0.42] as [number, number, number]), 0.6, '#d3d0c4');
      b.line(pts.map(([x, y, w]) => [x, y - w / 2] as Pt), 2.2, 0.9, IND);
      b.line(pts.map(([x, y, w]) => [x, y + w / 2] as Pt), 1.6, 0.75, IND);
      const [hx, hy] = pts[12];
      b.fill(W, E(hx + 6, hy, 8, 5.5, 14), 0.97, 0.4);
      b.line(ell(hx + 6, hy, 8, 5.5, -2.2, 2.2, 10), 1.4, 0.9, IND);
      glowEye(b, hx + 9, hy - 2, 1.5, CINNABAR, 0.35);
      b.brush([[hx + 13, hy, 0.8], [hx + 19, hy + (v === 2 ? -3 : 1), 1]], 0.92, CINNABAR);
      seal(b, hx - 4, hy - 9, 6);
    },
  },
  tiger: sp(28, (b, v) => {
    const roar = v === 2;
    const s = v === 1 ? 5 : 0;
    const fur = '#d9b98a';
    b.brush([[-24, -4, 5.2], [-32, -14, 4], [-30, -24, 1.6]], 0.94, INK);
    for (const [x, d] of [[-18, -s], [-10, s], [10, -s], [18, s]] as Pt[]) b.brush([[x, 6, 7.8], [x + d, 18, 6.8], [x + d + 2, 24, 5.6]], 0.97, INK);
    bleed(b, [[-24, -8], [-8, -14], [12, -12], [22, -6], [20, 8], [0, 8.4], [-22, 8]], '#4a3a26', 5.4, 0.58);
    b.fill(fur, [[-24, -8], [-8, -14], [12, -12], [22, -6], [20, 8], [-22, 8]], 0.97, 0.5);
    b.wash('#9a7348', [[-21, 1.4], [18, 1.4], [19, 7.6], [-21, 7.6]], 0.6, 1);
    b.wash('#f0dcb6', [[-20, -8], [-8, -12.4], [6, -11], [2, -6], [-18, -3]], 0.6, 1);
    // the stripes as dry strokes
    for (let x = -20; x < 18; x += 6) b.dry([[x, -13.4, 3.4], [x - 2, -4, 2.8], [x + 1, 4, 1]], 0.94, INK, 0.4);
    const hx = 26, hy = roar ? -14 : -8;
    b.fill(fur, E(hx, hy, 11, 10, 16), 0.97, 0.4);
    b.fill('#f0dcb6', E(hx - 3, hy - 3.4, 5.6, 4, 10), 0.6, 1);
    b.dot(hx - 6, hy - 9, 6, 0.97, INK); b.dot(hx + 5, hy - 9, 6, 0.97, INK);
    b.brush([[hx - 3, hy - 6, 1.6], [hx + 3, hy - 6, 1.6]], 0.92, INK); b.brush([[hx, hy - 8, 1.4], [hx, hy - 3, 1.4]], 0.92, INK); b.brush([[hx - 3, hy - 3, 1.6], [hx + 3, hy - 3, 1.6]], 0.92, INK);
    glowEye(b, hx - 3.5, hy, 1.9, '#e9c46a'); glowEye(b, hx + 4.5, hy, 1.9, '#e9c46a');
    if (roar) b.fill(CINNABAR, E(hx + 4, hy + 6, 5, 3.4, 12), 0.92, 0.3);
    b.brush(arcW(0, -3, 24, 12, Math.PI, Math.PI * 2, 1.6, 1.2, 12), 0.88, INK);
    seal(b, -6, -16, 7);
  }, 3, 1.3),
  painted: sp(16, (b, v) => {
    const slash = v === 2;
    // the shed paper skin (the tell is the shed: kept as it was)
    b.fill('#e6dfcf', [[-12, -8], [-3, -14], [-9, 4], [-14, 12]], 0.6, 0.5);
    b.line([[-12, -8], [-3, -14], [-9, 4], [-14, 12]], 0.8, 0.55, INK);
    bleed(b, [[-7, -4], [0, -4.4], [7, -4], [8.6, 5], [10, 14], [0, 14.4], [-9, 14], [-8, 5]], INK, 3.6, 0.58);
    b.fill('#2c3a2c', [[-7, -4], [7, -4], [10, 14], [-9, 14]], 0.97, 0.4);
    b.wash('#4a5e4a', [[-6.4, -3], [-1, -3], [-2.4, 12], [-8.4, 12.6]], 0.6, 1);
    b.fill('#5f8a6e', E(0, -10, 6, 6.5, 14), 0.97, 0.4);
    b.fill('#8ab49a', E(-2, -12, 3, 2.6, 10), 0.6, 1);
    b.brush([[-6, -15, 2.6], [-2, -18, 3.2], [4, -17, 2.2], [8, -12, 1.2]], 0.95, INK);
    glowEye(b, -1.5, -10, 1.3, DANGER, 0.4); glowEye(b, 2.5, -10, 1.3, DANGER, 0.4);
    b.brush([[-2, -6, 1], [0, -5, 1.2], [3, -6, 1]], 0.9, PAPER);
    const cl: [number, number, number][] = slash ? [[6, -2, 3.2], [14, -10, 2.4], [22, -14, 1.2]] : [[6, -2, 3.2], [12, 4, 2.4], [17, 9, 1.2]];
    b.brush(cl, 0.95, '#2c3a2c');
    for (let i = 0; i < 3; i++) b.line([[cl[2][0] + i, cl[2][1] + i * 1.5 - 1], [cl[2][0] + 5 + i, cl[2][1] + i * 1.5 - (slash ? 4 : -3)]], 0.9, 0.95, '#e6dfcf');
    legs(b, 0, 14, 4, 2.6, v, INK, 6);
    seal(b, -9, -18, 5.5);
  }, 3, 1.55),
  general: sp(24, (b, v) => {
    const thrust = v === 2;
    legs(b, -3, 14, 9, 4.6, v, PALACE, 9);
    b.brush([[-4, -6, 2.8], thrust ? [40, -6, 2.4] : [8, -30, 2.4]], 0.95, '#6b4a2a');
    if (thrust) { b.fill(STEEL_SH, [[40, -9], [48, -6], [40, -3]], 0.97, 0.2); b.fill(STEEL_LIT, [[40, -9], [48, -6], [40, -6]], 0.97, 0.2); }
    else { b.fill(STEEL_SH, [[5, -32], [8, -40], [11, -32]], 0.97, 0.2); b.fill(STEEL_LIT, [[5, -32], [8, -40], [8, -32]], 0.97, 0.2); }
    bleed(b, [[-12, -10], [-1, -10.4], [9, -10], [10.6, 3], [12, 16], [0, 16.4], [-13, 16], [-12.6, 3]], PALACE, 5.8, 0.64);
    b.fill('#3e4a5e', [[-12, -10], [9, -10], [12, 16], [-13, 16]], 0.97, 0.4);
    for (let y = -8; y < 14; y += 4) b.fill('#5f7090', [[-11.6, y], [-2, y], [-2, y + 2.4], [-12, y + 2.4]], 0.72, 0.6);
    for (let y = -6; y < 16; y += 4) b.line([[-12, y], [11, y]], 1, 0.55, GOLD);
    b.fill('#e8d8c0', E(-1, -16, 6.5, 6.5, 14), 0.92, 0.3);
    b.fill('#c9a646', ell(-1, -19, 8, 5, Math.PI, Math.PI * 2, 10).concat([[7, -18], [-9, -18]]), 0.97, 0.3);
    b.fill('#ecd27a', [[-7, -20], [-3, -23.4], [0, -23.4], [-3, -19.4]], 0.7, 0.4);
    b.brush([[-1, -24, 1.8], [-5, -31, 3.2], [-11, -30, 0.8]], 0.92, CINNABAR);
    b.disc(1.8, -16, 1.4, '#111'); b.disc(1.4, -16.5, 0.45, '#ffffff');
    b.fill('#556478', [[13, -18], [24, -15], [24, 18], [13, 21]], 0.97, 0.3);
    b.wash('#8292ae', [[13.8, -17], [17.4, -16.2], [17.4, 19.4], [13.8, 20]], 0.6, 1);
    b.fill(GOLD, E(18.5, 1, 4.5, 6, 12), 0.95, 0.3);
    b.fill('#f0cf6a', E(17.4, -1, 1.8, 2.4, 8), 0.8, 0.4);
    b.line([[13, -18], [24, -15], [24, 18], [13, 21], [13, -18]], 1.8, 0.92, INK);
    seal(b, -8, -2, 6);
  }, 3, 1.7),
  hound: sp(22, (b, v) => {
    const dash = v === 2, s = v === 1 ? 4 : 0;
    b.dry([[-20, -4, 6], [-29, -9.6 + s, 4.4], [-33, -6, 1.2]], 0.88, INK, 0.5);
    for (const [x, d] of [[-14, -s], [-7, s], [8, -s], [14, s]] as Pt[]) b.brush([[x, 4, 4.2], [x + d + (dash ? -4 : 0), 14, 3.2], [x + d + (dash ? -6 : 1), 20, 2.2]], 0.97, INK);
    bleed(b, [[-20, -6], [-6, -10], [10, -9], [18, -4], [16, 6], [0, 6.4], [-18, 6]], INK, 4.2, 0.58);
    b.fill('#232733', [[-20, -6], [-6, -10], [10, -9], [18, -4], [16, 6], [-18, 6]], 0.97, 0.5);
    b.wash(SKY, [[-17, -5], [-6, -8.6], [4, -8], [0, -3], [-16, -1.4]], 0.6, 1);
    // the white mane, with a shade
    b.brush([[4, -10, 4.4], [12, -12, 5.4], [18, -8, 4.4]], 0.85, '#e8e2d2');
    b.brush([[5, -8.6, 1.4], [12, -9.6, 1.8], [17, -6.4, 1.2]], 0.6, '#b8b0a0');
    const hx = 22, hy = dash ? -6 : -10;
    b.fill('#232733', [[14, hy + 2], [hx - 2, hy - 5], [hx + 12, hy], [hx + 4, hy + 6], [15, hy + 8]], 0.97, 0.4);
    b.fill('#232733', [[hx - 3, hy - 3], [hx - 1, hy - 12], [hx + 3, hy - 4]], 0.97, 0.2);
    sheen(b, hx + 2, hy, 7, 4.4, Math.PI * 1.1, Math.PI * 1.55, 1.6);
    glowEye(b, hx + 3, hy - 0.5, 1.7, '#f0d060');
    b.brush([[10, -6, 1.8], [14, -2, 1.8], [18, -4, 1.8]], 0.95, GOLD);
    seal(b, -6, -14, 6);
  }, 3, 1.55),
  // ───────────── treasures (gold lit washes and a sparkle)
  pixiu: sp(16, (b, v) => {
    const g = '#c79a3a', s = v === 1 ? 3 : 0;
    for (const [x, d] of [[-9, -s], [-3, s], [5, -s], [10, s]] as Pt[]) b.brush([[x, 6, 4.8], [x + d, 14.4, 4.2]], 0.97, '#7d5a22');
    bleed(b, E(0, 0, 15, 10, 18), '#7d5a22', 3.4, 0.5);
    b.fill(g, E(0, 0, 15, 10, 18), 0.97, 0.5);
    b.wash('#f0cf6a', E(-4, -3.6, 8, 4.4, 12), 0.7, 1);
    b.wash('#8a6420', [[-10, 4], [8, 3], [14, 1], [12, 8], [-8, 9.4]], 0.55, 1);
    b.brush([[-4, -6, 2.8], [-10, -16 + s, 6], [-2, -12, 2.8]], 0.88, '#e9c46a');
    b.fill(g, E(13, -6, 8, 7, 14), 0.97, 0.4);
    b.fill('#f0cf6a', E(11, -9, 3.6, 2.4, 10), 0.7, 1);
    b.brush([[14, -12, 2.2], [18, -19, 0.8]], 0.95, '#7d5a22');
    b.disc(16, -7, 1.7, '#111'); b.disc(15.5, -7.6, 0.55, '#ffffff'); b.fill(ROUGE, E(19, -2, 2.6, 1.6, 8), 0.85, 0.2);
    b.brush([[-14, -2, 3.2], [-20, -8, 2.2], [-22, -4, 0.8]], 0.92, '#7d5a22');
    for (const [x, y] of [[-6, -2], [0, 3], [5, -3]] as Pt[]) b.line(ell(x, y, 2.2, 1.6, Math.PI, Math.PI * 2, 5), 1, 0.75, '#7d5a22');
    spark(b, -8 + v, -8, 3.4);
  }, 3, 1.5),
  mirrorflower: {
    box: [-18, -18, 18, 18], n: 3, halo: 'dark',
    paint(b, v) {
      bleed(b, E(0, 0, 13.5, 13.5, 16), '#8a5f1a', 2.6, 0.5);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + v * 0.25;
        b.fill(i % 2 ? '#f0cf6a' : GOLD, rot(E(9, 0, 8, 4, 12), a), 0.92, 0.5);
        b.fill('#fbe7a6', rot(E(8, -1, 4, 1.6, 8), a), 0.7, 0.6);
        b.line(rot(ell(9, 0, 8.2, 4.2, -Math.PI * 0.7, Math.PI * 0.7, 8), a), 1.6, 0.8, '#8a5f1a');
      }
      b.fill('#fdf6dc', E(0, 0, 5.5, 5.5, 14), 0.97, 0.3);
      b.ring(0, 0, 5.5, 1.2, '#b5812a', 0.9);
      b.disc(-1.5, -1.5, 1.4, '#ffffff');
      spark(b, 9 - v * 2, -10 + v, 3.2);
    },
  },
};

export type MonSpecId = keyof typeof MON_SPECS;
