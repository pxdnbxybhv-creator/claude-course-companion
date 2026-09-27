// 水月幻镜 · the 13 镜技 (GDD §11.2). The core owns the cooldown, the 技 button and the aim input;
// each skill here gives its auto-target and, when cast, a SkillRun ticked until it returns false (the
// cooldown starts then). Every number comes from SKILLS[id].p. A skill changes how you move or
// where you stand: you pin, net, dash, pounce, root, lure or rise.
import type { SkillId, WeaponId } from '../../ids';
import type { GameEvent, HitPacket, SkillImpl, SkillRun, StatId, StatMods, Vec, WorldApi } from '../../types';
import { WEAPONS } from '../../data';
import { charMult, luckMult, rawDamage } from '../../logic/formulas';
import { costOf, fxLine, fxSprite, restoreHp, setMoon } from './bridge';
import { CoRun, DEG, TAU, angDiff, shared, type Co } from './util';

/** A skill as a coroutine: `body` yields seconds; `on` sees combat events while it runs. */
function coSkill(w0: WorldApi, body: (c: { w: WorldApi }) => Co, o: { on?: (w: WorldApi, ev: GameEvent) => void; end?: (w: WorldApi) => void } = {}): SkillRun {
  const c = { w: w0 };
  const run = new CoRun(body(c));
  return {
    tick(w, dt) { c.w = w; return run.tick(dt); },
    on: o.on ? (w, ev) => o.on!(w, ev) : undefined,
    end(w) { c.w = w; run.stop(); o.end?.(w); },
  };
}
const vec = (x: number, y: number): Vec => ({ x, y });
/** The densest cluster within reach, as a fresh vector (densest() hands back a shared one). */
function cluster(w: WorldApi, reach: number, r: number): Vec | null {
  const v = w.densest(w.player.x, w.player.y, reach, r);
  return v ? vec(v.x, v.y) : null;
}
/** A manual aim point, pulled back to the skill's reach. */
function within(w: WorldApi, at: Vec, reach: number): Vec {
  const dx = at.x - w.player.x, dy = at.y - w.player.y, d = Math.hypot(dx, dy);
  if (d <= reach || d < 1) return vec(at.x, at.y);
  return vec(w.player.x + (dx / d) * reach, w.player.y + (dy / d) * reach);
}
/** The largest flat damage stat (书生's 一字千钧 scales on it). */
function bestStat(w: WorldApi): StatId {
  const s = w.stats;
  let best: StatId = 'melee', v = s.melee;
  for (const k of ['ranged', 'elem', 'spirit'] as const) if (s[k] > v) { v = s[k]; best = k; }
  return best;
}
/** One weapon's hit before the global 伤害% (raw × companion multiplier). */
function weaponBase(w: WorldApi, id: WeaponId, t: 1 | 2 | 3 | 4): number {
  return rawDamage(WEAPONS[id], t, w.stats as never) * charMult(w.run, WEAPONS[id]);
}
const hit = (base: number, scale: StatMods | undefined, extra: Partial<HitPacket> = {}): HitPacket => ({ base, scale, src: 'skill', ...extra });
function handles(w: WorldApi, x: number, y: number, r: number, f: Parameters<WorldApi['query']>[4] = 'any'): number[] {
  const out: number[] = [];
  w.query(x, y, r, out, f);
  return out;
}
/** A boss's decoy (mirage, illusion, false moon, tree): never captured, converted, charmed or dragged. */
const decoy = (w: WorldApi, h: number) => shared(w).phantoms.has(h);

// ─────────────────────────────────────────────── 书生 · 一字千钧 (镇)
const yizi: SkillImpl = {
  target: (w, def) => cluster(w, def.reach ?? 420, def.p.r),
  cast(w0, def, at0) {
    const p = def.p, at = within(w0, at0, def.reach ?? 420);
    return coSkill(w0, function* (c) {
      // the glyph brushes itself in over 0.35 s, then strikes and lingers 5 s
      const zone = c.w.zone({ side: 'player', look: 'zhenGlyph', x: at.x, y: at.y, r: p.r, life: p.draw + p.zone });
      void zone;
      c.w.fx('inkBurst', at.x, at.y, { r: p.r * 0.5, life: p.draw });
      yield p.draw;
      const w = c.w;
      w.hitArea(at.x, at.y, p.r, hit(p.base, { [bestStat(w)]: p.k }, { knock: 30 }));
      w.fx('shockRing', at.x, at.y, { r: p.r, life: 0.4 });
      w.shake(5);
      w.sfx('bossDrum');
      // the lingering 镇: slow 40%, and +20% damage taken from every source
      w.zone({
        side: 'player', look: 'zhenGlyph', x: at.x, y: at.y, r: p.r, life: p.zone, slow: p.slow, tick: 0.25,
        onTick: (ww) => { for (const h of handles(ww, at.x, at.y, p.r)) ww.status(h, 'vuln', 0.35, p.amp); },
      });
    });
  },
};

