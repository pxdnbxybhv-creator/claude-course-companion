// 桃源 · the valley world for one 3D world: the door at the waterfall, the valley (built on the first
// way in), its effects, its clock (谷时), the ways in and out. The story (C) and the case (D) reach it
// through taoyuan(ctx) — see API.md. Created by the region module (regions/taoyuan.ts).
import type { WorldCtx } from '../../types';
import { loadBrush } from '../kit';
import { buildValley, type Valley } from './valley';
import { ValleyFx } from './fx';
import { buildCave, type Cave } from './cave';
import { buildDoor, enterValley, exitPrompts, leaveValley, mouthReveal, type Door, type DoorState, type EnterOpts, type LeaveOpts } from './door';
import { engine, type SkyMood } from './engine';
import { ANCHORS, BRUSHED, CAVE, L, PLACES, Y_T, fenceValley } from './places';

/** The valley clock's states (bible §1.3). */
export type ValleyClock = SkyMood;

type Listener = () => void;

export class TaoyuanWorld {
  valley: Valley | null = null;
  fx: ValleyFx | null = null;
  cave: Cave | null = null;
  door: Door | null = null;
  /** A way in or out is under way. */
  moving = false;
  private building: Promise<Valley> | null = null;
  private offs: (() => void)[] = [];
  private exitOffs: (() => void)[] = [];
  private clockNow: ValleyClock = 'chang';
  /** The valley's hush (the music held at 'quiet' through the narrow way) is on. */
  private quietHeld = false;
  private builtFns = new Set<(v: Valley) => void>();
  private enterFns = new Set<Listener>();
  private leaveFns = new Set<Listener>();
  private leaveHandler: (() => void | Promise<void>) | null = null;
  private cleft: { words: () => void; mouth: () => void | Promise<void>; wordsDone: boolean; mouthDone: boolean } | null = null;
  private inside = false;
  private disposed = false;

  constructor(readonly ctx: WorldCtx) {
    this.door = buildDoor(ctx, this);
    // the walker left some other way (the map, a fall): the floor goes, the clock's look rests
    this.offs.push(ctx.onRegion((id) => {
      if (id === 'taoyuan') return;
      if (this.inside) this.left();
      if (!this.moving) this.valley?.setFloor(false);
    }));
    this.offs.push(ctx.onFrame(() => this.tickCleft()));
  }

  // ───────────── build

  /** The valley is built (it builds on the first way in, behind the veil). */
  get built(): boolean { return this.valley !== null; }

  /** Build the valley now (once): geometry, effects, the cleft; then compile its shaders. */
  build(): Promise<Valley> {
    if (this.valley) return Promise.resolve(this.valley);
    if (this.building) return this.building;
    this.building = (async () => {
      const ctx = this.ctx;
      void loadBrush(BRUSHED);
      const v = buildValley(ctx);
      if (this.disposed) { v.dispose(); throw new Error('gone'); }
      const fx = new ValleyFx(ctx, v);
      const cave = buildCave(v, fx);
      this.valley = v; this.fx = fx; this.cave = cave;
      this.exitOffs = exitPrompts(this, () => this.leaveHandler ? this.leaveHandler() : this.leave());
      engine(ctx).photoFence(fenceValley);
      // (the floor stays only while the walker is inside)
      if (!this.inside) v.setFloor(false);
      const r = ctx.renderer as WorldCtx['renderer'] & { compileAsync?: (o: unknown, c: unknown, s?: unknown) => Promise<unknown> };
      try {
        const g = ctx.regionGroup('taoyuan');
        if (r.compileAsync) await Promise.race([r.compileAsync(g, ctx.camera, ctx.scene), new Promise((res) => setTimeout(res, 4000))]);
        else r.compile(g, ctx.camera, ctx.scene);
      } catch { /* a warm-up only */ }
      for (const fn of this.builtFns) { try { fn(v); } catch (e) { console.error('[walk] taoyuan built listener', e); } }
      return v;
    })();
    return this.building;
  }

