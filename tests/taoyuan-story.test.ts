// 桃源记 · the story's plan: the door in every state of the record, the beats in order (and resumed
// after a rebuild at any point, on both the judged and the parked path), the valley's hour and who
// stands where, flags that fit, villagers' names that collide with no one's, a line for every villager
// and every companion — and the owner's code opening nothing here.
import { beforeEach, describe, expect, it } from 'vitest';
import { play, emptyPlay, redeemCode, _acceptCodeForTests, questValue } from '../src/app/play';
import { state, emptyState, today } from '../src/app/store';
import { inBox, _mailForTests, deliver } from '../src/app/mail';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import { QUEST } from '../src/data/quests';
import { LETTERS } from '../src/data/letters';
import { doorStateFor } from '../src/views/walk/features/taoyuan/places';
import {
  BEATS, B3, B4, B7, OLD_GUEST, STORY_FLAGS, STELE, beatFlag, caseOpen, leftValley, nextBeat, phaseOf, storyClock, type Beat, type Phase,
} from '../src/views/walk/features/taoyuan/text';
import {
  REGULAR_AFTER, STAGING, VILLAGERS, VILLAGER_KEYS, labelOf, metFlag, partOf, spotOf, talkKey, talkPlan, type Part,
} from '../src/views/walk/features/taoyuan/folk';
import { walkAt } from '../src/views/walk/features/taoyuan/places';
import { FOLK } from '../src/views/walk/features/npcs/folk';
import { ROLES, SPECIES } from '../src/views/walk/features/home/life/logic';

type Flags = Record<string, true>;
const F = (...keys: string[]): Flags => Object.fromEntries(keys.map((k) => [k, true as const]));
const upTo = (b: Beat, ...more: string[]): Flags => F(...BEATS.slice(0, BEATS.indexOf(b) + 1).map(beatFlag), ...more);
const WHO = CHARACTERS.map((c) => c.id) as CharacterId[];

beforeEach(() => {
  today.value = '2026-09-26';
  state.value = { ...emptyState(), onboarded: true };
  play.value = emptyPlay();
  _mailForTests.reset();
});

describe('the door (bible §2)', () => {
  it('is hidden, open, closed or reopened for every combination of the record', () => {
    for (const letter of [false, true]) for (const old of [false, true]) for (const b8 of [false, true]) for (const way of [false, true]) {
      const f: Flags = {};
      if (old) f['qy:taohua'] = true;
      if (b8) f['ty:b8'] = true;
      if (way) f['ty:way'] = true;
      const want = way ? 'reopened' : b8 ? 'closed' : letter || old ? 'open' : 'hidden';
      expect(doorStateFor(f, letter), JSON.stringify({ letter, old, b8, way })).toBe(want);
    }
  });
  it('opens with 拾得\'s letter in the box (and stays open through the whole story)', () => {
    expect(doorStateFor(play.value.flags, inBox('ty-shide'))).toBe('hidden');
    deliver('ty-shide');
    for (const b of BEATS.slice(0, -1)) expect(doorStateFor(upTo(b), inBox('ty-shide')), b).toBe('open');
    expect(doorStateFor(upTo('b8'), inBox('ty-shide'))).toBe('closed');
    expect(doorStateFor(upTo('b8', 'ty:way'), inBox('ty-shide'))).toBe('reopened');
  });
  it('the pressed petal that reopens it comes from 小满\'s letter the day after', () => {
    const l = LETTERS.find((x) => x.id === 'ty-xiaoman')!;
    expect(l.sets).toContain('ty:way');
    const p = { ...emptyPlay(), done: { 'ty:b8': '2026-09-26' } };
    expect(l.due!(p, '2026-09-26')).toBe(false);
    expect(l.due!(p, '2026-09-27')).toBe(true);
  });
});

