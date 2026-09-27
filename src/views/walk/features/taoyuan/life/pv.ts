// 桃源 · 二期: the tasting close-up 特写 — the director (spec §4). A food shot inside an ink painting:
// the cook at the stove, the dish set down overhead while the ink bleeds into colour, the hero shot
// in slow motion with the vertical title and the cook's seal, the lift, and the bite, with the cook's
// voice as subtitles and a rising 徵 sting. It films what pv-shots.ts says, on the dish kit (dish.ts)
// and the overlays (pv-dom.ts).
//
// It runs inside the table's `taoyuan-life` claim and never claims itself. Every wait is a real-time
// setTimeout (fx.wait is capped under reduced motion); motion inside a shot is tweened on the world
// clock, so slow motion slows it for free. A tap, Esc or 「略过」 (after 0.4 s) jumps to the last 1.2 s
// of 尝, so the reaction and the new page always show; a second one ends it. Its end hands everything
// to the life restore (the lens, the time scale, the lent hand, the freeze, the cook, the camera).
//
// Owner: P (特写).
import type * as T from 'three';
import type { WorldCtx } from '../../../types';
import { CHARACTER } from '../../../../../data/characters';
import { reducedMotion } from '../../kit';
import { touchInput, withTheme } from '../../minigames/ui';
import * as snd from '../../minigames/sound';
import type { TaoyuanWorld } from '../world';
import { engine } from '../engine';
import { seeFocus } from '../valley';
import { ANCHORS, L as toLocal, W, Y_T, standAt } from '../places';
import { VILLAGERS } from '../folk';
import { lifeOf } from './api';
import { COOKS, DISHES, NEW_PAGE, seasonLabel } from './food';
import { PROPS, stoveSpot } from './table-logic';
import { DishKit, STAND_H, TOOL, VESSELS, warmDishMaterials } from './dish';
import { mountPvDom, sayBubble, supportsBackdrop, type PvDom } from './pv-dom';
import { SKIP_AFTER, shotsFor, skipTo, type Shot } from './pv-shots';
import type { DishId, KindId, LifeApi, LifeMount, Line, PVOpts } from './types';

type V3 = { x: number; y: number; z: number };
const DEG = Math.PI / 180;

// ───────────────────────────── where things stand (valley-local heights of the stall props)

/** The long tables' tops (valley.ts: two tables at x 4.6, z ±1.3, 0.8 × 3.4, top 0.76 m up). */
const TABLES = [{ x: 4.6, z: -1.3 }, { x: 4.6, z: 1.3 }];
const TABLE_TOP = 0.76;
const onTable = (x: number, z: number) => TABLES.find((t) => Math.abs(x - t.x) < 0.36 && Math.abs(z - t.z) < 1.62) ?? null;

/** Where the kit stands at a station (valley-local), on the prop the cook works (stalls.ts heights). */
function stationTop(p: { x: number; z: number }): { x: number; y: number; z: number } {
  const near = (q: { x: number; z: number }, r: number) => Math.hypot(p.x - q.x, p.z - q.z) < r;
  const s = stoveSpot();
  if (near(s, 1.0)) return { x: s.x - 0.12, y: standAt(s.x, s.z) + 0.9, z: s.z + 0.02 };
  if (near(PROPS.counter, 0.9)) return { x: PROPS.counter.x - 0.1, y: standAt(PROPS.counter.x, PROPS.counter.z) + 1.0, z: PROPS.counter.z };
  if (near(PROPS.stepBrazier, 0.6)) return { x: p.x, y: standAt(p.x, p.z) + 0.49, z: p.z };
  if (near(PROPS.porchBrazier, 0.6)) return { x: p.x, y: standAt(p.x, p.z) + 0.68, z: p.z };
  if (near(PROPS.tray, 0.6)) return { x: p.x - 0.12, y: standAt(p.x, p.z) + 0.285, z: p.z - 0.04 };
  if (near(PROPS.embers, 0.6)) return { x: p.x, y: standAt(p.x, p.z) + 0.09, z: p.z };
  const t = onTable(p.x, p.z);
  if (t) return { x: p.x, y: standAt(t.x, t.z) + TABLE_TOP, z: p.z };
  return { x: p.x, y: standAt(p.x, p.z) + STAND_H, z: p.z };
}

/** Where the dish is set before the walker (valley-local): on the table, the counter, or a low stand. */
function seatDish(seat: { x: number; z: number }, face: { x: number; z: number }): { x: number; y: number; z: number; stand: boolean } {
  let dx = face.x - seat.x, dz = face.z - seat.z;
  const n = Math.hypot(dx, dz) || 1;
  dx /= n; dz /= n;
  for (const d of [0.45, 0.55, 0.35]) {
    const x = seat.x + dx * d, z = seat.z + dz * d;
    const t = onTable(x, z);
    if (t) return { x: Math.max(t.x - 0.3, Math.min(t.x + 0.3, x)), y: standAt(t.x, t.z) + TABLE_TOP, z, stand: false };
  }
  if (Math.hypot(seat.x - PROPS.counter.x, seat.z - PROPS.counter.z) < 1.3) {
    const x = seat.x + dx * 0.5, z = seat.z + dz * 0.5;
    return { x, y: standAt(PROPS.counter.x, PROPS.counter.z) + 1.0, z, stand: false };
  }
  const x = seat.x + dx * 0.42, z = seat.z + dz * 0.42;
  return { x, y: standAt(x, z) + STAND_H, z, stand: true };
}

