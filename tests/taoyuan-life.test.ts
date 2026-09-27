// 桃源 · 二期「常住」: the life layer's contracts (spec §8, L). The gate, the way back, the saved keys, the
// goods in kind, the one idempotent restore — and the owner's code opening none of it; then the board,
// the hours of 歇一歇, the festival override, the quest rows, the absence letter, the echoes and the lines.
import { beforeEach, describe, expect, it } from 'vitest';
import { play, emptyPlay, redeemCode, _acceptCodeForTests } from '../src/app/play';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import { BEATS, beatFlag, phaseOf, type Beat } from '../src/views/walk/features/taoyuan/text';
import { canTravelToValley, lifeOpen } from '../src/views/walk/features/taoyuan/life/gate';
import {
  APPETITE, DISH_IDS, GAME_IDS, KIND_IDS, LIFE_PREFIX, SEASON_DISHES, SONG_IDS, STOCK_CAP, YEAR_DISHES, ZHIWEI_TARGET,
  GUI_GOT, GUI_USED, allLifeKeys, dailyCount, gotKey, guiHeld, keptOf, stockFrom, usedKey, withKey,
} from '../src/views/walk/features/taoyuan/life/keys';
import { makeRestorer, restoreTargetOf } from '../src/views/walk/features/taoyuan/life/restore';
import type { WorldCtx } from '../src/views/walk/types';

type Flags = Record<string, true>;
const F = (...keys: string[]): Flags => Object.fromEntries(keys.map((k) => [k, true as const]));
const beats = (...bs: Beat[]) => bs.map(beatFlag);
const WHO = CHARACTERS.map((c) => c.id) as CharacterId[];

/** After B8 on the judged path, and on the parked path. */
const SOLVED = F(...beats(...BEATS), 'case:hz:open', 'case:hz:solved');
const PARKED = F(...beats('b1', 'b2', 'b3', 'b4a', 'b4b', 'b4c', 'b5', 'b7', 'b8'), 'case:hz:parked');

describe('the gate', () => {
  it('is shut in every phase before 常', () => {
    for (let i = 0; i < BEATS.length; i++) {
      const f = F(...beats(...BEATS.slice(0, i)));
      if (phaseOf(f) === 'chang') continue;
      expect(lifeOpen(f, false), BEATS[i]).toBe(false);
    }
    expect(lifeOpen({}, false)).toBe(false);
  });
  it('opens after the story, judged or parked, and shuts while a beat runs', () => {
    expect(phaseOf(SOLVED)).toBe('chang');
    expect(lifeOpen(SOLVED, false)).toBe(true);
    expect(phaseOf(PARKED)).toBe('chang');
    expect(lifeOpen(PARKED, false)).toBe(true);
    expect(lifeOpen(SOLVED, true)).toBe(false);
    expect(lifeOpen(PARKED, true)).toBe(false);
  });
  it('shuts while the parked case is taken up again', () => {
    expect(lifeOpen({ ...PARKED, 'case:hz:open': true }, false)).toBe(false);
  });
  it('lets travel reach the valley only with the petal (ty:way)', () => {
    expect(canTravelToValley({})).toBe(false);
    expect(canTravelToValley(SOLVED)).toBe(false);
    expect(canTravelToValley({ ...SOLVED, 'ty:way': true })).toBe(true);
  });
});

describe('the saved keys', () => {
  it('are all under tyl:, unique, and at most 64 characters', () => {
    const keys = allLifeKeys(WHO);
    expect(WHO.length).toBe(13);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(k.startsWith(LIFE_PREFIX), k).toBe(true);
      expect(k.startsWith('ty:'), k).toBe(false);
      expect(k.length, k).toBeLessThanOrEqual(64);
    }
    // (the longest: tyl:with:tangbing:swordsman)
    expect(Math.max(...keys.map((k) => k.length))).toBe(withKey('tangbing', 'swordsman').length);
  });
  it('name 17 dishes (13 and 4 seasonal), 6 goods, 6 games, 5 号子', () => {
    expect(DISH_IDS.length).toBe(17);
    expect(YEAR_DISHES.length).toBe(13);
    expect(SEASON_DISHES.every((d) => d.startsWith('s-'))).toBe(true);
    expect(KIND_IDS.length).toBe(6);
    expect(GAME_IDS.length).toBe(6);
    expect(SONG_IDS.length).toBe(5);
    // 知味: the year-round dishes without 桃花茶
    expect(YEAR_DISHES.filter((d) => d !== 'taocha').length).toBe(ZHIWEI_TARGET);
    expect(APPETITE).toBe(8);
  });
});

