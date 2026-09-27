// 水月幻镜 · what runs over the whole wave: the map hazards (GDD §12), the passives' runtime parts
// (§11.3; most are the core's), the runtime 镜蚀 mutators (§15.3; 双精 / 疾影 / 厚甲 are static, in
// logic) and the 今日镜 节气 modifiers (§17.7; the static numbers are logic's, these are the rest).
import type { HazardId, MutatorId, PassiveId, TermModId } from '../../ids';
import { TERM_MOD_REG } from '../../ids';
import type { Behaviour, GameEvent, WorldApi } from '../../types';
import { HAZARDS, MUTATORS, TERM_MODS, WEAPONS } from '../../data';
import { strengthOf } from '../../logic/formulas';
import {
  addCrate, core, copyShot, dotsOf, dropMoon, drunkNow, freshCoreShots, lightNow, livesLeft, moveZone, mods, nudgePlayer,
  pullPlayer, pushPlayer, restoreHp, scaleShot, sky, waveLen, waveTime, zonePos,
} from './bridge';
import { TAU, b, hurtPlayer, openPoint, rimR, shared } from './util';

const change = (w: WorldApi) => w.run.char === 'change';
/** The first periodic event of a hazard comes at 40% of its period, then every period. */
const firstAt = (every: number) => every * 0.4;

// ═════════════════════════════════════════════ hazards

interface Glow { id: number; x: number; y: number; a: number }
/** 月影: a bright circle drifting at 40 u/s; standing in it gives +10% 伤害 and +2 回气. */
const moonglow: Behaviour<Glow> = {
  start(w) {
    const p = HAZARDS.moonglow.p;
    const at = openPoint(w, p.r + 40, { x: 0, y: 0 }, rimR(w) * 0.6);
    return { id: w.zone({ side: 'player', look: 'moonCircle', x: at.x, y: at.y, r: p.r, life: 1e6 }), x: at.x, y: at.y, a: w.rng() * TAU };
  },
  tick(w, s, dt) {
    const p = HAZARDS.moonglow.p;
    s.a += Math.sin(w.t * 0.37) * 0.25 * dt;
    let nx = s.x + Math.cos(s.a) * p.speed * dt, ny = s.y + Math.sin(s.a) * p.speed * dt;
    if (!w.inArena(nx, ny, p.r * 0.8)) { s.a += Math.PI * (0.6 + 0.3 * w.rng()); nx = s.x; ny = s.y; }
    s.x = nx; s.y = ny;
    moveZone(w, s.id, s.x, s.y);
    if ((w.player.x - s.x) ** 2 + (w.player.y - s.y) ** 2 <= p.r * p.r) w.buff('moonglow', { dmg: p.dmg, regen: p.regen }, 0.25);
  },
};

interface Ripple { next: number; r: number; prev: number; id: number; id2: number; warn: number }
/** 涟漪: warned by a pale ring 1.5 s ahead, a ring spreads from the centre at 300 u/s, pushing everything 60 u out. */
const ripple: Behaviour<Ripple> = {
  start() { return { next: firstAt(HAZARDS.ripple.every!), r: -1, prev: 0, id: -1, id2: -1, warn: -1 }; },
  tick(w, s, dt) {
    const H = HAZARDS.ripple, p = H.p;
    s.next -= dt;
    if (s.warn < 0 && s.r < 0 && s.next <= H.tele!) {
      s.warn = H.tele!;
    }
    if (s.warn >= 0) {
      if (Math.floor(s.warn * 3) !== Math.floor((s.warn - dt) * 3)) w.fx('rippleRing', 0, 0, { r: 80, life: 0.45 });
      s.warn -= dt;
      if (s.warn < 0) {
        s.r = 0; s.prev = 0;
        // two rings drawn together read on pale paper
        s.id = w.zone({ side: 'player', look: 'rippleRing', x: 0, y: 0, r: 1, life: 30 });
        s.id2 = w.zone({ side: 'player', look: 'rippleRing', x: 0, y: 0, r: 1, life: 30 });
      }
    }
    if (s.r >= 0) {
      s.prev = s.r;
      s.r += p.speed * dt;
      moveZone(w, s.id, 0, 0, s.r);
      moveZone(w, s.id2, 0, 0, Math.max(1, s.r - 8));
      const out: number[] = [];
      w.query(0, 0, s.r, out);
      for (const h of out) {
        const e = w.enemy(h);
        const d = Math.hypot(e.x, e.y);
        if (d >= s.prev) w.push(h, 0, 0, p.push);
      }
      const pd = Math.hypot(w.player.x, w.player.y);
      if (!change(w) && pd >= s.prev && pd < s.r) pushPlayer(w, 0, 0, p.push);
      if (s.r > rimR(w) + 40) { w.endZone(s.id); w.endZone(s.id2); s.r = -1; s.next = H.every!; }
    }
  },
};

