// 桃源 · 二期: the 特写's shot tables (spec §4.1–4.5), as pure data and timing. The director (pv.ts)
// films what these say; the tests measure them. No DOM, no three.js.
//
// The base timeline is 羹's (8.4 s): 开 → 起 at the stove → 落 overhead → 题 the hero → 举 the lift →
// 尝 the bite. Each category (蒸 炙 饮 凉) keeps the shape and changes the lengths and the beats; a dish
// may override one beat (PV_BEATS). A seasonal dish opens with 外 (+0.8 s), and paying with the dish's
// own good adds 亲 after 起 (+1.0 s; 起 gives back 0.4 s, 0.8 s after a 外). A repeat plays the 3.2 s cut, reduced
// motion three held frames (≤4.6 s), and 低 starts at 落 (≤6.8 s).
//
// Owner: P (特写).
import { DISHES } from './food';
import type { DishId, PvCat, PvMode } from './types';

export type ShotKey = '开' | '外' | '起' | '亲' | '落' | '题' | '举' | '尝';

/** A sound the director fires at a shot's start (the sounds live in minigames/sound.ts). */
export type SfxKey =
  | 'bubble' | 'steam' | 'sizzle' | 'pour' | 'crack' | 'lid' | 'swish' | 'pluck' | 'tick' | 'knock'
  | 'hiss' | 'clink' | 'slurp' | 'crunch' | 'sip' | 'chew';

/** What moves inside a shot (the director's beats, on the world clock). */
export type BeatKey =
  | 'dip'      // 开: the ink dip, the cook placed, the walker to the seat
  | 'wide'     // 外: the square in blossom, 「山外 · 秋」
  | 'stir'     // 起 羹: the ladle, bubbles, steam
  | 'lid'      // 起 蒸 (and 鸡黍, 菌子羹): the lid lifts, a white-out
  | 'embers'   // 起 炙: embers and six sparks, the oil
  | 'pour'     // 起 饮: poured from height (a tube on a parabola)
  | 'twocups'  // 起 桃花茶: two cups on the step, both filled
  | 'third'    // 起 桑葚糕: 三娘 pours a third cup
  | 'crack'    // 起 凉: the seal cracks, a knife, a drip
  | 'seal'     // 起 笋菹: the mud seal cracks in three frames, two knocks
  | 'own'      // 亲: the cook holds up your good
  | 'land'     // 落: set down, squash and settle, the steam parts
  | 'sink'     // 落 桃花粥: five petals sink
  | 'ripple'   // 落 饮: a ripple ring and one petal landing
  | 'turn'     // 落 紫苏乌梅饮: violet turns rose
  | 'flaps'    // 落 荷叶饭: four leaf flaps open
  | 'title'    // 题: slow motion, the glints, the vertical title
  | 'rise'     // 题 蒸: the title rises out of the steam
  | 'lift'     // 举: a morsel lifted 0.12 m
  | 'strand'   // 举 汤饼: a noodle strand stretches from the chopstick tip
  | 'jiggle'   // 举 蒸: a chopstick tap, the cake jiggles
  | 'flare'    // 举 炙鱼: a drip of fat, then a flare
  | 'crumb'    // 举 炙 (the cake): a crust flake falls
  | 'puff'     // 举 煨芋: a steam puff
  | 'raise'    // 举 饮: the cup raised toward the lens
  | 'drip'     // 举 凉: a slow drip
  | 'bite';    // 尝: the emote, the bite, the reaction, the sting

export interface Shot {
  k: ShotKey;
  secs: number;
  /** What the camera frames: the walker, the cook's station, the dish at the seat, or the square past the walker. */
  at: 'walker' | 'station' | 'seat' | 'wide';
  /** Metres from the subject, the angle above it and the yaw from its facing (degrees), the lens (degrees). */
  dist: number; elev: number; yaw: number; fov: number;
  /** Metres moved toward the subject during the shot (negative: pulled back). */
  push?: number;
  /** The world's time scale during the shot. */
  ts?: number;
  /** Sounds at the shot's start. */
  sfx?: SfxKey[];
  beat?: BeatKey;
  /** 开: the camera stays on the walker (no cut). */
  free?: boolean;
}

