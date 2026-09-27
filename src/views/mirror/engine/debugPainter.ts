// 水月幻镜 · a debug painter behind the Painter interface: no sprites (the renderer draws plain ink
// circles for every null sprite), a flat paper arena with its outline and obstacles, simple
// telegraph and zone strokes, and system-font numbers. Used when paint/ is not ready, and in tests.
import type { FxName, MapId } from '../ids';
import type { ArenaGeom, AtlasId, BakeStage, Camera, NumStyle, Painter, Quality, RunSave, Sprite, StampKind, TeleShape } from '../types';
import { fmtBig } from '../logic/formulas';

const W2S = (cam: Camera, x: number, y: number, out: { x: number; y: number }) => {
  out.x = (x - cam.x) * cam.scale + cam.w / 2;
  out.y = (y - cam.y) * cam.scale + cam.h / 2;
  return out;
};
const P = { x: 0, y: 0 };
const NUM_COLOUR: Record<NumStyle, string> = { hit: '#222', crit: '#c0412f', heal: '#3f7a4a', moon: '#6f8fb0', coin: '#b8862b', player: '#c0412f' };

export class DebugPainter implements Painter {
  readonly dpr: number;
  private geom: ArenaGeom | null = null;
  private inverted = false;
  constructor(readonly map: MapId, readonly quality: Quality, dpr: number) { this.dpr = Math.max(1, Math.min(2, dpr || 1)); }
  plan(run: RunSave, stage: BakeStage): AtlasId[] { void run; void stage; return []; }
  async bake(): Promise<void> { /* nothing to bake */ }
  has(id: AtlasId): boolean { void id; return false; }
  sprite(id: AtlasId, v?: number): Sprite | null { void id; void v; return null; }
  flash(id: AtlasId, v?: number): Sprite | null { void id; void v; return null; }
  variants(id: AtlasId): number { void id; return 1; }
  paintArena(geom: ArenaGeom, seed: number, inverted: boolean): void { void seed; this.geom = geom; this.inverted = inverted; }
  drawArena(ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.inverted ? '#15171c' : '#3a3a38';
    ctx.fillRect(0, 0, cam.w, cam.h);
    const g = this.geom;
    if (!g) return;
    ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
    ctx.fillStyle = this.inverted ? '#23252c' : '#eeeae0';
    ctx.beginPath();
    const s = g.shape;
    if (s.kind === 'circle') ctx.arc(0, 0, s.r, 0, Math.PI * 2);
    else if (s.kind === 'rect') ctx.rect(-s.w / 2, -s.h / 2, s.w, s.h);
    else for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k / 8) * Math.PI * 2; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * s.r, Math.sin(a) * s.r); }
    ctx.fill();
    ctx.fillStyle = this.inverted ? '#50545e' : '#9aa596';
    for (const o of g.obstacles) { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  stamp(kind: StampKind, x: number, y: number, r: number, seed: number, tint?: string): void { void kind; void x; void y; void r; void seed; void tint; }
  wash(f: number): void { void f; }
  drawTele(ctx: CanvasRenderingContext2D, cam: Camera, s: TeleShape, k: number): void {
    ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
    ctx.fillStyle = `rgba(192,65,47,${0.12 + 0.3 * k})`;
    ctx.beginPath();
    switch (s.kind) {
      case 'circle': ctx.arc(s.x, s.y, s.r * Math.max(0.1, k), 0, Math.PI * 2); break;
      case 'ring': ctx.arc(s.x, s.y, s.r2, 0, Math.PI * 2); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2, true); break;
      case 'line': {
        const c = Math.cos(s.dir), n = Math.sin(s.dir), L = s.len * Math.max(0.1, k), hw = s.w / 2;
        ctx.moveTo(s.x - n * hw, s.y + c * hw); ctx.lineTo(s.x + c * L - n * hw, s.y + n * L + c * hw);
        ctx.lineTo(s.x + c * L + n * hw, s.y + n * L - c * hw); ctx.lineTo(s.x + n * hw, s.y - c * hw);
        break;
      }
      case 'cone': { const h = (s.deg / 2) * (Math.PI / 180); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, s.r * Math.max(0.1, k), s.dir - h, s.dir + h); break; }
      case 'fan': { const h = (s.deg / 2) * (Math.PI / 180); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, 200 * Math.max(0.1, k), s.dir - h, s.dir + h); break; }
    }
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  drawZone(ctx: CanvasRenderingContext2D, cam: Camera, look: FxName, x: number, y: number, r: number, a: number): void {
    void look;
    W2S(cam, x, y, P);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = '#6f8fb0';
    ctx.beginPath(); ctx.arc(P.x, P.y, r * cam.scale, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawNumber(ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en'): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = NUM_COLOUR[style];
    ctx.font = `${(style === 'crit' ? 18 : 13) * this.dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fmtBig(value, lang), sx, sy);
    ctx.globalAlpha = 1;
  }
  icon(id: AtlasId, px: number): HTMLCanvasElement {
    void id;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    return c;
  }
  arenaImage(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  dispose(): void { this.geom = null; }
}

export const createDebugPainter = (map: MapId, quality: Quality, dpr: number): Painter => new DebugPainter(map, quality, dpr);
