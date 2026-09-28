// 水月幻镜 · the 人物 panel's numbers and words (src/views/mirror/ui/panelView.ts; mirror3 d-panel §9).
// The four body tiles read the same logic the engine uses; armour is 「少受 / 多受 x%」; unused zero rows
// fold; DPS is exactly the old 属性 tab's maths; set lines carry SETS' numbers; the level-card preview goes
// through computeStats (大橘 and 嫦娥 gain less); the change strip compares with the sheet kept before the
// wave just won, and nothing else; English carries no hanzi and no bare 「u」.
import { afterEach, describe, expect, it } from 'vitest';
import { COMPANIONS, SETS, WCLASSES, WEAPONS } from '../src/views/mirror/data';
import { termOf } from '../src/views/mirror/data/glossary';
import { armorReduction, computeStats, cooldown, maxHp, tierCd, weaponHit } from '../src/views/mirror/logic';
import type { RunSave, StatId, Tier, WClass } from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import {
  bodyDots, companionRun, companionView, levelPreview, makePanelBase, panelBase, panelView, rememberPanelBase, relevance, setStepText,
  statValueText, weaponDps,
} from '../src/views/mirror/ui/panelView';
import { tFor } from '../src/views/mirror/ui/text';

const zh = tFor('zh');
const en = tFor('en');
const CJK = /[㐀-鿿]/;
const run = (char: RunSave['char'], o: Partial<RunSave> = {}): RunSave => ({ ...companionRun(char), seed: 777, ...o });
const tile = (r: RunSave, id: string, t = zh) => panelView(r, null, t).tiles.find((x) => x.id === id)!;
const rows = (r: RunSave) => panelView(r, null, zh).groups.flatMap((g) => g.rows.map((x) => x.id));

describe('人物 panel · body tiles', () => {
  it('reads 书生 at a fresh start', () => {
    const r = run('scholar');
    const s = computeStats(r);
    expect(tile(r, 'hp').value).toBe(String(maxHp(s)));
    expect(tile(r, 'hp').value).toBe(String(COMPANIONS.scholar.hp));
    expect(tile(r, 'hp').sub).toBe('不会自己回血');
    const a = tile(r, 'armor');
    expect(a.label).toBe('护甲 1');
    expect(`${a.word} ${a.value}`).toBe(`少受 ${armorReduction(1)}%`);
    expect(a.value).toBe('6%');
    expect(tile(r, 'dodge').value).toBe('0%');
    expect(tile(r, 'dodge').sub).toBe('最多 60%');
    expect(tile(r, 'speed').value).toBe('常速');
    expect(tile(r, 'speed').sub).toBe('和常人一样快');
  });
  it('says 多受 when armour is below zero', () => {
    const r = run('scholar', { stats: { armor: -2 } });
    const a = tile(r, 'armor');
    expect(a.label).toBe('护甲 −1');
    expect(`${a.word} ${a.value}`).toBe('多受 7%');
    expect(a.tone).toBe('down');
    expect(tile(r, 'armor', en).word + ' ' + tile(r, 'armor', en).value).not.toMatch(CJK);
  });
  it('shows the real dodge cap: 嫦娥 70, 广寒桂 +10, never above the hard 75', () => {
    expect(tile(run('change'), 'dodge').sub).toBe('最多 70%');
    const r = run('change', { items: { osmanthus: 1 }, stats: { dodge: 80 } });
    expect(tile(r, 'dodge').value).toBe('75%');
    expect(tile(r, 'dodge').sub).toMatch(/^已到顶，多出的 \d+(\.\d+)?% 没用$/);
  });
  it('heals in words when there is regen', () => {
    expect(tile(run('gardener'), 'hp').sub).toMatch(/^每秒回 [\d.]+ 点血$/);
  });
  it('gives speed as a percent of normal, never in u/s', () => {
    const r = run('cat');
    expect(tile(r, 'speed').value).toBe(`+${COMPANIONS.cat.speed}%`);
    expect(tile(r, 'speed').sub).toBe(`比常人快 ${COMPANIONS.cat.speed}%`);
    expect(tile(run('scholar', { stats: { speed: -10 } }), 'speed').sub).toBe('比常人慢 10%');
  });
});

