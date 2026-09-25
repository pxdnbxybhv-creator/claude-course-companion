// The people of the painting, each with something to say: the teahouse keeper (tea, and gossip about
// the cat), the old fisherman at the dock (how to fish, a joke), the monk at the temple gate (a koan,
// and the bell), the poet in the plum-ridge pavilion (a game of 飞花令), and a child at the edge of the
// bamboo whose kite got away (a little errand).
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { RegionId, XZ } from '../../map';
import { ANCHORS, REGION } from '../../map';
import { Bag, dayRng, feature, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { glints } from '../props';
import { flag, record, recordMax, play } from '../../../../app/play';
import { makeRng, hashString } from '../../../../core/rng';
import { toKey } from '../../../../core/date';
import { feihuaTurns, playableLing } from './logic';
import { front, greet, person, speechMark, talk, type Figure, type FigureSpec } from './npc';
import { forCompanion, type Line, type PerCompanion } from '../npcs/logic';
import { FISHER_HELLO, KITE_HELLO, MONK_HELLO, POET_NPC_HELLO, TEA_HELLO } from '../npcs/lines';
import { offerFlower } from '../npcs/gift';
import { begin, end, withTheme } from './ui';
import { todaysCat, walkableNear } from './cat';
import * as snd from './sound';

/** A standing NPC in a place, by an anchor, facing a point (see npc.ts person). */
function placed(bag: Bag, ctx: WorldCtx, region: RegionId, spec: FigureSpec, a: XZ, dx: number, dz: number, look: XZ): Figure {
  return person(bag, ctx, ctx.regionGroup(region), spec, a, dx, dz, look);
}

/** The first thing someone says: a line of their own for some companions, else their usual one. */
function hello(ctx: WorldCtx, own: PerCompanion<Line | null>, usual: Line): Line {
  return forCompanion(own, ctx.player.character) ?? usual;
}

// ───────────────────────────── 茶博士, the teahouse keeper ─────────────────────────────

const TEAS = [
  { zh: '龙井', en: 'Longjing', factZh: '西湖龙井，扁平光滑，讲究「色绿、香郁、味甘、形美」。清明前采的「明前茶」最嫩。', factEn: 'West Lake Longjing: flat, smooth leaves — green, fragrant, sweet, and beautiful. Picked before Qingming, it is at its most tender.' },
  { zh: '碧螺春', en: 'Biluochun', factZh: '太湖洞庭山的碧螺春，原名「吓煞人香」——相传康熙嫌名字不雅，才赐了这个好听的名字。', factEn: 'Biluochun from Lake Tai was once called “Scarily Fragrant” — the Kangxi Emperor, the story goes, found that vulgar and renamed it “Green Snail Spring”.' },
  { zh: '普洱', en: 'Pu’er', factZh: '普洱越陈越香。从前马帮驮着茶饼，沿茶马古道翻山越岭走出云南。', factEn: 'Pu’er grows richer with age. Caravans once carried its pressed cakes over the mountains on the Tea Horse Road.' },
];

export const teahouse = feature('npc-teahouse', (bag, ctx) => {
  const sq = ANCHORS.villageSquare;
  const f = placed(bag, ctx, 'village', { robe: '#6d7f8c', trim: '#2f3b45', apron: '#efe8d8', hat: 'cap', hatColor: '#2f3b45' }, ANCHORS.teahouse, -0.3, 0, sq);
  // a kettle with a long spout in his hand
  const { THREE } = ctx;
  const kettle = inked(ctx, merge(THREE, [
    part(THREE, new THREE.SphereGeometry(0.09, 10, 8), '#8a6b4a', { s: [1, 0.8, 1] }),
    part(THREE, new THREE.CylinderGeometry(0.012, 0.02, 0.36, 5), '#8a6b4a', { p: [0, 0.05, 0.2], r: [Math.PI / 2 - 0.5, 0, 0] }),
  ]), { width: 0.006 });
  kettle.position.copy(f.hand).add(new THREE.Vector3(0, -0.06, 0.06));
  f.armR.add(kettle);
  greet(bag, ctx, f);
  let served = 0;
  const name = { zh: '茶博士', en: 'Tea Master' };
  bag.interact({
    id: 'npc-teahouse', position: front(f), radius: 2,
    labelZh: '茶博士', labelEn: 'Tea master', actionZh: '说话', actionEn: 'Talk',
    async act() {
      if (!begin(ctx, 'talk')) return;
      try {
        record('npc:tea');
        if (await offerFlower(ctx, f, name, 'tea')) { served++; ctx.player.emote('eat'); return; }
        const cat = todaysCat(ctx);
        const hi = served ? { zh: '客官又来啦！再来一壶？', en: 'Welcome back! Another pot?' } : hello(ctx, TEA_HELLO, { zh: '客官里边请！走了一路，喝口茶歇歇脚？', en: 'Come in, come in! A long walk — sit and have some tea?' });
        if (!served && ctx.player.character === 'guan') f.wave();
        const c = await talk(ctx, f, name, [{
          zh: hi.zh,
          en: hi.en,
          choices: [{ zh: '来一壶茶', en: 'A pot of tea' }, { zh: '打听大橘', en: 'Ask about the cat' }, { zh: '告辞', en: 'Goodbye' }],
        }]);
        if (c === 0) {
          const t = await talk(ctx, f, name, [{ zh: '喝哪一种？', en: 'Which will it be?', choices: TEAS.map((x) => ({ zh: x.zh, en: x.en })) }]);
          if (t >= 0) {
            snd.pour();
            f.armR.rotation.x = -0.6;
            bag.later(1400, () => { f.armR.rotation.x = 0; ctx.player.emote('eat'); });
            served++;
            const tea = TEAS[t];
            await talk(ctx, f, name, [{ zh: `好嘞，${tea.zh}一壶！\n${tea.factZh}`, en: `One pot of ${tea.en}, coming up!\n${tea.factEn}` }]);
            ctx.hud.toast('茶香满口，脚步也轻了', 'Fragrant tea — your steps feel lighter', 2000);
          }
        } else if (c === 1) {
          await talk(ctx, f, name, [
            { zh: '大橘？那只胖橘猫呀，天天换地方睡觉。', en: 'Big Ginger? That fat orange cat sleeps somewhere different every day.' },
            { zh: cat.region === 'village' ? `${cat.clueZh}\n就在咱们水乡，你找找看。` : `我听人说……${cat.clueZh}`, en: cat.region === 'village' ? `${cat.clueEn}\nRight here in the water town — have a look.` : `I heard that… ${cat.clueEn}` },
            { zh: '竖起耳朵听——哪里有呼噜声，它就在哪儿。', en: 'Keep your ears open — where there’s purring, there’s the cat.' },
          ]);
        }
      } finally { end(ctx, 'talk'); }
    },
  });
});

// ───────────────────────────── 老渔翁, the old fisherman ─────────────────────────────

const JOKES = [
  { zh: '有人问我：老人家，钓了一天，钓到什么了？\n我说：钓到了一天。', en: 'Someone asked me, “Fished all day, old man — what did you catch?”\nI said: “A whole day.”' },
  { zh: '姜太公钓鱼，直钩，愿者上钩。\n我这钩是弯的，鱼还不愿意呢。', en: 'Grand Duke Jiang fished with a straight hook — “let the willing bite”.\nMine is bent, and they’re still not willing.' },
  { zh: '一条鱼对另一条说：他又来了。\n另一条说：别理他，他就是来坐坐的。', en: 'One fish says to another, “He’s here again.”\n“Ignore him. He just comes to sit.”' },
];

export const oldFisherman = feature('npc-fisherman', (bag, ctx) => {
  const { THREE } = ctx;
  const a = ANCHORS.dock;
  const lake = { x: REGION.lake.center.x, z: REGION.lake.center.z };
  const dx = lake.x - a.x, dz = lake.z - a.z, L = Math.hypot(dx, dz);
  const f = placed(bag, ctx, 'lake', { robe: '#8a8468', trim: '#4a4434', cape: '#9c8a5a', hat: 'bamboo', hatColor: '#c8b07a', beard: '#e8e2d4', hair: '#d8d2c4', sit: true }, a, (-dz / L) * 3.2 - (dx / L) * 0.5, (dx / L) * 3.2 - (dz / L) * 0.5, { x: a.x + dx * 2, z: a.z + dz * 2 });
  // his rod out over the water
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.6, 5).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: '#9b7d4a' }));
  rod.position.copy(f.hand);
  rod.rotation.x = 1.85;
  f.armR.add(rod);
  f.armR.rotation.x = -0.9;
  const still = reducedMotion();
  bag.frame((_dt, t) => { if (!still) rod.rotation.x = 1.85 + Math.sin(t * 0.9) * 0.03; });
  greet(bag, ctx, f, 4);
  let joke = Math.floor(dayRng(ctx, 'joke')() * JOKES.length);
  const name = { zh: '老渔翁', en: 'Old Fisherman' };
  bag.interact({
    id: 'npc-fisherman', position: front(f, 1), radius: 2,
    labelZh: '老渔翁', labelEn: 'Old fisherman', actionZh: '说话', actionEn: 'Talk',
    async act() {
      if (!begin(ctx, 'talk')) return;
      try {
        record('npc:fisher');
        if (await offerFlower(ctx, f, name, 'fisher')) return;
        const n = play.value.counters.fish ?? 0;
        const hi = hello(ctx, FISHER_HELLO, n >= 5 ? { zh: '哟，你如今也是个老把式了。', en: 'Well now, you’re an old hand yourself these days.' } : { zh: '年轻人，也想试试这一竿风月？', en: 'Young one — fancy a try at the rod?' });
        const c = await talk(ctx, f, name, [{
          zh: hi.zh,
          en: hi.en,
          choices: [{ zh: '怎么钓？', en: 'How do I fish?' }, { zh: '讲个笑话', en: 'Tell me a joke' }, { zh: '见过大橘吗？', en: 'Seen the cat?' }],
        }]);
        if (c === 0) {
          await talk(ctx, f, name, [
            { zh: '渡口站定，按住蓄力，松手抛竿。', en: 'Stand on the dock. Hold to swing back, let go to cast.' },
            { zh: '浮漂轻轻点两下，那是鱼在试探——别急。沉下去了，再提！', en: 'A little twitch or two is the fish testing you — wait. When the float goes under: strike!' },
            { zh: '上了钩，按住让那浅色的框子罩住鱼。鲤鱼稳，白鲦滑，锦鲤……可遇不可求。', en: 'Once hooked, hold to keep the pale band over the fish. Carp are steady, minnows slippery, and golden koi… come when they please.' },
            { zh: n >= 5 ? '五条都钓过了？这蓑衣斗笠，你穿去吧。' : `钓满五条，我把蓑衣斗笠借你穿。（${Math.min(n, 5)}/5）`, en: n >= 5 ? 'Five already? Then the cape and hat are yours to wear.' : `Catch five and I’ll lend you my cape and hat. (${Math.min(n, 5)}/5)` },
          ]);
        } else if (c === 1) {
          const j = JOKES[joke++ % JOKES.length];
          await talk(ctx, f, name, [{ zh: j.zh, en: j.en }]);
          ctx.hud.toast('哈哈哈……', 'Ha ha ha…', 1200);
        } else if (c === 2) {
          const cat = todaysCat(ctx);
          await talk(ctx, f, name, [{ zh: cat.id === 'dock' ? '我的鱼篓怎么又轻了……你往身后看看？' : `那个偷鱼贼？今天没来。${cat.clueZh}`, en: cat.id === 'dock' ? 'My creel’s lighter again… have a look behind you?' : `That fish thief? Not today. ${cat.clueEn}` }]);
        }
      } finally { end(ctx, 'talk'); }
    },
  });
});