/** A line from a camera spot to what it looks at is clear of the valley's trunks, walls, roofs and blossom. */
function clearView(tv: TaoyuanWorld, from: V3, to: V3): boolean {
  const lf = toLocal(from.x, from.z);
  if (from.y < Y_T + standAt(lf.x, lf.z) + 0.12) return false;
  const v = tv.valley?.views;
  if (!v) return true;
  const N = 10;
  for (let i = 0; i < N; i++) {
    const k = i / N;
    const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k, z = from.z + (to.z - from.z) * k;
    const pad = i === 0 ? 0.25 : 0.05;
    for (const c of v.cyl) if (y > c.y0 - pad && y < c.y1 + pad && Math.hypot(x - c.x, z - c.z) < c.r + pad) return false;
    // (the peaches clear the view to the focus by themselves: only the camera's own spot matters)
    if (i === 0) for (const b of v.balls) if (Math.hypot(x - b.x, y - b.y, z - b.z) < b.r + pad) return false;
  }
  return true;
}

/**
 * Frame a subject (world) seen along its facing (a unit xz): the camera `dist` away at `elev` above
 * and `yaw` round from the facing, trying ±30° and ±60° when the view is blocked (spec §4.6).
 */
export function frameDish(tv: TaoyuanWorld | null, at: V3, facing: { x: number; z: number }, s: Pick<Shot, 'dist' | 'elev' | 'yaw' | 'push'>): { to: V3; look: V3; pushed: V3 } {
  const f0 = Math.atan2(facing.x, facing.z);
  const put = (dy: number) => {
    const a = f0 + (s.yaw + dy) * DEG, e = s.elev * DEG;
    const hz = Math.cos(e) * s.dist;
    const to = { x: at.x + Math.sin(a) * hz, y: at.y + Math.sin(e) * s.dist, z: at.z + Math.cos(a) * hz };
    // (straight down: the look is offset 2 cm so lookAt never degenerates)
    const look = s.elev > 80 ? { x: at.x - Math.sin(a) * 0.02, y: at.y, z: at.z - Math.cos(a) * 0.02 } : { ...at };
    return { to, look };
  };
  let best = put(0);
  if (tv) {
    for (const dy of [0, 30, -30, 60, -60]) {
      const c = put(dy);
      if (clearView(tv, c.to, c.look)) { best = c; break; }
    }
  }
  const { to, look } = best;
  const dx = look.x - to.x, dy = look.y - to.y, dz = look.z - to.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const p = s.push ?? 0;
  return { to, look, pushed: { x: to.x + (dx / d) * p, y: to.y + (dy / d) * p, z: to.z + (dz / d) * p } };
}

// ───────────────────────────── one 特写 playing

interface Run {
  dish: DishId;
  o: PVOpts;
  shots: Shot[];
  i: number;
  into: number;
  gen: number;
  t0: number;
  stage: 0 | 1 | 2;
  wake: (() => void) | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  placed: boolean;
  skip(ui: boolean): void;
  end(): void;
}

const runs = new WeakMap<WorldCtx, Run>();
const kits = new WeakMap<WorldCtx, DishKit>();
/** The reaction bubble still up after a 特写 (the way out takes it down). */
const bubbles = new WeakMap<WorldCtx, () => void>();
/** (DEV) how long the kit took to build and dress, ms. */
const kitMs = new WeakMap<WorldCtx, number>();

/**
 * Play the 特写 of `dish` (or its short cut, by `o.mode`). 'none' returns at once: the table shows its
 * small card. Runs inside the table's `taoyuan-life` claim, which the caller holds and gives back
 * after; it never claims, and its end hands everything it changed to the life restore. Resolves when
 * the last shot is over (or skipped to its end).
 */
export async function playPV(ctx: WorldCtx, tv: TaoyuanWorld, dish: DishId, o: PVOpts): Promise<void> {
  if (o.mode === 'none' || runs.has(ctx)) return;
  const life = lifeOf(ctx);
  const fx = tv.fx;
  if (!life || !fx || !tv.isInside()) return;
  let kit = kits.get(ctx);
  if (!kit) {
    const t = performance.now();
    try {
      kit = new DishKit(ctx, fx);
      kit.setDish(dish, { li: o.li, festival: o.festival });
    } catch (e) { console.error('[walk] taoyuan 特写 kit', e); return; }
    kits.set(ctx, kit);
    kitMs.set(ctx, performance.now() - t);
  }
  await direct(ctx, tv, life, kit, dish, o);
}

/** Skip the 特写 playing in this world to the last 1.2 s of 尝 (a second call ends it). No-op when none plays. */
export function skipPV(ctx: WorldCtx): void {
  runs.get(ctx)?.skip(false);
}

/** A 特写 is playing in this world. */
export function pvPlaying(ctx: WorldCtx): boolean {
  return runs.has(ctx);
}