describe('人物 panel · grouped rows', () => {
  it('folds rows nobody uses and keeps what the weapons scale with', () => {
    const scholar = run('scholar', { weapons: [{ id: 'qingfeng', t: 1 }] });
    expect(rows(scholar)).not.toContain('summonCap');
    expect(rows(scholar)).not.toContain('stones');
    expect(rows(scholar)).toContain('melee');
    expect(rows(scholar)).toContain('crit');
    expect(rows(scholar)).toContain('aspd');
    expect(rows(run('painter', { weapons: [{ id: 'brush', t: 1 }] }))).toContain('summonCap');
    expect(rows(run('swordsman', { weapons: [{ id: 'qingping', t: 1 }] }))).toContain('swords');
    const v = panelView(scholar, null, zh);
    expect(v.hiddenCount).toBe(v.groups.reduce((n, g) => n + g.folded.length, 0));
  });
  it('colours against the neutral value (棋子上限 6 is not a gain)', () => {
    const r = run('scholar', { weapons: [{ id: 'gobowl', t: 1 }] });
    const row = panelView(r, null, zh).groups.flatMap((g) => g.rows).find((x) => x.id === 'stones')!;
    expect(row.value).toBe('6');
    expect(row.tone).toBe('plain');
    expect(relevance(r, computeStats(r), 'stones')).toBe(true);
  });
  it('tags a scaling row with the weapons that use it', () => {
    const one = panelView(run('scholar', { weapons: [{ id: 'qingfeng', t: 1 }] }), null, zh).groups.flatMap((g) => g.rows).find((x) => x.id === 'melee')!;
    expect(one.tag).toBe('你的青锋剑受这项加成');
    const two = panelView(run('scholar', { weapons: [{ id: 'qingfeng', t: 1 }, { id: 'longquan', t: 1 }] }), null, zh).groups.flatMap((g) => g.rows).find((x) => x.id === 'melee')!;
    expect(two.tag).toBe('2 把兵器受这项加成');
  });
  it('formats by the glossary: 暴击倍数 as +0.3, 射程 with no unit', () => {
    expect(statValueText('critDmg', 30)).toBe('+0.3');
    expect(statValueText('range', 30)).toBe('+30');
    expect(statValueText('crit', 10)).toBe('+10%');
    expect(statValueText('dmg', -5)).toBe('−5%');
    expect(statValueText('stones', 6)).toBe('6');
  });
  it('gives every row the glossary line as its gloss', () => {
    for (const g of panelView(run('scholar'), null, zh).groups) {
      for (const r of [...g.rows, ...g.folded]) expect(r.gloss).toBe(termOf(r.id).plainZh);
    }
  });
});

describe('人物 panel · weapons', () => {
  it('weaponDps is the old 属性 formula for every weapon at every tier', () => {
    const r = run('scholar', { stats: { crit: 12, aspd: 25, melee: 3, ranged: 4, elem: 2, spirit: 5, critDmg: 20, dmg: 10 } });
    const s = computeStats(r);
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      for (const t of [1, 2, 3, 4] as Tier[]) {
        const def = WEAPONS[id];
        const h = weaponHit(r, s, id, t);
        const half = def.kind === 'paint' || def.kind === 'turret' || def.kind === 'mine';
        const old = (h.raw * h.mult * (1 + h.crit * (h.critM - 1))) / cooldown(tierCd(def, t), s.aspd, half);
        expect(weaponDps(r, s, { id, t }), `${id} ${t}`).toBeCloseTo(old, 9);
      }
    }
  });
  it('writes each weapon row plainly: interval, what it scales with, no bare u', () => {
    const v = panelView(run('scholar', { weapons: [{ id: 'qingfeng', t: 2 }, { id: 'qingping', t: 1 }] }), null, zh);
    expect(v.weapons[0].line).toMatch(/^每 [\d.]+ 秒一下 · 受近战加成$/);
    expect(v.weapons[0].tierWord).toBe('灵品');
    expect(v.weapons[1].classes).toBe('飞剑');
    for (const w of v.weapons) for (const d of [w.line, ...w.detail]) expect(d).not.toMatch(/\du\b| u\b/);
  });
});

