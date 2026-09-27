// 水月幻镜 · the bosses (GDD §14): one phase-script runner drives all nine from BOSSES[id].phases,
// a small timed-pattern DSL — each PatternCall fires `at` s into its phase, then every `every` s —
// over a library of patterns written as coroutines. The runner owns the phase breaks (60% / 25%, and
// 10% under 倒悬): 1.2 s invulnerable, the core's 120 ms hitstop, cleared shots and the calligraphy
// phase name; HP never skips a phase. Enrage from 90 s (150 s on 闲游): +10% damage and +5% speed
// every 10 s. 幽镜 and up add one pattern per phase. Every attack is telegraphed in wet vermilion.
// Damage is written at the boss's home wave on 照影 (data/bosses.ts) and scaled here to the wave,
// 镜境, vows and 劫 — an endless boss keeps its own home, so it hits like the wave it is fought on.
import type { BossId } from '../../ids';
import type { ActorImpl, BossDef, BossPatternId, PatternCall, PatternImpl, TeleShape, Vec, WorldApi } from '../../types';
import { BOSSES, ENDLESS_BOSS } from '../../data';
import { dmgMul, dmx, hpMul } from '../../logic/formulas';
import {
  core, eatMoon, endShot, endTele, enemyShot, expire, fxLine, fxSprite, lightNow, liveTele, moveInput, moveShot, moveZone,
  pullPlayer, reduceMotion, setAir, setActor, setKind, setLook, setMoveInput, setResist, shotIs, sky, slowPlayer, tagShot,
  teleFill, teleShape, dropMoon, dropGold, setHp,
} from './bridge';
import { shotSpeedX } from './field';
import {
  CoRun, DEG, TAU, b, clamp, dist, homeOf, hurtPlayer, inGap, openPoint, playerIn, rayToWall, reflect, rimR,
  shared, swarmOf, toPlayer, type Co,
} from './util';

// ═════════════════════════════════════════════ state

export interface BossState {
  id: BossId;
  def: BossDef;
  h: number;
  home: number;
  phase: number;
  phaseT: number;
  fightT: number;
  invulnT: number;
  stunT: number;
  enrage: number;
  /** >0 while a pattern moves the body itself. */
  busy: number;
  calls: PatternCall[];
  next: number[];
  /** 倒悬: every pattern at once until this phase time. */
  unionUntil: number;
  running: PatRun[];
  /** Background effects (moving rings) that outlive the pattern that made them. */
  fx: Eff[];
  contact0: number;
  /** The 镜境 / vow speed factor over the data's phase speeds. */
  spdK: number;
  anchor: Vec;
  rimA: number;
  rimDir: number;
  shadow: number;
  /** 金蟾王: 月华 eaten. */
  eaten: number;
  /** 九尾狐: tails left. */
  tails: number;
  /** 夔: stomps since the hide last cracked, the crack timer, the beat counter and the gap angle. */
  stomps: number;
  crackT: number;
  beatN: number;
  gapA: number;
  /** 吴刚: the tree bodies (the central 桂树, then the saplings). */
  trees: number[];
  felled: boolean;
  /** Decoys this boss raised (mirages, illusions, reflections). */
  phantoms: number[];
  /** The charm glyph's reversal is ours to undo. */
  reversing: boolean;
  dead: boolean;
}
interface Eff { tick(w: WorldApi, dt: number): boolean; end(w: WorldApi): void }
type PatRun = ReturnType<PatternImpl['start']>;

/** What a pattern coroutine sees (the world is refreshed every step). */
export interface PatCtx {
  w: WorldApi;
  h: number;
  st: BossState;
  call: PatternCall;
  p: Readonly<Record<string, number>>;
  teles: number[];
  ended: boolean;
}

const enrageX = (st: BossState) => 1 + 0.1 * st.enrage;
const growX = (st: BossState) => 1 + (BOSSES.goldtoad.p.dmgPer10 ?? 0.01) * Math.floor(st.eaten / 10);
/** A pattern hit's final damage: home-wave number → this wave, enrage and growth. */
function dmgOf(c: PatCtx, k = 1): number {
  return c.call.dmg * k * (core(c.w).plan.dmgX / Math.max(1e-6, dmgMul(c.st.home))) * enrageX(c.st) * growX(c.st);
}
function hurt(c: PatCtx, k = 1, o: { undodgeable?: boolean } = {}): void {
  if (c.ended || c.st.dead) return;
  const e = c.w.enemy(c.h);
  hurtPlayer(c.w, dmgOf(c, k), c.st.id, { undodgeable: o.undodgeable, from: { x: e.x, y: e.y } });
}
/** A telegraph this pattern owns (ended with it); `then` runs only while the pattern lives. */
function tele(c: PatCtx, shape: TeleShape, dur: number, then?: (w: WorldApi) => void): number {
  const id = c.w.tele({ shape, dur, then: then ? (w) => { if (!c.ended && !c.st.dead) then(w); } : undefined });
  if (id >= 0) c.teles.push(id);
  return id;
}
/** An enemy shot from home-wave damage (speed × 小雪; the core adds 镜境 shot speed and plan scaling). */
function shoot(c: PatCtx, kind: string, x: number, y: number, ang: number, speed: number, o: { r?: number; life?: number; k?: number; homing?: number; boomerang?: boolean } = {}): number {
  const sp = speed * shotSpeedX(c.w);
  const life = o.life ?? 1100 / Math.max(60, speed);
  return enemyShot(c.w, kind, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, o.r ?? 9, life, dmgOf(c, o.k ?? 1), { homing: o.homing, boomerang: o.boomerang });
}
/** A ring of shots every `stepDeg`, skipping the gaps. */
function ringShots(c: PatCtx, kind: string, x: number, y: number, speed: number, gaps: { at: number; w: number }[], stepDeg = 10, o: { r?: number; k?: number } = {}): void {
  const n = Math.round(360 / stepDeg);
  const off = c.w.rng() * stepDeg * DEG;
  for (let i = 0; i < n; i++) {
    const a = off + i * stepDeg * DEG;
    if (inGap(a, gaps, -0.02)) continue;
    shoot(c, kind, x, y, a, speed, o);
  }
}
/** Gaps of width `deg` at angles (radians). A fresh array each time (the painter memoises by array). */
const gapsAt = (angles: number[], deg: number) => angles.map((at) => ({ at, w: deg * DEG }));

/**
 * A moving shock ring: a vermilion band from (x, y) out to `to` at `speed`, with gaps; it hits the
 * player once when the band crosses them outside a gap. Drawn as a live telegraph.
 */
function waveRing(c: PatCtx, x: number, y: number, speed: number, to: number, gaps: { at: number; w: number }[], k = 1, band = 26): void {
  const w0 = c.w, st = c.st;
  let r = c.w.enemy(c.h).r * 0.6;
  const id = liveTele(w0, { kind: 'ring', x, y, r: r - band / 2, r2: r + band / 2, gaps }, 0.85);
  let done = false;
  const dmg = dmgOf(c, k);
  const src = st.id;
  st.fx.push({
    tick(w, dt) {
      r += speed * dt;
      const s = teleShape(w, id);
      if (s && s.kind === 'ring') { s.r = Math.max(0, r - band / 2); s.r2 = r + band / 2; }
      if (!done && playerIn(w, { kind: 'ring', x, y, r: Math.max(0, r - band / 2), r2: r + band / 2, gaps })) {
        done = true;
        hurtPlayer(w, dmg, src);
      }
      if (r > to) { endTele(w, id); return false; }
      return true;
    },
    end(w) { endTele(w, id); },
  });
}
/** A beam's hit and look along (x, y, dir); beams can't be dodged. */
function beam(c: PatCtx, x: number, y: number, dir: number, len: number, width: number, k = 1): void {
  const w = c.w;
  fxLine(w, 'beamRay', x, y, dir, len, w.dt * 2.5, width / 16);
  if (playerIn(w, { kind: 'line', x, y, dir, len, w: width })) hurt(c, k, { undodgeable: true });
}
/** The body moves itself for this pattern (the runner's movement waits). */
function* hold(c: PatCtx, body: Co): Co {
  // one move at a time: wait (up to 3 s) for another pattern that is moving the body, else skip
  for (let t = 0; c.st.busy > 0; t += c.w.dt) { if (t > 3) return; yield 0; }
  c.st.busy++;
  try { yield* body; } finally { c.st.busy = Math.max(0, c.st.busy - 1); const e = c.w.enemy(c.h); if (c.w.alive(c.h)) { e.vx = 0; e.vy = 0; setAir(c.w, c.h, false); } }
}
function* pause(c: PatCtx, sec: number): Co { for (let t = 0; t < sec; t += c.w.dt) { const e = c.w.enemy(c.h); e.vx = 0; e.vy = 0; yield 0; } }
/** Move the body in a straight hop from → to over `sec` (airborne: it skips obstacles and contact). */
function* hop(c: PatCtx, to: Vec, sec: number): Co {
  const e0 = c.w.enemy(c.h), fx = e0.x, fy = e0.y;
  setAir(c.w, c.h, true);
  for (let t = 0; t < sec; t += c.w.dt) {
    const e = c.w.enemy(c.h), k = Math.min(1, (t + c.w.dt) / sec);
    e.x = fx + (to.x - fx) * k; e.y = fy + (to.y - fy) * k; e.vx = 0; e.vy = 0;
    yield 0;
  }
  setAir(c.w, c.h, false);
}
const lead = (w: WorldApi, sec: number, m = 30): Vec => w.clampToArena({ x: w.player.x + w.player.vx * sec, y: w.player.y + w.player.vy * sec }, m);

