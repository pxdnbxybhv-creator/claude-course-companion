// 水月幻镜 · the run's life between waves (GDD §3, §6, §23): newRun, beginWave, waveSetup, endWave,
// and which screen comes next. Pure: every function returns a new RunSave.
import { MUTATOR_REG, type MutatorId, type WeaponId } from '../ids';
import type { ActiveMutator, MirrorMeta, NewRunOpts, OwnedWeapon, RunSave, RunStatKey, RunStats, WaveResult, WaveSetup } from '../types';
import { RUN_VER } from '../types';
import { COMPANIONS, DIFFS, F, HEART, PASSIVES, WEAPONS } from '../data';
import { moonInfo } from '../../../core/astro';
import { todayKey } from '../../../core/date';
import { activeMutators, computeStats, effectsOf, harvestNext, heatOf, isBossWave, termP, xpNext } from './formulas';
import { coinPlan } from './economy';
import { addItem, itemPool, weaponPool } from './items';
import { pickDistinct, rngFor } from './rng';
import { bossesAt, wavePlan } from './spawn';

/** 心镜 宿器: is the starting weapon tier II? (rolled once per run from the 'start' stream). */
export function keepsakeTier(run: Pick<RunSave, 'seed' | 'heart'>): 1 | 2 {
  const r = run.heart.heartKeepsake ?? 0;
  const p = (r * (HEART.heartKeepsake.p?.chance ?? 25)) / 100;
  return rngFor(run.seed, 0, 'start', 1)() < p ? 2 : 1;
}

/** Everything fixed at 入镜: the companion's weapon (or its pending choice), boons, 心镜 start bonuses. */
export function newRun(o: NewRunOpts): RunSave {
  const C = COMPANIONS[o.char];
  const heart = o.plain ? {} : { ...o.heart };
  const rng = rngFor(o.seed, 0, 'start');
  let run: RunSave = {
    ver: RUN_VER, ticket: o.ticket, free: o.free, runIndex: o.runIndex, rate: o.rate, startedDay: o.startedDay,
    seed: o.seed >>> 0, char: o.char, map: o.map, diff: o.diff, vows: { ...o.vows }, heat: heatOf(o.vows), daily: o.daily,
    plain: o.plain, heart, wave: 0, inWave: null, interruptions: 0, lvl: 1, xp: 0,
    moon: F.startMoon + (heart.heartMoon ?? 0) * (HEART.heartMoon.p?.moon ?? 10), store: 0, harvest: 0, stats: {},
    weapons: [], items: {}, shop: null, pending: { start: null, cards: 0, cardK: 0, crates: 0, hearts: [] },
    drunk: 0, lives: o.char === 'cat' ? PASSIVES.jiuming.p.lives : 0, once: [], mutators: o.mutator ? [o.mutator] : [],
    term: o.term, coins: 0, runStats: {}, byWeapon: {}, lastBuy: null, ms: 0,
  };
  const pool = weaponPool(run, o.unlocks);
  if (C.start === 'choice') {
    const n = PASSIVES.bolan.p.choices + (o.mastery >= 3 ? 1 : 0);
    run.pending = { ...run.pending, start: pickDistinct(rng, pool, n) };
  } else if (o.mastery >= 3 && C.alt !== 'more' && o.unlocks.weapons.has(C.alt) && C.alt !== C.start) {
    run.pending = { ...run.pending, start: [C.start, C.alt] };
  } else {
    run.weapons = [{ id: C.start, t: keepsakeTier(run) }];
  }
  if (o.boon) run = addItem(run, o.boon);
  if ((heart.heartPack ?? 0) > 0) {
    const p = itemPool(run, o.unlocks, 1, 1);
    if (p.length) run = addItem(run, p[Math.floor(rngFor(o.seed, 0, 'start', 2)() * p.length)]);
  }
  return { ...run, lastBuy: null };
}

/** How many run-wide 镜蚀 a run holds by wave w (无相: one from wave 11; endless: one every 5 waves past 30). */
export function mutatorsWanted(run: Pick<RunSave, 'diff'>, w: number): number {
  const from = DIFFS[run.diff].mutatorFrom;
  return (from && w >= from ? 1 : 0) + (w > 30 ? Math.floor((w - 30) / F.endless.mutatorEvery) : 0);
}
function drawMutator(have: readonly MutatorId[], rng: () => number): MutatorId {
  const all = MUTATOR_REG.map((m) => m.id);
  const fresh = all.filter((id) => !have.includes(id));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
  // all 8 in play: repeat one not yet doubled (it runs at double strength)
  const once = all.filter((id) => have.filter((h) => h === id).length === 1);
  const pool = once.length ? once : all;
  return pool[Math.floor(rng() * pool.length)];
}

