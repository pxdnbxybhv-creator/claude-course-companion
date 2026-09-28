// 水月幻镜 · off-screen threats (the owner's feedback: 「当前视角过小，经常超视距攻击」). When something that
// can hurt you is outside the picture — an enemy winding up to fire or strike (its tell), an enemy shot
// on its way to you, an elite, the boss — a small vermilion ink chevron sits at the screen's edge on the
// line from you to it, pointing at it: larger and bolder the closer it is, the boss's doubled. A shot's
// chevron has the enemy shots' own white core in a 朱砂 rim. Capped by quality (the frame guard halves
// it), the most urgent first, one per direction; a tell pulses gently, never under reduced motion.
//
// The HUD: the UI hands the engine the rectangles its HUD covers (MirrorEngine.setHudRects, css px);
// no chevron is drawn under one (it is pulled back along its ray to just inside the rectangle's edge),
// and a threat under one counts as off the picture. Until the UI does, a default stands in for today's
// HUD: the top row (68 css px) and the 镇 button's corner (bottom right, 104 × 108).
//
// Pooled: the candidates go through fixed typed arrays (a top-K insertion), the two chevrons are baked
// once per renderer at the screen's resolution (drawn ≤ 1:1); a frame is ≤ 8 setTransform + drawImage.
import type { Camera } from '../types';
import { EKind } from './pools';
import { ST } from './enemies';
import type { World } from './world';

/** Chevrons on screen at most, by quality. */
export const THREAT_CAP = { low: 4, mid: 6, high: 8 } as const;
/** Kinds, most urgent last (the priority's base): an enemy's tell, a shot on its way, an elite, the boss. */
export const TK = { tell: 0, shot: 1, elite: 2, boss: 3 } as const;
const BASE = [80, 70, 55, 100] as const;
/** A shot threatens you when it will pass within this many u of you (plus its radius) within SHOT_T s. */
const SHOT_NEAR = 70;
const SHOT_T = 3;
/** Past this distance beyond the edge a chevron is at its smallest. */
const FAR_U = 700;
/** Chevron size (css px, tip to tail) at its nearest and farthest; the boss and elites a size up. */
const SIZE_NEAR = 26;
const SIZE_FAR = 16;
/** Insets from the screen's edges (css px): sides, top, bottom. */
const INSET_X = 20;
const INSET_TOP = 30;
const INSET_BOT = 34;
/** A chevron's centre keeps this far (css px) outside a HUD rectangle. */
const HUD_PAD = 16;
/** HUD rectangles kept at most. */
const HUD_MAX = 8;
/** A HUD rectangle in css px from the canvas's top-left (MirrorEngine.setHudRects). */
export interface HudRect { x: number; y: number; w: number; h: number }
/** Today's HUD when the UI has handed none: the top row (y 4–65 css px on every screen) and the 镇
 *  button's corner at the bottom right (72 px at 22 / 26 px from the edges). Negative x / y: from the
 *  right / bottom edge. */
export const HUD_DEFAULT: readonly HudRect[] = [{ x: 0, y: 0, w: 1e5, h: 68 }, { x: -104, y: -108, w: 104, h: 108 }];
/** Two chevrons closer than this (css px) are one: the more urgent is drawn. */
const MERGE_PX = 24;
const MAX = 8;

