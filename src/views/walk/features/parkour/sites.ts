// Where 轻功 happens: hand-placed climbs in every place, and the coin spots on them. Heights are
// metres above each site's base (the ground at its anchor); a route rises by at most a jump
// (~0.5 m a step, gaps under a metre and a half), and the challenge coins hang where only a
// companion's gift or skill reaches: 'high' (a big jump or a double jump), 'glide' (a long float).
// Pure data — the builder (build.ts) and the coins (coins.ts) read it.
import { ANCHORS, type RegionId } from '../../map';
import type { PropSpec } from './build';
import type { CoinSpot } from './coins';

export interface Site {
  id: string;
  region: RegionId;
  /** The ground here is the site's base height. */
  at: { x: number; z: number };
  props: PropSpec[];
  coins: CoinSpot[];
}

/**
 * A high coin: this far above a surface (a normal jump reaches ~2.05; this needs ~1.05 m of jump).
 * A glide coin hangs ~6 m out from a high edge: a running jump drops too far by then (it reaches
 * ~4.5 m), a slow float does not.
 */
export const HIGH_LIFT = 2.45;

const coin = (region: RegionId, id: string, x: number, z: number, value: number, o: Partial<CoinSpot> = {}): CoinSpot => ({ id, region, x, z, value, ...o });

// ── 水乡 · a backyard at the west end of the water town: jars, crates, a whitewashed wall, a
// woodshed's roof, and up to a drying terrace hung with cloth.
const V = 'village' as const;
const yard: Site = {
  id: 'v-yard', region: V, at: { x: -44, z: 97 },
  props: [
    { kind: 'jar', x: -40.4, z: 98.8, h: 0.55, r: 0.34 },
    { kind: 'jar', x: -39.7, z: 99.5, h: 0.5, r: 0.3 },
    { kind: 'crate', x: -41.5, z: 98.1, h: 1.05, w: 1.0, ry: 0.15 },
    { kind: 'crate', x: -42.8, z: 97.3, h: 1.55, w: 1.05, ry: -0.1 },
    // the wall runs on under the shed's eaves to its gable, so you can walk from one onto the other
    { kind: 'wall', x: -45.975, z: 96.1, h: 2.0, w: 6.05, d: 0.44 },
    { kind: 'shed', x: -50.3, z: 96.1, h: 2.8, low: 2.0, w: 3.6, d: 2.6, ry: Math.PI / 2 },
    { kind: 'terrace', x: -50.3, z: 99.9, h: 3.2, w: 2.6, d: 2.2, laundry: true },
  ],
  coins: [
    coin(V, 'v-jar', -40.4, 98.8, 1),
    coin(V, 'v-crate1', -41.5, 98.1, 1),
    coin(V, 'v-crate2', -42.8, 97.3, 1),
    coin(V, 'v-wall1', -44.9, 96.1, 1),
    coin(V, 'v-wall2', -47.6, 96.1, 2),
    coin(V, 'v-ridge', -50.3, 95.2, 2),
    coin(V, 'v-terrace', -50.8, 100.2, 3),
    coin(V, 'v-eave', -51.3, 96.8, 1),
    coin(V, 'v-wall-high', -44.0, 96.1, 4, { lift: HIGH_LIFT, challenge: 'high' }),
    coin(V, 'v-terrace-glide', -57.6, 99.9, 5, { from: [-50.3, 99.9], lift: 0.1, challenge: 'glide' }),
  ],
};

// behind the market row: a stack of crates and jars by the back doors
const market: Site = {
  id: 'v-market', region: V, at: { x: 12, z: 111.4 },
  props: [
    { kind: 'crate', x: 9.7, z: 111.3, h: 0.5, w: 0.9, ry: 0.1 },
    { kind: 'crate', x: 10.8, z: 111.1, h: 1.0, w: 1.0, ry: 0.22 },
    { kind: 'crate', x: 12.0, z: 111.0, h: 1.5, w: 1.0, ry: -0.05 },
    { kind: 'crate', x: 13.1, z: 111.2, h: 2.0, w: 0.95, ry: 0.12 },
    { kind: 'jar', x: 14.4, z: 111.6, h: 0.55, r: 0.33 },
    { kind: 'jar', x: 8.7, z: 111.9, h: 0.45, r: 0.3 },
  ],
  coins: [
    coin(V, 'v-mk-jar', 14.4, 111.6, 1),
    coin(V, 'v-mk-mid', 10.8, 111.1, 1),
    coin(V, 'v-mk-top', 13.1, 111.2, 2),
    coin(V, 'v-mk-high', 13.1, 111.2, 4, { lift: HIGH_LIFT, challenge: 'high' }),
  ],
};

