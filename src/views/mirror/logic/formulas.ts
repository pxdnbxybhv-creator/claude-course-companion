// 水月幻镜 · formulas (GDD §4–§7; ported from the reference sim, every ⚖ applied). Pure.
import type { HeartFaceId, ItemId, MutatorId, WeaponId } from '../ids';
import type {
  ActiveMutator, Cond, ConvertFrom, DiffIndex, Effect, PerTier, RunSave, Stats, StatId, StatMods, Tier, WClass, WeaponDef,
} from '../types';
import {
  BASE_STATS, CLAMP, COMPANIONS, DIFFS, F, HEART, ITEMS, MAPS, MUTATORS, PASSIVES, SETS, STAT_IDS, TERM_MODS, VOWS, WEAPONS,
} from '../data';

// ───────────────────────────────────────────── small helpers
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export function emptyStats(): Stats {
  const s = {} as Stats;
  for (const k of STAT_IDS) s[k] = 0;
  return s;
}
function addMods(s: Stats, m: StatMods | undefined, n = 1): void {
  if (!m) return;
  for (const k in m) s[k as StatId] += (m[k as StatId] ?? 0) * n;
}

/** Sum of a vow's per-rank value over the run's ranks (e.g. vowSum(run, 'hp') → +24 for 坚魇 ×2). */
export function vowSum(run: Pick<RunSave, 'vows'>, key: string): number {
  let t = 0;
  for (const id in run.vows) {
    const r = run.vows[id as keyof typeof run.vows] ?? 0;
    const v = VOWS[id as keyof typeof VOWS]?.per[key];
    if (r > 0 && v) t += r * v;
  }
  return t;
}
/** Heat of a vow selection (capped at 20 by the lobby). */
export function heatOf(vows: RunSave['vows']): number {
  let h = 0;
  for (const id in vows) {
    const d = VOWS[id as keyof typeof VOWS];
    if (d) h += clamp(Math.floor(vows[id as keyof typeof vows] ?? 0), 0, d.ranks) * d.heat;
  }
  return h;
}
/** A 今日镜 节气 number (0 when the run has no term or the term lacks the key). */
export function termP(run: Pick<RunSave, 'term'>, key: string): number {
  return run.term ? TERM_MODS[run.term]?.p[key] ?? 0 : 0;
}
const itemN = (run: Pick<RunSave, 'items'>, id: ItemId) => run.items[id] ?? 0;
const heartRank = (run: Pick<RunSave, 'heart'>, id: HeartFaceId) => run.heart[id] ?? 0;

// ───────────────────────────────────────────── waves and scaling (§5)
/** ⚖ 镜境 multipliers above ×1 ramp in over waves 1–20. */
export function dmx(m: number, w: number): number {
  return m <= 1 ? m : 1 + (m - 1) * Math.min(1, w / F.diffRamp);
}
/** HP(w)/HP₀ before difficulty: (1 + 0.3(w−1))·1.28^max(0, w−11); endless ×1.08^(w−31). */
export function hpMul(w: number): number {
  const f = (x: number) => (1 + F.hp.slope * (x - 1)) * Math.pow(F.hp.grow, Math.max(0, x - F.hp.from));
  return w <= 30 ? f(Math.max(1, w)) : f(30) * Math.pow(F.endless.hp, w - 31);
}
/** DMG(w)/D₀ before difficulty: (1 + 0.15(w−1))·1.06^max(0, w−11) (⚖3; GDD §5.2 had 1.08); endless ×1.05^(w−31). */
export function dmgMul(w: number): number {
  const f = (x: number) => (1 + F.dmg.slope * (x - 1)) * Math.pow(F.dmg.grow, Math.max(0, x - F.dmg.from));
  return w <= 30 ? f(Math.max(1, w)) : f(30) * Math.pow(F.endless.dmg, w - 31);
}
/** SPD(w)/S₀: 1 + 0.005·min(w−1, 30); endless +1%/wave up to +30%. */
export function spdMul(w: number): number {
  let m = 1 + F.spd.slope * Math.min(Math.max(0, w - 1), F.spd.cap);
  if (w > 30) m *= 1 + Math.min(F.endless.spdMax, F.endless.spd * (w - 30));
  return m;
}
/** B(w) = 20 + 9w + 0.4w² (endless: B(30)·1.02^(w−30)), before vows and items. */
export function budgetBase(w: number): number {
  const b = F.budget;
  if (w <= 30) return b.a + b.b * w + b.c * w * w;
  return (b.a + b.b * 30 + b.c * 900) * Math.pow(b.endless, w - 30);
}
export const isBossWave = (w: number) => w > 0 && w % 10 === 0;
export function isHordeWave(w: number): boolean {
  return w > 30 ? w % 3 === 0 : F.hordeWaves.includes(w);
}
export function isEliteWave(w: number, diff: DiffIndex): boolean {
  if (isBossWave(w)) return false;
  if (w > 30) return true;
  const d = DIFFS[diff];
  if (d.noEliteBefore && w < d.noEliteBefore) return false;
  return F.eliteWaves.includes(w);
}
/** Elites on an elite wave: 1, or 2 from 明镜 up from wave 12 (before 双精). */
export function eliteCount(w: number, diff: DiffIndex): number {
  if (!isEliteWave(w, diff)) return 0;
  const d = DIFFS[diff];
  return d.extraEliteFrom && w >= d.extraEliteFrom ? 2 : 1;
}
/** 镜印 affixes per elite: 玄镜+ from 11, a second on 无相 from 21, always one in endless. */
export function affixCount(w: number, diff: DiffIndex): number {
  const d = DIFFS[diff];
  let a = w > 30 ? 1 : 0;
  if (d.affixFrom && w >= d.affixFrom) a = Math.max(a, 1);
  if (d.affix2From && w >= d.affix2From) a = 2;
  return a;
}