/** 墨雨: 4 marked circles (1.2 s) become slowing ink puddles of r 90 for 8 s. */
const inkrain: Behaviour<{ next: number }> = {
  start() { return { next: firstAt(HAZARDS.inkrain.every!) }; },
  tick(w, s, dt) {
    const H = HAZARDS.inkrain, p = H.p;
    s.next -= dt;
    if (s.next > 0) return;
    s.next = H.every!;
    puddles(w, p.n, p.r, H.tele!, p.life, p.slow);
  },
};
/** Ink puddles near you (墨雨, 清明). */
function puddles(w: WorldApi, n: number, r: number, tele: number, life: number, slow: number): void {
  const me = { x: w.player.x, y: w.player.y };
  for (let k = 0; k < n; k++) {
    const at = k === 0 ? openPoint(w, r * 0.5, me, 60) : openPoint(w, r * 0.5, me, 380);
    w.tele({
      shape: { kind: 'circle', x: at.x, y: at.y, r }, dur: tele,
      then: (ww) => { ww.zone({ side: 'enemy', look: 'inkPuddle', x: at.x, y: at.y, r, life, slow: change(ww) ? 0 : slow }); },
    });
  }
}

interface Gust { next: number; phase: 0 | 1 | 2; t: number; dx: number; dy: number; leaves: number[] }
/** 山风: swirling leaves show the direction for 1.5 s, then everything drifts 40 u/s that way for 2 s. */
function gustOf(every: number, speed: number, dur: number, push: number): Behaviour<Gust> {
  return {
    start() { return { next: firstAt(every), phase: 0, t: 0, dx: 1, dy: 0, leaves: [] }; },
    tick(w, s, dt) {
      if (s.phase === 0) {
        s.next -= dt;
        if (s.next > 0) return;
        const a = w.rng() * TAU;
        s.dx = Math.cos(a); s.dy = Math.sin(a); s.phase = 1; s.t = 1.5;
        s.leaves = [];
        for (let k = 0; k < 6; k++) {
          const x = w.player.x + (w.rng() - 0.5) * 700, y = w.player.y + (w.rng() - 0.5) * 500;
          s.leaves.push(w.zone({ side: 'player', look: 'leafGust', x, y, r: 36, life: 1.5 + dur }));
        }
        return;
      }
      // the leaves stream along the wind
      for (const id of s.leaves) {
        const z = zonePos(w, id);
        if (z) moveZone(w, id, z.x + s.dx * 160 * dt, z.y + s.dy * 160 * dt);
      }
      s.t -= dt;
      if (s.phase === 1) {
        if (s.t <= 0) {
          s.phase = 2; s.t = dur;
          // 秋风: a single shove; 山风: a steady drift
          if (push > 0) {
            pullPlayer(w, w.player.x + s.dx * 1000, w.player.y + s.dy * 1000, push);
            const out: number[] = [];
            w.query(w.player.x, w.player.y, 900, out);
            for (const h of out) { const e = w.enemy(h); w.push(h, e.x - s.dx * 100, e.y - s.dy * 100, push); }
          }
        }
        return;
      }
      if (speed > 0) {
        nudgePlayer(w, s.dx * speed * dt, s.dy * speed * dt);
        const out: number[] = [];
        w.query(w.player.x, w.player.y, 1200, out);
        for (const h of out) { const e = w.enemy(h); if (e.kind !== 'boss') { e.x += s.dx * speed * dt; e.y += s.dy * speed * dt; } }
      }
      if (s.t <= 0) { s.phase = 0; s.next = every; }
    },
  };
}