// ─────────────────────────────────────────────── 园丁 · 满园春色 (花)
const manyuan: SkillImpl = {
  target: () => null,
  cast(w0, def) {
    const p = def.p;
    const x = w0.player.x, y = w0.player.y;
    const sh = shared(w0);
    // at most 2 beds: a third replaces the oldest
    while (sh.beds.length >= p.max) { const old = sh.beds.shift()!; w0.endZone(old); }
    const id = w0.zone({
      side: 'player', look: 'flowerbed', x, y, r: p.r, life: p.life, slow: p.slow, tick: p.tick,
      onTick: (w) => {
        const hs = handles(w, x, y, p.r);
        // petals strike up to 4 foes inside
        for (let k = 0; k < Math.min(p.n, hs.length); k++) {
          const j = k + Math.floor(w.rng() * (hs.length - k));
          const h = hs[j]; hs[j] = hs[k]; hs[k] = h;
          const e = w.enemy(h);
          const ex = e.x, ey = e.y;
          w.hit(h, hit(p.base, { spirit: p.kSpirit, regen: p.kRegen }, { proc: 0.6 }));
          w.fx('petalBurst', ex, ey, { r: 28, life: 0.35 });
        }
        // you regenerate inside
        if ((w.player.x - x) ** 2 + (w.player.y - y) ** 2 <= p.r * p.r) w.heal(p.hps * p.tick);
      },
    });
    if (id >= 0) sh.beds.push(id);
    w0.fx('petalBurst', x, y, { r: 60, life: 0.5 });
    w0.sfx('summon');
    return { tick: () => false };
  },
};

// ─────────────────────────────────────────────── 渔翁 · 一网打尽 (网)
const yiwang: SkillImpl = {
  target: (w, def) => cluster(w, def.reach ?? 380, def.p.r),
  cast(w, def, at0) {
    const p = def.p, at = within(w, at0, def.reach ?? 380);
    const sh = shared(w);
    w.zone({ side: 'player', look: 'netMesh', x: at.x, y: at.y, r: p.r, life: p.root });
    for (const h of handles(w, at.x, at.y, p.r)) {
      const e = w.enemy(h);
      if (e.kind !== 'boss') {
        const d = Math.hypot(e.x - at.x, e.y - at.y);
        if (d > 4) w.pull(h, at.x, at.y, d);
        w.status(h, 'root', p.root); // elites take half (the core's rule)
      }
      w.status(h, 'vuln', p.ampDur, p.amp);
      // netted kills drop ×2 月华 (the fisher's passive pays the second share)
      if (e.kind === 'mon') sh.nets.set(h, { until: w.t + p.ampDur, cost: costOf(w, h) * (p.moonX - 1) });
    }
    w.attract(at.x, at.y, p.attract);
    w.fx('shockRing', at.x, at.y, { r: p.r, life: 0.35 });
    w.sfx('reroll');
    return { tick: () => false };
  },
};

// ─────────────────────────────────────────────── 琴师 · 广陵散 (琴)
const guangling: SkillImpl = {
  target: () => null,
  cast(w0, def) {
    const p = def.p;
    w0.buff('guangling', {}, p.dur, p.move);
    w0.sfx('bell');
    return coSkill(w0, function* (c) {
      let t = 0, charmT = 0;
      while (t < p.dur) {
        const w = c.w;
        if (w.beat) {
          const x = w.player.x, y = w.player.y;
          w.hitArea(x, y, p.r, hit(p.base, { elem: p.k }, { status: { kind: 'slow', dur: 0.6, v: p.slow }, proc: 0.6 }));
          w.fx('pulseRing', x, y, { r: p.r, life: 0.45 });
        }
        charmT += w.dt;
        if (charmT >= 1) {
          // each second, every non-elite in range may become a 知音 for 6 s
          charmT -= 1;
          const chance = p.charm * luckMult(w.stats.luck);
          for (const h of handles(w, w.player.x, w.player.y, p.r, 'normal')) if (!decoy(w, h) && w.rng() < chance) w.status(h, 'charm', p.charmDur);
        }
        t += w.dt;
        yield 0;
      }
    });
  },
};

