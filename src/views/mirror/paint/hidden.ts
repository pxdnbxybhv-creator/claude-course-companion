// m8 · the three hidden companions' paint (hidden.md §3.2, §4.2, §5.2; art.md R1–R11), owned by HIDDEN.
//   · HIDDEN_LOOK: the arena-token colours (palette.ts spreads it into CHAR_LOOK).
//   · HIDDEN_SPECS: the arena tokens on ART's paint/brushwork.ts (figures.ts spreads them into CHAR_SPECS).
//     越女 and 后羿 carry a fifth frame, their pose (POSE_FRAME): 越女's guard (the sword raised across her body)
//     and 后羿's draw (the bow up, the string at his cheek). engine/rings.ts blits it in place of the figure while
//     the guard / the draw is live. The pose is a frame of the companion's own atlas id, so the atlas, the bake
//     plan and the AtlasId union need nothing new.
//   · HIDDEN_BUSTS / paintHiddenBust: the round-fan busts for Portrait (ui/icons.tsx), in the app portrait's
//     100 × 120 drawing space; `veiled` paints the bust's own shape as an ink silhouette (INK at 40 %) with a
//     1.5 px rim in its map's colour, and never a palette colour (the sealed 「？」 tiles, hidden.md §2.3).
// This module imports no runtime value from palette.ts or figures.ts (they import it: no cycle).
import { PIGMENTS } from '../../../ink/types';
import { paintStroke } from '../../../ink/brush';
import { fillPaper } from '../../../ink/paper';
import type { HiddenId } from '../types';
import type { MapId } from '../ids';
import { B, ell, arcW, spine, type Pt, type WPt, type Spec } from './kit';
import { body2, eyes2, face2, hair2, hurtInk2, litOf, sheen, shadeOf, HAIR_SHEEN, type Frame2 } from './brushwork';
import type { CharLook } from './palette';

const INK = PIGMENTS.ink;

/** The arena-token colours (hidden.md §3.2, §4.2, §5.2). */
export const HIDDEN_LOOK: Readonly<Record<HiddenId, CharLook>> = {
  yuenv: { skin: '#f3d8bf', robe: '#3f7686', trim: '#ece4d2', hair: INK, accent: '#7fc4c8' },
  shangui: { skin: '#ecd3b8', robe: '#5f7f4a', trim: '#b5482e', hair: INK, accent: '#c9d98a' },
  houyi: { skin: '#d9ad86', robe: '#7a2a22', trim: '#c0412f', hair: INK, accent: '#d9a62e' },
};

/** Each hidden companion's map colour: the sealed silhouette's rim (hidden.md §2.3). */
export const HIDDEN_RIM: Readonly<Record<MapId, string>> = { lake: '#6f9fb8', forest: '#5f7f4a', palace: '#d2a95a' };

/** The pose frames (the fifth frame of the companion's own `char:` atlas id). */
export const POSE_FRAME = { 'yuenv-guard': 4, 'houyi-draw': 4 } as const;
export type PoseName = keyof typeof POSE_FRAME;

// the props' colours
const CANE = '#6f9a4e';
const BRONZE = '#b8925a';
const LEATHER = '#6b4a2e';
const LACQUER = '#c0412f';
const STRING = '#efe6d0';
const SUN = '#d9a62e';
const SPOT = '#3a1d12';
const BELLY = '#e3b48c';

const BOX: Spec['box'] = [-22, -34, 24, 20];
/** 山鬼 rides a leopard 1.3× the usual figure's width: a wider canvas (the hitbox is unchanged). */
const RIDE_BOX: Spec['box'] = [-31, -36, 31, 22];

/** A held or carried stick: an ink edge `e` u wider under the fill. */
function rod(b: B, pts: WPt[], color: string, e = 1.2, tone = 0.95) {
  b.brush(pts.map(([x, y, w]) => [x, y, w + e] as WPt), 0.92, INK);
  b.brush(pts, tone, color);
}

/** The index of body2's front sleeve (its first brush in the robe's colour), to slip a mass in under it. */
function sleeveAt(b: B, from: number, robe: string): number {
  for (let i = from; i < b.ops.length; i++) {
    const op = b.ops[i];
    if (op.k === 'stroke' && op.s.kind === 'brush' && op.s.color === robe) return i;
  }
  return b.ops.length;
}

