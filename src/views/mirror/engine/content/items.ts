// 水月幻镜 · m8 · the new items' engine content (items.md §R.5, hooks.md §4): item Behaviours and the item hooks
// on the World. Owned by ITEMS.
//   ITEM_BEHAVIOURS    CONTENT.items: one Behaviour per held item that needs bespoke code; World.begin starts it after
//                      the passive with arg = the count held, and it gets tick / on(hit, crit, kill, dodge, hurt,
//                      pickup, cast) / lethal like any content Behaviour (I9). The 26 need none so far: their ops are
//                      generic readers in engine/effects.ts (Mods) and the World's m8:items block.
//   registerItemHooks  called by World.begin every wave after it resets the m8 hook arrays: the item ops start clean,
//                      onHurt buffs listen on w.afterHurt, 醉卧沙场 pushes onto w.hurtScalers, 千金散尽 onto
//                      w.afterHurt, 月华如练 sets w.onStream and 饮鸩止渴 lowers the starting 气血.
// This module imports types only (World imports it).
import type { ItemId } from '../../ids';
import type { Behaviour } from '../../types';
import type { World } from '../world';

export const ITEM_BEHAVIOURS: Partial<Record<ItemId, Behaviour>> = {};

/** The held items' world hooks for this wave (World.begin, every wave, after the reset). */
export function registerItemHooks(w: World): void {
  w.itemBegin();
  const m = w.mods;
  // I2: buffs on being hit ride the afterHurt seam (a blow that landed; DoTs never reach it)
  if (m.evBuffs.some((b) => b.hook === 'onHurt')) w.afterHurt.push(() => w.itemBuffs('onHurt', -1));
  // 醉卧沙场 (P10, 'guard'): every blow and DoT × (1 − min(max, pct × floor(醉 / per)) / 100), before armour
  if (m.guard.length) {
    const G = m.guard;
    w.hurtScalers.push(() => {
      if (!w.drunkOn || w.drunk <= 0) return 1;
      let x = 1;
      for (let k = 0; k < G.length; k++) x *= 1 - Math.min(G[k].max, G[k].pct * Math.floor(w.drunk / G[k].per)) / 100;
      return x;
    });
  }
  // 千金散尽 (P11, 'scatter'): a blow that landed spills 月华 from your hand (World.itemScatter)
  if (m.scatter) w.afterHurt.push(() => w.itemScatter());
  // 月华如练 (P12, 'stream'): 月华 flying to you cuts through the crowd (World.itemStream)
  if (m.stream) w.onStream = (i) => w.itemStream(i);
  // 饮鸩止渴 (P13, 'hpPct'): the wave starts at the lowest hpPct held of max 气血 (begin has just set hp = hpMax)
  if (m.hpPct < 100) w.hp = Math.max(1, Math.round((w.hpMax * m.hpPct) / 100));
}
