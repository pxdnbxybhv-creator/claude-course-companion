// 水月幻镜 · the named elites (GDD §13.1), their 镜印 affixes, and the two treasures (§13.2). The
// core already scales an elite's HP, damage and speed, gives it the elite knockback resist and pays
// its 12 月华, 镜奁 and planned 铜钱 on death; content moves it and makes it attack. Every attack is
// announced in wet vermilion ink first. Damage is the elite's own scaled contact damage × a factor.
import { AFFIX_REG, ELITE_REG, type AffixId, type EliteId, type TreasureId } from '../../ids';
import type { ActorImpl, AffixImpl, TeleShape, WorldApi } from '../../types';
import { AFFIXES, ELITES, TREASURES } from '../../data';
import { armorMult } from '../../logic/formulas';
import { affixesOf, contactT, expire, fxLine, nearestSummon, setAir, setHp, setLook, setReflect, slowPlayer } from './bridge';
import { CoRun, TAU, b, dist, hurtPlayer, playerIn, rayToWall, reflect, rimR, shared, swarmOf, teleT, toPlayer, type Co } from './util';

// ─────────────────────────────────────────────── helpers

/** Steer body h toward (x, y) at `speed` (the core integrates vx/vy with slow, root and knockback). */
function steer(w: WorldApi, h: number, x: number, y: number, speed: number): void {
  const e = w.enemy(h);
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  if (d < 2) { e.vx = 0; e.vy = 0; return; }
  e.vx = (dx / d) * speed; e.vy = (dy / d) * speed;
}
const stop = (w: WorldApi, h: number) => { const e = w.enemy(h); e.vx = 0; e.vy = 0; };
/** The elite's hit on you: its scaled damage × k (and 噬 heals it for 20% of what landed). */
export function eliteHit(w: WorldApi, h: number, k: number, src: string, o: { undodgeable?: boolean } = {}): void {
  if (!w.alive(h)) return;
  const e = w.enemy(h);
  const before = w.player.hp;
  hurtPlayer(w, e.dmg * k, src, { undodgeable: o.undodgeable, from: { x: e.x, y: e.y } });
  const dealt = before - w.player.hp;
  if (dealt > 0 && shared(w).devour.has(h) && w.alive(h)) {
    const v = w.enemy(h);
    v.hp = Math.min(v.hpMax, v.hp + dealt * AFFIXES.devour.p.heal);
  }
}
/** An elite telegraph whose strike runs only while the elite still lives. */
function strikeTele(w: WorldApi, h: number, shape: TeleShape, dur: number, fn: (w: WorldApi) => void): void {
  w.tele({ shape, dur, then: (ww) => { if (ww.alive(h)) fn(ww); } });
}

/** An elite as a coroutine per body (its `mem` keeps nothing; the state object does). */
interface ES { run: CoRun; c: { w: WorldApi; h: number; dt: number }; t: number }
function coActor(body: (c: { w: WorldApi; h: number; dt: number }) => Co, extra?: { hit?: ActorImpl['hit']; init?: (w: WorldApi, h: number) => void; death?: (w: WorldApi, h: number) => void; quiet?: boolean }): ActorImpl<ES> {
  return {
    init(w, h) {
      if (!extra?.quiet) announce(w, h);
      extra?.init?.(w, h);
      const c = { w, h, dt: w.dt };
      return { run: new CoRun(body(c)), c, t: 0 };
    },
    tick(w, h, s, dt) {
      s.c.w = w; s.c.h = h; s.c.dt = dt; s.t += dt;
      if (!s.run.tick(dt)) s.run = new CoRun(body(s.c));
    },
    hit: extra?.hit as ActorImpl<ES>['hit'],
    death(w, h, s) { s.run.stop(); extra?.death?.(w, h); },
  };
}
/** Set while 裂 spawns its copies (they arrive without a fanfare). */
let spawningCopies = false;
/** A named elite enters with its name (and its 镜印) brushed at the screen's edge; 裂 copies stay quiet. */
function announce(w: WorldApi, h: number): boolean {
  const e = w.enemy(h);
  const row = ELITE_REG.find((r) => r.id === e.id);
  if (!row || spawningCopies) return false;
  const affs = affixesOf(w, h).map((a) => AFFIX_REG.find((r) => r.id === a)!);
  const zh = affs.length ? `${row.zh} · ${affs.map((a) => a.zh).join('')}` : row.zh;
  const en = affs.length ? `${row.en} · ${affs.map((a) => a.en).join(', ')}` : row.en;
  w.title(b(zh, en), 'edge');
  return true;
}
/** Chase for `sec` seconds (or until `until` says stop). */
function* chase(c: { w: WorldApi; h: number }, sec: number, speedK = 1, keepAt = 0, until?: () => boolean): Co {
  for (let t = 0; t < sec; t += c.w.dt) {
    const w = c.w, e = w.enemy(c.h);
    if (until?.()) return;
    const d = dist(e.x, e.y, w.player.x, w.player.y);
    if (keepAt > 0 && d < keepAt) stop(w, c.h); else steer(w, c.h, w.player.x, w.player.y, e.speed * speedK);
    yield 0;
  }
}

