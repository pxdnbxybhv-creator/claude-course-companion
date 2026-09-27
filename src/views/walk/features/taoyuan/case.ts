// 落花为证 · 花朝失印案 — the case (story bible §4) as data and pure logic: the twelve clues and what
// their cards say, the six witnesses and the lies they tell, which evidence breaks each lie, the four
// contradictions, the five questions of the judgement with their answers, needs and wrong-answer lines,
// the bluebird's hint ladder, when the elder can call everyone to the courtyard, and the grades.
// No three.js, no DOM: tested in tests/taoyuan-case.test.ts; case-world.ts plays it in the valley and
// src/views/walk/case/ shows the 案卷.
//
// Progress is play only (backed up, synced across tabs): `case:hz:c:<clue>` (found), `case:hz:h:<who>`
// (heard), `case:hz:t:<who>` (a lie broken), `case:hz:a:<key>` (a card's addendum), `case:hz:q:<n>`
// (a question answered), `case:hz:hint:<step>:<tier>` (a bluebird's note read), the counters
// `case:hz:miss` / `case:hz:hint`, and the grade. None of it may be set by the owner's code.
import type { CharacterId } from '../../../../data/characters';
import type { VillagerKey } from './hooks';
import type { AnchorName } from './places';

export interface Line { zh: string; en: string }
const t = (zh: string, en: string): Line => ({ zh, en });
type Flags = Readonly<Record<string, true | undefined>>;

// ───────────────────────────── flags

export const CASE_FLAGS = {
  open: 'case:hz:open',
  parked: 'case:hz:parked',
  solved: 'case:hz:solved',
  /** 小满 found in the hollow (T6 heard). */
  found: 'case:hz:found',
  /** The jade seal taken from under the mulberry leaves (C10). */
  seal: 'case:hz:seal',
  /** 大橘 smelled the wine at the door in B4b (the story sets it). */
  catnose: 'case:hz:catnose',
  /** The letter-writer found out (the epilogue bonus). */
  writer: 'case:hz:writer',
  /** 石瞽's word after a confession, said once. */
  zibaiSaid: 'case:hz:zibai:said',
} as const;
/** `done[DAY_KEY]` is the day the case was judged (the letters of the next days read it). */
export const DAY_KEY = 'case:hz';
export const COUNTERS = { miss: 'case:hz:miss', hint: 'case:hz:hint', q2miss: 'case:hz:miss:q2' } as const;

export type ClueKey = 'xiang' | 'tan' | 'feng' | 'menxiang' | 'zuji' | 'hualou' | 'buchi' | 'lengzao' | 'bu' | 'can' | 'bitao' | 'beiyin';
export const CLUE_KEYS: readonly ClueKey[] = ['xiang', 'tan', 'feng', 'menxiang', 'zuji', 'hualou', 'buchi', 'lengzao', 'bu', 'can', 'bitao', 'beiyin'];
export type WitnessKey = 'liupo' | 'duer' | 'ruan' | 'taoye' | 'sang' | 'xiaoman';
export const WITNESS_KEYS: readonly WitnessKey[] = ['liupo', 'duer', 'ruan', 'taoye', 'sang', 'xiaoman'];
/** A lie broken: `sang2` is 三娘's second. */
export type BreakKey = Exclude<WitnessKey, 'xiaoman'> | 'sang2';
/** What can be shown to a witness: a clue card, or a testimony card (`T:<who>`). */
export type EvidenceKey = ClueKey | `T:${WitnessKey}`;

export const clueFlag = (k: ClueKey) => `case:hz:c:${k}`;
export const heardFlag = (w: WitnessKey) => `case:hz:h:${w}`;
export const brokeFlag = (b: BreakKey) => `case:hz:t:${b}`;
export const addFlag = (k: string) => `case:hz:a:${k}`;
export const qFlag = (n: number) => `case:hz:q:${n}`;
export type Grade = 'shen' | 'ming' | 'ping' | 'zibai';
export const gradeFlag = (g: Grade) => `case:hz:grade:${g}`;
export type StepKey = 'find' | 'when' | 'how' | 'who' | 'why';
export const hintFlag = (s: StepKey, tier: number) => `case:hz:hint:${s}:${tier}`;

export const caseIsOpen = (f: Flags): boolean => !!f[CASE_FLAGS.open] && !f[CASE_FLAGS.solved];

// ───────────────────────────── the clues (§4.3)

/** How a clue can be come by. `companion` routes are only ever faster: every clue has another. */
export type Route =
  | { by: 'examine'; at: AnchorName }
  | { by: 'memory' }
  | { by: 'ask'; who: VillagerKey }
  | { by: 'companion'; who: CharacterId };

export interface Addendum {
  flag: string;
  line: Line;
  /** A companion's word (it only ever adds; the card stands without it), or the spare tray's test. */
  by?: CharacterId | 'test';
}

export interface Clue {
  n: number;
  key: ClueKey;
  name: Line;
  /** Where its prompt stands (null: a memory, or on someone). */
  at: AnchorName | null;
  /** The prompt's label there — a place, never the clue's name before it is found. */
  where: Line;
  card: Line;
  addenda: Addendum[];
  routes: Route[];
}

