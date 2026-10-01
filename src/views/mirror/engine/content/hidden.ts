// 水月幻镜 · m8 · the hidden companions' engine content (hidden.md §3–§5; HIDDEN H2–H4, H7):
//   越女 候气 `houqi` (guard): a 0.25 s guard catches up to 3 blows; a body gets a stunning counter-cut, a shot
//        flies back as hers, a telegraph's owner is 破招; 精 within 0.08 s of the press; 3 剑意 make the next
//        press 夺 (a dash cut); a guard that catches nothing is 露 (+25 % damage taken).
//   山鬼 女萝 `nvluo` (recast): bind the 5 nearest (or a dragged cone), walk the vines taut, press again to snap
//        them (the further stretched, the harder; taut = a sure crit and a long stun) and yank the pack to you.
//   后羿 射日 `sheri` (hold): hold to draw, release to loose one arrow through a whole line; 0.9–1.1 s is 正中.
//   Their passives (内实精神, 幽篁, 满弓's free sun arrow), their world hooks (the guard, 露, the ring and vine
//   drawing) and, later (H7), their 镜主 skills.
// Every number is data: SKILLS[id].p, PASSIVES[id].p or F.hidden (PLAN D33).
// skills.ts and field.ts import this module (and World imports it): keep it free of runtime imports from those.
import type { PassiveId, SkillId, WeaponId } from '../../ids';
import type { Behaviour, HiddenId, HitPacket, SkillDef, SkillImpl, SkillRun, StatId, Vec, WClass, WorldApi } from '../../types';
import type { World } from '../world';
import { F, PASSIVES, SKILLS, WEAPONS } from '../../data';
import { charMult, rawDamage } from '../../logic/formulas';
import { HF, SRCI } from '../consts';
import { VF, VT, vfxW } from '../vfx';
import { makeHiddenHook } from '../rings';
import { core, endTele, enemyShot, fxLine, liveTele, pullPlayer, teleFill, teleShape } from './bridge';
import { b, hurtPlayer, segDist2, shared, teleT } from './util';
import { SF } from '../pools';

// ─────────────────────────────────────────────── shared

/** One weapon's hit before the global 伤害% (raw × companion multiplier); the same as skills.ts weaponBase. */
function weaponBase(w: WorldApi, id: WeaponId, t: 1 | 2 | 3 | 4): number {
  return rawDamage(WEAPONS[id], t, w.stats as never) * charMult(w.run, WEAPONS[id]);
}
/** hidden.md §2.6: the mean hit of the held weapons of a class (else of all), before 伤害%. 0 with no weapon. */
export function kitHit(w: WorldApi, cls?: WClass): number {
  let sum = 0, n = 0;
  for (const o of w.run.weapons) {
    if (cls && !WEAPONS[o.id].classes.includes(cls)) continue;
    sum += weaponBase(w, o.id, o.t);
    n++;
  }
  if (!n && cls) return kitHit(w);
  return n ? sum / n : 0;
}
/** The largest flat damage stat (山鬼's snap scales on it). */
function bestStat(w: WorldApi): StatId {
  const s = w.stats;
  let best: StatId = 'melee', v = s.melee;
  for (const k of ['ranged', 'elem', 'spirit'] as const) if (s[k] > v) { v = s[k]; best = k; }
  return best;
}
const isAimed = (d: Vec | null): d is Vec => d !== null && d.x * d.x + d.y * d.y > 1e-6;
const ZERO: Vec = { x: 0, y: 0 };
const BUF: number[] = [];

/** What the hidden three did (a whole engine's life; tests, the bot and the sandbox read it). */
export interface HiddenTally {
  guards: number; catches: number; perfect: number; whiffs: number; reflects: number; breaks: number; seizes: number;
  binds: number; snaps: number; taut: number; vines: number; refunds: number; withered: number;
  looses: number; sweet: number; slips: number; suns: number; cancels: number; sunArrows: number;
}
const newTally = (): HiddenTally => ({
  guards: 0, catches: 0, perfect: 0, whiffs: 0, reflects: 0, breaks: 0, seizes: 0,
  binds: 0, snaps: 0, taut: 0, vines: 0, refunds: 0, withered: 0,
  looses: 0, sweet: 0, slips: 0, suns: 0, cancels: 0, sunArrows: 0,
});
/** One of 女萝's vines: the bound foe and its rest length (the distance at the bind). */
interface Vine { h: number; rest: number }
interface HidState {
  /** 破绽: enemy handle → until (world s). */
  marks: Map<number, number>;
  /** 内实精神: weapon hits left that crit, until critUntil. */
  critLeft: number;
  critUntil: number;
  /** 满弓: bow crits so far this wave. */
  bowCrits: number;
  /** 女萝's live vines (null when none) and their bind time. */
  vines: Vine[] | null;
  vineT0: number;
  /** 满弓's free sun arrow is striking now (its hits are tallied apart from the drawn arrow's: inSunArrow). */
  sunLive: boolean;
  tally: HiddenTally;
}
const STATE = new WeakMap<World, HidState>();
function state(W: World): HidState {
  let s = STATE.get(W);
  if (!s) { s = { marks: new Map(), critLeft: 0, critUntil: 0, bowCrits: 0, vines: null, vineT0: 0, sunLive: false, tally: newTally() }; STATE.set(W, s); }
  return s;
}
/** Is 满弓's free sun arrow striking right now? (A sweep counts those hits apart from 射日's drawn arrow.) */
export function inSunArrow(w: WorldApi): boolean { return state(core(w)).sunLive; }
/** The hidden companions' running tally on this world (tests, bots). */
export function hiddenTally(w: WorldApi): Readonly<HiddenTally> { return state(core(w)).tally; }
/** 女萝's live vines as the bot reads them: how many still hold, their mean stretch (u) and the seconds left; null when none. */
export function vinesNow(w: WorldApi): { n: number; mean: number; left: number } | null {
  const W = core(w), st = state(W);
  if (!st.vines || !W.skillRun) return null;
  const p = SKILLS.nvluo.p;
  let n = 0, sum = 0;
  for (const v of st.vines) {
    if (!w.alive(v.h)) continue;
    const e = w.enemy(v.h);
    sum += Math.hypot(e.x - W.px, e.y - W.py) - v.rest;
    n++;
  }
  return { n, mean: n ? sum / n : 0, left: p.life - (w.t - st.vineT0) };
}
/** Is this foe marked 破绽 now? */
export function isMarked(w: WorldApi, h: number): boolean {
  const u = state(core(w)).marks.get(h);
  return u !== undefined && u > w.t && w.alive(h);
}
const say = (w: WorldApi, zh: string, en: string) => w.title(b(zh, en), 'edge');