describe('the beats (bible §3)', () => {
  it('come in order, and a rebuild after any beat resumes at the next', () => {
    let f: Flags = {};
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const n = nextBeat(f);
      seen.push(n);
      if (n === 'done') break;
      if (n === 'case') { f = { ...f, 'case:hz:solved': true }; continue; }
      if (n === 'b5') f = { ...f, 'case:hz:open': true };
      f = { ...f, [beatFlag(n)]: true };
    }
    expect(seen).toEqual(['b1', 'b2', 'b3', 'b4a', 'b4b', 'b4c', 'b5', 'case', 'b6', 'b7', 'b8', 'done']);
  });
  it('wait for the judgement while the case is open, and go on to B6 once it is judged', () => {
    expect(nextBeat(upTo('b5', 'case:hz:open'))).toBe('case');
    expect(caseOpen(upTo('b5', 'case:hz:open'))).toBe(true);
    expect(nextBeat(upTo('b5', 'case:hz:open', 'case:hz:solved'))).toBe('b6');
    expect(nextBeat(upTo('b6', 'case:hz:open', 'case:hz:solved'))).toBe('b7');
  });
  it('the parked path goes to B7 and B8 without B6; the parked case judged later plays B6 then', () => {
    expect(nextBeat(upTo('b5', 'case:hz:parked'))).toBe('b7');
    expect(nextBeat({ ...upTo('b5', 'case:hz:parked'), 'ty:b7': true })).toBe('b8');
    const after = { ...upTo('b5', 'case:hz:parked'), 'ty:b7': true, 'ty:b8': true } as Flags;
    expect(nextBeat(after)).toBe('done');
    expect(nextBeat({ ...after, 'case:hz:open': true })).toBe('case');
    expect(phaseOf({ ...after, 'case:hz:open': true })).toBe('case');
    expect(nextBeat({ ...after, 'case:hz:open': true, 'case:hz:solved': true })).toBe('b6');
    expect(nextBeat({ ...after, 'case:hz:open': true, 'case:hz:solved': true, 'ty:b6': true })).toBe('done');
  });
  it('set the valley\'s hour where the story stands (bible §1.3)', () => {
    const want: [Flags, string][] = [
      [{}, 'shen'], [upTo('b1'), 'shen'], [upTo('b2'), 'shen'], [upTo('b3'), 'you'], [upTo('b4a'), 'xu'], [upTo('b4b'), 'hai'], [upTo('b4c'), 'zi'],
      [upTo('b5', 'case:hz:open'), 'case'], [upTo('b5', 'case:hz:parked'), 'mao'], [upTo('b6', 'case:hz:open', 'case:hz:solved'), 'mao'],
      [upTo('b7', 'case:hz:open', 'case:hz:solved'), 'mao'], [upTo('b8', 'case:hz:open', 'case:hz:solved'), 'chang'],
    ];
    for (const [f, c] of want) expect(storyClock(f), JSON.stringify(Object.keys(f))).toBe(c);
  });
  it('阮郎 and 桃叶 leave only once their passes are stamped (B6), and stay on the parked path', () => {
    for (const k of ['ruan', 'taoye'] as const) {
      expect(spotOf(k, 'dawn', 'dawn', upTo('b5', 'case:hz:parked'))).not.toBeNull();
      expect(spotOf(k, 'chang', 'day', { ...upTo('b5', 'case:hz:parked'), 'ty:b7': true, 'ty:b8': true })).not.toBeNull();
      expect(leftValley(upTo('b6'))).toBe(true);
      expect(spotOf(k, 'dawn', 'dawn', upTo('b6', 'case:hz:solved'))).toBeNull();
      expect(spotOf(k, 'chang', 'day', upTo('b8', 'case:hz:solved'))).toBeNull();
    }
  });
});

describe('flags', () => {
  it('are 64 characters or fewer, every one the story writes', () => {
    const all = [
      ...STORY_FLAGS, ...B7.wishes, ...VILLAGER_KEYS.map(metFlag), ...VILLAGER_KEYS.map(talkKey),
      ...LETTERS.flatMap((l) => l.sets ?? []), OLD_GUEST,
    ];
    for (const k of all) expect(k.length, k).toBeLessThanOrEqual(64);
    expect(STORY_FLAGS).toContain('ty:b8');
    expect(QUEST['q-taoyuan'].goal).toEqual({ kind: 'flag', key: 'ty:b8' });
  });
});

