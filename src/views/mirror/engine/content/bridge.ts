// 水月幻镜 · the few engine internals content needs that WorldApi does not (yet) expose. Every such
// reach into the core lives here, typed against the real World class, so a core change breaks the
// build here and nowhere else. Each helper is listed as a CHANGE REQUEST to promote it into WorldApi
// (types.ts §6): sky/plan, setMoon, player pushes and slows, body looks and kinds, quiet expiry,
// live telegraphs, moving zones, raw enemy shots, floor 月华, crates and the event-free HP restore.
import type { AffixId, FxName } from '../../ids';
import type { AffixImpl, ActorImpl, AtlasId, SpawnPlan, TeleShape, WaveSetup, WorldApi } from '../../types';
import type { World } from '../world';
import { BLEED_MAX, BURN_MAX, EKind, SMode } from '../pools';
import { DK, PK, STI, TAG_BIT } from '../consts';

/** The World behind a WorldApi (content is always handed the World itself). */
export const core = (w: WorldApi): World => w as unknown as World;

// ─────────────────────────────────────────────── the wave

export function sky(w: WorldApi): WaveSetup['sky'] {
  return core(w).setup?.sky ?? { fullMoonDay: false, lunation: 0.5, fullWave: false };
}
export function plan(w: WorldApi): SpawnPlan { return core(w).plan; }
/** Wave length (s), or null on a boss wave. */
export function waveLen(w: WorldApi): number | null { return core(w).len; }
/** Seconds into the wave (not counting the boss intro pause). */
export function waveTime(w: WorldApi): number { return core(w).tWave; }
export function setMoon(w: WorldApi, phase: number): void { core(w).setMoon(phase); }
export function reduceMotion(w: WorldApi): boolean { return !!core(w).settings.reduceMotion; }
export function lightNow(w: WorldApi): number | null { return core(w).lightR; }
/** The run's item mods for this wave (rebuilt at every wave start, so a change never outlives it). */
export function mods(w: WorldApi): World['mods'] { return core(w).mods; }

// ─────────────────────────────────────────────── the player

/** Slow the player (the strongest slow applies). v is a fraction. */
export function slowPlayer(w: WorldApi, v: number, dur: number): void { core(w).slowPlayer(v, dur); }
/** Pull the player toward (x, y) by dist u over 0.2 s (定海神针 ignores it). */
export function pullPlayer(w: WorldApi, x: number, y: number, dist: number): void { core(w).pullPlayer(x, y, dist); }
/** Push the player away from (x, y) by dist u. */
export function pushPlayer(w: WorldApi, x: number, y: number, dist: number): void {
  const W = core(w);
  const dx = W.px - x, dy = W.py - y, d = Math.hypot(dx, dy) || 1;
  W.pullPlayer(W.px + (dx / d) * 1000, W.py + (dy / d) * 1000, dist);
}
/** Nudge the player's position (wind); the core clamps it into the arena on its next move. */
export function nudgePlayer(w: WorldApi, dx: number, dy: number): void { const W = core(w); W.px += dx; W.py += dy; }
/** An undodgeable damage-over-time on the player (dps already scaled). */
export function dotPlayer(w: WorldApi, dps: number, dur: number): void { core(w).dotPlayer(dps, dur); }
/** Give back HP taken this step without it counting as healing (处暑, 玉兔's half damage). */
export function restoreHp(w: WorldApi, n: number): void { const W = core(w); if (n > 0) W.hp = Math.min(W.hpMax, W.hp + n); }
/** The raw movement input (the charm glyph reverses it). */
export function moveInput(w: WorldApi): { x: number; y: number } { const W = core(w); return { x: W.moveX, y: W.moveY }; }
export function setMoveInput(w: WorldApi, x: number, y: number): void { const W = core(w); W.moveX = x; W.moveY = y; }
export function livesLeft(w: WorldApi): number { return core(w).lives; }
export function drunkNow(w: WorldApi): number { return core(w).drunkOn ? core(w).drunk : -1; }
/** Mid-leap or mid-dash (the pounce and the dash skills wait for their landing). */
export function airborne(w: WorldApi): boolean { const W = core(w); return W.leapT > 0 || W.dashT > 0; }

