// 水乡: 拾金不昧 (a fat purse in the lane, an owner beside himself), 刻舟求剑 (a man marking his boat to
// find a sword), and 醉仙 (a guest at the teahouse at night whose cup is not tea).
import { ANCHORS, RIVER, REGION } from '../../map';
import { part } from '../geo';
import { burst, glints } from '../props';
import { ripples } from '../minigames/fx';
import * as snd from '../minigames/sound';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, faceMe, handOf, inHand, mark, sway, talkPrompt, vanish, walkTo } from './scene-kit';
import { cup, gourd, mesh, purse, sampan } from './models';

// ───────────────────────────── 拾金不昧

export function shijin(s: Stage): Scene {
  const { ctx, THREE } = s;
  const sq = ANCHORS.villageSquare, mk = ANCHORS.market;
  const at = s.spot(sq.x - 7, sq.z + 7, 5);
  const bag = purse(ctx);
  bag.position.copy(at);
  bag.rotation.y = 0.7;
  s.bag.add(bag, s.group);
  const sparkle = glints(s.bag, [at], '#ffd98a', 0.7);
  // the owner, pacing up and down by the market
  const o1 = s.spot(mk.x + 3, mk.z + 1, 5), o2 = s.spot(mk.x - 4, mk.z - 3, 5);
  const owner = s.person(WEAR.merchant, o1, o2, s.group, false);
  let pacing = true;
  let leg = 0;
  const pace = async () => {
    while (pacing && s.alive) {
      const p = leg++ % 2 ? o1 : o2;
      await walkTo(s, owner, p.x, p.z, 1.6);
      if (!pacing || !s.alive) return;
      if (s.dist(owner.root.position.x, owner.root.position.z) < 16) s.words('我的钱袋！', new THREE.Vector3(owner.root.position.x, owner.root.position.y + 1.9, owner.root.position.z), { color: '#c0412f', size: 0.28, life: 2.2 });
      await s.wait(900);
    }
  };
  void pace();
  const oname = C('客商', 'Merchant');
  let got = false;
  let returned = false;
  let offPurse: () => void = () => {};
  const hold = (whoHolds: 'walker' | 'thief' | 'none', thief?: ReturnType<Stage['person']>) => {
    bag.removeFromParent();
    if (whoHolds === 'walker') {
      s.bag.add(bag, ctx.scene);
      const v = new THREE.Vector3();
      s.frame(() => { if (bag.parent === ctx.scene) { handOf(s, v); bag.position.set(v.x, v.y - 0.25, v.z); } });
    } else if (whoHolds === 'thief' && thief) {
      bag.position.set(0, -0.2, 0.05);
      thief.armR.add(bag);
    }
  };

  /** Give it back: the owner comes running. */
  const giveBack = async (fast: boolean) => {
    pacing = false;
    const p = s.player();
    const a = Math.atan2(owner.root.position.x - p.x, owner.root.position.z - p.z);
    await walkTo(s, owner, p.x + Math.sin(a) * 1.3, p.z + Math.cos(a) * 1.3, fast ? 4 : 2.4);
    faceMe(s, owner);
    bag.visible = false;
    returned = true;
  };

  // the swordsman: a thief is quicker to the purse — catch him (run!)
  let chase: { thief: ReturnType<Stage['person']>; t: number; caught: boolean; dir: number } | null = null;
  if (s.who === 'swordsman') {
    const tAt = s.spot(at.x + 5, at.z - 3, 4);
    const thief = s.person(WEAR.thief, tAt, at, s.group, false);
    let started = false;
    s.frame((dt) => {
      if (!started) {
        if (s.dist(at.x, at.z) < 9 && !got) {
          started = true;
          s.engaged = true;
          got = true;
          offPurse();
          sparkle.hide(0);
          void walkTo(s, thief, at.x, at.z, 5.5).then(() => {
            if (!s.alive) return;
            hold('thief', thief);
            s.words('嘿嘿！', new THREE.Vector3(thief.root.position.x, thief.root.position.y + 1.8, thief.root.position.z), { color: '#1b1916', size: 0.3, life: 1.6 });
            ctx.hud.toast('有贼！快追——按住奔跑，或用轻功', 'A thief! After him — hold Run, or use your light-foot skill', 3600);
            s.music('festival'); // gongs and drums for the chase
            const p = s.player();
            chase = { thief, t: 0, caught: false, dir: Math.atan2(at.x - p.x, at.z - p.z) };
          });
        }
        return;
      }
      if (!chase || chase.caught) return;
      chase.t += dt;
      const r = chase.thief.root;
      const p = s.player();
      const d = Math.hypot(p.x - r.position.x, p.z - r.position.z);
      // a moment's head start (he is quick off the mark), then a hand on his collar within reach
      if ((d < 1.6 && chase.t > 1.2) || chase.t > 22) {
        chase.caught = true;
        chase.thief.walking = 0;
        void onCaught(d < 1.6);
        return;
      }
      // flee from the walker, along open ground, staying in the town
      const away = Math.atan2(r.position.x - p.x, r.position.z - p.z);
      const c = REGION.village.center;
      const home = Math.atan2(c.x - r.position.x, c.z - r.position.z);
      const far = Math.hypot(r.position.x - c.x, r.position.z - c.z) > REGION.village.radius * 0.8;
      let want = far ? home : away;
      let dd = want - chase.dir;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      chase.dir += dd * Math.min(1, dt * 2.5);
      const speed = chase.t < 1.5 ? 5.6 : chase.t > 12 ? 3.4 : 4.6;
      for (let k = 0; k < 7; k++) {
        const tryA = chase.dir + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
        const nx = r.position.x + Math.sin(tryA) * speed * dt * 4, nz = r.position.z + Math.cos(tryA) * speed * dt * 4;
        if (ctx.isWalkable(nx, nz)) { want = tryA; break; }
      }
      chase.dir = want;
      r.position.x += Math.sin(want) * speed * dt;
      r.position.z += Math.cos(want) * speed * dt;
      r.position.y = s.y(r.position.x, r.position.z);
      r.rotation.y = want;
      chase.thief.walking = 1;
    });
    const onCaught = async (fair: boolean) => {
      if (!chase) return;
      const th = chase.thief;
      if (!s.claim()) return;
      try {
        faceMe(s, th);
        await s.say(th, C('小贼', 'Thief'), [fair
          ? L('好快的身手！大侠饶命，钱袋还你！', 'Such speed! Spare me, hero — here’s the purse!')
          : L('哎哟！（小贼脚下一绊，摔了个嘴啃泥，钱袋滚到你脚边。）', 'Ouch! (The thief trips and falls flat; the purse rolls to your feet.)')]);
        hold('walker');
        void vanish(s, th.root, '#2b2622', 800);
        await giveBack(true);
        await s.say(owner, oname, [L('大侠！这是给家母抓药的钱，您可救了我一家！', 'Hero! That was my mother’s medicine money — you have saved my family!')]);
        await s.say(null, C('侠客', 'Swordsman'), [L('路见不平，拔刀相助——举手之劳。', 'A wrong on the road, a blade drawn — it was nothing.')]);
        s.finish(fair
          ? { zh: '一个小贼抢先拾走了钱袋，侠客几步便追上了他。钱袋物归原主。', en: 'A thief got to the purse first; the swordsman caught him in a few strides. The purse went home.', bonus: 60, seal: '侠' }
          : { zh: '一个小贼抢先拾走了钱袋，被侠客追得慌不择路，自己绊了一跤。钱袋物归原主。', en: 'A thief got to the purse first; chased by the swordsman he ran blindly and tripped over his own feet. The purse went home.', bonus: 40, seal: '侠' });
      } finally {
        s.unclaim();
      }
    };
  }

  const m = mark(s, { root: bag, height: 0.25 } as never);
  offPurse = s.prompt({
    id: 'qiyu-shijin', position: at, radius: 1.6,
    labelZh: '地上的钱袋', labelEn: 'A purse on the ground', actionZh: '拾起', actionEn: 'Pick it up',
    async act() {
      if (got || s.finished || !s.claim()) return;
      got = true;
      offPurse();
      m.set(false);
      sparkle.hide(0);
      try {
        const who = s.who;
        ctx.player.emote('pet');
        hold('walker');
        if (who === 'guan') {
          s.words('谁的钱袋？', new THREE.Vector3(s.player().x, s.player().y + 2.2, s.player().z), { color: '#c0412f', size: 0.42, life: 3 });
          window.dispatchEvent(new CustomEvent('banmu:bow', { detail: { x: s.player().x, z: s.player().z, r: 12 } }));
          await s.say(null, C('关公', 'Lord Guan'), [L('（关公拾起钱袋，未及打开，便高声问道：）此是谁家钱袋？', '(Lord Guan picks up the purse and, without opening it, calls out:) Whose purse is this?')]);
          await giveBack(true);
          await s.say(owner, oname, [L('关……关老爷！是小人的！小人给您磕头了！', 'L-Lord Guan! It’s mine! I kowtow to you!')]);
          await s.say(null, C('关公', 'Lord Guan'), [L('物归原主，理所当然。起来吧。', 'A thing returns to its owner; that is only right. Rise.')]);
          s.finish({ zh: '关公拾起钱袋，未及打开，便高声寻主。满街的人都拱手称「义」。', en: 'Lord Guan picked up the purse and, unopened, called for its owner. The whole street bowed and said: righteous.', bonus: 60, seal: '义' });
          return;
        }
        if (who === 'cat') {
          await s.say(null, C('大橘', 'Big Ginger'), [L('（大橘拨了拨钱袋，它叮当作响。大橘叼起来，一溜小跑——）', '(Big Ginger bats the purse; it jingles. He picks it up in his mouth and trots off—)')]);
          await giveBack(false);
          await s.say(owner, oname, [L('哎呀，好猫！好猫！你是给我送回来的？赏你一条大鱼！', 'Oh — good cat! Good cat! You brought it back to me? A big fish for you!')]);
          ctx.player.emote('eat');
          s.finish({ zh: '大橘叼着钱袋，一路小跑送回失主脚边，换来一条大鱼。', en: 'Big Ginger trotted the purse back to its owner’s feet and was paid in fish.', bonus: 40, seal: '猫' });
          return;
        }
        const k = await s.say(null, C('钱袋', 'The Purse'), [L('沉甸甸的，叮当作响。', 'Heavy, and it jingles.', [C('打开看看', 'Look inside'), C('去找失主', 'Find the owner')])]);
        if (k === 0) await s.say(null, C('钱袋', 'The Purse'), [L('满满一袋铜钱，底下压着一张字条：「家母药钱」。', 'A bagful of coppers, and under them a slip of paper: “Mother’s medicine money.”')]);
        ctx.hud.toast('那边有位客商急得团团转……', 'A merchant over there is beside himself…', 2600);
      } finally {
        s.unclaim();
      }
    },
  });
  talkPrompt(s, owner, {
    id: 'qiyu-shijin-owner', labelZh: '急得团团转的客商', labelEn: 'A frantic merchant', actionZh: '搭话', actionEn: 'Talk',
    async act() {
      if (s.finished) { await s.say(owner, oname, [L('恩人！恩人！', 'My benefactor!')]); return; }
      if (!got || returned || chase) {
        if (!got) await s.say(owner, oname, [L('我的钱袋！刚才还在的……红绸的，这么大——您瞧见没有？', 'My purse! It was here a moment ago… red silk, this big — have you seen it?')]);
        return;
      }
      if (!s.claim()) return;
      try {
        await giveBack(false);
        await s.say(owner, oname, [L('正是我的！这是给家母抓药的钱——恩人贵姓？', 'That’s mine! It’s my mother’s medicine money — may I know your name?', [C('举手之劳', 'It was nothing'), C('不必言谢', 'No thanks needed')])]);
        await s.say(owner, oname, [L('您不肯要，我也要谢。这一点心意，务必收下！', 'Even if you won’t ask, I must thank you. Please, take this little token!')]);
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  });
  return { x: at.x, z: at.z, r: 20 };
}

// ───────────────────────────── 刻舟求剑

/** A point on the river's centre line at x (the reach through the town), and its downstream direction. */
function riverAt(x: number): { x: number; z: number; w: number } {
  for (let i = 5; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    if ((x <= a.x && x >= b.x)) {
      const t = (a.x - x) / (a.x - b.x || 1);
      return { x, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t };
    }
  }
  return { x, z: 66, w: 5 };
}

export function kezhou(s: Stage): Scene {
  const { ctx, THREE } = s;
  const r0 = riverAt(12);
  // the boat by the south bank (the town side), the sword upstream where it fell
  let bz = r0.z + r0.w * 0.45;
  if (ctx.waterAt(r0.x, bz) === null) bz = r0.z;
  const wy = ctx.waterAt(r0.x, bz) ?? 0;
  const boat = sampan(ctx);
  boat.position.set(r0.x, wy - 0.12, bz);
  boat.rotation.y = -Math.PI / 2 + 0.15;
  s.bag.add(boat, s.group);
  const man = s.person(WEAR.boatman, new THREE.Vector3(r0.x + 0.7, wy + 0.2, bz), { x: r0.x + 5, z: bz }, s.group, false);
  const knife = mesh(ctx, [part(THREE, new THREE.BoxGeometry(0.02, 0.16, 0.04), '#b8b2a8'), part(THREE, new THREE.BoxGeometry(0.03, 0.08, 0.03), '#6b4a33', { p: [0, -0.1, 0] })], 0.004);
  inHand(man, knife, 0, -0.05, 0.08);
  man.armR.userData.posed = true;
  const up = riverAt(30);
  const swordAt = new THREE.Vector3(up.x, (ctx.waterAt(up.x, up.z) ?? wy) + 0.05, up.z);
  const shine = glints(s.bag, [swordAt], '#e8f2ff', 0.6);
  const rip = ripples(s.bag, s.group, 4);
  let carving = true;
  s.frame((_dt, t) => {
    boat.position.y = wy - 0.12 + (s.still ? 0 : Math.sin(t * 1.2) * 0.03);
    man.root.position.y = boat.position.y + 0.32;
    if (carving && !s.still) man.armR.rotation.x = -0.9 + Math.sin(t * 9) * 0.25;
  });
  // where to stand on the bank
  let bank = { x: r0.x, z: bz + 2 };
  for (let d = 1; d < 9; d += 0.5) if (ctx.waterAt(r0.x, bz + d) === null && ctx.isWalkable(r0.x, bz + d)) { bank = { x: r0.x, z: bz + d + 0.4 }; break; }
  let upBank = { x: up.x, z: up.z + 3 };
  for (let d = 1; d < 9; d += 0.5) if (ctx.waterAt(up.x, up.z + d) === null && ctx.isWalkable(up.x, up.z + d)) { upBank = { x: up.x, z: up.z + d + 0.4 }; break; }
  const m = mark(s, man);
  const name = C('楚人', 'Man of Chu');
  const bankPos = new THREE.Vector3(bank.x, s.y(bank.x, bank.z), bank.z);
  const swordMesh = mesh(ctx, [
    part(THREE, new THREE.BoxGeometry(0.035, 0.75, 0.01), '#d8dde2', { p: [0, 0.38, 0] }),
    part(THREE, new THREE.BoxGeometry(0.16, 0.03, 0.04), '#b08a3a', { p: [0, 0, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.015, 0.015, 0.16, 5), '#6b3a2a', { p: [0, -0.09, 0] }),
  ], 0.004);
  swordMesh.visible = false;
  s.bag.add(swordMesh, s.group);

  /** The sword rises out of the water and flies to the man in the boat. */
  const swordHome = async () => {
    shine.hide(0);
    rip.spawn(swordAt.x, swordAt.y, swordAt.z, 1.2, 0.6);
    snd.splash(0.6);
    swordMesh.visible = true;
    const from = swordAt.clone(), to = new THREE.Vector3();
    let t = 0;
    await new Promise<void>((res) => {
      const off = ctx.onFrame((dt) => {
        t += dt / 2.2;
        const k = Math.min(1, t);
        man.armR.getWorldPosition(to);
        swordMesh.position.lerpVectors(from, to, k);
        swordMesh.position.y += Math.sin(k * Math.PI) * 2.2;
        swordMesh.rotation.z = k * Math.PI * 4;
        if (k >= 1) { off(); res(); }
      });
      s.bag.onDispose(() => { off(); res(); });
    });
    swordMesh.visible = false;
    burst(s.bag, to, '#e8f2ff', 14, { speed: 0.8 });
  };

  s.prompt({
    id: 'qiyu-kezhou', position: bankPos, radius: 2.8,
    labelZh: '船上刻记号的人', labelEn: 'A man carving his boat', actionZh: '问他', actionEn: 'Ask him',
    async act() {
      if (s.finished) { await s.say(man, name, [L('舟已行矣，而剑不行……惭愧，惭愧。', 'The boat moved on; the sword did not… how foolish of me.')]); return; }
      if (!s.claim()) return;
      m.set(false);
      try {
        carving = false;
        faceMe(s, man);
        const who = s.who;
        await s.say(man, name, [
          L('我的剑方才从这儿掉下水去了。', 'My sword fell into the water — right here.'),
          L('我在船舷上刻了个记号：是从这里掉下去的。等船停了，我从记号处下水去捞，准没错！', 'So I carved a mark on the side: this is where it fell. When the boat stops, I’ll dive in right at the mark. Can’t miss!'),
        ]);
        if (who === 'swordsman' || who === 'fisher') {
          await s.say(null, who === 'swordsman' ? C('侠客', 'Swordsman') : C('渔翁', 'Old Fisherman'), [who === 'swordsman'
            ? L('剑落在水里，要记的是水，不是船。你的剑在上游——我去取。', 'When a sword falls in the water, you mark the water, not the boat. Yours is upstream. I’ll fetch it.')
            : L('船走了，剑可没走。老汉在上游看见水底亮了一下——我去捞。', 'The boat moved; the sword didn’t. I saw something flash on the bottom upstream — I’ll net it.')]);
          ctx.hud.toast('去上游，那点亮光的地方', 'Go upstream, to the glint in the water', 3000);
          const off = s.prompt({
            id: 'qiyu-kezhou-sword', position: new THREE.Vector3(upBank.x, s.y(upBank.x, upBank.z), upBank.z), radius: 2.4,
            labelZh: '水底的亮光', labelEn: 'A glint under the water', actionZh: who === 'swordsman' ? '取剑' : '撒网', actionEn: who === 'swordsman' ? 'Fetch it' : 'Cast',
            async act() {
              off();
              if (!s.claim()) return;
              try {
                ctx.player.emote(who === 'swordsman' ? 'skill' : 'cast');
                await s.wait(700);
                await swordHome();
                s.words('剑来！', new THREE.Vector3(man.root.position.x, man.root.position.y + 2, man.root.position.z), { color: '#3d5a73', size: 0.4, life: 2.6 });
                await s.say(man, name, [L('我的剑！原来它一直在那儿等我……刻在船上的记号，倒是一点用也没有。', 'My sword! It was waiting back there all along… and my mark on the boat was no use at all.')]);
                s.finish(who === 'swordsman'
                  ? { zh: '侠客从上游的水底取回了剑，隔空一送，剑便飞回了楚人手里。', en: 'The swordsman fetched the sword from the riverbed upstream and sent it flying back into the man’s hands.', bonus: 60, seal: '剑' }
                  : { zh: '渔翁在上游一网下去，捞起了那把剑，还有一尾鲤鱼。', en: 'One cast upstream and the fisherman netted the sword — and a carp besides.', bonus: 60, seal: '渔' });
              } finally {
                s.unclaim();
              }
            },
          });
          return;
        }
        if (who === 'scholar') {
          await s.say(null, C('书生', 'Scholar'), [L('《吕氏春秋》有云：「舟已行矣，而剑不行，求剑若此，不亦惑乎？」', 'The Annals of Lü Buwei say: “The boat has moved on, but the sword has not. To look for a sword this way — is that not folly?”')]);
          await s.say(man, name, [L('……原来我已经被写进书里了？', '…You mean I’m already in a book?')]);
          s.finish({ zh: '书生引了一段《吕氏春秋》，楚人才知道自己早已成了典故，羞得满脸通红。', en: 'The scholar quoted the Annals of Lü Buwei; the man learned he had long since become a proverb, and blushed to the ears.', bonus: 40, seal: '书' });
          return;
        }
        const k = await s.say(man, name, [L('你说，我这法子妙不妙？', 'Clever, isn’t it?', [C('妙！', 'Very clever!'), C('船走了，剑可没走', 'The boat moved; the sword didn’t')])]);
        if (k < 0) return;
        if (k === 0) {
          snd.splash(0.8);
          rip.spawn(boat.position.x, wy, boat.position.z, 1.5, 0.6);
          await s.say(man, name, [L('（扑通一声跳下水，半晌才冒出头来）……怪了，记号明明在这儿，剑呢？', '(Splash — he dives in, and comes up a while later) …Strange. The mark is right here. Where’s the sword?')]);
        }
        await s.say(man, name, [L('……船走了，剑没走。哎呀，我怎么没想到！', '…The boat moved, the sword didn’t. Oh, why didn’t I think of that!')]);
        await swordHome();
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  });
  return { x: bank.x, z: bank.z, r: 22 };
}

// ───────────────────────────── 醉仙

export function zuixian(s: Stage): Scene {
  const { ctx, THREE } = s;
  const th = ANCHORS.teahouse;
  const at = s.spot(th.x - 3, th.z - 3, 5);
  const face = { x: ANCHORS.villageSquare.x, z: ANCHORS.villageSquare.z };
  const f = s.person(WEAR.immortal, at, face);
  const tableAt = new THREE.Vector3(at.x + Math.sin(f.root.rotation.y) * 0.75, at.y, at.z + Math.cos(f.root.rotation.y) * 0.75);
  const cups = [cup(ctx), cup(ctx)];
  cups[0].translate(-0.12, 0.475, 0.08);
  cups[1].translate(0.05, 0.475, -0.1);
  const table = mesh(ctx, [
    part(THREE, new THREE.BoxGeometry(0.7, 0.05, 0.5), '#8a5a33', { p: [0, 0.45, 0] }),
    ...[[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]].map(([x, z]) => part(THREE, new THREE.BoxGeometry(0.05, 0.45, 0.05), '#6b4a33', { p: [x, 0.22, z] })),
    ...cups,
  ], 0.01);
  table.position.copy(tableAt);
  table.rotation.y = f.root.rotation.y;
  s.bag.add(table, s.group);
  s.bag.onDispose(ctx.addCollider({ x: tableAt.x, z: tableAt.z, r: 0.45, h: 0.6 }));
  const jug = gourd(ctx);
  jug.position.set(tableAt.x + 0.18, tableAt.y + 0.475, tableAt.z);
  s.bag.add(jug, s.group);
  // a warm lamplit pool round the table
  s.pool(tableAt, '#ffb86b', 3.2, 0.45);
  s.glow(new THREE.Vector3(tableAt.x, tableAt.y + 1.6, tableAt.z), '#ffb86b', 2.2, 0.5);
  // a tipsy sway
  s.frame((_dt, t) => { if (!s.still) f.root.rotation.z = Math.sin(t * 1.1) * 0.06; });
  const m = mark(s, f);
  s.theme = 'hall'; // a playful zheng and clappers: the teahouse gets merry
  const name = C('醉仙', 'Drunken Immortal');
  const drink = async (n: number) => {
    ctx.player.emote('eat');
    snd.pour();
    s.words(['一杯', '二杯', '三杯'][n], new THREE.Vector3(tableAt.x, tableAt.y + 1.4, tableAt.z), { color: '#c0412f', size: 0.36, life: 2 });
    await s.wait(1100);
  };
  const farewell = async (line: string) => {
    s.words(line, new THREE.Vector3(at.x, at.y + 2.6, at.z), { color: '#1d1916', vertical: true, life: 6, size: 0.38 });
    await s.wait(1600);
    await vanish(s, f.root, '#efe3c6', 900);
  };
  s.whenDone(talkPrompt(s, f, {
    labelZh: '喝的不是茶的客人', labelEn: 'A guest who is not drinking tea', actionZh: '同饮', actionEn: 'Join him',
    async act() {
      if (s.finished || !s.claim()) return;
      m.set(false);
      try {
        const who = s.who;
        faceMe(s, f);
        if (who === 'guan') {
          await s.say(f, name, [L('将军请！这一杯热酒，敬你！', 'General! A cup of hot wine — to you!')]);
          await s.say(null, C('关公', 'Lord Guan'), [L('酒且斟下，某去便来。', 'Pour it and set it down. I shall be back directly.')]);
          ctx.hud.toast('关公出门去了——走远些，趁酒还温，再回来', 'Lord Guan steps out — go a little way off, and come back while the wine is warm', 4200);
          const start = s.player().clone();
          let left = false, back = false, time = 0;
          await new Promise<void>((res) => {
            const off = ctx.onFrame((dt) => {
              time += dt;
              const d = s.dist(at.x, at.z);
              if (!left && Math.hypot(s.player().x - start.x, s.player().z - start.z) > 12) left = true;
              if (left && d < 3) { back = true; off(); res(); }
              if (time > 90) { off(); res(); }
            });
            s.bag.onDispose(() => { off(); res(); });
          });
          if (!s.alive) return;
          faceMe(s, f);
          await s.say(f, name, [back && time < 45
            ? L('将军去了片刻，回来时杯中其酒尚温——当年温酒斩华雄，也不过如此！', 'Gone a moment and back while the wine is still warm — just as on the day you cut down Hua Xiong before your cup could cool!')
            : L('回来啦？酒凉了——无妨，再温一壶！', 'Back? The wine has gone cold — no matter, I’ll warm another!')]);
          await drink(0);
          await farewell('温酒');
          s.finish({ zh: '关公说「酒且斟下，某去便来」，出门走了一遭，回来时，酒尚温。', en: 'Lord Guan said, “Pour it, I shall be back directly” — went out, came back, and the wine was still warm.', bonus: 60, seal: '酒' });
          return;
        }
        if (who === 'poet') {
          await s.say(f, name, [L('咦？你身上也有酒气，也有仙气——莫非你也是谪仙人？', 'Hm? You smell of wine — and of heaven. Are you an immortal banished to earth too?')]);
          await s.say(null, C('诗仙', 'Poet'), [L('天子呼来不上船，自称臣是酒中仙。', 'When the emperor called, I would not board his boat — “Your servant is an immortal of wine,” I said.')]);
          await drink(0);
          const k = await s.say(f, name, [L('好！我出上句，你对下句：「人生得意须尽欢」——', 'Good! I give the first line, you give the next: “When life goes your way, enjoy it to the full”—', [C('莫使金樽空对月', '“Never let a golden cup face the moon empty”'), C('千金散尽还复来', '“Scatter a thousand gold, it all comes back”')])]);
          if (k < 0) return;
          await drink(1);
          await s.say(f, name, [k === 0 ? L('对得好！干！', 'Well matched! Drink!') : L('哈哈，跳了一句，也好！干！', 'Ha — you skipped a line, but why not! Drink!')]);
          await drink(2);
          await farewell('斗酒诗百篇');
          s.finish({ zh: '两位谪仙对饮三杯，醉仙把那只喝不空的葫芦留给了诗仙。', en: 'Two banished immortals shared three cups; the elder left the Poet his gourd — the one that never runs dry.', bonus: 70, seal: '酒' });
          return;
        }
        if (who === 'musician') {
          await s.say(f, name, [L('有酒无乐，不成宴席。姑娘，弹一曲？', 'Wine without music is no feast. Will you play, young lady?')]);
          ctx.player.emote('play');
          s.qin([0, 2, 4, 2, 5, 4, 2, 0, 7, 9, 7, 4], 260, 0.7);
          sway(s, f.root, 5, 0.14, 5);
          s.words('醉里且贪欢笑', new THREE.Vector3(at.x, at.y + 2.3, at.z), { color: '#b83a4b', vertical: true, life: 5 });
          await s.wait(3400);
          await s.say(f, name, [L('哈哈哈！醉里且贪欢笑，要愁那得工夫！', 'Ha ha ha! Drunk, I laugh and laugh — who has time for sorrow!')]);
          await drink(0);
          await farewell('知音');
          s.finish({ zh: '琴师弹了一曲，醉仙随着琴声手舞足蹈，舞罢，化作一阵清风去了。', en: 'The qin player played, the immortal danced to it, and when the dance was done he turned into a breeze and was gone.', bonus: 60, seal: '乐' });
          return;
        }
        await s.say(f, name, [L('来来来，陪我喝三杯！', 'Come, come — three cups with me!')]);
        await drink(0);
        await s.say(f, name, [L('一杯，敬明月。', 'One — to the bright moon.')]);
        await drink(1);
        await s.say(f, name, [L('二杯，敬清风。', 'Two — to the clear breeze.')]);
        await drink(2);
        await s.say(f, name, [L('三杯，敬你我——三杯通大道，一斗合自然！', 'Three — to you and me. Three cups and you reach the Way; a whole jug and you are one with nature!')]);
        await farewell('但得酒中趣');
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  }));
  return { x: at.x, z: at.z, r: 14 };
}
