// 水月幻镜 · the item-effect interpreter (GDD §9 "Item hooks"). Every in-wave `Effect` in the data is
// read here, once per wave, into a flat `Mods` record by one switch on `do` (and `special` by one
// switch on `key`); the combat code reads the numbers. Live stats (conds, converts, 醉, moon phase,
// buffs) are re-evaluated every step into a reused sheet.
import type { ItemId, SummonKind } from '../ids';
import type { Cond, Effect, EffectOp, RunSave, Stats, StatId, StatMods, StatusKind, WClass } from '../types';
import { COMPANIONS, F, PASSIVES, STAT_IDS, WEAPONS } from '../data';
import { condHolds, effectsOf, setFlags } from '../logic/formulas';

export interface ClassCond { cls: WClass; stats: StatMods; when?: Cond; n: number; pct: boolean }
export interface LiveCond { stats: StatMods; when: Cond; n: number; pct: boolean }
export interface Thorns { base: number; scale: StatMods; dealtPct: number; meleeOnly: boolean; n: number }
/** m8 (I1): one live convert (月华 held, living 墨宝, foes within r, unpulled 月华 near you); `v` is its source
 *  reading, which the World fills each step for `near` / `moonNear` (the others come from liveStats' extra). */
export interface LiveConv { from: 'moonHeld' | 'summons' | 'near' | 'moonNear'; per: number; k: number; max: number; to: readonly StatId[]; r: number; v: number }
/** m8 (I2): an event buff. Each trigger adds a stack (up to `stack`) and refreshes `dur`; every stack ends together.
 *  `lv[k]` is the sheet at k + 1 stacks (× copies held); `cls` filters hit / crit to that class's weapons; `after`
 *  is the stand-still time an `onGo` needs; `moveX` multiplies walking after the 画地为牢 cap. */
export interface EvBuff {
  hook: 'onDodge' | 'onHit' | 'onKill' | 'onCrit' | 'onHurt' | 'onGo';
  key: string; stats: StatMods; dur: number; stack: number; cls: WClass | null; moveX: number; after: number; n: number; lv: StatMods[];
}
/** m8 (P5): an on-hit status (bleed, vulnerable, root …, or `convert`: turn an ordinary foe for `dur`). */
export interface HitStatus {
  cls: WClass | null; kind: StatusKind | 'convert'; dur: number; v: number; bossV: number; ofHit: number; p: number; luck: boolean; cap: number; n: number;
}

