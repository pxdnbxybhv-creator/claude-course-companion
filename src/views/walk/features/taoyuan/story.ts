// 桃源记 · the director (story bible §2–§3). The door at the waterfall pool opens with 拾得's letter (or
// for an old guest of the 奇遇); B1 is the way in, B2 the mouth, B3 the feast, B4 the flower night's
// three errands, B5 the seal lost at midnight — where the case (case.ts, through hooks.ts) takes over,
// or is parked till daylight — B6 the two seals once the case is judged, B7 the spring, B8 the way out.
// Each beat saves `ty:<beat>` when it is over, so a world rebuilt mid-story resumes at the next one;
// the valley's hour (谷时) and who stands where follow from the flags (text.ts), on every way in.
//
// The thirteen villagers (folk.ts, bodied in stagehand.ts) can be talked to at any time between beats:
// the case is asked first (a testimony), then their own chat — introduced, rotating daily, a companion's
// own line, the 熟客 greeting with {名}.
import type * as T from 'three';
import type { Hud, Interactable, WorldCtx } from '../../types';
import type { CharacterId } from '../../../../data/characters';
import { ANCHORS as MAP_ANCHORS } from '../../map';
import { ENCOUNTER } from '../../../../data/encounters';
import { earnFrom, flag, markDay, markEncounter, play, record } from '../../../../app/play';
import { deliver, deliverDue, openMail } from '../../../../app/mail';
import { askName } from '../../../../app/nameAsk';
import { playerName } from '../../../../app/name';
import { toKey } from '../../../../core/date';
import { BRUSH_FONT, canvasTexture, feature, glowTexture, inked, loadBrush, type Bag } from '../kit';
import { merge, part } from '../geo';
import { taoyuan, type TaoyuanWorld } from './world';
import { engine } from './engine';
import { ANCHORS, CAVE, G, L, W, Y_T, standAt } from './places';
import { taoyuanHooks, type VillagerKey } from './hooks';
import { Cast, StoryStage, talkCount, worldAt } from './stagehand';
import { VILLAGERS, VILLAGER_KEYS, metFlag, partOf, spotOf, talkKey, talkPlan, STAGING, type Part } from './folk';
import { B1, B2, B3, B4, B5, B6, B7, B8, B8_COINS, LATER, OLD_GUEST, STELE, caseOpen, nextBeat, phaseOf, storyClock, type Beat, type SLine } from './text';

type XYZ = { x: number; y: number; z: number };
const flags = () => play.peek().flags;
const has = (k: string) => !!play.peek().flags[k];

