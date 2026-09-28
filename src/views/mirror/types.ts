// 水月幻镜 · the core types every module codes against (GDD §24.2, refined so the data tables fit).
// Type-only imports of ids.ts: the eager store (src/app/mirror.ts) may import this file without
// pulling the registry into the main bundle. The only runtime values here are the version numbers.
//
// Sections: 1 basics · 2 data definitions · 3 run state · 4 meta store · 5 engine ↔ UI ·
//           6 engine ↔ content (WorldApi, registries) · 7 painter · 8 audio · 9 logic results.
import type { CharacterId } from '../../data/characters';
import type { DateKey } from '../../core/types';
import type {
  AffixId, AltSkillId, ArchetypeId, BossId, DeedId, DiffId, DropKind, EliteId, EndlessBossId, FixedTitleId, FxName,
  HazardId, HeartFaceId, ItemId, MapId, MonsterId, MutatorId, PassiveId, ProjKind, RecordId, RimId, SkillId, SummonKind,
  TermModId, TreasureId, VowId, WeaponId,
} from './ids';

export type { CharacterId, DateKey };

/** Bump with a migration in logic/save.ts (GDD §23: a run that can't migrate settles as 镜碎). */
export const RUN_VER = 1;
export const META_VER = 1;

// ═════════════════════════════════════════════════════════════ 1 · basics

export interface Bilingual { readonly zh: string; readonly en: string }
export interface Vec { x: number; y: number }

/** GDD §4.1. Percent stats are additive percentage points. */
export type StatId =
  | 'hp' | 'regen' | 'steal' | 'dmg' | 'melee' | 'ranged' | 'elem' | 'spirit' | 'aspd' | 'crit' | 'critDmg' | 'range'
  | 'armor' | 'dodge' | 'speed' | 'luck' | 'harvest' | 'curse' | 'pickup' | 'summonCap' | 'swords' | 'stones' | 'knock'
  | 'area' | 'pierce' | 'heal';
/** A full stat sheet (derived by logic/formulas computeStats). */
export type Stats = Record<StatId, number>;
/** A partial block of stat changes (items, cards, sets, passives). */
export type StatMods = Partial<Record<StatId, number>>;

/** 凡 / 灵 / 仙 / 神. */
export type Tier = 1 | 2 | 3 | 4;
/** A value per weapon tier I..IV. */
export type PerTier = readonly [number, number, number, number];
/** Index into DIFF_REG: 0 闲游 … 5 无相. */
export type DiffIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type Quality = 'low' | 'mid' | 'high';

/** Weapon classes (GDD §8.1). */
export type WClass = 'sword' | 'heavy' | 'fist' | 'hidden' | 'bow' | 'fortune' | 'flying' | 'talisman' | 'wine' | 'music' | 'ink' | 'go' | 'moon';

/**
 * How a weapon attacks (GDD §8). `punch` is 醉拳's swaying arc; `slam` is 捣药杵's circle at the
 * target; `burst` is 诸葛连弩's volley. Auto-aim by kind: nearest (melee, projectile, burst, homing,
 * hook, beam, boomerang), highest HP (launch), densest (lob, rain, mine, slam), random (chain),
 * around you (pulse, orbit); paint/turret/familiar act on their own.
 */
export type WeaponKind =
  | 'thrust' | 'combo' | 'sweep' | 'smash' | 'slam' | 'punch' | 'projectile' | 'burst' | 'hook' | 'launch' | 'orbit'
  | 'homing' | 'rain' | 'chain' | 'lob' | 'pulse' | 'beam' | 'boomerang' | 'paint' | 'turret' | 'familiar' | 'mine';

// ═════════════════════════════════════════════════════════════ 2 · data definitions (data/*.ts)
// Names live in ids.ts; defs hold numbers and effect text. Every def is keyed by its registry id.

export interface WeaponDef {
  id: WeaponId;
  classes: readonly WClass[];
  kind: WeaponKind;
  dmg: PerTier;
  /** Tier-I cooldown (s); tiers multiply by 1 / 0.95 / 0.9 / 0.85. procCoef derives from it. */
  cd: number;
  /** Range in u (for paint/turret: the leash). */
  range: number;
  scale: StatMods;
  /** Crit chance % and multiplier (critX 0 = cannot crit, e.g. 墨宝 without 画龙点睛). */
  crit: number;
  critX: number;
  knock: number;
  /** Tier-I base price. */
  price: number;
  /** Projectile / sword speed u/s, when it has one. */
  speed?: number;
  /**
   * Specials read by the weapon kind's code: a number, or one per tier. Names follow the sim
   * (sim/data.js): pierce, bounce, hits, deg, r, jumps, fall, burn, burnScale, burnStacks, drunk,
   * every, charmEvery, charmDur, life, atk, blades, n, bolts, shred, hooks, hookGold, gold, coin,
   * ret, discs, fork, speedDmg, stack, ghost, bigX, healChance, critBurn …
   */
  p: Readonly<Record<string, number | PerTier>>;
  // Card text lives in data/say.ts (WEAPON_SAY: a sentence with data slots); ui/describe.ts renders it.
  /** An idiom or line of verse for the codex. */
  verse?: Bilingual;
}

/** One class's 2 / 4 / 6 bonuses. `flags` are rule switches the engine reads (e.g. 'swordPierce'). */
export interface ClassSetDef {
  cls: WClass;
  tiers: readonly [SetTier, SetTier, SetTier];
}
export interface SetTier { stats: StatMods; flags?: readonly string[] }

// ── item effects: data, interpreted by a switch (GDD §9 "Item hooks"); never a closure per item.

export type Hook =
  | 'cond' | 'onWaveStart' | 'onWaveEnd' | 'onTick' | 'onHit' | 'onCrit' | 'onKill' | 'onDodge' | 'onHurt' | 'onLethal'
  | 'onPickup' | 'shop' | 'summon' | 'sword';

/** Predicates for conditional stat blocks. */
export type Cond =
  | { k: 'waveTime'; below: number }  // the first N s of each wave (一鼓作气)
  | { k: 'hpBelow'; v: number }       // HP below this fraction of max (背水一战)
  | { k: 'still'; s: number }         // standing still for ≥ s (以逸待劳 0.5, 蒲团 1)
  | { k: 'swordsAir'; n: number }     // ≥ n swords in the air (剑心通明)
  | { k: 'soloWeapon' };              // exactly one weapon held (独孤九剑)

/** Sources for `convert`: per point of speed %, armour, 回气, 月华 held, distinct classes, living 墨宝, 劫数. */
export type ConvertFrom = 'speed' | 'armor' | 'regen' | 'moonHeld' | 'classes' | 'summons' | 'curse';

/**
 * Who interprets what: logic (computeStats, endWave, shop) handles `cond`/stats and `convert` whose
 * source is known between waves, `onWaveEnd` and `shop`; the engine re-evaluates live conds and
 * handles every in-wave hook. `special` effects are bespoke rules switched on `key` in the engine
 * (剑冢, 提子, 凌波微步, 万剑归宗, 墨龙图, 独孤九剑, 三昧真火, 十面埋伏, 将进酒, 水月镜, 蓬莱's shot clear …).
 */
