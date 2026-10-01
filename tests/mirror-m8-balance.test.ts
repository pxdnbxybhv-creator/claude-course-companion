// 水月幻镜 · m8 BALANCE (PLAN §4.B, balance.md §1–§7 with §12.3, orchestrator O1): the price table, both odds tables
// and 破釜沉舟's floor (luck and 镜裂 one tier up, the fallbacks, copies exempt), the 劫 rule, the capped items, ask B
// (every item open; item deeds pay 镜屑 once), the pinned tutorial pool, the companions' new rules in the engine
// (剑幕, 捣药's 易伤, 酒入豪肠, 猫步, 心魔's crate, 诗成) and the bot's prices for 劫, rerolls and the floor.
import { describe, expect, it } from 'vitest';
import type { DeathResult, EngineHooks, EngineSettings, HitPacket, MirrorAudio, NewRunOpts, RunSave, Tier, WaveResult, WaveSetup } from '../src/views/mirror/types';
import { DEED_REG, ITEM_REG, STARTER_ITEMS, WEAPON_REG, lockOf, type ItemId, type WeaponId } from '../src/views/mirror/ids';
import { COMPANIONS, F, ITEMS, PASSIVES, SKILLS, WEAPONS } from '../src/views/mirror/data';
import {
  allUnlocked, beginWave, computeStats, critMult, critOverflowOf, curseOf, deedDust, dmgMult, dmgX, hpX, itemOdds, newRun, openShop,
  settleMeta, shopFloor, shopOdds, starterUnlocks, unlocksOf, waveSetup, weaponHit, weaponPrice,
} from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { EKind } from '../src/views/mirror/engine/pools';
import { TUTOR_ITEMS, tutorUnlocks } from '../src/views/mirror/tutor/run';
import { commonStackers, value } from '../src/views/mirror/sim/bot';

const DAY = '2026-09-30';
function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const run = (o: Partial<NewRunOpts> = {}, patch: Partial<RunSave> = {}): RunSave => ({ ...newRun(opts(o)), pending: { ...newRun(opts(o)).pending, start: null }, ...patch });
const round = (xs: readonly number[]) => xs.map((x) => Math.round(x));

// ═════════════════════════════════════════════ prices and odds (balance.md §2, §3)

describe('m8 balance · weapon prices (A13)', () => {
  it('a base-30 weapon costs exactly balance.md §3\'s table (tier ×1 / 1.8 / 3.2 / 5.2, +15% a wave)', () => {
    expect(WEAPONS.qingping.price).toBe(30);
    expect(F.tierMult).toEqual([1, 1.8, 3.2, 5.2]);
    expect(F.weaponSlope).toBe(0.15);
    expect(F.priceSlope).toBe(0.18); // items keep theirs
    const table: Record<number, [number, number, number, number]> = {
      1: [30, 54, 96, 156], 5: [48, 86, 154, 250], 10: [70, 127, 226, 367], 15: [93, 167, 298, 484],
      20: [116, 208, 370, 601], 25: [138, 248, 442, 718], 30: [161, 289, 514, 835], 40: [206, 370, 658, 1069],
    };
    for (const [w, row] of Object.entries(table)) {
      expect(([1, 2, 3, 4] as Tier[]).map((t) => weaponPrice('qingping', t, Number(w))), `wave ${w}`).toEqual(row);
    }
  });
});