describe('the goods in kind', () => {
  it('are got − used, never above the cap, and a grant beyond it is lost', () => {
    expect(STOCK_CAP).toBe(6);
    expect(stockFrom({}, 'yu')).toBe(0);
    expect(stockFrom({ [gotKey('yu')]: 5, [usedKey('yu')]: 2 }, 'yu')).toBe(3);
    expect(keptOf({ [gotKey('yu')]: 5, [usedKey('yu')]: 2 }, 'yu', 2)).toBe(2);
    expect(keptOf({ [gotKey('yu')]: 5, [usedKey('yu')]: 2 }, 'yu', 9)).toBe(3);
    expect(keptOf({ [gotKey('dan')]: 6 }, 'dan', 1)).toBe(0);
    expect(keptOf({}, 'dan', -2)).toBe(0);
    // a broken save never shows more than the jar holds, or less than nothing
    expect(stockFrom({ [gotKey('qu')]: 40 }, 'qu')).toBe(6);
    expect(stockFrom({ [usedKey('qu')]: 3 }, 'qu')).toBe(0);
  });
  it('keeps a 鳜 in the jar only while a 鱼 is held and it is not yet gone', () => {
    expect(guiHeld({})).toBe(false);
    expect(guiHeld({ [GUI_GOT]: 1, [gotKey('yu')]: 2 })).toBe(true);
    expect(guiHeld({ [GUI_GOT]: 1, [GUI_USED]: 1, [gotKey('yu')]: 2 })).toBe(false);
    expect(guiHeld({ [GUI_GOT]: 1, [gotKey('yu')]: 2, [usedKey('yu')]: 2 })).toBe(false);
    expect(allLifeKeys([])).toEqual(expect.arrayContaining([GUI_GOT, GUI_USED]));
  });
  it('reads daily counts only on their own day', () => {
    expect(dailyCount({ day: '2026-09-27', counts: { 'tyl:belly': 4 } }, '2026-09-27', 'tyl:belly')).toBe(4);
    expect(dailyCount({ day: '2026-09-26', counts: { 'tyl:belly': 4 } }, '2026-09-27', 'tyl:belly')).toBe(0);
  });
});

describe('the one restore', () => {
  it('puts everything back once, and a second call does nothing', () => {
    const log: string[] = [];
    const fake = {
      setTimeScale: (f: number) => log.push(`ts ${f}`),
      player: { holdProp: (p: string | null) => { log.push(`hold ${p}`); return null; }, freeze: (on: boolean) => log.push(`freeze ${on}`) },
      lens: (f: number | null) => log.push(`lens ${f}`),
      endCinematic: () => log.push('endCinematic'),
      sky: {},
      camera: {},
    } as unknown as WorldCtx;
    const focus: { at: unknown } = { at: { x: 1, y: 2, z: 3 } };
    const placed: string[] = [];
    const r = makeRestorer(restoreTargetOf(fake, focus, (k) => ({ place: (at: null) => void placed.push(`${k} ${at}`) })));
    let undone = 0;
    r.restore();
    expect(log).toEqual([]);
    r.arm();
    r.borrowed('duer');
    r.defer(() => undone++);
    r.restore();
    expect(log).toEqual(expect.arrayContaining(['ts 1', 'lens null', 'hold null', 'freeze false', 'endCinematic']));
    expect(focus.at).toBeNull();
    expect(placed).toEqual(['duer null']);
    expect(undone).toBe(1);
    const n = log.length;
    r.restore();
    expect(log.length).toBe(n);
    expect(undone).toBe(1);
  });
});

