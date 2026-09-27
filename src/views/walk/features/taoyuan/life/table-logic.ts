// 桃源 · 二期「常住」: the table's rules, pure (spec §3.1–3.8). What is on when (the painted part, the
// outside season, the festival 席), what a serving costs (first tastes on the house but for the three
// required dishes, the day's first repeat on the house, 桃花茶 never charged and once a night), which
// good pays (the dish's own first: the 亲手 beat), the day's appetite, where the 特写 films (the cook's
// station, your seat), which 特写 plays, what the companion says, and the mood a dish leaves.
//
// No DOM, no three.js: tests/taoyuan-food.test.ts runs every rule here. Owner: F (food).
import type { CharacterId } from '../../../../../data/characters';
import type { FestivalKey } from '../../../types';
import { termContext, seasonOfTerm } from '../../../../../core/solarterms';
import { CHANNEL, polyDist, walkAt } from '../places';
import { spotOf, type Spot } from '../folk';
import { DISHES, REACT, SEASON_DISH, SPECIALS, TASTE_MOOD, type Special } from './food';
import { APPETITE, FREE, KIND_IDS, PV_ALL, PV_OFF, STOCK_CAP, TEA, eatKey } from './keys';
import type { CookKey, DishId, KindId, Line, Mood, Part, PvMode, Season } from './types';

type Flags = Readonly<Record<string, true | undefined>>;
type XZ = { x: number; z: number };

// ───────────────────────────── what is on when (spec §3.4)

/** The year-round dishes each cook has on at each part (before the seasonal slot and 桃花茶's rule). */
const ON: Record<Part, Partial<Record<CookKey, readonly DishId[]>>> = {
  dawn: { guiniang: ['zhou', 'bing', 'sunzu'], gegu: ['zisu'] },
  day: { guiniang: ['gao', 'tangbing', 'sunzu'], duer: ['xinpei'] },
  dusk: { guiniang: ['jishu', 'sunzu'], duer: ['xinpei'], gegu: ['taojiao'], sang: ['shengao'] },
  night: { duer: ['weiyu', 'taocha'], gegu: ['zisu'], sang: ['shengao'], ashu: ['zhiyu'] },
};

/** The festival 席's dish at 暮 (spec §3.4); any other festival serves the season's dish. */
export const FESTIVAL_DISH: Partial<Record<FestivalKey, DishId>> = {
  midautumn: 's-guiyu',
  dongzhi: 's-junge',
  dragonboat: 's-heye',
  spring: 'gao',
  lantern: 'gao',
};

/** The festival 席's dish for a festival (the season's dish unless the festival has its own). */
export function festivalDish(f: FestivalKey, season: Season): DishId {
  return FESTIVAL_DISH[f] ?? SEASON_DISH[season];
}

/** The outside season at a date (by solar term): the season 桂娘 cooks. */
export function seasonAt(date: Date): Season {
  return seasonOfTerm(termContext(date).current.index);
}

export interface MenuOpts {
  /** The outside season. */
  season: Season;
  /** 花朝失印案 solved (桃花茶 is on only then). */
  solved: boolean;
  /** Today's festival outside, if any (the 暮 席). */
  festival?: FestivalKey | null;
}

/** 新糕 is served with its festival red dots (春节, 元宵 at the 暮 席). */
export function festivalServing(d: DishId, part: Part, festival: FestivalKey | null | undefined): boolean {
  return d === 'gao' && part === 'dusk' && (festival === 'spring' || festival === 'lantern');
}

/** What a cook has on at this part (1–4 dishes, in the order the menu card shows them), or []. */
export function menuFor(cook: CookKey, part: Part, o: MenuOpts): DishId[] {
  const out: DishId[] = [...(ON[part][cook] ?? [])];
  if (cook === 'guiniang') {
    // the seasonal slot: the outside season's dish at its part — at the 暮 席 of a festival, its own dish
    const sd = SEASON_DISH[o.season];
    if (part === 'dusk' && o.festival) {
      const fd = festivalDish(o.festival, o.season);
      if (!out.includes(fd)) out.push(fd);
    } else if (DISHES[sd].parts.includes(part)) {
      out.push(sd);
    }
  }
  return out.filter((d) => d !== 'taocha' || o.solved);
}