/** Everything the combat code needs from items, passives and sets for one wave. */
export interface Mods {
  flags: Set<string>;
  classConds: ClassCond[];
  liveConds: LiveCond[];
  /** m8 (I1): every live convert, in data order (was the singletons convMoon / convSummons). */
  conv: LiveConv[];
  knockImmune: boolean;
  moonPct: number;
  luckyDrop: { p: number; luck: boolean } | null;
  critHeal: { v: number; cap: number } | null;
  hitHeal: { v: number; p: number; cap: number } | null;
  critDrunk: number;
  /** m8 (I1): each item's 月魄 shards (was a singleton). */
  shards: { n: number; base: number; scale: StatMods }[];
  /** m8 (I2): event buffs, onDodge (广寒桂) among them (was the singleton dodgeBuff). */
  evBuffs: EvBuff[];
  thorns: Thorns[];
  blocks: number;
  familiar: { summon: SummonKind; base: number; scale: StatMods; cd: number; fetch: number; n: number } | null;
  demon: number;
  /** 心魔: % chance the beaten shadow drops a 镜奁. */
  demonCrate: number;
  surviveWave: boolean;
  surviveRun: { hpPct: number; clear: boolean } | null;
  sprout: { summon: SummonKind; every: number; life: number; base: number; scale: StatMods; cd: number; range: number; n: number } | null;
  burnStacks: number;
  burnDur: number;
  chainAdd: number;
  chainIgnite: boolean;
  chainStun: number;
  chainStunDur: number;
  /** m8 (I1): every echo (绕梁 …); a slot uses the ones whose class it has (was a singleton). */
  echo: { cls: WClass; delay: number; pct: number }[];
  /** m8 (I1): merged across items: the largest x and dmgPct, the bursts' base and scale added (was a singleton). */
  charm: { x: number; dmgPct: number; base: number; scale: StatMods } | null;
  /** m8 (I1): every 「every n-th attack」 rule with its own counter `c` (was a singleton with one global count). */
  every: { cls: WClass; n: number; x: number; knock: number; c: number }[];
  summonLife: number;
  summonCrit: { x: number; aspd: number } | null;
  summonBurst: { base: number; scale: StatMods; r: number; slow: number; dur: number } | null;
  swordTrail: { pierce: number; pct: number } | null;
  /** m8 (I1, C1): the larger heal a returning sword gives, with the caps added (剑归 + 洗剑池). */
  returnHeal: { v: number; cap: number } | null;
  special: Partial<Record<ItemId, Readonly<Record<string, number>>>>;
  // ── m8 item ops (items.md §5; read by engine/world.ts strikeIn / killIn / onDodge and engine/weapons.ts)
  /** 斩草除根: × x (bigX on elites and bosses) on `cls` weapon hits below `below` of max HP. */
  execute: { cls: WClass; below: number; x: number; bigX: number }[];
  /** 百步穿杨: `cls` weapon hits +pct % per `per` u between you and the target (at most +max %). */
  far: { cls: WClass; per: number; pct: number; max: number }[];
  /** 泰山压顶: `cls` weapon hits root for `dur` instead of knocking back. */
  pin: { cls: WClass; dur: number }[];
  /** 见血封喉, 四面楚歌, 倒戈相向: statuses on weapon hits. */
  hitStatus: HitStatus[];
  /** 连环计: kills burst (see World.itemBlast). */
  blast: { pct: number; r: number; bossPct: number; bossPerSec: number; perSec: number }[];
  /** 星火燎原: a burning kill passes its strongest burn to the n nearest within r. */
  spread: { kind: StatusKind; n: number; r: number; dur: number; perSec: number }[];
  /** 后发先至: a dodge primes every weapon's next attack (sure crit, × x) for `dur`, at most once per `cd` s. */
  prime: { dur: number; x: number; cd: number } | null;
  /** 醉卧沙场: each blow × (1 − min(max, pct × floor(醉 / per)) / 100) before armour (DoTs too); every rule held multiplies. */
  guard: { per: number; pct: number; max: number }[];
  /** 千金散尽: a blow that landed spills pct % of the 月华 in hand (at most max a blow) beyond your pickup range. */
  scatter: { pct: number; max: number } | null;
  /** 月华如练: 月华 flying to you strikes the foes in its way (packet × min(maxX, 1 + worth × perWorth / 100)). */
  stream: { base: number; scale: StatMods; perWorth: number; maxX: number } | null;
  /** 饮鸩止渴: the wave starts at this % of max 气血 (the lowest held; 100 = full). */
  hpPct: number;
  /** 与虎谋皮: extra 镜奁 an elite drops, and its 月华 + this % (the 镜印 are logic/spawn.ts wavePlan's). */
  eliteCrates: number;
  eliteMoonPct: number;
}

/** m8 (I11): an op the switch below does not know is a compile error, and a loud one at run time. */
function assertNever(e: never): never {
  throw new Error(`effects: no reader for op ${JSON.stringify((e as { do?: unknown }).do)}`);
}

/** m8 (I11): the ops no reader handles yet (ITEMS batches c and d). An item using one stays `wip`
 *  (tests/mirror-m8-items.test.ts: no data outside `wip` uses one). Empty once the 26 are done. */
export const UNREAD_OPS: ReadonlySet<EffectOp> = new Set<EffectOp>([]);

/**
 * m8 (I11): where each op is read (paths under src/views/mirror). The test checks that every op the data uses
 * has at least one reader and that each file named here mentions the op; `Record<EffectOp, …>` makes a new op
 * without an entry a compile error.
 */
