// 桃源 · the thirteen villagers (story bible §7): who they are, how they look, where they are at each
// hour and in each stretch of the story, and what they say — to whom. Pure data and logic (no three.js,
// no DOM), tested in tests/taoyuan-story.test.ts; stagehand.ts gives them bodies and story.ts voices.
//
// Progress is play only: `met:ty.<key>` (introduced: the name shows instead of the epithet),
// `talk:ty.<key>` (a counter of talks; the 熟客 greeting with {名} once it reaches 3).
import type { CharacterId } from '../../../../data/characters';
import type { FigureSpec } from '../minigames/npc';
import { pickDaily, voiced, type Voiced } from '../npcs/logic';
import type { VillagerKey } from './hooks';
import { caseOpen, leftValley, type Line, type Phase } from './text';

export type { VillagerKey };

const t = (zh: string, en: string): Line => ({ zh, en });

/** A line in a chat: said by the villager, or (by: 'me') by the walker's companion. */
export interface DLine extends Line { by?: 'me' }
const me = (zh: string, en: string): DLine => ({ zh, en, by: 'me' });

/** Where someone stands (valley-local x, z; +z is south, toward the mouth), what they face, seated or not. */
export interface Spot { x: number; z: number; face?: { x: number; z: number }; sit?: boolean }
const at = (x: number, z: number, fx?: number, fz?: number, sit = false): Spot => ({ x, z, face: fx === undefined ? undefined : { x: fx, z: fz! }, sit });

