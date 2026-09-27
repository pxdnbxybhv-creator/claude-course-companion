// 桃源 · 二期「常住」: the valley's food, as data (spec §2, §3.4–3.9). The seventeen dishes with their
// cooks, hours, tastes, 特写 categories, the goods they take, the cook's voice-over, the 亲手 lines, the
// captions, the 食单 notes and the missing-page hints; the service lines; the thirteen companions'
// reactions and their specials; the goods in kind; the words of the menu card and the 食单.
//
// Every line is typed in from the spec verbatim (one change: the fonts have no hou (U+9F41), so 桃花茶 says
// 甜得发腻). New lines follow style.md and pass the Appendix A lint (tests/taoyuan-food.test.ts).
// Pure data: no DOM, no three.js. Owner: F (food). P reads DISHES; the table and the 食单 read the rest.
import type { CharacterId } from '../../../../../data/characters';
import type { CookKey, Dish, DishId, KindId, Line, Mood, Part, Season, Taste, VillagerKey } from './types';

const _ = (zh: string, en: string): Line => ({ zh, en });

// ───────────────────────────── the dishes

/** A dish as the table and the 食单 know it (P reads only the Dish fields). */
export interface FoodDish extends Dish {
  /** Where and when it is served (the 食单 page). */
  where: Line;
  /** 桃花茶: the hint before the case is solved (杜二 won't talk about it). */
  hintLocked?: Line;
  /** 新醅: what 杜二 says when you pay with a goose egg. */
  eggLine?: Line;
  /** 新醅: what 杜二 says before he pours for this companion (and whether it becomes 醴). */
  swaps?: Partial<Record<CharacterId, { line: Line; li: boolean }>>;
  /** 桑葚糕: what 三娘 says while you smell of wine (醺). */
  refuse?: Line;
  /** 柳枝炙鱼: the 亲手 line with a mandarin fish (鳜). */
  ownRare?: Line;
  /** 柳枝炙鱼: 小满's bark from across the square, if he is still up (before 21:00). */
  bark?: Line;
  /** 桃花茶: the tile's own line. */
  tile?: Line;
}