export const CLUES: readonly Clue[] = [
  {
    n: 1, key: 'xiang', name: t('香篆 · 灭在亥正', 'The Incense Seal, Dead at 亥正'), at: 'incense', where: t('供桌 · 香篆', 'The altar · the incense seal'),
    card: t(
      '香篆从戌针点起，烧到亥正那一针就灭了。灭处往前的一段香粉湿透了，有股酒气；往后烧过的香灰是干的，整整齐齐，一点没溅上。',
      'The incense trail was lit at the 戌 pin and burned as far as the 亥正 pin (10 pm), where it went out. The powder ahead of that point is soaked through and smells of wine. The ash behind it, already burnt, is dry and whole — not a drop on it.',
    ),
    addenda: [{ flag: addFlag('xiang'), by: 'test', line: t('试香：泼上去的酒，前后都溅。', 'Tried on the spare tray: splashed wine lands on both sides.') }],
    routes: [{ by: 'examine', at: 'incense' }, { by: 'companion', who: 'player' }],
  },
  {
    n: 2, key: 'tan', name: t('碎坛 · 陈酿', 'The Broken Jar'), at: 'shards', where: t('供桌前 · 碎坛', 'Before the altar · the shards'),
    card: t(
      '供坛摔碎在供桌前。泥封是整块揭下来的，搁在一边，没摔裂。酒早渗进了砖缝，只剩边上一圈还湿。漆匣的封泥被人整整齐齐剥开，「守拙」两个字好好的。',
      'The offering jar lies smashed before the altar. Its mud cap was lifted off whole and set aside — it did not crack in the fall. The spilt wine has long since soaked into the brick joints; only the rim of the stain is still damp. The clay on the lacquer box was peeled away neatly, and the elder\'s seal, "Shouzhuo", is unbroken.',
    ),
    addenda: [],
    routes: [{ by: 'examine', at: 'shards' }],
  },
  {
    n: 3, key: 'feng', name: t('泥封无香', 'A Sealed Jar Has No Smell'), at: 'cellarJar', where: t('酒窖 · 陈坛', 'The cellar · the sealed jars'),
    card: t(
      '杜二窖里的陈坛，凑近了闻，只有泥土腥。杜二：「泥封着的坛子，神仙来了也闻不着！今年开了封的十年陈就一坛，供花神那坛。场上喝的新醅，没那个香。」',
      'Nose to a sealed jar in Du Er\'s cellar: only the smell of earth. Du Er: "A mud-sealed jar? Not even a god could smell it! Only one ten-year jar got opened this year — the flower god\'s. The new brew at the square hasn\'t got that smell."',
    ),
    addenda: [
      { flag: addFlag('feng'), by: 'poet', line: t('诗仙尝了一口场上的新醅：「淡！」', 'The Poet Immortal tasted the new brew from the square: "Thin!"') },
      { flag: addFlag('feng:cat'), by: 'cat', line: t('大橘：「土味。」', 'Big Ginger: "Dirt."') },
    ],
    routes: [{ by: 'examine', at: 'cellarJar' }, { by: 'ask', who: 'duer' }, { by: 'companion', who: 'cat' }],
  },
  {
    n: 4, key: 'menxiang', name: t('门外酒香', 'Wine at the Door'), at: null, where: t('记忆', 'A memory'),
    card: t(
      '亥初，我和柳婆一起到殿门口挂灯。她没进殿，站在门外说：「杜二那坛陈酿真香，隔着门都闻得到。」',
      'At 亥初 (9 pm) I hung the lantern at the hall door with Liu Po. She did not go in; standing outside she said, "That aged jar of Du Er\'s — you can smell it through the door."',
    ),
    addenda: [{ flag: CASE_FLAGS.catnose, by: 'cat', line: t('大橘也说：「酒味，好浓。」', 'Big Ginger said so too: "Wine. Strong."') }],
    routes: [{ by: 'memory' }],
  },
  {
    n: 5, key: 'zuji', name: t('庭中足迹', 'Prints in the Courtyard'), at: 'courtyard', where: t('祠堂 · 庭中落花', 'The shrine · petals in the courtyard'),
    card: t('院子里的落花铺了一层又一层，底下的脚印，有的盖得厚，有的盖得薄：', 'Petals lie in layers across the courtyard, and the footprints sit under them at different depths:'),
    addenda: [{ flag: addFlag('zuji'), by: 'painter', line: t('画师的纸鹤落在那双补过的屐痕上：「屐齿一方一圆。」', 'The Painter\'s crane settled on the patched prints: "One tooth square, one round."') }],
    routes: [{ by: 'examine', at: 'courtyard' }, { by: 'companion', who: 'taoist' }],
  },
  {
    n: 6, key: 'hualou', name: t('花漏', 'The Petal Clock'), at: 'basin', where: t('药圃 · 石盆', 'The herb garden · the stone basin'),
    card: t(
      '葛姑的花漏石盆，刻着十道圈。葛姑：「谷里的花，落得比更漏还匀。半个时辰，盖地一分。今夜没风，祠堂院子四面又有墙，差不了。」',
      'Ge Gu\'s petal-clock basin, ruled in ten rings. Ge Gu: "The petals in here fall more evenly than any water-clock. Half a double-hour, one tenth of the ground. No wind tonight, and the shrine yard\'s walled all round — it won\'t be off."',
    ),
    addenda: [{ flag: addFlag('hualou'), line: t('葛姑：「盖了几分，就从子正往回数几个半时辰。」', 'Ge Gu: "However many tenths, count back that many hours from midnight."') }],
    routes: [{ by: 'examine', at: 'basin' }, { by: 'ask', who: 'gegu' }, { by: 'companion', who: 'gardener' }],
  },
  {
    n: 7, key: 'buchi', name: t('桃木补齿', 'The Peachwood Patch'), at: 'bench', where: t('鲁三的木案', 'Lu San\'s workbench'),
    card: t(
      '鲁三的木案上压着今天的活计单：「桑三娘 屐一只 补后齿 桃木 辰时」。旁边一块桃木边角料，削出来的圆头，跟院子里那个圆齿印一模一样。',
      'Under a weight on Lu San\'s bench, today\'s job list: "Sang Sanniang — one clog — rear tooth mended — peachwood — morning." A peachwood offcut beside it has the same rounded end as the round tooth-print in the courtyard.',
    ),
    addenda: [{ flag: addFlag('buchi'), by: 'guan', line: t('鲁三（当着关公）：「补得急，没上漆，走起来一齿响、一齿闷。」', 'Lu San (before Lord Guan): "I rushed it and didn\'t lacquer it — one tooth clicks, the other thuds."') }],
    routes: [{ by: 'examine', at: 'bench' }],
  },
  {
    n: 8, key: 'lengzao', name: t('冷灶', 'A Cold Stove'), at: 'stove', where: t('桑家 · 灶间', 'The Sang house · the stove'),
    card: t('桑家灶膛冷透，灰是白的；蒸笼是干的，笼布叠得整整齐齐。今夜这灶，没有生过火。', 'The Sang stove is stone cold, its ash white; the steamer is dry, its cloth folded neatly. No fire was lit here tonight.'),
    addenda: [],
    routes: [{ by: 'examine', at: 'stove' }],
  },
  {
    n: 9, key: 'bu', name: t('花朝簿', 'The Register and the Stele'), at: 'register', where: t('殿侧 · 花朝簿', 'The side table · the register'),
    card: t(
      '花朝簿上，出谷的人没几个。二十年前一行：「桑远 出谷 未归」，行尾没有朱印。今年一行：「阮青」，空着等印。殿侧石碑刻着篆书，秦守拙在旁边用楷书注了一遍：「花朝子正，钤印过所，方得复归。」',
      'In the Flower-Festival register, few have ever gone out. Twenty years ago: "Sang Yuan — went out — not returned." No red seal ends that line. This year: "Ruan Qing," waiting for its seal. The stele beside the hall, in seal script with Qin Shouzhuo\'s small regular-script gloss: "Only a pass sealed at midnight on the Flowers\' Birthday lets the traveller find the way back."',
    ),
    addenda: [{ flag: addFlag('bu'), by: 'scholar', line: t('书生：「这一行没有朱印……照碑上说，他是回不来的。」', 'The Scholar: "This line has no seal… By the stele\'s words, he couldn\'t come back."') }],
    routes: [{ by: 'examine', at: 'register' }, { by: 'examine', at: 'stele' }],
  },
  {
    n: 10, key: 'can', name: t('蚕避一角', 'The Silkworms Keep Away'), at: 'silkTray', where: t('蚕房 · 蚕匾', 'The silk room · the trays'),
    card: t(
      '蚕房里有一架蚕匾，蚕都挤到另一头，空出一角。那角桑叶底下压着玉印，叶上沾着酒气。蚕最怕酒。',
      'In the silk room, the worms on one tray have all crowded to the far end, leaving one corner bare. Under the mulberry leaves in that corner lies the jade seal, and the leaves smell of wine. Silkworms cannot bear wine.',
    ),
    addenda: [
      { flag: addFlag('can'), by: 'gardener', line: t('园丁：「蚕不吃这角的叶子。」', 'The Gardener: "The worms won\'t touch the leaves in that corner."') },
      { flag: CASE_FLAGS.seal, line: t('玉印在你身上收着。', 'You are keeping the jade seal.') },
    ],
    routes: [{ by: 'examine', at: 'silkTray' }, { by: 'companion', who: 'cat' }, { by: 'companion', who: 'change' }],
  },
  {
    n: 11, key: 'bitao', name: t('碧桃瓣', 'A White-Edged Petal'), at: null, where: t('阮郎的领口', 'Ruan Qing\'s collar'),
    card: t(
      '阮郎领口沾着一片白边的桃瓣。谷里的桃花都是一样的粉红，只有西北坡那棵老碧桃，花瓣镶着白边。',
      'A peach petal with a white edge clings to Ruan Qing\'s collar. Every peach in the valley is one shade of pink — only the old white-edged peach on the north-west knoll has petals like that.',
    ),
    addenda: [
      { flag: addFlag('bitao'), by: 'fisher', line: t('渔翁：「溪里漂下来的白边花瓣，都是从西北来的。」', 'The Old Fisherman: "The white-edged petals on the stream all come down from the north-west."') },
      { flag: addFlag('bitao:tree'), by: 'gardener', line: t('园丁一眼认出：是西北坡那株老碧桃。', 'The Gardener knew it at a glance: the old white-edged peach on the north-west knoll.') },
    ],
    routes: [{ by: 'ask', who: 'ruan' }],
  },
  {
    n: 12, key: 'beiyin', name: t('杯印', 'A Cup Ring'), at: 'altarLeft', where: t('供桌 · 左角', 'The altar · its left corner'),
    card: t('供桌左角一圈黏黏的杯印。凑近一闻，是蜜渍桃花茶的甜香，不是酒。', 'A sticky ring on the altar\'s left corner. Up close it smells sweet — honeyed peach-blossom tea, not wine.'),
    addenda: [{ flag: addFlag('beiyin'), by: 'cat', line: t('大橘：「甜的，不是酒。」', 'Big Ginger: "Sweet. Not wine."') }],
    routes: [{ by: 'examine', at: 'altarLeft' }, { by: 'companion', who: 'cat' }],
  },
];
export const CLUE: Record<ClueKey, Clue> = Object.fromEntries(CLUES.map((c) => [c.key, c])) as Record<ClueKey, Clue>;

// ───────────────────────────── C5: the prints under the petals

export type PrintKey = 'boots' | 'crowd' | 'clogs' | 'cane' | 'pair' | 'procession';
export interface PrintSet {
  key: PrintKey;
  name: Line;
  /** Petals over them, in tenths (one tenth falls each hour, counting back from 子正). */
  cover: number;
  coverName: Line;
  note: Line;
  /** Their route across the courtyard (valley-local x, z; the hall is north, −z). */
  path: [number, number][];
  /** How many feet walked it side by side (the crowd many), and their kind (for drawing). */
  feet: number;
  kind: 'boot' | 'clog' | 'patched' | 'cane' | 'sandal' | 'mixed';
  /** Walked there and back along the same line. */
  back?: boolean;
}