// ───────────────────────────────────────────── 越女 · 镜湖剑
function yuenv(b: B, v: number): void {
  const L = HIDDEN_LOOK.yuenv;
  const pose = v === POSE_FRAME['yuenv-guard'];
  const f = (pose ? 0 : v) as Frame2;
  // 袁公's bamboo cane slung across her back, right shoulder to left hip, its nodes
  rod(b, spine(8, -16, -14, 11, 2.4, 2.2), CANE, 1.1);
  for (const t of [0.3, 0.68]) { const x = 8 - 22 * t, y = -16 + 27 * t; b.line([[x - 1.8, y - 1.4], [x + 1.8, y + 1.4]], 1.2, 0.85, shadeOf(CANE)); }
  const i0 = b.ops.length;
  const o = body2(b, L, f, { robeW: 9, sash: null, collar: L.trim, noSleeve: pose });
  // the ramie-white short jacket over the lake-blue skirt, slipped in under the sleeve and the collar
  const jk = new B(b.ops.length + 1);
  const ln = o.lean;
  const jacket: Pt[] = [[-o.rw * 0.62 + ln, o.top], [o.rw * 0.62 + ln, o.top], [o.rw * 0.84 + 0.5, 3.6], [-o.rw * 0.86 - 0.5, 3.6]];
  jk.fill(L.trim, jacket, 0.96, 0.4);
  jk.brush([[-o.rw * 0.86 - 0.5, 3.4, 1.4], [o.rw * 0.84 + 0.5, 3.4, 1.4]], 0.7, shadeOf(L.trim));
  b.ops.splice(sleeveAt(b, i0, L.robe), 0, ...jk.ops);
  // the lake-green sash knotted at the hip, its ends trailing
  const sw = f === 1 ? 1.4 : f === 2 ? -1.4 : 0;
  b.dot(-o.rw * 0.55, 4.2, 3.6, 0.95, L.accent);
  b.brush([[-o.rw * 0.55, 4.4, 2], [-o.rw * 0.85 - 1, 9 + sw, 1.6], [-o.rw - 2.5, 14 - sw, 0.6]], 0.92, L.accent);
  // the hair in one low knot with a bamboo pin
  hair2(b, o.hx, o.hy, o.hr, L.hair, false);
  b.dot(o.hx - o.hr * 0.95, o.hy + o.hr * 0.35, 6, 0.97, INK);
  b.line([[o.hx - o.hr * 1.5, o.hy + o.hr * 0.05], [o.hx - o.hr * 0.45, o.hy + o.hr * 0.7]], 1.2, 0.9, CANE);
  face2(b, o.hx, o.hy, o.hr, f, 'lady', 0.32);
  if (pose) {
    // 守: the arm up, the slim bronze sword raised across her body, a white line along its edge
    const hx = 9.5 + ln, hy = -12;
    b.brush([[o.rw * 0.5 + ln, o.top + 2, 4.4], [hx - 1, hy + 2.5, 3.6]], 0.95, L.trim);
    b.brush([[o.rw * 0.9 + ln, o.top + 3.5, 1.3], [hx + 1, hy + 3.5, 0.7]], 0.85, INK);
    b.brush([[hx, hy, 2.4], [-1, -1, 2.2], [-9, 7, 0.9]], 0.97, BRONZE);
    b.line([[hx - 0.5, hy - 1], [-9.4, 6.2]], 0.7, 0.9, '#fbf6e8');
    b.dot(hx, hy, 3.2, 0.97, L.skin);
  } else {
    // the sword reversed along the forearm: the blade lies back from the hand toward the elbow
    b.brush([[o.handX + 0.6, o.handY + 1.6, 1.6], [o.rw * 0.55 + ln, o.top + 2.2, 0.8]], 0.95, BRONZE);
    b.line([[o.handX + 1.4, o.handY + 1], [o.rw * 0.6 + ln, o.top + 1.4]], 0.6, 0.8, INK);
  }
  // a faint ripple ring under her bare feet while she stands still
  if (v === 0 || pose) b.line(ell(0, o.hem + 3.4, 15.5, 4.8, Math.PI * 0.05, Math.PI * 0.95, 10), 1.2, 0.55, L.accent);
  hurtInk2(b, v);
}

