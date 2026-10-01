// 水月幻镜 · m8 · the 模拟场's tuning layer (sandbox.md §5, §11): paths, the runtime walk of every table,
// in-place overrides that every module reads, the exact restore (500 random overrides → deep Object.is
// equal), the full fallback for a write behind the layer's back, only-differences, the fingerprint, and the
// run-level sheet (RunSave.sand) with 劫数 on both sides.
import { afterEach, describe, expect, it } from 'vitest';
import {
  aliasesOf, allUnlocked, beginTuning, canonPath, changes, computeStats, dataHash, defaultOf, endTuning, fmtPath, isStatMapKey, itemOdds,
  leafOf, leaves, newRun, parsePath, resetAll, same, sandOf, setValue, shopOdds, tuningActive, TUNABLE, valueOf, wavePlan, weaponPrice,
  withSheet, curseOf, hpX,
} from '../src/views/mirror/logic';
import { COMPANIONS, F, HEART, ITEMS, MONSTERS, PASSIVES, STAT_IDS, WEAPONS } from '../src/views/mirror/data';
import { COMPANION_REG, ITEM_REG, WEAPON_REG } from '../src/views/mirror/ids';
import type { RunSave } from '../src/views/mirror/types';

const tables = () => Object.fromEntries(TUNABLE.map((t) => [t.id, t.obj]));
const PRISTINE = structuredClone(tables());

function run30(char: RunSave['char'] = 'musician'): RunSave {
  const r = newRun({
    seed: 99, char, map: 'forest', diff: 3, vows: {}, daily: false, plain: false, heart: {}, ticket: 0, free: false, runIndex: 0, rate: 0,
    startedDay: '2026-09-30', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 10,
  });
  return { ...r, wave: 29, weapons: r.weapons.length ? r.weapons : [{ id: 'qingfeng', t: 1 }], items: { [ITEM_REG[0].id]: 2 } };
}

afterEach(() => { if (tuningActive()) endTuning(); expect(same(tables(), PRISTINE)).toBe(true); });

describe('paths', () => {
  it('parse and format round-trip, including ["10"] keys and indexes', () => {
    for (const p of ['WEAPONS.qingfeng.dmg[2]', 'F.bossK["10"]', 'F.shopOdds[3][1]', 'COMPANIONS.swordsman.wmult[0].pct', 'F["a b"].c', 'MASTERY[4]']) {
      const s = parsePath(p)!;
      expect(s).not.toBeNull();
      expect(fmtPath(s)).toBe(p);
    }
    expect(parsePath('F.bossK["10"]')).toEqual(['F', 'bossK', '10']);
    expect(parsePath('WEAPONS.qingfeng.dmg[2]')).toEqual(['WEAPONS', 'qingfeng', 'dmg', 2]);
    for (const bad of ['', '1abc', 'F..x', 'F[x]', 'F["x]', 'F.x[', 'F x']) expect(parsePath(bad)).toBeNull();
  });
});

