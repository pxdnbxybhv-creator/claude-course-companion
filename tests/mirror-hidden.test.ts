// 水月幻镜 · round 8, HIDDEN (build plan §4.H, hidden.md §2.2, §7; orchestrator O2): the 40重 unlock and the
// code's overlay for the hidden three. 40 on that map on ANY 镜境 opens its companion (闲游 counts: O2), derived from
// meta.bests (retroactive, no save field); the daily writes no bests; the code opens all 16 in the mirror only.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { play, emptyPlay, redeemCode, revokeCode, unlocked, _acceptCodeForTests } from '../src/app/play';
import { mirror, defaultMeta, sanitizeMirror } from '../src/app/mirror';
import { enter, abandon, lobbyVisit, openOf, charTag, setLendOn } from '../src/views/mirror/logic/session';
import { allUnlocked, newRun, settleMeta } from '../src/views/mirror/logic';
import {
  HIDDEN_BY_MAP, HIDDEN_MIN_DIFF, HIDDEN_TEASE_WAVE, HIDDEN_WAVE, deepestOn, hiddenMap, hiddenOpen, hiddenTease,
} from '../src/views/mirror/logic/hidden';
import { COMPANION_REG } from '../src/views/mirror/ids';
import { HIDDEN_CHARS, type MirrorMeta, type NewRunOpts, type RunSave } from '../src/views/mirror/types';

const DAY = '2026-09-27';
type Bests = MirrorMeta['bests'];
const B = (k: string, wave: number): Bests => ({ [k]: { wave, heat: 0, at: DAY } }) as unknown as Bests;
const code = () => { _acceptCodeForTests('TESTING'); expect(redeemCode('TESTING')).toBe('ok'); };
function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 7, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const runAt = (wave: number, o: Partial<NewRunOpts> = {}): RunSave => ({ ...newRun(opts(o)), wave });

describe('m8 hidden · the 40重 unlock (deepestOn / hiddenOpen)', () => {
  it('the constants: one map each, wave 40, any 镜境 (O2)', () => {
    expect(HIDDEN_BY_MAP).toEqual({ lake: 'yuenv', forest: 'shangui', palace: 'houyi' });
    expect(HIDDEN_WAVE).toBe(40);
    expect(HIDDEN_MIN_DIFF).toBe(0);
    for (const id of HIDDEN_CHARS) expect(HIDDEN_BY_MAP[hiddenMap(id)]).toBe(id);
  });

  it('40 on 月湖 at 照影 opens 越女 only; 39 opens none', () => {
    expect(hiddenOpen({ bests: B('yuenv|lake|1|0', 40) })).toEqual(['yuenv']);
    expect(hiddenOpen({ bests: B('scholar|lake|1|0', 39) })).toEqual([]);
    expect(hiddenOpen({ bests: {} as Bests })).toEqual([]);
  });

  it('闲游 (diff 0) counts now (the owner: 「分别在三个地图达到四十重之后解锁」)', () => {
    expect(hiddenOpen({ bests: B('scholar|lake|0|0', 40) })).toEqual(['yuenv']);
    expect(deepestOn({ bests: B('scholar|lake|0|0', 41) }, 'lake')).toBe(41);
    // the minDiff parameter still filters when asked
    expect(deepestOn({ bests: B('scholar|lake|0|0', 41) }, 'lake', 1)).toBe(0);
  });

  it('a 素镜 (|p) key counts; any companion, 誓 or 镜境 in the key; each map opens its own', () => {
    expect(hiddenOpen({ bests: B('cat|forest|4|3|p', 45) })).toEqual(['shangui']);
    expect(hiddenOpen({ bests: B('musician|palace|2|1', 40) })).toEqual(['houyi']);
    const all = { ...B('a|lake|1|0', 40), ...B('b|forest|0|0', 50), ...B('c|palace|5|2|p', 40), ...B('d|lake|3|0', 12) } as Bests;
    expect(hiddenOpen({ bests: all })).toEqual(['yuenv', 'shangui', 'houyi']);
    expect(deepestOn({ bests: all }, 'lake')).toBe(40);
  });

  it('the sealed tiles show from any map\'s deepest 30 (any 镜境)', () => {
    expect(HIDDEN_TEASE_WAVE).toBe(30);
    expect(hiddenTease({ bests: B('scholar|forest|0|0', 29) })).toBe(false);
    expect(hiddenTease({ bests: B('scholar|forest|0|0', 30) })).toBe(true);
  });
});

