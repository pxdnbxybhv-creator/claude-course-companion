// 水月幻镜 · m8 · the 模拟场's 本局 sheet (sandbox.md §4.1, §5.4, §11): add and set on all 26 stats are exact after
// 大橘's and 嫦娥's gain factors and before the clamps; 劫数 raises both the sheet's curse (and its damage) and the
// enemies' HP and damage; validateRun drops `sand`; a live edit in a wave moves the engine's sheet by the
// difference, heals a 气血 rise, and survives a 镜宝 grant (the engine's own mid-wave recompute).
import { describe, expect, it } from 'vitest';
import type { EngineHooks, EngineSettings, MirrorAudio, RunSave } from '../src/views/mirror/types';
import { COMPANIONS, F, ITEMS, STAT_IDS } from '../src/views/mirror/data';
import { allUnlocked, changes, clampSheet, computeStats, curseOf, dmgX, hpX, newRun, tuningActive, validateRun, withSheet } from '../src/views/mirror/logic';
import { defaultMeta, mirror } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { createSandSession, leaveSand, openSand } from '../src/views/mirror/ui/sand/session';

const DAY = '2026-09-30';
function run(char: RunSave['char']): RunSave {
  const r = newRun({
    seed: 31, char, map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: { heartHp: 3, heartArmor: 2 }, ticket: 0, free: false,
    runIndex: 0, rate: 0, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
  return { ...r, wave: 20, items: { ...r.items }, stats: { ...r.stats, hp: 12, armor: 3 } };
}

describe('add and set on every stat', () => {
  for (const char of ['cat', 'change', 'poet'] as const) {
    it(`${char}: exact after the gain factors, before the clamps`, () => {
      const r = run(char);
      const base = computeStats(r);
      for (const id of STAT_IDS) {
        if (id === 'curse') continue;
        for (const v of [-37, 0, 13.5, 250]) {
          const add = computeStats(withSheet(r, [{ id, mode: 'add', v }]));
          const set = computeStats(withSheet(r, [{ id, mode: 'set', v }]));
          const wantAdd = clampSheet({ ...base, [id]: base[id] + v })[id];
          const wantSet = clampSheet({ ...base, [id]: v })[id];
          expect(add[id], `${id} add ${v}`).toBeCloseTo(wantAdd, 9);
          expect(set[id], `${id} set ${v}`).toBeCloseTo(wantSet, 9);
          // nothing else on the sheet moves (converts read the sheet before the edit)
          for (const k of STAT_IDS) if (k !== id) expect(add[k], `${id} → ${k}`).toBeCloseTo(base[k], 9);
        }
      }
    });
  }

  it('rows stack in order (add then set = set; set then add = set + add)', () => {
    const r = run('scholar');
    expect(computeStats(withSheet(r, [{ id: 'aspd', mode: 'add', v: 50 }, { id: 'aspd', mode: 'set', v: 20 }])).aspd).toBe(20);
    expect(computeStats(withSheet(r, [{ id: 'aspd', mode: 'set', v: 20 }, { id: 'aspd', mode: 'add', v: 50 }])).aspd).toBe(70);
  });
});

describe('劫数 on both sides', () => {
  it('raises the sheet\'s curse and its damage, and the enemies\' HP and damage, as a curse item would', () => {
    const r = run('scholar');
    const s0 = computeStats(r);
    const rc = withSheet(r, [{ id: 'curse', mode: 'add', v: 10 }]);
    const s1 = computeStats(rc);
    expect(s1.curse).toBe(s0.curse + 10);
    expect(s1.dmg).toBeCloseTo(s0.dmg + 10 * F.curseDmg, 9);
    expect(curseOf(rc)).toBe(curseOf(r) + 10);
    for (const w of [5, 20, 30, 45]) {
      expect(hpX(w, rc)).toBeGreaterThan(hpX(w, r));
      expect(dmgX(w, rc)).toBeGreaterThan(dmgX(w, r));
    }
    // 设为 N makes the sheet's curse exactly N
    expect(computeStats(withSheet(r, [{ id: 'curse', mode: 'set', v: 7 }])).curse).toBe(7);
    expect(computeStats(withSheet(r, [{ id: 'curse', mode: 'set', v: s0.curse }]))).toEqual(s0);
  });

  it('a real save never carries it: validateRun drops sand', () => {
    const r = withSheet(run('scholar'), [{ id: 'hp', mode: 'add', v: 100 }, { id: 'curse', mode: 'add', v: 3 }]);
    expect(r.sand).toBeDefined();
    const v = validateRun(r)!;
    expect(v).not.toBeNull();
    expect('sand' in v).toBe(false);
    expect(computeStats(v)).toEqual(computeStats(run('scholar')));
  });
});

describe('a live edit in a wave', () => {
  const AUDIO: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
  const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;

  it('moves the engine\'s sheet by the difference, heals a 气血 rise, and survives a 镜宝 grant', () => {
    mirror.value = defaultMeta(DAY);
    openSand();
    try {
      const s = createSandSession({
        char: 'scholar', map: 'lake', diff: 1, vows: {}, wave: 12, seed: 3, heart: 'own', mastery: 'own', pool: 'all', build: 'bare', today: DAY, arrive: 'fight',
      });
      const { run: r, setup } = s.startWave(s.run());
      const hooks: EngineHooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
      const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
      const eng = createEngine(canvas(), r, { painter: createDebugPainter(r.map, 'high', 1), audio: AUDIO, content: CONTENT, hooks, settings }) as MirrorEngine;
      eng.start(r, setup);
      s.attach(eng);
      eng.stepN(30);
      const W = eng.world;
      W.godmode = true;
      W.hp = W.hpMax - 5;
      const max0 = W.hpMax, hp0 = W.hp, aspd0 = W.stats.aspd;
      s.setSheet([{ id: 'hp', mode: 'add', v: 50 }, { id: 'aspd', mode: 'add', v: 100 }]);
      expect(W.hpMax).toBe(max0 + 50);
      expect(W.hp).toBe(hp0 + 50);
      expect(W.stats.aspd).toBeCloseTo(aspd0 + 100, 9);
      expect(W.run.sand?.sheet.length).toBe(2);
      // the engine's own mid-wave recompute (a 镜宝) keeps the edit
      const relicHp = ITEMS.longyuan.stats?.hp ?? 0;
      (W as unknown as { grantRelic(id: string, x: number, y: number): void }).grantRelic('longyuan', W.px, W.py);
      expect(W.hpMax).toBe(max0 + 50 + relicHp);
      // taking it back moves it back
      s.setSheet([]);
      expect(W.hpMax).toBe(max0 + relicHp);
      expect(W.stats.aspd).toBeCloseTo(aspd0, 9);
      s.attach(null);
      eng.dispose();
    } finally {
      leaveSand();
    }
  });
});

describe('写进同伴底子 (a sheet row becomes the companion\'s own number)', () => {
  const AUDIO: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
  const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;
  const pristineHp = COMPANIONS.scholar.hp;
  const pristineExtra = { ...COMPANIONS.scholar.extra };

  it('between waves: the data takes the delta (hp into .hp, aspd into .extra), the row goes, the sheet is unchanged; leave restores', () => {
    mirror.value = defaultMeta(DAY);
    openSand();
    try {
      const s = createSandSession({ char: 'scholar', map: 'lake', diff: 1, vows: {}, wave: 12, seed: 3, heart: 'own', mastery: 'own', pool: 'all', build: 'bare', today: DAY, arrive: 'shop' });
      s.setSheet([{ id: 'hp', mode: 'add', v: 40 }, { id: 'aspd', mode: 'set', v: 77 }, { id: 'curse', mode: 'add', v: 3 }]);
      const before = computeStats(s.run());
      expect(s.bake('hp')).toBe('COMPANIONS.scholar.hp');
      expect(s.bake('aspd')).toBe('COMPANIONS.scholar.extra.aspd');
      // 劫数 stays a run row (enemies read items' curse only)
      expect(s.bake('curse')).toBeNull();
      expect(s.sheet().map((r) => r.id)).toEqual(['curse']);
      expect(COMPANIONS.scholar.hp).toBe(pristineHp + 40);
      const after = computeStats(s.run());
      for (const k of STAT_IDS) expect(after[k], k).toBeCloseTo(before[k], 9);
      expect(changes().map((c) => c.path).sort()).toEqual(['COMPANIONS.scholar.extra.aspd', 'COMPANIONS.scholar.hp']);
    } finally {
      leaveSand();
    }
    expect(tuningActive()).toBe(false);
    expect(COMPANIONS.scholar.hp).toBe(pristineHp);
    expect(COMPANIONS.scholar.extra).toEqual(pristineExtra);
  });

  it('in a wave: the live sheet stays where it was; 测 DPS logs a window; the sandbox damage numbers never touch the setting', () => {
    mirror.value = defaultMeta(DAY);
    const nums0 = mirror.value.settings.nums;
    openSand();
    try {
      const s = createSandSession({ char: 'scholar', map: 'lake', diff: 1, vows: {}, wave: 12, seed: 3, heart: 'own', mastery: 'own', pool: 'all', build: 'bot', today: DAY, arrive: 'fight' });
      const { run: r, setup } = s.startWave(s.run());
      const hooks: EngineHooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
      const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
      const eng = createEngine(canvas(), r, { painter: createDebugPainter(r.map, 'high', 1), audio: AUDIO, content: CONTENT, hooks, settings }) as MirrorEngine;
      eng.start(r, setup);
      s.attach(eng);
      s.setTools({ god: true, nums: 2 });
      expect(eng.world.settings.nums).toBe(2);
      expect(mirror.value.settings.nums).toBe(nums0);
      eng.stepN(30);
      const W = eng.world;
      s.setSheet([{ id: 'hp', mode: 'add', v: 30 }, { id: 'dmg', mode: 'add', v: 25 }]);
      const max0 = W.hpMax, dmg0 = W.stats.dmg;
      expect(s.bake('hp')).toBe('COMPANIONS.scholar.hp');
      expect(s.bake('dmg')).toBe('COMPANIONS.scholar.extra.dmg');
      expect(W.hpMax).toBe(max0);
      expect(W.stats.dmg).toBeCloseTo(dmg0, 9);
      expect(W.run.sand?.sheet.length ?? 0).toBe(0);
      // 测 DPS: a window of game time; it closes itself at MEASURE_SEC (polled) or when the wave ends
      expect(s.measure()).toBe(true);
      expect(s.measuring()).toBeGreaterThan(0);
      eng.stepN(60 * 4);
      s.startWave(s.before()!); // the next start closes the window early (4 s of play)
      const m = s.measures();
      expect(m.length).toBe(1);
      expect(m[0].sec).toBeGreaterThanOrEqual(3.9);
      expect(m[0].dealt).toBeGreaterThan(0);
      expect(m[0].dps).toBe(Math.round(m[0].dealt / m[0].sec));
      expect(m[0].by.length).toBeGreaterThan(0);
      s.attach(null);
      eng.dispose();
    } finally {
      leaveSand();
    }
    expect(COMPANIONS.scholar.hp).toBe(pristineHp);
    expect(mirror.value.settings.nums).toBe(nums0);
  });
});
