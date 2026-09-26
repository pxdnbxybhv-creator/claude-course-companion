// An animal's prompt that gives way to everything else. The core offers whichever prompt is nearest
// within its reach, and a pet trotting at your heels (a parrot on your shoulder) is always nearest —
// so it would take the E key from the ledger, the build gate, every NPC and 奇遇 you walk up to.
// Until the core has a "low priority" flag, the animal's prompt is set on the line from you toward
// the animal, just beyond the reach of every other prompt: anything else in range is nearer and wins,
// and pressing E still turns you toward the animal.
import type { Interactable } from '../../../types';

/** Farther than any other prompt's reach (they are 1.4–3 m). */
export const YIELD_AT = 3.3;

/**
 * Place `it` for this frame: offered (low priority) when `on`, with the nearer of several animals
 * winning; else out of reach. (px, py, pz) is the walker, (ax, az) the animal.
 */
export function yieldPrompt(it: Interactable, on: boolean, px: number, py: number, pz: number, ax: number, az: number, heading: number): void {
  if (!on) { it.radius = 0; return; }
  const dx = ax - px, dz = az - pz;
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-3 ? dx / d : Math.sin(heading), uz = d > 1e-3 ? dz / d : Math.cos(heading);
  const r = YIELD_AT + Math.min(d, 5) * 0.02;
  it.position.set(px + ux * r, py, pz + uz * r);
  it.radius = r + 0.05;
}