// ─────────────────────────────────────────────── 巨鳌 · the shell ricochet

/** Withdraws into its shell and ricochets off 3 walls (each line shown 0.8 s ahead), then lies exposed 2 s and takes ×2. */
const turtle = coActor(function* (c) {
  const p = ELITES.turtle.p;
  yield* chase(c, 2 + c.w.rng() * 2);
  while (true) {
    yield* chase(c, p.every * 0.6);
    const w0 = c.w, h = c.h, e0 = w0.enemy(h);
    // plan the ricochet from where it stands
    const pts: { x: number; y: number }[] = [{ x: e0.x, y: e0.y }];
    let dx = w0.player.x - e0.x, dy = w0.player.y - e0.y;
    const r = e0.r;
    for (let k = 0; k <= p.bounces; k++) {
      const last = pts[pts.length - 1];
      const hit = rayToWall(w0, last.x, last.y, dx, dy, r);
      if (k === p.bounces) { const L = Math.min(hit.len, 320); const n = Math.hypot(dx, dy) || 1; pts.push({ x: last.x + (dx / n) * L, y: last.y + (dy / n) * L }); break; }
      pts.push({ x: hit.x, y: hit.y });
      const n = Math.hypot(dx, dy) || 1;
      const rf = reflect(dx / n, dy / n, hit.nx, hit.ny);
      dx = rf.x; dy = rf.y;
    }
    // withdraw: armour up, a tell for the first line
    stop(w0, h);
    const shell = 6;
    e0.armor += shell;
    w0.sfx('hitMelee');
    const v = p.shellSpeed * (w0.enemy(h).speed / Math.max(1, ELITES.turtle.speed));
    // each segment's line appears 0.8 s before the shell reaches its start
    // 闲游 stretches every telegraph by teleX: the shell waits as long as the ink takes to fill
    const X = teleT(w0, 1), tell = p.tell * X;
    const starts: number[] = [tell];
    for (let k = 1; k < pts.length - 1; k++) starts.push(starts[k - 1] + dist(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y) / v);
    let t = 0, shown = 0;
    const contact0 = w0.enemy(h).dmg;
    w0.enemy(h).dmg = contact0 * 1.5;
    let seg = 0, along = 0;
    while (seg < pts.length - 1) {
      const w = c.w;
      if (!w.alive(h)) return;
      while (shown < starts.length && t >= starts[shown] - tell) {
        const a = pts[shown], z = pts[shown + 1];
        w.tele({ shape: { kind: 'line', x: a.x, y: a.y, dir: Math.atan2(z.y - a.y, z.x - a.x), len: dist(a.x, a.y, z.x, z.y), w: r * 2 }, dur: Math.max(0.05, (starts[shown] - t) / X) });
        shown++;
      }
      if (t >= tell) {
        const a = pts[seg], z = pts[seg + 1], L = dist(a.x, a.y, z.x, z.y);
        along += v * w.dt;
        const e = w.enemy(h);
        const k = Math.min(1, along / Math.max(1, L));
        e.x = a.x + (z.x - a.x) * k; e.y = a.y + (z.y - a.y) * k; e.vx = 0; e.vy = 0;
        if (k >= 1) { seg++; along = 0; w.fx('shockRing', e.x, e.y, { r: 50, life: 0.25 }); w.sfx('hitMelee'); w.shake(2); }
      }
      t += w.dt;
      yield 0;
    }
    // exposed: ×2 damage taken for 2 s
    const w = c.w;
    if (!w.alive(h)) return;
    const e = w.enemy(h);
    e.armor -= shell;
    e.dmg = contact0;
    w.status(h, 'vuln', p.exposed, (p.exposedX - 1) * 100);
    w.title(b('巨鳌露腹', 'The Ao is exposed'), 'edge');
    for (let k = 0; k < p.exposed; k += c.w.dt) { stop(c.w, h); if (Math.floor(k * 2) !== Math.floor((k + c.w.dt) * 2)) { const ee = c.w.enemy(h); c.w.fx('stunMark', ee.x, ee.y - ee.r, { r: 40, life: 0.5 }); } yield 0; }
  }
});

