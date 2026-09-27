// 水月幻镜 · shared helpers for owning items and weapons, and the pools the shop, crates and 镜心 draw from.
import { ITEM_REG, STARTER_ITEMS, STARTER_WEAPONS, WEAPON_REG, type ItemId, type WeaponId } from '../ids';
import type { RunSave, Tier, Unlocks } from '../types';
import { COMPANIONS, ITEMS, WEAPONS } from '../data';
import { effectsOf } from './formulas';

/** Everything open (tests, the sim, the owner's lab). */
export function allUnlocked(): Unlocks {
  return { weapons: new Set(WEAPON_REG.map((w) => w.id)), items: new Set(ITEM_REG.map((i) => i.id)) };
}
/** A fresh account: the 18 starter weapons and 53 starter items. */
export function starterUnlocks(): Unlocks {
  return { weapons: new Set(STARTER_WEAPONS), items: new Set(STARTER_ITEMS) };
}

export const itemCount = (run: Pick<RunSave, 'items'>, id: ItemId) => run.items[id] ?? 0;
export const itemMaxed = (run: Pick<RunSave, 'items'>, id: ItemId) => {
  const m = ITEMS[id].max;
  return m > 0 && itemCount(run, id) >= m;
};
/** 破釜沉舟: no more rerolls or locks. */
export function noReroll(run: RunSave): boolean {
  return effectsOf(run).some(({ e }) => e.hook === 'shop' && e.do === 'noReroll');
}

/** Take an item: +1 count; 破釜沉舟 clears every lock in the open shop. */
export function addItem(run: RunSave, id: ItemId): RunSave {
  const items = { ...run.items, [id]: itemCount(run, id) + 1 };
  let next: RunSave = { ...run, items, lastBuy: id };
  if (noReroll(next) && next.shop) next = { ...next, shop: { ...next.shop, slots: next.shop.slots.map((s) => (s ? { ...s, locked: false } : s)) } };
  return next;
}

/** Items of tier t the run may be offered at shop wave w (unlocked, not maxed, 神 from wave 8). */
export function itemPool(run: RunSave, unlocks: Unlocks, t: Tier, w: number): ItemId[] {
  const out: ItemId[] = [];
  for (const r of ITEM_REG) {
    const it = ITEMS[r.id];
    if (it.tier !== t || !unlocks.items.has(r.id) || itemMaxed(run, r.id)) continue;
    if ((it.from ?? 0) > w) continue;
    out.push(r.id);
  }
  return out;
}
/** Weapons the run's shop may roll (unlocked; 大橘 no 重器/弓弩, 关公 no 暗器). */
export function weaponPool(run: Pick<RunSave, 'char'>, unlocks: Unlocks): WeaponId[] {
  const bans = COMPANIONS[run.char].bans;
  return WEAPON_REG.map((w) => w.id).filter((id) => unlocks.weapons.has(id) && !WEAPONS[id].classes.some((c) => bans.includes(c)));
}
