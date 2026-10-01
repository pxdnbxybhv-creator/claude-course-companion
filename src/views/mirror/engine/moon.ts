// m8 · 月华 tiers (art.md §5.1, PLAN D20–D21): a haul is split greedily into 满月 (F.moonTiers[0] = 25),
// 月华珠 (F.moonTiers[1] = 5) and 月华 pieces of 1; a fractional remainder rides on the last piece (below 1
// it joins the piece before it). Ordinary kills (1–3) drop exactly as before the tiers. 蓄月 pays per whole
// point of a piece's worth (at least 1): the same draws the old 1-worth pieces made, so income is unchanged.
// Pure (no World): ITEMS' 千金散尽 and the tests use splitMoon too.
import { F } from '../data';
import { DK } from './consts';

/** The three 月华 pearl kinds (not 金月华 / 金鲤, which are gold and never split). */
export function isMoonKind(k: number): boolean {
  return k === DK.moonDrop || k === DK.moonThick || k === DK.moonFull;
}
/** Everything that is only 月华 when picked up (the pearls, 金月华, 金鲤). */
export function isMoonWorth(k: number): boolean {
  return k === DK.moonDrop || k === DK.moonThick || k === DK.moonFull || k === DK.goldShard || k === DK.carpGold;
}
/** The pearl a piece of this worth wears. */
export function moonKindOf(worth: number): number {
  const [big, mid] = F.moonTiers;
  return worth >= big - 1e-9 ? DK.moonFull : worth >= mid - 1e-9 ? DK.moonThick : DK.moonDrop;
}
/** 蓄月 draws for one piece picked up: per whole point of a pearl's worth (at least 1); gold is always 1. */
export function moonDraws(k: number, worth: number): number {
  return isMoonKind(k) ? Math.max(1, Math.floor(worth + 1e-9)) : 1;
}
/** The pieces of a haul, largest first (sums to `worth` within 0.001). `out` is cleared and reused when given. */
export function splitMoon(worth: number, out: number[] = []): number[] {
  out.length = 0;
  const [big, mid] = F.moonTiers;
  let left = worth;
  if (!(left > 0.001)) return out;
  while (left >= big - 1e-9) { out.push(big); left -= big; }
  while (left >= mid - 1e-9) { out.push(mid); left -= mid; }
  while (left > 0.001) {
    // one piece per whole point; a fractional remainder rides on the last (as before the tiers)
    const w = left >= 2 ? 1 : left;
    if (w < 1 && out.length) { out[out.length - 1] += w; break; }
    out.push(w);
    left -= w;
  }
  return out;
}
