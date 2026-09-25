// The ink-painting contract.
//
// Procedural painters (plants, rocks, the censer…) never touch a canvas. They return an
// ordered *display list* of brush strokes. The brush engine (brush.ts) turns strokes into
// pixels. This split gives us three things for free:
//   1. growth    — each stroke carries a `birth` in 0..1; a plant at growth g paints only
//                  strokes with birth ≤ g, so it grows by *adding* strokes, never reshaping.
//   2. animation — when growth rises from g0 to g1, the new strokes are painted in, one by
//                  one, along their path, as if by a brush.
//   3. caching   — a plant is rasterised once per growth level and blitted every frame.
import type { PlantKind } from '../core/types';

/** A point along a stroke's spine. Coordinates are in drawing space (px at scale 1). */
export interface StrokePoint {
  x: number;
  y: number;
  /** Full brush width at this point, px. Taper it to ~0 at the ends for a natural stroke. */
  w: number;
}

/**
 * - `brush` wet, loaded brush: solid core, soft slightly feathered edge. Stems, leaves, culms.
 * - `dry`   飞白 dry brush: parallel bristle streaks that break up as ink runs out. Bark, rock texture, pine trunks.
 * - `wash`  a closed polygon of diluted ink, bleeding soft edges, layered like watercolour. Lotus leaves, mountains, mist, ground.
 * - `dot`   one blot centred on pts[0], diameter pts[0].w. Moss dots 苔点, buds, stamens, pine-needle bases.
 * - `fill`  a closed polygon of pigment with a fairly crisp edge. Petals, blossoms.
 * - `line`  a fine outline (勾勒), almost constant width. Petal outlines, veins, fine twigs.
 *
 * For polygon kinds (`wash`, `fill`) `pts` is the outline, not closed (first ≠ last); `w` is ignored
 * except `pts[0].w`, which sets the edge softness in px.
 */
export type StrokeKind = 'brush' | 'dry' | 'wash' | 'dot' | 'fill' | 'line';

export interface Stroke {
  kind: StrokeKind;
  pts: StrokePoint[];
  /**
   * Ink density 0..1 — the five ink tones of Chinese painting:
   * 0.12 清 clear · 0.3 淡 light · 0.5 重 heavy · 0.75 浓 thick · 0.95 焦 burnt-dark.
   * For coloured strokes, tone scales pigment opacity the same way.
   */
  tone: number;
  /** Pigment as `#rrggbb`. Omit for ink. Use the palette in PIGMENTS. */
  color?: string;
  /** Growth 0..1 at which this stroke appears. Strokes must be sorted by birth ascending. */
  birth: number;
  /** Per-stroke randomness for the brush engine (edge jitter, bristle gaps). */
  seed: number;
  /** 0..1, how much the ink bleeds into the paper. Defaults per kind. */
  wet?: number;
  /** 0..1, how quickly a `dry` / `brush` stroke runs out of ink toward its end. */
  dryness?: number;
}

export interface Drawing {
  /** Size of the drawing's box in px at scale 1; strokes should stay inside it. */
  width: number;
  height: number;
  /** Where the drawing meets the ground (for plants) — placed on the scene's ground line. */
  anchor: { x: number; y: number };
  /** Sorted by `birth` ascending; ties keep paint order. */
  strokes: Stroke[];
}

export interface PlantSpec {
  kind: PlantKind;
  seed: number;
  /** Target height of the fully grown plant in px at scale 1 (typical 220–420). */
  height: number;
}

export type PlantGenerator = (spec: PlantSpec) => Drawing;

/** Traditional Chinese painting pigments (国画颜料). Keep colour restrained: ink first, colour as accent. */
export const PIGMENTS = {
  ink: '#1b1916',       // 墨
  rouge: '#b83a4b',     // 胭脂 rouge — plum blossoms, lotus tips
  cinnabar: '#c0412f',  // 朱砂 seal red, sun
  vermilion: '#d4553a', // 朱膘
  gamboge: '#d9a62e',   // 藤黄 gamboge yellow — chrysanthemum, stamens
  ochre: '#a8703a',     // 赭石 ochre — stems, rocks, autumn
  indigo: '#3d5a73',    // 花青 indigo — distant hills, night
  malachite: '#5f8a6e', // 石绿 malachite green — moss, lotus leaves (sparingly)
  azurite: '#3f6f8f',   // 石青
  white: '#f4efe4',     // 白粉 lead white — plum blossoms on dark ground, snow
} as const;
