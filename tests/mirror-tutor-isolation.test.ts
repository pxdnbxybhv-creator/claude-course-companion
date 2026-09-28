// 水月幻镜 · the tutorial touches nothing but its own flags (d-tutorial §5.2): a whole practice run
// through its session — waves with kills, levels, a casket and a forged sleeve coin, and every shop
// action — leaves the purse, the counters, the day's free run, the codex, tallies, deeds, mastery,
// records, bests and a paused real run exactly as they were. Its exits settle nothing; its flags
// sanitise; the owner's code plays no part (a code-active case uses the test code only).
import { beforeEach, describe, expect, it } from 'vitest';
import type { MirrorMeta, RunSave, WaveResult } from '../src/views/mirror/types';
import { mirror, defaultMeta } from '../src/app/mirror';
import { play, emptyPlay, redeemCode, _acceptCodeForTests } from '../src/app/play';
import { allUnlocked, buy, merge, newRun, pickCard, reroll, resolveCrate, sell, toggleLock, openShop } from '../src/views/mirror/logic';
import { realSession, resetTips, setTutor } from '../src/views/mirror/logic/session';
import { createTutorSession } from '../src/views/mirror/tutor/session';
import { tutorRun, tutorUnlocks } from '../src/views/mirror/tutor/run';
import { markTip, tipDue, tutorOf } from '../src/views/mirror/ui/tips';

const DAY = '2026-09-28';
const coin = { kind: 'cashTen', worth: 10, src: 'elite' } as const;
const won = (w: number, o: Partial<WaveResult> = {}): WaveResult => ({
  wave: w, moon: 30, xp: 40, field: 3, storeLeft: 0, levels: 2, crates: 1, hearts: [], sleeve: [coin], lives: 0, once: [], drunk: 0,
  stats: { kills: 25, elites: 1 }, killsBy: { blot: 20, whitesnake: 1 }, byWeapon: { qingfeng: { dmg: 400, kills: 25 } }, bosses: [], ms: 50_000, ...o,
});
const without = (m: MirrorMeta) => { const { tutor: _t, ...rest } = m; void _t; return rest; };

/** A real paused run, so its untouched state can be checked. */
function realRun(): RunSave {
  return newRun({
    seed: 77, char: 'painter', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 3, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
}

/** Play the practice run from its first wave to the end card, doing every shop and screen action. */
function playThrough(): RunSave {
  const s = createTutorSession(tutorRun(DAY));
  const u = tutorUnlocks();
  for (let w = 1; w <= 3; w++) {
    const { run: r } = s.startWave(s.run());
    expect(r.inWave).toBe(w);
    let next = s.waveWon(won(w))!;
    expect(next.coins).toBe(0); // the forged sleeve coin is dropped
    // cards, the casket, then the shop — through the session like the view does
    while (next.pending.cards > 0) { next = pickCard(next, 0); s.commit(next); }
    while (next.pending.crates > 0) { next = resolveCrate(next, next.pending.crates % 2 === 0, u); s.commit(next); }
    next = openShop(next, u); s.commit(next);
    if (w === 1) {
      s.grant();
      next = s.run();
      const b = buy(next, 0); if (b) { next = b; s.commit(next); }
      const m = merge(next, 0, 1); if (m) { next = m; s.commit(next); }
      next = toggleLock(next, 2); s.commit(next);
      const rr = reroll(next, u); if (rr) { next = rr; s.commit(next); }
      const b2 = buy(next, 1); if (b2) { next = b2; s.commit(next); }
      if (next.weapons.length > 1) { next = sell(next, next.weapons.length - 1); s.commit(next); }
    }
    s.markSeen(['wpn:qingfeng', 'mon:blot']);
  }
  // every other exit settles nothing
  expect(s.died({ wave: 4, partial: won(4), cause: 'blot' })).toBeNull();
  expect(s.leaveMidWave()).toEqual({ interruptions: 0, report: null });
  expect(s.abandon()).toBeNull();
  expect(s.engineFailed()).toBeNull();
  return s.run();
}

describe('the practice run leaves everything but its flags alone', () => {
  beforeEach(() => {
    play.value = { ...emptyPlay(), coins: 137, counters: { 'mirror:paid': 4, 'mirror:runs': 9, 'mirror:coin': 12, 'mirror:best': 14 } };
  });
  for (const paused of [false, true]) {
    it(`with ${paused ? 'a paused real run' : 'no run'} in the mirror`, () => {
      const m0: MirrorMeta = {
        ...defaultMeta(DAY), active: paused ? realRun() : null, dust: 44, codex: { 'char:painter': 2 }, tally: { 'kill:blot': 99 },
        deeds: { swordKills: 12 }, mastery: { painter: 30 }, records: { bigHit: 50 }, bests: { 'painter|lake|1|0': { wave: 7, heat: 0, at: DAY } },
        payDay: { day: DAY, runs: 1, free: true, paid: 20, drops: 3, refunded: false }, ticketsUsed: 3, owed: 0, coinsPaid: 12,
      };
      mirror.value = m0;
      const purse = JSON.stringify(play.value);
      const end = playThrough();
      expect(end.wave).toBe(3);
      expect(JSON.stringify(play.value)).toBe(purse);
      expect(mirror.value).toBe(m0); // not even a new object: the session never wrote meta
      // the flags are the only write: the end card sets done (and offered)
      setTutor({ done: true });
      expect(without(mirror.value)).toEqual(without(m0));
      expect(tutorOf(mirror.value)).toEqual({ offered: true, done: true, tips: {} });
      // a second run through changes nothing more
      const after = mirror.value;
      playThrough();
      setTutor({ done: true });
      expect(mirror.value).toEqual(after);
      expect(JSON.stringify(play.value)).toBe(purse);
    });
  }
  it('skipping sets only offered; the real session is a different object', () => {
    mirror.value = defaultMeta(DAY);
    setTutor({ offered: true });
    expect(tutorOf(mirror.value)).toEqual({ offered: true, done: false, tips: {} });
    expect(without(mirror.value)).toEqual(without(defaultMeta(DAY)));
    expect(createTutorSession().practice).toBe(true);
    expect(realSession.practice).toBe(false);
  });
  it('tips mark once, reset, and respect 新手提示', () => {
    mirror.value = defaultMeta(DAY);
    expect(tipDue(mirror.value, 'boss')).toBe(true);
    markTip('boss');
    expect(tipDue(mirror.value, 'boss')).toBe(false);
    expect(tutorOf(mirror.value).tips).toEqual({ boss: true });
    expect(without(mirror.value)).toEqual(without(defaultMeta(DAY)));
    resetTips();
    expect(tipDue(mirror.value, 'boss')).toBe(true);
    mirror.value = { ...mirror.value, settings: { ...mirror.value.settings, tips: false } };
    expect(tipDue(mirror.value, 'boss')).toBe(false);
  });
  it('the owner\'s code does not change the practice run', () => {
    mirror.value = defaultMeta(DAY);
    play.value = emptyPlay();
    const plain = playThrough();
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
    const coded = playThrough();
    expect(coded).toEqual(plain);
    expect(tutorRun(DAY)).toEqual(tutorRun(DAY));
  });
});
