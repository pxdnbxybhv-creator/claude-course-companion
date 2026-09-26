// Stories told a beat a day (see folk.ts): each belongs to some companions (or anyone), and is told in
// their own words — the watchman who fears the dark tells 关公, the night he saw someone step off the
// moon he tells 嫦娥, the lanterns knocked over he grumbles about to 大橘. Beats set play flags
// arc:<folk>:<arc>:<n>; some wait on a letter (王四娘's letter home, answered through the mail).
import { L, type Voiced } from './logic';
import type { Arc, Beat, Card, DLine } from './folk';
import { M } from './folk-lines';
import { WANGDA_READ, WANG_LETTER_DAY } from './letters';

const card = (titleZh: string, titleEn: string, bodyZh: string, bodyEn: string, seal: string): Card => ({ titleZh, titleEn, bodyZh, bodyEn, seal });
const b = (lines: Voiced<DLine[]>, o: Omit<Beat, 'lines'> = {}): Beat => ({ lines, ...o });


export const ARCS: Record<string, Arc[]> = {
  // ── 更夫老吴 the watchman (out only at night)
  'v.wu': [
    { id: 'dark', who: ['guan', '@wu'], beats: [
      b({
        any: [L('……跟您说句实话：打了二十年更，我怕黑。西头那条老井巷，灯笼一进去就灭，巷底还有响动。', '…I’ll tell you the truth: twenty years a watchman, and I’m afraid of the dark. The old-well lane at the west end — lanterns go out the moment they enter, and something stirs at the far end.'), M('巷子里有什么，我替你去看。明夜一起走。', 'Whatever is in that lane, I’ll see to it. We walk it together tomorrow night.')],
        guan: [L('关老爷在，小的斗胆说句实话：打了二十年更，我怕黑。西头老井巷，灯一进去就灭，巷底有响动……', 'With Lord Guan here I dare say it: twenty years a watchman and I’m afraid of the dark. In the old-well lane, lanterns go out, and something stirs at the far end…'), M('怕，不丢人。明夜，某与你同去。', 'Fear is no shame. Tomorrow night, I go with you.')],
      }),
      b({
        any: [L('（你们一同走进老井巷。灯灭了——是井口的风。巷底扑棱棱飞起一只夜猫子。）……原来是风。原来是鸟。', '(You walk into the old-well lane together. The lantern goes out — a draught from the well mouth. At the far end an owl bursts up.) …Only the wind. Only a bird.')],
        guan: [L('（关公提灯在前，刀未出鞘。井口的风吹灭了灯，巷底扑棱棱飞起一只夜猫子——关公纹丝未动。）……原来是风。原来是鸟。', '(Lord Guan walks ahead with the lantern, blade still sheathed. The draught from the well blows it out; an owl bursts up at the end of the lane — he does not so much as flinch.) …Only the wind. Only a bird.'), M('心中无愧，何惧暗处。', 'With nothing on your conscience, what is there to fear in the dark?')],
      }),
      b({
        any: [L('如今我一个人走老井巷，梆子也敲得山响了。这个给你，我自己糊的灯罩，风吹不灭。', 'Now I walk the old-well lane alone and knock my clapper loud as you like. Here — a lantern shade I pasted myself. The wind can’t blow it out.')],
      }, { reward: { coins: 30, card: card('打更', 'The Night Watch', '笃——笃，笃。\n平安无事。\n\n老吴说：怕黑不丢人，\n丢人的是不敢说。', 'Tok — tok, tok.\nAll is well.\n\nOld Wu says: being afraid of the dark is no shame;\nthe shame is in not saying so.', '更') } }),
    ] },
    { id: 'moon', who: ['change', 'rabbit'], beats: [
      b({
        change: [L('……您别怪我多嘴。三年前中秋，三更天，我在石桥上，看见一个人从月亮上一步一步走下来——白衣裳，跟您一模一样。', '…Forgive my loose tongue. Three years ago, mid-autumn, third watch, I was on the stone bridge and saw someone step down from the moon, one stair at a time — in white, exactly like you.'), M('……那夜，我只是想看看人间的灯。', '…That night, I only wanted to see the lanterns of the world.')],
        any: [L('兔子？……跟你讲，三年前中秋，我看见月亮上下来一个白衣裳的人，怀里还抱着只兔子——莫不就是你？', 'A rabbit? …Listen: three years ago at mid-autumn I saw someone in white come down from the moon, holding a rabbit — was it you?'), M('（玉兔的耳朵一下子竖了起来。）', '(The Jade Rabbit’s ears shoot straight up.)')],
      }),
      b({
        change: [L('那夜……您在桥上站了很久，看河里的灯。我没敢出声，只多敲了一更，怕惊着您。……原来是真的。', 'That night… you stood on the bridge a long while, watching the lanterns on the river. I didn’t dare make a sound — I only knocked one extra watch, afraid of startling you. …So it was true.')],
        any: [L('后来那人在桥上站了好久，兔子从她怀里跳下来追河灯，差点掉进水里——是我拿梆子把它拦住的！', 'She stood on the bridge a long while; the rabbit jumped down to chase the river lanterns and nearly fell in — I stopped it with my clapper!'), M('（玉兔不好意思地把脸埋进爪子里。）', '(The Jade Rabbit hides her face in her paws.)')],
      }),
      b({
        change: [L('这事我谁也没说过，说了也没人信。今儿说给您听了，心里就踏实了。——这张纸，是那夜我照着月亮描的。', 'I’ve never told a soul — who’d believe me? Now I’ve told you, my heart is easy. — This paper: I traced it by the moon that night.')],
        any: [L('兔子，下回中秋，你带她再来桥上看灯，我给你们敲一更「平安无事」。这张纸，是那夜我照着月亮描的。', 'Rabbit, next mid-autumn bring her back to the bridge for the lanterns, and I’ll knock you a watch of “all is well”. This paper — I traced it by the moon that night.')],
      }, { reward: { coins: 20, card: card('桥上月', 'Moon on the Bridge', '三更天，石桥上，\n有人从月里下来，\n看了一夜人间灯。\n\n—— 老吴，描于中秋', 'Third watch, on the stone bridge,\nsomeone came down out of the moon\nand watched the world’s lanterns all night.\n\n— traced by Old Wu, at mid-autumn', '月') } }),
    ] },
    { id: 'lamps', who: ['cat'], beats: [
      b({ any: [L('又是你！这半个月，镇上的灯笼夜夜被扑倒，灯油洒一地——说，是不是你干的？', 'You again! For half a month the town’s lanterns have been knocked down every night, oil all over — out with it, was it you?'), M('喵？（大橘一脸无辜。）', 'Mrrow? (Big Ginger, the picture of innocence.)')] }),
      b({ any: [L('昨夜我守了半宿，看见了：风一吹，灯笼一晃，你就扑上去——原来是跟灯影子打架！', 'Last night I kept watch half the night and saw it: the wind blows, the lantern sways, and you pounce — fighting the lantern’s shadow!'), M('喵！（大橘的尾巴炸成了鸡毛掸子。）', 'Mrrrow! (Big Ginger’s tail puffs up like a feather duster.)')] }),
      b({ any: [L('罢了罢了，我叫卫九把灯笼挂高些。给，一条小鱼干，算我请你——往后可别扑灯了，着了火了不得。', 'Oh, never mind — I’ll have Wei Jiu hang the lanterns higher. Here, a little dried fish, on me. Just don’t pounce on lanterns — a fire would be no joke.')] }, { reward: { coins: 15 } }),
    ] },
  ],

  // ── 菱角王四娘: her husband's boat is three months overdue
  'v.lingjiao': [
    { id: 'boat', who: ['fisher', '@nong'], beats: [
      b({
        any: [L('您是种地的，水上的事怕是不懂……我当家的王大，开春撑船往下游送菱角，三个月了，没回来。', 'You work the land — maybe you don’t know the water… My husband Wang Da took the boat downriver with chestnuts in spring. Three months, and he hasn’t come back.'), M('地上的事我懂，水上的事，我去问问渔家。', 'I know the land. For the water, I’ll ask the fishing folk.')],
        fisher: [L('老哥是水上的人，帮我留个心：我当家的王大，开春撑船往下游送菱角，三个月了没回来。船头漆着一个「王」字。', 'You’re a man of the water — keep an eye out for me: my husband Wang Da took his boat downriver with chestnuts in spring, and in three months he hasn’t come back. There’s a “Wang” painted on the bow.'), M('漆「王」字的乌篷船？……我记下了。水上的事，总打听得到。', 'A black-awning boat with “Wang” on the bow? …I’ll remember. Word travels on the water.')],
      }),
      b({
        any: [L('（你把渔家的话说给她：下游瓜洲渡口，有人见过船头漆「王」字的乌篷船，在给盐船拉纤。）……拉纤？他那腰……他还活着？他还活着！', '(You tell her what the fishing folk said: at Guazhou ferry downriver, someone saw a black-awning boat with “Wang” on its bow, towing salt barges.) …Towing? With his back… He’s alive? He’s alive!')],
        fisher: [L('（渔翁把打听来的话说给她：瓜洲渡口，漆「王」字的船，在给盐船拉纤。）……他还活着！', '(The old fisherman tells her what he learned: at Guazhou ferry, a boat with “Wang” on its bow, towing salt barges.) …He’s alive!'), M('船还在，人就在。拉纤是苦，苦也是活着。', 'The boat is there, so the man is. Towing is hard — but hard is alive.')],
      }),
      b({ any: [L('活着就好。活着，总会回来的。——这包菱角你拿着，今儿头一篮，最甜。', 'Alive is enough. Alive, he’ll come home. — Take these chestnuts: today’s first basket, the sweetest.')] }, { reward: { coins: 30 } }),
    ] },
    { id: 'letter', who: ['scholar', 'poet', '@wen'], beats: [
      b({
        any: [L('您是读书人……我斗大的字不识一筐。想托您写封信，捎给下游瓜洲的王大——就说家里都好，菱儿长高了，叫他……叫他早些回来。', 'You’re a reader… I can’t read a word. Would you write a letter for me, to Wang Da at Guazhou downriver? Say all is well at home, Ling’er has grown, and tell him… tell him to come home soon.'),
          { ...M('好，明日我带了纸笔来写。', 'Gladly — I’ll bring brush and paper tomorrow.') }],
        poet: [L('太白先生，您的诗天下人都念。我只求您写一封家信……不用押韵。', 'Master Li, the whole world recites your poems. I only ask you for a letter home… it needn’t rhyme.'), M('家书抵万金，押什么韵。四娘你说，我来写。', 'A letter home is worth ten thousand in gold — who needs rhyme? You speak, Siniang; I’ll write.')],
      }),
      b({
        any: [L('（你研墨铺纸，照她说的，一句一句写下去。她说得慢，说到「菱儿长高了」，停了好一会儿。）……就这么写。托驿使捎去，钱我出。', '(You grind ink and lay out the paper, writing it down line by line as she speaks. She speaks slowly; at “Ling’er has grown” she stops for a long while.) …Write it just like that. Send it by the courier — I’ll pay.')],
        scholar: [L('（书生研墨铺纸，照她说的一句一句写下去。说到「菱儿长高了」，她停了好一会儿。）', '(The scholar grinds ink and writes as she speaks. At “Ling’er has grown” she stops for a long while.)'), M('（书生在信尾添了一句：「见字如面，盼君早归。」）', '(The scholar adds a line at the end: “As if face to face — come home soon.”)')],
        poet: [L('（诗仙提笔，这封信写得工工整整，一个字也没有醉。）', '(The Poet takes up the brush. The letter comes out neat and even — not one character drunk.)'), M('（末了添一句：「菱角红时，望君归。」）', '(At the end he adds: “When the chestnuts turn red, come home.”)')],
      }, { reward: { mark: WANG_LETTER_DAY } }),
      b({
        any: [L('（你把王大的回信念给她听。）……「秋后就回」。他说秋后就回。（她把信贴在心口，半天没说话。）谢谢你，谢谢你。', '(You read Wang Da’s answer to her.) …“Home after autumn.” He says home after autumn. (She holds the letter to her heart and says nothing for a long while.) Thank you. Thank you.')],
        poet: [L('（诗仙把王大的回信念给她听，念得很慢。）……秋后就回。好，好。先生，您这信，比诗还好。', '(The Poet reads Wang Da’s answer to her, very slowly.) …Home after autumn. Good, good. Master, your letter was better than a poem.')],
      }, { need: [WANGDA_READ], reward: { coins: 20 } }),
    ] },
    { id: 'lamp', who: ['change', '@xian'], beats: [
      b({
        any: [L('（湖心的小船上，她点着一盏灯。）……菱儿她爹走的那天，也是这么晚。我每晚来点一盏，他要是夜里回来，远远就看得见。', '(Out in the middle of the lake, she lights a lamp in her little boat.) …The day Ling’er’s father left, it was this late too. I come and light one every night — if he comes home in the dark, he’ll see it from far off.')],
        change: [L('（湖心小船上，她点着一盏灯。）……他走那天，也是这么晚。我每晚来点一盏，他夜里回来，远远就看得见。', '(Out on the lake, she lights a lamp in her little boat.) …He left on a night like this. I light one every night, so he’ll see it from far off.'), M('每夜一盏灯……我懂。', 'A lamp every night… I understand.')],
      }, { night: true }),
      b({
        any: [L('您说，这灯照得那么远么？……您说照得到，我就信。', 'Tell me — does the light reach that far? …If you say it does, I’ll believe it.')],
        taoist: [L('小道长，给这盏灯念个咒吧，叫它照得远些。', 'Little Taoist, say a spell over this lamp, so it shines further.'), M('（道童对着灯轻轻一吹，火苗稳稳地立住了。）风吹不灭了。', '(The Taoist child breathes gently on the lamp; the flame stands straight and still.) The wind can’t blow it out now.')],
        change: [L('仙子，您在天上那么多年，看得见这盏灯么？', 'Fair lady, all those years up in the sky — could you see a lamp like this?'), M('看得见。每一盏，都看得见。', 'I could. Every one of them.')],
      }, { night: true, reward: { card: card('一盏灯', 'One Lamp', '湖心一盏灯，\n照不见人，\n照得见回来的路。', 'One lamp in the middle of the lake:\nit cannot light a face,\nbut it lights the way home.', '灯') } }),
    ] },
  ],

  // ── 阿秀 at the washing: what she gossips about depends on who is listening
  'v.axiu': [
    { id: 'gossip', beats: [
      b({
        any: [L('你听说没？湖堤上那个白衣裳的温公子，白天跟一个姑娘走，晚上又跟另一个姑娘走——啧啧。', 'Have you heard? That Master Wen in white on the lake causeway walks with one girl by day and another by night — tsk, tsk.')],
        guan: [L('（阿秀一见关公，赶紧闭上嘴，衣裳捶得格外用力。）……没、没什么，今儿天好。', '(At the sight of Lord Guan, A Xiu shuts her mouth and beats the washing twice as hard.) …N-nothing, fine day today.')],
        change: [L('仙子，您从天上看得清楚——湖堤上那温公子，是不是脚踩两只船？', 'Fair lady, you see everything from up there — is that Master Wen on the causeway stepping in two boats at once?')],
        cat: [L('大橘你别听。……算了，你听了也说不出去。湖堤上那温公子啊——', 'Don’t you listen, Big Ginger. …Oh, what does it matter, you can’t tell anyone. That Master Wen on the causeway —')],
        scholar: [L('书生你来评评理：读书人白天跟一个姑娘游湖，晚上跟另一个提灯，这叫什么？', 'Scholar, you judge: a man of letters strolls the lake with one girl by day and carries a lantern for another by night — what do you call that?'), M('……这叫，也许另有缘故。', '…I call it: perhaps there’s another reason.')],
      }),
      b({
        any: [L('我打听清楚了！白天那个是他亲妹子温婉，晚上那个是林家小姐——人家定了亲的！哎，是我嘴快。', 'I’ve found it all out! The one by day is his own sister, Wen Wan; the one by night is Miss Lin — they’re betrothed! Oh, my wagging tongue.')],
        guan: [L('（阿秀小声对春燕说：）关老爷在，咱们说正经的——那温公子，原是定了亲的，没什么。', '(A Xiu whispers to Chunyan:) With Lord Guan here, let’s speak properly — Master Wen is betrothed, that’s all it was.')],
        cat: [L('大橘，你说我是不是嘴太快了？……喵什么喵。', 'Big Ginger, is my tongue too quick? …Don’t you “mrrow” at me.')],
        change: [L('仙子，是我瞎说了——晚上那个是他定了亲的林小姐。您别往天上传啊。', 'Fair lady, I was talking nonsense — the one by night is Miss Lin, his betrothed. Don’t spread it round heaven, now.')],
      }),
      b({ any: [L('春燕说我往后少嚼舌头。我想了想……也对。给，这是我们捶衣裳的皂角，洗得干净。', 'Chunyan says I should gossip less. I thought it over… she’s right. Here — soapberries from our washing. They clean well.')] }, { reward: { coins: 12, card: card('皂角', 'Soapberries', '东家长，西家短，\n说完了，河水一冲，\n就都干净了。', 'This house’s this, that house’s that —\nsaid and done, the river rinses it,\nand all comes clean.', '洗') } }),
    ] },
  ],

  // ── 耿大郎 the farmer next door: a season in his field
  'h.geng': [
    { id: 'field', who: ['gardener', 'fisher', '@nong'], beats: [
      b({
        any: [L('您给瞧瞧：我这块地，种啥啥发黄，是不是地伤了？', 'Take a look for me: everything I plant in this field turns yellow. Is the land hurt?'), M('开条沟，把积水放到河里去，再种一季豆子养养地。', 'Cut a ditch to drain the standing water to the river, and grow a season of beans to rest the soil.')],
        gardener: [L('园丁师傅，您给瞧瞧：我这块地，种啥啥发黄，是不是地伤了？', 'Gardener, take a look: everything I plant here turns yellow. Is the land hurt?'), M('土太酸了。烧些草木灰撒上，再种一季豆子养养地。', 'The soil is sour. Scatter wood ash, and grow a season of beans to rest it.')],
      }, { night: false }),
      b({ any: [L('照您说的，豆子下了。您看——出苗了！齐刷刷的。', 'The beans are in, as you said. Look — they’ve come up! In neat rows.')], gardener: [L('草木灰撒了，豆子也下了。您看——出苗了！齐刷刷的，一棵不黄。', 'Ash scattered, beans sown. Look — they’re up! Neat rows, not one yellow.')] }, { night: false }),
      b({ any: [L('今年的豆子，打了往年的两倍。俺媳妇说，头一篮得给您。', 'This year’s beans came in double. My wife says the first basket is yours.')] }, { night: false, reward: { coins: 30, card: card('种豆', 'Planting Beans', '种豆南山下，草盛豆苗稀。\n晨兴理荒秽，带月荷锄归。\n\n—— 陶渊明《归园田居》', 'I plant beans below the southern hill; the weeds grow thick, the bean shoots thin.\nUp at dawn to clear the weeds, home by moonlight with my hoe.\n\n— Tao Yuanming', '豆') } }),
    ] },
    { id: 'cabbage', who: ['rabbit', 'cat', '@shou'], beats: [
      b({
        rabbit: [L('兔、兔子！……俺地里的白菜，这些天夜夜被啃，一棵一个豁口。是不是你？', 'A r-rabbit! …Someone’s been gnawing my cabbages every night — a bite out of each one. Was it you?'), M('（玉兔拼命摇头，耳朵甩得啪啪响。）', '(The Jade Rabbit shakes her head so hard her ears flap.)')],
        any: [L('大橘，你夜里在外头逛，见没见着谁啃俺的白菜？', 'Big Ginger, you roam about at night — seen who’s been gnawing my cabbages?'), M('喵。（大橘朝竹林那边瞟了一眼。）', 'Mrrp. (Big Ginger glances toward the bamboo.)')],
      }),
      b({
        rabbit: [L('俺守了一夜——是一窝野兔，从竹林那边来的。……前几天冤枉你了，对不住。', 'I kept watch all night — a family of wild hares, from over by the bamboo. …I wronged you the other day. Sorry.')],
        any: [L('你说竹林？俺去看了，果然是一窝野兔！你这猫，比狗还灵。', 'The bamboo, you said? I went to look — a family of wild hares! You’re sharper than a dog, cat.')],
      }),
      b({
        rabbit: [L('俺想好了：地头那一垄，就留给它们吃。你是月亮上的兔子，替俺跟它们说一声，别的垄别碰。', 'I’ve made up my mind: the end row is theirs. You’re the moon’s rabbit — tell them for me to leave the other rows alone.'), M('（玉兔郑重地点了点头。）', '(The Jade Rabbit nods, very solemnly.)')],
        any: [L('地头那一垄留给野兔，你帮俺看着别的垄——腊鱼少不了你的。', 'The end row goes to the hares; you keep watch on the rest for me — there’s a cured fish in it for you.')],
      }, { reward: { coins: 10, card: card('一垄白菜', 'A Row of Cabbages', '地头一垄菜，\n不种给人吃。\n月亮上的兔子说，\n它们都答应了。', 'One row at the field’s end\nis not grown for people.\nThe moon’s rabbit says\nthey have all agreed.', '菜') } }),
    ] },
  ],

  // ── 老邵 the boatman: forty years on the river
  'v.shao': [
    { id: 'poem', who: ['poet', '@wen'], beats: [
      b({
        any: [L('读书人，四十年前我载过一个醉书生，把一壶酒倒进河里请河神喝，还念了首诗，我一句也没记住。', 'Forty years ago I carried a drunken scholar who poured a jug of wine in the river for the river god and recited a poem. I don’t remember a word.')],
        poet: [L('太白先生！四十年前，有个醉汉坐我的船，把一壶酒倒进河里，说要请河神喝——莫非是您？', 'Master Li! Forty years ago a drunk in my boat poured a jug of wine into the river, saying it was for the river god — could that have been you?'), M('……哈哈哈！那夜的酒，河神喝了没有？', '…Ha ha ha! And did the river god drink it?')],
      }),
      b({
        any: [L('后来那一年，河里的鱼格外肥。我一直琢磨，是不是那壶酒的缘故。', 'That year the fish in the river were uncommonly fat. I’ve always wondered if it was the wine.')],
        poet: [L('河神喝没喝，我不知道。第二年，这河里的鱼格外肥。', 'Whether the god drank it, I can’t say. The next year the fish were uncommonly fat.'), M('那便是喝了。', 'Then he drank it.')],
      }),
      b({
        any: [L('这张纸，是那醉汉落在我船上的，四十年了，我一直留着。给你吧，你们读书人认得。', 'This paper — the drunk left it in my boat. I’ve kept it forty years. Take it; you readers will know what it says.')],
        poet: [L('这张纸，是那夜落在我船上的。四十年，也该物归原主了。', 'This paper was left in my boat that night. Forty years — time it went back to its owner.')],
      }, { reward: { coins: 20, card: card('船上诗', 'A Poem Left in a Boat', '人生得意须尽欢，\n莫使金樽空对月。\n\n—— 纸已发黄，墨迹犹新', 'When life goes well, take your joy in full;\nnever leave the golden cup empty to the moon.\n\n— the paper yellowed, the ink still fresh', '舟') } }),
    ] },
    { id: 'flood', who: ['guan', '@wu'], beats: [
      b({ any: [L('小老儿年轻时，镇上发过一场大水，半个镇子泡在水里。我撑着这条船，一船一船往外渡人。', 'When I was young the town flooded — half of it under water. I poled this boat, carrying people out a boatload at a time.')], guan: [L('关老爷，小老儿年轻时发过一场大水，半个镇子泡在水里，我撑着这条船，一船一船往外渡人。', 'Lord Guan, when I was young a flood took half the town. I poled this very boat, carrying folk out a boatload at a time.')] }),
      b({ any: [L('那一夜我渡了四十七个。最后一趟船翻了，是桥上的人拿竹竿把我钩上来的。', 'That night I carried forty-seven. On the last trip the boat went over; folk on the bridge hooked me out with a bamboo pole.'), M('四十七人……义之所在，你便是英雄。', 'Forty-seven… where duty calls, you answered. That is a hero.')] }),
      b({ any: [L('（老邵红了眼眶）活了一辈子，头一回有人叫我英雄。往后坐船，不收钱！', '(Old Shao’s eyes redden.) A whole life, and the first time anyone’s called me a hero. From now on you ride for free!')] }, { reward: { coins: 20 } }),
    ] },
    { id: 'river', who: ['fisher', 'cat'], beats: [
      b({ any: [L('这条河的鱼，我比谁都熟。哪块石头底下有鳜鱼，我闭着眼都知道。', 'I know the fish of this river better than anyone. Which stone hides a mandarin fish — I could tell you blindfold.'), M('哦？那东头第三座桥底下，有什么？', 'Oh? Then what’s under the third bridge at the east end?')], cat: [L('馋猫，别盯着河里看。这条河的鱼，我比你熟。', 'Greedy cat, stop staring at the water. I know this river’s fish better than you.'), M('喵。（大橘盯着东头第三座桥。）', 'Mrrp. (Big Ginger stares at the third bridge at the east end.)')] }),
      b({ any: [L('（老邵压低声音）第三座桥底下，有条老青鱼，比我这船还老。我撑了四十年船，没见它上过钩。', '(Old Shao lowers his voice.) Under the third bridge lives an old black carp, older than my boat. Forty years, and I’ve never seen it take a hook.')] }),
      b({ any: [L('要是哪天钓着它了，看一眼就放了吧。它跟我一样，在这河里过了一辈子。', 'If you ever hook it, take one look and let it go. Like me, it has spent its whole life in this river.')] }, { reward: { coins: 10, card: card('老青鱼', 'The Old Black Carp', '第三座桥底下，\n住着一条老青鱼。\n它不上钩，\n它只是在。', 'Under the third bridge\nlives an old black carp.\nIt never bites.\nIt only stays.', '鱼') } }),
    ] },
  ],

  // ── 觉明 the old monk at the wooden fish
  'm.jueming': [
    { id: 'fish', who: ['cat', '@shou'], beats: [
      b({ any: [L('（老僧看你盯着木鱼的眼神，笑了）这不是鱼，木头的。你咬一口，牙疼。', '(The old monk sees how you eye the wooden fish, and smiles.) It isn’t a fish. It’s wood. Bite it and your teeth will ache.'), M('（绕着木鱼转了三圈，不死心。）', '(Circles the wooden fish three times, not convinced.)')] }),
      b({ any: [L('今日斋堂有豆腐，没有鱼。……贫僧给你留了一碟，在后厨门口。', 'Today the refectory has tofu, no fish. …I left you a dish by the kitchen door.')] }),
      b({ any: [L('你天天来，倒像是来听经的。——善哉，与佛有缘。', 'You come every day, as though to hear the sutras. — Excellent. You have a bond with the Buddha.')] }, { reward: { coins: 10, card: card('木鱼', 'The Wooden Fish', '木鱼不闭眼，\n猫也不闭眼。\n一个在修行，\n一个在等鱼。', 'The wooden fish never shuts its eyes;\nneither does the cat.\nOne is practising.\nOne is waiting for a fish.', '禅') } }),
    ] },
    { id: 'blade', who: ['guan', 'swordsman'], beats: [
      b({ any: [L('施主的剑，叫老僧想起一个人——五十年前的自己。老僧年轻时，也握过刀。在边关，十年。', 'Your sword reminds me of someone — myself, fifty years ago. I too held a blade when I was young. Ten years, on the frontier.')], guan: [L('……将军，老僧年轻时也握过刀。在边关，十年。', '…General, I too held a blade when I was young. Ten years on the frontier.')] }),
      b({ any: [L('后来有一夜，我在雪里救了个敌军的伤兵。他活了，我却再也握不住刀了。便上了山。', 'Then one night I saved a wounded enemy soldier in the snow. He lived — and I could never hold a blade again. So I came up the mountain.')] }),
      b({
        any: [L('这木槌，施主敲一下试试？', 'This mallet — would you strike it once?'), M('（接过木槌，轻轻一敲。笃——满山的鸟都静了。）', '(Takes the mallet and strikes once, gently. Tok — every bird on the mountain falls silent.)')],
        guan: [L('将军一生守一个「义」字，老僧后半生守一个「慈」字。……这木槌，将军敲一下试试？', 'All your life you have kept to one word, loyalty; I have kept the second half of mine to one word, mercy. …Would the general strike the fish once?'), M('（关公接过木槌，轻轻一敲。笃——满山的鸟都静了。）', '(Lord Guan takes the mallet and strikes once, gently. Tok — every bird on the mountain falls silent.)')],
      }, { reward: { coins: 20, card: card('放下', 'Setting It Down', '握刀十年，\n敲鱼五十年。\n手还是那只手，\n握着的不一样了。', 'Ten years holding a blade,\nfifty years striking a fish.\nThe hand is the same hand;\nwhat it holds is not.', '禅') } }),
    ] },
    { id: 'debate', who: ['taoist', 'change'], beats: [
      b({ any: [L('你们说「道」，我们说「空」，是一，是二？', 'You speak of the Way, we of emptiness. One thing, or two?'), M('师父说：一碗水，倒在杯里是圆的，倒在盘里是扁的。', 'My master says: a bowl of water poured into a cup is round, into a dish is flat.')], change: [L('仙子从天上来，天上说「道」还是说「空」？', 'You come from the sky, lady. Up there, do they speak of the Way or of emptiness?'), M('天上……只说「冷」。', 'Up there… they only speak of the cold.')] }),
      b({
        any: [L('昨日你说水。老僧想了一夜——水还是水，杯盘是杯盘。', 'Yesterday you spoke of water. I thought all night — water is still water, the cup is the cup.'), M('那便都对。', 'Then both are right.')],
        change: [L('昨日仙子说，天上只说「冷」。老僧想了一夜——冷，也是一种空。', 'Yesterday you said that up there they speak only of the cold. I thought all night — cold, too, is a kind of emptiness.'), M('……所以广寒宫，才那样空。', '…Which is why the Moon Palace is so empty.')],
      }),
      b({ any: [L('哈哈哈！五十年了，头一回论禅论输了。这串念珠，你拿去。', 'Ha ha ha! Fifty years, and the first time I’ve lost a debate. Take these beads.')] }, { reward: { coins: 15 } }),
    ] },
  ],

  // ── 菱儿 on the lake (王四娘's daughter)
  'l.linger': [
    { id: 'song', who: ['musician', 'poet', 'scholar'], beats: [
      b({ any: [L('我会唱采莲曲！可我娘说我唱得跑调……', 'I can sing the lotus-picking song! But Mum says I sing off key…'), M('唱给我听听。', 'Sing it for me.')], musician: [L('姐姐是弹琴的吧！我会唱采莲曲，可我娘说我唱得跑调……', 'You play the qin, don’t you! I can sing the lotus song, but Mum says I’m off key…'), M('你唱，我给你拨着调子。', 'You sing, and I’ll pluck the tune for you.')] }),
      b({ any: [L('（菱儿唱：「江南可采莲，莲叶何田田……」你在船边轻轻和着。）……这回没跑调吧？', '(Ling’er sings: “South of the river we pick the lotus, the leaves so round and full…” and you join in softly by the boat.) …Not off key this time, was it?')] }),
      b({ any: [L('我要唱给我爹听！他回来那天，我在湖心唱，他远远就听得见。', 'I’ll sing it for Dad! The day he comes home I’ll sing in the middle of the lake, and he’ll hear it from far away.')] }, { reward: { coins: 10, card: card('采莲', 'Picking Lotus', '江南可采莲，莲叶何田田。\n鱼戏莲叶间。\n\n—— 汉乐府', 'South of the river we pick the lotus, the leaves so round and full;\nthe fish play among the leaves.\n\n— Han yuefu', '莲') } }),
    ] },
    { id: 'moon', who: ['change', 'rabbit'], beats: [
      b({ any: [L('您是……月亮上的？我娘晚上在湖心点灯，说是给我爹照路。月亮也会给人照路吗？', 'Are you… from the moon? Mum lights a lamp on the lake at night — she says it’s to light Dad’s way. Does the moon light people’s way too?'), M('会的。它一直在照。', 'It does. It always has.')], rabbit: [L('兔兔！月亮上有菱角吗？没有吧？', 'Bunny! Are there water chestnuts on the moon? There aren’t, are there?'), M('（玉兔摇摇头。）', '(The Jade Rabbit shakes her head.)')] }),
      b({ any: [L('我夜里偷偷看过，湖上的月亮比天上的近。我伸手去捞，捞不着。', 'I’ve peeked at night — the moon on the lake is nearer than the one in the sky. I reached for it and couldn’t catch it.')], rabbit: [L('那我送你一把，带回去种！月亮上也有湖吗？……没有也不要紧，种在桂花树底下。', 'Then I’ll give you a handful to plant up there! Is there a lake on the moon? …Never mind, plant them under the cassia tree.')] }),
      b({ any: [L('这个给您：湖里最大的一只菱角，我留了三天。', 'This is for you: the biggest chestnut in the lake. I saved it three days.')] }, { reward: { coins: 8 } }),
    ] },
    { id: 'seeds', who: ['cat', 'gardener'], beats: [
      b({ any: [L('大橘！你又趴在船边偷看我的莲蓬！', 'Big Ginger! Peeking at my lotus pods from the edge of the boat again!')], gardener: [L('园丁伯伯，莲子能种在园子里吗？我想种一池。', 'Gardener, can lotus seeds be planted in a garden? I want a whole pond of them.'), M('能。泡三天，破个口，种在泥里，明年就有叶子。', 'They can. Soak them three days, nick the shell, set them in mud — you’ll have leaves next year.')] }),
      b({ any: [L('这颗莲子剥好了……给你。你不吃？那你看着我吃。', 'I’ve shelled this lotus seed… for you. You don’t eat them? Then watch me eat it.')], gardener: [L('我泡了三天，也破了口！您看，冒芽了！', 'I soaked them three days and nicked them! Look — a sprout!')] }),
      b({ any: [L('你是我在湖上最好的朋友。我娘忙，我爹不在……你明天还来吗？', 'You’re my best friend on the lake. Mum’s busy, Dad’s away… will you come tomorrow?')], gardener: [L('等我家也有一池荷花，头一朵给您！', 'When we have a lotus pond of our own, the first flower’s yours!')] }, { reward: { coins: 8 } }),
    ] },
  ],

  // ── 殷老汉 the pilgrim, praying for his son (殷生, reading under the plum)
  'm.yinlao': [
    { id: 'son', who: ['scholar', 'painter', 'player', '@wen'], beats: [
      b({ any: [L('先生是读书人……我儿殷生在梅岭上读书，今秋赴考。您若见着他，替我捎句话：爹娘不求他中，只求他别熬坏了身子。', 'You’re a reader, sir… my son Yin Sheng studies on the plum ridge and sits the exams this autumn. If you see him, give him a word from me: his mother and I don’t ask him to pass — only not to ruin his health.')] }),
      b({ any: [L('您见着他了？他瘦了没有？……他说「儿子知道了」？好，好。', 'You saw him? Has he grown thin? …He said, “Your son understands”? Good, good.')] }, { need: ['met:p.yinsheng'] }),
      b({ any: [L('中不中，都好，回家种地也是好日子。（他笑了，眼角全是褶子。）这是我们自家晒的柿饼，您尝尝。', 'Pass or not, it’s all well — farming is a good life too. (He smiles, his eyes all creases.) These are persimmons we dried ourselves. Try one.')] }, { reward: { coins: 20 } }),
    ] },
    { id: 'knees', who: ['gardener', '@nong', 'taoist'], beats: [
      b({ any: [L('这腿不中用了，爬两级，歇三歇。', 'These legs are no good now — two steps up, three rests.'), M('山上有艾草，采些回去熏一熏，膝盖就不疼了。', 'There’s mugwort on the mountain. Take some home and smoke your knees with it — the ache will ease.')], taoist: [L('小道长，这腿不中用了，爬两级歇三歇。', 'Little Taoist, these legs are no good — two steps up, three rests.'), M('师父教过：艾叶三钱，熏膝下三寸。我给你画个穴位。', 'My master taught me: three measures of mugwort, smoked three inches below the knee. I’ll mark the spot for you.')] }),
      b({ any: [L('你说的艾草，老婆子采了一篮，熏了三天——哎，真轻快多了！', 'The mugwort you told of — the wife picked a basketful and smoked my knees three days. Ah, much lighter now!')] }),
      b({ any: [L('今年爬这山，只歇了一回！这包炒米你拿着，路上垫垫肚子。', 'This year I climbed the whole way with only one rest! Take this bag of toasted rice for the road.')] }, { reward: { coins: 15 } }),
    ] },
    { id: 'guan', who: ['guan'], beats: [
      b({ any: [L('（老汉扑通跪下）关老爷在上！俺一个庄稼汉，不求别的，只求您保佑俺儿平安。', '(The old man drops to his knees.) Lord Guan above! I’m only a farmer — I ask nothing else, only that you keep my son safe.'), M('老丈请起。令郎之事，某记下了。', 'Rise, old one. I shall remember your son.')] }),
      b({ any: [L('关老爷记着俺儿子……回去跟老婆子说，她准要哭。', 'Lord Guan will remember my son… when I tell the wife, she’ll cry, I know it.')] }),
      b({ any: [L('俺没什么好东西。这双草鞋是俺自己编的，您走山路，垫着软和。', 'I’ve nothing fine to give. I wove these straw sandals myself — soft on a mountain path.')] }, { reward: { coins: 15 } }),
    ] },
  ],

  // ── 虎头 of the square
  'v.hutou': [
    { id: 'hero', who: ['guan', 'swordsman', '@wu'], beats: [
      b({ any: [L('你教我一招！就一招！', 'Teach me one move! Just one!'), M('先学站。站稳了，再学走。', 'First learn to stand. Stand steady, then learn to walk.')], guan: [L('关老爷！教我一招！就一招！', 'Lord Guan! Teach me one move! Just one!'), M('习武先习德。你可知「义」字怎么写？', 'Before the blade, the heart. Do you know how to write “loyalty”?')] }),
      b({ any: [L('我站了一天！腿都麻了！现在能教了吧？', 'I stood all day! My legs went numb! Now can you teach me?')], guan: [L('我问了宋夫子，「义」字上头一个羊，底下一个我！', 'I asked Master Song — “loyalty” is a sheep on top and “me” underneath!'), M('好。记住了，便是学会了第一招。', 'Good. Remember it, and you have learned the first move.')] }),
      b({ any: [L('（虎头比划了一招，有模有样。）二丫说我像大侠！', '(Hutou strikes a pose, quite passably.) Erya says I look like a hero!')] }, { reward: { coins: 6 } }),
    ] },
    { id: 'catch', who: ['cat', 'rabbit'], beats: [
      b({ any: [L('我今天一定要摸到你！', 'Today I’m going to pet you, I swear!'), M('（嗖地一下躲开了。）', '(Whisks out of reach.)')] }),
      b({ any: [L('我给你带了好吃的……你让我摸一下，好不好？', 'I brought you a treat… will you let me pet you, just once?')] }),
      b({ any: [L('（终于让虎头摸了一下头。）……软的！它是软的！二丫！栓子！它是软的！', '(At last lets Hutou pat its head.) …Soft! It’s soft! Erya! Shuanzi! It’s soft!')] }, { reward: { coins: 5 } }),
    ] },
  ],

  // ── 顾秀才, three times failed at the exams
  'v.guxiucai': [
    { id: 'exam', who: ['scholar', 'poet', '@wen'], beats: [
      b({ any: [L('兄台也是读书人。实不相瞒，我考了三回，三回落第。娘子不怪我，我却怪自己。', 'You’re a reader too. To be frank: three times I sat the exams, three times I failed. My wife doesn’t blame me; I blame myself.'), M('落第三回，文章便磨了三回。', 'Failed three times — then your essays have been honed three times.')],
        musician: [L('姑娘弹琴，也有弹不下去的时候吧？实不相瞒，我考了三回，三回落第。娘子不怪我，我却怪自己。', 'Even at the qin there must be times you cannot play on? To be frank: three times I sat the exams, three times I failed. My wife doesn’t blame me; I blame myself.'), M('弦断了，换一根，再弹。', 'When a string breaks, you change it and play on.')],
        player: [L('先生下棋，输过么？……我考了三回，三回落第。娘子不怪我，我却怪自己。', 'Do you ever lose at go, sir? …Three times I sat the exams, three times I failed. My wife doesn’t blame me; I blame myself.'), M('输一局，才知道下一局怎么下。', 'Only by losing a game do you learn how to play the next.')], poet: [L('太白先生……您当年，也没考过科举吧？', 'Master Li… you never sat the exams yourself, did you?'), M('没考。天子呼来不上船，自称臣是酒中仙。', 'Never. When the emperor called I didn’t board his boat — I said I was an immortal of the wine.')] }),
      b({ any: [L('兄台那句话，我想了一夜：文章磨了三回……好，今秋再考一回。', 'I thought about your words all night: honed three times… All right — I’ll sit once more this autumn.')], poet: [L('先生那句话，我想了一夜……考得上考不上，诗照样写。今秋再考一回。', 'I thought about what you said all night… pass or fail, I’ll keep writing. I’ll sit once more this autumn.')] }),
      b({ any: [L('娘子给我缝了新衫。这方旧砚送你，它陪我考了三回，该歇歇了。', 'My wife has sewn me a new robe. Take this old inkstone — it has sat the exams with me three times, and deserves a rest.')] }, { reward: { coins: 20, card: card('旧砚', 'An Old Inkstone', '磨了三回的墨，\n写了三回的文章。\n砚台说：\n再来一回，也行。', 'Ink ground three times,\nessays written three times.\nThe inkstone says:\none more time is fine.', '砚') } }),
    ] },
  ],
};