// ─────────────────────────────────────────────── 白蛇 · lines of water

/** Slithers in S-curves; every 5 s sends 3 parallel lines of water across the arena, each with a gap (1.0 s tell). */
const whitesnake = coActor(function* (c) {
  const p = ELITES.whitesnake.p;
  let t0 = c.w.rng() * 2;
  while (true) {
    // S-curve approach
    for (let t = 0; t < p.every * 0.8; t += c.w.dt) {
      const w = c.w, e = w.enemy(c.h);
      const a = toPlayer(w, e.x, e.y) + Math.sin((t + t0) * 2.4) * p.curve;
      const d = dist(e.x, e.y, w.player.x, w.player.y);
      const sp = d < 140 ? e.speed * 0.4 : e.speed;
      e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      yield 0;
    }
    t0 += 1.3;
    const w = c.w, h = c.h;
    stop(w, h);
    // three parallel lines across the arena, spaced 150 u, centred on you; each with a 90 u gap near you
    const dir = w.rng() * Math.PI;
    const ux = Math.cos(dir), uy = Math.sin(dir), nx = -uy, ny = ux;
    const R = rimR(w) + 200, cx = w.player.x, cy = w.player.y;
    for (let k = 0; k < p.lines; k++) {
      const off = (k - (p.lines - 1) / 2) * 150;
      const ox = cx + nx * off, oy = cy + ny * off;
      const gapAt = (w.rng() * 2 - 1) * 220; // along the line, from your projection
      const g0 = gapAt - p.gap / 2, g1 = gapAt + p.gap / 2;
      const segA: TeleShape = { kind: 'line', x: ox - ux * R, y: oy - uy * R, dir, len: R + g0, w: 44 };
      const segB: TeleShape = { kind: 'line', x: ox + ux * g1, y: oy + uy * g1, dir, len: R - g1, w: 44 };
      for (const s of [segA, segB]) {
        strikeTele(w, h, s, p.tell, (ww) => {
          if (s.kind === 'line') fxLine(ww, 'beamRay', s.x, s.y, s.dir, s.len, 0.35, 44 / 16);
          if (playerIn(ww, s)) eliteHit(ww, h, 1.2, 'whitesnake', { undodgeable: false });
        });
      }
    }
    w.sfx('bell');
    yield teleT(w, p.tell) + 0.2;
  }
});

// ─────────────────────────────────────────────── 山君 · roar and three leaps

/** A 0.8 s roar that slows you 30% within 300, then 3 leaps onto marked spots (0.7 s tell each). */
const tiger = coActor(function* (c) {
  const p = ELITES.tiger.p;
  yield* chase(c, 2 + c.w.rng());
  while (true) {
    yield* chase(c, p.every * 0.5, 1, 90);
    const h = c.h;
    // the roar
    stop(c.w, h);
    for (let t = 0; t < p.roar; t += c.w.dt) {
      const w = c.w, e = w.enemy(h);
      stop(w, h);
      if (Math.floor(t * 4) !== Math.floor((t + w.dt) * 4)) w.fx('shockRing', e.x, e.y, { r: p.roarR * (0.4 + t / p.roar * 0.6), life: 0.3 });
      yield 0;
    }
    {
      const w = c.w, e = w.enemy(h);
      w.sfx('bossDrum'); w.shake(3);
      if (dist(e.x, e.y, w.player.x, w.player.y) <= p.roarR) { slowPlayer(w, p.slow, 1.8); w.fx('slowMark', w.player.x, w.player.y + 10, { r: 40, life: 1.2 }); }
    }
    // three leaps
    for (let k = 0; k < p.leaps; k++) {
      const w = c.w;
      if (!w.alive(h)) return;
      const e = w.enemy(h);
      const lead = 0.35;
      const to = w.clampToArena({ x: w.player.x + w.player.vx * lead, y: w.player.y + w.player.vy * lead }, 30);
      const from = { x: e.x, y: e.y };
      const R = 80;
      strikeTele(w, h, { kind: 'circle', x: to.x, y: to.y, r: R }, p.tell, (ww) => {
        if (playerIn(ww, { kind: 'circle', x: to.x, y: to.y, r: R })) eliteHit(ww, h, 1.3, 'tiger');
        ww.fx('shockRing', to.x, to.y, { r: R, life: 0.3 }); ww.fx('dustPuff', to.x, to.y, { r: 40, life: 0.3 }); ww.shake(3); ww.sfx('hitMelee');
      });
      setAir(w, h, true);
      const T = teleT(w, p.tell);
      for (let t = 0; t < T; t += c.w.dt) {
        const ee = c.w.enemy(h), k2 = Math.min(1, (t + c.w.dt) / T);
        ee.x = from.x + (to.x - from.x) * k2; ee.y = from.y + (to.y - from.y) * k2; ee.vx = 0; ee.vy = 0;
        yield 0;
      }
      setAir(c.w, h, false);
      yield 0.25;
    }
  }
});