// ─────────────────────────────────────────────── bodies

const slot = (w: WorldApi, h: number) => core(w).E.slotOf(h);

/** Draw body h as another atlas sprite, painted at radius r0 (sprite scale = r / r0). */
export function setLook(w: WorldApi, h: number, atlas: AtlasId | null, r0?: number): void {
  const i = slot(w, h);
  if (i < 0) return;
  const E = core(w).E;
  E.atlas[i] = atlas;
  if (r0 !== undefined) E.r0[i] = r0;
}
export function lookOf(w: WorldApi, h: number): AtlasId | null { const i = slot(w, h); return i < 0 ? null : core(w).E.atlas[i]; }
/** Make body h count as a monster or an elite (elites show an HP bar and take the elite rules). */
export function setKind(w: WorldApi, h: number, kind: 'mon' | 'elite'): void {
  const i = slot(w, h);
  if (i >= 0) core(w).E.kind[i] = kind === 'elite' ? EKind.Elite : EKind.Mon;
}
/** Hand body h to a content actor (phantoms, trees, monkeys). */
export function setActor<S>(w: WorldApi, h: number, impl: ActorImpl<S>, state: S): void {
  const i = slot(w, h);
  if (i < 0) return;
  const E = core(w).E;
  E.actor[i] = impl as ActorImpl;
  E.actorS[i] = state;
}
/** Knockback resist 0..1 (1: immovable). */
export function setResist(w: WorldApi, h: number, v: number): void { const i = slot(w, h); if (i >= 0) core(w).E.resist[i] = v; }
/** Airborne bodies skip obstacles, separation and contact. */
export function setAir(w: WorldApi, h: number, on: boolean): void { const i = slot(w, h); if (i >= 0) core(w).E.air[i] = on ? 1 : 0; }
/** Set a body's HP and its maximum (a tree's bar reads hp / max). */
export function setHp(w: WorldApi, h: number, hp: number, max = hp): void {
  const i = slot(w, h);
  if (i < 0) return;
  const E = core(w).E;
  E.hp[i] = hp; E.hpMax[i] = max;
}
/** A splitter's child (the core never splits it again; 碎镜 must not either). */
export function isChild(w: WorldApi, h: number): boolean { const i = slot(w, h); return i >= 0 && core(w).E.child[i] === 1; }
/** Mark body h as a splitter's child, so the core's splitter never splits it on death. */
export function markChild(w: WorldApi, h: number): void { const i = slot(w, h); if (i >= 0) core(w).E.child[i] = 1; }
/** 夔 drives its own beat tick (on its stomps' tempo) instead of the core's 2 Hz one. */
export function setBossBeat(w: WorldApi, on: boolean): void { core(w).bossBeat = on; }
/** A boss keeps the beat (夔): the core's beat — W.beat, the HUD's pulse, 琴师's timing — follows the
 *  ticks reported with beatNow until released (the core's 2 Hz clock returns). */