// ─────────────────────────────────────────────── 越女 · 候气 (guard)

/** The answer to one caught blow (hidden.md §3.4 table): a shot flies back, a telegraph's owner is broken, a body is cut. */
function answer(w: WorldApi, def: SkillDef, attacker: number, shot: number, perfect: boolean): void {
  const W = core(w), p = def.p, st = state(W);
  const X = perfect ? p.perfX : 1;
  const kit = kitHit(w);
  const V = vfxW(w);
  let gain = p.catchGain ?? 1;
  const owner = W.underTele();
  st.tally.catches++;
  if (perfect) st.tally.perfect++;
  if (shot >= 0 && W.ES.alive[shot]) {
    // 化 a shot: it turns round and flies back along its path as hers, ×reflectX its damage, pierce 1
    const ES = W.ES;
    let dx = -ES.vx[shot], dy = -ES.vy[shot];
    if (dx * dx + dy * dy < 1) { dx = ES.px[shot] - ES.x[shot]; dy = ES.py[shot] - ES.y[shot]; }
    const L = Math.hypot(dx, dy) || 1, sp = Math.max(F.hidden.reflectMin, Math.hypot(ES.vx[shot], ES.vy[shot]) * F.hidden.reflectSpeed);
    w.shot({
      side: 'player', kind: 'flySword', x: ES.x[shot], y: ES.y[shot], vx: (dx / L) * sp, vy: (dy / L) * sp,
      r: F.hidden.reflectR, life: F.hidden.reflectLife, pierce: 1,
      hit: { base: ES.dmg[shot] * p.reflectX, mult: X, src: 'skill' },
    });
    V.ring(ES.x[shot], ES.y[shot], 22, VT.azure, 0.25, VF.thin);
    st.tally.reflects++;
  } else if (owner >= 0) {
    // 破招: the telegraph striking her now has an owner; the counter lands on it, +breakGain 剑意 (a catch: catchGain)
    w.hit(owner, { base: p.breakBase + p.breakKit * kit, scale: { melee: p.breakK }, mult: X, crit: true, src: 'skill', status: { kind: 'stun', dur: p.breakStun } });
    st.marks.set(owner, w.t + p.mark);
    gain = p.breakGain ?? gain;
    st.tally.breaks++;
    say(w, '破招', 'Broken');
    const e = w.enemy(owner);
    V.lance(w.player.x, w.player.y, Math.atan2(e.y - w.player.y, e.x - w.player.x), Math.hypot(e.x - w.player.x, e.y - w.player.y), 10, VT.azure, 0.3, VF.cut, 2);
  } else if (attacker >= 0 && w.alive(attacker)) {
    // a body: a sure-crit counter-cut, a stun (bosses shorter) and 破绽
    const boss = w.enemy(attacker).kind === 'boss';
    w.hit(attacker, { base: p.base + p.kKit * kit, scale: { melee: p.kMelee }, mult: X, crit: true, src: 'skill', status: { kind: 'stun', dur: boss ? p.stunBoss : p.stun } });
    st.marks.set(attacker, w.t + p.mark);
    const e = w.enemy(attacker);
    V.slash(e.x, e.y, Math.atan2(e.y - w.player.y, e.x - w.player.x), 34, 120, VT.azure, VF.edge, 0.2, 2);
  }
  // any other blow (a hazard): the 剑意 only
  W.hidBlades = Math.min(p.blades, W.hidBlades + gain);
  V.ring(w.player.x, w.player.y, W.pr + F.hidden.ringPad + 6, perfect ? VT.white : VT.azure, 0.3, VF.thin | VF.double);
  if (perfect) say(w, '精', 'Perfect');
  w.sfx('bell');
  W.feel.vib(perfect ? F.hidden.hapticPerfect : F.hidden.hapticCatch, 0);
  // 内实精神: the next critHits weapon hits within critWin crit
  const jp = PASSIVES.jingshen.p;
  if (W.run.char === 'yuenv') {
    st.critLeft = jp.critHits; st.critUntil = w.t + jp.critWin;
    w.buff('jingshen', { crit: 100 }, jp.critWin);
  }
}

