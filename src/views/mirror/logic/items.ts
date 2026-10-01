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

// ── m8 · pure readers of the new item ops (PLAN §3.4 L2; function declarations: formulas.ts imports them)
/** The shop's tier floor (破釜沉舟 `tierFloor`): the largest `t` held, 1 when none. */
export function shopFloor(run: Pick<RunSave, 'items'>): Tier {
  let t = 1;
  for (const id in run.items) {
    if ((run.items[id as ItemId] ?? 0) <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) if (e.hook === 'shop' && e.do === 'tierFloor' && e.t > t) t = e.t;
  }
  return t as Tier;
}
/** 奇货可居: the shop never offers weapons again. */
export function noWeapons(run: Pick<RunSave, 'items'>): boolean {
  for (const id in run.items) {
    if ((run.items[id as ItemId] ?? 0) <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) if (e.hook === 'shop' && e.do === 'noWeapons') return true;
  }
  return false;
}
/** 触类旁通: extra pieces every held class counts toward its set (the sum of held `setPlus.n` × copies). */
export function setPlusOf(run: Pick<RunSave, 'items'>): number {
  let n = 0;
  for (const id in run.items) {
    const c = run.items[id as ItemId] ?? 0;
    if (c <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) if (e.hook === 'cond' && e.do === 'setPlus') n += e.n * c;
  }
  return n;
}
/** 画地为牢: the walking-speed cap as a multiple of F.baseSpeed (the smallest `moveCap.x` held); Infinity when
 *  none (no cap: 1 would cap every positive 身法 at the base pace). formulas.ts moveSpeedOf takes it. */
export function moveCapOf(run: Pick<RunSave, 'items'>): number {
  let x = Infinity;
  for (const id in run.items) {
    if ((run.items[id as ItemId] ?? 0) <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) if (e.hook === 'cond' && e.do === 'moveCap' && e.x < x) x = e.x;
  }
  return x;
}

/** 与虎谋皮: 镜印 every elite carries on top of its wave's (the sum of held `world.eliteAffix` × copies). */
export function eliteAffixOf(run: Pick<RunSave, 'items'>): number {
  let n = 0;
  for (const id in run.items) {
    const c = run.items[id as ItemId] ?? 0;
    if (c <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) if (e.hook === 'cond' && e.do === 'world' && e.eliteAffix) n += e.eliteAffix * c;
  }
  return n;
}

/** 货比三家: this shop's discount in % (each reroll here, free ones too, takes `pct` off, up to `max`); 0 when none. */
export function rerollOffPct(run: Pick<RunSave, 'items' | 'shop'>): number {
  const rolls = run.shop?.rolls ?? 0;
  if (rolls <= 0) return 0;
  let off = 0;
  for (const id in run.items) {
    const c = run.items[id as ItemId] ?? 0;
    if (c <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) if (e.hook === 'shop' && e.do === 'rerollOff') off = Math.max(off, Math.min(e.max, e.pct * rolls));
  }
  return off;
}
/** 点石成金: the upgrade rule held (the largest price factor x, the uses a shop n added), or null. */
export function upgradeRule(run: Pick<RunSave, 'items'>): { x: number; n: number } | null {
  let r: { x: number; n: number } | null = null;
  for (const id in run.items) {
    const c = run.items[id as ItemId] ?? 0;
    if (c <= 0) continue;
    for (const e of ITEMS[id as ItemId]?.fx ?? []) {
      if (e.hook === 'shop' && e.do === 'upgrade') r = r ? { x: Math.max(r.x, e.x), n: r.n + e.n * c } : { x: e.x, n: e.n * c };
    }
  }
  return r;
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
  let blocked: boolean | undefined;
  for (const r of ITEM_REG) {
    const it = ITEMS[r.id];
    // m8: a `wip` stub (a lane still building it) is offered nowhere: shop, 镜奁, 镜心, 行囊
    if (it.tier !== t || it.relic || it.wip || !unlocks.items.has(r.id) || itemMaxed(run, r.id)) continue;
    if ((it.from ?? 0) > w) continue;
    // m8 货比三家 (C11): a reroll discount is dead weight once 破釜沉舟 forbids rerolls, so it is not offered
    if (blocked === undefined) blocked = noReroll(run);
    if (blocked && it.fx?.some((e) => e.hook === 'shop' && e.do === 'rerollOff')) continue;
    out.push(r.id);
  }
  return out;
}
/** Weapons the run's shop may roll (unlocked; 大橘 no 重器/弓弩, 关公 no 暗器). */
export function weaponPool(run: Pick<RunSave, 'char'>, unlocks: Unlocks): WeaponId[] {
  const bans = COMPANIONS[run.char].bans;
  return WEAPON_REG.map((w) => w.id).filter((id) => unlocks.weapons.has(id) && !WEAPONS[id].classes.some((c) => bans.includes(c)));
}
