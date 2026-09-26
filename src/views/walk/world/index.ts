// 入画 · Into the Painting — the world core. Builds the open world of map.ts in 3D: the sky, the far
// mountains, the land (terrain.ts, land.ts), the lake and the river (water.ts), bridges, what grows
// (scatter.ts), the walled garden with the half-acre pond and the user's own plants (region
// 'garden'), then the protagonist and the camera; hands a WorldCtx to every region module
// (regions/*) and feature (features/*). Region groups far from the player are hidden. Loaded
// lazily so three.js stays out of the main chunk.
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { FestivalKey, Hud, Interactable, InputState as CtxInput, QualityLevel, WorldCtx, WorldFeature } from '../types';
import { FEATURES, festivalsOn } from '../features';
import { REGION_MODULES } from '../regions';
import { allDecks, clearedAt, rectClearing, registerClearing } from '../regions/water-decks';
import { FACTORIES } from '../characters';
import type { CharacterModel } from '../characters/types';
import { ANCHORS, HOME_PLOT, REGION, REGIONS, WAYPOINTS, regionAt, type MusicTheme, type RegionId, type XZ } from '../map';
import { CHARACTER, type CharacterId } from '../../../data/characters';
import { activeHabits, refreshToday, state, toggleCheckin } from '../../../app/store';
import { play, record, unlockWaypoint, visitRegion, waypointOpen } from '../../../app/play';
import { music } from '../../../audio/music';
import { go } from '../../../app/router';
import { statsFor, type HabitStats } from '../../../core/habits';
import type { Habit, PlantKind } from '../../../core/types';
import { hashString, makeRng } from '../../../core/rng';
import { toLunar } from '../../../core/lunar';
import { moonInfo } from '../../../core/astro';
import { PIGMENTS } from '../../../ink/types';
import { PLANT_INFO } from '../../../ink/plants';
import { attributionZh, pickPoem } from '../../../data/poems';
import { audio } from '../../../audio/engine';
import { sceneEnv } from '../../garden/env';
import { Bag, nextFrame } from './kit';
import { SkySystem } from './sky';
import { buildMountains } from './mountains';
import { buildGround } from './ground';
import { buildArchitecture, buildGardenWall } from './architecture';
import { buildPond, NO_REFLECT } from './pond';
import { BURST_COLOR, buildJars, buildPlant, buildTablets, cnNum, freePlant, growPlant, interactRadius, plantCollider, releasePlantBitmaps, repaint, tickPlant, vigorFor, type PlantEntity, type TabletSpec } from './plants';
import { InkMarks } from './marks';
import { giftsOf, PlayerController, ScholarModel, type MoveInput, type Physics } from './player';
import { DriftingVerses, SongBirds } from './gifts';
import { Controls, type InputState, type ViewMode } from './controls';
import { PhotoRig, type PhotoApi } from './photo';
import { captureRatio, PHOTO_BUDGET, PHOTO_LONG_SIDE } from './photoMath';
import { buildAir, Bursts } from './particles';
import { buildFlora } from './flora';
import { terrain } from './terrain';
import { buildLand } from './land';
import { buildWater } from './water';
import { buildScatter } from './scatter';
import { createGrade } from './grade';
import { adaptPixelRatio, qualityProfile } from './quality';
import { bridgeSpecs, buildBridges, setBridgeReplaced } from './bridges';
import { Dust } from './fx';
import { buildSteles, type PlacedWaypoint, type Steles } from './waypoints';
import { arrivalAt, findSpot, lightReach, toLight } from './wayfind';
import { drum } from '../features/sfx';
import {
  GATE, LOOP, PAVILION, PAVILION_Y, POND, ROCKS, SPAWN, WALL, floorY, layoutPlants, polyAt, staticColliders, terrainY, walkableGround, wallPath, wallSegments, waterAt,
  type Circle, type PlantSlot,
} from './site';

export interface Prompt { labelZh: string; labelEn: string; actionZh: string; actionEn: string }

/** What the arrival banner shows. */
export interface Arrival { id: RegionId; zh: string; en: string; blurbZh: string; blurbEn: string; first: boolean }

export interface SayOpts { nameZh: string; nameEn: string; zh: string; en: string; choices?: { zh: string; en: string }[] }

export interface HudBridge extends Hud {
  prompt(p: Prompt | null): void;
  progress(f: number): void;
  /** A toast with one action (撤销 · Undo). */
  toastAction(zh: string, en: string, action: { zh: string; en: string; run: () => void }): void;
  /** The player walked into a place. */
  arrive(a: Arrival): void;
  /** Draw (true) or lift (false) the curtain for fast travel. */
  curtain(on: boolean): void;
  /** The player is held by a mini-game or a boat: the action button stays live for it. */
  frozen(on: boolean): void;
  /** The way of looking changed: over the shoulder, through the eyes, the photo camera. */
  camera?(mode: 'third' | 'first' | 'photo'): void;
  /** The mouse was locked to the view (first person on a desktop), or let go; `blocked`: this page may not lock it (look by dragging). */
  lock?(on: boolean, blocked?: boolean): void;
}

export interface WorldOptions {
  host: HTMLElement;
  lang: 'zh' | 'en';
  /** Preview one festival's easter egg (null = whatever today is). */
  festival: FestivalKey | null;
  time: 'now' | 'day' | 'night';
  /** Picture quality from Settings (低 / 中 / 高 / 身临其境). */
  quality?: QualityLevel;
  hud: HudBridge;
  cancelled(): boolean;
}

/** For the map screen. */
export interface WhereAmI { x: number; z: number; heading: number; region: RegionId | null }

export interface WorldHandle {
  input: InputState;
  act(): void;
  jump(): void;
  /** Use the character's skill (技). */
  skill(): void;
  /** While a card or sheet is open the keyboard does not walk. */
  setPaused(p: boolean): void;
  /** Where the player is (map screen). */
  where(): WhereAmI;
  /** Fast travel (驿站) to a place's waypoint stele (only a lit one). */
  travel(id: RegionId): Promise<void>;
  /** The waypoint steles as built (their real footing), and whether each is lit. */
  waypoints(): WaypointInfo[];
  /** Always run (the 疾 toggle); Shift inverts it while held. */
  setRun(on: boolean): void;
  /** Over the shoulder (第三人称) or through the walker's eyes (第一人称). */
  setView(v: ViewMode): void;
  /** 拍照: the free photo camera. */
  photo: PhotoApi;
  dispose(): void;
}

/** A waypoint for the map screen. */
export interface WaypointInfo { id: RegionId; x: number; z: number; zh: string; en: string; lit: boolean }

export class WebGLUnavailable extends Error {}

export { releasePlantBitmaps };

/** A solid prop on the land: the player walks round it (and, given a height, the camera never hides behind it). */
import type { Collider, Occluder } from '../types';
import { WENKAI_WALK_SAMPLE } from './font-sample';
export type { Collider, Occluder };

/** Colliders and occluders are now part of WorldCtx itself; kept as an alias for older call sites. */
export type WorldCtxCore = WorldCtx;

