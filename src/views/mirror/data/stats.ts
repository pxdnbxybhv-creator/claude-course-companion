// 水月幻镜 · formula constants (GDD §3–§7, every ⚖ value applied; the reference sim's `F` after tuning.js).
// Pure data: logic/formulas.ts reads these; nothing here computes.
import type { PerTier, StatId, StatMods } from '../types';

/** Every stat id in sheet order (GDD §4.1). */
export const STAT_IDS: readonly StatId[] = [
  'hp', 'regen', 'steal', 'dmg', 'melee', 'ranged', 'elem', 'spirit', 'aspd', 'crit', 'critDmg', 'range',
  'armor', 'dodge', 'speed', 'luck', 'harvest', 'curse', 'pickup', 'summonCap', 'swords', 'stones', 'knock',
  'area', 'pierce', 'heal',
];

/** The stat sheet before the companion (summonCap 3, stones 6; everything else 0). */
export const BASE_STATS: StatMods = { summonCap: 3, stones: 6 };

/** Clamps from §4.1 (applied where the stat is read, never to the stored sheet). */
export const CLAMP = {
  dmgMin: -90, aspdMin: -80, critMax: 100, stealMax: 100, speedMin: -60, speedMax: 100, luckMin: -80,
  summonCapMax: 12, stonesMax: 14, healMin: -90, hpMin: 1,
} as const;

