// 铜钱 · what the games pay. Pure rules — no DOM, no state — tested in tests/economy.test.ts.
//
// Every game in the app pays a little: the mini-games inside the painting (fishing, pitch-pot,
// lotus pods, the temple bell, Big Ginger, a river lantern) and the games on the shelf (gomoku,
// xiangqi, Huarong Pass, tangram, Flying Flowers, Snake, tic-tac-toe). The daily soft cap keeps it
// honest: the same game pays in full for its first few payouts of the day, then half, then a
// quarter (never less than one coin) — so a quiet game is always worth something, and farming one
// is not worth much. A few pay once a day at most (the bell, the cat); a few lucky or hard-won
// things are never cut (a rare fish, a win over the 国手).
//
// The purse itself lives in app/play.ts; games/purse.ts applies these rules to it.

export type PaySource =
  | 'fish' | 'pitchpot' | 'lotus' | 'bell' | 'cat' | 'lantern'
  | 'gomoku' | 'xiangqi' | 'klotski' | 'tangram' | 'feihua' | 'snake' | 'tictactoe';

export interface PayRule {
  zh: string;
  en: string;
  /** Where it is played: inside the painting, or on the games shelf. */
  where: 'walk' | 'games';
  /** Payouts a day at the full rate. */
  full: number;
  /** At most this many payouts a day (after that it pays nothing more until tomorrow). */
  max?: number;
}

export const PAY_RULES: Record<PaySource, PayRule> = {
  fish: { zh: '垂钓', en: 'Fishing', where: 'walk', full: 5 },
  pitchpot: { zh: '投壶', en: 'Pitch-pot', where: 'walk', full: 3 },
  lotus: { zh: '采莲', en: 'Lotus pods', where: 'walk', full: 8 },
  bell: { zh: '撞钟', en: 'Temple bell', where: 'walk', full: 1, max: 1 },
  cat: { zh: '寻猫', en: 'Big Ginger', where: 'walk', full: 1, max: 1 },
  lantern: { zh: '河灯', en: 'River lantern', where: 'walk', full: 3 },
  gomoku: { zh: '五子棋', en: 'Gomoku', where: 'games', full: 3 },
  xiangqi: { zh: '象棋', en: 'Xiangqi', where: 'games', full: 3 },
  klotski: { zh: '华容道', en: 'Huarong Pass', where: 'games', full: 3 },
  tangram: { zh: '七巧板', en: 'Tangram', where: 'games', full: 5 },
  feihua: { zh: '飞花令', en: 'Flying Flowers', where: 'games', full: 3 },
  snake: { zh: '贪吃蛇', en: 'Snake', where: 'games', full: 3 },
  tictactoe: { zh: '井字棋', en: 'Tic-tac-toe', where: 'games', full: 3 },
};

export const PAY_SOURCES = Object.keys(PAY_RULES) as PaySource[];

/** Play-counter keys: how many payouts a game made (today, in daily counts) and the coins it paid. */
export const payKey = (s: PaySource) => `pay:${s}`;
export const coinKey = (s: PaySource) => `coin:${s}`;

/** One thing that pays: the game, its full amount, why (for the toast), and whether the cap spares it. */
export interface Pay {
  source: PaySource;
  base: number;
  zh: string;
  en: string;
  /** Never cut by the daily soft cap (a rare fish, a master beaten). The `max` still applies. */
  exempt?: boolean;
}

export type Rate = 1 | 0.5 | 0.25 | 0;

/** The rate for a payout when this game has already paid `n` times today. */
export function rateFor(rule: PayRule, n: number, exempt = false): Rate {
  if (rule.max !== undefined && n >= rule.max) return 0;
  if (exempt || n < rule.full) return 1;
  if (n < rule.full * 3) return 0.5;
  return 0.25;
}

/** Coins at a rate: whole coins, and at least one while the game still pays at all. */
export function applyRate(base: number, rate: Rate): number {
  const b = Math.max(0, Math.floor(base));
  if (!b || !rate) return 0;
  return rate === 1 ? b : Math.max(1, Math.round(b * rate));
}

export interface Payout {
  /** Coins actually paid. */
  coins: number;
  /** What it would have paid in full. */
  base: number;
  rate: Rate;
  /** Payouts of this game today before this one. */
  n: number;
}

/** What `pay` is worth when its game has paid `n` times today. */
export function settle(pay: Pay, n: number): Payout {
  const base = Math.max(0, Math.floor(pay.base));
  const rate = rateFor(PAY_RULES[pay.source], Math.max(0, Math.floor(n)), pay.exempt);
  return { coins: applyRate(base, rate), base, rate, n };
}

/** A short note on a cut payout ('' when paid in full). */
export function rateNote(rate: Rate, lang: 'zh' | 'en'): string {
  if (rate === 1) return '';
  if (rate === 0) return lang === 'zh' ? '今日已领过' : 'Already paid today';
  if (rate === 0.5) return lang === 'zh' ? '今日多玩 · 减半' : 'Played a lot today · half';
  return lang === 'zh' ? '今日玩够了 · 四分之一' : 'Plenty today · a quarter';
}

// ------------------------------------------------------------------------------ in the painting

export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legend' | 'junk';

/** A catch, by rarity (about 2–60); the first of its kind adds a page to the fish album and 10 more. */
export const FISH_COINS: Record<FishRarity, number> = { junk: 2, common: 5, uncommon: 12, rare: 30, legend: 60 };
export const FISH_NEW_PAGE = 10;

