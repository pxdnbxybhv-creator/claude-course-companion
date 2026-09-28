// 水月幻镜 · the shared glossary: one word per idea on every screen (d-text §3, reconciled with the
// 人物 panel and the tutorial in mirror3/CONTRACTS.md). Every stat, status, class, tier and game term
// has a short label (`zh` / `en`, what a button, tile or row shows) and one plain line (`plainZh` /
// `plainEn`, what a tap on it explains). The shop, the 人物 panel, the level-up cards, the codex, the
// HUD marks' aria labels and the tutorial's coach lines all read their words from here.
//
// Numbers inside the plain lines are read from data (F, CLAMP, WEAPONS), never typed, so a balance pass
// can't leave the text behind. Pure data: no DOM, no logic imports (logic imports data, not the reverse).
import type { StatId, StatusKind, WClass } from '../types';
import { CLAMP, F } from './stats';
import { WEAPONS } from './weapons';

/** What a glossary entry names. */
export type GlossKind = 'stat' | 'status' | 'class' | 'tier' | 'term';

/** Game terms that are not a StatId, a StatusKind or a class (button labels included). */
export type TermId =
  // the loop in a run
  | 'wave' | 'boss' | 'elite' | 'horde' | 'moon' | 'store' | 'xp' | 'level' | 'card' | 'cooldown' | 'aim' | 'dps'
  // the shop and its buttons
  | 'shop' | 'reroll' | 'lock' | 'merge' | 'sell' | 'next' | 'go' | 'leave' | 'pause'
  // gear
  | 'tier' | 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'class' | 'set' | 'curseItem'
  // the companion
  | 'panel' | 'skill' | 'passive' | 'cost' | 'alt' | 'mastery'
  // things weapons make, and the HUD marks
  | 'summon' | 'flyingSword' | 'stone' | 'drunk' | 'lives' | 'moonPhase' | 'sleeve'
  // effects that are not statuses
  | 'shield' | 'taunt' | 'bounce' | 'invuln'
  // between waves
  | 'crate' | 'keep' | 'melt' | 'heart'
  // a run and the account
  | 'run' | 'down' | 'clear' | 'diff' | 'vow' | 'heat' | 'mutator' | 'affix' | 'dust' | 'heartMirror' | 'tutorial';

/** A weapon class as a glossary key: 'cls:sword'. */
export type ClassKey = `cls:${WClass}`;
/** Every glossary key. */
export type GlossId = StatId | StatusKind | ClassKey | TermId;

export interface Term {
  /** The label: what a button, tab, tile, row or tag shows. */
  readonly zh: string;
  readonly en: string;
  /** One plain sentence: what a tap on the label explains. */
  readonly plainZh: string;
  readonly plainEn: string;
  /** A single brush glyph (level-up cards, seals). Absent: the UI shows the label only. */
  readonly icon?: string;
  readonly kind: GlossKind;
}

/**
 * Length limits (code points, punctuation and spaces included), from the descriptions style guide
 * (d-text §2.5) and the tutorial's line caps (d-tutorial §4.3): a stat or status line is a panel row
 * hint; a term line may be a coach line in a wave.
 */
export const GLOSS_LIMITS = {
  label: { zh: 5, en: 22 },
  stat: { zh: 30, en: 70 },
  term: { zh: 44, en: 120 },
} as const;

// ───────────────────────────────────────────── numbers read from data
const pct = (x: number) => Math.round(x * 100);
/** How much less damage `a` armour lets through, in %, as logic armorReduction computes it. */
const armourCut = (a: number) => Math.round((1 - F.armorK / (F.armorK + a)) * 100);
const critXs = Object.values(WEAPONS).map((w) => w.critX).filter((x) => x > 0);
const CRIT_X_MIN = Math.min(...critXs);
const CRIT_X_MAX = Math.max(...critXs);
const fracZh = (x: number) => (x === 0.25 ? '四分之一' : x === 0.5 ? '一半' : `${pct(x)}%`);
const fracEn = (x: number) => (x === 0.25 ? 'a quarter' : x === 0.5 ? 'half' : `${pct(x)}%`);