// ── 竹林 · at the grove's east edge: boulders and an old pine whose long limb you can walk up
const B = 'bamboo' as const;
const PINE_B = { x: -55.8, z: 37.6, ry: 0.53 };
const bambooPine: Site = {
  id: 'b-pine', region: B, at: { x: -53, z: 36.5 },
  props: [
    { kind: 'stone', x: -49.6, z: 34.4, h: 0.28, r: 0.5 },
    { kind: 'stone', x: -50.9, z: 34.6, h: 0.55, r: 0.6 },
    { kind: 'stone', x: -52.2, z: 35.2, h: 1.1, r: 0.55 },
    { kind: 'pine', x: PINE_B.x, z: PINE_B.z, ry: PINE_B.ry, h: 1.6, low: 2.35, w: 3.0 },
  ],
  coins: [
    coin(B, 'b-stone', -50.9, 34.6, 1),
    coin(B, 'b-stone2', -52.2, 35.2, 1),
    // on the limb, a metre out from the trunk; and high above it
    coin(B, 'b-limb', PINE_B.x + Math.cos(PINE_B.ry) * 1.1, PINE_B.z - Math.sin(PINE_B.ry) * 1.1, 2),
    coin(B, 'b-limb-high', PINE_B.x + Math.cos(PINE_B.ry) * 1.9, PINE_B.z - Math.sin(PINE_B.ry) * 1.9, 4, { lift: HIGH_LIFT, challenge: 'high' }),
  ],
};

// ── 梅岭 · stones up to a hidden lookout at the ridge's west edge (登高望远: see lookout.ts)
const P = 'plum' as const;
export const LOOKOUT = { x: -88.9, z: -86.6, h: 2.5 };
const lookout: Site = {
  id: 'p-look', region: P, at: { x: -85, z: -84.5 },
  props: [
    { kind: 'stone', x: -84.0, z: -83.0, h: 0.5, r: 0.55 },
    { kind: 'stone', x: -85.4, z: -83.6, h: 1.0, r: 0.55 },
    { kind: 'stone', x: -86.3, z: -84.9, h: 1.5, r: 0.6 },
    { kind: 'stone', x: -87.4, z: -85.9, h: 2.0, r: 0.6 },
    { kind: 'slab', x: LOOKOUT.x, z: LOOKOUT.z, h: LOOKOUT.h, w: 2.3, d: 1.9, ry: 0.4 },
  ],
  coins: [
    coin(P, 'p-s1', -84.0, -83.0, 1),
    coin(P, 'p-s2', -85.4, -83.6, 1),
    coin(P, 'p-s3', -86.3, -84.9, 1),
    coin(P, 'p-s4', -87.4, -85.9, 1),
    coin(P, 'p-top', LOOKOUT.x + 0.5, LOOKOUT.z + 0.2, 2),
    coin(P, 'p-top-high', LOOKOUT.x - 0.3, LOOKOUT.z - 0.2, 5, { lift: HIGH_LIFT, challenge: 'high' }),
    // out over the western drop: float down to it
    coin(P, 'p-glide', LOOKOUT.x - 7.0, LOOKOUT.z - 1.6, 5, { from: [LOOKOUT.x, LOOKOUT.z], lift: 0.1, challenge: 'glide' }),
  ],
};

