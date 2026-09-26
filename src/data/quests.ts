// The quest book (任务簿). Finishing a quest brings a companion (a playable character in 入画) or a
// seal for your album. Some quests are about the games; the best ones are about your real habits.
import type { CharacterId } from './characters';

/** How a quest measures progress. */
export type QuestGoal =
  /** A play counter reaching a target (see app/play.ts: record()). */
  | { kind: 'counter'; key: string; target: number }
  /** A best-ever value reaching a target (recordMax()). */
  | { kind: 'best'; key: string; target: number }
  /** A one-off flag being set (flag()). */
  | { kind: 'flag'; key: string }
  /** Several flags with a common prefix (e.g. every region visited). */
  | { kind: 'flags'; prefix: string; target: number }
  /** Real life: the longest current streak of any habit. */
  | { kind: 'streak'; target: number }
  /** Real life: sticks of incense burned to the end. */
  | { kind: 'incense'; target: number }
  /** Companions gathered (the scholar counts). */
  | { kind: 'companions'; target: number };

export interface QuestDef {
  id: string;
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
  /** A hint of where to go / what to do. */
  hintZh: string;
  hintEn: string;
  goal: QuestGoal;
  reward: { character: CharacterId } | { seal: string; sealEn: string };
}

export const QUESTS: QuestDef[] = [
  { id: 'q-water', zh: '灌园', en: 'Tend the Garden', descZh: '在入画中为花木浇水七次。', descEn: 'Water your plants seven times inside the painting.', hintZh: '走近园中花木，点「浇水」。', hintEn: 'Walk up to a plant in the garden and choose Water.', goal: { kind: 'counter', key: 'water', target: 7 }, reward: { character: 'gardener' } },
  { id: 'q-streak7', zh: '七日之功', en: 'Seven Days Strong', descZh: '任意一个习惯，连续坚持七日。', descEn: 'Keep any habit seven days in a row.', hintZh: '这一个要在真实生活里完成。', hintEn: 'This one is done in real life.', goal: { kind: 'streak', target: 7 }, reward: { character: 'swordsman' } },
  { id: 'q-incense', zh: '五炷心香', en: 'Five Sticks of Incense', descZh: '燃尽五炷香，专注到底。', descEn: 'Burn five sticks of incense all the way through.', hintZh: '在「一炷香」里专注，不中途熄灭。', hintEn: 'Focus in One Stick of Incense without putting it out.', goal: { kind: 'incense', target: 5 }, reward: { character: 'musician' } },
  { id: 'q-fish', zh: '临渊羡鱼', en: 'Gone Fishing', descZh: '在荷塘边钓上五条鱼。', descEn: 'Catch five fish at the lotus lake.', hintZh: '荷塘渡口，垂竿以待。', hintEn: 'Cast from the dock at the lotus lake.', goal: { kind: 'counter', key: 'fish', target: 5 }, reward: { character: 'fisher' } },
  { id: 'q-bell', zh: '夜半钟声', en: 'The Temple Bell', descZh: '登上山寺，敲响古钟。', descEn: 'Climb to the mountain temple and ring the old bell.', hintZh: '山寺钟楼，就在大殿西边。', hintEn: 'The bell tower stands west of the main hall.', goal: { kind: 'flag', key: 'bell' }, reward: { character: 'taoist' } },
  { id: 'q-explore', zh: '行万里路', en: 'Walk Ten Thousand Li', descZh: '走遍六处风景：园、水乡、荷塘、竹林、梅岭、山寺。', descEn: 'Visit all six places: garden, water town, lake, bamboo grove, plum ridge, temple.', hintZh: '打开「舆图」看看还缺哪里。', hintEn: 'Open the map to see where you have not been.', goal: { kind: 'flags', prefix: 'visit:', target: 6 }, reward: { character: 'painter' } },
  { id: 'q-chess', zh: '棋逢对手', en: 'A Worthy Opponent', descZh: '在五子棋或象棋中，胜过「棋友」一局。', descEn: 'Beat the Club level at Gomoku or Xiangqi once.', hintZh: '游艺 · 五子棋或象棋。', hintEn: 'Play · Gomoku or Xiangqi.', goal: { kind: 'counter', key: 'win:club', target: 1 }, reward: { character: 'player' } },
  { id: 'q-cat', zh: '寻猫启事', en: 'Missing: One Cat', descZh: '大橘每天躲在不同的地方。找到它三次。', descEn: 'Big Ginger hides somewhere new each day. Find him three times.', hintZh: '听，哪里有呼噜声？', hintEn: 'Listen — where is that purring coming from?', goal: { kind: 'counter', key: 'cat', target: 3 }, reward: { character: 'cat' } },
  { id: 'q-mooncake', zh: '八月十五', en: 'Mid-Autumn Feast', descZh: '吃掉中秋的八块月饼。', descEn: 'Eat all eight Mid-Autumn mooncakes.', hintZh: '中秋那几天，或在「节日」里预览中秋。', hintEn: 'Around Mid-Autumn — or preview it from the Festivals panel.', goal: { kind: 'counter', key: 'mooncake', target: 8 }, reward: { character: 'rabbit' } },
  { id: 'q-feihua', zh: '飞花令', en: 'Flying Flowers', descZh: '在飞花令中，一局接满十句。', descEn: 'Chain ten lines in one game of Flying Flowers.', hintZh: '游艺 · 飞花令，或梅岭亭中的诗人。', hintEn: 'Play · Flying Flowers, or the poet in the plum-ridge pavilion.', goal: { kind: 'best', key: 'feihua', target: 10 }, reward: { character: 'poet' } },
  { id: 'q-klotski', zh: '华容道', en: 'Huarong Pass', descZh: '解开华容道「横刀立马」一局。', descEn: 'Solve the Huarong Pass puzzle "Blade Across the Horse".', hintZh: '游艺 · 华容道。', hintEn: 'Play · Huarong Pass.', goal: { kind: 'flag', key: 'klotski:hengdao' }, reward: { character: 'guan' } },
  { id: 'q-all', zh: '群贤毕至', en: 'All Friends Gathered', descZh: '集齐十二位同伴。', descEn: 'Gather twelve companions.', hintZh: '完成以上所有同伴任务。', hintEn: 'Finish every companion quest above.', goal: { kind: 'companions', target: 12 }, reward: { character: 'change' } },
  // Seals for the album
  { id: 'q-pitchpot', zh: '投壶十中', en: 'Ten in the Pot', descZh: '投壶累计投中十支。', descEn: 'Land ten arrows in the pitch-pot.', hintZh: '水乡广场有一只铜壶。', hintEn: 'There is a bronze pot in the water-town square.', goal: { kind: 'counter', key: 'pitchpot', target: 10 }, reward: { seal: '十中', sealEn: 'Ten hits' } },
  { id: 'q-lotus', zh: '采莲南塘', en: 'Picking Lotus', descZh: '泛舟荷塘，采五枝莲蓬。', descEn: 'Row out on the lake and pick five lotus pods.', hintZh: '渡口有船。', hintEn: 'There is a boat at the dock.', goal: { kind: 'counter', key: 'lotus', target: 5 }, reward: { seal: '莲心', sealEn: 'Lotus heart' } },
  { id: 'q-lantern', zh: '河灯寄愿', en: 'A Lantern Downstream', descZh: '在水乡河边放一盏河灯。', descEn: 'Float a lantern on the river in the water town.', hintZh: '水乡河边的石阶。', hintEn: 'The stone steps by the river in the water town.', goal: { kind: 'counter', key: 'lantern', target: 1 }, reward: { seal: '寄愿', sealEn: 'A wish' } },
  { id: 'q-summit', zh: '登高', en: 'Climb High', descZh: '登上梅岭之巅的亭子。', descEn: 'Reach the pavilion at the top of Plum Ridge.', hintZh: '竹林往北，山路向上。', hintEn: 'North of the bamboo grove, the path climbs.', goal: { kind: 'flag', key: 'summit' }, reward: { seal: '登高', sealEn: 'Summit' } },
  { id: 'q-snake', zh: '长蛇五十', en: 'Fifty Blossoms', descZh: '贪吃蛇单局得五十分。', descEn: 'Score fifty in one game of Snake.', hintZh: '游艺 · 贪吃蛇。', hintEn: 'Play · Snake.', goal: { kind: 'best', key: 'snake', target: 50 }, reward: { seal: '灵蛇', sealEn: 'Nimble snake' } },
  { id: 'q-tangram', zh: '七巧', en: 'Seven Clever Pieces', descZh: '七巧板拼出五幅图。', descEn: 'Solve five tangram figures.', hintZh: '游艺 · 七巧板。', hintEn: 'Play · Tangram.', goal: { kind: 'counter', key: 'tangram', target: 5 }, reward: { seal: '巧思', sealEn: 'Clever mind' } },
  { id: 'q-xiangqi', zh: '楚河汉界', en: 'Across the River', descZh: '在象棋中胜过「国手」。', descEn: 'Beat the Master level at Xiangqi.', hintZh: '游艺 · 象棋。', hintEn: 'Play · Xiangqi.', goal: { kind: 'counter', key: 'win:xiangqi-master', target: 1 }, reward: { seal: '国手', sealEn: 'Master' } },
  { id: 'q-coinspot', zh: '拾翠', en: 'Gleaner', descZh: '在高处、屋顶与石上拾得二十枚铜钱。', descEn: 'Pick up twenty coins from rooftops, rocks and high places.', hintZh: '铜钱常在要跳才够得着的地方。', hintEn: 'Coins hide where only a jump can reach.', goal: { kind: 'counter', key: 'coinspot', target: 20 }, reward: { seal: '拾翠', sealEn: 'Gleaner' } },
  { id: 'q-poles', zh: '梅花桩', en: 'Plum-Blossom Poles', descZh: '在竹林的梅花桩上一气走到终点。', descEn: 'Cross the plum-blossom poles in the bamboo grove without touching the ground.', hintZh: '竹林里立着一排木桩，起点有碑。', hintEn: 'A line of poles stands in the bamboo; a stele marks the start.', goal: { kind: 'flag', key: 'poles' }, reward: { seal: '凌虚', sealEn: 'Light Feet' } },
  { id: 'q-lookout', zh: '登临', en: 'The Lookout', descZh: '攀上梅岭乱石间的望台。', descEn: 'Climb the rocks on Plum Ridge to the hidden lookout.', hintZh: '梅岭的石头，跳着跳着就上去了。', hintEn: 'Jump from rock to rock on Plum Ridge.', goal: { kind: 'flag', key: 'lookout' }, reward: { seal: '登临', sealEn: 'Lookout' } },
  { id: 'q-qiyu', zh: '奇遇', en: 'Wonders', descZh: '在画中遇见五桩奇遇。', descEn: 'Meet five of the painting\'s chance encounters.', hintZh: '不同的时辰、天气与同伴，遇见的也不同。', hintEn: 'Different hours, weather and companions meet different things.', goal: { kind: 'counter', key: 'qiyu', target: 5 }, reward: { seal: '奇遇', sealEn: 'Wonders' } },
  { id: 'q-home', zh: '安居', en: 'Settled', descZh: '在家园里营造十件物事。', descEn: 'Build ten things at your homestead.', hintZh: '家园门口，「营造」。', hintEn: 'At the homestead gate: Build.', goal: { kind: 'counter', key: 'home:build', target: 10 }, reward: { seal: '安居', sealEn: 'Settled' } },
  { id: 'q-photo', zh: '取景', en: 'Framing', descZh: '在画中拍下五张照片。', descEn: 'Take five photographs inside the painting.', hintZh: '入画里的「影」，自由走位，找个好角度。', hintEn: 'The camera in the painting: roam free and find an angle.', goal: { kind: 'counter', key: 'photo', target: 5 }, reward: { seal: '取景', sealEn: 'Framing' } },
  { id: 'q-taoyuan', zh: '桃源记', en: 'The Peach Blossom Record', descZh: '循着瀑后的光，走进桃源，又走出来。', descEn: 'Follow the light behind the waterfall into the Peach Spring — and out again.', hintZh: '山寺的瀑布后面，仿佛有光。先读一读拾得的信。', hintEn: 'Behind the mountain temple\'s waterfall there seems to be light. Read Shide\'s letter first.', goal: { kind: 'flag', key: 'ty:b8' }, reward: { seal: '桃源', sealEn: 'Peach Spring' } },
  { id: 'q-mingcha', zh: '落花为证', en: 'The Petals Bear Witness', descZh: '断明桃源花朝失印一案。', descEn: 'Solve the case of the seal lost on Flower-Festival night in the Peach Spring.', hintZh: '香会说谎，花不会。', hintEn: 'Incense can lie. Petals cannot.', goal: { kind: 'flag', key: 'case:hz:solved' }, reward: { seal: '明察', sealEn: 'Clear-Sighted' } },
  { id: 'q-pet', zh: '爱物', en: 'Beloved', descZh: '抚摸家园里的小动物十次。', descEn: 'Stroke your homestead\'s animals ten times.', hintZh: '先在家园里安一个窝，再领养。', hintEn: 'Place a pet home at your homestead, then adopt.', goal: { kind: 'counter', key: 'home-pet', target: 10 }, reward: { seal: '爱物', sealEn: 'Beloved' } },
];