// ───────────────────────────── 知客僧, the monk at the gate ─────────────────────────────

const KOANS = [
  { zh: '有僧问赵州：「学人初入丛林，请师指示。」\n赵州问：「吃粥了也未？」\n僧说：「吃粥了。」\n赵州说：「洗钵盂去。」', en: 'A monk asked Zhaozhou: “I have just entered the monastery. Please teach me.”\n“Have you eaten your gruel?”\n“I have.”\n“Then go wash your bowl.”' },
  { zh: '僧问：「如何是祖师西来意？」\n赵州答：「庭前柏树子。」', en: 'A monk asked: “What is the meaning of the Patriarch coming from the West?”\nZhaozhou: “The cypress tree in the courtyard.”' },
  { zh: '有人来，赵州说：「吃茶去。」\n又有人来，赵州说：「吃茶去。」\n院主问何故，赵州唤院主，院主应诺。\n赵州说：「吃茶去。」', en: 'Someone came; Zhaozhou said, “Go have some tea.” Someone else came: “Go have some tea.”\nThe steward asked why. Zhaozhou called his name; he answered.\n“Go have some tea.”' },
];

export const monk = feature('npc-monk', (bag, ctx) => {
  const g = ANCHORS.templeGate;
  const f = placed(bag, ctx, 'mountain', { robe: '#b0703a', trim: '#6a3f22', hat: 'bald', skin: '#efd6b8', cape: '#a8463a' }, g, 2.2, 1.8, { x: g.x, z: g.z + 10 });
  // prayer beads
  const { THREE } = ctx;
  const beads = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 5, 14), new THREE.MeshLambertMaterial({ color: '#5a3d2b' }));
  beads.position.copy(f.hand).add(new THREE.Vector3(0, -0.06, 0.02));
  f.armR.add(beads);
  f.armR.rotation.x = -0.7;
  greet(bag, ctx, f);
  let k = Math.floor(dayRng(ctx, 'koan')() * KOANS.length);
  const name = { zh: '知客僧', en: 'Gate Monk' };
  bag.interact({
    id: 'npc-monk', position: front(f), radius: 2,
    labelZh: '知客僧', labelEn: 'Gate monk', actionZh: '问禅', actionEn: 'Ask',
    async act() {
      if (!begin(ctx, 'talk')) return;
      ctx.player.emote('bow');
      try {
        record('npc:monk');
        if (await offerFlower(ctx, f, name, 'monk')) return;
        const koan = KOANS[k++ % KOANS.length];
        const rang = !!play.value.flags.bell;
        const cat = todaysCat(ctx);
        if (ctx.player.character === 'guan') window.dispatchEvent(new CustomEvent('banmu:bow', { detail: { x: f.root.position.x, z: f.root.position.z, r: 1 } }));
        const c = await talk(ctx, f, name, [
          hello(ctx, MONK_HELLO, { zh: '阿弥陀佛。施主远来辛苦。', en: 'Amituofo. You have come a long way.' }),
          { zh: '贫僧讲个公案给施主听：\n' + koan.zh, en: 'Let me tell you a story of the old masters:\n' + koan.en, choices: [{ zh: '……懂了？', en: '…I think I get it?' }, { zh: '不懂', en: 'I don’t get it' }] },
        ]);
        await talk(ctx, f, name, [
          { zh: c === 0 ? '懂了就好，不懂也好。' : '不懂最好。懂了，就又多了一样东西。', en: c === 0 ? 'Good if you get it. Good if you don’t.' : 'Best not to. Getting it is just one more thing to carry.' },
          rang
            ? { zh: '方才的钟声，是施主撞的吧？好声音。', en: 'That bell just now — was it you? A fine sound.' }
            : { zh: '钟楼在大殿西边。撞钟莫用蛮力——拉满了，放手，钟自己会响。', en: 'The bell tower is west of the hall. No brute force — draw the log back fully, let go, and the bell rings itself.' },
          ...(cat.region === 'mountain' ? [{ zh: cat.clueZh, en: cat.clueEn }] : []),
        ]);
      } finally { end(ctx, 'talk'); }
    },
  });
});

