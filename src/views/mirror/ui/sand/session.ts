// 水月幻镜 · m8 · the 模拟场's session (sandbox.md §2, §6.1), modelled on tutor/session.ts. SANDBOX owns it.
// A RunSession over a run that lives only in memory: no fee, no ticket, no purse, no counters, no codex,
// tallies, deeds, bests, records, seals, titles, mastery, 镜屑, daily or tips, no meta.active, and no revive
// (no payRevive, so the engine never gets a `downed` hook: a death is a sandbox death card, and 「重打此重」
// replays the wave from the run as it was before it). The coin plan is always empty and a won wave's sleeve is
// dropped. The engine, shop, cards and screens are the real ones. Reading meta (for the start run and the
// wave plan) is all it does with the store.
import { mirror } from '../../../../app/mirror';
import type { DeathResult, RunSave, SpawnPlan, Unlocks, WaveResult, WaveSetup } from '../../types';
import type { RunSession } from '../../logic/session';
import { beginWave, changes, computeStats, endWave, openShop, screenOf, waveSetup, beginTuning, endTuning, tuningActive, withSheet, setValue, valueOf, type SheetRow } from '../../logic';
import { STAT_IDS } from '../../data';
import type { StatId } from '../../types';
import { sandStart, sandUnlocks, type SandStartOpts } from '../../sim/sandstart';
import type { MirrorEngine } from '../../engine';
import { devApi, type MirrorDev } from '../../engine/dev';
import { contentDev, type ContentDev } from '../../engine/content/dev';
import { clock } from '../../engine/tutor';
import { EKind } from '../../engine/pools';

/** The enemy knobs (sandbox.md §4.2): session state, never data; exported as context. */
export interface EnemyKnobs {
  /** Enemy HP × (new spawns now; every enemy at 「重开此重」). */
  hp: number;
  /** Enemy damage × (new spawns now). */
  dmg: number;
  /** Enemy speed × (new spawns now). */
  spd: number;
  /** Enemy count × (the next wave's group sizes). */
  density: number;
}
export const ENEMY_DEFAULT: Readonly<EnemyKnobs> = { hp: 1, dmg: 1, spd: 1, density: 1 };
/** The knobs' ranges (the steppers). */
export const ENEMY_RANGE: Readonly<Record<keyof EnemyKnobs, readonly [number, number]>> = { hp: [0.1, 10], dmg: [0, 10], spd: [0.3, 3], density: [0.25, 4] };

/** One line of the wave log (kept in memory and exported). */
export interface SandWave {
  wave: number;
  end: 'won' | 'died' | 'skipped';
  /** Seconds in the wave. */
  t: number;
  hpLeft: number;
  hpMax: number;
  /** Damage taken this wave. */
  taken: number;
  kills: number;
  /** The best weapon's damage a second this wave. */
  topDps: number;
  /** How many edits (table changes + sheet rows) were in force. */
  edits: number;
}
/** The sandbox death card's facts. */
export interface SandDeath { wave: number; t: number; cause: string; top: readonly (readonly [string, number])[] }
/** 测 DPS: one measured window (sandbox.md §4.3), logged beside the waves and exported. */
export interface SandMeasure {
  wave: number;
  /** Seconds of game time measured (MEASURE_SEC, or less when the wave ended first). */
  sec: number;
  /** Damage dealt and taken, and kills, in the window. */
  dealt: number;
  taken: number;
  kills: number;
  /** Damage a second, all weapons. */
  dps: number;
  /** Damage a second by weapon (best first). */
  by: readonly (readonly [string, number])[];
}
/** 测 DPS's window, in seconds of game time. */
export const MEASURE_SEC = 10;
/** 写进同伴底子 writes these four into the companion's own fields; every other stat into COMPANIONS.*.extra. */
const BODY_KEYS: readonly StatId[] = ['hp', 'armor', 'speed', 'dodge'];

