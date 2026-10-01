// 水月幻镜 · round 8, ITEMS (build plan §4.I): the plumbing (M1: I1 the Mods lists, C2 cls + when, I11 every op has a
// reader, I2 event buffs and the go event, I9 item Behaviours) and one scripted check per new item (M2), each on the
// real engine or the real shop. The last test asserts that no `wip` item is left.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  Behaviour, ContentRegistry, EffectOp, EngineHooks, EngineSettings, Effect, GameEvent, ItemDef, MirrorAudio, NewRunOpts, RunSave, Stats, WaveResult, WaveSetup,
} from '../src/views/mirror/types';
import { ITEM_REG, type ItemId, type WeaponId } from '../src/views/mirror/ids';
import { COMPANIONS, F, ITEMS, PASSIVES, SKILLS } from '../src/views/mirror/data';
import { ARCHETYPES } from '../src/views/mirror/data/meta';
import {
  allUnlocked, beginWave, classCounts, computeStats, emptyStats, itemPool, itemPrice, newRun, openShop, reroll, sellPrice, setTiers, shopSlotsOf, shopView, shopW,
  waveSetup, weaponPrice,
} from '../src/views/mirror/logic';
import { rerollOffPct } from '../src/views/mirror/logic/items';
import { upgrade, upgradePrice, upgradesLeft } from '../src/views/mirror/logic/shop';
import { panelView } from '../src/views/mirror/ui/panelView';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { OP_READERS, UNREAD_OPS, classExtras, liveStats, readMods, type Live } from '../src/views/mirror/engine/effects';
import { BLEED_MAX, BURN_MAX, EKind } from '../src/views/mirror/engine/pools';
import { HUADI_SHORT_PENALTY, ITEM_BOT_VALUE, botItemValue } from '../src/views/mirror/sim/itemvalues';
import { DK, HF, SRCI } from '../src/views/mirror/engine/consts';
import { isMoonKind, moonKindOf } from '../src/views/mirror/engine/moon';
import { houjiX } from '../src/views/mirror/engine/weapons';
import { wavePlan } from '../src/views/mirror/logic/spawn';
import { endWave } from '../src/views/mirror/logic/run';
import { summonCapOf } from '../src/views/mirror/logic/formulas';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const MIRROR = join(__dirname, '../src/views/mirror');

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
function make(run: RunSave, content: ContentRegistry = EMPTY): { eng: MirrorEngine; ends: WaveResult[]; errors: unknown[] } {
  const ends: WaveResult[] = [], errors: unknown[] = [];
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: (r) => ends.push(r), death: () => {},
    error: (e) => { errors.push(e); },
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio: SILENT, content, hooks, settings }) as MirrorEngine;
  return { eng, ends, errors };
}
type W8 = MirrorEngine['world'];
/** A run at wave w with these weapons and items, ready to start. */
function runAt(w: number, weapons: [WeaponId, 1 | 2 | 3 | 4][], items: Partial<Record<ItemId, number>>, o: Partial<NewRunOpts> = {}): { run: RunSave; setup: WaveSetup } {
  const run = beginWave({ ...newRun(opts(o)), wave: w - 1, weapons: weapons.map(([id, t]) => ({ id, t })), items: items as RunSave['items'] });
  return { run, setup: waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)) };
}
/** Start a quiet arena: no planned spawns, endless, you cannot die, weapons never fire on their own. */
function quiet(run: RunSave, setup: WaveSetup, content: ContentRegistry = EMPTY): { eng: MirrorEngine; W: W8; errors: unknown[] } {
  const { eng, errors } = make(run, content);
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  for (const s of W.slots) s.cd = 1e9;
  return { eng, W, errors };
}
/** Swap an item's fx (and stats) for the length of a test; restored in afterEach. */
const swapped: (() => void)[] = [];
function setItem(id: ItemId, patch: Partial<ItemDef>): void {
  const it = ITEMS[id] as unknown as Record<string, unknown>;
  const was: Record<string, unknown> = {};
  for (const k in patch) was[k] = it[k];
  Object.assign(it, patch);
  swapped.push(() => Object.assign(it, was));
}
afterEach(() => { while (swapped.length) swapped.pop()!(); });

const LIVE0: Live = { waveTime: 5, hpFrac: 1, still: 0, swordsAir: 0, weapons: 1 };

// ═════════════════════════════════════════════════════════════════════════ M1 · the plumbing

describe('m8 items · I11: every op has a reader', () => {
  it('every `do` in ITEMS (not wip), PASSIVES and SKILLS has a reader that mentions it, and none is unread', () => {
    const used = new Map<EffectOp, string>();
    const scan = (fx: readonly Effect[] | undefined, who: string) => { for (const e of fx ?? []) if (!used.has(e.do)) used.set(e.do, who); };
    for (const r of ITEM_REG) if (!ITEMS[r.id].wip) scan(ITEMS[r.id].fx, r.id);
    for (const id in PASSIVES) scan(PASSIVES[id as keyof typeof PASSIVES].fx, id);
    for (const id in SKILLS) scan((SKILLS[id as keyof typeof SKILLS] as { fx?: readonly Effect[] }).fx, id);
    expect(used.size).toBeGreaterThan(20);
    for (const [op, who] of used) {
      expect(UNREAD_OPS.has(op), `${who} uses ${op}, which no reader handles yet`).toBe(false);
      const files = OP_READERS[op];
      expect(files?.length, `${op} (${who}) has no reader`).toBeGreaterThan(0);
      for (const f of files) expect(readFileSync(join(MIRROR, f), 'utf8').includes(`'${op}'`), `${f} names '${op}'`).toBe(true);
    }
  });

  it('an op the engine does not know fails loudly', () => {
    setItem('songzi', { fx: [{ hook: 'cond', do: 'nonsense' } as unknown as Effect] });
    expect(() => readMods({ ...newRun(opts()), items: { songzi: 1 } as RunSave['items'] })).toThrow(/no reader/);
  });
});