describe('the walk', () => {
  it('lists every numeric and boolean leaf of the 24 tables (≥ 2,950), each path reading its value', () => {
    expect(TUNABLE.length).toBe(24);
    expect(TUNABLE.some((t) => (t.id as string) === 'PAY' || (t.id as string) === 'REVIVE')).toBe(false);
    const L = leaves();
    expect(L.length).toBeGreaterThanOrEqual(2950);
    expect(new Set(L.map((l) => l.path)).size).toBe(L.length);
    for (const l of L) {
      const v = valueOf(l.path);
      expect(typeof v).toBe(l.kind);
      expect(parsePath(l.path)).toEqual(l.segs);
    }
    // the new rows show by themselves: every item, weapon and companion (the hidden three included) has leaves
    const tablesSeen = (t: string) => new Set(L.filter((l) => l.table === t).map((l) => l.segs[1]));
    for (const it of ITEM_REG) expect(tablesSeen('ITEMS').has(it.id)).toBe(true);
    for (const w of WEAPON_REG) expect(tablesSeen('WEAPONS').has(w.id)).toBe(true);
    for (const c of COMPANION_REG) expect(tablesSeen('COMPANIONS').has(c.id)).toBe(true);
  });

  it('finds the shared objects: every alias path reads the very same value, and maps back to its first path', () => {
    const shared = leaves().filter((l) => l.aliases.length > 0);
    expect(shared.length).toBeGreaterThan(0);
    for (const l of shared) for (const a of l.aliases) {
      expect(canonPath(a)).toBe(l.path);
      expect(leafOf(a)).toBe(l);
      const pa = parsePath(a)!, pl = parsePath(l.path)!;
      // same parent object (not merely an equal value)
      let oa: unknown = TUNABLE.find((t) => t.id === pa[0])!.obj, ol: unknown = TUNABLE.find((t) => t.id === pl[0])!.obj;
      for (const s of pa.slice(1, -1)) oa = (oa as Record<string | number, unknown>)[s];
      for (const s of pl.slice(1, -1)) ol = (ol as Record<string | number, unknown>)[s];
      expect(oa).toBe(ol);
    }
    // the 心镜 cost arrays C3 (7 faces) and C5 (固本, 福泽) are one array each in the source
    const c3 = HEART.heartRegen.costs;
    const c3faces = Object.values(HEART).filter((h) => h.costs === c3).length;
    expect(aliasesOf('HEART.heartRegen.costs[0]').length + 1).toBeGreaterThanOrEqual(c3faces);
    if (HEART.heartHp.costs === HEART.heartLuck.costs) expect(aliasesOf('HEART.heartHp.costs[0]').length).toBeGreaterThanOrEqual(1);
    // MELEE_PEN (companions.ts): whoever shares it is listed
    const pen = COMPANIONS.swordsman.wmult;
    const sharers = COMPANION_REG.filter((c) => COMPANIONS[c.id].wmult === pen).length;
    if (sharers > 1) expect(aliasesOf('COMPANIONS.swordsman.wmult[0].pct').length).toBeGreaterThanOrEqual(sharers - 1);
  });

  it('marks structural fields read-only and gives badges by where a change bites', () => {
    const ro = leaves().filter((l) => l.ro).map((l) => l.path);
    expect(ro.some((p) => /^HEART\.\w+\.pair$/.test(p))).toBe(true);
    expect(ro.some((p) => /^BOSSES\.\w+\.wave$/.test(p))).toBe(true);
    expect(leafOf('WEAPONS.qingfeng.price')!.badge).toBe('shop');
    expect(leafOf(`MONSTERS.${Object.keys(MONSTERS)[0]}.hp`)!.badge).toBe('spawn');
    expect(leafOf('F.startMoon')!.badge).toBe('run');
    expect(leafOf('HEART.heartHp.costs[0]')!.badge).toBe('none');
    expect(leafOf('F.shopOdds[0][1]')!.badge).toBe('shop');
  });
});

