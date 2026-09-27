// The 桃源 letters (see scratchpad bible §5). Pure data: the mail store (src/app/mail.ts) delivers
// them when `due` says so, or when the story calls deliver(). Text lives under the walk so its
// glyphs go into the walk's font.
import type { LetterDef } from '../../../../data/letters';
import { diffDays } from '../../../../core/date';
import { dayNumber } from './life/keys';

const before = (d: string | undefined, today: string) => !!d && diffDays(d, today) >= 1;

export const TAOYUAN_LETTERS: LetterDef[] = [
  {
    id: 'ty-shide',
    from: { zh: '山寺 · 拾得', en: 'Shide, of the Mountain Temple' },
    seal: '拾',
    subject: { zh: '瀑后有光', en: 'Light behind the Falls' },
    body: {
      zh: '{名}施主：老僧扫叶三十年，从未见过瀑布后头有光。昨夜月下，满潭都是桃花瓣，一片一片从瀑顶漂下来，漂到老僧的扫帚边。这山上没有桃树。施主若得闲，可来潭边一看。——山寺 拾得',
      en: 'Honoured {名}: In thirty years of sweeping leaves I have never seen light behind the waterfall. Last night, under the moon, the whole pool was full of peach petals, drifting down one by one over the top of the falls, right up to my broom. There are no peach trees on this mountain. If you have a free hour, come and look at the pool. — Shide, of the Mountain Temple',
    },
    due: (p) => !!p.flags['mail:chujian'] && !!p.flags['visit:mountain'],
  },
  {
    id: 'ty-wuming',
    from: { zh: '（未署名）', en: '(unsigned)' },
    seal: '羽',
    subject: { zh: '无名信', en: 'An Unsigned Letter' },
    body: {
      zh: '印不在匣里，拿它的人也没出谷。香灭在哪儿，花盖了多厚，去看。子正到了。没人说实话，天就亮不了。',
      en: 'The seal is not in the box, and whoever took it has not left the valley. Go and see where the incense died and how deep the petals lie. It is midnight. Until someone tells the truth, it will not get light.',
    },
    note: { zh: '字迹歪斜，行与行叠在一处，像是摸着纸写的。信里夹着一根青鸟羽。', en: 'The writing slants, and the lines run into each other, as if written by touch. A bluebird feather is tucked inside.' },
    attach: { item: { kind: 'clue', id: 'feather', zh: '青鸟羽', en: 'A Bluebird Feather' } },
    scope: 'valley',
    due: (p) => !!p.flags['ty:b5s'],
  },
  {
    id: 'ty-xiaoman',
    from: { zh: '秦小满', en: 'Qin Xiaoman' },
    seal: '满',
    subject: { zh: '小满的信', en: 'A Letter from Xiaoman' },
    body: {
      zh: '{名}：阿爷说不能给外人写信，我是偷偷写的。字是葛姑教的，丑也不许笑。你走以后，花还是落，落得比从前慢一点，葛姑说她还没算明白为什么。我夹了一片花瓣给你，你拿着它，瀑布后面的光就还在。你要是再来，我带你去看我的新树洞。——秦小满',
      en: "{名}: Grandpa says we mustn't write to outside people, so I'm writing in secret. Ge Gu taught me the characters, so you're not allowed to laugh at them. Since you left the petals still fall, a little slower than before. Ge Gu says she hasn't worked out why yet. I've pressed a petal for you. Keep it, and the light behind the waterfall will still be there. If you come back, I'll show you my new hollow. — Qin Xiaoman",
    },
    // (the first whose flag is set shows: the parked case first — B7 always leaves a wish behind it)
    ps: [
      { flag: 'case:hz:parked', zh: '又：庭里的花谁也不许扫，阿爷天天去看一眼。', en: "P.S. Nobody's allowed to sweep the shrine yard. Grandpa goes to look at it every day." },
      { flag: 'ty:wish:xiaoman', zh: '又：花神姐姐说我长到阮哥哥那么高，就能出去。我每天都量。', en: 'P.S. The flower lady says when I\'m as tall as brother Ruan I can go out. I measure myself every day.' },
      { flag: 'ty:wish:again', zh: '又：花神姐姐说她替你记着路。', en: "P.S. The flower lady says she's remembering the way for you." },
      { flag: 'ty:wish:none', zh: '又：花神姐姐说，你什么都不要，所以你什么时候都能来。', en: 'P.S. The flower lady says that because you want nothing, you can come any time.' },
    ],
    attach: { item: { kind: 'keep', id: 'petal', zh: '压花桃瓣', en: 'A Pressed Peach Petal' } },
    sets: ['ty:way'],
    scope: 'valley',
    due: (p, today) => before(p.done['ty:b8'], today),
  },
  {
    id: 'ty-sang',
    from: { zh: '桑三娘', en: 'Sang Sanniang' },
    seal: '桑',
    subject: { zh: '三娘的信', en: 'A Letter from Sang Sanniang' },
    body: {
      zh: '{名}足下：那夜进殿，我的手一直在抖。可那天下午压香，手稳得很。桃叶走的那天早上，回头看了我三回。桑远的那双草鞋，今早我拿出来晒了，二十年，鞋底还是新的。秦老让我把这方里印交给你，他说盖在哪里，哪里就算桃源。',
      en: 'Dear {名}: That night, going into the hall, my hands shook the whole time. Yet that afternoon, pressing the incense, they were perfectly steady. The morning Taoye left, she looked back at me three times. This morning I put Sang Yuan\'s straw sandals out to air. Twenty years, and the soles are still new. Elder Qin asked me to give you this village seal. He says wherever you stamp it counts as the Peach Spring.',
    },
    note: { zh: '信纸有桑叶的清气。', en: 'The paper smells faintly of mulberry leaves.' },
    attach: { item: { kind: 'keep', id: 'taoyuanli', zh: '桃源里印', en: 'The Peach Spring Village Seal' } },
    scope: 'valley',
    due: (p, today) => before(p.done['case:hz'], today),
  },
  {
    id: 'ty-ruan',
    from: { zh: '阮青 · 桑桃叶', en: 'Ruan Qing and Taoye' },
    seal: '归',
    subject: { zh: '山外来信', en: 'A Letter from Outside' },
    body: {
      zh: '{名}兄台：我们在水乡茶楼落了脚。外头的人走路真快，说话也快，桃叶头一天就把桥上的人数了三遍。我在码头扛货，挣了头一笔工钱，附上二十文，桃叶说要请你喝茶。明年花朝，我们回去。印盖过了，路一定找得着，真的。——阮青、桃叶同拜',
      en: "Dear {名}: We've settled at the teahouse in the water town. People outside walk fast and talk fast. On the first day Taoye counted everyone crossing the bridge three times over. I carry cargo at the wharf and have earned my first wages; twenty coins are enclosed, and Taoye says they're to buy you tea. Next Flowers' Birthday we're coming back. The pass is stamped, so we'll find the road. Honest. — With respect, Ruan Qing and Taoye",
    },
    attach: { coins: 20 },
    due: (p, today) => !!p.done['case:hz'] && diffDays(p.done['case:hz'], today) >= 3,
  },
  // 二期「常住」: once you have come back (tyl:back) and then stayed away a week (best['tyl:lastday'],
  // the day number of the last visit, written on every way in); delivered once, like every letter
  {
    id: 'ty-guiniang',
    from: { zh: '桂娘', en: 'Gui Niang' },
    seal: '桂',
    subject: { zh: '锅里给你留着', en: 'Kept Warm for You' },
    body: {
      zh: '{名}：粥熬多了。小满非说你今天来，天没亮就去台子上等着。得空就来一趟，锅里给你留着。——桂娘',
      en: "{名}: I made too much congee. Xiaoman swore you'd come today, and he was up on the terrace before dawn waiting. Come by when you can. There's some kept warm for you. — Gui Niang",
    },
    note: { zh: '字是葛姑的，一笔一画，像在记账。', en: 'The handwriting is Ge Gu\'s, every stroke careful, like an account book.' },
    scope: 'valley',
    due: (p, today) => {
      const last = p.best['tyl:lastday'];
      return !!p.flags['tyl:back'] && typeof last === 'number' && last > 0 && dayNumber(today) - last >= 7;
    },
  },
];
