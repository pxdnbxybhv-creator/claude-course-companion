// Damage numbers from a glyph cache: each style's digits are rendered once (after the fonts load)
// into a small strip; drawNumber is a handful of drawImage calls. Big numbers are abbreviated the
// same way as the HUD (logic fmtBig): 1.2万 / 12.3万 / 3.4亿 in Chinese, 12.3k / 1.2m in English.
import { fmtBig } from '../logic/formulas';
import type { NumStyle } from '../types';
import { canvas, ctx2d } from './atlas';
import { BRUSH_FONT, TEXT_FONT } from './kit';

/** The HUD's and the shop's abbreviation (logic fmtBig), so a number reads the same everywhere:
 *  1234 → '1234' · 15500 → '1.6万' / '15.5k' · 123456 → '12.3万' / '123k' · 2.5e6 → '250万' / '2.5m'. */
export const abbrev = (n: number, lang: 'zh' | 'en'): string => fmtBig(n, lang);

const GLYPHS = '0123456789.+-kmb万亿!';
interface StyleDef { px: number; font: string; fill: string; edge: string; edgeW: number; /** An outer rim under the edge (crits: gold). */ rim?: string; rimW?: number }
const STYLES: Record<NumStyle, StyleDef> = {
  hit: { px: 13, font: TEXT_FONT, fill: '#1b1916', edge: 'rgba(244,239,228,0.95)', edgeW: 3 },
  // crits: white-hot brush numerals in an ink edge and a gold halo, with a 「!」 (vermilion stays the enemy's)
  crit: { px: 21, font: BRUSH_FONT, fill: '#fff8e6', edge: 'rgba(27,25,22,0.92)', edgeW: 2.4, rim: '#f0c24a', rimW: 4.5 },
  heal: { px: 13, font: TEXT_FONT, fill: '#2f7a3e', edge: 'rgba(244,239,228,0.95)', edgeW: 3 },
  moon: { px: 12, font: TEXT_FONT, fill: '#f6f7fb', edge: 'rgba(40,52,70,0.9)', edgeW: 3 },
  coin: { px: 15, font: BRUSH_FONT, fill: '#e2b04a', edge: 'rgba(58,36,8,0.9)', edgeW: 3 },
  player: { px: 15, font: BRUSH_FONT, fill: '#8e1f2a', edge: 'rgba(244,239,228,0.95)', edgeW: 3 },
};

interface Strip { img: HTMLCanvasElement; x: Float32Array; w: Float32Array; h: number; map: Map<string, number>; pad: number }

export class Numbers {
  private strips: Partial<Record<NumStyle, Strip>> = {};
  constructor(private dpr: number) {}

  /** Build every style's strip (call after the fonts have loaded). */
  ensure(): void {
    for (const k of Object.keys(STYLES) as NumStyle[]) if (!this.strips[k]) this.strips[k] = this.build(STYLES[k]);
  }

  private build(s: StyleDef): Strip {
    const px = Math.round(s.px * this.dpr), pad = Math.ceil(Math.max(s.edgeW, (s.rimW ?? 0) / 2 + 0.5) * this.dpr) + 1;
    const probe = ctx2d(canvas(4, 4));
    probe.font = `${px}px ${s.font}`;
    const ws = [...GLYPHS].map((c) => Math.ceil(probe.measureText(c).width) + pad * 2);
    const h = Math.ceil(px * 1.3) + pad * 2;
    const img = canvas(ws.reduce((a, b) => a + b, 0), h);
    const g = ctx2d(img);
    g.font = `${px}px ${s.font}`;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const xs = new Float32Array(ws.length), wsA = new Float32Array(ws.length), map = new Map<string, number>();
    let x = 0;
    [...GLYPHS].forEach((c, i) => {
      if (s.rim) { g.strokeStyle = s.rim; g.lineWidth = (s.rimW ?? 5) * this.dpr; g.strokeText(c, x + pad, h / 2); }
      g.strokeStyle = s.edge; g.lineWidth = s.edgeW * this.dpr;
      g.strokeText(c, x + pad, h / 2);
      g.fillStyle = s.fill;
      g.fillText(c, x + pad, h / 2);
      xs[i] = x; wsA[i] = ws[i]; map.set(c, i);
      x += ws[i];
    });
    return { img, x: xs, w: wsA, h, map, pad };
  }

  /** Centred on (sx, sy) in device px, at `k` × its baked size (the engine's pop and size-by-damage). */
  draw(ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en', k = 1): void {
    let st = this.strips[style];
    if (!st) { this.ensure(); st = this.strips[style]; if (!st) return; }
    if (a <= 0.01 || k <= 0.01) return;
    const plus = style === 'heal' || style === 'moon' || style === 'coin';
    const text = (plus ? '+' : '') + abbrev(value, lang) + (style === 'crit' ? '!' : '');
    const pad = st.pad;
    let total = 0;
    for (let i = 0; i < text.length; i++) { const j = st.map.get(text[i]); if (j !== undefined) total += st.w[j] - pad * 2; }
    let x = sx - (total / 2 + pad) * k;
    const h = st.h * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    for (let i = 0; i < text.length; i++) {
      const j = st.map.get(text[i]);
      if (j === undefined) continue;
      ctx.drawImage(st.img, st.x[j], 0, st.w[j], st.h, x, sy - h / 2, st.w[j] * k, h);
      x += (st.w[j] - pad * 2) * k;
    }
    ctx.globalAlpha = 1;
  }
}
