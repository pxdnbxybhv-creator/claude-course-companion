// 水月幻镜 · enemy AI (GDD §13, §24.5): the 8 shared behaviours (chase, dash, keep-distance, orbit,
// hop, burrow/submerge, stationary, formation) combined per monster role, with wet-ink tells, enemy
// shots, statuses and DoT, knockback, soft separation (≤ 6 neighbours) and contact damage both ways.
// Elites, treasures and bosses are driven by engine/content when it registers them; the fallbacks
// here keep a wave playable before it does.
import type { TeleShape } from '../types';
import { BOSSES, F, MONSTERS, TREASURES } from '../data';
import { clamp } from '../logic/formulas';
import { BLEED_MAX, BURN_MAX, EKind } from './pools';
import { DK, HF, ROLE, SRCI, STI, TAG_BIT, TAU, TC, ZC, angDiff, segDist2 } from './consts';
import type { World } from './world';

/** Enemy states. */
export const ST = { bloom: 0, move: 1, tell: 2, act: 3, rest: 4, under: 5, air: 6, dying: 7 } as const;

/** Set up a freshly spawned body: the bloom (hidden until it lands) and role state. */
export function initEnemy(W: World, i: number, bloom: number): void {
  const E = W.E;
  E.face[i] = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
  E.cool[i] = 0.5 + W.erng() * 1.5;
  if (bloom > 0) {
    E.st[i] = ST.bloom; E.stT[i] = bloom; E.hidden[i] = 1; E.untarget[i] = 1; E.invuln[i] = 1;
  } else E.st[i] = ST.move;
  const id = E.id[i];
  const k = E.kind[i];
  if (k === EKind.Mon) {
    const m = MONSTERS[id as keyof typeof MONSTERS];
    const role = m.role;
    if (role === 'ambusher' && id === 'weed') { E.x[i] = W.px; E.y[i] = W.py; if (E.st[i] === ST.bloom) E.stT[i] = m.p.tell ?? 0.9; }
    if (role === 'ambusher' && id === 'stick') {
      // hides in a bamboo clump
      const obs = W.arena.obstacles;
      if (obs.length) { const o = obs[Math.floor(W.erng() * obs.length)]; E.x[i] = o.x; E.y[i] = o.y; }
      E.st[i] = ST.under; E.hidden[i] = 1; E.untarget[i] = 1; E.invuln[i] = 1; E.stT[i] = 0;
    }
    if (role === 'turret') {
      const obs = W.arena.obstacles;
      if (obs.length) {
        const o = obs[Math.floor(W.erng() * obs.length)];
        const a = W.erng() * TAU;
        E.x[i] = o.x + Math.cos(a) * (o.r + E.r[i] + 4); E.y[i] = o.y + Math.sin(a) * (o.r + E.r[i] + 4);
      }
    }
    if (role === 'diver') {
      // lands at the edge
      const a = W.erng() * TAU;
      const R = Math.min(W.arena.maxX, W.arena.maxY) - 40;
      E.x[i] = Math.cos(a) * R; E.y[i] = Math.sin(a) * R;
    }
    if (role === 'swarm' && m.ai === 'burrow') { E.untarget[i] = 1; }
    if (id !== 'stick') E.a[i] = W.erng() * TAU;
  }
  if (k === EKind.Treasure) E.stT[i] = Math.max(E.stT[i], 0.1);
}

// ─────────────────────────────────────────────────────────────── helpers

function steer(W: World, i: number, tx: number, ty: number, speed: number): void {
  const E = W.E;
  const dx = tx - E.x[i], dy = ty - E.y[i], d = Math.hypot(dx, dy);
  if (d < 1) { E.vx[i] = 0; E.vy[i] = 0; return; }
  E.vx[i] = (dx / d) * speed; E.vy[i] = (dy / d) * speed;
}
/** Keep `dist` away from the target: close in, back off, strafe a little. */
function keep(W: World, i: number, tx: number, ty: number, dist: number, speed: number): void {
  const E = W.E;
  const dx = tx - E.x[i], dy = ty - E.y[i], d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const radial = d > dist + 30 ? 1 : d < dist - 30 ? -1 : 0;
  const side = Math.sin(E.age[i] * 0.7 + i) * 0.6;
  E.vx[i] = (ux * radial - uy * side) * speed;
  E.vy[i] = (uy * radial + ux * side) * speed;
}
function orbit(W: World, i: number, cx: number, cy: number, R: number, speed: number, dir: number): void {
  const E = W.E;
  const dx = E.x[i] - cx, dy = E.y[i] - cy, d = Math.hypot(dx, dy) || 1;
  const tx = -dy / d * dir, ty = dx / d * dir;
  const pull = clamp((R - d) / 60, -1, 1);
  E.vx[i] = (tx + (dx / d) * pull) * speed;
  E.vy[i] = (ty + (dy / d) * pull) * speed;
}
const shape = <T extends TeleShape>(s: T) => s;

