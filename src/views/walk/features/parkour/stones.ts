// 汀步 · stepping stones across the river between the bamboo grove and the water town: jump stone
// to stone; miss one and you go in with a splash, and wade back to the bank you started from.
// A shallow, hidden deck under the water along the crossing lets a jump carry you over the river
// (the walker never leaves land otherwise) and catches you when you fall in.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { registerDeck } from '../../regions/water-decks';
import { type Bag, reducedMotion } from '../kit';
import { Builder } from './build';
import type { CoinSpot } from './coins';
import { inRect, stoneLine } from './logic';
import * as snd from './sound';

interface Crossing {
  id: string;
  region: string;
  /** Two points on dry land either side, the crossing runs between them. */
  a: { x: number; z: number };
  b: { x: number; z: number };
  seed: number;
}

const CROSSINGS: Crossing[] = [
  { id: 'r-west', region: 'village', a: { x: -55.6, z: 66.8 }, b: { x: -54.4, z: 82.4 }, seed: 17 },
];

/** Builds the crossings; returns their coin spots. */
export function buildStones(bag: Bag, ctx: WorldCtx): CoinSpot[] {
  const coins: CoinSpot[] = [];
  for (const c of CROSSINGS) {
    try { coins.push(...crossing(bag, ctx, c)); } catch (e) { console.warn('[parkour] crossing', c.id, e); }
  }
  return coins;
}

function crossing(bag: Bag, ctx: WorldCtx, c: Crossing): CoinSpot[] {
  const { THREE } = ctx;
  const L = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z);
  const ux = (c.b.x - c.a.x) / L, uz = (c.b.z - c.a.z) / L;
  // where the water begins and ends along the line
  let t0 = -1, t1 = -1, wy = 0;
  for (let s = 0; s <= L; s += 0.2) {
    const w = ctx.waterAt(c.a.x + ux * s, c.a.z + uz * s);
    if (w !== null) { if (t0 < 0) t0 = s; t1 = s; wy = w; }
  }
  if (t0 < 0 || t1 - t0 < 2) return [];
  const pIn = { x: c.a.x + ux * (t0 - 0.2), z: c.a.z + uz * (t0 - 0.2) };
  const pOut = { x: c.a.x + ux * (t1 + 0.2), z: c.a.z + uz * (t1 + 0.2) };
  const span = t1 - t0 + 0.4;
  const n = Math.max(2, Math.round(span / 1.35));
  const stones = stoneLine(pIn, pOut, n, 0.35, c.seed);
  const b = new Builder(ctx, c.id, wy);
  stones.forEach((p, i) => b.add({ kind: 'stone', x: p.x, z: p.z, h: 0.26 + (i % 3 === 1 ? 0.06 : 0), r: 0.46 + (i % 2) * 0.05, seed: c.seed * 10 + i }));
  // a flat step on each bank: the way on, and where a fall sets you back
  const bankA = { x: pIn.x - ux * 0.9, z: pIn.z - uz * 0.9 };
  const bankB = { x: pOut.x + ux * 0.9, z: pOut.z + uz * 0.9 };
  const gA = ctx.groundY(bankA.x, bankA.z), gB = ctx.groundY(bankB.x, bankB.z);
  b.add({ kind: 'slab', x: bankA.x, z: bankA.z, h: gA - wy + 0.1, w: 1.2, d: 0.9, ry: Math.atan2(uz, ux) });
  b.add({ kind: 'slab', x: bankB.x, z: bankB.z, h: gB - wy + 0.1, w: 1.2, d: 0.9, ry: Math.atan2(uz, ux) });
  // a boulder on the far bank with a coin on it
  const rockAt = { x: bankB.x + ux * 1.6 - uz * 1.5, z: bankB.z + uz * 1.6 + ux * 1.5 };
  b.add({ kind: 'stone', x: rockAt.x, z: rockAt.z, h: ctx.groundY(rockAt.x, rockAt.z) - wy + 0.6, r: 0.6 });
  b.finish(bag, ctx.scene);

  // the hidden floor of the river along the crossing
  const cx = (pIn.x + pOut.x) / 2, cz = (pIn.z + pOut.z) / 2;
  const hl = span / 2, hw = 1.6;
  const floorY = wy - 0.45;
  bag.onDispose(registerDeck({ id: `parkour:${c.id}:river`, cx, cz, ax: ux, az: uz, hl, hw, y: () => floorY }));

  // falling in: a splash ring, and back to the bank after a moment
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f4efe4', transparent: true, opacity: 0, depthWrite: false }));
  ring.visible = false;
  bag.add(ring);
  const reduced = reducedMotion();
  const P = ctx.player;
  let lastBank = bankA;
  let back = 0;
  let splashT = -1;
  const head = (to: { x: number; z: number }) => Math.atan2(to.x - lastBank.x, to.z - lastBank.z);
  bag.frame((dt, t) => {
    const p = P.position;
    if (Math.abs(p.x - cx) > hl + 4 || Math.abs(p.z - cz) > hl + 4) { if (splashT >= 0) { ring.visible = false; splashT = -1; } return; }
    // remember which bank you set out from
    if (Math.hypot(p.x - bankA.x, p.z - bankA.z) < 1.4) lastBank = bankA;
    else if (Math.hypot(p.x - bankB.x, p.z - bankB.z) < 1.4) lastBank = bankB;
    if (back && t >= back) {
      back = 0;
      const other = lastBank === bankA ? bankB : bankA;
      P.teleport(lastBank.x, lastBank.z, head(other));
    }
    if (!back && P.grounded && !P.isFrozen && p.y < wy - 0.12 && inRect(p.x, p.z, cx, cz, ux, uz, hl, hw)) {
      back = t + (reduced ? 0.25 : 0.6);
      splashT = 0;
      ring.position.set(p.x, wy + 0.03, p.z);
      ring.visible = true;
      snd.splash(ctx.audio);
      ctx.hud.toast('扑通！落水了——回岸边再来', 'Splash! In the river — back to the bank', 1800);
    }
    if (splashT >= 0) {
      splashT += dt;
      const u = splashT / 0.9;
      const k = 1 + u * (reduced ? 1.5 : 4);
      ring.scale.set(k, 1, k);
      (ring.material as T.MeshBasicMaterial).opacity = Math.max(0, 0.75 * (1 - u));
      if (u >= 1) { ring.visible = false; splashT = -1; }
    }
  });

  const s1 = stones[Math.floor(n / 4)], s2 = stones[Math.floor(n / 2)], s3 = stones[Math.floor((3 * n) / 4)];
  return [
    { id: `${c.id}-s1`, region: c.region, x: s1.x, z: s1.z, value: 1 },
    { id: `${c.id}-s2`, region: c.region, x: s2.x, z: s2.z, value: 1 },
    { id: `${c.id}-s3`, region: c.region, x: s3.x, z: s3.z, value: 1 },
    { id: `${c.id}-rock`, region: c.region, x: rockAt.x, z: rockAt.z, value: 2 },
  ] as CoinSpot[];
}
