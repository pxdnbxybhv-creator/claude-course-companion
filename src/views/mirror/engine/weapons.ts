// 水月幻镜 · weapons (GDD §8): the 22 weapon kinds with their auto-aim rules, the class-set flags,
// the in-wave item mods on firing (绕梁 echo, 十面埋伏, 水月镜, 拖刀诀), player shots, 墨宝 summons,
// flying swords (≤ 24 on screen: launch, homing, rain, 剑匣 blades, 剑冢, idle orbit, 万剑归宗) and
// go stones (arm, blast, chain, 提子).
import type { WeaponId } from '../ids';
import type { Stats, Tier, WClass, WeaponDef, WeaponKind } from '../types';
import { F, PASSIVES, WEAPONS } from '../data';
import {
  charMult, clamp, cooldown, critChance, critMult, dmgMult, dottingX, luckMult, perTier, procCoef, rawDamage, stonesOf, summonCapOf,
  tierCd, weaponRange,
} from '../logic/formulas';
import { emptyStats } from '../logic/formulas';
import { EKind, SF, SMode } from './pools';
import { DEG, HF, PK, SK, SRCI, SWORDS_ON_SCREEN, TAG_BIT, TAU, ZC, angDiff, segDist2 } from './consts';
import { classExtras } from './effects';
import { areaStrike } from './enemies';
import type { World } from './world';

export interface WeaponSlot {
  i: number;
  id: WeaponId;
  t: Tier;
  def: WeaponDef;
  kind: WeaponKind;
  cls: readonly WClass[];
  cd: number;
  n: number;
  charM: number;
  crit: number;
  critX: number;
  proc: number;
  stats: Stats;
  music: boolean; talisman: boolean; heavy: boolean; flying: boolean; ink: boolean; wine: boolean; sword: boolean;
  stack: number; stackT: number;
  queue: number; queueT: number; qDir: number; qX: number;
  familiar: number;
  flareT: number;
  echoT: number; echoDir: number;
  waitBeat: number;
  /** Set by an attack that resets its own cooldown (醉拳 IV on a crit). */
  resetCd: boolean;
  hit: number;
  /** Per-enemy contact timers for orbit blades. */
  touch: Float32Array | null;
  swords: number;
}

const NO_DIR = 1e9;

/** Build the wave's weapon slots from the run. */
export function initWeapons(W: World): void {
  W.slots = W.run.weapons.map((ow, i) => {
    const def = WEAPONS[ow.id];
    const t4c = ow.t === 4 ? def.p.critT4 : undefined;
    const critX = def.critX > 0 ? def.critX : def.classes.includes('ink') ? dottingX(W.run) : 0;
    const s: WeaponSlot = {
      i, id: ow.id, t: ow.t, def, kind: def.kind, cls: def.classes, cd: 0.25 + i * 0.07, n: 0,
      charM: charMult(W.run, def), crit: def.crit + (typeof t4c === 'number' ? t4c : 0), critX, proc: procCoef(def.cd),
      stats: emptyStats(),
      music: def.classes.includes('music'), talisman: def.classes.includes('talisman'), heavy: def.classes.includes('heavy'),
      flying: def.classes.includes('flying'), ink: def.classes.includes('ink'), wine: def.classes.includes('wine'), sword: def.classes.includes('sword'),
      stack: 0, stackT: 0, queue: 0, queueT: 0, qDir: 0, qX: 1, familiar: -1, flareT: 0, echoT: 0, echoDir: 0, waitBeat: 0, resetCd: false, hit: 0,
      touch: def.kind === 'orbit' ? new Float32Array(W.E.cap) : null, swords: 0,
    };
    return s;
  });
  heavyCount = 0;
  W.blades = 0;
  W.canjian = 0;
  W.wanjianT = 0;
  W.captureT = 0;
  W.lingboT = 0;
  W.sproutT = W.mods.sprout ? W.mods.sprout.every * 0.5 : 0;
  // permanent familiars: 纸鹤 (weapon) and 墨鹤 (item)
  for (const s of W.slots) if (s.kind === 'familiar') s.familiar = spawnSummon(W, 'zhihe', s, W.px + 60, W.py, 1e9, false);
  const fam = W.mods.familiar;
  if (fam) for (let k = 0; k < fam.n; k++) spawnFamiliarItem(W, k);
}
let heavyCount = 0;

// ─────────────────────────────────────────────────────────────── damage numbers for a slot

/** The slot's live sheet with class extras (剑穗, 剑心通明, 剑意, 棋谱) and 龙泉 stacks. */
function sheet(W: World, s: WeaponSlot): Stats {
  classExtras(s.stats, W.stats, s.cls, W.mods, W.live);
  if (s.stack > 0) s.stats.aspd += s.stack;
  return s.stats;
}
/** raw × mult for a slot (before crit and armour). */
function dmgOf(W: World, s: WeaponSlot, st: Stats): number {
  let raw = rawDamage(s.def, s.t, st);
  if (s.id === 'coindart') raw += Math.min(perTier(s.def.p.coin, s.t), Math.floor(W.moonHeld / (s.def.p.per as number ?? 25)));
  let mult = dmgMult(st) * s.charM;
  if (W.mods.special.dugu && W.run.weapons.length === 1) mult *= W.mods.special.dugu.x ?? 3;
  if (s.id === 'moonwheel') mult *= 1 + Math.min(perTier(s.def.p.speedDmg, s.t), Math.max(0, st.speed)) / 100;
  return raw * mult;
}
function critPOf(s: WeaponSlot, st: Stats): number { return s.critX > 0 ? critChance(s.crit, st) : 0; }
function critMOf(s: WeaponSlot, st: Stats): number { return s.critX > 0 ? critMult(s.critX, s.crit, st) : 1; }
function areaOf(W: World, s: WeaponSlot, st: Stats): number {
  let a = st.area;
  if (s.music) {
    if (W.mods.flags.has('musicArea30')) a += 30; else if (W.mods.flags.has('musicArea20')) a += 20; else if (W.mods.flags.has('musicArea10')) a += 10;
    if (W.run.char === 'musician') a += PASSIVES.zhiyin.p.area;
  }
  return Math.max(0.2, 1 + a / 100);
}
/**
 * A 棋罐 blast's radius, as the balance sim has it: r × √(1 + 范围) × (1 + (go 6-set 25 + 棋谱 20 each)/100).
 * 棋谱's +20 范围 reaches the go sheet through its class cond, so it is taken out of the square root.
 */
function stoneRadius(W: World, s: WeaponSlot, st: Stats): number {
  const manual = 20 * (W.run.items.gomanual ?? 0);
  const lin = (W.mods.flags.has('goArea25') ? 25 : 0) + manual;
  return F.stone.r * Math.sqrt(Math.max(0.2, 1 + (st.area - manual) / 100)) * (1 + lin / 100);
}
function rangeOf(W: World, s: WeaponSlot, st: Stats): number {
  const pct = W.run.char === 'rabbit' ? PASSIVES.yaoxiang.p.rangePct : 0;
  return weaponRange(s.def, st, pct);
}

// ─────────────────────────────────────────────────────────────── firing

export function fireWeapons(W: World, dt: number): void {
  const manual = W.settings.aim === 'manual' && (Math.hypot(W.aimX, W.aimY) > 0.2 || W.cursorT < 2);
  for (const s of W.slots) {
    if (s.stackT > 0) { s.stackT -= dt; if (s.stackT <= 0) s.stack = 0; }
    if (s.queue > 0) { s.queueT -= dt; if (s.queueT <= 0) fireQueued(W, s); }
    if (s.echoT > 0) { s.echoT -= dt; if (s.echoT <= 0) fireKind(W, s, s.echoDir, W.mods.echo ? W.mods.echo.pct / 100 : 0.5, true); }
    if (s.flareT > 0) s.flareT -= dt;
    s.cd -= dt;
    if (s.cd > 0) continue;
    // 琴师 知音: 乐器 fire on the beat (a wait of 0.25 s at most)
    if (s.music && W.run.char === 'musician' && !W.beat && s.waitBeat < PASSIVES.zhiyin.p.wait) { s.waitBeat += dt; continue; }
    s.waitBeat = 0;
    const st = sheet(W, s);
    const half = s.kind === 'paint' || s.kind === 'turret' || s.kind === 'mine' || s.kind === 'familiar';
    let aspd = st.aspd;
    if (s.ink && W.mods.summonCrit) aspd += W.mods.summonCrit.aspd;
    const cdv = cooldown(tierCd(s.def, s.t), aspd, half);
    let dir = NO_DIR;
    if (manual && (s.kind === 'projectile' || s.kind === 'beam' || s.kind === 'launch' || s.kind === 'boomerang' || s.kind === 'burst')) dir = aimDir(W);
    let xm = 1;
    if (W.mods.every && s.cls.includes(W.mods.every.cls)) { heavyCount++; if (heavyCount % W.mods.every.n === 0) xm *= W.mods.every.x; }
    s.resetCd = false;
    const fired = fireKind(W, s, dir, xm, false);
    if (!fired) { s.cd = 0.1; continue; }
    // 醉拳 IV: a crit resets the cooldown. As in the balance sim (aps ÷ max(0.5, 1 − crit)), the
    // attack rate at most doubles: up to 50% crit a reset is immediate, above it the reset leaves
    // 1 − 0.5/crit of the cooldown (100% crit: every attack at half the cooldown).
    if (s.resetCd) { const c = critPOf(s, st); s.cd = Math.max(0.05, cdv * Math.max(0, 1 - 0.5 / Math.max(0.5, c))); }
    else s.cd = cdv;
    s.resetCd = false;
    s.n++;
    if (s.music && W.mods.echo) { s.echoT = W.mods.echo.delay; s.echoDir = W.lastDir; }
    // 十面埋伏: every 4th 乐器/符箓 attack fires every other 乐器 and 符箓 weapon at 40%
    const amb = W.mods.special.ambush;
    if (amb && (s.music || s.talisman)) {
      W.ambushN++;
      if (W.ambushN % (amb.every ?? 4) === 0) {
        for (const o of W.slots) if (o !== s && (o.music || o.talisman)) fireKind(W, o, NO_DIR, (amb.pct ?? 40) / 100, true);
        W.title({ zh: '十面埋伏', en: 'Ambush' }, 'edge');
      }
    }
    // 水月镜: a mirrored attack behind you at 50%
    const wm = W.mods.special.watermoon;
    if (wm && W.lastDir !== NO_DIR && s.kind !== 'paint' && s.kind !== 'turret' && s.kind !== 'familiar' && s.kind !== 'mine' && s.kind !== 'orbit' && s.kind !== 'pulse') {
      fireKind(W, s, W.lastDir + Math.PI, (wm.pct ?? 50) / 100, true);
    }
  }
}

function aimDir(W: World): number {
  if (Math.hypot(W.aimX, W.aimY) > 0.2) return Math.atan2(W.aimY, W.aimX);
  if (W.cursorX >= 0) {
    const c = W.cam;
    const wx = (W.cursorX * c.dpr - c.w / 2) / c.scale + c.x, wy = (W.cursorY * c.dpr - c.h / 2) / c.scale + c.y;
    return Math.atan2(wy - W.py, wx - W.px);
  }
  return W.face;
}

