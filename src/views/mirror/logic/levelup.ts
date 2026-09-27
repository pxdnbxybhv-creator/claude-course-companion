// 水月幻镜 · between-wave choices: the starting pick, level-up cards, 镜奁 crates and 镜心 (GDD §6, §7).
// Each screen is seeded from (seed, wave, stream, k), so a reload shows the same choice.
import type { ItemId, WeaponId } from '../ids';
import type { CardsView, LevelCard, RunSave, StatId, Tier, Unlocks } from '../types';
import { CARD_STATS, CARD_STAT_IDS, F, ITEMS, PASSIVES, WEAPONS } from '../data';
import { cardOdds, cardRerollCost, computeStats, itemPrice, shopOdds, termP, vowSum } from './formulas';
import { addItem, itemPool } from './items';
import { keepsakeTier } from './run';
import { pickDistinct, rngFor, rollTier } from './rng';

/** 书生 (or mastery 3): take one of the offered starting weapons. */
export function pickStart(run: RunSave, id: WeaponId): RunSave {
  if (!run.pending.start || !run.pending.start.includes(id) || !WEAPONS[id]) return run;
  return { ...run, weapons: [{ id, t: keepsakeTier(run) }], pending: { ...run.pending, start: null } };
}

/** The level the current card screen is for. */
export const cardLevel = (run: RunSave) => run.lvl - run.pending.cards + 1;
/** Cards per level: 4 (书生 5, 孤影 3), 夏至 +1. */
export function cardCount(run: RunSave): number {
  const solo = vowSum(run, 'cards');
  const base = solo > 0 ? F.cardsSolo : run.char === 'scholar' ? PASSIVES.bolan.p.cards : F.cards;
  return base + termP(run, 'cards');
}

/** The current level-up screen, or null when none is owed. */
export function cardsView(run: RunSave): CardsView | null {
  if (run.pending.cards <= 0) return null;
  const L = cardLevel(run);
  const luck = computeStats(run).luck;
  const odds = cardOdds(L, luck);
  const rng = rngFor(run.seed, run.wave, 'card', 100 * L + run.pending.cardK);
  const stats = pickDistinct(rng, CARD_STAT_IDS, cardCount(run));
  const cards: LevelCard[] = stats.map((stat: StatId) => {
    let tier = rollTier(rng, odds) as Tier;
    if (L % 10 === 0) tier = Math.max(tier, 3) as Tier;
    else if (L % 5 === 0) tier = Math.max(tier, 2) as Tier;
    return { stat, tier, v: CARD_STATS[stat]![tier - 1] };
  });
  return { level: L, cards, rerollCost: cardRerollCost(run.wave, run.pending.cardK), left: run.pending.cards };
}
/** Reroll the cards (2 + ⌈w/2⌉ + k 月华); null if it can't be afforded. */
export function rerollCards(run: RunSave): RunSave | null {
  const v = cardsView(run);
  if (!v || run.moon < v.rerollCost) return null;
  return { ...run, moon: run.moon - v.rerollCost, pending: { ...run.pending, cardK: run.pending.cardK + 1 } };
}
/** Take card i: its stat is added permanently. */
export function pickCard(run: RunSave, i: number): RunSave {
  const v = cardsView(run);
  const c = v?.cards[i];
  if (!c) return run;
  const stats = { ...run.stats, [c.stat]: (run.stats[c.stat] ?? 0) + c.v };
  return { ...run, stats, pending: { ...run.pending, cards: run.pending.cards - 1, cardK: 0 } };
}

// ───────────────────────────────────────────── 镜奁
/** The item in the next crate: tier with the next band's odds (w + 4), from the next shop's pool. */
export function crateItem(run: RunSave, unlocks: Unlocks): ItemId {
  const w = Math.max(1, run.wave);
  const rng = rngFor(run.seed, run.wave, 'crate', run.pending.crates);
  const odds = shopOdds(Math.min(40, w + F.crateAhead), computeStats(run).luck);
  const t = rollTier(rng, odds);
  let pool = itemPool(run, unlocks, t, w + 1);
  if (!pool.length) pool = itemPool(run, unlocks, Math.max(1, Math.min(3, t)) as Tier, w + 1);
  if (!pool.length) pool = itemPool(run, unlocks, 1, w + 1);
  if (!pool.length) return 'songzi';
  return pool[Math.floor(rng() * pool.length)];
}
/** 收 keeps the crate's item; 化 melts it for 50% of its price in 月华. */
export function resolveCrate(run: RunSave, keep: boolean, unlocks: Unlocks): RunSave {
  if (run.pending.crates <= 0) return run;
  const id = crateItem(run, unlocks);
  const after = { ...run, pending: { ...run.pending, crates: run.pending.crates - 1 } };
  if (keep) return addItem(after, id);
  return { ...after, moon: after.moon + meltValue(run, id) };
}
/** 化 +X: half the item's current price. */
export const meltValue = (run: RunSave, id: ItemId) => Math.round(itemPrice(id, Math.max(1, run.wave), run) * F.crateMelt);

// ───────────────────────────────────────────── 镜心
/** The three 镜心 options: 仙/神 (神 20% at wave 10, 35% from 20; wave 30+ always offers one 神; 镜中花 = one 神 + two 仙). */
export function heartOffer(run: RunSave, unlocks: Unlocks): ItemId[] {
  const src = run.pending.hearts[0];
  if (!src) return [];
  const w = Math.max(1, run.wave);
  const rng = rngFor(run.seed, run.wave, 'heart', run.pending.hearts.length);
  const p4 = F.heartOdds[w] ?? F.heartOddsLate;
  const out: ItemId[] = [];
  for (let i = 0; i < 3; i++) {
    const roll = rng();
    const t: Tier = src === 'flower' ? (i === 0 ? 4 : 3) : (w >= 30 && i === 0) || roll < p4 ? 4 : 3;
    let pool = itemPool(run, unlocks, t, Math.max(F.legendFrom, w)).filter((id) => !out.includes(id));
    if (!pool.length) pool = itemPool(run, unlocks, 3, w).filter((id) => !out.includes(id));
    if (!pool.length) pool = itemPool(run, unlocks, 2, w).filter((id) => !out.includes(id));
    if (!pool.length) continue;
    out.push(pool[Math.floor(rng() * pool.length)]);
  }
  return out;
}
/** Take 镜心 option i (the wave start refills 气血; the next shop gets its free reroll). */
export function pickHeart(run: RunSave, i: number, unlocks: Unlocks): RunSave {
  const opts = heartOffer(run, unlocks);
  const id = opts[i];
  if (!id || !ITEMS[id]) return run;
  const after = addItem(run, id);
  return { ...after, pending: { ...after.pending, hearts: after.pending.hearts.slice(1) } };
}
