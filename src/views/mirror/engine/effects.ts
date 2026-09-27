// 水月幻镜 · the item-effect interpreter (GDD §9 "Item hooks"). Every in-wave `Effect` in the data is
// read here, once per wave, into a flat `Mods` record by one switch on `do` (and `special` by one
// switch on `key`); the combat code reads the numbers. Live stats (conds, converts, 醉, moon phase,
// buffs) are re-evaluated every step into a reused sheet.
import type { ItemId, SummonKind } from '../ids';
import type { Cond, Effect, RunSave, Stats, StatId, StatMods, WClass } from '../types';
import { COMPANIONS, F, PASSIVES, STAT_IDS, WEAPONS } from '../data';
import { condHolds, effectsOf, setFlags } from '../logic/formulas';

export interface ClassCond { cls: WClass; stats: StatMods; when?: Cond; n: number }
export interface LiveCond { stats: StatMods; when: Cond; n: number; pct: boolean }
export interface Thorns { base: number; scale: StatMods; dealtPct: number; meleeOnly: boolean; n: number }

/** Everything the combat code needs from items, passives and sets for one wave. */
export interface Mods {
  flags: Set<string>;
  classConds: ClassCond[];
  liveConds: LiveCond[];
  convMoon: { per: number; k: number; max: number; to: readonly StatId[] } | null;
  convSummons: { per: number; k: number; max: number; to: readonly StatId[] } | null;
  knockImmune: boolean;
  moonPct: number;
  luckyDrop: { p: number; luck: boolean } | null;
  critHeal: { v: number; cap: number } | null;
  hitHeal: { v: number; p: number; cap: number } | null;
  critDrunk: number;
  shards: { n: number; base: number; scale: StatMods } | null;
  dodgeBuff: { stats: StatMods; dur: number } | null;
  thorns: Thorns[];
  blocks: number;
  familiar: { summon: SummonKind; base: number; scale: StatMods; cd: number; fetch: number; n: number } | null;
  demon: number;
  surviveWave: boolean;
  surviveRun: { hpPct: number; clear: boolean } | null;
  sprout: { summon: SummonKind; every: number; life: number; base: number; scale: StatMods; cd: number; range: number; n: number } | null;
  burnStacks: number;
  burnDur: number;
  chainAdd: number;
  chainIgnite: boolean;
  chainStun: number;
  chainStunDur: number;
  echo: { cls: WClass; delay: number; pct: number } | null;
  charm: { x: number; dmgPct: number; base: number; scale: StatMods } | null;
  every: { cls: WClass; n: number; x: number; knock: number } | null;
  summonLife: number;
  summonCrit: { x: number; aspd: number } | null;
  summonBurst: { base: number; scale: StatMods; r: number; slow: number; dur: number } | null;
  swordTrail: { pierce: number; pct: number } | null;
  returnHeal: { v: number; cap: number } | null;
  special: Partial<Record<ItemId, Readonly<Record<string, number>>>>;
}

/** Read the run's effects into Mods (one switch on `do`, one on `key`). */
export function readMods(run: RunSave): Mods {
  const m: Mods = {
    flags: new Set(setFlags(run)), classConds: [], liveConds: [], convMoon: null, convSummons: null, knockImmune: false, moonPct: 0,
    luckyDrop: null, critHeal: null, hitHeal: null, critDrunk: 0, shards: null, dodgeBuff: null, thorns: [], blocks: 0, familiar: null,
    demon: 0, surviveWave: false, surviveRun: null, sprout: null, burnStacks: 0, burnDur: 0, chainAdd: 0, chainIgnite: false, chainStun: 0,
    chainStunDur: 0.5, echo: null, charm: null, every: null, summonLife: 0, summonCrit: null, summonBurst: null, swordTrail: null,
    returnHeal: null, special: {},
  };
  for (const { e, n, src } of effectsOf(run)) apply(m, e, n, src);
  return m;
}

