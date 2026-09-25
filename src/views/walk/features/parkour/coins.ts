// 铜钱: bronze coins with square holes, spinning above the high and hidden places. One instanced
// mesh (and its ink outline) for every coin in the world, one Points cloud for their glints. Walk or
// jump into one: a ting, a flare, coins in the purse (earn), and it is gone for the rest of the day.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { earn, record } from '../../../../app/play';
import { type Bag, glowTexture, outlineMat, reducedMotion } from '../kit';
import type { Challenge } from './logic';
import * as snd from './sound';

export interface CoinSpot {
  id: string;
  /** Which place it belongs to (spots are shared out between places each day). */
  region: string;
  x: number;
  z: number;
  /** Height above the surface under (x, z) — a prop's top, a deck, the ground (default 0.6). */
  lift?: number;
  /** Or: height above the surface at another point (a coin hung out over a drop). */
  from?: [number, number];
  /** Coins it holds (1–5). */
  value: number;
  challenge?: Challenge;
}

interface Live {
  spot: CoinSpot;
  x: number; y: number; z: number;
  /** 0 while waiting; counts up through the pick-up flight. */
  gone: number;
  got: boolean;
  phase: number;
  hinted: boolean;
}

/** Who can reach what: named in the hint when you stand under a challenge coin. */
const HINT: Record<Challenge, { zh: string; en: string }> = {
  high: { zh: '铜钱悬得太高——道童、大橘跳得高；侠客的「技」可二段跳。', en: 'Too high to reach — the Taoist Child and Big Ginger jump higher; the Swordsman\'s skill gives a double jump.' },
  double: { zh: '要跳两次才够得着——侠客的「技」可在空中再跃一次。', en: 'It takes two jumps — the Swordsman\'s skill lets you leap again in mid-air.' },
  glide: { zh: '铜钱悬在半空——玉兔会缓缓飘落；嫦娥的「技」能凌空。', en: 'It hangs out over the drop — the Jade Rabbit floats down slowly; Chang\'e\'s skill lets you hover.' },
};

const R = 0.2;
const FLY = 0.55;

export class CoinField {
  private live: Live[] = [];
  private mesh: T.InstancedMesh;
  private hull: T.InstancedMesh;
  private glints: T.Points;
  private glintCol: T.BufferAttribute;
  private glintPos: T.BufferAttribute;
  private m: T.Matrix4;
  private q: T.Quaternion;
  private v: T.Vector3;
  private s: T.Vector3;
  private up: T.Vector3;
  private reduced = reducedMotion();
  private shownHint = 0;
  /** Called when a coin is picked up (the caller remembers it for the day). */
  onPick: ((spot: CoinSpot, left: number) => void) | null = null;