/** Sway of auto-aim: 诗仙 ±10°, 醉仙 ±25°. */
function sway(W: World, s: WeaponSlot): number {
  let deg = 0;
  if (W.run.char === 'poet') deg = PASSIVES.baipian.p.sway;
  if (W.drunkOn && W.drunk >= 100) deg = F.drunk.sway;
  if (s.id === 'drunkfist') deg = Math.max(deg, s.def.p.sway as number);
  return deg ? (W.erng() * 2 - 1) * deg * DEG : 0;
}

/**
 * Fire one attack of slot s. `dir` NO_DIR = auto-aim by kind; `xm` multiplies damage (echo,
 * ambush, 水月镜, 拖刀诀); `extra` marks a bonus attack (no counters). Returns false with no target.
 */
function fireKind(W: World, s: WeaponSlot, dir: number, xm: number, extra: boolean): boolean {
  const st = extra ? s.stats : s.stats;
  const E = W.E;
  const px = W.px, py = W.py;
  const range = rangeOf(W, s, st);
  const d = dmgOf(W, s, st) * xm;
  const cp = critPOf(s, st), cm = critMOf(s, st);
  const knock = s.def.knock;
  const p = s.def.p;
  const t = s.t;
  let target = -1;
  const auto = dir === NO_DIR;
  W.lastDir = NO_DIR;
  switch (s.kind) {
    case 'thrust': case 'combo': case 'sweep': case 'smash': case 'punch': {
      if (auto) {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
        dir = Math.atan2(E.y[target] - py, E.x[target] - px) + sway(W, s);
      }
      W.lastDir = dir;
      if (s.kind === 'thrust') {
        const pierce = perTier(p.pierce, t, 1) + st.pierce + (W.mods.flags.has('swordPierce') && s.sword ? 1 : 0);
        thrustHit(W, s, px, py, dir, range, (p.w as number) ?? 24, 1 + pierce, d, cp, cm, knock);
        W.fxLine('swordStreak', px + Math.cos(dir) * range, py + Math.sin(dir) * range, dir, range, 0.14, 1);
      } else if (s.kind === 'combo') {
        const spin = t === 4 && s.id === 'longquan' && (s.n + 1) % ((p.spinEvery as number) ?? 3) === 0;
        s.queue = ((p.hits as number) ?? 2) - 1; s.queueT = 0.09; s.qDir = dir; s.qX = xm;
        swipe(W, s, dir, range * areaOf(W, s, st) ** 0.5, spin ? 360 : (p.deg as number) ?? 90, d, cp, cm, knock);
      } else if (s.kind === 'sweep') {
        const big = t === 4 && (s.n + 1) % ((p.bigEvery as number) ?? 4) === 0;
        swipe(W, s, dir, range * areaOf(W, s, st) ** 0.5, (p.deg as number) ?? 140, d * (big ? 2 : 1), cp, cm, knock);
        if (big) crescent(W, s, dir, d, cp, cm);
      } else if (s.kind === 'smash') {
        swipe(W, s, dir, range * areaOf(W, s, st) ** 0.5, (p.deg as number) ?? 90, d, cp, cm, knock);
      } else {
        // 醉拳: a 70° arc that sways ±25°; +3 醉 per hit; IV: a crit resets the cooldown
        const c0 = W.critN;
        const hits = swipe(W, s, dir, range * areaOf(W, s, st) ** 0.5, (p.deg as number) ?? 70, d, cp, cm, knock);
        if (hits) W.addDrunk(((p.drunk as number) ?? 3) * hits * s.proc);
        // IV: any crit in the swing resets the cooldown (bonus attacks do not)
        if (t === 4 && !extra && W.critN > c0) s.resetCd = true;
      }
      return true;
    }
    case 'slam': {
      if (auto) {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
      }
      const tx = target >= 0 ? E.x[target] : px + Math.cos(dir) * range * 0.7, ty = target >= 0 ? E.y[target] : py + Math.sin(dir) * range * 0.7;
      W.lastDir = Math.atan2(ty - py, tx - px);
      // the sim's smashAt: r × √(1 + 范围)
      const r = ((p.r as number) ?? 80) * areaOf(W, s, st) ** 0.5;
      const n = areaStrike(W, tx, ty, r, d, s.i, SRCI.weapon, HF.melee, knock, cp, cm);
      W.fx('shockRing', tx, ty, { r, life: 0.3 });
      if (n && W.erng() < ((p.healChance as number) ?? 0.1) * s.proc) W.heal(1);
      if (n && t === 4) W.shield(n, (p.shieldMax as number) ?? 10);
      W.sfx('hitMelee');
      return true;
    }
    case 'projectile': case 'burst': case 'hook': {
      if (auto) {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
        dir = Math.atan2(E.y[target] - py, E.x[target] - px) + sway(W, s);
      } else if (W.nearestSlot(px, py, range + 100, 'any') < 0) return false;
      W.lastDir = dir;
      if (s.kind === 'burst') {
        s.queue = ((p.bolts as number) ?? 3) - 1; s.queueT = (p.gap as number) ?? 0.08; s.qDir = dir; s.qX = xm;
        bolt(W, s, dir, range, d, cp, cm);
      } else if (s.kind === 'hook') {
        const hooks = perTier(p.hooks, t, 1);
        hookShot(W, s, dir, range, d, cp, cm);
        for (let k = 1; k < hooks; k++) {
          const o = W.nearestSlot(px, py, range, 'any', target >= 0 ? E.handle(target) : -1);
          const a = o >= 0 ? Math.atan2(E.y[o] - py, E.x[o] - px) + k * 0.15 : dir + k * 0.4;
          hookShot(W, s, a, range, d, cp, cm);
        }
      } else {
        projectile(W, s, dir, range, d, cp, cm, st);
      }
      W.sfx('hitShot');
      return true;
    }
    case 'launch': return launch(W, s, dir, range, d, cp, cm, st);
    case 'homing': {
      if (auto) {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
        dir = Math.atan2(E.y[target] - py, E.x[target] - px);
      }
      W.lastDir = dir;
      if (s.id === 'peach') {
        const n = 1 + Math.max(0, Math.floor(st.swords));
        for (let k = 0; k < n; k++) {
          if (W.swordsAir >= SWORDS_ON_SCREEN - W.blades - W.canjian) break;
          const a = dir + (k - (n - 1) / 2) * 0.25;
          const i = shot(W, s, PK.flySword, a, s.def.speed ?? 600, range / (s.def.speed ?? 600) + 0.6, k === 0 ? d : d * F.swordExtra, cp, cm, 8);
          if (i < 0) break;
          W.PS.mode[i] = SMode.Homing; W.PS.homing[i] = 5; W.PS.flags[i] |= SF.sword | SF.ghostX | (t === 4 ? SF.peach : 0);
          W.PS.target[i] = target >= 0 ? E.handle(target) : -1;
          W.swordsAir++;
        }
      } else {
        // 玉笛: homing notes; every 6th (IV: 4th) charms a non-elite
        const every = Math.max(2, Math.round(perTier(s.def.p.charmEvery, t, 6) / charmX(W)));
        const i = shot(W, s, PK.noteGlyph, dir, s.def.speed ?? 450, range / (s.def.speed ?? 450) + 0.5, d, cp, cm, 7);
        if (i >= 0) {
          W.PS.mode[i] = SMode.Homing; W.PS.homing[i] = 6; W.PS.flags[i] |= SF.note;
          W.PS.target[i] = target >= 0 ? E.handle(target) : -1;
          if ((s.n + 1) % every === 0) { W.PS.flags[i] |= SF.charm; W.PS.aux[i] = perTier(s.def.p.charmDur, t, 2); }
        }
      }
      return true;
    }
    case 'rain': {
      const at = W.densest(px, py, range, 60);
      if (!at) return false;
      const n = perTier(p.n, t, 3) + Math.max(0, Math.floor(st.swords));
      const ax = at.x, ay = at.y;
      const a0 = W.erng() * TAU;
      for (let k = 0; k < n; k++) {
        if (W.swordsAir >= SWORDS_ON_SCREEN - W.blades - W.canjian) break;
        // a Big Dipper: a bowl of four, then the handle bending away
        const u = k < 4 ? DIPPER[k] : DIPPER[4 + ((k - 4) % 3)];
        const c = Math.cos(a0), sn = Math.sin(a0);
        const tx = ax + (u[0] * c - u[1] * sn) * 38, ty = ay + (u[0] * sn + u[1] * c) * 38;
        const i = W.PS.spawnSlot();
        if (i < 0) break;
        const PS = W.PS;
        PS.x[i] = tx; PS.y[i] = ty - 260; PS.tx[i] = tx; PS.ty[i] = ty; PS.vx[i] = 0; PS.vy[i] = 260 / (0.3 + k * 0.05);
        PS.life[i] = PS.life0[i] = 0.3 + k * 0.05; PS.kind[i] = PK.flySword; PS.mode[i] = SMode.Rain; PS.slot[i] = s.i;
        PS.dmg[i] = k === 0 ? d : d * (st.swords > 0 && k >= perTier(p.n, t, 3) ? F.swordExtra : 1);
        PS.critP[i] = cp; PS.critM[i] = cm; PS.knock[i] = knock; PS.r[i] = ((p.r as number) ?? 40) * areaOf(W, s, st) ** 0.5; PS.src[i] = SRCI.weapon;
        PS.flags[i] = SF.sword | (t === 4 && k === n - 1 ? SF.stun : 0);
        W.swordsAir++;
      }
      W.lastDir = Math.atan2(ay - py, ax - px);
      return true;
    }
    case 'chain': {
      target = randomIn(W, px, py, range);
      if (target < 0) return false;
      const jumps = perTier(p.jumps, t, 2) + W.mods.chainAdd + (W.mods.flags.has('chainPlus') ? 1 : 0);
      chain(W, s, target, jumps, d, cp, cm, (p.fall as number) ?? 0.85);
      W.lastDir = NO_DIR;
      W.sfx('hitTalisman');
      return true;
    }
    case 'lob': {
      let tx: number, ty: number;
      if (auto) {
        const at = W.densest(px, py, range, 70);
        if (!at) return false;
        tx = at.x; ty = at.y;
      } else { tx = px + Math.cos(dir) * range * 0.8; ty = py + Math.sin(dir) * range * 0.8; }
      W.lastDir = Math.atan2(ty - py, tx - px);
      const i = W.PS.spawnSlot();
      if (i < 0) return true;
      const PS = W.PS;
      const life = 0.55;
      PS.x[i] = px; PS.y[i] = py; PS.px[i] = px; PS.py[i] = py; PS.tx[i] = tx; PS.ty[i] = ty; PS.vx[i] = (tx - px) / life; PS.vy[i] = (ty - py) / life;
      PS.life[i] = PS.life0[i] = life; PS.kind[i] = s.id === 'gourd' ? PK.gourdLob : PK.fireLob; PS.mode[i] = SMode.Lob; PS.slot[i] = s.i;
      PS.dmg[i] = d; PS.critP[i] = cp; PS.critM[i] = cm; PS.knock[i] = knock; PS.r[i] = ((p.r as number) ?? 80) * areaOf(W, s, st) ** 0.5;
      PS.src[i] = SRCI.weapon; PS.flags[i] = s.id === 'fire' ? SF.fire | SF.burnHit : SF.gourd;
      return true;
    }
    case 'pulse': {
      const r = range * areaOf(W, s, st);
      if (W.nearestSlot(px, py, r, 'any') < 0) return false;
      const every = perTier(p.every, t, 4);
      const res = (s.n + 1) % every === 0;
      const buf = W.q0;
      const n = W.hash.gather(px, py, r + 64, buf);
      for (let k = 0; k < n; k++) {
        const i = buf[k];
        if (!W.targetable(i)) continue;
        const dx = E.x[i] - px, dy = E.y[i] - py, rr = r + E.r[i];
        if (dx * dx + dy * dy > rr * rr) continue;
        const big = E.kind[i] === EKind.Elite || E.kind[i] === EKind.Boss ? ((p.bigX as number) ?? 1.5) : 1;
        W.strike(i, d * big * (res ? ((p.resX as number) ?? 2) : 1), cp, cm, knock, px, py, s.i, SRCI.weapon, 0, s.proc);
        if (res && E.alive[i]) W.statusSlot(i, 'slow', (p.slowDur as number) ?? 1.5, (p.slow as number) ?? 30);
      }
      W.fx('pulseRing', px, py, { r, life: 0.35 });
      if (res) { if (t === 4) W.heal((p.healT4 as number) ?? 1); W.title({ zh: '共鸣', en: 'Resonance' }, 'edge'); }
      W.sfx('hitTalisman');
      return true;
    }
    case 'beam': {
      if (auto) {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
        dir = Math.atan2(E.y[target] - py, E.x[target] - px) + sway(W, s);
      } else if (W.nearestSlot(px, py, range + 100, 'any') < 0) return false;
      W.lastDir = dir;
      const fork = perTier(p.fork, t, 1);
      const beams = fork > 1 ? [0, -((p.forkDeg as number) ?? 15) * DEG, ((p.forkDeg as number) ?? 15) * DEG] : [0];
      for (const off of beams) beam(W, s, dir + off, range, d, cp, cm);
      // after a dodge: one extra beam for 2 s
      if (W.dodgeWin > 0) beam(W, s, dir + 0.12, range, d, cp, cm);
      W.sfx('hitShot');
      return true;
    }
    case 'boomerang': {
      if (auto) {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
        dir = Math.atan2(E.y[target] - py, E.x[target] - px) + sway(W, s);
      } else if (W.nearestSlot(px, py, range + 100, 'any') < 0) return false;
      W.lastDir = dir;
      const discs = perTier(p.discs, t, 1);
      for (let k = 0; k < discs; k++) {
        const a = dir + k * Math.PI;
        const v = s.def.speed ?? 700;
        const i = shot(W, s, PK.moonDisc, a, v, (range / v) * 2 + 0.4, d, cp, cm, 12);
        if (i < 0) break;
        W.PS.mode[i] = SMode.BoomOut; W.PS.pierce[i] = 999; W.PS.flags[i] |= SF.pierceAll; W.PS.tx[i] = range; W.PS.aux[i] = 0;
      }
      return true;
    }
    case 'paint': {
      const kinds = ['moque', 'moli', 'mohe', 'mohu'] as const;
      const kind = kinds[t - 1];
      const life = ((p.life as number) ?? 10) * (1 + W.mods.summonLife / 100);
      const a = W.erng() * TAU;
      spawnSummon(W, kind, s, px + Math.cos(a) * 40, py + Math.sin(a) * 40, life, true);
      W.sfx('summon');
      return true;
    }
    case 'turret': {
      const life = ((p.life as number) ?? 8) * (1 + W.mods.summonLife / 100);
      spawnSummon(W, 'yantai', s, px, py, life, true);
      W.sfx('summon');
      return true;
    }
    case 'familiar': {
      // 纸鹤 dives at the nearest within range and comes back
      const f = s.familiar;
      if (f < 0 || !W.S.alive[f]) { s.familiar = spawnSummon(W, 'zhihe', s, px + 60, py, 1e9, false); return true; }
      target = W.nearestSlot(W.S.x[f], W.S.y[f], range, 'any');
      if (target < 0) return false;
      W.S.st[f] = 1; W.S.target[f] = E.handle(target); W.S.stT[f] = 0.8;
      W.S.dmg[f] = d;
      return true;
    }
    case 'mine': {
      const at = W.densest(px, py, range, 70);
      let tx: number, ty: number;
      if (at) { tx = at.x + (W.erng() - 0.5) * 30; ty = at.y + (W.erng() - 0.5) * 30; }
      else {
        target = W.nearestSlot(px, py, range, 'any');
        if (target < 0) return false;
        tx = E.x[target]; ty = E.y[target];
      }
      placeStone(W, s, tx, ty);
      return true;
    }
    case 'orbit':
      // blades are always out (tickSwords); the flare is the IV effect
      if (t === 4 && s.flareT <= 0 && s.n % Math.max(1, Math.round(((p.flareEvery as number) ?? 4) / Math.max(0.1, s.def.cd))) === 0) s.flareT = (p.flareDur as number) ?? 1;
      return true;
  }
  return false;
}

