// 桃源记 · the script (story bible §3): the order of the eight beats, the valley's hour and who is where
// in each stretch of the story, and every line the beats say. Pure data and logic (no three.js, no
// DOM), tested in tests/taoyuan-story.test.ts; the director that plays it is story.ts.
//
// Progress lives only in play flags (backed up, synced across tabs): each beat saves `ty:<beat>` when it
// is over, so a world rebuilt mid-story resumes at the next one. `{名}` is filled at render (never
// brushed); inside the valley an empty name reads 客 / guest.
import type { CharacterId } from '../../../../data/characters';
import type { VillagerKey } from './hooks';
import type { SkyMood } from './engine';

export interface Line { zh: string; en: string }
const t = (zh: string, en: string): Line => ({ zh, en });

// ───────────────────────────── the order of things

export const BEATS = ['b1', 'b2', 'b3', 'b4a', 'b4b', 'b4c', 'b5', 'b6', 'b7', 'b8'] as const;
export type Beat = typeof BEATS[number];
export const beatFlag = (b: Beat): string => `ty:${b}`;

type Flags = Readonly<Record<string, true | undefined>>;

/** The case (bible §4) is open and not yet judged: the valley holds 子正. */
export const caseOpen = (f: Flags): boolean => !!f['case:hz:open'] && !f['case:hz:solved'];

/**
 * What comes next: a beat, 'case' (the case is open — the story waits for the judgement), or 'done'.
 * B6 needs the case judged; the parked path (「且待天明」) goes on to B7 and B8 without it, and B6 comes
 * later, whenever the parked case is taken up and judged.
 */
export function nextBeat(f: Flags): Beat | 'case' | 'done' {
  for (const b of ['b1', 'b2', 'b3', 'b4a', 'b4b', 'b4c', 'b5'] as const) if (!f[beatFlag(b)]) return b;
  if (f['case:hz:solved'] && !f['ty:b6']) return 'b6';
  if (caseOpen(f)) return 'case';
  if (!f['ty:b6'] && !f['case:hz:parked']) return 'case';
  if (!f['ty:b7']) return 'b7';
  if (!f['ty:b8']) return 'b8';
  return 'done';
}

/** The stretches of the story the villagers stand in (story.ts places them by it). */
export type Phase = 'arrive' | 'feast' | 'xu' | 'hai' | 'zi' | 'case' | 'dawn' | 'farewell' | 'chang';

export function phaseOf(f: Flags): Phase {
  const n = nextBeat(f);
  switch (n) {
    case 'b1': case 'b2': case 'b3': return 'arrive';
    case 'b4a': return 'feast';
    case 'b4b': return 'xu';
    case 'b4c': return 'hai';
    case 'b5': return 'zi';
    case 'case': case 'b6': return 'case';
    case 'b7': return 'dawn';
    case 'b8': return 'farewell';
    default: return 'chang';
  }
}

/** The valley's hour for where the story stands (bible §1.3): set on every way in, so a return resumes it. */
export function storyClock(f: Flags): SkyMood {
  switch (phaseOf(f)) {
    case 'arrive': return 'shen';
    case 'feast': return 'you';
    case 'xu': return 'xu';
    case 'hai': return 'hai';
    // (the seal found gone at 子正: from then on the night is held, FX11)
    case 'zi': return f['ty:b5s'] ? 'case' : 'zi';
    case 'case': return 'case';
    case 'dawn': case 'farewell': return 'mao';
    default: return 'chang';
  }
}

/** The judgement's grade, as the case recorded it (bible §4.10); 明 if none is recorded. */
export type Grade = 'shen' | 'ming' | 'ping' | 'zibai';
export function gradeFromFlags(f: Flags): Grade {
  for (const g of ['shen', 'ming', 'ping', 'zibai'] as const) if (f[`case:hz:grade:${g}`]) return g;
  return 'ming';
}

/** 阮郎 and 桃叶 have gone out into the world (their passes were stamped in B6). */
export const leftValley = (f: Flags): boolean => !!f['ty:b6'];

/** Came once before, by the old way (the 奇遇 met before this story began): the ⟲ lines. */
export const OLD_GUEST = 'ty:oldguest';

