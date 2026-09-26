// The map of the 入画 world: six places and a homestead joined by paths, a river and a lotus lake.
// Everything that needs to agree on *where* things are reads it from here (world core, regions,
// mini-games, the map screen). One unit = one metre; +x east, +z south, y up.
// The walled garden with the half-acre pond sits at the origin; its moon gate opens south.

export type RegionId = 'garden' | 'village' | 'lake' | 'bamboo' | 'plum' | 'mountain' | 'home';

/** Background-music themes (see src/audio/music.ts). */
export type MusicTheme = 'garden' | 'village' | 'lake' | 'bamboo' | 'plum' | 'mountain' | 'night' | 'festival' | 'hall' | 'quiet';

export interface XZ { x: number; z: number }

export interface RegionSpec {
  id: RegionId;
  zh: string;
  en: string;
  /** One line for the map screen and the arrival banner. */
  blurbZh: string;
  blurbEn: string;
  center: XZ;
  /** Rough radius of the region's content (m). */
  radius: number;
  /** Ground height near the centre (m); the terrain is shaped to meet it. */
  elevation: number;
  theme: MusicTheme;
}

export const REGIONS: RegionSpec[] = [
  { id: 'garden', zh: '半亩园', en: 'Half-Acre Garden', blurbZh: '方塘一鉴，你的花木在此。', blurbEn: 'The mirror pond, and the plants you tend.', center: { x: 0, z: 0 }, radius: 26, elevation: 0, theme: 'garden' },
  { id: 'village', zh: '水乡', en: 'Water Town', blurbZh: '小桥流水人家，茶馆与集市。', blurbEn: 'Little bridges, flowing water, a teahouse and a market.', center: { x: 0, z: 80 }, radius: 40, elevation: 0, theme: 'village' },
  { id: 'lake', zh: '荷塘', en: 'Lotus Lake', blurbZh: '接天莲叶，一叶扁舟。', blurbEn: 'Lotus leaves to the sky, and a small boat.', center: { x: 88, z: 18 }, radius: 44, elevation: -0.4, theme: 'lake' },
  { id: 'bamboo', zh: '竹林', en: 'Bamboo Grove', blurbZh: '独坐幽篁里，弹琴复长啸。', blurbEn: 'Sitting alone in the hidden bamboo, playing the qin.', center: { x: -82, z: 28 }, radius: 34, elevation: 1.5, theme: 'bamboo' },
  { id: 'plum', zh: '梅岭', en: 'Plum Ridge', blurbZh: '疏影横斜，暗香浮动；岭上有亭。', blurbEn: 'Sparse shadows, drifting fragrance; a pavilion on the ridge.', center: { x: -72, z: -72 }, radius: 30, elevation: 9, theme: 'plum' },
  { id: 'mountain', zh: '山寺', en: 'Mountain Temple', blurbZh: '钟声、塔影与飞瀑。', blurbEn: 'A bell, a pagoda and a waterfall.', center: { x: 40, z: -112 }, radius: 44, elevation: 22, theme: 'mountain' },
  { id: 'home', zh: '家园', en: 'Homestead', blurbZh: '一方空地，由你起屋、种树、养些猫狗。', blurbEn: 'Open ground for you to build on, plant, and keep a few pets.', center: { x: -50, z: -24 }, radius: 20, elevation: 0.6, theme: 'garden' },
];

/**
 * The homestead's buildable plot: a square of `size` metres centred at (x, z), on a grid of `cell`
 * metres (cells counted from the north-west corner, i along +x, j along +z). Its gate is in the
 * east side, facing the garden; a path leads there from the garden's west wall.
 */
export const HOME_PLOT = { x: -50, z: -24, size: 24, cell: 1, gate: { x: -38, z: -24 } };

/**
 * Waypoints (驿): one stone stele per place. Walking up to one lights it for good; from then on the
 * map (舆图) can send you there with a tap. The garden's is lit from the start.
 */
export interface Waypoint { id: RegionId; x: number; z: number; zh: string; en: string }
export const WAYPOINTS: Waypoint[] = [
  { id: 'garden', x: 5, z: 27.5, zh: '园门', en: 'Garden Gate' },
  { id: 'village', x: 3, z: 49, zh: '小桥流水', en: 'The Archway' },
  { id: 'lake', x: 58, z: 34, zh: '荷塘渡口', en: 'Lotus Dock' },
  { id: 'bamboo', x: -67.4, z: 30.6, zh: '竹林口', en: 'Grove Edge' },
  { id: 'plum', x: -77.7, z: -57.7, zh: '梅岭山道', en: 'Ridge Path' },
  { id: 'mountain', x: 25, z: -85, zh: '云深寺山门', en: 'Temple Gate' },
  { id: 'home', x: -34.2, z: -20.6, zh: '家园', en: 'Homestead' },
];
export const WAYPOINT: Record<RegionId, Waypoint> = Object.fromEntries(WAYPOINTS.map((w) => [w.id, w])) as Record<RegionId, Waypoint>;

