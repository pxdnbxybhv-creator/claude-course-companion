// 水月幻镜 · 27 weapons and the 13 class sets (GDD §8, §8.1; every ⚖ from sim/tuning.js applied).
// `p` names follow the sim (sim/data.js): per-tier arrays where the GDD gives I/II/III/IV.
import type { WeaponId } from '../ids';
import type { ClassSetDef, WClass, WeaponDef } from '../types';

const b = (zh: string, en: string) => ({ zh, en });

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  qingfeng: {
    id: 'qingfeng', classes: ['sword'], kind: 'thrust', dmg: [10, 16, 26, 42], cd: 0.9, range: 150, scale: { melee: 1 },
    crit: 10, critX: 2.0, knock: 20, price: 22, p: { pierce: [1, 1, 1, 3], w: 24, critT4: 20 },
    text: b('刺出一线，穿透 1', 'Thrusts a 24 u line; pierces 1'), t4: b('穿透 3，暴击 +20%', 'Pierces 3, +20% crit'),
    verse: b('十年磨一剑，霜刃未曾试', 'Ten years to grind one sword; its frosty edge untried'),
  },
  longquan: {
    id: 'longquan', classes: ['sword'], kind: 'combo', dmg: [5, 9, 14, 22], cd: 0.7, range: 130, scale: { melee: 0.8 },
    crit: 5, critX: 1.8, knock: 10, price: 26, p: { hits: 2, deg: 90, stack: 2, stackMax: 10, stackDur: 3, spinEvery: 3 },
    text: b('双剑两弧，每击 +2% 攻速 3 秒（至多 +10%）', 'Two 90° arcs; each hit +2% 攻速 for 3 s (max +10%)'),
    t4: b('每第三击旋身 360°', 'Every 3rd attack spins 360°'), verse: b('龙泉太阿，双剑合璧', 'Longquan and Tai\'e, twin blades as one'),
  },
  yanyue: {
    id: 'yanyue', classes: ['heavy'], kind: 'sweep', dmg: [20, 33, 53, 82], cd: 1.8, range: 200, scale: { melee: 1.1, armor: 0.3 },
    crit: 5, critX: 2.0, knock: 120, price: 42, p: { deg: 140, bigEvery: 4, waveLen: 400 },
    text: b('横扫 140°，扫中皆伤', 'Sweeps 140°, hitting everything in the arc'),
    t4: b('每第四扫 ×2，并发刀气行 400', 'Every 4th sweep ×2 plus a crescent wave that travels 400'),
    verse: b('青龙偃月，过五关斩六将', 'The Green Dragon crescent, five passes and six generals'),
  },
  hoe: {
    id: 'hoe', classes: ['heavy', 'fortune'], kind: 'smash', dmg: [12, 19, 30, 48], cd: 1.2, range: 140, scale: { melee: 0.9, regen: 0.3 },
    crit: 5, critX: 1.5, knock: 60, price: 20, p: { deg: 90, gold: [0.1, 0.15, 0.2, 0.25], flowers: 8, flowerHeal: 3, flowerBase: 10 },
    text: b('击杀 +1 月华（10/15/20/25%，随福缘）', 'Kills give +1 月华 10/15/20/25% (luck-scaled)'),
    t4: b('击杀种花（至多 8）：踏之回 3，敌踏之受 10 + 100% 造化', 'Kills plant a flower (max 8): heals 3; enemies take 10 + 100% 造化'),
    verse: b('晨兴理荒秽，带月荷锄归', 'Up at dawn to weed; home with the hoe by moonlight'),
  },
  pestle: {
    id: 'pestle', classes: ['heavy', 'moon'], kind: 'slam', dmg: [9, 15, 24, 38], cd: 1.1, range: 130, scale: { melee: 0.6, regen: 0.7 },
    crit: 5, critX: 1.5, knock: 80, price: 24, p: { r: 80, healChance: 0.1, shieldMax: 10 },
    text: b('砸落 r 80；10% × 触发系数 回 1', 'Slams r 80 at the target; 10% × procCoef to heal 1'),
    t4: b('每击 +1 月盾（至多 10）', 'Each hit adds a 1-point moon shield (max 10)'), verse: b('玉兔捣药，秋复春', 'The jade rabbit pounds, autumn into spring'),
  },
  claw: {
    id: 'claw', classes: ['fist'], kind: 'combo', dmg: [5, 8, 13, 20], cd: 0.4, range: 90, scale: { melee: 0.7 },
    crit: 10, critX: 1.5, knock: 5, price: 18, p: { hits: 3, deg: 60, bleedEvery: 3, bleedStacks: [5, 5, 5, 15] },
    text: b('三爪 60°，每第三爪致流血', 'Three 60° swipes; every 3rd bleeds'), t4: b('流血至多 15 层', 'Bleed stacks up to 15'),
    verse: b('猫有九命，爪有三痕', 'A cat has nine lives and three claw marks'),
  },
  drunkfist: {
    id: 'drunkfist', classes: ['fist', 'wine'], kind: 'punch', dmg: [8, 13, 21, 33], cd: 0.8, range: 110, scale: { melee: 0.9 },
    crit: 15, critX: 2.2, knock: 40, price: 26, p: { deg: 70, sway: 25, drunk: 3 },
    text: b('醉拳 70° 摇摆 ±25°，每击 +3 醉', 'A 70° arc swaying ±25°; +3 醉 per hit'), t4: b('暴击重置冷却', 'A crit resets the cooldown'),
    verse: b('醉里乾坤大', 'In wine the world is wide'),
  },
  dart: {
    id: 'dart', classes: ['hidden'], kind: 'projectile', dmg: [5, 8, 13, 20], cd: 0.45, range: 400, scale: { ranged: 0.8 },
    crit: 5, critX: 1.5, knock: 5, price: 18, speed: 700, p: { bounce: [1, 1, 1, 3] },
    text: b('弹射 1', 'Bounces 1'), t4: b('弹射 3', 'Bounces 3'), verse: b('暗器伤人，防不胜防', 'Hidden weapons, hard to guard'),
  },
  coindart: {
    id: 'coindart', classes: ['hidden', 'fortune'], kind: 'projectile', dmg: [6, 10, 16, 25], cd: 0.7, range: 380, scale: { ranged: 0.6 },
    crit: 5, critX: 1.5, knock: 5, price: 22, speed: 650, p: { per: 25, coin: [10, 15, 20, 30], goldT4: 0.25 },
    text: b('每持 25 月华 +1 伤害（上限 10/15/20/30）', '+1 damage per 25 月华 held (max +10/15/20/30)'),
    t4: b('击杀 25% 多落 1 月华', 'Kills drop +1 月华 25% of the time'), verse: b('一镖值千金', 'One dart worth a thousand in gold'),
  },
  sunbow: {
    id: 'sunbow', classes: ['bow'], kind: 'projectile', dmg: [14, 23, 37, 58], cd: 1.3, range: 540, scale: { ranged: 1 },
    crit: 10, critX: 2.5, knock: 30, price: 32, speed: 900, p: { pierce: [1, 1, 1, 3], followUp: 1 },
    text: b('穿透 1', 'Pierces 1'), t4: b('穿透 3；暴击击杀再发一箭', 'Pierces 3; crit kills loose a follow-up arrow'),
    verse: b('羿射九日', 'Hou Yi shot down nine suns'),
  },
  repeater: {
    id: 'repeater', classes: ['bow'], kind: 'burst', dmg: [4, 7, 11, 17], cd: 1.0, range: 420, scale: { ranged: 0.6 },
    crit: 5, critX: 1.5, knock: 5, price: 30, speed: 800, p: { bolts: 3, gap: 0.08, shred: 1, splitT4: 0.5 },
    text: b('连发三矢（间隔 0.08 秒），每矢破甲 1', 'A burst of 3 bolts, 0.08 s apart; each shreds 1 armour'),
    t4: b('击杀时矢分为二（各 50%）', 'Bolts split in two on a kill (50% each)'), verse: b('诸葛连弩，一弩十矢', 'Zhuge\'s crossbow, ten bolts a pull'),
  },
  rod: {
    id: 'rod', classes: ['fortune'], kind: 'hook', dmg: [11, 18, 28, 44], cd: 1.0, range: 380, scale: { ranged: 0.8, luck: 0.1 },
    crit: 5, critX: 1.5, knock: 0, price: 24, speed: 600, p: { pull: 150, hookGold: 0.25, hooks: [1, 1, 2, 3] },
    text: b('钩回 150；钩杀 25% 多 1 月华；三阶钩 2', 'Pulls 150; hooked kills +1 月华 25%; tier III hooks 2'),
    t4: b('一钩三敌', 'Hooks 3 targets'), verse: b('太公钓鱼，愿者上钩', 'Jiang Taigong fishes; the willing bite'),
  },
  qingping: {
    id: 'qingping', classes: ['flying'], kind: 'launch', dmg: [9, 15, 24, 38], cd: 1.2, range: 460, scale: { ranged: 1 },
    crit: 10, critX: 2.0, knock: 20, price: 30, speed: 800, p: { pierce: 1, ret: [0.5, 0.5, 0.5, 0.75], splitT4: 3 },
    text: b('发 1 + 剑数 飞剑，穿透 1；领剑回程 50%', '1 + 剑数 swords out and back; pierce 1; the lead\'s return deals 50%'),
    t4: b('回程 75%；首次暴击分为三剑', 'Return deals 75%; a sword splits into 3 on its first crit'), verse: b('青萍结绿，长剑出匣', 'Qingping and Jielü, long swords from the case'),
  },
  casket: {
    id: 'casket', classes: ['flying'], kind: 'orbit', dmg: [6, 10, 16, 25], cd: 0.5, range: 90, scale: { ranged: 0.6, melee: 0.3 },
    crit: 5, critX: 1.5, knock: 30, price: 36, p: { blades: [2, 2, 3, 4], rev: 1, flareEvery: 4, flareR: 240, flareDur: 1 },
    text: b('2/2/3/4 + 剑数 剑环身 r 90，每敌 0.5 秒一触', '2/2/3/4 + 剑数 blades circle at r 90; 0.5 s per enemy'),
    t4: b('每 4 秒剑阵展至 r 240，持续 1 秒', 'Every 4 s the ring flares to r 240 for 1 s'), verse: b('匣中宝剑夜有声', 'The sword in its case sings at night'),
  },
  peach: {
    id: 'peach', classes: ['flying', 'talisman'], kind: 'homing', dmg: [9, 15, 24, 38], cd: 1.0, range: 420, scale: { ranged: 0.7, elem: 0.5 },
    crit: 5, critX: 1.5, knock: 10, price: 28, speed: 600, p: { ghost: 1.5, charmDelay: 1, charmPct: 0.5, charmR: 80 },
    text: b('追踪 1 + 剑数；对鬼 +50%', '1 + 剑数 homing swords; +50% against 鬼'), t4: b('留桃符，1 秒后爆（50%，r 80）', 'Leaves a talisman that bursts after 1 s (50%, r 80)'),
    verse: b('桃木辟邪', 'Peachwood wards off evil'),
  },
  seven: {
    id: 'seven', classes: ['flying'], kind: 'rain', dmg: [7, 12, 19, 30], cd: 2.2, range: 500, scale: { ranged: 0.8 },
    crit: 5, critX: 2.0, knock: 20, price: 40, p: { n: [3, 3, 4, 7], r: 40, stunT4: 0.5 },
    text: b('3/3/4/5 + 剑数 剑如北斗落下，各 r 40', '3/3/4/5 + 剑数 swords fall in a dipper line, r 40 each'), t4: b('七剑；末剑晕 0.5 秒', '7 swords; the last stuns 0.5 s'),
    verse: b('七星北斗，剑指天枢', 'Seven stars of the Dipper; the sword points at Dubhe'),
  },
  thunder: {
    id: 'thunder', classes: ['talisman'], kind: 'chain', dmg: [16, 26, 42, 66], cd: 1.3, range: 450, scale: { elem: 1 },
    crit: 5, critX: 1.5, knock: 0, price: 32, p: { jumps: [2, 2, 3, 6], fall: 0.85, stunT4: 0.15, stunDur: 0.5 },
    text: b('连锁 2/2/3/4 次，每跳 −15%', 'Chains 2/2/3/4 times, −15% per jump'), t4: b('连锁 6 次；15% 晕 0.5 秒', 'Chains 6 times; 15% chance to stun 0.5 s'),
    verse: b('五雷轰顶', 'Five thunders overhead'),
  },
  fire: {
    id: 'fire', classes: ['talisman'], kind: 'lob', dmg: [8, 13, 21, 33], cd: 1.2, range: 380, scale: { elem: 0.8 },
    crit: 5, critX: 1.5, knock: 20, price: 28, p: { r: 80, burn: 3, burnScale: 0.5, burnDur: 3, burnStacks: [3, 3, 3, 5], spreadT4: 2 },
    text: b('抛落爆 r 80；灼烧 3 + 50% 五行/秒，3 秒，至多 3 层', 'Bursts r 80; burns 3 + 50% 五行/s for 3 s, up to 3 stacks'),
    t4: b('5 层；灼死者传灼 2 敌', '5 stacks; burning deaths spread the burn to 2 enemies'), verse: b('星星之火', 'A single spark'),
  },
  gourd: {
    id: 'gourd', classes: ['talisman', 'wine'], kind: 'lob', dmg: [12, 19, 31, 48], cd: 1.3, range: 320, scale: { elem: 0.8 },
    crit: 10, critX: 2.2, knock: 20, price: 28, p: { r: 70, drunk: 2, stagger: 1, critBurn: 3, puddleT4: 3, puddleBurn: 3 },
    text: b('溅 r 70；每击 +2 醉；敌醉踉 1 秒；暴击引燃', 'Splash r 70; +2 醉 per hit; enemies stagger 1 s; crits ignite'),
    t4: b('留火洼 3 秒（灼 3/秒）', 'Leaves a fire puddle for 3 s (burn 3/s)'), verse: b('葫芦里卖的什么药', 'What medicine is in the gourd'),
  },
  qin: {
    id: 'qin', classes: ['music'], kind: 'pulse', dmg: [8, 13, 21, 33], cd: 1.2, range: 140, scale: { elem: 1 },
    crit: 5, critX: 1.5, knock: 30, price: 32, p: { every: [4, 4, 4, 3], resX: 2, slow: 30, slowDur: 1.5, bigX: 1.5, healT4: 1 },
    text: b('音环 r 140；每第四环共鸣 ×2 并缓 30%；对精英首领 ×1.5', 'Ring r 140; every 4th is 共鸣: ×2 and slows 30%; ×1.5 vs elites and bosses'),
    t4: b('每第三环共鸣，并回 1', '共鸣 every 3rd pulse, and it heals 1'), verse: b('高山流水遇知音', 'High mountains, flowing water: a kindred ear'),
  },
  flute: {
    id: 'flute', classes: ['music'], kind: 'homing', dmg: [5, 8, 13, 20], cd: 0.6, range: 400, scale: { elem: 0.7 },
    crit: 5, critX: 1.5, knock: 0, price: 26, speed: 450, p: { charmEvery: [6, 6, 6, 4], charmDur: [2, 2, 2, 4] },
    text: b('追踪音符；每第六音惑非精英 2 秒', 'Homing notes; every 6th charms a non-elite for 2 s'), t4: b('每第四音，4 秒', 'Every 4th note, for 4 s'),
    verse: b('谁家玉笛暗飞声', 'Whose jade flute sends its hidden notes'),
  },
  brush: {
    id: 'brush', classes: ['ink'], kind: 'paint', dmg: [8, 14, 22, 36], cd: 4.0, range: 400, scale: { spirit: 2 },
    crit: 0, critX: 1.8, knock: 10, price: 30, p: { life: 10, atk: [0.7, 0.7, 0.8, 0.9], r: [30, 120, 60, 90], taunt: 1 },
    text: b('画出墨宝 10 秒：墨雀啄 / 墨鲤冲 / 墨鹤俯冲', 'Paints a creature for 10 s: sparrow / carp / crane by tier'),
    t4: b('画墨虎：每 0.9 秒扑 r 90 并嘲讽 1 秒', 'Paints the ink tiger: pounces r 90 every 0.9 s and taunts 1 s'), verse: b('神笔马良', 'Ma Liang\'s magic brush'),
  },
  inkstone: {
    id: 'inkstone', classes: ['ink'], kind: 'turret', dmg: [5, 8, 13, 20], cd: 6.0, range: 400, scale: { spirit: 1 },
    crit: 0, critX: 1.8, knock: 10, price: 28, p: { life: 8, atk: 0.8, blobs: [1, 1, 1, 2], followT4: 60 },
    text: b('足下置砚 8 秒，每 0.8 秒吐墨丸；算作墨宝', 'A turret at your feet for 8 s; an ink blob every 0.8 s; counts as a 墨宝'),
    t4: b('两丸，并随你 60 u/s', 'Fires 2 blobs and follows you at 60 u/s'), verse: b('研墨以待', 'Ink ground and waiting'),
  },
  crane: {
    id: 'crane', classes: ['ink'], kind: 'familiar', dmg: [10, 16, 26, 40], cd: 1.0, range: 450, scale: { spirit: 0.9 },
    crit: 0, critX: 1.8, knock: 20, price: 30, p: { orbit: 120, burstT4: 80 },
    text: b('常伴纸鹤（不占上限），绕身 r 120 俯冲而回', 'A permanent familiar outside the cap; circles at r 120, dives and returns'),
    t4: b('俯冲爆 r 80', 'Its dives burst for r 80'), verse: b('千纸鹤，寄相思', 'A thousand cranes carry longing'),
  },
  gobowl: {
    id: 'gobowl', classes: ['go'], kind: 'mine', dmg: [14, 23, 37, 58], cd: 1.2, range: 350, scale: { spirit: 1 },
    crit: 5, critX: 1.5, knock: 60, price: 30, p: { r: 70, chain: 120, bigX: 1.5, pullT4: 60 },
    text: b('近群落子（350 内），黑白相间；爆 r 70，120 内连爆；精英首领触发 ×1.5', 'Places a stone near the nearest cluster; blasts r 70, chaining within 120; ×1.5 when an elite or boss sets it off'),
    t4: b('爆前吸敌 60', 'Blasts pull enemies 60 u inward first'), verse: b('落子无悔', 'A stone placed is never taken back'),
  },
  moonwheel: {
    id: 'moonwheel', classes: ['moon'], kind: 'boomerang', dmg: [9, 15, 24, 38], cd: 1.1, range: 420, scale: { ranged: 0.9 },
    crit: 5, critX: 1.5, knock: 10, price: 26, speed: 700, p: { speedDmg: 50, discs: [1, 1, 1, 2] },
    text: b('回旋穿透一切；身法每 1% +1% 伤害（至多 +50%）', 'Boomerangs, piercing everything; +1% per 1% 身法 (max +50%)'),
    t4: b('两轮背向而出', 'Two discs, thrown in opposite directions'), verse: b('月轮穷天，清辉满地', 'The moon wheel crosses the sky'),
  },
  moonmirror: {
    id: 'moonmirror', classes: ['moon', 'talisman'], kind: 'beam', dmg: [12, 19, 31, 48], cd: 1.2, range: 460, scale: { elem: 0.9 },
    crit: 5, critX: 1.5, knock: 0, price: 34, p: { dodgeWin: 2, fork: [1, 1, 1, 3], forkDeg: 15 },
    text: b('月光一线，穿透一切；闪避后 2 秒内多发一束', 'An instant beam through everything; +1 beam for 2 s after each dodge'),
    t4: b('光束分三（±15°）', 'The beam forks into 3 at ±15°'), verse: b('广寒清辉照人间', 'The cold palace\'s light on the world'),
  },
};

/** Class set bonuses at 2 / 4 / 6 weapons (GDD §8.1). Flags are rule switches the engine reads. */
export const SETS: Readonly<Record<WClass, ClassSetDef>> = {
  sword: { cls: 'sword', tiers: [{ stats: { crit: 5 } }, { stats: { crit: 10 } }, { stats: { crit: 15 }, flags: ['swordPierce'] }] },
  heavy: { cls: 'heavy', tiers: [{ stats: { melee: 2 } }, { stats: { melee: 4, armor: 1 } }, { stats: { melee: 6, armor: 2, area: 15 } }] },
  fist: { cls: 'fist', tiers: [{ stats: { dodge: 3 } }, { stats: { dodge: 6 } }, { stats: { dodge: 10, aspd: 10 } }] },
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
