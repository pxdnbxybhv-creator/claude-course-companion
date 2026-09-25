// Where a waypoint stele (驿碑) stands and where fast travel sets you down beside it. Pure numbers
// (no three.js), so the rules are tested: a stele stands on firm, level, dry ground, clear of props
// and off the path's tread; the traveller arrives a step in front of it, facing into the place.
import type { XZ } from '../map';

/** How near (m) the walker must come to a stele to light it. */
export const LIGHT_RADIUS = 3;

export interface SpotTest {
  /** Firm, dry, walkable ground at (x, z) (with a little clearance round props). */
  walkable(x: number, z: number): boolean;
  /** Ground height. */
  height(x: number, z: number): number;
  /** Distance to the nearest path's centre line (m); large when there is none. */
  pathDist?(x: number, z: number): number;
}

/** Is (x, z) a good footing for a stele of about r metres? */
export function goodSpot(x: number, z: number, t: SpotTest, r = 0.9, pathClear = 1.7): boolean {
  if (!t.walkable(x, z)) return false;
  const h = t.height(x, z);
  // the whole footprint on firm ground and nearly level (≤ ~0.35 m over its width)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!t.walkable(px, pz)) return false;
    if (Math.abs(t.height(px, pz) - h) > 0.35) return false;
  }
  if (t.pathDist && t.pathDist(x, z) < pathClear) return false;
  return true;
}

/**
 * The nearest good spot to (x, z): the spot itself if it is fine, else the first good one on
 * widening rings (within `reach` m). Returns the spot and how far it moved (null when none is found).
 */
export function findSpot(x: number, z: number, t: SpotTest, reach = 12): { x: number; z: number; moved: number } | null {
  if (goodSpot(x, z, t)) return { x, z, moved: 0 };
  for (let ring = 0.5; ring <= reach; ring += 0.5) {
    const n = Math.max(8, Math.round(ring * 8));
    let best: { x: number; z: number } | null = null;
    let bestPath = -1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
      if (!goodSpot(px, pz, t)) continue;
      // on the same ring, prefer the spot that stays nearest the path (a roadside stele)
      const d = t.pathDist ? -t.pathDist(px, pz) : 0;
      if (!best || d > bestPath) { best = { x: px, z: pz }; bestPath = d; }
    }
    if (best) return { ...best, moved: ring };
  }
  return null;
}

/**
 * Where travel sets you down: a step in front of the stele toward the place (`face`) and a little to
 * one side of it (so the stele never stands between the walker and the camera behind them), on
 * walkable ground, heading toward the place. Heading: 0 faces +z (atan2(dx, dz)).
 */
export function arrivalAt(stele: XZ, face: XZ, walkable: (x: number, z: number) => boolean, step = 1.8, aside = 1.4): { x: number; z: number; heading: number } {
  const dx = face.x - stele.x, dz = face.z - stele.z;
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l, uz = dz / l;
  // ahead and aside first, then a little further, then fanning round
  for (const dist of [step, step + 0.8, step + 1.8]) {
    for (const turn of [0, 0.35, -0.35, 0.8, -0.8]) {
      for (const side of [1, -1]) {
        const c = Math.cos(turn), s = Math.sin(turn);
        const vx = ux * c - uz * s, vz = ux * s + uz * c;
        const x = stele.x + vx * dist - vz * side * aside, z = stele.z + vz * dist + vx * side * aside;
        if (walkable(x, z)) return { x, z, heading: Math.atan2(face.x - x, face.z - z) };
      }
    }
  }
  const x = stele.x + ux * step - uz * aside, z = stele.z + uz * step + ux * aside;
  return { x, z, heading: Math.atan2(face.x - x, face.z - z) };
}

/** The waypoint the walker is close enough to light (the nearest unlit one within reach), or null. */
export function toLight<T extends XZ & { id: string }>(x: number, z: number, list: readonly T[], lit: (id: string) => boolean, reach = LIGHT_RADIUS): T | null {
  let best: T | null = null, bd = reach;
  for (const w of list) {
    if (lit(w.id)) continue;
    const d = Math.hypot(w.x - x, w.z - z);
    if (d <= bd) { bd = d; best = w; }
  }
  return best;
}