/** 守: a guard window from the press (its own time) for p.win s. */
function guardRun(w0: WorldApi, def: SkillDef): SkillRun {
  const W = core(w0), p = def.p, st = state(W);
  const t0 = Math.min(W.castT, W.t);
  let caught = 0, perfect = false, spilled = false;
  st.tally.guards++;
  W.guard(t0 + p.win - W.t, (w, attacker, shot) => {
    // the first blow past the cap lands: the catches' untouchable time does not cover it (once; its own i-frames then hold)
    if (caught >= p.catches) { if (!spilled) { spilled = true; W.iframes = 0; } return false; }
    caught++;
    const pf = w.t - t0 <= p.perfect;
    if (pf) perfect = true;
    // 0.2 s untouchable after a catch: i-frames (they sit after the guard, so the window still catches the chain)
    W.iframes = Math.max(W.iframes, p.iframe);
    answer(w, def, attacker, shot, pf);
    return true;
  });
  // a sword-line crosses her body
  vfxW(w0).lance(W.px - 16, W.py + 10, -Math.PI / 4, 32, 4, VT.azure, p.win, VF.cut, 1);
  return {
    tick(w) {
      const left = t0 + p.win - w.t;
      w.ring?.('guard', Math.max(0, left / p.win), { pips: W.hidBlades, of: p.blades, tone: 'lake', flash: perfect });
      return left > 0;
    },
    end(w) {
      W.guardFn = null; W.guardUntil = -1;
      if (caught === 0) {
        // 露: a whiff leaves her open, and the full cooldown runs
        w.expose?.(p.exposed, p.exposedDur);
        st.tally.whiffs++;
        say(w, '露', 'Open');
        W.cdNext = -1;
      } else W.cdNext = perfect ? p.cdPerfect : p.cdCatch;
    },
  };
}

/** 夺: with full 剑意, a dash cut through the strongest foe (or along the drag). */
function seize(w0: WorldApi, def: SkillDef, at: Vec, dir: Vec): SkillRun {
  const W = core(w0), p = def.p, st = state(W);
  W.hidBlades = 0;
  st.tally.seizes++;
  const sx = W.px, sy = W.py;
  let dx = at.x - sx, dy = at.y - sy, d = Math.hypot(dx, dy);
  if (d < 1) { dx = dir.x; dy = dir.y; d = Math.hypot(dx, dy) || 1; }
  dx /= d; dy /= d;
  w0.dash(dx, dy, p.cutLen, F.hidden.cutDur, p.cutIframe);
  w0.sfx('dodge');
  say(w0, '夺', 'Seize');
  const kit = kitHit(w0);
  let t = 0, struck = false, gave = false;
  return {
    tick(w, dt) {
      t += dt;
      if (t < F.hidden.cutDur) return true;
      if (struck) return false;
      struck = true;
      const ex = W.px, ey = W.py, len = Math.max(40, Math.hypot(ex - sx, ey - sy)), ang = Math.atan2(ey - sy, ex - sx);
      const pk: HitPacket = { base: p.cutBase + p.cutKit * kit, scale: { melee: p.cutK }, mult: p.cutX, crit: true, src: 'skill', knock: p.cutKnock ?? 0 };
      // 破绽-marked foes on the line take ×markX (an extra hit of cutX × (markX − 1)), and the mark is spent
      const marked: number[] = [];
      const ux = Math.cos(ang), uy = Math.sin(ang);
      for (const [h, until] of st.marks) {
        if (until <= w.t || !w.alive(h)) continue;
        const e = w.enemy(h), rr = p.cutW / 2 + e.r;
        if (segDist2(e.x, e.y, sx, sy, sx + ux * len, sy + uy * len) <= rr * rr) marked.push(h);
      }
      w.hitLine(sx, sy, ang, len, p.cutW, pk);
      for (const h of marked) {
        if (w.alive(h)) w.hit(h, { ...pk, mult: p.cutX * (p.markX - 1) });
        st.marks.delete(h);
      }
      const V = vfxW(w);
      V.lance(sx, sy, ang, len, 14, VT.azure, 0.35, VF.streak, 2);
      V.lance(sx, sy, ang, len, 5, VT.white, 0.25, VF.cut, 2);
      W.cdNext = p.cdCatch;
      return false;
    },
    // a kill by the cut gives back one 剑意
    on(w, ev) {
      if (gave || ev.type !== 'kill' || ev.src !== 'skill') return;
      gave = true;
      W.hidBlades = Math.min(p.blades, W.hidBlades + 1);
      void w;
    },
  };
}

const houqi: SkillImpl = {
  target(w, def) {
    if (core(w).hidBlades < def.p.blades) return null;
    const h = w.strongest(w.player.x, w.player.y, def.p.cutLen, 'any');
    if (h < 0) return null;
    const e = w.enemy(h);
    return { x: e.x, y: e.y };
  },
  cast(w, def, at, dir) {
    return core(w).hidBlades >= def.p.blades ? seize(w, def, at, dir) : guardRun(w, def);
  },
};