/** Every flag the story itself writes (each ≤ 64 characters; none may be set by the owner's code). */
export const STORY_FLAGS: readonly string[] = [
  ...BEATS.map(beatFlag), OLD_GUEST, 'ty:b5s', 'ty:wish:none', 'ty:wish:again', 'ty:wish:xiaoman', 'ty:zhiyin', 'ty:stele',
  'ty:peach', 'item:keep:xiantao', 'visit:taoyuan', 'case:hz:open', 'case:hz:parked', 'case:hz:catnose', 'case:hz:c:menxiang', 'item:keep:wulinggou',
];

/** The coins of the way out (B8), paid as 桃源 income; the 奇遇 coins came at B2 (markEncounter). */
export const B8_COINS = 120;
/** The Taoist child's peach at the spring (B7): paid once, as the old encounter's taoist bonus was. */
export const PEACH_COINS = 80;

// ───────────────────────────── who speaks

/** A line in a beat: said by a villager, by the walker's companion ('me'), or by nobody (a stage direction, 'narr'). */
export interface SLine extends Line { by: VillagerKey | 'me' | 'narr'; choices?: Line[] }
const S = (by: SLine['by'], zh: string, en: string, choices?: Line[]): SLine => ({ by, zh, en, choices });

/** Companion variants of a beat, by companion (the rest hear nothing extra). */
export type Variants = Partial<Record<CharacterId, SLine[]>>;

// ───────────────────────────── B1 · 初极狭

export const B1 = {
  veil: t('林尽水源，便得一山。山有小口，仿佛若有光。便舍船，从口入。', 'Where the stream began there was a hill, and in the hill a small opening from which there seemed to come a light. He left his boat and went in.'),
  /** Before the veil (关公 gets down from 赤兔). */
  before: { guan: [S('me', '赤兔，在外候着。', 'Red Hare — wait outside.')] } as Variants,
  /** In the cleft, at the words on the rock. */
  cleft: {
    swordsman: [S('me', '（抚着石壁）这石壁是人凿的，凿痕很老了。', '(Running a hand along the wall) This passage was cut by hand. Old chisel marks.')],
    cat: [S('me', '喵。', 'Mrow.'), S('narr', '（大橘从你脚边挤过去，先到了光里，回头等你。）', '(Big Ginger squeezes past your feet, reaches the light first, and turns to wait for you.)')],
    change: [S('narr', '（她飘过窄道，石壁被照成一片银白；落花绕着她走，一片也不沾身。）', '(She floats through the narrow way and the rock turns silver in her light; the falling petals part around her, and not one touches her.)')],
  } as Variants,
};

// ───────────────────────────── B2 · 豁然开朗

