// 水月幻镜 · the descriptions (mirror3 d-text §5.3): every weapon, item, skill, passive and line the
// player reads comes from data/say.ts templates filled by ui/describe.ts. These tests hold the words
// to the numbers: no digit is typed outside a slot, every slot resolves at every tier, every number a
// line prints is one the data holds, lines fit their screens, English has no hanzi and no bare `u`,
// retired jargon stays out, and the engine constants the text quotes are read back from the engine.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AFFIX_REG, ALT_SKILL_REG, ARCHETYPE_REG, COMPANION_REG, DEED_REG, DIFF_REG, ELITE_REG, HAZARD_REG, ITEM_REG, MONSTER_REG, MUTATOR_REG,
  PASSIVE_REG, SKILL_REG, TITLE_REG, TREASURE_REG, VOW_REG, WEAPON_REG,
} from '../src/views/mirror/ids';
import { F, HAZARDS, HEART, ITEMS, MUTATORS, PASSIVES, SETS, SKILLS, TERM_MODS, WCLASSES, WEAPONS } from '../src/views/mirror/data';
import { GLOSSARY } from '../src/views/mirror/data/glossary';
import * as SAY from '../src/views/mirror/data/say';
import * as D from '../src/views/mirror/ui/describe';
import { HEART_TEXT, TERM_TEXT, tFor, lockHint } from '../src/views/mirror/ui/text';
import type { Tier } from '../src/views/mirror/types';

const zh = tFor('zh'), en = tFor('en');
const TIERS: readonly Tier[] = [1, 2, 3, 4];
const ROOT = join(__dirname, '../src/views/mirror');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** Code points (what a line costs on screen), punctuation and spaces included. */
const len = (s: string) => [...s].length;
const CJK = /[㐀-鿿]/;

// ───────────────────────────── every template, for the static checks
type Tpl = { where: string; zh: string; en: string };
function templates(): Tpl[] {
  const out: Tpl[] = [];
  const walk = (o: unknown, where: string) => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (typeof r.zh === 'string' && typeof r.en === 'string') { out.push({ where, zh: r.zh, en: r.en }); return; }
    for (const [k, v] of Object.entries(r)) walk(v, `${where}.${k}`);
  };
  for (const [k, v] of Object.entries(SAY)) if (k !== 'K') walk(v, k);
  return out;
}

