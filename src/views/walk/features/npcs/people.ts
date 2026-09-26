// New folk to talk to, each with lines of their own for different companions:
//   货郎      a peddler on his round (market → bridge → garden gate → lotus dock and back) with a shop
//   说书人    a storyteller at the teahouse: a different tale each day (三国, 西游, 聊斋, 成语)
//   算命先生  a fortune teller in the square: a slip for 10 coins (关公: 「将军何须问卜」)
//   糖人      the sugar-figure stall: your companion in amber sugar, to eat or keep
//   卖花姑娘  a flower girl: buy a flower, give it to someone for a surprise
//   老农      an old farmer by the homestead: tips on building, pets, waypoints
//   书童      a lost page boy looking for his master across the places (a little errand)
// Each has a name (folk.ts: 货郎孙七, 说书钱先生, 袁半仙, 糖人张, 杏儿, 田老伯, 小篆 and 柳先生), given the
// first time you talk (the prompt then reads 「title·name」), and a small story told a beat a day.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { CharacterId } from '../../../../data/characters';
import { CHARACTER } from '../../../../data/characters';
import { ANCHORS } from '../../map';
import { Bag, canvasTexture, feature, inked, loadBrush, BRUSH_FONT, reducedMotion, tr } from '../kit';
import { merge, part } from '../geo';
import { earn, flag, play, record, spend } from '../../../../app/play';
import { toKey } from '../../../../core/date';
import { figure, front, greet, person, speechMark, talk, type Figure } from '../minigames/npc';
import { begin, end } from '../minigames/ui';
import { walkableNear } from '../minigames/cat';
import { Bubbles } from './bubbles';
import {
  CAT_AFTER, CAT_HECKLE, CAT_PAW, FARMER_HELLO, FARMER_TIPS, FLOWERS, FLOWER_HELLO, FLOWER_HELLO_AGAIN, FORTUNE_HELLO, GUAN_GIFT, MASTER_FOUND,
  PEDDLER_ROUND, peddlerHello, POET_CORRECTS, POET_VERSE, SHUTONG_ASK, SHUTONG_CLUE, SHUTONG_DONE, SLIPS, STORY_END, SUGAR_HELLO, SUGAR_MAKE, TALES,
  TALE_AFTER, TALE_SPOTTED, WARE_SOLD,
} from './lines';
import {
  FLOWER_PRICE, FORTUNE_PRICE, FREE_FLOWER_KEY, SHUTONG_COINS, SHUTONG_NOTE, SHUTONG_SEEK, SUGAR_PRICE, WARES, canBuy, clockSeconds, countToday,
  forCompanion, routeAt, seasonOf, shutongDay, shutongStage, slipFor, sugarCount, taleFor, type Line,
} from './logic';
import { receive } from './carry';
import { PEDDLER_ROUTE, PEDDLER_SPEED, SHUTONG_SPOTS } from './places';
import { offerFlower } from './gift';
import { blockedAlong } from './crowd';
import * as snd from './sound';
import { stallFolk } from './talk';

const who = (ctx: WorldCtx): CharacterId => ctx.player.character;
const night = (ctx: WorldCtx): boolean => { try { return ctx.sky.isNight(); } catch { return false; } };
const coinsNow = () => play.value.coins;
const L2 = (l: Line) => ({ zh: l.zh, en: l.en });
/** A line said by the walker's companion (their own name on the dialogue). */
function sayAs(ctx: WorldCtx, l: Line): Promise<number> {
  const c = CHARACTER[who(ctx)];
  return ctx.hud.say({ nameZh: c.zh, nameEn: c.en, zh: l.zh, en: l.en });
}
function paid(ctx: WorldCtx, n: number) {
  snd.coins();
  ctx.hud.toast(`−${n} 文`, `−${n} coins`, 1400);
}
function tooPoor(ctx: WorldCtx, fig: Figure, name: { zh: string; en: string }, price: number) {
  return talk(ctx, fig, name, [{ zh: `囊中羞涩？差 ${price - coinsNow()} 文。做做任务、遇遇奇事，铜钱自然就有了。`, en: `A light purse? You’re ${price - coinsNow()} coins short. Do an errand or two, meet a wonder on the road — coins will come.` }]);
}

/** A little solid prop (merged, inked) standing on the ground. */
function prop(bag: Bag, ctx: WorldCtx, parent: T.Object3D, parts: T.BufferGeometry[], x: number, z: number, ry = 0, w = 0.01): T.Mesh {
  const m = inked(ctx, merge(ctx.THREE, parts), { width: w });
  m.name = 'npc-prop';
  m.position.set(x, ctx.groundY(x, z), z);
  m.rotation.y = ry;
  bag.add(m, parent);
  return m;
}

// ───────────────────────────── 货郎, the peddler ─────────────────────────────

const PEDDLER_CALLS: Line[] = [
  { zh: '拨浪鼓响，货郎到——', en: 'Rattle-drum! The peddler’s here!' },
  { zh: '糖葫芦、风车、油纸伞——', en: 'Candied haws, pinwheels, umbrellas!' },
  { zh: '灯笼纸鸢，样样都有——', en: 'Lanterns, kites — all sorts!' },
];