export const B2 = {
  see: [S('xiaoman', '阿爷——有外人！', 'Grandpa — a stranger!')],
  run: [S('xiaoman', '你是山外来的吗？你身上怎么一片花瓣都没有？', "Are you from beyond the hills? How come there isn't a single petal on you?")],
  runVariants: {
    rabbit: [S('me', '……我是从月亮上来的。', '…I came from the moon.'), S('xiaoman', '兔儿会说话！阿爷，兔儿会说话！', 'The rabbit talks! Grandpa, the rabbit talks!')],
    cat: [S('xiaoman', '这猫比我们谷里的胖。', 'This cat is fatter than ours.')],
    change: [S('xiaoman', '姐姐是月亮上下来的吗？我们这里的月亮，也是你的吗？', 'Did you come down from the moon? Is our moon yours too?')],
  } as Variants,
  ask: S('qin', '客人是从哪儿来的？', 'Where have you come from, guest?', [t('从山寺的瀑布后面来。', 'From behind the waterfall at the mountain temple.'), t('顺着光，走进来的。', 'I followed the light in.')]),
  /** ⟲ the old guest: instead of the question. */
  askOld: [S('qin', '……我认得你。上一回你也是从光里来，走得急，连名字都没留下。', '…I know you. Last time you came out of the light too, and left in such a hurry you never gave your name.')],
  answer: [
    S('qin', '瀑布后面……原来水是那样出去的。', 'Behind a waterfall… so that is where our water goes.'),
    S('qin', '光……原来谷里的光，外头也看得见。', 'The light… so the light of this valley can be seen from outside.'),
  ],
  variants: {
    guan: [S('qin', '将军是哪一国的？', 'Which kingdom does the general serve?'), S('me', '汉。', 'Han.'), S('qin', '……汉是哪一国？', '…Which kingdom is Han?')],
    fisher: [S('narr', '（秦守拙静了一会儿。）', '(Qin Shouzhuo falls quiet for a moment.)'), S('qin', '又一个打鱼的……上一个打鱼的，走的时候处处做了记号。', 'Another fisherman… The last one marked every turn on his way out.')],
  } as Variants,
  askName: S('qin', '还没问你，怎么称呼？', 'I never asked — what should we call you?'),
  askNameOld: S('qin', '这一回，总该告诉我怎么称呼了吧？', 'This time you\'ll tell me what to call you, surely?'),
  nameChoice: [t('告诉他。', 'Tell him.'), t('我就是个走山路的，没什么名号。', 'I have no name to give.')],
  named: S('qin', '{名}。好名字。谷里六百年没问过谁叫什么，大家都认得。', '{名}. A good name. No one here has asked anyone\'s name in six hundred years — we all know each other.'),
  nameless: S('qin', "那我就叫你一声『客』吧。", "Then I'll just call you \"guest\"."),
  invite: S('qin', '走了这么远，先歇歇脚。今天谷里正好有酒，跟我来。', 'You\'ve come a long way. Rest your feet. As it happens there\'s wine in the valley today. Come with me.'),
  follow: t('随行', 'Follow'),
  firstCoins: (n: number) => t(`奇遇录 · 桃花源　得钱 ${n} 文`, `Encounters · The Peach Blossom Spring  +${n} coins`),
};

// ───────────────────────────── B3 · 设酒杀鸡

export const B3 = {
  walk: t('随秦守拙缘溪而下，往花场去。', 'You follow Qin Shouzhuo down along the stream to the square.'),
  catchUp: t('（你随他穿过桃林，到了花场。）', '(You follow him through the peach trees to the square.)'),
  intro: S('qin', '都来见过客人。', 'Come, all of you, and meet our guest.'),
  /** Who is introduced, in order (the elder first, then round the tables). */
  order: ['qin', 'xiaoman', 'guiniang', 'sang', 'taoye', 'ruan', 'duer', 'ashu', 'liupo', 'shigu', 'lusan', 'gegu'] as VillagerKey[],
  question: S('qin', '今是何世？', 'What age is it now, out there?', [t('一一为具言所闻。', 'I tell them everything I know.'), t('说来话长，先喝一杯再说。', "It's a long story. Let's drink first.")]),
  ages: ['秦', '汉', '魏', '晋'],
  told: [S('narr', '（皆叹惋。）', '(All sigh.)'), S('qin', '秦、汉、魏、晋……我们在谷里看了六百回桃花，外头换了这么多回皇帝。', 'Qin, Han, Wei, Jin… We\'ve watched the blossom come six hundred times in here, and out there they\'ve gone through all those emperors.')],
  drink: [S('narr', '（杜二哈哈大笑，满满斟上一碗。）', '(Du Er roars with laughter and pours you a brimming bowl.)'), S('duer', '好！先喝，天塌下来明日再说！', "Good! Drink first — if the sky falls, we'll talk about it tomorrow!")],
  scholar: [S('me', '秦亡，汉兴，汉分三国，魏篡汉，晋代魏……', 'Qin fell, Han rose; Han split into three kingdoms; Wei took Han, and Jin took Wei…'), S('qin', '先生慢些说，慢些。我得一个字一个字誊进花朝簿里。', 'Slowly, sir, slowly. I want to copy it into the register word by word.')],
  cups: S('narr', '（渠上漂来一只小杯，杯里一点烛火，停在你面前。）', '(A little cup carrying a candle comes drifting down the channel and stops in front of you.)', [t('敬桃花。', 'To the blossom.'), t('敬主人。', 'To our hosts.'), t('敬山外的人。', 'To the people outside.')]),
  cupsReply: [
    S('gegu', '桃花收下了。明年要是落得慢，我记你头上。', 'The blossom accepts. If it falls slower next year, I\'ll put it down to you.'),
    S('guiniang', '收下了，收下了！再添一碗！', 'Accepted, accepted! Have another bowl!'),
    S('narr', '（三娘抬起头，看了你很久。）', '(Sanniang looks up, and looks at you for a long time.)'),
  ],
  variants: {
    player: [S('me', '这一局，怕是下了一千年。', 'This game must have run a thousand years.'), S('shigu', '一千年？才开局呢。', "A thousand? We've only just opened.")],
    poet: [S('me', '桃花流水窅然去，别有天地非人间。', 'Peach petals on the water drift far away — here is another world, not of men.')],
    cat: [S('narr', '（桂娘在桌底下悄悄塞给大橘一个鱼头。）', '(Under the table, Gui Niang slips Big Ginger a fish head.)'), S('guiniang', '嘘，别让杜二看见。', "Shh — don't let Du Er see.")],
  } as Variants,
  announce: S('qin', '今夜花朝。戌正头一通鼓，亥正采桑舞，子初放灯，子正开殿，我给阮郎钤印出谷。二十年了，头一个。', "Tonight is the Flowers' Birthday. First drums at 戌正 (8 pm), the mulberry dance at 亥正 (10 pm), lanterns at 子初 (11 pm), and at 子正 (midnight) the hall opens and I stamp Ruan Lang's pass so he can go out. The first in twenty years."),
  shadows: [S('narr', '（三娘的杯子停在半空。）', "(Sanniang's cup stops halfway to her lips.)"), S('narr', '（桃叶低头看着地。）', '(Taoye stares at the ground.)'), S('narr', '（石瞽拨了一个低音。）', '(Shi Gu plucks a single low note.)')],
  after: t('杜二回酒坊去了。', 'Du Er has gone back to his brewery.'),
};

