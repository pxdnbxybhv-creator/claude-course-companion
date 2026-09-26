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
      '香篆自戌针燃起，行至亥正针处而熄。熄处往前一段香粉湿透，泛着酒气；往后已燃的香灰，干而完整，一丝未溅。',
      'The incense trail started at the 戌 pin and died at the 亥正 pin (10 pm). The powder ahead of that point is soaked and smells of wine; the ash behind it, already burnt, is dry and whole — not a drop splashed on it.',
    ),
    addenda: [{ flag: addFlag('xiang'), by: 'test', line: t('试香：泼上去的酒，前后都溅。', 'Tried on the spare tray: splashed wine lands on both sides.') }],
    routes: [{ by: 'examine', at: 'incense' }, { by: 'companion', who: 'player' }],
  },
  {
    n: 2, key: 'tan', name: t('碎坛 · 陈酿', 'The Broken Jar'), at: 'shards', where: t('供桌前 · 碎坛', 'Before the altar · the shards'),
    card: t(
      '供坛碎在供桌前。坛口的泥封是整块揭下的，放在一旁，并非摔裂。满地酒渍早已渗进砖缝，只剩边上一圈还湿。漆匣上的封泥被人整齐剥开，「守拙」二字完好。',
      'The offering jar lies smashed before the altar. Its mud cap was lifted off whole and set aside — it did not crack in the fall. The spilt wine has long since soaked into the brick joints; only the rim of the stain is still damp. The clay on the lacquer box was peeled away neatly, and the elder\'s seal, "Shouzhuo", is unbroken.',
    ),
    addenda: [],
    routes: [{ by: 'examine', at: 'shards' }],
  },
  {
    n: 3, key: 'feng', name: t('泥封无香', 'A Sealed Jar Has No Smell'), at: 'cellarJar', where: t('酒窖 · 陈坛', 'The cellar · the sealed jars'),
    card: t(
      '杜二窖里的陈坛，凑近了闻，只有泥土腥。杜二：「泥封的坛子，神仙也闻不着。今年开封的十年陈，只有供花神那一坛；场上喝的新醅，没那股香。」',
      'Nose to a sealed jar in Du Er\'s cellar: only the smell of earth. Du Er: "A mud-sealed jar — not even a god could smell it. The only ten-year jar opened this year was the flower god\'s. The new brew at the square has no such scent."',
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
      '亥初，我与柳婆同到殿门挂灯。她没有进殿，只在门外说：「杜二那坛陈酿真香，隔着门都闻得到。」',
      'At 亥初 (9 pm) I hung the lantern at the hall door with Liu Po. She did not go in; standing outside she said, "That aged jar of Du Er\'s — you can smell it through the door."',
    ),
    addenda: [{ flag: CASE_FLAGS.catnose, by: 'cat', line: t('大橘也说：「酒味，好浓。」', 'Big Ginger said so too: "Wine. Strong."') }],
    routes: [{ by: 'memory' }],
  },
  {
    n: 5, key: 'zuji', name: t('庭中足迹', 'Prints in the Courtyard'), at: 'courtyard', where: t('祠堂 · 庭中落花', 'The shrine · petals in the courtyard'),
    card: t('庭中落花一层层铺着，足迹被压在不同的深浅里：', 'Petals lie in layers across the courtyard, and the footprints sit under them at different depths:'),
    addenda: [{ flag: addFlag('zuji'), by: 'painter', line: t('画师的纸鹤落在那双补过的屐痕上：「屐齿一方一圆。」', 'The Painter\'s crane settled on the patched prints: "One tooth square, one round."') }],
    routes: [{ by: 'examine', at: 'courtyard' }, { by: 'companion', who: 'taoist' }],
  },
  {
    n: 6, key: 'hualou', name: t('花漏', 'The Petal Clock'), at: 'basin', where: t('药圃 · 石盆', 'The herb garden · the stone basin'),
    card: t(
      '葛姑的花漏石盆，刻着十道圈。葛姑：「这谷里的花，落得比更漏还匀：半个时辰，覆地一分。今夜无风，祠堂的院子又四面有墙，更是一分不差。」',
      'Ge Gu\'s petal-clock basin, ruled in ten rings. Ge Gu: "The petals here fall more evenly than any water-clock: half a double-hour covers the ground one tenth. There\'s no wind tonight, and the shrine yard is walled on all four sides — it won\'t be off by a hair."',
    ),
    addenda: [{ flag: addFlag('hualou'), line: t('葛姑：「子正往回数：一分一个钟头。」', 'Ge Gu: "Count back from midnight: one tenth per hour."') }],
    routes: [{ by: 'examine', at: 'basin' }, { by: 'ask', who: 'gegu' }, { by: 'companion', who: 'gardener' }],
  },
  {
    n: 7, key: 'buchi', name: t('桃木补齿', 'The Peachwood Patch'), at: 'bench', where: t('鲁三的木案', 'Lu San\'s workbench'),
    card: t(
      '鲁三案头压着今日的活计单：「桑三娘 屐一只 补后齿 桃木 辰时」。旁边的桃木边角料，削出的圆头与庭中那枚圆齿痕一般无二。',
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
      '花朝簿上，历年出谷者寥寥。二十年前一行：「桑远 出谷 未归」，行尾没有朱印。今年一行：「阮青」，空着等印。殿侧石碑（篆书，旁有秦守拙的楷书小注）：「花朝子正，钤印过所，方得复归。」',
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
      { flag: CASE_FLAGS.seal, line: t('玉印已由你收着。', 'You are keeping the jade seal.') },
    ],
    routes: [{ by: 'examine', at: 'silkTray' }, { by: 'companion', who: 'cat' }, { by: 'companion', who: 'change' }],
  },
  {
    n: 11, key: 'bitao', name: t('碧桃瓣', 'A White-Edged Petal'), at: null, where: t('阮郎的领口', 'Ruan Qing\'s collar'),
    card: t(
      '阮郎领口沾着一片白边的桃瓣。谷中桃花都是一色粉红，只有西北坡那株老碧桃，花瓣镶白边。',
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
    key: 'clogs', name: t('一双木屐，一齿方、一齿圆如补过；从西北侧门进来，沿西墙到殿门，又原路回去', 'A pair of clogs, one tooth square, one rounded as if patched; in by the north-west side gate, along the west wall to the hall door, and back the same way'),
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
    opening: [t('亥初我进殿看过，香好好的，坛也好好的。', 'At 亥初 (9 pm) I went into the hall and looked. The incense was fine, and so was the jar.')],
    breaks: [{
      flag: brokeFlag('liupo'), by: ['menxiang'],
      says: [t('……我没进去。这两年，灯底下我连香针都看不清。我怕人说我老了，看不得香了。', "…I didn't go in. These two years I can't even see the pins by lamplight. I was afraid they'd say I'm too old to keep the incense.")],
    }],
    after: [t('压香那天，三娘问过我，亥正是哪一针。', 'The day we pressed the incense, Sanniang asked me which pin was 亥正 (10 pm).')],
  },
  {
    n: 2, key: 'duer', where: t('酒坊', 'the brewery'), lie: true,
    opening: [
      t('祭前我没碰过供桌！', 'I never touched the altar before the rite!'),
      t('戌正我同阿黍回酒坊搬新醅，阿黍能作证。倒是这位客人，亥初就在殿门口！', 'At 戌正 (8 pm) A Shu and I went back to the brewery for more new brew — ask him. But this guest was at the hall door at 亥初 (9 pm)!'),
    ],
    breaks: [{
      flag: brokeFlag('duer'), by: ['beiyin'], companions: ['poet', 'guan'],
      says: [t('……那杯茶是给我婆娘的。她生前最爱蜜渍桃花茶。花朝不许私祭，我……', "…That tea was for my wife. She loved honeyed peach-blossom tea. Private offerings aren't allowed on the Flowers' Birthday, so I…")],
    }],
    after: [t('戌正出花场，岔路口我看见三娘往西去了，说回去蒸糕。桃叶那丫头还在长桌边分糕呢。', 'When we left the square at 戌正 (8 pm), I saw Sanniang turn west at the fork — she said she was going home to steam cakes. Taoye was still at the long tables handing them out.')],
  },
  {
    n: 3, key: 'ruan', where: t('花场', 'the square'), lie: true,
    opening: [t('我一整夜都在花场，哪儿也没去。', 'I was at the square all night. I went nowhere.')],
    breaks: [{
      flag: brokeFlag('ruan'), by: ['bitao'],
      says: [t('……我在老碧桃底下，同桃叶。她要跟我一道走。亥初刚过去的，那时殿门口已挂上客灯了。树洞里好像有人打呼噜，我们以为是獾。', '…I was under the old white-edged peach, with Taoye. She wants to go out with me. We went just after 亥初 (9 pm) — the guest lantern was already hanging at the hall door. Something was snoring in the hollow; we thought it was a badger.')],
    }],
    after: [t('其实我怕。怕出去了，就回不来。', "The truth is, I'm afraid. Afraid that once I'm out, I can't come back.")],
  },
  {
    n: 4, key: 'taoye', where: t('桑家门口', 'the Sang doorstep'), lie: true,
    opening: [t('我一整晚都在花场帮着分糕。', 'I was at the square all evening, handing out cakes.'), t('糕黄昏就蒸好送来了，最后一篮是我提的。', 'The cakes were all steamed and brought over at dusk — I carried the last basket myself.')],
    breaks: [{
      flag: brokeFlag('taoye'), by: ['bitao', 'T:ruan'], needs: { 'T:ruan': brokeFlag('ruan') },
      says: [t('……我想跟他走。娘不知道——娘不能知道。', "…I want to go with him. Mother doesn't know — she mustn't.")],
    }],
    after: [t('娘这些年，每晚都摆两只杯子。一只是给爹的。', 'Every evening for years, Mother has set out two cups. One is for Father.')],
  },
  {
    n: 5, key: 'sang', where: t('蚕房', 'the silk room'), lie: true,
    opening: [t('戌正我回家蒸了一笼新糕，蒸好就回来了。', 'At 戌正 (8 pm) I went home and steamed a fresh batch of cakes, then came back.')],
    breaks: [
      {
        flag: brokeFlag('sang'), by: ['lengzao', 'T:taoye'],
        says: [t('……我记错了。我回去是换鞋，屐齿松了。', '…I misremembered. I went home to change shoes — a clog tooth had come loose.')],
      },
      {
        flag: brokeFlag('sang2'), by: ['buchi'],
        says: [t('……', '…'), t('客人问完了？我还要照看蚕。', 'Are you finished, guest? I have the silkworms to see to.')],
      },
    ],
    after: [t('（三娘低头理着桑叶，不再说话。手在抖。）', '(Sanniang bends over the mulberry leaves and says nothing more. Her hands are shaking.)')],
  },
  {
    n: 6, key: 'xiaoman', where: t('老碧桃的树洞', 'the old peach\'s hollow'), lie: false,
    opening: [t('我没偷印！我只是想看看它长什么样……', 'I didn\'t steal the seal! I only wanted to see what it looked like…')],
    breaks: [],
    after: [t('那双屐，一只齿响，一只齿闷。我记得清清楚楚！', 'That pair of clogs — one tooth clicked, one thudded. I remember it clearly!')],
  },
];
export const WITNESS: Record<WitnessKey, Witness> = Object.fromEntries(WITNESSES.map((w) => [w.key, w])) as Record<WitnessKey, Witness>;

