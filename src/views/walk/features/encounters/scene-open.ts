// Anywhere in the painting: 流星 (a star streaks across the night sky — quick, make a wish), 牧童遥指
// (a child on an ox playing the flute in the drizzle, who points the way), and in the garden
// 庄周梦蝶 (a golden butterfly, an afternoon doze, and a dream in which you are not sure who dreams).
import type * as T from 'three';
import { PATHS, REGION } from '../../map';
import { canvasTexture } from '../kit';
import { butterflyGeometry, instanceAttrs, wingMaterial } from '../geo';
import { burst } from '../props';
import { walkableNear } from '../minigames/cat';
import { busy } from '../minigames/ui';
import * as sfx from '../sfx';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, mark, raiseArm, talkPrompt } from './scene-kit';
import { flute, ox } from './models';

// ───────────────────────────── 流星

export function liuxing(s: Stage): Scene {
  const { ctx, THREE } = s;
  const cam = ctx.camera;
  // the streak: a sprite with a bright head and a long fading tail, turned along its path on screen
  const tex = canvasTexture(THREE, 256, 16, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,240,200,0)');
    grad.addColorStop(0.75, 'rgba(255,240,205,0.55)');
    grad.addColorStop(0.97, 'rgba(255,255,245,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, h / 2); g.lineTo(w * 0.97, h * 0.1); g.lineTo(w, h / 2); g.lineTo(w * 0.97, h * 0.9); g.closePath();
    g.fill();
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
  const star = new THREE.Sprite(mat);
  star.renderOrder = -8;
  star.visible = false;
  s.bag.add(star, ctx.scene);
  let wait = 5 + s.rng() * 12;
  let fly: { from: T.Vector3; to: T.Vector3; k: number } | null = null;
  let wished = false;
  s.theme = 'night';
  let btn: HTMLButtonElement | null = null;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), fwd = new THREE.Vector3();
  s.frame((dt) => {
    if (!fly) {
      if (s.finished) return;
      wait -= dt;
      if (wait > 0) return;
      // not while the walker is talking to someone or reading a card: a little later
      if (ctx.player.isFrozen || document.querySelector('.walk-say-wrap, .walk-card-wrap')) { wait = 1.5; return; }
      // across the part of the sky the walker can see (a phone held upright shows little of it): from
      // high in one corner of the view down toward the far hills, 200 m out, never below the horizon
      const side = s.rng() < 0.5 ? 1 : -1;
      const at = (nx: number, ny: number) => {
        fwd.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
        fwd.y = Math.max(fwd.y, 0.06);
        return fwd.clone().normalize().multiplyScalar(200).add(cam.position);
      };
      fly = { from: at(0.85 * side, 0.8), to: at(-0.35 * side, 0.48), k: 0 };
      star.visible = true;
      offerWish();
      return;
    }
    fly.k += dt / (s.still ? 3 : 1.7);
    const k = Math.min(1, fly.k);
    star.position.lerpVectors(fly.from, fly.to, k);
    // turn the sprite along the motion as seen on screen
    a.copy(fly.from).project(cam);
    b.copy(fly.to).project(cam);
    mat.rotation = Math.atan2((b.y - a.y), (b.x - a.x) * cam.aspect);
    star.scale.set(46, 2.1, 1);
    mat.opacity = Math.sin(k * Math.PI);
    if (k >= 1) { star.visible = false; }
  });
  function offerWish(): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'qy-wish';
    el.innerHTML = `${ctx.lang === 'zh' ? '愿' : '✦'}<small>${ctx.lang === 'zh' ? '许愿' : 'Wish'}</small>`;
    el.setAttribute('aria-label', s.tr('对流星许愿', 'Make a wish on the falling star'));
    const off = ctx.hud.mount(el);
    btn = el;
    // E / Enter wish — unless something else has the world (a talk, a game): then the key is theirs
    const key = (e: KeyboardEvent) => { if ((e.code === 'KeyE' || e.code === 'Enter') && btn && !busy(ctx)) { e.preventDefault(); e.stopPropagation(); void wish(); } };
    window.addEventListener('keydown', key, true);
    const remove = () => { window.removeEventListener('keydown', key, true); if (btn) { btn.classList.add('is-out'); const b2 = btn; setTimeout(() => { b2.remove(); off(); }, 500); btn = null; } };
    s.bag.onDispose(() => { window.removeEventListener('keydown', key, true); off(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); void wish(); });
    s.bag.later(7000, () => {
      if (wished) return;
      remove();
      ctx.hud.toast('流星一闪而过……下回可要快些许愿。', 'The star is gone in a blink… be quicker to wish next time.', 3200);
      fly = null;
      wait = 1e9;
      s.abandon(); // the director takes this one down; another may fall later tonight
    });
    const wish = async () => {
      if (wished) return;
      // busy with something else (a talk, fishing, building): the star is still there, the button stays
      if (!s.claim()) { ctx.hud.toast('手头的事还没完——流星可不等人。', 'You are in the middle of something — and the star won’t wait.', 2200); return; }
      wished = true;
      remove();
      try {
        const who = s.who;
        ctx.player.emote(who === 'rabbit' ? 'jump' : 'bow');
        if (who === 'rabbit') {
          ctx.player.impulse(0, 5.5, 0);
          await s.say(null, C('玉兔', 'Jade Rabbit'), [L('等等我——我也要跟它回天上去！……够不着。', 'Wait for me — I want to go back up with it! …Can’t reach.')]);
        } else if (who === 'poet') {
          s.words('手可摘星辰', new THREE.Vector3(s.player().x, s.player().y + 2.4, s.player().z), { color: '#f2d27a', vertical: true, life: 5 });
          await s.say(null, C('诗仙', 'Poet'), [L('危楼高百尺，手可摘星辰。——可惜今夜没登楼。', 'The tower is a hundred feet tall; you could pluck the stars by hand. — A pity I did not climb it tonight.')]);
        } else if (who === 'change') {
          await s.say(null, C('嫦娥', "Chang'e"), [L('……若能回去看看，就好了。', '…If only I could go back and see.')]);
        }
        const k = await s.say(null, C('流星', 'The Falling Star'), [L('（趁它还没落尽——）', '(Before it is gone—)', [
          C('愿花常好，月常圆，人长久', 'May flowers stay fair, the moon full, and people long together'),
          C('愿明天也是好天气', 'May tomorrow be fine weather too'),
          C('（不说出来）', '(Keep it to yourself)'),
        ])]);
        const said = k === 0 ? s.tr('花常好，月常圆，人长久', 'flowers fair, the moon full, people long together') : k === 1 ? s.tr('明天也是好天气', 'fine weather tomorrow') : '';
        s.finish({
          zh: who === 'change' ? '嫦娥对着流星许了一个愿，没有说是回月宫，还是留下来。' : who === 'rabbit' ? '玉兔跳得老高，还是没够着流星。它许的愿，大概和胡萝卜有关。' : said ? `你许的愿：${said}。` : '',
          en: who === 'change' ? 'Chang’e wished on the falling star — and did not say whether it was to go back to the moon, or to stay.' : who === 'rabbit' ? 'The Jade Rabbit jumped very high and still missed the star. Its wish probably involved carrots.' : said ? `Your wish: ${said}.` : '',
          bonus: 30, seal: '星',
        });
      } finally {
        s.unclaim();
      }
    };
  }
  const p = s.player();
  return { x: p.x, z: p.z, r: 1e6, roaming: true, linger: 8 };
}

