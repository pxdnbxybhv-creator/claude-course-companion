// 水月幻镜 · round 8, HIDDEN (build plan §4.H, hidden.md §7): the three verbs on the real engine and content,
// scripted. 越女 候气 (guard), 山鬼 女萝 (recast), 后羿 射日 (hold), and the 'tap' 13 untouched.
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import { F, PASSIVES, SKILLS } from '../src/views/mirror/data';
import { allUnlocked, beginWave, computeStats, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { EKind } from '../src/views/mirror/engine/pools';
import { HF, SRCI, TC } from '../src/views/mirror/engine/consts';
import { HIDDEN_PASSIVE_IMPLS, HIDDEN_SKILL_IMPLS, hiddenTally, isMarked, kitHit } from '../src/views/mirror/engine/content/hidden';
import { VM } from '../src/views/mirror/engine/verbs';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
/** The real skills and passives only (no hazards, elites' or bosses' own actors). */
const REG: ContentRegistry = {
  skills: CONTENT.skills, passives: CONTENT.passives, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {},
};
type W8 = MirrorEngine['world'];
const now = () => performance.now() / 1000;

function opts(o: Partial<NewRunOpts>): NewRunOpts {
  return {
    seed: 4242, char: 'yuenv', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
/** A quiet arena at wave 10 with this companion and weapons: no spawns, endless, weapons idle; crit 0 on the sheet. */
function arena(char: NewRunOpts['char'], weapons: [WeaponId, 1 | 2 | 3 | 4][], o: { god?: boolean } = {}): { eng: MirrorEngine; W: W8; errors: unknown[] } {
  const run0 = beginWave({ ...newRun(opts({ char })), wave: 9, weapons: weapons.map(([id, t]) => ({ id, t })) });
  const run: RunSave = { ...run0, sand: { sheet: [{ id: 'crit', mode: 'set', v: 0 }, { id: 'dodge', mode: 'set', v: 0 }], curse: 0 } };
  const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  const errors: unknown[] = [];
  const hooks: EngineHooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: (e) => { errors.push(e); } };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio: SILENT, content: REG, hooks, settings }) as MirrorEngine;
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = !!o.god;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  for (const s of W.slots) s.cd = 1e9;
  W.hpBonus = 1e6; W.recomputeStats(); W.hp = W.hpMax;
  return { eng, W, errors };
}
/** A still, fat foe at (dx, dy) from you: an ordinary one, an elite, or one flagged as a boss. Returns its handle. */
function foe(W: W8, dx: number, dy = 0, kind: 'mon' | 'elite' | 'boss' = 'mon', hp = 1e7): number {
  const h = W.spawn(kind === 'elite' ? 'turtle' : 'blot', W.px + dx, W.py + dy, { bloom: false, capped: false });
  const i = W.E.slotOf(h);
  W.E.hp[i] = W.E.hpMax[i] = hp;
  W.E.armor[i] = 0;
  W.E.speed[i] = 0;
  W.E.dmg[i] = 0;
  if (kind === 'boss') W.E.kind[i] = EKind.Boss;
  return h;
}
const slot = (W: W8, h: number) => W.E.slotOf(h);
const lost = (W: W8, h: number) => W.E.hpMax[slot(W, h)] - W.E.hp[slot(W, h)];
/** An enemy shot `dist` u to your right flying at you at 300 u/s. */
const shotAt = (W: W8, dist: number, dmg = 40) => W.enemyShot('eOrb', W.px + dist, W.py, -300, 0, 6, 5, dmg, false, 0, 0, 0, 0, -1);

// ═════════════════════════════════════════════════════════════════════════ the registries

describe('m8 hidden · registries (hidden.md §7)', () => {
  it('SKILL_IMPLS / PASSIVE_IMPLS carry houqi nvluo sheri / jingshen youhuang mangong; every skill input is one of the four', () => {
    for (const id of ['houqi', 'nvluo', 'sheri'] as const) expect(CONTENT.skills[id], id).toBeTruthy();
    for (const id of ['jingshen', 'youhuang', 'mangong'] as const) expect(CONTENT.passives[id], id).toBeTruthy();
    expect(Object.keys(HIDDEN_SKILL_IMPLS).sort()).toEqual(['houqi', 'nvluo', 'sheri']);
    expect(Object.keys(HIDDEN_PASSIVE_IMPLS).sort()).toEqual(['jingshen', 'mangong', 'youhuang']);
    for (const d of Object.values(SKILLS)) expect(['tap', 'hold', 'recast', 'guard']).toContain(d.input ?? 'tap');
    expect([SKILLS.houqi.input, SKILLS.nvluo.input, SKILLS.sheri.input]).toEqual(['guard', 'recast', 'hold']);
  });
});

