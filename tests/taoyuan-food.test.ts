// 桃源 · 二期「常住」: the valley's food (spec §8, F). What is on when, and that every cook is about to
// serve it; the prices (first tastes on the house but for the three required dishes, 新醅 for 曲 or an
// egg, today's first repeat, 桃花茶); appetite and the goods' jar; the text limits (captions, the
// voice-over, notes, hints, seasons); the thirteen companions' reactions and specials; the service
// lines; the style lint over every line (food.ts, and the life and games text once they land); no
// hanzi in the English; the stations stand on the valley's floor; every top paints.
import { describe, expect, it } from 'vitest';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import { FESTIVALS } from '../src/views/walk/features/calendar';
import { spotOf, VILLAGER_KEYS } from '../src/views/walk/features/taoyuan/folk';
import { walkAt } from '../src/views/walk/features/taoyuan/places';
import { BEATS, beatFlag } from '../src/views/walk/features/taoyuan/text';
import {
  COOKS, COOK_KEYS, DISHES, KINDS, MENU, REACT, SEASON_DISH, SHIDAN, SPECIALS, TASTE_MOOD, seasonHint, seasonLabel, seasonWait,
} from '../src/views/walk/features/taoyuan/life/food';
import {
  APPETITE, DISH_IDS, KIND_IDS, PV_ALL, PV_OFF, REQUIRED_DISHES, SEASON_DISHES, STOCK_CAP, YEAR_DISHES, ZHIWEI_TARGET,
  gotKey, keptOf, stockFrom, usedKey,
} from '../src/views/walk/features/taoyuan/life/keys';
import {
  FESTIVAL_DISH, appetite, bowls, festivalDish, menuAll, menuFor, moodAfter, ownBeat, payChoices, pickPayment, priceFor,
  pvModeFor, reactionFor, stationFor, stoveFits, stoveSpot, unitsOf, xinpeiSwap, type PriceState,
} from '../src/views/walk/features/taoyuan/life/table-logic';
import { paintTop } from '../src/views/walk/features/taoyuan/life/paint';
import type { CookKey, DishId, KindId, Part, Season, Taste } from '../src/views/walk/features/taoyuan/life/types';
import { pvSetting, setPvSetting } from '../src/views/walk/shidan/state';
import { emptyPlay, play } from '../src/app/play';
import { hanziIn, isStage, lint, linesIn, speakerOf, type LintSpeaker } from './helpers/style-lint';

type Flags = Record<string, true>;
const F = (...keys: string[]): Flags => Object.fromEntries(keys.map((k) => [k, true as const]));
const PARTS: Part[] = ['dawn', 'day', 'dusk', 'night'];
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const TASTES: Taste[] = ['热', '甜', '脆', '酒', '茶'];
const WHO = CHARACTERS.map((c) => c.id) as CharacterId[];
/** The hours of each part the checks stand at (夜 both before 小满's bedtime and after midnight). */
const HOURS: Record<Part, number[]> = { dawn: [5, 6, 8], day: [9, 12, 16], dusk: [17, 18], night: [19, 20, 22, 2] };
const SOLVED = F(...BEATS.map(beatFlag), 'case:hz:open', 'case:hz:solved');
const PARKED = F(...(['b1', 'b2', 'b3', 'b4a', 'b4b', 'b4c', 'b5', 'b7', 'b8'] as const).map(beatFlag), 'case:hz:parked');

const fresh = (o: Partial<PriceState> = {}): PriceState => ({ tasted: false, freeUsed: 0, teaToday: 0, solved: true, ...o });
const held = (s: Partial<Record<KindId, number>>) => (k: KindId) => s[k] ?? 0;