export const DISHES: Record<DishId, FoodDish> = {
  // ── D1–D6: 桂娘
  zhou: {
    id: 'zhou', zh: '桃花粥', en: 'Peach-blossom congee', cook: 'guiniang', parts: ['dawn'], taste: '热', pv: '羹',
    vo: [
      _('米昨晚就泡上了，熬了小半个时辰。花瓣最后撒，撒早了就煮烂了。', "The rice has soaked since last night, and it's had the best part of an hour on the fire. Petals go in last. Any earlier and they turn to mush."),
      _('烫，贴着碗边喝。', 'Hot. Sip from the edge.'),
    ],
    caption: _('花落粥面', 'Petals on the congee'),
    note: _('米汤稠，花瓣有点涩，后头慢慢回甜。', 'Thick rice broth; the petals are a little tart, then it turns sweet.'),
    hint: _('早上来，粥在锅里。', "Come in the morning. The congee's on."),
    where: _('晨 · 长桌', 'Mornings · the long tables'),
  },
  bing: {
    id: 'bing', zh: '鹅蛋葱饼', en: 'Goose-egg scallion cake', cook: 'guiniang', parts: ['dawn'], taste: '脆', pv: '炙', own: 'dan',
    vo: [
      _('阿黍家的鹅蛋，一个顶三个。油冒烟了再下锅。', "One of A Shu's goose eggs is worth three hen's. Wait till the oil smokes."),
      _('烫手，拿筷子夹。边上焦的那块给你，小满老抢。', "It'll burn your fingers, use the chopsticks. The crispy edge is yours. Xiaoman always grabs it."),
    ],
    ownLine: _('这蛋哪来的？……小满给你的？他又去阿黍那儿掏了。', "Where'd this egg come from? …Xiaoman gave it to you? He's been raiding A Shu's geese again."),
    caption: _('油响葱香', 'Hissing oil, scallion'),
    note: _('边上脆，里头软，葱是早上刚掐的。', 'Crisp at the edge, soft inside, scallion picked this morning.'),
    hint: _('早上，油一热就有。', "Mornings, as soon as the oil's hot."),
    where: _('晨 · 长桌', 'Mornings · the long tables'),
  },
  gao: {
    id: 'gao', zh: '新糕', en: 'Fresh millet cake', cook: 'guiniang', parts: ['day'], taste: '甜', pv: '蒸', own: 'shu',
    vo: [
      _('黍米磨的粉，一笼蒸一炷香，中间不许揭盖。', 'Millet flour, one steamer, one stick of incense. No lifting the lid halfway.'),
      _('红点是小满拿筷子头戳的，歪了别管。晾一晾再咬，烫。', "Xiaoman poked the red dots in with a chopstick, so never mind the crooked ones. Let it cool a bit. It's hot."),
    ],
    ownLine: _('新黍？流觞赢来的吧。那这一笼算你自己的。', "New millet? Won at the cups, I bet. Then this steamer's your own."),
    caption: _('新糕出笼', 'Out of the steamer'),
    note: _('软，粘牙，有一点酒酿的酸。', 'Soft, sticks to your teeth, a little sour like sweet rice wine.'),
    hint: _('昼里蒸，小满闻着味儿就来了。', 'I steam them by day. Xiaoman follows his nose.'),
    where: _('昼 · 长桌', 'By day · the long tables'),
  },
  tangbing: {
    id: 'tangbing', zh: '汤饼', en: 'Torn-noodle soup', cook: 'guiniang', parts: ['day'], taste: '热', pv: '羹', own: 'jun',
    vo: [
      _('面是现揪的，揪多大全看手。汤是鸡骨头熬了一上午。', "The dough's torn straight into the pot, however big the hand makes it. Chicken-bone broth, a whole morning."),
      _('别烫着舌头。', "Don't burn your tongue."),
    ],
    ownLine: _('夜里的菌子？下两朵进汤里。……小满，别动那碗。', 'Night mushrooms? Two go in the broth. …Xiaoman, hands off that bowl.'),
    caption: _('一箸汤饼', 'A chopstick of noodles'),
    note: _('面片厚薄不匀，厚的那片最好吃。', 'The pieces are thick and thin. The thick ones are best.'),
    hint: _('昼里，到秦家院子找我。', 'Daytime. Find me in the Qin yard.'),
    where: _('昼 · 长桌', 'By day · the long tables'),
  },
  jishu: {
    id: 'jishu', zh: '鸡黍', en: 'Chicken and millet', cook: 'guiniang', parts: ['dusk'], taste: '热', pv: '蒸', own: 'shu',
    vo: [
      _('鸡跟黍米一块儿炖了一下午。这只不是我养大的那只，放心吃。', 'Chicken and millet, stewed together all afternoon. Not the hen I raised. Eat up.'),
      _('锅底那层焦的最香，刮给你。骨头当心扎嘴。', "The crust at the bottom's the best bit. I'll scrape it for you. Mind the bones."),
    ],
    ownLine: _('这黍是你赢来的？那今天这锅，算你请大家。', "You won this millet? Then today's pot is your treat."),
    caption: _('故人具鸡黍', "An old friend's chicken and millet"),
    note: _('黍米一粒一粒的，鸡皮有点焦，咸淡正好。', 'Every grain separate, the chicken skin a little charred, salted just right.'),
    hint: _('暮时，长桌。杜二倒酒那会儿。', "Dusk, at the long tables. When Du Er's pouring."),
    where: _('暮 · 长桌', 'At dusk · the long tables'),
  },
  sunzu: {
    id: 'sunzu', zh: '笋菹', en: 'Pickled bamboo shoots', cook: 'guiniang', parts: ['dawn', 'day', 'dusk'], taste: '脆', pv: '凉',
    vo: [
      _('开春挖的笋，盐腌了一个月。泥封小满又没揭开，还得我来。', "Shoots dug at the start of spring, a month in salt. Xiaoman couldn't get the mud seal off again, so it's me."),
      _('咸，就着粥吃，别空嘴嚼。', 'Salty. Eat it with congee, not on its own.'),
    ],
    caption: _('一坛春', 'A jar of spring'),
    note: _('脆，咸，嚼到后头有一点酸。', 'Crunchy, salty, a little sour at the end.'),
    hint: _('坛子在灶边，我在就有。', "The jar's by the stove. Whenever I'm about."),
    where: _('晨、昼、暮 · 长桌', 'Morning, day and dusk · the long tables'),
  },

  // ── D7–D9: 杜二
  xinpei: {
    id: 'xinpei', zh: '新醅', en: 'New brew', cook: 'duer', parts: ['day', 'dusk'], taste: '酒', pv: '饮', required: ['qu', 'dan'], own: 'qu',
    vo: [
      _('今早刚滤的！阿黍，碗！大碗！', 'Strained this morning! A Shu, a bowl! The big one!'),
      _('淡是淡，管够。慢点喝，喝完别往三娘那儿跑，她鼻子灵。', "It's thin, but there's plenty. Go slow, and stay away from Sanniang after. She's got a nose."),
    ],
    ownLine: _('这块曲是你踩的？难怪有点歪。', "You trod this yeast cake? That's why it's lopsided."),
    eggLine: _('鹅蛋？……也是蛋！行！', 'A goose egg? …Still an egg! Done!'),
    swaps: {
      taoist: { line: _('小孩喝什么酒。舀碗醴给你，甜的。', "Kids don't drink wine. Here, have some sweet rice drink."), li: true },
      rabbit: { line: _('兔子喝不喝酒？……不喝？舀碗醴给你，甜的。', 'Does a rabbit drink? …No? Here, have some sweet rice drink.'), li: true },
      cat: { line: _('猫也喝？……闻闻就算了。', 'The cat drinks too? …A sniff, then.'), li: false },
    },
    caption: _('绿蚁新醅', 'New brew, green froth'),
    note: _('有点酸，有点甜，碗底沉着几粒米。', 'A bit sour, a bit sweet, a few grains at the bottom.'),
    hint: _('白天柜台，傍晚长桌！带个蛋来！', 'Counter by day, long tables at dusk! Bring an egg!'),
    where: _('昼 · 酒坊柜台　暮 · 长桌', 'By day · the brewery counter; at dusk · the long tables'),
  },
  weiyu: {
    id: 'weiyu', zh: '煨芋', en: 'Ember-roasted taro', cook: 'duer', parts: ['night'], taste: '脆', pv: '炙',
    vo: [
      _('芋头埋在灶灰里，焐了半个时辰。', 'Taro buried in the stove ashes, an hour of slow heat.'),
      _('剥皮当心，烫手。……我婆娘就爱吃焦的那头。喝茶，喝茶。', "Careful peeling it, it's hot. …My wife always went for the burnt end. Tea. Have some tea."),
    ],
    caption: _('灰里的火', 'Fire in the ashes'),
    note: _('皮焦，里头粉，烫得在手里倒来倒去。', 'Burnt skin, floury inside, so hot you juggle it.'),
    hint: _('夜里，酒坊台阶上。', 'Nights, on the brewery step.'),
    where: _('夜 · 酒坊台阶', 'At night · the brewery step'),
  },
  taocha: {
    id: 'taocha', zh: '桃花茶', en: 'Honeyed peach-blossom tea', cook: 'duer', parts: ['night'], taste: '茶', pv: '饮',
    vo: [
      _('一碗三勺蜜。一勺，两勺，三勺。', 'Three spoons of honey a cup. One. Two. Three.'),
      _('……甜得发腻吧？我也这么说过她。烫，捧着喝。', "…Too sweet? I used to tell her that. It's hot. Hold it in both hands."),
    ],
    tile: _('这个不收。', 'Not this one. No charge.'),
    caption: _('三勺蜜', 'Three spoons of honey'),
    note: _('甜得发腻，底下的花瓣泡得软软的。', 'Cloyingly sweet; the petals at the bottom have gone soft.'),
    hint: _('夜里来，台阶上坐。', 'Come at night. Sit on the step.'),
    hintLocked: _('……这个你别问。', "…Don't ask about that one."),
    where: _('夜 · 酒坊台阶', 'At night · the brewery step'),
  },

  // ── D10–D11: 葛姑
  zisu: {
    id: 'zisu', zh: '紫苏乌梅饮', en: 'Perilla and smoked-plum drink', cook: 'gegu', parts: ['dawn', 'night'], taste: '茶', pv: '饮',
    vo: [
      _('紫苏十二片，乌梅三颗。放进去，数到十。……八、九、十。红了。', 'Twelve perilla leaves, three smoked plums. In they go, count to ten. …Eight, nine, ten. Red.'),
      _('四颗就酸了，别问我怎么知道的。', "Four and it's sour. Don't ask how I know."),
    ],
    caption: _('紫转绯', 'Violet into rose'),
    note: _('先是凉，再是一点酸，最后是叶子味儿。', 'Cool first, then a little sour, then the taste of leaves.'),
    hint: _('早上或者夜里，花漏那儿。我在数花。', "Mornings or nights, at the petal basin. I'll be counting."),
    where: _('晨、夜 · 花漏边', 'Mornings and nights · by the petal basin'),
  },
  taojiao: {
    id: 'taojiao', zh: '桃胶蜜羹', en: 'Peach-gum honey soup', cook: 'gegu', parts: ['dusk'], taste: '甜', pv: '羹',
    vo: [
      _('桃胶泡了十二个时辰，胀了四倍，我量过。蜜放了两勺。', 'Peach gum soaked a full day and night. Swelled four times over, I measured. Two spoons of honey.'),
      _('你要三勺？杜二教的吧。……烫，小口喝。', 'You want three? Du Er taught you that. …Hot. Small sips.'),
    ],
    caption: _('一碗琥珀', 'A bowl of amber'),
    note: _('滑溜溜的，没什么味儿，全靠那口蜜。', "Slippery, not much taste of its own. It's all the honey."),
    hint: _('暮时，我家廊下。', 'Dusk, on my porch.'),
    where: _('暮 · 葛姑廊下', "At dusk · Ge Gu's porch"),
  },

  // ── D12: 三娘
  shengao: {
    id: 'shengao', zh: '桑葚糕', en: 'Mulberry cake', cook: 'sang', parts: ['dusk', 'night'], taste: '甜', pv: '凉', required: ['shen'], own: 'shen',
    vo: [
      _('桑葚熬了一炷香，拌进黍粉里，放凉了再切。', 'Mulberries boiled down for a stick of incense, stirred into millet flour, cut once it\'s cool.'),
      _('别蹭到衣裳上，客人。洗不掉。', "Don't get it on your clothes. It won't wash out."),
    ],
    ownLine: _('你摘的？……挑得还行。', 'You picked these? …Not bad.'),
    refuse: _('一身酒气。去井边洗把脸再来。', 'You smell of wine. Go wash your face at the well first.'),
    caption: _('指尖染紫', 'Purple fingertips'),
    note: _('酸比甜多一点，吃完舌头是紫的。', 'More sour than sweet. Your tongue goes purple.'),
    hint: _('傍晚，门口。带桑葚来，客人。', 'Evenings, at my door. Bring mulberries.'),
    where: _('暮、夜 · 桑家门口', "Dusk and night · the Sangs' doorstep"),
  },

  // ── D13: 阿黍
  zhiyu: {
    id: 'zhiyu', zh: '柳枝炙鱼', en: 'Fish on a willow twig', cook: 'ashu', parts: ['night'], taste: '脆', pv: '炙', required: ['yu'], own: 'yu',
    vo: [
      _('翻面。', 'Flip.'),
      _('……别碰。还没好。', "…Don't touch. Not yet."),
    ],
    ownLine: _('（点头。）你摸的。', '(A nod.) You caught it.'),
    ownRare: _('鳜鱼？你摸的？……分我一半。', "A mandarin fish? You caught it? …Half's mine."),
    bark: _('阿黍烤鱼从来不糊！……上回糊了。', 'A Shu never burns fish! …He did last time.'),
    caption: _('溪边火', 'Fire by the stream'),
    note: _('皮焦了一点，肉是甜的，有几根刺。', "The skin's a little burnt, the flesh is sweet, a few bones."),
    hint: _('夜里。溪边。带鱼。', 'Night. The stream. Bring a fish.'),
    where: _('夜 · 溪边火堆', 'At night · the fire by the stream'),
  },

  // ── S1–S4: 桂娘 cooks the season you walk in with (the outside season, by solar term)
  's-aigao': {
    id: 's-aigao', zh: '艾糕', en: 'Mugwort cakes', cook: 'guiniang', parts: ['day'], season: 'spring', taste: '甜', pv: '蒸',
    vo: [
      _('外头也是春天？那跟我们一样。艾草跟葛姑讨的，捣了一上午，手都绿了。', "It's spring out there too? Same as us, then. Mugwort from Ge Gu. I pounded it all morning and my hands went green."),
      _('蘸蜜吃，别蘸多。', 'Dip it in honey. Not too much.'),
    ],
    caption: _('一口青', 'A mouthful of green'),
    note: _('外皮一股青草气，糯，蜜甜得刚好。', 'The skin smells of fresh grass. Chewy. Just enough honey.'),
    hint: _('昼里来。艾草得趁嫩掐，晚了就老了。', 'Come by day. Mugwort has to be picked young, or it goes tough.'),
    where: _('春 · 昼 · 长桌', 'Spring · by day · the long tables'),
  },
  's-heye': {
    id: 's-heye', zh: '荷叶饭', en: 'Rice in lotus leaf', cook: 'guiniang', parts: ['dusk'], season: 'summer', taste: '热', pv: '蒸',
    vo: [
      _('外头热了？谷里的荷叶还嫩，将就着包。饭里压了几片腌笋。', "Hot out there? Our lotus leaves are still young, they'll have to do. A few pickled shoots pressed into the rice."),
      _('揭的时候脸别凑太近，气冲。', "Don't put your face over it when you open it. The steam shoots out."),
    ],
    caption: _('荷叶一揭', 'The lotus leaf opens'),
    note: _('饭里有荷叶的清气，腌笋咸咸的。', 'The rice tastes of lotus leaf; the pickled shoots are salty.'),
    hint: _('暮时来，荷叶饭趁热揭。', 'Come at dusk, and open it while it\'s hot.'),
    where: _('夏 · 暮 · 长桌', 'Summer · at dusk · the long tables'),
  },
  's-guiyu': {
    id: 's-guiyu', zh: '桂花糖芋', en: 'Taro in malt syrup with osmanthus', cook: 'guiniang', parts: ['dusk'], season: 'autumn', taste: '甜', pv: '羹',
    vo: [
      _('你袖子上沾的是桂花？撒一小撮进去。芋头跟饴糖煮了半个时辰。', 'Is that osmanthus on your sleeve? A pinch goes in. Taro and malt syrup, an hour on the fire.'),
      _('……我名字里这个桂字，原来长这样。烫，吹吹。', "…So that's what the gui in my name looks like. Hot. Blow on it."),
    ],
    caption: _('桂子落碗', 'Osmanthus in the bowl'),
    note: _('芋头绵，汤是饴糖的甜，桂花一下就散了。', 'Soft taro, malt-sweet syrup, and the osmanthus is gone in a breath.'),
    hint: _('暮时，长桌。一锅就那么多，来晚了小满全吃了。', "Dusk, at the long tables. There's only the one pot, and if you're late Xiaoman eats the lot."),
    where: _('秋 · 暮 · 长桌', 'Autumn · at dusk · the long tables'),
  },
  's-junge': {
    id: 's-junge', zh: '菌子羹', en: 'Mushroom broth', cook: 'guiniang', parts: ['dusk'], season: 'winter', taste: '热', pv: '羹', own: 'jun',
    vo: [
      _('外头下雪了？你肩膀是湿的，坐灶边去。菌子是葛姑晒的，泡了一夜。', 'Snowing out there? Your shoulders are wet. Sit by the stove. Ge Gu dried these mushrooms. They\'ve soaked overnight.'),
      _('滚三滚就好。姜多放了，喝了身上热。', "Three boils and it's done. Extra ginger. It'll warm you through."),
    ],
    ownLine: _('你采的菌子？那就不用葛姑的了。', "Your own mushrooms? Then Ge Gu's can stay in the jar."),
    caption: _('雪在山外', 'Snow beyond the hills'),
    note: _('菌子滑，汤有股土腥气，喝下去身上就热了。', 'Slippery mushrooms, an earthy broth. It warms you right through.'),
    hint: _('暮时来。菌子得泡一夜，我昨晚就泡上了。', 'Come at dusk. The mushrooms need a night\'s soak, and they went in last night.'),
    where: _('冬 · 暮 · 长桌', 'Winter · at dusk · the long tables'),
  },
};