/** 内实精神: the idle ring with the 剑意 pips; the sure crits after a catch; +暴击倍数 on 破绽-marked foes. */
const jingshen: Behaviour<null> = {
  start: () => null,
  tick(w) {
    const W = core(w), st = state(W);
    if (!W.skillRun && W.skillDef?.id === 'houqi') w.ring?.('guard', 0, { pips: W.hidBlades, of: W.skillDef.p.blades, tone: 'lake' });
    if (st.critLeft > 0 && w.t > st.critUntil) st.critLeft = 0;
  },
  on(w, _s, ev) {
    const W = core(w), st = state(W);
    if ((ev.type === 'hit' || ev.type === 'crit') && ev.slot >= 0 && st.critLeft > 0) {
      st.critLeft--;
      if (st.critLeft <= 0) w.buff('jingshen', {}, 0);
    }
    // a crit on a marked foe: +markCritDmg 暴击倍数, dealt as the difference (no crit, no armour, no procs)
    if (ev.type === 'crit' && ev.e >= 0 && ev.dmg > 0 && (ev.src === 'weapon' || ev.src === 'skill') && isMarked(w, ev.e)) {
      const i = W.E.slotOf(ev.e);
      if (i < 0) return;
      const critM = F.critXDefault + W.stats.critDmg / 100 + Math.max(0, W.stats.crit - 100) / 100;
      const vuln = W.E.vulnT[i] > 0 ? 1 + W.E.vulnV[i] / 100 : 1;
      const extra = (ev.dmg * (PASSIVES.jingshen.p.markCritDmg / 100)) / Math.max(1, critM) / vuln;
      // next step: the event object is shared with the other listeners of this one
      const h = ev.e;
      if (extra > 0) w.after(0, () => { const j = W.E.slotOf(h); if (j >= 0) W.strike(j, extra, 0, 1, 0, W.px, W.py, -1, SRCI.skill, HF.noCrit | HF.noArmor | HF.noProc | HF.quiet); });
    }
  },
};

// ─────────────────────────────────────────────── 山鬼 · 女萝 (recast)

const VINE_GREEN = '#9fb86a', VINE_GOLD = '#d9a62e';