export interface ShotOpts {
  first: boolean;
  /** Paid with the dish's own good (the 亲 beat). */
  own: boolean;
  mode: PvMode;
  low: boolean;
  reduced: boolean;
  /** A seasonal dish (the 外 shot). */
  season: boolean;
}

/** A dish's own beats (spec §4.3); every other shot is its category's. */
export const PV_BEATS: Partial<Record<DishId, Partial<Record<ShotKey, BeatKey>>>> = {
  zhou: { 落: 'sink' },
  tangbing: { 举: 'strand' },
  jishu: { 起: 'lid' },
  sunzu: { 起: 'seal' },
  taocha: { 起: 'twocups' },
  zisu: { 落: 'turn' },
  shengao: { 起: 'third' },
  's-heye': { 落: 'flaps' },
  's-junge': { 起: 'lid' },
  zhiyu: { 举: 'flare' },
  weiyu: { 举: 'puff' },
  bing: { 举: 'crumb' },
};

type Row = Omit<Shot, 'k'>;
interface CatTable { 起: Row; 落: Row; 题: Row; 举: Row; 尝: Row }

const OPEN: Row = { secs: 0.4, at: 'walker', dist: 1.6, elev: 10, yaw: 0, fov: 45, beat: 'dip', free: true };
const WIDE: Row = { secs: 0.8, at: 'wide', dist: 1.8, elev: 12, yaw: 180, fov: 50, beat: 'wide' };
const OWN: Row = { secs: 1.0, at: 'station', dist: 1.3, elev: 12, yaw: 20, fov: 38, push: 0.1, beat: 'own' };

// the base (羹), then each category's changes to it
const GENG: CatTable = {
  起: { secs: 1.6, at: 'station', dist: 1.2, elev: 20, yaw: 0, fov: 32, push: 0.3, sfx: ['bubble'], beat: 'stir' },
  落: { secs: 1.6, at: 'seat', dist: 0.55, elev: 88, yaw: 180, fov: 40, push: 0.08, sfx: ['swish', 'pluck'], beat: 'land' },
  题: { secs: 1.8, at: 'seat', dist: 0.35, elev: 20, yaw: 150, fov: 30, push: 0.05, ts: 0.35, sfx: ['swish', 'tick'], beat: 'title' },
  举: { secs: 1.2, at: 'seat', dist: 0.38, elev: 20, yaw: 150, fov: 30, push: -0.08, ts: 0.35, sfx: ['hiss'], beat: 'lift' },
  尝: { secs: 1.8, at: 'walker', dist: 1.6, elev: 8, yaw: 0, fov: 45, ts: 1, sfx: ['slurp'], beat: 'bite' },
};

const CATS: Record<PvCat, CatTable> = {
  羹: GENG,
  蒸: {
    起: { ...GENG.起, secs: 2.0, sfx: ['steam', 'lid'], beat: 'lid' },
    落: { ...GENG.落 },
    题: { ...GENG.题, beat: 'rise' },
    举: { ...GENG.举, beat: 'jiggle' },
    尝: { ...GENG.尝, sfx: ['chew'] },
  },
  炙: {
    起: { ...GENG.起, sfx: ['sizzle'], beat: 'embers' },
    落: { ...GENG.落, secs: 1.4 },
    题: { ...GENG.题 },
    举: { ...GENG.举, beat: 'lift' },
    尝: { ...GENG.尝, sfx: ['crunch'] },
  },
  饮: {
    起: { ...GENG.起, sfx: ['pour'], beat: 'pour' },
    落: { ...GENG.落, secs: 1.2, sfx: ['clink', 'pluck'], beat: 'ripple' },
    题: { ...GENG.题, secs: 1.4 },
    举: { ...GENG.举, secs: 1.0, beat: 'raise' },
    尝: { ...GENG.尝, sfx: ['sip'] },
  },
  凉: {
    起: { ...GENG.起, secs: 1.2, push: 0.2, sfx: ['crack'], beat: 'crack' },
    落: { ...GENG.落, secs: 1.2 },
    题: { ...GENG.题, secs: 1.6 },
    举: { ...GENG.举, secs: 0.8, beat: 'drip' },
    尝: { ...GENG.尝, sfx: ['crunch'] },
  },
};