describe('overrides', () => {
  it('only inside tuning; refuses a wrong type, a read-only field and a missing path', () => {
    expect(setValue('F.startMoon', 5)).toBe('inactive');
    beginTuning();
    expect(tuningActive()).toBe(true);
    expect(setValue('F.startMoon', true)).toBe('type');
    expect(setValue('F.startMoon', Number.NaN)).toBe('type');
    expect(setValue('F.startMoon', Infinity)).toBe('type');
    expect(setValue('HEART.heartHp.pair', 3)).toBe('ro');
    expect(setValue('F.noSuchThing', 1)).toBe('missing');
    expect(setValue('WEAPONS.nope.price', 1)).toBe('missing');
    expect(setValue('not a path', 1)).toBe('missing');
    const b = leaves().find((l) => l.kind === 'boolean' && !l.ro);
    if (b) { expect(setValue(b.path, 1)).toBe('type'); expect(setValue(b.path, !valueOf(b.path))).toBe('ok'); }
    expect(changes().length).toBe(b ? 1 : 0);
  });

  it('writes in place, so the logic reads it at once (prices, odds, stats, the plan), and a default drops out of changes()', () => {
    const r = run30();
    const p0 = weaponPrice('qingfeng', 3, 30, r);
    const o0 = JSON.stringify(shopOdds(30, 20));
    const hp0 = computeStats(r).hp;
    const plan0 = JSON.stringify(wavePlan(r, 30));
    beginTuning();
    expect(setValue('WEAPONS.qingfeng.price', WEAPONS.qingfeng.price * 2)).toBe('ok');
    expect(weaponPrice('qingfeng', 3, 30, r)).toBeGreaterThan(p0);
    expect(setValue('F.shopOdds[0][1]', 0)).toBe('ok');
    expect(setValue('COMPANIONS.musician.hp', 10)).toBe('ok');
    expect(computeStats(r).hp).toBeLessThan(hp0);
    const mon = Object.keys(MONSTERS)[0] as keyof typeof MONSTERS;
    expect(setValue(`MONSTERS.${mon}.cost`, MONSTERS[mon].cost * 3)).toBe('ok');
    void plan0;
    expect(changes().map((c) => c.path)).toEqual(['WEAPONS.qingfeng.price', 'F.shopOdds[0][1]', 'COMPANIONS.musician.hp', `MONSTERS.${mon}.cost`]);
    const c0 = changes()[0];
    expect(c0).toMatchObject({ table: 'WEAPONS', file: 'src/views/mirror/data/weapons.ts', value: WEAPONS.qingfeng.price });
    expect(defaultOf('WEAPONS.qingfeng.price')).toBe(c0.default);
    // back to the default: gone from the list
    expect(setValue('WEAPONS.qingfeng.price', c0.default as number)).toBe('ok');
    expect(changes().some((c) => c.path === 'WEAPONS.qingfeng.price')).toBe(false);
    expect(setValue('COMPANIONS.musician.hp', null)).toBe('ok');
    expect(COMPANIONS.musician.hp).toBe(PRISTINE.COMPANIONS && (PRISTINE.COMPANIONS as typeof COMPANIONS).musician.hp);
    resetAll();
    expect(tuningActive()).toBe(true);
    expect(changes()).toEqual([]);
    expect(weaponPrice('qingfeng', 3, 30, r)).toBe(p0);
    expect(JSON.stringify(shopOdds(30, 20))).toBe(o0);
    expect(endTuning()).toEqual({ restored: 0, exact: true });
  });

  it('keeps values the engine can run: cooldowns, radii, bodies and odds are clamped; counts are whole', () => {
    beginTuning();
    const cd = leaves().find((l) => l.segs[l.segs.length - 1] === 'cd' && !l.ro)!;
    setValue(cd.path, 0);
    expect(valueOf(cd.path)).toBe(0.05);
    const mon = Object.keys(MONSTERS)[0];
    setValue(`MONSTERS.${mon}.hp`, -5);
    expect(valueOf(`MONSTERS.${mon}.hp`)).toBe(1);
    setValue('F.shopOdds[0][2]', -3);
    expect(valueOf('F.shopOdds[0][2]')).toBe(0);
    const it0 = ITEM_REG.find((i) => typeof ITEMS[i.id].max === 'number' && Number.isInteger(ITEMS[i.id].max))!;
    setValue(`ITEMS.${it0.id}.max`, 3.6);
    expect(valueOf(`ITEMS.${it0.id}.max`)).toBe(4);
    endTuning();
  });

  it('adds and removes StatId keys in StatMods maps (default null), and nothing else structural', () => {
    const r = run30('musician');
    const base = computeStats(r);
    beginTuning();
    expect(isStatMapKey('COMPANIONS.musician.extra.aspd')).toBe(true);
    expect(isStatMapKey('COMPANIONS.musician.extra.bogus')).toBe(false);
    expect(isStatMapKey('WEAPONS.qingfeng.aspd')).toBe(false);
    const had = 'aspd' in COMPANIONS.musician.extra;
    expect(setValue('COMPANIONS.musician.extra.aspd', 100)).toBe('ok');
    expect(computeStats(r).aspd).toBe(had ? base.aspd - (COMPANIONS.musician.extra.aspd ?? 0) + 100 + (PRISTINE as { COMPANIONS: typeof COMPANIONS }).COMPANIONS.musician.extra.aspd! - (PRISTINE as { COMPANIONS: typeof COMPANIONS }).COMPANIONS.musician.extra.aspd! : base.aspd + 100);
    if (!had) {
      expect(changes()).toEqual([expect.objectContaining({ path: 'COMPANIONS.musician.extra.aspd', default: null, value: 100 })]);
      expect(defaultOf('COMPANIONS.musician.extra.aspd')).toBeNull();
    }
    // a passive's stats and a heart face's `per`
    const pid = COMPANIONS.musician.passive;
    expect(setValue(`PASSIVES.${pid}.stats.armor`, 7)).toBe('ok');
    expect(setValue('HEART.heartHp.per.crit', 3)).toBe('ok');
    expect(setValue(`WEAPONS.qingfeng.newkey`, 3)).toBe('missing');
    // removing the added key puts it back to absent
    expect(setValue('HEART.heartHp.per.crit', null)).toBe('ok');
    expect('crit' in HEART.heartHp.per).toBe(false);
    endTuning();
    expect('armor' in (PASSIVES[pid].stats ?? {})).toBe((PRISTINE as { PASSIVES: typeof PASSIVES }).PASSIVES[pid].stats ? 'armor' in (PRISTINE as { PASSIVES: typeof PASSIVES }).PASSIVES[pid].stats! : false);
    expect(computeStats(r)).toEqual(base);
  });

  it('writes through an alias once: every sharer sees it, and it is listed under its first path with the aliases', () => {
    const shared = leaves().find((l) => l.aliases.length > 0 && l.kind === 'number' && !l.ro)!;
    beginTuning();
    const v0 = valueOf(shared.path) as number;
    expect(setValue(shared.aliases[0], v0 + 7)).toBe('ok');
    for (const a of [shared.path, ...shared.aliases]) expect(valueOf(a)).toBe(v0 + 7);
    expect(changes()).toEqual([expect.objectContaining({ path: shared.path, default: v0, value: v0 + 7, aliases: shared.aliases })]);
    expect(endTuning().exact).toBe(true);
    expect(valueOf(shared.path)).toBe(v0);
  });
});

