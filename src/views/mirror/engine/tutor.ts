// 水月幻镜 · the tutorial's engine controller (mirror3 CONTRACTS §5.1). Like engine/dev.ts it reaches
// the World through the MirrorEngine and changes no engine-core code besides World.attach(): the
// three wave scripts of 「初入镜中」 (d-tutorial §1.6) run as attached Behaviours that spawn, draw
// telegraphs, set the clock and report cues; `attachTipWatch` is the real runs' read-only watcher for
// the first-time tips. Every export is a no-op on the stub engine (it has no world).
import type { Behaviour, Engine, GameEvent } from '../types';
import type { EliteId, MonsterId } from '../ids';
import type { MirrorEngine } from './index';
import type { World } from './world';
import { EKind } from './pools';
import { TUT } from '../data/tutorial';
import { vfxW, VT } from './vfx';

export type TutorScriptId = 'tut1' | 'tut2' | 'tut3';
/** A cue to the UI; returning true holds the engine (the boss-intro path) until the UI resumes it. */
export type TutorCue = (key: string, v?: number) => boolean | void;

function worldOf(engine: Engine | null | undefined): World | null {
  const w = (engine as Partial<MirrorEngine> | null | undefined)?.world as World | undefined;
  return w && typeof w.attach === 'function' ? w : null;
}

/** Wave time left from now: null holds the wave (untimed; the HUD timer hides), 0 ends it now. */
export function clock(engine: Engine, sec: number | null): void {
  const W = worldOf(engine);
  if (W) setClock(W, sec);
}
function setClock(W: World, sec: number | null): void {
  W.len = sec === null ? null : W.tWave + Math.max(0, sec);
}
/** Ask the engine to pause after this step (the boss intro's own path). */
export function hold(engine: Engine): void {
  const W = worldOf(engine);
  if (W) W.pauseRequest = true;
}

// ───────────────────────────────────────────── the first-time-tip watcher (real runs: read-only)

/**
 * Real runs: sends 'elite' once, the first time an elite is alive in this wave. It only reads the
 * enemy pool on its own clock: it never draws a random number, spawns, hits, sets a timer or takes a
 * pool slot, so a real wave plays exactly as it would without it.
 */
export function attachTipWatch(engine: Engine, cue: (key: 'elite') => void): void {
  const W = worldOf(engine);
  if (!W) return;
  W.attach(tipWatch(cue));
}
interface WatchState { acc: number; done: boolean }
function tipWatch(cue: (key: 'elite') => void): Behaviour<WatchState> {
  return {
    start: () => ({ acc: 0, done: false }),
    tick(w, s, dt) {
      if (s.done) return;
      s.acc += dt;
      if (s.acc < 0.25) return;
      s.acc = 0;
      const E = (w as unknown as World).E;
      for (let i = 0; i < E.n; i++) {
        if (E.alive[i] && E.kind[i] === EKind.Elite) { s.done = true; try { cue('elite'); } catch { /* the UI's */ } return; }
      }
    },
  };
}

// ───────────────────────────────────────────── the wave scripts

/** Wait: seconds, or until a condition holds. */
type Wait = number | (() => boolean);
interface Ctx {
  W: World;
  send: (key: string, v?: number) => void;
  /** Seconds moving, distance covered, pickups and casts so far this wave. */
  moveSec: number; moveDist: number; pickups: number; casts: number; kills: number;
  /** Bodies the script rings in gold (the first blots, the lanterns). */
  rings: number[];
  ringT: number;
  /** Side tasks: [every s, left s, fn]. */
  tasks: { every: number; left: number; fn: () => void }[];
  /** The big one (wave 3): its handle, and whether its first strike was reported. */
  foe: number;
  teleSeen: boolean;
  teleWatch: boolean;
  teleCount: number;
}
interface CoState { ctx: Ctx; it: Generator<Wait, void, void>; wait: Wait | null; left: number; done: boolean }

function aliveFoes(W: World): number {
  const E = W.E;
  let n = 0;
  for (let i = 0; i < E.n; i++) if (E.alive[i] && (E.kind[i] === EKind.Mon || E.kind[i] === EKind.Elite)) n++;
  return n;
}
function lineTeles(W: World): number {
  const T = W.T;
  let n = 0;
  for (let i = 0; i < T.n; i++) if (T.alive[i] && T.shape[i].kind === 'line') n++;
  return n;
}
/** Spawn n bodies on an arc around you (from `dir`, `spread` radians wide; a full ring when ≥ 2π). */
function spawnArc(c: Ctx, id: MonsterId | EliteId, n: number, dist: number, dir: number, spread: number, hpX?: number): number[] {
  const W = c.W, out: number[] = [];
  const full = spread >= Math.PI * 2 - 1e-6;
  for (let k = 0; k < n; k++) {
    const a = full ? dir + (k / n) * Math.PI * 2 : dir + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0);
    const p = W.clampToArena({ x: W.px + Math.cos(a) * dist, y: W.py + Math.sin(a) * dist }, 30);
    const h = W.spawn(id, p.x, p.y, { bloom: true, ...(hpX ? { hpX } : {}) });
    if (h >= 0) out.push(h);
  }
  return out;
}
const since = (W: World, t0: number) => W.tWave - t0;