describe('m8 hidden · settleMeta reports a new companion once', () => {
  it('clearing 40 on 墨林 (闲游) reports 山鬼; the same again reports nothing new', () => {
    const r = runAt(40, { map: 'forest', diff: 0 });
    const a = settleMeta(defaultMeta(DAY), r, 'death', DAY);
    expect(a.report.chars).toEqual(['shangui']);
    expect(hiddenOpen(a.meta)).toEqual(['shangui']);
    const b = settleMeta(a.meta, runAt(42, { map: 'forest', diff: 2 }), 'death', DAY);
    expect(b.report.chars ?? []).toEqual([]);
  });

  it('39 reports nothing; a daily run writes no bests, so it never opens one', () => {
    expect(settleMeta(defaultMeta(DAY), runAt(39, { map: 'palace' }), 'death', DAY).report.chars ?? []).toEqual([]);
    const d = settleMeta(defaultMeta(DAY), runAt(45, { map: 'lake', daily: true }), 'death', DAY);
    expect(d.report.chars ?? []).toEqual([]);
    expect(hiddenOpen(d.meta)).toEqual([]);
  });

  it('it is retroactive: an old save that already holds a 40 opens the companion with no new field', () => {
    const m = sanitizeMirror({ ...defaultMeta(DAY), bests: B('guan|palace|1|0', 44) }, DAY);
    expect(hiddenOpen(m)).toEqual(['houyi']);
    expect(Object.keys(defaultMeta(DAY))).not.toContain('hidden');
  });
});

describe('m8 hidden · the code overlay and the store', () => {
  beforeEach(() => { play.value = emptyPlay(); setLendOn(true); mirror.value = defaultMeta(DAY); });
  afterEach(() => { revokeCode(); setLendOn(true); });

  it('with the code all 16 open (the hidden three tagged), and settling a run changes nothing the code could touch', () => {
    const before = settleMeta(defaultMeta(DAY), runAt(12, { char: 'yuenv' }), 'death', DAY);
    code();
    const chars = openOf(mirror.value).chars;
    expect([...chars].sort()).toEqual(COMPANION_REG.map((c) => c.id).sort());
    for (const id of HIDDEN_CHARS) expect(charTag(mirror.value, id)).toBe('code');
    const app = [...unlocked.value];
    const p0 = JSON.stringify(play.value);
    const under = settleMeta(defaultMeta(DAY), runAt(12, { char: 'yuenv' }), 'death', DAY);
    // byte-identical to the settle without the code: the code writes nothing into meta
    expect(JSON.stringify(under)).toBe(JSON.stringify(before));
    expect(under.report.chars ?? []).toEqual([]);
    expect(JSON.stringify(play.value)).toBe(p0);
    expect([...unlocked.value]).toEqual(app);
    for (const id of HIDDEN_CHARS) expect(unlocked.value as readonly string[]).not.toContain(id);
    revokeCode();
    expect(openOf(mirror.value).chars.some((id) => (HIDDEN_CHARS as readonly string[]).includes(id))).toBe(false);
  });

  it('an earned companion carries no code tag, and stays open after the code is revoked', () => {
    mirror.value = { ...defaultMeta(DAY), bests: B('scholar|lake|0|0', 40) };
    code();
    expect(charTag(mirror.value, 'yuenv')).toBeNull();
    expect(charTag(mirror.value, 'shangui')).toBe('code');
    revokeCode();
    expect(openOf(mirror.value).chars).toContain('yuenv');
    expect(openOf(mirror.value).chars).not.toContain('shangui');
  });

  it('CHAR_IDS keeps a hidden lobby companion through a save round-trip; an unknown id falls back to 书生', () => {
    const m = sanitizeMirror(JSON.parse(JSON.stringify({ ...defaultMeta(DAY), lobby: { ...defaultMeta(DAY).lobby, char: 'shangui' } })), DAY);
    expect(m.lobby.char).toBe('shangui');
    const bad = sanitizeMirror({ ...defaultMeta(DAY), lobby: { ...defaultMeta(DAY).lobby, char: 'nobody' } }, DAY);
    expect(bad.lobby.char).toBe('scholar');
  });

  it('a paused run with 山鬼 loads (logic/save.ts validates the char against COMPANION_REG)', () => {
    const r = runAt(12, { char: 'shangui', map: 'forest' });
    const m = sanitizeMirror(JSON.parse(JSON.stringify({ ...defaultMeta(DAY), active: r })), DAY);
    expect(m.active?.char).toBe('shangui');
  });

  it('after revoking, the lobby falls back to 书生 at the next visit unless the companion was earned', () => {
    code();
    const e = enter({ char: 'houyi', map: 'palace', diff: 1, vows: {}, daily: false, plain: false });
    expect(e.ok && e.run.char).toBe('houyi');
    abandon();
    mirror.value = { ...mirror.value, lobby: { ...mirror.value.lobby, char: 'houyi' } };
    revokeCode();
    lobbyVisit();
    expect(mirror.value.lobby.char).toBe('scholar');
    // earned: it stays
    mirror.value = { ...mirror.value, bests: B('scholar|palace|0|0', 40), lobby: { ...mirror.value.lobby, char: 'houyi' } };
    lobbyVisit();
    expect(mirror.value.lobby.char).toBe('houyi');
  });
});
