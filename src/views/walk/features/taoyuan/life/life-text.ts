// 桃源 · 二期「常住」: every line of everyday life that L's modules say (spec §1, §3.8, §6). Pure data,
// Chinese and English in pairs; {名} is filled at render. Voices follow style.md: 秦 slow and plain,
// 小满 runs on (然后……然后), 桂娘 about food and 小满, 葛姑 in numbers, 石瞽 reads sounds he actually
// heard. The board's picks (the 号子, the water, the draught…) live in daily.ts.
//
// Owner: L.
import type { Line } from '../text';
import type { DishId, GameId, Part } from './types';

const t = (zh: string, en: string): Line => ({ zh, en });

// ───────────────────────────── §1 · access

/** 小满 at the mouth, the first time you come back with the petal (tyl:back). */
export const FIRST_RETURN = t(
  '你真来啦！我就说那片花瓣管用！然后……然后你先跟我去看树洞！',
  'You really came! I *said* the petal would work! And then — and then first you have to come see my hollow!',
);

/** The dark falls, while 小满's letter waits unclaimed in the mailbox. */
export const LETTER_WAITS = t('信箱里有你一封信，摸着鼓鼓的。', "There's a letter in your mailbox. It feels lumpy.");

// ───────────────────────────── §6.1 · 今日谷中 (the board)

export const BOARD = {
  label: t('花神杆', 'The flower pole'),
  action: t('今日谷中', 'Today in the valley'),
  title: t('今日谷中', 'Today in the valley'),
  /** The register's row names. */
  season: t('节令', 'In season'),
  song: t('号子', 'The call'),
  water: t('溪水', 'The stream'),
  draught: t('洞风', 'The cave wind'),
  worms: t('蚕', 'The worms'),
  cups: t('流觞', 'The cups'),
  king: t('萤王', 'The firefly king'),
  yue: t('今日之约', "Today's challenge"),
  ling: t('令', 'Word'),
  gegu: t('葛姑', 'Ge Gu'),
} as const;

/** 葛姑's count: 「昨夜落花{n}瓣。」 then one of these (spec §6.1). */
export const GEGU_COUNT = (zh: string, en: string): Line => t(`昨夜落花${zh}瓣。`, `${en} petals fell last night.`);
export const GEGU_LINES: readonly Line[] = [
  t('比前天多两瓣，为什么，我还没想明白。', "Two more than the day before. Why, I haven't worked out."),
  t('数到一半，油灯灭了，后半是估的。', "The lamp went out halfway. The second half's a guess."),
  t('小满帮我数了一会儿，他那部分我重数了。', 'Xiaoman helped for a while. I recounted his part.'),
  t('花不谢，庄稼照熟，这个我也还没想明白。', "The blossom never falls off the trees, yet the crops still ripen. That one I haven't worked out either."),
  t('杜二说我数得不对。杜二连他的坛子都数不清。', "Du Er says I've miscounted. Du Er can't count his own jars."),
  t('你来的那天，多落了三十瓣。我记下了。', 'The day you came, thirty extra fell. I wrote it down.'),
];

/** Where a part's dishes are served (the board's 节令 row: 「桂花糖芋（暮，长桌）」). */
export const PART_NAME: Record<Part, Line> = {
  dawn: t('晨', 'dawn'), day: t('昼', 'day'), dusk: t('暮', 'dusk'), night: t('夜', 'night'),
};
export const GUINIANG_WHERE: Record<Part, Line> = {
  dawn: t('井边', 'by the well'), day: t('秦家院里', "in the Qins' yard"), dusk: t('长桌', 'the long tables'), night: t('长桌', 'the long tables'),
};

// ───────────────────────────── §6.2 · 小满's news at the mouth (first entry of the day)

export const NEWS_WHO = t('小满', 'Xiaoman');
/** In the order the board picks them (see daily.ts newsOf); the last is the festival's. */
export const NEWS: readonly Line[] = [
  t('今天阿黍摸了条这——么长的！……他自己说的。', 'A Shu caught one *this* long today! …He says.'),
  t('娘在蒸糕，别告诉她是我说的。', "Mum's steaming cakes. Don't tell her I told you."),
  t('杜二叔说今天的号子你肯定踩不过他。然后……然后他自己先踩歪了。', "Uncle Du says you'll never beat him at today's call. And then — and then he trod it wrong himself."),
  t('洞里的风今天好大！咚的一下，我的纸鸢就上去了！', 'The wind out of the cave is huge today! Boom, and my kite went straight up!'),
  t('葛姑说昨晚落了四千多瓣，我帮她数的，数到一百就睡着了。', 'Ge Gu says four thousand petals fell last night. I helped count. I fell asleep at a hundred.'),
  t('阿爷今天要在渠边摆觞，你来不来？', "Grandpa's setting out the cups by the channel today. Are you coming?"),
  t('三娘的蚕要眠了，她不让我进去。你去她肯定让。', "Sanniang's worms are about to sleep and she won't let me in. She'll let you."),
  t('阿爷说外头今天过节！我们也过！', "Grandpa says it's a festival outside today! So it's one here too!"),
];

