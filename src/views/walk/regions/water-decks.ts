// Walkable surfaces built over water by the water regions: the village's arched stone bridge, the
// river steps, the lake dock, the zigzag boardwalk and the waterside pavilion, the moon bridge.
// The regions register them when they build; the world core can read them to let the player walk
// on them (deckY in groundY / isWalkable). Pure data + math: no three.js.
import type { XZ } from '../map';

export interface Deck {
  id: string;
  /** Oriented rectangle: centre, unit axis along its length, half length / half width. */
  cx: number; cz: number; ax: number; az: number; hl: number; hw: number;
  /** Walking height at signed distance s along the axis (−hl … hl). */
  y(s: number): number;
}

const decks = new Map<string, Deck>();

export function registerDeck(d: Deck): () => void {
  decks.set(d.id, d);
  return () => { if (decks.get(d.id) === d) decks.delete(d.id); };
}

/** All decks currently built. */
export function allDecks(): Deck[] {
  return [...decks.values()];
}

/** The walking height on a deck at (x, z), or null when (x, z) is on no deck. Highest deck wins. */
export function deckY(x: number, z: number): number | null {
  let best: number | null = null;
  for (const d of decks.values()) {
    const dx = x - d.cx, dz = z - d.cz;
    const s = dx * d.ax + dz * d.az;
    const q = -dx * d.az + dz * d.ax;
    if (Math.abs(s) > d.hl || Math.abs(q) > d.hw) continue;
    const y = d.y(s);
    if (best === null || y > best) best = y;
  }
  return best;
}

/** A straight deck from a to b of half width hw, at a constant height or a height profile. */
export function segmentDeck(id: string, a: XZ, b: XZ, hw: number, y: number | ((s: number) => number)): Deck {
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return {
    id, cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ax: (b.x - a.x) / L, az: (b.z - a.z) / L, hl: L / 2, hw,
    y: typeof y === 'number' ? () => y : y,
  };
}

// ── clearings: built-over ground (quays, paved squares, docks) where the core should not scatter
// grass, reeds or stones. Axis-aligned or oriented rectangles, registered by the regions.

export interface Clearing { cx: number; cz: number; ax: number; az: number; hl: number; hw: number }

const clearings = new Set<Clearing>();

export function registerClearing(c: Clearing): () => void {
  clearings.add(c);
  return () => { clearings.delete(c); };
}

/** True when (x, z) lies within `margin` of a clearing or a deck (nothing should grow there). */
export function clearedAt(x: number, z: number, margin = 0): boolean {
  const test = (c: Clearing) => {
    const dx = x - c.cx, dz = z - c.cz;
    return Math.abs(dx * c.ax + dz * c.az) <= c.hl + margin && Math.abs(-dx * c.az + dz * c.ax) <= c.hw + margin;
  };
  for (const c of clearings) if (test(c)) return true;
  for (const d of decks.values()) if (test(d)) return true;
  return false;
}

/** An axis-aligned clearing from (x0, z0) to (x1, z1). */
export function rectClearing(x0: number, z0: number, x1: number, z1: number): Clearing {
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ax: 1, az: 0, hl: Math.abs(x1 - x0) / 2, hw: Math.abs(z1 - z0) / 2 };
}