function* tut1(c: Ctx): Generator<Wait, void, void> {
  const W = c.W, P = TUT.w1;
  yield P.moveAt;
  c.send('move');
  let t0 = W.tWave;
  yield () => c.moveSec >= P.moveSec || c.moveDist >= P.moveDist || since(W, t0) > P.moveMax;
  c.send('moved');
  const first = spawnArc(c, 'blot', P.firstN, P.firstDist, W.face, (P.firstSpread * Math.PI) / 180);
  c.rings = first;
  t0 = W.tWave;
  // three down (one may slip into the reeds, where it can't be hit: any three kills will do)
  // (or all but one, a few seconds ago: the last one is hiding and the lesson has landed)
  const k0 = c.kills;
  let most = -1;
  yield () => {
    if (most < 0 && c.kills - k0 >= P.firstN - 1) most = W.tWave;
    return first.every((h) => !W.alive(h)) || c.kills - k0 >= P.firstN || (most >= 0 && since(W, most) > 6) || since(W, t0) > P.firstMax;
  };
  c.rings = [];
  c.send('kills3');
  // three pickups in all (some may have come already), with a moment to read the line
  t0 = W.tWave;
  yield () => (c.pickups >= P.pickups && since(W, t0) > 3) || since(W, t0) > P.pickupMax;
  c.send('pickups3');
  const packs0 = W.tWave;
  for (const [delay, id, n, dist] of P.packs) {
    yield delay;
    spawnArc(c, id as MonsterId, n, dist, W.face + Math.PI * 0.5, Math.PI * 0.9);
  }
  yield () => aliveFoes(W) === 0 || since(W, packs0) > P.packsMax;
  setClock(W, P.endClock);
  c.send('clock');
}

function* tut2(c: Ctx): Generator<Wait, void, void> {
  const W = c.W, P = TUT.w2;
  yield P.pauseAt;
  c.send('pause');
  yield P.teleAt - P.pauseAt;
  let tries = 0, dodges = 0;
  while (dodges < P.dodges && tries < P.teleTries) {
    const x = W.px, y = W.py, r = P.teleR;
    let filled = false;
    W.tele({
      shape: { kind: 'circle', x, y, r },
      dur: P.teleDur,
      then: () => {
        filled = true;
        if (Math.hypot(W.px - x, W.py - y) <= r) {
          W.hurt(P.teleHurt, { undodgeable: true, noArmor: true, src: 'tutorial' });
          c.send('teleHit');
        } else { dodges++; c.send('teleDodged', dodges); }
      },
    });
    if (tries === 0) c.send('tele1');
    tries++;
    yield () => filled;
    yield P.teleEvery - P.teleDur;
  }
  c.send('dodged2');
  const lanterns = [...spawnArc(c, 'lantern', 1, P.lanternDist, W.face, 0), ...spawnArc(c, 'lantern', 1, P.lanternDist, W.face + Math.PI, 0)];
  spawnArc(c, 'blot', P.blotsWithLanterns, 300, W.face + Math.PI / 2, Math.PI);
  c.rings = lanterns;
  let t0 = W.tWave;
  yield () => lanterns.every((h) => !W.alive(h)) || since(W, t0) > P.lanternMax;
  c.rings = [];
  c.send('lanterns');
  yield 1;
  spawnArc(c, 'blot', P.crowdN, P.crowdDist, 0, Math.PI * 2);
  const k0 = c.casts;
  c.send('crowd');
  t0 = W.tWave;
  yield () => c.casts > k0 || since(W, t0) > P.castMax;
  c.send('cast');
  yield P.endAfter;
  setClock(W, P.endClock);
  c.tasks.push({ every: P.trickleEvery, left: P.trickleEvery, fn: () => { spawnArc(c, 'blot', P.trickleN, 300, W.face, Math.PI); } });
  yield P.papermanAt;
  spawnArc(c, 'paperman', 1, 320, W.face, 0);
}

