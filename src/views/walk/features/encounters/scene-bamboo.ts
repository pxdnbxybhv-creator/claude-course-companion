// 竹林: 知音 (the woodcutter who hears mountains and water in the qin) and 狐女借伞 (a lady in white,
// on a rainy night, with no umbrella — and something white behind her).
import { ANCHORS } from '../../map';
import * as sfx from '../sfx';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, appear, faceMe, inHand, mark, raiseArm, talkPrompt, vanish, walkTo } from './scene-kit';
import { firewood, fox, umbrella } from './models';

const HIGH = [0, 2, 4, 5, 7, 9, 7, 4]; // 高山: climbing
const WATER = [9, 7, 5, 4, 5, 4, 2, 1, 0, 2, 0]; // 流水: running down

// ───────────────────────────── 知音

export function zhiyin(s: Stage): Scene {
  const { ctx, THREE } = s;
  const c = ANCHORS.bambooClearing;
  const at = s.spot(c.x - 6.5, c.z - 5.5, 6);
  const f = s.person(WEAR.woodcutter, at, c);
  const wood = firewood(ctx, s.rng);
  wood.position.set(0, 0.95, -0.24);
  wood.rotation.set(0.1, 0, 0.12);
  f.root.add(wood);
  const m = mark(s, f);
  const name = C('樵夫', 'Woodcutter');
  let heard = false;
  s.theme = 'quiet'; // the place's music hushes, so the qin can be heard

  // the musician plays nearby: he turns, comes closer, and says what he hears
  const onMusic = (e: Event) => {
    const d = (e as CustomEvent<{ x: number; z: number }>).detail;
    if (!d || heard || s.finished || s.dist(f.root.position.x, f.root.position.z) > 18) return;
    heard = true;
    const p = s.player();
    const a = Math.atan2(f.root.position.x - p.x, f.root.position.z - p.z);
    void walkTo(s, f, p.x + Math.sin(a) * 2.2, p.z + Math.cos(a) * 2.2, 1.1).then(() => {
      faceMe(s, f);
      s.words('巍巍乎若泰山', new THREE.Vector3(f.root.position.x, f.root.position.y + 2.1, f.root.position.z), { color: '#3d5a73', life: 4 });
      s.bag.later(2600, () => s.words('洋洋乎若江河', new THREE.Vector3(f.root.position.x, f.root.position.y + 2.1, f.root.position.z), { color: '#3f6f8f', life: 4 }));
    });
  };
  window.addEventListener('banmu:music', onMusic);
  s.bag.onDispose(() => window.removeEventListener('banmu:music', onMusic));

  talkPrompt(s, f, {
    labelZh: '停斧听琴的樵夫', labelEn: 'A woodcutter, listening', actionZh: '搭话', actionEn: 'Talk',
    async act() {
      if (s.finished) { await s.say(f, name, [L('琴在，人在，知音就在。', 'While there is a qin, and someone to hear it, there is a friend.')]); return; }
      if (!s.claim()) return;
      m.set(false);
      try {
        const who = s.who;
        if (who === 'musician') {
          const k = await s.say(f, name, [
            L(heard ? '方才那琴声……是姑娘弹的？我听得砍柴都忘了。' : '姑娘背的可是一张琴？我砍柴路过，能否……为我弹一曲？', heard ? 'That music just now — was it you? I forgot my firewood.' : 'Is that a qin on your back? I am only passing with my wood — but would you play for me?'),
            L('弹什么好呢？', 'What will you play?', [C('《高山》', '“High Mountains”'), C('《流水》', '“Flowing Water”')]),
          ]);
          if (k < 0) return;
          ctx.player.emote('play');
          s.qin(k === 0 ? HIGH : WATER, 300, 0.75);
          await s.wait(2800);
          await s.say(f, name, [k === 0
            ? L('善哉！峨峨兮若泰山！', 'Wonderful — towering, like Mount Tai!')
            : L('善哉！洋洋兮若江河！', 'Wonderful — vast and flowing, like the great rivers!')]);
          ctx.player.emote('play');
          s.qin(k === 0 ? WATER : HIGH, 300, 0.75);
          await s.wait(2800);
          await s.say(f, name, [
            k === 0 ? L('洋洋兮若江河！', 'And now — the rivers, rolling on!') : L('峨峨兮若泰山！', 'And now — the mountain, towering!'),
            L('我姓钟，名子期，打柴为生。姑娘心里想着什么，琴里就有什么。', 'My name is Zhong Ziqi; I cut wood for a living. Whatever is in your heart is in your qin.'),
          ]);
          await s.say(null, C('琴师', 'Qin Player'), [L('……我找了很久的人，原来在这里打柴。', '…The one I have searched for so long was here all along, cutting wood.')]);
          await s.say(f, name, [L('这截老桐木，我留了好些年，送给姑娘——拿去做一张新琴。', 'I have kept this old paulownia log for years. Take it — make a new qin.')]);
          s.finish({ zh: '钟子期把一截老桐木留给了你。高山流水，今日终于有人听懂。', en: 'Zhong Ziqi gave you an old paulownia log. High mountains, flowing water — today someone understood.', bonus: 80, seal: '音' });
          return;
        }
        if (who === 'poet') {
          await s.say(null, C('诗仙', 'Poet'), [L('欲取鸣琴弹，恨无知音赏。', 'I would take up the qin — but who is there to hear it?')]);
          s.words('知音世所稀', new THREE.Vector3(f.root.position.x, f.root.position.y + 2.2, f.root.position.z), { color: '#3d5a73', vertical: true, life: 4.5 });
          const k = await s.say(f, name, [
            L('先生何必恨？这竹林里，风是琴，竹是弦，我便是听的人。', 'Why regret it, sir? In this grove the wind is the qin, the bamboo its strings — and I am the one who listens.'),
            L('先生念一句诗，我便听出一片山水来。', 'Say me a line, and I will hear a whole landscape in it.', [C('「相看两不厌，只有敬亭山」', '“We never tire of each other — only Jingting Mountain and I”'), C('「孤帆远影碧空尽」', '“A lone sail’s far shadow fades into the blue”')]),
          ]);
          if (k < 0) return;
          const p = s.player();
          s.words(k === 0 ? '相看两不厌' : '孤帆远影', new THREE.Vector3(p.x, p.y + 2.3, p.z), { color: '#3d5a73', vertical: true, life: 4.5 });
          s.qin(k === 0 ? HIGH : WATER, 280, 0.6);
          await s.wait(2200);
          await s.say(f, name, [k === 0 ? L('我听见一座山，也听见一个人——两个都不说话。', 'I hear a mountain, and a man — neither saying a word.') : L('我听见一条江，流到天边，还没流完。', 'I hear a river running to the edge of the sky, and still running.')]);
          ctx.player.emote('eat');
          await s.say(null, C('诗仙', 'Poet'), [L('哈哈！千金易得，知音难求。樵哥，我敬你一杯！', 'Ha! Gold is easy to come by, a true listener hard to find. Woodcutter — a cup to you!')]);
          s.finish({ zh: '诗仙以诗为琴，樵夫以耳为弦。原来知音不必是琴。', en: 'The poet played with verse, the woodcutter listened with his ears — a friend need not be a qin.', bonus: 50, seal: '音' });
          return;
        }
        if (who === 'cat') {
          ctx.player.emote('sit');
          sfx.purr(2.6, 0.6);
          await s.say(f, name, [
            L('嘘——你也来听琴？', 'Shh — you came to listen too?'),
            L('你听，那边有人在弹。连猫儿都听得入神，你也是个知音呐。', 'Hear that? Someone is playing over there. Even a cat listens so intently — you are a true friend of music.'),
            L('来，分你半条小鱼干。', 'Here — half a dried fish for you.'),
          ]);
          s.qin(HIGH, 320, 0.55);
          ctx.player.emote('eat');
          await s.wait(1200);
          s.finish({ zh: '樵夫与大橘并排坐着听琴，一个停了斧，一个停了尾巴。知音不必会说话。', en: 'The woodcutter and Big Ginger sat side by side: one stopped his axe, the other his tail. A friend need not speak.', bonus: 40 });
          return;
        }
        // everyone else
        let k = await s.say(f, name, [
          L('嘘——你听。', 'Shh — listen.'),
        ]);
        s.qin(HIGH, 320, 0.65);
        await s.wait(2900);
        k = await s.say(f, name, [L('这一段琴，你听出了什么？', 'What do you hear in that?', [C('一座高山', 'A high mountain'), C('一条流水', 'Flowing water'), C('只听见风吹竹子', 'Only wind in the bamboo')])]);
        if (k === 0) {
          await s.say(f, name, [L('善哉！峨峨兮若泰山。', 'Well heard — towering, like Mount Tai.')]);
          s.qin(WATER, 280, 0.65);
          await s.wait(3000);
          const k2 = await s.say(f, name, [L('那这一段呢？', 'And this?', [C('流水', 'Flowing water'), C('还是高山', 'The mountain again')])]);
          await s.say(f, name, [k2 === 0 ? L('洋洋兮若江河！你倒是个知音。', 'Rolling like the rivers! You have a listener’s ear.') : L('哈哈，山里也有水，水里也有山。', 'Ha — there is water in mountains, and mountains in water.')]);
        } else if (k === 1) {
          await s.say(f, name, [L('咦，我听的是高山……不过山上也有水，你也没听错。', 'Hm, I heard a mountain… but mountains have streams. You are not wrong.')]);
        } else if (k === 2) {
          await s.say(f, name, [L('哈哈，也好。风也是一张琴，竹子是它的弦。', 'Ha, that too. The wind is a qin, and the bamboo its strings.')]);
        } else return;
        await s.say(f, name, [
          L('从前有个打柴的叫钟子期。伯牙鼓琴，志在高山，他听出高山；志在流水，他听出流水。', 'Long ago a woodcutter named Zhong Ziqi listened to Boya play. When Boya thought of mountains, Ziqi heard mountains; when he thought of water, Ziqi heard water.'),
          L('后来子期死了，伯牙摔了琴，终身不复鼓琴——世上再没有懂他的人了。', 'When Ziqi died, Boya broke his qin and never played again: no one left in the world understood him.'),
          L('我打了一辈子柴，就爱听这个。今日遇见你，也算有缘。', 'I have cut wood all my life, and this is what I love to hear. Meeting you today — that is fate.'),
        ]);
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  });
  return { x: at.x, z: at.z, r: 12 };
}

// ───────────────────────────── 狐女借伞

export function hujie(s: Stage): Scene {
  const { ctx, THREE } = s;
  const c = ANCHORS.bambooShrine;
  const at = s.spot(c.x + 4, c.z - 5, 6);
  const f = s.person(WEAR.foxLady, at, s.player());
  // a white tail, tucked away inside the robe (until someone sees through her)
  const tailBox = fox(ctx).tail;
  tailBox.position.set(0, 0.25, -0.18);
  tailBox.scale.setScalar(0.001);
  f.root.add(tailBox);
  // the fox she really is, waiting to be shown
  const real = fox(ctx);
  real.root.visible = false;
  s.bag.add(real.root, s.group);
  const m = mark(s, f);
  s.theme = 'quiet';
  s.drizzle();
  s.glow(new THREE.Vector3(at.x, at.y + 1.1, at.z), '#dfe8f0', 1.6, 0.25);
  const name = C('白衣女子', 'Lady in White');
  const lend = () => {
    const u = umbrella(ctx, '#c9573c');
    u.rotation.x = 0.1;
    inHand(f, u, 0, -0.02, 0.05);
    raiseArm(f, 0.55, 0.3);
  };
  const leave = async (asFox: boolean) => {
    const r = f.root;
    const away = { x: r.position.x + (r.position.x - s.player().x) * 3, z: r.position.z + (r.position.z - s.player().z) * 3 };
    if (asFox) {
      real.root.position.copy(r.position);
      real.root.rotation.y = r.rotation.y;
      await vanish(s, r);
      appear(s, real.root);
      await s.wait(1400);
      await vanish(s, real.root, '#f7f2e8', 900);
      return;
    }
    await walkTo(s, f, r.position.x + (away.x - r.position.x) * 0.25, r.position.z + (away.z - r.position.z) * 0.25, 0.9);
    await vanish(s, r, '#f7f2e8', 900);
  };

  s.whenDone(talkPrompt(s, f, {
    labelZh: '雨中的白衣女子', labelEn: 'A lady in white, in the rain', actionZh: '上前', actionEn: 'Approach',
    async act() {
      if (s.finished || !s.claim()) return;
      m.set(false);
      try {
        const who = s.who;
        faceMe(s, f);
        if (who === 'taoist') {
          ctx.player.emote('skill');
          await s.say(null, C('道童', 'Taoist Child'), [L('姐姐，下这么大的雨，你身后那条尾巴不怕湿么？', 'Sister, in rain like this — aren’t you afraid your tail will get wet?')]);
          // seen through: the tail shows
          let t = 0;
          const off = ctx.onFrame((dt) => { t += dt; tailBox.scale.setScalar(Math.min(1, t / 0.6)); if (t > 0.6) off(); });
          s.bag.onDispose(off);
          await s.say(f, name, [L('……！小道长好眼力。我在这山里修了三百年，从没害过人。', '…! You have sharp eyes, little master. Three hundred years I have practised in these hills, and never harmed a soul.', [C('修行不易，伞借你', 'Practice is hard — take my umbrella'), C('那你给我变个戏法', 'Then show me a trick')])]).then(async (k) => {
            if (k === 1) {
              await s.say(f, name, [L('好——看好了。', 'Very well — watch.')]);
              for (let i = 0; i < 5; i++) s.glow(new THREE.Vector3(at.x + Math.cos(i * 1.3) * 1.2, at.y + 1.4 + i * 0.15, at.z + Math.sin(i * 1.3) * 1.2), '#9fd2ff', 0.5, 0.9);
              await s.wait(900);
            }
          });
          lend();
          await s.say(f, name, [L('多谢小道长。这颗狐火珠，夜里走山路可照明。', 'Thank you, little master. Take this fox-fire pearl — it lights mountain paths at night.')]);
          await leave(true);
          s.finish({ zh: '道童一眼看穿了狐狸的障眼法，却还是把伞借给了她。她留下一颗狐火珠。', en: 'The Taoist child saw straight through the fox’s disguise — and lent her the umbrella anyway. She left a fox-fire pearl.', bonus: 60, seal: '狐' });
          s.put('fox');
          return;
        }
        if (who === 'cat') {
          await s.say(f, name, [
            L('哟，小猫儿，你也没带伞？', 'Oh — little cat, no umbrella either?'),
            L('来，躲到我袖子底下。咱们都是山里的……嗯，山里的邻居，互相照应。', 'Come under my sleeve. We are both of the hills — hm, neighbours, let’s say. We look after each other.'),
          ]);
          sfx.purr(2.2, 0.5);
          await s.say(null, C('大橘', 'Big Ginger'), [L('（大橘嗅了嗅她的衣角，毛竖了一下，又慢慢放平。）', '(Big Ginger sniffs the hem of her robe, bristles for a moment, then slowly smooths down.)', [C('喵？', 'Mrrow?'), C('（领她去竹林小祠避雨）', '(lead her to the little shrine, out of the rain)')])]);
          await walkTo(s, f, c.x, c.z + 1.2, 1.0);
          await s.say(f, name, [L('多谢你带路。这条小鱼干，是给你的谢礼。', 'Thank you for showing the way. This little dried fish is for you.')]);
          ctx.player.emote('eat');
          await vanish(s, f.root, '#f7f2e8', 900);
          s.finish({ zh: '大橘领着白衣女子躲进竹林小祠。她走时，雪白的尾巴一扫，留下一条小鱼干。', en: 'Big Ginger led the lady into the bamboo shrine. As she left, a snow-white tail swept the floor, and a dried fish was left behind.', bonus: 40, seal: '狐' });
          s.put('fox');
          return;
        }
        const ask = [C('借给你', 'Lend it to her'), C('姑娘家住哪里？', 'Where do you live?')];
        const k = await s.say(f, name, [
          who === 'scholar'
            ? L('这雨来得急……公子，可否借伞一用？明日必当奉还。', 'This rain came so suddenly… Sir, might I borrow your umbrella? I will return it tomorrow.', ask)
            : L('这雨来得急……可否借伞一用？明日必当奉还。', 'This rain came so suddenly… might I borrow your umbrella? I will return it tomorrow.', ask),
        ]);
        if (k < 0) return;
        if (k === 1) await s.say(f, name, [L('我么……就住在竹林那边，山脚下。你去了也找不着的。', 'Me? Just past the bamboo, at the foot of the hill. You would never find it.')]);
        lend();
        if (who === 'scholar') {
          await s.say(f, name, [
            L('公子是读书人吧？借伞之恩，无以为报——赠君一句：', 'You are a scholar, aren’t you? I have nothing to repay you with — but take these lines:'),
            L('「莫听穿林打叶声，何妨吟啸且徐行。竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。」', '“Ignore the rain beating through the woods — why not sing and stroll along? Bamboo staff and straw sandals beat a horse. Who’s afraid? A straw cape in the misty rain, for a whole life.”'),
          ]);
          s.words('一蓑烟雨任平生', new THREE.Vector3(at.x, at.y + 2.3, at.z), { color: '#3d5a73', vertical: true, life: 5 });
        } else {
          await s.say(f, name, [L('多谢。明日……自会有人送还。', 'Thank you. Tomorrow… someone will bring it back.')]);
        }
        await leave(false);
        // a white fox slips away through the bamboo
        real.root.position.set(at.x + 3, s.y(at.x + 3, at.z - 2), at.z - 2);
        appear(s, real.root, 300);
        void s.wait(1500).then(() => vanish(s, real.root, '#f7f2e8', 600));
        s.finish(who === 'scholar'
          ? { zh: '白衣女子念了一首《定风波》，撑着你的伞走进雨里。竹林深处，一只白狐回头望了一眼。', en: 'The lady recited “Calming the Waves” and walked into the rain under your umbrella. Deep in the bamboo, a white fox looked back once.', bonus: 40, seal: '狐' }
          : { seal: '狐' });
        s.put('fox');
      } finally {
        s.unclaim();
      }
    },
  }));
  return { x: at.x, z: at.z, r: 14 };
}
