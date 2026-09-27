// 水月幻镜 · the ⚖2 economy (GDD §16): every row of the §16.2 / §16.4 tables, the caps, the ceiling and
// the fee-back floor, the free run, the coin plan, the reconcile rules and the session's money moves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinDrop, MirrorMeta, NewRunOpts, RunSave, WaveResult } from '../src/views/mirror/types';
import { play, emptyPlay, celebrations } from '../src/app/play';
import { state, emptyState } from '../src/app/store';
import { mirror, defaultMeta, reconcileCoinsMeta, reconcileMirror } from '../src/app/mirror';
import {
  allUnlocked, bankSleeve, coinPlan, coinRolls, endlessBossesOf, entryQuote, gross, lobbyStatus, newRun, payBase, quoteNow,
  rateOf, reconcileCoins, reconcileTicket, releaseHeld, rollDay, settlePay, trimCoins, waveSetup, beginWave,
} from '../src/views/mirror/logic';
import * as S from '../src/views/mirror/logic/session';

const DAY = '2026-09-27';
function meta(o: Partial<MirrorMeta> = {}): MirrorMeta {
  return { ...defaultMeta(DAY), ...o };
}
function run(o: Partial<NewRunOpts> = {}, r: Partial<RunSave> = {}): RunSave {
  return {
    ...newRun({
      seed: 5, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
      runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
    }),
    ...r,
  };
}
function result(w: number, o: Partial<WaveResult> = {}): WaveResult {
  return {
    wave: w, moon: 30, xp: 30, field: 0, storeLeft: 0, levels: 0, crates: 0, hearts: [], sleeve: [], lives: 0, once: [], drunk: 0,
    stats: {}, killsBy: {}, byWeapon: {}, bosses: [], ms: 1000, ...o,
  };
}
const coin = (worth: 1 | 5 | 10, src: CoinDrop['src'] = 'wave'): CoinDrop => ({ kind: worth === 1 ? 'cashCoin' : worth === 5 ? 'cashString' : 'cashTen', worth, src });