export const OP_READERS: Readonly<Record<EffectOp, readonly string[]>> = {
  stats: ['engine/effects.ts', 'logic/formulas.ts'],
  convert: ['engine/effects.ts', 'logic/formulas.ts'],
  cap: ['logic/formulas.ts'],
  immune: ['engine/effects.ts'],
  world: ['engine/effects.ts', 'logic/formulas.ts', 'logic/items.ts'],
  grow: ['logic/run.ts'],
  interest: ['logic/run.ts'],
  drop: ['engine/effects.ts'],
  heal: ['engine/effects.ts'],
  drunk: ['engine/effects.ts'],
  shards: ['engine/effects.ts'],
  buff: ['engine/effects.ts'],
  thorns: ['engine/effects.ts'],
  block: ['engine/effects.ts'],
  familiar: ['engine/effects.ts'],
  demon: ['engine/effects.ts'],
  survive: ['engine/effects.ts'],
  sprout: ['engine/effects.ts'],
  burnMod: ['engine/effects.ts'],
  chainMod: ['engine/effects.ts'],
  echo: ['engine/effects.ts'],
  charmMod: ['engine/effects.ts'],
  every: ['engine/effects.ts'],
  freeReroll: ['logic/shop.ts'],
  price: ['logic/formulas.ts'],
  sell: ['logic/formulas.ts'],
  slot: ['logic/formulas.ts'],
  odds: ['logic/shop.ts'],
  noReroll: ['logic/items.ts'],
  life: ['engine/effects.ts'],
  crit: ['engine/effects.ts', 'logic/formulas.ts'],
  burst: ['engine/effects.ts'],
  trail: ['engine/effects.ts'],
  returnHeal: ['engine/effects.ts'],
  special: ['engine/effects.ts'],
  moveCap: ['logic/items.ts'],
  setPlus: ['logic/items.ts'],
  tierFloor: ['logic/items.ts'],
  noWeapons: ['logic/items.ts'],
  rerollOff: ['logic/items.ts'],
  upgrade: ['logic/items.ts'],
  status: ['engine/effects.ts'],
  execute: ['engine/effects.ts'],
  far: ['engine/effects.ts'],
  pin: ['engine/effects.ts'],
  blast: ['engine/effects.ts'],
  spread: ['engine/effects.ts'],
  prime: ['engine/effects.ts'],
  guard: ['engine/effects.ts', 'engine/content/items.ts'],
  scatter: ['engine/effects.ts', 'engine/content/items.ts'],
  stream: ['engine/effects.ts', 'engine/content/items.ts'],
  hpPct: ['engine/effects.ts', 'engine/content/items.ts'],
};

/** Read the run's effects into Mods (one switch on `do`, one on `key`). */
export function readMods(run: RunSave): Mods {
  const m: Mods = {
    flags: new Set(setFlags(run)), classConds: [], liveConds: [], conv: [], knockImmune: false, moonPct: 0,
    luckyDrop: null, critHeal: null, hitHeal: null, critDrunk: 0, shards: [], evBuffs: [], thorns: [], blocks: 0, familiar: null,
    demon: 0, demonCrate: 0, surviveWave: false, surviveRun: null, sprout: null, burnStacks: 0, burnDur: 0, chainAdd: 0, chainIgnite: false, chainStun: 0,
    chainStunDur: 0.5, echo: [], charm: null, every: [], summonLife: 0, summonCrit: null, summonBurst: null, swordTrail: null,
    returnHeal: null, special: {},
    execute: [], far: [], pin: [], hitStatus: [], blast: [], spread: [], prime: null,
    guard: [], scatter: null, stream: null, hpPct: 100, eliteCrates: 0, eliteMoonPct: 0,
  };
  const seen = new Map<string, number>();
  for (const { e, n, src } of effectsOf(run)) {
    // a stable key per effect for keyed buffs: the item (or 'passive') and its index among that source's effects
    const k = seen.get(src) ?? 0;
    seen.set(src, k + 1);
    apply(m, e, n, src, k);
  }
  return m;
}

/** Stat mods × f (allocation at read time only). */
function scaled(s: StatMods, f: number): StatMods {
  const o: Partial<Record<StatId, number>> = {};
  for (const k in s) o[k as StatId] = (s[k as StatId] ?? 0) * f;
  return o;
}