export type Effect =
  | { hook: 'cond'; do: 'stats'; stats: StatMods; when?: Cond; cls?: WClass; pct?: boolean }
  | { hook: 'cond'; do: 'convert'; from: ConvertFrom; per: number; to: readonly StatId[]; k?: number; max: number; pool?: string }
  | { hook: 'cond'; do: 'cap'; stat: 'dodge'; v: number }
  | { hook: 'cond'; do: 'immune'; to: 'knock' }
  | { hook: 'cond'; do: 'world'; budgetPct?: number; moonPct?: number }
  | { hook: 'onWaveEnd'; do: 'grow'; stat: StatId; v: number }
  | { hook: 'onWaveEnd'; do: 'interest'; per?: number; pct?: number; max: number }
  | { hook: 'onKill'; do: 'drop'; kind: DropKind; p: number; luck?: boolean }
  | { hook: 'onHit' | 'onCrit'; do: 'heal'; v: number; p?: number; capPerSec?: number }
  | { hook: 'onCrit'; do: 'drunk'; v: number }
  | { hook: 'onDodge'; do: 'shards'; n: number; base: number; scale: StatMods }
  | { hook: 'onDodge'; do: 'buff'; stats: StatMods; dur: number }
  | { hook: 'onHurt'; do: 'thorns'; base: number; scale: StatMods; dealtPct?: number; meleeOnly?: boolean }
  | { hook: 'onWaveStart'; do: 'block'; n: number }
  | { hook: 'onWaveStart'; do: 'familiar'; summon: SummonKind; base: number; scale: StatMods; cd: number; fetch?: number }
  | { hook: 'onWaveStart'; do: 'demon'; pct: number }
  | { hook: 'onLethal'; do: 'survive'; per: 'wave' | 'run'; hpPct: number; clearShots?: boolean }
  | { hook: 'onTick'; do: 'sprout'; summon: SummonKind; every: number; life: number; base: number; scale: StatMods; cd: number; range: number }
  | { hook: 'onHit'; do: 'burnMod'; stacks: number; dur: number }
  | { hook: 'onHit'; do: 'chainMod'; chains: number; ignite: boolean; stun: number; stunDur: number }
  | { hook: 'onHit'; do: 'echo'; cls: WClass; delay: number; pct: number }
  | { hook: 'onHit'; do: 'charmMod'; x: number; dmgPct: number; base: number; scale: StatMods }
  | { hook: 'onHit'; do: 'every'; cls: WClass; n: number; x: number; knock?: number }
  | { hook: 'shop'; do: 'freeReroll'; n: number }
  | { hook: 'shop'; do: 'price'; pct: number }
  | { hook: 'shop'; do: 'sell'; frac: number }
  | { hook: 'shop'; do: 'slot'; n: number }
  | { hook: 'shop'; do: 'odds'; t3: number; t4: number }
  | { hook: 'shop'; do: 'noReroll' }
  | { hook: 'summon'; do: 'life'; pct: number }
  | { hook: 'summon'; do: 'crit'; x: number; aspd: number }
  | { hook: 'summon'; do: 'burst'; base: number; scale: StatMods; r: number; slow: number; dur: number }
  | { hook: 'sword'; do: 'trail'; pierce: number; pct: number }
  | { hook: 'sword'; do: 'returnHeal'; v: number; capPerSec: number }
  | { hook: Hook; do: 'special'; key: ItemId; p?: Readonly<Record<string, number>> };
export type EffectOp = Effect['do'];

export interface ItemDef {
  id: ItemId;
  tier: Tier;
  /** Base price at wave 1 (its tier is already in it). */
  price: number;
  /** Stack limit; 0 = ∞. Legendaries are 1 and unique. */
  max: number;
  /** Class tags steer the shop's class lean. */
  tags: readonly WClass[];
  stats?: StatMods;
  fx?: readonly Effect[];
  /** 劫数 added per copy. */
  curse?: number;
  /** Earliest shop wave (神品: 8). */
  from?: number;
  /** Its words live in data/say.ts (ITEM_SAY; stats-only items are generated); ui/describe.ts renders them. */
  verse?: Bilingual;
}

export type MonsterRole =
  | 'chaser' | 'lunger' | 'splitter' | 'shooter' | 'swarm' | 'charger' | 'leaper' | 'tank' | 'turret' | 'exploder'
  | 'spawner' | 'diver' | 'ambusher' | 'blinker' | 'burrower' | 'circler' | 'thrower' | 'deflector' | 'pack' | 'healer'
  | 'webber' | 'roller' | 'spore' | 'hunter' | 'formation' | 'orbiter' | 'thief' | 'laser' | 'artillery' | 'reflector'
  | 'spinner';
/** The 8 shared movement behaviours roles are built from (GDD §24.5). `content` = moved by engine/content. */
export type MonsterAi = 'chase' | 'dash' | 'keep' | 'orbit' | 'hop' | 'burrow' | 'still' | 'formation' | 'content';
export type MonsterTag = 'ghost' | 'paper' | 'hopper' | 'hunter' | 'front' | 'shieldline' | 'deflect' | 'reflect';

export interface MonsterDef {
  id: MonsterId;
  map: MapId | 'all';
  role: MonsterRole;
  ai: MonsterAi;
  /** Wave-1 照影 values; logic/formulas scales them (§5.2). */
  hp: number;
  dmg: number;
  speed: number;
  armor: number;
  /** Threat cost = 月华 dropped (fractions drop with that probability). */
  cost: number;
  from: number;
  pack: number;
  weight: number;
  tags: readonly MonsterTag[];
  /** Knockback resist: 0 normal, 0.5 tanks. */
  resist: number;
  /** Radius in u (default 14). */
  r?: number;
  shot?: ProjKind;
  /** Spawned on death (no drops): 碎镜 2 × 4 HP, 桂花精 4 petals. */
  child?: { n: number; hp: number; dmg: number; speed: number };
  /** Role timings and sizes: tell, every, lunge, dash, range, orbitR, heal, web, cloud … (GDD §13). */
  p: Readonly<Record<string, number>>;
}

export interface EliteDef {
  id: EliteId;
  map: MapId;
  hp: number;
  dmg: number;
  speed: number;
  armor: number;
  tags: readonly MonsterTag[];
  r?: number;
  p: Readonly<Record<string, number>>;
}

export interface TreasureDef {
  id: TreasureId;
  /** First wave it may appear, and its per-wave chance before 福缘. */
  from: number;
  chance: number;
  hp: number;
  /** Seconds before it vanishes. */
  life: number;
  p: Readonly<Record<string, number>>;
}

/** Boss attack patterns implemented in engine/content/bosses (the phase-script vocabulary). */
export type BossPatternId =
  | 'bubbleSpiral' | 'tailSlap' | 'leapSplash' | 'gapRing' | 'sweepBeam' // 鲤王
  | 'pearlFan' | 'mirages' | 'mirageWall' // 蜃
  | 'gapRings' | 'reflections' | 'monkeyChain' | 'homingShards' // 水中月
  | 'stomp' | 'lightningRing' | 'drumCrack' // 夔
  | 'foxfireSpiral' | 'tailLash' | 'charmGlyph' | 'illusions' | 'tailSweep' // 九尾狐
  | 'cleave' | 'shieldCharge' | 'axeDance' | 'verseZones' // 刑天
  | 'chopTree' | 'axeBarrage' | 'chopWave' | 'twinTrees' | 'treeFall' // 吴刚
  | 'tongueLash' | 'eatMoon' | 'goldRain' | 'bounce' // 金蟾王
  | 'lunge' | 'bite' | 'swallowMoon' | 'moonCross' // 天狗食月
  | 'adds'; // any boss: the wave's adds (35% of the budget over the first 60 s)
export type BossMove = 'rim' | 'drift' | 'chase' | 'anchor' | 'leap' | 'stalk';

/**
 * One timed pattern in a phase script: it first fires `at` s into the phase, then every `every` s.
 * `dmg` is at the boss's home wave on 照影 with the ⚖ factors applied (w10 ×0.7, w20 ×2.3, w30 ×5);
 * the engine multiplies by diff.dmg, vows and enrage. `tele` is the wet-ink telegraph (s).
 */
export interface PatternCall {
  pat: BossPatternId;
  every: number;
  at?: number;
  tele: number;
  dmg: number;
  n?: number;
  p?: Readonly<Record<string, number>>;
}
export interface BossPhaseDef {
  /** HP fraction where this phase starts: 1, 0.6, 0.25 (and 0.1 for 倒悬's 4th). */
  from: number;
  move: BossMove;
  speed: number;
  script: readonly PatternCall[];
}
export interface BossDef {
  id: BossId;
  map: MapId;
  wave: 10 | 20 | 30;
  /** K in BossHP = K · HP(w)/HP₀ · map.hp · diff.hp (1,300 / 1,200 / 700). */
  K: number;
  contact: number;
  r: number;
  phases: readonly [BossPhaseDef, BossPhaseDef, BossPhaseDef];
  /** Boss-specific numbers: 吴刚 treeHp 800, 夔 bpm 80, 九尾狐 tails 9, 金蟾王 growPer10 … */
  p: Readonly<Record<string, number>>;
}

