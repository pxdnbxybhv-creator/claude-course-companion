// 画面 · Picture quality. One profile per level (低 · 中 · 高 · 身临其境) with everything that
// differs between them: the pixel ratio and how quickly it gives way when frames run long, the
// antialiasing, the colour grade and what it adds (a soft bloom and a gentle depth of air on 身临其境),
// real soft shadows or the painted blobs, the pond's mirror, how far the world stays drawn and how
// much small life fills it. Pure: no DOM, no three.js — the world reads a profile once, at build time.
//
// 中 is the world exactly as it was before there was a choice (the tests pin it).
import type { QualityInfo, QualityLevel } from '../types';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

/** What each picture quality means for the world's counts and distances (features read ctx.quality). */
export const QUALITY_INFO: Record<QualityLevel, QualityInfo> = {
  low: { level: 'low', density: 0.55, distance: 0.75 },
  medium: { level: 'medium', density: 1, distance: 1 },
  high: { level: 'high', density: 1.2, distance: 1.2 },
  ultra: { level: 'ultra', density: 1.45, distance: 1.4 },
};

/** What the device is (read once by the world; tests pass their own). */
export interface Device {
  /** window.devicePixelRatio */
  dpr: number;
  /** A coarse pointer (a phone or a tablet). */
  touch: boolean;
  /** navigator.hardwareConcurrency */
  cores: number;
}

/** The soft shadow map of 身临其境 (a sun or moon shadow that follows the view). */
export interface ShadowSpec {
  /** Texels a side. */
  mapSize: number;
  /** Half the side of the square it covers (m): 30 → a 60 m square round the view. */
  extent: number;
  /** PCF blur radius (texels): soft ink edges, never hard black. */
  radius: number;
  /** How dark (0..1): the shade keeps the sky's fill, as a wash does. */
  intensity: number;
}

