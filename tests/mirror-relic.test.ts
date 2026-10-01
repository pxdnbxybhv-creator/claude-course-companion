// 水月幻镜 · round 5: the boss relics (忘尘镜 / 龙渊剑), the 同流派 shop draw and the melee/companion buffs.
// Proposed by the m5 balance design (scratchpad mirror5/design.md §5–§7), built to the m6 plan (§1): one
// relic per boss felled (a boss id's last body), the static converts and 墨宝's crit follow a mid-wave
// grant, and five of either keep every cap. Every test here fails on the pre-round-5 code.
import { describe, expect, it } from 'vitest';
import type { EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, ShopSlot, WaveResult, WaveSetup, Stats } from '../src/views/mirror/types';
import type { ItemId, WeaponId } from '../src/views/mirror/ids';
import { ITEM_REG } from '../src/views/mirror/ids';
import { RUN_VER } from '../src/views/mirror/types';
import { COMPANIONS, F, ITEMS, WEAPONS } from '../src/views/mirror/data';
import {
  allUnlocked, computeStats, crateItem, emptyStats, endWave, heartOffer, itemPool, newRun, openShop, reroll, toggleLock, validateRun,
  weaponRange, relicFor, reachPct, moveSpeed, critChance, critMult, migrateRun, beginWave, waveSetup, cooldown, dottingX, armorReduction,
} from '../src/views/mirror/logic';
import { readMods } from '../src/views/mirror/engine/effects';
import { DK } from '../src/views/mirror/engine/consts';
import { CLAMP } from '../src/views/mirror/data';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';

function run(o: Partial<NewRunOpts> = {}, r: Partial<RunSave> = {}): RunSave {
  const base = newRun({
    seed: 77, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
    runIndex: 2, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  });
  return { ...base, pending: { ...base.pending, start: null }, wave: 1, moon: 500, ...r };
}
function won(w: number, hearts: WaveResult['hearts'], relics?: ItemId[]): WaveResult {
  return {
    wave: w, moon: 0, xp: 0, field: 0, storeLeft: 0, levels: 0, crates: 0, hearts, sleeve: [], lives: 0, once: [], drunk: 0, stats: {},
    killsBy: {}, byWeapon: {}, bosses: [], relics, ms: 1000,
  };
}
const W = (ids: [WeaponId, 1 | 2 | 3 | 4][]) => ids.map(([id, t]) => ({ id, t }));
const RELICS: ItemId[] = ['wangchen', 'longyuan'];

