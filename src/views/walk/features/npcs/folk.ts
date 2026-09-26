// 乡邻 · the folk of the painting, each with a name. Every figure of the crowd (crowd.ts, one id per
// spec — the same id on two shifts is one person with a day and a night) and every person of the
// stalls and errands (people.ts, ../minigames/npcs.ts) is someone here: a name, a title, the epithet
// you know them by before you have spoken (「卖菱角的妇人」), a voice, kin, and what they say to whom.
//
// Pure data and logic (no three.js, no DOM), tested in tests/walk-npcs.test.ts. What is said lives in
// folk-lines.ts (the role templates every figure gets for free) and folk-arcs.ts (hand-written stories
// told a beat a day, differently to different companions). Progress is kept in play only:
//   met:<id>             — introduced (the prompt shows 「title·name」 from then on)
//   talk:<id>            — a counter of talks (a 熟客 greeting with {名} from the fourth)
//   arc:<id>:<arc>:<n>   — a beat heard (one beat a day per person: the daily count arc:<id>)
import type { CharacterId } from '../../../../data/characters';
import type { RegionId } from '../../map';
import type { CrowdRole } from './lines';
import { GROUPS_OF, L, countToday, pickDaily, voiced, type CompanionGroup, type Line, type Voiced } from './logic';
import { ARCS, NPC_ARCS } from './folk-arcs';
import { INTROS, REGULAR, ROLE_TALK } from './folk-lines';

/** How someone speaks (their 熟客 greeting follows it). */
export type Voice = 'plain' | 'gossip' | 'shy' | 'gruff' | 'pious' | 'bookish' | 'merry' | 'child';

/** A line in a talk: said by the person, or (by: 'me') by the walker's companion; choices are your replies. */
export interface DLine extends Line {
  by?: 'me';
  choices?: Line[];
  /** What the person says back to each choice (same order). */
  replies?: Line[];
}

export interface Card { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal: string }

export interface Beat {
  lines: Voiced<DLine[]>;
  /** Only after dark (true) or only by day (false). */
  night?: boolean;
  /** Play flags that must be set first (a letter answered, another story told). */
  need?: string[];
  /** Coins (paid as 乡邻 income), a card, a letter sent, a day marked (done[key]) for a letter's `due`. */
  reward?: { coins?: number; card?: Card; mail?: string; mark?: string };
}

export interface Arc {
  id: string;
  /** Whose story this is (companions or @groups); omitted: anyone's, told in their own words. */
  who?: (CharacterId | `@${CompanionGroup}`)[];
  beats: Beat[];
}

export interface Folk {
  id: string;
  /** The name: 老吴 / Old Wu. */
  zh: string;
  en: string;
  /** What they are (shown with the name once met): 更夫 / Watchman. */
  title: Line;
  /** How a stranger would call them: 打更的汉子 / A man with a watchman’s clapper. */
  epithet: Line;
  role: CrowdRole | 'npc';
  region: RegionId;
  voice: Voice;
  /** Family and friends (folk ids). */
  kin?: string[];
  /** Carries a story that must never be culled at 低 quality. */
  keep?: boolean;
  /** Their own calls (a vendor's wares), instead of the role's. */
  calls?: Line[];
}

const f = (id: string, zh: string, en: string, title: Line, epithet: Line, role: CrowdRole | 'npc', region: RegionId, voice: Voice, o: Partial<Folk> = {}): Folk =>
  ({ id, zh, en, title, epithet, role, region, voice, ...o });

// ───────────────────────────── the roster ─────────────────────────────

