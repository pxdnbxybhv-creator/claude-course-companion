// 水月幻镜 · the leftovers round: a skill's landing sounds once (the feel layer's voice, no content
// sfx on top), 灯笼鬼 never heals a boss or a decoy, a zone ages whatever its life, the darkness goes
// under the danger (the render order list) with whole-pixel rects, 夔 keeps the HUD's beat, the HUD
// knows the dark, and the contract names bossShadow and 水中月's moon looks.
import { describe, expect, it } from 'vitest';
import type { AtlasId, CharacterId, ContentRegistry, EngineHooks, EngineSettings, HudState, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import { FX_REG } from '../src/views/mirror/ids';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { beatNow, ownBeat } from '../src/views/mirror/engine/content/bridge';
import { EKind } from '../src/views/mirror/engine/pools';
import { SRCI } from '../src/views/mirror/engine/consts';
import { Renderer, drawOrder, holeRects, zoneFade, type Layer } from '../src/views/mirror/engine/render';
import { allAtlasIds } from '../src/views/mirror/paint';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 909, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
interface Rec { sfx: string[]; feel: string[]; huds: HudState[]; errors: unknown[] }
function make(run: RunSave, content: ContentRegistry = CONTENT): { eng: MirrorEngine; rec: Rec } {
  const rec: Rec = { sfx: [], feel: [], huds: [], errors: [] };
  // an audio with the feel layer's impact voices, so hits never fall back to sfx
  const audio = {
    prime: async () => {}, sfx: (n: string) => { rec.sfx.push(n); }, pickup: () => {}, music: () => {}, dispose: () => {},
    feel: (n: string) => { rec.feel.push(n); },
  } as unknown as MirrorAudio;
  const hooks: EngineHooks = {
    hud: (h) => rec.huds.push({ ...h }), levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {},
    error: (e) => { rec.errors.push(e); },
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio, content, hooks, settings }) as MirrorEngine;
  return { eng, rec };
}
function at(w: number, o: Partial<NewRunOpts> = {}, patch: Partial<RunSave> = {}): { run: RunSave; setup: WaveSetup } {
  const run = beginWave({ ...newRun(opts(o)), wave: w - 1, ...patch });
  return { run, setup: waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)) };
}
/** A quiet arena: no planned spawns, endless, you cannot die. */
function quiet(eng: MirrorEngine): MirrorEngine['world'] {
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  return W;
}
function step(eng: MirrorEngine, n: number): void {
  for (let i = 0; i < n; i++) { if (eng.paused) eng.resume(); eng.stepN(1); }
}

// ═════════════════════════════════════════════ 1 · one sound per landing

const HIT_SFX = new Set(['hitMelee', 'hitShot', 'hitTalisman', 'bossDrum', 'bell']);
/** Every companion whose skill strikes: cast into a crowd, and no step where the skill lands also plays content's hit sfx. */
const STRIKERS: CharacterId[] = ['scholar', 'swordsman', 'taoist', 'cat', 'rabbit', 'guan', 'change'];

