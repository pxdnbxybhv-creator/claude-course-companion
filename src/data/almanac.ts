// A playful, modern-literati 黄历: gentle 宜 (good for) / 忌 (avoid) suggestions per day.
//
// Every item carries a `topic`. A day never shows two items on the same topic, and never a 宜 and
// a 忌 on the same topic — so no "宜早睡 · 忌熬夜" redundancy and no "宜听雨 · 忌淋雨" contradiction.
// Items tagged with `terms` are that solar term's customs (清明踏青, 冬至吃饺子…) and are featured
// first; items tagged with `seasons` only appear in those seasons; untagged items suit any day.
import { hashString, makeRng, type Rng } from '../core/rng';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface AlmanacItem {
  zh: string;
  en: string;
  /** Items sharing a topic never appear together on one day (neither within nor across 宜/忌). */
  topic: string;
  /** Further topics this item must not share a day with (e.g. 宜买花 vs 忌冲动消费). */
  clash?: string[];
  seasons?: Season[];
  /** Solar-term indices (0 = 立春) whose custom this is. */
  terms?: number[];
}

export interface AlmanacDay {
  yi: { zh: string; en: string }[];  // 3–4 items
  ji: { zh: string; en: string }[];  // 2–3 items
}

const SP: Season[] = ['spring'];
const SU: Season[] = ['summer'];
const AU: Season[] = ['autumn'];
const WI: Season[] = ['winter'];
const i = (zh: string, en: string, topic: string, tags: { s?: Season[]; t?: number[]; c?: string[] } = {}): AlmanacItem =>
  ({ zh, en, topic, ...(tags.c ? { clash: tags.c } : {}), ...(tags.s ? { seasons: tags.s } : {}), ...(tags.t ? { terms: tags.t } : {}) });

/** All topics an item occupies. */
export const topicsOf = (it: AlmanacItem): string[] => (it.clash ? [it.topic, ...it.clash] : [it.topic]);

