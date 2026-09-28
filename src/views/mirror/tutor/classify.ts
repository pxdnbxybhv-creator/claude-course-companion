// 水月幻镜 · which between-wave action a commit was (d-tutorial §1.2): a pure diff of the run before
// and after. The coach hears 'act' events from it; the real session never needs it.
import type { RunSave } from '../types';
import type { RunAct } from './events';

export function classify(prev: RunSave, next: RunSave): { a: RunAct; slot?: number } | null {
  if (prev === next) return null;
  const p = prev.pending, n = next.pending;
  if (p.start && p.start.length && !(n.start && n.start.length)) return { a: 'start' };
  if (n.cards < p.cards) return { a: 'card' };
  if (n.crates < p.crates) return { a: 'crate' };
  if (n.hearts.length < p.hearts.length) return { a: 'heart' };
  const ps = prev.shop, ns = next.shop;
  if (ps && ns && ps.wave === ns.wave) {
    if (ns.k !== ps.k || ns.free !== ps.free) return { a: 'reroll' };
    for (let i = 0; i < Math.max(ps.slots.length, ns.slots.length); i++) {
      const a = ps.slots[i] ?? null, b = ns.slots[i] ?? null;
      if (a && !b) return { a: 'buy', slot: i };
      if (a && b && a.locked !== b.locked) return { a: 'lock', slot: i };
    }
  }
  if (next.weapons.length === prev.weapons.length - 1) {
    return next.moon > prev.moon ? { a: 'sell' } : { a: 'merge' };
  }
  return null;
}
