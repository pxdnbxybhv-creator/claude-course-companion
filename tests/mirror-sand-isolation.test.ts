// 水月幻镜 · m8 · the 模拟场 touches nothing (sandbox.md §2, §11; acceptance A-S1, A-C2): with the owner's code on,
// a whole sandbox — start at 30 with the bot's build, three waves won (each with a forged sleeve coin), a death
// and its replay, every shop and screen action, rerolls, sheet edits, 30 table edits, then leave — leaves the
// purse, the counters, the flags, meta (the paused real run, codex, tallies, deeds, bests, records, mastery,
// 心镜, 镜屑, the day's pay) exactly as they were, writes no storage, offers no revive, and puts every table back.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MirrorMeta, RunSave, WaveResult } from '../src/views/mirror/types';
import { mirror, defaultMeta } from '../src/app/mirror';
import { play, emptyPlay, redeemCode, revokeCode, _acceptCodeForTests } from '../src/app/play';
import {
  allUnlocked, buy, leaves, merge, newRun, openShop, pickCard, reroll, resolveCrate, same, screenOf, sell, setValue, toggleLock, TUNABLE,
  tuningActive, valueOf,
} from '../src/views/mirror/logic';
import { realSession } from '../src/views/mirror/logic/session';
import { createSandSession, leaveSand, openSand, type SandSetup } from '../src/views/mirror/ui/sand/session';

const DAY = '2026-09-30';
const coin = { kind: 'cashTen', worth: 10, src: 'elite' } as const;
const won = (w: number, o: Partial<WaveResult> = {}): WaveResult => ({
  wave: w, moon: 300, xp: 400, field: 3, storeLeft: 0, levels: 2, crates: 1, hearts: [], sleeve: [coin], lives: 0, once: [], drunk: 0,
  stats: { kills: 180, elites: 1 }, killsBy: { blot: 170, whitesnake: 1 }, byWeapon: { qingfeng: { dmg: 40000, kills: 180 } }, bosses: [], ms: 58_000, ...o,
});
const tables = () => Object.fromEntries(TUNABLE.map((t) => [t.id, t.obj]));
const PRISTINE = structuredClone(tables());