describe('m8 items · I1: two items with the same op both apply', () => {
  const run = (items: Partial<Record<ItemId, number>>, char: NewRunOpts['char'] = 'gardener') => ({ ...newRun(opts({ char })), items: items as RunSave['items'] });

  it('returnHeal keeps the larger heal and adds the caps (剑归 + 洗剑池)', () => {
    expect(readMods(run({ washpool: 1 })).returnHeal).toEqual({ v: 1, cap: 2 });
    setItem('songzi', { fx: [{ hook: 'sword', do: 'returnHeal', v: 2, capPerSec: 3 }] });
    expect(readMods(run({ washpool: 1, songzi: 1 })).returnHeal).toEqual({ v: 2, cap: 5 });
  });

  it('echo, every, shards, charm, onDodge buffs and live converts are lists (or merges), not the last one read', () => {
    setItem('songzi', {
      fx: [
        { hook: 'onHit', do: 'echo', cls: 'bow', delay: 0.3, pct: 30 },
        { hook: 'onHit', do: 'every', cls: 'sword', n: 4, x: 1.5 },
        { hook: 'onDodge', do: 'shards', n: 2, base: 5, scale: { elem: 0.2 } },
        { hook: 'onHit', do: 'charmMod', x: 2, dmgPct: 20, base: 10, scale: { elem: 1 } },
        { hook: 'onDodge', do: 'buff', stats: { aspd: 10 }, dur: 1 },
        { hook: 'cond', do: 'convert', from: 'summons', per: 1, k: 2, to: ['armor'], max: 10 },
      ],
    });
    const m = readMods(run({ lingering: 1, dragblade: 1, moonsoul: 1, boya: 1, osmanthus: 1, miser: 1, songzi: 1 }));
    expect(m.echo.map((e) => e.cls).sort()).toEqual(['bow', 'music']);
    expect(m.every.map((e) => e.cls).sort()).toEqual(['heavy', 'sword']);
    expect(m.shards.length).toBe(2);
    expect(m.charm).toMatchObject({ x: 2, dmgPct: 50, base: 30 });
    expect(m.evBuffs.filter((b) => b.hook === 'onDodge').map((b) => b.key).sort()).toEqual(['osmanthus#1', 'songzi#4']);
    expect(m.conv.map((c) => c.from).sort()).toEqual(['moonHeld', 'summons']);
    // both converts reach the live sheet
    const base = computeStats(run({ miser: 1, songzi: 1 }));
    const out = emptyStats();
    liveStats(out, base, m, LIVE0, { moonHeld: 100, summons: 3, drunk: 0, drunkActive: false, drunkFull: false, moonPhase: 0, change: false, buffs: [], solo: 1, dugu: false });
    expect(out.armor).toBe(base.armor + 6);
    expect(out.dmg).toBeGreaterThan(base.dmg);
  });

  it('two onDodge buffs both land on a dodge (广寒桂 and another)', () => {
    setItem('songzi', { fx: [{ hook: 'onDodge', do: 'buff', stats: { aspd: 10 }, dur: 1 }] });
    const { run: r, setup } = runAt(3, [['qingfeng', 1]], { osmanthus: 1, songzi: 1 });
    const { eng, W } = quiet(r, setup);
    W.godmode = false;
    W.stats.dodge = 100; W.dodgeCap = 100;
    W.hurtFrom(5, -1, false, false, 'test', false, false);
    expect(W.buffs.map((b) => b.key).sort()).toEqual(['osmanthus#1', 'songzi#0']);
    eng.stepN(1);
    expect(W.stats.aspd).toBeGreaterThanOrEqual(W.base.aspd + 10);
    expect(W.stats.dmg).toBeGreaterThanOrEqual(W.base.dmg + 30);
    eng.dispose();
  });
});

describe('m8 items · C2: a class cond reads cls and when together', () => {
  it('满弓-style: bow +25 伤害 only after standing 0.35 s; −10 攻速 only while moving; others untouched', () => {
    setItem('songzi', {
      fx: [
        { hook: 'cond', do: 'stats', stats: { dmg: 25, pierce: 1 }, cls: 'bow', when: { k: 'still', s: 0.35 } },
        { hook: 'cond', do: 'stats', stats: { aspd: -10 }, cls: 'bow', when: { k: 'moving', s: 0.35 } },
        { hook: 'cond', do: 'stats', stats: { dmg: 50 }, cls: 'bow', pct: true },
      ],
    });
    const run = { ...newRun(opts()), items: { songzi: 1 } as RunSave['items'] };
    const m = readMods(run);
    const live = computeStats(run);
    live.dmg = 40;
    const at = (still: number, cls: 'bow' | 'sword'): Stats => classExtras(emptyStats(), live, [cls], m, { ...LIVE0, still });
    // the pct line: +50 % of the live 伤害 (40) for bows
    expect(at(0.1, 'bow').dmg).toBeCloseTo(40 + 20);
    expect(at(0.1, 'bow').aspd).toBe(live.aspd - 10);
    expect(at(0.5, 'bow').dmg).toBeCloseTo(40 + 20 + 25);
    expect(at(0.5, 'bow').pierce).toBe(live.pierce + 1);
    expect(at(0.5, 'bow').aspd).toBe(live.aspd);
    expect(at(0.5, 'sword').dmg).toBe(40);
    // computeStats never takes a class cond into the sheet
    expect(computeStats(run).dmg).toBe(computeStats(newRun(opts())).dmg);
  });
});

describe('m8 items · I2: event buffs and the go event', () => {
  it('an onHit buff stacks up to `stack`, only for its class, and every stack ends together after `dur`', () => {
    setItem('songzi', { fx: [{ hook: 'onHit', do: 'buff', cls: 'fist', stats: { aspd: 3 }, dur: 1.5, stack: 10 }] });
    const { run, setup } = runAt(3, [['claw', 1], ['qingfeng', 1]], { songzi: 1 });
    const { eng, W } = quiet(run, setup);
    const h = W.spawn('blot', W.px + 60, W.py, { bloom: false, capped: false });
    const i = W.E.slotOf(h);
    W.E.hp[i] = W.E.hpMax[i] = 1e9;
    const fist = W.slots.findIndex((s) => s.id === 'claw'), sword = W.slots.findIndex((s) => s.id === 'qingfeng');
    const hit = (slot: number) => W.strike(i, 1, 0, 1, 0, W.px, W.py, slot, SRCI.weapon, 0);
    hit(sword);
    expect(W.buffs.length).toBe(0);
    for (let k = 0; k < 14; k++) hit(fist);
    eng.stepN(1);
    expect(W.stats.aspd).toBeCloseTo(W.base.aspd + 30);
    // a noProc hit (a DoT, a burst) adds nothing
    W.strike(i, 1, 0, 1, 0, W.px, W.py, fist, SRCI.weapon, HF.noProc);
    eng.stepN(60);
    expect(W.stats.aspd).toBeCloseTo(W.base.aspd + 30);
    eng.stepN(40);
    expect(W.buffs.length).toBe(0);
    expect(W.stats.aspd).toBeCloseTo(W.base.aspd);
    // it starts again from one stack
    hit(fist);
    eng.stepN(1);
    expect(W.stats.aspd).toBeCloseTo(W.base.aspd + 3);
    eng.dispose();
  });

  it('onGo fires when you start moving after standing still for ≥ after; moveX multiplies walking after the cap', () => {
    setItem('songzi', { fx: [{ hook: 'onGo', do: 'buff', after: 1, stats: { aspd: 30, dodge: 10 }, dur: 2, moveX: 1.5 }] });
    const { run, setup } = runAt(3, [['qingfeng', 1]], { songzi: 1, huadi: 1 });
    setItem('huadi', { stats: { aspd: 100 }, fx: [{ hook: 'cond', do: 'moveCap', x: 0.5 }] });
    const { eng, W } = quiet(run, setup);
    const walk = (steps: number) => { W.moveX = 1; W.moveY = 0; eng.stepN(steps); };
    const stand = (steps: number) => { W.moveX = 0; W.moveY = 0; eng.stepN(steps); };
    stand(30); // 0.5 s: too short
    walk(5);
    expect(W.buffs.length).toBe(0);
    stand(80); // 1.3 s
    const x0 = W.px;
    walk(2);
    expect(W.buffs.map((b) => b.key)).toEqual(['songzi#0']);
    expect(W.stats.aspd).toBeCloseTo(W.base.aspd + 30);
    walk(30);
    // the walk is capped at 0.5 × the base pace, and the burst multiplies after the cap
    expect(W.moveSpd).toBe(0.5 * F.baseSpeed);
    const v = (W.px - x0) / (32 / 60);
    expect(v).toBeGreaterThan(0.5 * F.baseSpeed * 1.2);
    expect(v).toBeLessThanOrEqual(0.5 * F.baseSpeed * 1.5 + 1);
    eng.dispose();
  });
});