export function ownBeat(w: WorldApi, on: boolean): void { const W = core(w); W.beatOwn = on; W.beatLatch = false; }
/** The owning boss's beat ticked this step (the core flags it from the next step). */
export function beatNow(w: WorldApi): void { core(w).beatLatch = true; }
/** Mark body h as a boss's decoy (the core's 灯笼鬼 never heals one). */
export function setDecoy(w: WorldApi, h: number, on = true): void { const i = slot(w, h); if (i >= 0) core(w).E.decoy[i] = on ? 1 : 0; }
export function setNoDrops(w: WorldApi, h: number): void { const i = slot(w, h); if (i >= 0) core(w).E.noDrops[i] = 1; }
/** A body leaves without being killed: no tallies, drops or kill events. */
export function expire(w: WorldApi, h: number, look: FxName = 'inkBurst'): void {
  const i = slot(w, h);
  if (i >= 0) core(w).expireSlot(i, look);
}
/** 映: projectiles bounce back while on. */
export function setReflect(w: WorldApi, h: number, on: boolean): void {
  const i = slot(w, h);
  if (i < 0) return;
  const E = core(w).E;
  if (on) { E.tags[i] |= TAG_BIT.reflect; E.b[i] = 1; } else { E.tags[i] &= ~TAG_BIT.reflect; E.b[i] = 0; }
}
/** Seconds until body h may deal contact damage again (reset when it touches you). */
export function contactT(w: WorldApi, h: number): number { const i = slot(w, h); return i < 0 ? 0 : core(w).E.contactT[i]; }
/** 月华 a body drops on death (its threat cost). */
export function costOf(w: WorldApi, h: number): number { const i = slot(w, h); return i < 0 ? 0 : core(w).E.cost[i]; }
/** Burn and bleed damage per second on body h. */
export function dotsOf(w: WorldApi, h: number): { burn: number; bleed: number } {
  const i = slot(w, h);
  const out = { burn: 0, bleed: 0 };
  if (i < 0) return out;
  const E = core(w).E;
  for (let s = 0; s < E.burnN[i]; s++) out.burn += E.burnD[i * BURN_MAX + s];
  for (let s = 0; s < E.bleedN[i]; s++) out.bleed += E.bleedD[i * BLEED_MAX + s];
  return out;
}
/** Is body h a monster that fights for you (知音, 点化)? */
export function isAlly(w: WorldApi, h: number): boolean {
  const i = slot(w, h);
  if (i < 0) return false;
  const E = core(w).E;
  return E.kind[i] === EKind.Ally || E.charmT[i] > 0;
}
/** The 镜印 a body carries. */
export function affixesOf(w: WorldApi, h: number): readonly AffixId[] { const i = slot(w, h); return i < 0 ? [] : core(w).E.affixes[i] ?? []; }
/** Every live body's handle (for sweeps over the whole field). */
export function eachEnemy(w: WorldApi, fn: (h: number) => void): void {
  const E = core(w).E;
  for (let i = 0; i < E.n; i++) if (E.alive[i] && !E.hidden[i]) fn(E.handle(i));
}
/** Number of live bodies. */
export function enemyCount(w: WorldApi): number { return core(w).E.count; }
/** Add an affix to a body after spawning (tests and the dev hooks). */
export function addAffix(w: WorldApi, h: number, impl: AffixImpl): void {
  const i = slot(w, h);
  if (i < 0) return;
  const E = core(w).E;
  E.affixImpl[i].push(impl);
  E.affixS[i].push(impl.init(w, h));
}

// ─────────────────────────────────────────────── summons (hunters)