// ───────────────────────────────────────────── 山鬼 · 幽篁 (sidesaddle on the red leopard)
function shangui(b: B, v: number): void {
  const L = HIDDEN_LOOK.shangui;
  const f = v as Frame2, hurt = f === 3;
  const lope = f === 1 ? 2.2 : f === 2 ? -2.2 : 0;
  const by = hurt ? 7.5 : 7, bob = f === 1 ? -0.8 : f === 2 ? 0.4 : 0;
  // the leopard: tail curled up behind, four lean legs, a long low body, the head forward (it faces right)
  b.brush([[-20, by - 1, 2.6], [-26, by - 7, 2.2], [-26, by - 14, 1.6], [-22, by - 15.5, 0.8]], 0.95, L.trim);
  for (const [x, ph] of [[-15, 1], [-9, -1], [9, -1], [15, 1]] as Pt[]) {
    const s = lope * ph;
    b.brush([[x, by + 2, 3], [x + s * 0.6, by + 8, 2.4], [x + s + 0.8, by + 13, 2.8]], 0.95, ph > 0 ? L.trim : shadeOf(L.trim));
  }
  const bodyPts: Pt[] = [...ell(0, by + bob, 21.5, 6.6, 0, Math.PI * 2, 18)];
  b.fill(L.trim, bodyPts, 0.96, 0.4);
  b.wash(shadeOf(L.trim), [[-18, by + 2.5 + bob], [18, by + 2.5 + bob], [15, by + 6.2 + bob], [-15, by + 6.2 + bob]], 0.5, 1.2);
  b.fill(BELLY, [[-12, by + 4.6 + bob], [12, by + 4.6 + bob], [9, by + 6.4 + bob], [-9, by + 6.4 + bob]], 0.85, 0.5);
  for (const [x, y] of [[-14, -1.5], [-6, 1.6], [2, -2.2], [9, 1.2], [14, -1.8]] as Pt[]) b.dot(x, by + bob + y, 2.2, 0.85, SPOT);
  b.brush(arcW(0, by + bob, 21.8, 6.9, Math.PI * 1.05, Math.PI * 1.95, 1.8, 1.4, 10), 0.9, INK);
  sheen(b, 0, by + bob - 0.4, 20, 6, Math.PI * 1.15, Math.PI * 1.55, 1.8);
  // the head: ears, a snout, a gold eye that watches
  const hx = 22 + (hurt ? -1.5 : 0), hy = by - 4.5 + bob;
  b.fill(L.trim, [...ell(hx, hy, 6.4, 5.4, 0, Math.PI * 2, 14)], 0.97, 0.4);
  b.fill(L.trim, [[hx + 3, hy - 1], [hx + 10, hy + 0.6], [hx + 9.4, hy + 3.4], [hx + 3, hy + 3.6]], 0.97, 0.4);
  b.brush([[hx - 3.6, hy - 3.4, 2.4], [hx - 2.8, hy - 7.8, 1.4]], 0.97, L.trim);
  b.brush(arcW(hx, hy, 6.6, 5.6, Math.PI * 1.1, Math.PI * 1.9, 1.6, 1.2, 8), 0.9, INK);
  b.dot(hx + 9.6, hy + 1.2, 2.2, 0.97, INK);
  if (hurt) b.brush([[hx + 4, hy + 3.4, 1.2], [hx + 8.6, hy + 4.2, 1]], 0.95, '#f6f1e4');
  eyes2(b, hx + 2.4, hy - 0.6, 0, 1.4, 0.4, '#e9c25a');
  // her: barefoot, sidesaddle on its back, girdled in 薜荔, the lichen trailing from her sash
  const sx = -3, top = by - 19 + bob, hem = by - 2 + bob, rw = 6.6, ln = hurt ? -2 : f === 1 ? 0.6 : 0;
  b.brush([[sx + 2, hem, 2.6], [sx + 7, hem + 6, 2.2], [sx + 8, hem + 10.5, 1.8]], 0.95, L.skin);
  const robe: Pt[] = [[sx - rw * 0.6 + ln, top], [sx + rw * 0.6 + ln, top], [sx + rw + 2, hem], [sx + rw * 0.3, hem + 3], [sx - rw - 3, hem + 1]];
  b.fill(L.robe, robe, 0.96, 0.4);
  b.wash(shadeOf(L.robe), [[sx + 1 + ln, top + 3], [sx + rw * 0.6 + ln, top + 1], [sx + rw + 2, hem], [sx + rw * 0.3, hem + 2.4]], 0.5, 1.2);
  b.wash(litOf(L.robe), [[sx - rw * 0.55 + ln, top + 1], [sx - 1 + ln, top + 1], [sx - 2, hem - 3], [sx - rw * 0.8, hem - 4]], 0.42, 1.2);
  b.brush([[sx - rw * 0.62 + ln, top + 0.5, 1.8], [sx - rw - 1.5, hem - 3, 1.6], [sx - rw - 3, hem + 1, 1]], 0.92, INK);
  b.brush([[sx + rw * 0.62 + ln, top + 0.5, 2], [sx + rw + 1.4, hem - 3, 1.8], [sx + rw + 2.2, hem, 1.1]], 0.95, INK);
  // the fig-leaf girdle and the lichen streamers (the pale accent mass)
  b.brush([[sx - rw + ln, top + 8, 2.6], [sx + rw + ln, top + 7.6, 2.6]], 0.95, '#3f5a30');
  const s2 = f === 1 ? 1.2 : f === 2 ? -1.2 : 0;
  b.dry([[sx - rw * 0.4, top + 8.4, 2.2], [sx - rw - 4, top + 13 + s2, 2], [sx - rw - 9, top + 18 - s2, 0.8]], 0.85, L.accent, 0.4);
  b.dry([[sx + rw * 0.2, top + 8.6, 1.8], [sx - 2, hem + 3 - s2, 1.6], [sx - 5, hem + 8, 0.6]], 0.8, L.accent, 0.4);
  // her hand on its neck
  b.brush([[sx + rw * 0.5 + ln, top + 2, 4], [sx + rw + 4, top + 7, 3.6], [sx + rw + 8, top + 10.5, 3]], 0.95, L.robe);
  b.brush([[sx + rw * 0.9 + ln, top + 3.6, 1.3], [sx + rw + 6, top + 8.2, 1.2], [sx + rw + 9, top + 12, 0.5]], 0.85, INK);
  b.dot(sx + rw + 9.6, top + 11.6, 3.2, 0.97, L.skin);
  // the head, a 石兰 orchid over one ear, a half-teasing smile
  const hr = 8, hxx = sx + 1 + ln * 1.4, hyy = top - hr + 1;
  b.fill(L.skin, ell(hxx, hyy, hr, hr * 1.02, 0, Math.PI * 2, 18), 0.97, 0.4);
  b.brush(arcW(hxx, hyy, hr + 0.2, hr * 1.02 + 0.2, -Math.PI * 0.1, Math.PI * 1.05, 1.1, 0.7, 12), 0.85, INK);
  hair2(b, hxx, hyy, hr, L.hair, false);
  b.brush([[hxx - hr * 0.7, hyy + 1, 2.2], [hxx - hr - 3, hyy + 7, 1.8], [hxx - hr - 2, hyy + 12, 0.6]], 0.95, INK);
  b.dry([[hxx - hr * 0.2, hyy - hr * 0.9, 1.6], [hxx - hr - 2, hyy - 2, 1.4], [hxx - hr - 5, hyy + 6, 0.5]], 0.7, L.accent, 0.4);
  b.dot(hxx - hr * 0.35, hyy - hr * 0.7, 3.4, 0.95, '#d6d0f0');
  b.dot(hxx - hr * 0.35, hyy - hr * 0.7, 1.4, 0.95, '#8a5ab0');
  face2(b, hxx, hyy, hr, f, hurt ? 'dot' : 'smile', 0.4);
  hurtInk2(b, v);
}