/** The movement target of body i: the player, or a 墨宝 (hunters first; any within 60 u draws aggro). */
function targetOf(W: World, i: number): number {
  const E = W.E, S = W.S;
  if (!S.count) return -1;
  const hunter = (E.tags[i] & TAG_BIT.hunter) !== 0;
  let best = -1, bd = hunter ? Infinity : F.summon.decoyR * F.summon.decoyR;
  for (let s = 0; s < S.n; s++) {
    if (!S.alive[s] || !S.capped[s]) continue;
    const dx = S.x[s] - E.x[i], dy = S.y[s] - E.y[i], d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────── the tick

const ENEMY_SEP = 6;

export function tickEnemies(W: World, dt: number): void {
  const E = W.E;
  const playerR = W.pr;
  for (let i = 0; i < E.n; i++) {
    if (!E.alive[i]) continue;
    W.cur = i; W.curWhat = 'enemy';
    E.age[i] += dt;
    if (E.flash[i] > 0) E.flash[i] -= dt;
    if (E.contactT[i] > 0) E.contactT[i] -= dt;
    // bloom: hidden until it lands; waits while you stand on it
    if (E.st[i] === ST.bloom) {
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) {
        const near = Math.hypot(W.px - E.x[i], W.py - E.y[i]) < 120 && E.id[i] !== 'weed';
        if (!near) {
          E.hidden[i] = 0; E.untarget[i] = 0; E.invuln[i] = 0;
          E.st[i] = ST.move; E.stT[i] = 0;
          if (E.id[i] === 'weed') weedRise(W, i);
          if (MONSTERS[E.id[i] as keyof typeof MONSTERS]?.ai === 'burrow' && MONSTERS[E.id[i] as keyof typeof MONSTERS].role === 'swarm') { E.st[i] = ST.under; E.untarget[i] = 1; }
        }
      }
      continue;
    }
    statuses(W, i, dt);
    if (!E.alive[i]) continue;
    const stunned = E.stunT[i] > 0;
    const act = E.actor[i];
    if (act) {
      if (!stunned || E.kind[i] === EKind.Boss) {
        try { act.tick(W, E.handle(i), E.actorS[i], dt); } catch (e) { E.actor[i] = null; W.hooks.error(e, false); }
      }
    } else if (stunned) { E.vx[i] = 0; E.vy[i] = 0; }
    else if (E.kind[i] === EKind.Treasure) treasure(W, i, dt);
    else if (E.kind[i] === EKind.Boss) bossFallback(W, i, dt);
    else if (E.kind[i] === EKind.Elite) eliteFallback(W, i, dt);
    else if (E.kind[i] === EKind.Ally || E.charmT[i] > 0) allyMove(W, i, dt);
    else role(W, i, dt);
    const im = E.affixImpl[i];
    for (let a = 0; a < im.length; a++) if (im[a].tick) { try { im[a].tick!(W, E.handle(i), E.affixS[i][a], dt); } catch (e) { W.hooks.error(e, false); } }
    if (!E.alive[i]) continue;
    // movement: slow, root, stagger, knockback
    let mul = 1 - E.slowV[i];
    if (E.rootT[i] > 0 || stunned) mul = 0;
    if (E.staggerT[i] > 0) { E.vx[i] += Math.cos(E.age[i] * 9 + i) * 90; E.vy[i] += Math.sin(E.age[i] * 7 + i) * 90; }
    // content bodies set vx/vy (or write x/y); the core integrates both with slow, root and knockback
    E.x[i] += E.vx[i] * mul * dt; E.y[i] += E.vy[i] * mul * dt;
    if (E.kT[i] > 0) { E.kT[i] -= dt; E.x[i] += E.kx[i] * dt; E.y[i] += E.ky[i] * dt; }
    if (E.vx[i] * E.vx[i] + E.vy[i] * E.vy[i] > 100 && E.st[i] !== ST.tell) E.face[i] = Math.atan2(E.vy[i], E.vx[i]);
    else if (E.st[i] !== ST.act) E.face[i] = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
    if (!E.air[i] && !E.hidden[i]) separate(W, i);
    collideBody(W, i);
    // contact
    if (E.hidden[i] || E.air[i] || E.untarget[i] && E.kind[i] !== EKind.Boss) continue;
    const ally = E.kind[i] === EKind.Ally || E.charmT[i] > 0;
    if (ally) { allyContact(W, i); continue; }
    if (E.contactT[i] <= 0 && E.dmg[i] > 0) {
      const dx = W.px - E.x[i], dy = W.py - E.y[i], rr = E.r[i] + playerR;
      if (dx * dx + dy * dy < rr * rr) {
        const dealt = W.hurtFrom(E.dmg[i], i, false, false, E.id[i], false, true);
        // 狐火 also burns you: 1/s × DMG for 3 s (undodgeable, ignores armour)
        if (dealt > 0 && E.id[i] === 'foxfire') W.dotPlayer((MONSTERS.foxfire.p.burn ?? 1) * W.plan.dmgX, MONSTERS.foxfire.p.burnDur ?? 3);
        E.contactT[i] = F.contactCd;
      }
    }
    if (W.S.count && E.contactT[i] <= 0) summonContact(W, i);
  }
  W.cur = -1; W.curWhat = 'none';
}

/** Burn and bleed DoT (ignore armour), status timers; 三昧真火 keeps burns near you alive. */
function statuses(W: World, i: number, dt: number): void {
  const E = W.E;
  if (E.slowT[i] > 0) { E.slowT[i] -= dt; if (E.slowT[i] <= 0) E.slowV[i] = 0; }
  if (E.rootT[i] > 0) E.rootT[i] -= dt;
  if (E.stunT[i] > 0) E.stunT[i] -= dt;
  if (E.staggerT[i] > 0) E.staggerT[i] -= dt;
  if (E.shredT[i] > 0) { E.shredT[i] -= dt; if (E.shredT[i] <= 0) E.shredN[i] = 0; }
  if (E.vulnT[i] > 0) E.vulnT[i] -= dt;
  if (E.charmT[i] > 0) {
    E.charmT[i] -= dt;
    if (E.charmT[i] <= 0) {
      // 点化 allies dissolve and drop their 月华
      if (E.kind[i] === EKind.Ally) { E.kind[i] = EKind.Mon; W.killSlot(i, true, false); return; }
      if (E.boya[i] && W.mods.charm) {
        E.boya[i] = 0;
        const c = W.mods.charm;
        const raw = (c.base + W.scaleSum(c.scale)) * W.dmgMultNow();
        W.fx('pulseRing', E.x[i], E.y[i], { r: 60, life: 0.3 });
        areaStrike(W, E.x[i], E.y[i], 60, raw, -1, SRCI.item, HF.noArmor);
        if (!E.alive[i]) return;
      }
    }
  }
  let dot = 0;
  const n = E.burnN[i];
  if (n) {
    const keepAlive = W.mods.special.samadhi && Math.hypot(E.x[i] - W.px, E.y[i] - W.py) <= (W.mods.special.samadhi.r ?? 300);
    const o = i * BURN_MAX;
    let live = 0;
    for (let s = 0; s < n; s++) {
      if (!keepAlive) E.burnT[o + s] -= dt;
      if (E.burnT[o + s] > 0) { dot += E.burnD[o + s]; E.burnT[o + live] = E.burnT[o + s]; E.burnD[o + live] = E.burnD[o + s]; live++; }
    }
    E.burnN[i] = live;
    if (live) W.addStat('peakBurning', 0);
  }
  const b = E.bleedN[i];
  if (b) {
    const o = i * BLEED_MAX;
    let live = 0;
    for (let s = 0; s < b; s++) {
      E.bleedT[o + s] -= dt;
      if (E.bleedT[o + s] > 0) { dot += E.bleedD[o + s]; E.bleedT[o + live] = E.bleedT[o + s]; E.bleedD[o + live] = E.bleedD[o + s]; live++; }
    }
    E.bleedN[i] = live;
  }
  if (dot > 0) W.strike(i, dot * dt, 0, 1, 0, E.x[i], E.y[i], E.lastSlot[i], SRCI.status, HF.dot | HF.noProc | HF.quiet | (n ? HF.fire : 0));
}

/** Soft separation against up to 6 neighbours in the same cell. */
function separate(W: World, i: number): void {
  const E = W.E, H = W.hash;
  const c = H.cell(E.x[i], E.y[i]);
  const s = H.start[c], e = H.start[c + 1];
  let seen = 0;
  for (let k = s; k < e && seen < ENEMY_SEP; k++) {
    const j = H.items[k];
    if (j === i || !E.alive[j] || E.hidden[j] || E.air[j]) continue;
    seen++;
    const dx = E.x[i] - E.x[j], dy = E.y[i] - E.y[j];
    const rr = (E.r[i] + E.r[j]) * 0.85;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 0.01;
    const push = (rr - d) * 0.35;
    const bi = E.kind[i] === EKind.Boss ? 0.1 : 1, bj = E.kind[j] === EKind.Boss ? 0.1 : 1;
    const ux = d > 0.02 ? dx / d : Math.cos(i), uy = d > 0.02 ? dy / d : Math.sin(i);
    E.x[i] += ux * push * bi; E.y[i] += uy * push * bi;
    E.x[j] -= ux * push * bj; E.y[j] -= uy * push * bj;
  }
}

function collideBody(W: World, i: number): void {
  const E = W.E;
  if (!E.air[i] && E.id[i] !== 'stick') {
    for (const o of W.arena.obstacles) {
      const dx = E.x[i] - o.x, dy = E.y[i] - o.y, d = Math.hypot(dx, dy), m = o.r + E.r[i] * 0.8;
      if (d < m) {
        if (d < 1e-3) { E.x[i] = o.x + m; continue; }
        E.x[i] = o.x + (dx / d) * m; E.y[i] = o.y + (dy / d) * m;
        if (E.st[i] === ST.act && E.id[i] === 'panda') { E.vx[i] = -E.vx[i]; E.vy[i] = -E.vy[i]; }
      }
    }
  }
  const p = W.pt2;
  p.x = E.x[i]; p.y = E.y[i];
  W.clampToArena(p, E.r[i] * 0.6);
  E.x[i] = p.x; E.y[i] = p.y;
}

/** Charmed enemies and 点化 allies: seek the nearest hostile body. */
function allyMove(W: World, i: number, dt: number): void {
  const E = W.E;
  void dt;
  if (E.cool[i] > 0) E.cool[i] -= dt;
  let t = E.partner[i];
  if (t < 0 || !W.targetable(t) || E.cool[i] <= 0) {
    t = W.nearestSlot(E.x[i], E.y[i], 500, 'any');
    E.partner[i] = t;
    E.cool[i] = 0.4;
  }
  const sp = Math.max(60, E.speed[i]);
  if (t >= 0) steer(W, i, E.x[t], E.y[t], sp); else steer(W, i, W.px, W.py, sp * 0.5);
}
/** Allies deal contact damage ×3 to enemies (their own damage + 100% 造化 for 点化 allies). */
function allyContact(W: World, i: number): void {
  const E = W.E;
  if (E.contactT[i] > 0) return;
  const t = E.partner[i];
  if (t < 0 || !E.alive[t] || t === i) return;
  const dx = E.x[t] - E.x[i], dy = E.y[t] - E.y[i], rr = E.r[i] + E.r[t] + 4;
  if (dx * dx + dy * dy > rr * rr) return;
  const base = Math.max(1, E.dmg[i]) * 3 + (E.kind[i] === EKind.Ally ? W.stats.spirit : 0);
  const boya = E.boya[i] && W.mods.charm ? 1 + W.mods.charm.dmgPct / 100 : 1;
  W.strike(t, base * boya, 0, 1, 20, E.x[i], E.y[i], -1, SRCI.summon, HF.noProc);
  E.contactT[i] = 0.5;
}

function summonContact(W: World, i: number): void {
  const E = W.E, S = W.S;
  for (let s = 0; s < S.n; s++) {
    if (!S.alive[s] || !S.capped[s] || S.contactT[s] > 0) continue;
    const dx = S.x[s] - E.x[i], dy = S.y[s] - E.y[i], rr = S.r[s] + E.r[i];
    if (dx * dx + dy * dy > rr * rr) continue;
    S.hp[s] -= E.dmg[i];
    S.flash[s] = 0.08;
    S.contactT[s] = 0.2;
    E.contactT[i] = F.contactCd;
    break;
  }
}

/** An area hit at (x, y) of `dmg` (already × multipliers). */
export function areaStrike(W: World, x: number, y: number, r: number, dmg: number, slot: number, src: number, flags: number, knock = 0, critP = 0, critM = 1.5): number {
  const E = W.E, buf = W.q1;
  const n = W.hash.gather(x, y, r + 64, buf);
  let c = 0;
  for (let k = 0; k < n; k++) {
    const i = buf[k];
    if (!W.targetable(i)) continue;
    const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i];
    if (dx * dx + dy * dy > rr * rr) continue;
    if (W.strike(i, dmg, critP, critM, knock, x, y, slot, src, flags) > 0) c++;
  }
  return c;
}

