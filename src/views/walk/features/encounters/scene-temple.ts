// 山寺: 寒山拾得 — two monks before the temple, one with a broom, one with a scroll, always laughing.
import type * as T from 'three';
import { ANCHORS } from '../../map';
import { part } from '../geo';
import { burst } from '../props';
import * as snd from '../minigames/sound';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, faceMe, flatSpot, inHand, mark, sway, talkPrompt } from './scene-kit';
import { broom, mesh, scroll } from './models';

export function hanshan(s: Stage): Scene {
  const { ctx, THREE } = s;
  // on the paving before the gate, a little off the way up (寺前扫叶): out along the temple axis
  const g = ANCHORS.templeGate, hall = ANCHORS.templeHall;
  const ax = hall.x - g.x, az = hall.z - g.z, al = Math.hypot(ax, az) || 1;
  const ux = ax / al, uz = az / al;
  const at = flatSpot(s, g.x - ux * 4.5 + uz * 3.6, g.z - uz * 4.5 - ux * 3.6, 7);
  const at2 = flatSpot(s, at.x - uz * 1.8, at.z + ux * 1.8, 2.5, 0.8);
  const shide = s.person(WEAR.monkBroom, at, at2);
  const hanshanF = s.person(WEAR.monkScroll, at2, at);
  const br = broom(ctx);
  br.rotation.set(0.5, 0, 0);
  inHand(shide, br, 0, -0.1, 0.1);
  shide.armR.userData.posed = true;
  const sc = scroll(ctx);
  inHand(hanshanF, sc, 0, -0.02, 0.1);
  // a heap of fallen leaves, and a few still scattered (one merged mesh)
  const leaves: T.BufferGeometry[] = [];
  const cols = ['#d9892e', '#c0412f', '#e2b04a', '#a8703a', '#b8553a'];
  for (let i = 0; i < 70; i++) {
    const heap = i < 46;
    const a = s.rng() * Math.PI * 2, d = heap ? Math.sqrt(s.rng()) * 0.7 : 1 + s.rng() * 3;
    const x = at.x + 0.9 + Math.cos(a) * d, z = at.z - 0.9 + Math.sin(a) * d;
    const y = s.y(x, z) + (heap ? (0.7 - d) * 0.4 * s.rng() + 0.02 : 0.02);
    leaves.push(part(THREE, new THREE.CircleGeometry(0.07, 5), cols[i % cols.length], { p: [x, y, z], r: [-Math.PI / 2 + (s.rng() - 0.5) * 0.8, 0, s.rng() * 6], s: [1, 1.6, 1] }));
  }
  const heap = mesh(ctx, leaves, 0);
  s.bag.add(heap, s.group);
  const heapAt = new THREE.Vector3(at.x + 0.9, at.y + 0.2, at.z - 0.9);
  let laughAt = 2;
  s.frame((dt, t) => {
    if (!s.still) shide.armR.rotation.x = -0.4 + Math.sin(t * 2.4) * 0.35;
    laughAt -= dt;
    if (laughAt < 0) {
      laughAt = 5 + s.rng() * 4;
      if (s.dist(at.x, at.z) < 22) {
        const who = s.rng() < 0.5 ? shide : hanshanF;
        s.words(s.rng() < 0.5 ? '哈哈' : '呵呵', new THREE.Vector3(who.root.position.x, who.root.position.y + 1.9, who.root.position.z), { color: '#a8703a', size: 0.28, life: 2 });
      }
    }
  });
  const m = mark(s, hanshanF);
  const H = C('寒山', 'Hanshan'), S = C('拾得', 'Shide');
  const laugh = () => {
    sway(s, shide.root, 2.2, 0.06, 9);
    sway(s, hanshanF.root, 2.2, 0.06, 8);
    s.words('哈哈哈', new THREE.Vector3(at.x + 0.9, at.y + 2.1, at.z + 0.3), { color: '#a8703a', size: 0.36, life: 2.4 });
  };
  talkPrompt(s, hanshanF, {
    labelZh: '扫叶的两位僧人', labelEn: 'Two monks sweeping leaves', actionZh: '请教', actionEn: 'Ask',
    async act() {
      if (s.finished) { laugh(); return; }
      if (!s.claim()) return;
      m.set(false);
      try {
        const who = s.who;
        faceMe(s, hanshanF);
        faceMe(s, shide);
        laugh();
        if (who === 'cat') {
          await s.say(hanshanF, H, [L('哟，扫了一上午的叶子，来了一位检查的。', 'Oh — a whole morning of sweeping, and here comes the inspector.')]);
          ctx.player.emote('jump');
          await s.wait(500);
          burst(s.bag, heapAt, '#d9892e', 30, { speed: 2, size: 0.05, life: 2 });
          burst(s.bag, heapAt, '#c0412f', 20, { speed: 1.8, size: 0.05, life: 2 });
          heap.visible = false;
          laugh();
          await s.say(shide, S, [L('哈哈哈！好！扫也是空，不扫也是空——猫儿一扑，便都空了。', 'Ha ha ha! Good! Swept, it’s empty; unswept, it’s empty — one pounce from the cat and it’s all empty.')]);
          await s.say(hanshanF, H, [L('再扫一遍便是。扫叶么，本来就扫不完。', 'We’ll sweep again. Leaves are never swept for good anyway.')]);
          s.finish({ zh: '大橘一头扎进落叶堆里，叶子飞了满天。两位僧人笑得更响了。', en: 'Big Ginger dived into the heap of leaves and they flew everywhere. The two monks laughed louder still.', bonus: 50, seal: '笑' });
          return;
        }
        if (who === 'guan') {
          await s.say(shide, S, [L('咦——这不是伽蓝菩萨么？', 'Why — isn’t this the temple’s guardian, the Sangharama Bodhisattva?')]);
          ctx.player.emote('bow');
          await s.say(hanshanF, H, [L('哈哈，菩萨也来扫落叶？', 'Ha ha — has the Bodhisattva come to sweep leaves too?')]);
          ctx.player.emote('skill');
          await s.wait(700);
          burst(s.bag, heapAt, '#d9892e', 36, { speed: 2.4, size: 0.05, life: 2 });
          heap.visible = false;
          laugh();
          await s.say(shide, S, [L('以刀代帚，一扫而空！妙，妙！', 'A blade for a broom — swept clean in one stroke! Wonderful!')]);
          s.finish({ zh: '关公是寺里供奉的伽蓝菩萨。他以青龙偃月刀代帚，一扫而空；寒山拾得拍手大笑。', en: 'Lord Guan is the temple’s own guardian. He swept the leaves with his Green Dragon blade in one stroke; Hanshan and Shide clapped and roared with laughter.', bonus: 60, seal: '笑' });
          return;
        }
        if (who === 'taoist') {
          await s.say(hanshanF, H, [L('一个小道士，两个老和尚——', 'One little Taoist, two old monks—')]);
          await s.say(shide, S, [L('和尚笑道士，道士笑和尚，谁也不知道谁在笑什么。', 'The monks laugh at the Taoist, the Taoist laughs at the monks, and none of us knows what anyone is laughing at.')]);
          await s.say(null, C('道童', 'Taoist Child'), [L('那就一起笑。', 'Then let’s all laugh together.')]);
          ctx.player.emote('dance');
          laugh();
          s.finish({ zh: '一个道童，两个和尚，在山门前笑成一团。儒释道本是一家，笑也是。', en: 'One Taoist child and two monks, laughing in a heap before the temple gate. The three teachings are one family — and so is laughter.', bonus: 50, seal: '笑' });
          return;
        }
        const k = await s.say(hanshanF, H, [L('施主，扫叶么？还是来问话的？', 'Come to sweep leaves, friend? Or to ask something?', [C('若有人谤我、笑我、欺我，如何处之？', 'If someone slanders me, mocks me, cheats me — what should I do?'), C('你们为何总是在笑？', 'Why are you always laughing?')])]);
        if (k < 0) return;
        if (k === 0) {
          await s.say(hanshanF, H, [L('这话我当年也问过他——', 'I asked him the very same, long ago—')]);
          await s.say(shide, S, [L('只是忍他、让他、由他、避他、耐他、敬他、不要理他——再待几年，你且看他。', 'Just bear it, yield to it, let it be, avoid it, endure it, respect it, pay it no mind — and in a few years, see what becomes of it.')]);
        } else {
          await s.say(shide, S, [L('叶子落了，笑；扫干净了，笑；风一吹又落了，还是笑。', 'Leaves fall — we laugh. Swept clean — we laugh. The wind blows and they fall again — we laugh still.')]);
        }
        laugh();
        snd.ding(2);
        await s.say(hanshanF, H, [L('来，扫一扫。', 'Here — sweep a little.')]);
        ctx.player.emote('water');
        await s.wait(900);
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  });
  return { x: at.x, z: at.z, r: 14 };
}
