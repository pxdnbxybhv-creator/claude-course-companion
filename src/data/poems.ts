// Classical poetry (public domain), for check-ins, the almanac and the scroll.
// Every entry's text, title and author was checked against zh.wikisource / 古诗文网 / ctext.
// Lines are quoted in simplified characters with full-width punctuation; the English is our own.
import type { PlantKind } from '../core/types';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type PoemTheme =
  | 'diligence' | 'focus' | 'night' | 'morning' | 'rain' | 'snow' | 'moon'
  | 'garden' | 'water' | 'friendship' | 'time';

export interface Poem {
  /** One or two lines (a couplet), exactly as in the source, with full-width punctuation. */
  lines: string[];
  author: string;     // 朱熹
  dynasty: string;    // 宋
  title: string;      // 观书有感
  /** Our own brief English rendering. */
  en: string;
  authorEn: string;   // Zhu Xi
  /** Tags used to pick a fitting poem. */
  plants?: PlantKind[];
  terms?: number[];   // solar term indices 0..23
  seasons?: Season[];
  themes?: PoemTheme[];
}

const SPRING: Season[] = ['spring'];
const SUMMER: Season[] = ['summer'];
const AUTUMN: Season[] = ['autumn'];
const WINTER: Season[] = ['winter'];

export const POEMS: Poem[] = [
  // 0 — the app's namesake. Keep first.
  { lines: ['半亩方塘一鉴开，天光云影共徘徊。', '问渠那得清如许？为有源头活水来。'], author: '朱熹', dynasty: '宋', title: '观书有感', authorEn: 'Zhu Xi',
    en: 'A half-acre pond opens like a mirror; sky-light and cloud-shadow linger there together. How can it stay so clear? Because fresh water flows in from the source.',
    themes: ['water', 'diligence', 'garden'] },

  // ── 梅 plum ────────────────────────────────────────────────────────────────
  { lines: ['墙角数枝梅，凌寒独自开。', '遥知不是雪，为有暗香来。'], author: '王安石', dynasty: '宋', title: '梅花', authorEn: 'Wang Anshi',
    en: 'A few plum sprays in the corner by the wall open alone against the cold. Even from afar I know it is not snow — a hidden fragrance reaches me.',
    plants: ['plum'], seasons: WINTER, terms: [22], themes: ['snow', 'garden'] },
  { lines: ['疏影横斜水清浅，暗香浮动月黄昏。'], author: '林逋', dynasty: '宋', title: '山园小梅·其一', authorEn: 'Lin Bu',
    en: 'Sparse shadows lean across the clear, shallow water; a hidden scent drifts under the dusk moon.',
    plants: ['plum'], seasons: WINTER, terms: [23], themes: ['moon', 'water', 'garden'] },
  { lines: ['我家洗砚池头树，朵朵花开淡墨痕。', '不要人夸好颜色，只留清气满乾坤。'], author: '王冕', dynasty: '元', title: '墨梅', authorEn: 'Wang Mian',
    en: 'By the pond where I rinse my inkstone grows a tree; every blossom opens in pale ink. It asks no praise for pretty colour — only to leave its clear air filling heaven and earth.',
    plants: ['plum'], seasons: WINTER, themes: ['focus', 'water'] },
  { lines: ['无意苦争春，一任群芳妒。', '零落成泥碾作尘，只有香如故。'], author: '陆游', dynasty: '宋', title: '卜算子·咏梅', authorEn: 'Lu You',
    en: 'It has no wish to vie for spring; let the other flowers envy as they will. Fallen into mud, ground into dust — only its fragrance stays the same.',
    plants: ['plum'], seasons: WINTER, themes: ['diligence'] },
  { lines: ['梅雪争春未肯降，骚人阁笔费评章。', '梅须逊雪三分白，雪却输梅一段香。'], author: '卢梅坡', dynasty: '宋', title: '雪梅·其一', authorEn: 'Lu Meipo',
    en: 'Plum and snow both claim the spring and neither will yield; the poet lays down his brush, unable to judge. The plum must grant the snow a shade more white — the snow must grant the plum its breath of scent.',
    plants: ['plum'], seasons: WINTER, terms: [20, 23], themes: ['snow'] },
  { lines: ['君自故乡来，应知故乡事。', '来日绮窗前，寒梅著花未？'], author: '王维', dynasty: '唐', title: '杂诗三首·其二', authorEn: 'Wang Wei',
    en: 'You have come from our old home; you must know how things are there. The day you left, by the latticed window — had the winter plum begun to flower?',
    plants: ['plum'], seasons: WINTER, themes: ['friendship'] },
  { lines: ['折花逢驿使，寄与陇头人。', '江南无所有，聊赠一枝春。'], author: '陆凯', dynasty: '南北朝', title: '赠范晔诗', authorEn: 'Lu Kai',
    en: 'Breaking off a blossom, I meet the courier and send it to you at the frontier. South of the river I have nothing else — so here, a single branch of spring.',
    plants: ['plum'], seasons: WINTER, terms: [0], themes: ['friendship'] },
  { lines: ['寒夜客来茶当酒，竹炉汤沸火初红。', '寻常一样窗前月，才有梅花便不同。'], author: '杜耒', dynasty: '宋', title: '寒夜', authorEn: 'Du Lei',
    en: 'A guest on a cold night — tea stands in for wine; the bamboo stove hums, its coals just glowing. The same moon at the window as ever, yet with plum blossom there, it is not the same.',
    plants: ['plum'], seasons: WINTER, terms: [23], themes: ['night', 'moon', 'friendship'] },
  { lines: ['前村深雪里，昨夜一枝开。'], author: '齐己', dynasty: '唐', title: '早梅', authorEn: 'Qiji',
    en: 'In the deep snow beyond the village, one branch opened last night.',
    plants: ['plum'], seasons: WINTER, terms: [21], themes: ['snow', 'night'] },

  // ── 兰 orchid ──────────────────────────────────────────────────────────────
  { lines: ['谁知林栖者，闻风坐相悦。', '草木有本心，何求美人折？'], author: '张九龄', dynasty: '唐', title: '感遇十二首·其一', authorEn: 'Zhang Jiuling',
    en: 'Who would think the hermits of the woods, catching their scent on the wind, would come to love them? Plants have their own true hearts; they do not ask a beauty to pick them.',
    plants: ['orchid'], themes: ['focus'] },
  { lines: ['兰若生春夏，芊蔚何青青。', '幽独空林色，朱蕤冒紫茎。'], author: '陈子昂', dynasty: '唐', title: '感遇·其二', authorEn: 'Chen Zi\'ang',
    en: 'Orchid and pollia grow in spring and summer, lush and deep green; alone in the empty wood they are its colour, red tassels crowning purple stems.',
    plants: ['orchid'], seasons: ['spring', 'summer'], themes: ['garden'] },
  { lines: ['春兰如美人，不采羞自献。', '时闻风露香，蓬艾深不见。'], author: '苏轼', dynasty: '宋', title: '题杨次公春兰', authorEn: 'Su Shi',
    en: 'A spring orchid is like a gracious lady: unpicked, too shy to offer herself. Now and then her scent comes on the dewy wind, hidden deep among the weeds.',
    plants: ['orchid'], seasons: SPRING },
  { lines: ['扈江离与辟芷兮，纫秋兰以为佩。'], author: '屈原', dynasty: '先秦', title: '离骚', authorEn: 'Qu Yuan',
    en: 'I wrap myself in angelica and lovage, and thread autumn orchids for a pendant.',
    plants: ['orchid'], seasons: AUTUMN },
  { lines: ['芝兰生于深林，不以无人而不芳。'], author: '孔子', dynasty: '先秦', title: '孔子家语·在厄', authorEn: 'Confucius',
    en: 'The orchid grows in the deep forest, and is no less fragrant for having no one near.',
    plants: ['orchid'], themes: ['focus', 'diligence'] },
  { lines: ['与善人居，如入芝兰之室，久而不闻其香，即与之化矣。'], author: '孔子', dynasty: '先秦', title: '孔子家语·六本', authorEn: 'Confucius',
    en: 'Living among good people is like entering a room of orchids: after a while you no longer notice the scent, for you have taken it on.',
    plants: ['orchid'], themes: ['friendship'] },
  { lines: ['兰生幽谷无人识，客种东轩遗我香。'], author: '苏辙', dynasty: '宋', title: '种兰', authorEn: 'Su Zhe',
    en: 'Orchids grow in hidden valleys, known to no one; a guest planted some by my east window and left me their fragrance.',
    plants: ['orchid'], seasons: SPRING, themes: ['garden', 'friendship'] },
  { lines: ['手培兰蕙两三栽，日暖风微次第开。', '坐久不知香在室，推窗时有蝶飞来。'], author: '余同麓', dynasty: '元', title: '咏兰', authorEn: 'Yu Tonglu',
    en: 'I have planted two or three orchids by hand; in warm sun and a light breeze they open one by one. Sitting long, I stop noticing the scent in the room — till I open the window and butterflies come in.',
    plants: ['orchid'], seasons: SPRING, themes: ['focus', 'garden'] },
  { lines: ['能白更兼黄，无人亦自芳。', '寸心原不大，容得许多香。'], author: '张羽', dynasty: '明', title: '兰室五咏·其五', authorEn: 'Zhang Yu',
    en: 'White, and yellow too; fragrant even with no one near. Its little heart is not large, yet holds so much scent.',
    plants: ['orchid'], themes: ['focus'] },

  // ── 竹 bamboo ──────────────────────────────────────────────────────────────
  { lines: ['咬定青山不放松，立根原在破岩中。', '千磨万击还坚劲，任尔东西南北风。'], author: '郑燮', dynasty: '清', title: '竹石', authorEn: 'Zheng Xie',
    en: 'It bites into the green mountain and will not let go, its roots set deep in a split rock. Ground a thousand times, struck ten thousand, it stands firm still — let the wind blow from east, west, south or north.',
    plants: ['bamboo'], themes: ['diligence'] },
  { lines: ['独坐幽篁里，弹琴复长啸。', '深林人不知，明月来相照。'], author: '王维', dynasty: '唐', title: '竹里馆', authorEn: 'Wang Wei',
    en: 'Sitting alone in the dark bamboo, I play the qin and whistle long. Deep in the wood no one knows — only the bright moon comes to shine on me.',
    plants: ['bamboo'], themes: ['focus', 'moon', 'night'] },
  { lines: ['可使食无肉，不可使居无竹。', '无肉令人瘦，无竹令人俗。'], author: '苏轼', dynasty: '宋', title: '於潜僧绿筠轩', authorEn: 'Su Shi',
    en: 'One may dine without meat, but not dwell without bamboo. No meat makes one thin; no bamboo makes one coarse.',
    plants: ['bamboo'], themes: ['garden'] },
  { lines: ['竹外桃花三两枝，春江水暖鸭先知。'], author: '苏轼', dynasty: '宋', title: '惠崇春江晚景·其一', authorEn: 'Su Shi',
    en: 'Beyond the bamboo, two or three sprays of peach blossom; the ducks are first to know the spring river has warmed.',
    plants: ['bamboo'], seasons: SPRING, terms: [2, 3], themes: ['water'] },
  { lines: ['竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。'], author: '苏轼', dynasty: '宋', title: '定风波', authorEn: 'Su Shi',
    en: 'Bamboo staff and straw sandals, lighter than a horse — who\'s afraid? A straw cape in the misty rain, I take my life as it comes.',
    plants: ['bamboo'], seasons: SPRING, themes: ['rain'] },
  { lines: ['瞻彼淇奥，绿竹猗猗。', '有匪君子，如切如磋，如琢如磨。'], author: '佚名', dynasty: '先秦', title: '诗经·卫风·淇奥', authorEn: 'Anonymous (Book of Songs)',
    en: 'Look at the bend of the Qi, its green bamboo so graceful. There is a gentleman of culture — as if cut and filed, as if carved and polished.',
    plants: ['bamboo'], themes: ['diligence', 'water'] },
  { lines: ['已讶衾枕冷，复见窗户明。', '夜深知雪重，时闻折竹声。'], author: '白居易', dynasty: '唐', title: '夜雪', authorEn: 'Bai Juyi',
    en: 'Surprised that the quilt and pillow are cold, I see the window glowing. Deep in the night I know the snow is heavy — now and then, the crack of bamboo.',
    plants: ['bamboo'], seasons: WINTER, terms: [20], themes: ['snow', 'night'] },
  { lines: ['荷风送香气，竹露滴清响。'], author: '孟浩然', dynasty: '唐', title: '夏日南亭怀辛大', authorEn: 'Meng Haoran',
    en: 'Wind off the lotus brings its fragrance; dew drips from the bamboo with a clear sound.',
    plants: ['lotus', 'bamboo'], seasons: SUMMER, terms: [10], themes: ['night', 'focus', 'friendship'] },
  { lines: ['庭下如积水空明，水中藻、荇交横，盖竹柏影也。', '何夜无月？何处无竹柏？但少闲人如吾两人者耳。'], author: '苏轼', dynasty: '宋', title: '记承天寺夜游', authorEn: 'Su Shi',
    en: 'The courtyard was like a pool of clear water, with weeds criss-crossing in it — the shadows of bamboo and cypress. What night has no moon? Where is there no bamboo or cypress? Only, few are idle enough to see it, as we two are.',
    plants: ['bamboo'], seasons: WINTER, terms: [18], themes: ['moon', 'night', 'friendship'] },
  { lines: ['竹坞无尘水槛清，相思迢递隔重城。', '秋阴不散霜飞晚，留得枯荷听雨声。'], author: '李商隐', dynasty: '唐', title: '宿骆氏亭寄怀崔雍崔衮', authorEn: 'Li Shangyin',
    en: 'The bamboo cove is dustless, the railings by the water clean; my thoughts of you cross wall after wall. Autumn clouds will not lift, the frost comes late — the withered lotus is left to hear the rain.',
    plants: ['bamboo', 'lotus'], seasons: AUTUMN, terms: [16], themes: ['rain', 'friendship', 'water'] },
  { lines: ['竹深树密虫鸣处，时有微凉不是风。'], author: '杨万里', dynasty: '宋', title: '夏夜追凉', authorEn: 'Yang Wanli',
    en: 'Where bamboo is deep, trees dense and insects sing, a faint coolness comes now and then — not from any wind.',
    plants: ['bamboo'], seasons: SUMMER, terms: [11], themes: ['night', 'focus'] },

  // ── 菊 chrysanthemum ───────────────────────────────────────────────────────
  { lines: ['采菊东篱下，悠然见南山。', '山气日夕佳，飞鸟相与还。'], author: '陶渊明', dynasty: '东晋', title: '饮酒·其五', authorEn: 'Tao Yuanming',
    en: 'Picking chrysanthemums by the eastern hedge, I see the southern hills, at ease. The mountain air is lovely at dusk; birds fly home together.',
    plants: ['chrysanthemum'], seasons: AUTUMN, terms: [16], themes: ['focus', 'garden'] },
  { lines: ['秋丛绕舍似陶家，遍绕篱边日渐斜。', '不是花中偏爱菊，此花开尽更无花。'], author: '元稹', dynasty: '唐', title: '菊花', authorEn: 'Yuan Zhen',
    en: 'Autumn clumps ring the cottage as at Tao\'s house; I circle the hedge till the sun slants low. Not that I love the chrysanthemum best of flowers — but when it is done, there are no flowers left.',
    plants: ['chrysanthemum'], seasons: AUTUMN, terms: [17], themes: ['garden', 'time'] },
  { lines: ['开轩面场圃，把酒话桑麻。', '待到重阳日，还来就菊花。'], author: '孟浩然', dynasty: '唐', title: '过故人庄', authorEn: 'Meng Haoran',
    en: 'We open the window on the threshing floor and garden, and talk of mulberry and hemp over wine. When the Double Ninth comes, I\'ll be back for the chrysanthemums.',
    plants: ['chrysanthemum'], seasons: AUTUMN, terms: [16], themes: ['friendship', 'garden'] },
  { lines: ['东篱把酒黄昏后，有暗香盈袖。', '莫道不销魂，帘卷西风，人比黄花瘦。'], author: '李清照', dynasty: '宋', title: '醉花阴', authorEn: 'Li Qingzhao',
    en: 'Wine by the eastern hedge after dusk, a hidden fragrance filling my sleeves. Do not say it leaves no ache: the west wind lifts the blind — I am thinner than the yellow flowers.',
    plants: ['chrysanthemum'], seasons: AUTUMN, terms: [16], themes: ['night'] },
  { lines: ['荷尽已无擎雨盖，菊残犹有傲霜枝。', '一年好景君须记，最是橙黄橘绿时。'], author: '苏轼', dynasty: '宋', title: '赠刘景文', authorEn: 'Su Shi',
    en: 'The lotus is gone, no leaf left to hold up the rain; the chrysanthemum fades, yet its stems still defy the frost. Remember, friend, the best scene of the year: when oranges are gold and tangerines still green.',
    plants: ['chrysanthemum', 'lotus'], seasons: ['autumn', 'winter'], terms: [17, 18], themes: ['friendship', 'time'] },
  { lines: ['花开不并百花丛，独立疏篱趣未穷。', '宁可枝头抱香死，何曾吹落北风中。'], author: '郑思肖', dynasty: '宋', title: '寒菊', authorEn: 'Zheng Sixiao',
    en: 'It blooms apart from the crowd of flowers, alone by a sparse hedge, its delight unspent. It would rather die on the branch, holding its scent, than be blown down in the north wind.',
    plants: ['chrysanthemum'], seasons: AUTUMN, terms: [17], themes: ['diligence'] },
  { lines: ['尘世难逢开口笑，菊花须插满头归。'], author: '杜牧', dynasty: '唐', title: '九日齐山登高', authorEn: 'Du Mu',
    en: 'In this dusty world a good laugh is rare — so come home with chrysanthemums tucked all over your hair.',
    plants: ['chrysanthemum'], seasons: AUTUMN, terms: [16], themes: ['friendship'] },
  { lines: ['芳菊开林耀，青松冠岩列。'], author: '陶渊明', dynasty: '东晋', title: '和郭主簿·其二', authorEn: 'Tao Yuanming',
    en: 'Fragrant chrysanthemums light up the woods; green pines crown the ranks of cliffs.',
    plants: ['chrysanthemum', 'pine'], seasons: AUTUMN, terms: [17] },
  { lines: ['朝饮木兰之坠露兮，夕餐秋菊之落英。'], author: '屈原', dynasty: '先秦', title: '离骚', authorEn: 'Qu Yuan',
    en: 'At dawn I drink dew fallen from the magnolia; at dusk I dine on the dropped petals of autumn chrysanthemums.',
    plants: ['chrysanthemum'], seasons: AUTUMN, themes: ['morning'] },

  // ── 松 pine ────────────────────────────────────────────────────────────────
  { lines: ['空山新雨后，天气晚来秋。', '明月松间照，清泉石上流。'], author: '王维', dynasty: '唐', title: '山居秋暝', authorEn: 'Wang Wei',
    en: 'In the empty hills after fresh rain, evening air turns to autumn. The bright moon shines between the pines; a clear spring runs over the stones.',
    plants: ['pine'], seasons: AUTUMN, terms: [12, 13], themes: ['moon', 'rain', 'water', 'night'] },
  { lines: ['冰霜正惨凄，终岁常端正。', '岂不罹凝寒？松柏有本性。'], author: '刘桢', dynasty: '汉', title: '赠从弟·其二', authorEn: 'Liu Zhen',
    en: 'Ice and frost are bitter now, yet all year it stands upright. Does it not suffer the hard cold? It is the nature of pine and cypress.',
    plants: ['pine'], seasons: WINTER, themes: ['diligence', 'snow'] },
  { lines: ['岁寒，然后知松柏之后凋也。'], author: '孔子', dynasty: '先秦', title: '论语·子罕', authorEn: 'Confucius',
    en: 'Only when the year turns cold do we know that pine and cypress are the last to wither.',
    plants: ['pine'], seasons: WINTER, terms: [22, 23], themes: ['diligence'] },
  { lines: ['松下问童子，言师采药去。', '只在此山中，云深不知处。'], author: '贾岛', dynasty: '唐', title: '寻隐者不遇', authorEn: 'Jia Dao',
    en: 'Under the pine I ask the boy; he says his master is off gathering herbs — somewhere on this mountain, the clouds too deep to know where.',
    plants: ['pine'], themes: ['focus'] },
  { lines: ['为我一挥手，如听万壑松。', '客心洗流水，余响入霜钟。'], author: '李白', dynasty: '唐', title: '听蜀僧濬弹琴', authorEn: 'Li Bai',
    en: 'He sweeps his hand across the strings for me — like hearing pines in ten thousand ravines. The traveller\'s heart is washed as by running water; the last notes merge with the frosty bell.',
    plants: ['pine'], seasons: AUTUMN, themes: ['focus', 'water'] },
  { lines: ['自小刺头深草里，而今渐觉出蓬蒿。', '时人不识凌云木，直待凌云始道高。'], author: '杜荀鹤', dynasty: '唐', title: '小松', authorEn: 'Du Xunhe',
    en: 'From a bristly sprout deep in the grass, it has slowly risen above the weeds. People do not see a cloud-touching tree in it — until it touches the clouds, and then they call it tall.',
    plants: ['pine'], themes: ['diligence', 'garden'] },
  { lines: ['松风吹解带，山月照弹琴。'], author: '王维', dynasty: '唐', title: '酬张少府', authorEn: 'Wang Wei',
    en: 'Pine wind loosens my sash; the mountain moon shines on my qin.',
    plants: ['pine'], themes: ['focus', 'moon', 'night'] },
  { lines: ['山中习静观朝槿，松下清斋折露葵。'], author: '王维', dynasty: '唐', title: '积雨辋川庄作', authorEn: 'Wang Wei',
    en: 'In the hills I practise stillness, watching the morning hibiscus; under the pines, a plain meal of dew-wet mallow.',
    plants: ['pine'], seasons: SUMMER, terms: [10], themes: ['focus', 'morning', 'rain'] },
  { lines: ['怀君属秋夜，散步咏凉天。', '山空松子落，幽人应未眠。'], author: '韦应物', dynasty: '唐', title: '秋夜寄邱员外', authorEn: 'Wei Yingwu',
    en: 'Thinking of you this autumn night, I stroll and hum in the cool air. In the empty hills pine cones fall; my hermit friend must still be awake.',
    plants: ['pine'], seasons: AUTUMN, terms: [14], themes: ['night', 'friendship'] },

  // ── 荷 lotus ───────────────────────────────────────────────────────────────
  { lines: ['毕竟西湖六月中，风光不与四时同。', '接天莲叶无穷碧，映日荷花别样红。'], author: '杨万里', dynasty: '宋', title: '晓出净慈寺送林子方·其二', authorEn: 'Yang Wanli',
    en: 'West Lake in the sixth month, after all, is like no other season. Lotus leaves stretch green to the sky without end; lotus flowers glow a red all their own in the sun.',
    plants: ['lotus'], seasons: SUMMER, terms: [11], themes: ['water', 'morning', 'friendship'] },
  { lines: ['泉眼无声惜细流，树阴照水爱晴柔。', '小荷才露尖尖角，早有蜻蜓立上头。'], author: '杨万里', dynasty: '宋', title: '小池', authorEn: 'Yang Wanli',
    en: 'The spring-eye, silent, spares its thin trickle; tree-shade on the water loves the soft sunlight. A young lotus has barely shown its pointed tip — and already a dragonfly stands on top.',
    plants: ['lotus'], seasons: SUMMER, terms: [6], themes: ['water', 'garden'] },
  { lines: ['予独爱莲之出淤泥而不染，濯清涟而不妖。'], author: '周敦颐', dynasty: '宋', title: '爱莲说', authorEn: 'Zhou Dunyi',
    en: 'I alone love the lotus: it rises from the mud unstained, and is washed by clear ripples without being showy.',
    plants: ['lotus'], seasons: SUMMER, themes: ['water', 'diligence'] },
  { lines: ['清水出芙蓉，天然去雕饰。'], author: '李白', dynasty: '唐', title: '经乱离后天恩流夜郎忆旧游书怀赠江夏韦太守良宰', authorEn: 'Li Bai',
    en: 'A lotus rising from clear water — natural, with no carving or ornament.',
    plants: ['lotus'], seasons: SUMMER, themes: ['water'] },
  { lines: ['江南可采莲，莲叶何田田。鱼戏莲叶间。'], author: '佚名', dynasty: '汉', title: '江南', authorEn: 'Anonymous (Han yuefu)',
    en: 'South of the river we gather lotus — how the lotus leaves spread! Fish play among the leaves.',
    plants: ['lotus'], seasons: SUMMER, terms: [9], themes: ['water'] },
  { lines: ['兴尽晚回舟，误入藕花深处。', '争渡，争渡，惊起一滩鸥鹭。'], author: '李清照', dynasty: '宋', title: '如梦令', authorEn: 'Li Qingzhao',
    en: 'Our pleasure spent, rowing home late, we strayed deep into the lotus. Row hard, row hard — and startled a whole shoal of gulls and egrets into the air.',
    plants: ['lotus'], seasons: SUMMER, themes: ['water'] },
  { lines: ['叶上初阳干宿雨，水面清圆，一一风荷举。'], author: '周邦彦', dynasty: '宋', title: '苏幕遮', authorEn: 'Zhou Bangyan',
    en: 'First sun dries last night\'s rain on the leaves; clean and round on the water, one by one the lotus lift in the wind.',
    plants: ['lotus'], seasons: SUMMER, terms: [9], themes: ['morning', 'rain', 'water'] },
  { lines: ['月明船笛参差起，风定池莲自在香。'], author: '秦观', dynasty: '宋', title: '纳凉', authorEn: 'Qin Guan',
    en: 'Under a bright moon, boat flutes rise here and there; the wind drops, and the pond lotus gives its scent at ease.',
    plants: ['lotus'], seasons: SUMMER, terms: [11], themes: ['moon', 'night', 'water'] },

  // ── 节气 the turning year ─────────────────────────────────────────────────
  { lines: ['律回岁晚冰霜少，春到人间草木知。', '便觉眼前生意满，东风吹水绿参差。'], author: '张栻', dynasty: '宋', title: '立春偶成', authorEn: 'Zhang Shi',
    en: 'The year\'s pitch turns; late in the year, ice and frost thin. Spring reaches the world and the plants know it. All at once the eyes are full of life — the east wind ruffles the water into uneven green.',
    seasons: SPRING, terms: [0], themes: ['water', 'time'] },
  { lines: ['好雨知时节，当春乃发生。', '随风潜入夜，润物细无声。'], author: '杜甫', dynasty: '唐', title: '春夜喜雨', authorEn: 'Du Fu',
    en: 'A good rain knows its season; it arrives just as spring begins. It slips in with the wind by night, moistening all things, fine and without a sound.',
    seasons: SPRING, terms: [1], themes: ['rain', 'night'] },
  { lines: ['天街小雨润如酥，草色遥看近却无。', '最是一年春好处，绝胜烟柳满皇都。'], author: '韩愈', dynasty: '唐', title: '早春呈水部张十八员外·其一', authorEn: 'Han Yu',
    en: 'Light rain on the capital\'s streets, soft as cream; the grass shows green from afar, and vanishes up close. This is the best of the spring — far better than misty willows filling the city.',
    seasons: SPRING, terms: [1], themes: ['rain'] },
  { lines: ['微雨众卉新，一雷惊蛰始。', '田家几日闲，耕种从此起。'], author: '韦应物', dynasty: '唐', title: '观田家', authorEn: 'Wei Yingwu',
    en: 'A light rain freshens every plant; one peal of thunder, and the Waking of Insects begins. How many idle days does a farm have? From now on, the ploughing starts.',
    seasons: SPRING, terms: [2], themes: ['rain', 'diligence'] },
  { lines: ['两个黄鹂鸣翠柳，一行白鹭上青天。'], author: '杜甫', dynasty: '唐', title: '绝句四首·其三', authorEn: 'Du Fu',
    en: 'Two orioles sing in the green willow; a line of white egrets climbs the blue sky.',
    seasons: SPRING, terms: [2], themes: ['morning'] },
  { lines: ['沾衣欲湿杏花雨，吹面不寒杨柳风。'], author: '志南', dynasty: '宋', title: '绝句', authorEn: 'Zhinan',
    en: 'Apricot-blossom rain that almost wets my robe; willow wind on my face that is not cold.',
    seasons: SPRING, terms: [3, 4], themes: ['rain'] },
  { lines: ['江畔何人初见月？江月何年初照人？'], author: '张若虚', dynasty: '唐', title: '春江花月夜', authorEn: 'Zhang Ruoxu',
    en: 'Who on this shore first saw the moon? In what year did the river moon first shine on a person?',
    seasons: SPRING, terms: [3], themes: ['moon', 'time', 'water', 'night'] },
  { lines: ['清明时节雨纷纷，路上行人欲断魂。', '借问酒家何处有？牧童遥指杏花村。'], author: '杜牧', dynasty: '唐', title: '清明', authorEn: 'Du Mu',
    en: 'At Qingming the rain falls thick and fine; travellers on the road are near heartbreak. Where might there be a tavern? A herd-boy points far off to Apricot Blossom Village.',
    seasons: SPRING, terms: [4], themes: ['rain'] },
  { lines: ['梨花淡白柳深青，柳絮飞时花满城。', '惆怅东栏一株雪，人生看得几清明。'], author: '苏轼', dynasty: '宋', title: '东栏梨花', authorEn: 'Su Shi',
    en: 'Pear blossom pale white, willows deep green; when catkins fly, flowers fill the town. Sad for the tree of snow by the east railing — how many Qingmings does a life get to see?',
    seasons: SPRING, terms: [4], themes: ['time', 'garden'] },
  { lines: ['休对故人思故国，且将新火试新茶。', '诗酒趁年华。'], author: '苏轼', dynasty: '宋', title: '望江南·超然台作', authorEn: 'Su Shi',
    en: 'Do not pine for home before old friends; light the new fire and try the new tea. Poetry and wine — while the years are good.',
    seasons: SPRING, terms: [4, 5], themes: ['time', 'friendship'] },
  { lines: ['小楼一夜听春雨，深巷明朝卖杏花。'], author: '陆游', dynasty: '宋', title: '临安春雨初霁', authorEn: 'Lu You',
    en: 'All night in a small upstairs room I listen to spring rain; tomorrow morning, down the deep lane, someone will be selling apricot blossom.',
    seasons: SPRING, terms: [4], themes: ['rain', 'night', 'morning'] },
  { lines: ['独怜幽草涧边生，上有黄鹂深树鸣。', '春潮带雨晚来急，野渡无人舟自横。'], author: '韦应物', dynasty: '唐', title: '滁州西涧', authorEn: 'Wei Yingwu',
    en: 'I love the quiet grass by the stream, and orioles singing deep in the trees above. The spring tide, swelled by rain, runs fast at dusk; at the wild ferry, no one — the boat swings crosswise on its own.',
    seasons: SPRING, terms: [5], themes: ['rain', 'water', 'focus'] },
  { lines: ['人间四月芳菲尽，山寺桃花始盛开。', '长恨春归无觅处，不知转入此中来。'], author: '白居易', dynasty: '唐', title: '大林寺桃花', authorEn: 'Bai Juyi',
    en: 'In the fourth month the world\'s blossoms are over, but at the mountain temple the peach has just burst open. I long lamented spring had gone with no trace — not knowing it had come up here.',
    seasons: SPRING, terms: [5], themes: ['time'] },
  { lines: ['绿遍山原白满川，子规声里雨如烟。', '乡村四月闲人少，才了蚕桑又插田。'], author: '翁卷', dynasty: '宋', title: '乡村四月', authorEn: 'Weng Juan',
    en: 'Green over the hills, white water filling the plain; the cuckoo calls through rain like mist. In the fourth month few are idle in the village: silkworms done, then the rice to plant.',
    seasons: SUMMER, terms: [7], themes: ['rain', 'diligence'] },
  { lines: ['绿树阴浓夏日长，楼台倒影入池塘。', '水精帘动微风起，满架蔷薇一院香。'], author: '高骈', dynasty: '唐', title: '山亭夏日', authorEn: 'Gao Pian',
    en: 'Green trees in deep shade, the summer day long; towers and terraces reflected in the pond. A crystal blind stirs as a breeze rises — a trellis of roses scents the whole courtyard.',
    seasons: SUMMER, terms: [6], themes: ['garden', 'water'] },
  { lines: ['夜来南风起，小麦覆陇黄。'], author: '白居易', dynasty: '唐', title: '观刈麦', authorEn: 'Bai Juyi',
    en: 'In the night the south wind rose; the wheat lies yellow over the ridges.',
    seasons: SUMMER, terms: [7], themes: ['diligence'] },
  { lines: ['时雨及芒种，四野皆插秧。', '家家麦饭美，处处菱歌长。'], author: '陆游', dynasty: '宋', title: '时雨', authorEn: 'Lu You',
    en: 'Seasonable rain arrives with Grain in Ear; in every field they are planting out rice. In every house the wheat-rice is good; everywhere the water-chestnut songs run long.',
    seasons: SUMMER, terms: [8], themes: ['rain', 'diligence'] },
  { lines: ['黄梅时节家家雨，青草池塘处处蛙。', '有约不来过夜半，闲敲棋子落灯花。'], author: '赵师秀', dynasty: '宋', title: '约客', authorEn: 'Zhao Shixiu',
    en: 'Plum-rain season — rain on every house; frogs in every grassy pond. My guest has not come, though it is past midnight; idly I tap a go stone, and the lamp-wick drops its flower.',
    seasons: SUMMER, terms: [8, 9], themes: ['rain', 'night', 'friendship', 'focus'] },
  { lines: ['黑云翻墨未遮山，白雨跳珠乱入船。', '卷地风来忽吹散，望湖楼下水如天。'], author: '苏轼', dynasty: '宋', title: '六月二十七日望湖楼醉书·其一', authorEn: 'Su Shi',
    en: 'Black cloud spills like ink, not yet hiding the hills; white rain leaps like pearls into the boat. A wind sweeps the ground and scatters it all — below the Lake-View Tower, the water is like sky.',
    seasons: SUMMER, terms: [10, 11], themes: ['rain', 'water'] },
  { lines: ['乳鸦啼散玉屏空，一枕新凉一扇风。', '睡起秋声无觅处，满阶梧叶月明中。'], author: '刘翰', dynasty: '宋', title: '立秋', authorEn: 'Liu Han',
    en: 'The young crows have cawed and gone; the jade screen stands empty — a pillow of new coolness, a fan of breeze. Waking, I can find no sound of autumn: only paulownia leaves on every step, in the moonlight.',
    seasons: AUTUMN, terms: [12], themes: ['moon', 'night'] },
  { lines: ['天阶夜色凉如水，卧看牵牛织女星。'], author: '杜牧', dynasty: '唐', title: '秋夕', authorEn: 'Du Mu',
    en: 'The night on the palace steps is cool as water; lying back, she watches the Herd-boy and the Weaver stars.',
    seasons: AUTUMN, terms: [13], themes: ['night'] },
  { lines: ['露从今夜白，月是故乡明。'], author: '杜甫', dynasty: '唐', title: '月夜忆舍弟', authorEn: 'Du Fu',
    en: 'From tonight the dew turns white; the moon is brightest over home.',
    seasons: AUTUMN, terms: [14], themes: ['moon', 'night', 'friendship'] },
  { lines: ['蒹葭苍苍，白露为霜。', '所谓伊人，在水一方。'], author: '佚名', dynasty: '先秦', title: '诗经·秦风·蒹葭', authorEn: 'Anonymous (Book of Songs)',
    en: 'The reeds are grey-green; the white dew turns to frost. The one I think of is somewhere across the water.',
    seasons: AUTUMN, terms: [14, 17], themes: ['water', 'morning'] },
  { lines: ['海上生明月，天涯共此时。'], author: '张九龄', dynasty: '唐', title: '望月怀远', authorEn: 'Zhang Jiuling',
    en: 'Over the sea the bright moon rises; at the far ends of the earth we share this moment.',
    seasons: AUTUMN, terms: [15], themes: ['moon', 'friendship', 'night', 'water'] },
  { lines: ['但愿人长久，千里共婵娟。'], author: '苏轼', dynasty: '宋', title: '水调歌头', authorEn: 'Su Shi',
    en: 'May we all live long, and share this lovely moon across a thousand miles.',
    seasons: AUTUMN, terms: [15], themes: ['moon', 'friendship'] },
  { lines: ['中庭地白树栖鸦，冷露无声湿桂花。', '今夜月明人尽望，不知秋思落谁家。'], author: '王建', dynasty: '唐', title: '十五夜望月寄杜郎中', authorEn: 'Wang Jian',
    en: 'The courtyard ground is white, crows roost in the trees; cold dew silently wets the osmanthus. Tonight everyone looks up at the bright moon — I wonder whose house autumn longing will fall on.',
    seasons: AUTUMN, terms: [15], themes: ['moon', 'night', 'garden'] },
  { lines: ['一道残阳铺水中，半江瑟瑟半江红。', '可怜九月初三夜，露似真珠月似弓。'], author: '白居易', dynasty: '唐', title: '暮江吟', authorEn: 'Bai Juyi',
    en: 'One band of setting sun lies across the water — half the river jade-green, half red. How lovely, the night of the ninth month\'s third day: dew like pearls, the moon like a bow.',
    seasons: AUTUMN, terms: [16], themes: ['water', 'moon', 'night'] },
  { lines: ['停车坐爱枫林晚，霜叶红于二月花。'], author: '杜牧', dynasty: '唐', title: '山行', authorEn: 'Du Mu',
    en: 'I stop the carriage for love of the maple wood at dusk — frosted leaves redder than the flowers of spring.',
    seasons: AUTUMN, terms: [17] },
  { lines: ['绿蚁新醅酒，红泥小火炉。', '晚来天欲雪，能饮一杯无？'], author: '白居易', dynasty: '唐', title: '问刘十九', authorEn: 'Bai Juyi',
    en: 'New-brewed wine, green bubbles on top; a little stove of red clay. Evening comes and the sky wants to snow — could you drink a cup?',
    seasons: WINTER, terms: [19], themes: ['snow', 'friendship', 'night'] },
  { lines: ['千山鸟飞绝，万径人踪灭。', '孤舟蓑笠翁，独钓寒江雪。'], author: '柳宗元', dynasty: '唐', title: '江雪', authorEn: 'Liu Zongyuan',
    en: 'A thousand hills, no bird in flight; ten thousand paths, no footprint. In a lone boat, an old man in a straw cape fishes alone in the snow on the cold river.',
    seasons: WINTER, terms: [20], themes: ['snow', 'focus', 'water'] },
  { lines: ['日暮苍山远，天寒白屋贫。', '柴门闻犬吠，风雪夜归人。'], author: '刘长卿', dynasty: '唐', title: '逢雪宿芙蓉山主人', authorEn: 'Liu Changqing',
    en: 'At dusk the grey hills are far; in the cold the thatched hut is bare. At the brushwood gate a dog barks — someone coming home through the wind and snow at night.',
    seasons: WINTER, terms: [19, 20], themes: ['snow', 'night'] },
  { lines: ['天时人事日相催，冬至阳生春又来。'], author: '杜甫', dynasty: '唐', title: '小至', authorEn: 'Du Fu',
    en: 'Heaven\'s seasons and human affairs press on day by day; at the solstice the light is reborn, and spring is on its way again.',
    seasons: WINTER, terms: [21], themes: ['time'] },

  // ── 勤 diligence ───────────────────────────────────────────────────────────
  { lines: ['百川东到海，何时复西归？', '少壮不努力，老大徒伤悲。'], author: '佚名', dynasty: '汉', title: '长歌行', authorEn: 'Anonymous (Han yuefu)',
    en: 'A hundred rivers run east to the sea — when will they flow west again? Idle while young and strong, one grieves in vain when old.',
    themes: ['diligence', 'time', 'water'] },
  { lines: ['锲而舍之，朽木不折；锲而不舍，金石可镂。'], author: '荀子', dynasty: '先秦', title: '劝学', authorEn: 'Xunzi',
    en: 'Carve and give up, and even rotten wood will not break; carve without giving up, and metal and stone can be engraved.',
    themes: ['diligence'] },
  { lines: ['故不积跬步，无以至千里；不积小流，无以成江海。'], author: '荀子', dynasty: '先秦', title: '劝学', authorEn: 'Xunzi',
    en: 'Without adding up half-steps, you never go a thousand miles; without gathering small streams, there is no river or sea.',
    themes: ['diligence', 'water'] },
  { lines: ['一日一钱，千日一千，绳锯木断，水滴石穿。'], author: '罗大经', dynasty: '宋', title: '鹤林玉露', authorEn: 'Luo Dajing',
    en: 'A coin a day is a thousand in a thousand days. A rope saws through wood; dripping water wears through stone.',
    themes: ['diligence', 'water', 'time'] },
  { lines: ['盛年不重来，一日难再晨。', '及时当勉励，岁月不待人。'], author: '陶渊明', dynasty: '东晋', title: '杂诗·其一', authorEn: 'Tao Yuanming',
    en: 'The prime of life does not come twice; a day has only one morning. Make the most of the moment — the years wait for no one.',
    themes: ['diligence', 'time', 'morning'] },
  { lines: ['古人学问无遗力，少壮工夫老始成。', '纸上得来终觉浅，绝知此事要躬行。'], author: '陆游', dynasty: '宋', title: '冬夜读书示子聿·其三', authorEn: 'Lu You',
    en: 'The ancients spared no effort in learning; work begun in youth ripens only in age. What comes from paper stays shallow — to truly know a thing, you must do it yourself.',
    seasons: WINTER, themes: ['diligence', 'night'] },
  { lines: ['苟日新，日日新，又日新。'], author: '戴圣', dynasty: '汉', title: '礼记·大学', authorEn: 'Dai Sheng (ed.)',
    en: 'If you can renew yourself one day, renew yourself every day, and again the next.',
    themes: ['diligence', 'morning'] },
  { lines: ['学而时习之，不亦说乎？'], author: '孔子', dynasty: '先秦', title: '论语·学而', authorEn: 'Confucius',
    en: 'To learn, and to practise it in due season — is that not a joy?',
    themes: ['diligence'] },
  { lines: ['合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下。'], author: '老子', dynasty: '先秦', title: '道德经', authorEn: 'Laozi',
    en: 'A tree a person can barely embrace grows from a tiny shoot; a nine-storey tower rises from heaped earth; a journey of a thousand miles begins beneath your feet.',
    themes: ['diligence', 'garden'] },
  { lines: ['业精于勤，荒于嬉；行成于思，毁于随。'], author: '韩愈', dynasty: '唐', title: '进学解', authorEn: 'Han Yu',
    en: 'Skill is refined by diligence and wasted by play; conduct is formed by thought and ruined by drifting.',
    themes: ['diligence'] },
  { lines: ['白日依山尽，黄河入海流。', '欲穷千里目，更上一层楼。'], author: '王之涣', dynasty: '唐', title: '登鹳雀楼', authorEn: 'Wang Zhihuan',
    en: 'The white sun sinks behind the hills; the Yellow River flows into the sea. To see a thousand miles further, climb one more storey.',
    themes: ['diligence', 'water'] },
  { lines: ['种豆南山下，草盛豆苗稀。', '晨兴理荒秽，带月荷锄归。'], author: '陶渊明', dynasty: '东晋', title: '归园田居·其三', authorEn: 'Tao Yuanming',
    en: 'I plant beans below the southern hill; the weeds are thick, the bean sprouts thin. Up at dawn to clear the tangle, I come home under the moon with my hoe on my shoulder.',
    seasons: SUMMER, themes: ['diligence', 'garden', 'morning', 'moon'] },
  { lines: ['茅檐长扫净无苔，花木成畦手自栽。', '一水护田将绿绕，两山排闼送青来。'], author: '王安石', dynasty: '宋', title: '书湖阴先生壁·其一', authorEn: 'Wang Anshi',
    en: 'Under the thatched eaves, swept so often no moss grows; flowers and trees in rows, planted by his own hand. A stream guards the fields, wrapping them in green; two hills push open the door to bring in their blue.',
    themes: ['garden', 'diligence', 'water'] },
  { lines: ['逝者如斯夫！不舍昼夜。'], author: '孔子', dynasty: '先秦', title: '论语·子罕', authorEn: 'Confucius',
    en: 'So it all flows away, like this — never ceasing, day or night.',
    themes: ['time', 'water'] },

  // ── 静 focus & incense ─────────────────────────────────────────────────────
  { lines: ['空山不见人，但闻人语响。', '返景入深林，复照青苔上。'], author: '王维', dynasty: '唐', title: '鹿柴', authorEn: 'Wang Wei',
    en: 'Empty hills, no one in sight — only the sound of voices. Late sunlight enters the deep wood and shines again on the green moss.',
    themes: ['focus'] },
  { lines: ['人闲桂花落，夜静春山空。', '月出惊山鸟，时鸣春涧中。'], author: '王维', dynasty: '唐', title: '鸟鸣涧', authorEn: 'Wang Wei',
    en: 'At ease, I watch the osmanthus fall; the night is still, the spring hills empty. The rising moon startles the mountain birds, who call now and then in the spring ravine.',
    seasons: SPRING, themes: ['focus', 'night', 'moon'] },
  { lines: ['行到水穷处，坐看云起时。'], author: '王维', dynasty: '唐', title: '终南别业', authorEn: 'Wang Wei',
    en: 'I walk to where the water ends, and sit to watch the clouds rise.',
    themes: ['focus', 'water'] },
  { lines: ['众鸟高飞尽，孤云独去闲。', '相看两不厌，只有敬亭山。'], author: '李白', dynasty: '唐', title: '独坐敬亭山', authorEn: 'Li Bai',
    en: 'The birds have flown high and gone; a lone cloud drifts off at leisure. We look at each other and never tire — only I and Jingting Mountain.',
    themes: ['focus'] },
  { lines: ['结庐在人境，而无车马喧。', '问君何能尔？心远地自偏。'], author: '陶渊明', dynasty: '东晋', title: '饮酒·其五', authorEn: 'Tao Yuanming',
    en: 'I built my hut among people, yet hear no noise of carts and horses. How can that be? When the heart is far, the place grows remote of itself.',
    themes: ['focus', 'garden'] },
  { lines: ['明窗延静昼，默坐息诸缘。', '聊将无穷意，寓此一炷烟。'], author: '陈与义', dynasty: '宋', title: '烧香', authorEn: 'Chen Yuyi',
    en: 'A bright window draws out the quiet day; sitting in silence, I let every tie come to rest. All that is boundless in me I lodge in this one thread of incense smoke.',
    themes: ['focus'] },
  { lines: ['兵卫森画戟，宴寝凝清香。'], author: '韦应物', dynasty: '唐', title: '郡斋雨中与诸文士燕集', authorEn: 'Wei Yingwu',
    en: 'Guards stand in ranks with painted halberds; in the quiet hall a clear fragrance hangs.',
    themes: ['focus', 'rain'] },
  { lines: ['重帘不卷留香久，古砚微凹聚墨多。'], author: '陆游', dynasty: '宋', title: '书室明暖终日婆娑其间倦则扶杖至小园戏作长句·其二', authorEn: 'Lu You',
    en: 'The heavy blinds stay down, so the incense lingers; the old inkstone, slightly hollowed, holds plenty of ink.',
    seasons: WINTER, themes: ['focus'] },
  { lines: ['四句烧香偈子，随香遍满东南。', '不是闻思所及，且令鼻观先参。'], author: '苏轼', dynasty: '宋', title: '和黄鲁直烧香二首·其一', authorEn: 'Su Shi',
    en: 'A four-line gatha on burning incense spreads with the scent all through the southeast. It is not reached by hearing or thinking — let the nose contemplate it first.',
    themes: ['focus', 'friendship'] },
  { lines: ['万籁此都寂，但余钟磬音。'], author: '常建', dynasty: '唐', title: '题破山寺后禅院', authorEn: 'Chang Jian',
    en: 'Every sound here falls silent; only the bell and the chime stone remain.',
    themes: ['focus', 'morning'] },

  // ── 夜 月 雨 友 园 night, moon, rain, friends, garden ──────────────────────
  { lines: ['花间一壶酒，独酌无相亲。', '举杯邀明月，对影成三人。'], author: '李白', dynasty: '唐', title: '月下独酌·其一', authorEn: 'Li Bai',
    en: 'A jug of wine among the flowers; I drink alone, with no one near. I raise my cup to invite the bright moon — with my shadow, we make three.',
    seasons: SPRING, themes: ['moon', 'night', 'friendship', 'garden'] },
  { lines: ['君问归期未有期，巴山夜雨涨秋池。', '何当共剪西窗烛，却话巴山夜雨时。'], author: '李商隐', dynasty: '唐', title: '夜雨寄北', authorEn: 'Li Shangyin',
    en: 'You ask when I\'ll come home; I cannot say. Night rain in the Ba hills swells the autumn pools. When shall we trim the candle together at the west window, and talk of this night of rain?',
    seasons: AUTUMN, themes: ['rain', 'night', 'friendship'] },
  { lines: ['春眠不觉晓，处处闻啼鸟。', '夜来风雨声，花落知多少。'], author: '孟浩然', dynasty: '唐', title: '春晓', authorEn: 'Meng Haoran',
    en: 'Spring sleep knows no dawn; everywhere I hear birds singing. Last night, the sound of wind and rain — how many petals fell?',
    seasons: SPRING, themes: ['morning', 'rain'] },
  { lines: ['鸡声茅店月，人迹板桥霜。'], author: '温庭筠', dynasty: '唐', title: '商山早行', authorEn: 'Wen Tingyun',
    en: 'A cock crows at the thatched inn under the moon; footprints in the frost on the plank bridge.',
    seasons: AUTUMN, terms: [17], themes: ['morning', 'moon'] },
  { lines: ['海内存知己，天涯若比邻。'], author: '王勃', dynasty: '唐', title: '送杜少府之任蜀州', authorEn: 'Wang Bo',
    en: 'While a true friend lives anywhere within the seas, the ends of the earth are next door.',
    themes: ['friendship'] },
  { lines: ['春色满园关不住，一枝红杏出墙来。'], author: '叶绍翁', dynasty: '宋', title: '游园不值', authorEn: 'Ye Shaoweng',
    en: 'A garden full of spring cannot be locked in: one spray of red apricot leans out over the wall.',
    seasons: SPRING, terms: [4], themes: ['garden'] },
  { lines: ['方宅十余亩，草屋八九间。', '榆柳荫后檐，桃李罗堂前。'], author: '陶渊明', dynasty: '东晋', title: '归园田居·其一', authorEn: 'Tao Yuanming',
    en: 'A plot of ten-odd mu, a thatched house of eight or nine rooms. Elm and willow shade the back eaves; peach and plum line up before the hall.',
    themes: ['garden'] },
  { lines: ['而今听雨僧庐下，鬓已星星也。', '悲欢离合总无情，一任阶前、点滴到天明。'], author: '蒋捷', dynasty: '宋', title: '虞美人·听雨', authorEn: 'Jiang Jie',
    en: 'Now I listen to rain beneath a monastery roof, my temples already flecked with grey. Joy and grief, meeting and parting — all indifferent; let it drip on the steps till dawn.',
    themes: ['rain', 'time', 'night'] },
];