export const F = {
  // §4.1 / §4.2 / §4.3
  armorK: 15,
  dodgeCap: 60,
  dodgeHard: 75,
  regenPerPoint: 0.1,
  stealPerSec: 10,
  /** Innate 吸血 % of melee weapon hits (thrust, combo, sweep, smash, slam, punch), on top of the stat. */
  meleeSteal: 3,
  baseSpeed: 280,
  /** Pickup radius (u) before 拾取: 135, 150% of the old 90 (the owner: 「拾取掉落物的范围初始扩大至当前的150%」). */
  pickupBase: 135,
  pickupMaxSpeed: 700,
  critXDefault: 1.5,
  /** ⚖ 暴击 over 100 becomes +1% 暴伤 per point. */
  critOverflow: true,
  cdFloor: 0.1,
  /** Tier cooldown multipliers I..IV. */
  tierCd: [1, 0.95, 0.9, 0.85] as PerTier,
  /** procCoef bands by *base* cooldown: < 0.5 → 0.3, < 1.0 → 0.6, else 1. */
  proc: [[0.5, 0.3], [1.0, 0.6]] as const,
  /** Knockback resist by body. */
  resist: { normal: 0, tank: 0.5, elite: 0.7, boss: 1 },
  knockDur: 0.12,
  /** i-frames after a hit (round 5: 0.35 → 0.5, every companion). */
  iframes: 0.5,
  contactCd: 0.35,
  /** ⚖ 劫数 (m8 劫律, balance.md §4.1): per point enemies +2% HP and +2% damage, you +1 伤害 and +2% 月华, so a
   *  point always gives the monsters more than you (kill speed ×(1+(D+1)/100)/(1+D/100)/1.02 < 1 for every D ≥ 0). */
  curseEnemy: 0.02,
  curseDmg: 1,
  curseMoon: 0.02,
  /** 关公: no hit over 20% of max HP. */
  guanHitCap: 0.2,
  // §4.5
  drunk: { perHit: 2, perKill: 1, drain: 8, drainAfter: 2, critPer10: 4, critMax: 40, fullX: 0.8, sway: 25, cap: 100 },
  summon: { hp: 10, hpSpirit: 2, hpWave: 1.5, seek: 360, leash: 400, aspdX: 0.5, decoyR: 60 },
  /** ⚖ extra swords deal 40%; at most 20 swords on screen. */
  swordExtra: 0.4,
  swordCap: 20,
  launchReturn: 0.5,
  stone: { arm: 0.3, r: 70, chain: 120 },
  // §5.1
  waveLen: { base: 20, per: 5, max: 60, endless: 60, quiet: 3 },
  budget: { a: 20, b: 9, c: 0.4, endless: 1.02 },
  bossAddsFrac: 0.35,
  bossAddsWindow: 60,
  /** Group interval by wave (boss waves take the band they close: 10 → 2.5, 20 → 2.0). */
  groupEvery: [[10, 2.5], [20, 2.0], [Infinity, 1.6]] as const,
  firstGroup: 0.5,
  groupWindowPad: 3.5,
  hordeWaves: [6, 13, 16, 23, 26] as readonly number[],
  hordeHp: 0.6,
  hordeBoost: [0.4, 0.6, 2] as const,
  eliteWaves: [5, 8, 12, 15, 18, 22, 25, 28] as readonly number[],
  eliteAt: 0.4,
  bloom: 1.0,
  bloomEasy: 1.3,
  spawnMinDist: 260,
  alive: { low: 90, mid: 140, high: 200 },
  enemyShots: 300,
  /** 重墨: a spawn over the alive cap feeds a living body (80% of its HP); ⚖5 hpCap: never past 2.5× the body's own HP (the rest only moves 月华). */
  heavyInk: { hpFrac: 0.8, grow: 0.08, max: 1.6, hpCap: 2.5 },
  // §5.2 ⚖5 (m6): HP grows by band instead of 1.28^(w−11) — the owner: 「25波以后小怪的血量厚到无法杀死」.
  // [lastWave, growth per wave]; waves 1–20 are exactly the old curve (×188 at 25, ×410 at 30; was ×260 / ×1,056).
  hp: { slope: 0.3, bands: [[11, 1], [20, 1.28], [25, 1.20], [30, 1.13]] as readonly (readonly [number, number])[] },
  // ⚖3 (the real-engine harness, sim/realbal.ts): 1.08 → 1.06. Played for real, mid-run hits landed
  // far more often than the reference sim assumed, and waves 14–27 killed in 4–7 hits (~25% of max HP a
  // hit); ~−16% at wave 20, −30% at 30 (bosses scale to their home wave, so their own hits are unchanged)
  // ⚖5 (m6): late danger comes from damage, not HP — waves 21–30 grow 1.09 a wave (×1.33 at 30), endless 1.08.
  dmg: { slope: 0.15, grow: 1.06, from: 11, lateGrow: 1.09 },
  spd: { slope: 0.005, cap: 30 },
  bossK: { 10: 1300, 20: 1200, 30: 700 } as Readonly<Record<10 | 20 | 30, number>>,
  /** ⚖ 镜境 multipliers above ×1 ramp in over waves 1–20. */
  diffRamp: 20,
  // §5.3 endless (⚖5: HP 1.08 → 1.055 a wave, no cliff at 31; damage 1.05 → 1.10: with the HP wall gone a bot that
  // steps out of ground clouds reached the wave-70 cap in 54% of runs at 1.06; at 1.10, 12%, median wave 54.5; the owner
  // asked that late waves stay winnable, so 1.08 sits between: endless still tightens, a good build is not one-shot at 50)
  endless: { hp: 1.055, dmg: 1.08, spd: 0.01, spdMax: 0.3, harvestDecay: 0.9, mutatorEvery: 5, twinsX: 0.7, mirrorX: 0.8, coinX: 0.5 },
  // §6
  startMoon: 30,
  eliteMoon: 12,
  bossMoon: 50,
  crateChance: 0.005,
  lotusChance: 0.01,
  lotusHeal: 3,
  thickAbove: 300,
  thickWorth: 5,
  harvestGrow: 1.05,
  gardenerGrow: 1.08,
  // §7 shop
  shopSlots: 4,
  shopSlotsMax: 6,
  /** A slot rolls a weapon 45% of the time (20% once the weapon slots are full: then always a copy for 合铸). */
  weaponRoll: 0.45,
  fullWeaponRoll: 0.2,
  /** Item slots lean to your weapons' class tags 40% of the time, from the first piece (was 25%, from 2). */
  classLean: 0.4,
  classLeanFrom: 1,
  /** A weapon roll is a copy (same id and tier) of a held weapon 25% of the time, weighted like the school draw. */
  copyLean: 0.25,
  /** 同流派 draw: a weapon's weight is 1 + schoolK · min(schoolCap, pieces of its classes you hold or have locked). */
  schoolK: 4,
  schoolCap: 4,
  /** [fromWave, 凡, 灵, 仙, 神]: weapon tiers in the shop and the item in a 镜奁. */
  /** m8 (balance.md §2, the owner: 「高品质物品刷新率太低」): 凡 down in every band. */
  shopOdds: [[1, 85, 15, 0, 0], [4, 62, 30, 8, 0], [8, 46, 36, 15, 3], [13, 34, 38, 22, 6], [20, 24, 38, 29, 9], [30, 16, 36, 34, 14]] as const,
  /** [fromWave, 凡, 灵, 仙, 神]: item (道具) tiers in the shop — ⚖5: more 仙 and 神 (the owner: 「紫，红品质道具降价且多刷」). */
  /** m8 (balance.md §2): 凡 80/55/36/24/15/10 at waves 1/4/8/13/20/30. */
  itemOdds: [[1, 80, 20, 0, 0], [4, 55, 33, 12, 0], [8, 36, 36, 22, 6], [13, 24, 36, 30, 10], [20, 15, 33, 37, 15], [30, 10, 30, 40, 20]] as const,
  /** ⚖ item price = round(base × (1 + 0.18(w−1))). */
  priceSlope: 0.18,
  /** m8 (balance.md §3, the owner: 「武器类用品涨价过于快速」): weapon price = round(base × tierMult × (1 + 0.15(w−1))). */
  weaponSlope: 0.15,
  /** Weapon tier price multipliers I..IV (m8: 1 / 2 / 3.8 / 6.5 → 1 / 1.8 / 3.2 / 5.2). */
  tierMult: [1, 1.8, 3.2, 5.2] as PerTier,
  /** ⚖ reroll k = ⌈w/2⌉ + 1 + k·⌈0.5w⌉. */
  rerollSlope: 0.5,
  sellFrac: 0.25,
  pawnFrac: 0.6,
  /** The most a sale ever returns (当票 + 善贾 stacked), below 货比三家's cheapest buy (QA: no buy-low, sell-high loop). */
  sellFracMax: 0.7,
  weaponSlots: 6,
  legendFrom: 8,
  crateMelt: 0.5,
  /** Crates roll with the next band's odds (the sim's w + 4, capped at 40). */
  crateAhead: 4,
  heartOdds: { 10: 0.2, 20: 0.35 } as Readonly<Record<number, number>>,
  heartOddsLate: 0.35,
  // §6 levels
  cards: 4,
  cardsScholar: 5,
  cardsSolo: 3,
  treasure: { pixiuFrom: 3, pixiuChance: 1 / 6, flowerFrom: 5, flowerChance: 0.003 },
  // ── m8:items ── (new constants only, append-only; PLAN §5)
  /** 千金散尽 (items.md §R.4 ⑥): spilled 月华 lands pickupR + near … far from you and can't be taken for `hold` s. */
  itemScatter: { near: 60, far: 160, hold: 1.5 },
  /** 月华如练 (items.md §2.14): a streaming pearl strikes foes within r (+ their radius), each once (a ring of `ring`). */
  itemStream: { r: 12, ring: 16 },
  /** 与虎谋皮 (items.md §2.20): the 镜印 an elite carries at most once eliteAffix adds to them. */
  eliteAffixMax: 3,
  // ── m8:art ──
  /** 月华 tiers (m8, PLAN D20): a haul is split greedily into 满月 [0] and 月华珠 [1] pieces, then 月华 of 1
   *  (engine/moon.ts splitMoon). Totals and XP are unchanged; 蓄月 pays per whole point (D21). */
  moonTiers: [25, 5] as readonly [number, number],
  // ── m8:hidden ──
  /** The hidden companions' engine numbers that are not a skill's or passive's p (hidden.md §2.5, §2.7, §3.4). */
  hidden: {
    /** A press is credited back to the pointer / key event's own time, at most this much before the step (s). */
    lagMax: 0.1,
    /** The ring at the figure: radius = hitbox + ringPad (u); its opacity while idle. */
    ringPad: 10, ringIdle: 0.3,
    /** 越女: a caught shot flies back at reflectSpeed × its speed (at least reflectMin u/s) for reflectLife s, radius reflectR. */
    reflectSpeed: 1.2, reflectMin: 360, reflectLife: 1.2, reflectR: 10,
    /** 越女 夺: the dash takes cutDur s. */
    cutDur: 0.18,
    /** Haptic ticks (ms, when 震动 is on): 越女's catch and 精, 后羿's draw entering the notch. */
    hapticCatch: 8, hapticPerfect: 20, hapticNotch: 10,
    /** The 镜主's mirrored 镜技 for the hidden three (hidden.md §3.10, §4.10, §5.10); damage is × the 镜主's blow. */
    mirror: {
      /** 越女: a thin circle warns `warn` s before a guard ring of radius r that lasts dur s; your shots touching it are
       *  caught and it throws `shots` slow shots back (speed u/s, spread° apart, life s, radius shotR, × shotX each);
       *  after `dashAfter` guards that caught something, a dash along len × w u telegraphed tele s, × dashX on contact. */
      yuenv: { warn: 0.3, dur: 0.4, r: 80, shots: 3, speed: 200, spread: 14, life: 3.5, shotR: 10, shotX: 1, dashAfter: 2, len: 320, w: 60, tele: 0.6, dashDur: 0.22, dashX: 2 },
      /** 山鬼: a vine telegraphed tele s along a w u line binds you for life s; beyond far u from it you are slow (0..1)
       *  slower; at the end, if you are more than snap u farther than at the bind, you are yanked to pullTo u from it
       *  and stunned stun s. */
      shangui: { tele: 0.6, w: 26, life: 4, far: 300, slow: 0.3, snap: 150, pullTo: 60, stun: 0.5, tint: '#9fb86a' },
      /** 后羿: a len × w line telegraph of tele s that tracks you for track s, then locks; × x on the line. Every other
       *  shot glows gold from sweet0 to sweet1 s (the moment to step off). */
      houyi: { tele: 1.2, track: 0.6, len: 900, w: 44, x: 2, sweet0: 0.9, sweet1: 1.1 },
    },
  },
} as const;

/** Level-up card values per stat, 凡 / 灵 / 仙 / 神 (GDD §6). */
export const CARD_STATS: Readonly<Partial<Record<StatId, PerTier>>> = {
  hp: [3, 6, 9, 12],
  regen: [2, 3, 4, 5],
  steal: [1, 2, 3, 4],
  dmg: [5, 8, 12, 16],
  melee: [2, 3, 4, 5],
  ranged: [2, 3, 4, 5],
  elem: [2, 3, 4, 5],
  spirit: [2, 3, 4, 5],
  aspd: [5, 10, 15, 20],
  crit: [3, 5, 7, 9],
  range: [15, 30, 45, 60],
  armor: [1, 2, 3, 4],
  dodge: [3, 6, 9, 12],
  speed: [3, 6, 9, 12],
  luck: [5, 10, 15, 20],
  harvest: [5, 8, 10, 12],
};
export const CARD_STAT_IDS = Object.keys(CARD_STATS) as StatId[];

/** Mastery thresholds (cumulative XP for levels 1–10, GDD §17.4). */
export const MASTERY = [20, 50, 100, 170, 260, 370, 500, 650, 820, 1000] as const;
