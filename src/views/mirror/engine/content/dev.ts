// 水月幻镜 · content DEV hooks on window.__mirrorContent (dev builds only; they ride the core's
// window.__mirror.engine): jump to any boss and phase, force a phase, start a hazard, 镜蚀 or 节气
// mid-wave, spawn an elite with affixes, refill the 镜技, and read the live bosses' runner state.
import type { AffixId, BossId, EliteId, HazardId, MapId, MutatorId, TermModId, TreasureId } from '../../ids';
import type { RunSave, WaveSetup, WorldApi } from '../../types';
import { BOSSES } from '../../data';
import { computeStats } from '../../logic/formulas';
import { wavePlan } from '../../logic/spawn';
import type { MirrorEngine } from '../index';
import { core } from './bridge';
import { bossState, forcePhase } from './bosses';
import { AFFIX_IMPLS } from './elites';
import { HAZARD_IMPLS, MUTATOR_IMPLS, TERM_IMPLS } from './field';
import { addAffix } from './bridge';

export interface ContentDev {
  /** Restart as wave `wave` on `map` (its roster baked first), optionally as another companion. */
  play(map: MapId, wave: number, o?: { char?: RunSave['char']; term?: TermModId | null; mutators?: { id: MutatorId; x: number }[] }): Promise<void>;
  /** Restart as the fight with boss `id` (its map and wave; 'twins' = wave 40, 'mirrorself' = 50), then force `phase`. */
  boss(id: BossId | 'twins' | 'mirrorself', phase?: number, o?: { daoxuan?: boolean; diff?: number }): Promise<void>;
  /** Push every live boss into phase p (0–3). */
  phase(p: number): void;
  /** The live bosses: id, phase, HP fraction, enrage level, running patterns. */
  bosses(): { id: string; phase: number; hp: number; enrage: number; running: number; fx: number }[];
  /** Jump the fight clock (enrage starts at 90 s). */
  fightTime(sec: number): void;
  skill(): void;
  /** Start a hazard / 镜蚀 / 节气 now, whatever the map or day. */
  hazard(id: HazardId): void;
  mutator(id: MutatorId, x?: number): void;
  term(id: TermModId): void;
  elite(id: EliteId, affixes?: AffixId[]): number;
  treasure(id: TreasureId): number;
}

function engine(): MirrorEngine | null {
  const g = globalThis as unknown as { __mirror?: { engine?: MirrorEngine } };
  return g.__mirror?.engine ?? null;
}

export function contentDev(getEngine: () => MirrorEngine | null = engine): ContentDev {
  const W = () => getEngine()?.world ?? null;
  const w = () => W() as unknown as WorldApi;
  return {
    async play(map, wave, o = {}) {
      const eng = getEngine();
      const world = W();
      if (!eng || !world) return;
      const run = world.run;
      const next: RunSave = { ...run, map, char: o.char ?? run.char, term: o.term === undefined ? run.term : o.term, wave: wave - 1, inWave: wave };
      const setup: WaveSetup = {
        wave, plan: wavePlan(next, wave), coins: [], mutators: o.mutators ?? [], term: next.term,
        sky: { fullMoonDay: false, lunation: 0.5, fullWave: wave % 2 === 1 }, stats: computeStats(next),
      };
      try { const P = world.painter; if (P) await P.bake([...P.plan(next, 'start'), ...(wave > 30 ? P.plan(next, 'endless') : [])]); } catch { /* placeholders */ }
      eng.start(next, setup);
    },
    async boss(id, phase = 0, o = {}) {
      const eng = getEngine();
      const world = W();
      if (!eng || !world) return;
      const run = world.run;
      const def = id === 'twins' || id === 'mirrorself' ? null : BOSSES[id];
      const wave = def ? def.wave : id === 'twins' ? 40 : 50;
      const map: MapId = def ? def.map : run.map;
      const vows = o.daoxuan ? { ...run.vows, daoxuan: 1 } : run.vows;
      const next: RunSave = { ...run, map, wave: wave - 1, inWave: wave, vows, diff: (o.diff ?? run.diff) as RunSave['diff'] };
      const stats = computeStats(next);
      const setup: WaveSetup = { wave, plan: wavePlan(next, wave), coins: [], mutators: [], term: next.term, sky: { fullMoonDay: false, lunation: 0.5, fullWave: false }, stats };
      // bake the boss (and, on another map, that map's roster) first; the arena repaints on start
      try {
        const P = world.painter;
        if (P) await P.bake([...(map !== run.map ? P.plan(next, 'start') : []), ...P.plan(next, 'boss'), ...(wave > 30 ? P.plan(next, 'endless') : [])]);
      } catch { /* placeholder circles then */ }
      eng.start(next, setup);
      // the intro card would resume the engine; the dev hook does it after the first step
      eng.stepN(1);
      if (eng.paused) eng.resume();
      if (phase > 0) this.phase(phase);
    },
    phase(p) {
      const world = W();
      if (!world) return;
      for (const h of world.bossH) {
        if (bossState(w(), h)) forcePhase(w(), h, p);
        else if (p > 0 && world.alive(h)) { const e = world.enemy(h); e.hp = Math.min(e.hp, e.hpMax * 0.49); } // 镜主 breaks at 50%
      }
    },
    bosses() {
      const world = W();
      if (!world) return [];
      const out: ReturnType<ContentDev['bosses']> = [];
      for (const h of world.bossH) {
        if (!world.alive(h)) continue;
        const e = world.enemy(h);
        const st = bossState(w(), h);
        out.push({ id: e.id, phase: st?.phase ?? 0, hp: e.hp / e.hpMax, enrage: st?.enrage ?? 0, running: st?.running.length ?? 0, fx: st?.fx.length ?? 0 });
      }
      return out;
    },
    fightTime(sec) {
      const world = W();
      if (!world) return;
      for (const h of world.bossH) { const st = bossState(w(), h); if (st) st.fightT = sec; }
    },
    skill() { const world = W(); if (world) { world.skillCd = 0; world.castSkill(null, null); } },
    hazard(id) { const world = W(); if (world) start(world, HAZARD_IMPLS[id]); },
    mutator(id, x = 1) { const world = W(); if (world) start(world, MUTATOR_IMPLS[id], x); },
    term(id) { const world = W(); if (world) start(world, TERM_IMPLS[id]); },
    elite(id, affixes = []) {
      const world = W();
      if (!world) return -1;
      const h = world.spawn(id, world.px + 260, world.py, { bloom: true });
      for (const a of affixes) { const impl = AFFIX_IMPLS[a]; if (impl) addAffix(w(), h, impl); }
      return h;
    },
    treasure(id) { const world = W(); return world ? world.spawn(id, world.px + 200, world.py, { bloom: true, capped: false }) : -1; },
  };
}
/** Start a behaviour mid-wave through the core's own list (so it ticks, hears events and ends). */
function start(world: NonNullable<ReturnType<typeof core>>, b: Parameters<typeof world['running']['push']>[0]['b'] | undefined, x?: number): void {
  if (!b) return;
  const r = { b, s: undefined as unknown, failed: false };
  try { r.s = b.start ? b.start(world, x) : undefined; } catch (e) { r.failed = true; console.warn('[mirror content] dev start', e); }
  world.running.push(r);
}

export function installContentDev(): void {
  let dev = false;
  try { dev = !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV; } catch { dev = false; }
  if (!dev || typeof window === 'undefined') return;
  (window as unknown as { __mirrorContent: ContentDev }).__mirrorContent = contentDev();
}