describe("the owner's code", () => {
  beforeEach(() => { play.value = emptyPlay(); });
  it('writes no life key and opens no way to the valley', () => {
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
    const p = play.value;
    for (const k of [...Object.keys(p.flags), ...Object.keys(p.counters), ...Object.keys(p.best)]) expect(k.startsWith(LIFE_PREFIX), k).toBe(false);
    expect(lifeOpen(p.flags, false)).toBe(false);
    expect(canTravelToValley(p.flags)).toBe(false);
  });
});

// ───────────────────────────── phase 1–3 (L): the board, 歇一歇, the festival, the quests, the letter

import { FESTIVALS } from '../src/views/walk/features/calendar';
import { partOf } from '../src/views/walk/features/taoyuan/folk';
import { QUESTS } from '../src/data/quests';
import { TAOYUAN_LETTERS } from '../src/views/walk/features/taoyuan/letters';
import {
  CUP_GUESTS, KING_CODES, NEXT_PART, REST_HOURS, SEASON_DISH, SONG_NAMES, boardFor, cnThousands, festivalChoices, festivalDish,
  newsOf, petalsOfDay, seatsOfDay, songOfDay, yueFor, yueOfDay,
} from '../src/views/walk/features/taoyuan/life/daily';
import { EAT_PREFIX, SEAL_PREFIX, SEASON_EAT_PREFIX, BACK, LAST_DAY, dayNumber, eatKey } from '../src/views/walk/features/taoyuan/life/keys';
import { NEWS, GEGU_LINES, SHIGU_DISH, SHIGU_GAME, FIRST_RETURN } from '../src/views/walk/features/taoyuan/life/life-text';
import * as LIFE_TEXT from '../src/views/walk/features/taoyuan/life/life-text';
import { moodOfTaste, shiguEcho } from '../src/views/walk/features/taoyuan/life/moods';
import { partsAhead } from '../src/views/walk/features/taoyuan/life/rest';
import type { Part } from '../src/views/walk/features/taoyuan/life/types';

const DAYS = ['2026-01-01', '2026-02-17', '2026-04-05', '2026-06-19', '2026-09-25', '2026-09-27', '2026-12-21', '2027-03-03'];

describe('今日谷中 (the board)', () => {
  it('is the same all day, and names the day’s picks', () => {
    for (const day of DAYS) {
      const a = boardFor(day, { season: 'autumn', dishName: { zh: '桂花糖芋', en: 'Taro' } });
      const b = boardFor(day, { season: 'autumn', dishName: { zh: '桂花糖芋', en: 'Taro' } });
      expect(a).toEqual(b);
      const all = a.rows.map((r) => r.zh).join('\n');
      expect(all).toContain(`《${SONG_NAMES[songOfDay(day)].zh}》`);
      expect(all).toContain(yueFor(day).line.zh);
      expect(all).toContain(KING_CODES[a.picks.king].zh);
      for (const k of a.picks.seats) expect(CUP_GUESTS).toContain(k);
      expect(new Set(a.picks.seats).size).toBe(5);
      expect(a.picks.seats).toEqual(seatsOfDay(day));
      expect(a.title.zh.startsWith('今日谷中 · ')).toBe(true);
      expect(all).toContain('桂花糖芋（暮，长桌）');
    }
  });
  it('gives 葛姑 4000–4299 petals, written in Chinese numerals', () => {
    for (let i = 0; i < 400; i++) {
      const d = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      const n = petalsOfDay(d);
      expect(n).toBeGreaterThanOrEqual(4000);
      expect(n).toBeLessThanOrEqual(4299);
    }
    expect(cnThousands(4103)).toBe('四千一百零三');
    expect(cnThousands(4000)).toBe('四千');
    expect(cnThousands(4020)).toBe('四千零二十');
    expect(cnThousands(4005)).toBe('四千零五');
    expect(cnThousands(4110)).toBe('四千一百一十');
    expect(cnThousands(4299)).toBe('四千二百九十九');
    expect(GEGU_LINES).toHaveLength(6);
  });
  it('picks 小满’s news to match the board (the festival’s on a festival day)', () => {
    for (const day of DAYS) {
      expect(newsOf(day, true)).toEqual(NEWS[7]);
      const n = newsOf(day, false);
      expect(NEWS.slice(0, 7)).toContainEqual(n);
      if (yueOfDay(day) === 'qu') expect(n).toEqual(NEWS[2]);
      if (yueOfDay(day) === 'shang') expect(n).toEqual(NEWS[5]);
    }
  });
  it('posts a 今日之约 with a target for every game', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const day = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      const y = yueFor(day);
      seen.add(y.game);
      expect(y.target).toBeGreaterThan(0);
      expect(y.line.zh.length).toBeGreaterThan(1);
    }
    expect(seen.size).toBe(GAME_IDS.length);
  });
});

