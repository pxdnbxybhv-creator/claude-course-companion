// Damage numbers from a glyph cache: each style's digits are rendered once (after the fonts load)
// into a small strip; drawNumber is a handful of drawImage calls. Big numbers are abbreviated the
// same way as the HUD: 1.2万 / 12万 / 3.4亿 in Chinese, 12.3k / 1.2M in English.
import type { NumStyle } from '../types';
import { canvas, ctx2d } from './atlas';
import { BRUSH_FONT, TEXT_FONT } from './kit';
import { DANGER } from './palette';

/** 1234 → '1234' · 12345 → '1.2万' / '12.3k' · 123456 → '12万' / '123k' · 1.2e8 → '1.2亿' / '120M'. */
export function abbrev(n: number, lang: 'zh' | 'en'): string {
  const v = Math.round(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  const f = (x: number) => (x < 10 ? (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(x)));
  if (v < 10000) return sign + v;
  if (lang === 'zh') return sign + (v < 1e8 ? f(v / 1e4) + '万' : f(v / 1e8) + '亿');
  if (v < 1e6) return sign + (v < 1e5 ? (Math.floor(v / 100) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(v / 1000))) + 'k';
  if (v < 1e9) return sign + f(v / 1e6) + 'M';
  return sign + f(v / 1e9) + 'B';
}

const GLYPHS = '0123456789.+-kMB万亿';
interface StyleDef { px: number; font: string; fill: string; edge: string; edgeW: number }
const STYLES: Record<NumStyle, StyleDef> = {
  hit: { px: 13, font: TEXT_FONT, fill: '#1b1916', edge: 'rgba(244,239,228,0.95)', edgeW: 3 },
  crit: { px: 21, font: BRUSH_FONT, fill: DANGER, edge: 'rgba(27,25,22,0.85)', edgeW: 3.2 },
  heal: { px: 13, font: TEXT_FONT, fill: '#2f7a3e', edge: 'rgba(244,239,228,0.95)', edgeW: 3 },
  moon: { px: 12, font: TEXT_FONT, fill: '#f6f7fb', edge: 'rgba(40,52,70,0.9)', edgeW: 3 },
  coin: { px: 15, font: BRUSH_FONT, fill: '#e2b04a', edge: 'rgba(58,36,8,0.9)', edgeW: 3 },
  player: { px: 15, font: BRUSH_FONT, fill: '#8e1f2a', edge: 'rgba(244,239,228,0.95)', edgeW: 3 },
};

interface Strip { img: HTMLCanvasElement; x: Float32Array; w: Float32Array; h: number; map: Map<string, number> }

export class Numbers {
  private strips: Partial<Record<NumStyle, Strip>> = {};
  constructor(private dpr: number) {}

  /** Build every style's strip (call after the fonts have loaded). */
  ensure(): void {
    for (const k of Object.keys(STYLES) as NumStyle[]) if (!this.strips[k]) this.strips[k] = this.build(STYLES[k]);
  }

  private build(s: StyleDef): Strip {
    const px = Math.round(s.px * this.dpr), pad = Math.ceil(s.edgeW * this.dpr) + 1;
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
      g.strokeStyle = s.edge; g.lineWidth = s.edgeW * this.dpr;
      g.strokeText(c, x + pad, h / 2);
      g.fillStyle = s.fill;
      g.fillText(c, x + pad, h / 2);
      xs[i] = x; wsA[i] = ws[i]; map.set(c, i);
      x += ws[i];
    });
    return { img, x: xs, w: wsA, h, map };
  }

  /** Centred on (sx, sy) in device px. */
  draw(ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en'): void {
    let st = this.strips[style];
    if (!st) { this.ensure(); st = this.strips[style]; if (!st) return; }
    const plus = style === 'heal' || style === 'moon' || style === 'coin';
    const text = (plus ? '+' : '') + abbrev(value, lang);
    const pad = Math.ceil(STYLES[style].edgeW * this.dpr) + 1;
    let total = 0;
    for (let i = 0; i < text.length; i++) { const j = st.map.get(text[i]); if (j !== undefined) total += st.w[j] - pad * 2; }
    let x = sx - total / 2 - pad;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    for (let i = 0; i < text.length; i++) {
      const j = st.map.get(text[i]);
      if (j === undefined) continue;
      ctx.drawImage(st.img, st.x[j], 0, st.w[j], st.h, x, sy - st.h / 2, st.w[j], st.h);
      x += st.w[j] - pad * 2;
    }
    ctx.globalAlpha = 1;
  }
}
