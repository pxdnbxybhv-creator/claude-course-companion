// What you carry from the stalls: candied haws (eaten bite by bite), a pinwheel that spins as you
// run, an oil-paper umbrella over your head, a lantern that lights at night, a kite flying on its
// string above you, a flower to give away, a sugar figure of your companion. Kept wares are play
// flags own:<id>; what is in your hands right now (and the haws, flowers and sugar figure) are a
// per-viewer convenience in localStorage. A small 行囊 chip swaps what you hold.
import './npcs.css';
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { CharacterId } from '../../../../data/characters';
import { CHARACTER } from '../../../../data/characters';
import { play, flag, playResets } from '../../../../app/play';
import { Bag, feature, glowTexture, inked, loadBrush, propMat, reducedMotion, tr } from '../kit';
import { merge, part } from '../geo';
import { busy } from '../minigames/ui';
import { HOLD_GLYPH, HOLD_NAME, bagChoices, ownFlag, type HoldKind, type WareId } from './logic';
import { FLOWERS } from './lines';

// ───────────────────────────── the carry store ─────────────────────────────

const KEY = 'banmu.npcs.v1';

export interface Carry {
  hold: HoldKind | null;
  haws: number;
  flower: number;
  /** The season of the flower you carry (FLOWERS index). */
  flowerKind: number;
  /** Whose sugar figure you carry. */
  sugar: CharacterId | null;
}

function loadCarry(): Carry {
  const base: Carry = { hold: null, haws: 0, flower: 0, flowerKind: 0, sugar: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Carry> | null;
    if (!raw || typeof raw !== 'object') return base;
    const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    return {
      hold: typeof raw.hold === 'string' && raw.hold in HOLD_GLYPH ? (raw.hold as HoldKind) : null,
      haws: n(raw.haws, 5),
      flower: n(raw.flower, 3),
      flowerKind: n(raw.flowerKind, 3),
      sugar: typeof raw.sugar === 'string' && raw.sugar in CHARACTER ? (raw.sugar as CharacterId) : null,
    };
  } catch {
    return base;
  }
}

let carry: Carry = loadCarry();
/** The progress resets this copy has seen (an erase in Settings clears the browser's copy too). */
let carryResets = playResets();
const listeners = new Set<() => void>();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(carry)); } catch { /* private window: in memory only */ }
  for (const l of listeners) l();
}

export function carrying(): Readonly<Carry> {
  return carry;
}

/** Can the walker hold this now (owned, or carried)? */
function available(k: HoldKind): boolean {
  if (k === 'haws') return carry.haws > 0;
  if (k === 'flower') return carry.flower > 0;
  if (k === 'sugar') return !!carry.sugar;
  return !!play.value.flags[ownFlag(k as WareId)];
}

/** Put this in the walker's hands (null: empty hands). */
export function hold(k: HoldKind | null): void {
  carry = { ...carry, hold: k && available(k) ? k : null };
  save();
}

/** Bought (or given) something: it goes straight into your hands. */
export function receive(k: HoldKind, o: { flowerKind?: number; sugar?: CharacterId } = {}): void {
  if (k === 'haws') carry = { ...carry, haws: 5 };
  else if (k === 'flower') carry = { ...carry, flower: Math.min(3, carry.flower + 1), flowerKind: o.flowerKind ?? carry.flowerKind };
  else if (k === 'sugar') carry = { ...carry, sugar: o.sugar ?? 'scholar' };
  else flag(ownFlag(k as WareId));
  carry = { ...carry, hold: k };
  save();
}

/** Give away (or eat up) one flower; true if there was one. */
export function takeFlower(): boolean {
  if (carry.flower <= 0) return false;
  const flower = carry.flower - 1;
  carry = { ...carry, flower, hold: carry.hold === 'flower' && !flower ? null : carry.hold };
  save();
  return true;
}

/** Holding a flower right now? */
export function holdingFlower(): boolean {
  return carry.hold === 'flower' && carry.flower > 0;
}

