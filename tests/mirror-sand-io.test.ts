// 水月幻镜 · m8 · the 模拟场's tuning file (sandbox.md §7, §11): the export holds only what differs (with each
// change's default, file, aliases and whether the source writes it as a formula), the filename and time format,
// the pristine fingerprint, the run's context; import round-trips, refuses junk and other files, and sorts the
// changes into usable, missing and stale; copy falls back when there is no clipboard.
import { afterEach, describe, expect, it } from 'vitest';
import { mirror, defaultMeta } from '../src/app/mirror';
import { beginTuning, changes, dataHash, endTuning, leaves, same, setValue, tuningActive, TUNABLE, valueOf } from '../src/views/mirror/logic';
import {
  applyImport, applyTuningText, buildExport, checkImport, copyTuning, exportJson, fileName, isComputed, labelOf, localIso, TUNING_KIND, verifyTuning,
} from '../src/views/mirror/ui/sand/io';
import { createSandSession, leaveSand, openSand } from '../src/views/mirror/ui/sand/session';
import COMPUTED from '../src/views/mirror/ui/sand/computed.json';
import { WEAPONS } from '../src/views/mirror/data';

const tables = () => Object.fromEntries(TUNABLE.map((t) => [t.id, t.obj]));
const PRISTINE = structuredClone(tables());
afterEach(() => { if (tuningActive()) endTuning(); expect(same(tables(), PRISTINE)).toBe(true); });

function someEdits(): string[] {
  const shared = leaves().find((l) => l.aliases.length > 0 && l.kind === 'number' && !l.ro)!;
  const p = ['WEAPONS.qingfeng.price', 'F.priceSlope', shared.path, 'F.shopOdds[0][1]'];
  expect(setValue(p[0], WEAPONS.qingfeng.price + 4)).toBe('ok');
  expect(setValue(p[1], (valueOf(p[1]) as number) * 0.5)).toBe('ok');
  expect(setValue(p[2], (valueOf(p[2]) as number) + 5)).toBe('ok');
  expect(setValue(p[3], 0)).toBe('ok');
  expect(setValue('ITEMS.' + Object.keys(PRISTINE.ITEMS as object)[0] + '.stats.luck', 7)).toBe('ok');
  return p;
}

