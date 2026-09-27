// 水月幻镜 · the canonical registry. Every entity of the GDD has one stable ascii id here, its zh and
// en names, and one line on how it looks / what it does (the art builder paints from `look`).
//
// Rules (tests enforce them):
//   · every id in every list below is unique across ALL lists (one flat namespace), /^[a-z][a-zA-Z0-9]*$/;
//   · ids never change once shipped (saves, codex keys, atlas keys and deeds refer to them);
//   · data tables (data/*.ts) key their defs by these ids and never repeat zh/en names;
//   · the order of each list is the display order (codex, lobby, shop sort).
// Companions reuse the app's CharacterId. Pure data, no imports beyond types: safe for node tests.
import type { CharacterId } from '../../data/characters';
import type { RunStatKey } from './types';

/** One registry row. `look` is a one-line brief for the painter (and the codex's alt text). */
export interface Named {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly look: string;
}

// ─────────────────────────────────────────────────────────────── weapons (27; 18 open from the start)
export const WEAPON_REG = [
  { id: 'qingfeng', zh: '青锋剑', en: 'Azure Edge', look: 'slim straight jian with a blue-green sheen; thrusts a narrow line' },
  { id: 'longquan', zh: '龙泉双剑', en: 'Longquan Twins', look: 'two short swords crossed at the hilt; quick alternating arcs' },
  { id: 'yanyue', zh: '青龙偃月刀', en: 'Green Dragon Crescent', look: 'long glaive with a dragon-head crescent blade; huge slow sweeps' },
  { id: 'hoe', zh: '花锄', en: 'Flower Hoe', look: 'gardener\'s hoe with a sprig tied on; smashes an arc, kills sow flowers' },
  { id: 'pestle', zh: '捣药杵', en: 'Medicine Pestle', look: 'jade-white pestle of the moon rabbit; slams a circle at the target' },
  { id: 'claw', zh: '猫爪', en: 'Cat\'s Paw', look: 'ginger paw with three ink claw marks; triple swipes that bleed' },
  { id: 'drunkfist', zh: '醉拳', en: 'Drunken Fist', look: 'swaying fist trailing a wine-red sash' },
  { id: 'dart', zh: '飞镖', en: 'Throwing Star', look: 'small four-point steel dart; bounces between foes' },
  { id: 'coindart', zh: '金钱镖', en: 'Gilt Disc Dart', look: 'gilt disc with a serrated rim, never the square hole (kept for real 文)' },
  { id: 'sunbow', zh: '射日弓', en: 'Sun-Shooter Bow', look: 'Hou Yi\'s great vermilion-lacquered bow; heavy piercing arrows' },
  { id: 'repeater', zh: '诸葛连弩', en: 'Zhuge Repeater', look: 'box crossbow with a magazine on top; bursts of three bolts' },
  { id: 'rod', zh: '钓竿', en: 'Fishing Rod', look: 'bamboo rod and fine line with a brass hook; hooks and pulls' },
  { id: 'qingping', zh: '青萍飞剑', en: 'Qingping Flying Sword', look: 'pale jade flying sword that darts out and back' },
  { id: 'casket', zh: '剑匣', en: 'Sword Casket', look: 'black lacquer box; its blades circle you' },
  { id: 'peach', zh: '桃木剑', en: 'Peachwood Sword', look: 'Taoist peachwood sword with a red tassel; homing, bane of ghosts' },
  { id: 'seven', zh: '七星剑', en: 'Seven-Star Sword', look: 'sword inlaid with the Big Dipper; swords rain in a dipper line' },
  { id: 'thunder', zh: '雷符', en: 'Thunder Talisman', look: 'yellow talisman with a vermilion 雷 seal; chain lightning' },
  { id: 'fire', zh: '火符', en: 'Fire Talisman', look: 'talisman curling in flame as it is thrown; bursts and burns' },
  { id: 'gourd', zh: '酒葫芦', en: 'Wine Gourd', look: 'red-corded gourd lobbed in an arc; a splash of wine that ignites' },
  { id: 'qin', zh: '古琴', en: 'Guqin', look: 'seven-string zither; rings of sound pulse out around you' },
  { id: 'flute', zh: '玉笛', en: 'Jade Flute', look: 'white jade flute; homing notes that charm' },
  { id: 'brush', zh: '神笔', en: 'Magic Brush', look: 'fat wolf-hair brush dripping ink; paints creatures that fight' },
  { id: 'inkstone', zh: '砚台', en: 'Inkstone Turret', look: 'squat inkstone set at your feet; spits ink blobs' },
  { id: 'crane', zh: '纸鹤', en: 'Paper Crane', look: 'folded paper crane that circles and dives' },
  { id: 'gobowl', zh: '棋罐', en: 'Go Bowl', look: 'round wooden go pot; lays black and white stones that blast' },
  { id: 'moonwheel', zh: '月轮', en: 'Moon Wheel', look: 'silver crescent disc; flies out and boomerangs back' },
  { id: 'moonmirror', zh: '广寒镜', en: 'Guanghan Mirror', look: 'small bright bronze mirror; casts a straight moonlight beam' },
] as const satisfies readonly Named[];
export type WeaponId = (typeof WEAPON_REG)[number]['id'];

/** The 18 weapons open from the start; the other 9 are unlocked by deeds (DEED_REG). */
export const STARTER_WEAPONS: readonly WeaponId[] = [
  'qingfeng', 'yanyue', 'hoe', 'pestle', 'claw', 'dart', 'sunbow', 'rod', 'qingping',
  'casket', 'thunder', 'fire', 'gourd', 'qin', 'brush', 'crane', 'gobowl', 'moonmirror',
];

// ─────────────────────────────────────────────────────────────── items (75; 53 open, 22 by deeds)
/** Codex / shop grouping of items (GDD §9.1–9.8). */
export type ItemGroup = 'stat' | 'cond' | 'econ' | 'ink' | 'flying' | 'arch' | 'curse' | 'legend';
interface ItemNamed extends Named { readonly group: ItemGroup }