export const peddler = feature('npc-peddler', async (bag, ctx) => {
  const { THREE } = ctx;
  const still = reducedMotion();
  if (import.meta.env.DEV) {
    // his round is laid by hand: check it against the ground as it is now (a new region or building)
    const b = blockedAlong(ctx, PEDDLER_ROUTE, 0.5, true);
    if (b.bad) console.info(`[npcs] the peddler's round is blocked (${b.bad}/${b.n}) at ${b.where.join(' ')}`);
  }
  const bubbles = new Bubbles(bag, 1);
  const pos = routeAt(PEDDLER_ROUTE, PEDDLER_SPEED, clockSeconds(ctx.env.date));
  const f = figure(bag, ctx.scene, { robe: '#9a6a3c', trim: '#3a2e28', hat: 'bamboo', hatColor: '#c9ad72', apron: '#e9dcc0' }, new THREE.Vector3(pos.x, ctx.groundY(pos.x, pos.z), pos.z), pos.heading);
  // his carrying pole (货担): two little cabinets of drawers, a straw bundle bristling with candied haws, pinwheels
  const load: T.BufferGeometry[] = [part(THREE, new THREE.CylinderGeometry(0.022, 0.022, 1.9, 5), '#7a5a3a', { p: [0.16, 1.02, 0], r: [Math.PI / 2, 0, 0] })];
  for (const sz of [-1, 1]) {
    load.push(part(THREE, new THREE.BoxGeometry(0.36, 0.42, 0.3), '#8a4a32', { p: [0.16, 0.42, sz * 0.82] }));
    for (let d = 0; d < 3; d++) load.push(part(THREE, new THREE.BoxGeometry(0.3, 0.02, 0.01), '#e0b04a', { p: [0.16, 0.3 + d * 0.12, sz * 0.82 + sz * 0.155] }));
    load.push(part(THREE, new THREE.BoxGeometry(0.4, 0.04, 0.34), '#5a3b2a', { p: [0.16, 0.65, sz * 0.82] }));
    for (const dx of [-0.16, 0.16]) load.push(part(THREE, new THREE.CylinderGeometry(0.005, 0.005, 0.4, 3), '#2b2622', { p: [0.16 + dx, 0.85, sz * 0.82] }));
  }
  // the straw bundle of haws on the front cabinet
  load.push(part(THREE, new THREE.CylinderGeometry(0.1, 0.12, 0.34, 8), '#c9ad72', { p: [0.16, 0.86, 0.82] }));
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    load.push(part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.3, 3), '#d8c9a0', { p: [0.16 + Math.cos(a) * 0.12, 1.02, 0.82 + Math.sin(a) * 0.12], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }));
    load.push(part(THREE, new THREE.SphereGeometry(0.035, 6, 4), '#c42a2e', { p: [0.16 + Math.cos(a) * 0.19, 1.14, 0.82 + Math.sin(a) * 0.19] }));
  }
  // two pinwheels on the back cabinet
  for (const [dx, c1, c2] of [[-0.08, '#d8463a', '#e6b93a'], [0.1, '#3f7aa0', '#6fa05a']] as [number, string, string][]) {
    load.push(part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.5, 3), '#c8a878', { p: [0.16 + dx, 0.9, -0.82] }));
    load.push(part(THREE, new THREE.CircleGeometry(0.09, 4), c1, { p: [0.16 + dx, 1.15, -0.8], r: [0, 0, 0.4] }));
    load.push(part(THREE, new THREE.CircleGeometry(0.05, 4), c2, { p: [0.16 + dx, 1.15, -0.79], r: [0, 0, 1.2] }));
  }
  const pole = inked(ctx, merge(THREE, load), { width: 0.008 });
  f.root.add(pole);
  // the rattle-drum (拨浪鼓) in his right hand
  const drum = new THREE.Group();
  drum.add(inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), '#7a5a3a', { p: [0, 0.15, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), '#c9483a', { p: [0, 0.34, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.SphereGeometry(0.014, 5, 4), '#2b2622', { p: [0.1, 0.34, 0] }),
    part(THREE, new THREE.SphereGeometry(0.014, 5, 4), '#2b2622', { p: [-0.1, 0.34, 0] }),
  ]), { width: 0.005 }));
  drum.position.copy(f.hand);
  f.armR.add(drum);
  f.armR.rotation.x = -0.5;
  const mark = speechMark(bag, f, '货');
  const at = new THREE.Vector3();
  const pr = { ...pos };
  let clock = clockSeconds(ctx.env.date), talking = false, rattleT = 2, callT = 6, metToday = false, callN = 0;
  const voice = { x: pr.x, y: 0, z: pr.z, top: f.height + 0.25 };
  const folk = stallFolk('n.peddler');
  const name = folk.nameRef;
  bag.interact(folk.prompt({
    id: 'npc-peddler', position: at, radius: 2.2,
    labelZh: folk.label().zh, labelEn: folk.label().en, actionZh: '看货', actionEn: 'Browse',
    async act() {
      if (!begin(ctx, 'talk')) return;
      talking = true;
      try {
        record('npc:peddler');
        const gift = await offerFlower(ctx, f, name, 'peddler');
        if (gift) {
          // haws for the first flower of the day only
          if (gift === 'first') { receive('haws'); ctx.hud.toast('得了一串糖葫芦', 'A stick of candied haws for you', 1800); }
          return;
        }
        await folk.story(ctx, night(ctx));
        let first = true;
        for (;;) {
          const choices = WARES.map((w) => {
            const b = canBuy(w, coinsNow(), play.value.flags);
            return { zh: `${w.zh} · ${w.price}文${!b.ok && b.why === 'owned' ? '（已有）' : ''}`, en: `${w.en} · ${w.price}${!b.ok && b.why === 'owned' ? ' (owned)' : ''}` };
          });
          const hi = first ? peddlerHello(who(ctx), play.value.flags) : null;
          const c = await talk(ctx, f, name, [{
            zh: `${hi ? hi.zh + '\n' : '还要点什么？'}（囊中 ${coinsNow()} 文）`,
            en: `${hi ? hi.en + '\n' : 'Anything else? '}(Purse: ${coinsNow()})`,
            choices: [...choices, { zh: '您从哪儿来？', en: 'Where do you go?' }, { zh: '告辞', en: 'Goodbye' }],
          }]);
          first = false;
          if (c < 0 || c === WARES.length + 1) break;
          if (c === WARES.length) { await talk(ctx, f, name, [L2(PEDDLER_ROUND)]); continue; }
          const w = WARES[c];
          const b = canBuy(w, coinsNow(), play.value.flags);
          if (!b.ok) {
            if (b.why === 'owned') await talk(ctx, f, name, [{ zh: `${w.zh}你已经有了，在行囊里呢。`, en: `You already have the ${w.en.toLowerCase()} — it’s in your bag.` }]);
            else await tooPoor(ctx, f, name, w.price);
            continue;
          }
          if (!spend(b.cost)) continue;
          paid(ctx, b.cost);
          receive(w.id);
          record('buy');
          f.wave();
          await talk(ctx, f, name, [{ zh: `${WARE_SOLD[w.id].zh}\n${w.noteZh}`, en: `${WARE_SOLD[w.id].en}\n${w.noteEn}` }]);
          ctx.hud.toast(`${w.zh}拿在手里了——左上角的「囊」可以换着拿`, `The ${w.en.toLowerCase()} is in your hand — the bag chip swaps what you hold`, 2600);
        }
      } finally { talking = false; end(ctx, 'talk'); }
    },
  }));
  bag.frame((dt, t) => {
    const pp = ctx.player.position;
    const d = Math.hypot(pp.x - pr.x, pp.z - pr.z);
    // he stops for you (and while talking), otherwise keeps to his round
    const wait = talking || d < 3.2;
    if (!wait) clock += dt;
    routeAt(PEDDLER_ROUTE, PEDDLER_SPEED, clock, pr);
    const walking = pr.moving && !wait ? 1 : 0;
    f.walking! += (walking - f.walking!) * Math.min(1, dt * 5);
    f.root.position.set(pr.x, ctx.groundY(pr.x, pr.z), pr.z);
    if (wait && d < 3.2) f.faceTo = { x: pp.x, z: pp.z };
    else { f.faceTo = null; f.root.rotation.y += Math.atan2(Math.sin(pr.heading - f.root.rotation.y), Math.cos(pr.heading - f.root.rotation.y)) * Math.min(1, dt * 5); }
    at.set(pr.x + Math.sin(f.root.rotation.y) * 0.9, f.root.position.y, pr.z + Math.cos(f.root.rotation.y) * 0.9);
    voice.x = pr.x; voice.y = f.root.position.y; voice.z = pr.z;
    // the rattle-drum twirls; its sound carries a little way
    drum.rotation.y = still ? 0 : Math.sin(t * 14) * (rattleT < 0.7 ? 1.2 : 0.1);
    rattleT -= dt;
    if (rattleT <= 0) {
      rattleT = 7 + (Math.sin(t) + 1) * 2;
      if (d < 26) snd.rattle(Math.max(0.1, 1 - d / 26) * 0.7);
    }
    callT -= dt;
    if (callT <= 0 && d < 18 && !talking) {
      callT = 11;
      const l = PEDDLER_CALLS[callN++ % PEDDLER_CALLS.length];
      bubbles.say(voice, tr(ctx, l.zh, l.en), 2.6);
    }
    if (!metToday && d < 12) { metToday = true; ctx.hud.toast('拨浪鼓声——货郎来了', 'A rattle-drum — the peddler is coming', 2200); }
    mark.set(!talking);
  });
});