describe('the export', () => {
  it('holds only the differences, each with its default, file, aliases, label and source', () => {
    beginTuning();
    const hash0 = dataHash();
    const price0 = WEAPONS.qingfeng.price;
    const p = someEdits();
    // a change set back to its default drops out
    expect(setValue('F.startMoon', (valueOf('F.startMoon') as number) + 1)).toBe('ok');
    expect(setValue('F.startMoon', null)).toBe('ok');
    const f = buildExport({ note: '琴师拍上伤害太高，试 12。', lang: 'zh', now: new Date(2026, 8, 30, 21, 5, 7) });
    expect(f.kind).toBe(TUNING_KIND);
    expect(f.v).toBe(1);
    expect(f.note).toBe('琴师拍上伤害太高，试 12。');
    expect(f.exportedAt).toMatch(/^2026-09-30T21:05:07[+-]\d\d:\d\d$/);
    expect(f.build.data).toBe(hash0);
    expect(f.build.rest).toBe(dataHash({ except: changes().map((c) => c.path) }));
    expect(f.changes.map((c) => c.path)).toEqual([...p, expect.stringMatching(/^ITEMS\..+\.stats\.luck$/)]);
    const price = f.changes[0];
    expect(price).toMatchObject({ file: 'src/views/mirror/data/weapons.ts', default: price0, value: price0 + 4, source: 'literal', aliases: [] });
    expect(price.zh).toContain('兵器');
    expect(price.en).toContain('Weapons');
    expect(f.changes[2].aliases.length).toBeGreaterThan(0);
    expect(f.changes[4].default).toBeNull();
    expect(f.sheet).toBeUndefined();
    const json = exportJson(f);
    expect(JSON.parse(json)).toEqual(f);
    expect(json.length).toBeLessThan(10_000);
  });

  it('names the file mirror-tuning-YYYYMMDD-HHMM.json in local time', () => {
    expect(fileName(new Date(2026, 8, 3, 7, 4))).toBe('mirror-tuning-20260903-0704.json');
    expect(localIso(new Date(2026, 0, 2, 3, 4, 5))).toMatch(/^2026-01-02T03:04:05[+-]\d\d:\d\d$/);
  });

  it('marks the formulas in the source (the computed list from the script) and labels a path plainly', () => {
    expect((COMPUTED as { path: string }[]).length).toBeGreaterThan(20);
    for (const c of COMPUTED as { path: string }[]) {
      expect(leaves().some((l) => l.path === c.path)).toBe(true); // every listed path is a live leaf
      expect(isComputed(c.path)).toBe(true);
    }
    expect(isComputed('WEAPONS.qingfeng.price')).toBe(false);
    expect(labelOf('WEAPONS.qingfeng.dmg[2]')).toEqual({ zh: '兵器 · 青锋剑 · 伤害 · 仙', en: expect.stringMatching(/^Weapons · .+ · Damage · Immortal$/) });
    expect(labelOf('F.shopOdds[2][4]').zh).toMatch(/^公式 · 兵器品质（第 \d+ 重起） · 神$/);
    expect(labelOf('HEART.heartHp.costs[1]').zh).toBe('心镜 · 固本 · 每阶镜屑 · 第 2 阶');
    expect(labelOf('F.curseMoon').zh).toBe('公式 · 劫数 · 每点月华');
  });

  it('carries the run as context (the 本局 sheet, the setup, the enemy knobs, the log), never as data', () => {
    mirror.value = defaultMeta('2026-09-30');
    openSand();
    try {
      const s = createSandSession({ char: 'musician', map: 'forest', diff: 3, vows: {}, wave: 12, seed: 99, heart: 'full', mastery: 'full', pool: 'all', build: 'bare', today: '2026-09-30', arrive: 'fight' });
      s.setSheet([{ id: 'aspd', mode: 'add', v: 100 }, { id: 'speed', mode: 'set', v: -50 }]);
      s.setEnemy({ hp: 2 });
      const f = buildExport({ lang: 'en', sess: s });
      expect(f.changes).toEqual([]);
      expect(f.sheet).toEqual({ note: '本局临时加减，不是数值表', char: 'musician', stats: [{ id: 'aspd', mode: 'add', v: 100 }, { id: 'speed', mode: 'set', v: -50 }] });
      expect(f.session).toMatchObject({ char: 'musician', map: 'forest', diff: 3, wave: 12, seed: 99, heart: 'full', enemy: { hp: 2, dmg: 1, spd: 1, density: 1 } });
      expect(f.log).toEqual([]);
    } finally { leaveSand(); }
  });
});