/** Which weapons a companion's damage multiplier applies to. `scale`: the weapon's largest scaling stat. */
export interface WeaponMatch { scale?: StatId; cls?: WClass; notCls?: WClass }

export interface CompanionDef {
  id: CharacterId;
  hp: number;
  armor: number;
  speed: number;
  dodge: number;
  /** "Other" column plus the passive's static stats (园丁 +2 回气, 道童 +3 五行, 诗仙 +10% 暴击 …). */
  extra: StatMods;
  /** 'choice' = 书生 picks from 3 random unlocked tier-I weapons. */
  start: WeaponId | 'choice';
  /** Mastery-3 second starting choice ('more' = 书生's +1 option). */
  alt: WeaponId | 'more';
  slots: 5 | 6;
  hitbox: number;
  dodgeCap: number;
  /** The −25% / +35% style multipliers (charMult in §4.2). */
  wmult: readonly { match: WeaponMatch; pct: number }[];
  /** Classes that never appear in this companion's shop (大橘: heavy, bow; 关公: hidden). */
  bans: readonly WClass[];
  skill: SkillId;
  passive: PassiveId;
  altSkill: AltSkillId;
  leans: readonly ArchetypeId[];
  /** A quip for the shop / select sheet (「暗器？关某不屑。」). */
  quip?: Bilingual;
  verse?: Bilingual;
}

export type SkillAim = 'cluster' | 'feet' | 'around' | 'move' | 'arc' | 'strongest' | 'self' | 'land';
export interface SkillDef {
  id: SkillId | AltSkillId;
  char: CharacterId;
  aim: SkillAim;
  /** Auto-target search radius (u), when it has one. */
  reach?: number;
  cd: number;
  /** Every number of the skill text (data/say.ts SKILL_SAY slots): base, k, r, dur, slow, root, amp, n, cap, iframe, len … */
  p: Readonly<Record<string, number>>;
}
export interface PassiveDef {
  id: PassiveId;
  char: CharacterId;
  /** Static parts go to computeStats; behaviour lives in engine/content/passives. */
  stats?: StatMods;
  fx?: readonly Effect[];
  p: Readonly<Record<string, number>>;
  // Its line and 代价 live in data/say.ts (PASSIVE_SAY); ui/describe.ts renders them.
}

export type ArenaShape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number } | { kind: 'octagon'; r: number };
export interface ObstacleSpec {
  kind: 'lotus' | 'bamboo' | 'tree';
  n: number;
  r: readonly [number, number];
  /** lotus: movement + enemy shots · bamboo: movement + shots (swords, beams, lobs pass) · tree: everything. */
  blocks: 'enemyShots' | 'shots' | 'all';
}
export interface HazardDef {
  id: HazardId;
  map: MapId;
  from: number;
  every?: number;
  tele?: number;
  p: Readonly<Record<string, number>>;
}
export interface MapDef {
  id: MapId;
  shape: ArenaShape;
  obstacles: readonly ObstacleSpec[];
  hazards: readonly HazardId[];
  hp: number;
  pay: number;
  /** All knockback × this (广寒 1.4). */
  knockX: number;
  roster: readonly MonsterId[];
  elites: readonly [EliteId, EliteId];
  bosses: readonly [BossId, BossId, BossId];
  rim: RimId;
  /** '#rrggbb' paper, ink and accents; the painter's palette. */
  palette: { paper: string; ink: string; accents: readonly string[] };
  music: { bpm: readonly [number, number] };
  /** null = open from the start; else beat the wave-`wave` boss on `map`. */
  unlock: { map: MapId; wave: number } | null;
}

export interface DifficultyDef {
  id: DiffId;
  index: DiffIndex;
  hp: number;
  dmg: number;
  pay: number;
  /** Unlocked by reaching `wave` on difficulty `diff` (null = open). */
  unlock: { diff: DiffIndex; wave: number } | null;
  noEliteBefore?: number;
  teleX?: number;
  enrageAt: number;
  extraEliteFrom?: number;
  shotSpeed?: number;
  bossExtraPattern?: boolean;
  affixFrom?: number;
  affix2From?: number;
  heal?: number;
  twins20?: number;
  mutatorFrom?: number;
  enemySpeed?: number;
}

export type VowRanks = Partial<Record<VowId, number>>;
export interface VowDef {
  id: VowId;
  ranks: number;
  heat: number;
  /** Per rank: budget / hp / dmg / spd / price / heal / len in %; cards = card count; pickup %; phase4 flag. */
  per: Readonly<Record<string, number>>;
}
/** Single and double strength (e.g. 墨潮 [30, 45]); timing in `p`. */
export interface MutatorDef { id: MutatorId; v: readonly [number, number]; p: Readonly<Record<string, number>> }
export interface AffixDef { id: AffixId; p: Readonly<Record<string, number>> }
/** 今日镜 节气 modifier. Static numbers are applied by logic; the rest by engine/content/terms. */
export interface TermModDef { id: TermModId; index: number; stats?: StatMods; p: Readonly<Record<string, number>> }
export interface HeartFaceDef { id: HeartFaceId; pair: number; side: 'A' | 'B'; costs: readonly number[]; per: StatMods; p?: Readonly<Record<string, number>> }
export interface ArchetypeDef {
  id: ArchetypeId;
  weapons: readonly WeaponId[];
  keys: readonly ItemId[];
  capstone: ItemId | null;
  scales: readonly StatId[];
  flagship: readonly CharacterId[];
}

// ═════════════════════════════════════════════════════════════ 3 · run state (logic owns; saved in meta.active)

export interface OwnedWeapon { id: WeaponId; t: Tier }

export type ShopSlot =
  | { kind: 'weapon'; id: WeaponId; t: Tier; locked: boolean }
  | { kind: 'item'; id: ItemId; locked: boolean };
export interface ShopState {
  /** The wave this shop precedes (= run.wave + 1). */
  wave: number;
  /** Paid rerolls done in this shop (k in the reroll cost). */
  k: number;
  /** Free rerolls left in this shop. */
  free: number;
  /** null = bought. The shop RNG is seeded from (seed, wave, k), so a reload shows the same slots. */
  slots: (ShopSlot | null)[];
}

export type HeartSource = 'boss' | 'flower';
/** Between-wave choices still owed; a reload shows them again (GDD §23). Order: start, cards, crates, hearts, shop. */
export interface RunPending {
  /** 书生's (or mastery-3) starting-weapon choice, before wave 1. */
  start: readonly WeaponId[] | null;
  /** Level-up card screens owed, and the reroll count of the current one. */
  cards: number;
  cardK: number;
  crates: number;
  hearts: readonly HeartSource[];
}

/**
 * Per-run counters (runStats). Keys starting with `peak` are folded with max, all others summed.
 * The engine reports its keys per wave in WaveResult.stats; logic fills the rest from run state.
 */
export type RunStatKey =
  // engine, summed
  | 'kills' | 'killsSword' | 'killsFlying' | 'killsInk' | 'killsGhost' | 'charms' | 'dodges' | 'crits' | 'healed'
  | 'moonCollected' | 'dmgDealt' | 'hitsTaken' | 'elites' | 'bosses' | 'endlessBosses' | 'pixiu' | 'flowers' | 'ms'
  // engine, max
  | 'peakHit' | 'peakDrunk' | 'peakSwordsAir' | 'peakSummons' | 'peakStoneChain' | 'peakBurning' | 'peakNet'
  // logic, from run state at wave end
  | 'peakMoonHeld' | 'peakShooterWeapons' | 'peakInkWeapons' | 'peakCharmsWave' | 'peakCritsWave' | 'peakArmor'
  | 'peakSpeed' | 'peakDodge' | 'peakRegen' | 'peakCurse' | 'peakNoHit' | 'noHitNow' | 'swordsAtW20' | 'soloW20'
  | 'cleared30';
export type RunStats = Partial<Record<RunStatKey, number>>;

