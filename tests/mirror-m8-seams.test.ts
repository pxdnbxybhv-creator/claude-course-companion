// 水月幻镜 · round 8, Lane 0 (build plan §3.6): the seams every lane builds on are in place and change nothing
// while unused — the `wip` stubs are offered nowhere, 劫's 月华 reads F.curseMoon, the one walking-speed formula
// equals the old clamps and reads CLAMP live, a real save never carries `sand`, the time scale and cdX at 1 are
// no-ops, the hurtFrom and own-月华 seams do what their contracts say, and no hidden companion reaches the
// app's CHARACTER table.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NewRunOpts, RunSave, WaveResult, WaveSetup } from '../src/views/mirror/types';
import { HIDDEN_CHARS, isHidden } from '../src/views/mirror/types';
import { COMPANION_REG, ITEM_REG, type ItemId } from '../src/views/mirror/ids';
import { CLAMP, COMPANIONS, F, ITEMS, SKILLS } from '../src/views/mirror/data';
import {
  HIDDEN_BY_MAP, HIDDEN_MIN_DIFF, HIDDEN_WAVE, allUnlocked, applySheet, beginWave, computeStats, condHolds, crateItem, curseOf,
  dailySpec, deepestOn, endWave, heartOffer, itemPool, moveCapOf, moveSpeed, moveSpeedOf, newRun, noWeapons, openShop, setPlusOf,
  setTiers, shopFloor, validateRun, waveSetup,
} from '../src/views/mirror/logic';
import { appOpen } from '../src/views/mirror/logic/session';
import { unlocked } from '../src/app/play';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { DK } from '../src/views/mirror/engine/consts';
import type { EngineHooks, EngineSettings, MirrorAudio } from '../src/views/mirror/types';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const WIP = new Set(ITEM_REG.map((r) => r.id).filter((id) => ITEMS[id].wip));

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 777, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
function make(run: RunSave): { eng: MirrorEngine; ends: WaveResult[]; errors: unknown[] } {
  const ends: WaveResult[] = [], errors: unknown[] = [];
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: (r) => ends.push(r), death: () => {},
    error: (e) => { errors.push(e); },
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio: SILENT, content: CONTENT, hooks, settings }) as MirrorEngine;
  return { eng, ends, errors };
}
function at(w: number, o: Partial<NewRunOpts> = {}, patch: Partial<RunSave> = {}): { run: RunSave; setup: WaveSetup } {
  const run = beginWave({ ...newRun(opts(o)), wave: w - 1, ...patch });
  return { run, setup: waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)) };
}
/** Everything a wave's simulation leaves behind that a seam could have nudged. */
function fingerprint(eng: MirrorEngine) {
  const W = eng.world;
  return { t: W.t, px: W.px, py: W.py, hp: W.hp, moonHeld: W.moonHeld, kills: W.kills, enemies: W.E.count, drops: W.D.count, skillCd: W.skillCd, res: W.result() };
}

