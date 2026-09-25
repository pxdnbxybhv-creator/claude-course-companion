// What the homestead's things are for, out of the build mode: sit on a bench or in the pavilion,
// read in the study, play go at the stone table, ride the swing (it swings higher and higher), draw
// water at the well (it waters the vegetable plots too), water and harvest the plots (a few coins
// once a day; the gardener's 催花 ripens them at once), and write on plaques and couplets.
import type * as T from 'three';
import type { Interactable } from '../../../types';
import { home, setItemText, tendItem, type HomeItem } from '../../../../../app/home';
import { earn, record } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { addDays, diffDays } from '../../../../../core/date';
import { plop, rustle } from '../../sfx';
import { HARVEST_COINS, KIND, SWING_RIG, coupletLines, growStage, itemPoint, itemPose, itemText, type HomeKind } from '../catalog';
import type { Baked } from './brush';
import { swingAngle } from './mats';
import { askText } from './dialog';
import type { HomeStage } from './stage';

interface Seated {
  uid: string;
  mode: 'sit' | 'read' | 'table' | 'swing';
  seat: { x: number; y: number; z: number; heading: number; sx: number; sz: number };
  t: number;
  beat: number;
  swing?: { px: number; py: number; pz: number; ax: number; az: number; len: number; slot: number };
}

const WELL_LINES: [string, string][] = [
  ['凿井而饮，耕田而食。', 'Dig a well and drink; till the field and eat.'],
  ['井水清冽，掬一捧洗把脸。', 'The well water is cold and clear; you splash your face.'],
  ['辘轳吱呀一响，一桶清水上来。', 'The windlass creaks, and up comes a bucket of clear water.'],
];
const READ_LINES: [string, string][] = [
  ['「读书之乐乐何如？绿满窗前草不除。」', '“What is the joy of reading? Green fills the window; the grass goes unweeded.”'],
  ['「问渠那得清如许？为有源头活水来。」', '“How does the pond stay so clear? Fresh water flows in from the source.”'],
  ['「纸上得来终觉浅，绝知此事要躬行。」', '“What comes from paper stays shallow; to know it, do it.”'],
  ['「采菊东篱下，悠然见南山。」', '“Picking chrysanthemums by the east fence, I see the southern hills.”'],
];

export class HomeUses {
  private seated: Seated | null = null;
  private rider: T.Object3D;
  private hotAmp = SWING_RIG.amp;
  private hotSlot = -1;
  private readN = 0;
  private wellN = 0;

  constructor(private stage: HomeStage) {
    this.rider = new stage.THREE.Object3D();
    this.rider.name = 'home:seat';
    stage.group.add(this.rider);
  }

  private get ctx() { return this.stage.ctx; }

  /** Sow a vegetable plot (daysAgo < 0: sown that many days ago). */
  sow(uid: string, daysAgo = 0): void {
    tendItem(uid, { sown: addDays(today.value, Math.min(0, daysAgo)), boost: 0 });
  }

  /** What a placed thing offers when you walk up to it. */
  interactable(e: { uid: string; item: HomeItem; baked: Baked }): Interactable | null {
    const k = KIND[e.item.kind];
    if (!k?.use) return null;
    const THREE = this.stage.THREE;
    const p = itemPose(e.item);
    const radius = Math.max(p.w, p.d) / 2 + 1.1;
    const pos = new THREE.Vector3(p.x, this.ctx.groundY(p.x, p.z), p.z);
    const base = { id: `home:${e.uid}`, position: pos, radius, labelZh: k.zh, labelEn: k.en };
    switch (k.use) {
      case 'sit': {
        const read = k.id === 'study';
        return { ...base, actionZh: read ? '读书' : k.id === 'pavilion' ? '小憩' : '坐坐', actionEn: read ? 'Read' : k.id === 'pavilion' ? 'Rest' : 'Sit', act: () => this.sit(e.uid, read ? 'read' : 'sit') };
      }
      case 'table':
        return { ...base, actionZh: '对弈', actionEn: 'Play go', act: () => this.sit(e.uid, 'table') };
      case 'swing':
        return { ...base, actionZh: '荡秋千', actionEn: 'Swing', act: () => this.swing(e.uid) };
      case 'well':
        return { ...base, actionZh: '汲水', actionEn: 'Draw water', act: () => this.well() };
      case 'text':
        return { ...base, labelZh: `${k.zh}「${itemText(e.item).replace('/', '，')}」`, labelEn: k.en, actionZh: '题字', actionEn: 'Write', act: () => void this.write(e.uid) };
      case 'farm': {
        const day = today.value;
        const st = growStage(e.item, day, diffDays);
        const g = e.item.grow;
        const ripe = st >= 3;
        const done = ripe ? g?.reaped === day : g?.wet === day;
        const labelZh = ripe ? (done ? '菜畦 · 今日已收' : '菜畦 · 熟了') : `菜畦 · ${['刚下种', '冒了芽', '长得正旺'][st]}${done ? '（已浇）' : ''}`;
        const labelEn = ripe ? (done ? 'Vegetables · picked today' : 'Vegetables · ripe') : `Vegetables · ${['just sown', 'sprouting', 'growing well'][st]}${done ? ' (watered)' : ''}`;
        return { ...base, labelZh, labelEn, actionZh: ripe ? '收菜' : '浇水', actionEn: ripe ? 'Harvest' : 'Water', act: () => this.farm(e.uid) };
      }
    }
    return null;
  }

