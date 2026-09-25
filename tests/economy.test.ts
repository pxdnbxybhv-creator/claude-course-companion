import { describe, expect, it } from 'vitest';
import {
  PAY_RULES, PAY_SOURCES, applyRate, bellPay, boardWinPay, catPay, feihuaPay, fishPay, klotskiCoins, klotskiPay, lanternPay,
  lotusPay, pitchpotPay, rateFor, rateNote, settle, snakePay, tangramPay, tictactoePay,
} from '../src/views/games/economy';

describe('economy · payout amounts', () => {
  it('fishing pays by rarity, about 2 to 60, and 10 more for a new album page', () => {
    expect(fishPay('junk').base).toBe(2);
    expect(fishPay('common').base).toBe(5);
    expect(fishPay('uncommon').base).toBe(12);
    expect(fishPay('rare').base).toBe(30);
    expect(fishPay('legend').base).toBe(60);
    expect(fishPay('common', true).base).toBe(15);
    expect(fishPay('junk', true).base).toBe(2); // a sandal is no album page worth paying for
    expect(fishPay('rare').exempt).toBe(true);
    expect(fishPay('common').exempt).toBeFalsy();
  });

  it('pitch-pot pays 3 an arrow and a bonus for a full round', () => {
    expect(pitchpotPay(0).base).toBe(0);
    expect(pitchpotPay(5).base).toBe(15);
    expect(pitchpotPay(7).base).toBe(21);
    expect(pitchpotPay(8).base).toBe(8 * 3 + 20);
    expect(pitchpotPay(12).base).toBe(44); // clamped to the arrows thrown
  });

  it('the painting’s small things: lotus 4, bell 10, cat 20, lantern 5', () => {
    expect(lotusPay().base).toBe(4);
    expect(bellPay().base).toBe(10);
    expect(catPay().base).toBe(20);
    expect(lanternPay().base).toBe(5);
  });

  it('board wins pay by the machine’s strength; a master’s is never cut', () => {
    expect(boardWinPay('gomoku', 'beginner').base).toBe(10);
    expect(boardWinPay('xiangqi', 'club').base).toBe(25);
    expect(boardWinPay('xiangqi', 'master').base).toBe(60);
    expect(boardWinPay('gomoku', 'master').exempt).toBe(true);
    expect(boardWinPay('gomoku', 'club').source).toBe('gomoku');
  });

  it('Huarong Pass pays 15 to 40 by difficulty, rising', () => {
    const all = Array.from({ length: 7 }, (_, i) => klotskiCoins(i, 7));
    expect(all[0]).toBe(15);
    expect(all[6]).toBe(40);
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThan(all[i - 1]);
    expect(klotskiPay(6, 7, '横刀立马', 'Blade').base).toBe(40);
    expect(klotskiCoins(0, 1)).toBe(40);
  });

  it('tangram 10 per new figure, feihua 1 per line, snake 1 per 5 points, tic-tac-toe 5 a win', () => {
    expect(tangramPay(true).base).toBe(10);
    expect(tangramPay(false).base).toBe(0);
    expect(feihuaPay(0).base).toBe(0);
    expect(feihuaPay(12).base).toBe(12);
    expect(snakePay(4).base).toBe(0);
    expect(snakePay(5).base).toBe(1);
    expect(snakePay(52).base).toBe(10);
    expect(tictactoePay('win', 'easy').base).toBe(5);
    expect(tictactoePay('draw', 'hard').base).toBe(2);
    expect(tictactoePay('draw', 'easy').base).toBe(0);
    expect(tictactoePay('loss', 'hard').base).toBe(0);
  });

  it('every pay has a reason in both languages', () => {
    for (const p of [fishPay('rare', true), pitchpotPay(8), lotusPay(), bellPay(), catPay(), lanternPay(), boardWinPay('xiangqi', 'club'),
      klotskiPay(2, 7, '指挥若定', 'Calm Command'), tangramPay(true), feihuaPay(3), snakePay(30), tictactoePay('win', 'medium')]) {
      expect(p.zh.length, p.source).toBeGreaterThan(0);
      expect(p.en.length, p.source).toBeGreaterThan(0);
      expect(PAY_RULES[p.source]).toBeTruthy();
    }
  });
});