// ───────────────────────────── 说书人, the storyteller ─────────────────────────────

export const storyteller = feature('npc-storyteller', (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('village');
  const a = { x: 12.3, z: 88 };
  const p = walkableNear(ctx, a.x, a.z, 1.5);
  const f = figure(bag, group, { robe: '#3f5a6a', trim: '#2b2622', hat: 'scholar', hatColor: '#2b2622', beard: '#e8e2d4', hair: '#d8d2c4', sit: true }, new THREE.Vector3(p.x, ctx.groundY(p.x, p.z), p.z), -Math.PI / 2);
  // his little table: the gavel (醒木) and a folded fan
  prop(bag, ctx, group, [
    part(THREE, new THREE.BoxGeometry(0.5, 0.06, 0.8), '#7a3a28', { p: [0, 0.72, 0] }),
    part(THREE, new THREE.BoxGeometry(0.44, 0.7, 0.72), '#6a3224', { p: [0, 0.36, 0] }),
    part(THREE, new THREE.BoxGeometry(0.46, 0.2, 0.02), '#d8b24a', { p: [0, 0.6, 0.37] }),
    part(THREE, new THREE.BoxGeometry(0.08, 0.05, 0.16), '#3a2a20', { p: [0.05, 0.78, -0.18] }),
    part(THREE, new THREE.BoxGeometry(0.03, 0.025, 0.24), '#e9e2d0', { p: [-0.05, 0.765, 0.15], r: [0, 0.4, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 8), '#f1ead8', { p: [0.1, 0.79, 0.25] }),
  ], p.x - 0.7, p.z);
  bag.onDispose(ctx.addCollider({ x: p.x - 0.35, z: p.z, r: 0.55, h: 1 }));
  const mark = speechMark(bag, f, '书');
  greet(bag, ctx, f, 5);
  const day = toKey(ctx.env.date);
  let n = 0;
  const folk = stallFolk('n.storyteller');
  const name = folk.nameRef;
  const knock = () => { snd.gavel(); f.armR.rotation.x = -1.2; bag.later(180, () => { f.armR.rotation.x = -0.2; }); };
  bag.interact(folk.prompt({
    id: 'npc-storyteller', position: front(f, 1.2), radius: 2.2,
    labelZh: folk.label().zh, labelEn: folk.label().en, actionZh: '听书', actionEn: 'Listen',
    async act() {
      if (!begin(ctx, 'talk')) return;
      mark.set(false);
      try {
        record('npc:storyteller');
        if (await offerFlower(ctx, f, name, 'storyteller')) return;
        await folk.story(ctx, night(ctx));
        const me = who(ctx);
        const tale = taleFor(TALES, day, me, n++);
        const spotted = forCompanion(TALE_SPOTTED, me);
        const c = await talk(ctx, f, name, [{
          zh: `今日书目：《${tale.zh}》。客官坐下听一段？`, en: `Today’s tale: “${tale.en}”. Sit and listen awhile?`,
          choices: [{ zh: '听一段', en: 'Listen' }, { zh: '改日', en: 'Another day' }],
        }]);
        if (c !== 0) return;
        ctx.player.emote('sit');
        if (spotted) await talk(ctx, f, name, [L2(spotted)]);
        // the opening verse (the poet hears his own line misquoted, and puts it right)
        if (me === 'poet') {
          await talk(ctx, f, name, [L2(POET_VERSE)]);
          await sayAs(ctx, POET_CORRECTS[0]);
          await talk(ctx, f, name, [L2(POET_CORRECTS[1])]);
          await sayAs(ctx, POET_CORRECTS[2]);
        } else await talk(ctx, f, name, [L2(tale.verse)]);
        knock();
        await talk(ctx, f, name, [L2(tale.body[0])]);
        if (me === 'cat') {
          await sayAs(ctx, CAT_HECKLE[0]);
          await talk(ctx, f, name, [L2(CAT_HECKLE[1])]);
          await sayAs(ctx, CAT_HECKLE[2]);
          await talk(ctx, f, name, [L2(CAT_HECKLE[3])]);
        }
        for (const l of tale.body.slice(1)) await talk(ctx, f, name, [L2(l)]);
        knock();
        await talk(ctx, f, name, [L2(STORY_END)]);
        flag(`tale:${tale.id}`);
        const after = tale.hero === me ? tale.heroNote : me === 'cat' ? CAT_AFTER : forCompanion(TALE_AFTER, me);
        if (after) {
          if (tale.hero === me) ctx.player.emote(me === 'guan' ? 'bow' : 'talk');
          await ctx.hud.say({ nameZh: me === 'cat' ? name.zh : '　', nameEn: me === 'cat' ? name.en : ' ', zh: after.zh, en: after.en });
        }
        const heard = Object.keys(play.value.flags).filter((k) => k.startsWith('tale:')).length;
        const tip = await talk(ctx, f, name, [{
          zh: `（已听过 ${heard}/${TALES.length} 段书）`, en: `(Tales heard: ${heard}/${TALES.length})`,
          choices: [{ zh: '打赏两文', en: 'Tip two coins' }, { zh: '鼓掌', en: 'Applaud' }],
        }]);
        ctx.player.emote(tip === 0 ? 'wave' : 'play');
        if (tip === 0 && spend(2)) { paid(ctx, 2); await talk(ctx, f, name, [{ zh: '多谢客官捧场！明儿请早！', en: 'Thank you kindly! Come early tomorrow!' }]); }
        else ctx.hud.toast('啪啪啪——满堂喝彩', 'Clap clap clap — the whole teahouse cheers', 1600);
      } finally { mark.set(true); end(ctx, 'talk'); }
    },
  }));
});

// ───────────────────────────── 算命先生, the fortune teller ─────────────────────────────

export const fortuneTeller = feature('npc-fortune', async (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('village');
  const p = walkableNear(ctx, -18.4, 87.5, 1.5);
  const f = figure(bag, group, { robe: '#6a5a8a', trim: '#2b2622', hat: 'scholar', hatColor: '#23201d', beard: '#e8e2d4', hair: '#cfc8bb', sit: true }, new THREE.Vector3(p.x, ctx.groundY(p.x, p.z), p.z), Math.PI / 2);
  // his table, the tube of bamboo slips, and the banner 「铁口直断」
  prop(bag, ctx, group, [
    part(THREE, new THREE.BoxGeometry(0.8, 0.06, 0.5), '#7a3a28', { p: [0, 0.72, 0] }),
    part(THREE, new THREE.BoxGeometry(0.72, 0.7, 0.44), '#c9483a', { p: [0, 0.36, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.07, 0.06, 0.22, 10), '#8a6a48', { p: [0.2, 0.86, 0] }),
    ...[0, 1, 2, 3, 4].map((i) => part(THREE, new THREE.BoxGeometry(0.012, 0.22, 0.02), '#d8c9a0', { p: [0.2 + Math.cos(i * 1.3) * 0.03, 0.98, Math.sin(i * 1.3) * 0.03], r: [Math.sin(i) * 0.15, 0, Math.cos(i) * 0.15] })),
    part(THREE, new THREE.BoxGeometry(0.2, 0.01, 0.14), '#f1ead8', { p: [-0.18, 0.755, 0.05] }),
  ], p.x + 0.72, p.z, Math.PI / 2);
  await loadBrush('铁口直断');
  const banner = canvasTexture(THREE, 96, 384, (g, w, h) => {
    g.fillStyle = '#f1e9d8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b93a2b'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#1b1916'; g.font = `64px ${BRUSH_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    '铁口直断'.split('').forEach((ch, i) => g.fillText(ch, w / 2, 56 + i * 90));
  });
  bag.own(banner);
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.68), new THREE.MeshLambertMaterial({ map: banner, side: THREE.DoubleSide }));
  const poleX = p.x - 0.45, poleZ = p.z + 0.75;
  const gy = ctx.groundY(poleX, poleZ);
  flagMesh.position.set(poleX + 0.03, gy + 1.6, poleZ);
  flagMesh.rotation.y = Math.PI / 2;
  bag.add(flagMesh, group);
  prop(bag, ctx, group, [part(THREE, new THREE.CylinderGeometry(0.025, 0.03, 2.6, 5), '#7a5a3a', { p: [0, 1.3, 0] }), part(THREE, new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), '#7a5a3a', { p: [0, 2.45, 0.2], r: [Math.PI / 2, 0, 0] })], poleX, poleZ - 0.2);
  bag.onDispose(ctx.addCollider({ x: p.x + 0.3, z: p.z, r: 0.6, h: 1 }));
  bag.onDispose(ctx.addCollider({ x: poleX, z: poleZ - 0.2, r: 0.1, h: 2.6 }));
  const mark = speechMark(bag, f, '卦');
  greet(bag, ctx, f, 5);
  const day = toKey(ctx.env.date);
  let draws = 0;
  const folk = stallFolk('n.fortune');
  const name = folk.nameRef;
  const drawSlip = async () => {
    snd.sticks();
    f.armR.rotation.x = -1.1;
    await new Promise((r) => bag.later(1200, () => r(null)));
    f.armR.rotation.x = 0;
    const slip = slipFor(SLIPS, day, who(ctx), draws++);
    record('fortune');
    ctx.hud.showCard({
      titleZh: slip.rank.zh, titleEn: slip.rank.en,
      bodyZh: `${slip.verse.zh}\n—— ${slip.src}\n\n${slip.read.zh}\n\n${slip.yi.zh}`,
      bodyEn: `${slip.verse.en}\n— ${slip.src}\n\n${slip.read.en}\n\n${slip.yi.en}`,
      seal: '签',
    });
  };
  bag.interact(folk.prompt({
    id: 'npc-fortune', position: front(f, 1.3), radius: 2.2,
    labelZh: folk.label().zh, labelEn: folk.label().en, actionZh: '求签', actionEn: 'Draw a slip',
    async act() {
      if (!begin(ctx, 'talk')) return;
      mark.set(false);
      try {
        record('npc:fortune');
        const gift = await offerFlower(ctx, f, name, 'fortune');
        if (gift) { if (gift === 'first') await drawSlip(); return; }
        await folk.story(ctx, night(ctx));
        const me = who(ctx);
        const hello = forCompanion(FORTUNE_HELLO, me);
        if (me === 'guan') {
          await talk(ctx, f, name, [L2(hello), L2(GUAN_GIFT)]);
          ctx.player.emote('bow');
          return;
        }
        if (me === 'cat') {
          await talk(ctx, f, name, [L2(hello)]);
          ctx.player.emote('pet');
          await talk(ctx, f, name, [L2(CAT_PAW)]);
          return;
        }
        const price = me === 'taoist' ? Math.ceil(FORTUNE_PRICE / 2) : FORTUNE_PRICE;
        const c = await talk(ctx, f, name, [{ zh: `${hello.zh}（${price} 文，囊中 ${coinsNow()} 文）`, en: `${hello.en} (${price} coins; purse ${coinsNow()})`, choices: [{ zh: '求一签', en: 'Draw a slip' }, { zh: '告辞', en: 'Goodbye' }] }]);
        if (c !== 0) return;
        if (!spend(price)) { await tooPoor(ctx, f, name, price); return; }
        paid(ctx, price);
        await talk(ctx, f, name, [{ zh: '心里默念所求之事……摇！', en: 'Hold your question in your heart… and shake!' }]);
        await drawSlip();
      } finally { mark.set(true); end(ctx, 'talk'); }
    },
  }));
});