const nvluo: SkillImpl = {
  target: () => null,
  cast(w0, def, _at, dir) {
    const W = core(w0), p = def.p, st = state(W);
    const t0 = W.t, px = W.px, py = W.py;
    const aimed = W.castAimed;
    // who: the n nearest within r; a drag: the n nearest inside a coneDeg cone that way, out to the reach
    const reach = aimed ? (def.reach ?? p.r) : p.r;
    const n = w0.query(px, py, reach, BUF, 'any');
    const ph = shared(w0).phantoms;
    const half = (p.coneDeg / 2) * (Math.PI / 180), da = Math.atan2(dir.y, dir.x);
    const cand: { h: number; d: number }[] = [];
    for (let k = 0; k < n; k++) {
      const h = BUF[k];
      if (ph.has(h)) continue;
      const e = w0.enemy(h);
      if (e.kind === 'ally' || e.kind === 'treasure') continue;
      const ex = e.x - px, ey = e.y - py, d = Math.hypot(ex, ey);
      if (d > reach + e.r) continue;
      if (aimed && d > 1) { let a = Math.atan2(ey, ex) - da; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > half) continue; }
      cand.push({ h, d });
    }
    cand.sort((a, c) => a.d - c.d || a.h - c.h);
    const vines: Vine[] = cand.slice(0, p.n).map((c) => ({ h: c.h, rest: c.d }));
    if (!vines.length) {
      // nothing to bind: no cooldown
      W.cdNext = 0;
      w0.sfx('hitShot');
      return { tick: () => false };
    }
    st.tally.binds++;
    st.tally.vines += vines.length;
    const V = vfxW(w0);
    for (const v of vines) { const e = w0.enemy(v.h); V.bolt(px, py, e.x, e.y, VT.green, 0.25, 1); }
    w0.sfx('summon');
    let ended = false;
    st.vines = vines; st.vineT0 = t0;
    const stop = (w: WorldApi) => { ended = true; st.vines = null; w.buff('nvluo:drag', {}, 0, 1); };
    return {
      tick(w) {
        if (ended) return false;
        const el = w.t - t0;
        let live = 0, stretched = 0;
        const x = W.px, y = W.py;
        for (const v of vines) {
          if (!w.alive(v.h)) continue;
          live++;
          const e = w.enemy(v.h);
          let ex = e.x - x, ey = e.y - y, d = Math.hypot(ex, ey);
          // the leash: a bound non-boss can't get further than rest + leash; the vine drags it after her
          if (e.kind !== 'boss' && d > v.rest + p.leash) {
            const k = (v.rest + p.leash) / d;
            e.x = x + ex * k; e.y = y + ey * k;
            ex *= k; ey *= k; d = v.rest + p.leash;
          }
          const s = d - v.rest;
          if (s > p.slack) stretched++;
          w.tether?.(v.h, 1 - Math.max(0, Math.min(1, (s - p.slack) / (p.taut - p.slack))), s >= p.taut ? VINE_GOLD : VINE_GREEN);
        }
        if (live === 0) {
          // every bound foe died first: the vines come back, and the cooldown is at most p.refund
          W.cdNext = Math.max(0, Math.min(def.cd - el, p.refund));
          st.tally.refunds++;
          stop(w);
          return false;
        }
        if (el >= p.life) {
          // 藤枯: the vines wither unsnapped; the cooldown still counts from the bind
          W.cdNext = Math.max(0, def.cd - el);
          st.tally.withered++;
          say(w, '藤枯', 'Withered');
          stop(w);
          return false;
        }
        // the stretch costs her speed: −drag % a vine over the slack, at most −dragMax %
        const slow = Math.min(p.dragMax, p.drag * stretched);
        w.buff('nvluo:drag', {}, 0.1, 1 - slow / 100);
        w.ring?.('vine', 1 - el / p.life, { tone: 'vine' });
        return true;
      },
      recast(w) {
        if (ended) return;
        // 断萝: each vine hits by its stretch, stuns, yanks its foe in front of her and leaves 惑
        const el = w.t - t0, kit = kitHit(w), best = bestStat(w), yp = PASSIVES.youhuang.p;
        const x = W.px, y = W.py, VS = vfxW(w);
        let anyTaut = false;
        for (const v of vines) {
          if (!w.alive(v.h)) continue;
          const e = w.enemy(v.h);
          const ex = e.x - x, ey = e.y - y, d = Math.hypot(ex, ey), s = d - v.rest;
          const taut = s >= p.taut;
          const m = s < p.slack ? p.slackX : p.m0 + Math.min(s, p.cap) / p.per;
          const boss = e.kind === 'boss';
          VS.bolt(e.x, e.y, x, y, taut ? VT.gold : VT.green, 0.25, taut ? 2 : 1);
          w.hit(v.h, { base: p.base + p.kKit * kit, scale: { [best]: p.k }, mult: m, crit: taut ? true : 'roll', src: 'skill', status: { kind: 'stun', dur: taut ? p.stunTaut : p.stun } });
          st.tally.snaps++;
          if (taut) { st.tally.taut++; anyTaut = true; }
          if (!w.alive(v.h)) continue;
          if (!boss) {
            const L = d > 1 ? d : 1, ux = d > 1 ? ex / L : Math.cos(W.face), uy = d > 1 ? ey / L : Math.sin(W.face);
            const f = w.enemy(v.h);
            f.x = x + ux * p.pullTo; f.y = y + uy * p.pullTo;
          }
          w.status(v.h, 'vuln', yp.vulnDur, yp.vuln);
        }
        if (anyTaut) say(w, '绷紧', 'Taut');
        VS.shock(x, y, p.pullTo + 30, anyTaut ? VT.gold : VT.green, { flags: VF.double, life: 0.35, prio: 2 });
        W.cdNext = Math.max(0, def.cd - el);
        stop(w);
      },
      end(w) { if (!ended) stop(w); },
    };
  },
};
/** 幽篁: +per % 伤害 for each foe within nearR (at most +max %), refreshed every step. */
const youhuang: Behaviour<null> = {
  start: () => null,
  tick(w) {
    const p = PASSIVES.youhuang.p;
    const n = w.query(w.player.x, w.player.y, p.nearR, BUF, 'any');
    const pct = Math.min(p.max, p.per * n);
    w.buff('youhuang', pct > 0 ? { dmg: pct } : {}, 0.25);
  },
};

// ─────────────────────────────────────────────── 后羿 · 射日 (hold)

/** The first elite or boss on a line (for 九日), or −1. */
function firstBig(w: WorldApi, x: number, y: number, ang: number, len: number, wd: number): number {
  const n = w.query(x, y, len + 80, BUF, 'eliteOrBoss');
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let best = -1, bt = Infinity;
  for (let k = 0; k < n; k++) {
    const h = BUF[k], e = w.enemy(h), rr = wd / 2 + e.r;
    if (segDist2(e.x, e.y, x, y, x + ux * len, y + uy * len) > rr * rr) continue;
    const t = (e.x - x) * ux + (e.y - y) * uy;
    if (t >= 0 && t < bt) { bt = t; best = h; }
  }
  return best;
}
/** 手瞄 on: the aim stick, else the cursor, as a world vector; else null. */
function manualAim(W: World): Vec | null {
  if (W.settings.aim !== 'manual') return null;
  if (Math.hypot(W.aimX, W.aimY) > 0.2) return { x: W.aimX, y: W.aimY };
  if (W.cursorX < 0) return null;
  const c = W.cam;
  return { x: (W.cursorX * c.dpr - c.w / 2) / c.scale + c.x - W.px, y: (W.cursorY * c.dpr - c.h / 2) / c.scale + c.y - W.py };
}
/** The way an arrow flies: the drag, else the strongest foe in reach, else facing. */
function aimOf(w: WorldApi, def: SkillDef, dir: Vec | null): number {
  if (isAimed(dir)) return Math.atan2(dir.y, dir.x);
  const h = w.strongest(w.player.x, w.player.y, def.reach ?? def.p.len, 'any');
  if (h >= 0) { const e = w.enemy(h); return Math.atan2(e.y - w.player.y, e.x - w.player.x); }
  return core(w).face;
}
/**
 * Loose one great arrow after `held` s of draw: ((base + kKit × bow kit) + kRanged × 远程) × (minDraw + (1 − minDraw)
 * × draw); 正中 (sweet0–sweet1) ×sweetX, a sure crit and 九日 on the first elite / boss; 弦松 (past slip) ×slipX.
 * `own` = the skill itself (it sets the cooldown); else 满弓's free sun arrow.
 */