/** T6: finding 小满 in the hollow. */
export const T6 = {
  choices: [t('我知道不是你。告诉我你看见了什么。', "I know it wasn't you. Tell me what you saw."), t('你阿爷急坏了。', 'Your grandfather is frantic.')],
  frantic: t('……阿爷会不会骂我？', '…Will Grandpa be cross with me?'),
  testimony: t(
    '我躲在帘子后头。有人进来，我只看见一双木屐，一只齿响，一只齿闷。她一边弄一边哼《采桑》。后来『哐』一声，坛子碎了。我从后窗爬出去，回头看——香烟还是直直地往上冒。那会儿场上的鼓刚敲完头一通。',
    'I hid behind the curtain. Someone came in — I only saw a pair of clogs, one tooth clicking, one thudding. She hummed "Picking Mulberry" while she worked. Then — crash — the jar broke. I climbed out the back window and looked back: the incense smoke was still rising straight up. The drums at the square had just finished their first round.',
  ),
  pass: t('（他从怀里掏出一张树皮「过所」，上头用炭画了个印。）等我长大，也要出去。', '(He pulls a bark "pass" from his shirt, with a seal drawn on it in charcoal.) When I\'m grown, I\'m going out too.'),
  home: t('（小满揉着眼睛，往花场他娘那儿去了。）', '(Rubbing his eyes, Xiaoman heads off to find his mother at the square.)'),
};

