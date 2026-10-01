// 水月幻镜 · m8 · the 数值表's words (sandbox.md §4.4, §10.3): a label pair for the commonest field keys, the
// commonest `p.*` keys and the F constants ask A turns. Any key missing here shows raw, with the entity's own
// describe line beside it. Lanes may send more pairs by CR (cr/<lane>-S.md). SANDBOX owns it.
import { DIFF_REG, named } from '../../ids';
import { STAT_IDS } from '../../data';
import { tableOf, type Seg } from '../../logic';
import { CLASS_NAMES, statName, TIER_EN, TIER_ZH, type T } from '../text';
import type { StatId } from '../../types';

type Pair = readonly [string, string];
/** Field keys (the rows of WEAPONS, MONSTERS, ITEMS, COMPANIONS …). */
export const FIELD: Readonly<Record<string, Pair>> = {
  dmg: ['伤害', 'Damage'], price: ['底价', 'Base price'], max: ['可叠上限', 'Stack limit'], speed: ['速度', 'Speed'], tier: ['品质', 'Tier'],
  hp: ['气血', 'HP'], from: ['从第几重起', 'From wave'], armor: ['护甲', 'Armour'], cd: ['冷却（秒）', 'Cooldown (s)'], every: ['每隔', 'Every'],
  tele: ['预警（秒）', 'Telegraph (s)'], at: ['时刻', 'At'], crit: ['暴击率 %', 'Crit %'], n: ['数量', 'Count'], range: ['攻击距离', 'Range'],
  r: ['半径', 'Radius'], cost: ['威胁点', 'Threat cost'], pack: ['成群', 'Pack size'], weight: ['出现权重', 'Weight'], resist: ['抗击退', 'Knockback resist'],
  dodge: ['闪避', 'Dodge'], knock: ['击退', 'Knockback'], critX: ['暴击倍数', 'Crit multiplier'], v: ['数值', 'Value'], aspd: ['攻速', 'Attack speed'],
  costs: ['每阶镜屑', 'Shards a rank'], dodgeCap: ['闪避上限', 'Dodge cap'], pct: ['百分比', 'Percent'], slots: ['兵器格', 'Weapon slots'],
  hitbox: ['身形', 'Hitbox'], per: ['每阶', 'Per rank'], wave: ['出场重数', 'Wave'], reach: ['施放距离', 'Reach'], dur: ['持续（秒）', 'Duration (s)'],
  K: ['血量系数', 'HP constant'], contact: ['碰撞伤害', 'Contact damage'], ranks: ['阶数', 'Ranks'], heat: ['劫火', 'Heat'], pay: ['结算倍数', 'Pay ×'],
  base: ['基础', 'Base'], x: ['倍数', 'Multiplier'], curse: ['劫数', 'Curse'], enrageAt: ['狂暴时刻', 'Enrage at'], life: ['存在（秒）', 'Lifetime (s)'],
  chance: ['几率', 'Chance'], cap: ['上限', 'Cap'], shotSpeed: ['弹速', 'Shot speed'], hpX: ['血量 ×', 'HP ×'], spd: ['速度 ×', 'Speed ×'],
  slope: ['每重增长', 'Growth a wave'], grow: ['增长', 'Growth'], below: ['低于', 'Below'], bigX: ['大倍数', 'Big multiplier'], perSec: ['每秒上限', 'A second'],
  capPerSec: ['每秒上限', 'Cap a second'], stack: ['层数上限', 'Stacks'], index: ['序号', 'Index'], pair: ['第几对', 'Pair'], moonTiers: ['月华分档', 'Moon tiers'],
  // cr/I-S.md (ITEMS' 26)
  perWorth: ['每点月华加成 %', 'Per point of worth %'], maxX: ['最大倍数', 'Max multiplier'], bossPct: ['首领每次上限 %', 'Boss cap a burst %'],
  bossPerSec: ['首领每秒次数', 'Boss bursts a second'], eliteAffix: ['精英加镜印', 'Extra elite marks'], eliteCrates: ['精英加镜奁', 'Extra elite caskets'],
  eliteMoonPct: ['精英月华 +%', 'Elite moonlight +%'], ofHit: ['按这一下的 %', '% of the hit'], bossV: ['首领数值', 'Boss value'], after: ['站定（秒）', 'Stand still (s)'],
  moveX: ['走路 ×', 'Walking ×'], near: ['近处', 'Near'], far: ['远处', 'Far'], hold: ['停留（秒）', 'Hold (s)'], ring: ['圈宽', 'Ring'],
  // the structure words of the tables (boss scripts, item effects, set tiers …)
  phases: ['阶段', 'Phase'], script: ['招式', 'Move'], fx: ['效果', 'Effect'], tiers: ['档', 'Tier'], scale: ['加成来源', 'Scales with'],
  unlock: ['解锁', 'Unlock'], when: ['条件', 'When'], bands: ['分段', 'Band'], wmult: ['兵器加成', 'Weapon bonus'], child: ['分裂体', 'Offspring'],
  obstacles: ['障碍', 'Obstacles'], bpm: ['节拍', 'Beat'], tierCd: ['各品冷却', 'Cooldown by tier'], proc: ['触发率', 'Proc'], heavyInk: ['浓墨', 'Heavy ink'],
  extraEliteFrom: ['多一只精英（起始重）', 'Extra elite from wave'], knockX: ['击退 ×', 'Knockback ×'], bossExtraPattern: ['首领多一招', 'Boss extra move'],
  hordeBoost: ['潮水加量', 'Horde boost'], hpPct: ['气血 %', 'HP %'], affixFrom: ['镜印起始重', 'Marks from wave'], critMax: ['暴击上限', 'Crit cap'],
  dodgeMult: ['闪避 ×', 'Dodge ×'], frac: ['比例', 'Fraction'], fetch: ['取回', 'Fetch'], stacks: ['层数', 'Stacks'], chains: ['连锁', 'Chains'],
  ignite: ['点燃', 'Ignite'], stun: ['眩晕（秒）', 'Stun (s)'], stunDur: ['眩晕（秒）', 'Stun (s)'], delay: ['延迟（秒）', 'Delay (s)'], dmgPct: ['伤害 %', 'Damage %'],
  dealtPct: ['造成伤害 %', 'Damage dealt %'], meleeOnly: ['只算近战', 'Melee only'], t: ['时刻（秒）', 'Time (s)'], budgetPct: ['威胁点 %', 'Budget %'],
  moonPct: ['月华 %', 'Moonlight %'], t3: ['仙品', 'Immortal'], t4: ['神品', 'Divine'], slow: ['减速 %', 'Slow %'], s: ['秒', 'Seconds'], k: ['系数', 'Factor'],
  moon: ['月华', 'Moonlight'], diff: ['镜境', 'Difficulty'], shape: ['形状', 'Shape'], music: ['乐曲', 'Music'], clearShot: ['清弹', 'Clears shots'],
  pierce: ['穿透', 'Pierce'], endless: ['无尽', 'Endless'], reachPct: ['攻击距离 %', 'Reach %'], drunk: ['醉', 'Drunk'], summon: ['召唤', 'Summon'],
  stone: ['棋子', 'Stones'],
};
/** `p.*` keys (skills, passives, weapons, monsters, bosses). */
export const PARAM: Readonly<Record<string, Pair>> = {
  r: ['半径', 'Radius'], every: ['每隔', 'Every'], tell: ['预警（秒）', 'Telegraph (s)'], dur: ['持续（秒）', 'Duration (s)'], base: ['基础伤害', 'Base damage'],
  n: ['数量', 'Count'], speed: ['速度', 'Speed'], k: ['系数', 'Factor'], slow: ['减速 %', 'Slow %'], deg: ['角度', 'Angle'], len: ['长度', 'Length'],
  w: ['宽度', 'Width'], spin: ['旋转', 'Spin'], pierce: ['穿透', 'Pierce'], life: ['存在（秒）', 'Lifetime (s)'], keep: ['保留', 'Keep'], stun: ['眩晕（秒）', 'Stun (s)'],
  heal: ['治疗', 'Heal'], tick: ['间隔（秒）', 'Tick (s)'], root: ['定身（秒）', 'Root (s)'], charmDur: ['魅惑（秒）', 'Charm (s)'], iframe: ['无敌（秒）', 'Invulnerable (s)'],
  pct: ['百分比', 'Percent'], blades: ['刃数', 'Blades'], per: ['每', 'Per'], gap: ['间隔', 'Gap'], atk: ['攻击', 'Attack'], ring: ['圈', 'Ring'],
  orbitR: ['环绕半径', 'Orbit radius'], moon: ['月华', 'Moonlight'], rate: ['频率', 'Rate'], move: ['移动', 'Move'], refund: ['返还', 'Refund'],
  drunk: ['醉', 'Drunk'], dmg: ['伤害 %', 'Damage %'], hits: ['段数', 'Hits'], gold: ['金', 'Gold'], bleedStacks: ['流血层数', 'Bleed stacks'],
  bounce: ['弹射', 'Bounces'], coin: ['铜钱', 'Coin'], pull: ['牵引', 'Pull'], hooks: ['钩数', 'Hooks'], ret: ['回旋', 'Returns'], jumps: ['跳数', 'Jumps'],
  burn: ['灼烧', 'Burn'], burnStacks: ['灼烧层数', 'Burn stacks'], x: ['倍数', 'Multiplier'], amp: ['增伤 %', 'Damage up %'], max: ['上限', 'Max'],
  cap: ['上限', 'Cap'], kKit: ['兵器系数', 'Kit factor'], charm: ['魅惑', 'Charm'], vuln: ['易伤 %', 'Vulnerable %'], vulnDur: ['易伤（秒）', 'Vulnerable (s)'],
  chain: ['连锁', 'Chain'], knock: ['击退', 'Knockback'], aspd: ['攻速', 'Attack speed'], armor: ['护甲', 'Armour'], hp: ['气血', 'HP'], crit: ['暴击', 'Crit'],
  lives: ['命数', 'Lives'], choices: ['可选', 'Choices'], cards: ['卡数', 'Cards'], shield: ['护盾', 'Shield'], decay: ['衰减', 'Decay'], chance: ['几率', 'Chance'],
  shotSpeed: ['弹速', 'Shot speed'], enemyHp: ['敌血 %', 'Enemy HP %'], enemySpd: ['敌速 %', 'Enemy speed %'], price: ['价格 %', 'Price %'],
  // cr/B-S.md (BALANCE's new p keys)
  overflow: ['溢出', 'Overflow'], critHeal: ['暴击回血', 'Heal on crit'], critHealCap: ['暴击回血上限', 'Heal on crit cap'], dodgeAspd: ['闪避后攻速', 'Attack speed after a dodge'],
  dodgeDur: ['闪避后持续（秒）', 'After a dodge (s)'], guard: ['格挡', 'Guard'], guardDur: ['格挡（秒）', 'Guard (s)'],
  gaps: ['空隙数', 'Gaps'], gapDeg: ['空隙角度', 'Gap angle'], charmEvery: ['每隔几下魅惑', 'Charm every'], blobs: ['墨团数', 'Blobs'], discs: ['圆盘数', 'Discs'],
  fork: ['分叉', 'Fork'], dashSpeed: ['冲刺速度', 'Dash speed'], fan: ['扇形数', 'Fan'], near: ['近距', 'Near'], to: ['到', 'To'], hop: ['跳', 'Hop'],
  circle: ['圈', 'Circle'], fly: ['飞行', 'Fly'], attack: ['攻击', 'Attack'], draw: ['蓄力', 'Draw'], beat: ['拍', 'Beat'], stack: ['层', 'Stack'],
  stackMax: ['层数上限', 'Stack cap'], stackDur: ['层持续（秒）', 'Stack time (s)'], streak: ['连击', 'Streak'], hpGain: ['气血收益 ×', 'HP gain ×'],
  armorGain: ['护甲收益 ×', 'Armour gain ×'], meleeMax: ['近战上限', 'Melee cap'], burnDur: ['灼烧（秒）', 'Burn (s)'], slowDur: ['减速（秒）', 'Slow (s)'],
  bigX: ['大倍数', 'Big multiplier'], at: ['时刻', 'At'], min: ['下限', 'Min'], count: ['次数', 'Count'], area: ['范围', 'Area'], range: ['射程', 'Range'],
  hitbox: ['身形', 'Hitbox'], xp: ['经验', 'XP'], grow: ['增长', 'Growth'], wait: ['等待（秒）', 'Wait (s)'], after: ['之后（秒）', 'After (s)'], extra: ['额外', 'Extra'],
};
/** The F constants (data/stats.ts) by top key: the ones ask A turns, then the rest of the commonest. */
export const F_LABEL: Readonly<Record<string, Pair>> = {
  shopOdds: ['兵器品质', 'Weapon tiers'], itemOdds: ['道具品质', 'Item tiers'], priceSlope: ['每重涨价', 'Price growth a wave'],
  weaponSlope: ['兵器每重涨价', 'Weapon price growth a wave'], tierMult: ['品质价倍', 'Tier price multiplier'], rerollSlope: ['刷新涨价', 'Reroll price growth'],
  sellFrac: ['卖出折价', 'Sell fraction'], pawnFrac: ['典当折价', 'Pawn fraction'], weaponRoll: ['一格出兵器的几率', 'Chance a slot is a weapon'],
  fullWeaponRoll: ['兵器满时出兵器的几率', 'Weapon chance with a full rack'], classLean: ['道具偏向流派', 'Item class lean'], copyLean: ['出同款的几率', 'Copy chance'],
  schoolK: ['同流派权重', 'School weight'], schoolCap: ['同流派权重上限', 'School weight cap'], curseEnemy: ['劫数 · 每点敌人加成', 'Curse · enemy per point'],
  curseDmg: ['劫数 · 每点你的伤害 %', 'Curse · your damage % per point'], curseMoon: ['劫数 · 每点月华', 'Curse · moonlight per point'],
  hp: ['敌血', 'Enemy HP'], dmg: ['敌伤', 'Enemy damage'], spd: ['敌速', 'Enemy speed'], endless: ['无尽', 'Endless'], budget: ['每重威胁点', 'Threat budget'],
  waveLen: ['每重时长', 'Wave length'], startMoon: ['开局月华', 'Starting moonlight'], eliteMoon: ['精英月华', 'Elite moonlight'], bossMoon: ['首领月华', 'Boss moonlight'],
  iframes: ['受击无敌（秒）', 'i-frames (s)'], contactCd: ['接触伤害间隔', 'Contact interval'], armorK: ['护甲系数', 'Armour constant'], dodgeCap: ['闪避上限', 'Dodge cap'],
  meleeSteal: ['近战自带吸血 %', 'Innate melee lifesteal %'], harvestGrow: ['收成每重增长', 'Harvest growth a wave'], heartOdds: ['镜心出神品的几率', 'Heart divine odds'],
  crateChance: ['镜奁掉率', 'Casket drop'], lotusChance: ['莲花掉率', 'Lotus drop'], bossK: ['首领血量', 'Boss HP'], diffRamp: ['镜境递增', 'Difficulty ramp'],
  alive: ['同屏上限', 'On-screen cap'], baseSpeed: ['常速', 'Base speed'], pickupBase: ['拾取半径', 'Pickup radius'], shopSlots: ['货位', 'Shop slots'],
  weaponSlots: ['兵器格', 'Weapon slots'], cards: ['每级卡数', 'Cards a level'], moonTiers: ['月华分档', 'Moon tiers'], treasure: ['宝怪', 'Treasures'],
  groupEvery: ['刷怪间隔', 'Group interval'], eliteWaves: ['精英重', 'Elite waves'], hordeWaves: ['潮水重', 'Horde waves'], swordCap: ['飞剑上限', 'Sword cap'],
  // cr/I-S.md (data/stats.ts m8:items)
  itemScatter: ['千金散尽落点与停留', 'Scatter landing and hold'], itemStream: ['月华如练判定', 'Stream hit radius and ring'], eliteAffixMax: ['精英镜印上限', 'Elite mark cap'],
  // QA: the rest of F, so nothing shows as a raw key
  dodgeHard: ['闪避硬上限', 'Dodge hard cap'], regenPerPoint: ['每点回气每秒回血', 'HP a second per regen point'], stealPerSec: ['吸血每秒上限', 'Lifesteal cap a second'],
  pickupMaxSpeed: ['拾取飞来最高速度', 'Pickup top speed'], critXDefault: ['默认暴击倍数', 'Default crit multiplier'], critOverflow: ['暴击过百转暴伤', 'Crit over 100 adds crit damage'],
  cdFloor: ['冷却下限（秒）', 'Cooldown floor (s)'], tierCd: ['各品冷却', 'Cooldown by tier'], proc: ['触发系数分段', 'Proc bands'], resist: ['抗击退', 'Knockback resist'],
  knockDur: ['击退时长（秒）', 'Knockback time (s)'], guanHitCap: ['关公单下伤害上限', "Guan Yu's per-hit cap"], drunk: ['醉', 'Drunk'], summon: ['召唤物', 'Summons'],
  swordExtra: ['额外飞剑伤害', 'Extra sword damage'], launchReturn: ['回旋返回', 'Launch return'], stone: ['棋子', 'Stones'], bossAddsFrac: ['首领战小怪比例', 'Boss-fight adds share'],
  bossAddsWindow: ['首领战小怪时段（秒）', 'Boss-fight adds window (s)'], firstGroup: ['第一批出怪（秒）', 'First group (s)'], groupWindowPad: ['出怪收尾（秒）', 'Spawn window pad (s)'],
  hordeHp: ['潮水怪血量 ×', 'Horde HP ×'], hordeBoost: ['潮水加量', 'Horde boost'], eliteAt: ['精英出场时刻', 'Elite arrives at'], bloom: ['出怪预兆（秒）', 'Spawn warning (s)'],
  bloomEasy: ['闲游出怪预兆（秒）', 'Spawn warning on Idle Stroll (s)'], spawnMinDist: ['出怪最近距离', 'Spawn min distance'], enemyShots: ['敌弹上限', 'Enemy shot cap'],
  heavyInk: ['重墨', 'Heavy ink'], lotusHeal: ['莲花回血', 'Lotus heal'], thickAbove: ['月华合并的数量', 'Moonlight merges above'], thickWorth: ['月华珠价值', 'Moon pearl worth'],
  gardenerGrow: ['园丁收成增长', 'Gardener growth'], shopSlotsMax: ['货位上限', 'Shop slot cap'], classLeanFrom: ['偏向流派起始件数', 'Class lean from piece'],
  legendFrom: ['镜心选品起算重', 'Heart pool from wave'], crateMelt: ['镜奁熔价', 'Casket melt value'], crateAhead: ['镜奁按后几重出品', 'Casket tiers look ahead'],
  heartOddsLate: ['镜心后期神品几率', 'Heart late divine odds'], cardsScholar: ['书生每级卡数', "Scholar's cards a level"], cardsSolo: ['独行每级卡数', 'Solo cards a level'],
  hidden: ['隐藏同伴', 'Hidden companions'],
};
/** CLAMP (data/stats.ts): the stat sheet's floors and caps. */
export const CLAMP_LABEL: Readonly<Record<string, Pair>> = {
  dmgMin: ['伤害下限 %', 'Damage floor %'], aspdMin: ['攻速下限', 'Attack speed floor'], critMax: ['暴击上限', 'Crit cap'], stealMax: ['吸血上限', 'Lifesteal cap'],
  speedMin: ['身法下限', 'Speed floor'], speedMax: ['身法上限', 'Speed cap'], luckMin: ['福缘下限', 'Luck floor'], summonCapMax: ['召唤物上限', 'Summon cap'],
  stonesMax: ['棋子上限', 'Stone cap'], healMin: ['疗效下限', 'Healing floor'], hpMin: ['气血下限', 'HP floor'],
};
const STAT_SET = new Set<string>(STAT_IDS);
const CLASS_SET = new Set<string>(Object.keys(CLASS_NAMES));
const pair = (p: Pair | undefined, k: string, t: T) => (p ? t(p[0], p[1]) : k);
/** Per-tier arrays: 凡 灵 仙 神 (I–IV in English). */
const tierAt = (i: number, t: T) => (i >= 0 && i < 4 ? t(TIER_ZH[i + 1], TIER_EN[i + 1]) : `[${i}]`);

