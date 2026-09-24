// Seal stamps (印章). STUB — contract only.
export interface SealOptions {
  /** Edge length in css px. */
  size: number;
  dpr?: number;
  /** 'bai' 白文 = white characters carved into red; 'zhu' 朱文 = red characters, red border. */
  style?: 'bai' | 'zhu';
  /** 'square' (default) or 'round' / 'oval' for leisure seals (闲章). */
  shape?: 'square' | 'round' | 'oval';
  color?: string;
  seed?: number;
}

/** Render 1–4 characters as a weathered stone seal. Returns a transparent canvas. */
export function makeSeal(text: string, o: SealOptions): HTMLCanvasElement {
  const dpr = o.dpr ?? 1;
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(o.size * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = o.color ?? '#b93a2b';
  ctx.fillRect(0, 0, o.size, o.size);
  ctx.fillStyle = '#f4efe4';
  ctx.font = `${o.size * 0.4}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 2), o.size / 2, o.size / 2);
  return c;
}