/** 坠玉: 2 jade tiles (r 80) are marked 1.5 s, then fall for 5 × DMG(w); undodgeable; 嫦娥 floats over them. */
const jadefall: Behaviour<{ next: number }> = {
  start() { return { next: firstAt(HAZARDS.jadefall.every!) }; },
  tick(w, s, dt) {
    const H = HAZARDS.jadefall, p = H.p;
    s.next -= dt;
    if (s.next > 0) return;
    s.next = H.every!;
    const me = { x: w.player.x, y: w.player.y };
    for (let k = 0; k < p.n; k++) {
      const at = k === 0 ? openPoint(w, 20, me, 50) : openPoint(w, 20, me, 320);
      w.tele({
        shape: { kind: 'circle', x: at.x, y: at.y, r: p.r }, dur: H.tele!,
        then: (ww) => {
          ww.fx('jadeTile', at.x, at.y, { r: (32 * p.r) / 24, life: 0.5 });
          ww.fx('shockRing', at.x, at.y, { r: p.r, life: 0.3 });
          ww.fx('dustPuff', at.x, at.y, { r: 40, life: 0.3 });
          ww.sfx('hitMelee');
          if (!change(ww) && (ww.player.x - at.x) ** 2 + (ww.player.y - at.y) ** 2 <= (p.r + ww.player.r) ** 2) {
            hurtPlayer(ww, p.dmgX * core(ww).plan.dmgX, 'jadefall', { undodgeable: true });
          }
        },
      });
    }
  },
};

/** 月相: waves alternate full and dark; a 满月 wave gives +10 福缘 (every wave on the real 满月 day). */
const moonphase: Behaviour<null> = {
  start(w) {
    if (sky(w).fullWave) {
      w.buff('moonphase', { luck: HAZARDS.moonphase.p.luck }, 1e6);
      w.title(b('满月 · 福缘 +10', 'Full moon · 福缘 +10'), 'edge');
    } else w.title(b('月晦', 'Dark moon'), 'edge');
    return null;
  },
};

export const HAZARD_IMPLS: Partial<Record<HazardId, Behaviour>> = {
  moonglow: moonglow as Behaviour,
  ripple: ripple as Behaviour,
  inkrain: inkrain as Behaviour,
  gust: gustOf(HAZARDS.gust.every!, HAZARDS.gust.p.speed, HAZARDS.gust.p.dur, 0) as Behaviour,
  jadefall: jadefall as Behaviour,
  moonphase: moonphase as Behaviour,
};

// ═════════════════════════════════════════════ passives (the core does most; these are the rest)