describe('what is on when', () => {
  it('every part of every season has ≥3 dishes with the case solved, ≥2 with it parked', () => {
    for (const season of SEASONS) for (const part of PARTS) {
      expect(menuAll(part, { season, solved: true }).length, `${season} ${part} solved`).toBeGreaterThanOrEqual(3);
      expect(menuAll(part, { season, solved: false }).length, `${season} ${part} parked`).toBeGreaterThanOrEqual(2);
      // (a festival never takes a dish away)
      for (const f of FESTIVALS) expect(menuAll(part, { season, solved: false, festival: f.key }).length).toBeGreaterThanOrEqual(menuAll(part, { season, solved: false }).length);
    }
  });
  it('lists every dish somewhere, and a cook card holds one to four', () => {
    const seen = new Set<DishId>();
    for (const season of SEASONS) for (const part of PARTS) for (const c of COOK_KEYS) {
      const m = menuFor(c, part, { season, solved: true });
      expect(m.length).toBeLessThanOrEqual(4);
      for (const d of m) { seen.add(d); expect(DISHES[d].cook).toBe(c); }
      for (const f of FESTIVALS) expect(menuFor(c, part, { season, solved: true, festival: f.key }).length).toBeLessThanOrEqual(4);
    }
    expect([...seen].sort()).toEqual([...DISH_IDS].sort());
  });
  it('every dish is served only where its cook is about, at every hour of its parts (桂娘 never at 夜)', () => {
    for (const d of DISH_IDS) {
      const dish = DISHES[d];
      for (const part of dish.parts) for (const f of [SOLVED, PARKED]) for (const h of HOURS[part]) {
        expect(spotOf(dish.cook, 'chang', part, f, h), `${d}: ${dish.cook} at ${part} ${h}h`).not.toBeNull();
      }
    }
    // and every menu, festivals included
    for (const season of SEASONS) for (const part of PARTS) for (const c of COOK_KEYS) {
      for (const fest of [null, ...FESTIVALS.map((x) => x.key)]) {
        if (!menuFor(c, part, { season, solved: true, festival: fest }).length) continue;
        for (const h of HOURS[part]) expect(spotOf(c, 'chang', part, SOLVED, h), `${c} ${part} ${h}h`).not.toBeNull();
      }
    }
    expect(menuFor('guiniang', 'night', { season: 'autumn', solved: true })).toEqual([]);
  });
  it('serves 桃花茶 only once the case is solved', () => {
    for (const season of SEASONS) {
      expect(menuFor('duer', 'night', { season, solved: true })).toContain('taocha');
      expect(menuFor('duer', 'night', { season, solved: false })).not.toContain('taocha');
    }
  });
  it('cooks the outside season, and the festival 席 at 暮', () => {
    expect(menuFor('guiniang', 'day', { season: 'spring', solved: true })).toContain('s-aigao');
    expect(menuFor('guiniang', 'dusk', { season: 'autumn', solved: true })).toContain('s-guiyu');
    expect(menuFor('guiniang', 'dusk', { season: 'winter', solved: true })).toContain('s-junge');
    expect(menuFor('guiniang', 'dusk', { season: 'summer', solved: true })).toContain('s-heye');
    expect(menuFor('guiniang', 'dusk', { season: 'autumn', solved: true, festival: 'midautumn' })).toContain('s-guiyu');
    expect(menuFor('guiniang', 'dusk', { season: 'winter', solved: true, festival: 'spring' })).toContain('gao');
    expect(menuFor('guiniang', 'dusk', { season: 'winter', solved: true, festival: 'spring' })).not.toContain('s-junge');
    expect(menuFor('guiniang', 'dusk', { season: 'summer', solved: true, festival: 'dragonboat' })).toContain('s-heye');
  });
  it('maps every festival to a real dish', () => {
    for (const f of FESTIVALS) for (const s of SEASONS) expect(DISH_IDS, `${f.key} ${s}`).toContain(festivalDish(f.key, s));
    for (const d of Object.values(FESTIVAL_DISH)) expect(DISH_IDS).toContain(d);
    expect(festivalDish('qingming', 'spring')).toBe('s-aigao');
    expect(festivalDish('laba', 'winter')).toBe('s-junge');
  });
});

