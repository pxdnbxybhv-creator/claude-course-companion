// 桃源 · 二期: every line of the six valley games (spec §5), paired {zh, en}. Lines said by a villager sit
// under that villager's key (qin, duer, ashu, sang, xiaoman, lusan, gegu…) so the style lint knows the
// speaker; the period quotations on the result cards are kept in their own shape (poem / poet), not
// {zh, en}, because they are exempt from the lint. {名} is filled at render; {n} and {who} by the games.
//
// Owner: G. tests/taoyuan-food.test.ts and tests/taoyuan-games.test.ts lint every line here.
import type { GameId } from '../types';
import type { Line } from '../types';

const t = (zh: string, en: string): Line => ({ zh, en });

// ───────────────────────────── the frame (the start card, the result card, 出谷)

export const FRAME = {
  title: t('谷中小戏', 'Valley games'),
  start: t('开始', 'Start'),
  gentle: t('慢些', 'Gentler'),
  gentleNote: t('慢些玩：不记印', 'Gentler: no seals'),
  today: t('今日', 'Today'),
  best: t('最好', 'Best'),
  bestGentle: t('慢些', 'Gentler'),
  none: t('还没玩过', 'Not played yet'),
  sealed: t('得印', 'Sealed'),
  unsealed: t('未得印', 'No seal yet'),
  mood: t('心境', 'Mood'),
  yue: t('今日之约', "Today's challenge"),
  yueMet: t('今日之约，成了！', "Today's challenge: beaten!"),
  jarFull: t('坛子满了', "The jar's full"),
  noGoods: t('今天这局不给土产了', 'No more goods from this one today'),
  got: t('得', 'Got'),
  score: t('得分', 'Score'),
  newBest: t('新的最好成绩！', 'A new best!'),
  seal: t('得印', 'Seal earned'),
  close: t('离开', 'Leave'),
  again: t('再来', 'Again'),
  confirm: t('这局不玩了？', 'Stop this round?'),
  stopIt: t('不玩了', 'Stop'),
  keepOn: t('接着玩', 'Keep playing'),
  busy: t('这会儿走不开。', "Not now, I'm busy."),
  refusedDrunk: t('一身酒气，蚕闻不得。先去井边洗把脸。', 'You smell of wine and the worms can’t bear it. Wash your face at the well first.'),
  grade: { 初: t('初', 'Novice'), 熟: t('熟', 'Practised'), 精: t('精', 'Masterly') } as Record<'初' | '熟' | '精', Line>,
};

/** The games' names, and the kinds they pay (for the card). */
export const GAME_NAME: Record<GameId, Line> = {
  qu: t('踩曲', 'Treading the yeast'),
  mo: t('摸鱼', 'Fishing by hand'),
  can: t('采桑喂蚕', 'Feeding the silkworms'),
  yuan: t('纸鸢', 'The singing kite'),
  ying: t('捉萤', 'Catching fireflies'),
  shang: t('流觞', 'Steering the cup'),
};

/** The stand prompts: where, and what. */
export const STAND: Record<GameId, { label: Line; action: Line }> = {
  qu: { label: t('酒坊前 · 曲池', 'The yeast pit by the brewery'), action: t('踩曲', 'Tread yeast') },
  mo: { label: t('溪边浅滩', 'The stream shallows'), action: t('摸鱼', 'Fish by hand') },
  can: { label: t('蚕房门口', 'The silk-room door'), action: t('喂蚕', 'Feed the worms') },
  yuan: { label: t('洞口台子', 'The terrace by the mouth'), action: t('放纸鸢', 'Fly a kite') },
  ying: { label: t('溪岸', 'The stream bank'), action: t('捉萤', 'Catch fireflies') },
  shang: { label: t('流觞渠', 'The cup channel'), action: t('流觞', 'Float the cups') },
};