/** 阴晴圆缺: on the real 满月 day she gets +10 福缘 (her cycle already starts full, in the core). */
const yinqing: Behaviour<null> = {
  start(w) {
    if (sky(w).fullMoonDay) {
      w.buff('fullMoonDay', { luck: 10 }, 1e6);
      if (w.wave === 1 || w.run.wave === 0) w.title(b('今夜满月', 'Tonight the moon is full'), 'edge');
    }
    return null;
  },
};
/** 愿者上钩 + 一网打尽: netted kills drop ×2 月华 (the second share, paid here). */
const yuanzhe: Behaviour<null> = {
  start() { return null; },
  on(w, _s, ev) {
    if (ev.type !== 'kill' || ev.e < 0) return;
    const sh = shared(w);
    const n = sh.nets.get(ev.e);
    if (!n) return;
    sh.nets.delete(ev.e);
    if (n.until >= w.t && n.cost > 0) dropMoon(w, ev.x, ev.y, n.cost);
  },
};
/** 九命: a word from the cat each time a life is spent. */
const jiuming: Behaviour<{ lives: number }> = {
  start(w) { return { lives: livesLeft(w) }; },
  tick(w, s) {
    const n = livesLeft(w);
    if (n < s.lives) {
      w.title(b(`喵！九命余 ${n}`, `Mrow! ${n} lives left`), 'edge');
      w.fx('petalBurst', w.player.x, w.player.y, { r: 60, life: 0.5 });
    }
    s.lives = n;
  },
};
/** 斗酒百篇: the first time 醉 fills in a wave, 醉仙. */
const baipian: Behaviour<{ full: boolean }> = {
  start() { return { full: false }; },
  tick(w, s) {
    const d = drunkNow(w);
    if (d >= 100 && !s.full) { s.full = true; w.title(b('醉仙', 'Drunken Immortal'), 'edge'); }
    else if (d < 80) s.full = false;
  },
};
export const PASSIVE_IMPLS: Partial<Record<PassiveId, Behaviour>> = {
  yinqing: yinqing as Behaviour, yuanzhe: yuanzhe as Behaviour, jiuming: jiuming as Behaviour, baipian: baipian as Behaviour,
};

// ═════════════════════════════════════════════ 镜蚀 (runtime)

/** Per-body flags for the world behaviours, in the last float of a body's content scratch. */
const FLAG = { revived: 1, split: 2, hasted: 4 } as const;
const flagOf = (w: WorldApi, h: number) => w.enemy(h).mem[7] | 0;
const setFlag = (w: WorldApi, h: number, f: number) => { const m = w.enemy(h).mem; m[7] = (m[7] | 0) | f; };
const fighting = (w: WorldApi, h: number) => { const e = w.enemy(h); return e.alive && (e.kind === 'mon' || e.kind === 'elite') && !shared(w).phantoms.has(h); };