export function loose(w: WorldApi, def: SkillDef, held: number, dir: Vec | null, own: boolean): number {
  if (own) return looseIn(w, def, held, dir, true);
  const st = state(core(w));
  st.sunLive = true;
  try { return looseIn(w, def, held, dir, false); } finally { st.sunLive = false; }
}
function looseIn(w: WorldApi, def: SkillDef, held: number, dir: Vec | null, own: boolean): number {
  const W = core(w), p = def.p, st = state(W);
  const draw = Math.min(1, Math.max(0, held) / p.full);
  const sweet = own && held >= p.sweet0 && held <= p.sweet1;
  const slip = own && held > p.slip;
  const mult = (p.minDraw + (1 - p.minDraw) * draw) * (sweet ? p.sweetX : slip ? p.slipX : 1);
  const ang = aimOf(w, def, dir);
  const x = W.px, y = W.py;
  const pk: HitPacket = { base: p.base + p.kKit * kitHit(w, 'bow'), scale: { ranged: p.kRanged }, mult, crit: sweet ? true : 'roll', src: 'skill' };
  const big = sweet ? firstBig(w, x, y, ang, p.len, p.w) : -1;
  const bx = big >= 0 ? w.enemy(big).x : 0, by = big >= 0 ? w.enemy(big).y : 0;
  const n = w.hitLine(x, y, ang, p.len, p.w, pk);
  const V = vfxW(w);
  V.lance(x, y, ang, p.len, sweet ? 16 : 10, VT.gold, sweet ? 0.4 : 0.28, VF.streak, 2);
  if (sweet) V.lance(x, y, ang, p.len, 5, VT.white, 0.3, VF.cut, 2);
  if (!n) w.sfx('hitShot');
  if (own) {
    st.tally.looses++;
    if (sweet) { st.tally.sweet++; say(w, '正中', 'Bullseye'); }
    if (slip) { st.tally.slips++; say(w, '弦松', 'The string slips'); W.cdNext = def.cd + p.slipCd; }
  } else st.tally.sunArrows++;
  // 九日: shards of the arrow on random foes near the first elite or boss it passed (the boss included)
  if (big >= 0) {
    st.tally.suns++;
    say(w, '九日', 'Nine Suns');
    const m = w.query(bx, by, p.shardR, BUF, 'any');
    const pool = BUF.slice(0, m);
    for (let k = 0; k < p.shards; k++) {
      const h = pool.length ? pool[Math.floor(w.rng() * pool.length)] : big;
      if (!w.alive(h)) continue;
      const e = w.enemy(h);
      V.bolt(bx, by - 40, e.x, e.y, VT.gold, 0.22, 1);
      w.hit(h, { ...pk, mult: mult * p.shardPct, crit: 'roll' });
    }
  }
  return n;
}

const sheri: SkillImpl = {
  target(w, def) {
    const h = w.strongest(w.player.x, w.player.y, def.reach ?? def.p.len, 'any');
    if (h < 0) return null;
    const e = w.enemy(h);
    return { x: e.x, y: e.y };
  },
  cast(w0, def) {
    const W = core(w0), p = def.p, st = state(W);
    const t0 = Math.min(W.castT, W.t);
    let done = false, inNotch = false;
    // he moves at p.move while drawing
    w0.buff('sheri:draw', {}, p.slip + 1, p.move);
    const fire = (w: WorldApi, held: number, dir: Vec | null) => {
      done = true;
      w.buff('sheri:draw', {}, 0, 1);
      loose(w, def, held, dir, true);
    };
    // the aim line: the drag, else 手瞄 (the aim stick or the cursor), else the strongest; an unaimed release and a slip fly along it
    const lineDir = (w: WorldApi): Vec => {
      const a = aimOf(w, def, W.skillPreview ? { x: W.skillPreview.x - W.px, y: W.skillPreview.y - W.py } : manualAim(W));
      return { x: Math.cos(a), y: Math.sin(a) };
    };
    return {
      tick(w) {
        if (done) return false;
        const held = w.t - t0;
        // the string slips by itself past p.slip
        if (held > p.slip) { fire(w, held, lineDir(w)); return false; }
        const notch = held >= p.sweet0 && held <= p.sweet1;
        if (notch && !inNotch) W.feel.vib(F.hidden.hapticNotch, 0);
        inNotch = notch;
        w.ring?.('draw', held / p.full, { marks: [p.sweet0 / p.full, p.sweet1 / p.full], tone: 'sun', flash: notch });
        const ld = lineDir(w);
        W.aimLine.x = ld.x; W.aimLine.y = ld.y; W.aimAt = w.t;
        return true;
      },
      release(w, held, dir) {
        if (done) return;
        if (dir === null) {
          // cancelled: no arrow, no cooldown
          done = true;
          w.buff('sheri:draw', {}, 0, 1);
          W.cdNext = 0;
          st.tally.cancels++;
          return;
        }
        fire(w, held, isAimed(dir) ? dir : lineDir(w));
      },
      end(w) { w.buff('sheri:draw', {}, 0, 1); done = true; },
    };
  },
};