/** L(w) in seconds; null on boss waves. 急景 −15%, 立夏 −10%, 夏至 +10%. */
export function waveLen(w: number, run: Pick<RunSave, 'vows' | 'term'>): number | null {
  if (isBossWave(w)) return null;
  const L = w > 30 ? F.waveLen.endless : Math.min(F.waveLen.base + F.waveLen.per * (w - 1), F.waveLen.max);
  const pct = vowSum(run, 'len') + termP(run, 'len');
  return Math.round(L * (1 + pct / 100) * 10) / 10;
}

/** Current 劫数 of a run (items only). */
export function curseOf(run: Pick<RunSave, 'items'>): number {
  let c = 0;
  for (const id in run.items) c += (ITEMS[id as ItemId]?.curse ?? 0) * (run.items[id as ItemId] ?? 0);
  return c;
}

/** Threat budget of wave w (full B(w): wavePlan takes 35% on boss waves). 群魔 +12%/rank, 妄念 +20%. */
export function budget(w: number, run: RunSave): number {
  let B = budgetBase(w) * (1 + vowSum(run, 'budget') / 100);
  for (const id in run.items) {
    const it = ITEMS[id as ItemId];
    const n = run.items[id as ItemId] ?? 0;
    if (n > 0 && it?.fx) for (const e of it.fx) if (e.do === 'world' && e.budgetPct) B *= 1 + e.budgetPct / 100;
  }
  return B;
}
/** Enemy HP multiplier for wave w: HP(w) × ramped diff × map × (1 + 1%·劫) × 坚魇 × 谷雨/小雪. */
export function hpX(w: number, run: RunSave): number {
  return hpMul(w) * dmx(DIFFS[run.diff].hp, w) * MAPS[run.map].hp * (1 + F.curseEnemy * curseOf(run))
    * (1 + vowSum(run, 'hp') / 100) * (1 + termP(run, 'enemyHp') / 100);
}
/** Enemy damage multiplier: DMG(w) × ramped diff × (1 + 1%·劫) × 利爪. */
export function dmgX(w: number, run: RunSave): number {
  return dmgMul(w) * dmx(DIFFS[run.diff].dmg, w) * (1 + F.curseEnemy * curseOf(run)) * (1 + vowSum(run, 'dmg') / 100);
}
/** Enemy speed multiplier: SPD(w) × 无相 1.08 × 疾行 × 疾影 × 节气. */
export function spdX(w: number, run: RunSave): number {
  const jiying = mutatorValue(run, 'jiying', w);
  return spdMul(w) * (DIFFS[run.diff].enemySpeed ?? 1) * (1 + vowSum(run, 'spd') / 100) * (1 + jiying / 100)
    * (1 + termP(run, 'enemySpd') / 100);
}
/** Boss HP (per body) at wave w: K_home · HP(w)/HP₀ · diff (ramped) · map, with the run's 劫/vows; 大寒 −15%. */
export function bossHp(w: number, run: RunSave): number {
  const home = (w >= 30 ? 30 : w) as 10 | 20 | 30;
  const K = F.bossK[home] ?? F.bossK[30];
  return K * hpX(w, run) * (1 + termP(run, 'bossHp') / 100);
}

