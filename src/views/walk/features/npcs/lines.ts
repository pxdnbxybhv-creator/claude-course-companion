// What the people of the painting say — to whom. Chinese first; each person has lines of their own
// for several companions (关公 is bowed to, the cat is scolded and fed, 嫦娥 is stared at…).
import type { CharacterId } from '../../../../data/characters';
import { L, type Line, type PerCompanion } from './logic';

// ───────────────────────────── the crowd's barks (short, over their heads) ─────────────────────────────

export type CrowdRole = 'villager' | 'vendor' | 'tea' | 'washer' | 'child' | 'boatman' | 'fisher' | 'farmer' | 'monk' | 'woodfish' | 'scholar' | 'pilgrim' | 'watchman' | 'lantern';

/** What each kind of person calls out now and then, unasked. */
export const CALLS: Partial<Record<CrowdRole, Line[]>> = {
  vendor: [L('新鲜菱角嘞——', 'Fresh water chestnuts!'), L('青团，刚出笼的青团！', 'Green rice cakes, hot from the steamer!'), L('桂花糖藕——', 'Lotus root with osmanthus!'), L('竹篮竹筐，结实耐用！', 'Baskets! Sturdy baskets!'), L('针头线脑，胭脂花粉——', 'Needles, thread, rouge and powder!'), L('茶叶蛋，热乎的！', 'Tea eggs, still warm!')],
  tea: [L('好茶！', 'Good tea!'), L('听说了吗……', 'Have you heard…'), L('再添一壶！', 'Another pot!'), L('这盘棋你输定了', 'You’ve lost this game')],
  washer: [L('砰、砰、砰……', 'Thwack, thwack…'), L('东家长，西家短', 'Village gossip…'), L('水凉，手都红了', 'Cold water today')],
  child: [L('来抓我呀！', 'Catch me!'), L('嘻嘻嘻！', 'Hee hee!'), L('我先到的！', 'I was first!'), L('老鹰捉小鸡！', 'Hawk and chicks!')],
  boatman: [L('欸乃一声山水绿——', 'A creak of the oar, the hills turn green…'), L('船来喽，让一让！', 'Boat coming through!'), L('摇啊摇——', 'Row, row…')],
  fisher: [L('嘘——鱼要咬钩了', 'Shh — a bite'), L('今天鱼不多', 'Not many fish today')],
  farmer: [L('春种一粒粟……', 'Sow one grain in spring…'), L('今年雨水好', 'Good rain this year'), L('歇口气', 'A breather')],
  monk: [L('阿弥陀佛', 'Amituofo'), L('扫地扫地扫心地', 'Sweep the ground, sweep the mind')],
  woodfish: [L('笃、笃、笃……', 'Tok, tok, tok…'), L('南无阿弥陀佛', 'Namo Amituofo')],
  scholar: [L('疏影横斜水清浅……', 'Sparse shadows slant over shallow water…'), L('好一树梅花！', 'What a plum tree!'), L('暗香浮动月黄昏', 'Faint fragrance in the dusk moon')],
  pilgrim: [L('还有几级台阶……', 'How many more steps…'), L('求个平安', 'For a safe year'), L('心诚则灵', 'Sincerity is answered')],
  watchman: [L('天干物燥，小心火烛——', 'Dry weather — mind your candles!'), L('关门关窗，防偷防盗——', 'Shut your doors, bar your windows!'), L('平安无事——', 'All is well!')],
  lantern: [L('夜深了，慢些走', 'It’s late — go gently'), L('月亮真圆', 'What a moon')],
};

/** A hello when you pass by, by who you are (any = everyone else); a few per kind. */
export const HELLO: PerCompanion<Line[]> = {
  any: [L('早啊！', 'Morning!'), L('吃了吗？', 'Eaten yet?'), L('今儿天好', 'Fine day'), L('慢走', 'Go well')],
  scholar: [L('公子好', 'Good day, sir'), L('先生安好', 'Well met, scholar')],
  gardener: [L('花匠师傅！', 'The gardener!'), L('我家的月季也请您看看', 'Come see my roses')],
  fisher: [L('老哥，收成如何？', 'Good catch, old man?'), L('又去钓鱼？', 'Off fishing again?')],
  musician: [L('是琴师！', 'The qin player!'), L('弹一曲吧', 'Play us a tune')],
  swordsman: [L('大侠！', 'A hero!'), L('好俊的剑', 'What a sword')],
  taoist: [L('小道长好', 'Hello, little Taoist'), L('小道长，给画道符吧', 'A talisman for me?')],
  painter: [L('画师，给我画一张！', 'Paint me, painter!'), L('画得像不像？', 'Will it look like me?')],
  player: [L('先生，下一盘？', 'A game, sir?'), L('棋士来了', 'The go master')],
  cat: [L('谁家的胖橘猫？', 'Whose fat ginger cat?'), L('咪咪——', 'Here, kitty!'), L('别偷我的鱼！', 'Not my fish!')],
  rabbit: [L('月宫的兔儿爷？', 'The moon rabbit?'), L('好白的兔子', 'What a white rabbit')],
  poet: [L('太白先生！', 'Master Li Bai!'), L('诗仙来了，快备酒', 'The Immortal — fetch the wine!')],
  guan: [L('关老爷！', 'Lord Guan!'), L('拜见关老爷', 'We greet you, Lord Guan')],
  change: [L('仙女……下凡了？', 'A fairy… come down?'), L('是嫦娥！', 'It’s Chang’e!'), L('……（看呆了）', '…(staring)')],
};

/** Children, to a cat or a rabbit they want to catch. */
export const CHASE: Partial<Record<CharacterId, Line[]>> = {
  cat: [L('猫！快追！', 'A cat! After it!'), L('咪咪别跑！', 'Kitty, wait!'), L('让我摸一下！', 'Let me pet you!')],
  rabbit: [L('小兔子！', 'A bunny!'), L('抓兔子咯！', 'Catch the rabbit!')],
};

/** When a skill fills the air. */
export const REACT = {
  music: [L('好琴！', 'Beautiful!'), L('这是《流水》？', 'Is that “Flowing Water”?'), L('再弹一曲', 'Play another')],
  bow: [L('恭迎！', 'Welcome, lord!'), L('拜见！', 'We bow!')],
  bloom: [L('好香！', 'How sweet!'), L('花开了！', 'They bloomed!'), L('哪来的花香？', 'What is that scent?')],
};

// ───────────────────────────── 货郎, the peddler ─────────────────────────────