describe('人物 panel · sets', () => {
  it('has three steps for every class, with SETS\' numbers in them', () => {
    for (const c of WCLASSES as readonly WClass[]) {
      for (const tier of [0, 1, 2] as const) {
        const line = setStepText(c, tier, zh);
        expect(line.length, `${c} ${tier}`).toBeGreaterThan(0);
        const st = SETS[c].tiers[tier].stats;
        for (const k of Object.keys(st) as StatId[]) expect(line, `${c} ${tier} ${k}`).toContain(String(Math.abs(st[k] ?? 0)));
        expect(setStepText(c, tier, en), `${c} ${tier}`).not.toMatch(CJK);
      }
    }
  });
  it('says what is active and what the next step gives', () => {
    const v = panelView(run('scholar', { weapons: [{ id: 'qingfeng', t: 1 }, { id: 'longquan', t: 1 }, { id: 'yanyue', t: 1 }] }), null, zh);
    const sword = v.sets.find((x) => x.cls === 'sword')!;
    expect(sword.count).toBe(2);
    expect(sword.tier).toBe(0);
    // the step words are describe.setSteps' (TEXT); the panel adds 「再 k 件（凑满 m 件）：」
    expect(sword.active).toMatch(/暴击率.*\+5%/);
    expect(sword.next).toMatch(/^再 2 件（凑满 4 件）：.*暴击率.*\+10%/);
    const heavy = v.sets.find((x) => x.cls === 'heavy')!;
    expect(heavy.active).toBeNull();
    expect(heavy.next).toMatch(/^再 1 件（凑满 2 件）：/);
  });
});

describe('人物 panel · level-card preview', () => {
  it('goes through computeStats: 大橘 gains half the 气血', () => {
    const r = run('cat');
    const hp = maxHp(computeStats(r));
    const p = levelPreview(r, 'hp', 6, zh);
    expect(p.line).toBe(`现在 ${hp} → ${hp + 3}`);
  });
  it('shows armour as 少受 x% → y%, 嫦娥 gaining three quarters', () => {
    const r = run('change');
    const p = levelPreview(r, 'armor', 2, zh);
    expect(p.line).toBe(`少受 0% → ${armorReduction(1.5)}%`);
    // 书生's own 1 − 3 = −2, and a +4 card makes it 2
    expect(levelPreview(run('scholar', { stats: { armor: -3 } }), 'armor', 4, zh).line).toBe(`多受 ${-armorReduction(-2)}% → 少受 ${armorReduction(2)}%`);
  });
  it('reads a percent card', () => {
    expect(levelPreview(run('scholar'), 'crit', 5, zh).line).toBe('现在 0% → +5%');
    expect(levelPreview(run('scholar'), 'crit', 5, en).line).toBe('Now 0% → +5%');
    expect(levelPreview(run('scholar'), 'range', 15, zh).line).toBe('现在 0 → +15');
  });
});

describe('人物 panel · since the last wave', () => {
  const store: Record<string, string> = {};
  const g = globalThis as unknown as { localStorage?: Storage };
  afterEach(() => { delete g.localStorage; for (const k of Object.keys(store)) delete store[k]; });

  it('lists what a card, a purchase and a merge changed', () => {
    const before = run('scholar', { wave: 1, weapons: [{ id: 'qingfeng', t: 1 }, { id: 'qingfeng', t: 1 }] });
    const base = makePanelBase({ ...before, wave: 1 });
    // base.at is the wave that was about to start; once won, run.wave === base.at
    // the merge breaks the 2-sword set (暴击率 −5), a +10 card more than makes up for it
    const after = { ...before, wave: base.at, weapons: [{ id: 'qingfeng' as const, t: 2 as Tier }, { id: 'dart' as const, t: 1 as Tier }], items: { songzi: 1 }, stats: { crit: 10 } };
    const v = panelView(after, base, zh);
    const texts = v.delta!.map((c) => c.text);
    expect(texts).toContain(`气血 +4`);
    expect(texts).toContain('暴击率 +5%');
    expect(texts).toContain('青锋剑 I → II');
    expect(texts).toContain('新兵器 飞镖 I');
    expect(texts).toContain('新道具 松子');
    expect(v.tiles.find((x) => x.id === 'hp')!.delta!.text).toBe('+4');
    // armour's change is said as what it was, never as a bare percent next to 「多受」
    const worse = panelView({ ...after, items: { watermoon: 1 } }, base, zh).tiles.find((x) => x.id === 'armor')!;
    expect(worse.delta!.text).toBe(`原来少受 ${armorReduction(1)}%`);
    expect(worse.delta!.tone).toBe('down');
  });
  it('keeps the base per device, and only for this run and the wave just won', () => {
    g.localStorage = {
      getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; },
      clear: () => {}, key: () => null, length: 0,
    } as Storage;
    const r = run('scholar', { wave: 2 });
    rememberPanelBase(r);
    expect(panelBase({ ...r, wave: 3 })).not.toBeNull();
    expect(panelBase({ ...r, wave: 2 })).toBeNull();
    expect(panelBase({ ...r, wave: 3, seed: 1 })).toBeNull();
    store['banmu.mirror.panelBase'] = '{not json';
    expect(panelBase({ ...r, wave: 3 })).toBeNull();
  });
  it('has no strip without a base', () => {
    expect(panelView(run('scholar'), null, zh).delta).toBeNull();
    expect(panelBase(run('scholar'))).toBeNull(); // no storage at all
  });
});

