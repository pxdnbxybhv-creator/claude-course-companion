// The owner's code opens every 镜境 and every map in the mirror's lobby — and nothing else about
// the mirror changes (pay, bonuses and records follow the ordinary rules).
// m8 (chars.md §3.4/§4.3, sandbox.md §8, PLAN D18): it also opens every mirror companion (the 13 and the
// hidden three, in the mirror only) and lends 心镜 at full rank (never 回魂) and 心得 10 to the next 入镜,
// while 「按满阶」 is on. meta.heart / meta.mastery are never written; lent 福泽 never reaches the 铜钱 plan;
// no flag is set; revoking brings the earned values back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { play, emptyPlay, redeemCode, revokeCode, _acceptCodeForTests } from '../src/app/play';
import { state, emptyState } from '../src/app/store';
import { mirror, defaultMeta } from '../src/app/mirror';
import {
  charTag, enter, heartView, lendOn, lent, lobbyVisit, masteryView, abandon, openOf, setLendOn,
} from '../src/views/mirror/logic/session';
import {
  activeHeart, allUnlocked, coinPlan, fullRanks, heartFor, lentLuck, lentOf, MASTERY_MAX, masteryFor, masteryLevel, NEVER_LENT, newRun,
  waveSetup,
} from '../src/views/mirror/logic';
import { COMPANION_REG, DIFF_REG, HEART_REG, type HeartFaceId } from '../src/views/mirror/ids';
import { HIDDEN_CHARS, type MirrorMeta, type NewRunOpts, type RunSave } from '../src/views/mirror/types';
import { HEART, MASTERY } from '../src/views/mirror/data';

const DAY = '2026-09-27';
const code = () => { _acceptCodeForTests('TESTING'); expect(redeemCode('TESTING')).toBe('ok'); };
const ALL16 = COMPANION_REG.map((c) => c.id);

describe('the mirror under the owner code', () => {
  beforeEach(() => {
    play.value = emptyPlay();
    setLendOn(true);
  });
  afterEach(() => { revokeCode(); setLendOn(true); });

  it('offers only what was earned without the code', () => {
    expect(openOf({ diffMax: 1, mapsOpen: 1 })).toEqual({ diffMax: 1, mapsOpen: 1, chars: ['scholar'] });
  });

  it('opens every difficulty and map while the code is active, and closes them again when it is taken back', () => {
    code();
    expect(openOf({ diffMax: 1, mapsOpen: 1 })).toMatchObject({ diffMax: DIFF_REG.length - 1, mapsOpen: 3 });
    revokeCode();
    expect(openOf({ diffMax: 1, mapsOpen: 1 })).toEqual({ diffMax: 1, mapsOpen: 1, chars: ['scholar'] });
  });

  it('opens every mirror companion (the 13 and the hidden three) while the code is on, and none after', () => {
    expect(ALL16.length).toBe(16);
    code();
    expect([...openOf({ diffMax: 0, mapsOpen: 1 }).chars].sort()).toEqual([...ALL16].sort());
    for (const id of HIDDEN_CHARS) expect(charTag({ bests: {} }, id)).toBe('code');
    expect(charTag({ bests: {} }, 'scholar')).toBeNull();
    revokeCode();
    expect(openOf({ diffMax: 0, mapsOpen: 1 }).chars).toEqual(['scholar']);
    for (const id of HIDDEN_CHARS) expect(charTag({ bests: {} }, id)).toBeNull();
  });
});