// ───────────────────────────── 牧童遥指

/** A point on a path 14–26 m ahead of the walker (or just ahead on open ground). */
function roadAhead(s: Stage): { x: number; z: number; dx: number; dz: number } {
  const p = s.player(), h = s.ctx.player.heading;
  const fx = Math.sin(h), fz = Math.cos(h);
  let best: { x: number; z: number; dx: number; dz: number; score: number } | null = null;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 0; d < L; d += 2) {
        const x = a.x + (b.x - a.x) * (d / L), z = a.z + (b.z - a.z) * (d / L);
        const dist = Math.hypot(x - p.x, z - p.z);
        if (dist < 14 || dist > 26 || !s.ctx.isWalkable(x, z)) continue;
        const ahead = ((x - p.x) * fx + (z - p.z) * fz) / dist;
        if (ahead < 0.2) continue;
        const score = ahead - Math.abs(dist - 18) * 0.02;
        if (!best || score > best.score) best = { x, z, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L, score };
      }
    }
  }
  if (best) return best;
  const q = walkableNear(s.ctx, p.x + fx * 16, p.z + fz * 16, 8);
  return { x: q.x, z: q.z, dx: -fx, dz: -fz };
}

export function mutong(s: Stage): Scene {
  const { ctx, THREE } = s;
  const road = roadAhead(s);
  const beast = ox(ctx);
  beast.root.position.set(road.x, s.y(road.x, road.z), road.z);
  s.bag.add(beast.root, s.group);
  const boy = s.person(WEAR.herdBoy, new THREE.Vector3(0, 1.02, -0.05), { x: 0, z: 1 }, beast.root, false);
  boy.root.rotation.y = Math.PI / 2;
  const fl = flute(ctx);
  fl.position.set(0.14, -0.06, 0.16);
  fl.rotation.y = 0.5;
  boy.head.add(fl);
  raiseArm(boy, 0.8, 1.1);
  boy.armL.userData.posed = true;
  boy.armL.rotation.set(-1.0, 0, 0.5);
  s.drizzle();
  const m = mark(s, { root: beast.root, height: 2.1 } as never);
  let stopped = false, tune = 0;
  const TUNE = [7, 9, 11, 9, 7, 5, 7];
  s.frame((dt, t) => {
    const r = beast.root;
    const p = s.player();
    const d = Math.hypot(p.x - r.position.x, p.z - r.position.z);
    if (!stopped && d > 4.5) {
      const want = Math.atan2(p.x - r.position.x, p.z - r.position.z);
      let dd = want - r.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      r.rotation.y += dd * Math.min(1, dt * 0.8);
      const nx = r.position.x + Math.sin(r.rotation.y) * 0.55 * dt, nz = r.position.z + Math.cos(r.rotation.y) * 0.55 * dt;
      if (ctx.isWalkable(nx, nz)) { r.position.x = nx; r.position.z = nz; r.position.y = s.y(nx, nz); }
      if (!s.still) for (let i = 0; i < 4; i++) beast.legs[i].rotation.x = Math.sin(t * 3 + (i % 3 ? Math.PI : 0)) * 0.3;
      beast.head.rotation.x = Math.sin(t * 1.5) * 0.06;
    } else {
      stopped = d < 6 || stopped;
      for (let i = 0; i < 4; i++) beast.legs[i].rotation.x *= 0.9;
      beast.head.rotation.x = 0.25 + Math.sin(t * 0.7) * 0.05; // grazing
    }
    // the flute, now and then, when you are near
    tune -= dt;
    if (tune < 0 && d < 24 && !s.finished) { tune = 7; s.qin(TUNE, 300, 0.35); }
  });
  // 牧童 until he tells you his name (杏生, born when the apricots bloomed — but to the Poet he stays
  // the herd-boy of the poem)
  let name = C('牧童', 'Herd-Boy');
  const myName = async () => {
    await s.say(boy, name, [L('我叫杏生——生在杏花开的那天。到了杏花村，替我跟酒家的阿婆问声好！', 'I’m Xingsheng — born the day the apricots bloomed. When you get to the village, say hello to the old lady at the tavern for me!')]);
    name = C('杏生', 'Xingsheng');
  };
  talkPrompt(s, { root: beast.root } as never, {
    labelZh: '骑牛吹笛的孩子', labelEn: 'A child on an ox, playing the flute', actionZh: '借问', actionEn: 'Ask', d: 1.4,
    async act() {
      if (s.finished) { await s.say(boy, name, [L('杏花村，就在那边呀！', 'Apricot Blossom Village — right over there!')]); return; }
      if (!s.claim()) return;
      m.set(false);
      stopped = true;
      try {
        const who = s.who;
        { const pl = s.player(); beast.root.rotation.y = Math.atan2(pl.x - beast.root.position.x, pl.z - beast.root.position.z); }
        const vil = REGION.village.center;
        const r = beast.root.position;
        const dir = Math.atan2(vil.x - r.x, vil.z - r.z);
        const point = async () => {
          boy.armR.rotation.set(-1.4, 0, -0.4);
          const spot = new THREE.Vector3(r.x + Math.sin(dir) * 6, r.y + 2.6, r.z + Math.cos(dir) * 6);
          s.words('杏花村', spot, { color: '#b83a4b', size: 0.5, life: 5, rise: 0.4 });
          burst(s.bag, new THREE.Vector3(r.x + Math.sin(dir) * 2, r.y + 2.2, r.z + Math.cos(dir) * 2), '#f7d6d6', 24, { speed: 1.4, size: 0.035, life: 2.4 });
          await s.wait(900);
        };
        if (who === 'poet') {
          await s.say(null, C('诗仙', 'Poet'), [L('清明时节雨纷纷，路上行人欲断魂。借问酒家何处有？', 'Endless drizzle at Qingming; travellers on the road are near heartbroken. Where, may I ask, is there a tavern?')]);
          await point();
          await s.say(boy, name, [L('牧童遥指杏花村！', 'The herd-boy points far off — to Apricot Blossom Village!')]);
          s.words('牧童遥指杏花村', new THREE.Vector3(r.x, r.y + 3, r.z), { color: '#3d5a73', vertical: true, life: 6 });
          s.finish({ zh: '诗仙念了前三句，牧童接了第四句。一首诗，两个人，一起念完了。', en: 'The Poet spoke the first three lines and the herd-boy the fourth: one poem, finished by two.', bonus: 40, seal: '杏' });
          return;
        }
        if (who === 'fisher') {
          await s.say(boy, name, [L('老爷爷，下雨天，鱼儿好钓吗？', 'Grandpa, are fish easy to catch in the rain?')]);
          await s.say(null, C('渔翁', 'Old Fisherman'), [L('青箬笠，绿蓑衣，斜风细雨不须归。——雨天鱼儿浮上来，最好钓。', 'Green bamboo hat, green straw cape — in slanting wind and fine rain, no need to go home. The fish rise in the rain; it’s the best time.')]);
          await s.say(boy, name, [L('那我也不回家了！爷爷要是想喝酒，杏花村就在那边——', 'Then I won’t go home either! And if you want a drink, Grandpa, Apricot Blossom Village is that way—')]);
          await point();
          await myName();
          s.finish({ zh: '渔翁念了一首《渔歌子》，牧童说他也不回家了。', en: 'The fisherman recited “Song of the Fisherman,” and the herd-boy declared he wasn’t going home either.', bonus: 40, seal: '渔' });
          return;
        }
        if (who === 'gardener') {
          ctx.player.emote('pet');
          await s.say(null, C('园丁', 'Gardener'), [L('来，老牛，吃把嫩草。', 'Here, old ox — some fresh grass.')]);
          beast.head.rotation.x = 0.5;
          await s.wait(900);
          await s.say(boy, name, [L('它平时可不让生人碰呢！这枝杏花送你——插在园子里，明年就活了。', 'He never lets strangers touch him! Take this sprig of apricot blossom — plant it in your garden, and it’ll root by next year.')]);
          await point();
          await myName();
          s.finish({ zh: '园丁喂了老牛一把嫩草，牧童回赠一枝杏花。', en: 'The gardener fed the old ox a handful of grass; the herd-boy gave him a sprig of apricot blossom.', bonus: 40, seal: '杏' });
          return;
        }
        const k = await s.say(boy, name, [L('（笛声停了。）你要去哪儿呀？', '(The flute stops.) Where are you going?', [C('借问酒家何处有？', 'Where might I find a tavern?'), C('小哥，你去哪儿？', 'And where are you going?')])]);
        if (k < 0) return;
        if (k === 1) await s.say(boy, name, [L('放牛去呀！下雨天，牛儿爱吃带水的草。', 'Taking the ox to graze! In the rain he likes the wet grass.')]);
        await point();
        await s.say(boy, name, [L('喏——往那边走，过了桥，杏花开得最好的那家就是。', 'Look — go that way, over the bridge; the house with the finest apricot blossom, that’s the one.')]);
        await myName();
        s.finish();
      } finally {
        s.unclaim();
      }
    },
  });
  return { x: road.x, z: road.z, r: 30, roaming: true };
}