export const PRINTS: readonly PrintSet[] = [
  {
    key: 'boots', name: t('一双布靴，沿东墙到殿阶，又原路回来', 'A pair of cloth boots, along the east wall to the hall steps and back'),
    cover: 5.5, coverName: t('五分半', '5½ tenths'), note: t('比祭礼还早', 'older than the rite'),
    path: [[0.5, -17.6], [3.3, -18.3], [3.4, -21.4], [1.0, -22.2]], feet: 1, kind: 'boot', back: true,
  },
  {
    key: 'crowd', name: t('许多人的脚印：祭礼的人群，秦守拙也在其中', 'Many feet: the crowd at the rite, the elder\'s among them'),
    cover: 5, coverName: t('五分', '5 tenths'), note: t('戌初，你亲眼所见', '戌初 (7 pm): your own memory'),
    path: [[0, -17.6], [0, -22.2]], feet: 7, kind: 'mixed', back: true,
  },
  {
    key: 'clogs', name: t('一双木屐，一齿方、一齿圆，像是补过；从西北侧门进来，沿西墙到殿门，又原路回去', 'A pair of clogs, one tooth square, one rounded as if patched; in by the north-west side gate, along the west wall to the hall door, and back the same way'),
    cover: 4, coverName: t('四分', '4 tenths'), note: t('西边没被子正的人群踩过——他们走的是正中', 'the west side is untouched by the midnight procession, which kept to the middle'),
    path: [[-4.0, -21.2], [-3.5, -21.0], [-3.5, -21.9], [-0.6, -22.2]], feet: 1, kind: 'patched', back: true,
  },
  {
    key: 'cane', name: t('柳婆的拐杖点，和你的靴印', 'Liu Po\'s cane points and your boots'),
    cover: 3, coverName: t('三分', '3 tenths'), note: t('亥初，你亲眼所见；到殿门为止', '亥初 (9 pm): your own memory; they stop at the door'),
    path: [[-0.9, -17.6], [-0.7, -22.1]], feet: 2, kind: 'cane', back: true,
  },
  {
    key: 'pair', name: t('一双平齿木屐和一双草鞋，并排斜穿院角，出了西北侧门', 'Plain clogs and straw sandals side by side, across the corner to the north-west side gate'),
    cover: 2.5, coverName: t('二分半', '2½ tenths'), note: t('', ''),
    path: [[-1.5, -17.6], [-3.9, -21.0]], feet: 2, kind: 'sandal',
  },
  {
    key: 'procession', name: t('子正的人群，从前门直上正中', 'The midnight procession, straight up the middle from the front gate'),
    cover: 0, coverName: t('无', 'none'), note: t('子正', '子正 (midnight)'),
    path: [[0.6, -17.6], [0.5, -22.2]], feet: 6, kind: 'mixed',
  },
];

/** The hour a print set was made (24 = 子正), from its cover: one tenth an hour, counting back from midnight. */
export const printHour = (cover: number): number => 24 - cover;

/** The twelve double-hour names used in the valley's reckoning (the hour, as 24h, rounded to half hours). */
export function hourName(h: number): Line {
  const H = ((h % 24) + 24) % 24;
  const names: [number, string, string][] = [
    [17, '酉初', '酉初 (5 pm)'], [18, '酉正', '酉正 (6 pm)'], [18.5, '酉末', '酉末 (6:30 pm)'], [19, '戌初', '戌初 (7 pm)'], [20, '戌正', '戌正 (8 pm)'],
    [20.5, '戌末', '戌末 (8:30 pm)'], [21, '亥初', '亥初 (9 pm)'], [21.5, '亥初二刻', 'half past 亥初 (9:30 pm)'], [22, '亥正', '亥正 (10 pm)'],
    [23, '子初', '子初 (11 pm)'], [0, '子正', '子正 (midnight)'],
  ];
  const hit = names.find(([x]) => Math.abs(x - H) < 0.01);
  return hit ? t(hit[1], hit[2]) : t(`${H}时`, `${H}:00`);
}

// ───────────────────────────── the witnesses (§4.4)

export interface Break {
  flag: string;
  /** The evidence that breaks it (clue or testimony cards). */
  by: EvidenceKey[];
  /** A testimony card counts only once it carries this (T3, once 阮郎's lie is broken). */
  needs?: Partial<Record<EvidenceKey, string>>;
  /** Companions who break it without evidence (a shortcut, never the only way). */
  companions?: CharacterId[];
  /** What they say when it breaks. */
  says: Line[];
}

export interface Witness {
  n: number;
  key: WitnessKey;
  /** Where they are asked. */
  where: Line;
  /** Their first statement (the last line carries the talk's choices). */
  opening: Line[];
  /** The opening statement is a lie. */
  lie: boolean;
  breaks: Break[];
  /** Said once every lie of theirs is broken (and on later talks). */
  after: Line[];
}

export const WITNESSES: readonly Witness[] = [
  {
    n: 1, key: 'liupo', where: t('祠堂门外', 'the shrine gate'), lie: true,
    opening: [t('亥初我进殿看过了，香好好的，坛子也好好的。', 'At 亥初 (9 pm) I went into the hall and looked. The incense was fine, and so was the jar.')],
    breaks: [{
      flag: brokeFlag('liupo'), by: ['menxiang'],
      says: [t('（柳婆的拐杖在砖上一顿。）', '(Liu Po plants her cane hard on the bricks.)'), t('没进去。你不就站在我边上？', "I didn't go in. You were standing right next to me, weren't you?"), t('这两年一上灯，那几根香针我就看不清了。', "These last two years, once the lamps are lit, I can't make out those pins."), t('这话传出去，香就轮不到我看了。', "If that gets about, the incense won't be mine to keep.")],
    }],
    after: [t('压香那天，三娘还问我亥正是哪一针。我当她是好学，教了她。', 'The day we pressed the incense, Sanniang asked me which pin was 亥正 (10 pm). I took it she wanted to learn, so I showed her.')],
  },
  {
    n: 2, key: 'duer', where: t('酒坊', 'the brewery'), lie: true,
    opening: [
      t('祭前我没碰过供桌！', 'I never touched the altar before the rite!'),
      t('戌正我同阿黍回酒坊搬新醅——阿黍！你说是不是？', 'At 戌正 (8 pm) A Shu and I went back to the brewery for more new brew. A Shu! Tell them!'), t('倒是你，亥初在殿门口转悠什么？我杜二可都看见了。', 'And you: what were you doing hanging about the hall door at 亥初 (9 pm)? I saw you.'),
    ],
    breaks: [{
      flag: brokeFlag('duer'), by: ['beiyin'], companions: ['poet', 'guan'],
      says: [t('供桌左角那杯茶，是我搁的。给我婆娘的。', 'That cup on the left corner of the altar — I put it there. For my wife.'), t('蜜渍桃花茶。她就好这一口，一碗搁三勺蜜，甜得发腻。', 'Honeyed peach-blossom tea. Her favourite. Three spoons of honey a bowl, sweet enough to choke you.'), t('花朝不许私祭，我知道，我知道。……喝不喝？新醅。', "No private offerings on the Flowers' Birthday. I know, I know. …Drink? It's the new brew.")],
    }],
    after: [t('对了，戌正我们出花场，到岔路口，我看见三娘往西去了。', 'Oh, and at 戌正 (8 pm), leaving the square, I saw Sanniang turn west at the fork.'), t('她走的时候说是回去蒸糕。桃叶那丫头还在长桌边上分糕呢。', "She'd said she was going home to steam cakes. Taoye was still at the long tables handing them out.")],
  },
  {
    n: 3, key: 'ruan', where: t('花场', 'the square'), lie: true,
    opening: [t('我？我一整夜都在花场，哪儿也没去。真的。不信你去问……问谁都行。', 'Me? I was at the square all night. Didn\'t go anywhere. Honest. Ask… ask anyone.')],
    breaks: [{
      flag: brokeFlag('ruan'), by: ['bitao'],
      says: [t('（阮郎去拍领口，那片花瓣粘着，没拍掉。）', '(Ruan slaps at his collar, but the petal clings.)'), t('……我、我在老碧桃底下。跟桃叶一起，就我们俩。', '…I-I was under the old white-edged peach. With Taoye. Just the two of us.'), t('亥初刚过去的，殿门口的客灯已经挂上了，就是你挂的那盏。', 'Just after 亥初 (9 pm). The guest lantern was already up at the hall door — the one you hung.'), t('她要跟我一块儿走。你别跟三娘说，真的，别说。', "She wants to come with me. Don't tell Sanniang. Really. Don't."), t('哦，树洞里有东西打呼噜，我们当是獾，没敢过去。', 'Oh, and something was snoring in the hollow. We took it for a badger and kept away.')],
    }],
    after: [t('你是从外头进来的。回来的路，好认吗？要不要做记号？', "You came in from outside. Is the way back in easy to find? Should I mark it?")],
  },
  {
    n: 4, key: 'taoye', where: t('桑家门口', 'the Sang doorstep'), lie: true,
    opening: [t('我一晚上都在花场分糕。', 'I was at the square all evening. Handing out cakes.'), t('糕是黄昏就蒸好送过去的，一共四篮。最后一篮是我提的。', 'The cakes were steamed and taken over at dusk. Four baskets. I carried the last one.')],
    breaks: [{
      flag: brokeFlag('taoye'), by: ['bitao', 'T:ruan'], needs: { 'T:ruan': brokeFlag('ruan') },
      says: [t('（桃叶把梭子攥得紧紧的。）', '(Taoye grips her shuttle tight.)'), t('我要跟他走。草鞋都给他缝好了。', "I'm going with him. I've already sewn his sandals."), t('我娘不知道。你也不许说。', "Mother doesn't know. And you're not to tell her.")],
    }],
    after: [t('我娘每天晚上摆两只杯子，一只给我爹。我数过，一晚都没落下。', 'Every night Mother sets out two cups. One\'s for my father. I\'ve counted: she\'s never missed a night.')],
  },
  {
    n: 5, key: 'sang', where: t('蚕房', 'the silk room'), lie: true,
    opening: [t('戌正我回家蒸了一笼新糕，蒸好就回来了。客人还有事？', 'At 戌正 (8 pm) I went home, steamed a fresh batch of cakes, and came back. Anything else, guest?')],
    breaks: [
      {
        flag: brokeFlag('sang'), by: ['lengzao', 'T:taoye'],
        says: [t('是我记岔了，回去是换鞋。', 'I had it wrong. I went back to change shoes.'), t('屐齿松了，一走一晃，采桑舞还怎么领？', 'A clog tooth had come loose. Wobbling about like that, how was I to lead the mulberry dance?')],
      },
      {
        flag: brokeFlag('sang2'), by: ['buchi'],
        says: [t('鲁三的字，还是这么难看。', "Lu San's writing. Still as ugly as ever."), t('客人问完了？蚕该喂了。', 'Are you done, guest? The worms need feeding.')],
      },
    ],
    after: [t('（三娘把同一摞桑叶理了三遍。）', '(Sanniang sorts the same pile of mulberry leaves three times over.)')],
  },
  {
    n: 6, key: 'xiaoman', where: t('老碧桃的树洞', 'the old peach\'s hollow'), lie: false,
    opening: [t('我没偷！我没偷印！我就是想看看它长什么样……', 'I didn\'t steal it! I didn\'t steal the seal! I only wanted to see what it looked like…')],
    breaks: [],
    after: [t('那双木屐，一只齿响，一只齿闷。嗒、咚。我学得像不像？', 'Those clogs: one tooth clicked, one thudded. Click, thud. Did that sound like it?')],
  },
];
export const WITNESS: Record<WitnessKey, Witness> = Object.fromEntries(WITNESSES.map((w) => [w.key, w])) as Record<WitnessKey, Witness>;

