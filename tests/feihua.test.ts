import { describe, expect, it } from 'vitest';
import { POEMS } from '../src/data/poems';
import {
  CORPUS, LING, PLACES, PROSE_SOURCES, charsOf, clausesOf, computerLine, drawLing, fitsPlace, inCorpus, linesWith, makeRound,
  markAt, nextPlace, placesOf, splitOn, verdict,
} from '../src/views/games/feihua/logic';
import { makeRng } from '../src/core/rng';

const allText = POEMS.flatMap((p) => p.lines).join('\n');

describe('飞花令 corpus', () => {
  it('every clause is cut verbatim from a verified poem line', () => {
    expect(CORPUS.length).toBeGreaterThan(300);
    for (const c of CORPUS) {
      expect(c.poem.lines.some((l) => clausesOf(l).includes(c.text)), c.text).toBe(true);
      expect(allText.includes(c.text)).toBe(true);
      expect(c.text).not.toMatch(/[，。？！；：]/);
    }
  });

  it('is verse only: nothing from the prose sources (论语, 道德经, 劝学, 爱莲说 …)', () => {
    const prose = ['论语', '孔子家语', '道德经', '礼记', '劝学', '进学解', '爱莲说', '记承天寺夜游', '鹤林玉露'];
    for (const t of prose) expect(PROSE_SOURCES).toContain(t);
    for (const c of CORPUS) {
      expect(prose.some((t) => c.poem.title.startsWith(t)), `${c.text} — ${c.poem.title}`).toBe(false);
      expect(c.poem.author).not.toBe('荀子');
    }
    for (const bad of ['一日一钱', '千日一千', '与善人居', '何夜无月', '学而时习之', '水滴石穿', '久而不闻其香', '不以无人而不芳'])
      expect(inCorpus(bad), bad).toBe(false);
  });

  it('never breaks a line at 、 (so no fragments like 一任阶前)', () => {
    expect(inCorpus('一任阶前')).toBe(false);
    expect(inCorpus('一任阶前、点滴到天明')).toBe(true);
    expect(charsOf('一任阶前、点滴到天明').length).toBe(9);
    expect(placesOf('一任阶前、点滴到天明', '天')).toEqual([8]);
  });

  it('each 令字 has lines to play, and at least four different places', () => {
    for (const l of LING) {
      expect(linesWith(l.ch).length, l.ch).toBeGreaterThanOrEqual(7);
      const places = new Set(linesWith(l.ch).flatMap((c) => placesOf(c.text, l.ch)));
      expect(places.size, l.ch).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('飞花令 by place', () => {
  it('placesOf / fitsPlace / markAt count characters from 1', () => {
    expect(placesOf('人面桃花相映红', '花')).toEqual([4]);
    expect(fitsPlace('人面桃花相映红', '花', 4)).toBe(true);
    expect(fitsPlace('人面桃花相映红', '花', 1)).toBe(false);
    expect(placesOf('人人皆道', '人')).toEqual([1, 2]);
    expect(markAt('人面桃花相映红', 4)).toEqual([{ t: '人面桃', hit: false }, { t: '花', hit: true }, { t: '相映红', hit: false }]);
    expect(markAt('人人皆道', 2).filter((p) => p.hit).length).toBe(1);
  });

  it('nextPlace keeps the place when a fresh line fits it, else moves round the cycle', () => {
    const used = new Set<string>();
    const p = nextPlace('花', 1, used)!;
    expect(p).toBeGreaterThanOrEqual(1);
    expect(p).toBeLessThanOrEqual(PLACES);
    expect(linesWith('花').some((c) => fitsPlace(c.text, '花', p))).toBe(true);
    // with every line used, the order is spent
    expect(nextPlace('酒', 1, new Set(linesWith('酒').map((c) => c.text)))).toBeNull();
  });

  it('every round: exactly one right line, with the 令字 in place; decoys are real lines that are wrong', () => {
    const rng = makeRng(7);
    let withChar = 0, total = 0;
    for (const l of LING) {
      const used = new Set<string>();
      const shown = new Map<string, number>();
      let pos = 1;
      for (let turn = 0; turn < 60; turn++) {
        const p = nextPlace(l.ch, pos, used);
        if (p == null) break;
        const r = makeRound(l.ch, p, used, rng, shown)!;
        expect(r, `${l.ch}@${p}`).not.toBeNull();
        expect(r.pos).toBe(p);
        expect(r.options.length, l.ch).toBe(4);
        expect(new Set(r.options.map((o) => o.text)).size).toBe(4);
        expect(r.correct.length).toBe(1);
        for (const o of r.options) {
          expect(inCorpus(o.text), o.text).toBe(true);
          const v = verdict(l.ch, p, o.text, used);
          if (r.correct.includes(o.text)) {
            expect(fitsPlace(o.text, l.ch, p), o.text).toBe(true);
            expect(v).toBeNull();
          } else {
            expect(v === 'missing' || v === 'place' || v === 'repeat', `${l.ch}: ${o.text}`).toBe(true);
            total++;
            if (o.text.includes(l.ch)) withChar++;
          }
        }
        // the player takes the right line, the guest answers at the next place
        used.add(r.correct[0]);
        const gp = nextPlace(l.ch, (p % PLACES) + 1, used);
        if (gp == null) break;
        const c = computerLine(l.ch, gp, used, rng)!;
        expect(fitsPlace(c.text, l.ch, gp)).toBe(true);
        expect(used.has(c.text)).toBe(false);
        used.add(c.text);
        pos = (gp % PLACES) + 1;
      }
      // no decoy is offered again and again
      expect(Math.max(0, ...shown.values()), l.ch).toBeLessThanOrEqual(6);
    }
    // the character alone doesn't give the answer away: most decoys hold it too
    expect(withChar / total).toBeGreaterThan(0.6);
  });

  it('no round is offered once the 令字 is exhausted', () => {
    const used = new Set(linesWith('酒').map((c) => c.text));
    for (let p = 1; p <= PLACES; p++) {
      expect(makeRound('酒', p, used, makeRng(1))).toBeNull();
      expect(computerLine('酒', p, used, makeRng(1))).toBeNull();
    }
    expect(drawLing(['酒'], used, makeRng(2))).not.toBe('酒');
  });

  it('splitOn marks every occurrence of the 令字', () => {
    expect(splitOn('花落知多少', '花')).toEqual([{ t: '花', hit: true }, { t: '落知多少', hit: false }]);
    expect(splitOn('人面桃花相映红', '花').filter((p) => p.hit).length).toBe(1);
    expect(splitOn('日日新', '日').map((p) => p.t).join('')).toBe('日日新');
  });
});
