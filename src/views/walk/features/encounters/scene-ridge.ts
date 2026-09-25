// 梅岭: 观棋烂柯 (two old men at go under the pine — a game that takes a thousand years) and
// 仙鹤引路 (a white crane that will not fly far, until you follow it to a plum grove no one knew).
import type * as T from 'three';
import { ANCHORS, REGION } from '../../map';
import { stoneTable, burst } from '../props';
import * as snd from '../minigames/sound';
import { frameOn } from '../minigames/ui';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, handOf, mark, talkPrompt } from './scene-kit';
import { axe, crane, goBoard, goStone, gourd, mesh, peachTreeParts } from './models';

// ───────────────────────────── 观棋烂柯

export function lanke(s: Stage): Scene {
  const { ctx, THREE } = s;
  const b = ANCHORS.plumBench;
  const at = s.spot(b.x - 3.5, b.z - 2.5, 6);
  const table = stoneTable(ctx, at, 0.3, 0);
  s.bag.add(table.group, s.group);
  s.bag.onDispose(ctx.addCollider({ x: at.x, z: at.z, r: 0.6, h: 0.9 }));
  const board = goBoard(ctx, s.rng);
  board.mesh.position.set(0, 0.77 - 0.27, 0);
  board.mesh.scale.setScalar(0.9);
  table.group.add(board.mesh);
  // the two old men either side, a boy with a plate of dates, and an axe left leaning on the table
  const ax = Math.cos(0.3), az = -Math.sin(0.3);
  const A = s.person(WEAR.sageA, new THREE.Vector3(at.x + ax * 0.95, at.y, at.z + az * 0.95), at, s.group, false);
  const B = s.person(WEAR.sageB, new THREE.Vector3(at.x - ax * 0.95, at.y, at.z - az * 0.95), at, s.group, false);
  s.bag.onDispose(ctx.addCollider({ x: A.root.position.x, z: A.root.position.z, r: 0.4, h: 1.2 }));
  s.bag.onDispose(ctx.addCollider({ x: B.root.position.x, z: B.root.position.z, r: 0.4, h: 1.2 }));
  const boyAt = s.spot(at.x + az * 1.6, at.z - ax * 1.6, 3);
  const boy = s.person(WEAR.boy, boyAt, at);
  const leaning = axe(ctx);
  leaning.root.position.set(at.x - az * 0.7, at.y, at.z + ax * 0.7);
  leaning.root.rotation.set(0.35, 0.3, 0);
  s.bag.add(leaning.root, s.group);
  const m = mark(s, boy);
  s.theme = 'quiet'; // time stands still round the board
  // the stones go down, now and then
  let tick = 0, turn = 0;
  A.armR.userData.posed = B.armR.userData.posed = true;
  s.frame((dt) => {
    tick += dt;
    if (tick > 3.2) { tick = 0; turn++; if (s.dist(at.x, at.z) < 9) snd.click(0.35); (turn % 2 ? A : B).armR.rotation.x = -0.7; }
    A.armR.rotation.x *= 0.93; B.armR.rotation.x *= 0.93;
  });
  const name = C('童子', 'Boy');
  const sage = C('老者', 'Old Man');

  /** Days go by: the sky turns night-day-night, the seasons fall past the board. */
  async function ages(): Promise<void> {
    const seasons = ['#f4c0cc', '#8fb86a', '#d9892e', '#f4efe4'];
    for (let i = 0; i < 4 && s.alive; i++) {
      s.night(true);
      burst(s.bag, new THREE.Vector3(at.x, at.y + 2.4, at.z), seasons[i], 22, { speed: 0.7, size: 0.04, life: 2.2 });
      snd.click(0.5);
      await s.wait(1500);
      s.night(false);
      await s.wait(1100);
    }
  }

  talkPrompt(s, boy, {
    labelZh: '松下对弈', labelEn: 'A game of go under the pine', actionZh: '观棋', actionEn: 'Watch',
    async act() {
      if (s.finished) { await s.say(boy, name, [L('观棋不语真君子。', 'A true gentleman watches the game in silence.')]); return; }
      if (!s.claim()) return;
      m.set(false);
      let frozen = false, holding = false;
      try {
        const who = s.who;
        await s.say(boy, name, [L('嘘——观棋不语。', 'Shh — watch, but say nothing.')]);
        frameOn(ctx, at.x, at.z, at.y + 0.8, 5);
        if (who === 'cat') {
          await s.say(A, sage, [L('这一子该落在哪儿呢……', 'Now where should this stone go…')]);
          ctx.player.emote('jump');
          await s.wait(500);
          const stone = goStone(ctx, true);
          const hand = new THREE.Vector3();
          s.bag.add(stone, ctx.scene);
          s.frame(() => { handOf(s, hand); stone.position.set(hand.x, hand.y - 0.2, hand.z); });
          snd.click(0.8);
          await s.say(B, sage, [L('哎——我的棋子！', 'Hey — my stone!'), L('哈哈哈，罢了罢了。棋子叫猫叼了去，这局棋下不完了。', 'Ha ha ha, never mind. The cat has taken a stone; this game will never be finished.')]);
          await s.say(A, sage, [L('棋下不完，山中的时间也就走不动了——小猫儿，你倒救了个樵夫。', 'And if the game never ends, time in these hills cannot move on — little cat, you have saved some woodcutter.')]);
          s.finish({ zh: '大橘叼走了一枚白子。这局棋从此没下完，山中的时间也就停在了那一刻——那把斧头，至今完好。', en: 'Big Ginger made off with a white stone. The game was never finished, so time in the hills stopped right there — and the axe is still whole.', bonus: 60, seal: '弈' });
          return;
        }
        if (who === 'taoist') {
          await s.say(null, C('道童', 'Taoist Child'), [L('（道童认出来了：南坐者，南斗；北坐者，北斗。南斗注生，北斗注死。）', '(The Taoist child knows them: the one sitting south is the Southern Dipper, the one north the Northern. The South keeps the book of life, the North the book of death.)')]);
          ctx.player.emote('bow');
          const g = gourd(ctx);
          g.position.set(at.x + 0.2, at.y + 0.77, at.z + 0.2);
          s.bag.add(g, s.group);
          await s.say(null, C('道童', 'Taoist Child'), [L('弟子带了一壶酒，敬二位星君。', 'I have brought a gourd of wine for the two star lords.')]);
          await s.say(B, C('北斗', 'Northern Dipper'), [L('……小道童有眼力，也有礼数。', '…A sharp-eyed child, and well-mannered.')]);
          await s.say(A, C('南斗', 'Southern Dipper'), [L('拿簿子来。这「十九」，添一笔，改作「九十」。', 'Bring the ledger. This “nineteen” — one stroke more, and it reads “ninety”.')]);
          s.words('九十', new THREE.Vector3(at.x, at.y + 2.2, at.z), { color: '#c0412f', size: 0.5, life: 4 });
          await ages();
          s.finish({ zh: '道童以一壶酒敬了南斗北斗。南斗提笔，在生死簿上添了一笔。', en: 'The Taoist child offered the Dippers a gourd of wine. The Southern Dipper took up his brush and added a stroke to the book of life.', bonus: 70, seal: '寿' });
          return;
        }
        // the axe goes in your hand while you watch
        const tool = axe(ctx);
        leaning.root.visible = false;
        const hand = ctx.player.holdProp('axe');
        holding = true;
        const held = new THREE.Group();
        held.add(tool.root);
        tool.root.rotation.set(Math.PI, 0, 0);
        tool.root.position.set(0, 0.2, 0);
        if (hand) hand.add(held);
        else { s.bag.add(held, ctx.scene); const v = new THREE.Vector3(); s.frame(() => { handOf(s, v); held.position.copy(v); }); }
        s.bag.onDispose(() => held.removeFromParent());
        ctx.player.freeze(true);
        frozen = true;
        if (who === 'player') {
          await s.say(A, sage, [L('这位也是个下棋的？来，这一手你替我下。', 'You play too? Come — make this move for me.', [C('点三三', 'Invade at 3-3'), C('挂角', 'Approach the corner'), C('弃子争先', 'Sacrifice for the initiative')])]);
          snd.click(0.9);
          await s.say(B, sage, [L('妙！妙！这一手，我想了一百年。', 'Marvellous! I have been thinking about that move for a hundred years.')]);
        } else {
          await s.say(boy, name, [L('给你，含着这个，便不觉饥渴。', 'Here — keep this in your mouth, and you will feel no hunger or thirst.')]);
        }
        await ages();
        await s.say(boy, name, [L('……你怎么还不走？', '…Why haven’t you gone home?')]);
        // the handle crumbles away, the head drops
        const dust = new THREE.Vector3();
        tool.handle.getWorldPosition(dust);
        burst(s.bag, dust, '#8a6440', 26, { speed: 0.6, size: 0.03, life: 1.8 });
        let t = 0;
        await new Promise<void>((res) => {
          const off = ctx.onFrame((dt) => {
            t += dt;
            const k = Math.min(1, t / 1.2);
            tool.handle.scale.set(1 - k * 0.7, 1 - k, 1 - k * 0.7);
            if (k >= 1) { off(); res(); }
          });
          s.bag.onDispose(() => { off(); res(); });
        });
        const head = tool.head;
        const hp = new THREE.Vector3();
        head.getWorldPosition(hp);
        held.removeFromParent();
        ctx.player.holdProp(null);
        holding = false;
        head.removeFromParent();
        s.bag.add(head, ctx.scene);
        head.position.copy(hp);
        const floor = s.y(hp.x, hp.z) - 0.42;
        let vy = 0;
        s.frame((dt) => { if (head.position.y > floor) { vy -= 9 * dt; head.position.y = Math.max(floor, head.position.y + vy * dt); } });
        await s.wait(700);
        snd.click(0.6);
        ctx.player.freeze(false);
        frozen = false;
        await s.say(A, sage, [who === 'player'
          ? L('一局未了，你已下了千年。回去吧，山下已换了人间。', 'One game, not yet finished — and you have played a thousand years. Go home; the world below has changed.')
          : L('斧柯烂矣。山中方七日，世上已千年——回去吧。', 'Your axe-handle has rotted. Seven days in the hills, a thousand years below — go home.')]);
        s.finish(who === 'player'
          ? { zh: '棋士替仙人落了一子，仙人赠他一枚温润的玉棋子。', en: 'The Master played one move for the immortals, and they gave him a jade stone, warm to the touch.', bonus: 80, seal: '弈' }
          : { seal: '柯' });
      } finally {
        if (frozen) ctx.player.freeze(false);
        if (holding) ctx.player.holdProp(null);
        s.unclaim();
      }
    },
  });
  return { x: at.x, z: at.z, r: 12 };
}