// ───────────────────────────── every rendered line, both languages
type Line = { where: string; lang: 'zh' | 'en'; text: string; limit: number };
function lines(): Line[] {
  const out: Line[] = [];
  const both = (where: string, f: (t: typeof zh) => string | null, lzh: number, len_en: number) => {
    const a = f(zh), b = f(en);
    if (a !== null) out.push({ where, lang: 'zh', text: a, limit: lzh });
    if (b !== null) out.push({ where, lang: 'en', text: b, limit: len_en });
  };
  for (const w of WEAPON_REG) for (const t of TIERS) {
    both(`${w.id} ${t} head`, (x) => D.describeWeapon(w.id, t, x).head, 17, 34);
    both(`${w.id} ${t} body`, (x) => D.describeWeapon(w.id, t, x).body, 42, 120);
    // below 神品 the line leads with 「合到神品：」 (+2), so a 凡品 card never reads it as a power it has now
    both(`${w.id} ${t} t4`, (x) => D.describeWeapon(w.id, t, x).t4, t < 4 ? 32 : 30, 90);
    both(`${w.id} ${t} scales`, (x) => D.describeWeapon(w.id, t, x).scales, 12, 40);
    for (let i = 0; i < D.describeWeapon(w.id, t, zh).detail.length; i++) both(`${w.id} ${t} detail${i}`, (x) => D.describeWeapon(w.id, t, x).detail[i], 40, 100);
    for (let i = 0; i < D.describeWeapon(w.id, t, zh).tierRow.length; i++) both(`${w.id} row${i}`, (x) => D.describeWeapon(w.id, t, x).tierRow[i], 40, 80);
  }
  for (const it of ITEM_REG) {
    both(`${it.id} body`, (x) => D.describeItem(it.id, x).body, 42, 150);
    for (let i = 0; i < D.describeItem(it.id, zh).detail.length; i++) both(`${it.id} detail${i}`, (x) => D.describeItem(it.id, x).detail[i], 60, 140);
  }
  for (const s of [...SKILL_REG, ...ALT_SKILL_REG]) {
    both(`${s.id} gist`, (x) => D.describeSkill(s.id, x).gist, 44, 130);
    both(`${s.id} body`, (x) => D.describeSkill(s.id, x).body, 76, 230);
    for (let i = 0; i < D.describeSkill(s.id, zh).detail.length; i++) both(`${s.id} detail${i}`, (x) => D.describeSkill(s.id, x).detail[i], 40, 100);
  }
  for (const p of PASSIVE_REG) {
    both(`${p.id} gist`, (x) => D.describePassive(p.id, x).gist, 32, 110);
    both(`${p.id} body`, (x) => D.describePassive(p.id, x).body, 70, 200);
    both(`${p.id} cost`, (x) => D.describePassive(p.id, x).cost, 24, 70);
  }
  for (const c of COMPANION_REG) both(`${c.id} gist`, (x) => D.companionGist(c.id, x), 48, 150);
  for (const c of WCLASSES) for (let i = 0; i < 3; i++) both(`set ${c} ${i}`, (x) => D.setSteps(c, x)[i].text, 40, 110);
  for (const v of VOW_REG) both(`vow ${v.id}`, (x) => D.vowLine(v.id, x), 28, 70);
  DIFF_REG.forEach((d, i) => both(`diff ${d.id}`, (x) => D.diffLine(i as 0, x), 48, 130));
  for (const m of MUTATOR_REG) for (const v of MUTATORS[m.id].v) both(`mut ${m.id} ${v}`, (x) => D.mutatorLine(m.id, v, x), 24, 70);
  for (const a of AFFIX_REG) both(`affix ${a.id}`, (x) => D.affixLine(a.id, x), 20, 60);
  for (const d of DEED_REG) both(`deed ${d.id}`, (x) => D.deedLine(d.id, x), 24, 60);
  for (const d of TITLE_REG) both(`title ${d.id}`, (x) => D.titleLine(d.id, x), 24, 60);
  for (const a of ARCHETYPE_REG) both(`arch ${a.id}`, (x) => D.archLine(a.id, x), 30, 90);
  for (const m of [...MONSTER_REG, ...ELITE_REG, ...TREASURE_REG]) both(`foe ${m.id}`, (x) => D.foeTip(m.id, x), 24, 70);
  for (const h of HAZARD_REG) both(`hazard ${h.id}`, (x) => D.hazardTip(h.id, x), 28, 80);
  return out;
}
const ALL = lines();