export const taoyuanStory = feature('taoyuan-story', (bag, ctx) => {
  const found = taoyuan(ctx);
  if (!found) return;
  const tv: TaoyuanWorld = found;
  const day = toKey(ctx.env.date);
  const eng = engine(ctx);
  void loadBrush('秦汉魏晋过所桃花源' + B7.poemWords + STELE.text);

  /** The beat (or talk) under way, if any. */
  let running: string | null = null;
  /** B8's farewell has been said this visit (the way out closes the valley). */
  let farewellSaid = false;

  const cast = new Cast(bag, ctx, tv, {
    onTalk: (k) => talkTo(k),
    promptFor: (k) => storyPrompt(k),
    marked: (k) => marked(k),
  });
  const st = new StoryStage(ctx, ctx.regionGroup('taoyuan'), tv, cast);
  bag.onDispose(() => st.dispose());

  // ───────────── where everyone is

  const partNow = (): Part => {
    const tod = eng.moodTod();
    return tod === 'dawn' || tod === 'day' || tod === 'dusk' || tod === 'night' ? tod : partOf(ctx.env.hour);
  };
  const spotNow = (k: VillagerKey) => {
    if (k === 'yaoyao' && cast.yaoyaoGone) return null;
    return spotOf(k, phaseOf(flags()), partNow(), flags(), ctx.env.hour);
  };
  /** Put everyone where the story (or the hour) says. */
  function refresh(instant = false): void {
    if (!cast.built) return;
    for (const k of VILLAGER_KEYS) cast.setSpot(k, spotNow(k), { instant });
    props.sync();
    cast.relabel();
  }

  // ───────────── the altar, the jar, the lantern (as the night stands)

  const props = altarProps(ctx, bag, tv);

  // ───────────── the valley built: bodies for the villagers

  tv.onBuilt(() => {
    cast.build((k) => spotNow(k));
    refresh(true);
  });
  // every way in: the valley's hour where the story stands, everyone in place
  bag.onDispose(tv.onEnter(() => {
    cast.resetYaoyao();
    farewellSaid = false;
    tv.setClock(storyClock(flags()), { secs: 0 });
    tv.shrineDoor(props.doorOpen(), true);
    refresh(true);
  }));
  let acc = 0;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    if (!tv.isInside() || !cast.built) return;
    if (!running) refresh(false);
    remark();
    triggers();
  });

  // ───────────── the door and the way out

  tv.setDoorHandler(() => door());
  tv.setLeaveHandler(() => leave());
  bag.onDispose(() => { tv.setDoorHandler(null); tv.setLeaveHandler(null); });

  /** 「入光」 at the pool: B1 the first time, the plain way in after (the story resumes inside). */
  async function door(): Promise<void> {
    if (running || tv.moving) return;
    const f = flags();
    const who = ctx.player.character;
    const first = !f['ty:b1'];
    if (first && f['qy:taohua']) flag(OLD_GUEST);
    tv.setClock(storyClock(f), { secs: 0 });
    running = 'b1';
    try {
      if (first) await st.variant(B1.before, who);
      await tv.enter({ line: first ? B1.veil : undefined, onMouth: () => mouth() });
      if (!tv.isInside()) return;
      if (first) flag('ty:b1');
    } finally {
      running = null;
    }
    // the cleft: the companions' asides by the words on the rock; 嫦娥's light on the walls
    void cleft(who);
  }

  async function cleft(who: CharacterId): Promise<void> {
    const fx = tv.fx;
    let glow: T.Sprite | null = null;
    if (who === 'change' && fx) {
      glow = st.glow(new ctx.THREE.Vector3(), '#dfe8ff', 5, 0.35);
      const off = ctx.onFrame(() => {
        const p = ctx.player.position;
        glow!.position.set(p.x, p.y + 1.1, p.z);
        const l = L(p.x, p.z);
        if (l.z < CAVE.mouth - 1 || !tv.isInside()) { off(); if (glow) { st.bag.drop(glow); glow = null; } }
      });
      st.bag.onDispose(off);
    }
    if (!B1.cleft[who]) return;
    // wait for the words on the rock (or give up at the mouth)
    for (let i = 0; i < 400 && st.alive && tv.isInside(); i++) {
      const l = L(ctx.player.position.x, ctx.player.position.z);
      if (l.z < CAVE.words + 1) break;
      await st.wait(150);
    }
    const l = L(ctx.player.position.x, ctx.player.position.z);
    if (!st.alive || !tv.isInside() || l.z < CAVE.trigger + 1) return;
    await st.variant(B1.cleft, who);
  }

  /** At the inner mouth: B2 the first time; afterwards the valley just opens out. */
  async function mouth(): Promise<void> {
    if (!has('ty:b2')) { await run('b2', b2); return; }
    tv.hush(false);
    eng.arrive('taoyuan');
    const m = ANCHORS.mouth;
    tv.fx?.words(LATER.mouth, { x: m.x, y: m.y + 4.2, z: m.z - 8 }, { size: 1.1, life: 5, rise: 0.6 });
  }

  /** 「出谷」: B8's way out once the farewell is due; the plain way out otherwise. */
  async function leave(): Promise<void> {
    if (tv.moving) return;
    if (nextBeat(flags()) === 'b8' && !running) {
      if (!farewellSaid) await run('b8', b8talk);
      if (farewellSaid) { await b8exit(); return; }
    }
    if (running) return;
    await tv.leave();
  }

  // ───────────── running a beat

  /** Run a beat: the claim, the walker's hold and the camera are given back whatever happens. */
  async function run(id: string, fn: () => Promise<void>): Promise<void> {
    if (running && running !== 'b1') return;
    const was = running;
    running = id;
    // (a claim someone else holds — the case's judgement just ending — is waited for a little)
    for (let i = 0; i < 60 && !st.claim(); i++) await st.wait(150);
    if (!st.holding) { running = was; return; }
    try {
      await fn();
    } catch (e) {
      console.error('[walk] taoyuan story', id, e);
    } finally {
      st.endShot();
      st.hold(false);
      st.unclaim();
      running = was;
      for (const k of VILLAGER_KEYS) cast.script(k, false);
      refresh(false);
    }
  }
  const alive = () => st.alive;

  // ───────────── B2 · 豁然开朗

  async function b2(): Promise<void> {
    const who = st.who;
    const old = has(OLD_GUEST);
    cast.script('qin', true);
    cast.script('xiaoman', true);
    cast.stand('xiaoman', -0.6, 31, { x: -0.6, z: 26 });
    cast.stand('qin', -4.4, 21.5, { x: -3, z: 36 });
    // up the lane from the bridge, then along the bank to the mouth
    const qinComes = cast.walkTo('qin', -4.0, 30.5, 1.3).then((ok) => ok && cast.walkTo('qin', -0.3, 36.2, 1.3));
    await tv.mouthReveal();
    if (!alive()) return;
    eng.arrive('taoyuan');
    const firstCoins = markEncounter('taohua', ENCOUNTER.taohua?.coins ?? 200);
    st.hold(true);
    // 小满 sees you, drops the string, runs up
    cast.face('xiaoman');
    void st.shotOn('xiaoman', 1.4);
    await st.lines(B2.see, who);
    if (!alive()) return;
    cast.dropKite();
    st.endShot();
    const p = L(ctx.player.position.x, ctx.player.position.z);
    await cast.walkTo('xiaoman', p.x - 1.3, p.z - 1.4, 2.4);
    cast.face('xiaoman');
    await st.lines(B2.run, who);
    await st.variant(B2.runVariants, who);
    if (!alive()) return;
    // the elder, up from the bridge
    await Promise.race([qinComes, st.wait(9000)]);
    if (!alive()) return;
    const q = L(ctx.player.position.x, ctx.player.position.z);
    cast.stand('qin', q.x - 0.3, q.z - 2.1);
    cast.face('qin');
    void st.shotOn('qin', 1.2);
    if (old) {
      await st.lines(B2.askOld, who);
    } else {
      const k = await st.line(B2.ask, who);
      await st.line(B2.answer[k === 1 ? 1 : 0], who);
    }
    await st.variant(B2.variants, who);
    if (!alive()) return;
    // the name
    if (!playerName.peek()) {
      const k = await st.line({ ...(old ? B2.askNameOld : B2.askName), choices: B2.nameChoice }, who);
      if (!alive()) return;
      let name = '';
      if (k === 0) { st.endShot(); name = await askName(B2.askName.zh, B2.askName.en, 'valley'); }
      if (!alive()) return;
      void st.shotOn('qin', 0.8);
      await st.line(name ? B2.named : B2.nameless, who);
    } else {
      await st.line(old ? B2.askNameOld : B2.askName, who);
      await st.line(B2.named, who);
    }
    await st.line(B2.invite, who);
    if (!alive()) return;
    flag('ty:b2');
    if (firstCoins) { const c = B2.firstCoins(ENCOUNTER.taohua?.coins ?? 200); ctx.hud.toast(c.zh, c.en, 4200); }
  }

  // ───────────── B3 · 设酒杀鸡

  const QIN_TO_SQUARE: [number, number][] = [[-1.3, 36.6], [-4.0, 31], [-4.7, 23], [-3.9, 16], [-2.1, 9], [-0.3, 4.6], [1.9, 3.4], [2.5, -3.9], [4.4, -4.0]];

  async function b3(): Promise<void> {
    const who = st.who;
    // everyone to the tables (out of sight, up here on the terrace)
    for (const k of VILLAGER_KEYS) {
      if (k === 'qin' || k === 'yaoyao') continue;
      const s = STAGING.feast[k];
      cast.script(k, true);
      if (s) cast.stand(k, s.x, s.z, s.face, s.sit); else cast.hide(k);
    }
    cast.script('qin', true);
    ctx.hud.toast(B3.walk.zh, B3.walk.en, 4200);
    // he walks down to the square, waiting for you when you fall behind
    const t0 = performance.now();
    for (const [x, z] of QIN_TO_SQUARE) {
      if (!alive()) return;
      let going = cast.walkTo('qin', x, z, 1.5);
      for (;;) {
        const r = await Promise.race([going, st.wait(300).then(() => null)]);
        if (!alive()) return;
        if (r !== null) break;
        const d = Math.hypot(ctx.player.position.x - cast.position('qin').x, ctx.player.position.z - cast.position('qin').z);
        if (d > 11 && performance.now() - t0 < 80000) {
          // wait for them (he turns to look back)
          const at = cast.local('qin');
          cast.walkTo('qin', at.x, at.z, 0.01).catch(() => {});
          cast.face('qin');
          while (alive() && Math.hypot(ctx.player.position.x - cast.position('qin').x, ctx.player.position.z - cast.position('qin').z) > 7 && performance.now() - t0 < 80000) await st.wait(400);
          if (!alive()) return;
          going = cast.walkTo('qin', x, z, 1.5);
          continue;
        }
      }
    }
    if (!alive()) return;
    // too long behind: set down by the tables
    const sq = W(3.2, -5.4);
    if (Math.hypot(ctx.player.position.x - sq.x, ctx.player.position.z - sq.z) > 9) {
      await st.curtain(B3.catchUp.zh, B3.catchUp.en, () => { ctx.player.teleport(sq.x, sq.z, Math.atan2(4.6 - 3.2, 0 + 5.4), Y_T + standAt(3.2, -5.4)); eng.restream(); }, 500);
      if (!alive()) return;
    }
    cast.stand('qin', 4.6, -3.9, { x: 4.6, z: 0 });
    st.hold(true);
    cast.face('qin');
    await st.line(B3.intro, who);
    // the introductions: each in turn, the elder names them, they say a line
    for (const k of B3.order) {
      if (!alive()) return;
      flag(metFlag(k));
      void st.shotOn(k, 0.9);
      await st.line({ by: k, ...VILLAGERS[k].chat[0] }, who);
    }
    cast.relabel();
    if (!alive()) return;
    void st.shotOn('qin', 1);
    // 今是何世
    if (who === 'scholar') {
      await st.lines(B3.scholar, who);
      brushAges();
      await st.wait(2600);
      await st.lines(B3.told, who);
    } else {
      const k = await st.line(B3.question, who);
      if (k === 1) {
        void st.shotOn('duer', 0.9);
        await st.lines(B3.drink, who);
      } else {
        st.endShot();
        brushAges();
        await st.wait(2800);
        await st.lines(B3.told, who);
      }
    }
    if (!alive()) return;
    await st.variant(B3.variants, who);
    if (who === 'poet') void tv.fx?.petalBurst(ANCHORS.tables, { n: 220, up: 2.4, spread: 1.4, lit: true });
    // the floating cups (FX6)
    const cups = tv.fx?.floatCups();
    if (cups) {
      st.endShot();
      const stop = ANCHORS.cupStop;
      void st.shot({ x: stop.x - 2.6, y: stop.y + 1.9, z: stop.z + 2.4 }, { x: stop.x, y: stop.y + 0.2, z: stop.z }, 1.2);
      await Promise.race([cups.stopped, st.wait(14000)]);
    }
    if (!alive()) { cups?.done(); return; }
    const toast = await st.line(B3.cups, who);
    if (toast === 2) { cast.face('sang'); void st.shotOn('sang', 0.9); }
    await st.line(B3.cupsReply[toast < 0 ? 0 : toast], who);
    cups?.done();
    if (!alive()) return;
    // the announcement, and three faces
    void st.shotOn('qin', 1);
    await st.line(B3.announce, who);
    const faces: VillagerKey[] = ['sang', 'taoye', 'shigu'];
    for (let i = 0; i < faces.length; i++) {
      if (!alive()) return;
      void st.shotOn(faces[i], 0.8, 30, 2.6);
      if (faces[i] === 'shigu') { try { ctx.audio.pluck(-3, 0.8); } catch { /* muted */ } }
      await st.line(B3.shadows[i], who);
    }
    if (!alive()) return;
    tv.setClock('you', { secs: 4 });
    flag('ty:b3');
    ctx.hud.toast(B3.after.zh, B3.after.en, 4200);
  }

  function brushAges(): void {
    const fx = tv.fx;
    if (!fx) return;
    const c = ANCHORS.square;
    B3.ages.forEach((g, i) => {
      st.bag.later(i * 700, () => fx.words(g, { x: c.x + 2.2 + (i - 1.5) * 1.2, y: c.y + 3.2, z: c.z - 1.5 }, { size: 0.9, life: 4.2, rise: 0.5 }));
    });
    st.bag.later(4 * 700, () => fx.words('……', { x: c.x + 5.2, y: c.y + 3.0, z: c.z - 1.5 }, { size: 0.7, life: 3.5, rise: 0.4 }));
  }

  // ───────────── B4 · 花朝夜

  async function b4a(): Promise<void> {
    const who = st.who;
    tv.setClock('xu');
    cast.face('duer');
    void st.shotOn('duer', 1);
    await st.lines(B4.jarAsk, who);
    if (!alive()) return;
    st.endShot();
    // the jar in your hands, to the shrine
    const jar = props.carry();
    ctx.hud.toast(B4.carry.zh, B4.carry.en, 4200);
    // the elder and 柳婆 go ahead to the hall
    cast.script('qin', true); cast.script('liupo', true);
    cast.stand('qin', 0.3, -24.3, { x: 0, z: -22 });
    cast.stand('liupo', 1.1, -24.5, { x: 0, z: -25.6 });
    st.unclaim();
    const placed = await new Promise<boolean>((res) => {
      const d = ANCHORS.hallDoor;
      const it: Interactable = {
        id: 'ty:altar', position: new ctx.THREE.Vector3(d.x, d.y, d.z + 0.6), radius: 2.4,
        labelZh: B4.setLabel.zh, labelEn: B4.setLabel.en, actionZh: B4.setAct.zh, actionEn: B4.setAct.en,
        act: () => { off(); res(true); },
      };
      const off = st.prompt(it);
      st.bag.onDispose(() => res(false));
    });
    if (!placed || !alive()) { jar.drop(); return; }
    for (let i = 0; i < 200 && !st.claim(); i++) await st.wait(150);
    st.hold(true);
    await st.curtain(B4.setVeil.zh, B4.setVeil.en, () => {
      jar.drop();
      props.set('sealed');
      const c = W(0, -19.6);
      ctx.player.teleport(c.x, c.z, Math.PI, Y_T + standAt(0, -19.6));
      eng.faceView(Math.PI);
      cast.stand('qin', 0.5, -24.1, { x: 0, z: -25.6 });
    }, 400);
    if (!alive()) return;
    const a = ANCHORS.altar;
    void st.shot({ x: a.x + 0.6, y: a.y + 1.4, z: a.z + 3.2 }, { x: a.x, y: a.y + 0.2, z: a.z }, 1.4);
    props.lightIncense();
    await st.lines(B4.rite, who);
    if (!alive()) return;
    // everyone out, the doors shut on camera
    cast.stand('qin', 0.9, -21.2, { x: 0, z: -18 });
    cast.stand('liupo', -0.9, -21.1, { x: 0, z: -18 });
    const dd = ANCHORS.hallDoor;
    void st.shot({ x: dd.x + 1.8, y: dd.y + 1.7, z: dd.z + 4.2 }, { x: dd.x, y: dd.y + 1.3, z: dd.z }, 1);
    await st.wait(700);
    tv.shrineDoor(false);
    await st.wait(1300);
    if (!alive()) return;
    ctx.hud.toast(B4.memory.zh, B4.memory.en, 4600);
    flag('ty:b4a');
    await st.wait(1200);
    ctx.hud.toast(B4.after.zh, B4.after.en, 4200);
  }

  async function b4b(): Promise<void> {
    const who = st.who;
    tv.setClock('hai');
    cast.face('liupo');
    await st.line(B4.lanternAsk, who);
    if (!alive()) return;
    // across the courtyard to the hall door, together
    cast.script('liupo', true);
    const lp = cast.walkTo('liupo', -0.7, -21.7, 0.9);
    const hd = ANCHORS.hallDoor;
    const t0 = performance.now();
    while (alive() && Math.hypot(ctx.player.position.x - hd.x, ctx.player.position.z - (hd.z + 1)) > 2.2 && performance.now() - t0 < 40000) await st.wait(300);
    await Promise.race([lp, st.wait(6000)]);
    if (!alive()) return;
    st.hold(true);
    props.hangLantern();
    const lh = ANCHORS.lanternHook;
    void st.shot({ x: lh.x + 1.6, y: lh.y - 0.4, z: lh.z + 3.4 }, { x: lh.x - 0.4, y: lh.y - 0.6, z: lh.z }, 1.2);
    cast.face('liupo', L(hd.x, hd.z));
    const k = await st.line(B4.sniff, who);
    if (k === 0) await st.line(B4.rules, who);
    if (!alive()) return;
    if (who === 'cat') { await st.lines(B4.cat, who); flag('case:hz:catnose'); }
    flag('case:hz:c:menxiang');
    st.endShot();
    try { await tv.fx?.stamp(B4.menxiang); } catch { /* a nicety */ }
    if (!alive()) return;
    flag('ty:b4b');
    ctx.hud.toast(B4.after2.zh, B4.after2.en, 4600);
  }

  async function b4c(): Promise<void> {
    const who = st.who;
    st.hold(true);
    const fx = tv.fx;
    const dancers = B4.dancers;
    for (const k of dancers) cast.script(k, true);
    // the drum, the ring
    try { ctx.audio.pluck(-5, 0.9); } catch { /* muted */ }
    const pole = ANCHORS.square;
    void st.shot({ x: pole.x - 6.5, y: pole.y + 3.2, z: pole.z + 6.5 }, { x: pole.x, y: pole.y + 1.4, z: pole.z }, 1.4);
    await st.line(B4.dance, who);
    if (!alive()) return;
    const figs = dancers.map((k) => cast.fig(k)).filter((f): f is NonNullable<typeof f> => !!f);
    const stopRibbons = fx ? fx.ribbons(figs) : () => {};
    const R = 3.4;
    let a0 = 0;
    const off = ctx.onFrame((dt) => {
      a0 += dt * (st.still ? 0 : 0.42);
      dancers.forEach((k, i) => {
        const a = a0 + (i / dancers.length) * Math.PI * 2;
        const x = Math.sin(a) * R, z = Math.cos(a) * R;
        const f = cast.fig(k);
        if (!f) return;
        const w = worldAt(x, z);
        f.root.position.set(w.x, w.y, w.z);
        f.root.rotation.y = a + Math.PI / 2;
        f.walking = st.still ? 0 : 0.8;
        f.faceTo = null;
      });
    });
    st.bag.onDispose(off);
    // the companions' part in it
    let moonBack: (() => void) | null = null;
    if (who === 'musician') { flag('ty:zhiyin'); try { ctx.player.emote('play'); } catch { /* ok */ } }
    if (who === 'gardener' && fx) void fx.petalBurst(ANCHORS.poleTop, { n: 260, up: 1.6, spread: 1.2, lit: true });
    if (who === 'rabbit') { try { ctx.player.emote('jump'); } catch { /* ok */ } }
    if (who === 'change') { try { ctx.sky.setMoon({ glow: 1.8, scale: 1.4 }); moonBack = () => ctx.sky.setMoon({ glow: 1, scale: 1 }); } catch { /* ok */ } }
    await st.wait(2600);
    void st.shotOn('sang', 1, 30, 3.8);
    await st.wait(3200);
    st.endShot();
    void st.shot({ x: pole.x + 7, y: pole.y + 4, z: pole.z - 5 }, { x: pole.x, y: pole.y + 1.2, z: pole.z }, 2.4);
    await st.variant(B4.variants, who);
    await st.wait(3600);
    off();
    stopRibbons();
    moonBack?.();
    for (const k of dancers) { const f = cast.fig(k); if (f) f.walking = 0; }
    if (!alive()) return;
    flag('ty:b4c');
  }

  // ───────────── B5 · 子正失印

  async function b5(): Promise<void> {
    const who = st.who;
    const fx = tv.fx;
    st.hold(true);
    if (!has('ty:b5s')) {
      tv.setClock('zi');
      const sq = ANCHORS.square;
      if (fx) {
        void st.shot({ x: sq.x + 5, y: sq.y + 2, z: sq.z + 7 }, { x: sq.x, y: sq.y + 9, z: sq.z - 3 }, 1.6);
        ctx.hud.toast(B5.lanterns.zh, B5.lanterns.en, 3600);
        void fx.skyLanterns({ n: 40 });
        await st.wait(2200);
        void fx.petalBurst(sq, { n: 600, up: 4.2, spread: 2.4, lit: true });
        await st.wait(4200);
      }
      if (!alive()) return;
      st.endShot();
      // the procession to the shrine; at 子正 the hall is opened
      await st.curtain(B5.procession.zh, B5.procession.en, () => {
        for (const k of VILLAGER_KEYS) {
          const s = STAGING.zi[k];
          cast.script(k, true);
          if (s) cast.stand(k, s.x, s.z, s.face, s.sit); else cast.hide(k);
        }
        const c = W(0, -18.6);
        ctx.player.teleport(c.x, c.z, Math.PI, Y_T + standAt(0, -18.6));
        eng.faceView(Math.PI);
        tv.shrineDoor(true, true);
        props.set('broken');
      }, 600);
      if (!alive()) return;
      const a = ANCHORS.altar;
      void st.shot({ x: a.x - 0.4, y: a.y + 1.2, z: a.z + 4.4 }, { x: a.x, y: a.y - 0.2, z: a.z }, 1.8);
      await st.wait(1600);
      await st.line(B5.found, who);
      if (!alive()) return;
      void st.shotOn('liupo', 0.8);
      await st.line(B5.outcry[0], who);
      void st.shotOn('guiniang', 0.8);
      await st.line(B5.outcry[1], who);
      void st.shotOn('duer', 0.8);
      await st.line(B5.outcry[2], who);
      if (who === 'guan') await st.lines(B5.guan, who);
      void st.shotOn('ruan', 0.8);
      await st.lines(B5.ruan, who);
      await st.variant(B5.variants, who);
      if (!alive()) return;
      flag('ty:b5s');
      // the unsigned letter
      st.endShot();
      await bluebird();
      if (!alive()) return;
      if (deliver('ty-wuming')) toastAction(ctx.hud, B5.bird, B5.read, () => openMail('ty-wuming'));
      else ctx.hud.toast(B5.bird.zh, B5.bird.en, 3600);
      await st.wait(1200);
      // FX11: the petals stop in the air
      tv.setClock('case', { secs: 3 });
      await st.wait(1400);
      await voice(B5.voice);
      if (!alive()) return;
    } else {
      cast.face('qin');
      await st.line(B5.again, who);
    }
    // the choice
    cast.face('qin');
    void st.shotOn('qin', 1);
    const k = await st.line(B5.choice, who);
    if (!alive() || k < 0) return;
    if (k === 0 && taoyuanHooks.case) {
      await st.line(B5.judge, who);
      if (!alive()) return;
      flag('case:hz:open');
      flag('ty:b5');
      props.set('none');
      try { taoyuanHooks.case.start({ resumed: false }); } catch (e) { console.error('[walk] taoyuan case start', e); }
      return;
    }
    // 且待天明 (or no case to open yet): the courtyard left unswept, and dawn
    await st.line(B5.wait, who);
    if (!alive()) return;
    flag('case:hz:parked');
    flag('ty:b5');
    st.endShot();
    await tv.da();
    if (!alive()) return;
    tv.setClock('mao', { secs: 0 });
    ctx.hud.toast(B6.spring.zh, B6.spring.en, 4600);
  }

  /** A bluebird from 石瞽's porch to your shoulder. */
  async function bluebird(): Promise<void> {
    const TH = ctx.THREE;
    const g = merge(TH, [
      part(TH, new TH.SphereGeometry(0.07, 8, 6), '#3d6fb0', { s: [1, 0.9, 1.4] }),
      part(TH, new TH.SphereGeometry(0.045, 8, 6), '#4f86c6', { p: [0, 0.05, 0.08] }),
      part(TH, new TH.ConeGeometry(0.02, 0.05, 4), '#e8b04a', { p: [0, 0.05, 0.14], r: [Math.PI / 2, 0, 0] }),
      part(TH, new TH.BoxGeometry(0.06, 0.01, 0.12), '#2b4f82', { p: [0, 0.01, -0.12] }),
    ]);
    const bird = inked(ctx, g, { width: 0.006 });
    st.bag.add(bird, st.group);
    const from = worldAt(-12.1, -13.2);
    const p = ctx.player.position;
    const start = new TH.Vector3(from.x, from.y + 3, from.z);
    const k0 = performance.now();
    const dur = st.still ? 300 : 2400;
    await new Promise<void>((res) => {
      const off = ctx.onFrame(() => {
        const k = Math.min(1, (performance.now() - k0) / dur);
        const e = 1 - Math.pow(1 - k, 2);
        const to = new TH.Vector3(p.x + 0.22, p.y + 1.25, p.z);
        bird.position.lerpVectors(start, to, e);
        bird.position.y += Math.sin(k * Math.PI) * 1.4;
        bird.lookAt(to);
        if (k >= 1) { off(); res(); }
      });
      st.bag.onDispose(() => { off(); res(); });
    });
    st.bag.later(4200, () => { if (!st.bag.disposed) st.bag.drop(bird); });
  }

  /** A voice with no speaker, in pale pink (never brushed: the walk's own face). */
  async function voice(l: { zh: string; en: string }): Promise<void> {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.textContent = st.tr(l.zh, l.en);
    Object.assign(el.style, {
      position: 'absolute', left: '0', right: '0', top: '36%', textAlign: 'center', pointerEvents: 'none',
      color: '#f7c6d2', fontSize: 'clamp(18px, 3.4vw, 26px)', letterSpacing: '0.12em', fontFamily: '"LXGW WenKai", "Cormorant Garamond", serif',
      textShadow: '0 0 12px rgba(40, 20, 40, 0.65), 0 0 2px rgba(0,0,0,0.5)', opacity: '0', transition: 'opacity 1.2s ease', padding: '0 16px',
    } as Partial<CSSStyleDeclaration>);
    const off = ctx.hud.mount(el);
    st.bag.onDispose(off);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
    await st.wait(3400);
    el.style.opacity = '0';
    await st.wait(1300);
    off();
  }

  // ───────────── B6 · 双印 (the case judged)

  async function b6(grade: string): Promise<void> {
    const who = st.who;
    const late = has('ty:b8');
    st.hold(true);
    if (tv.clock !== 'case') tv.setClock('case', { secs: 1.5 });
    // the courtyard: 三娘 before the hall, the elder at the door, the two with their passes
    const place: [VillagerKey, number, number][] = [['sang', -0.4, -20.4], ['qin', 0.3, -21.6], ['ruan', 1.8, -19.7], ['taoye', -2.0, -19.5], ['liupo', -2.7, -20.9], ['guiniang', 2.7, -20.8], ['duer', 3.0, -18.8], ['xiaoman', 2.2, -18.2]];
    for (const [k, x, z] of place) { cast.script(k, true); cast.stand(k, x, z, { x: 0, z: -19.4 }); }
    void st.shotOn('sang', 1.2);
    await st.lines(B6.confess, who);
    if (!alive()) return;
    if (has('case:hz:c:bu')) await st.line({ ...B6.remember, choices: [B6.register] }, who);
    void st.shotOn('qin', 0.9);
    await st.line(B6.qin, who);
    void st.shotOn('sang', 0.9);
    await st.line(B6.pause, who);
    if (!alive()) return;
    await st.line(has('case:hz:seal') ? B6.handSeal : B6.fetchSeal, who);
    // the stampings
    void st.shotOn('ruan', 0.9);
    await st.line(B6.stampRuan, who);
    const r = cast.position('ruan');
    tv.fx?.words('过所', { x: r.x, y: r.y + 2.3, z: r.z }, { size: 0.8, life: 4, rise: 0.6 });
    void st.shotOn('taoye', 0.9);
    await st.line(B6.taoye, who);
    void st.shotOn('sang', 0.9);
    await st.line(B6.go, who);
    void st.shotOn('taoye', 0.9);
    await st.line(B6.stampTaoye, who);
    const ty = cast.position('taoye');
    tv.fx?.words('过所', { x: ty.x, y: ty.y + 2.3, z: ty.z }, { size: 0.8, life: 4, rise: 0.6 });
    if (!alive()) return;
    await st.wait(1200);
    // 嗒 — and the dawn
    st.endShot();
    const hd = ANCHORS.hallDoor;
    void st.shot({ x: hd.x + 3, y: hd.y + 2.2, z: hd.z + 6 }, { x: hd.x, y: hd.y + 1, z: hd.z }, 1.2);
    await tv.da();
    if (!alive()) return;
    st.endShot();
    await st.variant(B6.codas, who);
    if (!alive()) return;
    flag('ty:b6');
    void grade;
    ctx.hud.toast(B6.dawn.zh, B6.dawn.en, 4200);
    // they go out, with their stamped passes
    cast.leave('ruan', 0.5, 38.6);
    cast.leave('taoye', -0.5, 38.6);
    if (late) {
      await st.wait(6000);
      tv.setClock('chang', { secs: 8 });
      ctx.hud.toast(LATER.after.zh, LATER.after.en, 4200);
    } else {
      await st.wait(1600);
      ctx.hud.toast(B6.spring.zh, B6.spring.en, 4600);
    }
  }

  // ───────────── B7 · 源

  async function b7(): Promise<void> {
    const who = st.who;
    const fx = tv.fx;
    st.hold(true);
    const sp = ANCHORS.spring;
    void st.shot({ x: sp.x + 2.2, y: sp.y + 2.2, z: sp.z + 6.5 }, { x: sp.x, y: sp.y + 1.3, z: sp.z }, 1.6);
    const y = fx?.gatherFigure({ at: sp });
    if (y) await Promise.race([y.formed, st.wait(9000)]);
    if (!alive()) { y?.remove(); return; }
    flag(metFlag('yaoyao'));
    await st.lines(B7.lines, who);
    let k = -1;
    for (let i = 0; i < 3 && k < 0 && alive(); i++) k = await st.line(B7.ask, who);
    if (!alive()) { y?.remove(); return; }
    if (k < 0) k = 0;
    await st.line(B7.replies[k], who);
    flag(B7.wishes[k]);
    await st.variant(B7.variants, who);
    if (who === 'taoist') { flag('ty:peach'); ctx.hud.toast(B7.peach.zh, B7.peach.en, 3600); }
    if (who === 'poet' && fx) {
      fx.words(B7.poemWords, { x: sp.x, y: sp.y + 0.8, z: sp.z + 1.4 }, { size: 0.55, life: 6, rise: 0.3 });
      void fx.petalBurst({ x: sp.x, y: sp.y + 0.4, z: sp.z + 2 }, { n: 120, up: 0.5, spread: 1, lit: true, wind: { x: 0, z: 2.4 } });
    }
    if (!alive()) { y?.remove(); return; }
    if (y) await y.burst();
    if (!alive()) return;
    flag('ty:b7');
    ctx.hud.toast(B7.after.zh, B7.after.en, 4200);
  }

  // ───────────── B8 · 既出

  async function b8talk(): Promise<void> {
    const who = st.who;
    st.hold(true);
    cast.face('xiaoman');
    void st.shotOn('xiaoman', 1.2);
    await st.line(B8.gift, who);
    if (!alive()) return;
    ctx.hud.toast(B8.hook.zh, B8.hook.en, 3200);
    await st.variant({ fisher: B8.fisher }, who);
    cast.face('qin');
    void st.shotOn('qin', 1);
    await st.line(B8.farewell, who);
    if (!alive()) return;
    farewellSaid = true;
    ctx.hud.toast(B8.go.zh, B8.go.en, 4200);
  }

  async function b8exit(): Promise<void> {
    if (tv.moving || has('ty:b8')) return;
    // (the keepsake, the coins, the day it closed — then the way shuts behind you)
    flag('item:keep:wulinggou');
    earnFrom('taoyuan', B8_COINS);
    markDay('ty:b8');
    flag('ty:b8');
    const rw = B8.rewards(B8_COINS);
    await tv.leave({ close: true, line: B8.line, card: { ...B8.card, bodyZh: `${B8.card.bodyZh}\n\n${rw.zh}`, bodyEn: `${B8.card.bodyEn}\n\n${rw.en}` } });
    try { deliverDue(); } catch { /* the box is optional */ }
  }

  // ───────────── the case (parked, taken up again; the judgement's prompt)

  async function oldCase(): Promise<void> {
    const who = st.who;
    cast.face('qin');
    const k = await st.line(LATER.oldCaseAsk, who);
    if (k !== 0 || !alive() || !taoyuanHooks.case) return;
    await st.line(LATER.oldCaseYes, who);
    if (!alive()) return;
    flag('case:hz:open');
    tv.setClock('case', { secs: 3 });
    try { taoyuanHooks.case.start({ resumed: true }); } catch (e) { console.error('[walk] taoyuan case resume', e); }
  }

  async function notYet(): Promise<void> {
    const who = st.who;
    const r = taoyuanHooks.case?.ready();
    cast.face('qin');
    await st.line({ by: 'qin', ...VILLAGERS.qin.caseLine! }, who);
    if (r && r.missing > 0) { const m = LATER.missing(r.missing); await st.line({ by: 'narr', ...m }, who); }
  }

  // ───────────── the prompts on people, the triggers by place

  /** The story's own prompt on someone now (the next beat's), or null for their chat. */
  function storyPrompt(k: VillagerKey): { label: { zh: string; en: string }; action: { zh: string; en: string }; act(): void | Promise<void> } | null {
    const f = flags();
    const n = nextBeat(f);
    const met = !!f[metFlag(k)];
    const label = met ? { zh: VILLAGERS[k].zh, en: VILLAGERS[k].en } : VILLAGERS[k].epithet;
    if (k === 'qin') {
      if (n === 'b3' && f['ty:b2']) return { label, action: B2.follow, act: () => run('b3', b3) };
      if (n === 'b5') return f['ty:b5s'] ? { label: B5.choiceLabel, action: B5.choiceAct, act: () => run('b5', b5) } : { label: B5.gatherLabel, action: B5.gatherAct, act: () => run('b5', b5) };
      if (caseOpen(f) && taoyuanHooks.case) {
        let ok = false;
        try { ok = taoyuanHooks.case.ready().ok; } catch { ok = false; }
        return ok
          ? { label, action: LATER.gather, act: () => judge() }
          : { label, action: LATER.notYet, act: () => run('notyet', notYet) };
      }
      if (f['ty:b8'] && f['case:hz:parked'] && !f['case:hz:solved'] && !f['case:hz:open'] && taoyuanHooks.case) {
        return { label, action: LATER.oldCase, act: () => run('oldcase', oldCase) };
      }
    }
    if (k === 'duer' && n === 'b4a') return { label: B4.jarLabel, action: B4.jarAct, act: () => run('b4a', b4a) };
    if (k === 'liupo' && n === 'b4b') return { label: B4.lanternLabel, action: B4.lanternAct, act: () => run('b4b', b4b) };
    return null;
  }

  async function judge(): Promise<void> {
    if (running) return;
    const c = taoyuanHooks.case;
    if (!c) return;
    try { await c.judge(); } catch (e) { console.error('[walk] taoyuan judgement', e); }
  }

  /** Who shows their mark (worked out once a second: the next beat's carrier; in ordinary days, whoever you have never talked to). */
  let marks = new Set<VillagerKey>();
  function marked(k: VillagerKey): boolean {
    return !st.holding && !running && marks.has(k);
  }
  function remark(): void {
    const next = new Set<VillagerKey>();
    const chang = phaseOf(flags()) === 'chang';
    for (const k of VILLAGER_KEYS) if (storyPrompt(k) || (chang && talkCount(k).total === 0)) next.add(k);
    marks = next;
  }

  /** Beats that begin where you stand: the dance at the square, the spring's light, the farewell. */
  function triggers(): void {
    if (running || st.holding || ctx.player.isFrozen) return;
    const f = flags();
    const n = nextBeat(f);
    const p = ctx.player.position;
    const near = (a: XYZ, r: number) => Math.hypot(p.x - a.x, p.z - a.z) < r && Math.abs(p.y - a.y) < 4;
    if (n === 'b4c' && near(ANCHORS.square, 7.5)) void (async () => { await run('b4c', b4c); if (alive() && has('ty:b4c') && !has('ty:b5')) await run('b5', b5); })();
    else if (n === 'b8' && !farewellSaid && near(ANCHORS.terrace, 6.5)) void run('b8', b8talk);
    springLight(n === 'b7');
  }

  // the light at the spring (B7's prompt)
  let spring: { off: () => void; glow: T.Sprite } | null = null;
  function springLight(on: boolean): void {
    if (on && !spring) {
      const sp = ANCHORS.spring;
      const glow = st.glow(new ctx.THREE.Vector3(sp.x, sp.y + 0.9, sp.z), '#ffe3ec', 3.2, 0.6);
      const off = st.prompt({
        id: 'ty:spring', position: new ctx.THREE.Vector3(sp.x, sp.y, sp.z + 2.8), radius: 3.2,
        labelZh: B7.label.zh, labelEn: B7.label.en, actionZh: B7.act.zh, actionEn: B7.act.en,
        act: () => run('b7', b7),
      });
      spring = { off, glow };
    } else if (!on && spring) {
      spring.off();
      st.bag.drop(spring.glow);
      spring = null;
    }
  }

  // ───────────── talk

  async function talkTo(k: VillagerKey): Promise<void> {
    const prev = running;
    // (between beats; or while the jar is carried to the shrine)
    if (prev && !(prev === 'b4a' && !st.holding)) return;
    if (!st.claim()) return;
    running = prev ?? 'talk';
    const who = st.who;
    try {
      // the case's first (a testimony, a confrontation)
      let ct: (() => Promise<void>) | null = null;
      try { ct = taoyuanHooks.case?.talk(k, who) ?? null; } catch (e) { console.error('[walk] taoyuan case talk', e); }
      if (ct) { cast.face(k); record(talkKey(k)); await ct(); return; }
      const c = talkCount(k);
      const plan = talkPlan(k, who, { flags: flags(), total: c.total, today: c.today, day });
      if (plan.meet) flag(metFlag(k));
      record(talkKey(k));
      cast.face(k);
      for (const l of plan.lines) {
        if (!alive()) return;
        const sl: SLine = l.by === 'me' ? { by: 'me', zh: l.zh, en: l.en } : { by: k, zh: l.zh, en: l.en };
        await st.line(sl, who);
      }
    } finally {
      st.unclaim();
      running = prev;
      cast.relabel();
    }
  }

  // ───────────── the hooks the case uses

  const hooks = {
    solved: (grade: 'shen' | 'ming' | 'ping' | 'zibai') => { void run('b6', () => b6(grade)); },
    villager: (k: VillagerKey) => cast.handle(k),
  };
  taoyuanHooks.story = hooks;
  bag.onDispose(() => { if (taoyuanHooks.story === hooks) taoyuanHooks.story = null; });

  // ───────────── outside: the stele by the pool, after the case (§4.10)

  stele(bag, ctx);

  // ───────────── DEV: window.__tystory

  if (import.meta.env.DEV) {
    const w = window as unknown as { __tystory?: unknown };
    w.__tystory = {
      flags: () => Object.keys(flags()).filter((k) => k.startsWith('ty:') || k.startsWith('case:') || k.startsWith('met:ty.') || k === 'qy:taohua' || k.startsWith('item:keep')),
      next: () => nextBeat(flags()),
      phase: () => phaseOf(flags()),
      running: () => running,
      farewell: () => farewellSaid,
      run: (b: Beat) => {
        const fns: Record<string, () => Promise<void>> = { b2, b3, b4a, b4b, b4c, b5, b7, b8: b8talk };
        if (b === 'b6') return run('b6', () => b6('ming'));
        return fns[b] ? run(b, fns[b]) : null;
      },
      exit: () => b8exit(),
      door: () => door(),
      talk: (k: VillagerKey) => talkTo(k),
      prompt: (k: VillagerKey) => storyPrompt(k),
      act: (k: VillagerKey) => { const s = storyPrompt(k); return s ? s.act() : talkTo(k); },
      cast: () => VILLAGER_KEYS.map((k) => ({ k, shown: cast.isShown(k), at: cast.local(k), world: cast.position(k) })),
      refresh: () => refresh(true),
      props: () => props.state(),
    };
    bag.onDispose(() => { if (w.__tystory) delete w.__tystory; });
  }
});

