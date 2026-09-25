// Features that dress the 3D world: festival easter eggs, collectibles, critters, hidden delights.
// Each decides in init() whether it applies (by ctx.env.festivals, season, time of day…).
import type { FestivalKey, WorldCtx, WorldFeature } from '../types';
import { FESTIVALS, festivalOverride, festivalsOn as calendarFestivals } from './calendar';
import { LIFE } from './life';
import { midautumn } from './midautumn';
import { HIDDEN } from './hidden';
import { FESTIVE } from './festive';
import { SEASONAL } from './seasonal';
import { closeSfx } from './sfx';
import { disposeShared, type FreshFeature } from './kit';
import { MINIGAME_FEATURES } from './minigames';

export { FESTIVALS };

/** The festivals whose easter eggs apply on this date (local calendar). `?fest=a,b` overrides (preview). */
export function festivalsOn(date: Date): FestivalKey[] {
  return festivalOverride() ?? calendarFestivals(date);
}

/**
 * Last of all: compile every material the features added before it is first seen, so walking up to
 * a lantern or a mooncake never stalls on a shader compile (asynchronous where the GPU allows), and
 * give the world-wide shared materials back when the world goes.
 */
function finale(): WorldFeature {
  let world: WorldCtx | null = null;
  return {
    id: 'finale',
    init(ctx) {
      world = ctx;
      const r = ctx.renderer as WorldCtx['renderer'] & { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> };
      try {
        if (r.compileAsync) r.compileAsync(ctx.scene, ctx.camera).catch(() => {});
        else r.compile(ctx.scene, ctx.camera);
      } catch { /* a warm-up only */ }
    },
    dispose() {
      if (world) disposeShared(world);
      world = null;
      // closes the private sound-effects context (it reopens on the next sound)
      closeSfx();
    },
  };
}

const LIST: WorldFeature[] = [...LIFE, ...HIDDEN, midautumn, ...FESTIVE, ...SEASONAL, ...MINIGAME_FEATURES];

/** A fresh, independent instance of every feature (their Bags never cross worlds). */
function freshList(): WorldFeature[] {
  return [...LIST.map((f) => ((f as FreshFeature).fresh ? (f as FreshFeature).fresh() : f)), finale()];
}

/**
 * All features; each decides in init() whether it applies. Every pass over this list (the core walks
 * it once per world it builds) hands out fresh instances: a world abandoned while still starting up
 * and the new one that replaces it never share, or dispose, each other's props.
 */
export const FEATURES: WorldFeature[] = (() => {
  const list = freshList();
  Object.defineProperty(list, Symbol.iterator, { value: () => freshList()[Symbol.iterator](), enumerable: false });
  return list;
})();
