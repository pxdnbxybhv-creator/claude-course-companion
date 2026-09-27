// Monsters (36), named elites (6) and treasures (2): 焦墨 silhouettes that face right (+x), with pale
// eyes and one accent each. Frames: v0 / v1 are a two-step walk (the engine alternates them at
// ~5 Hz), v2 is the tell / attack pose (crouch, glow, raised arm) shown while a telegraph fills.
import type { EliteId, MonsterId, TreasureId } from '../ids';
import { B, blob, ell, arcW, spine, star, rot, type Pt, type Spec } from './kit';
import { CINNABAR, DANGER, GOLD, INK, JADE, PAPER, SILVER } from './palette';

const LAKE = '#1d2430', FOREST = '#161a15', PALACE = '#1c2230';
const AZ = '#3f6f8f'; // 石青: shooters
const ROUGE = '#b83a4b';

type Frame = 0 | 1 | 2;
const sp = (r: number, paint: (b: B, v: Frame) => void, n = 3, extra = 1.45): Spec => ({
  box: [-r * extra, -r * extra, r * extra, r * extra], n, paint: (b, v) => paint(b, v as Frame),
});

/** Stick legs: a pair of brushed lines from the body to the ground, alternating by frame. */
function legs(b: B, x: number, y: number, len: number, w: number, v: Frame, ink: string, spread = 4) {
  const s = v === 1 ? -1 : 1;
  b.brush(spine(x - spread * 0.5, y, x - spread * 0.5 - 2 * s, y + len, w, w * 0.6), 0.9, ink);
  b.brush(spine(x + spread * 0.5, y, x + spread * 0.5 + 2 * s, y + len, w, w * 0.6), 0.9, ink);
}
function seal(b: B, x: number, y: number, s: number) {
  // the elite's gold seal: a small square stamp with a carved cross
  b.flat((g) => {
    g.fillStyle = GOLD; g.fillRect(x - s / 2, y - s / 2, s, s);
    g.strokeStyle = '#7a4f12'; g.lineWidth = s * 0.12; g.strokeRect(x - s * 0.34, y - s * 0.34, s * 0.68, s * 0.68);
    g.beginPath(); g.moveTo(x, y - s * 0.25); g.lineTo(x, y + s * 0.25); g.moveTo(x - s * 0.22, y); g.lineTo(x + s * 0.22, y); g.stroke();
  });
}