export const FOLK: Folk[] = [
  // ── 水乡 the water town: the market street
  f('v.qingtuan', '方大', 'Fang Da', L('青团摊', 'Green-cake stall'), L('卖青团的汉子', 'The green-cake man'), 'vendor', 'village', 'merry', {
    calls: [L('青团，刚出笼的青团！', 'Green rice cakes, hot from the steamer!'), L('艾草青团，豆沙馅儿——', 'Mugwort cakes with red-bean filling!')] }),
  f('v.lingjiao', '王四娘', 'Wang Siniang', L('菱角摊', 'Water-chestnut stall'), L('卖菱角的妇人', 'The woman selling water chestnuts'), 'vendor', 'village', 'plain', {
    kin: ['l.linger'], keep: true,
    calls: [L('新鲜菱角嘞——', 'Fresh water chestnuts!'), L('今早才采的红菱——', 'Red chestnuts, picked this morning!')] }),
  f('v.basket', '严六', 'Yan Liu', L('篾匠', 'Basket-weaver'), L('卖竹篮的汉子', 'The basket man'), 'vendor', 'village', 'gruff', {
    calls: [L('竹篮竹筐，结实耐用！', 'Baskets! Sturdy baskets!'), L('竹席凉，竹篮轻——', 'Cool bamboo mats, light baskets!')] }),
  f('v.needle', '苏二娘', 'Su Erniang', L('杂货摊', 'Notions stall'), L('卖针线胭脂的娘子', 'The woman with needles and rouge'), 'vendor', 'village', 'gossip', {
    calls: [L('针头线脑，胭脂花粉——', 'Needles, thread, rouge and powder!'), L('苏州的丝线，杭州的扇——', 'Suzhou silk thread, Hangzhou fans!')] }),
  f('v.ou', '邱二', 'Qiu Er', L('糖藕摊', 'Sweet-lotus stall'), L('卖糖藕的后生', 'The young man selling lotus root'), 'vendor', 'village', 'merry', {
    kin: ['v.qiulao'], calls: [L('桂花糖藕——', 'Lotus root with osmanthus!'), L('糯米塞藕，蜜汁浇头——', 'Lotus stuffed with sticky rice, honey on top!')] }),
  f('v.teaegg', '许三姑', 'Aunt Xu', L('茶叶蛋', 'Tea eggs'), L('煮茶叶蛋的大姐', 'The woman with the tea-egg pot'), 'vendor', 'village', 'gossip', {
    calls: [L('茶叶蛋，热乎的！', 'Tea eggs, still warm!'), L('五香茶叶蛋，两文一个——', 'Five-spice tea eggs, two coins apiece!')] }),
  // the teahouse
  f('v.zheng', '郑老', 'Old Zheng', L('老茶客', 'Old tea drinker'), L('喝茶的老先生', 'The old gentleman at his tea'), 'tea', 'village', 'bookish'),
  f('v.mawu', '马五', 'Ma Wu', L('棋迷', 'Chess fiend'), L('端着茶碗的汉子', 'The man with the tea bowl'), 'tea', 'village', 'merry'),
  f('v.pei', '裴公子', 'Young Master Pei', L('公子', 'Young gentleman'), L('摇扇的白衣公子', 'The young man in white with a fan'), 'tea', 'village', 'bookish'),
  // the river steps and the well
  f('v.axiu', '阿秀', 'A Xiu', L('洗衣妇', 'Washerwoman'), L('捶衣裳的妇人', 'The woman beating the washing'), 'washer', 'village', 'gossip', { kin: ['v.chunyan'], keep: true }),
  f('v.chunyan', '春燕', 'Chunyan', L('洗衣妇', 'Washerwoman'), L('洗衣裳的小媳妇', 'The young wife at the washing'), 'washer', 'village', 'shy', { kin: ['v.axiu'], keep: true }),
  f('v.he', '何三婶', 'Aunt He', L('街坊', 'Neighbour'), L('挎篮子的婶子', 'The aunt with the basket'), 'villager', 'village', 'gossip', { kin: ['v.niuniu'] }),
  f('v.meng', '孟嫂', 'Sister Meng', L('街坊', 'Neighbour'), L('包头巾的嫂子', 'The woman in the headscarf'), 'villager', 'village', 'plain', { kin: ['v.mengda'] }),
  // the children of the square
  f('v.hutou', '虎头', 'Hutou', L('孩童', 'Child'), L('虎头虎脑的小子', 'The sturdy little boy'), 'child', 'village', 'child', { kin: ['v.erya', 'v.shuanzi'], keep: true }),
  f('v.erya', '二丫', 'Erya', L('孩童', 'Child'), L('扎辫子的小丫头', 'The little girl with plaits'), 'child', 'village', 'child', { kin: ['v.hutou'] }),
  f('v.shuanzi', '栓子', 'Shuanzi', L('孩童', 'Child'), L('跑得最慢的孩子', 'The slowest runner'), 'child', 'village', 'child', { kin: ['v.hutou'] }),
  // the lanes by day
  f('v.fan', '老樊', 'Old Fan', L('挑夫', 'Porter'), L('挑担子的汉子', 'The man with the carrying pole'), 'villager', 'village', 'gruff'),
  f('v.guniang', '顾娘子', 'Mistress Gu', L('秀才娘子', 'The scholar’s wife'), L('提篮子的娘子', 'The young wife with a basket'), 'villager', 'village', 'plain', { kin: ['v.guxiucai'] }),
  f('v.yaosao', '姚大嫂', 'Sister Yao', L('街坊', 'Neighbour'), L('背竹篓的嫂子', 'The woman with a back-basket'), 'villager', 'village', 'gossip', { kin: ['v.yaoda'] }),
  f('v.yaoda', '姚大', 'Yao Da', L('卖炭的', 'Charcoal seller'), L('戴斗笠挑担的汉子', 'The man in a bamboo hat with a load'), 'villager', 'village', 'gruff', { kin: ['v.yaosao'] }),
  f('v.guxiucai', '顾秀才', 'Scholar Gu', L('秀才', 'Licentiate'), L('摇扇的蓝衫书生', 'The scholar in blue with a fan'), 'villager', 'village', 'bookish', { kin: ['v.guniang'], keep: true }),
  f('v.nie', '聂五', 'Nie Wu', L('行脚客', 'Traveller'), L('背包袱赶路的人', 'The traveller with a bundle'), 'villager', 'village', 'plain'),
  f('v.feng', '冯老爹', 'Grandpa Feng', L('老街坊', 'Old neighbour'), L('白胡子老爹', 'The white-bearded old man'), 'villager', 'village', 'gruff'),
  f('v.suyun', '素云', 'Suyun', L('绣娘', 'Embroiderer'), L('包绿头巾的姑娘', 'The girl in the green headscarf'), 'villager', 'village', 'shy'),
  // the night
  f('v.wu', '老吴', 'Old Wu', L('更夫', 'Watchman'), L('打更的汉子', 'The man with the watchman’s clapper'), 'watchman', 'village', 'gruff', { keep: true }),
  f('v.qiao', '乔二姐', 'Second Sister Qiao', L('夜归人', 'Late walker'), L('提灯夜归的姑娘', 'The girl walking home by lantern'), 'lantern', 'village', 'shy'),
  f('v.weijiu', '卫九', 'Wei Jiu', L('灯笼匠', 'Lantern-maker'), L('提灯笼的汉子', 'The man with a lantern'), 'lantern', 'village', 'merry'),
  f('v.baolao', '包老三', 'Bao Laosan', L('馄饨担', 'Wonton stall'), L('煮馄饨的汉子', 'The wonton man'), 'snack', 'village', 'merry', {
    calls: [L('馄饨——热乎乎的小馄饨！', 'Wontons! Piping-hot wontons!'), L('夜宵嘞——暖暖身子！', 'A late bite — warm you right up!')] }),
  f('v.luo', '罗二嫂', 'Sister Luo', L('圆子摊', 'Rice-ball stall'), L('卖酒酿圆子的嫂子', 'The woman selling sweet rice balls'), 'snack', 'village', 'plain', {
    calls: [L('桂花酒酿圆子——', 'Rice balls in sweet osmanthus wine!'), L('桂花糕，刚出笼！', 'Osmanthus cakes, fresh from the steamer!')] }),
  f('v.qiulao', '邱老爹', 'Old Qiu', L('栗子摊', 'Chestnut stall'), L('炒栗子的老爹', 'The old man roasting chestnuts'), 'snack', 'village', 'plain', {
    kin: ['v.ou'], calls: [L('糖炒栗子，一包三文！', 'Sugar-roasted chestnuts, three coins a bag!'), L('烤红薯，又香又甜！', 'Roast sweet potatoes, sweet and smoky!')] }),
  f('v.niuniu', '妞妞', 'Niuniu', L('何家小妹', 'The He girl'), L('提兔儿灯的小姑娘', 'The little girl with a rabbit lantern'), 'lantern', 'village', 'child', { kin: ['v.he'] }),
  f('v.song', '宋夫子', 'Master Song', L('老秀才', 'Old scholar'), L('捻须赏灯的老先生', 'The old gentleman admiring the lanterns'), 'lantern', 'village', 'bookish'),
  f('v.mengda', '孟大哥', 'Brother Meng', L('街坊', 'Neighbour'), L('戴小帽的汉子', 'The man in a little cap'), 'lantern', 'village', 'plain', { kin: ['v.meng'] }),
  f('v.shao', '老邵', 'Old Shao', L('艄公', 'Boatman'), L('撑船的艄公', 'The boatman poling the river'), 'boatman', 'village', 'gruff', { keep: true }),

  // ── 荷塘 the lotus lake
  f('l.hu', '胡老三', 'Hu Laosan', L('渔夫', 'Fisherman'), L('船上垂钓的老汉', 'The old man fishing from a boat'), 'fisher', 'lake', 'gruff'),
  f('l.agen', '阿根', 'A Gen', L('夜渔人', 'Night fisher'), L('船头挂灯的渔夫', 'The fisherman with a lamp on his boat'), 'fisher', 'lake', 'shy'),
  f('l.linger', '菱儿', 'Ling’er', L('采菱女', 'Chestnut picker'), L('划小船采菱的姑娘', 'The girl picking chestnuts from a little boat'), 'fisher', 'lake', 'merry', { kin: ['v.lingjiao'], keep: true }),
  f('l.wen', '温如玉', 'Wen Ruyu', L('公子', 'Young gentleman'), L('湖堤上的白衣公子', 'The young man in white on the causeway'), 'villager', 'lake', 'bookish', { kin: ['l.wenwan', 'l.lin'] }),
  f('l.wenwan', '温婉', 'Wen Wan', L('温家小妹', 'Wen’s sister'), L('同行的姑娘', 'The girl walking with him'), 'villager', 'lake', 'shy', { kin: ['l.wen'] }),
  f('l.lin', '林晚照', 'Lin Wanzhao', L('林家小姐', 'Miss Lin'), L('提灯的姑娘', 'The girl with the lantern'), 'lantern', 'lake', 'shy', { kin: ['l.wen'] }),

  // ── 山寺 the mountain temple
  f('m.liaochen', '了尘', 'Liaochen', L('僧', 'Monk'), L('扫地的和尚', 'The monk with the broom'), 'monk', 'mountain', 'pious', { kin: ['m.jueming', 'm.liaofan'] }),
  f('m.liaofan', '了凡', 'Liaofan', L('僧', 'Monk'), L('扫台阶的和尚', 'The monk sweeping the steps'), 'monk', 'mountain', 'pious', { kin: ['m.jueming', 'm.liaochen'] }),
  f('m.jueming', '觉明', 'Jueming', L('老僧', 'Old monk'), L('敲木鱼的老和尚', 'The old monk at the wooden fish'), 'woodfish', 'mountain', 'pious', { kin: ['m.liaochen', 'm.liaofan', 'n.monk'], keep: true }),
  f('m.yindaniang', '殷大娘', 'Auntie Yin', L('香客', 'Pilgrim'), L('背香篮的大娘', 'The woman with the incense basket'), 'pilgrim', 'mountain', 'plain', { kin: ['m.yinlao', 'p.yinsheng'] }),
  f('m.yinlao', '殷老汉', 'Old Yin', L('香客', 'Pilgrim'), L('背包袱的老汉', 'The old man with a bundle'), 'pilgrim', 'mountain', 'plain', { kin: ['m.yindaniang', 'p.yinsheng'], keep: true }),
  f('m.lv', '吕三嫂', 'Sister Lü', L('香客', 'Pilgrim'), L('跪拜的妇人', 'The woman at her prayers'), 'pilgrim', 'mountain', 'shy'),
  f('m.liang', '梁七姑', 'Aunt Liang', L('夜香客', 'Night pilgrim'), L('夜里上山的妇人', 'The woman climbing up by night'), 'pilgrim', 'mountain', 'shy'),

  // ── 梅岭 the plum ridge
  f('p.ouyang', '欧阳先生', 'Master Ouyang', L('老儒', 'Old Confucian'), L('赏梅的老先生', 'The old gentleman admiring the plum'), 'scholar', 'plum', 'bookish'),
  f('p.yinsheng', '殷生', 'Yin Sheng', L('读书郎', 'Student'), L('树下读书的后生', 'The young man reading under the tree'), 'scholar', 'plum', 'shy', { kin: ['m.yinlao', 'm.yindaniang'] }),
  f('p.yezhou', '叶舟', 'Ye Zhou', L('士子', 'Young scholar'), L('踏雪寻梅的书生', 'The scholar walking the plum path'), 'scholar', 'plum', 'bookish', { kin: ['p.yeniang'] }),
  f('p.zhuo', '卓先生', 'Master Zhuo', L('寻梅人', 'Plum-seeker'), L('提灯看梅的人', 'The man looking at plum by lantern'), 'scholar', 'plum', 'gruff'),
  f('p.yeniang', '叶娘子', 'Mistress Ye', L('叶家娘子', 'Ye’s wife'), L('提灯的娘子', 'The woman with a lantern'), 'lantern', 'plum', 'plain', { kin: ['p.yezhou'] }),

  // ── 竹林 the bamboo grove
  f('b.xiang', '向先生', 'Master Xiang', L('竹林客', 'Man of the grove'), L('林中漫步的先生', 'The gentleman walking in the grove'), 'villager', 'bamboo', 'bookish'),
  f('b.tan', '老谭', 'Old Tan', L('笋农', 'Bamboo-shoot farmer'), L('挑笋的农人', 'The man carrying shoots'), 'farmer', 'bamboo', 'plain'),
  f('b.cai', '蔡九', 'Cai Jiu', L('伐竹人', 'Bamboo-cutter'), L('背柴晚归的汉子', 'The man home late with his bundle'), 'farmer', 'bamboo', 'gruff'),

  // ── 家园 the homestead's neighbours
  f('h.geng', '耿大郎', 'Geng Dalang', L('邻家农人', 'Farmer next door'), L('锄地的汉子', 'The man at his hoe'), 'farmer', 'home', 'plain', { kin: ['h.gengsao'], keep: true }),
  f('h.gengsao', '耿大嫂', 'Sister Geng', L('邻家大嫂', 'Neighbour’s wife'), L('挑担的大嫂', 'The woman with the carrying pole'), 'farmer', 'home', 'merry', { kin: ['h.geng'] }),

  // ── the people of the stalls and errands (people.ts, ../minigames/npcs.ts)
  f('n.peddler', '孙七', 'Sun Qi', L('货郎', 'Peddler'), L('货郎', 'Peddler'), 'npc', 'village', 'merry'),
  f('n.storyteller', '钱先生', 'Master Qian', L('说书人', 'Storyteller'), L('说书人', 'Storyteller'), 'npc', 'village', 'merry'),
  f('n.fortune', '袁半仙', 'Yuan the Half-Immortal', L('算命先生', 'Fortune teller'), L('算命先生', 'Fortune teller'), 'npc', 'village', 'bookish'),
  f('n.sugar', '糖人张', 'Sugar-Figure Zhang', L('糖人摊', 'Sugar figures'), L('糖人摊', 'Sugar figures'), 'npc', 'village', 'merry'),
  f('n.flower', '杏儿', 'Xing’er', L('卖花姑娘', 'Flower girl'), L('卖花姑娘', 'Flower girl'), 'npc', 'village', 'child'),
  f('n.farmer', '田老伯', 'Old Tian', L('老农', 'Old farmer'), L('老农', 'Old farmer'), 'npc', 'home', 'plain'),
  f('n.shutong', '小篆', 'Xiaozhuan', L('书童', 'Page boy'), L('书童', 'Page boy'), 'npc', 'village', 'child', { kin: ['n.master'] }),
  f('n.master', '柳先生', 'Master Liu', L('游学先生', 'Travelling scholar'), L('摇扇的先生', 'The gentleman with a fan'), 'npc', 'village', 'bookish', { kin: ['n.shutong'] }),
  f('n.tea', '陆掌柜', 'Proprietor Lu', L('茶博士', 'Tea master'), L('茶博士', 'Tea master'), 'npc', 'village', 'merry'),
  f('n.fisher', '江老汉', 'Old Jiang', L('老渔翁', 'Old fisherman'), L('老渔翁', 'Old fisherman'), 'npc', 'lake', 'gruff'),
  f('n.monk', '了缘', 'Liaoyuan', L('知客僧', 'Guest-master monk'), L('知客僧', 'Gate monk'), 'npc', 'mountain', 'pious', { kin: ['m.jueming'] }),
  f('n.poet', '梅溪居士', 'the Plum Creek Recluse', L('亭中诗人', 'Poet in the pavilion'), L('亭中诗人', 'Poet in the pavilion'), 'npc', 'plum', 'bookish'),
  f('n.kite', '阿蛮', 'A’man', L('放风筝的孩子', 'Kite child'), L('放风筝的孩子', 'Child with a kite'), 'npc', 'bamboo', 'child'),
];