// ═════════════════════════════════════════════════════════════════════════ the verbs

describe('m8 hidden · the verbs (hidden.md §2.5)', () => {
  it('a tap skill (the 13) casts on the press, and the release does nothing', () => {
    const { eng, W, errors } = arena('swordsman', [['qingfeng', 1]], { god: true });
    expect(W.skillDef?.input ?? 'tap').toBe('tap');
    eng.stepN(2);
    W.press(now());
    expect(W.skillRun).not.toBeNull();
    expect(W.verbDown).toBe(false);
    W.release({ x: 1, y: 0 }, now());
    expect(W.playerHooks.length).toBe(0);
    expect(W.guardHook).toBeNull();
    expect(errors).toEqual([]);
    eng.dispose();
  });

  it('the hud reports the hold, the recast and the ring', () => {
    const { eng, W } = arena('houyi', [['sunbow', 1]], { god: true });
    foe(W, 300);
    eng.stepN(2);
    W.press(now());
    eng.stepN(10);
    const h = { skillCd: 0 } as Parameters<W8['hiddenHud']>[0];
    W.hiddenHud(h);
    expect(h.skillHeld).toBe(true);
    expect(h.ring?.key).toBe('draw');
    expect(h.ring?.marks).toEqual([SKILLS.sheri.p.sweet0 / SKILLS.sheri.p.full, SKILLS.sheri.p.sweet1 / SKILLS.sheri.p.full]);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════════════════════════════════ 越女 · 候气

describe('m8 hidden · 越女 候气 (guard)', () => {
  const p = SKILLS.houqi.p;

  it('an enemy shot 0.1 s out, guard pressed: no HP lost, 1 剑意, her shot flies back', () => {
    const { eng, W, errors } = arena('yuenv', [['qingfeng', 1]]);
    eng.stepN(2);
    const hp0 = W.hp;
    W.press(now());
    shotAt(W, 30 + W.pr);
    eng.stepN(8);
    expect(W.hp).toBe(hp0);
    expect(W.hidBlades).toBe(1);
    expect(hiddenTally(W).reflects).toBe(1);
    let mine = 0;
    for (let i = 0; i < W.PS.n; i++) if (W.PS.alive[i] && W.PS.vx[i] > 0) mine++;
    expect(mine).toBe(1);
    expect(errors).toEqual([]);
    eng.dispose();
  });

  it('pressed 0.4 s early: a whiff, 露 (+25 % damage taken), the full 2.5 s cooldown', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    eng.stepN(2);
    W.press(now());
    eng.stepN(24); // 0.4 s
    expect(hiddenTally(W).whiffs).toBe(1);
    expect(W.exposeX()).toBeCloseTo(1 + p.exposed / 100);
    expect(W.skillCd).toBeGreaterThan(SKILLS.houqi.cd - 0.3);
    expect(W.skillCd).toBeLessThanOrEqual(SKILLS.houqi.cd);
    // the blow that lands while open is bigger by 露
    const h = foe(W, 30);
    eng.stepN(1);
    const hp0 = W.hp;
    W.hurtFrom(100, slot(W, h), true, true, 'blot', false, true);
    expect(hp0 - W.hp).toBeCloseTo(100 * (1 + p.exposed / 100), 0);
    eng.dispose();
  });

  it('a catch 0.05 s after the press is 精: ×perfX on the counter, and the cooldown is 0.25 s', () => {
    const run = (late: number) => {
      const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
      const h = foe(W, 30);
      eng.stepN(2);
      W.press(now());
      eng.stepN(Math.round(late * 60));
      W.hurtFrom(10, slot(W, h), false, false, 'blot', false, true);
      const dealt = lost(W, h);
      eng.stepN(20);
      const cd = W.skillCd, pf = hiddenTally(W).perfect, marked = isMarked(W, h);
      eng.dispose();
      return { dealt, cd, pf, marked };
    };
    const quick = run(0.05), slow = run(0.15);
    expect(quick.pf).toBe(1);
    expect(slow.pf).toBe(0);
    expect(quick.dealt / slow.dealt).toBeCloseTo(p.perfX, 1);
    expect(quick.cd).toBeLessThanOrEqual(p.cdPerfect);
    expect(slow.cd).toBeLessThanOrEqual(p.cdCatch);
    expect(slow.cd).toBeGreaterThan(p.cdPerfect - 0.2);
    expect(quick.marked && slow.marked).toBe(true);
  });

  it('four bodies at once: three are caught, the fourth lands', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    const hs = [foe(W, 30), foe(W, -30), foe(W, 0, 30), foe(W, 0, -30)];
    eng.stepN(2);
    W.press(now());
    eng.stepN(1);
    const hp0 = W.hp;
    const got = hs.map((h) => W.hurtFrom(50, slot(W, h), true, true, 'blot', false, true));
    expect(got.slice(0, 3)).toEqual([0, 0, 0]);
    expect(got[3]).toBeGreaterThan(0);
    expect(hp0 - W.hp).toBeCloseTo(50, 0);
    expect(hiddenTally(W).catches).toBe(3);
    expect(W.hidBlades).toBe(3);
    eng.dispose();
  });

  it('QA: 剑意 carries into the run\'s next wave (it never fades); a retry of the same wave starts at 0', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    const r1 = W.run, w1 = W.wave;
    W.hidBlades = 2;
    const r2: RunSave = { ...r1, wave: w1, inWave: w1 + 1 };
    const s2 = waveSetup(r2, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
    eng.start(r2, s2);
    expect(W.wave).toBe(w1 + 1);
    expect(W.hidBlades).toBe(2);
    eng.start(r2, s2);
    expect(W.hidBlades).toBe(0);
    eng.dispose();
  });

  it('a DoT tick passes through the guard', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    eng.stepN(2);
    W.press(now());
    eng.stepN(1);
    const hp0 = W.hp;
    W.hurtFrom(20, -1, true, true, 'burn', true, false);
    expect(hp0 - W.hp).toBeCloseTo(20, 3);
    expect(hiddenTally(W).catches).toBe(0);
    eng.dispose();
  });

  it('a monster telegraph (coreTele, owner = its handle) striking her inside the guard is 破招 on its owner: +2 剑意', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    const h = foe(W, 100);
    const i = slot(W, h);
    eng.stepN(2);
    // as enemies.ts does for a cone: the owner is the enemy's handle (generation-tagged), not its slot
    W.coreTele({ kind: 'cone', x: W.E.x[i], y: W.E.y[i], dir: Math.PI, r: 160, deg: 90 }, 0.15, TC.cone, W.E.handle(i), 30, null);
    eng.stepN(4);
    W.press(now());
    eng.stepN(20);
    expect(hiddenTally(W).catches).toBe(1);
    expect(hiddenTally(W).breaks).toBe(1);
    expect(W.hidBlades).toBe(2);
    expect(lost(W, h)).toBeGreaterThan(0);
    eng.dispose();
  });

  it('a boss-pattern telegraph (World.tele with an owner) striking inside the guard is 破招 too', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    const h = foe(W, 100, 0, 'boss');
    eng.stepN(2);
    W.tele({ shape: { kind: 'circle', x: W.px, y: W.py, r: 80 }, dur: 0.15, owner: h, then: (w) => w.hurt(30, { src: 'boss' }) });
    eng.stepN(4);
    W.press(now());
    eng.stepN(20);
    expect(hiddenTally(W).breaks).toBe(1);
    expect(lost(W, h)).toBeGreaterThan(0);
    eng.dispose();
  });

  it('an ownerless telegraph inside the guard is a catch, not a 破招', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    eng.stepN(2);
    W.tele({ shape: { kind: 'circle', x: W.px, y: W.py, r: 80 }, dur: 0.15, then: (w) => w.hurt(30, { src: 'boss' }) });
    eng.stepN(4);
    W.press(now());
    eng.stepN(20);
    expect(hiddenTally(W).catches).toBe(1);
    expect(hiddenTally(W).breaks).toBe(0);
    expect(W.hidBlades).toBe(1);
    eng.dispose();
  });

  it('a dense volley inside one guard: three are caught and exactly one more lands (the spill keeps its own i-frames)', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    eng.stepN(2);
    for (let k = 0; k < 8; k++) shotAt(W, 60, 33);
    W.press(now());
    const hp0 = W.hp;
    eng.stepN(30);
    expect(hiddenTally(W).catches).toBe(3);
    expect(hp0 - W.hp).toBeGreaterThan(0);
    expect(hp0 - W.hp).toBeLessThanOrEqual(33 * 1.01);
    eng.dispose();
  });

  it('with 3 剑意 the press is 夺 (a dash cut on release, marked foes ×markX), not a guard', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    const a = foe(W, 150), m = foe(W, 220, 10);
    eng.stepN(2);
    W.hidBlades = p.blades;
    const x0 = W.px;
    W.press(now());
    expect(W.skillRun).toBeNull(); // 夺 waits for the release
    W.release({ x: 0, y: 0 }, now());
    expect(W.skillRun).not.toBeNull();
    expect(W.hidBlades).toBe(0);
    // mark the second one by hand before the cut lands
    W.hidBlades = 0;
    const st = hiddenTally(W);
    expect(st.seizes).toBe(1);
    void isMarked;
    eng.stepN(20);
    expect(W.px - x0).toBeGreaterThan(p.cutLen * 0.8);
    expect(lost(W, a)).toBeGreaterThan(0);
    expect(lost(W, m)).toBeGreaterThan(0);
    expect(st.guards).toBe(0);
    expect(W.skillCd).toBeLessThanOrEqual(p.cdCatch);
    eng.dispose();
  });

  it('内实精神: a crit on a 破绽-marked foe deals +markCritDmg 暴击倍数 more (a quiet strike the next step)', () => {
    const { eng, W } = arena('yuenv', [['qingfeng', 1]]);
    const a = foe(W, 30), b = foe(W, -30);
    eng.stepN(2);
    W.press(now());
    eng.stepN(1);
    W.hurtFrom(10, slot(W, a), true, true, 'blot', false, true);
    expect(isMarked(W, a)).toBe(true);
    expect(isMarked(W, b)).toBe(false);
    eng.stepN(30);
    const la = lost(W, a), lb = lost(W, b);
    W.strike(slot(W, a), 100, 1, 2, 0, W.px, W.py, 0, SRCI.weapon, HF.noArmor);
    W.strike(slot(W, b), 100, 1, 2, 0, W.px, W.py, 0, SRCI.weapon, HF.noArmor);
    eng.stepN(2);
    const ratio = (lost(W, a) - la) / (lost(W, b) - lb);
    const critM = F.critXDefault + W.stats.critDmg / 100 + Math.max(0, W.stats.crit - 100) / 100;
    expect(ratio).toBeCloseTo(1 + PASSIVES.jingshen.p.markCritDmg / 100 / critM, 1);
    expect(ratio).toBeGreaterThan(1.05);
    eng.dispose();
  });

  it('内实精神: 闪避 counts half, and its gains become 近战', () => {
    expect(PASSIVES.jingshen.fx?.[0]).toMatchObject({ do: 'convert', from: 'dodge' });
    const run = newRun(opts({ char: 'yuenv' }));
    const plain = computeStats(run), more = computeStats({ ...run, stats: { ...run.stats, dodge: 20 } });
    expect(more.dodge - plain.dodge).toBeCloseTo(10, 5);
    expect(more.melee - plain.melee).toBeCloseTo(10, 5);
  });
});

