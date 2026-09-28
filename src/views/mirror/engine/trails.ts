// 水月幻镜 · pooled ribbon trails (流光拖尾): flying swords leave long tapered ribbons of light (a
// luminous core, a soft halo, a fading edge), fast shots short streaks, the player's dash and leap a
// brush of light, a diving crane its path; orbiting blades draw analytic arc ribbons (no history).
// Points are recorded as the frame is drawn (one per simulation step at most), aged on simulation time
// (they hold with the hitstop), and each trail is one tapered polygon per pass (halo, body, core; ink
// trails body only). Everything lives in typed arrays sized once per quality; no allocation per frame.
import type { Camera, Quality } from '../types';
import { VFX_CAP } from './vfx';
import { VFX_BODY, VFX_CORE, VFX_EDGE, VFX_HALO } from '../paint/vfx';

/** Points kept per trail. */
export const TRAIL_PTS = 12;
/** Trail groups (who feeds them; each group is drawn in its own layer). */
export const TG = { shot: 0, player: 1, summon: 2 } as const;
/** Trail styles. */
export const TSY = { light: 0, ink: 1 } as const;
/** A trail continues only while its owner stays within this of its last point (else a new owner took the slot). */
const JUMP = 140;

export class Trails {
  q: Quality = 'mid';
  cap = 0;
  count = 0;
  alive!: Uint8Array;
  px!: Float32Array; py!: Float32Array; pt!: Float32Array;
  head!: Uint8Array; np!: Uint8Array;
  group!: Uint8Array; key!: Int32Array; fed!: Uint32Array;
  width!: Float32Array; dur!: Float32Array; tint!: Uint8Array; style!: Uint8Array;
  /** Owner → trail index, per group (grown on demand to the owner pool's size). */
  private maps: Int16Array[] = [new Int16Array(0), new Int16Array(1), new Int16Array(0)];
  /** The frame being drawn (a trail fed on the previous frame continues). */
  frame = 1;
  private lastT = 0;
  // scratch (screen px): points, widths, normals
  private readonly sx = new Float32Array(TRAIL_PTS + 2);
  private readonly sy = new Float32Array(TRAIL_PTS + 2);
  private readonly sw = new Float32Array(TRAIL_PTS + 2);
  private readonly nx = new Float32Array(TRAIL_PTS + 2);
  private readonly ny = new Float32Array(TRAIL_PTS + 2);
  /** Stats (dev): trails fed this frame, refused for want of room. */
  fedN = 0; refused = 0;

  constructor(q: Quality) { this.build(q); }

  private build(q: Quality): void {
    this.q = q;
    const cap = (VFX_CAP[q] ?? VFX_CAP.mid).trails;
    this.cap = cap; this.count = 0;
    const P = cap * TRAIL_PTS;
    this.alive = new Uint8Array(cap);
    this.px = new Float32Array(P); this.py = new Float32Array(P); this.pt = new Float32Array(P);
    this.head = new Uint8Array(cap); this.np = new Uint8Array(cap);
    this.group = new Uint8Array(cap); this.key = new Int32Array(cap); this.fed = new Uint32Array(cap);
    this.width = new Float32Array(cap); this.dur = new Float32Array(cap); this.tint = new Uint8Array(cap); this.style = new Uint8Array(cap);
    for (const m of this.maps) m.fill(-1);
  }

  /** A new frame: follow the quality, clear on a new wave (the world clock restarts). */
  begin(q: Quality, t: number): void {
    if (q !== this.q) this.build(q);
    if (t < this.lastT - 0.25) this.clear();
    this.lastT = t;
    this.frame = (this.frame + 1) >>> 0 || 1;
    this.fedN = 0;
  }
  clear(): void {
    this.alive.fill(0); this.count = 0; this.np.fill(0);
    for (const m of this.maps) m.fill(-1);
  }

