// 奇遇 — when each chance encounter may happen, pure and testable (no three.js, no DOM).
//
//   · Each encounter has a place and a time (region, hour, night, sometimes the season).
//   · When you are at the right place at the right time, a roll decides whether it happens today.
//     The roll is seeded by the day: the same all day long, however often you come back.
//   · The chance rises for every day you were there at the right time and it did not happen, so
//     each one can be found within a few days of trying. Once met it may come again (less often),
//     and more readily when you walk as a companion who has a version of their own.
//   · Rumours: arriving at the right place and hour for one you have not met yet, someone mentions
//     it — at most once a day each.
import type { CharacterId } from '../../../../data/characters';
import type { EncounterDef } from '../../../../data/encounters';
import type { RegionId } from '../../map';
import type { Season, TimeOfDay } from '../../../../ink/scene-types';
import { hashString, makeRng } from '../../../../core/rng';

/** Where and when the walker is now. */
export interface Moment {
  /** The local day (YYYY-MM-DD). */
  day: string;
  tod: TimeOfDay;
  /** Local hour 0..24. */
  hour: number;
  /** The sky says night (the real clock, the 夜 switch or a festival night). */
  night: boolean;
  season: Season;
  /** 0 new → 0.5 full → 1. */
  moon: number;
  region: RegionId | null;
  who: CharacterId;
  festivals: readonly string[];
}

export interface Rule {
  /** The right place and time. */
  when(m: Moment): boolean;
  /** Chance on the first day at the right place and time … */
  base: number;
  /** … and how much it rises for each such day it did not happen. */
  step: number;
  /** Extra chance today (the season, a festival, a special companion). */
  bonus?(m: Moment): number;
}

const day = (m: Moment) => !m.night;
const inR = (r: RegionId) => (m: Moment) => m.region === r;
const who = (...ids: CharacterId[]) => (m: Moment) => (ids.includes(m.who) ? 1 : 0);

/**
 * Encounters no longer left to chance: they are met in a story of their own. 桃花源 (taohua) is the
 * 桃源 story's (features/taoyuan/story.ts): the door opens with 拾得's letter, and B2 marks the
 * encounter — so its 奇遇录 entry and first-time coins are still earned. They have no rule, rumour or
 * scene here, and the director never sets them.
 */
export const STORY_ENCOUNTERS: readonly string[] = ['taohua'];

export const RULES: Record<string, Rule> = {
  // 竹林 by day; the musician playing there brings him out for sure (see index.ts)
  zhiyin: { when: (m) => inR('bamboo')(m) && day(m), base: 0.35, step: 0.25, bonus: (m) => 0.3 * who('musician')(m) },
  // 梅岭, dusk best; any daylight will do
  lanke: { when: (m) => inR('plum')(m) && day(m), base: 0.3, step: 0.25, bonus: (m) => (m.tod === 'dusk' ? 0.3 : 0) + 0.15 * who('player')(m) },
  // 荷塘 by night; a full moon helps
  laoyue: { when: (m) => inR('lake')(m) && m.night, base: 0.35, step: 0.25, bonus: (m) => (Math.abs(m.moon - 0.5) < 0.12 ? 0.25 : 0) + 0.15 * who('poet', 'change')(m) },
  // 竹林 by night (it brings its own rain)
  hujie: { when: (m) => inR('bamboo')(m) && m.night, base: 0.3, step: 0.25, bonus: (m) => (m.season === 'summer' ? 0.1 : 0) + 0.15 * who('taoist')(m) },
  // 梅岭 in the morning
  xianhe: { when: (m) => inR('plum')(m) && day(m) && (m.tod === 'dawn' || m.hour < 12), base: 0.35, step: 0.25, bonus: (m) => 0.25 * who('painter')(m) },
  // anywhere, a clear night
  liuxing: { when: (m) => m.night, base: 0.4, step: 0.3, bonus: (m) => (m.season === 'autumn' ? 0.1 : 0) },
  // 水乡 by day
  shijin: { when: (m) => inR('village')(m) && day(m), base: 0.4, step: 0.25, bonus: (m) => 0.15 * who('guan')(m) },
  // the garden, a sunny afternoon (or noon)
  hudie: { when: (m) => inR('garden')(m) && day(m) && m.tod === 'day' && m.hour >= 11, base: 0.35, step: 0.25, bonus: (m) => (m.season === 'spring' || m.season === 'summer' ? 0.15 : 0) },
  // 水乡 river by day
  kezhou: { when: (m) => inR('village')(m) && day(m), base: 0.3, step: 0.25, bonus: (m) => 0.15 * who('swordsman')(m) },
  // the teahouse at night
  zuixian: { when: (m) => inR('village')(m) && m.night, base: 0.35, step: 0.25, bonus: (m) => 0.2 * who('poet')(m) },
  // on the road by day (not in the garden or at home); Qingming's drizzle is its season
  mutong: { when: (m) => day(m) && m.region !== 'garden' && m.region !== 'home', base: 0.3, step: 0.25, bonus: (m) => (m.season === 'spring' ? 0.2 : 0) + (m.festivals.includes('qingming') ? 0.5 : 0) },
  // before the temple by day
  hanshan: { when: (m) => inR('mountain')(m) && day(m), base: 0.35, step: 0.25 },
  // the moon bridge at night; 七夕 for certain
  yuelao: { when: (m) => inR('lake')(m) && m.night, base: 0.3, step: 0.25, bonus: (m) => (m.festivals.includes('qixi') ? 1 : 0) + 0.15 * who('change')(m) },
};