// ───────────────────────────────────────────── 后羿 · 射日
function houyi(b: B, v: number): void {
  const L = HIDDEN_LOOK.houyi;
  const pose = v === POSE_FRAME['houyi-draw'];
  const f = (pose ? 0 : v) as Frame2;
  // the quiver on his back, three sun-gold fletchings showing
  rod(b, spine(-15, 6, -9, -11, 4.2, 4), LEATHER, 1.1);
  for (const [dx, dy] of [[-1.6, 0], [0.6, -1.2], [2.6, -0.2]] as Pt[]) {
    b.line([[-9 + dx, -11 + dy], [-7.6 + dx, -16.5 + dy]], 1.2, 0.95, INK);
    b.brush([[-7.8 + dx, -15 + dy, 2.4], [-7 + dx, -18.6 + dy, 1.2]], 0.97, SUN);
  }
  const o = body2(b, L, f, { robeW: 11, head: 8.6, over: LEATHER, noSleeve: pose });
  // hair tied high with a red cord, a beard of three strokes
  hair2(b, o.hx, o.hy, o.hr, L.hair, true);
  b.brush([[o.hx - o.hr * 0.75, o.hy - o.hr - 0.6, 1.4], [o.hx - o.hr * 0.15, o.hy - o.hr - 1.6, 1.4]], 0.97, LACQUER);
  // a short beard along the jaw, under the mouth
  for (const [dx, len] of [[2.2, 4.2], [4.6, 5.2]] as Pt[]) b.brush([[o.hx + dx, o.hy + o.hr * 0.72, 1.6], [o.hx + dx + 0.5, o.hy + o.hr * 0.72 + len, 0.6]], 0.95, INK);
  face2(b, o.hx, o.hy, o.hr, f, pose ? 'smile' : 'fierce', 0);
  if (pose) {
    // 射日: the arm out to the grip, the bow up, the string drawn back to his cheek, the arrow laid on it
    const gx = 18.5 + o.lean, gy = -9, cx = o.hx + o.hr * 0.7, cy = o.hy + 3;
    b.brush([[o.rw * 0.5 + o.lean, o.top + 2, 4.4], [gx - 2, gy + 1, 3.4]], 0.95, L.robe);
    b.brush([[o.rw * 0.9 + o.lean, o.top + 4, 1.3], [gx - 1.5, gy + 2.6, 0.7]], 0.85, INK);
    b.brush([[gx + 0.5, gy - 23, 1.4], [gx + 5.2, gy - 10, 2.6], [gx + 6, gy, 2.8], [gx + 5.2, gy + 10, 2.6], [gx + 0.5, gy + 22, 1.4]], 0.97, LACQUER);
    b.line([[gx + 0.5, gy - 23], [cx, cy], [gx + 0.5, gy + 22]], 0.7, 0.9, STRING);
    b.line([[cx, cy], [gx + 9, gy + 0.4]], 1.2, 0.95, '#7a5a3a');
    b.fill(SUN, [[gx + 8, gy - 1.6], [gx + 12.5, gy + 0.4], [gx + 8, gy + 2.2]], 0.97, 0.2);
    b.dot(gx, gy, 3.4, 0.97, L.skin);
    b.dot(cx, cy, 3.2, 0.97, L.skin);
  } else {
    // the 射日弓, taller than he is: vermilion lacquer, held at the grip, the string a pale thread
    const gx = o.handX + 3, gy = o.handY;
    b.brush([[gx - 6, -32, 1.4], [gx, -18, 2.6], [gx + 2.4, gy - 6, 2.8], [gx + 1.6, gy + 4, 2.6], [gx - 4, 16, 1.4]], 0.97, LACQUER);
    b.brush([[gx - 6.4, -32.4, 0.8], [gx - 0.4, -18.6, 1.2]], 0.7, litOf(LACQUER));
    b.line([[gx - 6, -32], [gx - 4, 16]], 0.7, 0.85, STRING);
    // the bracer at the wrist
    b.brush([[o.handX - 2.4, o.handY - 3, 2.2], [o.handX - 0.6, o.handY - 1, 2.2]], 0.95, LEATHER);
  }
  hurtInk2(b, v);
}