// ═════════════════════════════════════════════ phantoms (mirages, illusions, reflections, monkeys, trees)

interface Phantom {
  owner: number; kind: 'mirage' | 'illusion' | 'reflection' | 'monkey' | 'tree';
  hits: number; maxHits: number; life: number; t: number; attack: number; k: number; a: number;
  moon: number; call: PatternCall | null; tree: boolean; felled: boolean; lastRipple: number;
}
const PHANTOM: ActorImpl<Phantom> = {
  init() { return { owner: -1, kind: 'mirage', hits: 0, maxHits: 3, life: 1e9, t: 0, attack: 0, k: 1, a: 0, moon: -1, call: null, tree: false, felled: false, lastRipple: -9 }; },
  tick(w, h, s, dt) {
    const e = w.enemy(h);
    s.t += dt; s.life -= dt;
    const ownerAlive = w.alive(s.owner);
    if (!ownerAlive || s.life <= 0 || (s.maxHits > 0 && s.hits >= s.maxHits) || s.felled) { popPhantom(w, h, s); return; }
    if (s.tree) { e.vx = 0; e.vy = 0; return; }
    const o = w.enemy(s.owner);
    if (s.moon >= 0 && Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) { const v = w.enemy(h); moonMark(w, v.x, v.y - v.r - 34, s.moon); }
    // mirror the true body's HP (so "strongest" targeting can't tell them apart)
    if (s.kind !== 'monkey') { const ohp = o.hp; const view = w.enemy(h); view.hp = Math.max(1, ohp); }
    if (s.kind === 'monkey') return; // the chain pattern places them
    // drift around you like the true one
    s.a += dt * 0.45;
    const R = 260 + 40 * Math.sin(s.t * 0.7 + s.k);
    const tx = w.player.x + Math.cos(s.a + s.k) * R, ty = w.player.y + Math.sin(s.a + s.k) * R;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
    if (s.kind === 'reflection') { faceRight(w, h, dt); return; }
    const sp = 80;
    e.vx = (dx / d) * Math.min(sp, d * 2); e.vy = (dy / d) * Math.min(sp, d * 2);
    // mirages and illusions attack too (pale shots at the call's damage share)
    if (s.attack > 0 && s.call) {
      s.attack -= dt;
      if (s.attack <= 0) {
        s.attack = 3 + w.rng();
        const st = shared(w).bosses.get(s.owner) as BossState | undefined;
        if (st) phantomVolley(w, h, st, s);
      }
    }
  },
  hit(w, h, s, ev) {
    if (s.tree) {
      const e = w.enemy(h);
      if (e.hp <= 0) { e.hp = 1; s.felled = true; }
      return;
    }
    // a decoy never dies to damage: it pops after its hits (the true boss is untouched)
    const e = w.enemy(h);
    e.hp = Math.max(1, e.hpMax);
    if (ev.dmg <= 0) return;
    s.hits++;
    if (s.kind === 'reflection') {
      // hitting a false moon sends out ripples (each false moon at most every 2.5 s: auto-aim
      // finds them too, so the lesson must not become a flood)
      const st = shared(w).bosses.get(s.owner) as BossState | undefined;
      if (st && s.call && s.t - s.lastRipple > 2.5) {
        s.lastRipple = s.t;
        const c: PatCtx = { w, h, st, call: s.call, p: s.call.p ?? {}, teles: [], ended: false };
        waveRing(c, e.x, e.y, 220, 520, gapsAt([w.rng() * TAU], 90), 0.6, 22);
      }
    }
  },
};
/** Hold a body still but facing right (a tiny velocity the step undoes), so every reflection shows the same moon. */
function faceRight(w: WorldApi, h: number, dt: number): void {
  const e = w.enemy(h);
  e.vx = 10.5; e.vy = 0;
  e.x -= 10.5 * dt;
}
function popPhantom(w: WorldApi, h: number, s: Phantom): void {
  const e = w.enemy(h);
  const st = shared(w).bosses.get(s.owner) as BossState | undefined;
  if (s.tree && s.felled && st) treeFell(w, st, h, e.x, e.y);
  if (s.kind === 'mirage' || s.kind === 'illusion') { w.fx('inkBurst', e.x, e.y, { r: e.r * 1.4, life: 0.4 }); w.sfx('dodge'); }
  shared(w).phantoms.delete(h);
  if (st) st.phantoms = st.phantoms.filter((x) => x !== h);
  expire(w, h, s.tree ? 'petalBurst' : 'inkBurst');
}
/** Raise a decoy body for boss st (it looks like the boss, but casts no shadow). */
function phantom(c: PatCtx, x: number, y: number, o: Partial<Phantom> & { look?: string; r0?: number; r?: number; dmg?: number; untargetable?: boolean }): number {
  const w = c.w;
  const h = w.spawn('blot', x, y, { bloom: false, noDrops: true, capped: false });
  if (h < 0) return -1;
  const e = w.enemy(h);
  const r = o.r ?? c.st.def.r;
  const look = (o.look ?? `boss:${c.st.id}:${Math.min(2, c.st.phase)}`) as never;
  setLook(w, h, look, o.r0 ?? (o.look ? r : c.st.def.r));
  e.r = r;
  e.dmg = o.dmg ?? 0;
  e.speed = 0;
  e.armor = 0;
  e.untargetable = !!o.untargetable;
  setResist(w, h, 1);
  const s = PHANTOM.init(w, h);
  const { look: _l, r0: _r0, r: _r, dmg: _d, untargetable: _u, ...rest } = o;
  Object.assign(s, { owner: c.h, call: c.call }, rest);
  setActor(w, h, PHANTOM, s);
  shared(w).phantoms.add(h);
  if (o.kind !== 'monkey' && o.kind !== 'tree') c.st.phantoms.push(h);
  w.fx('inkBurst', x, y, { r: r * 1.2, life: 0.4 });
  return h;
}
function phantomVolley(w: WorldApi, h: number, st: BossState, s: Phantom): void {
  const e = w.enemy(h);
  const call = s.call!;
  const ctx: PatCtx = { w, h, st, call: { ...call, dmg: call.dmg * (call.p?.pct ?? 0.5) }, p: call.p ?? {}, teles: [], ended: false };
  const dir = toPlayer(w, e.x, e.y);
  const n = s.kind === 'illusion' ? 3 : 5;
  const fan = s.kind === 'illusion' ? 40 : 60;
  const kind = s.kind === 'illusion' ? 'eFoxfire' : 'eBubble';
  w.tele({
    shape: { kind: 'fan', x: e.x, y: e.y, dir, deg: fan, n }, dur: 0.6,
    then: (ww) => {
      if (!ww.alive(h)) return;
      const v = ww.enemy(h);
      ctx.w = ww;
      for (let i = 0; i < n; i++) shoot(ctx, kind, v.x, v.y, dir + ((i - (n - 1) / 2) * fan * DEG) / Math.max(1, n - 1), 200, { r: 8 });
    },
  });
}
/**
 * A moon-phase marker above a body: a pale moon ring, and an ink shadow eating it from the side the
 * phase is dark on (0 full … 4 new; 1–3 waning, dark on the right; 5–7 waxing, dark on the left).
 */
function moonMark(w: WorldApi, x: number, y: number, phase: number): void {
  const p = ((phase % 8) + 8) % 8;
  const lit = (1 + Math.cos((p / 8) * TAU)) / 2;
  const R = 30;
  w.fx('moonCircle', x, y, { r: R, life: 0.3 });
  w.fx('levelRing', x, y, { r: R / 0.4, life: 0.3 });
  if (lit > 0.97) return;
  const side = p >= 1 && p <= 3 ? 1 : -1;
  w.fx('inkBurst', x + side * 2 * R * lit, y, { r: (32 * R * 1.1) / 20, life: 0.3 });
}

// ═════════════════════════════════════════════ 吴刚's trees