// ─────────────────────────────────────────────────────────────── the roles

function role(W: World, i: number, dt: number): void {
  const E = W.E;
  const id = E.id[i] as keyof typeof MONSTERS;
  const m = MONSTERS[id];
  if (!m) { steer(W, i, W.px, W.py, E.speed[i]); return; }
  const p = m.p;
  const sp = E.speed[i];
  // the chase target: you, or a 墨宝 that draws aggro
  let tx = W.px, ty = W.py;
  const decoy = targetOf(W, i);
  if (decoy >= 0) { tx = W.S.x[decoy]; ty = W.S.y[decoy]; }
  const dx = tx - E.x[i], dy = ty - E.y[i], dist = Math.hypot(dx, dy) || 1;
  E.cool[i] -= dt;
  switch (E.role[i]) {
    case ROLE.chaser: case ROLE.splitter: case ROLE.exploder: case ROLE.spore: {
      // wobble straight at you (桂花 petals home slowly)
      const wob = (p.wobble ?? 0.15) * Math.sin(E.age[i] * 6 + i);
      const a = Math.atan2(dy, dx) + wob;
      E.vx[i] = Math.cos(a) * sp; E.vy[i] = Math.sin(a) * sp;
      break;
    }
    case ROLE.tank: {
      // 蟹将 scuttles sideways toward you, its shield front
      const a = Math.atan2(dy, dx) + (p.sideways ? 0.6 * Math.sin(E.age[i] * 2 + i) : 0);
      E.vx[i] = Math.cos(a) * sp; E.vy[i] = Math.sin(a) * sp;
      break;
    }
    case ROLE.swarm: {
      if (m.ai === 'burrow') { burrowSwarm(W, i, dt, tx, ty, dist, sp); break; }
      // 墨蝌 schools zigzag
      const a = Math.atan2(dy, dx) + Math.sin(E.age[i] * TAU * (p.zigzag ?? 0.6) + E.a[i]) * 0.8;
      E.vx[i] = Math.cos(a) * sp; E.vy[i] = Math.sin(a) * sp;
      break;
    }
    case ROLE.lunger: case ROLE.charger: case ROLE.roller: case ROLE.hunter: {
      if (m.ai === 'orbit') { orbitDive(W, i, dt, tx, ty, p, sp); break; }
      dashRole(W, i, dt, tx, ty, dist, p, sp);
      break;
    }
    case ROLE.shooter: case ROLE.thrower: case ROLE.webber: case ROLE.artillery: case ROLE.healer: case ROLE.laser: {
      shooterRole(W, i, dt, tx, ty, dist, p, sp);
      break;
    }
    case ROLE.leaper: case ROLE.deflector: hopRole(W, i, dt, tx, ty, p, sp); break;
    case ROLE.turret: {
      E.vx[i] = 0; E.vy[i] = 0;
      if (E.st[i] === ST.move && E.cool[i] <= 0) { E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.7; }
      else if (E.st[i] === ST.tell) {
        E.stT[i] -= dt;
        if (E.stT[i] <= 0) {
          const n = p.n ?? 3, fan = (p.fan ?? 30) * (Math.PI / 180), a0 = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
          for (let k = 0; k < n; k++) {
            const a = a0 + (n > 1 ? (k / (n - 1) - 0.5) * fan : 0), v = p.shotSpeed ?? 200;
            W.enemyShot('eSeed', E.x[i], E.y[i], Math.cos(a) * v, Math.sin(a) * v, 8, 4, E.dmg[i], false, 0, 0, 0, 0, i);
          }
          E.st[i] = ST.move; E.cool[i] = p.every ?? 3;
        }
      }
      break;
    }
    case ROLE.spawner: {
      // 蚌精 shuts for 1 s (immune), then releases 3 墨蝌
      if (E.st[i] === ST.move) {
        steer(W, i, tx, ty, sp);
        if (E.cool[i] <= 0) { E.st[i] = ST.tell; E.stT[i] = p.shut ?? 1; E.invuln[i] = 1; }
      } else if (E.st[i] === ST.tell) {
        E.vx[i] = 0; E.vy[i] = 0;
        E.stT[i] -= dt;
        if (E.stT[i] <= 0) {
          E.invuln[i] = 0; E.st[i] = ST.move; E.cool[i] = p.every ?? 5;
          for (let k = 0; k < (p.n ?? 3); k++) W.spawn('tadpole', E.x[i] + (k - 1) * 14, E.y[i] + 10, { noDrops: true });
        }
      }
      break;
    }
    case ROLE.diver: diverRole(W, i, dt, p); break;
    case ROLE.ambusher: ambusherRole(W, i, dt, dist, p, sp, tx, ty); break;
    case ROLE.blinker: blinkerRole(W, i, dt, p, sp, tx, ty); break;
    case ROLE.circler: case ROLE.pack: case ROLE.orbiter: orbitRole(W, i, dt, tx, ty, dist, p, sp); break;
    case ROLE.formation: {
      // 天兵 march in shield lines: keep the line's heading
      if (E.cool[i] <= 0 || E.a[i] === 0) { E.a[i] = Math.atan2(dy, dx); E.cool[i] = 1.2; }
      E.vx[i] = Math.cos(E.a[i]) * sp; E.vy[i] = Math.sin(E.a[i]) * sp;
      break;
    }
    case ROLE.thief: thiefRole(W, i, dt, tx, ty, dist, p, sp); break;
    case ROLE.reflector: {
      // 霓裳 spins every 5 s for 2 s (reflecting), and casts a sleeve cone up close
      if (E.st[i] === ST.act) {
        E.stT[i] -= dt; E.vx[i] *= 0.9; E.vy[i] *= 0.9;
        if (E.stT[i] <= 0) { E.st[i] = ST.move; E.cool[i] = p.every ?? 5; E.b[i] = 0; }
      } else if (E.st[i] === ST.tell) {
        E.vx[i] = 0; E.vy[i] = 0; E.stT[i] -= dt;
        if (E.stT[i] <= 0) { E.st[i] = ST.move; E.a[i] = 2.5; }
      } else {
        steer(W, i, tx, ty, sp);
        E.a[i] -= dt;
        if (E.cool[i] <= 0) { E.st[i] = ST.act; E.stT[i] = p.spin ?? 2; E.b[i] = 1; }
        else if (dist < (p.near ?? 140) && E.a[i] <= 0) {
          E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.6;
          const dir = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
          W.coreTele(shape({ kind: 'cone', x: E.x[i], y: E.y[i], dir, r: p.coneR ?? 160, deg: p.cone ?? 90 }), p.tell ?? 0.6, TC.cone, E.handle(i), E.dmg[i], null);
        }
      }
      break;
    }
    case ROLE.spinner: {
      steer(W, i, tx, ty, sp);
      // three axes orbit at r 70 and cut you
      if (E.contactT[i] <= 0) {
        const n = p.axes ?? 3, R = p.orbitR ?? 70;
        for (let k = 0; k < n; k++) {
          const a = E.age[i] * TAU * (p.rev ?? 0.8) + (k / n) * TAU;
          const ax = E.x[i] + Math.cos(a) * R, ay = E.y[i] + Math.sin(a) * R;
          if (Math.hypot(W.px - ax, W.py - ay) < W.pr + 12) { W.hurtFrom(E.dmg[i], i, false, false, E.id[i], false, true); E.contactT[i] = F.contactCd; break; }
        }
      }
      break;
    }
    default: steer(W, i, tx, ty, sp);
  }
}