export const FOLK_BY_ID: Record<string, Folk> = Object.fromEntries(FOLK.map((x) => [x.id, x]));

/** Who this is (a crowd spec's id, a stall's id). */
export function folkOf(id: string): Folk | undefined {
  return FOLK_BY_ID[id];
}

/** Someone's stories (a crowd figure's, or a stall keeper's). */
export function arcsOf(id: string): Arc[] {
  return ARCS[id] ?? NPC_ARCS[id] ?? [];
}

// ───────────────────────────── keys ─────────────────────────────

export const metFlag = (id: string) => `met:${id}`;
export const talkKey = (id: string) => `talk:${id}`;
export const arcDayKey = (id: string) => `arc:${id}`;
export const arcFlag = (id: string, arc: string, n: number) => `arc:${id}:${arc}:${n}`;
/** Talks before someone greets you as an old acquaintance (熟客). */
export const REGULAR_AFTER = 3;

/** The prompt's label: the epithet until you have met, then 「title·name」. */
export function folkLabel(x: Folk, met: boolean): Line {
  if (!met) return x.epithet;
  if (x.title.zh === x.zh) return L(x.zh, x.en);
  return L(`${x.title.zh}·${x.zh}`, `${x.title.en} · ${x.en}`);
}

/** The name on their dialogue: the epithet until met, then the name. */
export function folkName(x: Folk, met: boolean): Line {
  return met ? L(x.zh, x.en) : x.epithet;
}

