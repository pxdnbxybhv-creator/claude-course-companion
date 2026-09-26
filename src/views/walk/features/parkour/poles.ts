// 梅花桩 · plum-blossom poles in the bamboo grove: a winding course of wooden posts of different
// heights, from a start stone by a stele to a platform with a bronze bell. Step onto the start
// stone and the course is armed; leave it and the clock runs; touch the ground and you are set
// back on the start; ring the bell to stop the clock. Best time, coins for a first finish and for
// every new best.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { flag, play, record, recordMax, earn } from '../../../../app/play';
import { type Bag, inked, reducedMotion, tr } from '../kit';
import { merge, part } from '../geo';
import type { Deck } from '../../regions/water-decks';
import { Builder, C } from './build';
import type { CoinSpot } from './coins';
import { HIGH_LIFT } from './sites';
import { PoleRun, finishReward, fmtTime, inRect, poleScore, poleTime, type RunPlace } from './logic';
import * as snd from './sound';

const AT = { x: -74, z: 36 };
/** The start stone, the posts (x, z, top above base), the finish platform (clear of the hut to the north). */
const START = { x: -70.5, z: 34.0, h: 0.3, r: 0.62 };
const POLES: [number, number, number][] = [
  [-71.8, 34.35, 0.55],
  [-73.1, 34.0, 0.8],
  [-74.4, 34.5, 1.0],
  [-75.7, 34.1, 1.2],
  [-77.1, 34.7, 0.95],
  [-78.2, 35.6, 1.25],
  [-78.5, 37.0, 1.5],
  [-77.5, 38.0, 1.75],
  [-76.2, 37.6, 1.55],
  [-74.6, 37.2, 1.8],
  [-73.0, 37.6, 2.05],
  [-71.7, 38.1, 1.75],
  [-70.4, 37.7, 1.5],
  [-69.2, 38.3, 1.25],
];
const FINISH = { x: -67.7, z: 38.5, h: 1.35, w: 1.5, d: 1.5 };
const STELE = { x: -69.4, z: 32.7 };
const POLE_R = 0.24;

export const POLE_COINS: CoinSpot[] = [
  { id: 'b-pole4', region: 'bamboo', x: POLES[3][0], z: POLES[3][1], value: 1 },
  { id: 'b-pole6', region: 'bamboo', x: POLES[5][0], z: POLES[5][1], value: 1 },
  { id: 'b-pole8', region: 'bamboo', x: POLES[7][0], z: POLES[7][1], value: 1 },
  { id: 'b-pole11', region: 'bamboo', x: POLES[10][0], z: POLES[10][1], value: 2 },
  { id: 'b-pole11-high', region: 'bamboo', x: POLES[10][0], z: POLES[10][1], value: 4, lift: HIGH_LIFT, challenge: 'high' },
  { id: 'b-pole13', region: 'bamboo', x: POLES[12][0], z: POLES[12][1], value: 1 },
  { id: 'b-finish', region: 'bamboo', x: FINISH.x + 0.3, z: FINISH.z + 0.3, value: 1 },
];

/** Best time so far (s), from play.best. */
const bestTime = () => poleTime(play.peek().best.poles);