function apply(m: Mods, e: Effect, n: number, src: ItemId | 'passive', idx = 0): void {
  switch (e.do) {
    case 'stats':
      if (e.cls) m.classConds.push({ cls: e.cls, stats: e.stats, when: e.when, n, pct: !!e.pct });
      else if (e.when) m.liveConds.push({ stats: e.stats, when: e.when, n, pct: !!e.pct });
      // unconditional plain stats are already in computeStats
      break;
    case 'convert':
      if (e.from === 'moonHeld' || e.from === 'summons' || e.from === 'near' || e.from === 'moonNear') {
        // (copies do not stack a live convert, as before I1)
        m.conv.push({ from: e.from, per: e.per, k: e.k ?? 1, max: e.max, to: e.to, r: e.r ?? 0, v: 0 });
      }
      break; // the other sources are static (logic)
    case 'cap': break; // logic dodgeCapOf
    case 'immune': m.knockImmune = true; break;
    case 'world':
      m.moonPct += e.moonPct ?? 0;
      // m8 与虎谋皮 (P14): the elite drops (eliteAffix is read by logic/spawn.ts wavePlan)
      m.eliteCrates += (e.eliteCrates ?? 0) * n; m.eliteMoonPct += (e.eliteMoonPct ?? 0) * n;
      break;
    case 'grow': case 'interest': break; // logic endWave
    case 'drop': m.luckyDrop = { p: e.p * n, luck: !!e.luck }; break;
    case 'heal':
      if (e.hook === 'onCrit') m.critHeal = { v: e.v, cap: e.capPerSec ?? 99 };
      else m.hitHeal = { v: e.v, p: e.p ?? 1, cap: e.capPerSec ?? 99 };
      break;
    case 'drunk': m.critDrunk += e.v * n; break;
    case 'shards': m.shards.push({ n: e.n, base: e.base, scale: e.scale }); break;
    case 'buff': {
      // m8 (I2): keyed per effect, so two items' buffs never replace each other; lv[k] = the sheet at k + 1 stacks
      const stack = Math.max(1, Math.floor(e.stack ?? 1));
      const lv: StatMods[] = [];
      for (let k = 1; k <= stack; k++) lv.push(scaled(e.stats, n * k));
      m.evBuffs.push({ hook: e.hook, key: e.key ?? `${src}#${idx}`, stats: e.stats, dur: e.dur, stack, cls: e.cls ?? null, moveX: e.moveX ?? 1, after: e.after ?? 0, n, lv });
      break;
    }
    case 'thorns': m.thorns.push({ base: e.base, scale: e.scale, dealtPct: e.dealtPct ?? 0, meleeOnly: !!e.meleeOnly, n }); break;
    case 'block': m.blocks += e.n; break;
    case 'familiar': m.familiar = { summon: e.summon, base: e.base, scale: e.scale, cd: e.cd, fetch: e.fetch ?? 0, n }; break;
    case 'demon': m.demon = e.pct; m.demonCrate = e.crate ?? 100; break;
    case 'survive':
      if (e.per === 'wave') m.surviveWave = true;
      else m.surviveRun = { hpPct: e.hpPct, clear: !!e.clearShots };
      break;
    case 'sprout': m.sprout = { summon: e.summon, every: e.every, life: e.life, base: e.base, scale: e.scale, cd: e.cd, range: e.range, n }; break;
    case 'burnMod': m.burnStacks += e.stacks * n; m.burnDur += e.dur * n; break;
    case 'chainMod': m.chainAdd += e.chains * n; m.chainIgnite = m.chainIgnite || e.ignite; m.chainStun = Math.max(m.chainStun, e.stun); m.chainStunDur = e.stunDur; break;
    case 'echo': m.echo.push({ cls: e.cls, delay: e.delay, pct: e.pct }); break;
    case 'charmMod':
      if (!m.charm) m.charm = { x: e.x, dmgPct: e.dmgPct, base: e.base, scale: e.scale };
      else {
        const sc: Partial<Record<StatId, number>> = { ...m.charm.scale };
        for (const k in e.scale) sc[k as StatId] = (sc[k as StatId] ?? 0) + (e.scale[k as StatId] ?? 0);
        m.charm = { x: Math.max(m.charm.x, e.x), dmgPct: Math.max(m.charm.dmgPct, e.dmgPct), base: m.charm.base + e.base, scale: sc };
      }
      break;
    case 'every': m.every.push({ cls: e.cls, n: e.n, x: e.x, knock: e.knock ?? 0, c: 0 }); break;
    case 'freeReroll': case 'price': case 'sell': case 'slot': case 'odds': case 'noReroll': break; // logic shop
    // m8: logic-only ops (logic/items.ts, logic/shop.ts, logic/formulas.ts)
    case 'moveCap': case 'setPlus': case 'tierFloor': case 'noWeapons': case 'rerollOff': case 'upgrade': break;
    case 'life': m.summonLife += e.pct * n; break;
    case 'crit': m.summonCrit = { x: e.x, aspd: e.aspd }; break;
    case 'burst': m.summonBurst = { base: e.base, scale: e.scale, r: e.r, slow: e.slow, dur: e.dur }; break;
    case 'trail': m.swordTrail = { pierce: e.pierce, pct: e.pct }; break;
    case 'returnHeal':
      // m8 (C1): the larger heal, the caps added (剑归 + 洗剑池)
      m.returnHeal = m.returnHeal ? { v: Math.max(m.returnHeal.v, e.v), cap: m.returnHeal.cap + e.capPerSec } : { v: e.v, cap: e.capPerSec };
      break;
    case 'special':
      // one switch on key: every special is read by name from m.special in the combat code
      switch (e.key) {
        case 'swordtomb': case 'capture': case 'lingbo': case 'wanjian': case 'inkdragon': case 'dugu': case 'samadhi':
        case 'ambush': case 'jiangjinjiu': case 'watermoon':
          m.special[e.key] = e.p ?? {};
          break;
        default:
          m.special[e.key] = e.p ?? {};
      }
      break;
    // ── m8 item ops (items.md §5)
    case 'status':
      m.hitStatus.push({ cls: e.cls ?? null, kind: e.kind, dur: e.dur, v: e.v ?? 0, bossV: e.bossV ?? e.v ?? 0, ofHit: e.ofHit ?? 0, p: e.p ?? 100, luck: !!e.luck, cap: e.cap ?? 0, n });
      break;
    case 'execute': m.execute.push({ cls: e.cls, below: e.below, x: e.x, bigX: e.bigX }); break;
    case 'far': m.far.push({ cls: e.cls, per: e.per, pct: e.pct, max: e.max }); break;
    case 'pin': m.pin.push({ cls: e.cls, dur: e.dur }); break;
    case 'blast': m.blast.push({ pct: e.pct, r: e.r, bossPct: e.bossPct, bossPerSec: e.bossPerSec, perSec: e.perSec }); break;
    case 'spread': m.spread.push({ kind: e.kind, n: e.n, r: e.r, dur: e.dur, perSec: e.perSec }); break;
    case 'prime':
      m.prime = m.prime ? { dur: Math.max(m.prime.dur, e.dur), x: Math.max(m.prime.x, e.x), cd: Math.min(m.prime.cd, e.cd) } : { dur: e.dur, x: e.x, cd: e.cd };
      break;
    // m8 batch c / d: registerItemHooks (engine/content/items.ts) puts these on the World's seams
    case 'guard': m.guard.push({ per: e.per, pct: e.pct, max: e.max }); break;
    case 'scatter':
      m.scatter = m.scatter ? { pct: Math.max(m.scatter.pct, e.pct), max: Math.max(m.scatter.max, e.max) } : { pct: e.pct, max: e.max };
      break;
    case 'stream':
      if (!m.stream) m.stream = { base: e.base, scale: e.scale, perWorth: e.perWorth, maxX: e.maxX };
      else {
        const sc: Partial<Record<StatId, number>> = { ...m.stream.scale };
        for (const k in e.scale) sc[k as StatId] = Math.max(sc[k as StatId] ?? 0, e.scale[k as StatId] ?? 0);
        m.stream = { base: Math.max(m.stream.base, e.base), scale: sc, perWorth: Math.max(m.stream.perWorth, e.perWorth), maxX: Math.max(m.stream.maxX, e.maxX) };
      }
      break;
    case 'hpPct': m.hpPct = Math.min(m.hpPct, e.v); break;
    default:
      assertNever(e);
  }
}