/** One bite of the haws (or the sugar figure): returns what is left. */
function bite(): number {
  if (carry.hold === 'haws' && carry.haws > 0) {
    const haws = carry.haws - 1;
    carry = { ...carry, haws, hold: haws ? 'haws' : null };
    save();
    return haws;
  }
  if (carry.hold === 'sugar' && carry.sugar) {
    carry = { ...carry, sugar: null, hold: null };
    save();
    return 0;
  }
  return 0;
}

// ───────────────────────────── the props ─────────────────────────────

interface Prop { obj: T.Object3D; spin?: T.Object3D; glow?: T.Sprite; lit?: T.MeshToonMaterial; kite?: boolean; head?: boolean }

function buildProps(bag: Bag, ctx: WorldCtx): Record<HoldKind, Prop> {
  const { THREE } = ctx;
  const P = ctx.palette;
  const g = (parts: T.BufferGeometry[], w = 0.006) => inked(ctx, merge(THREE, parts), { width: w });
  const group = (...o: T.Object3D[]) => { const gr = new THREE.Group(); o.forEach((x) => gr.add(x)); return gr; };

  // 糖葫芦: five glazed haws on a stick
  const hawParts = [part(THREE, new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), '#c8a878', { p: [0, 0.18, 0] })];
  for (let i = 0; i < 5; i++) hawParts.push(part(THREE, new THREE.SphereGeometry(0.038, 8, 6), '#c42a2e', { p: [Math.sin(i * 2.3) * 0.006, 0.2 + i * 0.062, 0] }));
  const haws = g(hawParts);

  // 风车: four paper vanes on a stick
  const stick = g([part(THREE, new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), '#c8a878', { p: [0, 0.3, 0] })]);
  const vanes: T.BufferGeometry[] = [];
  const vc = ['#d8463a', '#e6b93a', '#3f7aa0', '#6fa05a'];
  for (let i = 0; i < 4; i++) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.13, 0.02, 0, 0.1, 0.13, 0.01], 3));
    tri.computeVertexNormals();
    vanes.push(part(THREE, tri, vc[i], { r: [0, 0, (i * Math.PI) / 2] }));
  }
  vanes.push(part(THREE, new THREE.SphereGeometry(0.018, 6, 4), P.cinnabar));
  const wheel = new THREE.Mesh(merge(THREE, vanes), new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, gradientMap: propMat(ctx).gradientMap }));
  wheel.position.set(0, 0.6, 0.03);
  const pinwheel = group(stick, wheel);

  // 油纸伞: a painted canopy over the head
  const canopy = new THREE.ConeGeometry(0.62, 0.26, 16, 1, true);
  const umbrellaParts = [
    part(THREE, canopy, '#c9573f', { p: [0, 1.0, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 1.05, 5), '#6b4a33', { p: [0, 0.5, 0] }),
    part(THREE, new THREE.SphereGeometry(0.03, 6, 4), '#2b2622', { p: [0, 1.13, 0] }),
    part(THREE, new THREE.TorusGeometry(0.62, 0.008, 3, 20), '#2b2622', { p: [0, 0.87, 0], r: [Math.PI / 2, 0, 0] }),
  ];
  for (let i = 0; i < 5; i++) umbrellaParts.push(part(THREE, new THREE.CircleGeometry(0.05, 5), '#f4efe4', { p: [Math.cos(i * 1.3) * 0.36, 0.99, Math.sin(i * 1.3) * 0.36], r: [-Math.PI / 2 + 0.4, 0, i * 1.3] }));
  const umbrellaMesh = inked(ctx, merge(THREE, umbrellaParts), { width: 0.008 });
  (umbrellaMesh.material as T.Material).side = THREE.DoubleSide;
  const umbrella = group(umbrellaMesh);

  // 灯笼: a red lantern on a stick; lit from inside at night
  const litMat = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: propMat(ctx).gradientMap, emissive: new THREE.Color('#ffb466'), emissiveIntensity: 0 });
  bag.own(litMat);
  const lanternMesh = inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.008, 0.01, 0.5, 4), '#6b4a33', { p: [0, 0.22, 0.12], r: [0.9, 0, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.004, 0.004, 0.1, 3), '#2b2622', { p: [0, 0.38, 0.33] }),
    part(THREE, new THREE.SphereGeometry(0.1, 10, 7), '#d23c2c', { p: [0, 0.24, 0.33], s: [1, 1.2, 1] }),
    part(THREE, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), '#2b2622', { p: [0, 0.37, 0.33] }),
    part(THREE, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), '#2b2622', { p: [0, 0.11, 0.33] }),
    part(THREE, new THREE.CylinderGeometry(0.01, 0.01, 0.1, 3), '#e2b33a', { p: [0, 0.05, 0.33] }),
  ]), { width: 0.006, mat: litMat });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: bag.own(glowTexture(THREE, 64, 0.12)), color: '#ffb86b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.set(1.3, 1.3, 1);
  glow.position.set(0, 0.24, 0.33);
  const lantern = group(lanternMesh, glow);

  // 纸鸢: a swallow kite (flown above you; the reel stays in the hand)
  const kite = kiteGeometry(ctx);
  const reel = g([part(THREE, new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), '#8a6a48', { r: [0, 0, Math.PI / 2] }), part(THREE, new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), '#6b4a33', { r: [0, 0, Math.PI / 2] })]);

  // a flower sprig (the season's)
  const flowerParts = [part(THREE, new THREE.CylinderGeometry(0.006, 0.008, 0.36, 4), '#5d4a30', { p: [0, 0.18, 0], r: [0, 0, 0.1] })];
  const fcol = FLOWERS[carry.flowerKind]?.color ?? '#f2b8c0';
  for (let i = 0; i < 5; i++) flowerParts.push(part(THREE, new THREE.SphereGeometry(0.03, 6, 4), fcol, { p: [Math.sin(i * 2.1) * 0.05 - 0.02, 0.24 + i * 0.035, Math.cos(i * 2.1) * 0.03], s: [1, 0.6, 1] }));
  flowerParts.push(part(THREE, new THREE.SphereGeometry(0.035, 6, 4), '#6f8f4a', { p: [0.03, 0.16, 0], s: [1.4, 0.3, 0.8] }));
  const flower = g(flowerParts, 0.004);

  // 糖人: an amber figure on a stick
  const sugarShape = new THREE.Shape();
  sugarShape.absarc(0, 0.2, 0.05, 0, Math.PI * 2, false);
  const body = new THREE.Shape();
  body.moveTo(-0.06, 0.14); body.lineTo(0.06, 0.14); body.lineTo(0.09, -0.02); body.lineTo(0.03, -0.02); body.lineTo(0.04, -0.1); body.lineTo(-0.04, -0.1); body.lineTo(-0.03, -0.02); body.lineTo(-0.09, -0.02); body.closePath();
  const sugarMat = new THREE.MeshToonMaterial({ color: '#e7a53a', emissive: new THREE.Color('#7a3d08'), emissiveIntensity: 0.35, transparent: true, opacity: 0.92, side: THREE.DoubleSide, gradientMap: propMat(ctx).gradientMap });
  bag.own(sugarMat);
  const sugarFig = new THREE.Mesh(merge(THREE, [part(THREE, new THREE.ShapeGeometry(sugarShape), '#ffffff'), part(THREE, new THREE.ShapeGeometry(body), '#ffffff')]), sugarMat);
  sugarFig.position.y = 0.42;
  const sugar = group(g([part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), '#d8c9a0', { p: [0, 0.2, 0] })], 0.004), sugarFig);

  return {
    haws: { obj: haws },
    pinwheel: { obj: pinwheel, spin: wheel },
    umbrella: { obj: umbrella, head: true },
    lantern: { obj: lantern, glow, lit: litMat },
    kite: { obj: group(reel, kite), kite: true },
    flower: { obj: flower },
    sugar: { obj: sugar },
  };
}