export const QUEST: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/** Daily errands (日课): three are drawn each day; small, cheerful, and optional. */
export interface DailyDef { id: string; zh: string; en: string; key: string; target: number }
export const DAILY_POOL: DailyDef[] = [
  { id: 'd-water', zh: '浇一次花', en: 'Water a plant', key: 'water', target: 1 },
  { id: 'd-fish', zh: '钓一条鱼', en: 'Catch a fish', key: 'fish', target: 1 },
  { id: 'd-pot', zh: '投壶三中', en: 'Three pitch-pot hits', key: 'pitchpot', target: 3 },
  { id: 'd-game', zh: '下一局棋', en: 'Play a board game', key: 'boardgame', target: 1 },
  { id: 'd-incense', zh: '燃一炷香', en: 'Burn a stick of incense', key: 'incense', target: 1 },
  { id: 'd-visit', zh: '去两处风景', en: 'Visit two places', key: 'visits', target: 2 },
  { id: 'd-poem', zh: '赏一首诗', en: 'Admire a poem', key: 'admire', target: 1 },
  { id: 'd-cat', zh: '摸摸大橘', en: 'Pet Big Ginger', key: 'cat', target: 1 },
  { id: 'd-snake', zh: '吃十朵梅花', en: 'Eat ten blossoms in Snake', key: 'blossom', target: 10 },
  { id: 'd-lotus', zh: '采一枝莲', en: 'Pick a lotus pod', key: 'lotus', target: 1 },
];