function realRun(): RunSave {
  return newRun({
    seed: 77, char: 'painter', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 3, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
}
const setup = (o: Partial<SandSetup> = {}): SandSetup => ({
  char: 'musician', map: 'forest', diff: 3, vows: {}, wave: 30, seed: 99, heart: 'full', mastery: 'full', pool: 'all', build: 'bot',
  today: DAY, arrive: 'shop', ...o,
});

/** Walk the between-waves screens the way the view does, doing every shop action once. */
function between(s: ReturnType<typeof createSandSession>, first: boolean): void {
  const u = s.unlocks();
  let next = s.run();
  let guard = 0;
  while (screenOf(next) !== 'shop' && guard++ < 50) {
    const sc = screenOf(next);
    if (sc === 'cards') next = pickCard(next, 0);
    else if (sc === 'crate') next = resolveCrate(next, true, u);
    else break;
    s.commit(next);
  }
  next = openShop(next, u); s.commit(next);
  if (first) {
    next = { ...next, moon: next.moon + 5000 }; s.commit(next);
    const b = buy(next, 0); if (b) { next = b; s.commit(next); }
    const m = merge(next, 0, 1); if (m) { next = m; s.commit(next); }
    next = toggleLock(next, 2); s.commit(next);
    for (let k = 0; k < 3; k++) { const rr = reroll(next, u); if (rr) { next = rr; s.commit(next); } }
    const b2 = buy(next, 1); if (b2) { next = b2; s.commit(next); }
    if (next.weapons.length > 1) { next = sell(next, next.weapons.length - 1); s.commit(next); }
  }
  s.markSeen(['wpn:qingfeng', 'mon:blot']);
}

describe('the 模拟场 leaves everything alone', () => {
  let writes: string[] = [];
  const store = new Map<string, string>();
  beforeEach(() => {
    play.value = { ...emptyPlay(), coins: 137, counters: { 'mirror:paid': 4, 'mirror:runs': 9, 'mirror:coin': 12, 'mirror:best': 14, 'mirror:revive': 1 } };
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
  });
  afterEach(() => {
    revokeCode();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    if (tuningActive()) leaveSand();
  });

  for (const paused of [false, true]) {
    it(`with ${paused ? 'a paused real run' : 'no run'} in the mirror`, () => {
      const m0: MirrorMeta = {
        ...defaultMeta(DAY), active: paused ? realRun() : null, dust: 44, codex: { 'char:painter': 2 }, tally: { 'kill:blot': 99 },
        deeds: { swordKills: 12 }, mastery: { painter: 30, musician: 5 }, records: { bigHit: 50 }, bests: { 'painter|lake|1|0': { wave: 7, heat: 0, at: DAY } },
        heart: { ranks: { heartHp: 1 }, pick: {}, plain: false },
        payDay: { day: DAY, runs: 1, free: true, paid: 20, drops: 3, refunded: false }, ticketsUsed: 3, owed: 0, coinsPaid: 12,
      };
      mirror.value = m0;
      const purse = JSON.stringify(play.value);
      const pausedRun = m0.active ? JSON.stringify(m0.active) : null;
      // from here on, any storage write is caught
      writes = [];
      store.clear();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k); store.set(k, v); },
        removeItem: (k: string) => { writes.push('-' + k); store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0,
      };

      openSand();
      // 30 table edits (numbers ×1.3 + 1, booleans flipped) before the run exists
      const L = leaves().filter((l) => !l.ro && (l.kind === 'boolean' || Number.isFinite(valueOf(l.path) as number)));
      for (let i = 0; i < 30; i++) {
        const l = L[(i * 97) % L.length];
        const v = valueOf(l.path);
        expect(setValue(l.path, typeof v === 'boolean' ? !v : (v as number) * 1.3 + 1)).toBe('ok');
      }
      const s = createSandSession(setup());
      expect(s.sandbox).toBe(true);
      expect(s.practice).toBe(false);
      // no revive: the view passes the engine no `downed` hook without these
      expect(s.payRevive).toBeUndefined();
      expect(s.wentDown).toBeUndefined();
      expect(s.reviveFailed).toBeUndefined();
      expect(s.run().wave).toBe(29);
      expect(s.run().shop).not.toBeNull(); // arrived at the shop
      s.setSheet([{ id: 'aspd', mode: 'add', v: 100 }, { id: 'curse', mode: 'add', v: 5 }, { id: 'speed', mode: 'set', v: -50 }, { id: 'hp', mode: 'add', v: 40 }]);
      expect(s.run().sand?.curse).toBe(5);
      // 写进同伴底子: a sheet row becomes a data edit (tuning only), the tool switches change nothing stored
      expect(s.bake('hp')).toBe(`COMPANIONS.${s.run().char}.hp`);
      s.setTools({ god: true, cdX: 0, timeScale: 3, nums: 2 });
      expect(s.measure()).toBe(false); // no engine, no window

      for (let w = 30; w <= 32; w++) {
        const { run: r, setup: st } = s.startWave(s.run());
        expect(r.inWave).toBe(w);
        expect(st.coins).toEqual([]);
        const next = s.waveWon(won(w))!;
        expect(next.coins).toBe(0); // the forged sleeve coin is dropped
        expect(next.wave).toBe(w);
        between(s, w === 30);
      }
      // a death, then 重打此重 from the run as it was before the wave
      const { run: r33 } = s.startWave(s.run());
      expect(s.died({ wave: 33, partial: won(33, { ms: 41_000 }), cause: 'blot' })).toBeNull();
      expect(s.lastDeath()).toMatchObject({ wave: 33, t: 41, cause: 'blot' });
      const again = s.replay()!;
      expect(again.run.inWave).toBe(33);
      expect(again.run.wave).toBe(r33.wave);
      // every other exit settles nothing
      expect(s.leaveMidWave()).toEqual({ interruptions: 0, report: null });
      expect(s.abandon()).toBeNull();
      expect(s.engineFailed()).toBeNull();
      expect(s.log().map((x) => x.end)).toEqual(['won', 'won', 'won', 'died']);

      const res = leaveSand();
      expect(res.exact).toBe(true);
      expect(tuningActive()).toBe(false);
      expect(same(tables(), PRISTINE)).toBe(true);
      expect(writes).toEqual([]);
      expect(JSON.stringify(play.value)).toBe(purse);
      expect(mirror.value).toBe(m0); // not even a new object: the sandbox never wrote meta
      if (pausedRun) expect(JSON.stringify(mirror.value.active)).toBe(pausedRun);
      // the real session is a different object, with the revive
      expect(realSession.sandbox).toBeUndefined();
      expect(typeof realSession.payRevive).toBe('function');
    });
  }
});
