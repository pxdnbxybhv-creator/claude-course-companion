// 水月幻镜 · m8 BALANCE sweep (PLAN §4.B, §8.1): the balance critic's harness (_m8_balc.test.ts, parts A, B and F)
// ported onto the shipped code — no runtime emulation: every number, the 破釜 floor, 酒入豪肠, 剑幕 … are the real
// ones. QA's tool; it runs only with MIRROR_SWEEP=1 and asserts nothing about depth (only that no engine error fired).
//
//   to 31 (A):   MIRROR_SWEEP=1 PART=A SEEDS=7 MAXW=31 MAP=lake LEVELS=beginner,average,skilled CHARS=a,b OUT=/abs/A.jsonl
//   from 30 (B): MIRROR_SWEEP=1 PART=B GOD=30 MAXW=45 MAPS=lake,forest,palace ZONES=1 SEEDS=6 CHARS=a,b OUT=/abs/B.jsonl
//   fixed kit (F): MIRROR_SWEEP=1 PART=F FW=35 SEEDS=6 FIXW=qin CHARS=musician,scholar OUT=/abs/F.jsonl
//   probes: CURSE=5:10 (from wave 5, +10 pure 劫 through run.sand.curse) · NO_BB=1 (破釜沉舟 never offered)
//           LEVER=ITEMS.elixir.max=16,SKILLS.yijian.p.streak=2.4,WEAPONS.thunder.dmg.0=14,BOT_M8.rerollLoss=0.06 (Phase 3 levers set for the sweep,
//           restored after; the rows carry the tag, so the tables can compare a lever against the shipped value)
//           TUNING=/abs/mirror-tuning-….json (the owner's 模拟场 export, applied for the sweep and restored after;
//           cr/S-B.md). Do not combine with LEVER on the same path.
//   hidden (H): MIRROR_SWEEP=1 PART=H DIFF=4 GOD=30 MAXW=45 SEEDS=2 [CHARS=yuenv] [VERBS=expert,novice] OUT=/abs/H.jsonl
//           (own map unless MAP; VERBS=expert|novice|kite: novice = the kiting legs with the masher's thumb, kite = the
//           kiting legs with the expert's thumb; rows carry the verb tallies)
//   tables:  MIRROR_SWEEP=1 PART=TAB FILES=/abs/B.jsonl,/abs/A.jsonl[,/abs/before.jsonl] (prints the §8.1 tables)
// CHARS defaults to the 13 (CHARS=all adds the hidden three). Seeds are the design harness's (s × 7919 + id length).
// Shard by CHARS, at most four at a time (PLAN §5).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPANION_REG, type ArchetypeId, type MapId, type WeaponId } from '../src/views/mirror/ids';
import type { CharacterId, DeathResult, DiffIndex, EngineHooks, EngineSettings, MirrorAudio, RunSave, Unlocks, WaveResult } from '../src/views/mirror/types';
import { isHidden } from '../src/views/mirror/types';
import { COMPANIONS, F, ITEMS, PASSIVES, SKILLS, WEAPONS } from '../src/views/mirror/data';
import { allUnlocked, bankSleeve, beginWave, computeStats, cooldown, endWave, pickStart, rngFor, screenOf, waveSetup } from '../src/views/mirror/logic';
import { tierCd } from '../src/views/mirror/logic/formulas';
import { endTuning, tuningActive } from '../src/views/mirror/logic';
import { applyTuningText } from '../src/views/mirror/ui/sand/io';
import { newRun } from '../src/views/mirror/logic/run';
import { defaultMeta } from '../src/app/mirror';
import { createEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { SRC } from '../src/views/mirror/engine/consts';
import { BOT_M8, doCards, doCrates, doHearts, doShop, prefers, value } from '../src/views/mirror/sim/bot';
import { botStep, verbStep, type BotLevel, type BotState } from '../src/views/mirror/sim/realbal';
import { hiddenTally, inSunArrow } from '../src/views/mirror/engine/content/hidden';
import { EKind } from '../src/views/mirror/engine/pools';

// The world's struct-of-arrays internals are read directly: a dev harness, not content.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const DAY = '2026-09-27';
const STAT_KEYS = ['hp', 'regen', 'steal', 'dmg', 'melee', 'ranged', 'elem', 'spirit', 'aspd', 'crit', 'critDmg', 'range', 'armor', 'dodge', 'speed', 'luck', 'harvest', 'curse', 'area', 'pierce', 'summonCap', 'swords'] as const;
const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r1 = (x: number) => Math.round(x * 10) / 10;

interface Opts { seed: number; char: CharacterId; map: MapId; diff: DiffIndex; maxWave: number; level: BotLevel; godTo: number; rowsFrom: number; zones: boolean; fixed?: { wave: number };
  /** PART H: 'novice' = the skilled bot's legs (kiting, no hold-ground) with the masher's thumb (hidden.md §6); 'kite' = the
   *  same legs with the expert's thumb (does the expert's stand-still / hold-ground movement cost or pay?). */
  verb?: 'novice' | 'kite' }

/** The unlocks the sweep plays with: everything (as the design harness), or without 破釜沉舟 (NO_BB=1). */
function sweepUnlocks(): Unlocks {
  const u = allUnlocked();
  if (env.NO_BB !== '1') return u;
  return { weapons: u.weapons, items: new Set([...u.items].filter((id) => id !== 'burnboats')) };
}
/** LEVER=TABLE.path=v,…: set data leaves for the sweep (a Phase 3 lever), returning the undo. Numbers only. */
function levers(spec: string | undefined): () => void {
  const roots: Record<string, Raw> = { F, ITEMS, PASSIVES, SKILLS, WEAPONS, COMPANIONS, BOT_M8 };
  const undo: (() => void)[] = [];
  for (const kv of (spec ?? '').split(',').filter(Boolean)) {
    const [path, v] = kv.split('=');
    const keys = path.split('.');
    let o: Raw = roots[keys[0]];
    for (const k of keys.slice(1, -1)) o = o?.[k];
    const last = keys[keys.length - 1];
    if (!o || typeof o[last] !== 'number') throw new Error(`LEVER: ${path} is not a number leaf`);
    const old = o[last];
    o[last] = Number(v);
    undo.push(() => { o[last] = old; });
  }
  return () => { for (const f of undo.reverse()) f(); };
}
/** CURSE=w:n — from wave w on, n pure 劫 points (the 模拟场's run.sand.curse: curseOf, hpX, dmgX and the engine read it). */
const CURSE = env.CURSE ? { w: +env.CURSE.split(':')[0], n: +env.CURSE.split(':')[1] } : null;

export function playInst(o: Opts) {
  const { map, maxWave, level } = o, beginner = level === 'beginner';
  const u = sweepUnlocks();
  const arch: ArchetypeId = COMPANIONS[o.char].leans[0];
  const rng = rngFor(o.seed, 0, 'bot');
  let meta = defaultMeta(DAY);
  let run: RunSave = newRun({
    seed: o.seed, char: o.char, map, diff: o.diff, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: u, mastery: 0,
  });
  if (run.pending.start) {
    const opts = run.pending.start, pref = prefers(arch);
    let best = opts.find((id) => pref.weapons.has(id)) ?? opts[0];
    if (!pref.weapons.has(best)) { let bv = -Infinity; for (const id of opts) { const v = value(pickStart(run, id)); if (v > bv) { bv = v; best = id; } } }
    run = pickStart(run, best);
  }
  let wStart = 1;
  if (o.fixed) {
    // PART F: one wave in godmode with 6 (关公 5) copies of FIXW (or the start weapon) at tier IV, plus 10 金丹
    // (the cap is 12) and 10 of the weapon's main-scale 凡 item
    const fixw = (env.FIXW ?? '').split(',').filter(Boolean) as WeaponId[];
    const id = fixw[0] ?? run.weapons[0]?.id ?? (COMPANIONS[o.char].start as WeaponId);
    const def = WEAPONS[id] as Raw;
    const main = Object.entries(def.scale as Record<string, number>).sort((a, b) => b[1] - a[1])[0][0];
    const it = main === 'melee' ? 'whetstone' : main === 'ranged' ? 'fletch' : main === 'elem' ? 'cinnabar' : 'pineink';
    run = {
      ...run, wave: o.fixed.wave - 1, items: { elixir: 10, [it]: 10 } as Raw, pending: { ...run.pending, start: null } as Raw,
      weapons: Array.from({ length: COMPANIONS[o.char].slots }, (_, k) => ({ id: fixw.length ? fixw[k % fixw.length] : id, t: 4 as const })) as Raw,
    };
    wStart = o.fixed.wave;
  }
  const ends: WaveResult[] = [], deaths: DeathResult[] = [];
  let errors = 0;
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {},
    waveEnd: (r) => ends.push(r), death: (d) => deaths.push(d), error: () => { errors++; },
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
  const canvas = { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) } as unknown as HTMLCanvasElement;
  const eng: Raw = createEngine(canvas, run, { painter: createDebugPainter(map, 'high', 1), audio: SILENT, content: CONTENT, hooks, settings });
  const W: Raw = eng.world;
  const E = W.E;
  // ── instruments (reset every wave)
  let hurtBy: Record<string, number> = {}, hpLost = 0, hitsN = 0, crits = 0, heals = 0;
  let bySrc: Record<string, number> = {}, bossDmg = 0, monDmg = 0;
  const firstHit = new Float64Array(E.cap).fill(-1);
  let ttkAge: number[] = [], ttkHit: number[] = [], monHp: number[] = [];
  let samples = 0, monSamples = 0;
  const up: Record<string, number> = { burn: 0, bleed: 0, slow: 0, stun: 0, root: 0, charm: 0, vuln: 0, shred: 0 };
  let casts = 0;
  const origHurt = W.hurtFrom.bind(W);
  W.hurtFrom = (...a: Raw[]): number => {
    const d = origHurt(...a);
    const src = a[4] as string, dot = !!a[5];
    if (d > 0) { const k = src + (dot ? ' dot' : ''); hurtBy[k] = (hurtBy[k] ?? 0) + d; hpLost += d; if (!dot) hitsN++; }
    return d;
  };
  const origStrike = W.strike.bind(W);
  W.strike = (i: number, ...a: Raw[]): number => {
    const kind = E.kind[i], alive = E.alive[i];
    if (alive && kind === 0 && firstHit[i] < 0) firstHit[i] = W.tWave;
    const d = origStrike(i, ...a);
    if (d > 0 && kind !== 4) {
      const k0 = SRC[a[7] as number] ?? 'src' + String(a[7]);
      // 满弓's free sun arrows are their own row ('sun'): 'skill' is 射日's drawn arrow only (A-H2 / A-H3)
      const k = k0 === 'skill' && inSunArrow(W) ? 'sun' : k0;
      if (tally && k === 'skill') lastSkill = { d, frac: d / Math.max(1, E.hpMax[i]), mon: kind === EKind.Mon };
      bySrc[k] = (bySrc[k] ?? 0) + d;
      if (kind === 2) bossDmg += d; else monDmg += d;
    }
    return d;
  };
  const origKill = W.killSlot.bind(W);
  W.killSlot = (i: number, drops: boolean, crit: boolean): void => {
    if (E.alive[i] && E.kind[i] === 0 && !E.child[i]) {
      ttkAge.push(E.age[i]);
      if (firstHit[i] >= 0) ttkHit.push(W.tWave - firstHit[i]);
      monHp.push(E.hpMax[i]);
    }
    firstHit[i] = -1;
    origKill(i, drops, crit);
  };
  const origSpawn = W.spawn.bind(W);
  W.spawn = (...a: Raw[]) => { const h = origSpawn(...a); const i = h >= 0 ? E.slotOf(h) : -1; if (i >= 0) firstHit[i] = -1; return h; };
  // PART H: 山鬼's snaps (each vine's hit, marked taut) on ordinary foes, waves 30–34 (A-H4); the tally's own setters
  let lastSkill: { d: number; frac: number; mon: boolean } | null = null;
  const snapRows: { d: number; frac: number; taut: boolean }[] = [];
  const tally: Raw = ((SKILLS as Raw)[COMPANIONS[o.char].skill]?.input ?? 'tap') !== 'tap' ? hiddenTally(W) : null;
  if (tally) {
    let sn = tally.snaps, ta = tally.taut;
    Object.defineProperty(tally, 'snaps', { configurable: true, enumerable: true, get: () => sn, set: (v: number) => {
      sn = v;
      if (lastSkill && lastSkill.mon && W.wave >= 30 && W.wave <= 34) snapRows.push({ d: lastSkill.d, frac: lastSkill.frac, taut: false });
      lastSkill = null;
    } });
    Object.defineProperty(tally, 'taut', { configurable: true, enumerable: true, get: () => ta, set: (v: number) => { ta = v; if (snapRows.length) snapRows[snapRows.length - 1].taut = true; } });
  }
  const origCast = W.castSkill.bind(W);
  W.castSkill = (at: Raw, dir: Raw) => { const ok = origCast(at, dir); if (ok) casts++; return ok; };
  const origEmit = W.emit.bind(W);
  W.emit = (type: string, ...a: Raw[]) => { if (type === 'crit') crits++; return origEmit(type, ...a); };
  const origHeal = W.heal.bind(W);
  W.heal = (n: number) => { heals += n; return origHeal(n); };

  const st: BotState = { wander: 0, last: [0, 0], n: 0, zones: o.zones };
  const trace: string[] = [];
  const rows: Raw[] = [];
  let dead = false, deadAtBoss = false, deathWave = 0, timeout = false, ms = 0, steps = 0;
  let snap30: Raw = null, tally30: Raw = null;
  const near = () => { let n = 1e9; for (let i = 0; i < E.n; i++) { if (!E.alive[i] || E.kind[i] === 4) continue; const d = Math.hypot(W.px - E.x[i], W.py - E.y[i]) - E.r[i]; if (d < n) n = d; } return n; };
  for (let w = wStart; w <= maxWave; w++) {
    if (CURSE && w >= CURSE.w) run = { ...run, sand: { sheet: [], curse: CURSE.n } };
    const r = beginWave(run);
    const s0 = computeStats(r);
    if (w === 30 || (w === maxWave && !snap30)) snap30 = Object.fromEntries(STAT_KEYS.map((k) => [k, r1(s0[k])]));
    if (tally && w === Math.max(1, o.godTo)) tally30 = { ...tally, snaps: tally.snaps, taut: tally.taut };
    const setup = waveSetup(r, meta, new Date(2026, 8, 27, 20));
    const e0 = ends.length, d0 = deaths.length;
    hurtBy = {}; hpLost = 0; hitsN = 0; crits = 0; heals = 0; bySrc = {}; bossDmg = 0; monDmg = 0; ttkAge = []; ttkHit = []; monHp = []; samples = 0; monSamples = 0; casts = 0;
    for (const k in up) up[k] = 0;
    firstHit.fill(-1);
    eng.start(r, setup);
    const t0 = performance.now();
    let k = 0;
    while (ends.length === e0 && deaths.length === d0 && k < 60 * 400) {
      if (eng.paused) eng.resume();
      if (k % 3 === 0 && W.phase === 'wave') {
        W.godmode = w < o.godTo;
        if (o.verb && tally) {
          // legs: the skilled kiting bot as for a tap companion (its own cast swallowed); thumb: the masher
          const sd = W.skillDef;
          W.skillDef = { ...sd, input: 'tap' }; eng.skill = () => {};
          try { botStep(W, eng, level, st); } finally { W.skillDef = sd; delete eng.skill; }
          verbStep(W, o.verb === 'novice' ? 'beginner' : level, st, near());
        } else botStep(W, eng, level, st);
      }
      if (k % 30 === 0 && W.phase === 'wave' && w >= o.rowsFrom) {
        samples++;
        for (let i = 0; i < E.n; i++) {
          if (!E.alive[i] || E.kind[i] !== 0) continue;
          monSamples++;
          if (E.burnT[i] > 0 && E.burnN[i] > 0) up.burn++;
          if (E.bleedT[i] > 0 && E.bleedN[i] > 0) up.bleed++;
          if (E.slowT[i] > 0) up.slow++;
          if (E.stunT[i] > 0) up.stun++;
          if (E.rootT[i] > 0) up.root++;
          if (E.charmT[i] > 0) up.charm++;
          if (E.vulnT[i] > 0) up.vuln++;
          if (E.shredT[i] > 0) up.shred++;
        }
      }
      eng.stepN(1);
      k++;
    }
    ms += performance.now() - t0; steps += k;
    const died = deaths.length > d0, tw = W.tWave;
    if (w >= o.rowsFrom) {
      const live = W.stats;
      const fire = (W.slots as Raw[]).map((s) => {
        const half = s.kind === 'paint' || s.kind === 'turret' || s.kind === 'mine' || s.kind === 'familiar';
        const cd = cooldown(tierCd(s.def, s.t), live.aspd, half);
        return { id: s.id + s.t, n: s.n, ratio: r1((s.n * cd) / Math.max(1, tw) * 100) / 100 };
      });
      const res = died ? null : ends[ends.length - 1];
      const total = Object.values(bySrc).reduce((a, b) => a + b, 0);
      rows.push({
        w, boss: !!setup.plan.boss, died, t: r1(tw), dmg: Math.round(total), dps: Math.round(total / Math.max(1, tw)), monDps: Math.round(monDmg / Math.max(1, tw)), bossDmg: Math.round(bossDmg),
        bySrc: Object.fromEntries(Object.entries(bySrc).map(([a, b]) => [a, Math.round(b)])),
        hpLost: Math.round(hpLost), hits: hitsN, hpMax: Math.round(W.hpMax), hpEnd: Math.round(W.hp), crits, heals: Math.round(heals),
        kills: ttkAge.length, ttkAge: med(ttkAge) === null ? null : r1(med(ttkAge)!), ttkHit: med(ttkHit) === null ? null : r1(med(ttkHit)!), monHp: med(monHp) === null ? null : Math.round(med(monHp)!),
        up: Object.fromEntries(Object.entries(up).map(([a, b]) => [a, monSamples ? Math.round((b / monSamples) * 100) : 0])), crowd: samples ? r1(monSamples / samples) : 0,
        fire, casts, moon: res?.moon ?? null, wt: r.weapons.map((x) => x.t).join(''), wid: r.weapons.map((x) => x.id + x.t).join(','), luck: r1(live.luck), bank: r.moon, aspd: r1(live.aspd), elem: r1(live.elem), curse: r1(live.curse),
        hurtBy: Object.fromEntries(Object.entries(hurtBy).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, b]) => [a, Math.round(b)])),
      });
    }
    if (died) {
      dead = true; deadAtBoss = !!setup.plan.boss; deathWave = w;
      trace.push(`w${w}:DIED@${Math.round(tw)}s hits ${hitsN}${deadAtBoss ? ' BOSS' : ''}`);
      run = { ...r, inWave: null };
      break;
    }
    if (ends.length === e0) { timeout = true; trace.push(`w${w}:TIMEOUT`); run = { ...r, inWave: null }; break; }
    const res = ends[ends.length - 1];
    run = endWave(r, res);
    const b = bankSleeve(meta, run, res.sleeve, DAY);
    meta = { ...b.meta, owed: 0 };
    run = b.run;
    trace.push(`w${w}:${Math.round(tw)}s,hp${Math.round(W.hp)}/${Math.round(W.hpMax)}`);
    for (let g = 0; g < 50 && screenOf(run) !== 'shop'; g++) {
      const sc = screenOf(run);
      if (sc === 'cards') run = doCards(run, rng, beginner, arch);
      else if (sc === 'crate') run = doCrates(run, u, beginner);
      else if (sc === 'heart') run = doHearts(run, u, beginner);
      else break;
    }
    run = doShop(run, u, rng, beginner, arch);
  }
  eng.dispose();
  const sEnd = computeStats(run);
  return {
    char: o.char, seed: o.seed, map, level, godTo: o.godTo, zones: o.zones, W: run.wave, dead, deathWave, deadAtBoss, timeout, errors, msPerStep: steps ? r1((ms / steps) * 1000) / 1000 : 0,
    trace: trace.slice(-3), fatal: rows.length && rows[rows.length - 1].died ? rows[rows.length - 1].hurtBy : null,
    weapons: run.weapons.map((x) => `${x.id}${x.t}`), items: Object.fromEntries(Object.entries(run.items).sort((a, b) => (b[1] as number) - (a[1] as number))),
    stats30: snap30, statsEnd: Object.fromEntries(STAT_KEYS.map((k) => [k, r1(sEnd[k])])), lvl: run.lvl, rows,
    ...(tally ? { verb: o.verb ?? 'expert', tally: { ...tally, snaps: tally.snaps, taut: tally.taut }, tally30, snapRows } : {}),
  };
}