describe('mirror descriptions · templates', () => {
  it('no digit is typed outside a {slot}: every number comes from data', () => {
    const bad: string[] = [];
    for (const x of templates()) for (const s of [x.zh, x.en]) {
      const bare = s.replace(/\{[^{}]*\}/g, '');
      if (/[0-9０-９]/.test(bare)) bad.push(`${x.where}: ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it('every weapon, item, skill (☆ too), passive, companion, flag, archetype, vow, mutator, affix, deed, title, foe and hazard has its line; no strays', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(SAY.WEAPON_SAY)).toEqual(WEAPON_REG.map((x) => x.id).sort());
    expect(keys(SAY.SKILL_SAY)).toEqual([...SKILL_REG, ...ALT_SKILL_REG].map((x) => x.id).sort());
    expect(keys(SAY.PASSIVE_SAY)).toEqual(PASSIVE_REG.map((x) => x.id).sort());
    expect(keys(SAY.COMPANION_SAY)).toEqual(COMPANION_REG.map((x) => x.id).sort());
    expect(keys(SAY.ARCH_SAY)).toEqual(ARCHETYPE_REG.map((x) => x.id).sort());
    expect(keys(SAY.VOW_SAY)).toEqual(VOW_REG.map((x) => x.id).sort());
    expect(SAY.DIFF_SAY.length).toBe(DIFF_REG.length);
    expect(keys(SAY.MUTATOR_SAY)).toEqual(MUTATOR_REG.map((x) => x.id).sort());
    expect(keys(SAY.AFFIX_SAY)).toEqual(AFFIX_REG.map((x) => x.id).sort());
    expect(keys(SAY.DEED_SAY)).toEqual(DEED_REG.map((x) => x.id).sort());
    expect(keys(SAY.TITLE_SAY)).toEqual(TITLE_REG.map((x) => x.id).sort());
    expect(keys(SAY.FOE_SAY)).toEqual([...MONSTER_REG, ...ELITE_REG, ...TREASURE_REG].map((x) => x.id).sort());
    expect(keys(SAY.HAZARD_SAY)).toEqual(HAZARD_REG.map((x) => x.id).sort());
    for (const k of keys(SAY.ITEM_SAY)) expect(ITEM_REG.some((x) => x.id === k), k).toBe(true);
    // an item with effects needs a line; a stats-only item is generated from `stats`
    for (const it of ITEM_REG) if (ITEMS[it.id].fx?.length) expect(SAY.ITEM_SAY[it.id]?.say, it.id).toBeTruthy();
    const flags = new Set(Object.values(SETS).flatMap((s) => s.tiers.flatMap((x) => x.flags ?? [])));
    expect([...flags].sort()).toEqual(keys(D.FLAG_TEXT));
  });

  it('every per-tier weapon number that changes has a codex tier row', () => {
    for (const w of WEAPON_REG) {
      const say = SAY.WEAPON_SAY[w.id];
      const rowKeys = (say.rows ?? []).map(([slot]) => slot.replace(/[^A-Za-z].*$/, ''));
      for (const [k, v] of Object.entries(WEAPONS[w.id].p)) {
        if (!Array.isArray(v) || new Set(v).size === 1) continue;
        expect(rowKeys.includes(k) || !!say.words?.[k] || k === 'r', `${w.id}.p.${k}`).toBe(true);
      }
    }
  });
});

describe('mirror descriptions · rendered', () => {
  it('every slot resolves at every tier, in both languages (no {, undefined or NaN)', () => {
    const bad = ALL.filter((x) => /[{}]|undefined|NaN|null/.test(x.text)).map((x) => `${x.where} (${x.lang}): ${x.text}`);
    expect(bad).toEqual([]);
  });

  it('every line fits its screen (d-text §2.5)', () => {
    const bad = ALL.filter((x) => len(x.text) > x.limit).map((x) => `${x.where} (${x.lang}) ${len(x.text)} > ${x.limit}: ${x.text}`);
    expect(bad).toEqual([]);
  });

  it('English has no hanzi, no bare `u` unit, no engine words', () => {
    const bad = ALL.filter((x) => x.lang === 'en' && (CJK.test(x.text) || /\bu\b|u\/s|procCoef|luck-scaled/.test(x.text))).map((x) => `${x.where}: ${x.text}`);
    expect(bad).toEqual([]);
    for (const [k, v] of Object.entries(TERM_TEXT)) expect(CJK.test(v[1]), k).toBe(false);
    for (const [k, v] of Object.entries(HEART_TEXT)) expect(CJK.test(v[1]), k).toBe(false);
  });

  it('Chinese is plain: no 文言 words, no retired jargon, no `u`, no Roman tiers', () => {
    const banned: [RegExp, string][] = [
      [/至多/, '至多 → 最多'], [/皆/, '皆 → 都'], [/之(?!后|前|间|一)/, '之 → 的'], [/其(?!他|余|实)/, '其 → 它的'], [/致(?!命)/, '致 → 让'],
      [/(?<!或)者/, '者 → 的敌人'], [/若/, '若 → 如果'], [/(?<![随立])即/, '即 → 就'], [/(?<![低高大小等对由关])于/, '于 → 在'], [/毕/, '毕 → 结束后'],
      [/所持|所过/, '所持 → 手里的'], [/触发系数/, 'never show procCoef'], [/一线|一触/, '一线 / 一触'], [/醉踉|引燃|连爆/, 'plain verbs'],
      [/市位|市价|每市/, '商店'], [/重抽/, '刷新'], [/精怪/, '精英'], [/三阶/, '仙品'], [/出怪预算/, '来的敌人'], [/状态互传/, 'spell it out'],
      [/回气|五行|造化|身法|暴伤|(?<!治)疗效|仙剑|灼烧|月盾|劫火/, 'retired word (glossary)'], [/\bu\b|u\/s/, 'no u'], [/\b(?:I|II|III|IV)\b/, 'Roman tier in zh'],
      [/随福缘/, '（福缘越高越容易）'], [/进行|使得|该敌/, 'machine phrasing'],
    ];
    const bad: string[] = [];
    for (const x of ALL) if (x.lang === 'zh') for (const [re, why] of banned) if (re.test(x.text)) bad.push(`${x.where}: ${why}: ${x.text}`);
    for (const [k, v] of Object.entries(TERM_TEXT)) for (const [re, why] of banned) if (re.test(v[0])) bad.push(`TERM_TEXT.${k}: ${why}`);
    for (const [k, v] of Object.entries(HEART_TEXT)) for (const [re, why] of banned) if (re.test(v[0])) bad.push(`HEART_TEXT.${k}: ${why}`);
    expect(bad).toEqual([]);
  });

  it('the head line is the tier’s own damage and cooldown; scaling names come from the glossary', () => {
    for (const w of WEAPON_REG) for (const t of TIERS) {
      const d = D.describeWeapon(w.id, t, zh), def = WEAPONS[w.id];
      const cd = Math.round(def.cd * F.tierCd[t - 1] * 100) / 100;
      expect(d.head.startsWith(`伤害 ${def.dmg[t - 1]} · ${cd} 秒`), `${w.id} ${t}: ${d.head}`).toBe(true);
      for (const [stat, k] of Object.entries(def.scale)) if (k > 0) expect(d.scales).toContain(GLOSSARY[stat as 'melee'].zh);
    }
  });
});

// ───────────────────────────── numbers: every number a line prints is one the data holds
/** Every number a def holds, and the forms the templates may print it in. */
function numberForms(vals: number[]): Set<string> {
  const out = new Set<string>();
  const add = (x: number) => { if (Number.isFinite(x)) out.add(D.num(Math.abs(x)).replace(/,/g, '')); };
  for (const v of vals) { add(v); add(v * 100); add(v + 1); add(v - 1); add((v - 1) * 100); add((1 - v) * 100); add(v / 100); for (const [, p] of F.proc) add(v * p * 100), add(v * p); }
  return out;
}
const flat = (o: unknown, out: number[] = []): number[] => {
  if (typeof o === 'number') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => flat(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => flat(x, out));
  return out;
};
const GLOBAL = [...flat(F), ...flat(SAY.K), 1, 10, 20, 30, 50, 60, 72, 36, 8, 6, 25, 5];
const numsIn = (s: string) => (s.replace(/°/g, '').match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ''));

describe('mirror descriptions · numbers match the data', () => {
  it('weapons: every printed number is the def’s own, at the tier shown', () => {
    const bad: string[] = [];
    for (const w of WEAPON_REG) {
      const def = WEAPONS[w.id];
      const ok = numberForms([...flat(def.p), ...flat(def.dmg), def.cd, ...def.dmg.map((_, i) => def.cd * F.tierCd[i]), def.range, def.crit, def.critX, def.knock, ...flat(def.scale), ...GLOBAL]);
      for (const t of TIERS) for (const lang of [zh, en]) {
        const d = D.describeWeapon(w.id, t, lang);
        for (const s of [d.head, d.body, d.t4 ?? '', ...d.detail]) for (const n of numsIn(s)) if (!ok.has(n)) bad.push(`${w.id} ${t}: ${n} in ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('weapons: the per-tier numbers are the tier’s (the IV card never shows a tier-I number)', () => {
    const body = (id: Parameters<typeof D.describeWeapon>[0], t: Tier) => D.describeWeapon(id, t, zh).body;
    expect(body('qingfeng', 1)).toContain('最多刺中 2 个敌人'); // pierce 1 → 2 enemies
    expect(body('qingfeng', 4)).toContain('最多刺中 4 个敌人'); // pierce 3 at IV (was stuck at 1)
    expect(body('seven', 4)).toContain('落下 7 把剑'); // n [3,3,4,7] (text said 5)
    expect(body('thunder', 4)).toContain('旁边 6 个敌人'); // jumps [2,2,3,6] (text said 4)
    expect(body('drunkfist', 1)).toContain('醉意 +1.8'); // 3 × procCoef(0.8 s) = 1.8 (text said 3)
    expect(body('pestle', 1)).toContain('10% 几率'); // 0.1 × procCoef(1.1 s) = 10%
    expect(body('hoe', 3)).toContain('20% 几率');
    expect(body('coindart', 2)).toContain('最多 +15');
    expect(D.describeWeapon('claw', 4, zh).t4).toBeNull(); // IV only raises numbers the body shows
    expect(D.describeWeapon('claw', 1, zh).t4).toBe('合到神品：流血最多叠 15 层。');
    expect(D.describeWeapon('qingfeng', 1, zh).tierRow[1]).toBe('一剑刺中：凡 2 · 灵 2 · 仙 2 · 神 4');
    expect(D.describeWeapon('qingfeng', 1, en).head).toBe('10 damage · every 0.9 s');
    expect(D.describeWeapon('yanyue', 1, zh).scales).toBe('受近战、护甲加成');
  });

  it('items, skills, passives: every printed number is the def’s own', () => {
    const bad: string[] = [];
    for (const it of ITEM_REG) {
      const ok = numberForms([...flat(ITEMS[it.id]), ...GLOBAL]);
      for (const lang of [zh, en]) { const d = D.describeItem(it.id, lang); for (const s of [d.body, ...d.detail]) for (const n of numsIn(s)) if (!ok.has(n)) bad.push(`${it.id}: ${n} in ${s}`); }
    }
    for (const s of [...SKILL_REG, ...ALT_SKILL_REG]) {
      const ok = numberForms([...flat(SKILLS[s.id]), ...GLOBAL]);
      for (const lang of [zh, en]) { const d = D.describeSkill(s.id, lang); for (const x of [d.gist, d.body, ...d.detail]) for (const n of numsIn(x)) if (!ok.has(n)) bad.push(`${s.id}: ${n} in ${x}`); }
    }
    for (const p of PASSIVE_REG) {
      const ok = numberForms([...flat(PASSIVES[p.id]), ...flat(Object.values(SAY)), ...GLOBAL, 14, 11]);
      for (const lang of [zh, en]) { const d = D.describePassive(p.id, lang); for (const x of [d.gist, d.body, d.cost ?? '']) for (const n of numsIn(x)) if (!ok.has(n)) bad.push(`${p.id}: ${n} in ${x}`); }
    }
    expect(bad).toEqual([]);
    expect(D.describeItem('songzi', zh).body).toBe('气血 +4');
    expect(D.describeItem('tea', zh).detail[0]).toBe(`回血：${GLOSSARY.regen.plainZh}`); // the plain line explains the stat
    expect(D.describeItem('swordheart', zh).body).toContain('暴击倍数 +0.3'); // critDmg 30 read as +0.3
    expect(D.describeItem('cuthair', zh).body).toBe('伤害 +10%，气血 −2。劫数 +1。');
    expect(D.describeItem('cuthair', en).body).toBe('+10% Damage, −2 HP. Curse +1.');
  });

  it('节气 and 心镜 lines print only their data’s numbers', () => {
    for (const [id, v] of Object.entries(TERM_TEXT)) {
      const ok = numberForms(flat(TERM_MODS[id as 'lichun']).filter((_, i) => i > 0 || true));
      for (const s of v) for (const n of numsIn(s)) expect(ok.has(n) || n === '1', `${id}: ${n} in ${s}`).toBe(true);
    }
    for (const [id, v] of Object.entries(HEART_TEXT)) {
      const h = HEART[id as 'heartHp'];
      const ok = numberForms([...flat(h.per), ...flat(h.p ?? {})]);
      for (const s of v) for (const n of numsIn(s)) expect(ok.has(n) || n === '1', `${id}: ${n} in ${s}`).toBe(true);
    }
  });

  it('vows, mutators, hazards and deeds read their numbers from data', () => {
    expect(D.vowLine('qunmo', zh)).toBe('每层：每重多来 12% 的敌人');
    expect(D.vowLine('wusuo', en)).toBe('−25% pickup range');
    expect(D.mutatorLine('mochao', 45, zh)).toBe('敌人死后留下墨洼，踩进去慢 45%');
    expect(D.hazardTip('moonglow', zh)).toBe(`站进月光圈里：伤害 +${HAZARDS.moonglow.p.dmg}%，回血 +${HAZARDS.moonglow.p.regen}。`);
    expect(D.deedLine('flyingKills', zh)).toBe('飞剑累计打倒 1,000 个敌人');
    expect(lockHint('longquan', zh)?.how).toBe('用剑类兵器累计打倒 500 个敌人'); // was the English art note
    expect(D.diffLine(0, zh)).toContain('敌人气血 −30%、伤害 −40%');
  });

  it('set steps are generated from SETS: totals at each step, flags added', () => {
    expect(D.setSteps('sword', zh).map((x) => x.text)).toEqual(['暴击率 +5%', '暴击率共 +10%', '暴击率共 +15%，剑类刺击多刺中 1 个敌人']);
    expect(D.setSteps('music', zh)[2].text).toBe('乐器范围 +30%，迷惑几率翻倍');
    expect(D.setSteps('flying', en)[1].text).toBe('+5% Crit chance, +1 Extra sword');
  });
});

describe('mirror descriptions · engine numbers the text quotes', () => {
  it('K constants and flag numbers match the engine lines that use them', () => {
    const world = src('engine/world.ts'), weapons = src('engine/weapons.ts'), formulas = src('logic/formulas.ts');
    expect(world).toContain(`const dps = ${SAY.K.bleedDps} + ${SAY.K.bleedMelee} * Math.max(0, this.stats.melee)`);
    expect(weapons).toContain(`W.statusSlot(i, 'bleed', ${SAY.K.bleedDur}, 0,`);
    expect(world).toContain(`kind === 'goldShard' ? ${SAY.K.goldShard} :`);
    expect(weapons).toContain(`if (crit) W.statusSlot(e, 'burn', ${SAY.K.critBurnDur}, `);
    // FLAG_TEXT numbers
    const flag = (k: string) => D.FLAG_TEXT[k].zh;
    expect(weapons).toContain('dmgOf(W, s, sheet(W, s)) * 0.3'); expect(flag('idleSwords')).toContain('30%');
    expect(weapons).toContain(`flags.has('ink6') ? 1.2 : 1`); expect(flag('ink6')).toContain('20%');
    expect(weapons).toContain(`flags.has('goArea25') ? 25 : 0`); expect(flag('goArea25')).toContain('25%');
    expect(formulas).toContain(`includes('dodgeCap5')) cap += 5`); expect(flag('dodgeCap5')).toContain('+5');
    expect(src('engine/world.ts')).toContain(`flags.has('drainHalf') ? 0.5 : 1`);
    for (const n of [10, 20, 30]) { expect(weapons).toContain(`has('musicArea${n}')) a += ${n}`); expect(flag(`musicArea${n}`)).toContain(`+${n}%`); }
  });

  it('title thresholds match logic/meta.ts', () => {
    const meta = src('logic/meta.ts');
    const want: Record<string, RegExp> = {
      paintImmortal: /summonCap >= (\d+)\) title\('paintImmortal'\)/, swordImmortal: /swords >= (\d+)\) title\('swordImmortal'\)/,
      netAll: /peakNet \?\? 0\) >= (\d+)\) title\('netAll'\)/, mirrorMan: /W >= (\d+)\) title\('mirrorMan'\)/,
      migrant: /nSlips >= (\d+)\) title\('migrant'\)/, seasons: /nSlips >= (\d+)\) title\('seasons'\)/,
    };
    for (const [id, re] of Object.entries(want)) {
      const m = re.exec(meta);
      expect(m, id).not.toBeNull();
      expect(numsIn(D.titleLine(id as 'netAll', zh)), id).toContain(m![1]);
    }
  });

  it('every glossary brush glyph is in scripts/brush_chars.txt (the integrator rebuilds fonts)', () => {
    const brush = readFileSync(join(__dirname, '../scripts/brush_chars.txt'), 'utf8');
    const missing = Object.values(GLOSSARY).map((x) => x.icon).filter((c): c is string => !!c && !brush.includes(c));
    expect(missing).toEqual([]);
  });
});