/** The line for evidence that has nothing to do with them (no penalty). */
export const NOT_MINE = t('这与我何干？', 'What has that to do with me?');

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
    chain: t('泥封的坛子不香；谷里的陈酿只那一坛；亥初隔门已闻到酒香——坛子在亥初之前就开了，香灭的亥正不是作案之时。', 'A sealed jar has no smell; the only aged wine in the valley was that jar; it was smelled through the door at 亥初 (9 pm) — so it was open before 亥初, and 亥正 (10 pm) is not the moment of the crime.'),
    needs: ['feng', 'menxiang', 'xiang'],
  },
  {
    id: 'X2', name: t('泼了，却没溅', 'The splash that never splashed'),
    chain: t('泼在香上的酒前后都溅；这里烧过的灰干而完整，泥封整块揭下，坛碎之后香烟还直直上冒——酒是先倒在火头前面的，坛子是后来摔给人看的。', 'Splashed wine spatters both ways; here the burnt ash is dry and whole, the cap came off whole, and the smoke still rose after the crash — the wine was laid ahead of the ember, and the jar smashed afterwards for show.'),
    needs: ['xiang', 'tan', 'T:xiaoman'],
  },
  {
    id: 'X3', name: t('落花记下了足迹的时辰', 'The petals date the prints'),
    chain: t('一个钟头覆地一分，从子正往回数：补齿屐痕四分，约在戌正；那一双人二分半，约在亥初二刻；杜二的布靴五分半，在酉末，祭礼之前。', 'One tenth an hour, counting back from midnight: the patched clogs at 4 tenths are about 戌正 (8 pm); the pair at 2½ about half past 亥初 (9:30 pm); Du Er\'s boots at 5½ are 酉末 (6:30 pm), before the rite.'),
    needs: ['zuji', 'hualou'],
  },
  {
    id: 'X4', name: t('三娘的两句谎话', "Sanniang's two lies"),
    chain: t('她说回家蒸糕——灶是冷的，糕黄昏就送来了；她说回家换了松掉的屐——那屐早上才补好，她此刻还穿着。', 'She says she steamed cakes — the stove is cold and the cakes had gone at dusk; she says she changed a loose clog — it was mended that morning, and she is still wearing it.'),
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
    n: 1, key: 'when', title: t('何时', 'When'), ask: t('何时 —— 印是什么时辰被取走的？', 'When — at what hour was the seal taken?'),
    options: [t('亥正香灭之时', 'At 亥正 (10 pm), when the incense died'), t('戌正前后', 'Around 戌正 (8 pm)'), t('亥初二刻', 'Around half past 亥初 (9:30 pm)'), t('戌初封匣之前', 'Before the box was sealed')],
    answer: 1,
    needs: [[C_('feng'), C_('menxiang')], [C_('zuji'), C_('hualou')]],
    ruledOut: { 0: ['feng', 'menxiang'], 2: ['zuji', 'hualou', 'T:ruan'], 3: ['memory'] },
    wrong: { any: J('qin', '香会说谎，花不会。', 'Incense can lie. Petals cannot.'), 3: J('qin', '戌初封匣，客人亲眼看着的。', 'The box was sealed at 戌初 (7 pm) — you watched it with your own eyes.') },
    step: 'when',
    right: [J('qin', '泥封不香，门外却闻得到酒香——坛子早开了。花也这么说：那双屐痕，覆花四分，正是戌正。', 'A sealed jar has no smell, yet the wine was smelled through the door — the jar was open long before. The petals say so too: four tenths over those prints. 戌正 (8 pm).')],
  },
  {
    n: 2, key: 'who', title: t('何人', 'Who'), ask: t('何人 —— 是谁取走了印？', 'Who — who took the seal?'),
    options: [t('桑三娘', 'Sang Sanniang'), t('桃叶', 'Taoye'), t('阮郎', 'Ruan Qing'), t('杜二', 'Du Er'), t('小满', 'Xiaoman'), t('外客', 'The stranger')],
    answer: 0,
    needs: [[C_('zuji'), C_('buchi'), brokeFlag('sang')]],
    ruledOut: { 1: ['zuji', 'T:duer', 'T:ruan'], 2: ['zuji', 'bitao', 'T:ruan'], 3: ['beiyin', 'zuji'], 4: ['tan', 'T:xiaoman'], 5: ['zuji', 'feng', 'menxiang'] },
    wrong: {
      5: J('duer', '……是我看错了。', '…I was mistaken.'),
      1: J('ruan', '那时她同我在一处！', 'She was with me!'),
      4: J('guiniang', '一个孩子，揭得开泥封？', 'Could a child lift a sealed cap whole?'),
      3: J('liupo', '那杯是甜的。', 'That cup was sweet.'),
      2: J('qin', '偷自己的印？', 'Steal his own seal?'),
    },
    step: 'who',
    right: [J('narr', '（众人一齐望向三娘。她垂着眼，一言不发。）', '(Everyone turns to look at Sanniang. She keeps her eyes down and says nothing.)')],
  },
  {
    n: 3, key: 'how', title: t('何法', 'How'), ask: t('何法 —— 她是怎么做的？', 'How — how was it done?'),
    options: [
      t('摔坛泼酒，浇灭香火', 'She smashed the jar; the splash put the incense out'),
      t('先揭泥封，以酒湿透亥正一段香路；香行至此自灭；再摔坛作乱', 'She lifted the cap, soaked the groove from 亥正 (10 pm) on, let the ember die there by itself, then smashed the jar for show'),
      t('吹灭旧香，另点新香', 'She blew out the incense and lit a fresh stick'),
      t('使小满代取', 'She sent Xiaoman to fetch it'),
    ],
    answer: 1,
    needs: [[C_('xiang'), C_('tan'), CASE_FLAGS.found]],
    ruledOut: { 0: ['xiang', 'T:xiaoman'], 2: ['xiang'], 3: ['tan', 'T:xiaoman'] },
    wrong: {
      0: J('liupo', '泼上去的，前后都溅。灰却是干的。', 'Splashed wine lands on both sides. But the ash is dry.'),
      2: J('liupo', '香篆是一整盘压的，接不上新香。', 'An incense seal is pressed in one piece. You cannot join a fresh one on.'),
      3: J('xiaoman', '我没有！我就躲在帘子后头……', "I didn't! I was only hiding behind the curtain…"),
    },
    step: 'how',
    right: [J('liupo', '……香是自己走到湿处灭的。老婆子看了六十年香，竟没看出来。', '…The ember walked into the wet and died by itself. Sixty years I have kept the incense, and I never saw it.')],
  },
  {
    n: 4, key: 'why', title: t('何故', 'Why'), ask: t('何故 —— 她为什么这样做？', 'Why — why did she do it?'),
    options: [
      t('换钱', 'To sell it'),
      t('自己出谷寻夫', 'To go out herself and find her husband'),
      t('不让阮郎今夜出谷：丈夫一去未归，她怕女儿也跟着走，或苦等一生', 'To stop Ruan Qing leaving tonight: her husband never came back, and she feared her daughter would follow him — or wait her whole life'),
      t('嫁祸外客', 'To frame the stranger'),
    ],
    answer: 2,
    needs: [[C_('bu'), brokeFlag('ruan')], [C_('bu'), brokeFlag('taoye')]],
    ruledOut: { 0: ['memory'], 1: ['bu'], 3: ['T:duer'] },
    wrong: {
      0: J('duer', '谷里哪有钱？一文也没有。', 'Money? There isn\'t a single coin in the whole valley.'),
      1: J('qin', '印没了，谁也出不去——她自己也出不去。', 'With the seal gone, nobody can leave — not even she.'),
      3: J('duer', '冤枉客人的是我，不是她。', 'It was I who blamed the guest, not her.'),
    },
    step: 'why',
    right: [J('taoye', '娘……', 'Mother…'), J('narr', '（三娘的手在发抖。）', "(Sanniang's hands are shaking.)")],
  },
  {
    n: 5, key: 'proof', title: t('何证', 'Proof'), ask: t('何证 —— 哪一件证物，能把她放进殿里、放在那个时辰？', 'Proof — which single piece of evidence puts her in the hall at the true time?'),
    options: [t('《采桑》曲', 'The tune, "Picking Mulberry"'), t('覆花四分的补齿屐痕', 'The patched-clog prints under 4 tenths of petals'), t('蚕匾下的玉印', 'The seal under the silkworm leaves'), t('冷灶', 'The cold stove')],
    answer: 1,
    needs: [[C_('zuji'), C_('buchi')]],
    ruledOut: { 0: ['T:taoye'], 2: ['can', 'T:taoye'], 3: ['lengzao'] },
    wrong: {
      0: J('ruan', '桃叶也哼这支曲子。', 'Taoye hums that tune too.'),
      2: J('taoye', '那蚕房，我也天天进出。', "I'm in and out of that silk room every day too."),
      3: J('qin', '冷灶只说她说了谎，不说她在哪里。', 'A cold stove says she lied — not where she was.'),
    },
    step: null,
    hints: [
      t('只要一件：既认得出人，又认得出时辰的。', 'Just one: something that names the person and the hour at once.'),
      t('曲子桃叶也会哼，蚕房桃叶也进出，冷灶只证她说谎——只有那双屐痕，一齿方一齿圆，又压在四分落花底下。', 'Taoye hums the tune and walks in the silk room too, and the cold stove only proves a lie — only those prints are hers alone, one tooth square, one round, under four tenths of petals.'),
    ],
    right: [J('qin', '覆花四分，正是戌正；一齿方，一齿圆，谷里只此一双。', 'Four tenths of petals: 戌正 (8 pm) exactly. One tooth square, one round: there is only one such pair in the valley.')],
  },
];