describe('a skill hit sounds once', () => {
  for (const char of STRIKERS) {
    it(`${char}: the landing is the feel layer's voice alone`, () => {
      const { run, setup } = at(5, { char }, { weapons: [] });
      const { eng, rec } = make(run);
      eng.start(run, setup);
      const W = quiet(eng);
      step(eng, 5);
      // a ring of tough blots close around you (they survive the blow, so nothing but the skill hits)
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const h = W.spawn('blot', W.px + Math.cos(a) * 70, W.py + Math.sin(a) * 70, { bloom: false });
        const i = W.E.slotOf(h);
        W.E.hp[i] = W.E.hpMax[i] = 1e6; W.E.speed[i] = 0; W.E.dmg[i] = 0;
      }
      step(eng, 2);
      let skillHits = 0;
      const s0 = W.strike.bind(W);
      (W as unknown as { strike: typeof W.strike }).strike = (i, dmg, cp, cm, kn, fx, fy, slot, src, ...r) => {
        if (src === SRCI.skill) skillHits++;
        return s0(i, dmg, cp, cm, kn, fx, fy, slot, src, ...r);
      };
      W.moveX = 1; W.moveY = 0;
      eng.skill();
      W.moveX = 0;
      let landed = 0;
      const clashes: string[] = [];
      for (let t = 0; t < 60 * 6; t++) {
        const h0 = skillHits, n0 = rec.sfx.length;
        step(eng, 1);
        if (skillHits > h0) {
          landed++;
          for (const n of rec.sfx.slice(n0)) if (HIT_SFX.has(n)) clashes.push(`${t}:${n}`);
        }
      }
      expect(rec.errors).toEqual([]);
      expect(landed, 'the skill landed').toBeGreaterThan(0);
      expect(clashes).toEqual([]);
      // the landing still sounds: the 镜技's boom through the feel layer
      expect(rec.feel).toContain('skillHit');
      eng.dispose();
    });
  }

  it('the boom comes back in the next wave (the feel clocks restart with the wave clock)', () => {
    const { run, setup } = at(5, { char: 'guan' }, { weapons: [] });
    const { eng, rec } = make(run);
    const castInto = (late: boolean): string[] => {
      const W = quiet(eng);
      step(eng, 5);
      if (late) W.t = 20.4; // late in the wave: the gates remember this time
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const h = W.spawn('blot', W.px + Math.cos(a) * 60, W.py + Math.sin(a) * 60, { bloom: false });
        const i = W.E.slotOf(h);
        W.E.hp[i] = W.E.hpMax[i] = 1e6; W.E.speed[i] = 0; W.E.dmg[i] = 0;
      }
      step(eng, 2);
      const n0 = rec.feel.length;
      eng.skill();
      step(eng, 60 * 3);
      return rec.feel.slice(n0);
    };
    eng.start(run, setup);
    expect(castInto(true)).toContain('skillHit');
    // the next wave: the world clock starts again at 0
    const next = at(6, { char: 'guan' }, { weapons: [] });
    eng.start(next.run, next.setup);
    expect(castInto(false)).toContain('skillHit');
    expect(rec.errors).toEqual([]);
    eng.dispose();
  });

  it('棋士 围: captures pop through the feel layer, not a content kill sound on top', () => {
    const { run, setup } = at(5, { char: 'player' }, { weapons: [] });
    const { eng, rec } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    step(eng, 5);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const i = W.E.slotOf(W.spawn('blot', W.px + Math.cos(a) * 90, W.py + Math.sin(a) * 90, { bloom: false }));
      W.E.speed[i] = 0; W.E.dmg[i] = 0;
    }
    step(eng, 2);
    const k0 = W.kills;
    eng.skill();
    step(eng, 60 * 2);
    expect(W.kills - k0).toBeGreaterThan(0);
    expect(rec.sfx).not.toContain('kill');
    expect(rec.feel.some((n) => n === 'pop' || n === 'popBig')).toBe(true);
    eng.dispose();
  });

  it('a skill that catches nothing still sounds (书生 一字千钧 on empty ground)', () => {
    const { run, setup } = at(5, { char: 'scholar' }, { weapons: [] });
    const { eng, rec } = make(run);
    eng.start(run, setup);
    quiet(eng);
    step(eng, 5);
    eng.world.castSkill({ x: eng.world.px + 200, y: eng.world.py }, null);
    step(eng, 60);
    expect(rec.sfx).toContain('bossDrum');
    eng.dispose();
  });
});

// ═════════════════════════════════════════════ 3 · 灯笼鬼 heals the pack, not a boss or a decoy

