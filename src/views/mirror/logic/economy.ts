// 水月幻镜 · the ⚖2 economy (GDD §16; exactly sim/econ.js): 20 文 a run, the free run once a local
// day, 返照钱 by waves cleared at 镜碎 with the run's rate fixed at 入镜, 铜钱 drops planned by seed and
// trimmed to the room, 70 / 20 / 30 caps, the 300 文 daily ceiling with the fee-back floor, first-time
// bonuses held over when the day is full, and the reconcile rules. Pure: session.ts does the writes.
import type { BossId, MapId } from '../ids';
import type { CoinDrop, CoinKind, DateKey, DiffIndex, EntryQuote, FirstKey, LobbyStatus, MirrorMeta, PayBreakdown, PayDay, RunSave } from '../types';
import { DIFFS, MAPS, PAY, rateOf } from '../data';
import { clamp, isBossWave } from './formulas';
import { rngFor } from './rng';
import { wavePlan } from './spawn';

export { rateOf };

// ───────────────────────────────────────────── the day
/** The day money counts toward: today, but never earlier than meta.lastDay (the clock guard). */
export function payDayKey(meta: Pick<MirrorMeta, 'lastDay'>, today: DateKey): DateKey {
  return meta.lastDay && today < meta.lastDay ? meta.lastDay : today;
}
/** The ledger for today: rolled over when the day is later than payDay.day, never rolled back. */
export function rollDay(meta: Pick<MirrorMeta, 'payDay' | 'lastDay'>, today: DateKey): PayDay {
  const day = payDayKey(meta, today);
  const d = meta.payDay;
  if (!d || !d.day || day > d.day) return { day, runs: 0, free: false, paid: 0, drops: 0, refunded: false };
  return { ...d };
}
/** meta with the ledger rolled and lastDay advanced (call before any money write). */
export function withDay(meta: MirrorMeta, today: DateKey): MirrorMeta {
  const day = payDayKey(meta, today);
  return { ...meta, payDay: rollDay(meta, today), lastDay: day > meta.lastDay ? day : meta.lastDay };
}
/** The 今日镜 block for today (best and the 当十 flag reset on a new day). */
export function dailyFor(meta: MirrorMeta, today: DateKey): MirrorMeta['daily'] {
  const day = payDayKey(meta, today);
  return meta.daily.day === day ? meta.daily : { ...meta.daily, day, best: 0, bonus: false };
}

/** Run index and rate a new run would get: the free run is n = 1 (×½); paid runs are n ≥ 2. */
export function nextRun(d: PayDay): { free: boolean; runIndex: number; rate: number } {
  const free = !d.free;
  const runIndex = free ? 1 : Math.max(2, d.runs + 1);
  return { free, runIndex, rate: rateOf(runIndex) };
}

/** A paid ticket never used (the tab died during the tap): the lobby offers 「续镜 · 已付」. */
export function reconcileTicket(meta: Pick<MirrorMeta, 'active' | 'ticketsUsed'>, paidCounter: number): boolean {
  return !meta.active && paidCounter > meta.ticketsUsed;
}

/** The lobby's 「入镜」 button (§16.1). */
export function entryQuote(meta: MirrorMeta, purse: number, paidCounter: number, today: DateKey): EntryQuote {
  const d = rollDay(meta, today);
  const unusedTicket = reconcileTicket(meta, paidCounter);
  const n = nextRun(d);
  const free = !unusedTicket && n.free;
  const runIndex = unusedTicket ? Math.max(2, d.runs + 1) : n.runIndex;
  const fee: 0 | 20 = free || unusedTicket ? 0 : PAY.FEE;
  return { paused: !!meta.active, unusedTicket, free, fee, short: Math.max(0, fee - Math.max(0, purse)), runIndex, rate: rateOf(runIndex) };
}