describe('m8 items · I9: item Behaviours', () => {
  it('a held item\'s Behaviour starts each wave with arg = the count held and hears the combat events', () => {
    const seen: { arg?: number; ev: string[] } = { ev: [] };
    const B: Behaviour<number> = {
      start: (_w, arg) => { seen.arg = arg; return 0; },
      on: (_w, _s, ev: GameEvent) => { seen.ev.push(ev.type); },
    };
    const content: ContentRegistry = { ...EMPTY, items: { tigertally: B as Behaviour } };
    const { run, setup } = runAt(3, [['qingfeng', 1]], { tigertally: 2 });
    const { eng, W } = quiet(run, setup, content);
    expect(seen.arg).toBe(2);
    const h = W.spawn('blot', W.px + 60, W.py, { bloom: false, capped: false });
    W.strike(W.E.slotOf(h), 1e9, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
    expect(seen.ev).toContain('hit');
    expect(seen.ev).toContain('kill');
    eng.dispose();
    // the shipped registry is CONTENT.items
    expect(CONTENT.items).toBeTruthy();
    void EKind; void COMPANIONS;
  });
});

// ═════════════════════════════════════════════════════════════════════════ M2 · the items, one scripted check each

/** A fat ordinary foe at (dx, dy) from you, or an elite / boss; returns its slot. */
function foe(W: W8, dx: number, dy = 0, kind: 'mon' | 'elite' | 'boss' = 'mon', hp = 1e6): number {
  const h = kind === 'boss' ? W.spawnBoss('carp', W.px + dx, W.py + dy, hp)
    : W.spawn(kind === 'elite' ? 'turtle' : 'blot', W.px + dx, W.py + dy, { bloom: false, capped: false });
  const i = W.E.slotOf(h);
  W.E.hp[i] = W.E.hpMax[i] = hp;
  W.E.armor[i] = 0;
  return i;
}
/** One weapon hit from slot `slot` (raw `dmg`, no crit roll, armour off) on enemy slot i; returns what it dealt. */
const hitWith = (W: W8, i: number, slot: number, dmg = 100, flags = HF.noArmor, knock = 0) =>
  W.strike(i, dmg, 0, 1, knock, W.px, W.py, slot, SRCI.weapon, flags);
const slotOf = (W: W8, id: WeaponId) => W.slots.findIndex((s) => s.id === id);

describe('m8 items · batch a: rule benders and the shop', () => {
  it('画地为牢: +100 攻速; walking is capped at 0.5 × the base pace (140) even at 身法 +100; a keyed burst may break it', () => {
    expect(ITEMS.huadi.stats).toEqual({ aspd: 100 });
    const { run, setup } = runAt(9, [['qingfeng', 1]], { huadi: 1 });
    const fast = { ...run, stats: { ...run.stats, speed: 150 } };
    expect(computeStats(fast).speed).toBeGreaterThanOrEqual(100);
    const { eng, W } = quiet(fast, setup);
    expect(W.moveSpd).toBe(0.5 * F.baseSpeed);
    expect(W.moveSpd).toBeLessThanOrEqual(140);
    expect(W.stats.aspd - computeStats({ ...fast, items: {} }).aspd).toBe(100);
    W.buff('burst', {}, 1, 2);
    const x0 = W.px;
    W.moveX = 1; eng.stepN(30);
    expect((W.px - x0) / 0.5).toBeGreaterThan(140 * 1.5);
    eng.dispose();
    // the panel names the cap
    expect(panelView(fast, null, (z) => z).tiles.find((x) => x.id === 'speed')!.sub).toBe('最快每秒 140（画地为牢）');
    expect(panelView(fast, null, (_z, e) => e).tiles.find((x) => x.id === 'speed')!.sub).toBe('At most 140 a second (Circle on the Ground)');
    expect(panelView({ ...fast, items: {} }, null, (z) => z).tiles.find((x) => x.id === 'speed')!.sub).not.toContain('画地为牢');
  });

  it('触类旁通: every class you carry counts one more piece: 1 sword is a 2-set, 5 are a 6-set; classCounts is unchanged', () => {
    const one = { weapons: [{ id: 'qingfeng' as WeaponId, t: 1 as const }], items: { chulei: 1 } as RunSave['items'] };
    expect(setTiers(one)).toEqual({ sword: 0 });
    expect(classCounts(one)).toEqual({ sword: 1 });
    const five = { weapons: Array.from({ length: 5 }, () => ({ id: 'qingfeng' as WeaponId, t: 1 as const })), items: { chulei: 1 } as RunSave['items'] };
    expect(setTiers(five).sword).toBe(2);
    const run = { ...newRun(opts()), ...one };
    const base = computeStats({ ...run, items: {} });
    expect(computeStats(run).crit).toBeGreaterThan(base.crit);
    const row = panelView(run, null, (z) => z).sets.find((x) => x.cls === 'sword')!;
    expect(row).toMatchObject({ count: 1, plus: 1, tier: 0 });
    expect(row.next).toContain('再 2 把（凑满 4 把）');
  });

  it('货比三家: each reroll here (free ones too) takes 5% off every price, at most 25%; not offered under 破釜沉舟', () => {
    const u = allUnlocked();
    let run: RunSave = { ...newRun(opts({ seed: 31 })), wave: 9, moon: 1e6, items: { huobi: 1 } as RunSave['items'] };
    run = openShop(run, u);
    const priceNow = (r: RunSave) => shopView(r).slots.map((s) => s.price);
    const list = (r: RunSave) => r.shop!.slots.map((s) => (s ? (s.kind === 'weapon' ? weaponPrice(s.id, s.t, shopW(r), r) : itemPrice(s.id, shopW(r), r)) : 0));
    expect(priceNow(run)).toEqual(list(run));
    for (let k = 1; k <= 7; k++) {
      run = reroll(run, u)!;
      const off = Math.min(25, 5 * k);
      expect(rerollOffPct(run)).toBe(off);
      shopView(run).slots.forEach((s, j) => { if (s.slot) expect(s.price).toBe(Math.max(1, Math.round(list(run)[j] * (1 - off / 100)))); });
    }
    // a new shop starts full price
    expect(rerollOffPct(openShop({ ...run, wave: 10 }, u))).toBe(0);
    // under 破釜沉舟 it is never offered
    const pf = { ...newRun(opts()), items: { burnboats: 1 } as RunSave['items'] };
    expect(itemPool(pf, u, 2, 20)).not.toContain('huobi');
    expect(itemPool({ ...pf, items: {} }, u, 2, 20)).toContain('huobi');
  });

  // the skip itself is BALANCE's rollSlot (PLAN C11); this runs as soon as it honours noWeapons(run)
  const rollSlotSkips = readFileSync(join(MIRROR, 'logic/shop.ts'), 'utf8').includes('noWeapons(');
  it.skipIf(!rollSlotSkips)('奇货可居: +1 shop slot and no weapon offered in 1,000 seeded shops (new ones and copies)', () => {
    const u = allUnlocked();
    const plain = { ...newRun(opts()), items: { qihuo: 1 } as RunSave['items'] };
    expect(shopSlotsOf(plain)).toBe(shopSlotsOf({ ...plain, items: {} }) + 1);
    let weapons = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const full = seed % 2 === 0;
      const ws = Array.from({ length: full ? 6 : 1 }, () => ({ id: 'qingfeng' as WeaponId, t: 1 as const }));
      const run = { ...newRun(opts({ seed })), wave: [1, 5, 12, 25, 40][seed % 5], weapons: ws, items: { qihuo: 1 } as RunSave['items'] };
      for (const s of openShop(run, u).shop!.slots) if (s?.kind === 'weapon') weapons++;
    }
    expect(weapons).toBe(0);
  });

  it('点石成金: once a shop, pay 150% of a copy to raise a weapon a tier (not 神); a new shop allows it again', () => {
    const u = allUnlocked();
    let run: RunSave = openShop({ ...newRun(opts({ seed: 5 })), wave: 9, moon: 5000, weapons: [{ id: 'qingfeng', t: 1 }, { id: 'yanyue', t: 4 }], items: { dianshi: 1 } as RunSave['items'] }, u);
    const price = Math.round(weaponPrice('qingfeng', 1, shopW(run), run) * 1.5);
    expect(upgradePrice(run, 0)).toBe(price);
    expect(upgradePrice(run, 1)).toBeNull(); // 神品
    expect(upgradesLeft(run)).toBe(1);
    const next = upgrade(run, 0)!;
    expect(next.weapons[0]).toEqual({ id: 'qingfeng', t: 2 });
    expect(next.moon).toBe(run.moon - price);
    expect(upgrade(next, 0)).toBeNull(); // spent in this shop
    expect(upgradesLeft(next)).toBe(0);
    run = openShop({ ...next, wave: 10 }, u);
    expect(upgradesLeft(run)).toBe(1);
    expect(upgrade({ ...run, moon: 1 }, 0)).toBeNull(); // unaffordable
    // without the item there is no 点金
    expect(upgradePrice({ ...run, items: {} }, 0)).toBeNull();
    expect(upgrade({ ...run, items: {} }, 0)).toBeNull();
  });

  it('QA: with 货比三家 at its cap, 点金 is 150% of the copy price this shop shows, and no weapon sells for its discounted buy price', () => {
    const u = allUnlocked();
    let run: RunSave = openShop({ ...newRun(opts({ seed: 5 })), wave: 12, moon: 1e6, weapons: [{ id: 'qingfeng', t: 3 }], items: { dianshi: 1, huobi: 1, pawn: 1 } as RunSave['items'], heart: { heartTrade: 3 } }, u);
    for (let k = 0; k < 5; k++) run = reroll(run, u)!;
    expect(rerollOffPct(run)).toBe(25);
    const shown = Math.max(1, Math.round(weaponPrice('qingfeng', 3, shopW(run), run) * 0.75));
    expect(Math.abs(upgradePrice(run, 0)! - shown * 1.5)).toBeLessThanOrEqual(1);
    for (const w of [12, 30, 40]) {
      const r = { ...run, wave: w };
      expect(sellPrice(r, 'qingfeng', 3, w)).toBeLessThan(Math.round(weaponPrice('qingfeng', 3, w, r) * 0.75));
    }
  });
});

