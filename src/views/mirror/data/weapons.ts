// 水月幻镜 · 27 weapons and the 13 class sets (GDD §8, §8.1; every ⚖ from sim/tuning.js applied).
// `p` names follow the sim (sim/data.js): per-tier arrays where the GDD gives I/II/III/IV.
import type { WeaponId } from '../ids';
import type { ClassSetDef, WClass, WeaponDef } from '../types';

const b = (zh: string, en: string) => ({ zh, en });

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  qingfeng: {
    id: 'qingfeng', classes: ['sword'], kind: 'thrust', dmg: [14, 22, 36, 58], cd: 0.8, range: 180, scale: { melee: 1 },
    crit: 10, critX: 2.0, knock: 40, price: 22, p: { pierce: [1, 1, 1, 3], w: 24, critT4: 20 },
    verse: b('十年磨一剑，霜刃未曾试', 'Ten years to grind one sword; its frosty edge untried'),
  },
  longquan: {
    id: 'longquan', classes: ['sword'], kind: 'combo', dmg: [7, 12, 20, 31], cd: 0.65, range: 160, scale: { melee: 0.8 },
    crit: 5, critX: 1.8, knock: 30, price: 26, p: { hits: 2, deg: 90, stack: 2, stackMax: 10, stackDur: 3, spinEvery: 3 }, verse: b('龙泉太阿，双剑合璧', 'Longquan and Tai\'e, twin blades as one'),
  },
  yanyue: {
    id: 'yanyue', classes: ['heavy'], kind: 'sweep', dmg: [25, 41, 66, 103], cd: 1.6, range: 230, scale: { melee: 1.1, armor: 0.3 },
    crit: 5, critX: 2.0, knock: 120, price: 42, p: { deg: 140, bigEvery: 4, waveLen: 400 },
    verse: b('青龙偃月，过五关斩六将', 'The Green Dragon crescent, five passes and six generals'),
  },
  hoe: {
    id: 'hoe', classes: ['heavy', 'fortune'], kind: 'smash', dmg: [15, 24, 38, 60], cd: 1.1, range: 170, scale: { melee: 0.9, regen: 0.3 },
    crit: 5, critX: 1.5, knock: 80, price: 20, p: { deg: 90, gold: [0.1, 0.15, 0.2, 0.25], flowers: 8, flowerHeal: 3, flowerBase: 10 },
    verse: b('晨兴理荒秽，带月荷锄归', 'Up at dawn to weed; home with the hoe by moonlight'),
  },
  pestle: {
    id: 'pestle', classes: ['heavy', 'moon'], kind: 'slam', dmg: [11, 19, 30, 48], cd: 1.0, range: 150, scale: { melee: 0.6, regen: 0.7 },
    crit: 5, critX: 1.5, knock: 80, price: 24, p: { r: 80, healChance: 0.1, shieldMax: 10 }, verse: b('玉兔捣药，秋复春', 'The jade rabbit pounds, autumn into spring'),
  },
  claw: {
    id: 'claw', classes: ['fist'], kind: 'combo', dmg: [7, 11, 18, 28], cd: 0.4, range: 120, scale: { melee: 0.7 },
    crit: 10, critX: 1.5, knock: 20, price: 18, p: { hits: 3, deg: 60, bleedEvery: 3, bleedStacks: [5, 5, 5, 15] },
    verse: b('猫有九命，爪有三痕', 'A cat has nine lives and three claw marks'),
  },
  drunkfist: {
    id: 'drunkfist', classes: ['fist', 'wine'], kind: 'punch', dmg: [11, 18, 29, 46], cd: 0.7, range: 140, scale: { melee: 0.9 },
    crit: 15, critX: 2.2, knock: 60, price: 26, p: { deg: 70, sway: 25, drunk: 3 },
    verse: b('醉里乾坤大', 'In wine the world is wide'),
  },
  dart: {
    id: 'dart', classes: ['hidden'], kind: 'projectile', dmg: [5, 8, 13, 20], cd: 0.45, range: 400, scale: { ranged: 0.8 },
    crit: 5, critX: 1.5, knock: 5, price: 18, speed: 700, p: { bounce: [1, 1, 1, 3] }, verse: b('暗器伤人，防不胜防', 'Hidden weapons, hard to guard'),
  },
  coindart: {
    id: 'coindart', classes: ['hidden', 'fortune'], kind: 'projectile', dmg: [6, 10, 16, 25], cd: 0.7, range: 380, scale: { ranged: 0.6 },
    crit: 5, critX: 1.5, knock: 5, price: 22, speed: 650, p: { per: 25, coin: [10, 15, 20, 30], goldT4: 0.25 }, verse: b('一镖值千金', 'One dart worth a thousand in gold'),
  },
  sunbow: {
    id: 'sunbow', classes: ['bow'], kind: 'projectile', dmg: [14, 23, 37, 58], cd: 1.3, range: 540, scale: { ranged: 1 },
    crit: 10, critX: 2.5, knock: 30, price: 32, speed: 900, p: { pierce: [1, 1, 1, 3], followUp: 1 },
    verse: b('羿射九日', 'Hou Yi shot down nine suns'),
  },
  repeater: {
    id: 'repeater', classes: ['bow'], kind: 'burst', dmg: [4, 7, 11, 17], cd: 1.0, range: 420, scale: { ranged: 0.6 },
    crit: 5, critX: 1.5, knock: 5, price: 30, speed: 800, p: { bolts: 3, gap: 0.08, shred: 1, splitT4: 0.5 }, verse: b('诸葛连弩，一弩十矢', 'Zhuge\'s crossbow, ten bolts a pull'),
  },
  rod: {
    id: 'rod', classes: ['fortune'], kind: 'hook', dmg: [11, 18, 28, 44], cd: 1.0, range: 380, scale: { ranged: 0.8, luck: 0.1 },
    crit: 5, critX: 1.5, knock: 0, price: 24, speed: 600, p: { pull: 150, hookGold: 0.25, hooks: [1, 1, 2, 3] }, verse: b('太公钓鱼，愿者上钩', 'Jiang Taigong fishes; the willing bite'),
  },
  qingping: {
    // m8 (balance.md §1.3): 侠客's kit was the weakest in the game
    id: 'qingping', classes: ['flying'], kind: 'launch', dmg: [11, 18, 29, 46], cd: 1.2, range: 460, scale: { ranged: 1 },
    crit: 10, critX: 2.0, knock: 20, price: 30, speed: 800, p: { pierce: 1, ret: [0.5, 0.5, 0.5, 0.75], splitT4: 3 }, verse: b('青萍结绿，长剑出匣', 'Qingping and Jielü, long swords from the case'),
  },
  casket: {
    id: 'casket', classes: ['flying'], kind: 'orbit', dmg: [6, 10, 16, 25], cd: 0.5, range: 90, scale: { ranged: 0.6, melee: 0.3 },
    crit: 5, critX: 1.5, knock: 30, price: 36, p: { blades: [2, 2, 3, 4], rev: 1, flareEvery: 4, flareR: 240, flareDur: 1 }, verse: b('匣中宝剑夜有声', 'The sword in its case sings at night'),
  },
  peach: {
    id: 'peach', classes: ['flying', 'talisman'], kind: 'homing', dmg: [9, 15, 24, 38], cd: 1.0, range: 420, scale: { ranged: 0.7, elem: 0.5 },
    crit: 5, critX: 1.5, knock: 10, price: 28, speed: 600, p: { ghost: 1.5, charmDelay: 1, charmPct: 0.5, charmR: 80 },
    verse: b('桃木辟邪', 'Peachwood wards off evil'),
  },
  seven: {
    id: 'seven', classes: ['flying'], kind: 'rain', dmg: [7, 12, 19, 30], cd: 2.2, range: 500, scale: { ranged: 0.8 },
    crit: 5, critX: 2.0, knock: 20, price: 40, p: { n: [3, 3, 4, 7], r: 40, stunT4: 0.5 },
    verse: b('七星北斗，剑指天枢', 'Seven stars of the Dipper; the sword points at Dubhe'),
  },
  thunder: {
    // m8 (balance.md §1.2, the owner: 道童 too strong): tier I 16 → 13 damage and 2 → 1 jump, reach 450 → 420; the opening only
    id: 'thunder', classes: ['talisman'], kind: 'chain', dmg: [13, 26, 42, 66], cd: 1.3, range: 420, scale: { elem: 1 },
    crit: 5, critX: 1.5, knock: 0, price: 32, p: { jumps: [1, 2, 3, 6], fall: 0.85, stunT4: 0.15, stunDur: 0.5 },
    verse: b('五雷轰顶', 'Five thunders overhead'),
  },
  fire: {
    id: 'fire', classes: ['talisman'], kind: 'lob', dmg: [8, 13, 21, 33], cd: 1.2, range: 380, scale: { elem: 0.8 },
    crit: 5, critX: 1.5, knock: 20, price: 28, p: { r: 80, burn: 3, burnScale: 0.5, burnDur: 3, burnStacks: [3, 3, 3, 5], spreadT4: 2 }, verse: b('星星之火', 'A single spark'),
  },
  gourd: {
    id: 'gourd', classes: ['talisman', 'wine'], kind: 'lob', dmg: [12, 19, 31, 48], cd: 1.3, range: 320, scale: { elem: 0.8 },
    crit: 10, critX: 2.2, knock: 20, price: 28, p: { r: 70, drunk: 2, stagger: 1, critBurn: 3, puddleT4: 3, puddleBurn: 3 }, verse: b('葫芦里卖的什么药', 'What medicine is in the gourd'),
  },
  qin: {
    id: 'qin', classes: ['music'], kind: 'pulse', dmg: [8, 13, 21, 33], cd: 1.2, range: 140, scale: { elem: 1 },
    crit: 5, critX: 1.5, knock: 30, price: 32, p: { every: [4, 4, 4, 3], resX: 2, slow: 30, slowDur: 1.5, bigX: 1.5, healT4: 1 }, verse: b('高山流水遇知音', 'High mountains, flowing water: a kindred ear'),
  },
  flute: {
    id: 'flute', classes: ['music'], kind: 'homing', dmg: [5, 8, 13, 20], cd: 0.6, range: 400, scale: { elem: 0.7 },
    crit: 5, critX: 1.5, knock: 0, price: 26, speed: 450, p: { charmEvery: [6, 6, 6, 4], charmDur: [2, 2, 2, 4] },
    verse: b('谁家玉笛暗飞声', 'Whose jade flute sends its hidden notes'),
  },
  brush: {
    id: 'brush', classes: ['ink'], kind: 'paint', dmg: [8, 14, 22, 36], cd: 4.0, range: 400, scale: { spirit: 2 },
    crit: 0, critX: 0, knock: 10, price: 30, p: { life: 10, atk: [0.7, 0.7, 0.8, 0.9], r: [30, 120, 60, 90], taunt: 1 }, verse: b('神笔马良', 'Ma Liang\'s magic brush'),
  },
  inkstone: {
    id: 'inkstone', classes: ['ink'], kind: 'turret', dmg: [5, 8, 13, 20], cd: 6.0, range: 400, scale: { spirit: 1 },
    crit: 0, critX: 0, knock: 10, price: 28, p: { life: 8, atk: 0.8, blobs: [1, 1, 1, 2], followT4: 60 }, verse: b('研墨以待', 'Ink ground and waiting'),
  },
  crane: {
    id: 'crane', classes: ['ink'], kind: 'familiar', dmg: [10, 16, 26, 40], cd: 1.0, range: 450, scale: { spirit: 0.9 },
    crit: 0, critX: 0, knock: 20, price: 30, p: { orbit: 120, burstT4: 80 }, verse: b('千纸鹤，寄相思', 'A thousand cranes carry longing'),
  },
  gobowl: {
    id: 'gobowl', classes: ['go'], kind: 'mine', dmg: [14, 23, 37, 58], cd: 1.2, range: 350, scale: { spirit: 1 },
    crit: 5, critX: 1.5, knock: 60, price: 30, p: { r: 70, chain: 120, bigX: 1.5, pullT4: 60 }, verse: b('落子无悔', 'A stone placed is never taken back'),
  },
  moonwheel: {
    id: 'moonwheel', classes: ['moon'], kind: 'boomerang', dmg: [9, 15, 24, 38], cd: 1.1, range: 420, scale: { ranged: 0.9 },
    crit: 5, critX: 1.5, knock: 10, price: 26, speed: 700, p: { speedDmg: 50, discs: [1, 1, 1, 2] }, verse: b('月轮穷天，清辉满地', 'The moon wheel crosses the sky'),
  },
  moonmirror: {
    id: 'moonmirror', classes: ['moon', 'talisman'], kind: 'beam', dmg: [12, 19, 31, 48], cd: 1.2, range: 460, scale: { elem: 0.9 },
    crit: 5, critX: 1.5, knock: 0, price: 34, p: { dodgeWin: 2, fork: [1, 1, 1, 3], forkDeg: 15 }, verse: b('广寒清辉照人间', 'The cold palace\'s light on the world'),
  },
};