describe('m8 balance · shop odds (A11)', () => {
  it('the item and weapon tables are balance.md §2\'s', () => {
    expect(F.itemOdds.map((r) => [...r])).toEqual([[1, 80, 20, 0, 0], [4, 55, 33, 12, 0], [8, 36, 36, 22, 6], [13, 24, 36, 30, 10], [20, 15, 33, 37, 15], [30, 10, 30, 40, 20]]);
    expect(F.shopOdds.map((r) => [...r])).toEqual([[1, 85, 15, 0, 0], [4, 62, 30, 8, 0], [8, 46, 36, 15, 3], [13, 34, 38, 22, 6], [20, 24, 38, 29, 9], [30, 16, 36, 34, 14]]);
    for (const w of [1, 4, 8, 13, 20, 30, 45]) for (const luck of [-80, 0, 30, 100, 400]) for (const extra of [false, true]) for (const floor of [1, 2] as Tier[]) {
      for (const o of [itemOdds(w, luck, extra, floor), shopOdds(w, luck, extra, floor)]) {
        expect(o.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
        for (const x of o) expect(x).toBeGreaterThanOrEqual(0);
        if (floor === 2) expect(o[0]).toBe(0);
      }
    }
  });
  it('the floor: 凡 zeroed, the rest scaled; luck and 镜裂 work one tier up and 灵 takes the rest (critic P5 table)', () => {
    // [wave, luck, plain floor, floor + 镜裂] in 凡/灵/仙/神 %
    const rows: [number, number, number[], number[]][] = [
      [8, 0, [0, 56, 34, 9], [0, 46, 39, 14]],
      [8, 60, [0, 30, 55, 15], [0, 20, 60, 20]],
      [13, 30, [0, 32, 51, 17], [0, 22, 56, 22]],
      [13, 60, [0, 16, 63, 21], [0, 6, 68, 26]],
      [13, 100, [0, 0, 75, 25], [0, 0, 73, 27]],
      [20, 30, [0, 20, 57, 23], [0, 10, 62, 28]],
      [20, 100, [0, 0, 71, 29], [0, 0, 70, 30]],
      [30, 60, [0, 0, 67, 33], [0, 0, 65, 35]],
    ];
    for (const [w, luck, plain, cracked] of rows) {
      expect(round(itemOdds(w, luck, false, 2)), `w${w} luck ${luck}`).toEqual(plain);
      expect(round(itemOdds(w, luck, true, 2)), `w${w} luck ${luck} + 镜裂`).toEqual(cracked);
    }
    // wave 20, luck 0: 0 / 39 / 44 / 18 for items; new weapons 0 / 50 / 38 / 12
    expect(round(itemOdds(20, 0, false, 2))).toEqual([0, 39, 44, 18]);
    expect(round(shopOdds(20, 0, false, 2))).toEqual([0, 50, 38, 12]);
    // floor 1 is today's rule
    expect(itemOdds(20, 30, true, 1)).toEqual(itemOdds(20, 30, true));
  });
});

// ═════════════════════════════════════════════ 破釜沉舟 (balance.md §5, PLAN D1–D3)

describe('m8 balance · 破釜沉舟', () => {
  it('carries +8 伤害, 劫 2, no reroll and the tier floor 2', () => {
    expect(ITEMS.burnboats.stats).toEqual({ dmg: 8 });
    expect(ITEMS.burnboats.curse).toBe(2);
    expect(ITEMS.burnboats.price).toBe(55);
    expect(ITEMS.burnboats.fx).toEqual([{ hook: 'shop', do: 'noReroll' }, { hook: 'shop', do: 'tierFloor', t: 2 }]);
    expect(shopFloor(run({}, { items: {} }))).toBe(1);
    expect(shopFloor(run({}, { items: { burnboats: 1 } }))).toBe(2);
  });
  it('A12: 1,000 seeded shops at each of waves 5/10/20/30/40 offer no 凡 item and no 凡 new weapon (copies allowed)', () => {
    const u = allUnlocked();
    const chars = ['taoist', 'swordsman', 'guan', 'poet', 'fisher'] as const;
    // a 凡 bar of two weapons per companion: their copies (凡) stay offered for 合铸, nothing else 凡 does
    const kits: Record<(typeof chars)[number], WeaponId[]> = {
      taoist: ['thunder', 'fire'], swordsman: ['qingping', 'casket'], guan: ['yanyue', 'qingfeng'], poet: ['gourd', 'qingping'], fisher: ['rod', 'coindart'],
    };
    let items = 0, weapons = 0, copies = 0;
    for (const w of [5, 10, 20, 30, 40]) {
      for (let s = 1; s <= 1000; s++) {
        const char = chars[s % chars.length];
        const held = kits[char].map((id) => ({ id, t: 1 as Tier }));
        const r = run({ seed: s * 7919 + w, char }, { wave: w - 1, weapons: held, items: { burnboats: 1, ...(s % 3 === 0 ? { cinnabar: 4, whetstone: 3 } : {}) }, moon: 0 });
        for (const sl of openShop(r, u).shop!.slots) {
          if (!sl) continue;
          if (sl.kind === 'item') { items++; expect(ITEMS[sl.id].tier, `${sl.id} at wave ${w}`).toBeGreaterThanOrEqual(2); continue; }
          weapons++;
          if (sl.t === 1) { copies++; expect(held.some((h) => h.id === sl.id), `a 凡 ${sl.id} at wave ${w} that is no copy`).toBe(true); }
        }
      }
    }
    expect(items).toBeGreaterThan(5 * 1000 * 2);
    expect(weapons).toBeGreaterThan(1000);
    expect(copies).toBeGreaterThan(100);
  });
  it('the class lean and the last resorts start at the floor: 人参, never 松子', () => {
    // only 凡 items unlocked plus 人参: every item slot under the floor falls through to 人参
    const commons = ITEM_REG.map((x) => x.id).filter((id) => ITEMS[id].tier === 1);
    const u = { weapons: new Set(WEAPON_REG.map((x) => x.id)), items: new Set<ItemId>([...commons, 'ginseng']) };
    const onlyCommons = { weapons: u.weapons, items: new Set<ItemId>(commons) };
    for (let s = 1; s <= 200; s++) {
      const base = run({ seed: s, char: 'taoist' }, { wave: 6, weapons: [{ id: 'thunder', t: 1 }], moon: 0 });
      for (const sl of openShop({ ...base, items: { burnboats: 1 } }, u).shop!.slots) if (sl?.kind === 'item') expect(sl.id).toBe('ginseng');
      for (const sl of openShop({ ...base, items: { burnboats: 1 } }, onlyCommons).shop!.slots) if (sl?.kind === 'item') expect(sl.id).toBe('ginseng');
      // without the floor the same pool offers 凡 items
      for (const sl of openShop(base, u).shop!.slots) if (sl?.kind === 'item') expect(ITEMS[sl.id].tier === 1 || sl.id === 'ginseng').toBe(true);
    }
  });
  it('奇货可居 (noWeapons): no weapon slot at all, new or copy (C11)', () => {
    const u = allUnlocked();
    for (let s = 1; s <= 300; s++) {
      const full = Array.from({ length: 6 }, () => ({ id: 'qingfeng' as WeaponId, t: 1 as Tier }));
      for (const weapons of [[{ id: 'qingfeng' as WeaponId, t: 1 as Tier }], full]) {
        const r = run({ seed: s }, { wave: 12, weapons, items: { qihuo: 1 }, moon: 0 });
        for (const sl of openShop(r, u).shop!.slots) expect(sl?.kind).not.toBe('weapon');
      }
    }
  });
});

// ═════════════════════════════════════════════ 劫 (balance.md §4, PLAN D4–D6)

describe('m8 balance · 劫律: a point always gives the monsters more than you', () => {
  it('the constants are +1 伤害 / 2% 月华 for you, 2% HP and damage for them', () => {
    expect([F.curseDmg, F.curseMoon, F.curseEnemy]).toEqual([1, 0.02, 0.02]);
  });
  it('per point, your kill speed falls (< 1 for every 伤害 D ≥ 0), and their damage rises 2%', () => {
    for (const D of [0, 10, 30, 60, 120, 200, 400]) for (const c of [0, 1, 5, 19]) {
      const r0 = run({}, { wave: 20, stats: { dmg: D }, sand: { sheet: [], curse: c } });
      const r1 = { ...r0, sand: { sheet: [], curse: c + 1 } };
      const kill = (dmgMult(computeStats(r1)) / dmgMult(computeStats(r0))) / (hpX(21, r1) / hpX(21, r0));
      expect(kill, `D ${D}, 劫 ${c}`).toBeLessThan(1);
      expect(dmgX(21, r1) / dmgX(21, r0)).toBeGreaterThan(1);
    }
  });
  it('the 劫 items: 断发 +4 / −3 max 5, 心魔 +6 劫 3, 镜裂 劫 2, 妄念 月华 −15%; 阎王帖 unchanged', () => {
    expect(ITEMS.cuthair).toMatchObject({ stats: { dmg: 4, hp: -3 }, max: 5, price: 12, curse: 1 });
    expect(ITEMS.innerdemon).toMatchObject({ stats: { dmg: 6 }, curse: 3 });
    expect(ITEMS.crackedmirror.curse).toBe(2);
    expect([ITEMS.yanwang.curse, ITEMS.delusion.curse]).toEqual([2, 2]);
    // QA's 劫 pass: the extra enemies' drops made 妄念 a net gain at +10 %
    expect(ITEMS.delusion.fx?.[0]).toMatchObject({ budgetPct: 20, moonPct: -15 });
    expect(curseOf({ items: { cuthair: 5, burnboats: 1, innerdemon: 1, crackedmirror: 1, yanwang: 1, delusion: 1 } })).toBe(16);
  });
});

// ═════════════════════════════════════════════ the counterweight, the relics (O1)

describe('m8 balance · caps and relics', () => {
  it('金丹 max 12; 忘尘镜 and 龙渊剑 exactly as the owner set them (O1: no 气血, no 护甲 on 忘尘镜)', () => {
    expect(ITEMS.elixir.max).toBe(12);
    expect(ITEMS.wangchen.stats).toEqual({ dmg: 50, crit: 50, aspd: 20, speed: 20 });
    expect(ITEMS.wangchen.inkCrit).toBe(1.5);
    expect(ITEMS.longyuan.stats).toEqual({ hp: 100, armor: 20, speed: 20 });
  });
});

// ═════════════════════════════════════════════ ask B (PLAN D27)

describe('m8 balance · ask B: every item open from the start', () => {
  it('every item is a starter and none is locked; the 9 deed weapons stay deeds', () => {
    expect([...STARTER_ITEMS].sort()).toEqual(ITEM_REG.map((x) => x.id).sort());
    for (const it of ITEM_REG) expect(lockOf(it.id)).toBeUndefined();
    expect(starterUnlocks().items.size).toBe(ITEM_REG.length);
    const wDeeds = DEED_REG.filter((d) => WEAPON_REG.some((w) => w.id === d.unlocks));
    expect(wDeeds).toHaveLength(9);
    for (const d of wDeeds) expect(lockOf(d.unlocks as WeaponId)).toBe(d.id);
  });
  it('an item deed pays 镜屑 once on first completion (灵 20, 仙 30, 神 60), never for a deed already done; weapon deeds still unlock', () => {
    expect(deedDust('curseFive')).toBe(20); // 心魔, 灵
    expect(deedDust('critWave')).toBe(30); // 夜光杯, 仙
    expect(deedDust('loneBlade')).toBe(60); // 独孤求败, 神
    expect(deedDust('swordKills')).toBe(0); // a weapon deed
    const m0 = defaultMeta(DAY);
    const r = run({}, { wave: 6, runStats: { peakCurse: 5, peakCritsWave: 120 } });
    const plain = settleMeta(m0, run({}, { wave: 6 }), 'death', DAY).report.dust;
    const first = settleMeta(m0, r, 'death', DAY);
    expect(first.report.dust - plain).toBe(20 + 30);
    expect(first.report.unlocks).toEqual([]); // nothing to open: the items are open already
    const again = settleMeta(first.meta, r, 'death', DAY);
    expect(again.report.dust).toBe(plain);
    // deeds finished before the change pay nothing retroactively
    const old = { ...m0, deeds: { curseFive: 5, critWave: 100 } };
    expect(settleMeta(old, r, 'death', DAY).report.dust).toBe(plain);
    // weapon deeds unlock their weapon as before
    const sw = settleMeta(m0, run({}, { wave: 6, runStats: { killsSword: 600 } }), 'death', DAY);
    expect(sw.report.unlocks).toEqual(['longquan']);
    expect(unlocksOf(sw.meta).weapons.has('longquan')).toBe(true);
  });
  it('the tutorial keeps the pinned 55-item pool', () => {
    expect(TUTOR_ITEMS).toHaveLength(55);
    expect(new Set(TUTOR_ITEMS).size).toBe(55);
    for (const id of TUTOR_ITEMS) expect(ITEMS[id], id).toBeTruthy();
    expect([...tutorUnlocks().items].sort()).toEqual([...TUTOR_ITEMS].sort());
    // the 22 item deeds' items (and the 26 new ones) are outside it
    for (const d of DEED_REG) if (!WEAPON_REG.some((w) => w.id === d.unlocks)) expect(TUTOR_ITEMS).not.toContain(d.unlocks);
  });
});

// ═════════════════════════════════════════════ companions (balance.md §1, PLAN D23, D25)

describe('m8 balance · companions in logic', () => {
  it('琴师 and 道童 trimmed, and MELEE_PEN untouched', () => {
    expect(COMPANIONS.musician.wmult).toEqual([{ match: { scale: 'melee' }, pct: -25 }, { match: { cls: 'music' }, pct: 12 }]);
    for (const c of ['swordsman', 'taoist'] as const) expect(COMPANIONS[c].wmult).toEqual([{ match: { scale: 'melee' }, pct: -25 }]);
    expect(PASSIVES.zhiyin.p).toMatchObject({ area: 10, wait: 0.15, dmg: 12 });
    expect(SKILLS.guangling.p.charm).toBe(0.1);
    expect(WEAPONS.thunder.dmg).toEqual([13, 26, 42, 66]);
    expect(WEAPONS.thunder.p.jumps).toEqual([1, 2, 3, 6]);
    expect(WEAPONS.thunder.range).toBe(420);
    expect(COMPANIONS.taoist.hp).toBe(28);
    expect(COMPANIONS.taoist.extra).toEqual({ elem: 5 });
  });
  it('诗成: 诗仙\'s crit over 100 gives 2% 暴击倍数 a point, anyone else 1%', () => {
    const st = computeStats(run({ char: 'poet' }));
    const hi = { ...st, crit: 150, critDmg: 0 };
    expect(critMult(2, 0, hi, critOverflowOf({ char: 'poet' }))).toBeCloseTo(2 + 1.0);
    expect(critMult(2, 0, hi, critOverflowOf({ char: 'scholar' }))).toBeCloseTo(2 + 0.5);
    const poet = run({ char: 'poet' }, { weapons: [{ id: 'qingping', t: 1 }] });
    const sch = run({ char: 'scholar' }, { weapons: [{ id: 'qingping', t: 1 }] });
    expect(weaponHit(poet, hi, 'qingping', 1).critM - weaponHit(sch, hi, 'qingping', 1).critM).toBeCloseTo((150 + WEAPONS.qingping.crit - 100) / 100);
  });
  it('药力 and 老渔 are converts read by computeStats', () => {
    const rabbit = computeStats(run({ char: 'rabbit' }, { stats: { regen: 40 } }));
    const rabbit0 = computeStats(run({ char: 'rabbit' }));
    expect(rabbit.dmg - rabbit0.dmg).toBeCloseTo(Math.min(30, rabbit.regen) - Math.min(30, rabbit0.regen));
    const fisher = computeStats(run({ char: 'fisher' }, { stats: { luck: 75 } }));
    expect(fisher.dmg).toBeCloseTo(Math.min(30, fisher.luck / 3));
  });
  it('the body bounds: 侠客 and 诗仙 44, the hidden three inside 26–40', () => {
    expect([COMPANIONS.swordsman.hp, COMPANIONS.swordsman.armor, COMPANIONS.poet.hp, COMPANIONS.poet.armor]).toEqual([44, 6, 44, 4]);
    for (const id of ['yuenv', 'shangui', 'houyi'] as const) { expect(COMPANIONS[id].hp).toBeGreaterThanOrEqual(26); expect(COMPANIONS[id].hp).toBeLessThanOrEqual(40); }
  });
});

// ═════════════════════════════════════════════ the engine: the new rules

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
function make(r: RunSave): { eng: MirrorEngine; log: { crates: number; errors: unknown[]; ends: WaveResult[]; deaths: DeathResult[] } } {
  const log = { crates: 0, errors: [] as unknown[], ends: [] as WaveResult[], deaths: [] as DeathResult[] };
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: (n) => { log.crates = n; }, coin: () => {}, boss: () => {},
    waveEnd: (x) => log.ends.push(x), death: (d) => log.deaths.push(d), error: (e) => { log.errors.push(e); },
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(canvas(), r, { painter: createDebugPainter(r.map, settings.quality, 1), audio: SILENT, content: CONTENT, hooks, settings }) as MirrorEngine;
  return { eng, log };
}
function at(w: number, o: Partial<NewRunOpts>, patch: Partial<RunSave> = {}): { run: RunSave; setup: WaveSetup } {
  const r = beginWave({ ...newRun(opts(o)), wave: w - 1, ...patch });
  return { run: r, setup: waveSetup(r, defaultMeta(DAY), new Date(2026, 8, 30, 20)) };
}
function step(eng: MirrorEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    const ph = eng.world.phase;
    if (ph !== 'wave' && ph !== 'ending') return;
    if (eng.paused) eng.resume();
    eng.stepN(1);
  }
}
function spy(eng: MirrorEngine, fns: string[]) {
  const W = eng.world as unknown as Record<string, (...a: unknown[]) => unknown>;
  const calls: { fn: string; args: unknown[]; t: number }[] = [];
  for (const fn of fns) {
    const orig = W[fn].bind(eng.world);
    W[fn] = (...args: unknown[]) => { calls.push({ fn, args, t: eng.world.t }); return orig(...args); };
  }
  return calls;
}
function crowd(eng: MirrorEngine, n: number): void {
  const W = eng.world;
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; W.spawn('blot', W.px + Math.cos(a) * 80, W.py + Math.sin(a) * 80, { bloom: false }); }
}

