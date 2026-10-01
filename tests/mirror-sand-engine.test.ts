// 水月幻镜 · m8 · the engine's sandbox knobs (sandbox.md §6.3, §11): setTimeScale(x) runs the world x times as
// fast on real vsync stamps (60 and 120 Hz, with the frame snapping and the accumulator's phase untouched: slow
// motion steps 0 or 1 a frame, never 2; fast steps a steady whole number), cdX 0 makes the skill ready after a
// cast, both reset at every start, and the enemy knobs scale the plan the engine is given.
import { describe, expect, it } from 'vitest';
import type { EngineHooks, EngineSettings, MirrorAudio, RunSave, WaveSetup } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta, mirror } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { createSandSession, ENEMY_RANGE, knobPlan, leaveSand, openSand } from '../src/views/mirror/ui/sand/session';

const DAY = '2026-09-30';
const AUDIO: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;
const hooks = (): EngineHooks => ({ hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} });
const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };

function at(w: number, char: RunSave['char'] = 'musician'): { run: RunSave; setup: WaveSetup } {
  const r0 = newRun({
    seed: 21, char, map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 0, free: false, runIndex: 0, rate: 0,
    startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
  const r = beginWave({ ...r0, wave: w - 1, weapons: r0.weapons.length ? r0.weapons : [{ id: 'qingfeng', t: 1 }] });
  return { run: r, setup: waveSetup(r, defaultMeta(DAY), new Date(2026, 8, 30, 20)) };
}
function engineAt(w = 6): { eng: MirrorEngine; run: RunSave; setup: WaveSetup } {
  const { run, setup } = at(w);
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, 'high', 1), audio: AUDIO, content: CONTENT, hooks: hooks(), settings }) as MirrorEngine;
  eng.start(run, setup);
  eng.world.godmode = true;
  return { eng, run, setup };
}
/** Drive `frames` vsyncs at `hz` from `now`; returns the world clock's advance per frame (in steps). */
function drive(eng: MirrorEngine, hz: number, frames: number, now = 1000): { per: number[]; now: number } {
  const per: number[] = [];
  let t = eng.world.t;
  for (let f = 0; f < frames; f++) {
    now += 1000 / hz;
    eng.frame(now);
    per.push(Math.round((eng.world.t - t) * 60 * 1000) / 1000);
    t = eng.world.t;
  }
  return { per, now };
}

describe('setTimeScale', () => {
  for (const hz of [60, 120]) {
    for (const x of [0.25, 0.5, 2, 3]) {
      it(`${hz} Hz × ${x}: the world runs ${x} times as fast, at a steady cadence`, () => {
        const a = engineAt();
        const base = drive(a.eng, hz, 240);
        const t1 = a.eng.world.t;
        a.eng.dispose();
        const b = engineAt();
        b.eng.setTimeScale(x);
        const run = drive(b.eng, hz, 240);
        const tx = b.eng.world.t;
        b.eng.dispose();
        // (the first frames learn the display: compare the steady part)
        const steady = (p: number[]) => p.slice(40).reduce((s, v) => s + v, 0);
        expect(steady(run.per) / steady(base.per)).toBeCloseTo(x, 1);
        expect(tx / t1).toBeGreaterThan(x * 0.85);
        expect(tx / t1).toBeLessThan(x * 1.15);
        const perFrame = (x * 60) / hz; // steps a frame on average
        for (const v of run.per.slice(40)) {
          // whole steps only, and never more than the next whole number above the average (no 0-2 judder)
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeLessThanOrEqual(Math.ceil(perFrame - 1e-9));
          if (perFrame >= 1) expect(v).toBeGreaterThanOrEqual(Math.floor(perFrame + 1e-9));
        }
      });
    }
  }

  it('non-finite or non-positive scales are 1; start() puts it back to 1', () => {
    const { eng, run, setup } = engineAt();
    eng.setTimeScale(Number.NaN);
    const a = drive(eng, 60, 120);
    eng.setTimeScale(-2);
    const b = drive(eng, 60, 60, a.now);
    expect(b.per.slice(10).every((v) => v === 1)).toBe(true);
    eng.setTimeScale(3);
    eng.start(run, setup);
    eng.world.godmode = true;
    const c = drive(eng, 60, 120, b.now + 5000);
    expect(c.per.slice(20).every((v) => v === 1)).toBe(true);
    eng.dispose();
  });
});