// ───────────────────────────── 诗人, the poet on the ridge: 飞花令 ─────────────────────────────

export const poet = feature('npc-poet', (bag, ctx) => {
  const top = ANCHORS.plumSummit;
  const f = placed(bag, ctx, 'plum', { robe: '#e9e6dc', trim: '#3d5a73', hat: 'bun', beard: '#23201d' }, top, 1.6, 1.2, { x: top.x + 8, z: top.z + 8 });
  // a wine gourd on his hip
  const { THREE, palette: P } = ctx;
  const gourd = inked(ctx, merge(THREE, [
    part(THREE, new THREE.SphereGeometry(0.07, 10, 8), '#c9952a', { p: [0, 0, 0] }),
    part(THREE, new THREE.SphereGeometry(0.048, 10, 8), '#c9952a', { p: [0, 0.1, 0] }),
    part(THREE, new THREE.TorusGeometry(0.03, 0.008, 4, 10), P.cinnabar, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0] }),
  ]), { width: 0.006 });
  gourd.position.set(0.2, 0.55, 0.05);
  f.root.add(gourd);
  greet(bag, ctx, f, 6);
  const mark = speechMark(bag, f, '令');

  // reaching the summit pavilion
  let summit = !!play.value.flags.summit;
  bag.frame(() => {
    if (summit) return;
    const d = Math.hypot(ctx.player.position.x - top.x, ctx.player.position.z - top.z);
    if (d < 5) {
      summit = true;
      flag('summit');
      ctx.audio.chime(3);
      ctx.hud.showCard({
        titleZh: '登高', titleEn: 'The summit',
        bodyZh: '会当凌绝顶，一览众山小。\n—— 杜甫《望岳》', bodyEn: 'I shall stand on the highest peak and see all other mountains small beneath me.\n— Du Fu, “Gazing at the Mountain”',
        seal: '登',
      });
    }
  });

  const name = { zh: '诗人', en: 'The Poet' };
  bag.interact({
    id: 'npc-poet', position: front(f), radius: 2.2,
    labelZh: '亭中诗人', labelEn: 'Poet in the pavilion', actionZh: '飞花令', actionEn: 'Flying Flowers',
    async act() {
      if (!begin(ctx, 'feihua')) return;
      const restore = withTheme(ctx, 'quiet');
      mark.set(false);
      try {
        record('npc:poet');
        if (await offerFlower(ctx, f, name, 'poet')) return;
        const own = forCompanion(POET_NPC_HELLO, ctx.player.character);
        if (own) await talk(ctx, f, name, [own]);
        const go = await talk(ctx, f, name, [{
          zh: '好山好水，正好行令。来一局飞花令？我出一句，你接一句带「令字」的诗。三轮，每轮四句。',
          en: 'Fine hills, fine water — just right for a drinking game. Flying Flowers? I say a line, you answer with a line containing the key character. Three rounds, four lines each.',
          choices: [{ zh: '来！', en: 'Let’s play!' }, { zh: '改日', en: 'Another day' }],
        }]);
        if (go !== 0) return;
        const rng = makeRng(hashString(`feihua:${toKey(ctx.env.date)}:${Math.floor(performance.now())}`));
        const lings = playableLing(4);
        const picks: string[] = [];
        while (picks.length < 3 && lings.length) picks.push(lings.splice(Math.floor(rng() * lings.length), 1)[0]);
        const used = new Set<string>();
        let streak = 0, lost = false;
        for (let r = 0; r < picks.length && !lost; r++) {
          const ling = picks[r];
          const turns = feihuaTurns(ling, 4, rng, used);
          await talk(ctx, f, name, [{ zh: `第${'一二三'[r]}轮，令字——「${ling}」！`, en: `Round ${r + 1}. The key character: “${ling}”!` }]);
          ctx.audio.pluck(r * 2, 0.5);
          for (const turn of turns) {
            const pick = await talk(ctx, f, name, [{
              zh: `「${turn.poet.text}」\n—— ${turn.poet.src}\n\n请接一句带「${ling}」的：`,
              en: `“${turn.poet.text}” — ${turn.poet.src}\n\nYour line with “${ling}”:`,
              choices: turn.options.map((o) => ({ zh: o.text, en: o.text })),
            }]);
            if (pick === turn.answer) {
              streak++;
              ctx.audio.pluck([0, 2, 4, 5, 7][streak % 5], 0.6);
            } else {
              lost = true;
              const right = turn.options[turn.answer];
              snd.click(0.6);
              await talk(ctx, f, name, [{ zh: `哈！该是「${right.text}」——${right.src}。罚酒一杯！`, en: `Ha! It was “${right.text}” — ${right.src}. A forfeit cup for you!` }]);
              break;
            }
          }
        }
        recordMax('feihua', streak);
        if (!lost) { ctx.audio.chime(6); snd.ding(5); }
        await talk(ctx, f, name, [{
          zh: lost ? `接了 ${streak} 句，不错不错。改日再战！` : `十二句全接上了！妙哉——当浮一大白！`,
          en: lost ? `${streak} lines in a row — not bad at all. Again some day!` : 'All twelve! Marvellous — this calls for a great cup of wine!',
        }]);
        ctx.hud.showCard({
          titleZh: '飞花令', titleEn: 'Flying Flowers',
          bodyZh: `连接 ${streak} 句\n最好成绩 ${play.value.best.feihua ?? streak} 句\n\n春城无处不飞花，寒食东风御柳斜。\n—— 韩翃《寒食》`,
          bodyEn: `${streak} lines in a row\nYour best: ${play.value.best.feihua ?? streak}\n\nNowhere in the spring city do flowers not fly.\n— Han Hong`,
          seal: '令',
        });
      } finally {
        restore();
        mark.set(true);
        end(ctx, 'feihua');
      }
    },
  });
});