/** The period quotation on each result card (exempt from the lint: not a villager's line). */
export interface Quote { poem: string; poet: string; en: string; enBy: string }
export const QUOTES: Record<GameId, Quote> = {
  qu: { poem: '春秫作美酒，酒熟吾自斟。', poet: '陶渊明', en: 'Spring millet makes good wine; when it is ready, I pour my own.', enBy: 'Tao Yuanming' },
  mo: { poem: '桃花流水鳜鱼肥。', poet: '张志和', en: 'Peach blossom on the water, and the mandarin fish are fat.', enBy: 'Zhang Zhihe' },
  can: { poem: '春蚕收长丝，秋熟靡王税。', poet: '陶渊明', en: 'Spring worms give long silk; the autumn harvest owes no tax.', enBy: 'Tao Yuanming' },
  yuan: { poem: '儿童散学归来早，忙趁东风放纸鸢。', poet: '高鼎', en: 'Home early from school, the children hurry to fly kites on the east wind.', enBy: 'Gao Ding' },
  ying: { poem: '轻罗小扇扑流萤。', poet: '杜牧', en: 'A little silk fan swats at the drifting fireflies.', enBy: 'Du Mu' },
  shang: { poem: '引以为流觞曲水，列坐其次。', poet: '王羲之', en: 'We led it round as a winding stream for floating cups, and sat along its banks.', enBy: 'Wang Xizhi' },
};

/** 鲁三's prop nods (the first round ever of each game, if he is about). */
export const LUSAN = {
  lusan: {
    qu: t('曲模。新钉的。', 'Yeast mould. New nails.'),
    mo: t('鱼篓。新编的。', 'Creel. New weave.'),
    can: t('蚕匾。补过。', 'Silkworm tray. Mended.'),
    yuan: t('竹骨。新削的。', 'Bamboo frame. Fresh cut.'),
    ying: t('扇子。新糊的。', 'Fan. New paper.'),
    shang: t('觞。漆过了。', 'Cups. Lacquered.'),
  } as Record<GameId, Line>,
};

// ───────────────────────────── 踩曲 · 杜二 (spec §5.1)

export const QU = {
  duer: {
    rules: [
      t('左脚右脚，跟着我的号子踩！踩歪一脚，这块曲就松了。', 'Left foot, right foot, tread to my call! One crooked step and the cake falls apart.'),
      t('阿黍！你也过来，看人家怎么踩的！', 'A Shu! Come over here and watch how it’s done!'),
    ],
    win: t('好脚力！这块曲我杜二收着，出了酒头一碗归你！', 'Good legs! I’ll keep this cake myself, and the first bowl it brews is yours!'),
    lose: t('松了松了……不打紧。来，先喝一口再踩。', 'It’s falling apart… never mind. Here, have a drink first, then tread again.'),
    good: t('这块曲你拿着，回头拿它来换酒，我杜二认账！', 'Take this cake. Bring it back for wine, and I, Du Er, will honour it!'),
    barks: [
      t('好！', 'Good!'),
      t('阿黍，你看看人家！', 'A Shu, look at this!'),
      t('我杜二踩了三十年，也就这样！', 'Thirty years I’ve trodden yeast, and that’s as good as it gets!'),
    ],
    calibrate: t('跟着我拍八下，我听听你的脚底板。', 'Clap along with me eight times. Let me hear your feet.'),
    call: t('听我的！', 'Listen to me!'),
    echo: t('该你了！', 'Your turn!'),
  },
  calibrateTitle: t('跟着杜二拍八下', 'Clap along with Du Er, eight times'),
  calibrateDone: t('校好了', 'Timed'),
  hint: t('左半边、右半边；两边一齐是跺；按住是碾', 'Tap left or right; both at once to stamp; hold to grind'),
  hintKeys: t('F 左 · J 右 · 空格 跺 · 按住 碾', 'F left · J right · Space stamp · hold to grind'),
  song: t('号子', 'Call'),
  lanes: { L: t('左', 'L'), R: t('右', 'R'), B: t('跺', 'Stamp') },
  judge: { 正: t('正', 'Spot on'), 好: t('好', 'Good'), miss: t('歪', 'Off') },
  callBonus: t('喊号 +20', 'Call and answer +20'),
  combo: t('连', 'Combo'),
  locked: t('先在别的号子上踩熟了再来', 'Get practised on another call first'),
  accuracy: t('准头', 'Accuracy'),
};

