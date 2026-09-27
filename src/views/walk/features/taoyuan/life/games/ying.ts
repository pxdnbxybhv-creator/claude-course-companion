// 桃源 · 二期: 捉萤 · Catching fireflies (spec §5.5). On the stream bank at 夜: 小满 hosts until nine, then
// 阿黍 (he is always there). A swipe sweeps the gauze fan across the screen; a firefly is caught only
// if it is lit as the stroke passes over it — a dark one scatters and stays dark. Each kind flashes
// its own code; the gold 萤王 comes once, flying straight while dark, so you lead it; the last 20 s
// every firefly flashes together (同步). At the end the jar is opened and the catch spirals away.
// FX17 (the valley's own fireflies) rests meanwhile. Own draws: one glow Cloud.
//
// Owner: G.
import type * as T from 'three';
import { h } from '../../../minigames/ui';
import * as snd from '../../../minigames/sound';
import { hashString, makeRng } from '../../../../../../core/rng';
import { Cloud } from '../../fx';
import { W, Y_T, standAt } from '../../places';
import { seeFocus } from '../../valley';
import { KING_CODES, kingOfDay } from '../daily';
import type { Line, VillagerKey } from '../types';
import type { GameDef, Round } from './frame';
import {
  FLY_POINTS, YING as R, coinsFor, flyLit, fliesWanted, gradeOf, leadPoint, netBonus, sweep, syncPhase, yingSealFeat, type FlyKind,
} from './logic';
import { YING } from './games-text';

const t = (zh: string, en: string): Line => ({ zh, en });
const late = (hour: number) => hour >= 21 || hour < 5;

const STAND = { x: 4.3, z: 16.4 };
/** The play volume (valley-local): over the stream and the reeds beyond it. */
const VOL = { x0: -0.6, x1: 3.2, z0: 14.2, z1: 19.2 };