const DIPPER: readonly (readonly [number, number])[] = [[0, 0], [1, 0.2], [1.1, 1.1], [0.1, 1], [-0.9, -0.3], [-1.9, -0.5], [-2.8, -0.2]];
function charmX(W: World): number {
  return (W.mods.charm ? W.mods.charm.x : 1) * (W.mods.flags.has('charmX2') ? 2 : 1);
}

function fireQueued(W: World, s: WeaponSlot): void {
  const st = s.stats;
  const d = dmgOf(W, s, st) * s.qX;
  const cp = critPOf(s, st), cm = critMOf(s, st);
  s.queue--;
  if (s.kind === 'burst') {
    const t = W.nearestSlot(W.px, W.py, rangeOf(W, s, st), 'any');
    const dir = t >= 0 ? Math.atan2(W.E.y[t] - W.py, W.E.x[t] - W.px) : s.qDir;
    bolt(W, s, dir, rangeOf(W, s, st), d, cp, cm);
    s.queueT = (s.def.p.gap as number) ?? 0.08;
  } else {
    const t = W.nearestSlot(W.px, W.py, rangeOf(W, s, st), 'any');
    const dir = t >= 0 ? Math.atan2(W.E.y[t] - W.py, W.E.x[t] - W.px) : s.qDir;
    swipe(W, s, dir, rangeOf(W, s, st) * areaOf(W, s, st) ** 0.5, (s.def.p.deg as number) ?? 60, d, cp, cm, s.def.knock);
    s.queueT = 0.09;
  }
}

// ─────────────────────────────────────────────────────────────── melee

/** A cone swing; returns the bodies hit. 龙泉 stacks 攻速; 猫爪 bleeds every 3rd swipe. */
function swipe(W: World, s: WeaponSlot, dir: number, r: number, deg: number, d: number, cp: number, cm: number, knock: number): number {
  const E = W.E, buf = W.q0;
  const px = W.px, py = W.py;
  const half = (deg / 2) * DEG;
  const n = W.hash.gather(px, py, r + 64, buf);
  let hits = 0;
  s.hit++;
  const bleed = s.id === 'claw' && s.hit % ((s.def.p.bleedEvery as number) ?? 3) === 0;
  for (let k = 0; k < n; k++) {
    const i = buf[k];
    if (!W.targetable(i)) continue;
    const dx = E.x[i] - px, dy = E.y[i] - py, d2 = dx * dx + dy * dy, rr = r + E.r[i];
    if (d2 > rr * rr) continue;
    if (deg < 360 && d2 > E.r[i] * E.r[i]) {
      const off = Math.abs(angDiff(Math.atan2(dy, dx), dir));
      if (off > half + Math.asin(Math.min(1, E.r[i] / Math.sqrt(d2)))) continue;
    }
    if (W.strike(i, d, cp, cm, knock, px, py, s.i, SRCI.weapon, HF.melee, s.proc) > 0) {
      hits++;
      if (bleed && E.alive[i]) W.statusSlot(i, 'bleed', 3, 0, perTier(s.def.p.bleedStacks, s.t, 5));
    }
  }
  if (hits && s.id === 'longquan') {
    s.stack = Math.min((s.def.p.stackMax as number) ?? 10, s.stack + ((s.def.p.stack as number) ?? 2) * hits);
    s.stackT = (s.def.p.stackDur as number) ?? 3;
  }
  W.fx('slashArc', px + Math.cos(dir) * r * 0.5, py + Math.sin(dir) * r * 0.5, { r: r * 0.6, dir, life: 0.16 });
  if (hits) W.sfx('hitMelee');
  return hits;
}

/** A thrust: the `n` nearest bodies along a line. */
function thrustHit(W: World, s: WeaponSlot, x: number, y: number, dir: number, len: number, w: number, n: number, d: number, cp: number, cm: number, knock: number): void {
  const E = W.E, buf = W.q0;
  const ex = x + Math.cos(dir) * len, ey = y + Math.sin(dir) * len;
  const m = W.hash.gather((x + ex) / 2, (y + ey) / 2, len / 2 + w + 64, buf);
  // pick the n closest along the line (selection by projection)
  let picked = 0;
  let last = -Infinity;
  while (picked < n) {
    let best = -1, bp = Infinity;
    for (let k = 0; k < m; k++) {
      const i = buf[k];
      if (!W.targetable(i)) continue;
      const rr = w / 2 + E.r[i];
      if (segDist2(E.x[i], E.y[i], x, y, ex, ey) > rr * rr) continue;
      const proj = (E.x[i] - x) * Math.cos(dir) + (E.y[i] - y) * Math.sin(dir);
      if (proj > last && proj < bp) { bp = proj; best = i; }
    }
    if (best < 0) break;
    last = bp;
    W.strike(best, d, cp, cm, knock, x, y, s.i, SRCI.weapon, HF.melee, s.proc);
    picked++;
  }
  if (picked) W.sfx('hitMelee');
}

/** 偃月 IV: a crescent of blade qi that travels 400, piercing everything. */
function crescent(W: World, s: WeaponSlot, dir: number, d: number, cp: number, cm: number): void {
  const i = shot(W, s, PK.crescentWave, dir, 700, ((s.def.p.waveLen as number) ?? 400) / 700, d, cp, cm, 30);
  if (i >= 0) { W.PS.pierce[i] = 999; W.PS.flags[i] |= SF.pierceAll | SF.crescent | SF.noDeflect; }
}

// ─────────────────────────────────────────────────────────────── shots

function shot(W: World, s: WeaponSlot | null, kind: number, dir: number, v: number, life: number, d: number, cp: number, cm: number, r: number): number {
  const PS = W.PS;
  const i = PS.spawnSlot();
  if (i < 0) return -1;
  PS.x[i] = W.px; PS.y[i] = W.py; PS.px[i] = W.px; PS.py[i] = W.py;
  PS.vx[i] = Math.cos(dir) * v; PS.vy[i] = Math.sin(dir) * v; PS.speed[i] = v;
  PS.life[i] = PS.life0[i] = life; PS.kind[i] = kind; PS.slot[i] = s ? s.i : -1;
  PS.dmg[i] = d; PS.critP[i] = cp; PS.critM[i] = cm; PS.knock[i] = s ? s.def.knock : 0; PS.r[i] = r;
  PS.proc[i] = s ? s.proc : 1; PS.src[i] = s ? SRCI.weapon : SRCI.item; PS.flags[i] = SF.projectile;
  return i;
}