/** Does a story meant for `list` belong to this companion? */
export function arcFor(list: Arc['who'], who: CharacterId): boolean {
  if (!list) return true;
  if (list.includes(who)) return true;
  return (GROUPS_OF[who] ?? []).some((g) => list.includes(`@${g}`));
}

// ───────────────────────────── what is said ─────────────────────────────

export interface TalkState {
  flags: Record<string, true | undefined>;
  counters: Record<string, number>;
  daily: { day: string; counts: Record<string, number> };
  day: string;
  night: boolean;
}

export interface TalkPlan {
  /** First words ever (the introduction) — then the name is known. */
  intro: DLine | null;
  /** An old acquaintance's greeting (holds {名}). */
  regular: DLine | null;
  /** The lines of this talk. */
  lines: DLine[];
  /** A story beat, when this talk is one: its flag, and what it brings. */
  beat: { arc: string; n: number; flag: string; reward?: Beat['reward']; last: boolean } | null;
}

/** The beat of `arc` this companion would hear next (or null: done, not theirs, not the hour, or waiting on something). */
export function arcBeat(x: Folk, arc: Arc, who: CharacterId, s: TalkState): { n: number; beat: Beat } | null {
  if (!arcFor(arc.who, who)) return null;
  const n = arc.beats.findIndex((_, i) => !s.flags[arcFlag(x.id, arc.id, i)]);
  if (n < 0) return null;
  const beat = arc.beats[n];
  if (beat.night !== undefined && beat.night !== s.night) return null;
  if (beat.need && !beat.need.every((k) => s.flags[k])) return null;
  return { n, beat };
}