/** Every dish on at this part, across the cooks. */
export function menuAll(part: Part, o: MenuOpts): DishId[] {
  const out: DishId[] = [];
  for (const c of ['guiniang', 'duer', 'gegu', 'sang', 'ashu'] as const) for (const d of menuFor(c, part, o)) if (!out.includes(d)) out.push(d);
  return out;
}

/** Is the dish's cook about at this part of an ordinary day (the story's routines)? */
export function cookAbout(cook: CookKey, part: Part, f: Flags, hour: number): boolean {
  return spotOf(cook, 'chang', part, f, hour) !== null;
}

// ───────────────────────────── prices (spec §3.2)

/** What a serving costs now. */
export type Price =
  /** On the house: a first taste, the day's first repeat, or 桃花茶. */
  | { kind: 'free'; why: 'first' | 'daily' | 'tea' }
  /** One good: any kind, or one of these (a required dish). */
  | { kind: 'pay'; accept: 'any' | readonly KindId[]; why: 'first' | 'repeat' }
  /** Not tonight (桃花茶 already had), or not at all (桃花茶 before the case is solved). */
  | { kind: 'none'; why: 'tea-done' | 'locked' };

export interface PriceState {
  /** The dish has been tasted before (flag tyl:eat:<dish>). */
  tasted: boolean;
  /** The day's free repeat already taken (daily count tyl:free). */
  freeUsed: number;
  /** 桃花茶 had today (daily count tyl:tea). */
  teaToday: number;
  /** The case is solved. */
  solved: boolean;
}

export function priceFor(d: DishId, s: PriceState): Price {
  if (d === 'taocha') {
    if (!s.solved) return { kind: 'none', why: 'locked' };
    if (s.teaToday >= 1) return { kind: 'none', why: 'tea-done' };
    return { kind: 'free', why: 'tea' };
  }
  const req = DISHES[d].required;
  if (!s.tasted) return req ? { kind: 'pay', accept: req, why: 'first' } : { kind: 'free', why: 'first' };
  // 「客来先吃」: the day's first repeat is on the house, whatever is on
  if (s.freeUsed < 1) return { kind: 'free', why: 'daily' };
  return { kind: 'pay', accept: req ?? 'any', why: 'repeat' };
}

/** The price state of a dish from the saved flags and today's counts. */
export function priceStateOf(d: DishId, f: Flags, today: (key: string) => number): PriceState {
  return { tasted: !!f[eatKey(d)], freeUsed: today(FREE), teaToday: today(TEA), solved: !!f['case:hz:solved'] };
}

// ───────────────────────────── paying (spec §3.1: the dish's own kind first, else the most held)

/** The kinds that can pay for this price now, in the order the ⇄ cycles them: the dish's own first, then the most held. */
export function payChoices(d: DishId, accept: 'any' | readonly KindId[], stock: (k: KindId) => number): KindId[] {
  const own = DISHES[d].own;
  const ok = KIND_IDS.filter((k) => (accept === 'any' || accept.includes(k)) && stock(k) > 0);
  return ok.sort((a, b) => (a === own ? -1 : b === own ? 1 : stock(b) - stock(a) || KIND_IDS.indexOf(a) - KIND_IDS.indexOf(b)));
}

/** The good that pays by default (or `prefer`, when it can): null when nothing held will do. */
export function pickPayment(d: DishId, accept: 'any' | readonly KindId[], stock: (k: KindId) => number, prefer?: KindId | null): KindId | null {
  const c = payChoices(d, accept, stock);
  if (prefer && c.includes(prefer)) return prefer;
  return c[0] ?? null;
}

/**
 * The 亲手 beat: the cook works your own good into the dish. It plays when you pay with the dish's own
 * kind, and on a serving on the house while you hold it (the same price, plus the beat: spec §3.2).
 */
export function ownBeat(d: DishId, price: Price, paidWith: KindId | null, stock: (k: KindId) => number): KindId | null {
  const own = DISHES[d].own;
  if (!own) return null;
  if (price.kind === 'pay') return paidWith === own ? own : null;
  if (price.kind === 'free') return stock(own) > 0 ? own : null;
  return null;
}