/** A real-coin drop (文) planned for a wave (GDD §16.3). */
export type CoinKind = 'cashCoin' | 'cashString' | 'cashTen';
export interface CoinDrop {
  kind: CoinKind;
  worth: 1 | 5 | 10;
  src: 'wave' | 'elite' | 'pixiu' | 'boss' | 'daily';
  /** 'wave': the k-th kill carries it (k over the first 60% of planned kills); 'elite': the k-th elite. */
  k?: number;
}

export interface RunSave {
  ver: number;
  /** Economy fixed at 入镜 (§16.1): the ticket (0 for a free run), the day's run index and its pay rate. */
  ticket: number;
  free: boolean;
  runIndex: number;
  rate: number;
  startedDay: DateKey;
  seed: number;
  char: CharacterId;
  map: MapId;
  diff: DiffIndex;
  vows: VowRanks;
  heat: number;
  daily: boolean;
  /** 素镜: 心镜 off (own records, +20% 镜屑). */
  plain: boolean;
  /** 心镜 active faces and ranks, snapshotted at 入镜 (empty for 素镜): lobby changes never touch a paused run. */
  heart: Partial<Record<HeartFaceId, number>>;
  /** Waves cleared (a boss wave counts once the boss dies). The next wave is wave + 1. */
  wave: number;
  /** The wave being played when the page died; null between waves. */
  inWave: number | null;
  interruptions: number;
  lvl: number;
  /** XP toward the next level. */
  xp: number;
  /** 月华 held, and the 蓄月 store. */
  moon: number;
  store: number;
  /** Current grown 收成 H (GDD §4.1). */
  harvest: number;
  /** Permanent flat gains: level-up cards, +1 气血 per level, 卧薪尝胆, 关公's 近战 … (items, sets, companion are derived). */
  stats: StatMods;
  weapons: OwnedWeapon[];
  items: Partial<Record<ItemId, number>>;
  shop: ShopState | null;
  pending: RunPending;
  drunk: number;
  /** 大橘's lives left (0 for others). */
  lives: number;
  /** Once-per-run effects already used: 'penglai' | 'heartRevive' | 'heartWard'. */
  once: string[];
  /** 镜蚀 drawn so far in draw order (endless / 无相 / 今日镜). */
  mutators: MutatorId[];
  /** 今日镜 only. */
  term: TermModId | null;
  /** 文 banked by this run's cleared waves. */
  coins: number;
  runStats: RunStats;
  /** Damage and kills by weapon id over the run (results scroll). */
  byWeapon: Partial<Record<WeaponId, { dmg: number; kills: number }>>;
  /** Last purchase (镜主 copies it). */
  lastBuy: WeaponId | ItemId | null;
  /** Real ms spent in waves (fastest 照破). */
  ms: number;
  /**
   * 破镜重圆: the run's one paid revive (REVIVE.price 文) has been used. Absent or false: the engine
   * offers `hooks.downed` on the next death. The engine sets it on its own run object at revive();
   * the session must persist it (validateRun keeps it; only `true` is written).
   */
  revived?: boolean;
  /** A tutorial run: never offered the revive (its death goes straight to `hooks.death`). Set by the tutorial flow. */
  tutorial?: boolean;
  /**
   * The wave you went down in, awaiting the revive answer (the UI commits it when `downed` fires and
   * clears it on revive). A reload that finds downAt === inWave settles the run as a death (镜碎) —
   * a closed tab never dodges a death (API.md §3 破镜重圆).
   */
  downAt?: number;
}

/** What the account has open (logic/meta unlocksOf); stable for the life of a run. */
export interface Unlocks { weapons: ReadonlySet<WeaponId>; items: ReadonlySet<ItemId> }

/** logic/run newRun(o): everything fixed at 入镜. */
export interface NewRunOpts {
  seed: number;
  char: CharacterId;
  map: MapId;
  diff: DiffIndex;
  vows: VowRanks;
  daily: boolean;
  plain: boolean;
  heart: Partial<Record<HeartFaceId, number>>;
  ticket: number;
  free: boolean;
  runIndex: number;
  rate: number;
  startedDay: DateKey;
  /** 今日镜: the 节气 modifier, the half-strength 镜蚀 and the free 灵 boon. */
  term: TermModId | null;
  mutator: MutatorId | null;
  boon: ItemId | null;
  unlocks: Unlocks;
  /** The companion's mastery level (3+: a second starting choice). */
  mastery: number;
}

/** One level-up card. */
export interface LevelCard { stat: StatId; tier: Tier; v: number }

export interface SpawnGroup { t: number; id: MonsterId; n: number }
/** A wave's deterministic spawn list (logic/spawn wavePlan(run, w), seeded from (seed, w, 'spawn')). */
export interface SpawnPlan {
  wave: number;
  /** Seconds; null on a boss wave (untimed). */
  len: number | null;
  kind: 'normal' | 'elite' | 'horde' | 'boss';
  /** Scaling for this wave (§5.2/5.3 with 镜境 ramp, map, 劫数, vows, mutators, 节气). */
  hpX: number;
  dmgX: number;
  spdX: number;
  groups: readonly SpawnGroup[];
  elites: readonly { t: number; id: EliteId; affixes: readonly AffixId[] }[];
  treasures: readonly { t: number; id: TreasureId }[];
  boss: { ids: readonly (BossId | 'mirrorself')[]; hp: number; twins: boolean } | null;
  /** Planned kills (coin carrier k is drawn over the first 60%). */
  kills: number;
}

export interface ActiveMutator { id: MutatorId; x: number }
/** Everything the engine needs to play one wave besides the run (logic/run waveSetup). */
export interface WaveSetup {
  wave: number;
  plan: SpawnPlan;
  coins: readonly CoinDrop[];
  mutators: readonly ActiveMutator[];
  term: TermModId | null;
  /** Tonight's real sky: 嫦娥's full-moon day, 水中月's true phase (0..1 lunation), 广寒's 满月 wave. */
  sky: { fullMoonDay: boolean; lunation: number; fullWave: boolean };
  stats: Stats;
}

// ═════════════════════════════════════════════════════════════ 4 · meta store (src/app/mirror.ts, key banmu.mirror.v1)

export type CodexStage = 0 | 1 | 2 | 3; // 0 unseen · 1 见 · 2 识 · 3 精
export type CodexKey =
  | `wpn:${WeaponId}` | `item:${ItemId}` | `mon:${MonsterId}` | `elite:${EliteId}` | `trs:${TreasureId}`
  | `boss:${BossId}` | `char:${CharacterId}` | `map:${MapId}` | `arch:${ArchetypeId}`;
/** `${char}|${map}|${diff}|${heat}`, with `|p` appended for 素镜. */
export type BestKey = `${CharacterId}|${MapId}|${number}|${number}` | `${CharacterId}|${MapId}|${number}|${number}|p`;
export type SealKey = `${CharacterId}|${number}` | `vow|${number}` | `heart|${CharacterId}` | `moon|${DateKey}`;
export type FirstKey = `boss:${BossId}` | `clear:${MapId}|${number}`;
export type TitleId = FixedTitleId | `rujing:${CharacterId}` | `xian:${CharacterId}`;
/** Personal numbers on codex pages: `kill:<id>`, `hold:<id>`, `win:<id>`, `play:<char>`. */
export type TallyKey = `kill:${string}` | `hold:${string}` | `win:${string}` | `play:${CharacterId}`;