// ─────────────────────────────────────────────── 画皮 · the painted skin

/**
 * Disguised as a 纸人 until below 80% HP or within 150; then it sheds its skin and slashes 3 times
 * (0.5 s tell). The disguise is total: no name at the edge and no elite bar until the reveal (while
 * disguised its bar's maximum follows its HP, so the bar the renderer draws on damage never shows).
 */
const disguised = new Map<number, number>();
const painted = coActor(function* (c) {
    const p = ELITES.painted.p;
    let shown = false;
    while (!shown) {
      const w = c.w, e = w.enemy(c.h);
      steer(w, c.h, w.player.x, w.player.y, e.speed);
      const max = disguised.get(c.h) ?? e.hpMax;
      shown = e.hp < max * p.reveal || dist(e.x, e.y, w.player.x, w.player.y) < p.near;
      // HP taken outside a hit (a 节气's extra share) is folded in here, a step later at most
      if (!shown && e.hp > 0 && e.hp < e.hpMax) setHp(w, c.h, e.hp, e.hp);
      yield 0;
    }
    {
      const w = c.w, e = w.enemy(c.h);
      unmask(w, c.h);
      setLook(w, c.h, 'elite:painted', ELITES.painted.r ?? 20);
      e.r = ELITES.painted.r ?? 20;
      w.fx('inkBurst', e.x, e.y, { r: 50, life: 0.5 });
      w.fx('petalBurst', e.x, e.y, { r: 60, life: 0.5 });
      // its true name (and its 镜印) only now
      if (!announce(w, c.h)) w.title(b('画皮', 'Painted Skin'), 'edge');
      w.sfx('shatter'); w.shake(3);
    }
    const fast = (p.fast / ELITES.painted.speed);
    while (true) {
      yield* chase(c, 3, fast, 0, () => { const w = c.w, e = w.enemy(c.h); return dist(e.x, e.y, w.player.x, w.player.y) < 110; });
      for (let k = 0; k < p.slashes; k++) {
        const w = c.w, h = c.h;
        if (!w.alive(h)) return;
        const e = w.enemy(h);
        const dir = toPlayer(w, e.x, e.y);
        const shape: TeleShape = { kind: 'cone', x: e.x, y: e.y, dir, r: 130, deg: 110 };
        stop(w, h);
        strikeTele(w, h, shape, p.tell, (ww) => {
          if (playerIn(ww, shape)) eliteHit(ww, h, 1.2, 'painted');
          ww.fx('slashArc', shape.x + Math.cos(dir) * 50, shape.y + Math.sin(dir) * 50, { r: 90, dir, life: 0.3 });
          ww.sfx('hitMelee');
        });
        for (let t = 0, T = teleT(w, p.tell); t < T; t += c.w.dt) { stop(c.w, h); yield 0; }
        const ee = c.w.enemy(h);
        ee.vx = Math.cos(dir) * 260; ee.vy = Math.sin(dir) * 260;
        yield 0.12;
      }
      stop(c.w, c.h);
      yield 0.8;
    }
}, {
  quiet: true,
  // the paper man's shape and pace from its first frame
  init(w, h) {
    setLook(w, h, 'mon:paperman', 14);
    w.enemy(h).r = 14;
    disguised.set(h, w.enemy(h).hpMax);
  },
  death(_w, h) { disguised.delete(h); },
  hit(w, h) {
    const max = disguised.get(h);
    if (max === undefined) return;
    const e = w.enemy(h);
    // a killing blow dies as the elite it is; otherwise the bar's maximum follows its HP
    if (e.hp <= 0 || e.hp < max * ELITES.painted.p.reveal) unmask(w, h); else setHp(w, h, e.hp, e.hp);
  },
});
/** 画皮 drops the disguise: its real maximum HP back. */
function unmask(w: WorldApi, h: number): void {
  const max = disguised.get(h);
  if (max === undefined) return;
  disguised.delete(h);
  if (w.alive(h)) setHp(w, h, w.enemy(h).hp, max);
}

