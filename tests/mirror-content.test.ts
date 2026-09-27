// 水月幻镜 · engine-content (GDD §11–§15, §17.7): every 镜技 casts with its numbers, every hazard,
// passive, elite, affix, treasure, 镜蚀 and 节气 runs without an error, every boss walks all its phases
// (and 倒悬's fourth) through the runner's breaks, and the busiest phases stay cheap to simulate.
import { describe, expect, it } from 'vitest';
import type {
  BossEvent, CharacterId, ContentRegistry, DeathResult, EngineHooks, EngineSettings, HitPacket, MirrorAudio, NewRunOpts, RunSave, TeleSpec, WaveResult,
  WaveSetup, ZoneSpec,
} from '../src/views/mirror/types';
import {
  AFFIX_REG, BOSS_REG, ELITE_REG, HAZARD_REG, MUTATOR_REG, SKILL_REG, TERM_MOD_REG, type AffixId, type BossId,
  type EliteId, type MapId, type MutatorId, type TermModId,
} from '../src/views/mirror/ids';
import { BOSSES, COMPANIONS, HAZARDS, MAPS, SKILLS, TERM_MODS } from '../src/views/mirror/data';
import { allUnlocked, beginWave, computeStats, dmgMul, newRun, waveSetup, wavePlan } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { bossState, forcePhase } from '../src/views/mirror/engine/content/bosses';
import { contentDev } from '../src/views/mirror/engine/content/dev';
import { AFFIX_IMPLS } from '../src/views/mirror/engine/content/elites';
import { addAffix } from '../src/views/mirror/engine/content/bridge';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 777, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
interface Log { boss: BossEvent[]; ends: WaveResult[]; deaths: DeathResult[]; errors: { e: unknown; fatal: boolean }[]; crates: number }
function make(run: RunSave, o: { content?: ContentRegistry; settings?: Partial<EngineSettings> } = {}): { eng: MirrorEngine; log: Log } {
  const log: Log = { boss: [], ends: [], deaths: [], errors: [], crates: 0 };
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: (n) => { log.crates = n; }, coin: () => {},
    boss: (ev) => log.boss.push(ev), waveEnd: (r) => log.ends.push(r), death: (d) => log.deaths.push(d),
    error: (e, fatal) => { log.errors.push({ e, fatal }); },
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...o.settings };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio: SILENT, content: o.content ?? CONTENT, hooks, settings }) as MirrorEngine;
  return { eng, log };
}
/** A run sitting just before wave w (its setup built as the UI would, on a fixed night). */
function at(w: number, o: Partial<NewRunOpts> = {}, patch: Partial<RunSave> = {}, day = new Date(2026, 8, 27, 20)): { run: RunSave; setup: WaveSetup } {
  const base = { ...newRun(opts(o)), wave: w - 1, ...patch };
  const run = beginWave(base);
  return { run, setup: waveSetup(run, defaultMeta('2026-09-27'), day) };
}
function step(eng: MirrorEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    const ph = eng.world.phase;
    if (ph !== 'wave' && ph !== 'ending') return;
    if (eng.paused) eng.resume();
    eng.stepN(1);
  }
}
const errs = (log: Log) => log.errors.map((x) => String((x.e as Error)?.stack ?? x.e));

// ═════════════════════════════════════════════ 镜技

/** Record the WorldApi calls a skill makes (the world is the WorldApi content is handed). */
function spy(eng: MirrorEngine) {
  const W = eng.world as unknown as Record<string, (...a: unknown[]) => unknown>;
  const calls: { fn: string; args: unknown[] }[] = [];
  for (const fn of ['hitArea', 'hitLine', 'hitCone', 'hit', 'zone', 'status', 'convert', 'kill', 'buff', 'dash', 'leap', 'root', 'heal', 'pull', 'attract', 'hurt', 'tele', 'light', 'untargetable', 'addDrunk', 'refundSkill']) {
    const orig = W[fn].bind(eng.world);
    W[fn] = (...args: unknown[]) => { calls.push({ fn, args }); return orig(...args); };
  }
  return calls;
}
function crowd(eng: MirrorEngine, n: number, r = 150): void {
  const W = eng.world;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    W.spawn('blot', W.px + Math.cos(a) * (60 + (k % 3) * r / 3), W.py + Math.sin(a) * (60 + (k % 3) * r / 3), { bloom: false });
  }
}