// ───────────────────────────── the seasons (the seasonal pages)

export const SEASON_ZH: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const SEASON_EN: Record<Season, string> = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };
/** The seasonal dish of each outside season. */
export const SEASON_DISH: Record<Season, DishId> = { spring: 's-aigao', summer: 's-heye', autumn: 's-guiyu', winter: 's-junge' };

/** A seasonal page not yet tasted, out of its season: 「待山外 · 秋」. */
export const seasonWait = (s: Season): Line => _(`待山外 · ${SEASON_ZH[s]}`, `Waiting for ${SEASON_EN[s]} outside`);
/** …and its hint (桂娘): 「外头秋天了再来。」 */
export const seasonHint = (s: Season): Line => _(`外头${SEASON_ZH[s]}天了再来。`, `Come back when it's ${SEASON_EN[s]} out there.`);
/** The label of a seasonal dish (the 外 shot's 「山外 · 秋」, the page's corner). */
export const seasonLabel = (s: Season): Line => _(`山外 · ${SEASON_ZH[s]}`, `Outside · ${SEASON_EN[s]}`);

// ───────────────────────────── the hours

export const PART_ZH: Record<Part, string> = { dawn: '晨', day: '昼', dusk: '暮', night: '夜' };
export const PART_EN: Record<Part, string> = { dawn: 'morning', day: 'day', dusk: 'dusk', night: 'night' };

