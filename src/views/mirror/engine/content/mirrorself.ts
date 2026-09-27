// 水月幻镜 · 镜主, the Mirror Self (GDD §14.4): your own companion in white ink on black, fought at
// waves 50, 100 …. It carries your weapons (their kinds and cadence, at half the weight of a boss
// attack), casts a mirrored 镜技 on 1.5× your cooldown, and from 50% HP copies your latest purchase
// every 20 s for +10% damage. The core spawns it with 80% of the wave's boss HP.
import { named } from '../../ids';
import type { WeaponId } from '../../ids';
import type { ActorImpl, CharacterId, TeleShape, WeaponKind, WorldApi } from '../../types';
import { COMPANIONS, ENDLESS_BOSS, SKILLS, WEAPONS } from '../../data';
import { dmgMul } from '../../logic/formulas';
import { core, endTele, enemyShot, expire, fxLine, liveTele, pullPlayer, pushPlayer, setAir, teleShape } from './bridge';
import { shotSpeedX } from './field';
import { CoRun, DEG, TAU, b, clamp, dist, hurtPlayer, playerIn, shared, toPlayer, type Co } from './util';

const MELEE: ReadonlySet<WeaponKind> = new Set(['thrust', 'combo', 'sweep', 'smash', 'punch']);
const TIER_X = [1, 1.3, 1.7, 2.2] as const;

interface Arm { id: WeaponId; t: 1 | 2 | 3 | 4; kind: WeaponKind; cd: number; timer: number; range: number }
interface MS {
  h: number;
  k: number;
  phase: number;
  invulnT: number;
  fightT: number;
  enrage: number;
  mult: number;
  copyT: number;
  arms: Arm[];
  melee: boolean;
  skillCd: number;
  skillT: number;
  skill: CoRun | null;
  strafe: number;
  teles: number[];
  rings: { id: number; x: number; y: number; r: number; speed: number; to: number; dmg: number; done: boolean; gaps: { at: number; w: number }[] }[];
  minions: number[];
  contact0: number;
  /** >0 while its skill moves the body. */
  busy: number;
  w: WorldApi;
}

