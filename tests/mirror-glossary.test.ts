// 水月幻镜 · the shared glossary (src/views/mirror/data/glossary.ts): one word per idea for the
// descriptions, the 人物 panel and the tutorial. Every stat, status and class has a label and a plain
// line; English carries no hanzi; lines fit the style guide's limits; the retired words stay retired;
// and every number a line quotes is the one the game uses.
import { describe, expect, it } from 'vitest';
import {
  clsKey, GLOSS_IDS, GLOSS_LIMITS, GLOSSARY, isGlossId, STAT_FMT, STAT_GROUPS, statGroupOf, termLine, termName, termOf,
  type GlossId, type Term,
} from '../src/views/mirror/data/glossary';
import { CLAMP, F, STAT_IDS, WCLASSES, WEAPONS } from '../src/views/mirror/data';
import { armorReduction } from '../src/views/mirror/logic';
import { PCT_STATS, tFor } from '../src/views/mirror/ui/text';
import type { StatusKind } from '../src/views/mirror/types';

const CJK = /[㐀-鿿]/;
const len = (s: string) => [...s].length;
const STATUS_KINDS: readonly StatusKind[] = ['burn', 'bleed', 'slow', 'root', 'stun', 'charm', 'shred', 'vuln', 'stagger'];
const entries = GLOSS_IDS.map((id) => [id, GLOSSARY[id]] as const);
const line = (id: GlossId) => GLOSSARY[id].plainZh;

/** The descriptions style guide's banned classical / machine words (d-text §2.4; d-tutorial §4.4). */
const BANNED: readonly RegExp[] = [
  /至多/, /皆/, /其/, /致(?!命)/, /若/, /即/, /于/, /毕/, /进行/, /使得/, /提升/, /所持/, /触发系数/, /重抽/, /精怪/,
  /之(?![后前间一])/, /(?<!或)者/, /(?<![可所])以(?![上下内后前])/,
];
/** Words the reconcile retired (renamed or merged); they must not come back through the glossary. */
const RETIRED: readonly RegExp[] = [
  /回气/, /五行/, /造化/, /身法/, /暴伤/, /(?<!治)疗效/, /(?<!飞)剑数/, /仙剑/, /重抽/, /精怪/, /劫火/, /灼烧/, /月盾/,
];

describe('mirror glossary · coverage', () => {
  it('has a stat entry with a brush icon for every StatId', () => {
    for (const id of STAT_IDS) {
      const x = GLOSSARY[id];
      expect(x, id).toBeDefined();
      expect(x.kind, id).toBe('stat');
      expect(x.icon, id).toBeDefined();
    }
    expect(entries.filter(([, x]) => x.kind === 'stat').length).toBe(STAT_IDS.length);
  });
  it('has an entry for every status effect and every weapon class', () => {
    for (const k of STATUS_KINDS) expect(GLOSSARY[k]?.kind, k).toBe('status');
    for (const c of WCLASSES) expect(GLOSSARY[clsKey(c)]?.kind, c).toBe('class');
  });
  it('fills every field of every entry', () => {
    for (const [id, x] of entries) {
      for (const f of ['zh', 'en', 'plainZh', 'plainEn'] as const) expect(x[f].trim().length, `${id}.${f}`).toBeGreaterThan(0);
      if (x.icon !== undefined) expect(len(x.icon), `${id}.icon`).toBe(1);
    }
  });
  it('gives every stat one display format and one panel group', () => {
    for (const id of STAT_IDS) expect(['pct', 'flat', 'mult'], id).toContain(STAT_FMT[id]);
    // the percent stats are the ones ui/text already prints with 「%」; 暴击倍数 reads as a multiplier
    expect(STAT_IDS.filter((id) => STAT_FMT[id] === 'pct').sort()).toEqual([...PCT_STATS].sort());
    expect(STAT_FMT.critDmg).toBe('mult');
    const seen = STAT_GROUPS.flatMap((gr) => gr.stats);
    expect([...seen].sort()).toEqual([...STAT_IDS].sort());
    expect(new Set(seen).size).toBe(seen.length);
    expect(STAT_GROUPS[0]).toMatchObject({ id: 'body', stats: ['hp', 'armor', 'dodge', 'speed'] });
    expect(statGroupOf('critDmg')).toBe('attack');
    for (const gr of STAT_GROUPS) {
      expect(CJK.test(gr.en) || CJK.test(gr.plainEn), gr.id).toBe(false);
      expect(len(gr.zh), gr.id).toBeLessThanOrEqual(GLOSS_LIMITS.label.zh);
      expect(len(gr.plainZh), gr.id).toBeLessThanOrEqual(GLOSS_LIMITS.stat.zh);
    }
  });
});

