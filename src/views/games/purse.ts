// Paying out: applies the rules in economy.ts to the purse in app/play.ts. Every payout counts
// `pay:<game>` (how many times it paid today, for the soft cap) and `coin:<game>` (how much), both
// in today's counts and for all time — the quest book's purse reads them to show where coins came
// from. The 3D HUD floats its own +N when the purse grows; the games on the shelf call payToast,
// and their frame (GameShell) watches for today's errands paying out, which pay no toast of their own.
import { batch } from '@preact/signals';
import { dailyPicksFor, earn, ERRAND_COINS, ERRANDS_ALL_COINS, play, record, type PlayState } from '../../app/play';
import { lang, today } from '../../app/store';
import { coinToast } from '../../ui/coins';
import { coinKey, payKey, rateNote, settle, type Pay, type PaySource, type Payout } from './economy';

/** How many times a game has paid today. */
export function paidToday(source: PaySource): number {
  const p = play.value;
  return p.daily.day === today.value ? p.daily.counts[payKey(source)] ?? 0 : 0;
}

/** Pay out (soft-capped by what this game already paid today). Returns what was paid. */
export function pay(p: Pay): Payout {
  const out = settle(p, paidToday(p.source));
  if (out.base <= 0 || out.rate === 0) return out;
  // one change for whoever watches the purse (the HUD's +N, the quest book)
  batch(() => {
    record(payKey(p.source));
    if (out.coins > 0) {
      record(coinKey(p.source), out.coins);
      earn(out.coins);
    }
  });
  return out;
}

/** The reason line for a payout, in the current language, with the cap's note when it was cut. */
export function payNote(p: Pay, out: Payout): string {
  const l = lang.value === 'en' ? 'en' : 'zh';
  const why = l === 'zh' ? p.zh : p.en;
  const cut = rateNote(out.rate, l);
  return cut ? `${why} · ${cut}` : why;
}

/** A payout with its reason line (for a result card's 「得钱」 line). */
export type Paid = Payout & { note: string };

/** Pay out and float 「+N 文」 up the screen (from `from`, if given). */
export function payToast(p: Pay, from?: Element | null): Paid {
  const out = pay(p);
  const note = payNote(p, out);
  if (out.coins > 0) coinToast(out.coins, { note, from });
  return { ...out, note };
}

/** For a card's text in the painting: "+12 文" / "+12 coins", with the cap's note. '' if nothing was paid. */
export function payLine(p: Pay, out: Payout, l: 'zh' | 'en'): string {
  if (out.coins <= 0) return '';
  const cut = rateNote(out.rate, l);
  return l === 'zh' ? `得钱 ${out.coins} 文${cut ? `（${cut}）` : ''}` : `+${out.coins} coins${cut ? ` (${cut})` : ''}`;
}

/** The errands that paid between two play states, as toasts: 「+30 文 · 日课「下一局棋」」. (The first
 *  change of a new day rolls the errands over and may pay one in the same step.) */
export function errandPayouts(was: PlayState, now: PlayState, l: 'zh' | 'en'): { coins: number; note: string }[] {
  const before = now.daily.day === was.daily.day ? was.daily.paid : [];
  if (now.daily.paid.length <= before.length) return [];
  const picks = dailyPicksFor(now.daily.day);
  const out: { coins: number; note: string }[] = [];
  for (const id of now.daily.paid) {
    if (before.includes(id)) continue;
    if (id === 'all') {
      out.push({ coins: ERRANDS_ALL_COINS, note: l === 'zh' ? '今日日课全数完成' : "All of today's errands done" });
      continue;
    }
    const d = picks.find((x) => x.id === id);
    out.push({ coins: ERRAND_COINS, note: l === 'zh' ? `日课「${d?.zh ?? ''}」` : `Errand: ${d?.en ?? ''}` });
  }
  return out;
}

/**
 * While a game on the shelf is open: float 「+N 文」 for each of today's errands the play finishes
 * (a board game played, ten blossoms eaten…) — they pay straight into the purse with no note of their
 * own. Quests announce themselves (the celebration card). Returns the unsubscribe.
 */
export function watchErrands(): () => void {
  let prev = play.peek();
  return play.subscribe((p) => {
    const was = prev;
    prev = p;
    if (p === was) return;
    const l = lang.peek() === 'en' ? 'en' : 'zh';
    for (const e of errandPayouts(was, p, l)) coinToast(e.coins, { note: e.note });
  });
}