export class Threats {
  private n = 0;
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly pr = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX);
  private readonly dx = new Float32Array(MAX);
  private readonly dy = new Float32Array(MAX);
  private chevron: HTMLCanvasElement | null = null;
  private chevronShot: HTMLCanvasElement | null = null;
  private bakedPx = 0;
  /** HUD rectangles (css px; negative x / y from the right / bottom), HUD_DEFAULT until the UI's. */
  private readonly hud = new Float32Array(HUD_MAX * 4);
  private hudN = 0;
  /** The HUD rectangles in canvas px for this frame. */
  private readonly hudPx = new Float32Array(HUD_MAX * 4);
  /** Chevrons drawn last frame (tests, the dev probe). */
  drawn = 0;

  constructor() { this.setHud(null); }

  /**
   * The rectangles the UI's HUD covers, in css px from the canvas's top-left (null or none: HUD_DEFAULT;
   * [] after an explicit empty list: none). Negative x / y count from the right / bottom edge. At most
   * HUD_MAX; no allocation afterwards.
   */
  setHud(rects: readonly HudRect[] | null): void {
    const src = rects ?? HUD_DEFAULT;
    let n = 0;
    for (const r of src) {
      if (n >= HUD_MAX) break;
      if (!r || !(r.w > 0) || !(r.h > 0) || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
      this.hud[n * 4] = r.x; this.hud[n * 4 + 1] = r.y; this.hud[n * 4 + 2] = r.w; this.hud[n * 4 + 3] = r.h;
      n++;
    }
    this.hudN = n;
  }
  /** The HUD rectangles in use (tests): css px as given. */
  hudRects(): HudRect[] {
    const out: HudRect[] = [];
    for (let k = 0; k < this.hudN; k++) out.push({ x: this.hud[k * 4], y: this.hud[k * 4 + 1], w: this.hud[k * 4 + 2], h: this.hud[k * 4 + 3] });
    return out;
  }
  /** The HUD rectangles → canvas px for this frame's size (negative: from the right / bottom). */
  private hudToPx(cam: Camera): void {
    const d = cam.dpr, cw = cam.w, ch = cam.h;
    for (let k = 0; k < this.hudN; k++) {
      const o = k * 4, x = this.hud[o] * d, y = this.hud[o + 1] * d;
      this.hudPx[o] = x < 0 ? cw + x : x;
      this.hudPx[o + 1] = y < 0 ? ch + y : y;
      this.hudPx[o + 2] = this.hud[o + 2] * d;
      this.hudPx[o + 3] = this.hud[o + 3] * d;
    }
  }
  /** Whether the canvas-px point lies under a HUD rectangle. */
  private underHud(x: number, y: number): boolean {
    const R = this.hudPx;
    for (let k = 0; k < this.hudN; k++) {
      const o = k * 4;
      if (x >= R[o] && x <= R[o] + R[o + 2] && y >= R[o + 1] && y <= R[o + 1] + R[o + 3]) return true;
    }
    return false;
  }
  /**
   * The ray from (cx, cy) along (vx, vy) ends at t; pull t back to just before the first HUD rectangle
   * (grown by `pad`) it runs into. A rectangle the ray starts inside (you, under the HUD) is ignored.
   */
  private clearHud(cx: number, cy: number, vx: number, vy: number, t: number, pad: number): number {
    const R = this.hudPx;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < this.hudN; k++) {
        const o = k * 4;
        const x0 = R[o] - pad, x1 = R[o] + R[o + 2] + pad, y0 = R[o + 1] - pad, y1 = R[o + 1] + R[o + 3] + pad;
        let tin = -Infinity, tout = Infinity;
        if (Math.abs(vx) < 1e-6) { if (cx < x0 || cx > x1) continue; } else {
          const a = (x0 - cx) / vx, b = (x1 - cx) / vx;
          tin = Math.max(tin, Math.min(a, b)); tout = Math.min(tout, Math.max(a, b));
        }
        if (Math.abs(vy) < 1e-6) { if (cy < y0 || cy > y1) continue; } else {
          const a = (y0 - cy) / vy, b = (y1 - cy) / vy;
          tin = Math.max(tin, Math.min(a, b)); tout = Math.min(tout, Math.max(a, b));
        }
        if (tin >= tout || tin <= 0 || tin >= t) continue;
        t = tin;
      }
    }
    return t;
  }

  /** The 'threats' layer (last: over the edge masks and titles). */
  draw(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    this.drawn = 0;
    if (W.phase !== 'wave') return;
    const cap = Math.min(MAX, (THREAT_CAP[W.quality] ?? 6) >> (W.degrade ? 1 : 0));
    this.hudToPx(cam);
    if (!this.gather(W, cam, cap)) return;
    const d = cam.dpr, calm = !!W.settings.reduceMotion;
    // baked once for the screen's resolution: the biggest chevron (the boss's, 26 × 1.2 css px) drawn ≤ 1:1
    const px = chevPx(d);
    if (px > this.bakedPx) { this.bakedPx = px; this.chevron = bakeChevron(false, px); this.chevronShot = bakeChevron(true, px); }
    // the ray starts at you (where the picture's danger is measured from)
    const ox = (W.px - cam.x) * cam.scale + cam.w / 2, oy = (W.py - cam.y) * cam.scale + cam.h / 2;
    const x0 = INSET_X * d, x1 = cam.w - INSET_X * d, y0 = INSET_TOP * d, y1 = cam.h - INSET_BOT * d;
    if (x1 <= x0 || y1 <= y0) return;
    const cx = Math.max(x0, Math.min(x1, ox)), cy = Math.max(y0, Math.min(y1, oy));
    const merge2 = (MERGE_PX * d) ** 2;
    for (let j = 0; j < this.n; j++) {
      const tx = (this.x[j] - cam.x) * cam.scale + cam.w / 2, ty = (this.y[j] - cam.y) * cam.scale + cam.h / 2;
      let vx = tx - cx, vy = ty - cy;
      const len = Math.hypot(vx, vy);
      if (len < 1) continue;
      vx /= len; vy /= len;
      // where the ray from you meets the inset rect
      let t = Infinity;
      if (vx > 1e-6) t = Math.min(t, (x1 - cx) / vx); else if (vx < -1e-6) t = Math.min(t, (x0 - cx) / vx);
      if (vy > 1e-6) t = Math.min(t, (y1 - cy) / vy); else if (vy < -1e-6) t = Math.min(t, (y0 - cy) / vy);
      if (!Number.isFinite(t)) continue;
      // never under the HUD: back along the ray to just inside the rectangle it would sit under
      if (this.hudN) t = this.clearHud(cx, cy, vx, vy, t, HUD_PAD * d);
      const ex = cx + vx * t, ey = cy + vy * t;
      // one per direction: the more urgent (earlier in the list) wins
      let dup = false;
      for (let q = 0; q < this.drawn; q++) { const ax = this.dx[q] - ex, ay = this.dy[q] - ey; if (ax * ax + ay * ay < merge2) { dup = true; break; } }
      if (dup) continue;
      this.dx[this.drawn] = ex; this.dy[this.drawn] = ey; this.drawn++;
      // size and weight by how far past the edge it is (world u)
      const beyond = Math.max(0, (Math.hypot(tx - ex, ty - ey)) / cam.scale);
      const near = 1 - Math.min(1, beyond / FAR_U);
      const k = this.kind[j];
      const big = k === TK.boss || k === TK.elite ? 1.2 : k === TK.shot ? 0.85 : 1;
      const size = (SIZE_FAR + (SIZE_NEAR - SIZE_FAR) * near) * big * d;
      let a = 0.62 + 0.33 * near;
      if (k === TK.tell && !calm) a *= 0.78 + 0.22 * Math.sin(W.t * 11 + j * 1.7);
      const img = k === TK.shot ? this.chevronShot : this.chevron;
      const ang = Math.atan2(vy, vx);
      this.put(ctx, img, ex - vx * size * 0.1, ey - vy * size * 0.1, ang, size, a);
      // the boss: a second chevron behind the first
      if (k === TK.boss) this.put(ctx, img, ex - vx * size * 0.62, ey - vy * size * 0.62, ang, size * 0.8, a * 0.75);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** One chevron centred at (x, y) px, pointing along `ang`, `size` px tip to tail. */
  private put(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | null, x: number, y: number, ang: number, size: number, a: number): void {
    const c = Math.cos(ang), s = Math.sin(ang);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    if (img) {
      const P = img.width;
      const k = size / (P * CHEV_SPAN);
      ctx.setTransform(c * k, s * k, -s * k, c * k, x, y);
      ctx.drawImage(img, -P / 2, -P / 2);
      return;
    }
    // no canvas to bake into: a flat vector chevron (same shape)
    ctx.setTransform(c, s, -s, c, x, y);
    const h = size / 2;
    ctx.fillStyle = '#c0412f';
    ctx.beginPath(); ctx.moveTo(h, 0); ctx.lineTo(-h, -h * 0.8); ctx.lineTo(-h * 0.1, 0); ctx.lineTo(-h, h * 0.8); ctx.closePath(); ctx.fill();
  }

  /** The most urgent off-screen threats into the top-K arrays; false when there are none. */
  private gather(W: World, cam: Camera, cap: number): boolean {
    this.n = 0;
    const E = W.E, ES = W.ES, px = W.px, py = W.py;
    const s = cam.scale, hw = cam.w / 2, hh = cam.h / 2;
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.hidden[i]) continue;
      const k = E.kind[i];
      if (k === EKind.Ally || k === EKind.Treasure || E.charmT[i] > 0 || E.st[i] === ST.bloom || E.st[i] === ST.dying) continue;
      const boss = k === EKind.Boss && !E.decoy[i];
      const elite = k === EKind.Elite || k === EKind.Demon;
      const tell = E.st[i] === ST.tell;
      if (!boss && !elite && !tell) continue;
      const m = E.r[i] * s;
      const sx = (E.x[i] - cam.x) * s + hw, sy = (E.y[i] - cam.y) * s + hh;
      // in the picture and not under the HUD: seen
      if (sx >= -m && sx <= cam.w + m && sy >= -m && sy <= cam.h + m && !this.underHud(sx, sy)) continue;
      const d = Math.hypot(E.x[i] - px, E.y[i] - py);
      const kind = boss ? TK.boss : tell ? TK.tell : TK.elite;
      this.offer(E.x[i], E.y[i], BASE[kind] + (1 - Math.min(1, d / 1400)) * 20, kind, cap);
    }
    for (let i = 0; i < ES.n; i++) {
      if (!ES.alive[i]) continue;
      const x = ES.x[i], y = ES.y[i];
      const sx = (x - cam.x) * s + hw, sy = (y - cam.y) * s + hh, m = ES.r[i] * s;
      if (sx >= -m && sx <= cam.w + m && sy >= -m && sy <= cam.h + m && !this.underHud(sx, sy)) continue;
      const vx = ES.vx[i], vy = ES.vy[i], v = Math.hypot(vx, vy);
      if (v < 1) continue;
      const rx = px - x, ry = py - y;
      const along = (rx * vx + ry * vy) / v;
      if (along <= 0) continue; // moving away
      const t = along / v;
      if (t > SHOT_T) continue;
      const miss = Math.abs(rx * vy - ry * vx) / v;
      if (miss > SHOT_NEAR + ES.r[i]) continue;
      this.offer(x, y, BASE[TK.shot] + (1 - t / SHOT_T) * 25, TK.shot, cap);
    }
    return this.n > 0;
  }

  /** Insert into the top-K list (descending priority), no allocation. */
  private offer(x: number, y: number, p: number, kind: number, cap: number): void {
    let j = this.n;
    if (j >= cap) { if (p <= this.pr[cap - 1]) return; j = cap - 1; } else this.n++;
    while (j > 0 && this.pr[j - 1] < p) {
      this.x[j] = this.x[j - 1]; this.y[j] = this.y[j - 1]; this.pr[j] = this.pr[j - 1]; this.kind[j] = this.kind[j - 1];
      j--;
    }
    this.x[j] = x; this.y[j] = y; this.pr[j] = p; this.kind[j] = kind;
  }

  /** The chosen threats (tests): world x, y, kind, most urgent first. */
  list(): { x: number; y: number; kind: number }[] {
    const out: { x: number; y: number; kind: number }[] = [];
    for (let j = 0; j < this.n; j++) out.push({ x: this.x[j], y: this.y[j], kind: this.kind[j] });
    return out;
  }
}