/** The category lengths of a first taste (spec §4.2). */
export const CAT_SECS: Record<PvCat, number> = { 羹: 8.4, 蒸: 8.8, 炙: 8.2, 饮: 7.4, 凉: 7.0 };

/** The seconds from the start to the end of 尝 that a skip leaves (spec §4.4). */
export const SKIP_TAIL = 1.2;
/** A skip is taken only after this long. */
export const SKIP_AFTER = 0.4;

const shot = (k: ShotKey, r: Row, over?: Partial<Row>): Shot => ({ k, ...r, ...over });

/**
 * The shots of one 特写 (spec §4.1–4.5). `mode` 'none' is the bare card (the table shows it); 'short'
 * is the 3.2 s cut of a repeat; 'full' the whole thing — or, under reduced motion, three held frames.
 */
export function shotsFor(dish: DishId, o: ShotOpts): Shot[] {
  const d = DISHES[dish];
  const cat = CATS[d.pv];
  const over = PV_BEATS[dish] ?? {};
  const bite = (secs: number, extra?: Partial<Row>) => shot('尝', cat.尝, { secs, ...extra });
  const beatOf = (k: ShotKey, r: Row): Row => (over[k] ? { ...r, beat: over[k] } : r);
  // (鸡黍 and 菌子羹 lift a lid at the stove: the lid's clack and the steam)
  const qiRow = (): Row => {
    const r = beatOf('起', cat.起);
    return r.beat === 'lid' && d.pv !== '蒸' ? { ...r, sfx: ['steam', 'lid'] } : r;
  };

  if (o.mode === 'none') return [bite(1.0, { ts: undefined, sfx: [] })];

  if (o.reduced) {
    // three held frames: no time scale, no push; the crossfades are inside the frames
    const held = (k: ShotKey, r: Row, secs: number): Shot => {
      const s = shot(k, r, { secs });
      delete s.push;
      delete s.ts;
      return s;
    };
    if (o.mode === 'short') return [held('题', cat.题, 1.6), held('尝', cat.尝, 1.6)];
    const out: Shot[] = [];
    if (!o.low) out.push(held('起', qiRow(), o.own ? 0.8 : 1.2));
    if (o.own) out.push(held('亲', OWN, 0.8));
    out.push(held('题', cat.题, 1.6), held('尝', cat.尝, 1.4));
    return out;
  }

  if (o.mode === 'short') {
    return [shot('题', beatOf('题', cat.题), { secs: 1.6, ts: undefined }), bite(1.6)];
  }

  const out: Shot[] = [shot('开', OPEN)];
  // (低: the stove is skipped, and with it 外 and 亲: the film starts at 落)
  if (!o.low) {
    if (o.season) out.push(shot('外', WIDE));
    // (亲 takes 0.4 s from 起, and 0.4 s more after a 外: the cook is still at the stove)
    const qi = qiRow();
    const cut = o.own ? (o.season ? 0.8 : 0.4) : 0;
    out.push(shot('起', qi, cut ? { secs: Math.round((qi.secs - cut) * 10) / 10 } : undefined));
    if (o.own) out.push(shot('亲', OWN));
  }
  out.push(shot('落', beatOf('落', cat.落)), shot('题', beatOf('题', cat.题)), shot('举', beatOf('举', cat.举)), shot('尝', cat.尝));
  return out;
}

/** The whole length of a shot list, in seconds. */
export const lengthOf = (s: readonly Shot[]) => s.reduce((t, x) => t + x.secs, 0);

/** When shot `i` starts, in seconds from the start. */
export function startOf(s: readonly Shot[], i: number): number {
  let t = 0;
  for (let j = 0; j < i && j < s.length; j++) t += s[j].secs;
  return t;
}

/**
 * Where a skip lands (spec §4.4): the last 1.2 s of 尝 (all of it when 尝 is shorter), as the shot's
 * index, the seconds already gone inside it, and the time from the start.
 */
export function skipTo(s: readonly Shot[]): { i: number; into: number; t: number } {
  let i = s.findIndex((x) => x.k === '尝');
  if (i < 0) i = s.length - 1;
  const into = Math.max(0, s[i].secs - SKIP_TAIL);
  return { i, into, t: startOf(s, i) + into };
}