/** The tree's HP: 800 × HP(w)/HP(10) (800 at wave 10 on any 镜境; it grows with the wave in endless). */
function treeHp(w: WorldApi): number {
  return (BOSSES.wugang.p.treeHp ?? 800) * (hpMul(w.wave) / hpMul(10)) * (dmx(w.diff.hp, w.wave) / dmx(w.diff.hp, 10));
}
function spawnTree(c: PatCtx, x: number, y: number, central: boolean): number {
  const h = phantom(c, x, y, { kind: 'tree', tree: true, maxHits: 0, look: central ? 'fx:petalBurst' : 'mon:guihua', r0: central ? 60 : 16, r: central ? 120 : 40 });
  if (h < 0) return -1;
  const w = c.w;
  setKind(w, h, 'elite');
  setAir(w, h, true);
  setHp(w, h, treeHp(w) * (central ? 1 : 0.5));
  c.st.trees.push(h);
  return h;
}
/** A tree falls: the central one stuns 吴刚 4 s and stops his healing; a sapling splits the arena in a line. */
function treeFell(w: WorldApi, st: BossState, h: number, x: number, y: number): void {
  st.trees = st.trees.filter((t) => t !== h);
  w.fx('petalBurst', x, y, { r: 120, life: 0.7 });
  w.sfx('shatter');
  w.shake(4);
  if (Math.hypot(x, y) < 40) {
    st.felled = true;
    st.stunT = BOSSES.wugang.p.felledStun ?? 4;
    endAll(w, st);
    w.title(b('桂倒 · 吴刚愣住', 'The tree falls · Wu Gang is stunned'), 'edge');
    return;
  }
  // a falling sapling splits the arena through the centre (1.5 s tell)
  const call = BOSSES.wugang.phases[2].script.find((k) => k.pat === 'treeFall')!;
  const c: PatCtx = { w, h: st.h, st, call, p: call.p ?? {}, teles: [], ended: false };
  const dir = Math.atan2(-y, -x);
  const len = call.p?.len ?? 1400, wd = call.p?.w ?? 80;
  const shape: TeleShape = { kind: 'line', x: x - Math.cos(dir) * 60, y: y - Math.sin(dir) * 60, dir, len, w: wd };
  w.tele({ shape, dur: call.tele, then: (ww) => {
    if (st.dead) return;
    c.w = ww;
    fxLine(ww, 'slashArc', shape.x, shape.y, dir, len, 0.4, 2);
    if (playerIn(ww, shape)) hurt(c);
    ww.shake(4); ww.sfx('bossDrum');
  } });
}

// ═════════════════════════════════════════════ the pattern library

type PatFn = (c: PatCtx) => Co;