/** 墨潮: the dead leave slowing ink (−30%, 3 s; double: −45%, 5 s). */
function mochao(): Behaviour<{ v: number; dur: number }> {
  return {
    start(w, x = 1) { const M = MUTATORS.mochao; return { v: strengthOf('mochao', x), dur: x >= 2 ? M.p.dur2 : M.p.dur }; },
    on(w, s, ev) {
      if (ev.type !== 'kill') return;
      const sh = shared(w);
      while (sh.puddles.length >= 24) w.endZone(sh.puddles.shift()!);
      const id = w.zone({ side: 'enemy', look: 'inkPuddle', x: ev.x, y: ev.y, r: MUTATORS.mochao.p.r, life: s.dur, slow: change(w) ? 0 : s.v });
      if (id >= 0) sh.puddles.push(id);
    },
  };
}
/** 回光: enemies heal 25% (double: 50%) once, when they fall to half HP. */
function huiguang(): Behaviour<{ v: number }> {
  return {
    start(w, x = 1) { return { v: strengthOf('huiguang', x) / 100 }; },
    on(w, s, ev) {
      if ((ev.type !== 'hit' && ev.type !== 'crit') || ev.e < 0 || !fighting(w, ev.e)) return;
      const e = w.enemy(ev.e);
      if (e.hp <= 0 || e.hp > e.hpMax * MUTATORS.huiguang.p.at || flagOf(w, ev.e) & FLAG.revived) return;
      setFlag(w, ev.e, FLAG.revived);
      e.hp = Math.min(e.hpMax, e.hp + e.hpMax * s.v);
      w.fx('levelRing', e.x, e.y, { r: e.r * 2, life: 0.4 });
    },
  };
}
/** 碎镜: every enemy splits once into 2 at 30% HP (double: at 50%). */
function suijing(): Behaviour<{ at: number }> {
  return {
    start(w, x = 1) { return { at: strengthOf('suijing', x) / 100 }; },
    on(w, s, ev) {
      if ((ev.type !== 'hit' && ev.type !== 'crit') || ev.e < 0 || !fighting(w, ev.e)) return;
      const e = w.enemy(ev.e);
      if (e.kind !== 'mon' || e.hp > e.hpMax * s.at || flagOf(w, ev.e) & FLAG.split) return;
      setFlag(w, ev.e, FLAG.split);
      const id = e.id, x = e.x, y = e.y, hpMax = e.hpMax, hp = e.hp;
      const kids = hp > 0 ? 1 : 2;
      const each = hp > 0 ? hp : (hpMax * s.at) / 2;
      for (let k = 0; k < kids; k++) {
        const a = w.rng() * TAU;
        const h = w.spawn(id as never, x + Math.cos(a) * 16, y + Math.sin(a) * 16, { noDrops: true, hpX: each / Math.max(1, hpMax) });
        if (h < 0) continue;
        setFlag(w, h, FLAG.split);
        const c = w.enemy(h);
        c.hp = Math.min(c.hp, each);
      }
      w.fx('inkBurst', x, y, { r: 18, life: 0.3 });
    },
  };
}
/** 暗月: vision limited to r 420 (double 320; 今日镜's half strength 520); telegraphs stay visible. */
function anyue(): Behaviour<{ prev: number | null }> {
  return {
    start(w, x = 1) {
      const v = MUTATORS.anyue.v;
      const r = x >= 2 ? v[1] : x < 1 ? v[0] + (1 - x) * 200 : v[0];
      const prev = lightNow(w);
      w.light(prev === null ? r : Math.min(prev, r));
      return { prev };
    },
    end(w, s) { w.light(s.prev); },
  };
}
/** 反照: enemy shooters fire +1 projectile (double +2; half strength: every other shot). */
function fanzhao(): Behaviour<{ n: number; acc: number }> {
  return {
    start(w, x = 1) { return { n: strengthOf('fanzhao', x), acc: 0 }; },
    tick(w, s) {
      freshCoreShots(w, (i) => {
        if (s.n < 1) { s.acc += s.n; if (s.acc < 1) return; s.acc -= 1; copyShot(w, i, 0.21); return; }
        copyShot(w, i, 0.21);
        if (s.n >= 2) copyShot(w, i, -0.21);
      });
    },
  };
}
export const MUTATOR_IMPLS: Partial<Record<MutatorId, Behaviour>> = {
  mochao: mochao() as Behaviour, huiguang: huiguang() as Behaviour, suijing: suijing() as Behaviour, anyue: anyue() as Behaviour,
  fanzhao: fanzhao() as Behaviour,
};

// ═════════════════════════════════════════════ 今日镜 · 节气 (runtime parts)

const T = (id: TermModId) => TERM_MODS[id].p;
/** Which weapon dealt a hit (by slot), or null. */
const weaponOf = (w: WorldApi, ev: GameEvent) => (ev.slot >= 0 && ev.slot < w.run.weapons.length ? w.run.weapons[ev.slot].id : null);
/**
 * A damage modifier on hits already dealt (the event carries the damage): `k(ev)` is the extra
 * fraction (+0.5 = 50% more, −0.5 = half) taken from or given back to the body's HP.
 */
function dmgMod(k: (w: WorldApi, ev: GameEvent) => number): Behaviour<null>['on'] {
  return (w, _s, ev) => {
    if ((ev.type !== 'hit' && ev.type !== 'crit') || ev.e < 0 || ev.dmg <= 0 || !w.alive(ev.e)) return;
    const x = k(w, ev);
    if (!x) return;
    const e = w.enemy(ev.e);
    if (e.kind === 'ally' || shared(w).phantoms.has(ev.e)) return;
    e.hp = x > 0 ? e.hp - ev.dmg * x : Math.min(e.hpMax, e.hp - ev.dmg * x);
  };
}
/** The burning share of a damage-over-time hit (burn vs bleed on that body). */
function burnShare(w: WorldApi, ev: GameEvent): number {
  if (ev.src !== 'status') return 0;
  const d = dotsOf(w, ev.e);
  return d.burn > 0 ? d.burn / (d.burn + d.bleed) : 0;
}
/** A title naming today's 节气 at the start of the day's first wave. */
function named(id: TermModId, more: Behaviour<unknown> = {}): Behaviour {
  const row = TERM_MOD_REG.find((r) => r.id === id)!;
  return {
    start(w, x) {
      if (w.wave === 1) w.title(b(`今日镜 · ${row.zh}`, `Today's mirror · ${row.en}`), 'edge');
      return more.start ? more.start(w, x) : null;
    },
    tick: more.tick, on: more.on, end: more.end,
  } as Behaviour;
}