/** Class set bonuses at 2 / 4 / 6 weapons (GDD §8.1). Flags are rule switches the engine reads. */
export const SETS: Readonly<Record<WClass, ClassSetDef>> = {
  sword: { cls: 'sword', tiers: [{ stats: { crit: 5, melee: 2, steal: 2 } }, { stats: { crit: 10, melee: 4, steal: 4 } }, { stats: { crit: 15, melee: 6, steal: 6 }, flags: ['swordPierce'] }] },
  heavy: { cls: 'heavy', tiers: [{ stats: { melee: 3, armor: 2 } }, { stats: { melee: 6, armor: 4, hp: 5 } }, { stats: { melee: 9, armor: 6, hp: 10, area: 15 } }] },
  fist: { cls: 'fist', tiers: [{ stats: { dodge: 3, aspd: 5, steal: 2 } }, { stats: { dodge: 6, aspd: 10, steal: 4 } }, { stats: { dodge: 10, aspd: 20, steal: 6 } }] },
  hidden: { cls: 'hidden', tiers: [{ stats: { aspd: 5 } }, { stats: { aspd: 10 } }, { stats: { aspd: 15 }, flags: ['hiddenBounce'] }] },
  bow: { cls: 'bow', tiers: [{ stats: { range: 20 } }, { stats: { range: 40 } }, { stats: { range: 60, pierce: 1 } }] },
  fortune: { cls: 'fortune', tiers: [{ stats: { harvest: 4 } }, { stats: { harvest: 8 } }, { stats: { harvest: 12, luck: 10 } }] },
  flying: { cls: 'flying', tiers: [{ stats: { crit: 5 } }, { stats: { crit: 5, swords: 1 } }, { stats: { crit: 5, swords: 2 }, flags: ['idleSwords'] }] },
  talisman: { cls: 'talisman', tiers: [{ stats: { elem: 2 } }, { stats: { elem: 4 } }, { stats: { elem: 6 }, flags: ['burnStack', 'chainPlus'] }] },
  wine: { cls: 'wine', tiers: [{ stats: { crit: 3 } }, { stats: { crit: 6 } }, { stats: { crit: 10 }, flags: ['drainHalf'] }] },
  // 乐器's 范围 applies to 乐器 weapons only: the flag carries the percent (musicArea10/20/30).
  music: { cls: 'music', tiers: [{ stats: {}, flags: ['musicArea10'] }, { stats: {}, flags: ['musicArea20'] }, { stats: {}, flags: ['musicArea30', 'charmX2'] }] },
  ink: { cls: 'ink', tiers: [{ stats: { summonCap: 1 } }, { stats: { summonCap: 2 } }, { stats: { summonCap: 3 }, flags: ['ink6'] }] },
  go: { cls: 'go', tiers: [{ stats: { stones: 1 } }, { stats: { stones: 2 } }, { stats: { stones: 3 }, flags: ['goArea25'] }] },
  moon: { cls: 'moon', tiers: [{ stats: { luck: 5 } }, { stats: { luck: 10, dodge: 3 } }, { stats: { luck: 15, dodge: 6 }, flags: ['dodgeCap5'] }] },
};

export const WCLASSES: readonly WClass[] = ['sword', 'heavy', 'fist', 'hidden', 'bow', 'fortune', 'flying', 'talisman', 'wine', 'music', 'ink', 'go', 'moon'];
