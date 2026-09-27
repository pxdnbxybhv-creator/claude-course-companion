// 桃源 · 二期: the one idempotent restore (spec §1). Every stop, skip, way out and dispose runs it: the
// lens, the time scale, the lent hand, the freeze, the scripted camera, the peaches' see-through focus,
// every borrowed villager, and whatever else was deferred to it. It undoes only what was armed since
// the last restore, so a second call records nothing new. Pure (the world is handed in): the 特写's
// tests run it against a fake ctx. Owner: L.
import type { WorldCtx } from '../../../types';
import { engine } from '../engine';
import type { VillagerKey } from '../hooks';

/** What restore() puts back (life/index.ts hands the real world; tests hand a fake). */
export interface RestoreTarget {
  setTimeScale(f: number): void;
  player: { holdProp(p: null): unknown; freeze(on: boolean): void };
  lens(fov: null): void;
  endCinematic(): void;
  /** valley.ts seeFocus. */
  focus: { at: unknown };
  /** A villager's handle (story hooks), to put back on their routine. */
  villager(k: VillagerKey): { place(at: null): void } | null;
}

export interface Restorer {
  /** The world was changed (a claim was taken, a lens set): the next restore() puts it all back. */
  arm(): void;
  /** Armed and not yet restored. */
  readonly armed: boolean;
  /** A villager was borrowed: the next restore() gives them back (and arms). */
  borrowed(k: VillagerKey): void;
  /** One more undo for the next restore() (and arms). */
  defer(fn: () => void): void;
  restore(): void;
}

export function makeRestorer(t: RestoreTarget): Restorer {
  let armed = false;
  const borrowed = new Set<VillagerKey>();
  const undo: (() => void)[] = [];
  const safe = (fn: () => void) => { try { fn(); } catch (e) { console.error('[walk] taoyuan life restore', e); } };
  return {
    arm() { armed = true; },
    get armed() { return armed; },
    borrowed(k) { borrowed.add(k); armed = true; },
    defer(fn) { undo.push(fn); armed = true; },
    restore() {
      if (!armed) return;
      armed = false;
      // (the deferred undos first: a panel removed before the camera comes back, a theme handed back)
      for (const fn of undo.splice(0).reverse()) safe(fn);
      safe(() => t.endCinematic());
      safe(() => t.lens(null));
      safe(() => t.setTimeScale(1));
      safe(() => t.player.holdProp(null));
      safe(() => t.player.freeze(false));
      safe(() => { t.focus.at = null; });
      for (const k of [...borrowed]) safe(() => t.villager(k)?.place(null));
      borrowed.clear();
    },
  };
}

/**
 * The restore target of a world: its time scale and walker, the engine's lens and scripted camera
 * (engine(ctx), with its fallbacks: a fake ctx in a test records what it is given), the peaches'
 * focus (valley.ts seeFocus) and the story's villagers.
 */
export function restoreTargetOf(ctx: WorldCtx, focus: { at: unknown }, villager: RestoreTarget['villager']): RestoreTarget {
  const eng = engine(ctx);
  return {
    setTimeScale: (f) => ctx.setTimeScale(f),
    player: { holdProp: (p) => ctx.player.holdProp(p), freeze: (on) => ctx.player.freeze(on) },
    lens: (f) => eng.lens(f),
    endCinematic: () => eng.endCinematic(),
    focus,
    villager,
  };
}