export interface QualityProfile {
  level: QualityLevel;
  info: QualityInfo;
  /** A phone with four cores or fewer (the world's old "low end"). */
  lowEnd: boolean;
  /** The pixel ratio to start at, and the floor the adaptive step may lower it to. */
  pixelRatio: number;
  minPixelRatio: number;
  /** Lower the pixel ratio when the median frame is longer than `slowMs`, by `step`, at most every `every` s, once `samples` frames are in. */
  adapt: { slowMs: number; step: number; every: number; samples: number; after: number };
  /** The canvas's own multisampling (only where the grade steps aside). */
  canvasAntialias: boolean;
  /** 'off' renders straight to the canvas; 'standard' is the grade as it always was; 'fine' adds MSAA + FXAA and a finer grain; 'rich' adds bloom and depth. */
  grade: 'off' | 'standard' | 'fine' | 'rich';
  bloom: boolean;
  /** Atmospheric depth: the far land a touch softer and paler (远景微虚). */
  depth: boolean;
  shadows: ShadowSpec | null;
  /** The pond's mirror: its resolution against the canvas's, and every how many frames it redraws. */
  mirror: { scale: number; every: number };
  /** Fog and streaming distances (× today's). */
  distance: number;
  /** How far each kind of small scattered thing stays drawn (m) and how many are sown (× today's). */
  scatter: { density: number; tufts: number; reeds: number; shrubs: number; slabs: number; rocks: number };
  /** The land's detail rings (× today's 56 / 110 / 170 m). */
  landLod: number;
  /** Particles in the air (× today's count). */
  particles: number;
  /** The sun's and the moon's halo (× today's). */
  halo: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Resolve a level for a device. */
export function qualityProfile(level: QualityLevel, d: Device): QualityProfile {
  const L: QualityLevel = QUALITY_LEVELS.includes(level) ? level : 'medium';
  const dpr = Number.isFinite(d.dpr) && d.dpr > 0 ? d.dpr : 1;
  const lowEnd = d.touch && d.cores <= 4;
  const info = QUALITY_INFO[L];
  // today's pixel ratio (中)
  const mid = Math.min(dpr, d.touch ? (lowEnd ? 1.5 : 1.75) : 1.75);
  const base = {
    level: L, info, lowEnd,
    distance: info.distance,
    particles: 1, halo: 1, landLod: 1,
    bloom: false, depth: false, shadows: null,
  };
  switch (L) {
    case 'low': {
      // weak phones: small pixels count most. Start at one CSS pixel per pixel (or less), give way fast.
      const pr = r2(Math.min(dpr, 1));
      return {
        ...base,
        pixelRatio: pr,
        minPixelRatio: Math.min(pr, 0.75),
        adapt: { slowMs: 19, step: 0.125, every: 1.2, samples: 20, after: 3 },
        // no grade to smooth the edges, so the canvas multisamples: at one pixel or less a pixel it is
        // all but free on a phone's tiled GPU, and keeps the eaves, rails and roof ridges clean lines
        canvasAntialias: true,
        grade: 'off',
        mirror: { scale: 0.25, every: 2 },
        scatter: { density: info.density, tufts: 22, reeds: 36, shrubs: 52, slabs: 44, rocks: 80 },
        landLod: 0.75,
        particles: info.density,
        halo: 1,
      };
    }
    case 'high': {
      const pr = r2(Math.min(dpr, 2));
      return {
        ...base,
        pixelRatio: pr,
        minPixelRatio: Math.min(pr, d.touch ? 1 : 0.75),
        adapt: { slowMs: 22, step: 0.25, every: 2.5, samples: 30, after: 6 },
        canvasAntialias: false,
        grade: 'fine',
        mirror: { scale: 0.75, every: 1 },
        scatter: { density: info.density, tufts: 36, reeds: 58, shrubs: 84, slabs: 72, rocks: 132 },
        landLod: info.distance,
        particles: info.density,
        halo: 1.1,
      };
    }
    case 'ultra': {
      const pr = r2(Math.min(dpr, 2.5));
      return {
        ...base,
        pixelRatio: pr,
        // only give way when frames are really slow (under ~28 fps), and never below a crisp 1.25
        minPixelRatio: Math.min(pr, 1.25),
        adapt: { slowMs: 36, step: 0.25, every: 4, samples: 45, after: 8 },
        canvasAntialias: false,
        grade: 'rich',
        bloom: true,
        depth: true,
        shadows: { mapSize: d.touch ? 1536 : 2048, extent: 32, radius: 2.4, intensity: 0.94 },
        mirror: { scale: 1, every: 1 },
        scatter: { density: info.density, tufts: 42, reeds: 66, shrubs: 96, slabs: 84, rocks: 150 },
        landLod: info.distance,
        particles: info.density,
        halo: 1.35,
      };
    }
    default:
      // 中: the world exactly as it always was
      return {
        ...base,
        pixelRatio: mid,
        minPixelRatio: Math.min(mid, d.touch ? 1 : 0.75),
        adapt: { slowMs: 22, step: 0.25, every: 2.5, samples: 30, after: 6 },
        // every frame goes through the grade, which multisamples or FXAAs its own target: the canvas's
        // own antialias would be wasted memory. Only where the grade steps aside (low-end phones) does
        // the canvas smooth its edges itself.
        canvasAntialias: lowEnd && mid < 1.6,
        grade: lowEnd ? 'off' : 'standard',
        mirror: { scale: lowEnd ? 0.4 : 0.55, every: 1 },
        scatter: { density: 1, tufts: 30, reeds: 48, shrubs: 70, slabs: 60, rocks: 110 },
      };
  }
}

/**
 * The grade's own target: how many samples it multisamples with, and whether FXAA runs on top.
 * 中 as always: four samples at low pixel ratios (two on very large screens), FXAA instead at high
 * ones. 高 and 身临其境 always multisample, and add FXAA where the samples are few.
 */
export function gradeSampling(p: Pick<QualityProfile, 'grade'>, pixelRatio: number, pixels: number): { samples: number; fxaa: boolean } {
  if (p.grade === 'off') return { samples: 0, fxaa: false };
  if (p.grade === 'standard') {
    const samples = pixelRatio < 1.6 ? (pixels > 2.6e6 ? 2 : 4) : 0;
    return { samples, fxaa: samples === 0 };
  }
  const samples = pixels > (p.grade === 'rich' ? 6e6 : 4.2e6) ? 2 : 4;
  return { samples, fxaa: samples < 4 };
}

/** The adaptive pixel ratio's next value (or the same one), given the median frame time (ms). */
export function adaptPixelRatio(p: Pick<QualityProfile, 'adapt' | 'minPixelRatio'>, pr: number, medianMs: number): number {
  if (!(medianMs > p.adapt.slowMs) || pr <= p.minPixelRatio + 1e-3) return pr;
  return Math.max(p.minPixelRatio, Math.round((pr - p.adapt.step) * 1000) / 1000);
}

/** Fog distances for a level: the day's haze and the night's dark, pushed out (or drawn in) together. */
export function fogFor(distance: number): { near: number; far: number; nightNear: number; nightFar: number } {
  const k = Number.isFinite(distance) && distance > 0 ? distance : 1;
  return { near: 58 * k, far: 176 * k, nightNear: 26 * k, nightFar: 126 * k };
}

/**
 * Who of the everyday crowd is out at a lower quality: a fixed share (the crowd passes the level's
 * density, ctx.quality.density, capped at 1 — 低 keeps about 55%), the same every visit, and never
 * the people a place is made of (vendors at their stalls, the boatman, the watchman, the monk at his
 * wooden fish, the tea drinkers) — strollers, children and lantern walkers thin out first.
 */
export function crowdKeeps(share: number, index: number, role: string, region: string): boolean {
  if (share >= 1) return true;
  if (KEEP_ROLES.has(role)) return true;
  // a stable hash of the place and the person (FNV-1a), 0..1
  let h = 0x811c9dc5;
  const s = region + ':' + index;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 1000) / 1000 < share;
}
const KEEP_ROLES = new Set(['vendor', 'boatman', 'watchman', 'woodfish', 'tea', 'snack', 'fisher']);

/** One line for Settings: what the chosen level does. */
export const QUALITY_TEXT: Record<QualityLevel, { zh: string; en: string; name: { zh: string; en: string } }> = {
  low: {
    name: { zh: '低', en: 'Low' },
    zh: '省电流畅：像素放粗，不作调色，草木与行人少些，远处早些隐入雾中。',
    en: 'Light and smooth: coarser pixels, no colour grade, fewer plants and people, the distance fades sooner.',
  },
  medium: {
    name: { zh: '中', en: 'Medium' },
    zh: '默认：暖色调、纸纹与柔和的边缘，兼顾清晰与流畅。',
    en: 'The default: warm grade, paper grain and smooth edges, balanced for clarity and pace.',
  },
  high: {
    name: { zh: '高', en: 'High' },
    zh: '更细的像素与抗锯齿，更细的纸纹，草木更密，看得更远。',
    en: 'Finer pixels and edges, finer grain, denser plants, and you see further.',
  },
  ultra: {
    name: { zh: '身临其境', en: 'Immersive' },
    zh: '日月投下柔和的影子，灯火微晕，远景微虚，方塘如镜，一切最丰盛。',
    en: 'Soft shadows from sun and moon, a glow on lanterns, a haze of distance, a clear mirror of a pond — the fullest picture.',
  },
};