/** T6: finding 小满 in the hollow. */
export const T6 = {
  choices: [t('我知道不是你。告诉我你看见了什么。', "I know it wasn't you. Tell me what you saw."), t('你阿爷急坏了。', 'Your grandfather is frantic.')],
  frantic: t('……阿爷会打我手心吗？', '…Is Grandpa going to smack my hand?'),
  testimony: [t('我躲在帘子后头，想等人走光了，看看那方印。', 'I was hiding behind the curtain. I wanted to wait till everyone was gone and look at the seal.'), t('然后有人进来了！我就看见一双木屐，一只齿响，一只齿闷，嗒、咚，嗒、咚。', 'Then somebody came in! All I saw was a pair of clogs. One tooth clicked, one thudded. Click, thud, click, thud.'), t('她一边弄一边哼歌，哼的是《采桑》。', 'She was humming the whole time. It was "Picking Mulberry."'), t('然后『哐』！坛子碎了，我就从后窗爬出去了。', 'Then CRASH! The jar broke, and I climbed out the back window.'), t('我回头看了一眼，香烟还是直直地往上冒，一点都没歪。', 'I looked back once. The incense smoke was still going straight up. Not even wobbly.'), t('哦对，她进来那会儿，场上头一通鼓刚敲完。', 'Oh yeah — when she came in, the first drums at the square had just finished.')],
  pass: t('你看，我的过所！树皮做的，印是我拿炭画的。等我长大，我也要出去。', 'Look, my pass! It\'s bark. I drew the seal on with charcoal. When I\'m big, I\'m going out too.'),
  home: t('（小满揉着眼睛，往花场他娘那儿去了。）', '(Rubbing his eyes, Xiaoman heads off to find his mother at the square.)'),
};

/** The line for evidence that has nothing to do with them (no penalty). */
export const NOT_MINE: Record<WitnessKey, Line> = {
  liupo: t('拿近点……这灯太暗。跟我不相干。还要我说几遍？', "Bring it closer… this lamp's too dim. Nothing to do with me. How many times do I have to tell you?"),
  duer: t('这是什么？跟我杜二有什么相干！', "What's this? What's it got to do with me?"),
  ruan: t('这……这个我真不知道。', "That… I really don't know about that."),
  taoye: t('不知道。', "Don't know."),
  sang: t('客人拿错了吧。', "I think you've picked up the wrong thing, guest."),
  xiaoman: t('这个……我没见过。能给我摸摸吗？', "I've never seen that… Can I touch it?"),
};

/** The testimony card: available once heard, and (for some breaks) once it carries a broken lie. */
export function evidenceAvailable(ev: EvidenceKey, f: Flags): boolean {
  if (ev.startsWith('T:')) return !!f[heardFlag(ev.slice(2) as WitnessKey)];
  return !!f[clueFlag(ev as ClueKey)];
}

/** The next lie of theirs to break (its index), or `breaks.length` when every one is broken. */
export function stageOf(w: WitnessKey, f: Flags): number {
  const bs = WITNESS[w].breaks;
  let i = 0;
  while (i < bs.length && f[bs[i].flag]) i++;
  return i;
}

/** Showing `ev` to `w` now: the break it makes, or null (「这与我何干？」). */
export function confront(w: WitnessKey, ev: EvidenceKey, f: Flags): Break | null {
  const W = WITNESS[w];
  const i = stageOf(w, f);
  const b = W.breaks[i];
  if (!b || !b.by.includes(ev) || !evidenceAvailable(ev, f)) return null;
  const need = b.needs?.[ev];
  if (need && !f[need]) return null;
  return b;
}

/** Every (witness, evidence) pair that breaks a lie, in order (the second of 三娘's needs her first broken). */
export const CONFRONT_PAIRS: readonly [WitnessKey, EvidenceKey, BreakKey][] = WITNESSES.flatMap((w) =>
  w.breaks.flatMap((b) => b.by.map((ev) => [w.key, ev, b.flag.slice('case:hz:t:'.length) as BreakKey] as [WitnessKey, EvidenceKey, BreakKey])));

/** What they say now, before any choice: the opening, their latest lie, or the truth afterwards. */
export function statementNow(w: WitnessKey, f: Flags): Line[] {
  const W = WITNESS[w];
  if (w === 'xiaoman') return f[CASE_FLAGS.found] ? W.after : W.opening;
  const i = stageOf(w, f);
  if (i >= W.breaks.length) return W.after;
  if (i === 0) return W.opening.slice(0, 1);
  // (三娘's second lie is what her first break said)
  return W.breaks[i - 1].says;
}

// ───────────────────────────── the contradictions (§4.5)

export interface Contradiction { id: string; name: Line; chain: Line; needs: EvidenceKey[] }
export const CONTRADICTIONS: readonly Contradiction[] = [
  {
    id: 'X1', name: t('香说亥正，鼻子说更早', 'The incense says 亥正; the nose says earlier'),
    chain: t('泥封的坛子闻不出香；谷里开了封的陈酿只那一坛；亥初隔着门已经闻到酒香——坛子亥初以前就开了，亥正香灭的时候，事早做完了。', 'A sealed jar has no smell; the only aged wine opened in the valley was that jar; it was smelled through the door at 亥初 (9 pm), so it was open before 亥初, and by the time the incense died at 亥正 (10 pm) the deed was long done.'),
    needs: ['feng', 'menxiang', 'xiang'],
  },
  {
    id: 'X2', name: t('泼了，却没溅', 'The splash that never splashed'),
    chain: t('泼在香上的酒，前后都会溅；这里烧过的灰又干又整，泥封是整块揭下的，坛子碎了香烟还直直往上冒——酒是先倒在火头前面的，坛子是后来摔给人看的。', 'Splashed wine spatters both ways; here the burnt ash is dry and whole, the cap came off whole, and the smoke still rose after the crash — the wine was laid ahead of the ember, and the jar smashed afterwards for show.'),
    needs: ['xiang', 'tan', 'T:xiaoman'],
  },
  {
    id: 'X3', name: t('落花记下了足迹的时辰', 'The petals date the prints'),
    chain: t('半个时辰落一分，从子正往回数：补齿屐痕四分，约在戌正；那两人的脚印二分半，约在亥初二刻；杜二的布靴五分半，在酉末，祭礼以前。', 'One tenth an hour, counting back from midnight: the patched clogs at 4 tenths are about 戌正 (8 pm); the pair at 2½ about half past 亥初 (9:30 pm); Du Er\'s boots at 5½ are 酉末 (6:30 pm), before the rite.'),
    needs: ['zuji', 'hualou'],
  },
  {
    id: 'X4', name: t('三娘的两句谎话', "Sanniang's two lies"),
    chain: t('她说回家蒸糕，可灶是冷的，糕黄昏就送去了；她又说回家换松了的屐，可那屐早上才补好，她这会儿还穿着。', 'She says she steamed cakes — the stove is cold and the cakes had gone at dusk; she says she changed a loose clog — it was mended that morning, and she is still wearing it.'),
    needs: ['lengzao', 'buchi'],
  },
];

// ───────────────────────────── red herrings (§4.7)