// ───────────────────────────────────────────── 镜蚀
/** The mutators in force at wave w, with strength (今日镜's is ½; one drawn twice is ×2; 冬至 adds 暗月 on even waves). */
export function activeMutators(run: Pick<RunSave, 'mutators' | 'daily' | 'term'>, w: number): ActiveMutator[] {
  const out: ActiveMutator[] = [];
  run.mutators.forEach((id, i) => {
    const prev = out.find((m) => m.id === id);
    if (prev) prev.x = 2;
    else out.push({ id, x: run.daily && i === 0 ? 0.5 : 1 });
  });
  if (termP(run, 'anyueEven') && w % 2 === 0 && !out.some((m) => m.id === 'anyue')) out.push({ id: 'anyue', x: 1 });
  return out;
}
/** A mutator's number at its strength (0 when inactive): v[0]·x for x ≤ 1, v[1] at x = 2. */
export function mutatorValue(run: Pick<RunSave, 'mutators' | 'daily' | 'term'>, id: MutatorId, w: number): number {
  const m = activeMutators(run, w).find((a) => a.id === id);
  return m ? strengthOf(id, m.x) : 0;
}
export function strengthOf(id: MutatorId, x: number): number {
  const v = MUTATORS[id].v;
  return x >= 2 ? v[1] : v[0] * x;
}
/** Flat armour every enemy gains this wave (厚甲, 小寒). SpawnPlan has no armour field: engine adds this. */
export function enemyArmorAdd(run: RunSave, w: number): number {
  return mutatorValue(run, 'houjia', w) + termP(run, 'armor');
}

// ───────────────────────────────────────────── stats (§4.1)
/** Weapons per class (duplicates and dual classes count; 独孤九剑 with one weapon counts it as 6). */
export function classCounts(run: Pick<RunSave, 'weapons' | 'items'>): Partial<Record<WClass, number>> {
  const cnt: Partial<Record<WClass, number>> = {};
  for (const wp of run.weapons) for (const c of WEAPONS[wp.id].classes) cnt[c] = (cnt[c] ?? 0) + 1;
  if (itemN(run, 'dugu') && run.weapons.length === 1) for (const c of WEAPONS[run.weapons[0].id].classes) cnt[c] = 6;
  return cnt;
}
/** Set tier index per class: 0 (2-set), 1 (4-set), 2 (6-set). */
export function setTiers(run: Pick<RunSave, 'weapons' | 'items'>): Partial<Record<WClass, 0 | 1 | 2>> {
  const out: Partial<Record<WClass, 0 | 1 | 2>> = {};
  const cnt = classCounts(run);
  for (const c in cnt) {
    const n = cnt[c as WClass] ?? 0;
    if (n >= 2) out[c as WClass] = n >= 6 ? 2 : n >= 4 ? 1 : 0;
  }
  return out;
}
/** Rule flags from active sets (swordPierce, idleSwords, musicArea20, dodgeCap5 …). */
export function setFlags(run: Pick<RunSave, 'weapons' | 'items'>): string[] {
  const out: string[] = [];
  const t = setTiers(run);
  for (const c in t) for (let i = 0; i <= (t[c as WClass] ?? -1); i++) for (const f of SETS[c as WClass].tiers[i].flags ?? []) out.push(f);
  return out;
}

/** Every effect the run carries: items (× count) and the passive's. */
export function effectsOf(run: Pick<RunSave, 'items' | 'char'>): { e: Effect; n: number; src: ItemId | 'passive' }[] {
  const out: { e: Effect; n: number; src: ItemId | 'passive' }[] = [];
  for (const id in run.items) {
    const n = run.items[id as ItemId] ?? 0;
    const fx = ITEMS[id as ItemId]?.fx;
    if (n > 0 && fx) for (const e of fx) out.push({ e, n, src: id as ItemId });
  }
  const pfx = PASSIVES[COMPANIONS[run.char].passive].fx;
  if (pfx) for (const e of pfx) out.push({ e, n: 1, src: 'passive' });
  return out;
}