/**
 * What a figure may say to this companion, by day or night: their words for this companion first, then
 * for its kind (@wen…), then for anyone. `personal` counts the first two (the first talk of a day picks
 * among them, so each companion hears its own; later talks move on through the rest).
 */
export function chatPool(x: Folk, who: CharacterId, night: boolean): { lines: DLine[]; personal: number } {
  if (x.role === 'npc') return { lines: [], personal: 0 };
  const t = ROLE_TALK[x.role];
  const src = night && t.night ? t.night : t.chat;
  const own = src[who] ?? [];
  const kind = (GROUPS_OF[who] ?? []).map((g) => src[`@${g}`]).find((v) => v !== undefined) ?? [];
  const personal = [...own, ...kind];
  return { lines: [...personal, ...src.any], personal: personal.length };
}

/** The line of a talk: the day's own line first, then on through the pool (never the same twice running). */
export function lineOfDay(pool: { lines: readonly DLine[]; personal: number }, day: string, salt: string, n: number): DLine | null {
  const { lines, personal } = pool;
  if (!lines.length) return null;
  const first = pickDaily(personal ? lines.slice(0, personal) : lines, day, salt);
  return lines[(lines.indexOf(first) + n) % lines.length];
}

/**
 * What `x` says to `who` now: an introduction the first time; the next beat of one of their stories
 * (one beat a day per person); otherwise a line of the day (a new one each talk).
 */