// ─────────────────────────────────────────────── 天将 · spear and banner

/** Frontal shield (the core's), a spear thrust along 350 (1.0 s tell), and 2 天兵 called every 10 s. */
const general = coActor(function* (c) {
  const p = ELITES.general.p;
  let call = p.callEvery * 0.5;
  while (true) {
    const dt0 = c.w.dt;
    // close to thrust range
    for (let t = 0; t < 2.6; t += c.w.dt) {
      call -= c.w.dt;
      const w = c.w, e = w.enemy(c.h);
      if (dist(e.x, e.y, w.player.x, w.player.y) < p.thrust * 0.7) break;
      steer(w, c.h, w.player.x, w.player.y, e.speed);
      yield 0;
    }
    if (call <= 0) {
      call = p.callEvery;
      const w = c.w, e = w.enemy(c.h);
      for (let k = 0; k < p.call; k++) {
        const a = toPlayer(w, e.x, e.y) + (k ? 0.9 : -0.9);
        w.spawn('soldier', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, { bloom: true });
      }
      w.sfx('bossDrum');
      w.fx('shockRing', e.x, e.y, { r: 70, life: 0.3 });
    }
    const w = c.w, h = c.h, e = w.enemy(h);
    const dir = toPlayer(w, e.x, e.y);
    const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len: p.thrust, w: 44 };
    stop(w, h);
    strikeTele(w, h, shape, p.tell, (ww) => {
      if (playerIn(ww, shape)) eliteHit(ww, h, 1.4, 'general');
      fxLine(ww, 'swordStreak', shape.x, shape.y, dir, p.thrust, 0.3, 1.4);
      ww.sfx('hitMelee');
    });
    for (let t = 0, T = teleT(w, p.tell); t < T; t += c.w.dt) { stop(c.w, h); call -= c.w.dt; yield 0; }
    { const ee = c.w.enemy(h); ee.vx = Math.cos(dir) * 700; ee.vy = Math.sin(dir) * 700; }
    yield 0.16;
    stop(c.w, h);
    yield 0.6;
    call -= 0.76 + dt0;
  }
});

// ─────────────────────────────────────────────── 啸天犬 · the hunter

/** Hunter: 3 chained dashes (0.5 s tell each) at your 墨宝 first; a howl calls 3 天狗崽 every 9 s. */
const hound = coActor(function* (c) {
  const p = ELITES.hound.p;
  let howl = p.howlEvery * 0.6;
  while (true) {
    for (let t = 0; t < 2.2; t += c.w.dt) {
      howl -= c.w.dt;
      const w = c.w, e = w.enemy(c.h);
      const s = nearestSummon(w, e.x, e.y, 500);
      steer(w, c.h, s ? s.x : w.player.x, s ? s.y : w.player.y, e.speed);
      yield 0;
    }
    if (howl <= 0) {
      howl = p.howlEvery;
      const w = c.w, e = w.enemy(c.h);
      w.fx('shockRing', e.x, e.y, { r: 140, life: 0.5 });
      w.sfx('bossDrum');
      for (let k = 0; k < p.call; k++) { const a = (k / p.call) * TAU; w.spawn('skypup', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, { bloom: true }); }
    }
    for (let k = 0; k < p.dashes; k++) {
      const w = c.w, h = c.h;
      if (!w.alive(h)) return;
      const e = w.enemy(h);
      const s = nearestSummon(w, e.x, e.y, 500);
      const tx = s ? s.x : w.player.x, ty = s ? s.y : w.player.y;
      const dir = Math.atan2(ty - e.y, tx - e.x);
      const len = Math.min(460, dist(e.x, e.y, tx, ty) + 80);
      const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len, w: 50 };
      stop(w, h);
      w.tele({ shape, dur: p.tell });
      for (let t = 0, T = teleT(w, p.tell); t < T; t += c.w.dt) { stop(c.w, h); yield 0; }
      // the dash: whoever is on the line when it goes
      const ww = c.w;
      if (playerIn(ww, shape)) eliteHit(ww, h, 1.2, 'hound');
      fxLine(ww, 'swordStreak', shape.x, shape.y, dir, len, 0.3, 1.2);
      const T = len / p.dashSpeed;
      for (let t = 0; t < T; t += c.w.dt) { const ee = c.w.enemy(h); ee.vx = Math.cos(dir) * p.dashSpeed; ee.vy = Math.sin(dir) * p.dashSpeed; yield 0; }
      stop(c.w, h);
      yield 0.15;
    }
    yield 0.5;
  }
});

