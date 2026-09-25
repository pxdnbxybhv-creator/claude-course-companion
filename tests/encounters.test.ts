// 奇遇 trigger logic: the day's roll is deterministic, the chance rises for each day an encounter was
// due and did not happen (so each can be found within a few days of trying), the right companion
// gets their own version, rumours are told once a day, and the memory survives bad data.
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS, ENCOUNTER } from '../src/data/encounters';
import { CHARACTERS } from '../src/data/characters';
import {
  AGAIN, RULES, RUMOURS, chance, dayRoll, doneToday, emptyMemory, happensToday, misses, noteDone, noteMiss,
  noteRumour, rumourDue, rumourFor, sanitizeMemory, variantFor, type Moment,
} from '../src/views/walk/features/encounters/logic';
import { SCENES } from '../src/views/walk/features/encounters/scenes';

const base: Moment = { day: '2026-09-25', tod: 'day', hour: 11, night: false, season: 'autumn', moon: 0.3, region: 'bamboo', who: 'scholar', festivals: [] };
const at = (o: Partial<Moment>): Moment => ({ ...base, ...o });

/** A place and time where each encounter can happen. */
const RIGHT: Record<string, Partial<Moment>> = {
  zhiyin: { region: 'bamboo' },
  lanke: { region: 'plum', tod: 'dusk', hour: 18 },
  laoyue: { region: 'lake', tod: 'night', hour: 21.5, night: true },
  hujie: { region: 'bamboo', tod: 'night', hour: 21.5, night: true },
  xianhe: { region: 'plum', tod: 'dawn', hour: 6.5 },
  liuxing: { region: 'garden', tod: 'night', hour: 21.5, night: true },
  shijin: { region: 'village' },
  hudie: { region: 'garden', hour: 14 },
  kezhou: { region: 'village' },
  taohua: { region: 'mountain' },
  zuixian: { region: 'village', tod: 'night', hour: 21.5, night: true },
  mutong: { region: null },
  hanshan: { region: 'mountain' },
  yuelao: { region: 'lake', tod: 'night', hour: 21.5, night: true },
};

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

describe('encounter rules', () => {
  it('cover every encounter, with a scene, a rumour and a place and time', () => {
    for (const e of ENCOUNTERS) {
      expect(RULES[e.id], e.id).toBeTruthy();
      expect(SCENES[e.id], e.id).toBeTypeOf('function');
      expect(RUMOURS[e.id]?.zh, e.id).toBeTruthy();
      expect(RULES[e.id].when(at(RIGHT[e.id])), e.id).toBe(true);
      // every special companion is a real one
      for (const c of e.special) expect(CHARACTERS.some((x) => x.id === c), `${e.id}:${c}`).toBe(true);
    }
  });

  it('keep to their place and hour', () => {
    expect(RULES.zhiyin.when(at({ region: 'lake' }))).toBe(false);
    expect(RULES.hujie.when(at({ region: 'bamboo' }))).toBe(false); // by day: no
    expect(RULES.laoyue.when(at({ region: 'lake' }))).toBe(false);
    expect(RULES.xianhe.when(at({ region: 'plum', hour: 15 }))).toBe(false); // mornings only
    expect(RULES.hudie.when(at({ region: 'garden', tod: 'dawn', hour: 7 }))).toBe(false);
    expect(RULES.mutong.when(at({ region: 'home' }))).toBe(false);
    expect(RULES.mutong.when(at({ region: 'garden' }))).toBe(false);
    expect(RULES.liuxing.when(at({ night: false }))).toBe(false);
    // the time switch pins 昼 to 11:00 and 夜 to 21:30: both halves of the day stay reachable
    expect(RULES.xianhe.when(at({ region: 'plum', hour: 11 }))).toBe(true);
    expect(RULES.hudie.when(at({ region: 'garden', hour: 11 }))).toBe(true);
  });
});