export const PEDDLER_HELLO: PerCompanion<Line> = {
  any: L('拨浪鼓一响，货郎到！客官瞧瞧，吃的玩的都有。', 'Rattle-drum rattles — the peddler’s here! Have a look: things to eat, things to play with.'),
  cat: L('哟，猫大爷也来赶集？糖葫芦可不能给你吃……好吧，闻一闻。', 'Well, Master Cat come to market? No candied haws for you… all right, have a sniff.'),
  guan: L('关、关老爷！小的这点小玩意儿，您看得上哪样尽管挑——价钱……还是要给的。', 'L-Lord Guan! Pick anything you fancy from my little wares — the price, er… still applies.'),
  change: L('这位仙子……灯笼要吗？月宫里怕是没有这么红的。', 'Fair lady of the moon… a lantern? I doubt the moon palace has one this red.'),
  rabbit: L('小兔子，风车给你转一个看看？', 'Little rabbit, shall I spin a pinwheel for you?'),
  poet: L('诗仙来了！买把伞吧，醉了躺哪儿都不怕淋。', 'The Poet Immortal! Buy an umbrella — drunk, you can lie down anywhere and stay dry.'),
  swordsman: L('大侠，出门在外，带把油纸伞——雨里拔剑也潇洒。', 'A hero on the road wants an umbrella — drawing a sword in the rain looks twice as fine.'),
  taoist: L('小道长，纸鸢放得高，离天就近了。', 'Little Taoist, fly a kite high and you’re that much nearer heaven.'),
  scholar: L('公子，赶考的路上提盏灯笼，夜里也好赶路。', 'Young sir, a lantern for the road to the exams — you can travel by night.'),
  fisher: L('老哥，买顶……哦，你有斗笠了。来串糖葫芦？', 'Old man, a hat… oh, you’ve got one. Candied haws, then?'),
};

export const WARE_SOLD: Record<string, Line> = {
  haws: L('好嘞！冰糖脆，山楂酸，一口下去，眼睛都眯起来。', 'Here you go! Crisp sugar, sour haw — one bite and your eyes screw up.'),
  pinwheel: L('风车一只！举高了跑两步试试。', 'One pinwheel! Hold it up and run a few steps.'),
  umbrella: L('这把伞，桐油刷了三遍，画的是一枝寒梅。', 'Three coats of tung oil, and a winter plum painted on it.'),
  lantern: L('灯笼拿好！天一黑，它自己就亮。', 'Hold it well! When night falls it lights by itself.'),
  kite: L('沙燕纸鸢！线我给你缠好了，风来就飞。', 'A swallow kite! I’ve wound the line — it flies when the wind comes.'),
};

export const PEDDLER_ROUND = L(
  '我每天从水乡集市出发，过石桥到园门口，再去荷塘渡口，一路吆喝着走一圈。听见拨浪鼓，就是我来了。',
  'Every day I start at the water-town market, cross the bridge to the garden gate, then on to the lotus dock and back, calling all the way. When you hear the rattle-drum, that’s me.',
);

// ───────────────────────────── 说书人, the storyteller ─────────────────────────────

export interface Tale {
  id: string;
  zh: string;
  en: string;
  /** The 定场诗 before the tale. */
  verse: Line;
  body: Line[];
  /** Whose tale this is (they get it when they come to listen). */
  hero?: CharacterId;
  /** How the hero takes hearing it. */
  heroNote?: Line;
}

const V_SANGUO = L('滚滚长江东逝水，浪花淘尽英雄。', 'The great river rolls east; its waves wash away the heroes.');
const V_XIYOU = L('混沌未分天地乱，茫茫渺渺无人见。', 'Before chaos parted, heaven and earth were one blur no eye could see.');
const V_LIAOZHAI = L('姑妄言之姑听之，豆棚瓜架雨如丝。', 'Tell it idly, hear it idly — rain like silk on the bean trellis.');
const V_CHENGYU = L('闲言少叙，书归正传。', 'Enough idle talk — to the story.');

