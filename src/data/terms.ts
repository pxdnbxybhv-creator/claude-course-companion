// Solar-term texts: names, pentads (七十二候), blurbs.
//
// Pentads follow 元·吴澄《月令七十二候集解》 in simplified characters, with the wording used by
// modern mainland references (中国气象局 二十四节气 pages) where they differ:
//   · 玄鸟至 / 玄鸟归 (the Qing text writes 元鸟 to avoid the Kangxi taboo on 玄)
//   · 小暑: 蟋蟀居宇 · 鹰始鸷 (集解: 蟋蟀居壁 · 鹰始击)
//   · 小寒: 雉始雊 (集解: 雉雊)
//   · 秋分: 蛰虫坯户 (集解: 坏户, read péi)
// Everything else is 集解 verbatim: 候雁北, 蜩始鸣, 白露降, 菊有黄华, 水始冰, 麋角解, 鸡乳 …
// Blurbs and all English renderings are our own.

export interface TermText {
  zh: string;       // 立春
  pinyin: string;   // lìchūn
  en: string;       // Start of Spring
  /** One poetic sentence about the season, ≤ 28 chars. */
  blurbZh: string;
  blurbEn: string;
  /** The three pentads (七十二候) of this term, in order. */
  pentads: { zh: string; en: string }[];
}

type Pentad = { zh: string; en: string };
const t = (zh: string, pinyin: string, en: string, blurbZh: string, blurbEn: string, pentads: [Pentad, Pentad, Pentad]): TermText =>
  ({ zh, pinyin, en, blurbZh, blurbEn, pentads });
const p = (zh: string, en: string): Pentad => ({ zh, en });