const PATS: Record<BossPatternId, PatFn> = {
  // ───────────── 鲤王
  *bubbleSpiral(c) {
    const p = c.p, arms = p.arms ?? 2, per = arms / Math.max(0.1, p.rate);
    const a0 = c.w.rng() * TAU, spin = (c.w.rng() < 0.5 ? -1 : 1) * p.spin * DEG;
    let acc = 0;
    for (let t = 0; t < p.dur; t += c.w.dt) {
      acc += c.w.dt;
      while (acc >= per) {
        acc -= per;
        const e = c.w.enemy(c.h);
        for (let k = 0; k < arms; k++) shoot(c, 'eBubble', e.x, e.y, a0 + spin * t + (k * TAU) / arms, p.speed, { r: 10 });
      }
      yield 0;
    }
  },
  *tailSlap(c) {
    yield* hold(c, (function* () {
      const e = c.w.enemy(c.h), dir = toPlayer(c.w, e.x, e.y);
      const shape: TeleShape = { kind: 'cone', x: e.x, y: e.y, dir, r: c.p.r, deg: c.p.deg };
      tele(c, shape, c.call.tele, (w) => {
        w.fx('slashArc', shape.x + Math.cos(dir) * c.p.r * 0.5, shape.y + Math.sin(dir) * c.p.r * 0.5, { r: c.p.r * 0.7, dir, life: 0.35 });
        w.sfx('hitMelee'); w.shake(3);
        if (playerIn(w, shape)) hurt(c);
      });
      yield* pause(c, c.call.tele + 0.15);
    })());
  },
  *leapSplash(c) {
    const n = c.call.n ?? 3;
    yield* hold(c, (function* () {
      for (let k = 0; k < n; k++) {
        const to = lead(c.w, 0.3, 60);
        const shape: TeleShape = { kind: 'circle', x: to.x, y: to.y, r: c.p.r };
        const gaps = gapsAt([c.w.rng() * TAU], c.p.gap);
        tele(c, { kind: 'ring', x: to.x, y: to.y, r: c.p.r + 6, r2: c.p.r + 30, gaps }, c.call.tele + 0.3);
        tele(c, shape, c.call.tele, (w) => {
          w.fx('shockRing', to.x, to.y, { r: c.p.r, life: 0.35 }); w.fx('dustPuff', to.x, to.y, { r: 50, life: 0.3 });
          w.sfx('bossDrum'); w.shake(4);
          if (playerIn(w, shape)) hurt(c);
        });
        tele(c, { kind: 'circle', x: to.x, y: to.y, r: 1 }, c.call.tele + 0.3, () => waveRing(c, to.x, to.y, c.p.ringSpeed, 760, gaps, 1, 24));
        yield* hop(c, to, c.call.tele);
        yield* pause(c, 0.4);
      }
    })());
  },
  *gapRing(c) {
    const e = c.w.enemy(c.h), gaps = gapsAt([c.w.rng() * TAU], c.p.gap ?? 40);
    if (c.call.tele > 0) tele(c, { kind: 'ring', x: e.x, y: e.y, r: e.r, r2: e.r + 36, gaps }, c.call.tele);
    yield c.call.tele;
    const v = c.w.enemy(c.h);
    waveRing(c, v.x, v.y, c.p.ringSpeed ?? 300, 800, gaps);
  },
  *sweepBeam(c) {
    yield* hold(c, (function* () {
      const e = c.w.enemy(c.h);
      const dir0 = toPlayer(c.w, e.x, e.y), sweep = c.p.deg * DEG, sgn = c.w.rng() < 0.5 ? -1 : 1;
      const a0 = dir0 - (sgn * sweep) / 2;
      const len = rimR(c.w) * 2.2;
      tele(c, { kind: 'cone', x: e.x, y: e.y, dir: dir0, r: Math.min(len, 900), deg: c.p.deg }, c.call.tele);
      tele(c, { kind: 'line', x: e.x, y: e.y, dir: a0, len, w: c.p.w }, c.call.tele);
      yield* pause(c, c.call.tele);
      c.w.sfx('phaseBreak');
      for (let t = 0; t < c.p.dur; t += c.w.dt) {
        const v = c.w.enemy(c.h);
        v.vx = 0; v.vy = 0;
        beam(c, v.x, v.y, a0 + sgn * sweep * (t / c.p.dur), len, c.p.w);
        yield 0;
      }
    })());
  },
  *adds(c) {
    const w = c.w, n = c.call.n ?? 6, id = swarmOf(c.st.def.map);
    const e = w.enemy(c.h);
    const a = Math.atan2(e.y, e.x) + (w.rng() - 0.5);
    const R = rimR(w) - 80;
    for (let k = 0; k < n; k++) {
      const q = w.clampToArena({ x: Math.cos(a) * R + (w.rng() - 0.5) * 120, y: Math.sin(a) * R + (w.rng() - 0.5) * 120 }, 30);
      w.spawn(id, q.x, q.y, { bloom: true });
    }
  },
  // ───────────── 蜃
  *pearlFan(c) {
    const e = c.w.enemy(c.h), dir = toPlayer(c.w, e.x, e.y), n = c.call.n ?? 5, fan = c.p.fan ?? 60;
    tele(c, { kind: 'fan', x: e.x, y: e.y, dir, deg: fan, n }, c.call.tele);
    yield c.call.tele;
    const v = c.w.enemy(c.h);
    for (let i = 0; i < n; i++) shoot(c, 'ePearl', v.x, v.y, dir + ((i - (n - 1) / 2) * fan * DEG) / Math.max(1, n - 1), c.p.speed ?? 220, { r: 10 });
    c.w.sfx('hitShot');
  },
  *mirages(c) {
    const n = c.call.n ?? 3;
    const have = c.st.phantoms.filter((h) => c.w.alive(h)).length;
    const spots: Vec[] = [];
    for (let k = have; k < n; k++) {
      const a = c.w.rng() * TAU;
      spots.push(c.w.clampToArena({ x: c.w.player.x + Math.cos(a) * 300, y: c.w.player.y + Math.sin(a) * 300 }, 70));
    }
    for (const s of spots) c.w.fx('spawnBloom', s.x, s.y, { r: 60, life: c.call.tele });
    yield c.call.tele;
    let k = 0;
    for (const s of spots) phantom(c, s.x, s.y, { kind: 'mirage', maxHits: c.p.hits ?? 3, attack: c.p.attack ? 1.5 + k++ * 0.8 : 0, k: k * 2.1 });
  },
  *mirageWall(c) {
    const sh = shared(c.w);
    if (sh.wall) return;
    const w0 = c.w, p = c.p;
    const band = 36, R0 = rimR(w0) - 30;
    let R = R0, gapA = toPlayer(w0, 0, 0);
    const gap = (p.gap ?? 60) * DEG;
    let gaps = [{ at: gapA, w: gap }];
    const id = liveTele(w0, { kind: 'ring', x: 0, y: 0, r: R - band / 2, r2: R + band / 2, gaps }, 0);
    // towers of mist along the wall
    const towers: number[] = [];
    for (let k = 0; k < 14; k++) towers.push(w0.zone({ side: 'player', look: 'mirageWall', x: 0, y: 0, r: 80, life: 1e6 }));
    sh.wall = { id, towers };
    let tickT = p.tick ?? 0.5;
    try {
      for (let t = 0; ; t += c.w.dt) {
        const w = c.w;
        if (t < c.call.tele) teleFill(w, id, (t / c.call.tele) * 0.85);
        else {
          R = Math.max(p.to ?? 300, R0 - ((R0 - (p.to ?? 300)) * (t - c.call.tele)) / (p.dur ?? 20));
          gapA += (p.spin ?? 20) * DEG * w.dt;
          gaps = [{ at: gapA, w: gap }];
          const s = teleShape(w, id);
          if (s && s.kind === 'ring') { s.r = R - band / 2; s.r2 = R + band / 2; s.gaps = gaps; }
          teleFill(w, id, 0.85);
          // everything past the inner edge of the wall hurts, except the rotating gap
          tickT -= w.dt;
          if (tickT <= 0) {
            tickT += p.tick ?? 0.5;
            const pd = Math.hypot(w.player.x, w.player.y);
            if (pd > R - band / 2 - w.player.r && !inGap(Math.atan2(w.player.y, w.player.x), gaps, 0)) hurt(c, 1, { undodgeable: true });
          }
        }
        let k = 0;
        for (const z of towers) {
          const a = gapA + gap / 2 + ((TAU - gap) * (k + 0.5)) / towers.length;
          moveZone(w, z, Math.cos(a) * R, Math.sin(a) * R);
          k++;
        }
        yield 0;
      }
    } finally {
      const w = c.w;
      endTele(w, id);
      for (const z of towers) w.endZone(z);
      if (sh.wall && (sh.wall as { id: number }).id === id) sh.wall = null;
    }
  },
  // ───────────── 水中月
  *gapRings(c) {
    const w = c.w, e = w.enemy(c.h);
    const g0 = w.rng() * TAU, g1 = g0 + Math.PI * (0.6 + 0.8 * w.rng());
    const gaps = gapsAt([g0, g1].slice(0, c.p.gaps ?? 2), c.p.gapDeg ?? 40);
    tele(c, { kind: 'ring', x: e.x, y: e.y, r: e.r, r2: e.r + 40, gaps }, c.call.tele);
    yield c.call.tele;
    const v = c.w.enemy(c.h);
    ringShots(c, 'ePearl', v.x, v.y, c.p.speed ?? 240, gaps, 8, { r: 9 });
    c.w.sfx('bell');
  },
  *reflections(c) {
    const w0 = c.w, n = c.call.n ?? 4;
    // four moons on a ring; the true one shows tonight's real phase
    const tonight = Math.round(((sky(w0).lunation + 0.5) % 1) * 8) % 8;
    const a0 = w0.rng() * TAU, R = Math.min(320, rimR(w0) - 120);
    const spots: Vec[] = [];
    for (let k = 0; k < n; k++) spots.push(w0.clampToArena({ x: Math.cos(a0 + (k * TAU) / n) * R, y: Math.sin(a0 + (k * TAU) / n) * R }, 80));
    for (const s of spots) w0.fx('rippleRing', s.x, s.y, { r: 90, life: c.call.tele });
    yield c.call.tele;
    const w = c.w;
    const trueK = Math.floor(w.rng() * n);
    const others = [0, 1, 2, 3, 4, 5, 6, 7].filter((x) => x !== tonight);
    const e = w.enemy(c.h);
    e.x = spots[trueK].x; e.y = spots[trueK].y;
    const made: number[] = [];
    for (let k = 0; k < n; k++) {
      if (k === trueK) continue;
      const moon = others.splice(Math.floor(w.rng() * others.length), 1)[0];
      made.push(phantom(c, spots[k].x, spots[k].y, { kind: 'reflection', maxHits: 0, life: 10, moon }));
    }
    w.sfx('bell');
    // the true one holds still and wears tonight's moon while the split lasts
    c.st.busy++;
    try {
      for (let t = 0; t < 10; t += c.w.dt) {
        const v = c.w.enemy(c.h);
        faceRight(c.w, c.h, c.w.dt);
        if (Math.floor(t * 4) !== Math.floor((t + c.w.dt) * 4)) moonMark(c.w, v.x, v.y - v.r - 34, tonight);
        yield 0;
      }
    } finally { c.st.busy = Math.max(0, c.st.busy - 1); }
    void made;
  },
  *monkeyChain(c) {
    const w0 = c.w, n = c.call.n ?? 8;
    const top = w0.clampToArena({ x: w0.player.x, y: -5000 }, 30);
    const to = { x: w0.player.x, y: w0.player.y };
    const dir = Math.atan2(to.y - top.y, to.x - top.x), len = dist(top.x, top.y, to.x, to.y) + 80;
    const shape: TeleShape = { kind: 'line', x: top.x, y: top.y, dir, len, w: 44 };
    tele(c, shape, c.call.tele);
    yield c.call.tele;
    const mk: number[] = [];
    for (let k = 0; k < n; k++) mk.push(phantom(c, top.x, top.y, { kind: 'monkey', maxHits: 0, look: 'mon:drowned', r: 16, untargetable: true }));
    let head = 0, grabbed = false, back = false;
    try {
      for (let t = 0; t < 6; t += c.w.dt) {
        const w = c.w;
        head += (back ? -420 : 560) * w.dt;
        if (!back && head >= len) back = true;
        if (back && head <= -30 * n) break;
        for (let k = 0; k < mk.length; k++) {
          if (!w.alive(mk[k])) continue;
          const d = clamp(head - k * 30, 0, len);
          const v = w.enemy(mk[k]);
          v.x = top.x + Math.cos(dir) * d; v.y = top.y + Math.sin(dir) * d; v.vx = 0; v.vy = 0;
          if (!grabbed && !back && d > 0 && dist(v.x, v.y, w.player.x, w.player.y) < v.r + w.player.r) {
            grabbed = true;
            hurt(c, 1);
            w.root(c.p.root ?? 1);
            w.fx('rootMark', w.player.x, w.player.y + 10, { r: 50, life: c.p.root ?? 1 });
            back = true;
          }
        }
        yield 0;
      }
    } finally {
      for (const h of mk) if (c.w.alive(h)) { shared(c.w).phantoms.delete(h); expire(c.w, h); }
    }
  },
  *homingShards(c) {
    const w = c.w, n = c.call.n ?? 4, e = w.enemy(c.h);
    const spots: Vec[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + w.rng();
      spots.push({ x: e.x + Math.cos(a) * 130, y: e.y + Math.sin(a) * 130 });
      tele(c, { kind: 'circle', x: spots[k].x, y: spots[k].y, r: 22 }, c.call.tele);
    }
    yield c.call.tele;
    for (const s of spots) shoot(c, 'eMoonShard', s.x, s.y, toPlayer(c.w, s.x, s.y), c.p.speed ?? 200, { r: 9, homing: c.p.homing ?? 0.8, life: 6 });
  },
  // ───────────── 夔
  *stomp(c) {
    const st = c.st, p = c.p;
    if (st.crackT > 0) return; // the cracked drum is silent
    st.beatN++;
    // 破鼓: a syncopated bar — rest on the 4th beat, an off-beat double on the 2nd
    if (p.syncopate && st.beatN % 4 === 0) return;
    const doubled = !!p.syncopate && st.beatN % 4 === 2;
    for (let k = 0; k < (doubled ? 2 : 1); k++) {
      const w = c.w, e = w.enemy(c.h);
      let angles: number[];
      if (p.gaps === 2) { st.gapA += 45 * DEG; angles = [st.gapA, st.gapA + Math.PI]; }
      // one gap that alternates sides of you on the beat: a sidestep of about 22° each time
      else { const side = st.beatN % 2 ? 1 : -1; angles = [Math.atan2(w.player.y - e.y, w.player.x - e.x) + side * 22 * DEG]; }
      const gaps = gapsAt(angles, p.gapDeg ?? 45);
      const tl = k ? c.call.tele / 2 : c.call.tele;
      tele(c, { kind: 'ring', x: e.x, y: e.y, r: e.r, r2: e.r + 40, gaps }, tl);
      yield tl;
      const v = c.w.enemy(c.h);
      c.w.fx('shockRing', v.x, v.y, { r: 90, life: 0.3 });
      c.w.sfx('bossDrum'); c.w.shake(3);
      waveRing(c, v.x, v.y, p.speed ?? 300, p.to ?? 600, gaps, 1, 24);
      st.stomps++;
    }
  },
  *lightningRing(c) {
    const w = c.w, n = c.p.n ?? 2, r = c.p.r ?? 70;
    for (let k = 0; k < n; k++) {
      const at = k === 0 ? { x: w.player.x, y: w.player.y } : openPoint(w, 20, w.player, 200);
      const shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r };
      tele(c, shape, c.call.tele, (ww) => {
        ww.fx('lightningStrike', at.x, at.y, { r: (32 * r) / 30, life: 0.35 }); ww.sfx('hitTalisman');
        if (playerIn(ww, shape)) hurt(c);
      });
    }
  },
  *drumCrack(c) {
    const st = c.st, p = c.p;
    // the watcher: after 8 stomps the drum-hide cracks and 夔 takes ×2 for 4 s
    while (true) {
      if (st.stomps >= (p.stomps ?? 8) && st.crackT <= 0) {
        st.stomps = 0;
        st.crackT = p.dur ?? 4;
        c.w.status(c.h, 'vuln', st.crackT, ((p.x ?? 2) - 1) * 100);
        const e = c.w.enemy(c.h);
        c.w.fx('inkBurst', e.x, e.y, { r: 90, life: 0.5 }); c.w.fx('shockRing', e.x, e.y, { r: 140, life: 0.4 });
        c.w.title(b('鼓裂 · 伤害 ×2', 'The drum cracks · ×2 damage'), 'edge');
        c.w.sfx('shatter');
      }
      yield 0.1;
    }
  },
  // ───────────── 九尾狐
  *foxfireSpiral(c) {
    const e = c.w.enemy(c.h);
    tele(c, { kind: 'circle', x: e.x, y: e.y, r: 70 }, c.call.tele);
    yield c.call.tele;
    const p = c.p, arms = clamp(Math.ceil(c.st.tails / 3), 1, 3), per = arms / Math.max(0.1, p.rate);
    const a0 = c.w.rng() * TAU, spin = (c.w.rng() < 0.5 ? -1 : 1) * p.spin * DEG;
    let acc = 0;
    for (let t = 0; t < p.dur; t += c.w.dt) {
      acc += c.w.dt;
      while (acc >= per) {
        acc -= per;
        const v = c.w.enemy(c.h);
        for (let k = 0; k < arms; k++) shoot(c, 'eFoxfire', v.x, v.y, a0 + spin * t + (k * TAU) / arms, p.speed, { r: 10 });
      }
      yield 0;
    }
  },
  *tailLash(c) { yield* PATS.tailSlap(c); },
  *charmGlyph(c) {
    const w = c.w, r = c.p.r ?? 90, at = { x: w.player.x, y: w.player.y };
    const shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r };
    w.fx('charmMark', at.x, at.y - 10, { r: (32 * 36) / 8, life: c.call.tele });
    tele(c, shape, c.call.tele, (ww) => {
      if (!playerIn(ww, shape)) return;
      ww.fx('charmMark', ww.player.x, ww.player.y - 30, { r: (32 * 20) / 8, life: c.p.reverse ?? 1.5 });
      ww.sfx('bell');
      if (reduceMotion(ww)) slowPlayer(ww, (c.p.slow ?? 40) / 100, c.p.reverse ?? 1.5);
      else { const sh = shared(ww); sh.reverseUntil = ww.t + (c.p.reverse ?? 1.5); c.st.reversing = true; ww.title(b('魅惑 · 左右颠倒', 'Charmed · controls reversed'), 'edge'); }
    });
  },
  *illusions(c) {
    const n = (c.call.n ?? 3) - 1;
    const have = c.st.phantoms.filter((h) => c.w.alive(h)).length;
    const spots: Vec[] = [];
    for (let k = have; k < n; k++) { const a = c.w.rng() * TAU; spots.push(c.w.clampToArena({ x: c.w.player.x + Math.cos(a) * 280, y: c.w.player.y + Math.sin(a) * 280 }, 70)); }
    for (const s of spots) c.w.fx('spawnBloom', s.x, s.y, { r: 60, life: c.call.tele });
    yield c.call.tele;
    let k = 0;
    for (const s of spots) phantom(c, s.x, s.y, { kind: 'illusion', maxHits: 3, attack: c.p.attack ? 2 + k * 0.9 : 0, k: 1 + k++ * 2.4 });
  },
  *tailSweep(c) {
    const w = c.w, len = c.p.len ?? 1200, wd = c.p.w ?? 90;
    const dir = w.rng() * Math.PI;
    const px = w.player.x + (w.rng() - 0.5) * 120, py = w.player.y + (w.rng() - 0.5) * 120;
    const shape: TeleShape = { kind: 'line', x: px - Math.cos(dir) * len / 2, y: py - Math.sin(dir) * len / 2, dir, len, w: wd };
    tele(c, shape, c.call.tele, (ww) => {
      for (let k = 0; k < 5; k++) { const d = (k + 0.5) * len / 5; ww.fx('slashArc', shape.x + Math.cos(dir) * d, shape.y + Math.sin(dir) * d, { r: wd * 1.2, dir: dir + Math.PI / 2, life: 0.3 }); }
      ww.sfx('hitMelee'); ww.shake(3);
      if (playerIn(ww, shape)) hurt(c);
    });
  },
  // ───────────── 刑天
  *cleave(c) {
    const n = c.call.n ?? 1;
    yield* hold(c, (function* () {
      for (let k = 0; k < n; k++) {
        // a giant's stride closes the distance before each cleave
        const e0 = c.w.enemy(c.h), R = c.p.r ?? 320;
        const d0 = dist(e0.x, e0.y, c.w.player.x, c.w.player.y);
        if (d0 > R * 0.7) {
          const a = toPlayer(c.w, e0.x, e0.y), step = Math.min(260, d0 - R * 0.55);
          const to = c.w.clampToArena({ x: e0.x + Math.cos(a) * step, y: e0.y + Math.sin(a) * step }, e0.r);
          yield* hop(c, to, 0.35);
          c.w.fx('dustPuff', to.x, to.y, { r: 60, life: 0.3 }); c.w.shake(2);
        }
        const e = c.w.enemy(c.h), dir = toPlayer(c.w, e.x, e.y);
        const shape: TeleShape = { kind: 'cone', x: e.x, y: e.y, dir, r: R, deg: c.p.deg ?? 120 };
        tele(c, shape, c.call.tele, (w) => {
          w.fx('slashArc', shape.x + Math.cos(dir) * 140, shape.y + Math.sin(dir) * 140, { r: 220, dir, life: 0.4 });
          w.sfx('hitMelee'); w.shake(5);
          if (playerIn(w, shape)) hurt(c);
        });
        yield* pause(c, c.call.tele + 0.25);
      }
    })());
  },
  *shieldCharge(c) {
    yield* hold(c, (function* () {
      const w0 = c.w, e0 = w0.enemy(c.h), r = e0.r;
      let dx = w0.player.x - e0.x, dy = w0.player.y - e0.y;
      const pts: Vec[] = [{ x: e0.x, y: e0.y }];
      for (let k = 0; k <= (c.p.bounces ?? 3); k++) {
        const last = pts[pts.length - 1];
        const hit = rayToWall(w0, last.x, last.y, dx, dy, r * 0.7);
        pts.push({ x: hit.x, y: hit.y });
        const n = Math.hypot(dx, dy) || 1;
        const rf = reflect(dx / n, dy / n, hit.nx, hit.ny);
        dx = rf.x; dy = rf.y;
      }
      const wd = c.p.w ?? 70, sp = (c.p.speed ?? 600) * (1 + 0.05 * c.st.enrage);
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], z = pts[s + 1];
        const dir = Math.atan2(z.y - a.y, z.x - a.x), L = dist(a.x, a.y, z.x, z.y);
        tele(c, { kind: 'line', x: a.x, y: a.y, dir, len: L, w: wd }, s === 0 ? c.call.tele : 0.35);
        yield* pause(c, s === 0 ? c.call.tele : 0.35);
        let hitOnce = false;
        for (let d = 0; d < L; d += sp * c.w.dt) {
          const v = c.w.enemy(c.h);
          v.x = a.x + Math.cos(dir) * d; v.y = a.y + Math.sin(dir) * d; v.vx = 0; v.vy = 0;
          if (!hitOnce && dist(v.x, v.y, c.w.player.x, c.w.player.y) < wd / 2 + c.w.player.r + v.r * 0.3) { hitOnce = true; hurt(c); }
          yield 0;
        }
        const v = c.w.enemy(c.h);
        c.w.fx('shockRing', v.x, v.y, { r: 90, life: 0.3 }); c.w.fx('dustPuff', v.x, v.y, { r: 60, life: 0.3 }); c.w.shake(4); c.w.sfx('bossDrum');
      }
    })());
  },
  *axeDance(c) {
    // at most 60°/s, three axes a spoke: you can ride between the spokes at your own speed
    const w0 = c.w, arcs = c.p.arcs ?? 3, spin = Math.min(60, c.p.spin ?? 90) * DEG * (w0.rng() < 0.5 ? -1 : 1);
    const e0 = w0.enemy(c.h);
    let a0 = toPlayer(w0, e0.x, e0.y);
    for (let k = 0; k < arcs; k++) tele(c, { kind: 'line', x: e0.x, y: e0.y, dir: a0 + (k * TAU) / arcs, len: 255, w: 34 }, c.call.tele);
    yield c.call.tele;
    if (c.p.ring) { const v = c.w.enemy(c.h); waveRing(c, v.x, v.y, 340, 720, gapsAt([c.w.rng() * TAU, c.w.rng() * TAU + Math.PI], 50), 0.8); }
    const radii = [90, 165, 240];
    const axes: { i: number; tag: number; k: number; rr: number }[] = [];
    for (let k = 0; k < arcs; k++) for (const rr of radii) {
      const v = c.w.enemy(c.h), a = a0 + (k * TAU) / arcs;
      const i = shoot(c, 'eAxe', v.x + Math.cos(a) * rr, v.y + Math.sin(a) * rr, a, 0.01, { r: 14, life: 6 });
      const tag = 1e7 + Math.floor(c.w.rng() * 1e6);
      tagShot(c.w, i, tag);
      axes.push({ i, tag, k, rr });
    }
    c.w.sfx('hitMelee');
    try {
      for (let t = 0; t < 3.5; t += c.w.dt) {
        const w = c.w, v = w.enemy(c.h);
        a0 += spin * w.dt;
        for (const ax of axes) {
          if (!shotIs(w, ax.i, ax.tag)) continue;
          const a = a0 + (ax.k * TAU) / arcs;
          moveShot(w, ax.i, v.x + Math.cos(a) * ax.rr, v.y + Math.sin(a) * ax.rr, -Math.sin(a) * Math.sign(spin), Math.cos(a) * Math.sign(spin));
        }
        yield 0;
      }
    } finally {
      for (const ax of axes) if (shotIs(c.w, ax.i, ax.tag)) endShot(c.w, ax.i);
    }
  },
  *verseZones(c) {
    const w = c.w, n = c.call.n ?? 5, r = c.p.r ?? 90;
    const dir = w.rng() * Math.PI;
    w.title(b('猛志固常在', 'His fierce will endures'), 'edge');
    for (let k = 0; k < n; k++) {
      const d = (k - (n - 1) / 2) * r * 2.2;
      const at = w.clampToArena({ x: w.player.x + Math.cos(dir) * d, y: w.player.y + Math.sin(dir) * d }, 20);
      const shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r };
      tele(c, shape, c.call.tele + k * 0.22, (ww) => {
        ww.fx('inkBurst', at.x, at.y, { r: r * 1.3, life: 0.45 }); ww.fx('shockRing', at.x, at.y, { r, life: 0.3 }); ww.sfx('bossDrum');
        if (playerIn(ww, shape)) hurt(c);
      });
    }
  },
  // ───────────── 吴刚
  *chopTree(c) {
    const w = c.w, st = c.st, e = w.enemy(c.h);
    const tree = st.trees.find((t) => w.alive(t) && dist(w.enemy(t).x, w.enemy(t).y, 0, 0) < 40);
    const dir = toPlayer(w, e.x, e.y), n = c.call.n ?? 2;
    tele(c, { kind: 'fan', x: e.x, y: e.y, dir, deg: 30, n }, c.call.tele);
    yield c.call.tele;
    const v = c.w.enemy(c.h);
    c.w.fx('slashArc', v.x + Math.cos(Math.atan2(-v.y, -v.x)) * 50, v.y + Math.sin(Math.atan2(-v.y, -v.x)) * 50, { r: 80, dir: Math.atan2(-v.y, -v.x), life: 0.3 });
    c.w.sfx('hitMelee');
    if (tree !== undefined && c.w.alive(tree) && !st.felled) {
      // the chop heals him 2%
      v.hp = Math.min(v.hpMax, v.hp + v.hpMax * (c.p.heal ?? 0.02));
      c.w.fx('petalBurst', 0, 0, { r: 90, life: 0.5 });
    }
    const fly = c.p.fly ?? 360, reach = Math.max(fly, dist(v.x, v.y, c.w.player.x, c.w.player.y) + 80);
    for (let k = 0; k < n; k++) shoot(c, 'eAxe', v.x, v.y, dir + ((k - (n - 1) / 2) * 30 * DEG) / Math.max(1, n - 1), fly, { r: 13, life: (2 * reach) / fly, boomerang: true });
  },
  *axeBarrage(c) {
    const w = c.w, e = w.enemy(c.h), n = c.call.n ?? 3, dir = toPlayer(w, e.x, e.y);
    tele(c, { kind: 'fan', x: e.x, y: e.y, dir, deg: 50, n }, c.call.tele);
    yield c.call.tele;
    const v = c.w.enemy(c.h), fly = c.p.fly ?? 360, reach = Math.max(fly, dist(v.x, v.y, c.w.player.x, c.w.player.y) + 80);
    for (let k = 0; k < n; k++) shoot(c, 'eAxe', v.x, v.y, dir + ((k - (n - 1) / 2) * 50 * DEG) / Math.max(1, n - 1), fly, { r: 13, life: (2 * reach) / fly, boomerang: true });
    c.w.sfx('hitMelee');
  },
  *chopWave(c) {
    const e = c.w.enemy(c.h), r = c.p.r ?? 180;
    const shape: TeleShape = { kind: 'circle', x: e.x, y: e.y, r };
    tele(c, shape, c.call.tele, (w) => { w.fx('shockRing', shape.x, shape.y, { r, life: 0.35 }); w.sfx('bossDrum'); w.shake(3); if (playerIn(w, shape)) hurt(c); });
  },
  *twinTrees(c) {
    const w = c.w, n = c.call.n ?? 2;
    const alive = c.st.trees.filter((t) => w.alive(t) && dist(w.enemy(t).x, w.enemy(t).y, 0, 0) >= 40).length;
    for (let k = alive; k < n; k++) {
      const at = openPoint(w, 60);
      if (Math.hypot(at.x, at.y) < 250) { at.x *= 250 / Math.max(1, Math.hypot(at.x, at.y)); at.y *= 250 / Math.max(1, Math.hypot(at.x, at.y)); }
      spawnTree(c, at.x, at.y, false);
    }
    if (n > alive) w.title(b('双桂并生', 'Two trees sprout'), 'edge');
  },
  *treeFall(c) {
    const w = c.w, st = c.st;
    const saps = st.trees.filter((t) => w.alive(t) && dist(w.enemy(t).x, w.enemy(t).y, 0, 0) >= 40);
    if (saps.length) {
      // 吴刚 fells a sapling: it splits the arena
      const t = saps[Math.floor(w.rng() * saps.length)];
      const v = w.enemy(t);
      const tx = v.x, ty = v.y;
      shared(w).phantoms.delete(t);
      expire(w, t, 'petalBurst');
      treeFell(w, st, t, tx, ty);
      return;
    }
    // no sapling left: he hurls the axe's wake across the arena instead
    const e = w.enemy(c.h), dir = toPlayer(w, e.x, e.y), len = c.p.len ?? 1400;
    const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len, w: c.p.w ?? 80 };
    tele(c, shape, c.call.tele, (ww) => { fxLine(ww, 'slashArc', shape.x, shape.y, dir, len, 0.4, 2); if (playerIn(ww, shape)) hurt(c); ww.shake(3); });
  },
  // ───────────── 金蟾王
  *tongueLash(c) {
    const w = c.w, e = w.enemy(c.h), dir = toPlayer(w, e.x, e.y), len = (c.p.len ?? 400) * Math.min(1.6, 1 + (growX(c.st) - 1) * 2);
    const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len, w: c.p.w ?? 30 };
    tele(c, shape, c.call.tele, (ww) => {
      fxLine(ww, 'beamRay', shape.x, shape.y, dir, len, 0.3, (c.p.w ?? 30) / 16);
      ww.sfx('hitShot');
      if (!playerIn(ww, shape)) return;
      hurt(c);
      const v = ww.enemy(c.h);
      pullPlayer(ww, v.x, v.y, c.p.pull ?? 120);
    });
  },
  *eatMoon(c) {
    const w = c.w, e = w.enemy(c.h);
    const got = eatMoon(w, e.x, e.y, (c.p.r ?? 200) + e.r);
    if (got <= 0) return;
    c.st.eaten += got;
    const grow = Math.min(2, 1 + (c.p.sizePer10 ?? 0.02) * (c.st.eaten / 10));
    e.r = c.st.def.r * grow;
    w.fx('petalBurst', e.x, e.y - e.r * 0.3, { r: 40, life: 0.35 });
    w.sfx('pickup');
  },
  *goldRain(c) {
    const w = c.w, n = c.call.n ?? 12, e = w.enemy(c.h);
    const flight = c.call.tele + 0.4;
    for (let k = 0; k < n; k++) {
      // a few fall where you are going; the rest scatter around you
      const to = k < 4 ? openPoint(w, 20, lead(w, flight * 0.6), 70) : openPoint(w, 20, w.player, 300);
      const ox = e.x, oy = e.y - e.r * 0.4;
      const R = 38;
      tele(c, { kind: 'circle', x: to.x, y: to.y, r: R }, flight, (ww) => { dropGold(ww, to.x, to.y, c.p.moon ?? 1); });
      enemyShot(w, 'eGold', ox, oy, (to.x - ox) / flight, (to.y - oy) / flight, R - 12, flight, dmgOf(c), { lob: true });
      if (k % 4 === 3) yield 0.15;
    }
    w.sfx('coinString');
  },
  *bounce(c) {
    yield* hold(c, (function* () {
      const to = lead(c.w, 0.4, 60), r = c.p.r ?? 130;
      const shape: TeleShape = { kind: 'circle', x: to.x, y: to.y, r };
      tele(c, shape, c.call.tele, (w) => { w.fx('shockRing', to.x, to.y, { r, life: 0.35 }); w.fx('dustPuff', to.x, to.y, { r: 60, life: 0.3 }); w.sfx('bossDrum'); w.shake(4); if (playerIn(w, shape)) hurt(c); });
      yield* hop(c, to, c.call.tele);
      yield* pause(c, 0.3);
    })());
  },
  // ───────────── 天狗食月
  *lunge(c) {
    const n = c.call.n ?? 3, len = c.p.len ?? 420, wd = c.p.w ?? 60;
    yield* hold(c, (function* () {
      for (let k = 0; k < n; k++) {
        const e = c.w.enemy(c.h), dir = toPlayer(c.w, e.x, e.y);
        const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len, w: wd };
        tele(c, shape, c.call.tele);
        yield* pause(c, c.call.tele);
        if (playerIn(c.w, shape)) hurt(c);
        c.w.sfx('hitMelee');
        fxLine(c.w, 'swordStreak', shape.x, shape.y, dir, len, 0.3, 1.6);
        const stopAt = rayToWall(c.w, shape.x, shape.y, Math.cos(dir), Math.sin(dir), e.r * 0.7);
        const L = Math.min(len, stopAt.len);
        for (let d = 0; d < L; d += 1800 * c.w.dt) { const v = c.w.enemy(c.h); v.x = shape.x + Math.cos(dir) * d; v.y = shape.y + Math.sin(dir) * d; v.vx = 0; v.vy = 0; yield 0; }
        yield* pause(c, 0.3);
      }
    })());
  },
  *bite(c) {
    yield* hold(c, (function* () {
      const e = c.w.enemy(c.h), dir = toPlayer(c.w, e.x, e.y);
      const shape: TeleShape = { kind: 'cone', x: e.x, y: e.y, dir, r: c.p.r ?? 200, deg: c.p.deg ?? 60 };
      tele(c, shape, c.call.tele, (w) => { w.fx('slashArc', shape.x + Math.cos(dir) * 90, shape.y + Math.sin(dir) * 90, { r: 120, dir, life: 0.3 }); w.sfx('hitMelee'); w.shake(4); if (playerIn(w, shape)) hurt(c); });
      yield* pause(c, c.call.tele + 0.2);
    })());
  },
  *swallowMoon(c) {
    const sh = shared(c.w);
    if (sh.dark) return;
    const e = c.w.enemy(c.h);
    tele(c, { kind: 'circle', x: e.x, y: e.y, r: 140 }, c.call.tele);
    yield c.call.tele;
    const prev = lightNow(c.w);
    const R = c.p.light ?? 260;
    sh.dark = { prev, until: c.w.t + (c.p.dur ?? 15) };
    c.w.light(prev === null ? R : Math.min(prev, R));
    c.w.sfx('gong');
    c.w.title(b('天狗吞月', 'The hound swallows the moon'), 'edge');
    // the darkness lifts on its own; the runner also lifts it when the phase ends or the hound dies
  },
  *moonCross(c) {
    yield* hold(c, (function* () {
      const w0 = c.w, n = c.call.n ?? 4, e0 = w0.enemy(c.h), len = rimR(w0) * 2.2, wd = c.p.w ?? 40;
      let a0 = toPlayer(w0, e0.x, e0.y) + Math.PI / n;
      const spin = (c.p.spin ?? 30) * DEG * (w0.rng() < 0.5 ? -1 : 1);
      for (let k = 0; k < n; k++) tele(c, { kind: 'line', x: e0.x, y: e0.y, dir: a0 + (k * TAU) / n, len, w: wd }, c.call.tele);
      yield* pause(c, c.call.tele);
      c.w.sfx('phaseBreak');
      for (let t = 0; t < (c.p.dur ?? 10); t += c.w.dt) {
        const v = c.w.enemy(c.h);
        v.vx = 0; v.vy = 0;
        a0 += spin * c.w.dt;
        for (let k = 0; k < n; k++) beam(c, v.x, v.y, a0 + (k * TAU) / n, len, wd);
        yield 0;
      }
    })());
  },
};