const fig = (paint: (b: B, v: number) => void, n = 4, box: Spec['box'] = BOX): Spec => ({ box, n, halo: 'paper', paint });

/** The arena tokens (`char:<id>`): frames 0 idle · 1, 2 walk · 3 hurt (· 4 the pose, POSE_FRAME). */
export const HIDDEN_SPECS: Readonly<Record<HiddenId, Spec>> = {
  yuenv: fig(yuenv, 5),
  shangui: fig(shangui, 4, RIDE_BOX),
  houyi: fig(houyi, 5),
};

// ───────────────────────────────────────────── the busts (100 × 120, the app portrait's space)

/** 越女: three-quarter face, calm; the cane over her shoulder; a lake-green sash end. */
function yuenvBust(p: B): void {
  const L = HIDDEN_LOOK.yuenv;
  rod(p, spine(20, 124, 86, 26, 5.6, 5), CANE, 1.8);
  for (const t of [0.22, 0.5, 0.78]) { const x = 20 + 66 * t, y = 124 - 98 * t; p.line([[x - 3.6, y - 2.6], [x + 3.6, y + 2.6]], 2, 0.85, shadeOf(CANE)); }
  bust(p, { skin: L.skin, robe: L.trim, trim: L.robe, hx: 48, hy: 52 });
  p.brush([[24, 92, 3.6], [72, 92, 3.6]], 0.92, L.robe);
  p.brush([[70, 94, 4.4], [78, 106, 3.6], [74, 120, 1.2]], 0.95, L.accent);
  p.brush([[66, 95, 3], [64, 110, 2.6], [68, 122, 1]], 0.9, L.accent);
  hairCap(p, 48, 52, 13, INK);
  p.dot(30, 60, 11, 0.97, INK);
  p.line([[22, 54], [36, 66]], 1.6, 0.9, CANE);
  eyes(p, 48, 52, 13, 'lady');
}