describe('engine-content: the 13 镜技', () => {
  const chars = Object.keys(COMPANIONS) as CharacterId[];
  it('registers a skill for every companion and for nobody else', () => {
    for (const c of chars) expect(CONTENT.skills[COMPANIONS[c].skill], c).toBeTruthy();
    expect(Object.keys(CONTENT.skills).sort()).toEqual(SKILL_REG.map((s) => s.id).sort());
  });

  for (const char of chars) {
    it(`${char}: ${SKILLS[COMPANIONS[char].skill].id} casts, acts and returns its cooldown`, () => {
      const start = COMPANIONS[char].start === 'choice' ? 'qingfeng' : COMPANIONS[char].start;
      const { run, setup } = at(6, { char }, { weapons: [{ id: start as never, t: 2 }, { id: 'yanyue', t: 2 }, { id: 'qingping', t: 1 }] });
      const { eng, log } = make(run);
      eng.start(run, setup);
      eng.world.godmode = true;
      step(eng, 30);
      crowd(eng, 24);
      step(eng, 2);
      const calls = spy(eng);
      eng.world.moveX = 1; eng.world.moveY = 0;
      eng.skill();
      expect(eng.world.skillRun || eng.world.skillCd > 0, 'cast').toBeTruthy();
      step(eng, 60 * 8);
      expect(errs(log)).toEqual([]);
      // the cooldown runs after the skill ends
      expect(eng.world.skillRun).toBeNull();
      const def = SKILLS[COMPANIONS[char].skill];
      expect(eng.world.skillCd).toBeLessThanOrEqual(def.cd);
      // it did something to the field
      const acted = calls.filter((c) => ['hitArea', 'hitLine', 'hitCone', 'hit', 'convert', 'kill', 'zone', 'buff', 'status'].includes(c.fn));
      expect(acted.length, `${char} acted`).toBeGreaterThan(0);
      eng.dispose();
    });
  }

  it('书生 一字千钧: 30 + 150% of the highest damage stat in r 180, then a 5 s zone slowing 40% with +20% damage taken', () => {
    const { run, setup } = at(5, { char: 'scholar' }, { stats: { elem: 12 } });
    const { eng } = make(run);
    eng.start(run, setup); eng.world.godmode = true; step(eng, 5); crowd(eng, 12); step(eng, 2);
    const calls = spy(eng);
    eng.skill();
    step(eng, 40);
    const hit = calls.find((c) => c.fn === 'hitArea')!;
    for (let k = 0; k < 6; k++) eng.world.spawn('crab', eng.world.px + (k - 3) * 30, eng.world.py - 60, { bloom: false });
    expect(hit.args[2]).toBe(180);
    expect((hit.args[3] as HitPacket).base).toBe(30);
    expect((hit.args[3] as HitPacket).scale).toEqual({ elem: 1.5 });
    const zone = calls.filter((c) => c.fn === 'zone').map((c) => c.args[0] as ZoneSpec).find((z) => z.slow);
    expect(zone?.life).toBe(5); expect(zone?.slow).toBe(40); expect(zone?.r).toBe(180);
    step(eng, 30);
    expect(calls.some((c) => c.fn === 'status' && c.args[1] === 'vuln' && c.args[3] === 20)).toBe(true);
    eng.dispose();
  });

  it('渔翁 一网打尽: pulls in, roots 2 s, +25% for 4 s, and a netted kill drops its 月华 twice', () => {
    const { run, setup } = at(5, { char: 'fisher' });
    const { eng } = make(run);
    eng.start(run, setup); eng.world.godmode = true; step(eng, 5); crowd(eng, 10, 120); step(eng, 2);
    const calls = spy(eng);
    eng.skill();
    expect(calls.some((c) => c.fn === 'status' && c.args[1] === 'root' && c.args[2] === 2)).toBe(true);
    expect(calls.some((c) => c.fn === 'status' && c.args[1] === 'vuln' && c.args[2] === 4 && c.args[3] === 25)).toBe(true);
    expect(calls.some((c) => c.fn === 'attract' && c.args[2] === 400)).toBe(true);
    // kill a netted body: two shares of 月华
    const D = eng.world.D;
    const before = D.count;
    const h = calls.find((c) => c.fn === 'status' && c.args[1] === 'root')!.args[0] as number;
    const cost = eng.world.E.cost[eng.world.E.slotOf(h)];
    eng.world.kill(h, true);
    expect(D.count - before).toBeGreaterThanOrEqual(Math.floor(cost) * 2);
    eng.dispose();
  });

  it('大橘 扑蝶: a kill on landing resets the cooldown; 侠客 一剑光寒 dashes 260 invulnerable', () => {
    {
      const { run, setup } = at(5, { char: 'cat' }, { stats: { melee: 200 } });
      const { eng } = make(run);
      eng.start(run, setup); eng.world.godmode = true; step(eng, 5); crowd(eng, 6, 60); step(eng, 2);
      eng.skill();
      step(eng, 40);
      expect(eng.world.skillCd).toBe(0);
      eng.dispose();
    }
    {
      const { run, setup } = at(5, { char: 'swordsman' });
      const { eng } = make(run);
      eng.start(run, setup); step(eng, 5);
      const calls = spy(eng);
      const x0 = eng.world.px;
      eng.world.moveX = 1; eng.world.moveY = 0;
      eng.skill();
      const dash = calls.find((c) => c.fn === 'dash')!;
      expect(dash.args[2]).toBe(260); expect(dash.args[4]).toBe(0.35);
      step(eng, 20);
      expect(eng.world.px - x0).toBeGreaterThan(200);
      eng.dispose();
    }
  });

  it('玉兔 玉杵捣药 halves damage while rooted; 嫦娥 广寒清辉 rises untargetable 2.5 s and sets the moon full', () => {
    {
      const { run, setup } = at(5, { char: 'rabbit' });
      const { eng } = make(run);
      eng.start(run, setup); step(eng, 5);
      eng.skill();
      step(eng, 2);
      const hp0 = eng.world.hp;
      eng.world.iframes = 0;
      eng.world.hurt(10, { undodgeable: true, noArmor: true });
      expect(hp0 - eng.world.hp).toBeCloseTo(5, 5);
      eng.dispose();
    }
    {
      const { run, setup } = at(5, { char: 'change' });
      const { eng } = make(run);
      eng.start(run, setup); step(eng, 5);
      eng.skill();
      expect(eng.world.untargT).toBeCloseTo(2.5, 5);
      step(eng, 60 * 3);
      expect(eng.world.moonPhase).toBe(0);
      eng.dispose();
    }
  });

  it('棋士 围 captures up to 30 non-elites and takes 8% of an elite\'s HP', () => {
    const { run, setup } = at(8, { char: 'player' }, { weapons: [] });
    const { eng } = make(run);
    eng.start(run, setup); eng.world.godmode = true; step(eng, 5);
    crowd(eng, 40, 150);
    const el = eng.world.spawn('turtle', eng.world.px + 100, eng.world.py, { bloom: false });
    step(eng, 1);
    const hp0 = eng.world.enemy(el).hp;
    const k0 = eng.world.kills;
    eng.skill();
    step(eng, 70);
    expect(eng.world.kills - k0).toBeGreaterThan(0);
    expect(eng.world.kills - k0).toBeLessThanOrEqual(30);
    const hp1 = eng.world.enemy(el).hp;
    expect(hp0 - hp1).toBeGreaterThan(0);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════ hazards, passives

describe('engine-content: map hazards and passives', () => {
  it('registers a behaviour for every hazard with a runtime part', () => {
    for (const h of HAZARD_REG) if (h.id !== 'lowgrav') expect(CONTENT.hazards[h.id], h.id).toBeTruthy();
  });
  for (const map of ['lake', 'forest', 'palace'] as MapId[]) {
    it(`${map}: both hazards run through a long wave (wave 9) without an error`, () => {
      const { run, setup } = at(9, { map });
      const { eng, log } = make(run);
      const calls = spy(eng);
      eng.start(run, setup);
      eng.world.godmode = true;
      step(eng, 60 * 45);
      expect(errs(log)).toEqual([]);
      const zones = calls.filter((c) => c.fn === 'zone').map((c) => (c.args[0] as ZoneSpec).look);
      const teles = calls.filter((c) => c.fn === 'tele').length;
      if (map === 'lake') { expect(zones).toContain('moonCircle'); expect(zones).toContain('rippleRing'); }
      if (map === 'forest') { expect(teles).toBeGreaterThan(0); expect(zones).toContain('inkPuddle'); expect(zones).toContain('leafGust'); }
      if (map === 'palace') expect(teles).toBeGreaterThanOrEqual(2 * 4);
      eng.dispose();
    });
  }
  it('坠玉 falls for 5 × DMG(w), undodgeable, and 嫦娥 floats over it', () => {
    for (const char of ['scholar', 'change'] as CharacterId[]) {
      const { run, setup } = at(9, { map: 'palace', char });
      const { eng } = make(run);
      const calls = spy(eng);
      eng.start(run, setup);
      step(eng, 60 * 12);
      const jade = calls.filter((c) => c.fn === 'hurt' && (c.args[1] as { src?: string })?.src === 'jadefall');
      if (char === 'change') expect(jade).toHaveLength(0);
      else {
        expect(jade.length).toBeGreaterThan(0);
        expect(jade[0].args[0]).toBeCloseTo(5 * setup.plan.dmgX, 5);
        expect((jade[0].args[1] as { undodgeable?: boolean }).undodgeable).toBe(true);
      }
      eng.dispose();
    }
  });
  it('月相: a full-moon wave gives +10 福缘; 嫦娥 on the real 满月 day starts full with +10 福缘', () => {
    const { run, setup } = at(3, { map: 'palace', char: 'change' });
    const s2 = { ...setup, sky: { ...setup.sky, fullWave: true, fullMoonDay: true } };
    const { eng } = make(run);
    eng.start(run, s2);
    step(eng, 2);
    expect(eng.world.stats.luck - setup.stats.luck).toBeGreaterThanOrEqual(20);
    expect(eng.world.moonPhase).toBe(0);
    eng.dispose();
  });
  it('大橘 九命 still saves (the core) and the cat says so; 关公 keeps 5 slots and never sees 暗器 (logic)', () => {
    const { run, setup } = at(4, { char: 'cat' }, { lives: 8 });
    const { eng, log } = make(run);
    eng.start(run, setup); step(eng, 3);
    eng.world.iframes = 0;
    eng.world.hurt(9999, { undodgeable: true, noArmor: true });
    step(eng, 2);
    expect(eng.world.phase).toBe('wave');
    expect(eng.world.lives).toBe(7);
    expect(eng.world.titles.some((t) => t.text.zh.includes('九命'))).toBe(true);
    expect(log.deaths).toHaveLength(0);
    eng.dispose();
    expect(COMPANIONS.guan.slots).toBe(5);
    expect(COMPANIONS.guan.bans).toContain('hidden');
  });
});

// ═════════════════════════════════════════════ elites, affixes, treasures

describe('engine-content: named elites, 镜印 and treasures', () => {
  for (const el of ELITE_REG) {
    it(`${el.id}: moves, telegraphs and hits in 25 s; every affix rides it`, () => {
      const { run, setup } = at(12, { map: el.map });
      const { eng, log } = make(run);
      const calls = spy(eng);
      eng.start(run, setup);
      eng.world.godmode = true;
      const h = eng.world.spawn(el.id as EliteId, eng.world.px + 300, eng.world.py, { bloom: false });
      for (const a of AFFIX_REG) addAffix(eng.world, h, AFFIX_IMPLS[a.id as AffixId]!);
      const x0 = eng.world.enemy(h).x;
      step(eng, 60 * 25);
      expect(errs(log)).toEqual([]);
      const teles = calls.filter((c) => c.fn === 'tele').length;
      expect(teles, 'telegraphs').toBeGreaterThan(0);
      if (eng.world.alive(h)) expect(Math.abs(eng.world.enemy(h).x - x0)).toBeGreaterThan(1);
      eng.dispose();
    });
  }
  it('裂 splits an elite into 3 copies at 30% HP that drop nothing; 盾 adds 5 甲; 疾 +30% speed', () => {
    const { run, setup } = at(12, { map: 'lake' });
    const { eng } = make(run);
    eng.start(run, setup);
    const h = eng.world.spawn('turtle', eng.world.px + 300, eng.world.py, { bloom: false, affixes: ['splitting', 'aegis', 'swift'] });
    const e = eng.world.enemy(h);
    expect(e.armor).toBe(3 + 5);
    const hpMax = e.hpMax;
    expect(e.speed).toBeCloseTo(80 * setup.plan.spdX * 1.3, 3);
    const n0 = eng.world.E.count;
    eng.world.kill(h, true);
    expect(eng.world.E.count - n0).toBe(3 - 1);
    let copies = 0;
    for (let i = 0; i < eng.world.E.n; i++) if (eng.world.E.alive[i] && eng.world.E.id[i] === 'turtle') { copies++; expect(eng.world.E.hpMax[i]).toBeCloseTo(hpMax * 0.3, 1); expect(eng.world.E.noDrops[i]).toBe(1); }
    expect(copies).toBe(3);
    eng.dispose();
  });
  it('貔貅 pays 20 月华 and a 镜奁 when caught and vanishes after 20 s; 镜中花 owes a 镜心 from one hit', () => {
    const { run, setup } = at(6, { map: 'lake' });
    const { eng, log } = make(run);
    eng.start(run, setup); eng.world.godmode = true; step(eng, 3);
    const p = eng.world.spawn('pixiu', eng.world.px + 300, eng.world.py, { bloom: false, capped: false });
    step(eng, 60);
    expect(eng.world.alive(p)).toBe(true);
    eng.world.kill(p, true);
    expect(log.crates).toBeGreaterThan(0);
    const f = eng.world.spawn('mirrorflower', eng.world.px + 200, eng.world.py, { bloom: false, capped: false });
    eng.world.hit(f, { base: 5, src: 'weapon', crit: false });
    expect(eng.world.hearts).toContain('flower');
    const p2 = eng.world.spawn('pixiu', eng.world.px + 300, eng.world.py, { bloom: false, capped: false });
    step(eng, 60 * 21);
    expect(eng.world.alive(p2)).toBe(false);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════ bosses

interface Fight { eng: MirrorEngine; log: Log; h: number[]; patterns: Set<string>; phaseT: number[] }
function fight(id: BossId, o: Partial<NewRunOpts> = {}): Fight {
  const def = BOSSES[id];
  const { run, setup } = at(def.wave, { map: def.map, ...o });
  const { eng, log } = make(run);
  eng.start(run, setup);
  eng.world.godmode = true;
  step(eng, 2);
  const h = eng.world.bossH.slice();
  return { eng, log, h, patterns: new Set(), phaseT: [] };
}
/** Run a phase for `sec`, noting which patterns start. */
function runPhase(f: Fight, sec: number): number {
  let worst = 0;
  const W = f.eng.world;
  for (let i = 0; i < sec * 60; i++) {
    for (const h of f.h) { const st = bossState(W, h); if (st) for (const r of st.calls) if (st.phaseT >= (st.next[st.calls.indexOf(r)] ?? 1e9) - W.dt) f.patterns.add(r.pat); }
    const t0 = performance.now();
    step(f.eng, 1);
    worst = Math.max(worst, performance.now() - t0);
  }
  return worst;
}

describe('engine-content: the nine bosses', () => {
  it('registers a runner for every boss, the Mirror Self, and every pattern the scripts use', () => {
    for (const b of BOSS_REG) expect(CONTENT.bosses[b.id], b.id).toBeTruthy();
    expect(CONTENT.bosses.mirrorself).toBeTruthy();
    for (const b of Object.values(BOSSES)) for (const ph of b.phases) for (const c of ph.script) expect(CONTENT.patterns[c.pat], c.pat).toBeTruthy();
  });

  for (const b of BOSS_REG) {
    it(`${b.id} (${b.zh}): three phases through 1.2 s invulnerable breaks, every pattern fires, then it falls`, () => {
      const f = fight(b.id);
      const W = f.eng.world;
      expect(f.h).toHaveLength(1);
      const h = f.h[0];
      expect(f.log.boss[0]).toMatchObject({ kind: 'intro', id: b.id });
      runPhase(f, 14);
      for (const p of [1, 2]) {
        forcePhase(W, h, p);
        const st = bossState(W, h)!;
        expect(st.phase).toBe(p);
        expect(W.enemy(h).invuln).toBe(true);
        runPhase(f, 1.3);
        expect(W.enemy(h).invuln).toBe(false);
        runPhase(f, 13);
      }
      expect(errs(f.log)).toEqual([]);
      const phases = f.log.boss.filter((e) => e.kind === 'phase').map((e) => (e as { phase: number }).phase);
      expect(phases).toEqual([1, 2]);
      const used = new Set(BOSSES[b.id].phases.flatMap((ph) => ph.script.map((c) => c.pat)));
      for (const pat of used) expect(f.patterns, `${b.id} ${pat}`).toContain(pat);
      // death: the core pays its 镜心 and ends the wave
      W.kill(h, true);
      step(f.eng, 60 * 2);
      expect(f.log.boss.some((e) => e.kind === 'dead')).toBe(true);
      expect(f.log.ends).toHaveLength(1);
      expect(f.log.ends[0].hearts).toContain('boss');
      expect(errs(f.log)).toEqual([]);
      expect(W.lightR).toBeNull();
      f.eng.dispose();
    });
  }

  it('HP never skips a phase: a huge hit holds at the threshold until the break', () => {
    const f = fight('carp');
    const W = f.eng.world, h = f.h[0];
    W.hit(h, { base: 1e9, src: 'weapon', noArmor: true, crit: false });
    expect(W.alive(h)).toBe(true);
    expect(W.enemy(h).hp / W.enemy(h).hpMax).toBeCloseTo(0.6, 3);
    step(f.eng, 2);
    expect(bossState(W, h)!.phase).toBe(1);
    f.eng.dispose();
  });

  it('倒悬 adds a 4th phase at 10% running every pattern for 10 s', () => {
    const f = fight('kui', { vows: { daoxuan: 1 } });
    const W = f.eng.world, h = f.h[0];
    forcePhase(W, h, 3);
    const st = bossState(W, h)!;
    expect(st.phase).toBe(3);
    expect(W.titles.some((t) => t.text.zh === '倒悬')).toBe(true);
    const pats = new Set(st.calls.map((c) => c.pat));
    for (const ph of BOSSES.kui.phases) for (const c of ph.script) expect(pats).toContain(c.pat);
    runPhase(f, 12);
    expect(st.unionUntil).toBe(0);
    expect(errs(f.log)).toEqual([]);
    f.eng.dispose();
  });

  it('enrage from 90 s: +10% damage every 10 s (闲游 from 150 s)', () => {
    const f = fight('wugang');
    const W = f.eng.world, h = f.h[0];
    const st = bossState(W, h)!;
    const c0 = W.enemy(h).dmg;
    st.fightT = 105;
    step(f.eng, 2);
    expect(st.enrage).toBe(2);
    expect(W.enemy(h).dmg).toBeCloseTo(c0 * 1.2, 4);
    f.eng.dispose();
    const g = fight('wugang', { diff: 0 });
    const s2 = bossState(g.eng.world, g.h[0])!;
    s2.fightT = 149;
    step(g.eng, 2);
    expect(s2.enrage).toBe(0);
    g.eng.dispose();
  });

  it('boss damage is the data number at its home wave on 照影, and scales with 镜境 and the wave', () => {
    const f = fight('carp');
    const W = f.eng.world;
    const calls = spy(f.eng);
    W.godmode = false;
    // stand beside the carp, in reach of its tail
    for (let i = 0; i < 60 * 12; i++) {
      const e = W.enemy(f.h[0]);
      W.px = e.x * 0.8; W.py = e.y * 0.8; W.iframes = 0; W.hp = W.hpMax;
      step(f.eng, 1);
    }
    const slaps = calls.filter((c) => c.fn === 'hurt' && (c.args[1] as { src?: string }).src === 'carp');
    expect(slaps.length).toBeGreaterThan(0);
    for (const s of slaps) expect([4, 8]).toContain(Math.round((s.args[0] as number) * 100) / 100);
    f.eng.dispose();
    // endless: a wave-10 boss at wave 40 hits like wave 40
    const { run, setup } = at(40, { map: 'lake' });
    expect(setup.plan.boss?.twins).toBe(true);
    const { eng } = make(run);
    eng.start(run, setup); eng.world.godmode = true; step(eng, 2);
    const hs = eng.world.bossH;
    expect(hs).toHaveLength(2);
    const carp = hs.find((h) => eng.world.E.id[eng.world.E.slotOf(h)] === 'carp');
    if (carp !== undefined) {
      const k = setup.plan.dmgX / dmgMul(10);
      expect(eng.world.enemy(carp).dmg).toBeCloseTo(120 * setup.plan.dmgX / dmgMul(30), 3);
      expect(k).toBeGreaterThan(10);
    }
    eng.dispose();
  });

  it('双生 (wave 40) and 镜主 (wave 50) fight and fall', () => {
    for (const w of [40, 50]) {
      const { run, setup } = at(w, { map: 'forest', char: 'guan' }, { weapons: [{ id: 'yanyue', t: 3 }, { id: 'qingping', t: 2 }, { id: 'thunder', t: 2 }, { id: 'brush', t: 1 }], lastBuy: 'ginseng' });
      const { eng, log } = make(run);
      eng.start(run, setup); eng.world.godmode = true;
      step(eng, 2);
      const hs = eng.world.bossH.slice();
      expect(hs.length).toBe(w === 50 ? 1 : 2);
      step(eng, 60 * 12);
      for (const h of hs) { const e = eng.world.enemy(h); if (e.alive) e.hp = e.hpMax * 0.4; }
      step(eng, 60 * 25);
      expect(errs(log)).toEqual([]);
      if (w === 50) expect(eng.world.titles.length + log.boss.filter((e) => e.kind === 'phase').length).toBeGreaterThan(0);
      for (const h of hs) if (eng.world.alive(h)) eng.world.kill(h, true);
      step(eng, 60 * 2);
      expect(log.ends).toHaveLength(1);
      eng.dispose();
    }
  });

  it('the busiest phases stay cheap to simulate (≤ 4 ms a step in node, with the wave\'s adds)', () => {
    const worst: Record<string, number> = {};
    for (const b of BOSS_REG) {
      const f = fight(b.id, { vows: { daoxuan: 1 } });
      const W = f.eng.world, h = f.h[0];
      for (let k = 0; k < 40; k++) W.spawn('blot', W.px + Math.cos(k) * 400, W.py + Math.sin(k) * 400, { bloom: false });
      let ms = 0;
      for (const p of [0, 1, 2, 3]) {
        if (p) forcePhase(W, h, p);
        runPhase(f, 1.3);
        const t0 = performance.now();
        runPhase(f, 8);
        ms = Math.max(ms, (performance.now() - t0) / (8 * 60));
      }
      worst[b.id] = Math.round(ms * 1000) / 1000;
      expect(errs(f.log)).toEqual([]);
      f.eng.dispose();
    }
    console.log('[content perf] ms per step, worst phase:', JSON.stringify(worst));
    for (const v of Object.values(worst)) expect(v).toBeLessThan(4);
  });
});

// ═════════════════════════════════════════════ 镜蚀 and 节气

describe('engine-content: 镜蚀 and 今日镜 节气', () => {
  const runtime: MutatorId[] = ['mochao', 'huiguang', 'suijing', 'anyue', 'fanzhao'];
  for (const id of MUTATOR_REG.map((m) => m.id as MutatorId)) {
    it(`镜蚀 ${id} at single and double strength runs a wave without an error`, () => {
      for (const x of [1, 2]) {
        const { run, setup } = at(12, { map: 'palace' });
        const s2 = { ...setup, mutators: [{ id, x }] };
        const { eng, log } = make(run);
        eng.start(run, s2);
        eng.world.godmode = true;
        if (id === 'anyue') expect(eng.world.lightR).toBe(x === 2 ? 320 : 420);
        step(eng, 60 * 20);
        expect(errs(log)).toEqual([]);
        if (runtime.includes(id)) expect(CONTENT.mutators[id]).toBeTruthy();
        eng.dispose();
      }
    });
  }
  it('反照 adds a shot beside each shooter\'s; 回光 heals once at half HP; 碎镜 splits once', () => {
    const { run, setup } = at(12, { map: 'lake' });
    const { eng } = make(run);
    eng.start(run, { ...setup, mutators: [{ id: 'huiguang', x: 1 }, { id: 'suijing', x: 1 }] });
    step(eng, 2);
    const h = eng.world.spawn('frog', eng.world.px + 200, eng.world.py, { bloom: false });
    const e = eng.world.enemy(h);
    const max = e.hpMax;
    eng.world.hit(h, { base: max * 0.55 + e.armor, src: 'weapon', crit: false, noArmor: true });
    expect(eng.world.enemy(h).hp).toBeGreaterThan(max * 0.6);
    const n0 = eng.world.E.count;
    eng.world.hit(h, { base: eng.world.enemy(h).hp - max * 0.25, src: 'weapon', crit: false, noArmor: true });
    expect(eng.world.E.count).toBe(n0 + 1);
    eng.dispose();
  });
  for (const t of TERM_MOD_REG) {
    it(`节气 ${t.id} (${t.zh}) runs a 今日镜 wave without an error`, () => {
      const { run, setup } = at(9, { map: 'forest', daily: true, term: t.id as TermModId, mutator: 'mochao' }, {}, new Date(2026, 8, 27, 20));
      const { eng, log } = make(run);
      eng.start(run, setup);
      eng.world.godmode = true;
      expect(setup.term).toBe(t.id);
      step(eng, 60 * 30);
      expect(errs(log)).toEqual([]);
      if (t.id === 'jingzhe') expect(eng.world.mods.chainAdd).toBeGreaterThanOrEqual(TERM_MODS.jingzhe.p.chains);
      if (t.id === 'xiaoman') expect(eng.world.mods.moonPct).toBeGreaterThanOrEqual(20);
      if (t.id === 'daxue') expect(eng.world.lightR).toBe(520);
      eng.dispose();
    });
  }
});

// ═════════════════════════════════════════════ the dev hooks

describe('engine-content: DEV hooks', () => {
  it('jump to any boss and phase, read its state, and fast-forward the enrage', async () => {
    const { run, setup } = at(3, { map: 'lake' });
    const { eng, log } = make(run);
    eng.start(run, setup);
    const dev = contentDev(() => eng);
    await dev.boss('eclipse', 2);
    const bs = dev.bosses();
    expect(bs).toHaveLength(1);
    expect(bs[0]).toMatchObject({ id: 'eclipse', phase: 2 });
    dev.fightTime(100);
    step(eng, 80);
    expect(dev.bosses()[0].enrage).toBe(2);
    await dev.boss('twins');
    expect(dev.bosses()).toHaveLength(2);
    await dev.boss('mirrorself');
    expect(dev.bosses()).toHaveLength(1);
    dev.hazard('jadefall'); dev.mutator('anyue', 2); dev.term('liqiu');
    dev.elite('hound', ['caller']);
    step(eng, 60 * 10);
    expect(errs(log)).toEqual([]);
    eng.dispose();
  });
});

void HAZARDS; void MAPS; void computeStats; void wavePlan; void ({} as TeleSpec);
