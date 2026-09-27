// 水月幻镜 · player-side light (流光) sprites and palette for the VFX layer (engine/vfx.ts, engine/trails.ts):
// the soft pieces that must not be drawn as vectors every frame — a radial glow (white-hot core → the
// tint → nothing), the halo band of a shockwave, a column of light, and the ground's scorch, burn and
// crack stains. Everything crisp (ring edges, crescents, lances, lightning, ribbons) is a vector path
// drawn with the flat colours below. Gradients exist only here, at bake time; each sprite is a small
// canvas of its own (≤ 192 px), baked once per wave behind the wave start (warm), never mid-frame.
// Colours: ink on paper, and light that reads on paper — a near-white core, a saturated class body
// and a soft halo, with an ink hairline where the tint is pale. No tint here is vermilion: danger is
// the enemy's colour alone. Node-safe: without a document every sprite is null and the engine draws
// only its vectors.
import type { Quality, Sprite } from '../types';

/** VFX tints (player-side light). */
export const VT = {
  azure: 0, jade: 1, gold: 2, moon: 3, ink: 4, wine: 5, indigo: 6, green: 7, gamboge: 8, white: 9,
} as const;
export const NVT = 10;
/** The soft outer glow of each tint. */
export const VFX_HALO: readonly string[] = ['#7cc8ff', '#6fe3bd', '#ffd66e', '#c9dcff', '#34343e', '#df8fb6', '#9cb2ff', '#a4e4ab', '#ffd452', '#ffffff'];
/** The saturated body of each tint (what reads on pale paper). */
export const VFX_BODY: readonly string[] = ['#2582cc', '#139f73', '#d4930c', '#6f93d2', '#1b1916', '#8a2a56', '#3551a4', '#3f9c5c', '#dc9a00', '#dfe9fb'];
/** The near-white core of each tint (ink keeps a grey core: wet ink has no light in it). */
export const VFX_CORE: readonly string[] = ['#f2faff', '#effff8', '#fffbe4', '#ffffff', '#54545e', '#fff0f6', '#eef2ff', '#f3fff4', '#fff9dc', '#ffffff'];
/** Ink hairline for definition on paper. */
export const VFX_EDGE = 'rgba(27,25,22,1)';
/** Tints drawn as ink (no white core, no light). */
export const isInkTint = (t: number): boolean => t === VT.ink;

/** Ground stains (scorch: ink, burn: talisman fire, crack: a heavy blow's cracks). */
export const STAIN = { scorch: 0, burn: 1, crack: 2 } as const;

/** Baked sizes (px) by quality: soft pieces are drawn scaled, so small is fine (blur never shows). */
const SIZE = {
  low: { glow: 40, ring: 128, col: [32, 112], stain: 96 },
  mid: { glow: 64, ring: 160, col: [40, 144], stain: 128 },
  high: { glow: 64, ring: 192, col: [48, 176], stain: 128 },
} as const;

