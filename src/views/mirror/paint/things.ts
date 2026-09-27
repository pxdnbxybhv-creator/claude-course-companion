// Pickups (10) and effects (43). Only real money is round with a square hole and golden (铜钱, 串钱,
// 当十); 月华 is moon-white with a silver glint; the gold 月华 shard is a shard, never a coin.
// Zone effects (washes, nets, puddles, rings) are painted on a ±32 u disc: drawZone scales them to r.
import type { DropKind, FxName } from '../ids';
import { B, blob, ell, arcW, rot, rotW, spine, star, h01, type Pt, type Spec } from './kit';
import { CINNABAR, CLASS_WASH, DANGER, GOLD, INK, JADE, MOON, PAPER, SILVER } from './palette';

const COIN = '#d4a23a', COIN_D = '#8a5a12', COIN_L = '#f6d77a';

function coin(b: B, r: number, squash: number, glint: boolean, label?: string, x = 0, y = 0) {
  const rx = r * squash;
  b.flat((g) => {
    g.translate(x, y);
    g.fillStyle = COIN_D; g.beginPath(); g.ellipse(0.6, 0.8, rx, r, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = COIN; g.beginPath(); g.ellipse(0, 0, rx, r, 0, 0, Math.PI * 2); g.fill();
    if (squash > 0.25) {
      g.strokeStyle = COIN_D; g.lineWidth = r * 0.1; g.beginPath(); g.ellipse(0, 0, rx * 0.8, r * 0.8, 0, 0, Math.PI * 2); g.stroke();
      const h = r * 0.26;
      g.fillStyle = '#3a2408'; g.fillRect(-h * squash, -h, h * 2 * squash, h * 2);
      if (label && squash > 0.8) {
        g.fillStyle = COIN_D; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${r * 0.5}px 'Ma Shan Zheng','LXGW WenKai',serif`;
        g.fillText(label[0], 0, -r * 0.52); g.fillText(label[1], 0, r * 0.54);
      }
    } else { g.fillStyle = COIN_L; g.fillRect(-rx * 0.4, -r * 0.8, rx * 0.8, r * 1.6); }
    if (glint) { g.fillStyle = '#fffbe6'; g.beginPath(); g.moveTo(-rx * 0.5, -r * 0.55); g.lineTo(-rx * 0.35, -r * 0.2); g.lineTo(-rx * 0.1, -r * 0.5); g.closePath(); g.fill(); g.fillRect(-rx * 0.62, -r * 0.62, r * 0.18, r * 0.18); }
  });
}

const d = (r: number, paint: (b: B, v: number) => void, n = 1, halo: Spec['halo'] = 'dark'): Spec => ({ box: [-r, -r, r, r], n, halo, paint });

export const DROP_SPECS: Record<DropKind, Spec> = {
  moonDrop: d(6, (b) => { b.fill(MOON, [[-4, 0], [-1, -5], [4, -1], [1, 5]], 0.97, 0.3); b.line([[-4, 0], [-1, -5], [4, -1], [1, 5], [-4, 0]], 0.4, 0.5, '#6f8ea6'); b.disc(-0.6, -1.8, 0.9, '#ffffff'); b.line([[-1, -5], [1, 5]], 0.3, 0.35, SILVER); }),
  moonThick: d(9, (b) => { b.disc(0, 0, 7.4, '#c9d3dc'); b.disc(0, 0, 6.4, MOON); b.disc(-2, -2.2, 1.8, '#ffffff'); b.ring(0, 0, 6.8, 0.5, '#6f8ea6', 0.7); }),
  goldShard: d(6, (b) => { b.fill('#e9c46a', [[-4, 0], [-1, -5.4], [4, -1], [1, 5]], 0.97, 0.3); b.line([[-4, 0], [-1, -5.4], [4, -1], [1, 5], [-4, 0]], 0.4, 0.6, '#8a5a12'); b.disc(-0.6, -2, 0.9, '#fff6d0'); }),
  carpGold: d(10, (b, v) => { const f = v ? -0.35 : 0.35; b.fill('#e3a83a', rot([[-8, 0], [-2, -4], [5, -3], [8, 0], [5, 3], [-2, 4]], f), 0.95, 0.3); b.fill('#e3a83a', rot([[-7, 0], [-11, -4], [-10, 0], [-11, 4]], f), 0.9, 0.3); b.disc(Math.cos(f) * 5, Math.sin(f) * 5 - 0.8, 0.8, '#111'); b.line(rot([[-3, -2], [-3, 2]], f), 0.3, 0.6, '#8a5a12'); }, 2),
  crateBox: d(11, (b) => { b.fill('#6a1f1c', [[-9, -5], [9, -5], [9, 7], [-9, 7]], 0.97, 0.3); b.fill('#8e2b2b', [[-10, -9], [10, -9], [9, -5], [-9, -5]], 0.97, 0.3); b.line([[-9, -5], [9, -5]], 0.6, 0.8, GOLD); b.fill(GOLD, [[-2, -6], [2, -6], [2, -1], [-2, -1]], 0.97, 0.2); b.disc(0, 2.5, 2.4, '#e9e4d4'); }, 1, 'paper'),
  lotusSeed: d(6, (b) => { b.fill('#6f9f64', ell(0, 0, 4.4, 5), 0.95, 0.3); b.line(ell(0, 0, 4.4, 5, 0, Math.PI * 2, 12), 0.4, 0.7, '#2f5a36'); b.disc(-1, -1.6, 1, '#d8ecd0'); b.brush([[0, -5, 0.6], [1, -7, 0.4]], 0.9, '#2f5a36'); }),
  heartDrop: d(12, (b) => { b.disc(0, 0, 11, MOON, 0.35); b.disc(0, 0, 8.4, '#b0875a'); b.disc(0, 0, 6.6, '#f6f7fb'); b.brush(arcW(0, 0, 4, 4, Math.PI * 0.9, Math.PI * 2.1, 1.2, 1.2, 10), 0.9, CINNABAR); b.disc(-2, -2.4, 1.6, '#ffffff'); }),
  cashCoin: d(7, (b, v) => { const sq = [1, 0.62, 0.16, 0.62][v]; coin(b, 5.6, sq, v === 0); }, 4, 'dark'),
  cashString: d(14, (b, v) => {
    const sw = v ? 0.3 : -0.3;
    b.line(rot([[0, -13], [0, 12]], sw), 0.6, 0.9, '#8e2b3a');
    for (let i = 0; i < 4; i++) { const [x, y] = rot([[0, -9 + i * 6.4]], sw)[0]; coin(b, 3.1, 1 - (i % 2) * 0.25, i === 0, undefined, x, y); }
    b.brush(rotW([[0, 11, 1.4], [-2, 14, 1], [1, 15, 0.4]], sw), 0.9, '#8e2b3a');
  }, 2, 'dark'),
  cashTen: d(10, (b) => { coin(b, 9, 1, true, '当十'); b.ring(0, 0, 9.4, 0.5, COIN_L, 0.9); }, 1, 'dark'),
};

// ───────────────────────────────────────────── effects

const Z = 32;
/** Zone looks are drawn at r / 32 of their size (up to 11×): the painter bakes them at a fixed pixel
 *  size (paint/index.ts ZONE_K) whatever the sprite scale. */
const ZONES = new WeakSet<Spec>();
export const isZone = (s: Spec): boolean => ZONES.has(s);
const zone = (paint: (b: B, v: number) => void, n = 1): Spec => { const s: Spec = { box: [-Z - 2, -Z - 2, Z + 2, Z + 2], n, halo: 'none', paint }; ZONES.add(s); return s; };
const fx = (r: number, paint: (b: B, v: number) => void, n = 1, halo: Spec['halo'] = 'none'): Spec => ({ box: [-r, -r, r, r], n, halo, paint });
const ringOf = (b: B, r: number, w: number, c: string, tone: number, n = 28) => b.brush(arcW(0, 0, r, r, 0, Math.PI * 2, w, w, n), tone, c);

export const FX_SPECS: Record<FxName, Spec> = {
  hitSpark: fx(10, (b) => { for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.3; b.brush(rotW([[2, 0, 1.8], [9, 0, 0.3]], a), 0.9, INK); } b.dot(0, 0, 3, 0.9, INK); }),
  // the player's crit (侠客's 一剑光寒): a gold star-burst with a white heart — never the enemy's vermilion
  critSpark: fx(14, (b) => { b.disc(0, 0, 9, '#f6d77a', 0.28); b.fill(GOLD, star(0, 0, 13, 3.4, 6), 0.92, 0.4); b.fill('#fff8e6', star(0, 0, 7, 1.8, 6), 0.97, 0.2); b.disc(0, 0, 1.8, '#ffffff'); }),
  inkBurst: fx(20, (b, v) => { b.wash(INK, blob(0, 0, 14, 13, 3 + v * 7, 0.25), 0.7, 3); for (let i = 0; i < 7; i++) { const a = h01(v + 1, i) * Math.PI * 2, r = 14 + h01(v + 5, i) * 5; b.dot(Math.cos(a) * r, Math.sin(a) * r, 2 + h01(v + 9, i) * 3, 0.85, INK); } }, 2),
  splat: fx(20, (b, v) => { b.wash(INK, blob(0, 0, 13, 11, 11 + v * 13, 0.3), 0.5, 3); b.wash(INK, blob(2, -1, 7, 6, 17 + v * 5, 0.25), 0.35, 2); for (let i = 0; i < 5; i++) { const a = h01(v + 21, i) * Math.PI * 2, r = 13 + h01(v + 31, i) * 6; b.dot(Math.cos(a) * r, Math.sin(a) * r, 1.4 + h01(v + 41, i) * 2.4, 0.6, INK); } }, 3),
  spawnBloom: zone((b) => { b.wash(INK, blob(0, 0, 26, 25, 5, 0.12), 0.35, 5); ringOf(b, 26, 1.6, INK, 0.45); }),
  slashArc: fx(34, (b) => { b.wash(CLASS_WASH.sword, [...ell(0, 0, 32, 32, -1.05, 1.05, 14), ...ell(-6, 0, 24, 26, 1.0, -1.0, 12)], 0.55, 2); b.dry(arcW(0, 0, 30, 30, -0.95, 0.95, 3, 1, 12), 0.55, '#dfeaf0'); }),
  pulseRing: zone((b) => { ringOf(b, 29, 3.4, CLASS_WASH.music, 0.55); ringOf(b, 29, 1, '#e9f4e6', 0.8); }),
  beamRay: { box: [0, -8, 64, 8], n: 1, halo: 'none', paint: (b) => { b.flat((g) => { g.fillStyle = 'rgba(232,238,242,0.45)'; g.fillRect(0, -7, 64, 14); g.fillStyle = 'rgba(246,247,251,0.85)'; g.fillRect(0, -3.6, 64, 7.2); g.fillStyle = '#ffffff'; g.fillRect(0, -1.4, 64, 2.8); }); } },
  boltChain: { box: [0, -8, 32, 8], n: 2, halo: 'none', paint: (b, v) => {
    const pts: Pt[] = [[0, 0]];
    for (let i = 1; i < 6; i++) pts.push([i * 6.4, (h01(v + 3, i) - 0.5) * 11]);
    pts.push([32, 0]);
    b.flat((g) => {
      g.lineJoin = 'miter'; g.miterLimit = 2; g.lineCap = 'round';
      for (const [w, c] of [[4.4, 'rgba(217,166,46,0.35)'], [1.8, '#f6e27a'], [0.7, '#ffffff']] as [number, string][]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.stroke();
      }
    }, [-2.4, -10.2, 34.4, 10.2]);
  } },
  lightningStrike: fx(30, (b) => { ringOf(b, 20, 2, GOLD, 0.7); b.brush([[2, -30, 2.4], [-3, -18, 2], [4, -10, 2.2], [-2, 0, 1.2]], 0.95, '#f6e27a'); b.brush([[2, -30, 5], [-3, -18, 4], [4, -10, 4], [-2, 0, 2]], 0.3, GOLD); }),
  burnMark: fx(8, (b) => { b.fill('#e0683a', [[-5, 5], [-4, -1], [-1, -3], [0, -8], [2, -2], [5, 0], [4, 5]], 0.85, 0.6); b.fill('#f6d27a', [[-2, 4], [0, -2], [2, 4]], 0.9, 0.3); }),
  bleedMark: fx(7, (b) => { for (const [x, y, r] of [[-2, -2, 2], [2, 1, 1.6], [-1, 4, 1.3]] as [number, number, number][]) b.fill('#7a1f22', [[x, y - r * 1.8], [x + r, y], [x, y + r], [x - r, y]], 0.9, 0.3); }),
  stunMark: fx(10, (b) => { for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.fill(GOLD, star(Math.cos(a) * 6, Math.sin(a) * 2.6, 3, 1.2, 5), 0.95, 0.2); } b.line(ell(0, 0, 7, 3, 0, Math.PI * 2, 14), 0.4, 0.5, INK); }),
  charmMark: fx(8, (b) => { b.fill('#e7738a', [[0, 5], [-5, 0], [-4.6, -3.4], [-2, -4.4], [0, -2.4], [2, -4.4], [4.6, -3.4], [5, 0]], 0.95, 0.3); b.disc(-2.2, -2.2, 0.8, '#fff'); }),
  slowMark: fx(10, (b) => { for (const y of [-3, 0, 3]) b.brush([[-8, y, 0.4], [-2, y, 1.4], [6, y, 0.3]], 0.7, '#3f6f8f'); }),
  rootMark: fx(12, (b) => { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.brush([[Math.cos(a) * 11, Math.sin(a) * 5 + 3, 0.4], [Math.cos(a) * 6, Math.sin(a) * 3, 1.4], [Math.cos(a + 0.8) * 3, -4, 0.3]], 0.85, INK); } }),
  shieldBubble: zone((b) => { ringOf(b, 30, 2.6, MOON, 0.8); ringOf(b, 30, 0.8, '#8ea4bf', 0.6); b.wash(MOON, ell(0, 0, 29, 29, 0, Math.PI * 2, 24), 0.12); }),
  levelRing: zone((b) => { ringOf(b, 29, 4, INK, 0.7); ringOf(b, 29, 1.6, GOLD, 0.95); }),
  mergeFlash: fx(16, (b) => { b.brush([[-14, 10, 0.5], [-4, 2, 3.4], [14, -12, 0.4]], 0.85, INK); b.brush([[-12, 8, 0.4], [2, -2, 1.2], [12, -10, 0.3]], 0.9, '#fff6d0'); b.dot(0, 0, 5, 0.6, GOLD); }),
  coinRipple: zone((b) => { ringOf(b, 30, 1.2, GOLD, 0.8); }),
  flowerbed: zone((b) => {
    b.wash('#6f9f64', blob(0, 0, 30, 29, 3, 0.08), 0.35, 4);
    for (let i = 0; i < 14; i++) { const a = h01(7, i) * Math.PI * 2, r = 4 + h01(8, i) * 24, x = Math.cos(a) * r, y = Math.sin(a) * r; const c = i % 3 === 0 ? '#e7a3b3' : i % 3 === 1 ? '#f1d9a8' : '#e9e4f4'; for (let k = 0; k < 5; k++) b.fill(c, rot(ell(x + 2.2, y, 2.2, 1.4, 0, Math.PI * 2, 6), (k / 5) * Math.PI * 2, x, y), 0.9, 0.2); b.disc(x, y, 0.9, GOLD); }
  }),
  netMesh: zone((b) => { b.flat((g) => { g.save(); g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.clip(); g.strokeStyle = 'rgba(58,52,40,0.8)'; g.lineWidth = 0.7; for (let i = -30; i <= 30; i += 5) { g.beginPath(); g.moveTo(i - 30, -30); g.lineTo(i + 30, 30); g.moveTo(i + 30, -30); g.lineTo(i - 30, 30); g.stroke(); } g.restore(); }); ringOf(b, 30, 1.6, '#5b4a32', 0.9); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.disc(Math.cos(a) * 30, Math.sin(a) * 30, 1.4, '#c9a646'); } }),
  vortex: zone((b) => { for (let i = 0; i < 5; i++) { const a0 = (i / 5) * Math.PI * 2; const pts: [number, number, number][] = []; for (let k = 0; k <= 8; k++) { const t = k / 8, a = a0 + t * 2.6, r = 30 * (1 - t * 0.85); pts.push([Math.cos(a) * r, Math.sin(a) * r, 0.5 + 3 * Math.sin(t * Math.PI)]); } b.brush(pts, 0.65, i % 2 ? GOLD : '#8a6a2a'); } b.fill('#e3c25a', [[-2.4, -5], [2.4, -5], [2.4, 5], [-2.4, 5]], 0.95, 0.2); }),
  zhenGlyph: zone((b) => { b.wash(INK, ell(0, 0, 30, 30, 0, Math.PI * 2, 24), 0.12, 4); b.glyph('镇', 0, 0, 46, '#1b1916', undefined, 0.8); }),
  moonPool: zone((b) => { b.wash('#dfe7f0', blob(0, 0, 30, 28, 4, 0.06), 0.6, 4); b.wash(MOON, blob(-3, -3, 20, 18, 9, 0.08), 0.6, 3); ringOf(b, 29, 0.8, SILVER, 0.7); }),
  webPatch: zone((b) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.line([[0, 0], [Math.cos(a) * 30, Math.sin(a) * 30]], 0.5, 0.75, INK); } for (const r of [8, 15, 22, 29]) b.line(ell(0, 0, r, r, 0, Math.PI * 2, 8).concat([[r, 0]]), 0.45, 0.65, INK); }),
  inkPuddle: zone((b) => { b.wash(INK, blob(0, 0, 29, 26, 13, 0.14), 0.65, 3); b.wash(INK, blob(3, 2, 18, 14, 3, 0.1), 0.4, 2); }),
  sporeCloud: zone((b) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.wash('#8a9a6a', blob(Math.cos(a) * 12, Math.sin(a) * 12, 16, 14, 30 + i, 0.2), 0.3, 4); } for (let i = 0; i < 12; i++) b.dot((h01(4, i) - 0.5) * 50, (h01(5, i) - 0.5) * 50, 1.6, 0.6, '#5a6a3a'); }),
  firePuddle: zone((b) => { b.wash('#8e2b3a', blob(0, 0, 28, 25, 6, 0.14), 0.5, 3); for (let i = 0; i < 6; i++) { const a = h01(3, i) * Math.PI * 2, r = h01(6, i) * 18; b.fill('#e0683a', [[Math.cos(a) * r - 3, Math.sin(a) * r + 3], [Math.cos(a) * r, Math.sin(a) * r - 7], [Math.cos(a) * r + 3, Math.sin(a) * r + 3]], 0.8, 0.5); } }),
  stoneBlack: fx(9, (b) => { b.disc(0.6, 0.8, 7.6, 'rgba(0,0,0,0.25)'); b.disc(0, 0, 7.4, '#16161a'); b.disc(-2.4, -2.6, 1.8, '#5a5a66', 0.8); }, 1, 'paper'),
  stoneWhite: fx(9, (b) => { b.disc(0.6, 0.8, 7.6, 'rgba(0,0,0,0.25)'); b.disc(0, 0, 7.4, '#f4f2ea'); b.ring(0, 0, 7.4, 0.6, '#8a857c', 0.9); b.disc(-2.4, -2.6, 1.8, '#ffffff'); }, 1, 'dark'),
  stepTrail: fx(12, (b) => { for (const [x, y] of [[-6, 3], [5, -3]] as Pt[]) { b.fill('#8ea4bf', ell(x, y, 2.6, 4.4), 0.5, 0.3); b.line(ell(x, y, 6, 2.4, 0, Math.PI * 2, 12), 0.4, 0.4, '#8ea4bf'); } }),
  swordStreak: { box: [-40, -6, 4, 6], n: 1, halo: 'none', paint: (b) => { b.dry([[-40, 0, 1], [-20, 0, 7], [2, 0, 4]], 0.5, CLASS_WASH.sword, 0.75); } },
  moonCircle: zone((b) => { b.wash(MOON, blob(0, 0, 30, 30, 7, 0.04), 0.55, 5); ringOf(b, 30, 1.4, '#f6f7fb', 0.9); }),
  rippleRing: zone((b) => { ringOf(b, 29, 2.4, '#8ea4bf', 0.6); ringOf(b, 26, 0.8, '#dfe7f0', 0.7); }),
  jadeTile: fx(24, (b) => { b.fill('#9fc8b4', [[-20, -20], [20, -20], [20, 20], [-20, 20]], 0.9, 0.4); b.fill('#c8e4d6', [[-16, -16], [16, -16], [16, 16], [-16, 16]], 0.7, 0.3); b.line([[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]], 0.8, 0.9, '#2f5a4a'); b.glyph('玉', 0, 0, 18, '#2f5a4a', undefined, 0.7); }, 1, 'dark'),
  leafGust: zone((b) => { for (let i = 0; i < 9; i++) { const a = h01(2, i) * Math.PI * 2, r = 6 + h01(3, i) * 22; const x = Math.cos(a) * r, y = Math.sin(a) * r; b.brush(rotW([[-5, 0, 0.3], [0, 0, 2.4], [5, 0, 0.3]], a + 1.2).map(([px, py, w]) => [px + x, py + y, w] as [number, number, number]), 0.85, '#2f5a36'); } for (const r of [14, 24]) b.brush(arcW(0, 0, r, r, 0, 2.2, 0.3, 1.2, 8), 0.4, '#5f8a6e'); }),
  frostPatch: zone((b) => { b.wash('#dfeaf2', blob(0, 0, 29, 27, 21, 0.18), 0.65, 3); for (let i = 0; i < 6; i++) { const x = (h01(9, i) - 0.5) * 40, y = (h01(10, i) - 0.5) * 40; b.fill('#ffffff', star(x, y, 4, 1, 6), 0.9, 0.2); } }),
  mirageWall: zone((b) => { for (let i = 0; i < 7; i++) { const x = -30 + i * 10, h = 12 + h01(1, i) * 14; b.wash('#8ea4bf', [[x - 4, 20], [x - 4, 20 - h], [x, 20 - h - 5], [x + 4, 20 - h], [x + 4, 20]], 0.45, 2); } b.wash('#c9d3dc', blob(0, 18, 32, 6, 3, 0.2), 0.4, 3); }),
  shockRing: zone((b) => { ringOf(b, 28, 4, INK, 0.6); b.dry(arcW(0, 0, 30, 30, 0.3, 2.8, 2, 0.6, 10), 0.5, INK); b.dry(arcW(0, 0, 30, 30, 3.5, 5.9, 2, 0.6, 10), 0.5, INK); }),
  dustPuff: fx(14, (b) => { for (let i = 0; i < 4; i++) b.wash('#a89a80', blob((i - 1.5) * 6, (i % 2) * 3, 6, 5, i + 3, 0.2), 0.4, 2); }),
  petalBurst: fx(18, (b) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = 8 + h01(12, i) * 8; b.fill(i % 2 ? '#e7a3b3' : GOLD, rot(ell(Math.cos(a) * r, Math.sin(a) * r, 2.6, 1.5, 0, Math.PI * 2, 8), a, Math.cos(a) * r, Math.sin(a) * r), 0.9, 0.2); } }),
  /** The ground shadow only a true boss casts (蜃, 九尾狐, 水中月's decoys have none): a wide, flat,
   *  dark ellipse the engine lays under its feet as a zone. */
  bossShadow: zone((b) => {
    b.wash(INK, ell(0, 0, 31, 14, 0, Math.PI * 2, 32), 0.45, 3);
    b.fill(INK, ell(0, 1, 26, 10, 0, Math.PI * 2, 32), 0.9, 2.5);
  }),
  teleInk: zone((b) => { b.wash(DANGER, blob(0, 0, 30, 29, 19, 0.06), 0.55, 3); b.wash(CINNABAR, blob(-4, 3, 16, 14, 5, 0.15), 0.3, 2); }),
};
void spine; void JADE; void PAPER; void GOLD;