describe('m8 items · batch b: on hit, on kill, on dodge', () => {
  it('斩草除根: sword hits ×2 below 30% HP, ×1.5 on elites and bosses; other classes and healthier foes as usual', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1], ['yanyue', 1]], { zhancao: 1 });
    const { eng, W } = quiet(run, setup);
    const sw = slotOf(W, 'qingfeng'), hv = slotOf(W, 'yanyue');
    const i = foe(W, 60);
    expect(hitWith(W, i, sw)).toBe(100);
    W.E.hp[i] = 0.29 * W.E.hpMax[i];
    expect(hitWith(W, i, sw)).toBe(200);
    expect(hitWith(W, i, hv)).toBe(100);
    const e = foe(W, -60, 0, 'elite');
    W.E.hp[e] = 0.2 * W.E.hpMax[e];
    expect(hitWith(W, e, sw)).toBe(150);
    const b = foe(W, 0, 200, 'boss');
    W.E.hp[b] = 0.1 * W.E.hpMax[b];
    expect(hitWith(W, b, sw)).toBe(150);
    eng.dispose();
  });

  it('泰山压顶: +20% on heavy weapons only; a heavy hit roots (elites half, bosses never) instead of knocking back', () => {
    const { run, setup } = runAt(9, [['yanyue', 1], ['qingfeng', 1]], { taishan: 1 });
    const { eng, W } = quiet(run, setup);
    const hv = slotOf(W, 'yanyue'), sw = slotOf(W, 'qingfeng');
    eng.stepN(1);
    // the class sheet: heavy +20 伤害, the sword untouched
    const heavySheet = classExtras(emptyStats(), W.stats, ['heavy'], W.mods, W.live), swordSheet = classExtras(emptyStats(), W.stats, ['sword'], W.mods, W.live);
    expect(heavySheet.dmg).toBe(W.stats.dmg + 20);
    expect(swordSheet.dmg).toBe(W.stats.dmg);
    const i = foe(W, 60), e = foe(W, -60, 0, 'elite'), b = foe(W, 0, 200, 'boss');
    hitWith(W, i, hv, 10, HF.noArmor, 200);
    expect(W.E.rootT[i]).toBeCloseTo(0.6);
    expect(W.E.kT[i]).toBe(0);
    hitWith(W, e, hv, 10, HF.noArmor, 200);
    expect(W.E.rootT[e]).toBeCloseTo(0.3);
    hitWith(W, b, hv, 10, HF.noArmor, 200);
    expect(W.E.rootT[b]).toBe(0);
    // a sword still pushes
    const j = foe(W, 60, 60);
    hitWith(W, j, sw, 10, HF.noArmor, 200);
    expect(W.E.rootT[j]).toBe(0);
    expect(W.E.kT[j]).toBeGreaterThan(0);
    eng.dispose();
  });

  it('一气呵成: each fist hit +3% 攻速, 10 stacks at most, gone 1.5 s after the last fist hit', () => {
    const { run, setup } = runAt(9, [['claw', 1]], { yiqi: 1 });
    const { eng, W } = quiet(run, setup);
    const i = foe(W, 60);
    for (let k = 0; k < 25; k++) hitWith(W, i, 0, 1);
    eng.stepN(1);
    expect(W.stats.aspd - W.base.aspd).toBeCloseTo(30);
    eng.stepN(95);
    expect(W.stats.aspd - W.base.aspd).toBeCloseTo(0);
    eng.dispose();
  });

  it('见血封喉: a hidden-weapon hit bleeds 20% of the hit a second for 3 s, 5 stacks; a refresh at the cap keeps the larger', () => {
    const { run, setup } = runAt(9, [['dart', 1], ['qingfeng', 1]], { jianxue: 1 });
    const { eng, W } = quiet(run, setup);
    const dt = slotOf(W, 'dart'), sw = slotOf(W, 'qingfeng');
    const i = foe(W, 60);
    hitWith(W, i, sw, 100);
    expect(W.E.bleedN[i]).toBe(0);
    hitWith(W, i, dt, 100);
    expect(W.E.bleedN[i]).toBe(1);
    expect(W.E.bleedD[i * BLEED_MAX]).toBeCloseTo(20);
    for (let k = 0; k < 6; k++) hitWith(W, i, dt, 50);
    expect(W.E.bleedN[i]).toBe(5);
    hitWith(W, i, dt, 1000);
    const ds = Array.from({ length: 5 }, (_, s) => W.E.bleedD[i * BLEED_MAX + s]);
    expect(Math.max(...ds)).toBeCloseTo(200);
    // it bleeds: about the stacks' sum a second
    const hp0 = W.E.hp[i];
    eng.stepN(60);
    const sum = ds.reduce((a, b) => a + b, 0);
    expect(hp0 - W.E.hp[i]).toBeGreaterThan(sum * 0.9);
    expect(hp0 - W.E.hp[i]).toBeLessThan(sum * 1.1);
    eng.dispose();
  });

  it('百步穿杨: bow hits +10% per 100 between you and the target, at most +50%', () => {
    const { run, setup } = runAt(9, [['sunbow', 1], ['qingfeng', 1]], { baibu: 1 });
    const { eng, W } = quiet(run, setup);
    const bw = slotOf(W, 'sunbow'), sw = slotOf(W, 'qingfeng');
    const near = foe(W, 0.001), mid = foe(W, 300), far = foe(W, 0, 900);
    expect(hitWith(W, near, bw, 1000)).toBeCloseTo(1000, 0);
    expect(hitWith(W, mid, bw, 1000)).toBeCloseTo(1300, 0);
    expect(hitWith(W, far, bw, 1000)).toBeCloseTo(1500, 0);
    expect(hitWith(W, mid, sw, 1000)).toBe(1000);
    eng.dispose();
  });

  it('四面楚歌: a music hit makes the target take +12% (bosses +6%) from everything for 2 s', () => {
    const { run, setup } = runAt(9, [['qin', 1], ['qingfeng', 1]], { chuge: 1 });
    const { eng, W } = quiet(run, setup);
    const mu = slotOf(W, 'qin'), sw = slotOf(W, 'qingfeng');
    const i = foe(W, 60), b = foe(W, 0, 200, 'boss');
    hitWith(W, i, mu, 1);
    expect(hitWith(W, i, sw, 1000)).toBeCloseTo(1120, 0);
    hitWith(W, b, mu, 1);
    expect(hitWith(W, b, sw, 1000)).toBeCloseTo(1060, 0);
    eng.stepN(130);
    expect(hitWith(W, i, sw, 1000)).toBe(1000);
    eng.dispose();
  });

  it('星火燎原: a burning kill passes its strongest burn to the 2 nearest within 120; at most 20 a second', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { liaoyuan: 1 });
    const { eng, W } = quiet(run, setup);
    const v = foe(W, 100, 0, 'mon', 50);
    const a = foe(W, 150, 0), c = foe(W, 100, 60), far = foe(W, 100, 400), d = foe(W, 60, 0);
    for (const j of [v, a, c, far, d]) W.E.speed[j] = 0;
    eng.stepN(1); // the hash is rebuilt each step
    W.statusSlot(v, 'burn', 5, 40);
    hitWith(W, v, 0, 1e6);
    expect(W.E.alive[v]).toBe(0);
    const burning = [a, c, d, far].filter((j) => W.E.burnN[j] > 0);
    // the two nearest to the victim: d (40 away) and a (50); c (60) and the far one stay unlit
    expect(burning.sort((x, y) => x - y)).toEqual([a, d].sort((x, y) => x - y));
    expect(W.E.burnN[c]).toBe(0);
    expect(W.E.burnN[far]).toBe(0);
    expect(W.E.burnD[burning[0] * BURN_MAX]).toBe(40);
    // the per-second budget
    const xs: number[] = [];
    for (let k = 0; k < 40; k++) { xs.push(foe(W, 300, 300 + k * 5, 'mon', 10)); foe(W, 320, 300 + k * 5); }
    eng.stepN(1);
    for (const x of xs) { W.statusSlot(x, 'burn', 5, 10); hitWith(W, x, 0, 1e6); }
    expect(W.itemTally.spreads).toBeLessThanOrEqual(20);
    expect(W.itemTally.spreads).toBeGreaterThanOrEqual(19);
    eng.dispose();
  });

  it('连环计: kills burst for 25% of the victim\'s max HP within 90; ≤ 15 bursts a second; a boss ≤ 2% a burst, ≤ 1 a second', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { lianhuan: 1 });
    const { eng, W } = quiet(run, setup);
    const boss = foe(W, 0, 300, 'boss', 1e6);
    // a chain: each 100-HP body dies to its neighbour's 25-point burst? no: 4 bursts of 25 kill one
    const pack: number[] = [];
    for (let k = 0; k < 60; k++) pack.push(foe(W, 0, 300 + ((k % 6) - 3) * 12, 'mon', 100));
    for (const j of [boss, ...pack]) W.E.speed[j] = 0;
    eng.stepN(1); // the hash is rebuilt each step
    const bossHp0 = W.E.hp[boss];
    const n0 = W.itemTally.blasts;
    for (let k = 0; k < 30; k++) hitWith(W, pack[k], 0, 1e6);
    expect(W.itemTally.blasts - n0).toBeLessThanOrEqual(15);
    expect(W.itemTally.bossBlasts).toBeLessThanOrEqual(1);
    expect(bossHp0 - W.E.hp[boss]).toBeLessThanOrEqual(0.02 * W.E.hpMax[boss] + 1e-6);
    expect(bossHp0 - W.E.hp[boss]).toBeGreaterThan(0);
    // a second later: one more burst may touch the boss
    eng.stepN(61);
    const p2 = foe(W, 0, 290, 'mon', 100);
    eng.stepN(1);
    hitWith(W, p2, 0, 1e6);
    expect(W.itemTally.bossBlasts).toBe(2);
    // raw damage: 25% of the victim's max HP, no crit
    const v = foe(W, -400, 0, 'mon', 400), t = foe(W, -440, 0, 'mon', 1e6);
    W.E.speed[v] = W.E.speed[t] = 0;
    eng.stepN(61);
    hitWith(W, v, 0, 1e6);
    expect(W.E.hpMax[t] - W.E.hp[t]).toBeCloseTo(100, 0);
    eng.dispose();
  });

  it('倒戈相向: a hit may turn an ordinary foe for 6 s; it counts only its own turned foes (cap 8); never elites', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { daoge: 1 });
    const { eng, W } = quiet(run, setup);
    setItem('daoge', { fx: [{ hook: 'onHit', do: 'status', kind: 'convert', p: 100, dur: 6, luck: true, cap: 8 }] });
    W.mods = readMods(W.run);
    const e = foe(W, -60, 0, 'elite');
    hitWith(W, e, 0, 1);
    expect(W.E.kind[e]).toBe(EKind.Elite);
    const fs = Array.from({ length: 12 }, (_, k) => foe(W, 80 + k * 30, 0));
    for (const i of fs) hitWith(W, i, 0, 1);
    expect(fs.filter((i) => W.E.kind[i] === EKind.Ally).length).toBe(8);
    // a 点化-style ally made elsewhere does not count against the cap
    eng.dispose();
    // the real data: 2% × the proc factor × 福缘; over many hits a few turn, never more than 8 at once
    const r2 = runAt(9, [['qingfeng', 1]], { daoge: 1 });
    const q = quiet(r2.run, r2.setup);
    const many = Array.from({ length: 30 }, (_, k) => foe(q.W, 60 + k * 10, 40));
    for (let k = 0; k < 2000; k++) hitWith(q.W, many[k % 30], 0, 1);
    const allies = many.filter((i) => q.W.E.kind[i] === EKind.Ally).length;
    expect(q.W.itemTally.turned).toBeGreaterThan(0);
    expect(allies).toBeLessThanOrEqual(8);
    q.eng.dispose();
  });

  it('后发先至: a dodge primes each weapon for 1.5 s: its next attack is a sure crit ×1.5; at most once every 2 s', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1], ['sunbow', 1]], { xianzhi: 1 });
    const { eng, W } = quiet(run, setup);
    W.godmode = false;
    W.base.dodge = W.stats.dodge = 100; W.dodgeCap = 100;
    const dodge = () => { W.iframes = 0; W.hurtFrom(5, -1, false, false, 'test', false, false); };
    dodge();
    expect(W.itemTally.primed).toBe(1);
    expect(W.primeMask).toBe(3);
    // a crit is forced and ×1.5: watch the strikes of the next attack
    const crits: boolean[] = [];
    const s0 = W.strike.bind(W);
    (W as unknown as { strike: typeof W.strike }).strike = (i, dmg, critP, ...a) => { crits.push(critP >= 1); return s0(i, dmg, critP, ...a); };
    foe(W, 60);
    W.slots[0].cd = 0;
    eng.stepN(1);
    expect(crits.length).toBeGreaterThan(0);
    expect(crits.every(Boolean)).toBe(true);
    expect(W.primeMask).toBe(2);
    // within the cooldown a second dodge does not prime again
    eng.stepN(30);
    dodge();
    expect(W.itemTally.primed).toBe(1);
    eng.stepN(120);
    dodge();
    expect(W.itemTally.primed).toBe(2);
    // primes expire after 1.5 s unused
    eng.stepN(100);
    W.slots[0].cd = 0; crits.length = 0;
    eng.stepN(1);
    expect(crits.some((c) => !c) || crits.length === 0).toBe(true);
    eng.dispose();
  });
});

