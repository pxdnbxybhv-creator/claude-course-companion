// 桃源 · 二期「常住」: every saved key of the valley's everyday life (spec §7), and the id lists they are
// made from. Everything lives in `play` (backed up, synced) under the prefix `tyl:` — never `ty:`, which
// is the story's. Every key is ≤64 characters (the longest, `tyl:with:tangbing:swordsman`, is 27).
// Counters only ever rise (sanitizePlay drops zeros and negatives): the stock of a good is
// got − used, and nothing is ever decremented. Pure: no DOM, no three.js (tests import it).
//
// Owner: L. Everyone builds keys here and nowhere else.
import type { CharacterId } from '../../../../../data/characters';
import { diffDays } from '../../../../../core/date';
import type { TyxiGame } from '../../../../games/economy';
import type { DishId, GameId, KindId, SeasonDishId, SongId } from './types';

/** The prefix of every life key (the owner's code must never write one). */
export const LIFE_PREFIX = 'tyl:';
/** The claim (minigames/ui begin/end) the table, the games and 歇一歇 hold. */
export const LIFE_CLAIM = 'taoyuan-life';

// ───────────────────────────── the id lists

/** The 13 year-round dishes (in the 食单's order). */
export const YEAR_DISHES = ['zhou', 'bing', 'gao', 'tangbing', 'jishu', 'sunzu', 'xinpei', 'weiyu', 'taocha', 'zisu', 'taojiao', 'shengao', 'zhiyu'] as const satisfies readonly DishId[];
/** The 4 seasonal dishes: spring, summer, autumn, winter. */
export const SEASON_DISHES = ['s-aigao', 's-heye', 's-guiyu', 's-junge'] as const satisfies readonly SeasonDishId[];
/** All 17. */
export const DISH_IDS: readonly DishId[] = [...YEAR_DISHES, ...SEASON_DISHES];
/** The three dishes that need their good even the first time. */
export const REQUIRED_DISHES = ['zhiyu', 'shengao', 'xinpei'] as const satisfies readonly DishId[];
/** 知味 counts 12: the 13 year-round dishes minus 桃花茶 (spec §3.9). */
export const ZHIWEI_TARGET = 12;

export const KIND_IDS = ['yu', 'shen', 'qu', 'dan', 'jun', 'shu'] as const satisfies readonly KindId[];
export const GAME_IDS = ['qu', 'mo', 'can', 'yuan', 'ying', 'shang'] as const satisfies readonly GameId[];
export const SONG_IDS = ['qizao', 'caiqu', 'gane', 'shoushu', 'huazhao'] as const satisfies readonly SongId[];

// (the lists above name every id of their union: a new id added to types.ts and not here fails here)
type Missing<U, L extends readonly unknown[]> = Exclude<U, L[number]>;
const _all: [Missing<DishId, typeof DISH_IDS>, Missing<KindId, typeof KIND_IDS>, Missing<GameId, typeof GAME_IDS>, Missing<SongId, typeof SONG_IDS>] extends [never, never, never, never] ? true : never = true;
void _all;
// (the games' ids are the economy's tyxiPay ids)
const _tyxi: [Exclude<GameId, TyxiGame>, Exclude<TyxiGame, GameId>] extends [never, never] ? true : never = true;
void _tyxi;

// ───────────────────────────── the rules' numbers

/** The jar holds at most 6 of each good; a grant beyond it is lost. */
export const STOCK_CAP = 6;
/** Appetite units a day: a bowl or plate costs 2, a drink (饮) 1. */
export const APPETITE = 8;
/** A game pays 土产 on its first 3 rounds of the day. */
export const PAID_ROUNDS = 3;

// ───────────────────────────── flags

/** The first return (小满 at the mouth). */
export const BACK = 'tyl:back';
/** A dish tasted (also `done[eatKey(d)]`, the date of the first taste). */
export const eatKey = (d: DishId) => `tyl:eat:${d}`;
/** Who you first ate it with (the 食单 portrait). */
export const withKey = (d: DishId, c: CharacterId) => `tyl:with:${d}:${c}`;
/** A game's seal feat (normal mode only). */
export const sealKey = (g: GameId) => `tyl:seal:${g}`;
/** 熟 reached on a 号子 (it stays open). */
export const songKey = (s: SongId) => `tyl:qu:${s}`;
/** The first 熟 and 精 at 纸鸢 (the 蝶 and 鹰 kites). */
export const KITE_DIE = 'tyl:kite:die';
export const KITE_YING = 'tyl:kite:ying';
/** The start card's 「慢些」 toggle. */
export const GENTLE = 'tyl:gentle';
/** The 食单's 特写 setting: 每回 or 不看 (neither: 头一回). */
export const PV_ALL = 'tyl:pv:all';
export const PV_OFF = 'tyl:pv:off';