const S = (s: MS, k = 1) => 40 * s.k * s.mult * (1 + 0.1 * s.enrage) * k;
function hurtMe(s: MS, n: number, o: { undodgeable?: boolean } = {}): void {
  const e = s.w.enemy(s.h);
  hurtPlayer(s.w, n, 'mirrorself', { undodgeable: o.undodgeable, from: { x: e.x, y: e.y } });
}
function tele(s: MS, shape: TeleShape, dur: number, then?: (w: WorldApi) => void): void {
  const id = s.w.tele({ shape, dur, then: then ? (w) => { if (w.alive(s.h)) { s.w = w; then(w); } } : undefined });
  if (id >= 0) s.teles.push(id);
  if (s.teles.length > 40) s.teles.splice(0, s.teles.length - 40);
}
function ring(s: MS, x: number, y: number, speed: number, to: number, dmg: number, gaps: { at: number; w: number }[]): void {
  const id = liveTele(s.w, { kind: 'ring', x, y, r: 10, r2: 34, gaps }, 0.85);
  s.rings.push({ id, x, y, r: 22, speed, to, dmg, done: false, gaps });
}
/** One weapon's strike, by kind. */
function fireArm(s: MS, a: Arm): void {
  const w = s.w, e = w.enemy(s.h), d = dist(e.x, e.y, w.player.x, w.player.y);
  const per = 8 * clamp(a.cd, 0.4, 2.4) * TIER_X[a.t - 1] * s.k * s.mult * (1 + 0.1 * s.enrage);
  const dir = toPlayer(w, e.x, e.y);
  const sp = 460 * shotSpeedX(w);
  const shot = (ang: number, o: { homing?: number; boomerang?: boolean } = {}) =>
    enemyShot(w, 'eMoonShard', e.x, e.y, Math.cos(ang) * sp, Math.sin(ang) * sp, 9, Math.min(2.4, (a.range + 200) / sp), per, o);
  switch (a.kind) {
    case 'thrust': case 'combo': case 'sweep': case 'smash': case 'punch': {
      if (d > a.range + 70) return;
      const deg = a.kind === 'sweep' ? 140 : a.kind === 'thrust' ? 36 : a.kind === 'punch' ? 70 : 90;
      const shape: TeleShape = { kind: 'cone', x: e.x, y: e.y, dir, r: a.range + 30, deg };
      tele(s, shape, 0.4, (ww) => { ww.fx('slashArc', shape.x + Math.cos(dir) * 40, shape.y + Math.sin(dir) * 40, { r: a.range * 0.6, dir, life: 0.25 }); if (playerIn(ww, shape)) hurtMe(s, per); });
      return;
    }
    case 'slam': case 'lob': case 'rain': case 'mine': case 'chain': {
      if (d > a.range + 200) return;
      const r = a.kind === 'chain' ? 50 : 80;
      const at = { x: w.player.x + w.player.vx * 0.3, y: w.player.y + w.player.vy * 0.3 };
      const shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r };
      tele(s, shape, 0.7, (ww) => { ww.fx(a.kind === 'chain' ? 'lightningStrike' : 'shockRing', at.x, at.y, { r: a.kind === 'chain' ? 53 : r, life: 0.3 }); if (playerIn(ww, shape)) hurtMe(s, per); });
      return;
    }
    case 'beam': {
      const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len: a.range + 100, w: 30 };
      tele(s, shape, 0.5, (ww) => { fxLine(ww, 'beamRay', shape.x, shape.y, dir, shape.len, 0.25, 30 / 16); if (playerIn(ww, shape)) hurtMe(s, per, { undodgeable: true }); });
      return;
    }
    case 'pulse': case 'orbit': {
      const r = a.kind === 'pulse' ? 150 : 110;
      if (d > r + 60) return;
      const shape: TeleShape = { kind: 'circle', x: e.x, y: e.y, r };
      tele(s, shape, 0.45, (ww) => { const v = ww.enemy(s.h); ww.fx('shockRing', v.x, v.y, { r, life: 0.3 }); if (playerIn(ww, { kind: 'circle', x: v.x, y: v.y, r })) hurtMe(s, per); });
      return;
    }
    case 'burst': for (let k = -1; k <= 1; k++) shot(dir + k * 6 * DEG); return;
    case 'homing': case 'launch': shot(dir, { homing: 1.6 }); return;
    case 'boomerang': shot(dir, { boomerang: true }); return;
    case 'projectile': case 'hook': shot(dir); return;
    case 'paint': case 'turret': case 'familiar': {
      s.minions = s.minions.filter((m) => w.alive(m));
      if (s.minions.length >= 4) return;
      const ang = w.rng() * TAU;
      const m = w.spawn('blot', e.x + Math.cos(ang) * 60, e.y + Math.sin(ang) * 60, { bloom: true, noDrops: true });
      if (m >= 0) s.minions.push(m);
      return;
    }
  }
}