// ───────────────────────────── the people of the stalls: a small named story each ─────────────────────────────

export const NPC_ARCS: Record<string, Arc[]> = {
  'n.peddler': [{ id: 'drum', beats: [
    b({ any: [L('你猜我这副担子里，最值钱的是什么？……是这面拨浪鼓，我爹传给我的。', 'Guess what’s the most precious thing on my pole? …This rattle-drum. My father handed it down to me.')], cat: [L('猫大爷，别扒我的拨浪鼓——这是我爹传下来的，全担子数它最值钱。', 'Master Cat, paws off my rattle-drum — my father handed it down; it’s worth more than everything else I carry.')] }),
    b({ any: [L('我爹也是货郎，走的也是这条路。他说：货郎的鼓一响，孩子们就笑——这就够本了。', 'My father was a peddler too, on this same round. He used to say: when the peddler’s drum rattles, the children laugh — and that’s profit enough.')] }),
    b({ any: [L('今儿走到园门口，有个孩子在那儿等我。二十年了，头一回有人等我。', 'Today at the garden gate a child was waiting for me. Twenty years, and the first time anyone’s waited for me.')] }, { reward: { coins: 10 } }),
  ] }],
  'n.storyteller': [{ id: 'self', beats: [
    b({ any: [L('说了一辈子别人的故事……客官想不想听听我自己的？', 'A lifetime telling other people’s stories… would you care to hear my own?')] }),
    b({ any: [L('我年轻时也想考功名，考了五回都不中，就在茶馆里说起书来。说着说着，四十年了。', 'When I was young I wanted office too. Five times I failed the exams, so I started telling stories in the teahouse. Forty years ago now.')] }),
    b({ any: [L('如今想想，说书比做官好——做官管一方，说书暖一屋。', 'Now I think storytelling beats officialdom — an official governs a county; a storyteller warms a room.')] }, { reward: { coins: 10, card: card('醒木', 'The Gavel', '醒木一拍，\n满堂皆静。\n说的是古人，\n听的是自己。', 'One crack of the gavel\nand the room goes quiet.\nThe tale is of the ancients;\nwhat you hear is yourself.', '书') } }),
  ] }],
  'n.fortune': [{ id: 'half', beats: [
    b({ any: [L('客官知道老朽为何叫半仙？……因为只算得准一半。', 'Do you know why they call me the Half-Immortal? …Because I’m right only half the time.')] }),
    b({ any: [L('那另一半呢？另一半，得靠人自己走。', 'And the other half? The other half, you must walk yourself.')] }),
    b({ any: [L('今儿给你算最后一卦，不收钱：你呀，会遇见很多好人。——这卦准不准，你自己看。', 'One last reading for you today, free of charge: you will meet a great many good people. — Whether I’m right, you’ll see for yourself.')] }, { reward: { coins: 10 } }),
  ] }],
  'n.sugar': [{ id: 'rabbit', beats: [
    b({ any: [L('我吹的头一个糖人，是只兔子。吹歪了，我娘还是吃了，说甜。', 'The first sugar figure I ever blew was a rabbit. It came out crooked; my mother ate it anyway and said it was sweet.')], rabbit: [L('我吹的头一个糖人，就是兔子——歪歪扭扭，没你好看。我娘还是吃了，说甜。', 'The first figure I ever blew was a rabbit — all crooked, not half so pretty as you. My mother ate it anyway and said it was sweet.')] }),
    b({ any: [L('后来我娘不在了。每年清明，我吹一只兔子，摆在她坟前。', 'Later my mother passed. Every Qingming I blow a rabbit and set it at her grave.')] }),
    b({ any: [L('今年的兔子，吹得最好。你说……她尝得出么？', 'This year’s rabbit was the best I’ve ever blown. Do you think… she can taste it?')] }, { reward: { coins: 5 } }),
  ] }],
  'n.flower': [{ id: 'garden', beats: [
    b({ any: [L('我想有一个自己的小园子，种满花，不用卖。', 'I want a little garden of my own, full of flowers I don’t have to sell.')] }),
    b({ any: [L('你的园子叫半亩园？半亩地，能种多少花呀？', 'Your garden’s called the Half-Acre? How many flowers fit in half an acre?')] }),
    b({ any: [L('我想好了！等攒够了钱，我也要一个半亩园。到时候，头一枝花送你！', 'I’ve decided! When I’ve saved enough, I’ll have a Half-Acre too. And the first flower goes to you!')] }, { reward: { coins: 5, card: card('杏花', 'Apricot Blossom', '小楼一夜听春雨，\n深巷明朝卖杏花。\n\n—— 陆游', 'All night in the small tower I hear the spring rain;\ntomorrow in the deep lanes they’ll sell apricot blossom.\n\n— Lu You', '杏') } }),
  ] }],
  'n.farmer': [{ id: 'well', beats: [
    b({ any: [L('这块地，我爷爷的爷爷就种着。……你家园子那块空地，从前是一口井。', 'My grandfather’s grandfather farmed this land. …That empty plot of yours used to be a well.')] }),
    b({ any: [L('后来井枯了，就填上，种了棵枣树。枣树倒了，就空着——等你来。', 'The well dried up, so it was filled and a jujube planted. The jujube fell, and it’s stood empty since — waiting for you.')] }),
    b({ any: [L('地是有记性的。你好好待它，它会记住你。', 'Land has a memory. Treat it well and it will remember you.')] }, { reward: { coins: 10 } }),
  ] }],
  'n.shutong': [{ id: 'yong', beats: [
    b({ any: [L('先生教我写「永」字，说写好了这一个，别的字就都会写了。', 'Master is teaching me to write “永” — he says once I can write that one, I can write them all.')] }),
    b({ any: [L('我写了一百个「永」……还是像蚯蚓。', 'I’ve written a hundred “永”s… they still look like earthworms.')] }),
    b({ any: [L('先生说，今天这个「永」，有点像字了！', 'Master says today’s “永” almost looks like a character!')] }, { reward: { coins: 5, card: card('永', 'Eternity', '点、横、竖、钩，\n提、撇、短撇、捺——\n一个「永」字，\n八种笔法。', 'Dot, stroke, drop, hook,\nlift, sweep, short sweep, press —\none character, “eternity”,\neight ways of the brush.', '永') } }),
  ] }],
  'n.tea': [{ id: 'water', beats: [
    b({ any: [L('泡茶，水比茶要紧。山寺的泉水第一，梅岭的雪水第二，河水……第三。', 'In tea, the water matters more than the leaf. Temple spring water first, plum-ridge snow water second, river water… third.')] }),
    b({ any: [L('我年轻时背着水罐走遍了四处，就为找一口好水。', 'When I was young I walked everywhere with a water jar on my back, just to find good water.')] }),
    b({ any: [L('今儿这壶，用的是今春梅岭的雪水，我攒了一整冬。请你。', 'Today’s pot is made with this spring’s snow water from the plum ridge — I saved it all winter. It’s on me.')] }, { reward: { coins: 5 } }),
  ] }],
  'n.fisher': [{ id: 'snow', beats: [
    b({ any: [L('冬天湖上结冰，我凿个洞钓鱼，一坐就是一天。', 'In winter when the lake freezes, I cut a hole in the ice and sit all day.')] }),
    b({ any: [L('有一年大雪，我在冰上等了一天，一条也没有——那天，是我这辈子最快活的一天。', 'One year in heavy snow I waited on the ice all day and caught nothing — the happiest day of my life.')] }),
    b({ any: [L('钓鱼，钓的不是鱼。……这句话，我六十岁才懂。', 'Fishing isn’t about the fish. …It took me sixty years to understand that.')] }, { reward: { coins: 10, card: card('江雪', 'River Snow', '千山鸟飞绝，万径人踪灭。\n孤舟蓑笠翁，独钓寒江雪。\n\n—— 柳宗元', 'From a thousand hills the birds have flown; on ten thousand paths, no footprint.\nIn a lone boat an old man in a straw cape fishes the cold river snow.\n\n— Liu Zongyuan', '雪') } }),
  ] }],
  'n.monk': [{ id: 'yuan', beats: [
    b({ any: [L('施主可知，贫僧为何叫了缘？', 'Do you know why I am called Liaoyuan — “ending bonds”?')] }),
    b({ any: [L('师父说：缘起缘灭，了了便好。可贫僧在山门迎来送往，总也了不掉。', 'My master said: bonds arise and fall away — end them and be at peace. But greeting and seeing off at the gate, I can never end a single one.')] }),
    b({ any: [L('今日想明白了：知客僧，本就是结缘的。了不掉，便不了。', 'Today I understand: a guest-master is here to make bonds. If they will not end, let them not end.')] }, { reward: { coins: 5 } }),
  ] }],
  'n.poet': [{ id: 'snow', beats: [
    b({ any: [L('山人种梅三十年，只为等一场好雪。', 'Thirty years I have grown plum, waiting for one good snowfall.')] }),
    b({ any: [L('去年雪来了，梅也开了，山人却病了，没看成。', 'Last year the snow came and the plum bloomed — and I was ill in bed, and missed it.')] }),
    b({ any: [L('今年……今年你替我看了。好，好。', 'This year… this year you have seen it for me. Good. Good.')] }, { reward: { coins: 10, card: card('墨梅', 'Ink Plum', '不要人夸好颜色，\n只留清气满乾坤。\n\n—— 王冕', 'I ask no praise for my colours —\nonly to leave the clear air filling heaven and earth.\n\n— Wang Mian', '梅') } }),
  ] }],
  'n.kite': [{ id: 'string', beats: [
    b({ any: [L('风筝为什么会飞？', 'Why do kites fly?')] }),
    b({ any: [L('我问我娘，娘说：因为有线牵着。没有线，就飞走了。', 'I asked Mama. She said: because a string holds them. Without the string they fly away.')] }),
    b({ any: [L('那我就是有线的风筝！我娘就是那根线！', 'Then I’m a kite with a string! And Mama is the string!')] }, { reward: { coins: 5 } }),
  ] }],
};
