// 水月幻镜 · 镜市 (GDD §7): odds by wave and 福缘, class lean, copies for merging, prices, rerolls,
// locks, selling, 合铸, slot limits and the bans. The shop is rolled from (seed, wave, k), so a reload
// shows the same slots. Price, odds and reroll formulas use w = the wave just cleared (as the sim).
import type { ItemId, WeaponId } from '../ids';
import type { RunSave, ShopSlot, ShopState, ShopView, SlotView, Stats, Tier, Unlocks, WClass } from '../types';
import { F, ITEMS, MAPS, HAZARDS } from '../data';
import {
  classCounts, computeStats, effectsOf, itemPrice, rerollCost, sellPrice, shopOdds, shopSlotsOf, weaponPrice, weaponSlotsOf,
} from './formulas';
import { addItem, itemMaxed, itemPool, noReroll, weaponPool } from './items';
import { rngFor, rollTier, type Rng } from './rng';
import { wavePlan } from './spawn';

/** The wave number the shop's formulas use: the wave just cleared (≥ 1). */
export const shopW = (run: RunSave) => Math.max(1, run.wave);

/** Free rerolls in a shop: 书生 1, 棋士 1, 签筒 ×n, 聚宝盆 1, and 1 after a boss's 镜心. */
export function freeRerolls(run: RunSave): number {
  let n = run.char === 'scholar' ? 1 : 0;
  for (const { e, n: c } of effectsOf(run)) if (e.hook === 'shop' && e.do === 'freeReroll') n += e.n * c;
  if (run.wave > 0 && run.wave % 10 === 0) n += 1;
  return n;
}
function extraOdds(run: RunSave): boolean {
  return effectsOf(run).some(({ e }) => e.hook === 'shop' && e.do === 'odds');
}

function rollSlot(run: RunSave, unlocks: Unlocks, w: number, rng: Rng, stats: Stats, shown: readonly (ShopSlot | null)[]): ShopSlot {
  const odds = shopOdds(w, stats.luck, extraOdds(run));
  const full = run.weapons.length >= weaponSlotsOf(run);
  if (rng() < (full ? F.fullWeaponRoll : F.weaponRoll)) {
    const lean = rng();
    if (run.weapons.length && (full || lean < F.copyLean)) {
      const h = run.weapons[Math.floor(rng() * run.weapons.length)];
      return { kind: 'weapon', id: h.id, t: h.t, locked: false };
    }
    const pool = weaponPool(run, unlocks);
    const t = rollTier(rng, odds);
    const id = pool[Math.floor(rng() * pool.length)];
    return { kind: 'weapon', id, t, locked: false };
  }
  const t = rollTier(rng, odds);
  const unique = (id: ItemId) => !(ITEMS[id].max === 1 && shown.some((s) => s?.kind === 'item' && s.id === id));
  let pool: ItemId[] = [];
  const cnt = classCounts(run);
  const cls = (Object.keys(cnt) as WClass[]).filter((c) => (cnt[c] ?? 0) >= 2);
  const leanRoll = rng();
  if (cls.length && leanRoll < F.classLean) {
    const c = cls[Math.floor(rng() * cls.length)];
    pool = itemPool(run, unlocks, t, w).filter((id) => ITEMS[id].tags.includes(c) && unique(id));
    if (!pool.length) {
      for (const tt of [1, 2, 3, 4] as Tier[]) pool.push(...itemPool(run, unlocks, tt, w).filter((id) => ITEMS[id].tags.includes(c) && unique(id)));
    }
  }
  if (!pool.length) pool = itemPool(run, unlocks, t, w).filter(unique);
  if (!pool.length && t === 4) pool = itemPool(run, unlocks, 3, w).filter(unique);
  if (!pool.length) pool = itemPool(run, unlocks, 1, w).filter(unique);
  if (!pool.length) pool = ['songzi'];
  return { kind: 'item', id: pool[Math.floor(rng() * pool.length)], locked: false };
}

/** Roll every unlocked slot (locked ones stay where they are). */
function rollSlots(run: RunSave, unlocks: Unlocks, keep: readonly (ShopSlot | null)[], n: number, key: number, wave: number): (ShopSlot | null)[] {
  const rng = rngFor(run.seed, wave, 'shop', key);
  const stats = computeStats(run);
  const w = shopW(run);
  const out: (ShopSlot | null)[] = [];
  for (let i = 0; i < n; i++) {
    const k = keep[i];
    out.push(k && k.locked ? k : rollSlot(run, unlocks, w, rng, stats, [...out, ...keep.slice(i + 1).filter((s) => s?.locked)]));
  }
  return out;
}
/** The reroll-index key of a shop state (free rerolls are used first, so (k, free) never repeats). */
const rollKey = (k: number, free: number) => 1000 * k + free;

/** Open the shop before wave run.wave + 1 (idempotent: a reload keeps it). Locked slots carry over at the new price. */
export function openShop(run: RunSave, unlocks: Unlocks): RunSave {
  const wave = run.wave + 1;
  if (run.shop && run.shop.wave === wave) return run;
  const n = shopSlotsOf(run);
  const keep: (ShopSlot | null)[] = new Array(n).fill(null);
  if (run.shop && !noReroll(run)) {
    const locked = run.shop.slots.filter((s): s is ShopSlot => !!s && s.locked);
    locked.slice(0, n).forEach((s, i) => { keep[i] = s; });
  }
  const free = freeRerolls(run);
  const shop: ShopState = { wave, k: 0, free, slots: rollSlots(run, unlocks, keep, n, rollKey(0, free), wave) };
  return { ...run, shop };
}