// ─────────────────────────────────────────────── 侠客 · 一剑光寒 (剑)
/** Your flying swords: the streak's summed hit and how many blades you own. */
function swordHits(w: WorldApi): { sum: number; n: number } {
  let sum = 0, n = 0;
  const extra = Math.max(0, Math.round(w.stats.swords));
  for (const o of w.run.weapons) {
    const def = WEAPONS[o.id];
    if (!def.classes.includes('flying')) continue;
    const hitI = weaponBase(w, o.id, o.t);
    const perTier = (v: unknown, dflt: number) => Array.isArray(v) ? v[o.t - 1] as number : typeof v === 'number' ? v : dflt;
    if (def.kind === 'orbit') { const k = perTier(def.p.blades, 2) + extra; sum += hitI * k; n += k; }
    else if (def.kind === 'rain') { const k = perTier(def.p.n, 3) + extra; sum += hitI * k; n += k; }
    else { sum += hitI * (1 + 0.4 * extra); n += 1 + extra; }
  }
  return { sum, n };
}
const yijian: SkillImpl = {
  target: () => null,
  cast(w0, def, _at, dir) {
    const p = def.p;
    const sx = w0.player.x, sy = w0.player.y;
    const d = Math.hypot(dir.x, dir.y) || 1;
    const dx = dir.x / d, dy = dir.y / d;
    const dur = 0.22;
    w0.dash(dx, dy, p.len, dur, p.iframe);
    w0.sfx('hitShot');
    let killed = false;
    const sw = swordHits(w0);
    return coSkill(w0, function* (c) {
      yield dur;
      const w = c.w;
      // every sword streaks along the path you cut
      const ex = w.player.x, ey = w.player.y, len = Math.hypot(ex - sx, ey - sy), ang = Math.atan2(ey - sy, ex - sx);
      const pk = sw.n > 0 ? hit(sw.sum * p.streak, undefined, { knock: 20 }) : hit(10 * p.streak, { ranged: p.streak }, { knock: 20 });
      w.hitLine(sx, sy, ang, Math.max(40, len), 56, pk);
      const nS = Math.max(1, Math.min(6, sw.n));
      for (let k = 0; k < nS; k++) { const o = (k - (nS - 1) / 2) * 9; fxLine(w, 'swordStreak', sx - dy * o, sy + dx * o, ang, Math.max(40, len), 0.45, 1.8); }
      w.fx('critSpark', ex, ey, { r: 40, life: 0.3 });
      // then the orbiting swords spin fast for 3 s, 40% on contact
      if (sw.n > 0) {
        const per = (sw.sum / sw.n) * p.spin;
        w.zone({
          side: 'player', look: 'pulseRing', x: ex, y: ey, r: 110, life: p.spinDur, follow: 'player', tick: 0.5,
          onTick: (ww) => {
            ww.hitArea(ww.player.x, ww.player.y, 110, hit(per, undefined, { proc: 0.3 }));
            const a0 = ww.t * 9;
            for (let k = 0; k < 3; k++) fxLine(ww, 'swordStreak', ww.player.x + Math.cos(a0 + k * 2.1) * 95, ww.player.y + Math.sin(a0 + k * 2.1) * 95, a0 + k * 2.1 + Math.PI / 2, 40, 0.25, 1);
          },
        });
      }
    }, {
      on: (_w, ev) => { if (ev.type === 'kill' && ev.src === 'skill') killed = true; },
      // a kill by the streak refunds 1 s (after the core has set the cooldown)
      end: (w) => { if (killed) w.after(0.02, (ww) => ww.refundSkill(p.refund)); },
    });
  },
};