describe('灯笼鬼 healAura', () => {
  it('heals a wounded monster but never a boss or a decoy', () => {
    const { run, setup } = at(9, { map: 'forest' }, { weapons: [] });
    const { eng } = make(run, EMPTY);
    eng.start(run, setup);
    const W = quiet(eng);
    step(eng, 3);
    const x = W.px + 380, y = W.py;
    W.spawn('ghostlamp', x, y, { bloom: false });
    const body = (dx: number, dy: number, setupFn: (i: number) => void) => {
      const i = W.E.slotOf(W.spawn('blot', x + dx, y + dy, { bloom: false }));
      W.E.hpMax[i] = 100; W.E.hp[i] = 50; W.E.speed[i] = 0; W.E.dmg[i] = 0;
      setupFn(i);
      return i;
    };
    const mon = body(40, 0, () => {});
    const boss = body(-40, 0, (i) => { W.E.kind[i] = EKind.Boss; });
    const decoy = body(0, 40, (i) => { W.E.decoy[i] = 1; });
    step(eng, 30);
    expect(W.E.hp[mon]).toBeGreaterThan(50);
    expect(W.E.hp[boss]).toBe(50);
    expect(W.E.hp[decoy]).toBe(50);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════ 4 · a zone ages whatever its life

describe('zone age', () => {
  it('a zone that lasts "forever" (a float32 life of 1e9) still fades in', () => {
    const { run, setup } = at(3, {}, { weapons: [] });
    const { eng } = make(run, EMPTY);
    eng.start(run, setup);
    const W = quiet(eng);
    const id = W.zone({ side: 'player', look: 'moonCircle', x: W.px, y: W.py, r: 80, life: 1e9 });
    const i = id % 1024;
    step(eng, 30);
    // the float32 life never counts down at 1e9 …
    expect(W.Z.life0[i] - W.Z.life[i]).toBe(0);
    // … but its age does, and the wash is fully in
    expect(W.Z.age[i]).toBeCloseTo(0.5, 3);
    expect(zoneFade(W.Z.life[i], W.Z.age[i])).toBe(1);
    // a new zone starts faint; a dying one fades out
    expect(zoneFade(5, 0)).toBeCloseTo(0.2, 6);
    expect(zoneFade(0.2, 9)).toBeCloseTo(0.5, 6);
    // a reused slot starts its age over
    W.endZone(id);
    const id2 = W.zone({ side: 'enemy', look: 'inkPuddle', x: 0, y: 0, r: 40, life: 3 });
    expect(W.Z.age[id2 % 1024]).toBe(0);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════ 2 · the darkness goes under the danger

/** A 2D context that accepts everything (every property a callable no-op). */
function nullCtx(): CanvasRenderingContext2D {
  const fn: unknown = new Proxy(function () { return fn; }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : fn), set: () => true, apply: () => fn });
  return fn as CanvasRenderingContext2D;
}

describe('darkness draw order', () => {
  const idx = (o: readonly Layer[], l: Layer) => o.indexOf(l);
  it('lit: the contract order, no darkness', () => {
    const o = drawOrder(false);
    expect(o).not.toContain('darkness');
    expect(o.slice(0, 2)).toEqual(['arena', 'telegraphs']);
    expect(idx(o, 'numbers')).toBeLessThan(idx(o, 'enemyShots'));
    expect(idx(o, 'enemyShots')).toBeLessThan(idx(o, 'overlays'));
  });
  it('dark: the field under the darkness, telegraphs, enemy ground and enemy shots over it', () => {
    const o = drawOrder(true);
    const d = idx(o, 'darkness');
    expect(d).toBeGreaterThan(0);
    for (const l of ['enemies', 'player', 'drops', 'zones', 'numbers'] as Layer[]) expect(idx(o, l), l).toBeLessThan(d);
    for (const l of ['telegraphs', 'dangerZones', 'enemyShots', 'reticle', 'overlays'] as Layer[]) expect(idx(o, l), l).toBeGreaterThan(d);
    expect(new Set(o).size).toBe(o.length);
  });
  it('draw() walks the list for the frame it draws', () => {
    const { run, setup } = at(3, {}, { weapons: [] });
    const { eng } = make(run, EMPTY);
    eng.start(run, setup);
    const W = quiet(eng);
    const r = new Renderer(createDebugPainter(run.map, 'high', 1));
    const seen: Layer[] = [];
    const l0 = r.layer.bind(r);
    r.layer = (L, ...a) => { seen.push(L); l0(L, ...a); };
    const cam = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    r.draw(W, nullCtx(), cam);
    expect(seen).toEqual([...drawOrder(false)]);
    seen.length = 0;
    W.light(260);
    r.draw(W, nullCtx(), cam);
    expect(seen).toEqual([...drawOrder(true)]);
    eng.dispose();
  });
  it("the hole's rects are whole pixels and tile the screen with the hole", () => {
    const out = new Float64Array(20);
    for (const [w, h, sx, sy, R] of [[390, 844, 195.3, 422.7, 260.4], [1280, 800, 12.5, -40.2, 100.1], [390, 844, 900, 900, 50.5], [390, 844, 195, 422, 2000]]) {
      holeRects(out, w, h, sx, sy, R);
      for (const v of out) expect(Number.isInteger(v)).toBe(true);
      // the hole square contains the circle
      expect(out[0]).toBeLessThanOrEqual(sx - R); expect(out[2]).toBeGreaterThanOrEqual(sx + R);
      expect(out[1]).toBeLessThanOrEqual(sy - R); expect(out[3]).toBeGreaterThanOrEqual(sy + R);
      // four rects + the on-screen part of the hole = the screen, with no overlap
      let area = 0;
      for (let k = 4; k < 20; k += 4) { expect(out[k + 2]).toBeGreaterThanOrEqual(0); expect(out[k + 3]).toBeGreaterThanOrEqual(0); area += out[k + 2] * out[k + 3]; }
      const hx = Math.max(0, Math.min(w, out[2]) - Math.max(0, out[0])), hy = Math.max(0, Math.min(h, out[3]) - Math.max(0, out[1]));
      expect(area + hx * hy).toBe(w * h);
    }
  });
});

// ═════════════════════════════════════════════ 5, 6 · the HUD's beat and the dark

describe('HUD beat and dark', () => {
  it('flags every 2 Hz beat once at the ≈8 Hz push', () => {
    const { run, setup } = at(3, {}, { weapons: [] });
    const { eng, rec } = make(run, EMPTY);
    eng.start(run, setup);
    quiet(eng);
    rec.huds.length = 0;
    step(eng, 60 * 4);
    const beats = rec.huds.filter((h) => h.beat).length;
    expect(beats).toBeGreaterThanOrEqual(7);
    expect(beats).toBeLessThanOrEqual(9);
    eng.dispose();
  });
  it('follows the boss that keeps the beat (夔, 80 BPM) and returns to 2 Hz when it lets go', () => {
    const { run, setup } = at(3, {}, { weapons: [] });
    const { eng, rec } = make(run, EMPTY);
    eng.start(run, setup);
    const W = quiet(eng);
    ownBeat(W, true);
    rec.huds.length = 0;
    // 80 BPM for 6 s: a beat every 45 steps
    let beatsW = 0;
    for (let s = 1; s <= 360; s++) {
      step(eng, 1);
      if (W.beat) beatsW++;
      if (s % 45 === 44) beatNow(W);
    }
    expect(beatsW).toBe(8);
    // each seen by one push (the last may wait for the next)
    const hb = rec.huds.filter((h) => h.beat).length;
    expect(hb).toBeGreaterThanOrEqual(7); expect(hb).toBeLessThanOrEqual(8);
    // the core's own 2 Hz tick stays silent while the boss keeps the beat
    expect(rec.sfx.filter((n) => n === 'beatTick')).toEqual([]);
    ownBeat(W, false);
    rec.huds.length = 0;
    step(eng, 60 * 4);
    expect(rec.huds.filter((h) => h.beat).length).toBeGreaterThanOrEqual(7);
    eng.dispose();
  });
  it('夔 itself hands the beat over at 80 BPM', () => {
    const { run, setup } = at(10, { map: 'forest' });
    const { eng, rec } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    W.godmode = true;
    let boss = -1;
    for (let s = 0; s < 60 * 8 && boss < 0; s++) {
      step(eng, 1);
      for (let i = 0; i < W.E.n; i++) if (W.E.alive[i] && W.E.kind[i] === EKind.Boss && W.E.id[i] === 'kui') boss = i;
    }
    expect(boss).toBeGreaterThanOrEqual(0);
    expect(W.beatOwn).toBe(true);
    const t0: number[] = [];
    for (let s = 0; s < 60 * 6; s++) { step(eng, 1); if (W.beat) t0.push(W.t); }
    const gaps = t0.slice(1).map((t, k) => t - t0[k]);
    expect(gaps.length).toBeGreaterThan(3);
    // 80 BPM (0.75 s), or longer while the cracked drum is silent — never the core's 0.5 s
    for (const g of gaps) expect(g).toBeGreaterThan(0.7);
    expect(rec.errors).toEqual([]);
    eng.dispose();
  });
  it('HudState.dark is set while the darkness is down', () => {
    const { run, setup } = at(3, {}, { weapons: [] });
    const { eng, rec } = make(run, EMPTY);
    eng.start(run, setup);
    const W = quiet(eng);
    step(eng, 20);
    expect(rec.huds.at(-1)?.dark).toBe(false);
    W.light(300);
    step(eng, 20);
    expect(rec.huds.at(-1)?.dark).toBe(true);
    W.light(null);
    step(eng, 20);
    expect(rec.huds.at(-1)?.dark).toBe(false);
    eng.dispose();
  });
});

// ═════════════════════════════════════════════ 7 · the contract names them

describe('contract ids', () => {
  it('FX_REG has bossShadow and AtlasId has 水中月\'s moon looks', () => {
    expect(FX_REG.some((f) => f.id === 'bossShadow')).toBe(true);
    const ids = new Set<AtlasId>(allAtlasIds());
    const moons: AtlasId[] = ['boss:moonwater:1:m0', 'boss:moonwater:1:m7'];
    for (const m of moons) expect(ids.has(m)).toBe(true);
    expect(ids.has('fx:bossShadow')).toBe(true);
  });
});
