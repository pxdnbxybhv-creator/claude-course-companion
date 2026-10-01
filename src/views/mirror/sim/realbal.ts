// 水月幻镜 · 镜衡 on the real engine: the balance harness. Whole runs through the real engine and the
// real content, headless (a debug painter, no canvas), played by a kiting bot, with sim/bot.ts's card,
// crate, 镜心 and shop policy between waves. About 0.05–0.1 ms a step in node: a run to wave 31 takes
// a few seconds. The in-app sim (bot.ts, balance.ts) is only a smoke test of the logic; tune against
// this. tests/mirror-realbal.test.ts runs one short smoke; `MIRROR_REALBAL=1 npx vitest run
// tests/mirror-realbal.test.ts` runs the sweep (13 companions × SEEDS, 月湖 照影 unless MAP / DIFF).
//
// The bot (a skilled player, roughly): steps away from nearby bodies, sidesteps shots and telegraphed
// lines / circles, finds the gap of a gapped ring, holds an orbit ~230 u from a boss (inside most
// weapons' reach), fetches 月华 when nothing is close, and casts its 镜技 on cooldown when enemies are
// within 200. The beginner reacts every third step, ignores shots and telegraphs, keeps enemies at
// 170, and buys at random (bot.ts's `beginner`). The average player (m6) reacts at 10 Hz (holds its
// last move every other call), keeps enemies at 230, sidesteps shots but ignores telegraphs, and buys
// like the skilled bot. Bot play is not human play: read depths as relative.
import type { ArchetypeId, MapId } from '../ids';
import type { BossEvent, CharacterId, ContentRegistry, DeathResult, DiffIndex, EngineHooks, EngineSettings, MirrorAudio, RunSave, WaveResult } from '../types';
import { COMPANIONS } from '../data';
import { allUnlocked, bankSleeve, beginWave, computeStats, endWave, pickStart, rngFor, screenOf, waveSetup } from '../logic';
import { newRun } from '../logic/run';
import { defaultMeta } from '../../../app/mirror';
import { createEngine } from '../engine';
import { createDebugPainter } from '../engine/debugPainter';
import { CONTENT } from '../engine/content';
import { doCards, doCrates, doHearts, doShop, prefers, value } from './bot';
import { hiddenTally, vinesNow, type HiddenTally } from '../engine/content/hidden';

export interface RealOpts {
  seed: number;
  char: CharacterId;
  map?: MapId;
  diff?: DiffIndex;
  maxWave?: number;
  /** The bot: 'skilled' (default), 'average' or 'beginner' (`beginner: true` is the old spelling). */
  level?: BotLevel;
  beginner?: boolean;
  /** Godmode for waves below this (to study later waves on their own). */
  godTo?: number;
  /** The bot also steps out of enemy ground zones (clouds, webs, puddles), the way a person would. */
  zones?: boolean;
  content?: ContentRegistry;
}
export interface RealRun {
  char: CharacterId;
  seed: number;
  /** Waves cleared. */
  W: number;
  dead: boolean;
  /** The fatal wave was a boss wave. */
  deadAtBoss: boolean;
  timeout: boolean;
  errors: number;
  msPerStep: number;
  /** One entry a wave: `w12:60s,hp80/91` (or `w13:DIED@41s hits 6`). */
  trace: string[];
  /** Damage taken in the last wave played, by source (`p2 carp` in boss waves: the boss phase). */
  hurtBy: Record<string, number>;
  /** 镜宝 held at the end (`wangchen2`), and the weapons (`qingfeng3`). */
  relics: string[];
  weapons: string[];
  /** m8: a hidden companion's verb counters over the run (engine/content/hidden.ts hiddenTally); absent for the 13. */
  hidden?: HiddenTally;
}
export type BotLevel = 'beginner' | 'average' | 'skilled';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const DAY = '2026-09-27';

// The world's internals are read directly (struct-of-arrays pools): this is a dev harness, not content.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
export interface BotState {
  wander: number; last: [number, number]; n: number; zones?: boolean;
  /** m8 hidden (hidden.md §2.8): the verbs' own stream (seeded from the run when absent), and their state. */
  rng?: () => number;
  verb?: { holdTo: number; dir: { x: number; y: number }; snapAt: number; tautTo: number; bound: boolean };
}
/** hidden.md §2.8: how often each player level gets a timed verb right. */
export const VERB_EXEC: Readonly<Record<BotLevel, number>> = { beginner: 0.25, average: 0.6, skilled: 0.85 };