export const ITEM_REG = [
  // 9.1 stat
  { id: 'songzi', zh: '松子', en: 'Pine Nuts', group: 'stat', look: 'a little heap of pine nuts on a leaf' },
  { id: 'tea', zh: '竹叶茶', en: 'Bamboo-Leaf Tea', group: 'stat', look: 'celadon cup with a floating bamboo leaf' },
  { id: 'sandals', zh: '草鞋', en: 'Straw Sandals', group: 'stat', look: 'pair of woven straw sandals' },
  { id: 'whetstone', zh: '磨刀石', en: 'Whetstone', group: 'stat', look: 'grey whetstone with a wet streak' },
  { id: 'fletch', zh: '箭羽', en: 'Fletching', group: 'stat', look: 'three barred feathers bound with thread' },
  { id: 'cinnabar', zh: '朱砂', en: 'Cinnabar', group: 'stat', look: 'vermilion cinnabar stick and a red smear' },
  { id: 'pineink', zh: '松烟墨', en: 'Pine-Soot Ink', group: 'stat', look: 'black ink stick stamped with a pine' },
  { id: 'guardmirror', zh: '护心镜', en: 'Heart-Guard Mirror', group: 'stat', look: 'round bronze breastplate mirror on cords' },
  { id: 'bell', zh: '铜铃', en: 'Bronze Bell', group: 'stat', look: 'small bronze bell with a red ribbon' },
  { id: 'eagle', zh: '鹰羽', en: 'Eagle Feather', group: 'stat', look: 'one long barred eagle feather' },
  { id: 'redstring', zh: '红绳', en: 'Red String', group: 'stat', look: 'loop of red string with a knot' },
  { id: 'ginseng', zh: '人参', en: 'Ginseng', group: 'stat', look: 'forked ginseng root with a red berry cluster' },
  { id: 'tigertally', zh: '虎符', en: 'Tiger Tally', group: 'stat', look: 'bronze tiger tally split in two halves' },
  { id: 'amulet', zh: '护身符', en: 'Amulet', group: 'stat', look: 'folded yellow charm in a small red pouch' },
  { id: 'balm', zh: '金创药', en: 'Wound Balm', group: 'stat', look: 'little porcelain jar sealed with red paper' },
  { id: 'elixir', zh: '金丹', en: 'Golden Elixir', group: 'stat', look: 'one golden pill glowing on a gourd stopper' },
  // 9.2 conditional
  { id: 'drumroll', zh: '一鼓作气', en: 'First Drumbeat', group: 'cond', look: 'war drum with a single fresh strike mark' },
  { id: 'gall', zh: '卧薪尝胆', en: 'Gall and Brushwood', group: 'cond', look: 'bitter gall hanging over a bed of brushwood' },
  { id: 'backwater', zh: '背水一战', en: 'Back to the River', group: 'cond', look: 'banner planted at the edge of rushing water' },
  { id: 'atease', zh: '以逸待劳', en: 'Rested and Ready', group: 'cond', look: 'folding stool beside a leaning spear' },
  { id: 'versatile', zh: '八面玲珑', en: 'Eight-Sided Grace', group: 'cond', look: 'octagonal openwork lantern' },
  { id: 'chasewind', zh: '追风', en: 'Chasing the Wind', group: 'cond', look: 'streaming horse-tail whisk in the wind' },
  { id: 'ironbone', zh: '铁骨', en: 'Iron Bones', group: 'cond', look: 'iron-grey bone crossed with a chain' },
  { id: 'physician', zh: '悬壶济世', en: 'The Healer\'s Gourd', group: 'cond', look: 'doctor\'s gourd hanging from a staff' },
  // 9.3 economy
  { id: 'basket', zh: '竹篮', en: 'Bamboo Basket', group: 'econ', look: 'woven basket spilling moon shards' },
  { id: 'coinstring', zh: '铜钱串', en: 'String of Cash', group: 'econ', look: 'string of cash drawn on its card only; never a floor drop' },
  { id: 'lots', zh: '签筒', en: 'Fortune Sticks', group: 'econ', look: 'bamboo cup of fortune sticks, one jutting out' },
  { id: 'pawn', zh: '当票', en: 'Pawn Ticket', group: 'econ', look: 'red-stamped pawnshop ticket' },
  { id: 'luckycat', zh: '招财猫', en: 'Beckoning Cat', group: 'econ', look: 'white cat figurine with a raised paw' },
  { id: 'miser', zh: '铁公鸡', en: 'Iron Rooster', group: 'econ', look: 'iron rooster statuette; not one feather plucked' },
  { id: 'abacus', zh: '算盘', en: 'Abacus', group: 'econ', look: 'dark wooden abacus with bone beads' },
  // 9.4 墨宝
  { id: 'xuan', zh: '宣纸', en: 'Xuan Paper', group: 'ink', look: 'stack of fine rice paper, corner curling' },
  { id: 'duanyan', zh: '端砚', en: 'Duan Inkstone', group: 'ink', look: 'purple Duan inkstone with a pool of ink' },
  { id: 'splash', zh: '泼墨', en: 'Splashed Ink', group: 'ink', look: 'wild splash of ink flung across the card' },
  { id: 'inkbamboo', zh: '墨竹', en: 'Ink Bamboo', group: 'ink', look: 'two bamboo stalks painted in single strokes' },
  { id: 'inkcrane', zh: '墨鹤', en: 'Ink Crane', group: 'ink', look: 'red-crowned crane painted in wet ink' },
  { id: 'inkpool', zh: '墨池', en: 'Ink Pool', group: 'ink', look: 'black pond of ink with a brush resting on its rim' },
  { id: 'dotting', zh: '画龙点睛', en: 'Dotting the Eyes', group: 'ink', look: 'dragon head with a single fresh dot of an eye' },
  // 9.5 仙剑
  { id: 'tassel', zh: '剑穗', en: 'Sword Tassel', group: 'flying', look: 'jade bead and a long silk sword tassel' },
  { id: 'swordqi', zh: '剑气纵横', en: 'Sword Qi Unbound', group: 'flying', look: 'crossing azure slash marks' },
  { id: 'swordheart', zh: '剑心通明', en: 'Clear Sword Heart', group: 'flying', look: 'sword standing in a ring of light' },
  { id: 'washpool', zh: '洗剑池', en: 'Sword-Washing Pool', group: 'flying', look: 'small stone pool with a blade laid across it' },
  { id: 'yujian', zh: '御剑诀', en: 'Sword-Riding Art', group: 'flying', look: 'scroll of hand-signs above a hovering sword' },
  { id: 'swordtomb', zh: '剑冢', en: 'Sword Tomb', group: 'flying', look: 'mound bristling with broken swords' },
  // 9.6 archetype
  { id: 'yellowpaper', zh: '黄纸', en: 'Yellow Paper', group: 'arch', look: 'blank yellow talisman sheets' },
  { id: 'fivethunder', zh: '五雷正法', en: 'Rite of Five Thunders', group: 'arch', look: 'five lightning glyphs around a seal' },
  { id: 'lingering', zh: '绕梁', en: 'Lingering Echo', group: 'arch', look: 'sound ripples circling a roof beam' },
  { id: 'boya', zh: '伯牙', en: 'Boya\'s Qin', group: 'arch', look: 'qin with a broken string for a lost friend' },
  { id: 'dukang', zh: '杜康', en: 'Dukang Wine', group: 'arch', look: 'earthen wine jar with a red paper label 杜' },
  { id: 'nightcup', zh: '夜光杯', en: 'Luminous Cup', group: 'arch', look: 'thin jade cup glowing with wine' },
  { id: 'dragblade', zh: '拖刀诀', en: 'Trailing-Blade Trick', group: 'arch', look: 'glaive dragged behind, gouging a line' },
  { id: 'thorns', zh: '荆棘', en: 'Thorns', group: 'arch', look: 'tangle of thorny bramble' },
  { id: 'goldenbell', zh: '金钟罩', en: 'Golden Bell Shield', group: 'arch', look: 'great golden temple bell' },
  { id: 'gomanual', zh: '棋谱', en: 'Go Manual', group: 'arch', look: 'thread-bound book open on a board diagram' },
  { id: 'capture', zh: '提子', en: 'Capture', group: 'arch', look: 'one white stone surrounded by black' },
  { id: 'moonsoul', zh: '月魄', en: 'Moon Soul', group: 'arch', look: 'pale glowing orb trailing three shards' },
  { id: 'osmanthus', zh: '广寒桂', en: 'Moon-Palace Osmanthus', group: 'arch', look: 'sprig of golden osmanthus blossom' },
  { id: 'lingbo', zh: '凌波微步', en: 'Wave-Treading Steps', group: 'arch', look: 'embroidered slippers over ripples' },
  { id: 'cushion', zh: '蒲团', en: 'Meditation Cushion', group: 'arch', look: 'round rush cushion' },
  // 9.7 劫
  { id: 'cuthair', zh: '断发', en: 'Severed Hair', group: 'curse', look: 'lock of black hair cut with a knife; purple ink border' },
  { id: 'burnboats', zh: '破釜沉舟', en: 'Burn the Boats', group: 'curse', look: 'broken cauldron beside a sinking boat; purple border' },
  { id: 'yanwang', zh: '阎王帖', en: 'Yama\'s Summons', group: 'curse', look: 'black summons card with a red seal; purple border' },
  { id: 'delusion', zh: '妄念', en: 'Delusion', group: 'curse', look: 'smoky swirl with too many eyes; purple border' },
  { id: 'innerdemon', zh: '心魔', en: 'Inner Demon', group: 'curse', look: 'your own silhouette in purple ink; purple border' },
  { id: 'crackedmirror', zh: '镜裂', en: 'Cracked Mirror', group: 'curse', look: 'bronze mirror split by a bright crack; purple border' },
  // 9.8 神品
  { id: 'wanjian', zh: '万剑归宗', en: 'Myriad Swords Return', group: 'legend', look: 'a ring of countless swords pointing inward; gold leaf' },
  { id: 'inkdragon', zh: '墨龙图', en: 'Ink Dragon Scroll', group: 'legend', look: 'hanging scroll with a dragon leaving its frame' },
  { id: 'dugu', zh: '独孤九剑', en: 'Nine Swords of Dugu', group: 'legend', look: 'one plain sword on an empty page' },
  { id: 'samadhi', zh: '三昧真火', en: 'Samadhi Fire', group: 'legend', look: 'three-coloured flame on a lotus' },
  { id: 'treasurebowl', zh: '聚宝盆', en: 'Treasure Bowl', group: 'legend', look: 'bronze basin overflowing with moon shards and pearls' },
  { id: 'penglai', zh: '蓬莱仙丹', en: 'Penglai Elixir', group: 'legend', look: 'elixir pill over the isles of Penglai' },
  { id: 'ambush', zh: '十面埋伏', en: 'Ambush on All Sides', group: 'legend', look: 'pipa with ten banners behind it' },
  { id: 'needle', zh: '定海神针', en: 'Sea-Calming Pillar', group: 'legend', look: 'gold-banded iron pillar rising from waves' },
  { id: 'jiangjinjiu', zh: '将进酒', en: 'Bring In the Wine', group: 'legend', look: 'tipped wine jar pouring a river' },
  { id: 'watermoon', zh: '水月镜', en: 'Mirror of Water and Moon', group: 'legend', look: 'mirror showing a moon that is also in water' },
] as const satisfies readonly ItemNamed[];
export type ItemId = (typeof ITEM_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── archetypes (流派, 14)
export const ARCHETYPE_REG = [
  { id: 'mobao', zh: '墨宝 · 召唤', en: 'Ink Summoner', look: 'paint an army, then kite while it fights' },
  { id: 'xianjian', zh: '仙剑 · 飞剑', en: 'Flying Swords', look: 'swords orbit, launch, pierce and return' },
  { id: 'zhongbing', zh: '偃月 · 重兵', en: 'Crescent Arms', look: 'huge slow sweeps and knockback' },
  { id: 'jinzhong', zh: '金钟 · 反伤', en: 'Golden Bell', look: 'stand in the crowd while your armour hits back' },
  { id: 'fulu', zh: '符箓 · 五行', en: 'Talismans', look: 'thunder that chains, fire that spreads' },
  { id: 'qinxin', zh: '琴心 · 控场', en: 'Heart of the Qin', look: 'slow, stun and charm so enemies fight each other' },
  { id: 'zuixian', zh: '醉仙 · 暴击', en: 'Drunken Immortal', look: 'ride 醉 into chains of crits' },
  { id: 'fuyuan', zh: '福缘 · 生财', en: 'Fortune', look: 'invest first, then turn wealth into power' },
  { id: 'huichun', zh: '回春 · 续命', en: 'Spring Returns', look: 'out-heal everything; regen becomes damage' },
  { id: 'qizhen', zh: '棋阵 · 布子', en: 'Go Formation', look: 'lure the horde through a minefield, then capture' },
  { id: 'yueying', zh: '月影 · 闪避', en: 'Moon Shadow', look: 'every dodge fires moonlight' },
  { id: 'jifeng', zh: '疾风 · 身法', en: 'Swift Wind', look: 'speed is damage; never stop moving' },
  { id: 'jiehuo', zh: '劫火 · 负劫', en: 'Curse Fire', look: 'take the curse, take the power' },
  { id: 'dugubaijia', zh: '独孤 / 百家', en: 'Lone Sword / Hundred Schools', look: 'one weapon counting as six, or six classes at their 2-sets' },
] as const satisfies readonly Named[];
export type ArchetypeId = (typeof ARCHETYPE_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── companions (13 = the app's CharacterId)
interface CompanionNamed extends Named { readonly id: CharacterId; readonly accent: string }
/** `accent` is the token's one accent colour (GDD §21), '#rrggbb'; ink companions use PIGMENTS.ink. */
export const COMPANION_REG = [
  { id: 'scholar', zh: '书生', en: 'Scholar', accent: '#1b1916', look: 'white-robed scholar with a book satchel and a brush behind the ear' },
  { id: 'gardener', zh: '园丁', en: 'Gardener', accent: '#1b1916', look: 'straw hat, rolled sleeves, a hoe over the shoulder' },
  { id: 'fisher', zh: '渔翁', en: 'Old Fisherman', accent: '#1b1916', look: 'straw cape and bamboo hat, rod on his back' },
  { id: 'musician', zh: '琴师', en: 'Qin Player', accent: '#1b1916', look: 'long-sleeved woman with a guqin slung across her back' },
  { id: 'swordsman', zh: '侠客', en: 'Swordsman', accent: '#2e4a6b', look: 'wide hat, indigo sash, one sword; lean and quick' },
  { id: 'taoist', zh: '道童', en: 'Taoist Child', accent: '#d9a62e', look: 'small child in a Taoist cap with a horsetail whisk and gamboge talismans' },
  { id: 'painter', zh: '画师', en: 'Painter', accent: '#3d5a73', look: 'painter in an indigo apron, a huge brush held like a spear' },
  { id: 'player', zh: '棋士', en: 'Go Master', accent: '#1b1916', look: 'robed master holding a stone between two fingers' },
  { id: 'cat', zh: '大橘', en: 'Big Ginger', accent: '#e08a3c', look: 'round ginger cat, tail up, very pleased with itself' },
  { id: 'rabbit', zh: '玉兔', en: 'Jade Rabbit', accent: '#1b1916', look: 'white rabbit standing upright with a pestle' },
  { id: 'poet', zh: '诗仙', en: 'Poet Immortal', accent: '#8e2b3a', look: 'loose-robed poet swaying with a wine cup, wine-red sash' },
  { id: 'guan', zh: '关公', en: 'Lord Guan', accent: '#c0412f', look: 'red face, long beard, green robe, the crescent glaive' },
  { id: 'change', zh: '嫦娥', en: 'Chang\'e', accent: '#e8eef2', look: 'moon lady in trailing moon-white sleeves' },
] as const satisfies readonly CompanionNamed[];

// ─────────────────────────────────────────────────────────────── mirror skills (镜技, 13) · passives (天性, 13) · ☆ 别传 (13)
interface CharNamed extends Named { readonly char: CharacterId }
interface SkillNamed extends CharNamed { readonly glyph: string }

export const SKILL_REG = [
  { id: 'yizi', char: 'scholar', glyph: '镇', zh: '一字千钧', en: 'A Word Like a Mountain', look: 'a giant 镇 glyph brushes itself onto the ground, then lingers as a slowing zone' },
  { id: 'manyuan', char: 'gardener', glyph: '花', zh: '满园春色', en: 'Garden in Full Bloom', look: 'a round flowerbed springs up; petals whirl and strike' },
  { id: 'yiwang', char: 'fisher', glyph: '网', zh: '一网打尽', en: 'One Net for All', look: 'a fishing net unfurls, drags foes to its centre and pins them' },
  { id: 'guangling', char: 'musician', glyph: '琴', zh: '广陵散', en: 'Guangling Melody', look: 'she plays; wide rings on every beat, charmed foes turn 知音' },
  { id: 'yijian', char: 'swordsman', glyph: '剑', zh: '一剑光寒', en: 'One Cold Flash', look: 'an invulnerable dash; every sword streaks along the path' },
  { id: 'jiji', char: 'taoist', glyph: '符', zh: '急急如律令', en: 'By Swift Decree', look: 'a pinned talisman becomes a vortex struck by lightning' },
  { id: 'dianhua', char: 'painter', glyph: '笔', zh: '点化', en: 'Brush of Awakening', look: 'a sweeping scroll turns foes into ink allies' },
  { id: 'wei', char: 'player', glyph: '弈', zh: '围', en: 'Encircle', look: 'eight stones fall in a ring and close in, capturing all inside' },
  { id: 'pudie', char: 'cat', glyph: '喵', zh: '扑蝶', en: 'Butterfly Pounce', look: 'an airborne pounce onto the biggest foe; a kill resets it' },
  { id: 'daoyao', char: 'rabbit', glyph: '月', zh: '玉杵捣药', en: 'Pounding the Elixir', look: 'three pestle shockwaves, then an elixir that heals and empowers' },
  { id: 'yaoyue', char: 'poet', glyph: '酒', zh: '举杯邀明月', en: 'Raise a Cup to the Moon', look: 'drunk to the brim; crits launch seeking verse glyphs' },
  { id: 'tuodao', char: 'guan', glyph: '刀', zh: '拖刀计', en: 'Trailing-Blade Ruse', look: 'a feigned retreat, then a 360° sweep that stuns' },
  { id: 'qinghui', char: 'change', glyph: '奔', zh: '广寒清辉', en: 'Cold Palace Radiance', look: 'she rises untouchable, then lands in a pool of moonlight' },
] as const satisfies readonly SkillNamed[];
export type SkillId = (typeof SKILL_REG)[number]['id'];

export const PASSIVE_REG = [
  { id: 'bolan', char: 'scholar', zh: '博览群书', en: 'Well Read', look: 'five cards per level, a free first reroll, +10% XP, picks his starting weapon' },
  { id: 'chunzhong', char: 'gardener', zh: '春种秋收', en: 'Sow and Reap', look: '+8 收成 that grows 8% a wave; costs 15% 攻速' },
  { id: 'yuanzhe', char: 'fisher', zh: '愿者上钩', en: 'Willing Fish', look: '福缘 and 拾取, golden carp kills; costs 5% 伤害' },
  { id: 'zhiyin', char: 'musician', zh: '知音', en: 'Kindred Ear', look: '乐器 fire on the beat, stronger and wider; melee weapons −25%' },
  { id: 'jianyi', char: 'swordsman', zh: '剑意', en: 'Sword Intent', look: '+1 剑数 and 仙剑 crit; melee weapons −25%' },
  { id: 'tongzi', char: 'taoist', zh: '童子功', en: 'Child\'s Discipline', look: 'statuses last longer, a smaller hitbox; melee weapons −25%' },
  { id: 'chengzhu', char: 'painter', zh: '胸有成竹', en: 'Bamboo in the Heart', look: 'more, longer-lived, stronger 墨宝; other weapons −25%' },
  { id: 'luozi', char: 'player', zh: '落子无悔', en: 'No Take-backs', look: 'more stones that last the wave, a free reroll, a peek at the next wave; −10% 攻速' },
  { id: 'jiuming', char: 'cat', zh: '九命', en: 'Nine Lives', look: 'eight lethal hits shrugged off, paw prints on the HUD; half HP gains, no heavy arms or bows' },
  { id: 'yaoxiang', char: 'rabbit', zh: '月宫药香', en: 'Moon-Palace Herbs', look: 'overheal becomes a moon shield, healing +15%; −15% 射程' },
  { id: 'baipian', char: 'poet', zh: '斗酒百篇', en: 'A Hundred Poems a Jug', look: 'the 醉 meter without wine, twice as fast; his aim sways' },
  { id: 'yibo', char: 'guan', zh: '义薄云天', en: 'Righteous as the Clouds', look: 'no hit takes over 20% of max HP, grows 近战; five weapon slots, no hidden weapons' },
  { id: 'yinqing', char: 'change', zh: '阴晴圆缺', en: 'Waxing and Waning', look: 'a 16 s moon cycle from full-moon damage to new-moon dodge; floats over hazards' },
] as const satisfies readonly CharNamed[];
export type PassiveId = (typeof PASSIVE_REG)[number]['id'];

/** ☆ 别传 (mastery 5): each companion's 入画 skill reimagined. v1 shows a sealed page 「别传 · 待续」. */
export const ALT_SKILL_REG = [
  { id: 'tishi', char: 'scholar', glyph: '题', zh: '题诗', en: 'Inscribe', look: 'seven glyphs of verse brushed along your path become walls' },
  { id: 'cuihua', char: 'gardener', glyph: '花', zh: '催花', en: 'Coax Blossom', look: 'every flower and bamboo blooms, healing and rooting' },
  { id: 'dudiao', char: 'fisher', glyph: '网', zh: '独钓寒江', en: 'Lone Angler', look: 'charge, then hook the strongest foe to you' },
  { id: 'gaoshan', char: 'musician', glyph: '琴', zh: '高山流水', en: 'Mountains and Waters', look: 'instruments fire twice a beat while ink birds peck' },
  { id: 'qinggong', char: 'swordsman', glyph: '剑', zh: '轻功', en: 'Lightness Skill', look: 'three short invulnerable dashes, each priming a crit' },
  { id: 'yufeng', char: 'taoist', glyph: '符', zh: '御风符', en: 'Wind Talisman', look: 'a whirlwind pushes foes out and lifts you over hazards' },
  { id: 'shenbi', char: 'painter', glyph: '笔', zh: '神笔', en: 'Magic Brush', look: 'drag a stroke; an ink dragon flies along it' },
  { id: 'tuiyan', char: 'player', glyph: '弈', zh: '推演', en: 'Foresight', look: 'the world slows to 30% while you keep full speed' },
  { id: 'maoyue', char: 'cat', glyph: '喵', zh: '猫跃', en: 'Pounce', look: 'a long leap that stuns on landing and pulls in 月华' },
  { id: 'dengyue', char: 'rabbit', glyph: '月', zh: '蹬月', en: 'Moon Hop', look: 'an untargetable hop to the aim point, landing in moon dust' },
  { id: 'doujiu', char: 'poet', glyph: '酒', zh: '斗酒', en: 'A Jug of Wine', look: '醉 and 攻速 surge; crits burst into verse characters' },
  { id: 'chitu', char: 'guan', glyph: '马', zh: '赤兔', en: 'Red Hare', look: 'he rides Red Hare through the crowd' },
  { id: 'benyue', char: 'change', glyph: '奔', zh: '奔月', en: 'To the Moon', look: 'she floats untouchable while moonbeams strike' },
] as const satisfies readonly SkillNamed[];
export type AltSkillId = (typeof ALT_SKILL_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── maps (3) and their hazards
interface MapNamed extends Named { readonly title: string; readonly titleEn: string }
export const MAP_REG = [
  { id: 'lake', zh: '月湖', en: 'Moon Lake', title: '荷塘月色', titleEn: 'Moonlight on the Lotus Pond', look: 'round arena on the water\'s skin; pale indigo ink, jade lotus pads, a silver moon, a touch of lotus pink' },
  { id: 'forest', zh: '墨林', en: 'Ink Bamboo', title: '墨竹幽篁', titleEn: 'Deep in the Ink Bamboo', look: 'rectangular grove; 焦墨 black-green bamboo clumps, 石绿 moss, cinnabar fox-fire' },
  { id: 'palace', zh: '广寒', en: 'Moon Palace', title: '广寒镜殿', titleEn: 'Hall of the Cold Moon', look: 'octagon around the great osmanthus; moon-white floor, cold blue, osmanthus gold, cinnabar pillars; void rim' },
] as const satisfies readonly MapNamed[];
export type MapId = (typeof MAP_REG)[number]['id'];

interface HazardNamed extends Named { readonly map: MapId }
export const HAZARD_REG = [
  { id: 'moonglow', map: 'lake', zh: '月影', en: 'Moon Patch', look: 'a bright drifting circle of moonlight; standing in it empowers you' },
  { id: 'ripple', map: 'lake', zh: '涟漪', en: 'Ripple', look: 'a pale ring expanding from the centre, pushing everything outward' },
  { id: 'inkrain', map: 'forest', zh: '墨雨', en: 'Ink Rain', look: 'marked circles become slowing ink puddles' },
  { id: 'gust', map: 'forest', zh: '山风', en: 'Mountain Wind', look: 'swirling leaves show a direction, then everything drifts that way' },
  { id: 'jadefall', map: 'palace', zh: '坠玉', en: 'Falling Jade', look: 'marked jade tiles drop from above; undodgeable' },
  { id: 'lowgrav', map: 'palace', zh: '低重力', en: 'Low Gravity', look: 'all knockback ×1.4; drifting dust motes' },
  { id: 'moonphase', map: 'palace', zh: '月相', en: 'Moon Phase', look: 'waves alternate full and dark moon; a full-moon wave gives +10 福缘' },
] as const satisfies readonly HazardNamed[];
export type HazardId = (typeof HAZARD_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── monsters (36), elites (6), treasures (2)
interface MonsterNamed extends Named { readonly map: MapId | 'all' }
export const MONSTER_REG = [
  // shared
  { id: 'blot', map: 'all', zh: '墨团', en: 'Ink Blot', look: 'wobbling round blot of wet ink with two pale eyes' },
  { id: 'paperman', map: 'all', zh: '纸人', en: 'Paper Man', look: 'flat cut-paper funeral figure that crinkles before it lunges' },
  { id: 'shard', map: 'all', zh: '碎镜', en: 'Mirror Shard', look: 'jagged glinting sliver of bronze mirror; splits in two' },
  { id: 'lantern', map: 'all', zh: '灯魅', en: 'Lantern Wraith', look: 'paper lantern with a face in its flame; 石青 accent, throws fireballs' },
  // 月湖
  { id: 'tadpole', map: 'lake', zh: '墨蝌', en: 'Ink Tadpole', look: 'tiny comma of ink with a wriggling tail; schools zigzag' },
  { id: 'shrimp', map: 'lake', zh: '虾兵', en: 'Shrimp Soldier', look: 'curled shrimp holding a tiny spear; dashes on a flashed line' },
  { id: 'frog', map: 'lake', zh: '跳蛙', en: 'Leaping Frog', look: 'squat frog with folded legs; hops over stones' },
  { id: 'crab', map: 'lake', zh: '蟹将', en: 'Crab General', look: 'broad armoured crab, claws raised as a front shield' },
  { id: 'lotuspod', map: 'lake', zh: '莲蓬', en: 'Lotus Pod', look: 'rooted seed-pod head on a stalk; glows then spits a fan of seeds' },
  { id: 'jelly', map: 'lake', zh: '水母灯', en: 'Jellyfish Lamp', look: 'translucent jellyfish lamp that pulses vermilion before it bursts' },
  { id: 'clam', map: 'lake', zh: '蚌精', en: 'Clam Spirit', look: 'ridged clam that snaps shut, then releases tadpoles' },
  { id: 'egret', map: 'lake', zh: '白鹭', en: 'White Egret', look: 'long-necked white egret that dives across the whole arena' },
  { id: 'weed', map: 'lake', zh: '水草缠', en: 'Tangleweed', look: 'strands of waterweed rising under your feet to root you' },
  { id: 'drowned', map: 'lake', zh: '溺影', en: 'Drowned Shade', look: 'dripping pale figure that submerges and resurfaces near you' },
  // 墨林
  { id: 'rat', map: 'forest', zh: '竹鼠', en: 'Bamboo Rat', look: 'plump rat; travels under a ripple of earth' },
  { id: 'foxfire', map: 'forest', zh: '狐火', en: 'Foxfire', look: 'cinnabar will-o\'-wisp with a fox face; circles, then dashes' },
  { id: 'imp', map: 'forest', zh: '山魈', en: 'Mountain Imp', look: 'long-armed hairy imp that lobs stones where you will be' },
  { id: 'umbrella', map: 'forest', zh: '纸伞妖', en: 'Umbrella Yao', look: 'hopping oil-paper umbrella with one eye; its canopy deflects shots' },
  { id: 'wolf', map: 'forest', zh: '狼影', en: 'Wolf Shade', look: 'lean ink wolf; the pack circles, howls, pounces' },
  { id: 'ghostlamp', map: 'forest', zh: '灯笼鬼', en: 'Lantern Ghost', look: 'floating paper lantern ghost glowing gold as it heals others' },
  { id: 'spider', map: 'forest', zh: '墨蛛', en: 'Ink Spider', look: 'spindly ink spider that spits slowing webs' },
  { id: 'panda', map: 'forest', zh: '食铁兽', en: 'Iron-Eater', look: 'black-and-white iron-eating beast that curls and rolls' },
  { id: 'stick', map: 'forest', zh: '竹节精', en: 'Bamboo-Joint Sprite', look: 'jointed bamboo-stick creature bursting out of a clump' },
  { id: 'toadstool', map: 'forest', zh: '毒菌', en: 'Toadstool', look: 'spotted mushroom that leaves a spore cloud when it dies' },
  { id: 'woodghost', map: 'forest', zh: '樵鬼', en: 'Woodcutter Ghost', look: 'hunched ghostly woodcutter that throws a boomerang axe' },
  // 广寒
  { id: 'shadowhare', map: 'palace', zh: '月兔影', en: 'Moon-Hare Shade', look: 'shadowy hare hopping in pairs, landing rings ahead' },
  { id: 'crow', map: 'palace', zh: '寒鸦', en: 'Winter Crow', look: 'black crow in a flock; dives at your summons first' },
  { id: 'soldier', map: 'palace', zh: '天兵', en: 'Heavenly Soldier', look: 'armoured soldier in a shield line' },
  { id: 'frost', map: 'palace', zh: '冰魄', en: 'Frost Soul', look: 'pale blue crystal spirit orbiting you, firing slowing shards' },
  { id: 'guihua', map: 'palace', zh: '桂花精', en: 'Osmanthus Sprite', look: 'golden blossom sprite that bursts into four homing petals' },
  { id: 'toad', map: 'palace', zh: '金蟾', en: 'Golden Toad', look: 'three-legged golden toad that eats floor 月华 and grows' },
  { id: 'star', map: 'palace', zh: '星官', en: 'Star Official', look: 'robed star official; pairs join by a beam of wet ink' },
  { id: 'clerk', map: 'palace', zh: '雷部小吏', en: 'Thunder Clerk', look: 'small clerk with a drum and hammer; calls lightning rings' },
  { id: 'dancer', map: 'palace', zh: '霓裳舞姬', en: 'Rainbow-Robe Dancer', look: 'spinning dancer in long sleeves; spins to reflect shots' },
  { id: 'axeshade', map: 'palace', zh: '伐桂人', en: 'Tree-Feller Shade', look: 'ghostly feller with three axes orbiting him' },
  { id: 'skypup', map: 'palace', zh: '天狗崽', en: 'Sky-Hound Pup', look: 'dark hound pup that dims the light around it and charges summons' },
] as const satisfies readonly MonsterNamed[];
export type MonsterId = (typeof MONSTER_REG)[number]['id'];

interface MapBound extends Named { readonly map: MapId }
export const ELITE_REG = [
  { id: 'turtle', map: 'lake', zh: '巨鳌', en: 'Giant Ao', look: 'huge sea turtle that withdraws and ricochets off the walls; gold seal' },
  { id: 'whitesnake', map: 'lake', zh: '白蛇', en: 'White Snake', look: 'long white serpent slithering in S-curves; sends water lines' },
  { id: 'tiger', map: 'forest', zh: '山君', en: 'Mountain Lord', look: 'great striped ink tiger; roars, then leaps three times' },
  { id: 'painted', map: 'forest', zh: '画皮', en: 'Painted Skin', look: 'disguised as a paper man until it sheds the skin and slashes' },
  { id: 'general', map: 'palace', zh: '天将', en: 'Heavenly General', look: 'armoured general with a tower shield and a long spear' },
  { id: 'hound', map: 'palace', zh: '啸天犬', en: 'Howling Hound', look: 'celestial hound that chains dashes and howls up pups' },
] as const satisfies readonly MapBound[];
export type EliteId = (typeof ELITE_REG)[number]['id'];

export const TREASURE_REG = [
  { id: 'pixiu', zh: '貔貅', en: 'Pixiu', look: 'plump winged treasure beast that flees; it only takes, never gives (mostly)' },
  { id: 'mirrorflower', zh: '镜中花', en: 'Flower in the Mirror', look: 'drifting golden flower; one hit catches it' },
] as const satisfies readonly Named[];
export type TreasureId = (typeof TREASURE_REG)[number]['id'];

/** 镜印 affixes elites carry from 玄镜 up and in endless (GDD §13.1). */
export const AFFIX_REG = [
  { id: 'aegis', zh: '盾', en: 'Shielded', look: 'a bronze shield glyph; +5 甲' },
  { id: 'swift', zh: '疾', en: 'Swift', look: 'wind streaks; +30% speed' },
  { id: 'splitting', zh: '裂', en: 'Splitting', look: 'a crack glyph; splits into three at death' },
  { id: 'devour', zh: '噬', en: 'Devouring', look: 'a mouth glyph; heals from damage it deals' },
  { id: 'mirrored', zh: '映', en: 'Mirrored', look: 'a mirror glyph; reflects shots after a big hit' },
  { id: 'caller', zh: '召', en: 'Caller', look: 'a banner glyph; calls four small monsters every 8 s' },
] as const satisfies readonly Named[];
export type AffixId = (typeof AFFIX_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── bosses (9) + endless (2)
/** One entry per boss phase; index 0..2 are the three phases, index 3 is 倒悬's all-at-once phase. */
interface PhaseNamed { readonly zh: string; readonly en: string; readonly look: string }
interface BossNamed extends Named {
  readonly map: MapId;
  readonly wave: 10 | 20 | 30;
  /** The line of verse on the entrance card. */
  readonly verse: string;
  readonly verseEn: string;
  readonly phases: readonly [PhaseNamed, PhaseNamed, PhaseNamed];
}
export const BOSS_REG = [
  { id: 'carp', map: 'lake', wave: 10, zh: '鲤王', en: 'Carp King', verse: '鲤鱼跃龙门', verseEn: 'The carp leaps the Dragon Gate', look: 'enormous golden-scaled carp circling the rim',
    phases: [{ zh: '吐珠', en: 'Bubble Spirals', look: 'carp spitting rings of bubbles' }, { zh: '三跃', en: 'Three Leaps', look: 'carp arching out of the water' }, { zh: '化龙', en: 'Dragon Ascendant', look: 'carp half-turned young dragon, whiskers and horns' }] },
  { id: 'mirage', map: 'lake', wave: 20, zh: '蜃', en: 'Mirage Clam', verse: '海旁蜃气象楼台', verseEn: 'By the sea, the clam breathes towers', look: 'great clam exhaling a mist of towers; mirages of itself cast no shadow',
    phases: [{ zh: '吐珠', en: 'Pearl Fans', look: 'clam open, a pearl at its lip' }, { zh: '幻影', en: 'Mirages Strike', look: 'three pale copies of the clam' }, { zh: '海市蜃楼', en: 'City in the Mist', look: 'a closing wall of mist-towers with one gap' }] },
  { id: 'moonwater', map: 'lake', wave: 30, zh: '水中月', en: 'Moon in the Water', verse: '水中捞月', verseEn: 'Fishing for the moon in the water', look: 'a moon disc lying in the water, ringed with ripples',
    phases: [{ zh: '月轮', en: 'Moon Rings', look: 'full moon disc firing gapped rings' }, { zh: '分影', en: 'Four Reflections', look: 'four moons, only the true one shows tonight\'s phase' }, { zh: '猴子捞月', en: 'Monkeys Fish for the Moon', look: 'a chain of ink monkeys hanging down toward you' }] },
  { id: 'kui', map: 'forest', wave: 10, zh: '夔', en: 'Kui', verse: '其声如雷，其名曰夔', verseEn: 'Its voice is thunder; its name is Kui', look: 'one-legged grey bull-beast whose hide is a drum',
    phases: [{ zh: '雷鼓', en: 'Thunder Drum', look: 'kui stomping on the beat' }, { zh: '急鼓', en: 'Double Time', look: 'kui stomping twice as fast, sparks on its hide' }, { zh: '破鼓', en: 'Broken Rhythm', look: 'kui with a cracking drum-hide, lightning around it' }] },
  { id: 'fox', map: 'forest', wave: 20, zh: '九尾狐', en: 'Nine-Tailed Fox', verse: '九尾狐，其音如婴儿', verseEn: 'The nine-tailed fox, whose cry is a baby\'s', look: 'white fox with nine fanned tails tipped in fox-fire',
    phases: [{ zh: '九尾', en: 'Nine Tails', look: 'fox with all tails fanned; tails fall as she is hurt' }, { zh: '幻狐', en: 'Illusory Foxes', look: 'three foxes, only one with a shadow' }, { zh: '扫尾', en: 'Tail Sweeps', look: 'fox lashing her last tails across the arena' }] },
  { id: 'xingtian', map: 'forest', wave: 30, zh: '刑天', en: 'Xingtian', verse: '刑天舞干戚，猛志固常在', verseEn: 'Xingtian dances with shield and axe; his fierce will endures', look: 'headless giant with eyes for nipples and a mouth for a navel, shield and axe',
    phases: [{ zh: '三斩', en: 'Three Cleaves', look: 'axe raised for wide cleaves' }, { zh: '盾冲', en: 'Shield Charge', look: 'shield forward, charging' }, { zh: '干戚舞', en: 'War Dance', look: 'whirling with shield and axe while verse writes across the sky' }] },
  { id: 'wugang', map: 'palace', wave: 10, zh: '吴刚', en: 'Wu Gang', verse: '吴刚伐桂', verseEn: 'Wu Gang fells the osmanthus', look: 'burly woodcutter with a great axe beside the osmanthus tree',
    phases: [{ zh: '伐桂', en: 'Felling the Tree', look: 'wu gang chopping the tree' }, { zh: '飞斧', en: 'Axe Barrage', look: 'wu gang hurling axes' }, { zh: '双桂', en: 'Twin Trees', look: 'two trees sprout; wu gang enraged' }] },
  { id: 'goldtoad', map: 'palace', wave: 20, zh: '金蟾王', en: 'Golden Toad King', verse: '金蟾吐宝', verseEn: 'The golden toad spits treasure', look: 'huge three-legged golden toad with a coin-less crown; grows as it eats',
    phases: [{ zh: '长舌', en: 'Tongue Lash', look: 'toad with its tongue out' }, { zh: '吐宝', en: 'Treasure Rain', look: 'toad retching a rain of gold shards' }, { zh: '跳蟾', en: 'Bounding Toad', look: 'toad mid-leap, shadow below' }] },
  { id: 'eclipse', map: 'palace', wave: 30, zh: '天狗食月', en: 'Eclipse Hound', verse: '天狗食月', verseEn: 'The sky hound swallows the moon', look: 'vast black hound with glowing eyes and the moon in its jaws',
    phases: [{ zh: '扑咬', en: 'Lunge and Bite', look: 'hound crouched to lunge' }, { zh: '吞月', en: 'Swallow the Moon', look: 'darkness; only eyes and shots glow' }, { zh: '吐月', en: 'Moon Cross', look: 'hound spitting the moon as four turning beams' }] },
] as const satisfies readonly BossNamed[];
export type BossId = (typeof BOSS_REG)[number]['id'];

export const ENDLESS_BOSS_REG = [
  { id: 'twins', zh: '双生', en: 'Twin Reflections', verse: '对影成三人', verseEn: 'With my shadow, we make three', look: 'two of the map\'s bosses at once, in white ink on black paper' },
  { id: 'mirrorself', zh: '镜主', en: 'The Mirror Self', verse: '镜中人是我', verseEn: 'The one in the mirror is me', look: 'your own companion in white ink on black, with your weapons' },
] as const satisfies readonly (Named & { readonly verse: string; readonly verseEn: string })[];
export type EndlessBossId = (typeof ENDLESS_BOSS_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── 镜境 (6), 镜誓 (10), 镜蚀 (8)
/** Index in this list is the stored difficulty number (RunSave.diff, MirrorMeta.diffMax). */
export const DIFF_REG = [
  { id: 'xianyou', zh: '闲游', en: 'Idle Stroll', look: 'grey seal; gentle, half pay' },
  { id: 'zhaoying', zh: '照影', en: 'Reflection', look: 'ink seal; the baseline' },
  { id: 'mingjing', zh: '明镜', en: 'Bright Mirror', look: '石青 seal; tougher, extra elites' },
  { id: 'youjing', zh: '幽镜', en: 'Dim Mirror', look: 'purple seal; faster shots, fiercer bosses' },
  { id: 'xuanjing', zh: '玄镜', en: 'Dark Mirror', look: 'black-gold seal; elites carry 镜印, less healing' },
  { id: 'wuxiang', zh: '无相', en: 'Formless', look: 'vermilion seal; twin bosses, 镜蚀 from wave 11' },
] as const satisfies readonly Named[];
export type DiffId = (typeof DIFF_REG)[number]['id'];

export const VOW_REG = [
  { id: 'qunmo', zh: '群魔', en: 'Legion', look: '+12% spawn budget per rank' },
  { id: 'jianyan', zh: '坚魇', en: 'Hardened Nightmares', look: '+12% enemy HP per rank' },
  { id: 'lizhao', zh: '利爪', en: 'Sharp Claws', look: '+10% enemy damage per rank' },
  { id: 'jixing', zh: '疾行', en: 'Haste', look: '+6% enemy speed per rank' },
  { id: 'qianlin', zh: '悭吝', en: 'Miserly Merchant', look: '+8% shop prices per rank' },
  { id: 'canyue', zh: '残月', en: 'Waning Moon', look: '−15% 疗效 per rank' },
  { id: 'daoxuan', zh: '倒悬', en: 'Hung Upside Down', look: 'bosses gain a 4th phase at 10%: every pattern at once' },
  { id: 'jijing', zh: '急景', en: 'Hurried Light', look: 'waves 15% shorter, same budget' },
  { id: 'guying', zh: '孤影', en: 'Lone Shadow', look: 'level-ups show 3 cards' },
  { id: 'wusuo', zh: '雾锁', en: 'Fog-Locked', look: '−25% pickup radius' },
] as const satisfies readonly Named[];
export type VowId = (typeof VOW_REG)[number]['id'];

export const MUTATOR_REG = [
  { id: 'mochao', zh: '墨潮', en: 'Ink Tide', look: 'the dead leave slowing ink' },
  { id: 'shuangjing', zh: '双精', en: 'Paired Elites', look: 'elites come in pairs' },
  { id: 'jiying', zh: '疾影', en: 'Swift Shadows', look: 'enemies faster' },
  { id: 'huiguang', zh: '回光', en: 'Last Light', look: 'enemies heal once at half HP' },
  { id: 'suijing', zh: '碎镜', en: 'Shattering', look: 'every enemy splits once' },
  { id: 'anyue', zh: '暗月', en: 'Dark Moon', look: 'vision shrinks to a circle around you' },
  { id: 'fanzhao', zh: '反照', en: 'Backlight', look: 'shooters fire extra projectiles' },
  { id: 'houjia', zh: '厚甲', en: 'Thick Hide', look: 'enemies gain armour' },
] as const satisfies readonly Named[];
export type MutatorId = (typeof MUTATOR_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── 今日镜 节气 modifiers (24; index = term index, 0 = 立春)
export const TERM_MOD_REG = [
  { id: 'lichun', zh: '春风', en: 'Spring Breeze', look: '立春: everyone +10% 身法' },
  { id: 'yushui', zh: '雨', en: 'Rain', look: '雨水: burns −50%, lightning +50%' },
  { id: 'jingzhe', zh: '惊雷', en: 'Waking Thunder', look: '惊蛰: groups spawn in double bursts half as often; 雷符 chains +1' },
  { id: 'chunfen', zh: '均', en: 'Equinox Balance', look: '春分: enemies +20% speed in the first half; you +20% in the second' },
  { id: 'qingming', zh: '细雨', en: 'Drizzle', look: '清明: puddles on every map; +2 回气' },
  { id: 'guyu', zh: '谷', en: 'Grain Rain', look: '谷雨: +10 收成; enemies +10% HP' },
  { id: 'lixia', zh: '立夏', en: 'Summer Begins', look: '立夏: waves 10% shorter' },
  { id: 'xiaoman', zh: '小满', en: 'Grain Buds', look: '小满: 月华 +20%; prices +10%' },
  { id: 'mangzhong', zh: '芒种', en: 'Grain in Ear', look: '芒种: 5% of kills sprout a healing flower' },
  { id: 'xiazhi', zh: '日长', en: 'Long Day', look: '夏至: waves 10% longer; +1 card choice' },
  { id: 'xiaoshu', zh: '小暑', en: 'Minor Heat', look: '小暑: −2 回气; +10% 攻速' },
  { id: 'dashu', zh: '酷暑', en: 'Scorching Heat', look: '大暑: everyone −10% speed; burns +50%' },
  { id: 'liqiu', zh: '秋风', en: 'Autumn Wind', look: '立秋: gusts push everything every 20 s' },
  { id: 'chushu', zh: '暑退', en: 'Heat Retreats', look: '处暑: take −30% damage for the first 10 s of each wave' },
  { id: 'bailu', zh: '露', en: 'White Dew', look: '白露: +5% 闪避, −2 护甲' },
  { id: 'qiufen', zh: '秋分', en: 'Autumn Equinox', look: '秋分: elites drop 2 镜奁' },
  { id: 'hanlu', zh: '寒', en: 'Cold Dew', look: '寒露: frost patches; enemies −10% speed' },
  { id: 'shuangjiang', zh: '霜', en: 'Frost', look: '霜降: +10% 暴击; 疗效 −20%' },
  { id: 'lidong', zh: '冬藏', en: 'Winter Store', look: '立冬: +5% interest on 月华 held at wave end (max 25)' },
  { id: 'xiaoxue', zh: '小雪', en: 'Light Snow', look: '小雪: enemy shots −20% speed; enemies +10% HP' },
  { id: 'daxue', zh: '大雪', en: 'Heavy Snow', look: '大雪: vision r 520; drops ×1.25' },
  { id: 'dongzhi', zh: '夜长', en: 'Long Night', look: '冬至: 月 weapons +25%; 暗月 on even waves' },
  { id: 'xiaohan', zh: '寒甚', en: 'Deep Cold', look: '小寒: enemies +2 甲; fire +25%' },
  { id: 'dahan', zh: '岁末', en: 'Year\'s End', look: '大寒: bosses −15% HP; adds +50%' },
] as const satisfies readonly Named[];
export type TermModId = (typeof TERM_MOD_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── 镜缘 deeds (31: 9 weapons + 22 items)
/**
 * `stat` names the RunStatKey (types.ts) the deed reads; `mode` 'sum' adds each run's value to the
 * stored progress, 'max' keeps the best single run. `char` / `minDiff` qualify which runs count
 * (照破 as X; 照破 on 明镜 or harder). `alt` is a second way to earn it (墨龙图). Goals are in the
 * stat's own units. Progress lives in MirrorMeta.deeds[id]; unlocked when progress ≥ goal.
 */
interface DeedNamed extends Named {
  readonly unlocks: WeaponId | ItemId;
  readonly stat: RunStatKey;
  readonly goal: number;
  readonly mode: 'sum' | 'max';
  readonly char?: CharacterId;
  readonly minDiff?: number;
  readonly alt?: { readonly stat: RunStatKey; readonly goal: number };
}
export const DEED_REG = [
  // weapons
  { id: 'swordKills', unlocks: 'longquan', stat: 'killsSword', goal: 500, mode: 'sum', zh: '剑下五百', en: 'Five Hundred to the Sword', look: '500 kills with 剑 weapons' },
  { id: 'drunkHundred', unlocks: 'drunkfist', stat: 'peakDrunk', goal: 100, mode: 'max', zh: '一醉方休', en: 'Drunk to the Brim', look: 'reach 醉 100' },
  { id: 'moonHoard', unlocks: 'coindart', stat: 'peakMoonHeld', goal: 300, mode: 'max', zh: '囊中三百', en: 'Three Hundred in the Purse', look: 'hold 300 月华 at once' },
  { id: 'archerWave', unlocks: 'repeater', stat: 'peakShooterWeapons', goal: 4, mode: 'max', zh: '万箭齐发', en: 'A Volley of Arrows', look: 'clear a wave holding 4 弓弩 or 暗器 weapons' },
  { id: 'ghostKills', unlocks: 'peach', stat: 'killsGhost', goal: 200, mode: 'sum', zh: '驱邪二百', en: 'Two Hundred Ghosts Laid', look: '200 kills of 鬼-tagged enemies' },
  { id: 'swordsAloft', unlocks: 'seven', stat: 'peakSwordsAir', goal: 5, mode: 'max', zh: '五剑凌空', en: 'Five Swords Aloft', look: '5 flying swords in the air at once' },
  { id: 'charmFifty', unlocks: 'flute', stat: 'charms', goal: 50, mode: 'sum', zh: '知音五十', en: 'Fifty Kindred Ears', look: 'charm 50 enemies' },
  { id: 'inkFour', unlocks: 'inkstone', stat: 'peakSummons', goal: 4, mode: 'max', zh: '四墨同游', en: 'Four Inks Abroad', look: '4 墨宝 alive at once' },
  { id: 'dodgeHundred', unlocks: 'moonwheel', stat: 'dodges', goal: 100, mode: 'sum', zh: '百避', en: 'A Hundred Dodges', look: 'dodge 100 hits' },
  // items
  { id: 'flyingKills', unlocks: 'swordtomb', stat: 'killsFlying', goal: 1000, mode: 'sum', zh: '千剑之冢', en: 'A Thousand for the Tomb', look: '1,000 flying-sword kills' },
  { id: 'swordsAtTwenty', unlocks: 'wanjian', stat: 'swordsAtW20', goal: 4, mode: 'max', zh: '四剑二十重', en: 'Four Swords at Twenty', look: 'reach wave 20 with 4 or more 剑数' },
  { id: 'inkSix', unlocks: 'dotting', stat: 'peakSummons', goal: 6, mode: 'max', zh: '六墨成军', en: 'Six Inks an Army', look: '6 墨宝 alive at once' },
  { id: 'inkKills', unlocks: 'inkpool', stat: 'killsInk', goal: 1000, mode: 'sum', zh: '墨下千魂', en: 'A Thousand to the Ink', look: '1,000 墨宝 kills' },
  { id: 'painterClear', unlocks: 'inkdragon', stat: 'cleared30', goal: 1, mode: 'max', char: 'painter', alt: { stat: 'peakInkWeapons', goal: 4 }, zh: '画师照破', en: 'The Painter Breaks Through', look: '照破 as 画师, or hold 4 墨宝 weapons' },
  { id: 'stoneChain', unlocks: 'capture', stat: 'peakStoneChain', goal: 5, mode: 'max', zh: '五子连珠', en: 'Five in a Chain', look: 'a chain of 5 stones in one blast' },
  { id: 'poetClear', unlocks: 'jiangjinjiu', stat: 'cleared30', goal: 1, mode: 'max', char: 'poet', zh: '诗仙照破', en: 'The Poet Breaks Through', look: '照破 as 诗仙' },
  { id: 'armorTwenty', unlocks: 'goldenbell', stat: 'peakArmor', goal: 20, mode: 'max', zh: '铜墙二十', en: 'Twenty Armour', look: 'reach 20 护甲' },
  { id: 'guanClear', unlocks: 'needle', stat: 'cleared30', goal: 1, mode: 'max', char: 'guan', zh: '关公照破', en: 'Lord Guan Breaks Through', look: '照破 as 关公' },
  { id: 'speedSixty', unlocks: 'lingbo', stat: 'peakSpeed', goal: 60, mode: 'max', zh: '身轻六成', en: 'Sixty Percent Lighter', look: 'reach +60% 身法' },
  { id: 'dodgeFifty', unlocks: 'osmanthus', stat: 'peakDodge', goal: 50, mode: 'max', zh: '半避', en: 'Half Untouchable', look: 'reach 50% 闪避' },
  { id: 'regenTwenty', unlocks: 'physician', stat: 'peakRegen', goal: 20, mode: 'max', zh: '回气二十', en: 'Twenty Breaths', look: 'reach 20 回气' },
  { id: 'healRun', unlocks: 'penglai', stat: 'healed', goal: 2000, mode: 'max', zh: '一照两千', en: 'Two Thousand in One Run', look: 'heal 2,000 HP in one run' },
  { id: 'burnThirty', unlocks: 'samadhi', stat: 'peakBurning', goal: 30, mode: 'max', zh: '三十焚身', en: 'Thirty Ablaze', look: '30 enemies burning at once' },
  { id: 'moonRun', unlocks: 'treasurebowl', stat: 'moonCollected', goal: 1500, mode: 'max', zh: '一照千五', en: 'Fifteen Hundred in One Run', look: 'collect 1,500 月华 in one run' },
  { id: 'loneBlade', unlocks: 'dugu', stat: 'soloW20', goal: 1, mode: 'max', zh: '独剑二十重', en: 'One Blade to Twenty', look: 'clear wave 20 never holding more than one weapon' },
  { id: 'musicianClear', unlocks: 'ambush', stat: 'cleared30', goal: 1, mode: 'max', char: 'musician', zh: '琴师照破', en: 'The Qin Player Breaks Through', look: '照破 as 琴师' },
  { id: 'curseFive', unlocks: 'innerdemon', stat: 'peakCurse', goal: 5, mode: 'max', zh: '五劫加身', en: 'Five Curses Borne', look: 'reach 5 劫数' },
  { id: 'clearMing', unlocks: 'crackedmirror', stat: 'cleared30', goal: 1, mode: 'max', minDiff: 2, zh: '明镜照破', en: 'Through the Bright Mirror', look: '照破 on 明镜 or harder' },
  { id: 'clearXuan', unlocks: 'watermoon', stat: 'cleared30', goal: 1, mode: 'max', minDiff: 4, zh: '玄镜照破', en: 'Through the Dark Mirror', look: '照破 on 玄镜 or harder' },
  { id: 'charmWave', unlocks: 'boya', stat: 'peakCharmsWave', goal: 10, mode: 'max', zh: '一重十知音', en: 'Ten Friends in a Wave', look: 'clear a wave in which you charmed 10 enemies' },
  { id: 'critWave', unlocks: 'nightcup', stat: 'peakCritsWave', goal: 100, mode: 'max', zh: '一重百暴', en: 'A Hundred Crits in a Wave', look: '100 crits in one wave' },
] as const satisfies readonly DeedNamed[];
export type DeedId = (typeof DEED_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── seals, titles, records, rims, 心镜 faces
/** Seal kinds; keys of MirrorMeta.seals are built by sealKey() in types.ts. */
export const SEAL_REG = [
  { id: 'zhaopoSeal', zh: '照破印', en: 'Breakthrough Seal', look: 'square vermilion seal per companion × 镜境, stamped on the portrait ring' },
  { id: 'vowSeal', zh: '誓印', en: 'Vow Seal', look: 'round seal for 照破 at heat 5, 10, 15 and 20' },
  { id: 'heartSeal', zh: '心印', en: 'Heart Seal', look: 'gold-rimmed seal for completing a companion\'s six 照破印' },
  { id: 'moonSeal', zh: '月印', en: 'Moon Seal', look: 'moon-shaped seal for wave 30 of 今日镜, dated' },
] as const satisfies readonly Named[];
export type SealKind = (typeof SEAL_REG)[number]['id'];

export const TITLE_REG = [
  { id: 'paintImmortal', zh: '画中仙', en: 'Immortal in the Painting', look: '照破 with 墨宝上限 of 8 or more' },
  { id: 'swordImmortal', zh: '剑仙', en: 'Sword Immortal', look: '照破 with 6 or more 剑数' },
  { id: 'netAll', zh: '一网打尽', en: 'One Net for All', look: '50 enemies netted at once' },
  { id: 'nineLives', zh: '九命猫', en: 'Cat of Nine Lives', look: '照破 as 大橘 with a life to spare' },
  { id: 'mirrorMan', zh: '镜中人', en: 'The One in the Mirror', look: 'beat 镜主' },
  { id: 'voidWalker', zh: '空镜行者', en: 'Walker of the Empty Mirror', look: '照破 on 无相' },
  { id: 'migrant', zh: '候鸟', en: 'Migrant Bird', look: '36 候签' },
  { id: 'seasons', zh: '岁时', en: 'All the Seasons', look: 'all 72 候签' },
] as const satisfies readonly Named[];
export type FixedTitleId = (typeof TITLE_REG)[number]['id'];

export const RECORD_REG = [
  { id: 'fastestClear', zh: '最速照破', en: 'Fastest Breakthrough', look: 'real minutes to clear wave 30 (lower is better)' },
  { id: 'bigHit', zh: '最重一击', en: 'Biggest Hit', look: 'largest single hit' },
  { id: 'mostSummons', zh: '墨宝最多', en: 'Most Inks at Once', look: 'most 墨宝 alive at once' },
  { id: 'mostSwords', zh: '飞剑最多', en: 'Most Swords Aloft', look: 'most swords in the air at once' },
  { id: 'highestDrunk', zh: '醉意最浓', en: 'Most Drunk', look: 'highest 醉' },
  { id: 'noHitStreak', zh: '毫发无伤', en: 'Untouched Streak', look: 'most waves in a row without being hit' },
  { id: 'deepest', zh: '入镜最深', en: 'Deepest Wave', look: 'deepest endless wave' },
  { id: 'mostMoon', zh: '月华最丰', en: 'Richest Run', look: 'most 月华 collected in one run' },
] as const satisfies readonly Named[];
export type RecordId = (typeof RECORD_REG)[number]['id'];

/** Mirror rims: the three map rims, and the codex chapter rewards (one per codex category). */
export const RIM_REG = [
  { id: 'haishou', zh: '海兽葡萄镜', en: 'Sea-Beast and Grape Mirror', look: 'bronze rim of sea beasts among grape vines (月湖)' },
  { id: 'guiju', zh: '规矩镜', en: 'TLV Mirror', look: 'bronze rim with T, L and V marks (墨林)' },
  { id: 'touguang', zh: '透光镜', en: 'Magic Mirror', look: 'plain bright rim that casts its back pattern in light (广寒)' },
  { id: 'ruishou', zh: '瑞兽镜', en: 'Auspicious-Beast Mirror', look: 'rim of running auspicious beasts' },
  { id: 'huaniao', zh: '花鸟镜', en: 'Flower-and-Bird Mirror', look: 'rim of flowers and birds' },
  { id: 'yuegong', zh: '月宫镜', en: 'Moon-Palace Mirror', look: 'rim with the moon palace, the rabbit and the osmanthus' },
  { id: 'bagua', zh: '八卦镜', en: 'Eight-Trigram Mirror', look: 'octagonal rim of the eight trigrams' },
  { id: 'panchi', zh: '蟠螭镜', en: 'Coiled-Chi Mirror', look: 'rim of coiled hornless dragons' },
  { id: 'lianhu', zh: '连弧镜', en: 'Linked-Arc Mirror', look: 'rim of linked inward arcs' },
] as const satisfies readonly Named[];
export type RimId = (typeof RIM_REG)[number]['id'];

/** 心镜: 8 pairs of faces (GDD §17.2). `pair` 1..8, `side` A/B; costs are in data/heart.ts. */
interface FaceNamed extends Named { readonly pair: number; readonly side: 'A' | 'B' }
export const HEART_REG = [
  { id: 'heartHp', pair: 1, side: 'A', zh: '固本', en: 'Deep Roots', look: '+2 气血 per rank' },
  { id: 'heartRegen', pair: 1, side: 'B', zh: '养气', en: 'Nourished Breath', look: '+1 回气 per rank' },
  { id: 'heartMoon', pair: 2, side: 'A', zh: '积月', en: 'Saved Moonlight', look: 'start with +10 月华 per rank' },
  { id: 'heartReroll', pair: 2, side: 'B', zh: '巧手', en: 'Deft Hands', look: 'rerolls −4% per rank' },
  { id: 'heartArmor', pair: 3, side: 'A', zh: '铜肤', en: 'Bronze Skin', look: '+1 护甲 per rank' },
  { id: 'heartDodge', pair: 3, side: 'B', zh: '轻身', en: 'Light Body', look: '+2% 闪避 per rank' },
  { id: 'heartPickup', pair: 4, side: 'A', zh: '揽月', en: 'Gather the Moon', look: '+10% 拾取 per rank' },
  { id: 'heartHarvest', pair: 4, side: 'B', zh: '丰年', en: 'Good Year', look: '+2 收成 per rank' },
  { id: 'heartRevive', pair: 5, side: 'A', zh: '回魂', en: 'Return of the Soul', look: 'revive once per run at 30% HP' },
  { id: 'heartWard', pair: 5, side: 'B', zh: '护命', en: 'Life Ward', look: 'survive the first lethal hit of the run at 1 HP' },
  { id: 'heartStand', pair: 6, side: 'A', zh: '镜台', en: 'Mirror Stand', look: '+1 shop slot' },
  { id: 'heartTrade', pair: 6, side: 'B', zh: '善贾', en: 'Shrewd Trader', look: 'weapons sell for +10% per rank' },
  { id: 'heartKeepsake', pair: 7, side: 'A', zh: '宿器', en: 'Old Companion', look: '25% per rank that the starting weapon is tier II' },
  { id: 'heartPack', pair: 7, side: 'B', zh: '行囊', en: 'Travelling Pack', look: 'start with a random 凡 item' },
  { id: 'heartLuck', pair: 8, side: 'A', zh: '福泽', en: 'Blessing', look: '+4 福缘 per rank' },
  { id: 'heartCrit', pair: 8, side: 'B', zh: '慧眼', en: 'Keen Eye', look: '+1% 暴击 per rank' },
] as const satisfies readonly FaceNamed[];
export type HeartFaceId = (typeof HEART_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── in-arena things (atlas kinds)
/** 墨宝 and other allied bodies: atlas `sum:<id>`. */
export const SUMMON_REG = [
  { id: 'moque', zh: '墨雀', en: 'Ink Sparrow', look: '神笔 I: small ink sparrow that pecks' },
  { id: 'moli', zh: '墨鲤', en: 'Ink Carp', look: '神笔 II: ink carp that lunges in a line' },
  { id: 'mohe', zh: '墨鹤', en: 'Ink Crane', look: '神笔 III and the 墨鹤 item: ink crane that dives or pecks' },
  { id: 'mohu', zh: '墨虎', en: 'Ink Tiger', look: '神笔 IV: ink tiger that pounces and taunts' },
  { id: 'yantai', zh: '砚台', en: 'Inkstone Turret', look: 'the 砚台 turret sitting on the paper, ink pooled on top' },
  { id: 'zhihe', zh: '纸鹤', en: 'Paper Crane', look: 'folded white paper crane familiar' },
  { id: 'mozhu', zh: '墨竹', en: 'Ink Bamboo Shoot', look: 'a bamboo stalk sprouting at your feet, firing leaves' },
  { id: 'molong', zh: '墨龙', en: 'Ink Dragon', look: 'long flying ink dragon (墨龙图, 画师 别传)' },
  { id: 'canjian', zh: '残剑', en: 'Broken Sword', look: 'a notched broken blade orbiting you (剑冢)' },
  { id: 'demonSelf', zh: '心魔', en: 'Inner Demon', look: 'purple-ink copy of your companion (心魔 item, an enemy)' },
  { id: 'inkAlly', zh: '点化', en: 'Awakened Ally', look: 'overlay: a converted enemy washed in 花青 with a white outline' },
  { id: 'flowerSprout', zh: '花', en: 'Hoe Flower', look: 'a small flower planted by 花锄 kills' },
] as const satisfies readonly Named[];
export type SummonKind = (typeof SUMMON_REG)[number]['id'];

/** Projectiles: atlas `proj:<id>`. `e…` are enemy shots: white core, 朱砂 rim, 1.5× player size (GDD §20). */
export const PROJ_REG = [
  { id: 'dartStar', zh: '镖', en: 'Dart', look: 'spinning four-point star, 石青 wash' },
  { id: 'coinBlade', zh: '金钱镖', en: 'Gilt Disc', look: 'spinning gilt serrated disc, no square hole' },
  { id: 'sunArrow', zh: '箭', en: 'Arrow', look: 'long arrow with vermilion-lacquer shaft' },
  { id: 'crossBolt', zh: '弩矢', en: 'Bolt', look: 'short stubby crossbow bolt' },
  { id: 'hookLine', zh: '钩', en: 'Hook', look: 'brass hook trailing a fine line' },
  { id: 'flySword', zh: '飞剑', en: 'Flying Sword', look: 'slim sword with a 飞白 streak behind it, 石青 wash' },
  { id: 'noteGlyph', zh: '音符', en: 'Note', look: 'a small curling 工尺 note glyph in pale green' },
  { id: 'inkBlob', zh: '墨丸', en: 'Ink Blob', look: 'round wet ink blob' },
  { id: 'bambooLeaf', zh: '竹叶', en: 'Bamboo Leaf', look: 'a spinning bamboo leaf' },
  { id: 'moonMote', zh: '月魄', en: 'Moon Mote', look: 'small homing shard of moonlight (月魄, 水月)' },
  { id: 'moonDisc', zh: '月轮', en: 'Moon Disc', look: 'silver crescent disc, spinning' },
  { id: 'fireLob', zh: '火符', en: 'Fire Talisman', look: 'burning talisman tumbling in an arc, 藤黄 wash' },
  { id: 'gourdLob', zh: '葫芦', en: 'Gourd', look: 'tumbling wine gourd' },
  { id: 'peachCharm', zh: '桃符', en: 'Peach Charm', look: 'talisman stuck in the ground that bursts (桃木剑 IV)' },
  { id: 'verseGlyph', zh: '诗字', en: 'Verse Glyph', look: 'a single brushed character flying (诗仙 skill)' },
  { id: 'crescentWave', zh: '刀气', en: 'Crescent Wave', look: 'travelling crescent of blade qi (偃月 IV)' },
  { id: 'eFireball', zh: '鬼火', en: 'Fireball', look: 'enemy: white-core fireball with a 朱砂 rim' },
  { id: 'eSeed', zh: '莲子弹', en: 'Lotus Seed', look: 'enemy: hard seed, white core, 朱砂 rim' },
  { id: 'eBubble', zh: '水泡', en: 'Bubble', look: 'enemy: round bubble, white core, 朱砂 rim' },
  { id: 'ePearl', zh: '蜃珠', en: 'Pearl', look: 'enemy: pearl, white core, 朱砂 rim' },
  { id: 'eStone', zh: '飞石', en: 'Stone', look: 'enemy: lobbed stone with a landing shadow' },
  { id: 'eAxe', zh: '飞斧', en: 'Axe', look: 'enemy: spinning axe (樵鬼, 吴刚, 伐桂人)' },
  { id: 'eFrost', zh: '冰棱', en: 'Frost Shard', look: 'enemy: icy shard, white core, 朱砂 rim' },
  { id: 'eGold', zh: '金雨', en: 'Gold Rain', look: 'enemy: gold 月华 shard falling (金蟾王); never a coin' },
  { id: 'eFoxfire', zh: '狐焰', en: 'Fox Flame', look: 'enemy: pink-cinnabar fox-flame' },
  { id: 'eMoonShard', zh: '月刃', en: 'Moon Blade', look: 'enemy: homing moon shard (水中月)' },
  { id: 'eOrb', zh: '魇珠', en: 'Nightmare Orb', look: 'enemy: generic round shot, white core, 朱砂 rim' },
] as const satisfies readonly Named[];
export type ProjKind = (typeof PROJ_REG)[number]['id'];

/** Pickups: atlas `drop:<id>`. Only the three cash kinds are round with a square hole (GDD §16.3). */
export const DROP_REG = [
  { id: 'moonDrop', zh: '月华', en: 'Moonlight', look: 'moon-white shard or pearl with a silver glint; drawn on top' },
  { id: 'moonThick', zh: '浓墨', en: 'Thick Moonlight', look: 'fused, larger moon pearl worth 5' },
  { id: 'goldShard', zh: '金月华', en: 'Gold Moonlight', look: '招财猫 gold shard worth 4 月华; a shard, not a coin' },
  { id: 'carpGold', zh: '金鲤', en: 'Golden Carp', look: '渔翁 golden carp flopping, worth +5 月华' },
  { id: 'crateBox', zh: '镜奁', en: 'Mirror Case', look: 'small lacquered mirror case with a gold clasp' },
  { id: 'lotusSeed', zh: '莲子', en: 'Lotus Seed', look: 'green lotus seed; heals 3' },
  { id: 'heartDrop', zh: '镜心', en: 'Mirror Heart', look: 'glowing round mirror heart dropped by a boss' },
  { id: 'cashCoin', zh: '铜钱', en: 'Copper Coin', look: 'bronze coin with a square hole spinning on its edge (4 frames), glint every 0.6 s' },
  { id: 'cashString', zh: '串钱', en: 'String of Coins', look: 'short string of holed coins that swings as it falls' },
  { id: 'cashTen', zh: '当十', en: 'Ten-Cash Coin', look: 'large holed coin with 当十 in seal script; thin gold ripple on landing' },
] as const satisfies readonly Named[];
export type DropKind = (typeof DROP_REG)[number]['id'];

/** Effects and marks: atlas `fx:<id>`. Player effects are washes at 55–70% opacity in class colours. */
export const FX_REG = [
  { id: 'hitSpark', zh: '击', en: 'Hit', look: 'small ink flick at the impact point' },
  { id: 'critSpark', zh: '暴', en: 'Crit', look: 'vermilion star-burst flick' },
  { id: 'inkBurst', zh: '墨散', en: 'Ink Burst', look: 'death burst of ink wash (then stamped into the arena)' },
  { id: 'splat', zh: '墨渍', en: 'Stain', look: 'dry stain stamped into the arena layer; 3 variants' },
  { id: 'spawnBloom', zh: '晕墨', en: 'Ink Bloom', look: 'wet ink blooming in a circle where an enemy will appear' },
  { id: 'slashArc', zh: '刀光', en: 'Slash', look: 'arc wash of a melee swing, 石青 or ink' },
  { id: 'pulseRing', zh: '音环', en: 'Sound Ring', look: 'pale green expanding ring (乐器)' },
  { id: 'beamRay', zh: '月光', en: 'Moonbeam', look: 'straight moon-white beam with a soft edge' },
  { id: 'boltChain', zh: '电', en: 'Lightning', look: 'jagged 藤黄 lightning segment' },
  { id: 'lightningStrike', zh: '雷击', en: 'Lightning Strike', look: 'vertical bolt landing in a ring' },
  { id: 'burnMark', zh: '灼', en: 'Burning', look: 'small flame licking an enemy' },
  { id: 'bleedMark', zh: '血', en: 'Bleeding', look: 'dark red drops (ink, not gore)' },
  { id: 'stunMark', zh: '晕', en: 'Stunned', look: 'little circling stars' },
  { id: 'charmMark', zh: '惑', en: 'Charmed', look: 'pink heart-knot above the head' },
  { id: 'slowMark', zh: '缓', en: 'Slowed', look: 'blue drag lines at the feet' },
  { id: 'rootMark', zh: '定', en: 'Rooted', look: 'ink tendrils around the feet' },
  { id: 'shieldBubble', zh: '护', en: 'Shield', look: 'moon-white shield ring around you' },
  { id: 'levelRing', zh: '升', en: 'Level Ring', look: 'expanding gold-and-ink ring (mid-wave level up)' },
  { id: 'mergeFlash', zh: '合', en: 'Merge', look: 'brush flash crossing an icon' },
  { id: 'coinRipple', zh: '钱光', en: 'Coin Ripple', look: 'thin gold ripple ring, kept for money alone' },
  { id: 'flowerbed', zh: '花圃', en: 'Flowerbed', look: 'round bed of painted flowers (园丁 skill)' },
  { id: 'netMesh', zh: '网', en: 'Net', look: 'fishing-net mesh circle' },
  { id: 'vortex', zh: '旋', en: 'Vortex', look: 'swirling talisman vortex' },
  { id: 'zhenGlyph', zh: '镇', en: 'Zhen Glyph', look: 'giant brushed 镇 glyph lying on the ground' },
  { id: 'moonPool', zh: '月池', en: 'Moon Pool', look: 'pool of moonlight on the paper' },
  { id: 'webPatch', zh: '蛛网', en: 'Web', look: 'ink spider web on the ground' },
  { id: 'inkPuddle', zh: '墨洼', en: 'Ink Puddle', look: 'dark puddle (墨雨, 墨潮, 清明)' },
  { id: 'sporeCloud', zh: '孢雾', en: 'Spore Cloud', look: 'sickly green-grey spore cloud' },
  { id: 'firePuddle', zh: '火洼', en: 'Fire Puddle', look: 'burning wine puddle' },
  { id: 'stoneBlack', zh: '黑子', en: 'Black Stone', look: 'black go stone on the paper' },
  { id: 'stoneWhite', zh: '白子', en: 'White Stone', look: 'white go stone on the paper' },
  { id: 'stepTrail', zh: '步痕', en: 'Step Trail', look: 'rippling footprints (凌波微步)' },
  { id: 'swordStreak', zh: '剑痕', en: 'Sword Streak', look: '飞白 dry-brush streak behind a sword' },
  { id: 'moonCircle', zh: '月斑', en: 'Moon Circle', look: 'bright drifting circle of moonlight (月影 hazard)' },
  { id: 'rippleRing', zh: '波环', en: 'Ripple Ring', look: 'pale water ring expanding (涟漪 hazard)' },
  { id: 'jadeTile', zh: '玉砖', en: 'Jade Tile', look: 'falling jade tile with its shadow' },
  { id: 'leafGust', zh: '风叶', en: 'Gusting Leaves', look: 'swirling bamboo leaves showing the wind' },
  { id: 'frostPatch', zh: '霜', en: 'Frost Patch', look: 'pale frost on the paper' },
  { id: 'mirageWall', zh: '蜃墙', en: 'Mirage Wall', look: 'misty wall of towers with a gap' },
  { id: 'shockRing', zh: '震', en: 'Shockwave', look: 'ink shockwave ring (stomps, pestle, landings)' },
  { id: 'dustPuff', zh: '尘', en: 'Dust', look: 'small dust puff (rolls, landings)' },
  { id: 'petalBurst', zh: '花瓣', en: 'Petals', look: 'burst of petals (flowers, 桂花精)' },
  { id: 'teleInk', zh: '预兆', en: 'Telegraph Ink', look: 'wet-ink fill texture for telegraphs; fill level = time left' },
  { id: 'bossShadow', zh: '身影', en: 'Boss Shadow', look: 'wide, flat, dark ellipse under a true boss (蜃, 九尾狐, 水中月); its decoys cast none' },
] as const satisfies readonly Named[];
export type FxName = (typeof FX_REG)[number]['id'];

// ─────────────────────────────────────────────────────────────── lookups
/** Every registry, by list name. Tests walk this for uniqueness; the codex walks the entity ones. */
export const REGISTRIES = {
  weapon: WEAPON_REG, item: ITEM_REG, archetype: ARCHETYPE_REG, companion: COMPANION_REG,
  skill: SKILL_REG, passive: PASSIVE_REG, altSkill: ALT_SKILL_REG, map: MAP_REG, hazard: HAZARD_REG,
  monster: MONSTER_REG, elite: ELITE_REG, treasure: TREASURE_REG, affix: AFFIX_REG,
  boss: BOSS_REG, endlessBoss: ENDLESS_BOSS_REG, diff: DIFF_REG, vow: VOW_REG, mutator: MUTATOR_REG,
  termMod: TERM_MOD_REG, deed: DEED_REG, seal: SEAL_REG, title: TITLE_REG, record: RECORD_REG,
  rim: RIM_REG, heart: HEART_REG, summon: SUMMON_REG, proj: PROJ_REG, drop: DROP_REG, fx: FX_REG,
} as const;
export type RegistryName = keyof typeof REGISTRIES;

let index: Map<string, Named> | null = null;
/** Any registry row by id (ids are globally unique). */
export function named(id: string): Named | undefined {
  if (!index) {
    index = new Map();
    for (const list of Object.values(REGISTRIES)) for (const row of list as readonly Named[]) index.set(row.id, row);
  }
  return index.get(id);
}

/** The deed that unlocks a weapon or item, if it is locked at the start. */
export function lockOf(id: WeaponId | ItemId): DeedId | undefined {
  for (const d of DEED_REG) if (d.unlocks === id) return d.id;
  return undefined;
}

/** Items open from the start (53): every item no deed unlocks. */
export const STARTER_ITEMS: readonly ItemId[] = ITEM_REG.map((i) => i.id).filter((id) => !lockOf(id));