/** The part of the baked canvas the shape spans tip to tail. */
const CHEV_SPAN = 0.66;
/** The baked chevron's canvas size (px) for a canvas dpr: the largest drawn (the boss's 26 × 1.2 css px
 *  tip to tail) at ≤ 1:1, in steps of 32 px (64 at dpr 1, 96 at 2, 160 at 3). */
export function chevPx(dpr: number): number {
  const need = (SIZE_NEAR * 1.2 * Math.max(1, dpr || 1)) / CHEV_SPAN;
  return Math.max(64, Math.min(256, Math.ceil(need / 32) * 32));
}
/**
 * A chevron pointing along +x, in ink: a dark wet edge, a vermilion body (a shot's: a white core in a
 * 朱砂 rim, like the enemy shots), a paper hairline inside so it reads on dark ground too. A deep notch
 * at the tail, so its direction reads at 16 css px (a shallow one read as a solid triangle). Baked
 * once per resolution.
 */
function bakeChevron(shot: boolean, P: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let c: HTMLCanvasElement;
  try { c = document.createElement('canvas'); } catch { return null; }
  c.width = P; c.height = P;
  const g = c.getContext('2d');
  if (!g) return null;
  // tip at the right; arms swept back; a deep notch at the tail (a brush-cut arrowhead, slightly uneven)
  const path = () => {
    g.beginPath();
    g.moveTo(P * 0.86, P * 0.5);
    g.lineTo(P * 0.2, P * 0.17);
    g.quadraticCurveTo(P * 0.34, P * 0.38, P * 0.48, P * 0.5);
    g.quadraticCurveTo(P * 0.35, P * 0.63, P * 0.21, P * 0.84);
    g.closePath();
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  path();
  g.strokeStyle = 'rgba(26,18,16,0.85)';
  g.lineWidth = P * 0.13;
  g.stroke();
  if (shot) {
    g.strokeStyle = '#c0412f';
    g.lineWidth = P * 0.08;
    g.stroke();
    g.fillStyle = '#fffaf2';
    g.fill();
  } else {
    g.fillStyle = '#c0412f';
    g.fill();
    // a paper hairline along the leading edges (reads on dark ground)
    g.beginPath();
    g.moveTo(P * 0.27, P * 0.26); g.lineTo(P * 0.74, P * 0.5); g.lineTo(P * 0.28, P * 0.75);
    g.strokeStyle = 'rgba(246,238,222,0.55)';
    g.lineWidth = P * 0.025;
    g.stroke();
  }
  return c;
}