describe('the daily chance', () => {
  it('is deterministic per day and differs across days', () => {
    expect(dayRoll('2026-09-25', 'zhiyin')).toBe(dayRoll('2026-09-25', 'zhiyin'));
    const rolls = new Set(Array.from({ length: 30 }, (_, i) => dayRoll(addDays('2026-09-01', i), 'zhiyin').toFixed(6)));
    expect(rolls.size).toBeGreaterThan(25);
    for (let i = 0; i < 30; i++) {
      const r = dayRoll(addDays('2026-09-01', i), 'lanke');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
    // same day, same answer however often you ask
    const m = at({ ...RIGHT.shijin, day: '2026-10-02' });
    const first = happensToday('shijin', m, 0, false, false);
    for (let i = 0; i < 5; i++) expect(happensToday('shijin', m, 0, false, false)).toBe(first);
  });

  it('rises for every day it was due and did not happen', () => {
    const m = at(RIGHT.hanshan);
    let prev = -1;
    for (let n = 0; n < 6; n++) {
      const c = chance('hanshan', m, n, false, false);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
    expect(chance('hanshan', m, 0, false, false)).toBeLessThan(chance('hanshan', m, 1, false, false));
    expect(chance('hanshan', m, 10, false, false)).toBe(1);
  });

  it('lets every encounter be found within a few days of trying', () => {
    for (const e of ENCOUNTERS) {
      // over many starting days: go to the right place at the right time daily, count the tries
      let worst = 0;
      for (let s = 0; s < 60; s++) {
        let mem = emptyMemory();
        let day = addDays('2026-01-01', s * 5);
        let tries = 0;
        for (;;) {
          tries++;
          const m = at({ ...RIGHT[e.id], day });
          if (happensToday(e.id, m, misses(mem, e.id), false, false)) break;
          mem = noteMiss(mem, e.id, day);
          day = addDays(day, 1);
          if (tries > 10) break;
        }
        worst = Math.max(worst, tries);
      }
      expect(worst, e.id).toBeLessThanOrEqual(5);
    }
  });

  it('counts a miss once a day, and starts over when it happens', () => {
    let mem = emptyMemory();
    mem = noteMiss(mem, 'zhiyin', '2026-09-01');
    mem = noteMiss(mem, 'zhiyin', '2026-09-01');
    expect(misses(mem, 'zhiyin')).toBe(1);
    mem = noteMiss(mem, 'zhiyin', '2026-09-02');
    expect(misses(mem, 'zhiyin')).toBe(2);
    mem = noteDone(mem, 'zhiyin', '2026-09-03');
    expect(misses(mem, 'zhiyin')).toBe(0);
    expect(doneToday(mem, 'zhiyin', '2026-09-03')).toBe(true);
    expect(doneToday(mem, 'zhiyin', '2026-09-04')).toBe(false);
  });

  it('comes back less often once met — more readily for a companion with a version of their own', () => {
    const m = at(RIGHT.laoyue);
    expect(chance('laoyue', m, 0, true, false)).toBeLessThan(chance('laoyue', m, 0, false, false));
    expect(chance('laoyue', m, 0, true, false)).toBeGreaterThanOrEqual(AGAIN);
    expect(chance('laoyue', m, 0, true, true)).toBeGreaterThan(chance('laoyue', m, 0, true, false));
  });

  it('is more likely with the right companion, season or festival', () => {
    const plain = at(RIGHT.zhiyin);
    expect(chance('zhiyin', { ...plain, who: 'musician' }, 0, false, false)).toBeGreaterThan(chance('zhiyin', plain, 0, false, false));
    expect(chance('taohua', { ...at(RIGHT.taohua), season: 'spring' }, 0, false, false)).toBeGreaterThan(chance('taohua', at(RIGHT.taohua), 0, false, false));
    expect(chance('yuelao', { ...at(RIGHT.yuelao), festivals: ['qixi'] }, 0, false, false)).toBe(1);
  });
});

describe('who gets their own version', () => {
  it('is the walker when they are one of the special companions, else nobody', () => {
    expect(variantFor(ENCOUNTER.shijin, 'guan')).toBe('guan');
    expect(variantFor(ENCOUNTER.lanke, 'cat')).toBe('cat');
    expect(variantFor(ENCOUNTER.hujie, 'taoist')).toBe('taoist');
    expect(variantFor(ENCOUNTER.zhiyin, 'musician')).toBe('musician');
    expect(variantFor(ENCOUNTER.laoyue, 'change')).toBe('change');
    expect(variantFor(ENCOUNTER.shijin, 'scholar')).toBeNull();
    expect(variantFor(ENCOUNTER.taohua, 'cat')).toBeNull();
  });
});

describe('rumours', () => {
  it('are told once a day each, only for unmet encounters at the right place and hour', () => {
    let mem = emptyMemory();
    const m = at({ region: 'bamboo', tod: 'night', hour: 21.5, night: true });
    const d = rumourFor(ENCOUNTERS, m, mem, () => false);
    expect(d?.id).toBe('hujie');
    mem = noteRumour(mem, 'hujie', m.day);
    expect(rumourDue(mem, 'hujie', m.day)).toBe(false);
    // the next one due here tonight is the falling star (anywhere at night)
    expect(rumourFor(ENCOUNTERS, m, mem, () => false)?.id).toBe('liuxing');
    mem = noteRumour(mem, 'liuxing', m.day);
    expect(rumourFor(ENCOUNTERS, m, mem, () => false)).toBeNull();
    // a new day, a new rumour
    expect(rumourFor(ENCOUNTERS, { ...m, day: addDays(m.day, 1) }, mem, () => false)?.id).toBe('hujie');
    // met ones are not rumoured
    expect(rumourFor(ENCOUNTERS, { ...m, day: addDays(m.day, 1) }, mem, (id) => id === 'hujie')?.id).toBe('liuxing');
    // nothing is rumoured on the road (no place to arrive at)
    expect(rumourFor(ENCOUNTERS, { ...m, region: null }, emptyMemory(), () => false)).toBeNull();
  });
});

describe('memory', () => {
  it('survives junk', () => {
    expect(sanitizeMemory(null)).toEqual(emptyMemory());
    expect(sanitizeMemory('x')).toEqual(emptyMemory());
    const m = sanitizeMemory({ miss: { a: { n: 3, day: '2026-09-01' }, b: { n: -1, day: 'x' }, c: 5 }, rumour: { a: '2026-09-01', b: 7 }, done: 'no', later: { fox: '2026-09-02' } });
    expect(m.miss).toEqual({ a: { n: 3, day: '2026-09-01' } });
    expect(m.rumour).toEqual({ a: '2026-09-01' });
    expect(m.done).toEqual({});
    expect(m.later).toEqual({ fox: '2026-09-02' });
  });
});