describe('the thirteen villagers (bible §7)', () => {
  it('are thirteen, with names of their own that no one else in the world has', () => {
    expect(VILLAGER_KEYS.length).toBe(13);
    const names = VILLAGER_KEYS.map((k) => VILLAGERS[k].zh);
    expect(new Set(names).size).toBe(13);
    expect(new Set(VILLAGER_KEYS.map((k) => VILLAGERS[k].en)).size).toBe(13);
    const others = new Set<string>([
      ...FOLK.map((x) => x.zh),
      ...ROLES.flatMap((r) => r.names),
      ...SPECIES.flatMap((s) => s.names),
      ...CHARACTERS.map((c) => c.zh),
      // the old encounter's epithets, and the names proposed for the world's folk (bible §7)
      '老丈', '村妇', '小童', '农夫', '孙七', '钱先生', '袁半仙', '杏儿', '田老伯', '陆掌柜', '江老汉', '了缘', '梅溪居士', '阿蛮', '老吴', '王四娘',
    ]);
    for (const n of names) expect(others.has(n), n).toBe(false);
    for (const k of VILLAGER_KEYS) {
      const v = VILLAGERS[k];
      expect(v.key).toBe(k);
      expect(v.mark.length).toBe(1);
      expect(v.epithet.zh && v.epithet.en).toBeTruthy();
      expect(v.chat.length).toBeGreaterThanOrEqual(3);
      expect(v.regular.zh).toContain('{名}');
      expect(v.regular.en).toContain('{名}');
    }
  });
  it('show their epithet until met, then their name', () => {
    expect(labelOf('qin', false).zh).toBe('拄杖的老人');
    expect(labelOf('qin', true).zh).toContain('秦守拙');
    expect(labelOf('xiaoman', true).en).toContain('Xiaoman');
  });
  it('resolve a line for every companion, met or not, first talk of the day or not, regular or not, case open or not', () => {
    const states: Flags[] = [{}, upTo('b3'), upTo('b5', 'case:hz:open'), upTo('b8', 'case:hz:solved', 'ty:stele'), upTo('b5', 'case:hz:open', 'case:hz:found')];
    for (const k of VILLAGER_KEYS) for (const who of WHO) for (const base of states) for (const met of [false, true]) for (const today of [0, 1, 4]) for (const total of [0, REGULAR_AFTER, 9]) {
      const flags = met ? { ...base, [metFlag(k)]: true as const } : base;
      const plan = talkPlan(k, who, { flags, total, today, day: '2026-09-26' });
      expect(plan.lines.length, `${k}/${who}`).toBeGreaterThan(0);
      for (const l of plan.lines) { expect(l.zh, `${k}/${who}`).toBeTruthy(); expect(l.en, `${k}/${who}`).toBeTruthy(); }
      expect(plan.meet).toBe(!met);
    }
  });
  it('introduce themselves with their first line, greet a regular by name, and speak to their companions first', () => {
    const met = F(metFlag('shigu'));
    expect(talkPlan('shigu', 'scholar', { flags: {}, total: 0, today: 0, day: 'd' }).lines[0]).toEqual(VILLAGERS.shigu.chat[0]);
    expect(talkPlan('shigu', 'musician', { flags: met, total: 1, today: 0, day: 'd' }).lines[0].zh).toContain('《流水》');
    // a group line reaches every companion of the group only through their own entries here; the rest hear the day's line
    expect(VILLAGERS.shigu.chat).toContainEqual(talkPlan('shigu', 'scholar', { flags: met, total: 1, today: 0, day: 'd' }).lines[0]);
    expect(talkPlan('shigu', 'scholar', { flags: met, total: REGULAR_AFTER, today: 2, day: 'd' }).lines[0].zh).toContain('{名}');
    // the chat moves on with each talk of the day
    const a = talkPlan('liupo', 'scholar', { flags: F(metFlag('liupo')), total: 1, today: 1, day: '2026-09-26' }).lines[0];
    const b = talkPlan('liupo', 'scholar', { flags: F(metFlag('liupo')), total: 2, today: 2, day: '2026-09-26' }).lines[0];
    expect(a).not.toEqual(b);
  });
  it('say their case line while the case is open (the witnesses are the case\'s), and 三娘 her new line after the stele', () => {
    const open = { ...upTo('b5', 'case:hz:open'), ...F(...VILLAGER_KEYS.map(metFlag)) };
    for (const k of VILLAGER_KEYS) {
      const v = VILLAGERS[k];
      const l = talkPlan(k, 'scholar', { flags: open, total: 1, today: 1, day: 'd' }).lines[0];
      if (v.caseLine && !v.witness) expect(l, k).toEqual(v.caseLine);
    }
    expect(talkPlan('guiniang', 'scholar', { flags: { ...open, 'case:hz:found': true }, total: 1, today: 1, day: 'd' }).lines[0]).toEqual(VILLAGERS.guiniang.caseFound);
    const stele = { ...upTo('b8', 'case:hz:solved', 'ty:stele'), ...F(metFlag('sang')) };
    expect(talkPlan('sang', 'scholar', { flags: stele, total: 1, today: 0, day: 'd' }).lines[0].zh).toContain('四十年');
    // lines kept for after the case are not said before it
    const before = F(metFlag('qin'));
    for (let n = 0; n < 8; n++) expect(talkPlan('qin', 'scholar', { flags: before, total: n, today: n, day: 'd' }).lines.at(-1)!.zh).not.toContain('补上了');
  });
  it('stand somewhere (or are away) in every stretch of the story and every hour, on open ground', () => {
    const phases: Phase[] = ['arrive', 'feast', 'xu', 'hai', 'zi', 'case', 'dawn', 'farewell', 'chang'];
    const parts: Part[] = ['dawn', 'day', 'dusk', 'night'];
    for (const k of VILLAGER_KEYS) for (const ph of phases) for (const pt of parts) {
      const s = spotOf(k, ph, pt, upTo('b7', 'case:hz:open', 'case:hz:solved'), pt === 'dawn' ? 6 : 12);
      if (!s) continue;
      expect(Math.hypot(s.x, s.z), `${k} ${ph} ${pt}`).toBeLessThan(40);
    }
    // 夭夭 only at dawn at the spring, once met at B7
    expect(spotOf('yaoyao', 'chang', 'dawn', upTo('b8'), 6)).not.toBeNull();
    expect(spotOf('yaoyao', 'chang', 'dawn', upTo('b8'), 8)).toBeNull();
    expect(spotOf('yaoyao', 'chang', 'day', upTo('b8'), 12)).toBeNull();
    expect(spotOf('yaoyao', 'feast', 'day', upTo('b3'))).toBeNull();
    // 小满 is missing from 戌 on (he is hiding), and asleep in the hollow during the case
    expect(spotOf('xiaoman', 'xu', 'night', upTo('b4a'))).toBeNull();
    expect(spotOf('xiaoman', 'case', 'night', upTo('b5', 'case:hz:open'))).not.toBeNull();
    // the dancers stand on the ring round the pole
    for (const k of B4.dancers) { const s = STAGING.hai[k]!; expect(Math.abs(Math.hypot(s.x, s.z) - 3.4)).toBeLessThan(0.05); }
    // most spots are on walkable ground (the few that are not are snapped at runtime)
    let bad = 0, all = 0;
    for (const k of VILLAGER_KEYS) for (const s of [...Object.values(VILLAGERS[k].routine), ...Object.values(STAGING).map((x) => x[k])]) {
      if (!s || k === 'yaoyao') continue;
      all++;
      if (!walkAt(s.x, s.z)) bad++;
    }
    expect(bad / all).toBeLessThan(0.2);
    expect(partOf(6)).toBe('dawn'); expect(partOf(12)).toBe('day'); expect(partOf(18)).toBe('dusk'); expect(partOf(23)).toBe('night'); expect(partOf(3)).toBe('night');
  });
  it('are introduced in B3 — everyone but 夭夭', () => {
    expect(new Set(B3.order).size).toBe(12);
    expect(B3.order).not.toContain('yaoyao');
    // the stele's carved words are the card's, without the stops
    expect(STELE.card.bodyZh.replace(/[「」，。]/g, '')).toContain(STELE.text);
  });
});

describe("the owner's code", () => {
  it('opens nothing in 桃源: no door, no beat, no flag, no letter, no quest', () => {
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
    const f = play.value.flags;
    for (const k of Object.keys(f)) expect(/^(ty:|case:|mail:|char:|item:|met:|visit:taoyuan)/.test(k), k).toBe(false);
    expect(doorStateFor(f, inBox('ty-shide'))).toBe('hidden');
    expect(nextBeat(f)).toBe('b1');
    expect(phaseOf(f)).toBe('arrive');
    expect(questValue(QUEST['q-taoyuan'], play.value, state.value)).toBe(0);
    expect(questValue(QUEST['q-mingcha'], play.value, state.value)).toBe(0);
  });
});