export const TALES: Tale[] = [
  { id: 'huaxiong', zh: '温酒斩华雄', en: 'Slaying Hua Xiong While the Wine Was Warm', verse: V_SANGUO, hero: 'guan', body: [
    L('话说十八路诸侯讨董卓，董卓帐下大将华雄连斩数将，诸侯个个面如土色。', 'Eighteen lords marched on Dong Zhuo, and his general Hua Xiong cut down their champions one after another. The lords went pale.'),
    L('这时帐下走出一人，身长九尺，髯长二尺，面如重枣——正是马弓手关羽！曹操斟了一杯热酒给他壮行。关公说：「酒且斟下，某去便来。」', 'Then a man stepped forward — nine feet tall, a beard two feet long, a face like a ripe jujube: Guan Yu, a mere archer. Cao Cao poured him hot wine. “Pour it,” said Guan, “I’ll be back.”'),
    L('只听关外鼓声大振，鸾铃响处，关公提着华雄的头掷于地上——那杯酒，尚温！', 'Drums thundered beyond the pass, bells rang — and Guan threw Hua Xiong’s head on the ground. The wine was still warm!'),
  ], heroNote: L('关公捋须不语。本就红的脸，又红了三分。', 'Lord Guan strokes his beard and says nothing. His red face turns three shades redder.') },
  { id: 'wuguan', zh: '过五关斩六将', en: 'Five Passes, Six Generals', verse: V_SANGUO, hero: 'guan', body: [
    L('话说关公得知兄长刘备的下落，封金挂印，辞别曹操，护着两位嫂嫂千里寻兄。', 'Learning where his sworn brother Liu Bei was, Guan sealed up Cao Cao’s gold, hung up his seal of office and set out a thousand miles with his two sisters-in-law.'),
    L('东岭关、洛阳、汜水关、荥阳、黄河渡口——一路五关，守将拦路，关公一口青龙刀，斩了六员大将。', 'Dongling, Luoyang, Sishui, Xingyang, the Yellow River ford — five passes, and at each a general barred the way. One Green Dragon blade; six generals fell.'),
    L('列位，这一路不为功名，不为富贵，只为一个「义」字！', 'Friends — not for fame, not for riches: all of it for one word, loyalty!'),
  ], heroNote: L('关公轻叹一声：「那一路……嫂嫂们受苦了。」说书人听了，差点从凳子上站起来。', 'Lord Guan sighs: “That road… my sisters-in-law suffered so.” The storyteller nearly leaps off his stool.') },
  { id: 'caochuan', zh: '草船借箭', en: 'Borrowing Arrows with Straw Boats', verse: V_SANGUO, body: [
    L('周瑜要诸葛亮十日造十万支箭，孔明却说：「只消三日。」', 'Zhou Yu demanded a hundred thousand arrows in ten days. Zhuge Liang said: “Three will do.”'),
    L('第三日夜里大雾漫江，孔明把二十条船扎满草人，擂鼓呐喊，直逼曹营。曹操怕有埋伏，只叫放箭。', 'On the third night fog blanketed the river. Twenty boats bristling with straw men drummed and shouted toward Cao Cao’s camp; fearing a trap, Cao only ordered: shoot!'),
    L('日出雾散，船上草人插满了箭——十万有余。孔明还叫军士齐喊：「谢丞相箭！」', 'At sunrise the straw men were thick with arrows — over a hundred thousand. Zhuge Liang had his men shout: “Thank you for the arrows, Chancellor!”'),
  ] },
  { id: 'baigu', zh: '三打白骨精', en: 'Three Times Against the White-Bone Demon', verse: V_XIYOU, body: [
    L('唐僧师徒路过白虎岭，白骨精想吃唐僧肉，先变作送饭的村姑。', 'Crossing White Tiger Ridge, the White-Bone Demon, hungry for the monk’s flesh, came as a village girl bringing food.'),
    L('孙悟空火眼金睛，一棒打去；妖精又变作老妇、老翁，悟空连打三回。', 'The Monkey King’s fiery eyes saw through her — one blow; she came back as an old woman, an old man — three times he struck.'),
    L('唐僧却怪他滥杀无辜，一纸贬书把他赶回花果山。列位——好人难做，真心难辨呐！', 'But the monk blamed him for killing innocents and sent him home to Flower-Fruit Mountain. Friends — it is hard to be good, and harder to be believed!'),
  ] },
  { id: 'naotian', zh: '大闹天宫', en: 'Havoc in Heaven', verse: V_XIYOU, body: [
    L('玉帝封孙悟空做「弼马温」，悟空一问，原来是个养马的小官，一怒之下打出南天门。', 'The Jade Emperor made Sun Wukong “Keeper of the Horses”. Learning it was a stable-boy’s post, he fought his way out of the Southern Gate.'),
    L('后来又封他「齐天大圣」，看管蟠桃园——他倒好，把蟠桃吃了个七七八八。', 'Then they made him “Great Sage Equal to Heaven” and set him over the peach orchard — and he ate nearly every peach.'),
    L('十万天兵拿他不住，最后还是如来佛祖一翻手掌，压在五行山下，一压五百年。', 'A hundred thousand heavenly soldiers couldn’t hold him; at last the Buddha turned his palm and pinned him under Five-Element Mountain for five hundred years.'),
  ] },
  { id: 'laoshan', zh: '崂山道士', en: 'The Taoist of Mount Lao', verse: V_LIAOZHAI, hero: 'taoist', body: [
    L('有个姓王的书生，听说崂山有仙人，便上山拜师，想学法术。', 'A young man named Wang heard of immortals on Mount Lao and climbed up to learn their magic.'),
    L('师父叫他砍柴，一砍就是一个月。他吃不了苦，只求学个穿墙术就下山。', 'His master set him to chop firewood for a month. Unable to bear it, he begged for just one trick — walking through walls — so he could go home.'),
    L('回家向妻子炫耀，一头朝墙撞去——「咚」！额头起了个大包。列位，心不诚，法不灵啊！', 'Home again, he showed off to his wife and ran at a wall — thud! A great lump on his forehead. Friends: without sincerity, no magic works!'),
  ], heroNote: L('道童嘀咕：「穿墙要心定，他那是心急。」', 'The Taoist child mutters: “Walking through walls takes a calm heart. His was in a hurry.”') },
  { id: 'zhongli', zh: '种梨', en: 'Planting a Pear', verse: V_LIAOZHAI, hero: 'gardener', body: [
    L('集上有个卖梨的，梨又大又甜，却一个也不肯施舍给讨梨的老道士。', 'A pear-seller at the market, his pears big and sweet, would not give a single one to an old Taoist who begged.'),
    L('旁人买了一个送给道士。道士吃完，把梨核埋进土里，浇上热水——眨眼间抽芽、长叶、开花、结果！', 'A bystander bought him one. The Taoist ate it, buried the core, poured on hot water — and in a blink it sprouted, leafed, flowered and fruited!'),
    L('道士把一树梨分给众人，扬长而去。卖梨的回头一看——自己车上的梨，一个也不剩了。', 'He shared the whole tree’s pears with the crowd and walked off. The pear-seller turned round — his own cart was empty.'),
  ], heroNote: L('园丁一拍大腿：「一顿饭的工夫开花结果？这手艺我也要学！」', 'The gardener slaps his knee: “Flower and fruit in the time of a meal? I want to learn that!”') },
  { id: 'dianjing', zh: '画龙点睛', en: 'Dotting the Dragon’s Eyes', verse: V_CHENGYU, hero: 'painter', body: [
    L('南朝有位画家叫张僧繇，在金陵安乐寺的墙上画了四条龙，却都不画眼睛。', 'Zhang Sengyou of the Southern Dynasties painted four dragons on a temple wall in Jinling — all without eyes.'),
    L('人问为何，他说：「点了睛，龙就飞走了。」众人不信，非要他点。', 'Asked why, he said: “Dot the eyes and they’ll fly away.” Nobody believed him; they insisted.'),
    L('他提笔点了两条——霎时雷电破壁，两条龙腾云而去；没点睛的两条，至今还在墙上。', 'He dotted two. Thunder split the wall and those two dragons rode off on the clouds; the two without eyes are on the wall still.'),
  ], heroNote: L('画师听罢，悄悄摸了摸袖中的笔。远处天上，隐隐打了个闷雷。', 'The painter quietly touches the brush in his sleeve. Far off, thunder rumbles.') },
  { id: 'shouzhu', zh: '守株待兔', en: 'Waiting by the Stump for a Rabbit', verse: V_CHENGYU, hero: 'rabbit', body: [
    L('宋国有个农夫，田里有一截树桩。一天，一只兔子飞跑过来，一头撞在树桩上，死了。', 'A farmer of Song had a tree stump in his field. One day a rabbit ran full tilt into it and died.'),
    L('农夫白捡了一只兔子，从此放下锄头，天天守着树桩，等第二只兔子来撞。', 'Given a free rabbit, he laid down his hoe and sat by the stump every day, waiting for the next one.'),
    L('兔子没等来，田却荒了，被宋国人笑了几千年。', 'No rabbit came; his field went to weeds, and the people of Song have laughed at him for thousands of years.'),
  ], heroNote: L('玉兔气得直跺脚：「谁会撞树桩啊！那只兔子一定是没睡醒。」', 'The Jade Rabbit stamps: “Who runs into a stump?! That rabbit must have been half asleep.”') },
  { id: 'lanke', zh: '烂柯', en: 'The Rotted Axe Handle', verse: V_CHENGYU, hero: 'player', body: [
    L('晋朝有个樵夫叫王质，进山砍柴，见两个童子在石上下棋，便放下斧头在旁边看。', 'In the Jin dynasty a woodcutter, Wang Zhi, came upon two boys playing go on a rock in the mountains, and put down his axe to watch.'),
    L('童子给他一颗枣核似的东西含着，他便不觉得饿。一局未完，童子说：「你怎么还不走？」', 'They gave him something like a date stone to suck, and he felt no hunger. Before the game ended a boy said: “Why haven’t you gone?”'),
    L('王质起身一看，斧柄已经烂了。下山回村，同辈的人早都不在了——山中一局棋，世上已百年。', 'He stood — his axe handle had rotted away. Back in his village, everyone of his generation was long gone. One game in the hills; a hundred years in the world.'),
  ], heroNote: L('棋士喃喃自语：「那盘棋……到底谁赢了？」', 'The go master murmurs: “And that game… who won?”') },
  { id: 'zhiyin', zh: '高山流水', en: 'High Mountains, Flowing Water', verse: V_CHENGYU, hero: 'musician', body: [
    L('春秋时，伯牙善弹琴，钟子期善听琴。伯牙志在高山，子期便说：「巍巍乎若泰山。」', 'In the Spring and Autumn era, Boya played the qin and Zhong Ziqi listened. When Boya thought of mountains, Ziqi said: “Towering, like Mount Tai.”'),
    L('伯牙志在流水，子期又说：「洋洋乎若江河。」伯牙叹道：知我者，子期也。', 'When he thought of water: “Vast, like the great rivers.” Boya sighed: he alone understands me.'),
    L('后来子期病故，伯牙摔琴断弦，终身不再弹琴。这就是「知音」二字的来历。', 'When Ziqi died, Boya broke his qin and never played again. That is where the word zhiyin — “one who knows the tune” — comes from.'),
  ], heroNote: L('琴师眼眶微红，轻轻拨了一下弦。满堂无声。', 'The qin player’s eyes redden; she plucks one string. The whole teahouse falls silent.') },
  { id: 'benyue', zh: '嫦娥奔月', en: 'Chang’e Flies to the Moon', verse: V_CHENGYU, hero: 'change', body: [
    L('上古时天上有十个太阳，后羿射下九个，王母娘娘赐他一粒不死药。', 'Long ago ten suns scorched the sky. Hou Yi shot down nine, and the Queen Mother of the West gave him an elixir of immortality.'),
    L('他的妻子嫦娥……嗯，为了不让药落入坏人手里，自己服了下去，身子一轻，飘上了月宫。', 'His wife Chang’e… ahem, to keep it from falling into wicked hands, swallowed it herself, and floated up to the moon.'),
    L('从此每到中秋，后羿就摆上她爱吃的瓜果，望着月亮。碧海青天夜夜心呐……', 'Ever since, each mid-autumn, Hou Yi sets out the fruits she loved and gazes at the moon. Blue sea, clear sky, a heart every night…'),
  ], heroNote: L('（说书人偷偷看了你一眼，把「偷药」说成了「服药」，额头上全是汗。）', '(The storyteller glances at you and turns “stole the elixir” into “took the elixir”, his brow beaded with sweat.)') },
];