function dashRole(W: World, i: number, dt: number, tx: number, ty: number, dist: number, p: Readonly<Record<string, number>>, sp: number): void {
  const E = W.E;
  const id = E.id[i];
  const dashSpeed = p.dashSpeed ?? p.rollSpeed ?? p.chargeSpeed ?? 480;
  const dashDur = p.dash ?? p.roll ?? (p.lunge ? p.lunge / dashSpeed : 0.5);
  switch (E.st[i]) {
    case ST.move:
      steer(W, i, tx, ty, sp);
      if (E.cool[i] <= 0 && dist < 520) {
        E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.6;
        E.a[i] = Math.atan2(ty - E.y[i], tx - E.x[i]);
        const len = dashSpeed * dashDur + 20;
        if (id !== 'paperman') W.coreTele(shape({ kind: 'line', x: E.x[i], y: E.y[i], dir: E.a[i], len, w: E.r[i] * 2 }), p.tell ?? 0.6, TC.none, E.handle(i), 0, null);
        if (id === 'panda') W.fx('dustPuff', E.x[i], E.y[i], { r: 20, life: 0.5 });
      }
      break;
    case ST.tell:
      E.vx[i] = 0; E.vy[i] = 0;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.act; E.stT[i] = dashDur; E.b[i] = 0; }
      break;
    case ST.act:
      E.vx[i] = Math.cos(E.a[i]) * dashSpeed; E.vy[i] = Math.sin(E.a[i]) * dashSpeed;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.move; E.cool[i] = p.every ?? 3; }
      break;
    default: E.st[i] = ST.move;
  }
}