/** The hours of the valley's ordinary days (常): 晨 5–9, 昼 9–17, 暮 17–19, 夜 19–5. */
export type Part = 'dawn' | 'day' | 'dusk' | 'night';
export function partOf(hour: number): Part {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

/** What they carry (stagehand.ts builds it in the hand). */
export type Prop = 'staff' | 'kite' | 'ladle' | 'basket' | 'shuttle' | 'firewood' | 'gourd' | 'switch' | 'cane' | 'zither' | 'plane' | 'hoe' | 'sprig';

/** A chat line, some only after the case is judged or the stele read. */
export interface ChatLine extends Line { after?: 'solved' | 'stele' }

export interface Villager {
  key: VillagerKey;
  /** Their name: 秦守拙 / Qin Shouzhuo. */
  zh: string;
  en: string;
  /** What they are (shown with the name once met): 里正 / Headman. */
  title: Line;
  /** How a stranger knows them: 拄杖的老人 / An old man with a staff. */
  epithet: Line;
  /** The glyph over their head while they have something to say. */
  mark: string;
  look: FigureSpec;
  prop: Prop;
  /** 夭夭: pale, half there, no shadow; petals drift round her. */
  ghost?: boolean;
  /** Where they are in the valley's ordinary days (null: at home, not about). */
  routine: Record<Part, Spot | null>;
  /** Line 1 is also their introduction (B3). */
  chat: ChatLine[];
  /** For some companions, on the first talk of the day (own → @group → any). */
  companion: Voiced<DLine[] | null>;
  /** The 熟客 greeting (with {名}) once talked to three times. */
  regular: Line;
  /** What a non-witness says while the case is open. */
  caseLine?: Line;
  /** (桂娘) … once 小满 has been found. */
  caseFound?: Line;
  /** A witness of the case (bible §4.4): their talk is the case's while it is open. */
  witness?: boolean;
}

// ───────────────────────────── the thirteen

export const VILLAGERS: Record<VillagerKey, Villager> = {
  qin: {
    key: 'qin', zh: '秦守拙', en: 'Qin Shouzhuo', title: t('里正', 'Headman'), epithet: t('拄杖的老人', 'An old man with a staff'), mark: '里',
    look: { robe: '#6b5a44', trim: '#c9b58e', hat: 'bun', hair: '#e8e4dc', beard: '#e8e4dc' }, prop: 'staff',
    routine: { dawn: at(0.7, -16.2, 0.7, -10), day: at(3.3, -2.6, 5, -2.6, true), dusk: at(8, -11.2, 8, -6, true), night: at(8.6, -11.2, 8.6, -6, true) },
    chat: [
      t('老朽秦守拙，忝为里正。谷里的事，大到修渠，小到丢鸡，都来找我。', 'I am Qin Shouzhuo, the humble headman. Everything in the valley comes to me, from mending the channel to a lost hen.'),
      t('先祖避秦时乱，率妻子邑人来此绝境。算来花开花落，六百回了。', 'Our forebears fled the troubles of Qin with wives, children and neighbours to this cut-off place. The blossom has come and gone six hundred times since.'),
      t('外头的事，你讲，我听。听完了，我还是不出去。', "Tell me of the world outside and I'll listen. When you're done, I still shan't go."),
      { ...t('那一行朱印，我补上了。晚了二十年。', "I've set the red seal on that line now. Twenty years late."), after: 'solved' },
    ],
    companion: {
      any: null,
      scholar: [t('先生写得一手好字，明年的花朝簿，劳你来誊。', 'You write a fine hand, sir. Next year, would you copy out the register?')],
      guan: [t('将军的胡子，比老朽的还长。', 'The general\'s beard is longer even than mine.')],
      fisher: [t('当年那个打鱼的，也坐在你这个位子上。他问得多，吃得少。', 'The fisherman long ago sat just where you sit. He asked a great deal and ate very little.')],
    },
    regular: t('{名}来了，坐。', '{名}, welcome. Sit.'),
    caseLine: t('老朽只求一个实话。', 'All I ask is the truth.'),
  },
  xiaoman: {
    key: 'xiaoman', zh: '秦小满', en: 'Xiaoman', title: t('放纸鸢的孩子', 'The kite boy'), epithet: t('放纸鸢的孩子', 'The kite boy'), mark: '鸢',
    look: { robe: '#d8583a', trim: '#f1d27a', hat: 'buns', scale: 0.72 }, prop: 'kite',
    routine: { dawn: at(22.6, 22.4, 24, 24), day: at(-0.6, 31, -0.6, 26), dusk: at(-16.6, -25.9, -18, -28), night: at(3.4, 14.8, 4.6, 14.2) },
    chat: [
      t('我叫小满！阿爷的阿爷的阿爷的……反正我是最小的。', "I'm Xiaoman! Grandpa's grandpa's grandpa's… anyway, I'm the youngest."),
      t('外头的天，也是这个颜色吗？', 'Is the sky outside this colour too?'),
      t('我的纸鸢飞得最高，能看见山外头——其实只看见云。', 'My kite flies highest — it can see over the hills. Well… it sees clouds.'),
      t('树洞是我的，你不许告诉阿黍。', "The hollow's mine. Don't you dare tell A Shu."),
    ],
    companion: {
      any: null,
      rabbit: [t('兔兔，你在月亮上吃什么？', 'Bunny, what do you eat on the moon?')],
      swordsman: [t('教我跳那么高！就教一下！', 'Teach me to jump that high! Just once!')],
      cat: [t('（他想把大橘抱起来，没抱动。）……好沉。', '(He tries to lift the cat and fails.) …So heavy.')],
    },
    regular: t('{名}！你来找我玩啦？', '{名}! Have you come to play?'),
    witness: true,
  },
  guiniang: {
    key: 'guiniang', zh: '桂娘', en: 'Gui Niang', title: t('小满他娘 · 掌勺', "Xiaoman's mother · the cook"), epithet: t('系围裙的妇人', 'A woman in an apron'), mark: '厨',
    look: { robe: '#8fa37a', trim: '#e6dcc4', apron: '#efe7d6', hat: 'bun' }, prop: 'ladle',
    routine: { dawn: at(-3, 3.2, -3, 2), day: at(10.8, -11, 10.8, -9, true), dusk: at(3.7, -2.6, 4.6, -2.6), night: null },
    chat: [
      t('我是小满他娘，今晚的菜都归我管。饿了就说，别客气。', "I'm Xiaoman's mother, and tonight's food is my business. If you're hungry, say so."),
      t('杀鸡设酒，是祖上的规矩。可那只鸡是我养大的。', "Killing a hen for a guest is our forebears' custom. I raised that hen, mind."),
      t('年轻时我也想过出去。后来有了小满——也不是不想了，是想不过来了。', 'When I was young I thought of going out too. Then Xiaoman came — not that I stopped wanting; I just ran out of time to.'),
      t('小满要是缠着你，拿块糕打发他。', 'If Xiaoman pesters you, bribe him with a cake.'),
    ],
    companion: {
      any: null,
      gardener: [t('你手上有泥，是个种地的。来，尝尝我腌的笋。', 'Soil on your hands — a grower. Here, try my pickled shoots.')],
      cat: [t('嘘——鱼头，别让杜二看见。', "Shh — a fish head. Don't let Du Er see.")],
      change: [t('仙子也吃饭吗？……那就多吃一口。', 'Do immortals eat? …Then have another mouthful.')],
    },
    regular: t('{名}，锅里给你留了一碗。', '{名}, I saved you a bowl.'),
    caseLine: t('小满……谁看见我的小满了？', 'Xiaoman… has anyone seen my Xiaoman?'),
    caseFound: t('谢谢你。', 'Thank you.'),
  },
  sang: {
    key: 'sang', zh: '桑三娘', en: 'Sang Sanniang', title: t('管蚕的', 'Keeper of the silkworms'), epithet: t('挎桑篮的妇人', 'A woman with a basket of mulberry leaves'), mark: '蚕',
    look: { robe: '#3f6f73', trim: '#e9c46a', apron: '#dfe6d2', hat: 'bun' }, prop: 'basket',
    routine: { dawn: at(-28, 1.4, -29, 0), day: at(-21.5, 8.9, -24, 8.6, true), dusk: at(-22, 3.4, -22, 0, true), night: at(-22, 3.4, -22, 0, true) },
    chat: [
      t('桑三娘，管蚕的。今夜的采桑舞，我领。', 'Sang Sanniang. I keep the silkworms, and tonight I lead the mulberry dance.'),
      t('蚕娇气：怕烟，怕酒，怕生人说话大声。', 'Silkworms are delicate: they hate smoke, and wine, and strangers talking loudly.'),
      t('这杯不是给你的。……坐吧，另给你倒一杯。', "That cup isn't for you. …Sit — I'll pour you another."),
      { ...t('桃叶织的最后一匹布，我没剪。等她回来自己剪。', "The last bolt Taoye wove — I haven't cut it. She can cut it herself when she's back."), after: 'solved' },
      { ...t('……四十年。他一直在门外。', '…Forty years. He was outside the gate all that time.'), after: 'stele' },
    ],
    companion: {
      any: null,
      change: [t('你也等过人吗？', 'Have you ever waited for someone?'), me('等过。所以不劝你。', "I have. That's why I won't lecture you.")],
      fisher: [t('桑远走的时候，说要去学打鱼。外头的水，是什么样的？', 'When Sang Yuan left, he said he\'d learn to fish. What is the water like out there?')],
    },
    regular: t('{名}，蚕刚醒，小声些。', '{名} — the worms have just woken; softly.'),
    witness: true,
  },
  taoye: {
    key: 'taoye', zh: '桑桃叶', en: 'Taoye', title: t('织布的姑娘', 'The weaver'), epithet: t('粉衣的姑娘', 'A girl in peach pink'), mark: '织',
    look: { robe: '#f2b8c6', trim: '#fff4ea', hat: 'bun' }, prop: 'shuttle',
    routine: { dawn: at(-3.2, 9.4, -1.5, 10), day: at(-25.9, 2.6, -25.9, 3.7, true), dusk: at(-17.4, -25.3, -18, -28), night: null },
    chat: [
      t('桃叶。……我织布的。', 'Taoye. …I weave.'),
      t('山外的人，说话算数吗？', 'Do people outside keep their word?'),
      t('我数过，谷里一共三百一十二棵桃树。外头有多少？', "I've counted: there are three hundred and twelve peach trees in the valley. How many are there outside?"),
      t('别告诉我娘，你看见我缝草鞋。', "Don't tell Mother you saw me sewing sandals."),
    ],
    companion: {
      any: null,
      musician: [t('（她哼起一支没人教过的曲子。）这是我爹走前唱的，我只记得半句。', '(She hums a tune nobody taught her.) My father sang this before he left. I only remember half.')],
      swordsman: [t('外头……会有人欺负他吗？', 'Out there… will anyone bully him?'), me('有我在，不会。', "Not while I'm around.")],
      painter: [t('你能画一座外头的桥给我看吗？', 'Could you paint me a bridge from outside?')],
    },
    regular: t('{名}……你又来了。（她笑了一下。）', '{名}… you came again. (A small smile.)'),
    witness: true,
  },
  ruan: {
    key: 'ruan', zh: '阮青', en: 'Ruan Qing', title: t('阮郎 · 砍柴的', 'Ruan Lang · woodcutter'), epithet: t('披蓑衣的后生', 'A young man in a straw cape'), mark: '樵',
    look: { robe: '#5b6b3a', trim: '#b58a52', hat: 'bamboo', hatColor: '#c9a86a', cape: '#9b8a5e' }, prop: 'firewood',
    routine: { dawn: at(15.4, -29.2, 16, -31), day: at(18.8, 7, 20.5, 6.8), dusk: at(-16.2, -25.6, -18, -28), night: at(1.2, 1.6, 0, 0) },
    chat: [
      t("阮青，砍柴的。大家叫我阮郎——过了今夜，就叫'出去的那个'了。", "Ruan Qing, woodcutter. Everyone calls me Ruan Lang — after tonight it'll be 'the one who left'."),
      t('外头的山，比这一圈山高吗？', 'Are the mountains outside higher than ours?'),
      t('我这辈子砍的柴，堆起来能把谷口堵上。', "All the wood I've cut in my life, stacked up, would block the valley mouth."),
      t('秦老说，印盖了，就找得到回来的路。你信吗？', "Elder Qin says once the pass is stamped you'll find the way back. Do you believe that?"),
    ],
    companion: {
      any: null,
      guan: [t('将军，外头打仗吗？', 'General, is there war outside?'), me('一直打。所以你要记得回来。', "Always. That's why you must remember to come back.")],
      swordsman: [t('你走过的路，比我砍过的树还多吧？', "You've walked more roads than I've felled trees, haven't you?")],
      taoist: [t('小道长，给我画一道平安符吧。', 'Little master, draw me a talisman for a safe road.')],
    },
    regular: t('{名}！外头的事，再讲一件！', '{名}! Tell me one more thing about outside!'),
    witness: true,
  },
  duer: {
    key: 'duer', zh: '杜二', en: 'Du Er', title: t('酿酒的', 'The brewer'), epithet: t('提酒葫芦的汉子', 'A man with a wine gourd'), mark: '酒',
    look: { robe: '#8a3b2e', trim: '#d9b27c', apron: '#5a4a3a', hat: 'cap', hatColor: '#3a2f28', beard: '#2a2420' }, prop: 'gourd',
    routine: { dawn: at(20.3, 7.4, 22, 7.4), day: at(20.3, 4.6, 18, 4.6), dusk: at(5.5, -2.2, 4.6, -2.2), night: at(20.4, 5.8, 17, 5.8, true) },
    chat: [
      t('杜二，酿酒的！谷里的酒，都过我这双手！', 'Du Er, brewer! Every drop in the valley came through these two hands!'),
      t('新醅淡，陈酿香。人也一样。', 'New brew is thin, aged wine is fragrant. People are the same.'),
      t('我婆娘泡的桃花茶，比我的酒好喝。……不说了，喝酒。', "My wife's peach-blossom tea was better than my wine. …Never mind. Drink."),
      { ...t('那晚冤枉了你，这坛我请。', "I wronged you that night. This jar's on me."), after: 'solved' },
    ],
    companion: {
      any: null,
      poet: [t('你这酒量……是山外的神仙吧？', 'With a head like yours… you must be an immortal from outside.')],
      guan: [t('将军，这碗敬你！', "General, this bowl's for you!"), me('饮胜。', 'Drink deep.')],
      rabbit: [t('兔子喝不喝酒？——不喝？那喝桃花茶。', 'Does a rabbit drink? — No? Then peach-blossom tea.')],
    },
    regular: t('{名}！老规矩，新醅一碗！', '{名}! The usual — a bowl of new brew!'),
    witness: true,
  },
  ashu: {
    key: 'ashu', zh: '阿黍', en: 'A Shu', title: t('放鹅的孩子', 'The goose-boy'), epithet: t('赶鹅的孩子', 'A boy driving geese'), mark: '鹅',
    look: { robe: '#c8a24a', trim: '#6b5a3a', hat: 'none', hair: '#2a241e', scale: 0.8 }, prop: 'switch',
    routine: { dawn: at(24, 20.4, 27, 17.5), day: at(7.4, 16.6, 6, 15.6), dusk: at(20.6, 10.6, 20.5, 6.8), night: at(4.8, 14.2, 3.4, 14.8) },
    chat: [
      t('我是阿黍！谷里跑得最快的就是我——鹅不算。', "I'm A Shu! Fastest in the valley — geese don't count."),
      t('我一口气能憋到溪那头。你信不信？', "I can hold my breath all the way across the stream. Bet you don't believe me."),
      t('小满说他有个树洞。我早知道在哪儿，我不说。', "Xiaoman says he's got a secret hollow. I've known where it is for ages. I'm not telling."),
      t('叔说明年我就能帮着踩曲了。', 'Uncle says next year I can help tread the yeast.'),
    ],
    companion: {
      any: null,
      cat: [t('（他和几只鹅一起追着大橘跑。）别跑！我就摸一下！', "(He and the geese chase the cat.) Don't run! I just want to stroke you!")],
      rabbit: [t('比比谁跳得远！', "Let's see who jumps further!")],
      swordsman: [t('你那一下怎么跳的？再来一遍！', 'How did you do that jump? Do it again!')],
    },
    regular: t('{名}，今天我抓了三条鱼！……两条半。', '{名}, I caught three fish today! …Two and a half.'),
    caseLine: t('我可什么都没干！我一直跟着叔搬坛子。', "I didn't do anything! I was carrying jars with Uncle the whole time."),
  },
  liupo: {
    key: 'liupo', zh: '柳婆', en: 'Liu Po', title: t('看香的', 'Keeper of the incense'), epithet: t('拄拐的老婆婆', 'An old woman with a cane'), mark: '香',
    look: { robe: '#4a4f5c', trim: '#b9b2a4', hat: 'bun', hair: '#cfcac2' }, prop: 'cane',
    routine: { dawn: at(0.4, -24.3, 0.4, -26), day: at(1, -18.6, 1, -14, true), dusk: at(-6.4, -9.6, -3, -9), night: at(-1, -16.2, -1, -12) },
    chat: [
      t('柳婆，看香的。祠堂的香，六十年没断过。', "Liu Po. I keep the incense. The shrine's incense hasn't gone out once in sixty years."),
      t('香篆一格一个时辰。香走到哪儿，日子就到哪儿。', "One section of the incense seal per double-hour. Wherever the ember is, that's where the day is."),
      t('眼睛不中用了，鼻子还中用。', 'My eyes are no use any more, but my nose still is.'),
      { ...t('如今压香，小满替我数针。那孩子，数得比我准。', 'These days Xiaoman counts the pins for me. He counts better than I ever did.'), after: 'solved' },
    ],
    companion: {
      any: null,
      taoist: [t('小道长身上是什么香？……哦，是符纸烧的味儿。', 'What incense is that on you, little master? …Ah, burnt talisman paper.')],
      cat: [t('猫儿，别上供桌！', 'Cat, off the altar!')],
      scholar: [t('你念念这香谱，老婆子看不清了。', "Read me the incense book, would you? I can't make it out any more.")],
    },
    regular: t('是{名}吧？听脚步就知道。', "That's {名}, isn't it? I know your step."),
    witness: true,
  },
  shigu: {
    key: 'shigu', zh: '石瞽', en: 'Shi Gu', title: t('弹琴的盲翁', 'The blind zither player'), epithet: t('抱琴的盲翁', 'A blind old man with a zither'), mark: '琴',
    look: { robe: '#e3ddd0', trim: '#7c8a8f', hat: 'bald', beard: '#f0ede6', sit: true }, prop: 'zither',
    routine: { dawn: at(-12.1, -13.8, -9, -11.5, true), day: at(5, -2.6, 3.3, -2.6, true), dusk: at(-6.6, -5.4, -4, -5, true), night: at(-12.1, -13.8, -9, -11.5, true) },
    chat: [
      t('石瞽。瞎子弹琴，弹给看得见的人听。', 'Shi Gu. A blind man plays the zither for those who can see.'),
      t('你的脚步，是山外的脚步——急。', 'Your footsteps are outside footsteps — hurried.'),
      t('青鸟认得路，比人认得清。', 'The bluebirds know the way better than people do.'),
      t('花落有声。你们听不见，是走得太快。', "Falling petals make a sound. You don't hear it because you walk too fast."),
    ],
    companion: {
      any: null,
      musician: [t('知音难得。来，《流水》你起头。', "A true listener is rare. Come — you begin 'Flowing Water'.")],
      player: [t('你下棋，我听子。一步一声，便知输赢。', "You play; I'll listen to the stones. One click per move, and I'll know who wins.")],
      change: [t('这位的脚步没有声音。……是月亮上来的吧。', "This one's steps make no sound. …From the moon, I think.")],
    },
    regular: t('{名}，坐下听一曲。', '{名}, sit and hear a tune.'),
    caseLine: t('我什么都没看见。', 'I saw nothing.'),
  },
  lusan: {
    key: 'lusan', zh: '鲁三', en: 'Lu San', title: t('木匠', 'The carpenter'), epithet: t('系皮围裙的木匠', 'A carpenter in a leather apron'), mark: '木',
    look: { robe: '#7a6a55', trim: '#c2a57a', apron: '#a78b62', hat: 'cap', hatColor: '#4a3f33', beard: '#3a332c' }, prop: 'plane',
    routine: { dawn: at(18, -9, 18, -9.9), day: at(4.6, 11.2, 3.2, 12.1), dusk: at(18.9, -9, 18.9, -9.9, true), night: null },
    chat: [
      t('鲁三。木匠。', 'Lu San. Carpenter.'),
      t('那只漆匣是我打的。榫头，不用一颗钉。', 'I made that lacquer box. Not one nail in the joints.'),
      t('这根杖，给阮郎的。……别告诉他。', "This staff's for Ruan Lang. …Don't tell him."),
      { ...t('杖送出去了。他拄着走的。', "The staff's gone. He walked out leaning on it."), after: 'solved' },
    ],
    companion: {
      any: null,
      swordsman: [t('你那把剑，鞘松了。放下，我给你紧紧。', "Your sword sits loose in its scabbard. Put it down — I'll tighten it.")],
      gardener: [t('桃木好，辟邪，也好刨。', "Peachwood's good: keeps off evil, planes nicely.")],
      guan: [t('（他直起腰，难得说了一整句。）将军的青龙刀，柄是什么木？', "(He straightens up and manages a whole sentence.) General — what wood is your Green Dragon blade's shaft?")],
    },
    regular: t('（点头。）{名}。', '(A nod.) {名}.'),
    caseLine: t('活计单在案上。自己看。', "The job list's on the bench. Read it yourself."),
  },
  gegu: {
    key: 'gegu', zh: '葛姑', en: 'Ge Gu', title: t('种药的 · 数花的', 'Herbalist · counter of petals'), epithet: t('荷药锄的女子', 'A woman with an herb hoe'), mark: '药',
    look: { robe: '#6e7f5a', trim: '#e8d7b0', hat: 'bamboo', hatColor: '#d2b98a' }, prop: 'hoe',
    routine: { dawn: at(26, -18.7, 26, -20), day: at(31, -7.6, 34, -8), dusk: at(24, -15.4, 24, -12, true), night: at(26.2, -18.7, 26, -20) },
    chat: [
      t('葛姑，种药的，顺带数花。', 'Ge Gu. I grow herbs — and count petals on the side.'),
      t('花落得匀，是因为谷里没有风。没有风，是因为没有外头。', "The petals fall evenly because there's no wind here. There's no wind because there's no outside."),
      t('这几年，花一年比一年落得慢。我还没想明白。', "These last years the petals fall a little slower each year. I haven't worked out why."),
      t('你身上沾着山外的草籽。别动——我要收起来。', "You've got seeds from outside on you. Hold still — I'm keeping them."),
    ],
    companion: {
      any: null,
      gardener: [t('你认得这个？……外头也有？那我就放心了。', 'You know this plant? …It grows outside too? Then I can rest easy.')],
      taoist: [t('你们炼丹，用不用桃胶？', 'Do you use peach gum in your elixirs?')],
      rabbit: [t('捣药的兔子！来，帮我把这臼川芎捣了。', 'A medicine-pounding rabbit! Here, pound this mortar of lovage for me.')],
    },
    regular: t('{名}，今天的花，比昨天快了一点。你来了的缘故。', '{名}, the petals are a touch faster today. Because you came.'),
    caseLine: t('花不说谎。去我的石盆看看。', "Petals don't lie. Come and look at my stone basin."),
  },
  yaoyao: {
    key: 'yaoyao', zh: '夭夭', en: 'Yaoyao', title: t('桃花之灵', 'Spirit of the peach'), epithet: t('花中的女子', 'A woman made of blossom'), mark: '桃',
    look: { robe: '#fbe3ea', trim: '#f7a8b8', hat: 'bun', hair: '#5a3a3a' }, prop: 'sprig', ghost: true,
    routine: { dawn: at(0, -35.4, 0, -30), day: null, dusk: null, night: null },
    chat: [
      t("桃之夭夭——这名字，是一个念诗的人给我起的。他后来也没再来。", "'The peach tree, young and lovely' — a man reciting poetry gave me that name. He never came back either."),
      t('你来了，花就落得快一点。', 'When you come, the petals fall a little faster.'),
      t('此中之事，不足为外人道——可你已不是外人。', "What happens here is not for outsiders — but you aren't one any more."),
    ],
    companion: {
      any: null,
      change: [t('广寒一别，三千年了。', 'Three thousand years since the Moon Palace.'), me('你还是这么爱笑。', 'You still laugh as much as ever.')],
      poet: [t("你那句'桃花流水'，我听了一千遍了。写句新的。", "I've heard your 'peach petals on the water' a thousand times. Write me a new one.")],
      taoist: [t('那颗桃，别急着吃。种下去。', "That peach — don't eat it yet. Plant it.")],
    },
    regular: t('{名}，早。', 'Morning, {名}.'),
  },
};

export const VILLAGER_KEYS = Object.keys(VILLAGERS) as VillagerKey[];
export const villagerId = (k: VillagerKey) => `ty.${k}` as const;
export const metFlag = (k: VillagerKey) => `met:ty.${k}`;
export const talkKey = (k: VillagerKey) => `talk:ty.${k}`;
/** Talks before the 熟客 greeting. */
export const REGULAR_AFTER = 3;

/** The name in a prompt or over a line: 「秦守拙 · 里正」 once met, the epithet before. */
export function labelOf(k: VillagerKey, met: boolean): Line {
  const v = VILLAGERS[k];
  if (!met) return v.epithet;
  return v.title.zh === v.zh ? t(v.zh, v.en) : t(`${v.zh} · ${v.title.zh}`, `${v.en} · ${v.title.en}`);
}
/** The speaker's name on a line (the name once met, the epithet before). */
export function nameOf(k: VillagerKey, met: boolean): Line {
  const v = VILLAGERS[k];
  return met ? t(v.zh, v.en) : v.epithet;
}

// ───────────────────────────── where they are

/** Where people stand in each stretch of the story (null: not there); a missing key: their day's routine. */
export const STAGING: Record<Exclude<Phase, 'chang'>, Partial<Record<VillagerKey, Spot | null>>> = {
  // B2–B3: an ordinary afternoon; 小满 flies his kite on the terrace; the elder comes up from the bridge
  arrive: { xiaoman: at(-0.6, 31, -0.6, 26), qin: at(-4.4, 21.5, -3, 36), yaoyao: null },
  // after the feast (酉): at the tables; 杜二 back at his counter for the jar
  feast: {
    qin: at(4.6, -3.9, 4.6, 0), duer: at(20.3, 4.6, 16, 4.6), shigu: at(2.2, -2.8, 4.6, -1.3, true),
    xiaoman: at(3.75, -2, 5.5, -2, true), guiniang: at(3.4, -3.4, 4.6, -1.3), sang: at(3.75, 1.3, 5.5, 1.3, true), taoye: at(3.75, 2.4, 5.5, 2.4, true),
    ruan: at(5.45, -2, 3.7, -2, true), ashu: at(5.45, -0.8, 3.7, -0.8, true), lusan: at(5.45, 1.3, 3.7, 1.3, true), liupo: at(5.45, 2.4, 3.7, 2.4, true),
    gegu: at(3.75, -0.8, 5.5, -0.8, true), yaoyao: null,
  },
  // 戌: the jar is in the hall; 柳婆 waits at the gate with the guest lantern; 小满 has slipped away
  xu: {
    qin: at(1.6, -15.8, 0, -12), liupo: at(-1, -16.1, -1, -12), xiaoman: null, yaoyao: null,
    shigu: at(-12.1, -13.8, -9, -11.5, true), duer: at(5.45, -2, 3.7, -2, true), ashu: at(5.45, -0.8, 3.7, -0.8, true),
    guiniang: at(3.4, -3.4, 4.6, -1.3), sang: at(3.75, 1.3, 5.5, 1.3, true), taoye: at(3.75, 2.4, 5.5, 2.4, true),
    ruan: at(-1.2, 1.8, 0, 0), lusan: at(5.45, 1.3, 3.7, 1.3, true), gegu: at(3.75, -0.8, 5.5, -0.8, true),
  },
  // 亥: all at the square for the dance (the dancers on the ring round the pole)
  hai: {
    sang: at(0, 3.4, 0, 0), taoye: at(2.4, 2.4, 0, 0), guiniang: at(3.4, 0, 0, 0), gegu: at(2.4, -2.4, 0, 0),
    ashu: at(0, -3.4, 0, 0), ruan: at(-2.4, -2.4, 0, 0), duer: at(-3.4, 0, 0, 0), lusan: at(-2.4, 2.4, 0, 0),
    qin: at(-5.6, -1.6, 0, 0), liupo: at(-5.4, 1.4, 0, 0, true), shigu: at(-4.6, -3.6, 0, 0, true), xiaoman: null, yaoyao: null,
  },
  // 子: the procession has come to the shrine; the elder at the hall door
  zi: {
    qin: at(0.2, -21.6, 0, -25), liupo: at(-1.9, -20.6, 0, -25), guiniang: at(2.0, -20.3, 0, -25), duer: at(2.6, -19.2, 0, -25),
    ruan: at(-2.3, -19.8, 0, -25), taoye: at(-2.6, -18.7, 0, -25), sang: at(-1.3, -18.6, 0, -25), ashu: at(2.8, -18.4, 0, -25),
    lusan: at(3.3, -20.4, 0, -25), gegu: at(1.1, -18.3, 0, -25), shigu: at(-12.1, -13.8, -9, -11.5, true), xiaoman: null, yaoyao: null,
  },
  // 案: the witnesses where bible §4.4 puts them; the elder in the courtyard; 小满 asleep in the hollow
  case: {
    qin: at(0.8, -19, 0, -14), liupo: at(-1, -16.1, -1, -12), duer: at(20.3, 4.6, 16, 4.6), ruan: at(1.2, 1.6, 0, 6),
    taoye: at(-22, 3.4, -22, 0), sang: at(-21.5, 8.9, -24, 8.6, true), xiaoman: at(-17.5, -26.9, -17.7, -27.3, true),
    guiniang: at(-2.2, 3.4, 0, 6), ashu: at(19.4, 7.2, 20.3, 4.6), shigu: at(-12.1, -13.8, -9, -11.5, true),
    lusan: at(18, -9, 18, -9.9), gegu: at(26, -18.7, 26, -20), yaoyao: null,
  },
  // 卯: dawn after the night; everyone about their mornings (夭夭 is B7's)
  dawn: { yaoyao: null },
  // B8: they line the banks by the terrace; 小满 and the elder at the terrace
  farewell: {
    qin: at(-2.6, 34.2, 0, 38), xiaoman: at(-0.4, 34.6, 0, 38), guiniang: at(-3.6, 31.6, 0, 38), sang: at(-5.4, 29, -2, 34),
    taoye: at(-2.6, 29.6, 0, 34), ruan: at(-4.2, 28.2, 0, 34), duer: at(-5.6, 26, -2, 34), ashu: at(-2.4, 27.4, 0, 34),
    liupo: at(-6, 30.6, -2, 34), shigu: at(-6.6, 33, -2, 36, true), lusan: at(-3.2, 24.8, 0, 34), gegu: at(-6.2, 23.4, -2, 34), yaoyao: null,
  },
};

type Flags = Readonly<Record<string, true | undefined>>;

/**
 * Where a villager is now: in the story's staging, or their routine at this hour of an ordinary day.
 * null: not about (at home, gone out into the world, or 夭夭 outside her dawn).
 */
export function spotOf(k: VillagerKey, phase: Phase, part: Part, f: Flags, hour = 12): Spot | null {
  // 阮郎 and 桃叶 went out with their stamped passes (B6); 夭夭 only at dawn, before seven
  if ((k === 'ruan' || k === 'taoye') && leftValley(f) && phase !== 'case') return null;
  if (k === 'yaoyao') return phase === 'chang' && part === 'dawn' && hour < 7 && f['ty:b7'] ? VILLAGERS.yaoyao.routine.dawn : null;
  // after B2: the elder and 小满 wait by the mouth for you to follow
  if (phase === 'arrive' && f['ty:b2'] && (k === 'qin' || k === 'xiaoman')) return k === 'qin' ? at(-0.4, 36.4, 0, 42) : at(-1.9, 37.3, 0, 42);
  if (phase !== 'chang') {
    const s = STAGING[phase];
    if (k in s) return s[k] ?? null;
    return VILLAGERS[k].routine[phase === 'dawn' ? 'dawn' : 'day'];
  }
  // 小满 goes home at nine (the fireflies are 阿黍's after that)
  if (k === 'xiaoman' && part === 'night' && (hour >= 21 || hour < 5)) return null;
  return VILLAGERS[k].routine[part];
}

// ───────────────────────────── what they say

export interface TalkState {
  flags: Flags;
  /** Talks with them ever (before this one) and today. */
  total: number;
  today: number;
  day: string;
}

export interface TalkPlan {
  lines: DLine[];
  /** This talk introduces them (their first line): set met:ty.<key>. */
  meet: boolean;
}

/**
 * A chat with a villager (not the case's, not a beat's): their introduction if you have not met,
 * then — the 熟客 greeting once you are a regular, a companion's own line on the first talk of the
 * day, or the day's line (rotating with each talk). While the case is open a non-witness says their
 * case line. Never empty.
 */
export function talkPlan(k: VillagerKey, who: CharacterId, s: TalkState): TalkPlan {
  const v = VILLAGERS[k];
  const f = s.flags;
  if (!f[metFlag(k)]) return { lines: [v.chat[0]], meet: true };
  const greet: DLine[] = s.total >= REGULAR_AFTER ? [v.regular] : [];
  if (caseOpen(f) && v.caseLine && !v.witness) {
    const line = k === 'guiniang' && f['case:hz:found'] && v.caseFound ? v.caseFound : v.caseLine;
    return { lines: [...greet, line], meet: false };
  }
  // the stele read: 三娘's one new line, first each day
  if (k === 'sang' && f['ty:stele'] && s.today === 0) return { lines: [...greet, v.chat.find((c) => c.after === 'stele')!], meet: false };
  if (s.today === 0) {
    const c = voiced(v.companion, who);
    if (c && c.length) return { lines: [...greet, ...c], meet: false };
  }
  const pool = v.chat.filter((c) => !c.after || (c.after === 'solved' ? !!f['case:hz:solved'] : !!f['ty:stele']));
  // once the case is judged, its line comes first on a new day
  const after = pool.find((c) => c.after === 'solved');
  const line = after && s.today === 0 ? after : pickDaily(pool, s.day, villagerId(k), s.today);
  return { lines: [...greet, line], meet: false };
}