const g = (kind: GlossKind, zh: string, en: string, plainZh: string, plainEn: string, icon?: string): Term =>
  icon === undefined ? { zh, en, plainZh, plainEn, kind } : { zh, en, plainZh, plainEn, icon, kind };

// ───────────────────────────────────────────── stats (26)
const STATS: Record<StatId, Term> = {
  hp: g('stat', '气血', 'HP',
    '能挨多少打；掉光就倒下。每升一级，上限 +1。',
    'How much damage you can take; at 0 you go down. +1 every level.', '血'),
  regen: g('stat', '回血', 'HP Regen',
    `每点每秒回 ${F.regenPerPoint} 点血，${1 / F.regenPerPoint} 点就是每秒回 1 点。`,
    `Each point heals ${F.regenPerPoint} HP a second (${1 / F.regenPerPoint} points = 1 HP a second).`, '回'),
  steal: g('stat', '吸血', 'Lifesteal',
    '兵器打中时有这个几率回 1 点血；出手快的兵器几率低一些。',
    'Each weapon hit has this chance to heal 1 HP (less for fast weapons).', '吸'),
  dmg: g('stat', '伤害', 'Damage',
    '你打出的所有伤害，都按这个百分比加减。',
    'All the damage you deal goes up or down by this percentage.', '伤'),
  melee: g('stat', '近战', 'Melee',
    '受近战加成的兵器，每一下打得更痛；加多少看兵器。',
    'Weapons that scale with Melee hit harder (each at its own rate).', '近'),
  ranged: g('stat', '远程', 'Ranged',
    '受远程加成的兵器（弓、镖、飞剑等）每一下打得更痛。',
    'Bows, darts, flying swords and other Ranged weapons hit harder.', '远'),
  elem: g('stat', '法术', 'Elemental',
    '受法术加成的兵器（符、琴笛、镜子等）每一下打得更痛。',
    'Talismans, music, mirrors and other Elemental weapons hit harder.', '法'),
  spirit: g('stat', '造物', 'Craft',
    '画出来、摆下的东西（墨宝、棋子、砚台等）打得更痛。',
    'What you paint or place (ink summons, stones, inkstone) hits harder.', '造'),
  aspd: g('stat', '攻速', 'Attack speed',
    '出手更快，+100% 就快一倍；墨宝、砚台、棋子只算一半。',
    'Attacks come faster; +100% is twice as often. Ink and stones get half.', '速'),
  crit: g('stat', '暴击率', 'Crit chance',
    '打出暴击的几率，加在兵器自带的几率上。',
    "Chance to crit, added to the weapon's own chance.", '暴'),
  critDmg: g('stat', '暴击倍数', 'Crit multiplier',
    `暴击时打几倍：兵器自带 ${CRIT_X_MIN}～${CRIT_X_MAX} 倍，这里再往上加。`,
    `How hard a crit hits: weapons crit ×${CRIT_X_MIN}–×${CRIT_X_MAX}; this adds on top.`, '倍'),
  range: g('stat', '射程', 'Range',
    '打得更远：远程兵器全加，近战加一半，绕身的加四分之一。',
    'Reach: ranged weapons get it all, melee half, orbiting a quarter.', '射'),
  armor: g('stat', '护甲', 'Armour',
    `挨打少掉血：5 点少 ${armourCut(5)}%，15 点少 ${armourCut(15)}%。`,
    `Cuts damage taken: 5 = −${armourCut(5)}%, 15 = −${armourCut(15)}%; below 0 you take more.`, '甲'),
  dodge: g('stat', '闪避', 'Dodge',
    `完全躲开一次攻击的几率；一般最多 ${F.dodgeCap}%。`,
    `Chance to avoid a hit completely; usually capped at ${F.dodgeCap}%.`, '避'),
  speed: g('stat', '移速', 'Move speed',
    `走得更快，敌人更难追上（最低 −${-CLAMP.speedMin}%，最高 +${CLAMP.speedMax}%）。`,
    `Move faster so enemies can't catch you (from −${-CLAMP.speedMin}% to +${CLAMP.speedMax}%).`, '移'),
  luck: g('stat', '福缘', 'Luck',
    '镜奁、掉落更多，商店和升级卡更常出好货。',
    'More caskets and drops, and better shop and level-up rolls.', '福'),
  harvest: g('stat', '收成', 'Harvest',
    `每重打完白拿这么多月华和经验；之后每重自己涨 ${pct(F.harvestGrow - 1)}%。`,
    `Free moonlight and XP after every wave; it grows ${pct(F.harvestGrow - 1)}% a wave.`, '收'),
  curse: g('stat', '劫数', 'Curse',
    `每点：敌人血和伤害 +${pct(F.curseEnemy)}%，你伤害 +${F.curseDmg}%，月华 +${pct(F.curseMoon)}%。`,
    `Per point: enemies +${pct(F.curseEnemy)}% HP and damage; you +${F.curseDmg}% damage, +${pct(F.curseMoon)}% moonlight.`, '劫'),
  pickup: g('stat', '拾取范围', 'Pickup range',
    '离多远就能把月华吸过来。',
    'How far away moonlight flies to you.', '拾'),
  summonCap: g('stat', '墨宝上限', 'Ink summon limit',
    `同时能有几只墨宝在场（最多 ${CLAMP.summonCapMax}）；纸鹤不算。`,
    `How many ink summons at once (max ${CLAMP.summonCapMax}); the paper crane doesn't count.`, '墨'),
  swords: g('stat', '飞剑数', 'Extra swords',
    `每件飞剑类兵器多放几把剑，多出来的每把打 ${pct(F.swordExtra)}%。`,
    `Extra swords per flying-sword weapon; each extra deals ${pct(F.swordExtra)}%.`, '剑'),
  stones: g('stat', '棋子上限', 'Stone limit',
    `地上同时能留几颗棋子（最多 ${CLAMP.stonesMax}）；满了最早那颗先消失。`,
    `How many stones can sit on the board (max ${CLAMP.stonesMax}); the oldest goes first.`, '棋'),
  knock: g('stat', '击退', 'Knockback',
    `打中时把敌人推得更远；精英只退 ${pct(1 - F.resist.elite)}%，首领推不动。`,
    `Hits push enemies farther; elites take ${pct(1 - F.resist.elite)}%, bosses don't budge.`, '退'),
  area: g('stat', '范围', 'Area',
    '爆炸、横扫、圆圈这类一打一片的招式变大。',
    'Bigger blasts, sweeps and circles.', '围'),
  pierce: g('stat', '穿透', 'Pierce',
    '子弹和刺击打中一个后，还能再穿过几个敌人。',
    'Shots and thrusts go through this many more enemies.', '穿'),
  heal: g('stat', '治疗效果', 'Healing',
    '回血、吸血和各种治疗，都按这个百分比加减。',
    'All your healing goes up or down by this percentage.', '疗'),
};