/** 满弓: the still arc under his feet; every `every`th bow crit looses a free sun arrow at draw sunDraw. */
const mangong: Behaviour<null> = {
  start: () => null,
  tick(w) {
    const W = core(w), p = PASSIVES.mangong.p;
    if (!W.skillRun && w.player.stillFor >= p.still) w.ring?.('still', 1, { tone: 'sun' });
  },
  on(w, _s, ev) {
    if (ev.type !== 'crit' || ev.slot < 0) return;
    const W = core(w), st = state(W), p = PASSIVES.mangong.p;
    const sl = W.slots[ev.slot];
    if (!sl || !WEAPONS[sl.id as WeaponId]?.classes.includes('bow')) return;
    if (++st.bowCrits % p.every !== 0) return;
    // after the strike that triggered it (never inside another hit)
    w.after(0, (ww) => loose(ww, SKILLS.sheri, p.sunDraw * SKILLS.sheri.p.full, ZERO, false));
  },
};

// ─────────────────────────────────────────────── registries

export const HIDDEN_SKILL_IMPLS: Partial<Record<SkillId, SkillImpl>> = { houqi, nvluo, sheri };

export const HIDDEN_PASSIVE_IMPLS: Partial<Record<PassiveId, Behaviour>> = { jingshen, youhuang, mangong } as Partial<Record<PassiveId, Behaviour>>;

/**
 * 镜主's mirrored 镜技 for a hidden companion: a coroutine run by mirrorself.ts (yield the seconds to wait, 0 = the
 * next step). `self` is the 镜主's handle; `dmg(k)` is its scaled blow (40 × wave × enrage × k). HIDDEN H7.
 */
export type HiddenMirrorSkill = (w: WorldApi, self: number, dmg: (k?: number) => number) => Generator<number, void, void>;

/** Each 镜主's own count (越女's guards that caught, 后羿's shots), per world and handle. */
const MIRROR_N = new WeakMap<World, Map<number, number>>();
function mirrorN(w: WorldApi, self: number, add = 0): number {
  const W = core(w);
  let m = MIRROR_N.get(W);
  if (!m) { m = new Map(); MIRROR_N.set(W, m); }
  const n = (m.get(self) ?? 0) + add;
  m.set(self, n);
  return n;
}
const angTo = (w: WorldApi, x: number, y: number) => Math.atan2(w.player.y - y, w.player.x - x);
const inLine = (w: WorldApi, x: number, y: number, dir: number, len: number, wd: number) => {
  const r = w.player.r, ex = x + Math.cos(dir) * len, ey = y + Math.sin(dir) * len;
  return segDist2(w.player.x, w.player.y, x, y, ex, ey) <= (wd / 2 + r) * (wd / 2 + r);
};