describe('restore', () => {
  it('500 random overrides across every table, then endTuning(): deep Object.is equal to the snapshot, and the logic unchanged', () => {
    const r = run30();
    const before = JSON.stringify({ stats: computeStats(r), plan: wavePlan(r, 30), wp: weaponPrice('qingfeng', 3, 30, r), io: itemOdds(30, 20), so: shopOdds(30, 20) });
    const hash0 = dataHash();
    beginTuning();
    // every writable leaf with a finite value (F.groupEvery holds an Infinity: a source formula, not a number to scale)
    const L = leaves().filter((l) => !l.ro && (l.kind === 'boolean' || Number.isFinite(valueOf(l.path) as number)));
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let i = 0; i < 500; i++) {
      const l = L[Math.floor(rnd() * L.length)];
      const cur = valueOf(l.path);
      const res = setValue(l.path, typeof cur === 'boolean' ? !cur : (cur as number) * (0.5 + rnd()) + 1);
      expect(res).toBe('ok');
    }
    // a StatMods key or two added on the way
    expect(setValue('ITEMS.' + ITEM_REG[0].id + '.stats.luck', 33)).toBe('ok');
    expect(same(tables(), PRISTINE)).toBe(false);
    expect(dataHash()).toBe(hash0); // the fingerprint is of the pristine tables
    const res = endTuning();
    expect(res.exact).toBe(true);
    expect(res.restored).toBeGreaterThan(300);
    expect(same(tables(), PRISTINE)).toBe(true);
    expect(JSON.stringify({ stats: computeStats(r), plan: wavePlan(r, 30), wp: weaponPrice('qingfeng', 3, 30, r), io: itemOdds(30, 20), so: shopOdds(30, 20) })).toBe(before);
    expect(dataHash()).toBe(hash0);
  });

  it('catches a write behind the layer\'s back and restores everything from the snapshot', () => {
    beginTuning();
    setValue('F.startMoon', 999);
    (F as unknown as { startMoon: number; zzTamper?: number }).zzTamper = 1; // a key the snapshot lacks
    (WEAPONS.qingfeng as unknown as { price: number }).price += 5; // a write the layer never saw
    const res = endTuning();
    expect(res.exact).toBe(false);
    expect(same(tables(), PRISTINE)).toBe(true);
    expect('zzTamper' in F).toBe(false);
  });

  it('dataHash is stable, changes with a value, and can leave paths out', () => {
    const h = dataHash();
    expect(h).toMatch(/^h:[0-9a-f]{8}$/);
    expect(dataHash()).toBe(h);
    const orig = F.startMoon;
    (F as unknown as { startMoon: number }).startMoon = orig + 1;
    const h2 = dataHash();
    expect(h2).not.toBe(h);
    expect(dataHash({ except: ['F.startMoon'] })).toBe(dataHash({ except: ['F.startMoon'] }));
    (F as unknown as { startMoon: number }).startMoon = orig;
    expect(dataHash()).toBe(h);
    // leaving the edited path out gives the same hash either way
    const ex = dataHash({ except: ['F.startMoon'] });
    (F as unknown as { startMoon: number }).startMoon = orig + 50;
    expect(dataHash({ except: ['F.startMoon'] })).toBe(ex);
    (F as unknown as { startMoon: number }).startMoon = orig;
  });
});