// ───────────────────────────────────────────── statuses on enemies (StatusKind)
const STATUSES: Record<StatusKind, Term> = {
  burn: g('status', '燃烧', 'Burn',
    '着火后每秒掉血；叠的层数越多掉得越快，护甲挡不住。',
    'Takes damage every second; more stacks burn faster. Ignores armour.'),
  bleed: g('status', '流血', 'Bleed',
    '伤口每秒掉血，受近战加成；也能叠好几层。',
    'Loses HP every second (scales with Melee); stacks.'),
  slow: g('status', '减速', 'Slow',
    '走得变慢；只算最强的一次减速，首领只慢一半。',
    'Moves slower; only the strongest slow counts, bosses take half.'),
  root: g('status', '定住', 'Root',
    '原地走不动；精英时间减半，首领不受影响。',
    "Can't move; half as long on elites, bosses are immune."),
  stun: g('status', '晕住', 'Stun',
    '什么都做不了；精英时间减半，首领不受影响。',
    "Can't do anything; half as long on elites, bosses are immune."),
  charm: g('status', '迷惑', 'Charm',
    '小怪暂时变成你这边的，帮你打别的敌人；精英和首领不会。',
    'A small enemy fights for you for a while; not elites or bosses.'),
  shred: g('status', '破甲', 'Shred',
    '敌人护甲变薄，打它更痛；过几秒恢复。',
    'Lowers enemy armour for a few seconds, so hits land harder.'),
  vuln: g('status', '易伤', 'Vulnerable',
    '被打中的敌人会多受一些伤害，多多少写在招式里。',
    'Takes extra damage; the amount is on the skill or item.'),
  stagger: g('status', '站不稳', 'Stagger',
    '东倒西歪，走不成直线；首领不受影响。',
    'Staggers off course; bosses are immune.'),
};

