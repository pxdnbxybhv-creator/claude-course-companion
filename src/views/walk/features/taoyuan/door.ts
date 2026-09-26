// 桃源 · the door (bible §2) and the ways through it. At the waterfall pool below the mountain temple:
// petals always circle the pool (they come from the valley); when the door is open, a light shows
// behind the falls day and night. enterValley() frames the falls, lets a veil of falling white down,
// sets the walker at the start of the narrow way facing north (music hushed), and lets them walk it:
// 「初极狭，才通人」 is brushed on the rock at +56, and at +43 the mouth fires — the white-gold flash, the
// ink that turns to colour, a crane of the camera over the shoulder (the story may take over there
// with onMouth). leaveValley() goes back through the cleft (the seasons flicker if asked), a curtain
// with a line, and the pool again.
//
// When the door opens and closes is the story's to say (setDoorState / the door handler); this module
// gives the look, the prompts and the transitions. Independent of the old scene-peach encounter.
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../types';
import { ANCHORS as MAP_ANCHORS } from '../../map';
import { glowTexture, tr } from '../kit';
import { begin, end } from '../minigames/ui';
import { play } from '../../../../app/play';
import { inBox } from '../../../../app/mail';
import { ANCHORS, CAVE, CLEFT_END, G, L, W, Y_T, standAt } from './places';
import { engine } from './engine';
import type { TaoyuanWorld } from './world';

import { doorStateFor, type DoorState } from './places';
export { doorStateFor, type DoorState };

export interface Door {
  readonly state: DoorState;
  /** Pin the door's state (null: follow the record, see doorStateFor). */
  set(state: DoorState | null): void;
  /** What 「入光」 does (the story's B1); null: the plain way in. */
  onEnter(fn: (() => void | Promise<void>) | null): void;
  /** Where one stands to go in (world), facing the falls. */
  readonly spot: { x: number; y: number; z: number; heading: number };
  dispose(): void;
}