export interface Best { wave: number; heat: number; at: DateKey }
export interface PayDay {
  day: DateKey;
  /** Runs started today. */
  runs: number;
  /** Today's free run used. */
  free: boolean;
  /** Everything the mirror paid as income today (返照钱 + 铜钱 + firsts), ≤ 300. */
  paid: number;
  /** 铜钱 paid today, ≤ 30. */
  drops: number;
  refunded: boolean;
}
export interface MirrorSettings {
  aim: 'auto' | 'manual';
  /** Damage numbers: 0 off · 1 crits only · 2 all. */
  nums: 0 | 1 | 2;
  shake: boolean;
  left: boolean;
  quality: 'auto' | Quality;
  /** 新手提示: a line the first time you meet a boss, an elite, a casket, a curse item or low HP. On unless
   *  false (sanitizeMirror always writes it; optional only so an older literal still type-checks). */
  tips?: boolean;
  /** 视野 (EngineSettings.view): 'near' 近 · 'mid' 中 (the default; missing means 'mid') · 'far' 远. The
   *  UI half keeps it (sanitizeMirror must copy it), shows it in the settings sheet and forwards it to
   *  the engine's setSettings({ view }) and the painter's bakeScale (scratchpad/mirror4/UI-HALF.md). */
  view?: 'near' | 'mid' | 'far';
}
/** The tutorial's first-time tips (ui/tips.ts): one line each, shown once per account. */
export type TutorTipId = 'boss' | 'crate' | 'crateOpen' | 'elite' | 'curse' | 'lowHp' | 'cards' | 'shop';
/**
 * The tutorial 「初入镜中」 (ui/Tutorial.tsx): `offered` once the sheet, ribbon or tutorial was seen,
 * `done` once it was played to its end card; `tips` the first-time tips already shown. They unlock
 * nothing and pay nothing. Unknown well-formed tip keys are kept (a newer build's tips).
 */
export interface TutorFlags { offered: boolean; done: boolean; tips: Partial<Record<TutorTipId, true>> }
export interface MirrorMeta {
  v: 1;
  ticketsUsed: number;
  active: RunSave | null;
  deeds: Partial<Record<DeedId, number>>;
  codex: Partial<Record<CodexKey, CodexStage>>;
  tally: Partial<Record<TallyKey, number>>;
  bests: Partial<Record<BestKey, Best>>;
  seals: Partial<Record<SealKey, true>>;
  /** Highest 镜境 index open, maps open (1..3). */
  diffMax: DiffIndex;
  mapsOpen: 1 | 2 | 3;
  firsts: Partial<Record<FirstKey, true>>;
  /** 镜屑 and 心镜. */
  dust: number;
  heart: { ranks: Partial<Record<HeartFaceId, number>>; pick: Record<number, 'A' | 'B'>; plain: boolean };
  /** Mastery XP by companion. */
  mastery: Partial<Record<CharacterId, number>>;
  daily: { day: DateKey; best: number; bonus: boolean; weekDays: DateKey[]; weekPaid: DateKey | null };
  /** 候签 index → date collected. */
  slips: Record<number, DateKey>;
  payDay: PayDay;
  coinsPaid: number;
  owed: number;
  firstsHeld: number;
  lastDay: DateKey;
  lobby: { char: CharacterId; map: MapId; diff: DiffIndex; vows: VowRanks };
  settings: MirrorSettings;
  records: Partial<Record<RecordId, number>>;
  titles: TitleId[];
  title: TitleId | null;
  /** Chapter rims earned; the lobby shows `rim`. */
  rims: RimId[];
  rim: RimId | null;
  /** The tutorial's flags (TutorFlags). Always set by sanitizeMirror / defaultMeta; optional only so an
   *  older literal meta (sim/bot.ts) still type-checks — read it through ui/tips.ts tutorOf(). */
  tutor?: TutorFlags;
}

// ═════════════════════════════════════════════════════════════ 5 · engine ↔ UI (engine/index.ts: createEngine)

export interface EngineSettings {
  quality: Quality;
  /** Device-pixel-ratio cap (2, or 1.5 on low). */
  dprCap: number;
  reduceMotion: boolean;
  nums: 0 | 1 | 2;
  shake: boolean;
  aim: 'auto' | 'manual';
  lang: 'zh' | 'en';
  /** View size (paint/draw.ts VIEW_SPAN): how much of the arena the screen shows — 'near' (the old
   *  close view: the shorter side shows 440 u), 'mid' (the default: 700 u), 'far' (820 u). Optional:
   *  missing means 'mid'. Applies live through `setSettings({ view })` (the engine re-bakes its sprites
   *  for the new size in the background). */
  view?: 'near' | 'mid' | 'far';
}

/** HUD snapshot, pushed ≈8 Hz. The object is reused: copy what you keep; write refs, not Preact state. */
export interface HudState {
  hp: number;
  hpMax: number;
  shield: number;
  moon: number;
  /** 文 in the sleeve this wave; shown once the run has seen its first coin. */
  sleeve: number;
  showSleeve: boolean;
  level: number;
  xp: number;
  xpNext: number;
  wave: number;
  /** Seconds left; null during a boss (the boss scroll replaces the timer). */
  time: number | null;
  boss: { id: BossId | EndlessBossId; hp: number; phase: number } | null;
  /** Skill ring: 0 = ready … 1 = just used; `active` while it runs. */
  skillCd: number;
  skillActive: boolean;
  drunk: number | null;
  moonPhase: number | null;
  lives: number | null;
  curse: number;
  lowHp: boolean;
  /** A beat since the last push: 2 Hz, or 夔's own 80 BPM while it is the boss. */
  beat: boolean;
  /** Darkness is down (暗月, 天狗食月): the HUD turns to light words (.mj-dark). */
  dark: boolean;
  fps: number;
}

/** What a won wave hands back; logic/run endWave(run, result) folds it into the run. */
export interface WaveResult {
  wave: number;
  /** 月华 picked up this wave (all multipliers applied), and the XP it gave (书生 +10%). */
  moon: number;
  xp: number;
  /** 月华 left on the field → 蓄月; and what remained undrawn in 蓄月. */
  field: number;
  storeLeft: number;
  /** Levels gained mid-wave (the engine already showed the ring). */
  levels: number;
  crates: number;
  hearts: readonly HeartSource[];
  /** Coins picked into the sleeve; banked by logic/economy at this wave end. */
  sleeve: readonly CoinDrop[];
  lives: number;
  once: readonly string[];
  drunk: number;
  stats: RunStats;
  /** Kills by monster/elite/boss/treasure id (codex tallies). */
  killsBy: Readonly<Record<string, number>>;
  byWeapon: Partial<Record<WeaponId, { dmg: number; kills: number }>>;
  bosses: readonly (BossId | EndlessBossId)[];
  ms: number;
}
/** 镜碎 during a wave. `partial` counts for deeds, tallies and records; its sleeve is lost (「袖中铜钱，随镜沉池」). */
export interface DeathResult {
  wave: number;
  partial: WaveResult;
  /** Registry id of what dealt the last hit (or 'hazard'). */
  cause: string;
}

export type BossEvent =
  | { kind: 'intro'; id: BossId | EndlessBossId; ids: readonly BossId[] }
  | { kind: 'phase'; id: BossId | EndlessBossId; phase: number }
  | { kind: 'dead'; id: BossId | EndlessBossId };

/**
 * 破镜重圆: you fell and the run's one revive is on offer. The engine is in phase 'down' (the world
 * frozen, your figure sinking into an ink blot) and waits for engine.revive() or engine.giveUp().
 */
export interface DownInfo {
  /** true whenever the hook fires (the engine offers it only while logic canRevive(run)); the purse is the UI's. */
  canRevive: boolean;
  /** The price in 文 (REVIVE.price = 50): the UI charges it (session), then calls engine.revive(). */
  price: number;
  /** The wave being played. */
  wave: number;
  /** Registry id of what dealt the last hit (or 'hazard'), as DeathResult.cause. */
  cause: string;
}

export interface EngineHooks {
  /** ≈8 Hz. Never set Preact state per frame from here. */
  hud(s: HudState): void;
  /** A level was gained mid-wave (the card choice waits for the wave end). */
  levelUp(level: number): void;
  /** A 镜奁 dropped (it opens at the wave end); `total` this wave. */
  crate(total: number): void;
  /** A 文 coin went into the sleeve. */
  coin(drop: CoinDrop, sleeve: number): void;
  /** On 'intro' the engine has paused itself; the UI shows the 1.5 s card and calls resume(). */
  boss(ev: BossEvent): void;
  /** The wave was won; the engine is idle until start() is called again. */
  waveEnd(r: WaveResult): void;
  death(r: DeathResult): void;
  /**
   * Optional. The first death of a run that may be revived (logic canRevive(run): not yet revived, not a
   * tutorial): the engine goes 'down' instead of dying and calls this once. Answer with engine.revive()
   * (after charging) or engine.giveUp() (→ `death` as usual). Without this hook, or on any later death,
   * the engine dies at once exactly as before. If it throws, the engine gives up.
   */
  downed?(d: DownInfo): void;
  /** fatal = the second throw within 5 s (GDD §23); the UI voids or settles the run. */
  error(e: unknown, fatal: boolean): void;
}

