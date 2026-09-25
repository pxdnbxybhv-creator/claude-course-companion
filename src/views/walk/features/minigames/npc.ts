// The people of the painting: small low-poly figures in the same toon washes and ink outline as the
// walker — a teahouse keeper, an old fisherman, a monk, a poet, a child with a kite. Each breathes,
// turns its head toward you when you come near, nods while talking and waves hello.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { Bag, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';

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
}

/** Build a figure and animate it (added to `parent` at (x, z) on the ground, facing `heading`). */
export function figure(bag: Bag, parent: T.Object3D, spec: FigureSpec, at: T.Vector3, heading: number): Figure {
  const ctx = bag.ctx;
  const { THREE, palette: P } = ctx;
  const S = spec.scale ?? 1;
  const skin = spec.skin ?? '#f0d9bf';
  const hair = spec.hair ?? '#23201d';
  const root = new THREE.Group();
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
  const fig: Figure = {
    root, head, armL, armR, hand: new THREE.Vector3(0, -0.37, 0.01), height: (1.24 - sitDrop) * S, talking: false,
    wave() { if (waveT < 0) rest.copy(armR.rotation); waveT = 0; },
    faceTo: null,
  };
  let nod = 0, yaw = 0;
  const seed = at.x * 1.7 + at.z * 0.3;
  bag.frame((dt, t) => {
    const p = ctx.player.position;
    const dx = p.x - root.position.x, dz = p.z - root.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 45) return; // far away: nothing to see
    // breathe
    body.scale.set(S, S * (1 + (still ? 0 : Math.sin(t * 1.6 + seed) * 0.012)), S);
    // turn the body toward whom they face, the head toward you when near
    if (fig.faceTo) {
      const want = Math.atan2(fig.faceTo.x - root.position.x, fig.faceTo.z - root.position.z);
      let dd = want - root.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      root.rotation.y += dd * Math.min(1, dt * 3);
    }
    let wantYaw = 0;
    if (d < 6) {
      let a = Math.atan2(dx, dz) - root.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      wantYaw = Math.max(-0.9, Math.min(0.9, a));
    }
    yaw += (wantYaw - yaw) * Math.min(1, dt * 4);
    head.rotation.y = yaw;
    nod = fig.talking && !still ? Math.sin(t * 7) * 0.06 : nod * 0.9;
    head.rotation.x = nod + (still ? 0 : Math.sin(t * 0.7 + seed) * 0.02);
    // a wave hello
    if (waveT >= 0) {
      waveT += dt;
      const k = Math.min(1, waveT / 1.6);
      const up = Math.sin(k * Math.PI);
      armR.rotation.z = rest.z + (-2.4 - rest.z) * up;
      armR.rotation.x = rest.x * (1 - up) + (still ? 0 : Math.sin(waveT * 12) * 0.25 * up);
      if (k >= 1) { waveT = -1; armR.rotation.copy(rest); }
    }
  });
  return fig;
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
  s.position.set(0, fig.height + 0.35, 0);
  bag.add(s, fig.root);
  let on = true;
  const still = reducedMotion();
  bag.frame((_dt, t) => {
    s.visible = on;
    if (on && !still) s.position.y = fig.height + 0.35 + Math.sin(t * 2.2) * 0.04;
  });
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
