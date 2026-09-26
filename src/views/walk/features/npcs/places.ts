// Where the people of the painting go (pure data, tested): the peddler's round and the places the
// lost page boy and his master may be on a given day.
import type { RegionId, XZ } from '../../map';
import type { RouteStop } from './logic';

/** The peddler's round: the market, over the bridge to the garden gate, the lotus dock, and back (the gate leg
 * passes a metre north of the stone by the gate; the DEV build samples the whole round against the ground). */
const OUT: RouteStop[] = [
  { x: 2, z: 94.5 }, { x: 1.8, z: 91 }, { x: 0.5, z: 81 }, { x: 0, z: 71.5 }, { x: -1.1, z: 66 }, { x: -1.5, z: 61.5 }, { x: -2.5, z: 58.5 }, { x: -2.2, z: 54 }, { x: 0, z: 40 },
];
export const PEDDLER_ROUTE: RouteStop[] = [
  { x: 12, z: 96.5, dwell: 150, id: 'market' },
  ...OUT,
  { x: -2, z: 30, dwell: 100, id: 'gate' },
  { x: 4, z: 25.5 }, { x: 30, z: 28 }, { x: 52, z: 30 },
  { x: 58, z: 32.5, dwell: 100, id: 'dock' },
  { x: 52, z: 30 }, { x: 30, z: 28 }, { x: 4, z: 25.5 }, { x: -2, z: 30 },
  ...[...OUT].reverse(),
];
export const PEDDLER_SPEED = 1.0;
export interface ShutongSpot { region: RegionId; child: XZ; master: XZ }
export const SHUTONG_SPOTS: ShutongSpot[] = [
  { region: 'village', child: { x: 6.5, z: 82.5 }, master: { x: 9.5, z: 89 } },
  { region: 'lake', child: { x: 62, z: 35 }, master: { x: 76, z: 39.5 } },
  { region: 'bamboo', child: { x: -70, z: 31.5 }, master: { x: -78, z: 32.5 } },
  { region: 'plum', child: { x: -66, z: -58 }, master: { x: -70, z: -71 } },
  { region: 'mountain', child: { x: 27, z: -89.5 }, master: { x: 49, z: -94 } },
];