  constructor(bag: Bag, private ctx: WorldCtx, spots: CoinSpot[], taken: ReadonlySet<string>) {
    const { THREE } = ctx;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    for (const spot of spots) {
      const [fx, fz] = spot.from ?? [spot.x, spot.z];
      const y = ctx.groundY(fx, fz) + (spot.lift ?? 0.6);
      this.live.push({ spot, x: spot.x, y, z: spot.z, gone: 0, got: taken.has(spot.id), phase: (spot.x * 0.37 + spot.z * 0.61) % (Math.PI * 2), hinted: false });
    }
    const n = Math.max(1, this.live.length);

    // a coin: a disc with a square hole, a raised rim, standing upright (faces ±z), spinning about y
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    const h = 0.055;
    hole.moveTo(-h, -h); hole.lineTo(-h, h); hole.lineTo(h, h); hole.lineTo(h, -h); hole.lineTo(-h, -h);
    shape.holes.push(hole);
    const geo = bag.own(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 18 }));
    geo.translate(0, 0, -0.015);
    geo.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ color: '#ffffff', emissive: new THREE.Color('#6b4712'), emissiveIntensity: 0.55 });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.hull = new THREE.InstancedMesh(geo, outlineMat(ctx, 0.012), n);
    this.mesh.name = 'parkour-coins';
    this.hull.name = 'outline';
    for (const im of [this.mesh, this.hull]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
    }
    const bronze = new THREE.Color('#c98f3c'), gold = new THREE.Color('#f0bf4c');
    this.live.forEach((c, i) => this.mesh.setColorAt(i, c.spot.challenge || c.spot.value >= 3 ? gold : bronze));
    this.mesh.add(this.hull);
    bag.add(this.mesh);

    // glints: one soft star per coin, twinkling
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const pg = new THREE.BufferGeometry();
    this.glintPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.glintCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('position', this.glintPos);
    pg.setAttribute('color', this.glintCol);
    const pm = new THREE.PointsMaterial({ size: 0.95, map: bag.own(glowTexture(THREE, 64, 0.08)), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    this.glints = new THREE.Points(pg, pm);
    this.glints.frustumCulled = false;
    this.glints.renderOrder = 3;
    bag.add(this.glints);
    this.update(0, 0);
  }

  /** Coins still waiting today. */
  get left(): number {
    return this.live.filter((c) => !c.got).length;
  }
  get total(): number {
    return this.live.length;
  }

  update(dt: number, t: number): void {
    const P = this.ctx.player;
    const px = P.position.x, py = P.position.y, pz = P.position.z;
    const cam = this.ctx.camera.position;
    const spin = this.reduced ? 0.8 : 2.4;
    const pos = this.glintPos.array as Float32Array, col = this.glintCol.array as Float32Array;
    const night = this.ctx.sky.isNight();
    for (let i = 0; i < this.live.length; i++) {
      const c = this.live[i];
      let scale = 1, y = c.y + Math.sin(t * 1.6 + c.phase) * (this.reduced ? 0.02 : 0.07), ang = t * spin + c.phase;
      let glow = 0;
      if (c.got && c.gone === 0) scale = 0;
      else if (c.gone > 0) {
        c.gone += dt;
        const u = Math.min(1, c.gone / FLY);
        y += u * 0.9;
        ang += u * 14;
        scale = u < 0.6 ? 1 + u * 0.6 : (1 - u) * 4;
        glow = (1 - u) * 1.6;
        if (u >= 1) c.gone = -1;
      } else if (c.gone < 0) scale = 0;
      else {
        // far away: not drawn at all
        const dxc = c.x - cam.x, dzc = c.z - cam.z;
        if (dxc * dxc + dzc * dzc > 75 * 75) scale = 0;
        // pick-up: the body (feet to head) passes through the coin
        const dx = c.x - px, dz = c.z - pz, dy = c.y - py;
        if (!P.isFrozen && dx * dx + dz * dz < 0.7 * 0.7 && dy > -0.3 && dy < 1.4) this.pick(c);
        else if (c.spot.challenge && !c.hinted && dx * dx + dz * dz < 4.5 * 4.5 && dy > 1.4 && dy < 6) this.hint(c, t);
        const tw = Math.pow(Math.max(0, Math.sin(t * 2.1 + c.phase * 3)), 8);
        glow = scale ? 0.35 + tw * 0.9 + (night ? 0.25 : 0) : 0;
      }
      this.q.setFromAxisAngle(this.up, ang);
      this.v.set(c.x, y, c.z);
      const k = Math.max(0, scale) * (c.spot.challenge ? 1.25 : c.spot.value >= 3 ? 1.12 : 1);
      this.s.set(k, k, k);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.hull.setMatrixAt(i, this.m);
      pos[i * 3] = c.x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = c.z;
      col[i * 3] = glow; col[i * 3 + 1] = glow * 0.86; col[i * 3 + 2] = glow * 0.55;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.hull.instanceMatrix.needsUpdate = true;
    this.glintPos.needsUpdate = true;
    this.glintCol.needsUpdate = true;
  }

  private pick(c: Live): void {
    c.got = true;
    c.gone = 1e-4;
    const v = c.spot.value;
    earn(v);
    record('coinspot');
    snd.coin(this.ctx.audio, v >= 3 ? 3 : v);
    const left = this.left;
    const feat = !!c.spot.challenge;
    this.ctx.hud.toast(`铜钱 +${v}${feat ? '（绝技）' : ''} · 今日尚余 ${left}`, `+${v} coin${v > 1 ? 's' : ''}${feat ? ' (a feat)' : ''} · ${left} left today`, 1700);
    this.onPick?.(c.spot, left);
  }

  private hint(c: Live, t: number): void {
    c.hinted = true;
    if (t - this.shownHint < 12) return;
    this.shownHint = t;
    const h = HINT[c.spot.challenge!];
    this.ctx.hud.toast(h.zh, h.en, 4200);
  }

  /** Forget the coins (the Bag frees the meshes). */
  dispose(): void {
    this.live.length = 0;
    this.onPick = null;
  }
}