/** Starting wave run.wave + 1: `inWave` is saved before the engine runs; 镜蚀 due by then are drawn. */
export function beginWave(run: RunSave): RunSave {
  const w = run.wave + 1;
  const mutators = run.mutators.slice();
  const own = run.daily && mutators.length ? 1 : 0;
  let i = 0;
  while (mutators.length - own < mutatorsWanted(run, w)) mutators.push(drawMutator(mutators, rngFor(run.seed, w, 'mutator', i++)));
  return { ...run, inWave: w, mutators };
}

/** Everything the engine needs for one wave besides the run (plan, trimmed coin plan, 镜蚀, sky, stats). */
export function waveSetup(run: RunSave, meta: MirrorMeta, now: Date): WaveSetup {
  const w = run.inWave ?? run.wave + 1;
  const today = todayKey(now);
  const stats = computeStats(run);
  const plan = wavePlan(run, w);
  const mi = moonInfo(now);
  const fullMoonDay = mi.zh === '满月';
  const fullWave = run.map === 'palace' && (fullMoonDay || w % 2 === 1);
  const luck = stats.luck + (fullWave ? 10 : 0) + (run.char === 'change' && fullMoonDay ? PASSIVES.yinqing.p.fullLuck : 0);
  const mutators: ActiveMutator[] = activeMutators(run, w);
  // 双生 brings one extra 镜蚀 for the fight
  if (w > 30 && plan.boss?.twins) {
    const extra = drawMutator(mutators.map((m) => m.id), rngFor(run.seed, w, 'mutator', 99));
    const at = mutators.find((m) => m.id === extra);
    if (at) at.x = 2; else mutators.push({ id: extra, x: 1 });
  }
  return { wave: w, plan, coins: coinPlan(run, w, luck, meta, today), mutators, term: run.term, sky: { fullMoonDay, lunation: mi.phase, fullWave }, stats };
}

// ───────────────────────────────────────────── the wave end (§3 steps 5–9 and the run's counters)
function foldStats(into: RunStats, add: RunStats): RunStats {
  const out = { ...into };
  for (const k in add) {
    const key = k as RunStatKey;
    const v = add[key] ?? 0;
    if (!Number.isFinite(v)) continue;
    out[key] = key.startsWith('peak') ? Math.max(out[key] ?? 0, v) : (out[key] ?? 0) + v;
  }
  return out;
}
const SHOOTER = (id: WeaponId) => WEAPONS[id].classes.some((c) => c === 'bow' || c === 'hidden');
const INKW = (id: WeaponId) => WEAPONS[id].classes.includes('ink');

/**
 * Wave time at 照破 (ms), so the fastest-照破 record leaves endless out. CHANGE REQUEST pending: add
 * 'msAt30' to RunStatKey in types.ts, then this cast goes.
 */
export const MS_AT_30 = 'msAt30' as string as RunStatKey;

/** Logic-side run counters after a won wave (deeds read them). */
function logicStats(run: RunSave, r: WaveResult): RunStats {
  const s = computeStats(run);
  const rs = run.runStats;
  const hit = (r.stats.hitsTaken ?? 0) > 0;
  const noHitNow = hit ? 0 : (rs.noHitNow ?? 0) + 1;
  const out: RunStats = {
    peakMoonHeld: run.moon, peakShooterWeapons: run.weapons.filter((x) => SHOOTER(x.id)).length,
    peakInkWeapons: run.weapons.filter((x) => INKW(x.id)).length, peakCharmsWave: r.stats.charms ?? 0, peakCritsWave: r.stats.crits ?? 0,
    peakArmor: s.armor, peakSpeed: s.speed, peakDodge: s.dodge, peakRegen: s.regen, peakCurse: s.curse,
    peakNoHit: Math.max(rs.peakNoHit ?? 0, noHitNow),
  };
  const next: RunStats = { ...out };
  // not folded: these are set, not summed
  const set: RunStats = { noHitNow };
  if (r.wave < 20 && run.weapons.length > 1) set.soloW20 = -1;
  if (r.wave === 20) {
    set.swordsAtW20 = s.swords;
    if (rs.soloW20 !== -1 && run.weapons.length <= 1) set.soloW20 = 1;
  }
  if (r.wave === 30) { set.cleared30 = 1; set[MS_AT_30] = run.ms; }
  return { ...next, ...set };
}

/**
 * Fold a won wave into the run: 月华 and XP, 蓄月, harvest, interest, 卧薪尝胆, levels (+1 气血 each,
 * one card screen each), crates and 镜心, counters, per-weapon tallies, lives, once-effects, 醉, time;
 * then wave = r.wave and inWave = null. Coins are banked by economy.bankSleeve in the same write.
 */