describe('m8 seams · the stubs are offered nowhere', () => {
  it('has 26 wip items, none a relic, each with a registry row', () => {
    // (ITEMS removes `wip` item by item as each one's test passes: tests/mirror-m8-items.test.ts)
    expect(WIP.size).toBeLessThanOrEqual(26);
    for (const id of WIP) expect(ITEMS[id].relic).toBeUndefined();
  });

  it('no wip item in 1,000 seeded shops, crates, 镜心 offers and 行囊 packs, nor in a year of daily boons', () => {
    const u = allUnlocked();
    const waves = [1, 4, 8, 13, 20, 30, 40];
    for (let seed = 1; seed <= 1000; seed++) {
      const w = waves[seed % waves.length];
      const run = { ...newRun(opts({ seed, heart: { heartPack: 1 } })), wave: w - 1 };
      for (const id in run.items) expect(WIP.has(id as ItemId), `pack ${seed}`).toBe(false);
      const shop = openShop(run, u).shop!;
      for (const s of shop.slots) if (s && s.kind === 'item') expect(WIP.has(s.id), `shop ${seed}`).toBe(false);
      const withCrate = { ...run, wave: w, pending: { ...run.pending, crates: 1, hearts: ['boss' as const] } };
      expect(WIP.has(crateItem(withCrate, u)), `crate ${seed}`).toBe(false);
      for (const id of heartOffer(withCrate, u)) expect(WIP.has(id), `heart ${seed}`).toBe(false);
    }
    for (const t of [1, 2, 3, 4] as const) for (const id of itemPool(newRun(opts()), u, t, 40)) expect(WIP.has(id)).toBe(false);
    const meta = { mapsOpen: 3, deeds: {} } as Parameters<typeof dailySpec>[1];
    for (let d = 0; d < 365; d++) {
      const day = new Date(2026, 0, 1 + d);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` as Parameters<typeof dailySpec>[0];
      const spec = dailySpec(key, meta, ['scholar', 'musician']);
      if (spec.boon) expect(WIP.has(spec.boon), key).toBe(false);
    }
  });

  it('the new shop readers are neutral for a run without the new items', () => {
    const run = newRun(opts());
    expect(shopFloor(run)).toBe(1);
    expect(noWeapons(run)).toBe(false);
    expect(setPlusOf(run)).toBe(0);
    expect(moveCapOf(run)).toBe(Infinity);
  });
});

describe('m8 seams · logic', () => {
  it('moveSpeedOf equals the old clamp over −100…+200 身法 and reads CLAMP live', () => {
    const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
    for (let s = -100; s <= 200; s += 0.5) {
      const old = F.baseSpeed * (1 + clamp(s, -60, 100) / 100);
      expect(moveSpeedOf({ speed: s })).toBe(old);
      expect(moveSpeed({ ...computeStats(newRun(opts())), speed: s })).toBe(old);
      // the 镜主's and 貔貅's old literals
      expect(moveSpeedOf({ speed: s }) * 0.8).toBe(280 * (1 + clamp(s, -60, 100) / 100) * 0.8);
      expect(moveSpeedOf({ speed: s })).toBe(280 * (1 + Math.max(-60, Math.min(100, s)) / 100));
    }
    const C = CLAMP as { speedMax: number };
    const was = C.speedMax;
    try {
      C.speedMax = 50;
      expect(moveSpeedOf({ speed: 100 })).toBe(F.baseSpeed * 1.5);
    } finally { C.speedMax = was; }
    expect(moveSpeedOf({ speed: 100 })).toBe(F.baseSpeed * 2);
    // 画地为牢's cap: at most x × the base pace
    expect(moveSpeedOf({ speed: 100 }, 0.5)).toBe(F.baseSpeed * 0.5);
    expect(moveSpeedOf({ speed: -50 }, 0.5)).toBe(F.baseSpeed * 0.5);
  });

  it('the sandbox sheet and curse are no-ops when absent, and act when present', () => {
    const run = newRun(opts());
    const s0 = computeStats(run);
    expect(computeStats({ ...run, sand: undefined })).toEqual(s0);
    expect(applySheet({ ...s0 }, undefined)).toEqual(s0);
    const s1 = computeStats({ ...run, sand: { sheet: [{ id: 'aspd', mode: 'add', v: 30 }, { id: 'luck', mode: 'set', v: 7 }], curse: 0 } });
    expect(s1.aspd).toBe(s0.aspd + 30);
    expect(s1.luck).toBe(7);
    expect(curseOf(run)).toBe(0);
    expect(curseOf({ ...run, sand: { sheet: [], curse: 3 } })).toBe(3);
  });

  it('knows the moving cond and the hidden companions’ dodge halving', () => {
    const live = { waveTime: 10, hpFrac: 1, still: 0.2, swordsAir: 0, weapons: 1 };
    expect(condHolds({ k: 'moving', s: 0.35 }, live)).toBe(true);
    expect(condHolds({ k: 'moving', s: 0.35 }, { ...live, still: 0.5 })).toBe(false);
    for (const c of COMPANION_REG) if (!isHidden(c.id)) expect(COMPANIONS[c.id].dodgeMult).toBeUndefined();
    expect(COMPANIONS.yuenv.dodgeMult).toBe(0.5);
    expect(setTiers({ weapons: [], items: {} })).toEqual({});
  });

  it('a real save never carries `sand`; `lent` is shape-checked; shop counters round-trip only when present', () => {
    const run: RunSave = {
      ...newRun(opts()), sand: { sheet: [{ id: 'dmg', mode: 'add', v: 50 }], curse: 4 },
      lent: { heart: { heartPack: 1, bogus: 9 } as never, mastery: 10 },
    };
    const back = validateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back).not.toBeNull();
    expect(back.sand).toBeUndefined();
    expect(back.lent).toEqual({ heart: { heartPack: 1 }, mastery: 10 });
    const plain = newRun(opts());
    const shopped = openShop(plain, allUnlocked());
    expect(validateRun(JSON.parse(JSON.stringify(shopped)))).toEqual(shopped);
    const counted = { ...shopped, shop: { ...shopped.shop!, rolls: 3, upgrades: 1 } };
    expect(validateRun(JSON.parse(JSON.stringify(counted)))!.shop).toEqual(counted.shop);
  });

  it('the hidden unlock constants follow the owner’s words (any 镜境), and deepestOn reads bests', () => {
    expect(HIDDEN_WAVE).toBe(40);
    expect(HIDDEN_MIN_DIFF).toBe(0);
    expect(HIDDEN_BY_MAP).toEqual({ lake: 'yuenv', forest: 'shangui', palace: 'houyi' });
    const bests = { 'scholar|lake|0|0': { wave: 41, heat: 0, at: '2026-09-27' }, 'poet|forest|3|2|p': { wave: 22, heat: 2, at: '2026-09-27' } } as never;
    expect(deepestOn({ bests }, 'lake')).toBe(41);
    expect(deepestOn({ bests }, 'lake', 1)).toBe(0);
    expect(deepestOn({ bests }, 'forest')).toBe(22);
    expect(deepestOn({ bests }, 'palace')).toBe(0);
  });

  it('endWave takes lost 月华 once and never goes below 0', () => {
    const { run } = at(5);
    const base = { wave: 5, moon: 20, xp: 20, field: 0, storeLeft: 0, levels: 0, crates: 0, hearts: [], sleeve: [], lives: run.lives, once: run.once, drunk: 0, stats: {}, killsBy: {}, byWeapon: {}, bosses: [], ms: 30000 } as unknown as WaveResult;
    const a = endWave(run, base), b = endWave(run, { ...base, lost: 7 });
    expect(b.moon).toBe(a.moon - 7);
    expect(endWave(run, { ...base, lost: 1e9 }).moon).toBe(0);
    expect(endWave(b, { ...base, lost: 7 })).toBe(b); // a folded wave never folds twice
  });
});

describe('m8 seams · the hidden companions stay behind their guards', () => {
  it('appOpen is false for the hidden three and follows the app roster for the 13', () => {
    for (const id of HIDDEN_CHARS) expect(appOpen(id)).toBe(false);
    for (const c of COMPANION_REG) if (!isHidden(c.id)) expect(appOpen(c.id)).toBe(unlocked.value.includes(c.id as never));
  });

  it('no hidden id reaches the app’s CHARACTER table: every read in the mirror is behind isHidden', () => {
    const root = join(__dirname, '../src/views/mirror');
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    walk(root);
    const reads: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => { if (/\bCHARACTER\[/.test(l) && !/^\s*(\/\/|\*)/.test(l)) reads.push(`${f.slice(root.length + 1)}:${i + 1}: ${l.trim()}`); });
    }
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r, r).toMatch(/isHidden\([^)]*\)\s*\?\s*undefined\s*:\s*CHARACTER\[/);
  });

  it('every hidden companion has its registry rows, data and a skill impl (the stubs)', () => {
    for (const id of HIDDEN_CHARS) {
      const c = COMPANIONS[id];
      expect(SKILLS[c.skill].char).toBe(id);
      expect(CONTENT.skills[c.skill]).toBeTruthy();
    }
    expect(CONTENT.items).toEqual({});
  });
});

describe('m8 seams · engine', () => {
  it('劫\'s 月华 reads F.curseMoon: 0 and 0.2 give different 月华 on the same seed (and 0.02 is today\'s)', () => {
    const F_ = F as { curseMoon: number };
    expect(F_.curseMoon).toBe(0.02); // BALANCE B1 (PLAN D4): 0.03 → 0.02 once the engine reads it
    const moonWith = (x: number) => {
      const was = F_.curseMoon;
      F_.curseMoon = x;
      try {
        const { run, setup } = at(4, { seed: 4242, char: 'swordsman' }, { items: { cuthair: 5 } as RunSave['items'], weapons: [{ id: 'qingping', t: 2 }, { id: 'yanyue', t: 2 }] });
        const { eng } = make(run);
        eng.start(run, setup);
        eng.world.godmode = true;
        eng.stepN(60 * 25);
        const W = eng.world;
        let ground = 0;
        for (let i = 0; i < W.D.n; i++) if (W.D.alive[i] && (W.D.kind[i] === DK.moonDrop || W.D.kind[i] === DK.moonThick)) ground += W.D.worth[i];
        const r = W.moonGot + ground;
        eng.dispose();
        return r;
      } finally { F_.curseMoon = was; }
    };
    const a = moonWith(0), b = moonWith(0.2);
    expect(a).toBeGreaterThan(0);
    expect(b).not.toBe(a);
    expect(b).toBeGreaterThan(a);
  });

  it('setTimeScale(1) and cdX 1 change nothing; the scale does speed the world up', () => {
    const run0 = () => at(6, { seed: 99, char: 'musician' });
    const drive = (scale: number | null) => {
      const { run, setup } = run0();
      const { eng } = make(run);
      eng.start(run, setup);
      eng.world.godmode = true;
      if (scale !== null) eng.setTimeScale(scale);
      let now = 1000;
      for (let f = 0; f < 60 * 8; f++) { now += 1000 / 60; eng.frame(now); if (f === 120) eng.skill(); }
      const fp = fingerprint(eng);
      eng.dispose();
      return fp;
    };
    const a = drive(null), b = drive(1);
    expect(b).toEqual(a);
    const c = drive(2);
    expect(c.t).toBeGreaterThan(a.t * 1.5);
    // cdX 1: the cooldown after a cast is the skill's own
    const { run, setup } = run0();
    const { eng } = make(run);
    eng.start(run, setup);
    eng.world.godmode = true;
    expect(eng.world.cdX).toBe(1);
    eng.stepN(30);
    eng.skill();
    for (let k = 0; k < 60 * 10 && eng.world.skillRun; k++) eng.stepN(1);
    expect(eng.world.skillRun).toBeNull();
    expect(eng.world.skillCd).toBeLessThanOrEqual(eng.world.skillCdMax);
    expect(eng.world.skillCd).toBeGreaterThan(eng.world.skillCdMax - 0.1);
    eng.dispose();
  });

  it('skillPress on a tap skill is today’s cast; skillRelease does nothing', () => {
    const { run, setup } = at(6, { seed: 5, char: 'scholar' });
    const { eng } = make(run);
    eng.start(run, setup);
    eng.world.godmode = true;
    eng.stepN(30);
    eng.skillPress(10);
    expect(eng.world.skillRun !== null || eng.world.skillCd > 0).toBe(true);
    const cd = eng.world.skillCd, running = eng.world.skillRun;
    eng.skillRelease({ x: 1, y: 0 }, 10.2);
    expect(eng.world.skillCd).toBe(cd);
    expect(eng.world.skillRun).toBe(running);
    eng.dispose();
  });

  it('hurtFrom: the guard comes after invuln and before i-frames, scalers act before armour, afterHurt sees the blow', () => {
    const { run, setup } = at(3, { seed: 11 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.stats.dodge = 0;
    // (blows well under your HP: a lethal one would end the wave)
    const calls: string[] = [];
    const fresh = () => { W.iframes = 0; W.invulnT = 0; W.hp = W.hpMax; W.blocks = 0; };
    // no hooks: an ordinary blow
    fresh();
    const d0 = W.hurtFrom(12, -1, true, false, 'test', false, false);
    expect(d0).toBeGreaterThan(0);
    // the guard catches: nothing lands, no i-frames
    fresh();
    W.guardHook = (n, attacker, shot, src) => { calls.push(`guard ${n} ${attacker} ${shot} ${src}`); return true; };
    expect(W.hurtFrom(12, -1, true, false, 'test', false, false, 3)).toBe(0);
    expect(W.hp).toBe(W.hpMax);
    expect(W.iframes).toBe(0);
    expect(calls).toEqual(['guard 12 -1 3 test']);
    // invuln first: the guard is not asked
    fresh(); W.invulnT = 1;
    expect(W.hurtFrom(12, -1, true, false, 'test', false, false)).toBe(0);
    expect(calls.length).toBe(1);
    // i-frames after the guard: a guard that lets it through, then the i-frames stop it
    fresh(); W.iframes = 0.3; W.guardHook = () => { calls.push('asked'); return false; };
    expect(W.hurtFrom(12, -1, true, false, 'test', false, false)).toBe(0);
    expect(calls[calls.length - 1]).toBe('asked');
    // a DoT never meets the guard
    fresh(); calls.length = 0;
    W.hurtFrom(12, -1, true, true, 'test', true, false);
    expect(calls).toEqual([]);
    W.guardHook = null;
    // scalers before armour, then afterHurt with what landed
    fresh();
    W.hurtScalers.push(() => 0.5);
    W.afterHurt.push((d, n, attacker, shot, src) => calls.push(`after ${d} ${n} ${attacker} ${shot} ${src}`));
    const d1 = W.hurtFrom(12, -1, true, false, 'test', false, false);
    expect(d1).toBeLessThan(d0);
    expect(W.phase).toBe('wave');
    expect(calls).toEqual([`after ${d1} 6 -1 -1 test`]);
    eng.dispose();
  });

  it('begin resets every seam each wave', () => {
    const { run, setup } = at(3, { seed: 12 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.guardHook = () => true; W.hurtScalers.push(() => 2); W.afterHurt.push(() => {}); W.onStream = () => {};
    W.playerHooks.push(() => true); W.cdX = 3; W.ownLost = 5; W.teleOwner = 4;
    eng.start(run, setup);
    expect([W.guardHook, W.hurtScalers.length, W.afterHurt.length, W.onStream, W.playerHooks.length, W.cdX, W.ownLost, W.teleOwner, W.moveCap])
      .toEqual([null, 0, 0, null, 0, 1, 0, -1, Infinity]);
    eng.dispose();
  });

  it('own 月华: taken back with no XP or tally, left lying it is result().lost, never 蓄月', () => {
    const { run, setup } = at(3, { seed: 13 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.godmode = true;
    const held = W.moonHeld, got = W.moonGot, xp = W.xpGot;
    // one at your feet, taken back once its pop arc ends
    W.dropOne(DK.moonDrop, W.px, W.py, 7, -1, { own: true, noFuse: true });
    // one far away and held: still lying when the wave ends
    W.dropOne(DK.moonDrop, W.px + 3000, W.py + 3000, 5, -1, { own: true, hold: 999, noFuse: true });
    const stream: number[] = [];
    W.onStream = (i) => stream.push(i);
    eng.stepN(30);
    expect(W.moonHeld).toBe(held + 7);
    expect(W.moonGot).toBe(got);
    expect(W.xpGot).toBe(xp);
    // the field 月华 that goes to 蓄月 is the ordinary pieces only
    let ordinary = 0;
    for (let i = 0; i < W.D.n; i++) if (W.D.alive[i] && !W.D.own[i] && (W.D.kind[i] === DK.moonDrop || W.D.kind[i] === DK.moonThick || W.D.kind[i] === DK.goldShard || W.D.kind[i] === DK.carpGold)) ordinary += W.D.worth[i];
    W.beginEnding();
    expect(W.ownLost).toBe(5);
    expect(W.fieldMoon).toBeCloseTo(ordinary, 5);
    expect(W.result().lost).toBe(5);
    eng.dispose();
  });

  it('a wave without own 月华 reports no `lost` field', () => {
    const { run, setup } = at(3, { seed: 14 });
    const { eng } = make(run);
    eng.start(run, setup);
    eng.stepN(60);
    expect('lost' in eng.world.result()).toBe(false);
    eng.dispose();
  });
});