/** Companions who, walking in, get their own tale (and the storyteller spots them). */
export const TALE_SPOTTED: PerCompanion<Line | null> = {
  any: null,
  guan: L('哎哟！今儿台下这位——红脸长髯——莫不是关老爷显圣？列位，今日不说别的，单说关老爷的故事！', 'Oh my! That one — red face, long beard — can it be Lord Guan himself? Friends, today we tell nothing else but his tale!'),
  change: L('这位……这位仙子……咳咳，今儿说一段《嫦娥奔月》，说错了您多担待。', 'This… this fair lady… ahem. Today: Chang’e flies to the moon. Forgive me if I get it wrong.'),
  rabbit: L('哟，来了只兔子！那今儿就说「守株待兔」——小兔子你别怕，是只笨兔子。', 'A rabbit! Then today it’s “Waiting by the Stump” — don’t worry, it’s about a silly rabbit.'),
  painter: L('画师来了！那得说一段「画龙点睛」，您可别当场点睛，小店的墙不结实。', 'The painter! Then “Dotting the Dragon’s Eyes” it is — only please don’t dot any, my walls are thin.'),
  player: L('棋士先生到！今儿说「烂柯」——听完了，您看看自己的扇柄还在不在。', 'The go master! Today: “The Rotted Axe Handle” — afterwards, check your fan is still whole.'),
  musician: L('琴师来了。今儿说一段知音的故事。', 'The qin player is here. Today, a tale of the friend who knew the tune.'),
  taoist: L('小道长来了？今儿说「崂山道士」——学穿墙的那位，可不是您的同门。', 'A little Taoist? Then “The Taoist of Mount Lao” — the wall-walker was no brother of your school, mind.'),
  gardener: L('园丁师傅来了？今儿说一段「种梨」，说完了您也试试。', 'The gardener? Then today it’s “Planting a Pear” — try it yourself afterwards.'),
};

/** The poet hears the opening verse misquoted (as it stood in the Song-dynasty books) and puts it right. */
export const POET_VERSE = L('床前看月光，疑是地上霜。举头望山月，低头思故乡。', 'Before my bed I watch the moonlight, like frost upon the ground. I raise my head to the mountain moon, and lower it, thinking of home.');
export const POET_CORRECTS: Line[] = [
  L('且慢！在下写的是……咦，是「看月光」还是「明月光」来着？', 'Wait! What I wrote was… hm, was it “watch the moonlight” or “bright moonlight”?'),
  L('（说书人一愣）您……您是太白先生本人？！宋本作「看月光」「望山月」，明人才改成「明月光」「望明月」——您说哪个算数？', '(The storyteller freezes.) Are you… Master Li Bai himself? The Song editions read “watch” and “mountain moon”; it was the Ming who made it “bright moonlight” and “bright moon”. Which is right?'),
  L('都算，都算。那晚喝多了，记不清了。哈哈哈！', 'Both, both! I’d had a few that night — can’t remember. Ha ha ha!'),
];