/** The nearest capped 墨宝 within r, or null. */
export function nearestSummon(w: WorldApi, x: number, y: number, r: number): { x: number; y: number } | null {
  const S = core(w).S;
  let best = -1, bd = r * r;
  for (let i = 0; i < S.n; i++) {
    if (!S.alive[i] || !S.capped[i]) continue;
    const dx = S.x[i] - x, dy = S.y[i] - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best < 0 ? null : { x: S.x[best], y: S.y[best] };
}

// ─────────────────────────────────────────────── enemy shots

export interface ShotOpts { lob?: boolean; homing?: number; boomerang?: boolean; slow?: { v: number; dur: number } }
/**
 * An enemy shot with its damage already final (the content helpers scale it). Returns its pool index,
 * or −1. Content shots carry owner −1, so 反照 and 小雪 can tell them from the core's shooters.
 */
export function enemyShot(w: WorldApi, kind: string, x: number, y: number, vx: number, vy: number, r: number, life: number, dmg: number, o: ShotOpts = {}): number {
  const W = core(w);
  const st = o.slow ? STI.slow + 1 : 0;
  const i = W.enemyShot(kind, x, y, vx, vy, r, life, dmg, !!o.lob, o.homing ?? 0, st, o.slow?.dur ?? 0, o.slow?.v ?? 0, -1);
  if (i >= 0 && o.boomerang) W.ES.mode[i] = SMode.BoomOut;
  return i;
}
/** Is shot i still the one we made (alive, same kind, same tag)? */
export function shotIs(w: WorldApi, i: number, tag: number): boolean {
  const ES = core(w).ES;
  return i >= 0 && i < ES.cap && ES.alive[i] === 1 && ES.tx[i] === tag;
}
/** Tag a straight shot (the tag lives in its unused lob-target field) so it can be steered later. */
export function tagShot(w: WorldApi, i: number, tag: number): void { const ES = core(w).ES; if (i >= 0 && ES.mode[i] !== SMode.Lob) ES.tx[i] = tag; }
export function moveShot(w: WorldApi, i: number, x: number, y: number, vx: number, vy: number): void {
  const ES = core(w).ES;
  ES.x[i] = x; ES.y[i] = y; ES.vx[i] = vx; ES.vy[i] = vy;
}
export function endShot(w: WorldApi, i: number): void { const ES = core(w).ES; if (i >= 0) ES.release(i); }
/**
 * The core's own enemy shots fired during the last step (owner ≥ 0, one step old): 反照 adds a
 * projectile beside each, 小雪 slows them. `fn` gets the pool index.
 */
export function freshCoreShots(w: WorldApi, fn: (i: number) => void): void {
  const W = core(w), ES = W.ES, dt = W.dt;
  for (let i = 0; i < ES.n; i++) {
    if (!ES.alive[i] || ES.owner[i] < 0 || ES.mode[i] === SMode.Lob) continue;
    const age = ES.life0[i] - ES.life[i];
    if (age > 0 && age <= dt * 1.5) fn(i);
  }
}
export function shotView(w: WorldApi, i: number): { x: number; y: number; vx: number; vy: number; r: number; life: number; dmg: number; kind: number } {
  const ES = core(w).ES;
  return { x: ES.x[i], y: ES.y[i], vx: ES.vx[i], vy: ES.vy[i], r: ES.r[i], life: ES.life[i], dmg: ES.dmg[i], kind: ES.kind[i] };
}
export function scaleShot(w: WorldApi, i: number, speedX: number): void {
  const ES = core(w).ES;
  ES.vx[i] *= speedX; ES.vy[i] *= speedX; ES.life[i] /= speedX; ES.life0[i] /= speedX;
}
/** Re-fire a copy of core shot i turned by `ang` radians (its owner kept, marked as a copy). */
export function copyShot(w: WorldApi, i: number, ang: number): void {
  const W = core(w), ES = W.ES;
  const c = Math.cos(ang), s = Math.sin(ang);
  const vx = ES.vx[i] * c - ES.vy[i] * s, vy = ES.vx[i] * s + ES.vy[i] * c;
  const sp = W.diff.shotSpeed ?? 1;
  const kind = PK_NAMES[ES.kind[i]] ?? 'eOrb';
  const j = W.enemyShot(kind, ES.x[i], ES.y[i], vx / sp, vy / sp, ES.r[i], ES.life[i] * sp, ES.dmg[i], false, ES.homing[i], ES.status[i], ES.statusDur[i], ES.statusV[i], -1);
  if (j >= 0) ES.mode[j] = ES.mode[i];
}
const PK_NAMES: string[] = [];
for (const k in PK) PK_NAMES[PK[k as keyof typeof PK]] = k;

// ─────────────────────────────────────────────── telegraphs and zones

/**
 * A live telegraph: a shape drawn as wet ink whose fill content sets by hand (moving shock rings,
 * the mirage wall). It never strikes; content tests the player itself. Returns an id or −1.
 */
export function liveTele(w: WorldApi, shape: TeleShape, fill = 0.9): number {
  const W = core(w);
  const id = W.coreTele(shape, 1e6, 0, -1, 0, null);
  if (id >= 0) { const i = id % 1024; W.T.dur[i] = 1e6; W.T.t[i] = fill * 1e6; }
  return id;
}
const teleSlot = (w: WorldApi, id: number) => {
  const T = core(w).T, i = id % 1024;
  return id >= 0 && i < T.cap && T.alive[i] && T.gen[i] === Math.floor(id / 1024) ? i : -1;
};
/** The shape object of a live telegraph (mutate it in place; replace a ring's `gaps` array to change them). */
export function teleShape(w: WorldApi, id: number): TeleShape | null { const i = teleSlot(w, id); return i < 0 ? null : core(w).T.shape[i]; }
export function teleFill(w: WorldApi, id: number, k: number): void { const i = teleSlot(w, id); if (i >= 0) { const T = core(w).T; T.t[i] = Math.max(0, Math.min(0.999, k)) * T.dur[i]; } }
export function endTele(w: WorldApi, id: number): void {
  const i = teleSlot(w, id);
  if (i < 0) return;
  const T = core(w).T;
  T.release(i); T.fn[i] = null;
}
const zoneSlot = (w: WorldApi, id: number) => {
  const Z = core(w).Z, i = id % 1024;
  return id >= 0 && i < Z.cap && Z.alive[i] && Z.gen[i] === Math.floor(id / 1024) ? i : -1;
};
export function zoneAlive(w: WorldApi, id: number): boolean { return zoneSlot(w, id) >= 0; }
export function moveZone(w: WorldApi, id: number, x: number, y: number, r?: number): void {
  const i = zoneSlot(w, id);
  if (i < 0) return;
  const Z = core(w).Z;
  Z.x[i] = x; Z.y[i] = y;
  if (r !== undefined) Z.r[i] = r;
}
export function zonePos(w: WorldApi, id: number): { x: number; y: number; r: number } | null {
  const i = zoneSlot(w, id);
  if (i < 0) return null;
  const Z = core(w).Z;
  return { x: Z.x[i], y: Z.y[i], r: Z.r[i] };
}
/** A stretched effect along a segment (beams, streaks, lightning). */
export function fxLine(w: WorldApi, name: FxName, x: number, y: number, dir: number, len: number, life: number, width = 1): void {
  core(w).fxLine(name, x, y, dir, len, life, width);
}
/** Any baked atlas sprite as a short-lived effect (the renderer draws `a:b` names as atlas ids). */
export function fxSprite(w: WorldApi, atlas: AtlasId, x: number, y: number, r: number, life: number): void {
  w.fx(atlas as unknown as FxName, x, y, { r, life });
}
export function particlesFree(w: WorldApi): number { const P = core(w).P; return P.cap - P.count; }

// ─────────────────────────────────────────────── the floor and rewards

/** Eat every 月华 on the floor within r of (x, y); returns the worth eaten (金蟾王). */
export function eatMoon(w: WorldApi, x: number, y: number, r: number): number {
  const D = core(w).D, r2 = r * r;
  let got = 0;
  for (let i = 0; i < D.n; i++) {
    if (!D.alive[i] || D.age[i] < 0.25) continue;
    const k = D.kind[i];
    if (k !== DK.moonDrop && k !== DK.moonThick && k !== DK.moonFull && k !== DK.goldShard) continue;
    const dx = D.x[i] - x, dy = D.y[i] - y;
    if (dx * dx + dy * dy > r2) continue;
    got += D.worth[i];
    D.release(i);
  }
  return got;
}
/** Drop `worth` 月华 at (x, y) as ordinary moon drops. */
export function dropMoon(w: WorldApi, x: number, y: number, worth: number): void { if (worth > 0) core(w).dropMoon(x, y, worth); }
/** One gold 月华 shard (a shard, never a coin) worth `worth`. */
export function dropGold(w: WorldApi, x: number, y: number, worth: number): void { core(w).dropOne(DK.goldShard, x, y, worth, -1); }
/** An extra 镜奁 that opens at the wave end (秋分). */
export function addCrate(w: WorldApi, x: number, y: number): void {
  const W = core(w);
  W.crates++;
  W.dropOne(DK.crateBox, x, y, 1, -1);
  W.hooks.crate(W.crates);
  W.sfx('crate');
}

// ─────────────────────────────────────────────── m8 · lane blocks (PLAN §3.5 U2): append-only, each lane under its own anchor
// ── m8:items ──
// ── m8:hidden ──
