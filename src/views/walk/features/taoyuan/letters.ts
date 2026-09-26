// The 桃源 letters (see scratchpad bible §5). Pure data: the mail store (src/app/mail.ts) delivers
// them when `due` says so, or when the story calls deliver(). Text lives under the walk so its
// glyphs go into the walk's font.
import type { LetterDef } from '../../../../data/letters';
import { diffDays } from '../../../../core/date';

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
      zh: '印不在匣，人不在谷外。香知其时，花记其步。——子正已到，天不会亮，直到有人说出实话。',
      en: 'The seal is not in the box, and the one who took it has not left the valley. The incense knows the hour; the petals remember the steps. — It is midnight, and dawn will not come until someone tells the truth.',
    },
    note: { zh: '字迹歪斜，行与行叠在一处，像是摸着纸写的。信里夹着一根青鸟羽。', en: 'The writing slants, and the lines run into each other, as if written by touch. A bluebird feather is tucked inside.' },
    attach: { item: { kind: 'clue', id: 'feather', zh: '青鸟羽', en: 'A Bluebird Feather' } },
    scope: 'valley',
  },
  {
    id: 'ty-xiaoman',
    from: { zh: '秦小满', en: 'Qin Xiaoman' },
    seal: '满',
    subject: { zh: '小满的信', en: 'A Letter from Xiaoman' },
    body: {
      zh: '{名}：阿爷说不能给外人写信，我是偷偷写的。字是葛姑教的，丑也不许笑。你走以后，花还是落，落得比从前慢一点，葛姑说是在等你。我夹了一片花瓣给你，你拿着它，瀑布后面的光就还在。你要是再来，我带你去看我的新树洞。——秦小满',
      en: "{名}: Grandpa says we mustn't write to outside people, so I'm writing in secret. 葛姑 taught me the characters, so you're not allowed to laugh at them. Since you left the petals still fall, a little slower than before — 葛姑 says they're waiting for you. I've pressed a petal for you. Keep it, and the light behind the waterfall will still be there. If you come back, I'll show you my new hollow. — Qin Xiaoman",
    },
    ps: [
      { flag: 'ty:wish:xiaoman', zh: '又：花神姐姐说我长到阮哥哥那么高，就能出去。我每天都量。', en: 'P.S. The flower lady says when I\'m as tall as brother 阮 I can go out. I measure myself every day.' },
      { flag: 'ty:wish:again', zh: '又：花神姐姐说她替你记着路。', en: "P.S. The flower lady says she's remembering the way for you." },
      { flag: 'ty:wish:none', zh: '又：花神姐姐说，你什么都不要，所以你什么时候都能来。', en: 'P.S. The flower lady says that because you want nothing, you can come any time.' },
      { flag: 'case:hz:parked', zh: '又：庭里的花谁也不许扫，阿爷天天去看一眼。', en: "P.S. Nobody's allowed to sweep the shrine yard. Grandpa goes to look at it every day." },
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
      zh: '{名}足下：那夜我走进殿里，手一直在抖，压香的时候却稳得很——人做错事，原来手是稳的。桃叶走的那天早上，回头看了我三回。桑远的那双草鞋，我今早拿出来晒了。二十年，鞋底还是新的。秦老让我把这方里印交给你：盖在哪里，哪里便算桃源。',
      en: 'Dear {名}: That night, walking into the hall, my hands shook the whole time — but pressing the incense they were perfectly steady. It seems that when we do wrong, our hands are steady. The morning 桃叶 left, she looked back at me three times. This morning I took Sang Yuan\'s straw sandals out to air. Twenty years, and the soles are still new. Elder Qin asked me to give you this village seal: wherever you stamp it, that place counts as the Peach Spring.',
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
      zh: '{名}兄台：我们在水乡茶楼落了脚。外头的人走路真快，说话也快，桃叶头一天就把桥上的人数了三遍。我在码头扛货，挣了头一笔工钱，附上二十文，桃叶说要请你喝茶。明年花朝，我们回去。印盖了，路就在。——阮青、桃叶同拜',
      en: "Dear {名}: We have settled at the teahouse in the water town. People outside walk fast and talk fast — on the first day 桃叶 counted everyone crossing the bridge three times over. I carry cargo at the wharf and have earned my first wages; twenty coins are enclosed — 桃叶 says they're to buy you tea. Next Flowers' Birthday we're going back. The pass is stamped, so the road will be there. — With respect, Ruan Qing and Taoye",
    },
    attach: { coins: 20 },
    due: (p, today) => !!p.done['case:hz'] && diffDays(p.done['case:hz'], today) >= 3,
  },
];
