// 水月幻镜 · 打击感 (the engine's feel layer): the monsters show the hits, the screen stays still —
// ordinary hits and crits never stop the world or move the camera (only big moments do, ≤ 3 px, and
// the shake setting turns those off too); the struck body flashes, squashes along the blow, recoils
// and freezes locally from its own bank (the world runs on); marks by class and a death that breaks
// the body into pieces; the sound bus never starts more than 4 voices a step and meets the hit on its
// own step; sparks stay inside their pool; reduced motion turns off every stop, shake, zoom, jitter and
// fling; numbers pop at once (crits bigger, with a bounce) and merge per body; the impact voices
// render cleanly.
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import { ELITE_REG, type EliteId, type WeaponId } from '../src/views/mirror/ids';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { FC, MK, STAIN_WASH, STAIN_WASH_S, fcOfWeapon, fragGrid, fragWhite, numPop } from '../src/views/mirror/engine/feel';
import { EKind } from '../src/views/mirror/engine/pools';
import { SRCI } from '../src/views/mirror/engine/consts';
import { SH } from '../src/views/mirror/paint/feel';
import { FEEL_MIX, FEEL_NAMES, renderFeel } from '../src/views/mirror/audio/voices';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;
/** An audio with the impact layer that logs every voice with the simulation step it started on. */
function logAudio(W: () => MirrorEngine['world'] | null) {
  const log: { name: string; step: number }[] = [];
  const a: MirrorAudio & { feel(name: string): void } = {
    prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {},
    feel: (name: string) => { log.push({ name, step: W()?.perf.steps ?? -1 }); },
  };
  return { a, log };
}
function make(run: RunSave, settings: Partial<EngineSettings> = {}, content: ContentRegistry = EMPTY) {
  let eng: MirrorEngine | null = null;
  const { a, log } = logAudio(() => eng?.world ?? null);
  const hooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
  const s: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...settings };
  eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, s.quality, 1), audio: a, content, hooks, settings: s }) as MirrorEngine;
  return { eng, log };
}
function setupFor(run: RunSave): { run: RunSave; setup: WaveSetup } {
  const r = beginWave(run);
  return { run: r, setup: waveSetup(r, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)) };
}
const withWeapons = (run: RunSave, ws: [WeaponId, 1 | 2 | 3 | 4][]): RunSave => ({ ...run, weapons: ws.map(([id, t]) => ({ id, t })) });
function quiet(eng: MirrorEngine) {
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  return W;
}
/** A crowd of immortal bodies around you (a busy screen). */
function crowd(W: MirrorEngine['world'], n: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, d = 70 + (k % 5) * 30;
    const h = W.spawn(k % 7 === 0 ? 'turtle' : 'blot', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false });
    const i = W.E.slotOf(h);
    if (i >= 0) { W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0; }
  }
}
const BUSY: [WeaponId, 1 | 2 | 3 | 4][] = [['yanyue', 4], ['pestle', 4], ['longquan', 4], ['claw', 4], ['repeater', 4], ['thunder', 4]];