async function direct(ctx: WorldCtx, tv: TaoyuanWorld, life: LifeApi, kit: DishKit, dish: DishId, o: PVOpts): Promise<void> {
  const TH = ctx.THREE;
  const eng = engine(ctx);
  const fx = tv.fx!;
  const d = DISHES[dish];
  const low = ctx.quality.level === 'low';
  const reduced = reducedMotion();
  const high = (ctx.quality.level === 'high' || ctx.quality.level === 'ultra') && !touchInput() && supportsBackdrop();
  const own: KindId | null = o.own ?? null;
  const shots = shotsFor(dish, { first: o.first, own: !!own, mode: o.mode, low, reduced, season: !!o.season });
  const cookName: Line = { zh: VILLAGERS[d.cook].zh, en: VILLAGERS[d.cook].en };
  /** The 亲手 line (the rare one when this good is rare), or null when the dish has none. */
  const ownLine = (): Line | null => (o.rare && d.ownRare ? d.ownRare : d.ownLine) ?? null;
  const me = CHARACTER[ctx.player.character];
  const meName: Line | null = me ? { zh: me.zh, en: me.en } : null;
  const noHand = ctx.player.character === 'cat';

  // ── the places: the cook's station, the walker's seat, the dish before them (world)
  const p0 = ctx.player.position;
  const h0 = ctx.player.heading;
  const place = o.at ?? null;
  const seatW = place ? { x: place.seat.x, z: place.seat.z } : { x: p0.x, z: p0.z };
  const faceW = place?.seatFace ?? (place ? { x: place.station.x, z: place.station.z } : { x: p0.x + Math.sin(h0), z: p0.z + Math.cos(h0) });
  const seatL = toLocal(seatW.x, seatW.z), faceL = toLocal(faceW.x, faceW.z);
  const dl = seatDish(seatL, faceL);
  const dishW = { ...W(dl.x, dl.z), y: Y_T + dl.y };
  const heading = Math.atan2(faceW.x - seatW.x, faceW.z - seatW.z);
  const propW = place ? (place.stationFace ?? { x: place.station.x, z: place.station.z }) : null;
  const topL = propW ? stationTop(toLocal(propW.x, propW.z)) : null;
  const stationW = topL ? { ...W(topL.x, topL.z), y: Y_T + topL.y } : null;
  const cookFace = place && propW ? norm(propW.x - place.station.x, propW.z - place.station.z) : norm(Math.sin(h0), Math.cos(h0));

  // ── the run
  const dom: PvDom = mountPvDom(ctx);
  life.defer(() => dom.close());
  life.defer(withTheme(ctx, 'quiet'));
  try { ctx.player.freeze(true); } catch { /* optional */ }
  let hand: T.Object3D | null = null;
  let kitState: 'station' | 'seat' | null = null;

  /** 「食单 · 新添一页」 has been shown (a first taste): in 尝, or — cut short by 出谷 — as it ends. */
  let paged = false;
  const newPage = () => {
    if (!o.first || paged) return;
    paged = true;
    try { ctx.hud.toast(NEW_PAGE.zh, NEW_PAGE.en, 3200); } catch { /* optional */ }
  };
  const run: Run = {
    dish, o, shots, i: 0, into: 0, gen: 0, t0: performance.now(), stage: 0, wake: null, timers: new Set(), placed: false,
    skip(ui) {
      if (run.stage === 2) return;
      if (ui && performance.now() - run.t0 < SKIP_AFTER * 1000) return;
      if (run.stage === 1) { run.end(); return; }
      run.stage = 1;
      const s = skipTo(shots);
      if (run.i > s.i || (run.i === s.i && elapsedIn() >= s.into)) return;
      run.i = s.i;
      run.into = s.into;
      run.gen++;
      clearTimers();
      const w = run.wake; run.wake = null; w?.();
    },
    end() {
      if (run.stage === 2) return;
      // (ended before 尝 said it: the page is still new)
      if (tv.isInside()) newPage();
      run.stage = 2;
      run.gen++;
      clearTimers();
      const w = run.wake; run.wake = null; w?.();
    },
  };
  runs.set(ctx, run);
  dom.skippable(() => run.skip(true));
  let shotT0 = performance.now();
  const elapsedIn = () => (performance.now() - shotT0) / 1000;
  const clearTimers = () => { for (const t of run.timers) clearTimeout(t); run.timers.clear(); };
  /** Something `secs` into the shot now playing (real time); dropped if the shot is left. */
  const at = (secs: number, fn: () => void) => {
    const gen = run.gen;
    const ms = Math.max(0, secs * 1000);
    const t = setTimeout(() => { run.timers.delete(t); if (run.gen === gen && run.stage !== 2) safe(fn); }, ms);
    run.timers.add(t);
  };
  /** A tween on the world clock (reduced motion: its end at once), dropped if the shot is left. */
  const tw = (secs: number, step: (k: number) => void) => {
    const gen = run.gen;
    void fx.tween(secs, (k) => { if (run.gen === gen && run.stage !== 2) safe(() => step(k)); });
  };
  const sleep = (ms: number) => new Promise<void>((r) => {
    const t = setTimeout(() => { run.timers.delete(t); if (run.wake === r) run.wake = null; r(); }, Math.max(0, ms));
    run.timers.add(t);
    run.wake = r;
  });

  const v = new TH.Vector3(), v2 = new TH.Vector3();
  const vessel = VESSELS[dish];
  const tool = TOOL[dish];
  const liquid = dish === 'taocha' ? '#d9a441' : dish === 'zisu' ? '#8a4f9a' : o.li ? '#f5f0e6' : '#ece4cc';

  /** The cook to the station and the walker to the seat (under the ink dip). */
  function settle(): void {
    if (run.placed) return;
    run.placed = true;
    if (place && stationW) {
      try { life.borrow(place.cook, { x: place.station.x, z: place.station.z, face: propW ?? undefined }); } catch { /* optional */ }
    }
    try { ctx.player.teleport(seatW.x, seatW.z, heading); } catch (e) { console.error('[walk] taoyuan 特写 seat', e); }
  }

  /** Where the cook holds up your good (亲手): out in front of her, at the chest. */
  function goodAt(p: NonNullable<typeof place>): V3 {
    return { x: p.station.x + cookFace.x * 0.42, y: p.station.y + 1.02, z: p.station.z + cookFace.z * 0.42 };
  }

  /** The kit at the station (起, 亲) or at the seat (落 on). */
  function kitAt(where: 'station' | 'seat'): void {
    if (where === 'station' && stationW) {
      kit.setDish(dish, { li: o.li, festival: o.festival, jar: dish === 'sunzu' });
      kit.pose({ x: stationW.x, y: stationW.y, z: stationW.z, yaw: Math.atan2(cookFace.x, cookFace.z), scale: 1.35 });
    } else {
      kit.setDish(dish, { li: o.li, festival: o.festival, stand: dl.stand });
      kit.pose({ x: dishW.x, y: dishW.y, z: dishW.z, yaw: heading + Math.PI, scale: 1 });
    }
  }

  /**
   * The shot's lens. The FOVs were set for landscape: on a portrait screen (a phone's 0.46 leaves about
   * 14° across at FOV 30) the close shots open the lens so the width seen is kept, up to 2.2× — the
   * camera stays where the clear-view check put it (standing further back ran it into the eaves).
   */
  function lensFor(s: Shot): number {
    if (s.at !== 'seat' && s.at !== 'station') return s.fov;
    const k = Math.min(2.2, Math.max(1, 1 / Math.max(0.1, ctx.camera.aspect || 1)));
    return k > 1 ? (2 * Math.atan(Math.tan((s.fov * DEG) / 2) * k)) / DEG : s.fov;
  }

  /** The camera: a cut to the shot's framing, then its push over what is left of it; the lens. */
  function film(s: Shot, secs: number): void {
    if (s.free) return;
    let subject: V3, facing: { x: number; z: number };
    let look: V3 | null = null;
    if (s.at === 'station' && stationW) {
      subject = kit.topWorld(v).clone();
      if (s.k === '亲' && place) subject = goodAt(place);
      facing = cookFace;
    } else if (s.at === 'walker' || s.at === 'wide' || (s.at === 'station' && !stationW)) {
      const p = ctx.player.position;
      subject = { x: p.x, y: p.y + 0.95, z: p.z };
      // (大橘 eats from the bench: frame him and his bowl together, from behind him and above the table's edge)
      if (noHand) subject = { x: (p.x + dishW.x) / 2, y: Math.max(p.y + 0.45, dishW.y + 0.12), z: (p.z + dishW.z) / 2 };
      facing = norm(Math.sin(ctx.player.heading), Math.cos(ctx.player.heading));
      if (s.at === 'wide') {
        const sq = ANCHORS.square;
        facing = norm(sq.x - p.x, sq.z - p.z);
        look = { x: sq.x, y: sq.y + 2.6, z: sq.z };
        subject = { x: p.x, y: p.y + 1.2, z: p.z };
      }
    } else {
      subject = kit.topWorld(v).clone();
      facing = norm(ctx.player.position.x - subject.x, ctx.player.position.z - subject.z);
    }
    const f = frameDish(tv, subject, facing, noHand && s.at === 'walker' ? { ...s, elev: 26, dist: 1.2, yaw: 160 } : s);
    const lk = look ?? f.look;
    const cam = ctx.camera;
    cam.position.set(f.to.x, f.to.y, f.to.z);
    cam.lookAt(lk.x, lk.y, lk.z);
    const to = look ? f.to : f.pushed;
    void eng.cinematic({ to, look: lk, secs: Math.max(0.05, secs), hold: 99 });
    eng.lens(lensFor(s));
    seeFocus.at = s.at === 'seat' || s.at === 'station' ? { x: subject.x, y: subject.y, z: subject.z } : null;
  }

  function sfx(k: NonNullable<Shot['sfx']>[number]): void {
    try {
      switch (k) {
        case 'bubble': snd.bubble(7); break;
        case 'steam': snd.steam(1.4); break;
        case 'sizzle': snd.sizzle(1.5); break;
        case 'pour': snd.pour(); break;
        case 'crack': snd.crack(); break;
        case 'lid': break; // (the lid's clack lands when it lifts)
        case 'swish': case 'pluck': case 'tick': case 'hiss': case 'clink': snd.pvTick(k); break;
        case 'knock': ctx.audio.knock(); break;
        case 'slurp': snd.slurp(); break;
        case 'crunch': snd.crunch(); break;
        case 'sip': snd.sip(d.taste === '酒' && !o.li); break;
        case 'chew': snd.bite(); break;
      }
    } catch { /* the sound is optional */ }
  }

  /** Enter shot `s`, `into` seconds already gone (a skip into 尝). */
  function enter(s: Shot, into: number, first: boolean): void {
    const secs = Math.max(0.05, s.secs - into);
    // (what the last shot left: the pour, the glints)
    kit.hideTube();
    kit.clearGlints();
    const cut = () => {
      if (s.k !== '开' && !run.placed) settle();
      if (s.at === 'station' && stationW) kitAt('station');
      else if (s.k !== '开' && s.k !== '外' && (s.at === 'seat' || s.k === '尝')) {
        if (kit.dish !== dish || !kit.group.visible || kitState !== 'seat') { kitAt('seat'); kitState = 'seat'; }
      }
      if (s.at === 'station') kitState = 'station';
      film(s, secs);
    };
    // how the cut is made: the 开 dip (the teleport under it), a reduced-motion crossfade, or a hard cut
    if (s.k === '开') {
      dom.bars(true);
      at(0.25, () => { void dom.dip(150, () => settle()); });
    } else if (reduced) {
      if (first) dom.bars(true);
      void dom.dip(first ? 200 : 250, cut);
    } else if (!run.placed) {
      // (the short cut, or a skip before the dip: the move to the seat under a quick dip)
      if (first) dom.bars(true);
      void dom.dip(150, cut);
    } else cut();
    if (s.ts !== undefined && !reduced) at(s.k === '题' && into === 0 ? 0.1 : 0, () => ctx.setTimeScale(s.ts!));
    // (尝's bite sound lands with the bite, 0.6 s in)
    if (into === 0 && s.k !== '尝') for (const k of s.sfx ?? []) sfx(k);
    beat(s, into, secs);
  }

  /** What moves in the shot (spec §4.1–4.3), and its words. */
  function beat(s: Shot, into: number, secs: number): void {
    const b = s.beat;
    const q = reduced ? 0.25 : 0; // (after a reduced-motion crossfade's darkest point)
    switch (s.k) {
      case '外':
        dom.season(o.season ? seasonLabel(o.season) : null);
        at(secs - 0.15, () => dom.season(null));
        return;
      case '起': {
        // (reduced motion with your own good: the held frames are too short for both lines, so the 亲手
        //  line takes VO 1's place, as it does at 低, and runs on through 亲)
        dom.sub(cookName, reduced && own && d.ownLine ? ownLine() : d.vo[0]);
        if ((reduced || low) && o.season) dom.season(seasonLabel(o.season));
        at(q, () => {
          kit.steamK = b === 'pour' || b === 'twocups' || b === 'third' || d.pv === '凉' ? (d.taste === '茶' ? 0.5 : 0) : 0.8;
          if (b === 'stir') stir(secs);
          else if (b === 'lid') lidLift(secs);
          else if (b === 'embers') sparks(secs);
          else if (b === 'pour' || b === 'twocups' || b === 'third') pour(b, secs);
          else if (b === 'seal') seal();
          else if (b === 'crack') sfx('crack');
        });
        return;
      }
      case '亲': {
        const ol = ownLine();
        if (ol) dom.sub(cookName, ol);
        at(q, () => holdUp(own));
        return;
      }
      case '落': {
        // (no stove shot — 低 — the cook's first line, or the 亲手 line, is said over the dish; else it carries on)
        const noQi = !shots.some((x) => x.k === '起');
        if (noQi) dom.sub(cookName, own && d.ownLine ? ownLine() : d.vo[0]);
        dom.season(noQi && o.season ? seasonLabel(o.season) : null);
        kit.hideTube();
        kit.setTool(null);
        kit.steamK = d.pv === '凉' || (d.pv === '饮' && d.taste !== '茶') ? 0 : d.pv === '饮' ? 0.5 : 1;
        if (!reduced) dom.inkBleed(low ? 0.6 : 1.2, low);
        land(b, secs);
        dom.ring(high);
        return;
      }
      case '题': {
        // VO 2 runs from here through 举 and into 尝 (about 4 s), so it can be read; the title card sits in
        // the right third, clear of the subtitle. Reduced motion: the line before it keeps 0.5 s more.
        if (reduced && shots.some((x) => x.k === '起' || x.k === '亲')) at(0.5, () => dom.sub(cookName, d.vo[1]));
        else dom.sub(cookName, d.vo[1]);
        dom.season(null);
        kit.steamK = d.pv === '凉' || (d.pv === '饮' && d.taste !== '茶') ? 0 : 0.9;
        dom.ring(high && !reduced);
        dom.warm(true);
        const tAt = reduced ? 0.12 : 0.15;
        at(tAt, () => dom.title({ name: { zh: d.zh, en: d.en }, caption: d.caption, seal: COOKS[d.cook].seal, rise: b === 'rise' && !reduced }));
        at(reduced ? 0.3 : o.mode === 'short' ? 0.6 : 0.9, () => { dom.seal(); sfx('knock'); });
        if (!low && !reduced) glints(secs);
        return;
      }
      case '举': {
        dom.sub(cookName, d.vo[1]);
        dom.title(null);
        dom.warm(true);
        lift(b, secs);
        return;
      }
      case '尝': {
        dom.title(null);
        dom.warm(false);
        dom.ring(false);
        dom.season(null);
        // (the cook's line stays until the reaction: cleared at once only on a skip into the tail)
        if (into > 0) dom.sub(null, null);
        kit.hideTube();
        kit.steamK = 0.4;
        // the bowl in the hand (大橘 eats from the bench: it stays where it was set)
        at(q, () => {
          if (!noHand) {
            const hnd = ctx.player.holdProp('bowl');
            if (hnd) {
              hand = hnd;
              hnd.updateMatrixWorld(true);
              const ws = hnd.getWorldScale(v2);
              kit.group.removeFromParent();
              hnd.add(kit.group);
              kit.group.position.set(0, 0.02 / Math.max(0.05, ws.y), 0.04 / Math.max(0.05, ws.z));
              kit.group.rotation.set(0, 0, 0);
              kit.group.scale.set(0.7 / Math.max(0.05, ws.x), 0.7 / Math.max(0.05, ws.y), 0.7 / Math.max(0.05, ws.z));
              kit.setTool(null);
              kit.steamK = 0.3;
            }
          }
          try { ctx.player.emote('eat'); } catch { /* optional */ }
        });
        const t0 = Math.max(0, 0.6 - into), t1 = Math.max(0.05, 1.0 - into);
        at(t0, () => { for (const k of s.sfx ?? []) sfx(k); });
        at(t1, () => {
          dom.sub(null, null);
          const line = o.react ?? null;
          if (line) { bubbles.get(ctx)?.(); const off = sayBubble(ctx, meName, line, d.taste, 2800); bubbles.set(ctx, off); }
          newPage();
        });
        if (dish !== 'taocha') at(Math.max(0, 0.2 - into), () => { try { snd.sting(dish, o.first); } catch { /* optional */ } });
        at(Math.max(0, secs - 0.3), () => dom.bars(false));
        return;
      }
      default:
    }
  }

  // ── the beats

  function stir(secs: number): void {
    kit.setTool('spoon');
    const r = vessel.topR * 0.45;
    tw(secs, (k) => {
      const a = k * Math.PI * 4;
      kit.tool.position.set(Math.cos(a) * r, vessel.topY + 0.02, Math.sin(a) * r);
      kit.tool.rotation.set(-0.9, a, 0);
    });
    at(0.6, () => sfx('bubble'));
  }

  function lidLift(secs: number): void {
    kit.setTool(vessel.kind === 'fu' ? 'fulid' : 'lid');
    const y0 = vessel.kind === 'steamer' ? 0.068 : 0.092;
    kit.tool.position.set(0, y0, 0);
    kit.steamK = 0.15;
    const t = Math.min(0.5, secs * 0.3);
    at(t, () => {
      try { snd.lid(); } catch { /* optional */ }
      if (!reduced) dom.whiteout(0.9);
      kit.steamK = 1.4;
      tw(0.5, (k) => {
        kit.tool.position.set(-0.03 * k, y0 + 0.16 * k, 0.02 * k);
        kit.tool.rotation.set(0.5 * k, 0, 0.3 * k);
      });
      at(0.9, () => { kit.steamK = 1; });
    });
  }

  function sparks(secs: number): void {
    const top = kit.topWorld(new TH.Vector3());
    const seeds = Array.from({ length: 6 }, (_, i) => ({ a: i * 1.05, r: 0.03 + (i % 3) * 0.02, s: 0.5 + (i % 2) * 0.4 }));
    tw(secs, (k) => {
      seeds.forEach((sd, i) => {
        const u = (k * (1.5 + sd.s) + i / 6) % 1;
        v2.set(top.x + Math.cos(sd.a) * sd.r, top.y + 0.02 + u * 0.28, top.z + Math.sin(sd.a) * sd.r);
        kit.glint(i, low ? null : v2, 0.03 * (1 - u), 0.9 * (1 - u), '#ffb45a');
      });
    });
    at(secs - 0.05, () => { for (let i = 0; i < 6; i++) kit.glint(i, null); });
    try { snd.sizzle(Math.min(2, secs)); } catch { /* optional */ }
  }

  function pour(kind: 'pour' | 'twocups' | 'third', secs: number): void {
    const from = place
      ? new TH.Vector3(place.station.x + cookFace.x * 0.28, place.station.y + 1.25, place.station.z + cookFace.z * 0.28)
      : kit.topWorld(new TH.Vector3()).add(new TH.Vector3(0, 0.5, 0));
    const into = (off: [number, number, number]) => {
      const p = new TH.Vector3(off[0], vessel.topY + off[1], off[2]);
      kit.group.updateMatrixWorld(true);
      return p.applyMatrix4(kit.group.matrixWorld);
    };
    const targets = kind === 'twocups' ? [into([0, 0, 0]), into([0.1, 0, 0.04])] : kind === 'third' ? [into([0.16, 0.02, 0.1])] : [into([0, 0, 0])];
    const each = secs / targets.length;
    targets.forEach((to, j) => {
      at(j * each, () => {
        try { snd.pour(); } catch { /* optional */ }
        tw(each, (k) => {
          const grow = Math.min(1, k / 0.3), thin = k > 0.85 ? (1 - k) / 0.15 : 1;
          kit.tubeAlong(from, to, { sag: -0.05, k: grow, r: 0.005 * Math.max(0.3, thin), color: kind === 'third' ? '#6b3a6a' : liquid, opacity: 0.8 });
          if (k >= 1) kit.hideTube();
        });
      });
    });
    if (reduced) kit.tubeAlong(from, targets[0], { sag: -0.05, k: 1, r: 0.005, color: liquid, opacity: 0.8 });
  }

  function seal(): void {
    [0.15, 0.45, 0.75].forEach((t, i) => at(t, () => {
      kit.paint(dish, {}, 'seal', i + 1);
      if (i === 0) sfx('crack');
    }));
    at(0.9, () => sfx('knock'));
    at(1.1, () => sfx('knock'));
  }

  function holdUp(kind: KindId | null): void {
    if (!place || !kind) return;
    // the good in the cook's raised hands (the kit's tool slot)
    kit.setGood(kind);
    const g = goodAt(place);
    const world = new TH.Vector3(g.x, g.y, g.z);
    kit.group.updateMatrixWorld(true);
    const local = kit.group.worldToLocal(world.clone());
    kit.tool.position.copy(local);
    kit.tool.rotation.set(0, Math.atan2(cookFace.x, cookFace.z), 0);
    tw(0.4, (k) => { kit.tool.position.y = local.y + 0.06 * Math.sin(k * Math.PI); });
  }

  function land(b: Shot['beat'], secs: number): void {
    // soft foods squash and settle
    if (!reduced && d.pv !== '饮') tw(0.3, (k) => kit.group.scale.set(1 + 0.06 * (1 - k), 1 - 0.05 * (1 - k), 1 + 0.06 * (1 - k)));
    if (b === 'sink') {
      tw(secs, (k) => { for (let i = 0; i < kit.base.length; i++) kit.placeMorsel(i, 0, -0.01 * k, 0, 1 - 0.15 * k, k * 0.4); });
    } else if (b === 'ripple') {
      const top = kit.topWorld(new TH.Vector3());
      tw(Math.min(0.9, secs), (k) => kit.glint(0, top, 0.02 + k * 0.1, 0.5 * (1 - k), '#ffffff'));
      if (kit.base.length) tw(0.5, (k) => kit.placeMorsel(0, 0, 0.06 * (1 - k), 0, 1, k));
      at(Math.min(0.9, secs), () => kit.glint(0, null));
    } else if (b === 'turn') {
      const mat = kit.top.material as T.MeshLambertMaterial;
      const c0 = new TH.Color('#9a78d8'), c1 = new TH.Color('#ffffff');
      mat.color.copy(c0);
      tw(1.2, (k) => mat.color.copy(c0).lerp(c1, k));
    } else if (b === 'flaps') {
      tw(0.8, (k) => {
        for (let i = 0; i < kit.base.length; i++) {
          const bb = kit.base[i];
          kit.placeMorsel(i, -bb.x * (1 - k), 0.03 * (1 - k), -bb.z * (1 - k), 1, 0, -1.2 * (1 - k));
        }
      });
    }
  }

  function glints(secs: number): void {
    const top = kit.topWorld(new TH.Vector3());
    const r = vessel.topR * 0.6;
    const pts = [0.4, 2.3, 4.4].map((a) => new TH.Vector3(top.x + Math.cos(a) * r, top.y + 0.004, top.z + Math.sin(a) * r));
    tw(secs, (k) => pts.forEach((p, i) => {
      const u = Math.max(0, Math.sin((k * 3 - i * 0.6) * Math.PI));
      kit.glint(i, p, 0.012 + u * 0.03, u * 0.9);
    }));
    at(secs - 0.05, () => { for (let i = 0; i < 3; i++) kit.glint(i, null); });
  }

  function lift(b: Shot['beat'], secs: number): void {
    const t = tool ?? 'chop';
    if (b === 'raise') {
      // the cup raised toward the lens (camera-relative)
      const cam = ctx.camera.position;
      const p0 = kit.group.position.clone();
      const dir = new TH.Vector3(cam.x - p0.x, 0, cam.z - p0.z).normalize();
      tw(0.42, (k) => kit.group.position.set(p0.x + dir.x * 0.1 * k, p0.y + 0.08 * k, p0.z + dir.z * 0.1 * k));
      return;
    }
    const m = kit.base[0];
    kit.setTool(t);
    const tipY = t === 'chop' ? 0 : 0.004;
    const mx = m ? m.x : 0, mz = m ? m.z : 0, my = m ? m.y : vessel.topY;
    kit.tool.position.set(mx, my + tipY, mz);
    kit.tool.rotation.set(t === 'chop' ? -0.35 : -0.2, 0.6, 0);
    if (b === 'strand') {
      kit.morsels.visible = false;
      const from = kit.topWorld(new TH.Vector3());
      tw(0.42, (k) => {
        kit.tool.position.set(mx, my + 0.12 * k, mz);
        kit.group.updateMatrixWorld(true);
        const tip = new TH.Vector3(mx, my + 0.12 * k, mz).applyMatrix4(kit.group.matrixWorld);
        kit.tubeAlong(from, tip, { sag: 0.004, k: 1, r: 0.0028, color: '#efe2c4', opacity: 1 });
      });
      return;
    }
    if (b === 'jiggle') {
      tw(0.12, (k) => { kit.tool.position.y = my + 0.03 * (1 - k); });
      at(0.15, () => tw(0.6, (k) => { if (m) kit.placeMorsel(0, 0, 0, 0, 1 + 0.08 * Math.sin(k * 18) * (1 - k), 0); }));
      return;
    }
    const lift = b === 'drip' ? 0.05 : 0.12;
    tw(0.42, (k) => {
      kit.tool.position.set(mx, my + lift * k + tipY, mz);
      if (m) kit.placeMorsel(0, 0, lift * k, 0, 1, 0);
    });
    if (b === 'flare' || b === 'drip' || b === 'crumb') {
      at(Math.min(secs * 0.45, 0.6), () => {
        kit.group.updateMatrixWorld(true);
        const p = new TH.Vector3(mx, my + lift, mz).applyMatrix4(kit.group.matrixWorld);
        const color = b === 'flare' ? '#ffcf7a' : b === 'drip' ? (dish === 'shengao' ? '#7a3a78' : '#f4efe0') : '#c98f3c';
        tw(b === 'drip' ? 0.5 : 0.25, (k) => kit.glint(3, v2.set(p.x, p.y - k * (lift + 0.02), p.z), 0.012, 0.9, color));
        if (b === 'flare') at(0.3, () => {
          kit.glint(3, null);
          const base = kit.topWorld(new TH.Vector3());
          for (let i = 0; i < 3; i++) kit.glint(4 + i, v2.set(base.x + (i - 1) * 0.03, base.y + 0.02, base.z), 0.08, 1, '#ffb45a');
          at(0.3, () => { for (let i = 0; i < 3; i++) kit.glint(4 + i, null); });
        });
      });
    }
    if (b === 'puff') at(0.3, () => { kit.steamK = 1.8; at(0.5, () => { kit.steamK = 0.9; }); });
  }

  // ── play the shots
  let first = true;
  try {
    while (run.i < shots.length && run.stage !== 2) {
      const s = shots[run.i];
      const into = run.into;
      run.into = 0;
      const gen = ++run.gen;
      shotT0 = performance.now() - into * 1000;
      enter(s, into, first);
      first = false;
      await sleep((s.secs - into) * 1000);
      if ((run.stage as number) === 2) break;
      if (run.gen !== gen) continue;
      run.i++;
    }
  } catch (e) {
    console.error('[walk] taoyuan 特写', e);
  } finally {
    run.stage = 2;
    clearTimers();
    runs.delete(ctx);
    // the kit back out of the hand, and away
    if (hand) { kit.group.removeFromParent(); ctx.regionGroup('taoyuan').add(kit.group); hand = null; }
    kit.hide();
    try { eng.endCinematic(); } catch { /* gone */ }
    // the walker steps back from the table: the seat is at its edge, and standing there (大橘 most of
    // all) they would be half inside it once the camera comes back
    if (run.placed && place && tv.isInside()) {
      const b = norm(seatW.x - faceW.x, seatW.z - faceW.z);
      try { ctx.player.teleport(seatW.x + b.x * 0.55, seatW.z + b.z * 0.55, heading); } catch { /* gone */ }
    }
    life.restore();
  }
}

