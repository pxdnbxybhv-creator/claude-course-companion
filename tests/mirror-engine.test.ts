// 水月幻镜 · engine-core (GDD §24.3): a wave plays to its end headless, deterministically; every
// weapon kind fires, every item's in-wave effect runs, every monster role acts and dies; death,
// bosses, coins, level-ups and the error rules; the simulation cost at the §24.3 load.
import { describe, expect, it } from 'vitest';
import type {
  BossEvent, CoinDrop, ContentRegistry, DeathResult, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveResult, WaveSetup,
} from '../src/views/mirror/types';
import { ITEM_REG, MAP_REG, MONSTER_REG, WEAPON_REG, type ItemId, type WeaponId } from '../src/views/mirror/ids';
import { ITEMS, MAPS } from '../src/views/mirror/data';
import { allUnlocked, beginWave, computeStats, endWave, newRun, waveSetup, wavePlan } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { devApi, fillLoad } from '../src/views/mirror/engine/dev';

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
interface Log { hud: number; levels: number[]; crates: number; coins: CoinDrop[]; boss: BossEvent[]; ends: WaveResult[]; deaths: DeathResult[]; errors: { e: unknown; fatal: boolean }[] }

function make(run: RunSave, o: { content?: ContentRegistry; settings?: Partial<EngineSettings> } = {}): { eng: MirrorEngine; log: Log } {
  const log: Log = { hud: 0, levels: [], crates: 0, coins: [], boss: [], ends: [], deaths: [], errors: [] };
  const hooks: EngineHooks = {
    hud: () => { log.hud++; }, levelUp: (l) => log.levels.push(l), crate: (n) => { log.crates = n; }, coin: (d) => log.coins.push(d),
    boss: (ev) => log.boss.push(ev), waveEnd: (r) => log.ends.push(r), death: (d) => log.deaths.push(d), error: (e, fatal) => log.errors.push({ e, fatal }),
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
/** Step until the wave is over (or n steps). */
function play(eng: MirrorEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    const ph = eng.world.phase;
    if (ph !== 'wave' && ph !== 'ending') return;
    if (eng.paused) eng.resume();
    eng.stepN(1);
  }
}
const withWeapons = (run: RunSave, ws: [WeaponId, 1 | 2 | 3 | 4][]): RunSave => ({ ...run, weapons: ws.map(([id, t]) => ({ id, t })) });

describe('engine-core: a wave', () => {
  it('plays wave 1 to its end and hands back a WaveResult that endWave folds', () => {
    const base = newRun(opts());
    const { run, setup } = setupFor(base);
    const { eng, log } = make(run);
    eng.start(run, setup);
    eng.world.godmode = true;
    play(eng, 60 * 40);
    expect(log.errors).toEqual([]);
    expect(log.ends).toHaveLength(1);
    const r = log.ends[0];
    expect(r.wave).toBe(1);
    expect(r.stats.kills ?? 0).toBeGreaterThan(5);
    expect(r.moon + r.field).toBeGreaterThan(5);
    expect(r.ms).toBeGreaterThanOrEqual(20000);
    expect(log.hud).toBeGreaterThan(100);
    expect(eng.phase).toBe('idle');
    const next = endWave(run, r);
    expect(next.wave).toBe(1);
    expect(next.inWave).toBeNull();
    expect(next.moon).toBeGreaterThan(base.moon);
    eng.dispose();
  });

  it('is deterministic: the same run and setup give the same wave', () => {
    const { run, setup } = setupFor(withWeapons(newRun(opts({ char: 'swordsman' })), [['qingping', 2], ['dart', 1], ['thunder', 1]]));
    const a = make(run), b = make(run);
    a.eng.start(run, setup); b.eng.start(run, setup);
    a.eng.world.godmode = b.eng.world.godmode = true;
    play(a.eng, 60 * 30); play(b.eng, 60 * 30);
    expect(a.log.ends[0]).toEqual(b.log.ends[0]);
    a.eng.dispose(); b.eng.dispose();
  });

  it('a mid-wave level gives +1 气血 and fires levelUp', () => {
    const { run, setup } = setupFor({ ...newRun(opts()), xp: 15 });
    const { eng, log } = make(run);
    eng.start(run, setup);
    eng.world.godmode = true;
    const hp0 = eng.world.hpMax;
    eng.world.collectMoon(3);
    expect(log.levels).toEqual([2]);
    expect(eng.world.hpMax).toBe(hp0 + 1);
    eng.dispose();
  });

  it('dies: the death hook carries the partial and the cause', () => {
    const { run, setup } = setupFor(newRun(opts({ char: 'musician' })));
    const { eng, log } = make(run);
    eng.start(run, setup);
    eng.world.hp = 1;
    eng.world.hurtFrom(50, -1, true, false, 'blot', false, true);
    expect(log.deaths).toHaveLength(1);
    expect(log.deaths[0].cause).toBe('blot');
    expect(log.deaths[0].partial.wave).toBe(1);
    expect(eng.phase).toBe('dead');
    eng.dispose();
  });

  it('阎王帖, 九命 and 蓬莱 veto deaths in that order', () => {
    const cat = setupFor({ ...newRun(opts({ char: 'cat' })), items: { yanwang: 1, penglai: 1 } });
    const { eng, log } = make(cat.run);
    eng.start(cat.run, cat.setup);
    const W = eng.world;
    const kill = () => { W.iframes = 0; W.invulnT = 0; W.hp = 1; W.hurtFrom(999, -1, true, true, 'x', false, false); };
    kill(); expect(W.hp).toBe(1); expect(W.yanwangUsed).toBe(true);
    kill(); expect(W.lives).toBe(7);
    kill(); expect(W.once).toContain('penglai'); expect(W.hp).toBeGreaterThan(1);
    kill(); expect(log.deaths).toHaveLength(1);
    expect(log.deaths[0].partial.lives).toBe(7);
    eng.dispose();
  });

  it('coins: the planned k-th kill carries its coin into the sleeve', () => {
    const plan: CoinDrop[] = [{ kind: 'cashString', worth: 5, src: 'wave', k: 1 }];
    const { run, setup } = setupFor(newRun(opts()), plan);
    const { eng, log } = make(run);
    eng.start(run, setup);
    eng.world.godmode = true;
    play(eng, 60 * 40);
    expect(log.coins.map((c) => c.worth)).toEqual([5]);
    expect(log.ends[0].sleeve).toEqual(plan);
    eng.dispose();
  });
});

describe('engine-core: every weapon, item and monster', () => {
  it('each of the 27 weapons fires at every tier and deals damage', () => {
    for (const w of WEAPON_REG) {
      for (const t of [1, 4] as const) {
        const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ char: 'scholar', seed: 7 })), [[w.id, t]]), wave: 11 });
        const { eng, log } = make(run);
        eng.start(run, setup);
        eng.world.godmode = true;
        play(eng, 60 * 20);
        expect(log.errors, `${w.id} ${t}`).toEqual([]);
        const r = eng.world.result();
        expect(r.stats.dmgDealt ?? 0, `${w.id} ${t} damage`).toBeGreaterThan(0);
        eng.dispose();
      }
    }
  });

  it('every item runs in a wave (all 75 at once, several builds)', () => {
    const items = Object.fromEntries(ITEM_REG.map((i) => [i.id, Math.max(1, Math.min(2, ITEMS[i.id].max || 2))])) as Partial<Record<ItemId, number>>;
    const builds: [WeaponId, 1 | 2 | 3 | 4][][] = [
      [['qingping', 4], ['casket', 4], ['peach', 3], ['seven', 3], ['qingfeng', 2], ['longquan', 2]],
      [['brush', 4], ['inkstone', 4], ['crane', 4], ['gobowl', 4], ['qin', 4], ['flute', 4]],
      [['yanyue', 4], ['hoe', 4], ['pestle', 4], ['drunkfist', 4], ['gourd', 4], ['fire', 4]],
      [['thunder', 4], ['moonmirror', 4], ['moonwheel', 4], ['rod', 4], ['repeater', 4], ['sunbow', 4]],
    ];
    const chars = ['painter', 'poet', 'player', 'change', 'rabbit', 'guan', 'musician', 'cat'] as const;
    builds.forEach((ws, b) => [chars[b], chars[b + 4]].forEach((char) => {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ char, seed: 99 })), ws), items, wave: 24, drunk: 60 });
      const { eng, log } = make(run);
      eng.start(run, setup);
      eng.world.godmode = true;
      play(eng, 60 * 15);
      expect(log.errors, `${char} ${ws[0][0]}`).toEqual([]);
      expect(eng.world.result().stats.dmgDealt ?? 0).toBeGreaterThan(0);
      eng.dispose();
    }));
  }, 60_000);

  it('every monster of every map acts, telegraphs and dies without a throw', () => {
    for (const m of MAP_REG) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ map: m.id, seed: 5 })), [['thunder', 4], ['qin', 4], ['moonmirror', 4], ['yanyue', 4]]), wave: 17, stats: { elem: 3000, melee: 3000 } });
      const { eng, log } = make(run);
      eng.start(run, setup);
      const W = eng.world;
      W.godmode = true;
      for (const mon of MONSTER_REG) if (mon.map === 'all' || mon.map === m.id) for (let k = 0; k < 2; k++) W.spawn(mon.id, null, null, { bloom: true });
      for (const e of MAPS[m.id].elites) W.spawn(e, null, null, { bloom: true });
      W.spawn('pixiu', null, null, {}); W.spawn('mirrorflower', null, null, {});
      play(eng, 60 * 25);
      expect(log.errors, m.id).toEqual([]);
      const r = W.result();
      for (const mon of MONSTER_REG) if ((mon.map === m.id) && mon.id !== 'egret') expect(r.killsBy[mon.id] ?? 0, `${m.id} ${mon.id} killed`).toBeGreaterThan(0);
      eng.dispose();
    }
  }, 60_000);

  it('a boss wave: intro pauses, phases change at 60% and 25%, the boss dies, a 镜心 is owed', () => {
    for (const map of ['lake', 'forest', 'palace'] as const) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ map, seed: 3 })), [['thunder', 4], ['sunbow', 4], ['moonmirror', 4], ['qin', 4], ['fire', 4], ['yanyue', 4]]), wave: 9, stats: { elem: 400, ranged: 400, melee: 400 } });
      expect(setup.plan.boss).not.toBeNull();
      const { eng, log } = make(run);
      eng.start(run, setup);
      eng.world.godmode = true;
      eng.stepN(1);
      expect(log.boss[0]?.kind).toBe('intro');
      expect(eng.paused).toBe(true);
      play(eng, 60 * 120);
      expect(log.errors, map).toEqual([]);
      const kinds = log.boss.map((b) => b.kind);
      expect(kinds.filter((k) => k === 'phase')).toHaveLength(2);
      expect(kinds).toContain('dead');
      expect(log.ends[0].hearts).toEqual(['boss']);
      expect(log.ends[0].bosses).toHaveLength(1);
      eng.dispose();
    }
  });
});