function projectile(W: World, s: WeaponSlot, dir: number, range: number, d: number, cp: number, cm: number, st: Stats): void {
  const v = s.def.speed ?? 700;
  const kind = s.id === 'dart' ? PK.dartStar : s.id === 'coindart' ? PK.coinBlade : PK.sunArrow;
  const i = shot(W, s, kind, dir, v, range / v, d, cp, cm, s.id === 'sunbow' ? 8 : 7);
  if (i < 0) return;
  const PS = W.PS;
  PS.pierce[i] = perTier(s.def.p.pierce, s.t, 0) + Math.floor(st.pierce);
  PS.bounce[i] = perTier(s.def.p.bounce, s.t, 0) + (s.cls.includes('hidden') && W.mods.flags.has('hiddenBounce') ? 1 : 0);
  if (s.id === 'sunbow' && s.t === 4) PS.flags[i] |= SF.followUp;
}
function bolt(W: World, s: WeaponSlot, dir: number, range: number, d: number, cp: number, cm: number): void {
  const v = s.def.speed ?? 800;
  const i = shot(W, s, PK.crossBolt, dir + (W.erng() - 0.5) * 0.08, v, range / v, d, cp, cm, 6);
  if (i < 0) return;
  W.PS.flags[i] |= SF.shred | (s.t === 4 ? SF.split : 0);
  W.PS.pierce[i] = Math.floor(s.stats.pierce);
}
function hookShot(W: World, s: WeaponSlot, dir: number, range: number, d: number, cp: number, cm: number): void {
  const v = s.def.speed ?? 600;
  const i = shot(W, s, PK.hookLine, dir, v, range / v, d, cp, cm, 9);
  if (i < 0) return;
  W.PS.mode[i] = SMode.Hook;
}

/** 青萍: the lead sword flies out and back (return 50%, IV 75%); extra swords 40%, out only. */
function launch(W: World, s: WeaponSlot, dir: number, range: number, d: number, cp: number, cm: number, st: Stats): boolean {
  const E = W.E;
  let target = -1;
  if (dir === NO_DIR) {
    target = W.strongestSlot(W.px, W.py, range, 'any');
    if (target < 0) return false;
    dir = Math.atan2(E.y[target] - W.py, E.x[target] - W.px) + sway(W, s);
  } else if (W.nearestSlot(W.px, W.py, range + 100, 'any') < 0) return false;
  W.lastDir = dir;
  const n = 1 + Math.max(0, Math.floor(st.swords));
  const v = s.def.speed ?? 800;
  const pierce = ((s.def.p.pierce as number) ?? 1) + Math.floor(st.pierce) + (W.mods.swordTrail?.pierce ?? 0);
  for (let k = 0; k < n; k++) {
    if (W.swordsAir >= SWORDS_ON_SCREEN - W.blades - W.canjian) break;
    const a = dir + (k === 0 ? 0 : ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 0.14);
    const i = shot(W, s, PK.flySword, a, v, range / v, k === 0 ? d : d * F.swordExtra, cp, cm, 8);
    if (i < 0) break;
    const PS = W.PS;
    PS.mode[i] = k === 0 ? SMode.SwordLead : SMode.SwordOut;
    PS.pierce[i] = pierce;
    PS.aux[i] = perTier(s.def.p.ret, s.t, 0.5);
    PS.flags[i] |= SF.sword | (W.mods.swordTrail ? SF.trail : 0) | (s.t === 4 ? SF.splitSword : 0);
    W.swordsAir++;
  }
  W.sfx('hitShot');
  return true;
}

function beam(W: World, s: WeaponSlot, dir: number, len: number, d: number, cp: number, cm: number): void {
  const E = W.E, buf = W.q0, x = W.px, y = W.py;
  const ex = x + Math.cos(dir) * len, ey = y + Math.sin(dir) * len;
  const n = W.hash.gather((x + ex) / 2, (y + ey) / 2, len / 2 + 64, buf);
  for (let k = 0; k < n; k++) {
    const i = buf[k];
    if (!W.targetable(i)) continue;
    const rr = 10 + E.r[i];
    if (segDist2(E.x[i], E.y[i], x, y, ex, ey) > rr * rr) continue;
    W.strike(i, d, cp, cm, 0, x, y, s.i, SRCI.weapon, HF.beam, s.proc);
  }
  W.fxLine('beamRay', x, y, dir, len, 0.18, 1);
}

/** Random target within range (chains). */
function randomIn(W: World, x: number, y: number, r: number): number {
  const E = W.E, buf = W.q1;
  const n = W.hash.gather(x, y, r + 64, buf);
  let pick = -1, seen = 0;
  for (let k = 0; k < n; k++) {
    const i = buf[k];
    if (!W.targetable(i)) continue;
    const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i];
    if (dx * dx + dy * dy > rr * rr) continue;
    seen++;
    if (W.erng() * seen < 1) pick = i;
  }
  return pick;
}

const chainHit = new Int32Array(16);
/** 雷符: instant, −15% per jump; IV stuns 15%; 五雷正法 +1 chain, 10% stun, kills ignite. */
function chain(W: World, s: WeaponSlot, first: number, jumps: number, d: number, cp: number, cm: number, fall: number): void {
  const E = W.E;
  let cur = first, lx = W.px, ly = W.py, dmg = d, nh = 0;
  const stun4 = s.t === 4 ? ((s.def.p.stunT4 as number) ?? 0.15) : 0;
  for (let j = 0; j <= jumps && cur >= 0; j++) {
    const x = E.x[cur], y = E.y[cur];
    W.fxLine('boltChain', lx, ly, Math.atan2(y - ly, x - lx), Math.hypot(x - lx, y - ly), 0.16, 1);
    chainHit[nh++ % 16] = cur;
    W.strike(cur, dmg, cp, cm, 0, lx, ly, s.i, SRCI.weapon, 0, s.proc);
    if (E.alive[cur]) {
      if (stun4 && W.erng() < stun4 * s.proc) W.statusSlot(cur, 'stun', (s.def.p.stunDur as number) ?? 0.5);
      if (W.mods.chainStun && W.erng() < W.mods.chainStun * s.proc) W.statusSlot(cur, 'stun', W.mods.chainStunDur);
    } else if (W.mods.chainIgnite) igniteNear(W, x, y, 3 + 0.5 * W.stats.elem);
    lx = x; ly = y;
    dmg *= fall;
    // next: nearest un-hit within 180
    let best = -1, bd = 180 * 180;
    const buf = W.q1;
    const n = W.hash.gather(x, y, 244, buf);
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!W.targetable(i)) continue;
      let seen = false;
      for (let q = 0; q < Math.min(nh, 16); q++) if (chainHit[q] === i) { seen = true; break; }
      if (seen) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    cur = best;
  }
}
function igniteNear(W: World, x: number, y: number, dps: number): void {
  const t = W.nearestSlot(x, y, 120, 'any');
  if (t >= 0) W.statusSlot(t, 'burn', 3, dps);
}

// ─────────────────────────────────────────────────────────────── player shots

export function tickPlayerShots(W: World, dt: number): void {
  const PS = W.PS, E = W.E;
  const obs = W.arena.obstacles;
  let air = 0;
  for (let i = 0; i < PS.n; i++) {
    if (!PS.alive[i]) continue;
    const mode = PS.mode[i];
    const flags = PS.flags[i];
    if (flags & SF.sword) air++;
    PS.life[i] -= dt;
    PS.px[i] = PS.x[i]; PS.py[i] = PS.y[i];
    if (mode === SMode.Lob || mode === SMode.Rain) {
      if (PS.life[i] <= 0) { landLob(W, i); PS.release(i); continue; }
      if (mode === SMode.Lob) { PS.x[i] = PS.tx[i] - PS.vx[i] * PS.life[i]; PS.y[i] = PS.ty[i] - PS.vy[i] * PS.life[i]; }
      else PS.y[i] += PS.vy[i] * dt;
      continue;
    }
    // boomerang / sword return
    if (mode === SMode.BoomOut && PS.life[i] < PS.life0[i] / 2) { PS.mode[i] = SMode.BoomBack; PS.forgetHits(i); }
    if (mode === SMode.SwordLead && PS.life[i] <= 0) {
      PS.mode[i] = SMode.SwordBack; PS.life[i] = 3; PS.forgetHits(i); PS.dmg[i] *= PS.aux[i]; continue;
    }
    if (mode === SMode.BoomBack || mode === SMode.SwordBack || mode === SMode.HookBack) {
      const dx = W.px - PS.x[i], dy = W.py - PS.y[i], dd = Math.hypot(dx, dy) || 1;
      const v = Math.max(PS.speed[i], 500);
      PS.vx[i] = (dx / dd) * v; PS.vy[i] = (dy / dd) * v;
      if (dd < 20) {
        if (mode === SMode.SwordBack && W.mods.returnHeal) W.capHeal(3, W.mods.returnHeal.v, W.mods.returnHeal.cap);
        PS.release(i); continue;
      }
    } else if (PS.life[i] <= 0) { PS.release(i); continue; }
    if (mode === SMode.Homing && PS.homing[i] > 0) homeShot(W, i, dt);
    PS.x[i] += PS.vx[i] * dt;
    PS.y[i] += PS.vy[i] * dt;
    // trails (剑气纵横): a slash along the path every 0.12 s at 30%
    if ((flags & SF.trail) && W.mods.swordTrail) {
      PS.trailT[i] -= dt;
      if (PS.trailT[i] <= 0) {
        PS.trailT[i] = 0.18;
        // an invisible damage strip (the streak is an effect); keep room in the zone pool for content
        if (W.Z.count < 64) W.coreZone(1, '' as never, PS.x[i], PS.y[i], 18, 0.36, ZC.trail, PS.dmg[i] * W.mods.swordTrail.pct / 100);
        W.fxLine('swordStreak', PS.x[i], PS.y[i], Math.atan2(PS.vy[i], PS.vx[i]), 40, 0.3, 1);
      }
    }
    // obstacles: bamboo stops shots (not swords, beams, lobs); the tree stops everything
    let dead = false;
    for (let o = 0; o < obs.length; o++) {
      const ob = obs[o];
      if (ob.blocks === 'enemyShots') continue;
      if (ob.blocks === 'shots' && (flags & SF.sword)) continue;
      const dx = PS.x[i] - ob.x, dy = PS.y[i] - ob.y;
      if (dx * dx + dy * dy < ob.r * ob.r) { dead = true; break; }
    }
    if (dead) { W.fx('hitSpark', PS.x[i], PS.y[i], { r: 8, life: 0.15 }); if (flags & SF.sword) { PS.release(i); } else PS.release(i); continue; }
    // hits
    const buf = W.q0;
    const n = W.hash.gather(PS.x[i], PS.y[i], PS.r[i] + 48, buf);
    for (let k = 0; k < n && PS.alive[i]; k++) {
      const e = buf[k];
      if (!W.targetable(e)) continue;
      const dx = E.x[e] - PS.x[i], dy = E.y[e] - PS.y[i], rr = E.r[e] + PS.r[i];
      if (dx * dx + dy * dy > rr * rr) continue;
      const h = E.handle(e);
      if (PS.hitBefore(i, h)) continue;
      shotHit(W, i, e, h);
    }
  }
  W.swordsAir = air;
  W.live.swordsAir = air;
  W.maxStat('peakSwordsAir', air + W.blades + W.canjian);
}