// ───────────────────────────────────────────── the §8.1 tables (balc_an.mjs, ported)
const ZH: Record<string, string> = {
  scholar: '书生', gardener: '园丁', fisher: '渔翁', musician: '琴师', swordsman: '侠客', taoist: '道童', painter: '画师', player: '棋手', cat: '大橘',
  rabbit: '玉兔', poet: '诗仙', guan: '关公', change: '嫦娥', yuenv: '越女', shangui: '山鬼', houyi: '后羿',
};
const mean = (a: (number | null | undefined)[]) => { const b = a.filter((x): x is number => x != null); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : null; };
const median = (a: (number | null | undefined)[]) => { const b = a.filter((x): x is number => x != null && !Number.isNaN(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f1 = (x: number | null) => (x == null ? '–' : String(Math.round(x * 10) / 10));
const load = (f: string): Raw[] => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const past = (r: Raw) => Math.max(0, Math.min(16, r.W - 29));

export function tables(files: string[]): string[] {
  const out: string[] = [];
  const say = (s: string) => out.push(s);
  for (const f of files) {
    const all = load(f), name = f.split('/').pop();
    const B = all.filter((r) => r.part === 'B' && r.godTo === 30 && !(r.timeout && r.W < 29));
    const A = all.filter((r) => r.part === 'A');
    const Fx = all.filter((r) => r.part === 'F');
    if (B.length) {
      const chars = [...new Set(B.map((r) => r.char as string))];
      say(`\n## from 30 · ${name} (${B.length} runs): waves survived of 16 (cleared 45 / runs) [lake / forest / palace]`);
      const means: [string, number][] = [];
      for (const c of chars) {
        const y = B.filter((r) => r.char === c), m = mean(y.map(past))!;
        means.push([c, m]);
        say(`| ${ZH[c] ?? c} | ${f1(m)} (${y.filter((r) => r.W >= 45).length}/${y.length}) [${['lake', 'forest', 'palace'].map((mp) => y.filter((r) => r.map === mp).map(past).join(',')).join(' / ')}] |`);
      }
      const rm = median(means.map((x) => x[1]))!;
      say(`A1 roster mean ${f1(mean(B.map(past)))} of 16 · A2 cleared 45 ${Math.round((100 * B.filter((r) => r.W >= 45).length) / B.length)}% · reached 40 ${Math.round((100 * B.filter((r) => r.W >= 40).length) / B.length)}%`);
      say(`A3 roster median ${f1(rm)}; below median − 3.5: ${means.filter((x) => x[1] < rm - 3.5).map((x) => `${ZH[x[0]]} ${f1(x[1])}`).join(', ') || 'none'}; below median − 3: ${means.filter((x) => x[1] < rm - 3).map((x) => `${ZH[x[0]]} ${f1(x[1])}`).join(', ') || 'none'}`);
      const ok = B.flatMap((r) => r.rows.filter((w: Raw) => !w.boss && w.w >= 31 && w.w <= 39 && !w.died));
      const ttk = ok.map((w: Raw) => w.ttkHit as number).filter((x: number | null) => x != null).sort((x: number, y: number) => x - y);
      const b30 = B.flatMap((r) => r.rows.filter((w: Raw) => w.w === 30 && !w.died).map((w: Raw) => w.t as number));
      const b30c: string[] = [];
      for (const c of chars) { const v = median(B.filter((r) => r.char === c).flatMap((r) => r.rows.filter((w: Raw) => w.w === 30 && !w.died).map((w: Raw) => w.t as number))); if (v != null && v > 85) b30c.push(`${ZH[c]} ${f1(v)}`); }
      say(`A4 crowd median ${f1(median(ok.map((w: Raw) => w.crowd)))} · TTK hit→death median ${f1(median(ttk))} s, p90 ${f1(ttk[Math.floor(ttk.length * 0.9)] ?? null)} s · wave-30 boss mean ${f1(mean(b30))} s · companions over 85 s: ${b30c.join(', ') || 'none'}`);
      say(`A14 破釜 held ${B.filter((r) => r.items?.burnboats).length}/${B.length} · 劫@30 mean ${f1(mean(B.map((r) => r.stats30?.curse)))} · 气血@30 median ${f1(median(B.map((r) => r.stats30?.hp)))} · 金丹 end mean ${f1(mean(B.map((r) => r.items?.elixir ?? 0)))}`);
      for (const mp of ['lake', 'forest', 'palace']) { const y = B.filter((r) => r.map === mp); if (y.length) say(`  ${mp}: ${f1(mean(y.map(past)))} (${y.filter((r) => r.W >= 45).length}/${y.length}), died at the wave-30 boss ${y.filter((r) => r.dead && r.deathWave === 30).length}`); }
    }
    for (const lv of ['beginner', 'average', 'skilled']) {
      const a = A.filter((r) => r.level === lv);
      if (!a.length) continue;
      const chars = [...new Set(a.map((r) => r.char as string))];
      const meds = chars.map((c) => [c, median(a.filter((r) => r.char === c).map((r) => r.W))!] as [string, number]);
      say(`\n## to 31 · ${name} · ${lv} (${a.length} runs): median ${median(a.map((r) => r.W))} · mean ${f1(mean(a.map((r) => r.W)))} · reach 10 (W ≥ 9) ${Math.round((100 * a.filter((r) => r.W >= 9).length) / a.length)}% · clear 20 ${Math.round((100 * a.filter((r) => r.W >= 20).length) / a.length)}% · clear 31 ${Math.round((100 * a.filter((r) => r.W >= 31).length) / a.length)}%`);
      say(`   per companion median W: ${meds.map((x) => `${ZH[x[0]]} ${x[1]}`).join(' · ')}`);
      if (lv !== 'beginner') {
        const early = chars.map((c) => [c, median(a.filter((r) => r.char === c).flatMap((r) => r.rows.filter((w: Raw) => w.w >= 2 && w.w <= 9 && !w.died).map((w: Raw) => w.dps as number)))!] as [string, number]);
        say(`   early DPS (waves 2–9) median: ${early.sort((x, y) => y[1] - x[1]).map((x) => `${ZH[x[0]]} ${f1(x[1])}`).join(' · ')}`);
      }
    }
    const H = all.filter((r) => r.part === 'H');
    if (H.length) {
      say(`\n## hidden verbs · ${name} (${H.length} runs): per companion × 镜境 × player`);
      const keys = [...new Set(H.map((r) => `${r.char}|${r.diff}|${r.verb}`))];
      for (const k of keys) {
        const [c, d, verb] = k.split('|');
        const y = H.filter((r) => `${r.char}|${r.diff}|${r.verb}` === k);
        const sum = (rs: Raw[], f: (w: Raw) => number) => rs.reduce((a, w) => a + f(w), 0);
        const skillAll = y.map((r) => sum(r.rows, (w: Raw) => w.bySrc?.skill ?? 0));
        const share30 = y.map((r) => { const ws = r.rows.filter((w: Raw) => w.w >= 30); const t = sum(ws, (w: Raw) => w.dmg); return t ? sum(ws, (w: Raw) => w.bySrc?.skill ?? 0) / t : 0; });
        const T = (r: Raw, key: string) => (r.tally?.[key] ?? 0);
        const T30 = (r: Raw, key: string) => (r.tally?.[key] ?? 0) - (r.tally30?.[key] ?? 0);
        const tot = (key: string, f = T) => y.reduce((a, r) => a + f(r, key), 0);
        const snaps = y.flatMap((r) => r.snapRows ?? []), taut = snaps.filter((x: Raw) => x.taut);
        say(`| ${ZH[c] ?? c} | 镜境 ${d} | ${verb} | W ${y.map((r) => r.W).join(',')} (mean past 30: ${f1(mean(y.map(past)))}) | 气血@30 ${y.map((r) => r.stats30?.hp).join(',')} | skill dmg whole run mean ${Math.round(mean(skillAll) ?? 0)} | skill share from 30 ${share30.map((x) => (x * 100).toFixed(1) + '%').join(' / ')} |`);
        say(`    whole run: catches ${tot('catches')} 精 ${tot('perfect')} guards ${tot('guards')} 夺 ${tot('seizes')} · binds ${tot('binds')} snaps ${tot('snaps')} taut ${tot('taut')} (${f1((100 * tot('taut')) / Math.max(1, tot('snaps')))}%) · looses ${tot('looses')} 正中 ${tot('sweet')} (${f1((100 * tot('sweet')) / Math.max(1, tot('looses')))}%) 九日 ${tot('suns')} · from 30: catches ${tot('catches', T30)} 精 ${tot('perfect', T30)} taut ${tot('taut', T30)}/${tot('snaps', T30)} 正中 ${tot('sweet', T30)}/${tot('looses', T30)}`);
        if (snaps.length) say(`    snaps on ordinary foes, waves 30–34: ${snaps.length} (taut ${taut.length}); taut: mean ${Math.round(mean(taut.map((x: Raw) => x.d)) ?? 0)} = ${f1(100 * (mean(taut.map((x: Raw) => x.frac)) ?? 0))}% of the foe's 气血 (median ${f1(100 * (median(taut.map((x: Raw) => x.frac)) ?? 0))}%); slack: ${f1(100 * (mean(snaps.filter((x: Raw) => !x.taut).map((x: Raw) => x.frac)) ?? 0))}%`);
      }
    }
    if (Fx.length) {
      say(`\n## fixed kit · ${name}: kills, median of seeds`);
      const keys = [...new Set(Fx.map((r) => `${r.fw}|${r.abl ?? ''}`))];
      for (const k of keys) {
        const y = Fx.filter((r) => `${r.fw}|${r.abl ?? ''}` === k);
        const chars = [...new Set(y.map((r) => r.char as string))];
        const ks = chars.map((c) => [c, median(y.filter((r) => r.char === c).map((r) => r.rows[0]?.kills ?? 0))!] as [string, number]).sort((p, q) => q[1] - p[1]);
        say(`  wave ${k.split('|')[0]} ${k.split('|')[1]}: ${ks.map((x) => `${ZH[x[0]]} ${x[1]}`).join(' · ')}${ks.length > 1 ? ` (top / next ${f1(ks[0][1] / Math.max(1, ks[1][1]))}×)` : ''}`);
      }
    }
  }
  return out;
}

describe('m8 balance sweep (MIRROR_SWEEP=1)', () => {
  it.runIf(env.MIRROR_SWEEP === '1')('sweep', () => {
    const part = env.PART ?? 'A';
    if (part === 'TAB') { for (const l of tables((env.FILES ?? '').split(',').filter(Boolean))) console.log(l); return; }
    const seeds = +(env.SEEDS ?? 4), s0 = +(env.SEED0 ?? 1), maxWave = +(env.MAXW ?? (part === 'A' ? 31 : 45)), godTo = +(env.GOD ?? (part === 'A' ? 0 : 30));
    const maps = (env.MAPS ?? env.MAP ?? 'lake').split(',') as MapId[];
    const levels = (env.LEVELS ?? (part === 'A' ? 'beginner,average,skilled' : 'skilled')).split(',') as BotLevel[];
    const all = COMPANION_REG.map((c) => c.id as CharacterId);
    const chars = env.CHARS === 'all' ? all : env.CHARS ? (env.CHARS.split(',') as CharacterId[]) : all.filter((c) => !isHidden(c));
    const diff = +(env.DIFF ?? 1) as DiffIndex;
    const tag = { probe: [env.CURSE ? `curse=${env.CURSE}` : '', env.NO_BB === '1' ? 'nobb' : '', env.LEVER ? `lever=${env.LEVER}` : '', env.TUNING ? 'tuning' : ''].filter(Boolean).join(',') };
    let errs = 0;
    const undoLever = levers(env.LEVER);
    const tun = env.TUNING ? applyTuningText(readFileSync(env.TUNING, 'utf8')) : null;
    if (tun) console.log('TUNING applied', tun.applied, 'missing', tun.missing.length, 'stale', tun.stale.length);
    try {
    if (part === 'F') {
      for (const map of maps) for (const fw of (env.FW ?? '25,35').split(',').map(Number)) for (const c of chars) for (let s = s0; s < s0 + seeds; s++) {
        const r = playInst({ seed: s * 7919 + c.length, char: c, map, diff, maxWave: fw, level: 'skilled', godTo: fw + 1, rowsFrom: fw, zones: true, fixed: { wave: fw } });
        errs += r.errors;
        if (env.OUT) appendFileSync(env.OUT, JSON.stringify({ part, abl: env.FIXW ? 'fixw=' + env.FIXW : '', fw, ...tag, ...r }) + '\n');
      }
    } else if (part === 'H') {
      // the hidden three's verbs (hidden.md §6, PLAN A-H1…A-H5): own map unless MAP, expert (the §x.8 brains at exec 0.85)
      // and novice (kiting legs + the masher), godmode to GOD, mortal to MAXW, rows from wave 1 (whole-run skill damage)
      const OWN: Record<string, MapId> = { yuenv: 'lake', shangui: 'forest', houyi: 'palace' };
      const hc = (env.CHARS ? env.CHARS.split(',') : ['yuenv', 'shangui', 'houyi']) as CharacterId[];
      for (const c of hc) for (const verb of (env.VERBS ?? 'expert,novice').split(',')) for (let s = s0; s < s0 + seeds; s++) {
        const map = (env.MAP as MapId | undefined) ?? OWN[c] ?? 'lake';
        const r = playInst({ seed: s * 7919 + c.length, char: c, map, diff, maxWave, level: 'skilled', godTo, rowsFrom: 1, zones: true, verb: verb === 'novice' || verb === 'kite' ? verb : undefined });
        errs += r.errors;
        if (env.OUT) appendFileSync(env.OUT, JSON.stringify({ part, diff, ...tag, ...r }) + '\n');
        console.log(part, map, verb, c, s, 'W', r.W, r.dead ? 'dead' : '', r.msPerStep);
      }
    } else {
      for (const map of maps) for (const level of levels) for (const c of chars) for (let s = s0; s < s0 + seeds; s++) {
        const r = playInst({ seed: s * 7919 + c.length, char: c, map, diff, maxWave, level, godTo, rowsFrom: part === 'A' ? 1 : Math.max(1, godTo - 1), zones: env.ZONES === '1' });
        errs += r.errors;
        if (env.OUT) appendFileSync(env.OUT, JSON.stringify({ part, diff, ...tag, ...r }) + '\n');
        console.log(part, map, level, c, s, 'W', r.W, r.dead ? 'dead' : '', r.msPerStep);
      }
    }
    } finally { undoLever(); if (tun && tuningActive()) endTuning(); }
    expect(errs).toBe(0);
  }, 7_200_000);
});