/** One bot decision (called every third step). Exported for the probes. */
export function botStep(W: Raw, eng: Raw, level: BotLevel, st: BotState): void {
  const skilled = level !== 'beginner', avg = level === 'average';
  const px = W.px, py = W.py, E = W.E;
  let fx = 0, fy = 0, near = 1e9, hold = false;
  for (let i = 0; i < E.n; i++) {
    if (!E.alive[i] || E.kind[i] === 4) continue; // 4: an ink ally
    const dx = px - E.x[i], dy = py - E.y[i];
    const dd = Math.hypot(dx, dy) - E.r[i];
    if (dd < near) near = dd;
    if (dd < (!skilled ? 170 : avg ? 230 : 300)) {
      const k = (E.kind[i] === 2 ? 3 : 1) / Math.max(20, dd) ** 2;
      fx += (dx * k * 1e3) / Math.max(1, dd); fy += (dy * k * 1e3) / Math.max(1, dd);
    }
  }
  if (skilled) {
    const S = W.ES;
    for (let i = 0; i < S.n; i++) {
      if (!S.alive[i]) continue;
      const dx = px - S.x[i], dy = py - S.y[i], dd = Math.hypot(dx, dy);
      if (dd >= 170) continue;
      const vl = Math.hypot(S.vx[i], S.vy[i]) || 1, ux = S.vx[i] / vl, uy = S.vy[i] / vl;
      const along = dx * ux + dy * uy;
      if (along < -20) continue;
      let qx = dx - along * ux, qy = dy - along * uy, ql = Math.hypot(qx, qy);
      if (ql < 1) { qx = -uy; qy = ux; ql = 1; }
      const k = 2.2e3 / Math.max(15, dd) ** 2;
      fx += (qx / ql) * k + (dx / dd) * k * 0.3; fy += (qy / ql) * k + (dy / dd) * k * 0.3;
    }
    const T = W.T;
    for (let i = 0; !avg && i < T.n; i++) {
      if (!T.alive[i]) continue;
      const s = T.shape[i];
      if (s.kind === 'ring' && s.gaps && s.gaps.length) {
        const dx = px - s.x, dy = py - s.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < s.r - 5 || dd > s.r2 + 260) continue;
        const a = Math.atan2(dy, dx);
        let bd = 9;
        for (const g of s.gaps) { let d = a - g.at; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) < Math.abs(bd)) bd = d; }
        if (Math.abs(bd) < 0.12) { hold = true; continue; }
        const sg = bd > 0 ? -1 : 1;
        fx += (-dy / dd) * sg * 8; fy += (dx / dd) * sg * 8;
      } else if (s.kind === 'cone' && s.deg < 300) {
        // a cone: walk round its origin toward the nearer edge (running straight away rarely leaves it)
        const dx = px - s.x, dy = py - s.y, dd = Math.hypot(dx, dy) || 1;
        let d = Math.atan2(dy, dx) - s.dir; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        if (dd < s.r + 30 && Math.abs(d) < (s.deg / 2) * (Math.PI / 180) + 0.15) { const sg = d >= 0 ? 1 : -1; fx += (-dy / dd) * sg * 8; fy += (dx / dd) * sg * 8; }
      } else if (s.kind === 'circle' || s.kind === 'ring' || s.kind === 'cone') {
        const dx = px - s.x, dy = py - s.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < s.r + 30) { fx += (dx / dd) * 6; fy += (dy / dd) * 6; }
      } else if (s.kind === 'line') {
        const ux = Math.cos(s.dir), uy = Math.sin(s.dir), rx = px - s.x, ry = py - s.y;
        const along = rx * ux + ry * uy, perp = -rx * uy + ry * ux;
        if (along > -30 && along < s.len + 30 && Math.abs(perp) < s.w / 2 + 30) { const sg = perp >= 0 ? 1 : -1; fx += -uy * sg * 6; fy += ux * sg * 6; }
      }
    }
    // a boss wave: hold an orbit ~230 u from the nearest boss, strafing
    let bx = 0, by = 0, bd = 1e9;
    for (let i = 0; i < E.n; i++) { if (!E.alive[i] || E.kind[i] !== 2) continue; const d = Math.hypot(E.x[i] - px, E.y[i] - py); if (d < bd) { bd = d; bx = E.x[i]; by = E.y[i]; } }
    if (bd < 1e9) {
      const dx = bx - px, dy = by - py, d = bd || 1, pull = Math.max(-2, Math.min(2, (d - 230) / 120));
      fx += (dx / d) * pull * 1.5 + (-dy / d) * 0.6; fy += (dy / d) * pull * 1.5 + (dx / d) * 0.6;
    }
  }
  // (zones) step out of enemy ground zones, the way a person would
  if (st.zones) {
    const Z = W.Z;
    for (let i = 0; i < Z.n; i++) {
      if (!Z.alive[i] || Z.side[i] !== 0 || !(Z.dps[i] > 0 || Z.slow[i] > 0)) continue;
      const dx = px - Z.x[i], dy = py - Z.y[i], dd = Math.hypot(dx, dy) || 1;
      if (dd < Z.r[i] + 45) { fx += (dx / dd) * 7; fy += (dy / dd) * 7; }
    }
  }
  const A = W.arena, m = 160;
  if (px < A.minX + m) fx += ((A.minX + m - px) / m) * 2.5;
  if (px > A.maxX - m) fx -= ((px - (A.maxX - m)) / m) * 2.5;
  if (py < A.minY + m) fy += ((A.minY + m - py) / m) * 2.5;
  if (py > A.maxY - m) fy -= ((py - (A.maxY - m)) / m) * 2.5;
  for (const o of A.obstacles) { const dx = px - o.x, dy = py - o.y, dd = Math.hypot(dx, dy) || 1; if (dd < o.r + 50) { fx += (dx / dd) * 2; fy += (dy / dd) * 2; } }
  // fetch 月华 when nothing is close
  const D = W.D;
  let mx0 = 0, my0 = 0, md = 1e9;
  if (near > 140) for (let i = 0; i < D.n; i++) { if (!D.alive[i]) continue; const dx = D.x[i] - px, dy = D.y[i] - py, dd = Math.hypot(dx, dy); if (dd < md && dd < 380) { md = dd; mx0 = dx; my0 = dy; } }
  if (md < 1e9 && Math.hypot(fx, fy) < 0.6) { fx += (mx0 / md) * 0.8; fy += (my0 / md) * 0.8; }
  if (Math.hypot(fx, fy) < 0.15) { st.wander += 0.05; fx += -px / 900 + Math.cos(st.wander) * 0.2; fy += -py / 900 + Math.sin(st.wander) * 0.2; }
  if (hold) { fx *= 0.15; fy *= 0.15; }
  const L = Math.hypot(fx, fy);
  let mx = L > 0.02 ? fx / L : 0, my = L > 0.02 ? fy / L : 0;
  if (!skilled && st.n++ % 3) { mx = st.last[0]; my = st.last[1]; }
  else if (avg && st.n++ % 2) { mx = st.last[0]; my = st.last[1]; }
  // m8 hidden (hidden.md §3.8, §5.8): 越女 holds ground near an attacker while her guard is ready; 后羿 stands
  // still between sidesteps (so 满弓 is read). The beginner keeps kiting.
  const input = W.skillDef?.input ?? 'tap';
  if (skilled && input !== 'tap') {
    const ready = W.skillCd <= 0 && !W.skillRun;
    if (input === 'guard' && ready && W.hp > W.hpMax * 0.35) {
      let ni = -1, nd = 1e9;
      for (let i = 0; i < E.n; i++) { if (!E.alive[i] || E.kind[i] === 4) continue; const d = Math.hypot(E.x[i] - px, E.y[i] - py) - E.r[i]; if (d < nd) { nd = d; ni = i; } }
      if (ni >= 0 && nd < 260) {
        if (nd > 60) { const dx = E.x[ni] - px, dy = E.y[ni] - py, d = Math.hypot(dx, dy) || 1; mx = dx / d; my = dy / d; } else { mx = 0; my = 0; }
      }
    } else if (input === 'hold' && near > 150 && !hold) {
      let threat = false;
      const S = W.ES;
      for (let i = 0; i < S.n && !threat; i++) if (S.alive[i] && Math.hypot(S.x[i] - px, S.y[i] - py) < 170) threat = true;
      const T = W.T;
      for (let i = 0; i < T.n && !threat; i++) if (T.alive[i] && T.dur[i] - T.t[i] < 0.8 && Math.hypot(T.shape[i].x - px, T.shape[i].y - py) < 260) threat = true;
      if (!threat) { mx = 0; my = 0; }
    }
  }
  st.last = [mx, my];
  eng.input.move(mx, my);
  if (input !== 'tap') { verbStep(W, level, st, near); return; }
  if (W.skillCd <= 0 && !W.skillRun && near < 200) eng.skill({ kind: 'auto' });
}