/** Index 0 = 立春 … 23 = 大寒, matching `src/core/solarterms.ts`. */
export const TERMS: TermText[] = [
  // ── 春 spring ──
  t('立春', 'lìchūn', 'Start of Spring',
    '东风先于花到，冰下之鱼已知春。',
    'The east wind arrives before the flowers; under the ice, the fish already know.',
    [p('东风解冻', 'The east wind loosens the ice'), p('蛰虫始振', 'Hibernating insects begin to stir'), p('鱼陟负冰', 'Fish rise, bearing the ice on their backs')]),
  t('雨水', 'yǔshuǐ', 'Rain Water',
    '雪化为雨，落得极轻，怕惊醒草根。',
    'Snow turns to rain and falls so lightly, as if afraid to wake the roots.',
    [p('獭祭鱼', 'Otters lay out their catch'), p('候雁北', 'Wild geese head north'), p('草木萌动', 'Grass and trees begin to bud')]),
  t('惊蛰', 'jīngzhé', 'Awakening of Insects',
    '一声春雷叩门，泥土里的梦都醒了。',
    'One peal of spring thunder knocks, and every dream under the soil wakes.',
    [p('桃始华', 'Peach trees begin to bloom'), p('仓庚鸣', 'Orioles sing'), p('鹰化为鸠', 'Hawks turn into cuckoos')]),
  t('春分', 'chūnfēn', 'Spring Equinox',
    '昼夜平分，燕子归来，认它的旧梁。',
    'Day and night weigh even; the swallows come back to find their old beams.',
    [p('玄鸟至', 'Swallows return'), p('雷乃发声', 'Thunder raises its voice'), p('始电', 'Lightning first flashes')]),
  t('清明', 'qīngmíng', 'Clear and Bright',
    '桐花初开，雨后新晴，天边一道淡虹。',
    'Paulownia in first flower, the rain just cleared — a faint rainbow at the edge of the sky.',
    [p('桐始华', 'Paulownia begins to flower'), p('田鼠化为鴽', 'Field mice turn into quails'), p('虹始见', 'Rainbows first appear')]),
  t('谷雨', 'gǔyǔ', 'Grain Rain',
    '雨生百谷，浮萍初绿，新茶正好。',
    'Rain begets the hundred grains; duckweed greens the pond, and the new tea is ready.',
    [p('萍始生', 'Duckweed begins to grow'), p('鸣鸠拂其羽', 'Cuckoos shake out their wings'), p('戴胜降于桑', 'Hoopoes alight on the mulberry')]),
  // ── 夏 summer ──
  t('立夏', 'lìxià', 'Start of Summer',
    '蛙声渐密，春天把门交给了夏天。',
    'Frog-song thickens; spring hands the door over to summer.',
    [p('蝼蝈鸣', 'Mole crickets chirp'), p('蚯蚓出', 'Earthworms surface'), p('王瓜生', 'Wild gourds begin to climb')]),
  t('小满', 'xiǎomǎn', 'Grain Buds',
    '麦粒将满未满。小满，恰是最好的分寸。',
    'The wheat is filling, not yet full. A lesser fullness is the finest measure.',
    [p('苦菜秀', 'Sow-thistle flowers'), p('靡草死', 'Fine grasses wither'), p('麦秋至', 'The wheat\'s autumn arrives')]),
  t('芒种', 'mángzhòng', 'Grain in Ear',
    '麦要收，稻要种，梅雨正在路上。',
    'Wheat to bring in, rice to plant, and the plum rains on their way.',
    [p('螳螂生', 'Mantises hatch'), p('鵙始鸣', 'Shrikes begin to call'), p('反舌无声', 'The mockingbird falls silent')]),
  t('夏至', 'xiàzhì', 'Summer Solstice',
    '白昼走到尽头，从此每天还给夜晚一点。',
    'Daylight has gone as far as it goes; from now on each day gives a little back to the night.',
    [p('鹿角解', 'Deer shed their antlers'), p('蜩始鸣', 'Cicadas begin to sing'), p('半夏生', 'Pinellia, the “half-summer” herb, sprouts')]),
  t('小暑', 'xiǎoshǔ', 'Minor Heat',
    '风也是温的，蟋蟀躲进了墙根。',
    'Even the wind is warm; the crickets retreat to the foot of the wall.',
    [p('温风至', 'Warm winds arrive'), p('蟋蟀居宇', 'Crickets shelter under the eaves'), p('鹰始鸷', 'Young hawks learn to strike')]),
  t('大暑', 'dàshǔ', 'Major Heat',
    '暑气蒸人，荷塘深处萤火提灯。',
    'The heat steams; deep in the lotus pond, fireflies carry their lanterns.',
    [p('腐草为萤', 'Rotting grass becomes fireflies'), p('土润溽暑', 'The earth is damp, the air sultry'), p('大雨时行', 'Great rains come in their season')]),
  // ── 秋 autumn ──
  t('立秋', 'lìqiū', 'Start of Autumn',
    '一叶梧桐落下，夜风忽然凉了一分。',
    'One paulownia leaf comes down, and the night wind turns a shade cooler.',
    [p('凉风至', 'Cool winds arrive'), p('白露降', 'White dew descends'), p('寒蝉鸣', 'Autumn cicadas sing')]),
  t('处暑', 'chǔshǔ', 'End of Heat',
    '暑气至此而止。天高了，稻穗低头。',
    'Here the heat stops. The sky grows higher, and the ripe grain bows its head.',
    [p('鹰乃祭鸟', 'Hawks set out their prey'), p('天地始肃', 'Heaven and earth grow austere'), p('禾乃登', 'Grain ripens for harvest')]),
  t('白露', 'báilù', 'White Dew',
    '草尖挑着晨露，雁字一行向南。',
    'Each blade of grass holds up a dewdrop; the geese write one line toward the south.',
    [p('鸿雁来', 'Wild geese arrive'), p('玄鸟归', 'Swallows fly home'), p('群鸟养羞', 'Birds lay in stores for winter')]),
  t('秋分', 'qiūfēn', 'Autumn Equinox',
    '昼夜再次平分，雷声收起，水面渐低。',
    'Day and night are even once more; thunder is put away, and the waters slowly fall.',
    [p('雷始收声', 'Thunder falls silent'), p('蛰虫坯户', 'Insects seal their burrows'), p('水始涸', 'Waters begin to recede')]),
  t('寒露', 'hánlù', 'Cold Dew',
    '露水凉得将要成霜，篱边菊花正黄。',
    'The dew is cold enough to turn to frost; by the hedge the chrysanthemums are gold.',
    [p('鸿雁来宾', 'The last geese arrive as guests'), p('雀入大水为蛤', 'Sparrows enter the sea and become clams'), p('菊有黄华', 'Chrysanthemums flower yellow')]),
  t('霜降', 'shuāngjiàng', 'Frost\'s Descent',
    '一夜清霜，草木都换上告别的颜色。',
    'One night of clear frost, and every plant puts on the colours of farewell.',
    [p('豺乃祭兽', 'Jackals set out their prey'), p('草木黄落', 'Leaves yellow and fall'), p('蛰虫咸俯', 'Insects lie low in dormancy')]),
  // ── 冬 winter ──
  t('立冬', 'lìdōng', 'Start of Winter',
    '水面初凝薄冰，万物开始收藏。',
    'A first skin of ice on the water; all things begin to put themselves away.',
    [p('水始冰', 'Water begins to freeze'), p('地始冻', 'The earth begins to freeze'), p('雉入大水为蜃', 'Pheasants enter the sea and become giant clams')]),
  t('小雪', 'xiǎoxuě', 'Minor Snow',
    '雪还小，炉火正好，可以温一壶酒。',
    'The snow is still slight, the stove just right for warming a pot of wine.',
    [p('虹藏不见', 'Rainbows hide away'), p('天气上升地气下降', 'Heaven\'s breath rises, earth\'s breath sinks'), p('闭塞而成冬', 'All is sealed, and winter settles in')]),
  t('大雪', 'dàxuě', 'Major Snow',
    '千山覆白，世界静得只剩落雪声。',
    'White over a thousand hills; the world so quiet only the falling snow is heard.',
    [p('鹖鴠不鸣', 'The night-crying bird falls silent'), p('虎始交', 'Tigers begin to court'), p('荔挺出', 'Iris shoots push through')]),
  t('冬至', 'dōngzhì', 'Winter Solstice',
    '最长的夜过去，阳气在地底悄悄回头。',
    'The longest night is over; deep underground, the light quietly turns back.',
    [p('蚯蚓结', 'Earthworms curl into knots'), p('麋角解', 'Elk shed their antlers'), p('水泉动', 'Springs stir underground')]),
  t('小寒', 'xiǎohán', 'Minor Cold',
    '寒意正深，喜鹊已衔枝筑巢。',
    'The cold is deepening, yet the magpies are already carrying twigs to build.',
    [p('雁北乡', 'Geese turn toward the north'), p('鹊始巢', 'Magpies begin to nest'), p('雉始雊', 'Pheasants begin to call')]),
  t('大寒', 'dàhán', 'Major Cold',
    '冷到极处，春天就在隔壁了。',
    'When the cold is at its deepest, spring is just next door.',
    [p('鸡乳', 'Hens begin to brood'), p('征鸟厉疾', 'Birds of prey fly fierce and swift'), p('水泽腹坚', 'Ice grips the marshes to their depths')]),
];

/** The text for term `index` (wraps, so -1 → 大寒). */
export function termText(index: number): TermText {
  return TERMS[((Math.floor(index) % 24) + 24) % 24];
}

/** The pentad (候) text for a term and pentad 0 | 1 | 2. */
export function pentadText(termIndex: number, pentad: number): { zh: string; en: string } {
  return termText(termIndex).pentads[Math.min(2, Math.max(0, Math.floor(pentad)))];
}

/** Ordinal labels for the three pentads: 初候 · 二候 · 三候. */
export const PENTAD_LABELS: readonly { zh: string; en: string }[] = [
  { zh: '初候', en: 'First pentad' },
  { zh: '二候', en: 'Second pentad' },
  { zh: '三候', en: 'Third pentad' },
];