// ───────────────────────────── B4 · 花朝夜

export const B4 = {
  // (a) 戌初 · 封匣
  jarLabel: t('杜二 · 酒坊', 'Du Er · the brewery'),
  jarAct: t('搭把手', 'Lend a hand'),
  jarAsk: [S('duer', '你手稳，这坛你帮我抱去祠堂。我自己抱？走不到半路这手就痒得想开了！', "You've got steady hands. Carry this jar to the shrine for me. Me carry it? My hands'd be itching to open it before I got halfway!"), S('duer', '这坛十年陈，泥封到今夜，就等花神开坛。场上喝的都是新醅，淡得像水。', 'Ten years in this jar, sealed until tonight, waiting for the flower god to open it. What we drink at the square is new brew — thin as water.')],
  carry: t('抱着酒坛，往祠堂去。', 'Carry the jar to the shrine.'),
  setLabel: t('祠堂 · 供桌', 'The shrine · the altar'),
  setAct: t('置坛', 'Set down the jar'),
  setVeil: t('捧坛入殿，置于供桌。', 'You carry the jar into the hall and set it on the altar.'),
  rite: [
    S('narr', '（秦守拙把玉印放进漆匣，用泥封了口，按上私印「守拙」。）', '(Qin Shouzhuo lays the jade seal in its lacquer box, seals the lid with clay, and presses his own seal, Shouzhuo, into it.)'),
    S('liupo', '香篆一格一个时辰：戌、亥、子。一格三针，初、正、末。', 'The incense seal burns one section a double-hour: 戌, 亥, 子. Three pins to a section: start, middle, end.'), S('liupo', '记不住不要紧，别碰就行。今年的香是三娘帮我压的。', "Can't remember? Never mind. Just don't touch it. Sanniang pressed the powder for me this year."),
    S('qin', '祭完就关殿门，到子正再开。这当中，谁也不许进。', 'After the rite the hall stays shut until midnight. Nobody goes in till then.'),
  ],
  memory: t('记下：亲见封匣——戌初，匣已封，坛完好。', 'Remembered: you saw the box sealed — at 戌初 the box was sealed and the jar whole.'),
  after: t('柳婆在祠堂门外等你。', 'Liu Po is waiting for you at the shrine gate.'),
  // (b) 亥初 · 挂灯
  lanternLabel: t('柳婆 · 祠堂门外', 'Liu Po · the shrine gate'),
  lanternAct: t('挂灯', 'Hang the lantern'),
  lanternAsk: S('liupo', '客灯，得外头来的人挂。你来。', 'The guest lantern has to be hung by someone from outside. You do it.'),
  sniff: S('liupo', '香好好的……杜二那坛陈酿真香，隔着门都闻得到。', "The incense is burning fine… That aged jar of Du Er's is so fragrant you can smell it through the door.", [t('不进去看看？', "Won't you look inside?"), t('（不作声）', '(say nothing)')]),
  rules: S('liupo', '进去？祭完了谁也不许进，老婆子也不进。你别撺掇我。', 'Go in? Nobody goes in after the rite. Not me either. Don\'t you egg me on.'),
  cat: [S('narr', '（大橘在殿门前炸了毛。）', "(Big Ginger's fur stands on end at the hall door.)"), S('me', '酒味，好浓。', 'Wine. Strong.')],
  menxiang: t('门外酒香', 'Wine at the Door'),
  after2: t('亥正将至：花场上，采桑舞要开始了。', 'It is nearly 亥正 (10 pm): the mulberry dance is about to begin at the square.'),
  // (c) 亥正 · 采桑舞
  dancers: ['sang', 'taoye', 'guiniang', 'gegu', 'ashu', 'ruan', 'duer', 'lusan'] as VillagerKey[],
  dance: S('narr', '（三娘领着采桑舞，众人绕着花神杆，彩带翻飞。）', '(Sanniang leads the mulberry dance; everyone circles the flower pole, ribbons flying.)'),
  variants: {
    musician: [S('narr', '（琴师与石瞽合奏了一曲。）', '(The Qin Player and Shi Gu play a duet.)'), S('shigu', '知音。', 'A true listener.')],
    gardener: [S('narr', '（花神杆上的花环应声开满。）', '(The garland on the pole bursts into bloom.)')],
    rabbit: [S('narr', '（玉兔蹦进舞圈，孩子们也跟着跳了进来。）', '(The Jade Rabbit hops into the ring, and the children follow her in.)')],
    change: [S('narr', '（花场上空，月亮亮了几分。）', '(Over the square, the moon brightens.)')],
  } as Variants,
};

