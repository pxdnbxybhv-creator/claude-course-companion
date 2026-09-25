// Where things are on the homestead plot (map.ts HOME_PLOT): cell centres, what the owner has built
// (read from home.value.items), the pet homes, the pond, and the places the residents go about their
// day (the kitchen, the beds, the study…), each resolved against what stands there, with a free spot
// beside it so nobody stands inside a wall.
import type { HomeItem } from '../../../../../app/home';
import { HOME_PLOT } from '../../../map';
import { itemPoint, itemPose, KIND } from '../catalog';
import type { HouseKind, Place } from './logic';

const HALF = HOME_PLOT.size / 2;
export const PLOT = { x0: HOME_PLOT.x - HALF, z0: HOME_PLOT.z - HALF, x1: HOME_PLOT.x + HALF, z1: HOME_PLOT.z + HALF, n: Math.round(HOME_PLOT.size / HOME_PLOT.cell) };

export interface Spot { x: number; z: number }
export interface Placed { item: HomeItem; x: number; z: number; w: number; d: number }

export function cellCentre(i: number, j: number): Spot {
  return { x: PLOT.x0 + (i + 0.5) * HOME_PLOT.cell, z: PLOT.z0 + (j + 0.5) * HOME_PLOT.cell };
}

/** Where an item stands: its centre and its size on the ground (turned by rot). */
export function placed(it: HomeItem): Placed {
  const p = itemPose(it);
  return { item: it, x: p.x, z: p.z, w: p.w * HOME_PLOT.cell, d: p.d * HOME_PLOT.cell };
}

/** Where a pet home's animal comes and goes (its door, in the world), or its front. */
export function doorOf(it: HomeItem): Spot {
  const k = KIND[it.kind];
  const d = k?.door ?? [0, (k?.d ?? 1) / 2 + 0.3];
  // step just outside the door
  const out = it.kind === 'pond' || it.kind === 'perch' ? 0 : 0.35;
  return itemPoint(it, d[0], d[1] + out);
}

export function inPlot(x: number, z: number, margin = 0.4): boolean {
  return x > PLOT.x0 + margin && x < PLOT.x1 - margin && z > PLOT.z0 + margin && z < PLOT.z1 - margin;
}

export function clampToPlot(p: Spot, margin = 0.6): Spot {
  return { x: Math.max(PLOT.x0 + margin, Math.min(PLOT.x1 - margin, p.x)), z: Math.max(PLOT.z0 + margin, Math.min(PLOT.z1 - margin, p.z)) };
}

/** The pet homes of a kind, in placing order. */
export function houses(items: readonly HomeItem[], kind: HouseKind): Placed[] {
  return items.filter((it) => it.kind === kind).map(placed);
}

/** Cells covered by something built (plus a margin of `pad` cells), as a set of i*256+j. */
export function occupancy(items: readonly HomeItem[], pad = 0, skip?: (it: HomeItem) => boolean): Set<number> {
  const s = new Set<number>();
  for (const it of items) {
    if (skip?.(it)) continue;
    const p = placed(it);
    const w = Math.round(p.w / HOME_PLOT.cell), d = Math.round(p.d / HOME_PLOT.cell);
    for (let a = -pad; a < w + pad; a++) for (let b = -pad; b < d + pad; b++) s.add((it.i + a) * 256 + (it.j + b));
  }
  return s;
}

/** The free cell (not built on) nearest to (x, z), searching outward; the point itself if none. */
export function freeNear(occ: Set<number>, x: number, z: number, maxR = 6): Spot {
  const ci = Math.floor((x - PLOT.x0) / HOME_PLOT.cell), cj = Math.floor((z - PLOT.z0) / HOME_PLOT.cell);
  for (let r = 0; r <= maxR; r++) {
    let best: Spot | null = null, bd = Infinity;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      const i = ci + a, j = cj + b;
      if (i < 1 || j < 1 || i >= PLOT.n - 1 || j >= PLOT.n - 1 || occ.has(i * 256 + j)) continue;
      const c = cellCentre(i, j);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return best;
  }
  return clampToPlot({ x, z });
}

const PET_HOMES = new Set(['doghouse', 'catbed', 'hutch', 'coop', 'pond', 'perch', 'pen']);

