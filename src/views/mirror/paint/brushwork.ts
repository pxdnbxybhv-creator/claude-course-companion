// m8 · shared brushwork for the redraw (art.md §3 R1–R11, PLAN C3). Figures, monsters and the hidden three
// paint on these so every sprite reads at its real size (a phone at 中 draws ≈ 1.7 device px per u):
//   · nothing that must read is thinner than 1.2 u (R1);
//   · every mass is a fill + a shade wash (lower right) + a lit wash (upper left) (R3);
//   · companions get a broken 焦墨 contour 1.6–2.2 u, a head of r 8.4 and eyes with a glint (R2, R5, R6);
//   · monsters get a moonlit dry-brush sheen and ringed eyes with a pupil and a glint (R4, R5).
// Light comes from the upper left (atlas rimLight / volume and ambient.ts shadows agree).
//
// FROZEN (API.md §9.A): body2, face2, hair2, sheen, eyes2 and their option / return types. Additive changes
// only. This module imports no runtime value from palette.ts or figures.ts (palette.ts → hidden.ts → here).
import { PIGMENTS } from '../../../ink/types';
import { arcW, ell, type B, type Pt } from './kit';
import type { CharLook } from './palette';

const INK = PIGMENTS.ink;

/** '#rrggbb' a → b by t (a local copy of palette.mix: no runtime import of palette here). */
export function mixHex(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1, 7), 16), Bn = parseInt(b.slice(1, 7), 16);
  const ch = (n: number, s: number) => (n >> s) & 255;
  let o = '#';
  for (const s of [16, 8, 0]) o += Math.round(ch(A, s) + (ch(Bn, s) - ch(A, s)) * t).toString(16).padStart(2, '0');
  return o;
}
/** R3's shade value of a colour (the lower-right wash, folds). */
export const shadeOf = (c: string): string => mixHex(c, '#1b1d26', 0.42);
/** R3's lit value of a colour (the upper-left wash). */
export const litOf = (c: string): string => mixHex(c, '#ffffff', 0.5);
/** The monsters' moonlit dry-brush colour. */
export const SHEEN = '#c9d6e6';
/** Hair's moonlit 飞白. */
export const HAIR_SHEEN = '#dfe6f2';

/** Frames of a companion token: 0 idle · 1, 2 walk steps · 3 hurt. */
export type Frame2 = 0 | 1 | 2 | 3;
export type FaceKind = 'dot' | 'fierce' | 'lady' | 'smile' | 'old';

export interface Body2Opt {
  /** Robe half-width at the hem, u (default 10). */
  robeW?: number;
  /** Hem y, u (default 13). */
  hem?: number;
  /** Head radius, u (default 8.4, R6). */
  head?: number;
  /** The robe's colour (default L.robe). */
  robe?: string;
  /** R7: a mid-value mass on the near (left) half of the robe (an over-robe or apron). */
  over?: string;
  /** The sash (default L.trim); `null` = no sash. */
  sash?: string | null;
  /** The contour's colour (default 焦墨; the rabbit uses a warm grey). */
  contour?: string;
  /** The collar's colour (default L.trim). */
  collar?: string;
  /** No front sleeve (a figure that paints its own arm). */
  noSleeve?: boolean;
  /** No hand at the sleeve's end. */
  noHand?: boolean;
  /** The pool of moonlight's rim (default L.accent). */
  pool?: string;
}
/** What body2 hands back: the head (centre, radius), the lean, the robe's top / hem / half-width and the hand. */
export interface Body2 {
  hx: number; hy: number; hr: number; lean: number;
  top: number; hem: number; rw: number;
  handX: number; handY: number;
}