describe('镜宝: the boss relics', () => {
  it('are exactly the owner\'s numbers', () => {
    expect(ITEMS.wangchen.stats).toEqual({ dmg: 50, crit: 50, aspd: 20, speed: 20 });
    expect(ITEMS.longyuan.stats).toEqual({ hp: 100, armor: 20, speed: 20 });
    expect(ITEMS.longyuan.reachPct).toBe(20);
    for (const id of RELICS) { expect(ITEMS[id].max).toBe(0); expect(ITEMS[id].relic).toBeTruthy(); }
    expect(ITEM_REG.filter((r) => r.group === 'relic').map((r) => r.id)).toEqual(RELICS);
  });

  it('endWave keeps the relics the engine named: one per boss felled, never more than the fight had', () => {
    const r = run({}, { weapons: W([['dart', 1]]), inWave: 10, wave: 9 });
    expect(endWave(r, won(10, ['boss'], ['wangchen'])).items.wangchen).toBe(1);
    // a stale or forged result cannot mint extras: wave 10 has one body, a plain wave none, only relic ids count
    expect(endWave(r, won(10, ['boss'], ['wangchen', 'wangchen'])).items.wangchen).toBe(1);
    expect(endWave(r, won(10, ['boss'], ['elixir' as ItemId])).items.elixir ?? 0).toBe(0);
    expect(endWave(run({}, { weapons: W([['dart', 1]]), inWave: 8, wave: 7 }), won(8, [], ['wangchen'])).items.wangchen ?? 0).toBe(0);
    // 双生 (wave 40): two different bosses, two relics; an older result without the field gives none
    const tw = run({}, { weapons: W([['yanyue', 2]]), inWave: 40, wave: 39 });
    expect(endWave(tw, won(40, ['boss'], ['longyuan', 'longyuan'])).items.longyuan).toBe(2);
    expect(endWave(tw, won(40, ['boss'])).items.longyuan ?? 0).toBe(0);
    // 无相's wave-20 pair is one boss (two copies at half HP): one relic; 镜主 (wave 50) is one
    const wx = run({ diff: 5 }, { weapons: W([['dart', 1]]), inWave: 20, wave: 19 });
    expect(endWave(wx, won(20, ['boss'], ['wangchen', 'wangchen'])).items.wangchen).toBe(1);
    const mz = run({}, { weapons: W([['dart', 1]]), inWave: 50, wave: 49 });
    expect(endWave(mz, won(50, ['boss'], ['wangchen', 'wangchen'])).items.wangchen).toBe(1);
    // a relic is not a purchase: 镜主 still copies the last thing you bought
    expect(endWave({ ...r, lastBuy: 'ginseng' }, won(10, ['boss'], ['wangchen'])).lastBuy).toBe('ginseng');
  });

  it('stacks without a cap, across bosses and in endless', () => {
    let r = run({}, { weapons: W([['dart', 1]]) });
    for (const w of [10, 20, 30, 50]) r = endWave({ ...r, inWave: w, wave: w - 1 }, won(w, ['boss'], ['wangchen']));
    r = endWave({ ...r, inWave: 40, wave: 39 }, won(40, ['boss'], ['wangchen', 'wangchen']));
    expect(r.items.wangchen).toBe(6);
    const s = computeStats(r), s0 = computeStats({ ...r, items: {} });
    expect(s.dmg - s0.dmg).toBe(300);
    expect(s.aspd - s0.aspd).toBe(120);
    // 暴击 past 100 turns into 暴伤 (+1% a point), 移速 moves you at most +100%
    expect(critChance(0, s)).toBe(1);
    expect(critMult(1.5, 0, s)).toBeCloseTo(1.5 + (s.crit - 100) / 100);
    expect(moveSpeed(s)).toBe(F.baseSpeed * 2);
  });

  it('the tie rule: count, then tier sum, then the companion\'s style', () => {
    expect(relicFor({ char: 'scholar', weapons: W([['claw', 1], ['dart', 1]]) })).toBe('wangchen');
    expect(relicFor({ char: 'guan', weapons: W([['claw', 1], ['dart', 1]]) })).toBe('longyuan');
    expect(relicFor({ char: 'scholar', weapons: W([['claw', 3], ['dart', 1]]) })).toBe('longyuan');
    expect(relicFor({ char: 'guan', weapons: W([['yanyue', 1], ['dart', 1], ['rod', 1]]) })).toBe('wangchen');
    // 剑匣 (orbit) and 琴 (pulse) count as ranged; every melee kind counts as melee
    expect(relicFor({ char: 'cat', weapons: W([['casket', 1], ['qin', 1], ['claw', 1]]) })).toBe('wangchen');
    for (const c of Object.values(COMPANIONS)) expect(['melee', 'ranged']).toContain(c.style);
  });

  it('are exact for every companion (大橘 gets the full +100 气血, 嫦娥 the full +20 护甲)', () => {
    for (const char of ['cat', 'change', 'guan'] as const) {
      const r = run({ char }, { weapons: W([['claw', 1]]), items: { longyuan: 2 } });
      const s = computeStats(r), s0 = computeStats({ ...r, items: {} });
      expect(s.hp - s0.hp).toBe(200);
      expect(s.armor - s0.armor).toBe(40);
    }
  });

  it('龙渊剑 lengthens every weapon\'s reach by 20% a copy (m8: 玉兔\'s reach is no longer cut)', () => {
    const st: Stats = emptyStats();
    expect(reachPct(run({}, { items: { longyuan: 3 } }))).toBe(60);
    expect(reachPct(run({ char: 'rabbit' }, { items: { longyuan: 1 } }))).toBe(20);
    expect(weaponRange(WEAPONS.claw, st, reachPct(run({}, { items: { longyuan: 2 } })))).toBeCloseTo(WEAPONS.claw.range * 1.4);
  });

  it('are never in the shop, a 镜奁 or 镜心', () => {
    const u = allUnlocked();
    for (const t of [1, 2, 3, 4] as const) for (const w of [1, 10, 40]) for (const id of RELICS) expect(itemPool(run(), u, t, w)).not.toContain(id);
    for (let s = 0; s < 400; s++) {
      const r = run({ seed: s }, { wave: 12 + (s % 20), pending: { start: null, cards: 0, cardK: 0, crates: 1, hearts: ['boss'] } });
      expect(RELICS).not.toContain(crateItem(r, u));
      for (const id of heartOffer(r, u)) expect(RELICS).not.toContain(id);
      const shop = openShop(r, u).shop!;
      for (const sl of shop.slots) if (sl?.kind === 'item') expect(RELICS).not.toContain(sl.id);
    }
  });

  it('survive a save and resume; a v1 run migrates as it is, and an older build refuses a v2 run', () => {
    const r = run({}, { weapons: W([['dart', 1]]), items: { wangchen: 3, longyuan: 1 } });
    const back = validateRun(JSON.parse(JSON.stringify(r)));
    expect(back?.items).toEqual({ wangchen: 3, longyuan: 1 });
    expect(RUN_VER).toBe(2);
    const v1 = { ...run(), ver: 1 };
    expect(migrateRun(v1)).toEqual({ ...v1, ver: 2 });
    expect(migrateRun({ ...r, ver: 3 })).toBeNull();
  });
});