function homeShot(W: World, i: number, dt: number): void {
  const PS = W.PS, E = W.E;
  let t = E.slotOf(PS.target[i]);
  if (t < 0 || !W.targetable(t)) {
    t = W.nearestSlot(PS.x[i], PS.y[i], 400, 'any');
    PS.target[i] = t >= 0 ? E.handle(t) : -1;
  }
  if (t < 0) return;
  const a = Math.atan2(E.y[t] - PS.y[i], E.x[t] - PS.x[i]);
  const cur = Math.atan2(PS.vy[i], PS.vx[i]);
  const na = cur + clamp(angDiff(a, cur), -PS.homing[i] * dt, PS.homing[i] * dt);
  PS.vx[i] = Math.cos(na) * PS.speed[i]; PS.vy[i] = Math.sin(na) * PS.speed[i];
}

/** A player shot meets body e. */
function shotHit(W: World, i: number, e: number, h: number): void {
  const PS = W.PS, E = W.E;
  const flags = PS.flags[i];
  const tg = E.tags[e];
  // 纸伞妖's front deflects projectiles and flying swords (summons' shots get through, GDD §13);
  // 霓裳 spinning sends projectiles back at 50%
  if ((tg & TAG_BIT.deflect) && !(flags & SF.noDeflect) && PS.src[i] !== SRCI.summon) {
    const toShot = Math.atan2(PS.y[i] - E.y[e], PS.x[i] - E.x[e]);
    if (Math.abs(angDiff(toShot, E.face[e])) < 45 * DEG) {
      W.fx('hitSpark', PS.x[i], PS.y[i], { r: 10, life: 0.15 });
      PS.release(i);
      return;
    }
  }
  if ((tg & TAG_BIT.reflect) && E.b[e] === 1 && !(flags & SF.noDeflect)) {
    const a = Math.atan2(W.py - PS.y[i], W.px - PS.x[i]);
    W.enemyShot('eOrb', PS.x[i], PS.y[i], Math.cos(a) * 240, Math.sin(a) * 240, 8, 3, E.dmg[e] * 0.5, false, 0, 0, 0, 0, e);
    PS.release(i);
    return;
  }
  PS.remember(i, h);
  let d = PS.dmg[i];
  if ((flags & SF.ghostX) && (tg & TAG_BIT.ghost)) d *= (WEAPONS.peach.p.ghost as number) ?? 1.5;
  const slot = PS.slot[i];
  const hf = HF.projectile | ((flags & SF.fire) ? HF.fire : 0) | ((flags & SF.sword) ? HF.sword : 0);
  const dealt = W.strike(e, d, PS.critP[i], PS.critM[i], PS.knock[i], PS.x[i], PS.y[i], slot, PS.src[i], hf, PS.proc[i]);
  const crit = W.lastCrit;
  if (dealt > 0) {
    if (flags & SF.shred) W.statusSlot(e, 'shred', 3, 1);
    if ((flags & SF.charm) && E.alive[e]) W.statusSlot(e, 'charm', PS.aux[i]);
    if (PS.status[i] && E.alive[e]) W.statusSlot(e, STATUS_OF[PS.status[i] - 1], PS.statusDur[i], PS.statusV[i]);
    if ((flags & SF.peach)) {
      // 桃木剑 IV: a talisman sticks in the ground and bursts after 1 s (player-side: no red telegraph)
      const delay = (WEAPONS.peach.p.charmDelay as number) ?? 1;
      W.fx('proj:peachCharm' as never, E.x[e], E.y[e], { r: 32, life: delay });
      W.after(delay, peachBurst(W, E.x[e], E.y[e], PS.dmg[i] * ((WEAPONS.peach.p.charmPct as number) ?? 0.5), slot));
    }
    if ((flags & SF.splitSword) && crit) {
      PS.flags[i] &= ~SF.splitSword;
      const a = Math.atan2(PS.vy[i], PS.vx[i]);
      for (const off of [-0.35, 0.35]) {
        const j = W.PS.spawnSlot();
        if (j < 0) break;
        const P2 = W.PS;
        P2.x[j] = PS.x[i]; P2.y[j] = PS.y[i]; P2.vx[j] = Math.cos(a + off) * PS.speed[i]; P2.vy[j] = Math.sin(a + off) * PS.speed[i]; P2.speed[j] = PS.speed[i];
        P2.life[j] = P2.life0[j] = 0.4; P2.kind[j] = PS.kind[i]; P2.slot[j] = slot; P2.dmg[j] = PS.dmg[i]; P2.critP[j] = PS.critP[i]; P2.critM[j] = PS.critM[i];
        P2.r[j] = PS.r[i]; P2.flags[j] = SF.sword | SF.projectile; P2.src[j] = PS.src[i]; P2.remember(j, h);
      }
    }
    if ((flags & SF.moonsoul) === 0 && (flags & SF.note) && E.alive[e]) { /* notes: nothing extra */ }
  }
  // the hook pulls its catch in
  if (PS.mode[i] === SMode.Hook) {
    if (E.alive[e]) W.pull(h, W.px, W.py, (WEAPONS.rod.p.pull as number) ?? 150);
    PS.mode[i] = SMode.HookBack;
    return;
  }
  // bounce to another body within 200
  if (PS.bounce[i] > 0) {
    PS.bounce[i]--;
    const n = W.nearestSlot(PS.x[i], PS.y[i], 200, 'any', h);
    if (n >= 0) {
      const a = Math.atan2(E.y[n] - PS.y[i], E.x[n] - PS.x[i]);
      PS.vx[i] = Math.cos(a) * PS.speed[i]; PS.vy[i] = Math.sin(a) * PS.speed[i];
      PS.life[i] = Math.max(PS.life[i], 0.5);
      return;
    }
  }
  if (flags & SF.pierceAll) return;
  if (PS.pierce[i] > 0) { PS.pierce[i]--; return; }
  if (PS.mode[i] === SMode.SwordLead) { PS.mode[i] = SMode.SwordBack; PS.life[i] = 3; PS.forgetHits(i); PS.dmg[i] *= PS.aux[i]; return; }
  PS.release(i);
}
const STATUS_OF = ['burn', 'bleed', 'slow', 'root', 'stun', 'charm', 'shred', 'vuln', 'stagger'] as const;

function peachBurst(W: World, x: number, y: number, d: number, slot: number) {
  return () => { W.fx('shockRing', x, y, { r: 80, life: 0.3 }); areaStrike(W, x, y, (WEAPONS.peach.p.charmR as number) ?? 80, d, slot, SRCI.weapon, HF.fire); };
}

/** A lob or a falling sword lands: the burst. */
function landLob(W: World, i: number): void {
  const PS = W.PS, E = W.E;
  const x = PS.tx[i], y = PS.ty[i], r = PS.r[i], slot = PS.slot[i], flags = PS.flags[i];
  const s = slot >= 0 && slot < W.slots.length ? W.slots[slot] : null;
  if (PS.mode[i] === SMode.Rain) {
    const n = areaStrike(W, x, y, r, PS.dmg[i], slot, SRCI.weapon, HF.sword, PS.knock[i], PS.critP[i], PS.critM[i]);
    if ((flags & SF.stun) && n) stunNear(W, x, y, r, (WEAPONS.seven.p.stunT4 as number) ?? 0.5);
    W.fx('swordStreak', x, y, { r: 20, life: 0.2, dir: Math.PI / 2 });
    return;
  }
  W.fx(flags & SF.gourd ? 'dustPuff' : 'shockRing', x, y, { r, life: 0.3 });
  const buf = W.q1;
  const n = W.hash.gather(x, y, r + 64, buf);
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const e = buf[k];
    if (!W.targetable(e)) continue;
    const dx = E.x[e] - x, dy = E.y[e] - y, rr = r + E.r[e];
    if (dx * dx + dy * dy > rr * rr) continue;
    W.strike(e, PS.dmg[i], PS.critP[i], PS.critM[i], PS.knock[i], x, y, slot, SRCI.weapon, HF.lob | (flags & SF.fire ? HF.fire : 0), s?.proc ?? 1);
    const crit = W.lastCrit;
    hits++;
    if (!E.alive[e] || !s) continue;
    if (s.id === 'fire') {
      const dps = ((s.def.p.burn as number) ?? 3) + ((s.def.p.burnScale as number) ?? 0.5) * W.stats.elem;
      W.statusSlot(e, 'burn', (s.def.p.burnDur as number) ?? 3, dps, perTier(s.def.p.burnStacks, s.t, 3));
    } else if (s.id === 'gourd') {
      W.statusSlot(e, 'stagger', (s.def.p.stagger as number) ?? 1);
      if (crit) W.statusSlot(e, 'burn', 3, (s.def.p.critBurn as number) ?? 3);
    }
  }
  if (s?.id === 'gourd') {
    if (hits) W.addDrunk(((s.def.p.drunk as number) ?? 2) * hits * s.proc);
    if (s.t === 4) W.coreZone(1, 'firePuddle', x, y, r * 0.8, (s.def.p.puddleT4 as number) ?? 3, ZC.fire, (s.def.p.puddleBurn as number) ?? 3);
  }
  W.sfx('hitTalisman');
}
function stunNear(W: World, x: number, y: number, r: number, dur: number): void {
  const E = W.E, buf = W.q1;
  const n = W.hash.gather(x, y, r + 64, buf);
  for (let k = 0; k < n; k++) {
    const e = buf[k];
    if (!W.targetable(e)) continue;
    if (Math.hypot(E.x[e] - x, E.y[e] - y) <= r + E.r[e]) W.statusSlot(e, 'stun', dur);
  }
}

/** Weapon-kill effects (called from World.killSlot through onWeaponKill). */
export function onWeaponKill(W: World, slot: number, x: number, y: number, crit: boolean, burning: boolean): void {
  if (slot < 0 || slot >= W.slots.length) return;
  const s = W.slots[slot];
  const luck = luckMult(W.stats.luck);
  const p = s.def.p;
  switch (s.id) {
    case 'hoe':
      if (W.erng() < perTier(p.gold, s.t, 0.1) * luck) W.drop('moonDrop', x, y, 1);
      if (s.t === 4) plantFlower(W, x, y);
      break;
    case 'coindart': if (s.t === 4 && W.erng() < ((p.goldT4 as number) ?? 0.25)) W.drop('moonDrop', x, y, 1); break;
    case 'rod': if (W.erng() < ((p.hookGold as number) ?? 0.25)) W.drop('moonDrop', x, y, 1); break;
    case 'sunbow':
      if (s.t === 4 && crit) {
        const t = W.nearestSlot(x, y, 400, 'any');
        if (t >= 0) {
          const a = Math.atan2(W.E.y[t] - y, W.E.x[t] - x);
          const i = shot(W, s, PK.sunArrow, a, s.def.speed ?? 900, 0.6, dmgOf(W, s, s.stats), critPOf(s, s.stats), critMOf(s, s.stats), 8);
          if (i >= 0) { W.PS.x[i] = x; W.PS.y[i] = y; W.PS.pierce[i] = 3; }
        }
      }
      break;
    case 'repeater':
      if (s.t === 4) for (const off of [-0.4, 0.4]) {
        const i = shot(W, s, PK.crossBolt, W.face + off, 700, 0.4, dmgOf(W, s, s.stats) * ((p.splitT4 as number) ?? 0.5), critPOf(s, s.stats), critMOf(s, s.stats), 6);
        if (i >= 0) { W.PS.x[i] = x; W.PS.y[i] = y; }
      }
      break;
    case 'fire':
      if (s.t === 4 && burning) for (let k = 0; k < ((p.spreadT4 as number) ?? 2); k++) igniteNear(W, x + (k - 0.5) * 30, y, ((p.burn as number) ?? 3) + ((p.burnScale as number) ?? 0.5) * W.stats.elem);
      break;
  }
}

