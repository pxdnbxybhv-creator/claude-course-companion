// 水月幻镜 · engine-core regressions from the engine QA round: 提子's capture rate, pierce-all hit
// sets, 醉拳 IV's crit reset, held movement across pause, the frame-time guard, no elite hitstop, re-entrant
// scratch buffers, guarded UI hooks, coins with a full drop pool, 重墨 overflow targets, kill events of
// splitters, wilting weeds, 纸伞妖 vs 墨宝, the 竹鼠 surfacing pause.
import { describe, expect, it } from 'vitest';
import type {
  BossEvent, CoinDrop, ContentRegistry, DeathResult, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveResult, WaveSetup,
} from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { captureGap } from '../src/views/mirror/engine/weapons';
import { ST } from '../src/views/mirror/engine/enemies';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
interface Log { coins: CoinDrop[]; boss: BossEvent[]; ends: WaveResult[]; deaths: DeathResult[]; errors: { e: unknown; fatal: boolean }[] }
function make(run: RunSave, o: { content?: ContentRegistry; settings?: Partial<EngineSettings>; hooks?: Partial<EngineHooks> } = {}): { eng: MirrorEngine; log: Log } {
  const log: Log = { coins: [], boss: [], ends: [], deaths: [], errors: [] };
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: () => {}, coin: (d) => log.coins.push(d),
    boss: (ev) => log.boss.push(ev), waveEnd: (r) => log.ends.push(r), death: (d) => log.deaths.push(d), error: (e, fatal) => log.errors.push({ e, fatal }),
    ...o.hooks,
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...o.settings };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio: SILENT, content: o.content ?? EMPTY, hooks, settings }) as MirrorEngine;
  return { eng, log };
}
function setupFor(run: RunSave, coins: CoinDrop[] | null = null): { run: RunSave; setup: WaveSetup } {
  const r = beginWave(run);
  const setup = waveSetup(r, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  return { run: r, setup: coins ? { ...setup, coins } : setup };
}
const withWeapons = (run: RunSave, ws: [WeaponId, 1 | 2 | 3 | 4][]): RunSave => ({ ...run, weapons: ws.map(([id, t]) => ({ id, t })) });
/** A quiet arena: no planned spawns, endless, you cannot die. */
function quiet(eng: MirrorEngine): MirrorEngine['world'] {
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  return W;
}
/** Count hits by weapon slot `slot` per enemy slot (wraps World.strike). */
function countHits(W: MirrorEngine['world'], slot: number | null): Map<number, number> {
  const hits = new Map<number, number>();
  const s0 = W.strike.bind(W);
  (W as unknown as { strike: typeof W.strike }).strike = (i, ...a) => {
    const d = s0(i, ...a);
    if (d > 0 && (slot === null || a[6] === slot)) hits.set(i, (hits.get(i) ?? 0) + 1);
    return d;
  };
  return hits;
}

describe('engine-core fixes: weapons', () => {
  it('提子 captures one body per capture at the balance sim rate, and keeps its stones', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3, char: 'player' })), [['gobowl', 1]]), wave: 5, items: { capture: 1 } });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    W.slots[0].cd = 1e9;
    const ex = W.px + 250, ey = W.py;
    const h = W.spawn('crab', ex, ey, { bloom: false });
    const i = W.E.slotOf(h);
    W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0; W.E.resist[i] = 1;
    for (let k = 0; k < 3; k++) {
      const j = W.ST.take(); const a = k * 2.094;
      W.ST.x[j] = ex + Math.cos(a) * 50; W.ST.y[j] = ey + Math.sin(a) * 50; W.ST.arm[j] = 0; W.ST.life[j] = 1e9; W.ST.slot[j] = 0; W.ST.order[j] = k; W.ST.fuse[j] = 0;
    }
    const hits = countHits(W, 0);
    eng.stepN(600);
    const gap = captureGap(W);
    expect(gap).toBeGreaterThan(1.3);
    // 10 s: one capture at once, then one per gap
    expect(hits.get(i) ?? 0).toBeGreaterThanOrEqual(Math.floor(10 / gap));
    expect(hits.get(i) ?? 0).toBeLessThanOrEqual(Math.ceil(10 / gap) + 1);
    expect(W.ST.count).toBe(3);
    eng.dispose();
  });

  it('a 月轮 disc hits each body of a packed crowd at most twice (out and back)', () => {
    for (const [wid, t] of [['moonwheel', 1], ['yanyue', 4]] as const) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 31 })), [[wid, t]]), wave: 5 });
      const { eng } = make(run);
      eng.start(run, setup);
      const W = quiet(eng);
      W.slots[0].cd = 1e9;
      for (let k = 0; k < 50; k++) {
        const h = W.spawn('blot', W.px + 260 + (k % 7) * 30, W.py - 90 + Math.floor(k / 7) * 30, { bloom: false });
        const i = W.E.slotOf(h); W.E.hp[i] = W.E.hpMax[i] = 1e9; W.E.dmg[i] = 0;
      }
      eng.stepN(50);
      const hits = countHits(W, 0);
      W.slots[0].cd = 0; W.slots[0].n = wid === 'yanyue' ? 3 : 0;
      eng.stepN(1);
      W.slots[0].cd = 1e9;
      eng.stepN(120);
      expect(hits.size).toBeGreaterThan(5);
      expect(Math.max(...hits.values())).toBeLessThanOrEqual(2);
      eng.dispose();
    }
  });

  it('醉拳 IV: a crit resets the cooldown (at most twice the attack rate, as in the sim)', () => {
    const n: number[] = [];
    for (const t of [3, 4] as const) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3, char: 'scholar' })), [['drunkfist', t]]), wave: 5, stats: { crit: 200 } });
      const { eng } = make(run);
      eng.start(run, setup);
      const W = quiet(eng);
      const h = W.spawn('crab', W.px + 50, W.py, { bloom: false });
      const i = W.E.slotOf(h); W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0; W.E.resist[i] = 1;
      eng.stepN(600);
      n.push(W.slots[0].n);
      eng.dispose();
    }
    expect(n[1]).toBeGreaterThan(n[0] * 1.6);
    expect(n[1]).toBeLessThanOrEqual(Math.ceil(n[0] * 2 / 0.85) + 2);
  });

  it('纸伞妖 deflects shots but not a 砚台 ink blob (summons get through)', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3, char: 'painter', map: 'forest' })), [['inkstone', 1]]), wave: 8 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const h = W.spawn('umbrella', W.px + 200, W.py, { bloom: false });
    const i = W.E.slotOf(h); W.E.hp[i] = W.E.hpMax[i] = 1e9; W.E.speed[i] = 0; W.E.dmg[i] = 0;
    const hits = countHits(W, null);
    for (let f = 0; f < 600; f++) { W.E.face[i] = Math.PI; W.E.st[i] = ST.move; W.E.cool[i] = 99; eng.stepN(1); }
    expect(hits.get(i) ?? 0).toBeGreaterThan(5);
    eng.dispose();
  });
});