describe('返照钱 (§16.2)', () => {
  it('base by waves cleared', () => {
    const rows: [number, number, number][] = [[0, 0, 0], [1, 0, 1.5], [9, 0, 13.5], [10, 0, 20], [11, 0, 21], [20, 0, 35], [29, 0, 44], [30, 0, 50], [32, 0, 51], [44, 1, 62], [60, 3, 80], [90, 6, 80]];
    for (const [W, eb, base] of rows) expect(payBase(W, eb)).toBe(base);
    expect([endlessBossesOf(39), endlessBossesOf(40), endlessBossesOf(55)]).toEqual([0, 1, 2]);
  });
  it('gross: ×镜境 ×map ×heat, capped at 70', () => {
    expect(gross(10, 1, 'lake', 0, 0)).toBe(20);
    expect(gross(32, 0, 'lake', 0, 0)).toBe(26); // 闲游 half
    expect(gross(32, 1, 'palace', 0, 0)).toBe(56);
    expect(gross(20, 1, 'lake', 10, 0)).toBe(42);
    expect(gross(32, 5, 'lake', 0, 0)).toBe(70);
    expect(gross(60, 1, 'lake', 0, 3)).toBe(70);
  });
  it('rate by the day’s run index', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(rateOf)).toEqual([0.5, 1, 1, 0.5, 0.5, 0.25, 0.25]);
  });
  it('pays every §16.4 example', () => {
    const pay = (W: number, o: { free?: boolean; rate?: number; diff?: 0 | 1 | 5; paid?: number } = {}) => {
      const r = run({ diff: o.diff ?? 1, free: !!o.free, rate: o.rate ?? (o.free ? 0.5 : 1) }, { wave: W });
      const m = meta({ payDay: { day: DAY, runs: 3, free: true, paid: o.paid ?? 0, drops: 0, refunded: false } });
      return settlePay(m, r, DAY).pay;
    };
    expect(pay(9, { free: true }).income).toBe(7);
    expect(pay(9).income).toBe(14);
    expect(pay(10).income).toBe(20);
    expect(pay(20).income).toBe(35);
    expect(pay(32).income).toBe(51);
    expect(pay(32, { free: true }).income).toBe(26);
    expect(pay(44).income).toBe(62);
    expect(pay(55).income).toBe(70);
    expect(pay(32, { diff: 0 }).income).toBe(26);
    expect(pay(32, { rate: 0.5 }).income).toBe(26); // 4th run
    expect(pay(32, { rate: 0.25 }).income).toBe(13); // 6th run
    const past = pay(32, { diff: 5, rate: 0.25, paid: 300 });
    expect([past.income, past.back]).toEqual([0, 18]); // after the day's 300: 0 income, 18 back
    expect(pay(9).net).toBe(14 - 20);
  });
  it('never profits past the ceiling: the fee-back floor is at most the run’s own fee', () => {
    for (const paid of [250, 290, 299, 300]) for (const W of [0, 5, 10, 32, 60]) for (const free of [false, true]) {
      const r = run({ free, rate: free ? 0.5 : 1 }, { wave: W });
      const m = meta({ payDay: { day: DAY, runs: 2, free: true, paid, drops: 0, refunded: false } });
      const { pay, meta: after } = settlePay(m, r, DAY);
      expect(after.payDay.paid).toBeLessThanOrEqual(300);
      expect(pay.income + pay.back).toBeLessThanOrEqual(Math.max(pay.rated, 0));
      if (free) expect(pay.back).toBe(0);
      if (paid >= 300) expect(pay.income + pay.back - pay.fee).toBeLessThanOrEqual(0);
    }
  });
  it('first-time bonuses once ever, inside the ceiling, the rest held and paid another day', () => {
    const r = run({}, { wave: 30 });
    const m0 = meta({ payDay: { day: DAY, runs: 2, free: true, paid: 250, drops: 0, refunded: false } });
    const a = settlePay(m0, r, DAY);
    // 50 返照钱 then firsts 3 × 10 + 20 = 50: the day has room for 0 more
    expect(a.pay.income).toBe(50);
    expect(a.pay.firsts).toBe(0);
    expect(a.pay.firstsHeld).toBe(50);
    expect(a.meta.firsts).toMatchObject({ 'boss:carp': true, 'boss:mirage': true, 'boss:moonwater': true, 'clear:lake|1': true });
    const again = settlePay(a.meta, r, DAY);
    expect(again.pay.firstsHeld).toBe(50); // nothing new earned
    const next = releaseHeld(a.meta, '2026-09-28');
    expect(next.firstsHeld).toBe(0);
    expect(next.owed).toBe(a.meta.owed + 50);
    expect(next.payDay.paid).toBe(50);
  });
  it('quotes 「此刻镜碎约得 X 文」', () => {
    expect(quoteNow(meta(), run({}, { wave: 20 }), DAY)).toBe(35);
  });
});

describe('the day, the free run and the entry button', () => {
  it('rolls over on a later day and never back (clock guard)', () => {
    const m = meta({ lastDay: '2026-09-28', payDay: { day: '2026-09-28', runs: 2, free: true, paid: 40, drops: 3, refunded: false } });
    expect(rollDay(m, '2026-09-29').runs).toBe(0);
    expect(rollDay(m, '2026-09-26')).toEqual(m.payDay); // clock went back: keep the later ledger
    expect(entryQuote(m, 100, 0, '2026-09-26').free).toBe(false);
    expect(entryQuote(m, 100, 0, '2026-09-29').free).toBe(true);
  });
  it('quotes the button: free, 20 文, short, paused, a paid ticket', () => {
    expect(entryQuote(meta(), 0, 0, DAY)).toMatchObject({ free: true, fee: 0, short: 0, runIndex: 1, rate: 0.5 });
    const used = meta({ payDay: { day: DAY, runs: 1, free: true, paid: 0, drops: 0, refunded: false } });
    expect(entryQuote(used, 12, 0, DAY)).toMatchObject({ free: false, fee: 20, short: 8, runIndex: 2, rate: 1 });
    expect(entryQuote({ ...used, active: run() }, 99, 0, DAY).paused).toBe(true);
    expect(entryQuote({ ...used, ticketsUsed: 3 }, 0, 4, DAY)).toMatchObject({ unusedTicket: true, fee: 0, short: 0 });
    expect(reconcileTicket({ active: null, ticketsUsed: 4 }, 4)).toBe(false);
    const st = lobbyStatus({ ...used, payDay: { ...used.payDay, runs: 3 } }, DAY);
    expect(st).toMatchObject({ runs: 3, nextRate: 0.5, freeLeft: false, ceiling: 300, dropCap: 30, rest: true });
  });
});

