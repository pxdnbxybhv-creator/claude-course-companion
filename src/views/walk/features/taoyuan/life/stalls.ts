// 桃源 · 二期: the stalls, the smoke and the covered bowl (spec §3.3, §6.5).
//   · One merged `inked` mesh (2 draws, a few thousand triangles) for every new station prop: 桂娘's
//     clay stove and its lean-to by the long tables; a bowl stack, a gourd and a cloth wine-flag at
//     杜二's counter, and his brazier by the step; 葛姑's porch brazier and pot; 三娘's tray-table with
//     two cups; 阿黍's ember ring; the 曲池 tread-box before the brewery (G's 踩曲: its 曲 block is the
//     mesh's last box, squashed 4% per hit in place through quBlock(ctx)). valley.ts BUILT keeps the
//     peaches off each.
//   · One smoke `Points` (the valley's Cloud: its program is the petals'; its own soft round
//     texture, normal blending), 18 × density puffs (9 at 低) rising from whichever station serves
//     now — 桂娘's stove at 晨/昼/暮, 杜二's step at 夜 — and 6 embers in the same object at the fire
//     and the step at night, and 6 puffs of dust off the 曲 block on a 踩曲 miss.
//   · 留一碗: once `talk:ty.guiniang` ≥ 3, a covered bowl (its own small mesh, no outline, 1 draw) at
//     the end of the long table each day while unclaimed. Lifting the lid plays a 3.2 s 特写 (题 + 尝)
//     of a 桂娘 dish on now: free, but it still uses appetite. Daily count `tyl:liu`.
//
// Owner: L. Mounted by life/index.ts.
import type * as T from 'three';
import type { WorldCtx } from '../../../types';
import { flag, markDay, play, record } from '../../../../../app/play';
import { glowTexture, inked } from '../../kit';
import { merge, part } from '../../geo';
import { Cloud } from '../fx';
import { talkKey } from '../folk';
import { W, Y_T, standAt } from '../places';
import { BELLY, JIE, LIU, ateKey, eatKey, withKey } from './keys';
import { DISHES, NEW_PAGE } from './food';
import { PROPS, appetite, menuFor, pvModeFor, reactionFor, stationFor, stoveSpot, unitsOf } from './table-logic';
import { playPV } from './pv';
import { gated } from './prompt';
import { festivalNow, floorAt, seasonNow } from './board';
import { moodOfTaste } from './moods';
import { BOWL, GUINIANG } from './life-text';
import type { LifeActivity, LifeMount, LifePart, Part, PvPlace } from './types';

type XZ = { x: number; z: number };

/**
 * Where the new station props stand (valley-local x, z): the table's own (table-logic.ts PROPS and
 * stoveSpot(), where F's 特写 films 起), plus the wine-flag, the 曲池 and the covered bowl. valley.ts
 * BUILT has an entry for each. 桂娘's stove is the spec's second candidate (2.4, −3.6): the first,
 * (7.6, −2.8), is 0.7 m from the cup channel.
 */
export const STALLS = {
  /** 桂娘's clay stove (the lean-to over it); the smoke's day source is its chimney. */
  get stove(): XZ { return stoveSpot(); },
  /** 杜二's counter: the bowl stack and the gourd on it (the counter top is 1.0 m up). */
  counter: PROPS.counter,
  /** 杜二's cloth wine-flag on its pole: out by the lane before the brewery yard, where the square sees
   *  it — clear of the 曲池 and of 踩曲's fixed frame (it stood in the tread-box's corner). */
  flag: { x: 16.4, z: 2.2 },
  /** 杜二's brazier by the brewery step (夜). */
  step: PROPS.stepBrazier,
  /** 葛姑's brazier and pot on her porch. */
  porch: PROPS.porchBrazier,
  /** 三娘's tray-table with two cups on the doorstep. */
  tray: PROPS.tray,
  /** 阿黍's ember ring of stones on the bank. */
  fire: PROPS.embers,
  /** The 曲池 before the brewery: a shallow tread-box with a pale 曲 block (踩曲). */
  quchi: { x: 18, z: 3 },
  /** 留一碗: the end of the long table (the table top is 0.76 m up). */
  bowl: { x: 4.6, z: 2.7 },
};