// ───────────────────────────── B5 · 子正失印

export const B5 = {
  lanterns: t('子初放灯。', 'Lanterns at 子初.'),
  procession: t('子正。众人随秦守拙到祠堂，开殿钤印。', "子正. Everyone follows Qin Shouzhuo to the shrine to open the hall and stamp the pass."),
  gatherLabel: t('祠堂 · 子正开殿', 'The shrine · the hall opens at 子正'),
  gatherAct: t('随众入庭', 'Go in with them'),
  found: S('narr', '（匣上的封泥被剥开，漆匣空空；供坛碎了一地；香篆熄在亥正那一针。）', '(The clay on the box has been peeled away and the lacquer box is empty; the offering jar lies in shards; the incense has died at the 亥正 pin.)'),
  outcry: [
    S('liupo', '香……灭在亥正。', 'The incense… died at 亥正.'),
    S('guiniang', '小满呢？谁看见小满了？', "Where's Xiaoman? Has anyone seen Xiaoman?"),
    S('duer', '外人一来，印就丢了！亥初那会儿我从酒坊回来，亲眼看见这个外人在殿门口转悠！', 'A stranger turns up and the seal\'s gone! At 亥初 (9 pm), coming back from the brewery, I saw this one hanging about the hall door with my own eyes!'),
  ],
  guan: [S('me', '关某在此，谁敢妄言外客？', 'While Guan stands here, who dares slander a guest?'), S('narr', '（杜二不作声了。）', '(Du Er falls silent.)')],
  ruan: [S('ruan', '没有印……我走不了了。', "No seal… then I can't go."), S('qin', '都住口。', 'Enough, all of you.')],
  variants: {
    swordsman: [S('narr', '（侠客抬眼一扫。）', '(The swordsman glances up.)'), S('me', '后窗开着。', 'The back window is open.')],
    player: [S('me', '落子无悔，局却可以复盘。', "A stone once played can't be taken back — but the game can be reviewed.")],
  } as Variants,
  bird: t('青鸟衔来一封信', 'A bluebird brings a letter'),
  read: t('读信', 'Read it'),
  voice: t('花停在半空，谁也不会走。', 'The petals hang in the air. Nobody is going anywhere.'),
  choice: S('qin', '……客人看，这事怎么办？', '…What do you say, guest?', [t('这案子，我来断。', 'I\'ll judge this case.'), t('等天亮再说。', 'Let\'s wait till morning.')]),
  judge: S('qin', '客人肯管这事？那就拜托了。', 'You\'ll take this on, guest? Then I\'m counting on you.'),
  wait: S('qin', '……那就等天亮。院里的花谁也不许扫，等客人回来再看。', '…Then it waits for daylight. Nobody sweeps the courtyard till the guest is back to look.'),
  /** On resume (the discovery already seen): the elder asks again. */
  again: S('qin', '印还没有下落。', 'The seal is still missing.'),
  choiceLabel: t('秦守拙 · 失印', 'Qin Shouzhuo · the lost seal'),
  choiceAct: t('此案如何', 'The case'),
};