export interface Herring { who: VillagerKey | 'stranger'; name: Line; clearedBy: EvidenceKey[] }
export const HERRINGS: readonly Herring[] = [
  { who: 'stranger', name: t('外客（你）', 'The stranger (you)'), clearedBy: ['zuji', 'feng', 'menxiang'] },
  { who: 'ruan', name: t('阮郎', 'Ruan Qing'), clearedBy: ['zuji', 'bitao', 'T:ruan'] },
  { who: 'taoye', name: t('桃叶', 'Taoye'), clearedBy: ['zuji', 'T:duer'] },
  { who: 'duer', name: t('杜二', 'Du Er'), clearedBy: ['beiyin', 'zuji'] },
  { who: 'xiaoman', name: t('小满', 'Xiaoman'), clearedBy: ['tan', 'T:xiaoman'] },
];

// ───────────────────────────── the judgement (§4.8)

/** A line in the judgement: by a villager, or nobody. */
export interface JLine extends Line { by: VillagerKey | 'narr' }
const J = (by: JLine['by'], zh: string, en: string): JLine => ({ by, zh, en });

export interface Question {
  n: 1 | 2 | 3 | 4 | 5;
  key: 'when' | 'who' | 'how' | 'why' | 'proof';
  title: Line;
  ask: Line;
  options: Line[];
  answer: number;
  /** Any one of these groups (every flag in it) is enough to reason the answer. */
  needs: string[][];
  /** Why each other option is wrong: the evidence (clue or testimony cards) that rules it out, or what you saw yourself. */
  ruledOut: Record<number, (EvidenceKey | 'memory')[]>;
  /** What someone says to a wrong answer (by option; `any` for the rest). */
  wrong: Partial<Record<number, JLine>> & { any?: JLine };
  /** The bluebird's step it belongs to (its tier-1 and tier-2 lines follow a wrong answer). */
  step: StepKey | null;
  /** Its own two hint lines (for a question with no step). */
  hints?: [Line, Line];
  /** Said when it is answered right. */
  right: JLine[];
}

const C_ = (k: ClueKey) => clueFlag(k);

export const QUESTIONS: readonly Question[] = [
  {
    n: 1, key: 'when', title: t('何时', 'When'), ask: t('先说时辰。印是什么时辰被拿走的？', 'The hour first. When was the seal taken?'),
    options: [t('亥正，香灭的时候', 'At 亥正 (10 pm), when the incense died'), t('戌正前后', 'Around 戌正 (8 pm)'), t('亥初二刻', 'Around half past 亥初 (9:30 pm)'), t('戌初封匣以前', 'Before the box was sealed')],
    answer: 1,
    needs: [[C_('feng'), C_('menxiang')], [C_('zuji'), C_('hualou')]],
    ruledOut: { 0: ['feng', 'menxiang'], 2: ['zuji', 'hualou', 'T:ruan'], 3: ['memory'] },
    wrong: { any: J('qin', '慢着。花落了几分？你看的是哪双脚印？', 'Hold on. How deep are the petals — and whose prints were you reading?'), 3: J('qin', '封匣以前？戌初封匣那会儿，客人就站在我旁边，亲眼看着的。', 'Before the box was sealed? At 戌初 (7 pm), when I sealed it, you were standing right beside me. You watched me do it.') },
    step: 'when',
    right: [J('liupo', '亥初我在门外就闻着了，杜二那坛陈酿的香。', "At 亥初 (9 pm), outside the door, I could smell Du Er's aged wine."), J('qin', '泥封着的坛子是闻不着的。那会儿，坛子早开了。', 'A mud-sealed jar gives off no smell. By then it was long open.'), J('qin', '再看花：补过的那双屐印，盖了四分。戌正。', "And the petals: four tenths over the mended clog's prints. That puts it at 戌正 (8 pm).")],
  },
  {
    n: 2, key: 'who', title: t('何人', 'Who'), ask: t('那是谁拿的？', 'Then who took it?'),
    options: [t('桑三娘', 'Sang Sanniang'), t('桃叶', 'Taoye'), t('阮郎', 'Ruan Qing'), t('杜二', 'Du Er'), t('小满', 'Xiaoman'), t('外客', 'The stranger')],
    answer: 0,
    needs: [[C_('zuji'), C_('buchi'), brokeFlag('sang')]],
    ruledOut: { 1: ['zuji', 'T:duer', 'T:ruan'], 2: ['zuji', 'bitao', 'T:ruan'], 3: ['beiyin', 'zuji'], 4: ['tan', 'T:xiaoman'], 5: ['zuji', 'feng', 'menxiang'] },
    wrong: {
      5: J('duer', '亥初柳婆也在门口……是我嘴快。', 'Liu Po was at the door at 亥初 too… Me and my big mouth.'),
      1: J('ruan', '不是她！她那会儿跟我在一块儿，真的！', 'It wasn\'t her! She was with me then. Honest!'),
      4: J('guiniang', '我家小满？他连腌菜坛子的泥封都揭不开，回回喊我！', 'My Xiaoman? He can\'t even get the mud cap off a pickle jar. He yells for me every time!'),
      3: J('liupo', '杜二？那杯是甜的，是茶。你闻都没闻？', 'Du Er? That cup was sweet. It was tea. Didn\'t you even smell it?'),
      2: J('qin', '阮郎？今夜最盼着那方印的，就是他。', 'Ruan? Nobody wanted that seal tonight more than he did.'),
    },
    step: 'who',
    right: [J('narr', '（大家一齐转过头看三娘。她垂着眼，一声不吭。）', '(Everyone turns to look at Sanniang. She keeps her eyes down and says nothing.)')],
  },
  {
    n: 3, key: 'how', title: t('何法', 'How'), ask: t('她是怎么弄的？', 'How did she do it?'),
    options: [
      t('摔了坛子，酒泼上去，正好把香浇灭了', 'She smashed the jar, and the splash happened to put the incense out'),
      t('先把酒倒在亥正往后的香上，再摔坛子做样子', 'She poured wine on the incense past 亥正 (10 pm) first, then smashed the jar for show'),
      t('先把香吹灭，过后再点一炷新的接上', 'She blew the incense out, then lit a fresh one later to join it up'),
      t('叫小满替她进殿去拿，自己不露面', 'She sent Xiaoman into the hall for it and kept out of sight'),
    ],
    answer: 1,
    needs: [[C_('xiang'), C_('tan'), CASE_FLAGS.found]],
    ruledOut: { 0: ['xiang', 'T:xiaoman'], 2: ['xiang'], 3: ['tan', 'T:xiaoman'] },
    wrong: {
      0: J('liupo', '泼的？泼的话两边的灰都得溅湿。我那灰干干净净的。', 'Splashed? Then the ash on both sides would be wet. My ash was clean and dry.'),
      2: J('liupo', '接新香？香篆是一整盘压出来的，哪儿接得上。当是插根香呢？', 'A fresh one? An incense seal is pressed in one piece. There\'s nothing to join it to. It isn\'t a stick you poke in.'),
      3: J('xiaoman', '我没有！她都没看见我！我在帘子后头一动都没动……', "I didn't! She didn't even see me! I stayed behind the curtain and didn't move…"),
    },
    step: 'how',
    right: [J('liupo', '……是自己烧到湿的地方灭的。', '…It burned into the wet and went out by itself.'), J('narr', '（柳婆半天没出声。）', '(Liu Po says nothing for a long while.)'), J('liupo', '老婆子看了六十年香。压香那天，我还夸她压得匀。', "Sixty years I've kept the incense. The day we pressed it, I told her how nice and even she'd made it.")],
  },
  {
    n: 4, key: 'why', title: t('何故', 'Why'), ask: t('她这么做，图的是什么？', 'And what was she after, doing this?'),
    options: [
      t('拿印去卖，换些谷里没有的东西', 'To sell the seal for things the valley hasn\'t got'),
      t('她自己想出谷，去外头把丈夫找回来', 'To go out herself and bring her husband home'),
      t('不让阮郎今夜走，怕桃叶跟他走，或是等他一辈子', 'To keep Ruan here tonight, so Taoye won\'t follow him, or wait for him all her life'),
      t('栽到外人头上，这样就没人疑心她', 'To pin it on the stranger so no one would suspect her'),
    ],
    answer: 2,
    needs: [[C_('bu'), brokeFlag('ruan')], [C_('bu'), brokeFlag('taoye')]],
    ruledOut: { 0: ['memory'], 1: ['bu'], 3: ['T:duer'] },
    wrong: {
      0: J('duer', '卖？卖给谁？谷里一个钱都没有，我卖酒收的是鸡蛋。', 'Sell it? To who? There\'s not a coin in this valley. I get eggs for my wine.'),
      1: J('qin', '她自己要出谷，还把印偷了？印一丢，今夜谁都走不成。', 'She wants out, so she steals the seal? With it gone, nobody leaves tonight.'),
      3: J('duer', '栽到你头上？她从头到尾没提过你。满院子嚷嚷是你干的，是我。', 'Frame you? She never said a word about you. The one shouting all over the yard that you did it — that was me.'),
    },
    step: 'why',
    right: [J('taoye', '娘……', 'Mother…'), J('narr', '（三娘没有回头。）', "(Sanniang doesn't turn round.)")],
  },
  {
    n: 5, key: 'proof', title: t('何证', 'Proof'), ask: t('光说不行。拿哪一样东西，能证明那个时辰她就在殿里？', 'Saying so isn\'t enough. What one thing proves she was in the hall at that hour?'),
    options: [t('那支《采桑》', 'The tune, "Picking Mulberry"'), t('覆花四分的补齿屐痕', 'The patched-clog prints under 4 tenths of petals'), t('蚕匾下的玉印', 'The seal under the silkworm leaves'), t('冷灶', 'The cold stove')],
    answer: 1,
    needs: [[C_('zuji'), C_('buchi')]],
    ruledOut: { 0: ['T:taoye'], 2: ['can', 'T:taoye'], 3: ['lengzao'] },
    wrong: {
      0: J('ruan', '《采桑》？桃叶天天哼，织布也哼，我都会了。', '"Picking Mulberry"? Taoye hums it all day at the loom. Even I know it by now.'),
      2: J('taoye', '蚕房我也天天进。那我也是贼？', "I'm in the silk room every day too. Am I a thief as well?"),
      3: J('qin', '灶是冷的，只说明她没蒸糕。那她上哪儿去了？', 'A cold stove only says she didn\'t steam any cakes. So where did she go?'),
    },
    step: null,
    hints: [
      t('找一样东西：看得出是谁，也看得出是几时。', 'Find one thing that shows who, and when.'),
      t('曲子、蚕房，桃叶也沾得上；冷灶说不出三娘去了哪儿。补过齿的屐印只有她有，还盖着四分花。', 'The tune and the silk room fit Taoye too, and the cold stove can\'t say where Sanniang went. Only she has the mended clog, and its prints lie under four tenths of petals.'),
    ],
    right: [J('qin', '四分，戌正。一齿方，一齿圆——鲁三，早上补的那只屐，是谁的？', 'Four tenths: 戌正 (8 pm). One tooth square, one round. Lu San, the clog you mended this morning: whose was it?'), J('lusan', '三娘的。', "Sanniang's.")],
  },
];