// ─────────────────────────────────────────────── 道童 · 急急如律令 (符)
const jiji: SkillImpl = {
  target: (w, def) => cluster(w, def.reach ?? 420, def.p.r),
  cast(w0, def, at0) {
    const p = def.p, at = within(w0, at0, def.reach ?? 420);
    w0.zone({ side: 'player', look: 'vortex', x: at.x, y: at.y, r: p.r, life: p.dur });
    w0.sfx('hitTalisman');
    return coSkill(w0, function* (c) {
      let t = 0, tick = 0;
      while (t < p.dur) {
        const w = c.w, dt = w.dt;
        // the vortex pulls non-bosses in (elites at half strength)
        for (const h of handles(w, at.x, at.y, p.r * 1.25)) {
          const e = w.enemy(h);
          if (e.kind === 'boss' || decoy(w, h)) continue;
          const dx = at.x - e.x, dy = at.y - e.y, d = Math.hypot(dx, dy);
          if (d < 12) continue;
          const v = 110 * (e.kind === 'elite' ? p.pullElite : 1) * dt;
          e.x += (dx / d) * Math.min(v, d - 10); e.y += (dy / d) * Math.min(v, d - 10);
        }
        tick -= dt;
        if (tick <= 0) {
          tick += p.tick;
          const hs = handles(w, at.x, at.y, p.r);
          for (let k = 0; k < Math.min(p.n, hs.length); k++) {
            const h = hs[Math.floor(w.rng() * hs.length)];
            const e = w.enemy(h);
            const ex = e.x, ey = e.y;
            w.hit(h, hit(p.base, { elem: p.k }, { status: { kind: 'burn', dur: 3, v: 3 + 0.5 * Math.max(0, w.stats.elem) }, proc: 0.6 }));
            w.fx('lightningStrike', ex, ey, { r: 30, life: 0.3 });
          }
          if (hs.length) w.sfx('hitTalisman');
        }
        t += dt;
        yield 0;
      }
    });
  },
};

// ─────────────────────────────────────────────── 画师 · 点化 (笔)
/**
 * 点化's auto-aim: the arc direction that catches the most, wherever you happen to be walking (a
 * kiting player faces away from the crowd). Scores each enemy's bearing: non-elites it would turn
 * (up to n) count 1, elites and bosses (60 + 200% 造化) 1.5, a nearer pick breaks ties. Nothing
 * within reach: null, and the core falls back to your facing.
 */
function bestArc(w: WorldApi, reach: number, deg: number, n: number): Vec | null {
  const x = w.player.x, y = w.player.y, half = (deg / 2) * DEG;
  const mons = handles(w, x, y, reach, 'normal').filter((h) => !decoy(w, h));
  const bigs = handles(w, x, y, reach, 'eliteOrBoss');
  if (!mons.length && !bigs.length) return null;
  const pts = (hs: number[]) => hs.map((h) => { const e = w.enemy(h); return { a: Math.atan2(e.y - y, e.x - x), d: Math.hypot(e.x - x, e.y - y), r: e.r }; });
  const small = pts(mons), big = pts(bigs);
  const inArc = (p: { a: number; d: number; r: number }, dir: number) => p.d < p.r + 4 || Math.abs(angDiff(p.a, dir)) <= half + Math.asin(Math.min(1, p.r / Math.max(1, p.d)));
  let best = -1, bestDir = 0, bestD = Infinity;
  for (const c of small.length ? small : big) {
    let s = 0, b = 0;
    for (const p of small) if (inArc(p, c.a)) s++;
    for (const p of big) if (inArc(p, c.a)) b++;
    const score = Math.min(n, s) + 1.5 * b;
    if (score > best || (score === best && c.d < bestD)) { best = score; bestDir = c.a; bestD = c.d; }
  }
  return vec(x + Math.cos(bestDir) * 100, y + Math.sin(bestDir) * 100);
}