function slotPrice(run: RunSave, s: ShopSlot): number {
  const w = shopW(run);
  return s.kind === 'weapon' ? weaponPrice(s.id, s.t, w, run) : itemPrice(s.id, w, run);
}
function mergeIndex(run: RunSave, id: WeaponId, t: Tier): number {
  return t >= 4 ? -1 : run.weapons.findIndex((x) => x.id === id && x.t === t);
}
function buyable(run: RunSave, s: ShopSlot): boolean {
  if (s.kind === 'item') return !itemMaxed(run, s.id);
  return run.weapons.length < weaponSlotsOf(run) || mergeIndex(run, s.id, s.t) >= 0;
}

/** What the shop screen shows (prices at this wave, what is affordable, what would merge). */
export function shopView(run: RunSave): ShopView {
  const shop = run.shop;
  const w = shopW(run);
  const slots: SlotView[] = (shop?.slots ?? []).map((s) => {
    if (!s) return { slot: null, price: 0, afford: false, merges: false };
    const price = slotPrice(run, s);
    return { slot: s, price, afford: run.moon >= price && buyable(run, s), merges: s.kind === 'weapon' && mergeIndex(run, s.id, s.t) >= 0 };
  });
  const free = shop?.free ?? 0;
  const cost = free > 0 ? 0 : rerollCost(w, shop?.k ?? 0, run);
  const blocked = noReroll(run);
  let preview: ShopView['preview'] = null;
  if (run.char === 'player' && shop) {
    const plan = wavePlan(run, shop.wave);
    preview = { elites: plan.elites.map((e) => e.id), hazards: MAPS[run.map].hazards.filter((h) => HAZARDS[h].from <= shop.wave) };
  }
  return {
    wave: shop?.wave ?? run.wave + 1, slots, rerollCost: cost, freeRerolls: free, canReroll: !!shop && !blocked && (free > 0 || run.moon >= cost),
    canLock: !blocked, moon: run.moon, preview,
  };
}

/** Buy slot i; a weapon copy auto-merges when the weapon slots are full. null if not possible. */
export function buy(run: RunSave, i: number): RunSave | null {
  const s = run.shop?.slots[i];
  if (!run.shop || !s) return null;
  const price = slotPrice(run, s);
  if (run.moon < price || !buyable(run, s)) return null;
  const slots = run.shop.slots.slice();
  slots[i] = null;
  let next: RunSave = { ...run, moon: run.moon - price, shop: { ...run.shop, slots } };
  if (s.kind === 'item') return addItem(next, s.id);
  if (run.weapons.length < weaponSlotsOf(run)) next = { ...next, weapons: [...run.weapons, { id: s.id, t: s.t }] };
  else {
    const j = mergeIndex(run, s.id, s.t);
    const weapons = run.weapons.slice();
    weapons[j] = { id: s.id, t: (s.t + 1) as Tier };
    next = { ...next, weapons };
  }
  return { ...next, lastBuy: s.id };
}

/** Reroll the unlocked slots (free rerolls first). null when 破釜沉舟 forbids it or it can't be afforded. */
export function reroll(run: RunSave, unlocks: Unlocks): RunSave | null {
  const shop = run.shop;
  if (!shop || noReroll(run)) return null;
  let { k, free } = shop;
  let moon = run.moon;
  if (free > 0) free--;
  else {
    const c = rerollCost(shopW(run), k, run);
    if (moon < c) return null;
    moon -= c;
    k++;
  }
  const slots = rollSlots(run, unlocks, shop.slots, shop.slots.length, rollKey(k, free), shop.wave);
  return { ...run, moon, shop: { ...shop, k, free, slots } };
}
/** Lock or unlock slot i (free; not under 破釜沉舟). */
export function toggleLock(run: RunSave, i: number): RunSave {
  const s = run.shop?.slots[i];
  if (!run.shop || !s || noReroll(run)) return run;
  const slots = run.shop.slots.slice();
  slots[i] = { ...s, locked: !s.locked };
  return { ...run, shop: { ...run.shop, slots } };
}
/** Sell the weapon in slot `slot` for 25% of its current price (当票 60%); the last weapon stays. */
export function sell(run: RunSave, slot: number): RunSave {
  const wp = run.weapons[slot];
  if (!wp || run.weapons.length <= 1) return run;
  const weapons = run.weapons.slice();
  weapons.splice(slot, 1);
  return { ...run, weapons, moon: run.moon + sellPrice(run, wp.id, wp.t, shopW(run)) };
}
/** 合铸: two weapons with the same id and tier become one of the next tier (cap IV). */
export function merge(run: RunSave, a: number, b: number): RunSave | null {
  const x = run.weapons[a], y = run.weapons[b];
  if (a === b || !x || !y || x.id !== y.id || x.t !== y.t || x.t >= 4) return null;
  const weapons = run.weapons.slice();
  weapons[a] = { id: x.id, t: (x.t + 1) as Tier };
  weapons.splice(b, 1);
  return { ...run, weapons };
}