// ───────────────────────────── 糖人, the sugar-figure stall ─────────────────────────────

export const sugarStall = feature('npc-sugar', (bag, ctx) => {
  const group = ctx.regionGroup('village');
  const nz = ANCHORS.market.z - 3.3;
  const f = person(bag, ctx, group, { robe: '#8c5a48', trim: '#3a2e28', hat: 'cap', hatColor: '#3a2e28', apron: '#efe6d2', beard: '#23201d' }, { x: 5, z: nz }, 0.2, -1.05, { x: 5, z: nz + 5 });
  f.armR.rotation.x = -0.6;
  const mark = speechMark(bag, f, '糖');
  greet(bag, ctx, f, 4);
  const folk = stallFolk('n.sugar');
  const name = folk.nameRef;
  const spot = new ctx.THREE.Vector3(5, ctx.groundY(5, nz + 1.5), nz + 1.5);
  bag.interact(folk.prompt({
    id: 'npc-sugar', position: spot, radius: 1.9,
    labelZh: folk.label().zh, labelEn: folk.label().en, actionZh: '吹糖人', actionEn: 'Make one',
    async act() {
      if (!begin(ctx, 'talk')) return;
      mark.set(false);
      try {
        record('npc:sugar');
        const me = who(ctx);
        // a sugar figure free for the first flower of the day; after that, flowers are only thanked
        const free = (await offerFlower(ctx, f, name, 'sugar')) === 'first';
        if (!free) await folk.story(ctx, night(ctx));
        if (!free) {
          const hi = forCompanion(SUGAR_HELLO, me);
          const c = await talk(ctx, f, name, [{ zh: `${hi.zh}（囊中 ${coinsNow()} 文）`, en: `${hi.en} (Purse: ${coinsNow()})`, choices: [{ zh: `来一个 · ${SUGAR_PRICE}文`, en: `One, please · ${SUGAR_PRICE}` }, { zh: '看看就好', en: 'Just looking' }] }]);
          if (c !== 0) return;
          if (!spend(SUGAR_PRICE)) { await tooPoor(ctx, f, name, SUGAR_PRICE); return; }
          paid(ctx, SUGAR_PRICE);
        }
        const c = CHARACTER[me];
        f.armR.rotation.x = -1.3;
        await talk(ctx, f, name, [L2(forCompanion(SUGAR_MAKE, me))]);
        f.armR.rotation.x = -0.6;
        const k = await ctx.hud.say({
          nameZh: name.zh, nameEn: name.en,
          zh: `成了！一个琥珀色的小${c.zh}，在${night(ctx) ? '灯下' : '日头底下'}亮晶晶的。吃了，还是留着？`, en: `Done! A little amber ${c.en}, glittering in the ${night(ctx) ? 'lamplight' : 'sun'}. Eat it, or keep it?`,
          choices: [{ zh: '吃掉', en: 'Eat it' }, { zh: '留着', en: 'Keep it' }],
        });
        if (k === 0) {
          ctx.player.emote('eat');
          ctx.hud.toast('咔嚓——甜！', 'Crunch — sweet!', 1600);
        } else {
          receive('sugar', { sugar: me });
          flag(`sugar:${me}`);
          const n = sugarCount(play.value.flags);
          ctx.hud.toast(`收好了糖${c.zh}（糖人 ${n}/13）`, `Kept the sugar ${c.en} (sugar figures ${n}/13)`, 2400);
        }
      } finally { mark.set(true); end(ctx, 'talk'); }
    },
  }));
});