/** Chance after a met encounter (it may come back, now and then). */
export const AGAIN = 0.12;
/** … and when you walk as a companion who has not yet had their own version of it. */
export const AGAIN_NEW_VARIANT = 0.3;

/** Today's chance of `id`, given the days it was due and did not happen. */
export function chance(id: string, m: Moment, misses: number, met: boolean, variantNew: boolean): number {
  const r = RULES[id];
  if (!r) return 0;
  const bonus = r.bonus?.(m) ?? 0;
  if (met) return Math.min(1, variantNew ? AGAIN_NEW_VARIANT + r.step * misses + bonus : AGAIN + bonus * 0.5);
  return Math.min(1, Math.max(0, r.base + r.step * misses + bonus));
}

/** The day's roll for an encounter, 0..1: the same all day, different each day. */
export function dayRoll(dayKey: string, id: string): number {
  return makeRng(hashString(`qiyu:${dayKey}:${id}`))();
}

/** Does it happen today? */
export function happensToday(id: string, m: Moment, misses: number, met: boolean, variantNew: boolean): boolean {
  return RULES[id]?.when(m) === true && dayRoll(m.day, id) < chance(id, m, misses, met, variantNew);
}

/** The companion whose own version plays, or null for everyone else's. */
export function variantFor(def: Pick<EncounterDef, 'special'>, walker: CharacterId): CharacterId | null {
  return def.special.includes(walker) ? walker : null;
}

// ───────────────────────────── memory ─────────────────────────────

export interface Memory {
  v: 1;
  /** Days an encounter was due (right place and time) and did not happen: count and the last such day. */
  miss: Record<string, { n: number; day: string }>;
  /** The day each rumour was last told. */
  rumour: Record<string, string>;
  /** The day each encounter last played out. */
  done: Record<string, string>;
  /** Little consequences that come later (the fox's basket of fruit…): key → the day it was set. */
  later: Record<string, string>;
}