// ───────────────────────────── 放风筝的孩子, the child and the lost kite ─────────────────────────────

/** A swallow kite (沙燕): a painted paper diamond with wings and two tails. */
function kiteMesh(ctx: WorldCtx, body: string, wing: string): T.Mesh {
  const { THREE, palette: P } = ctx;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42); shape.lineTo(0.12, 0.1); shape.lineTo(0.55, 0.12); shape.lineTo(0.14, -0.08); shape.lineTo(0.2, -0.5);
  shape.lineTo(0, -0.22); shape.lineTo(-0.2, -0.5); shape.lineTo(-0.14, -0.08); shape.lineTo(-0.55, 0.12); shape.lineTo(-0.12, 0.1); shape.lineTo(0, 0.42);
  const g = merge(THREE, [
    part(THREE, new THREE.ShapeGeometry(shape), wing),
    part(THREE, new THREE.CircleGeometry(0.1, 10), body, { p: [0, 0.18, 0.004] }),
    part(THREE, new THREE.CircleGeometry(0.03, 8), P.ink, { p: [0, 0.2, 0.008] }),
    part(THREE, new THREE.PlaneGeometry(0.03, 0.5), P.cinnabar, { p: [0.1, -0.7, 0] }),
    part(THREE, new THREE.PlaneGeometry(0.03, 0.5), P.cinnabar, { p: [-0.1, -0.7, 0] }),
  ]);
  // double-sided paper
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