export const TAOYUAN_FEATURES = [taoyuanStory];

// ───────────────────────────── a toast with an action (the hud's own, if the core lends it)

function toastAction(hud: Hud, l: { zh: string; en: string }, a: { zh: string; en: string }, run: () => void): void {
  const h = hud as Hud & { toastAction?: (zh: string, en: string, action: { zh: string; en: string; run: () => void }) => void };
  if (h.toastAction) { h.toastAction(l.zh, l.en, { ...a, run }); return; }
  // (a core without it: a toast of our own, with its button)
  const el = document.createElement('div');
  el.className = 'walk-toast';
  el.setAttribute('role', 'status');
  const lang = document.documentElement.lang?.startsWith('en') ? 'en' : 'zh';
  const s = document.createElement('span');
  s.textContent = lang === 'en' ? l.en : l.zh;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = lang === 'en' ? a.en : a.zh;
  el.append(s, b);
  const off = hud.mount(el);
  const t = setTimeout(off, 6000);
  b.addEventListener('click', () => { clearTimeout(t); off(); run(); });
}

// ───────────────────────────── the altar's things through the night

type AltarState = 'none' | 'sealed' | 'broken';

/** The jar, the lacquer box, the incense seal and the guest lantern, as the night stands (B4–B5). */
function altarProps(ctx: WorldCtx, bag: Bag, tv: TaoyuanWorld) {
  const TH = ctx.THREE;
  let group: T.Group | null = null;
  let state: AltarState = 'none';
  let lantern: T.Object3D | null = null;
  let incense: ReturnType<NonNullable<TaoyuanWorld['fx']>['incenseSeal']> | null = null;
  const parent = () => ctx.regionGroup('taoyuan');

  const jarGeo = () => merge(TH, [
    part(TH, new TH.SphereGeometry(0.2, 12, 9), '#5e4330', { s: [1, 1.2, 1] }),
    part(TH, new TH.CylinderGeometry(0.1, 0.12, 0.08, 10), '#5e4330', { p: [0, 0.25, 0] }),
    part(TH, new TH.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#9b7a58', { p: [0, 0.27, 0], s: [1, 0.7, 1] }),
    part(TH, new TH.BoxGeometry(0.16, 0.12, 0.01), '#c0392b', { p: [0, 0.02, 0.2] }),
  ]);
  const boxGeo = (open: boolean) => merge(TH, [
    part(TH, new TH.BoxGeometry(0.34, 0.14, 0.24), '#2a1a16', { p: [0, 0.07, 0] }),
    open
      ? part(TH, new TH.BoxGeometry(0.34, 0.04, 0.24), '#7a1f1a', { p: [0.36, 0.02, 0.06], r: [0, 0.4, 0] })
      : part(TH, new TH.BoxGeometry(0.35, 0.05, 0.25), '#7a1f1a', { p: [0, 0.165, 0] }),
    ...(open ? [] : [part(TH, new TH.CylinderGeometry(0.05, 0.05, 0.02, 10), '#a88a64', { p: [0, 0.2, 0] })]),
  ]);
  const shardsGeo = () => {
    const P: T.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      P.push(part(TH, new TH.SphereGeometry(0.12, 6, 4, 0, 1.4, 0, 1.2), '#5e4330', { p: [Math.cos(a) * (0.2 + (i % 3) * 0.12), 0.03, Math.sin(a) * (0.16 + (i % 2) * 0.1)], r: [Math.PI / 2 + (i % 3) * 0.4, a, 0] }));
    }
    P.push(part(TH, new TH.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#9b7a58', { p: [0.5, 0.02, 0.2], s: [1, 0.7, 1] }));
    P.push(part(TH, new TH.CircleGeometry(0.62, 18), '#3b2a22', { p: [0.05, 0.012, 0.02], r: [-Math.PI / 2, 0, 0] }));
    return merge(TH, P);
  };

  function clear(): void {
    if (group) { group.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) m.geometry.dispose(); }); group.removeFromParent(); group = null; }
    incense?.remove();
    incense = null;
  }
  function set(s: AltarState): void {
    if (s === state && (s === 'none' || group)) return;
    clear();
    state = s;
    if (s === 'none' || !tv.fx) return;
    group = new TH.Group();
    group.name = 'ty:altar-props';
    const a = ANCHORS.altar;
    if (s === 'sealed') {
      const jar = inked(ctx, jarGeo(), { width: 0.008 });
      jar.position.set(a.x + 0.55, a.y, a.z - 0.05);
      group.add(jar);
    } else {
      const sh = inked(ctx, shardsGeo(), { width: 0 });
      const s0 = ANCHORS.shards;
      sh.position.set(s0.x, s0.y, s0.z);
      group.add(sh);
    }
    const box = inked(ctx, boxGeo(s === 'broken'), { width: 0.006 });
    box.position.set(a.x - 0.25, a.y, a.z - 0.1);
    group.add(box);
    parent().add(group);
    incense = tv.fx.incenseSeal();
    if (s === 'sealed') {
      // lit at the 戌 pin, burning on through the night
      const p = phaseOf(play.peek().flags);
      void incense.setProgress(incense.pins[p === 'hai' ? 3 : p === 'zi' ? 4 : 0]);
    } else {
      incense.wet(incense.pins[4]);
      void incense.setProgress(incense.pins[4]);
      incense.ember(false);
      incense.smoke(false);
    }
  }
  function hangLantern(): void {
    if (lantern) return;
    const g = new TH.Group();
    const body = inked(ctx, merge(TH, [
      part(TH, new TH.SphereGeometry(0.2, 10, 8), '#e2553f', { s: [1, 1.2, 1] }),
      part(TH, new TH.CylinderGeometry(0.08, 0.08, 0.05, 8), '#2a2320', { p: [0, 0.25, 0] }),
      part(TH, new TH.CylinderGeometry(0.08, 0.08, 0.05, 8), '#2a2320', { p: [0, -0.25, 0] }),
    ]), { width: 0.008 });
    g.add(body);
    const tex = glowTexture(TH, 64, 0.1);
    const s = new TH.Sprite(new TH.SpriteMaterial({ map: tex, color: '#ffb46b', transparent: true, opacity: 0.65, depthWrite: false, blending: TH.AdditiveBlending, fog: false }));
    s.scale.setScalar(1.6);
    g.add(s);
    const h = ANCHORS.lanternHook;
    g.position.set(h.x, h.y - 0.3, h.z + 0.2);
    g.name = 'ty:guest-lantern';
    parent().add(g);
    lantern = g;
    bag.onDispose(() => tex.dispose());
  }
  let doorLamp: T.Object3D | null = null;
  /** After the stele is read, a lantern burns on 三娘's doorstep ever after. */
  function sangLamp(): void {
    if (doorLamp || !play.peek().flags['ty:stele']) return;
    const tex = glowTexture(TH, 64, 0.1);
    const g = new TH.Group();
    g.add(inked(ctx, merge(TH, [
      part(TH, new TH.CylinderGeometry(0.012, 0.012, 1.3, 5), '#4a3526', { p: [0, 0.65, 0] }),
      part(TH, new TH.SphereGeometry(0.15, 10, 8), '#e2553f', { p: [0.16, 1.2, 0], s: [1, 1.2, 1] }),
    ]), { width: 0.006 }));
    const s = new TH.Sprite(new TH.SpriteMaterial({ map: tex, color: '#ffb46b', transparent: true, opacity: 0.6, depthWrite: false, blending: TH.AdditiveBlending, fog: false }));
    s.position.set(0.16, 1.2, 0);
    s.scale.setScalar(1.3);
    g.add(s);
    const w = worldAt(-20.9, 3.6);
    g.position.set(w.x, w.y, w.z);
    g.name = 'ty:sang-lamp';
    parent().add(g);
    doorLamp = g;
    bag.onDispose(() => { g.removeFromParent(); tex.dispose(); });
  }
  function sync(): void {
    sangLamp();
    const f = play.peek().flags;
    const ph = phaseOf(f);
    const want: AltarState = ph === 'xu' || ph === 'hai' || (ph === 'zi' && !f['ty:b5s']) ? 'sealed' : ph === 'zi' ? 'broken' : 'none';
    set(want);
    if ((ph === 'hai' || ph === 'zi' || (f['ty:b4b'] && !f['ty:b6'] && !f['ty:b8'])) && !lantern && f['ty:b4b']) hangLantern();
  }
  bag.onDispose(() => { clear(); lantern?.removeFromParent(); });

  // the jar in the walker's arms (B4a)
  function carry(): { drop(): void } {
    const jar = inked(ctx, jarGeo(), { width: 0.008 });
    jar.scale.setScalar(0.9);
    parent().add(jar);
    let hand: T.Object3D | null = null;
    try { hand = ctx.player.holdProp('jar'); } catch { hand = null; }
    const v = new TH.Vector3();
    const off = ctx.onFrame(() => {
      const p = ctx.player.position, h = ctx.player.heading;
      if (hand) { hand.getWorldPosition(v); jar.position.set(v.x, v.y - 0.12, v.z); }
      else jar.position.set(p.x + Math.sin(h) * 0.4, p.y + 0.55, p.z + Math.cos(h) * 0.4);
      jar.rotation.y = h;
    });
    let gone = false;
    const drop = () => {
      if (gone) return;
      gone = true;
      off();
      jar.removeFromParent();
      jar.geometry.dispose();
      try { ctx.player.holdProp(null); } catch { /* the world went */ }
    };
    bag.onDispose(drop);
    return { drop };
  }

  return {
    set, sync, carry, hangLantern,
    lightIncense: () => { if (incense) void incense.setProgress(incense.pins[0] + 0.01, 1.5); },
    /** The hall stands shut from the rite to 子正 (祭后闭殿，子正方开). */
    doorOpen: () => { const f = play.peek().flags; const ph = phaseOf(f); return !(ph === 'xu' || ph === 'hai' || (ph === 'zi' && !f['ty:b5s'])); },
    state: () => ({ state, lantern: !!lantern, incense: !!incense }),
  };
}