  /** Called once the valley is built (at once if it is). Returns an unsubscribe. */
  onBuilt(fn: (v: Valley) => void): () => void {
    if (this.valley) { try { fn(this.valley); } catch (e) { console.error(e); } }
    this.builtFns.add(fn);
    return () => void this.builtFns.delete(fn);
  }
  /** Called when the walker comes into the valley (after the veil), and when they leave it. */
  onEnter(fn: Listener): () => void { this.enterFns.add(fn); return () => void this.enterFns.delete(fn); }
  onLeave(fn: Listener): () => void { this.leaveFns.add(fn); return () => void this.leaveFns.delete(fn); }

  // ───────────── in and out

  /** In through the door (see door.ts EnterOpts). */
  enter(o: EnterOpts = {}): Promise<void> { return enterValley(this, o); }
  /** Out through the cleft (see door.ts LeaveOpts). */
  leave(o: LeaveOpts = {}): Promise<void> { return leaveValley(this, o); }
  /** FX2 and the crane at the mouth (the story's B2 may call it itself). */
  mouthReveal(): Promise<void> { return mouthReveal(this); }
  /** What 「出谷」 at the inner mouth does (null: leave()). */
  setLeaveHandler(fn: (() => void | Promise<void>) | null): void { this.leaveHandler = fn; }
  /** The door's state, pinned (null: from the record). */
  setDoorState(s: DoorState | null): void { this.door?.set(s); }
  get doorState(): DoorState { return this.door?.state ?? 'hidden'; }
  /** What 「入光」 at the pool does (the story's B1); null: enter(). */
  setDoorHandler(fn: (() => void | Promise<void>) | null): void { this.door?.onEnter(fn); }
  /** The walker is inside the valley (on its floor, the cleft included). */
  isInside(): boolean { return this.inside; }

  /** (door.ts) the walker has just been set down inside. */
  arrived(): void {
    this.inside = true;
    this.applyClock(0);
    for (const fn of this.enterFns) { try { fn(); } catch (e) { console.error('[walk] taoyuan enter listener', e); } }
  }
  /**
   * (door.ts) Hush the music for the narrow way (true), or give it back to the place (false). Whatever
   * way the walker leaves — the door, the map, a fall — the hush is given back (see left()).
   */
  hush(on: boolean): void {
    if (on === this.quietHeld) return;
    this.quietHeld = on;
    try { if (on) this.ctx.music.setTheme('quiet'); else this.ctx.music.release(); } catch { /* optional */ }
  }
  /** (door.ts, or the region listener) the walker has left. */
  left(): void {
    if (!this.inside) return;
    this.inside = false;
    this.cleft = null;
    this.hush(false);
    this.fx?.fireflies(false);
    this.fx?.holdPetals(false);
    this.fx?.heldMist(false);
    for (const fn of this.leaveFns) { try { fn(); } catch (e) { console.error('[walk] taoyuan leave listener', e); } }
  }

  /** (door.ts) watch the walker through the cleft: the words at +56, the mouth at +43 (once each). */
  watchCleft(o: { words: () => void; mouth: () => void | Promise<void> }): void {
    this.cleft = { ...o, wordsDone: false, mouthDone: false };
  }
  private tickCleft(): void {
    const c = this.cleft;
    if (!c || this.moving) return;
    const p = this.ctx.player.position;
    if (p.y < Y_T - 5) return;
    const l = L(p.x, p.z);
    if (!c.wordsDone && l.z < CAVE.words + 1.5 && l.z > CAVE.mouth) { c.wordsDone = true; c.words(); }
    if (!c.mouthDone && l.z < CAVE.trigger) {
      c.mouthDone = true;
      this.cleft = null;
      Promise.resolve().then(() => c.mouth()).catch((e) => console.error('[walk] taoyuan mouth', e));
    }
  }

