// 水月幻镜 · m8 · real play never sees the 模拟场 (sandbox.md §5.3, §11; acceptance A-S2): after a sandbox with
// overrides and its exit, the real session's run, wave setup and shop equal those of a process that never saw
// one; on the real engine, playReal (琴师, seed 7927, 月湖 照影, the average bot, godmode to 30, to wave 32) gives
// the same trace before the sandbox and after it (and a different one while the overrides are on). The guard:
// if tuning were somehow still on, 入镜 and the wave start restore the tables first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mirror, defaultMeta } from '../src/app/mirror';
import { play, emptyPlay } from '../src/app/play';
import { state, emptyState } from '../src/app/store';
import {
  allUnlocked, beginTuning, computeStats, leaves, newRun, openShop, same, setValue, TUNABLE, tuningActive, valueOf, waveSetup,
} from '../src/views/mirror/logic';
import { abandon, enter, startWave } from '../src/views/mirror/logic/session';
import { createSandSession, leaveSand, openSand } from '../src/views/mirror/ui/sand/session';
import { playReal } from '../src/views/mirror/sim/realbal';
import type { RunSave } from '../src/views/mirror/types';

const DAY = '2026-09-27';
const tables = () => Object.fromEntries(TUNABLE.map((t) => [t.id, t.obj]));
const PRISTINE = structuredClone(tables());

function fixed(): RunSave {
  const r = newRun({
    seed: 4242, char: 'gardener', map: 'forest', diff: 2, vows: {}, daily: false, plain: false, heart: {}, ticket: 2, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
  return { ...r, wave: 17, moon: 400, weapons: [{ id: 'qingfeng', t: 3 }, { id: 'hoe', t: 2 }] };
}
/** A sandbox session with every table touched here and there, run for a wave, then left. */
function sandboxSession(): void {
  openSand();
  const L = leaves().filter((l) => !l.ro && (l.kind === 'boolean' || Number.isFinite(valueOf(l.path) as number)));
  for (let i = 0; i < 200; i++) {
    const l = L[(i * 131 + 7) % L.length];
    const v = valueOf(l.path);
    setValue(l.path, typeof v === 'boolean' ? !v : (v as number) * 0.7 + 2);
  }
  const s = createSandSession({
    char: 'musician', map: 'lake', diff: 1, vows: {}, wave: 30, seed: 5, heart: 'full', mastery: 'full', pool: 'all', build: 'bare', today: DAY, arrive: 'fight',
  });
  s.setSheet([{ id: 'hp', mode: 'set', v: 5 }, { id: 'curse', mode: 'add', v: 9 }]);
  s.startWave(s.run());
  const r = leaveSand();
  expect(r.exact).toBe(true);
}

describe('real play after the sandbox', () => {
  afterEach(() => { if (tuningActive()) leaveSand(); vi.useRealTimers(); });

  it('the logic gives what a process that never saw a sandbox gives', () => {
    const run = fixed();
    const meta = defaultMeta(DAY);
    const now = new Date(2026, 8, 27, 12);
    const want = JSON.stringify({ setup: waveSetup({ ...run, inWave: 18 }, meta, now), shop: openShop(run, allUnlocked()).shop, stats: computeStats(run) });
    sandboxSession();
    expect(same(tables(), PRISTINE)).toBe(true);
    expect(JSON.stringify({ setup: waveSetup({ ...run, inWave: 18 }, meta, now), shop: openShop(run, allUnlocked()).shop, stats: computeStats(run) })).toBe(want);
  });

  it('the guard: 入镜 and the wave start restore the tables if tuning were still on', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10, 0, 0));
    state.value = emptyState();
    play.value = { ...emptyPlay(), coins: 100 };
    mirror.value = defaultMeta(DAY);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    beginTuning();
    expect(setValue('F.startMoon', 999)).toBe('ok');
    const e = enter({ char: 'scholar', map: 'lake', diff: 0, vows: {}, daily: false, plain: false });
    expect(tuningActive()).toBe(false);
    expect(same(tables(), PRISTINE)).toBe(true);
    expect(e.ok && e.run.moon).not.toBe(999);
    beginTuning();
    expect(setValue('F.startMoon', 999)).toBe('ok');
    startWave(mirror.value.active!);
    expect(tuningActive()).toBe(false);
    expect(same(tables(), PRISTINE)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    abandon();
  });

  it('on the real engine, a playReal trace after a sandbox session is identical to the one before it', () => {
    const o = { seed: 7927, char: 'musician' as const, map: 'lake' as const, diff: 1 as const, level: 'average' as const, godTo: 30, maxWave: 32 };
    const { msPerStep: _a, ...base } = playReal(o);
    void _a;
    // with overrides on, the same run plays differently (the tables are live for the engine too)
    openSand();
    const pid = 'zhiyin';
    const dmgPath = `PASSIVES.${pid}.p.dmg`;
    if (typeof valueOf(dmgPath) === 'number') expect(setValue(dmgPath, 0)).toBe('ok');
    expect(setValue('COMPANIONS.musician.hp', 10)).toBe('ok');
    const { msPerStep: _b, ...tuned } = playReal(o);
    void _b;
    expect(tuned.trace).not.toEqual(base.trace);
    expect(leaveSand().exact).toBe(true);
    sandboxSession();
    const { msPerStep: _c, ...after } = playReal(o);
    void _c;
    expect(after).toEqual(base);
  }, 180_000);
});