  // ───────────── sitting, reading, go, the swing

  private sit(uid: string, mode: Seated['mode']): void {
    const e = this.stage.entry(uid);
    const pl = this.ctx.player;
    if (!e || pl.isFrozen || !e.baked.seats.length) return;
    const px = pl.position.x, pz = pl.position.z;
    let seat = e.baked.seats[0], bd = Infinity;
    for (const s of e.baked.seats) { const d = Math.hypot(s.sx - px, s.sz - pz); if (d < bd) { bd = d; seat = s; } }
    this.mount(uid, mode, seat);
    if (mode === 'read') {
      const [zh, en] = READ_LINES[this.readN++ % READ_LINES.length];
      this.ctx.hud.toast(`展卷一读：${zh}`, `You open a book: ${en}`, 4200);
      record('home:read');
    } else if (mode === 'table') {
      this.ctx.hud.toast('落子无声，一局慢慢下。（走动即起身）', 'Stones click softly: a slow game. (Move to get up.)', 3200);
    } else {
      this.ctx.hud.toast('坐下歇歇脚。（走动即起身）', 'You sit and rest. (Move to get up.)', 2600);
    }
  }

  private swing(uid: string): void {
    const e = this.stage.entry(uid);
    const pl = this.ctx.player;
    if (!e || pl.isFrozen) return;
    const p = itemPose(e.item);
    const y0 = this.stage.baseY(e.item);
    const ax = Math.cos(p.heading), az = -Math.sin(p.heading);
    const seat = { x: p.x, y: y0 + SWING_RIG.seatY, z: p.z, heading: p.heading, sx: itemPoint(e.item, 0, 1.3).x, sz: itemPoint(e.item, 0, 1.3).z };
    this.mount(uid, 'swing', seat, { px: p.x, py: y0 + SWING_RIG.pivotY, pz: p.z, ax, az, len: SWING_RIG.pivotY - SWING_RIG.seatY, slot: e.slot });
    this.hotSlot = e.slot;
    this.hotAmp = SWING_RIG.amp;
    this.stage.mats.U.uHot.value = e.slot;
    this.ctx.hud.toast('荡起来喽——越荡越高！（走动即下来）', 'Up you go, higher and higher! (Move to get off.)', 2800);
    record('home:swing');
  }

  private mount(uid: string, mode: Seated['mode'], seat: Seated['seat'], swing?: Seated['swing']): void {
    const pl = this.ctx.player;
    this.rider.position.set(seat.x, seat.y, seat.z);
    this.rider.rotation.set(0, seat.heading, 0);
    this.rider.updateMatrixWorld(true);
    pl.freeze(true);
    pl.ride(this.rider);
    pl.emote(mode === 'table' ? 'play' : 'sit');
    this.seated = { uid, mode, seat, t: 0, beat: 0, swing };
  }

  private stand(): void {
    const s = this.seated;
    if (!s) return;
    this.seated = null;
    const pl = this.ctx.player;
    pl.ride(null);
    pl.freeze(false);
    pl.teleport(s.seat.sx, s.seat.sz, s.seat.heading);
  }

  // ───────────── the well and the vegetable plots

  private well(): void {
    const pl = this.ctx.player;
    pl.emote('water');
    setTimeout(() => plop(0.5), 700);
    const day = today.value;
    let n = 0;
    for (const it of home.value.items) {
      if (KIND[it.kind]?.use !== 'farm') continue;
      const g = it.grow ?? { sown: day, boost: 0 };
      if (growStage(it, day, diffDays) >= 3 || g.wet === day) continue;
      tendItem(it.uid, { ...g, boost: g.boost + 1, wet: day });
      n++;
    }
    const [zh, en] = WELL_LINES[this.wellN++ % WELL_LINES.length];
    if (n) this.ctx.hud.toast(`${zh}顺手把 ${n} 畦菜都浇透了。`, `${en} You water ${n} vegetable plot${n > 1 ? 's' : ''} while you are at it.`, 3600);
    else this.ctx.hud.toast(zh, en, 3000);
    record('home:well');
  }