function apply(m: Mods, e: Effect, n: number, src: ItemId | 'passive'): void {
  switch (e.do) {
    case 'stats':
      if (e.cls) m.classConds.push({ cls: e.cls, stats: e.stats, when: e.when, n });
      else if (e.when) m.liveConds.push({ stats: e.stats, when: e.when, n, pct: !!e.pct });
      // unconditional plain stats are already in computeStats
      break;
    case 'convert':
      if (e.from === 'moonHeld') m.convMoon = { per: e.per, k: e.k ?? 1, max: e.max, to: e.to };
      else if (e.from === 'summons') m.convSummons = { per: e.per, k: e.k ?? 1, max: e.max, to: e.to };
      break; // the other sources are static (logic)
    case 'cap': break; // logic dodgeCapOf
    case 'immune': m.knockImmune = true; break;
    case 'world': m.moonPct += e.moonPct ?? 0; break;
    case 'grow': case 'interest': break; // logic endWave
    case 'drop': m.luckyDrop = { p: e.p * n, luck: !!e.luck }; break;
    case 'heal':
      if (e.hook === 'onCrit') m.critHeal = { v: e.v, cap: e.capPerSec ?? 99 };
      else m.hitHeal = { v: e.v, p: e.p ?? 1, cap: e.capPerSec ?? 99 };
      break;
    case 'drunk': m.critDrunk += e.v * n; break;
    case 'shards': m.shards = { n: e.n, base: e.base, scale: e.scale }; break;
    case 'buff': m.dodgeBuff = { stats: e.stats, dur: e.dur }; break;
    case 'thorns': m.thorns.push({ base: e.base, scale: e.scale, dealtPct: e.dealtPct ?? 0, meleeOnly: !!e.meleeOnly, n }); break;
    case 'block': m.blocks += e.n; break;
    case 'familiar': m.familiar = { summon: e.summon, base: e.base, scale: e.scale, cd: e.cd, fetch: e.fetch ?? 0, n }; break;
    case 'demon': m.demon = e.pct; break;
    case 'survive':
      if (e.per === 'wave') m.surviveWave = true;
      else m.surviveRun = { hpPct: e.hpPct, clear: !!e.clearShots };
      break;
    case 'sprout': m.sprout = { summon: e.summon, every: e.every, life: e.life, base: e.base, scale: e.scale, cd: e.cd, range: e.range, n }; break;
    case 'burnMod': m.burnStacks += e.stacks * n; m.burnDur += e.dur * n; break;
    case 'chainMod': m.chainAdd += e.chains * n; m.chainIgnite = m.chainIgnite || e.ignite; m.chainStun = Math.max(m.chainStun, e.stun); m.chainStunDur = e.stunDur; break;
    case 'echo': m.echo = { cls: e.cls, delay: e.delay, pct: e.pct }; break;
    case 'charmMod': m.charm = { x: e.x, dmgPct: e.dmgPct, base: e.base, scale: e.scale }; break;
    case 'every': m.every = { cls: e.cls, n: e.n, x: e.x, knock: e.knock ?? 0 }; break;
    case 'freeReroll': case 'price': case 'sell': case 'slot': case 'odds': case 'noReroll': break; // logic shop
    case 'life': m.summonLife += e.pct * n; break;
    case 'crit': m.summonCrit = { x: e.x, aspd: e.aspd }; break;
    case 'burst': m.summonBurst = { base: e.base, scale: e.scale, r: e.r, slow: e.slow, dur: e.dur }; break;
    case 'trail': m.swordTrail = { pierce: e.pierce, pct: e.pct }; break;
    case 'returnHeal': m.returnHeal = { v: e.v, cap: e.capPerSec }; break;
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
    default:
      void src;
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
  if (m.convMoon) {
    const g = Math.min(m.convMoon.max, (m.convMoon.k * Math.max(0, extra.moonHeld)) / m.convMoon.per);
    for (const t of m.convMoon.to) out[t] += g;
  }
  if (m.convSummons) {
    const g = Math.min(m.convSummons.max, (m.convSummons.k * Math.max(0, extra.summons)) / m.convSummons.per);
    for (const t of m.convSummons.to) out[t] += g;
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
    for (const k in c.stats) out[k as StatId] += (c.stats[k as StatId] ?? 0) * c.n;
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
