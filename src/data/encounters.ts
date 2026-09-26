// 奇遇 · Chance encounters in the painting: small stories that happen only at certain places and
// hours (or weather, or seasons), and play out differently depending on who you walk as.
// features/encounters/ brings them to life; the quest book's 奇遇录 lists them from here.
// A met encounter is remembered as play flag `qy:<id>` (markEncounter in app/play.ts).
import type { CharacterId } from './characters';
import type { RegionId } from '../views/walk/map';

export interface EncounterDef {
  id: string;
  zh: string;
  en: string;
  /** Where it can happen ('any' = anywhere out in the world). */
  region: RegionId | 'any';
  /** When: shown as a hint in the 奇遇录 before it is met. */
  hintZh: string;
  hintEn: string;
  /** One line for the 奇遇录 once met. */
  noteZh: string;
  noteEn: string;
  /** Companions who get their own version of it. */
  special: CharacterId[];
  /** Coins the first time it happens. */
  coins: number;
}

export const ENCOUNTERS: EncounterDef[] = [
  { id: 'zhiyin', zh: '知音', en: 'The One Who Understands', region: 'bamboo', hintZh: '白日竹林深处，有樵夫停斧而听——若有琴声，他必会来。', hintEn: 'By day, deep in the bamboo, a woodcutter rests his axe to listen — play the qin, and he will surely come.', noteZh: '伯牙鼓琴，子期听之：巍巍乎若高山，洋洋乎若流水。', noteEn: 'Boya played; Ziqi heard mountains in it, and flowing water.', special: ['musician', 'poet', 'cat'], coins: 120 },
  { id: 'lanke', zh: '观棋烂柯', en: 'The Rotten Axe-Handle', region: 'plum', hintZh: '黄昏的松下，两位老者对弈。', hintEn: 'Under a pine at dusk, two old men at a game of go.', noteZh: '一局未终，斧柯已烂；山中方七日，世上已千年。', noteEn: 'One game unfinished, the axe-handle rotted: seven days in the hills, a thousand years below.', special: ['player', 'cat', 'taoist'], coins: 150 },
  { id: 'laoyue', zh: '捞月', en: 'Scooping the Moon', region: 'lake', hintZh: '月夜荷塘，水中也有一轮月。', hintEn: 'A moonlit night on the lake — and a second moon in the water.', noteZh: '举杯邀明月，对影成三人。', noteEn: 'I raise my cup to invite the moon; with my shadow we are three.', special: ['poet', 'change', 'rabbit', 'fisher'], coins: 150 },
  { id: 'hujie', zh: '狐女借伞', en: 'The Fox Who Borrowed an Umbrella', region: 'bamboo', hintZh: '夜雨竹林，有人独立无伞。', hintEn: 'Rain at night in the bamboo; someone stands without an umbrella.', noteZh: '借伞一把，明日门前多了一篮山果。', noteEn: 'You lent an umbrella; next morning a basket of wild fruit sat at your gate.', special: ['taoist', 'cat', 'scholar'], coins: 100 },
  { id: 'xianhe', zh: '仙鹤引路', en: 'The Crane Who Showed the Way', region: 'plum', hintZh: '清晨梅岭，一只白鹤不肯飞远。', hintEn: 'Morning on Plum Ridge; a white crane will not fly far.', noteZh: '随鹤而行，得一处无人知晓的梅林。', noteEn: 'You followed the crane to a plum grove no one knew.', special: ['painter', 'change'], coins: 120 },
  { id: 'liuxing', zh: '流星', en: 'A Falling Star', region: 'any', hintZh: '晴夜抬头，偶有流星划过。', hintEn: 'On a clear night, look up — now and then a star falls.', noteZh: '对流星许了一个愿，没有告诉任何人。', noteEn: 'You made a wish on a falling star and told no one.', special: ['change', 'rabbit', 'poet'], coins: 80 },
  { id: 'shijin', zh: '拾金不昧', en: 'The Lost Purse', region: 'village', hintZh: '水乡街巷，地上有个鼓鼓的钱袋。', hintEn: 'In the water-town lanes, a fat purse lies on the ground.', noteZh: '钱袋物归原主，失主千恩万谢。', noteEn: 'The purse went back to its owner, who could not thank you enough.', special: ['guan', 'swordsman', 'cat'], coins: 100 },
  { id: 'hudie', zh: '庄周梦蝶', en: 'The Butterfly Dream', region: 'garden', hintZh: '晴日午后，一只金蝶绕着园子飞。', hintEn: 'On a sunny afternoon, a golden butterfly circles the garden.', noteZh: '不知周之梦为胡蝶与，胡蝶之梦为周与？', noteEn: 'Was it Zhuang Zhou dreaming he was a butterfly, or a butterfly dreaming it was Zhuang Zhou?', special: ['scholar', 'cat', 'rabbit'], coins: 100 },
  { id: 'kezhou', zh: '刻舟求剑', en: 'Marking the Boat', region: 'village', hintZh: '河上小船，有人在船舷上刻记号。', hintEn: 'On the river, a man cuts a mark on the side of his boat.', noteZh: '剑落水中，舟行而剑不行。', noteEn: 'The sword fell in; the boat moved on, the sword did not.', special: ['swordsman', 'fisher', 'scholar'], coins: 80 },
  { id: 'taohua', zh: '桃花源', en: 'The Peach Blossom Spring', region: 'mountain', hintZh: '山寺的拾得来信说，飞瀑之后仿佛有光——先读一读他的信。', hintEn: 'Shide of the mountain temple writes of a light behind the waterfall — read his letter first.', noteZh: '林尽水源，便得一山；山有小口，仿佛若有光。', noteEn: 'Where the grove ended at the spring there was a hill, and in it a small opening that seemed to hold light.', special: ['painter', 'poet', 'taoist'], coins: 200 },
  { id: 'zuixian', zh: '醉仙', en: 'The Drunken Immortal', region: 'village', hintZh: '夜里的茶楼，有位客人喝的不是茶。', hintEn: 'At the teahouse at night, one guest is not drinking tea.', noteZh: '与醉仙对饮三杯，他留下一句诗便不见了。', noteEn: 'Three cups with the drunken immortal; he left a line of verse and was gone.', special: ['poet', 'guan', 'musician'], coins: 120 },
  { id: 'mutong', zh: '牧童遥指', en: 'The Herd-Boy Points', region: 'any', hintZh: '白日行路，细雨里有骑牛的孩子在吹笛；清明时节最常见。', hintEn: 'On the road by day, in a fine drizzle, a child on an ox plays the flute — most often around Qingming.', noteZh: '借问酒家何处有？牧童遥指杏花村。', noteEn: '"Where might I find a tavern?" The herd-boy points far off, to Apricot Blossom Village.', special: ['poet', 'fisher', 'gardener'], coins: 80 },
  { id: 'hanshan', zh: '寒山拾得', en: 'Hanshan and Shide', region: 'mountain', hintZh: '寺前扫落叶的两位僧人，总是在笑。', hintEn: 'Two monks sweeping leaves before the temple, always laughing.', noteZh: '有人辱我、笑我，如何处之？只是忍他、让他、由他。', noteEn: '"If someone insults me, how should I bear it?" "Bear it, yield to it, let it be."', special: ['cat', 'taoist', 'guan'], coins: 100 },
  { id: 'yuelao', zh: '月下老人', en: 'The Old Man Under the Moon', region: 'lake', hintZh: '月夜玉带桥上，有位老人在理红线。', hintEn: 'On the moon bridge at night, an old man sorts red threads.', noteZh: '千里姻缘一线牵。', noteEn: 'A red thread ties two fates across a thousand miles.', special: ['change', 'rabbit', 'scholar'], coins: 100 },
];

export const ENCOUNTER: Record<string, EncounterDef> = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, e]));