  /**
   * Feed owner `key` of `group` at (x, y), simulation time t: continues its trail (fed last frame, no
   * jump) or starts one. `lim` caps the live trails (the frame guard halves it). Returns the trail or −1.
   */
  feed(group: number, key: number, x: number, y: number, t: number, width: number, dur: number, tint: number, style: number, lim = this.cap, jump = JUMP): number {
    let m = this.maps[group];
    if (key >= m.length) { const n = new Int16Array(Math.max(key + 1, m.length * 2, 16)).fill(-1); n.set(m); this.maps[group] = m = n; }
    let i = m[key];
    if (i >= 0 && (!this.alive[i] || this.group[i] !== group || this.key[i] !== key || this.fed[i] !== ((this.frame - 1) >>> 0) && this.fed[i] !== this.frame)) i = -1;
    if (i >= 0 && this.np[i] > 0) {
      const h = i * TRAIL_PTS + this.head[i];
      const dx = x - this.px[h], dy = y - this.py[h];
      if (dx * dx + dy * dy > jump * jump) i = -1;
    }
    if (i < 0) {
      if (this.count >= Math.min(lim, this.cap)) this.reap(t);
      if (this.count >= Math.min(lim, this.cap)) { this.refused++; m[key] = -1; return -1; }
      i = this.alive.indexOf(0);
      if (i < 0) { this.refused++; return -1; }
      this.alive[i] = 1; this.count++;
      this.np[i] = 0; this.head[i] = 0; this.group[i] = group; this.key[i] = key;
      m[key] = i;
    }
    this.fed[i] = this.frame;
    this.width[i] = width; this.dur[i] = dur; this.tint[i] = tint; this.style[i] = style;
    this.fedN++;
    const base = i * TRAIL_PTS;
    if (this.np[i] > 0) {
      const h = base + this.head[i];
      const dx = x - this.px[h], dy = y - this.py[h];
      if (dx * dx + dy * dy < 0.25 || t - this.pt[h] < dur / (TRAIL_PTS - 1) * 0.8) {
        // too close in space or time: the head moves (a still owner's trail drains away behind it)
        this.px[h] = x; this.py[h] = y;
        if (dx * dx + dy * dy < 0.25) this.pt[h] = t;
        return i;
      }
      this.head[i] = (this.head[i] + 1) % TRAIL_PTS;
    }
    const h = base + this.head[i];
    this.px[h] = x; this.py[h] = y; this.pt[h] = t;
    if (this.np[i] < TRAIL_PTS) this.np[i]++;
    return i;
  }