const dianhua: SkillImpl = {
  // auto: the arc that turns the most (bestArc), else your facing; or wherever you drag it
  target: (w, def) => bestArc(w, def.reach ?? def.p.r, def.p.deg, def.p.n),
  cast(w, def, at) {
    const p = def.p;
    const x = w.player.x, y = w.player.y;
    const dir = Math.atan2(at.y - y, at.x - x);
    const half = (p.deg / 2) * DEG;
    const inArc = (h: number) => {
      const e = w.enemy(h);
      const d = Math.hypot(e.x - x, e.y - y);
      return d < e.r + 4 || Math.abs(angDiff(Math.atan2(e.y - y, e.x - x), dir)) <= half + Math.asin(Math.min(1, e.r / Math.max(1, d)));
    };
    // the nearest non-elites in the arc turn to ink allies for 10 s
    const mons = handles(w, x, y, p.r, 'normal').filter((h) => !decoy(w, h) && inArc(h));
    mons.sort((a, c) => { const ea = w.enemy(a), da = (ea.x - x) ** 2 + (ea.y - y) ** 2; const ec = w.enemy(c); return da - ((ec.x - x) ** 2 + (ec.y - y) ** 2); });
    for (const h of mons.slice(0, p.n)) {
      const e = w.enemy(h);
      w.fx('inkBurst', e.x, e.y, { r: 20, life: 0.35 });
      w.convert(h, p.dur);
    }
    // elites and bosses in the arc take 60 + 200% 造化 instead
    w.hitCone(x, y, dir, p.r, p.deg, hit(p.eliteBase, { spirit: p.eliteK }, { knock: 20 }), 'eliteOrBoss');
    w.fx('slashArc', x + Math.cos(dir) * 60, y + Math.sin(dir) * 60, { r: p.r * 0.7, dir, life: 0.4 });
    fxLine(w, 'swordStreak', x, y, dir - half * 0.7, p.r, 0.35, 1);
    fxLine(w, 'swordStreak', x, y, dir + half * 0.7, p.r, 0.35, 1);
    w.sfx('summon');
    return { tick: () => false };
  },
};

// ─────────────────────────────────────────────── 棋士 · 围 (弈)
const wei: SkillImpl = {
  target: () => null,
  cast(w0, def) {
    const p = def.p;
    const cx = w0.player.x, cy = w0.player.y;
    w0.sfx('merge');
    return coSkill(w0, function* (c) {
      // eight stones drop in a ring and close in over 1 s, dragging what is inside with them
      let t = 0;
      while (t < p.close) {
        const w = c.w, k = t / p.close, R = p.r * (1 - 0.45 * k);
        if (Math.floor(t / w.dt) % 2 === 0) for (let s = 0; s < 8; s++) {
          const a = (s / 8) * TAU + k * 0.8;
          w.fx(s % 2 ? 'stoneWhite' : 'stoneBlack', cx + Math.cos(a) * R, cy + Math.sin(a) * R, { r: 40, life: w.dt * 2.2 });
        }
        for (const h of handles(w, cx, cy, p.r)) {
          const e = w.enemy(h);
          if (e.kind !== 'mon' || decoy(w, h)) continue;
          const d = Math.hypot(e.x - cx, e.y - cy);
          if (d > R - 10) { e.x += ((cx - e.x) / d) * (d - R + 10); e.y += ((cy - e.y) / d) * (d - R + 10); }
        }
        t += w.dt;
        yield 0;
      }
      const w = c.w;
      // 提: up to 30 non-elites still inside are captured (killed, with normal drops)
      const inside = handles(w, cx, cy, p.r, 'normal');
      inside.sort((a, b2) => { const ea = w.enemy(a), da = (ea.x - cx) ** 2 + (ea.y - cy) ** 2; const eb = w.enemy(b2); return da - ((eb.x - cx) ** 2 + (eb.y - cy) ** 2); });
      let n = 0;
      for (const h of inside) {
        if (n >= p.cap) break;
        if (!w.alive(h)) continue;
        // a decoy takes a plain hit (its own rules: a mirage pops after 3, a false moon ripples)
        if (decoy(w, h)) { w.hit(h, hit(1, undefined, { crit: false })); continue; }
        const e = w.enemy(h);
        w.fx('inkBurst', e.x, e.y, { r: 22, life: 0.4 });
        w.kill(h, true);
        n++;
      }
      // elites and bosses lose 8% of their current HP (≤ 60 × wave) and elites are stunned
      for (const h of handles(w, cx, cy, p.r, 'eliteOrBoss')) {
        const e = w.enemy(h);
        const dmg = Math.min(e.hp * p.elitePct / 100, p.capW * w.wave);
        w.hit(h, hit(dmg, undefined, { noArmor: true, crit: false }));
        if (w.alive(h)) w.status(h, 'stun', p.stun);
      }
      w.fx('shockRing', cx, cy, { r: p.r * 0.6, life: 0.4 });
      if (n >= 6) w.title({ zh: '提子', en: 'Captured' }, 'edge');
      w.sfx(n ? 'kill' : 'merge');
      w.shake(3);
    });
  },
};

