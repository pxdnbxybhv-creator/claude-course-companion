// Features that dress the 3D world: festival easter eggs, collectibles, critters, hidden delights.
// Each decides in init() whether it applies (by ctx.env.festivals, season, time of day…).
import type { FestivalKey, WorldFeature } from '../types';
import { FESTIVALS, festivalOverride, festivalsOn as calendarFestivals } from './calendar';
import { LIFE } from './life';
import { midautumn } from './midautumn';
import { HIDDEN } from './hidden';
import { FESTIVE } from './festive';
import { SEASONAL } from './seasonal';
import { closeSfx } from './sfx';

export { FESTIVALS };

/** The festivals whose easter eggs apply on this date (local calendar). `?fest=a,b` overrides (preview). */
export function festivalsOn(date: Date): FestivalKey[] {
  return festivalOverride() ?? calendarFestivals(date);
}

/** All features; each decides in init() whether it applies. */
export const FEATURES: WorldFeature[] = [
  ...LIFE,
  ...HIDDEN,
  midautumn,
  ...FESTIVE,
  ...SEASONAL,
  // Last: closes the private sound-effects context when the world is torn down.
  { id: 'sfx', init() {}, dispose: closeSfx },
];