// ───────────────────────────── the goods in kind (土产, spec §2)

export interface KindInfo {
  zh: string;
  en: string;
  /** One of them: 「一条鱼」. */
  one: Line;
  /** The game that gives it. */
  from: Line;
}

export const KINDS: Record<KindId, KindInfo> = {
  yu: { zh: '鱼', en: 'fish', one: _('一条鱼', 'a fish'), from: _('摸鱼', 'Fishing by hand') },
  shen: { zh: '桑葚', en: 'mulberries', one: _('一捧桑葚', 'a handful of mulberries'), from: _('采桑喂蚕', 'Feeding the silkworms') },
  qu: { zh: '曲', en: 'yeast cake', one: _('一块曲', 'a yeast cake'), from: _('踩曲', 'Treading the yeast') },
  dan: { zh: '鹅蛋', en: 'goose egg', one: _('一个鹅蛋', 'a goose egg'), from: _('纸鸢', 'The singing kite') },
  jun: { zh: '菌', en: 'mushrooms', one: _('一把菌子', 'some night mushrooms'), from: _('捉萤', 'Catching fireflies') },
  shu: { zh: '黍', en: 'millet', one: _('一升新黍', 'a measure of new millet'), from: _('流觞', 'Steering the cup') },
};

// ───────────────────────────── the cooks