/** What kinds of built thing a place is drawn to (first match wins), and where it is otherwise. */
const PLACE: Record<Place, { re: RegExp | null; fallback: Spot }> = {
  gate: { re: null, fallback: { x: HOME_PLOT.gate.x - 1.4, z: HOME_PLOT.gate.z + 1.6 } },
  yard: { re: /^(well|table|bench|swing|lanterns?|osmanthus|peach|plum|rockery)$/, fallback: { x: HOME_PLOT.x + 5, z: HOME_PLOT.z } },
  kitchen: { re: /^(cottage|house)$/, fallback: { x: HOME_PLOT.x - 6, z: HOME_PLOT.z - 7 } },
  beds: { re: /^(farm|flowers|mums|bamboo)$/, fallback: { x: HOME_PLOT.x - 6, z: HOME_PLOT.z + 7 } },
  study: { re: /^(study|pavilion|table|bench)$/, fallback: { x: HOME_PLOT.x + 2, z: HOME_PLOT.z - 7 } },
  pond: { re: /^(pond|well)$/, fallback: { x: HOME_PLOT.x + 3, z: HOME_PLOT.z + 7 } },
  fence: { re: null, fallback: { x: HOME_PLOT.x, z: PLOT.z0 + 1 } },
  house: { re: /^(cottage|house|study)$/, fallback: { x: HOME_PLOT.x - 8, z: HOME_PLOT.z } },
};

/** A free standing spot for a place (beside the thing it is drawn to, if built). `salt` spreads people out. */
export function placeSpot(items: readonly HomeItem[], occ: Set<number>, place: Place, salt = 0): Spot {
  const def = PLACE[place];
  let target: Spot = def.fallback;
  if (def.re) {
    const hits = items.filter((it) => def.re!.test(it.kind) && (place === 'pond' || !PET_HOMES.has(it.kind)));
    if (hits.length) {
      const it = hits[salt % hits.length];
      const k = KIND[it.kind];
      if (place === 'pond') {
        // at the water's edge, on the side nearest the gate
        const p = placed(it);
        const dx = HOME_PLOT.gate.x - p.x, dz = HOME_PLOT.gate.z - p.z, L = Math.hypot(dx, dz) || 1;
        const reach = Math.max(p.w, p.d) / 2 + 0.5;
        target = { x: p.x + (dx / L) * reach, z: p.z + (dz / L) * reach };
      } else {
        // in front of it (things face +z in their own frame: a house's door, a desk's seat)
        target = itemPoint(it, ((salt % 3) - 1) * 0.8, (k?.d ?? 1) / 2 + 0.9);
      }
    }
  }
  if (place === 'fence') {
    // somewhere along the inside of the fence (salt picks where)
    const k = ((salt * 0.37) % 1 + 1) % 1;
    const side = Math.floor(k * 4), f = (k * 4) % 1;
    const m = 0.9;
    target = side === 0 ? { x: PLOT.x0 + m + f * (HOME_PLOT.size - 2 * m), z: PLOT.z0 + m }
      : side === 1 ? { x: PLOT.x0 + m, z: PLOT.z0 + m + f * (HOME_PLOT.size - 2 * m) }
      : side === 2 ? { x: PLOT.x0 + m + f * (HOME_PLOT.size - 2 * m), z: PLOT.z1 - m }
      : { x: PLOT.x1 - 2.2, z: PLOT.z0 + m + f * (HOME_PLOT.size - 2 * m) };
    return target;
  }
  if (place === 'gate') return target;
  const spread = { x: target.x + ((salt * 7) % 3 - 1) * 0.9, z: target.z + ((salt * 5) % 3 - 1) * 0.9 };
  return freeNear(occ, spread.x, spread.z);
}

/** The nearest point on the fence line (inside) from (x, z), and the outward normal there. */
export function fencePoint(x: number, z: number): { x: number; z: number; nx: number; nz: number } {
  const dW = x - PLOT.x0, dE = PLOT.x1 - x, dN = z - PLOT.z0, dS = PLOT.z1 - z;
  const m = Math.min(dW, dN, dS, dE + 99); // not the gate side
  const inset = 0.55;
  if (m === dW) return { x: PLOT.x0 + inset, z, nx: -1, nz: 0 };
  if (m === dN) return { x, z: PLOT.z0 + inset, nx: 0, nz: -1 };
  return { x, z: PLOT.z1 - inset, nx: 0, nz: 1 };
}