// ───────────────────────────── 摸鱼 · 阿黍 (spec §5.2)

export const MO = {
  ashu: {
    rules: [
      t('手放水里，别动。鱼碰着你了再合手。', 'Hands in the water. Keep still. Close them when a fish touches you.'),
      t('我一早上摸了五条。你摸得过我？', 'I got five this morning. Think you can beat me?'),
    ],
    win: t('……你偷偷练过吧。', '…You’ve been practising.'),
    lose: t('我七条！……六条半。', 'Seven! …Six and a half.'),
    after: t('晚上来，火边烤。', 'Come by tonight. We’ll grill it.'),
    tally: t('我{n}条。', 'I got {n}.'),
    slipped: t('滑了。', 'Slipped.'),
    gui: t('鳜！', 'A mandarin fish!'),
  },
  creel: t('阿黍的篓', 'A Shu’s creel'),
  mine: t('你的', 'Yours'),
  tap: t('快拍！', 'Tap, quick!'),
  hint: t('按住水面把手沉下去，慢慢挪，松手合拢', 'Hold on the water to sink your hands, move slowly, let go to close'),
  hintKeys: t('WASD 挪手 · 按住空格 沉手', 'WASD to move · hold Space to sink'),
  fish: { ji: t('鲫', 'Crucian'), li: t('鲤', 'Carp'), qiu: t('泥鳅', 'Loach'), xia: t('虾', 'Shrimp'), gui: t('鳜', 'Mandarin fish') },
  mud: t('水浑了', 'Muddied'),
};

// ───────────────────────────── 采桑喂蚕 · 三娘 (spec §5.3)

export const CAN = {
  sang: {
    rules: [
      t('嫩叶给小的，老叶给大的。湿的先晾，黄斑的扔了。', 'Tender leaves for the little ones, old leaves for the big ones. Dry the wet ones first. Throw out the spotted ones.'),
      t('手轻些，客人。它们怕吵。', 'Gently. They don’t like noise.'),
    ],
    win: t('……还行。明天还来？', '…Not bad. Coming back tomorrow?'),
    lose: t('我来吧。（她把篮子接了过去。）', 'I’ll do it. (She takes the basket back.)'),
    asleep: t('客人，眠了。', 'They’re asleep.'),
    noise: t('手轻些，客人。', 'Gently.'),
    wet: t('湿的。', 'Wet.'),
    drunk: t('客人身上有酒气。蚕闻不得，先去井边洗把脸。', 'You smell of wine. The worms can’t bear it. Wash your face at the well first.'),
  },
  right: t('正是时候', 'Just in time'),
  full: t('饱着呢', 'They’re full'),
  ok: t('嗯', 'Fine'),
  wrong: t('喂错了', 'Wrong leaf'),
  spotted: t('黄斑的', 'Spotted'),
  trays: [t('蚁蚕', 'Hatchlings'), t('二眠', 'Second sleep'), t('三眠', 'Third sleep'), t('大蚕', 'Big worms')],
  rack: t('晾架', 'Rack'),
  basket: t('篮', 'Basket'),
  jar: t('罐', 'Jar'),
  climb: t('上簇了', 'Spinning'),
  cocoon: t('结茧', 'Cocoon'),
  hint: t('拖叶子到蚕匾、晾架或篮里；或先点叶子再点去处', 'Drag a leaf to a tray, the rack or the basket; or tap the leaf, then where it goes'),
  hintKeys: t('1–4 蚕匾 · R 晾架 · X 篮 · B 桑葚进罐', '1–4 trays · R rack · X basket · B berry to the jar'),
};

// ───────────────────────────── 纸鸢 · 小满 (spec §5.4)