const ZERO = { x: 0, y: 0 };
/** The press / release on the world's own clock (no event lag): a non-finite time reads as lag 0 in worldAt, so a run is deterministic. */
const nowS = () => NaN;
/**
 * hidden.md §2.8, §3.8, §4.8, §5.8: the hidden three's 镜技 for the bot. exec (VERB_EXEC) is how often a timed
 * verb is right. The beginner mashes: guards on cooldown, binds and snaps 0.3 s later, holds a random 0.2–1.8 s.
 */
export function verbStep(W: Raw, level: BotLevel, st: BotState, near: number): void {
  const rng = (st.rng ??= rngFor(W.run.seed, W.wave, 'verbs'));
  const v = (st.verb ??= { holdTo: -1, dir: ZERO, snapAt: -1, tautTo: 150, bound: false });
  const exec = VERB_EXEC[level], beginner = level === 'beginner';
  const input = W.skillDef?.input;
  const p = W.skillDef?.p ?? {};
  const ready = W.skillCd <= 0 && !W.skillRun;
  const px = W.px, py = W.py, E = W.E;
  const tap = (dir: { x: number; y: number } = ZERO) => { W.press(nowS()); W.release(dir, nowS()); };
  if (input === 'guard') {
    if (!ready) return;
    // 夺 with full 剑意 and a foe within the cut
    if (W.hidBlades >= p.blades) { if (near < p.cutLen) tap(); return; }
    if (beginner) { if (near < 200) tap(); return; }
    // the earliest blow due: bodies (edge to edge), shots along their path, telegraphs over her
    let tau = 9;
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.kind[i] === 4) continue;
      // a body: the time to touch at its own pace (a still one only when touching)
      const gap = Math.hypot(E.x[i] - px, E.y[i] - py) - E.r[i] - W.pr;
      const t = gap <= 8 ? 0 : (gap - 8) / Math.max(1, E.speed[i]);
      if (t < tau) tau = t;
    }
    const S = W.ES;
    for (let i = 0; i < S.n; i++) {
      if (!S.alive[i]) continue;
      const dx = px - S.x[i], dy = py - S.y[i], sp = Math.hypot(S.vx[i], S.vy[i]) || 1;
      const along = (dx * S.vx[i] + dy * S.vy[i]) / sp, perp = Math.abs((dx * S.vy[i] - dy * S.vx[i]) / sp);
      if (along < 0 || perp > S.r[i] + W.pr) continue;
      const t = along / sp;
      if (t < tau) tau = t;
    }
    const T = W.T;
    for (let i = 0; i < T.n; i++) {
      if (!T.alive[i]) continue;
      const sh = T.shape[i], left = T.dur[i] - T.t[i];
      if (Math.hypot(sh.x - px, sh.y - py) < (sh.r ?? sh.len ?? 120) + W.pr && left < tau) tau = left;
    }
    if (tau <= 0.1) { if (rng() < exec) tap(); }
    else if (tau <= 0.4 && rng() < (1 - exec) / 4) tap();
    return;
  }
  if (input === 'recast') {
    const vn = vinesNow(W);
    if (vn) {
      if (!v.bound) { v.bound = true; v.snapAt = W.t + 0.3; v.tautTo = rng() < exec ? p.taut : 60 + rng() * 90; }
      const snap = beginner ? W.t >= v.snapAt : vn.mean >= v.tautTo || vn.left <= 0.4 || W.hp < W.hpMax * 0.3;
      if (snap) { tap(); v.bound = false; }
      return;
    }
    v.bound = false;
    if (!ready) return;
    if (beginner) { if (near < 200) tap(); return; }
    let n = 0;
    for (let i = 0; i < E.n; i++) if (E.alive[i] && E.kind[i] !== 4 && Math.hypot(E.x[i] - px, E.y[i] - py) <= p.r) n++;
    if (n < 3) return;
    if (level === 'skilled') {
      const c = W.densest(px, py, W.skillDef.reach ?? 300, 120);
      const d = c ? Math.hypot(c.x - px, c.y - py) : 0;
      if (c && d >= 180 && d <= 300) { tap({ x: (c.x - px) / d, y: (c.y - py) / d }); return; }
    }
    tap();
    return;
  }
  if (input === 'hold') {
    if (W.verbDown && W.skillRun) {
      if (W.t >= v.holdTo) W.release(v.dir, nowS());
      return;
    }
    if (!ready || near > 520) return;
    const mid = (p.sweet0 + p.sweet1) / 2;
    const held = beginner ? 0.2 + rng() * 1.6 : rng() < exec ? mid : mid + (rng() < 0.5 ? -1 : 1) * 0.25;
    v.dir = level === 'skilled' ? bestLine(W, p.len, p.w) : ZERO;
    W.press(nowS());
    v.holdTo = W.t + held;
  }
}