/** The ring sprite's leading edge sits at this fraction of its half-size (the vector edge is drawn there). */
export const RING_EDGE = 0.86;

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function h01(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class VfxSprites {
  readonly ok: boolean;
  private glows: (Sprite | null)[] = [];
  private rings: (Sprite | null)[] = [];
  private cols: (Sprite | null)[] = [];
  private stains: (Sprite | null)[] = [];
  private canvases: HTMLCanvasElement[] = [];
  /** Bytes held (dev, the memory probe). */
  bytes = 0;

  constructor(readonly quality: Quality) {
    this.ok = typeof document !== 'undefined';
  }

  /** Bake everything (the wave start calls this before the first frame draws from any of it). */
  warm(): void {
    if (!this.ok || this.glows.length) return;
    const S = SIZE[this.quality] ?? SIZE.mid;
    try {
      for (let t = 0; t < NVT; t++) {
        this.glows[t] = this.glow(t, S.glow);
        this.rings[t] = t === VT.ink ? this.ring(t, S.ring) : this.ring(t, S.ring);
        this.cols[t] = t === VT.gold || t === VT.moon || t === VT.azure || t === VT.jade ? this.column(t, S.col[0], S.col[1]) : null;
      }
      for (let k = 0; k < 3; k++) this.stains[k] = this.stain(k, S.stain);
    } catch { /* no canvas: vectors only */ }
  }

  /** A radial glow (32 u across at size 1): core → body → halo → nothing. */
  glow(t: number): Sprite | null;
  glow(t: number, px: number): Sprite | null;
  glow(t: number, px?: number): Sprite | null {
    if (px === undefined) return this.glows[t] ?? null;
    const c = this.canvas(px, px);
    if (!c) return null;
    const g = c.getContext('2d')!;
    const r = px / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    if (t === VT.ink) {
      grad.addColorStop(0, 'rgba(20,18,16,0.55)'); grad.addColorStop(0.45, 'rgba(24,22,20,0.28)'); grad.addColorStop(1, 'rgba(24,22,20,0)');
    } else {
      grad.addColorStop(0, hexA(VFX_CORE[t], 1));
      grad.addColorStop(0.16, hexA(VFX_CORE[t], 0.95));
      grad.addColorStop(0.3, hexA(VFX_BODY[t], 0.62));
      grad.addColorStop(0.58, hexA(VFX_HALO[t], 0.24));
      grad.addColorStop(1, hexA(VFX_HALO[t], 0));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, px, px);
    return this.sprite(c, 32, 32);
  }
  /** A shockwave's soft band (the leading edge at RING_EDGE of the half-size), 64 u across at size 1. */
  ring(t: number): Sprite | null;
  ring(t: number, px: number): Sprite | null;
  ring(t: number, px?: number): Sprite | null {
    if (px === undefined) return this.rings[t] ?? null;
    const c = this.canvas(px, px);
    if (!c) return null;
    const g = c.getContext('2d')!;
    const r = px / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    const e = RING_EDGE;
    const col = t === VT.ink ? '#2a2826' : VFX_HALO[t];
    const body = t === VT.ink ? '#1b1916' : VFX_BODY[t];
    grad.addColorStop(0, hexA(col, 0));
    grad.addColorStop(e * 0.55, hexA(col, 0));
    grad.addColorStop(e * 0.84, hexA(col, t === VT.ink ? 0.12 : 0.2));
    grad.addColorStop(e * 0.97, hexA(body, t === VT.ink ? 0.3 : 0.42));
    grad.addColorStop(e, hexA(col, t === VT.ink ? 0.26 : 0.5));
    grad.addColorStop(Math.min(0.99, e + 0.07), hexA(col, 0.14));
    grad.addColorStop(1, hexA(col, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, px, px);
    return this.sprite(c, 64, 64);
  }
  /** A column of light (16 × 64 u at size 1, anchored at its foot). */
  column(t: number): Sprite | null;
  column(t: number, w: number, h: number): Sprite | null;
  column(t: number, w?: number, h?: number): Sprite | null {
    if (w === undefined || h === undefined) return this.cols[t] ?? null;
    const c = this.canvas(w, h);
    if (!c) return null;
    const g = c.getContext('2d')!;
    const lg = g.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, hexA(VFX_HALO[t], 0));
    lg.addColorStop(0.3, hexA(VFX_HALO[t], 0.35));
    lg.addColorStop(0.44, hexA(VFX_BODY[t], 0.5));
    lg.addColorStop(0.5, hexA(VFX_CORE[t], 0.95));
    lg.addColorStop(0.56, hexA(VFX_BODY[t], 0.5));
    lg.addColorStop(0.7, hexA(VFX_HALO[t], 0.35));
    lg.addColorStop(1, hexA(VFX_HALO[t], 0));
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
    // fade up and at the foot
    g.globalCompositeOperation = 'destination-in';
    const vg = g.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.55, 'rgba(0,0,0,0.8)');
    vg.addColorStop(0.92, 'rgba(0,0,0,1)');
    vg.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    const s = this.sprite(c, 16, 64);
    if (s) s.ay = 0.96;
    return s;
  }
  /** A ground stain (64 u across at size 1): scorch (ink), burn (fire), crack (a heavy blow). */
  stain(kind: number): Sprite | null;
  stain(kind: number, px: number): Sprite | null;
  stain(kind: number, px?: number): Sprite | null {
    if (px === undefined) return this.stains[kind] ?? null;
    const c = this.canvas(px, px);
    if (!c) return null;
    const g = c.getContext('2d')!;
    const r = px / 2;
    g.translate(r, r);
    const ink = kind === STAIN.burn ? [70, 44, 18] : [26, 24, 22];
    // a soft irregular wash, darker at the heart
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.92);
    grad.addColorStop(0, `rgba(${ink},${kind === STAIN.crack ? 0.3 : 0.42})`);
    grad.addColorStop(0.5, `rgba(${ink},${kind === STAIN.crack ? 0.16 : 0.24})`);
    grad.addColorStop(1, `rgba(${ink},0)`);
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2, k = 0.78 + 0.22 * h01(kind + 7, i % 16);
      const x = Math.cos(a) * r * 0.92 * k, y = Math.sin(a) * r * 0.92 * k;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.fill();
    // flecks thrown out, and for a crack the split lines radiating from the heart
    g.fillStyle = `rgba(${ink},0.5)`;
    for (let i = 0; i < 9; i++) {
      const a = h01(kind * 13 + 3, i) * Math.PI * 2, d = r * (0.55 + 0.38 * h01(kind, i + 40));
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.8, r * 0.03 * (0.6 + h01(i, kind + 9))), 0, Math.PI * 2); g.fill();
    }
    if (kind !== STAIN.burn) {
      g.strokeStyle = `rgba(${ink},${kind === STAIN.crack ? 0.7 : 0.4})`;
      g.lineCap = 'round';
      const n = kind === STAIN.crack ? 7 : 4;
      for (let i = 0; i < n; i++) {
        let a = (i / n) * Math.PI * 2 + h01(i, 91) * 0.6, x = r * 0.08 * Math.cos(a), y = r * 0.08 * Math.sin(a);
        g.lineWidth = Math.max(0.8, r * (kind === STAIN.crack ? 0.035 : 0.022));
        g.beginPath(); g.moveTo(x, y);
        const segs = 4;
        for (let k = 1; k <= segs; k++) {
          a += (h01(i * 7 + k, 17) - 0.5) * 0.7;
          const d = r * (0.12 + (kind === STAIN.crack ? 0.2 : 0.14) * k);
          x = Math.cos(a) * d; y = Math.sin(a) * d;
          g.lineTo(x, y);
          g.lineWidth *= 0.8;
        }
        g.stroke();
      }
    }
    return this.sprite(c, 64, 64);
  }

  dispose(): void {
    for (const c of this.canvases) { c.width = 1; c.height = 1; }
    this.canvases = []; this.glows = []; this.rings = []; this.cols = []; this.stains = []; this.bytes = 0;
  }

  private canvas(w: number, h: number): HTMLCanvasElement | null {
    if (!this.ok) return null;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    if (!c.getContext('2d')) return null;
    this.canvases.push(c);
    this.bytes += c.width * c.height * 4;
    return c;
  }
  private sprite(c: HTMLCanvasElement, w: number, h: number): Sprite {
    return { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, w, h, ax: 0.5, ay: 0.5 };
  }
}

/** Flat colour strings (the frame loop never builds a string). */
export const VFX_COL = { halo: VFX_HALO, body: VFX_BODY, core: VFX_CORE, edge: VFX_EDGE } as const;