export function endWave(run: RunSave, r: WaveResult): RunSave {
  if (run.inWave === null || r.wave !== run.inWave) return run; // only the wave in play folds (never twice)
  const w = r.wave;
  let moon = run.moon + Math.max(0, r.moon);
  let xp = run.xp + Math.max(0, r.xp);
  const store = Math.max(0, r.field) + Math.max(0, r.storeLeft);
  // harvest: +H 月华 and XP, then H grows (decays past 30)
  const s0 = computeStats(run);
  const H = Math.max(0, s0.harvest + run.harvest);
  moon += H; xp += H;
  const harvest = run.harvest + (harvestNext(H, w, run.char === 'gardener') - H);
  // interest: 算盘, 聚宝盆, 冬藏
  const stats = { ...run.stats };
  for (const { e, n } of effectsOf(run)) {
    if (e.hook !== 'onWaveEnd') continue;
    if (e.do === 'interest') moon += e.per ? Math.min(e.max * n, Math.floor(moon / e.per) * n) : Math.min(e.max, Math.floor((moon * (e.pct ?? 0)) / 100));
    else if (e.do === 'grow') stats[e.stat] = (stats[e.stat] ?? 0) + e.v * n; // 卧薪尝胆
  }
  const ti = termP(run, 'interest');
  if (ti) moon += Math.min(termP(run, 'interestMax'), Math.floor((moon * ti) / 100)); // 冬藏
  // levels
  let lvl = run.lvl, cards = run.pending.cards;
  while (xp >= xpNext(lvl)) { xp -= xpNext(lvl); lvl++; cards++; stats.hp = (stats.hp ?? 0) + 1; }
  const byWeapon = { ...run.byWeapon };
  for (const id in r.byWeapon) {
    const a = byWeapon[id as WeaponId] ?? { dmg: 0, kills: 0 };
    const b = r.byWeapon[id as WeaponId]!;
    byWeapon[id as WeaponId] = { dmg: a.dmg + (b.dmg || 0), kills: a.kills + (b.kills || 0) };
  }
  let next: RunSave = {
    ...run, moon, xp, store, harvest, stats, lvl,
    pending: { ...run.pending, cards, cardK: run.pending.cards > 0 ? run.pending.cardK : 0, crates: run.pending.crates + Math.max(0, r.crates), hearts: [...run.pending.hearts, ...r.hearts] },
    byWeapon, lives: Math.max(0, r.lives), once: [...new Set([...run.once, ...r.once])], drunk: Math.max(0, r.drunk), ms: run.ms + Math.max(0, r.ms),
  };
  // 镜宝: one per boss felled (the engine names each when a boss id's last body falls); never more than the
  // fight's distinct bosses (无相's wave-20 pair of one boss = 1, endless 双生 = 2), none off a boss wave;
  // only the two relic ids; not a purchase (lastBuy stays)
  const cap = isBossWave(w) ? new Set(bossesAt(run, w)?.ids ?? []).size : 0;
  for (const id of (r.relics ?? []).filter((x) => x === 'wangchen' || x === 'longyuan').slice(0, cap)) next = addItem(next, id);
  next = { ...next, lastBuy: run.lastBuy, runStats: foldStats(run.runStats, r.stats) };
  const ls = logicStats(next, r);
  next = { ...next, runStats: { ...foldStats(next.runStats, ls), ...pickSet(ls) } };
  return { ...next, wave: w, inWave: null };
}
function pickSet(s: RunStats): RunStats {
  const out: RunStats = {};
  for (const k of ['noHitNow', 'soloW20', 'swordsAtW20', 'cleared30', MS_AT_30] as const) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

/** Fold a fatal wave's partial result: counters and tallies count, nothing else (no 月华, no coins). */
export function foldPartial(run: RunSave, r: WaveResult): RunSave {
  const byWeapon = { ...run.byWeapon };
  for (const id in r.byWeapon) {
    const a = byWeapon[id as WeaponId] ?? { dmg: 0, kills: 0 };
    const b = r.byWeapon[id as WeaponId]!;
    byWeapon[id as WeaponId] = { dmg: a.dmg + (b.dmg || 0), kills: a.kills + (b.kills || 0) };
  }
  return { ...run, runStats: foldStats(run.runStats, r.stats), byWeapon, ms: run.ms + Math.max(0, r.ms), inWave: null };
}

/** The next between-wave screen from run.pending (API contract). At wave 0 with nothing pending, 'shop' means 「ready」. */
export function screenOf(run: RunSave): 'start' | 'cards' | 'crate' | 'heart' | 'shop' {
  if (run.pending.start && run.pending.start.length) return 'start';
  if (run.pending.cards > 0) return 'cards';
  if (run.pending.crates > 0) return 'crate';
  if (run.pending.hearts.length) return 'heart';
  return 'shop';
}
/** Like screenOf, but 'ready' before wave 1 (wave 1 has no shop). */
export function nextScreen(run: RunSave): 'start' | 'cards' | 'crate' | 'heart' | 'shop' | 'ready' {
  const s = screenOf(run);
  return s === 'shop' && run.wave === 0 ? 'ready' : s;
}
/** The run's weapons as a readable list (tests, results). */
export const weaponList = (ws: readonly OwnedWeapon[]) => ws.map((x) => `${x.id}${x.t}`).join(',');
/** Was wave w a boss wave (a boss wave counts once the boss dies)? */
export const bossCleared = (run: RunSave) => isBossWave(run.wave);
