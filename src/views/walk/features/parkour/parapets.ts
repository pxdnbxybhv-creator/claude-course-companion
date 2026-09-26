// The stone arched bridges' parapets (the core's own bridges: where the stream meets the lake,
// where the river leaves it, the far west crossing): their tops become narrow walkable beams, and
// the post at the crown a little perch — jump up from the deck and walk the rail. Nothing is drawn
// here: the decks follow the parapet the core already built (world/bridges.ts), exactly.
import type { WorldCtx } from '../../types';
import { regionAt } from '../../map';
import { bridgeSpecs, deckY as bridgeDeckY } from '../../world/bridges';
import { registerDeck } from '../../regions/water-decks';
import type { Bag } from '../kit';
import type { CoinSpot } from './coins';

/** Registers the parapet decks of every core bridge still standing; returns their coin spots. */
export function buildParapets(bag: Bag, _ctx: WorldCtx): CoinSpot[] {
  const coins: CoinSpot[] = [];
  for (const b of bridgeSpecs()) {
    if (b.village) continue;
    // a place that built its own bridge here stood the core's down
    if (bridgeDeckY(b.x, b.z) === null) continue;
    const ext = b.L + 0.5;
    const deck = (a: number) => { const u = Math.max(-1, Math.min(1, a / b.L)); return b.y0 + b.H * (1 - u * u); };
    const region = regionAt(b.x, b.z) ?? 'path';
    for (const side of [-1, 1]) {
      // the parapet: 0.14 m thick at the deck's edge, its top 0.5 m above the deck
      const off = side * (b.hw - 0.07);
      const cx = b.x - b.az * off, cz = b.z + b.ax * off;
      bag.onDispose(registerDeck({ id: `parkour:rail:${b.id}:${side}`, cx, cz, ax: b.ax, az: b.az, hl: ext - 0.12, hw: 0.17, y: (s) => deck(s) + 0.5 }));
      // the post at the crown stands 0.18 higher: a perch
      bag.onDispose(registerDeck({ id: `parkour:post:${b.id}:${side}`, cx, cz, ax: b.ax, az: b.az, hl: 0.12, hw: 0.17, y: () => deck(0) + 0.68 }));
    }
    const post = { x: b.x - b.az * (b.hw - 0.07), z: b.z + b.ax * (b.hw - 0.07) };
    const along = b.L * 0.55;
    const rail = { x: b.x + b.ax * along + b.az * (b.hw - 0.07), z: b.z + b.az * along - b.ax * (b.hw - 0.07) };
    coins.push({ id: `br-${b.id}-post`, region, x: post.x, z: post.z, value: 2, lift: 0.55 });
    coins.push({ id: `br-${b.id}-rail`, region, x: rail.x, z: rail.z, value: 1, lift: 0.5 });
  }
  return coins;
}