// ---------------------------------------------------------------------------
// Picking

export interface PoemFilter {
  plant?: PlantKind;
  term?: number;
  theme?: PoemTheme;
  season?: Season;
}

/** All poems matching every given criterion (an empty filter returns all poems). */
export function poemsFor(filter: PoemFilter): Poem[] {
  return POEMS.filter((p) =>
    (filter.plant === undefined || !!p.plants?.includes(filter.plant)) &&
    (filter.term === undefined || !!p.terms?.includes(filter.term)) &&
    (filter.theme === undefined || !!p.themes?.includes(filter.theme)) &&
    (filter.season === undefined || !!p.seasons?.includes(filter.season)));
}

const seasonOf = (term: number): Season =>
  (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor((((term % 24) + 24) % 24) / 6)];

function rotate<T>(items: readonly T[], salt: number): T {
  const i = ((Math.floor(salt) % items.length) + items.length) % items.length;
  return items[i];
}

/**
 * Deterministically pick a poem for a context. `salt` varies the pick (e.g. a date hash).
 * Preference: plant (narrowed by term / theme / season when possible), then term, then theme,
 * then season; always returns something.
 */
export function pickPoem(ctx: { plant?: PlantKind; term?: number; theme?: PoemTheme; season?: Season; salt: number }): Poem {
  const season = ctx.season ?? (ctx.term !== undefined ? seasonOf(ctx.term) : undefined);
  const tiers: PoemFilter[] = [];
  if (ctx.plant) {
    if (ctx.term !== undefined) tiers.push({ plant: ctx.plant, term: ctx.term });
    if (ctx.theme) tiers.push({ plant: ctx.plant, theme: ctx.theme });
    if (season) tiers.push({ plant: ctx.plant, season });
    tiers.push({ plant: ctx.plant });
  }
  if (ctx.term !== undefined) {
    if (ctx.theme) tiers.push({ term: ctx.term, theme: ctx.theme });
    tiers.push({ term: ctx.term });
  }
  if (ctx.theme) {
    if (season) tiers.push({ theme: ctx.theme, season });
    tiers.push({ theme: ctx.theme });
  }
  if (season) tiers.push({ season });
  for (const f of tiers) {
    const hits = poemsFor(f);
    if (hits.length) return rotate(hits, ctx.salt);
  }
  return rotate(POEMS, ctx.salt);
}

/** "〔宋〕朱熹《观书有感》" — the conventional Chinese attribution line. */
export function attributionZh(p: Poem): string {
  return `〔${p.dynasty}〕${p.author}《${p.title}》`;
}