/** 山鬼: her cheek against the leopard's neck, lichen in her hair, a sprig of 杜衡. */
function shanguiBust(p: B): void {
  const L = HIDDEN_LOOK.shangui;
  // the leopard's head and neck, on the left
  p.fill(L.trim, [[4, 124], [10, 84], [16, 62], [30, 56], [42, 64], [44, 92], [38, 124]], 0.95, 0.5);
  p.fill(L.trim, ell(24, 58, 15, 13, 0, Math.PI * 2, 22), 0.96, 0.5);
  p.brush([[12, 50, 4.4], [10, 40, 2.6]], 0.97, L.trim);
  p.brush([[34, 48, 4], [38, 39, 2.4]], 0.97, L.trim);
  for (const [x, y, d] of [[16, 76, 4], [26, 84, 3.6], [20, 98, 4.2], [32, 104, 3.4], [12, 110, 3.6], [34, 72, 3]] as [number, number, number][]) p.dot(x, y, d, 0.85, SPOT);
  p.brush(arcW(24, 58, 15.4, 13.4, Math.PI * 0.95, Math.PI * 2.05, 1.8, 1.4, 12), 0.85, INK);
  p.fill(BELLY, ell(25, 66, 6, 4.4, 0, Math.PI * 2, 14), 0.9, 0.5);
  p.dot(25, 63.5, 3.4, 0.97, INK);
  p.flat((g) => {
    for (const x of [18.5, 30.5]) {
      g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(x, 55, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e9c25a'; g.beginPath(); g.arc(x, 55, 2.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(x + 0.3, 55, 0.7, 1.9, 0, 0, Math.PI * 2); g.fill();
    }
  }, [15, 51, 34, 59]);
  bust(p, { skin: L.skin, robe: L.robe, trim: '#3f5a30', hx: 60, hy: 54, sw: 26 });
  hairCap(p, 60, 54, 13, INK);
  p.brush([[48, 50, 4], [44, 70, 3.4], [46, 90, 1.2]], 0.95, INK);
  // the lichen trailing through her hair, the 杜衡 sprig
  p.dry([[54, 41, 2.6], [42, 52, 2.4], [38, 70, 1.4], [40, 84, 0.6]], 0.85, L.accent);
  p.dry([[64, 40, 2.2], [74, 46, 2], [80, 58, 0.8]], 0.8, L.accent);
  p.fill('#3f6a3a', [[70, 38], [80, 30], [84, 36], [76, 44]], 0.92, 0.4);
  p.fill('#3f6a3a', [[72, 42], [86, 42], [82, 48]], 0.92, 0.4);
  p.dot(81, 35, 4.2, 0.95, '#7a3a5a');
  eyes(p, 60, 54, 13, 'smile');
}

/** 后羿: profile at full draw, one eye closed, the string at his cheek. */
function houyiBust(p: B): void {
  const L = HIDDEN_LOOK.houyi;
  bust(p, { skin: L.skin, robe: L.robe, trim: L.trim, hx: 44, hy: 50, sw: 32 });
  p.fill(LEATHER, [[18, 82], [42, 74], [44, 124], [14, 124]], 0.92, 0.4);
  // the arm out to the bow
  p.brush([[56, 72, 11], [74, 66, 9], [88, 62, 7]], 0.95, L.robe);
  p.brush([[80, 63, 6], [86, 62, 6]], 0.95, LEATHER);
  // the bow: vermilion lacquer, taller than the fan
  p.brush([[82, 4, 2.4], [92, 30, 4.2], [94, 62, 4.6], [92, 94, 4.2], [82, 118, 2.4]], 0.97, LACQUER);
  p.brush([[83, 6, 1.2], [91, 30, 1.6]], 0.7, litOf(LACQUER));
  p.line([[82, 4], [58, 58], [82, 118]], 1.1, 0.9, STRING);
  p.line([[58, 58], [102, 61]], 2, 0.95, '#7a5a3a');
  p.fill(SUN, [[98, 57.6], [106, 61], [98, 64.4]], 0.97, 0.2);
  p.dot(90, 62, 8, 0.97, L.skin);
  p.dot(58, 58, 7, 0.97, L.skin);
  hairCap(p, 44, 50, 13, INK);
  p.dot(38, 33, 10, 0.97, INK);
  p.brush([[32, 36, 2.4], [42, 30, 2.4]], 0.97, LACQUER);
  for (const [dx, len] of [[-3, 7], [1, 9], [5, 7]] as Pt[]) p.brush([[44 + dx, 63.5, 2.4], [44.6 + dx, 63.5 + len, 0.8]], 0.95, INK);
  // one eye open along the arrow, one shut
  p.dot(49, 51, 2.6, 0.97, INK);
  p.brush([[36, 51, 1.2], [41, 50, 1.4]], 0.95, INK);
  p.brush([[45, 46, 1.8], [53, 44.6, 0.8]], 0.95, INK);
}

interface BustLook { skin: string; robe: string; trim: string; hx?: number; hy?: number; hr?: number; sw?: number }
/** The shared bust (the app portrait's shape): robe, crossed collar, neck and face. */
function bust(p: B, o: BustLook): void {
  const hx = o.hx ?? 50, hy = o.hy ?? 52, hr = o.hr ?? 13, sw = o.sw ?? 30, ny = hy + hr + 2;
  const robe: Pt[] = [[hx - 7, ny], [hx - sw * 0.55, ny + 5], [hx - sw * 0.85, ny + 11], [hx - sw, ny + 26], [hx - sw - 4, 124], [hx + sw + 4, 124], [hx + sw, ny + 26], [hx + sw * 0.85, ny + 11], [hx + sw * 0.55, ny + 5], [hx + 7, ny]];
  p.fill(o.robe, robe, 0.94, 0.5);
  p.wash(shadeOf(o.robe), [[hx + 6, ny + 4], [hx + sw * 0.8, ny + 10], [hx + sw + 3, 124], [hx + 8, 124]], 0.45, 2);
  p.brush([[hx - 7, ny + 1, 2], [hx - sw * 0.6, ny + 5.5, 2.4], [hx - sw * 0.9, ny + 13, 2], [hx - sw - 1.5, ny + 32, 1.4], [hx - sw - 3.5, 120, 0.6]], 0.85, INK);
  p.brush([[hx + 7, ny + 1, 2], [hx + sw * 0.6, ny + 5.5, 2.4], [hx + sw * 0.9, ny + 13, 2], [hx + sw + 1.5, ny + 32, 1.4], [hx + sw + 3.5, 120, 0.6]], 0.85, INK);
  p.brush([[hx - 6, ny, 2.8], [hx + 1, ny + 12, 3], [hx + 8, ny + 24, 2.2]], 0.92, o.trim);
  p.brush([[hx + 6, ny, 2.6], [hx + 1.5, ny + 8, 2.2]], 0.92, o.trim);
  p.fill(o.skin, [[hx - 4.5, hy + hr - 4], [hx + 4.5, hy + hr - 4], [hx + 4, ny + 2], [hx - 4, ny + 2]], 0.96, 0.4);
  p.fill(o.skin, ell(hx, hy, hr, hr * 1.06, 0, Math.PI * 2, 24), 0.96, 0.5);
  p.brush(arcW(hx, hy, hr, hr * 1.06, Math.PI * 0.08, Math.PI * 0.92, 1, 0.6, 12), 0.7, INK);
}
/** The hair: the upper skull with a soft parting, and a moonlit 飞白 across it. */
function hairCap(p: B, hx: number, hy: number, hr: number, color: string): void {
  const cap: Pt[] = [...ell(hx, hy - 0.5, hr + 1, hr * 1.1 + 0.5, Math.PI * 1.02, Math.PI * 1.98, 16), [hx + hr * 0.82, hy - 2], [hx + 4, hy - hr * 0.55], [hx, hy - hr * 0.45], [hx - 4, hy - hr * 0.55], [hx - hr * 0.82, hy - 2]];
  p.fill(color, cap, 0.96, 0.5);
  p.dry(arcW(hx, hy - 0.5, hr - 1, hr * 1.1 - 1, Math.PI * 1.15, Math.PI * 1.55, 2.2, 1, 8), 0.5, HAIR_SHEEN, 0.5);
}
/** Bust eyes (the app portrait's three kinds used here). */
function eyes(p: B, hx: number, hy: number, hr: number, kind: 'lady' | 'smile'): void {
  const ex = hr * 0.36, ey = hy + hr * 0.12;
  for (const sx of [-1, 1]) {
    const x = hx + ex * sx;
    if (kind === 'smile') p.brush([[x - 2.2, ey, 0.8], [x, ey - 1.6, 1.2], [x + 2.2, ey, 0.8]], 0.95, INK);
    else {
      p.dot(x, ey, 2.6, 0.97, INK);
      p.brush([[x - 1.5 * sx, ey - 1.8, 0.5], [x + 2.4 * sx, ey - 2.4, 0.9]], 0.85, INK);
    }
    p.dot(hx + hr * 0.62 * sx, ey + 4.2, 6, 0.28, '#e08f85');
  }
  p.brush([[hx - 1.6, ey + 6.4, 0.8], [hx + 1.6, ey + 6.2, 0.8]], 0.8, '#b8404e');
}

const BUST_PAINT: Readonly<Record<HiddenId, (p: B) => void>> = { yuenv: yuenvBust, shangui: shanguiBust, houyi: houyiBust };
/** Which map's colour rims each veiled bust. */
const BUST_MAP: Readonly<Record<HiddenId, MapId>> = { yuenv: 'lake', shangui: 'forest', houyi: 'palace' };

/** The bust's ops in the 100 × 120 space; `veiled`: every stroke as plain ink (no palette colour), no crisp marks. */
export function hiddenBustOps(id: HiddenId, veiled = false): B['ops'] {
  const p = new B(31 + id.length);
  BUST_PAINT[id](p);
  if (!veiled) return p.ops;
  const out: B['ops'] = [];
  for (const op of p.ops) {
    if (op.k !== 'stroke' || op.s.kind === 'wash') continue;
    out.push({ k: 'stroke', s: { ...op.s, color: INK, tone: 0.97, kind: op.s.kind === 'dry' || op.s.kind === 'line' ? 'brush' : op.s.kind } });
  }
  return out;
}

const bustCache = new Map<string, HTMLCanvasElement>();
/**
 * Paint a hidden companion's round-fan bust into `g` (w × h device px): paper, the figure and a fine mount ring;
 * `veiled`: the silhouette at 40 % ink with a 1.5 px rim in its map's colour (hidden.md §2.3). Cached per size.
 */
export function paintHiddenBust(g: CanvasRenderingContext2D, w: number, h: number, id: HiddenId, veiled = false): void {
  if (!w || !h) return;
  const key = `${id}|${veiled ? 1 : 0}|${w}x${h}`;
  let img = bustCache.get(key);
  if (!img) {
    img = renderBust(id, veiled, w, h);
    if (bustCache.size > 24) bustCache.delete(bustCache.keys().next().value as string);
    bustCache.set(key, img);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.drawImage(img, 0, 0);
}

function renderBust(id: HiddenId, veiled: boolean, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return c;
  const R = Math.min(W, H) / 2 - Math.max(1, Math.min(W, H) * 0.015);
  const cx = W / 2, cy = H / 2, k = (R * 2) / 108;
  const ox = cx - 50 * k, oy = cy - 60 * k + R * 0.05;
  const ops = hiddenBustOps(id, veiled);
  const paint = (t: CanvasRenderingContext2D) => {
    t.setTransform(k, 0, 0, k, ox, oy);
    for (const op of ops) {
      if (op.k === 'stroke') paintStroke(t, op.s);
      else { t.save(); op.f(t); t.restore(); }
    }
    t.setTransform(1, 0, 0, 1, 0, 0);
  };
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  fillPaper(g, W, H, 7 + id.length);
  if (!veiled) paint(g);
  else {
    // the silhouette in solid ink, off-screen; its rim in the map's colour (the silhouette, tinted, spread 1.5 px
    // each way, then the silhouette cut out of it); then the silhouette laid down at 40 %
    const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
    const sg = sil.getContext('2d');
    const rim = document.createElement('canvas'); rim.width = W; rim.height = H;
    const rg = rim.getContext('2d');
    if (sg && rg) {
      paint(sg);
      // ≈ 1.5 css px at the portraits' sizes (56–120 css px, drawn at up to 2 device px each)
      const px = Math.max(1.5, R * 0.05);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) rg.drawImage(sil, dx * px, dy * px);
      rg.globalCompositeOperation = 'source-in';
      rg.fillStyle = HIDDEN_RIM[BUST_MAP[id]];
      rg.fillRect(0, 0, W, H);
      rg.globalCompositeOperation = 'destination-out';
      rg.drawImage(sil, 0, 0);
      g.drawImage(rim, 0, 0);
      g.globalAlpha = 0.4;
      g.drawImage(sil, 0, 0);
      g.globalAlpha = 1;
    }
  }
  g.restore();
  g.strokeStyle = veiled ? HIDDEN_RIM[BUST_MAP[id]] : 'rgba(27,25,22,0.28)';
  g.lineWidth = Math.max(1, R * 0.012);
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  return c;
}

/** Painted busts for Portrait (ui/icons.tsx), tried before the app's paintPortrait. */
export const HIDDEN_BUSTS: Readonly<Partial<Record<HiddenId, (g: CanvasRenderingContext2D, w: number, h: number, veiled?: boolean) => void>>> = {
  yuenv: (g, w, h, veiled) => paintHiddenBust(g, w, h, 'yuenv', veiled),
  shangui: (g, w, h, veiled) => paintHiddenBust(g, w, h, 'shangui', veiled),
  houyi: (g, w, h, veiled) => paintHiddenBust(g, w, h, 'houyi', veiled),
};