export type SkillTarget = { kind: 'auto' } | { kind: 'screen'; sx: number; sy: number } | { kind: 'dir'; x: number; y: number };

export interface EngineInput {
  /** Movement vector from the stick or keys, length ≤ 1; (0, 0) stops (0.05 s). */
  move(x: number, y: number): void;
  /** Manual-aim vector (手瞄); (0, 0) returns to auto-aim. */
  aim(x: number, y: number): void;
  /** Mouse position in canvas CSS px (desktop aim, cursor-cast skills). */
  cursor(sx: number, sy: number): void;
}

/** 'down': fallen, waiting for revive() or giveUp() (nothing steps; the ink blot settles over ≈ 1 s, then the frame holds). */
export type EnginePhase = 'idle' | 'wave' | 'ending' | 'down' | 'dead' | 'disposed';
export interface Engine {
  readonly phase: EnginePhase;
  readonly paused: boolean;
  readonly input: EngineInput;
  /** Play wave setup.wave from the start with this run state (a replay after 暂离 is the same call). */
  start(run: RunSave, setup: WaveSetup): void;
  pause(): void;
  resume(): void;
  /** Stop the RAF, drop pools; the canvas may be reused by a new engine. */
  dispose(): void;
  /** Re-read the canvas size and dpr (call from a ResizeObserver). */
  resize(): void;
  /** Cast the 镜技 (ignored while on cooldown). */
  skill(t?: SkillTarget): void;
  /** Show (or with null hide) the drag-to-aim ghost reticle. */
  skillPreview(t: SkillTarget | null): void;
  setSettings(p: Partial<EngineSettings>): void;
  /** The arena's ink so far, for the 画卷 and 存画 (null before the first wave). */
  snapshot(w: number, h: number): HTMLCanvasElement | null;
  /**
   * 破镜重圆, the answer to `downed`: rise where you fell at REVIVE.hpPct (50%) of max 气血 with
   * REVIVE.invuln (2 s) of invulnerability (a jade shimmer), a jade-and-moon shockwave that throws the
   * nearby crowd back and wipes enemy shots near you; sets run.revived = true and resumes (a pause is
   * lifted). Returns false (and does nothing) unless the phase is 'down'. Charge the 文 first.
   */
  revive(): boolean;
  /** The other answer to `downed`: the normal death (hooks.death → phase 'dead'). A no-op unless 'down'. */
  giveUp(): void;
}
export interface EngineDeps {
  painter: Painter;
  audio: MirrorAudio;
  content: ContentRegistry;
  hooks: EngineHooks;
  settings: EngineSettings;
}
export type CreateEngine = (canvas: HTMLCanvasElement, run: RunSave, deps: EngineDeps) => Engine;

// ═════════════════════════════════════════════════════════════ 6 · engine ↔ content (engine/content/*)

export type DamageSrc = 'weapon' | 'summon' | 'skill' | 'item' | 'status' | 'hazard' | 'enemy' | 'boss';
export type StatusKind = 'burn' | 'bleed' | 'slow' | 'root' | 'stun' | 'charm' | 'shred' | 'vuln' | 'stagger';
export type CombatEvent = 'hit' | 'crit' | 'kill' | 'dodge' | 'hurt' | 'pickup' | 'cast' | 'summonDeath' | 'beat';
/** One combat event; the object is reused between calls. `e` is an enemy handle or -1. */
export interface GameEvent {
  type: CombatEvent;
  e: number;
  dmg: number;
  crit: boolean;
  src: DamageSrc;
  x: number;
  y: number;
  /** Weapon slot index, or -1. */
  slot: number;
}

/** A player-side hit: raw = base + Σ scale·stat, then the §4.2 pipeline (armour unless noArmor). */
export interface HitPacket {
  base: number;
  scale?: StatMods;
  /** Extra multiplier (e.g. 1.5 for 150% of a weapon's hit). */
  mult?: number;
  /** 'roll' (default) uses your crit; true forces; false never. */
  crit?: boolean | 'roll';
  noArmor?: boolean;
  src: DamageSrc;
  knock?: number;
  status?: { kind: StatusKind; dur: number; v?: number };
  /** On-hit chance multiplier (procCoef). */
  proc?: number;
}
export interface ShotSpec {
  side: 'player' | 'enemy';
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  /** Enemy shots: damage before scaling by the wave. Player shots: a packet. */
  dmg?: number;
  hit?: HitPacket;
  pierce?: number;
  homing?: number;
  /** Lobbed: lands at the end of life (a shadow shows where). */
  lob?: boolean;
  /** Slow/root on the player (冰魄, 墨蛛). */
  status?: { kind: StatusKind; dur: number; v?: number };
}
export interface ZoneSpec {
  side: 'player' | 'enemy';
  look: FxName;
  x: number;
  y: number;
  r: number;
  life: number;
  /** Seconds between ticks; each tick calls onTick with the zone id. */
  tick?: number;
  onTick?: (w: WorldApi, zone: number) => void;
  /** Continuous effects on whoever stands inside. */
  slow?: number;
  dmgPerSec?: number;
  undodgeable?: boolean;
  follow?: 'player';
}
export type TeleShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'ring'; x: number; y: number; r: number; r2: number; gaps?: readonly { at: number; w: number }[] }
  | { kind: 'line'; x: number; y: number; dir: number; len: number; w: number }
  | { kind: 'cone'; x: number; y: number; dir: number; r: number; deg: number }
  | { kind: 'fan'; x: number; y: number; dir: number; deg: number; n: number };
export interface TeleSpec {
  shape: TeleShape;
  /** Seconds to fill; 镜境 teleX applies inside the engine. */
  dur: number;
  /** Fires when full (the strike). */
  then?: (w: WorldApi) => void;
}
export interface SpawnOpts {
  bloom?: boolean;
  hpX?: number;
  noDrops?: boolean;
  affixes?: readonly AffixId[];
  /** Counts toward the alive cap / 重墨 overflow (default true for monsters). */
  capped?: boolean;
}

/** A live view into the enemy pools, reused between calls: read or write at once, never keep it. */
export interface EnemyView {
  readonly h: number;
  readonly id: string;
  readonly kind: 'mon' | 'elite' | 'boss' | 'treasure' | 'ally' | 'demon';
  readonly tags: readonly MonsterTag[];
  readonly hpMax: number;
  readonly alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  armor: number;
  /** Scaled contact damage and base speed for this wave. */
  dmg: number;
  speed: number;
  untargetable: boolean;
  invuln: boolean;
  /** 8 floats of scratch state for the content that drives this body. */
  readonly mem: Float32Array;
}
export interface PlayerView {
  readonly hp: number;
  readonly hpMax: number;
  readonly r: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** Facing (radians); the dash / skill direction when standing still. */
  readonly face: number;
  readonly moving: boolean;
  readonly stillFor: number;
  readonly invuln: number;
  readonly untargetable: number;
}
export interface ArenaGeom {
  shape: ArenaShape;
  obstacles: readonly { x: number; y: number; r: number; kind: ObstacleSpec['kind']; blocks: ObstacleSpec['blocks'] }[];
  /** Axis-aligned bounds, origin at the arena centre. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type EnemyFilter = 'any' | 'normal' | 'notBoss' | 'eliteOrBoss' | 'ally';

/**
 * The engine's façade for engine/content. Handles are opaque numbers; alive(h) is false once a
 * body dies or its slot is reused. Everything is scoped to the current wave: timers, zones,
 * telegraphs and listeners are cleared at the wave end.
 */
export interface WorldApi {
  readonly t: number;
  readonly dt: number;
  readonly wave: number;
  /** Content's own stream for this wave, seeded from (seed, wave, 'content'). */
  readonly rng: () => number;
  readonly run: Readonly<RunSave>;
  /** Live derived stats (conds re-evaluated each step). */
  readonly stats: Readonly<Stats>;
  readonly map: Readonly<MapDef>;
  readonly arena: Readonly<ArenaGeom>;
  readonly diff: Readonly<DifficultyDef>;
  readonly quality: Quality;
  readonly player: PlayerView;
  /** 嫦娥's cycle 0..7 (0 full, 4 new) and whether the beat ticked this step (2 Hz; 夔's own tempo while it is the boss). */
  readonly moonPhase: number;
  readonly beat: boolean;