export const PATTERN_IMPLS: Partial<Record<BossPatternId, PatternImpl>> = {};
for (const id of Object.keys(PATS) as BossPatternId[]) {
  PATTERN_IMPLS[id] = {
    start(w, boss, call) {
      const st = (shared(w).bosses.get(boss) as BossState | undefined) ?? orphanState(w, boss);
      const ctx: PatCtx = { w, h: boss, st, call, p: call.p ?? {}, teles: [], ended: false };
      const run = new CoRun(PATS[id](ctx));
      return {
        tick(ww, dt) { ctx.w = ww; if (!ww.alive(boss)) { stopCtx(ww, ctx, run); return false; } return run.tick(dt); },
        end(ww) { ctx.w = ww; stopCtx(ww, ctx, run); },
      };
    },
  };
}
function stopCtx(w: WorldApi, ctx: PatCtx, run: CoRun): void {
  ctx.ended = true;
  run.stop();
  for (const id of ctx.teles) endTele(w, id);
  ctx.teles.length = 0;
}
/** A pattern started on a body with no runner (tests, the dev hooks): a state good enough to run it. */
function orphanState(w: WorldApi, h: number): BossState {
  const st = newState(w, h, 'carp');
  shared(w).bosses.set(h, st);
  return st;
}

// ═════════════════════════════════════════════ the runner