export interface CookInfo {
  /** The red seal on the menu card and the 食单 page. */
  seal: string;
  /** Appetite spent (§3.6). */
  full: Line;
  /** Nothing to pay with, or the wrong kind (§3.6). */
  broke: Line;
}

export const COOKS: Record<CookKey, CookInfo> = {
  guiniang: {
    seal: '桂',
    full: _('吃不下就别硬塞，明天还有。', "If you can't, don't force it. There's tomorrow."),
    broke: _('没带东西？那就明天。……别跟小满学，他拿石子来换。', "Nothing to trade? Tomorrow, then. …And don't copy Xiaoman. He tries to pay with pebbles."),
  },
  duer: {
    seal: '杜',
    full: _('喝不动了？我杜二还没见过喝不动的人！……行，明天再来。', "Can't drink any more? I, Du Er, have never met anyone who couldn't! …Fine. Come back tomorrow."),
    broke: _('我杜二卖酒收的是蛋！没蛋？……去问小满，他知道阿黍的鹅在哪儿下蛋。', "I, Du Er, sell wine for eggs! No egg? …Ask Xiaoman. He knows where A Shu's geese lay."),
  },
  gegu: {
    seal: '葛',
    full: _('你今天吃了四碗。我数着呢。', "That's four bowls today. I've been counting."),
    broke: _('没东西换？……我这儿不赊。杜二那儿也不赊，他只是嘴上说赊。', "Nothing to trade? …I don't give credit. Neither does Du Er, he only says he does."),
  },
  sang: {
    seal: '桑',
    full: _('够了，客人。明天再来。', "That's enough. Come back tomorrow."),
    broke: _('桑葚糕要桑葚。……帮我喂一盘蚕，桑葚自己摘。', 'Mulberry cake takes mulberries. …Feed a tray of worms for me and pick them yourself.'),
  },
  ashu: {
    seal: '黍',
    full: _('饱了？（点头。）明天。', 'Full? (A nod.) Tomorrow.'),
    broke: _('鱼呢？……昼里来摸。', 'Fish? …Come catch one by day.'),
  },
};