describe('engine-core fixes: the world', () => {
  it('a kill handler that calls hitArea does not change what an outer pulse hits', () => {
    const content = { ...EMPTY, passives: { zhiyin: { start: () => ({}), on: (w: { hitArea: (x: number, y: number, r: number, pk: object) => number }, _s: unknown, ev: { type: string; x: number; y: number }) => { if (ev.type === 'kill') w.hitArea(ev.x, ev.y, 50, { base: 0.001, src: 'item', crit: false }); } } } } as unknown as ContentRegistry;
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3, char: 'musician' })), [['qin', 1]]), wave: 5 });
    const { eng, log } = make(run, { content });
    eng.start(run, setup);
    const W = quiet(eng);
    const tough: number[] = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2, d = 50 + (k % 4) * 20;
      const h = W.spawn('blot', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false });
      const i = W.E.slotOf(h);
      W.E.hp[i] = W.E.hpMax[i] = k % 2 ? 1e9 : 0.5; W.E.speed[i] = 0; W.E.dmg[i] = 0; W.E.armor[i] = 0;
      if (k % 2) tough.push(i);
    }
    const hits = countHits(W, 0);
    const s = W.slots[0];
    s.cd = 0; W.beat = true;
    for (let k = 0; k < 40 && s.n === 0; k++) eng.stepN(1);
    // every body that could not die was hit by the one pulse, exactly once
    for (const i of tough) expect(hits.get(i)).toBe(1);
    expect(log.errors).toEqual([]);
    eng.dispose();
  });

  it('a throwing UI hook is logged, not counted as an engine error', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run, { hooks: { hud: () => { throw new Error('HUD ref gone'); } } });
    const err = console.error;
    console.error = () => {};
    try {
      eng.start(run, setup);
      eng.world.godmode = true;
      eng.stepN(60);
      // a hooks object swapped in later is guarded too
      eng.world.hooks = { ...eng.world.hooks, hud: () => { throw new Error('again'); } };
      eng.stepN(60);
    } finally { console.error = err; }
    expect(log.errors).toEqual([]);
    expect(eng.phase).toBe('wave');
    eng.dispose();
  });

  it('pause keeps held movement: after resume you keep moving', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    eng.input.move(1, 0);
    eng.pause();
    eng.resume();
    const x0 = W.px;
    eng.stepN(60);
    expect(W.moveX).toBe(1);
    expect(W.px - x0).toBeGreaterThan(100);
    eng.dispose();
  });

  it('the frame-time guard trips on slow frames (the real interval, not our JS time) and recovers', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    let now = 1000;
    for (let f = 0; f < 60; f++) { now += 40; eng.frame(now); }  // 25 fps for 2.4 s
    expect(W.degrade).toBe(1);
    expect(W.perf.drawMs).toBeGreaterThan(20);
    for (let f = 0; f < 60 * 12; f++) { now += 1000 / 60; eng.frame(now); }
    expect(W.degrade).toBe(0);
    // a tab switch (one 5 s gap) is not a slow device
    now += 5000; eng.frame(now);
    for (let f = 0; f < 150; f++) { now += 1000 / 60; eng.frame(now); }
    expect(W.degrade).toBe(0);
    eng.dispose();
  });

  it('striking an elite never stops the world: the elite itself flashes, freezes and staggers (打击感)', () => {
    const ws: [WeaponId, 1 | 2 | 3 | 4][] = [['casket', 4], ['claw', 4], ['dart', 4], ['repeater', 4], ['longquan', 4], ['thunder', 4]];
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3, char: 'scholar' })), ws), wave: 11, stats: { aspd: 120, crit: 60 } });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const h = W.spawn('turtle', W.px + 60, W.py, { bloom: false });
    const i = W.E.slotOf(h); W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0;
    const t0 = W.tWave;
    const F = W.feel, st0 = { ...F.st };
    let now = 1000;
    for (let f = 0; f < 600; f++) { now += 1000 / 60; eng.frame(now); }
    expect(W.tWave - t0).toBeGreaterThanOrEqual(9.95); // full game speed (it used to stop 30 ms twice a second)
    expect(F.st.stopMs - st0.stopMs).toBe(0);
    expect(F.st.pulses - st0.pulses).toBeGreaterThan(100); // … the elite shows every hit instead
    expect(F.st.freezes - st0.freezes).toBeGreaterThan(5);
    expect(F.st.staggers - st0.staggers).toBe(0); // (immortal: 1e12 HP never reaches a stagger's 8%)
    eng.dispose();
  });

  it('a planned 铜钱 reaches the sleeve when the drop pool is full', () => {
    const plan = [{ kind: 'cashString', worth: 5, src: 'wave', k: 1 }] as CoinDrop[];
    const { run, setup } = setupFor(withWeapons(newRun(opts()), []), plan);
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    W.len = setup.plan.len;
    W.drop('moonDrop', 600, 300, 300);
    for (let k = 0; k < 60; k++) W.drop('lotusSeed', -600 + k * 3, -300, 1);
    expect(W.D.count).toBe(W.D.cap);
    W.kill(W.spawn('blot', 200, 0, { bloom: false }));
    eng.stepN(60);
    W.beginEnding();
    for (let k = 0; k < 200 && W.phase !== 'idle'; k++) eng.stepN(1);
    expect(log.coins.length).toBe(1);
    expect(log.ends[0].sleeve).toEqual(plan);
    // a pool with nothing to evict (all seeds): the coin goes straight into the sleeve
    const { run: r2, setup: s2 } = setupFor(withWeapons(newRun(opts({ seed: 9 })), []), plan);
    const b = make(r2);
    b.eng.start(r2, s2);
    const W2 = quiet(b.eng);
    for (let k = 0; k < W2.D.cap; k++) W2.drop('lotusSeed', -600 + (k % 60) * 3, -300, 1);
    W2.kill(W2.spawn('blot', 200, 0, { bloom: false }));
    expect(b.log.coins.length).toBe(1);
    eng.dispose(); b.eng.dispose();
  });

  it('重墨 overflow never feeds a body that drops nothing; with none left it goes to 蓄月', () => {
    const { run, setup } = setupFor(withWeapons(newRun(opts({ map: 'palace' })), []));
    const { eng } = make(run, { settings: { quality: 'low' } });
    eng.start(run, setup);
    const W = quiet(eng);
    let n = 0;
    while (W.cappedAlive() < W.capEnemies && n < 400) { W.spawn('guihua', 300 + (n % 10) * 20, ((n / 10) | 0) * 20, { noDrops: true }); n++; }
    const cost0: number[] = [];
    for (let i = 0; i < W.E.n; i++) cost0[i] = W.E.cost[i];
    const store0 = W.store;
    for (let k = 0; k < 20; k++) W.spawn('guihua', 0, 300, {});
    for (let i = 0; i < W.E.n; i++) if (W.E.alive[i] && W.E.noDrops[i]) expect(W.E.cost[i]).toBe(cost0[i]);
    expect(W.store - store0).toBeGreaterThan(30);
    eng.dispose();
  });

  it("a splitter's kill event names the weapon slot; a wilting 水草缠 is not a kill", () => {
    const evs: { slot: number; src: string }[] = [];
    const content = { ...EMPTY, passives: { zhiyin: { start: () => ({}), on: (_w: unknown, _s: unknown, ev: { type: string; slot: number; src: string }) => { if (ev.type === 'kill') evs.push({ slot: ev.slot, src: ev.src }); } } } } as unknown as ContentRegistry;
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3, char: 'musician' })), [['qin', 1]]), wave: 12 });
    const { eng } = make(run, { content });
    eng.start(run, setup);
    const W = quiet(eng);
    const h = W.spawn('shard', W.px + 60, W.py, { bloom: false });
    W.strike(W.E.slotOf(h), 1e6, 0, 1, 0, W.px, W.py, 0, 0, 0);
    expect(evs[evs.length - 1]).toEqual({ slot: 0, src: 'weapon' });
    const k0 = W.kills, e0 = evs.length;
    const wh = W.spawn('weed', null, null, { bloom: true });
    W.px += 400;
    W.slots[0].cd = 1e9;
    eng.stepN(60 * 9);
    expect(W.alive(wh)).toBe(false);
    expect(W.kills).toBe(k0);
    expect(evs.length).toBe(e0);
    expect(W.killsBy.weed ?? 0).toBe(0);
    eng.dispose();
  });

  it('a 竹鼠 surfaces, shakes off the dust (targetable, still), then chases', () => {
    const { run, setup } = setupFor(withWeapons(newRun(opts({ map: 'forest' })), []));
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const h = W.spawn('rat', W.px + 400, W.py, { bloom: false });
    const i = W.E.slotOf(h);
    W.E.st[i] = ST.under; W.E.untarget[i] = 1;
    let surfaced = -1;
    for (let f = 0; f < 120 && surfaced < 0; f++) { eng.stepN(1); if (!W.E.untarget[i]) surfaced = f; }
    expect(surfaced).toBeGreaterThan(0);
    const x0 = W.E.x[i];
    eng.stepN(20);
    expect(Math.abs(W.E.x[i] - x0)).toBeLessThan(2);
    eng.stepN(20);
    expect(Math.abs(W.E.x[i] - x0)).toBeGreaterThan(20);
    eng.dispose();
  });
});