/**
 * A path in words: 「兵器 · 青锋剑 · 伤害 · 凡」, 「公式 · 兵器品质（第 20 重起）· 神」, 「同伴 · 琴师 · 天赋 · 攻速」.
 * `wave` reads the odds row's first column (the wave it starts at).
 */
export function leafLabel(segs: readonly Seg[], t: T, wave?: (row: number) => number | undefined): string {
  const tb = tableOf(String(segs[0]));
  const out: string[] = [tb ? t(tb.zh, tb.en) : String(segs[0])];
  let i = 1;
  if (segs[0] !== 'F' && segs[0] !== 'CLAMP' && segs[0] !== 'BASE_STATS' && segs[0] !== 'MASTERY' && typeof segs[1] === 'string') {
    const ent = named(segs[1]);
    const cls = segs[0] === 'SETS' && CLASS_SET.has(segs[1]) ? CLASS_NAMES[segs[1] as keyof typeof CLASS_NAMES] : null;
    out.push(ent ? t(ent.zh, ent.en) : cls ? t(cls[0], cls[1]) : segs[1]);
    i = 2;
  }
  const odds = segs[0] === 'F' && (segs[1] === 'shopOdds' || segs[1] === 'itemOdds');
  for (; i < segs.length; i++) {
    const s = segs[i];
    const prev = segs[i - 1];
    if (typeof s === 'number') {
      if (segs[0] === 'DIFFS' && i === 1) { const d = DIFF_REG[s]; out.push(d ? t(d.zh, d.en) : `[${s}]`); continue; }
      if (odds && i === 2) { const w = wave?.(s); out[out.length - 1] += w !== undefined ? t(`（第 ${w} 重起）`, ` (from wave ${w})`) : ` [${s}]`; continue; }
      if (odds && i === 3) { out.push(s === 0 ? t('起始重数', 'From wave') : tierAt(s - 1, t)); continue; }
      if (segs[0] === 'WEAPONS' && segs.length === i + 1) out.push(tierAt(s, t)); // per-tier numbers: 凡 灵 仙 神
      else if (prev === 'costs') out.push(t(`第 ${s + 1} 阶`, `rank ${s + 1}`));
      else if (prev === 'tiers') out.push(t(`第 ${s + 1} 档`, `step ${s + 1}`));
      else if (prev === 'fx') out.push(t(`第 ${s + 1} 条`, `#${s + 1}`));
      else if (prev === 'phases') out.push(t(`第 ${s + 1} 阶段`, `phase ${s + 1}`));
      else if (prev === 'script') out.push(t(`第 ${s + 1} 招`, `move ${s + 1}`));
      else if (segs[0] === 'MASTERY') out.push(t(`第 ${s + 1} 级`, `level ${s + 1}`));
      else out.push(`[${s}]`);
      continue;
    }
    if (segs[0] === 'F' && i === 1) { out.push(pair(F_LABEL[s], s, t)); continue; }
    if (segs[0] === 'CLAMP' && i === 1) { out.push(pair(CLAMP_LABEL[s], s, t)); continue; }
    if (prev === 'p') { out.push(pair(PARAM[s], `p.${s}`, t)); continue; }
    if (s === 'p') continue;
    // a stat key: always inside a StatMods map; elsewhere only when the field has no word of its own (scale.melee, when.hp …)
    if (STAT_SET.has(s) && (prev === 'stats' || prev === 'extra' || prev === 'per' || prev === 'scale' || !FIELD[s])) { out.push(statName(s as StatId, t)); continue; }
    if (CLASS_SET.has(s) && !FIELD[s]) { const c = CLASS_NAMES[s as keyof typeof CLASS_NAMES]; out.push(t(c[0], c[1])); continue; }
    if (s === 'stats' || s === 'extra') { out.push(t('属性', 'Stats')); continue; }
    if (s === 'per') { out.push(t('每阶', 'Per rank')); continue; }
    out.push(pair(FIELD[s], s, t));
  }
  return out.join(' · ');
}