/** The 工具 tab's engine switches (sandbox.md §4.3). Every start resets the engine's own, so started() puts them back. */
export interface SandTools {
  /** 无敌 (W.godmode). */
  god: boolean;
  /** 快慢: 0.25 · 0.5 · 1 · 2 · 3 (MirrorEngine.setTimeScale). */
  timeScale: number;
  /** 技能冷却 ×: 0 · 0.25 · 0.5 · 1 (World.cdX). */
  cdX: number;
  /** 伤害数字 for this sandbox only (null: the player's own setting; never saved). */
  nums: 0 | 1 | 2 | null;
}
export const TOOLS_DEFAULT: Readonly<SandTools> = { god: false, timeScale: 1, cdX: 1, nums: null };
export const TIME_SCALES: readonly number[] = [0.25, 0.5, 1, 2, 3];
export const CD_XS: readonly number[] = [0, 0.25, 0.5, 1];

/** The setup page's choices: the start run's, plus where you arrive. */
export interface SandSetup extends SandStartOpts {
  /** 先到 · 商店 (the shop before the start wave) or 直接开打 (ready to fight). */
  arrive: 'shop' | 'fight';
}

export interface SandSession extends RunSession {
  readonly sandbox: true;
  readonly setup: SandSetup;
  run(): RunSave;
  /** The run as it was before the wave in play (for 重打此重); null before the first wave. */
  before(): RunSave | null;
  log(): readonly SandWave[];
  lastDeath(): SandDeath | null;
  /** The 本局 sheet rows (add / set per stat, 劫数 included); every change re-derives run.sand at once. */
  sheet(): readonly SheetRow[];
  setSheet(rows: readonly SheetRow[]): void;
  setEnemy(k: Partial<EnemyKnobs>): void;
  enemy(): EnemyKnobs;
  /** RunView calls it after createEngine, and with null on dispose. */
  attach(engine: MirrorEngine | null): void;
  /** The dev hooks over the attached engine (spawn, wave, give, god; the bosses, elites, hazards). */
  dev(): { core: MirrorDev; content: ContentDev } | null;
  /** 重打此重: start the wave again from the run as it was before it, with every current edit. */
  replay(): { run: RunSave; setup: WaveSetup } | null;
  /** Change the run (weapons, items, 月华, level …) and the run before the wave in play alike, so a 重开此重 takes it. */
  patch(fn: (r: RunSave) => RunSave): RunSave;
  tools(): SandTools;
  /** Set the 工具 switches; live on the attached engine. */
  setTools(p: Partial<SandTools>): void;
  /** RunView calls it after every engine.start (which resets the scale and cdX): the switches go back on. */
  started(): void;
  /** The 敌人 tab restarted the engine on a boss's own wave: the session follows the engine's run, so that wave's win or death is counted. */
  adopt(run: RunSave): void;
  /** 算作过关: a timed wave's clock to 0; a boss wave's bosses felled (the relic and the result follow as usual). */
  winWave(): void;
  /** 清场: every enemy but the bosses gone, without drops. */
  clearField(): number;
  /** 回满. */
  heal(): void;
  /** 测 DPS: open a MEASURE_SEC window on the wave in play (false when no wave is running). */
  measure(): boolean;
  /** Seconds left in the open window, or null. */
  measuring(): number | null;
  measures(): readonly SandMeasure[];
  /**
   * 写进同伴底子: turn a sheet row into a data edit of the companion (COMPANIONS.<c>.hp/armor/speed/dodge, else
   * .extra.<stat>), drop the row, and keep the live sheet where it was. 劫数 stays a run row (enemies read items'
   * curse only). Returns the path written, or null.
   */
  bake(id: StatId): string | null;
}

/** The wave plan with the enemy knobs on (a copy; the plan from logic is never changed). */
export function knobPlan(plan: SpawnPlan, k: EnemyKnobs): SpawnPlan {
  if (k.hp === 1 && k.dmg === 1 && k.spd === 1 && k.density === 1) return plan;
  const groups = k.density === 1 ? plan.groups : plan.groups.map((g) => ({ ...g, n: Math.max(1, Math.round(g.n * k.density)) }));
  let kills = 0;
  for (const g of groups) kills += g.n;
  return {
    ...plan, hpX: plan.hpX * k.hp, dmgX: plan.dmgX * k.dmg, spdX: plan.spdX * k.spd, groups,
    kills: k.density === 1 ? plan.kills : kills + (plan.kills - plan.groups.reduce((a, g) => a + g.n, 0)),
  };
}