// ───────────────────────────── B6 · 双印

export const B6 = {
  confess: [
    S('sang', '我就想拖一拖。今夜盖不成印，阮郎就得等明年。', 'I only wanted to put it off. No seal tonight, and Ruan has to wait till next year.'), S('sang', '明年再拖。拖上几年，他在谷里成了家，还走什么？', "Then put it off again. A few years of that, he's settled here with a family. Why would he go?"), S('sang', '他不走，桃叶也就不走了。', "And if he doesn't go, neither does Taoye."),
    S('sang', '二十年前，桑远也是花朝走的，也是子正盖的印。', "Twenty years ago Sang Yuan went on the Flowers' Birthday too. His pass was stamped at midnight too."), S('sang', '印盖了，人也没回来。', 'Stamped. And he never came back.'),
  ],
  remember: S('narr', '（你想起花朝簿上的那一行。）', '(You remember a line in the register.)'),
  register: t('花朝簿上，桑远那一行，没有朱印。', "In the register, Sang Yuan's line has no red seal."),
  qin: S('qin', '……没盖。桑远那回的印，是我没盖。我想着不盖印，他就走不成。他还是走了。', '…It was never stamped. Sang Yuan\'s pass — I never stamped it. I thought, no seal, he can\'t go. He went anyway.'),
  pause: S('sang', '……没盖？那他是回不来。我还当他是不要我们了。', "…Not stamped? Then he couldn't come back. All this time I thought he didn't want us."),
  handSeal: S('narr', '（你把蚕匾底下找到的玉印，交还秦守拙。）', '(You hand the elder the jade seal you found under the silkworm leaves.)'),
  fetchSeal: S('narr', '（三娘转身去了蚕房，回来时，手里捧着玉印。）', '(Sanniang goes to the silk room and comes back with the jade seal in her hands.)'),
  stampRuan: S('narr', '（秦守拙在阮郎的过所上，郑重钤下朱印。）', "(Qin Shouzhuo sets the red seal on Ruan Qing's pass with great care.)"),
  taoye: S('narr', '（桃叶走上前来，手里也捧着一张过所。三娘看了她很久。）', '(Taoye steps forward, holding a pass of her own. Sanniang looks at her for a long moment.)'),
  go: S('sang', '去吧。那边冷，记得添衣裳。……记得回来。', 'Go on, then. It\'s cold out there. Wrap up warm. …Remember to come back.'),
  stampTaoye: S('narr', '（秦守拙也为她钤了印。）', '(The elder stamps hers too.)'),
  codas: {
    guan: [S('me', '罢了。等了二十年的人，关某不忍再问。', 'Enough. She has waited twenty years. Guan will ask her nothing more.')],
    player: [S('me', '这一局，复盘得好。', 'A good review of this game.')],
    cat: [S('narr', '（三娘一言不发，在大橘面前放了一尾小鱼。）', '(Without a word, Sanniang sets a small fish in front of Big Ginger.)')],
    change: [S('me', '我也等过一个人。现在还在等。', 'I waited for someone once. I still am.')],
  } as Variants,
  dawn: t('天亮了。阮郎和桃叶向谷口走去。', 'Day breaks. Ruan Qing and Taoye walk toward the valley mouth.'),
  spring: t('源头有光。', 'There is a light at the spring.'),
  /** The elder's prompt when B6 is due and has not played (a reload after the judgement). */
  stamp: t('钤印', 'Stamp the passes'),
};