/** Every flag in one of its groups is set. */
export function needsMet(q: Question, f: Flags): boolean {
  return q.needs.some((g) => g.every((k) => !!f[k]));
}

export const JUDGE = {
  gather: t('请众人到庭', 'Gather everyone'),
  curtain: t('众人齐集祠堂，灯笼一盏一盏点起来。', 'Everyone gathers at the shrine, and the lanterns are lit one by one.'),
  open: J('qin', '今夜之事，请客人当着众人，一一断来。', 'Guest — before everyone here, judge tonight\'s matter, point by point.'),
  /** Esc on a question: nobody is hurried. */
  pause: J('narr', '（众人静静地等你开口。）', '(Everyone waits quietly for you to speak.)'),
  pauseChoices: [t('接着断', 'Go on'), t('容我再想想', 'Let me think a while longer')],
  later: J('qin', '也罢。庭里的花，还等得起。', 'Very well. The petals in the courtyard can wait a while longer.'),
  /** 三娘 steps forward (Q2 answered wrong three times). */
  confess: J('sang', '不必问了，是我。', 'No need to ask any more. It was me.'),
  truth: J('qin', '真相大白。……看这一夜，是怎么过去的。', 'The truth is out. …See how the night went.'),
  gradeLine: (g: Grade, coins: number) => t(`${GRADE_NAME[g].zh} · 得钱 ${coins} 文`, `${GRADE_NAME[g].en} · +${coins} coins`),
};