/** The door at the waterfall pool (built with the world, in the mountain's group). */
export function buildDoor(ctx: WorldCtx, tv: TaoyuanWorld): Door {
  const THREE = ctx.THREE;
  const fall = MAP_ANCHORS.waterfall, pool = MAP_ANCHORS.waterfallPool;
  const group = new THREE.Group();
  group.name = 'taoyuan:door';
  ctx.regionGroup('mountain').add(group);
  const offs: (() => void)[] = [];
  // where one stands: beside the pool, facing the falls (as the old door)
  let sx = pool.x - 2.4, sz = pool.z - 3.2;
  for (let k = 0; k < 24 && !ctx.isWalkable(sx, sz); k++) { const a = k * 2.4; sx = pool.x - 2.4 + Math.cos(a) * (0.6 + k * 0.25); sz = pool.z - 3.2 + Math.sin(a) * (0.6 + k * 0.25); }
  const sy = ctx.groundY(sx, sz);
  const heading = Math.atan2(fall.x - sx, fall.z - sz);
  const spot = { x: sx, y: sy, z: sz, heading };

  // the light behind the falling water
  const glowTex = glowTexture(THREE, 64, 0.1);
  const behind = new THREE.Vector3(fall.x, sy + 2.2, fall.z - 1.5);
  const mk = (color: string, size: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.position.copy(behind);
    s.scale.setScalar(size);
    group.add(s);
    return s;
  };
  const light = mk('#ffe6b0', 5), light2 = mk('#ffd0d8', 2.4), halo = mk('#fff4dc', 9);
  // petals circling the pool, drifting out on the water (they come from the valley: always)
  const NP = Math.round(48 * Math.min(1.4, ctx.quality.density));
  const pp = new Float32Array(NP * 3);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const petalTex = glowTexture(THREE, 32, 0.4);
  const petals = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.16, map: petalTex, color: '#f6a9bb', transparent: true, depthWrite: false }));
  petals.frustumCulled = false;
  group.add(petals);
  const wy = ctx.waterAt(pool.x, pool.z) ?? ctx.groundY(pool.x, pool.z);
  const phase = Float32Array.from({ length: NP }, (_, i) => ((i * 7919) % 1000) / 1000);

  let pinned: DoorState | null = null;
  let state: DoorState = 'hidden';
  let handler: (() => void | Promise<void>) | null = null;
  let k = 0;
  const recompute = () => {
    const s = pinned ?? doorStateFor(play.peek().flags, safeInBox('ty-shide'));
    if (s !== state) { state = s; relabel(); }
  };
  const it: Interactable = {
    id: 'taoyuan:door', position: new THREE.Vector3(sx, sy, sz), radius: 2.8,
    labelZh: '飞瀑', labelEn: 'The waterfall', actionZh: '寻', actionEn: 'Search',
    act: async () => {
      if (state === 'closed') { ctx.hud.toast('寻向所志，遂迷，不复得路。', 'You look for the marks you left, and lose your way. The path is not found again.', 4600); return; }
      if (state === 'hidden') return;
      if (handler) await handler();
      else await tv.enter();
    },
  };
  let offIt: (() => void) | null = null;
  const relabel = () => {
    if (state === 'open') Object.assign(it, { labelZh: '飞瀑之后，仿佛有光', labelEn: 'Behind the falls, a glimmer of light', actionZh: '入光', actionEn: 'Step into the light' });
    else if (state === 'reopened') Object.assign(it, { labelZh: '飞瀑之后，光又亮了', labelEn: 'Behind the falls, the light again', actionZh: '持花入光', actionEn: 'Enter with the petal' });
    else Object.assign(it, { labelZh: '飞瀑', labelEn: 'The waterfall', actionZh: '寻', actionEn: 'Search' });
    const want = state !== 'hidden';
    if (want && !offIt) offIt = ctx.addInteractable(it);
    else if (!want && offIt) { offIt(); offIt = null; }
  };
  recompute();
  let acc = 0;
  offs.push(ctx.onFrame((dt, t) => {
    acc += dt;
    if (acc > 1.5) { acc = 0; recompute(); }
    const on = state === 'open' || state === 'reopened' ? 1 : 0;
    k += (on - k) * Math.min(1, dt * 1.2);
    const f = 0.9 + Math.sin(t * 1.3) * 0.1;
    (light.material as T.SpriteMaterial).opacity = 0.55 * k * f;
    (light2.material as T.SpriteMaterial).opacity = 0.7 * k * f * (state === 'reopened' ? 1.2 : 1);
    (halo.material as T.SpriteMaterial).opacity = 0.16 * k * f;
    light.visible = light2.visible = halo.visible = k > 0.01;
    if (!group.parent?.visible) return;
    for (let i = 0; i < NP; i++) {
      const a = phase[i] * Math.PI * 2 + t * (0.05 + phase[i] * 0.06);
      const rad = 0.6 + (((i * 7919) % 100) / 100) * 2.4;
      pp[i * 3] = pool.x + Math.cos(a) * rad; pp[i * 3 + 1] = wy + 0.04; pp[i * 3 + 2] = pool.z + Math.sin(a) * rad * 0.8;
    }
    pgeo.attributes.position.needsUpdate = true;
  }));
  return {
    get state() { return state; },
    set(s: DoorState | null) { pinned = s; recompute(); },
    onEnter(fn) { handler = fn; },
    spot,
    dispose() {
      for (const f of offs.splice(0)) f();
      offIt?.();
      offIt = null;
      group.removeFromParent();
      pgeo.dispose();
      (petals.material as T.Material).dispose();
      for (const s of [light, light2, halo]) (s.material as T.Material).dispose();
      glowTex.dispose();
      petalTex.dispose();
    },
  };
}

function safeInBox(id: string): boolean {
  try { return inBox(id); } catch { return false; }
}

// ───────────────────────────── the veil and the card (DOM)

/** A veil (falling white at the falls) or a paper card, with a line; `mid` runs while it is down. */
export async function veil(ctx: WorldCtx, kind: 'veil' | 'card', line: { zh: string; en: string } | null, mid: () => void | Promise<void>, hold = 900, wait: (ms: number) => Promise<void>): Promise<void> {
  const el = document.createElement('div');
  el.className = kind === 'veil' ? 'ty-veil' : 'ty-card';
  if (line) { const p = document.createElement('p'); p.textContent = tr(ctx, line.zh, line.en); el.appendChild(p); }
  const off = ctx.hud.mount(el);
  try {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    await wait(1000);
    await mid();
    await wait(hold);
    el.classList.remove('is-on');
    await wait(1000);
  } finally {
    off();
  }
}

// ───────────────────────────── in and out

export interface EnterOpts {
  /** The line on the veil (default: 「林尽水源，便得一山……仿佛若有光。」); null for none. */
  line?: { zh: string; en: string } | null;
  /** At the mouth (+43): the story's own B2 (it may await tv.mouthReveal() first). Default: the reveal and the arrival banner. */
  onMouth?: () => void | Promise<void>;
  /** Skip the cleft: set down at the inner mouth (a return visit, a test). */
  atMouth?: boolean;
}