// ───────────────────────────── 仙鹤引路

export function xianhe(s: Stage): Scene {
  const { ctx, THREE } = s;
  const c = REGION.plum.center;
  const b = ANCHORS.plumBench;
  // a wandering way from the ridge path to a hollow where plum grows wild
  const raw = [
    { x: b.x - 2, z: b.z + 2 }, { x: b.x + 5, z: b.z - 6 }, { x: c.x + 14, z: c.z - 2 },
    { x: c.x + 10, z: c.z + 10 }, { x: c.x - 2, z: c.z + 16 }, { x: c.x - 12, z: c.z + 10 },
  ];
  const way = raw.map((p) => s.spot(p.x, p.z, 7));
  const end = way[way.length - 1];
  const bird = crane(ctx);
  bird.root.scale.setScalar(1.15);
  bird.root.name = 'qiyu-crane';
  s.bag.add(bird.root, s.group);
  bird.root.position.copy(way[0]);
  let leg = 0;
  let flying: { from: T.Vector3; to: T.Vector3; k: number } | null = null;
  let dancing = false;
  const face = (x: number, z: number) => { bird.root.rotation.y = Math.atan2(x - bird.root.position.x, z - bird.root.position.z); };
  face(way[1].x, way[1].z);
  // the grove at the end: plum trees in red and white bloom (merged: one mesh)
  const parts: T.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + s.rng() * 0.5;
    const p = s.spot(end.x + Math.cos(a) * (3.2 + s.rng() * 1.5), end.z + Math.sin(a) * (3.2 + s.rng() * 1.5), 3);
    const tree = peachTreeParts(THREE, s.rng, p.x, p.y, p.z, 0.9);
    // plum: rouge and white instead of peach pink
    for (const g of tree) {
      const col = g.getAttribute('color');
      if (!col) continue;
      if (col.getX(0) > 0.8 && col.getY(0) < 0.85) {
        const red = s.rng() < 0.5;
        const cc = new THREE.Color(red ? '#c8465a' : '#f6ece6');
        for (let k = 0; k < col.count; k++) col.setXYZ(k, cc.r, cc.g, cc.b);
      }
    }
    parts.push(...tree);
    s.bag.onDispose(ctx.addCollider({ x: p.x, z: p.z, r: 0.25, h: 2 }));
  }
  const grove = mesh(ctx, parts, 0.014);
  grove.visible = false;
  s.bag.add(grove, s.group);
  const beacon = s.glow(new THREE.Vector3(0, 2.1, 0), '#fff1c8', 0.9, 0.6, bird.root);
  s.theme = 'quiet';

  s.frame((dt, t) => {
    const r = bird.root;
    if (flying) {
      flying.k += dt / Math.max(1.5, flying.from.distanceTo(flying.to) / 5);
      const k = Math.min(1, flying.k);
      r.position.lerpVectors(flying.from, flying.to, k);
      r.position.y += Math.sin(k * Math.PI) * 3.5;
      const beat = Math.sin(t * 9) * 0.6;
      bird.wings[0].rotation.z = -0.2 + beat;
      bird.wings[1].rotation.z = 0.2 - beat;
      if (k >= 1) {
        flying = null;
        bird.wings[0].rotation.z = -1.35; bird.wings[1].rotation.z = 1.35;
        if (leg === way.length - 1) arrive();
      }
      return;
    }
    // standing: preens, looks back at you; when you come near, it flies on
    bird.neck.rotation.x = Math.sin(t * 0.8) * 0.15 + (dancing ? Math.sin(t * 5) * 0.4 : 0);
    if (dancing) {
      const beat = Math.sin(t * 4);
      bird.wings[0].rotation.z = -0.5 + beat * 0.5; bird.wings[1].rotation.z = 0.5 - beat * 0.5;
      r.position.y = s.y(r.position.x, r.position.z) + Math.abs(Math.sin(t * 4)) * 0.3;
      return;
    }
    if (leg < way.length - 1 && s.dist(r.position.x, r.position.z) < 4.5) {
      s.engaged = true;
      if (leg === 0) ctx.hud.toast('白鹤回头看了你一眼，往前飞去。', 'The crane looks back at you, and flies on.', 2600);
      leg++;
      flying = { from: r.position.clone(), to: way[leg].clone(), k: 0 };
      face(way[leg].x, way[leg].z);
      snd.flutter(0.5);
    }
  });

  function arrive(): void {
    grove.visible = true;
    burst(s.bag, new THREE.Vector3(end.x, end.y + 2, end.z), '#f4c0cc', 30, { speed: 1.2, size: 0.04, life: 2.5 });
    dancing = true;
    beacon.visible = false;
    s.qin([4, 5, 7, 9, 12], 380, 0.6);
    const off = s.prompt({
      id: 'qiyu-xianhe', position: new THREE.Vector3(end.x, end.y, end.z), radius: 3,
      labelZh: '白鹤', labelEn: 'The white crane', actionZh: '走近', actionEn: 'Go closer',
      async act() {
        if (s.finished || !s.claim()) return;
        off();
        try {
          const who = s.who;
          if (who === 'painter') {
            ctx.player.emote('skill');
            s.words('疏影横斜', new THREE.Vector3(end.x, end.y + 2.4, end.z), { color: '#b83a4b', vertical: true, life: 5 });
            await s.say(null, C('画师', 'Painter'), [L('原来你要带我来的是这里。——你的纸鹤早就认得路。', 'So this is where you wanted to bring me. Your paper cousin knew the way all along.')]);
            s.finish({ zh: '画师把这片梅林画进了画里。此后，画上的鹤时常不见——想是又去引路了。', en: 'The painter painted the grove into a scroll. Ever since, the crane in the painting is often missing — off showing someone the way, no doubt.', bonus: 60, seal: '鹤' });
          } else if (who === 'change') {
            await s.say(null, C('白鹤', 'White Crane'), [L('（白鹤低下头，轻轻啄了啄嫦娥的衣袖。）', '(The crane bows its head and gently tugs at Chang’e’s sleeve.)')]);
            await s.say(null, C('嫦娥', "Chang'e"), [L('是你呀。广寒宫的桂花，开了么？', 'It’s you. Is the osmanthus blooming in the Moon Palace?')]);
            s.words('桂', new THREE.Vector3(end.x, end.y + 2.2, end.z), { color: '#d9a62e', size: 0.6, life: 4 });
            s.finish({ zh: '原来这只白鹤是从月宫来的。它衔来一枝桂花，放在嫦娥手里。', en: 'The crane had come from the Moon Palace. It brought a sprig of osmanthus and laid it in Chang’e’s hand.', bonus: 60, seal: '鹤' });
          } else {
            await s.say(null, C('白鹤', 'White Crane'), [L('（白鹤在梅树下舞了一圈，引颈长鸣，声闻于天。）', '(The crane dances a circle beneath the plum trees, stretches its neck and calls — a cry heard in heaven.)')]);
            s.finish();
          }
        } finally {
          s.unclaim();
        }
      },
    });
  }
  return { x: way[0].x, z: way[0].z, r: 40 };
}