// ─────────────────────────────────────────────────────────────── summons (墨宝, turrets, familiars)

/** Spawn a 墨宝 (capped: at the cap the oldest is replaced) or a familiar. */
function spawnSummon(W: World, kind: 'moque' | 'moli' | 'mohe' | 'mohu' | 'yantai' | 'zhihe', s: WeaponSlot | null, x: number, y: number, life: number, capped: boolean): number {
  const S = W.S;
  if (capped) {
    const cap = summonCapOf(W.stats);
    let alive = 0, oldest = -1, oo = Infinity;
    for (let k = 0; k < S.n; k++) if (S.alive[k] && S.capped[k]) { alive++; if (S.order[k] < oo) { oo = S.order[k]; oldest = k; } }
    if (alive >= cap && oldest >= 0) summonEnd(W, oldest, false);
    if (cap <= 0) return -1;
  }
  const i = S.take();
  if (i < 0) return -1;
  S.kind[i] = SK[kind]; S.x[i] = x; S.y[i] = y; S.vx[i] = S.vy[i] = 0; S.face[i] = 0;
  const hp = F.summon.hp + F.summon.hpSpirit * W.stats.spirit + F.summon.hpWave * W.wave;
  S.hp[i] = S.hpMax[i] = hp; S.life[i] = S.life0[i] = life;
  S.slot[i] = s ? s.i : -1; S.capped[i] = capped ? 1 : 0; S.target[i] = -1; S.st[i] = 0; S.stT[i] = 0; S.order[i] = ++W.summonOrder;
  S.dragon[i] = 0; S.tier[i] = s ? s.t : 1; S.flash[i] = 0; S.contactT[i] = 0;
  const ink6 = W.mods.flags.has('ink6') ? 1.2 : 1;
  S.r[i] = (kind === 'mohu' ? 16 : kind === 'yantai' ? 14 : 11) * ink6;
  if (s) {
    const st = sheet(W, s);
    S.dmg[i] = dmgOf(W, s, st) * ink6;
    S.critP[i] = critPOf(s, st); S.critM[i] = critMOf(s, st); S.knock[i] = s.def.knock;
    const atk = kind === 'yantai' ? (s.def.p.atk as number) ?? 0.8 : perTier(s.def.p.atk, s.t, 0.7);
    S.cd[i] = cooldown(atk, st.aspd + (W.mods.summonCrit?.aspd ?? 0), true);
  }
  S.atkT[i] = S.cd[i] * 0.5;
  if (capped) W.maxStat('peakSummons', countCapped(W));
  return i;
}
function spawnFamiliarItem(W: World, k: number): void {
  const fam = W.mods.familiar!;
  const S = W.S;
  const i = S.take();
  if (i < 0) return;
  S.kind[i] = SK[fam.summon]; S.x[i] = W.px - 50; S.y[i] = W.py + k * 20; S.vx[i] = S.vy[i] = 0;
  S.hp[i] = S.hpMax[i] = 1e9; S.life[i] = S.life0[i] = 1e9; S.slot[i] = -1; S.capped[i] = 0; S.target[i] = -1; S.st[i] = 2; S.stT[i] = k * 1.3;
  S.order[i] = ++W.summonOrder; S.dragon[i] = 0; S.tier[i] = 0; S.flash[i] = 0; S.r[i] = 11; S.contactT[i] = 0;
  S.dmg[i] = (fam.base + W.scaleSum(fam.scale)) * W.dmgMultNow();
  S.critP[i] = 0; S.critM[i] = 1; S.knock[i] = 10; S.cd[i] = cooldown(fam.cd, W.stats.aspd, true); S.atkT[i] = S.cd[i];
}
function countCapped(W: World): number {
  const S = W.S;
  let c = 0;
  for (let k = 0; k < S.n; k++) if (S.alive[k] && S.capped[k]) c++;
  return c;
}
function plantFlower(W: World, x: number, y: number): void {
  const S = W.S;
  let n = 0, oldest = -1, oo = Infinity;
  for (let k = 0; k < S.n; k++) if (S.alive[k] && S.kind[k] === SK.flowerSprout) { n++; if (S.order[k] < oo) { oo = S.order[k]; oldest = k; } }
  if (n >= ((WEAPONS.hoe.p.flowers as number) ?? 8) && oldest >= 0) S.release(oldest);
  const i = S.take();
  if (i < 0) return;
  S.kind[i] = SK.flowerSprout; S.x[i] = x; S.y[i] = y; S.life[i] = S.life0[i] = 1e9; S.capped[i] = 0; S.hp[i] = S.hpMax[i] = 1;
  S.order[i] = ++W.summonOrder; S.r[i] = 10; S.st[i] = 0; S.dragon[i] = 0; S.slot[i] = -1; S.flash[i] = 0;
}

/** A 墨宝 ends: 泼墨 bursts, the event goes out. */
function summonEnd(W: World, i: number, slain: boolean): void {
  const S = W.S;
  void slain;
  const x = S.x[i], y = S.y[i];
  const wasCapped = S.capped[i] === 1;
  S.release(i);
  if (!wasCapped) return;
  const b = W.mods.summonBurst;
  if (b) {
    const raw = (b.base + W.scaleSum(b.scale)) * W.dmgMultNow();
    const n = W.hash.gather(x, y, b.r + 64, W.q1);
    for (let k = 0; k < n; k++) {
      const e = W.q1[k];
      if (!W.targetable(e)) continue;
      if (Math.hypot(W.E.x[e] - x, W.E.y[e] - y) > b.r + W.E.r[e]) continue;
      W.strike(e, raw, 0, 1, 0, x, y, -1, SRCI.item, HF.noProc);
      if (W.E.alive[e]) W.statusSlot(e, 'slow', b.dur, b.slow);
    }
    W.fx('inkBurst', x, y, { r: b.r, life: 0.4 });
  }
  W.emit('summonDeath', -1, 0, false, 'summon', x, y, -1);
}

export function tickSummons(W: World, dt: number): void {
  const S = W.S, E = W.E;
  let capped = 0;
  // 墨龙图: the oldest 墨宝 is a 墨龙 (re-woken every 12 s)
  const dragon = W.mods.special.inkdragon;
  if (dragon) {
    W.dragonT -= dt;
    if (W.dragonT <= 0) {
      W.dragonT = dragon.every ?? 12;
      let oldest = -1, oo = Infinity;
      for (let k = 0; k < S.n; k++) { if (S.alive[k]) S.dragon[k] = 0; if (S.alive[k] && S.capped[k] && S.order[k] < oo) { oo = S.order[k]; oldest = k; } }
      if (oldest >= 0) S.dragon[oldest] = 1;
    }
  }
  for (let i = 0; i < S.n; i++) {
    if (!S.alive[i]) continue;
    W.cur = i; W.curWhat = 'summon';
    if (S.capped[i]) capped++;
    if (S.flash[i] > 0) S.flash[i] -= dt;
    if (S.contactT[i] > 0) S.contactT[i] -= dt;
    S.life[i] -= dt;
    if (S.life[i] <= 0 || S.hp[i] <= 0) { summonEnd(W, i, S.hp[i] <= 0); continue; }
    const kind = S.kind[i];
    if (kind === SK.flowerSprout) { flowerTick(W, i); continue; }
    S.atkT[i] -= dt;
    const x = S.x[i], y = S.y[i];
    if (kind === SK.zhihe) { craneTick(W, i, dt); continue; }
    if (kind === SK.mohe && !S.capped[i]) { itemCraneTick(W, i, dt); continue; }
    if (kind === SK.yantai || kind === SK.mozhu) {
      // turrets: 砚台 (IV follows at 60 u/s) and 墨竹 fire at the nearest in range
      const slot = S.slot[i];
      if (kind === SK.yantai && slot >= 0 && W.slots[slot]?.t === 4) {
        const dx = W.px - x, dy = W.py - y, d = Math.hypot(dx, dy);
        if (d > 40) { S.x[i] += (dx / d) * 60 * dt; S.y[i] += (dy / d) * 60 * dt; }
      }
      if (S.atkT[i] <= 0) {
        const range = kind === SK.mozhu ? (W.mods.sprout?.range ?? 360) : 400;
        const t = W.nearestSlot(x, y, range, 'any');
        if (t >= 0) {
          const blobs = kind === SK.yantai && slot >= 0 && W.slots[slot]?.t === 4 ? 2 : 1;
          for (let b = 0; b < blobs; b++) {
            const a = Math.atan2(E.y[t] - y, E.x[t] - x) + (b ? 0.15 : 0);
            const j = W.PS.spawnSlot();
            if (j < 0) break;
            const PS = W.PS;
            PS.x[j] = x; PS.y[j] = y; PS.vx[j] = Math.cos(a) * 480; PS.vy[j] = Math.sin(a) * 480; PS.speed[j] = 480; PS.life[j] = PS.life0[j] = range / 480;
            PS.kind[j] = kind === SK.mozhu ? PK.bambooLeaf : PK.inkBlob; PS.slot[j] = slot; PS.dmg[j] = S.dmg[i]; PS.critP[j] = S.critP[i]; PS.critM[j] = S.critM[i];
            PS.knock[j] = S.knock[i]; PS.r[j] = 7; PS.src[j] = SRCI.summon; PS.flags[j] = SF.projectile | (kind === SK.mozhu ? SF.leaf : SF.blob);
          }
          S.atkT[i] = S.cd[i];
        } else S.atkT[i] = 0.2;
      }
      continue;
    }
    // 墨雀 / 墨鲤 / 墨鹤 / 墨虎 (and content's generic summons): seek within 360 of you, leashed to 400
    let t = E.slotOf(S.target[i]);
    if (t < 0 || !W.targetable(t) || (S.atkT[i] <= 0 && (W.t * 10 | 0) % 4 === i % 4)) {
      t = W.nearestSlot(W.px, W.py, F.summon.seek, 'any');
      if (t < 0) t = W.nearestSlot(x, y, 200, 'any');
      S.target[i] = t >= 0 ? E.handle(t) : -1;
    }
    const lx = W.px - x, ly = W.py - y, ld = Math.hypot(lx, ly);
    let tx = W.px + Math.cos(i * 1.7) * 50, ty = W.py + Math.sin(i * 1.7) * 50;
    const reach = kind === SK.mohu ? 60 : kind === SK.moli ? 100 : kind === SK.mohe ? 50 : 22;
    if (t >= 0 && ld < F.summon.leash) { tx = E.x[t]; ty = E.y[t]; }
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
    const sp = S.dragon[i] ? 320 : 230;
    const stop = t >= 0 ? reach * 0.7 + E.r[t] : 8;
    if (d > stop) { S.vx[i] = (dx / d) * sp; S.vy[i] = (dy / d) * sp; } else { S.vx[i] *= 0.7; S.vy[i] *= 0.7; }
    S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt;
    if (Math.abs(S.vx[i]) > 5) S.face[i] = S.vx[i] < 0 ? Math.PI : 0;
    if (t >= 0 && S.atkT[i] <= 0 && d <= reach + E.r[t]) {
      S.atkT[i] = S.cd[i];
      summonAttack(W, i, t, kind);
    }
  }
  W.summonsAlive = capped;
  W.cur = -1; W.curWhat = 'none';
  // 墨竹: every 12 s a bamboo sprouts at your feet
  const sp = W.mods.sprout;
  if (sp) {
    W.sproutT -= dt;
    if (W.sproutT <= 0) {
      W.sproutT = sp.every;
      for (let k = 0; k < sp.n; k++) {
        const j = S.take();
        if (j < 0) break;
        S.kind[j] = SK.mozhu; S.x[j] = W.px + k * 24; S.y[j] = W.py; S.hp[j] = S.hpMax[j] = 1e9; S.life[j] = S.life0[j] = sp.life; S.capped[j] = 0;
        S.slot[j] = -1; S.order[j] = ++W.summonOrder; S.r[j] = 12; S.dragon[j] = 0; S.flash[j] = 0; S.st[j] = 0; S.target[j] = -1; S.contactT[j] = 0;
        S.dmg[j] = (sp.base + W.scaleSum(sp.scale)) * W.dmgMultNow(); S.critP[j] = 0; S.critM[j] = 1; S.knock[j] = 5;
        S.cd[j] = cooldown(sp.cd, W.stats.aspd, true); S.atkT[j] = 0.2;
      }
    }
  }
}

