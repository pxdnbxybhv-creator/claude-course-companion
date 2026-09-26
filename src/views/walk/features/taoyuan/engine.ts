// What the world core offers the valley beyond WorldCtx (see world/index.ts WorldExtras and
// world/sky.ts setMood), typed, with gentle fallbacks where a core does not have it (the lab, tests).
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { RegionId } from '../../map';
import type { SkyMood } from '../../world/sky';
import type { TimeOfDay } from '../../../../ink/scene-types';

export type { SkyMood };

export interface CinematicOpts {
  /** Where the camera goes (world). */
  to: { x: number; y: number; z: number };
  /** What it looks at (world). */
  look: { x: number; y: number; z: number };
  /** Seconds to get there (eased; default 2). Reduced motion: a cut. */
  secs?: number;
  /** Seconds to hold there before the view is handed back (default 0). */
  hold?: number;
}

export interface Engine {
  /** A scripted camera move; resolves when the view is handed back. */
  cinematic(o: CinematicOpts): Promise<void>;
  endCinematic(): void;
  /** The arrival banner and the visit flag for a place (a pocket region announces itself only on cue). */
  arrive(id: RegionId): void;
  /** Turn the view to look along a heading (as Player.heading), at once. */
  faceView(heading: number): void;
  /** Look again at where the walker is now (pocket mode, region, music), not at the next check. */
  restream(): void;
  /** The photo camera's fence inside the pocket (null: the default disc). */
  photoFence(fn: ((p: { x: number; y: number; z: number }, walker: { x: number; y: number; z: number }) => void) | null): void;
  /** The pocket region the walker is in (null outside). */
  pocket(): RegionId | null;
  /** The valley clock's sky (null: the hour's own), turning over `secs`. */
  setMood(mood: SkyMood | null, o?: { secs?: number; hour?: number }): void;
  moodNow(): SkyMood | null;
  /** The hour the mood paints (常 resolved from the world's own hour), or null without a mood. */
  moodTod(): TimeOfDay | null;
  /** An effect's fog over the mood, or null. */
  setFog(o: { near: number; far: number; color?: string } | null): void;
  /** The light falling on painted things now (the sky's tint), if the core says. */
  skyTint(): T.Color | null;
}

type Extras = Partial<Omit<Engine, 'setMood' | 'moodNow' | 'moodTod' | 'setFog' | 'skyTint'>>;
type SkyX = { setMood?: (m: SkyMood | null, o?: { secs?: number; hour?: number }) => void; moodNow?: SkyMood | null; moodTod?: TimeOfDay | null; setFog?: (o: { near: number; far: number; color?: string } | null) => void; tint?: T.Color };

const cache = new WeakMap<WorldCtx, Engine>();

/** The core's extras for this world. */
export function engine(ctx: WorldCtx): Engine {
  let e = cache.get(ctx);
  if (e) return e;
  const x = ctx as WorldCtx & Extras;
  const sky = ctx.sky as WorldCtx['sky'] & SkyX;
  e = {
    cinematic: (o) => {
      if (x.cinematic) return x.cinematic(o);
      // (a core without scripted moves: a framing of the point, as games do)
      try { ctx.frameCamera(o.look.x, o.look.z, o.look.y, (o.secs ?? 2) + (o.hold ?? 0)); } catch { /* optional */ }
      return new Promise((r) => setTimeout(r, ((o.secs ?? 2) + (o.hold ?? 0)) * 1000));
    },
    endCinematic: () => x.endCinematic?.(),
    arrive: (id) => x.arrive?.(id),
    faceView: (h) => x.faceView?.(h),
    restream: () => x.restream?.(),
    photoFence: (fn) => x.photoFence?.(fn),
    pocket: () => (x.pocket ? x.pocket() : null),
    // (a mood only inside the pocket: an effect still running as the walker leaves must not paint the world outside)
    setMood: (m, o) => { if (m !== null && x.pocket && !x.pocket()) return; sky.setMood?.(m, o); },
    moodNow: () => sky.moodNow ?? null,
    moodTod: () => sky.moodTod ?? null,
    setFog: (o) => sky.setFog?.(o),
    skyTint: () => sky.tint ?? null,
  };
  cache.set(ctx, e);
  return e;
}