/** A pool of moonlight under the companion (the one pale thing among 焦墨 enemies). */
export function pool2(b: B, y: number, rim: string): void {
  b.flat((g) => {
    g.fillStyle = '#f6f7fb'; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(0, y + 3, 13, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = rim === INK ? '#6f8ea6' : rim; g.globalAlpha = 0.75; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, y + 3, 13, 4.2, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }, [-13.8, y - 1.9, 13.8, y + 7.9]);
}

/**
 * The standing figure (R2, R3, R6): moonlight pool, feet (5.2 u), the robe with shade and lit washes and two
 * folds, the broken 焦墨 contour (1.6–2.2 u, dry 飞白 at the hem), an optional R7 over-robe, a sash, the front
 * sleeve with its own contour and a 3.2 u hand, the crossed collar with a white under-collar, and the head
 * (r 8.4) with a cheek shade and a 1.1 → 0.7 u contour over ≈ 210°. Faces right; `v` is the frame.
 * About 22 ops (2 washes).
 */
export function body2(b: B, L: CharLook, v: number, o: Body2Opt = {}): Body2 {
  const f = v as Frame2, hurt = f === 3;
  const lean = hurt ? -3 : f === 1 ? 1.2 : f === 2 ? 1.8 : 0;
  const rw = o.robeW ?? 10, hem = o.hem ?? 13, hr = o.head ?? 8.4;
  const robe = o.robe ?? L.robe, C = o.contour ?? INK, sh = shadeOf(robe);
  pool2(b, hem, o.pool ?? L.accent);
  const st = f === 1 ? 3 : f === 2 ? -3 : 0;
  b.dot(-3.5 + st, hem + 2.2, 5.2, 0.97, INK); b.dot(4.5 - st, hem + 2.2, 5.2, 0.97, INK);
  const top = -6;
  b.fill(robe, [[-rw * 0.62 + lean, top], [rw * 0.62 + lean, top], [rw * 0.9 + 1, hem * 0.5], [rw + 2.2, hem], [rw * 0.2, hem + 2], [-rw - 2.2, hem], [-rw * 0.9 - 1, hem * 0.5]], 0.96, 0.5);
  // R7: a mid-value over-robe on the near half, so a pale robe still has a shape on pale paper
  if (o.over) b.fill(o.over, [[-rw * 0.62 + lean, top], [-0.5 + lean, top], [-1.5, hem - 0.6], [-rw - 1.8, hem - 0.6], [-rw * 0.9 - 0.8, hem * 0.5]], 0.92, 0.4);
  b.wash(sh, [[rw * 0.15 + lean, top + 5], [rw * 0.62 + lean, top + 1], [rw + 2, hem], [rw * 0.2, hem + 1.6], [rw * 0.05, hem * 0.4]], 0.5, 1.2);
  b.wash(litOf(o.over ?? robe), [[-rw * 0.55 + lean, top + 1], [-1 + lean, top + 1], [-3, hem * 0.35], [-rw * 0.8, hem * 0.45]], 0.42, 1.2);
  b.brush([[1 + lean, 3, 1.2], [2.5, hem * 0.7, 1.1], [3.5, hem + 0.5, 0.5]], 0.6, sh);
  b.brush([[-3 + lean, 4, 1.1], [-5, hem * 0.75, 1], [-6.5, hem, 0.5]], 0.5, shadeOf(o.over ?? robe));
  // the broken contour: two sides and a dry hem (gaps at the shoulders and the hem's middle)
  b.brush([[-rw * 0.62 + lean, top + 0.5, 2], [-rw * 0.9 - 1.2, hem * 0.5, 1.8], [-rw - 2.4, hem + 0.3, 1.2]], 0.92, C);
  b.brush([[rw * 0.62 + lean, top + 0.5, 2.2], [rw * 0.9 + 1.2, hem * 0.5, 2], [rw + 2.4, hem + 0.3, 1.4]], 0.95, C);
  b.dry([[-rw - 2.2, hem + 0.4, 1.8], [rw * 0.2, hem + 2.1, 2], [rw + 2.2, hem + 0.4, 1.4]], 0.8, C, 0.45);
  const sash = o.sash === undefined ? L.trim : o.sash;
  if (sash) {
    b.brush([[-rw * 0.75 + lean, 2.5, 3], [rw * 0.75 + lean, 2, 3]], 0.94, sash);
    b.brush([[-rw * 0.4, 3, 2], [-rw * 0.6, 8, 1.8], [-rw * 0.5, 11.5, 0.6]], 0.9, sash);
  }
  const sw = hurt ? -4 : f === 1 ? 2 : f === 2 ? -2 : 0;
  const handX = rw + 2.2 + sw, handY = top + 13.4;
  if (!o.noSleeve) {
    b.brush([[rw * 0.5 + lean, top + 2, 4.6], [rw + 2.4 + sw * 0.4, top + 8, 4.4], [rw + 1.4 + sw, top + 12, 3.4]], 0.95, robe);
    b.brush([[rw * 0.9 + lean, top + 4, 1.4], [rw + 4.2 + sw * 0.4, top + 8.5, 1.3], [rw + 3.2 + sw, top + 13, 0.6]], 0.85, C);
    b.brush([[rw * 0.5 + lean, top + 5, 1.4], [rw + 1 + sw, top + 12.5, 0.8]], 0.5, sh);
    if (!o.noHand) b.dot(handX, handY, 3.2, 0.97, L.skin);
  }
  const collar = o.collar ?? L.trim;
  b.brush([[-2.2 + lean, top, 2.4], [2 + lean, top + 6, 2.6], [4.2 + lean, top + 10, 1.6]], 0.95, collar);
  b.brush([[-1 + lean, top + 0.4, 1], [2.6 + lean, top + 5.2, 1]], 0.9, '#fbfaf5');
  const hx = 1 + lean * 1.4, hy = top - hr + 0.8;
  b.fill(L.skin, ell(hx, hy, hr, hr * 1.02, 0, Math.PI * 2, 20), 0.97, 0.4);
  // the cheek's shade on the far side (a thin fill: washes are the slow part of a bake, R9)
  b.fill(shadeOf(L.skin), ell(hx - hr * 0.35, hy + hr * 0.3, hr * 0.5, hr * 0.5, 0, Math.PI * 2, 12), 0.28, 1);
  b.brush(arcW(hx, hy, hr + 0.2, hr * 1.02 + 0.2, -Math.PI * 0.1, Math.PI * 1.05, 1.1, 0.7, 12), 0.85, C);
  return { hx, hy, hr, lean, top, hem, rw, handX, handY };
}

/** Eyes looking right (3/4 view) with a glint (R5: r 1.35 + a white r 0.5), a mouth, a blush; shut on the hurt frame. */
export function face2(b: B, hx: number, hy: number, hr: number, v: number, kind: FaceKind = 'dot', blush = 0.35): void {
  const e = [hx + hr * 0.1, hx + hr * 0.62], y = hy + hr * 0.12;
  if (v === 3) {
    for (const x of e) b.brush([[x - 1.6, y - 1.2, 1], [x + 1.6, y + 0.6, 1]], 0.95, INK);
    b.brush([[e[1] - 1.2, y + 3.8, 0.9], [e[1] + 1.4, y + 3.3, 0.9]], 0.85, INK);
    return;
  }
  for (const x of e) {
    if (kind === 'smile') { b.brush([[x - 1.6, y + 0.2, 0.8], [x, y - 1.1, 1.2], [x + 1.6, y + 0.2, 0.8]], 0.97, INK); continue; }
    const r = kind === 'old' ? 1.1 : 1.35;
    b.disc(x, y, r, '#111');
    b.disc(x - r * 0.33, y - r * 0.37, r * 0.37, '#ffffff');
    if (kind === 'fierce') b.brush([[x - 2.2, y - 3.2, 1.3], [x + 1.8, y - 2, 0.7]], 0.97, INK);
    else if (kind === 'lady') b.brush([[x - 1.6, y - 1.6, 0.6], [x + 1.4, y - 1.9, 0.5]], 0.8, INK);
    else if (kind === 'old') b.brush([[x - 1.8, y - 2.4, 0.9], [x + 1.4, y - 2.1, 0.6]], 0.8, '#8a8a88');
  }
  b.brush([[hx + hr * 0.3, y + 3.4, 0.7], [hx + hr * 0.5, y + 3.8, 0.8]], 0.8, kind === 'lady' ? '#b8404e' : INK);
  if (blush > 0) b.dot(hx + hr * 0.6, y + 2.2, 3.4, blush, '#e08f85');
}

/** Hair as a cap on the back of the head, with an optional bun, and a moonlit 飞白 sheen across the crown. */
export function hair2(b: B, hx: number, hy: number, hr: number, color: string, bun = true): void {
  const pts: Pt[] = [...ell(hx - 0.8, hy - 0.5, hr + 1, hr * 1.1, Math.PI * 0.6, Math.PI * 1.92, 14), [hx + hr * 0.3, hy - hr * 0.35], [hx - hr * 0.25, hy + hr * 0.1]];
  b.fill(color, pts, 0.97, 0.4);
  const pale = isPale(color);
  const glint = pale ? '#9a9a96' : HAIR_SHEEN;
  if (bun) {
    b.dot(hx - hr * 0.45, hy - hr - 2.4, 7, 0.97, color);
    b.dry(arcW(hx - hr * 0.45, hy - hr - 2.4, 2.4, 2.4, Math.PI * 1.1, Math.PI * 1.7, 0.9, 0.5, 5), 0.6, glint, 0.4);
  }
  b.dry(arcW(hx - 0.8, hy - 0.5, hr - 1.2, hr * 1.1 - 1.2, Math.PI * 1.15, Math.PI * 1.6, 1.3, 0.6, 6), pale ? 0.45 : 0.55, glint, 0.5);
  // pale (white) hair needs an ink edge on pale paper (R11)
  if (pale) b.brush(arcW(hx - 0.8, hy - 0.5, hr + 1.1, hr * 1.1 + 0.1, Math.PI * 0.75, Math.PI * 1.55, 1.2, 0.7, 8), 0.7, '#6b665c');
}
function isPale(c: string): boolean {
  const n = parseInt(c.slice(1, 7), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 170;
}

/** A monster's moonlit dry-brush edge (R4): along the upper-left arc of an ellipse, w → 0.4 w. */
export function sheen(b: B, cx: number, cy: number, rx: number, ry: number, a0 = Math.PI * 1.05, a1 = Math.PI * 1.55, w = 1.8): void {
  b.dry(arcW(cx, cy, rx, ry, a0, a1, w, w * 0.4, 7), 0.55, SHEEN, 0.5);
}

/** Ringed eyes (R5): an ink ring 0.7 → white r (≥ 2.4 on monsters) → a pupil 0.58 r looking by `look` → a glint 0.2 r. */
export function eyes2(b: B, x: number, y: number, gap: number, r: number, look = 0.3, white = '#f6f1e4'): void {
  b.flat((g) => {
    for (const sx of [-1, 1]) {
      const ex = x + sx * gap;
      g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(ex, y, r + 0.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = white; g.beginPath(); g.arc(ex, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(ex + r * look, y + r * 0.12, r * 0.58, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + r * look - r * 0.22, y - r * 0.22, r * 0.2, 0, Math.PI * 2); g.fill();
    }
  }, [x - gap - r - 1, y - r - 1, x + gap + r + 1, y + r + 1]);
}

/** A splash of ink thrown off on the hurt frame (larger than the old 3 u, so it reads). */
export function hurtInk2(b: B, v: number): void {
  if (v !== 3) return;
  b.dot(-11, -4, 3.8, 0.75, INK); b.dot(-14, 2, 2.4, 0.65, INK); b.dot(-9, 8, 1.6, 0.55, INK);
}

/** A broad hat (斗笠 / 草帽) with lit and shade washes' worth of value in two fills, a 1.6–2.2 u brim and ribs. */
export function hat2(b: B, cx: number, cy: number, r: number, h: number, color: string): void {
  b.fill(color, [[cx - r - 1, cy + 1], [cx - r * 0.3, cy - h * 0.75], [cx, cy - h], [cx + r * 0.35, cy - h * 0.75], [cx + r + 1, cy + 1], [cx + r * 0.85, cy + 3], [cx - r * 0.8, cy + 3]], 0.96, 0.4);
  b.fill(litOf(color), [[cx - r * 0.75, cy - 0.5], [cx - r * 0.25, cy - h * 0.7], [cx + 0.5, cy - h * 0.88], [cx - r * 0.1, cy - 1.6]], 0.7, 0.6);
  b.fill(shadeOf(color), [[cx + r * 0.2, cy + 1.2], [cx + r * 0.4, cy - h * 0.55], [cx + r + 0.6, cy + 1], [cx + r * 0.8, cy + 2.6]], 0.5, 0.6);
  b.brush([[cx - r - 1.5, cy + 1.6, 1.8], [cx, cy + 3.6, 2.2], [cx + r + 1.5, cy + 1.6, 1.4]], 0.95, INK);
  for (const d of [-0.55, -0.2, 0.2, 0.55]) b.line([[cx + 0.5, cy - h + 1], [cx + d * r * 1.5, cy + 2]], 0.6, 0.45, shadeOf(color));
}