  // ───────────── the valley clock (谷时)

  /** The valley's hour now. */
  get clock(): ValleyClock { return this.clockNow; }
  /**
   * Turn the valley's hour (bible §1.3): the sky, the light and the fog, and the things of each hour —
   * god rays at 申 and 卯, fireflies from 酉, the lane lanterns lit one by one at 戌, petals glowing in
   * lamplight at 亥 and 子, petals held and a knee-high mist at 案. 'chang' follows the world's hour.
   * `secs`: how long the sky takes to turn (default 2.5).
   */
  setClock(state: ValleyClock, o: { secs?: number } = {}): void {
    this.clockNow = state;
    if (this.inside) this.applyClock(o.secs ?? 2.5);
  }
  private applyClock(secs: number): void {
    const fx = this.fx;
    const eng = engine(this.ctx);
    const s = this.clockNow;
    eng.setMood(s, { secs });
    if (!fx) return;
    // (常 is the world's own hour, as the sky resolved it: the walk's 时辰, a feature's night)
    const tod = s === 'chang' ? eng.moodTod() ?? 'day' : null;
    const night = s === 'xu' || s === 'hai' || s === 'zi' || s === 'case' || tod === 'night';
    fx.godRays(s === 'shen' || s === 'mao' || tod === 'day', s === 'mao' || tod === 'dawn' ? 'east' : 'west');
    fx.fireflies(s === 'you' || s === 'xu' || s === 'hai' || s === 'zi' || tod === 'dusk' || tod === 'night');
    fx.lanterns(night, secs <= 0 ? 0 : 450);
    void fx.petalGlow(s === 'hai' || s === 'zi' ? 0.8 : s === 'xu' || tod === 'night' ? 0.35 : s === 'case' ? 0.25 : 0, Math.max(0.01, secs));
    fx.holdPetals(s === 'case');
    fx.heldMist(s === 'case');
  }

  /**
   * FX12 · 嗒 and the dawn after it: fx.da() (the drop, the warm ring, every petal falling, the sky to
   * 卯, the mist lifting), then the valley clock stands at 卯.
   */
  async da(o: { at?: { x: number; y: number; z: number } } = {}): Promise<void> {
    if (!this.fx || !this.inside) return;
    await this.fx.da({ at: o.at });
    this.clockNow = 'mao';
    if (this.inside) this.applyClock(0);
  }

  // ───────────── the shrine's door, places

  /** The shrine hall's door (open or shut; shut stops the doorway). */
  shrineDoor(open: boolean, instant = false): void { this.valley?.shrineDoor(open, instant); }

  readonly places = PLACES;
  readonly anchors = ANCHORS;

  /** Wait (real time; resolves at once if the world has gone). */
  wait(ms: number): Promise<void> {
    if (this.fx) return this.fx.wait(ms);
    return new Promise((r) => { if (this.disposed) r(); else setTimeout(r, ms); });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.offs.splice(0)) f();
    for (const f of this.exitOffs.splice(0)) f();
    engine(this.ctx).photoFence(null);
    this.cave?.dispose();
    this.fx?.dispose();
    this.door?.dispose();
    this.valley?.dispose();
    this.valley = null; this.fx = null; this.cave = null; this.door = null;
    worlds.delete(this.ctx);
  }
}


const worlds = new WeakMap<WorldCtx, TaoyuanWorld>();

/** The valley world of this 3D world (null until the region module has built its door). */
export function taoyuan(ctx: WorldCtx): TaoyuanWorld | null {
  return worlds.get(ctx) ?? null;
}

/** (regions/taoyuan.ts) create it for a world. */
export function createTaoyuan(ctx: WorldCtx): TaoyuanWorld {
  const had = worlds.get(ctx);
  if (had) return had;
  const tv = new TaoyuanWorld(ctx);
  worlds.set(ctx, tv);
  return tv;
}

export type { DoorState, EnterOpts, LeaveOpts, Valley };
