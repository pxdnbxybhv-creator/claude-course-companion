// 入画 · Into the Painting — the world core. Builds the garden in 3D (sky, mountains, land, pond,
// pavilion, the user's own plants), the protagonist and the camera, then hands a WorldCtx to every
// feature (festival easter eggs, critters). Loaded lazily so three.js stays out of the main chunk.
import * as THREE from 'three';
import type { FestivalKey, Hud, Interactable, WorldCtx } from '../types';
import { FEATURES, festivalsOn } from '../features';
import { activeHabits, refreshToday, state, toggleCheckin } from '../../../app/store';
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
import { buildArchitecture } from './architecture';
import { buildPond, NO_REFLECT } from './pond';
import { BURST_COLOR, buildPlant, buildTablets, growPlant, interactRadius, plantCollider, repaint, tickPlant, vigorFor, type PlantEntity, type TabletSpec } from './plants';
import { Scholar } from './player';
import { Controls, type InputState } from './controls';
import { buildAir, Bursts } from './particles';
import { buildFlora } from './flora';
import {
  BOUNDS_R, GATE, LOOP, PAVILION, PAVILION_Y, POND, SPAWN, floorY, layoutPlants, polyAt, staticColliders, walkableGround, wallSegments,
  type Circle, type PlantSlot,
} from './site';

export interface Prompt { labelZh: string; labelEn: string; actionZh: string; actionEn: string }

export interface HudBridge extends Hud {
  prompt(p: Prompt | null): void;
  progress(f: number): void;
  /** A toast with one action (撤销 · Undo). */
  toastAction(zh: string, en: string, action: { zh: string; en: string; run: () => void }): void;
}

export interface WorldOptions {
  host: HTMLElement;
  lang: 'zh' | 'en';
  /** Preview one festival's easter egg (null = whatever today is). */
  festival: FestivalKey | null;
  time: 'now' | 'day' | 'night';
  hud: HudBridge;
  cancelled(): boolean;
}

export interface WorldHandle {
  input: InputState;
  act(): void;
  jump(): void;
  /** While a card or sheet is open the keyboard does not walk. */
  setPaused(p: boolean): void;
  dispose(): void;
}

export class WebGLUnavailable extends Error {}

const WILD: { kind: PlantKind; seed: number }[] = [
  { kind: 'bamboo', seed: 71 }, { kind: 'orchid', seed: 5 }, { kind: 'pine', seed: 9 }, { kind: 'chrysanthemum', seed: 23 }, { kind: 'plum', seed: 41 },
];