export const YUAN = {
  xiaoman: {
    rules: [
      t('按住收线，松开放线！然后……然后看花瓣，花瓣一飞快，风就来了！', 'Hold to reel in, let go to let it out! And then — and then watch the petals. When they speed up, the wind’s coming!'),
      t('线绷太紧会断。上回断了，阿爷说要打我手心。', 'Pull it too tight and it snaps. Last time it snapped, Grandpa said he’d smack my palm.'),
    ],
    win: t('你的会唱！呜——我的怎么不唱！', 'Yours sings! Wooo — why won’t mine sing!'),
    lose: t('哐！挂树上了……我去爬，你别告诉我娘。', 'Bang! It’s stuck in the tree… I’ll climb up. Don’t tell Mum.'),
    tangle: t('缠上了！然后……然后我的也掉了！', 'We’re tangled! And then — and then mine fell too!'),
    good: t('给你，阿黍家鹅下的。别跟阿黍说。', 'Here. A Shu’s geese laid it. Don’t tell A Shu.'),
    crash: t('挂树上了！等我，我去爬！', 'It’s in the tree! Wait, I’ll climb up!'),
    snap: t('断了！……阿爷不在吧？', 'It snapped! …Grandpa’s not around, is he?'),
    inhale: t('洞在吸气了！拽住！', 'The cave’s breathing in! Hold on!'),
    bird: t('青鸟落你线上了！', 'The bluebird’s landed on your string!'),
  },
  height: t('尺', 'ft'),
  tension: t('线', 'Line'),
  sing: t('鹞琴', 'Singing'),
  ring: t('花环', 'Ring'),
  hint: t('按住收线，松开放线；左右拖着走', 'Hold to reel in, let go to let out; drag to steer'),
  hintKeys: t('按住空格收线 · A / D 左右', 'Hold Space to reel in · A / D to steer'),
  kites: { yan: t('燕', 'Swallow'), die: t('蝶', 'Butterfly'), ying: t('鹰', 'Hawk') },
  kiteNew: t('鲁三给你扎了新骨架', 'Lu San has made you a new frame'),
};

// ───────────────────────────── 捉萤 · 小满 and 阿黍 (spec §5.5)

export const YING = {
  xiaoman: {
    rules: [
      t('亮的时候才扑得着！暗的你一扑，它就跑了。', 'You can only get them when they’re lit! Swipe at a dark one and it runs off.'),
    ],
    lose: t('我比你多！然后阿黍比我多……', 'I got more than you! And then A Shu got more than me…'),
    sweet: t('给你一只，我先捉的。', 'Have one. I caught it first.'),
    free: t('放了吧，明天还来捉。', 'Let them go. They’ll be back tomorrow.'),
  },
  ashu: {
    rules: [t('一网三只，才算本事。', 'Three in one sweep. That’s skill.')],
    late: [t('亮了再扑。', 'Wait till it’s lit.'), t('一网三只。', 'Three a sweep.')],
    win: t('……你手比我快。', '…Your hands are faster than mine.'),
    lose: t('我多。', 'More than you.'),
    good: t('夜里露水大，溪边冒了菌子。给。', 'Heavy dew tonight. Mushrooms came up by the stream. Here.'),
    sweet: t('给。', 'Here.'),
    free: t('放了吧，明天还来捉。', 'Let them go. They’ll be back tomorrow.'),
    after: t('鱼在火上了。', 'The fish is on the fire.'),
  },
  net: t('一网！', 'Three in one!'),
  king: t('萤王！', 'The Firefly King!'),
  sync: t('一齐亮了', 'All together now'),
  caught: t('捉了', 'Caught'),
  hint: t('划一下扫过去，亮着的才扑得着', 'Swipe to sweep the fan; only lit ones can be caught'),
  hintKeys: t('拖鼠标扫 · 或 WASD 移、空格扫', 'Drag to sweep · or WASD to move, Space to sweep'),
};

// ───────────────────────────── 流觞 · 秦守拙 hosts, 杜二 fills (spec §5.6)