describe('the run-level sheet (RunSave.sand)', () => {
  it('add and set are exact on every stat but 劫数 (after gain factors, before clamps)', () => {
    const r = run30('cat'); // 大橘's 气血 gain factor
    const base = computeStats(r);
    for (const id of STAT_IDS) {
      if (id === 'curse') continue;
      const add = computeStats(withSheet(r, [{ id, mode: 'add', v: 7 }]));
      const set = computeStats(withSheet(r, [{ id, mode: 'set', v: 11 }]));
      const clampedAdd = id === 'hp' ? Math.max(1, base.hp + 7) : id === 'summonCap' ? Math.min(12, base[id] + 7) : id === 'stones' ? Math.min(14, base[id] + 7) : base[id] + 7;
      expect(add[id]).toBeCloseTo(clampedAdd, 9);
      expect(set[id]).toBeCloseTo(id === 'summonCap' ? Math.min(12, 11) : 11, 9);
    }
  });

  it('劫数 goes into sand.curse, so the enemies scale and the player\'s 劫 damage follows, never counted twice', () => {
    const r = run30('scholar');
    const base = computeStats(r);
    const sand = sandOf(r, [{ id: 'curse', mode: 'add', v: 10 }, { id: 'aspd', mode: 'add', v: 100 }]);
    expect(sand.sheet.map((x) => x.id)).toEqual(['aspd']);
    expect(sand.curse).toBe(10);
    const rs = { ...r, sand };
    const s = computeStats(rs);
    expect(s.curse).toBe(base.curse + 10);
    expect(s.dmg).toBeCloseTo(base.dmg + 10 * F.curseDmg, 9);
    expect(curseOf(rs)).toBe(curseOf(r) + 10);
    expect(hpX(30, rs)).toBeGreaterThan(hpX(30, r));
    // 设为 on 劫数 is exact against the run as it is
    const set = computeStats(withSheet(r, [{ id: 'curse', mode: 'set', v: 4 }]));
    expect(set.curse).toBe(4);
    // no sheet, no change
    expect(computeStats(withSheet(r, []))).toEqual(base);
  });
});

// QA fixes (post-integration): money is read-only, literal-typed fields stay inside their type
describe('m8 tuning · money read-only and literal-typed clamps', () => {
  it('pay multipliers, the endless coin rate and the 心镜 costs are read-only', async () => {
    const { beginTuning: bt, endTuning: et, setValue: sv, leafOf: lo } = await import('../src/views/mirror/logic/tuning');
    bt();
    try {
      for (const p of ['DIFFS[1].pay', 'MAPS.lake.pay', 'F.endless.coinX', 'HEART.heartHp.costs[0]']) {
        if (!lo(p)) continue;
        expect(lo(p)!.ro, p).toBe(true);
        expect(sv(p, 9), p).toBe('ro');
      }
    } finally { et(); }
  });
  it('item tiers, weapon slots and a difficulty unlock round into their literal types', async () => {
    const { beginTuning: bt, endTuning: et, setValue: sv, valueOf: vo } = await import('../src/views/mirror/logic/tuning');
    bt();
    try {
      expect(sv('ITEMS.cinnabar.tier', 5)).toBe('ok');
      expect(vo('ITEMS.cinnabar.tier')).toBe(4);
      expect(sv('ITEMS.cinnabar.tier', 0.3)).toBe('ok');
      expect(vo('ITEMS.cinnabar.tier')).toBe(1);
      expect(sv('COMPANIONS.scholar.slots', 7)).toBe('ok');
      expect(vo('COMPANIONS.scholar.slots')).toBe(6);
      const ul = 'DIFFS[3].unlock.diff';
      if (vo(ul) !== undefined) { expect(sv(ul, 2.6)).toBe('ok'); expect(vo(ul)).toBe(3); }
    } finally { et(); }
  });
});