export const kiteChild = feature('npc-kite', (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('bamboo');
  const edge = { x: -60, z: 34 }; // at the edge of the grove, by the path from the garden
  const f = placed(bag, ctx, 'bamboo', { robe: '#d4553a', trim: '#6a3f22', hat: 'buns', scale: 0.72 }, edge, 0, 0, { x: -40, z: 30 });
  greet(bag, ctx, f, 7);
  const mark = speechMark(bag, f, '？');
  const still = reducedMotion();
  const day = toKey(ctx.env.date);
  const foundKey = `kite:${day}`;
  let returned = !!play.value.flags[foundKey];
  let carrying = false;

  // the child's own kite, high on the wind, its string to the child's hand
  const flying = [kiteMesh(ctx, '#f4efe4', '#3d5a73')];
  flying[0].scale.setScalar(1.6);
  bag.add(flying[0], group);
  // the lost one: caught in the bamboo somewhere (the same all day)
  const rng = dayRng(ctx, 'kite');
  const cands: XZ[] = [{ x: ANCHORS.bambooShrine.x + 4, z: ANCHORS.bambooShrine.z - 3 }, { x: -100, z: 18 }, { x: -92, z: 46 }, { x: -74, z: 44 }, { x: -104, z: 32 }];
  const c = cands[Math.floor(rng() * cands.length)];
  const lp = walkableNear(ctx, c.x, c.z, 6);
  const lostAt = new THREE.Vector3(lp.x, ctx.groundY(lp.x, lp.z), lp.z);
  const lost = kiteMesh(ctx, '#f4efe4', '#b83a4b');
  lost.position.set(lostAt.x, lostAt.y + 2.4, lostAt.z);
  lost.rotation.set(0.4, rng() * Math.PI, 0.7);
  bag.add(lost, group);
  const glint = glints(bag, [lostAt.clone().setY(lostAt.y + 2.1)], '#ffd98a', 0.6);
  if (returned) { lost.visible = false; glint.hide(0); addSecond(); mark.set(false); }

  function addSecond() {
    if (flying.length > 1) return;
    const k = kiteMesh(ctx, '#f4efe4', '#b83a4b');
    k.scale.setScalar(1.6);
    bag.add(k, group);
    flying.push(k);
  }

  // strings
  const strPos = new Float32Array(2 * 2 * 3);
  const strGeo = new THREE.BufferGeometry();
  strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3).setUsage(THREE.DynamicDrawUsage));
  const strings = new THREE.LineSegments(strGeo, new THREE.LineBasicMaterial({ color: '#2a2621', transparent: true, opacity: 0.5 }));
  strings.frustumCulled = false;
  bag.add(strings, group);
  const hand = new THREE.Vector3();
  f.armR.rotation.z = -1.9; // holding the string up
  const lookUp = () => { f.head.rotation.x = -0.35; };

  const name = { zh: '小童', en: 'Little One' };
  bag.interact({
    id: 'npc-kite', position: front(f, 0.8), radius: 2,
    labelZh: '放风筝的孩子', labelEn: 'Child with a kite', actionZh: '说话', actionEn: 'Talk',
    async act() {
      if (!begin(ctx, 'talk')) return;
      try {
        record('npc:kite');
        if (await offerFlower(ctx, f, name, 'kite')) return;
        if (returned) {
          await talk(ctx, f, name, [{ zh: '你看！两只都飞起来啦！', en: 'Look! Both of them are flying!' }]);
        } else if (carrying) {
          carrying = false;
          returned = true;
          flag(foundKey);
          record('kite');
          addSecond();
          mark.set(false);
          ctx.audio.chime(3);
          snd.flutter(0.6);
          await talk(ctx, f, name, [{ zh: '我的沙燕！谢谢你！我要让它们一起飞！', en: 'My swallow kite! Thank you! I’ll fly them together!' }]);
          ctx.hud.showCard({
            titleZh: '纸鸢', titleEn: 'Paper kites',
            bodyZh: '儿童散学归来早，\n忙趁东风放纸鸢。\n\n—— 高鼎《村居》', bodyEn: 'The children came home early from school,\nhurrying to fly their kites on the east wind.\n\n— Gao Ding, “Village Life”',
            seal: '鸢',
          });
        } else {
          const own = forCompanion(KITE_HELLO, ctx.player.character);
          await talk(ctx, f, name, [
            ...(own ? [own] : []),
            { zh: '呜……我的红沙燕被风刮进竹林里了！', en: 'Waah… the wind blew my red swallow kite into the bamboo!' },
            { zh: '它挂在竹子上，一闪一闪的。你能帮我拿回来吗？', en: 'It’s stuck up in the bamboo, glinting. Could you fetch it for me?' },
          ]);
        }
      } finally { end(ctx, 'talk'); }
    },
  });
  bag.interact({
    id: 'npc-kite-lost', position: lostAt, radius: 2.4,
    labelZh: '挂住的风筝', labelEn: 'A kite in the bamboo', actionZh: '取下', actionEn: 'Take it down',
    act() {
      if (returned || carrying) return;
      carrying = true;
      ctx.player.emote('jump');
      snd.flutter(0.5);
      glint.hide(0);
      ctx.hud.toast('取下了风筝，送回去吧', 'Got the kite — take it back to the child', 2200);
    },
  });

  bag.frame((_dt, t) => {
    const pp = ctx.player.position;
    const near = Math.hypot(pp.x - f.root.position.x, pp.z - f.root.position.z) < 80;
    if (!near) return;
    lookUp();
    f.armR.updateWorldMatrix(true, false);
    hand.copy(f.hand);
    f.armR.localToWorld(hand);
    const wind = still ? 0 : 1;
    for (let i = 0; i < flying.length; i++) {
      const k = flying[i];
      const ph = t * 0.35 + i * 2.2;
      k.position.set(
        f.root.position.x + 8 + i * 3 + Math.sin(ph) * 2.2 * wind,
        f.root.position.y + 12 + i * 1.5 + Math.sin(ph * 2) * 0.8 * wind,
        f.root.position.z - 6 + Math.cos(ph * 0.7) * 1.5 * wind,
      );
      k.lookAt(hand);
      k.rotateX(-0.6);
      k.rotateZ(Math.sin(t * 1.3 + i) * 0.15 * wind);
      strPos.set([hand.x, hand.y, hand.z, k.position.x, k.position.y - 0.1, k.position.z], i * 6);
    }
    strGeo.setDrawRange(0, flying.length * 2);
    strGeo.attributes.position.needsUpdate = true;
    // the kite you carry rides above your shoulder
    if (carrying) {
      lost.position.set(pp.x, pp.y + 1.5 + (still ? 0 : Math.sin(t * 3) * 0.05), pp.z);
      lost.rotation.set(0.3, ctx.player.heading + Math.PI, Math.sin(t * 2) * 0.1 * wind);
      lost.scale.setScalar(0.7);
    } else if (!returned) {
      lost.rotation.z = 0.7 + (still ? 0 : Math.sin(t * 2.4) * 0.05);
    } else lost.visible = false;
  });
});

export const NPCS = [teahouse, oldFisherman, monk, poet, kiteChild];
