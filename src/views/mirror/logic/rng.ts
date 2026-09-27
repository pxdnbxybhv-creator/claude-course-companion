// 水月幻镜 · seeded streams. Everything random in logic, engine and content comes from here:
// rngFor(seed, wave, stream, k) is a pure function of its arguments, so a reload replays exactly.
import { hashString, makeRng, mixSeed, type Rng } from '../../../core/rng';

export type { Rng };

/** Stream names (API.md §1): spawn, shop, card, crate, heart, coin, start, engine, content, mutator. */
export type Stream = 'spawn' | 'shop' | 'card' | 'crate' | 'heart' | 'coin' | 'start' | 'engine' | 'content' | 'mutator' | (string & {});

const streamSalt = new Map<string, number>();
function salt(stream: string): number {
  let s = streamSalt.get(stream);
  if (s === undefined) { s = hashString('mirror:' + stream); streamSalt.set(stream, s); }
  return s;
}

/** A generator for (seed, wave, stream, k); the same arguments always give the same sequence. */
export function rngFor(seed: number, wave: number, stream: Stream, k = 0): Rng {
  return makeRng(mixSeed(mixSeed(mixSeed(seed >>> 0, wave | 0), salt(stream)), k | 0));
}

/** Index of a weighted pick (weights ≥ 0); −1 when every weight is 0. */
export function weighted(rng: () => number, weights: readonly number[]): number {
  let tot = 0;
  for (const w of weights) tot += Math.max(0, w);
  if (tot <= 0) return -1;
  let r = rng() * tot;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Roll a tier 1..4 from percent odds [凡, 灵, 仙, 神]. */
export function rollTier(rng: () => number, odds: readonly number[]): 1 | 2 | 3 | 4 {
  let r = rng() * 100;
  for (let i = 0; i < 4; i++) {
    r -= odds[i];
    if (r < 0) return (i + 1) as 1 | 2 | 3 | 4;
  }
  return 1;
}

/** `n` distinct picks from `list` (fewer if the list is shorter), in pick order. */
export function pickDistinct<T>(rng: () => number, list: readonly T[], n: number): T[] {
  const pool = list.slice();
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