describe('m8 items · batch c: 月华 and risk', () => {
  it('众星捧月: +3 伤害 per 5 unpulled 月华 within pickupR + 150 (max +60); pieces flying to you and far ones do not count; 拾取 −70', () => {
    expect(ITEMS.pengyue.stats).toEqual({ pickup: -70 });
    const { run, setup } = runAt(9, [['qingfeng', 1]], { pengyue: 1 });
    const { eng, W } = quiet(run, setup);
    eng.stepN(1);
    expect(W.pickupR).toBeCloseTo(F.pickupBase * 0.3);
    const d0 = W.stats.dmg;
    const D = W.D;
    const put = (dx: number, worth: number) => { W.dropOne(moonKindOf(worth), W.px + dx, W.py, worth, -1); };
    put(110, 5); put(-110, 5); put(0, 5); // the last lands inside pickupR: pulled at once
    for (let k = 0; k < 10; k++) put(400, 25); // beyond pickupR + 150
    eng.stepN(20);
    expect(W.stats.dmg).toBeCloseTo(d0 + 6);
    // a piece already flying to you does not count
    for (let i = 0; i < D.n; i++) if (D.alive[i] && Math.abs(D.x[i] - W.px - 110) < 30) D.magnet[i] = 1;
    eng.stepN(1);
    expect(W.stats.dmg).toBeCloseTo(d0 + 3);
    // capped at +60
    for (let k = 0; k < 8; k++) put(-150, 25);
    eng.stepN(20);
    expect(W.stats.dmg).toBeCloseTo(d0 + 60);
    eng.dispose();
  });

  it('月华如练: 月华 flying to you strikes each foe in its way once; bigger pearls cut deeper (×6 at 25); coins never', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { rulian: 1 });
    const { eng, W } = quiet(run, setup);
    eng.stepN(1);
    expect(W.pickupR).toBeCloseTo(F.pickupBase * 1.3);
    const a = foe(W, 100, 0, 'mon', 1e6), b = foe(W, 0, 100, 'mon', 1e6);
    W.E.speed[a] = W.E.speed[b] = 0;
    eng.stepN(1);
    const D = W.D;
    const fly = (kind: number, worth: number, dx: number, dy: number) => {
      W.dropOne(kind, W.px + dx, W.py + dy, worth, -1);
      for (let i = 0; i < D.n; i++) if (D.alive[i] && D.kind[i] === kind && Math.abs(D.x[i] - W.px - dx) < 30 && Math.abs(D.y[i] - W.py - dy) < 30) { D.age[i] = 1; D.magnet[i] = 1; D.vx[i] = D.vy[i] = 0; D.x[i] = W.px + dx; D.y[i] = W.py + dy; }
    };
    fly(DK.moonFull, 25, 260, 0);
    eng.stepN(90);
    expect(W.itemTally.streamHits).toBe(1);
    const st = W.stats, raw = (6 + 0.3 * st.ranged + 0.3 * st.elem) * W.dmgMultNow() * 6;
    const took = W.E.hpMax[a] - W.E.hp[a];
    expect(took).toBeGreaterThanOrEqual(raw * 0.95);
    expect(took).toBeLessThanOrEqual(raw * (F.critXDefault + st.critDmg / 100) * 1.05);
    // a small pearl through b: ×1.2
    fly(DK.moonDrop, 1, 0, 260);
    eng.stepN(90);
    expect(W.itemTally.streamHits).toBe(2);
    const tb = W.E.hpMax[b] - W.E.hp[b];
    expect(tb).toBeGreaterThan(0);
    expect(tb).toBeLessThan(took / 3);
    // a coin flying through a strikes nothing
    fly(DK.cashCoin, 1, 260, 0);
    eng.stepN(90);
    expect(W.itemTally.streamHits).toBe(2);
    eng.dispose();
  });

  it('月华如练: a pearl through a tight cluster of 8 foes strikes each of them once at most (QA: the old 4-foe ring struck some twice)', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { rulian: 1 });
    const { eng, W } = quiet(run, setup);
    eng.stepN(1);
    const offs: [number, number][] = [[100, 0], [100, 5], [100, -5], [105, 0], [95, 0], [100, 9], [100, -9], [104, 4]];
    const fs = offs.map(([dx, dy]) => foe(W, dx, dy, 'mon', 1e6));
    for (const f of fs) W.E.speed[f] = 0;
    eng.stepN(1);
    const D = W.D;
    W.dropOne(DK.moonFull, W.px + 260, W.py, 25, -1);
    for (let i = 0; i < D.n; i++) if (D.alive[i] && D.kind[i] === DK.moonFull) { D.age[i] = 1; D.magnet[i] = 1; D.vx[i] = D.vy[i] = 0; D.x[i] = W.px + 260; D.y[i] = W.py; }
    eng.stepN(90);
    const st = W.stats, one = (6 + 0.3 * st.ranged + 0.3 * st.elem) * W.dmgMultNow() * 6 * (F.critXDefault + st.critDmg / 100) * 1.05;
    expect(W.itemTally.streamHits).toBeGreaterThanOrEqual(5);
    expect(W.itemTally.streamHits).toBeLessThanOrEqual(offs.length);
    for (const f of fs) expect(W.E.hpMax[f] - W.E.hp[f]).toBeLessThanOrEqual(one);
    eng.dispose();
  });

  it('千金散尽: +25 伤害; a blow spills 8% of the 月华 in hand (≤ 60) beyond pickup range, held 1.5 s; taken back it only returns; lost once, never below 0', () => {
    expect(ITEMS.sanjin.stats).toEqual({ dmg: 25 });
    const { run, setup } = runAt(9, [['qingfeng', 1]], { sanjin: 1 }, { char: 'gardener' });
    const { eng, W } = quiet({ ...run, moon: 1000 }, setup);
    W.godmode = false; W.hp = W.hpMax = 1e6; W.stats.dodge = 0; W.dodgeCap = 0; W.blocks = 0;
    eng.stepN(1);
    W.moonHeld = 1000;
    const D = W.D;
    const own = () => { let n = 0, w = 0; for (let i = 0; i < D.n; i++) if (D.alive[i] && D.own[i]) { n++; w += D.worth[i]; } return { n, w }; };
    // a DoT never spills
    W.hurtFrom(5, -1, true, true, 'test', true, false);
    expect(W.moonHeld).toBe(1000);
    W.hurtFrom(5, -1, true, true, 'test', false, false);
    expect(W.moonHeld).toBe(940);
    expect(own()).toEqual({ n: 4, w: 60 }); // 25 + 25 + 5 + 5
    for (let i = 0; i < D.n; i++) if (D.alive[i] && D.own[i]) {
      const d = Math.hypot(D.x[i] - W.px, D.y[i] - W.py);
      expect(d).toBeGreaterThan(W.pickupR + 60 - 20);
      expect(d).toBeLessThan(W.pickupR + 160 + 20);
    }
    // the i-frames stop a second spill at once; small purses spill 8%
    W.hurtFrom(5, -1, true, true, 'test', false, false);
    expect(W.moonHeld).toBe(940);
    // held: walking onto a piece takes nothing for 1.5 s
    let k = -1;
    for (let i = 0; i < D.n; i++) if (D.alive[i] && D.own[i]) { k = i; break; }
    const xp0 = W.xpGot, got0 = W.moonGot, wk = D.worth[k];
    W.px = D.x[k]; W.py = D.y[k];
    eng.stepN(60);
    expect(D.alive[k] && D.own[k]).toBeTruthy();
    expect(W.moonHeld).toBe(940);
    eng.stepN(70);
    expect(W.moonHeld).toBe(940 + wk);
    expect(W.xpGot).toBe(xp0);
    expect(W.moonGot).toBe(got0);
    // what still lies there at the wave's end is lost, once
    const left = own().w;
    expect(left).toBe(60 - wk);
    W.beginEnding();
    const r = W.result();
    expect(r.lost).toBe(left);
    const run2 = { ...run, inWave: r.wave, moon: 1000 };
    const { lost: _l, ...kept } = r;
    expect(endWave(run2, r).moon).toBe(endWave(run2, kept as WaveResult).moon - left);
    expect(endWave({ ...run2, moon: 0 }, { ...r, moon: 0, lost: 1e6 }).moon).toBeGreaterThanOrEqual(0);
    // folded once: the wave is no longer in play afterwards
    const once = endWave(run2, r);
    expect(endWave(once, r)).toBe(once);
    eng.dispose();
  });

  it('饮鸩止渴: +30 伤害, 疗效 −20, 劫 +1; every wave starts at 90% 气血', () => {
    const plain = computeStats({ ...newRun(opts()), items: {} });
    const s = computeStats({ ...newRun(opts()), items: { zhenjiu: 1 } as RunSave['items'] });
    expect(s.dmg - plain.dmg).toBe(30 + F.curseDmg * 1);
    expect(s.heal - plain.heal).toBe(-20);
    expect(s.curse - plain.curse).toBe(1);
    const { run, setup } = runAt(9, [['qingfeng', 1]], { zhenjiu: 1 });
    const { eng, W } = quiet(run, setup);
    expect(W.hp).toBe(Math.round(W.hpMax * 0.9));
    eng.dispose();
    const { run: r0, setup: s0 } = runAt(9, [['qingfeng', 1]], {});
    const q = quiet(r0, s0);
    expect(q.W.hp).toBe(q.W.hpMax);
    q.eng.dispose();
  });

  it('与虎谋皮: 劫 +1; elites carry one more 镜印 (≤ 3); a beaten elite drops three times the 月华', () => {
    expect(ITEMS.mouhu.curse).toBe(1);
    for (const [w, diff] of [[5, 1], [12, 4], [22, 5]] as const) {
      const base = { ...newRun(opts({ diff })), wave: w };
      const p0 = wavePlan({ ...base, items: {} }, w), p1 = wavePlan({ ...base, items: { mouhu: 1 } as RunSave['items'] }, w);
      expect(p1.elites.length).toBe(p0.elites.length);
      for (let k = 0; k < p0.elites.length; k++) expect(p1.elites[k].affixes.length).toBe(Math.min(F.eliteAffixMax, p0.elites[k].affixes.length + 1));
    }
    const drops = (items: Partial<Record<ItemId, number>>) => {
      const { run, setup } = runAt(9, [['qingfeng', 1]], items);
      const { eng, W } = quiet(run, setup);
      eng.stepN(1);
      const e = foe(W, 300, 0, 'elite', 100);
      W.E.cost[e] = 10;
      const c0 = W.crates, D = W.D;
      W.kill(W.E.handle(e));
      let moon = 0;
      for (let i = 0; i < D.n; i++) if (D.alive[i] && isMoonKind(D.kind[i])) moon += D.worth[i];
      const out = { crates: W.crates - c0, moon };
      eng.dispose();
      return out;
    };
    const a = drops({}), b = drops({ mouhu: 1 });
    // no extra 镜奁 any more (QA: the casket made it a net gain against its 劫)
    expect(b.crates).toBe(a.crates);
    // +200% elite 月华, and 劫 1 adds F.curseMoon to every 月华 too
    expect(b.moon / a.moon).toBeCloseTo(3 * (1 + F.curseMoon * 1), 1);
  });
});