describe('the import', () => {
  it('round-trips: export, leave, come back, import → the same changes', () => {
    beginTuning();
    someEdits();
    const before = changes().map((c) => ({ path: c.path, value: c.value }));
    const json = exportJson(buildExport({ lang: 'zh' }));
    endTuning();
    beginTuning();
    const r = checkImport(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usable.length).toBe(before.length);
    expect(r.missing).toEqual([]);
    expect(r.stale).toEqual([]);
    expect(applyImport(r.usable)).toBe(before.length);
    expect(changes().map((c) => ({ path: c.path, value: c.value }))).toEqual(before);
  });

  it('refuses junk, another kind of file and a newer version', () => {
    beginTuning();
    expect(checkImport('not json')).toEqual({ ok: false, reason: 'json' });
    expect(checkImport('{"kind":"banmu-backup","v":1,"changes":[]}')).toEqual({ ok: false, reason: 'kind' });
    expect(checkImport(JSON.stringify({ kind: TUNING_KIND, v: 2, changes: [] }))).toEqual({ ok: false, reason: 'version' });
    expect(checkImport('null')).toEqual({ ok: false, reason: 'kind' });
  });

  it('sorts a missing path and a stale default out (reported, not applied)', () => {
    beginTuning();
    const price = WEAPONS.qingfeng.price;
    const file = {
      kind: TUNING_KIND, v: 1, changes: [
        { path: 'WEAPONS.qingfeng.price', default: price, value: price + 1 },
        { path: 'WEAPONS.noSuchSword.price', default: 10, value: 12 },
        { path: 'F.priceSlope', default: -123, value: 0.1 },
        { path: 'F.startMoon', default: valueOf('F.startMoon'), value: 'lots' },
        { path: '1bad path', default: 1, value: 2 },
        // QA: a read-only path, and null on a plain number (only a stat in a StatMods map may be absent)
        { path: 'BOSSES.carp.wave', default: valueOf('BOSSES.carp.wave'), value: 11 },
        { path: 'F.sellFrac', default: valueOf('F.sellFrac'), value: null },
      ],
    };
    const r = checkImport(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usable.map((c) => c.path)).toEqual(['WEAPONS.qingfeng.price']);
    expect(r.missing.map((c) => c.path)).toEqual(['WEAPONS.noSuchSword.price', '1bad path']);
    expect(r.stale.map((c) => c.path)).toEqual(['F.priceSlope']);
    expect(r.ro.map((c) => c.path)).toEqual(['BOSSES.carp.wave']);
    expect(r.bad.map((c) => c.path)).toEqual(['F.startMoon', 'F.sellFrac']);
    expect(applyImport(r.usable)).toBe(1);
    expect(WEAPONS.qingfeng.price).toBe(price + 1);
  });
});

describe('copy', () => {
  it('says no without a clipboard (the copy sheet opens instead)', async () => {
    expect(await copyTuning('{}')).toBe(false);
  });
});

describe('the way back (TUNING=): the sweep applies a file; the verify step proves an apply', () => {
  it('applyTuningText enters tuning with the usable changes; endTuning restores', () => {
    beginTuning();
    someEdits();
    const json = exportJson(buildExport({ lang: 'zh' }));
    const want = changes().map((c) => [c.path, c.value] as const);
    endTuning();
    const r = applyTuningText(json);
    expect(tuningActive()).toBe(true);
    expect(r.applied).toBe(want.length);
    expect(r.missing).toEqual([]);
    expect(r.stale).toEqual([]);
    for (const [p, v] of want) expect(valueOf(p)).toBe(v === null ? undefined : v);
    endTuning();
    expect(() => applyTuningText('{"kind":"other"}')).toThrow(/TUNING/);
    expect(tuningActive()).toBe(false);
  });

  it('verifyTuning: passes when exactly the file values are in the tables, fails on a missed or an extra change', () => {
    beginTuning();
    someEdits();
    const json = exportJson(buildExport({ lang: 'zh' }));
    // the tables as an apply --write would leave them: the file's values, nothing else
    const ok = verifyTuning(json);
    expect(ok.wrong).toEqual([]);
    expect(ok.rest.now).toBe(ok.rest.want);
    expect(ok.ok).toBe(true);
    expect(ok.held).toBe(JSON.parse(json).changes.length);
    // something else moved too: the rest no longer hashes the same
    expect(setValue('F.startMoon', (valueOf('F.startMoon') as number) + 1)).toBe('ok');
    const extra = verifyTuning(json);
    expect(extra.ok).toBe(false);
    expect(extra.wrong).toEqual([]);
    expect(extra.rest.now).not.toBe(extra.rest.want);
    expect(setValue('F.startMoon', null)).toBe('ok');
    // one change not applied
    expect(setValue('WEAPONS.qingfeng.price', null)).toBe('ok');
    const miss = verifyTuning(json);
    expect(miss.ok).toBe(false);
    expect(miss.wrong.map((w) => w.path)).toEqual(['WEAPONS.qingfeng.price']);
    endTuning();
    // the pristine tables are not the applied file
    expect(verifyTuning(json).ok).toBe(false);
  });
});