describe('the lent 心镜 and 心得 (pure helpers)', () => {
  const earned: Pick<MirrorMeta, 'heart' | 'mastery'> = {
    heart: { ranks: { heartHp: 2, heartLuck: 1, heartReroll: 3, heartRevive: 0 }, pick: { 2: 'B' }, plain: false },
    mastery: { gardener: 25, scholar: 0 },
  };

  it('without lending, heartFor is exactly activeHeart', () => {
    expect(heartFor(earned, false)).toEqual(activeHeart(earned));
    expect(masteryFor(earned, 'gardener', false)).toBe(masteryLevel(25));
  });

  it('lends every picked face at its last rank, never 回魂 above what was earned, nothing under 素镜', () => {
    const h = heartFor(earned, true);
    const full = fullRanks();
    for (const f of HEART_REG) {
      const picked = ((earned.heart.pick as Record<number, 'A' | 'B'>)[f.pair] ?? 'A') === f.side;
      if (!picked) expect(h[f.id]).toBeUndefined();
      else if (NEVER_LENT.includes(f.id)) expect(h[f.id]).toBeUndefined(); // 回魂 earned 0 stays 0
      else expect(h[f.id]).toBe(full[f.id]);
    }
    expect(h.heartReroll).toBe(HEART.heartReroll.costs.length); // pair 2 picked on B
    expect(h.heartMoon).toBeUndefined();
    // 回魂 keeps its earned rank (1 of 1 here: that is the owner's own, not lent)
    const withRevive = { ...earned, heart: { ...earned.heart, ranks: { ...earned.heart.ranks, heartRevive: 1 } } };
    expect(heartFor(withRevive, true).heartRevive).toBe(1);
    expect(lentOf(withRevive, 'gardener', false).heart.heartRevive).toBeUndefined();
    expect(heartFor({ heart: { ...earned.heart, plain: true } }, true)).toEqual({});
    expect(masteryFor(earned, 'gardener', true)).toBe(MASTERY_MAX);
    expect(MASTERY_MAX).toBe(MASTERY.length);
  });

  it('records what was lent above the earned values, and the 福缘 in it', () => {
    const l = lentOf(earned, 'gardener', false);
    expect(l.heart.heartHp).toBe(HEART.heartHp.costs.length - 2);
    expect(l.heart.heartLuck).toBe(HEART.heartLuck.costs.length - 1);
    expect(l.heart.heartRevive).toBeUndefined();
    expect(l.mastery).toBe(MASTERY_MAX - masteryLevel(25));
    expect(lentLuck({ lent: l })).toBe((HEART.heartLuck.costs.length - 1) * HEART.heartLuck.per.luck!);
    expect(lentLuck({})).toBe(0);
    expect(lentOf(earned, 'gardener', true).heart).toEqual({});
  });
});