function* tut3(c: Ctx): Generator<Wait, void, void> {
  const W = c.W, P = TUT.w3;
  spawnArc(c, 'blot', P.blotsN, 300, W.face, Math.PI);
  yield P.blotsAt[1];
  spawnArc(c, 'blot', P.blotsN, 300, W.face + Math.PI, Math.PI);
  yield P.foeAt - P.blotsAt[1];
  setClock(W, null);
  const foe = spawnArc(c, P.foe, 1, P.foeDist, W.face, 0, 1)[0] ?? -1;
  c.foe = foe;
  c.send('foe');
  if (foe >= 0) {
    c.teleCount = lineTeles(W);
    c.teleWatch = true;
    c.tasks.push({ every: P.hpEvery, left: 0, fn: () => { if (W.alive(foe)) { const e = W.enemy(foe); c.send('foeHp', e.hp / Math.max(1, e.hpMax)); } } });
    c.tasks.push({ every: P.crowdEvery, left: P.crowdEvery, fn: () => { if (W.alive(foe)) spawnArc(c, 'blot', P.crowdN, 300, W.face + Math.PI, Math.PI); } });
    yield () => !W.alive(foe);
  }
  c.teleWatch = false;
  c.send('foeDown');
  setClock(W, P.endAfter);
}

const SCRIPTS: Record<TutorScriptId, (c: Ctx) => Generator<Wait, void, void>> = { tut1, tut2, tut3 };

function advance(s: CoState): void {
  for (let guard = 0; guard < 16; guard++) {
    const r = s.it.next();
    if (r.done) { s.done = true; s.wait = null; return; }
    const w = r.value;
    if (typeof w === 'number') { if (w <= 0) continue; s.wait = w; s.left = w; return; }
    if (w()) continue;
    s.wait = w;
    return;
  }
}

function script(id: TutorScriptId, cue: TutorCue): Behaviour<CoState> {
  return {
    start(w) {
      const W = w as unknown as World;
      const ctx: Ctx = {
        W, moveSec: 0, moveDist: 0, pickups: 0, casts: 0, kills: 0, rings: [], ringT: 0, tasks: [], foe: -1, teleSeen: false, teleWatch: false, teleCount: 0,
        send: (key, v) => {
          let held = false;
          try { held = cue(key, v) === true; } catch { held = false; }
          if (held) W.pauseRequest = true;
        },
      };
      const st: CoState = { ctx, it: SCRIPTS[id](ctx), wait: null, left: 0, done: false };
      advance(st);
      return st;
    },
    tick(w, s, dt) {
      const c = s.ctx, W = c.W;
      if (W.player.moving) { c.moveSec += dt; c.moveDist += Math.hypot(W.player.vx, W.player.vy) * dt; }
      // the gold rings on what the script points at
      if (c.rings.length) {
        c.ringT -= dt;
        if (c.ringT <= 0) {
          const calm = !!W.settings.reduceMotion;
          c.ringT = calm ? 2.4 : TUT.ringEvery;
          for (const h of c.rings) {
            if (!W.alive(h)) continue;
            const e = W.enemy(h);
            try { vfxW(w).ring(e.x, e.y, e.r * 2.2, VT.gold, calm ? 2.4 : 0.9); } catch { /* cosmetic */ }
          }
        }
      }
      for (const t of c.tasks) { t.left -= dt; if (t.left <= 0) { t.left += t.every; t.fn(); } }
      // the big one's first strike (a new line telegraph after it came)
      if (c.teleWatch && !c.teleSeen) {
        const n = lineTeles(W);
        if (n > c.teleCount) { c.teleSeen = true; c.send('tele'); }
        c.teleCount = n;
      }
      if (s.done || s.wait === null) return;
      if (typeof s.wait === 'number') {
        s.left -= dt;
        if (s.left <= 0) advance(s);
      } else if (s.wait()) advance(s);
    },
    on(_w, s, ev: GameEvent) {
      if (ev.type === 'pickup') s.ctx.pickups++;
      else if (ev.type === 'kill') s.ctx.kills++;
      else if (ev.type === 'cast') s.ctx.casts++;
    },
    /** Nobody goes down in practice: back to 60% HP with a moment's grace. */
    lethal(w, s) {
      const W = w as unknown as World;
      W.hp = Math.max(1, Math.round(W.hpMax * TUT.saveHp));
      W.invuln(TUT.saveInvuln);
      s.ctx.send('saved');
      return true;
    },
  };
}

/** Run a tutorial wave's script (call after engine.start). The cues say what just happened. */
export function attachScript(engine: Engine, id: TutorScriptId, cue: TutorCue): void {
  const W = worldOf(engine);
  if (!W) return;
  W.attach(script(id, cue) as Behaviour);
}

/** Tests: the script's Behaviour itself (the engine test drives it through a World). */
export const _scriptForTests = (id: TutorScriptId, cue: TutorCue): Behaviour => script(id, cue) as Behaviour;