/** Patterns that keep state for the whole phase; 幽镜's extra pattern never picks these. */
const STATEFUL = new Set<BossPatternId>(['mirageWall', 'swallowMoon', 'twinTrees', 'drumCrack', 'reflections', 'eatMoon', 'mirages', 'illusions', 'adds', 'treeFall']);

function newState(w: WorldApi, h: number, id: BossId): BossState {
  const def = BOSSES[id];
  const e = w.enemy(h);
  return {
    id, def, h, home: homeOf(id), phase: 0, phaseT: 0, fightT: 0, invulnT: 0, stunT: 0, enrage: 0, busy: 0, calls: [], next: [], unionUntil: 0,
    running: [], fx: [], contact0: e.dmg, spdK: 1, anchor: { x: e.x, y: e.y }, rimA: Math.atan2(e.y, e.x), rimDir: w.rng() < 0.5 ? -1 : 1,
    shadow: -1, eaten: 0, tails: def.p.tails ?? 9, stomps: 0, crackT: 0, beatN: 0, gapA: w.rng() * TAU, trees: [], felled: false, phantoms: [],
    reversing: false, dead: false,
  };
}
/** The phase thresholds: 60%, 25%, and 10% under 倒悬. */
function nextAt(w: WorldApi, st: BossState): number | null {
  if (st.phase === 0) return st.def.phases[1].from;
  if (st.phase === 1) return st.def.phases[2].from;
  if (st.phase === 2 && w.run.vows.daoxuan) return 0.1;
  return null;
}
/** The calls a phase runs (plus 幽镜's extra pattern). */
function callsFor(w: WorldApi, st: BossState, p: number): PatternCall[] {
  const def = st.def;
  if (p >= 3) {
    // 倒悬: every pattern at once (one of each)
    const seen = new Set<BossPatternId>();
    const all: PatternCall[] = [];
    for (const ph of def.phases) for (const call of ph.script) if (!seen.has(call.pat)) { seen.add(call.pat); all.push({ ...call, at: (call.at ?? 0) * 0.5 }); }
    return all;
  }
  const own = def.phases[p].script.slice();
  if (w.diff.bossExtraPattern) {
    for (let k = 1; k <= 2; k++) {
      const other = def.phases[(p + k) % 3].script.find((x) => !STATEFUL.has(x.pat) && !own.some((o) => o.pat === x.pat));
      if (other) { own.push({ ...other, at: (other.at ?? 0) + 2, every: other.every * 1.5 }); break; }
    }
  }
  return own;
}
function startScript(w: WorldApi, st: BossState): void {
  st.calls = callsFor(w, st, st.phase);
  st.next = st.calls.map((c) => c.at ?? 0);
  st.phaseT = 0;
  if (st.phase >= 3) st.unionUntil = w.run.vows.daoxuan ? 10 : 0;
}
function endAll(w: WorldApi, st: BossState): void {
  for (const r of st.running) r.end?.(w);
  st.running.length = 0;
  for (const f of st.fx) { try { f.end(w); } catch { /* best effort */ } }
  st.fx.length = 0;
  st.busy = 0;
  if (w.alive(st.h)) setAir(w, st.h, false);
}
function clearPhantoms(w: WorldApi, st: BossState): void {
  for (const h of st.phantoms) if (w.alive(h)) { shared(w).phantoms.delete(h); expire(w, h); }
  st.phantoms.length = 0;
}
function liftDark(w: WorldApi): void {
  const sh = shared(w);
  if (!sh.dark) return;
  w.light(sh.dark.prev);
  sh.dark = null;
}
function unreverse(w: WorldApi, st: BossState): void {
  const sh = shared(w);
  if (!st.reversing) return;
  st.reversing = false;
  sh.reverseUntil = 0;
  const m = moveInput(w);
  if (m.x === sh.revX && m.y === sh.revY) setMoveInput(w, -m.x, -m.y);
}
/** The charm's reversal: any fresh input from the UI is flipped until it wears off. */
function tickReverse(w: WorldApi, st: BossState): void {
  if (!st.reversing) return;
  const sh = shared(w);
  if (w.t >= sh.reverseUntil) { unreverse(w, st); return; }
  const m = moveInput(w);
  if (m.x !== sh.revX || m.y !== sh.revY) { setMoveInput(w, -m.x, -m.y); sh.revX = -m.x; sh.revY = -m.y; }
}