  private farm(uid: string): void {
    const it = home.value.items.find((x) => x.uid === uid);
    if (!it) return;
    const day = today.value;
    const pl = this.ctx.player;
    const g = it.grow ?? { sown: day, boost: 0 };
    const st = growStage(it, day, diffDays);
    if (st >= 3) {
      if (g.reaped === day) { this.ctx.hud.toast('今天已经收过一回了，明日再来。', 'Already picked today; come back tomorrow.'); return; }
      pl.emote('pet');
      rustle(0.6);
      earn(HARVEST_COINS);
      tendItem(uid, { sown: day, boost: 0, reaped: day });
      record('home:harvest');
      this.ctx.hud.toast(`收了满满一篮新菜，换得 ${HARVEST_COINS} 文铜钱。又种下一茬。`, `A basket of fresh vegetables: ${HARVEST_COINS} coins. You sow the next crop.`, 3400);
      return;
    }
    if (g.wet === day) { this.ctx.hud.toast('今天浇过水了，让它慢慢长。', 'Watered already today; let it grow.'); return; }
    pl.emote('water');
    setTimeout(() => plop(0.3), 500);
    tendItem(uid, { ...g, boost: g.boost + 1, wet: day });
    record('home:water');
    this.ctx.hud.toast(st + 1 >= 3 ? '浇透了——菜熟了，可以收了！' : '浇透了，菜苗又长了一截。', st + 1 >= 3 ? 'Watered, and ripe: ready to pick!' : 'Watered: the seedlings shoot up.', 2600);
  }

  /** The gardener's 催花 (a 'banmu:bloom' event): plots within reach ripen at once. */
  bloom(d: { x: number; z: number; r?: number } | undefined): void {
    if (!d) return;
    const r = d.r ?? 8;
    const day = today.value;
    let n = 0;
    for (const it of home.value.items) {
      if (KIND[it.kind]?.use !== 'farm') continue;
      const p = itemPose(it);
      if (Math.hypot(p.x - d.x, p.z - d.z) > r + 1) continue;
      if (growStage(it, day, diffDays) >= 3) continue;
      const g = it.grow ?? { sown: day, boost: 0 };
      tendItem(it.uid, { ...g, boost: 3 });
      n++;
    }
    if (n) this.ctx.hud.toast('催花一点，菜畦一时都熟了。', 'A touch of the gardener’s gift: the vegetables ripen at once.', 3000);
  }

  // ───────────── words on plaques and couplets

  async write(uid: string): Promise<boolean> {
    const it = home.value.items.find((x) => x.uid === uid);
    const k: HomeKind | undefined = it && KIND[it.kind];
    if (!it || !k) return false;
    const cur = itemText(it);
    if (k.text === 'couplet') {
      const [r, l] = coupletLines(cur);
      const v = await askText(this.ctx, {
        titleZh: '写对联', titleEn: 'Write the couplets', noteZh: '上联贴右，下联贴左，各七字以内。', noteEn: 'The first line hangs on the right, the second on the left; up to seven characters each.',
        fields: [{ labelZh: '上联', labelEn: 'First line', value: r, max: 7 }, { labelZh: '下联', labelEn: 'Second line', value: l, max: 7 }],
      });
      if (!v) return false;
      setItemText(uid, v[0] || v[1] ? `${v[0]}/${v[1]}` : '');
    } else {
      const v = await askText(this.ctx, {
        titleZh: '题匾', titleEn: 'Write the plaque', noteZh: '四到六字最好看。', noteEn: 'Four to six characters look best.',
        fields: [{ labelZh: '匾文', labelEn: 'Words', value: cur, max: 8 }],
      });
      if (!v) return false;
      setItemText(uid, v[0]);
    }
    record('home:write');
    return true;
  }

  /** A thing went (moved, sold): whoever sat on it gets up. */
  released(uid: string): void {
    if (this.seated?.uid === uid) this.stand();
  }

  frame(dt: number, t: number): void {
    const s = this.seated;
    const U = this.stage.mats.U;
    // the ridden swing's amplitude: up while riding, back down after
    const want = s?.mode === 'swing' ? 0.55 : SWING_RIG.amp;
    this.hotAmp += (want - this.hotAmp) * (1 - Math.exp(-(s ? 0.35 : 0.8) * dt));
    U.uHotAmp.value = this.hotAmp;
    if (!s && this.hotSlot >= 0 && Math.abs(this.hotAmp - SWING_RIG.amp) < 0.005) { this.hotSlot = -1; U.uHot.value = -1; }
    if (!s) return;
    s.t += dt;
    const pl = this.ctx.player;
    if (!pl.isFrozen) { this.seated = null; return; } // someone else took the walker
    const inp = this.ctx.input;
    if (s.t > 0.5 && (Math.hypot(inp.x, inp.y) > 0.35 || inp.actionPressed || inp.jumpPressed)) { this.stand(); return; }
    if (s.swing) {
      const w = s.swing;
      const a = swingAngle(U.uTime.value, w.px, w.pz, this.hotAmp);
      // the seat hangs at (0, −L, 0) from the pivot, turned about the axis k = (ax, 0, az):
      // v cos a + (k × v) sin a, with k × v = (az L, 0, −ax L)
      const L = w.len, c = Math.cos(a), sn = Math.sin(a);
      this.rider.position.set(w.px + w.az * L * sn, w.py - L * c, w.pz - w.ax * L * sn);
      this.rider.updateMatrixWorld(true);
    }
    s.beat += dt;
    if (s.mode === 'table' && s.beat > 3.4) { s.beat = 0; pl.emote('play'); }
    else if (s.mode === 'read' && s.beat > 4) { s.beat = 0; pl.emote('sit'); }
    void t;
  }

  dispose(): void {
    if (this.seated) this.stand();
    this.rider.removeFromParent();
  }
}