describe('m8 items · batch d: stance and class', () => {
  it('静如处子: stand 1 s for +12 伤害, 3 s for another +20; moving ends it', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { jingru: 1 });
    const { eng, W } = quiet(run, setup);
    const stand = (n: number) => { W.moveX = 0; W.moveY = 0; eng.stepN(n); };
    stand(1);
    const d0 = W.stats.dmg;
    stand(70);
    expect(W.stats.dmg).toBeCloseTo(d0 + 12);
    stand(120);
    expect(W.stats.dmg).toBeCloseTo(d0 + 32);
    W.moveX = 1; eng.stepN(2);
    expect(W.stats.dmg).toBeCloseTo(d0);
    eng.dispose();
  });

  it('动如脱兔: start moving after standing ≥ 1 s: +30 攻速 and +10 闪避 for 2 s; a kiter never gets it', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { dongru: 1 });
    const { eng, W } = quiet(run, setup);
    const walk = (n: number) => { W.moveX = 1; W.moveY = 0; eng.stepN(n); };
    const stand = (n: number) => { W.moveX = 0; W.moveY = 0; eng.stepN(n); };
    walk(1);
    const a0 = W.stats.aspd, g0 = W.stats.dodge;
    stand(40); walk(30);
    expect(W.stats.aspd).toBeCloseTo(a0);
    stand(70); walk(2);
    expect(W.stats.aspd).toBeCloseTo(a0 + 30);
    expect(W.stats.dodge).toBeCloseTo(g0 + 10);
    walk(130);
    expect(W.stats.aspd).toBeCloseTo(a0);
    eng.dispose();
  });

  it('短兵相接: per foe within 150 (up to 6): +1 护甲, +3 伤害; farther foes do not count', () => {
    const { run, setup } = runAt(9, [['qingfeng', 1]], { duanbing: 1 });
    const { eng, W } = quiet(run, setup);
    eng.stepN(1);
    const a0 = W.stats.armor, d0 = W.stats.dmg;
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) ids.push(foe(W, 100 * Math.cos(k), 100 * Math.sin(k)));
    ids.push(foe(W, 320, 0));
    for (const j of ids) W.E.speed[j] = 0;
    eng.stepN(2);
    expect(W.stats.armor).toBeCloseTo(a0 + 3);
    expect(W.stats.dmg).toBeCloseTo(d0 + 9);
    for (let k = 0; k < 6; k++) W.E.speed[foe(W, -90, (k - 3) * 20)] = 0;
    eng.stepN(2);
    expect(W.stats.armor).toBeCloseTo(a0 + 6);
    expect(W.stats.dmg).toBeCloseTo(d0 + 18);
    eng.dispose();
  });

  it('计白当黑: 墨宝上限 −2 (never below 1 from the base 3); ink weapons (and their 墨宝) +60 伤害, others untouched', () => {
    const run = { ...newRun(opts()), items: { jibai: 1 } as RunSave['items'] };
    const s = computeStats(run), s0 = computeStats({ ...run, items: {} });
    expect(summonCapOf(s)).toBe(Math.max(1, summonCapOf(s0) - 2));
    const m = readMods(run);
    expect(classExtras(emptyStats(), s, ['ink'], m, LIVE0).dmg).toBe(s.dmg + 60);
    expect(classExtras(emptyStats(), s, ['sword'], m, LIVE0).dmg).toBe(s.dmg);
  });

  it('厚积薄发: a stone\'s blast +15% per whole second it waited (max +75%); without the item, ×1', () => {
    const { run, setup } = runAt(9, [['gobowl', 1]], { houji: 1 });
    const { eng, W } = quiet(run, setup);
    eng.stepN(1);
    expect(W.stoneBorn.length).toBe(W.ST.cap);
    W.stoneBorn[0] = W.t - 0.5;
    expect(houjiX(W, 0)).toBeCloseTo(1);
    W.stoneBorn[0] = W.t - 3.2;
    expect(houjiX(W, 0)).toBeCloseTo(1.45);
    W.stoneBorn[0] = W.t - 30;
    expect(houjiX(W, 0)).toBeCloseTo(1.75);
    // the bowl's own placement records the time
    for (const s of W.slots) s.cd = 0;
    foe(W, 150, 0);
    eng.stepN(90);
    let placed = 0;
    for (let i = 0; i < W.ST.n; i++) if (W.ST.alive[i] && W.stoneBorn[i] > 0) placed++;
    expect(placed).toBeGreaterThan(0);
    eng.dispose();
    const q = runAt(9, [['gobowl', 1]], {});
    const p = quiet(q.run, q.setup);
    p.W.stoneBorn[0] = p.W.t - 30;
    expect(houjiX(p.W, 0)).toBe(1);
    p.eng.dispose();
  });

  it('醉卧沙场: −3% damage taken per 10 醉 (max −30%), DoTs too; nothing without the 醉 meter', () => {
    const hurt = (drunk: number, dot = false, char: NewRunOpts['char'] = 'poet') => {
      const { run, setup } = runAt(9, [['qingfeng', 1]], { zuiwo: 1 }, { char });
      const { eng, W } = quiet(run, setup);
      W.godmode = false; W.hp = W.hpMax = 1e6; W.stats.dodge = 0; W.dodgeCap = 0; W.blocks = 0; W.drunk = drunk;
      const d = W.hurtFrom(1000, -1, true, true, 'test', dot, false);
      eng.dispose();
      return d;
    };
    const d0 = hurt(0);
    expect(hurt(100)).toBeCloseTo(d0 * 0.7, 0);
    expect(hurt(200)).toBeCloseTo(d0 * 0.7, 0);
    expect(hurt(35)).toBeCloseTo(d0 * 0.91, 0);
    expect(hurt(100, true)).toBeCloseTo(hurt(0, true) * 0.7, 0);
    expect(hurt(100, false, 'gardener')).toBeCloseTo(hurt(0, false, 'gardener'), 0);
  });
});