// ───────────────────────────────────────────── weapon classes (renamed: 仙剑 → 飞剑, 福 → 招财)
const CLASSES: Record<ClassKey, Term> = {
  'cls:sword': g('class', '剑', 'Sword', '近身刺、砍的剑。', 'Blades that thrust and slash up close.'),
  'cls:heavy': g('class', '重器', 'Heavy', '又慢又重，一下打一片。', 'Slow and heavy; one swing hits a crowd.'),
  'cls:fist': g('class', '拳爪', 'Fist', '贴身快打。', 'Fast blows up close.'),
  'cls:hidden': g('class', '暗器', 'Hidden weapon', '快速射出的小东西，比如飞镖。', 'Small things thrown fast, like darts.'),
  'cls:bow': g('class', '弓弩', 'Bow', '远远地射箭。', 'Arrows from far away.'),
  'cls:fortune': g('class', '招财', 'Fortune', '边打边生财。', 'Make money while you fight.'),
  'cls:flying': g('class', '飞剑', 'Flying sword', '放出会飞的剑。', 'Weapons that send out flying swords.'),
  'cls:talisman': g('class', '符箓', 'Talisman', '雷、火这类法术符。', 'Thunder, fire and other spell charms.'),
  'cls:wine': g('class', '酒', 'Wine', '越喝越准的醉兵器。', 'Drunken weapons that crit more as you drink.'),
  'cls:music': g('class', '乐器', 'Music', '琴、笛的音波。', 'Sound waves from zither and flute.'),
  'cls:ink': g('class', '墨宝', 'Ink', '画出帮手替你打。', 'Paint helpers that fight for you.'),
  'cls:go': g('class', '棋', 'Go', '落下棋子布阵。', 'Lay go stones on the ground.'),
  'cls:moon': g('class', '月', 'Moon', '月光与闪避。', 'Moonlight and dodging.'),
};