describe('economy · the daily soft cap', () => {
  it('pays in full for the first payouts of the day, then half, then a quarter', () => {
    const r = PAY_RULES.gomoku; // three in full
    expect([0, 1, 2].map((n) => rateFor(r, n))).toEqual([1, 1, 1]);
    expect(rateFor(r, 3)).toBe(0.5); // the fourth win pays half
    expect(rateFor(r, 8)).toBe(0.5);
    expect(rateFor(r, 9)).toBe(0.25);
    expect(rateFor(r, 200)).toBe(0.25);
  });

  it('once-a-day things pay once', () => {
    expect(rateFor(PAY_RULES.bell, 0)).toBe(1);
    expect(rateFor(PAY_RULES.bell, 1)).toBe(0);
    expect(rateFor(PAY_RULES.cat, 1, true)).toBe(0); // exempt never lifts the max
    expect(settle(bellPay(), 1).coins).toBe(0);
    expect(settle(catPay(), 0).coins).toBe(20);
  });

  it('rounds to whole coins and never cuts a paying game to nothing', () => {
    expect(applyRate(25, 0.5)).toBe(13);
    expect(applyRate(5, 0.25)).toBe(1);
    expect(applyRate(1, 0.25)).toBe(1);
    expect(applyRate(0, 1)).toBe(0);
    expect(applyRate(10, 0)).toBe(0);
    expect(applyRate(-4, 1)).toBe(0);
    expect(applyRate(7.9, 1)).toBe(7);
  });

  it('settles a pay against today’s count; exempt pays in full however often', () => {
    const p = boardWinPay('gomoku', 'club');
    expect(settle(p, 0)).toEqual({ coins: 25, base: 25, rate: 1, n: 0 });
    expect(settle(p, 3).coins).toBe(13);
    expect(settle(p, 20).coins).toBe(6);
    expect(settle(boardWinPay('gomoku', 'master'), 20).coins).toBe(60);
    expect(settle(fishPay('legend'), 99).coins).toBe(60);
    expect(settle(fishPay('common'), 5).coins).toBe(3); // the sixth fish of the day
  });

  it('farming one game all day is worth far less than playing a few', () => {
    // twenty snake games of 50 points in a day
    let farm = 0;
    for (let n = 0; n < 20; n++) farm += settle(snakePay(50), n).coins;
    expect(farm).toBeLessThan(20 * 10 * 0.5);
    // versus one win at each of four different games
    const mix = [boardWinPay('gomoku', 'club'), boardWinPay('xiangqi', 'club'), snakePay(50), feihuaPay(10)].reduce((s, p) => s + settle(p, 0).coins, 0);
    expect(mix).toBe(25 + 25 + 10 + 10);
  });

  it('has a rule, a name and a sane cap for every game', () => {
    expect(PAY_SOURCES.length).toBe(13);
    for (const s of PAY_SOURCES) {
      const r = PAY_RULES[s];
      expect(r.full, s).toBeGreaterThanOrEqual(1);
      if (r.max !== undefined) expect(r.max).toBeGreaterThanOrEqual(r.full);
      expect(r.zh && r.en).toBeTruthy();
    }
  });

  it('says why a payout was cut', () => {
    expect(rateNote(1, 'zh')).toBe('');
    expect(rateNote(0.5, 'zh')).toContain('减半');
    expect(rateNote(0.25, 'en')).toContain('quarter');
    expect(rateNote(0, 'en')).toContain('today');
  });
});

import { emptyPlay, questCoins, ERRAND_COINS, ERRANDS_ALL_COINS } from '../src/app/play';
import { emptyState } from '../src/app/store';
import { QUEST } from '../src/data/quests';
import { ENCOUNTER } from '../src/data/encounters';
import { gamesLifetime, hallStat, ledgerToday, statText } from '../src/views/quests/helpers';

