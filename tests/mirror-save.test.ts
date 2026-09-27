// 水月幻镜 · the meta store and the run save (GDD §17, §23): sanitize on junk, validate / migrate a run,
// backups round-trip and erase, and settlement into meta (deeds, unlocks, mastery, seals, 今日镜 …).
import { beforeEach, describe, expect, it } from 'vitest';
import type { MirrorMeta, NewRunOpts, RunSave } from '../src/views/mirror/types';
import { RUN_VER } from '../src/views/mirror/types';
import { mirror, defaultMeta, sanitizeMirror, MIRROR_KEY } from '../src/app/mirror';
import { play, emptyPlay } from '../src/app/play';
import { emptyState, exportJSON, importJSON, replaceState, resetAll } from '../src/app/store';
import {
  activeHeart, allUnlocked, buyHeart, dailySpec, deedProgress, endWave, heartCost, masteryLevel, migrateRun, newRun, pickHeartFace,
  settleMeta, unlocksOf, validateRun, beginWave, foldKills,
} from '../src/views/mirror/logic';
import { MS_AT_30 } from '../src/views/mirror/logic/run';
import { STARTER_ITEMS, STARTER_WEAPONS } from '../src/views/mirror/ids';

const DAY = '2026-09-27';
function run(o: Partial<NewRunOpts> = {}, r: Partial<RunSave> = {}): RunSave {
  return {
    ...newRun({
      seed: 3, char: 'painter', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
      runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
    }),
    ...r,
  };
}