/**
 * The full stat sheet between waves: base + companion body + passive + level/cards (run.stats) + items
 * + sets + 心镜 + 劫数 (+2% 伤害 a point) + 节气/vows + static conds (converts from 身法/护甲/回气/classes).
 * Live conds (HP%, still, swords aloft, 醉, moon phase, buffs, 月华 held, living 墨宝) are the engine's.
 * 大橘's positive 气血 gains ×0.5, 嫦娥's positive 护甲 gains ×0.75 (the body itself is exempt).
 */
export function computeStats(run: RunSave): Stats {
  const s = emptyStats();
  addMods(s, BASE_STATS);
  const C = COMPANIONS[run.char];
  s.hp += C.hp; s.armor += C.armor; s.speed += C.speed; s.dodge += C.dodge;
  addMods(s, C.extra);
  const gains = emptyStats();
  addMods(gains, PASSIVES[C.passive].stats);
  addMods(gains, run.stats);
  for (const id in run.items) {
    const n = run.items[id as ItemId] ?? 0;
    const it = ITEMS[id as ItemId];
    if (!it || n <= 0) continue;
    addMods(gains, it.stats, n);
    if (it.fx) for (const e of it.fx) if (e.hook === 'cond' && e.do === 'stats' && !e.when && !e.cls && !e.pct) addMods(gains, e.stats, n);
  }
  const tiers = setTiers(run);
  for (const c in tiers) addMods(gains, SETS[c as WClass].tiers[tiers[c as WClass]!].stats);
  for (const id in run.heart) {
    const r = run.heart[id as HeartFaceId] ?? 0;
    if (r > 0) addMods(gains, HEART[id as HeartFaceId]?.per, r);
  }
  if (run.term) addMods(gains, TERM_MODS[run.term].stats);
  // 关公 义薄云天: +1 近战 per 3 waves cleared (max 10)
  if (run.char === 'guan') gains.melee += Math.min(PASSIVES.yibo.p.meleeMax, Math.floor(run.wave / PASSIVES.yibo.p.per));
  const hpG = run.char === 'cat' ? PASSIVES.jiuming.p.hpGain : 1;
  const arG = run.char === 'change' ? PASSIVES.yinqing.p.armorGain : 1;
  if (gains.hp > 0) gains.hp *= hpG;
  if (gains.armor > 0) gains.armor *= arG;
  for (const k of STAT_IDS) s[k] += gains[k];
  s.curse += curseOf(run);
  s.dmg += F.curseDmg * Math.max(0, s.curse);
  s.pickup += vowSum(run, 'pickup');
  s.heal += vowSum(run, 'heal') + (DIFFS[run.diff].heal ?? 0);
  // static converts (their sources are fixed between waves)
  applyConverts(run, s);
  return clampSheet(s);
}

/**
 * §4.1's hard limits on the sheet: 气血 ≥ 1, 墨宝上限 ≤ 12, 棋子上限 ≤ 14 (暴击 over 100 is not cut: it
 * becomes 暴伤 in critMult). computeStats applies them; a consumer that adds live conds to a sheet
 * reads through maxHp / summonCapOf / stonesOf.
 */
export function clampSheet(s: Stats): Stats {
  s.hp = Math.max(CLAMP.hpMin, s.hp);
  s.summonCap = Math.min(CLAMP.summonCapMax, s.summonCap);
  s.stones = Math.min(CLAMP.stonesMax, s.stones);
  return s;
}
/** Max HP from a sheet (≥ 1, whole). */
export const maxHp = (s: Stats) => Math.max(CLAMP.hpMin, Math.round(s.hp));
/** 墨宝 alive at once (≤ 12). */
export const summonCapOf = (s: Stats) => Math.max(0, Math.min(CLAMP.summonCapMax, Math.floor(s.summonCap)));
/** 棋子 on the board at once (≤ 14). */
export const stonesOf = (s: Stats) => Math.max(0, Math.min(CLAMP.stonesMax, Math.floor(s.stones)));