/** The keys of a path that have no label (shown raw): the 数值表 shows the entity's own description beside them. */
export function rawKeys(segs: readonly Seg[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (typeof s !== 'string') continue;
    const prev = segs[i - 1];
    if (i === 1 && segs[0] !== 'F' && segs[0] !== 'CLAMP' && segs[0] !== 'BASE_STATS' && segs[0] !== 'MASTERY') continue;
    if (segs[0] === 'F' && i === 1) { if (!F_LABEL[s]) out.push(s); continue; }
    if (segs[0] === 'CLAMP' && i === 1) { if (!CLAMP_LABEL[s]) out.push(s); continue; }
    if (s === 'p' || s === 'stats' || s === 'extra' || s === 'per') continue;
    if (prev === 'p') { if (!PARAM[s]) out.push(`p.${s}`); continue; }
    if (STAT_SET.has(s) || CLASS_SET.has(s) || FIELD[s]) continue;
    out.push(s);
  }
  return out;
}

/** The owner's own words for the stats (sandbox.md §4.1), for both searches: 幸运 → 福缘 … */
export const SYNONYMS: Readonly<Record<string, StatId>> = {
  幸运: 'luck', 元素: 'elem', 灵力: 'spirit', 收获: 'harvest', 回气: 'regen', 拾取: 'pickup', 暴伤: 'critDmg', 血量: 'hp', 攻击速度: 'aspd', 移动速度: 'speed',
  血: 'hp', 攻击: 'dmg', 速度: 'speed', 移速上限: 'speed', 运气: 'luck', 爆伤: 'critDmg', 暴击伤害: 'critDmg', 回复: 'regen', 防御: 'armor',
};
/** A search with the owner's words turned into the tables' (the stat's zh and en names), plus the text itself. */
export function searchTerms(q: string): string[] {
  const s = q.trim();
  if (!s) return [];
  const id = SYNONYMS[s];
  return id ? [s, statName(id, (zh) => zh), statName(id, (_z, en) => en).toLowerCase(), id.toLowerCase()] : [s];
}