// ─────────────────────────────────────────────── 大橘 · 扑蝶 (喵)
const pudie: SkillImpl = {
  target(w, def) {
    const h = w.strongest(w.player.x, w.player.y, def.reach ?? 340);
    if (h < 0) return null;
    const e = w.enemy(h);
    return vec(e.x, e.y);
  },
  cast(w0, def, at0, dir) {
    const p = def.p, reach = def.reach ?? 340;
    let to = within(w0, at0, reach);
    // a manual aim near a foe snaps onto it
    const snap = w0.strongest(to.x, to.y, 90);
    if (snap >= 0) { const e = w0.enemy(snap); to = vec(e.x, e.y); }
    else if (Math.hypot(to.x - w0.player.x, to.y - w0.player.y) < 30) to = vec(w0.player.x + dir.x * 200, w0.player.y + dir.y * 200);
    w0.leap(to, p.air, true);
    w0.sfx('dodge');
    let killed = false, landed = false;
    return coSkill(w0, function* (c) {
      yield p.air;
      const w = c.w, x = w.player.x, y = w.player.y;
      landed = true;
      w.hitArea(x, y, p.r, hit(p.base, { melee: p.k }, { status: { kind: 'stun', dur: p.stun }, knock: 40 }));
      w.fx('shockRing', x, y, { r: p.r, life: 0.3 });
      w.fx('dustPuff', x, y, { r: 30, life: 0.3 });
      w.shake(3);
      w.sfx('hitMelee');
    }, {
      // only the landing's own kills count (weapons firing through the leap don't chain it)
      on: (_w, ev) => { if (ev.type === 'kill' && ev.src === 'skill' && landed) killed = true; },
      // a kill resets the cooldown
      end: (w) => { if (killed && p.reset) w.after(0.02, (ww) => ww.refundSkill(99)); },
    });
  },
};

// ─────────────────────────────────────────────── 玉兔 · 玉杵捣药 (月)
const daoyao: SkillImpl = {
  target: () => null,
  cast(w0, def) {
    const p = def.p;
    w0.root(p.root);
    return coSkill(w0, function* (c) {
      const step = p.root / p.pounds;
      for (let k = 0; k < p.pounds; k++) {
        yield step * 0.75;
        const w = c.w, x = w.player.x, y = w.player.y;
        w.hitArea(x, y, p.r, hit(p.base + p.kHp * w.player.hpMax, { regen: p.kRegen }, { knock: p.knock }));
        w.fx('shockRing', x, y, { r: p.r, life: 0.35 });
        w.shake(2);
        w.sfx('bossDrum');
        yield step * 0.25;
      }
      // the elixir: heal 15% of max HP, +20% 伤害 for 6 s
      const w = c.w;
      w.heal(w.player.hpMax * p.heal);
      w.buff('daoyao', { dmg: p.buff }, p.buffDur);
      w.fx('shieldBubble', w.player.x, w.player.y, { r: 30, life: 0.6 });
      w.sfx('levelUp');
    }, {
      // rooted, you take half damage
      on: (w, ev) => { if (ev.type === 'hurt' && ev.dmg > 0) restoreHp(w, ev.dmg * p.dr / 100); },
    });
  },
};

// ─────────────────────────────────────────────── 诗仙 · 举杯邀明月 (酒)
const yaoyue: SkillImpl = {
  target: () => null,
  cast(w0, def) {
    const p = def.p;
    w0.addDrunk(p.drunk);
    w0.buff('yaoyue', { crit: p.crit }, p.dur);
    w0.title({ zh: '举杯邀明月', en: 'A cup to the moon' }, 'edge');
    w0.sfx('bell');
    let glyphs = 0, winT = 0;
    const verse = (w: WorldApi, h0: number) => {
      // a seeking verse glyph, chaining to 2 more foes
      let h = h0;
      const seen: number[] = [];
      let px = w.player.x, py = w.player.y;
      for (let k = 0; k <= p.chain && h >= 0; k++) {
        const e = w.enemy(h);
        const ex = e.x, ey = e.y;
        fxLine(w, 'boltChain', px, py, Math.atan2(ey - py, ex - px), Math.hypot(ex - px, ey - py), 0.25, 0.7);
        fxSprite(w, 'proj:verseGlyph', ex, ey - 10, 22, 0.35);
        w.hit(h, hit(p.base, { ranged: p.k }, { crit: false, proc: 0.3 }));
        seen.push(h);
        px = ex; py = ey;
        const out: number[] = [];
        w.query(ex, ey, 220, out);
        h = -1;
        for (const q of out) if (!seen.includes(q)) { h = q; break; }
      }
    };
    return coSkill(w0, function* (c) {
      let t = 0;
      while (t < p.dur) { t += c.w.dt; winT += c.w.dt; if (winT >= 1) { winT -= 1; glyphs = 0; } yield 0; }
      // then 2 s of 宿醉
      c.w.buff('hangover', { speed: -p.hangSlow }, p.hang);
    }, {
      on: (w, ev) => {
        if (ev.type !== 'crit' || ev.src === 'skill' || ev.e < 0 || glyphs >= 8 || !w.alive(ev.e)) return;
        glyphs++;
        verse(w, ev.e);
      },
    });
  },
};