export const REGION: Record<RegionId, RegionSpec> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionSpec>;

/** The walkable world is a disc of this radius (misty mountains beyond). */
export const WORLD_RADIUS = 175;

/** The lotus lake: an ellipse, water surface at waterY. */
export const LAKE = { x: 92, z: 14, rx: 34, rz: 24, waterY: -0.35 };

/**
 * The river: falls from the mountain (a waterfall at its first point), feeds the lake, leaves it
 * and flows west through the water town. Polyline of centre points with half-width w (m).
 */
export const RIVER: (XZ & { w: number })[] = [
  { x: 56, z: -96, w: 2.5 },   // foot of the waterfall
  { x: 66, z: -62, w: 3 },
  { x: 76, z: -30, w: 3.5 },
  { x: 84, z: -8, w: 4 },      // enters the lake
  // (the lake)
  { x: 70, z: 36, w: 4 },      // leaves the lake
  { x: 40, z: 60, w: 4.5 },
  { x: 0, z: 66, w: 5 },       // through the water town
  { x: -45, z: 72, w: 5 },
  { x: -110, z: 84, w: 5.5 },
  { x: -170, z: 96, w: 6 },
];
/** Index in RIVER where the lake interrupts the channel (points before it flow into the lake). */
export const RIVER_LAKE_BREAK = 4;

/** Walking paths (stone or earth) between places; the core lays them and bridges the river. */
export const PATHS: XZ[][] = [
  // garden gate → water town (crosses the river on the arched bridge)
  [{ x: 0, z: 21 }, { x: 0, z: 40 }, { x: -2, z: 58 }, { x: 0, z: 70 }, { x: 0, z: 80 }],
  // gate plaza → lotus lake dock
  [{ x: 4, z: 26 }, { x: 30, z: 28 }, { x: 52, z: 30 }, { x: 64, z: 32 }],
  // gate plaza → bamboo grove
  [{ x: -4, z: 26 }, { x: -30, z: 30 }, { x: -58, z: 30 }, { x: -76, z: 28 }],
  // bamboo grove → plum ridge (climbing)
  [{ x: -84, z: 10 }, { x: -86, z: -20 }, { x: -80, z: -48 }, { x: -72, z: -66 }],
  // plum ridge → mountain temple (ridge path)
  [{ x: -60, z: -80 }, { x: -30, z: -96 }, { x: 0, z: -104 }, { x: 26, z: -108 }],
  // lake → mountain temple along the river
  [{ x: 80, z: -2 }, { x: 72, z: -34 }, { x: 60, z: -64 }, { x: 46, z: -92 }],
  // around the garden wall, west side → north
  [{ x: -30, z: 30 }, { x: -34, z: 0 }, { x: -24, z: -32 }, { x: 0, z: -40 }, { x: 24, z: -32 }, { x: 34, z: 0 }, { x: 30, z: 28 }],
  // the garden's west wall → the homestead gate
  [{ x: -33, z: -6 }, { x: -35, z: -16 }, { x: -37, z: -24 }],
];

/**
 * Named spots that regions must build and keep clear, and that mini-games / NPCs use.
 * y is taken from the ground (or water) at run time.
 */
export const ANCHORS = {
  gatePlaza: { x: 0, z: 27 },
  // water town
  villageSquare: { x: 0, z: 84 },
  villageBridge: { x: -1, z: 66 },     // arched stone bridge over the river
  teahouse: { x: 16, z: 88 },
  pitchPot: { x: -12, z: 86 },         // 投壶
  lanternSteps: { x: -22, z: 70 },     // river steps for floating lanterns 放河灯
  market: { x: 10, z: 96 },
  // lotus lake
  dock: { x: 66, z: 30 },              // fishing spot + boat mooring
  waterPavilion: { x: 114, z: 6 },     // 水榭
  lakeIsland: { x: 96, z: 18 },
  // bamboo grove
  bambooClearing: { x: -82, z: 28 },   // stone table, a qin player
  bambooShrine: { x: -96, z: 40 },
  // plum ridge
  plumSummit: { x: -72, z: -76 },      // pavilion at the top (重阳 climb, 飞花令 poet)
  plumBench: { x: -62, z: -60 },
  // mountain temple
  templeGate: { x: 30, z: -94 },
  templeHall: { x: 40, z: -116 },
  bellTower: { x: 24, z: -120 },       // 敲钟
  pagoda: { x: 58, z: -124 },
  waterfall: { x: 56, z: -100 },
  waterfallPool: { x: 56, z: -94 },
} satisfies Record<string, XZ>;

export type AnchorId = keyof typeof ANCHORS;

/** Which region a point belongs to (nearest centre within 1.35 × radius), or null in between. */
export function regionAt(x: number, z: number): RegionId | null {
  let best: RegionId | null = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.center.x, z - r.center.z) / r.radius;
    if (d < 1.35 && d < bestD) { bestD = d; best = r.id; }
  }
  return best;
}