export const COOK_KEYS: readonly CookKey[] = ['guiniang', 'duer', 'gegu', 'sang', 'ashu'];

// ───────────────────────────── the companions' reactions (spec §3.7)

/** Said as 'me' in the 尝 shot: one line per taste for each of the thirteen. */
export const REACT: Record<CharacterId, Record<Taste, Line>> = {
  scholar: {
    热: _('书上写过这个。……书上没写这么烫。', "The books mention this. …They don't mention it's this hot."),
    甜: _('甜的？……先说好，我就尝一口。', 'Sweet? …Just one bite, mind.'),
    脆: _('等等，我先记一笔。……好，吃。', 'Hold on, let me note this down. …Right. Eating.'),
    酒: _('就一碗。明早还要读书。', "Just the one. I've reading to do in the morning."),
    茶: _('这茶该配一本闲书。可惜书都在包袱最底下。', 'This wants an idle book beside it. Pity mine are all at the bottom of the bag.'),
  },
  gardener: {
    热: _('这是谁种的？回头我讨点种子。', "Who grew this? I'm asking for seeds later."),
    甜: _('甜得刚好。蜜没多放。', "Just sweet enough. They didn't overdo the honey."),
    脆: _('焦了一点点。……我就爱吃这一点点。', 'Burnt just a touch. …That touch is my favourite part.'),
    酒: _('这酒的粮食，是好粮食。', 'Good grain went into this.'),
    茶: _('这水是哪儿打的？甜。', "Where's this water from? It's sweet."),
  },
  fisher: {
    热: _('嗯。……再来一碗。', 'Mm. …Another bowl.'),
    甜: _('甜的我吃不来。……这个还行。', "I don't do sweet. …This one's all right."),
    脆: _('比我船上烤的强多了。', "Better than anything I've burnt on my boat."),
    酒: _('江上冷，要是有这一碗就好了。', "It gets cold on the river. Could've used a bowl of this."),
    茶: _('淡。淡的好，喝了不渴。', "Mild. Good. Doesn't leave you thirsty."),
  },
  musician: {
    热: _('喝汤的声音大了点。……算了，这里没人笑话我。', "I slurped. …Oh well, nobody here's laughing."),
    甜: _('（她轻轻哼了三个音。）甜的，得配慢板。', '(She hums three notes.) Sweet. That wants a slow tempo.'),
    脆: _('你听，咬下去这一声，脆的。', 'Listen to that crunch.'),
    酒: _('喝一碗，手指头就热了。等会儿弹一曲。', "One bowl and my fingers are warm. I'll play something after."),
    茶: _('石老弹琴的时候，喝的也是这个吧。', 'I bet this is what Shi Gu drinks when he plays.'),
  },
  swordsman: {
    热: _('（碗已经空了。）还有吗？', "(The bowl's already empty.) Any more?"),
    甜: _('小孩吃的东西。……再来一块。', "Kids' food. …One more piece."),
    脆: _('好吃。包两块，路上吃。', 'Good. Wrap me two for the road.'),
    酒: _('这也叫酒？……再倒一碗。', 'You call this wine? …Pour me another.'),
    茶: _('喝茶不如喝酒。……不过这个可以。', "I'd rather have wine. …This'll do, though."),
  },
  taoist: {
    热: _('比师父炼的丹好吃。别告诉师父。', "Better than Master's elixirs. Don't tell him."),
    甜: _('师父说不能贪嘴……（又咬了一口。）师父又不在。', "Master says don't be greedy… (Another bite.) Master's not here."),
    脆: _('焦的这块能不能入药？……那我先吃了。', "Can the burnt bit go in medicine? …Then I'll eat it first."),
    // (the 醴 swap: 杜二 gives the child sweet rice drink)
    酒: _('甜的！……师父问起，就说我喝的是水。', 'Sweet! …If Master asks, I drank water.'),
    茶: _('喝完能不能飞起来？……不能啊。', 'Will I fly if I drink it? …No? Oh.'),
  },
  painter: {
    热: _('先别动，这个颜色我要记下来。', "Don't touch it yet. I need to remember this colour."),
    甜: _('等等，让我看一眼再吃。……好，看完了。', 'Wait, let me look at it first. …Right, done looking.'),
    脆: _('焦边这一圈，像枯笔扫出来的。', 'That burnt rim looks like a dry brush dragged round.'),
    酒: _('这酒是米汤色，太淡，画不出来。', 'Rice-water colour. Too pale to paint.'),
    茶: _('这颜色，回去我得试试。藤黄，加一点赭石……', "I'll have to try this colour when I'm back. Gamboge, a touch of ochre…"),
  },
  player: {
    热: _('三口吃完，不多不少。', 'Three mouthfuls. No more, no fewer.'),
    甜: _('先吃这块……不，还是这块。', 'This piece first… no, that one.'),
    脆: _('焦的留到最后，这叫收官。', "Save the burnt bit for last. That's the endgame."),
    酒: _('一碗。再多，我就要悔棋了。', "One bowl. Any more and I'll start taking back moves."),
    茶: _('一口茶，想一步棋。……这步想好了。', 'A sip of tea, a move to think over. …Got it.'),
  },
  cat: {
    热: _('（吹都没吹，一头扎进碗里，烫得直甩头。）', '(He dives in without blowing and shakes his head at the heat.)'),
    甜: _('（闻了闻，扭头走开，在长凳上坐下。）', '(He sniffs, turns away, and sits down on the bench.)'),
    脆: _('喵。（盘子舔得锃亮。）', 'Mrow. (The plate is licked clean.)'),
    酒: _('（闻了一下，打了个喷嚏。）', '(One sniff, and he sneezes.)'),
    茶: _('（拿爪子拨了拨碗，碗转了半圈。）', '(He paws the cup round half a turn.)'),
  },
  rabbit: {
    热: _('月亮上没有热的吃。……吹一吹，再吹一吹。', "Nothing's hot on the moon. …Blow on it. Blow again."),
    甜: _('（两只爪子捧着，啃得飞快，耳朵耷拉下来了。）', '(She holds it in both paws and nibbles fast; her ears flop down.)'),
    脆: _('咔嚓！……比萝卜还响。', 'Crunch! …Louder than a radish.'),
    // (the 醴 swap)
    酒: _('这个好喝。……底下的米能吃吗？', 'This is nice. …Can I eat the rice at the bottom?'),
    茶: _('捣药的时候要是有这个喝，我就不偷懒了。', "If I had this while pounding herbs, I'd never slack off."),
  },
  poet: {
    热: _('好！这一碗换一首诗，等我先喝完。', "Good! A poem for this bowl, once I've finished it."),
    甜: _('甜是甜……杜二！酒呢？', "Sweet enough… Du Er! Where's the wine?"),
    脆: _('焦香，下酒的。……我先替酒尝一口。', "Charred. Made for wine. …I'll taste it on the wine's behalf."),
    酒: _('兰陵美酒郁金香……这个不香，可我喜欢。', "'Lanling wine, sweet with turmeric'… this one isn't sweet, but I like it."),
    茶: _('茶也好。茶喝完了，就该喝酒了。', "Tea's fine. Once it's gone, it's wine's turn."),
  },
  guan: {
    热: _('（捋了捋胡子。）……好。', '(He strokes his beard.) …Good.'),
    甜: _('关某不吃甜食。……罢了，就一块。', "I don't eat sweets. …Oh, all right. One piece."),
    脆: _('行军时吃的是干饼。这个好得多。', 'On campaign it was dry flatbread. This is far better.'),
    酒: _('饮胜。', 'Drink deep.'),
    茶: _('以茶代酒，也算一杯。', 'Tea for wine. It still counts as a cup.'),
  },
  change: {
    热: _('好久没吃过热的了。', "It's been so long since I ate anything hot."),
    甜: _('月宫里只有桂花糕，吃了一千年了。……这个好。', "On the moon there's only osmanthus cake. A thousand years of it. …This is better."),
    脆: _('（她咬了很小的一口，嚼了好一会儿。）……香。', '(She takes a tiny bite and chews for a long while.) …Lovely.'),
    酒: _('我不喝酒。……一口。', "I don't drink. …One sip."),
    茶: _('月亮上的水是凉的。这个是温的。', 'The water on the moon is cold. This is warm.'),
  },
};