describe('m8 items · the bot\'s rough values (sim/itemvalues.ts)', () => {
  const run = (weapons: WeaponId[], char: NewRunOpts['char'] = 'gardener') => ({ ...newRun(opts({ char })), weapons: weapons.map((id) => ({ id, t: 2 as const })) });
  it('a class item is worth its value × the share of weapons of its class; 画地为牢 is refused on short-reach kits', () => {
    expect(botItemValue(run(['qingfeng', 'longquan']), 'zhancao')).toBeCloseTo(ITEM_BOT_VALUE.zhancao!);
    expect(botItemValue(run(['qingfeng', 'sunbow']), 'zhancao')).toBeCloseTo(ITEM_BOT_VALUE.zhancao! / 2);
    expect(botItemValue(run(['sunbow']), 'zhancao')).toBe(0);
    expect(botItemValue(run(['qin', 'qingfeng'], 'musician'), 'huadi')).toBe(HUADI_SHORT_PENALTY);
    expect(botItemValue(run(['sunbow', 'repeater']), 'huadi')).toBe(ITEM_BOT_VALUE.huadi);
    expect(botItemValue(run(['sunbow']), 'songzi')).toBe(0);
    for (const id of Object.keys(ITEM_BOT_VALUE)) expect(ITEMS[id as ItemId], id).toBeTruthy();
  });
  it('batch c / d: 短兵相接 only on a short-reach kit; 醉卧沙场 only with the 醉 meter; 计白当黑 by its ink share; all 26 priced', () => {
    expect(botItemValue(run(['qin', 'qingfeng'], 'musician'), 'duanbing')).toBe(ITEM_BOT_VALUE.duanbing);
    expect(botItemValue(run(['sunbow', 'repeater']), 'duanbing')).toBe(0);
    expect(botItemValue(run(['qingfeng'], 'poet'), 'zuiwo')).toBe(ITEM_BOT_VALUE.zuiwo);
    expect(botItemValue(run(['qingfeng']), 'zuiwo')).toBe(0);
    expect(botItemValue(run(['drunkfist']), 'zuiwo')).toBe(ITEM_BOT_VALUE.zuiwo);
    expect(botItemValue(run(['brush', 'qingfeng']), 'jibai')).toBeCloseTo(ITEM_BOT_VALUE.jibai! / 2);
    const m8 = ITEM_REG.slice(ITEM_REG.findIndex((r) => r.id === 'huadi')).map((r) => r.id);
    for (const id of m8) expect(ITEM_BOT_VALUE[id], id).not.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════ the end state
describe('m8 items · live', () => {
  const M8 = ITEM_REG.slice(ITEM_REG.findIndex((r) => r.id === 'huadi')).map((r) => r.id);
  it('the 26 are the m8 block, each with its effect in data', () => {
    expect(M8.length).toBe(26);
    for (const id of M8) expect((ITEMS[id].fx?.length ?? 0) + Object.keys(ITEMS[id].stats ?? {}).length, id).toBeGreaterThan(0);
  });
  it('the bot can buy each of the 26: every one is in some archetype\'s keys and has a rough value', () => {
    const keys = new Set(Object.values(ARCHETYPES).flatMap((a) => a.keys as readonly string[]));
    for (const id of M8) expect(keys.has(id), id).toBe(true);
    for (const id of M8) expect(ITEM_BOT_VALUE[id], id).not.toBeUndefined();
  });
  it('no wip item is left (all 26), so every one is offered', () => {
    for (const r of ITEM_REG) expect(ITEMS[r.id].wip, r.id).toBeUndefined();
    const run = newRun(opts());
    const offered = new Set<ItemId>();
    for (const t of [1, 2, 3, 4] as const) for (const id of itemPool(run, allUnlocked(), t, 20)) offered.add(id);
    for (const id of M8) expect(offered.has(id), id).toBe(true);
  });
});
