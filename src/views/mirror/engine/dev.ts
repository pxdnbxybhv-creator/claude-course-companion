// 水月幻镜 · DEV hooks on window.__mirror (dev builds only): spawn, set the wave, give items and
// weapons, godmode, perf stats and a synthetic load probe for measuring the simulation.
import type { ItemId, MonsterId, EliteId, TreasureId, WeaponId } from '../ids';
import type { RunSave, Tier } from '../types';
import { ITEMS, WEAPONS } from '../data';
import { computeStats } from '../logic/formulas';
import { wavePlan } from '../logic/spawn';
import { SF, SMode } from './pools';
import { PK, SK } from './consts';
import type { MirrorEngine } from './index';

export interface MirrorDev {
  engine: MirrorEngine;
  spawn(id: MonsterId | EliteId | TreasureId, n?: number): number;
  /** Restart as wave w with the current run (plan rebuilt; coins none). */
  wave(w: number): void;
  give(id: ItemId | WeaponId, t?: Tier): void;
  god(on?: boolean): boolean;
  perf(): { simMs: number; drawMs: number; canvasMs: number; lastSim: number; lastDraw: number; steps: number; enemies: number; pshots: number; eshots: number; swords: number; summons: number; fps: number };
  /** Fill the field to a load: enemies, player shots, swords, summons (for measuring). */
  load(o: { enemies?: number; shots?: number; eshots?: number; swords?: number; summons?: number }): void;
  step(n: number): number;
}

export function installDev(engine: MirrorEngine): void {
  let dev = false;
  try { dev = !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV; } catch { dev = false; }
  if (!dev || typeof window === 'undefined') return;
  (window as unknown as { __mirror: MirrorDev }).__mirror = devApi(engine);
}

/** The dev API over an engine (also used directly by tests). */
export function devApi(engine: MirrorEngine): MirrorDev {
  const W = engine.world;
  const restart = (run: RunSave, w: number) => {
    const next: RunSave = { ...run, wave: w - 1, inWave: w };
    const stats = computeStats(next);
    engine.start(next, { wave: w, plan: wavePlan(next, w), coins: [], mutators: [], term: next.term, sky: { fullMoonDay: false, lunation: 0.5, fullWave: false }, stats });
  };
  return {
    engine,
    spawn(id, n = 1) {
      let c = 0;
      for (let k = 0; k < n; k++) if (W.spawn(id, null, null, { bloom: false }) >= 0) c++;
      return c;
    },
    wave(w) { restart(W.run, w); },
    give(id, t = 1) {
      const run = W.run;
      let next: RunSave;
      if ((WEAPONS as Record<string, unknown>)[id]) next = { ...run, weapons: [...run.weapons, { id: id as WeaponId, t }].slice(-6) };
      else if ((ITEMS as Record<string, unknown>)[id]) next = { ...run, items: { ...run.items, [id]: (run.items[id as ItemId] ?? 0) + 1 } };
      else return;
      restart(next, W.wave || 1);
    },
    god(on = !W.godmode) { W.godmode = on; return on; },
    perf() {
      let swords = W.blades + W.canjian + W.idleSwords;
      for (let i = 0; i < W.PS.n; i++) if (W.PS.alive[i] && (W.PS.flags[i] & SF.sword)) swords++;
      return {
        simMs: W.perf.simMs, drawMs: W.perf.drawMs, canvasMs: W.perf.canvasMs, lastSim: W.perf.lastSim, lastDraw: W.perf.lastDraw, steps: W.perf.steps,
        enemies: W.E.count, pshots: W.PS.count, eshots: W.ES.count, swords, summons: W.S.count, fps: W.fps,
      };
    },
    load(o) { fillLoad(engine, o); },
    step(n) { const t0 = performance.now(); engine.stepN(n); return (performance.now() - t0) / Math.max(1, n); },
  };
}

/** A synthetic load: bodies around you, shots in flight, swords, 墨宝. */
export function fillLoad(engine: MirrorEngine, o: { enemies?: number; shots?: number; eshots?: number; swords?: number; summons?: number }): void {
  const W = engine.world;
  const rng = W.erng;
  const ids: MonsterId[] = ['blot', 'paperman', 'lantern', 'shard'];
  for (let k = 0; k < (o.enemies ?? 0); k++) {
    const a = rng() * Math.PI * 2, d = 120 + rng() * 520;
    W.spawn(ids[k % ids.length], W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false });
  }
  for (let k = 0; k < (o.shots ?? 0); k++) {
    const i = W.PS.spawnSlot();
    if (i < 0) break;
    const a = rng() * Math.PI * 2, v = 500;
    W.PS.x[i] = W.px; W.PS.y[i] = W.py; W.PS.vx[i] = Math.cos(a) * v; W.PS.vy[i] = Math.sin(a) * v; W.PS.speed[i] = v;
    W.PS.life[i] = W.PS.life0[i] = 1e6; W.PS.kind[i] = PK.dartStar; W.PS.dmg[i] = 0.001; W.PS.r[i] = 6; W.PS.pierce[i] = 30000;
    W.PS.flags[i] = SF.projectile | SF.pierceAll; W.PS.mode[i] = SMode.BoomOut;
  }
  for (let k = 0; k < (o.swords ?? 0); k++) {
    const i = W.PS.spawnSlot();
    if (i < 0) break;
    const a = rng() * Math.PI * 2, v = 600;
    W.PS.x[i] = W.px; W.PS.y[i] = W.py; W.PS.vx[i] = Math.cos(a) * v; W.PS.vy[i] = Math.sin(a) * v; W.PS.speed[i] = v;
    W.PS.life[i] = W.PS.life0[i] = 1e6; W.PS.kind[i] = PK.flySword; W.PS.dmg[i] = 0.001; W.PS.r[i] = 8; W.PS.pierce[i] = 30000;
    W.PS.flags[i] = SF.sword | SF.pierceAll; W.PS.mode[i] = SMode.Homing; W.PS.homing[i] = 4;
  }
  for (let k = 0; k < (o.eshots ?? 0); k++) {
    const a = rng() * Math.PI * 2;
    const i = W.enemyShot('eOrb', W.px + Math.cos(a) * 500, W.py + Math.sin(a) * 500, -Math.cos(a) * 60, -Math.sin(a) * 60, 8, 1e6, 0, false, 0, 0, 0, 0, -1);
    void i;
  }
  for (let k = 0; k < (o.summons ?? 0); k++) {
    const i = W.S.take();
    if (i < 0) break;
    const S = W.S;
    S.kind[i] = SK.moque; S.x[i] = W.px + (rng() - 0.5) * 100; S.y[i] = W.py + (rng() - 0.5) * 100; S.hp[i] = S.hpMax[i] = 1e9; S.life[i] = S.life0[i] = 1e9;
    S.capped[i] = 1; S.slot[i] = -1; S.target[i] = -1; S.order[i] = ++W.summonOrder; S.dragon[i] = 0; S.r[i] = 11; S.dmg[i] = 1; S.cd[i] = 0.7; S.atkT[i] = 0.3;
    S.critP[i] = 0; S.critM[i] = 1; S.knock[i] = 0; S.flash[i] = 0; S.contactT[i] = 0; S.st[i] = 0;
  }
}