export function fishPay(rarity: FishRarity, newPage = false): Pay {
  const note = { junk: ['捞起一只草鞋', 'Fished out a sandal'], common: ['钓得一尾', 'A catch'], uncommon: ['难得一尾', 'An uncommon catch'], rare: ['稀有之鱼', 'A rare fish'], legend: ['传说之鱼', 'A legend'] }[rarity];
  return {
    source: 'fish',
    base: FISH_COINS[rarity] + (newPage && rarity !== 'junk' ? FISH_NEW_PAGE : 0),
    zh: note[0] + (newPage && rarity !== 'junk' ? ' · 鱼谱新页' : ''),
    en: note[1] + (newPage && rarity !== 'junk' ? ' · new album page' : ''),
    exempt: rarity === 'rare' || rarity === 'legend',
  };
}

/** Pitch-pot: 3 per arrow in, and 20 more for a full round (every arrow in). */
export const POT_PER_HIT = 3;
export const POT_FULL_BONUS = 20;
export function pitchpotPay(hits: number, arrows = 8): Pay {
  const h = Math.max(0, Math.min(arrows, Math.floor(hits)));
  const full = arrows > 0 && h === arrows;
  return { source: 'pitchpot', base: h * POT_PER_HIT + (full ? POT_FULL_BONUS : 0), zh: full ? `八矢全中 · 全壶` : `投中${h}矢`, en: full ? 'Every arrow in' : `${h} arrow${h === 1 ? '' : 's'} in` };
}

export const LOTUS_COINS = 4;
export const lotusPay = (): Pay => ({ source: 'lotus', base: LOTUS_COINS, zh: '采得莲蓬', en: 'A lotus pod' });

export const BELL_COINS = 10;
export const bellPay = (): Pay => ({ source: 'bell', base: BELL_COINS, zh: '晨钟暮鼓 · 香火钱', en: 'Temple alms' });

export const CAT_COINS = 20;
export const catPay = (): Pay => ({ source: 'cat', base: CAT_COINS, zh: '寻猫启事 · 赏钱', en: 'Reward: cat found' });

export const LANTERN_COINS = 5;
export const lanternPay = (): Pay => ({ source: 'lantern', base: LANTERN_COINS, zh: '河灯寄愿', en: 'A wish floated' });

// ------------------------------------------------------------------------------ on the shelf

export type BoardLevel = 'beginner' | 'club' | 'master';
/** A win over the machine at gomoku or xiangqi: 初学 10 / 棋友 25 / 国手 60 (a master's is never cut). */
export const BOARD_WIN_COINS: Record<BoardLevel, number> = { beginner: 10, club: 25, master: 60 };
const LEVEL_ZH: Record<BoardLevel, string> = { beginner: '初学', club: '棋友', master: '国手' };
const LEVEL_EN: Record<BoardLevel, string> = { beginner: 'Beginner', club: 'Club', master: 'Master' };

export function boardWinPay(game: 'gomoku' | 'xiangqi', level: BoardLevel): Pay {
  return { source: game, base: BOARD_WIN_COINS[level], zh: `胜「${LEVEL_ZH[level]}」`, en: `Beat ${LEVEL_EN[level]}`, exempt: level === 'master' };
}

/** Huarong Pass: 15 for the gentlest layout up to 40 for 横刀立马, by its place in the list. */
export function klotskiCoins(index: number, count: number): number {
  if (count <= 1) return 40;
  const k = Math.max(0, Math.min(1, index / (count - 1)));
  return Math.round(15 + 25 * k);
}
export function klotskiPay(index: number, count: number, nameZh: string, nameEn: string): Pay {
  return { source: 'klotski', base: klotskiCoins(index, count), zh: `「${nameZh}」脱身`, en: `${nameEn} solved` };
}

/** Tangram: 10 for each figure made for the first time (a figure made again pays nothing). */
export const TANGRAM_NEW = 10;
export function tangramPay(isNew: boolean): Pay {
  return { source: 'tangram', base: isNew ? TANGRAM_NEW : 0, zh: '新拼一图', en: 'A new figure' };
}

/** Flying Flowers: one coin a line in the chain. */
export function feihuaPay(lines: number): Pay {
  const n = Math.max(0, Math.floor(lines));
  return { source: 'feihua', base: n, zh: `飞花令 · 接${n}句`, en: `${n} line${n === 1 ? '' : 's'} chained` };
}

/** Snake: one coin for every five points. */
export function snakePay(score: number): Pay {
  const s = Math.max(0, Math.floor(score));
  return { source: 'snake', base: Math.floor(s / 5), zh: `长蛇 ${s} 分`, en: `Snake · ${s} points` };
}

/** Tic-tac-toe against the machine: 5 for a win; a draw with the unbeatable 难 is worth 2. */
export const TTT_WIN = 5;
export const TTT_DRAW_HARD = 2;
export function tictactoePay(result: 'win' | 'draw' | 'loss', level: 'easy' | 'medium' | 'hard'): Pay {
  const base = result === 'win' ? TTT_WIN : result === 'draw' && level === 'hard' ? TTT_DRAW_HARD : 0;
  return { source: 'tictactoe', base, zh: result === 'win' ? '胜一局' : '与「难」言和', en: result === 'win' ? 'A win' : 'A draw with Hard' };
}

// ------------------------------------------------------------------------------ the whole range

/** The most a single payout in any game can be (a first legendary fish: 60 + 10 for its album page). */
export const GAMES_PAY_TOP = Math.max(
  ...Object.values(FISH_COINS).map((c) => c + FISH_NEW_PAGE),
  8 * POT_PER_HIT + POT_FULL_BONUS,
  ...Object.values(BOARD_WIN_COINS),
  klotskiCoins(1, 1),
  BELL_COINS, CAT_COINS, LANTERN_COINS, LOTUS_COINS, TANGRAM_NEW, TTT_WIN,
);
/** The least a game pays when it pays at all (a cut payout is never under one coin). */
export const GAMES_PAY_LEAST = 1;