describe('铜钱 (§16.3)', () => {
  it('the same seed and wave give the same plan', () => {
    const r = run();
    for (let w = 1; w <= 40; w++) expect(coinRolls(r, w, 30, false)).toEqual(coinRolls(r, w, 30, false));
  });
  it('drops about as often as the tables say', () => {
    let wave = 0, boss10 = 0, bossAny = 0, n = 0;
    for (let s = 0; s < 400; s++) {
      const r = run({ seed: s });
      for (const w of [1, 2, 3, 4, 7, 9]) wave += coinRolls(r, w, 0, false).filter((c) => c.src === 'wave').length;
      const b = coinRolls(r, 10, 0, false);
      if (b.some((c) => c.worth === 10)) boss10++;
      if (b.length) bossAny++;
      n++;
    }
    expect(wave / (n * 6)).toBeGreaterThan(0.03);
    expect(wave / (n * 6)).toBeLessThan(0.075);
    expect(boss10 / n).toBeGreaterThan(0.04);
    expect(boss10 / n).toBeLessThan(0.13);
    expect(bossAny / n).toBeGreaterThan(0.45); // 8% + 92%·50%
    expect(bossAny / n).toBeLessThan(0.62);
  });
  it('trims to the room, 10 → 5 → 1, in plan order', () => {
    const plan = [coin(10, 'boss'), coin(5, 'pixiu'), coin(1, 'elite'), coin(1)];
    expect(trimCoins(plan, 20).map((c) => c.worth)).toEqual([10, 5, 1, 1]);
    expect(trimCoins(plan, 9).map((c) => c.worth)).toEqual([5, 1, 1, 1]);
    expect(trimCoins(plan, 3).map((c) => c.worth)).toEqual([1, 1, 1]);
    expect(trimCoins(plan, 0)).toEqual([]);
    expect(trimCoins([coin(10)], 7)[0]).toMatchObject({ worth: 5, kind: 'cashString' });
  });
  it('plans within min(20 − run, 30 − day, 300 − paid); 今日镜’s wave-20 当十 once a day', () => {
    const r = run({}, { coins: 19 });
    const m = meta();
    for (let w = 1; w < 30; w++) expect(coinPlan(r, w, 100, m, DAY).reduce((a, c) => a + c.worth, 0)).toBeLessThanOrEqual(1);
    const full = meta({ payDay: { day: DAY, runs: 1, free: true, paid: 0, drops: 30, refunded: false } });
    for (let w = 1; w < 30; w++) expect(coinPlan(run(), w, 100, full, DAY)).toEqual([]);
    const daily = run({ daily: true });
    expect(coinPlan(daily, 20, 0, m, DAY)).toEqual([{ kind: 'cashTen', worth: 10, src: 'daily' }]);
    const taken = meta({ daily: { day: DAY, best: 20, bonus: true, weekDays: [], weekPaid: null } });
    expect(coinPlan(daily, 20, 0, taken, DAY).every((c) => c.src !== 'daily')).toBe(true);
  });
  it('banks a won wave’s sleeve into the run, the day and meta.owed', () => {
    const b = bankSleeve(meta(), run(), [coin(1), coin(5, 'pixiu')], DAY);
    expect(b.run.coins).toBe(6);
    expect(b.meta.owed).toBe(6);
    expect(b.meta.payDay).toMatchObject({ drops: 6, paid: 6 });
    const capped = bankSleeve(meta(), run({}, { coins: 18 }), [coin(5)], DAY);
    expect(capped.run.coins).toBe(20);
    const d = bankSleeve(meta(), run({ daily: true }), [coin(10, 'daily')], DAY);
    expect(d.meta.daily.bonus).toBe(true);
  });
  it('reconciles the coin counter both ways (and the store agrees with logic)', () => {
    const m = meta({ coinsPaid: 10, owed: 5 });
    expect(reconcileCoins(m, 15)).toMatchObject({ coinsPaid: 15, owed: 0 }); // purse written, meta not
    expect(reconcileCoins(m, 7)).toMatchObject({ coinsPaid: 7, owed: 8 }); // meta written, purse not
    expect(reconcileCoins(m, 10)).toBe(m);
    for (const c of [0, 7, 10, 15, 40]) expect(reconcileCoinsMeta(m, c)).toEqual(reconcileCoins(m, c));
  });
});