describe('cdX (the skill cooldown ×)', () => {
  it('0 makes the skill ready as soon as its cast ends; start() puts it back to 1', () => {
    const { eng, run, setup } = engineAt();
    const W = eng.world;
    W.cdX = 0; // set after start: every begin resets it
    eng.stepN(30);
    eng.skill();
    for (let k = 0; k < 600 && W.skillRun; k++) eng.stepN(1);
    expect(W.skillRun).toBeNull();
    expect(W.skillCd).toBe(0);
    // a quarter
    W.cdX = 0.25;
    eng.skill();
    for (let k = 0; k < 600 && W.skillRun; k++) eng.stepN(1);
    expect(W.skillCd).toBeLessThanOrEqual(W.skillCdMax * 0.25 + 1e-9);
    expect(W.skillCd).toBeGreaterThan(W.skillCdMax * 0.25 - 0.1);
    eng.start(run, setup);
    expect(eng.world.cdX).toBe(1);
    eng.dispose();
  });
});

describe('the enemy knobs', () => {
  it('scale HP, damage and speed of the plan the engine gets; density scales the groups; the ranges hold', () => {
    const { setup } = at(20);
    const p = knobPlan(setup.plan, { hp: 2, dmg: 0.5, spd: 1.5, density: 2 });
    expect(p.hpX).toBeCloseTo(setup.plan.hpX * 2, 12);
    expect(p.dmgX).toBeCloseTo(setup.plan.dmgX * 0.5, 12);
    expect(p.spdX).toBeCloseTo(setup.plan.spdX * 1.5, 12);
    expect(p.groups.length).toBe(setup.plan.groups.length);
    for (let i = 0; i < p.groups.length; i++) expect(p.groups[i].n).toBe(Math.max(1, Math.round(setup.plan.groups[i].n * 2)));
    expect(knobPlan(setup.plan, { hp: 1, dmg: 1, spd: 1, density: 1 })).toBe(setup.plan);
    expect(setup.plan.hpX).toBe(at(20).setup.plan.hpX); // the logic's plan is never changed

    mirror.value = defaultMeta(DAY);
    openSand();
    try {
      const s = createSandSession({ char: 'scholar', map: 'lake', diff: 1, vows: {}, wave: 20, seed: 4, heart: 'own', mastery: 'own', pool: 'all', build: 'bare', today: DAY, arrive: 'fight' });
      s.setEnemy({ hp: 99, dmg: -1, spd: 2, density: Number.NaN });
      expect(s.enemy()).toEqual({ hp: ENEMY_RANGE.hp[1], dmg: ENEMY_RANGE.dmg[0], spd: 2, density: 1 });
      const plain = at(20, 'scholar');
      const { setup: st } = s.startWave(s.run());
      expect(st.coins).toEqual([]);
      expect(st.plan.spdX).toBeGreaterThan(plain.setup.plan.spdX * 1.5);
      expect(st.plan.dmgX).toBe(0);
      // live: new spawns follow the knobs at once
      const eng = createEngine(canvas(), s.run(), { painter: createDebugPainter('lake', 'high', 1), audio: AUDIO, content: CONTENT, hooks: hooks(), settings }) as MirrorEngine;
      eng.start(s.run(), st);
      s.attach(eng);
      const hpAt10 = st.plan.hpX; // (the engine plays this very plan object: a live knob writes into it)
      s.setEnemy({ hp: 3 });
      expect(eng.world.plan.hpX).toBeCloseTo((hpAt10 / ENEMY_RANGE.hp[1]) * 3, 9);
      s.attach(null);
      eng.dispose();
    } finally {
      leaveSand();
    }
  });
});