// ───────────────────────────── B7 · 源

export const B7 = {
  label: t('源头有光', 'Light at the spring'),
  act: t('近前', 'Go closer'),
  lines: [
    S('yaoyao', '此门只为无所求者开。当年那渔人处处志之——他有所求，所以找不回来。', 'This door opens only for those who want nothing. The fisherman long ago marked every turn — he wanted something, so he never found it again.'),
  ],
  ask: S('yaoyao', '{名}，你想要什么？', '{名}, what do you want?', [t('什么都不要。', 'Nothing.'), t('想再来看看。', 'To come back and see it again.'), t('想让小满看看外面。', 'For Xiaoman to see the world outside.')]),
  replies: [
    S('yaoyao', '那你随时都找得到这里。', 'Then you will always find your way here.'),
    S('yaoyao', '想，也是一种求。……这回，我替你记着路。', "Wanting is also a kind of asking… This time, I'll remember the way for you."),
    S('yaoyao', '那孩子啊……等他长到阮郎那么高吧。', "That child… when he's as tall as Ruan Qing, perhaps."),
  ],
  wishes: ['ty:wish:none', 'ty:wish:again', 'ty:wish:xiaoman'],
  variants: {
    change: [S('narr', '（夭夭向嫦娥盈盈一拜。）', "(Yaoyao bows low to Chang'e.)"), S('yaoyao', '广寒一别，三千年了。', 'Three thousand years since the Moon Palace.'), S('me', '你还是这么爱笑。', 'You still laugh as much as ever.')],
    taoist: [S('yaoyao', '小道长，这颗桃给你——当年说好的。', 'Little master, this peach is yours — as was promised long ago.'), S('narr', '（夭夭把一颗仙桃放进道童手里。）', '(Yaoyao lays a peach of the immortals in the Taoist child\'s hand.)')],
    poet: [S('yaoyao', '留一句诗给这水吧。', 'Leave this water a line of verse.'), S('me', '花不知年水自春。', 'The blossom keeps no years; the water keeps its spring.'), S('narr', '（字落在水上，花瓣跟着它们，漂向下游。）', '(The words settle on the water, and the petals follow them downstream.)')],
    rabbit: [S('narr', '（夭夭摸了摸玉兔的耳朵。）', "(Yaoyao strokes the Rabbit's ears.)"), S('yaoyao', '你也是从月亮上被赶下来的？', 'Were you sent down from the moon too?')],
  } as Variants,
  poemWords: '花不知年水自春',
  peach: (n: number) => t(`得仙桃一枚 · 得钱 ${n} 文`, `A peach of the immortals  +${n} coins`),
  after: t('该走了。谷口，众人在等你。', 'It is time to go. Everyone is waiting at the valley mouth.'),
};

// ───────────────────────────── B8 · 既出

export const B8 = {
  gift: S('xiaoman', '这是我的宝贝，在树洞最里头找到的。给你——你是外人，外人才用得着钩子。', "This is my treasure — I found it right at the back of the hollow. It's yours. You're from outside, and only outside people need hooks."),
  fisher: [S('me', '这是武陵人的钩子……他回来找过。', "This is a Wuling man's hook… He came back looking.")],
  farewell: S('qin', '此中之事，不足为外人道也。……不过{名}，你已不算外人了。', 'What happens here is not to be spoken of to outsiders… Though, {名}, you are hardly an outsider now.'),
  hook: t('武陵钩', 'The Wuling Hook'),
  go: t('向谷口走去，出谷。', 'Walk to the valley mouth, and leave.'),
  leave: t('辞别', 'Say goodbye'),
  line: t('既出，得其船，便扶向路……', 'Once out, he found his boat and went back the way he came…'),
  card: {
    titleZh: '桃源记', titleEn: 'The Peach Blossom Record',
    bodyZh: '出得洞来，日影只移了一寸。那一夜，是世上的一炷香，还是一千年？',
    bodyEn: 'Out of the cave, the sun\'s shadow has moved only an inch. Was that night one stick of incense in the world — or a thousand years?',
    seal: '桃',
  },
  rewards: (n: number) => t(`得钱 ${n} 文 · 武陵钩`, `+${n} coins · the Wuling Hook`),
};