function statsOf(h: Habit, day: string): HabitStats {
  return statsFor(h, state.value.checkins[h.id] ?? [], day);
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
  const lowEnd = touch && cores <= 4;
  const dpr = Math.min(window.devicePixelRatio || 1, touch ? (lowEnd ? 1.5 : 1.75) : 2);

  // --- renderer
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.6, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (e) {
    throw new WebGLUnavailable(String(e));
  }
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const W = () => Math.max(1, host.clientWidth), H = () => Math.max(1, host.clientHeight);
  renderer.setSize(W(), H());
  const cv = renderer.domElement;
  cv.className = 'walk-canvas';
  cv.setAttribute('aria-label', lang === 'zh' ? '入画：可行走的立体园子' : 'Into the Painting: a garden you can walk in');
  cv.setAttribute('role', 'img');
  cv.style.touchAction = 'none';

  const disposeRenderer = () => {
    renderer.dispose();
    renderer.forceContextLoss();
    cv.remove();
  };
  const bail = () => { bag.dispose(); disposeRenderer(); };

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
  const env = { ...base, date: now, festivals };
  const aspect = W() / H();

  // --- scene & camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(aspect < 0.8 ? 62 : 50, aspect, 0.1, 600);
  camera.layers.enable(NO_REFLECT);
  const sky = new SkySystem(scene, bag, base.tod, base.hour, base.moonPhase);
  scene.add(buildMountains(bag));
  hud.progress(0.1);
  await nextFrame();
  if (o.cancelled()) { bail(); throw new Error('cancelled'); }

  // --- where everything goes
  const items = habits.length ? habits.map((h) => ({ key: h.id, kind: h.plant })) : WILD.map((w, i) => ({ key: 'wild' + i, kind: w.kind }));
  const slots = layoutPlants(items);
  const bySlot = new Map(slots.map((s) => [s.key, s]));
  const ground = buildGround(bag, slots, base.season);
  scene.add(ground.mesh, ground.stones);
  const arch = buildArchitecture(bag);
  scene.add(arch.group);
  const flora = buildFlora(bag, slots, reduced);
  scene.add(flora.group);
  const pond = buildPond(bag, habits.length ? clarity : 0.92, { lowEnd, reduced, w: W() * dpr, h: H() * dpr });
  scene.add(pond.group);
  // the reflection camera sees layer 0 only (no particles, ripples or shadows in the mirror)
  (pond.water.getReflectionCamera(camera) as THREE.Camera).layers.set(0);
  hud.progress(0.25);
  await nextFrame();

  // fonts for the tablets (never wait long)
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "LXGW WenKai"', habits.map((h) => h.name).join('') + '此园尚空待种梅兰竹菊松荷'), document.fonts.load('60px "Ma Shan Zheng"', '问月')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back to system fonts */ }
  if (o.cancelled()) { bail(); throw new Error('cancelled'); }

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
    }, slot, lowEnd);
    plants.push(e);
    scene.add(e.mesh);
    hud.progress(0.3 + 0.55 * ((i + 1) / total));
    await nextFrame();
    if (o.cancelled()) { bail(); throw new Error('cancelled'); }
  }

  // tablets with the habits' names
  const tabletSpecs: TabletSpec[] = [];
  const tabletFor = new Map<string, number>();
  for (const e of plants) {
    if (!e.habit) continue;
    tabletFor.set(e.key, tabletSpecs.length);
    tabletSpecs.push({ ...e.slot.tablet, text: e.habit.name, glyph: PLANT_INFO[e.kind].zh });
  }
  let invite: { x: number; z: number } | null = null;
  if (!habits.length) {
    const p = polyAt(LOOP, 0.6);
    invite = { x: p.x - 1.3, z: p.z - 0.6 };
    tabletSpecs.push({ x: invite.x, z: invite.z, rot: 0.3, text: lang === 'zh' ? '此园尚空' : 'An empty garden', glyph: null });
  }
  const tablets = buildTablets(bag, tabletSpecs);
  scene.add(tablets.group);

  // --- the protagonist and the camera
  const player = new Scholar(bag, SPAWN.x, floorY(SPAWN.x, SPAWN.z), SPAWN.z, SPAWN.heading, reduced);
  scene.add(player.root, player.shadowMesh);
  const controls = new Controls(cv, camera, SPAWN.heading, reduced);
  // keep the camera on the player's side of the moon-gate wall (the round opening is fine)
  controls.occlusion = (tx, ty, tz, cx, cy, cz) => {
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
  controls.update(0, player.position, player.heading, 0, floorY, true);

  const air = buildAir(bag, base.season, base.tod === 'night', reduced, 1);
  if (air) scene.add(air.points);
  const bursts = new Bursts(bag, 1);
  scene.add(bursts.points);
  const setPx = () => {
    const px = (H() * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (air) (air.points.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
    (bursts.points.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
  };
  setPx();

  // --- collisions
  const colliders: Circle[] = [...staticColliders()];
  for (const e of plants) {
    const c = plantCollider(e);
    if (c) colliders.push(c);
  }
  for (const t of tabletSpecs) colliders.push({ x: t.x, z: t.z, r: 0.3 });
  const walls = wallSegments();
  const resolve = (x: number, z: number, r: number, fx: number, fz: number): [number, number] => {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-6) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
      }
      for (const [ax, az, bx, bz] of walls) {
        const sx = bx - ax, sz = bz - az;
        const tt = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz)));
        const cx = ax + sx * tt, cz = az + sz * tt;
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), m = GATE.thick / 2 + r;
        if (d < m) {
          if (d > 1e-6) { x = cx + (dx / d) * m; z = cz + (dz / d) * m; }
          else { z = cz + (fz >= cz ? m : -m); }
        }
      }
    }
    if (!walkableGround(x, z)) {
      if (walkableGround(x, fz)) return [x, fz];
      if (walkableGround(fx, z)) return [fx, z];
      return [fx, fz];
    }
    return [x, z];
  };
  // a little clearance round every trunk, stone and tablet, so features never plant a prop inside a canopy
  const isWalkable = (x: number, z: number) => walkableGround(x, z, 0.1) && !colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.45);

  // --- interactables
  const interactables = new Set<Interactable>();
  let nearest: Interactable | null = null;
  let shown = '';
  const addInteractable = (i: Interactable) => {
    interactables.add(i);
    return () => {
      interactables.delete(i);
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
    // the check-in is recorded at once; the painting catches up a moment later
    if (!toggleCheckin(h.id)) toggleCheckin(h.id);
    const st = statsOf(h, refreshToday());
    relabel(it, h);
    later(420, () => {
      growPlant(e, st.growth, vigorFor(st.freshness), reduced);
      audio.chime(st.streak);
      bursts.petals(x, e.baseY + (top - e.baseY) * 0.75, z, BURST_COLOR[e.kind], 24);
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
          },
        },
      );
    });
  };

  const admire = (e: PlantEntity, h: Habit, st: HabitStats) => {
    player.face(e.slot.x, e.slot.z);
    lookTogether(e);
    player.emote('bow');
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

  // --- frame hooks for features
  const frameFns = new Set<(dt: number, t: number) => void>();
  const onFrame = (fn: (dt: number, t: number) => void) => {
    frameFns.add(fn);
    return () => void frameFns.delete(fn);
  };

  const ctx: WorldCtx = {
    THREE, scene, camera, renderer,
    groundY: floorY,
    isWalkable,
    pond: { center: new THREE.Vector3(POND.x, POND.waterY, POND.z), radiusX: POND.rx, radiusZ: POND.rz, waterY: POND.waterY },
    bounds: { radius: BOUNDS_R },
    player,
    env,
    addInteractable,
    hud: { toast: hud.toast, setCounter: hud.setCounter, showCard: hud.showCard },
    audio,
    rng: makeRng(hashString('walk:' + day)),
    onFrame,
    sky,
    palette: PIGMENTS,
    lang,
  };

  // --- the loop
  let raf = 0;
  let last = performance.now();
  let running = true;
  let paused = false;
  let fps = 60;
  const camPos = new THREE.Vector3();
  const step = (dt: number, t: number) => {
    const mv = controls.move();
    const inp = controls.input;
    player.update(dt, { x: mv.x, z: mv.z, run: mv.run, jump: inp.jumpQueued && !paused }, { floorY, resolve });
    inp.jumpQueued = false;
    controls.update(dt, player.position, player.heading, player.speed, floorY);
    sky.update(dt, camera);
    camPos.copy(camera.position);
    for (const e of plants) tickPlant(e, dt, t, camPos, sky.tint, reduced);
    for (const f of tablets.faces) (f.material as THREE.MeshBasicMaterial).color.copy(sky.tint);
    arch.setNight(sky.night01, t);
    flora.update(t, sky.tint, sky.fogColor);
    pond.update(dt, t, sky.fogColor, sky.night01);
    if (air) air.update(t, camPos, sky.night01);
    bursts.update(dt, t);
    for (const fn of frameFns) {
      try { fn(dt, t); } catch (err) { console.error('[walk] feature frame failed', err); frameFns.delete(fn); }
    }
    // the nearest thing to do
    let best: Interactable | null = null, bd = Infinity;
    for (const i of interactables) {
      const d = Math.hypot(i.position.x - player.position.x, i.position.z - player.position.z);
      if (d < i.radius && d < bd && Math.abs(i.position.y - player.position.y) < 3) { best = i; bd = d; }
    }
    nearest = best;
    const sig = best ? `${best.id}|${best.labelZh}|${best.labelEn}|${best.actionZh}|${best.actionEn}` : '';
    if (sig !== shown) {
      shown = sig;
      hud.prompt(best ? { labelZh: best.labelZh, labelEn: best.labelEn, actionZh: best.actionZh, actionEn: best.actionEn } : null);
    }
    if (inp.actQueued) {
      inp.actQueued = false;
      if (!paused) doAct();
    }
  };
  const doAct = () => {
    const i = nearest;
    if (!i) return;
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
    const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
    last = nowMs;
    if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
    step(dt, (nowMs - t0) / 1000);
    renderer.render(scene, camera);
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
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
    pond.setSize(w * dpr, h * dpr);
    setPx();
  });

  // first frame: settle the sky & camera, then show
  step(1, 0);
  host.appendChild(cv);
  ro.observe(host);
  renderer.render(scene, camera);
  hud.progress(1);
  raf = requestAnimationFrame(frame);

  // --- features dress the world (they decide for themselves whether today is theirs)
  const inited: typeof FEATURES = [];
  for (const f of FEATURES) {
    if (!running) break;
    inited.push(f);
    // a slow feature never holds the garden back: after a few seconds we go on without waiting
    const started = Promise.resolve().then(() => f.init(ctx)).catch((err) => {
      console.error(`[walk] feature "${f.id}" failed to start`, err);
    });
    await Promise.race([started, new Promise((r) => setTimeout(r, 4000))]);
  }

  const dispose = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    ro.disconnect();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const f of inited) {
      try { f.dispose?.(); } catch (err) { console.error(`[walk] feature "${f.id}" failed to dispose`, err); }
    }
    frameFns.clear();
    interactables.clear();
    controls.dispose();
    pond.dispose();
    // anything left in the scene (including what features forgot) gives its GPU memory back
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
      fps: () => Math.round(fps),
      info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }),
      teleport(x: number, z: number, heading?: number) {
        player.position.set(x, floorY(x, z), z);
        if (heading !== undefined) { player.heading = heading; controls.yaw = heading + Math.PI; }
        controls.update(0, player.position, player.heading, 0, floorY, true);
      },
      night: (on: boolean) => sky.forceNight(on),
      act: doAct,
      nearest: () => nearest?.id ?? null,
      slots: () => slots.map((s: PlantSlot) => ({ key: s.key, kind: s.kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2) })),
    };
  }

  return {
    input: controls.input,
    act: () => { if (!paused) doAct(); },
    jump: () => { controls.input.jumpQueued = true; },
    setPaused: (p: boolean) => { paused = p; controls.paused = p; },
    dispose,
  };
}