describe('同流派: the shop draws your schools', () => {
  const u = allUnlocked();
  /** Share of shops (4 slots, then one reroll) that show a weapon of `cls` other than `held`. */
  function newShare(held: WeaponId, n: number, cls: string, lockId?: WeaponId): number {
    let hit = 0, shops = 0;
    for (let s = 1; s <= 300; s++) {
      let r = run({ seed: s * 31 + n }, { weapons: Array.from({ length: n }, () => ({ id: held, t: 1 as const })), wave: 6, moon: 1e5 });
      r = openShop(r, u);
      if (lockId) {
        const slots = r.shop!.slots.slice(); slots[0] = { kind: 'weapon', id: lockId, t: 1, locked: true } as ShopSlot;
        r = { ...r, shop: { ...r.shop!, slots } };
      }
      for (let k = 0; k < 2; k++) {
        shops++;
        if (r.shop!.slots.some((x, i) => x?.kind === 'weapon' && !(lockId && i === 0) && x.id !== held && WEAPONS[x.id].classes.includes(cls as never))) hit++;
        r = reroll(r, u) ?? r;
      }
    }
    return hit / shops;
  }
  it('a school you hold shows up far more often (剑: 3% → ≥ 15% of shops with one piece, ≥ 20% with two)', () => {
    expect(newShare('qingfeng', 1, 'sword')).toBeGreaterThan(0.15);
    expect(newShare('qingfeng', 2, 'sword')).toBeGreaterThan(0.2);
    expect(newShare('yanyue', 2, 'heavy')).toBeGreaterThan(0.3);
  });
  it('a locked weapon steers the rerolls toward its school', () => {
    expect(newShare('dart', 1, 'fist', 'claw')).toBeGreaterThan(0.12);
  });
  it('rolls stay a pure function of (seed, wave, k)', () => {
    const r = run({}, { weapons: W([['qingfeng', 1], ['qingfeng', 1]]), wave: 6 });
    expect(openShop(r, u).shop).toEqual(openShop(r, u).shop);
    const a = reroll(openShop(r, u), u)!, b = reroll(openShop(r, u), u)!;
    expect(a.shop).toEqual(b.shop);
    const locked = toggleLock(openShop(r, u), 0);
    expect(reroll(locked, u)!.shop!.slots[0]).toEqual(locked.shop!.slots[0]);
  });
});