describe('prices', () => {
  it('first tastes are on the house, except 炙鱼, 桑葚糕 and 新醅', () => {
    for (const d of DISH_IDS) {
      if (d === 'taocha') continue;
      const p = priceFor(d, fresh());
      if ((REQUIRED_DISHES as readonly string[]).includes(d)) expect(p.kind, d).toBe('pay');
      else expect(p, d).toEqual({ kind: 'free', why: 'first' });
    }
    expect(priceFor('zhiyu', fresh())).toEqual({ kind: 'pay', accept: ['yu'], why: 'first' });
    expect(priceFor('shengao', fresh())).toEqual({ kind: 'pay', accept: ['shen'], why: 'first' });
  });
  it('新醅 takes a yeast cake or a goose egg, and nothing else', () => {
    for (const s of [fresh(), fresh({ tasted: true, freeUsed: 1 })]) {
      const p = priceFor('xinpei', s);
      expect(p.kind).toBe('pay');
      if (p.kind !== 'pay') return;
      expect([...p.accept as KindId[]].sort()).toEqual(['dan', 'qu']);
      for (const k of KIND_IDS) {
        const got = pickPayment('xinpei', p.accept, held({ [k]: 3 }));
        expect(got, k).toBe(k === 'qu' || k === 'dan' ? k : null);
      }
    }
    // the dish's own good first (曲: the 亲手 beat), the egg otherwise
    expect(pickPayment('xinpei', ['qu', 'dan'], held({ qu: 1, dan: 5 }))).toBe('qu');
    expect(pickPayment('xinpei', ['qu', 'dan'], held({ dan: 5 }))).toBe('dan');
  });
  it("today's first repeat is on the house; after it, one good (a required dish its own)", () => {
    for (const d of DISH_IDS) {
      if (d === 'taocha') continue;
      expect(priceFor(d, fresh({ tasted: true })), d).toEqual({ kind: 'free', why: 'daily' });
      const p = priceFor(d, fresh({ tasted: true, freeUsed: 1 }));
      expect(p.kind, d).toBe('pay');
      if (p.kind === 'pay') expect(p.accept, d).toEqual(DISHES[d].required ?? 'any');
    }
  });
  it('桃花茶 is never charged, at most once a night, and only once the case is solved', () => {
    for (const tasted of [false, true]) for (const freeUsed of [0, 1]) {
      expect(priceFor('taocha', fresh({ tasted, freeUsed }))).toEqual({ kind: 'free', why: 'tea' });
      expect(priceFor('taocha', fresh({ tasted, freeUsed, teaToday: 1 }))).toEqual({ kind: 'none', why: 'tea-done' });
      expect(priceFor('taocha', fresh({ tasted, freeUsed, solved: false }))).toEqual({ kind: 'none', why: 'locked' });
    }
  });
  it('pays with the dish’s own good first, else the good held most of; ⇄ cycles what can pay', () => {
    expect(pickPayment('tangbing', 'any', held({ jun: 1, yu: 4 }))).toBe('jun');
    expect(pickPayment('zhou', 'any', held({ jun: 1, yu: 4 }))).toBe('yu');
    expect(pickPayment('zhou', 'any', held({}))).toBeNull();
    expect(payChoices('gao', 'any', held({ yu: 2, shu: 1, dan: 3 }))).toEqual(['shu', 'dan', 'yu']);
    expect(pickPayment('gao', 'any', held({ yu: 2, shu: 1, dan: 3 }), 'yu')).toBe('yu');
    expect(pickPayment('gao', 'any', held({ yu: 2 }), 'dan')).toBe('yu');
  });
  it('plays the 亲手 beat when paid with the own good, or on the house while holding it', () => {
    const repeat = priceFor('bing', fresh({ tasted: true, freeUsed: 1 }));
    expect(ownBeat('bing', repeat, 'dan', held({ dan: 1 }))).toBe('dan');
    expect(ownBeat('bing', repeat, 'yu', held({ dan: 1, yu: 1 }))).toBeNull();
    expect(ownBeat('bing', priceFor('bing', fresh()), null, held({ dan: 1 }))).toBe('dan');
    expect(ownBeat('bing', priceFor('bing', fresh()), null, held({}))).toBeNull();
    expect(ownBeat('zhou', priceFor('zhou', fresh()), null, held({ dan: 1 }))).toBeNull();
    expect(ownBeat('zhiyu', priceFor('zhiyu', fresh()), 'yu', held({ yu: 1 }))).toBe('yu');
  });
});