function shooterRole(W: World, i: number, dt: number, tx: number, ty: number, dist: number, p: Readonly<Record<string, number>>, sp: number): void {
  const E = W.E;
  const id = E.id[i];
  const every = p.every ?? 3;
  if (E.st[i] === ST.move) {
    keep(W, i, tx, ty, p.keep ?? 300, sp);
    if (id === 'ghostlamp') healAura(W, i, dt, p);
    if (E.role[i] === ROLE.laser) { laserMove(W, i, dt, p); return; }
    if (E.cool[i] <= 0 && dist < 700 && id !== 'ghostlamp') {
      E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.8;
      E.tx[i] = W.px; E.ty[i] = W.py;
      if (id === 'imp') {
        // where you will be: lead by your velocity
        const lead = p.lead ?? 1;
        E.tx[i] = W.px + W.pvx * lead; E.ty[i] = W.py + W.pvy * lead;
        const q = W.pt2; q.x = E.tx[i]; q.y = E.ty[i]; W.clampToArena(q, 20); E.tx[i] = q.x; E.ty[i] = q.y;
        W.coreTele(shape({ kind: 'circle', x: E.tx[i], y: E.ty[i], r: p.ring ?? 50 }), 1 + (p.tell ?? 1), TC.none, E.handle(i), 0, null);
      } else if (id === 'spider') {
        W.coreTele(shape({ kind: 'circle', x: E.tx[i], y: E.ty[i], r: p.webR ?? 70 }), p.tell ?? 0.8, TC.web, E.handle(i), p.webLife ?? 5, null);
      } else if (id === 'clerk') {
        W.coreTele(shape({ kind: 'circle', x: W.px, y: W.py, r: p.ring ?? 70 }), p.tell ?? 1.2, TC.lightning, E.handle(i), E.dmg[i], null);
        E.st[i] = ST.move; E.cool[i] = every;
      }
    }
    return;
  }
  if (E.st[i] === ST.tell) {
    E.vx[i] *= 0.8; E.vy[i] *= 0.8;
    E.stT[i] -= dt;
    if (E.stT[i] > 0) return;
    E.st[i] = ST.move; E.cool[i] = every;
    const a = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
    if (id === 'lantern') {
      const v = p.shotSpeed ?? 220;
      W.enemyShot('eFireball', E.x[i], E.y[i], Math.cos(a) * v, Math.sin(a) * v, 9, 4, E.dmg[i], false, 0, 0, 0, 0, i);
    } else if (id === 'imp') {
      const life = 1;
      W.enemyShot('eStone', E.x[i], E.y[i], (E.tx[i] - E.x[i]) / life, (E.ty[i] - E.y[i]) / life, p.ring ?? 50, life, E.dmg[i], true, 0, 0, 0, 0, i);
      E.st[i] = ST.rest; E.stT[i] = 0.8; // backs off
    } else if (id === 'woodghost') {
      const fly = p.fly ?? 360, v = 360;
      const s = W.enemyShot('eAxe', E.x[i], E.y[i], Math.cos(a) * v, Math.sin(a) * v, 12, (fly / v) * 2, E.dmg[i], false, 0, 0, 0, 0, i);
      if (s >= 0) W.ES.mode[s] = 1; // boomerang: out and back
    } else if (id === 'frost') {
      const v = p.shotSpeed ?? 240;
      W.enemyShot('eFrost', E.x[i], E.y[i], Math.cos(a) * v, Math.sin(a) * v, 8, 4, E.dmg[i], false, 0, STI.slow + 1, p.slowDur ?? 1.5, p.slow ?? 0.3, i);
    }
    return;
  }
  if (E.st[i] === ST.rest) {
    // back off after a throw
    steer(W, i, 2 * E.x[i] - W.px, 2 * E.y[i] - W.py, sp);
    E.stT[i] -= dt;
    if (E.stT[i] <= 0) E.st[i] = ST.move;
    return;
  }
  E.st[i] = ST.move;
}

function healAura(W: World, i: number, dt: number, p: Readonly<Record<string, number>>): void {
  const E = W.E, buf = W.q1;
  const R = p.healR ?? 180;
  const n = W.hash.gather(E.x[i], E.y[i], R + 64, buf);
  let healed = false;
  for (let k = 0; k < n; k++) {
    const j = buf[k];
    if (j === i || !E.alive[j] || E.kind[j] === EKind.Ally || E.hp[j] >= E.hpMax[j]) continue;
    const dx = E.x[j] - E.x[i], dy = E.y[j] - E.y[i];
    if (dx * dx + dy * dy > R * R) continue;
    E.hp[j] = Math.min(E.hpMax[j], E.hp[j] + E.hpMax[j] * (p.healPct ?? 0.04) * dt);
    healed = true;
  }
  E.b[i] = healed ? 1 : 0; // glows gold while it heals
}

/** 星官 pairs: a wet-ink line joins them for 1.2 s, then the beam burns 0.6 s (undodgeable). */
function laserMove(W: World, i: number, dt: number, p: Readonly<Record<string, number>>): void {
  const E = W.E;
  const j = E.partner[i];
  if (j < 0 || !E.alive[j] || E.partner[j] !== i) return;
  if (i > j) return; // the lower slot runs the pair
  if (E.a[i] > 0) {
    // the beam burns
    E.a[i] -= dt;
    if (segDist2(W.px, W.py, E.x[i], E.y[i], E.x[j], E.y[j]) < (W.pr + 8) * (W.pr + 8) && E.contactT[i] <= 0) {
      W.hurtFrom(E.dmg[i], i, true, false, E.id[i], false, false);
      E.contactT[i] = 0.3;
    }
    if (E.a[i] <= 0) E.cool[i] = p.every ?? 5;
    return;
  }
  if (E.cool[i] <= 0 && E.b[i] === 0) {
    E.b[i] = p.tell ?? 1.2;
    const dir = Math.atan2(E.y[j] - E.y[i], E.x[j] - E.x[i]);
    const len = Math.hypot(E.x[j] - E.x[i], E.y[j] - E.y[i]);
    W.coreTele(shape({ kind: 'line', x: E.x[i], y: E.y[i], dir, len, w: 16 }), p.tell ?? 1.2, TC.none, E.handle(i), 0, null);
  }
  if (E.b[i] > 0) {
    E.vx[i] = 0; E.vy[i] = 0; E.vx[j] = 0; E.vy[j] = 0;
    E.b[i] -= dt;
    if (E.b[i] <= 0) { E.b[i] = 0; E.a[i] = p.beam ?? 0.6; W.fxLine('beamRay', E.x[i], E.y[i], Math.atan2(E.y[j] - E.y[i], E.x[j] - E.x[i]), Math.hypot(E.x[j] - E.x[i], E.y[j] - E.y[i]), p.beam ?? 0.6, 1); }
  }
}

