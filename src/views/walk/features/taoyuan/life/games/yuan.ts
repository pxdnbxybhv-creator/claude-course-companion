// 桃源 · 二期: 纸鸢 · The singing kite (spec §5.4). 小满 on the terrace by the mouth, 昼. The valley has no
// wind (葛姑's canon): the only moving air is the cave's breath at the mouth, and the petal stream out of
// it shows the draught — the petals speed up a moment before each breath. Hold to reel in, let go to
// let out, drag (A / D) to steer into the draught's band; a tight line snaps, a slack one stalls. In the
// band the 鹞琴 sings; petal rings and 石瞽's bluebird score; 小满's kite can tangle yours. From 70 s the
// cave breathes in. Own draws: the two kites (one InstancedMesh), both lines (one LineSegments), the
// petal stream with the rings and the bird (one petal Cloud): 3.
//
// Owner: G.
import type * as T from 'three';
import { h } from '../../../minigames/ui';
import * as snd from '../../../minigames/sound';
import { kiteMesh } from '../../../minigames/npcs';
import { play } from '../../../../../../app/play';
import { hashString, makeRng } from '../../../../../../core/rng';
import { Cloud } from '../../fx';
import { CAVE, W, Y_T, standAt } from '../../places';
import { DRAUGHT_NAMES, draughtOfDay } from '../daily';
import { KITE_DIE, KITE_YING } from '../keys';
import type { Line } from '../types';
import type { GameDef, Round } from './frame';
import {
  YUAN as R, bandAt, birdAt, birdHit, breathAt, breaths, coinsFor, gradeOf, makeKite, ringHit, ringsFor, sings, snapLimit, stepKite, tangle,
  tangles, tellAt, yuanScore, yuanSealFeat, type KiteKind,
} from './logic';
import { YUAN } from './games-text';

const t = (zh: string, en: string): Line => ({ zh, en });

const STAND = { x: -1.4, z: 35.2 };