function enterPhase(w: WorldApi, st: BossState, p: number): void {
  endAll(w, st);
  if (st.id !== 'mirage' || p >= 2) clearPhantoms(w, st);
  if (st.id === 'eclipse' && p === 2) liftDark(w);
  st.phase = p;
  st.invulnT = 1.2;
  const e = w.enemy(st.h);
  e.invuln = true; e.vx = 0; e.vy = 0;
  w.bossPhase(st.h, p);
  if (p === 3) {
    const t = core(w).titles;
    const last = t[t.length - 1];
    if (last && last.where === 'centre') last.text = b('倒悬', 'Hung Upside Down');
  }
  startScript(w, st);
}

function move(w: WorldApi, st: BossState, dt: number): void {
  const e = w.enemy(st.h);
  const ph = st.def.phases[Math.min(2, st.phase)];
  const sp = ph.speed * st.spdK * (1 + 0.05 * st.enrage);
  const steerTo = (x: number, y: number, v: number) => {
    const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
    if (d < 4) { e.vx = 0; e.vy = 0; return; }
    const s = Math.min(v, d / Math.max(dt, 1e-3));
    e.vx = (dx / d) * s; e.vy = (dy / d) * s;
  };
  switch (ph.move) {
    case 'rim': {
      const R = rimR(w) - e.r - 40;
      st.rimA += st.rimDir * (sp / Math.max(100, R)) * dt;
      steerTo(Math.cos(st.rimA) * R, Math.sin(st.rimA) * R, sp * 1.4);
      break;
    }
    case 'drift': {
      const a = w.t * 0.25 + st.rimA;
      steerTo(w.player.x + Math.cos(a) * 280, w.player.y + Math.sin(a) * 280, sp);
      break;
    }
    case 'chase': {
      const d = dist(e.x, e.y, w.player.x, w.player.y);
      if (d > e.r + w.player.r + 6) steerTo(w.player.x, w.player.y, sp); else { e.vx = 0; e.vy = 0; }
      break;
    }
    case 'stalk': {
      const dx = e.x - w.player.x, dy = e.y - w.player.y, d = Math.hypot(dx, dy) || 1;
      const a = Math.atan2(dy, dx) + st.rimDir * 0.5;
      steerTo(w.player.x + Math.cos(a) * 240, w.player.y + Math.sin(a) * 240, sp * (d > 320 ? 1.3 : 1));
      break;
    }
    case 'anchor': steerTo(st.anchor.x, st.anchor.y, Math.max(sp, 90)); break;
    case 'leap': e.vx = 0; e.vy = 0; break;
  }
}