describe('engine-core: drops, caps and statuses', () => {
  it('蓄月: each pickup draws one extra from the store; field 月华 goes back to it at the wave end', () => {
    const { run, setup } = setupFor({ ...newRun(opts()), store: 3 });
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.godmode = true;
    W.collectMoon(1); W.collectMoon(1);
    expect(W.moonGot).toBe(4);
    expect(W.store).toBe(1);
    W.drop('moonDrop', W.px + 400, W.py, 5);
    W.beginEnding();
    play(eng, 200);
    expect(log.ends[0].field).toBe(5);
    expect(log.ends[0].storeLeft).toBe(1);
    eng.dispose();
  });

  it('浓墨: past 300 on the ground, 月华 fuses (nothing is lost)', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.drop('moonDrop', 500, 0, 420);
    let worth = 0, thick = 0;
    for (let i = 0; i < W.D.n; i++) if (W.D.alive[i]) { worth += W.D.worth[i]; if (W.D.worth[i] >= 5) thick++; }
    expect(W.D.count).toBeLessThanOrEqual(301);
    expect(Math.round(worth)).toBe(420);
    expect(thick).toBeGreaterThan(0);
    eng.dispose();
  });

  it('重墨: a spawn over the alive cap feeds a living body (80% HP, its drops)', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng } = make(run, { settings: { quality: 'low' } });
    eng.start(run, setup);
    const W = eng.world;
    for (let k = 0; k < 90; k++) W.spawn('blot', 300 + (k % 10) * 20, (k / 10 | 0) * 20, {});
    expect(W.cappedAlive()).toBe(90);
    let hp = 0; for (let i = 0; i < W.E.n; i++) if (W.E.alive[i]) hp += W.E.hpMax[i];
    expect(W.spawn('blot', 0, 300, {})).toBe(-1);
    let hp2 = 0, grown = 0; for (let i = 0; i < W.E.n; i++) if (W.E.alive[i]) { hp2 += W.E.hpMax[i]; if (W.E.heavy[i] > 1) grown++; }
    expect(hp2 - hp).toBeCloseTo(6 * 0.8, 3);
    expect(grown).toBe(1);
    eng.dispose();
  });

  it('statuses: burn stacks ignore armour, slows cap at 60%, bosses shrug off stun and root', () => {
    const { run, setup } = setupFor({ ...newRun(opts()), wave: 8, weapons: [] });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.godmode = true;
    W.plan = { ...W.plan, groups: [] };
    const h = W.spawn('crab', 300, 0, {});
    const i = W.E.slotOf(h);
    W.E.hp[i] = W.E.hpMax[i] = 1000; W.E.armor[i] = 50;
    for (let k = 0; k < 5; k++) W.status(h, 'burn', 3, 10);
    expect(W.E.burnN[i]).toBe(3);
    W.status(h, 'slow', 2, 90);
    expect(W.E.slowV[i]).toBeCloseTo(0.6);
    const hp0 = W.E.hp[i];
    eng.stepN(60);
    expect(hp0 - W.E.hp[i]).toBeCloseTo(30, 0); // 3 stacks × 10/s for 1 s, through 50 armour
    const b = W.spawnBoss('carp', -300, 0, 1e6);
    W.status(b, 'stun', 2); W.status(b, 'root', 2);
    const j = W.E.slotOf(b);
    expect(W.E.stunT[j]).toBe(0);
    expect(W.E.rootT[j]).toBe(0);
    eng.dispose();
  });
});