describe('歇一歇 (the hours)', () => {
  it('cycles 6 → 12 → 18 → 20 → 6, one part each', () => {
    const parts: Part[] = ['dawn', 'day', 'dusk', 'night'];
    let p: Part = 'dawn';
    const hours: number[] = [];
    for (let i = 0; i < 5; i++) { hours.push(REST_HOURS[p]); p = NEXT_PART[p]; }
    expect(hours).toEqual([6, 12, 18, 20, 6]);
    for (const q of parts) expect(partOf(REST_HOURS[q])).toBe(q);
    expect(partsAhead('dusk')).toEqual(['night', 'dawn', 'day']);
    // (at 20 小满 is still up for 捉萤: he goes home at 21)
    expect(REST_HOURS.night).toBeLessThan(21);
  });
});

describe('外头的节 (the festival 席)', () => {
  it('maps every festival to a real dish (the season’s when it has none of its own)', () => {
    for (const f of FESTIVALS) for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(DISH_IDS).toContain(festivalDish(f.key, s));
    }
    expect(festivalDish('midautumn', 'spring')).toBe('s-guiyu');
    expect(festivalDish('dongzhi', 'summer')).toBe('s-junge');
    expect(festivalDish('dragonboat', 'winter')).toBe('s-heye');
    expect(festivalDish('lantern', 'autumn')).toBe('gao');
    expect(festivalDish('qixi', 'autumn')).toBe(SEASON_DISH.autumn);
  });
  it('asks with the real festival and two others', () => {
    for (const f of FESTIVALS) {
      const c = festivalChoices(f.key, '2026-09-27');
      expect(c.keys).toHaveLength(3);
      expect(new Set(c.keys).size).toBe(3);
      expect(c.keys[c.right]).toBe(f.key);
    }
  });
});

describe('the quests (知味, 乐土, 四时)', () => {
  const q = (id: string) => QUESTS.find((x) => x.id === id)!;
  it('count the life flags by their keys.ts prefixes', () => {
    expect(q('q-zhiwei').goal).toEqual({ kind: 'flags', prefix: EAT_PREFIX, target: ZHIWEI_TARGET });
    expect(q('q-letu').goal).toEqual({ kind: 'flags', prefix: SEAL_PREFIX, target: 6 });
    expect(q('q-sishi').goal).toEqual({ kind: 'flags', prefix: SEASON_EAT_PREFIX, target: 4 });
    for (const id of ['q-zhiwei', 'q-letu', 'q-sishi']) expect('seal' in q(id).reward).toBe(true);
    expect(eatKey('zhou').startsWith(EAT_PREFIX)).toBe(true);
    expect(eatKey('s-aigao').startsWith(SEASON_EAT_PREFIX)).toBe(true);
  });
  it('知味 is reachable without 桃花茶 (and with a parked case)', () => {
    expect(YEAR_DISHES.filter((d) => d !== 'taocha').length).toBe(ZHIWEI_TARGET);
  });
});

