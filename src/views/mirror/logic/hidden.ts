// 水月幻镜 · m8 · the hidden companions' unlock (hidden.md §2.2, PLAN D16 with the orchestrator's O2).
// Owned by HIDDEN (H1): 40重 on that map, from meta.bests: no save field, retroactive; the daily writes no bests
// and the tutorial and the sandbox never settle, so none of them can open one.
import type { MapId } from '../ids';
import { HIDDEN_CHARS, type HiddenId, type MirrorMeta } from '../types';

/** Which map's 40重 opens which companion. */
export const HIDDEN_BY_MAP: Readonly<Record<MapId, HiddenId>> = { lake: 'yuenv', forest: 'shangui', palace: 'houyi' };
/** The wave to clear on that map. */
export const HIDDEN_WAVE = 40;
/** The lowest 镜境 that counts: 0 = any, 闲游 included (the owner's words 「分别在三个地图达到四十重之后解锁」; O2). */
export const HIDDEN_MIN_DIFF = 0;

/** Deepest wave cleared on a map at diff ≥ minDiff, over every companion, 誓 and 素镜 (bests keys `char|map|diff|heat(|p)`). */
export function deepestOn(meta: Pick<MirrorMeta, 'bests'>, map: MapId, minDiff = HIDDEN_MIN_DIFF): number {
  let W = 0;
  for (const k in meta.bests) {
    const [, m, d] = k.split('|');
    if (m !== map || !(Number(d) >= minDiff)) continue;
    const w = meta.bests[k as keyof MirrorMeta['bests']]?.wave ?? 0;
    if (w > W) W = w;
  }
  return W;
}

/** Hidden companions this account has earned (their map's deepest ≥ HIDDEN_WAVE), in HIDDEN_CHARS order. */
export function hiddenOpen(meta: Pick<MirrorMeta, 'bests'>): HiddenId[] {
  const out: HiddenId[] = [];
  for (const map of Object.keys(HIDDEN_BY_MAP) as MapId[]) {
    if (deepestOn(meta, map) >= HIDDEN_WAVE) out.push(HIDDEN_BY_MAP[map]);
  }
  return out.sort((a, b) => HIDDEN_CHARS.indexOf(a) - HIDDEN_CHARS.indexOf(b));
}

/** The sealed 「？」 tiles show once any map's deepest (any 镜境) reaches this (hidden.md §2.3, PLAN D17). */
export const HIDDEN_TEASE_WAVE = 30;
/** Should the sealed hidden tiles show at all (before the code; the code shows them anyway)? */
export function hiddenTease(meta: Pick<MirrorMeta, 'bests'>): boolean {
  for (const map of Object.keys(HIDDEN_BY_MAP) as MapId[]) if (deepestOn(meta, map, 0) >= HIDDEN_TEASE_WAVE) return true;
  return false;
}

/** The map whose 40重 opens a hidden companion. */
export function hiddenMap(id: HiddenId): MapId {
  return (Object.keys(HIDDEN_BY_MAP) as MapId[]).find((m) => HIDDEN_BY_MAP[m] === id) ?? 'lake';
}
