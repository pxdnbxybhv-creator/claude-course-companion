import { describe, expect, it } from 'vitest';
import { TERMS, termText, pentadText, PENTAD_LABELS } from '../src/data/terms';
import { POEMS, pickPoem, poemsFor, attributionZh, type PoemTheme, type Season } from '../src/data/poems';
import { YI, JI, almanacFor, topicsOf, type AlmanacItem } from '../src/data/almanac';
import { PLANT_KINDS } from '../src/core/types';

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const THEMES: PoemTheme[] = ['diligence', 'focus', 'night', 'morning', 'rain', 'snow', 'moon', 'garden', 'water', 'friendship', 'time'];
const seasonOfTerm = (i: number): Season => SEASONS[Math.floor(i / 6)];
const chars = (s: string) => Array.from(s).length;

describe('solar terms & pentads', () => {
  it('has the 24 terms in order, starting at 立春', () => {
    expect(TERMS).toHaveLength(24);
    expect(TERMS.map((t) => t.zh).join('')).toBe(
      '立春雨水惊蛰春分清明谷雨立夏小满芒种夏至小暑大暑立秋处暑白露秋分寒露霜降立冬小雪大雪冬至小寒大寒');
    expect(TERMS[0].en).toBe('Start of Spring');
    expect(TERMS[4].en).toBe('Clear and Bright');
  });

  it('every term has pinyin with tone marks, names and blurbs', () => {
    for (const t of TERMS) {
      expect(t.pinyin).toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
      expect(t.pinyin).toMatch(/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$/);
      expect(t.en.length).toBeGreaterThan(3);
      expect(chars(t.blurbZh)).toBeGreaterThan(5);
      expect(chars(t.blurbZh)).toBeLessThanOrEqual(28);
      expect(t.blurbEn.length).toBeGreaterThan(10);
    }
  });

  it('has 24 × 3 non-empty, distinct pentads', () => {
    const all = TERMS.flatMap((t) => t.pentads);
    expect(all).toHaveLength(72);
    for (const t of TERMS) expect(t.pentads).toHaveLength(3);
    for (const p of all) {
      expect(p.zh.trim()).not.toBe('');
      expect(p.en.trim()).not.toBe('');
      expect(p.zh).toMatch(/^[㐀-鿿]+$/);
    }
    expect(new Set(all.map((p) => p.zh)).size).toBe(72);
  });

  it('uses the standard wording (spot checks)', () => {
    expect(TERMS[0].pentads.map((p) => p.zh)).toEqual(['东风解冻', '蛰虫始振', '鱼陟负冰']);
    expect(TERMS[15].pentads.map((p) => p.zh)).toEqual(['雷始收声', '蛰虫坯户', '水始涸']);
    expect(TERMS[18].pentads[0].zh).toBe('水始冰');
    expect(TERMS[21].pentads[1].zh).toBe('麋角解');
    expect(TERMS[23].pentads.map((p) => p.zh)).toEqual(['鸡乳', '征鸟厉疾', '水泽腹坚']);
  });

  it('helpers wrap and clamp', () => {
    expect(termText(-1).zh).toBe('大寒');
    expect(termText(24).zh).toBe('立春');
    expect(pentadText(0, 2).zh).toBe('鱼陟负冰');
    expect(pentadText(0, 9).zh).toBe('鱼陟负冰');
    expect(PENTAD_LABELS.map((l) => l.zh)).toEqual(['初候', '二候', '三候']);
  });
});