/** A companion's special on one dish (it overrides their taste line), and a villager's answer after it. */
export interface Special {
  dish: DishId;
  line: Line;
  reply?: { by: VillagerKey; line: Line };
}

export const SPECIALS: Partial<Record<CharacterId, readonly Special[]>> = {
  scholar: [{ dish: 'jishu', line: _('鸡黍！孟夫子那一句，今天总算吃着了。', "Chicken and millet! Meng's old line. I've finally eaten it.") }],
  gardener: [
    { dish: 's-aigao', line: _('艾草只掐了嫩尖。懂行。', 'Only the tender tips of the mugwort. Someone knows what they\'re doing.') },
    { dish: 'sunzu', line: _('头茬笋，嫩。', 'First shoots of the year. Tender.') },
  ],
  fisher: [{ dish: 'zhiyu', line: _('火候对。这鱼谁摸的？', 'Done right. Who caught it?') }],
  musician: [{ dish: 'tangbing', line: _('揪面那一下，啪的一声，比拨弦还脆。', 'That snap when she tears the dough. Crisper than a plucked string.') }],
  taoist: [{ dish: 'taojiao', line: _('桃胶能入药……那我这算吃药，还是吃点心？', "Peach gum's a medicine… so is this medicine or a snack?") }],
  painter: [{
    dish: 'zisu', line: _('紫的变红，一眨眼的事。再放一颗？', 'Violet to red in a blink. Another plum?'),
    reply: { by: 'gegu', line: _('四颗就酸了。', "Four and it's sour.") },
  }],
  player: [{ dish: 'tangbing', line: _('揪得厚薄不一……厚的那片归我。', "Torn thick and thin… I'll take the thick one.") }],
  cat: [{
    dish: 'zhiyu', line: _('（叼起整条鱼就跑。）', '(He grabs the whole fish and bolts.)'),
    reply: { by: 'ashu', line: _('我的鱼！', 'My fish!') },
  }],
  rabbit: [{ dish: 's-aigao', line: _('绿的！我喜欢绿的。', "It's green! I like green.") }],
  poet: [{ dish: 'taocha', line: _('……这一杯，我不作诗了。', "…I won't make a poem of this one.") }],
  guan: [{ dish: 'jishu', line: _('当年桃园里，也是这么一桌。', 'Back in the peach orchard, we had a table just like this.') }],
  change: [{
    dish: 's-guiyu', line: _('桂花……月亮上那棵，也开这样的。', 'Osmanthus… the tree on the moon has flowers just like this.'),
    reply: { by: 'guiniang', line: _('月亮上也有？', "There's one on the moon?") },
  }],
};