describe('round-5 buffs', () => {
  it('every companion is sturdier: +10 气血 (关公 +12), +2 护甲 (关公 +3), the nine ranged +1 护甲 more; QA: 侠客 +8 气血 +2 护甲, 诗仙 +6 气血 on top', () => {
    const before: Record<string, [number, number]> = {
      scholar: [24, 1], gardener: [26, 2], fisher: [24, 1], musician: [18, 0], swordsman: [18, 0], taoist: [16, 0], painter: [24, 1],
      player: [20, 2], cat: [16, 0], rabbit: [18, 1], poet: [22, 0], guan: [28, 3], change: [19, 0],
    };
    // the QA fix round: the two who trailed the other ranged companions (skilled median 28–30 against 31–45)
    const qa: Record<string, [number, number]> = { swordsman: [8, 2], poet: [6, 0] };
    // m8 (balance.md §1.3 / §1.4): the weak five and the middle six on top
    const m8: Record<string, [number, number]> = {
      swordsman: [8, 1], poet: [6, 1], rabbit: [4, 0], taoist: [2, 0], scholar: [2, 0], painter: [2, 1],
    };
    for (const [id, [hp, ar]] of Object.entries(before)) {
      const c = COMPANIONS[id as keyof typeof COMPANIONS];
      const [qh, qr] = qa[id] ?? [0, 0];
      const [mh, mr] = m8[id] ?? [0, 0];
      expect(c.hp).toBe(hp + (id === 'guan' ? 12 : 10) + qh + mh);
      expect(c.armor).toBe(ar + (id === 'guan' ? 3 : 2) + (c.style === 'ranged' ? 1 : 0) + qr + mr);
    }
  });
  it('melee weapons hit harder and reach further', () => {
    const t1: Record<string, [number, number]> = { qingfeng: [14, 180], longquan: [7, 160], yanyue: [25, 230], hoe: [15, 170], pestle: [11, 150], claw: [7, 120], drunkfist: [11, 140] };
    for (const [id, [d, range]] of Object.entries(t1)) { expect(WEAPONS[id as WeaponId].dmg[0]).toBe(d); expect(WEAPONS[id as WeaponId].range).toBe(range); }
    expect(F.meleeSteal).toBe(3); // the review's trim (design had 5)
    expect(F.iframes).toBe(0.5);
  });
});

// ═════════════════════════════════════════════ the engine: the kill names the relic and it counts at once