/**
 * Apply a change of the run's sandbox rows to a wave in play: base += computeStats(after) − computeStats(before)
 * (the same delta rule as a 镜宝 grant), the engine's run takes the new `sand`, then the live sheet is recomputed.
 */
export function liveSheet(engine: MirrorEngine, next: (run: RunSave) => RunSave): void {
  const W = engine.world;
  const prev = W.run;
  const after = next(prev);
  const s0 = computeStats(prev), s1 = computeStats(after);
  for (const k of STAT_IDS) W.base[k] += s1[k] - s0[k];
  W.run = after;
  W.recomputeStats();
}

/** Enter the sandbox's tuning (idempotent): the tables' snapshot is taken here. */
export function openSand(): void { if (!tuningActive()) beginTuning(); }
/** Leave the sandbox: every table back exactly (restore + verify). The one exit (sandbox.md §2). */
export function leaveSand(): { restored: number; exact: boolean } { return endTuning(); }

/**
 * A sandbox session over the start run of `setup` (sim/sandstart.ts). With `arrive: 'shop'` the start wave's
 * shop is open (after any cards or crates the build still holds, as screenOf orders them).
 */
export function createSandSession(setup: SandSetup): SandSession {
  const unlocks: Unlocks = sandUnlocks(mirror.value, setup.pool);
  let cur: RunSave = sandStart(mirror.value, setup);
  if (setup.arrive === 'shop' && screenOf(cur) === 'shop') cur = openShop(cur, unlocks);
  let before: RunSave | null = null;
  let rows: SheetRow[] = [];
  let knobs: EnemyKnobs = { ...ENEMY_DEFAULT };
  let tools: SandTools = { ...TOOLS_DEFAULT };
  const applyTools = () => {
    if (!eng) return;
    eng.world.godmode = tools.god;
    eng.world.cdX = tools.cdX;
    eng.setTimeScale(tools.timeScale);
    eng.setSettings({ nums: tools.nums ?? mirror.value.settings.nums });
  };
  let basePlan: SpawnPlan | null = null;
  let eng: MirrorEngine | null = null;
  let devs: { core: MirrorDev; content: ContentDev } | null = null;
  let unwrap: (() => void) | null = null;
  const log: SandWave[] = [];
  let death: SandDeath | null = null;
  const hurt: Record<string, number> = {};
  let taken = 0;
  const measures: SandMeasure[] = [];
  let win: { wave: number; t0: number; by0: Record<string, number>; kills0: number; taken0: number; timer: ReturnType<typeof setInterval> | null } | null = null;
  const dmgBy = (): Record<string, number> => {
    const o: Record<string, number> = {};
    if (eng) for (const id in eng.world.byWeapon) o[id] = eng.world.byWeapon[id as keyof typeof eng.world.byWeapon]?.dmg ?? 0;
    return o;
  };
  /** Close the window (at MEASURE_SEC, or early when the wave ends or the engine goes). */
  const closeWin = () => {
    if (!win) return;
    const w = win;
    win = null;
    if (w.timer) clearInterval(w.timer);
    if (!eng) return;
    const sec = Math.max(0, eng.world.live.waveTime - w.t0);
    if (sec < 1) return;
    const now = dmgBy();
    const by: [string, number][] = [];
    let dealt = 0;
    for (const id in now) { const d = now[id] - (w.by0[id] ?? 0); if (d > 0) { by.push([id, Math.round(d / sec)]); dealt += d; } }
    by.sort((a, b) => b[1] - a[1]);
    measures.push({ wave: w.wave, sec: Math.round(sec * 10) / 10, dealt: Math.round(dealt), taken: Math.round(taken - w.taken0), kills: eng.world.kills - w.kills0, dps: Math.round(dealt / sec), by });
  };

  const sanded = (run: RunSave) => withSheet(run, rows);
  const edits = () => changes().length + rows.length;
  const hpNow = (): [number, number] => (eng ? [Math.max(0, Math.round(eng.world.hp)), Math.round(eng.world.hpMax)] : [0, 0]);
  const line = (end: SandWave['end'], res: WaveResult): SandWave => {
    const t = Math.max(0, res.ms) / 1000;
    let top = 0;
    for (const id in res.byWeapon) top = Math.max(top, res.byWeapon[id as keyof typeof res.byWeapon]?.dmg ?? 0);
    const [hpLeft, hpMax] = hpNow();
    return { wave: res.wave, end, t: Math.round(t * 10) / 10, hpLeft: end === 'died' ? 0 : hpLeft, hpMax, taken: Math.round(taken), kills: res.stats.kills ?? 0, topDps: t > 0 ? Math.round(top / t) : 0, edits: edits() };
  };
  /** The death's line and card, still open to the fatal blow's tally (settled on the first read or the next start). */
  let open: SandWave | null = null;
  const settle = () => {
    if (!open || !death) return;
    open.taken = Math.round(taken);
    death = { ...death, top: Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [k, Math.round(v)] as const) };
    open = null;
  };
  const start = (run: RunSave): { run: RunSave; setup: WaveSetup } => {
    closeWin();
    settle();
    before = sanded(run);
    const r = beginWave(before);
    const base = waveSetup(r, mirror.value, new Date());
    basePlan = base.plan;
    const setupW: WaveSetup = { ...base, coins: [], plan: knobPlan(base.plan, knobs) };
    cur = r;
    death = null;
    taken = 0;
    for (const k in hurt) delete hurt[k];
    return { run: r, setup: setupW };
  };

  return {
    practice: false,
    sandbox: true,
    setup,
    run: () => cur,
    before: () => before,
    log: () => { settle(); return log; },
    lastDeath: () => { settle(); return death; },
    commit(next) { cur = next; },
    startWave(run) { return start(run); },
    waveWon(res: WaveResult) {
      if (cur.inWave === null || cur.inWave !== res.wave) return cur;
      closeWin();
      log.push(line('won', res));
      // nothing earned here goes anywhere: the sleeve (never planned: coins = []) is dropped too
      cur = sanded(endWave(cur, { ...res, sleeve: [] }));
      return cur;
    },
    died(d: DeathResult) {
      if (cur.inWave === null || cur.inWave !== d.wave) return null;
      closeWin();
      // the engine may report the death from inside the fatal hurtFrom, before the tally sees that blow:
      // the card's sources and the line's damage are read when they are first asked for (settle())
      const ln = line('died', d.partial);
      log.push(ln);
      death = { wave: d.wave, t: Math.round((Math.max(0, d.partial.ms) / 1000) * 10) / 10, cause: d.cause, top: [] };
      open = ln;
      cur = { ...cur, inWave: null };
      return null;
    },
    leaveMidWave() {
      if (cur.inWave !== null) cur = { ...cur, inWave: null };
      return { interruptions: 0, report: null };
    },
    abandon: () => null,
    engineFailed: () => null,
    markSeen: () => {},
    unlocks: () => unlocks,
    sheet: () => rows,
    setSheet(next) {
      rows = next.map((r) => ({ ...r }));
      cur = sanded(cur);
      if (before) before = sanded(before);
      // live during a wave: the engine's static sheet moves by the difference (as a 镜宝 grant does), the engine's run
      // carries the new rows (so its own mid-wave recomputes keep them), and a 气血 rise heals by the difference
      if (eng && cur.inWave !== null && eng.world.run) liveSheet(eng, (r) => withSheet(r, rows));
    },
    setEnemy(k) {
      knobs = { ...knobs, ...k };
      for (const key of Object.keys(ENEMY_RANGE) as (keyof EnemyKnobs)[]) {
        const [lo, hi] = ENEMY_RANGE[key];
        const v = knobs[key];
        knobs[key] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : ENEMY_DEFAULT[key];
      }
      // new spawns see HP / damage / speed at once (the engine reads the plan at each spawn)
      if (eng && basePlan && eng.world.plan) {
        eng.world.plan.hpX = basePlan.hpX * knobs.hp;
        eng.world.plan.dmgX = basePlan.dmgX * knobs.dmg;
        eng.world.plan.spdX = basePlan.spdX * knobs.spd;
      }
    },
    enemy: () => ({ ...knobs }),
    attach(engine) {
      if (!engine) closeWin();
      unwrap?.();
      unwrap = null;
      eng = engine;
      devs = engine ? { core: devApi(engine), content: contentDev(() => eng) } : null;
      if (!engine) return;
      // tally the damage you take (for the death card and the log), passing every argument through
      const W = engine.world as unknown as { hurtFrom: (...a: unknown[]) => number; bossH?: number[] };
      const own = Object.prototype.hasOwnProperty.call(W, 'hurtFrom');
      const orig = W.hurtFrom;
      const bound = orig.bind(W);
      W.hurtFrom = (...a: unknown[]): number => {
        const d = bound(...a);
        if (d > 0) {
          const k = String(a[4] ?? '?') + (a[5] ? ' dot' : '');
          hurt[k] = (hurt[k] ?? 0) + d;
          taken += d;
        }
        return d;
      };
      unwrap = () => { if (own) W.hurtFrom = orig; else delete (W as { hurtFrom?: unknown }).hurtFrom; };
    },
    dev: () => devs,
    patch(fn) {
      cur = sanded(fn(cur));
      if (before) before = sanded(fn(before));
      return cur;
    },
    tools: () => ({ ...tools }),
    setTools(p) {
      const next = { ...tools, ...p };
      next.timeScale = TIME_SCALES.includes(next.timeScale) ? next.timeScale : 1;
      next.cdX = Number.isFinite(next.cdX) ? Math.max(0, Math.min(1, next.cdX)) : 1;
      next.nums = next.nums === 0 || next.nums === 1 || next.nums === 2 ? next.nums : null;
      tools = next;
      applyTools();
    },
    started() { applyTools(); },
    adopt(run) {
      closeWin();
      settle();
      cur = run;
      before = sanded({ ...run, inWave: null });
      death = null;
      taken = 0;
      for (const k in hurt) delete hurt[k];
    },
    winWave() {
      if (!eng || eng.world.phase !== 'wave') return;
      const W = eng.world;
      if (W.plan && W.plan.len !== null) { clock(eng, 0); return; }
      for (const h of W.bossH.slice()) if (W.alive(h)) W.kill(h, true);
    },
    clearField() {
      if (!eng) return 0;
      const E = eng.world.E;
      let n = 0;
      for (let i = 0; i < E.n; i++) {
        if (!E.alive[i] || E.kind[i] === EKind.Boss || E.kind[i] === EKind.Ally) continue;
        eng.world.killSlot(i, false, false);
        n++;
      }
      return n;
    },
    heal() { if (eng) eng.world.hp = eng.world.hpMax; },
    measure() {
      if (!eng || eng.world.phase !== 'wave' || cur.inWave === null) return false;
      closeWin();
      const W = eng.world;
      win = { wave: cur.inWave, t0: W.live.waveTime, by0: dmgBy(), kills0: W.kills, taken0: taken, timer: null };
      const w = win;
      w.timer = setInterval(() => {
        if (win !== w) { if (w.timer) clearInterval(w.timer); return; }
        if (!eng || eng.world.phase !== 'wave' || eng.world.live.waveTime - w.t0 >= MEASURE_SEC) closeWin();
      }, 200);
      return true;
    },
    measuring: () => (win && eng ? Math.max(0, MEASURE_SEC - (eng.world.live.waveTime - win.t0)) : null),
    measures: () => measures,
    bake(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || id === 'curse') return null;
      const rest = rows.filter((x) => x.id !== id);
      const d = r.mode === 'add' ? r.v : r.v - computeStats(withSheet(cur, rest))[id];
      const path = BODY_KEYS.includes(id) ? `COMPANIONS.${cur.char}.${id}` : `COMPANIONS.${cur.char}.extra.${id}`;
      const old = valueOf(path);
      const next = Math.round(((typeof old === 'number' ? old : 0) + d) * 1e4) / 1e4;
      const liveRun = eng && cur.inWave !== null ? eng.world.run : null;
      const s0 = liveRun ? computeStats(liveRun) : null;
      if (setValue(path, typeof old !== 'number' && next === 0 ? null : next) !== 'ok') return null;
      rows = rest;
      cur = sanded(cur);
      if (before) before = sanded(before);
      if (eng && liveRun && s0) {
        const W = eng.world;
        const after = withSheet(liveRun, rows);
        const s1 = computeStats(after);
        for (const k of STAT_IDS) W.base[k] += s1[k] - s0[k];
        W.run = after;
        W.recomputeStats();
      }
      return path;
    },
    replay() {
      if (!before) return null;
      const b = before;
      return start({ ...b, inWave: null });
    },
  };
}