// ── 宜 ─────────────────────────────────────────────────────────────────────────
export const YI: AlmanacItem[] = [
  // any day
  i('煮茶', 'Brew a pot of tea', 'tea'),
  i('早睡', 'Turn in early', 'sleep'),
  i('给旧友写信', 'Write to an old friend', 'letter'),
  i('写一封情书', 'Write a love letter', 'letter'),
  i('听雨', 'Listen to the rain', 'rain'),
  i('整理书桌', 'Tidy your desk', 'desk'),
  i('散步看云', 'Walk and watch the clouds', 'walk'),
  i('走路上班', 'Walk to work', 'walk'),
  i('临帖', 'Copy a calligraphy model', 'brush'),
  i('写几个大字', 'Write a few big characters', 'brush'),
  i('磨墨', 'Grind a little ink', 'ink'),
  i('洗笔', 'Rinse your brushes', 'ink'),
  i('读闲书', 'Read a book for no reason', 'read'),
  i('去图书馆', 'Visit the library', 'read'),
  i('摘抄', 'Copy out a passage you love', 'read'),
  i('逛旧书摊', 'Browse a secondhand bookstall', 'books', { c: ['money'] }),
  i('焚一炷香', 'Light a stick of incense', 'incense'),
  i('静坐', 'Sit still awhile', 'still', { c: ['body'] }),
  i('独处片刻', 'Keep your own company awhile', 'still'),
  i('抄一首诗', 'Copy out a poem by hand', 'poem'),
  i('背一首诗', 'Learn a poem by heart', 'poem'),
  i('浇花', 'Water the plants', 'garden'),
  i('种一盆花', 'Pot a plant', 'garden'),
  i('修剪枝叶', 'Trim the leaves', 'garden'),
  i('早起', 'Rise early', 'morning'),
  i('看日出', 'Watch the sunrise', 'morning'),
  i('多喝热水', 'Drink more hot water', 'water'),
  i('午后小憩', 'Take an afternoon nap', 'nap'),
  i('伸个懒腰', 'Have a good stretch', 'body'),
  i('远眺', 'Rest your eyes on something far away', 'eyes'),
  i('闭目养神', 'Close your eyes and rest', 'eyes'),
  i('理发', 'Get a haircut', 'hair'),
  i('沐浴', 'Take a long bath', 'bath'),
  i('洒扫庭除', 'Sweep the courtyard', 'clean'),
  i('清理旧物', 'Clear out old things', 'declutter'),
  i('开窗通风', 'Open the windows', 'air'),
  i('洗手作羹汤', 'Cook a soup with your own hands', 'cook'),
  i('学做一道菜', 'Learn to cook a new dish', 'cook'),
  i('与家人吃饭', 'Share a meal with family', 'family'),
  i('给父母打电话', 'Call your parents', 'family'),
  i('夸一个人', 'Praise someone sincerely', 'kind'),
  i('问候邻居', 'Greet the neighbours', 'kind'),
  i('道一声谢', 'Say thank you', 'thanks'),
  i('记账', 'Keep your accounts', 'money'),
  i('存一点钱', 'Put a little money aside', 'money'),
  i('学一个新字', 'Learn a new character', 'learn'),
  i('写日记一句', 'Write one line in your journal', 'journal'),
  i('换新笔记本', 'Start a fresh notebook', 'journal'),
  i('细嚼慢咽', 'Eat slowly, chew well', 'meal'),
  i('吃一顿素', 'Eat one meatless meal', 'meal'),
  i('好好吃早饭', 'Eat a proper breakfast', 'meal'),
  i('下一盘棋', 'Play a game of go', 'game'),
  i('弹琴', 'Play an instrument', 'music'),
  i('听一支曲', 'Listen to one piece of music', 'music'),
  i('赏画', 'Look long at a painting', 'art'),
  i('画一枝竹', 'Paint a stalk of bamboo', 'paint'),
  i('喂鸟', 'Feed the birds', 'birds'),
  i('静听鸟鸣', 'Listen to birdsong', 'birds'),
  i('观鱼', 'Watch the fish', 'fish'),
  i('望月', 'Gaze at the moon', 'moon'),
  i('数星星', 'Count the stars', 'stars', { c: ['sleep'] }),
  i('放下手机', 'Put the phone down', 'phone'),
  i('专心做一事', 'Do one thing wholeheartedly', 'focus'),
  i('了却一桩旧事', 'Finish something long put off', 'procrastinate'),
  i('访友', 'Visit a friend', 'friend'),
  i('约友喝茶', 'Meet a friend for tea', 'friend'),
  i('发呆', 'Daydream', 'idle', { c: ['focus', 'procrastinate'] }),
  i('什么也不做', 'Do nothing at all', 'idle', { c: ['procrastinate', 'exercise', 'giveup', 'talk'] }),
  i('笑一笑', 'Smile, for no reason', 'mood'),
  i('原谅自己', 'Forgive yourself', 'self'),
  i('按时下班', 'Leave work on time', 'work'),
  i('登高望远', 'Climb up and look far', 'climb'),
  i('练八段锦', 'Practise the Eight Brocades', 'exercise'),
  i('打一套太极', 'Do a round of tai chi', 'exercise'),
  i('补一件旧衣', 'Mend an old garment', 'mend'),
  i('修一件旧物', 'Repair something old', 'mend'),
  i('买一束花', 'Buy a bunch of flowers', 'flowers', { c: ['money'] }),
  i('翻旧相册', 'Leaf through old photos', 'memory'),
  i('列个清单', 'Make a list', 'plan'),
  i('定一个小目标', 'Set one small goal', 'plan'),
  // spring
  i('种一棵树', 'Plant a tree', 'tree', { s: SP }),
  i('插一瓶花', 'Arrange a vase of flowers', 'vase', { s: SP }),
  i('晒晒被褥', 'Air the quilts in the sun', 'sun', { s: SP }),
  i('放风筝', 'Fly a kite', 'kite', { s: SP }),
  i('赏花', 'Go and see the blossom', 'flowers', { s: SP }),
  i('挖野菜', 'Forage for wild greens', 'forage', { s: SP }),
  i('春捂', 'Keep your layers on a little longer', 'clothes', { s: SP }),
  // summer
  i('吃西瓜', 'Eat watermelon', 'fruit', { s: SU, c: ['meal'] }),
  i('摇扇纳凉', 'Fan yourself in the shade', 'cool', { s: SU }),
  i('赏荷', 'Go and see the lotus', 'flowers', { s: SU }),
  i('观萤', 'Watch the fireflies', 'stars', { s: SU }),
  i('喝绿豆汤', 'Have some mung-bean soup', 'soup', { s: SU }),
  i('晒书', 'Air your books in the sun', 'books', { s: ['summer', 'autumn'] }),
  i('午后听蝉', 'Listen to the cicadas after lunch', 'cicada', { s: SU }),
  i('早起趁凉', 'Get things done in the morning cool', 'morning', { s: SU }),
  i('冲个凉', 'Take a cool shower', 'bath', { s: SU }),
  // autumn
  i('看红叶', 'Go and see the red leaves', 'outing', { s: AU }),
  i('秋游', 'Take an autumn outing', 'outing', { s: AU }),
  i('润肺', 'Soothe your lungs: pear, lily, honey', 'soup', { s: AU }),
  i('早晚添衣', 'Add a layer morning and evening', 'clothes', { s: ['autumn', 'winter'] }),
  i('夜读', 'Read by lamplight', 'read', { s: ['autumn', 'winter'], c: ['sleep'] }),
  i('闻桂花', 'Breathe in the osmanthus', 'flowers', { s: AU }),
  i('夹一片落叶', 'Press a fallen leaf in a book', 'leaf', { s: AU }),
  i('炒栗子', 'Roast chestnuts', 'snack', { s: AU }),
  i('晒秋', 'Lay the harvest out in the sun', 'sun', { s: AU }),
  // winter
  i('围炉', 'Gather round the stove', 'stove', { s: WI }),
  i('煮酒', 'Warm some wine', 'wine', { s: WI }),
  i('泡脚', 'Soak your feet', 'feet', { s: ['autumn', 'winter'] }),
  i('晒太阳', 'Bask in the winter sun', 'sun', { s: WI }),
  i('赏雪', 'Go out and look at the snow', 'snow', { s: WI }),
  i('喝一碗粥', 'Have a bowl of hot congee', 'soup', { s: WI }),
  i('烤红薯', 'Roast a sweet potato', 'snack', { s: WI }),
  i('读一本厚书', 'Settle into a thick book', 'read', { s: WI }),
  i('早卧晚起', 'Early to bed, late to rise — as the old texts advise for winter', 'sleep', { s: WI, c: ['morning'] }),
  i('写春联', 'Write the New Year couplets', 'brush', { t: [22, 23] }),
  i('吃螃蟹', 'Eat hairy crab', 'seasonal-food', { t: [16, 17] }),
  // solar-term customs
  i('咬春', '“Bite into spring”: eat spring rolls', 'seasonal-food', { t: [0] }),
  i('迎春', 'Go out to meet the spring', 'outing', { t: [0] }),
  i('看草色', 'Look for the first green haze of grass', 'outing', { t: [1] }),
  i('听春雷', 'Listen for the spring thunder', 'thunder', { t: [2] }),
  i('看桃花', 'Go and see the peach blossom', 'flowers', { t: [2] }),
  i('竖蛋', 'Try to stand an egg on end', 'egg', { t: [3] }),
  i('踏青', 'Walk out on the new grass', 'outing', { t: [3, 4, 5] }),
  i('插柳', 'Put up a sprig of willow', 'willow', { t: [4] }),
  i('追思先人', 'Remember those who came before', 'ancestors', { t: [4] }),
  i('品新茶', 'Taste this year\'s new tea', 'tea', { t: [5] }),
  i('种瓜点豆', 'Sow melons, plant beans', 'garden', { t: [5] }),
  i('称体重', 'Weigh yourself (an old Start-of-Summer custom)', 'weigh', { t: [6] }),
  i('吃苦菜', 'Eat some bitter greens', 'seasonal-food', { t: [7] }),
  i('送花神', 'Bid farewell to the flower goddess', 'flowers', { t: [8] }),
  i('吃一碗面', 'Eat a bowl of noodles', 'seasonal-food', { t: [9] }),
  i('尝新米', 'Taste the new rice', 'seasonal-food', { t: [10] }),
  i('喝伏茶', 'Drink cooling “dog-days” tea', 'tea', { t: [10, 11] }),
  i('贴秋膘', 'Put on a little autumn weight', 'seasonal-food', { t: [12], c: ['meal'] }),
  i('啃秋', '“Bite into autumn”: one last watermelon', 'fruit', { t: [12], c: ['meal'] }),
  i('放河灯', 'Float a lantern on the river', 'lantern', { t: [13] }),
  i('饮白露茶', 'Drink White Dew tea', 'tea', { t: [14] }),
  i('赏月', 'Sit out and admire the moon', 'moon', { t: [14, 15] }),
  i('登高', 'Climb a hill for the Double Ninth', 'climb', { t: [16] }),
  i('赏菊', 'Go and see the chrysanthemums', 'flowers', { t: [16, 17] }),
  i('吃柿子', 'Eat a persimmon', 'fruit', { t: [17] }),
  i('补冬', 'Eat a warming, nourishing meal', 'seasonal-food', { t: [18], c: ['meal'] }),
  i('腌菜', 'Pickle some vegetables', 'pickle', { t: [19, 20] }),
  i('腌腊肉', 'Cure some bacon for the New Year', 'pickle', { t: [20, 21] }),
  i('温一壶酒', 'Warm a pot of wine', 'wine', { t: [19] }),
  i('吃饺子', 'Eat dumplings', 'seasonal-food', { t: [21] }),
  i('吃汤圆', 'Eat sweet rice balls', 'seasonal-food', { t: [21] }),
  i('画消寒图', 'Start a “dispelling the cold” chart', 'nines', { t: [21] }),
  i('喝腊八粥', 'Have a bowl of Laba congee', 'soup', { t: [22] }),
  i('探梅', 'Go looking for plum blossom', 'flowers', { t: [22, 23] }),
  i('扫尘', 'Sweep out the old year\'s dust', 'clean', { t: [23] }),
  i('备年货', 'Stock up for the New Year', 'newyear', { t: [23], c: ['money'] }),
];