function convertSource(from: ConvertFrom, s: Stats, run: RunSave): number | null {
  switch (from) {
    case 'speed': return s.speed;
    case 'armor': return s.armor;
    case 'regen': return s.regen;
    case 'curse': return s.curse;
    case 'classes': return Object.keys(classCounts(run)).length;
    default: return null; // moonHeld, summons: live, the engine's
  }
}
function applyConverts(run: RunSave, s: Stats): void {
  const src = { ...s };
  const pools = new Map<string, { sum: number; max: number; to: readonly StatId[] }>();
  for (const { e } of effectsOf(run)) {
    if (e.hook !== 'cond' || e.do !== 'convert') continue;
    const v = convertSource(e.from, src, run);
    if (v === null) continue;
    const gain = Math.min(e.max, ((e.k ?? 1) * Math.max(0, v)) / e.per);
    if (e.pool) {
      const p = pools.get(e.pool) ?? { sum: 0, max: 0, to: e.to };
      p.sum += gain; p.max = Math.max(p.max, e.max);
      pools.set(e.pool, p);
    } else for (const t of e.to) s[t] += gain;
  }
  for (const p of pools.values()) for (const t of p.to) s[t] += Math.min(p.max, p.sum);
}

/** Dodge cap: companion (嫦娥 70) + 广寒桂 +10 + 月 6-set +5, never above the hard 75. */
export function dodgeCapOf(run: RunSave): number {
  let cap = COMPANIONS[run.char].dodgeCap;
  for (const { e } of effectsOf(run)) if (e.hook === 'cond' && e.do === 'cap' && e.stat === 'dodge') cap += e.v;
  if (setFlags(run).includes('dodgeCap5')) cap += 5;
  return Math.min(F.dodgeHard, cap);
}
/** Shop slots: 4 + 镜台 + 镜裂, at most 6. */
export function shopSlotsOf(run: RunSave): number {
  let n = F.shopSlots + (heartRank(run, 'heartStand') > 0 ? 1 : 0);
  for (const { e, n: c } of effectsOf(run)) if (e.hook === 'shop' && e.do === 'slot') n += e.n * c;
  return Math.min(F.shopSlotsMax, n);
}
/** Weapon slots (关公 5). */
export const weaponSlotsOf = (run: Pick<RunSave, 'char'>) => COMPANIONS[run.char].slots;

// ───────────────────────────────────────────── the damage pipeline (§4.2, §4.3)
export function armorMult(a: number): number {
  return a >= 0 ? F.armorK / (F.armorK + a) : (F.armorK - a) / F.armorK;
}
/** 减伤 % for the HUD. */
export const armorReduction = (a: number) => Math.round((1 - armorMult(a)) * 100);
/** Dodge chance 0..1 under its cap. */
export function dodgeChance(dodge: number, cap: number): number {
  return clamp(dodge, 0, Math.min(cap, F.dodgeHard)) / 100;
}
/**
 * Cooldown after 攻速: a = aspd/100 (≥ −0.8), cd/(1+a) for a ≥ 0 and cd·(1−a) below; floor 0.1 s.
 * `half`: paint, turret and stone cadence and 墨宝 attacks get half the effect.
 */