export function planTalk(x: Folk, who: CharacterId, s: TalkState): TalkPlan {
  const met = !!s.flags[metFlag(x.id)];
  const talks = s.counters[talkKey(x.id)] ?? 0;
  const intro = met ? null : INTROS[x.id] ?? null;
  // an old acquaintance is greeted by name once a day (from the fourth talk on)
  const firstToday = countToday(s.daily, s.day, talkKey(x.id)) === 0;
  const regular = met && talks >= REGULAR_AFTER && firstToday ? pickDaily(REGULAR[x.voice], s.day, `reg:${x.id}`) : null;
  const plan: TalkPlan = { intro, regular, lines: [], beat: null };
  if (countToday(s.daily, s.day, arcDayKey(x.id)) === 0) {
    for (const arc of arcsOf(x.id)) {
      const b = arcBeat(x, arc, who, s);
      if (!b) continue;
      plan.lines = voiced(b.beat.lines, who);
      plan.beat = { arc: arc.id, n: b.n, flag: arcFlag(x.id, arc.id, b.n), reward: b.beat.reward, last: b.n === arc.beats.length - 1 };
      return plan;
    }
  }
  const line = lineOfDay(chatPool(x, who, s.night), s.day, `${x.id}:${s.night ? 'n' : 'd'}`, countToday(s.daily, s.day, talkKey(x.id)));
  if (line) plan.lines = [line];
  return plan;
}