describe('打击感: the feel layer', () => {
  it('hitstop: ordinary hits and crits never stop the world; the rare heavy moments stay within ~15% of any second', () => {
    // a fast crit build without heavy arms: the world never stops
    const LIGHT: [WeaponId, 1 | 2 | 3 | 4][] = [['longquan', 4], ['claw', 4], ['repeater', 4], ['thunder', 4], ['casket', 4], ['dart', 4]];
    for (const [ws, heavy] of [[LIGHT, false], [BUSY, true]] as const) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3 })), ws), wave: 11, stats: { aspd: 150, crit: 70 } });
      const { eng } = make(run);
      eng.start(run, setup);
      const W = quiet(eng);
      crowd(W, 60);
      let now = 1000;
      const secs: number[] = [];
      let frozen0 = 0, real0 = 0;
      for (let f = 0; f < 60 * 8; f++) {
        now += 1000 / 60;
        eng.frame(now);
        if (f % 60 === 59) { const st = W.feel.st; secs.push((st.frozenMs - frozen0) / (st.realMs - real0)); frozen0 = st.frozenMs; real0 = st.realMs; }
      }
      const st = W.feel.stats();
      expect(st.hits).toBeGreaterThan(200);
      if (!heavy) expect(st.stopMs).toBe(0); // no global stop from your own blows
      else {
        expect(st.stopMs).toBeGreaterThan(0); // a heavy weapon's crit still lands a beat …
        expect(st.stopMs).toBeLessThan(80 + 30 * 8 + 1); // … from a small bucket
      }
      for (const s of secs) expect(s).toBeLessThanOrEqual(0.15);
      expect(st.maxShare).toBeLessThanOrEqual(0.15);
      // the bodies took it instead: pulses and local freezes
      expect(st.pulses).toBeGreaterThan(100);
      expect(st.freezes).toBeGreaterThan(10);
      eng.dispose();
    }
  });

  it('the sound bus: ≤ 4 impact voices a step, started on the step of the hit; sparks stay in their pool', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 5 })), BUSY), wave: 11, stats: { aspd: 150, crit: 50 } });
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    crowd(W, 80);
    let maxSparks = 0;
    const hitSteps = new Set<number>();
    const s0 = W.feel.hit.bind(W.feel);
    W.feel.hit = (...a: Parameters<typeof s0>) => { if (!a[6]) hitSteps.add(W.perf.steps); s0(...a); };
    for (let k = 0; k < 600; k++) { eng.stepN(1); maxSparks = Math.max(maxSparks, W.feel.sp.count); }
    const per = new Map<number, number>();
    for (const v of log) if (v.name !== 'whoosh' && v.name !== 'release' && v.name !== 'zip' && v.name !== 'heart') per.set(v.step, (per.get(v.step) ?? 0) + 1);
    expect(per.size).toBeGreaterThan(50);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(4);
    // every class-colour voice starts on a step that landed a hit (never a frame late)
    const classVoices = new Set(['slash', 'smash', 'arrow', 'dartHit', 'spark', 'splash', 'blot', 'jade', 'clack', 'pluckHit', 'moonHit', 'clawHit']);
    for (const v of log) if (classVoices.has(v.name)) expect(hitSteps.has(v.step)).toBe(true);
    expect(log.some((v) => v.name === 'crack')).toBe(true);
    expect(log.some((v) => v.name === 'thump')).toBe(true);
    expect(maxSparks).toBeLessThanOrEqual(W.feel.sp.cap);
    eng.dispose();
  });

  it('reduced motion: no stop, shake, kick or zoom reaches the frame; the bodies react gently', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 7 })), BUSY), wave: 11, stats: { crit: 100 } });
    const { eng } = make(run, { reduceMotion: true, shake: true });
    eng.start(run, setup);
    const W = quiet(eng);
    crowd(W, 30);
    let now = 1000, worst = 0;
    const t0 = W.tWave;
    for (let f = 0; f < 240; f++) {
      now += 1000 / 60;
      eng.frame(now);
      worst = Math.max(worst, W.hitstopMs, Math.abs(W.feel.offX), Math.abs(W.feel.offY), W.feel.zoom, W.shakePx);
    }
    W.hitstop(80); W.shake(12); W.feel.punch(0.1); W.feel.hurt(W.px + 50, W.py, true, 0.5);
    eng.frame(now + 16);
    expect(worst).toBe(0);
    expect(W.hitstopMs).toBe(0);
    expect(W.tWave - t0).toBeGreaterThan(3.95); // the game never froze
    expect(W.feel.st.hits).toBeGreaterThan(50);
    // gentle reactions: no local freeze or jitter, no full-white flash frame, no fling of pieces
    const F = W.feel, E = W.E;
    expect(F.st.freezes).toBe(0);
    for (let k = 0; k < 30; k++) {
      eng.stepN(1);
      for (let i = 0; i < E.n; i++) if (E.alive[i]) { F.pose(i); expect(F.po.fl).not.toBe(1); expect(Math.abs(F.po.s)).toBeLessThanOrEqual(0.06); }
    }
    const h = W.spawn('blot', W.px + 60, W.py, { bloom: false });
    W.kill(h);
    for (let j = 0; j < F.fr.n; j++) if (F.fr.alive[j]) { expect(F.fr.vx[j]).toBe(0); expect(F.fr.vr[j]).toBe(0); }
    // … and the pieces never flash white (the renderer's white window is off under reduced motion)
    for (let a = 0; a < 0.5; a += 0.005) expect(fragWhite(a, true)).toBe(false);
    expect(fragWhite(0, false)).toBe(true);
    expect(fragWhite(0.02, false)).toBe(true);
    expect(fragWhite(0.05, false)).toBe(false);
    eng.dispose();
  });

  it('a hitstop holds the camera where it is: it never closes its follow lag in one frame', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 21 })), []), wave: 3 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    let now = 1000;
    let prev = eng.camera;
    const stepOf = () => { const c = eng.camera; const d = Math.hypot(c.x - prev.x, c.y - prev.y); prev = c; return d; };
    eng.input.move(1, 0.25);
    let walk = 0;
    for (let f = 0; f < 60; f++) { eng.frame((now += 1000 / 60)); walk = stepOf(); }
    expect(walk).toBeGreaterThan(0.5); // following a walk …
    // … from behind its target (you plus a 60 px lead): a lag the old code closed in a stop's first frame
    const lead = (60 * prev.dpr) / prev.scale, sp = Math.max(1, W.moveSpd);
    expect(Math.hypot(W.px + (W.pvx / sp) * lead - prev.x, W.py + (W.pvy / sp) * lead - prev.y)).toBeGreaterThan(5 * walk);
    for (const ms of [40, 75]) {
      W.hitstopMs = ms;
      const t0 = W.tWave;
      // the stop's frames and the first one after it: no step larger than the walk's
      for (let f = 0; f < Math.ceil(ms / 16.7) + 1; f++) { eng.frame((now += 1000 / 60)); expect(stepOf()).toBeLessThanOrEqual(walk * 1.05 + 1e-6); }
      expect(W.tWave - t0).toBeLessThanOrEqual(2 / 60 + 1e-6); // the world was held (the stop's tail and the frame after it ran)
      for (let f = 0; f < 30; f++) { eng.frame((now += 1000 / 60)); walk = stepOf(); }
    }
    eng.dispose();
  });

  it('a kill that breaks the body leaves out the dark ink burst; a death that breaks nothing keeps it', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 12 })), []), wave: 5 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const F = W.feel, E = W.E, P = W.P;
    const bursts = () => { let n = 0; for (let j = 0; j < P.n; j++) if (P.alive[j] && P.kind[j] === 'inkBurst') n++; return n; };
    const body = (dy: number) => {
      const h = W.spawn('crab', W.px + 100, W.py + dy, { bloom: false });
      const i = E.slotOf(h);
      E.hp[i] = E.hpMax[i] = 1000; E.speed[i] = 0; E.dmg[i] = 0;
      F.hit(i, W.px, W.py, 300, false, FC.slash, false, SRCI.weapon, -1);
      return h;
    };
    P.clear();
    W.kill(body(0));
    expect(F.fr.count).toBeGreaterThanOrEqual(3); // the pieces …
    expect(bursts()).toBe(0); // … are not buried under a black blot
    // a degraded frame breaks nothing: the ink burst stands in for the pieces
    F.fr.clear(); F.fr.id.fill(null);
    W.degrade = 1;
    W.kill(body(20));
    expect(F.fr.count).toBe(0);
    expect(bursts()).toBe(1);
    eng.dispose();
  });

  it('the stains dry as you fight: a timed wash of the paper, one sparked stain a step', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 5 })), BUSY), wave: 11, stats: { aspd: 150, crit: 50 } });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const washes: number[] = [];
    let stamps = 0;
    const painter = W.painter!;
    painter.wash = (f: number) => { washes.push(f); };
    painter.stamp = () => { stamps++; };
    for (let k = 0; k < 40; k++) W.spawn('blot', W.px + Math.cos(k) * (60 + k * 3), W.py + Math.sin(k) * (60 + k * 3), { bloom: false });
    const F = W.feel;
    const kills0 = F.st.kills, w0 = F.st.washes;
    let worst = 0;
    const secs = 6;
    for (let k = 0; k < 60 * secs; k++) {
      const s0 = F.st.stamps;
      eng.stepN(1);
      worst = Math.max(worst, F.st.stamps - s0);
      if (W.E.count < 20) for (let j = 0; j < 20; j++) W.spawn('blot', W.px + Math.cos(j) * 90, W.py + Math.sin(j) * 90, { bloom: false });
    }
    expect(F.st.kills - kills0).toBeGreaterThan(20);
    expect(stamps).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(1); // the feel layer's stains: ≤ 1 a step
    expect(F.st.washes - w0).toBe(Math.floor(secs / STAIN_WASH_S));
    expect(washes.length).toBe(Math.floor(secs / STAIN_WASH_S));
    for (const f of washes) expect(f).toBe(STAIN_WASH);
    // over a 45 s wave a kill's stain keeps about a third of its ink at most
    expect(Math.pow(1 - STAIN_WASH, 45 / STAIN_WASH_S)).toBeLessThan(0.4);
    eng.dispose();
  });

  it('numbers show on the first hit and merge per body; crits are marked', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 9 })), []), wave: 3 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const h = W.spawn('blot', W.px + 80, W.py, { bloom: false });
    const i = W.E.slotOf(h);
    W.E.hp[i] = W.E.hpMax[i] = 1e9;
    W.strike(i, 10, 0, 1, 0, W.px, W.py, -1, 0, 0);
    expect(W.N.count).toBe(1); // at once, in step with the flash
    expect(W.E.flash[i]).toBeGreaterThan(0);
    for (let k = 0; k < 12; k++) { W.strike(i, 10, k === 5 ? 1 : 0, 2, 0, W.px, W.py, -1, 0, 0); eng.stepN(2); }
    expect(W.N.count).toBe(1); // one climbing number, not a pile
    let j = -1;
    for (let k = 0; k < W.N.n; k++) if (W.N.alive[k]) j = k;
    expect(W.N.v[j]).toBeGreaterThan(60); // several hits in one number
    expect(W.N.style[j]).toBe(1);
    eng.dispose();
  });

  it('the camera stays still for your own hits, crits and kills; big moments only move it (≤ 3 px), and the setting turns them off', () => {
    for (const shake of [true, false]) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3 })), BUSY), wave: 11, stats: { aspd: 150, crit: 60 } });
      const { eng } = make(run, { shake });
      eng.start(run, setup);
      const W = quiet(eng);
      crowd(W, 50);
      // and bodies that die (kills, crits on them)
      for (let k = 0; k < 40; k++) W.spawn('blot', W.px + Math.cos(k) * (60 + k * 3), W.py + Math.sin(k) * (60 + k * 3), { bloom: false });
      const kills0 = W.feel.st.kills;
      let now = 1000, worst = 0, z = 0;
      for (let f = 0; f < 60 * 6; f++) {
        now += 1000 / 60;
        eng.frame(now);
        worst = Math.max(worst, Math.hypot(W.feel.offX, W.feel.offY));
        z = Math.max(z, W.feel.zoom);
        if (f % 90 === 0) W.feel.level(W.px, W.py); // level-ups: a burst, no camera
      }
      expect(W.feel.st.kills - kills0).toBeGreaterThan(10);
      expect(W.critN).toBeGreaterThan(50);
      expect(worst).toBe(0); // not a pixel from your own blows
      expect(z).toBe(0);
      // the 镜技's landing: a gentle zoom, no shake
      W.feel.skillImpact(W.px, W.py);
      eng.frame((now += 1000 / 60));
      if (shake) { expect(W.feel.zoom).toBeGreaterThan(0.01); expect(W.feel.zoom).toBeLessThanOrEqual(0.02); } else expect(W.feel.zoom).toBe(0);
      expect(Math.hypot(W.feel.offX, W.feel.offY)).toBe(0);
      for (let f = 0; f < 60; f++) eng.frame((now += 1000 / 60));
      // a light blow you take: still; a hard one (≥ 15% of your HP): a small, short nudge
      const peak = (fn: () => void) => {
        fn();
        let m = 0, frames = 0;
        for (let f = 0; f < 60; f++) { eng.frame((now += 1000 / 60)); const o = Math.hypot(W.feel.offX, W.feel.offY); m = Math.max(m, o); if (o > 0.5) frames++; }
        return { m, frames };
      };
      expect(peak(() => W.feel.hurt(W.px + 40, W.py, false, 0.05)).m).toBe(0);
      const hard = peak(() => W.feel.hurt(W.px + 40, W.py, false, 0.3));
      const slam = peak(() => { W.shake(5); W.shake(5); });
      const phase = peak(() => W.feel.phase(W.px, W.py));
      for (const p of [hard, slam, phase]) {
        if (shake) { expect(p.m).toBeGreaterThan(0.3); expect(p.m).toBeLessThanOrEqual(3.0001); expect(p.frames).toBeLessThan(20); } else expect(p.m).toBe(0);
      }
      eng.dispose();
    }
  });

  it('an elite fight never moves the camera: elites are ordinary combat (their slams ring and thud)', () => {
    // every named elite, with its real moves (slams, leaps, roars, charges), for 20 s at 60 fps: the
    // camera stays still while you take no hard blow
    for (const el of ELITE_REG) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 5, map: el.map })), []), wave: 11 });
      const { eng } = make(run, {}, CONTENT);
      eng.start(run, setup);
      const W = quiet(eng);
      W.spawn(el.id as EliteId, W.px + 220, W.py, { bloom: false });
      let now = 1000, worst = 0;
      for (let f = 0; f < 60 * 20; f++) { eng.frame((now += 1000 / 60)); worst = Math.max(worst, Math.hypot(W.feel.offX, W.feel.offY)); }
      expect(worst, el.id).toBe(0);
      eng.dispose();
    }
  });

  it('the struck body shows the blow: tiers by weight, squash along the blow, a local freeze from its own bank; the world runs on', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 11 })), []), wave: 5 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const F = W.feel, E = W.E;
    const h = W.spawn('blot', W.px + 100, W.py, { bloom: false });
    const i = E.slotOf(h);
    E.hp[i] = E.hpMax[i] = 1000; E.speed[i] = 0; E.dmg[i] = 0;
    // a light talisman tick: a flash and a small squash, no freeze
    F.hit(i, W.px, W.py, 5, false, FC.talisman, false, SRCI.weapon, -1);
    expect(E.flash[i]).toBeGreaterThan(0);
    expect(F.rFrz[i]).toBe(0);
    F.pose(i);
    expect(F.po.s).toBeCloseTo(0.12, 2);
    expect(F.po.fl).toBe(1); // the first frames: the white twin
    eng.stepN(20);
    // a heavy blow from the left: the body holds where it was struck, compressed along the blow, jitters, then flies
    const x0 = E.x[i];
    E.kx[i] = 900; E.kT[i] = 0.12; // the simulation carries it off (a knockback)
    F.hit(i, W.px, W.py, 400, false, FC.heavy, false, SRCI.weapon, -1);
    expect(F.rFrz[i]).toBeGreaterThanOrEqual(0.06);
    expect(W.hitstopMs).toBe(0); // the world does not stop
    eng.stepN(2);
    expect(E.x[i]).toBeGreaterThan(x0 + 10); // … it keeps running
    F.pose(i);
    expect(Math.abs(F.po.ang)).toBeLessThan(0.01); // the blow's axis: +x
    expect(F.po.s).toBeGreaterThan(0.25);
    expect(Math.abs(F.po.x - (x0 + 0.35 * F.rR[i]))).toBeLessThan(0.01); // held (plus the first of its recoil)
    expect(Math.abs(F.po.y - E.y[i])).toBeGreaterThan(1); // jitter across the blow
    eng.stepN(8);
    F.pose(i);
    expect(F.po.x).toBeGreaterThan(x0 + 15); // released: it flies after its body
    // hammered every step for 3 s: the body's bank keeps it held ≤ 30% of the time
    const s0 = F.st.freezeS;
    for (let k = 0; k < 180; k++) { F.hit(i, W.px, W.py, 400, k % 3 === 0, FC.heavy, false, SRCI.weapon, -1); eng.stepN(1); }
    expect(F.st.freezeS - s0).toBeLessThanOrEqual(0.3 * 3 + 0.15 + 1e-6);
    expect(F.st.freezeS - s0).toBeGreaterThan(0.3);
    // the flash is paced: never on for more than ~half the frames under a fast weapon
    let on = 0;
    for (let k = 0; k < 120; k++) { F.hit(i, W.px, W.py, 20, false, FC.slash, false, SRCI.weapon, -1); eng.stepN(1); F.pose(i); if (F.po.fl === 1) on++; }
    expect(on).toBeLessThanOrEqual(60);
    expect(on).toBeGreaterThan(10);
    eng.dispose();
  });

  it('marks by class across the body, pieces of the body on death, capped in a crowd', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 12 })), []), wave: 5 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const F = W.feel, E = W.E, M = F.mk;
    const h = W.spawn('crab', W.px + 100, W.py, { bloom: false });
    const i = E.slotOf(h);
    E.hp[i] = E.hpMax[i] = 1000; E.speed[i] = 0; E.dmg[i] = 0;
    const find = (kind: number) => { for (let j = 0; j < M.n; j++) if (M.alive[j] && M.kind[j] === kind) return j; return -1; };
    // a sword's cut runs across the blow (⟂), a flying sword's beam along it
    F.hit(i, W.px, W.py, 300, false, FC.slash, false, SRCI.weapon, -1);
    const c = find(MK.cut);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(M.shape[c]).toBe(SH.cut);
    expect(Math.abs(Math.abs(Math.sin(M.ang[c])) - 1)).toBeLessThan(0.2);
    expect(find(MK.pop)).toBeGreaterThanOrEqual(0); // the impact star
    expect(find(MK.ground)).toBeGreaterThanOrEqual(0); // the ground's splash
    M.clear();
    eng.stepN(1); // (a new step: a fresh mark budget)
    F.hit(i, W.px, W.py - 100, 300, false, FC.flying, false, SRCI.weapon, -1);
    const b = find(MK.beam);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(Math.abs(Math.cos(M.ang[b]))).toBeLessThan(0.75); // along the blow (from above)
    // a death: pieces of its own sprite, flung on along the killing blow
    const atlas = E.atlas[i];
    F.hit(i, W.px, W.py, 300, false, FC.slash, false, SRCI.weapon, -1);
    W.kill(h);
    expect(F.fr.count).toBeGreaterThanOrEqual(3);
    let vx = 0;
    for (let j = 0; j < F.fr.n; j++) if (F.fr.alive[j]) { expect(F.fr.id[j]).toBe(atlas); vx += F.fr.vx[j]; }
    expect(vx).toBeGreaterThan(0);
    // a crowd under fire: the marks stay inside their pool and their step budget
    crowd(W, 120);
    let peak = 0;
    for (let k = 0; k < 120; k++) {
      for (let j = 0; j < E.n; j++) if (E.alive[j]) F.hit(j, W.px, W.py, 50, k % 4 === 0, FC.slash, false, SRCI.weapon, -1);
      eng.stepN(1);
      peak = Math.max(peak, M.count);
    }
    expect(peak).toBeLessThanOrEqual(M.cap);
    expect(F.st.marks).toBeLessThan(120 * 12);
    eng.dispose();
  });

  it('a death breaks the body on its grid and flings only the pieces that carry some of it', () => {
    expect([fragGrid(EKind.Mon, 'high'), fragGrid(EKind.Mon, 'low'), fragGrid(EKind.Elite, 'mid'), fragGrid(EKind.Boss, 'low')]).toEqual([3, 2, 3, 4]);
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 12 })), []), wave: 5 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const F = W.feel, E = W.E, Fr = F.fr;
    // the baked shards say which pieces of the 3 × 3 grid hold the body: a plus (the corners are paper)
    const PLUS = (1 << 1) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 7);
    (F.sprites as unknown as { solid: (id: string, g: number) => number }).solid = (_id, g) => (g === 3 ? PLUS : 0);
    for (let n = 0; n < 6; n++) {
      Fr.clear(); Fr.id.fill(null);
      eng.stepN(1);
      const h = W.spawn('crab', W.px + 100, W.py + n * 7, { bloom: false });
      const i = E.slotOf(h);
      E.hp[i] = E.hpMax[i] = 1000; E.speed[i] = 0; E.dmg[i] = 0;
      F.hit(i, W.px, W.py, 300, false, FC.slash, false, SRCI.weapon, -1);
      W.kill(h);
      expect(Fr.count).toBe(5); // high wants 6; the plus has 5
      const seen = new Set<number>();
      for (let j = 0; j < Fr.n; j++) if (Fr.alive[j]) { expect(Fr.g[j]).toBe(3); expect(PLUS & (1 << Fr.q[j])).not.toBe(0); seen.add(Fr.q[j]); }
      expect(seen.size).toBe(5); // each piece once
    }
    eng.dispose();
  });

  it('a blow you take: no drift, an 8 ms tick, the drum under the grunt in the bus; crits never buzz', () => {
    const buzz: number[] = [];
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (ms: number) => { buzz.push(ms); return true; } }, configurable: true, writable: true });
    try {
      for (const reduceMotion of [false, true]) {
        buzz.length = 0;
        const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 7 })), BUSY), wave: 11, stats: { crit: 100 } });
        let sfx: string[] = [];
        const { eng, log } = make(run, { reduceMotion });
        (eng.world.audio as MirrorAudio).sfx = (n) => { sfx.push(n); };
        eng.start(run, setup);
        const W = quiet(eng);
        crowd(W, 20);
        eng.stepN(240); // a crit storm
        expect(W.feel.st.hits).toBeGreaterThan(50);
        expect(buzz).toEqual([]);
        W.godmode = false;
        const h = W.spawn('blot', W.px + 30, W.py, { bloom: false });
        const a = W.E.slotOf(h);
        const x0 = W.px, y0 = W.py;
        sfx = [];
        const before = log.length;
        W.hurtFrom(3, a, true, false, 'blot', false, true);
        eng.stepN(1);
        let drift = 0;
        for (let k = 0; k < 30; k++) { eng.stepN(1); drift = Math.max(drift, Math.hypot(W.px - x0, W.py - y0)); }
        expect(drift).toBe(0); // GDD §20.1: no drift
        expect(buzz).toEqual([8]); // GDD §20.2
        expect(sfx).toContain('hurt'); // the heartbeat drum
        expect(log.slice(before).some((v) => v.name === 'grunt')).toBe(true);
        eng.dispose();
      }
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it('numbers pop: crits jump bigger, bounce under and settle; reduced motion holds still', () => {
    expect(numPop(0.05, true, false)).toBeGreaterThanOrEqual(1.4);
    expect(numPop(0.05, false, false)).toBeLessThan(1.2);
    let low = 9;
    for (let t = 0.08; t < 0.3; t += 0.005) low = Math.min(low, numPop(t, true, false));
    expect(low).toBeLessThan(0.97);
    expect(Math.abs(numPop(0.34, true, false) - 1)).toBeLessThan(0.03);
    expect(numPop(0.4, true, false)).toBe(1);
    for (const t of [0, 0.03, 0.05, 0.1, 0.2]) { expect(numPop(t, true, true)).toBe(1); expect(numPop(t, false, true)).toBe(1); }
  });

  it('every weapon has a feel class; the impact voices render short and clean', () => {
    expect(fcOfWeapon('yanyue', ['heavy'])).toBe(FC.heavy);
    expect(fcOfWeapon('qingping', ['flying'])).toBe(FC.flying);
    expect(fcOfWeapon('sunbow', ['bow'])).toBe(FC.arrow);
    expect(fcOfWeapon('gobowl', ['go'])).toBe(FC.go);
    const sr = 8000;
    for (const name of FEEL_NAMES) {
      const [x] = renderFeel(name, sr);
      let peak = 0;
      for (let k = 0; k < x.length; k++) { const v = Math.abs(x[k]); if (!Number.isFinite(v)) throw new Error(name); if (v > peak) peak = v; }
      expect(peak, name).toBeGreaterThan(0.05);
      expect(peak, name).toBeLessThan(0.95);
      expect(x.length / sr, name).toBeLessThan(1.2);
      expect(FEEL_MIX[name].cap).toBeGreaterThanOrEqual(1);
    }
  });
});