export function cooldown(cdT: number, aspd: number, half = false): number {
  let a = Math.max(CLAMP.aspdMin, aspd) / 100;
  if (half) a /= 2;
  const cd = a >= 0 ? cdT / (1 + a) : cdT * (1 - a);
  return Math.max(F.cdFloor, cd);
}
/** A weapon's tier cooldown (I..IV × 1 / 0.95 / 0.9 / 0.85). */
export const tierCd = (def: WeaponDef, t: Tier) => def.cd * F.tierCd[t - 1];
/** procCoef from the *base* cooldown: < 0.5 → 0.3, < 1.0 → 0.6, else 1. */
export function procCoef(cdT: number): number {
  for (const [below, v] of F.proc) if (cdT < below) return v;
  return 1;
}
/** Tier value of a per-tier number or a flat one. */
export const perTier = (v: number | PerTier | undefined, t: Tier, dflt = 0): number => (v === undefined ? dflt : typeof v === 'number' ? v : v[t - 1]);
/** The stat a weapon scales on most (ties: first listed). */
export function mainScale(def: WeaponDef): StatId | null {
  let best: StatId | null = null, bv = -Infinity;
  for (const k in def.scale) { const v = def.scale[k as StatId] ?? 0; if (v > bv) { bv = v; best = k as StatId; } }
  return best;
}
/** Companion multiplier for a weapon (画师 non-墨宝 −25%, 墨宝 +35%; 琴师 乐器 +20% …). */
export function charMult(run: Pick<RunSave, 'char'>, def: WeaponDef): number {
  let m = 1;
  for (const { match, pct } of COMPANIONS[run.char].wmult) {
    if (match.scale && mainScale(def) !== match.scale) continue;
    if (match.cls && !def.classes.includes(match.cls)) continue;
    if (match.notCls && def.classes.includes(match.notCls)) continue;
    m *= 1 + pct / 100;
  }
  return m;
}
/** raw = max(1, dmg[t] + Σ scale·stat). */
export function rawDamage(def: WeaponDef, t: Tier, stats: Stats): number {
  let r = def.dmg[t - 1];
  for (const k in def.scale) r += (def.scale[k as StatId] ?? 0) * stats[k as StatId];
  return Math.max(1, r);
}
/** Global 伤害 multiplier (≥ 0.1). */
export const dmgMult = (stats: Stats) => Math.max(0.1, 1 + Math.max(CLAMP.dmgMin, stats.dmg) / 100);
/** Crit chance 0..1 from weapon + stat. */
export const critChance = (weaponCrit: number, stats: Stats) => clamp((weaponCrit + stats.crit) / 100, 0, 1);
/** Crit multiplier: weapon ×critX + 暴伤/100, plus ⚖ each crit point over 100 → +1% 暴伤. */
export function critMult(critX: number, weaponCrit: number, stats: Stats): number {
  const over = Math.max(0, weaponCrit + stats.crit - 100);
  return critX + stats.critDmg / 100 + over / 100;
}
/**
 * One player hit on an enemy (§4.2): raw × mult × crit, − armour (+ shred), ≥ 1, then front shield and
 * vulnerability. DoT skips armour. `itemMult` is the product of item/cond multipliers the engine knows.
 */
export function playerHit(
  raw: number, mult: number, crit: boolean, critM: number,
  o: { armor?: number; shred?: number; noArmor?: boolean; front?: number; vuln?: number } = {},
): number {
  const hit = raw * mult * (crit ? critM : 1);
  const final = o.noArmor ? Math.max(1, Math.round(hit)) : Math.max(1, Math.round(hit - (o.armor ?? 0) + (o.shred ?? 0)));
  return final * (o.front ?? 1) * (o.vuln ?? 1);
}
/** The full weapon hit before enemy armour (for shop DPS and the engine's packets). */
export function weaponHit(run: RunSave, stats: Stats, id: WeaponId, t: Tier, itemMult = 1): { raw: number; mult: number; crit: number; critM: number } {
  const def = WEAPONS[id];
  const tier4Crit = t === 4 ? def.p.critT4 : undefined;
  const wc = def.crit + (typeof tier4Crit === 'number' ? tier4Crit : 0);
  // 墨宝 (critX 0) crit only with 画龙点睛, at its ×2.0 (§4.5)
  const critX = def.critX > 0 ? def.critX : def.classes.includes('ink') ? dottingX(run) : 0;
  return {
    raw: rawDamage(def, t, stats),
    mult: dmgMult(stats) * charMult(run, def) * itemMult,
    crit: critX > 0 ? critChance(wc, stats) : 0,
    critM: critX > 0 ? critMult(critX, wc, stats) : 1,
  };
}
/** 画龙点睛's crit multiplier for 墨宝 (0 without it: they cannot crit). */
export function dottingX(run: Pick<RunSave, 'items' | 'char'>): number {
  for (const { e } of effectsOf(run)) if (e.hook === 'summon' && e.do === 'crit') return e.x;
  return 0;
}
/**
 * One enemy hit on the player (§4.3), after dodge and i-frames: `scaled` is E.dmg × dmgX(w) (and any
 * boss/enrage factors); armour; ≥ 1; 关公 caps a hit at 20% of max HP.
 */