/** The mirrored 镜技: your skill's shape, turned on you. */
function* mirrorSkill(s: MS, char: CharacterId): Co {
  const w0 = s.w;
  const me = () => s.w.enemy(s.h);
  const P = () => ({ x: s.w.player.x, y: s.w.player.y });
  switch (char) {
    case 'scholar': {
      const at = P(), shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r: 180 };
      tele(s, shape, 0.9, (w) => { w.fx('shockRing', at.x, at.y, { r: 180, life: 0.35 }); if (playerIn(w, shape)) hurtMe(s, S(s)); w.zone({ side: 'enemy', look: 'zhenGlyph', x: at.x, y: at.y, r: 180, life: 5, slow: 40 }); });
      return;
    }
    case 'gardener': {
      const at = P();
      tele(s, { kind: 'circle', x: at.x, y: at.y, r: 160 }, 0.8, (w) => { w.zone({ side: 'enemy', look: 'flowerbed', x: at.x, y: at.y, r: 160, life: 8, slow: 25, dmgPerSec: S(s, 0.2) }); });
      return;
    }
    case 'fisher': {
      const at = P(), shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r: 150 };
      tele(s, shape, 0.9, (w) => { w.fx('shockRing', at.x, at.y, { r: 150, life: 0.3 }); if (playerIn(w, shape)) { hurtMe(s, S(s, 0.6)); w.root(1.2); pullPlayer(w, at.x, at.y, dist(at.x, at.y, w.player.x, w.player.y)); } });
      return;
    }
    case 'musician': {
      for (let k = 0; k < 4; k++) { const e = me(); const g = s.w.rng() * TAU; ring(s, e.x, e.y, 280, 600, S(s, 0.5), [{ at: g, w: 50 * DEG }, { at: g + Math.PI, w: 50 * DEG }]); yield 0.75; }
      return;
    }
    case 'swordsman': case 'guan': {
      const e = me(), dir = toPlayer(s.w, e.x, e.y);
      if (char === 'guan') {
        const shape: TeleShape = { kind: 'circle', x: e.x, y: e.y, r: 260 };
        tele(s, shape, 0.8, (w) => { const v = w.enemy(s.h); w.fx('shockRing', v.x, v.y, { r: 260, life: 0.35 }); if (playerIn(w, { kind: 'circle', x: v.x, y: v.y, r: 260 })) { hurtMe(s, S(s, 1.2)); pushPlayer(w, v.x, v.y, 120); } });
        return;
      }
      const shape: TeleShape = { kind: 'line', x: e.x, y: e.y, dir, len: 520, w: 60 };
      tele(s, shape, 0.7);
      yield 0.7;
      if (playerIn(s.w, shape)) hurtMe(s, S(s));
      s.busy++;
      try {
        for (let t = 0; t < 0.25; t += s.w.dt) { const v = me(); const k = 520 / 0.25 * s.w.dt; v.vx = 0; v.vy = 0; v.x += Math.cos(dir) * k; v.y += Math.sin(dir) * k; const c = s.w.clampToArena({ x: v.x, y: v.y }, v.r); v.x = c.x; v.y = c.y; yield 0; }
      } finally { s.busy--; }
      return;
    }
    case 'taoist': {
      const at = P();
      const z = w0.zone({ side: 'enemy', look: 'vortex', x: at.x, y: at.y, r: 180, life: 4 });
      void z;
      for (let t = 0; t < 4; t += s.w.dt) {
        const w = s.w, d = dist(at.x, at.y, w.player.x, w.player.y);
        if (d < 200 && d > 10) pullPlayer(w, at.x, at.y, 60 * w.dt * 4);
        if (Math.floor(t) !== Math.floor(t + w.dt)) { const q = P(), sh: TeleShape = { kind: 'circle', x: q.x, y: q.y, r: 60 }; tele(s, sh, 0.6, (ww) => { ww.fx('lightningStrike', q.x, q.y, { r: 64, life: 0.3 }); if (playerIn(ww, sh)) hurtMe(s, S(s, 0.4)); }); }
        yield 0;
      }
      return;
    }
    case 'painter': {
      const e = me();
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; const m = s.w.spawn('blot', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, { bloom: true, noDrops: true }); if (m >= 0) s.minions.push(m); }
      return;
    }
    case 'player': {
      const at = P(), shape: TeleShape = { kind: 'circle', x: at.x, y: at.y, r: 200 };
      tele(s, shape, 1.2, (w) => { w.fx('shockRing', at.x, at.y, { r: 120, life: 0.35 }); if (playerIn(w, shape)) hurtMe(s, S(s, 1.2)); });
      for (let t = 0; t < 1.2; t += s.w.dt) {
        const R = 220 * (1 - 0.5 * t / 1.2);
        if (Math.floor(t / s.w.dt) % 2 === 0) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + t; s.w.fx(k % 2 ? 'stoneWhite' : 'stoneBlack', at.x + Math.cos(a) * R, at.y + Math.sin(a) * R, { r: 40, life: s.w.dt * 2.2 }); }
        yield 0;
      }
      return;
    }
    case 'cat': case 'change': {
      const to = P(), r = char === 'cat' ? 90 : 220, air = char === 'cat' ? 0.7 : 1.4;
      const shape: TeleShape = { kind: 'circle', x: to.x, y: to.y, r };
      tele(s, shape, air, (w) => {
        w.fx('shockRing', to.x, to.y, { r, life: 0.35 }); w.shake(3);
        if (playerIn(w, shape)) hurtMe(s, S(s, char === 'cat' ? 0.8 : 1));
        if (char === 'change') w.zone({ side: 'enemy', look: 'moonPool', x: to.x, y: to.y, r, life: 5, slow: 20 });
      });
      const e = me(), fx = e.x, fy = e.y;
      setAir(s.w, s.h, true);
      if (char === 'change') e.untargetable = true;
      s.busy++;
      try {
        for (let t = 0; t < air; t += s.w.dt) { const v = me(), k = Math.min(1, (t + s.w.dt) / air); v.x = fx + (to.x - fx) * k; v.y = fy + (to.y - fy) * k; v.vx = 0; v.vy = 0; yield 0; }
      } finally {
        s.busy--;
        if (s.w.alive(s.h)) { setAir(s.w, s.h, false); me().untargetable = false; }
      }
      return;
    }
    case 'rabbit': {
      for (let k = 0; k < 3; k++) {
        const e = me(), shape: TeleShape = { kind: 'circle', x: e.x, y: e.y, r: 150 };
        tele(s, shape, 0.5, (w) => { w.fx('shockRing', shape.x, shape.y, { r: 150, life: 0.3 }); if (playerIn(w, shape)) hurtMe(s, S(s, 0.5)); });
        yield 0.55;
      }
      const e = me();
      e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.05);
      return;
    }
    case 'poet': {
      const e = me();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; enemyShot(s.w, 'eMoonShard', e.x, e.y, Math.cos(a) * 240, Math.sin(a) * 240, 9, 4, S(s, 0.3), { homing: 1.2 }); }
      return;
    }
  }
}