describe('appetite and the jar', () => {
  const eatUntilFull = (d: DishId, festival: boolean) => {
    let belly = 0, extra = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const a = appetite(d, belly, { festival, extraUsed: extra });
      if (a === 'full') break;
      if (a === 'extra') extra++;
      belly += unitsOf(d);
      n++;
    }
    return n;
  };
  it('is four bowls or eight drinks a day, and one serving more on a festival', () => {
    expect(APPETITE).toBe(8);
    expect(eatUntilFull('zhou', false)).toBe(4);
    expect(eatUntilFull('zisu', false)).toBe(8);
    expect(eatUntilFull('zhou', true)).toBe(5);
    expect(eatUntilFull('xinpei', true)).toBe(9);
    // a drink still fits after three and a half bowls' worth
    expect(appetite('zisu', 7, { festival: false, extraUsed: 0 })).toBe('ok');
    expect(appetite('zhou', 7, { festival: false, extraUsed: 0 })).toBe('full');
    expect(bowls(0)).toEqual([0, 0, 0, 0]);
    expect(bowls(3)).toEqual([1, 0.5, 0, 0]);
    expect(bowls(9)).toEqual([1, 1, 1, 1]);
  });
  it('drinks cost one unit, bowls and plates two', () => {
    for (const d of DISH_IDS) expect(unitsOf(d), d).toBe(DISHES[d].pv === '饮' ? 1 : 2);
    expect(unitsOf('xinpei')).toBe(1);
    expect(unitsOf('taocha')).toBe(1);
    expect(unitsOf('zisu')).toBe(1);
  });
  it('loses what the jar cannot hold, and never uses more than it got', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const c: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const k = KIND_IDS[Math.floor(rnd() * KIND_IDS.length)];
      if (rnd() < 0.55) {
        const n = 1 + Math.floor(rnd() * 3);
        const kept = keptOf(c, k, n);
        expect(kept).toBeLessThanOrEqual(n);
        if (kept) c[gotKey(k)] = (c[gotKey(k)] ?? 0) + kept;
      } else if (stockFrom(c, k) > 0) {
        c[usedKey(k)] = (c[usedKey(k)] ?? 0) + 1;
      }
      expect(stockFrom(c, k)).toBeLessThanOrEqual(STOCK_CAP);
      expect(c[usedKey(k)] ?? 0).toBeLessThanOrEqual(c[gotKey(k)] ?? 0);
      expect((c[gotKey(k)] ?? 0) - (c[usedKey(k)] ?? 0)).toBeLessThanOrEqual(STOCK_CAP);
    }
    expect(keptOf({ [gotKey('yu')]: 5 }, 'yu', 3)).toBe(1);
    expect(keptOf({ [gotKey('yu')]: 6 }, 'yu', 2)).toBe(0);
  });
});