// ───────────────────────────── 卖花姑娘, the flower girl ─────────────────────────────

export const flowerGirl = feature('npc-flower', (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('village');
  const season = seasonOf(ctx.env.date.getMonth() + 1);
  const fl = FLOWERS[season];
  const f = person(bag, ctx, group, { robe: '#c2566a', trim: '#7a2e22', hat: 'bun', hatColor: '#e0b04a', scale: 0.86 }, { x: 1.8, z: 79.5 }, 0, 0, { x: -1, z: 76 });
  // her basket of flowers on the left arm
  const basket = inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.16, 0.12, 0.14, 10), '#c9ad72'),
    part(THREE, new THREE.TorusGeometry(0.14, 0.012, 3, 10, Math.PI), '#b0935a', { p: [0, 0.07, 0], r: [0, Math.PI / 2, 0] }),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => part(THREE, new THREE.SphereGeometry(0.04, 6, 4), i % 3 === 2 ? '#6f8f4a' : fl.color, { p: [Math.cos(i * 0.9) * 0.08, 0.08 + (i % 2) * 0.03, Math.sin(i * 0.9) * 0.08] })),
  ]), { width: 0.006 });
  basket.position.copy(f.hand).add(new THREE.Vector3(0, 0.02, 0.1));
  f.armL.add(basket);
  f.armL.rotation.x = -0.6;
  const mark = speechMark(bag, f, '花');
  greet(bag, ctx, f, 5);
  const bubbles = new Bubbles(bag, 1);
  const voice = { x: f.root.position.x, y: f.root.position.y, z: f.root.position.z, top: f.height + 0.2 };
  let callT = 3;
  bag.frame((dt) => {
    callT -= dt;
    const pp = ctx.player.position;
    const d = Math.hypot(pp.x - voice.x, pp.z - voice.z);
    if (callT <= 0 && d < 16 && d > 2.5) { callT = 12; bubbles.say(voice, tr(ctx, fl.call.zh, fl.call.en), 2.8); }
  });
  const folk = stallFolk('n.flower');
  const name = folk.nameRef;
  bag.interact(folk.prompt({
    id: 'npc-flower', position: front(f, 0.9), radius: 2,
    labelZh: folk.label().zh, labelEn: folk.label().en, actionZh: '买花', actionEn: 'Buy a flower',
    async act() {
      if (!begin(ctx, 'talk')) return;
      mark.set(false);
      try {
        record('npc:flower');
        await folk.story(ctx, night(ctx));
        const me = who(ctx);
        // 嫦娥 and the gardener get one flower a day for nothing
        const fond = me === 'change' || me === 'gardener';
        const free = fond && countToday(play.value.daily, toKey(ctx.env.date), FREE_FLOWER_KEY) === 0;
        const hi = fond && !free ? forCompanion(FLOWER_HELLO_AGAIN, me) : forCompanion(FLOWER_HELLO, me);
        const c = await talk(ctx, f, name, [{
          zh: `${hi.zh}${free ? '' : `（囊中 ${coinsNow()} 文）`}`, en: `${hi.en}${free ? '' : ` (Purse: ${coinsNow()})`}`,
          choices: [{ zh: free ? `收下这枝${fl.zh}` : `买一枝${fl.zh} · ${FLOWER_PRICE}文`, en: free ? `Take the ${fl.en}` : `A sprig of ${fl.en} · ${FLOWER_PRICE}` }, { zh: '告辞', en: 'Goodbye' }],
        }]);
        if (c !== 0) return;
        if (free) record(FREE_FLOWER_KEY);
        else {
          if (!spend(FLOWER_PRICE)) { await tooPoor(ctx, f, name, FLOWER_PRICE); return; }
          paid(ctx, FLOWER_PRICE);
        }
        receive('flower', { flowerKind: season });
        f.wave();
        await talk(ctx, f, name, [{ zh: `拿好！拿着花去找人说话，就能送给他——说不定有惊喜哦。`, en: `There you go! Walk up to someone with it in hand and you can give it to them — there may be a surprise.` }]);
      } finally { mark.set(true); end(ctx, 'talk'); }
    },
  }));
});