/** 春分: enemies +20% speed in the first half of each wave; you deal +20% in the second. */
const chunfen: Behaviour<{ half: boolean }> = {
  start() { return { half: false }; },
  tick(w, s) {
    const L = waveLen(w) ?? 60;
    const t = waveTime(w);
    const p = T('chunfen');
    if (!s.half) {
      if (t < L / 2) {
        // haste new arrivals once
        const E = core(w).E;
        for (let i = 0; i < E.n; i++) {
          if (!E.alive[i] || E.hidden[i] || ((E.mem[i][7] | 0) & FLAG.hasted)) continue;
          E.mem[i][7] = (E.mem[i][7] | 0) | FLAG.hasted;
          E.speed[i] *= 1 + p.firstHalfSpd / 100;
        }
        return;
      }
      s.half = true;
      const E = core(w).E;
      for (let i = 0; i < E.n; i++) if (E.alive[i] && ((E.mem[i][7] | 0) & FLAG.hasted)) E.speed[i] /= 1 + p.firstHalfSpd / 100;
      w.buff('chunfen', { dmg: p.secondHalfDmg }, 1e6);
      w.title(b('春分 · 阴阳相半', 'Equinox · the balance turns'), 'edge');
    }
  },
};
/** 清明: drizzle puddles on every map. */
const qingming: Behaviour<{ next: number }> = {
  start() { return { next: 8 }; },
  tick(w, s, dt) { s.next -= dt; if (s.next <= 0) { s.next = 20; puddles(w, 3, 70, 1.0, 8, 20); } },
};
/** 芒种: 5% of kills sprout a healing flower (heals 3). */
const mangzhong: Behaviour<null> = {
  start() { return null; },
  on(w, _s, ev) {
    if (ev.type !== 'kill' || w.rng() >= T('mangzhong').flower) return;
    const x = ev.x, y = ev.y;
    w.zone({
      side: 'player', look: 'flowerbed', x, y, r: 18, life: 12, tick: 0.15,
      onTick: (ww, id) => {
        if ((ww.player.x - x) ** 2 + (ww.player.y - y) ** 2 > (24 + ww.player.r) ** 2) return;
        ww.heal(T('mangzhong').heal);
        ww.fx('petalBurst', x, y, { r: 30, life: 0.4 });
        ww.sfx('pickup');
        ww.endZone(id);
      },
    });
  },
};
/** 处暑: take −30% damage for the first 10 s of each wave. */
const chushu: Behaviour<null> = {
  start() { return null; },
  on(w, _s, ev) {
    const p = T('chushu');
    if (ev.type === 'hurt' && waveTime(w) < p.first && ev.dmg > 0) restoreHp(w, ev.dmg * p.dr / 100);
  },
};
/** 秋分: elites drop 2 镜奁. */
const qiufen: Behaviour<{ elites: Set<number> }> = {
  start() { return { elites: new Set() }; },
  on(w, s, ev) {
    if (ev.e < 0) return;
    if (ev.type === 'hit' || ev.type === 'crit') {
      const e = w.enemy(ev.e);
      if (e.kind === 'elite' && !shared(w).phantoms.has(ev.e) && !shared(w).copies.has(ev.e)) s.elites.add(ev.e);
    } else if (ev.type === 'kill' && s.elites.delete(ev.e)) {
      for (let k = 1; k < T('qiufen').eliteCrates; k++) addCrate(w, ev.x, ev.y);
    }
  },
};
/** 寒露: frost patches that slow whoever stands on them. */
const hanlu: Behaviour<null> = {
  start(w) {
    for (let k = 0; k < 5; k++) {
      const at = openPoint(w, 60);
      w.zone({ side: 'enemy', look: 'frostPatch', x: at.x, y: at.y, r: 90, life: 1e6, slow: change(w) ? 0 : 20 });
      w.zone({ side: 'player', look: 'frostPatch', x: at.x, y: at.y, r: 90, life: 1e6, slow: 30 });
    }
    return null;
  },
};
/** 小雪: enemy shots −20% speed. */
const xiaoxue: Behaviour<null> = {
  start() { return null; },
  tick(w) { freshCoreShots(w, (i) => scaleShot(w, i, 1 + T('xiaoxue').shotSpd / 100)); },
};
/** 大雪: vision r 520, drops ×1.25. */
const daxue: Behaviour<{ prev: number | null }> = {
  start(w) {
    const prev = lightNow(w);
    w.light(prev === null ? T('daxue').vision : Math.min(prev, T('daxue').vision));
    mods(w).moonPct += T('daxue').drops;
    return { prev };
  },
  end(w, s) { w.light(s.prev); },
};