// ───────────────────────────── later visits

export const LATER = {
  /** The parked case, on the elder (after B8). */
  oldCase: t('那桩旧案', 'The old case'),
  oldCaseAsk: S('qin', '庭里的花，还没人扫过。', 'No one has swept the courtyard yet.', [t('我来断。', 'I\'ll judge it.'), t('再等等。', 'Not yet.')]),
  oldCaseYes: S('qin', '好。院门给你开着，去吧。', 'Good. The gate\'s open for you. Go on.'),
  /** A return through the cleft (the reveal is B2's alone). */
  mouth: '桃花源',
  /** The judgement's prompt on the elder while the case is open. */
  gather: t('请众人到庭', 'Gather everyone'),
  notYet: t('证据未足', 'Not enough evidence yet'),
  missing: (n: number) => t(`（证据还差 ${n} 件。）`, `(Evidence still missing: ${n}.)`),
  /** 「出谷」 while a beat is under way (the way out waits). */
  carryFirst: t('先把酒坛抱去祠堂。', 'Carry the jar to the shrine first.'),
  followFirst: t('先随秦守拙去花场。', 'Follow Qin Shouzhuo to the square first.'),
  busy: t('且把眼前的事做完。', 'Finish what is in hand first.'),
  /** The parked-late B6 ends in the valley's own hour. */
  after: t('天光大亮，谷里又是寻常的春日。', 'Full daylight; the valley is an ordinary spring day again.'),
};

// ───────────────────────────── the stele by the pool (§4.10)

export const STELE = {
  text: '武陵桑远候门于此四十年终不得入',
  label: t('潭边的石碑', 'A stele by the pool'),
  act: t('读碑', 'Read it'),
  card: {
    titleZh: '潭边碑', titleEn: 'The Stele by the Pool',
    bodyZh: '「武陵桑远，候门于此四十年，终不得入。」\n\n苔痕很深，像是一直都在这里。',
    bodyEn: '“Sang Yuan of the Peach Spring waited at this gate forty years, and never found the way in.”\n\nThe moss on it is deep, as if it had always been here.',
    seal: '碑',
  },
};

// ───────────────────────────── keepsakes the story gives (their names for the keepsake list)

export { KEEPSAKES } from '../../../../data/keepsakes';

// ───────────────────────────── how each beat begins

/** A beat begun by a word with a villager: whose prompt carries it, its label (null: the villager's own name), its action. */
export interface BeatPrompt { who: VillagerKey; label: Line | null; action: Line }

/** The beats begun by talking to someone (story.ts puts these prompts on them). */
export const BEAT_PROMPTS: Partial<Record<Beat, BeatPrompt>> = {
  b3: { who: 'qin', label: null, action: B2.follow },
  b4a: { who: 'duer', label: B4.jarLabel, action: B4.jarAct },
  b4b: { who: 'liupo', label: B4.lanternLabel, action: B4.lanternAct },
  b5: { who: 'qin', label: B5.gatherLabel, action: B5.gatherAct },
  b6: { who: 'qin', label: null, action: B6.stamp },
};
/** The beats begun where the walker stands (story.ts triggers them there; B7 by a prompt in the light). */
export const BEAT_PLACES: Partial<Record<Beat, 'square' | 'spring' | 'terrace'>> = { b4c: 'square', b7: 'spring', b8: 'terrace' };
/** The beats begun by the ways in: the door at the pool (B1) and the inner mouth (B2). */
export const BEAT_WAYS: Partial<Record<Beat, 'door' | 'mouth'>> = { b1: 'door', b2: 'mouth' };