/** Quest prefixes (src/data/quests.ts): 知味, 乐土, 四时. */
export const EAT_PREFIX = 'tyl:eat:';
export const SEAL_PREFIX = 'tyl:seal:';
export const SEASON_EAT_PREFIX = 'tyl:eat:s-';

// ───────────────────────────── counters (lifetime; record() also counts them today)

export const gotKey = (k: KindId) => `tyl:got:${k}`;
export const usedKey = (k: KindId) => `tyl:used:${k}`;
/** Every serving of a dish. */
export const ateKey = (d: DishId) => `tyl:ate:${d}`;
/** A 鳜 from 摸鱼 kept in the jar among the 鱼, and one gone (paid for 炙鱼, or the last 鱼 paid away). */
export const GUI_GOT = 'tyl:gui:got';
export const GUI_USED = 'tyl:gui:used';

// ───────────────────────────── daily counts (read from play.daily.counts, today only)

/** Appetite units eaten today (≤ APPETITE; one serving more on a festival). */
export const BELLY = 'tyl:belly';
/** The day's first repeat, on the house (≤1). */
export const FREE = 'tyl:free';
/** 留一碗 lifted (≤1). */
export const LIU = 'tyl:liu';
/** The festival's extra serving (≤1). */
export const JIE = 'tyl:jie';
/** 桃花茶 tonight (≤1). */
export const TEA = 'tyl:tea';
/** 今日之约 beaten (≤1). */
export const YUE = 'tyl:yue';
/** 小满's news at the mouth, said today (≤1). */
export const NEWS = 'tyl:news';
/** A game's 土产-paying rounds today (≤ PAID_ROUNDS). */
export const playKey = (g: GameId) => `tyl:play:${g}`;

// ───────────────────────────── bests (recordMax)

export const bestKey = (g: GameId) => `tyl:best:${g}`;
/** A gentle-mode best. */
export const bestGentleKey = (g: GameId) => `tyl:bestm:${g}`;
export const songBestKey = (s: SongId) => `tyl:best:qu:${s}`;
/** The day number of the last visit (for the absence letter). */
export const LAST_DAY = 'tyl:lastday';
/** A DateKey's day number (days since 2020-01-01): what LAST_DAY holds. */
export const dayNumber = (day: string): number => Math.max(1, diffDays('2020-01-01', day));

/** The 踩曲 calibration (a per-device convenience in localStorage; try/catch). Not in play. */
export const QU_LAG_STORAGE = 'tyl.qu.lag';

// ───────────────────────────── pure rules over the saved counters

type Counters = Readonly<Record<string, number | undefined>>;

/** How many of a good are held: got − used, within 0…STOCK_CAP. */
export function stockFrom(c: Counters, k: KindId): number {
  const n = Math.floor(c[gotKey(k)] ?? 0) - Math.floor(c[usedKey(k)] ?? 0);
  return Math.max(0, Math.min(STOCK_CAP, n));
}

/** A 鳜 is in the jar: one kept and not yet gone, and a 鱼 still held (柳枝炙鱼's 亲手 line with a 鳜). */
export function guiHeld(c: Counters): boolean {
  return Math.floor(c[GUI_GOT] ?? 0) > Math.floor(c[GUI_USED] ?? 0) && stockFrom(c, 'yu') > 0;
}

/** Of a grant of n, how many the jar keeps now (the rest is lost). */
export function keptOf(c: Counters, k: KindId, n: number): number {
  const want = Math.max(0, Math.floor(n));
  return Math.min(want, STOCK_CAP - stockFrom(c, k));
}

/** A daily count as of `day` (0 when the saved daily counts are another day's). */
export function dailyCount(d: { day: string; counts: Counters }, day: string, key: string): number {
  return d.day === day ? Math.max(0, Math.floor(d.counts[key] ?? 0)) : 0;
}

/**
 * Every key the life layer can write (for the tests: each ≤64 and under LIFE_PREFIX), given the
 * companions (13).
 */
export function allLifeKeys(companions: readonly CharacterId[]): string[] {
  const out = [BACK, KITE_DIE, KITE_YING, GENTLE, PV_ALL, PV_OFF, BELLY, FREE, LIU, JIE, TEA, YUE, NEWS, LAST_DAY, GUI_GOT, GUI_USED];
  for (const d of DISH_IDS) {
    out.push(eatKey(d), ateKey(d));
    for (const c of companions) out.push(withKey(d, c));
  }
  for (const g of GAME_IDS) out.push(sealKey(g), playKey(g), bestKey(g), bestGentleKey(g));
  for (const s of SONG_IDS) out.push(songKey(s), songBestKey(s));
  for (const k of KIND_IDS) out.push(gotKey(k), usedKey(k));
  return out;
}