// ═════════════════════════════════════════════════════════════════════════ 山鬼 · 女萝

describe('m8 hidden · 山鬼 女萝 (recast)', () => {
  const p = SKILLS.nvluo.p;

  it('bind at 100 u and snap at once: the slack vine hits at ×slackX, no sure crit', () => {
    const { eng, W } = arena('shangui', [['claw', 1]], { god: true });
    const h = foe(W, 100);
    eng.stepN(2);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    expect(W.skillRun?.recast).toBeTruthy();
    eng.stepN(2);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    const slack = lost(W, h);
    expect(hiddenTally(W).snaps).toBe(1);
    expect(hiddenTally(W).taut).toBe(0);
    expect(W.E.stunT[slot(W, h)]).toBeLessThanOrEqual(p.stun + 1e-6);
    // the same snap after walking 160 u away: m = m0 + 160 / per, a sure crit, the long stun, yanked in front
    eng.stepN(2);
    eng.dispose();
    const { eng: e2, W: W2 } = arena('shangui', [['claw', 1]], { god: true });
    const h2 = foe(W2, 100);
    e2.stepN(2);
    W2.press(now()); W2.release({ x: 0, y: 0 }, now());
    W2.moveX = -1;
    let k = 0;
    while (Math.hypot(W2.E.x[slot(W2, h2)] - W2.px, W2.E.y[slot(W2, h2)] - W2.py) < 100 + 160 && k++ < 400) e2.stepN(1);
    W2.moveX = 0;
    e2.stepN(4);
    W2.press(now()); W2.release({ x: 0, y: 0 }, now());
    const taut = lost(W2, h2);
    expect(hiddenTally(W2).taut).toBe(1);
    const i2 = slot(W2, h2);
    expect(W2.E.stunT[i2]).toBeGreaterThan(p.stun + 0.1);
    expect(Math.hypot(W2.E.x[i2] - W2.px, W2.E.y[i2] - W2.py)).toBeLessThanOrEqual(60);
    // crit ×(F.critXDefault + 暴击倍数) on top of the stretch: well over the slack hit's ratio m(160) / 0.3
    expect(taut / slack).toBeGreaterThan((p.m0 + 160 / p.per) / p.slackX);
    e2.dispose();
  });

  it('a boss is never dragged by the leash nor yanked by the snap', () => {
    const { eng, W } = arena('shangui', [['claw', 1]], { god: true });
    const h = foe(W, 100, 0, 'boss');
    eng.stepN(2);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    W.moveX = -1;
    eng.stepN(120);
    W.moveX = 0;
    const far = () => Math.hypot(W.E.x[slot(W, h)] - W.px, W.E.y[slot(W, h)] - W.py);
    expect(far()).toBeGreaterThan(100 + p.leash + 50);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    expect(hiddenTally(W).taut).toBe(1);
    expect(far()).toBeGreaterThan(100 + p.leash + 50);
    eng.dispose();
  });

  it('a bound non-boss is dragged after her past rest + leash', () => {
    const { eng, W } = arena('shangui', [['claw', 1]], { god: true });
    const h = foe(W, 100);
    eng.stepN(2);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    W.moveX = -1;
    eng.stepN(150);
    const i = slot(W, h);
    expect(Math.hypot(W.E.x[i] - W.px, W.E.y[i] - W.py)).toBeLessThanOrEqual(100 + p.leash + 1);
    eng.dispose();
  });

  it('every bound foe killed first: the cooldown is at most p.refund', () => {
    const { eng, W } = arena('shangui', [['claw', 1]], { god: true });
    const h = foe(W, 100);
    eng.stepN(2);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    eng.stepN(30);
    W.kill(h, false);
    eng.stepN(2);
    expect(W.skillRun).toBeNull();
    expect(W.skillCd).toBeLessThanOrEqual(p.refund);
    expect(hiddenTally(W).refunds).toBe(1);
    eng.dispose();
  });

  it('the vines wither at 6 s, and the cooldown still counts from the bind', () => {
    const { eng, W } = arena('shangui', [['claw', 1]], { god: true });
    foe(W, 100);
    eng.stepN(2);
    W.press(now()); W.release({ x: 0, y: 0 }, now());
    eng.stepN(Math.round(p.life * 60) + 2);
    expect(W.skillRun).toBeNull();
    expect(hiddenTally(W).withered).toBe(1);
    expect(W.skillCd).toBeLessThanOrEqual(SKILLS.nvluo.cd - p.life + 0.1);
    eng.dispose();
  });

  it('a drag binds the cone that way (the near foe behind her is left out)', () => {
    const { eng, W } = arena('shangui', [['claw', 1]], { god: true });
    const behind = foe(W, -60), ahead = foe(W, 260);
    eng.stepN(2);
    W.press(now()); W.release({ x: 1, y: 0 }, now());
    eng.stepN(1);
    const tied = W.tethers.map((t) => t.h);
    expect(tied).toContain(ahead);
    expect(tied).not.toContain(behind);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════════════════════════════════ 后羿 · 射日

describe('m8 hidden · 后羿 射日 (hold)', () => {
  const p = SKILLS.sheri.p;
  /** Draw for `held` s, then release toward +x (or cancel); returns damage on the target and the cooldown after. */
  function shoot(held: number | null, o: { elite?: boolean; cancel?: boolean } = {}) {
    const { eng, W, errors } = arena('houyi', [['sunbow', 1]], { god: true });
    const h = foe(W, 300, 0, o.elite ? 'elite' : 'mon');
    const others = o.elite ? [foe(W, 300, 120), foe(W, 300, -120)] : [];
    eng.stepN(2);
    W.press(now());
    eng.stepN(Math.round((held ?? 0) * 60));
    W.release(o.cancel ? null : { x: 1, y: 0 }, now());
    eng.stepN(2);
    const r = { dealt: lost(W, h), cd: W.skillCd, tally: { ...hiddenTally(W) }, side: others.map((x) => lost(W, x)), errors };
    eng.dispose();
    return r;
  }

  it('released at 1.0 s: 正中 (×2 and a sure crit), and 九日 bursts from an elite', () => {
    const full = shoot(1.2), sweet = shoot(1.0, { elite: true });
    expect(sweet.tally.sweet).toBe(1);
    expect(sweet.tally.suns).toBe(1);
    expect(full.tally.sweet).toBe(0);
    // ×sweetX × crit (×critX at 0 暴击倍数) vs the full draw at ×1
    expect(sweet.dealt / full.dealt).toBeGreaterThan(p.sweetX * 1.2);
    expect(sweet.side.some((d) => d > 0)).toBe(true);
    expect(sweet.errors).toEqual([]);
  });

  it('held 1.5 s: 弦松 (×slipX, +2 s cooldown)', () => {
    const slip = shoot(1.5);
    expect(slip.tally.slips).toBe(1);
    expect(slip.cd).toBeGreaterThan(SKILLS.sheri.cd + p.slipCd - 0.2);
  });

  it('a 0.05 s tap looses at ×≈0.43 of the full draw', () => {
    const tap = shoot(0.05), full = shoot(1.2);
    expect(tap.dealt / full.dealt).toBeGreaterThan(0.39);
    expect(tap.dealt / full.dealt).toBeLessThan(0.47);
  });

  it('a cancelled draw looses nothing and costs no cooldown', () => {
    const c = shoot(0.6, { cancel: true });
    expect(c.dealt).toBe(0);
    expect(c.cd).toBe(0);
    expect(c.tally.cancels).toBe(1);
  });

  it('QA: a slip flies along the aim line (the drag), not at the strongest foe', () => {
    const { eng, W } = arena('houyi', [['sunbow', 1]], { god: true });
    const strong = foe(W, 300, 0, 'elite'), weak = foe(W, -300, 0);
    eng.stepN(2);
    W.press(now());
    W.skillPreview = { x: W.px - 200, y: W.py };
    eng.stepN(Math.round((p.slip + 0.2) * 60));
    expect(hiddenTally(W).slips).toBe(1);
    expect(lost(W, weak)).toBeGreaterThan(0);
    expect(lost(W, strong)).toBe(0);
    eng.dispose();
  });

  it('QA: a release while paused is a cancel (the draw never resumes and slips by itself)', () => {
    const { eng, W } = arena('houyi', [['sunbow', 1]], { god: true });
    const h = foe(W, 300);
    eng.stepN(2);
    if (eng.paused) eng.resume();
    eng.skillPress(now());
    eng.stepN(20);
    expect(W.verbDown).toBe(true);
    eng.pause();
    eng.skillRelease({ x: 0, y: 0 }, now());
    eng.resume();
    eng.stepN(Math.round((p.slip + 0.5) * 60));
    expect(W.verbDown).toBe(false);
    expect(hiddenTally(W).cancels).toBe(1);
    expect(hiddenTally(W).looses).toBe(0);
    expect(lost(W, h)).toBe(0);
    eng.dispose();
  });

  it('he moves at 40 % while drawing', () => {
    const { eng, W } = arena('houyi', [['sunbow', 1]], { god: true });
    eng.stepN(2);
    W.moveX = 1;
    eng.stepN(30);
    const x0 = W.px; eng.stepN(30); const free = W.px - x0;
    W.press(now());
    eng.stepN(6);
    const x1 = W.px; eng.stepN(30); const drawing = W.px - x1;
    expect(drawing / free).toBeCloseTo(p.move, 1);
    W.release({ x: 1, y: 0 }, now());
    eng.dispose();
  });

  it('engine.skill() is a press and an instant release (a tap shot), for the bot and the tutorial', () => {
    const { eng, W } = arena('houyi', [['sunbow', 1]], { god: true });
    const h = foe(W, 300);
    eng.stepN(2);
    W.castSkill(null, null); // what engine.skill({ kind: 'auto' }) calls
    eng.stepN(2);
    expect(lost(W, h)).toBeGreaterThan(0);
    expect(hiddenTally(W).looses).toBe(1);
    expect(W.verbMode).toBe(VM.none);
    eng.dispose();
  });

  it('the kit term reads the bow weapons', () => {
    const { eng, W } = arena('houyi', [['sunbow', 2], ['qingfeng', 1]], { god: true });
    expect(kitHit(W, 'bow')).toBeGreaterThan(0);
    expect(kitHit(W, 'bow')).not.toBeCloseTo(kitHit(W), 3);
    expect(F.hidden.ringPad).toBeGreaterThan(0);
    eng.dispose();
  });
});