// ───────────────────────────── 庄周梦蝶

export function hudie(s: Stage): Scene {
  const { ctx, THREE } = s;
  const pond = ctx.pond;
  const home = s.spot(pond.center.x + pond.radiusX + 2.4, pond.center.z + 1.5, 5);
  // one golden butterfly, and a swarm for the dream (both wing-beating in the shader)
  const geo = butterflyGeometry(THREE, '#e8b64a', '#1b1916', '#3a2a12');
  geo.scale(1.8, 1.8, 1.8);
  instanceAttrs(THREE, geo, 1, () => 0);
  const anim = wingMaterial(THREE, { rate: 16, angle: 0.9, lift: 0.2 });
  const fly = new THREE.InstancedMesh(geo, anim.material, 1);
  fly.frustumCulled = false;
  s.bag.add(fly, s.group);
  const SW = 26;
  const sgeo = butterflyGeometry(THREE, '#f2c65a', '#b8553a', '#3a2a12');
  instanceAttrs(THREE, sgeo, SW, (i) => i * 1.3);
  const sanim = wingMaterial(THREE, { rate: 14, angle: 0.9, lift: 0.2 });
  const swarm = new THREE.InstancedMesh(sgeo, sanim.material, SW);
  swarm.frustumCulled = false;
  swarm.visible = false;
  s.bag.add(swarm, s.group);
  const pos = new THREE.Vector3().copy(home);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let mode: 'wander' | 'circle' | 'land' = 'wander';
  let dream = 0; // 0 none … 1 full swarm
  let dreaming = false;
  const headY = () => (s.who === 'cat' ? 0.62 : s.who === 'rabbit' ? 0.78 : 1.42);
  s.frame((dt, t) => {
    anim.uniforms.uTime.value = t;
    sanim.uniforms.uTime.value = t;
    const p = s.player();
    if (mode === 'wander') {
      v.set(home.x + Math.sin(t * 0.5) * 2.2, home.y + 1.1 + Math.sin(t * 1.7) * 0.3, home.z + Math.sin(t * 1.0) * 1.4);
      if (s.dist(pos.x, pos.z) < 3.5 && !s.finished) mode = 'circle';
    } else if (mode === 'circle') {
      v.set(p.x + Math.cos(t * 1.4) * 0.9, p.y + headY() + 0.3 + Math.sin(t * 2.3) * 0.2, p.z + Math.sin(t * 1.4) * 0.9);
      if (s.dist(home.x, home.z) > 12 && !dreaming && !s.finished) mode = 'wander';
    } else {
      v.set(p.x, p.y + headY() + 0.05, p.z);
    }
    pos.lerp(v, Math.min(1, dt * (mode === 'land' ? 4 : 2.2)));
    e.set(0, t * (mode === 'land' ? 0 : 1.4), 0);
    q.setFromEuler(e);
    mtx.compose(pos, q, one);
    fly.setMatrixAt(0, mtx);
    fly.instanceMatrix.needsUpdate = true;
    // the dream swarm swirls round the sleeper
    const target = dreaming ? 1 : 0;
    dream += (target - dream) * Math.min(1, dt * 0.8);
    swarm.visible = dream > 0.02;
    if (swarm.visible) {
      for (let i = 0; i < SW; i++) {
        const a = t * (0.4 + (i % 5) * 0.08) + i * 2.39;
        const rad = (1.2 + (i % 7) * 0.45) * (0.4 + dream * 0.6) + (1 - dream) * 4;
        v.set(p.x + Math.cos(a) * rad, p.y + 0.4 + (i % 6) * 0.35 + Math.sin(t * 1.3 + i) * 0.25, p.z + Math.sin(a) * rad);
        e.set(0, -a, 0);
        q.setFromEuler(e);
        mtx.compose(v, q, one);
        swarm.setMatrixAt(i, mtx);
      }
      swarm.instanceMatrix.needsUpdate = true;
    }
  });
  const m = mark(s, { root: (() => { const o = new THREE.Group(); o.position.copy(home); s.bag.add(o, s.group); return o; })(), height: 1.8 } as never);
  const promptPos = new THREE.Vector3();
  s.frame(() => promptPos.copy(pos).setY(pos.y - headY()));
  s.whenDone(s.prompt({
    id: 'qiyu-hudie', position: promptPos, radius: 2,
    labelZh: '金色的蝴蝶', labelEn: 'A golden butterfly', actionZh: '静观', actionEn: 'Watch it',
    async act() {
      if (s.finished || !s.claim()) return;
      m.set(false);
      let frozen = false;
      try {
        const who = s.who;
        mode = 'circle';
        if (who === 'cat') {
          ctx.player.impulse(Math.sin(ctx.player.heading) * 1.5, 4.5, Math.cos(ctx.player.heading) * 1.5);
          await s.wait(900);
          await s.say(null, C('大橘', 'Big Ginger'), [L('（扑了个空。蝴蝶在头顶上转圈，像是在笑。大橘打了个哈欠……）', '(Missed. The butterfly circles overhead as if laughing. Big Ginger yawns…)')]);
        } else if (who === 'rabbit') {
          ctx.player.impulse(0, 4, 0);
          await s.wait(800);
        } else if (who === 'scholar') {
          await s.say(null, C('书生', 'Scholar'), [L('（书生在树荫下读《庄子》，读到《齐物论》，书页盖在脸上……）', '(Reading Zhuangzi in the shade, the scholar reaches “The Equality of Things,” and the page falls over his face…)')]);
        }
        ctx.player.emote('sleep');
        ctx.player.freeze(true);
        frozen = true;
        const unhaze = s.haze();
        dreaming = true;
        s.music('quiet');
        s.qin([12, 11, 9, 7, 9, 11, 12, 14], 420, 0.45);
        await s.wait(1600);
        const p = s.player();
        s.words('不知周之梦为胡蝶与', new THREE.Vector3(p.x - 0.9, p.y + 2.4, p.z), { color: '#a8703a', vertical: true, life: 6, size: 0.3 });
        await s.wait(1400);
        s.words('胡蝶之梦为周与', new THREE.Vector3(p.x + 0.9, p.y + 2.2, p.z), { color: '#a8703a', vertical: true, life: 6, size: 0.3 });
        await s.wait(1200);
        const dreamer = who === 'cat' ? '大橘' : who === 'rabbit' ? '玉兔' : who === 'scholar' ? '庄周' : '你';
        const k = await s.say(null, C('蝶', 'Butterfly'), [L(`栩栩然，胡蝶也。……${dreamer === '你' ? '你' : dreamer}是谁？`, 'Fluttering, a butterfly — happy as can be. …Who are you?', [
          C(who === 'cat' ? '一只猫' : '我是我', who === 'cat' ? 'A cat' : 'I am me'),
          C('一只蝴蝶', 'A butterfly'),
          C('……', '…'),
        ])]);
        dreaming = false;
        unhaze();
        s.releaseMusic();
        ctx.player.freeze(false);
        frozen = false;
        mode = 'land';
        await s.wait(900);
        const extra = who === 'cat'
          ? { zh: '大橘梦见自己变成一只蝴蝶，飞过墙头，飞过鱼池……醒来舔了舔爪子，不知是猫梦见了蝴蝶，还是蝴蝶梦见了猫。', en: 'Big Ginger dreamt he was a butterfly, flying over the wall, over the fish pond… He woke and licked a paw, not knowing if a cat had dreamt of a butterfly or a butterfly of a cat.', bonus: 40, seal: '蝶' }
          : who === 'rabbit'
            ? { zh: '玉兔梦见自己是一只蝴蝶，一路飞回了月亮上。醒来，蝴蝶正停在它的长耳朵上。', en: 'The Jade Rabbit dreamt it was a butterfly and flew all the way back to the moon. It woke with the butterfly perched on one long ear.', bonus: 40, seal: '蝶' }
            : who === 'scholar'
              ? { zh: '书生梦里做了一回庄周，庄周梦里做了一回蝴蝶。醒来，书页正翻到《齐物论》。', en: 'The scholar dreamt he was Zhuang Zhou, and Zhuang Zhou dreamt he was a butterfly. He woke with the book open at “The Equality of Things.”', bonus: 50, seal: '蝶' }
              : { zh: k === 1 ? '你答「一只蝴蝶」。醒来时，那只金蝶正停在你的头上。' : '醒来时，那只金蝶正停在你的头上。', en: k === 1 ? 'You answered “a butterfly.” When you woke, the golden butterfly was resting on your head.' : 'When you woke, the golden butterfly was resting on your head.', seal: '蝶' };
        s.finish(extra);
        sfx.chirps(2, 0.3);
        s.bag.later(6000, () => { mode = 'wander'; });
      } finally {
        if (frozen) ctx.player.freeze(false);
        dreaming = false;
        s.unclaim();
      }
    },
  }));
  return { x: home.x, z: home.z, r: 14 };
}