export const SHANG = {
  qin: {
    rules: [
      t('签子抽到谁，你就把觞送到谁跟前。停在谁跟前，谁作一句，作不出就喝。', 'Whoever’s lot is drawn, you bring the cup to them. Whoever it stops at makes a line of verse, or drinks.'),
      t('拨轻些。上回杜二一竿子，把觞拨进了田里。', 'Go gently. Last time Du Er gave it one poke with a pole and sent it into the field.'),
    ],
    lot: t('这一觞——{who}。', 'This cup — {who}.'),
    lotTwo: t('这一回两觞——{who}。', 'Two cups this time — {who}.'),
    win: t('五觞五停。嗯……这个要记进簿子里。', 'Five cups, five stops. Mm… that goes in the register.'),
    lose: t('停错了？停错了也是一觞。喝吧，都喝。', 'Stopped wrong? Wrong’s still a cup. Drink. Everyone drink.'),
    tally: t('{n}觞，停对了{m}觞。嗯。', '{n} cups, {m} stopped right. Mm.'),
    tallyNone: t('五觞，一觞都没停对。嗯。', 'Five cups, and not one stopped right. Mm.'),
    good: t('新黍，一升。拿去给桂娘。', 'New millet, one measure. Take it to Gui Niang.'),
    you: t('你', 'you'),
    feihua: t('轮到你了。接一句，有「{ling}」字的。', 'Your turn. Pick the line with the character {ling} in it.'),
    feihuaRight: t('接得好。', 'Well answered.'),
    feihuaWrong: t('不对，喝。', 'Wrong. Drink.'),
  },
  duer: {
    spill: t('洒了！', 'Spilled!'),
    missed: t('不能糟蹋！', 'Can’t waste it!'),
    forfeit: t('罚得好！', 'Serves me right!'),
  },
  gegu: {
    tally: t('五觞，停对四觞。杜二那觞不算，他什么都喝。', 'Five cups, four stopped right. Du Er’s doesn’t count, he drinks anything.'),
    forfeit: t('今天第二杯。我记着。', 'My second today. I’m counting.'),
  },
  lusan: { forfeit: t('……喝。', '…Drinking.') },
  guiniang: {
    forfeit: t('我锅里还煮着东西呢！', 'I’ve got a pot on!'),
    supper: t('鸡黍好了，趁热。', 'The chicken and millet’s ready. Eat it hot.'),
  },
  shigu: { forfeit: t('你拨了三下，第三下重了。', 'You poked it three times. The third was too hard.') },
  xiaoman: { forfeit: t('我喝甜的！', 'I’m having the sweet one!') },
  liupo: { forfeit: t('你拨歪了，不算。……好好好，我喝。', 'You poked it crooked, that doesn’t count. …All right, all right, I’ll drink.') },
  eat: t('吃一碗', 'Eat a bowl'),
  own: t('你的座', 'Your seat'),
  brake: t('拦', 'Brake'),
  poke: t('拨', 'Poke'),
  cup: t('觞', 'Cup'),
  right: t('停对了', 'Right bay'),
  wrong: t('停错了', 'Wrong bay'),
  hint: t('点觞旁边把它拨开；按住它前面拦一拦', 'Tap beside the cup to poke it away; hold just ahead of it to brake'),
  hintKeys: t('A / D 拨 · S 拦', 'A / D to poke · S to brake'),
  drink: t('喝了一杯，脸上发烫', 'You drink. Your face goes warm'),
};

/** The villagers' plain names for the games (the card, the lots). */
export const NAMES: Record<string, Line> = {
  qin: t('秦守拙', 'Qin Shouzhuo'), duer: t('杜二', 'Du Er'), ashu: t('阿黍', 'A Shu'), sang: t('三娘', 'Sanniang'),
  xiaoman: t('小满', 'Xiaoman'), guiniang: t('桂娘', 'Gui Niang'), shigu: t('石瞽', 'Shi Gu'), liupo: t('柳婆', 'Liu Po'),
  gegu: t('葛姑', 'Ge Gu'), lusan: t('鲁三', 'Lu San'),
};