/** Every flag in one of its groups is set. */
export function needsMet(q: Question, f: Flags): boolean {
  return q.needs.some((g) => g.every((k) => !!f[k]));
}

export const JUDGE = {
  gather: t('请众人到庭', 'Gather everyone'),
  curtain: t('大家都到了祠堂，灯笼一盏一盏点了起来。', 'Everyone gathers at the shrine, and the lanterns are lit one by one.'),
  open: J('qin', '人都齐了。客人，你说吧，一样一样来，我们都听着。', 'Everyone\'s here. Go on, guest. One thing at a time. We\'re listening.'),
  /** Esc on a question: nobody is hurried. */
  pause: J('narr', '（大家都等着，没人催你。）', '(Everyone waits. Nobody hurries you.)'),
  pauseChoices: [t('接着说', 'Go on'), t('让我再想想', 'Let me think a while longer')],
  later: J('qin', '不急。花没人扫，就在那儿。', 'No hurry. Nobody\'s sweeping those petals.'),
  /** 三娘 steps forward (Q2 answered wrong three times). */
  confess: J('sang', '不必问了，是我。', 'No need to ask any more. It was me.'),
  truth: J('qin', '好。大家都看着，那一夜是怎么过去的。', 'Right. Everyone, watch how that night went.'),
  gradeLine: (g: Grade, coins: number) => t(`${GRADE_NAME[g].zh} · 得钱 ${coins} 文`, `${GRADE_NAME[g].en} · +${coins} coins`),
};

/** The ink-ghost replay of §4.1, in three shots. */
export const GHOSTS: readonly Line[] = [
  t('戌正，头一通鼓响了。三娘从西北侧门进了院子，贴着西墙进殿，揭开泥封，把酒倒进亥正往后的香路。', 'The first drums at 戌正 (8 pm). Sanniang comes in by the north-west side gate, along the west wall into the hall, lifts the mud cap and pours the wine into the incense groove from the 亥正 pin on.'),
  t('她拿走玉印，把坛子摔在供桌前。帘子后头的小满看见，那缕香烟还直直地往上冒。', 'She takes the seal and smashes the jar before the altar. Behind the curtain, Xiaoman sees the thread of smoke still rising straight up.'),
  t('她原路回去，屐齿一响一闷，两回走过石瞽的门廊。玉印藏进了蚕匾的桑叶底下。', 'She goes back the way she came, one tooth clicking, one thudding, twice past Shi Gu\'s porch; the seal goes under the mulberry leaves in a silkworm tray.'),
];

/** Where the camera looks for each shot of the replay (valley-local). */
export const GHOST_SHOTS: readonly { to: [number, number, number]; look: [number, number, number] }[] = [
  // (from inside the courtyard's south-east corner: the side gate, the west wall and the patched prints in one frame)
  { to: [1.2, 2.3, -18.9], look: [-3.8, 0.4, -21.3] },
  { to: [1.3, 2.0, -22.9], look: [0, 0.7, -25.1] },
  { to: [-10.8, 1.6, -17.4], look: [-12.3, 0.9, -14.1] },
];

// ───────────────────────────── answering (pure)

export interface Tally { miss: number; q2miss: number }

export interface Answered {
  right: boolean;
  /** Who says what to it (the right answer's lines, or the wrong answer's retort). */
  lines: JLine[];
  /** The bluebird's line after a wrong answer: tier 1 while three or fewer are wrong in all, tier 2 after. */
  hint: Line | null;
  /** 三娘 steps forward herself (Q2 wrong three times): the question is settled. */
  confessed: boolean;
  tally: Tally;
}

/** Answer question `q` with option `k` (never −1: Esc is not an answer). */
export function answer(q: Question, k: number, before: Tally): Answered {
  if (k === q.answer) return { right: true, lines: q.right, hint: null, confessed: false, tally: before };
  const tally = { miss: before.miss + 1, q2miss: before.q2miss + (q.n === 2 ? 1 : 0) };
  const retort = q.wrong[k] ?? q.wrong.any ?? null;
  const [h1, h2] = q.step ? [HINT_STEP[q.step].tiers[0], HINT_STEP[q.step].tiers[1]] : q.hints!;
  const confessed = q.n === 2 && tally.q2miss >= 3;
  let hint: Line | null = confessed ? null : tally.miss <= 3 ? h1 : h2;
  // (the elder's own word may already be the bluebird's: it is not said twice)
  if (hint && retort && hint.zh === retort.zh) hint = null;
  return { right: false, lines: retort ? [retort] : [], hint, confessed, tally };
}

// ───────────────────────────── the judgement's prompt (§4.8)

/** What the elder needs before 「请众人到庭」: C1 C3 C4 C5 C6 C7, T6 heard, T5 broken once. */
export const READY_NEEDS: readonly string[] = [
  clueFlag('xiang'), clueFlag('feng'), clueFlag('menxiang'), clueFlag('zuji'), clueFlag('hualou'), clueFlag('buchi'), CASE_FLAGS.found, brokeFlag('sang'),
];
export function ready(f: Flags): { ok: boolean; missing: number } {
  const missing = READY_NEEDS.filter((k) => !f[k]).length;
  return { ok: missing === 0, missing };
}

// ───────────────────────────── grades (§4.10)

export const GRADE_NAME: Record<Grade, Line> = {
  shen: t('神断', 'Divine Judgement'),
  ming: t('明断', 'Clear Judgement'),
  ping: t('平断', 'Fair Judgement'),
  zibai: t('自白', 'Confession'),
};
export const GRADE_COINS: Record<Grade, number> = { shen: 300, ming: 200, ping: 120, zibai: 60 };
export const WRITER_COINS = 40;

/** score = misses + hints: 0 神断, 1–3 明断, ≥ 4 平断; a confession (Q2 wrong three times) is 自白. */
export function grade(miss: number, hint: number, confessed = false): Grade {
  if (confessed) return 'zibai';
  const s = Math.max(0, miss) + Math.max(0, hint);
  return s === 0 ? 'shen' : s <= 3 ? 'ming' : 'ping';
}
export function gradeOf(f: Flags): Grade | null {
  for (const g of ['shen', 'ming', 'ping', 'zibai'] as const) if (f[gradeFlag(g)]) return g;
  return null;
}

// ───────────────────────────── the hint ladder 「问青鸟」 (§4.9)

export interface HintStep { key: StepKey; name: Line; done(f: Flags): boolean; tiers: [Line, Line, Line] }

const has = (f: Flags, ...k: string[]) => k.every((x) => !!f[x]);