export const ELITE_IMPLS: Partial<Record<EliteId, ActorImpl>> = {
  turtle: turtle as ActorImpl, whitesnake: whitesnake as ActorImpl, tiger: tiger as ActorImpl,
  painted: painted as ActorImpl, general: general as ActorImpl, hound: hound as ActorImpl,
};

// ─────────────────────────────────────────────── 镜印 affixes

const aegis: AffixImpl<null> = {
  init(w, h) { w.enemy(h).armor += AFFIXES.aegis.p.armor; return null; },
  tick(w, h, _s) { if (Math.floor(w.t) !== Math.floor(w.t - w.dt) && Math.floor(w.t) % 3 === 0) { const e = w.enemy(h); w.fx('shieldBubble', e.x, e.y, { r: e.r * 1.3, life: 0.4 }); } },
};
const swift: AffixImpl<null> = {
  init(w, h) { w.enemy(h).speed *= 1 + AFFIXES.swift.p.speed / 100; return null; },
  tick(w, h) { const e = w.enemy(h); if ((e.vx * e.vx + e.vy * e.vy) > 900 && Math.floor(w.t * 5) !== Math.floor((w.t - w.dt) * 5)) w.fx('dustPuff', e.x - e.vx * 0.05, e.y - e.vy * 0.05, { r: 26, life: 0.3 }); },
};
const splitting: AffixImpl<null> = {
  init() { return null; },
  death(w, h) {
    const e = w.enemy(h);
    const id = e.id as EliteId, x = e.x, y = e.y, r = e.r;
    const p = AFFIXES.splitting.p;
    const sh = shared(w);
    for (let k = 0; k < p.n; k++) {
      const a = (k / p.n) * TAU;
      spawningCopies = true;
      let c = -1;
      try { c = w.spawn(id, x + Math.cos(a) * r, y + Math.sin(a) * r, { hpX: p.hp, noDrops: true }); } finally { spawningCopies = false; }
      if (c < 0) continue;
      sh.copies.add(c);
      const v = w.enemy(c);
      v.r = r * 0.75;
    }
    w.fx('inkBurst', x, y, { r: r * 2, life: 0.4 });
    w.title(b('裂', 'Split'), 'edge');
  },
};
const devour: AffixImpl<{ ct: number }> = {
  init(w, h) { shared(w).devour.add(h); return { ct: 0 }; },
  tick(w, h, s) {
    // a fresh contact hit (its contact timer just reset) heals it for 20% of the blow
    const ct = contactT(w, h);
    if (ct > s.ct + 0.1) {
      const e = w.enemy(h);
      e.hp = Math.min(e.hpMax, e.hp + e.dmg * armorMult(w.stats.armor) * AFFIXES.devour.p.heal);
      w.fx('petalBurst', e.x, e.y, { r: 30, life: 0.3 });
    }
    s.ct = ct;
  },
  death(w, h) { shared(w).devour.delete(h); },
};
const mirrored: AffixImpl<{ t: number }> = {
  init() { return { t: 0 }; },
  tick(w, h, s, dt) {
    if (s.t <= 0) return;
    s.t -= dt;
    if (s.t <= 0) setReflect(w, h, false);
  },
  hit(w, h, s, ev) {
    const e = w.enemy(h);
    if (ev.dmg < e.hpMax * AFFIXES.mirrored.p.at) return;
    if (s.t <= 0) w.fx('shieldBubble', e.x, e.y, { r: e.r * 1.5, life: AFFIXES.mirrored.p.dur });
    s.t = AFFIXES.mirrored.p.dur;
    setReflect(w, h, true);
  },
};
const caller: AffixImpl<{ t: number }> = {
  init() { return { t: AFFIXES.caller.p.every * 0.5 }; },
  tick(w, h, s, dt) {
    s.t -= dt;
    if (s.t > 0) return;
    s.t = AFFIXES.caller.p.every;
    const e = w.enemy(h);
    const id = swarmOf(w.map.id);
    for (let k = 0; k < AFFIXES.caller.p.n; k++) {
      const a = (k / AFFIXES.caller.p.n) * TAU + w.rng();
      w.spawn(id, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, { bloom: true, noDrops: true });
    }
    w.fx('shockRing', e.x, e.y, { r: 60, life: 0.3 });
  },
};
export const AFFIX_IMPLS: Partial<Record<AffixId, AffixImpl>> = {
  aegis: aegis as AffixImpl, swift: swift as AffixImpl, splitting: splitting as AffixImpl, devour: devour as AffixImpl,
  mirrored: mirrored as AffixImpl, caller: caller as AffixImpl,
};