/** 「今日第 N 照 · 下一照 … · 今日镜钱 X/300 · 铜钱 Y/30」. */
export function lobbyStatus(meta: MirrorMeta, today: DateKey): LobbyStatus {
  const d = rollDay(meta, today);
  return {
    day: d.day, runs: d.runs, nextRate: nextRun(d).rate, freeLeft: !d.free, paid: d.paid, ceiling: PAY.CEIL,
    drops: d.drops, dropCap: PAY.COIN_DAY, rest: d.runs >= PAY.rest,
  };
}

// ───────────────────────────────────────────── 返照钱 (§16.2)
/** base(W): 1.5 a wave to 10, 1 a wave to 30, +5 at 10/20/30, ½ a wave in endless (floor), +5 per endless boss (≤ 3). */
export function payBase(W: number, endlessBosses: number): number {
  const w = Math.max(0, Math.floor(W));
  return PAY.early * Math.min(w, PAY.earlyTo) + PAY.mid * Math.max(0, Math.min(w, PAY.midTo) - PAY.earlyTo)
    + (w >= 10 ? PAY.boss : 0) + (w >= 20 ? PAY.boss : 0) + (w >= 30 ? PAY.boss : 0)
    + Math.floor(PAY.endless * clamp(w - 30, 0, PAY.endlessMax))
    + PAY.endlessBoss * clamp(Math.floor(endlessBosses), 0, PAY.endlessBossMax);
}
/** Endless bosses killed by a run that cleared W waves (every boss wave from 40 up). */
export function endlessBossesOf(W: number): number {
  let n = 0;
  for (let w = 40; w <= W; w += 10) n++;
  return n;
}
/** gross = min(70, round(base × diff.pay × map.pay × (1 + 0.02·heat))). */
export function gross(W: number, diff: DiffIndex, map: MapId, heat: number, endlessBosses: number): number {
  return Math.min(PAY.RUN_CAP, Math.round(payBase(W, endlessBosses) * DIFFS[diff].pay * MAPS[map].pay * (1 + PAY.heatPer * heat)));
}
/** First-time bonuses a run would earn now (not yet in meta.firsts). */
export function newFirsts(meta: Pick<MirrorMeta, 'firsts'>, run: Pick<RunSave, 'wave' | 'map' | 'diff'>): FirstKey[] {
  const out: FirstKey[] = [];
  const bosses = MAPS[run.map].bosses;
  for (let i = 0; i < 3; i++) {
    if (run.wave < (i + 1) * 10) break;
    const k = `boss:${bosses[i] as BossId}` as FirstKey;
    if (!meta.firsts[k] && !out.includes(k)) out.push(k);
  }
  if (run.wave >= 30) {
    const k = `clear:${run.map}|${run.diff}` as FirstKey;
    if (!meta.firsts[k]) out.push(k);
  }
  return out;
}
const firstWorth = (k: FirstKey) => (k.startsWith('boss:') ? PAY.firstBoss : PAY.firstClear);

function payLines(meta: MirrorMeta, run: RunSave, today: DateKey) {
  const W = run.wave;
  const eb = endlessBossesOf(W);
  const base = payBase(W, eb);
  const diffX = DIFFS[run.diff].pay, mapX = MAPS[run.map].pay, heatX = 1 + PAY.heatPer * run.heat;
  const raw = Math.round(base * diffX * mapX * heatX);
  const g = Math.min(PAY.RUN_CAP, raw);
  const rated = Math.ceil(g * run.rate);
  const d = rollDay(meta, today);
  const room = Math.max(0, PAY.CEIL - d.paid);
  const income = Math.min(rated, room);
  const fee: 0 | 20 = run.free ? 0 : PAY.FEE;
  const back = run.free ? 0 : Math.max(0, Math.min(rated, fee) - income);
  return { W, base, diffX, mapX, heatX, gross: g, capped: raw > PAY.RUN_CAP, rate: run.rate, rated, room, income, back, fee, d };
}
/** 「此刻镜碎约得 X 文」: what 镜碎 would pay now (返照钱 + fee-back, before first-time bonuses). */
export function quoteNow(meta: MirrorMeta, run: RunSave, today: DateKey): number {
  const p = payLines(meta, run, today);
  return p.income + p.back;
}
/**
 * Settle the run's pay at 镜碎 (§16.2, §16.5): income and first-time bonuses (inside the day's room)
 * go to meta.owed and the day's ledger; the rest of the firsts waits in firstsHeld; `back` is the
 * fee-back floor the session pays with refund() (not income). Marks the firsts as earned.
 */