export const HINT_STEPS: readonly HintStep[] = [
  {
    key: 'find', name: t('寻小满', 'Find Xiaoman'), done: (f) => has(f, CASE_FLAGS.found),
    tiers: [
      t('孩子藏东西，总在最老的地方。', 'Children hide things in the oldest places.'),
      t('谷里最老的，是西北坡那株碧桃。', 'The oldest thing here is the white-edged peach on the north-west knoll.'),
      t('青鸟落在西北坡的老碧桃上，等你。', 'A bluebird perches on the old white-edged peach on the north-west knoll, waiting for you.'),
    ],
  },
  {
    key: 'when', name: t('何时', 'When'), done: (f) => has(f, C_('feng'), C_('menxiang'), C_('zuji'), C_('hualou')),
    tiers: [
      t('香灭在亥正，手脚就一定是亥正动的吗？', 'The incense died at 亥正 (10 pm). Does that mean it was done then?'),
      t('把门外的酒香，同杜二的泥封放在一起想。', "Think of the wine at the door together with Du Er's mud seals."),
      t('泥封不香；亥初已闻酒香，坛早开了。去看庭中的花有多厚。', "Sealed jars don't smell; you smelled wine at 亥初 (9 pm), so the jar was already open. Go and see how deep the petals lie."),
    ],
  },
  {
    key: 'how', name: t('何法', 'How'), done: (f) => has(f, C_('xiang'), C_('tan'), CASE_FLAGS.found),
    tiers: [
      t('泼出去的酒，会往哪儿溅？', 'Where does splashed wine land?'),
      t('去试试柳婆那盘备用的香。', "Try Liu Po's spare incense tray."),
      t('灰是干的，坛盖是整块揭下的——酒是先倒好的。', 'The ash is dry and the cap came off whole — the wine was poured first.'),
    ],
  },
  {
    key: 'who', name: t('何人', 'Who'), done: (f) => has(f, C_('zuji'), C_('buchi'), brokeFlag('sang')),
    tiers: [
      t('那个时辰，谁不在花场？', 'At that hour, who was not at the square?'),
      t('看看三娘的灶，问问桃叶的糕。', "Look at Sanniang's stove; ask Taoye about the cakes."),
      t('一齿方，一齿圆——去问鲁三今日补过谁的屐。', 'One tooth square, one round — ask whose clog Lu San mended today.'),
    ],
  },
  {
    key: 'why', name: t('何故', 'Why'), done: (f) => has(f, C_('bu')) && (has(f, brokeFlag('ruan')) || has(f, brokeFlag('taoye'))),
    tiers: [
      t('谁最怕今夜子正？', "Who fears tonight's midnight most?"),
      t('花朝簿上，有一行没有朱印。', 'One line in the register has no red seal.'),
      t('三娘的丈夫出谷未归；阮郎今夜要走；桃叶想跟他走。', "Sanniang's husband never came back; Ruan Qing leaves tonight; Taoye wants to go with him."),
    ],
  },
];
export const HINT_STEP: Record<StepKey, HintStep> = Object.fromEntries(HINT_STEPS.map((s) => [s.key, s])) as Record<StepKey, HintStep>;

/** How many tiers of this step's notes have been read. */
export const tiersRead = (s: StepKey, f: Flags): number => [1, 2, 3].filter((n) => f[hintFlag(s, n)]).length;

export const HINT_DONE = t('证据已足。去请秦守拙到庭吧。', 'The evidence is in hand. Go and ask Qin Shouzhuo to gather everyone.');

export interface Hint {
  step: StepKey | null;
  tier: number;
  line: Line;
  /** A note not read before: reading it counts (case:hz:hint + 1) and sets its flag. */
  fresh: boolean;
  flag: string | null;
}

/** The note a press of 「问青鸟」 brings now: the next tier of the first step not finished. */
export function nextHint(f: Flags): Hint {
  for (const s of HINT_STEPS) {
    if (s.done(f)) continue;
    const read = tiersRead(s.key, f);
    if (read >= 3) return { step: s.key, tier: 3, line: s.tiers[2], fresh: false, flag: null };
    return { step: s.key, tier: read + 1, line: s.tiers[read], fresh: true, flag: hintFlag(s.key, read + 1) };
  }
  return { step: null, tier: 0, line: HINT_DONE, fresh: false, flag: null };
}

/** Every note read so far, in the ladder's order. */
export function hintsRead(f: Flags): { step: StepKey; tier: number; line: Line }[] {
  const out: { step: StepKey; tier: number; line: Line }[] = [];
  for (const s of HINT_STEPS) for (let n = 1; n <= 3; n++) if (f[hintFlag(s.key, n)]) out.push({ step: s.key, tier: n, line: s.tiers[n - 1] });
  return out;
}

/**
 * Where the idle bluebird perches (and what the painter's crane is after, if nearest): the first thing
 * not yet found for the first step not finished — a clue, or the hollow (小满).
 */
export function nextTarget(f: Flags): ClueKey | 'hollow' | null {
  const want: Record<StepKey, (ClueKey | 'hollow')[]> = {
    find: ['hollow'],
    when: ['feng', 'zuji', 'hualou'],
    how: ['xiang', 'tan', 'hollow'],
    who: ['zuji', 'buchi', 'lengzao'],
    why: ['bu'],
  };
  for (const s of HINT_STEPS) {
    if (s.done(f)) continue;
    for (const k of want[s.key]) {
      if (k === 'hollow') { if (!f[CASE_FLAGS.found]) return 'hollow'; continue; }
      if (!f[clueFlag(k)]) return k;
    }
  }
  // (the rest of the case sheet: the clues not needed, but there)
  for (const c of CLUES) if (c.at && !f[clueFlag(c.key)]) return c.key;
  return null;
}

// ───────────────────────────── the letter-writer (§4.10 bonus)

export const WRITER = {
  ask: t('那封信是您写的。', 'You wrote that letter.'),
  listen: t('（坐下听一曲）', '(Sit and listen)'),
  tune: t('（琴声清冷，庭里的花也像停了一停。石瞽的手按在弦上，侧着耳朵，像在等你开口。）', '(The zither rings cool and clear, and even the petals in the courtyard seem to pause. Shi Gu rests his hand on the strings and tilts his head, as if waiting for you to speak.)'),
  says: t('我是瞎子。瞎子说他听见了，谁信？只好写封信，请个看得见的来。', "I'm blind. A blind man says he heard something: who'd believe him? So I wrote a letter and asked for someone who can see."),
  musician: t('你怀里抱着琴吧？弦一路都在响。弹琴的来找我，是为那封信。……是我写的。', 'You\'ve a qin in your arms, haven\'t you? The strings have been humming all the way. A musician come to see me: it\'s the letter. …I wrote it.'),
  scholar: t('这笔迹行行相叠，像是摸着写的——和先生曲谱上的字，一模一样。', 'These lines slant and overlap as if written by touch — just like the writing on your music, sir.'),
  bird: t('（一只青鸟落在你肩头，不肯走了。）', '(A bluebird settles on your shoulder and will not leave.)'),
  coins: (n: number) => t(`得钱 ${n} 文`, `+${n} coins`),
  zibai: t('她往前站那一步，我听见了。你呀，就差半步。', "I heard her step forward. You were half a step short, you know."),
};

// ───────────────────────────── the companions' tools (§4.6)

export const TOOLS = {
  cat: { glyph: '嗅', name: t('嗅', 'Scent'), note: t('琥珀色是酒，青绿色是桑叶。', 'Amber is wine; green is mulberry.'), hollow: t('大橘朝西北坡嗅了嗅：那边有个孩子的味儿。', 'Big Ginger sniffs toward the north-west knoll: there is a child over there.') },
  rabbit: { glyph: '听', name: t('听', 'Listen'), note: t('玉兔竖起耳朵：脚步声化作一圈圈墨痕。', 'The Jade Rabbit pricks up her ears: every footstep turns to a ring of ink.'), sang: t('三娘那边：嗒·咚，嗒·咚——一齿清，一齿闷。', 'From Sanniang: click-thud, click-thud — one tooth clear, one dull.'), addendum: t('玉兔听见三娘的脚步：嗒·咚，嗒·咚。', "The Jade Rabbit heard Sanniang's steps: click-thud, click-thud.") },
  painter: { glyph: '笔', name: t('纸鹤', 'Crane'), to: (w: Line) => t(`纸鹤飞向${w.zh}。`, `The crane flies toward ${w.en.charAt(0).toLowerCase() + w.en.slice(1)}.`), none: t('纸鹤绕你飞了一圈：此间的证物，都已找到。', 'The crane circles you once: every piece of evidence here is found.'), hollow: t('西北坡的老碧桃', 'the old peach on the north-west knoll') },
  player: { glyph: '弈', name: t('复盘', 'Review'), far: t('复盘得在供桌前。', 'The review must be done before the altar.'), line: t('这一步，不在谱上。', "This move isn't in the record."), replay: t('「亥正坛碎，酒泼香灭」——真要是这样，前后的香灰都该溅湿。', '"The jar broke at 亥正 (10 pm) and the splash put the incense out" — if so, the ash on both sides would be spattered.') },
  taoist: { glyph: '风', name: t('风', 'Wind'), far: t('风符得在院子里用。', 'The wind talisman must be used in the courtyard.'), line: t('风起，落花离地——每一行足迹都亮了，越旧越亮。', 'The wind lifts every petal — each line of prints shines, the older the brighter.') },
  swordsman: { window: t('窗台上有一双小手印……是个孩子，朝西北去了。', 'A pair of small handprints on the sill… a child, heading north-west.'), plain: t('后窗虚掩着，窗台上落着几片花瓣。', 'The back window stands ajar; a few petals lie on the sill.'), label: t('殿后 · 后窗', 'Behind the hall · the back window') },
  guan: {
    duer: t('（关公抚髯，只看着杜二。）', '(Lord Guan strokes his beard and simply looks at Du Er.)'),
    duerAsk: t('关某问你：祭前，可曾碰过供桌？', 'Guan asks you: before the rite — did you touch the altar?'),
    sang: t('（关公只看着她。三娘没再往下说，手在抖。）', '(Lord Guan only looks at her. Sanniang says no more; her hands are shaking.)'),
    lusan: t('（鲁三挺直了腰，难得说了一整句话。）', '(Lu San straightens up and manages a whole sentence.)'),
  },
  poet: { duer: t('斗酒 · 来，先干一碗', 'Drink · a bowl first, then talk'), drank: t('（诗仙与杜二连干三大碗。杜二先醉了，眼圈也红了。）', '(The Poet Immortal and Du Er down three great bowls. Du Er is drunk first, and his eyes go red.)'), taste: t('淡！', 'Thin!') },
  fisher: { line: t('溪里漂下来的白边花瓣，都是从西北来的。', 'The white-edged petals on the stream all come down from the north-west.'), stream: t('渔翁看了看溪水：「白边的花瓣，都是从西北漂下来的。」', 'The Old Fisherman watches the stream: "The white-edged petals all come down from the north-west."') },
  change: { moon: t('月光下，巷子里几点酒渍泛着银光，一路往桑家去。', 'In the moonlight, a few drops of wine glint silver along the lane, leading to the Sang house.') },
  gardener: { tree: t('这是老碧桃的花瓣——谷里只有西北坡那一株是白边的。', "That's a petal from the old white-edged peach — it's the only one on the north-west knoll with white edges.") },
  scholar: { reads: t('（书生把碑文念了出来。）', '(The Scholar reads the stele aloud.)'), line: t('这一行没有朱印……照碑上说，他是回不来的。', "This line has no seal… By the stele's words, he couldn't come back.") },
};