describe('economy · the purse’s ledger', () => {
  const day = '2026-09-25';

  it('breaks today’s takings down by source, biggest first', () => {
    const p = emptyPlay();
    const errands = ERRAND_COINS + ERRANDS_ALL_COINS;
    const named = 17 + 25 + errands + questCoins(QUEST['q-water']);
    p.daily = { day, picks: [], counts: { 'coin:fish': 17, 'coin:gomoku': 25, 'pay:fish': 3, earned: named }, visited: [], paid: ['d-fish', 'all'] };
    p.done = { 'q-water': day, 'q-lotus': '2026-09-20' };
    const { rows, total } = ledgerToday(p, day);
    expect(questCoins(QUEST['q-water'])).toBeGreaterThan(errands);
    expect(rows.map((r) => r.key)).toEqual(['quests', 'errands', 'gomoku', 'fish']);
    expect(rows.find((r) => r.key === 'errands')?.coins).toBe(errands);
    expect(total).toBe(named);
  });

  it('totals what the purse counted as income, the rest in one 「其他」 row (last)', () => {
    const p = emptyPlay();
    p.flags = { 'qy:zhiyin': true, 'qy:lanke': true };
    (p.done as Record<string, string>)['qy:zhiyin'] = day;
    (p.done as Record<string, string>)['qy:lanke'] = '2026-09-01';
    // a lookout (20) and a coin spot (2) on top of the encounter and a snake run
    p.daily = { day, picks: [], counts: { 'coin:snake': 3, earned: ENCOUNTER.zhiyin.coins + 3 + 22 }, visited: [], paid: [] };
    const { rows, total } = ledgerToday(p, day);
    expect(rows.map((r) => r.key)).toEqual(['qiyu', 'snake', 'other']);
    expect(rows.find((r) => r.key === 'qiyu')?.coins).toBe(ENCOUNTER.zhiyin.coins);
    const other = rows.find((r) => r.key === 'other')!;
    expect(other.coins).toBe(22);
    expect(other.hintZh).toContain('拾遗');
    expect(total).toBe(ENCOUNTER.zhiyin.coins + 25);
  });

  it('never guesses real-life deeds from the habit data: only what was paid counts', () => {
    const p = emptyPlay();
    p.life = { checkins: 3, incense: 1 };
    // today's check-ins arrived in bulk (an import, the demo garden): payDue paid nothing, so nothing shows
    p.daily = { day, picks: [], counts: {}, visited: [], paid: [] };
    expect(ledgerToday(p, day)).toEqual({ rows: [], total: 0 });
    // two check-ins paid today: income, in 「其他」
    p.daily.counts = { earned: 10 };
    expect(ledgerToday(p, day).rows).toEqual([expect.objectContaining({ key: 'other', coins: 10 })]);
  });

  it('ignores yesterday’s counts; the named rows are a floor for the total', () => {
    const p = emptyPlay();
    p.daily = { day: '2026-09-24', picks: [], counts: { 'coin:snake': 9, earned: 99 }, visited: [], paid: ['d-fish'] };
    expect(ledgerToday(p, day)).toEqual({ rows: [], total: 0 });
    // quests marked on a first load (before the purse counted them): shown, and the total follows
    p.daily = { day, picks: [], counts: { earned: 0 }, visited: [], paid: [] };
    p.done = { 'q-water': day };
    const { rows, total } = ledgerToday(p, day);
    expect(rows.map((r) => r.key)).toEqual(['quests']);
    expect(total).toBe(questCoins(QUEST['q-water']));
  });

  it('the hall card adds the purse to its line; games’ lifetime takings add up', () => {
    const p = emptyPlay();
    p.coins = 12345;
    expect(hallStat(p, 'zh')).toBe(`${statText(p, 'zh')} · 铜\u2060钱\u00a012,345`);
    expect(hallStat(p, 'en')).toBe(`${statText(p, 'en')}\u00a0· 12,345\u00a0coins`);
    p.counters = { 'coin:fish': 30, 'coin:snake': 12, fish: 9 };
    expect(gamesLifetime(p)).toBe(42);
  });
});