// ── 忌 ─────────────────────────────────────────────────────────────────────────
export const JI: AlmanacItem[] = [
  // any day
  i('熬夜', 'Staying up late', 'sleep'),
  i('刷手机到深夜', 'Scrolling your phone deep into the night', 'phone'),
  i('走路看手机', 'Walking while staring at your phone', 'phone'),
  i('久坐', 'Sitting for too long', 'body'),
  i('伏案过久', 'Hunching over the desk for hours', 'body'),
  i('与人争辩', 'Arguing with people', 'argue'),
  i('空腹喝咖啡', 'Coffee on an empty stomach', 'coffee'),
  i('暴饮暴食', 'Eating and drinking too much', 'meal'),
  i('夜宵过饱', 'A heavy midnight snack', 'meal'),
  i('生闷气', 'Sulking', 'mood'),
  i('眉头紧锁', 'Frowning all day', 'mood'),
  i('翻旧账', 'Dredging up old grievances', 'grudge'),
  i('拖延', 'Putting things off', 'procrastinate'),
  i('临时抱佛脚', 'Cramming at the last minute', 'procrastinate'),
  i('冲动消费', 'Impulse buying', 'money'),
  i('妄自菲薄', 'Selling yourself short', 'self'),
  i('与人攀比', 'Comparing yourself with others', 'self'),
  i('说人闲话', 'Gossip', 'gossip'),
  i('心浮气躁', 'Restlessness', 'haste'),
  i('揠苗助长', 'Pulling up seedlings to make them grow', 'haste'),
  i('贪多求快', 'Wanting too much, too fast', 'haste'),
  i('一心多用', 'Doing three things at once', 'focus'),
  i('东张西望', 'Letting your attention wander', 'focus'),
  i('大动肝火', 'Losing your temper', 'anger'),
  i('负气出门', 'Leaving the house in a huff', 'anger'),
  i('半途而废', 'Giving up halfway', 'giveup'),
  i('一曝十寒', 'One day of sun, ten days of frost', 'giveup'),
  i('虎头蛇尾', 'A tiger\'s head and a snake\'s tail', 'giveup'),
  i('久看屏幕', 'Staring at screens too long', 'eyes'),
  i('赖床', 'Lingering in bed', 'morning'),
  i('忘记喝水', 'Forgetting to drink water', 'water'),
  i('已读不回', 'Leaving messages on “read”', 'reply'),
  i('说“随便”', 'Saying “whatever”', 'decide'),
  i('轻许诺言', 'Making promises lightly', 'promise'),
  i('杞人忧天', 'Worrying the sky will fall', 'worry'),
  i('疑神疑鬼', 'Imagining the worst', 'worry'),
  i('吃饭看手机', 'Eating with your eyes on a screen', 'meal', { c: ['phone'] }),
  i('高声喧哗', 'Being loud', 'noise'),
  i('浪费粮食', 'Wasting food', 'waste'),
  i('四体不勤', 'Letting your limbs grow idle', 'exercise'),
  i('纸上谈兵', 'Planning without doing', 'talk'),
  i('画蛇添足', 'Adding legs to the snake', 'overdo'),
  i('求全责备', 'Demanding perfection', 'perfect'),
  i('好高骛远', 'Reaching too high, skipping the basics', 'greed'),
  i('贪杯', 'One cup too many', 'wine'),
  i('自责太久', 'Blaming yourself for too long', 'self'),
  i('足不出户', 'Never setting foot outside', 'outing'),
  // spring
  i('过早减衣', 'Shedding layers too early', 'clothes', { s: SP }),
  i('春困贪睡', 'Giving in to spring drowsiness', 'morning', { s: SP }),
  i('淋雨', 'Getting caught in the rain', 'rain', { s: ['spring', 'summer'] }),
  i('辜负春光', 'Wasting the spring light', 'outing', { s: SP }),
  i('攀折花枝', 'Breaking branches off flowering trees', 'vase', { s: SP }),
  // summer
  i('贪凉', 'Chasing the cold', 'cool', { s: SU }),
  i('空调直吹', 'Sitting right under the air-conditioning', 'cool', { s: SU }),
  i('猛喝冰水', 'Gulping iced water', 'water', { s: SU }),
  i('贪吃生冷', 'Too much cold, raw food', 'meal', { s: SU }),
  i('正午暴晒', 'Standing in the noon sun', 'sun', { s: SU }),
  i('午睡太久', 'Napping too long', 'nap', { s: SU }),
  i('心急上火', 'Getting hot and bothered', 'anger', { s: SU }),
  i('湿衣久穿', 'Staying in damp clothes', 'clothes', { s: SU }),
  // autumn
  i('无故悲秋', 'Moping over autumn for no reason', 'mood', { s: AU }),
  i('秋冻过头', 'Taking “autumn toughening” too far', 'clothes', { s: AU }),
  i('辛辣过度', 'Too much spicy food', 'spicy', { s: ['autumn', 'winter'] }),
  i('贪吃秋瓜', 'Too much melon once autumn comes', 'fruit', { s: AU, c: ['meal'] }),
  i('登高逞强', 'Climbing beyond your strength', 'climb', { s: AU }),
  i('秋燥少饮', 'Drinking too little in the dry autumn air', 'water', { s: AU }),
  i('贴膘过度', 'Overdoing the autumn fattening', 'seasonal-food', { s: AU, c: ['meal'] }),
  // winter
  i('冷水洗头', 'Washing your hair in cold water', 'cold', { s: WI }),
  i('终日闭窗', 'Keeping the windows shut all day', 'air', { s: WI }),
  i('窝着不动', 'Curling up and never moving', 'exercise', { s: WI }),
  i('贪暖久卧', 'Staying under the quilt too long', 'morning', { s: WI }),
  i('衣薄出门', 'Going out underdressed', 'clothes', { s: WI }),
  i('冬泳逞强', 'Showing off with a winter swim', 'cold', { s: WI }),
  i('抱着火炉不放', 'Hugging the stove all day', 'stove', { s: WI }),
  // solar-term flavour
  i('赖在冬天', 'Lingering in winter', 'mood', { t: [0] }),
  i('大惊小怪', 'Making a fuss over nothing', 'worry', { t: [2] }),
  i('偏心', 'Playing favourites', 'balance', { t: [3, 15] }),
  i('求满', 'Wanting everything full to the brim', 'perfect', { t: [7] }),
  i('急于求成', 'Rushing the harvest', 'haste', { t: [8, 13] }),
  i('贪一时之凉', 'A moment\'s cool at the body\'s expense', 'cool', { t: [9, 10, 11] }),
  i('伤春', 'Grieving for the passing spring', 'mood', { t: [5] }),
  i('露体贪凉', 'Sleeping uncovered as the dew grows cold', 'cool', { t: [14, 16] }),
  i('畏寒不出', 'Hiding from the cold indoors', 'outing', { t: [22, 23] }),
];