/** The cat heckles from the floor. */
export const CAT_HECKLE: Line[] = [
  L('（台下）喵——！', '(From the floor) Mrrow!'),
  L('哪来的猫？……咳，这位猫客官，您有何高见？', 'A cat? …Ahem. Honoured feline guest, your opinion?'),
  L('喵。（尾巴一甩：讲得太慢。）', 'Mrrp. (A flick of the tail: too slow.)'),
  L('嫌慢？好，咱快马加鞭！', 'Too slow, is it? Then at a gallop!'),
];
export const CAT_AFTER = L('……哎？谁把我碟子里的花生米吃光了？', '…Eh? Who ate all the peanuts on my plate?');

/** How other companions take a tale that is not theirs. */
export const TALE_AFTER: PerCompanion<Line | null> = {
  any: null,
  swordsman: L('侠客抱剑听得入神，末了往桌上一放：两枚铜钱，叮当作响。', 'The swordsman listens rapt, sword in his arms, then sets two coins on the table with a ring.'),
  scholar: L('书生听得入迷，把「且听下回分解」工工整整记在了本子上。', 'The scholar, spellbound, copies “to be continued” neatly into his notebook.'),
  fisher: L('渔翁不知什么时候打起了呼噜，醒木一拍，吓得他一哆嗦。', 'The fisherman has dozed off; the gavel cracks and he jumps.'),
  guan: L('关公听罢，微微颔首：「说得好。」', 'Lord Guan nods slightly: “Well told.”'),
};

export const STORY_END = L('欲知后事如何——且听下回分解！', 'And what happened next? Come back and hear it next time!');

// ───────────────────────────── 算命先生, the fortune teller ─────────────────────────────

export interface Slip { rank: Line; verse: Line; src: string; read: Line; yi: Line }

export const SLIPS: Slip[] = [
  { rank: L('上上签', 'Highest fortune'), verse: L('春风得意马蹄疾，一日看尽长安花。', 'Spring wind, high spirits, quick hooves — in one day I see all the flowers of Chang’an.'), src: '孟郊', read: L('所求皆顺。只是莫贪快，花要一朵一朵看。', 'All you seek goes well. Only don’t hurry: look at the flowers one by one.'), yi: L('宜赏花', 'Good for viewing flowers') },
  { rank: L('上吉', 'Great fortune'), verse: L('长风破浪会有时，直挂云帆济沧海。', 'A day will come to ride the wind and break the waves; I’ll hoist my sail and cross the sea.'), src: '李白', read: L('眼下有阻，终会过去。风来时，要记得扬帆。', 'Obstacles now, but they will pass. When the wind comes, remember to raise the sail.'), yi: L('宜划船', 'Good for boating') },
  { rank: L('中吉', 'Good fortune'), verse: L('山重水复疑无路，柳暗花明又一村。', 'Hills upon hills, streams upon streams — no road, it seems; then willows, flowers, another village.'), src: '陆游', read: L('再走几步，就有转机。', 'A few more steps, and things will turn.'), yi: L('宜远行', 'Good for a long walk') },
  { rank: L('中平', 'Middling'), verse: L('千淘万漉虽辛苦，吹尽狂沙始到金。', 'A thousand washings, ten thousand siftings — hard work; blow away the sand and there is gold.'), src: '刘禹锡', read: L('功夫不负有心人，只是还要些日子。', 'Effort is never wasted, but it needs a few more days.'), yi: L('宜浇花', 'Good for watering') },
  { rank: L('上吉', 'Great fortune'), verse: L('海内存知己，天涯若比邻。', 'With a true friend anywhere in the world, the ends of the earth are next door.'), src: '王勃', read: L('贵人在侧。今日与人说说话，自有好事。', 'A friend is near. Talk with people today and good things follow.'), yi: L('宜访友', 'Good for visiting friends') },
  { rank: L('中吉', 'Good fortune'), verse: L('不积跬步，无以至千里。', 'Without piling up half-steps, there is no journey of a thousand li.'), src: '荀子', read: L('小事天天做，自成大事。', 'Do the small thing every day, and it becomes a great one.'), yi: L('宜打卡', 'Good for keeping habits') },
  { rank: L('中平', 'Middling'), verse: L('欲穷千里目，更上一层楼。', 'To see a thousand li further, climb one more storey.'), src: '王之涣', read: L('站得高些，看得远些，烦恼就小了。', 'Stand a little higher, see a little further, and troubles shrink.'), yi: L('宜登高', 'Good for climbing') },
  { rank: L('上上签', 'Highest fortune'), verse: L('但愿人长久，千里共婵娟。', 'May we all live long, and share this moon a thousand li apart.'), src: '苏轼', read: L('所念之人，平安顺遂。', 'Those you think of are safe and well.'), yi: L('宜赏月', 'Good for moon-gazing') },
  { rank: L('中吉', 'Good fortune'), verse: L('竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。', 'Bamboo staff, straw sandals, lighter than a horse — who’s afraid? A straw cape in misty rain, all my life.'), src: '苏轼', read: L('风雨都不怕，自在最要紧。', 'Fear no wind or rain; being at ease is what matters.'), yi: L('宜听雨', 'Good for listening to rain') },
  { rank: L('下签', 'Low fortune'), verse: L('行到水穷处，坐看云起时。', 'Walk to where the water ends; sit and watch the clouds rise.'), src: '王维', read: L('路似到了头？莫急，坐下歇歇，云自会起。', 'The road seems to end? Don’t fret: sit awhile, and the clouds will rise.'), yi: L('宜品茶', 'Good for tea') },
  { rank: L('中平', 'Middling'), verse: L('宝剑锋从磨砺出，梅花香自苦寒来。', 'A sword’s edge comes from the whetstone; the plum’s fragrance from the bitter cold.'), src: '《警世贤文》', read: L('眼前的苦，是日后的香。', 'Today’s hardship is tomorrow’s fragrance.'), yi: L('宜寻梅', 'Good for seeking plum blossom') },
  { rank: L('上吉', 'Great fortune'), verse: L('沉舟侧畔千帆过，病树前头万木春。', 'Past the sunken boat a thousand sails go by; before the sick tree, ten thousand trees in spring.'), src: '刘禹锡', read: L('旧事翻篇，新春在前。', 'Turn the page on the old; spring is ahead.'), yi: L('宜种树', 'Good for planting') },
];