describe('the 特写, the mood and the companions', () => {
  it('plays in full on a first taste, the short cut after; 每回 always; 不看 never', () => {
    expect(pvModeFor({}, true)).toBe('full');
    expect(pvModeFor({}, false)).toBe('short');
    expect(pvModeFor(F(PV_ALL), false)).toBe('full');
    expect(pvModeFor(F(PV_OFF), true)).toBe('none');
  });
  it('keeps the 食单 setting in one flag pair (neither: 头一回), and takes it back', () => {
    play.value = { ...emptyPlay(), flags: { 'ty:b1': true } };
    expect(pvSetting(play.value.flags)).toBe('first');
    setPvSetting('all');
    expect(play.value.flags[PV_ALL]).toBe(true);
    expect(pvSetting(play.value.flags)).toBe('all');
    setPvSetting('off');
    expect(play.value.flags[PV_ALL]).toBeUndefined();
    expect(play.value.flags[PV_OFF]).toBe(true);
    expect(pvModeFor(play.value.flags, true)).toBe('none');
    setPvSetting('first');
    expect(play.value.flags[PV_ALL] ?? play.value.flags[PV_OFF]).toBeUndefined();
    expect(play.value.flags['ty:b1']).toBe(true);
    play.value = emptyPlay();
  });
  it('leaves the mood of its taste (醴 is sweet; the cat only sniffs 新醅)', () => {
    for (const d of DISH_IDS) if (d !== 'xinpei') expect(moodAfter(d, 'scholar'), d).toBe(TASTE_MOOD[DISHES[d].taste]);
    expect(moodAfter('xinpei', 'scholar')).toBe('醺');
    expect(moodAfter('xinpei', 'taoist')).toBe('甜');
    expect(moodAfter('xinpei', 'rabbit')).toBe('甜');
    expect(moodAfter('xinpei', 'cat')).toBeNull();
    expect(moodAfter('zisu', 'scholar')).toBe('定');
    expect(xinpeiSwap('taoist')?.li).toBe(true);
    expect(xinpeiSwap('cat')?.li).toBe(false);
    expect(xinpeiSwap('guan')).toBeNull();
  });
  it('gives every companion a line for every taste', () => {
    expect(WHO.length).toBe(13);
    for (const c of WHO) for (const t of TASTES) {
      const l = REACT[c]?.[t];
      expect(l?.zh, `${c} ${t}`).toBeTruthy();
      expect(l?.en, `${c} ${t}`).toBeTruthy();
    }
  });
  it('lets a special override the taste line, on a real dish', () => {
    let n = 0;
    for (const [c, list] of Object.entries(SPECIALS)) {
      expect(WHO, c).toContain(c);
      for (const s of list!) {
        n++;
        expect(DISH_IDS, `${c} ${s.dish}`).toContain(s.dish);
        expect(reactionFor(c as CharacterId, s.dish).line).toBe(s.line);
        if (s.reply) expect(VILLAGER_KEYS).toContain(s.reply.by);
      }
    }
    expect(n).toBe(13);
    expect(reactionFor('swordsman', 'jishu').line).toBe(REACT.swordsman['热']);
  });
  it('gives every cook a line for a full belly and one for nothing to pay with', () => {
    for (const c of COOK_KEYS) {
      expect(COOKS[c].full.zh && COOKS[c].full.en, c).toBeTruthy();
      expect(COOKS[c].broke.zh && COOKS[c].broke.en, c).toBeTruthy();
      expect(COOKS[c].seal.length).toBe(1);
    }
  });
});

describe('the text', () => {
  it('keeps captions to eight characters, the only lyric text', () => {
    for (const d of DISH_IDS) {
      expect([...DISHES[d].caption.zh].length, d).toBeLessThanOrEqual(8);
      expect(DISHES[d].caption.en, d).toBeTruthy();
    }
  });
  it('gives every dish exactly two voice-over lines (炙鱼 two short ones)', () => {
    for (const d of DISH_IDS) {
      const vo = DISHES[d].vo;
      expect(vo.length, d).toBe(2);
      for (const l of vo) { expect(l.zh, d).toBeTruthy(); expect(l.en, d).toBeTruthy(); }
    }
    for (const l of DISHES.zhiyu.vo) expect([...l.zh].length).toBeLessThanOrEqual(10);
  });
  it('gives every dish a taste note, a hint and a where, in both languages', () => {
    for (const d of DISH_IDS) {
      for (const k of ['note', 'hint', 'where'] as const) {
        expect(DISHES[d][k].zh, `${d}.${k}`).toBeTruthy();
        expect(DISHES[d][k].en, `${d}.${k}`).toBeTruthy();
      }
      if (DISHES[d].own) expect(DISHES[d].ownLine?.zh, `${d} 亲手`).toBeTruthy();
    }
    expect(DISHES.taocha.hintLocked?.zh).toBeTruthy();
  });
  it('gives every seasonal dish its season, and every season one dish', () => {
    expect(SEASON_DISHES.length).toBe(4);
    for (const d of SEASON_DISHES) {
      const s = DISHES[d].season;
      expect(s, d).toBeTruthy();
      expect(SEASON_DISH[s!]).toBe(d);
      for (const l of [seasonLabel(s!), seasonWait(s!), seasonHint(s!)]) { expect(l.zh).toBeTruthy(); expect(l.en).toBeTruthy(); }
      expect(DISHES[d].cook).toBe('guiniang');
    }
    for (const d of YEAR_DISHES) expect(DISHES[d].season, d).toBeUndefined();
    expect(seasonWait('autumn').zh).toBe('待山外 · 秋');
    expect(seasonHint('autumn').zh).toBe('外头秋天了再来。');
  });
  it('keeps the period kitchen, and 汤饼 the only noodles', () => {
    const all = linesIn(DISHES).map((l) => l.zh).join('\n');
    for (const w of ['面条', '馒头', '包子', '饺子', '炒']) expect(all.includes(w), w).toBe(false);
  });
  it('makes 知味 reachable without 桃花茶: twelve year-round dishes, three of them traded for', () => {
    expect(YEAR_DISHES.filter((d) => d !== 'taocha').length).toBe(ZHIWEI_TARGET);
    for (const d of REQUIRED_DISHES) expect(YEAR_DISHES).toContain(d);
    // each required good comes from a game (the goods are in kind)
    for (const d of REQUIRED_DISHES) for (const k of DISHES[d].required!) expect(KINDS[k].from.zh).toBeTruthy();
  });
});