describe('poems', () => {
  it('keeps 观书有感 as entry 0', () => {
    expect(POEMS[0].title).toBe('观书有感');
    expect(POEMS[0].lines[0]).toBe('半亩方塘一鉴开，天光云影共徘徊。');
  });

  it('has 80–120 complete entries', () => {
    expect(POEMS.length).toBeGreaterThanOrEqual(80);
    expect(POEMS.length).toBeLessThanOrEqual(120);
    for (const p of POEMS) {
      expect(p.lines.length).toBeGreaterThanOrEqual(1);
      expect(p.lines.length).toBeLessThanOrEqual(2);
      for (const l of p.lines) {
        expect(l.trim()).toBe(l);
        expect(l).not.toBe('');
        expect(l).not.toMatch(/[,.;:?!'"()A-Za-z0-9]/); // full-width punctuation only
        expect(l).toMatch(/[。？！]$/);
      }
      for (const f of [p.author, p.dynasty, p.title, p.en, p.authorEn]) expect(f.trim()).not.toBe('');
    }
  });

  it('has no duplicate quotations and only valid tags', () => {
    expect(new Set(POEMS.map((p) => p.lines.join(''))).size).toBe(POEMS.length);
    for (const p of POEMS) {
      for (const t of p.terms ?? []) expect(t >= 0 && t < 24 && Number.isInteger(t)).toBe(true);
      for (const k of p.plants ?? []) expect(PLANT_KINDS).toContain(k);
      for (const s of p.seasons ?? []) expect(SEASONS).toContain(s);
      for (const th of p.themes ?? []) expect(THEMES).toContain(th);
    }
  });

  it('covers every plant (≥ 8), every term, season and theme', () => {
    for (const k of PLANT_KINDS) expect(poemsFor({ plant: k }).length, k).toBeGreaterThanOrEqual(8);
    for (let t = 0; t < 24; t++) expect(poemsFor({ term: t }).length, TERMS[t].zh).toBeGreaterThanOrEqual(1);
    for (const s of SEASONS) expect(poemsFor({ season: s }).length, s).toBeGreaterThanOrEqual(5);
    for (const th of THEMES) expect(poemsFor({ theme: th }).length, th).toBeGreaterThanOrEqual(5);
    expect(poemsFor({ theme: 'diligence' }).length).toBeGreaterThanOrEqual(12);
    expect(poemsFor({ theme: 'focus' }).length).toBeGreaterThanOrEqual(12);
  });

  it('pickPoem is deterministic, prefers plant then term, and always returns', () => {
    const salts = [0, 1, 7, 12345, -3, 2 ** 31 + 5, 0.5];
    for (const salt of salts) {
      expect(POEMS).toContain(pickPoem({ salt }));
      for (const plant of PLANT_KINDS) {
        const a = pickPoem({ plant, salt });
        expect(a).toBe(pickPoem({ plant, salt }));
        expect(a.plants).toContain(plant);
        for (let term = 0; term < 24; term += 5) {
          const b = pickPoem({ plant, term, theme: 'diligence', salt });
          expect(POEMS).toContain(b);
          expect(b.plants).toContain(plant);
        }
      }
      for (let term = 0; term < 24; term++) {
        const c = pickPoem({ term, salt });
        expect(c.terms).toContain(term);
        expect(pickPoem({ term, theme: 'moon', salt })).toBe(pickPoem({ term, theme: 'moon', salt }));
      }
      for (const theme of THEMES) expect(pickPoem({ theme, salt }).themes).toContain(theme);
    }
    // salt rotates among matches
    const picks = new Set(Array.from({ length: 20 }, (_, i) => pickPoem({ plant: 'bamboo', salt: i })));
    expect(picks.size).toBeGreaterThan(3);
  });

  it('formats a Chinese attribution', () => {
    expect(attributionZh(POEMS[0])).toBe('〔宋〕朱熹《观书有感》');
  });
});

describe('almanac', () => {
  const byZh = new Map<string, AlmanacItem>();
  for (const it of [...YI, ...JI]) byZh.set(it.zh, it);

  it('has enough, well-formed items', () => {
    expect(YI.length).toBeGreaterThanOrEqual(90);
    expect(JI.length).toBeGreaterThanOrEqual(60);
    for (const it of [...YI, ...JI]) {
      expect(chars(it.zh), it.zh).toBeGreaterThanOrEqual(2);
      expect(chars(it.zh), it.zh).toBeLessThanOrEqual(6);
      expect(it.en.trim()).not.toBe('');
      expect(it.topic).not.toBe('');
    }
    const yiZh = new Set(YI.map((x) => x.zh));
    expect(yiZh.size).toBe(YI.length);
    expect(new Set(JI.map((x) => x.zh)).size).toBe(JI.length);
    for (const j of JI) expect(yiZh.has(j.zh), j.zh).toBe(false);
    // Every term has at least one custom of its own among the 宜.
    const tagged = new Set(YI.flatMap((x) => x.terms ?? []));
    expect(tagged.size).toBe(24);
  });

  it('is deterministic and well-behaved over two years of days', () => {
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 730; d++) {
      const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
      const term = Math.floor(d / 15.2) % 24;
      const day = almanacFor(date, term);
      expect(almanacFor(date, term)).toEqual(day);
      expect(day.yi.length).toBeGreaterThanOrEqual(3);
      expect(day.yi.length).toBeLessThanOrEqual(4);
      expect(day.ji.length).toBeGreaterThanOrEqual(2);
      expect(day.ji.length).toBeLessThanOrEqual(3);
      const all = [...day.yi, ...day.ji];
      expect(new Set(all.map((x) => x.zh)).size).toBe(all.length);
      // No contradictions: no topic shared by any two items of the day.
      const topics = all.flatMap((x) => topicsOf(byZh.get(x.zh)!));
      expect(new Set(topics).size, `${date}: ${all.map((x) => x.zh).join(' ')}`).toBe(topics.length);
      // Season-appropriate.
      for (const x of all) {
        const it = byZh.get(x.zh)!;
        const ok = it.terms ? it.terms.includes(term) : !it.seasons || it.seasons.includes(seasonOfTerm(term));
        expect(ok, `${x.zh} on term ${term}`).toBe(true);
      }
    }
  });

  it('varies from day to day and features the term', () => {
    const days = Array.from({ length: 15 }, (_, i) => almanacFor(`2026-04-${String(5 + i).padStart(2, '0')}`, 4));
    expect(new Set(days.map((d) => d.yi.map((x) => x.zh).join())).size).toBeGreaterThan(10);
    const qingming = days.filter((d) => d.yi.some((x) => ['踏青', '插柳', '追思先人'].includes(x.zh)));
    expect(qingming.length).toBeGreaterThan(8);
  });
});