// ───────────────────────────── in the world: talk and examine lines

export const WORLD = {
  examine: t('察', 'Examine'),
  again: t('再看', 'Look again'),
  brush: t('拂花', 'Brush the petals'),
  test: t('试香', 'Try it'),
  testLabel: t('柳婆的备用香盘', "Liu Po's spare tray"),
  testDo: t('（你点着一撮香粉，从上头泼了些酒。火头当即灭了——前后两边的香灰，都溅湿了。）', '(You light a pinch of powder and splash wine on it from above. The ember dies at once — and the ash on both sides is spattered.)'),
  testNote: t('泼上去的酒，前后都溅。', 'Splashed wine lands on both sides.'),
  show: t('出示证物…', 'Show evidence…'),
  bye: t('（告辞）', '(Take your leave)'),
  sleeve: t('察其衣', 'Look closer'),
  collar: t('（阮郎领口沾着一片白边的桃瓣。）', "(A white-edged peach petal clings to Ruan Qing's collar.)"),
  jars: t('问泥封', 'Ask about the seals'),
  sniff: t('（你凑近窖里的陈坛闻了闻：只有泥土腥。）', '(You put your nose to a sealed jar in the cellar: only the smell of earth.)'),
  duerSays: [t('泥封着的坛子，神仙来了也闻不着！', 'A mud-sealed jar? Not even a god could smell it!'), t('今年开了封的十年陈就一坛，供花神那坛。场上喝的新醅，没那个香。', "Only one ten-year jar got opened this year: the flower god's. The new brew at the square hasn't got that smell.")],
  basin: t('（葛姑的花漏石盆，刻着十道圈，盆底一层薄薄的落花。）', "(Ge Gu's petal-clock basin, ruled in ten rings, with a thin, even layer of petals in the bottom.)"),
  gegu: t('谷里的花，落得比更漏还匀。半个时辰，盖地一分。今夜没风，祠堂院子四面又有墙，差不了。', "The petals in here fall more evenly than any water-clock. Half a double-hour, one tenth of the ground. No wind tonight, and the shrine yard's walled all round. It won't be off."),
  gegu2: t('脚印盖了几分，就从子正往回数几个半时辰。数了十年，头一回派上用场。', 'However many tenths cover a print, count back that many hours from midnight. Ten years of counting, and it\'s finally good for something.'),
  sealAsk: t('取出玉印？', 'Take the jade seal?'),
  sealTake: t('收起玉印', 'Take the seal'),
  sealLeave: t('留在原处', 'Leave it where it is'),
  sangStill: t('（三娘手里的桑叶，停了一停。）', "(The mulberry leaves in Sanniang's hands go still for a moment.)"),
  taken: t('（你把玉印收进怀里。）', '(You tuck the jade seal inside your coat.)'),
  heard: t('（证词记进了案卷。）', '(The testimony goes into the casebook.)'),
  broken: t('证词 · 破', 'Testimony broken'),
  foundXiaoman: t('小满', 'Xiaoman'),
  snore: '呼',
  idle: t('一只青鸟落在那边，歪着头看你。', 'A bluebird lands over there and cocks its head at you.'),
  notReadyMore: (n: number) => t(`（证据还差 ${n} 件。）`, `(Evidence still missing: ${n}.)`),
  chip: t('案卷', 'Casebook'),
};

/** The case's title (the sheet, the quest book). */
export const CASE_TITLE = { name: t('花朝失印案', 'The Seal Lost on Flower-Festival Night'), series: t('落花为证', 'The Petals Bear Witness') };

/** Every flag the case itself may write (each ≤ 64 characters; none may be set by the owner's code). */
export const CASE_FLAG_LIST: readonly string[] = [...new Set([
  ...Object.values(CASE_FLAGS),
  ...CLUE_KEYS.map(clueFlag),
  ...WITNESS_KEYS.map(heardFlag),
  ...(['liupo', 'duer', 'ruan', 'taoye', 'sang', 'sang2'] as BreakKey[]).map(brokeFlag),
  ...CLUES.flatMap((c) => c.addenda.map((a) => a.flag)),
  addFlag('sang'),
  ...[1, 2, 3, 4, 5].map(qFlag),
  ...(['shen', 'ming', 'ping', 'zibai'] as Grade[]).map(gradeFlag),
  ...HINT_STEPS.flatMap((s) => [1, 2, 3].map((n) => hintFlag(s.key, n))),
])];

/** How far the case has come (the quest book shows it without naming anything). */
export function progress(f: Flags): { clues: number; words: number; broken: number } {
  return {
    clues: CLUE_KEYS.filter((k) => f[clueFlag(k)]).length,
    words: WITNESS_KEYS.filter((w) => f[heardFlag(w)]).length,
    broken: (['liupo', 'duer', 'ruan', 'taoye', 'sang', 'sang2'] as BreakKey[]).filter((b) => f[brokeFlag(b)]).length,
  };
}

// ───────────────────────────── the prints, stamp by stamp (the 案卷's drawing and the courtyard's own)

/** One footprint (or cane point): valley-local x, z; `a` the heading it walks (radians, as Player.heading). */
export interface Stamp { x: number; z: number; a: number; kind: 'boot' | 'clog' | 'patched' | 'cane' | 'sandal'; left: boolean }

/** Every print of a set, laid along its route (the same every time: seeded by its name). */
export function printStamps(p: PrintSet): Stamp[] {
  let seed = 0;
  for (const ch of p.key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const lanes: { off: number; kind: Stamp['kind']; stride: number }[] = [];
  const base: Stamp['kind'] = p.kind === 'mixed' ? 'boot' : p.kind === 'cane' ? 'boot' : p.kind === 'sandal' ? 'clog' : p.kind;
  if (p.feet === 1) lanes.push({ off: 0, kind: base, stride: 0.52 });
  else if (p.kind === 'cane') lanes.push({ off: 0, kind: 'boot', stride: 0.56 }, { off: 0.38, kind: 'cane', stride: 0.62 });
  else if (p.kind === 'sandal') lanes.push({ off: -0.2, kind: 'clog', stride: 0.5 }, { off: 0.2, kind: 'sandal', stride: 0.56 });
  else for (let i = 0; i < p.feet; i++) lanes.push({ off: (i - (p.feet - 1) / 2) * 0.34, kind: i % 3 === 2 ? 'sandal' : 'boot', stride: 0.5 + rnd() * 0.12 });
  const out: Stamp[] = [];
  const walk = (pts: [number, number][], shift: number) => {
    for (const lane of lanes) {
      let left = rnd() < 0.5;
      let carry = rnd() * lane.stride;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 1e-3) continue;
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
        const a = Math.atan2(ux, uz);
        for (let s = carry; s < len; s += lane.stride) {
          const side = lane.kind === 'cane' ? 0 : left ? -0.08 : 0.08;
          const off = lane.off + shift + side + (p.feet > 2 ? (rnd() - 0.5) * 0.16 : 0);
          // (right of travel is (−uz, ux) with +z south: keep it simple, the lanes are symmetric)
          out.push({ x: x0 + ux * s - uz * off, z: z0 + uz * s + ux * off, a: a + (rnd() - 0.5) * 0.18, kind: lane.kind, left });
          left = !left;
        }
        carry = (carry - len) % lane.stride;
        if (carry < 0) carry += lane.stride;
      }
    }
  };
  walk(p.path, 0);
  if (p.back) walk([...p.path].reverse(), p.feet > 2 ? 0.2 : 0.24);
  // (inside the courtyard's walls only)
  return out.filter((s) => s.x > -4.05 && s.x < 4.05 && s.z > -22.35 && s.z < -17.45);
}