// ───────────────────────────── §6.3 · 歇一歇

export const REST = {
  bench: t('长凳', 'The long bench'),
  porch: t('石瞽的廊下', "Shi Gu's porch"),
  action: t('歇一歇', 'Take a rest'),
  /** The question, and the choices (the parts ahead, in turn; the last choice gets up again). */
  ask: t('（坐到什么时候？）', '(Sit until when?)'),
  until: {
    dawn: t('坐到天亮', 'Until dawn'),
    day: t('坐到晌午', 'Until midday'),
    dusk: t('坐到傍晚', 'Until evening'),
    night: t('坐到天黑', 'Until dark'),
  } as Record<Part, Line>,
  stay: t('不坐了', 'Get up again'),
  narr: t('（你在长凳上坐下。日影慢慢挪过了场院。）', '(You sit on the bench. The shadows slide slowly across the square.)'),
  shigu: t('坐吧。听一曲，日头就过去了。', "Sit. One tune, and the sun's moved on."),
  busy: t('（手头的事还没完。）', "(You're still in the middle of something.)"),
};

// ───────────────────────────── §6.4 · 开饭

export const KAIFAN = t('开饭喽！', "Food's on!");
export const WASH_HANDS = t('小满！洗手！', 'Xiaoman! Wash your hands!');
export const GUINIANG = t('桂娘', 'Gui Niang');

// ───────────────────────────── §6.5 · 留一碗

export const BOWL = {
  label: t('长桌那头', 'The end of the long table'),
  action: t('揭开碗盖', 'Lift the lid'),
  /** 桂娘's note under the lid (a toast, in her voice). */
  kept: t('锅里给你留的。趁热。', 'Kept back from the pot for you. Eat it hot.'),
  full: t('（盖着的碗还温着。可你实在吃不下了。）', "(The covered bowl's still warm. But you really can't eat another thing.)"),
};

// ───────────────────────────── §3.8 · moods: the well

export const WELL = {
  label: t('井', 'The well'),
  action: t('洗把脸', 'Splash your face'),
  done: t('（井水凉得一激灵。脚底下踏实了。）', '(The well water is a cold shock. Your feet are back under you.)'),
};

// ───────────────────────────── §6.6 · 外头的节 (the festival 席)

export const FEST = {
  ask: t('外头今天过什么节？', 'What festival is it outside today?'),
  /** 秦, right: 「元宵？……那我们也过。桂娘，今晚多做两个菜。」 */
  right: (zh: string, en: string): Line => t(`${zh}？……那我们也过。桂娘，今晚多做两个菜。`, `${en}? …Then so do we. Gui Niang, two more dishes tonight.`),
  /** 秦, wrong: 「中秋？我看这天色不像。……不过也好，那我们也过。」 */
  wrong: (zh: string, en: string): Line => t(`${zh}？我看这天色不像。……不过也好，那我们也过。`, `${en}? The sky doesn't look like it. …Still, why not. We'll keep it too.`),
};

// ───────────────────────────── §6.7 · echoes

/** 石瞽 reads your step while a dish or a game is fresh (spec §6.7). */
export const SHIGU_DISH: Partial<Record<DishId, Line>> = {
  xinpei: t('你刚喝过新醅，脚底下发飘。', "You've just had new brew. Your feet are floating."),
  weiyu: t('一身灰味儿。杜二又请你吃芋头了？', 'You smell of ash. Du Er fed you taro again?'),
};
export const SHIGU_GAME: Partial<Record<GameId, Line>> = {
  mo: t('鞋是湿的。阿黍又拉你下水了。', 'Wet shoes. A Shu dragged you into the stream again.'),
  qu: t('你走路还带着鼓点。杜二那套号子。', "You're still walking to the drum. Du Er's call."),
  yuan: t('你老搓手心，线勒的吧。', 'You keep rubbing your palm. Line burn?'),
  ying: t('你袖子里还有一只。听，扑扑的。', "There's still one in your sleeve. Listen, fluttering."),
  shang: t('你拨了三下，第三下重了。', 'Three pokes. The third was too hard.'),
};
/** 夭夭 at dawn, once 桃花粥 has been tasted (her lyric register). */
export const YAOYAO_CONGEE = t('粥里那几片花，是我落的。', 'Those petals in your congee — I let them fall.');