export const MIRROR_SELF: ActorImpl<MS> = {
  init(w, h) {
    const e = w.enemy(h);
    const k = core(w).plan.dmgX / Math.max(1e-6, dmgMul(30));
    const arms: Arm[] = w.run.weapons.map((o, i) => {
      const def = WEAPONS[o.id];
      const cd = def.cd * [1, 0.95, 0.9, 0.85][o.t - 1];
      return { id: o.id, t: o.t, kind: def.kind, cd: Math.max(0.5, cd), timer: 1.5 + i * 0.4, range: def.range };
    });
    const melee = arms.filter((a) => MELEE.has(a.kind)).length * 2 >= Math.max(1, arms.length);
    const skill = SKILLS[COMPANIONS[w.run.char].skill];
    const s: MS = {
      h, k, phase: 0, invulnT: 0, fightT: 0, enrage: 0, mult: 1, copyT: ENDLESS_BOSS.mirrorself.copyEvery, arms, melee,
      skillCd: (skill?.cd ?? 14) * ENDLESS_BOSS.mirrorself.skillCdX, skillT: 6, skill: null, strafe: w.rng() < 0.5 ? -1 : 1,
      teles: [], rings: [], minions: [], contact0: ENDLESS_BOSS.contact * k, busy: 0, w,
    };
    e.dmg = s.contact0;
    w.title(b('镜中人是我', 'The one in the mirror is me'), 'edge');
    return s;
  },
  tick(w, h, s, dt) {
    s.w = w;
    const e = w.enemy(h);
    s.fightT += dt;
    // its rings
    for (let i = s.rings.length - 1; i >= 0; i--) {
      const r = s.rings[i];
      r.r += r.speed * dt;
      const sh = teleShape(w, r.id);
      if (sh && sh.kind === 'ring') { sh.r = Math.max(0, r.r - 12); sh.r2 = r.r + 12; }
      if (!r.done && playerIn(w, { kind: 'ring', x: r.x, y: r.y, r: Math.max(0, r.r - 12), r2: r.r + 12, gaps: r.gaps })) { r.done = true; hurtMe(s, r.dmg); }
      if (r.r > r.to) { endTele(w, r.id); s.rings.splice(i, 1); }
    }
    if (s.invulnT > 0) {
      s.invulnT -= dt; e.vx = 0; e.vy = 0;
      if (s.invulnT <= 0) e.invuln = false;
      return;
    }
    // at 50%: the break, then it copies your latest purchase every 20 s
    if (s.phase === 0 && e.hp <= e.hpMax * ENDLESS_BOSS.mirrorself.copyAt) {
      s.phase = 1; s.invulnT = 1.2; e.invuln = true;
      s.skill?.stop(); s.skill = null;
      w.bossPhase(h, 1);
      w.title(b('摹', 'It learns from you'), 'centre');
      return;
    }
    if (s.phase === 1) {
      s.copyT -= dt;
      if (s.copyT <= 0) {
        s.copyT = ENDLESS_BOSS.mirrorself.copyEvery;
        s.mult += ENDLESS_BOSS.mirrorself.copyDmg;
        const last = w.run.lastBuy ? named(w.run.lastBuy) : null;
        w.title(b(`摹 · ${last?.zh ?? '镜影'}`, `It copies ${last?.en ?? 'you'}`), 'edge');
        w.fx('levelRing', e.x, e.y, { r: 90, life: 0.5 });
        w.sfx('merge');
      }
    }
    // enrage from 90 s
    const from = w.diff.enrageAt ?? 90;
    if (s.fightT >= from) {
      const lvl = 1 + Math.floor((s.fightT - from) / 10);
      if (lvl !== s.enrage) { s.enrage = lvl; e.dmg = s.contact0 * (1 + 0.1 * lvl); if (lvl === 1) w.title(b('怒', 'Enraged'), 'edge'); }
    }
    // its skill
    if (s.skill) { if (!s.skill.tick(dt)) s.skill = null; }
    else {
      s.skillT -= dt;
      if (s.skillT <= 0) { s.skillT = s.skillCd; s.skill = new CoRun(mirrorSkill(s, w.run.char)); }
    }
    // its weapons
    for (const a of s.arms) { a.timer -= dt; if (a.timer <= 0) { a.timer = a.cd * (s.phase ? 0.9 : 1); fireArm(s, a); } }
    // it moves like you: kiting, or closing in with a melee build
    if (s.busy > 0) { e.vx = 0; e.vy = 0; }
    else {
      const dx = e.x - w.player.x, dy = e.y - w.player.y, d = Math.hypot(dx, dy) || 1;
      const want = s.melee ? 80 : 250;
      const sp = 280 * (1 + clamp(w.stats.speed, -60, 100) / 100) * 0.8 * (1 + 0.05 * s.enrage);
      const radial = d > want + 30 ? -1 : d < want - 30 ? 1 : 0;
      const tx = -dy / d * s.strafe, ty = dx / d * s.strafe;
      e.vx = ((dx / d) * radial * 1.2 + tx * 0.7) * sp;
      e.vy = ((dy / d) * radial * 1.2 + ty * 0.7) * sp;
      if (!w.inArena(e.x + e.vx * 0.4, e.y + e.vy * 0.4, e.r)) s.strafe = -s.strafe;
    }
  },
  hit(w, h, s) {
    // HP holds at 50% until the break
    if (s.phase > 0 || s.invulnT > 0) return;
    const e = w.enemy(h);
    const at = e.hpMax * ENDLESS_BOSS.mirrorself.copyAt;
    if (e.hp < at) e.hp = Math.max(1, at - 0.5);
  },
  death(w, _h, s) {
    s.skill?.stop();
    for (const id of s.teles) endTele(w, id);
    for (const r of s.rings) endTele(w, r.id);
    for (const m of s.minions) if (w.alive(m)) expire(w, m);
    shared(w).bosses.delete(s.h);
    w.title(b('镜中人', 'The one in the mirror'), 'edge');
  },
};
