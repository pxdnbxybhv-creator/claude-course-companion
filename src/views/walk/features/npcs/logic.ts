// Pure logic for the people of the painting (no three.js, no DOM): who is about at which hour, where
// someone walking a route is at a given moment, the peddler's shop rules, and which line a person
// says to which companion. Everything here is deterministic (seeded by the day), so it is tested.
import type { CharacterId } from '../../../../data/characters';
import { hashString, makeRng } from '../../../../core/rng';

export interface Line { zh: string; en: string }
export const L = (zh: string, en: string): Line => ({ zh, en });

// ───────────────────────────── per-companion lines ─────────────────────────────

/** Something said differently to some companions, with a fallback for everyone else. */
export type PerCompanion<T> = { any: T } & Partial<Record<CharacterId, T>>;

/** What `m` holds for `who`, or its fallback. */
export function forCompanion<T>(m: PerCompanion<T>, who: CharacterId): T {
  const v = m[who];
  return v === undefined ? m.any : v;
}

/** Does `m` hold something of its own for `who` (not the fallback)? */
export function special<T>(m: PerCompanion<T>, who: CharacterId): boolean {
  return m[who] !== undefined;
}

/** One of `list`, the same all day for this salt, moving on with each talk (n). */
export function pickDaily<T>(list: readonly T[], day: string, salt: string, n = 0): T {
  const base = Math.floor(makeRng(hashString(`${day}:${salt}`))() * list.length);
  return list[(base + n) % list.length];
}

// ───────────────────────────── the hours ─────────────────────────────

export type DayPart = 'dawn' | 'day' | 'dusk' | 'night';

/** The part of the day at a local hour (0..24). */
export function dayPart(hour: number): DayPart {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17.5) return 'day';
  if (h >= 17.5 && h < 19.5) return 'dusk';
  return 'night';
}

/**
 * When someone is about. The sky decides night (the visitor may force it), the hour shades the day:
 * washing is done in the morning, the square fills in the afternoon.
 */
export type Shift = 'always' | 'day' | 'night' | 'morning' | 'afternoon' | 'dawn' | 'evening' | 'fest';

/**
 * `evening`: the night market and lantern viewers, out after dark until 22:00 (midnight on a festival
 * night), not in the small hours. `fest`: only on a festival night, until midnight.
 */
export function onDuty(shift: Shift, hour: number, night: boolean, fest = false): boolean {
  const h = ((hour % 24) + 24) % 24;
  switch (shift) {
    case 'always': return true;
    case 'day': return !night;
    case 'night': return night;
    case 'morning': return !night && h < 13;
    case 'afternoon': return !night && h >= 11;
    case 'dawn': return !night && (h < 10 || h >= 16);
    case 'evening': return night && h >= 5 && h < (fest ? 24 : 22);
    case 'fest': return night && fest && h >= 5;
  }
}

/** Festivals whose nights bring the lanterns out (children with rabbit lanterns, more stalls). */
export const LANTERN_NIGHTS: readonly string[] = ['newyear', 'spring', 'lantern', 'qixi', 'midautumn', 'chongyang'];

// ───────────────────────────── routes ─────────────────────────────

/** A point on a route; `dwell` seconds spent there (a stop), 0 for a point passed through. */
export interface RouteStop { x: number; z: number; dwell?: number; id?: string }

export interface RoutePos {
  x: number;
  z: number;
  /** Facing (radians about +Y, 0 = +z). */
  heading: number;
  moving: boolean;
  /** The stop being dwelt at, if any. */
  stop: string | null;
  /** Index of the stop just left (or dwelt at). */
  seg: number;
}

/** Seconds for one full loop of a closed route at `speed` m/s (dwells included). */
export function routeCycle(stops: readonly RouteStop[], speed: number): number {
  let s = 0;
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i], b = stops[(i + 1) % stops.length];
    s += Math.hypot(b.x - a.x, b.z - a.z) / speed + (a.dwell ?? 0);
  }
  return s;
}

/**
 * Where someone walking the closed route `stops` at `speed` m/s is at time t (seconds; wraps).
 * At each stop they first dwell, then walk on to the next.
 */
export function routeAt(stops: readonly RouteStop[], speed: number, t: number, out?: RoutePos): RoutePos {
  const o = out ?? { x: 0, z: 0, heading: 0, moving: false, stop: null, seg: 0 };
  const n = stops.length;
  if (!n) { o.x = o.z = o.heading = 0; o.moving = false; o.stop = null; o.seg = 0; return o; }
  const cyc = routeCycle(stops, speed);
  let r = cyc > 0 ? ((t % cyc) + cyc) % cyc : 0;
  for (let i = 0; i < n; i++) {
    const a = stops[i], b = stops[(i + 1) % n];
    const dw = a.dwell ?? 0;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const walk = L / speed;
    if (r < dw) {
      // dwelling: facing the way they came in
      const p = stops[(i - 1 + n) % n];
      o.x = a.x; o.z = a.z;
      o.heading = Math.hypot(a.x - p.x, a.z - p.z) > 1e-6 ? Math.atan2(a.x - p.x, a.z - p.z) : 0;
      o.moving = false; o.stop = a.id ?? null; o.seg = i;
      return o;
    }
    r -= dw;
    if (r < walk || i === n - 1) {
      const k = walk > 0 ? Math.min(1, r / walk) : 1;
      o.x = a.x + (b.x - a.x) * k; o.z = a.z + (b.z - a.z) * k;
      o.heading = L > 1e-6 ? Math.atan2(b.x - a.x, b.z - a.z) : 0;
      o.moving = L > 1e-6; o.stop = null; o.seg = i;
      return o;
    }
    r -= walk;
  }
  return o;
}