describe('m8 balance · the new rules in the engine', () => {
  it('剑幕: +25 护甲 for 3 s when 一剑光寒 ends, not at its cast', () => {
    const { run: r, setup } = at(6, { char: 'swordsman' }, { weapons: [{ id: 'qingping', t: 2 }] });
    const { eng, log } = make(r);
    eng.start(r, setup); eng.world.godmode = true; step(eng, 20); crowd(eng, 8); step(eng, 2);
    const calls = spy(eng, ['buff']);
    const t0 = eng.world.t;
    eng.skill();
    expect(calls.some((c) => c.args[0] === 'jianmu')).toBe(false);
    step(eng, 60);
    const b = calls.find((c) => c.args[0] === 'jianmu');
    expect(b, 'the screen comes up').toBeTruthy();
    expect(b!.args.slice(1, 3)).toEqual([{ armor: SKILLS.yijian.p.guard }, SKILLS.yijian.p.guardDur]);
    expect(b!.t - t0).toBeGreaterThanOrEqual(0.2); // after the 0.22 s dash
    expect(log.errors).toEqual([]);
    eng.dispose();
  });
  it('捣药: each of the three pounds marks what it strikes, +20% damage taken for 4 s', () => {
    const { run: r, setup } = at(6, { char: 'rabbit' }, { weapons: [{ id: 'pestle', t: 2 }] });
    const { eng, log } = make(r);
    eng.start(r, setup); eng.world.godmode = true; step(eng, 20); crowd(eng, 10); step(eng, 2);
    const calls = spy(eng, ['hitArea']);
    eng.skill();
    step(eng, 200);
    const pounds = calls.filter((c) => (c.args[3] as HitPacket).status?.kind === 'vuln');
    expect(pounds).toHaveLength(SKILLS.daoyao.p.pounds);
    for (const c of pounds) expect((c.args[3] as HitPacket).status).toEqual({ kind: 'vuln', dur: SKILLS.daoyao.p.vulnDur, v: SKILLS.daoyao.p.vuln });
    expect(log.errors).toEqual([]);
    eng.dispose();
  });
  it('酒入豪肠: each crit heals 1, at most 8 a second; a plain hit heals nothing', () => {
    const { run: r, setup } = at(6, { char: 'poet' }, { weapons: [{ id: 'gourd', t: 1 }] });
    const { eng } = make(r);
    eng.start(r, setup); eng.world.godmode = true; step(eng, 5);
    const calls = spy(eng, ['heal']);
    const W = eng.world;
    for (let k = 0; k < 20; k++) W.emit('hit', -1, 10, true, 'weapon', W.px, W.py, 0);
    expect(calls).toHaveLength(0);
    for (let k = 0; k < 20; k++) W.emit('crit', -1, 10, true, 'weapon', W.px, W.py, 0);
    expect(calls.map((c) => c.args[0])).toEqual(new Array(PASSIVES.baipian.p.critHealCap).fill(PASSIVES.baipian.p.critHeal));
    step(eng, 130); // over a second later the budget is back
    for (let k = 0; k < 3; k++) W.emit('crit', -1, 10, true, 'weapon', W.px, W.py, 0);
    expect(calls).toHaveLength(PASSIVES.baipian.p.critHealCap + 3);
    eng.dispose();
  });
  it('猫步: a dodge gives 大橘 +30% 攻速 for 2 s', () => {
    const { run: r, setup } = at(6, { char: 'cat' }, { weapons: [{ id: 'claw', t: 1 }] });
    const { eng } = make(r);
    eng.start(r, setup); eng.world.godmode = true; step(eng, 5);
    const calls = spy(eng, ['buff']);
    const W = eng.world;
    W.emit('dodge', -1, 0, false, 'enemy', W.px, W.py, -1);
    expect(calls.find((c) => c.args[0] === 'maobu')?.args.slice(1, 3)).toEqual([{ aspd: PASSIVES.jiuming.p.dodgeAspd }, PASSIVES.jiuming.p.dodgeDur]);
    eng.dispose();
  });
  it('心魔: beating your shadow drops a 镜奁 with its data chance (crate %), and only then', () => {
    const fx = ITEMS.innerdemon.fx?.[0] as { crate?: number } | undefined;
    expect(fx?.crate).toBeGreaterThan(0);
    expect(fx?.crate).toBeLessThan(100);
    for (const [roll, gets] of [[0, 1], [0.999, 0]] as const) {
      const { run: r, setup } = at(6, { char: 'scholar' }, { weapons: [{ id: 'qingfeng', t: 1 }], items: { innerdemon: 1 } });
      const { eng, log } = make(r);
      eng.start(r, setup); eng.world.godmode = true; step(eng, 3);
      const E = eng.world.E;
      let h = -1;
      for (let i = 0; i < E.cap; i++) if (E.alive[i] && E.kind[i] === EKind.Demon) h = E.handle(i);
      expect(h, 'the shadow is out').toBeGreaterThanOrEqual(0);
      const before = log.crates;
      (eng.world as unknown as { erng: () => number }).erng = () => roll;
      eng.world.kill(h);
      expect(log.crates).toBe(before + gets);
      eng.dispose();
    }
  });
});

// ═════════════════════════════════════════════ the bot (PLAN D31)

describe('m8 balance · the bot sees what 破釜 and 劫 cost', () => {
  it('破釜沉舟 is worth less to a build holding 5 or more 朱砂', () => {
    const base = run({ char: 'taoist' }, { wave: 12, weapons: [{ id: 'thunder', t: 2 }, { id: 'fire', t: 2 }, { id: 'thunder', t: 1 }] });
    const stacked = { ...base, items: { cinnabar: 6 } };
    expect(commonStackers(stacked)).toBe(6);
    const gain = (r: RunSave) => value({ ...r, items: { ...r.items, burnboats: 1 } }) - value(r);
    expect(gain(stacked)).toBeLessThan(gain(base));
  });
  it('a pure 劫 point lowers value() (the enemies\' damage is priced too)', () => {
    const r = run({ char: 'guan' }, { wave: 15, weapons: [{ id: 'yanyue', t: 2 }, { id: 'qingfeng', t: 2 }] });
    expect(value({ ...r, sand: { sheet: [], curse: 5 } })).toBeLessThan(value(r));
  });
});