function kiteGeometry(ctx: WorldCtx): T.Mesh {
  const { THREE, palette: P } = ctx;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42); shape.lineTo(0.12, 0.1); shape.lineTo(0.55, 0.12); shape.lineTo(0.14, -0.08); shape.lineTo(0.2, -0.5);
  shape.lineTo(0, -0.22); shape.lineTo(-0.2, -0.5); shape.lineTo(-0.14, -0.08); shape.lineTo(-0.55, 0.12); shape.lineTo(-0.12, 0.1); shape.lineTo(0, 0.42);
  const g = merge(THREE, [
    part(THREE, new THREE.ShapeGeometry(shape), '#e0a23a'),
    part(THREE, new THREE.CircleGeometry(0.1, 10), '#f4efe4', { p: [0, 0.18, 0.004] }),
    part(THREE, new THREE.CircleGeometry(0.03, 8), P.ink, { p: [0, 0.2, 0.008] }),
    part(THREE, new THREE.PlaneGeometry(0.03, 0.6), P.cinnabar, { p: [0.1, -0.75, 0] }),
    part(THREE, new THREE.PlaneGeometry(0.03, 0.6), P.cinnabar, { p: [-0.1, -0.75, 0] }),
  ]);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.name = 'kite';
  m.scale.setScalar(1.5);
  return m;
}