/** 踩曲's hold on the 曲 block (spec §5.1): it squashes 4% per hit and springs back; a miss puffs dust. */
export interface QuBlock {
  /** A hit: squash the block 4% (it springs back by itself). */
  hit(): void;
  /** A miss: 6 puffs of dust off the block. */
  puff(): void;
}
const quBlocks = new WeakMap<WorldCtx, QuBlock>();
/** This world's 曲 block, once the stalls are built (null before, or at 低 with no smoke: then the hit is DOM-only). */
export const quBlock = (ctx: WorldCtx): QuBlock | null => quBlocks.get(ctx) ?? null;

/** The 曲 block is the merged mesh's last part: one non-indexed box, 36 vertices. */
const QU_VERTS = 36;

/** Where the smoke rises now (valley-local, with the height of its mouth), or null. */
export function smokeFrom(p: Part): { x: number; z: number; h: number } | null {
  if (p === 'night') return { x: STALLS.step.x, z: STALLS.step.z, h: 0.55 };
  return { x: STALLS.stove.x + 0.25, z: STALLS.stove.z - 0.2, h: 1.75 };
}

const COL = {
  clay: '#a3714e', clayDark: '#7c5238', soot: '#3a332d', thatch: '#b89c68', post: '#6d5238', wood: '#8a6a48',
  bowl: '#ece4d2', gourd: '#c89a45', cloth: '#e3d8bd', red: '#b5412f', stone: '#8d8a80', ember: '#5a3a2a', qu: '#b9c2ae', lacquer: '#6b2e24',
};