/** Live readings the conds need. */
export interface Live { waveTime: number; hpFrac: number; still: number; swordsAir: number; weapons: number }

/**
 * Recompute the live sheet into `out` from the wave's base sheet: conds with `when`, converts from
 * 月华 held and living 墨宝, 醉, 嫦娥's moon, keyed buffs. Allocation-free.
 */
export function liveStats(
  out: Stats, base: Stats, m: Mods, live: Live, extra: {
    moonHeld: number; summons: number; drunk: number; drunkActive: boolean; drunkFull: boolean; moonPhase: number; change: boolean;
    buffs: readonly { stats: StatMods; t: number }[]; solo: number; dugu: boolean;
  },
): Stats {
  for (let k = 0; k < STAT_IDS.length; k++) out[STAT_IDS[k]] = base[STAT_IDS[k]];
  for (const c of m.liveConds) {
    if (!condHolds(c.when, live)) continue;
    for (const k in c.stats) {
      const v = (c.stats[k as StatId] ?? 0) * c.n;
      if (c.pct) out[k as StatId] += (base[k as StatId] * v) / 100;
      else out[k as StatId] += v;
    }
  }
  // m8 (I1): every live convert; `near` / `moonNear` readings are filled by the World before this call
  for (let q = 0; q < m.conv.length; q++) {
    const c = m.conv[q];
    const v = c.from === 'moonHeld' ? extra.moonHeld : c.from === 'summons' ? extra.summons : c.v;
    const g = Math.min(c.max, (c.k * Math.max(0, v)) / c.per);
    for (const t of c.to) out[t] += g;
  }
  if (extra.drunkActive) {
    out.crit += Math.min(F.drunk.critMax, Math.floor(extra.drunk / 10) * F.drunk.critPer10);
    if (extra.drunkFull) out.critDmg += F.drunk.fullX * 100;
  }
  if (extra.change) {
    // 阴晴圆缺: phase 0 full (+30% 伤害) … 4 new (−15% 伤害, +15% 闪避), linear by distance from new
    const P = PASSIVES.yinqing.p;
    const d = Math.abs(((extra.moonPhase % 8) + 8) % 8 - 4) / 4; // 1 at full, 0 at new
    out.dmg += P.newDmg + (P.full - P.newDmg) * d;
    out.dodge += P.newDodge * (1 - d);
  }
  for (const b of extra.buffs) if (b.t > 0) for (const k in b.stats) out[k as StatId] += b.stats[k as StatId] ?? 0;
  if (extra.dugu && extra.solo === 1) out.aspd += m.special.dugu?.aspd ?? 60;
  return out;
}

