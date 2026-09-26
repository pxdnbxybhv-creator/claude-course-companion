// The people of the painting: small low-poly figures in the same toon washes and ink outline as the
// walker — a teahouse keeper, an old fisherman, a monk, a poet, a child with a kite, a peddler, a
// storyteller… Each breathes, turns its head toward you when you come near, nods while talking and
// waves hello; they turn to listen and sway when someone plays ('banmu:music'), bow when a lord
// passes ('banmu:bow') and lean in to sniff when flowers burst open ('banmu:bloom').
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { XZ } from '../../map';
import { Bag, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { onSkillEvent } from '../npcs/events';
import { walkableNear } from './cat';

export type Hat = 'none' | 'bamboo' | 'cap' | 'bald' | 'buns' | 'scholar' | 'bun';

export interface FigureSpec {
  robe: string;
  trim: string;
  skin?: string;
  hair?: string;
  hat: Hat;
  hatColor?: string;
  beard?: string;
  /** An apron / straw cape over the robe. */
  apron?: string;
  cape?: string;
  /** Overall size (1 = the walker's size; a child ≈ 0.78). */
  scale?: number;
  sit?: boolean;
}

export interface Figure {
  root: T.Group;
  head: T.Group;
  armL: T.Group;
  armR: T.Group;
  /** Hand position (local to the right arm group) for props. */
  hand: T.Vector3;
  /** Height of the top of the head (m). */
  height: number;
  /** Set true while talking (nods); set `wave` to wave once. */
  talking: boolean;
  wave(): void;
  /** Face (turn the whole body) toward a point, smoothly. */
  faceTo: { x: number; z: number } | null;
  /** Walking (0 = still … 1 = a stride): the figure bobs and swings its arms; set by whoever moves it. */
  walking?: number;
  /** A reaction under way ('listen' | 'bow' | 'sniff'), if any. */
  readonly reacting?: string | null;
  /**
   * Take this figure away before its bag goes (a resident dismissed, a pet's owner leaving): stops its
   * animation, its skill listener, its speech mark and greeting, and removes and frees its meshes
   * (and whatever was hung on it). Safe to call more than once; the bag's own dispose still works.
   */
  dispose(): void;
  readonly disposed?: boolean;
}

/** Cleanups hung on a figure by speechMark() / greet(), run by its dispose(). */
const extras = new WeakMap<Figure, (() => void)[]>();
function onFigureGone(f: Figure, fn: () => void): void {
  const l = extras.get(f);
  if (l) l.push(fn); else extras.set(f, [fn]);
}

/** Build a figure and animate it (added to `parent` at (x, z) on the ground, facing `heading`). */
export function figure(bag: Bag, parent: T.Object3D, spec: FigureSpec, at: T.Vector3, heading: number): Figure {
  const ctx = bag.ctx;
  const { THREE, palette: P } = ctx;
  const S = spec.scale ?? 1;
  const skin = spec.skin ?? '#f0d9bf';
  const hair = spec.hair ?? '#23201d';
  const root = new THREE.Group();
  root.name = 'npc-figure';
  root.position.copy(at);
  root.rotation.y = heading;
  const body = new THREE.Group();
  body.scale.setScalar(S);
  root.add(body);
  const sitDrop = spec.sit ? 0.3 : 0;

  // robe (a bell of cloth), torso, sash, feet
  const robeLathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const parts: T.BufferGeometry[] = [
    part(THREE, robeLathe([[0, 0.02], [0.25, 0.02], [0.24, 0.1], [0.2, 0.34], [0.16, 0.56], [0.14, 0.62], [0, 0.62]]), spec.robe, { p: [0, sitDrop ? 0.16 : 0.08, 0], s: [1, spec.sit ? 0.55 : 1, 1] }),
    part(THREE, robeLathe([[0, 0], [0.145, 0], [0.155, 0.12], [0.14, 0.24], [0.08, 0.3], [0, 0.31]]), spec.robe, { p: [0, 0.66 - sitDrop, 0] }),
    part(THREE, new THREE.TorusGeometry(0.15, 0.028, 6, 16), spec.trim, { p: [0, 0.69 - sitDrop, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.TorusGeometry(0.24, 0.016, 5, 18), spec.trim, { p: [0, spec.sit ? 0.18 : 0.11, 0], r: [Math.PI / 2, 0, 0] }),
    // crossed collar
    part(THREE, new THREE.BoxGeometry(0.03, 0.2, 0.02), spec.trim, { p: [0.02, 0.87 - sitDrop, 0.125], r: [-0.35, 0, -0.62] }),
    part(THREE, new THREE.BoxGeometry(0.03, 0.14, 0.02), spec.trim, { p: [-0.035, 0.89 - sitDrop, 0.115], r: [-0.4, 0, 0.55] }),
  ];
  if (spec.sit) {
    // knees and feet forward, a little stool
    for (const sx of [-1, 1]) {
      parts.push(part(THREE, new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), spec.robe, { p: [0.09 * sx, 0.36, 0.14], r: [Math.PI / 2, 0, 0] }));
      parts.push(part(THREE, new THREE.SphereGeometry(0.06, 8, 6), hair, { p: [0.09 * sx, 0.06, 0.3], s: [1, 0.7, 1.5] }));
      parts.push(part(THREE, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), spec.robe, { p: [0.09 * sx, 0.2, 0.28] }));
    }
    parts.push(part(THREE, new THREE.CylinderGeometry(0.2, 0.18, 0.3, 10), '#8a6b4a', { p: [0, 0.15, -0.04] }));
  } else {
    for (const sx of [-1, 1]) parts.push(part(THREE, new THREE.SphereGeometry(0.06, 8, 6), hair, { p: [0.08 * sx, 0.04, 0.06], s: [1, 0.7, 1.6] }));
  }
  if (spec.apron) parts.push(part(THREE, new THREE.BoxGeometry(0.26, 0.42, 0.02), spec.apron, { p: [0, 0.48 - sitDrop, 0.2], r: [-0.18, 0, 0] }));
  if (spec.cape) parts.push(part(THREE, robeLathe([[0, 0.1], [0.3, 0.1], [0.27, 0.3], [0.2, 0.5], [0.12, 0.62], [0, 0.64]]), spec.cape, { p: [0, 0.4 - sitDrop * 0.7, -0.02], s: [1, 0.95, 0.95] }));
  const trunk = inked(ctx, merge(THREE, parts), { width: 0.012 });
  body.add(trunk);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.04 - sitDrop, 0);
  const hp: T.BufferGeometry[] = [
    part(THREE, new THREE.SphereGeometry(0.17, 16, 12), skin, { s: [1, 0.98, 0.95] }),
    part(THREE, new THREE.SphereGeometry(0.018, 6, 4), P.ink, { p: [-0.058, 0.0, 0.155] }),
    part(THREE, new THREE.SphereGeometry(0.018, 6, 4), P.ink, { p: [0.058, 0.0, 0.155] }),
    part(THREE, new THREE.SphereGeometry(0.03, 6, 4), '#e8a597', { p: [-0.095, -0.05, 0.13], s: [1, 0.55, 0.4] }),
    part(THREE, new THREE.SphereGeometry(0.03, 6, 4), '#e8a597', { p: [0.095, -0.05, 0.13], s: [1, 0.55, 0.4] }),
  ];
  const hc = spec.hatColor ?? hair;
  switch (spec.hat) {
    case 'bald': break;
    case 'bamboo': // 斗笠, a wide conical bamboo hat
      hp.push(part(THREE, new THREE.SphereGeometry(0.172, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, { p: [0, 0.01, -0.01] }));
      hp.push(part(THREE, new THREE.ConeGeometry(0.4, 0.2, 18, 1, true), hc, { p: [0, 0.17, 0] }));
      hp.push(part(THREE, new THREE.CylinderGeometry(0.4, 0.4, 0.012, 18), hc, { p: [0, 0.07, 0] }));
      break;
    case 'cap': // a small cloth cap
      hp.push(part(THREE, new THREE.SphereGeometry(0.178, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), hc, { p: [0, 0.02, -0.01] }));
      break;
    case 'scholar': // 幞头-like soft cap with two tails
      hp.push(part(THREE, new THREE.SphereGeometry(0.176, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, { p: [0, 0.01, -0.01] }));
      hp.push(part(THREE, new THREE.BoxGeometry(0.2, 0.14, 0.18), hc, { p: [0, 0.2, -0.02] }));
      hp.push(part(THREE, new THREE.BoxGeometry(0.3, 0.025, 0.04), hc, { p: [0, 0.2, -0.13], r: [0, 0, 0.1] }));
      break;
    case 'buns': // 双丫髻, a child's two buns
      hp.push(part(THREE, new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, { p: [0, 0.01, -0.01] }));
      hp.push(part(THREE, new THREE.SphereGeometry(0.07, 10, 8), hair, { p: [-0.12, 0.15, 0] }));
      hp.push(part(THREE, new THREE.SphereGeometry(0.07, 10, 8), hair, { p: [0.12, 0.15, 0] }));
      hp.push(part(THREE, new THREE.TorusGeometry(0.05, 0.012, 4, 10), P.cinnabar, { p: [-0.12, 0.12, 0], r: [Math.PI / 2, 0, 0] }));
      hp.push(part(THREE, new THREE.TorusGeometry(0.05, 0.012, 4, 10), P.cinnabar, { p: [0.12, 0.12, 0], r: [Math.PI / 2, 0, 0] }));
      break;
    case 'bun': // a topknot with a pin
      hp.push(part(THREE, new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, { p: [0, 0.01, -0.01] }));
      hp.push(part(THREE, new THREE.SphereGeometry(0.07, 10, 8), hair, { p: [0, 0.2, -0.03] }));
      hp.push(part(THREE, new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), P.gamboge, { p: [0, 0.21, -0.03], r: [0, 0, Math.PI / 2] }));
      break;
    default:
      hp.push(part(THREE, new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, { p: [0, 0.01, -0.01] }));
  }
  if (spec.beard) hp.push(part(THREE, new THREE.ConeGeometry(0.07, 0.2, 8), spec.beard, { p: [0, -0.2, 0.1], r: [Math.PI + 0.25, 0, 0] }));
  head.add(inked(ctx, merge(THREE, hp), { width: 0.01 }));
  body.add(head);

  // arms: wide sleeves on shoulder pivots, a small hand at the end
  const arm = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(0.15 * sx, 0.92 - sitDrop, 0);
    const geo = merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.045, 0.085, 0.34, 10), spec.robe, { p: [0, -0.17, 0] }),
      part(THREE, new THREE.TorusGeometry(0.083, 0.012, 4, 12), spec.trim, { p: [0, -0.335, 0], r: [Math.PI / 2, 0, 0] }),
      part(THREE, new THREE.SphereGeometry(0.04, 8, 6), skin, { p: [0, -0.37, 0.01] }),
    ]);
    g.add(inked(ctx, geo, { width: 0.01 }));
    g.rotation.z = 0.18 * sx;
    body.add(g);
    return g;
  };
  const armL = arm(1), armR = arm(-1);
  bag.add(root, parent);

  const still = reducedMotion();
  let waveT = -1;
  const rest = new THREE.Euler();
  // reactions to skills nearby: turn and sway to music, bow to a lord, lean in to sniff the flowers
  let react: 'listen' | 'bow' | 'sniff' | null = null, reactT = 0, reactDelay = 0;
  const src = { x: 0, z: 0 };
  let dead = false;
  const offs: (() => void)[] = [];
  const stop = () => { for (const o of offs.splice(0)) o(); };
  const fig: Figure = {
    root, head, armL, armR, hand: new THREE.Vector3(0, -0.37, 0.01), height: (1.24 - sitDrop) * S, talking: false,
    wave() { if (waveT < 0) rest.copy(armR.rotation); waveT = 0; },
    faceTo: null,
    walking: 0,
    get reacting() { return react; },
    get disposed() { return dead; },
    dispose() {
      if (dead) return;
      dead = true;
      stop();
      for (const fn of extras.get(fig)?.splice(0) ?? []) { try { fn(); } catch (e) { console.warn('[npc] dispose', e); } }
      if (!bag.disposed) bag.drop(root);
    },
  };
  bag.onDispose(() => { dead = true; stop(); });
  offs.push(onSkillEvent((e) => {
    const d = Math.hypot(e.x - root.position.x, e.z - root.position.z);
    const r = e.r ?? (e.kind === 'music' ? 16 : e.kind === 'bow' ? 11 : 9);
    if (d > r || !root.visible) return;
    react = e.kind === 'music' ? 'listen' : e.kind === 'bow' ? 'bow' : 'sniff';
    reactT = react === 'listen' ? 12 : react === 'bow' ? 2 : 3;
    reactDelay = d * 0.06;
    src.x = e.x; src.z = e.z;
  }));
  let nod = 0, yaw = 0, lean = 0, sway = 0, strode = false, turned = false, farLod = false;
  const hulls: T.Object3D[] = [];
  root.traverse((o) => { if (o.name === 'outline') hulls.push(o); });
  // where they looked before a reaction turned them (to turn back to)
  const restAt = { x: at.x + Math.sin(heading) * 4, z: at.z + Math.cos(heading) * 4 };
  const seed = at.x * 1.7 + at.z * 0.3;
  offs.push(ctx.onFrame((dt, t) => {
    const p = ctx.player.position;
    const dx = p.x - root.position.x, dz = p.z - root.position.z;
    const d = Math.hypot(dx, dz);
    // far off, the ink outlines go (four draws fewer); further still, nothing to animate
    const lod = d > 24;
    if (lod !== farLod) { farLod = lod; for (const h of hulls) h.visible = !lod; }
    if (d > 45) return; // far away: nothing to see
    if (react) {
      if (reactDelay > 0) reactDelay -= dt;
      else if ((reactT -= dt) <= 0) react = null;
    }
    const acting = react && reactDelay <= 0 ? react : null;
    // breathe (and bob along when walking)
    const w = fig.walking ?? 0;
    body.scale.set(S, S * (1 + (still ? 0 : Math.sin(t * 1.6 + seed) * 0.012)), S);
    body.position.y = still ? 0 : Math.abs(Math.sin(t * 5.6)) * 0.035 * w;
    // turn the body toward whom they face, the head toward you when near
    const face = acting ? src : fig.faceTo ?? (turned ? restAt : null);
    if (acting) turned = true;
    if (face) {
      const want = Math.atan2(face.x - root.position.x, face.z - root.position.z);
      let dd = want - root.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      root.rotation.y += dd * Math.min(1, dt * 3);
      if (face === restAt && Math.abs(dd) < 0.01) turned = false;
    }
    let wantYaw = 0;
    if (d < 6 && !acting) {
      let a = Math.atan2(dx, dz) - root.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      wantYaw = Math.max(-0.9, Math.min(0.9, a));
    }
    yaw += (wantYaw - yaw) * Math.min(1, dt * 4);
    head.rotation.y = yaw;
    nod = fig.talking && !still ? Math.sin(t * 7) * 0.06 : nod * 0.9;
    const k = still ? 0 : 1;
    const wantLean = acting === 'bow' ? 0.55 * Math.min(1, reactT / 0.5) : acting === 'sniff' ? 0.2 : 0;
    lean += (wantLean - lean) * Math.min(1, dt * 6);
    body.rotation.x = lean;
    const wantSway = acting === 'listen' ? Math.sin(t * 1.9 + seed) * 0.08 * k : 0;
    sway += (wantSway - sway) * Math.min(1, dt * 4);
    body.rotation.z = sway;
    head.rotation.x = nod + (still ? 0 : Math.sin(t * 0.7 + seed) * 0.02) + (acting === 'sniff' ? 0.22 : acting === 'listen' ? -0.06 : 0);
    // arms swing when walking; a raised hand to the nose when sniffing
    // (only for figures that walk: the others keep the poses their feature gave their arms)
    if (waveT < 0 && w > 0.01 && !fig.talking) {
      const sw = Math.sin(t * 5.6) * 0.35 * w * k;
      armL.rotation.x = sw; armR.rotation.x = -sw;
      strode = true;
    } else if (strode && waveT < 0) {
      armL.rotation.x *= 0.85; armR.rotation.x *= 0.85;
      if (Math.abs(armL.rotation.x) < 0.002) { armL.rotation.x = armR.rotation.x = 0; strode = false; }
    }
    // a wave hello
    if (waveT >= 0) {
      waveT += dt;
      const k = Math.min(1, waveT / 1.6);
      const up = Math.sin(k * Math.PI);
      armR.rotation.z = rest.z + (-2.4 - rest.z) * up;
      armR.rotation.x = rest.x * (1 - up) + (still ? 0 : Math.sin(waveT * 12) * 0.25 * up);
      if (k >= 1) { waveT = -1; armR.rotation.copy(rest); }
    }
  }));
  return fig;
}