const norm = (x: number, z: number) => { const n = Math.hypot(x, z) || 1; return { x: x / n, z: z / n }; };
const safe = (fn: () => void) => { try { fn(); } catch (e) { console.error('[walk] taoyuan 特写 beat', e); } };

// ───────────────────────────── the part

/**
 * The 特写's per-world part (life/index.ts mounts it): warm the dish kit's materials in tv.onBuilt,
 * dispose the kit on tv.onLeave, add `pv` to window.__tylife in DEV.
 */
export const mountPV: LifeMount = (bag, ctx, tv) => {
  let release: (() => void) | null = null;
  bag.onDispose(tv.onBuilt(() => {
    if (!release) release = warmDishMaterials(ctx);
  }));
  const drop = () => {
    runs.get(ctx)?.end();
    bubbles.get(ctx)?.();
    bubbles.delete(ctx);
    const k = kits.get(ctx);
    if (k) { kits.delete(ctx); k.dispose(); }
  };
  bag.onDispose(tv.onLeave(drop));
  bag.onDispose(() => { drop(); release?.(); release = null; });
  if (!import.meta.env.DEV) return {};
  return {
    dev: {
      /** Play a 特写 where you stand (DEV): `__tylife.pv('jishu', { first: true })`. Holds the life claim while it plays. */
      pv: async (dish: DishId, opts: Partial<PVOpts> = {}) => {
        const life = lifeOf(ctx);
        if (!life) return 'no life';
        const act = { kind: 'table' as const, leaving: async () => { skipPV(ctx); skipPV(ctx); return true; }, stop: () => { skipPV(ctx); skipPV(ctx); } };
        if (!life.claim(act)) return 'busy';
        try {
          await playPV(ctx, tv, dish, { first: true, own: null, mode: 'full', at: null, ...opts });
        } finally {
          life.release(act);
        }
        return 'ok';
      },
      pvShots: (dish: DishId, o: Partial<{ first: boolean; own: boolean; mode: 'full' | 'short' | 'none'; low: boolean; reduced: boolean; season: boolean }> = {}) =>
        shotsFor(dish, { first: true, own: false, mode: 'full', low: false, reduced: false, season: false, ...o }),
      pvKit: () => {
        const k = kits.get(ctx);
        return k ? { dish: k.dish, visible: k.group.visible, buildMs: kitMs.get(ctx) ?? null } : null;
      },
    },
  };
};