  /** Owner `key` of `group` is someone new (a pool slot reused): its old trail fades on unfed. */
  cut(group: number, key: number): void {
    const m = this.maps[group];
    if (key < m.length) m[key] = -1;
  }
  /** Live trails of a group (dev, tests). */
  live(group: number): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.alive[i] && this.group[i] === group) n++;
    return n;
  }

  /** Release every trail whose newest point has aged past its length. */
  reap(t: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const h = i * TRAIL_PTS + this.head[i];
      if (this.np[i] === 0 || t - this.pt[h] > this.dur[i] || t < this.pt[h] - 0.25) { this.alive[i] = 0; this.count--; }
    }
  }

  /** Where the trail was `age` s ago (for afterimages), into out; false when it has no such point. */
  sample(i: number, t: number, age: number, out: { x: number; y: number }): boolean {
    if (i < 0 || !this.alive[i] || this.np[i] < 2) return false;
    const base = i * TRAIL_PTS, n = this.np[i];
    let prev = -1;
    for (let k = 0; k < n; k++) {
      const j = base + ((this.head[i] - k + TRAIL_PTS) % TRAIL_PTS);
      const a = t - this.pt[j];
      if (a >= age) {
        if (prev < 0) { out.x = this.px[j]; out.y = this.py[j]; return true; }
        const ap = t - this.pt[prev], f = a - ap > 1e-5 ? (age - ap) / (a - ap) : 0;
        out.x = this.px[prev] + (this.px[j] - this.px[prev]) * f; out.y = this.py[prev] + (this.py[j] - this.py[prev]) * f;
        return true;
      }
      prev = j;
    }
    return false;
  }

  /** Draw the trails of one group (and let the finished ones go). `passes` 2 (body, core) or 3 (+ halo). */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, t: number, group: number, passes: number, alpha = 1): void {
    if (!this.count) return;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || this.group[i] !== group) continue;
      const m = this.fill(i, cam, t);
      if (m < 0) { this.alive[i] = 0; this.count--; continue; }
      if (m < 1) continue;
      this.ribbon(ctx, m, this.tint[i], this.style[i], passes, alpha, cam.dpr || 1);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * An arc ribbon behind a blade orbiting (cx, cy) at radius R, its head at angle aH, trailing `len`
   * rad against the spin (sign); width w (u). No history: the orbit is the path.
   */
  arc(ctx: CanvasRenderingContext2D, cam: Camera, cx: number, cy: number, R: number, aH: number, len: number, sign: number, w: number, tint: number, passes: number, alpha = 1): void {
    const n = 8;
    const k0 = cam.scale;
    const ox = (cx - cam.x) * k0 + cam.w / 2, oy = (cy - cam.y) * k0 + cam.h / 2;
    const Rs = R * k0;
    if (ox + Rs < -20 || oy + Rs < -20 || ox - Rs > cam.w + 20 || oy - Rs > cam.h + 20) return;
    for (let k = 0; k <= n; k++) {
      const p = k / n; // 0 tail … 1 head
      const a = aH - sign * len * (1 - p);
      this.sx[k] = ox + Math.cos(a) * Rs; this.sy[k] = oy + Math.sin(a) * Rs;
      this.sw[k] = w * k0 * Math.pow(p, 0.9);
    }
    this.normals(n);
    this.ribbon(ctx, n, tint, 0, passes, alpha, cam.dpr || 1);
    ctx.globalAlpha = 1;
  }

  /** Trail i into the scratch (screen px), oldest → newest; the index of the last point, −1 when finished. */
  private fill(i: number, cam: Camera, t: number): number {
    const base = i * TRAIL_PTS, n = this.np[i], dur = this.dur[i], k0 = cam.scale;
    if (n === 0) return -1;
    const newest = base + this.head[i];
    if (t - this.pt[newest] > dur || t < this.pt[newest] - 0.25) return -1;
    let m = -1;
    let px = 0, py = 0, pa = 0, have = false;
    for (let k = n - 1; k >= 0; k--) {
      const j = base + ((this.head[i] - k + TRAIL_PTS) % TRAIL_PTS);
      const age = t - this.pt[j];
      if (age >= dur) { px = this.px[j]; py = this.py[j]; pa = age; have = true; continue; }
      if (have && m < 0) {
        // the tail: exactly at the trail's length, between the last point too old and this one
        const f = pa - age > 1e-5 ? (pa - dur) / (pa - age) : 0;
        m++;
        this.sx[m] = (px + (this.px[j] - px) * f - cam.x) * k0 + cam.w / 2;
        this.sy[m] = (py + (this.py[j] - py) * f - cam.y) * k0 + cam.h / 2;
        this.sw[m] = 0;
      }
      m++;
      this.sx[m] = (this.px[j] - cam.x) * k0 + cam.w / 2;
      this.sy[m] = (this.py[j] - cam.y) * k0 + cam.h / 2;
      this.sw[m] = this.width[i] * k0 * Math.pow(Math.max(0, 1 - age / dur), 0.85);
    }
    if (m < 1) return 0;
    // off screen: skip (bounding box of the points)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k <= m; k++) { const x = this.sx[k], y = this.sy[k]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < -30 || y1 < -30 || x0 > cam.w + 30 || y0 > cam.h + 30) return 0;
    this.normals(m);
    return m;
  }

  private normals(m: number): void {
    let lx = 0, ly = 1;
    for (let k = 0; k <= m; k++) {
      const a = k > 0 ? k - 1 : 0, b = k < m ? k + 1 : m;
      const dx = this.sx[b] - this.sx[a], dy = this.sy[b] - this.sy[a];
      const L = Math.hypot(dx, dy);
      if (L > 1e-3) { lx = -dy / L; ly = dx / L; }
      this.nx[k] = lx; this.ny[k] = ly;
    }
  }

  private ribbon(ctx: CanvasRenderingContext2D, m: number, tint: number, style: number, passes: number, alpha: number, d: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (style === TSY.ink) {
      this.path(ctx, m, 1.35, 0.8 * d); this.paint(ctx, VFX_EDGE, alpha * 0.14);
      this.path(ctx, m, 1, 0); this.paint(ctx, VFX_BODY[tint], alpha * 0.62);
      return;
    }
    // a wide soft halo, the saturated body, a white-hot core that runs the whole length
    if (passes >= 3) { this.path(ctx, m, 2.7, 2 * d); this.paint(ctx, VFX_HALO[tint], alpha * 0.3); }
    this.path(ctx, m, 1, 0.4 * d); this.paint(ctx, VFX_BODY[tint], alpha * 0.8);
    this.path(ctx, m, 0.4, 0.6 * d, 1 * d); this.paint(ctx, VFX_CORE[tint], alpha);
  }
  /** The tapered polygon: widths × k plus `add` px (tapering with them), at least `min` px where the trail has width. */
  private path(ctx: CanvasRenderingContext2D, m: number, k: number, add: number, min = 0): void {
    ctx.beginPath();
    for (let j = 0; j <= m; j++) {
      const w0 = this.sw[j];
      const hw = w0 > 0 ? Math.max(min, w0 * k + add * Math.min(1, w0 / Math.max(1e-3, this.sw[m]))) * 0.5 : 0;
      const x = this.sx[j] + this.nx[j] * hw, y = this.sy[j] + this.ny[j] * hw;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    // a rounded point ahead of the head
    const hw = Math.max(min, this.sw[m] * k + add) * 0.5;
    ctx.lineTo(this.sx[m] + this.ny[m] * hw * 0.9, this.sy[m] - this.nx[m] * hw * 0.9);
    for (let j = m; j >= 0; j--) {
      const w0 = this.sw[j];
      const hw2 = w0 > 0 ? Math.max(min, w0 * k + add * Math.min(1, w0 / Math.max(1e-3, this.sw[m]))) * 0.5 : 0;
      ctx.lineTo(this.sx[j] - this.nx[j] * hw2, this.sy[j] - this.ny[j] * hw2);
    }
    ctx.closePath();
  }
  private paint(ctx: CanvasRenderingContext2D, col: string, a: number): void {
    if (a <= 0.01) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = col;
    ctx.fill();
  }
}