// ───────────────────────────── the stele by the pool (after the case is judged)

function stele(bag: Bag, ctx: WorldCtx): void {
  const TH = ctx.THREE;
  const pool = MAP_ANCHORS.waterfallPool;
  let built = false;
  const build = () => {
    if (built || !play.peek().flags['case:hz:solved']) return;
    built = true;
    // a spot on the bank beside the pool, off the door's own place
    let sx = pool.x + 3.4, sz = pool.z + 1.2;
    for (let k = 0; k < 24 && !ctx.isWalkable(sx, sz); k++) { const a = k * 2.2; sx = pool.x + Math.cos(a) * (3 + k * 0.2); sz = pool.z + Math.sin(a) * (3 + k * 0.2); }
    const sy = ctx.groundY(sx, sz);
    const g = new TH.Group();
    g.name = 'ty:stele';
    const stone = inked(ctx, merge(TH, [
      part(TH, new TH.BoxGeometry(0.62, 1.5, 0.2), '#7d8378', { p: [0, 0.75, 0] }),
      part(TH, new TH.BoxGeometry(0.8, 0.18, 0.34), '#6b7166', { p: [0, 0.09, 0] }),
      part(TH, new TH.SphereGeometry(0.2, 8, 5), '#5f7a4e', { p: [-0.26, 1.35, 0.06], s: [1, 0.4, 0.8] }),
      part(TH, new TH.SphereGeometry(0.16, 8, 5), '#5f7a4e', { p: [0.22, 0.3, 0.1], s: [1, 0.5, 0.6] }),
    ]), { width: 0.01 });
    g.add(stone);
    // the words, in brush, cut into its face (drawn again when the brush font lands)
    const chars = [...STELE.text];
    const paint = (c: CanvasRenderingContext2D, w: number, h: number) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(22, 24, 20, 0.95)';
      c.font = `46px ${BRUSH_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const cols = [chars.slice(0, 8), chars.slice(8)];
      cols.forEach((col, ci) => col.forEach((ch, i) => c.fillText(ch, w * (ci === 0 ? 0.66 : 0.34), 40 + i * 52)));
    };
    const tex = canvasTexture(TH, 160, 460, paint);
    const face = new TH.Mesh(new TH.PlaneGeometry(0.5, 1.3), new TH.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    face.position.set(0, 0.8, 0.101);
    g.add(face);
    void loadBrush(STELE.text).then(() => { const c = (tex.image as HTMLCanvasElement).getContext('2d'); if (c) { paint(c, 160, 460); tex.needsUpdate = true; } });
    g.position.set(sx, sy, sz);
    // (its back to the pool: read from the bank)
    g.rotation.y = Math.atan2(sx - pool.x, sz - pool.z);
    ctx.regionGroup('mountain').add(g);
    const off = ctx.addInteractable({
      id: 'ty:stele', position: new TH.Vector3(sx, sy, sz), radius: 2.2,
      labelZh: STELE.label.zh, labelEn: STELE.label.en, actionZh: STELE.act.zh, actionEn: STELE.act.en,
      act: () => { ctx.hud.showCard(STELE.card); flag('ty:stele'); },
    });
    bag.onDispose(() => { off(); g.removeFromParent(); stone.geometry.dispose(); face.geometry.dispose(); (face.material as T.Material).dispose(); tex.dispose(); });
  };
  build();
  let acc = 0;
  bag.frame((dt) => { acc += dt; if (acc > 3) { acc = 0; build(); } });
}

// (G is the valley's centre: kept for readers of the plan)
void G;