/** A place near an anchor on open ground, and the heading that looks at `look`. */
export function stand(ctx: WorldCtx, a: XZ, dx: number, dz: number, look: XZ): { at: T.Vector3; heading: number } {
  const p = walkableNear(ctx, a.x + dx, a.z + dz, 5);
  return { at: new ctx.THREE.Vector3(p.x, ctx.groundY(p.x, p.z), p.z), heading: Math.atan2(look.x - p.x, look.z - p.z) };
}

/** A standing NPC by an anchor, solid (a collider), facing a point. */
export function person(bag: Bag, ctx: WorldCtx, parent: T.Object3D, spec: FigureSpec, a: XZ, dx: number, dz: number, look: XZ, solid = true): Figure {
  const s = stand(ctx, a, dx, dz, look);
  const f = figure(bag, parent, spec, s.at, s.heading);
  if (solid) bag.onDispose(ctx.addCollider({ x: s.at.x, z: s.at.z, r: 0.35, h: 1.3 }));
  return f;
}

/** A spot in front of someone for the talk prompt. */
export function front(f: Figure, d = 0.9): T.Vector3 {
  const r = f.root;
  return r.position.clone().set(r.position.x + Math.sin(r.rotation.y) * d, r.position.y, r.position.z + Math.cos(r.rotation.y) * d);
}

