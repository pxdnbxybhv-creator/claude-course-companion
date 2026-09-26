// 荷塘: 捞月 (a second moon in the lake, and three monkeys in a chain reaching for it) and 月下老人
// (an old man on the moon bridge sorting red threads by moonlight).
import type * as T from 'three';
import { ANCHORS, RIVER, RIVER_LAKE_BREAK } from '../../map';
import { allDecks } from '../../regions/water-decks';
import { canvasTexture } from '../kit';
import { part } from '../geo';
import { burst } from '../props';
import { ripples } from '../minigames/fx';
import * as snd from '../minigames/sound';
import * as sfx from '../sfx';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, faceMe, handOf, mark, raiseArm, talkPrompt } from './scene-kit';
import { COL, mesh, monkey } from './models';

/** A pale disc of moonlight lying on the water (the reflection). */
function moonOnWater(s: Stage, r: number): T.Mesh {
  const { THREE } = s;
  const tex = canvasTexture(THREE, 128, 128, (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,250,232,1)');
    grad.addColorStop(0.42, 'rgba(255,244,214,0.95)');
    grad.addColorStop(0.5, 'rgba(255,236,190,0.45)');
    grad.addColorStop(1, 'rgba(255,226,170,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

// ───────────────────────────── 捞月

/**
 * The (frozen) walker hops to (x, y, z) in an arc `peak` m high over `dur` s, facing where it goes
 * (or `face` on landing). Resolves on landing, or at once when the scene goes.
 */
function hop(s: Stage, x: number, y: number, z: number, dur: number, peak: number, face?: number): Promise<void> {
  const { ctx } = s;
  const p = ctx.player.position;
  const x0 = p.x, y0 = p.y, z0 = p.z;
  const heading = Math.atan2(x - x0, z - z0);
  const T0 = s.still ? 0.35 : dur;
  return new Promise((res) => {
    let t = 0, done = false;
    const end = () => { if (done) return; done = true; off(); res(); };
    const off = ctx.onFrame((dt) => {
      if (done) return;
      t += dt;
      const k = Math.min(1, t / T0);
      const arc = s.still ? 0 : 4 * peak * k * (1 - k);
      ctx.player.teleport(x0 + (x - x0) * k, z0 + (z - z0) * k, k < 1 ? heading : face ?? heading, y0 + (y - y0) * k + arc);
      if (k >= 1) end();
    });
    s.bag.onDispose(end);
  });
}

export function laoyue(s: Stage): Scene {
  const { ctx, THREE } = s;
  // the dock's far end, and a spot of open water beyond it
  const dock = allDecks().find((d) => d.id === 'lake-dock');
  const dx = dock ? dock.ax : 0.6, dz = dock ? dock.az : -0.8;
  const endX = dock ? dock.cx + dock.ax * dock.hl : ANCHORS.dock.x + 3, endZ = dock ? dock.cz + dock.az * dock.hl : ANCHORS.dock.z - 3;
  const mx = endX + dx * 3.4, mz = endZ + dz * 3.4;
  const wy = ctx.waterAt(mx, mz) ?? ctx.waterAt(endX + dx * 2, endZ + dz * 2) ?? -0.35;
  const moon = moonOnWater(s, 0.9);
  moon.position.set(mx, wy + 0.03, mz);
  s.bag.add(moon, s.group);
  s.glow(new THREE.Vector3(mx, wy + 0.2, mz), '#fff1c8', 3.2, 0.35);
  // no moon tonight (a new moon)? then the sky keeps one for this — the water has one, after all —
  // and hands it back when the scene goes (null: the sky's own reckoning again)
  if (Math.abs(ctx.env.moonPhase - 0.5) > 0.44) {
    ctx.sky.setMoon({ visible: true });
    s.bag.onDispose(() => ctx.sky.setMoon({ visible: null }));
  }
  const rip = ripples(s.bag, s.group, 6);
  // a willow leaning out from the bank beside the dock, and three monkeys hanging from it in a chain
  const side = { x: -dz, z: dx };
  let bank = { x: endX + side.x * 6, z: endZ + side.z * 6 };
  for (let d = 3; d < 12; d += 0.8) {
    const px = mx + side.x * d, pz = mz + side.z * d;
    if (ctx.waterAt(px, pz) === null && ctx.isWalkable(px, pz)) { bank = { x: px, z: pz }; break; }
  }
  const by = s.y(bank.x, bank.z);
  const top = new THREE.Vector3(mx + side.x * 0.5, wy + 3.1, mz + side.z * 0.5);
  const base = new THREE.Vector3(bank.x, by, bank.z);
  const trunkLen = base.distanceTo(top);
  const trunkGeo = part(THREE, new THREE.CylinderGeometry(0.1, 0.22, trunkLen, 7), COL.bark, { p: [0, trunkLen / 2, 0] });
  const trunk = mesh(ctx, [trunkGeo, part(THREE, new THREE.IcosahedronGeometry(0.9, 1), '#7ea35a', { p: [0, trunkLen + 0.2, 0], s: [1.4, 0.6, 1.1] })], 0.016);
  trunk.position.copy(base);
  trunk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize());
  s.bag.add(trunk, s.group);
  s.bag.onDispose(ctx.addCollider({ x: base.x, z: base.z, r: 0.3, h: 2 }));
  const chain = new THREE.Group();
  chain.position.copy(top);
  s.bag.add(chain, s.group);
  const monkeys: T.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const mk = monkey(ctx);
    mk.position.set(0, -i * 0.86, 0);
    mk.rotation.y = Math.atan2(-side.x, -side.z) + (i - 1) * 0.3;
    chain.add(mk);
    monkeys.push(mk);
  }
  let reach = 0;
  s.frame((_dt, t) => {
    chain.rotation.x = s.still ? 0 : Math.sin(t * 1.3) * 0.12 + reach * 0.18;
    chain.rotation.z = s.still ? 0 : Math.sin(t * 0.9 + 1) * 0.08;
    const k = 1 + Math.sin(t * 0.7) * 0.03;
    moon.scale.set(k, k, 1);
    if (!s.still && Math.sin(t * 0.37) > 0.995) rip.spawn(mx, wy, mz, 1.1, 0.3);
  });
  s.theme = 'night';
  const standX = endX - dx * 0.4, standZ = endZ - dz * 0.4;
  const standY = s.y(standX, standZ);
  const name = C('猴儿', 'Monkeys');
  /** The moon shatters into light, then gathers again. */
  const scoop = async () => {
    snd.splash(0.5);
    for (let i = 0; i < 3; i++) rip.spawn(mx + (i - 1) * 0.3, wy, mz, 1.4 + i * 0.4, 0.55);
    const mat = moon.material as T.MeshBasicMaterial;
    let t = 0;
    await new Promise<void>((res) => {
      const off = ctx.onFrame((dt) => {
        t += dt;
        mat.opacity = t < 0.3 ? 1 - t / 0.3 : Math.min(1, (t - 1.4) / 1.2);
        moon.scale.set(1 + Math.sin(t * 20) * 0.3 * Math.max(0, 1 - t / 2), 1 + Math.cos(t * 17) * 0.3 * Math.max(0, 1 - t / 2), 1);
        if (t > 2.6) { mat.opacity = 1; off(); res(); }
      });
      s.bag.onDispose(() => { off(); res(); });
    });
  };
  const holder = new THREE.Group();
  holder.position.set(mx, wy + 0.2, mz);
  s.bag.add(holder, s.group);
  const m = mark(s, { root: holder, height: 0.9 } as never);
  const pos = new THREE.Vector3(standX, standY, standZ);
  s.prompt({
    id: 'qiyu-laoyue', position: pos, radius: 2.4,
    labelZh: '水中月', labelEn: 'The moon in the water', actionZh: '捞月', actionEn: 'Scoop the moon',
    async act() {
      if (s.finished) { await scoop(); return; }
      if (!s.claim()) return;
      m.set(false);
      try {
        const who = s.who;
        ctx.player.teleport(standX, standZ, Math.atan2(mx - standX, mz - standZ));
        reach = 1;
        sfx.chirps(3, 0.4);
        await s.say(null, name, [L('吱吱！月亮掉进水里啦！快捞上来！', 'Eek eek! The moon fell in the water! Scoop it out, quick!')]);
        if (who === 'poet') {
          ctx.player.emote('eat');
          s.words('举杯邀明月', new THREE.Vector3(mx, wy + 2.6, mz), { color: '#3d5a73', vertical: true, life: 5 });
          await s.say(null, C('诗仙', 'Poet'), [
            L('举杯邀明月，对影成三人——', 'I raise my cup to invite the moon; with my shadow, we are three—'),
            L('咦，今夜是四个：天上一个，水里一个，我一个，影子一个。来，水里那个，我抱你上来！', 'Hm — tonight we are four: one in the sky, one in the water, me and my shadow. Come here, you in the water — let me hold you!'),
          ]);
          ctx.player.emote('pet');
          await scoop();
          await s.say(null, name, [L('（三只猴儿一齐拽住了诗仙的衣袖：）先生，使不得！使不得！', '(All three monkeys grab the Poet’s sleeve:) Sir, don’t! Don’t!')]);
          s.finish({ zh: '诗仙醉中要去揽那水中月，被三只猴儿拽住了衣袖。他哈哈大笑，又饮了一杯。', en: 'The Poet, tipsy, leaned out to embrace the moon in the water — and three monkeys caught his sleeve. He laughed and drank another cup.', bonus: 60, seal: '月' });
          return;
        }
        if (who === 'change') {
          await s.say(null, C('嫦娥', "Chang'e"), [L('……从这里看，月亮原来这样小。', '…Seen from here, the moon is so small.')]);
          await s.say(null, name, [L('仙子，月亮上冷不冷？', 'Lady, is it cold on the moon?')]);
          s.words('碧海青天夜夜心', new THREE.Vector3(mx, wy + 2.8, mz), { color: '#3f6f8f', vertical: true, life: 6 });
          await s.say(null, C('嫦娥', "Chang'e"), [L('冷。可是桂花很香。……嫦娥应悔偷灵药，碧海青天夜夜心。', 'Cold. But the osmanthus smells sweet. …Perhaps she regrets the elixir: blue sea, clear sky, a heart alone every night.')]);
          await scoop();
          s.finish({ zh: '嫦娥望着水里的月亮，轻轻叹了口气。猴儿们不再捞了，陪她坐了一会儿。', en: 'Chang’e gazed at the moon in the lake and sighed softly. The monkeys stopped scooping and sat with her a while.', bonus: 60, seal: '月' });
          return;
        }
        if (who === 'rabbit') {
          await s.say(null, C('玉兔', 'Jade Rabbit'), [L('那是……我家！', 'That’s… my home!')]);
          // one hop from the end of the dock onto the moon on the water: the moonlight holds it up
          // (held in place while it stands there), then one hop back onto the boards
          ctx.player.emote('jump');
          ctx.player.freeze(true);
          onMoon = true;
          // it lands turned toward the willow: the camera behind it looks at the monkeys reaching down
          const toBank = Math.atan2(side.x, side.z);
          await hop(s, mx, wy + 0.02, mz, 0.8, 1.5, toBank);
          if (!s.alive) return;
          // standing on it (as on a boat's deck: feet down, not mid-leap)
          const perch = new THREE.Object3D();
          perch.position.set(mx, wy + 0.02, mz);
          perch.rotation.y = toBank;
          s.bag.add(perch, ctx.scene);
          ctx.player.ride(perch);
          const at = new THREE.Vector3(mx, wy + 0.1, mz);
          burst(s.bag, at, '#fff1c8', 24, { speed: 1.2, size: 0.035, life: 1.8 });
          for (let i = 0; i < 2; i++) rip.spawn(mx, wy, mz, 0.8 + i * 0.5, 0.35);
          sfx.chirps(4, 0.5);
          await s.say(null, name, [L('吱吱！兔子站在月亮上了！', 'Eek! The rabbit is standing on the moon!')]);
          await s.say(null, C('玉兔', 'Jade Rabbit'), [L('……不是这个月亮。天上那个，才是我家。', '…Not this moon. The one up there is home.')]);
          ctx.player.ride(null);
          ctx.player.emote('jump');
          await hop(s, standX, standY, standZ, 0.8, 1.3, Math.atan2(mx - standX, mz - standZ));
          ctx.player.freeze(false);
          onMoon = false;
          if (!s.alive) return;
          s.finish({ zh: '玉兔跳进了水中的月亮——月光托住了它，一步也没沉。', en: 'The Jade Rabbit jumped into the moon on the water — and the moonlight held it up; it did not sink a step.', bonus: 60, seal: '兔' });
          return;
        }
        if (who === 'fisher') {
          ctx.player.emote('cast');
          await s.wait(900);
          await scoop();
          burst(s.bag, new THREE.Vector3(mx, wy + 0.4, mz), '#fff1c8', 28, { speed: 1.6, size: 0.035, life: 2 });
          await s.say(null, C('渔翁', 'Old Fisherman'), [L('一网下去，捞起满网月光。——月亮么，还在水里。', 'One cast, and the net comes up full of moonlight. The moon? Still in the water.')]);
          s.finish({ zh: '渔翁一网捞起满网月光，抖一抖，落下几枚亮晶晶的铜钱。', en: 'The fisherman hauled up a net full of moonlight; he shook it, and out fell a few shining coins.', bonus: 70, seal: '渔' });
          return;
        }
        const k = await s.say(null, name, [L('快帮我们捞呀！', 'Help us scoop it out!', [C('帮它们捞', 'Help them scoop'), C('月亮在天上呢', 'The moon is up in the sky')])]);
        if (k < 0) return;
        if (k === 0) {
          ctx.player.emote('pet');
          await scoop();
          await s.say(null, name, [L('碎了！碎了！……咦，又圆了？', 'It broke! It broke! …Eh? It’s round again?')]);
        }
        ctx.player.emote('wave');
        reach = 0;
        await s.say(null, name, [L('（猴儿们顺着你的手抬头——）啊！月亮在天上呢！', '(The monkeys follow your finger up—) Oh! The moon is in the sky!')]);
        sfx.chirps(5, 0.5);
        s.finish();
      } finally {
        reach = 0;
        backOnDock();
        s.unclaim();
      }
    },
  });
  // however the scene ends, the rabbit is never left standing (or sinking) on the water
  let onMoon = false;
  const backOnDock = () => {
    if (!onMoon) return;
    onMoon = false;
    ctx.player.ride(null);
    ctx.player.teleport(standX, standZ, Math.atan2(mx - standX, mz - standZ));
    ctx.player.freeze(false);
  };
  s.bag.onDispose(backOnDock);
  return { x: standX, z: standZ, r: 14 };
}

// ───────────────────────────── 月下老人

export function yuelao(s: Stage): Scene {
  const { ctx, THREE } = s;
  // the moon bridge over the outlet (lake.ts builds it; its deck is on the list)
  const deck = allDecks().find((d) => d.id === 'lake-moon-bridge');
  const a = RIVER[RIVER_LAKE_BREAK], b = RIVER[RIVER_LAKE_BREAK + 1];
  const cx = deck ? deck.cx : a.x + (b.x - a.x) * 0.2, cz = deck ? deck.cz : a.z + (b.z - a.z) * 0.2;
  const ax = deck ? deck.ax : 1, az = deck ? deck.az : 0;
  // sit him to one side of the crown, facing along the bridge
  const px = cx + ax * 0.9 + -az * 0.55, pz = cz + az * 0.9 + ax * 0.55;
  const at = new THREE.Vector3(px, ctx.groundY(px, pz), pz);
  const f = s.person(WEAR.moonOld, at, { x: cx - ax * 3, z: cz - az * 3 }, s.group, false);
  // a cloth bag and a big book beside him
  const book = mesh(ctx, [
    part(THREE, new THREE.BoxGeometry(0.34, 0.08, 0.26), '#c0412f', { p: [0, 0.04, 0] }),
    part(THREE, new THREE.BoxGeometry(0.32, 0.07, 0.24), '#f1e6cf', { p: [0, 0.06, 0] }),
    part(THREE, new THREE.SphereGeometry(0.14, 8, 6), '#8a6440', { p: [-0.45, 0.12, 0.1], s: [1, 0.9, 0.8] }),
  ], 0.008);
  book.position.set(0.45, 0.02, 0.1);
  f.root.add(book);
  // red threads: a few loose strands from his hands that drift in the breeze
  const N = 6, SEG = 10;
  const tp = new Float32Array(N * SEG * 2 * 3);
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const threads = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ color: '#d8323a', transparent: true, opacity: 0.9 }));
  threads.frustumCulled = false;
  s.bag.add(threads, s.group);
  s.pool(at, '#ffb86b', 2.4, 0.3);
  s.glow(new THREE.Vector3(at.x, at.y + 0.9, at.z), '#ffcf8a', 1.4, 0.35);
  const hand = new THREE.Vector3();
  const tie = new THREE.Vector3();
  let tieTo: 'none' | 'player' | 'moon' = 'none';
  let tieK = 0;
  const moonDir = new THREE.Vector3(-0.4, 0.7, -0.6).normalize();
  s.frame((dt, t) => {
    f.armR.localToWorld(hand.copy(f.hand));
    tieK = Math.min(1, tieK + dt * 0.6);
    let o = 0;
    for (let i = 0; i < N; i++) {
      const long = i === 0 && tieTo !== 'none';
      if (long) {
        if (tieTo === 'player') handOf(s, tie); else tie.copy(hand).addScaledVector(moonDir, 60);
      }
      for (let k = 0; k < SEG; k++) {
        for (let e = k; e <= k + 1; e++) {
          const u = e / SEG;
          let x: number, y: number, z: number;
          if (long) {
            const uu = u * tieK;
            x = hand.x + (tie.x - hand.x) * uu; y = hand.y + (tie.y - hand.y) * uu - Math.sin(uu * Math.PI) * 0.4; z = hand.z + (tie.z - hand.z) * uu;
          } else {
            const w = s.still ? 0 : Math.sin(t * 1.4 + i * 1.7 + u * 3) * 0.12 * u;
            x = hand.x + Math.cos(i * 1.1) * 0.5 * u + w; y = hand.y - 0.45 * u * u; z = hand.z + Math.sin(i * 1.1) * 0.5 * u + w;
          }
          tp[o++] = x; tp[o++] = y; tp[o++] = z;
        }
      }
    }
    tgeo.attributes.position.needsUpdate = true;
  });
  const m = mark(s, f);
  s.theme = 'night';
  const name = C('月下老人', 'Old Man Under the Moon');
  talkPrompt(s, f, {
    labelZh: '理红线的老人', labelEn: 'An old man sorting red threads', actionZh: '请教', actionEn: 'Ask',
    async act() {
      if (s.finished) { await s.say(f, name, [L('千里姻缘一线牵，急什么。', 'A thread ties fates a thousand miles apart. What’s the hurry?')]); return; }
      if (!s.claim()) return;
      m.set(false);
      try {
        const who = s.who;
        faceMe(s, f);
        await s.say(f, name, [
          L('我在查天下的婚书。', 'I am checking the marriage records of all under heaven.'),
          L('这囊里的红绳，系在两人脚上，纵是仇家异域、天涯海角，也终会相逢。', 'The red cords in this bag, tied to two people’s ankles, bring them together at last — though their families be enemies, though they live at the ends of the earth.'),
        ]);
        if (who === 'change') {
          await s.say(null, C('嫦娥', "Chang'e"), [L('……老人家，您簿子上，可有一个叫后羿的人？', '…Old one, is there a man named Hou Yi in your book?')]);
          tieTo = 'moon'; tieK = 0;
          raiseArm(f, 0.9, 1.2);
          await s.say(f, name, [L('有。你们这一根，从来没断过——你看，一直通到月亮上去。', 'There is. Your thread has never broken — look, it runs all the way up to the moon.')]);
          s.words('夜夜心', new THREE.Vector3(at.x, at.y + 2.4, at.z), { color: '#d8323a', vertical: true, life: 5 });
          s.finish({ zh: '月下老人牵起一根红线，一直牵到月亮上去。「你们这一根，从来没断过。」', en: 'The old man lifted a red thread that ran all the way up to the moon. “Yours has never broken.”', bonus: 60, seal: '缘' });
          return;
        }
        if (who === 'rabbit') {
          ctx.player.emote('jump');
          sfx.rustle(0.5);
          await s.say(f, name, [L('哎哎哎——小兔子，别扯！别扯！这下好了，一团乱麻……', 'Hey, hey — little rabbit, don’t pull! Don’t! Now look, a tangle…'), L('哈哈，罢了。这一团，够我理到明年七夕了。', 'Ha, never mind. This knot will keep me busy till next Qixi.')]);
          s.finish({ zh: '玉兔扯乱了一团红线。月下老人不恼，笑着说：天下的姻缘，本来就是一团乱麻。', en: 'The Jade Rabbit tangled a whole skein of red thread. The old man only laughed: all the fates under heaven are a tangle anyway.', bonus: 50, seal: '缘' });
          return;
        }
        if (who === 'scholar') {
          await s.say(f, name, [
            L('你这书生，将来的妻子嘛……此刻才三岁，在集市上卖菜的陈婆怀里。', 'You, scholar — your future wife… is three years old right now, in the arms of old Mother Chen who sells vegetables at the market.'),
          ]);
          await s.say(null, C('书生', 'Scholar'), [L('……！', '…!')]);
          await s.say(f, name, [L('哈哈哈！莫慌莫慌，天机不可尽信——但红线是真的。', 'Ha ha ha! Don’t panic — not every secret of heaven is to be believed. But the thread is real.')]);
          tieTo = 'player'; tieK = 0;
          s.finish({ zh: '月下老人说书生的妻子才三岁，吓得书生差点掉下桥去。老人笑着给他系了一根红线。', en: 'The old man said the scholar’s wife was only three years old — the scholar nearly fell off the bridge. Laughing, the old man tied a red thread on him.', bonus: 50, seal: '缘' });
          return;
        }
        const k = await s.say(f, name, [L('你也想问问自己的？', 'You want to ask about your own?', [C('给我也系一根', 'Tie one for me too'), C('天机不可泄露', 'Some things are not to be known')])]);
        if (k === 0) {
          tieTo = 'player'; tieK = 0;
          await s.say(f, name, [L('系好了。至于那头系在谁身上——你走路时，回头看看。', 'There. As for who is at the other end — look back now and then, as you walk.')]);
        } else if (k === 1) {
          await s.say(f, name, [L('说得好。知道了，就不好玩了。', 'Well said. Knowing would spoil it.')]);
        } else return;
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  });
  return { x: at.x, z: at.z, r: 12 };
}