export const FORTUNE_HELLO: PerCompanion<Line> = {
  any: L('铁口直断，十文一签。客官，求一支？', 'Straight talk, ten coins a slip. Draw one, friend?'),
  guan: L('将军何须问卜？将军一生，义字当头，老朽不敢收您的钱。', 'What need has a general of fortunes? Your whole life stands on loyalty — I dare not take your coins.'),
  cat: L('猫也来算命？……伸爪子过来，老朽给你看看爪相。', 'A cat wants its fortune? …Give me your paw; I’ll read it.'),
  change: L('仙子的命数，在天上，不在老朽这签筒里……不过，您要是想摇一支，老朽也不拦着。', 'A goddess’s fate is written in the sky, not in my bamboo tube… but if you wish to shake one out, I won’t stop you.'),
  taoist: L('同道中人！小道长，咱俩谁给谁算？……好好好，老朽给您算，收半价。', 'A fellow of the Way! Who reads whom? …Fine, I’ll read yours — half price.'),
  player: L('先生算棋，老朽算命，都是推演。您先请。', 'You calculate games, I calculate fates — all the same art. After you.'),
  rabbit: L('月宫来的兔儿爷？您的签，老朽不看也知道：月圆人团圆。', 'The rabbit from the moon? Yours I know without looking: full moon, full family.'),
  swordsman: L('大侠剑气冲天，这签筒都在抖。求一支？', 'Your sword’s spirit makes my tube tremble, hero. Draw one?'),
};
export const GUAN_GIFT = L('……倒是送将军一句，不收钱：『大意失荆州』。切记，切记。', '…But one line for the general, free: “Careless, and Jingzhou is lost.” Remember it.');
export const CAT_PAW = L('嗯……爪纹清晰，肉垫饱满。今日宜晒太阳，忌洗澡。不收钱，去吧。', 'Hmm… clear lines, plump pads. Today: good for sunbathing, bad for baths. No charge — off you go.');

// ───────────────────────────── 糖人, the sugar-figure stall ─────────────────────────────

export const SUGAR_HELLO = L('吹糖人、画糖人——五文钱一个，照着客官的样子来！', 'Blown sugar, drawn sugar — five coins, made in your likeness!');
export const SUGAR_MAKE: PerCompanion<Line> = {
  any: L('来——照着客官的样子，一勺糖稀，走！', 'Here — in your likeness: a ladle of hot syrup, and… go!'),
  guan: L('关公！得配一把青龙偃月刀——刀比人还长，糖多加一勺。', 'Lord Guan! With the Green Dragon blade — longer than the man. An extra ladle of sugar.'),
  cat: L('照着你画？……胖了点，一勺糖不够，得两勺。', 'In your likeness? …A bit round. One ladle won’t do; two.'),
  change: L('嫦娥仙子，得有个月亮……还得有只兔子。', 'Lady Chang’e needs a moon… and a rabbit.'),
  rabbit: L('兔子最拿手！学吹糖人，头一个学的就是兔子。', 'Rabbits are my best! The first thing every sugar-blower learns.'),
  poet: L('诗仙举杯邀明月——这杯子得吹得薄薄的。', 'The Poet raising a cup to the moon — the cup must be blown paper-thin.'),
  swordsman: L('一个人，一把剑……嗯，剑比人大，这才像大侠。', 'A man and a sword… the sword bigger than the man. Now that’s a hero.'),
  taoist: L('小道长，拂尘的毛可难画了，您瞧好——', 'Little Taoist, the whisk’s hairs are the hard part — watch closely.'),
};

// ───────────────────────────── 卖花姑娘, the flower girl ─────────────────────────────

/** The season's flower: 0 spring … 3 winter. */
export const FLOWERS: { zh: string; en: string; call: Line; color: string }[] = [
  { zh: '杏花', en: 'apricot blossom', call: L('杏花，杏花——小楼一夜听春雨……', 'Apricot blossom! One night of spring rain…'), color: '#f2b8c0' },
  { zh: '栀子花', en: 'gardenia', call: L('栀子花，白兰花——', 'Gardenia! Magnolia!'), color: '#f6f1e2' },
  { zh: '桂花', en: 'osmanthus', call: L('桂花，香喷喷的桂花——', 'Osmanthus! Sweet osmanthus!'), color: '#e8b33a' },
  { zh: '蜡梅', en: 'wintersweet', call: L('蜡梅，蜡梅，雪里开的蜡梅——', 'Wintersweet, that blooms in the snow!'), color: '#e9c64a' },
];

export const FLOWER_HELLO: PerCompanion<Line> = {
  any: L('客官，买枝花吧？三文钱一枝。买了送给谁，都是一份心意。', 'A flower, friend? Three coins. Whoever you give it to, it’s a kindness.'),
  guan: L('将军也买花？……送给谁呀？（捂嘴偷笑）', 'A general buying flowers? …For whom? (She hides a giggle.)'),
  change: L('姐姐比花还好看！这枝送你，不要钱！', 'You’re prettier than the flowers! This one’s yours — free!'),
  cat: L('小猫咪，花不能吃哦……来，闻一闻。', 'Kitty, flowers aren’t for eating… here, have a sniff.'),
  poet: L('先生买枝花簪在帽檐上吧，「人老簪花不自羞」嘛。', 'Buy one for your hat, sir — “Old, but not ashamed to wear a flower,” as the poem says.'),
  gardener: L('园丁伯伯种的花比我的还好！这枝送您，您给我讲讲怎么养。', 'Your flowers beat mine, gardener! Take this one free — and tell me how you grow them.'),
  scholar: L('公子买花，是要送心上人吗？', 'Buying a flower, young sir? For someone special?'),
};

/** Given a flower: what each person says, and what they give back. */
export interface FlowerThanks { line: Line; coins?: number; card?: { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal: string } }
export const FLOWER_THANKS: Record<string, FlowerThanks> = {
  tea: { line: L('送我的？……插在茶壶边上，今天的茶都香了三分。这壶算我的！', 'For me? …By the teapot it goes — the tea smells sweeter already. This pot’s on me!'), coins: 6 },
  fisher: { line: L('给我老头子送花？哈哈哈，插到斗笠上！鱼见了都要多看两眼。', 'A flower for an old man? Ha! On my hat it goes — the fish will look twice.'), coins: 5 },
  monk: { line: L('出家人……那便供在佛前吧。善哉，施主心里有花。', 'A monk and a flower… I’ll set it before the Buddha. There are flowers in your heart, friend.'), card: { titleZh: '拈花', titleEn: 'Holding up a flower', bodyZh: '世尊拈花，迦叶微笑。\n\n一朵花，一个笑，\n什么也不必说。', bodyEn: 'The Buddha held up a flower; Kashyapa smiled.\n\nOne flower, one smile —\nnothing needs saying.', seal: '禅' } },
  poet: { line: L('以花换诗！拿去——', 'A flower for a poem! Here —'), card: { titleZh: '赠花', titleEn: 'For the one who brought a flower', bodyZh: '江南无所有，\n聊赠一枝春。\n\n—— 陆凯《赠范晔诗》', bodyEn: 'Nothing much here south of the river —\nso I send you a sprig of spring.\n\n— Lu Kai', seal: '春' } },
  kite: { line: L('送给我的？我要拿回去给我娘！她最喜欢花了！', 'For me? I’ll take it home to Mama! She loves flowers!'), coins: 5 },
  storyteller: { line: L('今儿有人给说书的送花——说书的也有春天呐！', 'Someone gave the storyteller a flower — even storytellers get a spring!'), coins: 8 },
  fortune: { line: L('老朽早算到今天有人送花……（其实没算到）来，送你一签，不收钱。', 'I foresaw someone bringing me a flower today… (he didn’t) Here — a slip on the house.') },
  peddler: { line: L('送我？我挑着它走遍四方！喏，这串糖葫芦你拿着。', 'For me? I’ll carry it all round the county! Here — have some candied haws.') },
  farmer: { line: L('好花！插在我家门口，老伴准高兴。给，自家的铜钱不多，一点心意。', 'Lovely! By my door it goes — the wife will be pleased. Here, a few coins, from the heart.'), coins: 10 },
  master: { line: L('一枝春色……多谢。这孩子若有你一半贴心就好了。', 'A sprig of spring… thank you. If only my boy were half so thoughtful.'), coins: 6 },
  sugar: { line: L('送我花？那我送你个小糖人！', 'A flower for me? Then a little sugar figure for you!') },
};