export function enemyHit(scaled: number, armor: number, o: { maxHp?: number; guan?: boolean; noArmor?: boolean } = {}): number {
  let d = o.noArmor ? scaled : armorMult(armor) * scaled;
  d = Math.max(1, Math.round(d));
  if (o.guan && o.maxHp) d = Math.min(d, Math.max(1, Math.floor(F.guanHitCap * o.maxHp)));
  return d;
}
/** Knockback displacement: (weapon + 击退) × (1 − resist) × map (广寒 1.4). */
export function knockback(weaponKnock: number, statKnock: number, resist: number, mapKnockX = 1): number {
  return Math.max(0, (weaponKnock + statKnock) * (1 - resist) * mapKnockX);
}
/** Chance a weapon hit heals 1 (吸血% × procCoef); at most 10 HP/s (engine). */
export const lifestealChance = (stats: Stats, proc: number) => (clamp(stats.steal, 0, CLAMP.stealMax) / 100) * proc;
/** Healing multiplier from 疗效 (≥ 0.1). */
export const healMult = (stats: Stats) => Math.max(0.1, 1 + Math.max(CLAMP.healMin, stats.heal) / 100);
/** HP/s from 回气 (0.1 per point, none at ≤ 0), after 疗效. */
export const regenPerSec = (stats: Stats) => (stats.regen > 0 ? F.regenPerPoint * stats.regen * healMult(stats) : 0);
/** Pickup radius (u). */
export const pickupRadius = (stats: Stats) => Math.max(10, F.pickupBase * (1 + stats.pickup / 100));
/** Movement speed (u/s), 身法 clamped −60…+100%. */
export const moveSpeed = (stats: Stats) => F.baseSpeed * (1 + clamp(stats.speed, CLAMP.speedMin, CLAMP.speedMax) / 100);
/** Luck factor for chances (福缘 ≥ −80). */
export const luckMult = (luck: number) => 1 + Math.max(CLAMP.luckMin, luck) / 100;
/** A weapon's range after 射程: ranged/beam/lob +range, melee +range/2, orbit +range/4; ≥ 50% of base. */
export function weaponRange(def: WeaponDef, stats: Stats, pct = 0): number {
  const k = def.kind;
  const melee = k === 'thrust' || k === 'combo' || k === 'sweep' || k === 'smash' || k === 'slam' || k === 'punch';
  const add = k === 'orbit' ? stats.range / 4 : melee ? stats.range / 2 : stats.range;
  return Math.max(def.range * 0.5, (def.range + add) * (1 + pct / 100));
}
/** Is a cond's predicate satisfied, given the engine's live readings? */
export function condHolds(c: Cond | undefined, live: { waveTime: number; hpFrac: number; still: number; swordsAir: number; weapons: number }): boolean {
  if (!c) return true;
  switch (c.k) {
    case 'waveTime': return live.waveTime < c.below;
    case 'hpBelow': return live.hpFrac < c.v;
    case 'still': return live.still >= c.s;
    case 'swordsAir': return live.swordsAir >= c.n;
    case 'soloWeapon': return live.weapons === 1;
  }
}

// ───────────────────────────────────────────── harvest, XP, levels (§4.1, §6)
/** 收成 growth after paying H: ceil(H·1.05) (园丁 1.08) through wave 30, floor(H·0.9) after. */
export function harvestNext(H: number, w: number, gardener: boolean): number {
  if (H <= 0) return H;
  return w <= 30 ? Math.ceil(H * (gardener ? F.gardenerGrow : F.harvestGrow)) : Math.floor(H * F.endless.harvestDecay);
}
/** XP from level L to L+1: (L+3)². */
export const xpNext = (L: number) => (L + 3) * (L + 3);
/** Cumulative XP to reach level L from level 1. */
export function xpTotal(L: number): number {
  let t = 0;
  for (let l = 1; l < L; l++) t += xpNext(l);
  return t;
}
function renorm(t2: number, t3: number, t4: number): PerTier {
  let t1 = 100 - t2 - t3 - t4;
  if (t1 < 0) { const s = t2 + t3 + t4; t2 *= 100 / s; t3 *= 100 / s; t4 *= 100 / s; t1 = 0; }
  return [t1, t2, t3, t4];
}
/** Level-card tier odds (%): 神 clamp(0.8(L−18)), 仙 clamp(2(L−6)), 灵 clamp(6+3L); luck × 灵+; renormalised. */
export function cardOdds(level: number, luck: number): PerTier {
  const lm = luckMult(luck);
  return renorm(clamp(6 + 3 * level, 0, 55) * lm, clamp(2 * (level - 6), 0, 25) * lm, clamp(0.8 * (level - 18), 0, 10) * lm);
}
/** Shop tier odds (%) by wave band; luck × 灵+; 镜裂 +5/+5 to 仙/神; 凡 takes the rest. */
export function shopOdds(w: number, luck: number, extra = false): PerTier {
  let r: readonly number[] = F.shopOdds[0];
  for (const x of F.shopOdds) if (w >= x[0]) r = x;
  const lm = luckMult(luck);
  let t3 = r[3] * lm, t4 = r[4] * lm;
  if (extra) { t3 += 5; t4 += 5; }
  return renorm(r[2] * lm, t3, t4);
}