describe('人物 panel · the select card', () => {
  it('gives 1–5 dots against the other companions, 0 armour one dot', () => {
    const cv = companionView('scholar', zh);
    for (const x of cv.tiles) { expect(x.dots).toBeGreaterThanOrEqual(1); expect(x.dots).toBeLessThanOrEqual(5); }
    const minArmour = Math.min(...(Object.keys(COMPANIONS) as RunSave['char'][]).map((c) => computeStats(companionRun(c)).armor));
    expect(bodyDots('armor', minArmour)).toBe(1);
  });
  it('lists the other starting stats (园丁 回血)', () => {
    expect(companionView('gardener', zh).extra).toMatch(/回血 \+\d/);
    expect(companionView('scholar', zh).extra).toBe('');
  });
});

describe('人物 panel · words', () => {
  it('has no hanzi in English and no bare u anywhere', () => {
    const runs: RunSave[] = [
      run('scholar', { weapons: [{ id: 'qingfeng', t: 2 }, { id: 'qingping', t: 1 }, { id: 'brush', t: 3 }], items: { osmanthus: 1, songzi: 2 }, stats: { crit: 5, range: 30 } }),
      run('change', { weapons: [{ id: 'moonmirror', t: 4 }, { id: 'moonwheel', t: 1 }] }),
      run('cat', { weapons: [{ id: 'claw', t: 1 }, { id: 'drunkfist', t: 2 }], stats: { armor: -3 } }),
    ];
    for (const r of runs) {
      const base = makePanelBase({ ...r, weapons: [], items: {}, stats: {} });
      const vEn = panelView({ ...r, wave: base.at }, base, en);
      const words = [
        ...vEn.tiles.flatMap((x) => [x.label, x.word ?? '', x.value, x.sub, x.delta?.text ?? '', x.delta?.aria ?? '']),
        ...vEn.groups.flatMap((g) => [g.label, g.gloss, ...[...g.rows, ...g.folded].flatMap((x) => [x.label, x.value, x.tag ?? '', x.gloss, x.delta?.aria ?? ''])]),
        ...vEn.weapons.flatMap((w) => [w.name, w.tierWord, w.classes, w.line]),
        ...vEn.sets.flatMap((s) => [s.name, s.active ?? '', s.next ?? '']),
        ...(vEn.delta ?? []).map((c) => c.text),
      ];
      for (const w of words) expect(w, w).not.toMatch(CJK);
      const vZh = panelView({ ...r, wave: base.at }, base, zh);
      // the panel's own words (a weapon's rules line and its extra detail are describe.ts's, tested there)
      const own = (v: typeof vZh) => JSON.stringify({ ...v, weapons: v.weapons.map((w) => ({ ...w, body: '', t4: '', detail: w.detail.slice(0, 1 + Object.keys(WEAPONS[w.id].scale).length) })) });
      expect(own(vZh) + own(vEn)).not.toMatch(/\d ?u\b|u\/s/);
    }
  });
});