/** Per-boss touches every step: tails, growth, the shadow, the reversal. */
function special(w: WorldApi, st: BossState, dt: number): void {
  const e = w.enemy(st.h);
  if (st.shadow >= 0) moveZone(w, st.shadow, e.x, e.y + e.r * 0.45, e.r * 0.95);
  if (st.id === 'fox') {
    const lost = Math.floor((1 - e.hp / e.hpMax) / (st.def.p.tailPer ?? 0.11) + 1e-9);
    const tails = Math.max(0, (st.def.p.tails ?? 9) - lost);
    if (tails < st.tails) {
      st.tails = tails;
      w.fx('petalBurst', e.x - Math.cos(e.vx) * 30, e.y + 20, { r: 70, life: 0.5 });
      fxSprite(w, 'proj:eFoxfire', e.x, e.y + 24, 48, 0.6);
      w.sfx('dodge');
      if (tails === 0) w.title(b('九尾尽落', 'The last tail falls'), 'edge');
    }
    tickReverse(w, st);
  }
  if (st.id === 'goldtoad') e.dmg = st.contact0 * enrageX(st) * growX(st);
  if (st.crackT > 0) st.crackT -= dt;
  const sh = shared(w);
  if (sh.dark && w.t >= sh.dark.until) liftDark(w);
}

const RUNNER: ActorImpl<BossState> = {
  init(w, h) {
    const e = w.enemy(h);
    const id = e.id as BossId;
    const st = newState(w, h, id);
    const def = st.def;
    // damage and contact from the boss's own home wave (endless: wave 30's contact, §14.4)
    const endless = w.wave > 30;
    st.contact0 = (endless ? ENDLESS_BOSS.contact : def.contact) * (core(w).plan.dmgX / Math.max(1e-6, dmgMul(endless ? 30 : st.home)));
    e.dmg = st.contact0;
    st.spdK = e.speed / Math.max(1, def.phases[0].speed);
    // anchors: the arena's heart for 蜃's wall and the moon, beside the tree for 吴刚
    st.anchor = id === 'wugang' ? { x: 0, y: -170 } : id === 'moonwater' || id === 'mirage' ? { x: 0, y: -60 } : { x: e.x, y: e.y };
    if (id === 'mirage' || id === 'fox' || id === 'moonwater') st.shadow = w.zone({ side: 'player', look: 'inkPuddle', x: e.x, y: e.y, r: e.r, life: 1e6 });
    shared(w).bosses.set(h, st);
    if (id === 'wugang' && w.arena.obstacles.some((o) => o.kind === 'tree') && !st.trees.length) {
      const c: PatCtx = { w, h, st, call: def.phases[0].script[0], p: {}, teles: [], ended: false };
      spawnTree(c, 0, 0, true);
    }
    startScript(w, st);
    return st;
  },
  tick(w, h, st, dt) {
    const e = w.enemy(h);
    st.fightT += dt;
    // background effects run through breaks and stuns
    for (let i = st.fx.length - 1; i >= 0; i--) if (!st.fx[i].tick(w, dt)) st.fx.splice(i, 1);
    special(w, st, dt);
    // the phase break: 1.2 s invulnerable and still
    if (st.invulnT > 0) {
      st.invulnT -= dt;
      e.vx = 0; e.vy = 0;
      if (st.invulnT <= 0) e.invuln = false;
      return;
    }
    const at = nextAt(w, st);
    if (at !== null && e.hp <= at * e.hpMax) { enterPhase(w, st, st.phase + 1); return; }
    // enrage from 90 s (闲游 150): +10% damage and +5% speed every 10 s
    const from = w.diff.enrageAt ?? 90;
    if (st.fightT >= from) {
      const lvl = 1 + Math.floor((st.fightT - from) / 10);
      if (lvl !== st.enrage) {
        st.enrage = lvl;
        if (lvl === 1) { w.title(b('怒', 'Enraged'), 'edge'); w.sfx('bossDrum'); }
        if (st.id !== 'goldtoad') e.dmg = st.contact0 * enrageX(st);
      }
    }
    // 吴刚 stunned by the falling tree
    if (st.stunT > 0) {
      st.stunT -= dt;
      e.vx = 0; e.vy = 0;
      if (Math.floor(st.stunT * 2) !== Math.floor((st.stunT + dt) * 2)) w.fx('stunMark', e.x, e.y - e.r - 10, { r: 50, life: 0.5 });
      return;
    }
    // 倒悬: after 10 s of everything, back to the last phase's script
    if (st.phase >= 3 && st.unionUntil > 0 && st.phaseT >= st.unionUntil) {
      st.unionUntil = 0;
      endAll(w, st);
      st.calls = callsFor(w, st, 2);
      st.next = st.calls.map((c) => st.phaseT + (c.at ?? 0));
    }
    // the script: each call at `at`, then every `every`
    for (let k = 0; k < st.calls.length; k++) {
      if (st.phaseT < st.next[k]) continue;
      const call = st.calls[k];
      st.next[k] += Math.max(0.2, call.every);
      const impl = PATTERN_IMPLS[call.pat];
      if (impl) st.running.push(impl.start(w, h, call));
    }
    for (let i = st.running.length - 1; i >= 0; i--) if (!st.running[i].tick(w, dt)) st.running.splice(i, 1);
    if (!st.busy) move(w, st, dt);
    st.phaseT += dt;
  },
  hit(w, h, st) {
    // HP never skips a phase: it holds at the next threshold until the break
    const at = nextAt(w, st);
    if (at === null || st.invulnT > 0) return;
    const e = w.enemy(h);
    if (e.hp < at * e.hpMax) e.hp = Math.max(1, at * e.hpMax - 0.5);
  },
  death(w, h, st) {
    st.dead = true;
    endAll(w, st);
    clearPhantoms(w, st);
    for (const t of st.trees) if (w.alive(t)) { shared(w).phantoms.delete(t); expire(w, t, 'petalBurst'); }
    st.trees.length = 0;
    if (st.shadow >= 0) w.endZone(st.shadow);
    unreverse(w, st);
    if (st.id === 'eclipse') liftDark(w);
    // 蜃's wall resets when the clam dies (the pattern's finally ends it); 金蟾王 returns what it ate ×1.5
    if (st.id === 'goldtoad' && st.eaten > 0) {
      const e = w.enemy(h);
      dropMoon(w, e.x, e.y, st.eaten * (st.def.p.refund ?? 1.5));
      w.title(b('金蟾吐宝', 'The toad gives it all back'), 'edge');
    }
    shared(w).bosses.delete(h);
  },
};
export const BOSS_IMPLS: Partial<Record<BossId, ActorImpl>> = {};
for (const id of Object.keys(BOSSES) as BossId[]) BOSS_IMPLS[id] = RUNNER as ActorImpl;

/** For the dev hooks and tests: the runner state of a boss body. */
export function bossState(w: WorldApi, h: number): BossState | null { return (shared(w).bosses.get(h) as BossState | undefined) ?? null; }
/** Push a boss straight into a phase (dev): HP set just under the threshold, the break follows. */
export function forcePhase(w: WorldApi, h: number, p: number): void {
  const st = bossState(w, h);
  if (!st || !w.alive(h)) return;
  const e = w.enemy(h);
  while (st.phase < p) {
    if (st.invulnT > 0) { st.invulnT = 0; e.invuln = false; }
    const at = st.phase === 0 ? st.def.phases[1].from : st.phase === 1 ? st.def.phases[2].from : 0.1;
    e.hp = Math.min(e.hp, at * e.hpMax - 0.5);
    enterPhase(w, st, st.phase + 1);
  }
}