// ───────────────────────────────────────────── game terms
const TERMS: Record<TermId, Term> = {
  wave: g('term', '重', 'Wave',
    '一波敌人叫一「重」。时间走完就过了；首领那一重，打倒首领才算过。',
    'A wave of enemies. Survive until the timer runs out; on a boss wave, beat the boss.', '重'),
  boss: g('term', '首领', 'Boss',
    '每 10 重来一次的大怪。那一重不计时，打倒它才算过。',
    'A big foe every 10th wave. That wave has no timer: it ends when the boss falls.', '首'),
  elite: g('term', '精英', 'Elite',
    '身上有金印的强敌，比小怪硬得多，打倒一定掉一个镜奁。',
    'A tough enemy marked with a gold seal; beating it always drops a casket.', '精'),
  horde: g('term', '群魔之重', 'Horde wave',
    '敌人特别多的一重，不过每个都更脆。',
    'A wave with far more enemies, each one weaker.'),
  moon: g('term', '月华', 'Moonlight',
    '打倒敌人掉下的月光。既是钱（在商店花），也是经验（攒够就升级）。',
    "Dropped by enemies. It's both money (spend it in the shop) and experience (fill the bar to level up).", '月'),
  store: g('term', '蓄月', 'Stored moonlight',
    '上一重没捡完的月华先存着，下一重每捡一次多给 1 点，直到用完。',
    'Moonlight left on the ground is saved; each pickup next wave adds 1 more from it until it runs out.'),
  xp: g('term', '经验', 'XP',
    '捡月华就涨经验，经验条满了就升一级。',
    "Picking up moonlight fills the XP bar; when it's full you level up."),
  level: g('term', '升级', 'Level up',
    '升一级，气血上限 +1；这一重打完，还能挑一张加成卡。',
    '+1 max HP, and when the wave ends you pick a bonus card.', '升'),
  card: g('term', '加成卡', 'Bonus card',
    '升级后挑一张，加的属性这一局一直有效。',
    'Pick one after a level-up; its bonus lasts the whole run.'),
  cooldown: g('term', '冷却', 'Cooldown',
    '两次出手之间要等的时间。',
    'The wait between two uses.'),
  aim: g('term', '自动瞄准', 'Auto-aim',
    '兵器自己挑敌人打；设置里可以改成自己瞄准。',
    'Weapons pick their own targets; you can switch to aiming yourself in Settings.'),
  dps: g('term', '每秒伤害', 'Damage per second',
    '粗算：一下打多少（算上暴击）乘上一秒打几下，只算打中一个敌人。',
    'Rough: one hit (with crits) divided by the time between hits, against one enemy.'),
  shop: g('term', '商店', 'Shop',
    '每打完一重就来这里：用月华买兵器和道具。',
    'After every wave: spend moonlight on weapons and items.'),
  reroll: g('term', '刷新', 'Reroll',
    '花一点月华，把没锁的货换一批。',
    'Pay a little moonlight to swap the unlocked goods for new ones.'),
  lock: g('term', '锁', 'Lock',
    '锁住的货会留到下一次商店。',
    'A locked item stays for the next shop.', '锁'),
  merge: g('term', '合铸', 'Merge',
    '两把同名、同品阶的兵器，合成一把高一阶的。',
    'Two identical weapons of the same tier become one of the next tier.'),
  sell: g('term', '卖', 'Sell',
    `卖掉不要的兵器，换回它现价的${fracZh(F.sellFrac)}。`,
    `Sell a weapon you don't need for ${fracEn(F.sellFrac)} of its price now.`, '卖'),
  next: g('term', '下一重', 'Next wave',
    '离开商店，开始打下一重。',
    'Leave the shop and start the next wave.'),
  go: g('term', '入此重', 'Begin',
    '开始这一重。',
    'Start this wave.'),
  leave: g('term', '暂离', 'Step away',
    '存档离开，回来接着打，不用再交钱；打到一半离开，这一重要重打。',
    "Save and leave; come back later for free. Leave mid-wave and that wave replays."),
  pause: g('term', '暂停', 'Pause',
    '随时停下，看看人物，或者改设置。',
    'Stop any time to look at your character or change settings.'),
  tier: g('term', '品阶', 'Tier',
    '凡品、灵品、仙品、神品，一档比一档强。兵器靠合铸升阶，神品兵器多一个本事。',
    'Common, Spirit, Immortal, Divine: each stronger than the last. Weapons tier up by merging; Divine ones gain a power.'),
  tier1: g('term', '凡品', 'Common', '最常见的一档。', 'The most common tier.', '凡'),
  tier2: g('term', '灵品', 'Spirit', '第二档，比凡品强。', 'The second tier, stronger than Common.', '灵'),
  tier3: g('term', '仙品', 'Immortal', '第三档，少见。', 'The third tier; rare.', '仙'),
  tier4: g('term', '神品', 'Divine', '最高一档；神品兵器多一个本事。', 'The top tier; Divine weapons gain an extra power.', '神'),
  class: g('term', '类别', 'Class',
    '每件兵器有一两个类别（剑、重器……），写在名字下面。',
    'Every weapon has one or two classes (Sword, Heavy…), shown under its name.'),
  set: g('term', '套装', 'Set bonus',
    '同一类兵器带够 2、4、6 把，各有一档加成；同样的兵器两把算两把。',
    'Carry 2, 4 or 6 weapons of one class for a bonus at each step; two of the same count as two.'),
  curseItem: g('term', '劫类道具', 'Curse item',
    '会加劫数的道具：你变强，敌人也变强。',
    'Items that add Curse: you get stronger, and so do the enemies.'),
  panel: g('term', '人物', 'Character',
    '你的同伴、保命的几项数、镜技，还有每把兵器每秒打多少，都在这里。',
    "Your companion, survival numbers, skill, and each weapon's damage per second.", '人'),
  skill: g('term', '镜技', 'Skill',
    '同伴自己的大招：点一下自动放，按住拖动能自己瞄准；放完要等冷却。',
    "Your companion's special move: tap to cast, or drag to aim; then it recharges.", '技'),
  passive: g('term', '天性', 'Nature',
    '同伴天生的长处，每一局都有。',
    "Your companion's built-in strength, in every run.", '性'),
  cost: g('term', '代价', 'Cost',
    '天性换来的短处。',
    'The weakness that comes with the nature.'),
  alt: g('term', '别传', 'Alternate skill',
    '心得够高后解开的另一个镜技（暂未开放）。',
    'A second skill unlocked by mastery (coming later).'),
  mastery: g('term', '心得', 'Mastery',
    '用同一个同伴打得越多，心得越高，会解开新东西。',
    'The more runs with one companion, the higher its mastery, and the more it unlocks.'),
  summon: g('term', '墨宝', 'Ink summon',
    '画出来替你打的小帮手（神笔、墨竹、墨鹤……），同时在场的数量有上限。',
    'Painted helpers that fight for you; only so many can be out at once.'),
  flyingSword: g('term', '飞剑', 'Flying sword',
    '飞剑类兵器放出的剑：会飞出去、绕着你转，或从天上落下。',
    'Swords from flying-sword weapons: they fly out, circle you, or fall from the sky.'),
  stone: g('term', '棋子', 'Stone',
    '棋罐落在地上的棋子，敌人一碰就炸开。',
    'Go stones laid on the ground; they blast when an enemy touches them.'),
  drunk: g('term', '醉意', 'Drunk',
    `每 10 点醉意暴击率 +${F.drunk.critPer10}%（最多 +${F.drunk.critMax}%）；醉满 ${F.drunk.cap} 时暴击更狠，但瞄准会晃。`,
    `Every 10 Drunk: +${F.drunk.critPer10}% crit (max +${F.drunk.critMax}%). At ${F.drunk.cap} your crits hit harder, but your aim sways.`, '醉'),
  lives: g('term', '九命', 'Lives',
    '大橘的命：挨了致命一击不死，剩 1 点血（每重最多一次）。',
    'Big Ginger survives a lethal hit with 1 HP (at most once a wave).', '命'),
  moonPhase: g('term', '月相', 'Moon phase',
    '嫦娥的月亮会圆缺轮转：满月时伤害更高，新月时更会躲。',
    "Chang'e's moon waxes and wanes: more damage at full moon, more dodge at new moon."),
  sleeve: g('term', '袖中铜钱', 'Sleeve coins',
    '这一重捡到的铜钱，打完这一重才进钱袋；倒下就沉掉。',
    'Coins picked up this wave reach your purse when the wave ends; going down loses them.'),
  shield: g('term', '护盾', 'Shield',
    '先替你挡伤害，挡完才掉血。',
    'Soaks up damage before your HP does.', '护'),
  taunt: g('term', '引怪', 'Taunt',
    '把附近的敌人都引到它身上。',
    'Draws nearby enemies to itself.'),
  bounce: g('term', '弹射', 'Bounce',
    '打中一个后，弹到旁边的敌人身上再打一次。',
    'After a hit, the shot jumps to another enemy nearby.'),
  invuln: g('term', '无敌', 'Untouchable',
    '短时间里不会受伤。',
    'Takes no damage for a moment.'),
  crate: g('term', '镜奁', 'Casket',
    '打倒精英一定掉，小怪偶尔也掉。这一重打完再打开：留下道具，或换成月华。',
    'Elites always drop one, other enemies sometimes. Open it after the wave: keep the item or turn it into moonlight.', '奁'),
  keep: g('term', '收下', 'Keep',
    '把镜奁里的道具留着。',
    'Keep the item from the casket.'),
  melt: g('term', '换月华', 'Melt',
    '不要这件道具，换成一些月华。',
    "Don't keep the item; turn it into moonlight."),
  heart: g('term', '镜心', 'Mirror heart',
    '打倒首领后得到：从几件仙品、神品道具里挑一件。',
    'Beat a boss to get one: pick an Immortal or Divine item.', '心'),
  run: g('term', '一局', 'Run',
    '从入镜一直到倒下算一局；中途可以暂离，回来接着打。',
    'From entering the mirror until you go down; you can step away and come back.'),
  down: g('term', '倒下', 'Go down',
    '气血掉光就会倒下；倒下后这一局结算（每局可以花钱复起一次）。',
    'At 0 HP you go down and the run is settled (once a run you may pay to get back up).'),
  clear: g('term', '照破', 'Clear',
    '打过第 30 重叫照破；之后还能接着往下打。',
    'Beating wave 30. You can keep going after that.'),
  diff: g('term', '镜境', 'Difficulty',
    '难度。越难，敌人越强，拿到的镜钱也越多。',
    'Difficulty: harder enemies, more coins.'),
  vow: g('term', '镜誓', 'Vow',
    '自己加上的难度条件，每条都让誓火更高。',
    'A handicap you choose; each one raises the heat.'),
  heat: g('term', '誓火', 'Heat',
    '立下的镜誓越多，誓火越高：更难，但镜钱和镜屑更多。',
    'The more vows you take, the higher the heat: harder, but more coins and shards.', '誓'),
  mutator: g('term', '镜蚀', 'Twist',
    '这一局额外的怪规则，比如敌人更快、死后裂开。',
    'An extra rule for the run, like faster enemies or enemies that split.'),
  affix: g('term', '镜印', 'Elite trait',
    '精英身上的特殊本事，比如护甲更厚、会叫小怪来帮忙。',
    "An elite's special trait, like thicker armour or calling helpers."),
  dust: g('term', '镜屑', 'Shards',
    '每局结束都会得到，用来点亮心镜。',
    'Earned at the end of every run; spend them on the heart mirror.'),
  heartMirror: g('term', '心镜', 'Heart mirror',
    '用镜屑换的永久加成，每局一开始就有。',
    'Permanent boons bought with shards; they apply from the start of every run.'),
  tutorial: g('term', '教程', 'Tutorial',
    '三四分钟的练习局：不花钱，不记成绩。',
    'A three-or-four-minute practice run: free, and nothing is recorded.', '初'),
};