function hopRole(W: World, i: number, dt: number, tx: number, ty: number, p: Readonly<Record<string, number>>, sp: number): void {
  const E = W.E;
  const hop = p.hop ?? 160, flight = Math.max(0.35, p.tell ?? 0.5);
  if (E.st[i] === ST.air) {
    E.stT[i] -= dt;
    const k = 1 - Math.max(0, E.stT[i]) / flight;
    E.x[i] = E.a[i] + (E.tx[i] - E.a[i]) * k;
    E.y[i] = E.b[i] + (E.ty[i] - E.b[i]) * k;
    E.vx[i] = 0; E.vy[i] = 0;
    if (E.stT[i] <= 0) { E.st[i] = ST.move; E.air[i] = 0; E.cool[i] = Math.max(0.2, (p.every ?? 1.6) - flight); }
    return;
  }
  if (E.id[i] === 'umbrella') { steer(W, i, tx, ty, sp * 0.6); }
  else { E.vx[i] = 0; E.vy[i] = 0; }
  if (E.cool[i] <= 0) {
    const dx = tx - E.x[i], dy = ty - E.y[i], d = Math.hypot(dx, dy) || 1;
    const len = Math.min(hop, d);
    E.a[i] = E.x[i]; E.b[i] = E.y[i];
    E.tx[i] = E.x[i] + (dx / d) * len; E.ty[i] = E.y[i] + (dy / d) * len;
    const q = W.pt2; q.x = E.tx[i]; q.y = E.ty[i]; W.clampToArena(q, E.r[i]); E.tx[i] = q.x; E.ty[i] = q.y;
    E.st[i] = ST.air; E.stT[i] = flight; E.air[i] = 1;
    if (p.ring) W.coreTele(shape({ kind: 'circle', x: E.tx[i], y: E.ty[i], r: p.ring }), flight, TC.none, E.handle(i), 0, null);
  }
}

function orbitRole(W: World, i: number, dt: number, tx: number, ty: number, dist: number, p: Readonly<Record<string, number>>, sp: number): void {
  const E = W.E;
  const R = p.orbitR ?? 220;
  const dir = (i & 1) ? 1 : -1;
  const id = E.id[i];
  if (id === 'frost') {
    orbit(W, i, tx, ty, R, sp, dir);
    if (E.cool[i] <= 0 && E.st[i] === ST.move) { E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.5; }
    if (E.st[i] === ST.tell) { E.stT[i] -= dt; if (E.stT[i] <= 0) { E.st[i] = ST.move; shooterFire(W, i, 'eFrost', p); E.cool[i] = p.every ?? 2; } }
    return;
  }
  // 狐火 / 狼影: circle for 2 s, tell (howl), then dash (pounce one by one)
  switch (E.st[i]) {
    case ST.move:
      if (dist > R + 80) steer(W, i, tx, ty, sp); else orbit(W, i, tx, ty, R, sp, dir);
      E.stT[i] += dt;
      if (E.stT[i] >= (p.circle ?? 2) && dist < R + 120) {
        E.st[i] = ST.tell;
        E.stT[i] = (p.tell ?? p.howl ?? 0.5) + (id === 'wolf' ? (i % 4) * (p.pounceGap ?? 0.3) : 0);
      }
      break;
    case ST.tell:
      E.vx[i] *= 0.85; E.vy[i] *= 0.85;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.act; E.stT[i] = 0.45; E.a[i] = Math.atan2(ty - E.y[i], tx - E.x[i]); }
      break;
    case ST.act: {
      const v = p.dashSpeed ?? p.pounceSpeed ?? 460;
      E.vx[i] = Math.cos(E.a[i]) * v; E.vy[i] = Math.sin(E.a[i]) * v;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.move; E.stT[i] = 0; }
      break;
    }
    default: E.st[i] = ST.move; E.stT[i] = 0;
  }
}
function shooterFire(W: World, i: number, kind: 'eFrost', p: Readonly<Record<string, number>>): void {
  const E = W.E;
  const a = Math.atan2(W.py - E.y[i], W.px - E.x[i]), v = p.shotSpeed ?? 240;
  W.enemyShot(kind, E.x[i], E.y[i], Math.cos(a) * v, Math.sin(a) * v, 8, 4, E.dmg[i], false, 0, STI.slow + 1, p.slowDur ?? 1.5, p.slow ?? 0.3, i);
}

/** 寒鸦: circle, then dive in a line (0.6 s tell) at your nearest summon, or at you. */
function orbitDive(W: World, i: number, dt: number, tx: number, ty: number, p: Readonly<Record<string, number>>, sp: number): void {
  const E = W.E;
  switch (E.st[i]) {
    case ST.move:
      orbit(W, i, tx, ty, p.orbitR ?? 200, sp * 0.8, (i & 1) ? 1 : -1);
      E.stT[i] += dt;
      if (E.stT[i] > (p.circle ?? 1.5)) {
        E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.6; E.a[i] = Math.atan2(ty - E.y[i], tx - E.x[i]);
        W.coreTele(shape({ kind: 'line', x: E.x[i], y: E.y[i], dir: E.a[i], len: 420, w: 18 }), p.tell ?? 0.6, TC.none, E.handle(i), 0, null);
      }
      break;
    case ST.tell:
      E.vx[i] = 0; E.vy[i] = 0; E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.act; E.stT[i] = 420 / (p.diveSpeed ?? 520); }
      break;
    case ST.act: {
      const v = p.diveSpeed ?? 520;
      E.vx[i] = Math.cos(E.a[i]) * v; E.vy[i] = Math.sin(E.a[i]) * v;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.move; E.stT[i] = 0; }
      break;
    }
    default: E.st[i] = ST.move; E.stT[i] = 0;
  }
}

/** 竹鼠 travel under a ripple of earth (untargetable) until within 200, then surface. */
function burrowSwarm(W: World, i: number, dt: number, tx: number, ty: number, dist: number, sp: number): void {
  const E = W.E;
  void dt;
  const m = MONSTERS.rat.p;
  if (E.st[i] === ST.under) {
    E.untarget[i] = 1;
    steer(W, i, tx, ty, sp);
    if (dist < (m.surface ?? 200)) { E.st[i] = ST.move; E.untarget[i] = 0; W.fx('dustPuff', E.x[i], E.y[i], { r: 14, life: 0.3 }); }
    return;
  }
  steer(W, i, tx, ty, sp);
}

/** 溺影 submerges (untargetable) for 1.2 s, then resurfaces 150 u from you after a 0.5 s ripple. */
function blinkerRole(W: World, i: number, dt: number, p: Readonly<Record<string, number>>, sp: number, tx: number, ty: number): void {
  const E = W.E;
  switch (E.st[i]) {
    case ST.move:
      steer(W, i, tx, ty, sp);
      if (E.cool[i] <= 0) { E.st[i] = ST.under; E.stT[i] = p.under ?? 1.2; E.untarget[i] = 1; E.hidden[i] = 1; W.fx('rippleRing', E.x[i], E.y[i], { r: 24, life: 0.4 }); }
      break;
    case ST.under:
      E.vx[i] = 0; E.vy[i] = 0;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) {
        const a = W.erng() * TAU, d = p.near ?? 150;
        const q = W.pt2; q.x = W.px + Math.cos(a) * d; q.y = W.py + Math.sin(a) * d; W.clampToArena(q, 20);
        E.x[i] = q.x; E.y[i] = q.y;
        E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.5;
        W.coreTele(shape({ kind: 'circle', x: q.x, y: q.y, r: E.r[i] + 10 }), p.tell ?? 0.5, TC.none, E.handle(i), 0, null);
      }
      break;
    case ST.tell:
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.move; E.untarget[i] = 0; E.hidden[i] = 0; E.cool[i] = p.every ?? 4; }
      break;
    default: E.st[i] = ST.move;
  }
}