function summonAttack(W: World, i: number, t: number, kind: number): void {
  const S = W.S, E = W.E;
  const x = S.x[i], y = S.y[i];
  const dmgX = S.dragon[i] ? (W.mods.special.inkdragon?.x ?? 5) : 1;
  const d = S.dmg[i] * dmgX;
  const slot = S.slot[i];
  if (S.dragon[i]) {
    areaStrike(W, E.x[t], E.y[t], W.mods.special.inkdragon?.r ?? 60, d, slot, SRCI.summon, HF.noProc, S.knock[i], S.critP[i], S.critM[i]);
    W.fx('inkBurst', E.x[t], E.y[t], { r: 40, life: 0.25 });
    return;
  }
  switch (kind) {
    case SK.moque: W.strike(t, d, S.critP[i], S.critM[i], S.knock[i], x, y, slot, SRCI.summon, HF.noProc); break;
    case SK.moli: {
      // lunge in a 120 line
      const a = Math.atan2(E.y[t] - y, E.x[t] - x);
      const r = perTier(WEAPONS.brush.p.r, 2, 120);
      const buf = W.q1, ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
      const n = W.hash.gather((x + ex) / 2, (y + ey) / 2, r / 2 + 64, buf);
      for (let k = 0; k < n; k++) {
        const e = buf[k];
        if (!W.targetable(e)) continue;
        if (segDist2(E.x[e], E.y[e], x, y, ex, ey) > (14 + E.r[e]) ** 2) continue;
        W.strike(e, d, S.critP[i], S.critM[i], S.knock[i], x, y, slot, SRCI.summon, HF.noProc);
      }
      S.x[i] = ex; S.y[i] = ey;
      break;
    }
    case SK.mohe: areaStrike(W, E.x[t], E.y[t], perTier(WEAPONS.brush.p.r, 3, 60), d, slot, SRCI.summon, HF.noProc, S.knock[i], S.critP[i], S.critM[i]); break;
    case SK.mohu: {
      S.x[i] = E.x[t]; S.y[i] = E.y[t];
      areaStrike(W, E.x[t], E.y[t], perTier(WEAPONS.brush.p.r, 4, 90), d, slot, SRCI.summon, HF.noProc, S.knock[i], S.critP[i], S.critM[i]);
      W.fx('shockRing', E.x[t], E.y[t], { r: 90, life: 0.25 });
      break;
    }
    default: W.strike(t, d, S.critP[i], S.critM[i], S.knock[i], x, y, slot, SRCI.summon, HF.noProc);
  }
}

/** 纸鹤: circles you at r 120, dives at its target, comes back (IV bursts r 80). */
function craneTick(W: World, i: number, dt: number): void {
  const S = W.S, E = W.E;
  const orbitR = (WEAPONS.crane.p.orbit as number) ?? 120;
  if (S.st[i] === 1) {
    const t = E.slotOf(S.target[i]);
    S.stT[i] -= dt;
    if (t < 0 || S.stT[i] <= 0) { S.st[i] = 2; return; }
    const dx = E.x[t] - S.x[i], dy = E.y[t] - S.y[i], d = Math.hypot(dx, dy) || 1;
    S.x[i] += (dx / d) * 620 * dt; S.y[i] += (dy / d) * 620 * dt;
    S.face[i] = dx < 0 ? Math.PI : 0;
    if (d < E.r[t] + 10) {
      const slot = S.slot[i];
      const s = slot >= 0 ? W.slots[slot] : null;
      if (s && s.t === 4) areaStrike(W, E.x[t], E.y[t], (WEAPONS.crane.p.burstT4 as number) ?? 80, S.dmg[i], slot, SRCI.summon, HF.noProc, 20);
      else W.strike(t, S.dmg[i], s ? critPOf(s, s.stats) : 0, s ? critMOf(s, s.stats) : 1, 20, S.x[i], S.y[i], slot, SRCI.summon, HF.noProc);
      S.st[i] = 2;
    }
    return;
  }
  // circle (st 0) or return to the circle (st 2)
  const a = W.t * 1.6 + i;
  const tx = W.px + Math.cos(a) * orbitR, ty = W.py + Math.sin(a) * orbitR;
  const dx = tx - S.x[i], dy = ty - S.y[i], d = Math.hypot(dx, dy);
  const v = S.st[i] === 2 ? 520 : 300;
  if (d > 4) { S.x[i] += (dx / d) * Math.min(d, v * dt); S.y[i] += (dy / d) * Math.min(d, v * dt); }
  if (S.st[i] === 2 && d < 10) S.st[i] = 0;
  S.face[i] = dx < 0 ? Math.PI : 0;
}

/** 墨鹤 (item): circles you, pecks the nearest within 200 every 0.8 s; fetches 月华 (tickDrops). */
function itemCraneTick(W: World, i: number, dt: number): void {
  const S = W.S, E = W.E;
  S.stT[i] += dt;
  const a = S.stT[i] * 1.2 + i;
  const tx = W.px + Math.cos(a) * 90, ty = W.py + Math.sin(a) * 90;
  S.x[i] += (tx - S.x[i]) * Math.min(1, dt * 6); S.y[i] += (ty - S.y[i]) * Math.min(1, dt * 6);
  S.face[i] = Math.sin(a) > 0 ? Math.PI : 0;
  if (S.atkT[i] <= 0) {
    const t = W.nearestSlot(S.x[i], S.y[i], 200, 'any');
    if (t >= 0) { W.strike(t, S.dmg[i], 0, 1, S.knock[i], S.x[i], S.y[i], -1, SRCI.summon, HF.noProc); W.fx('hitSpark', E.x[t], E.y[t], { r: 8, life: 0.15 }); }
    S.atkT[i] = S.cd[i];
  }
}

/** 花锄 IV flowers: walking over heals 3; an enemy stepping on it takes 10 + 100% 造化. */
function flowerTick(W: World, i: number): void {
  const S = W.S, E = W.E;
  const x = S.x[i], y = S.y[i];
  if (Math.hypot(W.px - x, W.py - y) < W.pr + 10) { W.heal((WEAPONS.hoe.p.flowerHeal as number) ?? 3); W.fx('petalBurst', x, y, { r: 16, life: 0.4 }); S.release(i); return; }
  const t = W.nearestSlot(x, y, 12, 'any');
  if (t >= 0 && E.kind[t] !== EKind.Boss) {
    W.strike(t, (((WEAPONS.hoe.p.flowerBase as number) ?? 10) + W.stats.spirit) * W.dmgMultNow(), 0, 1, 0, x, y, -1, SRCI.item, HF.noProc);
    W.fx('petalBurst', x, y, { r: 16, life: 0.4 });
    S.release(i);
  }
}

// ─────────────────────────────────────────────────────────────── go stones

function placeStone(W: World, s: WeaponSlot, x: number, y: number): void {
  const ST = W.ST;
  const cap = stonesOf(W.stats);
  if (cap <= 0) return;
  if (ST.count >= cap) {
    let oldest = -1, oo = Infinity;
    for (let k = 0; k < ST.n; k++) if (ST.alive[k] && ST.order[k] < oo) { oo = ST.order[k]; oldest = k; }
    if (oldest >= 0) ST.release(oldest);
  }
  const i = ST.take();
  if (i < 0) return;
  const q = W.pt2; q.x = x; q.y = y; W.clampToArena(q, 12);
  ST.x[i] = q.x; ST.y[i] = q.y; ST.arm[i] = F.stone.arm; ST.slot[i] = s.i; ST.order[i] = ++W.stoneOrder; ST.fuse[i] = 0;
  ST.white[i] = W.stoneOrder & 1;
  ST.life[i] = W.run.char === 'player' ? 1e9 : 14;
}

export function tickStones(W: World, dt: number): void {
  const ST = W.ST, E = W.E;
  if (!ST.count) return;
  for (let i = 0; i < ST.n; i++) {
    if (!ST.alive[i]) continue;
    ST.life[i] -= dt;
    if (ST.life[i] <= 0) { ST.release(i); continue; }
    if (ST.arm[i] > 0) { ST.arm[i] -= dt; continue; }
    if (ST.fuse[i] > 0) { ST.fuse[i] -= dt; if (ST.fuse[i] <= 0) blast(W, i, 1); continue; }
    // enemy contact sets it off (hoppers in the air pass over)
    const buf = W.q1;
    const n = W.hash.gather(ST.x[i], ST.y[i], 64, buf);
    for (let k = 0; k < n; k++) {
      const e = buf[k];
      if (!W.targetable(e) || E.air[e]) continue;
      const rr = 12 + E.r[e];
      if ((E.x[e] - ST.x[i]) ** 2 + (E.y[e] - ST.y[i]) ** 2 > rr * rr) continue;
      const big = E.kind[e] === EKind.Elite || E.kind[e] === EKind.Boss;
      W.stoneChain = 0;
      blast(W, i, big ? ((WEAPONS.gobowl.p.bigX as number) ?? 1.5) : 1);
      break;
    }
  }
  // 提子: an enemy within 90 of 3+ stones is captured (300% stone damage, ignoring 甲). A capture is
  // an event, as in Go: one body per capture, then the board rests. The rate is the balance sim's,
  // 0.35/s × min(2, 棋子/8) (sim/model.js SH_CAPTURE): one capture every 2.9 s at 8 stones, 1.4 s at 16.
  const cap = W.mods.special.capture;
  if (W.captureT > 0) W.captureT -= dt;
  if (cap && ST.count >= (cap.n ?? 3) && W.captureT <= 0) {
    if (capture(W, cap.r ?? 90, cap.n ?? 3, cap.x ?? 3)) W.captureT = captureGap(W);
    else W.captureT = 0.25;
  }
}
/** Seconds between 提子 captures. */
export function captureGap(W: World): number {
  return 1 / (0.35 * Math.min(2, Math.max(1, stonesOf(W.stats)) / 8));
}