export const yuanGame: GameDef = {
  id: 'yuan',
  host: () => 'xiaoman',
  stand: STAND,
  face: { x: -1.4, z: 30 },
  hostAt: { x: 0.4, z: 34.6 },
  hostFace: { x: 0.4, z: 30 },
  leash: true,
  rules: () => YUAN.xiaoman.rules.map((line) => ({ who: 'xiaoman' as const, line })),
  twist: (day) => { const d = DRAUGHT_NAMES[draughtOfDay(day)]; return t(`洞风：${d.word.zh}（${d.outside.zh}）`, `The cave's breath: ${d.word.en} (${d.outside.en})`); },
  good: () => ({ who: 'xiaoman', line: YUAN.xiaoman.good }),
  options() {
    const f = play.peek().flags;
    return {
      label: t('纸鸢', 'Kite'),
      items: [
        { id: 'yan', name: YUAN.kites.yan, open: true },
        { id: 'die', name: YUAN.kites.die, open: !!f[KITE_DIE] },
        { id: 'ying', name: YUAN.kites.ying, open: !!f[KITE_YING] },
      ],
      pick: 'yan',
    };
  },
  play(r: Round, option: string | null) {
    const { ctx, tv } = r;
    const TH = ctx.THREE;
    const fx = tv.fx;
    if (!fx) { r.quit(); return; }
    const kind: KiteKind = option === 'die' || option === 'ying' ? option : 'yan';
    const draught = draughtOfDay(r.day);
    const seed = hashString(`${r.day}:tyl:yuan:${performance.now() | 0}`);
    const rng = makeRng(seed);
    const bs = breaths(draught, seed);
    const rings = ringsFor(seed);
    const lead = r.gentle ? R.tellGentle : R.tell;
    const fy = Y_T;

    // ── the view: low behind the walker, looking up past the kite at the sky and the rim (~35°)
    const sw = W(STAND.x, STAND.z);
    const sy = fy + standAt(STAND.x, STAND.z);
    r.view({ x: sw.x + 0.6, y: sy + 1.1, z: sw.z + 3.2 }, { x: sw.x, y: sy + 1.1 + 18 * Math.tan((35 * Math.PI) / 180), z: sw.z - 18 });

    // ── the kites (one InstancedMesh: yours, 小满's)
    const proto = kiteMesh(ctx, kind === 'ying' ? '#6b5a44' : kind === 'die' ? '#f1d27a' : '#f4efe4', kind === 'ying' ? '#5b4a36' : kind === 'die' ? '#d8583a' : '#3d5a73');
    const kites = new TH.InstancedMesh(proto.geometry, proto.material as T.Material, 2);
    kites.frustumCulled = false;
    kites.userData.pocket = true;
    ctx.regionGroup('taoyuan').add(kites);
    // ── both lines (one LineSegments, 12 sagging segments each)
    const SEG = 12;
    const linePos = new Float32Array(2 * SEG * 2 * 3);
    const lg = new TH.BufferGeometry();
    lg.setAttribute('position', new TH.BufferAttribute(linePos, 3));
    const lines = new TH.LineSegments(lg, new TH.LineBasicMaterial({ color: '#3a332c', transparent: true, opacity: 0.6 }));
    lines.frustumCulled = false;
    lines.userData.pocket = true;
    ctx.regionGroup('taoyuan').add(lines);
    // ── the petal stream out of the mouth, the rings and the bird (one petal Cloud, valley-local)
    const NP = Math.max(20, Math.round(40 * ctx.quality.density * (fx.low ? 0.5 : 1)));
    const RP = 16, BIRD = 3;
    const pet = new Cloud(fx, NP + RP + BIRD, 'petal');
    const pp = Array.from({ length: NP }, () => ({ s: rng(), o: rng() * 2 - 1, y: rng(), spin: rng() * 6 }));
    const pink = new TH.Color('#f0b3c1'), ringC = new TH.Color('#e98aa2'), blue = new TH.Color('#4a7fb5');
    r.onStop(() => {
      kites.removeFromParent(); proto.geometry.dispose(); (proto.material as T.Material).dispose();
      lines.removeFromParent(); lg.dispose(); (lines.material as T.Material).dispose();
      pet.dispose();
      try { snd.whistle(0); } catch { /* optional */ }
    });

    // ── the HUD
    const pad = h('div', 'tyg-pad', undefined, r.root);
    const top = h('div', 'tyg-top mg-live', undefined, r.root);
    h('b', 'brush', r.tr(YUAN.kites[kind]), top);
    const hEl = h('span', 'tyg-num', '0', top);
    h('small', '', r.tr(YUAN.height), top);
    const clock = h('small', 'tyg-clock', '', top);
    const meter = h('div', 'tyg-tension', undefined, r.root);
    h('span', '', r.tr(YUAN.tension), meter);
    const bar = h('div', 'tyg-tension-bar', undefined, meter);
    const fill = h('i', '', undefined, bar);
    const mark = h('b', '', undefined, bar);
    const limit = snapLimit(r.gentle, r.mood);
    mark.style.left = `${(limit / R.tMax) * 100}%`;
    const singEl = h('div', 'tyg-sing', r.tr(YUAN.sing), r.root);
    const hint = h('div', 'tyg-hint', r.tr(matchMedia('(pointer: coarse)').matches ? YUAN.hint : YUAN.hintKeys), r.root);
    r.later(6000, () => hint.classList.add('is-fade'));

    // ── input: hold to reel in; drag (A / D) to steer
    let holding = false, steer = 0, dragX = 0, ptr = -1;
    const pd = (e: PointerEvent) => { e.preventDefault(); holding = true; ptr = e.pointerId; dragX = e.clientX; steer = 0; };
    const pm = (e: PointerEvent) => { if (e.pointerId !== ptr || !holding) return; steer = Math.max(-1, Math.min(1, (e.clientX - dragX) / (innerWidth * 0.18))); };
    const pu = (e: PointerEvent) => { if (e.pointerId !== ptr) return; holding = false; steer = 0; ptr = -1; };
    pad.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      if (document.querySelector('.walk-say-wrap')) return;
      if (!['Space', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      keys.add(e.code);
    };
    const ku = (e: KeyboardEvent) => { if (keys.delete(e.code)) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    r.onStop(() => {
      pad.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
    });

    // ── the flight
    const s = makeKite();
    const mine = { h: s.h, x: 0 };
    const xm = { h: 30, x: 0.5 };
    let sung = 0, ringsGot = 0, bird = false, birdUntil = -1, over = false, inhaleSaid = false;
    const ringDone = new Set<number>();
    const tmp = new TH.Vector3(), m4 = new TH.Matrix4(), q = new TH.Quaternion(), sc = new TH.Vector3(1.4, 1.4, 1.4), e3 = new TH.Euler();
    /** A kite's world point: 尺 up (compressed into the view), x across the draught. */
    const kiteAt = (hh: number, x: number, out: T.Vector3) => {
      const up = 2.5 + Math.max(0, hh) * 0.075;
      const out2 = 6 + Math.max(0, hh) * 0.055;
      return out.set(sw.x + x * 7, sy + up, sw.z - out2);
    };
    const hand = new TH.Vector3();
    const xmHand = r.at(0.4, 34.6, 1.0);
    const writeLine = (k: number, a: T.Vector3, b: T.Vector3, slack: number) => {
      for (let i = 0; i < SEG; i++) {
        for (let e = 0; e < 2; e++) {
          const u = (i + e) / SEG;
          const sag = Math.sin(u * Math.PI) * slack;
          const o = ((k * SEG + i) * 2 + e) * 3;
          linePos[o] = a.x + (b.x - a.x) * u;
          linePos[o + 1] = a.y + (b.y - a.y) * u - sag;
          linePos[o + 2] = a.z + (b.z - a.z) * u;
        }
      }
    };
    const end = (why: 'time' | 'snap') => {
      if (over) return;
      over = true;
      try { snd.whistle(0); } catch { /* optional */ }
      const score = yuanScore(s.maxH, ringsGot, bird, sung);
      const grade = gradeOf('yuan', score);
      const flags: string[] = [];
      if (grade !== '初') flags.push(KITE_DIE);
      if (grade === '精') flags.push(KITE_YING);
      const newKite = flags.some((f) => !play.peek().flags[f]);
      r.finish({
        score,
        measure: score,
        feat: yuanSealFeat(s.maxH),
        yue: Math.floor(s.maxH),
        coins: coinsFor('yuan', score),
        lines: [t(
          `最高 ${Math.floor(s.maxH)} 尺 · 花环 ${ringsGot} · 鹞琴 ${Math.floor(sung)} 息${bird ? ' · 青鸟落线' : ''}${why === 'snap' ? ' · 线断了' : ''}`,
          `Highest ${Math.floor(s.maxH)} ft · rings ${ringsGot} · sang ${Math.floor(sung)} s${bird ? ' · the bluebird perched' : ''}${why === 'snap' ? ' · the line snapped' : ''}`,
        ), ...(newKite ? [YUAN.kiteNew] : [])],
        say: { who: 'xiaoman', line: grade === '初' ? YUAN.xiaoman.lose : YUAN.xiaoman.win },
        flags,
      });
    };

    r.frame((dt, tt) => {
      if (over) return;
      const hold = holding || keys.has('Space');
      const st = steer + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const inhale = tt >= R.inhaleFrom;
      const b = inhale ? null : breathAt(bs, tt);
      const band = bandAt(tt, seed % 7);
      const was = s.h;
      const ev = stepKite(s, dt, { t: tt, holding: hold, steer: Math.max(-1, Math.min(1, st)), strength: b?.strength ?? 0, band, inhale, kite: kind, gentle: r.gentle, mood: r.mood });
      void was;
      if (ev === 'snap') { r.say('xiaoman', YUAN.xiaoman.snap, 2200); try { snd.snap(); } catch { /* optional */ } end('snap'); return; }
      if (ev === 'crash') r.say('xiaoman', YUAN.xiaoman.crash, 2400);
      if (inhale && !inhaleSaid) { inhaleSaid = true; r.say('xiaoman', YUAN.xiaoman.inhale, 2200); }
      const down = tt < s.downTo;
      mine.h = s.h; mine.x = s.x;
      // 鹞琴: sings in the band
      const singing = !down && sings(s.x, band, b?.strength ?? 0);
      if (singing) sung += dt;
      singEl.classList.toggle('is-on', singing);
      try { snd.whistle(singing ? 0.35 + 0.5 * (b?.strength ?? 0) : 0); } catch { /* optional */ }
      // the rings (30–70 s, one at a time) and the bird
      let ringNow: (typeof rings)[number] | null = null;
      rings.forEach((rg, i) => {
        if (tt < rg.from || tt >= rg.to || ringDone.has(i)) return;
        ringNow = rg;
        if (!down && ringHit(mine, rg)) { ringDone.add(i); ringsGot++; r.pop(`${r.tr(YUAN.ring)} +${R.ringPts}`); try { ctx.audio.pluck(3, 0.5); } catch { /* optional */ } }
      });
      const bd = birdAt(tt, seed);
      if (bd && !bird && !down && birdHit(mine, bd)) { bird = true; birdUntil = tt + R.birdStay; r.say('xiaoman', YUAN.xiaoman.bird, 2000); r.pop(`+${R.birdPts}`, 'is-red'); }
      // 小满's kite beside yours (never tangles under 甜)
      xm.x = Math.max(-1, Math.min(1, band + 0.42 * Math.sin(tt * 0.37 + 1)));
      xm.h = Math.max(18, s.h * 0.85 + 24 * Math.sin(tt * 0.23));
      if (!down && tt >= s.tumbleTo && tangles(mine, xm, r.mood)) { tangle(s, tt); r.say('xiaoman', YUAN.xiaoman.tangle, 2200); }
      // ── draw: the kites
      const tumbling = tt < s.tumbleTo;
      kiteAt(down ? 0 : s.h, s.x, tmp);
      e3.set(-0.25 + (hold ? 0.1 : 0), 0, tumbling ? tt * 9 : Math.sin(tt * 2.1) * 0.12 + st * 0.25);
      q.setFromEuler(e3);
      m4.compose(tmp, q, sc);
      kites.setMatrixAt(0, m4);
      const k0 = tmp.clone();
      kiteAt(xm.h, xm.x, tmp);
      e3.set(-0.25, 0, Math.sin(tt * 1.7 + 2) * 0.15);
      q.setFromEuler(e3);
      m4.compose(tmp, q, sc);
      kites.setMatrixAt(1, m4);
      kites.instanceMatrix.needsUpdate = true;
      // the lines
      hand.copy(ctx.player.position); hand.y += 1.1;
      writeLine(0, hand, k0, Math.max(0.05, (1 - s.T) * 1.4));
      writeLine(1, xmHand, tmp, 0.7);
      lg.attributes.position.needsUpdate = true;
      // the petal stream: out of the mouth (in on the inhale), faster in a breath and just before one
      const tell = tellAt(bs, tt, lead);
      const speed = inhale ? -0.25 : b ? 0.22 + 0.4 * b.strength : tell ? 0.3 : 0.05;
      for (let i = 0; i < NP; i++) {
        const p = pp[i];
        p.s = (p.s + speed * dt + 1) % 1;
        const lx = STAND.x + (band * 7 + p.o * 1.6) * p.s;
        const lz = CAVE.mouth - 1 - p.s * 26;
        const ly = standAt(STAND.x, STAND.z) + 0.8 + p.y * 0.6 + p.s * (4 + p.y * 10);
        pet.set(i, lx, ly, lz, 0.12, 0.9 * Math.sin(p.s * Math.PI), pink, p.spin + tt * (1 + speed * 4));
      }
      // the ring now: a circle of petals at its height
      for (let j = 0; j < RP; j++) {
        const idx = NP + j;
        if (!ringNow) { pet.set(idx, 0, -50, 0, 0, 0); continue; }
        const rg = ringNow as (typeof rings)[number];
        kiteAt(rg.h, rg.x, tmp);
        const a = (j / RP) * Math.PI * 2;
        const lx = tmp.x - W(0, 0).x + Math.cos(a) * 1.1, ly = tmp.y - fy + Math.sin(a) * 1.1, lz = tmp.z - W(0, 0).z;
        pet.set(idx, lx, ly, lz, 0.28, 0.9, ringC, a);
      }
      // the bluebird: across once, perched on your line for 5 s if brushed
      for (let j = 0; j < BIRD; j++) {
        const idx = NP + RP + j;
        const perched = bird && tt < birdUntil;
        const at = perched ? { h: s.h * 0.7, x: s.x * 0.7 } : bd;
        if (!at || (bird && !perched)) { pet.set(idx, 0, -50, 0, 0, 0); continue; }
        kiteAt(at.h, at.x, tmp);
        pet.set(idx, tmp.x - W(0, 0).x + (j - 1) * 0.18, tmp.y - fy + (j === 1 ? 0.06 : 0), tmp.z - W(0, 0).z, 0.3, 1, blue, j);
      }
      pet.flush();
      // the HUD
      hEl.textContent = String(Math.max(0, Math.floor(down ? 0 : s.h)));
      fill.style.width = `${Math.min(100, (s.T / R.tMax) * 100)}%`;
      fill.classList.toggle('is-hot', s.T > limit * 0.85);
      clock.textContent = String(Math.max(0, Math.ceil(R.round - tt)));
      if (tt >= R.round) end('time');
    });
  },
};