// ───────────────────────────── the feature ─────────────────────────────

export const carryFeature = feature('npc-carry', async (bag, ctx) => {
  const { THREE } = ctx;
  if (carryResets !== playResets()) { carryResets = playResets(); carry = loadCarry(); }
  const still = reducedMotion();
  const props = buildProps(bag, ctx);
  const holder = new THREE.Group();
  holder.name = 'npc-carry';
  for (const p of Object.values(props)) { p.obj.visible = false; holder.add(p.obj); }
  bag.add(holder);
  // the kite flies free of the hand, its string drawn to it
  const kiteMesh = props.kite.obj.children[1] as T.Mesh;
  props.kite.obj.remove(kiteMesh);
  kiteMesh.visible = false;
  bag.add(kiteMesh);
  const strPos = new Float32Array(6);
  const strGeo = new THREE.BufferGeometry();
  strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3).setUsage(THREE.DynamicDrawUsage));
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: '#2a2621', transparent: true, opacity: 0.55 }));
  string.frustumCulled = false;
  string.visible = false;
  bag.add(string);

  // ── the hand: lent by the walker while we hold something; given back while a game or a skill needs it
  let hand: T.Object3D | null = null;
  let lentTo: string | null = null;
  let shown: HoldKind | null = null;
  const handW = new THREE.Vector3(), kitePos = new THREE.Vector3(), kiteVel = new THREE.Vector3();
  let kiteInit = false;
  const give = () => {
    if (lentTo !== null) { try { ctx.player.holdProp(null); } catch { /* ignore */ } }
    lentTo = null; hand = null;
  };
  bag.onDispose(give);
  const show = (k: HoldKind | null) => {
    if (shown === k) return;
    if (shown) props[shown].obj.visible = false;
    shown = k;
    if (k) props[k].obj.visible = true;
    kiteMesh.visible = string.visible = k === 'kite';
    if (k === 'kite') kiteInit = false;
  };

  // the flower's colour follows the one you carry
  const recolorFlower = () => {
    const mesh = props.flower.obj as T.Mesh;
    const col = mesh.geometry.getAttribute('color') as T.BufferAttribute;
    const c = new THREE.Color(FLOWERS[carry.flowerKind]?.color ?? '#f2b8c0');
    const green = new THREE.Color('#6f8f4a'), stem = new THREE.Color('#5d4a30');
    for (let i = 0; i < col.count; i++) {
      const r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
      const isStem = Math.abs(r - stem.r) < 0.02 && Math.abs(gg - stem.g) < 0.02 && Math.abs(b - stem.b) < 0.02;
      const isLeaf = Math.abs(r - green.r) < 0.02 && Math.abs(gg - green.g) < 0.02 && Math.abs(b - green.b) < 0.02;
      if (!isStem && !isLeaf) col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  recolorFlower();

  // ── the 行囊 chip
  await loadBrush('囊空' + Object.values(HOLD_GLYPH).join(''));
  const root = document.createElement('div');
  root.className = 'npc-bag';
  root.lang = ctx.lang === 'zh' ? 'zh' : 'en';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'npc-bag-btn';
  const tray = document.createElement('div');
  tray.className = 'npc-bag-tray';
  tray.hidden = true;
  tray.setAttribute('role', 'menu');
  root.append(btn, tray);
  let unmount: (() => void) | null = ctx.hud.mount(root);
  bag.onDispose(() => { unmount?.(); unmount = null; });
  const glyphSpan = (g: string) => { const s = document.createElement('span'); s.className = 'brush'; s.textContent = g; return s; };

  const render = () => {
    const choices = bagChoices(play.value.flags, carry);
    root.style.display = choices.length ? '' : 'none';
    btn.replaceChildren(glyphSpan(carry.hold ? HOLD_GLYPH[carry.hold] : '囊'));
    btn.classList.toggle('is-holding', !!carry.hold);
    const label = carry.hold ? tr(ctx, `行囊 · 手持${HOLD_NAME[carry.hold].zh}`, `Bag · holding the ${HOLD_NAME[carry.hold].en.toLowerCase()}`) : tr(ctx, '行囊', 'Bag');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.setAttribute('aria-expanded', String(!tray.hidden));
    if (carry.hold === 'haws') { const s = document.createElement('small'); s.textContent = `×${carry.haws}`; btn.append(s); }
    if (carry.hold === 'flower' && carry.flower > 1) { const s = document.createElement('small'); s.textContent = `×${carry.flower}`; btn.append(s); }
    const items: HTMLButtonElement[] = [];
    const item = (glyph: string, name: string, on: boolean, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `npc-bag-item ${cls}${on ? ' is-on' : ''}`;
      b.setAttribute('role', 'menuitem');
      b.append(glyphSpan(glyph), document.createTextNode(name));
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      items.push(b);
    };
    if (carry.hold === 'haws' || carry.hold === 'sugar') item('吃', tr(ctx, '吃一口', 'Take a bite'), false, 'is-use', eat);
    for (const k of choices) item(HOLD_GLYPH[k], tr(ctx, HOLD_NAME[k].zh, HOLD_NAME[k].en), carry.hold === k, '', () => { hold(k); close(); });
    item('空', tr(ctx, '空手', 'Empty hands'), !carry.hold, '', () => { hold(null); close(); });
    tray.replaceChildren(...items);
  };
  const close = () => { tray.hidden = true; render(); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); tray.hidden = !tray.hidden; render(); if (!tray.hidden) (tray.querySelector('button') as HTMLButtonElement | null)?.focus(); });
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape' && !tray.hidden) { e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);
  bag.onDispose(() => window.removeEventListener('keydown', onKey, true));
  function eat() {
    const was = carry.hold;
    const left = bite();
    ctx.player.emote('eat');
    if (was === 'haws') ctx.hud.toast(left ? `酸——甜！（还剩 ${left} 颗）` : '最后一颗，咔嚓！', left ? `Sour — then sweet! (${left} left)` : 'The last one — crunch!', 1800);
    else ctx.hud.toast(`咔嚓——${CHARACTER[ctx.player.character].zh}的糖人，甜到心里。`, 'Crunch — a sugar figure, sweet to the heart.', 2000);
    close();
  }
  const onChange = () => { recolorFlower(); render(); };
  listeners.add(onChange);
  bag.onDispose(() => listeners.delete(onChange));
  // another tab (or anything else that sets flags) may hand you wares: look at the flags now and then
  let flagsSeen = play.value.flags;
  render();

  // ── every frame: follow the hand
  let spin = 0;
  const lastPos = new THREE.Vector3().copy(ctx.player.position);
  bag.frame((dt, t) => {
    if (play.value.flags !== flagsSeen) { flagsSeen = play.value.flags; render(); }
    const pl = ctx.player;
    const want = carry.hold;
    // a game, a ride or a skill has the hands: put ours away
    const away = !want || busy(ctx) || pl.isFrozen || pl.emoting === 'skill' || pl.emoting === 'cast' || pl.emoting === 'row' || pl.emoting === 'play';
    if (away) {
      if (hand || lentTo !== null) give();
      show(null);
      return;
    }
    if (lentTo !== pl.character || !hand) {
      hand = pl.holdProp(want);
      lentTo = pl.character;
    }
    show(want);
    const pr = props[want];
    const pp = pl.position;
    // speed (for the pinwheel)
    const sp = Math.hypot(pp.x - lastPos.x, pp.z - lastPos.z) / Math.max(dt, 1e-3);
    lastPos.copy(pp);
    if (hand) { hand.updateWorldMatrix(true, false); hand.getWorldPosition(handW); }
    else handW.set(pp.x + Math.sin(pl.heading - 0.5) * 0.25, pp.y + 0.62, pp.z + Math.cos(pl.heading - 0.5) * 0.25);
    const o = pr.obj;
    if (pr.head) {
      // the umbrella's handle in the hand, the canopy over the head
      o.position.set(handW.x, handW.y + 0.12, handW.z);
      o.rotation.set(-0.12, pl.heading, -0.1);
    } else {
      o.position.copy(handW);
      o.rotation.set(0.15, pl.heading, 0);
    }
    if (pr.spin) {
      spin += dt * (1.5 + sp * 9) * (still ? 0.2 : 1);
      pr.spin.rotation.z = -spin;
    }
    if (pr.lit && pr.glow) {
      const n = safeNight(ctx);
      pr.lit.emissiveIntensity = n ? 1.1 + (still ? 0 : Math.sin(t * 9) * 0.06) : 0;
      pr.glow.visible = n;
    }
    if (pr.kite) {
      // the kite flies behind and above, drifting on the wind, pulled along on its string
      const h = pl.heading;
      const tx = pp.x - Math.sin(h) * 4 + (still ? 0 : Math.sin(t * 0.4) * 1.2);
      const ty = pp.y + 4.8 + (still ? 0 : Math.sin(t * 0.7) * 0.6);
      const tz = pp.z - Math.cos(h) * 4 + (still ? 0 : Math.cos(t * 0.33) * 1.2);
      if (!kiteInit) { kitePos.set(tx, ty, tz); kiteVel.set(0, 0, 0); kiteInit = true; }
      kiteVel.x += (tx - kitePos.x) * dt * 2.2; kiteVel.y += (ty - kitePos.y) * dt * 2.2; kiteVel.z += (tz - kitePos.z) * dt * 2.2;
      kiteVel.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      kitePos.addScaledVector(kiteVel, dt);
      kiteMesh.position.copy(kitePos);
      kiteMesh.lookAt(handW);
      kiteMesh.rotateX(-0.5);
      kiteMesh.rotateZ(still ? 0 : Math.sin(t * 1.3) * 0.18);
      strPos[0] = handW.x; strPos[1] = handW.y; strPos[2] = handW.z;
      strPos[3] = kitePos.x; strPos[4] = kitePos.y - 0.1; strPos[5] = kitePos.z;
      strGeo.attributes.position.needsUpdate = true;
    }
  });
});

function safeNight(ctx: WorldCtx): boolean {
  try { return ctx.sky.isNight(); } catch { return false; }
}