/** Class-scoped stat extras for a weapon's classes (剑穗, 剑心通明, 剑意, 棋谱) under the live readings. */
export function classExtras(out: Stats, live: Stats, classes: readonly WClass[], m: Mods, lv: Live): Stats {
  for (let k = 0; k < STAT_IDS.length; k++) out[STAT_IDS[k]] = live[STAT_IDS[k]];
  for (const c of m.classConds) {
    if (!classes.includes(c.cls)) continue;
    if (c.when && !condHolds(c.when, lv)) continue;
    // m8 (C2): `cls` and `when` read together; `pct` scales by the live sheet like a live cond
    if (c.pct) for (const k in c.stats) out[k as StatId] += (live[k as StatId] * (c.stats[k as StatId] ?? 0) * c.n) / 100;
    else for (const k in c.stats) out[k as StatId] += (c.stats[k as StatId] ?? 0) * c.n;
  }
  return out;
}

/** Does the run have the 醉 meter (a 酒 weapon, 杜康, or 诗仙)? */
export function hasDrunk(run: RunSave): boolean {
  if (run.char === 'poet') return true;
  if ((run.items.dukang ?? 0) > 0 || (run.items.jiangjinjiu ?? 0) > 0) return true;
  return run.weapons.some((w) => WEAPONS[w.id].classes.includes('wine'));
}
/** The companion's hitbox radius (道童 11). */
export const hitboxOf = (run: RunSave) => COMPANIONS[run.char].hitbox;