export function emptyMemory(): Memory {
  return { v: 1, miss: {}, rumour: {}, done: {}, later: {} };
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Validate anything loaded. Never throws. */
export function sanitizeMemory(raw: unknown): Memory {
  const m = emptyMemory();
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Partial<Memory>;
  const days = (o: unknown) => {
    const out: Record<string, string> = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (isDay(v)) out[k.slice(0, 40)] = v;
    return out;
  };
  if (r.miss && typeof r.miss === 'object') {
    for (const [k, v] of Object.entries(r.miss)) {
      const e = v as { n?: unknown; day?: unknown };
      if (e && typeof e.n === 'number' && Number.isFinite(e.n) && e.n >= 0 && isDay(e.day)) m.miss[k.slice(0, 40)] = { n: Math.min(30, Math.floor(e.n)), day: e.day };
    }
  }
  m.rumour = days(r.rumour);
  m.done = days(r.done);
  m.later = days(r.later);
  return m;
}

/** Days it was due and did not happen. */
export function misses(mem: Memory, id: string): number {
  return mem.miss[id]?.n ?? 0;
}

/** It was due today and did not happen: counted once a day. Returns the new memory (or the same one). */
export function noteMiss(mem: Memory, id: string, dayKey: string): Memory {
  const cur = mem.miss[id];
  if (cur && cur.day === dayKey) return mem;
  return { ...mem, miss: { ...mem.miss, [id]: { n: (cur?.n ?? 0) + 1, day: dayKey } } };
}

/** It happened today: the chance starts over, and it will not play again today. */
export function noteDone(mem: Memory, id: string, dayKey: string): Memory {
  const miss = { ...mem.miss };
  delete miss[id];
  return { ...mem, miss, done: { ...mem.done, [id]: dayKey } };
}

export function doneToday(mem: Memory, id: string, dayKey: string): boolean {
  return mem.done[id] === dayKey;
}

/** Tell a rumour about `id` today? (Once a day each.) */
export function rumourDue(mem: Memory, id: string, dayKey: string): boolean {
  return mem.rumour[id] !== dayKey;
}

export function noteRumour(mem: Memory, id: string, dayKey: string): Memory {
  return mem.rumour[id] === dayKey ? mem : { ...mem, rumour: { ...mem.rumour, [id]: dayKey } };
}

/**
 * The rumour to tell on arriving: the first unmet encounter (in the given order) whose place and
 * hour are now and whose rumour has not been told today — or null.
 */
export function rumourFor(defs: readonly EncounterDef[], m: Moment, mem: Memory, met: (id: string) => boolean): EncounterDef | null {
  for (const d of defs) {
    if (met(d.id) || !rumourDue(mem, d.id, m.day)) continue;
    const r = RULES[d.id];
    if (!r || !r.when(m)) continue;
    // 'any' encounters are only rumoured when arriving somewhere (not on the road)
    if (d.region === 'any' && m.region === null) continue;
    return d;
  }
  return null;
}

// ───────────────────────────── rumours ─────────────────────────────

/** What people say (a gentle hint), per encounter. */
export const RUMOURS: Record<string, { zh: string; en: string }> = {
  zhiyin: { zh: '听说竹林里有个樵夫，砍柴砍到一半，总停下斧子听些什么……', en: 'They say a woodcutter in the bamboo keeps stopping his axe to listen to something…' },
  lanke: { zh: '听说梅岭松下有两位老者对弈，一坐就是一整天……', en: 'They say two old men play go under the pine on the ridge, all day long…' },
  laoyue: { zh: '听说月夜的荷塘里，有两个月亮……', en: 'They say on moonlit nights there are two moons on the lotus lake…' },
  hujie: { zh: '听说竹林夜里下雨时，有人没带伞，在等人借……', en: 'They say on rainy nights in the bamboo someone waits without an umbrella…' },
  xianhe: { zh: '听说清晨的梅岭，有只白鹤总在等人……', en: 'They say a white crane on the ridge waits for someone every morning…' },
  liuxing: { zh: '今夜天清，抬头看看，或许等得到一颗流星。', en: 'A clear night — look up; a star may fall.' },
  shijin: { zh: '听说有位客商在水乡丢了钱袋，急得团团转……', en: 'They say a merchant lost his purse in the water town and is beside himself…' },
  hudie: { zh: '园子里近来有只金蝶，午后总绕着花飞……', en: 'A golden butterfly has been circling the garden flowers in the afternoons…' },
  kezhou: { zh: '听说河上有人在船舷上刻记号，说是为了找剑……', en: 'They say a man on the river is cutting marks on his boat, to find a sword…' },
  zuixian: { zh: '听说茶楼夜里来了位客人，喝的不是茶……', en: 'They say a guest came to the teahouse tonight, and it is not tea he drinks…' },
  mutong: { zh: '清明时节雨纷纷——路上或许会遇见骑牛吹笛的孩子。', en: 'In the drizzle of Qingming you may meet a child on an ox, playing the flute on the road.' },
  hanshan: { zh: '寺前有两位扫叶的僧人，一个拿扫帚，一个拿诗卷，总在笑……', en: 'Two monks sweep leaves before the temple — one with a broom, one with a scroll — always laughing…' },
  yuelao: { zh: '听说月夜的玉带桥上，有位老人在理红线……', en: 'They say an old man sorts red threads on the moon bridge at night…' },
};