function weedRise(W: World, i: number): void {
  const E = W.E;
  const p = MONSTERS.weed.p;
  if (Math.hypot(W.px - E.x[i], W.py - E.y[i]) < (p.r ?? 40) + W.pr) {
    W.root(p.root ?? 0.8);
    W.hurtFrom(E.dmg[i], i, false, false, 'weed', false, true);
  }
  E.stT[i] = p.life ?? 6;
}

/** 水草缠 wilts after 6 s; 竹节精 bursts out of the bamboo when you come within 200. */
function ambusherRole(W: World, i: number, dt: number, dist: number, p: Readonly<Record<string, number>>, sp: number, tx: number, ty: number): void {
  const E = W.E;
  if (E.id[i] === 'weed') {
    E.vx[i] = 0; E.vy[i] = 0;
    E.stT[i] -= dt;
    if (E.stT[i] <= 0 && E.st[i] === ST.move) { E.noDrops[i] = 1; W.killSlot(i, false, false); }
    return;
  }
  switch (E.st[i]) {
    case ST.under:
      E.vx[i] = 0; E.vy[i] = 0;
      // bursts out when you come within 200 (or, restless, after 10 s hidden)
      E.a[i] += dt;
      if (dist < (p.near ?? 200) || E.a[i] > 10) { E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.5; W.fx('leafGust', E.x[i], E.y[i], { r: 30, life: 0.5 }); }
      break;
    case ST.tell:
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) {
        E.hidden[i] = 0; E.untarget[i] = 0; E.invuln[i] = 0;
        E.st[i] = ST.act; E.stT[i] = 0.5; E.a[i] = Math.atan2(ty - E.y[i], tx - E.x[i]);
      }
      break;
    case ST.act: {
      const v = p.burstSpeed ?? 380;
      E.vx[i] = Math.cos(E.a[i]) * v; E.vy[i] = Math.sin(E.a[i]) * v;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) E.st[i] = ST.move;
      break;
    }
    default: steer(W, i, tx, ty, sp);
  }
}

/** 白鹭: lands at the edge, draws a line to you for 0.8 s, dives across the arena, flies off. */
function diverRole(W: World, i: number, dt: number, p: Readonly<Record<string, number>>): void {
  const E = W.E;
  switch (E.st[i]) {
    case ST.move:
      E.vx[i] = 0; E.vy[i] = 0;
      if (E.cool[i] <= 0) {
        E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.8;
        E.a[i] = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
        W.coreTele(shape({ kind: 'line', x: E.x[i], y: E.y[i], dir: E.a[i], len: 1600, w: 22 }), p.tell ?? 0.8, TC.none, E.handle(i), 0, null);
      }
      break;
    case ST.tell:
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) { E.st[i] = ST.act; E.stT[i] = 1600 / (p.diveSpeed ?? 900); }
      break;
    case ST.act: {
      const v = p.diveSpeed ?? 900;
      E.vx[i] = Math.cos(E.a[i]) * v; E.vy[i] = Math.sin(E.a[i]) * v;
      E.stT[i] -= dt;
      const q = W.pt2; q.x = E.x[i]; q.y = E.y[i]; W.clampToArena(q, 30);
      if (E.stT[i] <= 0 || (Math.abs(q.x - E.x[i]) + Math.abs(q.y - E.y[i]) > 1 && E.stT[i] < 1600 / v - 0.4)) {
        // flies off, then lands again at the edge
        E.st[i] = ST.rest; E.stT[i] = p.rest ?? 2; E.hidden[i] = 1; E.untarget[i] = 1;
      }
      break;
    }
    case ST.rest:
      E.vx[i] = 0; E.vy[i] = 0;
      E.stT[i] -= dt;
      if (E.stT[i] <= 0) {
        const a = W.erng() * TAU, R = Math.min(W.arena.maxX, W.arena.maxY) - 40;
        E.x[i] = Math.cos(a) * R; E.y[i] = Math.sin(a) * R;
        E.hidden[i] = 0; E.untarget[i] = 0; E.st[i] = ST.move; E.cool[i] = 0.6;
      }
      break;
    default: E.st[i] = ST.move;
  }
}

/** 金蟾: eats floor 月华 within 150 and grows; its tongue (0.7 s tell, a 300 line) pulls you 120. */
function thiefRole(W: World, i: number, dt: number, tx: number, ty: number, dist: number, p: Readonly<Record<string, number>>, sp: number): void {
  const E = W.E, D = W.D;
  if (E.st[i] === ST.tell) {
    E.vx[i] = 0; E.vy[i] = 0; E.stT[i] -= dt;
    if (E.stT[i] <= 0) { E.st[i] = ST.move; E.cool[i] = p.every ?? 4; }
    return;
  }
  steer(W, i, tx, ty, sp);
  // eat
  if ((W.t * 10 | 0) % 3 === i % 3) {
    const R = p.eatR ?? 150, R2 = R * R;
    for (let d = 0; d < D.n; d++) {
      if (!D.alive[d] || (D.kind[d] !== DK.moonDrop && D.kind[d] !== DK.moonThick)) continue;
      const dx = D.x[d] - E.x[i], dy = D.y[d] - E.y[i];
      if (dx * dx + dy * dy > R2) continue;
      E.eaten[i] += D.worth[d];
      D.release(d);
      E.r[i] = Math.min(E.r0[i] * 1.8, E.r0[i] * (1 + E.eaten[i] * 0.01));
    }
  }
  if (E.cool[i] <= 0 && dist < (p.tongue ?? 300)) {
    E.st[i] = ST.tell; E.stT[i] = p.tell ?? 0.7;
    const dir = Math.atan2(W.py - E.y[i], W.px - E.x[i]);
    W.coreTele(shape({ kind: 'line', x: E.x[i], y: E.y[i], dir, len: p.tongue ?? 300, w: 22 }), p.tell ?? 0.7, TC.tongue, E.handle(i), E.dmg[i], null);
  }
}

// ─────────────────────────────────────────────────────────────── fallbacks for content bodies