// ─────────────────────────────────────────────── 关公 · 拖刀计 (刀)
const tuodao: SkillImpl = {
  target: () => null,
  cast(w0, def, _at, dir) {
    const p = def.p;
    // the feigned retreat: backward from the way you face (or aim), then turn and sweep
    const dx = -dir.x, dy = -dir.y;
    const d = Math.hypot(dx, dy) || 1;
    w0.dash(dx / d, dy / d, p.back, 0.2, p.iframe);
    // the best 重器 you hold
    let best = 0;
    for (const o of w0.run.weapons) if (WEAPONS[o.id].classes.includes('heavy')) best = Math.max(best, weaponBase(w0, o.id, o.t));
    return coSkill(w0, function* (c) {
      yield 0.22;
      const w = c.w, x = w.player.x, y = w.player.y;
      w.hitArea(x, y, p.r, hit(p.kWeapon * best, { melee: p.kMelee }, { knock: p.knock, status: { kind: 'stun', dur: p.stun } }));
      for (let k = 0; k < 4; k++) w.fx('slashArc', x + Math.cos(k * TAU / 4) * 120, y + Math.sin(k * TAU / 4) * 120, { r: 110, dir: k * TAU / 4 + Math.PI / 2, life: 0.35 });
      w.fx('shockRing', x, y, { r: p.r, life: 0.4 });
      w.shake(6);
      w.sfx('hitMelee');
      w.sfx('bossDrum');
    });
  },
};

// ─────────────────────────────────────────────── 嫦娥 · 广寒清辉 (奔)
const qinghui: SkillImpl = {
  target: () => null,
  cast(w0, def) {
    const p = def.p;
    let range = 0;
    for (const o of w0.run.weapons) range = Math.max(range, WEAPONS[o.id].range);
    w0.untargetable(p.rise);
    w0.buff('qinghui', { range: Math.round((range || 400) * p.range / 100) }, p.rise, p.move);
    w0.sfx('ritualGlint');
    return coSkill(w0, function* (c) {
      let t = 0;
      while (t < p.rise) {
        const w = c.w;
        if (Math.floor(t * 4) !== Math.floor((t + w.dt) * 4)) w.fx('moonCircle', w.player.x, w.player.y, { r: 26, life: 0.4 });
        t += w.dt;
        yield 0;
      }
      // she lands in a moonlight pool: impact, then −30% damage and 20% slower for foes inside, +5 回气 for her
      const w = c.w, x = w.player.x, y = w.player.y;
      w.hitArea(x, y, p.r, hit(p.base, { elem: p.k }, { knock: 30 }));
      w.fx('shockRing', x, y, { r: p.r, life: 0.4 });
      shared(w).pools.push({ x, y, r: p.r, until: w.t + p.pool, dr: p.poolDr / 100 });
      w.zone({
        side: 'player', look: 'moonPool', x, y, r: p.r, life: p.pool, slow: p.poolSlow, tick: 0.25,
        onTick: (ww) => { if ((ww.player.x - x) ** 2 + (ww.player.y - y) ** 2 <= p.r * p.r) ww.buff('moonpool', { regen: p.poolRegen }, 0.3); },
      });
      setMoon(w, 0);
      w.shake(3);
      w.sfx('bell');
    });
  },
};

export const SKILL_IMPLS: Partial<Record<SkillId, SkillImpl>> = {
  yizi, manyuan, yiwang, guangling, yijian, jiji, dianhua, wei, pudie, daoyao, yaoyue, tuodao, qinghui,
};