// ───────────────────────────────────────────── prices (§7)
/** Shop price multiplier: 铁公鸡 +8%, 悭吝 +8%/rank, 小满 +10%. */
export function priceMult(run: RunSave): number {
  let m = 1 + vowSum(run, 'price') / 100 + termP(run, 'price') / 100;
  for (const { e, n } of effectsOf(run)) if (e.hook === 'shop' && e.do === 'price') m *= Math.pow(1 + e.pct / 100, Math.min(1, n));
  return m;
}
const growth = (w: number) => 1 + F.priceSlope * (Math.max(1, w) - 1);
/** round(base × tierMult × (1 + 0.18(w−1)) × mods). */
export function weaponPrice(id: WeaponId, t: Tier, w: number, run?: RunSave): number {
  return Math.max(1, Math.round(WEAPONS[id].price * F.tierMult[t - 1] * growth(w) * (run ? priceMult(run) : 1)));
}
export function itemPrice(id: ItemId, w: number, run?: RunSave): number {
  return Math.max(1, Math.round(ITEMS[id].price * growth(w) * (run ? priceMult(run) : 1)));
}
/** Selling returns 25% of the current price (当票 60%), 善贾 +10%/rank. */
export function sellPrice(run: RunSave, id: WeaponId, t: Tier, w: number): number {
  let frac: number = F.sellFrac;
  for (const { e } of effectsOf(run)) if (e.hook === 'shop' && e.do === 'sell') frac = Math.max(frac, e.frac);
  frac *= 1 + (heartRank(run, 'heartTrade') * (HEART.heartTrade.p?.sell ?? 10)) / 100;
  return Math.round(weaponPrice(id, t, w, run) * frac);
}
/** Reroll k in a shop: ⌈w/2⌉ + 1 + k·⌈0.5w⌉; 巧手 −4%/rank. */
export function rerollCost(w: number, k: number, run?: RunSave): number {
  const c = Math.ceil(w / 2) + 1 + k * Math.ceil(F.rerollSlope * w);
  const r = run ? heartRank(run, 'heartReroll') : 0;
  return r ? Math.max(1, Math.round(c * (1 + (r * (HEART.heartReroll.p?.reroll ?? -4)) / 100))) : c;
}
/** Level-card reroll k: 2 + ⌈w/2⌉ + k. */
export const cardRerollCost = (w: number, k: number) => 2 + Math.ceil(w / 2) + k;

// ───────────────────────────────────────────── numbers
/** Abbreviate big numbers: 1.2万 / 12k (below 10,000 as is). */
export function fmtBig(n: number, lang: 'zh' | 'en'): string {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (Math.round(a) < 1e4) return s + String(Math.round(a));
  const units = lang === 'zh' ? ZH_UNITS : EN_UNITS;
  const r = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
  let i = 0;
  while (i + 1 < units.length && a >= units[i + 1][0]) i++;
  // a value that rounds up to the next unit's size moves up: 999,999 → 1m, not 1000k; 99,999,999 → 1亿
  if (i + 1 < units.length && r(a / units[i][0]) >= units[i + 1][0] / units[i][0]) i++;
  return s + String(r(a / units[i][0])) + units[i][1];
}
const ZH_UNITS: readonly (readonly [number, string])[] = [[1e4, '万'], [1e8, '亿']];
const EN_UNITS: readonly (readonly [number, string])[] = [[1e3, 'k'], [1e6, 'm'], [1e9, 'b']];