/** 貔貅 flees at 1.1 × your speed for 20 s, then vanishes; 镜中花 drifts for 8 s. */
function treasure(W: World, i: number, dt: number): void {
  const E = W.E;
  E.stT[i] -= dt;
  if (E.stT[i] <= 0) { W.fx('petalBurst', E.x[i], E.y[i], { r: 20, life: 0.5 }); E.release(i); return; }
  if (E.id[i] === 'pixiu') {
    const dx = E.x[i] - W.px, dy = E.y[i] - W.py, d = Math.hypot(dx, dy) || 1;
    const v = W.moveSpd * (TREASURES.pixiu.p.fleeX ?? 1.1) * (d < 420 ? 1 : 0.35);
    let a = Math.atan2(dy, dx) + Math.sin(E.age[i] * 1.3) * 0.6;
    // turn along the rim instead of pinning itself
    const q = W.pt2; q.x = E.x[i] + Math.cos(a) * 60; q.y = E.y[i] + Math.sin(a) * 60;
    if (!W.inArena(q.x, q.y, 30)) a += Math.PI / 2;
    E.vx[i] = Math.cos(a) * v; E.vy[i] = Math.sin(a) * v;
  } else {
    const a = E.a[i] + Math.sin(E.age[i] * 0.8) * 0.8;
    const v = TREASURES.mirrorflower.p.drift ?? 60;
    E.vx[i] = Math.cos(a) * v; E.vy[i] = Math.sin(a) * v;
  }
}

/** A named elite with no content yet: a heavy chaser with a charge every 6 s. */
const ELITE_FALLBACK = { tell: 0.8, dashSpeed: 420, dash: 0.6, every: 6 } as const;
function eliteFallback(W: World, i: number, dt: number): void {
  const E = W.E;
  dashRole(W, i, dt, W.px, W.py, Math.hypot(W.px - E.x[i], W.py - E.y[i]), ELITE_FALLBACK, E.speed[i]);
}

/** A boss with no content yet: chases, fires gapped rings, and changes phase at 60% / 25%. */
function bossFallback(W: World, i: number, dt: number): void {
  const E = W.E;
  const id = E.id[i];
  const def = id === 'mirrorself' ? null : BOSSES[id as keyof typeof BOSSES];
  const ph = E.phase[i];
  const frac = E.hp[i] / E.hpMax[i];
  const next = ph === 0 ? 0.6 : ph === 1 ? 0.25 : ph === 2 && W.run.vows.daoxuan ? 0.1 : -1;
  if (next > 0 && frac <= next) {
    W.bossPhase(E.handle(i), ph + 1);
    E.invuln[i] = 1; E.stT[i] = 1.2;
  }
  if (E.invuln[i] && E.stT[i] > 0) { E.stT[i] -= dt; if (E.stT[i] <= 0) E.invuln[i] = 0; E.vx[i] = 0; E.vy[i] = 0; return; }
  const sp = (def?.phases[Math.min(2, ph)].speed ?? 80) || 60;
  steer(W, i, W.px, W.py, sp);
  E.cool[i] -= dt;
  if (E.cool[i] <= 0) {
    E.cool[i] = 3 - ph * 0.5;
    const n = 14 + ph * 4, gap = W.erng() * TAU;
    const dmg = 4 * W.bossDmgX() * (1 + 0.5 * ph);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      if (Math.abs(angDiff(a, gap)) < 0.35) continue;
      W.enemyShot('eOrb', E.x[i], E.y[i], Math.cos(a) * 180, Math.sin(a) * 180, 9, 5, dmg, false, 0, 0, 0, 0, i);
    }
  }
}

// ─────────────────────────────────────────────────────────────── deaths and telegraph strikes

/** Role effects on death: splitters split, exploders fuse, spores cloud, 金蟾 returns what it ate. */
export function onEnemyDeath(W: World, i: number, kind: number, id: string, x: number, y: number, crit: boolean): void {
  void crit;
  if (kind !== EKind.Mon) return;
  const m = MONSTERS[id as keyof typeof MONSTERS];
  if (!m) return;
  const E = W.E;
  // a splitter splits once: its children never split again
  if (m.child && !E.child[i]) {
    for (let k = 0; k < m.child.n; k++) {
      const a = (k / m.child.n) * TAU;
      const h = W.spawn(id as never, x + Math.cos(a) * 12, y + Math.sin(a) * 12, { noDrops: true, capped: false });
      const j = E.slotOf(h);
      if (j < 0) continue;
      E.hp[j] = E.hpMax[j] = m.child.hp * W.plan.hpX;
      E.dmg[j] = m.child.dmg * W.plan.dmgX;
      E.speed[j] = m.child.speed * W.plan.spdX;
      E.r[j] = E.r0[j] * 0.6;
      E.cost[j] = 0;
      E.child[j] = 1;
      E.role[j] = ROLE.chaser;
    }
  }
  switch (m.role) {
    case 'exploder':
      W.coreTele(shape({ kind: 'circle', x, y, r: m.p.r ?? 90 }), m.p.fuse ?? 0.8, TC.burst, -1, E.dmg[i] || m.dmg * W.plan.dmgX, null);
      break;
    case 'spore':
      W.coreZone(0, 'sporeCloud', x, y, m.p.cloudR ?? 80, m.p.cloudLife ?? 4, ZC.spore, 0, 0, (m.p.cloudDps ?? 2) * W.plan.dmgX);
      break;
    case 'thief': {
      const back = E.eaten[i] * (m.p.refund ?? 1.2);
      if (back > 0) W.dropMoon(x, y, back);
      break;
    }
  }
}

/** A core telegraph filled: the strike. */
export function strikeTele(W: World, code: number, s: TeleShape, owner: number, v: number): void {
  const pr = W.pr;
  switch (code) {
    case TC.burst: case TC.lightning: case TC.slam: {
      if (s.kind !== 'circle') return;
      W.fx(code === TC.lightning ? 'lightningStrike' : 'shockRing', s.x, s.y, { r: s.r, life: 0.35 });
      if (Math.hypot(W.px - s.x, W.py - s.y) <= s.r + pr) W.hurtFrom(v, -1, code === TC.lightning ? false : false, false, code === TC.lightning ? 'clerk' : 'jelly', false, false);
      break;
    }
    case TC.web:
      if (s.kind !== 'circle') return;
      W.coreZone(0, 'webPatch', s.x, s.y, s.r, v || 5, ZC.web, 0, MONSTERS.spider.p.slow ?? 0.4, 0);
      break;
    case TC.cone: {
      if (s.kind !== 'cone') return;
      const dx = W.px - s.x, dy = W.py - s.y, d = Math.hypot(dx, dy);
      if (d <= s.r + pr && Math.abs(angDiff(Math.atan2(dy, dx), s.dir)) <= (s.deg / 2) * (Math.PI / 180)) W.hurtFrom(v, -1, false, false, 'dancer', false, false);
      break;
    }
    case TC.tongue: {
      if (s.kind !== 'line') return;
      const ex = s.x + Math.cos(s.dir) * s.len, ey = s.y + Math.sin(s.dir) * s.len;
      if (segDist2(W.px, W.py, s.x, s.y, ex, ey) <= (s.w / 2 + pr) * (s.w / 2 + pr)) {
        W.hurtFrom(v, -1, false, false, 'toad', false, false);
        const o = W.E.slotOf(owner);
        W.pullPlayer(o >= 0 ? W.E.x[o] : s.x, o >= 0 ? W.E.y[o] : s.y, MONSTERS.toad.p.pull ?? 120);
      }
      break;
    }
  }
}