  // queries
  alive(h: number): boolean;
  enemy(h: number): EnemyView;
  nearest(x: number, y: number, r: number, f?: EnemyFilter): number;
  strongest(x: number, y: number, r: number, f?: EnemyFilter): number;
  /** Centre of the densest cluster (radius `r`) within `reach` of (x, y), or null. */
  densest(x: number, y: number, reach: number, r: number): Vec | null;
  /** Fills `out` with handles within r; returns the count. */
  query(x: number, y: number, r: number, out: number[], f?: EnemyFilter): number;
  inArena(x: number, y: number, r?: number): boolean;
  clampToArena(p: Vec, r?: number): Vec;

  // player-side damage and control of enemies
  hit(h: number, pk: HitPacket): number;
  hitArea(x: number, y: number, r: number, pk: HitPacket, f?: EnemyFilter): number;
  hitCone(x: number, y: number, dir: number, r: number, deg: number, pk: HitPacket, f?: EnemyFilter): number;
  hitLine(x: number, y: number, dir: number, len: number, w: number, pk: HitPacket, f?: EnemyFilter): number;
  status(h: number, kind: StatusKind, dur: number, v?: number): void;
  push(h: number, fromX: number, fromY: number, dist: number): void;
  pull(h: number, toX: number, toY: number, dist: number): void;
  /** 点化 / 知音: fights for you for `dur` s (non-elites only). */
  convert(h: number, dur: number): void;
  kill(h: number, drops?: boolean): void;

  // the player
  heal(n: number): void;
  shield(n: number, cap?: number): void;
  /** Damage to the player: dodge and armour apply unless flagged (beams, hazards, DoT). */
  hurt(n: number, o?: { undodgeable?: boolean; noArmor?: boolean; src?: string }): void;
  dash(dirX: number, dirY: number, dist: number, dur: number, invuln?: number): void;
  leap(to: Vec, dur: number, untargetable?: boolean): void;
  invuln(dur: number): void;
  untargetable(dur: number): void;
  root(dur: number): void;
  /** Keyed timed buff (a new buff with the same key replaces it). mult scales movement. */
  buff(key: string, stats: StatMods, dur: number, moveX?: number): void;
  addDrunk(n: number): void;
  refundSkill(sec: number): void;

  // bodies and shapes
  spawn(id: MonsterId | EliteId | TreasureId, x: number | null, y: number | null, o?: SpawnOpts): number;
  /** Spawn a boss body driven by content.bosses[id]; returns its handle. */
  spawnBoss(id: BossId | 'mirrorself', x: number, y: number, hp: number): number;
  bossPhase(h: number, phase: number): void;
  summon(kind: SummonKind, x: number, y: number, o: { life: number; hit: HitPacket; cd: number; r?: number; capped?: boolean }): number;
  shot(s: ShotSpec): void;
  clearShots(side: 'enemy' | 'player'): void;
  zone(z: ZoneSpec): number;
  endZone(id: number): void;
  tele(t: TeleSpec): number;
  drop(kind: DropKind, x: number, y: number, n?: number): void;
  /** Every 月华 within r of (x, y) flies to the player (一网打尽, 猫跃). */
  attract(x: number, y: number, r: number): void;

  // presentation
  fx(name: FxName, x: number, y: number, o?: { r?: number; dir?: number; life?: number; tint?: string }): void;
  /** Brush title at the screen edge (synergies, ≤ 1/s) or centre (boss phases). */
  title(text: Bilingual, where?: 'edge' | 'centre'): void;
  /** A boss's slam: min(2, px / 2) px, ≤ 1 per 0.5 s; off with 震屏 off and under reduced motion. The player's weapons, 镜技 and the elites never call it. */
  shake(px: number): void;
  hitstop(ms: number): void;
  sfx(name: SfxName): void;
  /** Vision radius (暗月, 天狗食月); null = full light. */
  light(r: number | null): void;