// ───────────────────────────── 老农, the old farmer ─────────────────────────────

export const FARMER_HELLO: PerCompanion<Line> = {
  any: L('后生，来看地啊？那边那片空地，就是你的家园了。', 'Come to look at the land, young one? That open ground there is your homestead.'),
  gardener: L('同行啊！你看我这垄沟挖得直不直？', 'A fellow of the soil! Tell me — are my furrows straight?'),
  cat: L('去去去，别刨我的菜地！……唉，算了，替我逮耗子去吧。', 'Shoo, shoo, don’t dig up my greens! …Oh, fine — go catch me a mouse.'),
  guan: L('关老爷也来巡田？……今年风调雨顺，托您老的福。', 'Lord Guan come to inspect the fields? …Fair wind and rain this year, thanks to you.'),
  taoist: L('小道长，给我这地画道符，保佑今年不闹虫。', 'Little Taoist, draw a talisman over my field so the bugs keep off this year.'),
  rabbit: L('兔子！我的白菜！……唉，看你这么白净，拿一棵去吧。', 'A rabbit! My cabbages! …Ah, so clean and white — take one.'),
  scholar: L('读书人，也该知道「谁知盘中餐，粒粒皆辛苦」。', 'A scholar ought to know: “Who knows each grain on the plate came of toil?”'),
  change: L('老汉种了一辈子地，今儿见着月亮上的人了……回去跟老伴说，她准不信。', 'A lifetime farming and today I meet someone from the moon… the wife won’t believe me.'),
};

export const FARMER_TIPS: Line[] = [
  L('家园那片空地，走到里头就能起屋、围篱、开菜畦。钱不够？多跑跑任务，路上的奇遇也常有铜钱。', 'On that open ground you can raise a house, put up a fence, dig vegetable beds. Short of coins? Do some errands — and the odd wonder on the road often pays.'),
  L('养狗看家，养猫捉鼠，养鸡下蛋。养什么都得天天喂，喂了才亲，亲了才跟你走。', 'A dog keeps the house, a cat the mice, a hen lays eggs. Feed them every day: fed, they grow fond; fond, they follow you.'),
  L('给家里的伙计起个好名字。人有了名字，干活都卖力些。', 'Give the folk at your place good names. People with names work with a will.'),
  L('各处都立着石碑。走到碑前，碑亮了——以后打开舆图，一点就到，腿脚能省不少。', 'There’s a stone stele in every place. Walk up to one and it lights; after that, tap it on the map and you’re there.'),
  L('菜要浇水才长得快。园丁那样的巧手，挥一挥锄，菜畦当场就熟了——我可没那本事。', 'Greens grow faster watered. A gardener with the knack can sweep his hoe and ripen a bed on the spot — not me.'),
  L('跑起来能快不少，可别在田埂上跑，踩坏了苗我可要骂人。', 'Running gets you there faster — just not on my field banks, or I’ll give you what for.'),
];

// ───────────────────────────── 书童 and his master ─────────────────────────────

export const SHUTONG_CLUE: Record<string, Line> = {
  village: L('先生说要去听说书、喝茶……', 'Master said he wanted to hear a story and drink tea…'),
  lake: L('先生说要去看荷花，还说要坐船……', 'Master said he wanted to see the lotus, and ride a boat…'),
  bamboo: L('先生说要去听竹子的声音，还要找人弹琴……', 'Master said he wanted to hear the bamboo, and find someone playing the qin…'),
  plum: L('先生说要去寻梅，爬到高处看……', 'Master said he was going to seek plum blossom, somewhere high up…'),
  mountain: L('先生说要去听钟，还要看瀑布……', 'Master said he wanted to hear the bell and see the waterfall…'),
};

export const SHUTONG_ASK: PerCompanion<Line> = {
  any: L('呜……我家先生出门赏景，我一转眼就把他跟丢了！你能帮我找找吗？', 'Waah… my master went out to see the sights and I lost him in a blink! Will you help me find him?'),
  cat: L('猫猫！你鼻子灵，帮我闻闻先生去哪儿了？', 'Kitty! You’ve got a good nose — sniff out where Master went?'),
  guan: L('关、关老爷！您帮我找先生，一定找得到！', 'L-Lord Guan! If you look for Master, you’re sure to find him!'),
  rabbit: L('小兔子，你耳朵长，能听见我家先生在哪儿吗？', 'Little rabbit, your ears are long — can you hear where Master is?'),
  taoist: L('松下问童子——哎，今天是童子问道士！你见过我家先生吗？', '“I asked the boy beneath the pine” — today the boy asks the Taoist! Have you seen my master?'),
  change: L('神仙姐姐，你在天上看得远，能看见我家先生吗？', 'Fairy sister, you can see far from the sky — can you see my master?'),
};