/** The stock of a good (got − used within 0…6), from any counters (the same rule as keys.ts). */
export function stock(counters: Readonly<Record<string, number | undefined>>, k: KindId): number {
  const n = Math.floor(counters[`tyl:got:${k}`] ?? 0) - Math.floor(counters[`tyl:used:${k}`] ?? 0);
  return Math.max(0, Math.min(STOCK_CAP, n));
}

/** The day's free repeat is still there. */
export const freeToday = (freeUsed: number): boolean => freeUsed < 1;

// ───────────────────────────── appetite (spec §3.2)

/** A bowl or a plate costs 2 units of the day's 8; a drink (饮) 1. */
export const unitsOf = (d: DishId): number => (DISHES[d].pv === '饮' ? 1 : 2);

export type Appetite = 'ok' | 'extra' | 'full';

/**
 * Can one more serving of `d` go down today: 'ok' within the 8 units; 'extra' as a festival day's one
 * serving beyond them (daily count tyl:jie); 'full' otherwise.
 */
export function appetite(d: DishId, belly: number, o: { festival: boolean; extraUsed: number }): Appetite {
  if (belly + unitsOf(d) <= APPETITE) return 'ok';
  if (o.festival && o.extraUsed < 1) return 'extra';
  return 'full';
}

/** The four bowls on the menu card: how full each is (0, 0.5 or 1). */
export function bowls(belly: number): number[] {
  return [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1, (belly - i * 2) / 2)));
}

// ───────────────────────────── the 特写 (spec §4.4) and the mood (spec §3.8)

/** Which 特写 plays: 不看 never, 每回 always, 头一回 (the default) in full on a first taste, else the short cut. */
export function pvModeFor(f: Flags, first: boolean): PvMode {
  if (f[PV_OFF]) return 'none';
  if (f[PV_ALL]) return 'full';
  return first ? 'full' : 'short';
}

/** The mood a serving leaves (null: the mood stays as it was — 大橘 only sniffs 新醅). 醴 is sweet. */
export function moodAfter(d: DishId, who: CharacterId): Mood | null {
  if (d === 'xinpei') {
    const sw = DISHES.xinpei.swaps?.[who];
    if (sw) return sw.li ? '甜' : null;
  }
  return TASTE_MOOD[DISHES[d].taste];
}

/** 新醅 for this companion: 杜二's line before he pours, and whether it is 醴. */
export function xinpeiSwap(who: CharacterId): { line: Line; li: boolean } | null {
  return DISHES.xinpei.swaps?.[who] ?? null;
}

/** What the companion says in 尝: their special on this dish, else their line for its taste. */
export function reactionFor(who: CharacterId, d: DishId): { line: Line; reply?: Special['reply'] } {
  const sp = SPECIALS[who]?.find((s) => s.dish === d);
  if (sp) return { line: sp.line, reply: sp.reply };
  return { line: REACT[who][DISHES[d].taste] };
}

// ───────────────────────────── stations and seats (spec §3.3; valley-local x, z)

/** The long tables' footprint and the well's (valley.ts BUILT keeps trees off them; stalls keep off too). */
const KEEP_OFF: readonly [number, number, number][] = [[4.6, 0, 2.4], [-3, 2, 1.2]];
/** 桂娘's new clay stove by the long tables: the first of these with room (spec §3.3). */
export const STOVE_CANDIDATES: readonly XZ[] = [{ x: 7.6, z: -2.8 }, { x: 2.4, z: -3.6 }, { x: 8.4, z: -5.0 }];

/** A stove spot has a walkable 1.6 m disc, ≥1.2 m clear of the tables and the well and of the channel. */
export function stoveFits(p: XZ): boolean {
  for (let a = 0; a < 12; a++) {
    const r = a % 2 ? 0.8 : 0.4;
    const x = p.x + Math.cos((a / 12) * Math.PI * 2) * r, z = p.z + Math.sin((a / 12) * Math.PI * 2) * r;
    if (!walkAt(x, z)) return false;
  }
  if (!walkAt(p.x, p.z)) return false;
  for (const [x, z, r] of KEEP_OFF) if (Math.hypot(p.x - x, p.z - z) < r + 1.2) return false;
  return polyDist(CHANNEL, p.x, p.z).d >= 1.2;
}