/** Every word the mirror shows, keyed by stat, status, class ('cls:…') or term. */
export const GLOSSARY: Readonly<Record<GlossId, Term>> = { ...STATS, ...STATUSES, ...CLASSES, ...TERMS };

/** Every glossary key, in the order above (stats first, in sheet order). */
export const GLOSS_IDS = Object.keys(GLOSSARY) as readonly GlossId[];

export const isGlossId = (s: string): s is GlossId => Object.prototype.hasOwnProperty.call(GLOSSARY, s);

/** The entry for a key; an unknown key (a runtime string) falls back to the key itself, never throws. */
export function termOf(id: GlossId): Term {
  return GLOSSARY[id] ?? { zh: String(id), en: String(id), plainZh: '', plainEn: '', kind: 'term' };
}
/** The class key of a weapon class. */
export const clsKey = (c: WClass): ClassKey => `cls:${c}`;

type TFn = (zh: string, en: string) => string;
/** The label in the current language: termName('reroll', t) → 「刷新」 / "Reroll". */
export const termName = (id: GlossId, t: TFn): string => { const x = termOf(id); return t(x.zh, x.en); };
/** The plain line in the current language. */
export const termLine = (id: GlossId, t: TFn): string => { const x = termOf(id); return t(x.plainZh, x.plainEn); };