/** Wave once when the walker first comes near. */
export function greet(bag: Bag, ctx: WorldCtx, f: Figure, r = 5): void {
  let near = false;
  const off = ctx.onFrame(() => {
    const d = Math.hypot(ctx.player.position.x - f.root.position.x, ctx.player.position.z - f.root.position.z);
    if (d < r && !near) { near = true; f.wave(); }
    else if (d > r + 4) near = false;
  });
  bag.onDispose(off);
  onFigureGone(f, off);
}

/** A floating ink mark over someone with something to say (a brushed glyph on a paper disc). */
export function speechMark(bag: Bag, fig: Figure, glyph: string): { set(on: boolean): void } {
  const { THREE } = bag.ctx;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(244,238,226,0.95)';
  g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(27,25,22,0.6)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#b93a2b';
  g.font = '56px "Ma Shan Zheng", "LXGW WenKai", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(glyph, 48, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(0.32, 0.32, 1);
  s.name = 'npc-mark';
  s.position.set(0, fig.height + 0.35, 0);
  bag.add(s, fig.root);
  let on = true;
  const still = reducedMotion();
  const w = new THREE.Vector3();
  const off = bag.ctx.onFrame((_dt, t) => {
    fig.root.getWorldPosition(w);
    const p = bag.ctx.player.position;
    s.visible = on && Math.hypot(p.x - w.x, p.z - w.z) < 32;
    if (on && !still) s.position.y = fig.height + 0.35 + Math.sin(t * 2.2) * 0.04;
  });
  bag.onDispose(off);
  // the figure going takes its mark along (its sprite, texture and animation)
  onFigureGone(fig, () => { off(); if (!bag.disposed) bag.drop(s); });
  return { set(v) { on = v; } };
}

/** A few lines in a row from an NPC (each waits for a tap); resolves with the last choice. */
export async function talk(ctx: WorldCtx, fig: Figure | null, name: { zh: string; en: string }, lines: { zh: string; en: string; choices?: { zh: string; en: string }[] }[]): Promise<number> {
  let last = -1;
  if (fig) { fig.talking = true; fig.faceTo = { x: ctx.player.position.x, z: ctx.player.position.z }; }
  try {
    for (const l of lines) last = await ctx.hud.say({ nameZh: name.zh, nameEn: name.en, zh: l.zh, en: l.en, choices: l.choices });
  } finally {
    if (fig) fig.talking = false;
  }
  return last;
}