export function settlePay(meta: MirrorMeta, run: RunSave, today: DateKey): { meta: MirrorMeta; pay: PayBreakdown } {
  const m0 = withDay(meta, today);
  const p = payLines(m0, run, today);
  const firsts = newFirsts(m0, run);
  const fNew = firsts.reduce((a, k) => a + firstWorth(k), 0);
  const heldIn = m0.firstsHeld + fNew;
  const fPaid = Math.min(heldIn, Math.max(0, PAY.CEIL - p.d.paid - p.income));
  const firstsHeld = heldIn - fPaid;
  const payDay: PayDay = { ...p.d, paid: p.d.paid + p.income + fPaid };
  const f = { ...m0.firsts };
  for (const k of firsts) f[k] = true;
  const next: MirrorMeta = { ...m0, payDay, owed: m0.owed + p.income + fPaid, firstsHeld, firsts: f };
  const pay: PayBreakdown = {
    W: p.W, base: p.base, diffX: p.diffX, mapX: p.mapX, heatX: p.heatX, gross: p.gross, capped: p.capped, rate: p.rate,
    rated: p.rated, room: p.room, income: p.income, back: p.back, coins: run.coins, firsts: fPaid, firstsHeld,
    fee: p.fee, net: p.income + p.back + run.coins + fPaid - p.fee,
  };
  return { meta: next, pay };
}
/** First-time bonuses held by an earlier full day, paid within today's room (lobby visit). */
export function releaseHeld(meta: MirrorMeta, today: DateKey): MirrorMeta {
  if (meta.firstsHeld <= 0) return meta;
  const m = withDay(meta, today);
  const pay = Math.min(m.firstsHeld, Math.max(0, PAY.CEIL - m.payDay.paid));
  if (pay <= 0) return m;
  return { ...m, firstsHeld: m.firstsHeld - pay, owed: m.owed + pay, payDay: { ...m.payDay, paid: m.payDay.paid + pay } };
}