  // time
  after(sec: number, fn: (w: WorldApi) => void): number;
  every(sec: number, fn: (w: WorldApi) => void): number;
  cancel(timer: number): void;
}

/** Content lifecycle: start at the wave start (or spawn), tick per 60 Hz step, events, end at the wave end. */
export interface Behaviour<S = unknown> {
  start?(w: WorldApi, arg?: number): S;
  tick?(w: WorldApi, s: S, dt: number): void;
  on?(w: WorldApi, s: S, ev: GameEvent): void;
  end?(w: WorldApi, s: S): void;
  /** A lethal hit on the player: return true to prevent death (九命). */
  lethal?(w: WorldApi, s: S): boolean;
}
/** A body driven by content (elites, treasures, bosses, 镜主). */
export interface ActorImpl<S = unknown> {
  init(w: WorldApi, h: number): S;
  tick(w: WorldApi, h: number, s: S, dt: number): void;
  hit?(w: WorldApi, h: number, s: S, ev: GameEvent): void;
  death?(w: WorldApi, h: number, s: S): void;
}
/** An affix riding on an elite's own ActorImpl. */
export interface AffixImpl<S = unknown> {
  init(w: WorldApi, h: number): S;
  tick?(w: WorldApi, h: number, s: S, dt: number): void;
  hit?(w: WorldApi, h: number, s: S, ev: GameEvent): void;
  death?(w: WorldApi, h: number, s: S): void;
}
export interface SkillRun {
  /** Return false when finished; the cooldown starts then. */
  tick(w: WorldApi, dt: number): boolean;
  on?(w: WorldApi, ev: GameEvent): void;
  end?(w: WorldApi): void;
}
export interface SkillImpl {
  /** The auto-target, or null for your feet / facing. */
  target(w: WorldApi, def: SkillDef): Vec | null;
  cast(w: WorldApi, def: SkillDef, at: Vec, dir: Vec): SkillRun;
}
/** A boss pattern: started by the phase-script runner, ticked until it returns false. */
export interface PatternImpl {
  start(w: WorldApi, boss: number, call: PatternCall): { tick(w: WorldApi, dt: number): boolean; end?(w: WorldApi): void };
}

/** What engine/content/index.ts exports as CONTENT; the UI passes it to createEngine. */
export interface ContentRegistry {
  skills: Readonly<Partial<Record<SkillId | AltSkillId, SkillImpl>>>;
  passives: Readonly<Partial<Record<PassiveId, Behaviour>>>;
  hazards: Readonly<Partial<Record<HazardId, Behaviour>>>;
  elites: Readonly<Partial<Record<EliteId, ActorImpl>>>;
  treasures: Readonly<Partial<Record<TreasureId, ActorImpl>>>;
  bosses: Readonly<Partial<Record<BossId | 'mirrorself', ActorImpl>>>;
  patterns: Readonly<Partial<Record<BossPatternId, PatternImpl>>>;
  affixes: Readonly<Partial<Record<AffixId, AffixImpl>>>;
  /** start(w, x) receives the strength (0.5, 1, 2). */
  mutators: Readonly<Partial<Record<MutatorId, Behaviour>>>;
  terms: Readonly<Partial<Record<TermModId, Behaviour>>>;
}

// ═════════════════════════════════════════════════════════════ 7 · painter (paint/*: createPainter)

export type BossPhase = 0 | 1 | 2 | 3;
/** 水中月's moon phases for its reflections: 0 full … 4 new (1–3 waning, 5–7 waxing). */
export type MoonLook = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Atlas keys. `boss:mirrorself:0` is baked from run.char in white-on-black ink; `boss:moonwater:1:m0` … `m7`
 *  are 水中月's second phase wearing a moon phase (its split reflections). */
export type AtlasId =
  | `char:${CharacterId}` | `mon:${MonsterId}` | `mon:${TreasureId}` | `elite:${EliteId}` | `boss:${BossId | 'mirrorself'}:${BossPhase}`
  | `boss:moonwater:1:m${MoonLook}`
  | `wpn:${WeaponId}` | `item:${ItemId}` | `sum:${SummonKind}` | `proj:${ProjKind}` | `drop:${DropKind}` | `fx:${FxName}`;

/** A baked sprite: a source rect in an atlas canvas, its size in world u and its anchor (0..1). */
export interface Sprite {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}
/** World → screen: screen = (world − (x, y)) · scale + (w/2, h/2), in device px. */
export interface Camera { x: number; y: number; scale: number; w: number; h: number; dpr: number }
export type StampKind = 'splat' | 'burn' | 'ink' | 'petal' | 'coinRing';
export type NumStyle = 'hit' | 'crit' | 'heal' | 'moon' | 'coin' | 'player';
export type BakeStage = 'start' | 'boss' | 'endless';

export interface Painter {
  readonly map: MapId;
  readonly quality: Quality;
  readonly dpr: number;
  /** What a run needs baked at a stage (start: roster, elites, companion, weapons, drops, fx, digits; boss: the next boss, in the wave-9/19/29 shop; endless: the other rosters). */
  plan(run: RunSave, stage: BakeStage): AtlasId[];
  /** Frame-budgeted (≈6 ms/frame) bake after document.fonts has loaded; resolves when done. */
  bake(ids: readonly AtlasId[], onProgress?: (done: number, total: number) => void): Promise<void>;
  has(id: AtlasId): boolean;
  /** A sprite (variant or animation frame `v`), or null: draw a placeholder circle then. */
  sprite(id: AtlasId, v?: number): Sprite | null;
  /** The white hit-flash twin (source-atop). */
  flash(id: AtlasId, v?: number): Sprite | null;
  variants(id: AtlasId): number;
  /** Paint the arena layer once (paper, décor, obstacles; inverted = 倒影 for endless). */
  paintArena(geom: ArenaGeom, seed: number, inverted: boolean): void;
  /** Blit the part of the arena under the camera. */
  drawArena(ctx: CanvasRenderingContext2D, cam: Camera): void;
  /** Stamp into the arena layer: one drawImage, costs nothing per frame after. */
  stamp(kind: StampKind, x: number, y: number, r: number, seed: number, tint?: string): void;
  /** Wave end: wash the paper f (0.08) whiter. */
  wash(f: number): void;
  /** Wet ink filling a telegraph shape; k = 0 empty … 1 full (strike). */
  drawTele(ctx: CanvasRenderingContext2D, cam: Camera, shape: TeleShape, k: number): void;
  /** A zone / wash (flowerbed, net, puddle …) at opacity a. */
  drawZone(ctx: CanvasRenderingContext2D, cam: Camera, look: FxName, x: number, y: number, r: number, a: number): void;
  /** Damage numbers from the digit atlas (abbreviated 1.2万 / 12k by lang). */
  drawNumber(ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en'): void;
  /** A standalone icon canvas (CSS px size) for DOM screens: shop cards, codex, results. */
  icon(id: AtlasId, px: number): HTMLCanvasElement;
  /** The arena's current ink, scaled (画卷, 存画). */
  arenaImage(w: number, h: number): HTMLCanvasElement;
  dispose(): void;
}
export type CreatePainter = (map: MapId, quality: Quality, dpr: number) => Painter;

// ═════════════════════════════════════════════════════════════ 8 · audio (audio/sfx.ts: createMirrorAudio)

/** Cached voices via Mixer.cached, ±6% rate jitter, ≤ 4 per 50 ms, per-kind caps. Never audio.pluck per hit. */
export type SfxName =
  | 'hitMelee' | 'hitShot' | 'hitTalisman' | 'summon' | 'crit' | 'pickup' | 'coin' | 'coinString' | 'coinTen' | 'levelUp'
  | 'gong' | 'bell' | 'merge' | 'hurt' | 'dodge' | 'kill' | 'bossDrum' | 'phaseBreak' | 'beatTick' | 'buy' | 'reroll'
  | 'crate' | 'shatter' | 'ritualCoins' | 'ritualGlint' | 'uiTap';
export type MusicPhase = 'lobby' | 'shop' | 'wave' | 'boss' | 'results' | null;
export interface MirrorAudio {
  /** Render the cached voices (behind 研墨). */
  prime(): Promise<void>;
  sfx(name: SfxName, o?: { gain?: number; rate?: number }): void;
  /** Pickups climb 宫商角徵羽 as a combo builds. */
  pickup(combo: number): void;
  /** Theme by phase, through the director (audio/music.ts): 'mirror-calm' for the lobby, the shop and
   *  the results, 'mirror' for a wave (a drum fill in, a 0.3 s cut), 'mirror-boss' for a boss; the
   *  clear plays 钹 + 大鼓 and drops to calm. Coloured by map; switches only when the phase or map changes. */
  music(phase: MusicPhase, map: MapId): void;
  /** Optional: the engine's ≈ 8 Hz HUD feed during a wave (crowd = living capped enemies / the cap,
   *  0..1): the wave clock builds the band's layers, danger pushes one up, the boss phase steps the
   *  boss theme, the timer reaching 0 (or the last boss falling) plays the clear. */
  hud?(s: HudState, crowd: number): void;
  dispose(): void;
}
export type CreateMirrorAudio = () => MirrorAudio;

// ═════════════════════════════════════════════════════════════ 9 · logic results the UI renders

export interface SlotView { slot: ShopSlot | null; price: number; afford: boolean; merges: boolean }
export interface ShopView {
  wave: number;
  slots: readonly SlotView[];
  rerollCost: number;
  freeRerolls: number;
  canReroll: boolean;
  canLock: boolean;
  moon: number;
  /** 棋士 sees the next wave's elite and hazards. */
  preview: { elites: readonly EliteId[]; hazards: readonly HazardId[] } | null;
}
export interface CardsView { level: number; cards: readonly LevelCard[]; rerollCost: number; left: number }

/** The lobby's 「入镜」 button (GDD §16.1, §18.1). */
export interface EntryQuote {
  /** A paused run holds the mirror: 续镜 or 弃镜 first. */
  paused: boolean;
  /** A paid ticket never used (reconcile): 「续镜 · 已付」, a new run with no fee. */
  unusedTicket: boolean;
  free: boolean;
  fee: 0 | 20;
  /** 文 still missing (0 = affordable). */
  short: number;
  runIndex: number;
  rate: number;
}
export interface LobbyStatus {
  day: DateKey;
  runs: number;
  nextRate: number;
  freeLeft: boolean;
  paid: number;
  ceiling: number;
  drops: number;
  dropCap: number;
  /** ≥ 3 runs today: 「镜已三照，且去园中走走」. */
  rest: boolean;
}
/** The results scroll's pay lines (GDD §16.2, §18.10). */
export interface PayBreakdown {
  W: number;
  base: number;
  diffX: number;
  mapX: number;
  heatX: number;
  gross: number;
  capped: boolean;
  rate: number;
  rated: number;
  room: number;
  income: number;
  /** The fee-back floor, paid with refund() (not income). */
  back: number;
  /** 文 banked along the way (already in the purse). */
  coins: number;
  firsts: number;
  firstsHeld: number;
  fee: 0 | 20;
  net: number;
}
export type EndCause = 'death' | 'abandon' | 'interrupt' | 'migrate' | 'error' | 'void';
export interface RunReport {
  run: RunSave;
  cause: EndCause;
  W: number;
  zhaopo: boolean;
  pay: PayBreakdown;
  dust: number;
  mastery: { char: CharacterId; before: number; after: number; level: number; levelUp: boolean };
  unlocks: readonly (WeaponId | ItemId)[];
  records: readonly RecordId[];
  firsts: readonly FirstKey[];
  seals: readonly SealKey[];
  titles: readonly TitleId[];
  slip: number | null;
}
/** 今日镜 for a date (seed hashString('mirror:' + day)). */
export interface DailySpec {
  day: DateKey;
  seed: number;
  map: MapId;
  chars: readonly CharacterId[];
  boon: ItemId;
  term: TermModId;
  mutator: MutatorId;
  /** 候签 index = term·3 + pentad. */
  slip: number;
}