// ───────────────────────────────────────────── how stats are shown (shared by the 人物 panel, level-up cards, items)

/**
 * 'pct': 「+10%」 · 'flat': 「+30」 (never a unit: no `u`) · 'mult': the stored value / 100 with one or two
 * decimals, 「+0.3」 (暴击倍数 is stored as 30 but read as +0.3 of a crit multiplier).
 */
export type StatFmt = 'pct' | 'flat' | 'mult';
export const STAT_FMT: Readonly<Record<StatId, StatFmt>> = {
  hp: 'flat', regen: 'flat', steal: 'pct', dmg: 'pct', melee: 'flat', ranged: 'flat', elem: 'flat', spirit: 'flat', aspd: 'pct',
  crit: 'pct', critDmg: 'mult', range: 'flat', armor: 'flat', dodge: 'pct', speed: 'pct', luck: 'flat', harvest: 'flat', curse: 'flat',
  pickup: 'pct', summonCap: 'flat', swords: 'flat', stones: 'flat', knock: 'flat', area: 'pct', pierce: 'flat', heal: 'pct',
};

/**
 * The level-up card's hint under the stat name (≤ 10 zh chars; a phone has no hover title): what the
 * stat does, in a few words. The armour card also keeps its live 「少受 x% → y%」 line.
 */