// ─────────────────────────────────────────────── treasures

interface Tre { life: number; a: number; glint: number }
/** 貔貅: flees at 1.1 × your speed for 20 s (slower when far, so a chase can corner it), then vanishes. */
const pixiu: ActorImpl<Tre> = {
  init(w) { return { life: TREASURES.pixiu.life, a: w.rng() * TAU, glint: 0 }; },
  tick(w, h, s, dt) {
    const e = w.enemy(h);
    s.life -= dt; s.glint -= dt;
    if (s.life <= 0) {
      w.fx('petalBurst', e.x, e.y, { r: 60, life: 0.5 });
      w.title(b('貔貅遁去', 'The pixiu got away'), 'edge');
      expire(w, h, 'petalBurst');
      return;
    }
    const dx = e.x - w.player.x, dy = e.y - w.player.y, d = Math.hypot(dx, dy) || 1;
    const sp = w.player.r > 0 ? (280 * (1 + Math.max(-60, Math.min(100, w.stats.speed)) / 100)) * TREASURES.pixiu.p.fleeX : 300;
    const v = sp * (d < 420 ? 1 : 0.35);
    // away from you, weaving; along the rim instead of into it
    let a = Math.atan2(dy, dx) + Math.sin(s.life * 1.3) * 0.6;
    if (!w.inArena(e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80, e.r + 10)) {
      const l = a + Math.PI / 2, r = a - Math.PI / 2;
      const lOk = w.inArena(e.x + Math.cos(l) * 80, e.y + Math.sin(l) * 80, e.r + 10);
      a = lOk ? l : r;
    }
    s.a = a;
    e.vx = Math.cos(a) * v; e.vy = Math.sin(a) * v;
    if (s.glint <= 0) { s.glint = d < 420 ? 0.5 : 1.2; w.fx('petalBurst', e.x, e.y - 6, { r: 22, life: 0.35 }); }
  },
};
/** 镜中花: a golden flower that drifts for 8 s; one hit catches it. */
const mirrorflower: ActorImpl<Tre> = {
  init(w) { return { life: TREASURES.mirrorflower.life, a: w.rng() * TAU, glint: 0 }; },
  tick(w, h, s, dt) {
    const e = w.enemy(h);
    s.life -= dt; s.glint -= dt;
    if (s.life <= 0) { expire(w, h, 'petalBurst'); return; }
    s.a += Math.sin(s.life * 0.8) * 0.8 * dt;
    if (!w.inArena(e.x + Math.cos(s.a) * 60, e.y + Math.sin(s.a) * 60, 20)) s.a += Math.PI * 0.7;
    const v = TREASURES.mirrorflower.p.drift;
    e.vx = Math.cos(s.a) * v; e.vy = Math.sin(s.a) * v;
    if (s.glint <= 0) { s.glint = 0.4; w.fx('petalBurst', e.x, e.y, { r: 26, life: 0.5 }); }
  },
};
export const TREASURE_IMPLS: Partial<Record<TreasureId, ActorImpl>> = { pixiu: pixiu as ActorImpl, mirrorflower: mirrorflower as ActorImpl };