// ───────────────────────────── 老农, the old farmer ─────────────────────────────

export const oldFarmer = feature('npc-farmer', (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('home');
  const f = person(bag, ctx, group, { robe: '#6d7f5a', trim: '#3a2e28', hat: 'bamboo', hatColor: '#c9ad72', beard: '#e8e2d4', hair: '#d8d2c4', cape: '#b89a60' }, { x: -33, z: -29.5 }, 0, 0, { x: -38, z: -24 });
  // a hoe over his shoulder
  const hoe = inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.014, 0.014, 1.4, 5), '#7a5a3a', { p: [0, 0.55, 0] }),
    part(THREE, new THREE.BoxGeometry(0.18, 0.02, 0.22), '#5a4a3a', { p: [0, 1.22, -0.1] }),
  ]), { width: 0.006 });
  hoe.position.copy(f.hand);
  hoe.rotation.x = -0.35;
  f.armR.add(hoe);
  f.armR.rotation.x = -0.4;
  const mark = speechMark(bag, f, '农');
  greet(bag, ctx, f, 6);
  let n = Math.floor(ctx.rng() * FARMER_TIPS.length);
  const folk = stallFolk('n.farmer');
  const name = folk.nameRef;
  bag.interact(folk.prompt({
    id: 'npc-farmer', position: front(f, 0.9), radius: 2.1,
    labelZh: folk.label().zh, labelEn: folk.label().en, actionZh: '讨教', actionEn: 'Ask',
    async act() {
      if (!begin(ctx, 'talk')) return;
      mark.set(false);
      try {
        record('npc:farmer');
        if (await offerFlower(ctx, f, name, 'farmer')) return;
        await folk.story(ctx, night(ctx));
        const me = who(ctx);
        for (;;) {
          const c = await talk(ctx, f, name, [{ zh: forCompanion(FARMER_HELLO, me).zh, en: forCompanion(FARMER_HELLO, me).en, choices: [{ zh: '请老伯指点', en: 'Any advice?' }, { zh: '告辞', en: 'Goodbye' }] }]);
          if (c !== 0) break;
          const tip = FARMER_TIPS[n++ % FARMER_TIPS.length];
          const more = await talk(ctx, f, name, [{ zh: tip.zh, en: tip.en, choices: [{ zh: '还有呢？', en: 'What else?' }, { zh: '多谢老伯', en: 'Thank you' }] }]);
          if (more !== 0) break;
          const tip2 = FARMER_TIPS[n++ % FARMER_TIPS.length];
          await talk(ctx, f, name, [L2(tip2)]);
          break;
        }
      } finally { mark.set(true); end(ctx, 'talk'); }
    },
  }));
});