export const CARD_HINT: Readonly<Record<StatId, { readonly zh: string; readonly en: string }>> = {
  hp: { zh: '能多挨几下', en: 'take more hits' },
  armor: { zh: '每下挨打都轻些', en: 'every hit hurts less' },
  dodge: { zh: '更常躲开攻击', en: 'dodge more hits' },
  speed: { zh: '走得更快', en: 'move faster' },
  regen: { zh: '每秒慢慢回血', en: 'slow healing over time' },
  steal: { zh: '打中时可能回血', en: 'hits may heal you' },
  heal: { zh: '所有回血更多', en: 'all healing up' },
  dmg: { zh: '所有伤害都更高', en: 'all your damage up' },
  melee: { zh: '贴身的兵器更痛', en: 'close-in weapons hit harder' },
  ranged: { zh: '弓、镖、飞剑更痛', en: 'bows, darts, flying swords' },
  elem: { zh: '符、琴笛、镜子更痛', en: 'charms, music, mirrors' },
  spirit: { zh: '墨宝、棋子更痛', en: 'ink and stones hit harder' },
  aspd: { zh: '出手更快', en: 'attack more often' },
  crit: { zh: '更常打出暴击', en: 'crit more often' },
  critDmg: { zh: '暴击打得更狠', en: 'crits hit harder' },
  range: { zh: '打得更远', en: 'reach farther' },
  area: { zh: '爆炸、横扫更大', en: 'bigger blasts and sweeps' },
  pierce: { zh: '多穿过几个敌人', en: 'shots pass through more' },
  knock: { zh: '把敌人推得更远', en: 'push enemies farther' },
  swords: { zh: '飞剑多放几把', en: 'more flying swords' },
  stones: { zh: '地上多留棋子', en: 'more stones on the board' },
  summonCap: { zh: '墨宝能多几只', en: 'more ink summons out' },
  luck: { zh: '掉落和好货更多', en: 'more drops, better goods' },
  harvest: { zh: '每重白拿月华', en: 'free moonlight each wave' },
  pickup: { zh: '月华从更远处飞来', en: 'grab moonlight from afar' },
  curse: { zh: '敌人和你都变强', en: 'enemies and you grow stronger' },
};

/** The 人物 panel's grouping: four body tiles, then five groups of rows (d-panel §3.2–3.3). */
export type StatGroup = 'body' | 'attack' | 'scaling' | 'reach' | 'sustain' | 'gain';
export interface StatGroupDef { readonly id: StatGroup; readonly zh: string; readonly en: string; readonly plainZh: string; readonly plainEn: string; readonly stats: readonly StatId[] }
export const STAT_GROUPS: readonly StatGroupDef[] = [
  { id: 'body', zh: '身板', en: 'Body', plainZh: '能挨多少、躲多少、跑多快。', plainEn: 'How much you can take, dodge and outrun.', stats: ['hp', 'armor', 'dodge', 'speed'] },
  { id: 'attack', zh: '出手', en: 'Offence', plainZh: '打得多痛、多快。', plainEn: 'How hard and how often you hit.', stats: ['dmg', 'aspd', 'crit', 'critDmg'] },
  { id: 'scaling', zh: '兵器加成', en: 'Weapon bonuses', plainZh: '兵器受哪项加成，哪项就让它更痛。', plainEn: 'Each weapon hits harder with the stats it scales with.', stats: ['melee', 'ranged', 'elem', 'spirit'] },
  { id: 'reach', zh: '远近大小', en: 'Reach', plainZh: '打得多远、多大一片。', plainEn: 'How far and how wide you hit.', stats: ['range', 'area', 'pierce', 'knock', 'swords', 'stones', 'summonCap'] },
  { id: 'sustain', zh: '回复', en: 'Recovery', plainZh: '怎么把血回来。', plainEn: 'How you get HP back.', stats: ['regen', 'steal', 'heal'] },
  { id: 'gain', zh: '收获', en: 'Gains', plainZh: '钱、运气，和劫数。', plainEn: 'Money, luck and curse.', stats: ['luck', 'harvest', 'pickup', 'curse'] },
];
/** The group a stat sits in. */
export function statGroupOf(id: StatId): StatGroup {
  for (const gr of STAT_GROUPS) if (gr.stats.includes(id)) return gr.id;
  return 'attack';
}