// ───────────────────────────── moods (spec §3.8)

/** The mood a taste leaves: 热 and 脆 warm you, 甜 sweetens, 酒 goes to your head, 茶 settles it. */
export const TASTE_MOOD: Record<Taste, Mood> = { 热: '暖', 脆: '暖', 甜: '甜', 酒: '醺', 茶: '定' };

export const MOOD_NAME: Record<Mood, Line> = {
  暖: _('暖', 'Warm'),
  甜: _('甜', 'Sweet'),
  醺: _('醺', 'Tipsy'),
  定: _('定', 'Settled'),
};

// ───────────────────────────── the menu card (spec §3.1–3.2)

export const MENU = {
  /** The cook's prompt (in place of their chat). */
  ask: _('吃点什么', 'Something to eat?'),
  chat: _('聊两句', 'Chat'),
  close: _('不吃了', 'Not now'),
  appetite: _('今天的饭量', "Today's appetite"),
  goods: _('土产', 'Goods'),
  mood: _('心境', 'Mood'),
  // the tile tags
  first: _('头一回 · 请你', 'First time · on us'),
  daily: _('今天这碗 · 请你', "Today's bowl · on us"),
  repeat: _('换一样土产', 'Trade one good'),
  free: _('不收', 'No charge'),
  own: _('亲手', 'Your own'),
  full: _('吃不下了', "You're full"),
  teaDone: _('今晚喝过了', "You've had yours tonight"),
  extra: _('过节 · 多吃一口', 'Festival · one more'),
  /** The required dishes' first taste. */
  needs: {
    zhiyu: _('要一条鱼', 'Needs a fish'),
    shengao: _('要一捧桑葚', 'Needs mulberries'),
    xinpei: _('要一块曲或一个鹅蛋', 'Needs a yeast cake or an egg'),
  } as Partial<Record<DishId, Line>>,
  /** The payment toggle (⇄) on a tile. */
  payWith: _('付', 'Pay'),
  cycle: _('换一样', 'Swap'),
} as const;

/** The toast of a first taste (the 特写's 尝 shows it too). */
export const NEW_PAGE = _('食单 · 新添一页', 'A new page in the menu book');

// ───────────────────────────── the 食单 (spec §3.9)

export const SHIDAN = {
  title: _('食单', 'Menu book'),
  chip: _('食单', 'Menu book'),
  tabDishes: _('食单', 'Dishes'),
  tabGames: _('六戏', 'Games'),
  tabSet: _('设', 'Settings'),
  count: (n: number): Line => _(`知味 ${n} / 12`, `Tastes ${n} / 12`),
  times: (n: number): Line => _(`吃过 ${n} 回`, n === 1 ? 'Eaten once' : `Eaten ${n} times`),
  firstOn: _('头一回', 'First taste'),
  with: _('同', 'With'),
  untasted: _('还没尝过', 'Not tasted yet'),
  seasonRow: _('四时', 'Four seasons'),
  // the 六戏 tab
  best: _('最好', 'Best'),
  gentle: _('慢些', 'Gentle'),
  sealed: _('已得印', 'Sealed'),
  unsealed: _('未得印', 'No seal yet'),
  yue: _('今日之约', "Today's challenge"),
  twist: _('今天', 'Today'),
  none: _('还没玩过', 'Not played yet'),
  // the 设 tab: the 特写 setting
  pv: _('特写', 'Close-up'),
  pvAll: _('每回', 'Every time'),
  pvFirst: _('头一回', 'First taste only'),
  pvOff: _('不看', 'Never'),
  pvAllNote: _('每回都从头看一遍。', 'The whole close-up, every time.'),
  pvFirstNote: _('头一回吃，从头看到尾；再吃，只看一眼。', 'The whole close-up on a first taste; a glance after that.'),
  pvOffNote: _('只吃，不看。', 'Just eat.'),
} as const;

/** The seal each game stamps on the 六戏 tab (spec §5). */
export const GAME_SEAL: Record<'qu' | 'mo' | 'can' | 'yuan' | 'ying' | 'shang', string> = {
  qu: '曲', mo: '溪', can: '蚕', yuan: '鸢', ying: '萤', shang: '觞',
};