function blast(W: World, i: number, x: number): void {
  const ST = W.ST, E = W.E;
  if (!ST.alive[i]) return;
  const slot = ST.slot[i];
  const s = slot >= 0 && slot < W.slots.length ? W.slots[slot] : null;
  const sx = ST.x[i], sy = ST.y[i];
  ST.release(i);
  if (!s) return;
  const st = sheet(W, s);
  const r = stoneRadius(W, s, st);
  // IV: blasts pull enemies 60 u inward first
  if (s.t === 4) {
    const buf = W.q1;
    const n = W.hash.gather(sx, sy, r + 60 + 64, buf);
    for (let k = 0; k < n; k++) { const e = buf[k]; if (W.targetable(e)) W.pull(E.handle(e), sx, sy, (s.def.p.pullT4 as number) ?? 60); }
  }
  areaStrike(W, sx, sy, r, dmgOf(W, s, st) * x, slot, SRCI.weapon, HF.blast, s.def.knock, critPOf(s, st), critMOf(s, st));
  W.fx('shockRing', sx, sy, { r, life: 0.3 });
  W.sfx('hitMelee');
  W.stoneChain++;
  W.maxStat('peakStoneChain', W.stoneChain);
  // chain-detonate stones within 120
  for (let k = 0; k < ST.n; k++) {
    if (!ST.alive[k] || ST.fuse[k] > 0 || ST.arm[k] > 0) continue;
    if (Math.hypot(ST.x[k] - sx, ST.y[k] - sy) <= F.stone.chain) ST.fuse[k] = 0.08;
  }
}

let capMark = new Uint32Array(0);
let capPass = 0;
/**
 * One 提子 pass: the body with the most armed stones within r (at least `need`; bosses exempt) is
 * struck once for x × stone damage, ignoring 甲. Returns whether anything was captured.
 */
function capture(W: World, r: number, need: number, x: number): boolean {
  const ST = W.ST, E = W.E, buf = W.q1;
  let s: WeaponSlot | null = null;
  for (const o of W.slots) if (o.kind === 'mine') { s = o; break; }
  if (!s) return false;
  if (capMark.length < E.cap) capMark = new Uint32Array(E.cap);
  capPass = (capPass + 1) >>> 0 || 1;
  let best = -1, bestC = 0, bestHp = 0;
  const r2 = r * r;
  for (let k = 0; k < ST.n; k++) {
    if (!ST.alive[k] || ST.arm[k] > 0) continue;
    const n = W.hash.gather(ST.x[k], ST.y[k], r + 64, buf);
    for (let q = 0; q < n; q++) {
      const e = buf[q];
      if (capMark[e] === capPass) continue;
      capMark[e] = capPass;
      if (!W.targetable(e) || E.kind[e] === EKind.Boss) continue;
      let c = 0;
      for (let m = 0; m < ST.n; m++) {
        if (!ST.alive[m] || ST.arm[m] > 0) continue;
        const dx = ST.x[m] - E.x[e], dy = ST.y[m] - E.y[e];
        if (dx * dx + dy * dy <= r2) c++;
      }
      if (c < need) continue;
      if (c > bestC || (c === bestC && E.hp[e] > bestHp)) { best = e; bestC = c; bestHp = E.hp[e]; }
    }
  }
  if (best < 0) return false;
  const ex = E.x[best], ey = E.y[best];
  // the stones that closed the ring flash white
  for (let m = 0; m < ST.n; m++) {
    if (!ST.alive[m] || ST.arm[m] > 0) continue;
    const dx = ST.x[m] - ex, dy = ST.y[m] - ey;
    if (dx * dx + dy * dy <= r2) W.fx('stoneWhite', ST.x[m], ST.y[m], { r: 14, life: 0.3 });
  }
  const st = sheet(W, s);
  W.strike(best, dmgOf(W, s, st) * x, 0, 1, 0, ex, ey, s.i, SRCI.weapon, HF.noArmor);
  W.fx('stoneWhite', ex, ey, { r: 26, life: 0.35 });
  W.title({ zh: '提子', en: 'Capture' }, 'edge');
  return true;
}

// ─────────────────────────────────────────────────────────────── swords: blades, 剑冢, idle, 万剑

export function tickSwords(W: World, dt: number): void {
  const E = W.E;
  // 剑匣 blades: 2/2/3/4 + 剑数 at r 90 (+射程/4), 1 rev/s; contact once per 0.5 s per enemy
  let blades = 0;
  for (const s of W.slots) {
    if (s.kind !== 'orbit') continue;
    const st = sheet(W, s);
    const n = Math.min(SWORDS_ON_SCREEN - W.swordsAir - blades, perTier(s.def.p.blades, s.t, 2) + Math.max(0, Math.floor(st.swords)));
    if (n <= 0) continue;
    blades += n;
    s.swords = n;
    const R = (s.flareT > 0 ? ((s.def.p.flareR as number) ?? 240) : weaponRange(s.def, st));
    const per = cooldown(tierCd(s.def, s.t) , st.aspd);
    const d = dmgOf(W, s, st), cp = critPOf(s, st), cm = critMOf(s, st);
    const touch = s.touch!;
    for (let e = 0; e < E.n; e++) if (touch[e] > 0) touch[e] -= dt;
    const rev = W.t * TAU * ((s.def.p.rev as number) ?? 1);
    for (let k = 0; k < n; k++) {
      const a = rev + (k / n) * TAU;
      const bx = W.px + Math.cos(a) * R, by = W.py + Math.sin(a) * R;
      const buf = W.q1;
      const m = W.hash.gather(bx, by, 64, buf);
      for (let q = 0; q < m; q++) {
        const e = buf[q];
        if (!W.targetable(e) || touch[e] > 0) continue;
        const rr = 12 + E.r[e];
        if ((E.x[e] - bx) ** 2 + (E.y[e] - by) ** 2 > rr * rr) continue;
        touch[e] = per;
        W.strike(e, d, cp, cm, s.def.knock, W.px, W.py, s.i, SRCI.weapon, HF.sword, s.proc);
      }
    }
  }
  W.blades = blades;
  // 剑冢: +1 残剑 per 15 sword kills in the wave (max 8)
  const tomb = W.mods.special.swordtomb;
  if (tomb) {
    W.canjian = Math.min(tomb.max ?? 8, Math.floor(W.swordKills / (tomb.per ?? 15)), SWORDS_ON_SCREEN - W.swordsAir - blades);
    if (W.canjian > 0) orbitContact(W, W.canjian, 60, 1.3, ((tomb.base ?? 5) + (tomb.ranged ?? 0.5) * W.stats.ranged) * W.dmgMultNow(), 0.5, W.tombTouch);
  }
  // idle swords orbit you; with the 仙剑 6-set they cut for 30%
  let owned = 0;
  for (const s of W.slots) if (s.kind === 'launch' || s.kind === 'homing' && s.flying) owned += 1 + Math.max(0, Math.floor(W.stats.swords));
  W.idleSwords = Math.max(0, Math.min(owned - W.swordsAir, SWORDS_ON_SCREEN - W.swordsAir - blades - W.canjian));
  if (W.idleSwords > 0 && W.mods.flags.has('idleSwords')) {
    let s: WeaponSlot | null = null;
    for (const o of W.slots) if (o.flying && o.kind !== 'orbit') { s = o; break; }
    if (s) orbitContact(W, W.idleSwords, 44, 0.9, dmgOf(W, s, sheet(W, s)) * 0.3, 0.5, W.idleTouch);
  }
  // 万剑归宗: with 8+ swords, every 8 s all swords converge on the densest cluster, striking twice at 60%
  const wj = W.mods.special.wanjian;
  if (wj) {
    const total = owned + blades;
    W.wanjianT -= dt;
    if (total >= (wj.min ?? 8) && W.wanjianT <= 0) {
      W.wanjianT = wj.every ?? 8;
      const at = W.densest(W.px, W.py, 600, 80);
      let s: WeaponSlot | null = null;
      for (const o of W.slots) if (o.flying) { s = o; break; }
      if (at && s) {
        const st = sheet(W, s);
        const n = Math.min(SWORDS_ON_SCREEN, total);
        const d = dmgOf(W, s, st) * ((wj.pct ?? 60) / 100);
        const ax = at.x, ay = at.y;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU;
          const j = W.PS.spawnSlot();
          if (j < 0) break;
          const PS = W.PS;
          const sx = ax + Math.cos(a) * 260, sy = ay + Math.sin(a) * 260;
          PS.x[j] = sx; PS.y[j] = sy; PS.vx[j] = (ax - sx) / 0.45; PS.vy[j] = (ay - sy) / 0.45; PS.speed[j] = 580; PS.life[j] = PS.life0[j] = 0.9;
          PS.kind[j] = PK.flySword; PS.mode[j] = SMode.Straight; PS.slot[j] = s.i; PS.dmg[j] = d; PS.critP[j] = critPOf(s, st); PS.critM[j] = critMOf(s, st);
          PS.r[j] = 10; PS.pierce[j] = 1; PS.flags[j] = SF.sword | SF.noDeflect; PS.src[j] = SRCI.weapon;
        }
        W.title({ zh: '万剑归宗', en: 'Myriad Swords' }, 'edge');
      }
    }
  }
  // 凌波微步: moving leaves a trail that deals 3 + 8 per 10% 身法 every 0.5 s
  const lb = W.mods.special.lingbo;
  if (lb && W.moving) {
    W.lingboT -= dt;
    if (W.lingboT <= 0) {
      W.lingboT = 0.25;
      const v = ((lb.base ?? 3) + (lb.per10 ?? 8) * Math.max(0, W.stats.speed) / 10) * W.dmgMultNow();
      W.coreZone(1, 'stepTrail', W.px, W.py, 26, 1.2, ZC.trail, v);
    }
  }
}

function orbitContact(W: World, n: number, R: number, rev: number, d: number, per: number, touch: Float32Array): void {
  const E = W.E;
  for (let e = 0; e < E.n; e++) if (touch[e] > 0) touch[e] -= W.dt;
  const base = W.t * TAU * rev;
  for (let k = 0; k < n; k++) {
    const a = base + (k / n) * TAU;
    const bx = W.px + Math.cos(a) * R, by = W.py + Math.sin(a) * R;
    const buf = W.q1;
    const m = W.hash.gather(bx, by, 64, buf);
    for (let q = 0; q < m; q++) {
      const e = buf[q];
      if (!W.targetable(e) || touch[e] > 0) continue;
      const rr = 10 + E.r[e];
      if ((E.x[e] - bx) ** 2 + (E.y[e] - by) ** 2 > rr * rr) continue;
      touch[e] = per;
      W.strike(e, d, clamp(W.stats.crit / 100, 0, 1), F.critXDefault + W.stats.critDmg / 100, 10, W.px, W.py, -1, SRCI.item, HF.sword | HF.noProc);
    }
  }
}