describe('镜宝 in the engine', () => {
  const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
  function fight(w: number, char: 'scholar' | 'guan', weapons: ReturnType<typeof W>): { eng: MirrorEngine; ends: WaveResult[]; errors: unknown[]; setup: WaveSetup } {
    const r0 = beginWave(run({ char, seed: 5 }, { wave: w - 1, weapons }));
    const setup = waveSetup(r0, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
    const ends: WaveResult[] = [], errors: unknown[] = [];
    const hooks: EngineHooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: (x) => ends.push(x), death: () => {}, error: (e) => errors.push(e) };
    const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
    const cv = { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) } as unknown as HTMLCanvasElement;
    const eng = createEngine(cv, r0, { painter: createDebugPainter(r0.map, 'high', 1), audio: SILENT, content: CONTENT, hooks, settings }) as MirrorEngine;
    eng.start(r0, setup); eng.world.godmode = true;
    return { eng, ends, errors, setup };
  }
  const step = (eng: MirrorEngine, n: number) => { for (let i = 0; i < n && (eng.world.phase === 'wave' || eng.world.phase === 'ending'); i++) { if (eng.paused) eng.resume(); eng.stepN(1); } };

  it('a ranged build felling the wave-10 boss gets 忘尘镜 at once, and the result carries it', () => {
    const f = fight(10, 'scholar', W([['dart', 2], ['thunder', 2]]));
    step(f.eng, 2);
    const Wd = f.eng.world, h = Wd.bossH[0];
    const dmg0 = Wd.stats.dmg, crit0 = Wd.stats.crit;
    Wd.kill(h, true);
    step(f.eng, 1);
    expect(Wd.stats.dmg - dmg0).toBe(50);
    expect(Wd.stats.crit - crit0).toBe(50);
    step(f.eng, 60 * 5);
    expect(f.ends).toHaveLength(1);
    expect(f.ends[0].relics).toEqual(['wangchen']);
    expect(f.errors).toEqual([]);
    f.eng.dispose();
  });

  it('双生: each body felled gives its own 龙渊剑; the first counts before the second falls', () => {
    const f = fight(40, 'guan', W([['yanyue', 3], ['qingfeng', 2], ['thunder', 2]]));
    step(f.eng, 2);
    const Wd = f.eng.world, hs = Wd.bossH.slice();
    expect(hs).toHaveLength(2);
    const hp0 = Wd.hpMax, ar0 = Wd.stats.armor;
    Wd.kill(hs[0], true);
    step(f.eng, 1);
    expect(Wd.hpMax - hp0).toBe(100);
    expect(Wd.stats.armor - ar0).toBe(20);
    expect(Wd.phase).toBe('wave');
    Wd.kill(hs[1], true);
    step(f.eng, 60 * 5);
    expect(f.ends[0].relics).toEqual(['longyuan', 'longyuan']);
    const next = endWave(f.eng.world.run, f.ends[0]);
    expect(next.items.longyuan).toBe(2);
    expect(f.errors).toEqual([]);
    f.eng.dispose();
  });
});

// ═════════════════════════════════════════════ m6: the boss-id rule, a grant refreshes the sheet, and the caps