export const MON_SPECS: Record<MonsterId | EliteId | TreasureId, Spec> = {
  // ───────────── shared
  blot: sp(13, (b, v) => {
    const sq = v === 1 ? [14.5, 11.5] : v === 2 ? [12, 14.5] : [13, 12.5];
    b.fill(INK, blob(0, 0, sq[0], sq[1], 11 + v, 0.14), 0.95, 0.9);
    b.dot(-13, 8, 3.2, 0.9); b.dot(11, 10, 2.2, 0.85); b.dot(-9, -12, 1.8, 0.8);
    b.eyes(3, -3, 4.2, 2.6);
  }),
  paperman: sp(14, (b, v) => {
    const c = '#3a342d', dy = v === 2 ? 4 : 0, sx = v === 2 ? 1.15 : 1;
    b.fill(c, [[-8 * sx, -2 + dy], [8 * sx, -2 + dy], [11 * sx, 14], [-11 * sx, 14]], 0.95, 0.3);
    b.fill(c, ell(0, -9 + dy, 6.5, 6.5, 0, Math.PI * 2, 14), 0.95, 0.3);
    b.brush([[-16, 1 + dy, 2.2], [-8, -1 + dy, 2.6]], 0.95, c); b.brush([[8, -1 + dy, 2.6], [16, 1 + dy + (v === 1 ? -3 : 0), 2.2]], 0.95, c);
    b.dot(-3, -7 + dy, 3, 0.8, ROUGE); b.dot(3.5, -7 + dy, 3, 0.8, ROUGE);
    b.eyes(0.5, -10 + dy, 2.4, 1.4);
    if (v === 2) for (const [x, y] of [[-6, 4], [5, 7], [0, 10]] as Pt[]) b.line([[x - 2, y], [x, y - 1.5], [x + 2, y + 0.5]], 0.5, 0.8, PAPER);
    else b.line([[-6, 6], [6, 6]], 0.5, 0.35, PAPER);
  }),
  shard: sp(13, (b, v) => {
    const pts = rot([[-12, -3], [-4, -13], [3, -9], [13, -12], [8, 2], [12, 12], [0, 8], [-9, 13]], v * 0.18);
    b.fill('#3b2e22', pts, 0.95, 0.3);
    b.fill('#8a6a3c', rot([[-7, -2], [-2, -9], [4, -6], [2, 4]], v * 0.18), 0.8, 0.3);
    b.flat((g) => { g.strokeStyle = SILVER; g.globalAlpha = v === 2 ? 1 : 0.8; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-6, -5); g.lineTo(4, -8); g.stroke(); });
    b.eyes(2, 1, 3.4, 2);
  }),
  lantern: sp(14, (b, v) => {
    const big = v === 2 ? 1.5 : 1;
    b.fill(INK, ell(0, 3, 10, 11), 0.94, 0.5);
    for (const x of [-5, 0, 5]) b.line([[x, -7], [x * 1.25, 3], [x, 13]], 0.5, 0.5, PAPER);
    b.fill(INK, [[-5, -9], [5, -9], [5, -6], [-5, -6]], 0.95, 0.2);
    b.fill(AZ, [[0, -9 - 13 * big], [5 * big, -12], [3, -8], [-3, -8], [-5 * big, -12]], 0.85, 0.6);
    if (v === 2) b.fill(DANGER, [[0, -9 - 9 * big], [3, -12], [-3, -12]], 0.8, 0.5);
    b.eyes(0, 2, 3.6, 2.2); b.line([[-3, 7], [0, 8.5], [3, 7]], 0.8, 0.9, PAPER);
  }, 3, 1.75),
  // ───────────── 月湖
  tadpole: sp(8, (b, v) => {
    b.fill(LAKE, ell(3, 0, 6, 5), 0.95, 0.5);
    const t = v === 1 ? -1 : 1;
    b.brush([[-1, 0, 5], [-6, 2 * t, 3.4], [-10, -1 * t, 1.8], [-13, 2 * t, 0.4]], 0.92, LAKE);
    b.disc(5, -1.5, 1.4, PAPER);
  }, 2),
  shrimp: sp(14, (b, v) => {
    const straight = v === 2;
    const segs: [number, number, number][] = straight
      ? [[12, 0, 7], [6, 0, 8], [0, 0, 8], [-6, 0, 7], [-11, 0, 5]]
      : [[10, -4, 7], [6, 1, 8], [0, 3, 8], [-6, 1, 7], [-9, -4, 5]];
    for (const [x, y, w] of segs) b.dot(x, y, w, 0.93, LAKE);
    const tail = segs[segs.length - 1];
    b.fill(LAKE, [[tail[0], tail[1]], [tail[0] - 6, tail[1] - 5], [tail[0] - 7, tail[1] + 4]], 0.9, 0.3);
    b.line([[segs[0][0] + 2, segs[0][1] - 2], [segs[0][0] + 10, segs[0][1] - 12]], 0.5, 0.7, LAKE);
    b.line([[segs[0][0] + 2, segs[0][1] - 1], [segs[0][0] + 14, segs[0][1] - 6]], 0.5, 0.7, LAKE);
    b.brush([[-2, 8, 1.2], [14, straight ? 1 : -2, 1.2]], 0.9, '#6b4a2a');
    b.fill(SILVER, [[14, straight ? 1 : -2], [18, straight ? 0 : -3.5], [15, straight ? 3 : 0]], 0.9, 0.2);
    b.disc(segs[0][0] + 2, segs[0][1] - 1.5, 1.5, PAPER);
    if (v !== 2) legs(b, 2, 5, 5, 1, v, LAKE, 6);
  }, 3, 1.6),
  frog: sp(13, (b, v) => {
    const cr = v === 2 ? 3 : 0;
    b.fill(LAKE, ell(0, 2 + cr, 13, 9 - cr * 0.6), 0.95, 0.5);
    b.fill(LAKE, ell(-9, 6 + cr * 0.5, 6, 5), 0.95, 0.4);
    if (v === 1) b.brush([[-10, 9, 3], [-17, 12, 2.4], [-20, 10, 1]], 0.95, LAKE);
    b.fill('#2d3a2e', ell(6, 7 + cr * 0.4, 5, 3.5), 0.8, 0.4);
    for (const x of [4, 9]) { b.dot(x, -5 + cr, 6, 0.95, LAKE); b.disc(x + 0.8, -5.5 + cr, 1.8, PAPER); b.disc(x + 1.2, -5.5 + cr, 0.9, '#111'); }
    b.line([[6, 3 + cr], [12, 2.5 + cr]], 0.6, 0.6, PAPER);
    b.dot(-4, 0 + cr, 2, 0.6, JADE); b.dot(2, 2 + cr, 1.6, 0.6, JADE);
  }),
  crab: sp(20, (b, v) => {
    const s = v === 1 ? 2 : 0;
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = -6 + i * 6, dir = k;
      b.brush([[-4 + i * 2, y, 2.4], [-16 + i * 2, y + dir * 0 - 2 + (i % 2 ? s : -s), 2], [-22 + i * 3, y + 6, 0.8]], 0.9, LAKE);
      void dir;
    }
    b.fill(LAKE, blob(0, 0, 15, 12, 5, 0.06), 0.96, 0.5);
    b.line([[-8, -4], [0, -7], [8, -4]], 0.6, 0.35, PAPER);
    for (const y of [-10, 10]) {
      b.brush([[8, y * 0.6, 3.4], [14, y * 1.0, 3.2], [18, y * 0.9, 2.4]], 0.95, LAKE);
      b.fill(LAKE, ell(22, y * 0.8, 6.5, 5), 0.95, 0.4);
      b.line([[22, y * 0.8], [28, y * 0.8 + (y > 0 ? -2 : 2)]], 1.2, 0.95, LAKE);
    }
    b.eyes(10, -2, 3, 2); if (v === 2) b.fill(SILVER, [[18, -12], [26, -6], [26, 6], [18, 12]], 0.25, 1);
  }),
  lotuspod: sp(15, (b, v) => {
    b.brush([[0, 8, 3], [-2, 16, 2.4], [0, 22, 1.6]], 0.9, '#3e5a3a');
    b.wash(JADE, blob(-9, 18, 10, 5, 3), 0.55);
    b.fill('#3c4a32', [[-13, -7], [13, -7], [9, 8], [-9, 8]], 0.95, 0.4);
    b.fill('#556645', ell(0, -7, 13, 4), 0.9, 0.3);
    const glow = v === 2;
    for (const [x, y] of [[-7, -7], [0, -8], [7, -7], [-3.5, -5], [3.5, -5]] as Pt[]) b.disc(x, y, 1.6, glow ? DANGER : '#1b1f16');
    b.eyes(0, 1, 3.6, 2);
  }),
  jelly: sp(13, (b, v) => {
    const pulse = v === 2;
    for (const x of [-7, -3, 1, 5, 8]) b.brush([[x, 2, 1.4], [x + (v === 1 ? 2 : -2), 10, 1], [x, 17, 0.3]], 0.6, LAKE);
    b.wash('#51708a', ell(0, -2, 13, 10, Math.PI, Math.PI * 2, 16).concat([[13, 2], [-13, 2]]), 0.6);
    b.fill(pulse ? DANGER : '#2c3a4a', ell(0, -3, 6, 5), pulse ? 0.9 : 0.75, 0.6);
    b.line(ell(0, -2, 13, 10, Math.PI, Math.PI * 2, 12), 0.8, 0.8, LAKE);
    b.eyes(1, -1, 3.5, 1.8);
  }),
  clam: sp(16, (b, v) => {
    const open = v === 0 ? 5 : v === 1 ? 2 : 0;
    b.fill(LAKE, ell(0, 4, 16, 9, 0, Math.PI, 14).concat([[-16, 4]]), 0.95, 0.4);
    b.fill('#232c38', ell(0, 4 - open, 16, 11, Math.PI, Math.PI * 2, 14), 0.95, 0.4);
    for (let i = -3; i <= 3; i++) b.line([[i * 2, 4 - open - 1], [i * 5.2, -6 - open]], 0.6, 0.5, PAPER);
    if (open > 0) { b.fill('#0d1016', [[-14, 4 - open], [14, 4 - open], [14, 4], [-14, 4]], 0.9, 0.3); b.disc(3, 4 - open / 2, open * 0.35 + 0.6, PAPER); b.disc(-4, 4 - open / 2, open * 0.35 + 0.6, PAPER); }
  }),
  egret: {
    box: [-22, -24, 24, 20], n: 3, halo: 'dark',
    paint(b, v) {
      const W = '#f7f6f1';
      const neck = v === 2 ? [[4, -4, 4], [12, -8, 3], [18, -9, 2.4]] : [[4, -4, 4], [6, -12, 3], [11, -17, 2.4]];
      b.fill(W, ell(-2, 0, 13, 7), 0.97, 0.5);
      b.brush(neck as [number, number, number][], 0.97, W);
      const hx = neck[2][0], hy = neck[2][1];
      b.fill(W, ell(hx + 1, hy, 4, 3), 0.97, 0.4);
      b.brush([[hx + 4, hy, 1.4], [hx + 11, hy + 1.2, 0.5]], 0.95, '#d9a62e');
      b.line(ell(-2, 0, 13, 7, Math.PI * 0.9, Math.PI * 2.1, 12), 0.9, 0.85, INK);
      b.brush([[-14, 0, 2], [-21, 2, 0.6]], 0.8, INK);
      b.disc(hx + 1.5, hy - 0.8, 0.9, '#111');
      if (v !== 2) { const s = v === 1 ? 2 : -2; b.line([[-2, 6], [-2 + s, 18]], 0.9, 0.95, INK); b.line([[2, 6], [2 - s, 18]], 0.9, 0.95, INK); }
      else b.brush([[-8, -3, 1], [-18, -10, 3], [-8, -6, 1]], 0.7, SILVER);
    },
  },
  weed: sp(13, (b, v) => {
    const s = v === 1 ? 1 : v === 2 ? 0.4 : -1;
    for (let i = 0; i < 5; i++) {
      const x = -8 + i * 4;
      b.brush([[x, 14, 2.4], [x + 3 * s, 4, 2], [x - 2 * s, -5, 1.6], [x + 2 * s, -14 + i % 2 * 3, 0.4]], 0.92, i % 2 ? '#24372b' : FOREST);
    }
    b.eyes(0, -2, 3.2, 1.8);
  }),
  drowned: sp(14, (b, v) => {
    const d = v === 1 ? 1.5 : 0;
    b.wash(LAKE, [[-9, -6], [-11, 8], [-8, 16], [-3, 12 + d], [1, 17], [5, 12 - d], [9, 16], [11, 7], [9, -6]], 0.7, 1.5);
    b.fill(LAKE, ell(0, -9, 8, 8.5), 0.9, 0.6);
    b.fill('#c9d0d6', ell(1.5, -8, 4.6, 5), 0.8, 0.4);
    for (const x of [-6, 2, 7]) b.brush([[x, 14, 1], [x, 18 + d * 2, 0.3]], 0.6, LAKE);
    b.disc(0, -8.5, 1.2, '#111'); b.disc(3.4, -8.5, 1.2, '#111');
    if (v === 2) b.line(ell(0, 12, 14, 4, 0, Math.PI * 2, 16), 0.7, 0.6, SILVER);
  }),
  // ───────────── 墨林
  rat: sp(10, (b, v) => {
    b.brush([[-8, 3, 1.2], [-15, 4 + (v === 1 ? 2 : -1), 0.9], [-21, 1, 0.3]], 0.85, FOREST);
    b.fill(FOREST, [[-9, 2], [-5, -6], [3, -7], [10, -2], [13, 3], [7, 6], [-6, 7]], 0.95, 0.5);
    b.dot(2, -7, 5, 0.95, FOREST); b.dot(2, -7, 2.5, 0.6, ROUGE);
    b.disc(9, -1.5, 1.3, PAPER); b.dot(13.5, 2.5, 1.8, 0.95, ROUGE);
    for (const y of [1, 3]) b.line([[12, y], [18, y - 1 + (y - 2)]], 0.35, 0.6, FOREST);
    legs(b, 1, 6, 3, 1.2, v, FOREST, 8);
  }, 3, 2),
  foxfire: sp(12, (b, v) => {
    const st = v === 2 ? 1.35 : 1;
    b.fill(CINNABAR, [[12, 0], [6, -9], [-4 * st, -8], [-14 * st, -3 + (v === 1 ? 2 : 0)], [-20 * st, 0], [-12 * st, 5], [-3, 9], [7, 8]], 0.85, 1.2);
    b.fill('#e8a25a', ell(3, 0, 6, 5), 0.8, 0.8);
    b.fill(FOREST, ell(5, 0, 5.5, 4.6), 0.9, 0.4);
    b.fill(FOREST, [[1, -3], [2, -9], [5, -4]], 0.9, 0.2); b.fill(FOREST, [[6, -3.5], [8.5, -9], [9, -3]], 0.9, 0.2);
    b.flat((g) => { g.strokeStyle = '#f7d27a'; g.lineWidth = 1; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(5 + sx * 2.4 - 1.2, -0.5); g.lineTo(5 + sx * 2.4 + 1.2, 0.3); g.stroke(); } });
  }, 3, 2.1),
  imp: sp(15, (b, v) => {
    const up = v === 2;
    b.dry([[-6, -4, 11], [-8, 6, 13], [-6, 14, 9]], 0.9, FOREST, 0.35);
    b.fill(FOREST, blob(-3, 2, 10, 12, 21, 0.12), 0.95, 0.8);
    b.fill(FOREST, ell(5, -8, 6.5, 6), 0.95, 0.5);
    b.dot(9.5, -6.5, 3.4, 0.95, CINNABAR); b.dot(7, -4, 2.4, 0.7, AZ);
    b.disc(6.5, -10, 1.3, PAPER); b.disc(9, -10, 1.1, PAPER);
    b.brush(up ? [[2, -2, 3], [8, -14, 2.4], [6, -22, 1.6]] : [[3, 0, 3], [12, 8, 2.6], [15, 17, 1.4]], 0.95, FOREST);
    if (up) b.dot(6, -23, 6, 0.95, '#57524a');
    b.brush([[-8, 0, 3], [-14, 10, 2.4], [-13, 18, 1.2]], 0.95, FOREST);
    legs(b, -3, 12, 5, 2.4, v, FOREST, 7);
  }),
  umbrella: sp(15, (b, v) => {
    const hop = v === 1 ? -3 : 0, sq = v === 2 ? 0.8 : 1;
    b.fill('#4a2a22', ell(0, -1 + hop, 16, 12 * sq, Math.PI, Math.PI * 2, 16).concat([[16, 1 + hop], [-16, 1 + hop]]), 0.95, 0.3);
    for (const x of [-10, -4, 4, 10]) b.line([[0, -12 * sq + hop], [x * 1.5, 1 + hop]], 0.6, 0.55, '#c9a86a');
    b.line(ell(0, -1 + hop, 16, 12 * sq, Math.PI, Math.PI * 2, 12), 0.8, 0.8, INK);
    b.brush([[0, 1 + hop, 2.2], [0, 13 + hop, 2], [-3, 16 + hop, 1.2]], 0.95, '#6b4a2a');
    b.flat((g) => { g.fillStyle = PAPER; g.beginPath(); g.ellipse(4, -5 + hop, 4.2, 3.4, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(5.2, -5 + hop, 1.8, 0, Math.PI * 2); g.fill(); });
    b.brush([[8, 1 + hop, 2.4], [11, 5 + hop, 1.8], [10, 8 + hop, 0.6]], 0.9, CINNABAR);
  }),
  wolf: sp(15, (b, v) => {
    const howl = v === 2;
    b.dry([[-16, -2, 5], [-22, -6 + (v === 1 ? 3 : 0), 3]], 0.8, FOREST);
    b.fill(FOREST, [[-15, -3], [-6, -7], [6, -6], [11, -3], [9, 4], [-12, 4]], 0.95, 0.5);
    const hx = howl ? 12 : 13, hy = howl ? -14 : -6;
    b.fill(FOREST, [[7, -4], [hx - 3, hy - 2], [hx + 2, hy - 1], [hx + 9, hy + (howl ? -5 : 2)], [hx + 2, hy + 5], [9, 2]], 0.95, 0.4);
    b.fill(FOREST, [[hx - 2, hy - 2], [hx - 2, hy - 9], [hx + 2, hy - 2]], 0.95, 0.2);
    b.disc(hx + 2.5, hy + 0.5, 1.1, '#e9c46a');
    const s = v === 1 ? 3 : 0;
    for (const [x, d] of [[-11, -s], [-6, s], [5, -s], [9, s]] as Pt[]) b.brush([[x, 3, 2.4], [x + d, 10, 1.6], [x + d + 1, 14, 1]], 0.95, FOREST);
  }),
  ghostlamp: sp(13, (b, v) => {
    const heal = v === 2;
    if (heal) b.wash(GOLD, ell(0, -2, 17, 17), 0.35);
    b.wash(FOREST, [[-8, 6], [-4, 18], [0, 12], [3, 19], [6, 10]], 0.5);
    b.fill(heal ? '#e8b64a' : '#b58a3a', ell(0, -2, 10, 11), 0.9, 0.5);
    for (const x of [-5, 0, 5]) b.line([[x, -12], [x * 1.3, -2], [x, 8]], 0.5, 0.6, INK);
    b.fill(INK, [[-5, -14], [5, -14], [5, -11], [-5, -11]], 0.95, 0.2);
    b.eyes(0, -3, 3.4, 2, 0.3, '#fff6d8'); b.brush([[-3, 3, 1], [0, 5, 1.4], [3, 3, 1]], 0.9, INK);
  }),
  spider: sp(12, (b, v) => {
    const s = v === 1 ? 2 : 0;
    for (const k of [-1, 1]) for (let i = 0; i < 4; i++) {
      const bx = -3 + i * 3;
      b.brush([[bx, 0, 1.4], [bx + (i - 1.5) * 5, k * (10 + (i % 2 ? s : -s)), 1.1], [bx + (i - 1.5) * 8, k * 16, 0.4]], 0.9, FOREST);
    }
    b.fill(FOREST, ell(-6, 0, 8, 7), 0.96, 0.6);
    b.fill(FOREST, ell(4, 0, 5, 4.5), 0.96, 0.4);
    b.dot(-7, -1, 3, 0.7, '#8a2a2a');
    b.disc(6.5, -1.5, 1.1, PAPER); b.disc(6.5, 1.5, 1.1, PAPER); b.disc(8, 0, 0.9, PAPER);
    if (v === 2) b.dot(11, 0, 4, 0.8, '#d6d6cf');
  }),
  panda: sp(20, (b, v) => {
    const W = '#f3f0e6';
    if (v === 2) {
      // curled into a rolling ball: white fur, black legs tucked, ears and eye patches on top
      b.fill(W, ell(0, 0, 17, 16), 0.97, 0.5);
      b.brush(arcW(0, 0, 11, 10, 0.2, 2.4, 6, 4, 8), 0.95, INK);
      b.brush(arcW(0, 0, 11, 10, 3.3, 5.2, 6, 4, 8), 0.95, INK);
      b.line(ell(0, 0, 17, 16, 0, Math.PI * 2, 18), 1, 0.9, INK);
      b.dot(6, -11, 5, 0.95, INK); b.dot(12, -6, 4.4, 0.95, INK);
      b.dot(8, -4, 3.4, 0.95, INK); b.disc(8.6, -4.4, 0.9, PAPER);
      for (const [x, y] of [[-20, 6], [-22, -2]] as Pt[]) b.dot(x, y, 3, 0.4, '#a89a80');
      return;
    }
    const s = v === 1 ? 3 : 0;
    for (const [x, d] of [[-10, -s], [-4, s], [6, -s], [11, s]] as Pt[]) b.brush([[x, 4, 5], [x + d, 13, 4.4]], 0.95, INK);
    b.fill(W, ell(0, -1, 16, 10), 0.97, 0.5);
    b.brush([[-6, -9, 5], [4, -9, 5]], 0.9, INK);
    b.fill(W, ell(14, -6, 8, 7), 0.97, 0.4);
    b.dot(11, -12, 5, 0.95, INK); b.dot(17, -12, 4.5, 0.95, INK);
    b.dot(13, -6, 3.6, 0.95, INK); b.dot(18, -6, 3.2, 0.95, INK); b.disc(13.6, -6.4, 0.9, PAPER); b.disc(18.4, -6.4, 0.8, PAPER);
    b.dot(21, -3, 2, 0.95, INK);
    b.line(ell(0, -1, 16, 10, Math.PI * 0.2, Math.PI * 1.2, 10), 0.8, 0.8, INK);
  }),
  stick: sp(13, (b, v) => {
    const c = '#253a26';
    const s = v === 1 ? 2 : 0;
    for (let i = 0; i < 4; i++) b.fill(c, [[-4, -16 + i * 8], [4, -16 + i * 8], [3.6, -9.5 + i * 8], [-3.6, -9.5 + i * 8]], 0.95, 0.3);
    for (let i = 1; i < 4; i++) b.brush([[-5, -16.5 + i * 8, 1.6], [5, -16.5 + i * 8, 1.6]], 0.95, FOREST);
    b.brush([[3, -6, 1.2], [11, -12 + s, 3], [16, -14 + s, 0.4]], 0.85, c); b.brush([[-3, 0, 1.2], [-11, -5 - s, 3], [-16, -6 - s, 0.4]], 0.85, c);
    if (v === 2) { b.brush([[3, 4, 1.2], [13, 2, 3], [18, 0, 0.4]], 0.85, c); b.brush([[-3, 6, 1.2], [-12, 9, 3], [-17, 10, 0.4]], 0.85, c); }
    b.eyes(0, -11, 2.3, 1.6); legs(b, 0, 16, 4, 1.6, v, c, 5);
  }),
  toadstool: sp(13, (b, v) => {
    const sq = v === 1 ? 1.08 : 1;
    b.fill('#e3dccb', [[-5, -1], [5, -1], [6, 12], [-6, 12]], 0.9, 0.4);
    b.line([[-6, 12], [-5, -1]], 0.7, 0.8, INK); b.line([[6, 12], [5, -1]], 0.7, 0.8, INK);
    b.fill('#7a2f28', ell(0, -1, 15 * sq, 11 / sq, Math.PI, Math.PI * 2, 16).concat([[15 * sq, 1], [-15 * sq, 1]]), 0.95, 0.4);
    for (const [x, y, d] of [[-7, -6, 4], [2, -9, 3.6], [8, -4, 3], [-1, -3, 2.4]] as [number, number, number][]) b.disc(x, y, d / 2, '#efe7d6');
    b.disc(-2, 5, 1.2, '#111'); b.disc(2, 5, 1.2, '#111');
    if (v === 2) b.wash('#8a9a6a', ell(0, 0, 18, 16), 0.3);
  }),
  woodghost: sp(15, (b, v) => {
    const up = v === 2;
    b.wash(FOREST, [[-9, -4], [-12, 10], [-8, 17], [-2, 13], [3, 18], [8, 12], [9, -2]], 0.75, 1.5);
    b.fill(FOREST, [[-9, -2], [-4, -14], [4, -15], [9, -4], [6, 2], [-7, 2]], 0.95, 0.4);
    b.fill('#c9cfc6', ell(3, -7, 3.6, 4.2), 0.7, 0.3);
    b.disc(2.4, -7.5, 0.9, '#111'); b.disc(4.6, -7.5, 0.9, '#111');
    const ax = up ? [[2, -2, 1.8], [8, -16, 1.6]] : [[-4, 0, 1.8], [-14, -12, 1.6]];
    b.brush(ax as [number, number, number][], 0.95, '#6b4a2a');
    const [hx, hy] = ax[1] as number[];
    b.fill('#8f9aa0', [[hx, hy], [hx + 6, hy - 4], [hx + 7, hy + 3]], 0.95, 0.2);
  }),
  // ───────────── 广寒
  shadowhare: sp(12, (b, v) => {
    const hop = v === 1;
    b.wash(PALACE, ell(-2, hop ? -2 : 2, 11, 8), 0.8, 1.2);
    b.fill(PALACE, ell(-2, hop ? -2 : 2, 9, 7), 0.9, 0.6);
    b.fill(PALACE, ell(7, hop ? -8 : -4, 5.5, 5), 0.92, 0.4);
    b.brush([[6, hop ? -12 : -8, 2.6], [4, hop ? -20 : -16, 2], [1, hop ? -24 : -21, 0.6]], 0.92, PALACE);
    b.brush([[8, hop ? -12 : -8, 2.4], [9, hop ? -20 : -17, 1.8], [8, hop ? -24 : -21, 0.5]], 0.92, PALACE);
    b.disc(9.5, hop ? -8.5 : -4.5, 1.1, '#b9c8da');
    b.brush(hop ? [[-6, 3, 3], [-14, 8, 1]] : [[-6, 7, 3], [-2, 10, 2.4]], 0.9, PALACE);
    if (v === 2) b.line(ell(0, 10, 13, 3.5, 0, Math.PI * 2, 14), 0.7, 0.6, SILVER);
  }, 3, 1.65),
  crow: sp(12, (b, v) => {
    const up = v === 1 ? -6 : 0;
    b.brush([[-2, 0, 3], [-8, -8 + up, 5], [-15, -14 + up, 3], [-20, -12 + up, 0.6]], 0.95, INK);
    b.brush([[-2, 0, 3], [-8, 8 - up, 5], [-15, 14 - up, 3], [-20, 12 - up, 0.6]], 0.95, INK);
    b.fill(INK, ell(0, 0, 9, 4.5), 0.97, 0.4);
    b.fill(INK, [[-8, -2], [-15, -4], [-14, 4], [-8, 2]], 0.95, 0.3);
    b.fill(INK, ell(8, 0, 4, 3.4), 0.97, 0.3);
    b.fill('#3a3a3a', [[11, -1.2], [16, 0], [11, 1.2]], 0.95, 0.2);
    b.disc(9, -1.2, 0.9, '#e9c46a');
    if (v === 2) b.fill(DANGER, [[11, -1.2], [16, 0], [11, 1.2]], 0.9, 0.2);
  }),
  soldier: sp(16, (b, v) => {
    const s = v === 1 ? 2 : 0;
    legs(b, -2, 10, 7, 2.6, v, PALACE, 6);
    b.fill('#3e4a5e', [[-8, -6], [6, -6], [8, 11], [-9, 11]], 0.95, 0.4);
    for (let y = -3; y < 10; y += 3) b.line([[-8, y], [7, y]], 0.4, 0.45, SILVER);
    b.fill('#e8d8c0', ell(0, -11, 5, 5), 0.9, 0.3);
    b.fill('#3e4a5e', ell(0, -13, 6, 4, Math.PI, Math.PI * 2, 10).concat([[6, -12], [-6, -12]]), 0.95, 0.3);
    b.brush([[0, -17, 1.6], [-3, -22, 2.4], [-7, -21 - s, 0.6]], 0.9, CINNABAR);
    b.disc(2.2, -11, 0.9, '#111');
    b.fill('#556478', [[9, -12], [16, -10], [16, 12], [9, 14]], 0.97, 0.3);
    b.dot(12.5, 1, 5, 0.95, GOLD);
    b.line([[9, -12], [16, -10], [16, 12], [9, 14], [9, -12]], 0.7, 0.9, INK);
    if (v === 2) b.brush([[4, -2, 1.4], [26, -4, 1.2]], 0.95, '#6b4a2a');
  }),
  frost: {
    box: [-18, -18, 18, 18], n: 3, halo: 'dark',
    paint(b, v) {
      const r = v === 2 ? 1.2 : 1;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + v * 0.3;
        const pts = rot([[0, -3], [14 * r, 0], [0, 3]], a);
        b.fill(i % 2 ? '#bcd6e6' : '#9cc0d8', pts, 0.9, 0.2);
      }
      b.fill('#e9f3f8', star(0, 0, 8, 4, 6), 0.95, 0.3);
      b.fill(PALACE, ell(0, 0, 4.5, 4.5), 0.9, 0.3);
      b.disc(-1.4, -0.5, 1, '#e9f3f8'); b.disc(1.4, -0.5, 1, '#e9f3f8');
      if (v === 2) b.ring(0, 0, 13, 1.2, AZ, 0.9);
    },
  },
  guihua: sp(12, (b, v) => {
    const a0 = v * 0.2;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i / 4) * Math.PI * 2;
      b.fill(GOLD, rot(ell(8, 0, 7, 5.5, 0, Math.PI * 2, 12), a), 0.92, 0.5);
    }
    b.fill('#a8703a', ell(0, 0, 5.5, 5.5), 0.95, 0.4);
    b.eyes(0, -0.5, 2.2, 1.4);
    b.brush([[0, 6, 1.2], [-3, 13, 0.8]], 0.8, '#3e5a3a');
    if (v === 2) b.ring(0, 0, 15, 1, DANGER, 0.8);
  }),
  toad: sp(16, (b, v) => {
    const gold = '#b88a2a';
    b.fill(PALACE, ell(0, 2, 16, 11), 0.96, 0.5);
    for (const [x, y] of [[-8, -2], [-2, 4], [4, -3], [-6, 7], [7, 5], [0, -5]] as Pt[]) b.dot(x, y, 3.4, 0.9, gold);
    b.brush([[-12, 8, 4], [-18, 14, 3]], 0.95, PALACE); b.brush([[6, 10, 4], [10, 15, 3]], 0.95, PALACE); b.brush([[-2, 11, 4], [-1, 16, 3]], 0.95, PALACE);
    b.fill(PALACE, ell(12, -4, 8, 6.5), 0.96, 0.4);
    b.dot(10, -10, 5, 0.95, PALACE); b.dot(16, -10, 4.5, 0.95, PALACE);
    b.disc(10.4, -10.5, 1.6, '#f0d060'); b.disc(16.2, -10.5, 1.4, '#f0d060'); b.disc(10.6, -10.3, 0.7, '#111'); b.disc(16.4, -10.3, 0.6, '#111');
    b.line([[13, -1], [20, -2]], 0.8, 0.8, gold);
    if (v === 2) b.brush([[19, -2, 3], [28, -1, 2.4]], 0.9, ROUGE);
  }),
  star: sp(14, (b, v) => {
    legs(b, 0, 10, 5, 2.2, v, PALACE, 5);
    b.fill('#2c3650', [[-9, -4], [9, -4], [12, 12], [-12, 12]], 0.95, 0.4);
    b.brush([[-9, -4, 3], [-13, 6, 2.6]], 0.9, '#2c3650'); b.brush([[9, -4, 3], [14, 3, 2.4]], 0.9, '#2c3650');
    b.fill('#e3d6bf', ell(0, -9, 5, 5.5), 0.9, 0.3);
    b.fill('#2c3650', [[-7, -13], [7, -13], [5, -16], [-5, -16]], 0.95, 0.2);
    b.fill(v === 2 ? '#fff4c0' : '#e9d58a', star(0, -20, 5, 2.2, 5), 0.95, 0.2);
    b.fill('#d9d2c0', [[13, 0], [16, -9], [18, -8], [15, 1]], 0.95, 0.2);
    b.disc(-1.8, -9, 0.9, '#111'); b.disc(1.8, -9, 0.9, '#111');
  }),
  clerk: sp(12, (b, v) => {
    legs(b, 0, 7, 5, 2, v, PALACE, 5);
    b.fill('#34425c', [[-6, -3], [6, -3], [8, 8], [-8, 8]], 0.95, 0.4);
    b.fill('#7a2f28', ell(-8, 0, 6, 6), 0.95, 0.3);
    b.line(ell(-8, 0, 6, 6, 0, Math.PI * 2, 12), 0.7, 0.9, GOLD);
    b.fill('#e3d6bf', ell(1, -8, 4.6, 4.8), 0.9, 0.3);
    b.fill('#34425c', [[-4, -12], [6, -12], [5, -15], [-3, -15]], 0.95, 0.2);
    b.disc(2.6, -8, 0.8, '#111');
    const up = v === 2;
    b.brush(up ? [[4, -3, 1.4], [9, -16, 1.2]] : [[4, -3, 1.4], [12, -6, 1.2]], 0.95, '#6b4a2a');
    b.fill('#8f9aa0', up ? ell(9, -17, 3, 2) : ell(13, -6.5, 2, 3), 0.95, 0.2);
    if (up) b.brush([[14, -20, 1], [11, -14, 1.4], [15, -12, 1], [12, -6, 0.3]], 0.9, GOLD);
  }),
  dancer: sp(14, (b, v) => {
    const spin = v === 2 ? 1 : 0, s = v === 1 ? 1 : -1;
    b.brush([[-3, -4, 2], [-12, 0 + s * 3, 4], [-20, 6 + s * 5, 3], [-24, 14, 0.8]], 0.75, '#a8c4d8');
    b.brush([[3, -4, 2], [12, -8 - s * 3 - spin * 6, 4], [20, -4 - spin * 8, 3], [24, 6, 0.8]], 0.75, '#e7a3b3');
    b.fill(PALACE, [[-5, -4], [5, -4], [10, 14], [-10, 14]], 0.95, 0.5);
    b.line([[-7, 8], [7, 8]], 0.5, 0.45, '#e7a3b3');
    b.fill('#f1e0cf', ell(0, -9, 4.4, 4.8), 0.92, 0.3);
    b.fill(PALACE, ell(0, -13, 5, 3.2), 0.95, 0.2);
    b.dot(3, -15, 2.4, 0.9, '#e7a3b3');
    b.disc(-1.4, -9, 0.8, '#111'); b.disc(1.6, -9, 0.8, '#111');
    if (spin) b.line(ell(0, 4, 19, 6, 0, Math.PI * 2, 18), 0.7, 0.7, SILVER);
  }),
  axeshade: sp(17, (b, v) => {
    b.wash(PALACE, [[-10, -5], [-13, 12], [-8, 19], [-2, 14], [3, 20], [9, 13], [11, -3]], 0.75, 1.5);
    b.fill(PALACE, [[-10, -2], [-5, -16], [5, -17], [11, -4], [8, 4], [-8, 4]], 0.95, 0.4);
    b.fill('#c9cfd6', ell(3, -8, 4, 4.4), 0.7, 0.3);
    b.disc(2.4, -8.5, 0.9, v === 2 ? DANGER : '#111'); b.disc(4.8, -8.5, 0.9, v === 2 ? DANGER : '#111');
    b.brush([[-8, 2, 3], [-15, 9 + (v === 1 ? 2 : 0), 2]], 0.9, PALACE); b.brush([[8, 2, 3], [15, 9 - (v === 1 ? 2 : 0), 2]], 0.9, PALACE);
  }),
  skypup: sp(11, (b, v) => {
    const cr = v === 2 ? 3 : 0;
    b.wash('#0d1020', ell(0, 1, 14, 11), 0.22, 3);
    b.brush([[-10, -2 + cr, 1.6], [-16, -8 + cr, 1]], 0.9, INK);
    b.fill(INK, ell(-2, 1 + cr, 10, 6 - cr * 0.3), 0.97, 0.4);
    b.fill(INK, ell(8, -3 + cr, 6, 5), 0.97, 0.4);
    b.fill(INK, [[5, -6 + cr], [6, -13 + cr], [9, -7 + cr]], 0.95, 0.2);
    b.fill(INK, [[12, -4 + cr], [17, -2 + cr], [12, 0 + cr]], 0.95, 0.2);
    b.disc(9.5, -4 + cr, 1.2, '#f0d060');
    const s = v === 1 ? 2 : 0;
    for (const [x, d] of [[-8, -s], [-4, s], [3, -s], [6, s]] as Pt[]) b.brush([[x, 5 + cr, 1.8], [x + d, 11, 1.2]], 0.95, INK);
  }),
  // ───────────── elites (gold seal)
  turtle: sp(30, (b, v) => {
    const shell = v === 2;
    if (!shell) {
      const s = v === 1 ? 4 : 0;
      for (const [x, y, d] of [[16, -18, s], [16, 18, -s], [-16, -18, -s], [-16, 18, s]] as [number, number, number][]) b.fill(LAKE, rot(ell(0, 0, 10, 5), (y > 0 ? 0.6 : -0.6) + d * 0.05).map(([px, py]) => [px + x + d, py + y] as Pt), 0.95, 0.4);
      b.fill(LAKE, ell(31, 0, 9, 7), 0.95, 0.4); b.disc(35, -3, 1.6, PAPER);
    }
    b.fill('#2a3a3e', ell(0, 0, 25, 21), 0.97, 0.5);
    for (const [x, y] of [[0, 0], [-12, -9], [12, -9], [-12, 9], [12, 9], [0, -15], [0, 15]] as Pt[]) b.line(star(x, y, 6.5, 6.5, 3, 0).concat([[x + 6.5, y]]), 0.8, 0.6, '#9ab0a6');
    b.line(ell(0, 0, 25, 21, 0, Math.PI * 2, 24), 1.2, 0.9, INK);
    seal(b, -4, -2, 6);
  }, 3, 1.45),
  whitesnake: {
    box: [-40, -26, 40, 26], n: 3, halo: 'dark',
    paint(b, v) {
      const W = '#f4f2ea';
      const ph = v * 0.9;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([-36 + t * 62, Math.sin(t * Math.PI * 2 + ph) * 12, 3 + 7 * Math.sin(t * Math.PI * 0.95 + 0.1)]); }
      b.brush(pts, 0.97, W);
      b.line(pts.map(([x, y, w]) => [x, y - w / 2] as Pt), 0.7, 0.85, INK);
      b.line(pts.map(([x, y, w]) => [x, y + w / 2] as Pt), 0.7, 0.6, INK);
      const [hx, hy] = pts[12];
      b.fill(W, ell(hx + 6, hy, 8, 5.5), 0.97, 0.4);
      b.line(ell(hx + 6, hy, 8, 5.5, -2.2, 2.2, 10), 0.8, 0.9, INK);
      b.disc(hx + 9, hy - 2, 1.4, CINNABAR);
      b.brush([[hx + 13, hy, 0.6], [hx + 19, hy + (v === 2 ? -3 : 1), 0.8]], 0.9, CINNABAR);
      seal(b, hx - 4, hy - 9, 6);
    },
  },
  tiger: sp(28, (b, v) => {
    const roar = v === 2;
    const s = v === 1 ? 5 : 0;
    b.brush([[-24, -4, 4], [-32, -14, 3], [-30, -24, 1]], 0.9, INK);
    for (const [x, d] of [[-18, -s], [-10, s], [10, -s], [18, s]] as Pt[]) b.brush([[x, 6, 7], [x + d, 18, 6], [x + d + 2, 24, 5]], 0.95, INK);
    b.fill('#d9b98a', [[-24, -8], [-8, -14], [12, -12], [22, -6], [20, 8], [-22, 8]], 0.95, 0.5);
    for (let x = -20; x < 18; x += 6) b.brush([[x, -13, 3], [x - 2, -4, 2], [x + 1, 4, 0.5]], 0.9, INK);
    const hx = 26, hy = roar ? -14 : -8;
    b.fill('#d9b98a', ell(hx, hy, 11, 10), 0.95, 0.4);
    b.dot(hx - 6, hy - 9, 6, 0.95, INK); b.dot(hx + 5, hy - 9, 6, 0.95, INK);
    b.brush([[hx - 3, hy - 6, 1.4], [hx + 3, hy - 6, 1.4]], 0.9, INK); b.brush([[hx, hy - 8, 1.2], [hx, hy - 3, 1.2]], 0.9, INK); b.brush([[hx - 3, hy - 3, 1.4], [hx + 3, hy - 3, 1.4]], 0.9, INK);
    b.disc(hx - 3.5, hy, 1.8, '#e9c46a'); b.disc(hx + 4.5, hy, 1.8, '#e9c46a');
    if (roar) b.fill(CINNABAR, ell(hx + 4, hy + 6, 5, 3.4), 0.9, 0.3);
    b.line(ell(0, -3, 24, 12, Math.PI, Math.PI * 2, 12), 1, 0.9, INK);
    seal(b, -6, -16, 7);
  }, 3, 1.3),
  painted: sp(16, (b, v) => {
    const slash = v === 2;
    b.fill('#e6dfcf', [[-12, -8], [-3, -14], [-9, 4], [-14, 12]], 0.6, 0.5);
    b.line([[-12, -8], [-3, -14], [-9, 4], [-14, 12]], 0.5, 0.5, INK);
    b.fill('#2c3a2c', [[-7, -4], [7, -4], [10, 14], [-9, 14]], 0.96, 0.4);
    b.fill('#5f8a6e', ell(0, -10, 6, 6.5), 0.95, 0.4);
    b.brush([[-6, -15, 2.4], [-2, -18, 3], [4, -17, 2], [8, -12, 1]], 0.95, INK);
    b.disc(-1.5, -10, 1.3, DANGER); b.disc(2.5, -10, 1.3, DANGER);
    b.brush([[-2, -6, 0.8], [0, -5, 1], [3, -6, 0.8]], 0.9, PAPER);
    const cl: [number, number, number][] = slash ? [[6, -2, 3], [14, -10, 2], [22, -14, 1]] : [[6, -2, 3], [12, 4, 2], [17, 9, 1]];
    b.brush(cl, 0.95, '#2c3a2c');
    for (let i = 0; i < 3; i++) b.line([[cl[2][0] + i, cl[2][1] + i * 1.5 - 1], [cl[2][0] + 5 + i, cl[2][1] + i * 1.5 - (slash ? 4 : -3)]], 0.5, 0.95, '#e6dfcf');
    legs(b, 0, 14, 4, 2.4, v, INK, 6);
    seal(b, -9, -18, 5.5);
  }, 3, 1.55),
  general: sp(24, (b, v) => {
    const thrust = v === 2;
    legs(b, -3, 14, 9, 3.6, v, PALACE, 9);
    b.brush([[-4, -6, 2], thrust ? [40, -6, 1.6] : [8, -30, 1.6]], 0.95, '#6b4a2a');
    b.fill(SILVER, thrust ? [[40, -9], [48, -6], [40, -3]] : [[5, -32], [8, -40], [11, -32]], 0.95, 0.2);
    b.fill('#3e4a5e', [[-12, -10], [9, -10], [12, 16], [-13, 16]], 0.96, 0.4);
    for (let y = -6; y < 16; y += 4) b.line([[-12, y], [11, y]], 0.5, 0.5, GOLD);
    b.fill('#e8d8c0', ell(-1, -16, 6.5, 6.5), 0.9, 0.3);
    b.fill('#c9a646', ell(-1, -19, 8, 5, Math.PI, Math.PI * 2, 10).concat([[7, -18], [-9, -18]]), 0.95, 0.3);
    b.brush([[-1, -24, 1.6], [-5, -31, 3], [-11, -30, 0.6]], 0.9, CINNABAR);
    b.disc(1.8, -16, 1.1, '#111');
    b.fill('#556478', [[13, -18], [24, -15], [24, 18], [13, 21]], 0.97, 0.3);
    b.fill(GOLD, ell(18.5, 1, 4.5, 6), 0.9, 0.3);
    b.line([[13, -18], [24, -15], [24, 18], [13, 21], [13, -18]], 0.9, 0.9, INK);
    seal(b, -8, -2, 6);
  }, 3, 1.7),
  hound: sp(22, (b, v) => {
    const dash = v === 2, s = v === 1 ? 4 : 0;
    b.dry([[-20, -4, 6], [-30, -10 + s, 4], [-34, -6, 1]], 0.85, INK);
    for (const [x, d] of [[-14, -s], [-7, s], [8, -s], [14, s]] as Pt[]) b.brush([[x, 4, 4], [x + d + (dash ? -4 : 0), 14, 3], [x + d + (dash ? -6 : 1), 20, 2]], 0.95, INK);
    b.fill('#232733', [[-20, -6], [-6, -10], [10, -9], [18, -4], [16, 6], [-18, 6]], 0.97, 0.5);
    b.brush([[4, -10, 4], [12, -12, 5], [18, -8, 4]], 0.8, '#e8e2d2');
    const hx = 22, hy = dash ? -6 : -10;
    b.fill('#232733', [[14, hy + 2], [hx - 2, hy - 5], [hx + 12, hy], [hx + 4, hy + 6], [15, hy + 8]], 0.97, 0.4);
    b.fill('#232733', [[hx - 3, hy - 3], [hx - 1, hy - 12], [hx + 3, hy - 4]], 0.95, 0.2);
    b.disc(hx + 3, hy - 0.5, 1.6, '#f0d060');
    b.brush([[10, -6, 1.6], [14, -2, 1.6], [18, -4, 1.6]], 0.95, GOLD);
    seal(b, -6, -14, 6);
  }, 3, 1.55),
  // ───────────── treasures
  pixiu: sp(16, (b, v) => {
    const g = '#c79a3a', s = v === 1 ? 3 : 0;
    for (const [x, d] of [[-9, -s], [-3, s], [5, -s], [10, s]] as Pt[]) b.brush([[x, 6, 4], [x + d, 14, 3.4]], 0.95, '#7d5a22');
    b.fill(g, ell(0, 0, 15, 10), 0.95, 0.5);
    b.brush([[-4, -6, 2], [-10, -16 + s, 5], [-2, -12, 2]], 0.8, '#e9c46a');
    b.fill(g, ell(13, -6, 8, 7), 0.95, 0.4);
    b.brush([[14, -12, 2], [18, -19, 0.6]], 0.95, '#7d5a22');
    b.disc(16, -7, 1.6, '#111'); b.fill(ROUGE, ell(19, -2, 2.6, 1.6), 0.8, 0.2);
    b.brush([[-14, -2, 3], [-20, -8, 2], [-22, -4, 0.6]], 0.9, '#7d5a22');
    for (const [x, y] of [[-6, -2], [0, 3], [5, -3]] as Pt[]) b.line(ell(x, y, 2.2, 1.6, Math.PI, Math.PI * 2, 5), 0.5, 0.7, '#7d5a22');
  }, 3, 1.5),
  mirrorflower: {
    box: [-18, -18, 18, 18], n: 3, halo: 'dark',
    paint(b, v) {
      for (let i = 0; i < 8; i++) b.fill(i % 2 ? '#f0cf6a' : GOLD, rot(ell(9, 0, 8, 4, 0, Math.PI * 2, 12), (i / 8) * Math.PI * 2 + v * 0.25), 0.9, 0.5);
      b.fill('#fdf6dc', ell(0, 0, 5.5, 5.5), 0.97, 0.3);
      b.ring(0, 0, 5.5, 1, '#b5812a', 0.9);
      b.disc(-1.5, -1.5, 1.4, '#ffffff');
    },
  },
};

export type MonSpecId = keyof typeof MON_SPECS;