describe('mirror glossary · words', () => {
  it('keeps hanzi out of every English label and line', () => {
    const bad = entries.filter(([, x]) => CJK.test(x.en) || CJK.test(x.plainEn)).map(([id]) => id);
    expect(bad).toEqual([]);
  });
  it('writes Chinese in Chinese, as whole sentences', () => {
    for (const [id, x] of entries) {
      expect(x.zh, id).toMatch(CJK);
      expect(x.plainZh, id).toMatch(CJK);
      expect(x.plainZh, id).toMatch(/[。）]$/);
      expect(x.plainEn, id).toMatch(/[.)]$/);
    }
  });
  it('fits the style guide’s length limits', () => {
    const over: string[] = [];
    for (const [id, x] of entries) {
      if (len(x.zh) > GLOSS_LIMITS.label.zh) over.push(`${id}.zh ${len(x.zh)}`);
      if (len(x.en) > GLOSS_LIMITS.label.en) over.push(`${id}.en ${len(x.en)}`);
      const cap = x.kind === 'term' || x.kind === 'tier' ? GLOSS_LIMITS.term : GLOSS_LIMITS.stat;
      if (len(x.plainZh) > cap.zh) over.push(`${id}.plainZh ${len(x.plainZh)}/${cap.zh}`);
      if (len(x.plainEn) > cap.en) over.push(`${id}.plainEn ${len(x.plainEn)}/${cap.en}`);
    }
    expect(over).toEqual([]);
  });
  it('uses no banned classical or machine words, no `u` unit and no hidden mechanics', () => {
    const bad: string[] = [];
    for (const [id, x] of entries) {
      for (const re of BANNED) if (re.test(x.plainZh)) bad.push(`${id}: ${re} in ${x.plainZh}`);
      if (/\bu\b|u\/s/.test(x.plainEn) || /\bu\b/.test(x.plainZh)) bad.push(`${id}: bare u`);
      if (/proc/i.test(x.plainEn + x.plainZh)) bad.push(`${id}: procCoef`);
    }
    expect(bad).toEqual([]);
  });
  it('never brings back a retired word', () => {
    const bad: string[] = [];
    for (const [id, x] of entries) for (const re of RETIRED) if (re.test(x.zh) || re.test(x.plainZh)) bad.push(`${id}: ${re}`);
    expect(bad).toEqual([]);
  });
  it('pins the reconciled names (one word per idea on every screen)', () => {
    const want: Partial<Record<GlossId, [string, string]>> = {
      regen: ['回血', 'HP Regen'], elem: ['法术', 'Elemental'], spirit: ['造物', 'Craft'], speed: ['移速', 'Move speed'],
      crit: ['暴击率', 'Crit chance'], critDmg: ['暴击倍数', 'Crit multiplier'], pickup: ['拾取范围', 'Pickup range'],
      swords: ['飞剑数', 'Extra swords'], stones: ['棋子上限', 'Stone limit'], heal: ['治疗效果', 'Healing'], armor: ['护甲', 'Armour'],
      'cls:flying': ['飞剑', 'Flying sword'], 'cls:fortune': ['招财', 'Fortune'], burn: ['燃烧', 'Burn'],
      reroll: ['刷新', 'Reroll'], elite: ['精英', 'Elite'], heat: ['誓火', 'Heat'], panel: ['人物', 'Character'],
      crate: ['镜奁', 'Casket'], melt: ['换月华', 'Melt'], card: ['加成卡', 'Bonus card'], shield: ['护盾', 'Shield'],
    };
    for (const [id, [zh, en]] of Object.entries(want) as [GlossId, [string, string]][]) expect([GLOSSARY[id].zh, GLOSSARY[id].en], id).toEqual([zh, en]);
  });
  it('never gives two stats, statuses, classes or tiers the same label', () => {
    const named = entries.filter(([id, x]) => x.kind !== 'term' || /^tier\d$/.test(id));
    const zh = named.map(([, x]) => x.zh);
    const en = named.map(([, x]) => x.en.toLowerCase());
    expect(zh.filter((w, i) => zh.indexOf(w) !== i)).toEqual([]);
    expect(en.filter((w, i) => en.indexOf(w) !== i)).toEqual([]);
    const icons = entries.filter(([, x]) => x.kind === 'stat').map(([, x]) => x.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('mirror glossary · numbers come from the data', () => {
  it('quotes the formulas the game uses', () => {
    expect(line('regen')).toContain(`${F.regenPerPoint} 点血`);
    expect(line('armor')).toContain(`5 点少 ${armorReduction(5)}%`);
    expect(line('armor')).toContain(`15 点少 ${armorReduction(15)}%`);
    expect(GLOSSARY.armor.plainEn).toContain(`−${armorReduction(15)}%`);
    expect(line('dodge')).toContain(`${F.dodgeCap}%`);
    expect(line('speed')).toContain(`−${-CLAMP.speedMin}%`);
    expect(line('speed')).toContain(`+${CLAMP.speedMax}%`);
    expect(line('harvest')).toContain(`${Math.round((F.harvestGrow - 1) * 100)}%`);
    expect(line('curse')).toContain(`+${Math.round(F.curseEnemy * 100)}%`);
    expect(line('curse')).toContain(`+${F.curseDmg}%`);
    expect(line('curse')).toContain(`+${Math.round(F.curseMoon * 100)}%`);
    expect(line('summonCap')).toContain(`${CLAMP.summonCapMax}`);
    expect(line('stones')).toContain(`${CLAMP.stonesMax}`);
    expect(line('swords')).toContain(`${Math.round(F.swordExtra * 100)}%`);
    expect(line('knock')).toContain(`${Math.round((1 - F.resist.elite) * 100)}%`);
    expect(line('drunk')).toContain(`+${F.drunk.critPer10}%`);
    expect(line('drunk')).toContain(`+${F.drunk.critMax}%`);
    expect(line('drunk')).toContain(`${F.drunk.cap}`);
    expect(F.sellFrac === 0.25 ? line('sell') : '四分之一').toContain('四分之一');
  });
  it('quotes the weapons’ real crit multiplier range', () => {
    const xs = Object.values(WEAPONS).map((w) => w.critX).filter((x) => x > 0);
    expect(line('critDmg')).toContain(`${Math.min(...xs)}～${Math.max(...xs)} 倍`);
  });
  it('types no digit a data constant could change, outside the lines that read them', () => {
    // a digit in a line is either read from data (checked above) or a fixed rule of the code
    const fixed: Partial<Record<GlossId, true>> = {
      hp: true, level: true, steal: true, aspd: true, regen: true, armor: true, dodge: true, speed: true, harvest: true, curse: true,
      summonCap: true, swords: true, stones: true, knock: true, critDmg: true, drunk: true, lives: true, store: true, boss: true,
      set: true, clear: true,
    };
    const loose = entries.filter(([id, x]) => /\d/.test(x.plainZh) && !fixed[id]).map(([id]) => id);
    expect(loose).toEqual([]);
  });
});

describe('mirror glossary · lookups', () => {
  it('looks a term up in either language', () => {
    const zh = tFor('zh'), en = tFor('en');
    expect(termOf('reroll')).toBe(GLOSSARY.reroll);
    expect(termName('reroll', zh)).toBe('刷新');
    expect(termName('reroll', en)).toBe('Reroll');
    expect(termLine('hp', en)).toBe(GLOSSARY.hp.plainEn);
    expect(termName(clsKey('flying'), zh)).toBe('飞剑');
  });
  it('tells a key from any other string, and never throws on one it does not know', () => {
    expect(isGlossId('armor')).toBe(true);
    expect(isGlossId('cls:moon')).toBe(true);
    expect(isGlossId('toString')).toBe(false);
    const x: Term = termOf('nope' as GlossId);
    expect(x.zh).toBe('nope');
  });
});