// ───────────────────────────── 书童, the lost page boy ─────────────────────────────

export const shutong = feature('npc-shutong', (bag, ctx) => {
  const day = toKey(ctx.env.date);
  const { child: cs, master: ms } = shutongDay(SHUTONG_SPOTS, day);
  const doneKey = `shutong:${day}`;
  const kid = person(bag, ctx, ctx.regionGroup(cs.region), { robe: '#6f8fb0', trim: '#3a2e28', hat: 'buns', scale: 0.72 }, cs.child, 0, 0, { x: cs.child.x + 3, z: cs.child.z + 1 });
  // a book bundle on his back
  const { THREE } = ctx;
  const bundle = inked(ctx, merge(THREE, [part(THREE, new THREE.BoxGeometry(0.28, 0.22, 0.14), '#d8c9a0'), part(THREE, new THREE.BoxGeometry(0.3, 0.03, 0.16), '#7a2e22', { p: [0, 0.02, 0] })]), { width: 0.006 });
  bundle.position.set(0, 0.56, -0.17);
  bundle.scale.setScalar(0.8);
  kid.root.add(bundle);
  const master = person(bag, ctx, ctx.regionGroup(ms.region), { robe: '#e9e6dc', trim: '#3d5a73', hat: 'scholar', hatColor: '#23201d', beard: '#23201d' }, ms.master, 0, 0, { x: ms.master.x - 3, z: ms.master.z + 2 });
  const fan = inked(ctx, merge(THREE, [part(THREE, new THREE.CircleGeometry(0.2, 8, Math.PI * 0.25, Math.PI * 0.5), '#f4efe4')]), { width: 0.004 });
  (fan.material as T.Material).side = THREE.DoubleSide;
  fan.position.copy(master.hand);
  fan.rotation.set(-0.3, Math.PI / 2, 0);
  master.armR.add(fan);
  master.armR.rotation.x = -0.7;
  // how far today's errand got (kept in the day's counts: leaving the painting or reloading keeps it)
  let stage = shutongStage(!!play.value.flags[doneKey], play.value.daily, day);
  const kidMark = speechMark(bag, kid, '？');
  const masterMark = speechMark(bag, master, '书');
  const marks = () => { kidMark.set(stage === 'idle' || stage === 'note'); masterMark.set(stage === 'seeking'); };
  marks();
  greet(bag, ctx, kid, 6);
  const kfolk = stallFolk('n.shutong'), mfolk = stallFolk('n.master');
  const kname = kfolk.nameRef, mname = mfolk.nameRef;
  const note = () => bag.counter('npc-shutong', { zh: '字条', en: 'Note' }, tr(ctx, '带给书童', 'for the page boy'));
  if (stage === 'note') note();
  bag.interact(kfolk.prompt({
    id: 'npc-shutong', position: front(kid, 0.8), radius: 2,
    labelZh: kfolk.label().zh, labelEn: kfolk.label().en, actionZh: '说话', actionEn: 'Talk',
    async act() {
      if (!begin(ctx, 'talk')) return;
      try {
        record('npc:shutong');
        await kfolk.story(ctx, night(ctx));
        const me = who(ctx);
        if (stage === 'done') { await talk(ctx, kid, kname, [{ zh: '先生说，下回出门一定牵着我的手。', en: 'Master says next time he’ll hold my hand when we go out.' }]); return; }
        if (stage === 'note') {
          stage = 'done';
          marks();
          ctx.hud.setCounter('npc-shutong', null);
          flag(doneKey);
          earn(SHUTONG_COINS);
          snd.coins();
          kid.wave();
          await talk(ctx, kid, kname, [L2(forCompanion(SHUTONG_DONE, me))]);
          ctx.hud.toast(`+${SHUTONG_COINS} 文`, `+${SHUTONG_COINS} coins`, 1800);
          ctx.hud.showCard({
            titleZh: '寻隐者不遇', titleEn: 'Seeking the Hermit',
            bodyZh: '松下问童子，言师采药去。\n只在此山中，云深不知处。\n\n—— 贾岛', bodyEn: 'Beneath the pines I asked the boy; he said his master’d gone for herbs —\n“Somewhere on this mountain, but the clouds are deep, I can’t say where.”\n\n— Jia Dao',
            seal: '童',
          });
          return;
        }
        await talk(ctx, kid, kname, [L2(forCompanion(SHUTONG_ASK, me)), L2(SHUTONG_CLUE[ms.region])]);
        if (stage === 'idle') { stage = 'seeking'; record(SHUTONG_SEEK); marks(); }
      } finally { end(ctx, 'talk'); }
    },
  }));
  bag.interact(mfolk.prompt({
    id: 'npc-shutong-master', position: front(master, 0.9), radius: 2,
    labelZh: mfolk.label().zh, labelEn: mfolk.label().en, actionZh: '说话', actionEn: 'Talk',
    async act() {
      if (!begin(ctx, 'talk')) return;
      try {
        record('npc:master');
        if (await offerFlower(ctx, master, mname, 'master')) return;
        await mfolk.story(ctx, night(ctx));
        const me = who(ctx);
        if (stage === 'seeking') {
          await talk(ctx, master, mname, [L2(forCompanion(MASTER_FOUND, me))]);
          stage = 'note';
          record(SHUTONG_NOTE);
          marks();
          note();
          ctx.hud.toast('收下字条，带回给书童', 'Take the note back to the page boy', 2400);
        } else if (stage === 'note') {
          await talk(ctx, master, mname, [{ zh: '字条带到了吗？那孩子怕是等急了。', en: 'Did the note reach him? The boy must be anxious.' }]);
        } else if (stage === 'done') {
          await talk(ctx, master, mname, [{ zh: '多谢你把话带到。这山水，一个人看，终究少了点什么。', en: 'Thank you for carrying my word. Hills and water, seen alone, always lack something.' }]);
        } else {
          await talk(ctx, master, mname, [{ zh: '好景致啊……咦，我那书童呢？方才还在身后。', en: 'What a view… hm, where is my page boy? He was right behind me.' }]);
        }
      } finally { end(ctx, 'talk'); }
    },
  }));
});

export const PEOPLE = [peddler, storyteller, fortuneTeller, sugarStall, flowerGirl, oldFarmer, shutong];