/** Where along an open polyline (ping-pong) someone is after walking d metres: x, z, heading. */
export function pingPong(pts: readonly { x: number; z: number }[], d: number, out: { x: number; z: number; heading: number }): { x: number; z: number; heading: number } {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  if (pts.length < 2 || total <= 0) { out.x = pts[0]?.x ?? 0; out.z = pts[0]?.z ?? 0; return out; }
  let r = ((d % (2 * total)) + 2 * total) % (2 * total);
  const back = r > total;
  if (back) r = 2 * total - r;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (r <= L || i === pts.length - 1) {
      const k = L > 0 ? Math.min(1, r / L) : 0;
      out.x = a.x + (b.x - a.x) * k;
      out.z = a.z + (b.z - a.z) * k;
      out.heading = back ? Math.atan2(a.x - b.x, a.z - b.z) : Math.atan2(b.x - a.x, b.z - a.z);
      return out;
    }
    r -= L;
  }
  return out;
}

/** Seconds since local midnight: where the day's routes start, so the same hour finds the same place. */
export function clockSeconds(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

// ───────────────────────────── the peddler's wares ─────────────────────────────

export type WareId = 'haws' | 'pinwheel' | 'umbrella' | 'lantern' | 'kite';
/** Everything the walker can hold: the peddler's wares, a flower, a sugar figure. */
export type HoldKind = WareId | 'flower' | 'sugar';

export interface Ware {
  id: WareId;
  zh: string;
  en: string;
  /** One brush glyph for the bag chip. */
  glyph: string;
  price: number;
  /** Kept for good (remembered as the play flag own:<id>); otherwise eaten (candied haws). */
  keep: boolean;
  noteZh: string;
  noteEn: string;
}

export const WARES: Ware[] = [
  { id: 'haws', zh: '糖葫芦', en: 'Candied haws', glyph: '糖', price: 6, keep: false, noteZh: '山楂裹了冰糖，一串五颗，酸里透甜。', noteEn: 'Hawthorns in a crackling sugar glaze, five to a stick — sour, then sweet.' },
  { id: 'pinwheel', zh: '风车', en: 'Pinwheel', glyph: '车', price: 20, keep: true, noteZh: '彩纸风车，走得越快转得越欢。', noteEn: 'A paper pinwheel: the faster you go, the merrier it spins.' },
  { id: 'umbrella', zh: '油纸伞', en: 'Oil-paper umbrella', glyph: '伞', price: 45, keep: true, noteZh: '桐油刷过的伞面，画着一枝梅。晴天遮阳，雨天听雨。', noteEn: 'Tung-oiled paper painted with a plum spray: shade on sunny days, a drum for the rain.' },
  { id: 'lantern', zh: '灯笼', en: 'Paper lantern', glyph: '灯', price: 35, keep: true, noteZh: '竹骨红纸的提灯，天黑了自己会亮。', noteEn: 'Red paper on a bamboo frame, on a stick; it lights itself when night falls.' },
  { id: 'kite', zh: '纸鸢', en: 'Paper kite', glyph: '鸢', price: 60, keep: true, noteZh: '一只沙燕，线轴在手，它就在你头顶上飞。', noteEn: 'A swallow kite: hold the reel and it flies over your head wherever you go.' },
];
export const WARE: Record<WareId, Ware> = Object.fromEntries(WARES.map((w) => [w.id, w])) as Record<WareId, Ware>;

export const ownFlag = (id: WareId) => `own:${id}`;

export type BuyResult = { ok: true; cost: number } | { ok: false; why: 'owned' | 'poor' };

/** Can this ware be bought with these coins and flags? A kept ware is bought once. */
export function canBuy(w: Ware, coins: number, flags: Record<string, true | undefined>): BuyResult {
  if (w.keep && flags[ownFlag(w.id)]) return { ok: false, why: 'owned' };
  if (coins < w.price) return { ok: false, why: 'poor' };
  return { ok: true, cost: w.price };
}

/** Kept wares already owned (in the shop's order). */
export function ownedWares(flags: Record<string, true | undefined>): WareId[] {
  return WARES.filter((w) => w.keep && flags[ownFlag(w.id)]).map((w) => w.id);
}

/** What the walker may pick from the bag: owned wares, and what they carry right now. */
export function bagChoices(flags: Record<string, true | undefined>, carry: { haws: number; flower: number; sugar: string | null }): HoldKind[] {
  const out: HoldKind[] = [];
  if (carry.haws > 0) out.push('haws');
  if (carry.flower > 0) out.push('flower');
  if (carry.sugar) out.push('sugar');
  for (const id of ownedWares(flags)) out.push(id);
  return out;
}

export const HOLD_GLYPH: Record<HoldKind, string> = { haws: '糖', pinwheel: '车', umbrella: '伞', lantern: '灯', kite: '鸢', flower: '花', sugar: '人' };
export const HOLD_NAME: Record<HoldKind, Line> = {
  haws: L('糖葫芦', 'Candied haws'), pinwheel: L('风车', 'Pinwheel'), umbrella: L('油纸伞', 'Umbrella'), lantern: L('灯笼', 'Lantern'),
  kite: L('纸鸢', 'Kite'), flower: L('鲜花', 'Flower'), sugar: L('糖人', 'Sugar figure'),
};

/** Prices at the other stalls. */
export const FORTUNE_PRICE = 10;
export const SUGAR_PRICE = 5;
export const FLOWER_PRICE = 3;
export const SHUTONG_COINS = 25;

// ───────────────────────────── today's picks ─────────────────────────────

/**
 * The storyteller's tale: a companion with a tale of their own hears it (关公 always hears his own
 * legend); everyone else gets the day's tale from the general pool (tales that belong to nobody).
 * `n` moves on to the next tale on another visit the same day.
 */
export function taleFor<T extends { id: string; hero?: CharacterId }>(tales: readonly T[], day: string, who: CharacterId, n = 0): T {
  const own = tales.filter((t) => t.hero === who);
  if (own.length) return pickDaily(own, day, 'tale-own', n);
  const pool = tales.filter((t) => !t.hero);
  return pickDaily(pool.length ? pool : tales, day, 'tale', n);
}

/** A fortune slip: the same for the same day, companion and draw number. */
export function slipFor<T>(slips: readonly T[], day: string, who: CharacterId, n: number): T {
  return slips[Math.floor(makeRng(hashString(`slip:${day}:${who}:${n}`))() * slips.length)];
}

/** The lost page boy and his master: two different places, the same all day. */
export function shutongDay<T extends { region: string }>(spots: readonly T[], day: string): { child: T; master: T } {
  const rng = makeRng(hashString(`shutong:${day}`));
  const child = spots[Math.floor(rng() * spots.length)];
  const others = spots.filter((s) => s.region !== child.region);
  const master = others[Math.floor(rng() * others.length)] ?? child;
  return { child, master };
}

/** The season (0 spring … 3 winter) by month (1..12), for the flower girl's basket. */
export function seasonOf(month: number): 0 | 1 | 2 | 3 {
  if (month >= 3 && month <= 5) return 0;
  if (month >= 6 && month <= 8) return 1;
  if (month >= 9 && month <= 11) return 2;
  return 3;
}

/** Sugar figures collected (flags sugar:<companion>). */
export function sugarCount(flags: Record<string, true | undefined>): number {
  return Object.keys(flags).filter((k) => k.startsWith('sugar:')).length;
}

// ───────────────────────────── what is kept for the day ─────────────────────────────

/** Today's count of `key` in play's daily counts (0 when those counts are another day's). */
export function countToday(daily: { day: string; counts: Record<string, number> }, day: string, key: string): number {
  return daily.day === day ? daily.counts[key] ?? 0 : 0;
}

/** The daily count of flowers given to one person. */
export const giftKey = (who: string) => `gift:${who}`;
/** The daily count of free flowers (嫦娥 and the gardener get one a day). */
export const FREE_FLOWER_KEY = 'flower-free';

/**
 * What a flower brings back: a person's coins or card (and the caller's surprise — a slip, a sugar
 * figure, haws) only for the first flower they get each day; later ones are thanked, nothing more,
 * so a 3-coin flower can never be turned into coins again and again.
 */
export function flowerReward<C>(th: { coins?: number; card?: C } | undefined, givenToday: number): { first: boolean; coins: number; card: C | undefined } {
  const first = givenToday <= 0;
  return { first, coins: first ? th?.coins ?? 0 : 0, card: first ? th?.card : undefined };
}

/** The page boy's errand, as far as it got today (kept in the day's counts, so leaving the painting keeps it). */
export type ShutongStage = 'idle' | 'seeking' | 'note' | 'done';
export const SHUTONG_SEEK = 'shutong:seek';
export const SHUTONG_NOTE = 'shutong:note';
export function shutongStage(done: boolean, daily: { day: string; counts: Record<string, number> }, day: string): ShutongStage {
  if (done) return 'done';
  if (countToday(daily, day, SHUTONG_NOTE)) return 'note';
  if (countToday(daily, day, SHUTONG_SEEK)) return 'seeking';
  return 'idle';
}