// ── 山寺 · a stair of stones up the rock face beside the waterfall to a ledge in its spray
const M = 'mountain' as const;
const falls: Site = {
  id: 'm-falls', region: M, at: { x: 51.5, z: -97.6 },
  props: [
    { kind: 'stone', x: 51.2, z: -98.3, h: 0.5, r: 0.5 },
    { kind: 'stone', x: 52.0, z: -99.3, h: 1.0, r: 0.5 },
    { kind: 'stone', x: 51.5, z: -100.4, h: 1.5, r: 0.5 },
    { kind: 'slab', x: 52.4, z: -101.3, h: 2.0, w: 1.1, d: 0.9, ry: 0.3 },
    { kind: 'slab', x: 53.3, z: -100.7, h: 2.5, w: 1.0, d: 0.9, ry: -0.2 },
    { kind: 'slab', x: 54.1, z: -101.7, h: 3.0, w: 1.5, d: 1.1, ry: 0.1 },
  ],
  coins: [
    // (none on the first stone: the slope behind it comes up level with its top)
    coin(M, 'm-f3', 51.5, -100.4, 1),
    coin(M, 'm-f5', 53.3, -100.7, 2),
    coin(M, 'm-ledge', 54.1, -101.7, 3),
    coin(M, 'm-ledge-high', 54.1, -101.7, 5, { lift: HIGH_LIFT, challenge: 'high' }),
  ],
};

// an old pine on the terrace east of the pagoda, above the runnel
const PINE_M = { x: 69.6, z: -125.6, ry: -2.159 };
const pagodaPine: Site = {
  id: 'm-pine', region: M, at: { x: 67, z: -125 },
  props: [
    { kind: 'stone', x: 66.4, z: -121.8, h: 0.5, r: 0.55 },
    { kind: 'stone', x: 67.6, z: -122.6, h: 1.0, r: 0.5 },
    { kind: 'pine', x: PINE_M.x, z: PINE_M.z, ry: PINE_M.ry, h: 1.5, low: 2.2, w: 2.5 },
  ],
  coins: [
    coin(M, 'm-p1', 66.4, -121.8, 1),
    coin(M, 'm-p2', 67.6, -122.6, 1),
    coin(M, 'm-limb', PINE_M.x + Math.cos(PINE_M.ry) * 1.0, PINE_M.z - Math.sin(PINE_M.ry) * 1.0, 2),
    coin(M, 'm-limb-high', PINE_M.x + Math.cos(PINE_M.ry) * 1.6, PINE_M.z - Math.sin(PINE_M.ry) * 1.6, 4, { lift: HIGH_LIFT, challenge: 'high' }),
  ],
};

// ── 荷塘 · scholar rocks (太湖石) on the south shore, each a jump taller than the last
const L = 'lake' as const;
const rocks: Site = {
  id: 'l-rocks', region: L, at: { x: 100, z: 45 },
  props: [
    { kind: 'stone', x: 97.4, z: 46.4, h: 0.45, r: 0.5 },
    { kind: 'rock', x: 98.6, z: 45.7, h: 1.0, r: 0.65, seed: 3 },
    { kind: 'rock', x: 99.9, z: 44.9, h: 1.5, r: 0.6, seed: 5 },
    { kind: 'rock', x: 101.2, z: 45.6, h: 2.05, r: 0.55, seed: 7 },
    { kind: 'rock', x: 102.3, z: 44.5, h: 2.55, r: 0.52, seed: 11 },
  ],
  coins: [
    coin(L, 'l-s0', 97.4, 46.4, 1),
    coin(L, 'l-ra', 98.6, 45.7, 1),
    coin(L, 'l-rb', 99.9, 44.9, 1),
    coin(L, 'l-rc', 101.2, 45.6, 1),
    coin(L, 'l-rd', 102.3, 44.5, 3),
    coin(L, 'l-rd-high', 102.3, 44.5, 5, { lift: HIGH_LIFT, challenge: 'high' }),
    coin(L, 'l-glide', 106.8, 48.6, 5, { from: [102.3, 44.5], lift: 0.1, challenge: 'glide' }),
  ],
};

export const SITES: Site[] = [yard, market, bambooPine, lookout, falls, pagodaPine, rocks];

/**
 * Coins on what the places themselves built (a bridge's crown, a pavilion's floor, the bell
 * platform): placed on whatever surface is there, skipped if it turns out to be water.
 */
export const DECK_COINS: CoinSpot[] = [
  coin('village', 'v-bridge', ANCHORS.villageBridge.x, ANCHORS.villageBridge.z, 1),
  coin('lake', 'l-island', ANCHORS.lakeIsland.x + 1.2, ANCHORS.lakeIsland.z - 0.8, 2),
];
