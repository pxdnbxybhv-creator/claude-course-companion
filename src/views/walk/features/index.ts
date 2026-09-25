// STUB — features that dress the 3D world: festival easter eggs, collectibles, critters.
import type { FestivalKey, WorldFeature } from '../types';

/** Every festival with an easter egg, in calendar order, for the preview picker. */
export const FESTIVALS: { key: FestivalKey; zh: string; en: string }[] = [];

/** The festivals whose easter eggs apply on this date (local calendar). */
export function festivalsOn(date: Date): FestivalKey[] {
  void date;
  return [];
}

/** All features; each decides in init() whether it applies (by ctx.env.festivals, season, time…). */
export const FEATURES: WorldFeature[] = [];