export const yingGame: GameDef = {
  id: 'ying',
  host: (hour) => (late(hour) ? 'ashu' : 'xiaoman'),
  stand: STAND,
  face: { x: 1.2, z: 16.6 },
  hostAt: { x: 4.6, z: 15.0 },
  hostFace: { x: 1.2, z: 16.6 },
  rules: (hour) => late(hour)
    ? YING.ashu.late.map((line) => ({ who: 'ashu' as const, line }))
    : [{ who: 'xiaoman' as const, line: YING.xiaoman.rules[0] }, { who: 'ashu' as const, line: YING.ashu.rules[0] }],
  twist: (day) => { const k = KING_CODES[kingOfDay(day)]; return t(`萤王的暗号：${k.zh}`, `The Firefly King's code: ${k.en}`); },
  good: () => ({ who: 'ashu', line: YING.ashu.good }),
  play(r: Round) {
    const { ctx, tv } = r;
    const TH = ctx.THREE;
    const fx = tv.fx;
    if (!fx) { r.quit(); return; }
    const code = kingOfDay(r.day);
    const rng = makeRng(hashString(`${r.day}:tyl:ying:${performance.now() | 0}`));
    const host: VillagerKey = late(r.hour) ? 'ashu' : 'xiaoman';
    const radius = r.gentle ? R.hitPxGentle : R.hitPx;

    // FX17 rests; the fan in hand
    try { fx.fireflies(false); } catch { /* optional */ }
    r.onStop(() => { try { fx.fireflies(r.part === 'dusk' || r.part === 'night'); } catch { /* optional */ } });
    try { ctx.player.holdProp('fan'); } catch { /* optional */ }

    // the view: a fixed three-quarter from the far bank, down over the stream and the swarm toward the
    // bridge and the lit lanes — clear of every peach crown and trunk (it was behind the walker, among
    // the bank trees); the peaches' see-through keeps to the swarm (the life restore gives it back)
    const swarm = r.at((VOL.x0 + VOL.x1) / 2, (VOL.z0 + VOL.z1) / 2, 0.9);
    r.view(r.at(1.9, 19.9, 2.1), swarm, 1.3);
    seeFocus.at = { x: swarm.x, y: swarm.y, z: swarm.z };
    r.onStop(() => { seeFocus.at = null; });

    // ── the fireflies (one glow Cloud; valley-local)
    const N = Math.max(30, Math.round(60 * ctx.quality.density * (fx.low ? 0.5 : 1)));
    type Fly = { kind: FlyKind; x: number; y: number; z: number; ph: number; vx: number; vz: number; on: boolean; dark: number; caught: boolean; gone: number; hx: number; hz: number };
    const floorY = (x: number, z: number) => standAt(x, z);
    const newFly = (kind: FlyKind): Fly => {
      const x = VOL.x0 + rng() * (VOL.x1 - VOL.x0), z = VOL.z0 + rng() * (VOL.z1 - VOL.z0);
      return { kind, x, z, hx: x, hz: z, y: floorY(x, z) + 0.35 + rng() * 1.3, ph: rng() * 5, vx: 0, vz: 0, on: false, dark: 0, caught: false, gone: 0 };
    };
    const flies: Fly[] = [];
    const kindAt = (tt: number): FlyKind => {
      const q = rng();
      if (tt < R.denseFrom) return q < 0.6 ? 'dan' : 'chang';
      return q < 0.35 ? 'dan' : q < 0.55 ? 'chang' : q < 0.8 ? 'shuang' : 'you';
    };
    for (let i = 0; i < N; i++) { const f = newFly(kindAt(0)); f.on = i < fliesWanted(0); flies.push(f); }
    let king: Fly | null = null;
    const cloud = new Cloud(fx, N + 1 + 24, 'glow');
    const cA = new TH.Color('#e8f59a'), cB = new TH.Color('#ffd98a'), gold = new TH.Color('#ffc23a'), dim = new TH.Color('#6a7a4a');
    r.onStop(() => cloud.dispose());

    // ── the HUD: the count, the clock, the fan's trail
    const pad = h('div', 'tyg-pad', undefined, r.root);
    const trail = h('canvas', 'tyg-trail', undefined, r.root);
    const tg = trail.getContext('2d');
    const top = h('div', 'tyg-top mg-live', undefined, r.root);
    h('b', 'brush', r.tr(t('捉萤', 'Fireflies')), top);
    const scoreEl = h('span', 'tyg-num', '0', top);
    const countEl = h('small', '', '', top);
    const clock = h('small', 'tyg-clock', '', top);
    const reticle = h('i', 'tyg-reticle', undefined, r.root);
    const hint = h('div', 'tyg-hint', r.tr(matchMedia('(pointer: coarse)').matches ? YING.hint : YING.hintKeys), r.root);
    r.later(6000, () => hint.classList.add('is-fade'));
    const dpr = Math.min(2, devicePixelRatio || 1);
    const sizeTrail = () => { trail.width = Math.round(innerWidth * dpr); trail.height = Math.round(innerHeight * dpr); };
    sizeTrail();
    addEventListener('resize', sizeTrail);
    r.onStop(() => removeEventListener('resize', sizeTrail));

    let score = 0, count = 0, gotKing = false, tNow = 0;
    // 甜: the host tips one into your jar at the start
    if (r.mood === '甜') { score += 1; count += 1; r.later(900, () => r.say(host, host === 'xiaoman' ? YING.xiaoman.sweet : YING.ashu.sweet, 1800)); }

    // ── the strokes
    const G0 = W(0, 0);
    const v3 = new TH.Vector3();
    const toScreen = (f: Fly): { sx: number; sy: number; front: boolean } => {
      v3.set(G0.x + f.x, Y_T + f.y, G0.z + f.z).project(ctx.camera);
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      return { sx: rect.left + (v3.x + 1) / 2 * rect.width, sy: rect.top + (1 - v3.y) / 2 * rect.height, front: v3.z < 1 };
    };
    let stroke: { pts: { x: number; y: number; at: number }[]; len: number; caught: number } | null = null;
    let cool = 0;
    const segs: { ax: number; ay: number; bx: number; by: number; at: number }[] = [];
    const sweepSeg = (ax: number, ay: number, bx: number, by: number) => {
      if (!stroke) return;
      const max = innerWidth * R.strokeMax;
      const l = Math.hypot(bx - ax, by - ay);
      if (stroke.len + l > max) { const k = Math.max(0, (max - stroke.len) / (l || 1)); bx = ax + (bx - ax) * k; by = ay + (by - ay) * k; }
      stroke.len += Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, at: tNow });
      const vis = flies.map((f) => { const s = toScreen(f); return { sx: s.sx, sy: s.sy, lit: f.on && !f.caught && tNow >= f.dark && lit(f, tNow), on: f.on && !f.caught && s.front }; });
      const kIdx = king ? flies.length : -1;
      if (king) { const s = toScreen(king); vis.push({ sx: s.sx, sy: s.sy, lit: !king.caught && lit(king, tNow), on: !king.caught && s.front }); }
      const out = sweep({ ax, ay, bx, by }, vis, radius);
      for (const i of out.caught) {
        const f = i === kIdx ? king! : flies[i];
        f.caught = true; f.gone = tNow;
        score += FLY_POINTS[f.kind]; count++;
        stroke.caught++;
        if (f.kind === 'wang') { gotKing = true; r.pop(r.tr(YING.king), 'is-red'); try { ctx.audio.chime(5); } catch { /* optional */ } }
        else try { snd.at('pluck', snd.now(), { note: 3 + (stroke.caught % 4), level: 0.35 }); } catch { /* optional */ }
      }
      for (const i of out.scattered) {
        const f = i === kIdx ? king! : flies[i];
        const a = rng() * Math.PI * 2;
        f.x += Math.cos(a) * R.scatter; f.z += Math.sin(a) * R.scatter;
        f.dark = tNow + R.darkFor;
      }
      if (stroke.len >= max - 0.5) endStroke();
    };
    const endStroke = () => {
      if (!stroke) return;
      const b = netBonus(stroke.caught);
      if (b) { score += b; r.pop(`${r.tr(YING.net)} +${b}`, 'is-red'); }
      stroke = null;
      cool = tNow + R.cooldown;
    };
    const begin = (x: number, y: number) => {
      if (tNow < cool || over) return false;
      stroke = { pts: [{ x, y, at: tNow }], len: 0, caught: 0 };
      try { snd.swish(0.5); } catch { /* optional */ }
      return true;
    };
    let ptr = -1;
    const pd = (e: PointerEvent) => { e.preventDefault(); if (begin(e.clientX, e.clientY)) ptr = e.pointerId; };
    const pm = (e: PointerEvent) => {
      if (e.pointerId !== ptr || !stroke) return;
      const last = stroke.pts[stroke.pts.length - 1];
      stroke.pts.push({ x: e.clientX, y: e.clientY, at: tNow });
      sweepSeg(last.x, last.y, e.clientX, e.clientY);
    };
    const pu = (e: PointerEvent) => { if (e.pointerId === ptr) { ptr = -1; endStroke(); } };
    pad.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    // keys: WASD move a reticle, Space sweeps across it
    const ret = { x: innerWidth / 2, y: innerHeight / 2 };
    const keys = new Set<string>();
    let keySweep: { t0: number; x0: number; y: number; dir: number } | null = null;
    const kd = (e: KeyboardEvent) => {
      if (document.querySelector('.walk-say-wrap')) return;
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      keys.add(e.code);
      reticle.classList.add('is-on');
      if (e.code === 'Space' && !e.repeat && !keySweep) {
        const w = innerWidth * R.strokeMax * 0.8;
        const dir = keys.has('KeyA') ? -1 : 1;
        if (begin(ret.x - (dir * w) / 2, ret.y)) keySweep = { t0: tNow, x0: ret.x - (dir * w) / 2, y: ret.y, dir };
      }
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

    const lit = (f: Fly, tt: number) => flyLit(f.kind, tt, f.ph, code);
    let over = false, releaseAt = -1, syncSaid = false;
    const spiral: { a: number; r: number; y: number }[] = [];

    r.frame((dt, tt) => {
      tNow = tt;
      // keys: the reticle, and a Space sweep across it over 0.18 s
      const kx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), ky = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
      if (kx || ky) { ret.x = Math.max(0, Math.min(innerWidth, ret.x + kx * 420 * dt)); ret.y = Math.max(0, Math.min(innerHeight, ret.y + ky * 420 * dt)); }
      reticle.style.transform = `translate(${ret.x}px, ${ret.y}px)`;
      if (keySweep && stroke) {
        const w = innerWidth * R.strokeMax * 0.8;
        const k = Math.min(1, (tt - keySweep.t0) / 0.18);
        const last = stroke.pts[stroke.pts.length - 1];
        const nx = keySweep.x0 + keySweep.dir * w * k;
        stroke.pts.push({ x: nx, y: keySweep.y, at: tt });
        sweepSeg(last.x, last.y, nx, keySweep.y);
        if (k >= 1) { endStroke(); keySweep = null; }
      } else if (keySweep && !stroke) keySweep = null;
      // the curve: 15, then 30 about; the 萤王 at ~40 s
      const want = fliesWanted(tt);
      let on = 0;
      for (const f of flies) if (f.on && !f.caught) on++;
      for (const f of flies) {
        if (on >= want) break;
        if (!f.on || (f.caught && tt - f.gone > 1)) { Object.assign(f, newFly(kindAt(tt))); f.on = true; on++; }
      }
      if (!king && tt >= R.kingAt && tt < R.syncFrom) {
        const fromLeft = rng() < 0.5;
        king = newFly('wang');
        king.x = fromLeft ? VOL.x0 : VOL.x1; king.z = VOL.z0 + 1 + rng() * 3;
        king.vx = (fromLeft ? 1 : -1) * R.kingSpeed; king.vz = (rng() - 0.5) * 0.2;
        king.on = true;
      }
      if (tt >= R.syncFrom && !syncSaid) { syncSaid = true; r.pop(r.tr(YING.sync)); }
      // movement: 游光 drifts while lit; the 萤王 flies straight while dark (it hovers when lit)
      for (const f of flies) {
        if (!f.on || f.caught) continue;
        f.ph += 0; // (their codes run on the round clock)
        const bob = Math.sin(tt * 0.9 + f.ph * 3) * 0.12 * dt;
        f.y += bob;
        if (f.kind === 'you' && lit(f, tt)) {
          const a = f.ph * 2 + tt * 0.4;
          f.x += Math.cos(a) * R.youSpeed * dt; f.z += Math.sin(a) * R.youSpeed * dt;
        } else { f.x += (f.hx - f.x) * 0.2 * dt; f.z += (f.hz - f.z) * 0.2 * dt; }
        f.x = Math.max(VOL.x0 - 0.5, Math.min(VOL.x1 + 0.5, f.x)); f.z = Math.max(VOL.z0 - 0.5, Math.min(VOL.z1 + 0.5, f.z));
      }
      if (king && !king.caught) {
        if (!lit(king, tt)) { king.x += king.vx * dt; king.z += king.vz * dt; }
        if (king.x < VOL.x0 - 1 || king.x > VOL.x1 + 1) king.vx = -king.vx;
      }
      // ── draw
      let i = 0;
      const set = (f: Fly, a: number, c: T.Color, s: number) => cloud.set(i++, f.x, f.y, f.z, s, a, c);
      for (const f of flies) {
        if (!f.on) { cloud.set(i++, 0, -50, 0, 0, 0); continue; }
        if (f.caught) {
          // into the jar at the walker's side
          const k = Math.min(1, (tt - f.gone) / 0.6);
          const jx = STAND.x - 0.2, jz = STAND.z + 0.3, jy = floorY(STAND.x, STAND.z) + 0.8;
          cloud.set(i++, f.x + (jx - f.x) * k, f.y + (jy - f.y) * k, f.z + (jz - f.z) * k, 0.12, 1 - k, cB);
          continue;
        }
        const l = tt >= f.dark && lit(f, tt);
        set(f, l ? 1 : 0.1, l ? (f.kind === 'you' ? cB : cA) : dim, l ? 0.36 : 0.12);
      }
      if (king && !king.caught) { const l = lit(king, tt); cloud.set(i++, king.x, king.y, king.z, l ? 0.5 : 0.14, l ? 1 : 0.18, gold); }
      else cloud.set(i++, 0, -50, 0, 0, 0);
      // the release: the catch spirals up from the jar (2 s)
      for (let j = 0; j < 24; j++) {
        const sp = spiral[j];
        if (!sp || releaseAt < 0) { cloud.set(i++, 0, -50, 0, 0, 0); continue; }
        const k = (tt - releaseAt) / 2;
        const a = sp.a + k * 6, rr = 0.2 + k * 1.4;
        cloud.set(i++, STAND.x - 0.2 + Math.cos(a) * rr, floorY(STAND.x, STAND.z) + 0.8 + k * 3.5 + sp.y, STAND.z + 0.3 + Math.sin(a) * rr, 0.22, Math.max(0, 1 - k), j % 3 ? cA : cB);
      }
      cloud.flush();
      // the fan's trail
      if (tg) {
        tg.clearRect(0, 0, trail.width, trail.height);
        tg.lineCap = 'round';
        for (let k = segs.length - 1; k >= 0; k--) {
          const s = segs[k];
          const age = tt - s.at;
          if (age > 0.4) { segs.splice(k, 1); continue; }
          tg.strokeStyle = `rgba(246,240,220,${0.5 * (1 - age / 0.4)})`;
          tg.lineWidth = radius * 1.6 * dpr * (1 - age / 0.4);
          tg.beginPath(); tg.moveTo(s.ax * dpr, s.ay * dpr); tg.lineTo(s.bx * dpr, s.by * dpr); tg.stroke();
        }
      }
      scoreEl.textContent = String(score);
      countEl.textContent = `${r.tr(YING.caught)} ${count}`;
      clock.textContent = String(Math.max(0, Math.ceil(R.round - tt)));
      pad.classList.toggle('is-sync', syncPhase(tt));
      // the end: the host opens the jar; the catch spirals away (2 s); then the card
      if (tt >= R.round && !over) {
        over = true;
        endStroke();
        r.say(host, host === 'xiaoman' ? YING.xiaoman.free : YING.ashu.free, 2400);
        releaseAt = tt;
        for (let j = 0; j < Math.min(24, count); j++) spiral.push({ a: rng() * Math.PI * 2, r: 0, y: rng() * 0.4 });
        r.later(2000, () => {
          const grade = gradeOf('ying', score);
          r.finish({
            score,
            measure: score,
            feat: yingSealFeat(gotKing, score),
            yue: count,
            coins: coinsFor('ying', score),
            lines: [t(`捉了 ${count} 只${gotKing ? ' · 萤王' : ''}`, `${count} caught${gotKing ? ' · the Firefly King' : ''}`)],
            say: grade !== '初' ? { who: 'ashu', line: YING.ashu.win } : host === 'xiaoman' ? { who: 'xiaoman', line: YING.xiaoman.lose } : { who: 'ashu', line: YING.ashu.lose },
            after: () => r.bag.later(7600, () => ctx.hud.toast(`阿黍：「${YING.ashu.after.zh}」`, `A Shu: "${YING.ashu.after.en}"`, 3000)),
          });
        });
      }
    });
    void leadPoint;
  },
};