// ───────────────────────────── the style lint (Appendix A)

/** Who says each line in food.ts (null: the walker's own voice, or a label). */
function foodLines(): { path: string; zh: string; en: string; who: LintSpeaker | undefined }[] {
  const out: { path: string; zh: string; en: string; who: LintSpeaker | undefined }[] = [];
  const add = (path: string, l: { zh: string; en: string } | undefined, who: LintSpeaker | undefined) => { if (l) out.push({ path, ...l, who }); };
  for (const d of DISH_IDS) {
    const x = DISHES[d];
    x.vo.forEach((l, i) => add(`${d}.vo${i}`, l, x.cook));
    add(`${d}.own`, x.ownLine, x.cook);
    add(`${d}.hint`, x.hint, x.cook);
    add(`${d}.hintLocked`, x.hintLocked, x.cook);
    add(`${d}.egg`, x.eggLine, 'duer');
    add(`${d}.tile`, x.tile, x.cook);
    add(`${d}.refuse`, x.refuse, 'sang');
    add(`${d}.ownRare`, x.ownRare, x.cook);
    add(`${d}.bark`, x.bark, 'xiaoman');
    for (const [c, s] of Object.entries(x.swaps ?? {})) add(`${d}.swap.${c}`, s!.line, 'duer');
    add(`${d}.caption`, x.caption, 'narr');
    add(`${d}.note`, x.note, undefined);
    add(`${d}.where`, x.where, undefined);
    add(`${d}.name`, { zh: x.zh, en: x.en }, undefined);
  }
  for (const c of COOK_KEYS) { add(`${c}.full`, COOKS[c].full, c); add(`${c}.broke`, COOKS[c].broke, c); }
  for (const c of WHO) for (const t of TASTES) add(`react.${c}.${t}`, REACT[c][t], isStage(REACT[c][t].zh) ? 'narr' : c);
  for (const [c, list] of Object.entries(SPECIALS)) for (const s of list!) {
    add(`special.${c}.${s.dish}`, s.line, isStage(s.line.zh) ? 'narr' : c);
    if (s.reply) add(`special.${c}.${s.dish}.reply`, s.reply.line, s.reply.by);
  }
  for (const l of linesIn({ MENU, SHIDAN, KINDS })) add(l.path, l, undefined);
  for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) { add(`wait.${s}`, seasonWait(s), 'guiniang'); add(`hint.${s}`, seasonHint(s), 'guiniang'); }
  return out;
}