const LINE_IN = { zh: '林尽水源，便得一山。山有小口，仿佛若有光。', en: 'Where the stream began there was a hill, and in the hill a small opening, from which there seemed to come a light.' };
const LINE_OUT = { zh: '既出，得其船，便扶向路，处处志之……', en: 'Once out, he found his boat and went back the way he came, marking the path at every turn…' };

/**
 * In through the door: frame the falls, a veil of falling white, set down at the start of the narrow
 * way facing north with the music hushed, then the walker is free in the cleft. Resolves once they
 * can walk (the mouth fires later, as they reach it).
 */
export async function enterValley(tv: TaoyuanWorld, o: EnterOpts = {}): Promise<void> {
  const ctx = tv.ctx;
  if (tv.moving || !begin(ctx, 'taoyuan')) return;
  tv.moving = true;
  const eng = engine(ctx);
  try {
    ctx.player.ride(null);
    ctx.player.freeze(true);
    const fall = MAP_ANCHORS.waterfall;
    try { ctx.frameCamera(fall.x, fall.z, ctx.player.position.y + 3.2, 2.2); } catch { /* a nicety */ }
    tv.hush(true);
    await tv.wait(1500);
    await veil(ctx, 'veil', o.line === undefined ? LINE_IN : o.line, async () => {
      const v = await tv.build();
      v.setFloor(true);
      const at = o.atMouth ? { x: -0.1, z: CAVE.mouth - 1.2 } : { x: 0.0, z: CAVE.start };
      const p = W(at.x, at.z);
      ctx.player.teleport(p.x, p.z, Math.PI, Y_T + standAt(at.x, at.z));
      eng.faceView(Math.PI);
      eng.restream();
      tv.arrived();
      tv.hush(!o.atMouth);
      tv.cave?.wipe();
    }, 700, (ms) => tv.wait(ms));
  } finally {
    ctx.player.freeze(false);
    end(ctx, 'taoyuan');
    tv.moving = false;
    // (the way in failed: the music is the pool's again)
    if (!tv.isInside()) tv.hush(false);
  }
  if (o.atMouth) return;
  // the cleft: the words at +56, the mouth at +43
  tv.watchCleft({
    words: () => { void tv.cave?.brush(); },
    mouth: async () => {
      if (o.onMouth) await o.onMouth();
      else { await mouthReveal(tv); eng.arrive('taoyuan'); }
    },
  });
}

/**
 * 豁然开朗 (FX2 and the crane): the white-gold flash and the ink that turns to colour, a gust of
 * petals across the lens, the camera craning from eye height to 8 m over the shoulder, 「豁然开朗」
 * brushed in the air, the music of the valley. Resolves when the camera is handed back.
 */
export async function mouthReveal(tv: TaoyuanWorld): Promise<void> {
  const ctx = tv.ctx;
  const fx = tv.fx;
  if (!fx) return;
  const eng = engine(ctx);
  const claimed = begin(ctx, 'taoyuan');
  ctx.player.freeze(true);
  try {
    tv.hush(false);
    const reveal = fx.reveal();
    const p = ctx.player.position;
    const look = W(0, 6);
    const lookY = Y_T + 2.5;
    // over the shoulder: back along the way one came, and up
    // (straight up the cleft's open top: between its walls, the sky above)
    const to = { x: G.x + L(p.x, p.z).x * 0.5, y: p.y + 8, z: p.z + 3.2 };
    const crane = eng.cinematic({ to, look: { x: look.x, y: lookY, z: look.z }, secs: 3.6, hold: 1.4 });
    await tv.wait(700);
    void fx.petalBurst({ x: p.x - 1.5, y: p.y + 0.8, z: p.z - 3 }, { n: 160, up: 2.5, spread: 1.2, lit: false, wind: { x: 3.2, z: 1.2 } });
    await tv.wait(900);
    fx.words('豁然开朗', { x: look.x - 0.5, y: Y_T + 5.6, z: G.z + 26 }, { size: 1.3, life: 6, rise: 0.7 });
    await Promise.all([reveal, crane]);
  } finally {
    ctx.player.freeze(false);
    if (claimed) end(ctx, 'taoyuan');
  }
}

export interface LeaveOpts {
  /** FX14: the seasons flicker, the mist seals the mouth (B8). */
  close?: boolean;
  /** The curtain's line (default 「既出，得其船……」); null for none. */
  line?: { zh: string; en: string } | null;
  /** A card to show at the pool afterwards. */
  card?: { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal?: string };
}