/** 后羿's skilled aim: of 8 bearings and the one to the strongest, the line with the most foes on it. */
function bestLine(W: Raw, len: number, wd: number): { x: number; y: number } {
  const px = W.px, py = W.py, E = W.E;
  const s = W.strongest(px, py, len, 'any');
  const angs: number[] = [];
  for (let k = 0; k < 8; k++) angs.push((k / 8) * Math.PI * 2);
  if (s >= 0) { const e = W.enemy(s); angs.unshift(Math.atan2(e.y - py, e.x - px)); }
  let best = 0, bn = 0;
  for (const a of angs) {
    const ux = Math.cos(a), uy = Math.sin(a);
    let n = 0;
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.kind[i] === 4) continue;
      const rx = E.x[i] - px, ry = E.y[i] - py, along = rx * ux + ry * uy;
      if (along < 0 || along > len) continue;
      if (Math.abs(-rx * uy + ry * ux) <= wd / 2 + E.r[i]) n++;
    }
    if (n > bn) { bn = n; best = a; }
  }
  return bn > 0 ? { x: Math.cos(best), y: Math.sin(best) } : ZERO;
}

/** One whole run on the real engine. */
export function playReal(o: RealOpts): RealRun {
  const map = o.map ?? 'lake', maxWave = o.maxWave ?? 31;
  const level: BotLevel = o.level ?? (o.beginner ? 'beginner' : 'skilled'), beginner = level === 'beginner';
  const u = allUnlocked();
  const arch: ArchetypeId = COMPANIONS[o.char].leans[0];
  const rng = rngFor(o.seed, 0, 'bot');
  let meta = defaultMeta(DAY);
  let run: RunSave = newRun({
    seed: o.seed, char: o.char, map, diff: o.diff ?? 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: u, mastery: 0,
  });
  if (run.pending.start) {
    const opts = run.pending.start, pref = prefers(arch);
    let best = opts.find((id) => pref.weapons.has(id)) ?? opts[0];
    if (!pref.weapons.has(best)) { let bv = -Infinity; for (const id of opts) { const v = value(pickStart(run, id)); if (v > bv) { bv = v; best = id; } } }
    run = pickStart(run, best);
  }
  const ends: WaveResult[] = [], deaths: DeathResult[] = [];
  let errors = 0;
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: (_ev: BossEvent) => {},
    waveEnd: (r) => ends.push(r), death: (d) => deaths.push(d), error: () => { errors++; },
  };
  // quality 'high' as the probes: the quality tier also sets the live-enemy cap (F.alive)
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: true, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
  const canvas = { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) } as unknown as HTMLCanvasElement;
  const eng: Raw = createEngine(canvas, run, { painter: createDebugPainter(map, 'high', 1), audio: SILENT, content: o.content ?? CONTENT, hooks, settings });
  const W: Raw = eng.world;
  const hurtBy: Record<string, number> = {};
  const orig = W.hurtFrom.bind(W);
  // m8 (cr/S-hidden #2): pass the shot slot through, or 越女's shot catch never sees it
  W.hurtFrom = (n: number, att: number, und: boolean, noArmor: boolean, src: string, dot: boolean, melee: boolean, shot = -1): number => {
    const d = orig(n, att, und, noArmor, src, dot, melee, shot);
    if (d > 0) {
      let phase = '';
      for (const h of W.bossH ?? []) if (W.alive(h)) { const e = W.enemy(h); const f = e.hp / e.hpMax; phase = f > 0.6 ? 'p1 ' : f > 0.25 ? 'p2 ' : 'p3 '; }
      const k = phase + src + (dot ? ' dot' : '');
      hurtBy[k] = (hurtBy[k] ?? 0) + d;
    }
    return d;
  };
  const st: BotState = { wander: 0, last: [0, 0], n: 0, zones: !!o.zones };
  const trace: string[] = [];
  let dead = false, deadAtBoss = false, timeout = false, ms = 0, steps = 0;
  for (let w = 1; w <= maxWave; w++) {
    const r = beginWave(run);
    const setup = waveSetup(r, meta, new Date(2026, 8, 27, 20));
    const e0 = ends.length, d0 = deaths.length, hits0 = W.rs?.hitsTaken ?? 0;
    for (const k in hurtBy) delete hurtBy[k];
    eng.start(r, setup);
    const t0 = performance.now();
    let k = 0;
    while (ends.length === e0 && deaths.length === d0 && k < 60 * 400) {
      if (eng.paused) eng.resume();
      if (k % 3 === 0 && W.phase === 'wave') { W.godmode = w < (o.godTo ?? 0); botStep(W, eng, level, st); }
      eng.stepN(1);
      k++;
    }
    ms += performance.now() - t0; steps += k;
    if (deaths.length > d0) {
      dead = true; deadAtBoss = !!setup.plan.boss;
      trace.push(`w${w}:DIED@${Math.round(W.tWave)}s hp${Math.round(computeStats(r).hp)} hits ${(W.rs?.hitsTaken ?? 0) - hits0}${deadAtBoss ? ' BOSS' : ''}`);
      run = { ...r, inWave: null };
      break;
    }
    if (ends.length === e0) { timeout = true; trace.push(`w${w}:TIMEOUT`); run = { ...r, inWave: null }; break; }
    const res = ends[ends.length - 1];
    run = endWave(r, res);
    const b = bankSleeve(meta, run, res.sleeve, DAY);
    meta = { ...b.meta, owed: 0 };
    run = b.run;
    trace.push(`w${w}:${Math.round(W.tWave)}s,hp${Math.round(W.hp)}/${Math.round(W.hpMax)}`);
    for (let g = 0; g < 50 && screenOf(run) !== 'shop'; g++) {
      const sc = screenOf(run);
      if (sc === 'cards') run = doCards(run, rng, beginner, arch);
      else if (sc === 'crate') run = doCrates(run, u, beginner);
      else if (sc === 'heart') run = doHearts(run, u, beginner);
      else break;
    }
    run = doShop(run, u, rng, beginner, arch);
  }
  const hid = W.skillDef?.input && W.skillDef.input !== 'tap' ? { ...hiddenTally(W) } : null;
  eng.dispose();
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(hurtBy)) out[key] = Math.round(v);
  const relics = Object.entries(run.items).filter(([k]) => k === 'wangchen' || k === 'longyuan').map(([k, v]) => `${k}${v}`);
  return {
    char: o.char, seed: o.seed, W: run.wave, dead, deadAtBoss, timeout, errors, msPerStep: steps ? ms / steps : 0, trace, hurtBy: out,
    relics, weapons: run.weapons.map((x) => `${x.id}${x.t}`), ...(hid ? { hidden: hid } : {}),
  };
}

export interface RealSummary {
  runs: number; medianWave: number; meanWave: number; reached10: number; reached20: number; cleared30: number; cleared40: number;
  bossDeaths: number; wave10Hazard: number; errors: number; timeouts: number;
}
export function summarizeReal(runs: readonly RealRun[]): RealSummary {
  const ws = runs.map((r) => r.W).sort((a, b) => a - b), n = Math.max(1, runs.length);
  const at10 = runs.filter((r) => r.W >= 9).length;
  return {
    runs: runs.length,
    medianWave: ws[Math.floor(ws.length / 2)] ?? 0,
    meanWave: ws.reduce((a, b) => a + b, 0) / n,
    reached10: runs.filter((r) => r.W >= 10).length / n,
    reached20: runs.filter((r) => r.W >= 20).length / n,
    cleared30: runs.filter((r) => r.W >= 30).length / n,
    cleared40: runs.filter((r) => r.W >= 40).length / n,
    bossDeaths: runs.filter((r) => r.deadAtBoss).length,
    wave10Hazard: at10 ? runs.filter((r) => r.W === 9 && r.dead).length / at10 : 0,
    errors: runs.reduce((a, r) => a + r.errors, 0),
    timeouts: runs.filter((r) => r.timeout).length,
  };
}