/** Build the merged props (valley-local geometry: the mesh sits at the valley's origin). */
function stallGeometry(ctx: WorldCtx): T.BufferGeometry {
  const TH = ctx.THREE;
  const parts: T.BufferGeometry[] = [];
  const y = (x: number, z: number) => standAt(x, z);
  const add = (g: T.BufferGeometry, c: string, p: [number, number, number], r?: [number, number, number], s?: number | [number, number, number]) => parts.push(part(TH, g, c, { p, r, s }));

  // 桂娘's stove: a clay block, a pot sunk in it, a chimney at the back; a lean-to of thatch on two posts
  {
    const { x, z } = STALLS.stove;
    const g = y(x, z);
    add(new TH.BoxGeometry(1.0, 0.62, 0.72), COL.clay, [x, g + 0.31, z]);
    add(new TH.BoxGeometry(0.34, 0.26, 0.05), COL.soot, [x, g + 0.2, z + 0.37]);
    add(new TH.CylinderGeometry(0.3, 0.22, 0.24, 10), COL.soot, [x - 0.12, g + 0.72, z + 0.02]);
    add(new TH.CylinderGeometry(0.2, 0.2, 0.08, 10), COL.wood, [x - 0.12, g + 0.86, z + 0.02]);
    add(new TH.CylinderGeometry(0.09, 0.11, 1.1, 8), COL.clayDark, [x + 0.3, g + 1.17, z - 0.22]);
    for (const dx of [-0.75, 0.75]) add(new TH.BoxGeometry(0.08, 2.0, 0.08), COL.post, [x + dx, g + 1.0, z + 0.62]);
    add(new TH.BoxGeometry(1.8, 0.06, 1.45), COL.thatch, [x, g + 1.95, z + 0.05], [-0.32, 0, 0]);
  }
  // 杜二's counter: four bowls stacked, a gourd; the wine-flag on its pole
  {
    const { x, z } = STALLS.counter;
    const top = y(x, z) + 1.0;
    for (let i = 0; i < 4; i++) add(new TH.CylinderGeometry(0.1, 0.06, 0.05, 10), COL.bowl, [x - 0.25, top + 0.03 + i * 0.045, z - 0.35]);
    add(new TH.SphereGeometry(0.11, 8, 6), COL.gourd, [x - 0.2, top + 0.11, z + 0.35]);
    add(new TH.SphereGeometry(0.075, 8, 6), COL.gourd, [x - 0.2, top + 0.27, z + 0.35]);
    const f = STALLS.flag;
    const gf = y(f.x, f.z);
    add(new TH.CylinderGeometry(0.04, 0.05, 2.7, 6), COL.post, [f.x, gf + 1.35, f.z]);
    add(new TH.BoxGeometry(0.62, 0.05, 0.05), COL.post, [f.x + 0.3, gf + 2.6, f.z]);
    add(new TH.BoxGeometry(0.5, 0.82, 0.02), COL.cloth, [f.x + 0.33, gf + 2.16, f.z]);
    add(new TH.BoxGeometry(0.5, 0.08, 0.025), COL.red, [f.x + 0.33, gf + 1.78, f.z]);
  }
  // braziers: 杜二's by the step, 葛姑's on her porch (with a pot)
  for (const [b, pot] of [[STALLS.step, false], [STALLS.porch, true]] as const) {
    const g = y(b.x, b.z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      add(new TH.BoxGeometry(0.04, 0.34, 0.04), COL.soot, [b.x + Math.cos(a) * 0.17, g + 0.17, b.z + Math.sin(a) * 0.17]);
    }
    add(new TH.CylinderGeometry(0.26, 0.17, 0.16, 10), COL.soot, [b.x, g + 0.4, b.z]);
    add(new TH.CylinderGeometry(0.2, 0.2, 0.03, 10), COL.ember, [b.x, g + 0.47, b.z]);
    if (pot) add(new TH.CylinderGeometry(0.17, 0.14, 0.2, 10), COL.clayDark, [b.x, g + 0.58, b.z]);
  }
  // 三娘's low tray-table, two cups
  {
    const { x, z } = STALLS.tray;
    const g = y(x, z);
    add(new TH.BoxGeometry(0.62, 0.05, 0.42), COL.lacquer, [x, g + 0.26, z]);
    for (const dx of [-0.26, 0.26]) for (const dz of [-0.16, 0.16]) add(new TH.BoxGeometry(0.04, 0.24, 0.04), COL.lacquer, [x + dx, g + 0.12, z + dz]);
    for (const dx of [-0.1, 0.12]) add(new TH.CylinderGeometry(0.045, 0.035, 0.06, 8), COL.bowl, [x + dx, g + 0.32, z + 0.02]);
  }
  // 阿黍's ember ring: stones round a bed of coals, two sticks across
  {
    const { x, z } = STALLS.fire;
    const g = y(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(new TH.DodecahedronGeometry(0.1, 0), COL.stone, [x + Math.cos(a) * 0.36, g + 0.06, z + Math.sin(a) * 0.36], [a, a * 0.7, 0]);
    }
    add(new TH.CylinderGeometry(0.28, 0.3, 0.05, 10), COL.ember, [x, g + 0.03, z]);
    add(new TH.CylinderGeometry(0.025, 0.025, 0.7, 5), COL.post, [x, g + 0.1, z], [0, 0.4, Math.PI / 2]);
    add(new TH.CylinderGeometry(0.025, 0.025, 0.7, 5), COL.post, [x, g + 0.12, z], [0, -0.7, Math.PI / 2]);
  }
  // the 曲池: a shallow wooden tread-box, the pale green-grey 曲 in it
  {
    const { x, z } = STALLS.quchi;
    const g = y(x, z);
    add(new TH.BoxGeometry(1.4, 0.04, 1.4), COL.wood, [x, g + 0.02, z]);
    for (const [dx, dz, w, d] of [[0, -0.68, 1.4, 0.06], [0, 0.68, 1.4, 0.06], [-0.68, 0, 0.06, 1.3], [0.68, 0, 0.06, 1.3]] as const) {
      add(new TH.BoxGeometry(w, 0.18, d), COL.wood, [x + dx, g + 0.09, z + dz]);
    }
    add(new TH.BoxGeometry(0.8, 0.1, 0.8), COL.qu, [x, g + 0.09, z]);
  }
  return merge(TH, parts);
}