/**
 * Out again: into the cleft (FX14 if asked), a curtain with a line, set down a few steps back from the
 * pool, out of the door's reach, turned to look back at the falls (the camera behind in open air).
 */
export async function leaveValley(tv: TaoyuanWorld, o: LeaveOpts = {}): Promise<void> {
  const ctx = tv.ctx;
  if (tv.moving || !begin(ctx, 'taoyuan')) return;
  tv.moving = true;
  const eng = engine(ctx);
  try {
    ctx.player.freeze(true);
    const pl = L(ctx.player.position.x, ctx.player.position.z);
    if (tv.fx && pl.z > CAVE.mouth - 8 && !tv.fx.reduced) {
      // look into the cleft
      const m = W(0, CAVE.mouth - 3), into = W(0, CAVE.mouth + 8);
      void eng.cinematic({ to: { x: m.x + 1.2, y: Y_T + standAt(0, CAVE.mouth - 3) + 2.2, z: m.z }, look: { x: into.x, y: Y_T + 1.4, z: into.z }, secs: 1.6, hold: o.close ? 6 : 0.6 });
    }
    if (o.close && tv.fx) await tv.fx.closeCave();
    else await tv.wait(900);
    await veil(ctx, 'card', o.line === undefined ? LINE_OUT : o.line, () => {
      eng.endCinematic();
      // (the valley's floor first: set down on the mountain's own ground)
      tv.valley?.setFloor(false);
      const s = landing(ctx, tv.door?.spot ?? null);
      ctx.player.teleport(s.x, s.z, s.heading);
      eng.faceView(s.heading);
      eng.restream();
      tv.hush(false);
      try { ctx.music.release(); } catch { /* optional */ }
      tv.fx?.reopenCave();
      tv.left();
    }, 1400, (ms) => tv.wait(ms));
  } finally {
    ctx.player.freeze(false);
    end(ctx, 'taoyuan');
    tv.moving = false;
  }
  if (o.card) ctx.hud.showCard(o.card);
}

/**
 * Where the way out sets the walker down: a few steps from the door's spot, beyond its reach (the prompt
 * is not live at once), turned to look back at the falls they came out of — at the place round the pool
 * where the camera behind them has the most open air (the ground behind rises least: never wedged into
 * the cliff, never looking down on the walker's head).
 */
function landing(ctx: WorldCtx, spot: Door['spot'] | null): { x: number; z: number; heading: number } {
  const fall = MAP_ANCHORS.waterfall;
  const s = spot ?? { x: MAP_ANCHORS.waterfallPool.x - 2.4, z: MAP_ANCHORS.waterfallPool.z - 3.2, y: 0, heading: 0 };
  const face = (x: number, z: number) => Math.atan2(fall.x - x, fall.z - z);
  let best = { x: s.x, z: s.z, heading: face(s.x, s.z) }, bestScore = Infinity;
  for (const r of [3.6, 4.4, 5.2]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      if (!ctx.isWalkable(x, z)) continue;
      const h = face(x, z), y = ctx.groundY(x, z);
      // (on the pool's own bank, not up on a ledge above it)
      if (Math.abs(y - s.y) > 1.3) continue;
      // the camera's line: behind the walker, 2–5 m back
      let rise = -Infinity;
      for (const b of [2, 3.5, 5]) rise = Math.max(rise, ctx.groundY(x - Math.sin(h) * b, z - Math.cos(h) * b) - y);
      const score = Math.max(0, rise) + r * 0.05;
      if (score < bestScore) { bestScore = score; best = { x, z, heading: h }; }
    }
  }
  return best;
}

/** The inner mouth's prompt (always there: 「出谷 · Leave」), and one at the cleft's start. */
export function exitPrompts(tv: TaoyuanWorld, leave: () => void | Promise<void>): (() => void)[] {
  const ctx = tv.ctx;
  const mk = (id: string, at: { x: number; y: number; z: number }, r: number): Interactable => ({
    id, position: new ctx.THREE.Vector3(at.x, at.y, at.z), radius: r,
    labelZh: '来时的小口', labelEn: 'The narrow way you came', actionZh: '出谷', actionEn: 'Leave',
    act: () => leave(),
  });
  // (the second a little short of the plank walk's last step, so it never draws the walker to the ring's edge)
  const out2 = W(0, CLEFT_END - 1.1);
  return [ctx.addInteractable(mk('taoyuan:out', ANCHORS.mouth, 2.2)), ctx.addInteractable(mk('taoyuan:out2', { x: out2.x, y: Y_T + standAt(0, CLEFT_END - 1.1), z: out2.z }, 1.4))];
}