describe('the session moves money exactly once', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10, 0, 0));
    state.value = emptyState();
    play.value = { ...emptyPlay(), coins: 100, flags: { 'char:gardener': true } }; // 园丁 earned in the main game
    celebrations.value = [];
    mirror.value = defaultMeta(DAY);
  });
  afterEach(() => vi.useRealTimers());
  const coins = () => play.value.coins;
  const counter = (k: string) => play.value.counters[k] ?? 0;
  const opts = { char: 'gardener' as const, map: 'lake' as const, diff: 1 as const, vows: {}, daily: false, plain: false };

  it('the first run of a day is free, the second costs 20 in one write with its ticket', () => {
    const a = S.enter(opts);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.run).toMatchObject({ free: true, runIndex: 1, rate: 0.5, ticket: 0 });
    expect(coins()).toBe(100);
    expect(S.enter(opts)).toEqual({ ok: false, reason: 'paused' });
    S.abandon();
    const b = S.enter(opts);
    expect(b.ok && b.run).toMatchObject({ free: false, runIndex: 2, rate: 1, ticket: 1 });
    expect(coins()).toBe(80);
    expect(counter('mirror:paid')).toBe(1);
    expect(mirror.value.ticketsUsed).toBe(1);
    expect(mirror.value.payDay).toMatchObject({ runs: 2, free: true });
  });
  it('refuses a short purse without taking anything', () => {
    mirror.value = { ...defaultMeta(DAY), payDay: { day: DAY, runs: 1, free: true, paid: 0, drops: 0, refunded: false } };
    play.value = { ...play.value, coins: 19 };
    expect(S.enter(opts)).toEqual({ ok: false, reason: 'short' });
    expect(coins()).toBe(19);
    expect(counter('mirror:paid')).toBe(0);
  });
  it('honours a paid ticket the tab never used', () => {
    mirror.value = { ...defaultMeta(DAY), ticketsUsed: 2, payDay: { day: DAY, runs: 3, free: true, paid: 0, drops: 0, refunded: false } };
    play.value = { ...play.value, counters: { 'mirror:paid': 3 } };
    const e = S.enter(opts);
    expect(e.ok && e.run.ticket).toBe(3);
    expect(coins()).toBe(100);
    expect(mirror.value.ticketsUsed).toBe(3);
  });
  it('pays a won wave’s coins at once, the fatal wave’s never, and 返照钱 at 镜碎', () => {
    S.enter(opts);
    S.abandon();
    const e = S.enter(opts);
    if (!e.ok) throw new Error('enter');
    const { run: r1 } = S.startWave(e.run);
    expect(mirror.value.active!.inWave).toBe(1);
    S.waveWon(result(1, { sleeve: [coin(1)], killsBy: { blot: 12 } }));
    expect(coins()).toBe(80 + 1);
    expect(counter('mirror:coin')).toBe(1);
    expect(mirror.value).toMatchObject({ coinsPaid: 1, owed: 0 });
    expect(mirror.value.tally['kill:blot']).toBe(12);
    expect(mirror.value.codex['mon:blot']).toBe(2);
    void r1;
    const { run: r2 } = S.startWave(mirror.value.active!);
    expect(r2.inWave).toBe(2);
    const rep = S.died({ wave: 2, cause: 'blot', partial: result(2, { sleeve: [coin(10)] }) })!;
    // W = 1: base 1.5 → gross 2 → ×1; the sleeve of the fatal wave sinks
    expect(rep.pay).toMatchObject({ W: 1, income: 2, back: 0, coins: 1, fee: 20 });
    expect(coins()).toBe(81 + 2);
    expect(counter('mirror:coin')).toBe(3);
    expect(counter('mirror:runs')).toBe(1 + 1);
    expect(mirror.value.active).toBeNull();
  });
  it('an interrupted wave banks nothing and replays the same coins; the third exit settles', () => {
    S.enter(opts);
    const r = mirror.value.active!;
    const s1 = S.startWave(r).setup;
    expect(S.leaveMidWave()).toEqual({ interruptions: 1, report: null });
    expect(coins()).toBe(100);
    const s2 = S.startWave(mirror.value.active!).setup;
    expect(s2.coins).toEqual(s1.coins);
    expect(s2.plan).toEqual(s1.plan);
    // the page dies mid-wave: resumeCheck counts it
    expect(S.resumeCheck()).toBeNull();
    expect(mirror.value.active!.interruptions).toBe(2);
    S.startWave(mirror.value.active!);
    const third = S.leaveMidWave();
    expect(third.report?.cause).toBe('interrupt');
    expect(mirror.value.active).toBeNull();
  });
  it('voids a broken run: refund(20) or the free run back, once a day, and no run-index cost', () => {
    const f = S.enter(opts);
    expect(f.ok).toBe(true);
    S.voidRun();
    expect(mirror.value.payDay).toMatchObject({ free: false, runs: 0, refunded: true });
    const f2 = S.enter(opts); // the free run again
    expect(f2.ok && f2.run.free).toBe(true);
    S.abandon();
    const p = S.enter(opts);
    expect(p.ok && p.run.free).toBe(false);
    expect(coins()).toBe(80);
    S.voidRun(); // already refunded today: no second refund
    expect(coins()).toBe(80);
    expect(mirror.value.active).toBeNull();
    expect(mirror.value.payDay.runs).toBe(1); // the void runs don't count
  });
  it('fixes the rate at 入镜 even when the run settles on a later day, and counts the pay on that day', () => {
    S.enter(opts);
    S.abandon();
    const e = S.enter(opts); // 2nd run, rate 1
    if (!e.ok) throw new Error('enter');
    mirror.value = { ...mirror.value, active: { ...e.run, wave: 20 } };
    vi.setSystemTime(new Date(2026, 8, 28, 1, 0, 0));
    const rep = S.abandon();
    expect(rep.pay).toMatchObject({ rate: 1, income: 35, firsts: 20 }); // + the first 鲤王 and 蜃
    expect(mirror.value.payDay.day).toBe('2026-09-28');
    expect(mirror.value.payDay.paid).toBe(55);
    expect(mirror.value.payDay.free).toBe(false); // today's free run is still there
  });
  it('the fee-back floor is a refund, not income', () => {
    S.enter(opts);
    S.abandon();
    const e = S.enter(opts);
    if (!e.ok) throw new Error('enter');
    mirror.value = { ...mirror.value, active: { ...e.run, wave: 32 }, payDay: { ...mirror.value.payDay, paid: 300 } };
    const earned = counter('earned');
    const rep = S.abandon();
    expect(rep.pay).toMatchObject({ income: 0, back: 20 });
    expect(coins()).toBe(100);
    expect(counter('earned')).toBe(earned);
    expect(counter('src:mirror')).toBe(0);
  });
  it('takes only the wave in play: a duplicate, a late hook after 暂离 or a wrong wave changes nothing', () => {
    S.enter(opts);
    const { run: r1 } = S.startWave(mirror.value.active!);
    const res = result(1, { moon: 30, sleeve: [coin(1)] });
    const won = S.waveWon(res)!;
    const moon = won.moon;
    expect(coins()).toBe(101);
    expect(S.waveWon(res)).toEqual(won); // the same hook twice
    expect(mirror.value.active!.moon).toBe(moon);
    expect(coins()).toBe(101);
    expect(mirror.value.active!.coins).toBe(1);
    // 暂离 during the wave's 1.2 s end, then the late waveEnd arrives: the wave replays, nothing is banked
    S.startWave(mirror.value.active!);
    expect(S.leaveMidWave().interruptions).toBe(1);
    expect(S.waveWon(result(2, { sleeve: [coin(1)] }))!.wave).toBe(1);
    expect(coins()).toBe(101);
    // a stale death after 暂离 is ignored too
    expect(S.died({ wave: 2, cause: 'blot', partial: result(2) })).toBeNull();
    expect(mirror.value.active).not.toBeNull();
    // a result for another wave than the one started
    S.startWave(mirror.value.active!);
    expect(S.waveWon(result(9))!.wave).toBe(1);
    expect(mirror.value.active!.inWave).toBe(2);
    expect(S.abandon().pay.W).toBe(1);
    // no run at all
    expect(S.waveWon(result(3))).toBeNull();
    expect(S.died({ wave: 3, cause: 'blot', partial: result(3) })).toBeNull();
    void r1;
  });
  it('enters only with a companion earned in the main game', () => {
    play.value = { ...play.value, flags: {} };
    const e = S.enter(opts); // 园丁 not earned: 书生 goes in
    expect(e.ok && e.run.char).toBe('scholar');
    S.abandon();
    mirror.value = { ...mirror.value, lobby: { ...mirror.value.lobby, char: 'cat' } }; // a stale lobby (older backup)
    S.lobbyVisit();
    expect(mirror.value.lobby.char).toBe('scholar');
    play.value = { ...play.value, flags: { 'char:cat': true } };
    const c = S.enter({ ...opts, char: 'cat' });
    expect(c.ok && c.run.char).toBe('cat');
  });
  it('leaves a run saved by a newer build alone', () => {
    S.enter(opts);
    const newer = { ...mirror.value.active!, ver: 999, weapons: [{ id: 'future-blade', t: 1 }] } as unknown as RunSave;
    mirror.value = { ...mirror.value, active: newer };
    expect(S.newerSave()).toBe(true);
    expect(S.resumeCheck()).toBeNull();
    expect(mirror.value.active).toBe(newer);
    expect(counter('mirror:runs')).toBe(0);
    expect(S.enter(opts)).toEqual({ ok: false, reason: 'paused' });
  });
  it('reconciles on load after the tab died between the purse and meta', () => {
    mirror.value = { ...defaultMeta(DAY), coinsPaid: 5, owed: 0 };
    play.value = { ...play.value, counters: { 'mirror:coin': 3 } };
    const before = coins();
    reconcileMirror();
    expect(coins()).toBe(before + 2);
    expect(counter('mirror:coin')).toBe(5);
    expect(mirror.value).toMatchObject({ coinsPaid: 5, owed: 0 });
    mirror.value = { ...mirror.value, owed: 4, coinsPaid: 5 };
    play.value = { ...play.value, counters: { ...play.value.counters, 'mirror:coin': 9 } }; // purse got it, meta didn't
    reconcileMirror();
    expect(coins()).toBe(before + 2);
    expect(mirror.value).toMatchObject({ coinsPaid: 9, owed: 0 });
  });
});

void waveSetup; void beginWave;