/** Where the ray from t to c first enters an upright cylinder, as a fraction of the way (null = never). */
function rayCylinder(tx: number, ty: number, tz: number, dx: number, dy: number, dz: number, o: Occluder): number | null {
  const ox = tx - o.x, oz = tz - o.z;
  const a = dx * dx + dz * dz;
  const c = ox * ox + oz * oz - o.r * o.r;
  let f0: number, f1: number;
  if (a < 1e-9) {
    if (c > 0) return null;
    f0 = 0; f1 = 1;
  } else {
    const b = 2 * (ox * dx + oz * dz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const q = Math.sqrt(disc);
    f0 = (-b - q) / (2 * a); f1 = (-b + q) / (2 * a);
  }
  f0 = Math.max(0, f0); f1 = Math.min(1, f1);
  if (f0 >= f1) return null;
  if (Math.abs(dy) < 1e-9) {
    if (ty < o.y0 || ty > o.y1) return null;
  } else {
    let g0 = (o.y0 - ty) / dy, g1 = (o.y1 - ty) / dy;
    if (g0 > g1) { const t = g0; g0 = g1; g1 = t; }
    f0 = Math.max(f0, g0); f1 = Math.min(f1, g1);
    if (f0 >= f1) return null;
  }
  return f0 <= 0.02 ? null : f0;
}

const WILD: { kind: PlantKind; seed: number }[] = [
  { kind: 'bamboo', seed: 71 }, { kind: 'orchid', seed: 5 }, { kind: 'pine', seed: 9 }, { kind: 'chrysanthemum', seed: 23 }, { kind: 'plum', seed: 41 },
];

/** Where fast travel sets you down in each place (on its approach path, facing in). */
const ARRIVE: Record<RegionId, { x: number; z: number; face: XZ; own?: true }> = {
  // (own: set down on this very spot, not beside the stele — here, before the moon gate looking in
  // through it, as on the first visit; beside the stele one faced the blank wall east of the gate)
  garden: { x: SPAWN.x, z: SPAWN.z, face: { x: 0, z: 0 }, own: true },
  village: { x: -1.5, z: 49, face: ANCHORS.villageSquare },   // under the 小桥流水 archway: the bridge and the town ahead
  lake: { x: 58, z: 31, face: ANCHORS.lakeIsland },
  bamboo: { x: -66, z: 29.5, face: ANCHORS.bambooClearing },
  plum: { x: -78, z: -56, face: ANCHORS.plumSummit },
  mountain: { x: 27.1, z: -87.6, face: ANCHORS.templeHall },   // before the temple gate
  home: { x: -34, z: -24, face: { x: -50, z: -24 } },           // at the homestead gate, looking in
};

/** What each picture quality means for the world's counts and distances: QUALITY_INFO in world/quality.ts, which refines the rest. */

/** How far beyond its radius a place stays drawn. */
const SHOW_MARGIN = 70;

function statsOf(h: Habit, day: string): HabitStats {
  return statsFor(h, state.value.checkins[h.id] ?? [], day);
}

function modelFor(id: CharacterId, reduced: boolean): CharacterModel {
  const f = FACTORIES[id];
  if (f) {
    try {
      return f(THREE, { palette: PIGMENTS as unknown as Record<string, string>, reduced });
    } catch (e) {
      console.error(`[walk] character "${id}" failed to build`, e);
    }
  }
  return new ScholarModel(reduced);
}

export async function createWorld(o: WorldOptions): Promise<WorldHandle> {
  const { host, hud, lang } = o;
  const bag = new Bag();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  // the picture quality (画面): everything that differs between 低 · 中 · 高 · 身临其境 (quality.ts)
  const qp = qualityProfile(o.quality ?? 'medium', { dpr: window.devicePixelRatio || 1, touch, cores });
  const lowEnd = qp.lowEnd;
  const dpr = qp.pixelRatio;

  // --- renderer
  let renderer: THREE.WebGLRenderer;
  try {
    // every frame goes through the grade (grade.ts), which multisamples or FXAAs its own target (WebGL2
    // is all three.js draws with now): the canvas's own antialias would be wasted memory. Only where
    // the grade steps aside (低, and low-end phones at 中) does the canvas smooth its edges itself.
    renderer = new THREE.WebGLRenderer({ antialias: qp.canvasAntialias, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (e) {
    throw new WebGLUnavailable(String(e));
  }
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // 身临其境: a real soft shadow from the sun or the moon (sky.ts follows the view with it)
  renderer.shadowMap.enabled = !!qp.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const W = () => Math.max(1, host.clientWidth), H = () => Math.max(1, host.clientHeight);
  renderer.setSize(W(), H());
  const cv = renderer.domElement;
  cv.className = 'walk-canvas';
  cv.setAttribute('aria-label', lang === 'zh' ? '入画：可行走的立体山水' : 'Into the Painting: a landscape you can walk in');
  cv.setAttribute('role', 'img');
  cv.style.touchAction = 'none';

  // every frame reaches the screen through the colour grade (grade.ts)
  const grade = createGrade(renderer, { mode: qp.grade, bloom: qp.bloom, depth: qp.depth, reduced });
  const disposeRenderer = () => {
    grade.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    cv.remove();
  };
  const bail = () => { bag.dispose(); disposeRenderer(); };
  const check = () => { if (o.cancelled()) { bail(); throw new Error('cancelled'); } };

  // --- the day
  const now = new Date();
  const day = refreshToday();
  const habits = [...activeHabits.value].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const stats = new Map(habits.map((h) => [h.id, statsOf(h, day)]));
  const clarity = habits.length ? habits.reduce((a, h) => a + stats.get(h.id)!.freshness, 0) / habits.length : 0.92;
  const base = sceneEnv(now, clarity, state.value.settings.location);
  if (o.time === 'day') { base.tod = 'day'; base.hour = 11; }
  if (o.time === 'night') { base.tod = 'night'; base.hour = 21.5; }
  const festivals: FestivalKey[] = o.festival ? [o.festival] : festivalsOn(now);
  const env = { ...base, date: now, festivals, timeMode: o.time };
  const aspect = W() / H();

  // --- scene & camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(aspect < 0.8 ? 62 : 50, aspect, 0.1, 600);
  camera.layers.enable(NO_REFLECT);
  const sky = new SkySystem(scene, bag, base.tod, base.hour, base.moonPhase, { distance: qp.distance, shadows: qp.shadows, halo: qp.halo, renderer });
  const mountains = buildMountains(bag);
  scene.add(mountains);
  hud.progress(0.06);
  await nextFrame();
  check();

  // --- the land of the whole world (baked once per session)
  terrain();
  hud.progress(0.14);
  await nextFrame();
  check();

  // --- one group per place; far ones are hidden
  const regionGroups = new Map<RegionId, THREE.Group>();
  const regionGroup = (id: RegionId): THREE.Group => {
    let g = regionGroups.get(id);
    if (!g) {
      g = new THREE.Group();
      g.name = 'region:' + id;
      scene.add(g);
      regionGroups.set(id, g);
    }
    return g;
  };
  for (const r of REGIONS) regionGroup(r.id);
  const garden = regionGroup('garden');

  const land = buildLand(bag, base.season, qp.landLod);
  land.warm();
  scene.add(land.group);
  hud.progress(0.22);
  await nextFrame();
  check();
  const openWater = buildWater(bag, reduced);
  scene.add(openWater.group);
  // the water town builds its own arched bridge and the lotus lake its moon bridge over the outlet
  const bridgeOwners: [string, RegionId][] = [['village', 'village'], ['outlet', 'lake']];
  const ownBridges = new Set(bridgeOwners.filter(([, r]) => REGION_MODULES.some((m) => m.id === r)).map(([b]) => b));
  const bridges = buildBridges(bag, ownBridges);
  bridges.traverse((o) => o.layers.set(NO_REFLECT));
  scene.add(bridges);
  const scatter = buildScatter(bag, base.season, reduced, qp.scatter, !!qp.shadows);
  scene.add(scatter.group);
  // the open country stays out of the pond's mirror (it would cost every draw twice)
  for (const g of [land.group, openWater.group, scatter.group]) g.traverse((o) => o.layers.set(NO_REFLECT));
  hud.progress(0.3);
  await nextFrame();
  check();

  // --- the garden: where everything goes
  const items = habits.length ? habits.map((h) => ({ key: h.id, kind: h.plant })) : WILD.map((w, i) => ({ key: 'wild' + i, kind: w.kind }));
  const slots = layoutPlants(items);
  const bySlot = new Map(slots.map((s) => [s.key, s]));
  const ground = buildGround(bag, slots, base.season);
  // the garden's ground and wall stay drawn from afar (the land has a hole where the lawn is)
  scene.add(ground.mesh);
  garden.add(ground.stones);
  const wall = buildGardenWall(bag, wallPath(), WALL.h, GATE.thick);
  scene.add(wall.group);
  const arch = buildArchitecture(bag);
  garden.add(arch.group);
  const flora = buildFlora(bag, slots, reduced, qp.info.density);
  garden.add(flora.group);
  scene.add(flora.mist);
  const pond = buildPond(bag, habits.length ? clarity : 0.92, { mirror: qp.mirror, reduced, w: W() * dpr, h: H() * dpr });
  garden.add(pond.group);
  // the reflection camera sees layer 0 only (no particles, ripples or shadows in the mirror)
  (pond.water.getReflectionCamera(camera) as THREE.Camera).layers.set(0);
  // from far off (another place's stele looking back at the garden) the pond is a sliver behind the
  // wall: its mirror keeps the last reflection rather than drawing the scene a second time
  const mirrorRender = pond.water.onBeforeRender;
  let mirrorOn = true;
  pond.water.onBeforeRender = function (...a: Parameters<typeof mirrorRender>) { if (mirrorOn || pond.force) mirrorRender.apply(this, a); };
  hud.progress(0.36);
  await nextFrame();

  // fonts for the tablets and the walk's own text, which has a WenKai file of its own (never wait long)
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "LXGW WenKai"', habits.map((h) => h.name).join('') + '此园尚空待种梅兰竹菊松荷' + WENKAI_WALK_SAMPLE), document.fonts.load('60px "Ma Shan Zheng"', '问月')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back to system fonts */ }
  check();

  // --- plants, one by one (each is a real ink painting)
  const plants: PlantEntity[] = [];
  const list = habits.length ? habits : null;
  const total = list ? list.length : WILD.length;
  for (let i = 0; i < total; i++) {
    const h = list ? list[i] : null;
    const key = h ? h.id : 'wild' + i;
    const slot = bySlot.get(key);
    if (!slot) continue;
    const st = h ? stats.get(h.id)! : null;
    const e = buildPlant(bag, {
      key, habit: h, kind: h ? h.plant : WILD[i].kind, seed: h ? h.seed : WILD[i].seed,
      growth: st ? st.growth : 0.72, vigor: st ? vigorFor(st.freshness) : 0.9,
    }, slot, lowEnd || qp.level === 'low');
    plants.push(e);
    garden.add(e.mesh);
    hud.progress(0.4 + 0.2 * ((i + 1) / total));
    await nextFrame();
    if (o.cancelled()) { bail(); throw new Error('cancelled'); }
  }

  if (import.meta.env.DEV && plants.length !== total) console.error('[walk] a habit has no plant', plants.length, total);
  // small things on the land stay out of the pond's mirror (each reflected mesh is a second draw)
  const jars = buildJars(bag, slots);
  jars.traverse((o) => o.layers.set(NO_REFLECT));
  garden.add(jars);

  // tablets with the habits' names, and the streak brushed small in the corner
  const noteFor = (st: HabitStats): string | null => {
    if (lang === 'zh') return st.streak > 1 ? `连${cnNum(st.streak)}日` : st.done ? `种${cnNum(st.done)}日` : null;
    return st.streak > 1 ? `${st.streak} days running` : st.done ? `${st.done} ${st.done === 1 ? 'day' : 'days'}` : null;
  };
  const tabletSpecs: TabletSpec[] = [];
  const tabletFor = new Map<string, number>();
  for (const e of plants) {
    if (!e.habit) continue;
    tabletFor.set(e.key, tabletSpecs.length);
    tabletSpecs.push({ ...e.slot.tablet, text: e.habit.name, glyph: PLANT_INFO[e.kind].zh, note: noteFor(stats.get(e.habit.id)!) });
  }
  let invite: { x: number; z: number } | null = null;
  if (!habits.length) {
    const p = polyAt(LOOP, 0.6);
    invite = { x: p.x - 1.3, z: p.z - 0.6 };
    tabletSpecs.push({ x: invite.x, z: invite.z, rot: 0.3, text: lang === 'zh' ? '此园尚空' : 'An empty garden', glyph: null });
  }
  const tablets = buildTablets(bag, tabletSpecs);
  tablets.group.traverse((o) => o.layers.set(NO_REFLECT));
  garden.add(tablets.group);
  const rebrush = (e: PlantEntity, st: HabitStats) => {
    const i = tabletFor.get(e.key);
    if (i === undefined) return;
    tabletSpecs[i].note = noteFor(st);
    tablets.rebrush(i, tabletSpecs[i]);
  };

  // ink on the ground: the bloom of each watering, and the damp patch of plants tended today
  const marks = new InkMarks(bag, reduced);
  garden.add(marks.group);
  const WET_R: Record<PlantKind, number> = { pine: 1.25, bamboo: 1.05, plum: 1.15, chrysanthemum: 0.75, orchid: 0.65, lotus: 0.85 };
  const markWet = (e: PlantEntity, st: HabitStats) => {
    if (e.slot.inWater) return;
    marks.setWet(e.key, e.slot.x, e.slot.z, st.doneToday, Math.min(1, st.streak / 21), WET_R[e.kind]);
  };
  for (const e of plants) if (e.habit) markWet(e, stats.get(e.habit.id)!);
  marks.settle();

  // --- the protagonist (whoever you walk as) and the camera
  let charId: CharacterId = play.peek().character;
  const player = new PlayerController(bag, SPAWN.x, floorY(SPAWN.x, SPAWN.z), SPAWN.z, SPAWN.heading, modelFor(charId, reduced));
  player.character = charId;
  player.gifts = giftsOf(CHARACTER[charId].ability);
  scene.add(player.root, player.shadowMesh);
  // 身临其境 draws real shadows: the painted blob stays only as a soft contact shadow
  if (renderer.shadowMap.enabled) player.blobK = 0.5;
  /** The surface this walker stands on: with the gift of 凌波, water holds you up. */
  const standY = (x: number, z: number) => {
    const f = floorY(x, z);
    if (!player.floats) return f;
    const w = waterAt(x, z);
    return w === null ? f : Math.max(f, w + 0.02);
  };
  player.floorAt = standY;
  const controls = new Controls(cv, camera, SPAWN.heading, reduced);
  // the photo camera stays within reach of the walker and out of the water
  controls.walker = player.position;
  controls.waterAt = waterAt;
  controls.onLock = (on, blocked) => hud.lock?.(on, blocked);
  if (controls.lockBlocked) hud.lock?.(false, true);
  const camY = () => player.eyeHeight;
  const camTarget = new THREE.Vector3();
  const camFollow = (dt: number, snap = false) => {
    const p = player.position;
    camTarget.set(p.x, p.y + camY() - 0.95, p.z);
    // first person looks out from the walker's eyes, near the top of the head
    controls.eye.set(p.x, p.y + Math.min(2.2, Math.max(0.5, player.model.height * 0.92)), p.z);
    controls.grounded = player.grounded;
    controls.running = player.running;
    controls.update(dt, camTarget, player.heading, player.speed, floorY, snap);
  };
  player.onTeleport = () => camFollow(0, true);
  // keep the camera on the player's side of the walls (the moon gate's round opening is fine)
  const walls = wallSegments();
  const gateOcclusion = (tx: number, ty: number, tz: number, cx: number, cy: number, cz: number) => {
    if (Math.abs(tx) > 40 || Math.abs(tz) > 40) return 1;
    const zw = GATE.z;
    const pad = GATE.thick / 2 + 0.3;
    const side = Math.sign(tz - zw) || 1;
    if ((cz - zw) * side > pad) return 1;
    const zStop = zw + side * pad;
    const f = (zStop - tz) / (cz - tz || 1e-6);
    if (f >= 1 || f <= 0) return 1;
    const x = tx + (cx - tx) * f, y = ty + (cy - ty) * f;
    if (Math.abs(x) > GATE.halfW + 0.3 || y > GATE.top + 0.3) return 1;
    if (Math.hypot(x, y - GATE.holeY) < GATE.holeR - 0.35 && Math.abs(tz - zw) < 2) return 1;
    return Math.max(0.08, f);
  };
  /** The long garden wall: where the view ray first crosses it below its top (fraction), else 1. */
  const wallOcclusion = (tx: number, ty: number, tz: number, cx: number, cy: number, cz: number) => {
    if (tx * tx + tz * tz > 45 * 45) return 1;
    let best = 1;
    const dx = cx - tx, dz = cz - tz;
    for (let i = 2; i < walls.length; i++) {
      const [ax, az, bx, bz] = walls[i];
      const ex = bx - ax, ez = bz - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const f = ((ax - tx) * ez - (az - tz) * ex) / den;
      const u = ((ax - tx) * dz - (az - tz) * dx) / den;
      if (f <= 0 || f >= best || u < 0 || u > 1) continue;
      const y = ty + (cy - ty) * f;
      if (y < terrainY(ax + ex * u, az + ez * u) + WALL.h + 0.35) best = Math.max(0.08, f - 0.4 / (Math.hypot(dx, dz) || 1));
    }
    return best;
  };
  controls.occlusion = (tx, ty, tz, cx, cy, cz) => Math.min(gateOcclusion(tx, ty, tz, cx, cy, cz), wallOcclusion(tx, ty, tz, cx, cy, cz));
  camFollow(0, true);

  const air = buildAir(bag, base.season, base.tod === 'night', reduced, 1, qp.particles);
  if (air) scene.add(air.points);
  const bursts = new Bursts(bag, 1);
  scene.add(bursts.points);
  // dust at the walker's feet: running strides, take-offs, landings
  const dust = new Dust(bag, reduced);
  scene.add(dust.points);
  player.reduced = reduced;
  player.onStride = () => { if (!reduced) dust.stride(player.position.x, player.position.y, player.position.z, player.heading); };
  player.onJump = (kind) => { if (kind === 'ground') dust.takeoff(player.position.x, player.position.y, player.position.z); };
  player.onLand = (impact) => {
    const p = player.position;
    // a landing on water is a splash, not a puff
    if (!player.floats || waterAt(p.x, p.z) === null || floorY(p.x, p.z) > (waterAt(p.x, p.z) ?? -99) + 0.05) dust.land(p.x, p.y, p.z, impact);
    else bursts.drops(p.x, p.y + 0.3, p.z, 12);
    // a soft thump, louder for a harder landing
    try { drum(Math.min(0.32, 0.05 + impact * 0.035)); } catch { /* no sound */ }
  };
  // the pixel ratio actually in use: lowered step by step if frames run long (see the loop)
  let pr = dpr;
  const setPx = () => {
    const px = (H() * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (air) (air.points.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
    (bursts.points.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
    dust.setPx(px);
  };
  setPx();

  // --- collisions (regions and features add their props through addCollider)
  /** A prop's footprint, and (given a height) its top in world y: above that the walker steps over it. */
  type Solid = Circle & { top?: number };
  const colliders: Solid[] = [...staticColliders()];
  for (const e of plants) {
    const c = plantCollider(e);
    if (c) colliders.push(c);
  }
  for (const t of tabletSpecs) colliders.push({ x: t.x, z: t.z, r: 0.3 });
  const walkHere = (x: number, z: number) => walkableGround(x, z) || (player.floats && x * x + z * z < 172 * 172);
  /** resolve()'s answer: one array, reused (read it at once). */
  const resolved: [number, number] = [0, 0];
  const out = (x: number, z: number): readonly [number, number] => { resolved[0] = x; resolved[1] = z; return resolved; };
  const resolve = (x: number, z: number, r: number, fx: number, fz: number, feetY = -Infinity): readonly [number, number] => {
    const nearGarden = x * x + z * z < 40 * 40;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const dx = x - c.x, dz = z - c.z, m = c.r + r;
        if (dx > m || dx < -m || dz > m || dz < -m) continue;
        // on top of it (or clearing it in a jump): walk along the wall top, over the crate
        if (c.top !== undefined && c.top <= feetY + 0.03) continue;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < m && d > 1e-6) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
      }
      if (!nearGarden) continue;
      for (const [ax, az, bx, bz] of walls) {
        const sx = bx - ax, sz = bz - az;
        const tt = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz)));
        const cx = ax + sx * tt, cz = az + sz * tt;
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), m = GATE.thick / 2 + r;
        if (d < m) {
          if (d > 1e-6) { x = cx + (dx / d) * m; z = cz + (dz / d) * m; }
          else { x = fx; z = fz; }
        }
      }
    }
    if (!walkHere(x, z)) {
      if (walkHere(x, fz)) return out(x, fz);
      if (walkHere(fx, z)) return out(fx, z);
      return out(fx, fz);
    }
    return out(x, z);
  };
  const nearWall = (x: number, z: number, m: number) => {
    if (x * x + z * z > 40 * 40) return false;
    for (const [ax, az, bx, bz] of walls) {
      const sx = bx - ax, sz = bz - az;
      const tt = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz)));
      if (Math.hypot(x - ax - sx * tt, z - az - sz * tt) < m) return true;
    }
    return false;
  };
  // a little clearance round every trunk, stone, tablet and wall, so nothing is set down inside another
  const isWalkable = (x: number, z: number) => walkableGround(x, z, 0.1) && !nearWall(x, z, 0.7) && !colliders.some((c) => Math.abs(x - c.x) < c.r + 0.5 && Math.hypot(x - c.x, z - c.z) < c.r + 0.45);

  // --- the companions' gifts that live in the world: the qin player's listeners, the poet's verses
  const songBirds = new SongBirds(bag, floorY, isWalkable);
  scene.add(songBirds.mesh);
  const verses = new DriftingVerses(bag);
  verses.setPoem(pickPoem({ season: base.season, salt: hashString('poet:' + day) }).lines);
  scene.add(verses.group);
  const QIN = [[0, 2, 4, 5, 4, 2, 1, 0], [4, 5, 7, 5, 4, 2, 4], [2, 4, 5, 7, 9, 7, 5, 4], [7, 5, 4, 2, 0, 2, 4]];
  let qinN = 0;
  /** 琴师 plays: a phrase on the qin, and the birds come down to listen. */
  const playQin = () => {
    if (player.busy || player.isFrozen) return;
    player.emote('play');
    const phrase = QIN[qinN++ % QIN.length];
    phrase.forEach((d, i) => later(260 + i * (i === phrase.length - 1 ? 330 : 300), () => audio.pluck(d, i === phrase.length - 1 ? 0.75 : 0.5 + (i % 2) * 0.12)));
    const p = player.position;
    songBirds.call(p.x, p.z, clock, 9);
    for (let i = 0; i < 4; i++) later(300 + i * 600, () => bursts.sparks(p.x, p.y + 0.9, p.z, '#dfe6d8', 6));
    if (qinN === 1) later(1400, () => hud.toast('琴声一起，鸟儿都飞来听了', 'At the first notes, the birds come down to listen', 2800));
  };
  let stillFor = 0;

  // --- what the camera must never hide behind: tall rocks, the pavilion roof, big props
  const occluders: Occluder[] = [];
  for (const r of ROCKS) if (r.h >= 0.9) { const y = terrainY(r.x, r.z); occluders.push({ x: r.x, z: r.z, r: r.w * 0.5, y0: y - 0.2, y1: y + r.h }); }
  occluders.push({ x: PAVILION.x, z: PAVILION.z, r: PAVILION.r + 0.55, y0: PAVILION_Y + 2.3, y1: PAVILION_Y + 4.2 });
  const addOccluder = (o: Occluder) => {
    const c = { ...o };
    occluders.push(c);
    return () => { const i = occluders.indexOf(c); if (i >= 0) occluders.splice(i, 1); };
  };
  const addCollider = (c0: Collider) => {
    const c: Solid = { x: c0.x, z: c0.z, r: Math.max(0.05, c0.r) };
    const h = c0.h !== undefined && Number.isFinite(c0.h) && c0.h > 0 ? c0.h : 0;
    // its top, from the surface it stands on now (the ground, or a quay it was set on)
    if (h > 0) c.top = floorY(c.x, c.z) + h;
    colliders.push(c);
    let offOcc: (() => void) | null = null;
    if (h >= 0.9) {
      const y = floorY(c.x, c.z);
      offOcc = addOccluder({ x: c.x, z: c.z, r: c.r * 0.9, y0: y - 0.1, y1: y + h });
    }
    return () => {
      const i = colliders.indexOf(c);
      if (i >= 0) colliders.splice(i, 1);
      offOcc?.();
      offOcc = null;
    };
  };
  const walled = controls.occlusion!;
  controls.occlusion = (tx, ty, tz, cx, cy, cz) => {
    let f = walled(tx, ty, tz, cx, cy, cz);
    const dx = cx - tx, dy = cy - ty, dz = cz - tz;
    const len = Math.hypot(dx, dy, dz) || 1;
    for (const o of occluders) {
      if (Math.abs(o.x - tx) > 14 + o.r || Math.abs(o.z - tz) > 14 + o.r) continue;
      const hit = rayCylinder(tx, ty, tz, dx, dy, dz, o);
      if (hit !== null) f = Math.min(f, Math.max(0.08, hit - 0.3 / len));
    }
    return f;
  };

  // --- interactables
  const interactables = new Set<Interactable>();
  /** A plant can be reached at its trunk or at its name tablet, whichever is nearer. */
  const alsoAt = new Map<Interactable, { x: number; z: number }>();
  let nearest: Interactable | null = null;
  /** What the prompt shows now: the thing and its labels as they were (an interactable may relabel itself). */
  const shown = { it: null as Interactable | null, qin: false, labelZh: '', labelEn: '', actionZh: '', actionEn: '' };
  const addInteractable = (i: Interactable) => {
    interactables.add(i);
    return () => {
      interactables.delete(i);
      alsoAt.delete(i);
      if (nearest === i) nearest = null;
    };
  };
  const t0 = performance.now();
  let admireSalt = 0;
  const labelFor = (h: Habit, st: HabitStats) => ({
    labelZh: `《${h.name}》· ${st.streak > 0 ? `连续 ${st.streak} 日` : st.done ? `已种 ${st.done} 日` : '新种'}`,
    labelEn: `“${h.name}” · ${st.streak > 0 ? `${st.streak}-day streak` : st.done ? `${st.done} days tended` : 'newly planted'}`,
    actionZh: st.doneToday ? '赏' : '浇水',
    actionEn: st.doneToday ? 'Admire' : 'Water',
  });
  for (const e of plants) {
    const h = e.habit;
    if (!h) continue;
    const tIdx = tabletFor.get(e.key)!;
    const at = e.slot.inWater ? new THREE.Vector3(tabletSpecs[tIdx].x, 0, tabletSpecs[tIdx].z) : new THREE.Vector3(e.slot.x, 0, e.slot.z);
    at.y = floorY(at.x, at.z);
    const it: Interactable = {
      id: 'plant:' + h.id,
      position: at,
      radius: e.slot.inWater ? 2.1 : interactRadius(e.kind),
      ...labelFor(h, stats.get(h.id)!),
      act: () => {
        const st = statsOf(h, refreshToday());
        if (!st.doneToday) water(e, h, it);
        else admire(e, h, st);
      },
    };
    addInteractable(it);
    if (!e.slot.inWater) alsoAt.set(it, { x: tabletSpecs[tIdx].x, z: tabletSpecs[tIdx].z });
  }
  const relabel = (it: Interactable, h: Habit) => Object.assign(it, labelFor(h, statsOf(h, refreshToday())));

  const lookTogether = (e: PlantEntity) => {
    const mid = e.baseY + Math.min(1.6, (e.topY() - e.baseY) * 0.45);
    controls.frame(player.position.x, player.position.z, e.slot.x, e.slot.z, Math.max(player.position.y + 0.8, mid));
  };
  const water = (e: PlantEntity, h: Habit, it: Interactable) => {
    player.face(e.slot.x, e.slot.z);
    lookTogether(e);
    player.emote('water');
    const x = e.slot.x, z = e.slot.z;
    const top = Math.max(e.baseY + 0.9, e.topY());
    bursts.drops(x, top + 0.4, z, 30);
    record('water');
    // the gardener's gift: a shower of petals and a little extra sparkle
    const grow = CHARACTER[player.character].ability.kind === 'grow';
    // the check-in is recorded at once; the painting catches up a moment later
    if (!toggleCheckin(h.id)) toggleCheckin(h.id);
    const st = statsOf(h, refreshToday());
    relabel(it, h);
    if (!e.slot.inWater) later(180, () => marks.bloom(x, z, e.slot.jar ? 1.3 : WET_R[e.kind] * 1.7));
    later(420, () => {
      growPlant(e, st.growth, vigorFor(st.freshness), reduced);
      markWet(e, st);
      rebrush(e, st);
      audio.chime(st.streak);
      bursts.petals(x, e.baseY + (top - e.baseY) * 0.75, z, BURST_COLOR[e.kind], grow ? 60 : 24);
      if (grow) later(380, () => { bursts.petals(x, top + 0.3, z, BURST_COLOR[e.kind], 30); bursts.drops(x, top + 0.8, z, 16); });
      if (e.slot.inWater) { pond.ripple(x, z, 1.3); later(300, () => pond.ripple(x + 0.3, z - 0.2, 0.8)); }
      hud.toastAction(
        `《${h.name}》浇过了 · 连续 ${st.streak} 日`,
        `Watered “${h.name}” · ${st.streak}-day streak`,
        {
          zh: '撤销', en: 'Undo',
          run: () => {
            const s0 = statsOf(h, refreshToday());
            if (s0.doneToday) toggleCheckin(h.id);
            const s1 = statsOf(h, refreshToday());
            repaint(e, s1.growth, vigorFor(s1.freshness));
            relabel(it, h);
            markWet(e, s1);
            rebrush(e, s1);
          },
        },
      );
    });
  };

  const admire = (e: PlantEntity, h: Habit, st: HabitStats) => {
    player.face(e.slot.x, e.slot.z);
    lookTogether(e);
    player.emote('bow');
    record('admire');
    audio.pluck(2, 0.7);
    later(260, () => audio.pluck(4, 0.5));
    const info = PLANT_INFO[e.kind];
    const poem = pickPoem({ plant: e.kind, term: base.termIndex, salt: hashString(h.id + day) + admireSalt++ });
    bursts.petals(e.slot.x, e.baseY + (e.topY() - e.baseY) * 0.7, e.slot.z, BURST_COLOR[e.kind], 8);
    hud.showCard({
      titleZh: `《${h.name}》`,
      titleEn: `“${h.name}”`,
      bodyZh: `${poem.lines.join('\n')}\n——${attributionZh(poem)}\n\n${info.zh}，${info.virtueZh}。\n已种 ${st.done} 日 · 连续 ${st.streak} 日 · 最长 ${st.best} 日`,
      bodyEn: `${poem.en}\n— ${poem.authorEn}\n\n${info.en}: ${info.virtueEn}.\n${st.done} days tended · ${st.streak}-day streak · best ${st.best}`,
      seal: info.zh,
    });
  };

  // the empty garden invites you to plant
  if (invite) {
    addInteractable({
      id: 'invite', position: new THREE.Vector3(invite.x, floorY(invite.x, invite.z), invite.z), radius: 2.2,
      labelZh: '此园尚空', labelEn: 'The garden is still empty', actionZh: '去种一株', actionEn: 'Plant one',
      act: () => go('garden'),
    });
  }
  // 问月亭: ask the moon
  addInteractable({
    id: 'pavilion', position: new THREE.Vector3(PAVILION.x, PAVILION_Y, PAVILION.z), radius: 1.6,
    labelZh: '问月亭', labelEn: 'Ask-the-Moon Pavilion', actionZh: '问月', actionEn: 'Ask the moon',
    act: () => {
      player.face(PAVILION.x, PAVILION.z - 20);
      player.emote('bow');
      audio.bell();
      record('admire');
      const m = moonInfo(new Date());
      const lu = toLunar(new Date());
      const poem = pickPoem({ theme: 'moon', season: base.season, salt: hashString(day) + admireSalt++ });
      hud.showCard({
        titleZh: `${lu.monthName}${lu.dayName} · ${m.zh}`,
        titleEn: `${m.en} · lunar ${lu.month}/${lu.day}`,
        bodyZh: `${poem.lines.join('\n')}\n——${attributionZh(poem)}`,
        bodyEn: `${poem.en}\n— ${poem.authorEn}`,
        seal: '月',
      });
    },
  });

  // --- frame hooks for regions and features
  const frameFns = new Set<(dt: number, t: number) => void>();
  const onFrame = (fn: (dt: number, t: number) => void) => {
    frameFns.add(fn);
    return () => void frameFns.delete(fn);
  };

  // --- where the player is: places, arrival, music
  let region: RegionId | null = regionAt(player.position.x, player.position.z);
  const regionFns = new Set<(id: RegionId | null) => void>();
  const onRegion = (fn: (id: RegionId | null) => void) => {
    regionFns.add(fn);
    return () => void regionFns.delete(fn);
  };
  let themeOverride: MusicTheme | null | undefined;
  const themeFor = (): MusicTheme => {
    if (sky.isNight()) return 'night';
    const r = region ?? lastPlace;
    if (env.festivals.length && (r === 'garden' || r === 'village')) return 'festival';
    return REGION[r].theme;
  };
  let lastPlace: RegionId = region ?? 'garden';
  let themeNow: MusicTheme | null = null;
  const applyTheme = () => {
    const want = themeOverride !== undefined ? themeOverride : themeFor();
    if (want === themeNow) return;
    themeNow = want;
    try { music.setTheme(want); } catch (e) { console.warn('[walk] music', e); }
  };
  const worldMusic = {
    /**
     * A feature's request holds until it hands the music back: by passing null, the place's own theme
     * (whatever the hour or the day makes of it) or what is playing anyway, or by calling release().
     */
    setTheme(theme: MusicTheme | null) {
      const place = REGION[region ?? lastPlace].theme;
      themeOverride = theme === null || theme === place || theme === themeFor() ? undefined : theme;
      applyTheme();
    },
    release() {
      themeOverride = undefined;
      applyTheme();
    },
  };
  const enter = (id: RegionId | null, announce: boolean) => {
    region = id;
    if (id) {
      lastPlace = id;
      const first = !play.peek().flags[`visit:${id}`];
      try { visitRegion(id); } catch (e) { console.warn('[walk] visit', e); }
      const r = REGION[id];
      if (announce) hud.arrive({ id, zh: r.zh, en: r.en, blurbZh: r.blurbZh, blurbEn: r.blurbEn, first });
    }
    applyTheme();
    for (const fn of regionFns) {
      try { fn(id); } catch (err) { console.error('[walk] region listener failed', err); }
    }
  };
  /** With a little hysteresis: leaving a place takes a few steps past its edge. */
  const trackRegion = () => {
    const p = player.position;
    const at = regionAt(p.x, p.z);
    if (at === region) return;
    if (at === null && region) {
      const r = REGION[region];
      if (Math.hypot(p.x - r.center.x, p.z - r.center.z) < r.radius * 1.5) return;
    }
    enter(at, at !== null);
  };

  // --- the player's input, for mini-games (rowing a boat, casting a line)
  const ctxInput = { x: 0, y: 0, run: false, actionPressed: false, jumpPressed: false, skillPressed: false };
  // the walker's input and its world, one object each (nothing is allocated per frame)
  const moveIn: MoveInput = { x: 0, z: 0, run: false, jump: false };
  const physics: Physics = { floorY: standY, resolve, built: (x, z) => floorY(x, z) > terrainY(x, z) + 0.01 };
  // the world's clock can be slowed (棋士's 推演): features and the walker get the scaled dt
  let timeScale = 1, timeScaleWant = 1;

  const hudApi: Hud = {
    toast: hud.toast,
    setCounter: hud.setCounter,
    showCard: hud.showCard,
    mount: hud.mount,
    say: hud.say,
    skill: hud.skill,
  };

  const ctx: WorldCtxCore = {
    THREE, scene, camera, renderer,
    groundY: floorY,
    isWalkable,
    pond: { center: new THREE.Vector3(POND.x, POND.waterY, POND.z), radiusX: POND.rx, radiusZ: POND.rz, waterY: POND.waterY },
    // features dress the walled garden: keep them well inside its wall
    bounds: { radius: 21 },
    player,
    env,
    addInteractable,
    addCollider,
    addOccluder,
    hud: hudApi,
    audio,
    rng: makeRng(hashString('walk:' + day)),
    onFrame,
    sky,
    palette: PIGMENTS,
    lang,
    input: ctxInput as CtxInput,
    currentRegion: () => region,
    onRegion,
    regionGroup,
    waterAt,
    anchor: (a: XZ) => {
      const w = waterAt(a.x, a.z);
      const g = terrainY(a.x, a.z);
      return new THREE.Vector3(a.x, w === null ? g : Math.max(g, w), a.z);
    },
    music: worldMusic,
    quality: qp.info,
    cameraMode: () => controls.mode,
    frameCamera(x: number, z: number, y: number, secs?: number) {
      controls.frame(player.position.x, player.position.z, x, z, y, secs);
    },
    setTimeScale(f: number) {
      timeScaleWant = Number.isFinite(f) ? Math.max(0.05, Math.min(1, f)) : 1;
    },
  };

  let playerMirrored = true;
  // --- who you walk as follows the choice made in the character picker
  const disposeCharacter = effect(() => {
    const id = play.value.character;
    if (id === charId) return;
    charId = id;
    const model = modelFor(id, reduced);
    player.setModel(model, id, giftsOf(CHARACTER[id].ability));
    // the next check puts the new model on the right layer
    player.root.traverse((o) => o.layers.set(0));
    playerMirrored = true;
    player.emote('bow');
    // off the water if the new walker cannot stand on it: judged by the new walker's own gifts, since
    // a skill's float (嫦娥's 奔月) is still set this tick and only ends on the skills' next frame
    if (!player.gifts.float && !walkableGround(player.position.x, player.position.z)) {
      const a = ARRIVE[lastPlace];
      player.teleport(a.x, a.z, Math.atan2(a.face.x - a.x, a.face.z - a.z));
    }
  });

  // --- the loop
  let raf = 0;
  let last = performance.now();
  let running = true;
  let paused = false;
  let traveling = false;
  /** While the world is still being dressed (behind the loading screen) the loop steps but does not draw. */
  let warming = true;
  // real frame times (ms), for the adaptive pixel ratio and the DEV readout
  const deltas = new Float32Array(120);
  let nDeltas = 0;
  let adaptAt = qp.adapt.after; // past the start-up hitches (shader compiles, regions dressing the world)
  const frameStats = () => {
    const n = Math.min(nDeltas, deltas.length);
    if (!n) return { median: 0, p90: 0, n: 0 };
    const a = Array.from(deltas.subarray(0, n)).sort((x, y) => x - y);
    return { median: a[Math.floor(n * 0.5)], p90: a[Math.min(n - 1, Math.floor(n * 0.9))], n };
  };
  const adapt = (t: number) => {
    if (t < adaptAt || nDeltas < qp.adapt.samples) return;
    adaptAt = t + qp.adapt.every;
    const { median } = frameStats();
    const next = adaptPixelRatio(qp, pr, median);
    if (next !== pr) {
      pr = next;
      renderer.setPixelRatio(pr);
      renderer.setSize(W(), H());
      grade.setSize(W(), H());
      pond.setSize(W() * pr, H() * pr);
      setPx();
      nDeltas = 0;
      if (import.meta.env.DEV) console.info(`[walk] frames at ${median.toFixed(0)} ms: pixel ratio → ${pr}`);
    }
  };
  const camPos = new THREE.Vector3();
  let frameNo = 0;
  /**
   * Show the places near the player, hide the far ones (their groups and interactables). A far place
   * keeps its landmarks (children with userData.landmark = true: a pagoda, a tall gate) drawn out to
   * the fog's edge, as a faint silhouette on the skyline.
   */
  const near = new Map<RegionId, boolean>();
  const hiddenFar = new Map<RegionId, Set<THREE.Object3D>>();
  const stream = () => {
    const p = player.position;
    // measured from the walker and from the camera, whichever is nearer: the photo camera roams up
    // to PHOTO_RADIUS from the walker (and settles back from there), and a place it looks into is drawn
    const c = camera.position;
    const fogFar = sky.fog.far;
    for (const r of REGIONS) {
      const g = regionGroups.get(r.id)!;
      const d = Math.min(Math.hypot(p.x - r.center.x, p.z - r.center.z), Math.hypot(c.x - r.center.x, c.z - r.center.z));
      const isNear = d < r.radius + SHOW_MARGIN * qp.distance;
      near.set(r.id, isNear);
      const hid = hiddenFar.get(r.id);
      if (isNear) {
        if (hid) { for (const c of hid) c.visible = true; hiddenFar.delete(r.id); }
        g.visible = true;
        continue;
      }
      g.visible = d < r.radius + fogFar && holdsLandmark(g);
      if (!g.visible) continue;
      // only the landmarks stay: hide the rest (and remember what we hid, to show it again)
      const set = hid ?? new Set<THREE.Object3D>();
      hideAllBut(g, set);
      hiddenFar.set(r.id, set);
    }
  };
  function holdsLandmark(o: THREE.Object3D): boolean {
    let found = false;
    o.traverse((c) => { if (c !== o && c.userData.landmark === true) found = true; });
    return found;
  }
  /** Hide everything under `o` except its landmarks (at any depth) and what leads down to them. */
  function hideAllBut(o: THREE.Object3D, set: Set<THREE.Object3D>): void {
    for (const c of o.children) {
      if (c.userData.landmark === true) continue;
      if (holdsLandmark(c)) { hideAllBut(c, set); continue; }
      if (c.visible) { c.visible = false; set.add(c); }
    }
  }
  // --- waypoint steles (驿碑): one per place (built once the places have dressed themselves)
  let steles: Steles | null = null;
  const placed: PlacedWaypoint[] = [];
  const placedById = new Map<RegionId, PlacedWaypoint>();
  const steleSpots: { id: RegionId; x: number; z: number; r: number }[] = [];
  const isLit = (id: string) => waypointOpen(play.peek(), id);
  /** Light the stele the walker has reached (and any that another tab or a flag opened meanwhile). */
  const checkWaypoints = () => {
    if (!steles) return;
    for (const w of placed) if (isLit(w.id)) steles.light(w.id, false);
    if (traveling || player.isFrozen) return;
    const p = player.position;
    const w = toLight(p.x, p.z, steleSpots, isLit);
    if (!w) return;
    if (!unlockWaypoint(w.id)) return;
    steles.light(w.id, true);
    const at = steles.lanternAt(w.id);
    if (at) {
      bursts.sparks(at.x, at.y, at.z, '#ffc46b', 28);
      later(260, () => bursts.sparks(at.x, at.y + 0.2, at.z, '#ffe2a8', 18));
    }
    audio.chime(5);
    later(420, () => audio.pluck(4, 0.55));
    later(700, () => audio.pluck(7, 0.45));
    hud.toast('驿站已通 · 可在舆图中传送', 'Waypoint lit · you can travel here from the map', 3600);
  };
  const regionOf = new Map<Interactable, RegionId | null>();
  let frozenShown = false;
  /**
   * Keep what the places and the features put up out of the pond's mirror (each reflected mesh is a
   * second draw): the far places whole, and whatever joined the scene or the garden after the core
   * built it — a feature's props, crowds, festival things, a skill's effects — unless it is marked
   * userData.reflect (a lantern by the water, a boat on it: that whole branch is left as it is).
   * Run once the places are dressed, again after the features, and now and then (things come later).
   */
  let coreTop: Set<THREE.Object3D> | null = null;
  let gardenTop: Set<THREE.Object3D> | null = null;
  const unmirrorBranch = (o: THREE.Object3D) => {
    if (o.userData.reflect) return;
    if (o.layers.isEnabled(0)) o.layers.set(NO_REFLECT);
    for (const c of o.children) unmirrorBranch(c);
  };
  const unmirror = () => {
    for (const [id, g] of regionGroups) {
      if (id !== 'garden') { for (const c of g.children) unmirrorBranch(c); continue; }
      if (gardenTop) for (const c of g.children) if (!gardenTop.has(c)) unmirrorBranch(c);
    }
    if (coreTop) for (const c of scene.children) if (!coreTop.has(c) && !c.name.startsWith('region:')) unmirrorBranch(c);
  };
  /** The world's own clock: it slows with setTimeScale (the camera and the HUD keep real time). */
  let clock = 0;
  /** The lens widens a little while running (the world rushes past). */
  let baseFov = camera.fov, fovKick = 0;

  // --- 拍照 · the photo camera (photo.ts). A photograph is one frame rendered at a raised pixel ratio
  // through the colour grade and copied out at once, before the canvas reaches the screen; then the
  // pixel ratio, the grade's targets and the point sizes are put back. The pond's mirror keeps its
  // size (the reflection is sampled through its own projection, so it lines up at any resolution, and
  // resizing it would throw away the reflection it holds) and is redrawn for both frames, whatever
  // its frame-skipping (低) or its far-off gate would do.
  const grabPhoto = (): HTMLCanvasElement | null => {
    if (!running || warming) return null;
    const w = W(), h = H();
    const gl = renderer.getContext();
    const maxDim = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
    const want = captureRatio(w, h, pr, PHOTO_LONG_SIDE[qp.level], maxDim, touch ? PHOTO_BUDGET.touch : PHOTO_BUDGET.desk);
    const prev = pr;
    const usePr = (r: number) => {
      pr = r;
      renderer.setPixelRatio(r);
      renderer.setSize(w, h);
      grade.setSize(w, h);
      setPx();
    };
    let out: HTMLCanvasElement | null = null;
    pond.force = true;
    try {
      // (on a desk, 身临其境's shadows twice as fine for the one frame: a photograph is looked at closely)
      if (!touch) sky.shadowFine(true);
      if (want !== prev) usePr(want);
      grade.render(scene, camera);
      out = document.createElement('canvas');
      out.width = cv.width;
      out.height = cv.height;
      const g = out.getContext('2d');
      if (g) g.drawImage(cv, 0, 0);
      else out = null;
    } catch (e) {
      console.warn('[walk] photo capture failed', e);
      out = null;
    } finally {
      if (pr !== prev) usePr(prev);
      sky.shadowFine(false);
      try { grade.render(scene, camera); } catch { /* the next frame draws it */ }
      pond.force = false;
      // the capture's long frame says nothing about the device: the adaptive pixel ratio counts afresh
      nDeltas = 0;
      adaptAt = (performance.now() - t0) / 1000 + qp.adapt.every + 1;
    }
    return out;
  };
  const photo = new PhotoRig({
    controls, player, sky, reduced,
    // not while travelling or while a game, a boat or the building holds the walker (a skill's own
    // mount stands still for the picture)
    allowed: () => running && !warming && !traveling && (!player.isFrozen || player.heldBySkill),
    grab: grabPhoto,
    place: () => { const r = REGION[region ?? lastPlace]; return { zh: r.zh, en: r.en }; },
    fovChanged: () => {
      // back from the photo camera: the lens the walk uses now (the screen may have turned meanwhile)
      if (!photo.active) { camera.fov = baseFov + fovKick; camera.updateProjectionMatrix(); }
      setPx();
    },
    entered: () => stream(),
  });
  // 身临其境 and the photo camera: the shadows' square goes round the ground the view centre falls on
  // (marched along the view), not below the camera — which may hang 40 m up — and widens a little
  // with the camera's height, so a bird's-eye frame keeps its shadows under a low sun as well
  const shadowAim = { at: new THREE.Vector3(), reach: 1 };
  const aimDir = new THREE.Vector3();
  /** The ground or the water, whichever the view meets first. */
  const surfaceY = (x: number, z: number) => Math.max(floorY(x, z), waterAt(x, z) ?? -Infinity);
  const aimShadows = () => {
    if (!photo.active || !qp.shadows) return null;
    const p = camera.position;
    camera.getWorldDirection(aimDir);
    const below = surfaceY(p.x, p.z);
    if (!Number.isFinite(below)) return null;
    const lift = Math.max(0, p.y - below);
    let hit = -1;
    if (aimDir.y < -0.01) {
      for (let s = 0, st = 0.5; s < 140; st = Math.min(6, st * 1.3)) {
        s += st;
        const x = p.x + aimDir.x * s, z = p.z + aimDir.z * s;
        if (p.y + aimDir.y * s <= surfaceY(x, z)) { hit = s; break; }
      }
    }
    const hz = Math.hypot(aimDir.x, aimDir.z);
    const ext = qp.shadows.extent;
    // (looking over the land: a little ahead, as when walking; never so far the near ground goes bare)
    const d = Math.min(ext * 1.1, hit > 0 ? hit * hz : ext * 0.45 + lift * 0.5);
    const fx = hz > 1e-4 ? aimDir.x / hz : 0, fz = hz > 1e-4 ? aimDir.z / hz : 0;
    const x = p.x + fx * d, z = p.z + fz * d;
    const y = surfaceY(x, z);
    shadowAim.at.set(x, Number.isFinite(y) ? y : below, z);
    shadowAim.reach = 1 + Math.max(0, lift - 4) / 40;
    return shadowAim;
  };
  let modeShown: 'third' | 'first' | 'photo' = 'third';
  let walkerShown = true;
  let ghostModel: unknown = null;
  // 身临其境, through the eyes: the walker is not seen but still casts its sun shadow. Its meshes (and
  // what it holds) draw with shadow-only twins of their materials — the same kind of material, so the
  // shadow pass treats them as before, writing neither colour nor depth — and get their own back after.
  // (A twin per material, not the material itself: a character's materials are shared.)
  let ghostOn = false;
  const ghostMats = new Map<THREE.Material, THREE.Material>();
  const ghosted = new Map<THREE.Mesh, { own: THREE.Material | THREE.Material[]; twin: THREE.Material | THREE.Material[] }>();
  const twinOf = (m: THREE.Material) => {
    let g = ghostMats.get(m);
    if (!g) {
      g = bag.add(m.clone());
      g.colorWrite = false;
      g.depthWrite = false;
      ghostMats.set(m, g);
    }
    return g;
  };
  const ghostWalker = (on: boolean) => {
    if (on) {
      // (again now and then: a new character, or something newly held)
      player.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.material) return;
        const e = ghosted.get(m);
        if (e && m.material === e.twin) return;
        const twin = Array.isArray(m.material) ? m.material.map(twinOf) : twinOf(m.material);
        ghosted.set(m, { own: m.material, twin });
        m.material = twin;
      });
    } else {
      for (const [m, e] of ghosted) if (m.material === e.twin) m.material = e.own;
      ghosted.clear();
    }
  };
  const step = (rawDt: number, _realT: number) => {
    frameNo++;
    // ease toward the wanted pace over about a third of a second, never overshooting
    timeScale += (timeScaleWant - timeScale) * Math.min(1, rawDt * 7);
    if (Math.abs(timeScale - timeScaleWant) < 0.005) timeScale = timeScaleWant;
    // (a photograph may stop the world's clock: photo.ts eases it to a standstill)
    const dt = rawDt * timeScale * photo.timeK(rawDt);
    clock += dt;
    const t = clock;
    const mv = controls.move();
    const inp = controls.input;
    ctxInput.x = controls.intent.x;
    ctxInput.y = controls.intent.y;
    ctxInput.run = controls.intent.run;
    ctxInput.actionPressed = inp.actQueued && !paused;
    ctxInput.jumpPressed = inp.jumpQueued && !paused;
    // no skills while held by a game or a boat, travelling or behind a card (a skill's own mount,
    // Red Hare, still hears the key: it is how you get off)
    ctxInput.skillPressed = inp.skillQueued && !paused && (!player.isFrozen || player.heldBySkill) && !traveling;
    inp.skillQueued = false;
    moveIn.x = mv.x; moveIn.z = mv.z; moveIn.run = mv.run;
    moveIn.jump = inp.jumpQueued && !paused && !player.isFrozen;
    player.update(photo.walkerDt(rawDt, dt), moveIn, physics);
    inp.jumpQueued = false;
    // through the eyes only while nothing else carries or holds the walker (a game, a boat, a horse,
    // the homestead's building, travel): the view steps aside meanwhile and comes back after
    controls.firstAllowed = !player.isFrozen && !traveling;
    camFollow(rawDt);
    // through the eyes the (hidden) body faces where one looks, so a skill, a cast or a sword's qi
    // goes that way too, not where the last step happened to turn it
    if (controls.throughEyes && !photo.active && !player.isFrozen && !traveling) {
      const h = Math.atan2(-Math.sin(controls.yaw), -Math.cos(controls.yaw));
      player.face(player.position.x + Math.sin(h), player.position.z + Math.cos(h));
      player.heading = h;
      player.root.rotation.y = h;
    }
    // the walker hides from its own eyes (its shadow and what it holds too); in a photograph it shows unless hidden
    const show = photo.active ? photo.walkerShown : !(controls.fp > 0.05 && camera.position.distanceTo(controls.eye) < 0.9);
    // (with real shadows, the body hidden from its own eyes stays as a shadow: see ghostWalker)
    const ghost = !show && !photo.active && renderer.shadowMap.enabled;
    if (show !== walkerShown || ghost !== ghostOn) {
      walkerShown = show;
      if (ghost !== ghostOn) { ghostOn = ghost; ghostWalker(ghost); }
      player.root.visible = show || ghost;
      player.shadowMesh.visible = show;
    } else if (ghostOn && (frameNo % 4 === 0 || player.model !== ghostModel)) { ghostModel = player.model; ghostWalker(true); }
    const mode = controls.mode;
    if (mode !== modeShown) { modeShown = mode; hud.camera?.(mode); }
    if (!photo.active) {
      const kick = !reduced && player.running && player.speed > 3.4 && !player.isFrozen ? 5 : 0;
      const f0 = fovKick;
      fovKick += (kick - fovKick) * Math.min(1, rawDt * (kick > fovKick ? 2.2 : 3.5));
      if (Math.abs(fovKick - f0) > 0.01) { camera.fov = baseFov + fovKick; camera.updateProjectionMatrix(); }
    }
    dust.update(dt);
    // (the hour of a photograph turns at its own pace, even with the world's clock stopped)
    sky.update(photo.active ? rawDt : dt, camera, aimShadows());
    grade.setLight({ night: sky.night01, tint: sky.tint });
    camPos.copy(camera.position);
    mountains.follow(camPos);
    flora.mist.position.set(camPos.x, 0, camPos.z);
    const far = sky.fog.far;
    land.update(camPos, far);
    scatter.update(t, camPos, sky.tint, far);
    openWater.update(t, sky.fogColor, sky.night01);
    wall.setNight(sky.night01);
    if (frameNo % 12 === 1) {
      stream();
      trackRegion();
      applyTheme();
      checkWaypoints();
      dust.setTint(sky.tint, sky.night01);
      if (coreTop && frameNo % 96 === 1) unmirror();
      // (the photo camera may frame the garden from afar: its mirror stays live while it is on screen —
      // the mirror only draws when the water itself is drawn)
      mirrorOn = Math.hypot(camera.position.x - POND.x, camera.position.z - POND.z) < (photo.active ? 120 : 50);
      // the walker shows in the pond only when near it (a character can be dozens of draws)
      const mirrored = Math.hypot(player.position.x - POND.x, player.position.z - POND.z) < 16;
      if (mirrored !== playerMirrored) {
        playerMirrored = mirrored;
        player.root.traverse((o) => o.layers.set(mirrored ? 0 : NO_REFLECT));
      }
    }
    if (near.get('garden')) {
      for (const e of plants) tickPlant(e, dt, t, camPos, sky.tint, reduced);
      for (const f of tablets.faces) (f.material as THREE.MeshBasicMaterial).color.copy(sky.tint);
      arch.setNight(sky.night01, t);
      flora.update(t, sky.tint, sky.fogColor);
      // jade by day, indigo by night (the sky's own water colour)
      pond.update(dt, t, sky.waterColor, sky.night01);
      marks.update(dt, sky.night01);
    } else flora.update(t, sky.tint, sky.fogColor);
    if (air) air.update(t, camPos, sky.night01);
    bursts.update(dt, t);
    songBirds.update(dt, t, player.position.x, player.position.z);
    verses.update(dt, player.character === 'poet' && player.speed > 0.8 && !player.isFrozen, player.position.x, player.position.y, player.position.z, player.heading, sky.night01, camPos);
    steles?.update(dt, t, sky.night01);
    for (const fn of frameFns) {
      try { fn(dt, t); } catch (err) { console.error('[walk] frame hook failed', err); frameFns.delete(fn); }
    }
    // the nearest thing to do (things in hidden places do not prompt)
    let best: Interactable | null = null, bd = Infinity;
    const px = player.position.x, pz = player.position.z;
    for (const i of interactables) {
      let d = Math.hypot(i.position.x - px, i.position.z - pz);
      const alt = alsoAt.get(i);
      if (alt) d = Math.min(d, Math.hypot(alt.x - px, alt.z - pz));
      if (d >= i.radius || d >= bd || Math.abs(i.position.y - player.position.y) >= 3) continue;
      let rid = regionOf.get(i);
      if (rid === undefined) { rid = regionAt(i.position.x, i.position.z); regionOf.set(i, rid); }
      if (rid && !near.get(rid)) continue;
      best = i; bd = d;
    }
    nearest = player.isFrozen || traveling ? null : best;
    if (player.isFrozen !== frozenShown) { frozenShown = player.isFrozen; hud.frozen(frozenShown); }
    // the qin player, standing still with nothing else to do, may play
    stillFor = player.speed < 0.2 ? stillFor + dt : 0;
    const qin = !nearest && !player.isFrozen && !traveling && stillFor > 1.2 && !player.busy && CHARACTER[player.character].ability.kind === 'music';
    const n = nearest;
    const wantQin = !n && qin;
    if (n !== shown.it || wantQin !== shown.qin || (n && (n.labelZh !== shown.labelZh || n.labelEn !== shown.labelEn || n.actionZh !== shown.actionZh || n.actionEn !== shown.actionEn))) {
      shown.it = n; shown.qin = wantQin;
      shown.labelZh = n?.labelZh ?? ''; shown.labelEn = n?.labelEn ?? ''; shown.actionZh = n?.actionZh ?? ''; shown.actionEn = n?.actionEn ?? '';
      hud.prompt(n ? { labelZh: n.labelZh, labelEn: n.labelEn, actionZh: n.actionZh, actionEn: n.actionEn }
        : wantQin ? { labelZh: '琴师 · 古琴', labelEn: 'Qin Player · guqin', actionZh: '抚琴', actionEn: 'Play' } : null);
    }
    if (inp.actQueued) {
      inp.actQueued = false;
      if (!paused && !player.isFrozen) doAct();
    }
  };
  const doAct = () => {
    const i = nearest;
    if (!i) {
      if (CHARACTER[player.character].ability.kind === 'music') playQin();
      return;
    }
    player.face(i.position.x, i.position.z);
    try {
      const r = i.act();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((err) => console.error('[walk] action failed', err));
    } catch (err) {
      console.error('[walk] action failed', err);
    }
  };
  const frame = (nowMs: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const raw = Math.max(0, nowMs - last);
    // a long stall (tab switch, GC) must not fling the player; a slow device still walks in real time
    const dt = Math.min(0.1, raw / 1000);
    last = nowMs;
    if (raw > 0 && raw < 2000) deltas[nDeltas++ % deltas.length] = raw;
    const t = (nowMs - t0) / 1000;
    step(dt, t);
    if (warming) return;
    grade.render(scene, camera);
    adapt(t);
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (running && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => {
    const w = W(), h = H();
    renderer.setSize(w, h);
    grade.setSize(w, h);
    camera.aspect = w / h;
    baseFov = w / h < 0.8 ? 62 : 50;
    camera.fov = baseFov + fovKick;
    camera.updateProjectionMatrix();
    pond.setSize(w * pr, h * pr);
    setPx();
  });

  /**
   * Compile the shaders of everything under `root` a piece at a time (and wait for each program to
   * link), so the loading bar moves and the page stays alive instead of one long freeze at the first
   * frame; with KHR_parallel_shader_compile the linking even runs in the background.
   */
  const warmed = new WeakSet<THREE.Material>();
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  const warm = async (roots: THREE.Object3D[], from: number, to: number) => {
    const parts: THREE.Object3D[] = [];
    for (const r of roots) {
      if (r.name.startsWith('region:')) parts.push(...r.children);
      else parts.push(r);
    }
    let yielded = performance.now();
    for (let i = 0; i < parts.length && running; i++) {
      try {
        if (parallel) await renderer.compileAsync(parts[i], camera, scene);
        else renderer.compile(parts[i], camera, scene);
        // link now (a program's first use is where WebGL blocks), a piece at a time
        if (!parallel) parts[i].traverse((o) => {
          const m = (o as THREE.Mesh).material;
          if (!m) return;
          for (const x of Array.isArray(m) ? m : [m]) {
            if (warmed.has(x)) continue;
            warmed.add(x);
            (renderer.properties.get(x) as { currentProgram?: { getUniforms(): unknown } }).currentProgram?.getUniforms();
          }
        });
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[walk] warm', e);
      }
      hud.progress(from + ((to - from) * (i + 1)) / parts.length);
      if (performance.now() - yielded > 30) { await nextFrame(); yielded = performance.now(); }
    }
  };

  // first frame: settle the sky & camera, then show
  stream();
  land.update(camera.position, sky.fog.far);
  step(1, 0);
  host.appendChild(cv);
  ro.observe(host);
  await warm(scene.children, 0.6, 0.7);
  check();
  grade.render(scene, camera);
  raf = requestAnimationFrame(frame);
  enter(region, false);

  // --- fast travel (驿站): the curtain falls, the player is set down at the stele, it lifts
  const travel = async (id: RegionId) => {
    if (traveling || !running) return;
    // (on a skill's mount — 关公's 赤兔 — he simply swings down: the ride(null) below sets him on
    // his feet, and the skill sees he is off and lets the horse go)
    if (player.isFrozen && !player.heldBySkill) { hud.toast('此刻不便远行，先把手头的事做完。', 'Not now — finish what you are doing here first.'); return; }
    if (!isLit(id)) { hud.toast('那处驿站尚未到访：循路走到驿碑前，点亮它的灯。', 'Not yet visited: walk to its waypoint stele and light the lantern first.'); return; }
    traveling = true;
    try {
      hud.curtain(true);
      await new Promise((r) => later(reduced ? 120 : 520, () => r(null)));
      if (!running) return;
      player.ride(null);
      player.freeze(false);
      const a = ARRIVE[id];
      const w = placedById.get(id);
      let x = a.x, z = a.z, heading: number;
      if (w && !a.own) {
        // a step in front of the stele, looking into the place
        const at = arrivalAt({ x: w.sx, z: w.sz }, a.face, isWalkable);
        x = at.x; z = at.z; heading = at.heading;
      } else {
        // never set down in the water or inside a prop
        for (let k = 0; k < 24 && !isWalkable(x, z); k++) { const ang = k * 2.4; x = a.x + Math.cos(ang) * (1 + k * 0.4); z = a.z + Math.sin(ang) * (1 + k * 0.4); }
        heading = Math.atan2(a.face.x - x, a.face.z - z);
      }
      player.teleport(x, z, heading);
      controls.yaw = heading + Math.PI;
      camFollow(0, true);
      stream();
      trackRegion();
      await nextFrame();
      await new Promise((r) => later(reduced ? 60 : 180, () => r(null)));
      hud.curtain(false);
    } finally {
      traveling = false;
    }
  };

  // --- the places dress themselves (regions/*), then the features (they decide whether today is theirs)
  const builtRegions: typeof REGION_MODULES = [];
  for (let i = 0; i < REGION_MODULES.length; i++) {
    const m = REGION_MODULES[i];
    if (!running) break;
    builtRegions.push(m);
    const started = Promise.resolve().then(() => m.build(ctx)).catch((err) => {
      console.error(`[walk] region "${m.id}" failed to build`, err);
    });
    await Promise.race([started, new Promise((r) => setTimeout(r, 6000))]);
    const at = 0.7 + (0.18 * i) / REGION_MODULES.length;
    hud.progress(at + 0.06 / REGION_MODULES.length);
    // its shaders now, behind the loading screen, not as a stall the first time you walk there
    await warm([regionGroup(m.id)], at + 0.06 / REGION_MODULES.length, at + 0.18 / REGION_MODULES.length);
  }
  // the water town brought its own bridge: the core's stand-in deck steps aside
  for (const b of bridgeSpecs()) {
    if (ownBridges.has(b.id)) setBridgeReplaced(b.id, allDecks().some((d) => Math.hypot(d.cx - b.x, d.cz - b.z) < 9));
  }
  // nothing grows through the quays, paving and stairs the places just built, nor on the homestead's
  // plot (the owner builds there)
  const P2 = HOME_PLOT.size / 2 + 1.5;
  const offPlot = registerClearing(rectClearing(HOME_PLOT.x - P2, HOME_PLOT.z - P2, HOME_PLOT.x + P2, HOME_PLOT.z + P2));
  if (running) scatter.clear(clearedAt);
  // the waypoint steles, on firm, level ground clear of what the places built and off the paths' tread
  if (running) {
    try {
      await Promise.race([document.fonts.load('60px "Ma Shan Zheng"', WAYPOINTS.map((w) => w.zh).join('') + '驿'), new Promise((r) => setTimeout(r, 1200))]);
    } catch { /* system fonts */ }
    const T = terrain();
    // the plot itself, and the approach to its gate (a stele must never stand in the way in)
    const G = HOME_PLOT.gate;
    const onPlot = (x: number, z: number) => (Math.abs(x - HOME_PLOT.x) < HOME_PLOT.size / 2 + 1.2 && Math.abs(z - HOME_PLOT.z) < HOME_PLOT.size / 2 + 1.2)
      || (x > G.x - 1 && x < G.x + 6.5 && Math.abs(z - G.z) < 2.4);
    const test = {
      walkable: (x: number, z: number) => isWalkable(x, z) && !onPlot(x, z) && floorY(x, z) < terrainY(x, z) + 0.05 && !clearedAt(x, z, 0.3),
      height: floorY,
      pathDist: (x: number, z: number) => T.pathNear(x, z).d,
    };
    for (const w of WAYPOINTS) {
      const spot = findSpot(w.x, w.z, test) ?? { x: w.x, z: w.z, moved: 0 };
      if (import.meta.env.DEV && spot.moved > 0) console.info(`[walk] waypoint "${w.id}" moved ${spot.moved.toFixed(1)} m to (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)})`);
      // the stele faces the road it stands beside (or its place, off the roads)
      let fx = REGION[w.id].center.x, fz = REGION[w.id].center.z, bd = 14;
      for (const list of T.paths) for (const q of list) {
        const d = Math.hypot(q.x - spot.x, q.z - spot.z);
        if (d < bd) { bd = d; fx = q.x; fz = q.z; }
      }
      const pw: PlacedWaypoint = { ...w, sx: spot.x, sz: spot.z, y: floorY(spot.x, spot.z), rot: Math.atan2(fx - spot.x, fz - spot.z) };
      placed.push(pw);
      placedById.set(w.id, pw);
      // walking the road past it lights it (a roadside stele stands a few steps off the tread)
      steleSpots.push({ id: w.id, x: spot.x, z: spot.z, r: lightReach(test.pathDist(spot.x, spot.z)) });
    }
    steles = buildSteles(bag, placed, (id) => regionGroup(id as RegionId), lang, reduced);
    for (const w of placed) {
      addCollider({ x: w.sx, z: w.sz, r: 0.55, h: 2.2 });
      const c = Math.cos(w.rot), sn = Math.sin(w.rot);
      addCollider({ x: w.sx + 0.78 * c + 0.12 * sn, z: w.sz - 0.78 * sn + 0.12 * c, r: 0.16 });
      regionGroup(w.id).getObjectByName('stele:' + w.id)?.traverse((o) => o.layers.set(NO_REFLECT));
    }
    checkWaypoints();
  }
  // the places stay out of the garden pond's mirror (they would cost every draw twice)
  coreTop = new Set(scene.children);
  gardenTop = new Set(garden.children);
  unmirror();
  const inited: WorldFeature[] = [];
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    if (!running) break;
    inited.push(f);
    // a slow feature never holds the garden back: after a few seconds we go on without waiting
    const started = Promise.resolve().then(() => f.init(ctx)).catch((err) => {
      console.error(`[walk] feature "${f.id}" failed to start`, err);
    });
    await Promise.race([started, new Promise((r) => setTimeout(r, 4000))]);
    hud.progress(0.88 + (0.07 * (i + 1)) / FEATURES.length);
  }
  // what the features put up stays out of the mirror too
  unmirror();
  // whatever the features brought (and anything not yet seen), then the first real frame
  await warm(scene.children, 0.95, 0.995);
  if (running) {
    warming = false;
    nDeltas = 0;
    adaptAt = (performance.now() - t0) / 1000 + qp.adapt.after;
    last = performance.now();
    grade.render(scene, camera);
  }
  hud.progress(1);

  const dispose = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    ro.disconnect();
    disposeCharacter();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const f of inited) {
      try { f.dispose?.(); } catch (err) { console.error(`[walk] feature "${f.id}" failed to dispose`, err); }
    }
    for (const m of builtRegions) {
      try { m.dispose?.(); } catch (err) { console.error(`[walk] region "${m.id}" failed to dispose`, err); }
    }
    for (const b of ownBridges) setBridgeReplaced(b, false);
    offPlot();
    frameFns.clear();
    regionFns.clear();
    interactables.clear();
    controls.dispose();
    pond.dispose();
    for (const e of plants) freePlant(e);
    try { player.model.dispose(); } catch { /* gone */ }
    // anything left in the scene (including what regions and features forgot) gives its GPU memory back
    const mats = new Set<THREE.Material>();
    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
    bag.dispose();
    scene.clear();
    disposeRenderer();
    if (import.meta.env.DEV) delete (window as unknown as { __walk?: unknown }).__walk;
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __walk?: unknown }).__walk = {
      ctx, player, controls, sky, plants,
      /** Real frame times: median and 90th percentile (ms) of the last 120 frames, and the pixel ratio. */
      fps: () => { const f = frameStats(); return { median: +f.median.toFixed(1), p90: +f.p90.toFixed(1), fps: f.median ? Math.round(1000 / f.median) : 0, pr }; },
      /** The picture quality in use (quality.ts) and the pixel ratio now. */
      quality: () => ({ ...qp, pixelRatioNow: pr }),
      /** One whole frame as the loop draws it (grade and all), synchronously: its mean cost in ms over n. */
      bench: (n = 5) => {
        const gl = renderer.getContext();
        const px = new Uint8Array(4);
        const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < 2; i++) { renderer.shadowMap.needsUpdate = true; grade.render(scene, camera); sync(); }
        const ts: number[] = [];
        for (let i = 0; i < n; i++) {
          const a = performance.now();
          renderer.shadowMap.needsUpdate = true;
          grade.render(scene, camera);
          sync();
          ts.push(performance.now() - a);
        }
        return { ms: +(ts.reduce((x, y) => x + y, 0) / n).toFixed(1), pr, w: renderer.domElement.width, h: renderer.domElement.height };
      },
      /** The photo camera and the way of looking (V / P in the HUD). */
      photo,
      view: (v: ViewMode) => controls.setView(v),
      occluders: () => occluders.length,
      colliders: () => colliders.length,
      /**
       * One frame's real cost. The pond's mirror renders the scene again from inside the frame, and that
       * nested render resets the counters half-way (autoReset), so count one frame by hand.
       */
      info: () => {
        const ri = renderer.info;
        const auto = ri.autoReset;
        ri.autoReset = false;
        ri.reset();
        renderer.render(scene, camera);
        const out = { calls: ri.render.calls, triangles: ri.render.triangles, textures: ri.memory.textures, geometries: ri.memory.geometries, programs: ri.programs?.length ?? 0 };
        ri.autoReset = auto;
        return out;
      },
      teleport(x: number, z: number, heading?: number) {
        player.teleport(x, z, heading);
        if (heading !== undefined) controls.yaw = heading + Math.PI;
        camFollow(0, true);
        stream();
        trackRegion();
      },
      travel,
      /** The steles as placed: [id, x, z, lit]. */
      waypoints: () => placed.map((w) => [w.id, +w.sx.toFixed(1), +w.sz.toFixed(1), isLit(w.id)]),
      timeScale: () => timeScale,
      region: () => region,
      regions: () => Object.fromEntries([...regionGroups].map(([k, g]) => [k, { visible: g.visible, near: near.get(k) ?? false, shown: g.children.filter((c) => c.visible).length, children: g.children.length }])),
      where: () => ({ x: +player.position.x.toFixed(2), y: +player.position.y.toFixed(2), z: +player.position.z.toFixed(2), heading: +player.heading.toFixed(2), region, character: player.character }),
      night: (on: boolean) => sky.forceNight(on),
      toPlant: (key: string) => { const e = plants.find((p) => p.key === key || p.habit?.name === key); if (e) player.teleport(e.slot.tablet.x, e.slot.tablet.z + 0.6); },
      act: doAct,
      nearest: () => nearest?.id ?? null,
      water: (x: number, z: number) => waterAt(x, z),
      ground: (x: number, z: number) => floorY(x, z),
      slots: () => slots.map((s: PlantSlot) => ({ key: s.key, kind: s.kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2) })),
    };
  }

  return {
    input: controls.input,
    // queued, so the world's own step and mini-games (ctx.input.actionPressed) both see it
    act: () => { if (!paused) controls.input.actQueued = true; },
    jump: () => { controls.input.jumpQueued = true; },
    skill: () => { if (!paused) controls.input.skillQueued = true; },
    setPaused: (p: boolean) => { paused = p; controls.paused = p; },
    where: () => ({ x: player.position.x, z: player.position.z, heading: player.heading, region }),
    travel,
    waypoints: () => (placed.length ? placed.map((w) => ({ id: w.id, x: w.sx, z: w.sz, zh: w.zh, en: w.en, lit: isLit(w.id) }))
      : WAYPOINTS.map((w) => ({ id: w.id, x: w.x, z: w.z, zh: w.zh, en: w.en, lit: isLit(w.id) }))),
    setRun: (on: boolean) => { controls.runToggle = on; },
    setView: (v: ViewMode) => { controls.setView(v === 'first' ? 'first' : 'third'); },
    photo,
    dispose,
  };
}
export { paintAtlas, atlasHit } from './atlas';