// ---------------------------------------------------------------------------

const seasonOf = (term: number): Season =>
  (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor((((term % 24) + 24) % 24) / 6)];

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

/** Take up to `n` items from `pool` (in shuffled order) whose topics are not yet used. */
function take(pool: readonly AlmanacItem[], n: number, used: Set<string>, rng: Rng, out: AlmanacItem[]): void {
  let taken = 0;
  for (const it of shuffled(pool, rng)) {
    if (taken >= n) break;
    const topics = topicsOf(it);
    if (topics.some((t) => used.has(t)) || out.some((o) => o.zh === it.zh)) continue;
    for (const t of topics) used.add(t);
    out.push(it);
    taken++;
  }
}

/** Items eligible on a day in `term` (term customs, this season's items, and untagged items). */
export function eligible(list: readonly AlmanacItem[], termIndex: number): { term: AlmanacItem[]; season: AlmanacItem[]; general: AlmanacItem[] } {
  const term = ((Math.floor(termIndex) % 24) + 24) % 24;
  const season = seasonOf(term);
  return {
    term: list.filter((it) => it.terms?.includes(term)),
    season: list.filter((it) => !it.terms && it.seasons?.includes(season)),
    general: list.filter((it) => !it.terms && !it.seasons),
  };
}

function pickSide(list: readonly AlmanacItem[], termIndex: number, n: number, termChance: number, seasonChance: number, used: Set<string>, rng: Rng): AlmanacItem[] {
  const pools = eligible(list, termIndex);
  const out: AlmanacItem[] = [];
  if (rng() < termChance) take(pools.term, 1, used, rng, out);
  if (rng() < seasonChance) take(pools.season, 1, used, rng, out);
  take([...pools.general, ...pools.season], n - out.length, used, rng, out);
  return out;
}

/** Deterministic for a given date & term — the same day always reads the same. */
export function almanacFor(dateKey: string, termIndex: number): AlmanacDay {
  const rng = makeRng(hashString(`almanac:${dateKey}:${termIndex}`));
  const nYi = rng() < 0.5 ? 3 : 4;
  const nJi = rng() < 0.5 ? 2 : 3;
  const used = new Set<string>();
  // A term's custom shows on most days of its fortnight; a 忌 with term flavour now and then.
  const yi = pickSide(YI, termIndex, nYi, 0.8, 0.9, used, rng);
  const ji = pickSide(JI, termIndex, nJi, 0.35, 0.6, used, rng);
  const strip = ({ zh, en }: AlmanacItem) => ({ zh, en });
  return { yi: yi.map(strip), ji: ji.map(strip) };
}