describe('mirror descriptions · a readable snapshot', () => {
  it('every weapon at every tier, every item and every skill, in both languages', async () => {
    const out: string[] = [];
    for (const [lang, t] of [['zh', zh], ['en', en]] as const) {
      out.push(`## ${lang}`);
      for (const w of WEAPON_REG) for (const tier of TIERS) {
        const d = D.describeWeapon(w.id, tier, t);
        out.push(`${w.id} ${tier} | ${d.head} | ${d.scales} | ${d.body}${d.t4 ? ` | ${d.t4}` : ''}`);
      }
      for (const it of ITEM_REG) out.push(`${it.id} | ${D.describeItem(it.id, t).body}`);
      for (const s of [...SKILL_REG, ...ALT_SKILL_REG]) out.push(`${s.id} | ${D.describeSkill(s.id, t).body}`);
      for (const p of PASSIVE_REG) { const d = D.describePassive(p.id, t); out.push(`${p.id} | ${d.body} | ${d.cost ?? '-'}`); }
    }
    await expect(out.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/mirror-text.snap.txt');
  });
});

describe('mirror descriptions · words that stand for a number (mirror3 fix round)', () => {
  it('「每点护甲」 is only true while 铁骨 converts per 1 armour', () => {
    const fx = (ITEMS.ironbone.fx ?? [])[0] as { per?: number };
    expect(fx.per).toBe(1);
  });
});