// ───────────────────────────────────────────── 铜钱 (§16.3)
const COIN: Record<1 | 5 | 10, CoinKind> = { 1: 'cashCoin', 5: 'cashString', 10: 'cashTen' };
/** The 福缘 factor F = 1 + min(福缘, 100)/200 (≤ ×1.5). */
export const coinLuck = (luck: number) => 1 + clamp(luck, 0, PAY.luckCap) / PAY.luckDiv;
/** Room for coins now: min(20 − run.coins, 30 − day drops, 300 − day paid). */
export function coinRoom(meta: MirrorMeta, run: Pick<RunSave, 'coins'>, today: DateKey): number {
  const d = rollDay(meta, today);
  return Math.max(0, Math.min(PAY.COIN_RUN - run.coins, PAY.COIN_DAY - d.drops, PAY.CEIL - d.paid));
}
/** Every coin wave w offers before caps, in trim order (boss, 貔貅, elites, the ordinary coin). Stream 'coin'. */
export function coinRolls(run: RunSave, w: number, luck: number, dailyTen: boolean): CoinDrop[] {
  const rng = rngFor(run.seed, w, 'coin');
  const Fm = coinLuck(luck);
  const e = w > 30 ? PAY.endlessX : 1;
  const out: CoinDrop[] = [];
  if (isBossWave(w)) {
    const u = rng(), v = rng();
    if (dailyTen) out.push({ kind: 'cashTen', worth: 10, src: 'daily' });
    else if (u < Math.min(1, PAY.bossBig * Fm)) out.push({ kind: 'cashTen', worth: 10, src: 'boss' });
    else if (v < PAY.bossSmall) out.push({ kind: 'cashCoin', worth: 1, src: 'boss' });
    return out;
  }
  const plan = wavePlan(run, w);
  const u = rng(), kr = rng(), px = rng();
  if (plan.treasures.some((t) => t.id === 'pixiu') && px < Math.min(1, PAY.pixiu * Fm)) out.push({ kind: 'cashString', worth: 5, src: 'pixiu' });
  plan.elites.forEach((_, i) => {
    if (rng() < Math.min(1, PAY.elite * Fm * e)) out.push({ kind: 'cashCoin', worth: 1, src: 'elite', k: i + 1 });
  });
  if (u < Math.min(1, PAY.wave * Fm * e)) {
    const span = Math.max(1, Math.floor(0.6 * plan.kills));
    out.push({ kind: 'cashCoin', worth: 1, src: 'wave', k: 1 + Math.floor(kr * span) });
  }
  return out;
}
/** Trim a plan to the room, in order: a coin bigger than the room becomes the largest that fits (10 → 5 → 1) or is dropped. */
export function trimCoins(list: readonly CoinDrop[], room: number): CoinDrop[] {
  const out: CoinDrop[] = [];
  let left = Math.max(0, Math.floor(room));
  for (const c of list) {
    if (left <= 0) break;
    let worth: 1 | 5 | 10 = c.worth;
    if (worth > left) worth = left >= 10 ? 10 : left >= 5 ? 5 : 1;
    out.push({ ...c, worth, kind: COIN[worth] });
    left -= worth;
  }
  return out;
}
/** The wave's coin plan: seeded rolls (luck at wave start) trimmed to the run / day / ceiling room. */
export function coinPlan(run: RunSave, w: number, luck: number, meta: MirrorMeta, today: DateKey): CoinDrop[] {
  const daily = dailyFor(meta, today);
  const dailyTen = run.daily && w === 20 && !daily.bonus;
  return trimCoins(coinRolls(run, w, luck, dailyTen), coinRoom(meta, run, today));
}
/** Bank a won wave's sleeve: run.coins, the day's drops and paid, meta.owed (paid by payOwed). */
export function bankSleeve(meta: MirrorMeta, run: RunSave, sleeve: readonly CoinDrop[], today: DateKey): { meta: MirrorMeta; run: RunSave } {
  const m0 = withDay(meta, today);
  let sum = 0;
  for (const c of sleeve) sum += c.worth;
  sum = Math.min(sum, coinRoom(m0, run, today));
  const d = m0.payDay;
  let daily = m0.daily;
  if (sleeve.some((c) => c.src === 'daily')) daily = { ...dailyFor(m0, today), bonus: true };
  if (sum <= 0) return { meta: { ...m0, daily }, run };
  return {
    meta: { ...m0, daily, owed: m0.owed + sum, payDay: { ...d, drops: d.drops + sum, paid: d.paid + sum } },
    run: { ...run, coins: run.coins + sum },
  };
}
/**
 * The coin counter and meta agree again (either write may have died): counters['mirror:coin'] is
 * what reached the purse; coinsPaid what meta believes; owed what is still due.
 */
export function reconcileCoins(meta: MirrorMeta, coinCounter: number): MirrorMeta {
  const c = Math.max(0, Math.floor(coinCounter));
  if (c > meta.coinsPaid) return { ...meta, owed: Math.max(0, meta.owed - (c - meta.coinsPaid)), coinsPaid: c };
  if (c < meta.coinsPaid) return { ...meta, owed: meta.owed + (meta.coinsPaid - c), coinsPaid: c };
  return meta;
}