describe('the way back and the absence letter', () => {
  it('小满 meets you back at the mouth with the petal line', () => {
    expect(FIRST_RETURN.zh).toContain('然后……然后');
    expect(BACK).toBe('tyl:back');
  });
  it('comes a week after the last visit, only once you have come back', () => {
    const l = TAOYUAN_LETTERS.find((x) => x.id === 'ty-guiniang')!;
    expect(l).toBeTruthy();
    const p = (flags: Record<string, true>, last?: number) => ({ ...emptyPlay(), flags, best: (last ? { [LAST_DAY]: last } : {}) as Record<string, number> });
    const d0 = dayNumber('2026-09-01');
    expect(l.due!(p({}, d0), '2026-09-20')).toBe(false);
    expect(l.due!(p({ [BACK]: true }, d0), '2026-09-07')).toBe(false);
    expect(l.due!(p({ [BACK]: true }, d0), '2026-09-08')).toBe(true);
    expect(l.due!(p({ [BACK]: true }), '2026-09-08')).toBe(false);
    expect(dayNumber('2026-09-08') - dayNumber('2026-09-01')).toBe(7);
  });
});

describe('the moods and the echoes', () => {
  it('set one mood from a taste (定 replaces 醺)', () => {
    expect(moodOfTaste('热')).toBe('暖');
    expect(moodOfTaste('脆')).toBe('暖');
    expect(moodOfTaste('甜')).toBe('甜');
    expect(moodOfTaste('酒')).toBe('醺');
    expect(moodOfTaste('茶')).toBe('定');
  });
  it('石瞽 hears what is fresh on you', () => {
    expect(shiguEcho({ dish: 'xinpei' })).toEqual(SHIGU_DISH.xinpei);
    expect(shiguEcho({ dish: 'weiyu' })).toEqual(SHIGU_DISH.weiyu);
    expect(shiguEcho({ dish: 'zhou' })).toBeNull();
    for (const g of ['mo', 'qu', 'yuan', 'ying', 'shang'] as const) expect(shiguEcho({ game: g })).toEqual(SHIGU_GAME[g]);
    expect(shiguEcho(null)).toBeNull();
  });
});

describe('the life lines', () => {
  // (the style lint's word lists, Appendix A; the shared helper is F's — these are L's own lines)
  const BANNED = ['便', '竟', '方才', '方可', '方子', '只此', '生前', '以为', '仿佛', '宛如', '似乎', '也罢', '敢问', '忝为', '真相', '感觉', '情绪', '压力', '崩溃', '搞', '行吧', '没问题',
    '俺', '啥', '咋', '娃', '呗', '哩', '钟头', '铜板', '辣', '人间烟火', '治愈', '舌尖', '味蕾', '绽放', '满满的', '幸福感', '灵魂', '家的味道', '岁月', '入口即化', '回味无穷', '唇齿留香'];
  const lines: [string, string, string][] = [];
  const walk = (o: unknown, path: string): void => {
    if (typeof o === 'function') { walk((o as (a: string, b: string) => unknown)('中秋', 'Mid-Autumn'), path + '()'); return; }
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (typeof r.zh === 'string' && typeof r.en === 'string') { lines.push([path, r.zh, r.en]); return; }
    for (const [k, v] of Object.entries(r)) walk(v, `${path}.${k}`);
  };
  walk(LIFE_TEXT, 'life');
  for (const day of DAYS) walk(boardFor(day, { season: 'spring', festival: 'lantern', dishName: { zh: '新糕', en: 'Fresh millet cake' } }), `board.${day}`);
  it('use no banned word, and no hanzi in English', () => {
    expect(lines.length).toBeGreaterThan(40);
    for (const [where, zh, en] of lines) {
      for (const b of BANNED) expect(zh.includes(b), `${where}: ${b} in ${zh}`).toBe(false);
      expect((zh.match(/——/g) ?? []).length, where).toBeLessThanOrEqual(1);
      expect(/^其实/.test(zh), where).toBe(false);
      expect(/不是[^，。！？]{1,12}[，,]\s*(而)?是/.test(zh), where).toBe(false);
      expect(/[㐀-鿿]/.test(en.replace(/「[^」]*」/g, '')), `${where}: ${en}`).toBe(false);
    }
  });
  it('say 客人 only from 秦 and 三娘', () => {
    for (const [where, zh] of lines) if (zh.includes('客人')) expect(where, zh).toMatch(/board|yue/);
  });
});