describe('sanitizeMirror', () => {
  it('turns junk into a default meta and never throws', () => {
    const junk: unknown[] = [null, undefined, 3, 'x', [], { v: 9 }, { deeds: 'no', codex: [1], payDay: 7, heart: { ranks: { a: -3 } } }, { active: { ver: 1 } }];
    for (const j of junk) {
      const m = sanitizeMirror(j, DAY);
      expect(m.v).toBe(1);
      expect(m.active).toBeNull();
      expect(m.payDay.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(sanitizeMirror(null, DAY)).toEqual(defaultMeta(DAY));
  });
  it('clamps numbers and drops bad keys but keeps good data', () => {
    const raw = {
      ...defaultMeta(DAY), dust: -5, owed: 1e12, coinsPaid: 12.7, diffMax: 9, mapsOpen: 0,
      payDay: { day: DAY, runs: 2, free: true, paid: 999, drops: 99, refunded: 'yes' },
      codex: { 'mon:blot': 2, 'mon:x': 7 }, seals: { 'painter|1': true, bad: 1 },
      lobby: { char: 'dragon', map: 'moon', diff: 2, vows: { qunmo: 2 } }, settings: { aim: 'manual', nums: 5, quality: 'ultra' },
      title: 'nope', titles: ['migrant', 3],
    };
    const m = sanitizeMirror(raw, DAY);
    expect(m.dust).toBe(0);
    expect(m.owed).toBe(1e6);
    expect(m.coinsPaid).toBe(12);
    expect(m.diffMax).toBe(5);
    expect(m.mapsOpen).toBe(1);
    expect(m.payDay).toEqual({ day: DAY, runs: 2, free: true, paid: 300, drops: 30, refunded: false });
    expect(m.codex).toEqual({ 'mon:blot': 2 });
    expect(m.seals).toEqual({ 'painter|1': true });
    expect(m.lobby).toEqual({ char: 'scholar', map: 'lake', diff: 2, vows: { qunmo: 2 } });
    expect(m.settings).toEqual({ aim: 'manual', nums: 1, shake: false, left: false, quality: 'auto' });
    expect(m.titles).toEqual(['migrant']);
    expect(m.title).toBeNull();
    const r = run();
    expect(sanitizeMirror({ ...defaultMeta(DAY), active: r }, DAY).active).toEqual(r);
  });
});

describe('validateRun and migrateRun', () => {
  it('accepts a real run and rejects junk', () => {
    const r = endWave(beginWave(run()), {
      wave: 1, moon: 10, xp: 10, field: 0, storeLeft: 0, levels: 0, crates: 1, hearts: [], sleeve: [], lives: 0, once: [], drunk: 0,
      stats: { kills: 3 }, killsBy: {}, byWeapon: { brush: { dmg: 40, kills: 3 } }, bosses: [], ms: 100,
    });
    expect(validateRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
    for (const j of [null, 1, 'x', {}, { ...r, char: 'dragon' }, { ...r, map: 'moon' }, { ...r, weapons: [], pending: { ...r.pending, start: null } }, { ...r, ver: 'x' }]) {
      expect(validateRun(j)).toBeNull();
    }
    const fixed = validateRun({ ...r, weapons: [{ id: 'hoe', t: 9 }, { id: 'brush', t: 2 }], items: { songzi: 2, nope: 1 }, coins: 99, diff: 12 })!;
    expect(fixed.weapons).toEqual([{ id: 'brush', t: 2 }]);
    expect(fixed.items).toEqual({ songzi: 2 });
    expect(fixed.coins).toBe(20);
    expect(fixed.diff).toBe(5);
  });
  it('migrates only its own version', () => {
    const r = run();
    expect(migrateRun(r)).toBe(r);
    expect(migrateRun({ ...r, ver: RUN_VER + 1 })).toBeNull();
    expect(migrateRun({ ...r, ver: 0 })).toBeNull();
  });
});

describe('backups', () => {
  beforeEach(() => {
    replaceState(emptyState());
    play.value = emptyPlay();
  });
  it('round-trips the mirror with the rest of the backup, and erase empties it', () => {
    mirror.value = { ...defaultMeta(DAY), dust: 321, coinsPaid: 7, deeds: { swordKills: 40 }, active: run() };
    play.value = { ...emptyPlay(), coins: 50, counters: { 'mirror:coin': 7 } };
    const json = exportJSON();
    expect(JSON.parse(json)).toHaveProperty('mirror');
    resetAll();
    expect(mirror.value.dust).toBe(0);
    expect(mirror.value.active).toBeNull();
    expect(importJSON(json)).toBe(true);
    expect(mirror.value.dust).toBe(321);
    expect(mirror.value.deeds.swordKills).toBe(40);
    expect(mirror.value.active?.char).toBe('painter');
    expect(play.value.coins).toBe(50);
    const old = JSON.parse(json) as Record<string, unknown>;
    delete old.mirror;
    expect(importJSON(JSON.stringify(old))).toBe(true);
    expect(mirror.value.dust).toBe(0); // an older backup without the mirror replaces it too
    expect(MIRROR_KEY).toBe('banmu.mirror.v1');
  });
});

describe('settlement into meta', () => {
  const m0 = (): MirrorMeta => defaultMeta(DAY);
  it('advances deeds, opens their unlocks, and marks mastery, codex, bests and records', () => {
    const r = run({}, { wave: 12, runStats: { killsInk: 1200, peakSummons: 6, moonCollected: 900, peakHit: 88 }, items: { xuan: 1 } });
    const { meta, report } = settleMeta(m0(), r, 'death', DAY);
    expect(deedProgress(meta, 'inkKills').done).toBe(true);
    expect(deedProgress(meta, 'inkFour').done).toBe(true);
    expect(report.unlocks).toEqual(expect.arrayContaining(['inkstone', 'dotting', 'inkpool']));
    expect(unlocksOf(meta).weapons.has('inkstone')).toBe(true);
    expect(unlocksOf(m0()).weapons.size).toBe(STARTER_WEAPONS.length);
    expect(unlocksOf(m0()).items.size).toBe(STARTER_ITEMS.length);
    expect(report.mastery).toMatchObject({ before: 0, after: 12 + 5, level: 0 });
    expect(meta.codex['char:painter']).toBe(2);
    expect(meta.codex['item:xuan']).toBe(2);
    expect(meta.bests['painter|lake|1|0']).toEqual({ wave: 12, heat: 0, at: DAY });
    expect(meta.records.bigHit).toBe(88);
    expect(meta.mapsOpen).toBe(2); // beat the wave-10 boss on 月湖
    expect(report.dust).toBe(Math.round((12 + 5 + 10) * 1));
    expect(meta.tally['play:painter']).toBe(1);
    // a sum deed adds up across runs; a max deed keeps the best
    const again = settleMeta(meta, run({}, { wave: 3, runStats: { killsSword: 300 } }), 'death', DAY).meta;
    const third = settleMeta(again, run({}, { wave: 3, runStats: { killsSword: 300 } }), 'death', DAY).meta;
    expect(third.deeds.swordKills).toBe(500);
    expect(unlocksOf(third).weapons.has('longquan')).toBe(true);
  });
  it('照破 stamps seals, opens the next 镜境 and titles; companion deeds need that companion', () => {
    const r = run({ char: 'poet', diff: 1, vows: { qunmo: 3, jianyan: 2 } }, { wave: 31 });
    const { meta, report } = settleMeta(m0(), r, 'death', DAY);
    expect(report.zhaopo).toBe(true);
    expect(meta.seals['poet|1']).toBe(true);
    expect(meta.seals['vow|5']).toBe(true);
    expect(meta.diffMax).toBe(2);
    expect(meta.deeds.poetClear).toBe(1);
    expect(meta.deeds.painterClear ?? 0).toBe(0);
    expect(meta.titles).toContain('rujing:poet');
    expect(masteryLevel(report.mastery.after)).toBe(report.mastery.level);
    expect(meta.codex['char:poet']).toBe(3);
  });
  it('今日镜: a 候签 at wave 10, 七日镜 on 4 of 7 days, the moon seal at 30', () => {
    let m = m0();
    const days = ['2026-09-20', '2026-09-22', '2026-09-24', '2026-09-26'];
    let dust = 0;
    for (const d of days) {
      const s = settleMeta(m, run({ daily: true, startedDay: d }, { wave: 10 }), 'death', d);
      m = s.meta;
      dust = s.report.dust;
    }
    expect(Object.keys(m.slips).length).toBeGreaterThan(0);
    expect(m.daily.weekPaid).toBe('2026-09-26');
    expect(dust).toBeGreaterThan(100);
    const m30 = settleMeta(m0(), run({ daily: true }, { wave: 30 }), 'death', DAY).meta;
    expect(m30.seals[`moon|${DAY}`]).toBe(true);
  });
  it('dailySpec is fixed by the date', () => {
    const a = dailySpec(DAY, m0(), ['scholar', 'gardener', 'fisher', 'cat']);
    expect(a).toEqual(dailySpec(DAY, m0(), ['scholar', 'gardener', 'fisher', 'cat']));
    expect(a.chars).toHaveLength(3);
    expect(a.map).toBe('lake');
    expect(a.term).toBe('qiufen'); // 2026-09-27 is in 秋分
    expect(a.slip).toBeGreaterThanOrEqual(45);
    expect(a.slip).toBeLessThanOrEqual(47);
  });
  it('心镜: buy ranks with 镜屑, pick one face a pair', () => {
    let m: MirrorMeta = { ...m0(), dust: 200 };
    expect(heartCost(m, 'heartHp')).toBe(30);
    m = buyHeart(m, 'heartHp')!;
    m = buyHeart(m, 'heartHp')!;
    expect(m.dust).toBe(50);
    expect(buyHeart(m, 'heartHp')).toBeNull();
    expect(activeHeart(m)).toEqual({ heartHp: 2 });
    m = pickHeartFace(m, 1, 'B');
    expect(activeHeart(m)).toEqual({});
    expect(activeHeart({ heart: { ...m.heart, pick: {}, plain: true } })).toEqual({});
  });
  it('墨龙图: 照破 as 画师, or any companion holding 4 墨宝 weapons', () => {
    const ink = [{ id: 'brush', t: 1 }, { id: 'inkstone', t: 1 }, { id: 'crane', t: 1 }, { id: 'brush', t: 2 }] as RunSave['weapons'];
    const g = settleMeta(m0(), run({ char: 'gardener' }, { wave: 12, weapons: ink, runStats: { peakInkWeapons: 4 } }), 'death', DAY);
    expect(g.meta.deeds.painterClear).toBe(1);
    expect(g.report.unlocks).toContain('inkdragon');
    const three = settleMeta(m0(), run({ char: 'gardener' }, { wave: 31, runStats: { peakInkWeapons: 3 } }), 'death', DAY);
    expect(three.meta.deeds.painterClear ?? 0).toBe(0); // 照破, but not as 画师 and only 3 墨宝
    expect(settleMeta(m0(), run({ char: 'painter' }, { wave: 30 }), 'death', DAY).meta.deeds.painterClear).toBe(1);
  });
  it('fastest 照破 counts wave time up to wave 30, not the endless waves after', () => {
    let r = run({ char: 'scholar' }, { wave: 29, ms: 29 * 60_000 });
    r = endWave(beginWave(r), { wave: 30, moon: 0, xp: 0, field: 0, storeLeft: 0, levels: 0, crates: 0, hearts: [], sleeve: [], lives: 0, once: [], drunk: 0, stats: {}, killsBy: {}, byWeapon: {}, bosses: [], ms: 60_000 });
    expect(r.runStats[MS_AT_30]).toBe(30 * 60_000);
    const deep = { ...r, wave: 45, ms: 45 * 60_000 };
    expect(settleMeta(m0(), deep, 'death', DAY).meta.records.fastestClear).toBe(30);
    expect(settleMeta(m0(), { ...r, runStats: {} }, 'death', DAY).meta.records.fastestClear).toBe(30); // W = 30 exactly
  });
  it('a run saved by a newer build survives sanitize untouched', () => {
    const newer = { ver: RUN_VER + 1, somethingNew: [1, 2], wave: 7 };
    expect(sanitizeMirror({ ...defaultMeta(DAY), active: newer }, DAY).active).toEqual(newer);
    expect(migrateRun({ ...run(), ver: RUN_VER })).not.toBeNull();
  });
  it('folds kills into tallies and codex stages', () => {
    const m = foldKills(foldKills(m0(), { blot: 9, turtle: 1, carp: 1, nope: 3 }), { blot: 95 });
    expect(m.tally['kill:blot']).toBe(104);
    expect(m.codex['mon:blot']).toBe(3);
    expect(m.codex['elite:turtle']).toBe(1);
    expect(m.codex['boss:carp']).toBe(1);
    expect(m.tally['kill:nope']).toBeUndefined();
  });
});