let stove: XZ | null = null;
/** 桂娘's stove (the stall mesh stands it there; the 特写's 起 films it). */
export function stoveSpot(): XZ {
  return (stove ??= STOVE_CANDIDATES.find(stoveFits) ?? STOVE_CANDIDATES[1]);
}

/** Where a cook's 特写 is filmed (valley-local): the prop worked at, where the cook stands, where you sit. */
export interface Station {
  /** The stove, the counter, the brazier, the tray, the ember ring (the stall mesh's prop). */
  prop: XZ;
  /** Where the cook stands (or sits) to work it. */
  cook: XZ;
  /** Where you sit (or stand) for 落 → 尝; 'tables': the first free seat at the long tables. */
  seat: XZ | 'tables';
  /** What you face there (default: the prop). */
  seatFace?: XZ;
}

/** The new props of the stalls (the stall mesh builds these; valley.ts BUILT keeps the peaches off). */
export const PROPS = {
  /** 杜二's counter: a bowl stack, a gourd and a small wine-flag (the counter itself is the brewery's). */
  counter: { x: 19.6, z: 4.6 },
  /** 杜二's small brazier by the brewery step (夜). */
  stepBrazier: { x: 19.3, z: 6.5 },
  /** 葛姑's brazier and pot on her porch. */
  porchBrazier: { x: 24.9, z: -14.7 },
  /** 三娘's low tray-table with two cups, on the doorstep. */
  tray: { x: -21.4, z: 3.1 },
  /** 阿黍's ember ring of stones by the stream. */
  embers: { x: 4.6, z: 13.6 },
} as const;

/** The cook's station and your seat at this part (spec §3.3). */
export function stationFor(cook: CookKey, part: Part): Station {
  switch (cook) {
    case 'guiniang': {
      // the stove by the long tables at every part; she stands on its far side from the tables
      const s = stoveSpot();
      const dx = s.x - 4.6, dz = s.z - 0, n = Math.hypot(dx, dz) || 1;
      return { prop: s, cook: { x: s.x + (dx / n) * 0.75, z: s.z + (dz / n) * 0.75 }, seat: 'tables' };
    }
    case 'duer':
      if (part === 'night') return { prop: PROPS.stepBrazier, cook: { x: 20.4, z: 5.8 }, seat: { x: 20.3, z: 6.75 }, seatFace: { x: 17, z: 6.75 } };
      if (part === 'dusk') return { prop: { x: 4.95, z: -2.2 }, cook: { x: 5.5, z: -2.2 }, seat: 'tables' };
      return { prop: PROPS.counter, cook: { x: 20.3, z: 4.6 }, seat: { x: 18.75, z: 4.6 }, seatFace: { x: 20.3, z: 4.6 } };
    case 'gegu':
      return part === 'dusk'
        ? { prop: PROPS.porchBrazier, cook: { x: 24, z: -15.4 }, seat: { x: 23.2, z: -14.9 } }
        : { prop: PROPS.porchBrazier, cook: { x: 24, z: -15.4 }, seat: { x: 27.1, z: -19.2 }, seatFace: { x: 26, z: -20 } };
    case 'sang':
      return { prop: PROPS.tray, cook: { x: -22, z: 3.4 }, seat: { x: -20.8, z: 3.5 }, seatFace: { x: -21, z: 0 } };
    case 'ashu':
      return { prop: PROPS.embers, cook: { x: 5.25, z: 14.05 }, seat: { x: 3.95, z: 13.15 } };
  }
}

/**
 * The first seat at the long tables (the B3 feast's seats) with nobody standing within 0.8 m of it
 * (`occupied`: where the villagers stand now, valley-local), or null when every one is taken.
 */
export function freeSeat(seats: readonly (Spot | null | undefined)[], occupied: readonly XZ[]): Spot | null {
  for (const s of seats) {
    if (!s) continue;
    if (occupied.every((o) => Math.hypot(o.x - s.x, o.z - s.z) >= 0.8)) return s;
  }
  return null;
}