/** The ink-ghost replay of §4.1, in three shots. */
export const GHOSTS: readonly Line[] = [
  t('戌正，头通鼓响。三娘从西北侧门进庭，沿西墙入殿，揭开泥封，把酒倒进亥正往后的香路。', 'The first drums at 戌正 (8 pm). Sanniang comes in by the north-west side gate, along the west wall into the hall, lifts the mud cap and pours the wine into the incense groove from the 亥正 pin on.'),
  t('她取出玉印，把坛子摔在供桌前。帘后的小满看见，那缕香烟，还直直地往上冒。', 'She takes the seal and smashes the jar before the altar. Behind the curtain, Xiaoman sees the thread of smoke still rising straight up.'),
  t('她沿原路回去，屐齿一响一闷，两次走过石瞽的门廊；玉印藏进了蚕匾的桑叶底下。', 'She goes back the way she came, one tooth clicking, one thudding, twice past Shi Gu\'s porch; the seal goes under the mulberry leaves in a silkworm tray.'),
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
      t('香会说谎，花不会。', 'Incense can lie. Petals cannot.'),
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
  says: t('我是瞎子。瞎子听见的，当不得证。只好请一个看得见的人来。', "I'm blind. What a blind man hears counts for nothing as proof. So I had to ask someone who could see."),
  musician: t('琴声里藏不住事。……那封信，是我写的。', 'Nothing hides in the sound of a zither. …That letter — I wrote it.'),
  scholar: t('这笔迹行行相叠，像是摸着写的——和先生曲谱上的字，一模一样。', 'These lines slant and overlap as if written by touch — just like the writing on your music, sir.'),
  bird: t('（一只青鸟落在你肩头，不肯走了。）', '(A bluebird settles on your shoulder and will not leave.)'),
  coins: (n: number) => t(`得钱 ${n} 文`, `+${n} coins`),
  zibai: t('真相是自己走出来的，不是你找出来的。', "The truth walked out by itself; you didn't find it."),
};