/** The covered bowl: a bowl and its lid (one small mesh, no outline). */
function bowlGeometry(ctx: WorldCtx): T.BufferGeometry {
  const TH = ctx.THREE;
  return merge(TH, [
    part(TH, new TH.CylinderGeometry(0.11, 0.07, 0.07, 12), COL.bowl, { p: [0, 0.035, 0] }),
    part(TH, new TH.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#d9cdb4', { p: [0, 0.07, 0], s: [1, 0.55, 1] }),
    part(TH, new TH.CylinderGeometry(0.025, 0.03, 0.025, 8), COL.wood, { p: [0, 0.138, 0] }),
  ]);
}

export const mountStalls: LifeMount = (bag, ctx, tv, life): LifePart => {
  const TH = ctx.THREE;
  const low = ctx.quality.level === 'low';
  let mesh: T.Mesh | null = null;
  let bowl: T.Mesh | null = null;
  let smoke: Cloud | null = null;
  const NS = low ? 9 : Math.max(9, Math.round(18 * Math.min(1.4, ctx.quality.density)));
  const NE = 6;
  /** The 曲 block's dust (踩曲's misses): 6 points after the embers. */
  const ND = 6;
  const seeds = Float32Array.from({ length: NS }, (_, i) => ((i * 7919) % 1000) / 1000);
  // (the 曲 block: its vertex range in the merged mesh, its rest shape, the spring, the dust's clock)
  let quFrom = 0;
  let quRest: Float32Array | null = null;
  let sq = 0;
  let sqV = 0;
  let sqShown = 0;
  let dustT = -1;
  const dust = new TH.Color('#cfc6ae');
  const grey = new TH.Color('#a39d94');
  const hot = new TH.Color('#ff9a4a');

  tv.onBuilt(() => {
    if (mesh || bag.disposed) return;
    const o = W(0, 0);
    mesh = inked(ctx, stallGeometry(ctx));
    mesh.name = 'tyl:stalls';
    mesh.position.set(o.x, Y_T, o.z);
    mesh.userData.pocket = true;
    bag.add(mesh, ctx.regionGroup('taoyuan'));
    {
      const pos = mesh.geometry.attributes.position as T.BufferAttribute;
      quFrom = pos.count - QU_VERTS;
      quRest = (pos.array as Float32Array).slice(quFrom * 3);
    }
    bowl = inked(ctx, bowlGeometry(ctx), { width: 0 });
    bowl.name = 'tyl:bowl';
    const b = STALLS.bowl;
    const w = W(b.x, b.z);
    bowl.position.set(w.x, Y_T + standAt(b.x, b.z) + 0.76, w.z);
    bowl.visible = false;
    bowl.userData.pocket = true;
    bag.add(bowl, ctx.regionGroup('taoyuan'));
    const fx = tv.fx;
    if (fx) {
      smoke = new Cloud(fx, NS + NE + ND, 'petal');
      smoke.points.name = 'tyl:smoke';
      // (its own soft round puff; the petals' program, so nothing new to compile)
      const tex = glowTexture(TH, 64, 0.05);
      bag.own(tex);
      smoke.mat.uniforms.uMap = { value: tex };
      bag.onDispose(() => { smoke?.dispose(); smoke = null; });
    }
  });

  // ───────────── colliders (only while inside: the floor is there)

  let solids: (() => void)[] = [];
  const solid = () => {
    if (solids.length) return;
    for (const [s, r, h] of [[STALLS.stove, 0.6, 1.0], [STALLS.flag, 0.12, 2.6], [STALLS.step, 0.3, 0.5], [STALLS.porch, 0.3, 0.6], [STALLS.tray, 0.34, 0.3]] as const) {
      const w = W(s.x, s.z);
      solids.push(ctx.addCollider({ x: w.x, z: w.z, r, h }));
    }
  };
  const unsolid = () => { for (const f of solids.splice(0)) f(); };
  bag.onDispose(tv.onEnter(() => solid()));
  bag.onDispose(tv.onLeave(() => unsolid()));
  bag.onDispose(unsolid);
  if (tv.isInside()) solid();

  // ───────────── the smoke and the embers

  let t = 0;
  bag.frame((dt) => {
    const c = smoke;
    if (!c || !tv.isInside()) return;
    t += dt;
    const p = life.part();
    const src = smokeFrom(p);
    // (the Cloud lives in the valley's effects group: valley-local coordinates, y from the valley's floor level)
    if (src) {
      const y0 = standAt(src.x, src.z) + src.h;
      for (let i = 0; i < NS; i++) {
        const k = (seeds[i] + t * 0.09) % 1;
        const drift = k * k * 1.6;
        c.set(i, src.x + Math.sin(i * 2.1 + t * 0.4) * 0.12 * k + drift * 0.5, y0 + k * 3.2, src.z + Math.cos(i * 1.7 + t * 0.3) * 0.12 * k + drift * 0.2,
          0.3 + k * 1.0, 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.15)), grey, i + t * 0.2);
      }
    } else for (let i = 0; i < NS; i++) c.alpha[i] = 0;
    const night = p === 'night';
    for (let j = 0; j < NE; j++) {
      const s = j < 3 ? STALLS.fire : STALLS.step;
      const h = j < 3 ? 0.08 : 0.5;
      const flick = 0.55 + 0.45 * Math.sin(t * (5 + j) + j * 1.3);
      c.set(NS + j, s.x + Math.cos(j * 2.1) * 0.12, standAt(s.x, s.z) + h + 0.03 * flick, s.z + Math.sin(j * 2.1) * 0.12, 0.09, night ? 0.9 * flick : 0, hot);
    }
    // the 曲 block's dust: 6 puffs spreading off its top for 0.7 s after a miss
    if (dustT >= 0) {
      dustT += dt;
      const k = Math.min(1, dustT / 0.7);
      const q = STALLS.quchi;
      const y0 = standAt(q.x, q.z) + 0.16;
      for (let j = 0; j < ND; j++) {
        const a = (j / ND) * Math.PI * 2 + 0.4;
        const r = 0.25 + 0.45 * k;
        c.set(NS + NE + j, q.x + Math.cos(a) * r, y0 + 0.25 * k, q.z + Math.sin(a) * r, 0.2 + 0.35 * k, 0.45 * (1 - k), dust, j);
      }
      if (k >= 1) { dustT = -1; for (let j = 0; j < ND; j++) c.alpha[NS + NE + j] = 0; }
    }
    c.flush();
  });

  // ───────────── the 曲 block (踩曲): squash and spring back in the merged mesh's own vertices

  function squashTo(v: number): void {
    if (!mesh || !quRest) return;
    const pos = mesh.geometry.attributes.position as T.BufferAttribute;
    const arr = pos.array as Float32Array;
    const q = STALLS.quchi;
    const base = standAt(q.x, q.z) + 0.04;
    const wide = 1 + v * 0.5;
    for (let i = 0; i < QU_VERTS; i++) {
      const o = i * 3;
      arr[(quFrom + i) * 3] = q.x + (quRest[o] - q.x) * wide;
      arr[(quFrom + i) * 3 + 1] = base + (quRest[o + 1] - base) * (1 - v);
      arr[(quFrom + i) * 3 + 2] = q.z + (quRest[o + 2] - q.z) * wide;
    }
    pos.clearUpdateRanges();
    pos.addUpdateRange(quFrom * 3, QU_VERTS * 3);
    pos.needsUpdate = true;
    sqShown = v;
  }
  bag.frame((dt) => {
    if (sq === 0 && sqV === 0 && sqShown === 0) return;
    // a stiff spring back to rest (about 0.25 s)
    const d = Math.min(dt, 1 / 30);
    sqV += (-260 * sq - 22 * sqV) * d;
    sq += sqV * d;
    if (Math.abs(sq) < 1e-4 && Math.abs(sqV) < 1e-3) { sq = 0; sqV = 0; }
    squashTo(Math.max(-0.02, Math.min(0.12, sq)));
  });
  quBlocks.set(ctx, {
    hit: () => { sq = Math.min(0.08, Math.max(0, sq) + 0.04); sqV = 0; },
    puff: () => { dustT = 0; },
  });
  bag.onDispose(() => { if (quBlocks.get(ctx)) quBlocks.delete(ctx); });

  // ───────────── 留一碗

  const bowlDue = (): boolean => {
    const p = play.peek();
    return (p.counters[talkKey('guiniang')] ?? 0) >= 3 && life.today(LIU) === 0 && life.part() !== 'night';
  };
  let acc = 0;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    if (bowl) bowl.visible = tv.isInside() && bowlDue() && life.open();
  });
  gated(bag, ctx, {
    id: 'tyl:bowl', position: floorAt(ctx, STALLS.bowl.x - 0.6, STALLS.bowl.z + 0.3), radius: 1.3,
    labelZh: BOWL.label.zh, labelEn: BOWL.label.en, actionZh: BOWL.action.zh, actionEn: BOWL.action.en,
    act: () => lift(),
  }, () => life.open() && !life.current() && bowlDue());

  /** Where a first taste from the bowl is filmed: 桂娘 at her stove, and you where the lid is lifted. */
  function bowlPlace(): PvPlace | null {
    try {
      const st = stationFor('guiniang', life.part());
      const seat = { x: STALLS.bowl.x - 0.6, z: STALLS.bowl.z + 0.3 };
      const world = (p: { x: number; z: number }) => ({ ...W(p.x, p.z), y: Y_T + standAt(p.x, p.z) });
      return { cook: 'guiniang', station: world(st.cook), stationFace: W(st.prop.x, st.prop.z), seat: world(seat), seatFace: W(STALLS.bowl.x, STALLS.bowl.z) };
    } catch (e) {
      console.error('[walk] taoyuan bowl place', e);
      return null;
    }
  }

  let lifting = false;
  async function lift(): Promise<void> {
    if (lifting || !life.open() || life.current() || !bowlDue()) return;
    // (a 桂娘 dish on now, as the table's menu has it: the season's, the festival's 席)
    const on = menuFor('guiniang', life.part(), { season: seasonNow(ctx), solved: !!play.peek().flags['case:hz:solved'], festival: festivalNow(ctx) });
    if (!on.length) return;
    const dish = on[Math.floor(Math.random() * on.length)];
    const d = DISHES[dish];
    const cost = unitsOf(dish);
    // (the table's appetite rule: 8 units a day, one serving more on a festival day)
    const room = appetite(dish, life.today(BELLY), { festival: !!festivalNow(ctx), extraUsed: life.today(JIE) });
    const over = room === 'extra';
    if (room === 'full') {
      ctx.hud.toast(BOWL.full.zh, BOWL.full.en, 3600);
      return;
    }
    let stopped = false;
    const a: LifeActivity = { kind: 'bowl', leaving: async () => { stopped = true; return true; }, stop: () => { stopped = true; } };
    if (!life.claim(a)) return;
    lifting = true;
    try {
      const f = play.peek().flags;
      const first = !f[eatKey(dish)];
      record(LIU);
      record(ateKey(dish));
      if (over) record(JIE); else record(BELLY, cost);
      if (first) {
        flag(eatKey(dish));
        markDay(eatKey(dish));
        flag(withKey(dish, ctx.player.character));
      }
      life.setMood(moodOfTaste(d.taste));
      if (bowl) bowl.visible = false;
      ctx.player.freeze(true);
      // the 食单's setting holds here too: 不看 is the emote; a first taste is the dish's whole 特写 (at
      // 桂娘's stove, then here at the bowl), the lid lifted again the 3.2 s cut
      const mode = pvModeFor(f, first);
      if (mode === 'none') {
        try { ctx.player.emote('eat'); } catch { /* optional */ }
        if (first) ctx.hud.toast(NEW_PAGE.zh, NEW_PAGE.en, 3200);
        await new Promise<void>((r) => bag.later(1000, r));
      } else {
        const full = first && mode === 'full';
        await playPV(ctx, tv, dish, {
          first, own: null, mode: full ? 'full' : 'short', at: full ? bowlPlace() : null,
          season: full ? d.season ?? null : null, react: reactionFor(ctx.player.character, dish).line,
        });
      }
      if (!stopped && tv.isInside()) ctx.hud.toast(`${GUINIANG.zh}：「${BOWL.kept.zh}」`, `${GUINIANG.en}: "${BOWL.kept.en}"`, 3200);
    } finally {
      lifting = false;
      life.release(a);
    }
  }

  return {
    dev: {
      stalls: () => ({ mesh: !!mesh, bowl: bowl?.visible ?? null, smoke: NS, embers: NE, tris: mesh ? (mesh.geometry.attributes.position.count / 3) : 0 }),
      smoke: () => smoke ? { max: Math.max(...smoke.alpha), at: [smoke.pos[0], smoke.pos[1], smoke.pos[2]], size: smoke.size[0], shown: smoke.points.visible && !!smoke.points.parent?.visible, parent: smoke.points.parent?.name ?? null } : null,
      bowl: () => lift(),
      smokeObj: () => smoke,
      /** 踩曲's block (DEV): 'hit' or 'puff' it, and read its squash and top now. */
      qu: (what?: 'hit' | 'puff') => {
        const b = quBlocks.get(ctx);
        if (what) b?.[what]();
        let top = -Infinity;
        if (mesh && quRest) { const a = mesh.geometry.attributes.position.array as Float32Array; for (let i = 0; i < QU_VERTS; i++) top = Math.max(top, a[(quFrom + i) * 3 + 1]); }
        return { ok: !!b, sq, shown: sqShown, dust: dustT, top };
      },
    },
  };
};