describe('the 铜钱 plan is the same with and without lent 福泽', () => {
  const base = (o: Partial<NewRunOpts>): NewRunOpts => ({
    seed: 1, char: 'fisher', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 3, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  });
  it('over 40 seeds × 30 waves (and the luck is really there: without the subtraction the plan changes)', () => {
    const m = defaultMeta(DAY);
    const earned: Pick<MirrorMeta, 'heart' | 'mastery'> = { heart: { ranks: {}, pick: {}, plain: false }, mastery: {} };
    let differs = 0;
    const now = new Date(2026, 8, 27, 10);
    for (let seed = 1; seed <= 40; seed++) {
      const own = newRun(base({ seed, heart: heartFor(earned, false) }));
      const lentRun: RunSave = { ...newRun(base({ seed, heart: heartFor(earned, true) })), lent: lentOf(earned, 'fisher', false) };
      expect(lentLuck(lentRun)).toBe(HEART.heartLuck.costs.length * HEART.heartLuck.per.luck!);
      for (let w = 1; w <= 30; w++) {
        const a = waveSetup({ ...own, wave: w - 1, inWave: w }, m, now).coins;
        const b = waveSetup({ ...lentRun, wave: w - 1, inWave: w }, m, now);
        expect(b.coins).toEqual(a);
        expect(b.stats.luck).toBeGreaterThan(waveSetup({ ...own, wave: w - 1, inWave: w }, m, now).stats.luck);
        const raw = coinPlan({ ...lentRun, wave: w - 1, inWave: w }, w, b.stats.luck, m, DAY);
        if (JSON.stringify(raw) !== JSON.stringify(a)) differs++;
      }
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('入镜 with the code: lent, reversible, and meta untouched', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10, 0, 0));
    state.value = emptyState();
    play.value = { ...emptyPlay(), coins: 200 };
    const m0 = defaultMeta(DAY);
    mirror.value = {
      ...m0, dust: 33, mastery: { gardener: 25 },
      heart: { ranks: { heartHp: 1, heartLuck: 2 }, pick: {}, plain: false },
      lobby: { ...m0.lobby, char: 'gardener' },
    };
    setLendOn(true);
  });
  afterEach(() => { revokeCode(); setLendOn(true); vi.useRealTimers(); });
  const opts = { char: 'gardener' as const, map: 'lake' as const, diff: 1 as const, vows: {}, daily: false, plain: false };

  it('lends full 心镜 (no 回魂) and 心得 10, records it on the run, and never writes meta.heart / meta.mastery', () => {
    code();
    const heart0 = structuredClone(mirror.value.heart);
    const mastery0 = structuredClone(mirror.value.mastery);
    const flags0 = JSON.stringify(play.value.flags);
    expect(lent()).toBe(true);
    const hv = heartView(mirror.value);
    expect(hv.lent).toBe(true);
    expect(hv.own).toEqual(mirror.value.heart.ranks);
    for (const f of HEART_REG) expect(hv.ranks[f.id]).toBe(NEVER_LENT.includes(f.id) ? mirror.value.heart.ranks[f.id] : HEART[f.id].costs.length);
    expect(masteryView(mirror.value, 'gardener')).toMatchObject({ level: MASTERY_MAX, own: masteryLevel(25), lent: true });

    const e = enter(opts);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.run.char).toBe('gardener'); // earned in the app only through the code's roster
    expect(e.run.heart).toEqual(heartFor(mirror.value, true));
    expect(e.run.heart.heartRevive).toBeUndefined();
    expect(e.run.heart.heartHp).toBe(HEART.heartHp.costs.length);
    expect(e.run.lent).toEqual({ heart: lentOf({ heart: heart0, mastery: mastery0 }, 'gardener', false).heart, mastery: MASTERY_MAX - masteryLevel(25) });
    // 心得 3+ gives 园丁 the choice of a second starting weapon (the one thing a level does in play)
    expect(e.run.pending.start?.length ?? 0).toBe(2);
    expect(mirror.value.heart).toEqual(heart0);
    expect(mirror.value.mastery).toEqual(mastery0);
    expect(JSON.stringify(play.value.flags)).toBe(flags0);
    abandon();
    expect(mirror.value.heart).toEqual(heart0);
    expect(JSON.stringify(play.value.flags)).toBe(flags0);
  });

  it('「按自有」 with the code on: the earned values go in and nothing is recorded as lent', () => {
    code();
    setLendOn(false);
    expect(lendOn.value).toBe(false);
    expect(lent()).toBe(false);
    expect(heartView(mirror.value)).toMatchObject({ lent: false, code: true });
    expect(masteryView(mirror.value, 'gardener')).toMatchObject({ level: masteryLevel(25), lent: false });
    const e = enter(opts);
    expect(e.ok && e.run.heart).toEqual(activeHeart(mirror.value));
    expect(e.ok && e.run.lent).toBeUndefined();
  });

  it('a hidden companion goes in with the code; after revoking, the lobby falls back and the earned values return', () => {
    code();
    const hid = HIDDEN_CHARS[0];
    const e = enter({ ...opts, char: hid });
    expect(e.ok && e.run.char).toBe(hid);
    abandon();
    mirror.value = { ...mirror.value, lobby: { ...mirror.value.lobby, char: hid } };
    revokeCode();
    expect(lent()).toBe(false);
    expect(heartView(mirror.value).lent).toBe(false);
    expect(masteryView(mirror.value, 'gardener')).toMatchObject({ level: masteryLevel(25), lent: false });
    lobbyVisit();
    expect(mirror.value.lobby.char).toBe('scholar');
    const f = enter({ ...opts, char: hid });
    expect(f.ok && f.run.char).toBe('scholar');
    expect(f.ok && f.run.lent).toBeUndefined();
    expect(f.ok && f.run.heart).toEqual(activeHeart(mirror.value));
  });

  it('the code never changes the fee: a lent run still costs the ordinary 20 after the free one', () => {
    code();
    const a = enter(opts);
    expect(a.ok && a.run.free).toBe(true);
    abandon();
    const coins = play.value.coins;
    const b = enter(opts);
    expect(b.ok && b.run.free).toBe(false);
    expect(play.value.coins).toBe(coins - 20);
  });

  it('a lent heart never lends a face of the other side', () => {
    const ids = Object.keys(heartFor(mirror.value, true)) as HeartFaceId[];
    for (const id of ids) expect(HEART_REG.find((f) => f.id === id)!.side).toBe('A');
  });
});