describe('镜宝 · one per boss felled, counted at once, capped where the game caps', () => {
  const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
  function fight(w: number, char: RunSave['char'], weapons: ReturnType<typeof W>, o: { diff?: 0 | 1 | 2 | 3 | 4 | 5; items?: RunSave['items'] } = {}) {
    const r0 = beginWave(run({ char, seed: 5, diff: o.diff ?? 1 }, { wave: w - 1, weapons, items: o.items ?? {} }));
    const setup = waveSetup(r0, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
    const ends: WaveResult[] = [], errors: unknown[] = [];
    const hooks: EngineHooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: (x) => ends.push(x), death: () => {}, error: (e) => errors.push(e) };
    const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
    const cv = { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) } as unknown as HTMLCanvasElement;
    const eng = createEngine(cv, r0, { painter: createDebugPainter(r0.map, 'high', 1), audio: SILENT, content: CONTENT, hooks, settings }) as MirrorEngine;
    eng.start(r0, setup); eng.world.godmode = true;
    return { eng, ends, errors, r0 };
  }
  const step = (eng: MirrorEngine, n: number) => { for (let i = 0; i < n && (eng.world.phase === 'wave' || eng.world.phase === 'ending'); i++) { if (eng.paused) eng.resume(); eng.stepN(1); } };

  it('无相 wave 20 (one boss in two halves): the first half gives nothing, the last gives one', () => {
    const f = fight(20, 'scholar', W([['dart', 2], ['thunder', 2]]), { diff: 5 });
    step(f.eng, 2);
    const Wd = f.eng.world, hs = Wd.bossH.slice();
    expect(hs).toHaveLength(2);
    const dmg0 = Wd.stats.dmg;
    Wd.kill(hs[0], true);
    step(f.eng, 1);
    expect(Wd.relicsGot).toEqual([]);
    expect(Wd.stats.dmg).toBe(dmg0);
    Wd.kill(hs[1], true);
    step(f.eng, 1);
    expect(Wd.stats.dmg - dmg0).toBe(50);
    step(f.eng, 60 * 5);
    expect(f.ends[0].relics).toEqual(['wangchen']);
    expect(endWave(Wd.run, f.ends[0]).items.wangchen).toBe(1);
    expect(f.errors).toEqual([]);
    f.eng.dispose();
  });

  it('the moment: a centre title names it (the wave\'s 「破」 does not print over it) and its icon hangs over the boss, then flies to you', () => {
    const f = fight(10, 'scholar', W([['dart', 2], ['thunder', 2]]));
    step(f.eng, 2);
    const Wd = f.eng.world, h = Wd.bossH[0];
    Wd.kill(h, true);
    step(f.eng, 2);
    expect(Wd.titles.filter((t) => t.where === 'centre').map((t) => t.text.zh)).toEqual(['得 忘尘镜']);
    expect(Wd.titles.find((t) => t.where === 'centre')!.text.en).toBe('Dustless Mirror +1');
    const relicDrops = () => { let n = 0; for (let i = 0; i < Wd.D.n; i++) if (Wd.D.alive[i] && Wd.D.kind[i] === DK.relicMirror) n++; return n; };
    step(f.eng, 30); // half a second on: still hanging where the boss fell
    expect(relicDrops()).toBe(1);
    step(f.eng, 60 * 3);
    expect(relicDrops()).toBe(0);
    expect(f.ends[0].relics).toEqual(['wangchen']);
    f.eng.dispose();
  });

  it('镜主 (wave 50) gives one', () => {
    const f = fight(50, 'guan', W([['yanyue', 3], ['qingfeng', 2]]));
    step(f.eng, 2);
    const Wd = f.eng.world;
    for (const h of Wd.bossH.slice()) Wd.kill(h, true);
    step(f.eng, 60 * 5);
    expect(f.ends[0].relics).toEqual(['longyuan']);
    f.eng.dispose();
  });

  it('a mid-wave grant refreshes the static converts (铁骨: 护甲 → 伤害) and heals by the 气血 it adds', () => {
    const f = fight(10, 'guan', W([['yanyue', 2], ['qingfeng', 1]]), { items: { ironbone: 1 } });
    step(f.eng, 2);
    const Wd = f.eng.world, dmg0 = Wd.stats.dmg, ar0 = Wd.stats.armor, hp0 = Wd.hp;
    const s0 = computeStats(f.r0), s1 = computeStats({ ...f.r0, items: { ...f.r0.items, longyuan: 1 } });
    expect(s1.dmg - s0.dmg).toBeGreaterThan(0); // 铁骨 turns the relic's 护甲 into 伤害
    Wd.kill(Wd.bossH[0], true);
    step(f.eng, 1);
    expect(Wd.stats.armor - ar0).toBe(20);
    expect(Wd.stats.dmg - dmg0).toBeCloseTo(s1.dmg - s0.dmg);
    expect(Wd.hp - hp0).toBeGreaterThanOrEqual(99); // +100 max 气血 heals by 100 (a step of regen or a hit aside)
    expect(Wd.reachPct).toBe(20);
    f.eng.dispose();
  });

  it('墨宝 crit ×1.5 while 忘尘镜 is held, ×2.0 with 画龙点睛 (the larger wins), and 忘尘镜 brings no 攻速 of its own', () => {
    const r = run({ char: 'painter' }, { weapons: W([['brush', 1]]) });
    expect(dottingX(r)).toBe(0);
    expect(dottingX({ ...r, items: { wangchen: 1 } })).toBe(1.5);
    expect(dottingX({ ...r, items: { dotting: 1 } })).toBe(2);
    expect(dottingX({ ...r, items: { dotting: 1, wangchen: 3 } })).toBe(2);
    expect(readMods({ ...r, items: { wangchen: 2 } }).summonCrit).toBeNull();
    // in a fight: the ink slot can crit from the moment the boss falls
    const f = fight(10, 'scholar', W([['brush', 2], ['dart', 1]]));
    step(f.eng, 2);
    const Wd = f.eng.world, ink = () => Wd.slots.find((x) => x.id === 'brush')!;
    expect(ink().critX).toBe(0);
    Wd.kill(Wd.bossH[0], true);
    step(f.eng, 1);
    expect(ink().critX).toBe(1.5);
    f.eng.dispose();
  });

  it('five of either keep every cap: crit chance 100% (the rest → 暴击倍数), cooldown ≥ 0.1 s, 移速 ≤ +100%', () => {
    const m = computeStats(run({ char: 'scholar' }, { weapons: W([['dart', 1]]), items: { wangchen: 5 } }));
    const m0 = computeStats(run({ char: 'scholar' }, { weapons: W([['dart', 1]]) }));
    expect(m.dmg - m0.dmg).toBe(250);
    expect(m.crit - m0.crit).toBe(250);
    expect(critChance(WEAPONS.dart.crit, m)).toBe(1);
    expect(critMult(WEAPONS.dart.critX, WEAPONS.dart.crit, m)).toBeGreaterThan(WEAPONS.dart.critX + 1.5);
    expect(m.aspd - m0.aspd).toBe(100);
    expect(cooldown(0.15, m.aspd)).toBe(F.cdFloor);
    expect(moveSpeed(m)).toBe(F.baseSpeed * (1 + CLAMP.speedMax / 100));
    const g = computeStats(run({ char: 'guan' }, { weapons: W([['yanyue', 1]]), items: { longyuan: 5 } }));
    const g0 = computeStats(run({ char: 'guan' }, { weapons: W([['yanyue', 1]]) }));
    expect(g.hp - g0.hp).toBe(500);
    expect(g.armor - g0.armor).toBe(100);
    expect(armorReduction(g.armor)).toBeGreaterThanOrEqual(85); // a hit lands at ≤ 15% (and never below 1)
    expect(reachPct(run({ char: 'guan' }, { items: { longyuan: 5 } }))).toBe(100);
    expect(g.speed - g0.speed).toBe(100);
    // 大橘 (+25 移速) reaches the cap at four
    const c4 = computeStats(run({ char: 'cat' }, { weapons: W([['claw', 1]]), items: { longyuan: 4 } }));
    expect(c4.speed).toBeGreaterThanOrEqual(CLAMP.speedMax);
    expect(moveSpeed(c4)).toBe(F.baseSpeed * 2);
  });

  it('a deep fight holding five of each runs clean: no errors, you never move past the cap, the frame budget holds', () => {
    const f = fight(45, 'guan', W([['yanyue', 4], ['qingfeng', 4], ['hoe', 3]]), { items: { longyuan: 5, wangchen: 5 } });
    const Wd = f.eng.world;
    let top = 0;
    const t0 = performance.now();
    for (let i = 0; i < 60 * 20 && Wd.phase === 'wave'; i++) {
      if (f.eng.paused) f.eng.resume();
      f.eng.input.move(Math.cos(i / 40), Math.sin(i / 40));
      f.eng.stepN(1);
      top = Math.max(top, Math.hypot(Wd.pvx, Wd.pvy));
    }
    const ms = (performance.now() - t0) / (60 * 20);
    expect(f.errors).toEqual([]);
    expect(Wd.moveSpd).toBeLessThanOrEqual(F.baseSpeed * 2 + 1e-9);
    expect(top).toBeLessThanOrEqual(F.baseSpeed * 2 * 1.35 + 1); // walking (a knock can add a little)
    expect(ms).toBeLessThan(8);
    f.eng.dispose();
  });
});