export const HIDDEN_MIRROR: Partial<Record<HiddenId, HiddenMirrorSkill>> = {
  /** 越女's mirror (hidden.md §3.10): a guard ring you must not shoot into; caught shots come back slow; after
   *  two guards that caught something, a telegraphed dash cut along a line. */
  *yuenv(w, self, dmg) {
    const P = F.hidden.mirror.yuenv, W = core(w), PS = W.PS;
    let e = w.enemy(self);
    w.tele({ shape: { kind: 'circle', x: e.x, y: e.y, r: P.r }, dur: P.warn });
    yield P.warn;
    if (!w.alive(self)) return;
    e = w.enemy(self);
    e.invuln = true;
    w.fx('rippleRing', e.x, e.y, { r: P.r, life: P.dur, tint: '#7fc4c8' });
    let caught = 0;
    for (let t = 0; t < P.dur; t += W.dt) {
      if (!w.alive(self)) return;
      e = w.enemy(self);
      for (let i = 0; i < PS.n; i++) {
        if (!PS.alive[i] || (PS.flags[i] & SF.sword)) continue;
        const dx = PS.x[i] - e.x, dy = PS.y[i] - e.y, R = P.r + PS.r[i];
        if (dx * dx + dy * dy <= R * R) { PS.release(i); caught++; }
      }
      yield 0;
    }
    if (!w.alive(self)) return;
    e = w.enemy(self);
    e.invuln = false;
    if (!caught) return;
    w.title(b('化', 'Caught'), 'edge');
    const at = angTo(w, e.x, e.y);
    for (let k = 0; k < P.shots; k++) {
      const a = at + (k - (P.shots - 1) / 2) * P.spread * (Math.PI / 180);
      enemyShot(w, 'eMoonShard', e.x, e.y, Math.cos(a) * P.speed, Math.sin(a) * P.speed, P.shotR, P.life, dmg(P.shotX));
    }
    if (mirrorN(w, self, 1) < P.dashAfter) return;
    mirrorN(w, self, -P.dashAfter);
    // 夺: the line, then the dash along it
    const dir = angTo(w, e.x, e.y), x0 = e.x, y0 = e.y;
    w.tele({ shape: { kind: 'line', x: x0, y: y0, dir, len: P.len, w: P.w }, dur: P.tele });
    yield teleT(w, P.tele);
    if (!w.alive(self)) return;
    if (inLine(w, x0, y0, dir, P.len, P.w)) hurtPlayer(w, dmg(P.dashX), 'mirrorself', { from: { x: x0, y: y0 } });
    for (let t = 0; t < P.dashDur; t += W.dt) {
      if (!w.alive(self)) return;
      const v = w.enemy(self), k = (P.len / P.dashDur) * W.dt;
      v.vx = 0; v.vy = 0; v.x += Math.cos(dir) * k; v.y += Math.sin(dir) * k;
      const c = w.clampToArena({ x: v.x, y: v.y }, v.r); v.x = c.x; v.y = c.y;
      yield 0;
    }
  },
  /** 山鬼's mirror (hidden.md §4.10): it binds you with one vine; far from it you are slowed; at the end, if you
   *  walked well away from where you were bound, you are yanked to it and stunned. Walk back (slack) to be safe. */
  *shangui(w, self, _dmg) {
    const P = F.hidden.mirror.shangui, W = core(w);
    let e = w.enemy(self);
    const dir = angTo(w, e.x, e.y), d0 = Math.hypot(w.player.x - e.x, w.player.y - e.y);
    w.tele({ shape: { kind: 'line', x: e.x, y: e.y, dir, len: d0 + P.w, w: P.w }, dur: P.tele });
    yield teleT(w, P.tele);
    if (!w.alive(self)) return;
    e = w.enemy(self);
    const rest = Math.hypot(w.player.x - e.x, w.player.y - e.y);
    for (let t = 0; t < P.life; t += W.dt) {
      if (!w.alive(self)) return;
      e = w.enemy(self);
      const d = Math.hypot(w.player.x - e.x, w.player.y - e.y);
      w.tether?.(self, d - rest >= SKILLS.nvluo.p.taut ? 0 : 1 - Math.max(0, d - rest) / SKILLS.nvluo.p.taut, P.tint);
      if (d > P.far) W.slowPlayer(P.slow, W.dt * 2);
      yield 0;
    }
    e = w.enemy(self);
    const d = Math.hypot(w.player.x - e.x, w.player.y - e.y);
    if (d <= rest + P.snap) return;
    w.title(b('绷紧', 'Taut'), 'edge');
    pullPlayer(w, e.x, e.y, d - P.pullTo);
    w.root(P.stun);
  },
  /** 后羿's mirror (hidden.md §5.10): a line that tracks you, locks, and looses; every other shot its sweet window
   *  glows gold, the moment to step off the line. */
  *houyi(w, self, dmg) {
    const P = F.hidden.mirror.houyi, W = core(w);
    const gold = mirrorN(w, self, 1) % 2 === 0;
    let e = w.enemy(self), dir = angTo(w, e.x, e.y);
    const id = liveTele(w, { kind: 'line', x: e.x, y: e.y, dir, len: P.len, w: P.w }, 0);
    const T = teleT(w, P.tele), Tk = teleT(w, P.track), g0 = teleT(w, P.sweet0), g1 = teleT(w, P.sweet1);
    let glowed = false;
    try {
      for (let t = 0; t < T; t += W.dt) {
        if (!w.alive(self)) return;
        e = w.enemy(self);
        if (t < Tk) dir = angTo(w, e.x, e.y);
        const sh = teleShape(w, id);
        if (sh && sh.kind === 'line') { sh.x = e.x; sh.y = e.y; sh.dir = dir; }
        teleFill(w, id, t / T);
        if (gold && !glowed && t >= g0) { glowed = true; fxLine(w, 'beamRay', e.x, e.y, dir, P.len, g1 - g0, P.w / 32); }
        yield 0;
      }
    } finally { endTele(w, id); }
    if (!w.alive(self)) return;
    e = w.enemy(self);
    fxLine(w, 'beamRay', e.x, e.y, dir, P.len, 0.25, P.w / 16);
    if (inLine(w, e.x, e.y, dir, P.len, P.w)) hurtPlayer(w, dmg(P.x), 'mirrorself', { from: { x: e.x, y: e.y } });
  },
};

/**
 * The hidden companions' world hooks for this wave (World.begin calls it every wave, after the reset): the verb
 * state starts clean; a 'guard' skill gets the guard (World.guardHook) and 露 (a hurtScalers factor); every
 * hidden companion gets the figure-layer hook (the ring, the vines, the 破绽 marks, the aim line).
 * The 13 ('tap') get nothing.
 */
export function registerHiddenHooks(w: World): void {
  w.hiddenReset();
  const st = state(w);
  st.marks.clear(); st.critLeft = 0; st.critUntil = 0; st.bowCrits = 0; st.vines = null;
  const input = w.skillDef?.input;
  if (!input || input === 'tap') return;
  if (input === 'guard') {
    w.guardHook = (n, attacker, shot, src, melee) => w.guardCatch(n, attacker, shot, src, melee);
    w.hurtScalers.push(() => w.exposeX());
  }
  w.playerHooks.push(makeHiddenHook(() => st.marks));
}