// ───────────────────────────── the companions' tools (§4.6)

export const TOOLS = {
  cat: { glyph: '嗅', name: t('嗅', 'Scent'), note: t('琥珀色是酒，青绿色是桑叶。', 'Amber is wine; green is mulberry.'), hollow: t('大橘朝西北坡嗅了嗅：那边有个孩子的味儿。', 'Big Ginger sniffs toward the north-west knoll: there is a child over there.') },
  rabbit: { glyph: '听', name: t('听', 'Listen'), note: t('玉兔竖起耳朵：脚步声化作一圈圈墨痕。', 'The Jade Rabbit pricks up her ears: every footstep turns to a ring of ink.'), sang: t('三娘那边：嗒·咚，嗒·咚——一齿清，一齿闷。', 'From Sanniang: click-thud, click-thud — one tooth clear, one dull.'), addendum: t('玉兔听见三娘的脚步：嗒·咚，嗒·咚。', "The Jade Rabbit heard Sanniang's steps: click-thud, click-thud.") },
  painter: { glyph: '笔', name: t('纸鹤', 'Crane'), to: (w: Line) => t(`纸鹤飞向${w.zh}。`, `The crane flies toward ${w.en.charAt(0).toLowerCase() + w.en.slice(1)}.`), none: t('纸鹤绕你飞了一圈：此间的证物，都已找到。', 'The crane circles you once: every piece of evidence here is found.'), hollow: t('西北坡的老碧桃', 'the old peach on the north-west knoll') },
  player: { glyph: '弈', name: t('复盘', 'Review'), far: t('复盘，须在供桌前。', 'The review must be done before the altar.'), line: t('这一步，不在谱上。', "This move isn't in the record."), replay: t('「亥正坛碎，酒泼香灭」——若是如此，前后的香灰都该溅湿。', '"The jar broke at 亥正 (10 pm) and the splash put the incense out" — if so, the ash on both sides would be spattered.') },
  taoist: { glyph: '风', name: t('风', 'Wind'), far: t('风符，须在庭中。', 'The wind talisman must be used in the courtyard.'), line: t('风起，落花离地——每一行足迹都亮了，越旧越亮。', 'The wind lifts every petal — each line of prints shines, the older the brighter.') },
  swordsman: { window: t('窗台上有一双小手印……是个孩子，朝西北去了。', 'A pair of small handprints on the sill… a child, heading north-west.'), plain: t('后窗虚掩着，窗台上落着几片花瓣。', 'The back window stands ajar; a few petals lie on the sill.'), label: t('殿后 · 后窗', 'Behind the hall · the back window') },
  guan: {
    duer: t('（关公抚髯，只看着杜二。）', '(Lord Guan strokes his beard and simply looks at Du Er.)'),
    duerAsk: t('关某问你：祭前，可曾碰过供桌？', 'Guan asks you: before the rite — did you touch the altar?'),
    sang: t('（三娘在关公面前只是发抖，一言不发。）', '(Before Lord Guan, Sanniang only trembles, and says nothing.)'),
    lusan: t('（鲁三挺直了腰，竟说了一整句话。）', '(Lu San straightens up and manages a whole sentence.)'),
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
  duerSays: t('泥封的坛子，神仙也闻不着。今年开封的十年陈，只有供花神那一坛；场上喝的新醅，没那股香。', "A mud-sealed jar — not even a god could smell it. The only ten-year jar opened this year was the flower god's. The new brew at the square has no such scent."),
  basin: t('（葛姑的花漏石盆，刻着十道圈，盆底一层薄薄的落花。）', "(Ge Gu's petal-clock basin, ruled in ten rings, with a thin, even layer of petals in the bottom.)"),
  gegu: t('这谷里的花，落得比更漏还匀：半个时辰，覆地一分。今夜无风，祠堂的院子又四面有墙，更是一分不差。', "The petals here fall more evenly than any water-clock: half a double-hour covers the ground one tenth. There's no wind tonight, and the shrine yard is walled on all four sides — it won't be off by a hair."),
  gegu2: t('子正往回数：一分一个钟头。', 'Count back from midnight: one tenth per hour.'),
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