export const MASTER_FOUND: PerCompanion<Line> = {
  any: L('哎呀，那孩子又走丢了？……还是我走丢了？劳烦把这字条带给他：「原地等我，一会儿就回。」', 'Oh dear, is the boy lost again? …Or is it me? Please take him this note: “Wait where you are, I’ll be back soon.”'),
  taoist: L('松下问童子——你便是来问的那位吧？哈哈。劳烦把字条带给他：「原地等我。」', '“I asked the boy beneath the pine” — and here you are, asking! Ha. Please take him this note: “Wait where you are.”'),
  poet: L('太白兄！我那书童要是知道我跟你喝了一壶，又要念叨了。这字条烦你带去。', 'Brother Li Bai! If my boy knew I’d shared a jug with you he’d scold me. Take him this note, would you?'),
  guan: L('关、关将军亲自来寻？在下惭愧，惭愧！字条在此，劳将军转交。', 'Lord Guan come looking in person? I am ashamed, ashamed! Here is a note — if the general would deliver it.'),
  cat: L('一只猫……来找我？莫非是那孩子派来的？好，字条系在你颈上，快去。', 'A cat… looking for me? Did the boy send you? Very well — the note goes on your collar. Off you go.'),
  painter: L('画师！快帮我画张寻人启事——哦不，是寻童启事。算了，你帮我带张字条吧。', 'Painter! Draw me a “missing person” notice — no, a “missing boy” notice. Never mind, take him a note.'),
  change: L('……（先生看着你，愣了好一会儿）啊，失礼。那孩子……对，字条，劳烦仙子。', '…(He stares at you a long while.) Ah, forgive me. The boy… yes, a note — if you would.'),
};

export const SHUTONG_DONE: PerCompanion<Line> = {
  any: L('先生让我「原地等他」？我本来就在原地呀！……谢谢你！这是先生给的赏钱，分你一半。', 'Master says “wait where you are”? But I was where I was all along! …Thank you! Here — half the tip Master gave me.'),
  cat: L('猫猫把字条叼回来了！你真是只好猫！', 'The kitty brought the note back! What a good cat!'),
  guan: L('关老爷亲自送信！我回去要跟所有人讲！', 'Lord Guan delivered it himself! I’m telling everyone!'),
};

// ───────────────────────────── the five of the minigames: a hello for some companions ─────────────────────────────

export const TEA_HELLO: PerCompanion<Line | null> = {
  any: null,
  guan: L('关老爷驾到！小店蓬荜生辉——上最好的龙井！', 'Lord Guan! My humble shop shines — bring out the finest Longjing!'),
  cat: L('又是你这只馋猫！后厨的鱼干……算了，给你一块。', 'You greedy cat again! The dried fish in the kitchen… oh, fine, have a piece.'),
  poet: L('诗仙来了！茶是有，酒……也有，藏在柜台底下。', 'The Poet Immortal! Tea we have, and wine… also, under the counter.'),
  change: L('仙子请上坐——小的这就去泡一壶桂花茶。', 'Please, fair lady, the best seat — I’ll brew some osmanthus tea at once.'),
  musician: L('琴师来了！今儿能在小店弹一曲吗？茶钱全免！', 'The qin player! Would you play in my shop today? Tea’s on the house!'),
  fisher: L('老哥，今天的鱼送我店里来！做鱼汤！', 'Old friend, bring me today’s catch — fish soup!'),
};
export const FISHER_HELLO: PerCompanion<Line | null> = {
  any: null,
  fisher: L('同道！今天水温正好，鲤鱼都浮上来了。', 'A brother of the rod! The water’s just right today — the carp are up.'),
  cat: L('又来偷鱼？……喏，小的给你，大的留给我。', 'Come to steal fish again? …Here, the little one’s yours; the big one’s mine.'),
  guan: L('关将军也钓鱼？水淹七军那回，鱼可遭了殃。', 'Lord Guan fishes too? When you flooded the seven armies, the fish had a rough time.'),
  poet: L('太白兄，「闲来垂钓碧溪上」——坐下，一起钓。', '“At leisure I fish by the blue stream,” eh, Li Bai? Sit and fish with me.'),
  change: L('嫦娥仙子……老汉活了七十年，头一回见。', 'Lady Chang’e… seventy years I’ve lived, and I’ve never seen the like.'),
  rabbit: L('月亮上也有鱼吗？……没有？那你多钓几条带回去。', 'Are there fish on the moon? …No? Then catch a few to take home.'),
};
export const MONK_HELLO: PerCompanion<Line | null> = {
  any: null,
  guan: L('阿弥陀佛——伽蓝菩萨护法到了！贫僧有礼。', 'Amituofo — the temple’s guardian, Sangharama, has come! I bow to you.'),
  cat: L('寺里的猫都胖。施主……也胖。', 'The temple cats are all fat. So are you, friend.'),
  taoist: L('道友！佛道本一家，请上一炷香。', 'A friend of the Way! Buddhists and Taoists are one family — light some incense.'),
  poet: L('李施主，寺里禁酒——葫芦请挂在山门外。', 'Master Li, no wine in the temple — hang your gourd outside the gate.'),
  change: L('……阿弥陀佛，罪过罪过，贫僧不该多看。', '…Amituofo. Forgive me, I should not stare.'),
  swordsman: L('施主剑气太重。放下，放下。', 'Your sword’s spirit is heavy, friend. Set it down, set it down.'),
};
export const POET_NPC_HELLO: PerCompanion<Line | null> = {
  any: null,
  poet: L('太白先生！在下斗胆——飞花令还请手下留情。', 'Master Li Bai! I dare to ask — go easy on me at Flying Flowers.'),
  guan: L('关将军也来行令？输了罚酒，将军海量。', 'Lord Guan plays too? The loser drinks — and you have a mighty capacity.'),
  cat: L('一只猫来行飞花令？……好，「猫」字令，你先来。', 'A cat for Flying Flowers? …Fine: the key is “cat”. You first.'),
  change: L('「嫦娥应悔偷灵药」……哎呀，失言失言！', '“Chang’e must regret stealing the elixir”… oh! Forgive me, a slip of the tongue!'),
  scholar: L('兄台，良辰美景，来一局？', 'My friend — fine hour, fine view: a round?'),
  musician: L('有琴有诗，此亭今日不虚。', 'A qin and verses — the pavilion is well used today.'),
};
export const KITE_HELLO: PerCompanion<Line | null> = {
  any: null,
  cat: L('猫咪！你能爬竹子，帮我把风筝够下来吗？', 'Kitty! You can climb bamboo — can you get my kite down?'),
  guan: L('哇，关公！你的大刀能把风筝够下来吗？', 'Wow, Lord Guan! Can your big blade reach my kite?'),
  rabbit: L('小兔子！等我找到风筝，陪我玩！', 'A bunny! When I’ve found my kite, play with me!'),
  change: L('你是仙女吗？你会飞吗？帮我拿风筝好不好！', 'Are you a fairy? Can you fly? Please get my kite!'),
  taoist: L('小道士哥哥，你跳得高，帮帮我！', 'Taoist brother, you jump so high — help me!'),
  swordsman: L('大侠！你会轻功，一定能把风筝拿下来！', 'A hero! You know lightness skill — you can get it down!'),
};