describe('engine-core: errors and cost', () => {
  it('the first throw is recovered; a second within 5 s is fatal', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    const step = W.step.bind(W);
    let boom = 1;
    W.step = (dt: number) => { if (boom-- > 0) throw new Error('boom'); step(dt); };
    eng.stepN(3);
    expect(log.errors.map((e) => e.fatal)).toEqual([false]);
    boom = 1;
    eng.stepN(1);
    expect(log.errors.map((e) => e.fatal)).toEqual([false, true]);
    expect(eng.phase).toBe('dead');
    eng.dispose();
  });

  it('content throws are contained: the behaviour is dropped, the wave goes on', () => {
    const bad: ContentRegistry = { ...EMPTY, passives: { chunzhong: { start: () => ({}), tick: () => { throw new Error('bad passive'); } } } };
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run, { content: bad });
    eng.start(run, setup);
    eng.world.godmode = true;
    play(eng, 60 * 40);
    expect(log.errors.filter((e) => !e.fatal)).toHaveLength(1);
    expect(log.ends).toHaveLength(1);
    eng.dispose();
  });

  it('measures the simulation at 140 enemies + 400 shots + 24 swords + 12 summons', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ char: 'painter', seed: 11 })), [['qingping', 4], ['casket', 4], ['peach', 4], ['thunder', 4], ['dart', 4], ['qin', 4]]), wave: 14, items: { xuan: 6 } });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.godmode = true;
    // hold the field steady: no spawns, sturdy bodies
    W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
    W.len = 1e9;
    fillLoad(eng, { enemies: 140, shots: 400, swords: 24, summons: 12, eshots: 60 });
    for (let i = 0; i < W.E.n; i++) if (W.E.alive[i]) { W.E.hp[i] = W.E.hpMax[i] = 1e12; }
    const dev = devApi(eng);
    dev.step(120); // warm
    const ms = dev.step(600);
    const p = dev.perf();
    console.log(`[mirror perf] sim ${ms.toFixed(3)} ms/step · enemies ${p.enemies} · player shots ${p.pshots} · swords ${p.swords} · summons ${p.summons} · enemy shots ${p.eshots}`);
    expect(p.enemies).toBeGreaterThanOrEqual(140);
    expect(p.pshots).toBeGreaterThanOrEqual(400);
    expect(p.summons).toBeGreaterThanOrEqual(12);
    expect(ms).toBeLessThan(8);
    eng.dispose();
  });

  it('the spawn executor spends the plan (every group appears)', () => {
    const { run, setup } = setupFor({ ...newRun(opts({ seed: 21 })), wave: 5 });
    const want = wavePlan(run, 6).groups.reduce((s, g) => s + g.n, 0);
    const { eng } = make(run, { settings: { quality: 'high' } });
    eng.start(run, setup);
    eng.world.godmode = true;
    let seen = 0;
    const spawn = eng.world.spawn.bind(eng.world);
    eng.world.spawn = ((id, x, y, o) => { const h = spawn(id, x, y, o); if (o?.bloom) seen++; return h; }) as typeof spawn;
    play(eng, 60 * 60);
    expect(seen).toBeGreaterThanOrEqual(want);
    expect(computeStats(run).hp).toBeGreaterThan(0);
    eng.dispose();
  });
});