export const TERM_IMPLS: Partial<Record<TermModId, Behaviour>> = {};
for (const r of TERM_MOD_REG) TERM_IMPLS[r.id] = named(r.id);
TERM_IMPLS.yushui = named('yushui', {
  on: dmgMod((w, ev) => {
    const burn = burnShare(w, ev);
    if (burn > 0) return (T('yushui').burn / 100) * burn;
    return weaponOf(w, ev) === 'thunder' ? T('yushui').lightning / 100 : 0;
  }),
});
TERM_IMPLS.jingzhe = named('jingzhe', { start: (w) => { mods(w).chainAdd += T('jingzhe').chains; return null; } });
TERM_IMPLS.chunfen = named('chunfen', chunfen as Behaviour<unknown>);
TERM_IMPLS.qingming = named('qingming', qingming as Behaviour<unknown>);
TERM_IMPLS.xiaoman = named('xiaoman', { start: (w) => { mods(w).moonPct += T('xiaoman').moon; return null; } });
TERM_IMPLS.mangzhong = named('mangzhong', mangzhong as Behaviour<unknown>);
TERM_IMPLS.dashu = named('dashu', { on: dmgMod((w, ev) => (T('dashu').burn / 100) * burnShare(w, ev)) });
TERM_IMPLS.liqiu = named('liqiu', gustOf(T('liqiu').gustEvery, 0, 0.3, T('liqiu').push) as Behaviour<unknown>);
TERM_IMPLS.chushu = named('chushu', chushu as Behaviour<unknown>);
TERM_IMPLS.qiufen = named('qiufen', qiufen as Behaviour<unknown>);
TERM_IMPLS.hanlu = named('hanlu', hanlu as Behaviour<unknown>);
TERM_IMPLS.xiaoxue = named('xiaoxue', xiaoxue as Behaviour<unknown>);
TERM_IMPLS.daxue = named('daxue', daxue as Behaviour<unknown>);
TERM_IMPLS.dongzhi = named('dongzhi', {
  on: dmgMod((w, ev) => { const id = weaponOf(w, ev); return id && WEAPONS[id].classes.includes('moon') ? T('dongzhi').moonWpn / 100 : 0; }),
});
TERM_IMPLS.xiaohan = named('xiaohan', {
  on: dmgMod((w, ev) => {
    const id = weaponOf(w, ev);
    if (id === 'fire' || id === 'gourd') return T('xiaohan').fire / 100;
    return (T('xiaohan').fire / 100) * burnShare(w, ev);
  }),
});

/** Content shots honour 小雪 too. */
export function shotSpeedX(w: WorldApi): number { return w.run.term === 'xiaoxue' ? 1 + T('xiaoxue').shotSpd / 100 : 1; }