describe('the style lint', () => {
  it('catches what it should', () => {
    expect(lint('他不是不回来，是回不来。', 'duer')).toContain('不是A，是B');
    expect(lint('其实我早知道了。', 'duer')).toContain('opens with 其实');
    expect(lint('客人请坐。', 'duer')).toContain('客人 is only for 秦 and 三娘');
    expect(lint('客人请坐。', 'qin')).toEqual([]);
    expect(lint('莫急。', 'liupo')).toEqual([]);
    expect(lint('莫急。', 'duer').length).toBe(1);
    expect(lint('（他笑了。）（又笑了。）', 'duer')).toContain('more than one （stage direction）');
    expect(lint('（他笑了。）（又笑了。）', 'narr')).toEqual([]);
    expect(lint('人间烟火。', 'narr').length).toBe(1);
    expect(lint('引以为流觞曲水', 'quote')).toEqual([]);
    expect(lint('引以为流觞曲水', 'qin').length).toBe(1);
    expect(lint('一个——两个——三个', 'xiaoman')).toContain('more than one ——');
    expect(lint('来一碗土豆汤。', 'guiniang').length).toBe(1);
  });
  it('passes every line in food.ts', () => {
    const lines = foodLines();
    expect(lines.length).toBeGreaterThan(200);
    for (const l of lines) expect(lint(l.zh, l.who), `${l.path}: ${l.zh}`).toEqual([]);
  });

  // the life layer's and the games' lines (L's life-text.ts, G's games-text.ts), once they land
  const WHO_KEYS = [...VILLAGER_KEYS, ...WHO] as string[];
  const others = import.meta.glob('../src/views/walk/features/taoyuan/life/{life-text,games/games-text}.ts', { eager: true });
  for (const [file, mod] of Object.entries(others)) {
    it(`passes every line in ${file.split('/').pop()}`, () => {
      const lines = linesIn(mod);
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(lint(l.zh, speakerOf(l.path, l.zh, WHO_KEYS)), `${l.path}: ${l.zh}`).toEqual([]);
    });
  }
});

describe('the English', () => {
  it('names no one in hanzi', () => {
    const lines = foodLines();
    for (const l of lines) expect(hanziIn(l.en), `${l.path}: ${l.en}`).toBe(false);
    for (const l of linesIn({ MENU, SHIDAN, KINDS, COOKS })) expect(hanziIn(l.en), `${l.path}: ${l.en}`).toBe(false);
    for (let n = 0; n <= 12; n++) expect(hanziIn(SHIDAN.count(n).en)).toBe(false);
  });
});

// ───────────────────────────── where the 特写 films

describe('stations and seats', () => {
  it('stands 桂娘’s stove on the floor, clear of the tables and the channel', () => {
    const s = stoveSpot();
    expect(stoveFits(s)).toBe(true);
    expect(s).toEqual({ x: 2.4, z: -3.6 });
  });
  it('puts every cook and every seat on walkable ground', () => {
    for (const c of COOK_KEYS as CookKey[]) for (const p of PARTS) {
      const st = stationFor(c, p);
      expect(walkAt(st.cook.x, st.cook.z), `${c} ${p} cook`).toBe(true);
      if (st.seat !== 'tables') expect(walkAt(st.seat.x, st.seat.z), `${c} ${p} seat`).toBe(true);
      expect(Math.hypot(st.cook.x - st.prop.x, st.cook.z - st.prop.z), `${c} ${p}`).toBeLessThan(1.6);
    }
  });
});

// ───────────────────────────── the painted tops

describe('paintTop', () => {
  /** A 2D context that records nothing and returns what the painter asks for. */
  function fakeContext() {
    let depth = 0, calls = 0;
    const grad = { addColorStop() {} };
    const g = new Proxy({} as Record<string, unknown>, {
      get(t, k) {
        if (k === 'save') return () => { depth++; calls++; };
        if (k === 'restore') return () => { depth--; calls++; };
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
        if (k in t) return t[k as string];
        return () => { calls++; };
      },
      set(t, k, v) { t[k as string] = v; return true; },
    });
    return { g: g as unknown as CanvasRenderingContext2D, depth: () => depth, calls: () => calls };
  }
  it('paints every dish (and 醴, the festival cake, the thumbnails) with balanced saves', () => {
    for (const d of DISH_IDS) for (const o of [{}, { vessel: true }, { li: true }, { festival: true }]) {
      const f = fakeContext();
      paintTop(f.g, d === 'zhou' ? 160 : 512, d, o);
      expect(f.depth(), d).toBe(0);
      expect(f.calls(), d).toBeGreaterThan(20);
    }
  });
});