export function buildPoles(bag: Bag, ctx: WorldCtx): void {
  const { THREE } = ctx;
  const base = ctx.groundY(AT.x, AT.z);
  const b = new Builder(ctx, 'poles', base);
  const startDeck = b.add({ kind: 'stone', x: START.x, z: START.z, h: START.h, r: START.r, mark: true, ry: 0.3 }).deck;
  const tops: number[] = [];
  POLES.forEach(([x, z, h], i) => { tops.push(b.add({ kind: 'pole', x, z, h, r: POLE_R, mark: i === POLES.length - 1, seed: 40 + i }).top); });
  const fin = b.add({ kind: 'plank', x: FINISH.x, z: FINISH.z, h: FINISH.h, w: FINISH.w, d: FINISH.d, ry: 0.2 });
  const finDeck = fin.deck;
  // the stele by the start
  const stY = ctx.groundY(STELE.x, STELE.z);
  const startTop = base + START.h;
  const parent = ctx.regionGroup('bamboo');
  b.finish(bag, parent);

  const extra: T.BufferGeometry[] = [];
  extra.push(part(THREE, new THREE.BoxGeometry(0.7, 1.35, 0.2), '#a79b86', { p: [STELE.x, stY + 0.72, STELE.z], r: [0, 0.6, 0] }));
  extra.push(part(THREE, new THREE.BoxGeometry(0.86, 0.18, 0.34), '#8d826f', { p: [STELE.x, stY + 1.45, STELE.z], r: [0, 0.6, 0] }));
  extra.push(part(THREE, new THREE.BoxGeometry(0.9, 0.16, 0.4), '#8d826f', { p: [STELE.x, stY + 0.06, STELE.z], r: [0, 0.6, 0] }));
  // a cinnabar plaque with the course's name, painted as five plum-blossom dots (梅花)
  const face = { x: STELE.x + Math.sin(0.6) * 0.11, z: STELE.z + Math.cos(0.6) * 0.11 };
  extra.push(part(THREE, new THREE.BoxGeometry(0.42, 0.62, 0.02), C.cinnabar, { p: [face.x, stY + 0.85, face.z], r: [0, 0.6, 0] }));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const lx = Math.cos(a) * 0.1, ly = Math.sin(a) * 0.1;
    extra.push(part(THREE, new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10), '#f1e3d0', { p: [face.x + Math.cos(0.6) * lx + Math.sin(0.6) * 0.012, stY + 0.9 + ly, face.z - Math.sin(0.6) * lx + Math.cos(0.6) * 0.012], r: [Math.PI / 2, 0.6, 0] }));
  }
  // the bell frame on the finish platform
  const fr = { x: FINISH.x + 0.45, z: FINISH.z - 0.35 };
  const fy = fin.top;
  for (const s of [-1, 1]) extra.push(part(THREE, new THREE.BoxGeometry(0.1, 1.5, 0.1), C.woodDark, { p: [fr.x + s * 0.45, fy + 0.75, fr.z], r: [0, 0, 0] }));
  extra.push(part(THREE, new THREE.BoxGeometry(1.2, 0.12, 0.14), C.cinnabar, { p: [fr.x, fy + 1.5, fr.z] }));
  const frame = inked(ctx, merge(THREE, extra), { width: 0.014 });
  frame.name = 'parkour-poles-extra';
  bag.add(frame, parent);
  bag.onDispose(ctx.addCollider({ x: STELE.x, z: STELE.z, r: 0.4, h: 1.5 }));

  // the bell, a mesh of its own so it can swing
  const bellPivot = new THREE.Group();
  bellPivot.position.set(fr.x, fy + 1.44, fr.z);
  const pts = [[0, 0], [0.05, 0], [0.12, -0.08], [0.15, -0.3], [0.19, -0.42], [0.2, -0.46], [0, -0.46]].map(([a, c]) => new THREE.Vector2(a, c));
  const bell = inked(ctx, merge(THREE, [part(THREE, new THREE.LatheGeometry(pts, 14), '#9a6b2f'), part(THREE, new THREE.TorusGeometry(0.19, 0.02, 6, 16), '#6f4b20', { p: [0, -0.4, 0], r: [Math.PI / 2, 0, 0] })]), { width: 0.012 });
  bellPivot.add(bell);
  bag.add(bellPivot, parent);

  // ── the run
  const run = new PoleRun();
  const reduced = reducedMotion();
  const P = ctx.player;
  const poleAt = (x: number, z: number, y: number): number => {
    for (let i = 0; i < POLES.length; i++) {
      const [px, pz] = POLES[i];
      if (Math.abs(x - px) <= POLE_R * 1.05 + 0.1 && Math.abs(z - pz) <= POLE_R * 1.05 + 0.1 && Math.abs(y - tops[i]) < 0.15) return i;
    }
    return -1;
  };
  const near = (x: number, z: number, m: number) => {
    if (Math.hypot(x - START.x, z - START.z) < m + START.r) return true;
    if (Math.hypot(x - FINISH.x, z - FINISH.z) < m + 1) return true;
    for (const [px, pz] of POLES) if (Math.hypot(x - px, z - pz) < m) return true;
    return false;
  };
  /** Over a deck's walkable top (as registered), give or take a margin. */
  const onDeck = (d: Deck | null, x: number, z: number, m: number) => !!d && inRect(x, z, d.cx, d.cz, d.ax, d.az, d.hl + m, d.hw + m);
  const place = (): RunPlace => {
    const p = P.position;
    if (P.isFrozen) return 'away';
    if (!near(p.x, p.z, 5)) return 'away';
    if (!P.grounded) return 'air';
    // the stone and the platform: anywhere on their tops (the walker is tested at its centre, which may
    // stand out on a corner), and anything at their height close by is them, never a fall
    const atStart = Math.abs(p.y - startTop) < 0.15;
    const atFinish = Math.abs(p.y - fin.top) < 0.2;
    if (atStart && onDeck(startDeck, p.x, p.z, 0.1)) return 'start';
    if (atFinish && onDeck(finDeck, p.x, p.z, 0.05)) return 'finish';
    if (poleAt(p.x, p.z, p.y) >= 0) return 'pole';
    if (atStart && Math.hypot(p.x - START.x, p.z - START.z) < START.r + 0.4) return 'start';
    if (atFinish && Math.hypot(p.x - FINISH.x, p.z - FINISH.z) < 1.35) return 'finish';
    // the ground among the posts is a fall; walking about well outside the course is not
    return near(p.x, p.z, 1.3) ? 'ground' : 'away';
  };
  let shown = '';
  let shownTenth = -1;
  let lastPole = -1;
  let swing = 0;
  let resetAt = 0;
  const heading = Math.atan2(POLES[0][0] - START.x, POLES[0][1] - START.z);
  const show = (s: string) => {
    if (s === shown) return;
    shown = s;
    ctx.hud.setCounter('poles', s ? { zh: '梅花桩', en: 'Poles' } : null, s);
  };
  bag.onDispose(() => ctx.hud.setCounter('poles', null));

  bag.frame((dt, t) => {
    if (resetAt && t >= resetAt) {
      resetAt = 0;
      P.teleport(START.x, START.z, heading, startTop);
    }
    const at = place();
    const was = run.phase;
    const ev = run.step(t, at);
    if (ev === 'armed') {
      lastPole = -1;
      const best = bestTime();
      if (was === 'idle') ctx.hud.toast('梅花桩 · 离石起步即计时', 'Plum-blossom poles · the clock starts when you leave the stone', 2200);
      show(best === null ? '0.0″' : `0.0″ · ${tr(ctx, '最佳', 'best')} ${fmtTime(best)}`);
    } else if (ev === 'go') {
      snd.clack(ctx.audio, 1);
    } else if (ev === 'fall') {
      snd.clack(ctx.audio, 0.5);
      ctx.hud.toast('落桩了——回到起点再来', 'Off the poles — back to the start', 1800);
      resetAt = t + (reduced ? 0.2 : 0.7);
    } else if (ev === 'abort') {
      show('');
    } else if (ev === 'finish') {
      swing = 1;
      ctx.audio.bell();
      const prev = bestTime();
      const secs = run.time;
      const r = finishReward(prev, secs);
      record('poles');
      if (r.record) recordMax('poles', poleScore(secs));
      if (r.coins) earn(r.coins);
      if (r.first) {
        flag('poles');
        ctx.hud.showCard({
          titleZh: '梅花桩', titleEn: 'Plum-Blossom Poles',
          bodyZh: `少林弟子立桩练步，桩上如履平地，方见下盘之稳。\n首次走完，用时 ${fmtTime(secs)}。\n赏铜钱 ${r.coins}。`,
          bodyEn: `Shaolin disciples trained their footwork on posts like these, until the posts felt like level ground.\nFirst run in ${fmtTime(secs)}.\n${r.coins} coins.`,
          seal: '桩',
        });
      } else if (r.record) {
        ctx.hud.toast(`新纪录 ${fmtTime(secs)}！（旧 ${fmtTime(prev!)}）铜钱 +${r.coins}`, `New best ${fmtTime(secs)}! (was ${fmtTime(prev!)}) +${r.coins} coins`, 3200);
      } else {
        ctx.hud.toast(`到！用时 ${fmtTime(secs)} · 最佳 ${fmtTime(prev!)}`, `Done in ${fmtTime(secs)} · best ${fmtTime(prev!)}`, 2600);
      }
      if (r.coins) snd.coin(ctx.audio, 3);
      const best = bestTime();
      show(`${fmtTime(secs)} · ${tr(ctx, '最佳', 'best')} ${fmtTime(best ?? secs)}`);
    }
    if (run.phase === 'running') {
      const i = at === 'pole' ? poleAt(P.position.x, P.position.z, P.position.y) : -1;
      if (i >= 0 && i !== lastPole) { lastPole = i; snd.clack(ctx.audio, 0.35); }
      // the clock in tenths: the counter is rewritten only when it changes
      const tenth = Math.floor(run.elapsed(t) * 10);
      if (tenth !== shownTenth) {
        shownTenth = tenth;
        const best = bestTime();
        const s = fmtTime(tenth / 10);
        show(best === null ? s : `${s} · ${tr(ctx, '最佳', 'best')} ${fmtTime(best)}`);
      }
    } else {
      shownTenth = -1;
      if (at === 'away' && run.phase !== 'armed') show('');
    }
    // the bell swings and settles
    if (swing > 0) {
      swing = Math.max(0, swing - dt * 0.45);
      bellPivot.rotation.x = Math.sin(t * 7) * swing * (reduced ? 0.1 : 0.45);
    }
  });

  bag.interact({
    id: 'parkour:poles-stele',
    position: new THREE.Vector3(STELE.x, stY, STELE.z),
    radius: 1.8,
    labelZh: '梅花桩', labelEn: 'Plum-Blossom Poles',
    actionZh: '读碑', actionEn: 'Read',
    act() {
      const best = bestTime();
      ctx.hud.showCard({
        titleZh: '梅花桩', titleEn: 'Plum-Blossom Poles',
        bodyZh: `少林练功，立木为桩，形如梅花。\n踏上朱石起步，桩桩相接，击钟而止；落地则从头再来。\n${best === null ? '尚未走完过。' : `最佳：${fmtTime(best)}`}`,
        bodyEn: `At Shaolin they trained on posts set like the petals of a plum blossom.\nStep on the red stone, go post to post, ring the bell to stop the clock; touch the ground and start again.\n${best === null ? 'Not finished yet.' : `Best: ${fmtTime(best)}`}`,
        seal: '桩',
      });
    },
  });
}