import { play, celebrations } from '../src/app/play';
import { state, today } from '../src/app/store';
import { batch } from '@preact/signals';
import { errandPayouts, paidToday, pay, payLine, payNote } from '../src/views/games/purse';
import { dailyPicksFor, record } from '../src/app/play';
import { GAMES_PAY_LEAST, GAMES_PAY_TOP, FISH_COINS, FISH_NEW_PAGE } from '../src/views/games/economy';

describe('economy · paying into the purse', () => {
  it('pays, counts the payout and the coins for today, and cuts after the first few', () => {
    state.value = emptyState();
    play.value = emptyPlay();
    celebrations.value = [];
    const p = boardWinPay('gomoku', 'club');
    const got: number[] = [];
    for (let i = 0; i < 5; i++) got.push(pay(p).coins);
    expect(got).toEqual([25, 25, 25, 13, 13]);
    expect(paidToday('gomoku')).toBe(5);
    expect(play.value.coins).toBe(101);
    expect(play.value.daily.counts['coin:gomoku']).toBe(101);
    expect(play.value.counters['coin:gomoku']).toBe(101);
    // other games keep their own count
    expect(pay(snakePay(50)).coins).toBe(10);
  });

  it('once a day means once; nothing to pay records nothing', () => {
    play.value = emptyPlay();
    expect(pay(bellPay()).coins).toBe(10);
    expect(pay(bellPay()).coins).toBe(0);
    expect(paidToday('bell')).toBe(1);
    expect(pay(snakePay(3)).coins).toBe(0);
    expect(paidToday('snake')).toBe(0);
    expect(play.value.coins).toBe(10);
  });

  it('writes the reason for a card or a toast', () => {
    const p = fishPay('uncommon');
    expect(payLine(p, { coins: 12, base: 12, rate: 1, n: 0 }, 'zh')).toBe('得钱 12 文');
    expect(payLine(p, { coins: 6, base: 12, rate: 0.5, n: 5 }, 'en')).toContain('+6 coins (');
    expect(payLine(p, { coins: 0, base: 12, rate: 0, n: 9 }, 'zh')).toBe('');
    const base = emptyState();
    state.value = { ...base, settings: { ...base.settings, lang: 'zh' } };
    expect(payNote(p, { coins: 12, base: 12, rate: 1, n: 0 })).toBe('难得一尾');
    expect(payNote(p, { coins: 6, base: 12, rate: 0.5, n: 5 })).toBe('难得一尾 · 今日多玩 · 减半');
    state.value = { ...base, settings: { ...base.settings, lang: 'en' } };
    expect(payNote(p, { coins: 12, base: 12, rate: 1, n: 0 })).toBe('An uncommon catch');
  });
});

describe('economy · errands and the range of what games pay', () => {
  it('names the errands a play finished, and doing all three', () => {
    state.value = emptyState();
    play.value = emptyPlay();
    celebrations.value = [];
    const day = play.value.daily.day || today.value;
    const picks = dailyPicksFor(day);
    const before = play.value;
    // finish the first errand
    record(picks[0].key, picks[0].target);
    const one = errandPayouts(before, play.value, 'zh');
    expect(one).toEqual([{ coins: ERRAND_COINS, note: `日课「${picks[0].zh}」` }]);
    expect(play.value.coins - before.coins).toBeGreaterThanOrEqual(ERRAND_COINS);
    // the other two at once: two errands and the bonus
    const mid = play.value;
    batch(() => { for (const d of picks.slice(1)) record(d.key, d.target); });
    const rest = errandPayouts(mid, play.value, 'en');
    expect(rest.map((e) => e.coins)).toEqual([ERRAND_COINS, ERRAND_COINS, ERRANDS_ALL_COINS]);
    expect(rest[2].note).toBe("All of today's errands done");
    // nothing new: nothing to say
    expect(errandPayouts(play.value, play.value, 'zh')).toEqual([]);
  });

  it('the games pay from one coin up to a first legendary fish', () => {
    expect(GAMES_PAY_LEAST).toBe(1);
    expect(GAMES_PAY_TOP).toBe(FISH_COINS.legend + FISH_NEW_PAGE);
    expect(fishPay('legend', true).base).toBe(GAMES_PAY_TOP);
  });
});

